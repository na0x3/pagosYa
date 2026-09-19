import { creditQuote, reserveCredit } from '../commerce-platform/credit-ledger';
import { bestBundleDiscount, type Bundle } from './bundle-pricing';
import { quoteShipping } from '../shipping/shipping-rates';
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { customAlphabet } from "nanoid";
import { MerchantStatus, OrderFulfillmentStatus, PaymentLinkStatus, PaymentMethodType, Prisma, StoreStatus } from "@prisma/client";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { findActiveStoreBySlug } from "./active-store";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  CreateStoreDto
} from "./dto/create-store.dto";
import { type StoreAnimationDto } from "./dto/store-motion.dto";
import { type StoreLocationDto } from "./dto/store-location.dto";
import { readCatalogLayout } from "./catalog-layout";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";
import { SaveStoreSettingsDto } from "./dto/save-store-settings.dto";
import { SaveWebsiteDraftDto } from "./dto/save-website-draft.dto";
import { assertWebsiteRevision, saveWebsiteDraftPatch, websiteDraft, websiteEditorStore, websiteUpdateData, WebsiteDraft } from "./website-draft";
import { SubmitStoreLeadDto } from "./dto/submit-store-lead.dto";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";
const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;
const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";
import type { ProductVariant } from '../payment-links/product-variants';
import { pickedProductQuantities, resolveSelectedExtras, selectedExtrasLabel } from '../payment-links/product-extras';
import type { CartItemDto } from '../payment-links/dto/cart-checkout.dto';
import { assertValidStoreLocations, storeLocationSnapshot, readStoreLocations, readLocationStocks, nextStoreLocationOpenAt } from "./store-locations";
import { DEFAULT_STORE_ANIMATION, normalizeAnimationMedia, animationContentSection, DEFAULT_STORE_CONTENT_ORDER, type StoreAnimation, storeUpdateData, readStoreHeroSlides, readStoreEditorialGallery, readStoreMotionExperiences, readStoreAnimations, readStoreContentOrder } from "./store-presentation";
import { readProductExtras, readStringArray, readProductVariants, type ProductExtra, discountedProductAmount, selectedExtrasAmount } from "./product-pricing";

@Injectable()
export class StoresService implements OnModuleDestroy {
  private readonly logger = new Logger(StoresService.name);
  private readonly pendingStoreViews = new Map<string, number>();
  private storeViewFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private storeViewFlushPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly uploads: UploadsService,
    @Optional() @Inject(EMAIL_PROVIDER) private readonly emailProvider?: EmailProvider,
    @Optional() private readonly promoCodes?: PromoCodesService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  private queueStoreView(storeId: string): void {
    this.pendingStoreViews.set(storeId, (this.pendingStoreViews.get(storeId) ?? 0) + 1);
    if (this.storeViewFlushTimer || this.storeViewFlushPromise) return;
    this.storeViewFlushTimer = setTimeout(() => {
      this.storeViewFlushTimer = null;
      void this.flushPendingStoreViews();
    }, 1_000);
    this.storeViewFlushTimer.unref?.();
  }

