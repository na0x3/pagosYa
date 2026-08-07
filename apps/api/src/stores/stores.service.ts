import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentLinkStatus, StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
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
            logoUrl: dto.logoUrl,
            backgroundColor: dto.backgroundColor,
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
    return this.prisma.store.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } });
  }

  async update(merchantId: string, id: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return this.prisma.store.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.backgroundColor !== undefined && { backgroundColor: dto.backgroundColor }),
      },
    });
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
   * not a live FK to the store or its products. */
  async remove(merchantId: string, id: string) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    await this.prisma.store.delete({ where: { id } });
    return { success: true };
  }

  /** Used by both the dashboard (ownership-checked elsewhere) and the public storefront. */
  async findActiveBySlugPublic(slug: string) {
    const store = await this.prisma.store.findUnique({ where: { slug } });
    if (!store || store.status !== StoreStatus.ACTIVE) throw new NotFoundException("Store not found");
    return store;
  }

  /** Public — no auth, called by the checkout page's landing view before any payment exists. */
  async getStorePublic(slug: string) {
    const store = await this.findActiveBySlugPublic(slug);
    const items = await this.prisma.paymentLink.findMany({
      where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
      orderBy: { createdAt: "asc" },
    });
    return {
      storeId: store.id,
      storeName: store.name,
      logoUrl: store.logoUrl,
      backgroundColor: store.backgroundColor,
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        imageUrl: item.imageUrl,
        color: item.color,
        amount: item.amount,
        currency: item.currency,
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

    return { ...intent, storeName: store.name, cartDescription: description };
  }
}
