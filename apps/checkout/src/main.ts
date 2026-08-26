import { PaymentMethodType } from "@pagosya/shared-types";
import {
  assetUrl,
  cancelPaymentIntent,
  checkoutCart,
  checkoutDebt,
  confirmPaymentIntent,
  createAppointmentPayment,
  fetchDebtCollection,
  fetchAppointmentAvailability,
  fetchSession,
  fetchTrackedOrder,
  fetchStore,
  quotePromoCode,
  resolveStoreDomain,
  lookupDebt,
  simulateRailCallback,
  submitStoreLead,
  CheckoutSession,
  CustomerContact,
  Store,
  type StoreMotionExperience,
  StoreItem,
  StoreLocation,
  StoreLink,
  DebtCollectionInfo,
  TrackedOrder,
} from "./api";
import { configureParentOrigin, observeResize, postToParent } from "./postmessage";

const STORE_MOTION_EXPERIENCES: readonly StoreMotionExperience[] = [
  "story-scroll", "coverflow-carousel", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials", "zoom-parallax",
  "video-pill", "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "full-screen-chapters", "magnetic-target", "frame-sequence", "3d-gallery",
];

interface LinkHeader {
  storeName: string;
  description: string;
  contactPhone: string | null;
  contactEmail: string | null;
}

const TEST_TOKENS: Record<PaymentMethodType, { label: string; value: string }[]> = {
  [PaymentMethodType.CARD]: [
    { label: "Visa (aprobada)", value: "tok_visa_success" },
    { label: "Visa (rechazada)", value: "tok_visa_decline" },
    { label: "Visa (error del adquirente)", value: "tok_visa_error" },
  ],
  [PaymentMethodType.TIGO_MONEY]: [
    { label: "Confirmación por USSD (demo)", value: "tok_tigo_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_tigo_instant_success" },
    { label: "Rechazado", value: "tok_tigo_decline" },
  ],
  [PaymentMethodType.BANK_TRANSFER]: [
    { label: "Confirmación bancaria (demo)", value: "tok_bank_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_bank_instant_success" },
    { label: "Rechazado", value: "tok_bank_decline" },
  ],
  [PaymentMethodType.QR]: [
    { label: "Escaneo QR (demo)", value: "tok_qr_demo" },
    { label: "Instantáneo (aprobado)", value: "tok_qr_instant_success" },
    { label: "Rechazado", value: "tok_qr_decline" },
  ],
};

const TAB_LABELS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.CARD]: "Tarjeta",
  [PaymentMethodType.TIGO_MONEY]: "Tigo Money",
  [PaymentMethodType.BANK_TRANSFER]: "Transferencia",
  [PaymentMethodType.QR]: "QR",
};

const TAB_ICONS: Record<PaymentMethodType, string> = {
  [PaymentMethodType.CARD]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/></svg>',
  [PaymentMethodType.TIGO_MONEY]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
  [PaymentMethodType.BANK_TRANSFER]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l9-6 9 6"/><path d="M5 10v9M10 10v9M14 10v9M19 10v9"/><path d="M3 21h18"/></svg>',
  [PaymentMethodType.QR]:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2M14 19h2M19 19h2"/></svg>',
};

const ICON_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/></svg>';
const ICON_X =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9.5l-5 5M9.5 9.5l5 5"/></svg>';
const ICON_CLOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 3"/></svg>';
const ICON_LOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const ICON_INSTAGRAM =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><line x1="17.5" y1="6.5" x2="17.5" y2="6.5"/></svg>';
const ICON_WHATSAPP =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.4-1.48-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.48 0 1.46 1.06 2.87 1.21 3.07.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35z"/><path d="M12 2a10 10 0 0 0-8.6 15.03L2 22l5.1-1.34A10 10 0 1 0 12 2z"/></svg>';
const ICON_ARROW_LEFT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
const ICON_ARROW_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const ICON_EXTERNAL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>';
const ICON_MAP_PIN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
const ICON_SEARCH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.75"/><path d="m16 16 4.25 4.25"/></svg>';
const ICON_PERSON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="7.25" r="3.25"/><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20z"/></svg>';
const ICON_BAG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8.5h14l-.75 12H5.75z"/><path d="M9 9V6.75a3 3 0 0 1 6 0V9"/></svg>';
const ICON_CHEVRON_DOWN =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';

const app = document.getElementById("app")!;
let selectedType: PaymentMethodType = PaymentMethodType.CARD;
let linkHeader: LinkHeader | null = null;
let activeOrderTrackingToken: string | null = null;
let orderTrackingPoll: number | null = null;
let orderTrackingVisibilityHandler: (() => void) | null = null;
const CONSUMER_DASHBOARD_ORIGIN: string = import.meta.env.VITE_CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324";
// Survives renderForm() re-renders (e.g. switching payment method tabs) so
// typed contact info isn't lost mid-checkout.
const customerContact: CustomerContact = { name: "", email: "", phone: "", deliveryRequested: false, deliveryAddress: "" };
let selectedFulfillmentMethod: "pickup" | "delivery" | null = null;
let selectedFulfillmentLocationId: string | null = null;
// Keyed by field id so an error survives a payment-method tab switch
// (renderForm fully re-renders on every tab click) until the field is fixed.
const contactFieldErrors: Partial<Record<"customerName" | "customerEmail" | "customerPhone" | "deliveryAddress", string>> = {};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9+()\-\s]{6,}$/;

function formatAmount(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : (words[0][0] + words[1][0]).toUpperCase();
}

// Payment Link name/description/merchant name are merchant-supplied and rendered via
// innerHTML — escape them so a malicious link can't script-inject into a customer's page.
function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function safeStoreMapEmbedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    const googleHost = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(hostname);
    const googleEmbed = googleHost && url.pathname.startsWith("/maps/embed");
    const openStreetMapEmbed = (hostname === "openstreetmap.org" || hostname === "www.openstreetmap.org")
      && url.pathname === "/export/embed.html";
    return googleEmbed || openStreetMapEmbed ? url.toString() : null;
  } catch {
    return null;
  }
}

function publicStoreLocations(store: Store): StoreLocation[] {
  const configured = (store.locations || []).map((location) => ({
    ...location,
    mapEmbedUrl: safeStoreMapEmbedUrl(location.mapEmbedUrl) || undefined,
    inventory: Array.isArray(location.inventory) ? location.inventory : [],
  }));
  if (configured.length) return configured;
  if (!(store.locationMapUrl || store.locationDescription || store.locationHighlight)) return [];
  return [{
    id: "legacy-location",
    name: "Ubicación principal",
    mapEmbedUrl: safeStoreMapEmbedUrl(store.locationMapUrl) || undefined,
    description: store.locationDescription || undefined,
    highlight: store.locationHighlight || undefined,
    pickupEnabled: false,
    deliveryEnabled: false,
    openingHours: [],
    inventory: [],
  }];
}

function locationOpeningState(location: StoreLocation, now = new Date()): { isOpen: boolean; label: string; nextOpenAt?: string } {
  if (!location.openingHours?.length) return { isOpen: true, label: "Horario no configurado" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz", weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const weekday = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday as "Sun"] ?? 0;
  const minuteOfDay = Number(parts.hour) * 60 + Number(parts.minute);
  const today = location.openingHours.find((entry) => entry.day === weekday);
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  if (today && !today.closed && minuteOfDay >= toMinutes(today.open) && minuteOfDay < toMinutes(today.close)) {
    return { isOpen: true, label: `Abierto ahora · cierra a las ${today.close}` };
  }
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = (weekday + offset) % 7;
    const hours = location.openingHours.find((entry) => entry.day === day);
    if (!hours || hours.closed || (offset === 0 && toMinutes(hours.open) <= minuteOfDay)) continue;
    const [hour, minute] = hours.open.split(":").map(Number);
    const candidate = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + offset, hour + 4, minute));
    const dayLabel = offset === 0 ? "hoy" : offset === 1 ? "mañana" : new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", weekday: "long" }).format(candidate);
    return { isOpen: false, label: `Cerrado ahora · abre ${dayLabel} a las ${hours.open}`, nextOpenAt: candidate.toISOString() };
  }
  return { isOpen: false, label: "Cerrado · revisa el horario con la tienda" };
}

