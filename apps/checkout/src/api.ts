import { PaymentIntent, PaymentMethodType } from "@pagosya/shared-types";
import type { StoreSiteDocument } from "./site-document";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001/v1";
const API_ROOT_URL = API_BASE_URL.replace(/\/v1\/?$/, "");

export interface CheckoutSession {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  merchantName: string;
  metadata: Record<string, unknown> | null;
  recipient: {
    name: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  trackingToken: string | null;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const message = typeof body === "string" ? body : (body as { message?: string })?.message;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return (body ?? text) as T;
}

export async function fetchSession(clientSecret: string, publishableKey?: string | null): Promise<CheckoutSession> {
  const route = publishableKey ? "widget_session" : "session";
  const response = await fetch(`${API_BASE_URL}/checkout/${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientSecret, ...(publishableKey ? { publishableKey } : {}) }),
  });
  return parseOrThrow<CheckoutSession>(response);
}

/**
 * No-code entry point: a merchant with no developer shares this page's URL
 * directly (/s/<slug>, with legacy ?link=<slug> support) instead of embedding the widget. Any of a merchant's
 * link slugs opens their whole catalog (Store), not just that one item — a
 * customer buying several things adds them to one Cart and pays once.
 */
export interface StoreItem {
  id: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  imageUrls: string[];
  imagePositions?: string[];
  tags: string[];
  // null = unlimited/not tracked, 0 = genuinely sold out.
  stock: number | null;
  // Cart enforcement ceiling. This remains available when exact inventory is
  // hidden from storefront copy, so the shopper still cannot exceed stock.
  purchaseLimit?: number | null;
  color: string | null;
  variants: Array<{ id: string; name: string; amount: number; stock?: number | null; purchaseLimit?: number | null }>;
  extras: Array<{ id: string; name: string; amount: number; required: boolean; available: boolean; groupName?: string; freeAllowance?: number }>;
  amount: number;
  currency: string;
  discountPercent: number | null;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  // Units sold via store-checkout carts — powers the "Más vendidos" sort.
  soldCount: number;
}

export interface StoreCategory {
  id: string;
  name: string;
}

/** Merchant-defined link button (social profile, catalog, map, ...) shown under the store header. */
export interface StoreLink {
  id: string;
  label: string;
  url: string;
}

export interface StoreHeroSlide {
  // Kept as imageUrl for backwards compatibility; may point to an image, GIF,
  // MP4, or WEBM returned by the uploads endpoint.
  imageUrl: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export const STORE_MOTION_EXPERIENCES = [
  "story-scroll", "coverflow-carousel", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials",
  "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  "full-screen-chapters", "magnetic-target", "frame-sequence", "3d-gallery",
] as const;
export type StoreMotionExperience = (typeof STORE_MOTION_EXPERIENCES)[number];
export type StoreContentSection = "hero" | "products" | "about" | "gallery" | "contact" | "location" | "links" | "motion" | `motion-${StoreMotionExperience}` | `animation-${string}` | `site-${string}`;

export interface StoreEditorialImage {
  imageUrl: string;
  productId?: string;
  title?: string;
  caption?: string;
  body?: string;
  boxColor?: string;
  textPositionX?: number;
  textPositionY?: number;
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: "left" | "center" | "right";
  textColor?: string;
}

export interface StoreAnimation {
  id: string;
  name: string;
  type: StoreMotionExperience;
  title?: string;
  subtitle?: string;
  productId?: string;
  buttonLabel?: string;
  buttonPositionX?: number;
  buttonPositionY?: number;
  textPositionX?: number;
  textPositionY?: number;
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: "left" | "center" | "right";
  textSize?: "small" | "medium" | "large";
  textWidth?: "narrow" | "medium" | "wide";
  textColor?: string;
  backgroundColor?: string;
  media: StoreEditorialImage[];
}

export interface AppointmentOffering {
  id: string;
  name: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: number;
  currency: string;
  color: string | null;
}

export interface StoreLocation {
  id: string;
  name: string;
  address?: string;
  mapEmbedUrl?: string;
  description?: string;
  highlight?: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  openingHours: Array<{ day: number; open: string; close: string; closed: boolean }>;
  inventory: Array<{ paymentLinkId: string; stock: number | null }>;
}

export interface Store {
  storeId: string;
  storeName: string;
  tagline: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  backgroundColor: string | null;
  backgroundMode: "solid" | "gradient";
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  backgroundGradientAngle: number;
  backgroundImageUrl: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  contactFormEnabled?: boolean;
  contactTitle?: string | null;
  contactSubtitle?: string | null;
  locationMapUrl?: string | null;
  locationDescription?: string | null;
  locationHighlight?: string | null;
  locationTitle?: string | null;
  locationSubtitle?: string | null;
  locations?: StoreLocation[];
  // Long-form brand story; blank lines separate paragraphs.
  aboutText: string | null;
  aboutTitle?: string | null;
  aboutSubtitle?: string | null;
  // Optional background image for the brand-story section.
  aboutImageUrl: string | null;
  catalogTitle?: string | null;
  catalogSubtitle?: string | null;
  galleryTitle?: string | null;
  gallerySubtitle?: string | null;
  linksTitle?: string | null;
  // "#RRGGBB" brand accent; null = default palette accent.
  accentColor: string | null;
  // Curated merchant storefront font family.
  fontStyle: "modern" | "editorial" | "friendly" | "classic" | "geometric";
  // "rounded" | "pill" | "square"
  buttonStyle: string;
  // "chalkboard" | "kraft" | "painted" — storefront ground material.
  boardTexture: string;
  // Short promo/notice bar text shown at the very top of the storefront.
  announcement: string | null;
  announcementMode: "static" | "marquee";
  announcementSpeed: number;
  announcementSize: "small" | "medium" | "large";
  announcementColor: string;
  announcementFont?: "store" | "modern" | "editorial" | "friendly" | "classic" | "geometric";
  announcementEffect?: "none" | "wave" | "pulse" | "sparkle";
  promotionEnabled: boolean;
  promotionImageUrl: string | null;
  promotionTitle: string | null;
  promotionBody: string | null;
  promotionCtaLabel: string | null;
  promotionCtaUrl: string | null;
  heroSlides: StoreHeroSlide[];
  // Optional while older previews/cached responses roll forward; checkout
  // supplies the canonical order and an empty gallery when absent.
  contentOrder?: StoreContentSection[];
  sectionBackgrounds?: Record<string, string>;
  layoutStyle?: "cinematic" | "editorial" | "collage" | "catalog-first";
  experienceStyle?: "coverflow" | "diagonal-marquee" | "story-scroller";
  motionDuoEnabled?: boolean;
  motionExperience?: StoreMotionExperience;
  motionExperiences?: StoreMotionExperience[];
  animations?: StoreAnimation[];
  editorialGallery?: StoreEditorialImage[];
  buttonVariant: "solid" | "outline" | "soft";
  buttonMotion: "none" | "lift" | "pulse";
  cartButtonLabel: string;
  siteDocument?: StoreSiteDocument | null;
  checkoutMode: "payment" | "whatsapp" | "external";
  // Used only by external lead mode; no PaymentIntent is created.
  leadCaptureUrl: string | null;
  cartRecommendationsEnabled: boolean;
  cartRecommendationProductIds: string[];
  showLowStockToCustomers: boolean;
  appointmentOfferings?: AppointmentOffering[];
  links: StoreLink[];
  categories: StoreCategory[];
  items: StoreItem[];
}

export interface PublishedStore {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  accentColor: string | null;
  backgroundColor: string | null;
  checkoutMode: "payment" | "whatsapp" | "external";
  categories: string[];
  productCount: number;
  minimumAmount: number | null;
  currency: string;
  featuredProducts: string[];
  publishedAt: string;
}

export interface PublishedStoresResponse {
  stores: PublishedStore[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasMore: boolean };
}

/** Resolve a "/v1/uploads/..." path (product photo, store logo) against the API host. */
export function assetUrl(path: string | null): string | null {
  return path ? `${API_ROOT_URL}${path}` : null;
}

export async function fetchStore(slug: string, options: { preview?: boolean } = {}): Promise<Store> {
  const previewQuery = options.preview ? "?preview=1" : "";
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/store${previewQuery}`);
  return parseOrThrow<Store>(response);
}

export interface AppointmentAvailability {
  date: string;
  connectedToGoogleCalendar: boolean;
  offering: AppointmentOffering;
  slots: Array<{ startsAt: string; endsAt: string; label: string }>;
}

export async function fetchAppointmentAvailability(slug: string, offeringId: string, date: string): Promise<AppointmentAvailability> {
  const url = new URL(`${API_BASE_URL}/public/stores/${encodeURIComponent(slug)}/appointments/availability`);
  url.searchParams.set("offeringId", offeringId);
  url.searchParams.set("date", date);
  const response = await fetch(url, { cache: "no-store" });
  return parseOrThrow<AppointmentAvailability>(response);
}

export async function createAppointmentPayment(slug: string, input: { offeringId: string; customerName: string; customerEmail: string; customerPhone?: string; startsAt: string }): Promise<{ appointmentId: string; clientSecret: string | null; checkoutUrl: string | null; holdExpiresAt: string | null; status: string }> {
  const response = await fetch(`${API_BASE_URL}/public/stores/${encodeURIComponent(slug)}/appointments/payment`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseOrThrow<{ appointmentId: string; clientSecret: string | null; checkoutUrl: string | null; holdExpiresAt: string | null; status: string }>(response);
}

export async function resolveStoreDomain(hostname: string): Promise<{ hostname: string; slug: string }> {
  const url = new URL(`${API_BASE_URL}/stores/public/domain`);
  url.searchParams.set("hostname", hostname);
  const response = await fetch(url);
  return parseOrThrow<{ hostname: string; slug: string }>(response);
}

export async function fetchPublishedStores(search = "", page = 1, pageSize = 24): Promise<PublishedStoresResponse> {
  const url = new URL(`${API_BASE_URL}/stores/public`);
  if (search.trim()) url.searchParams.set("search", search.trim());
  url.searchParams.set("page", String(page));
  url.searchParams.set("pageSize", String(pageSize));
  const response = await fetch(url);
  return parseOrThrow<PublishedStoresResponse>(response);
}

export interface CartCheckoutResult {
  clientSecret: string;
  trackingToken: string;
  storeName: string;
  cartDescription: string;
  contactPhone: string | null;
  contactEmail: string | null;
  fulfillmentLocationName?: string;
  fulfillmentMethod?: "pickup" | "delivery";
}

export interface TrackedOrder {
  reference: string;
  storeName: string;
  items: Array<{
    name: string;
    variantName?: string;
    extras?: Array<{ name: string }>;
    quantity: number;
    unitAmount: number;
  }>;
  amount: number;
  currency: string;
  paymentStatus: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  statusEvents: Array<{ status: string; createdAt: string }>;
  fulfillment: { locationName: string; method: "pickup" | "delivery" | null; readyAt: string | null } | null;
  store: { slug: string; logoUrl: string | null; contactPhone: string | null; contactEmail: string | null } | null;
  delivery: { status: string; estimatedAt: string | null; deliveredAt: string | null } | null;
}

export async function fetchTrackedOrder(token: string): Promise<TrackedOrder> {
  const response = await fetch(`${API_BASE_URL}/orders/track/${encodeURIComponent(token)}`, { cache: "no-store" });
  return parseOrThrow<TrackedOrder>(response);
}

export interface PromoCodeQuote {
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
}

export async function quotePromoCode(slug: string, code: string): Promise<PromoCodeQuote> {
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/promo-code/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return parseOrThrow<PromoCodeQuote>(response);
}

/** This call is what would otherwise be a merchant backend's own POST /v1/payment_intents —
 * one PaymentIntent for the whole cart, so one QR/payment covers every item in it. */
export async function checkoutCart(
  slug: string,
  items: { paymentLinkId: string; variantId?: string; extraIds?: string[]; quantity: number }[],
  promoCode?: string,
  fulfillment?: { locationId: string; fulfillmentMethod: "pickup" | "delivery" },
): Promise<CartCheckoutResult> {
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/cart-checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items, ...(promoCode ? { promoCode } : {}), ...fulfillment }),
  });
  return parseOrThrow<CartCheckoutResult>(response);
}

