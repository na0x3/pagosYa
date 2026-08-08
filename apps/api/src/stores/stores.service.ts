import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentIntentStatus, PaymentLinkStatus, StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { UploadsService } from "../uploads/uploads.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly uploads: UploadsService,
  ) {}

  /** A merchant can run several independent stores under one account — each gets its own slug/branding/catalog. */
  async create(merchantId: string, dto: CreateStoreDto) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.store.create({
          data: {
            merchantId,
            slug: slugPart(),
            name: dto.name,
            tagline: dto.tagline,
            logoUrl: dto.logoUrl,
            bannerUrl: dto.bannerUrl,
            backgroundColor: dto.backgroundColor,
            backgroundImageUrl: dto.backgroundImageUrl,
            contactPhone: dto.contactPhone,
            contactEmail: dto.contactEmail,
            aboutText: dto.aboutText,
            accentColor: dto.accentColor,
            buttonStyle: dto.buttonStyle,
            announcement: dto.announcement,
          },
        });
      } catch (err) {
        const isUniqueSlugClash = (err as { code?: string })?.code === "P2002";
        if (!isUniqueSlugClash || attempt === 4) throw err;
      }
    }
    throw new Error("unreachable");
  }

  async listForMerchant(merchantId: string) {
    return this.prisma.store.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
      // Links ride along so the dashboard's store editor can populate its
      // link rows without a second request per store.
      include: { links: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async update(merchantId: string, id: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return this.prisma.store.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.tagline !== undefined && { tagline: dto.tagline }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(dto.backgroundColor !== undefined && { backgroundColor: dto.backgroundColor }),
        ...(dto.backgroundImageUrl !== undefined && { backgroundImageUrl: dto.backgroundImageUrl }),
        ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
        ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
        ...(dto.aboutText !== undefined && { aboutText: dto.aboutText }),
        ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
        ...(dto.buttonStyle !== undefined && { buttonStyle: dto.buttonStyle }),
        ...(dto.announcement !== undefined && { announcement: dto.announcement }),
      },
    });
  }

  /** Replaces the store's whole link-button list (order in the array = display order). */
  async setLinks(merchantId: string, id: string, dto: SetStoreLinksDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    await this.prisma.$transaction([
      this.prisma.storeLink.deleteMany({ where: { storeId: id } }),
      this.prisma.storeLink.createMany({
        data: dto.links.map((link, index) => ({ storeId: id, label: link.label, url: link.url, sortOrder: index })),
      }),
    ]);
    return this.prisma.storeLink.findMany({ where: { storeId: id }, orderBy: { sortOrder: "asc" } });
  }

  async archive(merchantId: string, id: string) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return this.prisma.store.update({ where: { id }, data: { status: StoreStatus.ARCHIVED } });
  }

  /** Hard delete — unlike archive(), this is not reversible, and cascades to every
   * product in the store (schema-level ON DELETE CASCADE, since a product is
   * meaningless without the store it belongs to). PaymentIntents from past checkouts
   * are untouched — they reference their cart lines by value (JSON metadata snapshot),
   * not a live FK to the store or its products, and are the merchant's financial
   * record/ledger/audit trail, not this store's inventory — deleting a store must
   * never touch past payments, transactions, or invoices. */
  async remove(merchantId: string, id: string) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");

    // Cascade deletes the DB rows (Category, PaymentLink), but not the actual
    // photo files those rows pointed at — gather every url this store owns
    // before the rows disappear, then clean them off disk once they're gone.
    const links = await this.prisma.paymentLink.findMany({ where: { storeId: id }, select: { imageUrls: true } });
    const fileUrls = [store.logoUrl, store.bannerUrl, store.backgroundImageUrl, ...links.flatMap((l) => l.imageUrls)];

    await this.prisma.store.delete({ where: { id } });
    await this.uploads.deleteFiles(fileUrls);
    return { success: true };
  }

  /**
   * Public — no auth, no ownership check. Message is Spanish (unlike the
   * merchant-facing NotFoundExceptions elsewhere in this file) because it's
   * shown verbatim in the customer-facing checkout page, not a dashboard
   * error toast.
   */
  async findActiveBySlugPublic(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store || store.status !== StoreStatus.ACTIVE) throw new NotFoundException("Esta tienda ya no está disponible");
    return store;
  }

  /** Public — no auth, called by the checkout page's landing view before any payment exists. */
  async getStorePublic(slug: string) {
    const store = await this.findActiveBySlugPublic(slug);
    // Not deduplicated per visitor/session — a simple "is anyone looking at
    // this store" counter for the merchant's Finanzas view, not real
    // analytics. Every call here is a genuine page load, never a poll.
    const [items, categories, links, cartIntents] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.category.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeLink.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      // Per-product sold counts feed the storefront's "Más vendidos" sort.
      // Same source of truth as the Finanzas top-products list: cart lines in
      // succeeded store-checkout intents (metadata.storeId scopes them to this
      // store; API-created intents have no cart and correctly count nothing).
      this.prisma.paymentIntent.findMany({
        where: {
          merchantId: store.merchantId,
          status: PaymentIntentStatus.SUCCEEDED,
          metadata: { path: ["storeId"], equals: store.id },
        },
        select: { metadata: true },
      }),
      this.prisma.store.update({ where: { id: store.id }, data: { viewCount: { increment: 1 } } }),
    ]);

    const soldByProduct = new Map<string, number>();
    for (const intent of cartIntents) {
      const cart = (intent.metadata as { cart?: { paymentLinkId: string; quantity: number }[] } | null)?.cart;
      for (const line of cart ?? []) {
        soldByProduct.set(line.paymentLinkId, (soldByProduct.get(line.paymentLinkId) ?? 0) + line.quantity);
      }
    }

    return {
      storeId: store.id,
      storeName: store.name,
      tagline: store.tagline,
      logoUrl: store.logoUrl,
      bannerUrl: store.bannerUrl,
      backgroundColor: store.backgroundColor,
      backgroundImageUrl: store.backgroundImageUrl,
      contactPhone: store.contactPhone,
      contactEmail: store.contactEmail,
      aboutText: store.aboutText,
      accentColor: store.accentColor,
      buttonStyle: store.buttonStyle,
      announcement: store.announcement,
      links: links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      items: items.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        imageUrls: item.imageUrls,
        tags: item.tags,
        // null = unlimited/not tracked; 0 means genuinely sold out, both are
        // meaningfully different from "in stock" and the storefront needs to
        // tell them apart.
        stock: item.stock,
        color: item.color,
        amount: item.amount,
        currency: item.currency,
        soldCount: soldByProduct.get(item.id) ?? 0,
      })),
    };
  }

  /** Public — turns a cart (one or more items, from the same store as `slug`) into a
   * single PaymentIntent, i.e. one payment/one QR for the whole cart. */
  async createCartCheckout(slug: string, dto: CartCheckoutDto) {
    const store = await this.findActiveBySlugPublic(slug);
    const merchant = await this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } });

    const quantityByLinkId = new Map<string, number>();
    for (const item of dto.items) {
      quantityByLinkId.set(item.paymentLinkId, (quantityByLinkId.get(item.paymentLinkId) ?? 0) + item.quantity);
    }

    const links = await this.prisma.paymentLink.findMany({
      where: { id: { in: [...quantityByLinkId.keys()] }, storeId: store.id, status: PaymentLinkStatus.ACTIVE },
    });
    if (links.length !== quantityByLinkId.size) {
      throw new BadRequestException("Uno o más productos del carrito ya no están disponibles");
    }

    const currency = links[0].currency;
    if (links.some((l) => l.currency !== currency)) {
      throw new BadRequestException("Todos los productos del carrito deben usar la misma moneda");
    }

    // Soft check here (a real reservation would need a lock) — the hard
    // guarantee against overselling is the atomic decrement on payment
    // success (see PaymentIntentsService.applyRailResult), which never lets
    // stock go negative even if two carts race past this check.
    for (const l of links) {
      const requested = quantityByLinkId.get(l.id)!;
      if (l.stock !== null && l.stock < requested) {
        throw new BadRequestException(`Solo quedan ${l.stock} unidades de "${l.name}"`);
      }
    }

    let amount = 0;
    const cartLines: { paymentLinkId: string; name: string; quantity: number; unitAmount: number }[] = [];
    for (const l of links) {
      const quantity = quantityByLinkId.get(l.id)!;
      amount += l.amount * quantity;
      cartLines.push({ paymentLinkId: l.id, name: l.name, quantity, unitAmount: l.amount });
    }

    let description = cartLines.map((line) => `${line.name} x${line.quantity}`).join(", ");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
    }

    const livemode = merchant.status === MerchantStatus.ACTIVE;
    const intent = await this.paymentIntents.create(store.merchantId, livemode, {
      amount,
      currency,
      description,
      metadata: { cart: cartLines, storeId: store.id },
    });

    return {
      ...intent,
      storeName: store.name,
      cartDescription: description,
      contactPhone: store.contactPhone,
      contactEmail: store.contactEmail,
    };
  }
}