function locationCanFulfillCart(location: StoreLocation, lines: ReturnType<typeof cartLineEntries>): boolean {
  const requested = new Map<string, number>();
  lines.forEach((line) => requested.set(line.product.id, (requested.get(line.product.id) || 0) + line.quantity));
  return [...requested].every(([paymentLinkId, quantity]) => {
    const stock = location.inventory.find((entry) => entry.paymentLinkId === paymentLinkId)?.stock ?? 0;
    return stock === null || stock >= quantity;
  });
}

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm)(?:$|[?#])/i.test(url);
}

// A stray "." or "-" left in the announcement field is still a truthy string,
// but rendering it produces a promo pill with no visible content — require at
// least one letter or digit before showing the banner at all.
function hasReadableContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

// A merchant can pick any accentColor, including near-black — --pg-accent-2
// aliases straight to it (see body.has-custom-accent in style.css), so an
// unclamped dark accent collapses the storefront's gradient CTA and its glow
// to invisible against the dark page background. Raise perceived lightness to
// a floor that keeps it visibly distinct from --pg-page-bg while preserving
// the merchant's chosen hue.
const MIN_ACCENT_LIGHTNESS = 0.35;
const DEFAULT_ACCENT_PALETTES = {
  dark: { accent: "#818cf8", accent2: "#c084fc", contrast: "#000000" },
  light: { accent: "#4f46e5", accent2: "#7e22ce", contrast: "#ffffff" },
} as const;

function clampAccentLightness(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const r = parseInt(match[1].slice(0, 2), 16) / 255;
  const g = parseInt(match[1].slice(2, 4), 16) / 255;
  const b = parseInt(match[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= MIN_ACCENT_LIGHTNESS) return hex;

  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const newL = MIN_ACCENT_LIGHTNESS;
  const c = (1 - Math.abs(2 * newL - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = newL - c / 2;
  let [r2, g2, b2] = [0, 0, 0];
  if (h < 60) [r2, g2, b2] = [c, x, 0];
  else if (h < 120) [r2, g2, b2] = [x, c, 0];
  else if (h < 180) [r2, g2, b2] = [0, c, x];
  else if (h < 240) [r2, g2, b2] = [0, x, c];
  else if (h < 300) [r2, g2, b2] = [x, 0, c];
  else [r2, g2, b2] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`;
}

function relativeLuminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorContrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function binaryContrastColor(backgroundColor: string): "#ffffff" | "#000000" {
  const blackContrast = colorContrastRatio("#000000", backgroundColor);
  const whiteContrast = colorContrastRatio("#ffffff", backgroundColor);
  return blackContrast >= whiteContrast ? "#000000" : "#ffffff";
}

function accentContrastColor(hex: string): "#ffffff" | "#000000" {
  return binaryContrastColor(hex);
}

function backgroundTheme(backgroundColor: string | null): { light: boolean; textColor: "#000000" | "#ffffff" } {
  const effectiveBackground = backgroundColor && /^#[0-9a-f]{6}$/i.test(backgroundColor)
    ? backgroundColor
    : "#0a0a0a";
  const textColor = binaryContrastColor(effectiveBackground);
  return { light: textColor === "#000000", textColor };
}

function createStoreEntrance(): HTMLElement {
  const entrance = document.createElement("div");
  entrance.className = "store-entry-loader";
  entrance.setAttribute("role", "status");
  entrance.setAttribute("aria-live", "polite");
  entrance.setAttribute("aria-label", "Cargando tienda");

  const content = document.createElement("div");
  content.className = "store-entry-loader-content";

  const brand = document.createElement("div");
  brand.className = "store-entry-loader-brand";
  const mark = document.createElement("img");
  mark.className = "store-entry-loader-logo";
  mark.src = "/logo-mark.png";
  mark.alt = "";
  const wordmark = document.createElement("span");
  wordmark.className = "store-entry-loader-wordmark";
  wordmark.textContent = "pagosYa";
  brand.append(mark, wordmark);

  const track = document.createElement("div");
  track.className = "store-entry-loader-track";
  track.setAttribute("aria-hidden", "true");
  const bar = document.createElement("span");
  track.append(bar);
  content.append(brand, track);
  entrance.append(content);
  document.body.append(entrance);
  return entrance;
}

function finishStoreEntrance(entrance: HTMLElement, store: Store) {
  const storeName = store.storeName.trim() || "Tienda";
  entrance.setAttribute("aria-label", `Cargando ${storeName} con pagosYa`);

  // Schedule both phases while the owning window is alive. A nested access to
  // `window` here used to throw if navigation/test teardown happened during
  // the first delay, leaving an uncaught exception after the page was gone.
  window.setTimeout(() => entrance.classList.add("is-leaving"), 1050);
  window.setTimeout(() => entrance.remove(), 1410);
}

type StorefrontRoute = { slug: string | null; productId: string | null; categoryId: string | null };

function storefrontRouteFromPathname(pathname: string): StorefrontRoute {
  const match = pathname.match(/^\/s\/([^/]+)(?:(?:\/c\/([^/]+))|(?:\/p\/([^/]+)))?\/?$/);
  if (!match) {
    const customProduct = activeCustomDomainSlug ? pathname.match(/^\/p\/([^/]+)\/?$/) : null;
    const customCategory = activeCustomDomainSlug ? pathname.match(/^\/c\/([^/]+)\/?$/) : null;
    if (!activeCustomDomainSlug || (pathname !== "/" && !customProduct && !customCategory)) {
      return { slug: null, productId: null, categoryId: null };
    }
    try {
      return {
        slug: activeCustomDomainSlug,
        productId: customProduct?.[1] ? decodeURIComponent(customProduct[1]) : null,
        categoryId: customCategory?.[1] ? decodeURIComponent(customCategory[1]) : null,
      };
    } catch {
      return { slug: null, productId: null, categoryId: null };
    }
  }
  try {
    return {
      slug: decodeURIComponent(match[1]),
      categoryId: match[2] ? decodeURIComponent(match[2]) : null,
      productId: match[3] ? decodeURIComponent(match[3]) : null,
    };
  } catch {
    return { slug: null, productId: null, categoryId: null };
  }
}

function storefrontRouteFromLocation(): StorefrontRoute {
  return storefrontRouteFromPathname(window.location.pathname);
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: "Esperando pago",
  PAID: "Pagado",
  PREPARING: "En preparación",
  READY_FOR_PICKUP: "Listo para recoger",
  SHIPPED: "Enviado",
  DELIVERED: "Entregado",
  CANCELED: "Cancelado",
  REFUNDED: "Reembolsado",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  REQUIRES_PAYMENT_METHOD: "Pendiente",
  REQUIRES_CONFIRMATION: "Por confirmar",
  PROCESSING: "Procesando",
  REQUIRES_ACTION: "Requiere acción",
  SUCCEEDED: "Confirmado",
  FAILED: "Fallido",
  CANCELED: "Cancelado",
};

function trackingDate(value: string): string {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function trackingStatusClass(status: string): string {
  if (["SUCCEEDED", "PAID", "DELIVERED"].includes(status)) return "is-good";
  if (["FAILED", "CANCELED", "REFUNDED"].includes(status)) return "is-bad";
  return "is-active";
}

function trackingTimelineHtml(order: TrackedOrder): string {
  const rankByStatus: Record<string, number> = {
    AWAITING_PAYMENT: 0,
    PAID: 0,
    PREPARING: 1,
    READY_FOR_PICKUP: 2,
    SHIPPED: 2,
    DELIVERED: 3,
  };
  const fallbackRank = order.statusEvents.reduce((rank, event) => Math.max(rank, rankByStatus[event.status] ?? -1), -1);
  const rank = rankByStatus[order.status] ?? fallbackRank;
  const pickup = order.status === "READY_FOR_PICKUP" || order.statusEvents.some((event) => event.status === "READY_FOR_PICKUP");
  const stages = [
    { label: order.paymentStatus === "SUCCEEDED" ? "Pago confirmado" : "Esperando pago", statuses: ["AWAITING_PAYMENT", "PAID"] },
    { label: "En preparación", statuses: ["PREPARING"] },
    { label: pickup ? "Listo para recoger" : "En camino", statuses: pickup ? ["READY_FOR_PICKUP"] : ["SHIPPED"] },
    { label: "Entregado", statuses: ["DELIVERED"] },
  ];
  return `<ol class="tracking-timeline" aria-label="Progreso del pedido">
    ${stages.map((stage, index) => {
      const event = [...order.statusEvents].reverse().find((candidate) => stage.statuses.includes(candidate.status));
      const current = index === rank && !["CANCELED", "REFUNDED"].includes(order.status);
      const done = index < rank || order.status === "DELIVERED" || (index === 0 && order.paymentStatus === "SUCCEEDED");
      return `<li class="${done ? "is-done" : ""} ${current ? "is-current" : ""}"${current ? ' aria-current="step"' : ""}>
        <span class="tracking-step-mark">${done ? ICON_CHECK : `<span>${index + 1}</span>`}</span>
        <span class="tracking-step-copy"><strong>${stage.label}</strong><small>${event ? trackingDate(event.createdAt) : current ? "Estado actual" : "Pendiente"}</small></span>
      </li>`;
    }).join("")}
  </ol>`;
}

function trackingStatusRegionHtml(order: TrackedOrder): string {
  const statusMessages: Record<string, string> = {
    AWAITING_PAYMENT: "Estamos esperando la confirmación del pago.",
    PAID: "La tienda recibió tu pedido y pronto comenzará a prepararlo.",
    PREPARING: "La tienda está preparando tu pedido.",
    READY_FOR_PICKUP: "Tu pedido está listo. Puedes coordinar el recojo con la tienda.",
    SHIPPED: "Tu pedido salió de la tienda y está en camino.",
    DELIVERED: "Tu pedido fue marcado como entregado.",
    CANCELED: "La tienda marcó este pedido como cancelado.",
    REFUNDED: "El pago de este pedido fue reembolsado.",
  };
  const estimate = order.delivery?.estimatedAt
    ? `<p class="tracking-estimate"><strong>Entrega estimada:</strong> ${trackingDate(order.delivery.estimatedAt)}</p>`
    : "";
  return `<div class="tracking-status-head">
      <div>
        <h1>${escapeHtml(ORDER_STATUS_LABELS[order.status] ?? order.status)}</h1>
      </div>
      <div class="tracking-badges">
        <span class="tracking-badge ${trackingStatusClass(order.paymentStatus)}">Pago · ${escapeHtml(PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus)}</span>
        <span class="tracking-badge ${trackingStatusClass(order.status)}">Pedido · ${escapeHtml(ORDER_STATUS_LABELS[order.status] ?? order.status)}</span>
      </div>
    </div>
    <p class="tracking-status-message">${escapeHtml(statusMessages[order.status] ?? "La tienda actualizó tu pedido.")}</p>
    ${estimate}
    <p class="tracking-updated">Actualizado ${trackingDate(order.updatedAt)}</p>`;
}

function trackingClaimUrl(token: string): string {
  const url = new URL(CONSUMER_DASHBOARD_ORIGIN);
  url.searchParams.set("claim", token);
  return url.toString();
}

function trackedOrderHtml(order: TrackedOrder, token: string): string {
  const logo = assetUrl(order.store?.logoUrl ?? null);
  const storeUrl = order.store?.slug ? `/s/${encodeURIComponent(order.store.slug)}` : null;
  const items = Array.isArray(order.items) ? order.items : [];
  const contact = order.store?.contactPhone || order.store?.contactEmail
    ? `<div class="tracking-support"><span>¿Necesitas ayuda con el pedido?</span><div>
        ${order.store.contactPhone ? `<a href="${escapeHtml(whatsAppLink(order.store.contactPhone))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ""}
        ${order.store.contactEmail ? `<a href="mailto:${escapeHtml(order.store.contactEmail)}">Correo</a>` : ""}
      </div></div>`
    : "";
  return `<main class="tracking-shell">
    <header class="tracking-brand">
      ${storeUrl ? `<a href="${escapeHtml(storeUrl)}" class="tracking-store-link">` : "<div class=\"tracking-store-link\">"}
        <span class="tracking-store-logo">${logo ? `<img src="${escapeHtml(logo)}" alt="">` : escapeHtml(initials(order.storeName))}</span>
        <span><small>Pedido de</small><strong>${escapeHtml(order.storeName)}</strong></span>
      ${storeUrl ? "</a>" : "</div>"}
      <div class="tracking-reference"><small>N° de pedido</small><strong>${escapeHtml(order.reference)}</strong></div>
    </header>
    <section class="tracking-status-card" id="tracking-status-region" aria-live="polite">${trackingStatusRegionHtml(order)}</section>
    <section class="tracking-progress-section">
      <h2>Progreso</h2>
      <div id="tracking-timeline">${trackingTimelineHtml(order)}</div>
    </section>
    <section class="tracking-order-section">
      <div class="tracking-section-head"><h2>Tu pedido</h2><strong>${formatAmount(order.amount, order.currency)}</strong></div>
      ${order.fulfillment ? `<p class="tracking-fulfillment">${ICON_MAP_PIN}<span><strong>${order.fulfillment.method === "delivery" ? "Entrega desde" : "Retiro en"} ${escapeHtml(order.fulfillment.locationName)}</strong>${order.fulfillment.readyAt ? `<small>Disponible desde ${escapeHtml(new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", dateStyle: "full", timeStyle: "short" }).format(new Date(order.fulfillment.readyAt)))}</small>` : ""}</span></p>` : ""}
      <div class="tracking-items">${items.map((item) => `<div class="tracking-item"><span class="tracking-item-quantity">${item.quantity || 1}×</span><span><strong>${escapeHtml(item.name)}</strong>${item.variantName ? `<small>${escapeHtml(item.variantName)}</small>` : ""}${item.extras?.length ? `<small>${item.extras.map((extra) => escapeHtml(extra.name)).join(" · ")}</small>` : ""}</span><strong>${formatAmount((item.unitAmount || 0) * (item.quantity || 1), order.currency)}</strong></div>`).join("") || '<p class="tracking-empty">El comercio no compartió el detalle de productos.</p>'}</div>
      ${contact}
    </section>
    <section class="tracking-account-cta">
      <div><h2>Guárdalo en Mi pagosYa</h2><p>Ingresa con el mismo correo que usaste al pagar para reunir este pedido con tus próximas compras.</p></div>
      <a href="${escapeHtml(trackingClaimUrl(token))}">Agregar a mi cuenta${ICON_ARROW_RIGHT}</a>
    </section>
    <p class="tracking-security">${ICON_LOCK}<span>Este enlace privado permite consultar el pedido. No lo compartas públicamente.</span></p>
  </main>`;
}

async function renderOrderTracking(token: string): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("order-tracking-page");
  document.title = "Seguimiento de pedido — pagosYa";
  app.innerHTML = `<main class="tracking-shell tracking-loading" aria-busy="true"><div class="tracking-loading-mark"><img src="/logo-mark.png" alt=""><span>Cargando el estado de tu pedido…</span></div></main>`;
  let lastStatus = "";

  const load = async (initial: boolean) => {
    try {
      const order = await fetchTrackedOrder(token);
      if (initial || !document.getElementById("tracking-status-region")) {
        app.innerHTML = trackedOrderHtml(order, token);
      } else {
        const statusRegion = document.getElementById("tracking-status-region")!;
        statusRegion.innerHTML = trackingStatusRegionHtml(order);
        document.getElementById("tracking-timeline")!.innerHTML = trackingTimelineHtml(order);
        if (lastStatus && lastStatus !== order.status) {
          statusRegion.classList.remove("is-updated");
          void statusRegion.offsetWidth;
          statusRegion.classList.add("is-updated");
          statusRegion.addEventListener("animationend", () => statusRegion.classList.remove("is-updated"), { once: true });
        }
      }
      lastStatus = order.status;
    } catch (error) {
      if (!initial) return;
      app.innerHTML = `<main class="tracking-shell tracking-error"><div class="status failed">${ICON_X}<span>${escapeHtml((error as Error).message)}</span></div><p>Revisa que hayas abierto el enlace completo que recibiste después de pagar.</p><button type="button" class="secondary" id="tracking-retry">Intentar de nuevo</button></main>`;
      app.querySelector<HTMLButtonElement>("#tracking-retry")?.addEventListener("click", () => renderOrderTracking(token));
    }
  };

  await load(true);
  if (orderTrackingPoll !== null) window.clearInterval(orderTrackingPoll);
  if (orderTrackingVisibilityHandler) document.removeEventListener("visibilitychange", orderTrackingVisibilityHandler);
  if (document.getElementById("tracking-status-region")) {
    orderTrackingPoll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 20_000);
    orderTrackingVisibilityHandler = () => {
      if (document.visibilityState === "visible") void load(false);
    };
    document.addEventListener("visibilitychange", orderTrackingVisibilityHandler);
  }
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  configureParentOrigin(fragmentParams.get("parent_origin"));
  const retainedCheckout = (window.history.state as {
    pagosYaCheckout?: { clientSecret?: string; publishableKey?: string | null };
  } | null)?.pagosYaCheckout;
  const storefrontRoute = storefrontRouteFromLocation();
  // Canonical public links use /s/:slug. The original ?link=:slug form stays
  // valid indefinitely so existing QR codes, messages, and embeds never break.
  let linkSlug = storefrontRoute.slug ?? params.get("link");
  const debtSlug = params.get("debt");
  const trackingMatch = window.location.pathname.match(/^\/track\/([^/]+)\/?$/);
  let trackingToken: string | null = null;
  try {
    trackingToken = trackingMatch?.[1] ? decodeURIComponent(trackingMatch[1]) : null;
  } catch {
    trackingToken = null;
  }
  const clientSecret = fragmentParams.get("client_secret") ?? params.get("client_secret") ?? retainedCheckout?.clientSecret ?? null;
  checkoutPublishableKey =
    fragmentParams.get("publishable_key") ?? params.get("publishable_key") ?? retainedCheckout?.publishableKey ?? null;

  // Bearer credentials belong in the fragment only long enough for this page
  // to read them. Remove both modern fragment and legacy query forms before
  // any navigation, referrer, screenshot, or client-side error report can
  // capture them; history state keeps same-tab refresh/back behavior working.
  if (clientSecret) {
    params.delete("client_secret");
    params.delete("publishable_key");
    fragmentParams.delete("client_secret");
    fragmentParams.delete("publishable_key");
    fragmentParams.delete("parent_origin");
    const cleanQuery = params.toString();
    const cleanFragment = fragmentParams.toString();
    window.history.replaceState(
      {
        ...(window.history.state ?? {}),
        pagosYaCheckout: { clientSecret, publishableKey: checkoutPublishableKey },
      },
      "",
      `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}${cleanFragment ? `#${cleanFragment}` : ""}`,
    );
  }

  if (trackingToken) {
    await renderOrderTracking(trackingToken);
    observeResize(app);
    return;
  }

  // A verified merchant domain opens the same existing Store at its root.
  // Hostname resolution is only attempted for clean storefront paths so the
  // checkout, debt portal, marketplace, and legacy links keep their behavior.
  if (!linkSlug && !debtSlug && !clientSecret && (/^\/$/.test(window.location.pathname) || /^\/(?:p|c)\/[^/]+\/?$/.test(window.location.pathname))) {
    try {
      const resolved = await resolveStoreDomain(window.location.hostname);
      activeCustomDomainSlug = resolved.slug;
      linkSlug = resolved.slug;
    } catch {
      // The normal hosted checkout origin is not a custom domain. Preserve its
      // existing missing-parameter state instead of surfacing a resolution 404.
    }
  }

  // Keep the originating storefront available even when a payment page is
  // restored directly with both values in the URL.
  if (linkSlug) currentStoreSlug = linkSlug;
  if (debtSlug) currentDebtSlug = debtSlug;
  if (debtSlug && !clientSecret) {
    await renderDebtCollection(debtSlug);
    observeResize(app);
    return;
  }

  // Payment Links (no-code path): the URL carries a link slug instead of an
  // already-created client_secret. Any of a merchant's link slugs opens their
  // whole catalog (Store) — a customer buying several things adds them all
  // to one Cart and pays once, instead of needing a separate QR per item.
  if (linkSlug && !clientSecret) {
    const entrance = storePreviewMode ? null : createStoreEntrance();
    try {
      const store = await fetchStore(linkSlug, { preview: suppressStoreViewForMerchant(linkSlug) });
      const proposalPatch = standaloneStorePreviewPatch();
      const renderedStore = proposalPatch ? { ...store, ...proposalPatch } : store;
      loadCart(renderedStore);
      renderStoreRoute(linkSlug, renderedStore);
      restoreCatalogScroll(0);
      if (entrance) finishStoreEntrance(entrance, renderedStore);
      observeResize(app);
    } catch (err) {
      entrance?.remove();
      // The API's message is already a complete, customer-facing Spanish
      // sentence for the realistic failure here (store deleted/archived) —
      // no need to wrap or prefix it, that just produces a redundant phrase.
      app.innerHTML = `<div class="status failed">${ICON_X}<span>${escapeHtml((err as Error).message)}</span></div>`;
    }
    return;
  }

  if (!clientSecret) {
    app.innerHTML = `<div class="status failed">Falta client_secret, link o debt en la URL.</div>`;
    return;
  }

  await enterPaymentFlow(clientSecret);
}

async function renderDebtCollection(slug: string) {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page");
  document.body.classList.add("debt-collection-page");
  let info: DebtCollectionInfo;
  try {
    info = await fetchDebtCollection(slug);
  } catch (error) {
    app.innerHTML = `<div class="status failed">${ICON_X}<span>${escapeHtml((error as Error).message)}</span></div>`;
    return;
  }

  app.innerHTML = `
    <div class="debt-collection-heading">
      <span class="debt-company-label">${escapeHtml(info.companyName)}</span>
      <h1>${escapeHtml(info.collectionName)}</h1>
      <p>Escribe tu carnet para consultar el monto pendiente. El importe lo confirma la empresa y no puede editarse aquí.</p>
    </div>
    <form id="debt-lookup-form" class="debt-lookup-form" novalidate>
      <div class="field">
        <label for="debt-document">NIT / CI</label>
        <input id="debt-document" name="customerDocument" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="24" placeholder="Ej. 7845123" aria-describedby="debt-document-hint debt-lookup-error" required>
        <div class="hint" id="debt-document-hint">Escribe únicamente los números, sin extensión departamental.</div>
        <div class="field-error" id="debt-lookup-error" aria-live="polite"></div>
      </div>
      <button class="primary" type="submit" id="debt-lookup-submit">Consultar deuda</button>
    </form>
    <div id="debt-lookup-result" aria-live="polite"></div>
    <div class="secure-note debt-secure-note">${ICON_LOCK}<span>La consulta y el pago se procesan de forma segura por pagosYa</span></div>
  `;

  const form = app.querySelector<HTMLFormElement>("#debt-lookup-form")!;
  const input = app.querySelector<HTMLInputElement>("#debt-document")!;
  const error = app.querySelector<HTMLElement>("#debt-lookup-error")!;
  const result = app.querySelector<HTMLElement>("#debt-lookup-result")!;
  const submit = app.querySelector<HTMLButtonElement>("#debt-lookup-submit")!;
  input.addEventListener("input", () => {
    const digits = input.value.replace(/[^0-9]/g, "");
    if (input.value !== digits) input.value = digits;
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const customerDocument = input.value.trim();
    error.textContent = "";
    result.innerHTML = "";
    if (customerDocument.replace(/[^0-9]/g, "").length < 4) {
      error.textContent = "Escribe un carnet válido.";
      input.focus();
      return;
    }
    submit.disabled = true;
    submit.textContent = "Consultando…";
    try {
      const debt = await lookupDebt(slug, customerDocument);
      const pendingDebts = debt.debts.filter((item) => item.status === "pending");
      if (!pendingDebts.length) {
        result.innerHTML = `<div class="debt-result debt-result-paid"><div class="status success">${ICON_CHECK}<span>Todas tus deudas están pagadas</span></div><p>Si necesitas un comprobante, comunícate con ${escapeHtml(info.companyName)}.</p></div>`;
        return;
      }
      result.innerHTML = `
        <div class="debt-result">
          <div class="debt-result-row"><span>Cliente</span><strong>${escapeHtml(debt.customerLabel)}</strong></div>
          <fieldset class="debt-choice-list">
            <legend>Selecciona las deudas que quieres pagar</legend>
            ${debt.debts.map((item) => item.status === "paid" ? `
              <div class="debt-choice is-paid">
                <span class="debt-choice-check" aria-hidden="true">${ICON_CHECK}</span>
                <span class="debt-choice-copy"><strong>${escapeHtml(item.collectionName || item.description || "Deuda")}</strong><small>${escapeHtml(item.reference || item.description || "Pagada")}</small></span>
                <span class="debt-choice-amount">${formatAmount(item.amount, item.currency)}<small>Pagada</small></span>
              </div>` : `
              <label class="debt-choice">
                <input class="debt-choice-input" type="checkbox" value="${escapeHtml(item.id)}" checked>
                <span class="debt-choice-check" aria-hidden="true"></span>
                <span class="debt-choice-copy"><strong>${escapeHtml(item.collectionName || item.description || "Deuda pendiente")}</strong><small>${escapeHtml(item.reference || item.description || "Pendiente")}</small></span>
                <span class="debt-choice-amount">${formatAmount(item.amount, item.currency)}</span>
              </label>`).join("")}
          </fieldset>
          <div class="debt-result-total"><span id="debt-selection-label">Total seleccionado</span><strong id="debt-selection-total"></strong></div>
          <button class="primary" type="button" id="debt-pay">Continuar al pago</button>
        </div>`;
      const choices = Array.from(result.querySelectorAll<HTMLInputElement>(".debt-choice-input"));
      const payButton = result.querySelector<HTMLButtonElement>("#debt-pay")!;
      const selectionLabel = result.querySelector<HTMLElement>("#debt-selection-label")!;
      const selectionTotal = result.querySelector<HTMLElement>("#debt-selection-total")!;
      const updateSelection = () => {
        const selectedIds = new Set(choices.filter((choice) => choice.checked).map((choice) => choice.value));
        const selectedDebts = pendingDebts.filter((item) => selectedIds.has(item.id));
        const total = selectedDebts.reduce((sum, item) => sum + item.amount, 0);
        selectionLabel.textContent = `${selectedDebts.length} ${selectedDebts.length === 1 ? "deuda seleccionada" : "deudas seleccionadas"}`;
        selectionTotal.textContent = formatAmount(total, debt.currency);
        payButton.disabled = selectedDebts.length === 0;
        payButton.textContent = selectedDebts.length ? "Continuar al pago" : "Selecciona una deuda";
      };
      choices.forEach((choice) => choice.addEventListener("change", updateSelection));
      updateSelection();
      payButton.addEventListener("click", async (payEvent) => {
        const payButton = payEvent.currentTarget as HTMLButtonElement;
        const selectedDebtIds = choices.filter((choice) => choice.checked).map((choice) => choice.value);
        if (!selectedDebtIds.length) return;
        payButton.disabled = true;
        payButton.textContent = "Abriendo pago…";
        try {
          const checkout = await checkoutDebt(slug, customerDocument, selectedDebtIds);
          currentDebtSlug = slug;
          linkHeader = {
            storeName: checkout.companyName,
            description: checkout.description,
            contactEmail: checkout.contactEmail,
            contactPhone: checkout.contactPhone,
          };
          await enterPaymentFlow(checkout.clientSecret);
        } catch (checkoutError) {
          error.textContent = (checkoutError as Error).message;
          payButton.disabled = false;
          payButton.textContent = "Continuar al pago";
        }
      });
    } catch (lookupError) {
      error.textContent = (lookupError as Error).message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Consultar deuda";
    }
  });
}

async function enterPaymentFlow(clientSecret: string) {
  document.body.classList.remove("store-page", "product-detail-page", "debt-collection-page", "payment-success-page");
  document.body.classList.add("payment-page");
  let session: CheckoutSession;
  try {
    session = await fetchSession(clientSecret, checkoutPublishableKey);
    activeOrderTrackingToken = session.trackingToken ?? activeOrderTrackingToken;
  } catch (err) {
    app.innerHTML = `<div class="status failed">No se pudo cargar el pago: ${escapeHtml((err as Error).message)}</div>`;
    return;
  }

  const recipient = checkoutRecipientDetails(session);
  if (!isStoreCheckout(session) && recipient) {
    customerContact.name = recipient.name ?? "";
    customerContact.document = recipient.document ?? undefined;
    customerContact.email = recipient.email ?? "";
    customerContact.phone = recipient.phone ?? "";
  }

  postToParent("CHECKOUT_READY", {});
  renderForm(session, clientSecret);
  observeResize(app);
}

// Product/option key -> quantity, persisted to localStorage (see loadCart/saveCart)
// keyed by storeId. A product with options can carry both Pequeña and Grande
// as separate cart lines without duplicating the product in the catalog.
const cart = new Map<string, number>();
let appliedPromo: { storeId: string; code: string; discountType: "PERCENT" | "FIXED"; discountValue: number } | null = null;
const selectedVariantByItem = new Map<string, string>();
const selectedExtraIdsByItem = new Map<string, Set<string>>();
const selectedProductImageByItem = new Map<string, number>();
const CART_VARIANT_SEPARATOR = "::";
const CART_EXTRAS_SEPARATOR = "~~";

function itemVariants(item: StoreItem): StoreItem["variants"] {
  return item.variants ?? [];
}

function itemExtras(item: StoreItem): StoreItem["extras"] {
  return item.extras ?? [];
}

function cartItemKey(paymentLinkId: string, variantId?: string, extraIds: string[] = []): string {
  const base = variantId ? `${paymentLinkId}${CART_VARIANT_SEPARATOR}${variantId}` : paymentLinkId;
  const normalizedExtras = [...new Set(extraIds)].sort();
  return normalizedExtras.length ? `${base}${CART_EXTRAS_SEPARATOR}${normalizedExtras.join(",")}` : base;
}

function parseCartItemKey(key: string): { paymentLinkId: string; variantId?: string; extraIds: string[] } {
  const [base, encodedExtras = ""] = key.split(CART_EXTRAS_SEPARATOR, 2);
  const [paymentLinkId, variantId] = base.split(CART_VARIANT_SEPARATOR, 2);
  const extraIds = encodedExtras.split(",").filter(Boolean);
  return { paymentLinkId, ...(variantId ? { variantId } : {}), extraIds };
}

function selectedVariantFor(item: StoreItem): StoreItem["variants"][number] | undefined {
  const variants = itemVariants(item);
  if (variants.length === 0) return undefined;
  const selectedId = selectedVariantByItem.get(item.id);
  const remembered = variants.find((variant) => variant.id === selectedId);
  if (remembered && optionStock(item, remembered) !== 0) return remembered;
  selectedVariantByItem.delete(item.id);
  return undefined;
}

function selectedExtrasFor(item: StoreItem): StoreItem["extras"] {
  const selected = selectedExtraIdsByItem.get(item.id) ?? new Set<string>();
  return itemExtras(item).filter((extra) => selected.has(extra.id));
}

function selectedExtrasAmount(extras: StoreItem["extras"]): number {
  const selectedByGroup = new Map<string, number>();
  return extras.reduce((total, extra) => {
    const group = extra.groupName?.trim().toLocaleLowerCase("es");
    if (!group) return total + extra.amount;
    const selectionNumber = (selectedByGroup.get(group) ?? 0) + 1;
    selectedByGroup.set(group, selectionNumber);
    return total + (selectionNumber <= (extra.freeAllowance ?? 0) ? 0 : extra.amount);
  }, 0);
}

function extraDisplayAmount(item: StoreItem, extra: StoreItem["extras"][number], selectedExtras: StoreItem["extras"]): number {
  const group = extra.groupName?.trim().toLocaleLowerCase("es");
  if (!group) return extra.amount;
  const selectedIds = new Set(selectedExtras.map((selected) => selected.id));
  selectedIds.add(extra.id);
  const groupSelections = itemExtras(item).filter((candidate) =>
    selectedIds.has(candidate.id) && candidate.groupName?.trim().toLocaleLowerCase("es") === group,
  );
  const selectionNumber = groupSelections.findIndex((candidate) => candidate.id === extra.id) + 1;
  return selectionNumber > 0 && selectionNumber <= (extra.freeAllowance ?? 0) ? 0 : extra.amount;
}

function extrasCourtesyCopy(item: StoreItem): string {
  const groups = new Map<string, { name: string; allowance: number }>();
  itemExtras(item).forEach((extra) => {
    const name = extra.groupName?.trim();
    if (name && (extra.freeAllowance ?? 0) > 0) groups.set(name.toLocaleLowerCase("es"), { name, allowance: extra.freeAllowance ?? 0 });
  });
  return [...groups.values()].map((group) => `${group.name}: ${group.allowance} ${group.allowance === 1 ? "incluida" : "incluidas"}`).join(" · ");
}

function productConfigurationComplete(item: StoreItem): boolean {
  if (itemVariants(item).length > 0 && !selectedVariantFor(item)) return false;
  const selectedIds = selectedExtraIdsByItem.get(item.id) ?? new Set<string>();
  return itemExtras(item).every((extra) => !extra.required || (extra.available && selectedIds.has(extra.id)));
}

function activeProductDiscount(item: StoreItem, now = Date.now()): number | null {
  const percent = item.discountPercent;
  const startsAt = item.discountStartsAt ? Date.parse(item.discountStartsAt) : Number.NaN;
  const endsAt = item.discountEndsAt ? Date.parse(item.discountEndsAt) : Number.NaN;
  return typeof percent === "number" && Number.isInteger(percent) && percent >= 1 && percent <= 99 && Number.isFinite(startsAt) && Number.isFinite(endsAt) && now >= startsAt && now < endsAt
    ? percent
    : null;
}

function discountedProductAmount(item: StoreItem, amount: number): number {
  const percent = activeProductDiscount(item);
  return percent === null ? amount : Math.max(0, Math.round(amount * (100 - percent) / 100));
}

function originalSelectedUnitAmount(item: StoreItem, variant = selectedVariantFor(item), extras = selectedExtrasFor(item)): number {
  return (variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
}

function selectedUnitAmount(item: StoreItem, variant = selectedVariantFor(item), extras = selectedExtrasFor(item)): number {
  return discountedProductAmount(item, variant?.amount ?? item.amount) + selectedExtrasAmount(extras);
}

function discountRemainingLabel(item: StoreItem): string {
  const remaining = Math.max(0, Date.parse(item.discountEndsAt || "") - Date.now());
  const totalMinutes = Math.max(1, Math.ceil(remaining / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `Termina en ${days}d ${hours}h`;
  if (hours > 0) return `Termina en ${hours}h ${minutes}m`;
  return `Termina en ${minutes}m`;
}

function salePriceHtml(item: StoreItem, discountedAmount: number, originalAmount: number, className: string): string {
  const percent = activeProductDiscount(item);
  if (percent === null) return `<span class="${className}">${formatAmount(discountedAmount, item.currency)}</span>`;
  return `<span class="sale-price-wrap"><span class="${className} sale-price">${formatAmount(discountedAmount, item.currency)}</span><del>${formatAmount(originalAmount, item.currency)}</del></span>`;
}

function productCartQuantity(paymentLinkId: string): number {
  let quantity = 0;
  for (const [key, lineQuantity] of cart) {
    if (parseCartItemKey(key).paymentLinkId === paymentLinkId) quantity += lineQuantity;
  }
  return quantity;
}

function optionCartQuantity(paymentLinkId: string, variantId: string | undefined): number {
  let quantity = 0;
  for (const [key, lineQuantity] of cart) {
    const selected = parseCartItemKey(key);
    if (selected.paymentLinkId === paymentLinkId && selected.variantId === variantId) quantity += lineQuantity;
  }
  return quantity;
}

function productStockLimit(item: StoreItem): number | null {
  return item.purchaseLimit === undefined ? item.stock : item.purchaseLimit;
}

function optionStock(item: StoreItem, variant: StoreItem["variants"][number] | undefined): number | null {
  if (variant?.purchaseLimit !== undefined) return variant.purchaseLimit;
  if (variant?.stock !== undefined) return variant.stock;
  return productStockLimit(item);
}

function remainingStock(item: StoreItem, variant: StoreItem["variants"][number] | undefined): number | null {
  const remaining: number[] = [];
  const productLimit = productStockLimit(item);
  if (productLimit !== null) remaining.push(Math.max(0, productLimit - productCartQuantity(item.id)));
  const variantStock = optionStock(item, variant);
  if (variantStock !== null) {
    const lineQuantity = optionCartQuantity(item.id, variant?.id);
    remaining.push(Math.max(0, variantStock - lineQuantity));
  }
  return remaining.length ? Math.min(...remaining) : null;
}

function stockStatus(remaining: number | null, showLowStock: boolean): { label: string; exhausted: boolean } | null {
  if (remaining === 0) return { label: "¡Stock agotado!", exhausted: true };
  if (!showLowStock) return null;
  if (remaining !== null && remaining < 5) {
    return { label: `¡Solo ${remaining === 1 ? "queda" : "quedan"} ${remaining}!`, exhausted: false };
  }
  return null;
}

// renderStore() re-runs on every qty +/- click (full re-render, not a patch)
// — the staggered entrance animation should only ever play once, on the
// real first paint, not replay/flash on every cart interaction.
let hasStoreAnimatedIn = false;
let activePromotionCleanup: (() => void) | null = null;
document.addEventListener("visibilitychange", () => document.body.classList.toggle("motion-paused", document.hidden));

function leadEmailStorageKey(storeId: string): string {
  return `pagosya_lead_email_${storeId}`;
}

function loadLeadEmail(storeId: string): string {
  try {
    return sessionStorage.getItem(leadEmailStorageKey(storeId)) || "";
  } catch {
    return "";
  }
}

function saveLeadEmail(storeId: string, email: string): void {
  try {
    sessionStorage.setItem(leadEmailStorageKey(storeId), email);
  } catch {
    // The form still prefills for the current render when storage is blocked.
  }
}
let activeAnnouncementCleanup: (() => void) | null = null;
let activeHeroCleanup: (() => void) | null = null;
let activeStoreExperienceCleanup: (() => void) | null = null;
let activeDiscountCleanup: (() => void) | null = null;

function bindTimedDiscountSchedule(slug: string, store: Store): void {
  activeDiscountCleanup?.();
  activeDiscountCleanup = null;
  const scheduledItems = store.items.filter((item) => Number.isFinite(Date.parse(item.discountStartsAt || "")) && Number.isFinite(Date.parse(item.discountEndsAt || "")) && Date.parse(item.discountEndsAt || "") > Date.now());
  if (!scheduledItems.length) return;
  const updateLabels = () => {
    app.querySelectorAll<HTMLElement>("[data-discount-ends-at]").forEach((element) => {
      const item = store.items.find((candidate) => candidate.discountEndsAt === element.dataset.discountEndsAt);
      if (item && activeProductDiscount(item) !== null) element.textContent = discountRemainingLabel(item);
    });
  };
  const now = Date.now();
  const nextBoundary = scheduledItems
    .flatMap((item) => [Date.parse(item.discountStartsAt || ""), Date.parse(item.discountEndsAt || "")])
    .filter((timestamp) => Number.isFinite(timestamp) && timestamp > now)
    .sort((a, b) => a - b)[0];
  const interval = window.setInterval(updateLabels, 30_000);
  const timeout = nextBoundary
    ? window.setTimeout(() => renderStoreRoute(slug, store, { focusPromotion: false }), Math.min(nextBoundary - now + 100, 2_147_000_000))
    : undefined;
  updateLabels();
  activeDiscountCleanup = () => {
    window.clearInterval(interval);
    if (timeout !== undefined) window.clearTimeout(timeout);
  };
}

// Search/category filter state for large catalogs — lives outside
// renderStoreGrid() so typing/clicking doesn't need to touch (and thus
// never loses focus on) the toolbar that renders these controls.
let searchQuery = "";
// "ALL" shows everything; "null" (string) is the sentinel for the
// uncategorized/"Otros" bucket, since categoryId itself is `string | null`
// and dataset attributes can only hold strings.
let selectedCategoryId: string = "ALL";
let activeCatalogStoreId: string | null = null;
// "featured" keeps the merchant's own catalog order (createdAt); the others
// re-sort within each category section, never across section boundaries.
let sortMode: "featured" | "price-asc" | "price-desc" | "popular" = "featured";

type CatalogSection = { id: string; name: string; items: StoreItem[] };

function catalogSectionsForStore(store: Store): CatalogSection[] {
  const byCategory = new Map<string | null, StoreItem[]>();
  for (const item of store.items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  return [
    ...store.categories.map((category) => ({ id: category.id, name: category.name, items: byCategory.get(category.id) ?? [] })),
    ...(byCategory.get(null)?.length ? [{ id: "null", name: "Otros", items: byCategory.get(null)! }] : []),
  ].filter((section) => section.items.length > 0);
}

function sortStoreItems(items: StoreItem[]): StoreItem[] {
  if (sortMode === "price-asc") return [...items].sort((a, b) => discountedProductAmount(a, a.amount) - discountedProductAmount(b, b.amount));
  if (sortMode === "price-desc") return [...items].sort((a, b) => discountedProductAmount(b, b.amount) - discountedProductAmount(a, a.amount));
  if (sortMode === "popular") return [...items].sort((a, b) => b.soldCount - a.soldCount);
  return items;
}

function itemMatchesSearch(item: StoreItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.name, item.description ?? "", ...item.tags].join(" ").toLowerCase();
  return haystack.includes(query);
}

function cartStorageKey(storeId: string): string {
  return `pagosya_cart_${storeId}`;
}

function loadCart(store: Store): void {
  cart.clear();
  selectedVariantByItem.clear();
  selectedExtraIdsByItem.clear();
  try {
    const raw = localStorage.getItem(cartStorageKey(store.storeId));
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, number>;
    const loadedByProduct = new Map<string, number>();
    const loadedByOption = new Map<string, number>();
    for (const [key, qty] of Object.entries(saved)) {
      // Drop entries for items archived/deleted since the cart was saved, and any
      // corrupt values — a stale or tampered cart must never crash the storefront.
      const { paymentLinkId, variantId, extraIds } = parseCartItemKey(key);
      const item = store.items.find((candidate) => candidate.id === paymentLinkId);
      if (!item || !Number.isInteger(qty) || qty <= 0) continue;
      const variants = itemVariants(item);
      if (variants.length > 0 && (!variantId || !variants.some((variant) => variant.id === variantId))) continue;
      if (variants.length === 0 && variantId) continue;
      const extras = itemExtras(item);
      if (extraIds.some((id) => !extras.some((extra) => extra.id === id))) continue;
      if (extras.some((extra) => extra.required && !extraIds.includes(extra.id))) continue;

      const variant = variants.find((candidate) => candidate.id === variantId);
      const optionKey = cartItemKey(item.id, variantId);
      const cartKey = cartItemKey(item.id, variantId, extraIds);
      const alreadyLoaded = loadedByProduct.get(item.id) ?? 0;
      const alreadyLoadedForOption = loadedByOption.get(optionKey) ?? 0;
      const productLimit = productStockLimit(item);
      const productAvailable = productLimit === null ? qty : Math.max(0, productLimit - alreadyLoaded);
      const availableForOption = optionStock(item, variant);
      const optionAvailable = availableForOption === null ? qty : Math.max(0, availableForOption - alreadyLoadedForOption);
      const clamped = Math.min(qty, productAvailable, optionAvailable);
      if (clamped > 0) {
        cart.set(cartKey, clamped);
        loadedByProduct.set(item.id, alreadyLoaded + clamped);
        loadedByOption.set(optionKey, alreadyLoadedForOption + clamped);
        if (variantId && !selectedVariantByItem.has(item.id)) selectedVariantByItem.set(item.id, variantId);
        if (!selectedExtraIdsByItem.has(item.id)) selectedExtraIdsByItem.set(item.id, new Set(extraIds));
      }
    }
  } catch {
    // Corrupt localStorage — fall back to an empty cart rather than throwing.
  }
}

function saveCart(store: Store): void {
  const key = cartStorageKey(store.storeId);
  if (cart.size === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(Object.fromEntries(cart)));
}

function cartTotal(items: StoreItem[]): number {
  let total = 0;
  for (const [key, quantity] of cart) {
    const { paymentLinkId, variantId, extraIds } = parseCartItemKey(key);
    const item = items.find((candidate) => candidate.id === paymentLinkId);
    if (!item) continue;
    const variant = itemVariants(item).find((candidate) => candidate.id === variantId);
    const extras = itemExtras(item).filter((extra) => extraIds.includes(extra.id));
    total += selectedUnitAmount(item, variant, extras) * quantity;
  }
  return total;
}

function cartCount(): number {
  return [...cart.values()].reduce((sum, qty) => sum + qty, 0);
}

function activePromoForStore(store: Store) {
  return appliedPromo?.storeId === store.storeId ? appliedPromo : null;
}

function promoDiscountAmount(store: Store): number {
  const promo = activePromoForStore(store);
  const subtotal = cartTotal(store.items);
  if (!promo || subtotal <= 1) return 0;
  const requested = promo.discountType === "PERCENT"
    ? Math.floor(subtotal * promo.discountValue / 100)
    : promo.discountValue;
  return Math.max(0, Math.min(requested, subtotal - 1));
}

function storeCatalogUrl(slug: string): string {
  const params = new URLSearchParams();
  if (storePreviewMode) params.set("preview", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}${query ? `?${query}` : ""}`;
}

function categoryPageUrl(slug: string, categoryId: string): string {
  const params = new URLSearchParams();
  if (storePreviewMode) params.set("preview", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug
    ? `/c/${encodeURIComponent(categoryId)}`
    : `/s/${encodeURIComponent(slug)}/c/${encodeURIComponent(categoryId)}`;
  return `${pathname}${query ? `?${query}` : ""}`;
}

function productPageUrl(slug: string, productId: string, categoryId = selectedCategoryId): string {
  const params = new URLSearchParams();
  if (categoryId !== "ALL") params.set("category", categoryId);
  if (storePreviewMode) params.set("preview", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug
    ? `/p/${encodeURIComponent(productId)}`
    : `/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`;
  return `${pathname}${query ? `?${query}` : ""}`;
}

function productImagePosition(item: StoreItem, index: number): string {
  const position = item.imagePositions?.[index] || "50% 50%";
  return /^(?:0|[1-9]\d?|100)% (?:0|[1-9]\d?|100)%$/.test(position) ? position : "50% 50%";
}

function storeImagePosition(store: Store, imageUrl: string | null | undefined): string {
  if (!imageUrl) return "50% 50%";
  const imageKey = normalizedAssetKey(imageUrl);
  for (const item of store.items) {
    const imageIndex = item.imageUrls.findIndex((itemImageUrl) => normalizedAssetKey(itemImageUrl) === imageKey);
    if (imageIndex >= 0) return productImagePosition(item, imageIndex);
  }
  return "50% 50%";
}

function normalizedAssetKey(imageUrl: string): string {
  const value = String(imageUrl || "").trim();
  if (!value) return "";
  try {
    const parsed = new URL(value, window.location.origin);
    return decodeURIComponent(parsed.pathname).replace(/^\/v1(?=\/uploads\/)/, "");
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/^\/v1(?=\/uploads\/)/, "");
  }
}

function storeContentFingerprint(parts: unknown[]): string {
  const value = parts.map((part) => String(part ?? "")).join("\u241f");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function consumeStoreContentOnce(kind: "announcement" | "promotion", storeId: string, parts: unknown[]): boolean {
  // The appearance editor must keep showing the element being edited. The
  // once-only rule applies to the customer-facing storefront.
  if (storePreviewMode) return true;
  const key = `pagosya_store_${kind}_seen_${storeId}_${storeContentFingerprint(parts)}`;
  try {
    if (localStorage.getItem(key) === "1") return false;
    localStorage.setItem(key, "1");
  } catch {
    // Storage can be unavailable in privacy-restricted browsers. Showing the
    // content again is safer than preventing a merchant notice entirely.
  }
  return true;
}

function storeAnnouncementHtml(store: Store): string {
  if (!store.announcement || !hasReadableContent(store.announcement)) return "";
  const mode = store.announcementMode === "marquee" ? "marquee" : "static";
  const duration = Math.min(40, Math.max(8, Number(store.announcementSpeed) || 18));
  const size = "small";
  const configuredColor = /^#[0-9a-f]{6}$/i.test(store.announcementColor || "") ? store.announcementColor.toLowerCase() : "";
  // The legacy amber value was the implicit default rather than an authored
  // merchant choice. Render that value as the new white storefront default;
  // explicitly selected colors remain available.
  const color = configuredColor && configuredColor !== "#c58b3c" ? configuredColor : "#ffffff";
  const style = `--announcement-bg:${color};--announcement-ink:${accentContrastColor(color)};--marquee-duration:${duration}s`;
  if (mode === "static") {
    return `<div class="store-announcement announcement-size-${size}" style="${style}">${escapeHtml(store.announcement)}</div>`;
  }
  const sequence = store.announcement
    .split(/\s*(?:[•·|]|\r?\n)\s*/u)
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .map((phrase) => `<span class="store-announcement-phrase">${escapeHtml(phrase)}</span><span class="store-announcement-separator">•</span>`)
    .join("");
  return `<aside class="store-announcement marquee announcement-size-${size}" style="${style}" aria-label="Anuncio">
    <span class="store-announcement-a11y">${escapeHtml(store.announcement)}</span>
    <div class="store-announcement-track" aria-hidden="true">
      <span class="store-announcement-sequence">${sequence}</span>
      <span class="store-announcement-sequence" data-marquee-copy="duplicate">${sequence}</span>
    </div>
  </aside>`;
}

function storefrontHeaderHtml(
  slug: string,
  store: Store,
  options: { current: "home" | "catalog"; catalogUrl?: string } = { current: "home" },
): string {
  const logoUrl = assetUrl(store.logoUrl);
  const visibleStoreName = store.storeName.trim();
  const storeUrl = storeCatalogUrl(slug);
  const catalogUrl = options.catalogUrl || storeUrl;
  const onStorePage = options.current === "home";
  const homeHref = onStorePage ? "#store-top" : storeUrl;
  const catalogHref = onStorePage || document.body.classList.contains("category-page")
    ? "#store-products"
    : `${catalogUrl}#store-products`;
  const sectionHref = (section: string) => onStorePage ? `#${section}` : `${storeUrl}#${section}`;
  const cartItems = cartCount();
  return `<header class="merchant-header store-site-header${!visibleStoreName && logoUrl ? " has-prominent-logo" : ""}${!visibleStoreName && logoUrl && !store.tagline ? " is-logo-only" : ""}" id="store-top">
    <a class="store-site-brand" href="${escapeHtml(homeHref)}" aria-label="${escapeHtml(visibleStoreName ? `Ir al inicio de ${visibleStoreName}` : "Ir al inicio de la tienda")}">
      ${logoUrl ? `<img class="merchant-header-logo" src="${escapeHtml(logoUrl)}" alt="${visibleStoreName ? "" : "Logo de la tienda"}">` : ""}
      ${visibleStoreName || store.tagline ? `<span class="merchant-header-copy">
        ${visibleStoreName ? `<strong class="store-title">${escapeHtml(visibleStoreName)}</strong>` : ""}
        ${store.tagline ? `<span class="store-tagline">${escapeHtml(store.tagline)}</span>` : ""}
      </span>` : ""}
    </a>
    <nav class="store-site-nav" aria-label="Secciones de la tienda">
      <a href="${escapeHtml(homeHref)}"${options.current === "home" ? ' aria-current="page"' : ""}>Inicio</a>
      <a href="${escapeHtml(catalogHref)}"${options.current === "catalog" ? ' aria-current="page"' : ""}><span>Catálogo</span>${ICON_CHEVRON_DOWN}</a>
      ${store.locations?.length || store.locationMapUrl ? `<a href="${escapeHtml(sectionHref("store-location"))}">Ubicación</a>` : ""}
      ${store.contactFormEnabled === true ? `<a href="${escapeHtml(sectionHref("store-contact"))}">Contacto</a>` : ""}
    </nav>
    <div class="store-site-utility" aria-label="Acciones de la tienda">
      <a class="store-header-action store-header-search" href="${escapeHtml(catalogHref)}" aria-label="Buscar en el catálogo">${ICON_SEARCH}</a>
      ${storePreviewMode || storeOwnerMode ? "" : `<a class="store-header-action store-directory-back" href="/stores/" aria-label="Volver a Mi Tienda">${ICON_PERSON}<span class="visually-hidden">Volver a Mi Tienda</span></a>`}
      <button class="store-header-action store-header-cart" type="button" aria-label="Abrir carrito, ${cartItems} ${cartItems === 1 ? "producto" : "productos"}" ${cartItems === 0 ? "disabled" : ""}>${ICON_BAG}<span class="store-header-cart-count"${cartItems === 0 ? " hidden" : ""}>${cartItems}</span></button>
    </div>
  </header>`;
}

function bindStoreAnnouncementPlayback(): void {
  activeAnnouncementCleanup?.();
  activeAnnouncementCleanup = null;
  const announcement = app.querySelector<HTMLElement>(".store-announcement.marquee");
  if (!announcement) return;
  let isInView = true;
  const syncPlayback = () => announcement.classList.toggle("is-paused", document.hidden || !isInView);
  const observer = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
        isInView = entry?.isIntersecting ?? true;
        syncPlayback();
      })
    : null;
  observer?.observe(announcement);
  document.addEventListener("visibilitychange", syncPlayback);
  syncPlayback();
  activeAnnouncementCleanup = () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", syncPlayback);
  };
}

function renderProductCard(slug: string, item: StoreItem, index: number, showLowStock: boolean): string {
  const variants = itemVariants(item);
  const selectedVariant = selectedVariantFor(item);
  const selectedExtras = selectedExtrasFor(item);
  const key = cartItemKey(item.id, selectedVariant?.id, selectedExtras.map((extra) => extra.id));
  const qty = cart.get(key) ?? 0;
  const images = item.imageUrls.map(assetUrl).filter((u): u is string => !!u);
  const selectedStock = optionStock(item, selectedVariant);
  const unavailableRequiredExtra = itemExtras(item).find((extra) => extra.required && !extra.available);
  const productLimit = productStockLimit(item);
  const soldOut = productLimit === 0 || selectedStock === 0 || Boolean(unavailableRequiredExtra);
  const atProductLimit = productLimit !== null && productCartQuantity(item.id) >= productLimit;
  const atOptionLimit = selectedStock !== null && optionCartQuantity(item.id, selectedVariant?.id) >= selectedStock;
  const configurationComplete = productConfigurationComplete(item);
  const atStockLimit = atProductLimit || atOptionLimit || !configurationComplete;
  // Staggered on first paint only (see hasStoreAnimatedIn) — capped so a
  // long catalog doesn't leave the last cards waiting a visible beat to
  // appear.
  const staggerStyle = hasStoreAnimatedIn ? "" : ` style="--stagger-delay: ${Math.min(index * 45, 360)}ms"`;
  const detailUrl = productPageUrl(slug, item.id);
  const discountPercent = activeProductDiscount(item);
  const saleBadgeHtml = discountPercent === null ? "" : `<div class="product-sale-badge" role="status" aria-label="${discountPercent}% de descuento activo"><strong>${discountPercent}% OFF</strong><span data-discount-ends-at="${escapeHtml(item.discountEndsAt || "")}">${escapeHtml(discountRemainingLabel(item))}</span></div>`;

  const galleryHtml = images.length
    ? `
      <div class="store-item-gallery">
        <a class="store-item-image-link product-page-link" href="${escapeHtml(detailUrl)}" aria-label="Ver ${escapeHtml(item.name)}">
          <img class="store-item-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(item.name)}" style="object-position:${productImagePosition(item, 0)}" />
        </a>
        ${
          images.length > 1
            ? `<button type="button" class="product-gallery-arrow previous" data-gallery-step="-1" aria-label="Ver foto anterior">${ICON_ARROW_LEFT}</button>
               <button type="button" class="product-gallery-arrow next" data-gallery-step="1" aria-label="Ver foto siguiente">${ICON_ARROW_RIGHT}</button>
               <div class="gallery-thumbs">
                ${images.map((url, i) => `<button type="button" class="gallery-thumb-btn ${i === 0 ? "active" : ""}" data-src="${escapeHtml(url)}" data-position="${productImagePosition(item, i)}" aria-label="Foto ${i + 1}"></button>`).join("")}
              </div>`
            : ""
        }
      </div>`
    : `<a class="store-item-image store-item-image-link placeholder product-page-link" href="${escapeHtml(detailUrl)}" aria-label="Ver ${escapeHtml(item.name)}"><span>${escapeHtml(initials(item.name))}</span></a>`;

  const tagsHtml = item.tags.length
    ? `<div class="store-item-tags">${item.tags.map((t) => `<span class="tag-badge">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  const visibleStock = stockStatus(remainingStock(item, selectedVariant), showLowStock);
  const stockNote = unavailableRequiredExtra
    ? `<div class="stock-note out">${escapeHtml(unavailableRequiredExtra.name)} agotado</div>`
    : visibleStock
    ? `<div class="stock-note${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</div>`
    : "";

  const variantsHtml = variants.length
    ? `<div class="store-item-option">
        <label for="variant-${escapeHtml(item.id)}">Selecciona una versión</label>
        <select id="variant-${escapeHtml(item.id)}" class="variant-select" aria-label="Opción para ${escapeHtml(item.name)}">
          <option value="" ${selectedVariant ? "" : "selected"}>Elige tamaño, sabor o presentación</option>
          ${variants
            .map(
              (variant) =>
                `<option value="${escapeHtml(variant.id)}" ${variant.id === selectedVariant?.id ? "selected" : ""} ${optionStock(item, variant) === 0 ? "disabled" : ""}>${escapeHtml(variant.name)} - ${formatAmount(discountedProductAmount(item, variant.amount), item.currency)}${discountPercent === null ? "" : ` (antes ${formatAmount(variant.amount, item.currency)})`}${stockStatus(remainingStock(item, variant), showLowStock) ? `, ${stockStatus(remainingStock(item, variant), showLowStock)!.label}` : ""}</option>`,
            )
            .join("")}
        </select>
      </div>`
    : "";

  const courtesyCopy = extrasCourtesyCopy(item);
  const extrasHtml = itemExtras(item).length
    ? `<fieldset class="store-item-extras"><legend>Personaliza${courtesyCopy ? ` · ${escapeHtml(courtesyCopy)}` : ""}</legend>${itemExtras(item).map((extra) => { const displayAmount = extraDisplayAmount(item, extra, selectedExtras); return `<label><input type="checkbox" class="extra-toggle" data-extra-id="${escapeHtml(extra.id)}" ${selectedExtras.some((selected) => selected.id === extra.id) ? "checked" : ""} ${extra.available ? "" : "disabled"}><span>${escapeHtml(extra.name)}${extra.required ? ` <small>Requerido</small>` : ""}${extra.available ? "" : ` <small>Agotado</small>`}</span><strong>${displayAmount === 0 ? "Incluido" : `+${formatAmount(displayAmount, item.currency)}`}</strong></label>`; }).join("")}</fieldset>`
    : "";

  return `
    <div class="store-item ${soldOut ? "sold-out" : ""}${discountPercent === null ? "" : " has-sale"}" data-id="${item.id}"${staggerStyle}>
      ${saleBadgeHtml}
      ${galleryHtml}
      <div class="store-item-info">
        ${tagsHtml}
        <a class="store-item-name product-page-link" href="${escapeHtml(detailUrl)}">${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" title="${escapeHtml(item.color)}"></span>` : ""}${escapeHtml(item.name)}</a>
        ${item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
        ${variantsHtml}
        ${extrasHtml}
        ${!configurationComplete ? `<div class="product-configuration-note">Completa las opciones requeridas para agregar.</div>` : ""}
        <div class="store-item-price">${salePriceHtml(item, selectedUnitAmount(item, selectedVariant, selectedExtras), originalSelectedUnitAmount(item, selectedVariant, selectedExtras), "store-item-current-price")}${stockNote}</div>
      </div>
      ${
        soldOut
          ? ""
          : `<div class="qty-stepper">
              <button type="button" class="qty-minus" aria-label="Quitar una unidad de ${escapeHtml(item.name)}" ${qty === 0 ? "disabled" : ""}>−</button>
              <span class="qty-value">${qty}</span>
              <button type="button" class="qty-plus" aria-label="Agregar una unidad de ${escapeHtml(item.name)}" ${atStockLimit ? "disabled" : ""}>+</button>
            </div>`
      }
    </div>`;
}

// Tracked so a failed/canceled payment screen can offer a real way back
// instead of a dead end — the cart itself is already cleared by the time a
// customer reaches the payment form (see checkoutCart's cart.clear() call),
// so "back to store" means the plain store link, not cart restoration.
let currentStoreSlug: string | null = null;
let activeCustomDomainSlug: string | null = null;
let currentDebtSlug: string | null = null;
let checkoutPublishableKey: string | null = null;
type StorePreviewPatch = Partial<
  Pick<
    Store,
    | "storeName"
    | "tagline"
    | "logoUrl"
    | "bannerUrl"
    | "backgroundColor"
    | "backgroundMode"
    | "backgroundGradientStart"
    | "backgroundGradientEnd"
    | "backgroundGradientAngle"
    | "backgroundImageUrl"
    | "contactPhone"
    | "contactEmail"
    | "contactFormEnabled"
    | "contactTitle"
    | "contactSubtitle"
    | "locationMapUrl"
    | "locationDescription"
    | "locationHighlight"
    | "locationTitle"
    | "locationSubtitle"
    | "locations"
    | "aboutText"
    | "aboutTitle"
    | "aboutSubtitle"
    | "aboutImageUrl"
    | "catalogTitle"
    | "catalogSubtitle"
    | "galleryTitle"
    | "gallerySubtitle"
    | "linksTitle"
    | "accentColor"
    | "fontStyle"
    | "buttonStyle"
    | "buttonVariant"
    | "buttonMotion"
    | "cartButtonLabel"
    | "checkoutMode"
    | "leadCaptureUrl"
    | "cartRecommendationsEnabled"
    | "cartRecommendationProductIds"
    | "boardTexture"
    | "announcement"
    | "announcementMode"
    | "announcementSpeed"
    | "announcementSize"
    | "announcementColor"
    | "promotionEnabled"
    | "promotionImageUrl"
    | "promotionTitle"
    | "promotionBody"
    | "promotionCtaLabel"
    | "promotionCtaUrl"
    | "heroSlides"
    | "contentOrder"
    | "sectionBackgrounds"
    | "layoutStyle"
    | "experienceStyle"
    | "motionDuoEnabled"
    | "motionExperience"
    | "motionExperiences"
    | "animations"
    | "editorialGallery"
    | "links"
  >
>;

function sanitizeStorePreviewProduct(value: unknown, store: Store): StoreItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string") return null;
  const existing = store.items.find((item) => item.id === source.id);
  if (!existing) return null;
  const preview: StoreItem = { ...existing };
  if (typeof source.name === "string") preview.name = source.name.slice(0, 200);
  if (source.description === null || typeof source.description === "string") preview.description = typeof source.description === "string" ? source.description.slice(0, 2000) : null;
  if (typeof source.amount === "number" && Number.isInteger(source.amount) && source.amount >= 0 && source.amount <= 100_000_000_000) preview.amount = source.amount;
  if (source.discountPercent === null || (typeof source.discountPercent === "number" && Number.isInteger(source.discountPercent) && source.discountPercent >= 1 && source.discountPercent <= 99)) preview.discountPercent = source.discountPercent as number | null;
  if (source.discountStartsAt === null || (typeof source.discountStartsAt === "string" && Number.isFinite(Date.parse(source.discountStartsAt)))) preview.discountStartsAt = source.discountStartsAt as string | null;
  if (source.discountEndsAt === null || (typeof source.discountEndsAt === "string" && Number.isFinite(Date.parse(source.discountEndsAt)))) preview.discountEndsAt = source.discountEndsAt as string | null;
  if (source.categoryId === null || typeof source.categoryId === "string") preview.categoryId = source.categoryId as string | null;
  if (source.color === null || (typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color))) preview.color = source.color as string | null;
  if (source.stock === null || (typeof source.stock === "number" && Number.isInteger(source.stock) && source.stock >= 0 && source.stock <= 1_000_000)) preview.stock = source.stock;
  if (Array.isArray(source.tags)) preview.tags = source.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 6).map((tag) => tag.slice(0, 80));
  if (Array.isArray(source.imageUrls)) preview.imageUrls = source.imageUrls.filter((url): url is string => typeof url === "string" && url.length <= 1000).slice(0, 10);
  if (Array.isArray(source.imagePositions)) preview.imagePositions = source.imagePositions.filter((position): position is string => typeof position === "string" && /^\d{1,3}% \d{1,3}%$/.test(position)).slice(0, 10);
  if (Array.isArray(source.variants)) {
    preview.variants = source.variants
      .filter((variant): variant is Record<string, unknown> => !!variant && typeof variant === "object" && !Array.isArray(variant))
      .slice(0, 8)
      .map((variant, index) => ({
        id: typeof variant.id === "string" ? variant.id.slice(0, 200) : `preview-variant-${index}`,
        name: typeof variant.name === "string" ? variant.name.slice(0, 120) : `Opción ${index + 1}`,
        amount: typeof variant.amount === "number" && Number.isInteger(variant.amount) && variant.amount >= 0 ? Math.min(variant.amount, 100_000_000_000) : 0,
        stock: variant.stock === null ? null : typeof variant.stock === "number" && Number.isInteger(variant.stock) && variant.stock >= 0 ? Math.min(variant.stock, 1_000_000) : null,
      }));
  }
  if (Array.isArray(source.extras)) {
    preview.extras = source.extras
      .filter((extra): extra is Record<string, unknown> => !!extra && typeof extra === "object" && !Array.isArray(extra))
      .slice(0, 12)
      .map((extra, index) => ({
        id: typeof extra.id === "string" ? extra.id.slice(0, 200) : `preview-extra-${index}`,
        name: typeof extra.name === "string" ? extra.name.slice(0, 120) : `Extra ${index + 1}`,
        amount: typeof extra.amount === "number" && Number.isInteger(extra.amount) && extra.amount >= 0 ? Math.min(extra.amount, 100_000_000_000) : 0,
        required: extra.required === true,
        available: extra.available !== false,
        ...(typeof extra.groupName === "string" && extra.groupName.trim() ? { groupName: extra.groupName.trim().slice(0, 60) } : {}),
        ...(typeof extra.freeAllowance === "number" && Number.isInteger(extra.freeAllowance) ? { freeAllowance: Math.min(12, Math.max(0, extra.freeAllowance)) } : {}),
      }));
  }
  return preview;
}

const storePreviewMode = new URLSearchParams(window.location.search).get("preview") === "1";
const storeOwnerMode = new URLSearchParams(window.location.search).get("owner") === "1";
const MERCHANT_STORE_VIEW_KEY_PREFIX = "pagosya_merchant_store_view_";

/**
 * The editor preview and dashboard's owner-only "open store" link mark this
 * browser as the merchant's device for the store. Later visits from the same
 * browser stay out of audience analytics even when the owner pastes the plain
 * public link into a new tab. Storage failure never makes an editor preview
 * count as a customer view.
 */
function suppressStoreViewForMerchant(slug: string): boolean {
  const explicitMerchantView = storePreviewMode || storeOwnerMode;
  const key = `${MERCHANT_STORE_VIEW_KEY_PREFIX}${slug}`;
  try {
    if (explicitMerchantView) localStorage.setItem(key, "1");
    return explicitMerchantView || localStorage.getItem(key) === "1";
  } catch {
    return explicitMerchantView;
  }
}

let activePreviewStore: { slug: string; store: Store } | null = null;
let previewReadyAnnounced = false;
let storePreviewEditorEnabled = true;
let storePreviewEditorHover: HTMLElement | null = null;
const STORE_PREVIEW_SECTIONS = ["brand", "announcement", "hero", "products", "about", "gallery", "motion", "contact", "links", "location", "promotion"] as const;
type StorePreviewSection = (typeof STORE_PREVIEW_SECTIONS)[number];

interface StorePreviewEditorSelection {
  section: StorePreviewSection | `animation-${string}`;
  field: string;
  label: string;
  itemId?: string;
  itemIndex?: number;
  animationId?: string;
}

function storePreviewEditorLabel(): HTMLElement {
  let label = document.querySelector<HTMLElement>(".store-preview-editor-label");
  if (!label) {
    label = document.createElement("div");
    label.className = "store-preview-editor-label";
    label.setAttribute("aria-hidden", "true");
    document.body.appendChild(label);
  }
  return label;
}

function markStorePreviewEditorTarget(element: Element | null, selection: StorePreviewEditorSelection): void {
  if (!(element instanceof HTMLElement)) return;
  element.dataset.storeEditorTarget = "true";
  element.dataset.storeEditorSection = selection.section;
  element.dataset.storeEditorField = selection.field;
  element.dataset.storeEditorLabel = selection.label;
  if (selection.itemId) element.dataset.storeEditorItemId = selection.itemId;
  if (Number.isInteger(selection.itemIndex)) element.dataset.storeEditorItemIndex = String(selection.itemIndex);
  if (selection.animationId) element.dataset.storeEditorAnimationId = selection.animationId;
}

function markAllStorePreviewEditorTargets(
  selector: string,
  selection: StorePreviewEditorSelection | ((element: HTMLElement, index: number) => StorePreviewEditorSelection),
): void {
  app.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
    markStorePreviewEditorTarget(element, typeof selection === "function" ? selection(element, index) : selection);
  });
}

function syncStorePreviewEditorMode(): void {
  document.body.classList.toggle("store-preview-editor-enabled", storePreviewMode && storePreviewEditorEnabled);
  if (!storePreviewEditorEnabled && storePreviewEditorHover) {
    storePreviewEditorHover.classList.remove("store-preview-editor-hover");
    storePreviewEditorHover = null;
  }
}

function applyStoreSectionBackgrounds(store: Store): void {
  const configured = store.sectionBackgrounds && typeof store.sectionBackgrounds === "object"
    ? store.sectionBackgrounds
    : {};
  const targets: Record<string, string> = {
    hero: ".store-carousel, .store-hero",
    products: ".store-products",
    about: ".store-about",
    gallery: ".store-editorial-gallery",
    links: ".store-footer",
    contact: ".store-contact-section",
    location: ".store-location-section",
  };
  Object.entries(targets).forEach(([section, selector]) => {
    app.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      element.dataset.storeSectionKey = section;
      const color = configured[section];
      if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
      const text = backgroundTheme(color).textColor;
      element.style.setProperty("--store-section-background", color);
      element.style.setProperty("--store-section-text", text);
      element.style.setProperty("--pg-text", text);
      element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
      element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
    });
  });
  app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]").forEach((element) => {
    const section = `animation-${element.dataset.animationId}`;
    element.dataset.storeSectionKey = section;
    const color = configured[section];
    if (!/^#[0-9a-f]{6}$/i.test(color || "")) return;
    const text = backgroundTheme(color).textColor;
    element.style.setProperty("--store-section-background", color);
    element.style.setProperty("--store-section-text", text);
    element.style.setProperty("--pg-text", text);
    element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
    element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
  });
}

function annotateStorePreviewEditor(store: Store): void {
  if (!storePreviewMode) return;
  app.querySelectorAll<HTMLElement>("[data-store-section-key]").forEach((element) => {
    const section = element.dataset.storeSectionKey!;
    const animationId = section.startsWith("animation-") ? section.slice("animation-".length) : undefined;
    markStorePreviewEditorTarget(element, {
      section: section as StorePreviewEditorSelection["section"],
      field: "section",
      label: animationId ? "sección animada" : `sección ${section}`,
      ...(animationId ? { animationId } : {}),
    });
  });
  markStorePreviewEditorTarget(app.querySelector(".store-title"), { section: "brand", field: "storeName", label: "nombre de la tienda" });
  markStorePreviewEditorTarget(app.querySelector(".store-tagline"), { section: "brand", field: "storeTagline", label: "descripción corta" });
  markStorePreviewEditorTarget(app.querySelector(".merchant-header-logo"), { section: "brand", field: "storeLogo", label: "logo" });
  markStorePreviewEditorTarget(app.querySelector(".store-announcement"), { section: "announcement", field: "announcementText", label: "anuncio superior" });
  markStorePreviewEditorTarget(app.querySelector(".store-hero.has-banner img"), { section: "hero", field: "storeBanner", label: "imagen de portada" });
  markAllStorePreviewEditorTargets(".store-slide", (element) => ({
    section: "hero",
    field: "media",
    label: `escena ${Number(element.dataset.slideIndex || 0) + 1} de la portada`,
    itemIndex: Number(element.dataset.slideIndex || 0),
  }));
  markAllStorePreviewEditorTargets(".store-slide h2", (element) => ({ section: "hero", field: "title", label: "título de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide p", (element) => ({ section: "hero", field: "body", label: "texto de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide-cta", (element) => ({ section: "hero", field: "ctaLabel", label: "botón de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markStorePreviewEditorTarget(app.querySelector("#store-products-title"), { section: "products", field: "catalogTitle", label: "título del catálogo" });
  markStorePreviewEditorTarget(app.querySelector(".store-catalog-heading p"), { section: "products", field: "catalogSubtitle", label: "subtítulo del catálogo" });
  markAllStorePreviewEditorTargets(".store-item", (element) => {
    const item = store.items.find((candidate) => candidate.id === element.dataset.id);
    return { section: "products", field: "product", label: item ? `producto ${item.name}` : "producto", itemId: element.dataset.id };
  });
  markStorePreviewEditorTarget(app.querySelector(".store-about"), { section: "about", field: "aboutImage", label: "imagen de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-title-text"), { section: "about", field: "aboutTitle", label: "título de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-subtitle"), { section: "about", field: "aboutSubtitle", label: "subtítulo de la historia" });
  markStorePreviewEditorTarget(app.querySelector(".store-about-body"), { section: "about", field: "aboutBody", label: "historia de la marca" });
  markStorePreviewEditorTarget(app.querySelector("#store-gallery-title"), { section: "gallery", field: "galleryTitle", label: "título de la galería" });
  markStorePreviewEditorTarget(app.querySelector(".store-editorial-gallery > .store-section-heading p"), { section: "gallery", field: "gallerySubtitle", label: "subtítulo de la galería" });
  const editorialCount = Math.max(store.editorialGallery?.length || 0, 1);
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item", (_element, index) => ({ section: "gallery", field: "editorialMedia", label: `imagen editorial ${(index % editorialCount) + 1}`, itemIndex: index % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption strong", (element, index) => ({ section: "gallery", field: "editorialTitle", label: "título de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption span", (element, index) => ({ section: "gallery", field: "editorialCaption", label: "línea de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  markAllStorePreviewEditorTargets(".store-editorial-gallery .store-editorial-item figcaption p", (element, index) => ({ section: "gallery", field: "editorialBody", label: "texto de imagen", itemIndex: Number(element.closest<HTMLElement>(".store-editorial-item")?.style.getPropertyValue("--experience-index") || index) % editorialCount }));
  app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]").forEach((section) => {
    const animationId = section.dataset.animationId!;
    const animation = store.animations?.find((candidate) => candidate.id === animationId);
    markStorePreviewEditorTarget(section, { section: `animation-${animationId}`, field: "section", label: animation?.name || "sección animada", animationId });
    section.querySelectorAll<HTMLElement>("img, video, figure").forEach((media) => markStorePreviewEditorTarget(media, { section: `animation-${animationId}`, field: "media", label: "imagen o video de la animación", animationId }));
    section.querySelectorAll<HTMLElement>("h3").forEach((heading) => markStorePreviewEditorTarget(heading, { section: `animation-${animationId}`, field: animation?.type === "video-pill" ? "topWord" : "title", label: "texto de la animación", animationId }));
    section.querySelectorAll<HTMLElement>("p").forEach((copy) => markStorePreviewEditorTarget(copy, { section: `animation-${animationId}`, field: "body", label: "descripción de la animación", animationId }));
    markStorePreviewEditorTarget(section.querySelector(".store-video-pill-word-top"), { section: `animation-${animationId}`, field: "topWord", label: "texto superior del video", animationId });
    markStorePreviewEditorTarget(section.querySelector(".store-video-pill-word-right"), { section: `animation-${animationId}`, field: "rightWord", label: "texto derecho del video", animationId });
    markStorePreviewEditorTarget(section.querySelector(".store-video-pill-word-bottom"), { section: `animation-${animationId}`, field: "bottomWord", label: "texto inferior del video", animationId });
  });
  markAllStorePreviewEditorTargets(".store-link-btn", (_element, index) => ({ section: "links", field: "linkLabel", label: `enlace social ${index + 1}`, itemIndex: index }));
  markStorePreviewEditorTarget(app.querySelector("#store-links-title"), { section: "links", field: "linksTitle", label: "título de redes sociales" });
  markStorePreviewEditorTarget(app.querySelector(".store-contact-section"), { section: "contact", field: "contact", label: "formulario de contacto" });
  markStorePreviewEditorTarget(app.querySelector("#store-contact-title"), { section: "contact", field: "contactTitle", label: "título de contacto" });
  markStorePreviewEditorTarget(app.querySelector(".store-contact-copy p"), { section: "contact", field: "contactSubtitle", label: "texto de contacto" });
  markStorePreviewEditorTarget(app.querySelector(".store-location-section"), { section: "location", field: "location", label: "ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector("#store-location-title"), { section: "location", field: "locationTitle", label: "título de ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector(".store-location-heading p"), { section: "location", field: "locationSubtitle", label: "texto de ubicaciones" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-image"), { section: "promotion", field: "promotionImage", label: "imagen de promoción" });
  markStorePreviewEditorTarget(app.querySelector("#promotion-title"), { section: "promotion", field: "promotionTitle", label: "título de promoción" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-dialog p"), { section: "promotion", field: "promotionBody", label: "texto de promoción" });
  markStorePreviewEditorTarget(app.querySelector(".promotion-action"), { section: "promotion", field: "promotionAction", label: "botón de promoción" });
  markStorePreviewEditorTarget(app.querySelector("#cart-pay"), { section: "products", field: "cartButton", label: "botón del carrito" });
  syncStorePreviewEditorMode();
}

function selectionFromStorePreviewEditorTarget(target: HTMLElement): StorePreviewEditorSelection | null {
  const section = target.dataset.storeEditorSection;
  const field = target.dataset.storeEditorField;
  if (!section || !field) return null;
  const selection: StorePreviewEditorSelection = {
    section: section as StorePreviewEditorSelection["section"],
    field,
    label: target.dataset.storeEditorLabel || "parte de la tienda",
  };
  if (target.dataset.storeEditorItemId) selection.itemId = target.dataset.storeEditorItemId;
  if (target.dataset.storeEditorItemIndex && Number.isInteger(Number(target.dataset.storeEditorItemIndex))) selection.itemIndex = Number(target.dataset.storeEditorItemIndex);
  if (target.dataset.storeEditorAnimationId) selection.animationId = target.dataset.storeEditorAnimationId;
  return selection;
}

function showStorePreviewEditorHover(target: HTMLElement | null): void {
  if (storePreviewEditorHover && storePreviewEditorHover !== target) storePreviewEditorHover.classList.remove("store-preview-editor-hover");
  storePreviewEditorHover = target;
  const label = storePreviewEditorLabel();
  if (!target || !storePreviewEditorEnabled) {
    label.style.display = "none";
    return;
  }
  target.classList.add("store-preview-editor-hover");
  label.textContent = `Editar ${target.dataset.storeEditorLabel || "esta parte"}`;
  const rect = target.getBoundingClientRect();
  label.style.display = "block";
  label.style.left = `${Math.max(8, Math.min(rect.left + 8, window.innerWidth - 270))}px`;
  label.style.top = `${Math.max(8, Math.min(rect.top + 8, window.innerHeight - 48))}px`;
}

if (storePreviewMode) {
  app.addEventListener("pointerover", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    showStorePreviewEditorHover(event.target.closest<HTMLElement>("[data-store-editor-target]"));
  }, true);
  app.addEventListener("pointerleave", () => showStorePreviewEditorHover(null), true);
  app.addEventListener("click", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    const interactive = event.target.closest("button, a, input, select, textarea, [role='button']");
    if (interactive && !interactive.hasAttribute("data-store-editor-target")) return;
    const target = event.target.closest<HTMLElement>("[data-store-editor-target]");
    const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
    if (!selection) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    postToParent("STORE_EDITOR_SELECT", { selection });
    showStorePreviewEditorHover(target);
  }, true);
}

function scrollStorePreviewToSection(section: StorePreviewSection | `animation-${string}`): void {
  if (section.startsWith("animation-")) {
    window.requestAnimationFrame(() => {
      const id = section.slice("animation-".length);
      const target = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
        .find((entry) => entry.dataset.animationId === id);
      if (target) scrollStorePreviewToElement(target);
    });
    return;
  }
  const selectors: Record<StorePreviewSection, string> = {
    brand: ".merchant-header",
    announcement: ".store-announcement, .merchant-header",
    hero: ".store-carousel, .store-hero, .merchant-header",
    products: ".store-products",
    about: ".store-about, .store-products",
    gallery: ".store-editorial-gallery, .store-products",
    motion: ".store-motion-section, .store-editorial-gallery, .store-products",
    contact: ".store-contact-section, .store-footer, .secure-note",
    links: ".store-footer, .secure-note",
    location: ".store-location-section, .secure-note",
    promotion: ".promotion-dialog, .merchant-header",
  };
  window.requestAnimationFrame(() => {
    const target = app.querySelector<HTMLElement>(selectors[section as StorePreviewSection]);
    if (!target) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const targetRect = target.getBoundingClientRect();
    const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const centeredTop = window.scrollY + targetRect.top - (window.innerHeight - targetRect.height) / 2;
    const top = Math.max(0, Math.min(centeredTop, Math.max(0, documentHeight - window.innerHeight)));
    // scrollIntoView can propagate through an iframe and move the merchant
    // dashboard. Scrolling this window directly keeps all movement inside the
    // storefront preview while preserving the editor's page position.
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  });
}

function scrollStorePreviewToElement(target: HTMLElement): void {
  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targetRect = target.getBoundingClientRect();
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const centeredTop = window.scrollY + targetRect.top - (window.innerHeight - targetRect.height) / 2;
  const top = Math.max(0, Math.min(centeredTop, Math.max(0, documentHeight - window.innerHeight)));
  window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
}

function scrollStorePreviewToMotion(): void {
  window.requestAnimationFrame(() => {
    const target = app.querySelector<HTMLElement>(".store-motion-section, .store-editorial-gallery");
    if (target) scrollStorePreviewToElement(target);
  });
}

function scrollStorePreviewToHeroItem(index: number): void {
  window.requestAnimationFrame(() => {
    const carousel = app.querySelector<HTMLElement>(".store-carousel");
    const dots = Array.from(app.querySelectorAll<HTMLButtonElement>(".store-carousel-dots [data-slide-to]"));
    if (dots.length) dots[Math.min(Math.max(0, index), dots.length - 1)]?.click();
    const target = carousel || app.querySelector<HTMLElement>(".store-hero, .merchant-header");
    if (target) scrollStorePreviewToElement(target);
  });
}

function scrollStorePreviewToEditorialItem(index: number, _kind: "media" | "text"): void {
  window.requestAnimationFrame(() => {
    const safeIndex = Math.max(0, index);
    const flowSections = Array.from(app.querySelectorAll<HTMLElement>(".store-flow-section"));

    if (flowSections.length) {
      scrollStorePreviewToElement(flowSections[Math.min(safeIndex, flowSections.length - 1)]);
      return;
    }

    const motionSection = app.querySelector<HTMLElement>(".store-motion-section");
    if (motionSection) {
      scrollStorePreviewToElement(motionSection);
      return;
    }

    const storyTabs = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-story-to]"));
    const storyPanels = Array.from(app.querySelectorAll<HTMLElement>(".store-story-panel"));
    if (storyTabs.length && storyPanels.length) {
      const targetIndex = Math.min(safeIndex, Math.min(storyTabs.length, storyPanels.length) - 1);
      storyTabs.forEach((tab, tabIndex) => tab.setAttribute("aria-selected", String(tabIndex === targetIndex)));
      storyPanels.forEach((panel, panelIndex) => {
        panel.classList.toggle("active", panelIndex === targetIndex);
        panel.setAttribute("aria-hidden", String(panelIndex !== targetIndex));
      });
      const gallery = app.querySelector<HTMLElement>(".store-editorial-gallery");
      if (gallery) scrollStorePreviewToElement(gallery);
      return;
    }

    scrollStorePreviewToSection("gallery");
  });
}

function sanitizeStorePreviewPatch(value: unknown): StorePreviewPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (source.sectionBackgrounds && typeof source.sectionBackgrounds === "object" && !Array.isArray(source.sectionBackgrounds)) {
    clean.sectionBackgrounds = Object.fromEntries(
      Object.entries(source.sectionBackgrounds as Record<string, unknown>)
        .filter(([section, color]) => /^(?:hero|products|about|gallery|links|contact|location|motion|animation-[a-z0-9][a-z0-9_-]{0,47})$/.test(section) && typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))
        .slice(0, 32),
    );
  }
  const nullableStrings = [
    "tagline",
    "logoUrl",
    "bannerUrl",
    "backgroundColor",
    "backgroundImageUrl",
    "contactPhone",
    "contactEmail",
    "contactTitle",
    "contactSubtitle",
    "locationMapUrl",
    "locationDescription",
    "locationHighlight",
    "locationTitle",
    "locationSubtitle",
    "aboutText",
    "aboutTitle",
    "aboutSubtitle",
    "aboutImageUrl",
    "catalogTitle",
    "catalogSubtitle",
    "galleryTitle",
    "gallerySubtitle",
    "linksTitle",
    "accentColor",
    "announcement",
    "promotionImageUrl",
    "promotionTitle",
    "promotionBody",
    "promotionCtaLabel",
    "promotionCtaUrl",
    "leadCaptureUrl",
  ];

  if (typeof source.storeName === "string") clean.storeName = source.storeName.slice(0, 160);
  for (const key of nullableStrings) {
    const field = source[key];
    if (field === null || typeof field === "string") clean[key] = typeof field === "string" ? field.slice(0, 4000) : null;
  }
  if (typeof clean.locationMapUrl === "string") clean.locationMapUrl = safeStoreMapEmbedUrl(clean.locationMapUrl);
  if (typeof clean.locationDescription === "string") clean.locationDescription = clean.locationDescription.slice(0, 600);
  if (typeof clean.locationHighlight === "string") clean.locationHighlight = clean.locationHighlight.slice(0, 140);
  if (Array.isArray(source.locations)) {
    clean.locations = source.locations.slice(0, 20).flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const location = entry as Record<string, unknown>;
      if (typeof location.id !== "string" || typeof location.name !== "string") return [];
      const mapEmbedUrl = typeof location.mapEmbedUrl === "string" ? safeStoreMapEmbedUrl(location.mapEmbedUrl) : null;
      return [{
        id: location.id.slice(0, 48),
        name: location.name.slice(0, 80),
        ...(typeof location.address === "string" ? { address: location.address.slice(0, 240) } : {}),
        ...(mapEmbedUrl ? { mapEmbedUrl } : {}),
        ...(typeof location.description === "string" ? { description: location.description.slice(0, 600) } : {}),
        ...(typeof location.highlight === "string" ? { highlight: location.highlight.slice(0, 140) } : {}),
        pickupEnabled: location.pickupEnabled === true,
        deliveryEnabled: location.deliveryEnabled === true,
        openingHours: Array.isArray(location.openingHours) ? location.openingHours.slice(0, 7).flatMap((hoursEntry) => {
          if (!hoursEntry || typeof hoursEntry !== "object" || Array.isArray(hoursEntry)) return [];
          const hours = hoursEntry as Record<string, unknown>;
          if (!Number.isInteger(hours.day) || typeof hours.open !== "string" || typeof hours.close !== "string") return [];
          return [{ day: hours.day as number, open: hours.open.slice(0, 5), close: hours.close.slice(0, 5), closed: hours.closed === true }];
        }) : [],
        inventory: Array.isArray(location.inventory) ? location.inventory.slice(0, 500).flatMap((inventoryEntry) => {
          if (!inventoryEntry || typeof inventoryEntry !== "object" || Array.isArray(inventoryEntry)) return [];
          const inventory = inventoryEntry as Record<string, unknown>;
          if (typeof inventory.paymentLinkId !== "string") return [];
          const stock = inventory.stock === null ? null : Number.isInteger(inventory.stock) ? Math.max(0, inventory.stock as number) : 0;
          return [{ paymentLinkId: inventory.paymentLinkId.slice(0, 80), stock }];
        }) : [],
      }];
    });
  }
  if (["rounded", "pill", "square"].includes(String(source.buttonStyle))) clean.buttonStyle = source.buttonStyle;
  if (["solid", "gradient"].includes(String(source.backgroundMode))) clean.backgroundMode = source.backgroundMode;
  if (typeof source.backgroundGradientStart === "string" && /^#[0-9a-f]{6}$/i.test(source.backgroundGradientStart)) clean.backgroundGradientStart = source.backgroundGradientStart.toLowerCase();
  if (typeof source.backgroundGradientEnd === "string" && /^#[0-9a-f]{6}$/i.test(source.backgroundGradientEnd)) clean.backgroundGradientEnd = source.backgroundGradientEnd.toLowerCase();
  if (Number.isInteger(source.backgroundGradientAngle)) clean.backgroundGradientAngle = Math.min(360, Math.max(0, source.backgroundGradientAngle as number));
  if (["modern", "editorial", "friendly", "classic", "geometric"].includes(String(source.fontStyle))) clean.fontStyle = source.fontStyle;
  if (["solid", "outline", "soft"].includes(String(source.buttonVariant))) clean.buttonVariant = source.buttonVariant;
  if (["lift", "pulse", "none"].includes(String(source.buttonMotion))) clean.buttonMotion = source.buttonMotion;
  if (typeof source.cartButtonLabel === "string") clean.cartButtonLabel = source.cartButtonLabel.slice(0, 36);
  if (["payment", "whatsapp", "external"].includes(String(source.checkoutMode))) clean.checkoutMode = source.checkoutMode;
  if (typeof source.cartRecommendationsEnabled === "boolean") clean.cartRecommendationsEnabled = source.cartRecommendationsEnabled;
  if (typeof source.contactFormEnabled === "boolean") clean.contactFormEnabled = source.contactFormEnabled;
  if (Array.isArray(source.cartRecommendationProductIds)) {
    clean.cartRecommendationProductIds = source.cartRecommendationProductIds
      .filter((id): id is string => typeof id === "string")
      .slice(0, 12);
  }
  if (["chalkboard", "kraft", "painted"].includes(String(source.boardTexture))) clean.boardTexture = source.boardTexture;
  if (["static", "marquee"].includes(String(source.announcementMode))) clean.announcementMode = source.announcementMode;
  if (Number.isInteger(source.announcementSpeed)) {
    clean.announcementSpeed = Math.min(40, Math.max(8, source.announcementSpeed as number));
  }
  // Announcement bands are deliberately compact in every storefront. Older
  // saved proposals may still carry medium/large, but previews must match the
  // canonical customer experience.
  clean.announcementSize = "small";
  if (typeof source.announcementColor === "string" && /^#[0-9a-f]{6}$/i.test(source.announcementColor)) {
    clean.announcementColor = source.announcementColor.toLowerCase();
  }
  if (typeof source.promotionEnabled === "boolean") clean.promotionEnabled = source.promotionEnabled;
  if (Array.isArray(source.heroSlides)) {
    clean.heroSlides = source.heroSlides
      .filter((slide): slide is Record<string, unknown> => !!slide && typeof slide === "object" && !Array.isArray(slide))
      .map((slide) => ({
        imageUrl: typeof slide.imageUrl === "string" && /^\/v1\/uploads\//.test(slide.imageUrl) ? slide.imageUrl : "",
        title: typeof slide.title === "string" ? slide.title.slice(0, 80) : "",
        body: typeof slide.body === "string" ? slide.body.slice(0, 180) : "",
        ctaLabel: typeof slide.ctaLabel === "string" ? slide.ctaLabel.slice(0, 36) : "",
        ctaUrl: typeof slide.ctaUrl === "string" && /^https?:\/\//i.test(slide.ctaUrl) ? slide.ctaUrl.slice(0, 500) : "",
      }))
      .filter((slide) => slide.imageUrl)
      .slice(0, 5);
  }
  if (Array.isArray(source.contentOrder)) {
    const motionSections = STORE_MOTION_EXPERIENCES.map((experience) => `motion-${experience}`);
    const allowedSections = ["hero", "products", "about", "gallery", "contact", "links", "motion", ...motionSections];
    const order = source.contentOrder.filter((section): section is string =>
      typeof section === "string" && (allowedSections.includes(section) || /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(section)),
    );
    const requiredSections = ["hero", "products", "about", "gallery", "contact", "links"];
    if (requiredSections.every((section) => order.includes(section)) && new Set(order).size === order.length) clean.contentOrder = order;
  }
  if (["cinematic", "editorial", "collage", "catalog-first"].includes(String(source.layoutStyle))) clean.layoutStyle = source.layoutStyle;
  if (["coverflow", "diagonal-marquee", "story-scroller"].includes(String(source.experienceStyle))) clean.experienceStyle = source.experienceStyle;
  if (typeof source.motionDuoEnabled === "boolean") clean.motionDuoEnabled = source.motionDuoEnabled;
  if ((STORE_MOTION_EXPERIENCES as readonly string[]).includes(String(source.motionExperience))) clean.motionExperience = source.motionExperience;
  if (Array.isArray(source.motionExperiences)) {
    const motionExperiences = source.motionExperiences.filter((experience): experience is string =>
      typeof experience === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(experience),
    );
    if (motionExperiences.length && new Set(motionExperiences).size === motionExperiences.length) clean.motionExperiences = motionExperiences;
  }
  if (Array.isArray(source.animations)) {
    clean.animations = source.animations
      .filter((animation): animation is Record<string, unknown> => !!animation && typeof animation === "object" && !Array.isArray(animation))
      .map((animation) => ({
        id: typeof animation.id === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(animation.id) ? animation.id : "",
        name: typeof animation.name === "string" ? animation.name.slice(0, 60) : "",
        type: typeof animation.type === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(animation.type) ? animation.type : "",
        title: typeof animation.title === "string" ? animation.title.slice(0, 100) : "",
        subtitle: typeof animation.subtitle === "string" ? animation.subtitle.slice(0, 220) : "",
        topWord: typeof animation.topWord === "string" ? animation.topWord.slice(0, 48) : "",
        rightWord: typeof animation.rightWord === "string" ? animation.rightWord.slice(0, 48) : "",
        bottomWord: typeof animation.bottomWord === "string" ? animation.bottomWord.slice(0, 48) : "",
        productId: typeof animation.productId === "string" ? animation.productId.slice(0, 80) : "",
        media: Array.isArray(animation.media)
          ? animation.media
              .filter((image): image is Record<string, unknown> => !!image && typeof image === "object" && !Array.isArray(image))
              .map((image) => ({
                imageUrl: typeof image.imageUrl === "string" && /^\/v1\/uploads\//.test(image.imageUrl) ? image.imageUrl : "",
                title: typeof image.title === "string" ? image.title.slice(0, 100) : "",
                caption: typeof image.caption === "string" ? image.caption.slice(0, 180) : "",
                body: typeof image.body === "string" ? image.body.slice(0, 360) : "",
                boxColor: typeof image.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(image.boxColor) ? image.boxColor : undefined,
              }))
              .filter((image) => image.imageUrl)
              .slice(0, 8)
          : [],
      }))
      .filter((animation) => animation.id && animation.name && animation.type) as Store["animations"];
  }
  if (Array.isArray(source.editorialGallery)) {
    clean.editorialGallery = source.editorialGallery
      .filter((image): image is Record<string, unknown> => !!image && typeof image === "object" && !Array.isArray(image))
      .map((image) => ({
        imageUrl: typeof image.imageUrl === "string" && /^\/v1\/uploads\//.test(image.imageUrl) ? image.imageUrl : "",
        title: typeof image.title === "string" ? image.title.slice(0, 100) : "",
        caption: typeof image.caption === "string" ? image.caption.slice(0, 180) : "",
        body: typeof image.body === "string" ? image.body.slice(0, 360) : "",
        ...(typeof image.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(image.boxColor) ? { boxColor: image.boxColor } : {}),
      }))
      .filter((image) => image.imageUrl)
      .slice(0, 8);
  }
  if (Array.isArray(source.links)) {
    clean.links = source.links
      .filter((link): link is Record<string, unknown> => !!link && typeof link === "object" && !Array.isArray(link))
      .map((link) => ({
        id: "preview",
        label: typeof link.label === "string" ? link.label.slice(0, 40) : "",
        url: typeof link.url === "string" ? link.url.slice(0, 500) : "",
      }))
      .filter((link) => link.label && /^https?:\/\//i.test(link.url))
      .slice(0, 8);
  }
  return clean as StorePreviewPatch;
}

function standaloneStorePreviewPatch(): StorePreviewPatch | null {
  if (!storePreviewMode || !window.location.hash) return null;
  const serialized = new URLSearchParams(window.location.hash.slice(1)).get("proposal");
  if (!serialized) return null;
  try {
    return sanitizeStorePreviewPatch(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function applyStoreTheme(slug: string, store: Store): void {
  currentStoreSlug = slug;
  if (storePreviewMode) activePreviewStore = { slug, store };
  document.body.classList.remove("payment-page", "payment-success-page", "debt-collection-page");
  document.body.classList.add("store-page");

  // Storefront branding is per-store, not per-page. Set it for both the
  // catalog and product routes so a shared product link still feels wholly
  // owned by the merchant and never inherits another store's appearance.
  const solidBackground = store.backgroundColor || "#0a0a0a";
  document.documentElement.style.setProperty("--pg-page-bg", solidBackground);
  const pageTheme = { background: solidBackground, ...backgroundTheme(solidBackground) };
  document.documentElement.style.setProperty("--pg-page-background", pageTheme.background);
  // The store canvas is always color-led. Legacy backgroundImageUrl values are
  // intentionally ignored; photography belongs to heroes and story sections.
  document.body.classList.remove("has-bg-image");
  const useLightTheme = pageTheme.light;
  if (useLightTheme) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  // Storefront copy is deliberately binary: never let a generic gray token
  // drift into a merchant canvas where it can blend with a mid-tone color.
  // The higher-contrast choice between pure black and pure white becomes the
  // primary, muted, and faint foreground for every catalog and product route.
  for (const property of ["--pg-text", "--pg-text-muted", "--pg-text-faint"]) {
    document.documentElement.style.setProperty(property, pageTheme.textColor);
  }

  if (store.accentColor) {
    const effectiveAccent = clampAccentLightness(store.accentColor);
    document.documentElement.style.setProperty("--pg-accent", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-2", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-contrast", accentContrastColor(effectiveAccent));
  } else {
    const palette = DEFAULT_ACCENT_PALETTES[useLightTheme ? "light" : "dark"];
    document.documentElement.style.setProperty("--pg-accent", palette.accent);
    document.documentElement.style.setProperty("--pg-accent-2", palette.accent2);
    document.documentElement.style.setProperty("--pg-accent-contrast", palette.contrast);
  }
  document.body.classList.toggle("has-custom-accent", !!store.accentColor);
  document.body.dataset.fontStyle = store.fontStyle || "modern";
  document.body.dataset.buttonStyle = store.buttonStyle || "rounded";
  document.body.dataset.buttonVariant = store.buttonVariant || "solid";
  document.body.dataset.buttonMotion = store.buttonMotion || "lift";
  document.body.dataset.boardTexture = store.boardTexture || "chalkboard";
  document.body.dataset.layoutStyle = store.layoutStyle || "cinematic";
}

let activeStoreRoute: { slug: string; store: Store } | null = null;
type CatalogReturnPosition = {
  scrollY: number;
  productId?: string;
  productViewportTop?: number;
};

const catalogScrollByStore = new Map<string, number>();
const catalogReturnByStore = new Map<string, CatalogReturnPosition>();

function catalogProductCard(productId: string): HTMLElement | null {
  return Array.from(app.querySelectorAll<HTMLElement>(".store-item[data-id]"))
    .find((card) => card.dataset.id === productId) ?? null;
}

function productIdFromLocation(): string | null {
  return storefrontRouteFromLocation().productId ?? new URLSearchParams(window.location.search).get("product");
}

function categoryIdFromLocation(): string | null {
  return storefrontRouteFromLocation().categoryId ?? new URLSearchParams(window.location.search).get("category");
}

function renderStoreRoute(slug: string, store: Store, options: { focusPromotion?: boolean } = {}): void {
  activeStoreRoute = { slug, store };
  const productId = productIdFromLocation();
  if (productId) renderProductPage(slug, store, productId);
  else {
    selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    renderStore(slug, store, options);
  }
}

function restoreCatalogScroll(scrollY: unknown): void {
  const top = typeof scrollY === "number" && Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  requestAnimationFrame(() => window.scrollTo(0, top));
}

function restoreCatalogPosition(slug: string, fallback: Partial<CatalogReturnPosition> = {}): void {
  const remembered = catalogReturnByStore.get(slug);
  const position: CatalogReturnPosition = {
    scrollY: remembered?.scrollY ?? (typeof fallback.scrollY === "number" ? fallback.scrollY : 0),
    productId: remembered?.productId ?? fallback.productId,
    productViewportTop: remembered?.productViewportTop ?? fallback.productViewportTop,
  };
  const restore = () => {
    const card = position.productId ? catalogProductCard(position.productId) : null;
    if (card && typeof position.productViewportTop === "number") {
      const anchoredTop = window.scrollY + card.getBoundingClientRect().top - position.productViewportTop;
      window.scrollTo(0, Math.max(0, anchoredTop));
      return;
    }
    window.scrollTo(0, Math.max(0, position.scrollY));
  };
  requestAnimationFrame(() => {
    restore();
    // Re-anchor after the next layout as responsive controls and images settle.
    requestAnimationFrame(restore);
  });
}

function navigateWithinStore(slug: string, store: Store, productId?: string): void {
  if (productId) {
    const catalogScrollY = Math.max(0, window.scrollY);
    const productCard = catalogProductCard(productId);
    const returnPosition: CatalogReturnPosition = {
      scrollY: catalogScrollY,
      productId,
      ...(productCard ? { productViewportTop: productCard.getBoundingClientRect().top } : {}),
    };
    catalogScrollByStore.set(slug, catalogScrollY);
    catalogReturnByStore.set(slug, returnPosition);
    const currentState = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
    window.history.replaceState({ ...currentState, pagosyaView: "catalog", catalogScrollY, catalogProductId: productId, catalogProductViewportTop: returnPosition.productViewportTop }, "", window.location.href);
    window.history.pushState({ pagosyaView: "product", fromCatalog: true, catalogScrollY, catalogProductId: productId, catalogProductViewportTop: returnPosition.productViewportTop }, "", productPageUrl(slug, productId));
  } else {
    window.history.pushState({ pagosyaView: "catalog", catalogScrollY: 0 }, "", storeCatalogUrl(slug));
  }
  renderStoreRoute(slug, store);
  restoreCatalogScroll(0);
  app.focus({ preventScroll: true });
}

function bindInternalStoreLinks(slug: string, store: Store): void {
  app.querySelectorAll<HTMLAnchorElement>(".product-page-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const url = new URL(link.href);
      const productId = storefrontRouteFromPathname(url.pathname).productId ?? url.searchParams.get("product");
      if (productId) navigateWithinStore(slug, store, productId);
    });
  });
  app.querySelectorAll<HTMLAnchorElement>(".store-catalog-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (window.history.state?.fromCatalog) {
        const catalogPosition = catalogReturnByStore.get(slug) ?? {
          scrollY: catalogScrollByStore.get(slug) ?? window.history.state.catalogScrollY,
          productId: window.history.state.catalogProductId,
          productViewportTop: window.history.state.catalogProductViewportTop,
        };
        window.history.back();
        // Render immediately so the shopper never flashes at the top of the
        // catalog while the browser dispatches popstate asynchronously.
        renderStore(slug, store);
        restoreCatalogPosition(slug, catalogPosition);
        app.focus({ preventScroll: true });
        return;
      }
      navigateWithinStore(slug, store);
    });
  });
}

function cartActionLabel(store: Store, freeOrder = false): string {
  if (freeOrder) return "Confirmar pedido gratis";
  if (store.cartButtonLabel && store.cartButtonLabel !== "Ir a pagar") return store.cartButtonLabel;
  if (store.checkoutMode === "whatsapp") return "Enviar pedido por WhatsApp";
  if (store.checkoutMode === "external") return "Enviar mis datos";
  return "Continuar al pago";
}

function cartModeNote(store: Store, freeOrder = false): string {
  if (freeOrder) return "Este pedido no tiene costo. Deja tus datos para que la tienda reciba la selección y pueda confirmártela.";
  if (store.checkoutMode === "whatsapp") return "Revisa el detalle. Al continuar, abriremos WhatsApp con el pedido listo para enviar.";
  if (store.checkoutMode === "external") return "Revisa tu selección y deja tu correo para que la tienda pueda contactarte. pagosYa no procesará un cobro.";
  return "Revisa productos, opciones y cantidades antes de abrir el pago seguro.";
}

function cartLineEntries(store: Store) {
  return [...cart.entries()].flatMap(([key, quantity]) => {
    const selected = parseCartItemKey(key);
    const product = store.items.find((item) => item.id === selected.paymentLinkId);
    if (!product) return [];
    const variant = product.variants.find((candidate) => candidate.id === selected.variantId);
    const extras = itemExtras(product).filter((extra) => selected.extraIds.includes(extra.id));
    return [{ key, product, variant, extras, quantity, unitAmount: selectedUnitAmount(product, variant, extras) }];
  });
}

function cartRecommendationEntries(store: Store) {
  if (store.cartRecommendationsEnabled === false) return [];
  const selectedProductIds = new Set(store.cartRecommendationProductIds || []);
  if (selectedProductIds.size === 0) return [];
  const cartProductIds = new Set([...cart.keys()].map((key) => parseCartItemKey(key).paymentLinkId));
  return [...store.items]
    .filter((product) => {
      if (!selectedProductIds.has(product.id) || cartProductIds.has(product.id) || productStockLimit(product) === 0 || !assetUrl(product.imageUrls[0] || null)) return false;
      const variants = itemVariants(product);
      return variants.length === 0 || variants.some((variant) => optionStock(product, variant) !== 0);
    })
    .sort((a, b) => (store.cartRecommendationProductIds || []).indexOf(a.id) - (store.cartRecommendationProductIds || []).indexOf(b.id))
    .slice(0, 12)
    .map((product) => {
      const variant = itemVariants(product).find((candidate) => optionStock(product, candidate) !== 0);
      return {
        product,
        variant,
        unitAmount: variant?.amount ?? product.amount,
        image: assetUrl(product.imageUrls[0] || null)!,
        imagePosition: productImagePosition(product, 0),
      };
    });
}

function cartFulfillmentState(store: Store, lines = cartLineEntries(store)) {
  const locations = publicStoreLocations(store).filter((location) => location.pickupEnabled || location.deliveryEnabled);
  if (!locations.length) return { locations, method: null, selectedLocation: null, available: [] as StoreLocation[] };
  const methods = (["pickup", "delivery"] as const).filter((method) =>
    locations.some((location) => method === "pickup" ? location.pickupEnabled : location.deliveryEnabled),
  );
  if (!selectedFulfillmentMethod || !methods.includes(selectedFulfillmentMethod)) selectedFulfillmentMethod = methods[0] || null;
  const available = selectedFulfillmentMethod
    ? locations.filter((location) =>
        (selectedFulfillmentMethod === "pickup" ? location.pickupEnabled : location.deliveryEnabled) && locationCanFulfillCart(location, lines),
      )
    : [];
  if (!available.some((location) => location.id === selectedFulfillmentLocationId)) {
    selectedFulfillmentLocationId = available[0]?.id || null;
  }
  return {
    locations,
    method: selectedFulfillmentMethod,
    selectedLocation: available.find((location) => location.id === selectedFulfillmentLocationId) || null,
    available,
  };
}

function renderCartReviewDialog(dialog: HTMLDialogElement, slug: string, store: Store): void {
  const currency = store.items[0]?.currency || "BOB";
  const lines = cartLineEntries(store);
  const promo = activePromoForStore(store);
  const subtotal = cartTotal(store.items);
  const promoDiscount = promoDiscountAmount(store);
  const checkoutTotal = subtotal - promoDiscount;
  const freeOrder = store.checkoutMode === "payment" && lines.length > 0 && lines.every((line) => line.unitAmount * line.quantity === 0);
  const contactCheckout = store.checkoutMode === "external" || freeOrder;
  const emailOnlyLeadCheckout = store.checkoutMode === "external";
  const recommendations = cartRecommendationEntries(store);
  const fulfillment = cartFulfillmentState(store, lines);
  const fulfillmentHtml = fulfillment.locations.length ? `<section class="cart-fulfillment" aria-labelledby="cart-fulfillment-title">
    <div class="cart-fulfillment-head"><h3 id="cart-fulfillment-title">¿Cómo recibirás tu pedido?</h3><p>Solo mostramos ubicaciones con stock para todo tu carrito.</p></div>
    <div class="cart-fulfillment-methods" role="radiogroup" aria-label="Modalidad de entrega">
      ${fulfillment.locations.some((location) => location.pickupEnabled) ? `<label><input type="radio" name="fulfillmentMethod" value="pickup" ${fulfillment.method === "pickup" ? "checked" : ""}><span>Retiro</span></label>` : ""}
      ${fulfillment.locations.some((location) => location.deliveryEnabled) ? `<label><input type="radio" name="fulfillmentMethod" value="delivery" ${fulfillment.method === "delivery" ? "checked" : ""}><span>Entrega</span></label>` : ""}
    </div>
    <div class="cart-fulfillment-locations" role="radiogroup" aria-label="Ubicación que preparará el pedido">
      ${fulfillment.locations.map((location) => {
        const supportsMethod = fulfillment.method === "pickup" ? location.pickupEnabled : location.deliveryEnabled;
        const hasStock = locationCanFulfillCart(location, lines);
        const opening = locationOpeningState(location);
        const disabled = !supportsMethod || !hasStock;
        return `<label class="cart-fulfillment-location${disabled ? " is-unavailable" : ""}">
          <input type="radio" name="fulfillmentLocation" value="${escapeHtml(location.id)}" ${location.id === selectedFulfillmentLocationId ? "checked" : ""} ${disabled ? "disabled" : ""}>
          <span><strong>${escapeHtml(location.name)}</strong>${location.address ? `<small>${escapeHtml(location.address)}</small>` : ""}<small>${!supportsMethod ? `No ofrece ${fulfillment.method === "delivery" ? "entrega" : "retiro"}` : !hasStock ? "Sin stock suficiente para este carrito" : opening.label}</small></span>
        </label>`;
      }).join("")}
    </div>
    ${fulfillment.available.length ? "" : '<p class="cart-fulfillment-empty" role="alert">Ninguna ubicación puede preparar todo el carrito con esta modalidad. Prueba la otra opción o ajusta cantidades.</p>'}
  </section>` : "";
  dialog.innerHTML = `
    <div class="cart-review-shell">
      <header class="cart-review-head">
        <div><h2 id="cart-review-title">Mi carrito</h2><p>${escapeHtml(cartModeNote(store, freeOrder))}</p></div>
        <button type="button" class="cart-review-close" aria-label="Cerrar carrito">${ICON_X}</button>
      </header>
      <div class="cart-review-scroll">
        <div class="cart-review-lines">
          ${lines.map(({ key, product, variant, extras, quantity, unitAmount }) => {
            const image = assetUrl(product.imageUrls[0] || null);
            const available = optionStock(product, variant);
            const productLimit = productStockLimit(product);
            const atProductLimit = productLimit !== null && productCartQuantity(product.id) >= productLimit;
            const atOptionLimit = available !== null && optionCartQuantity(product.id, variant?.id) >= available;
            const visibleStock = stockStatus(remainingStock(product, variant), store.showLowStockToCustomers === true);
            return `<article class="cart-review-line" data-cart-key="${escapeHtml(key)}">
              ${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span class="cart-review-placeholder" aria-hidden="true">${escapeHtml(initials(product.name))}</span>`}
              <div class="cart-review-line-copy"><strong>${escapeHtml(product.name)}</strong>${variant ? `<span>${escapeHtml(variant.name)}</span>` : ""}${extras.length ? `<span class="cart-line-extras">${extras.map((extra) => escapeHtml(extra.name)).join(" · ")}</span>` : ""}<small>${formatAmount(unitAmount, product.currency)} c/u</small>${visibleStock ? `<small class="cart-line-stock${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</small>` : ""}</div>
              <div class="cart-review-quantity" aria-label="Cantidad de ${escapeHtml(product.name)}">
                <button type="button" data-cart-change="-1" aria-label="Quitar una unidad">−</button><span>${quantity}</span><button type="button" data-cart-change="1" aria-label="Agregar una unidad" ${atProductLimit || atOptionLimit ? "disabled" : ""}>+</button>
              </div>
              <strong class="cart-review-line-total">${formatAmount(unitAmount * quantity, product.currency)}</strong>
              <button type="button" class="cart-review-remove" aria-label="Quitar ${escapeHtml(product.name)} del carrito">Quitar</button>
            </article>`;
          }).join("")}
        </div>
        ${store.checkoutMode === "payment" && !contactCheckout ? `<form class="promo-code-form" id="promo-code-form">
          <div><label for="promo-code-input">Código promocional</label><span>${promo ? `Aplicado: ${escapeHtml(promo.code)}` : "¿Tienes un código? Escríbelo aquí."}</span></div>
          <div class="promo-code-entry">
            <input id="promo-code-input" name="promoCode" value="${escapeHtml(promo?.code || "")}" maxlength="32" autocomplete="off" autocapitalize="characters" placeholder="VERANO20" ${promo ? "readonly" : "required"}>
            ${promo ? `<button class="promo-code-remove" type="button">Quitar</button>` : `<button type="submit">Aplicar</button>`}
          </div>
          <p class="promo-code-status${promo ? " is-applied" : ""}" role="status" aria-live="polite">${promo ? `${promo.discountType === "PERCENT" ? `${promo.discountValue}%` : formatAmount(promo.discountValue, currency)} de descuento` : ""}</p>
        </form>` : ""}
        ${recommendations.length ? `<section class="cart-recommendations" aria-labelledby="cart-recommendations-title">
          <div class="cart-recommendations-head"><h3 id="cart-recommendations-title">Súmale algo más</h3><span>Seleccionado para tu pedido</span></div>
          <div class="cart-recommendations-rail">
            ${recommendations.map(({ product, image, imagePosition }) => {
              const needsConfiguration = itemVariants(product).length > 0 || itemExtras(product).length > 0;
              return `<button class="cart-recommendation" type="button" data-recommend-product="${escapeHtml(product.id)}" data-needs-configuration="${needsConfiguration}" aria-label="${needsConfiguration ? "Elegir opciones para" : "Agregar"} ${escapeHtml(product.name)}">
              <img src="${escapeHtml(image)}" alt="" style="object-position:${imagePosition}">
            </button>`;
            }).join("")}
          </div>
        </section>` : ""}
        ${fulfillmentHtml}
        ${contactCheckout ? `<form class="lead-capture-form" id="store-lead-form">
          <div class="lead-capture-heading"><h3>${emailOnlyLeadCheckout ? "¿Cuál es tu Gmail o correo?" : "¿Cómo te contactamos?"}</h3><p>${emailOnlyLeadCheckout ? "La tienda recibirá este correo junto con tu selección. No se realizará ningún cobro." : `La tienda recibirá tus datos y el detalle de los productos que elegiste. ${freeOrder ? "El total es Bs 0 y no se abrirá una pantalla de pago." : "No se realizará ningún cobro."}`}</p></div>
          <div class="lead-capture-grid">
            ${emailOnlyLeadCheckout ? "" : `<div class="field"><label for="lead-name">Nombre completo</label><input id="lead-name" name="name" autocomplete="name" maxlength="120" required></div>`}
            <div class="field${emailOnlyLeadCheckout ? " lead-capture-message" : ""}"><label for="lead-email">Gmail o correo electrónico</label><input id="lead-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="tu@gmail.com" value="${escapeHtml(loadLeadEmail(store.storeId))}" required></div>
            ${emailOnlyLeadCheckout ? "" : `<div class="field"><label for="lead-phone">WhatsApp</label><input id="lead-phone" name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="+591 71234567" required></div><div class="field lead-capture-message"><label for="lead-message">Mensaje (opcional)</label><textarea id="lead-message" name="message" maxlength="600" rows="3" placeholder="Consulta, ciudad o mejor horario para contactarte"></textarea></div>`}
          </div>
        </form>` : ""}
      </div>
      <footer class="cart-review-footer">
        ${promo ? `<div class="cart-review-subtotal"><span>Subtotal</span><span>${formatAmount(subtotal, currency)}</span></div><div class="cart-review-discount"><span>Código ${escapeHtml(promo.code)}</span><strong>−${formatAmount(promoDiscount, currency)}</strong></div>` : ""}
        <div class="cart-review-total"><span>${cartCount()} ${cartCount() === 1 ? "producto" : "productos"}</span><strong>${formatAmount(checkoutTotal, currency)}</strong></div>
        <p>${freeOrder ? `${ICON_EXTERNAL}<span>Pedido gratis: pagosYa enviará la selección a la tienda</span>` : store.checkoutMode === "payment" ? `${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span>` : store.checkoutMode === "whatsapp" ? `${ICON_WHATSAPP}<span>No se realizará ningún cobro en pagosYa</span>` : `${ICON_EXTERNAL}<span>pagosYa enviará tu correo y selección a la tienda</span>`}</p>
        <button type="${contactCheckout ? "submit" : "button"}" ${contactCheckout ? 'form="store-lead-form"' : ""} class="primary" id="cart-confirm" ${fulfillment.locations.length && !fulfillment.selectedLocation ? "disabled" : ""}>${escapeHtml(cartActionLabel(store, freeOrder))}</button>
        <span class="cart-checkout-error" role="alert" hidden></span>
      </footer>
    </div>`;

  dialog.querySelector<HTMLButtonElement>(".cart-review-close")?.addEventListener("click", () => dialog.close());
  dialog.querySelector<HTMLFormElement>("#promo-code-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>("#promo-code-input")!;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".promo-code-status")!;
    const code = input.value.trim().toUpperCase();
    button.disabled = true;
    button.textContent = "Validando…";
    status.textContent = "";
    try {
      const quote = await quotePromoCode(slug, code);
      appliedPromo = { storeId: store.storeId, ...quote };
      renderCartReviewDialog(dialog, slug, store);
      requestAnimationFrame(() => dialog.querySelector<HTMLButtonElement>(".promo-code-remove")?.focus());
    } catch (error) {
      button.disabled = false;
      button.textContent = "Aplicar";
      status.textContent = (error as Error).message;
      input.focus();
      input.select();
    }
  });
  dialog.querySelector<HTMLButtonElement>(".promo-code-remove")?.addEventListener("click", () => {
    appliedPromo = null;
    renderCartReviewDialog(dialog, slug, store);
    requestAnimationFrame(() => dialog.querySelector<HTMLInputElement>("#promo-code-input")?.focus());
  });
  dialog.querySelectorAll<HTMLInputElement>('input[name="fulfillmentMethod"]').forEach((input) => input.addEventListener("change", () => {
    selectedFulfillmentMethod = input.value as "pickup" | "delivery";
    selectedFulfillmentLocationId = null;
    renderCartReviewDialog(dialog, slug, store);
  }));
  dialog.querySelectorAll<HTMLInputElement>('input[name="fulfillmentLocation"]').forEach((input) => input.addEventListener("change", () => {
    selectedFulfillmentLocationId = input.value;
    renderCartReviewDialog(dialog, slug, store);
  }));
  dialog.querySelectorAll<HTMLElement>(".cart-review-line").forEach((row) => {
    const key = row.dataset.cartKey!;
    const rerender = () => {
      saveCart(store);
      if (cartCount() === 0) {
        dialog.close();
        renderStoreRoute(slug, store, { focusPromotion: false });
      } else renderCartReviewDialog(dialog, slug, store);
    };
    row.querySelector<HTMLButtonElement>(".cart-review-remove")?.addEventListener("click", () => { cart.delete(key); rerender(); });
    row.querySelectorAll<HTMLButtonElement>("[data-cart-change]").forEach((button) => button.addEventListener("click", () => {
      const change = Number(button.dataset.cartChange);
      if (change > 0) {
        const { paymentLinkId, variantId } = parseCartItemKey(key);
        const product = store.items.find((item) => item.id === paymentLinkId);
        const variant = product && itemVariants(product).find((candidate) => candidate.id === variantId);
        if (!product || remainingStock(product, variant) === 0) return;
      }
      const next = (cart.get(key) ?? 0) + change;
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
      rerender();
    }));
  });

  dialog.querySelectorAll<HTMLButtonElement>("[data-recommend-product]").forEach((button) => button.addEventListener("click", () => {
    const product = store.items.find((item) => item.id === button.dataset.recommendProduct);
    if (!product) return;
    if (button.dataset.needsConfiguration === "true") {
      dialog.close();
      navigateWithinStore(slug, store, product.id);
      return;
    }
    if (remainingStock(product, undefined) === 0) return;
    const key = cartItemKey(product.id);
    cart.set(key, (cart.get(key) ?? 0) + 1);
    saveCart(store);
    renderCartReviewDialog(dialog, slug, store);
  }));

  if (contactCheckout) {
    dialog.querySelector<HTMLFormElement>("#store-lead-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const confirmButton = dialog.querySelector<HTMLButtonElement>("#cart-confirm")!;
      const checkoutError = dialog.querySelector<HTMLElement>(".cart-checkout-error")!;
      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const phone = String(formData.get("phone") || "").trim();
      if (!emailOnlyLeadCheckout && phone.replace(/\D/g, "").length < 7) {
        checkoutError.textContent = "Escribe un número de WhatsApp válido, con al menos 7 dígitos.";
        checkoutError.hidden = false;
        form.querySelector<HTMLInputElement>("#lead-phone")?.focus();
        return;
      }
      checkoutError.hidden = true;
      confirmButton.disabled = true;
      confirmButton.setAttribute("aria-busy", "true");
      confirmButton.textContent = "Enviando tus datos…";
      try {
        const items = [...cart.entries()].map(([key, quantity]) => {
          const selected = parseCartItemKey(key);
          return { paymentLinkId: selected.paymentLinkId, ...(selected.variantId ? { variantId: selected.variantId } : {}), ...(selected.extraIds.length ? { extraIds: selected.extraIds } : {}), quantity };
        });
        const selectedFulfillment = fulfillment.selectedLocation && fulfillment.method
          ? { locationId: fulfillment.selectedLocation.id, fulfillmentMethod: fulfillment.method }
          : undefined;
        const contact = {
          email,
          ...(String(formData.get("name") || "").trim() ? { name: String(formData.get("name")).trim() } : {}),
          ...(phone ? { phone } : {}),
          ...(String(formData.get("message") || "").trim() ? { message: String(formData.get("message")).trim() } : {}),
        };
        if (selectedFulfillment) await submitStoreLead(slug, contact, items, selectedFulfillment);
        else await submitStoreLead(slug, contact, items);
        saveLeadEmail(store.storeId, email);
        cart.clear();
        saveCart(store);
        dialog.innerHTML = `<div class="lead-capture-success"><div class="status success">${ICON_CHECK}<span>Solicitud enviada</span></div><h2>La tienda ya recibió tu solicitud</h2><p>Enviamos tu correo y los productos seleccionados. La tienda podrá responderte por email.</p><button type="button" class="primary" id="lead-success-close">Cerrar</button></div>`;
        dialog.querySelector<HTMLButtonElement>("#lead-success-close")?.addEventListener("click", () => dialog.close());
        dialog.querySelector<HTMLButtonElement>("#lead-success-close")?.focus();
      } catch (err) {
        confirmButton.disabled = false;
        confirmButton.removeAttribute("aria-busy");
        confirmButton.textContent = cartActionLabel(store, freeOrder);
        checkoutError.textContent = `No pudimos enviar tus datos: ${(err as Error).message}. Intenta nuevamente.`;
        checkoutError.hidden = false;
      }
    });
    return;
  }

  dialog.querySelector<HTMLButtonElement>("#cart-confirm")?.addEventListener("click", async () => {
    const confirmButton = dialog.querySelector<HTMLButtonElement>("#cart-confirm")!;
    const checkoutError = dialog.querySelector<HTMLElement>(".cart-checkout-error")!;
    checkoutError.hidden = true;
    checkoutError.textContent = "";
    if (fulfillment.locations.length && (!fulfillment.selectedLocation || !fulfillment.method)) {
      checkoutError.textContent = "Elige una ubicación con stock para continuar.";
      checkoutError.hidden = false;
      return;
    }
    if (store.checkoutMode === "whatsapp") {
      const phone = (store.contactPhone || "").replace(/\D/g, "");
      if (phone.length < 7 || phone.length > 15) {
        checkoutError.textContent = "Esta tienda todavía no configuró un número de WhatsApp válido.";
        checkoutError.hidden = false;
        return;
      }
      const messageLines = cartLineEntries(store).map(({ product, variant, extras, quantity, unitAmount }) =>
        `• ${product.name}${variant ? ` (${variant.name})` : ""}${extras.length ? ` + ${extras.map((extra) => extra.name).join(", ")}` : ""} x${quantity} - ${formatAmount(unitAmount * quantity, product.currency)}`,
      );
      const destination = store.storeName.trim() ? ` en ${store.storeName.trim()}` : "";
      const fulfillmentLines = fulfillment.selectedLocation && fulfillment.method
        ? ["", `${fulfillment.method === "delivery" ? "Entrega desde" : "Retiro en"}: ${fulfillment.selectedLocation.name}`]
        : [];
      const message = [`Hola, quiero hacer este pedido${destination}:`, "", ...messageLines, ...fulfillmentLines, "", `Total: ${formatAmount(cartTotal(store.items), currency)}`].join("\n");
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      return;
    }
    confirmButton.disabled = true;
    confirmButton.setAttribute("aria-busy", "true");
    confirmButton.textContent = "Abriendo pago…";
    try {
      const items = [...cart.entries()].map(([key, quantity]) => {
        const selected = parseCartItemKey(key);
        return { paymentLinkId: selected.paymentLinkId, ...(selected.variantId ? { variantId: selected.variantId } : {}), ...(selected.extraIds.length ? { extraIds: selected.extraIds } : {}), quantity };
      });
      const activePromo = activePromoForStore(store);
      const selectedFulfillment = fulfillment.selectedLocation && fulfillment.method
        ? { locationId: fulfillment.selectedLocation.id, fulfillmentMethod: fulfillment.method }
        : undefined;
      const result = activePromo
        ? selectedFulfillment
          ? await checkoutCart(slug, items, activePromo.code, selectedFulfillment)
          : await checkoutCart(slug, items, activePromo.code)
        : selectedFulfillment
          ? await checkoutCart(slug, items, undefined, selectedFulfillment)
          : await checkoutCart(slug, items);
      customerContact.deliveryRequested = result.fulfillmentMethod === "delivery";
      activeOrderTrackingToken = result.trackingToken;
      linkHeader = { storeName: result.storeName, description: result.cartDescription, contactPhone: result.contactPhone, contactEmail: result.contactEmail };
      cart.clear();
      saveCart(store);
      dialog.close();
      await enterPaymentFlow(result.clientSecret);
    } catch (err) {
      confirmButton.disabled = false;
      confirmButton.removeAttribute("aria-busy");
      confirmButton.textContent = cartActionLabel(store);
      checkoutError.textContent = `No se pudo abrir el pago: ${(err as Error).message}. Intenta nuevamente.`;
      checkoutError.hidden = false;
    }
  });
}

function openCartReview(slug: string, store: Store, options: { preview?: boolean; allowEmpty?: boolean } = {}): void {
  if (cartCount() === 0 && !options.allowEmpty) return;
  document.querySelector(".cart-review-dialog")?.remove();
  const dialog = document.createElement("dialog");
  dialog.className = "cart-review-dialog";
  dialog.setAttribute("aria-labelledby", "cart-review-title");
  document.body.append(dialog);
  if (typeof dialog.close !== "function") {
    dialog.close = () => {
      dialog.removeAttribute("open");
      dialog.dispatchEvent(new Event("close"));
    };
  }
  renderCartReviewDialog(dialog, slug, store);
  dialog.addEventListener("close", () => {
    dialog.remove();
    updateCartBar(store, store.items[0]?.currency || "BOB");
  }, { once: true });
  if (options.preview) {
    dialog.classList.add("is-preview-open");
    dialog.setAttribute("open", "");
  } else {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    dialog.querySelector<HTMLButtonElement>(".cart-review-close")?.focus();
  }
}

function bindCartCheckout(slug: string, store: Store): void {
  app.querySelectorAll<HTMLButtonElement>("#cart-pay, .store-header-cart").forEach((button) => {
    button.addEventListener("click", () => openCartReview(slug, store));
  });
}

function renderProductPage(slug: string, store: Store, productId: string): void {
  activeHeroCleanup?.();
  activeHeroCleanup = null;
  activeStoreExperienceCleanup?.();
  activeStoreExperienceCleanup = null;
  activeAnnouncementCleanup?.();
  activeAnnouncementCleanup = null;
  activePromotionCleanup?.();
  activePromotionCleanup = null;
  document.body.classList.remove("promotion-open");
  document.body.classList.remove("category-page");
  document.body.classList.add("product-detail-page");
  applyStoreTheme(slug, store);

  const item = store.items.find((candidate) => candidate.id === productId);
  const returnCategoryId = categoryIdFromLocation();
  const returnCategory = store.categories.find((candidate) => candidate.id === returnCategoryId);
  const catalogUrl = returnCategory ? categoryPageUrl(slug, returnCategory.id) : storeCatalogUrl(slug);
  const visibleStoreName = store.storeName.trim();
  const backToStoreLabel = returnCategory
    ? `Volver a ${returnCategory.name}`
    : visibleStoreName
      ? `Volver a ${visibleStoreName}`
      : "Volver al catálogo";
  if (!item) {
    app.innerHTML = `
      ${storefrontHeaderHtml(slug, store, { current: "catalog", catalogUrl })}
      ${storeAnnouncementHtml(store)}
      <div class="product-page-return">
        <a class="product-back-link store-catalog-link" href="${escapeHtml(catalogUrl)}">${ICON_ARROW_LEFT}<span>${escapeHtml(backToStoreLabel)}</span></a>
      </div>
      <main class="product-not-found">
        <span class="product-not-found-mark">?</span>
        <h1>Este producto ya no está disponible</h1>
        <p>Puede que haya sido retirado o que el enlace haya cambiado.</p>
        <a class="primary store-catalog-link" href="${escapeHtml(catalogUrl)}">Ver todos los productos</a>
      </main>`;
    bindStoreAnnouncementPlayback();
    bindInternalStoreLinks(slug, store);
    updateCartBar(store, store.items[0]?.currency || "BOB");
    bindCartCheckout(slug, store);
    return;
  }

  const variants = itemVariants(item);
  const selectedVariant = selectedVariantFor(item);
  const selectedExtras = selectedExtrasFor(item);
  const selectedStock = optionStock(item, selectedVariant);
  const key = cartItemKey(item.id, selectedVariant?.id, selectedExtras.map((extra) => extra.id));
  const qty = cart.get(key) ?? 0;
  const unavailableRequiredExtra = itemExtras(item).find((extra) => extra.required && !extra.available);
  const productLimit = productStockLimit(item);
  const soldOut = productLimit === 0 || selectedStock === 0 || Boolean(unavailableRequiredExtra);
  const atProductLimit = productLimit !== null && productCartQuantity(item.id) >= productLimit;
  const atOptionLimit = selectedStock !== null && optionCartQuantity(item.id, selectedVariant?.id) >= selectedStock;
  const configurationComplete = productConfigurationComplete(item);
  const images = item.imageUrls.map(assetUrl).filter((url): url is string => !!url);
  const rememberedImageIndex = selectedProductImageByItem.get(item.id) ?? 0;
  const selectedImageIndex = Math.min(Math.max(rememberedImageIndex, 0), Math.max(images.length - 1, 0));
  selectedProductImageByItem.set(item.id, selectedImageIndex);
  const itemCategory = store.categories.find((candidate) => candidate.id === item.categoryId);
  const visibleStock = stockStatus(remainingStock(item, selectedVariant), store.showLowStockToCustomers === true);
  const discountPercent = activeProductDiscount(item);
  const detailSaleBanner = discountPercent === null ? "" : `<aside class="product-detail-sale" aria-label="Oferta por tiempo limitado"><strong>${discountPercent}% de descuento</strong><span data-discount-ends-at="${escapeHtml(item.discountEndsAt || "")}">${escapeHtml(discountRemainingLabel(item))}</span></aside>`;

  const galleryHtml = images.length
    ? `<div class="product-detail-main-image-wrap">
        <img class="product-detail-main-image" src="${escapeHtml(images[selectedImageIndex])}" alt="${escapeHtml(item.name)}, foto ${selectedImageIndex + 1} de ${images.length}" style="object-position:${productImagePosition(item, selectedImageIndex)}">
        ${images.length > 1 ? `<button type="button" class="product-detail-image-arrow previous" data-image-step="-1" aria-label="Ver foto anterior">${ICON_ARROW_LEFT}</button><button type="button" class="product-detail-image-arrow next" data-image-step="1" aria-label="Ver foto siguiente">${ICON_ARROW_RIGHT}</button>` : ""}
       </div>
       ${
         images.length > 1
           ? `<div class="product-detail-thumbnails" aria-label="Fotos de ${escapeHtml(item.name)}">
              ${images
                .map(
                  (url, index) =>
                    `<button type="button" class="product-detail-thumbnail${index === selectedImageIndex ? " active" : ""}" data-image-index="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === selectedImageIndex}"><img src="${escapeHtml(url)}" alt="" style="object-position:${productImagePosition(item, index)}"></button>`,
                )
                .join("")}
             </div>`
           : ""
       }`
    : `<div class="product-detail-main-image-wrap product-detail-placeholder" aria-label="${escapeHtml(item.name)}"><span>${escapeHtml(initials(item.name))}</span></div>`;

  const variantsHtml = variants.length
    ? `<fieldset class="product-detail-variants">
        <legend>Selecciona una versión</legend>
        <div class="product-detail-option-list">
          ${variants
            .map((variant) => {
              const variantStock = optionStock(item, variant);
              const unavailable = variantStock === 0;
              const visibleVariantStock = stockStatus(remainingStock(item, variant), store.showLowStockToCustomers === true);
              return `<button type="button" class="product-detail-option${variant.id === selectedVariant?.id ? " active" : ""}" data-variant-id="${escapeHtml(variant.id)}" aria-pressed="${variant.id === selectedVariant?.id}" ${unavailable ? "disabled" : ""}>
                <span>${escapeHtml(variant.name)}</span>
                <strong>${formatAmount(discountedProductAmount(item, variant.amount), item.currency)}${discountPercent === null ? "" : ` <del>${formatAmount(variant.amount, item.currency)}</del>`}</strong>
                ${visibleVariantStock ? `<small>${visibleVariantStock.label}</small>` : ""}
              </button>`;
            })
            .join("")}
        </div>
       </fieldset>`
    : "";

  const courtesyCopy = extrasCourtesyCopy(item);
  const extrasHtml = itemExtras(item).length
    ? `<fieldset class="product-detail-extras">
        <legend>Personaliza tu producto</legend>
        <p>${courtesyCopy ? `${escapeHtml(courtesyCopy)}. Las selecciones adicionales se cobran al precio mostrado.` : "Marca solo lo que quieras agregar. Los elementos obligatorios están identificados."}</p>
        <div class="product-detail-extra-list">
          ${itemExtras(item).map((extra) => { const displayAmount = extraDisplayAmount(item, extra, selectedExtras); return `<label><input type="checkbox" class="product-detail-extra-toggle" data-extra-id="${escapeHtml(extra.id)}" ${selectedExtras.some((selected) => selected.id === extra.id) ? "checked" : ""} ${extra.available ? "" : "disabled"}><span><strong>${escapeHtml(extra.name)}</strong>${extra.required ? `<small>Requerido</small>` : ""}${extra.available ? "" : `<small>Agotado</small>`}</span><b>${displayAmount === 0 ? "Incluido" : `+${formatAmount(displayAmount, item.currency)}`}</b></label>`; }).join("")}
        </div>
       </fieldset>`
    : "";

  app.innerHTML = `
    ${storefrontHeaderHtml(slug, store, { current: "catalog", catalogUrl })}
    ${storeAnnouncementHtml(store)}
    <div class="product-page-return">
      <a class="product-back-link store-catalog-link" href="${escapeHtml(catalogUrl)}">${ICON_ARROW_LEFT}<span>${escapeHtml(backToStoreLabel)}</span></a>
    </div>
    <main class="product-detail-layout">
      <section class="product-detail-gallery" aria-label="Galería del producto">${galleryHtml}</section>
      <section class="product-detail-content">
        ${itemCategory ? `<div class="product-detail-category">${escapeHtml(itemCategory.name)}</div>` : ""}
        ${detailSaleBanner}
        ${item.tags.length ? `<div class="store-item-tags">${item.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <h1>${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" aria-hidden="true"></span>` : ""}${escapeHtml(item.name)}</h1>
        ${item.description ? `<section class="product-detail-description-block" aria-labelledby="product-description-title"><h2 id="product-description-title">Descripción</h2><p class="product-detail-description">${escapeHtml(item.description)}</p></section>` : ""}
        ${variantsHtml}
        ${extrasHtml}
        ${!configurationComplete ? `<div class="product-configuration-note" role="status">Selecciona todas las opciones requeridas para continuar.</div>` : ""}
        <div class="product-detail-purchase">
          <div>
            ${salePriceHtml(item, selectedUnitAmount(item, selectedVariant, selectedExtras), originalSelectedUnitAmount(item, selectedVariant, selectedExtras), "product-detail-price")}
            ${unavailableRequiredExtra ? `<div class="product-detail-stock out">${escapeHtml(unavailableRequiredExtra.name)} agotado</div>` : visibleStock ? `<div class="product-detail-stock${visibleStock.exhausted ? " out" : ""}">${visibleStock.label}</div>` : ""}
          </div>
          ${
            soldOut || (qty === 0 && (atProductLimit || atOptionLimit))
              ? `<button type="button" class="primary product-add" disabled>Stock agotado</button>`
              : qty === 0
                ? `<button type="button" class="primary product-add" ${configurationComplete ? "" : "disabled"}>${configurationComplete ? "Agregar al carrito" : "Completa las opciones"}</button>`
                : `<div class="qty-stepper product-detail-stepper" aria-label="Cantidad de ${escapeHtml(item.name)}">
                    <button type="button" class="qty-minus" aria-label="Quitar una unidad de ${escapeHtml(item.name)}">−</button>
                    <span class="qty-value" aria-live="polite">${qty}</span>
                    <button type="button" class="qty-plus" aria-label="Agregar una unidad de ${escapeHtml(item.name)}" ${atProductLimit || atOptionLimit ? "disabled" : ""}>+</button>
                  </div>`
          }
        </div>
      </section>
    </main>
    <div class="cart-bar product-detail-cart-bar">
      <span class="cart-summary" aria-live="polite"></span>
      <button type="button" class="primary" id="cart-pay">Ver carrito</button>
      <span class="cart-checkout-error" role="alert" hidden></span>
    </div>
    <div class="secure-note product-detail-secure-note">${store.checkoutMode === "payment" ? ICON_LOCK : store.checkoutMode === "whatsapp" ? ICON_WHATSAPP : ICON_EXTERNAL}<span>${store.checkoutMode === "payment" ? "Pago procesado de forma segura por pagosYa" : store.checkoutMode === "whatsapp" ? "El pedido se enviará directamente a WhatsApp" : "Tu correo y selección se enviarán a la tienda"}</span></div>`;

  bindStoreAnnouncementPlayback();
  bindTimedDiscountSchedule(slug, store);
  bindInternalStoreLinks(slug, store);
  app.querySelectorAll<HTMLButtonElement>(".product-detail-thumbnail").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProductImageByItem.set(item.id, Number(button.dataset.imageIndex));
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-thumbnail[data-image-index="${button.dataset.imageIndex}"]`)?.focus();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".product-detail-image-arrow").forEach((button) => {
    button.addEventListener("click", () => {
      const step = Number(button.dataset.imageStep) || 0;
      selectedProductImageByItem.set(item.id, (selectedImageIndex + step + images.length) % images.length);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-image-arrow.${step < 0 ? "previous" : "next"}`)?.focus();
    });
  });
  app.querySelectorAll<HTMLButtonElement>(".product-detail-option").forEach((button) => {
    button.addEventListener("click", () => {
      selectedVariantByItem.set(item.id, button.dataset.variantId!);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLButtonElement>(`.product-detail-option[data-variant-id="${button.dataset.variantId}"]`)?.focus();
    });
  });
  app.querySelectorAll<HTMLInputElement>(".product-detail-extra-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(selectedExtraIdsByItem.get(item.id) ?? []);
      if (input.checked) selected.add(input.dataset.extraId!);
      else selected.delete(input.dataset.extraId!);
      selectedExtraIdsByItem.set(item.id, selected);
      renderProductPage(slug, store, item.id);
      app.querySelector<HTMLInputElement>(`.product-detail-extra-toggle[data-extra-id="${input.dataset.extraId}"]`)?.focus();
    });
  });

  const addOne = () => {
    if (!productConfigurationComplete(item)) return;
    const variant = selectedVariantFor(item);
    if (remainingStock(item, variant) === 0) return;
    const extras = selectedExtrasFor(item);
    const cartKey = cartItemKey(item.id, variant?.id, extras.map((extra) => extra.id));
    const available = optionStock(item, variant);
    if (available !== null && optionCartQuantity(item.id, variant?.id) >= available) return;
    cart.set(cartKey, (cart.get(cartKey) ?? 0) + 1);
    saveCart(store);
    renderProductPage(slug, store, item.id);
    app.querySelector<HTMLButtonElement>(".qty-plus")?.focus();
  };
  app.querySelector<HTMLButtonElement>(".product-add")?.addEventListener("click", addOne);
  app.querySelector<HTMLButtonElement>(".qty-plus")?.addEventListener("click", addOne);
  app.querySelector<HTMLButtonElement>(".qty-minus")?.addEventListener("click", () => {
    const cartKey = cartItemKey(item.id, selectedVariantFor(item)?.id, selectedExtrasFor(item).map((extra) => extra.id));
    const next = (cart.get(cartKey) ?? 0) - 1;
    if (next <= 0) cart.delete(cartKey);
    else cart.set(cartKey, next);
    saveCart(store);
    renderProductPage(slug, store, item.id);
    app.querySelector<HTMLButtonElement>(next > 0 ? ".qty-minus" : ".product-add")?.focus();
  });

  updateCartBar(store, item.currency);
  bindCartCheckout(slug, store);
  if (storePreviewMode && !previewReadyAnnounced) {
    previewReadyAnnounced = true;
    postToParent("CHECKOUT_READY", { mode: "store-preview" });
  }
}

function renderStore(slug: string, store: Store, options: { focusPromotion?: boolean } = {}) {
  activeHeroCleanup?.();
  activeHeroCleanup = null;
  activeStoreExperienceCleanup?.();
  activeStoreExperienceCleanup = null;
  document.body.classList.remove("product-detail-page");
  applyStoreTheme(slug, store);
  const currency = store.items[0]?.currency ?? "BOB";
  const visibleStoreName = store.storeName.trim();
  const bannerUrl = assetUrl(store.bannerUrl);
  if (activeCatalogStoreId !== store.storeId) {
    activeCatalogStoreId = store.storeId;
    searchQuery = "";
    selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    sortMode = "featured";
  }
  const heroSlides = (store.heroSlides ?? [])
    .map((slide) => ({ ...slide, resolvedMediaUrl: assetUrl(slide.imageUrl) }))
    .filter((slide): slide is typeof slide & { resolvedMediaUrl: string } => !!slide.resolvedMediaUrl)
    .slice(0, 5);

  const catalogSections = catalogSectionsForStore(store);
  const hasCatalogSectionPicker = store.categories.length > 0 && catalogSections.length > 0;
  if (hasCatalogSectionPicker && selectedCategoryId !== "ALL" && !catalogSections.some((section) => section.id === selectedCategoryId)) {
    selectedCategoryId = "ALL";
  }
  const selectedCatalogSection = catalogSections.find((section) => section.id === selectedCategoryId) ?? null;
  document.body.classList.toggle("category-page", selectedCatalogSection !== null);
  // Categorized stores disclose their browsing tools after a shopper chooses
  // a section. Uncategorized stores keep the compact direct-catalog behavior.
  const showToolbar = hasCatalogSectionPicker ? selectedCatalogSection !== null : store.items.length > 1;

  // Defense-in-depth on top of the API's http(s)-only validation — these
  // land in an href on a customer's page, so re-check the scheme here too.
  const safeLinks = store.links.filter((l) => /^https?:\/\//i.test(l.url));
  const locations = publicStoreLocations(store);

  // Merchant-typed label/URL, no dedicated "platform" field — recognize the two
  // most common social links by domain (falls back to plain text for anything else,
  // e.g. a catalog PDF or map link).
  function linkIcon(l: StoreLink): string {
    if (/instagram\.com/i.test(l.url)) return ICON_INSTAGRAM;
    if (/wa\.me|whatsapp\.com/i.test(l.url)) return ICON_WHATSAPP;
    return "";
  }

  // Blank-line-separated brand story → real <p> paragraphs (single newlines
  // also break — merchants write this in a plain <textarea>).
  const aboutParagraphs = (store.aboutText ?? "")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const aboutImageUrl = assetUrl(store.aboutImageUrl);
  const requestedContentOrder = Array.isArray(store.contentOrder) ? store.contentOrder : [];
  const editorialImages = (store.editorialGallery ?? [])
    .map((image) => ({ ...image, resolvedImageUrl: assetUrl(image.imageUrl) }))
    .filter((image): image is typeof image & { resolvedImageUrl: string } => !!image.resolvedImageUrl)
    .slice(0, 8);

  // Animated transforms can make the browser reuse a low-resolution compositor
  // texture, especially when a portrait upload is stretched into a wide frame.
  // Keep the real image unscaled and contained; a cached, decorative copy fills
  // the frame behind it so portrait and modest-resolution assets stay crisp.
  const fidelityImageHtml = (
    mediaUrl: string,
    sourceUrl: string,
    alt: string,
    options: { eager?: boolean; className?: string } = {},
  ) => {
    const position = storeImagePosition(store, sourceUrl);
    const sourceLoading = options.eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
    const backdropLoading = options.eager ? 'loading="eager"' : 'loading="lazy"';
    const extraClass = options.className ? ` ${options.className}` : "";
    return `<span class="store-fidelity-media${extraClass}">
      <img class="store-fidelity-media-source" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(alt)}" ${sourceLoading} decoding="async" style="object-position:${position}">
      <img class="store-fidelity-media-backdrop" src="${escapeHtml(mediaUrl)}" alt="" aria-hidden="true" ${backdropLoading} decoding="async" style="object-position:${position}">
    </span>`;
  };

  const announcementHtml = storeAnnouncementHtml(store);

  const safePromotionUrl = store.promotionCtaUrl && /^https?:\/\//i.test(store.promotionCtaUrl) ? store.promotionCtaUrl : null;
  const promotionImageUrl = assetUrl(store.promotionImageUrl);
  const hasPromotionContent =
    !!store.promotionEnabled &&
    (!!store.promotionTitle || !!store.promotionBody || !!promotionImageUrl);
  const showPromotion = hasPromotionContent && consumeStoreContentOnce("promotion", store.storeId, [
    store.promotionImageUrl,
    store.promotionTitle,
    store.promotionBody,
    store.promotionCtaLabel,
    store.promotionCtaUrl,
  ]);
  const promotionHtml = showPromotion
    ? `<div class="promotion-backdrop" data-promotion-backdrop>
        <section class="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
          <button type="button" class="promotion-close" aria-label="Cerrar promoción">×</button>
          ${promotionImageUrl ? `<img class="promotion-image" src="${escapeHtml(promotionImageUrl)}" alt="" style="object-position:${storeImagePosition(store, store.promotionImageUrl)}">` : ""}
          ${store.promotionTitle ? `<h2 id="promotion-title">${escapeHtml(store.promotionTitle)}</h2>` : `<h2 id="promotion-title">Promoción</h2>`}
          ${store.promotionBody ? `<p>${escapeHtml(store.promotionBody)}</p>` : ""}
          ${
            store.promotionCtaLabel
              ? safePromotionUrl
                ? `<a class="primary promotion-action" href="${escapeHtml(safePromotionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(store.promotionCtaLabel)}</a>`
                : `<button type="button" class="primary promotion-action promotion-dismiss">${escapeHtml(store.promotionCtaLabel)}</button>`
              : ""
          }
        </section>
      </div>`
    : "";

  const carouselHtml = heroSlides.length
    ? `<section class="store-carousel" aria-label="${escapeHtml(visibleStoreName ? `Destacados de ${visibleStoreName}` : "Destacados de la tienda")}" aria-roledescription="carrusel">
        <div class="store-carousel-viewport">
          ${heroSlides
            .map((slide, index) => {
              const safeCtaUrl = slide.ctaUrl && /^https?:\/\//i.test(slide.ctaUrl) ? slide.ctaUrl : null;
              const hasCopy = !!(slide.title || slide.body || slide.ctaLabel);
              return `<article class="store-slide ${index === 0 ? "active" : ""}" data-slide-index="${index}" aria-hidden="${index === 0 ? "false" : "true"}">
                ${
                  isVideoMediaUrl(slide.resolvedMediaUrl)
                    ? `<video src="${escapeHtml(slide.resolvedMediaUrl)}" aria-label="${escapeHtml(slide.title || `Destacado ${index + 1}`)}" muted loop playsinline preload="metadata"></video>`
                    : fidelityImageHtml(slide.resolvedMediaUrl, slide.imageUrl, slide.title || `Destacado ${index + 1}`, { eager: index === 0 })
                }
                ${
                  hasCopy
                    ? `<div class="store-slide-overlay">
                        ${slide.title ? `<h2>${escapeHtml(slide.title)}</h2>` : ""}
                        ${slide.body ? `<p>${escapeHtml(slide.body)}</p>` : ""}
                        ${
                          slide.ctaLabel
                            ? safeCtaUrl
                              ? `<a class="store-slide-cta" href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(slide.ctaLabel)}</a>`
                              : `<button type="button" class="store-slide-cta hero-catalog-cta">${escapeHtml(slide.ctaLabel)}</button>`
                            : ""
                        }
                      </div>`
                    : ""
                }
              </article>`;
            })
            .join("")}
        </div>
        ${
          heroSlides.length > 1
            ? `<button type="button" class="store-carousel-arrow previous" aria-label="Ver destacado anterior">${ICON_ARROW_LEFT}</button>
               <button type="button" class="store-carousel-arrow next" aria-label="Ver siguiente destacado">${ICON_ARROW_RIGHT}</button>
               <button type="button" class="store-carousel-toggle" aria-pressed="false">Pausar</button>
               <div class="store-carousel-dots" aria-label="Elegir destacado">
                 ${heroSlides.map((_, index) => `<button type="button" data-slide-to="${index}" aria-label="Ver destacado ${index + 1}" aria-current="${index === 0 ? "true" : "false"}"></button>`).join("")}
               </div>`
            : ""
        }
      </section>`
      : bannerUrl
      ? `<div class="store-hero has-banner"><img class="store-banner" src="${escapeHtml(bannerUrl)}" alt="" style="object-position:${storeImagePosition(store, store.bannerUrl)}" /></div>`
      : "";
  const heroHtml = carouselHtml;

  const toolbarHtml = showToolbar
    ? `<div class="store-toolbar">
        <div class="store-toolbar-row">
          <div class="store-search-field">
            <svg class="store-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="search" id="store-search" class="store-search" placeholder="Buscar productos..." aria-label="Buscar productos" value="${escapeHtml(searchQuery)}" />
          </div>
          <div class="store-sort-field">
            <select id="store-sort" class="store-sort" aria-label="Ordenar productos">
              <option value="featured">Destacados</option>
              <option value="price-asc">Precio: menor a mayor</option>
              <option value="price-desc">Precio: mayor a menor</option>
              <option value="popular">Más vendidos</option>
            </select>
            <svg class="store-sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </div>
        </div>
      </div>`
    : "";

  const catalogTitle = store.catalogTitle?.trim() || "La tienda";
  const catalogSubtitle = store.catalogSubtitle?.trim() || (visibleStoreName ? `Explora la selección de ${visibleStoreName}.` : "Explora nuestra selección.");
  const sectionCover = (section: CatalogSection): { url: string | null; position: string } => {
    for (const item of section.items) {
      const imageIndex = item.imageUrls.findIndex((imageUrl) => !!imageUrl);
      if (imageIndex >= 0) {
        return { url: assetUrl(item.imageUrls[imageIndex]), position: productImagePosition(item, imageIndex) };
      }
    }
    const fallbackSource = store.bannerUrl || store.logoUrl;
    return { url: assetUrl(fallbackSource), position: storeImagePosition(store, fallbackSource) };
  };
  const catalogSectionPickerHtml = hasCatalogSectionPicker && !selectedCatalogSection
    ? `<div class="catalog-section-picker" tabindex="-1" aria-labelledby="store-products-title">
        <div class="catalog-section-grid">
          ${catalogSections.map((section, index) => {
            const cover = sectionCover(section);
            const productCount = section.items.length;
            return `<a class="catalog-section-card" href="${escapeHtml(categoryPageUrl(slug, section.id))}" data-catalog-section="${escapeHtml(section.id)}" aria-label="Ver ${escapeHtml(section.name)}, ${productCount} ${productCount === 1 ? "producto" : "productos"}">
              <span class="catalog-section-media">
                ${cover.url
                  ? `<img src="${escapeHtml(cover.url)}" alt="" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" style="object-position:${cover.position}">`
                  : `<span class="catalog-section-placeholder" aria-hidden="true">${escapeHtml(section.name.slice(0, 1).toUpperCase())}</span>`}
              </span>
              <span class="catalog-section-copy">
                <span><strong>${escapeHtml(section.name)}</strong><small>${productCount} ${productCount === 1 ? "producto" : "productos"}</small></span>
                <span class="catalog-section-arrow">${ICON_ARROW_RIGHT}</span>
              </span>
            </a>`;
          }).join("")}
        </div>
      </div>`
    : "";
  const selectedSectionCover = selectedCatalogSection ? sectionCover(selectedCatalogSection) : null;
  const catalogBrowserHtml = !hasCatalogSectionPicker || selectedCatalogSection
    ? `<div class="store-catalog-browser" id="store-catalog-browser" tabindex="-1">
        ${selectedCatalogSection
          ? `<div class="catalog-section-banner${selectedSectionCover?.url ? " has-image" : " is-placeholder"}" aria-labelledby="catalog-section-banner-title">
              ${selectedSectionCover?.url ? `<img src="${escapeHtml(selectedSectionCover.url)}" alt="" fetchpriority="high" decoding="async" style="object-position:${selectedSectionCover.position}">` : ""}
              <div class="catalog-section-banner-shade" aria-hidden="true"></div>
              <a class="catalog-section-back" href="${escapeHtml(storeCatalogUrl(slug))}">${ICON_ARROW_LEFT}<span>Ver secciones</span></a>
              <div class="catalog-section-banner-copy">
                <h3 id="catalog-section-banner-title">${escapeHtml(selectedCatalogSection.name)}</h3>
                <p>${selectedCatalogSection.items.length} ${selectedCatalogSection.items.length === 1 ? "producto" : "productos"} en esta sección</p>
              </div>
            </div>`
          : ""}
        ${toolbarHtml}
        <div id="store-grid"></div>
        <div class="cart-bar">
          <span class="cart-summary" aria-live="polite"></span>
          <button type="button" class="primary" id="cart-pay">Ver carrito</button>
          <span class="cart-checkout-error" role="alert" hidden></span>
        </div>
      </div>`
    : "";
  const productsHtml = `<section class="store-products${selectedCatalogSection ? " category-products-page" : ""}" id="store-products" aria-labelledby="store-products-title">
    ${selectedCatalogSection ? `<h2 class="visually-hidden" id="store-products-title">${escapeHtml(selectedCatalogSection.name)}</h2>` : `<div class="store-section-heading store-catalog-heading">
      <h2 id="store-products-title">${escapeHtml(catalogTitle)}</h2>
      <p>${escapeHtml(catalogSubtitle)}</p>
    </div>`}
    ${catalogSectionPickerHtml}
    ${catalogBrowserHtml}
  </section>`;

  const aboutTitle = store.aboutTitle?.trim() || "Conoce la marca";
  const aboutSubtitle = store.aboutSubtitle?.trim() || store.tagline?.trim() || "Una mirada a la intención detrás de cada elección.";
  const aboutHtml = aboutParagraphs.length || aboutImageUrl || store.aboutTitle || store.aboutSubtitle
    ? `<section class="store-about${aboutImageUrl ? " has-image" : ""}${hasStoreAnimatedIn ? "" : " story-intro"}" aria-labelledby="store-about-title"${aboutImageUrl ? ` style="--store-about-image:url(&quot;${escapeHtml(aboutImageUrl)}&quot;);--store-about-position:${storeImagePosition(store, store.aboutImageUrl)}"` : ""}>
        <div class="store-about-heading">
          <h2 id="store-about-title"><span class="store-about-title-text">${escapeHtml(aboutTitle)}</span></h2>
          <p class="store-about-subtitle">${escapeHtml(aboutSubtitle)}</p>
        </div>
        <div class="store-about-body">${aboutParagraphs.length ? aboutParagraphs.map((paragraph, index) => `<p style="--story-delay:${340 + Math.min(index, 3) * 70}ms">${escapeHtml(paragraph)}</p>`).join("") : `<p style="--story-delay:340ms">${visibleStoreName ? `Pronto conocerás más sobre ${escapeHtml(visibleStoreName)}.` : "Pronto conocerás más sobre esta tienda."}</p>`}</div>
      </section>`
    : "";

  const experienceStyle = ["coverflow", "diagonal-marquee", "story-scroller"].includes(store.experienceStyle || "")
    ? store.experienceStyle
    : "coverflow";
  const storyVideoEntries = heroSlides
    .filter((slide) => isVideoMediaUrl(slide.resolvedMediaUrl))
    .map((slide) => ({
      mediaUrl: slide.resolvedMediaUrl,
      sourceUrl: slide.imageUrl,
      title: slide.title || "Una escena de la marca",
      caption: "Historia en movimiento",
      body: slide.body || "Un capítulo visual que continúa el recorrido después del catálogo.",
      isVideo: true,
    }));
  const storyEntries = storyVideoEntries.length
    ? storyVideoEntries
    : editorialImages.map((image) => ({
        mediaUrl: image.resolvedImageUrl,
        sourceUrl: image.imageUrl,
        title: image.title || "Una escena de la marca",
        caption: image.caption || "Historia visual",
        body: image.body || "Un capítulo visual que continúa el recorrido después del catálogo.",
        isVideo: false,
      }));
  const editorialFigure = (image: (typeof editorialImages)[number], index: number, extraClass = "") => {
    const boxColor = typeof image.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(image.boxColor) ? image.boxColor : null;
    const boxStyle = boxColor
      ? `--store-editorial-card-bg:${boxColor};--store-editorial-card-ink:${accentContrastColor(boxColor)};`
      : "";
    return `<figure class="store-editorial-item ${extraClass}" style="${boxStyle}--experience-index:${index}">
      ${fidelityImageHtml(image.resolvedImageUrl, image.imageUrl, image.caption || `Imagen de la tienda ${index + 1}`)}
      ${(image.title || image.caption || image.body) ? `<figcaption>${image.title ? `<strong>${escapeHtml(image.title)}</strong>` : ""}${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}${image.body ? `<p>${escapeHtml(image.body)}</p>` : ""}</figcaption>` : ""}
    </figure>`;
  };
  const galleryExperienceHtml = experienceStyle === "diagonal-marquee"
    ? `<div class="store-diagonal-marquee" aria-label="Galería diagonal en movimiento">
        <div class="store-diagonal-rail">
          <div class="store-diagonal-set">${editorialImages.map((image, index) => editorialFigure(image, index, "store-diagonal-item")).join("")}</div>
          <div class="store-diagonal-set" aria-hidden="true">${editorialImages.map((image, index) => editorialFigure(image, index, "store-diagonal-item")).join("")}</div>
        </div>
      </div>`
    : experienceStyle === "story-scroller"
      ? `<div class="store-story-scroller">
          <div class="store-story-nav" role="tablist" aria-label="Capítulos de la marca">
            ${storyEntries.map((entry, index) => `<button type="button" role="tab" data-story-to="${index}" aria-selected="${index === 0}" aria-controls="store-story-${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(entry.title || `Capítulo ${index + 1}`)}</button>`).join("")}
          </div>
          <div class="store-story-stage">
            ${storyEntries.map((entry, index) => `<div id="store-story-${index}" class="store-story-panel${index === 0 ? " active" : ""}" role="tabpanel" aria-hidden="${index !== 0}">
              <figure class="store-editorial-item store-story-item">
                ${entry.isVideo
                  ? `<video src="${escapeHtml(entry.mediaUrl)}" aria-label="${escapeHtml(entry.title)}" muted loop playsinline preload="metadata" controls></video>`
                  : fidelityImageHtml(entry.mediaUrl, entry.sourceUrl, entry.caption)}
                <figcaption><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.caption)}</span><p>${escapeHtml(entry.body)}</p></figcaption>
              </figure>
            </div>`).join("")}
          </div>
        </div>`
      : `<div class="store-coverflow" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Carrusel visual de la marca">
          <div class="store-coverflow-stage">
            ${editorialImages.map((image, index) => `<div class="store-coverflow-card" data-coverflow-index="${index}" style="--coverflow-offset:${index};--coverflow-distance:${index}" aria-hidden="${index !== 0}">${editorialFigure(image, index, "store-coverflow-item")}</div>`).join("")}
          </div>
          ${editorialImages.length > 1 ? `<div class="store-experience-controls"><button type="button" data-coverflow-step="-1" aria-label="Ver imagen anterior">${ICON_ARROW_LEFT}</button><span class="store-coverflow-status" aria-live="polite">1 / ${editorialImages.length}</span><button type="button" data-coverflow-step="1" aria-label="Ver imagen siguiente">${ICON_ARROW_RIGHT}</button></div>` : ""}
        </div>`;
  const hasGalleryExperience = experienceStyle === "story-scroller" ? storyEntries.length > 0 : editorialImages.length > 0;
  const allowedMotionExperiences = STORE_MOTION_EXPERIENCES;
  const savedMotionExperiences = Array.isArray(store.motionExperiences)
    ? store.motionExperiences.filter((experience) => allowedMotionExperiences.includes(experience))
    : [];
  const legacyMotionExperience = allowedMotionExperiences.includes(store.motionExperience as (typeof allowedMotionExperiences)[number])
    ? store.motionExperience as (typeof allowedMotionExperiences)[number]
    : "coverflow-carousel";
  const motionExperiences = [...new Set(savedMotionExperiences.length ? savedMotionExperiences : [legacyMotionExperience])];
  const savedAnimations = Array.isArray(store.animations)
    ? store.animations.filter((animation) =>
        !!animation &&
        /^[a-z0-9][a-z0-9_-]{0,47}$/.test(animation.id) &&
        allowedMotionExperiences.includes(animation.type),
      )
    : [];
  const animationInstances = savedAnimations.length
    ? savedAnimations
    : store.motionDuoEnabled === true
      ? motionExperiences.map((type, index) => ({
          id: `legacy-${index + 1}-${type}`,
          name: type === "stagger-testimonials" ? "Reseñas" : type.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
          type,
          title: "",
          subtitle: "",
          topWord: "",
          rightWord: "",
          bottomWord: "",
          productId: "",
          media: store.editorialGallery ?? [],
        }))
      : [];
  const baseContentOrder = ["hero", "about", "products", "gallery", "links", "contact", "location"];
  const animationSections = animationInstances.map((animation) => `animation-${animation.id}`);
  const allowedContentSections = new Set([...baseContentOrder, "motion", ...animationSections]);
  const contentOrder: string[] = [];
  const appendContentSection = (section: string) => {
    if (!contentOrder.includes(section)) contentOrder.push(section);
  };
  requestedContentOrder.forEach((section) => {
    if (section === "motion") {
      animationSections.forEach(appendContentSection);
      return;
    }
    if (section.startsWith("motion-")) {
      const legacyType = section.slice("motion-".length);
      animationInstances
        .filter((animation) => animation.type === legacyType)
        .forEach((animation) => appendContentSection(`animation-${animation.id}`));
      return;
    }
    if (allowedContentSections.has(section)) appendContentSection(section);
  });
  baseContentOrder.forEach(appendContentSection);
  const missingMotionSections = animationSections.filter((section) => !contentOrder.includes(section));
  const linksIndex = contentOrder.indexOf("links");
  contentOrder.splice(linksIndex < 0 ? contentOrder.length : linksIndex, 0, ...missingMotionSections);
  const technicalAnimationTerms = STORE_MOTION_EXPERIENCES.map((type) => type.toLowerCase());
  const generatedAnimationDescriptions = new Set([
    "Conoce la selección y encuentra lo que buscas.",
    "Una experiencia visual creada con las imágenes reales de la marca.",
    "Capítulos visuales de la marca.",
    "Una selección visual para explorar.",
    "Escenas elegidas de la tienda.",
    "Imágenes de la marca en movimiento.",
    "Una escena que se abre mientras avanzas.",
    "Una composición creada con imágenes de la tienda.",
    "Experiencias compartidas por quienes ya nos eligieron.",
    "Una mirada en profundidad a la marca.",
    "Una historia visual que crece hasta ocupar la pantalla.",
    "Recorre cada escena y descubre su historia.",
    "Una imagen que revela poco a poco el universo de la marca.",
    "Ideas clave que mantienen el ritmo de la historia.",
    "Escenas completas que avanzan con el recorrido.",
    "Una invitación viva para continuar hacia la colección.",
    "Cada movimiento descubre un nuevo momento.",
    "Explora las imágenes con rueda, teclado o gesto.",
  ]);
  const motionSectionHtmlByKey = Object.fromEntries(animationInstances.map((animation) => {
    const rawDescription = animation.subtitle?.trim() || "";
    const publicDescription = generatedAnimationDescriptions.has(rawDescription)
      || technicalAnimationTerms.some((term) => rawDescription.toLowerCase().includes(term))
      ? ""
      : rawDescription;
    const accessibleLabel = animation.name?.trim() || "Animación visual";
    const selectedProduct = animation.productId
      ? store.items.find((item) => item.id === animation.productId)
      : undefined;
    const configuredMotionImages = (animation.media ?? [])
      .map((image) => ({
        mediaUrl: assetUrl(image.imageUrl),
        sourceUrl: image.imageUrl,
        title: image.title || "Una escena de la marca",
        caption: image.caption || image.title || "Escena de la marca",
        body: image.body || image.caption || "Una mirada más cercana a la historia de la marca.",
      }))
      .filter((image): image is typeof image & { mediaUrl: string } => !!image.mediaUrl)
      .slice(0, 8);
    const productSourceUrl = selectedProduct?.imageUrls?.[0] || "";
    const productMediaUrl = assetUrl(productSourceUrl);
    const productMotionImage = selectedProduct && productMediaUrl
      ? {
          mediaUrl: productMediaUrl,
          sourceUrl: productSourceUrl,
          title: selectedProduct.name,
          caption: selectedProduct.tags?.[0] || "Producto destacado",
          body: selectedProduct.description || publicDescription,
        }
      : null;
    const mediaLimit = animation.type === "clarity-marquee"
      ? 0
      : ["video-pill", "circle-reveal", "magnetic-target"].includes(animation.type) ? 1 : 8;
    const fallbackProductMotionImage = configuredMotionImages.length === 0 ? productMotionImage : null;
    const motionImages = [
      ...(fallbackProductMotionImage ? [fallbackProductMotionImage] : []),
      ...configuredMotionImages,
    ].slice(0, mediaLimit);
    const motionStories = motionImages.slice(0, 5).map((image) => ({ ...image, isVideo: isVideoMediaUrl(image.mediaUrl) }));
    const sectionKey = `animation-${animation.id}`;
    let blockHtml = "";
    if (animation.type === "story-scroll" && motionStories.length >= 2) {
      blockHtml = `<div class="store-flow-art" data-motion-flow aria-label="Story Scroll">${motionStories.map((entry, index) => `<article class="store-flow-section" style="--flow-index:${index}"><div class="store-flow-inner"><div class="store-flow-copy"><span>${String(index + 1).padStart(2, "0")}</span><h3>${escapeHtml(entry.title)}</h3><p>${escapeHtml(entry.body)}</p></div><figure>${entry.isVideo ? `<video src="${escapeHtml(entry.mediaUrl)}" aria-label="${escapeHtml(entry.title)}" muted loop playsinline preload="metadata" controls></video>` : fidelityImageHtml(entry.mediaUrl, entry.sourceUrl, entry.caption)}</figure></div></article>`).join("")}</div>`;
    } else if (animation.type === "coverflow-carousel" && motionImages.length >= 2) {
      blockHtml = `<div class="store-coverflow store-motion-coverflow" data-coverflow tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-coverflow-stage">${motionImages.map((image, index) => `<div class="store-coverflow-card" data-coverflow-index="${index}" style="--coverflow-offset:${index};--coverflow-distance:${index}" aria-hidden="${index !== 0}"><figure class="store-editorial-item store-coverflow-item">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}<figcaption><strong>${escapeHtml(image.title)}</strong><span>${escapeHtml(image.caption)}</span></figcaption></figure></div>`).join("")}</div><div class="store-experience-controls"><button type="button" data-coverflow-step="-1" aria-label="Ver imagen anterior">${ICON_ARROW_LEFT}</button><span class="store-coverflow-status" aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-coverflow-step="1" aria-label="Ver imagen siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
    } else if (animation.type === "hero-carousel" && motionImages.length >= 2) {
      blockHtml = `<div class="store-motion-hero" data-motion-hero role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}" tabindex="0"><div class="store-motion-hero-backgrounds" aria-hidden="true">${motionImages.map((image, index) => `<img src="${escapeHtml(image.mediaUrl)}" alt="" data-motion-hero-background="${index}" class="${index === 0 ? "active" : ""}">`).join("")}</div><div class="store-motion-hero-copy"><h3 data-motion-hero-title>${escapeHtml(motionImages[0].title)}</h3><p data-motion-hero-caption>${escapeHtml(motionImages[0].caption)}</p></div><div class="store-motion-filmstrip">${motionImages.map((image, index) => `<button type="button" data-motion-hero-to="${index}" data-motion-title="${escapeHtml(image.title)}" data-motion-caption="${escapeHtml(image.caption)}" aria-label="Ver ${escapeHtml(image.title)}" aria-current="${index === 0}">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}</button>`).join("")}</div><div class="store-motion-hero-rail"><span data-motion-hero-status>01</span><span>${String(motionImages.length).padStart(2, "0")}</span></div></div>`;
    } else if (animation.type === "image-stream" && motionImages.length >= 2) {
      blockHtml = `<div class="store-image-stream" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-image-stream-grid">${motionImages.map((image) => `<figure>${fidelityImageHtml(image.mediaUrl, image.sourceUrl, "")}</figure>`).join("")}</div></div>`;
    } else if (animation.type === "scroll-expansion" && motionImages.length >= 2) {
      blockHtml = `<div class="store-scroll-expansion" data-scroll-expansion style="--expansion-progress:0" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-scroll-expansion-sticky"><div class="store-scroll-expansion-background" aria-hidden="true">${fidelityImageHtml(motionImages[1].mediaUrl, motionImages[1].sourceUrl, "")}</div><figure>${fidelityImageHtml(motionImages[0].mediaUrl, motionImages[0].sourceUrl, motionImages[0].caption)}</figure><div class="store-scroll-expansion-copy"><h3>${escapeHtml(motionImages[0].title)}</h3><p>${escapeHtml(motionImages[0].body)}</p></div></div></div>`;
    } else if (animation.type === "hero-gallery-scroll" && motionImages.length >= 3) {
      blockHtml = `<div class="store-gallery-scroll" data-gallery-scroll aria-label="${escapeHtml(accessibleLabel)}"><div class="store-gallery-scroll-sticky"><div class="store-gallery-scroll-grid">${motionImages.slice(0, 5).map((image, index) => `<figure data-gallery-scroll-cell="${index}">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}</figure>`).join("")}</div></div></div>`;
    } else if (animation.type === "stagger-testimonials" && motionImages.length >= 2) {
      blockHtml = `<div class="store-testimonials" data-testimonials tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-testimonials-stage">${motionImages.map((image, index) => `<article class="store-testimonial-card" data-testimonial-index="${index}" style="--testimonial-offset:${index}" aria-hidden="${index !== 0}">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}<blockquote>“${escapeHtml(image.body)}”</blockquote><p>— ${escapeHtml(image.caption)}</p></article>`).join("")}</div><div class="store-experience-controls"><button type="button" data-testimonial-step="-1" aria-label="Ver reseña anterior">${ICON_ARROW_LEFT}</button><span class="store-testimonial-status" aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-testimonial-step="1" aria-label="Ver reseña siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
    } else if (animation.type === "zoom-parallax" && motionImages.length >= 3) {
      blockHtml = `<div class="store-motion-zoom" data-motion-zoom aria-label="${escapeHtml(accessibleLabel)}"><div class="store-motion-zoom-sticky">${motionImages.map((image, index) => `<div class="store-motion-zoom-layer store-motion-zoom-layer-${index}" data-zoom-index="${index}"><figure>${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}</figure></div>`).join("")}</div></div>`;
    } else if (animation.type === "video-pill" && motionStories.length >= 1) {
      const scene = motionStories[0];
      const kineticTopWord = animation.topWord?.trim() || "";
      const kineticRightWord = animation.rightWord?.trim() || "";
      const kineticBottomWord = animation.bottomWord?.trim() || "";
      const kineticWordsHtml = `${kineticTopWord ? `<span class="store-video-pill-word store-video-pill-word-top">${escapeHtml(kineticTopWord)}</span>` : ""}${kineticRightWord ? `<span class="store-video-pill-word store-video-pill-word-right">${escapeHtml(kineticRightWord)}</span>` : ""}${kineticBottomWord ? `<span class="store-video-pill-word store-video-pill-word-bottom">${escapeHtml(kineticBottomWord)}</span>` : ""}`;
      blockHtml = `<div class="store-video-pill" data-video-pill aria-label="${escapeHtml(accessibleLabel)}"><div class="store-video-pill-sticky"><div class="store-video-pill-kinetic" aria-hidden="true">${kineticWordsHtml}<div class="store-video-pill-clocks"><div><time data-video-pill-clock="Asia/Kolkata">--:--:--</time><span>INDIA</span></div><div><time data-video-pill-clock="America/New_York">--:--:--</time><span>NUEVA YORK</span></div><div><time data-video-pill-clock="Asia/Dubai">--:--:--</time><span>DUBÁI</span></div></div></div><div class="store-video-pill-media">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" aria-label="${escapeHtml(scene.title)}" muted loop playsinline preload="auto"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, scene.caption)}</div></div></div>`;
    } else if (animation.type === "portfolio-scroller" && motionStories.length >= 2) {
      blockHtml = `<div class="store-portfolio" data-portfolio-scroller tabindex="0" role="region" aria-label="${escapeHtml(accessibleLabel)}"><nav aria-label="Escenas de ${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<button type="button" data-portfolio-to="${index}" aria-current="${index === 0}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(scene.title)}</strong></button>`).join("")}</nav><div class="store-portfolio-stage">${motionStories.map((scene, index) => `<article data-portfolio-panel="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><div class="store-portfolio-media">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" aria-label="${escapeHtml(scene.title)}" muted loop playsinline preload="metadata"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, scene.caption)}</div><div class="store-portfolio-copy"><h3>${escapeHtml(scene.title)}</h3><p>${escapeHtml(scene.body)}</p></div></article>`).join("")}</div></div>`;
    } else if (animation.type === "circle-reveal" && motionStories.length >= 1) {
      const scene = motionStories[0];
      blockHtml = `<div class="store-circle-reveal" data-circle-reveal aria-label="${escapeHtml(accessibleLabel)}"><div class="store-circle-reveal-sticky"><div class="store-circle-reveal-media">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" aria-label="${escapeHtml(scene.title)}" muted loop playsinline preload="metadata"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, scene.caption)}</div><div class="store-circle-reveal-copy"><h3>${escapeHtml(scene.title)}</h3><p>${escapeHtml(scene.body)}</p></div></div></div>`;
    } else if (animation.type === "clarity-marquee") {
      const phrases = [...new Set([
        selectedProduct?.name,
        ...(selectedProduct?.tags ?? []),
        ...store.items.map((item) => item.name),
        store.storeName,
      ].map((phrase) => phrase?.trim()).filter((phrase): phrase is string => !!phrase))].slice(0, 8);
      const phraseHtml = phrases.map((phrase, index) => `<span><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(phrase)}</span>`).join("");
      blockHtml = `<div class="store-clarity-marquee" data-clarity-marquee aria-label="${escapeHtml(accessibleLabel)}"><div class="store-clarity-rail"><div>${phraseHtml}</div><div aria-hidden="true">${phraseHtml}</div></div><div class="store-clarity-rail reverse"><div>${phraseHtml}</div><div aria-hidden="true">${phraseHtml}</div></div></div>`;
    } else if (animation.type === "full-screen-chapters" && motionStories.length >= 2) {
      blockHtml = `<div class="store-full-chapters" data-full-chapters role="region" aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(220, motionStories.length * 90)}svh"><div class="store-full-chapters-sticky"><div class="store-full-chapter-backgrounds" aria-hidden="true">${motionStories.map((scene, index) => `<div data-full-chapter-bg="${index}" class="${index === 0 ? "active" : ""}">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" muted loop playsinline preload="metadata"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, "")}</div>`).join("")}</div><div class="store-full-chapter-copy">${motionStories.map((scene, index) => `<article data-full-chapter-copy="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><span>${String(index + 1).padStart(2, "0")} / ${String(motionStories.length).padStart(2, "0")}</span><h3>${escapeHtml(scene.title)}</h3><p>${escapeHtml(scene.body)}</p></article>`).join("")}</div><div class="store-full-chapter-progress" aria-hidden="true"><span></span></div></div></div>`;
    } else if (animation.type === "magnetic-target" && motionImages.length >= 1) {
      const scene = motionImages[0];
      const magneticHref = selectedProduct ? productPageUrl(slug, selectedProduct.id) : "#store-grid";
      const magneticLabel = selectedProduct ? `Ver ${selectedProduct.name}` : "Explorar colección";
      blockHtml = `<div class="store-magnetic" data-magnetic-target style="--magnetic-image:url(&quot;${escapeHtml(scene.mediaUrl)}&quot;)"><div class="store-magnetic-copy"><span>${escapeHtml(scene.caption)}</span><h3>${escapeHtml(scene.title)}</h3><p>${escapeHtml(scene.body)}</p></div><a href="${escapeHtml(magneticHref)}" data-magnetic-link><span>${escapeHtml(magneticLabel)}</span>${ICON_ARROW_RIGHT}</a></div>`;
    } else if (animation.type === "frame-sequence" && motionImages.length >= 2) {
      blockHtml = `<div class="store-frame-sequence" data-frame-sequence aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(200, motionImages.length * 55)}svh"><div class="store-frame-sticky"><div class="store-frame-media">${motionImages.map((image, index) => `<div data-frame="${index}" data-frame-title-value="${escapeHtml(image.title)}" data-frame-body-value="${escapeHtml(image.body)}" class="${index === 0 ? "active" : ""}">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}</div>`).join("")}</div><div class="store-frame-copy"><span data-frame-status>01 / ${String(motionImages.length).padStart(2, "0")}</span><h3 data-frame-title>${escapeHtml(motionImages[0].title)}</h3><p data-frame-body>${escapeHtml(motionImages[0].body)}</p></div></div></div>`;
    } else if (animation.type === "3d-gallery" && motionImages.length >= 3) {
      blockHtml = `<div class="store-space-gallery" data-space-gallery tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-space-gallery-stage">${motionImages.map((image, index) => `<figure data-space-card="${index}" style="--space-offset:${index}" aria-hidden="${index !== 0}">${fidelityImageHtml(image.mediaUrl, image.sourceUrl, image.caption)}<figcaption><strong>${escapeHtml(image.title)}</strong><span>${escapeHtml(image.caption)}</span></figcaption></figure>`).join("")}</div><div class="store-experience-controls"><button type="button" data-space-step="-1" aria-label="Ver imagen anterior">${ICON_ARROW_LEFT}</button><span data-space-status aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-space-step="1" aria-label="Ver imagen siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
    }
    const productActionHtml = selectedProduct && animation.type !== "magnetic-target"
      ? `<a class="store-motion-product-link" href="${escapeHtml(productPageUrl(slug, selectedProduct.id))}"><span><small>Producto destacado</small><strong>${escapeHtml(selectedProduct.name)}</strong></span>${ICON_ARROW_RIGHT}</a>`
      : "";
    const descriptionHtml = publicDescription
      ? `<div class="store-motion-description"><p>${escapeHtml(publicDescription)}</p></div>`
      : "";
    const html = blockHtml
      ? `<section class="store-motion-section" data-animation-id="${escapeHtml(animation.id)}" data-motion-experience="${animation.type}" aria-label="${escapeHtml(accessibleLabel)}">${descriptionHtml}${blockHtml}${productActionHtml}</section>`
      : "";
    return [sectionKey, html];
  }));
  const editorialGalleryHtml = hasGalleryExperience
    ? `<section class="store-editorial-gallery" data-experience-style="${experienceStyle}" aria-labelledby="store-gallery-title">
        <div class="store-section-heading">
          <h2 id="store-gallery-title">${escapeHtml(store.galleryTitle?.trim() || "La marca en imágenes")}</h2>
          <p>${escapeHtml(store.gallerySubtitle?.trim() || "Detalles, atmósferas y perspectivas que completan la historia.")}</p>
        </div>
        ${galleryExperienceHtml}
      </section>`
    : "";

  const linksHtml = safeLinks.length
    ? `<section class="store-footer" aria-labelledby="store-links-title">
        <h2 class="store-footer-label" id="store-links-title">${escapeHtml(store.linksTitle?.trim() || "Síguenos")}</h2>
        <div class="store-links">${safeLinks
          .map((link) => {
            const icon = linkIcon(link);
            return `<a class="store-link-btn${icon ? " has-icon" : ""}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${icon ? `<span class="store-link-icon">${icon}</span>` : ""}${escapeHtml(link.label)}</a>`;
          })
          .join("")}</div>
      </section>`
    : "";

  const contactHtml = store.contactFormEnabled === true
    ? `<section class="store-contact-section" id="store-contact" aria-labelledby="store-contact-title">
        <div class="store-contact-copy">
          <h2 id="store-contact-title">${escapeHtml(store.contactTitle?.trim() || "¿Tienes una pregunta?")}</h2>
          <p>${escapeHtml(store.contactSubtitle?.trim() || `Escríbele directamente al equipo de ${store.storeName}. La tienda recibirá tu pregunta desde pagosYa y podrá responder a tu correo.`)}</p>
        </div>
        <form class="store-contact-form" id="store-contact-form">
          <div class="field"><label for="store-contact-name">Nombre <span class="store-contact-optional">(opcional)</span></label><input id="store-contact-name" name="name" autocomplete="name" maxlength="120" placeholder="Cómo te llamas"></div>
          <div class="field"><label for="store-contact-email">Tu Gmail o correo</label><input id="store-contact-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(loadLeadEmail(store.storeId))}" placeholder="tunombre@gmail.com" aria-describedby="store-contact-email-help" required><small id="store-contact-email-help" class="store-contact-field-help">La tienda usará este correo para responderte.</small></div>
          <div class="field store-contact-message"><label for="store-contact-message">Tu pregunta</label><textarea id="store-contact-message" name="message" maxlength="600" rows="5" placeholder="Escribe aquí lo que quieres consultar…" required></textarea></div>
          <div class="store-contact-actions"><button class="primary" type="submit">Enviar pregunta</button><span class="store-contact-status" role="status" aria-live="polite"></span></div>
        </form>
      </section>`
    : "";

  const appointmentOfferings = store.appointmentOfferings ?? [];
  const appointmentsHtml = appointmentOfferings.length
    ? `<section class="store-appointments" aria-labelledby="store-appointments-title">
        <div class="store-appointments-copy"><h2 id="store-appointments-title">Reserva tu cita</h2><p>Elige un servicio y uno de los horarios realmente disponibles. El horario se apartará durante 15 minutos mientras completas el pago.</p></div>
        <form class="store-appointment-form" id="store-appointment-form">
          <div class="field"><label for="store-appointment-offering">Servicio</label><select id="store-appointment-offering" name="offeringId" required>${appointmentOfferings.map((offering) => `<option value="${escapeHtml(offering.id)}">${escapeHtml(offering.name)} · ${formatAmount(offering.price, offering.currency)} · ${offering.durationMinutes} min</option>`).join("")}</select></div>
          <div class="field"><label for="store-appointment-date">Fecha</label><input id="store-appointment-date" name="date" type="date" required></div>
          <div class="store-appointment-slots-field"><span>Horarios disponibles</span><div class="store-appointment-slots" id="store-appointment-slots" role="radiogroup" aria-label="Horarios disponibles"></div><small id="store-appointment-calendar-status" aria-live="polite">Selecciona una fecha para consultar la agenda.</small></div>
          <div class="field"><label for="store-appointment-name">Nombre</label><input id="store-appointment-name" name="customerName" autocomplete="name" maxlength="120" required></div>
          <div class="field"><label for="store-appointment-email">Correo</label><input id="store-appointment-email" name="customerEmail" type="email" autocomplete="email" maxlength="254" required></div>
          <div class="field"><label for="store-appointment-phone">Teléfono</label><input id="store-appointment-phone" name="customerPhone" autocomplete="tel" inputmode="tel" maxlength="40"></div>
          <div class="store-appointment-actions"><button class="primary" type="submit" disabled>Reservar y pagar</button><span id="store-appointment-status" role="status" aria-live="polite"></span></div>
        </form>
      </section>`
    : "";

  const locationCardHtml = (location: StoreLocation, index: number) => {
    const mapUrl = safeStoreMapEmbedUrl(location.mapEmbedUrl);
    const fulfillment = [location.pickupEnabled ? "Retiro" : "", location.deliveryEnabled ? "Entrega" : ""].filter(Boolean).join(" · ");
    const opening = locationOpeningState(location);
    return `<article class="store-location-card${mapUrl ? " has-map" : ""}" tabindex="-1">
      <div class="store-location-copy">
        <span class="store-location-number">${String(index + 1).padStart(2, "0")}</span>
        <h3>${escapeHtml(location.name)}</h3>
        ${location.highlight?.trim() ? `<p class="store-location-highlight"><mark>${escapeHtml(location.highlight.trim())}</mark></p>` : ""}
        ${location.address?.trim() ? `<p class="store-location-address">${ICON_MAP_PIN}<span>${escapeHtml(location.address.trim())}</span></p>` : ""}
        ${location.description?.trim() ? `<p class="store-location-description">${escapeHtml(location.description.trim())}</p>` : ""}
        ${fulfillment ? `<p class="store-location-fulfillment">${escapeHtml(fulfillment)}</p>` : ""}
        <p class="store-location-hours${opening.isOpen ? " is-open" : ""}">${escapeHtml(opening.label)}</p>
        ${mapUrl ? `<a class="store-location-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener noreferrer">${ICON_MAP_PIN}<span>Abrir mapa</span></a>` : ""}
      </div>
      ${mapUrl ? `<div class="store-location-map"><iframe src="${escapeHtml(mapUrl)}" title="${escapeHtml(location.name)} de ${escapeHtml(store.storeName)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allowfullscreen></iframe></div>` : ""}
    </article>`;
  };
  const locationHtml = locations.length
    ? `<section class="store-location-section${locations.length > 1 ? " has-many" : ""}" id="store-location" aria-labelledby="store-location-title">
        <div class="store-location-heading">
          <div><h2 id="store-location-title">${escapeHtml(store.locationTitle?.trim() || "Visítanos")}</h2><p>${escapeHtml(store.locationSubtitle?.trim() || (locations.length === 1 ? "Encuentra esta tienda y elige cómo recibir tu pedido." : `${locations.length} ubicaciones para retirar o recibir tu pedido.`))}</p></div>
          ${locations.length > 1 ? `<button class="store-locations-toggle" type="button" aria-expanded="false" aria-controls="store-locations-list">Ver ubicaciones <span>${locations.length}</span></button>` : ""}
        </div>
        <div class="store-locations-list${locations.length === 1 ? " is-single" : ""}" id="store-locations-list" ${locations.length > 1 ? "hidden" : ""}>
          ${locations.map(locationCardHtml).join("")}
        </div>
      </section>`
    : "";

  const sectionHtml: Record<string, string> = {
    hero: heroHtml,
    products: productsHtml + appointmentsHtml,
    about: aboutHtml,
    gallery: editorialGalleryHtml,
    contact: contactHtml,
    location: locationHtml,
    motion: animationSections.map((section) => motionSectionHtmlByKey[section] || "").join(""),
    links: linksHtml,
    ...motionSectionHtmlByKey,
  };
  const orderedSectionsHtml = selectedCatalogSection
    ? productsHtml
    : contentOrder.map((section) => sectionHtml[section] || "").join("");
  app.innerHTML = `
    ${storefrontHeaderHtml(slug, store, { current: selectedCatalogSection ? "catalog" : "home", catalogUrl: selectedCatalogSection ? categoryPageUrl(slug, selectedCatalogSection.id) : storeCatalogUrl(slug) })}
    ${announcementHtml}
    ${orderedSectionsHtml}
    <div class="secure-note">${store.checkoutMode === "payment" ? ICON_LOCK : store.checkoutMode === "whatsapp" ? ICON_WHATSAPP : ICON_EXTERNAL}<span>${store.checkoutMode === "payment" ? "Pago procesado de forma segura por pagosYa" : store.checkoutMode === "whatsapp" ? "El pedido se enviará directamente a WhatsApp" : "Tu correo y selección se enviarán a la tienda"}</span></div>
    ${selectedCatalogSection ? "" : promotionHtml}
  `;
  applyStoreSectionBackgrounds(store);

  // CSS transforms can place an image far from its untransformed box, which
  // makes native lazy-loading postpone it until after the animation is visible.
  // Warm each motion section shortly before it reaches the viewport instead.
  const motionMediaSections = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section"));
  const warmMotionMedia = (section: HTMLElement) => {
    section.querySelectorAll<HTMLImageElement>('img[loading="lazy"]').forEach((image) => {
      image.loading = "eager";
    });
  };
  if (typeof IntersectionObserver === "function") {
    const motionMediaObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        warmMotionMedia(entry.target as HTMLElement);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "900px 0px" });
    motionMediaSections.forEach((section) => motionMediaObserver.observe(section));
  } else {
    motionMediaSections.forEach(warmMotionMedia);
  }

  app.querySelector<HTMLButtonElement>(".store-locations-toggle")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const list = app.querySelector<HTMLElement>("#store-locations-list")!;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.firstChild!.textContent = expanded ? "Ver ubicaciones " : "Ocultar ubicaciones ";
    list.hidden = expanded;
    if (!expanded) requestAnimationFrame(() => list.querySelector<HTMLElement>(".store-location-card")?.focus?.());
  });

  app.querySelector<HTMLFormElement>("#store-contact-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".store-contact-status")!;
    const data = new FormData(form);
    status.textContent = "";
    status.removeAttribute("role");
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Enviando…";
    try {
      const email = String(data.get("email") || "").trim().toLowerCase();
      const name = String(data.get("name") || "").trim();
      await submitStoreLead(slug, {
        ...(name ? { name } : {}),
        email,
        message: String(data.get("message") || "").trim(),
      }, []);
      saveLeadEmail(store.storeId, email);
      form.reset();
      const emailInput = form.querySelector<HTMLInputElement>("#store-contact-email");
      if (emailInput) emailInput.value = email;
      status.setAttribute("role", "status");
      status.textContent = "Pregunta enviada. La tienda ya la recibió y responderá a tu correo.";
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = `No pudimos enviar el mensaje: ${(error as Error).message}`;
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = "Enviar pregunta";
    }
  });

  const appointmentForm = app.querySelector<HTMLFormElement>("#store-appointment-form");
  if (appointmentForm) {
    const offering = appointmentForm.elements.namedItem("offeringId") as HTMLSelectElement;
    const dateInput = appointmentForm.elements.namedItem("date") as HTMLInputElement;
    const slots = appointmentForm.querySelector<HTMLElement>("#store-appointment-slots")!;
    const calendarStatus = appointmentForm.querySelector<HTMLElement>("#store-appointment-calendar-status")!;
    const submit = appointmentForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = appointmentForm.querySelector<HTMLElement>("#store-appointment-status")!;
    let selectedStartsAt = "";
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    dateInput.min = localDate;
    dateInput.value = localDate;

    const loadSlots = async () => {
      selectedStartsAt = "";
      submit.disabled = true;
      slots.setAttribute("aria-busy", "true");
      slots.innerHTML = '<span class="store-appointment-loading">Consultando agenda…</span>';
      calendarStatus.textContent = "";
      try {
        const availability = await fetchAppointmentAvailability(slug, offering.value, dateInput.value);
        slots.innerHTML = availability.slots.map((slot) => `<button type="button" role="radio" aria-checked="false" data-appointment-slot="${escapeHtml(slot.startsAt)}">${escapeHtml(slot.label)}</button>`).join("") || '<span class="store-appointment-loading">No quedan horarios para este día. Prueba otra fecha.</span>';
        calendarStatus.textContent = availability.connectedToGoogleCalendar ? "Disponibilidad verificada con Google Calendar." : "Disponibilidad verificada con la agenda de pagosYa.";
      } catch (error) {
        slots.innerHTML = '<span class="store-appointment-loading">No pudimos consultar los horarios.</span>';
        calendarStatus.textContent = (error as Error).message;
      } finally {
        slots.removeAttribute("aria-busy");
      }
    };
    slots.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-appointment-slot]");
      if (!button) return;
      selectedStartsAt = button.dataset.appointmentSlot || "";
      slots.querySelectorAll<HTMLButtonElement>("[data-appointment-slot]").forEach((item) => item.setAttribute("aria-checked", String(item === button)));
      submit.disabled = !selectedStartsAt;
    });
    offering.addEventListener("change", loadSlots);
    dateInput.addEventListener("change", loadSlots);
    appointmentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedStartsAt) return;
      const data = new FormData(appointmentForm);
      status.textContent = "";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Apartando horario…";
      try {
        const result = await createAppointmentPayment(slug, {
          offeringId: String(data.get("offeringId")),
          customerName: String(data.get("customerName") || "").trim(),
          customerEmail: String(data.get("customerEmail") || "").trim().toLowerCase(),
          customerPhone: String(data.get("customerPhone") || "").trim() || undefined,
          startsAt: selectedStartsAt,
        });
        if (result.clientSecret) {
          window.location.assign(`${storeCatalogUrl(slug)}#client_secret=${encodeURIComponent(result.clientSecret)}`);
          return;
        }
        status.textContent = "Cita confirmada. Recibirás los detalles por correo.";
        await loadSlots();
      } catch (error) {
        status.textContent = (error as Error).message;
        await loadSlots();
      } finally {
        submit.removeAttribute("aria-busy");
        submit.textContent = "Reservar y pagar";
        submit.disabled = !selectedStartsAt;
      }
    });
    void loadSlots();
  }

  bindStoreAnnouncementPlayback();
  bindTimedDiscountSchedule(slug, store);

  activePromotionCleanup?.();
  activePromotionCleanup = null;
  document.body.classList.toggle("promotion-open", showPromotion);
  if (showPromotion) {
    const backdrop = app.querySelector<HTMLElement>("[data-promotion-backdrop]")!;
    const closeButton = backdrop.querySelector<HTMLButtonElement>(".promotion-close")!;
    let dismissalTimer: number | undefined;
    let isDismissing = false;
    const finishPromotionDismissal = () => {
      window.clearTimeout(dismissalTimer);
      backdrop.removeEventListener("animationend", onPromotionAnimationEnd);
      document.removeEventListener("keydown", onPromotionKeydown);
      backdrop.remove();
      document.body.classList.remove("promotion-open");
      activePromotionCleanup = null;
    };
    const onPromotionAnimationEnd = (event: AnimationEvent) => {
      if (event.target === backdrop && isDismissing) finishPromotionDismissal();
    };
    const dismissPromotion = () => {
      if (isDismissing) return;
      isDismissing = true;
      backdrop.classList.add("is-closing");
      backdrop.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onPromotionKeydown);
      backdrop.addEventListener("animationend", onPromotionAnimationEnd);
      dismissalTimer = window.setTimeout(finishPromotionDismissal, 240);
    };
    const onPromotionKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissPromotion();
      if (event.key === "Tab") {
        const focusable = Array.from(backdrop.querySelectorAll<HTMLElement>("button, a[href]")).filter(
          (element) => !element.hasAttribute("disabled"),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    closeButton.addEventListener("click", dismissPromotion);
    backdrop.querySelector(".promotion-action")?.addEventListener("click", dismissPromotion);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) dismissPromotion();
    });
    document.addEventListener("keydown", onPromotionKeydown);
    activePromotionCleanup = () => {
      window.clearTimeout(dismissalTimer);
      backdrop.removeEventListener("animationend", onPromotionAnimationEnd);
      document.removeEventListener("keydown", onPromotionKeydown);
    };
    if (options.focusPromotion !== false) closeButton.focus();
  }

  const carousel = app.querySelector<HTMLElement>(".store-carousel");
  if (carousel) {
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(".store-slide"));
    const dots = Array.from(carousel.querySelectorAll<HTMLButtonElement>("[data-slide-to]"));
    const autoplayToggle = carousel.querySelector<HTMLButtonElement>(".store-carousel-toggle");
    let activeIndex = 0;
    let autoplayTimer: number | undefined;
    let autoplayPausedByUser = false;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const syncVideoPlayback = () => {
      slides.forEach((slide, index) => {
        const video = slide.querySelector<HTMLVideoElement>("video");
        if (!video) return;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        if (index !== activeIndex || autoplayPausedByUser || prefersReducedMotion) {
          video.pause();
          return;
        }
        try {
          const playAttempt = video.play();
          void playAttempt?.catch(() => undefined);
        } catch {
          // Browser autoplay policy may block playback; the first frame remains useful.
        }
      });
    };
    const showSlide = (nextIndex: number) => {
      activeIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === activeIndex;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
        slide.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]").forEach((control) => {
          control.tabIndex = active ? 0 : -1;
        });
      });
      dots.forEach((dot, index) => dot.setAttribute("aria-current", String(index === activeIndex)));
      syncVideoPlayback();
    };
    const stopAutoplay = () => {
      if (autoplayTimer !== undefined) window.clearInterval(autoplayTimer);
      autoplayTimer = undefined;
    };
    const startAutoplay = () => {
      stopAutoplay();
      if (slides.length > 1 && !prefersReducedMotion && !autoplayPausedByUser) {
        autoplayTimer = window.setInterval(() => showSlide(activeIndex + 1), 6000);
      }
    };
    autoplayToggle?.addEventListener("click", () => {
      autoplayPausedByUser = !autoplayPausedByUser;
      autoplayToggle.setAttribute("aria-pressed", String(autoplayPausedByUser));
      autoplayToggle.textContent = autoplayPausedByUser ? "Reanudar" : "Pausar";
      if (autoplayPausedByUser) stopAutoplay();
      else startAutoplay();
      syncVideoPlayback();
    });
    carousel.querySelector<HTMLButtonElement>(".previous")?.addEventListener("click", () => {
      showSlide(activeIndex - 1);
      startAutoplay();
    });
    carousel.querySelector<HTMLButtonElement>(".next")?.addEventListener("click", () => {
      showSlide(activeIndex + 1);
      startAutoplay();
    });
    dots.forEach((dot) =>
      dot.addEventListener("click", () => {
        showSlide(Number(dot.dataset.slideTo));
        startAutoplay();
      }),
    );
    carousel.addEventListener("pointerenter", stopAutoplay);
    carousel.addEventListener("pointerleave", startAutoplay);
    carousel.addEventListener("focusin", stopAutoplay);
    carousel.addEventListener("focusout", startAutoplay);
    const syncCarouselVisibility = () => document.hidden ? stopAutoplay() : startAutoplay();
    document.addEventListener("visibilitychange", syncCarouselVisibility);
    carousel.querySelectorAll<HTMLButtonElement>(".hero-catalog-cta").forEach((button) =>
      button.addEventListener("click", () => {
        const target = app.querySelector<HTMLElement>(".catalog-section-picker")
          ?? app.querySelector<HTMLElement>("#store-grid")
          ?? app.querySelector<HTMLElement>(".store-products");
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      }),
    );
    showSlide(0);
    startAutoplay();
    activeHeroCleanup = () => {
      stopAutoplay();
      document.removeEventListener("visibilitychange", syncCarouselVisibility);
      slides.forEach((slide) => slide.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }

  app.querySelectorAll<HTMLElement>(".store-coverflow").forEach((coverflow) => {
    const cards = Array.from(coverflow.querySelectorAll<HTMLElement>("[data-coverflow-index]"));
    const status = coverflow.querySelector<HTMLElement>(".store-coverflow-status");
    let selected = 0;
    const showCard = (next: number) => {
      selected = (next + cards.length) % cards.length;
      cards.forEach((card, index) => {
        let offset = index - selected;
        if (offset > cards.length / 2) offset -= cards.length;
        if (offset < -cards.length / 2) offset += cards.length;
        card.style.setProperty("--coverflow-offset", String(offset));
        card.style.setProperty("--coverflow-distance", String(Math.abs(offset)));
        card.setAttribute("aria-hidden", String(index !== selected));
      });
      if (status) status.textContent = `${selected + 1} / ${cards.length}`;
    };
    coverflow.querySelectorAll<HTMLButtonElement>("[data-coverflow-step]").forEach((button) =>
      button.addEventListener("click", () => showCard(selected + Number(button.dataset.coverflowStep))),
    );
    coverflow.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      showCard(selected + (event.key === "ArrowLeft" ? -1 : 1));
    });
    showCard(0);
  });

  app.querySelectorAll<HTMLElement>("[data-motion-hero]").forEach((motionHero) => {
    const backgrounds = Array.from(motionHero.querySelectorAll<HTMLElement>("[data-motion-hero-background]"));
    const buttons = Array.from(motionHero.querySelectorAll<HTMLButtonElement>("[data-motion-hero-to]"));
    const title = motionHero.querySelector<HTMLElement>("[data-motion-hero-title]");
    const caption = motionHero.querySelector<HTMLElement>("[data-motion-hero-caption]");
    const status = motionHero.querySelector<HTMLElement>("[data-motion-hero-status]");
    let selected = 0;
    const show = (next: number, focus = false) => {
      selected = (next + buttons.length) % buttons.length;
      backgrounds.forEach((background, index) => background.classList.toggle("active", index === selected));
      buttons.forEach((button, index) => button.setAttribute("aria-current", String(index === selected)));
      if (title) title.textContent = buttons[selected]?.dataset.motionTitle ?? "";
      if (caption) caption.textContent = buttons[selected]?.dataset.motionCaption ?? "";
      if (status) status.textContent = String(selected + 1).padStart(2, "0");
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => show(index)));
    motionHero.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1), true);
    });
    show(0);
  });

  app.querySelectorAll<HTMLElement>("[data-testimonials]").forEach((testimonials) => {
    const cards = Array.from(testimonials.querySelectorAll<HTMLElement>("[data-testimonial-index]"));
    const status = testimonials.querySelector<HTMLElement>(".store-testimonial-status");
    let selected = 0;
    const show = (next: number) => {
      selected = (next + cards.length) % cards.length;
      cards.forEach((card, index) => {
        let offset = index - selected;
        if (offset > cards.length / 2) offset -= cards.length;
        if (offset < -cards.length / 2) offset += cards.length;
        card.style.setProperty("--testimonial-offset", String(offset));
        card.style.zIndex = String(30 - Math.abs(offset));
        card.style.opacity = String(Math.max(.2, 1 - Math.abs(offset) * .16));
        card.setAttribute("aria-hidden", String(index !== selected));
      });
      if (status) status.textContent = `${selected + 1} / ${cards.length}`;
    };
    testimonials.querySelectorAll<HTMLButtonElement>("[data-testimonial-step]").forEach((button) =>
      button.addEventListener("click", () => show(selected + Number(button.dataset.testimonialStep))),
    );
    testimonials.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1));
    });
    show(0);
  });

  app.querySelectorAll<HTMLElement>("[data-portfolio-scroller]").forEach((portfolio) => {
    const buttons = Array.from(portfolio.querySelectorAll<HTMLButtonElement>("[data-portfolio-to]"));
    const panels = Array.from(portfolio.querySelectorAll<HTMLElement>("[data-portfolio-panel]"));
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = 0;
    let visible = true;
    const syncVideos = () => panels.forEach((panel, index) => {
      const video = panel.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      if (index === selected && visible && !reduceMotion) void video.play().catch(() => undefined);
      else video.pause();
    });
    const show = (next: number, focus = false) => {
      selected = (next + panels.length) % panels.length;
      buttons.forEach((button, index) => {
        button.setAttribute("aria-current", String(index === selected));
        button.tabIndex = index === selected ? 0 : -1;
      });
      panels.forEach((panel, index) => {
        const active = index === selected;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
      });
      syncVideos();
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => show(index)));
    portfolio.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      show(selected + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1), true);
    });
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncVideos(); }, { threshold: .2 })
      : null;
    observer?.observe(portfolio);
    show(0);
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      observer?.disconnect();
      panels.forEach((panel) => panel.querySelector<HTMLVideoElement>("video")?.pause());
    };
  });

  app.querySelectorAll<HTMLElement>("[data-space-gallery]").forEach((gallery) => {
    const cards = Array.from(gallery.querySelectorAll<HTMLElement>("[data-space-card]"));
    const status = gallery.querySelector<HTMLElement>("[data-space-status]");
    let selected = 0;
    let pointerStart: number | null = null;
    const show = (next: number) => {
      selected = (next + cards.length) % cards.length;
      cards.forEach((card, index) => {
        let offset = index - selected;
        if (offset > cards.length / 2) offset -= cards.length;
        if (offset < -cards.length / 2) offset += cards.length;
        card.style.setProperty("--space-offset", String(offset));
        card.style.setProperty("--space-depth", String(Math.abs(offset)));
        card.style.zIndex = String(20 - Math.abs(offset));
        card.style.opacity = String(Math.max(.18, 1 - Math.abs(offset) * .22));
        card.setAttribute("aria-hidden", String(index !== selected));
      });
      if (status) status.textContent = `${selected + 1} / ${cards.length}`;
    };
    gallery.querySelectorAll<HTMLButtonElement>("[data-space-step]").forEach((button) =>
      button.addEventListener("click", () => show(selected + Number(button.dataset.spaceStep))),
    );
    gallery.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1));
    });
    gallery.addEventListener("wheel", (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      show(selected + (event.deltaX > 0 ? 1 : -1));
    }, { passive: false });
    gallery.addEventListener("pointerdown", (event) => {
      pointerStart = event.clientX;
      gallery.setPointerCapture(event.pointerId);
    });
    gallery.addEventListener("pointerup", (event) => {
      if (pointerStart === null) return;
      const distance = event.clientX - pointerStart;
      pointerStart = null;
      if (Math.abs(distance) >= 48) show(selected + (distance < 0 ? 1 : -1));
    });
    gallery.addEventListener("pointercancel", () => { pointerStart = null; });
    show(0);
  });

  app.querySelectorAll<HTMLElement>("[data-magnetic-target]").forEach((magnetic) => {
    const link = magnetic.querySelector<HTMLElement>("[data-magnetic-link]");
    if (!link) return;
    const interactivePointer = typeof window.matchMedia === "function"
      && window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
    const reset = () => { link.style.transform = "translate3d(0,0,0)"; };
    const move = (event: PointerEvent) => {
      if (!interactivePointer) return;
      const rect = magnetic.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - .5) * 24;
      const y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - .5) * 24;
      link.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    magnetic.addEventListener("pointermove", move);
    magnetic.addEventListener("pointerleave", reset);
    link.addEventListener("click", (event) => {
      if (link.getAttribute("href") !== "#store-grid") return;
      const target = app.querySelector<HTMLElement>("#store-grid, .store-products");
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: interactivePointer ? "smooth" : "auto", block: "start" });
    });
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      magnetic.removeEventListener("pointermove", move);
      magnetic.removeEventListener("pointerleave", reset);
    };
  });

  const videoPills = Array.from(app.querySelectorAll<HTMLElement>("[data-video-pill]"));
  const circleReveals = Array.from(app.querySelectorAll<HTMLElement>("[data-circle-reveal]"));
  const frameSequences = Array.from(app.querySelectorAll<HTMLElement>("[data-frame-sequence]"));
  const fullChapters = Array.from(app.querySelectorAll<HTMLElement>("[data-full-chapters]"));
  if (videoPills.length || circleReveals.length || frameSequences.length || fullChapters.length) {
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const videoPillClockFormatters = Array.from(
      app.querySelectorAll<HTMLTimeElement>("[data-video-pill-clock]"),
    ).map((clock) => {
      try {
        return {
          clock,
          formatter: new Intl.DateTimeFormat("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            timeZone: clock.dataset.videoPillClock || "UTC",
            hour12: false,
          }),
        };
      } catch {
        return { clock, formatter: null };
      }
    });
    const updateVideoPillClocks = () => {
      const now = new Date();
      videoPillClockFormatters.forEach(({ clock, formatter }) => {
        clock.textContent = formatter?.format(now) || "--:--:--";
      });
    };
    updateVideoPillClocks();
    const videoPillClockTimer = videoPillClockFormatters.length
      ? window.setInterval(updateVideoPillClocks, 1000)
      : 0;
    const videoPillPlaybackListeners = videoPills.flatMap((pill) => {
      const video = pill.querySelector<HTMLVideoElement>("video");
      const media = pill.querySelector<HTMLElement>(".store-video-pill-media");
      if (!video || !media) return [];
      const showVideo = () => media.classList.add("is-video-playing");
      const showPoster = () => media.classList.remove("is-video-playing");
      const showReadyVideo = () => media.classList.add("is-video-ready");
      video.addEventListener("playing", showVideo);
      video.addEventListener("loadeddata", showReadyVideo);
      video.addEventListener("canplay", showReadyVideo);
      video.addEventListener("error", showPoster);
      video.addEventListener("emptied", showPoster);
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) showReadyVideo();
      return [{ video, media, showVideo, showPoster, showReadyVideo }];
    });
    let frame = 0;
    const progressFor = (element: HTMLElement) => {
      const travel = Math.max(element.offsetHeight - window.innerHeight, 1);
      return Math.max(0, Math.min(1, -element.getBoundingClientRect().top / travel));
    };
    const syncVideo = (container: HTMLElement, shouldPlay: boolean) => {
      const video = container.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      const media = video.closest<HTMLElement>(".store-video-pill-media");
      const nextPlaybackState = shouldPlay && !reduceMotion?.matches ? "playing" : "paused";
      if (video.dataset.motionPlayback === nextPlaybackState) return;
      video.dataset.motionPlayback = nextPlaybackState;
      if (nextPlaybackState === "playing") {
        void video.play().then(() => {
          if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) media?.classList.add("is-video-playing");
        }).catch(() => {
          video.dataset.motionPlayback = "paused";
          media?.classList.remove("is-video-playing");
        });
      } else {
        if (!video.paused) video.pause();
        media?.classList.remove("is-video-playing");
      }
    };
    const paint = () => {
      frame = 0;
      videoPills.forEach((pill) => {
        const reduced = Boolean(reduceMotion?.matches);
        const progress = reduced ? 0 : progressFor(pill);
        const media = pill.querySelector<HTMLElement>(".store-video-pill-media");
        const kinetic = pill.querySelector<HTMLElement>(".store-video-pill-kinetic");
        if (media) {
          const remaining = 1 - progress;
          media.style.clipPath = reduced
            ? "inset(8% 5% 8% 5% round 12px)"
            : `inset(${18 * remaining}% ${18 * remaining}% ${18 * remaining}% ${22 * remaining}% round ${12 * remaining}px)`;
          media.style.transform = "";
          media.style.borderRadius = "";
        }
        if (kinetic) {
          kinetic.style.opacity = String(1 - progress);
          kinetic.style.transform = reduced ? "none" : `scale(${1 + progress * .15})`;
        }
        syncVideo(pill, !reduced && progress > .08 && progress < .98);
      });
      circleReveals.forEach((reveal) => {
        const progress = reduceMotion?.matches ? 1 : progressFor(reveal);
        const media = reveal.querySelector<HTMLElement>(".store-circle-reveal-media");
        const copy = reveal.querySelector<HTMLElement>(".store-circle-reveal-copy");
        if (media) media.style.clipPath = `circle(${12 + progress * 138}% at 50% 50%)`;
        if (copy) {
          copy.style.opacity = String(Math.max(0, Math.min(1, (progress - .58) * 2.6)));
          copy.style.transform = `translateY(${(1 - progress) * 20}px)`;
        }
        syncVideo(reveal, progress > .05 && progress < .98);
      });
      frameSequences.forEach((sequence) => {
        const frames = Array.from(sequence.querySelectorAll<HTMLElement>("[data-frame]"));
        const progress = reduceMotion?.matches ? 0 : progressFor(sequence);
        const index = Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)));
        frames.forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === index));
        const image = frames[index];
        const status = sequence.querySelector<HTMLElement>("[data-frame-status]");
        const title = sequence.querySelector<HTMLElement>("[data-frame-title]");
        const body = sequence.querySelector<HTMLElement>("[data-frame-body]");
        if (status) status.textContent = `${String(index + 1).padStart(2, "0")} / ${String(frames.length).padStart(2, "0")}`;
        if (title) title.textContent = image?.dataset.frameTitleValue || `Escena ${index + 1}`;
        if (body) body.textContent = image?.dataset.frameBodyValue || "";
      });
      fullChapters.forEach((chapters) => {
        const backgrounds = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-bg]"));
        const copies = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-copy]"));
        const progress = reduceMotion?.matches ? 0 : progressFor(chapters);
        const index = Math.min(backgrounds.length - 1, Math.round(progress * (backgrounds.length - 1)));
        backgrounds.forEach((background, itemIndex) => {
          background.classList.toggle("active", itemIndex === index);
          syncVideo(background, itemIndex === index && progress < .99);
        });
        copies.forEach((copy, itemIndex) => {
          const active = itemIndex === index;
          copy.classList.toggle("active", active);
          copy.setAttribute("aria-hidden", String(!active));
        });
        const progressBar = chapters.querySelector<HTMLElement>(".store-full-chapter-progress span");
        if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
      });
    };
    const requestPaint = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", requestPaint);
    reduceMotion?.addEventListener("change", requestPaint);
    paint();
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (frame) window.cancelAnimationFrame(frame);
      if (videoPillClockTimer) window.clearInterval(videoPillClockTimer);
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      reduceMotion?.removeEventListener("change", requestPaint);
      [...videoPills, ...circleReveals, ...fullChapters].forEach((container) =>
        container.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()),
      );
      videoPillPlaybackListeners.forEach(({ video, media, showVideo, showPoster, showReadyVideo }) => {
        video.removeEventListener("playing", showVideo);
        video.removeEventListener("loadeddata", showReadyVideo);
        video.removeEventListener("canplay", showReadyVideo);
        video.removeEventListener("error", showPoster);
        video.removeEventListener("emptied", showPoster);
        media.classList.remove("is-video-playing");
        media.classList.remove("is-video-ready");
      });
    };
  }

  app.querySelectorAll<HTMLElement>("[data-scroll-expansion]").forEach((scrollExpansion) => {
    const expansionFigure = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-sticky > figure");
    const expansionBackground = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-background");
    const expansionCopy = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-copy");
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let expansionFrame = 0;
    const paintExpansion = () => {
      expansionFrame = 0;
      const rect = scrollExpansion.getBoundingClientRect();
      const travel = Math.max(scrollExpansion.offsetHeight - window.innerHeight, 1);
      const progress = reduceMotion?.matches ? 1 : Math.max(0, Math.min(1, -rect.top / travel));
      scrollExpansion.style.setProperty("--expansion-progress", String(progress));
      if (expansionFigure) expansionFigure.style.transform = `translate(-50%,-50%) scale(${.34 + progress * .66})`;
      if (expansionBackground) expansionBackground.style.opacity = String(1 - progress);
      if (expansionCopy) {
        expansionCopy.style.opacity = String(progress);
        expansionCopy.style.transform = `translateY(${(1 - progress) * 24}px)`;
      }
    };
    const requestExpansionPaint = () => {
      if (!expansionFrame) expansionFrame = window.requestAnimationFrame(paintExpansion);
    };
    window.addEventListener("scroll", requestExpansionPaint, { passive: true });
    window.addEventListener("resize", requestExpansionPaint);
    reduceMotion?.addEventListener("change", requestExpansionPaint);
    paintExpansion();
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (expansionFrame) window.cancelAnimationFrame(expansionFrame);
      window.removeEventListener("scroll", requestExpansionPaint);
      window.removeEventListener("resize", requestExpansionPaint);
      reduceMotion?.removeEventListener("change", requestExpansionPaint);
    };
  });

  app.querySelectorAll<HTMLElement>("[data-gallery-scroll]").forEach((galleryScroll) => {
    const cells = Array.from(galleryScroll.querySelectorAll<HTMLElement>("[data-gallery-scroll-cell]"));
    const copy = galleryScroll.querySelector<HTMLElement>(".store-gallery-scroll-copy");
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const origins = [
      [-28, -24], [24, -18], [-22, 20], [26, 22], [0, 28],
    ];
    let galleryFrame = 0;
    const paintGallery = () => {
      galleryFrame = 0;
      const rect = galleryScroll.getBoundingClientRect();
      const travel = Math.max(galleryScroll.offsetHeight - window.innerHeight, 1);
      const progress = reduceMotion?.matches ? 1 : Math.max(0, Math.min(1, -rect.top / travel));
      cells.forEach((cell, index) => {
        const [x, y] = origins[index % origins.length];
        const scale = .5 + progress * .5;
        cell.style.transform = `translate(${x * (1 - progress)}%, ${y * (1 - progress)}%) scale(${scale})`;
      });
      if (copy) {
        copy.style.opacity = String(Math.max(0, 1 - progress * 2));
        copy.style.transform = `translate(-50%,-50%) scale(${Math.max(.92, 1 - progress * .08)})`;
      }
    };
    const requestGalleryPaint = () => {
      if (!galleryFrame) galleryFrame = window.requestAnimationFrame(paintGallery);
    };
    window.addEventListener("scroll", requestGalleryPaint, { passive: true });
    window.addEventListener("resize", requestGalleryPaint);
    reduceMotion?.addEventListener("change", requestGalleryPaint);
    paintGallery();
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (galleryFrame) window.cancelAnimationFrame(galleryFrame);
      window.removeEventListener("scroll", requestGalleryPaint);
      window.removeEventListener("resize", requestGalleryPaint);
      reduceMotion?.removeEventListener("change", requestGalleryPaint);
    };
  });

  const storyScroller = app.querySelector<HTMLElement>(".store-story-scroller");
  if (storyScroller) {
    const tabs = Array.from(storyScroller.querySelectorAll<HTMLButtonElement>("[data-story-to]"));
    const panels = Array.from(storyScroller.querySelectorAll<HTMLElement>(".store-story-panel"));
    const reduceStoryMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let storyVisible = false;
    let selectedStory = 0;
    const syncStoryVideo = () => panels.forEach((panel, index) => {
      const video = panel.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      if (index !== selectedStory || !storyVisible || reduceStoryMotion) video.pause();
      else void video.play().catch(() => undefined);
    });
    const showStory = (next: number, focus = false) => {
      const selected = (next + tabs.length) % tabs.length;
      selectedStory = selected;
      tabs.forEach((tab, index) => {
        tab.setAttribute("aria-selected", String(index === selected));
        tab.tabIndex = index === selected ? 0 : -1;
      });
      panels.forEach((panel, index) => {
        const active = index === selected;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
      });
      syncStoryVideo();
      if (focus) tabs[selected]?.focus({ preventScroll: true });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => showStory(index));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        showStory(index + (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1), true);
      });
    });
    const storyObserver = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          storyVisible = entry.isIntersecting && entry.intersectionRatio >= .35;
          syncStoryVideo();
        }, { threshold: [.35] })
      : null;
    storyObserver?.observe(storyScroller);
    showStory(0);
    activeStoreExperienceCleanup = () => {
      storyObserver?.disconnect();
      panels.forEach((panel) => panel.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }

  const motionFlows = Array.from(app.querySelectorAll<HTMLElement>("[data-motion-flow]"));
  const motionZooms = Array.from(app.querySelectorAll<HTMLElement>("[data-motion-zoom]"));
  if (motionFlows.length || motionZooms.length) {
    const flowInners = motionFlows.flatMap((motionFlow) => Array.from(motionFlow.querySelectorAll<HTMLElement>(".store-flow-inner")));
    const zoomLayers = motionZooms.flatMap((motionZoom) => Array.from(motionZoom.querySelectorAll<HTMLElement>("[data-zoom-index]")));
    const zoomScales = [2.2, 2.5, 2.8, 2.5, 2.8, 3, 3.2];
    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frame = 0;
    let settleTimer = 0;
    const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
    const qualityScaleLimit = (layer: HTMLElement, desiredScale: number) => {
      const figure = layer.querySelector<HTMLElement>("figure");
      const image = layer.querySelector<HTMLImageElement>(".store-fidelity-media-source");
      if (!figure || !image?.naturalWidth || !image.naturalHeight || !figure.clientWidth || !figure.clientHeight) return 1;

      // The primary image uses object-fit: contain. This is its base raster scale
      // before the parent zoom is applied; do not magnify beyond the source's
      // device-pixel budget (capped at 2x because higher DPR screens interpolate
      // cleanly without requiring enormous merchant uploads).
      const containedScale = Math.min(figure.clientWidth / image.naturalWidth, figure.clientHeight / image.naturalHeight);
      const targetDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
      const sourceLimitedScale = 1 / Math.max(containedScale * targetDpr, Number.EPSILON);
      return Math.max(1, Math.min(desiredScale, sourceLimitedScale));
    };
    const releaseMotionLayers = () => {
      flowInners.forEach((inner) => (inner.style.willChange = "auto"));
      zoomLayers.forEach((layer) => (layer.style.willChange = "auto"));
      settleTimer = 0;
    };
    const paintMotionDuo = () => {
      frame = 0;
      if (motionQuery?.matches) {
        flowInners.forEach((inner) => (inner.style.transform = "none"));
        zoomLayers.forEach((layer) => (layer.style.transform = "none"));
        releaseMotionLayers();
        return;
      }
      const viewportHeight = Math.max(window.innerHeight, 1);
      flowInners.forEach((inner, index) => {
        if (index === 0) return;
        const section = inner.closest<HTMLElement>(".store-flow-section");
        if (!section) return;
        const progress = clampProgress((viewportHeight - section.getBoundingClientRect().top) / (viewportHeight * .75));
        inner.style.transform = `rotate(${(1 - progress) * 30}deg)`;
      });
      motionZooms.forEach((motionZoom) => {
        const zoomRect = motionZoom.getBoundingClientRect();
        const zoomDistance = Math.max(motionZoom.offsetHeight - viewportHeight, 1);
        const zoomProgress = clampProgress(-zoomRect.top / zoomDistance);
        Array.from(motionZoom.querySelectorAll<HTMLElement>("[data-zoom-index]")).forEach((layer, index) => {
          const desiredScale = zoomScales[index % zoomScales.length];
          const maxScale = qualityScaleLimit(layer, desiredScale);
          const scale = 1 + (maxScale - 1) * zoomProgress;
          layer.style.transform = `scale(${scale})`;
        });
      });
    };
    const requestMotionPaint = () => {
      flowInners.forEach((inner) => (inner.style.willChange = "transform"));
      zoomLayers.forEach((layer) => (layer.style.willChange = "transform"));
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(releaseMotionLayers, 180);
      if (!frame) frame = window.requestAnimationFrame(paintMotionDuo);
    };
    const zoomImages = zoomLayers
      .map((layer) => layer.querySelector<HTMLImageElement>(".store-fidelity-media-source"))
      .filter((image): image is HTMLImageElement => !!image);
    zoomImages.forEach((image) => image.addEventListener("load", requestMotionPaint));
    window.addEventListener("scroll", requestMotionPaint, { passive: true });
    window.addEventListener("resize", requestMotionPaint);
    motionQuery?.addEventListener("change", requestMotionPaint);
    paintMotionDuo();
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("scroll", requestMotionPaint);
      window.removeEventListener("resize", requestMotionPaint);
      motionQuery?.removeEventListener("change", requestMotionPaint);
      zoomImages.forEach((image) => image.removeEventListener("load", requestMotionPaint));
      motionFlows.forEach((motionFlow) => motionFlow.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()));
    };
  }

  const searchInput = app.querySelector<HTMLInputElement>("#store-search");
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderStoreGrid(slug, store, currency);
  });

  const sortSelect = app.querySelector<HTMLSelectElement>("#store-sort");
  if (sortSelect) {
    // Restore the previous choice — renderStore() fully re-renders the shell,
    // and the sort shouldn't silently reset when that happens.
    sortSelect.value = sortMode;
    sortSelect.addEventListener("change", () => {
      sortMode = sortSelect.value as typeof sortMode;
      renderStoreGrid(slug, store, currency);
    });
  }

  const moveToCatalogLayer = (nextCategoryId: string, targetSelector: string, destination: string) => {
    const updateHistory = nextCategoryId === "ALL" ? window.history.replaceState.bind(window.history) : window.history.pushState.bind(window.history);
    updateHistory(
      { pagosyaView: nextCategoryId === "ALL" ? "catalog" : "category", categoryId: nextCategoryId === "ALL" ? null : nextCategoryId },
      "",
      destination,
    );
    selectedCategoryId = nextCategoryId;
    searchQuery = "";
    renderStore(slug, store, { focusPromotion: false });
    window.requestAnimationFrame(() => {
      const target = app.querySelector<HTMLElement>(targetSelector);
      target?.focus({ preventScroll: true });
      const prefersReducedMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (typeof target?.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      }
    });
  };

  app.querySelectorAll<HTMLAnchorElement>("[data-catalog-section]").forEach((sectionLink) => {
    sectionLink.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      moveToCatalogLayer(sectionLink.dataset.catalogSection!, "#store-catalog-browser", sectionLink.href);
    });
  });
  app.querySelector<HTMLAnchorElement>(".catalog-section-back")?.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    moveToCatalogLayer("ALL", ".catalog-section-picker", (event.currentTarget as HTMLAnchorElement).href);
  });

  bindCartCheckout(slug, store);
  bindInternalStoreLinks(slug, store);

  renderStoreGrid(slug, store, currency);
  annotateStorePreviewEditor(store);
  hasStoreAnimatedIn = true;
  if (storePreviewMode && !previewReadyAnnounced) {
    previewReadyAnnounced = true;
    postToParent("CHECKOUT_READY", { mode: "store-preview" });
  }
}