  async flushPendingStoreViews(): Promise<void> {
    if (this.storeViewFlushPromise) return this.storeViewFlushPromise;
    if (this.storeViewFlushTimer) {
      clearTimeout(this.storeViewFlushTimer);
      this.storeViewFlushTimer = null;
    }
    const batch = [...this.pendingStoreViews.entries()];
    if (!batch.length) return;
    this.pendingStoreViews.clear();
    this.storeViewFlushPromise = (async () => {
      const results = await Promise.allSettled(batch.map(([storeId, count]) => this.prisma.store.update({
        where: { id: storeId },
        data: { viewCount: { increment: count } },
      })));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") return;
        const [storeId, count] = batch[index];
        this.pendingStoreViews.set(storeId, (this.pendingStoreViews.get(storeId) ?? 0) + count);
        this.logger.warn(`Could not flush ${count} storefront views for ${storeId}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      });
    })();
    try {
      await this.storeViewFlushPromise;
    } finally {
      this.storeViewFlushPromise = null;
      if (this.pendingStoreViews.size && !this.storeViewFlushTimer) {
        this.storeViewFlushTimer = setTimeout(() => {
          this.storeViewFlushTimer = null;
          void this.flushPendingStoreViews();
        }, 5_000);
        this.storeViewFlushTimer.unref?.();
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.flushPendingStoreViews();
  }

  async createQuickQrPayment(merchantId: string, storeId: string, dto: CreateQuickQrPaymentDto) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, merchantId },
      include: { merchant: { select: { status: true } } },
    });
    if (!store) throw new NotFoundException("Store not found");
    if (store.status !== StoreStatus.ACTIVE || store.merchant.status !== MerchantStatus.ACTIVE) {
      throw new BadRequestException("Activa la tienda y completa la verificación antes de cobrar con QR");
    }

    const description = dto.description?.trim() || `Cobro rápido en ${store.name}`;
    const intent = await this.paymentIntents.create(merchantId, true, {
      amount: dto.amount,
      currency: "BOB",
      description,
      metadata: { storeId, quickPayment: { source: "dashboard", storeName: store.name } },
    });
    const outcome = await this.paymentIntents.confirm(intent.id, {
      paymentMethod: { type: PaymentMethodType.QR, token: "tok_qr_demo" },
    });
    const action = outcome.railResult.actionRequired as {
      type?: string;
      data?: { qrImageBase64?: string; qrPayload?: string };
    } | undefined;
    let qrImageDataUrl: string | null = null;
    if (action?.type === "qr_display" && action.data?.qrImageBase64) {
      qrImageDataUrl = `data:image/png;base64,${action.data.qrImageBase64}`;
    } else if (action?.type === "qr_display" && action.data?.qrPayload) {
      qrImageDataUrl = await QRCode.toDataURL(action.data.qrPayload, { errorCorrectionLevel: "M", margin: 2, width: 420 });
    }

    return {
      paymentIntentId: outcome.paymentIntent.id,
      status: outcome.paymentIntent.status,
      amount: outcome.paymentIntent.amount,
      currency: outcome.paymentIntent.currency,
      description,
      qrImageDataUrl,
    };
  }

  /** Stores keep independent catalogs and designs under the authenticated merchant. */
  async create(merchantId: string, dto: CreateStoreDto) {
    if (dto.locations !== undefined) assertValidStoreLocations(dto.locations);
    const animations = (dto.animations ?? [{ ...DEFAULT_STORE_ANIMATION, media: [] }]).map(normalizeAnimationMedia);
    const contentOrder = dto.contentOrder
      ? [...(dto.animations === undefined ? [animationContentSection(DEFAULT_STORE_ANIMATION.id)] : []), ...dto.contentOrder]
      : dto.animations === undefined
        ? [...DEFAULT_STORE_CONTENT_ORDER]
        : [
            ...dto.animations.map((animation) => animationContentSection(animation.id)),
            ...DEFAULT_STORE_CONTENT_ORDER.filter((section) => section !== animationContentSection(DEFAULT_STORE_ANIMATION.id)),
          ];
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
            backgroundMode: "solid",
            backgroundGradientStart: dto.backgroundColor,
            backgroundGradientEnd: dto.backgroundColor,
            backgroundGradientAngle: 0,
            backgroundImageUrl: null,
            contactPhone: dto.contactPhone,
            contactEmail: dto.contactEmail,
            contactFormEnabled: dto.contactFormEnabled ?? false,
            contactFormEmail: dto.contactFormEmail,
            contactTitle: dto.contactTitle,
            contactSubtitle: dto.contactSubtitle,
            locationMapUrl: dto.locationMapUrl,
            locationDescription: dto.locationDescription,
            locationHighlight: dto.locationHighlight,
            locationTitle: dto.locationTitle,
            locationSubtitle: dto.locationSubtitle,
            ...(dto.locations !== undefined && { locations: storeLocationSnapshot(dto.locations) as unknown as Prisma.InputJsonValue }),
            aboutText: dto.aboutText,
            aboutTitle: dto.aboutTitle,
            aboutSubtitle: dto.aboutSubtitle,
            aboutImageUrl: dto.aboutImageUrl,
            catalogTitle: dto.catalogTitle,
            catalogSubtitle: dto.catalogSubtitle,
            galleryTitle: dto.galleryTitle,
            gallerySubtitle: dto.gallerySubtitle,
            linksTitle: dto.linksTitle,
            accentColor: dto.accentColor,
            fontStyle: dto.fontStyle,
            buttonStyle: dto.buttonStyle,
            boardTexture: "painted",
            announcement: dto.announcement,
            announcementMode: dto.announcementMode,
            announcementSpeed: dto.announcementSpeed,
            announcementSize: dto.announcementSize,
            announcementColor: dto.announcementColor,
            announcementFont: dto.announcementFont,
            announcementEffect: dto.announcementEffect,
            promotionEnabled: dto.promotionEnabled,
            promotionImageUrl: dto.promotionImageUrl,
            promotionTitle: dto.promotionTitle,
            promotionBody: dto.promotionBody,
            promotionCtaLabel: dto.promotionCtaLabel,
            promotionCtaUrl: dto.promotionCtaUrl,
            ...(dto.heroSlides !== undefined && { heroSlides: dto.heroSlides as unknown as Prisma.InputJsonValue }),
            contentOrder: contentOrder as unknown as Prisma.InputJsonValue,
            ...(dto.sectionBackgrounds !== undefined && { sectionBackgrounds: dto.sectionBackgrounds as unknown as Prisma.InputJsonValue }),
            ...(dto.layoutStyle !== undefined && { layoutStyle: dto.layoutStyle }),
            ...(dto.catalogLayout !== undefined && { catalogLayout: dto.catalogLayout }),
            ...(dto.experienceStyle !== undefined && { experienceStyle: dto.experienceStyle }),
            ...(dto.motionDuoEnabled !== undefined && { motionDuoEnabled: dto.motionDuoEnabled }),
            ...(dto.motionExperience !== undefined && { motionExperience: dto.motionExperience }),
            ...(dto.motionExperiences !== undefined && {
              motionExperiences: dto.motionExperiences as unknown as Prisma.InputJsonValue,
              motionExperience: dto.motionExperiences[0],
            }),
            animations: animations as unknown as Prisma.InputJsonValue,
            motionDuoEnabled: animations.length > 0,
            motionExperiences: [...new Set(animations.map((animation: StoreAnimationDto | StoreAnimation) => animation.type))] as unknown as Prisma.InputJsonValue,
            motionExperience: animations[0]?.type ?? "clarity-marquee",
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
        const uniqueError = err as { code?: string; meta?: { target?: string[] | string } };
        const isUniqueSlugClash = uniqueError.code === "P2002" && uniqueError.meta?.target?.includes("slug");
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
      include: {
        sourceProject: { select: { revision: true } },
        links: { orderBy: { sortOrder: "asc" } },
        customDomains: {
          orderBy: { createdAt: "asc" },
          select: { id: true, hostname: true, status: true, verifiedAt: true },
        },
      },
    });
  }

  async update(merchantId: string, id: string, dto: UpdateStoreDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    await this.assertOwnedSiteSectionMedia(merchantId, dto, store.siteDocument);
    if (dto.locations !== undefined) {
      assertValidStoreLocations(dto.locations);
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.store.update({ where: { id }, data: { ...storeUpdateData(dto, store.siteDocument, store), websiteRevision: { increment: 1 }, websitePublishedRevision: { increment: 1 } } });
        await this.syncLocationInventory(tx, id, dto.locations!);
        return updated;
      });
    }
    return this.prisma.store.update({
      where: { id },
      data: { ...storeUpdateData(dto, store.siteDocument, store), websiteRevision: { increment: 1 }, websitePublishedRevision: { increment: 1 } },
    });
  }

  /** Commits appearance and links together, so a failed link write can never
   * leave the storefront half-saved. */
  async saveSettings(merchantId: string, id: string, dto: SaveStoreSettingsDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    await this.assertOwnedSiteSectionMedia(merchantId, dto, store.siteDocument);
    const { links, locations, ...storeDto } = dto;
    if (locations !== undefined) assertValidStoreLocations(locations);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.store.update({
        where: { id },
        data: {
          ...storeUpdateData(storeDto, store.siteDocument, store),
          websiteRevision: { increment: 1 },
          websitePublishedRevision: { increment: 1 },
          ...(locations !== undefined && { locations: storeLocationSnapshot(locations) as unknown as Prisma.InputJsonValue }),
        },
      });
      if (locations !== undefined) await this.syncLocationInventory(tx, id, locations);
      await tx.storeLink.deleteMany({ where: { storeId: id } });
      await tx.storeLink.createMany({
        data: links.map((link, index) => ({ storeId: id, label: link.label, url: link.url, sortOrder: index })),
      });
      const savedLinks = await tx.storeLink.findMany({ where: { storeId: id }, orderBy: { sortOrder: "asc" } });
      return { ...updated, links: savedLinks };
    });
  }

  async saveWebsiteDraft(merchantId: string, id: string, dto: SaveWebsiteDraftDto) {
    const published = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!published) throw new NotFoundException("Store not found");
    assertWebsiteRevision(published, dto.revision);
    const store = websiteEditorStore(published);
    await this.assertOwnedSiteSectionMedia(merchantId, dto, store.siteDocument);
    if (dto.locations !== undefined) assertValidStoreLocations(dto.locations);
    const { revision, links, inventoryProductIds = [], ...settings } = dto;
    const data = storeUpdateData(settings, store.siteDocument, store) as Prisma.JsonObject;
    let inventory: Pick<WebsiteDraft, "inventoryChanges" | "locationInventory"> | undefined;
    if (inventoryProductIds.length && dto.locations) {
      const products = await this.prisma.paymentLink.findMany({ where: { storeId: id, id: { in: inventoryProductIds } }, select: { id: true, name: true, stock: true, locationStocks: true } });
      if (products.length !== inventoryProductIds.length) throw new BadRequestException("Uno de los productos del ajuste de inventario ya no pertenece a esta tienda.");
      const previousChanges = websiteDraft(published)?.inventoryChanges ?? [];
      const inventoryChanges = previousChanges.filter((change) => !inventoryProductIds.includes(change.id));
      const sameLocations = (a: unknown, b: unknown) => JSON.stringify(Object.entries((a || {}) as object).sort()) === JSON.stringify(Object.entries((b || {}) as object).sort());
      for (const product of products) {
        if (!dto.locations.every((location) => location.inventory?.some((entry) => entry.paymentLinkId === product.id))) throw new BadRequestException(`Completa el stock de ${product.name} en cada ubicación.`);
        const previous = previousChanges.find((change) => change.id === product.id);
        if (previous && (previous.beforeStock !== product.stock || !sameLocations(previous.beforeLocations, product.locationStocks))) {
          throw new ConflictException(`El stock de ${product.name} cambió. Revisa el inventario antes de guardar ese ajuste.`);
        }
        const locationStocks = Object.fromEntries(dto.locations.map((location) => {
          const allocation = location.inventory!.find((entry) => entry.paymentLinkId === product.id)!;
          return [location.id, allocation.stock === undefined ? 0 : allocation.stock];
        }));
        const values = Object.values(locationStocks);
        const stock = !values.length ? product.stock : values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
        if (stock !== product.stock || !sameLocations(locationStocks, product.locationStocks)) inventoryChanges.push({ id: product.id, name: product.name, beforeStock: product.stock, beforeLocations: product.locationStocks, stock, locationStocks });
      }
      inventory = { inventoryChanges, locationInventory: dto.locations.map((location) => ({ id: location.id, inventory: inventoryChanges.map((change) => ({ paymentLinkId: change.id, stock: change.locationStocks[location.id] ?? null })) })) };
    }
    return saveWebsiteDraftPatch(this.prisma, published, revision, data, links, undefined, inventory);
  }

  async publishWebsiteDraft(merchantId: string, id: string, revision: number) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId }, include: { links: { orderBy: { sortOrder: "asc" } } } });
    if (!store) throw new NotFoundException("Store not found");
    assertWebsiteRevision(store, revision);
    const draft = websiteDraft(store);
    if (!draft) throw new BadRequestException("Guarda un borrador antes de publicarlo.");
    // Capture every field being promoted, including link order, for restoration.
    const before = Object.fromEntries(Object.keys(draft.data).map((key) => [key, (store as any)[key] ?? null]));
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.store.updateMany({
        where: { id, merchantId, websiteRevision: revision, websitePublishedRevision: draft.basePublishedRevision },
        data: { ...websiteUpdateData(draft.data) as Prisma.StoreUpdateManyMutationInput,
          websiteDraft: Prisma.DbNull, websiteRevision: { increment: 1 }, websitePublishedRevision: { increment: 1 } },
      });
      if (result.count !== 1) throw new ConflictException("El borrador cambió antes de publicar. Revisa los cambios más recientes.");
      for (const change of draft.inventoryChanges ?? []) {
        const changed = await tx.paymentLink.updateMany({ where: { id: change.id, storeId: id, stock: change.beforeStock,
          locationStocks: { equals: change.beforeLocations === null ? Prisma.DbNull : change.beforeLocations as Prisma.InputJsonValue } },
          data: { stock: change.stock, locationStocks: change.locationStocks } });
        if (changed.count !== 1) throw new ConflictException(`El stock de ${change.name} cambió. No publicamos nada; revisa ese ajuste de inventario.`);
      }
      await tx.storeVisualVersion.create({ data: { storeId: id, label: "Antes de publicar", source: `publish:${revision}`,
        snapshot: { ...before, links: store.links.map(({ label, url }) => ({ label, url })) } as Prisma.InputJsonObject } });
      if (draft.links) {
        await tx.storeLink.deleteMany({ where: { storeId: id } });
        await tx.storeLink.createMany({ data: draft.links.map((link, sortOrder) => ({ storeId: id, ...link, sortOrder })) });
      }
      return tx.store.findUniqueOrThrow({ where: { id }, include: { links: { orderBy: { sortOrder: "asc" } } } });
    });
  }

  async discardWebsiteDraft(merchantId: string, id: string, revision: number) {
    // Explicit recovery when a public settings change made a draft obsolete.
    const result = await this.prisma.store.updateMany({ where: { id, merchantId, websiteRevision: revision },
      data: { websiteDraft: Prisma.DbNull, websiteRevision: { increment: 1 } } });
    if (result.count !== 1) throw new ConflictException("El borrador cambió. Recarga antes de descartarlo.");
    return this.prisma.store.findFirstOrThrow({ where: { id, merchantId }, include: { links: { orderBy: { sortOrder: "asc" } } } });
  }

  private async assertOwnedSiteSectionMedia(merchantId: string, dto: UpdateStoreDto, currentDocument: Prisma.JsonValue | null) {
    if (!dto.siteSections?.length) return;
    const blockMedia = (blocks: Array<{ mediaUrl?: string | null; children?: any[] }> = []): string[] => blocks.flatMap((block) => [
      ...(block.mediaUrl ? [block.mediaUrl] : []),
      ...blockMedia(block.children || []),
    ]);
    const requested = new Set(dto.siteSections.flatMap((section) => [
      ...section.mediaUrls,
      ...section.items.flatMap((item) => item.mediaUrl ? [item.mediaUrl] : []),
      ...blockMedia(section.blocks || []),
    ]));
    const current = new Set<string>();
    if (currentDocument && typeof currentDocument === "object" && !Array.isArray(currentDocument)) {
      const sections = Array.isArray((currentDocument as Record<string, unknown>).sections)
        ? (currentDocument as Record<string, unknown>).sections as Array<Record<string, unknown>>
        : [];
      sections.forEach((section) => {
        if (Array.isArray(section.mediaUrls)) section.mediaUrls.forEach((url) => typeof url === "string" && current.add(url));
        if (Array.isArray(section.items)) section.items.forEach((item) => {
          if (item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).mediaUrl === "string") current.add((item as Record<string, unknown>).mediaUrl as string);
        });
        if (Array.isArray(section.blocks)) blockMedia(section.blocks as any[]).forEach((url) => current.add(url));
      });
    }
    const newUrls = [...requested].filter((url) => !current.has(url));
    if (!newUrls.length) return;
    const owned = await this.prisma.mediaAsset.findMany({ where: { merchantId, url: { in: newUrls } }, select: { url: true } });
    if (owned.length !== newUrls.length) throw new BadRequestException("Una o más imágenes de la sección no pertenecen a tu cuenta");
  }

  private async syncLocationInventory(tx: Prisma.TransactionClient, storeId: string, locations: StoreLocationDto[]) {
    const products = await tx.paymentLink.findMany({ where: { storeId }, select: { id: true, stock: true } });
    for (const product of products) {
      const locationStocks = Object.fromEntries(locations.map((location) => {
        const allocation = location.inventory?.find((entry) => entry.paymentLinkId === product.id);
        return [location.id, allocation?.stock === null ? null : allocation?.stock ?? 0];
      })) as Record<string, number | null>;
      const values = Object.values(locationStocks);
      const aggregateStock = values.length === 0 ? product.stock : values.some((value) => value === null)
        ? null
        : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      await tx.paymentLink.update({
        where: { id: product.id },
        data: { locationStocks: locationStocks as Prisma.InputJsonValue, stock: aggregateStock },
      });
    }
  }

  /** Replaces the store's whole link-button list (order in the array = display order). */
  async setLinks(merchantId: string, id: string, dto: SetStoreLinksDto) {
    const store = await this.prisma.store.findFirst({ where: { id, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    await this.prisma.$transaction([
      this.prisma.store.update({ where: { id }, data: { websiteRevision: { increment: 1 }, websitePublishedRevision: { increment: 1 } } }),
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
    const [links, categories] = await Promise.all([
      this.prisma.paymentLink.findMany({ where: { storeId: id }, select: { imageUrls: true } }),
      this.prisma.category.findMany({ where: { storeId: id }, select: { bannerUrl: true } }),
    ]);
    const fileUrls = [
      store.logoUrl,
      store.bannerUrl,
      store.backgroundImageUrl,
      store.aboutImageUrl,
      ...readStoreHeroSlides(store.heroSlides).map((slide) => slide.imageUrl),
      ...readStoreEditorialGallery(store.editorialGallery).map((image) => image.imageUrl),
      ...categories.map((category) => category.bannerUrl),
      ...links.flatMap((l) => l.imageUrls),
    ];

    if (this.prisma.domainOrder && await this.prisma.domainOrder.count({ where: { storeId: id, status: { not: 'QUOTED' } } })) {
      throw new BadRequestException('Archiva esta tienda para conservar el registro y los pagos de sus dominios.');
    }
    if (this.prisma.domainOrder) await this.prisma.domainOrder.deleteMany({ where: { storeId: id, status: 'QUOTED' } });
    if (store.creditsEnabled || store.digitalGoodsEnabled) throw new BadRequestException('Archiva esta tienda para conservar saldos y descargas de pedidos existentes.');
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
  findActiveBySlugPublic(slug: string) {
    return findActiveStoreBySlug(this.prisma, slug);
  }

  async listPublishedStores(search?: string, requestedPage?: string, requestedPageSize?: string) {
    const page = Math.max(1, Math.min(10_000, Number.parseInt(requestedPage ?? "1", 10) || 1));
    const pageSize = Math.max(6, Math.min(60, Number.parseInt(requestedPageSize ?? "24", 10) || 24));
    const term = search?.trim().slice(0, 80);
    const where: Prisma.StoreWhereInput = {
      status: StoreStatus.ACTIVE,
      sourcePublicationPaused: false,
      merchant: { status: MerchantStatus.ACTIVE },
      paymentLinks: { some: { status: PaymentLinkStatus.ACTIVE } },
      ...(term ? {
        OR: [
          { name: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { tagline: { contains: term, mode: Prisma.QueryMode.insensitive } },
          { categories: { some: { name: { contains: term, mode: Prisma.QueryMode.insensitive } } } },
          { paymentLinks: { some: { status: PaymentLinkStatus.ACTIVE, name: { contains: term, mode: Prisma.QueryMode.insensitive } } } },
        ],
      } : {}),
    };
    const [total, stores] = await this.prisma.$transaction([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          name: true,
          tagline: true,
          logoUrl: true,
          bannerUrl: true,
          accentColor: true,
          backgroundColor: true,
          checkoutMode: true,
          createdAt: true,
          categories: { orderBy: { sortOrder: "asc" }, take: 3, select: { name: true } },
          paymentLinks: {
            where: { status: PaymentLinkStatus.ACTIVE },
            orderBy: { createdAt: "asc" },
            take: 4,
            select: { name: true, amount: true, currency: true, imageUrls: true },
          },
          _count: { select: { paymentLinks: { where: { status: PaymentLinkStatus.ACTIVE } } } },
        },
      }),
    ]);
    const minimums = stores.length
      ? await this.prisma.paymentLink.groupBy({
          by: ["storeId"],
          where: { storeId: { in: stores.map((store) => store.id) }, status: PaymentLinkStatus.ACTIVE },
          _min: { amount: true },
        })
      : [];
    const minimumByStore = new Map(minimums.map((row) => [row.storeId, row._min.amount]));

    return {
      stores: stores.map((store) => {
        const productImageUrl = store.paymentLinks.flatMap((product) => product.imageUrls).find(Boolean) ?? null;
        return {
          id: store.id,
          slug: store.slug,
          name: store.name,
          tagline: store.tagline,
          logoUrl: store.logoUrl,
          coverUrl: store.bannerUrl ?? productImageUrl ?? store.logoUrl,
          accentColor: store.accentColor,
          backgroundColor: store.backgroundColor,
          checkoutMode: store.checkoutMode,
          categories: store.categories.map((category) => category.name),
          productCount: store._count.paymentLinks,
          minimumAmount: minimumByStore.get(store.id) ?? null,
          currency: store.paymentLinks[0]?.currency ?? "BOB",
          featuredProducts: store.paymentLinks.map((product) => product.name),
          publishedAt: store.createdAt,
        };
      }),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        hasMore: page * pageSize < total,
      },
    };
  }

  /** Box picks consume their linked product's stock: load the linked products that are not
   * already cart lines, and count every pick (× line quantity) toward each product. */
  private async pickedProductStock(storeId: string, links: Array<{ id: string; extras: Prisma.JsonValue }>, items: CartItemDto[]) {
    const linksById = new Map(links.map((link) => [link.id, link]));
    const picked = pickedProductQuantities(items, (item) => readProductExtras(linksById.get(item.paymentLinkId)?.extras ?? []));
    const missing = [...picked.keys()].filter((id) => !linksById.has(id));
    const linked = missing.length
      ? await this.prisma.paymentLink.findMany({ where: { id: { in: missing }, storeId, status: PaymentLinkStatus.ACTIVE } })
      : [];
    for (const id of missing) {
      if (linked.some((link) => link.id === id)) continue;
      const name = links.flatMap((link) => readProductExtras(link.extras)).find((extra) => extra.productId === id)?.name;
      throw new BadRequestException(`"${name ?? "Un producto de la caja"}" ya no está disponible`);
    }
    return { picked, linked };
  }

  /** Public — no auth, called by the checkout page's landing view before any payment exists. */
  async getStorePublic(slug: string, options: { trackView?: boolean; ownerMerchantId?: string } = {}) {
    const store = options.ownerMerchantId
      ? await this.prisma.store.findFirst({ where: { slug, merchantId: options.ownerMerchantId } })
      : await this.findActiveBySlugPublic(slug);
    if (!store) throw new NotFoundException('Store not found');
    // Not deduplicated per visitor/session — a lightweight external-audience
    // counter for the merchant's Finanzas view, not full analytics. Checkout
    // explicitly disables it for editor previews and browsers marked as the
    // store owner; ordinary shared-link loads continue to count.
    const trackView = !options.ownerMerchantId && options.trackView !== false;
    const [items, categories, links, productStats, appointmentOfferings, collections] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.category.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeLink.findMany({ where: { storeId: store.id }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeProductStat.findMany({ where: { storeId: store.id }, select: { paymentLinkId: true, quantity: true } }),
      this.prisma.appointmentServiceOffering.findMany({
        where: { storeId: store.id, isActive: true },
        select: { id: true, name: true, durationMinutes: true, bufferMinutes: true, price: true, currency: true, color: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.collection.findMany({
        where: { storeId: store.id },
        orderBy: { sortOrder: 'asc' },
        include: { products: { orderBy: { sortOrder: 'asc' }, select: { paymentLinkId: true } } },
      }),
    ]);
    if (trackView) this.queueStoreView(store.id);

    const soldByProduct = new Map(productStats.map((stat) => [stat.paymentLinkId, stat.quantity]));
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const bundles = store.bundlesEnabled
      ? (await this.prisma.storeBundle.findMany({ where: { storeId: store.id, active: true }, orderBy: { createdAt: "asc" } }))
          .map(({ id, name, kind, items: bundleItems, minimumQuantity, discountPercent }) => ({ id, name, kind, items: bundleItems as Array<{ productId: string; quantity: number }>, minimumQuantity, discountPercent }))
      : [];
    const sharedExtraStock = new Map<string, number>();
    for (const item of items) {
      for (const extra of readProductExtras(item.extras)) {
        if (!extra.inventoryKey || extra.stock === undefined) continue;
        sharedExtraStock.set(extra.inventoryKey, Math.min(sharedExtraStock.get(extra.inventoryKey) ?? extra.stock, extra.stock));
      }
    }

    const legacyMotionExperiences = readStoreMotionExperiences(store.motionExperiences, store.motionExperience);
    const publicProductIds = new Set(items.map((item) => item.id));
    const editorialGallery = readStoreEditorialGallery(store.editorialGallery).map((image) => {
      if (!image.productId || publicProductIds.has(image.productId)) return image;
      const { productId: _staleProductId, ...unlinkedImage } = image;
      return unlinkedImage;
    });
    const animations = readStoreAnimations(store.animations, store.motionDuoEnabled, legacyMotionExperiences, editorialGallery);
    const motionExperiences = [...new Set(animations.length ? animations.map((animation) => animation.type) : legacyMotionExperiences)];
    const locations = readStoreLocations(store.locations).map((location) => ({
      ...location,
      inventory: items.map((item) => ({
        paymentLinkId: item.id,
        stock: readLocationStocks(item.locationStocks)[location.id] ?? 0,
      })),
    }));
    return {
      storeId: store.id,
      publishedSourceRevision: store.publishedSourceRevision ?? null,
      storeName: store.name,
      creditsEnabled: store.creditsEnabled, digitalGoodsEnabled: store.digitalGoodsEnabled, shippingEnabled: store.shippingEnabled, shippingPickupEnabled: store.shippingPickupEnabled, bundlesEnabled: store.bundlesEnabled,
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
      contactFormEnabled: store.contactFormEnabled,
      contactTitle: store.contactTitle,
      contactSubtitle: store.contactSubtitle,
      locationMapUrl: store.locationMapUrl,
      locationDescription: store.locationDescription,
      locationHighlight: store.locationHighlight,
      locationTitle: store.locationTitle,
      locationSubtitle: store.locationSubtitle,
      locations,
      aboutText: store.aboutText,
      aboutTitle: store.aboutTitle,
      aboutSubtitle: store.aboutSubtitle,
      aboutImageUrl: store.aboutImageUrl,
      catalogTitle: store.catalogTitle,
      catalogSubtitle: store.catalogSubtitle,
      galleryTitle: store.galleryTitle,
      gallerySubtitle: store.gallerySubtitle,
      linksTitle: store.linksTitle,
      accentColor: store.accentColor,
      fontStyle: store.fontStyle,
      buttonStyle: store.buttonStyle,
      boardTexture: store.boardTexture,
      announcement: store.announcement,
      announcementMode: store.announcementMode,
      announcementSpeed: store.announcementSpeed,
      announcementSize: store.announcementSize,
      announcementColor: store.announcementColor,
      announcementFont: store.announcementFont,
      announcementEffect: store.announcementEffect,
      promotionEnabled: store.promotionEnabled,
      promotionImageUrl: store.promotionImageUrl,
      promotionTitle: store.promotionTitle,
      promotionBody: store.promotionBody,
      promotionCtaLabel: store.promotionCtaLabel,
      promotionCtaUrl: store.promotionCtaUrl,
      heroSlides: readStoreHeroSlides(store.heroSlides),
      contentOrder: readStoreContentOrder(store.contentOrder, animations),
      sectionBackgrounds: store.sectionBackgrounds && typeof store.sectionBackgrounds === "object" && !Array.isArray(store.sectionBackgrounds)
        ? store.sectionBackgrounds
        : {},
      layoutStyle: store.layoutStyle,
      experienceStyle: store.experienceStyle,
      motionDuoEnabled: store.motionDuoEnabled,
      motionExperience: store.motionExperience,
      motionExperiences,
      animations,
      editorialGallery,
      buttonVariant: store.buttonVariant,
      buttonMotion: store.buttonMotion,
      cartButtonLabel: store.cartButtonLabel,
      siteDocument: store.siteDocument,
      checkoutMode: store.checkoutMode,
      leadCaptureUrl: store.leadCaptureUrl,
      cartRecommendationsEnabled: store.cartRecommendationsEnabled,
      cartRecommendationProductIds: readStringArray(store.cartRecommendationProductIds),
      bundles,
      showLowStockToCustomers: store.showLowStockToCustomers,
      appointmentOfferings,
      links: links.map((l) => ({ id: l.id, label: l.label, url: l.url })),
      catalogLayout: readCatalogLayout(store.catalogLayout),
      collections: collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        // Only products the shopper can actually see travel with the collection.
        productIds: collection.products
          .map((row) => row.paymentLinkId)
          .filter((id) => publicProductIds.has(id)),
      })),
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        bannerUrl: c.bannerUrl,
        highlights: c.highlights.slice(0, 4),
      })),
      items: items.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        fulfillmentType: item.fulfillmentType,
        name: item.name,
        description: item.description,
        imageUrls: item.imageUrls,
        imagePositions: item.imagePositions,
        tags: item.tags,
        specifications: Array.isArray(item.specifications) ? item.specifications : [],
        highlights: Array.isArray(item.highlights) ? item.highlights : [],
        recommendedProductIds: item.recommendedProductIds,
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
        // A box choice that stands for a product shows that product's live name and photo; one that was
        // archived or deleted drops out of the box instead of selling something the store no longer offers.
        extras: readProductExtras(item.extras).flatMap((extra) => {
          const product = extra.productId ? itemsById.get(extra.productId) : undefined;
          if (extra.productId && !product) return [];
          return [{
            id: extra.id,
            name: product?.name ?? extra.name,
            amount: extra.amount,
            required: extra.required,
            ...(extra.groupName ? { groupName: extra.groupName, freeAllowance: extra.freeAllowance ?? 0, ...(extra.pickCount ? { pickCount: extra.pickCount } : {}) } : {}),
            ...(product ? { productId: product.id, ...(product.imageUrls[0] ? { imageUrl: product.imageUrls[0] } : {}) } : {}),
            available: (extra.stock === undefined || (extra.inventoryKey ? sharedExtraStock.get(extra.inventoryKey) !== 0 : extra.stock !== 0)) && product?.stock !== 0,
          }];
        }),
        amount: item.amount,
        currency: item.currency,
        discountPercent: item.discountPercent,
        discountStartsAt: item.discountStartsAt?.toISOString() ?? null,
        discountEndsAt: item.discountEndsAt?.toISOString() ?? null,
        soldCount: soldByProduct.get(item.id) ?? 0,
      })),
    };
  }

  /** Public — turns a cart (one or more items, from the same store as `slug`) into a
   * single PaymentIntent, i.e. one payment/one QR for the whole cart. */
  async createCartCheckout(slug: string, dto: CartCheckoutDto, quoteOnly = false) {
    const store = await this.findActiveBySlugPublic(slug);
    if (store.checkoutMode === "whatsapp" || store.checkoutMode === "external") {
      throw new BadRequestException("Esta tienda no tiene habilitados los pagos integrados");
    }
    const funnelVisit = !quoteOnly && dto.funnelToken ? await this.prisma.storeFunnelVisit.findFirst({ where: { token: dto.funnelToken, storeId: store.id, createdAt: { gte: new Date(Date.now() - 86400000) } }, select: { id: true } }) : null;
    const sourceVisit = dto.sourceVisitToken ? await this.prisma.storeSourceVisit.findFirst({ where: { token: dto.sourceVisitToken, createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, experiment: { storeId: store.id } }, select: { id: true } }) : null;
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

    const digitalOnly = links.every(link => link.fulfillmentType === 'DIGITAL');
    const digitalAssets = store.digitalGoodsEnabled ? await this.prisma.digitalAsset.findMany({ where: { storeId: store.id, productId: { in: links.map(link => link.id) }, active: true }, select: { id: true, productId: true } }) : [];
    for (const link of links) if (link.fulfillmentType === 'DIGITAL' && !digitalAssets.some(asset => asset.productId === link.id)) throw new BadRequestException(`El archivo de "${link.name}" no está disponible.`);
    const locations = digitalOnly ? [] : readStoreLocations(store.locations);
    const fulfillmentLocation = locations.length ? locations.find((location) => location.id === dto.locationId) : undefined;
    if (locations.length && !fulfillmentLocation) throw new BadRequestException("Elige una ubicación para tu pedido");
    if (fulfillmentLocation && dto.fulfillmentMethod === "pickup" && !fulfillmentLocation.pickupEnabled) throw new BadRequestException("Esta ubicación no ofrece retiro");
    if (fulfillmentLocation && dto.fulfillmentMethod === "delivery" && !fulfillmentLocation.deliveryEnabled) throw new BadRequestException("Esta ubicación no ofrece entrega");
    if (fulfillmentLocation && !dto.fulfillmentMethod) throw new BadRequestException("Elige retiro o entrega");
    const fulfillmentReadyAt = fulfillmentLocation ? nextStoreLocationOpenAt(fulfillmentLocation) : null;

    const currency = links[0].currency;
    if (links.some((l) => l.currency !== currency)) {
      throw new BadRequestException("Todos los productos del carrito deben usar la misma moneda");
    }

    // Soft check here (a real reservation would need a lock) — the hard
    // guarantee against overselling is the atomic decrement on payment
    // success (see PaymentIntentsService.applyRailResult), which never lets
    // stock go negative even if two carts race past this check.
    const { picked, linked } = await this.pickedProductStock(store.id, links, dto.items);
    for (const l of [...links, ...linked]) {
      const requested = (quantityByLinkId.get(l.id) ?? 0) + (picked.get(l.id) ?? 0);
      if (quantityByLinkId.has(l.id) && fulfillmentLocation && l.fulfillmentType !== 'DIGITAL') {
        const branchStock = readLocationStocks(l.locationStocks)[fulfillmentLocation.id] ?? 0;
        if (branchStock !== null && branchStock < requested) {
          throw new BadRequestException(`La ubicación ${fulfillmentLocation.name} no tiene suficiente stock de "${l.name}"`);
        }
      }
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
        digitalAssetIds?: string[];
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

      const selectedExtras = resolveSelectedExtras(link.name, extras, item.extraIds);
      const selectedExtraIds = selectedExtras.map((extra) => extra.id);
      const exhaustedExtra = selectedExtras.find((extra) => extra.stock === 0);
      if (exhaustedExtra) throw new BadRequestException(`"${exhaustedExtra.name}" está agotado`);

      const lineKey = `${link.id}:${variant?.id ?? "base"}:${selectedExtraIds.join("+")}`;
      const existing = selectedLines.get(lineKey);
      if (existing) existing.quantity += item.quantity;
      else {
        selectedLines.set(lineKey, {
          paymentLinkId: link.id,
          ...(link.fulfillmentType === 'DIGITAL' ? { digitalAssetIds: digitalAssets.filter(asset => asset.productId === link.id).map(asset => asset.id) } : {}),
          ...(variant && { variantId: variant.id, variantName: variant.name }),
          ...(variant && variant.stock !== undefined && { optionStock: variant.stock }),
          ...(selectedExtraIds.length && { extraIds: selectedExtraIds, extras: selectedExtras }),
          name: link.name,
          quantity: item.quantity,
          unitAmount: discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(selectedExtras),
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
    const subtotal = cartLines.reduce((sum, line) => sum + line.unitAmount * line.quantity, 0);
    const promo = dto.promoCode ? await this.promoCodes!.resolveActiveForStore(store.id, dto.promoCode) : null;
    const promoDiscountAmount = promo
      ? this.promoCodes!.discountAmount(subtotal, promo.discountType, promo.discountValue)
      : 0;
    const bundles = store.bundlesEnabled ? await this.prisma.storeBundle.findMany({ where: { storeId: store.id, active: true } }) : [];
    const bundle = bestBundleDiscount(bundles as unknown as Bundle[], cartLines);
    const discountAmount = Math.max(promoDiscountAmount, bundle.amount);
    let shipping: { id: string; name: string; amount: number; currency: string } | null = null;
    let shippingOptions: Array<{ id: string; name: string; amount: number; currency: string }> = [];
    if (store.shippingEnabled && !digitalOnly) {
      if (!quoteOnly && !dto.fulfillmentMethod) throw new BadRequestException('Elige retiro o envío.');
      if (dto.fulfillmentMethod === 'pickup' && !store.shippingPickupEnabled) throw new BadRequestException('Esta tienda no ofrece retiro.');
      const weightGrams = links.some(link => link.shippingWeightGrams == null) ? null : links.reduce((sum, link) => sum + link.shippingWeightGrams! * quantityByLinkId.get(link.id)!, 0);
      const rates = await this.prisma.deliveryZone.findMany({ where: { storeId: store.id, isActive: true } });
      const quote = quoteShipping(rates, { shippingCountry: dto.shippingCountry, shippingPostalCode: dto.shippingPostalCode, zoneId: dto.fulfillmentMethod === 'pickup' ? undefined : dto.shippingZoneId, currency, subtotal: subtotal - discountAmount, weightGrams });
      shippingOptions = quote.options;
      if (dto.fulfillmentMethod === 'delivery') {
        shipping = quote.selected;
        if (!quoteOnly && (!shipping || !dto.shippingAddress?.trim())) throw new BadRequestException('Elige una opción de envío y escribe la dirección.');
      }
    } else if (dto.shippingZoneId && !digitalOnly) throw new BadRequestException('Esta tienda no tiene tarifas de envío activadas.');
    const shippingAmount = shipping?.amount ?? 0;
    const amount = subtotal - discountAmount + shippingAmount;
    if (dto.creditCode && !store.creditsEnabled) throw new BadRequestException('Esta tienda no acepta códigos de saldo.');
    const creditAmount = dto.creditCode ? (await creditQuote(this.prisma, store.id, dto.creditCode, currency, amount)).amount : 0;
    if (quoteOnly) return { orderTotal: amount, creditAmount, subtotal, discountAmount, shippingAmount, amount: amount - creditAmount, currency, shippingOptions, shippingEnabled: store.shippingEnabled && !digitalOnly, pickupEnabled: store.shippingPickupEnabled };


    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${selectedExtrasLabel(line.extras)}` : ""} x${line.quantity}`)
      .join(", ");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
    }

    // Snapshot the server-owned rate on the order; later edits cannot change it.
    const partner = dto.partnerCode ? await this.prisma.storePartner.findFirst({
      where: { storeId: store.id, code: dto.partnerCode, active: true },
    }) : null;
    const livemode = merchant.status === MerchantStatus.ACTIVE;
    const checkout = await this.prisma.$transaction(async (tx) => {
      let created = await this.paymentIntents.createInTransaction(tx, store.merchantId, livemode, {
        amount,
        currency,
        description,
        metadata: {
          cart: cartLines,
          storeId: store.id,
          ...(shipping ? { shipping: { ...shipping, address: dto.shippingAddress!.trim(), ...(dto.shippingCountry ? { country: dto.shippingCountry } : {}), ...(dto.shippingPostalCode ? { postalCode: dto.shippingPostalCode } : {}) }, subtotal } : {}),
          ...(fulfillmentLocation ? { fulfillment: { locationId: fulfillmentLocation.id, locationName: fulfillmentLocation.name, method: dto.fulfillmentMethod, ...(dto.fulfillmentMethod === 'delivery' && dto.shippingAddress?.trim() ? { address: dto.shippingAddress.trim() } : {}), ...(fulfillmentReadyAt ? { readyAt: fulfillmentReadyAt.toISOString() } : {}) } } : {}),
          ...(bundle.amount > promoDiscountAmount ? { bundle: { id: bundle.id, name: bundle.name, discountAmount: bundle.amount }, subtotal } : {}),
          ...(promo && promoDiscountAmount >= bundle.amount ? {
            promoCode: promo.code,
            promoDiscountType: promo.discountType,
            promoDiscountValue: promo.discountValue,
            promoDiscountAmount,
            subtotal,
          } : {}),
        },
      });
      if (dto.creditCode) {
        const applied = await reserveCredit(tx, created.id, store.id, dto.creditCode, currency, amount);
        created = await tx.paymentIntent.update({ where: { id: created.id }, data: { amount: amount - applied, metadata: { ...(created.metadata as Prisma.JsonObject), storeCredit: { amount: applied, orderTotal: amount } } } });
      }
      const order = await tx.storeOrder.create({
        data: {
          paymentIntentId: created.id,
          ...(sourceVisit ? { sourceVisitId: sourceVisit.id } : {}),
          ...(funnelVisit ? { funnelVisitId: funnelVisit.id } : {}),
          ...(partner ? { partnerId: partner.id, partnerCommissionBps: partner.commissionBps } : {}),
          merchantId: store.merchantId,
          storeId: store.id,
          storeName: store.name,
          ...(!fulfillmentLocation && store.shippingEnabled && !digitalOnly ? { fulfillmentMethod: dto.fulfillmentMethod } : {}),
          ...(fulfillmentLocation ? {
            fulfillmentLocationId: fulfillmentLocation.id,
            fulfillmentLocationName: fulfillmentLocation.name,
            fulfillmentMethod: dto.fulfillmentMethod,
            ...(fulfillmentReadyAt ? { fulfillmentReadyAt } : {}),
          } : {}),
          items: cartLines as Prisma.InputJsonValue,
          amount,
          currency,
          statusEvents: { create: { status: OrderFulfillmentStatus.AWAITING_PAYMENT } },
        },
      });
      if (shipping) await tx.deliveryAssignment.create({ data: { merchantId: store.merchantId, storeId: store.id, orderId: order.id, zoneId: shipping.id, fee: shipping.amount, address: dto.shippingAddress!.trim() } });
      if (created.amount === 0 && dto.creditCode) created = await this.paymentIntents.completeCreditPaymentInTransaction(tx, created.id);
      return { intent: created, orderId: order.id };
    });

    const trackingSecret = this.config?.get<string>("app.orderTrackingSecret") ?? DEVELOPMENT_ORDER_TRACKING_SECRET;

    return {
      ...checkout.intent,
      trackingToken: createOrderTrackingToken(checkout.orderId, trackingSecret),
      storeName: store.name,
      cartDescription: description,
      contactPhone: store.contactPhone,
      contactEmail: store.contactEmail,
      ...(!fulfillmentLocation && store.shippingEnabled && !digitalOnly ? { fulfillmentMethod: dto.fulfillmentMethod } : {}),
      ...(fulfillmentLocation ? { fulfillmentLocationName: fulfillmentLocation.name, fulfillmentMethod: dto.fulfillmentMethod } : {}),
    };
  }

  /** Public lead capture for stores that finish outside the pagosYa payment flow.
   * The browser only submits product ids; names and prices are resolved again
   * from this store so the notification cannot be used to spoof its catalog. */
  async submitLead(slug: string, dto: SubmitStoreLeadDto) {
    const store = await this.findActiveBySlugPublic(slug);

    const isContactMessage = dto.items.length === 0;
    if (isContactMessage && !store.contactFormEnabled) {
      throw new BadRequestException("El formulario de contacto no está habilitado para esta tienda");
    }
    const customerName = dto.name?.trim() || "Cliente interesado";
    const customerEmail = dto.email.trim().toLowerCase();
    const customerPhone = dto.phone?.trim() || "";
    if (isContactMessage && !dto.message?.trim()) {
      throw new BadRequestException("Escribe un mensaje");
    }
    if (!isContactMessage && store.checkoutMode === "payment" && (!dto.name?.trim() || !customerPhone)) {
      throw new BadRequestException("Escribe tu nombre y WhatsApp para confirmar el pedido gratis");
    }
    const locations = readStoreLocations(store.locations);
    const fulfillmentLocation = !isContactMessage && locations.length
      ? locations.find((location) => location.id === dto.locationId)
      : undefined;
    const fulfillmentReadyAt = fulfillmentLocation ? nextStoreLocationOpenAt(fulfillmentLocation) : null;
    if (!isContactMessage && locations.length && !fulfillmentLocation) throw new BadRequestException("Elige una ubicación para tu pedido");
    if (fulfillmentLocation && dto.fulfillmentMethod === "pickup" && !fulfillmentLocation.pickupEnabled) throw new BadRequestException("Esta ubicación no ofrece retiro");
    if (fulfillmentLocation && dto.fulfillmentMethod === "delivery" && !fulfillmentLocation.deliveryEnabled) throw new BadRequestException("Esta ubicación no ofrece entrega");
    if (fulfillmentLocation && !dto.fulfillmentMethod) throw new BadRequestException("Elige retiro o entrega");
    if (customerPhone) {
      const digitCount = customerPhone.replace(/\D/g, "").length;
      if (digitCount < 7 || digitCount > 15) throw new BadRequestException("Escribe un número de WhatsApp válido");
    }

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

      const extras = resolveSelectedExtras(link.name, availableExtras, item.extraIds);
      const selectedExtraIds = extras.map((extra) => extra.id);

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

      const unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(extras);
      const details = [variant?.name, selectedExtrasLabel(extras, " · ")].filter(Boolean).join(" · ");
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
    const { picked, linked } = await this.pickedProductStock(store.id, links, dto.items);
    for (const link of [...links, ...linked]) {
      const requested = (requestedByProduct.get(link.id) ?? 0) + (picked.get(link.id) ?? 0);
      if (fulfillmentLocation && requestedByProduct.has(link.id)) {
        const branchStock = readLocationStocks(link.locationStocks)[fulfillmentLocation.id] ?? 0;
        if (branchStock !== null && requested > branchStock) {
          throw new BadRequestException(`La ubicación ${fulfillmentLocation.name} no tiene suficiente stock de "${link.name}"`);
        }
      }
      if (link.stock !== null && requested > link.stock) {
        throw new BadRequestException(`Solo quedan ${link.stock} unidades de "${link.name}"`);
      }
    }
    for (const item of [...requestedByOption.values(), ...requestedByExtraPool.values()]) {
      if (item.quantity > item.stock) throw new BadRequestException(`Solo quedan ${item.stock} unidades de "${item.name}"`);
    }
    const grandTotal = lines.reduce((sum, line) => sum + line.amount, 0);
    if (!isContactMessage && store.checkoutMode !== "external" && (store.checkoutMode !== "payment" || grandTotal > 0)) {
      throw new BadRequestException("Esta tienda solo recibe formularios para pedidos con total cero");
    }
    const currencies = [...new Set(lines.map((line) => line.currency))];
    const totals = currencies.map((currency) => {
      const amount = lines.filter((line) => line.currency === currency).reduce((sum, line) => sum + line.amount, 0);
      return `${(amount / 100).toFixed(2)} ${currency}`;
    });
    const recipient = isContactMessage
      ? store.contactFormEmail || store.contactEmail || merchant.email
      : store.contactEmail || merchant.email;
    const body = isContactMessage
      ? [
          `Nuevo mensaje desde ${store.name}`,
          "",
          `Nombre: ${customerName}`,
          `Correo para responder: ${customerEmail}`,
          ...(customerPhone ? [`WhatsApp: ${customerPhone}`] : []),
          `Mensaje: ${dto.message?.trim() || "Sin mensaje"}`,
          "",
          "Este mensaje fue enviado desde el formulario de contacto de pagosYa.",
        ].join("\n")
      : [
          `Nuevo interesado desde ${store.name}`,
          "",
          `Correo: ${customerEmail}`,
          ...(dto.name?.trim() ? [`Nombre: ${customerName}`] : []),
          ...(customerPhone ? [`WhatsApp: ${customerPhone}`] : []),
          ...(fulfillmentLocation ? [`Ubicación: ${fulfillmentLocation.name}`, `Modalidad: ${dto.fulfillmentMethod === "delivery" ? "Entrega" : "Retiro"}`] : []),
          ...(fulfillmentReadyAt ? [`Disponible desde: ${fulfillmentReadyAt.toLocaleString("es-BO", { timeZone: "America/La_Paz" })}`] : []),
          ...(dto.message?.trim() ? [`Mensaje: ${dto.message.trim()}`] : []),
          "",
          "Productos seleccionados:",
          ...lines.map((line) => `- ${line.label}`),
          `Total de referencia: ${totals.join(" + ")}`,
          "",
          "Este mensaje fue enviado por pagosYa. Responde al correo indicado por el cliente.",
        ].join("\n");

    const lead = await this.prisma.storeLead.create({
      data: {
        merchantId: store.merchantId,
        storeId: store.id,
        customerName,
        customerEmail,
        customerPhone,
        message: dto.message?.trim() || null,
        items: lines as Prisma.InputJsonValue,
        amount: grandTotal,
        currency: currencies[0] || "BOB",
      },
      select: { id: true },
    });
    await this.emailProvider?.send({
      to: recipient,
      subject: isContactMessage
        ? `Nuevo mensaje para ${store.name}: ${customerName}`
        : `Nuevo interesado en ${store.name}: ${dto.name?.trim() || customerEmail}`,
      body,
      replyTo: customerEmail,
      failLoudly: true,
    }).catch(() => this.logger.warn("Lead saved; email notification failed"));
    return { submitted: true, leadId: lead.id };
  }

  async subscribeNewsletter(slug: string, rawEmail: string) {
    const store = await this.findActiveBySlugPublic(slug);
    const email = rawEmail.trim().toLowerCase();
    await this.prisma.storeNewsletterSubscriber.upsert({
      where: { storeId_email: { storeId: store.id, email } },
      create: { storeId: store.id, email },
      update: { isActive: true },
    });
    return { subscribed: true };
  }
}
