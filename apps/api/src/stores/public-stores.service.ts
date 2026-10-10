import { Injectable, Logger, NotFoundException, OnModuleDestroy } from "@nestjs/common";
import { MerchantStatus, PaymentLinkStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { findActiveStoreBySlug, PUBLIC_STORE_WHERE } from "./active-store";
import { readCatalogLayout } from "./catalog-layout";
import { readStoreLocations, readLocationStocks } from "./store-locations";
import { storePolicies } from "./store-presentation";
import { readStoreHeroSlides, readStoreEditorialGallery, readStoreMotionExperiences, readStoreAnimations, readStoreContentOrder } from "./store-presentation";
import { readProductExtras, readStringArray, readProductVariants } from "./product-pricing";
import { publishedStoreLook } from "./store-dna";
import { PAID_STATUSES } from "../store-knowledge/store-knowledge";
import { topSellerId, TOP_SELLER_WINDOW_DAYS } from "./top-seller";

/** What shoppers read: a published store with its catalog, the store directory, newsletter sign-ups, and batched view counting. */
@Injectable()
export class PublicStoresService implements OnModuleDestroy {
  private readonly logger = new Logger(PublicStoresService.name);
  private readonly pendingStoreViews = new Map<string, number>();
  private storeViewFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private storeViewFlushPromise: Promise<void> | null = null;
  private destroyed = false;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private queueStoreView(storeId: string): void {
    this.pendingStoreViews.set(storeId, (this.pendingStoreViews.get(storeId) ?? 0) + 1);
    if (this.destroyed || this.storeViewFlushTimer || this.storeViewFlushPromise) return;
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
      // An async callback turns a synchronous throw (e.g. a client without store.update) into a rejection allSettled can report.
      const results = await Promise.allSettled(batch.map(async ([storeId, count]) => this.prisma.store.update({
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
    } catch (error) {
      // Runs from a timer: nothing may escape into the process.
      this.logger.warn(`Storefront view flush failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.storeViewFlushPromise = null;
      if (!this.destroyed && this.pendingStoreViews.size && !this.storeViewFlushTimer) {
        this.storeViewFlushTimer = setTimeout(() => {
          this.storeViewFlushTimer = null;
          void this.flushPendingStoreViews();
        }, 5_000);
        this.storeViewFlushTimer.unref?.();
      }
    }
  }
  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    if (this.storeViewFlushTimer) {
      clearTimeout(this.storeViewFlushTimer);
      this.storeViewFlushTimer = null;
    }
    await this.flushPendingStoreViews();
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
      ...PUBLIC_STORE_WHERE,
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
    const [items, categories, links, productStats, appointmentOfferings, collections, look, paidOrders] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId: store.id, status: PaymentLinkStatus.ACTIVE },
        orderBy: { createdAt: "asc" },
        include: {
          subscriptionOptions: { orderBy: { cadence: "asc" }, select: { cadence: true, discountPercent: true } },
          membershipPeriods: { where: { archivedAt: null }, orderBy: { position: "asc" }, select: { id: true, months: true, amount: true } },
        },
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
      // The hosted order confirmation takes the store's button form, radius and confirmation motif from the published config.
      publishedStoreLook(this.prisma, store.id, store.publishedSourceRevision),
      this.prisma.storeOrder.findMany({
        where: { storeId: store.id, status: { in: [...PAID_STATUSES] }, createdAt: { gte: new Date(Date.now() - TOP_SELLER_WINDOW_DAYS * 86_400_000) } },
        select: { items: true }, take: 5000,
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
      dna: look?.dna ?? null,
      confirmationMotif: look?.confirmationMotif ?? null,
      storeName: store.name,
      creditsEnabled: store.creditsEnabled, digitalGoodsEnabled: store.digitalGoodsEnabled, shippingEnabled: store.shippingEnabled, shippingPickupEnabled: store.shippingPickupEnabled, shippingCarriersEnabled: store.shippingCarriersEnabled, bundlesEnabled: store.bundlesEnabled, subscriptionsEnabled: store.subscriptionsEnabled,
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
      topSellerId: topSellerId(paidOrders),
      showLowStockToCustomers: store.showLowStockToCustomers,
      policies: storePolicies(store.policies),
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
        badge: typeof item.badge === 'string' ? item.badge : null,
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
        contentBlocks: readContentBlocks(item.contentBlocks),
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
        subscriptionOptions: store.subscriptionsEnabled && item.fulfillmentType !== "DIGITAL" && item.fulfillmentType !== "MEMBERSHIP" ? item.subscriptionOptions : [],
        membershipPeriods: item.fulfillmentType === "MEMBERSHIP" ? item.membershipPeriods : [],
      })),
    };
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

  /** What a shopper may verify about a store, from platform records only. Deliberately excludes the
   * legal name, NIT and representative: for a sole trader those identify a person. */
  async verification(slug: string) {
    const store = await this.prisma.store.findFirst({
      where: { slug, ...PUBLIC_STORE_WHERE },
      select: { id: true, name: true, slug: true, merchantId: true, createdAt: true, checkoutMode: true, merchant: { select: { status: true } },
        customDomains: { where: { status: "ACTIVE" }, select: { hostname: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    if (!store) throw new NotFoundException("Tienda no encontrada");
    const [kyc, invoicing, reviews] = await Promise.all([
      this.prisma.merchantKycSubmission.findFirst({ where: { merchantId: store.merchantId, status: "APPROVED" }, orderBy: { reviewedAt: "asc" }, select: { reviewedAt: true } }),
      this.prisma.merchantInvoicingProfile.findFirst({ where: { merchantId: store.merchantId }, select: { cuis: true } }),
      this.prisma.storeReview.aggregate({ where: { storeId: store.id, status: "PUBLISHED" }, _count: { _all: true }, _avg: { rating: true } }),
    ]);
    const verified = store.merchant.status === MerchantStatus.ACTIVE && Boolean(kyc);
    return {
      storeName: store.name,
      slug: store.slug,
      verifiedBusiness: verified,
      verifiedSince: verified ? kyc?.reviewedAt?.toISOString().slice(0, 10) ?? null : null,
      electronicInvoicing: Boolean(invoicing?.cuis),
      securePayments: store.checkoutMode === "payment" && verified,
      onPlatformSince: store.createdAt.toISOString().slice(0, 10),
      reviews: { count: reviews._count._all, average: reviews._avg.rating ? Math.round(reviews._avg.rating * 10) / 10 : null },
      officialDomain: store.customDomains[0]?.hostname ?? null,
    };
  }
}
import { readContentBlocks } from '../payment-links/product-content-blocks';