// The editor iframe is opt-in and visual-only: a normal customer storefront
// never listens for parent-window customization. Checking event.source keeps
// unrelated tabs/windows from driving the preview even when they know its URL.
if (storePreviewMode) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !activePreviewStore) return;
    if (!event.data || event.data.type !== "PAGOSYA_STORE_PREVIEW") return;
    const patch = sanitizeStorePreviewPatch(event.data.patch);
    if (!patch) return;
    storePreviewEditorEnabled = event.data.editorMode !== false;
    let previewStore = { ...activePreviewStore.store, ...patch };
    const previewProduct = sanitizeStorePreviewProduct(event.data.previewProduct, previewStore);
    if (previewProduct) {
      previewStore = {
        ...previewStore,
        items: previewStore.items.map((item) => item.id === previewProduct.id ? previewProduct : item),
      };
    }
    const existingCart = document.querySelector<HTMLDialogElement>(".cart-review-dialog.is-preview-open");
    const requestedAction = String(event.data.previewAction || "scroll");
    const previewAction = ["cart", "product", "motion", "hero-item", "editorial-item"].includes(requestedAction) ? requestedAction : "scroll";
    if (previewAction !== "cart") document.querySelector(".cart-review-dialog")?.remove();
    if (previewAction === "product" && previewProduct) {
      renderProductPage(activePreviewStore.slug, previewStore, previewProduct.id);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return;
    }
    renderStoreRoute(activePreviewStore.slug, previewStore, { focusPromotion: false });
    const previewSection = STORE_PREVIEW_SECTIONS.includes(event.data.previewSection)
      ? event.data.previewSection as StorePreviewSection
      : typeof event.data.previewSection === "string" && /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(event.data.previewSection)
        ? event.data.previewSection as `animation-${string}`
        : null;
    if (previewAction === "cart") {
      if (existingCart?.isConnected) renderCartReviewDialog(existingCart, activePreviewStore.slug, previewStore);
      else openCartReview(activePreviewStore.slug, previewStore, { preview: true, allowEmpty: true });
    } else if (previewAction === "motion") {
      if (previewSection?.startsWith("animation-")) scrollStorePreviewToSection(previewSection);
      else scrollStorePreviewToMotion();
    } else if (previewAction === "hero-item" && Number.isInteger(event.data.previewTargetIndex)) {
      scrollStorePreviewToHeroItem(Math.max(0, event.data.previewTargetIndex));
    } else if (previewAction === "editorial-item" && Number.isInteger(event.data.previewTargetIndex)) {
      scrollStorePreviewToEditorialItem(Math.max(0, event.data.previewTargetIndex), event.data.previewTargetKind === "media" ? "media" : "text");
    } else if (previewSection) scrollStorePreviewToSection(previewSection);
  });
}

