import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { customAlphabet } from "nanoid";
import { MerchantStatus, PaymentMethodType, Prisma, StoreStatus } from "@prisma/client";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  CreateStoreDto
} from "./dto/create-store.dto";
import { type StoreAnimationDto } from "./dto/store-motion.dto";
import { type StoreLocationDto } from "./dto/store-location.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { SaveStoreSettingsDto } from "./dto/save-store-settings.dto";
import { SaveWebsiteDraftDto } from "./dto/save-website-draft.dto";
import { assertWebsiteRevision, saveWebsiteDraftPatch, websiteDraft, websiteEditorStore, websiteUpdateData, WebsiteDraft } from "./website-draft";
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { assertValidStoreLocations, storeLocationSnapshot } from "./store-locations";
import { DEFAULT_STORE_ANIMATION, normalizeAnimationMedia, animationContentSection, DEFAULT_STORE_CONTENT_ORDER, type StoreAnimation, storeUpdateData, readStoreHeroSlides, readStoreEditorialGallery } from "./store-presentation";
import { mergeOnboarding, onboardingBrief, onboardingQuestions, type StoreOnboardingPatch } from "./store-onboarding";
const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);

/** Store management for the merchant: creating, configuring, publishing the website draft, links, archiving, and quick QR payments. */
@Injectable()
export class StoresService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentIntents: PaymentIntentsService,
    private readonly uploads: UploadsService,
  ) {}

  async onboardingState(merchantId: string, enabled: boolean, storeId?: string) {
    if (!enabled) return { enabled: false, store: null };
    if (storeId) {
      // A specific store (the list's Continuar): the merchant's own, active and unfinished, with its full answers.
      const one = await this.prisma.store.findFirst({ where: { id: storeId, merchantId, status: StoreStatus.ACTIVE }, select: { id: true, name: true, onboarding: true } });
      const unfinished = Boolean(one?.onboarding) && !(one!.onboarding as { finishedAt?: string }).finishedAt;
      return { enabled: true, store: one && unfinished ? { id: one.id, name: one.name, onboarding: one.onboarding, questions: onboardingQuestions(one.onboarding as { what?: string } | null) } : null };
    }
    const stores = await this.prisma.store.findMany({ where: { merchantId, status: StoreStatus.ACTIVE }, select: { id: true, name: true, onboarding: true }, orderBy: { createdAt: 'desc' }, take: 50 });
    // The newest store that started the walkthrough and never finished it resumes; stores from before the walkthrough (null) never do.
    const open = stores.find((store) => store.onboarding && !(store.onboarding as { finishedAt?: string }).finishedAt) ?? null;
    return { enabled: true, store: open ? { id: open.id, name: open.name, onboarding: open.onboarding, questions: onboardingQuestions(open.onboarding as { what?: string } | null) } : null };
  }

  async saveOnboarding(merchantId: string, storeId: string, patch: StoreOnboardingPatch) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId }, select: { name: true, onboarding: true } });
    if (!store) throw new NotFoundException('Tienda no encontrada.');
    const onboarding = mergeOnboarding(store.onboarding, patch);
    await this.prisma.store.update({ where: { id: storeId }, data: { onboarding: onboarding as unknown as Prisma.InputJsonValue, ...(patch.contact?.whatsapp && onboarding.contact?.whatsapp ? { contactPhone: onboarding.contact.whatsapp } : {}), ...(patch.primaryAction && onboarding.primaryAction?.kind === 'form' ? { contactFormEnabled: true } : {}) } });
    // Spec 2026-10-14 store voice: every save answers with the kind questions, so the walkthrough asks them once «¿Qué vendes?» is known.
    const questions = onboardingQuestions(onboarding);
    if (!patch.finished && !patch.brief) return { onboarding, questions };
    const products = await this.prisma.paymentLink.findMany({ where: { storeId }, select: { name: true, amount: true }, orderBy: { createdAt: 'asc' }, take: 5 });
    return { onboarding, questions, brief: onboardingBrief(store.name, onboarding, products) };
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
  /** `db` lets a caller create the store inside its own transaction (the Shopify import writes store and catalog at once). */
  async create(merchantId: string, dto: CreateStoreDto, db: Prisma.TransactionClient = this.prisma) {
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
        return await db.store.create({
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
    const stores = await this.prisma.store.findMany({
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
    // The list needs only the walkthrough's progress marker (a "Sin terminar" badge); the answers stay behind /stores/onboarding.
    return stores.map((store) => ({ ...store, onboarding: listedOnboarding(store.onboarding) }));
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
        data: { ...websiteUpdateData(draft.data) as Prisma.StoreUpdateManyMutationInput, publicVisibility: true,
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
  }}

/** What the store list shows of the walkthrough state: null for stores that never started it. */
export function listedOnboarding(raw: unknown): { step: number | null; finishedAt: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const { step, finishedAt } = raw as { step?: unknown; finishedAt?: unknown };
  return { step: typeof step === "number" ? step : null, finishedAt: typeof finishedAt === "string" ? finishedAt : null };
}
