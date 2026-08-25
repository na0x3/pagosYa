import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { customAlphabet } from "nanoid";
import { MerchantStatus, OrderFulfillmentStatus, PaymentLinkStatus, PaymentMethodType, Prisma, StoreStatus } from "@prisma/client";
import * as QRCode from "qrcode";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentIntentsService } from "../payment-intents/payment-intents.service";
import { UploadsService } from "../uploads/uploads.service";
import {
  CreateStoreDto,
  STORE_BASE_CONTENT_SECTIONS,
  STORE_CONTENT_SECTIONS,
  STORE_MOTION_EXPERIENCES,
  type StoreAnimationDto,
  type StoreLocationDto,
} from "./dto/create-store.dto";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { SetStoreLinksDto } from "./dto/set-store-links.dto";
import { CartCheckoutDto } from "../payment-links/dto/cart-checkout.dto";
import { SaveStoreSettingsDto } from "./dto/save-store-settings.dto";
import { SubmitStoreLeadDto } from "./dto/submit-store-lead.dto";
import { EMAIL_PROVIDER } from "../dashboard/tokens";
import { EmailProvider } from "../dashboard/interfaces/email-provider.interface";
import { CreateQuickQrPaymentDto } from "./dto/create-quick-qr-payment.dto";
import { PromoCodesService } from "../promo-codes/promo-codes.service";
import { createOrderTrackingToken } from "../consumer/order-tracking-token";

const slugPart = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 8);
const MAX_DESCRIPTION_LENGTH = 480;
const DEVELOPMENT_ORDER_TRACKING_SECRET = "development-only-order-tracking-secret-change-me";
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
type StoreHeroSlide = {
  imageUrl: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};
type StoreContentSection = string;
type StoreEditorialImage = { imageUrl: string; title?: string; caption?: string; body?: string; boxColor?: string };
type StoreAnimation = {
  id: string;
  name: string;
  type: string;
  title?: string;
  subtitle?: string;
  productId?: string;
  media: StoreEditorialImage[];
};
const DEFAULT_STORE_ANIMATION: StoreAnimation = {
  id: "welcome",
  name: "Bienvenida en movimiento",
  type: "clarity-marquee",
  title: "Descubre la tienda",
  subtitle: "Conoce la selección y encuentra lo que buscas.",
  media: [],
};
const DEFAULT_STORE_CONTENT_ORDER: StoreContentSection[] = [
  animationContentSection(DEFAULT_STORE_ANIMATION.id),
  "hero",
  "about",
  "products",
  "gallery",
  "links",
  "contact",
  "location",
];
type StoreLocation = {
  id: string;
  name: string;
  address?: string;
  mapEmbedUrl?: string;
  description?: string;
  highlight?: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  openingHours: Array<{ day: number; open: string; close: string; closed: boolean }>;
};

function storeLocationSnapshot(locations: StoreLocationDto[]): StoreLocation[] {
  return locations.map((location) => ({
    id: location.id,
    name: location.name.trim(),
    ...(location.address?.trim() ? { address: location.address.trim() } : {}),
    ...(location.mapEmbedUrl?.trim() ? { mapEmbedUrl: location.mapEmbedUrl.trim() } : {}),
    ...(location.description?.trim() ? { description: location.description.trim() } : {}),
    ...(location.highlight?.trim() ? { highlight: location.highlight.trim() } : {}),
    pickupEnabled: location.pickupEnabled,
    deliveryEnabled: location.deliveryEnabled,
    openingHours: (location.openingHours || []).map((hours) => ({ day: hours.day, open: hours.open, close: hours.close, closed: hours.closed })),
  }));
}

function assertValidStoreLocations(locations: StoreLocationDto[]): void {
  for (const location of locations) {
    if (!location.name.trim()) throw new BadRequestException("Escribe un nombre para cada ubicación");
    if (!location.pickupEnabled && !location.deliveryEnabled) {
      throw new BadRequestException(`${location.name.trim()} debe permitir retiro, entrega o ambas opciones`);
    }
    const invalidHours = (location.openingHours || []).find((hours) => !hours.closed && hours.open >= hours.close);
    if (invalidHours) throw new BadRequestException(`La hora de cierre de ${location.name.trim()} debe ser posterior a la apertura`);
  }
}