/**
 * Renders just the product grid + cart bar total — split out from
 * renderStore() so typing in the search box or clicking a category chip
 * never touches (and so never loses focus/scroll on) the surrounding
 * toolbar, header, or cart bar shell.
 */
function renderStoreGrid(slug: string, store: Store, currency: string): void {
  const grid = app.querySelector<HTMLElement>("#store-grid");
  if (!grid) return;

  const byCategory = new Map<string | null, StoreItem[]>();
  for (const item of store.items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  const query = searchQuery.trim().toLowerCase();
  const sections = (
    store.categories.length === 0
      ? [{ id: "ALL", name: null as string | null, items: store.items }]
      : [
          ...store.categories.map((c) => ({ id: c.id, name: c.name, items: byCategory.get(c.id) ?? [] })),
          ...(byCategory.get(null)?.length ? [{ id: "null", name: "Otros", items: byCategory.get(null)! }] : []),
        ]
  )
    .filter((section) => selectedCategoryId === "ALL" || section.id === selectedCategoryId)
    .map((section) => ({ ...section, items: sortStoreItems(section.items.filter((item) => itemMatchesSearch(item, query))) }))
    .filter((section) => section.items.length > 0);

  if (sections.length === 0) {
    grid.innerHTML = `<div class="status empty">${
      store.items.length === 0
        ? "Tu catálogo está listo para recibir su primer producto."
        : "No encontramos productos que coincidan con tu búsqueda."
    }</div>`;
  } else {
    // A single running index across every section, not per-section, so the
    // stagger delay flows naturally down the whole page top-to-bottom.
    let cardIndex = 0;
    grid.innerHTML = sections
      .map(
        (section) => `
          ${section.name && selectedCategoryId === "ALL" ? `<div class="category-section-title">${escapeHtml(section.name)}</div>` : ""}
          <div class="store-items">${section.items.map((item) => renderProductCard(slug, item, cardIndex++, store.showLowStockToCustomers === true)).join("")}</div>`,
      )
      .join("");
  }

  grid.querySelectorAll<HTMLElement>(".gallery-thumb-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest(".store-item")!;
      const img = card.querySelector<HTMLImageElement>(".store-item-image")!;
      // Quick crossfade instead of an instant src swap — the image element
      // is reused (not re-rendered), so a plain opacity transition on it is
      // enough for a smooth transition without any animation library.
      img.style.opacity = "0";
      setTimeout(() => {
        img.setAttribute("src", btn.dataset.src!);
        img.style.objectPosition = btn.dataset.position || "50% 50%";
        img.style.opacity = "1";
      }, 130);
      card.querySelectorAll(".gallery-thumb-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  grid.querySelectorAll<HTMLButtonElement>(".product-gallery-arrow").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest<HTMLElement>(".store-item")!;
      const dots = Array.from(card.querySelectorAll<HTMLElement>(".gallery-thumb-btn"));
      const activeIndex = Math.max(0, dots.findIndex((dot) => dot.classList.contains("active")));
      const nextIndex = (activeIndex + Number(button.dataset.galleryStep) + dots.length) % dots.length;
      dots[nextIndex]?.click();
      button.focus();
    });
  });

  grid.querySelectorAll<HTMLElement>(".store-item").forEach((row) => {
    const id = row.dataset.id!;
    const item = store.items.find((i) => i.id === id)!;
    row.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("a, button, select, input, label")) return;
      navigateWithinStore(slug, store, id);
    });
    row.querySelector<HTMLSelectElement>(".variant-select")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value) selectedVariantByItem.set(id, value);
      else selectedVariantByItem.delete(id);
      renderStoreGrid(slug, store, currency);
    });
    row.querySelectorAll<HTMLInputElement>(".extra-toggle").forEach((input) => input.addEventListener("change", () => {
      const selected = new Set(selectedExtraIdsByItem.get(id) ?? []);
      if (input.checked) selected.add(input.dataset.extraId!);
      else selected.delete(input.dataset.extraId!);
      selectedExtraIdsByItem.set(id, selected);
      renderStoreGrid(slug, store, currency);
    }));
    row.querySelector(".qty-plus")?.addEventListener("click", () => {
      if (!productConfigurationComplete(item)) return;
      const selectedVariant = selectedVariantFor(item);
      if (remainingStock(item, selectedVariant) === 0) return;
      const extras = selectedExtrasFor(item);
      const key = cartItemKey(id, selectedVariant?.id, extras.map((extra) => extra.id));
      const available = optionStock(item, selectedVariant);
      if (available !== null && optionCartQuantity(id, selectedVariant?.id) >= available) return;
      cart.set(key, (cart.get(key) ?? 0) + 1);
      saveCart(store);
      renderStoreGrid(slug, store, currency);
      updateCartBar(store, currency);
    });
    row.querySelector(".qty-minus")?.addEventListener("click", () => {
      const key = cartItemKey(id, selectedVariantFor(item)?.id, selectedExtrasFor(item).map((extra) => extra.id));
      const next = (cart.get(key) ?? 0) - 1;
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
      saveCart(store);
      renderStoreGrid(slug, store, currency);
      updateCartBar(store, currency);
    });
  });

  bindInternalStoreLinks(slug, store);

  updateCartBar(store, currency);
  annotateStorePreviewEditor(store);
}

