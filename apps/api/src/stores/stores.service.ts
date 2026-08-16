import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentLinkStatus, Prisma, StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { UploadsService } from "../uploads/uploads.service";
import { CreateStoreDto, STORE_CONTENT_SECTIONS } from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";
import { SaveStoreSettingsDto } from "./dto/save-store-settings.dto";
import { SubmitStoreLeadDto } from "./dto/submit-store-lead.dto";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;
type ProductVariant = { id: string; name: string; amount: number; stock?: number | null };
type ProductExtra = {
  id: string;
  name: string;
  amount: number;
  required: boolean;
  groupName?: string;
  freeAllowance?: number;
  inventoryKey?: string;
  inventoryName?: string;
  stock?: number;
};
type StoreHeroSlide = { imageUrl: string; title?: string; body?: string; ctaLabel?: string; ctaUrl?: string };
type StoreContentSection = (typeof STORE_CONTENT_SECTIONS)[number];
type StoreEditorialImage = { imageUrl: string; title?: string; caption?: string; body?: string; boxColor?: string };

function readStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readProductVariants(value: Prisma.JsonValue): ProductVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ProductVariant =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      (!("stock" in entry) ||
        (entry as Record<string, unknown>).stock === null ||
        (Number.isInteger((entry as Record<string, unknown>).stock) &&
          ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

function readProductExtras(value: Prisma.JsonValue): ProductExtra[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ProductExtra =>
      !!entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).id === "string" &&
      typeof (entry as Record<string, unknown>).name === "string" &&
      Number.isInteger((entry as Record<string, unknown>).amount) &&
      ((entry as Record<string, unknown>).amount as number) >= 0 &&
      typeof (entry as Record<string, unknown>).required === "boolean" &&
      (!("groupName" in entry) || typeof (entry as Record<string, unknown>).groupName === "string") &&
      (!("freeAllowance" in entry) || (Number.isInteger((entry as Record<string, unknown>).freeAllowance) && ((entry as Record<string, unknown>).freeAllowance as number) >= 0)) &&
      (!("inventoryKey" in entry) || typeof (entry as Record<string, unknown>).inventoryKey === "string") &&
      (!("inventoryName" in entry) || typeof (entry as Record<string, unknown>).inventoryName === "string") &&
      (!("stock" in entry) || (Number.isInteger((entry as Record<string, unknown>).stock) && ((entry as Record<string, unknown>).stock as number) >= 0)),
  );
}

function selectedExtrasAmount(extras: ProductExtra[]): number {
  const usedByGroup = new Map<string, number>();
  return extras.reduce((sum, extra) => {
    if (!extra.groupName) return sum + extra.amount;
    const key = extra.groupName.normalize("NFKC").toLocaleLowerCase("es");
    const used = usedByGroup.get(key) ?? 0;
    usedByGroup.set(key, used + 1);
    return sum + (used < (extra.freeAllowance ?? 0) ? 0 : extra.amount);
  }, 0);
}

function readStoreHeroSlides(value: Prisma.JsonValue): StoreHeroSlide[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string",
    )
    .slice(0, 5)
    .map((entry) => ({
      imageUrl: entry.imageUrl as string,
      ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
      ...(typeof entry.body === "string" && entry.body ? { body: entry.body } : {}),
      ...(typeof entry.ctaLabel === "string" && entry.ctaLabel ? { ctaLabel: entry.ctaLabel } : {}),
      ...(typeof entry.ctaUrl === "string" && entry.ctaUrl ? { ctaUrl: entry.ctaUrl } : {}),
    }));
}

function readStoreContentOrder(value: unknown): StoreContentSection[] {
  const ordered = Array.isArray(value)
    ? value.filter((entry): entry is StoreContentSection =>
        typeof entry === "string" && (STORE_CONTENT_SECTIONS as readonly string[]).includes(entry),
      )
    : [];
  const unique = [...new Set(ordered)];
  return [...unique, ...STORE_CONTENT_SECTIONS.filter((section) => !unique.includes(section))];
}