export interface StoreLeadContact {
  name?: string;
  email: string;
  phone?: string;
  message?: string;
}

export async function submitStoreLead(
  slug: string,
  contact: StoreLeadContact,
  items: { paymentLinkId: string; variantId?: string; extraIds?: string[]; quantity: number }[],
  fulfillment?: { locationId: string; fulfillmentMethod: "pickup" | "delivery" },
): Promise<{ submitted: true }> {
  const response = await fetch(`${API_BASE_URL}/stores/public/${slug}/leads`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...contact, items, ...fulfillment }),
  });
  return parseOrThrow<{ submitted: true }>(response);
}

export interface CustomerContact {
  name: string;
  email: string;
  phone: string;
  document?: string;
  deliveryRequested?: boolean;
  deliveryAddress?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  customerLocationAccuracy?: number;
}

export async function confirmPaymentIntent(
  paymentIntentId: string,
  clientSecret: string,
  paymentMethod: { type: PaymentMethodType; token: string },
  customer: CustomerContact,
): Promise<{ paymentIntent: PaymentIntent; railResult: { status: string; actionRequired?: unknown; failureReason?: string } }> {
  const customerName = customer.name.trim();
  const customerDocument = customer.document?.trim();
  const customerEmail = customer.email.trim().toLowerCase();
  const customerPhone = customer.phone.trim();
  const response = await fetch(`${API_BASE_URL}/payment_intents/${paymentIntentId}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${clientSecret}` },
    body: JSON.stringify({
      paymentMethod,
      ...(customerName && { customerName }),
      ...(customerDocument && { customerDocument }),
      ...(customerEmail && { customerEmail }),
      ...(customerPhone && { customerPhone }),
      deliveryRequested: customer.deliveryRequested,
      deliveryAddress: customer.deliveryAddress,
      customerLatitude: customer.customerLatitude,
      customerLongitude: customer.customerLongitude,
      customerLocationAccuracy: customer.customerLocationAccuracy,
    }),
  });
  return parseOrThrow(response);
}