function updateCartBar(store: Store, currency: string): void {
  const summary = app.querySelector<HTMLElement>(".cart-summary");
  const payButton = app.querySelector<HTMLButtonElement>("#cart-pay");
  if (summary) {
    summary.textContent = `${cartCount()} ${cartCount() === 1 ? "producto" : "productos"} - ${formatAmount(cartTotal(store.items), currency)}`;
  }
  if (payButton) {
    payButton.disabled = cartCount() === 0;
    payButton.textContent = store.cartButtonLabel && store.cartButtonLabel !== "Ir a pagar"
      ? store.cartButtonLabel
      : `Ver carrito · ${cartCount()}`;
  }
  const cartBar = app.querySelector<HTMLElement>(".cart-bar");
  if (cartBar) cartBar.hidden = cartCount() === 0;
  const headerCart = app.querySelector<HTMLButtonElement>(".store-header-cart");
  const headerCount = headerCart?.querySelector<HTMLElement>(".store-header-cart-count");
  const count = cartCount();
  if (headerCart) {
    headerCart.disabled = count === 0;
    headerCart.setAttribute("aria-label", `Abrir carrito, ${count} ${count === 1 ? "producto" : "productos"}`);
  }
  if (headerCount) {
    headerCount.textContent = String(count);
    headerCount.hidden = count === 0;
  }
}