function nextStoreLocationOpenAt(location: StoreLocation, now = new Date()): Date | null {
  if (!location.openingHours.length) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    weekday: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[parts.weekday] ?? 0;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const today = location.openingHours.find((entry) => entry.day === weekday);
  if (today && !today.closed && minuteOfDay >= toMinutes(today.open) && minuteOfDay < toMinutes(today.close)) return null;
  for (let offset = 0; offset <= 7; offset += 1) {
    const hours = location.openingHours.find((entry) => entry.day === (weekday + offset) % 7);
    if (!hours || hours.closed || (offset === 0 && toMinutes(hours.open) <= minuteOfDay)) continue;
    const [hour, minute] = hours.open.split(":").map(Number);
    return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset, hour + 4, minute));
  }
  return null;
}

function readStoreLocations(value: Prisma.JsonValue): StoreLocation[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is StoreLocation =>
    !!entry && typeof entry === "object" && !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>).id === "string" &&
    typeof (entry as Record<string, unknown>).name === "string" &&
    typeof (entry as Record<string, unknown>).pickupEnabled === "boolean" &&
    typeof (entry as Record<string, unknown>).deliveryEnabled === "boolean",
  ).map((entry) => ({ ...entry, openingHours: Array.isArray(entry.openingHours) ? entry.openingHours : [] }));
}

function readLocationStocks(value: Prisma.JsonValue): Record<string, number | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, stock]) => stock === null || (Number.isInteger(stock) && (stock as number) >= 0))) as Record<string, number | null>;
}

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

type DiscountableProduct = {
  discountPercent: number | null;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
};

function activeDiscountPercent(product: DiscountableProduct, now = new Date()): number | null {
  if (
    !Number.isInteger(product.discountPercent) ||
    product.discountPercent === null ||
    product.discountPercent < 1 ||
    product.discountPercent > 99 ||
    !product.discountStartsAt ||
    !product.discountEndsAt ||
    now < product.discountStartsAt ||
    now >= product.discountEndsAt
  ) return null;
  return product.discountPercent;
}