function readStoreEditorialGallery(value: unknown): StoreEditorialImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string",
    )
    .slice(0, 8)
    .map((entry) => ({
      imageUrl: entry.imageUrl as string,
      ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
      ...(typeof entry.caption === "string" && entry.caption ? { caption: entry.caption } : {}),
      ...(typeof entry.body === "string" && entry.body ? { body: entry.body } : {}),
      ...(typeof entry.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(entry.boxColor) ? { boxColor: entry.boxColor } : {}),
    }));
}

function storeUpdateData(dto: UpdateStoreDto): Prisma.StoreUpdateInput {
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.tagline !== undefined && { tagline: dto.tagline }),
    ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
    ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
    ...(dto.backgroundColor !== undefined && { backgroundColor: dto.backgroundColor }),
    ...(dto.backgroundMode !== undefined && { backgroundMode: dto.backgroundMode }),
    ...(dto.backgroundGradientStart !== undefined && { backgroundGradientStart: dto.backgroundGradientStart }),
    ...(dto.backgroundGradientEnd !== undefined && { backgroundGradientEnd: dto.backgroundGradientEnd }),
    ...(dto.backgroundGradientAngle !== undefined && { backgroundGradientAngle: dto.backgroundGradientAngle }),
    ...(dto.backgroundImageUrl !== undefined && { backgroundImageUrl: dto.backgroundImageUrl }),
    ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
    ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
    ...(dto.aboutText !== undefined && { aboutText: dto.aboutText }),
    ...(dto.aboutTitle !== undefined && { aboutTitle: dto.aboutTitle }),
    ...(dto.aboutSubtitle !== undefined && { aboutSubtitle: dto.aboutSubtitle }),
    ...(dto.aboutImageUrl !== undefined && { aboutImageUrl: dto.aboutImageUrl }),
    ...(dto.catalogTitle !== undefined && { catalogTitle: dto.catalogTitle }),
    ...(dto.catalogSubtitle !== undefined && { catalogSubtitle: dto.catalogSubtitle }),
    ...(dto.galleryTitle !== undefined && { galleryTitle: dto.galleryTitle }),
    ...(dto.gallerySubtitle !== undefined && { gallerySubtitle: dto.gallerySubtitle }),
    ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
    ...(dto.fontStyle !== undefined && { fontStyle: dto.fontStyle }),
    ...(dto.buttonStyle !== undefined && { buttonStyle: dto.buttonStyle }),
    ...(dto.boardTexture !== undefined && { boardTexture: dto.boardTexture }),
    ...(dto.announcement !== undefined && { announcement: dto.announcement }),
    ...(dto.announcementMode !== undefined && { announcementMode: dto.announcementMode }),
    ...(dto.announcementSpeed !== undefined && { announcementSpeed: dto.announcementSpeed }),
    ...(dto.announcementSize !== undefined && { announcementSize: dto.announcementSize }),
    ...(dto.announcementColor !== undefined && { announcementColor: dto.announcementColor }),
    ...(dto.promotionEnabled !== undefined && { promotionEnabled: dto.promotionEnabled }),
    ...(dto.promotionImageUrl !== undefined && { promotionImageUrl: dto.promotionImageUrl }),
    ...(dto.promotionTitle !== undefined && { promotionTitle: dto.promotionTitle }),
    ...(dto.promotionBody !== undefined && { promotionBody: dto.promotionBody }),
    ...(dto.promotionCtaLabel !== undefined && { promotionCtaLabel: dto.promotionCtaLabel }),
    ...(dto.promotionCtaUrl !== undefined && { promotionCtaUrl: dto.promotionCtaUrl }),
    ...(dto.heroSlides !== undefined && { heroSlides: dto.heroSlides as unknown as Prisma.InputJsonValue }),
    ...(dto.contentOrder !== undefined && { contentOrder: dto.contentOrder as unknown as Prisma.InputJsonValue }),
    ...(dto.layoutStyle !== undefined && { layoutStyle: dto.layoutStyle }),
    ...(dto.editorialGallery !== undefined && { editorialGallery: dto.editorialGallery as unknown as Prisma.InputJsonValue }),
    ...(dto.buttonVariant !== undefined && { buttonVariant: dto.buttonVariant }),
    ...(dto.buttonMotion !== undefined && { buttonMotion: dto.buttonMotion }),
    ...(dto.cartButtonLabel !== undefined && { cartButtonLabel: dto.cartButtonLabel }),
    ...(dto.checkoutMode !== undefined && { checkoutMode: dto.checkoutMode }),
    ...(dto.leadCaptureUrl !== undefined && { leadCaptureUrl: dto.leadCaptureUrl }),
    ...(dto.cartRecommendationsEnabled !== undefined && { cartRecommendationsEnabled: dto.cartRecommendationsEnabled }),
    ...(dto.cartRecommendationProductIds !== undefined && {
      cartRecommendationProductIds: dto.cartRecommendationProductIds as Prisma.InputJsonValue,
    }),
    ...(dto.showLowStockToCustomers !== undefined && { showLowStockToCustomers: dto.showLowStockToCustomers }),
    ...(dto.salesGoalLabel !== undefined && { salesGoalLabel: dto.salesGoalLabel }),
    ...(dto.salesGoalAmount !== undefined && { salesGoalAmount: dto.salesGoalAmount }),
  };
}

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly uploads: UploadsService,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly emailProvider?: EmailProvider,
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
            backgroundMode: dto.backgroundMode,
            backgroundGradientStart: dto.backgroundGradientStart,
            backgroundGradientEnd: dto.backgroundGradientEnd,
            backgroundGradientAngle: dto.backgroundGradientAngle,
            backgroundImageUrl: dto.backgroundImageUrl,
            contactPhone: dto.contactPhone,
            contactEmail: dto.contactEmail,
            aboutText: dto.aboutText,
            aboutTitle: dto.aboutTitle,
            aboutSubtitle: dto.aboutSubtitle,
            aboutImageUrl: dto.aboutImageUrl,
            catalogTitle: dto.catalogTitle,
            catalogSubtitle: dto.catalogSubtitle,
            galleryTitle: dto.galleryTitle,
            gallerySubtitle: dto.gallerySubtitle,
            accentColor: dto.accentColor,
            fontStyle: dto.fontStyle,
            buttonStyle: dto.buttonStyle,
            boardTexture: dto.boardTexture,
            announcement: dto.announcement,
            announcementMode: dto.announcementMode,
            announcementSpeed: dto.announcementSpeed,
            announcementSize: dto.announcementSize,
            announcementColor: dto.announcementColor,
            promotionEnabled: dto.promotionEnabled,
            promotionImageUrl: dto.promotionImageUrl,
            promotionTitle: dto.promotionTitle,
            promotionBody: dto.promotionBody,
            promotionCtaLabel: dto.promotionCtaLabel,
            promotionCtaUrl: dto.promotionCtaUrl,
            ...(dto.heroSlides !== undefined && { heroSlides: dto.heroSlides as unknown as Prisma.InputJsonValue }),
            ...(dto.contentOrder !== undefined && { contentOrder: dto.contentOrder as unknown as Prisma.InputJsonValue }),
            ...(dto.layoutStyle !== undefined && { layoutStyle: dto.layoutStyle }),
            ...(dto.editorialGallery !== undefined && { editorialGallery: dto.editorialGallery as unknown as Prisma.InputJsonValue }),
            buttonVariant: dto.buttonVariant,
            buttonMotion: dto.buttonMotion,
            cartButtonLabel: dto.cartButtonLabel,
            checkoutMode: dto.checkoutMode,
            leadCaptureUrl: dto.leadCaptureUrl,
            cartRecommendationsEnabled: dto.cartRecommendationsEnabled,
            ...(dto.cartRecommendationProductIds !== undefined && {
              cartRecommendationProductIds: dto.cartRecommendationProductIds as Prisma.InputJsonValue,
            }),
            showLowStockToCustomers: dto.showLowStockToCustomers,
            salesGoalLabel: dto.salesGoalLabel,
            salesGoalAmount: dto.salesGoalAmount,
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
      data: storeUpdateData(dto),
    });
  }

  /** Commits appearance and links together, so a failed link write can never
   * leave the storefront half-saved. */
  async saveSettings(merchantId: string, id: string, dto: SaveStoreSettingsDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    const { links, ...storeDto } = dto;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.store.update({ where: { id }, data: storeUpdateData(storeDto) });
      await tx.storeLink.deleteMany({ where: { storeId: id } });
      await tx.storeLink.createMany({
        data: links.map((link, index) => ({ storeId: id, label: link.label, url: link.url, sortOrder: index })),
      });
      const savedLinks = await tx.storeLink.findMany({ where: { storeId: id }, orderBy: { sortOrder: "asc" } });
      return { ...updated, links: savedLinks };
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
    const fileUrls = [
      store.logoUrl,
      store.bannerUrl,
      store.backgroundImageUrl,
      store.aboutImageUrl,
      ...readStoreHeroSlides(store.heroSlides).map((slide) => slide.imageUrl),
      ...readStoreEditorialGallery(store.editorialGallery).map((image) => image.imageUrl),
      ...links.flatMap((l) => l.imageUrls),
    ];

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
  async getStorePublic(slug: string, options: { trackView?: boolean } = {}) {
    const store = await this.findActiveBySlugPublic(slug);
    // Not deduplicated per visitor/session — a simple "is anyone looking at
    // this store" counter for the merchant's Finanzas view, not real
    // analytics. Every call here is a genuine page load, never a poll.
    const trackView = options.trackView !== false;
    const [items, categories, links, productStats] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.category.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeLink.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeProductStat.findMany({ where: { storeId: store.id }, select: { paymentLinkId: true, quantity: true } }),
      trackView ? this.prisma.store.update({ where: { id: store.id }, data: { viewCount: { increment: 1 } } }) : Promise.resolve(null),
    ]);

    const soldByProduct = new Map(productStats.map((stat) => [stat.paymentLinkId, stat.quantity]));
    const sharedExtraStock = new Map<string, number>();
    for (const item of items) {
      for (const extra of readProductExtras(item.extras)) {
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        sharedExtraStock.set(extra.inventoryKey, Math.min(sharedExtraStock.get(extra.inventoryKey) ?? extra.stock, extra.stock));
      }
    }

    return {
      storeId: store.id,
      storeName: store.name,
      tagline: store.tagline,
      logoUrl: store.logoUrl,
      bannerUrl: store.bannerUrl,
      backgroundColor: store.backgroundColor,
      backgroundMode: store.backgroundMode,
      backgroundGradientStart: store.backgroundGradientStart,
      backgroundGradientEnd: store.backgroundGradientEnd,
      backgroundGradientAngle: store.backgroundGradientAngle,
      backgroundImageUrl: store.backgroundImageUrl,
      contactPhone: store.contactPhone,
      contactEmail: store.contactEmail,
      aboutText: store.aboutText,
      aboutTitle: store.aboutTitle,
      aboutSubtitle: store.aboutSubtitle,
      aboutImageUrl: store.aboutImageUrl,
      catalogTitle: store.catalogTitle,
      catalogSubtitle: store.catalogSubtitle,
      galleryTitle: store.galleryTitle,
      gallerySubtitle: store.gallerySubtitle,
      accentColor: store.accentColor,
      fontStyle: store.fontStyle,
      buttonStyle: store.buttonStyle,
      boardTexture: store.boardTexture,
      announcement: store.announcement,
      announcementMode: store.announcementMode,
      announcementSpeed: store.announcementSpeed,
      announcementSize: store.announcementSize,
      announcementColor: store.announcementColor,
      promotionEnabled: store.promotionEnabled,
      promotionImageUrl: store.promotionImageUrl,
      promotionTitle: store.promotionTitle,
      promotionBody: store.promotionBody,
      promotionCtaLabel: store.promotionCtaLabel,
      promotionCtaUrl: store.promotionCtaUrl,
      heroSlides: readStoreHeroSlides(store.heroSlides),
      contentOrder: readStoreContentOrder(store.contentOrder),
      layoutStyle: store.layoutStyle,
      editorialGallery: readStoreEditorialGallery(store.editorialGallery),
      buttonVariant: store.buttonVariant,
      buttonMotion: store.buttonMotion,
      cartButtonLabel: store.cartButtonLabel,
      checkoutMode: store.checkoutMode,
      leadCaptureUrl: store.leadCaptureUrl,
      cartRecommendationsEnabled: store.cartRecommendationsEnabled,
      cartRecommendationProductIds: readStringArray(store.cartRecommendationProductIds),
      showLowStockToCustomers: store.showLowStockToCustomers,
      links: links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      items: items.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        imageUrls: item.imageUrls,
        imagePositions: item.imagePositions,
        tags: item.tags,
        // null = unlimited/not tracked; 0 means genuinely sold out, both are
        // meaningfully different from "in stock" and the storefront needs to
        // tell them apart.
        // `stock` controls what storefront copy may disclose. `purchaseLimit`
        // is enforcement-only: checkout uses it to disable further additions
        // even when the merchant keeps exact inventory quantities hidden.
        stock: store.showLowStockToCustomers ? item.stock : item.stock === 0 ? 0 : null,
        purchaseLimit: item.stock,
        color: item.color,
        variants: readProductVariants(item.variants).map((variant) => ({
          ...variant,
          ...(store.showLowStockToCustomers ? {} : { stock: variant.stock === 0 ? 0 : null }),
          ...(variant.stock !== undefined ? { purchaseLimit: variant.stock } : {}),
        })),
        extras: readProductExtras(item.extras).map((extra) => ({
          id: extra.id,
          name: extra.name,
          amount: extra.amount,
          required: extra.required,
          ...(extra.groupName ? { groupName: extra.groupName, freeAllowance: extra.freeAllowance ?? 0 } : {}),
          available: extra.stock === undefined || (extra.inventoryKey ? sharedExtraStock.get(extra.inventoryKey) !== 0 : extra.stock !== 0),
        })),
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
    if (store.checkoutMode === "whatsapp" || store.checkoutMode === "external") {
      throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    }
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

    const linksById = new Map(links.map((link) => [link.id, link]));
    const selectedLines = new Map<
      string,
      {
        paymentLinkId: string;
        variantId?: string;
        name: string;
        variantName?: string;
        extraIds?: string[];
        extras?: ProductExtra[];
        quantity: number;
        unitAmount: number;
        optionStock?: number | null;
      }
    >();
    for (const item of dto.items) {
      const link = linksById.get(item.paymentLinkId)!;
      const variants = readProductVariants(link.variants);
      const extras = readProductExtras(link.extras);
      let variant: ProductVariant | undefined;
      if (variants.length > 0) {
        if (!item.variantId) throw new BadRequestException(`Elige una opción para "${link.name}"`);
        variant = variants.find((candidate) => candidate.id === item.variantId);
        if (!variant) throw new BadRequestException(`Una opción de "${link.name}" ya no está disponible`);
      } else if (item.variantId) {
        throw new BadRequestException(`"${link.name}" no tiene opciones`);
      }

      const selectedExtraIds = [...(item.extraIds ?? [])].sort();
      const selectedExtras = extras.filter((extra) => selectedExtraIds.includes(extra.id));
      if (selectedExtras.length !== selectedExtraIds.length) {
        throw new BadRequestException(`Un extra de "${link.name}" ya no está disponible`);
      }
      const missingRequired = extras.filter((extra) => extra.required && !selectedExtraIds.includes(extra.id));
      if (missingRequired.length) {
        throw new BadRequestException(`Elige ${missingRequired.map((extra) => `"${extra.name}"`).join(", ")} para "${link.name}"`);
      }
      const exhaustedExtra = selectedExtras.find((extra) => extra.stock === 0);
      if (exhaustedExtra) throw new BadRequestException(`"${exhaustedExtra.name}" está agotado`);

      const lineKey = `${link.id}:${variant?.id ?? "base"}:${selectedExtraIds.join("+")}`;
      const existing = selectedLines.get(lineKey);
      if (existing) existing.quantity += item.quantity;
      else {
        selectedLines.set(lineKey, {
          paymentLinkId: link.id,
          ...(variant && { variantId: variant.id, variantName: variant.name }),
          ...(variant && variant.stock !== undefined && { optionStock: variant.stock }),
          ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: selectedExtras }),
          name: link.name,
          quantity: item.quantity,
          unitAmount: (variant?.amount ?? link.amount) + selectedExtrasAmount(selectedExtras),
        });
      }
    }

    for (const line of selectedLines.values()) {
      if (line.optionStock !== undefined && line.optionStock !== null && line.quantity > line.optionStock) {
        throw new BadRequestException(`Solo quedan ${line.optionStock} unidades de "${line.name} (${line.variantName})"`);
      }
    }

    const requestedByExtraPool = new Map<string, { quantity: number; stock: number; name: string }>();
    for (const line of selectedLines.values()) {
      for (const extra of line.extras ?? []) {
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        const requested = requestedByExtraPool.get(extra.inventoryKey);
        requestedByExtraPool.set(extra.inventoryKey, {
          quantity: (requested?.quantity ?? 0) + line.quantity,
          stock: Math.min(requested?.stock ?? extra.stock, extra.stock),
          name: extra.inventoryName || extra.name,
        });
      }
    }
    for (const { quantity, stock, name } of requestedByExtraPool.values()) {
      if (quantity > stock) throw new BadRequestException(`Ya no hay suficiente stock de "${name}"`);
    }

    const cartLines = [...selectedLines.values()].map(({ optionStock: _optionStock, ...line }) => line);
    const amount = cartLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);

    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${line.extras.map((extra) => extra.name).join(" + ")}` : ""} x${line.quantity}`)
      .join(", ");
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

  /** Public lead capture for stores that finish outside the pagosYa payment flow.
   * The browser only submits product ids; names and prices are resolved again
   * from this store so the notification cannot be used to spoof its catalog. */
  async submitLead(slug: string, dto: SubmitStoreLeadDto) {
    const store = await this.findActiveBySlugPublic(slug);
    if (!this.emailProvider) throw new BadRequestException("El correo de interesados todavía no está disponible");

    const digitCount = dto.phone.replace(/\D/g, "").length;
    if (digitCount < 7 || digitCount > 15) throw new BadRequestException("Escribe un número de WhatsApp válido");

    const requestedIds = [...new Set(dto.items.map((item) => item.paymentLinkId))];
    const [merchant, links] = await Promise.all([
      this.prisma.merchant.findUniqueOrThrow({ where: { id: store.merchantId } }),
      this.prisma.paymentLink.findMany({
        where: { id: { in: requestedIds }, storeId: store.id, status: PaymentLinkStatus.ACTIVE },
      }),
    ]);
    if (links.length !== requestedIds.length) {
      throw new BadRequestException("Uno o más productos seleccionados ya no están disponibles");
    }

    const byId = new Map(links.map((link) => [link.id, link]));
    const requestedByProduct = new Map<string, number>();
    const requestedByOption = new Map<string, { quantity: number; stock: number; name: string }>();
    const requestedByExtraPool = new Map<string, { quantity: number; stock: number; name: string }>();
    const lines = dto.items.map((item) => {
      const link = byId.get(item.paymentLinkId)!;
      const variants = readProductVariants(link.variants);
      const availableExtras = readProductExtras(link.extras);
      let variant: ProductVariant | undefined;
      if (variants.length) {
        if (!item.variantId) throw new BadRequestException(`Elige una opción para "${link.name}"`);
        variant = variants.find((candidate) => candidate.id === item.variantId);
        if (!variant) throw new BadRequestException(`Una opción de "${link.name}" ya no está disponible`);
      } else if (item.variantId) {
        throw new BadRequestException(`"${link.name}" no tiene opciones`);
      }

      const selectedExtraIds = [...(item.extraIds ?? [])].sort();
      const extras = availableExtras.filter((extra) => selectedExtraIds.includes(extra.id));
      if (extras.length !== selectedExtraIds.length) {
        throw new BadRequestException(`Un extra de "${link.name}" ya no está disponible`);
      }
      const missingRequired = availableExtras.filter((extra) => extra.required && !selectedExtraIds.includes(extra.id));
      if (missingRequired.length) {
        throw new BadRequestException(`Elige ${missingRequired.map((extra) => `"${extra.name}"`).join(", ")} para "${link.name}"`);
      }

      requestedByProduct.set(link.id, (requestedByProduct.get(link.id) ?? 0) + item.quantity);
      if (variant && typeof variant.stock === "number") {
        const key = `${link.id}:${variant.id}`;
        const current = requestedByOption.get(key);
        requestedByOption.set(key, {
          quantity: (current?.quantity ?? 0) + item.quantity,
          stock: variant.stock,
          name: `${link.name} (${variant.name})`,
        });
      }
      for (const extra of extras) {
        if (extra.stock === 0) throw new BadRequestException(`"${extra.name}" está agotado`);
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        const current = requestedByExtraPool.get(extra.inventoryKey);
        requestedByExtraPool.set(extra.inventoryKey, {
          quantity: (current?.quantity ?? 0) + item.quantity,
          stock: Math.min(current?.stock ?? extra.stock, extra.stock),
          name: extra.inventoryName || extra.name,
        });
      }

      const unitAmount = (variant?.amount ?? link.amount) + selectedExtrasAmount(extras);
      const details = [variant?.name, ...extras.map((extra) => extra.name)].filter(Boolean).join(" · ");
      return {
        paymentLinkId: link.id,
        name: link.name,
        ...(variant && { variantId: variant.id, variantName: variant.name }),
        ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: extras.map((extra) => ({ id: extra.id, name: extra.name, amount: extra.amount })) }),
        quantity: item.quantity,
        unitAmount,
        label: `${link.name}${details ? ` (${details})` : ""} × ${item.quantity}`,
        amount: unitAmount * item.quantity,
        currency: link.currency,
      };
    });
    for (const link of links) {
      const requested = requestedByProduct.get(link.id) ?? 0;
      if (link.stock !== null && requested > link.stock) {
        throw new BadRequestException(`Solo quedan ${link.stock} unidades de "${link.name}"`);
      }
    }
    for (const item of [...requestedByOption.values(), ...requestedByExtraPool.values()]) {
      if (item.quantity > item.stock) throw new BadRequestException(`Solo quedan ${item.stock} unidades de "${item.name}"`);
    }
    const grandTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    if (store.checkoutMode !== "external" && (store.checkoutMode !== "payment" || grandTotal > 0)) {
      throw new BadRequestException("Esta tienda solo recibe formularios para pedidos con total cero");
    }
    const currencies = [...new Set(lines.map((line) => line.currency))];
    const totals = currencies.map((currency) => {
      const amount = lines.filter((line) => line.currency === currency).reduce((sum, line) => sum + line.amount, 0);
      return `${(amount / 100).toFixed(2)} ${currency}`;
    });
    const recipient = store.contactEmail || merchant.email;
    const body = [
      `Nuevo interesado desde ${store.name}`,
      "",
      `Nombre: ${dto.name.trim()}`,
      `Correo: ${dto.email.trim().toLowerCase()}`,
      `WhatsApp: ${dto.phone.trim()}`,
      ...(dto.message?.trim() ? [`Mensaje: ${dto.message.trim()}`] : []),
      "",
      "Productos seleccionados:",
      ...lines.map((line) => `- ${line.label}`),
      `Total de referencia: ${totals.join(" + ")}`,
      "",
      "Este mensaje fue enviado por pagosYa. Responde al correo o WhatsApp indicado por el cliente.",
    ].join("\n");

    await this.emailProvider.send({
      to: recipient,
      subject: `Nuevo interesado en ${store.name}: ${dto.name.trim()}`,
      body,
      failLoudly: true,
    });
    const lead = await this.prisma.storeLead.create({
      data: {
        merchantId: store.merchantId,
        storeId: store.id,
        customerName: dto.name.trim(),
        customerEmail: dto.email.trim().toLowerCase(),
        customerPhone: dto.phone.trim(),
        message: dto.message?.trim() || null,
        items: lines as Prisma.InputJsonValue,
        amount: grandTotal,
        currency: currencies[0] || "BOB",
      },
      select: { id: true },
    });
    return { submitted: true, leadId: lead.id };
  }
}