function renderForm(session: CheckoutSession, clientSecret: string) {
  const tokens = TEST_TOKENS[selectedType];
  const storeCheckout = isStoreCheckout(session);
  const recipient = checkoutRecipientDetails(session);

  const headerHtml = linkHeader
    ? `
      <div class="merchant-header">${escapeHtml(linkHeader.storeName)}</div>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${escapeHtml(linkHeader.description)}</div>
    `
    : `
      <div class="merchant-row">
        <div class="merchant-avatar">${escapeHtml(initials(session.merchantName))}</div>
        <div class="merchant-name">${escapeHtml(session.merchantName)}</div>
      </div>
      <div class="amount">${formatAmount(session.amount, session.currency)}</div>
      <div class="description">${session.description ? escapeHtml(session.description) : "Pago a comercio"}</div>
    `;

  const fieldError = (id: keyof typeof contactFieldErrors) =>
    contactFieldErrors[id] ? `<div class="field-error" id="${id}Error">${escapeHtml(contactFieldErrors[id]!)}</div>` : `<div class="field-error" id="${id}Error"></div>`;
  const invalid = (id: keyof typeof contactFieldErrors) => (contactFieldErrors[id] ? ' aria-invalid="true"' : "");

  app.innerHTML = `
    <div class="payment-summary-panel">${headerHtml}</div>
    <div class="payment-form-panel"><form id="payment-form" novalidate>
      ${storeCheckout
        ? `<div class="field">
            <label for="customerName">Nombre completo</label>
            <input id="customerName" type="text" autocomplete="name" placeholder="Nombre y apellido" value="${escapeHtml(customerContact.name)}" aria-describedby="customerNameError"${invalid("customerName")} />
            ${fieldError("customerName")}
          </div>
          <div class="field">
            <label for="customerEmail">Correo electrónico</label>
            <input id="customerEmail" type="email" autocomplete="email" placeholder="tu@gmail.com" value="${escapeHtml(customerContact.email)}" aria-describedby="customerEmailError"${invalid("customerEmail")} />
            ${fieldError("customerEmail")}
          </div>
          <div class="field">
            <label for="customerPhone">Teléfono de contacto</label>
            <input id="customerPhone" type="tel" autocomplete="tel" placeholder="+591 700 00000" value="${escapeHtml(customerContact.phone)}" aria-describedby="customerPhoneError" enterkeyhint="done"${invalid("customerPhone")} />
            ${fieldError("customerPhone")}
            <div class="hint">El comercio usará estos datos para contactarte sobre tu pedido.</div>
          </div>
          <section class="delivery-request${customerContact.deliveryRequested ? " is-open" : ""}" aria-labelledby="delivery-request-title">
        <label class="delivery-request-toggle" for="deliveryRequested">
          <span class="delivery-request-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
          <span><strong id="delivery-request-title">Quiero solicitar entrega</strong><small>Comparte una dirección y, si quieres, tu ubicación actual.</small></span>
          <input id="deliveryRequested" type="checkbox" ${customerContact.deliveryRequested ? "checked" : ""}>
        </label>
        <div class="delivery-request-fields" ${customerContact.deliveryRequested ? "" : "hidden"}>
          <div class="field">
            <label for="deliveryAddress">Dirección o referencia</label>
            <textarea id="deliveryAddress" rows="2" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia" aria-describedby="deliveryAddressError"${invalid("deliveryAddress")}>${escapeHtml(customerContact.deliveryAddress || "")}</textarea>
            ${fieldError("deliveryAddress")}
          </div>
          <button class="location-capture" id="captureLocation" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg>
            <span>${customerContact.customerLatitude !== undefined ? "Actualizar ubicación actual" : "Usar mi ubicación actual"}</span>
          </button>
          <p class="location-status" id="locationStatus" role="status" aria-live="polite">${customerContact.customerLatitude !== undefined && customerContact.customerLongitude !== undefined ? `Ubicación guardada con precisión aproximada de ${Math.round(customerContact.customerLocationAccuracy || 0)} m.` : "Solo la pediremos cuando pulses el botón. Puedes continuar escribiendo únicamente la dirección."}</p>
        </div>
      </section>`
        : `<div class="direct-charge-context" aria-label="Datos del cobro">
            ${recipient?.name ? `<div><span>Destinatario</span><strong>${escapeHtml(recipient.name)}</strong></div>` : ""}
            ${recipient?.document ? `<div><span>Carnet / CI</span><strong>${escapeHtml(recipient.document)}</strong></div>` : ""}
            <p>${recipient?.name ? "El comercio ya completó tus datos." : "El comercio ya preparó este cobro."} Solo elige cómo pagar.</p>
          </div>`}
      <div class="tabs">
        ${Object.values(PaymentMethodType)
          .map(
            (type) =>
              `<button type="button" class="tab ${type === selectedType ? "active" : ""}" data-type="${type}">${TAB_ICONS[type]}<span>${TAB_LABELS[type]}</span></button>`,
          )
          .join("")}
      </div>
      ${
        import.meta.env.DEV
          ? `<div class="field">
              <label for="token">Token de prueba (modo test)</label>
              <select id="token">
                ${tokens.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
              </select>
              <div class="hint">En producción este campo lo reemplaza el rail real (tokenización de tarjeta, deep link Tigo Money, etc).</div>
            </div>`
          : ""
      }
      <button class="primary" type="submit" id="pay">Pagar ${formatAmount(session.amount, session.currency)}</button>
      <button class="secondary" type="button" id="cancel">Cancelar pago</button>
    </form></div>
    <div class="secure-note payment-secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;

  const nameInput = app.querySelector<HTMLInputElement>("#customerName");
  const emailInput = app.querySelector<HTMLInputElement>("#customerEmail");
  const phoneInput = app.querySelector<HTMLInputElement>("#customerPhone");
  const deliveryToggle = app.querySelector<HTMLInputElement>("#deliveryRequested");
  const addressInput = app.querySelector<HTMLTextAreaElement>("#deliveryAddress");
  nameInput?.addEventListener("input", () => (customerContact.name = nameInput.value));
  emailInput?.addEventListener("input", () => (customerContact.email = emailInput.value));
  phoneInput?.addEventListener("input", () => (customerContact.phone = phoneInput.value));
  deliveryToggle?.addEventListener("change", () => {
    customerContact.deliveryRequested = deliveryToggle.checked;
    contactFieldErrors.deliveryAddress = undefined;
    renderForm(session, clientSecret);
    if (deliveryToggle.checked) requestAnimationFrame(() => app.querySelector<HTMLTextAreaElement>("#deliveryAddress")?.focus());
  });
  addressInput?.addEventListener("input", () => (customerContact.deliveryAddress = addressInput.value));
  app.querySelector<HTMLButtonElement>("#captureLocation")?.addEventListener("click", () => {
    const button = app.querySelector<HTMLButtonElement>("#captureLocation")!;
    const status = app.querySelector<HTMLElement>("#locationStatus")!;
    if (!navigator.geolocation) {
      status.textContent = "Este dispositivo no permite compartir ubicación. Escribe la dirección y una referencia.";
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.querySelector("span")!.textContent = "Buscando ubicación…";
    status.textContent = "Tu navegador puede pedir permiso. pagosYa solo guardará esta ubicación con el pedido.";
    navigator.geolocation.getCurrentPosition((position) => {
      customerContact.customerLatitude = Number(position.coords.latitude.toFixed(7));
      customerContact.customerLongitude = Number(position.coords.longitude.toFixed(7));
      customerContact.customerLocationAccuracy = Math.round(position.coords.accuracy);
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span")!.textContent = "Ubicación actual guardada";
      status.textContent = `Ubicación capturada con precisión aproximada de ${customerContact.customerLocationAccuracy} m. Puedes actualizarla antes de pagar.`;
    }, (error) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.querySelector("span")!.textContent = "Intentar compartir ubicación otra vez";
      status.textContent = error.code === error.PERMISSION_DENIED
        ? "No diste permiso para usar tu ubicación. Puedes continuar escribiendo la dirección."
        : "No pudimos obtener una ubicación precisa. Revisa la señal o escribe la dirección.";
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  });

  app.querySelectorAll<HTMLElement>(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      selectedType = tab.dataset.type as PaymentMethodType;
      renderForm(session, clientSecret);
    });
  });

  app.querySelector<HTMLFormElement>("#payment-form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    contactFieldErrors.customerName = undefined;
    contactFieldErrors.customerEmail = undefined;
    contactFieldErrors.customerPhone = undefined;
    contactFieldErrors.deliveryAddress = undefined;

    const name = customerContact.name.trim();
    const email = customerContact.email.trim();
    const phone = customerContact.phone.trim();
    if (storeCheckout && !name) contactFieldErrors.customerName = "Ingresa tu nombre completo.";
    if (storeCheckout && !email) contactFieldErrors.customerEmail = "Ingresa tu correo electrónico.";
    else if (storeCheckout && !EMAIL_PATTERN.test(email)) contactFieldErrors.customerEmail = "Ingresa un correo electrónico válido.";
    if (storeCheckout && !phone) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto.";
    else if (storeCheckout && !PHONE_PATTERN.test(phone)) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto válido.";
    if (storeCheckout && customerContact.deliveryRequested && !(customerContact.deliveryAddress || "").trim()) contactFieldErrors.deliveryAddress = "Escribe la dirección o una referencia para la entrega.";

    if (contactFieldErrors.customerName || contactFieldErrors.customerEmail || contactFieldErrors.customerPhone || contactFieldErrors.deliveryAddress) {
      renderForm(session, clientSecret);
      return;
    }

    const tokenEl = app.querySelector<HTMLSelectElement>("#token");
    const token = tokenEl ? tokenEl.value : TEST_TOKENS[selectedType][0].value;
    await submitPayment(session, clientSecret, token, {
      name: storeCheckout ? name : recipient?.name ?? "",
      document: storeCheckout ? customerContact.document : recipient?.document ?? undefined,
      email: storeCheckout ? email : recipient?.email ?? "",
      phone: storeCheckout ? phone : recipient?.phone ?? "",
      ...(storeCheckout && customerContact.deliveryRequested ? {
        deliveryRequested: true,
        deliveryAddress: (customerContact.deliveryAddress || "").trim(),
        ...(customerContact.customerLatitude !== undefined && customerContact.customerLongitude !== undefined ? {
          customerLatitude: customerContact.customerLatitude,
          customerLongitude: customerContact.customerLongitude,
          customerLocationAccuracy: customerContact.customerLocationAccuracy,
        } : {}),
      } : {}),
    });
  });

  app.querySelector<HTMLButtonElement>("#cancel")!.addEventListener("click", () => cancelPayment(clientSecret));
}

async function cancelPayment(clientSecret: string) {
  const payButton = app.querySelector<HTMLButtonElement>("#pay");
  const cancelButton = app.querySelector<HTMLButtonElement>("#cancel");
  if (payButton) payButton.disabled = true;
  if (cancelButton) {
    cancelButton.disabled = true;
    cancelButton.textContent = "Cancelando...";
  }

  try {
    const intent = await cancelPaymentIntent(clientSecret);
    app.innerHTML = `
      <div class="payment-outcome-panel">
        <div class="status failed">${ICON_X}<span>Pago cancelado</span></div>
        ${contactBlockHtml("¿Necesitas ayuda?")}
        ${backToStoreHtml()}
      </div>
    `;
    postToParent("PAYMENT_CANCELED", { paymentIntentId: intent.id });
  } catch (err) {
    // The intent may have already moved past a cancelable state (e.g. a
    // confirm that was in flight completed first) — re-fetch and show what
    // actually happened instead of a misleading "canceled" screen.
    try {
      const session = await fetchSession(clientSecret, checkoutPublishableKey);
      if (session.status === "SUCCEEDED") renderSuccess(session);
      else renderFailed(session.id, (err as Error).message);
    } catch {
      renderFailed("", (err as Error).message);
    }
  }
}

async function submitPayment(session: CheckoutSession, clientSecret: string, token: string, customer: CustomerContact) {
  const payButton = app.querySelector<HTMLButtonElement>("#pay");
  if (payButton) {
    payButton.disabled = true;
    payButton.textContent = "Procesando...";
  }
  postToParent("PAYMENT_PROCESSING", { paymentIntentId: session.id });

  try {
    const { paymentIntent, railResult } = await confirmPaymentIntent(
      session.id,
      clientSecret,
      { type: selectedType, token },
      customer,
    );

    if (paymentIntent.status === "SUCCEEDED") {
      renderSuccess(paymentIntent);
    } else if (paymentIntent.status === "REQUIRES_ACTION") {
      renderRequiresAction(paymentIntent.id, clientSecret, paymentIntent.railId ?? "", railResult.actionRequired);
    } else {
      renderFailed(paymentIntent.id, railResult.failureReason ?? "Pago rechazado");
    }
  } catch (err) {
    renderFailed(session.id, (err as Error).message);
  }
}

interface CartLine {
  paymentLinkId: string;
  name: string;
  variantName?: string;
  quantity: number;
  unitAmount: number;
}

// Accepts either a confirmed PaymentIntent or a re-fetched CheckoutSession —
// both carry the same id/amount/currency/metadata shape the receipt needs.
interface OrderSummary {
  id: string;
  amount: number;
  currency: string;
  metadata: Record<string, unknown> | null;
  customerName?: string | null;
  customerEmail?: string | null;
  recipient?: CheckoutRecipient | null;
}

interface CheckoutRecipient {
  name: string | null;
  document: string | null;
  email: string | null;
  phone: string | null;
}

function isStoreCheckout(order: Pick<OrderSummary, "metadata">): boolean {
  return Array.isArray(order.metadata?.cart);
}

function checkoutRecipientDetails(order: Pick<CheckoutSession, "metadata" | "recipient">): CheckoutRecipient | null {
  if (order.recipient) return order.recipient;
  const value = order.metadata?.debt;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const debt = value as Record<string, unknown>;
  if (typeof debt.customerName !== "string") return null;
  return {
    name: debt.customerName,
    document: typeof debt.customerDocument === "string" ? debt.customerDocument : null,
    email: typeof debt.customerEmail === "string" ? debt.customerEmail : null,
    phone: typeof debt.customerPhone === "string" ? debt.customerPhone : null,
  };
}

// wa.me only accepts digits (with country code, no "+" or separators) —
// strip everything else out of whatever format the merchant typed in.
function whatsAppLink(phone: string): string {
  return `https://wa.me/${phone.replace(/[^0-9]/g, "")}`;
}

// Shared by the success receipt and the failure/cancellation screens — a
// customer who couldn't complete payment needs the same support path as one
// who did, not less of one.
function contactBlockHtml(prompt: string): string {
  if (!linkHeader?.contactPhone && !linkHeader?.contactEmail) return "";
  return `<div class="receipt-contact">
      <span>${escapeHtml(prompt)}</span>
      ${linkHeader.contactPhone ? `<a href="${escapeHtml(whatsAppLink(linkHeader.contactPhone))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
      ${linkHeader.contactEmail ? `<a href="mailto:${escapeHtml(linkHeader.contactEmail)}">${escapeHtml(linkHeader.contactEmail)}</a>` : ""}
    </div>`;
}

// The cart is already cleared by the time a customer reaches a payment
// result, so this gives every outcome a fresh route back to the same store.
function backToStoreHtml(): string {
  if (currentDebtSlug) {
    return `<a class="back-to-store" href="/?debt=${encodeURIComponent(currentDebtSlug)}">Volver al cobro</a>`;
  }
  if (!currentStoreSlug) return "";
  return `<a class="back-to-store" href="${escapeHtml(storeCatalogUrl(currentStoreSlug))}">Volver a la tienda</a>`;
}

function renderSuccess(order: OrderSummary) {
  document.body.classList.add("payment-page", "payment-success-page");
  const cart = Array.isArray(order.metadata?.cart) ? order.metadata.cart as CartLine[] : null;
  const storeCheckout = Boolean(cart);
  const subscription = order.metadata?.subscription && typeof order.metadata.subscription === "object" && !Array.isArray(order.metadata.subscription) ? order.metadata.subscription as Record<string, unknown> : null;
  const appointment = order.metadata?.appointment && typeof order.metadata.appointment === "object" && !Array.isArray(order.metadata.appointment) ? order.metadata.appointment as Record<string, unknown> : null;
  const recipientName = order.recipient?.name || order.customerName || (typeof subscription?.customerName === "string" ? subscription.customerName : null);
  const periodValue = typeof subscription?.periodStart === "string" ? subscription.periodStart : typeof appointment?.startsAt === "string" ? appointment.startsAt : null;
  const periodLabel = appointment ? "Fecha de la cita" : subscription ? "Período cubierto" : null;
  const periodText = periodValue ? new Intl.DateTimeFormat("es-BO", { timeZone: "America/La_Paz", dateStyle: "long", ...(appointment ? { timeStyle: "short" } : {}) }).format(new Date(periodValue)) : null;

  const linesHtml = cart
    ? cart
        .map(
          (line) => `
        <div class="receipt-line">
          <span>${escapeHtml(line.name)}${line.variantName ? ` · ${escapeHtml(line.variantName)}` : ""} <span class="receipt-qty">x${line.quantity}</span></span>
          <span>${formatAmount(line.unitAmount * line.quantity, order.currency)}</span>
        </div>`,
        )
        .join("")
    : `
      <div class="receipt-line">
        <span>${linkHeader ? escapeHtml(linkHeader.description) : "Pago"}</span>
        <span>${formatAmount(order.amount, order.currency)}</span>
      </div>`;

  app.innerHTML = `
    <div class="payment-success-panel">
      <div class="status success">${ICON_CHECK}<span>${storeCheckout ? "Pedido recibido" : "Pago confirmado"}</span></div>
      <div class="receipt">
      <div class="receipt-row">
        <span class="muted-label">${storeCheckout ? "N° de orden" : "N° de pago"}</span>
        <code>${escapeHtml(order.id)}</code>
      </div>
      <div class="receipt-items">${linesHtml}</div>
      ${recipientName ? `<div class="receipt-row"><span class="muted-label">Destinatario</span><strong>${escapeHtml(recipientName)}</strong></div>` : ""}
      ${periodLabel && periodText ? `<div class="receipt-row"><span class="muted-label">${periodLabel}</span><strong>${escapeHtml(periodText)}</strong></div>` : ""}
      <div class="receipt-row receipt-subtotal">
        <span>${storeCheckout ? "Subtotal" : "Total"}</span>
        <strong>${formatAmount(order.amount, order.currency)}</strong>
      </div>
      ${contactBlockHtml("¿Dudas o necesitas un reembolso?")}
      </div>
      <button class="secondary receipt-download" type="button">Descargar comprobante</button>
      ${activeOrderTrackingToken ? `<a class="tracking-success-link" href="/track/${encodeURIComponent(activeOrderTrackingToken)}">${ICON_CLOCK}<span><strong>Seguir mi pedido</strong><small>Consulta preparación, entrega o recojo sin crear una cuenta</small></span>${ICON_ARROW_RIGHT}</a>` : ""}
      ${backToStoreHtml()}
    </div>
  `;
  app.querySelector<HTMLButtonElement>(".receipt-download")?.addEventListener("click", () => {
    const receipt = [
      "pagosYa · Comprobante de pago",
      `Estado: Pago confirmado`,
      `${storeCheckout ? "Orden" : "Pago"}: ${order.id}`,
      `Comercio: ${linkHeader?.storeName || "Comercio"}`,
      recipientName ? `Destinatario: ${recipientName}` : "",
      appointment && typeof appointment.offeringName === "string" ? `Servicio: ${appointment.offeringName}` : linkHeader?.description ? `Concepto: ${linkHeader.description}` : "",
      periodLabel && periodText ? `${periodLabel}: ${periodText}` : "",
      `Total: ${formatAmount(order.amount, order.currency)}`,
    ].filter(Boolean).join("\n");
    const url = URL.createObjectURL(new Blob([receipt], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `comprobante-${order.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  });
  launchPaymentBird(order.id);
  postToParent("PAYMENT_SUCCEEDED", { paymentIntentId: order.id, status: "succeeded" });
}