function discountedProductAmount(product: DiscountableProduct, amount: number, now = new Date()): number {
  const percent = activeDiscountPercent(product, now);
  return percent === null ? amount : Math.max(0, Math.round(amount * (100 - percent) / 100));
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

function animationContentSection(id: string): StoreContentSection {
  return `animation-${id}`;
}

function readStoreContentOrder(value: unknown, animations: StoreAnimation[]): StoreContentSection[] {
  const ordered = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const animationSections = animations.map((animation) => animationContentSection(animation.id));
  const animationSectionSet = new Set(animationSections);
  const unique: StoreContentSection[] = [];
  const append = (section: StoreContentSection) => {
    if (!unique.includes(section)) unique.push(section);
  };
  ordered.forEach((section) => {
    if (section === "motion") {
      animationSections.forEach(append);
      return;
    }
    if (section.startsWith("motion-")) {
      const legacyType = section.slice("motion-".length);
      animations
        .filter((animation) => animation.type === legacyType)
        .map((animation) => animationContentSection(animation.id))
        .forEach(append);
      return;
    }
    if (section.startsWith("animation-")) {
      if (animationSectionSet.has(section)) append(section);
      return;
    }
    if ((STORE_BASE_CONTENT_SECTIONS as readonly string[]).includes(section)) append(section);
  });
  ["hero", "products", "about", "gallery"].forEach((section) => {
    if (unique.includes(section)) return;
    const footerIndex = unique.findIndex((entry) => ["links", "contact", "location"].includes(entry));
    if (footerIndex < 0) append(section);
    else unique.splice(footerIndex, 0, section);
  });
  ["links", "contact", "location"].forEach(append);
  const missingAnimations = animationSections.filter((section) => !unique.includes(section));
  if (missingAnimations.length) unique.unshift(...missingAnimations);
  return unique;
}

function readStoreMotionExperiences(value: unknown, legacy: unknown): string[] {
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string =>
        typeof entry === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(entry),
      )
    : [];
  const unique = [...new Set(selected)];
  if (unique.length) return unique;
  if (typeof legacy === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(legacy)) return [legacy];
  return ["coverflow-carousel"];
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

const LEGACY_ANIMATION_NAMES: Record<string, string> = {
  "story-scroll": "Story Scroll",
  "coverflow-carousel": "Coverflow",
  "hero-carousel": "Hero editorial",
  "image-stream": "Image Stream",
  "scroll-expansion": "Scroll Expansion",
  "hero-gallery-scroll": "Hero Gallery",
  "stagger-testimonials": "Reseñas",
  "zoom-parallax": "Zoom Parallax",
  "video-pill": "Video que se abre",
  "portfolio-scroller": "Menú de momentos",
  "circle-reveal": "Revelado circular",
  "clarity-marquee": "Preguntas en movimiento",
  "full-screen-chapters": "Capítulos a pantalla completa",
  "magnetic-target": "Llamado magnético",
  "frame-sequence": "Secuencia por fotogramas",
  "3d-gallery": "Galería tridimensional",
};

function readStoreAnimations(
  value: unknown,
  enabled: boolean,
  legacyExperiences: string[],
  legacyGallery: StoreEditorialImage[],
): StoreAnimation[] {
  const parsed = Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Prisma.JsonObject =>
            !!entry &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            typeof entry.id === "string" &&
            /^[a-z0-9][a-z0-9_-]{0,47}$/.test(entry.id) &&
            typeof entry.name === "string" &&
            typeof entry.type === "string" &&
            (STORE_MOTION_EXPERIENCES as readonly string[]).includes(entry.type) &&
            Array.isArray(entry.media),
        )
        .map((entry) => ({
          id: entry.id as string,
          name: (entry.name as string).slice(0, 60),
          type: entry.type as string,
          ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
          ...(typeof entry.subtitle === "string" && entry.subtitle ? { subtitle: entry.subtitle } : {}),
          ...(typeof entry.productId === "string" && entry.productId ? { productId: entry.productId.slice(0, 80) } : {}),
          media: readStoreEditorialGallery(entry.media),
        }))
    : [];
  if (parsed.length || !enabled) return parsed;
  return legacyExperiences.slice(0, 8).map((type, index) => ({
    id: `legacy-${index + 1}-${type}`,
    name: LEGACY_ANIMATION_NAMES[type] ?? `Animación ${index + 1}`,
    type,
    title: LEGACY_ANIMATION_NAMES[type] ?? `Animación ${index + 1}`,
    media: legacyGallery.map((image) => ({ ...image })),
  }));
}