export interface DebtCollectionInfo {
  companyName: string;
  collectionName: string;
  currency: string;
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface DebtLookupResult {
  status: "pending" | "paid";
  customerLabel: string;
  pendingTotal: number;
  currency: string;
  debts: Array<{
    id: string;
    status: "pending" | "paid";
    amount: number;
    currency: string;
    description: string | null;
    reference: string | null;
    collectionName: string;
  }>;
}

export async function fetchDebtCollection(slug: string): Promise<DebtCollectionInfo> {
  const response = await fetch(`${API_BASE_URL}/debt-collections/public/${encodeURIComponent(slug)}`);
  return parseOrThrow<DebtCollectionInfo>(response);
}

export async function lookupDebt(slug: string, customerDocument: string): Promise<DebtLookupResult> {
  const response = await fetch(`${API_BASE_URL}/debt-collections/public/${encodeURIComponent(slug)}/lookup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerDocument }),
  });
  return parseOrThrow<DebtLookupResult>(response);
}

export async function checkoutDebt(
  slug: string,
  customerDocument: string,
  debtRecordIds: string[],
): Promise<{ clientSecret: string; companyName: string; description: string; contactEmail: string | null; contactPhone: string | null }> {
  const response = await fetch(`${API_BASE_URL}/debt-collections/public/${encodeURIComponent(slug)}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerDocument, debtRecordIds }),
  });
  return parseOrThrow(response);
}


export async function cancelPaymentIntent(clientSecret: string): Promise<{ id: string; status: string }> {
  const response = await fetch(`${API_BASE_URL}/checkout/session/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${clientSecret}` },
  });
  return parseOrThrow(response);
}

/**
 * Dev-only: stands in for the real bank/Tigo Money confirmation callback so
 * the requires_action path is testable without live rail infra. Never
 * reachable outside import.meta.env.DEV — see main.ts.
 */
export async function simulateRailCallback(
  railId: string,
  paymentIntentId: string,
  status: "succeeded" | "failed",
): Promise<void> {
  const internalSecret = import.meta.env.VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET;
  if (!internalSecret) throw new Error("VITE_DEV_INTERNAL_RAIL_CALLBACK_SECRET is not set");

  await fetch(`${API_ROOT_URL}/internal/rails/${railId}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${internalSecret}` },
    body: JSON.stringify({ paymentIntentId, status, railReference: `dev_sim_${Date.now()}` }),
  });
}