const celebratedPaymentIntentIds = new Set<string>();

function launchPaymentBird(paymentIntentId: string): void {
  if (celebratedPaymentIntentIds.has(paymentIntentId)) return;
  celebratedPaymentIntentIds.add(paymentIntentId);

  const celebration = document.createElement("div");
  celebration.className = "payment-success-overlay";
  celebration.setAttribute("role", "status");
  celebration.setAttribute("aria-live", "polite");
  celebration.setAttribute("aria-atomic", "true");
  celebration.innerHTML = `
    <div class="payment-success-celebration">
      <div class="payment-success-bird-stage" aria-hidden="true">
        <div class="payment-success-bird-crop">
          <img src="/logo-mark.png" alt="">
        </div>
        <div class="payment-success-particles">
          <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
        </div>
      </div>
      <div class="payment-success-confirmation">
        <span class="payment-success-check" aria-hidden="true">${ICON_CHECK}</span>
        <strong>Payment Successful!</strong>
      </div>
    </div>
  `;

  document.documentElement.classList.add("payment-success-overlay-open");
  document.body.classList.add("payment-success-overlay-open");
  document.body.appendChild(celebration);

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    celebration.remove();
    if (!document.querySelector(".payment-success-overlay")) {
      document.documentElement.classList.remove("payment-success-overlay-open");
      document.body.classList.remove("payment-success-overlay-open");
    }
  };
  celebration.addEventListener("animationend", (event) => {
    if (event.target === celebration) finish();
  });
  window.setTimeout(finish, 2100);
}