function storeUpdateData(dto: UpdateStoreDto): Prisma.StoreUpdateInput {
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.tagline !== undefined && { tagline: dto.tagline }),
    ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
    ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
    ...(dto.backgroundColor !== undefined && { backgroundColor: dto.backgroundColor, backgroundMode: "solid", backgroundGradientStart: dto.backgroundColor, backgroundGradientEnd: dto.backgroundColor, backgroundGradientAngle: 0, backgroundImageUrl: null, boardTexture: "painted" }),
    ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
    ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
    ...(dto.contactFormEnabled !== undefined && { contactFormEnabled: dto.contactFormEnabled }),
    ...(dto.contactFormEmail !== undefined && { contactFormEmail: dto.contactFormEmail }),
    ...(dto.locationMapUrl !== undefined && { locationMapUrl: dto.locationMapUrl }),
    ...(dto.locationDescription !== undefined && { locationDescription: dto.locationDescription }),
    ...(dto.locationHighlight !== undefined && { locationHighlight: dto.locationHighlight }),
    ...(dto.locations !== undefined && { locations: storeLocationSnapshot(dto.locations) as unknown as Prisma.InputJsonValue }),
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
    ...(dto.experienceStyle !== undefined && { experienceStyle: dto.experienceStyle }),
    ...(dto.motionDuoEnabled !== undefined && { motionDuoEnabled: dto.motionDuoEnabled }),
    ...(dto.motionExperience !== undefined && { motionExperience: dto.motionExperience }),
    ...(dto.motionExperiences !== undefined && {
      motionExperiences: dto.motionExperiences as unknown as Prisma.InputJsonValue,
      motionExperience: dto.motionExperiences[0],
    }),
    ...(dto.animations !== undefined && {
      animations: dto.animations as unknown as Prisma.InputJsonValue,
      motionDuoEnabled: dto.animations.length > 0,
      motionExperiences: [...new Set(dto.animations.map((animation) => animation.type))] as unknown as Prisma.InputJsonValue,
      motionExperience: dto.animations[0]?.type ?? "coverflow-carousel",
    }),
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
    @Optional() private readonly promoCodes?: PromoCodesService,
    @Optional() private readonly config?: ConfigService,
  ) {}

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

  /** A merchant can run several independent stores under one account — each gets its own slug/branding/catalog. */
  async create(merchantId: string, dto: CreateStoreDto) {
    if (dto.locations !== undefined) assertValidStoreLocations(dto.locations);
    const animations = dto.animations ?? [{ ...DEFAULT_STORE_ANIMATION, media: [] }];
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
            contactFormEnabled: dto.contactFormEnabled,
            contactFormEmail: dto.contactFormEmail,
            locationMapUrl: dto.locationMapUrl,
            locationDescription: dto.locationDescription,
            locationHighlight: dto.locationHighlight,
            ...(dto.locations !== undefined && { locations: storeLocationSnapshot(dto.locations) as unknown as Prisma.InputJsonValue }),
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
            boardTexture: "painted",
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
            contentOrder: contentOrder as unknown as Prisma.InputJsonValue,
            ...(dto.layoutStyle !== undefined && { layoutStyle: dto.layoutStyle }),
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
            motionExperience: animations[0]?.type ?? "coverflow-carousel",
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
      include: {
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
    if (dto.locations !== undefined) {
      assertValidStoreLocations(dto.locations);
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.store.update({ where: { id }, data: storeUpdateData(dto) });
        await this.syncLocationInventory(tx, id, dto.locations!);
        return updated;
      });
    }
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
    const { links, locations, ...storeDto } = dto;
    if (locations !== undefined) assertValidStoreLocations(locations);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.store.update({
        where: { id },
        data: {
          ...storeUpdateData(storeDto),
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

  async listPublishedStores(search?: string, requestedPage?: string, requestedPageSize?: string) {
    const page = Math.max(1, Math.min(10_000, Number.parseInt(requestedPage ?? "1", 10) || 1));
    const pageSize = Math.max(6, Math.min(60, Number.parseInt(requestedPageSize ?? "24", 10) || 24));
    const term = search?.trim().slice(0, 80);
    const where: Prisma.StoreWhereInput = {
      status: StoreStatus.ACTIVE,
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
  async getStorePublic(slug: string, options: { trackView?: boolean } = {}) {
    const store = await this.findActiveBySlugPublic(slug);
    // Not deduplicated per visitor/session — a lightweight external-audience
    // counter for the merchant's Finanzas view, not full analytics. Checkout
    // explicitly disables it for editor previews and browsers marked as the
    // store owner; ordinary shared-link loads continue to count.
    const trackView = options.trackView !== false;
    const [items, categories, links, productStats, appointmentOfferings] = await Promise.all([
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

    const legacyMotionExperiences = readStoreMotionExperiences(store.motionExperiences, store.motionExperience);
    const editorialGallery = readStoreEditorialGallery(store.editorialGallery);
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
      contactFormEnabled: store.contactFormEnabled,
      locationMapUrl: store.locationMapUrl,
      locationDescription: store.locationDescription,
      locationHighlight: store.locationHighlight,
      locations,
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
      contentOrder: readStoreContentOrder(store.contentOrder, animations),
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
      checkoutMode: store.checkoutMode,
      leadCaptureUrl: store.leadCaptureUrl,
      cartRecommendationsEnabled: store.cartRecommendationsEnabled,
      cartRecommendationProductIds: readStringArray(store.cartRecommendationProductIds),
      showLowStockToCustomers: store.showLowStockToCustomers,
      appointmentOfferings,
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
        discountPercent: item.discountPercent,
        discountStartsAt: item.discountStartsAt?.toISOString() ?? null,
        discountEndsAt: item.discountEndsAt?.toISOString() ?? null,
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
    const locations = readStoreLocations(store.locations);
    const fulfillmentLocation = locations.length ? locations.find((location) => location.id === dto.locationId) : undefined;
    if (locations.length && !fulfillmentLocation) throw new BadRequestException("Elige una ubicación para tu pedido");
    if (fulfillmentLocation && dto.fulfillmentMethod === "pickup" && !fulfillmentLocation.pickupEnabled) throw new BadRequestException("Esta ubicación no ofrece retiro");
    if (fulfillmentLocation && dto.fulfillmentMethod === "delivery" && !fulfillmentLocation.deliveryEnabled) throw new BadRequestException("Esta ubicación no ofrece entrega");
    if (fulfillmentLocation && !dto.fulfillmentMethod) throw new BadRequestException("Elige retiro o entrega");
    const fulfillmentReadyAt = fulfillmentLocation ? nextStoreLocationOpenAt(fulfillmentLocation) : null;

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
      if (fulfillmentLocation) {
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
    const amount = subtotal - promoDiscountAmount;

    let description = cartLines
      .map((line) => `${line.name}${line.variantName ? ` (${line.variantName})` : ""}${line.extras?.length ? ` + ${line.extras.map((extra) => extra.name).join(" + ")}` : ""} x${line.quantity}`)
      .join(", ");
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      description = description.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
    }

    const livemode = merchant.status === MerchantStatus.ACTIVE;
    const checkout = await this.prisma.$transaction(async (tx) => {
      const created = await this.paymentIntents.createInTransaction(tx, store.merchantId, livemode, {
        amount,
        currency,
        description,
        metadata: {
          cart: cartLines,
          storeId: store.id,
          ...(fulfillmentLocation ? { fulfillment: { locationId: fulfillmentLocation.id, locationName: fulfillmentLocation.name, method: dto.fulfillmentMethod, ...(fulfillmentReadyAt ? { readyAt: fulfillmentReadyAt.toISOString() } : {}) } } : {}),
          ...(promo ? {
            promoCode: promo.code,
            promoDiscountType: promo.discountType,
            promoDiscountValue: promo.discountValue,
            promoDiscountAmount,
            subtotal,
          } : {}),
        },
      });
      const order = await tx.storeOrder.create({
        data: {
          paymentIntentId: created.id,
          merchantId: store.merchantId,
          storeId: store.id,
          storeName: store.name,
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
      ...(fulfillmentLocation ? { fulfillmentLocationName: fulfillmentLocation.name, fulfillmentMethod: dto.fulfillmentMethod } : {}),
    };
  }

  /** Public lead capture for stores that finish outside the pagosYa payment flow.
   * The browser only submits product ids; names and prices are resolved again
   * from this store so the notification cannot be used to spoof its catalog. */
  async submitLead(slug: string, dto: SubmitStoreLeadDto) {
    const store = await this.findActiveBySlugPublic(slug);
    if (!this.emailProvider) throw new BadRequestException("El correo de interesados todavía no está disponible");

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

      const unitAmount = discountedProductAmount(link, variant?.amount ?? link.amount) + selectedExtrasAmount(extras);
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
      if (fulfillmentLocation) {
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

    await this.emailProvider.send({
      to: recipient,
      subject: isContactMessage
        ? `Nuevo mensaje para ${store.name}: ${customerName}`
        : `Nuevo interesado en ${store.name}: ${dto.name?.trim() || customerEmail}`,
      body,
      replyTo: customerEmail,
      failLoudly: true,
    });
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
    return { submitted: true, leadId: lead.id };
  }
}