function renderFailed(paymentIntentId: string, message: string) {
  app.innerHTML = `
    <div class="payment-outcome-panel">
      <div class="status failed">${ICON_X}<span>Pago fallido: ${escapeHtml(message)}</span></div>
      ${contactBlockHtml("¿Necesitas ayuda?")}
      ${backToStoreHtml()}
    </div>
  `;
  postToParent("PAYMENT_FAILED", { paymentIntentId, error: { message } });
}

function renderRequiresAction(paymentIntentId: string, clientSecret: string, railId: string, actionRequired: unknown) {
  const action = actionRequired as { type: string; data: Record<string, string> } | undefined;
  // Real bank QR (e.g. Baneco) returns a ready-to-scan PNG; the mock rail only has a raw
  // EMV-ish payload string to render as text — support both without the adapter caring.
  const qrImageHtml =
    action?.type === "qr_display" && action.data.qrImageBase64
      ? `<img class="qr-image" alt="Código QR" src="data:image/png;base64,${action.data.qrImageBase64}" />`
      : "";
  const message =
    action?.type === "ussd_prompt"
      ? action.data.message
      : action?.type === "qr_display"
        ? qrImageHtml
          ? "Escanee el código QR con su app bancaria"
          : `Escanee el código QR: ${action.data.qrPayload}`
        : action?.type === "redirect"
          ? `Confirme en: ${action.data.redirectUrl}`
          : "Esperando confirmación...";

  app.innerHTML = `
    <div class="payment-outcome-panel payment-action-panel">
      <div class="status action">${ICON_CLOCK}<span>${message}</span></div>
      ${qrImageHtml}
      ${import.meta.env.DEV ? `<button class="secondary" id="simulate">[dev] Simular confirmación exitosa</button>` : ""}
    </div>
  `;

  if (import.meta.env.DEV) {
    app.querySelector<HTMLButtonElement>("#simulate")!.addEventListener("click", async () => {
      await simulateRailCallback(railId, paymentIntentId, "succeeded");
      const updated = await fetchSession(clientSecret, checkoutPublishableKey);
      renderSuccess(updated);
    });
  }
}

if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
window.onpopstate = (event) => {
  if (!activeStoreRoute) return;
  renderStoreRoute(activeStoreRoute.slug, activeStoreRoute.store);
  if (productIdFromLocation()) {
    restoreCatalogScroll(0);
    return;
  }
  restoreCatalogPosition(activeStoreRoute.slug, {
    scrollY: catalogScrollByStore.get(activeStoreRoute.slug) ?? event.state?.catalogScrollY,
    productId: event.state?.catalogProductId,
    productViewportTop: event.state?.catalogProductViewportTop,
  });
};

main();
