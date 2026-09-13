import { PaymentMethodType, resolveSiteSectionFamily } from "@pagosya/shared-types";
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
  subscribeStoreNewsletter,
  CheckoutSession,
  CustomerContact,
  Store,
  type StoreAnimation,
  type StoreMotionExperience,
  StoreItem,
  StoreLocation,
  StoreLink,
  DebtCollectionInfo,
  TrackedOrder,
} from "./api";
import { configureParentOrigin, observeResize, postToParent } from "./postmessage";
import { storePreviewExternalDestination } from "./preview-navigation";
import {
  normalizeStorefrontSiteContentOrder,
  sanitizeSiteDocument,
  synchronizeSiteDocument,
  type StoreCanvasTextStyle,
  type StoreSiteDocument,
} from "./site-document";

const STORE_MOTION_EXPERIENCES: readonly StoreMotionExperience[] = [
  "story-scroll", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials",
  "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  "full-screen-chapters", "magnetic-target", "frame-sequence",
  "video-background",
  "draggable-cards", "perspective-carousel", "link-preview", "video-pin-reveal",
  "gallery-accordion", "split-scroll", "sticky-gallery", "sticky-story", "text-parallax",
];
const STORE_TEXT_ANIMATION_EXPERIENCES = new Set<StoreMotionExperience>([
  "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
]);

function isStoreMotionExperience(value: unknown): value is StoreMotionExperience {
  return typeof value === "string" && STORE_MOTION_EXPERIENCES.includes(value as StoreMotionExperience);
}

const STORE_MOTION_EXPERIENCE_LABELS: Record<StoreMotionExperience, string> = {
  "story-scroll": "Story Scroll",
  "hero-carousel": "Slider principal",
  "image-stream": "Image Stream",
  "scroll-expansion": "Scroll Expansion",
  "hero-gallery-scroll": "Hero Gallery",
  "stagger-testimonials": "Reseñas",
  "portfolio-scroller": "Menú de momentos",
  "circle-reveal": "Revelado circular",
  "clarity-marquee": "Preguntas en movimiento",
  "layered-text": "Texto en capas",
  "text-rotate": "Texto mecanografiado",
  "text-glitch": "Texto revelado",
  "text-reveal-block": "Revelado por bloques",
  "text-along-path": "Texto en recorrido",
  "full-screen-chapters": "Capítulos completos",
  "magnetic-target": "Llamado magnético",
  "frame-sequence": "Secuencia de cuadros",
  "video-background": "Video de fondo",
  "draggable-cards": "Tarjetas arrastrables",
  "perspective-carousel": "Carrusel con perspectiva",
  "link-preview": "Vista previa de enlace",
  "video-pin-reveal": "Video revelado al desplazarse",
  "gallery-accordion": "Galería acordeón",
  "split-scroll": "Relato dividido",
  "sticky-gallery": "Galería fija",
  "sticky-story": "Historia fija",
  "text-parallax": "Texto en paralaje",
};

function storeAnimationMediaRequirement(type: StoreMotionExperience): { min: number; max: number } {
  if (STORE_TEXT_ANIMATION_EXPERIENCES.has(type)) return { min: 0, max: 0 };
  if (["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(type)) return { min: 1, max: 1 };
  if (type === "scroll-expansion") return { min: 2, max: 2 };
  if (["hero-gallery-scroll", "gallery-accordion", "split-scroll", "sticky-gallery"].includes(type)) return { min: 3, max: 8 };
  return { min: 2, max: 8 };
}

function canvasTextStyleAttributes(style?: StoreCanvasTextStyle): string {
  const scale = Number.isInteger(style?.textScale) ? style!.textScale! : 100;
  const width = Number.isInteger(style?.textWidthPercent) ? style!.textWidthPercent! : 62;
  const align = style?.textAlign || "";
  const color = style?.textColor && /^#[0-9a-f]{6}$/i.test(style.textColor) ? style.textColor : "";
  const font = style?.fontStyle || "";
  const offsetX = Number.isInteger(style?.textOffsetX) ? style!.textOffsetX! : 0;
  const offsetY = Number.isInteger(style?.textOffsetY) ? style!.textOffsetY! : 0;
  const offsetBasis = style?.textOffsetBasis === "section" ? "section" : "element";
  return ` data-canvas-text-style data-canvas-text-scale="${scale}" data-canvas-text-width="${width}" data-canvas-text-offset-x="${offsetX}" data-canvas-text-offset-y="${offsetY}" data-canvas-text-offset-basis="${offsetBasis}"${offsetX || offsetY ? " data-canvas-text-custom-layout" : ""}${align ? ` data-canvas-text-align="${align}"` : ""}${color ? ` data-canvas-text-color="${color}"` : ""}${font ? ` data-animation-font-style="${font}"` : ""} style="--canvas-text-scale:${scale / 100};--canvas-text-width:${width}%;--canvas-text-offset-x:${offsetX}%;--canvas-text-offset-y:${offsetY}%;${align ? `--canvas-text-align:${align};` : ""}${color ? `--canvas-text-color:${color};` : ""}"`;
}

type SiteSectionViewport = "desktop" | "mobile";
const SITE_SECTION_MIN_HEIGHT = 180;
const SITE_SECTION_MAX_HEIGHT = 1800;

function activeSiteSectionViewport(): SiteSectionViewport {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches
    ? "mobile"
    : "desktop";
}

function applySiteSectionPreviewHeight(section: HTMLElement, heightPx: number | null, viewport: SiteSectionViewport): void {
  const attribute = viewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const property = viewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  if (heightPx === null) {
    section.removeAttribute(attribute);
    section.style.removeProperty(property);
    return;
  }
  const height = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(heightPx)));
  section.setAttribute(attribute, String(height));
  section.style.setProperty(property, `${height}px`);
}

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
const ICON_PRINTER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6"/><path d="M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7z"/><path d="M17 12h.01"/></svg>';
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

function bindHorizontalDragScroll(scroller: HTMLElement): () => void {
  const dragThreshold = 6;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = 0;
  let dragging = false;
  let suppressClick = false;
  let suppressClickTimer = 0;

  const releasePointer = (id: number) => {
    try {
      if (scroller.hasPointerCapture?.(id)) scroller.releasePointerCapture(id);
    } catch {
      // The browser can release capture before pointerup during an interrupted gesture.
    }
  };
  const resetGesture = (id: number, shouldSuppressClick: boolean) => {
    pointerId = null;
    dragging = false;
    scroller.classList.remove("is-dragging");
    releasePointer(id);
    if (!shouldSuppressClick) return;
    suppressClick = true;
    window.clearTimeout(suppressClickTimer);
    suppressClickTimer = window.setTimeout(() => { suppressClick = false; }, 0);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || event.pointerType === "touch" || scroller.scrollWidth <= scroller.clientWidth + 1) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    startScrollLeft = scroller.scrollLeft;
    dragging = false;
    try {
      scroller.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!dragging) {
      if (Math.hypot(deltaX, deltaY) < dragThreshold) return;
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        resetGesture(event.pointerId, false);
        return;
      }
      dragging = true;
      scroller.classList.add("is-dragging");
    }
    event.preventDefault();
    scroller.scrollLeft = startScrollLeft - deltaX;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    resetGesture(event.pointerId, dragging);
  };
  const onPointerCancel = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    resetGesture(event.pointerId, false);
  };
  const onLostPointerCapture = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    dragging = false;
    scroller.classList.remove("is-dragging");
  };
  const onClick = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    window.clearTimeout(suppressClickTimer);
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onDragStart = (event: DragEvent) => event.preventDefault();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== scroller || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      scroller.scrollLeft = 0;
      return;
    }
    if (event.key === "End") {
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
      return;
    }
    const step = Math.max(280, Math.min(720, scroller.clientWidth * .8));
    scroller.scrollLeft += event.key === "ArrowRight" ? step : -step;
  };

  scroller.addEventListener("pointerdown", onPointerDown);
  scroller.addEventListener("pointermove", onPointerMove, { passive: false });
  scroller.addEventListener("pointerup", onPointerUp);
  scroller.addEventListener("pointercancel", onPointerCancel);
  scroller.addEventListener("lostpointercapture", onLostPointerCapture);
  scroller.addEventListener("click", onClick, true);
  scroller.addEventListener("dragstart", onDragStart);
  scroller.addEventListener("keydown", onKeyDown);

  return () => {
    window.clearTimeout(suppressClickTimer);
    scroller.removeEventListener("pointerdown", onPointerDown);
    scroller.removeEventListener("pointermove", onPointerMove);
    scroller.removeEventListener("pointerup", onPointerUp);
    scroller.removeEventListener("pointercancel", onPointerCancel);
    scroller.removeEventListener("lostpointercapture", onLostPointerCapture);
    scroller.removeEventListener("click", onClick, true);
    scroller.removeEventListener("dragstart", onDragStart);
    scroller.removeEventListener("keydown", onKeyDown);
  };
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

function normalizeStoreMapEmbedInput(value: string | null | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iframeSource = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return String(iframeSource || raw).replace(/&amp;/gi, "&").trim();
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
    id: "location-principal",
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

function playStoreVideo(video: HTMLVideoElement, onBlocked?: () => void): void {
  try {
    const attempt = video.play();
    void attempt?.catch(() => onBlocked?.());
  } catch {
    onBlocked?.();
  }
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
    try {
      const store = await fetchStore(linkSlug, { preview: suppressStoreViewForMerchant(linkSlug) });
      const proposalPatch = standaloneStorePreviewPatch();
      const renderedStore = proposalPatch ? { ...store, ...proposalPatch } : store;
      loadCart(renderedStore);
      renderStoreRoute(linkSlug, renderedStore);
      restoreCatalogScroll(0);
      observeResize(app);
    } catch (err) {
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
let selectedCollectionId: string = "ALL";
let activeCatalogStoreId: string | null = null;
// "featured" keeps the merchant's own catalog order (createdAt); the others
// re-sort within each category section, never across section boundaries.
let sortMode: "featured" | "price-asc" | "price-desc" | "popular" = "featured";

type CatalogSection = { id: string; name: string; bannerUrl: string | null; highlights: string[]; items: StoreItem[] };

function catalogSectionsForStore(store: Store): CatalogSection[] {
  const byCategory = new Map<string | null, StoreItem[]>();
  for (const item of store.items) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  return [
    ...store.categories.map((category) => ({
      id: category.id,
      name: category.name,
      bannerUrl: category.bannerUrl || null,
      highlights: Array.isArray(category.highlights) ? category.highlights.slice(0, 4) : [],
      items: byCategory.get(category.id) ?? [],
    })),
    ...(byCategory.get(null)?.length ? [{ id: "null", name: "Otros", bannerUrl: null, highlights: [], items: byCategory.get(null)! }] : []),
  ].filter((section) => section.items.length > 0 || storeEditorMode);
}

const PREVIEW_BLUEPRINT_ICONS = {
  category: `<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M12 24h37l9 10h50v44H12z"/><path d="M20 43h78M28 55h28M28 65h44"/><circle cx="91" cy="18" r="10"/><path d="M91 13v10M86 18h10"/></svg>`,
  product: `<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="19" y="12" width="82" height="66" rx="2"/><path d="M30 23h60v31H30zM30 64h30M76 64h14"/><circle cx="60" cy="38" r="8"/><path d="M60 33v10M55 38h10"/></svg>`,
  recommendation: `<svg viewBox="0 0 120 90" aria-hidden="true"><rect x="13" y="20" width="40" height="52" rx="2"/><rect x="67" y="20" width="40" height="52" rx="2"/><path d="M23 31h20v18H23zM77 31h20v18H77zM23 58h18M77 58h18"/><circle cx="60" cy="46" r="9"/><path d="M60 41v10M55 46h10"/></svg>`,
} as const;

function previewBlueprintButton(kind: keyof typeof PREVIEW_BLUEPRINT_ICONS, options: { label: string; copy: string; categoryId?: string; productId?: string; compact?: boolean }): string {
  return `<button type="button" class="preview-blueprint${options.compact ? " is-compact" : ""}" data-preview-blueprint="${kind}"${options.categoryId ? ` data-category-id="${escapeHtml(options.categoryId)}"` : ""}${options.productId ? ` data-product-id="${escapeHtml(options.productId)}"` : ""}>
    <span class="preview-blueprint-grid" aria-hidden="true"></span>
    <span class="preview-blueprint-drawing">${PREVIEW_BLUEPRINT_ICONS[kind]}</span>
    <span class="preview-blueprint-copy"><strong>${escapeHtml(options.label)}</strong><small>${escapeHtml(options.copy)}</small></span>
  </button>`;
}

function previewBuilderImageField(id: string, label: string): string {
  return `<label class="preview-builder-image" for="${id}"><span class="preview-builder-image-canvas"><span>${PREVIEW_BLUEPRINT_ICONS.product}</span></span><strong>${escapeHtml(label)}</strong><small>PNG, JPEG o WEBP · máximo 8 MB</small><input id="${id}" name="image" type="file" accept="image/png,image/jpeg,image/webp"></label>`;
}

function openPreviewBuilderDialog(kind: "category" | "product" | "recommendation", store: Store, options: { categoryId?: string; productId?: string } = {}): void {
  document.querySelector(".preview-builder-dialog")?.remove();
  const requestId = `preview-builder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dialog = document.createElement("dialog");
  dialog.className = "preview-builder-dialog";
  dialog.dataset.requestId = requestId;
  const category = options.categoryId ? store.categories.find((entry) => entry.id === options.categoryId) : null;
  const product = options.productId ? store.items.find((entry) => entry.id === options.productId) : null;
  const recommendationIds = new Set(product?.recommendedProductIds ?? []);
  const candidates = product ? store.items.filter((entry) => entry.id !== product.id) : [];
  const title = kind === "category" ? "Crear una categoría" : kind === "product" ? `Agregar producto${category ? ` a ${category.name}` : ""}` : `Recomendados para ${product?.name || "este producto"}`;
  const body = kind === "category"
    ? `<div class="preview-builder-fields"><label for="preview-builder-name">Nombre de la categoría<input id="preview-builder-name" name="name" maxlength="60" placeholder="Ej. Panes artesanales" required></label>${previewBuilderImageField("preview-builder-image", "Foto de la categoría")}</div>`
    : kind === "product"
      ? `<div class="preview-builder-fields"><label for="preview-builder-name">Nombre del producto<input id="preview-builder-name" name="name" maxlength="120" placeholder="Ej. Pan brioche" required></label><label for="preview-builder-price">Precio en bolivianos<input id="preview-builder-price" name="price" type="number" min="0" step="0.01" placeholder="Ej. 28,00" required></label><label class="preview-builder-full" for="preview-builder-description">Descripción breve (opcional)<textarea id="preview-builder-description" name="description" maxlength="500" rows="2" placeholder="Qué hace especial a este producto"></textarea></label>${previewBuilderImageField("preview-builder-image", "Foto del producto")}</div>`
      : `<fieldset class="preview-builder-recommendations"><legend>Elige hasta 4 productos</legend>${candidates.map((candidate) => {
          const image = candidate.imageUrls.map(assetUrl).find(Boolean);
          return `<label><input type="checkbox" name="recommendation" value="${escapeHtml(candidate.id)}" ${recommendationIds.has(candidate.id) ? "checked" : ""}><span class="preview-builder-recommendation-media">${image ? `<img src="${escapeHtml(image)}" alt="">` : `<span>${escapeHtml(initials(candidate.name))}</span>`}</span><span><strong>${escapeHtml(candidate.name)}</strong><small>${formatAmount(candidate.amount, candidate.currency)}</small></span></label>`;
        }).join("")}</fieldset>`;
  dialog.innerHTML = `<form method="dialog" class="preview-builder-form" aria-labelledby="preview-builder-title">
    <header><div><h2 id="preview-builder-title">${escapeHtml(title)}</h2><p>${kind === "recommendation" ? "Estas tarjetas aparecerán debajo del producto, en el orden del catálogo." : "Se guardará directamente en tu catálogo sin salir de esta vista previa."}</p></div><button type="button" class="preview-builder-close" aria-label="Cerrar">×</button></header>
    ${body}
    <p class="preview-builder-status" role="status" aria-live="polite"></p>
    <footer><button type="button" class="preview-builder-cancel">Cancelar</button><button type="submit" class="preview-builder-submit">${kind === "category" ? "Crear categoría" : kind === "product" ? "Crear producto" : "Guardar recomendados"}</button></footer>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  const status = dialog.querySelector<HTMLElement>(".preview-builder-status")!;
  const imageInput = dialog.querySelector<HTMLInputElement>('input[name="image"]');
  let previewObjectUrl = "";
  const close = () => {
    const saveTimeout = Number(dialog.dataset.saveTimeout);
    if (Number.isFinite(saveTimeout)) window.clearTimeout(saveTimeout);
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    dialog.close();
  };
  dialog.querySelector(".preview-builder-close")?.addEventListener("click", close);
  dialog.querySelector(".preview-builder-cancel")?.addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    const canvas = dialog.querySelector<HTMLElement>(".preview-builder-image-canvas");
    if (!file || !canvas) return;
    let image = canvas.querySelector<HTMLImageElement>("img");
    if (!image) {
      image = document.createElement("img");
      image.alt = "";
      canvas.append(image);
    }
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    image.src = previewObjectUrl;
  });
  const recommendationInputs = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[name="recommendation"]'));
  recommendationInputs.forEach((input) => input.addEventListener("change", () => {
    const checked = recommendationInputs.filter((candidate) => candidate.checked);
    if (checked.length > 4) {
      input.checked = false;
      status.textContent = "Puedes elegir hasta 4 productos.";
    } else status.textContent = `${checked.length} de 4 seleccionados.`;
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const submit = dialog.querySelector<HTMLButtonElement>(".preview-builder-submit")!;
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = "Guardando…";
    dialog.setAttribute("aria-busy", "true");
    status.textContent = "Guardando en tu catálogo…";
    const previousTimeout = Number(dialog.dataset.saveTimeout);
    if (Number.isFinite(previousTimeout)) window.clearTimeout(previousTimeout);
    dialog.dataset.saveTimeout = String(window.setTimeout(() => {
      if (!dialog.isConnected || !dialog.hasAttribute("aria-busy")) return;
      dialog.removeAttribute("aria-busy");
      submit.disabled = false;
      submit.textContent = kind === "recommendation" ? "Guardar recomendados" : kind === "category" ? "Crear categoría" : "Crear producto";
      status.textContent = "La vista previa no recibió confirmación. Intenta nuevamente o recarga el panel.";
      delete dialog.dataset.saveTimeout;
    }, 15_000));
    if (kind === "category") {
      postToParent("STORE_EDITOR_CREATE_CATEGORY", { requestId, name: String(data.get("name") || ""), image: imageInput?.files?.[0] || null });
    } else if (kind === "product") {
      postToParent("STORE_EDITOR_CREATE_PRODUCT", { requestId, categoryId: options.categoryId || null, name: String(data.get("name") || ""), description: String(data.get("description") || ""), price: String(data.get("price") || ""), image: imageInput?.files?.[0] || null });
    } else {
      postToParent("STORE_EDITOR_UPDATE_PRODUCT_RECOMMENDATIONS", { requestId, productId: options.productId, recommendedProductIds: recommendationInputs.filter((input) => input.checked).map((input) => input.value) });
    }
  });
  dialog.showModal();
  dialog.querySelector<HTMLInputElement>("input:not([type='file'])")?.focus();
}

function bindPreviewBlueprints(store: Store): void {
  app.querySelectorAll<HTMLButtonElement>("[data-preview-blueprint]:not([data-blueprint-bound])").forEach((button) => {
    button.dataset.blueprintBound = "true";
    button.addEventListener("click", () => {
      const kind = button.dataset.previewBlueprint as "category" | "product" | "recommendation";
      const product = button.dataset.productId ? store.items.find((entry) => entry.id === button.dataset.productId) : null;
      if (kind === "recommendation" && product && store.items.length <= 1) {
        openPreviewBuilderDialog("product", store, { categoryId: product.categoryId || undefined });
        return;
      }
      openPreviewBuilderDialog(kind, store, { categoryId: button.dataset.categoryId, productId: button.dataset.productId });
    });
  });
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
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

function storePageUrl(slug: string, pageSlug: string): string {
  const params = new URLSearchParams();
  params.set("page", pageSlug);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const pathname = activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}?${params.toString()}${storePreviewFragment()}`;
}

function storeCollectionUrl(slug: string, collectionId: string): string {
  const params = new URLSearchParams();
  if (collectionId !== "ALL") params.set("collection", collectionId);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug ? "/" : `/s/${encodeURIComponent(slug)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment() || "#store-products"}`;
}

function categoryPageUrl(slug: string, categoryId: string): string {
  const params = new URLSearchParams();
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug
    ? `/c/${encodeURIComponent(categoryId)}`
    : `/s/${encodeURIComponent(slug)}/c/${encodeURIComponent(categoryId)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

function productPageUrl(slug: string, productId: string, categoryId = selectedCategoryId): string {
  const params = new URLSearchParams();
  if (categoryId !== "ALL") params.set("category", categoryId);
  if (storePreviewMode) params.set("preview", "1");
  if (storeEditorMode) params.set("editor", "1");
  if (storeOwnerMode) params.set("owner", "1");
  const query = params.toString();
  const pathname = activeCustomDomainSlug === slug
    ? `/p/${encodeURIComponent(productId)}`
    : `/s/${encodeURIComponent(slug)}/p/${encodeURIComponent(productId)}`;
  return `${pathname}${query ? `?${query}` : ""}${storePreviewFragment()}`;
}

function storePreviewFragment(): string {
  if (!storePreviewMode || !window.location.hash) return "";
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.has("proposal") || params.has("parent_origin") ? window.location.hash : "";
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

function announcementLetteringHtml(text: string, effect: NonNullable<Store["announcementEffect"]>): string {
  if (effect === "none") return escapeHtml(text);
  return Array.from(text).map((character, index) => {
    const classes = character.trim() ? "store-announcement-letter" : "store-announcement-letter is-space";
    return `<span class="${classes}" style="--letter-index:${index}">${escapeHtml(character)}</span>`;
  }).join("");
}

function storeAnnouncementHtml(store: Store): string {
  if (!store.announcement || !hasReadableContent(store.announcement)) return "";
  const mode = store.announcementMode === "marquee" ? "marquee" : "static";
  const duration = Math.min(40, Math.max(8, Number(store.announcementSpeed) || 18));
  const size = ["small", "medium", "large"].includes(store.announcementSize || "") ? store.announcementSize! : "small";
  const font = ["store", "modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(store.announcementFont || "")
    ? store.announcementFont!
    : "store";
  const effect: NonNullable<Store["announcementEffect"]> = ["wave", "pulse", "sparkle"].includes(store.announcementEffect || "")
    ? store.announcementEffect as NonNullable<Store["announcementEffect"]>
    : "none";
  const presentationClasses = `announcement-size-${size} announcement-font-${font} announcement-effect-${effect}`;
  const configuredColor = /^#[0-9a-f]{6}$/i.test(store.announcementColor || "") ? store.announcementColor.toLowerCase() : "";
  // The legacy amber value was the implicit default rather than an authored
  // merchant choice. Render that value as the new white storefront default;
  // explicitly selected colors remain available.
  const color = configuredColor && configuredColor !== "#c58b3c" ? configuredColor : "#ffffff";
  const style = `--announcement-bg:${color};--announcement-ink:${accentContrastColor(color)};--marquee-duration:${duration}s`;
  const editorAttributes = ` data-announcement-mode="${mode}" data-announcement-speed="${duration}" data-announcement-size="${size}" data-announcement-color="${color}" data-announcement-font="${font}" data-announcement-effect="${effect}"`;
  if (mode === "static") {
    return `<aside class="store-announcement ${presentationClasses}" style="${style}" aria-label="${escapeHtml(store.announcement)}"${editorAttributes}><span class="store-announcement-copy" aria-hidden="true">${announcementLetteringHtml(store.announcement, effect)}</span></aside>`;
  }
  const sequence = store.announcement
    .split(/\s*(?:[•·|]|\r?\n)\s*/u)
    .map((phrase) => phrase.trim())
    .filter(Boolean)
    .map((phrase) => `<span class="store-announcement-phrase">${announcementLetteringHtml(phrase, effect)}</span><span class="store-announcement-separator">•</span>`)
    .join("");
  return `<aside class="store-announcement marquee ${presentationClasses}" style="${style}" aria-label="${escapeHtml(store.announcement)}" tabindex="0"${editorAttributes}>
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
  options: { current: "home" | "catalog" | "page"; catalogUrl?: string; pageId?: string } = { current: "home" },
): string {
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  const logoUrl = assetUrl(store.logoUrl);
  const visibleStoreName = store.storeName.trim();
  const storeUrl = storeCatalogUrl(slug);
  const catalogUrl = options.catalogUrl || storeUrl;
  const onStorePage = options.current === "home";
  const preservePreview = Boolean(storePreviewFragment());
  const homeHref = onStorePage ? (preservePreview ? storeUrl : "#store-top") : storeUrl;
  const catalogHref = onStorePage || document.body.classList.contains("category-page")
    ? (preservePreview ? storeUrl : "#store-products")
    : (preservePreview ? catalogUrl : `${catalogUrl}#store-products`);
  const sectionHref = (sectionId: string) => {
    const authoredSection = siteDocument?.sections.find((section) => section.id === sectionId);
    const ownerPage = authoredSection?.pageId ? siteDocument?.pages?.find((page) => page.id === authoredSection.pageId) : null;
    const base = ownerPage ? storePageUrl(slug, ownerPage.slug) : storeUrl;
    const anchor = `site-section-${sectionId}`;
    if (preservePreview) return base;
    return onStorePage && !ownerPage ? `#${anchor}` : `${base}#${anchor}`;
  };
  const scrollTarget = (section: string) => section && onStorePage && preservePreview ? ` data-store-scroll-target="#${section}"` : "";
  const cartItems = cartCount();
  const headerCollections = (siteDocument?.merchandising.collections ?? [])
    .map((collection) => ({
      ...collection,
      products: collection.productIds.flatMap((productId) => {
        const product = store.items.find((candidate) => candidate.id === productId);
        return product ? [product] : [];
      }),
    }))
    .filter((collection) => collection.products.length > 0);
  const collectionFeatureHtml = headerCollections.slice(0, 2).map((collection) => {
    const coverProduct = collection.products.find((product) => product.imageUrls.some(Boolean));
    const coverIndex = coverProduct?.imageUrls.findIndex(Boolean) ?? -1;
    const coverUrl = coverProduct && coverIndex >= 0 ? assetUrl(coverProduct.imageUrls[coverIndex]) : null;
    return `<a class="store-site-shop-feature" href="${escapeHtml(storeCollectionUrl(slug, collection.id))}">
      <span class="store-site-shop-feature-media">${coverUrl
        ? `<img src="${escapeHtml(coverUrl)}" alt="" loading="lazy" decoding="async" style="object-position:${productImagePosition(coverProduct!, coverIndex)}">`
        : `<span aria-hidden="true">${escapeHtml(collection.name.slice(0, 1).toUpperCase())}</span>`}</span>
      <span class="store-site-shop-feature-copy"><strong>${escapeHtml(collection.name)}</strong><small>${collection.products.length} ${collection.products.length === 1 ? "producto" : "productos"}</small></span>
    </a>`;
  }).join("");
  const collectionMenuHtml = headerCollections.length
    ? `<div class="store-site-shop-menu" aria-label="Explorar colecciones">
        <div class="store-site-shop-menu-links">
          <strong>Comprar por colección</strong>
          <a href="${escapeHtml(storeCollectionUrl(slug, "ALL"))}">Ver todo</a>
          ${headerCollections.map((collection) => `<a href="${escapeHtml(storeCollectionUrl(slug, collection.id))}">${escapeHtml(collection.name)}<small>${collection.products.length}</small></a>`).join("")}
        </div>
        ${collectionFeatureHtml ? `<div class="store-site-shop-features">${collectionFeatureHtml}</div>` : ""}
      </div>`
    : "";
  const navigationItems = siteDocument?.navigation.items?.length
    ? siteDocument.navigation.items
    : [
        { id: "home", label: "Inicio", target: "home" as const },
        { id: "catalog", label: "Catálogo", target: "catalog" as const },
        ...(store.locations?.length || store.locationMapUrl ? [{ id: "location", label: "Ubicación", target: "section" as const, sectionId: siteDocument?.sections.find((section) => section.kind === "location")?.id }] : []),
        ...(store.contactFormEnabled === true ? [{ id: "contact", label: "Contacto", target: "section" as const, sectionId: siteDocument?.sections.find((section) => section.kind === "contact")?.id }] : []),
      ];
  const navigationItemHtml = navigationItems.flatMap((item, index) => {
    const targetId = item.target === "home"
      ? "store-top"
      : item.target === "catalog"
        ? "store-products"
        : item.target === "page"
          ? ""
        : item.sectionId
          ? `site-section-${item.sectionId}`
          : item.id === "location"
            ? "store-location"
            : item.id === "contact"
              ? "store-contact"
              : "";
    const page = item.target === "page" ? siteDocument?.pages?.find((candidate) => candidate.id === item.pageId) : null;
    if (!targetId && !page) return [];
    const href = item.target === "home"
      ? homeHref
      : item.target === "catalog"
        ? catalogHref
        : page
          ? storePageUrl(slug, page.slug)
          : item.sectionId
            ? sectionHref(item.sectionId)
            : onStorePage && !preservePreview
              ? `#${targetId}`
              : `${storeUrl}#${targetId}`;
    const current = item.target === "home" ? options.current === "home" : item.target === "catalog" ? options.current === "catalog" : item.target === "page" ? options.current === "page" && options.pageId === item.pageId : false;
    return [`<a href="${escapeHtml(href)}"${scrollTarget(targetId)} data-site-navigation-item="${escapeHtml(item.id)}" data-site-navigation-index="${index}"${canvasTextStyleAttributes(item.style)}${item.target === "catalog" && headerCollections.length ? ' data-store-shop-trigger' : ""}${current ? ' aria-current="page"' : ""}><span>${escapeHtml(item.label)}</span>${item.target === "catalog" ? ICON_CHEVRON_DOWN : ""}</a>`];
  }).join("");
  const legacyLayout = siteDocument?.navigation.layout || "brand-left";
  const brandPosition = siteDocument?.navigation.brandPosition || (legacyLayout === "centered" ? "center" : "left");
  const navPosition = siteDocument?.navigation.navPosition || (legacyLayout === "split" ? "left" : "center");
  const searchPosition = siteDocument?.navigation.searchPosition || "right";
  const profilePosition = siteDocument?.navigation.profilePosition || "right";
  const cartPosition = siteDocument?.navigation.cartPosition || "right";
  const brandHtml = `<a class="store-site-brand" href="${escapeHtml(homeHref)}"${scrollTarget("store-top")} aria-label="${escapeHtml(visibleStoreName ? `Ir al inicio de ${visibleStoreName}` : "Ir al inicio de la tienda")}">
    ${logoUrl ? `<img class="merchant-header-logo" src="${escapeHtml(logoUrl)}" alt="${visibleStoreName ? "" : "Logo de la tienda"}">` : ""}
    ${visibleStoreName || store.tagline ? `<span class="merchant-header-copy">
      ${visibleStoreName ? `<strong class="store-title"${canvasTextStyleAttributes(siteDocument?.navigation.brandStyle)}>${escapeHtml(visibleStoreName)}</strong>` : ""}
      ${store.tagline ? `<span class="store-tagline"${canvasTextStyleAttributes(siteDocument?.navigation.taglineStyle)}>${escapeHtml(store.tagline)}</span>` : ""}
    </span>` : ""}
  </a>`;
  const navHtml = `<nav class="store-site-nav" aria-label="Secciones de la tienda">${navigationItemHtml}</nav>`;
  const actionHtml: Record<"left" | "right", string[]> = { left: [], right: [] };
  actionHtml[searchPosition].push(`<a class="store-header-action store-header-search" href="${escapeHtml(catalogHref)}"${scrollTarget("store-products")} aria-label="Buscar en el catálogo">${ICON_SEARCH}</a>`);
  if (!storePreviewMode && !storeOwnerMode) {
    actionHtml[profilePosition].push(`<a class="store-header-action store-directory-back" href="/stores/" aria-label="Volver a Mi Tienda">${ICON_PERSON}<span class="visually-hidden">Volver a Mi Tienda</span></a>`);
  }
  actionHtml[cartPosition].push(`<button class="store-header-action store-header-cart" type="button" aria-label="Abrir carrito, ${cartItems} ${cartItems === 1 ? "producto" : "productos"}" ${cartItems === 0 ? "disabled" : ""}>${ICON_BAG}<span class="store-header-cart-count"${cartItems === 0 ? " hidden" : ""}>${cartItems}</span></button>`);
  const zones: Record<"left" | "center" | "right", string[]> = { left: [], center: [], right: [] };
  zones[brandPosition].push(brandHtml);
  zones[navPosition].push(navHtml);
  (["left", "right"] as const).forEach((position) => {
    if (actionHtml[position].length) zones[position].push(`<div class="store-site-utility" aria-label="Acciones de la tienda">${actionHtml[position].join("")}</div>`);
  });
  return `<header class="merchant-header store-site-header${!visibleStoreName && logoUrl ? " has-prominent-logo" : ""}${!visibleStoreName && logoUrl && !store.tagline ? " is-logo-only" : ""}" id="store-top">
    <div class="store-site-header-zone is-left" data-header-zone="left">${zones.left.join("")}</div>
    <div class="store-site-header-zone is-center" data-header-zone="center">${zones.center.join("")}</div>
    <div class="store-site-header-zone is-right" data-header-zone="right">${zones.right.join("")}</div>
    ${collectionMenuHtml}
  </header>`;
}

function storefrontFooterHtml(store: Store): string {
  const footer = sanitizeSiteDocument(store.siteDocument)?.footer;
  if (!footer?.enabled) return "";
  const columns = footer.columns.map((column, columnIndex) => `<section class="store-site-footer-column" data-site-footer-column="${columnIndex}" aria-labelledby="store-site-footer-column-${columnIndex}">
    <h2 id="store-site-footer-column-${columnIndex}">${escapeHtml(column.title)}</h2>
    <div>${column.items.map((item, itemIndex) => item.href
      ? `<a href="${escapeHtml(item.href)}" data-site-footer-item="${itemIndex}">${escapeHtml(item.label)}</a>`
      : `<span data-site-footer-item="${itemIndex}">${escapeHtml(item.label)}</span>`).join("")}</div>
  </section>`).join("");
  const newsletter = footer.newsletter?.enabled ? `<section class="store-site-newsletter" aria-labelledby="store-newsletter-title">
    <div><h2 id="store-newsletter-title">${escapeHtml(footer.newsletter.title || "Noticias de la tienda")}</h2>${footer.newsletter.body ? `<p>${escapeHtml(footer.newsletter.body)}</p>` : ""}</div>
    <form class="store-newsletter-form" id="store-newsletter-form">
      <label class="visually-hidden" for="store-newsletter-email">Correo electrónico</label>
      <div><input id="store-newsletter-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="tu@correo.com" required><button type="submit">${escapeHtml(footer.newsletter.buttonLabel || "Suscribirme")}</button></div>
      <span class="store-newsletter-status" role="status" aria-live="polite" data-success-message="${escapeHtml(footer.newsletter.successMessage || "Listo. Ya estás en la lista.")}"></span>
    </form>
  </section>` : "";
  return `<footer class="store-site-footer" data-site-footer>
    ${newsletter}
    <div class="store-site-footer-main">
      <section class="store-site-footer-brand" aria-labelledby="store-site-footer-brand">
        <h2 id="store-site-footer-brand">${escapeHtml(store.storeName)}</h2>
        ${footer.brandDescription ? `<p>${escapeHtml(footer.brandDescription)}</p>` : ""}
      </section>
      ${columns}
    </div>
    <div class="store-site-footer-bottom">
      <span data-site-footer-copyright>${escapeHtml(footer.copyright)}</span>
      ${footer.badge ? `<span class="store-site-footer-badge" data-site-footer-badge>${escapeHtml(footer.badge)}</span>` : ""}
    </div>
  </footer>`;
}

function bindStoreAnnouncementPlayback(): void {
  activeAnnouncementCleanup?.();
  activeAnnouncementCleanup = null;
  const announcement = app.querySelector<HTMLElement>(".store-announcement");
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

function renderProductCard(
  slug: string,
  item: StoreItem,
  index: number,
  showLowStock: boolean,
  presentation: { featured?: boolean; showDescription?: boolean } = {},
): string {
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
    <div class="store-item ${soldOut ? "sold-out" : ""}${discountPercent === null ? "" : " has-sale"}${presentation.featured ? " is-site-featured" : ""}" data-id="${item.id}"${staggerStyle}>
      ${saleBadgeHtml}
      ${galleryHtml}
      <div class="store-item-info">
        ${presentation.featured ? `<span class="site-featured-label">Selección destacada</span>` : ""}
        ${tagsHtml}
        <a class="store-item-name product-page-link" href="${escapeHtml(detailUrl)}">${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" title="${escapeHtml(item.color)}"></span>` : ""}${escapeHtml(item.name)}</a>
        ${presentation.showDescription !== false && item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
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
    | "siteDocument"
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
    | "announcementFont"
    | "announcementEffect"
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

const STORE_PREVIEW_LEGACY_SITE_FIELDS = [
  "tagline",
  "aboutTitle",
  "aboutText",
  "aboutSubtitle",
  "catalogTitle",
  "catalogSubtitle",
  "galleryTitle",
  "gallerySubtitle",
  "contactTitle",
  "contactSubtitle",
  "locationTitle",
  "locationSubtitle",
  "linksTitle",
  "fontStyle",
] as const satisfies readonly (keyof StorePreviewPatch)[];

/**
 * The advanced form and the authored site document travel in the same preview
 * patch during the editor migration. Only project a legacy text field when it
 * changed since the last rendered preview; otherwise an unrelated redraw (for
 * example, choosing a text color) would overwrite newer inline document copy
 * with the older compatibility value.
 */
function changedLegacySiteTextPatch(patch: StorePreviewPatch, previous: Store): StorePreviewPatch {
  const changed = { ...patch };
  for (const key of STORE_PREVIEW_LEGACY_SITE_FIELDS) {
    if (key in patch && patch[key] === previous[key]) delete changed[key];
  }
  return changed;
}

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
  if (Array.isArray(source.recommendedProductIds)) {
    preview.recommendedProductIds = [...new Set(
      source.recommendedProductIds.filter((id): id is string => typeof id === "string" && id !== preview.id && id.length <= 200),
    )].slice(0, 4);
  }
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
const storeEditorMode = storePreviewMode && new URLSearchParams(window.location.search).get("editor") === "1";
const storeOwnerMode = new URLSearchParams(window.location.search).get("owner") === "1";
if (storePreviewMode) {
  try {
    window.history.scrollRestoration = "manual";
  } catch {
    // Some embedded browsers expose scrollRestoration as read-only. The
    // explicit reset below still keeps a newly loaded preview at its top.
  }
  const resetPreviewScroll = () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  resetPreviewScroll();
  window.addEventListener("pageshow", resetPreviewScroll, { once: true });
}
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
let activePreviewRenderedStore: Store | null = null;
let activePreviewRenderSignature = "";
let activePreviewRenderedView = "store";
let storePreviewEditorEnabled = storeEditorMode;
let storePreviewLockedSectionIds = new Set<string>();
let storePreviewEditorHover: HTMLElement | null = null;
let storePreviewEditorSelection: StorePreviewEditorSelection | null = null;
let storePreviewInlineEditorTarget: HTMLElement | null = null;
let storePreviewInlineEditorFinish: ((commit: boolean) => void) | null = null;
let storePreviewPendingInlineTextCommit: { selection: StorePreviewEditorSelection; value: string } | null = null;
let storePreviewEditorClickTimer: number | null = null;
let storePreviewEditorSuppressNextClick = false;

if (storePreviewMode) {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.hasAttribute("download")) return;
    const destination = storePreviewExternalDestination(anchor.getAttribute("href"), window.location.href);
    if (!destination) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    postToParent("STORE_PREVIEW_EXTERNAL_LINK", {
      url: destination.url,
      label: (anchor.textContent || anchor.getAttribute("aria-label") || "Abrir enlace").trim().slice(0, 120),
    });
  }, true);
  window.addEventListener("wheel", (event) => {
    if (!event.deltaY) return;
    const scrollingElement = document.scrollingElement;
    if (!scrollingElement) return;
    const atTop = scrollingElement.scrollTop <= 1;
    const atBottom = scrollingElement.scrollTop + window.innerHeight >= scrollingElement.scrollHeight - 1;
    if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) {
      postToParent("STORE_PREVIEW_SCROLL_BOUNDARY", { deltaY: event.deltaY });
    }
  }, { passive: true });
}
const STORE_PREVIEW_SECTIONS = ["brand", "navigation", "announcement", "hero", "products", "about", "gallery", "motion", "contact", "links", "location", "footer", "promotion"] as const;
type StorePreviewSection = (typeof STORE_PREVIEW_SECTIONS)[number];

const STORE_PREVIEW_INLINE_TEXT_FIELDS = new Set([
  "storeName", "storeTagline", "title", "caption", "body", "ctaLabel",
  "announcementText",
  "animationTitle", "animationSubtitle", "textBlock", "buttonLabel",
  "siteTitle", "siteBody", "siteCtaLabel", "siteItemTitle", "siteItemBody", "siteBlockText",
  "catalogTitle", "catalogSubtitle", "aboutTitle", "aboutSubtitle", "aboutBody",
  "galleryTitle", "gallerySubtitle", "editorialTitle", "editorialCaption", "editorialBody",
  "linksTitle", "linkLabel", "contactTitle", "contactSubtitle", "locationTitle",
  "locationSubtitle", "promotionTitle", "promotionBody", "promotionAction", "cartButton",
  "navigationLabel", "footerBrandDescription", "footerColumnTitle", "footerItemLabel", "footerCopyright", "footerBadge",
]);
const STORE_PREVIEW_INLINE_IMAGE_FIELDS = new Set([
  "storeLogo", "storeBanner", "aboutImage", "editorialMedia", "media", "siteMedia", "siteBlockMedia", "promotionImage", "categoryBanner",
]);

interface StorePreviewEditorSelection {
  section: StorePreviewSection | `animation-${string}` | `site-${string}`;
  field: string;
  label: string;
  itemId?: string;
  itemIndex?: number;
  animationId?: string;
}

function sanitizeStorePreviewEditorSelection(value: unknown): StorePreviewEditorSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as Record<string, unknown>;
  if (typeof selection.section !== "string" || typeof selection.field !== "string") return null;
  return {
    section: selection.section.slice(0, 64) as StorePreviewEditorSelection["section"],
    field: selection.field.slice(0, 64),
    label: typeof selection.label === "string" ? selection.label.slice(0, 120) : "parte seleccionada",
    ...(typeof selection.itemId === "string" ? { itemId: selection.itemId.slice(0, 200) } : {}),
    ...(Number.isInteger(selection.itemIndex) ? { itemIndex: Math.max(0, Number(selection.itemIndex)) } : {}),
    ...(typeof selection.animationId === "string" ? { animationId: selection.animationId.slice(0, 64) } : {}),
  };
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

function storePreviewCanvasToolbar(): HTMLElement {
  let toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "store-preview-canvas-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Controles directos de la selección");
    document.body.appendChild(toolbar);
  }
  return toolbar;
}

function positionStorePreviewCanvasToolbar(toolbar: HTMLElement, target: HTMLElement): void {
  const rect = target.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  const maxLeft = Math.max(10, window.innerWidth - toolbarRect.width - 10);
  const preferredLeft = toolbar.classList.contains("is-animation-popover")
    ? rect.right - toolbarRect.width - 10
    : rect.left + (rect.width - toolbarRect.width) / 2;
  const left = Math.max(10, Math.min(preferredLeft, maxLeft));
  const above = rect.top - toolbarRect.height - 10;
  const maxTop = Math.max(10, window.innerHeight - toolbarRect.height - 10);
  // A tall popover placed below a selected section can cover the next section
  // completely, making it look like a blank white bar and preventing clicks.
  // When there is no room above, keep it inside the selected target instead.
  const insideSelectedTarget = Math.max(10, Math.min(rect.top + 10, maxTop));
  const top = above >= 10 ? Math.min(above, maxTop) : insideSelectedTarget;
  toolbar.style.left = `${Math.round(left)}px`;
  toolbar.style.top = `${Math.max(10, Math.round(top))}px`;
  bindStorePreviewCanvasToolbarDrag(toolbar, target);
}

function bindStorePreviewCanvasToolbarDrag(toolbar: HTMLElement, target: HTMLElement): void {
  const handle = toolbar.querySelector<HTMLElement>(":scope > .store-preview-animation-popover > header");
  if (!handle || handle.dataset.canvasDragBound === "true") return;
  handle.dataset.canvasDragBound = "true";
  handle.classList.add("store-preview-popover-drag-handle");
  handle.title = "Arrastra para mover este panel · doble clic para devolverlo a su lugar";
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  const finish = (pointerId?: number) => {
    if (!dragging) return;
    dragging = false;
    toolbar.classList.remove("is-dragging");
    if (pointerId !== undefined) handle.releasePointerCapture?.(pointerId);
  };
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || window.matchMedia("(max-width: 640px)").matches) return;
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a, label")) return;
    const rect = toolbar.getBoundingClientRect();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    toolbar.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = toolbar.getBoundingClientRect();
    const left = Math.max(8, Math.min(startLeft + event.clientX - startX, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(startTop + event.clientY - startY, window.innerHeight - rect.height - 8));
    toolbar.style.left = `${Math.round(left)}px`;
    toolbar.style.top = `${Math.round(top)}px`;
    event.preventDefault();
  });
  handle.addEventListener("pointerup", (event) => finish(event.pointerId));
  handle.addEventListener("pointercancel", (event) => finish(event.pointerId));
  handle.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement).closest("button, input, select, textarea, a, label")) return;
    positionStorePreviewCanvasToolbar(toolbar, target);
  });
}

function storePreviewUsedColors(store: Store | null | undefined): string[] {
  const colors = new Map<string, { color: string; score: number; order: number }>();
  let order = 0;
  const add = (value: unknown, score = 1) => {
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return;
    const color = value.toLowerCase();
    const existing = colors.get(color);
    if (existing) existing.score += score;
    else colors.set(color, { color, score, order: order++ });
  };
  if (!store) return [];

  const theme = store.siteDocument?.theme;
  add(theme?.pageBackground, 6);
  add(theme?.textColor, 6);
  add(theme?.accentColor, 5);
  add(theme?.surfaceColor, 4);
  add(theme?.secondaryColor, 3);
  add(theme?.mutedColor, 2);
  add(theme?.borderColor);
  add(store.backgroundColor, 2);
  add(store.backgroundGradientStart, 2);
  add(store.backgroundGradientEnd, 2);
  add(store.accentColor, 3);
  add(store.announcementColor, 2);
  Object.values(store.sectionBackgrounds ?? {}).forEach((color) => add(color, 3));

  store.siteDocument?.sections.forEach((section) => {
    add(section.backgroundColor, 3);
    add(section.textColor, 3);
    add(section.titleStyle?.textColor);
    add(section.bodyStyle?.textColor);
    section.items.forEach((item) => {
      add(item.titleStyle?.textColor);
      add(item.bodyStyle?.textColor);
    });
    const addBlockColors = (blocks = section.blocks ?? []) => blocks.forEach((block) => {
      add(block.style?.textColor);
      addBlockColors(block.children ?? []);
    });
    addBlockColors();
  });
  store.animations?.forEach((animation) => {
    add(animation.backgroundColor, 2);
    add(animation.textColor, 2);
    animation.textBlocks?.forEach((block) => add(block.textColor));
    animation.media.forEach((media) => {
      add(media.boxColor);
      add(media.textColor);
    });
  });

  return [...colors.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, 8)
    .map(({ color }) => color);
}

function storePreviewPaletteHtml(colors: string[], target: string, current: string, label: string): string {
  const normalizedCurrent = current.toLowerCase();
  const palette = /^#[0-9a-f]{6}$/i.test(normalizedCurrent) && !colors.includes(normalizedCurrent)
    ? [normalizedCurrent, ...colors].slice(0, 8)
    : colors;
  if (!palette.length) return "";
  return `<div class="store-preview-site-palette" role="group" aria-label="Colores más usados en este sitio para ${label.toLowerCase()}">
    <span class="store-preview-site-palette-label">${escapeHtml(label)}</span>
    ${palette.map((color) => `<button type="button" class="store-preview-palette-swatch" data-canvas-palette="${target}" data-palette-color="${color}" style="--palette-color:${color}" aria-label="Usar ${color}" aria-pressed="${color === normalizedCurrent}" title="Usar ${color}"></button>`).join("")}
  </div>`;
}

function bindStorePreviewPalette(toolbar: HTMLElement, controls: Record<string, HTMLInputElement | null>): void {
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-palette]").forEach((button) => button.addEventListener("click", () => {
    const target = button.dataset.canvasPalette;
    const color = button.dataset.paletteColor;
    const control = target ? controls[target] : null;
    if (!control || !color || !/^#[0-9a-f]{6}$/i.test(color)) return;
    control.value = color;
    toolbar.querySelectorAll<HTMLButtonElement>(`[data-canvas-palette="${target}"]`).forEach((swatch) => {
      swatch.setAttribute("aria-pressed", String(swatch.dataset.paletteColor === color));
    });
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }));
}

function storePreviewRenderedSiteDocument(): Store["siteDocument"] | null {
  const renderedStore = activePreviewRenderedStore ?? activePreviewStore?.store ?? activeStoreRoute?.store;
  return renderedStore?.siteDocument ?? null;
}

function updateStorePreviewNavigationDraft(index: number, key: "label" | "target", value: string): void {
  const document = storePreviewRenderedSiteDocument();
  const item = document?.navigation?.items?.[index];
  if (!item) return;
  if (key === "label") {
    item.label = value.slice(0, 40);
    return;
  }
  if (value === "home" || value === "catalog") {
    item.target = value;
    delete item.sectionId;
    delete item.pageId;
    return;
  }
  if (value.startsWith("page:")) {
    const pageId = value.slice("page:".length);
    if (!document?.pages?.some((page) => page.id === pageId)) return;
    item.target = "page";
    item.pageId = pageId;
    delete item.sectionId;
    return;
  }
  if (!value.startsWith("section:")) return;
  const sectionId = value.slice("section:".length);
  if (!document?.sections.some((section) => section.id === sectionId)) return;
  item.target = "section";
  item.sectionId = sectionId;
  delete item.pageId;
}

function updateStorePreviewFooterDraft(
  selection: StorePreviewEditorSelection,
  key: "brandDescription" | "copyright" | "badge" | "columnTitle" | "itemLabel" | "itemHref",
  value: string,
): void {
  const footer = storePreviewRenderedSiteDocument()?.footer;
  if (!footer) return;
  if (key === "brandDescription" || key === "copyright" || key === "badge") {
    footer[key] = value;
    return;
  }
  if (key === "columnTitle" && Number.isInteger(selection.itemIndex)) {
    const column = footer.columns[selection.itemIndex!];
    if (column) column.title = value;
    return;
  }
  if (!selection.itemId) return;
  const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
  const item = footer.columns[columnIndex]?.items[itemIndex];
  if (!item) return;
  if (key === "itemLabel") item.label = value;
  else item.href = value;
}

function renderStorePreviewCanvasToolbar(target: HTMLElement | null, selection: StorePreviewEditorSelection | null): void {
  const toolbar = storePreviewCanvasToolbar();
  toolbar.className = "store-preview-canvas-toolbar";
  if (!target || !selection || !storePreviewEditorEnabled) {
    toolbar.hidden = true;
    toolbar.replaceChildren();
    return;
  }
  const renderedStore = activePreviewRenderedStore ?? activePreviewStore?.store ?? activeStoreRoute?.store;
  const paletteColors = storePreviewUsedColors(renderedStore);
  if (selection.section === "announcement") {
    const mode = target.dataset.announcementMode === "marquee" ? "marquee" : "static";
    const speed = Math.min(40, Math.max(8, Number(target.dataset.announcementSpeed || 18)));
    const size = ["small", "medium", "large"].includes(target.dataset.announcementSize || "") ? target.dataset.announcementSize! : "small";
    const font = ["store", "modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(target.dataset.announcementFont || "") ? target.dataset.announcementFont! : "store";
    const effect = ["none", "wave", "pulse", "sparkle"].includes(target.dataset.announcementEffect || "") ? target.dataset.announcementEffect! : "none";
    const color = /^#[0-9a-f]{6}$/i.test(target.dataset.announcementColor || "") ? target.dataset.announcementColor! : "#ffffff";
    const announcementText = renderedStore?.announcement || "";
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-announcement-popover">
      <header><strong>Marquesina superior</strong><span>Texto, apariencia y movimiento</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <label class="store-preview-animation-field"><span>Mensaje</span><textarea data-canvas-announcement-text maxlength="240" rows="3">${escapeHtml(announcementText)}</textarea></label>
      <div class="store-preview-animation-fields">
        <label class="store-preview-animation-field"><span>Movimiento</span><select data-canvas-announcement="announcementMode" aria-label="Movimiento de la marquesina"><option value="static"${mode === "static" ? " selected" : ""}>Texto fijo</option><option value="marquee"${mode === "marquee" ? " selected" : ""}>Cinta continua</option></select></label>
        <label class="store-preview-animation-field"><span>Altura</span><select data-canvas-announcement="announcementSize" aria-label="Altura de la marquesina"><option value="small"${size === "small" ? " selected" : ""}>Compacta</option><option value="medium"${size === "medium" ? " selected" : ""}>Mediana</option><option value="large"${size === "large" ? " selected" : ""}>Grande</option></select></label>
        <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-announcement="announcementFont" aria-label="Tipografía de la marquesina"><option value="store"${font === "store" ? " selected" : ""}>Fuente de tienda</option><option value="modern"${font === "modern" ? " selected" : ""}>Moderna</option><option value="editorial"${font === "editorial" ? " selected" : ""}>Editorial</option><option value="friendly"${font === "friendly" ? " selected" : ""}>Cercana</option><option value="classic"${font === "classic" ? " selected" : ""}>Clásica</option><option value="geometric"${font === "geometric" ? " selected" : ""}>Geométrica</option><option value="artisan"${font === "artisan" ? " selected" : ""}>Artesanal</option><option value="condensed"${font === "condensed" ? " selected" : ""}>Condensada</option><option value="luxury"${font === "luxury" ? " selected" : ""}>Alta moda</option></select></label>
        <label class="store-preview-animation-field"><span>Efecto</span><select data-canvas-announcement="announcementEffect" aria-label="Efecto de letras"><option value="none"${effect === "none" ? " selected" : ""}>Sin efecto</option><option value="wave"${effect === "wave" ? " selected" : ""}>Onda</option><option value="pulse"${effect === "pulse" ? " selected" : ""}>Pulso</option><option value="sparkle"${effect === "sparkle" ? " selected" : ""}>Destello</option></select></label>
      </div>
      <div class="store-preview-announcement-finish">
        ${mode === "marquee" ? `<label class="store-preview-toolbar-speed"><span>Duración de la vuelta</span><input type="range" min="8" max="40" step="1" value="${speed}" data-canvas-announcement="announcementSpeed" aria-label="Segundos por vuelta"><output>${speed}s</output></label>` : ""}
        <label class="store-preview-toolbar-color" title="Color de fondo"><span class="sr-only">Color de fondo</span><input type="color" data-canvas-announcement="announcementColor" value="${color}" aria-label="Color de fondo de la marquesina"></label>
      </div>
      ${storePreviewPaletteHtml(paletteColors, "announcement", color, "Fondo")}
      <footer><span class="store-preview-footer-help">Al quitarla se oculta de la tienda; puedes deshacer antes de guardar.</span><span class="store-preview-animation-spacer"></span><button type="button" class="danger" data-canvas-announcement-remove>Quitar marquesina</button></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-announcement-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-canvas-announcement]").forEach((control) => {
      const preview = () => {
        const key = control.dataset.canvasAnnouncement;
        if (key === "announcementColor" && /^#[0-9a-f]{6}$/i.test(control.value)) {
          target.dataset.announcementColor = control.value;
          target.style.setProperty("--announcement-bg", control.value);
          target.style.setProperty("--announcement-ink", accentContrastColor(control.value));
        }
        if (key === "announcementSpeed") {
          target.dataset.announcementSpeed = control.value;
          target.style.setProperty("--marquee-duration", `${control.value}s`);
          control.nextElementSibling?.replaceChildren(`${control.value}s`);
        }
        if (key === "announcementFont") {
          Array.from(target.classList)
            .filter((className) => className.startsWith("announcement-font-"))
            .forEach((className) => target.classList.remove(className));
          target.classList.add(`announcement-font-${control.value}`);
          target.dataset.announcementFont = control.value;
        }
      };
      const send = () => {
        const key = control.dataset.canvasAnnouncement;
        const value = control instanceof HTMLInputElement && control.type === "range" ? Number(control.value) : control.value;
        preview();
        postToParent("STORE_EDITOR_ANNOUNCEMENT_STYLE", { selection, key, value });
      };
      if (control instanceof HTMLInputElement && ["color", "range"].includes(control.type)) control.addEventListener("input", preview);
      control.addEventListener("change", send);
    });
    bindStorePreviewPalette(toolbar, {
      announcement: toolbar.querySelector<HTMLInputElement>('[data-canvas-announcement="announcementColor"]'),
    });
    toolbar.querySelector<HTMLTextAreaElement>("[data-canvas-announcement-text]")?.addEventListener("change", (event) => {
      postToParent("STORE_EDITOR_INLINE_TEXT", { selection, value: (event.currentTarget as HTMLTextAreaElement).value });
    });
    toolbar.querySelector("[data-canvas-announcement-remove]")?.addEventListener("click", () => {
      postToParent("STORE_EDITOR_ANNOUNCEMENT_REMOVE", { selection });
    });
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "brand" && selection.field === "storeName") {
    const brandStyle = renderedStore?.siteDocument?.navigation?.brandStyle;
    const scale = Math.min(200, Math.max(50, Number(target.dataset.canvasTextScale || brandStyle?.textScale || 100)));
    const fontStyle = target.dataset.animationFontStyle || brandStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
    const color = /^#[0-9a-f]{6}$/i.test(target.dataset.canvasTextColor || "")
      ? target.dataset.canvasTextColor!
      : /^#[0-9a-f]{6}$/i.test(brandStyle?.textColor || "")
        ? brandStyle!.textColor!
        : renderedStore?.siteDocument?.theme?.textColor || "#171717";
    const fontOptions = [
      ["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"],
      ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"],
    ].map(([value, label]) => `<option value="${value}"${fontStyle === value ? " selected" : ""}>${label}</option>`).join("");
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-brand-popover">
      <header><strong>Heading superior</strong><span>Nombre de la tienda</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <div class="store-preview-animation-fields store-preview-brand-appearance">
        <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-brand-font aria-label="Tipografía del nombre de la tienda">${fontOptions}</select></label>
        <label class="store-preview-animation-field"><span>Color</span><span class="store-preview-brand-color-control"><input type="color" data-canvas-brand-color value="${color}" aria-label="Color del nombre de la tienda"><output data-canvas-brand-color-output>${color.toUpperCase()}</output></span></label>
      </div>
      ${storePreviewPaletteHtml(paletteColors, "brand-text", color, "Color del heading")}
      <section class="store-preview-section-height-control store-preview-brand-scale" aria-labelledby="store-preview-brand-scale-title">
        <div><strong id="store-preview-brand-scale-title">Tamaño del heading</strong><span>50–200%</span></div>
        <label><span class="sr-only">Tamaño del nombre de la tienda</span><input type="range" min="50" max="200" step="5" value="${scale}" data-canvas-brand-scale aria-valuetext="${scale}%"></label>
        <output data-canvas-brand-scale-output>${scale}%</output>
      </section>
      <p class="store-preview-footer-help">Ajusta el título de la parte superior sin cerrar Yapi.</p>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-brand-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    const scaleControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-brand-scale]");
    const previewScale = () => {
      if (!scaleControl) return;
      const value = Math.min(200, Math.max(50, Number(scaleControl.value) || 100));
      target.dataset.canvasTextScale = String(value);
      target.style.setProperty("--canvas-text-scale", String(value / 100));
      scaleControl.setAttribute("aria-valuetext", `${value}%`);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-brand-scale-output]")?.replaceChildren(`${value}%`);
    };
    scaleControl?.addEventListener("input", previewScale);
    scaleControl?.addEventListener("change", () => {
      previewScale();
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "textScale", value: Number(scaleControl.value) });
    });
    toolbar.querySelector<HTMLSelectElement>("[data-canvas-brand-font]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      target.dataset.animationFontStyle = value;
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "fontStyle", value });
    });
    const colorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-brand-color]");
    colorControl?.addEventListener("input", () => {
      target.dataset.canvasTextColor = colorControl.value;
      target.style.setProperty("--canvas-text-color", colorControl.value);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-brand-color-output]")?.replaceChildren(colorControl.value.toUpperCase());
    });
    colorControl?.addEventListener("change", () => {
      postToParent("STORE_EDITOR_TEXT_STYLE", { selection, key: "textColor", value: colorControl.value });
    });
    bindStorePreviewPalette(toolbar, { "brand-text": colorControl });
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "products" && selection.field === "categoryBanner" && selection.itemId) {
    toolbar.innerHTML = `<button type="button" data-canvas-category-cover><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4h14v12H3zM3 13l4-4 3 3 2-2 5 5M13.5 7.5h.01"/></svg><span>Cambiar portada</span></button>`;
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelector("[data-canvas-category-cover]")?.addEventListener("click", () => beginStorePreviewInlineImageEdit(selection));
    return;
  }
  if (selection.section === "navigation") {
    const siteDocument = renderedStore?.siteDocument;
    const siteSections = siteDocument?.sections ?? [];
    const sitePages = siteDocument?.pages ?? [];
    const navigationItems = siteDocument?.navigation?.items?.length
      ? siteDocument.navigation.items
      : [
          { id: "home", label: "Inicio", target: "home" as const },
          { id: "catalog", label: "Catálogo", target: "catalog" as const },
          ...siteSections
            .filter((section) => !["hero", "catalog", "links"].includes(section.kind))
            .slice(0, 6)
            .map((section) => ({ id: `section-${section.id}`.slice(0, 48), label: section.title || "Sección", target: "section" as const, sectionId: section.id })),
        ];
    const brandScale = Math.min(200, Math.max(50, Number(siteDocument?.navigation?.brandStyle?.textScale || 100)));
    const brandFontStyle = siteDocument?.navigation?.brandStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
    const brandColor = /^#[0-9a-f]{6}$/i.test(siteDocument?.navigation?.brandStyle?.textColor || "")
      ? siteDocument!.navigation.brandStyle!.textColor!
      : siteDocument?.theme?.textColor || "#171717";
    const navigation = siteDocument?.navigation;
    const legacyLayout = navigation?.layout || "brand-left";
    const brandPosition = navigation?.brandPosition || (legacyLayout === "centered" ? "center" : "left");
    const navPosition = navigation?.navPosition || (legacyLayout === "split" ? "left" : "center");
    const option = (value: string, label: string, current: string) => `<option value="${value}"${value === current ? " selected" : ""}>${label}</option>`;
    const brandFontOptions = [["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"], ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"]]
      .map(([value, label]) => option(value, label, brandFontStyle)).join("");
    const destinationOptions = (item: { target: "home" | "catalog" | "section" | "page"; sectionId?: string; pageId?: string }) => {
      const selected = item.target === "section" ? `section:${item.sectionId || ""}` : item.target === "page" ? `page:${item.pageId || ""}` : item.target;
      return `<option value="home"${selected === "home" ? " selected" : ""}>Inicio de la tienda</option>
        <option value="catalog"${selected === "catalog" ? " selected" : ""}>Catálogo</option>
        ${sitePages.map((page) => `<option value="page:${escapeHtml(page.id)}"${selected === `page:${page.id}` ? " selected" : ""}>Página: ${escapeHtml(page.label)}</option>`).join("")}
        ${siteSections.map((section) => `<option value="section:${escapeHtml(section.id)}"${selected === `section:${section.id}` ? " selected" : ""}>${escapeHtml(section.title || "Sección")}</option>`).join("")}`;
    };
    const navigationDestinationUrl = (item: { target: "home" | "catalog" | "section" | "page"; pageId?: string }) => {
      const storefrontSlug = activePreviewStore?.slug ?? storefrontRouteFromLocation().slug;
      if (!storefrontSlug) return "";
      if (item.target === "home") return storeCatalogUrl(storefrontSlug);
      if (item.target === "catalog") return storeCollectionUrl(storefrontSlug, "ALL");
      if (item.target === "page") {
        const page = sitePages.find((candidate) => candidate.id === item.pageId);
        return page ? storePageUrl(storefrontSlug, page.slug) : "";
      }
      return "";
    };
    const collections = siteDocument?.merchandising.collections ?? [];
    const collectionEditorHtml = `<section class="store-preview-collections-editor" aria-labelledby="store-preview-collections-title">
      <div class="store-preview-structure-heading"><strong id="store-preview-collections-title">Menú desplegable de colecciones</strong><span>Se abre al pasar el cursor por el enlace del catálogo.</span></div>
      <p class="store-preview-footer-help">Crea colecciones y marca qué productos aparecen en cada una. El enlace “Catálogo” cambiará a “Colecciones” al crear la primera.</p>
      <div class="store-preview-collections-list">${collections.map((collection, collectionIndex) => `<details class="store-preview-collection-row"${collectionIndex === 0 ? " open" : ""}>
        <summary><strong>${escapeHtml(collection.name)}</strong><span>${collection.productIds.length} ${collection.productIds.length === 1 ? "producto" : "productos"}</span></summary>
        <div class="store-preview-collection-fields">
          <label class="store-preview-animation-field"><span>Nombre visible</span><input data-canvas-collection-name="${collectionIndex}" maxlength="60" value="${escapeHtml(collection.name)}"></label>
          <div class="store-preview-collection-products" role="group" aria-label="Productos de ${escapeHtml(collection.name)}">${(renderedStore?.items ?? []).map((product) => `<label><input type="checkbox" data-canvas-collection-product="${collectionIndex}" value="${escapeHtml(product.id)}"${collection.productIds.includes(product.id) ? " checked" : ""}><span>${escapeHtml(product.name)}</span></label>`).join("") || "<p>No hay productos disponibles todavía.</p>"}</div>
          <button type="button" class="danger" data-canvas-collection-remove="${collectionIndex}">Quitar colección</button>
        </div>
      </details>`).join("") || '<p class="store-preview-collection-empty">Todavía no hay colecciones. Crea la primera y asígnale productos.</p>'}</div>
      <button type="button" data-canvas-collection-add${collections.length >= 12 ? " disabled" : ""}>+ Crear colección</button>
    </section>`;
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-structure-popover store-preview-navigation-popover">
      <header><strong>Encabezado</strong><span>Diseño, posición y enlaces</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <section class="store-preview-header-settings" aria-labelledby="store-preview-header-layout-title">
        <div><strong id="store-preview-header-layout-title">Forma y posición</strong><span>Todos los cambios se ven aquí mismo.</span></div>
        <div class="store-preview-animation-fields">
          <label class="store-preview-animation-field"><span>Logo</span><select data-canvas-navigation-style="logoTreatment">${option("mark", "Símbolo", navigation?.logoTreatment || "wordmark")}${option("wordmark", "Nombre y logo", navigation?.logoTreatment || "wordmark")}${option("oversized", "Logo protagonista", navigation?.logoTreatment || "wordmark")}${option("seal", "Sello", navigation?.logoTreatment || "wordmark")}</select></label>
          <label class="store-preview-animation-field"><span>Logo y marca</span><select data-canvas-navigation-style="brandPosition">${option("left", "Izquierda", brandPosition)}${option("center", "Centro", brandPosition)}${option("right", "Derecha", brandPosition)}</select></label>
          <label class="store-preview-animation-field"><span>Menú</span><select data-canvas-navigation-style="navPosition">${option("left", "Izquierda", navPosition)}${option("center", "Centro", navPosition)}${option("right", "Derecha", navPosition)}</select></label>
          <label class="store-preview-animation-field"><span>Búsqueda</span><select data-canvas-navigation-style="searchPosition">${option("left", "Izquierda", navigation?.searchPosition || "right")}${option("right", "Derecha", navigation?.searchPosition || "right")}</select></label>
          <label class="store-preview-animation-field"><span>Perfil</span><select data-canvas-navigation-style="profilePosition">${option("left", "Izquierda", navigation?.profilePosition || "right")}${option("right", "Derecha", navigation?.profilePosition || "right")}</select></label>
          <label class="store-preview-animation-field"><span>Carrito</span><select data-canvas-navigation-style="cartPosition">${option("left", "Izquierda", navigation?.cartPosition || "right")}${option("right", "Derecha", navigation?.cartPosition || "right")}</select></label>
        </div>
        <div class="store-preview-header-toggles">
          <label><input type="checkbox" data-canvas-navigation-style="sticky"${navigation?.sticky !== false ? " checked" : ""}><span>Fijar al desplazarse</span></label>
          <label><input type="checkbox" data-canvas-navigation-style="transparent"${navigation?.transparent === true ? " checked" : ""}><span>Fondo translúcido</span></label>
        </div>
      </section>
      <section class="store-preview-header-settings" aria-labelledby="store-preview-navigation-brand-style-title">
        <div><strong id="store-preview-navigation-brand-style-title">Apariencia de la marca</strong><span>Fuente y color independientes del resto del sitio.</span></div>
        <div class="store-preview-animation-fields store-preview-brand-appearance">
          <label class="store-preview-animation-field"><span>Tipografía</span><select data-canvas-navigation-brand-font>${brandFontOptions}</select></label>
          <label class="store-preview-animation-field"><span>Color</span><span class="store-preview-brand-color-control"><input type="color" data-canvas-navigation-brand-color value="${brandColor}" aria-label="Color del nombre de la tienda"><output data-canvas-navigation-brand-color-output>${brandColor.toUpperCase()}</output></span></label>
        </div>
        ${storePreviewPaletteHtml(paletteColors, "navigation-brand-text", brandColor, "Color del heading")}
      </section>
      <section class="store-preview-section-height-control store-preview-brand-scale" aria-labelledby="store-preview-navigation-brand-scale-title">
        <div><strong id="store-preview-navigation-brand-scale-title">Tamaño del heading superior</strong><span>Nombre de la tienda</span></div>
        <label><span class="sr-only">Tamaño del nombre de la tienda</span><input type="range" min="50" max="200" step="5" value="${brandScale}" data-canvas-navigation-heading-scale aria-valuetext="${brandScale}%"></label>
        <output data-canvas-navigation-heading-scale-output>${brandScale}%</output>
      </section>
      <div class="store-preview-structure-heading"><strong>Enlaces visibles</strong><span>Cambia el texto o el destino.</span></div>
      <div class="store-preview-structure-list">${navigationItems.map((item, index) => `<section class="store-preview-structure-row" data-canvas-navigation-row="${index}">
        <label class="store-preview-animation-field"><span>Texto del enlace ${index + 1}</span><input data-canvas-navigation-label="${index}" maxlength="40" value="${escapeHtml(item.label)}"></label>
        <label class="store-preview-animation-field"><span>Destino</span><select data-canvas-navigation-target="${index}">${destinationOptions(item)}</select></label>
        <div class="store-preview-structure-actions">${navigationDestinationUrl(item) ? `<button type="button" data-canvas-navigation-open="${escapeHtml(navigationDestinationUrl(item))}" aria-label="Abrir ${escapeHtml(item.label)} en la vista previa">Abrir</button>` : ""}<button type="button" class="danger store-preview-structure-remove" data-canvas-navigation-remove="${index}" aria-label="Quitar ${escapeHtml(item.label)}">Quitar</button></div>
      </section>`).join("")}</div>
      ${collectionEditorHtml}
      <footer><button type="button" data-canvas-navigation-add${navigationItems.length >= 8 ? " disabled" : ""}>+ Agregar enlace</button><span class="store-preview-animation-spacer"></span></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover", "is-navigation-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-navigation-label]").forEach((control) => {
      const updateDraft = () => updateStorePreviewNavigationDraft(Number(control.dataset.canvasNavigationLabel), "label", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "update", index: Number(control.dataset.canvasNavigationLabel), key: "label", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLSelectElement>("[data-canvas-navigation-target]").forEach((control) => control.addEventListener("change", () => {
      updateStorePreviewNavigationDraft(Number(control.dataset.canvasNavigationTarget), "target", control.value);
      postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "update", index: Number(control.dataset.canvasNavigationTarget), key: "target", value: control.value });
    }));
    toolbar.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-canvas-navigation-style]").forEach((control) => control.addEventListener("change", () => {
      const key = control.dataset.canvasNavigationStyle;
      const value = control instanceof HTMLInputElement && control.type === "checkbox" ? control.checked : control.value;
      postToParent("STORE_EDITOR_NAVIGATION_STYLE", { key, value });
    }));
    const headingScaleControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-heading-scale]");
    const previewHeadingScale = () => {
      if (!headingScaleControl) return;
      const value = Math.min(200, Math.max(50, Number(headingScaleControl.value) || 100));
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) {
        storeTitle.dataset.canvasTextScale = String(value);
        storeTitle.style.setProperty("--canvas-text-scale", String(value / 100));
      }
      headingScaleControl.setAttribute("aria-valuetext", `${value}%`);
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-navigation-heading-scale-output]")?.replaceChildren(`${value}%`);
    };
    headingScaleControl?.addEventListener("input", previewHeadingScale);
    headingScaleControl?.addEventListener("change", () => {
      previewHeadingScale();
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "textScale",
        value: Number(headingScaleControl.value),
      });
    });
    toolbar.querySelector<HTMLSelectElement>("[data-canvas-navigation-brand-font]")?.addEventListener("change", (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) storeTitle.dataset.animationFontStyle = value;
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "fontStyle",
        value,
      });
    });
    const navigationBrandColorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-navigation-brand-color]");
    navigationBrandColorControl?.addEventListener("input", () => {
      const storeTitle = app.querySelector<HTMLElement>(".store-title");
      if (storeTitle) {
        storeTitle.dataset.canvasTextColor = navigationBrandColorControl.value;
        storeTitle.style.setProperty("--canvas-text-color", navigationBrandColorControl.value);
      }
      toolbar.querySelector<HTMLOutputElement>("[data-canvas-navigation-brand-color-output]")?.replaceChildren(navigationBrandColorControl.value.toUpperCase());
    });
    navigationBrandColorControl?.addEventListener("change", () => {
      postToParent("STORE_EDITOR_TEXT_STYLE", {
        selection: { section: "brand", field: "storeName", label: "nombre de la tienda" },
        key: "textColor",
        value: navigationBrandColorControl.value,
      });
    });
    bindStorePreviewPalette(toolbar, { "navigation-brand-text": navigationBrandColorControl });
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-navigation-remove]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "remove", index: Number(button.dataset.canvasNavigationRemove) });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-navigation-open]").forEach((button) => button.addEventListener("click", () => {
      const url = button.dataset.canvasNavigationOpen;
      if (url) window.location.href = url;
    }));
    toolbar.querySelector("[data-canvas-navigation-add]")?.addEventListener("click", () => postToParent("STORE_EDITOR_NAVIGATION_FIELD", { action: "add" }));
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-collection-name]").forEach((control) => control.addEventListener("change", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "rename", index: Number(control.dataset.canvasCollectionName), value: control.value });
    }));
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-collection-product]").forEach((control) => control.addEventListener("change", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "product", index: Number(control.dataset.canvasCollectionProduct), productId: control.value, selected: control.checked });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-collection-remove]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "remove", index: Number(button.dataset.canvasCollectionRemove) });
    }));
    toolbar.querySelector("[data-canvas-collection-add]")?.addEventListener("click", () => postToParent("STORE_EDITOR_COLLECTION_FIELD", { action: "add" }));
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  if (selection.section === "footer") {
    const footer = renderedStore?.siteDocument?.footer;
    if (!footer) {
      toolbar.hidden = true;
      return;
    }
    const footerField = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
      ? `<textarea data-canvas-footer-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
      : `<input data-canvas-footer-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
    const fieldMap: Record<string, { key: string; label: string; value: string; maxlength: number; multiline?: boolean }> = {
      footerBrandDescription: { key: "brandDescription", label: "Descripción de la marca", value: footer.brandDescription || "", maxlength: 320, multiline: true },
      footerCopyright: { key: "copyright", label: "Texto inferior", value: footer.copyright || "", maxlength: 160 },
      footerBadge: { key: "badge", label: "Sello", value: footer.badge || "", maxlength: 80 },
    };
    if (selection.field === "footerColumnTitle" && Number.isInteger(selection.itemIndex)) {
      fieldMap.footerColumnTitle = { key: "columnTitle", label: "Título de la columna", value: footer.columns?.[selection.itemIndex!]?.title || "", maxlength: 60 };
    }
    if (selection.field === "footerItemLabel" && selection.itemId) {
      const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
      const item = footer.columns?.[columnIndex]?.items?.[itemIndex];
      fieldMap.footerItemLabel = { key: "itemLabel", label: "Texto del enlace", value: item?.label || "", maxlength: 100 };
      fieldMap.footerItemHref = { key: "itemHref", label: "Destino del enlace", value: item?.href || "", maxlength: 500 };
    }
    const selectedFields: Array<{ key: string; label: string; value: string; maxlength: number; multiline?: boolean }> = [];
    if (selection.field === "section") {
      selectedFields.push(
        { key: "brandDescription", label: "Descripción de la marca", value: footer.brandDescription || "", maxlength: 320, multiline: true },
        { key: "copyright", label: "Texto inferior", value: footer.copyright || "", maxlength: 160 },
        { key: "badge", label: "Sello", value: footer.badge || "", maxlength: 80 },
      );
    } else {
      if (fieldMap[selection.field]) selectedFields.push(fieldMap[selection.field]);
      if (selection.field === "footerItemLabel" && fieldMap.footerItemHref) selectedFields.push(fieldMap.footerItemHref);
    }
    const footerStructure = footer.columns.map((column, columnIndex) => `<section class="store-preview-structure-group">
      <header><label class="store-preview-animation-field"><span>Columna ${columnIndex + 1}</span><input data-canvas-footer-column-title="${columnIndex}" maxlength="60" value="${escapeHtml(column.title)}"></label><button type="button" class="danger" data-canvas-footer-remove-column="${columnIndex}" aria-label="Quitar columna ${columnIndex + 1}">Quitar columna</button></header>
      <div class="store-preview-structure-items">${column.items.map((item, itemIndex) => `<div class="store-preview-structure-item">
        <label class="store-preview-animation-field"><span>Texto ${itemIndex + 1}</span><input data-canvas-footer-item-label="${columnIndex}:${itemIndex}" maxlength="100" value="${escapeHtml(item.label)}"></label>
        <label class="store-preview-animation-field"><span>Destino</span><input data-canvas-footer-item-href="${columnIndex}:${itemIndex}" maxlength="500" value="${escapeHtml(item.href)}" placeholder="#sección o https://"></label>
        <button type="button" class="danger store-preview-structure-remove" data-canvas-footer-remove-item="${columnIndex}:${itemIndex}" aria-label="Quitar ${escapeHtml(item.label)}">Quitar</button>
      </div>`).join("")}</div>
      <footer><button type="button" data-canvas-footer-add-item="${columnIndex}"${column.items.length >= 8 ? " disabled" : ""}>+ Agregar enlace</button></footer>
    </section>`).join("");
    toolbar.innerHTML = `<div class="store-preview-animation-popover store-preview-footer-popover store-preview-structure-popover">
      <header><strong>Pie de página</strong><span>Edita aquí mismo</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
      <div class="store-preview-animation-fields">${selectedFields.map((field) => footerField(field.key, field.label, field.value, field.maxlength, field.multiline)).join("")}</div>
      <p class="store-preview-footer-help">Agrega columnas y enlaces aquí. Cada destino puede ser una sección (#), una página (https://), un correo (mailto:) o un teléfono (tel:).</p>
      <div class="store-preview-structure-list">${footerStructure}</div>
      <footer><button type="button" data-canvas-footer-add-column${footer.columns.length >= 4 ? " disabled" : ""}>+ Agregar columna</button><span class="store-preview-animation-spacer"></span><button type="button" class="danger" data-canvas-hide-footer>Quitar pie de página</button></footer>
    </div>`;
    toolbar.classList.add("is-animation-popover");
    toolbar.hidden = false;
    positionStorePreviewCanvasToolbar(toolbar, target);
    toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-canvas-footer-field]").forEach((control) => {
      const key = control.dataset.canvasFooterField as "brandDescription" | "copyright" | "badge" | "columnTitle" | "itemLabel" | "itemHref";
      const updateDraft = () => updateStorePreviewFooterDraft(selection, key, control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection, key, value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-column-title]").forEach((control) => {
      const itemIndex = Number(control.dataset.canvasFooterColumnTitle);
      const fieldSelection = { section: "footer", field: "footerColumnTitle", label: `Columna ${itemIndex + 1}`, itemIndex } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "columnTitle", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "columnTitle", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-item-label]").forEach((control) => {
      const itemId = control.dataset.canvasFooterItemLabel;
      const fieldSelection = { section: "footer", field: "footerItemLabel", label: "Enlace del pie", itemId } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "itemLabel", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "itemLabel", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-footer-item-href]").forEach((control) => {
      const itemId = control.dataset.canvasFooterItemHref;
      const fieldSelection = { section: "footer", field: "footerItemLabel", label: "Enlace del pie", itemId } as StorePreviewEditorSelection;
      const updateDraft = () => updateStorePreviewFooterDraft(fieldSelection, "itemHref", control.value);
      control.addEventListener("input", updateDraft);
      control.addEventListener("change", () => {
        updateDraft();
        postToParent("STORE_EDITOR_FOOTER_FIELD", { selection: fieldSelection, key: "itemHref", value: control.value });
      });
    });
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-add-item]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-item", columnIndex: Number(button.dataset.canvasFooterAddItem) });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-remove-item]").forEach((button) => button.addEventListener("click", () => {
      const [columnIndex, itemIndex] = String(button.dataset.canvasFooterRemoveItem).split(":").map(Number);
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "remove-item", columnIndex, itemIndex });
    }));
    toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-footer-remove-column]").forEach((button) => button.addEventListener("click", () => {
      postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "remove-column", columnIndex: Number(button.dataset.canvasFooterRemoveColumn) });
    }));
    toolbar.querySelector("[data-canvas-footer-add-column]")?.addEventListener("click", () => postToParent("STORE_EDITOR_FOOTER_STRUCTURE", { action: "add-column" }));
    toolbar.querySelector("[data-canvas-hide-footer]")?.addEventListener("click", () => postToParent("STORE_EDITOR_FOOTER_FIELD", { selection, key: "enabled", value: false }));
    toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
      toolbar.className = "store-preview-canvas-toolbar";
      toolbar.hidden = true;
      toolbar.replaceChildren();
    });
    return;
  }
  const siteId = selection.section.startsWith("site-") ? selection.section.slice("site-".length) : "";
  const section = selection.animationId
    ? target.closest<HTMLElement>(".store-motion-section[data-animation-id]")
      ?? Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]")).find((candidate) => candidate.dataset.animationId === selection.animationId)
      ?? null
    : siteId
      ? target.closest<HTMLElement>(".bespoke-zone[data-site-section]")
        ?? Array.from(app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]")).find((candidate) => candidate.dataset.siteSection === siteId)
        ?? null
      : null;
  if (!section) {
    toolbar.hidden = true;
    return;
  }
  const textFields = new Set(["animationTitle", "animationSubtitle", "animationStyle", "title", "caption", "body", "textBlock", "siteTitle", "siteBody", "siteItemTitle", "siteItemBody", "siteBlockText"]);
  const isText = textFields.has(selection.field);
  const animation = renderedStore?.animations?.find((candidate) => candidate.id === selection.animationId);
  const siteSection = siteId ? renderedStore?.siteDocument?.sections?.find((candidate) => candidate.id === siteId) : undefined;
  const siteSectionLocked = Boolean(siteId && storePreviewLockedSectionIds.has(siteId));
  const siteHasAnimation = Boolean(siteSection && siteSection.motion !== "none");
  if (!animation && !siteSection) {
    toolbar.hidden = true;
    return;
  }
  const siteItem = siteSection && Number.isInteger(selection.itemIndex) ? siteSection.items?.[selection.itemIndex!] : undefined;
  const sectionViewport = activeSiteSectionViewport();
  const viewportHeight = siteSection
    ? sectionViewport === "mobile" ? siteSection.mobileHeightPx : siteSection.heightPx
    : undefined;
  const renderedHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(section.getBoundingClientRect().height || SITE_SECTION_MIN_HEIGHT)));
  const selectedSectionHeight = Number.isInteger(viewportHeight)
    ? viewportHeight!
    : sectionViewport === "mobile" && Number.isInteger(siteSection?.heightPx)
      ? siteSection!.heightPx!
      : renderedHeight;
  const siteSectionHeightControl = siteSection ? `<section class="store-preview-section-height-control" aria-labelledby="store-preview-section-height-title">
      <div><strong id="store-preview-section-height-title">Alto de la sección</strong><span>${sectionViewport === "mobile" ? "Móvil · imágenes y controles protegidos" : "Escritorio · el texto no cambia este límite"}</span></div>
      <label><span class="sr-only">Alto de la sección en píxeles</span><input type="range" min="${SITE_SECTION_MIN_HEIGHT}" max="${SITE_SECTION_MAX_HEIGHT}" step="10" value="${selectedSectionHeight}" data-canvas-section-height></label>
      <output data-canvas-section-height-output>${Number.isInteger(viewportHeight) ? `${selectedSectionHeight} px` : `Auto · ${selectedSectionHeight} px`}</output>
      <button type="button" data-canvas-section-height-reset${Number.isInteger(viewportHeight) ? "" : " disabled"}>Automático</button>
    </section>` : "";
  const findSiteBlock = (blocks: NonNullable<typeof siteSection>["blocks"] = []): NonNullable<NonNullable<typeof siteSection>["blocks"]>[number] | undefined => {
    for (const block of blocks ?? []) {
      if (block.id === selection.itemId) return block;
      const nested = findSiteBlock(block.children);
      if (nested) return nested;
    }
    return undefined;
  };
  const selectedSiteBlock = siteSection && selection.itemId ? findSiteBlock(siteSection.blocks) : undefined;
  const siteStyle = siteSection
    ? selectedSiteBlock?.style || (["siteBody", "siteItemBody"].includes(selection.field)
      ? (siteItem?.bodyStyle || siteSection.bodyStyle)
      : (siteItem?.titleStyle || siteSection.titleStyle))
    : undefined;
  const freeSiteBlock = Boolean(selectedSiteBlock && !["heading", "body", "action"].includes(selectedSiteBlock.id));
  const copy = animation ? target.closest<HTMLElement>("[data-animation-copy]") ?? section : target;
  const scale = Math.min(200, Math.max(50, Number(copy.dataset.animationTextScale || copy.dataset.canvasTextScale || section.dataset.animationTextScale || siteStyle?.textScale || 100)));
  const textWidth = Math.min(100, Math.max(20, Number(copy.dataset.canvasTextWidth || siteStyle?.textWidthPercent || 62)));
  const align = copy.dataset.animationTextAlign || copy.dataset.canvasTextAlign || section.dataset.animationTextAlign || siteStyle?.textAlign || siteSection?.align || "left";
  const fontStyle = copy.dataset.animationFontStyle || section.dataset.animationFontStyle || siteStyle?.fontStyle || document.body.dataset.fontStyle || "modern";
  const color = copy.dataset.animationTextColor || copy.dataset.canvasTextColor || section.dataset.animationTextColor || siteStyle?.textColor || siteSection?.textColor || "#171717";
  const background = section.dataset.animationBackground || "#ffffff";
  const textContrastBackground = siteSection?.backgroundColor || background;
  const hasLowTextContrast = Boolean(siteSection && colorContrastRatio(color, textContrastBackground) < 3);
  const fontOptions = [
    ["modern", "Moderna"], ["editorial", "Editorial"], ["friendly", "Cercana"], ["classic", "Clásica"], ["geometric", "Geométrica"], ["artisan", "Artesanal"], ["condensed", "Condensada"], ["luxury", "Alta moda"],
  ].map(([value, label]) => `<option value="${value}"${fontStyle === value ? " selected" : ""}>${label}</option>`).join("");
  const alignButton = (value: string, label: string, path: string) => `<button type="button" data-canvas-align="${value}" aria-label="${label}" aria-pressed="${align === value}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="${path}"/></svg></button>`;
  const styleControls = `<div class="store-preview-animation-style" aria-label="Estilo del texto">
      <label class="store-preview-toolbar-font"><span class="sr-only">Tipografía</span><select data-canvas-font aria-label="Tipografía del texto">${fontOptions}</select></label>
      <span class="store-preview-toolbar-size"><button type="button" data-canvas-size-step="-10" aria-label="Reducir texto">−</button><output data-canvas-size>${scale}%</output><button type="button" data-canvas-size-step="10" aria-label="Aumentar texto">+</button></span>
      ${isText && freeSiteBlock ? `<span class="store-preview-toolbar-size" title="Ancho del cuadro de texto"><button type="button" data-canvas-width-step="-5" aria-label="Estrechar cuadro de texto">−</button><output data-canvas-width>${textWidth}% ancho</output><button type="button" data-canvas-width-step="5" aria-label="Ensanchar cuadro de texto">+</button></span>` : ""}
      <label class="store-preview-toolbar-color" title="Color del texto"><span class="sr-only">Color del texto</span><input type="color" data-canvas-color value="${color}" aria-label="Color del texto"></label>
      ${siteSection ? `<span class="store-preview-contrast-warning" data-canvas-contrast-warning role="status" ${hasLowTextContrast ? "" : "hidden"}>Contraste bajo</span>` : ""}
      <span class="store-preview-toolbar-align" aria-label="Alineación">${alignButton("left", "Alinear a la izquierda", "M3 4h14M3 8h10M3 12h14M3 16h8")}${alignButton("center", "Centrar", "M3 4h14M5 8h10M3 12h14M6 16h8")}${alignButton("right", "Alinear a la derecha", "M3 4h14M7 8h10M3 12h14M9 16h8")}</span>
      ${storePreviewPaletteHtml(paletteColors, "text", color, "Paleta")}
    </div>`;
  const selectedMedia = animation && Number.isInteger(selection.itemIndex) ? animation.media[selection.itemIndex!] : undefined;
  const fieldInput = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
    ? `<textarea data-canvas-animation-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
    : `<input data-canvas-animation-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
  const siteFieldInput = (key: string, label: string, value: string, maxlength: number, multiline = false) => `<label class="store-preview-animation-field"><span>${label}</span>${multiline
    ? `<textarea data-canvas-site-field="${key}" maxlength="${maxlength}" rows="2">${escapeHtml(value)}</textarea>`
    : `<input data-canvas-site-field="${key}" maxlength="${maxlength}" value="${escapeHtml(value)}">`}</label>`;
  const productOptions = [`<option value="">Sin producto</option>`, ...(renderedStore?.items ?? []).map((item) => `<option value="${escapeHtml(item.id)}"${animation?.productId === item.id ? " selected" : ""}>${escapeHtml(item.name)}</option>`)].join("");
  const animationMediaRequirement = animation ? storeAnimationMediaRequirement(animation.type) : { min: 0, max: 0 };
  const missingAnimationMedia = animation ? Math.max(0, animationMediaRequirement.min - animation.media.length) : 0;
  const mediaActions = animation && animationMediaRequirement.max > 0
    ? `<div class="store-preview-animation-media" aria-label="Medios de la animación">${animation.media.map((media, index) => `<button type="button" data-canvas-media="${index}"${selection.itemIndex === index ? ` aria-pressed="true"` : ""} aria-label="Cambiar medio ${index + 1}"><span>${isVideoMediaUrl(media.imageUrl) ? "MP4" : "IMG"}</span>${index + 1}</button>`).join("")}${Array.from({ length: missingAnimationMedia }, (_, missingIndex) => {
        const index = animation.media.length + missingIndex;
        return `<button type="button" class="is-empty" data-canvas-add-media="${index}" aria-label="Agregar medio ${index + 1}"><span>+</span>${index + 1}</button>`;
      }).join("")}</div>`
    : "";
  const siteMediaActions = siteSection?.mediaUrls?.length
    ? `<div class="store-preview-animation-media" aria-label="Medios de la sección">${siteSection.mediaUrls.map((mediaUrl, index) => `<button type="button" data-canvas-site-media="${index}"${selection.itemIndex === index ? ` aria-pressed="true"` : ""} aria-label="Cambiar medio ${index + 1}"><span>${isVideoMediaUrl(mediaUrl) ? "MP4" : "IMG"}</span>${index + 1}</button>`).join("")}</div>`
    : "";
  const catalogProducts = renderedStore?.items ?? [];
  const recoverGeneratedPrimaryCatalog = Boolean(
    siteSection?.kind === "catalog"
    && !siteSection.pageId
    && Array.isArray(siteSection.productIds)
    && siteSection.productIds.length === 0
    && renderedStore?.siteDocument?.merchandising.productOrderIds.length,
  );
  const selectedCatalogIds = siteSection?.kind === "catalog"
    ? (Array.isArray(siteSection.productIds) && !recoverGeneratedPrimaryCatalog ? siteSection.productIds : catalogProducts.map((product) => product.id))
      .filter((productId) => catalogProducts.some((product) => product.id === productId))
    : [];
  const selectedCatalogIdSet = new Set(selectedCatalogIds);
  const selectedCatalogProducts = selectedCatalogIds
    .map((productId) => catalogProducts.find((product) => product.id === productId))
    .filter((product): product is StoreItem => Boolean(product));
  const catalogProductOption = (product: StoreItem) => {
    const imageUrl = assetUrl(product.imageUrls.find(Boolean) || null);
    const searchText = [product.name, ...product.tags].join(" ").toLocaleLowerCase("es");
    return `<label class="store-preview-catalog-product" data-canvas-catalog-option data-product-search="${escapeHtml(searchText)}">
      <input type="checkbox" data-canvas-catalog-product value="${escapeHtml(product.id)}"${selectedCatalogIdSet.has(product.id) ? " checked" : ""}>
      <span class="store-preview-catalog-product-media">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : `<span aria-hidden="true">${escapeHtml(product.name.slice(0, 1).toUpperCase())}</span>`}</span>
      <span class="store-preview-catalog-product-copy"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(formatAmount(product.amount, product.currency))}</small></span>
    </label>`;
  };
  const catalogProductsControl = siteSection?.kind === "catalog" && !siteItem
    ? `<section class="store-preview-catalog-editor" aria-labelledby="store-preview-catalog-title">
        <div class="store-preview-structure-heading"><strong id="store-preview-catalog-title">Productos de esta sección</strong><span>${selectedCatalogProducts.length} seleccionados</span></div>
        <p class="store-preview-footer-help">Selecciona aquí los productos que verá el cliente. El orden se guarda junto con la tienda.</p>
        ${catalogProducts.length ? `<label class="store-preview-animation-field"><span>Buscar en tu catálogo</span><input type="search" data-canvas-catalog-search placeholder="Nombre o etiqueta" autocomplete="off"></label>
          ${selectedCatalogProducts.length ? `<div class="store-preview-catalog-order" aria-label="Orden de productos seleccionados">${selectedCatalogProducts.map((product, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(product.name)}</strong><button type="button" data-canvas-catalog-move="${escapeHtml(product.id)}" data-direction="-1" aria-label="Mover ${escapeHtml(product.name)} antes"${index === 0 ? " disabled" : ""}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button><button type="button" data-canvas-catalog-move="${escapeHtml(product.id)}" data-direction="1" aria-label="Mover ${escapeHtml(product.name)} después"${index === selectedCatalogProducts.length - 1 ? " disabled" : ""}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>`).join("")}</div>` : ""}
          <div class="store-preview-catalog-products" role="group" aria-label="Elegir productos">${catalogProducts.map(catalogProductOption).join("")}</div>
          <p class="store-preview-catalog-empty" data-canvas-catalog-empty hidden>No encontramos productos con ese nombre.</p>`
        : '<p class="store-preview-collection-empty">Todavía no hay productos activos. Créalo en Productos y volverá a aparecer aquí.</p>'}
      </section>`
    : "";
  const compatibleSiteMotions: Record<string, string[]> = {
    hero: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    story: ["none", "reveal", "clip", "drift", "parallax", "story-scroll"],
    gallery: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    catalog: ["none", "reveal", "drift", "scale"],
    contact: ["none", "reveal", "drift"],
    location: ["none", "reveal", "clip", "parallax"],
    links: ["none", "reveal", "drift"],
  };
  const compatibleSiteLayouts: Record<string, string[]> = {
    hero: ["split", "full-bleed", "centered", "offset"],
    story: ["split", "offset", "stacked", "rail"],
    gallery: ["grid", "offset", "stacked", "rail"],
    catalog: ["grid", "stacked", "minimal"],
    contact: ["split", "stacked", "minimal"], location: ["split", "stacked", "minimal"], links: ["centered", "minimal"],
  };
  const siteMotionOptions = [["none", "Sin movimiento"], ["reveal", "Revelar"], ["clip", "Recorte"], ["drift", "Desplazar"], ["scale", "Escalar"], ["parallax", "Parallax"], ["story-scroll", "Historia al scroll"]]
    .filter(([value]) => compatibleSiteMotions[siteSection?.kind || ""]?.includes(value) || siteSection?.motion === value)
    .map(([value, label]) => `<option value="${value}"${siteSection?.motion === value ? " selected" : ""}>${label}</option>`).join("");
  const siteLayoutOptions = [["split", "Dividida"], ["full-bleed", "Pantalla completa"], ["centered", "Centrada"], ["offset", "Desplazada"], ["grid", "Cuadrícula"], ["stacked", "Apilada"], ["rail", "Carril"], ["minimal", "Mínima"]]
    .filter(([value]) => compatibleSiteLayouts[siteSection?.kind || ""]?.includes(value) || siteSection?.layout === value)
    .map(([value, label]) => `<option value="${value}"${siteSection?.layout === value ? " selected" : ""}>${label}</option>`).join("");
  const textSectionMoveControl = freeSiteBlock && siteSection && (renderedStore?.siteDocument?.sections?.length ?? 0) > 1
    ? `<label class="store-preview-toolbar-font" title="Mover este texto a otra sección"><span class="sr-only">Mover texto a sección</span><select data-canvas-move-text-section aria-label="Mover texto a otra sección"><option value="">Mover a…</option>${renderedStore!.siteDocument!.sections.filter((candidate) => candidate.id !== siteSection.id).map((candidate) => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.title || candidate.kind)}</option>`).join("")}</select></label>`
    : "";
  toolbar.innerHTML = isText
    ? `${styleControls}
      <span class="store-preview-toolbar-divider" aria-hidden="true"></span>
      ${animation ? `<button type="button" data-canvas-animation-settings aria-label="Abrir opciones de esta animación" title="Opciones de la animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h7M14 15h3"/><circle cx="13" cy="5" r="2"/><circle cx="7" cy="10" r="2"/><circle cx="12" cy="15" r="2"/></svg><span>Animación</span></button>
        <button type="button" data-canvas-copy aria-label="Copiar texto" title="Copiar · Ctrl/Cmd+C"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1"/><path d="M4 13V4h9"/></svg></button>
        <button type="button" data-canvas-paste aria-label="Pegar texto" title="Pegar · Ctrl/Cmd+V"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        <button type="button" data-canvas-duplicate aria-label="Duplicar texto" title="Duplicar · Ctrl/Cmd+D"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        ${selection.field === "textBlock" ? `<button type="button" class="danger" data-canvas-delete-text aria-label="Eliminar este texto" title="Eliminar texto"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Eliminar texto</span></button>` : ""}` : `<button type="button" data-canvas-site-settings aria-label="Abrir opciones de esta sección animada" title="Opciones de la sección"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h8M15 5h2M3 10h2M9 10h8M3 15h7M14 15h3"/><circle cx="13" cy="5" r="2"/><circle cx="7" cy="10" r="2"/><circle cx="12" cy="15" r="2"/></svg><span>Sección</span></button>
        <button type="button" data-canvas-copy aria-label="Copiar texto" title="Copiar · Ctrl/Cmd+C"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1"/><path d="M4 13V4h9"/></svg></button>
        <button type="button" data-canvas-paste aria-label="Pegar texto" title="Pegar · Ctrl/Cmd+V"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button>
        <button type="button" data-canvas-duplicate aria-label="Duplicar texto" title="Duplicar · Ctrl/Cmd+D"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="6" y="6" width="10" height="10" rx="1"/><path d="M3 12V3h9M11 8v6M8 11h6"/></svg></button><button type="button" class="danger" data-canvas-delete-text aria-label="Eliminar este texto" title="Eliminar texto"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Eliminar texto</span></button>${textSectionMoveControl}`}`
    : animation ? `<div class="store-preview-animation-popover">
        <header><strong>${escapeHtml(animation.name || STORE_MOTION_EXPERIENCE_LABELS[animation.type])}</strong><span>${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[animation.type])}${selectedMedia ? ` · escena ${selection.itemIndex! + 1}` : ""}</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        ${styleControls}
        ${missingAnimationMedia ? `<div class="store-preview-animation-incomplete" role="status"><strong>Completa esta animación</strong><span>Agrega ${missingAnimationMedia} ${missingAnimationMedia === 1 ? "archivo" : "archivos"} para verla terminada. Acepta imágenes, GIF, MP4 y WebM.</span></div>` : ""}
        <div class="store-preview-animation-fields">${selectedMedia
          ? `${fieldInput("title", "Título de escena", selectedMedia.title || "", 100)}${fieldInput("caption", "Subtítulo", selectedMedia.caption || "", 180)}${fieldInput("body", "Texto", selectedMedia.body || "", 360, true)}`
          : `${fieldInput("title", "Título", animation.title || "", 100)}${fieldInput("subtitle", "Subtítulo", animation.subtitle || "", 220)}`}</div>
        ${mediaActions}
        ${!selectedMedia ? `<div class="store-preview-animation-fields is-secondary"><label class="store-preview-animation-field"><span>Producto</span><select data-canvas-animation-field="productId">${productOptions}</select></label>${fieldInput("buttonLabel", "Texto del botón", animation.buttonLabel || "", 36)}</div>` : ""}
        ${storePreviewPaletteHtml(paletteColors, "animation-background", background, "Fondo")}
        <footer>
          <button type="button" data-canvas-add-text="title">+ Título</button><button type="button" data-canvas-add-text="subtitle">+ Subtítulo</button>
          <label class="store-preview-toolbar-color" title="Fondo de la sección"><span class="sr-only">Fondo de la sección</span><input type="color" data-canvas-background value="${background}" aria-label="Fondo de la sección"></label>
          <span class="store-preview-animation-spacer"></span>
          <button type="button" data-canvas-move="-1" aria-label="Mover sección arriba" title="Mover arriba"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button>
          <button type="button" data-canvas-move="1" aria-label="Mover sección abajo" title="Mover abajo"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>
          <button type="button" class="danger" data-canvas-delete-animation aria-label="Eliminar esta animación" title="Eliminar animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg></button>
        </footer>
      </div>` : `<div class="store-preview-animation-popover">
        <header><strong>${escapeHtml(siteSection?.title || "Sección")}</strong><span>${escapeHtml(siteHasAnimation ? (siteSection?.kind === "hero" ? "Portada animada" : siteSection?.kind === "story" ? "Historia animada" : "Sección animada") : (siteSection?.kind === "hero" ? "Portada" : siteSection?.kind === "story" ? "Historia" : "Sección"))}${siteItem ? ` · escena ${selection.itemIndex! + 1}` : ""}</span><button type="button" data-canvas-close aria-label="Cerrar opciones"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15"/></svg></button></header>
        ${styleControls}
        ${siteSectionHeightControl}
        <div class="store-preview-animation-fields">${selectedSiteBlock
          ? `${siteFieldInput("text", selectedSiteBlock.kind === "heading" ? "Título" : selectedSiteBlock.kind === "action" ? "Botón" : "Texto", selectedSiteBlock.text || "", selectedSiteBlock.kind === "action" ? 40 : selectedSiteBlock.kind === "heading" ? 120 : 600, selectedSiteBlock.kind === "text")}`
          : siteItem
          ? `${siteFieldInput("title", "Título de escena", siteItem.title || "", 100)}${siteFieldInput("body", "Texto de escena", siteItem.body || "", 320, true)}`
          : `${siteFieldInput("title", "Título", siteSection?.title || "", 120)}${siteFieldInput("body", "Texto", siteSection?.body || "", 600, true)}`}</div>
        ${siteMediaActions}
        ${catalogProductsControl}
        ${!siteItem ? `<div class="store-preview-animation-fields is-secondary"><label class="store-preview-animation-field"><span>Movimiento</span><select data-canvas-site-field="motion">${siteMotionOptions}</select></label><label class="store-preview-animation-field"><span>Composición</span><select data-canvas-site-field="layout">${siteLayoutOptions}</select></label></div>` : ""}
        ${storePreviewPaletteHtml(paletteColors, "site-background", siteSection?.backgroundColor || "#ffffff", "Fondo")}
        <footer><button type="button" data-canvas-add-text="title">+ Título</button><button type="button" data-canvas-add-text="subtitle">+ Texto</button><label class="store-preview-toolbar-color" title="Fondo de la sección"><span class="sr-only">Fondo de la sección</span><input type="color" data-canvas-site-background value="${siteSection?.backgroundColor || "#ffffff"}" aria-label="Fondo de la sección"></label><button type="button" data-canvas-section-lock aria-pressed="${siteSectionLocked}" title="${siteSectionLocked ? "Permitir que la IA cambie esta sección" : "Conservar esta sección al regenerar"}">${siteSectionLocked ? "Se conserva" : "Conservar"}</button><span class="store-preview-animation-spacer"></span><button type="button" data-canvas-move="-1" aria-label="Mover sección arriba" title="Mover arriba"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg></button><button type="button" data-canvas-move="1" aria-label="Mover sección abajo" title="Mover abajo"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button>${siteHasAnimation ? `<button type="button" class="danger" data-canvas-delete-site-animation aria-label="Eliminar la animación de esta sección" title="Eliminar animación"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg></button>` : ""}${siteSection && !["hero", "catalog", "contact"].includes(siteSection.kind) ? `<button type="button" class="danger" data-canvas-delete-section aria-label="Eliminar la sección completa" title="Eliminar sección"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V3h4v3m3 0-1 11H6L5 6m3 3v5m4-5v5"/></svg><span>Sección</span></button>` : ""}</footer>
      </div>`;
  toolbar.classList.toggle("is-animation-popover", !isText);
  toolbar.hidden = false;
  positionStorePreviewCanvasToolbar(toolbar, target);
  const styleSelection = isText
    ? selection
    : animation
      ? { ...selection, field: selectedMedia ? "title" : "animationStyle" }
      : { ...selection, field: siteItem ? "siteItemTitle" : "siteTitle" };
  const sendStyle = (key: string, value: unknown) => postToParent("STORE_EDITOR_TEXT_STYLE", { selection: styleSelection, key, value });
  toolbar.querySelector<HTMLSelectElement>("[data-canvas-font]")?.addEventListener("change", (event) => sendStyle("fontStyle", (event.currentTarget as HTMLSelectElement).value));
  const colorControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-color]");
  colorControl?.addEventListener("input", () => {
    if (animation) {
      const stylesExactCopy = isText || !!selectedMedia;
      const styleTarget = stylesExactCopy ? copy : section;
      styleTarget.dataset.animationTextColor = colorControl.value;
      styleTarget.style.setProperty(stylesExactCopy ? "--animation-scene-text-color" : "--animation-text-color", colorControl.value);
    } else {
      copy.dataset.canvasTextColor = colorControl.value;
      copy.style.setProperty("--canvas-text-color", colorControl.value);
      const warning = toolbar.querySelector<HTMLElement>("[data-canvas-contrast-warning]");
      if (warning) warning.hidden = colorContrastRatio(colorControl.value, textContrastBackground) >= 3;
    }
  });
  colorControl?.addEventListener("change", () => sendStyle("textColor", colorControl.value));
  const backgroundControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-background]");
  backgroundControl?.addEventListener("input", () => section.style.setProperty("--animation-background", backgroundControl.value));
  backgroundControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SECTION_STYLE", { selection, key: "backgroundColor", value: backgroundControl.value }));
  const siteBackgroundControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-site-background]");
  siteBackgroundControl?.addEventListener("input", () => section.style.setProperty("--zone-bg", siteBackgroundControl.value));
  siteBackgroundControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SITE_FIELD", { selection, key: "backgroundColor", value: siteBackgroundControl.value }));
  const sectionHeightControl = toolbar.querySelector<HTMLInputElement>("[data-canvas-section-height]");
  const sectionHeightOutput = toolbar.querySelector<HTMLOutputElement>("[data-canvas-section-height-output]");
  const sectionHeightReset = toolbar.querySelector<HTMLButtonElement>("[data-canvas-section-height-reset]");
  sectionHeightControl?.addEventListener("input", () => {
    const heightPx = Number(sectionHeightControl.value);
    applySiteSectionPreviewHeight(section, heightPx, sectionViewport);
    if (sectionHeightOutput) sectionHeightOutput.value = `${heightPx} px`;
    if (sectionHeightReset) sectionHeightReset.disabled = false;
  });
  sectionHeightControl?.addEventListener("change", () => postToParent("STORE_EDITOR_SECTION_HEIGHT", {
    selection,
    viewport: sectionViewport,
    heightPx: Number(sectionHeightControl.value),
  }));
  sectionHeightReset?.addEventListener("click", () => {
    applySiteSectionPreviewHeight(section, null, sectionViewport);
    sectionHeightReset.disabled = true;
    postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: null });
  });
  bindStorePreviewPalette(toolbar, {
    text: colorControl,
    "animation-background": backgroundControl,
    "site-background": siteBackgroundControl,
  });
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-align]").forEach((button) => button.addEventListener("click", () => sendStyle("textAlign", button.dataset.canvasAlign)));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-size-step]").forEach((button) => button.addEventListener("click", () => sendStyle("textScale", Math.min(200, Math.max(50, scale + Number(button.dataset.canvasSizeStep))))));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-width-step]").forEach((button) => button.addEventListener("click", () => sendStyle("textWidthPercent", Math.min(100, Math.max(20, textWidth + Number(button.dataset.canvasWidthStep))))));
  toolbar.querySelector<HTMLSelectElement>("[data-canvas-move-text-section]")?.addEventListener("change", (event) => {
    const targetSectionId = (event.currentTarget as HTMLSelectElement).value;
    if (targetSectionId) postToParent("STORE_EDITOR_MOVE_TEXT_SECTION", { selection, targetSectionId });
  });
  toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-canvas-animation-field]").forEach((control) => {
    control.addEventListener("change", () => postToParent("STORE_EDITOR_ANIMATION_FIELD", {
      selection,
      key: control.dataset.canvasAnimationField,
      value: control.value,
    }));
  });
  toolbar.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-canvas-site-field]").forEach((control) => {
    control.addEventListener("change", () => postToParent("STORE_EDITOR_SITE_FIELD", {
      selection,
      key: control.dataset.canvasSiteField,
      value: control.value,
    }));
  });
  toolbar.querySelector<HTMLInputElement>("[data-canvas-catalog-search]")?.addEventListener("input", (event) => {
    const query = (event.currentTarget as HTMLInputElement).value.trim().toLocaleLowerCase("es");
    let visible = 0;
    toolbar.querySelectorAll<HTMLElement>("[data-canvas-catalog-option]").forEach((option) => {
      const matches = !query || (option.dataset.productSearch || "").includes(query);
      option.hidden = !matches;
      if (matches) visible += 1;
    });
    const empty = toolbar.querySelector<HTMLElement>("[data-canvas-catalog-empty]");
    if (empty) empty.hidden = visible > 0;
  });
  toolbar.querySelectorAll<HTMLInputElement>("[data-canvas-catalog-product]").forEach((control) => control.addEventListener("change", () => {
    postToParent("STORE_EDITOR_SITE_PRODUCTS", { selection, action: "toggle", productId: control.value, selected: control.checked });
  }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-catalog-move]").forEach((button) => button.addEventListener("click", () => {
    postToParent("STORE_EDITOR_SITE_PRODUCTS", { selection, action: "move", productId: button.dataset.canvasCatalogMove, direction: Number(button.dataset.direction) });
  }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "media",
    label: `medio ${Number(button.dataset.canvasMedia) + 1} de la animación`,
    animationId: selection.animationId,
    itemIndex: Number(button.dataset.canvasMedia),
  })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-add-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "mediaAdd",
    label: `medio ${Number(button.dataset.canvasAddMedia) + 1} de la animación`,
    animationId: selection.animationId,
    itemIndex: Number(button.dataset.canvasAddMedia),
  })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-site-media]").forEach((button) => button.addEventListener("click", () => beginStorePreviewInlineImageEdit({
    section: selection.section,
    field: "siteMedia",
    label: `medio ${Number(button.dataset.canvasSiteMedia) + 1} de la sección`,
    itemIndex: Number(button.dataset.canvasSiteMedia),
  })));
  toolbar.querySelector("[data-canvas-animation-settings]")?.addEventListener("click", () => renderStorePreviewCanvasToolbar(section, {
    section: selection.section,
    field: "section",
    label: animation?.name || "sección animada",
    animationId: selection.animationId,
  }));
  toolbar.querySelector("[data-canvas-site-settings]")?.addEventListener("click", () => renderStorePreviewCanvasToolbar(section, {
    section: selection.section,
    field: "section",
    label: siteSection?.title || "sección animada",
  }));
  toolbar.querySelector("[data-canvas-close]")?.addEventListener("click", () => {
    // Reset the popover variant before emptying it. Otherwise the later
    // `.is-animation-popover { display: block }` rule can override `[hidden]`
    // and leave an empty white toolbar behind after the close button is used.
    toolbar.className = "store-preview-canvas-toolbar";
    toolbar.hidden = true;
    toolbar.replaceChildren();
  });
  toolbar.querySelector("[data-canvas-copy]")?.addEventListener("click", () => postToParent("STORE_EDITOR_COPY_TEXT", { selection, value: target?.textContent || "" }));
  toolbar.querySelector("[data-canvas-paste]")?.addEventListener("click", () => postToParent("STORE_EDITOR_PASTE_TEXT", { selection }));
  toolbar.querySelector("[data-canvas-duplicate]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DUPLICATE_TEXT", { selection }));
  toolbar.querySelector("[data-canvas-delete-text]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_TEXT", { selection }));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-add-text]").forEach((button) => button.addEventListener("click", () => postToParent("STORE_EDITOR_ADD_TEXT", { selection, role: button.dataset.canvasAddText })));
  toolbar.querySelectorAll<HTMLButtonElement>("[data-canvas-move]").forEach((button) => button.addEventListener("click", () => postToParent("STORE_EDITOR_MOVE_SECTION", { selection, direction: Number(button.dataset.canvasMove) })));
  toolbar.querySelector<HTMLButtonElement>("[data-canvas-section-lock]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const locked = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(locked));
    button.textContent = locked ? "Se conserva" : "Conservar";
    postToParent("STORE_EDITOR_SECTION_LOCK", { selection, locked });
  });
  toolbar.querySelector("[data-canvas-delete-animation]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_ANIMATION", { animationId: selection.animationId }));
  toolbar.querySelector("[data-canvas-delete-site-animation]")?.addEventListener("click", () => postToParent("STORE_EDITOR_SITE_FIELD", { selection, key: "motion", value: "none" }));
  toolbar.querySelector("[data-canvas-delete-section]")?.addEventListener("click", () => postToParent("STORE_EDITOR_DELETE_SECTION", { selection }));
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
  if (STORE_PREVIEW_INLINE_TEXT_FIELDS.has(selection.field)) {
    element.dataset.storeEditorInline = "text";
    const draggableCanvasText = element.hasAttribute("data-canvas-text-style")
      && (selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation");
    if (draggableCanvasText) {
      element.dataset.storeEditorDraggableText = "true";
      element.setAttribute("aria-description", "Arrastra para mover. Haz doble clic para editar el texto.");
      const dragHost = element.closest<HTMLAnchorElement>("a");
      if (dragHost) {
        dragHost.draggable = false;
        dragHost.dataset.storeEditorDragHost = "true";
      }
    }
  } else if (STORE_PREVIEW_INLINE_IMAGE_FIELDS.has(selection.field)) {
    element.dataset.storeEditorInline = "image";
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Cambiar ${selection.label}`);
  }
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
  document.documentElement.classList.toggle("store-preview-mode", storePreviewMode);
  document.documentElement.classList.toggle("store-editor-mode", storeEditorMode);
  document.body.classList.toggle("store-preview-editor-enabled", storeEditorMode && storePreviewEditorEnabled);
  if (!storePreviewEditorEnabled) {
    storePreviewInlineEditorFinish?.(true);
    storePreviewPendingInlineTextCommit = null;
    if (storePreviewEditorClickTimer !== null) window.clearTimeout(storePreviewEditorClickTimer);
    storePreviewEditorClickTimer = null;
    storePreviewEditorSuppressNextClick = false;
  }
  if (!storePreviewEditorEnabled && storePreviewEditorHover) {
    storePreviewEditorHover.classList.remove("store-preview-editor-hover");
    storePreviewEditorHover = null;
  }
  if (!storePreviewEditorEnabled) renderStorePreviewCanvasToolbar(null, null);
}

function syncStorePreviewEditorSelection(): void {
  app.querySelectorAll<HTMLElement>(".store-preview-editor-selected").forEach((element) => element.classList.remove("store-preview-editor-selected"));
  app.querySelectorAll<HTMLElement>(".store-animation-layout-selected").forEach((element) => element.classList.remove("store-animation-layout-selected"));
  const selection = storePreviewEditorSelection;
  if (!selection || !storePreviewEditorEnabled) {
    renderStorePreviewCanvasToolbar(null, null);
    return;
  }
  if (selection.animationId) {
    const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
      .find((candidate) => candidate.dataset.animationId === selection.animationId);
    const copies = Array.from(section?.querySelectorAll<HTMLElement>("[data-animation-copy]") ?? []);
    const selectedCopy = selection.itemId
      ? copies.find((copy) => copy.dataset.animationTextBlock === selection.itemId)
      : Number.isInteger(selection.itemIndex)
      ? copies.find((copy) => Number(copy.dataset.animationMediaIndex) === selection.itemIndex)
      : copies.find((copy) => !copy.hasAttribute("data-animation-media-index")) || copies[0];
    selectedCopy?.classList.add("store-animation-layout-selected");
  }
  const candidates = Array.from(app.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((element) => {
    if (element.dataset.storeEditorSection !== selection.section) return false;
    if (selection.animationId && element.dataset.storeEditorAnimationId !== selection.animationId) return false;
    if (selection.itemId && element.dataset.storeEditorItemId !== selection.itemId) return false;
    if (Number.isInteger(selection.itemIndex) && Number(element.dataset.storeEditorItemIndex) !== selection.itemIndex) return false;
    return element.dataset.storeEditorField === selection.field;
  });
  const target = candidates[0] || Array.from(app.querySelectorAll<HTMLElement>("[data-store-editor-section]"))
    .find((candidate) => candidate.dataset.storeEditorSection === selection.section);
  target?.classList.add("store-preview-editor-selected");
  renderStorePreviewCanvasToolbar(target ?? null, selection);
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
  app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]").forEach((element) => {
    const siteId = element.dataset.siteSection;
    if (!siteId) return;
    const section = `site-${siteId}`;
    element.dataset.storeSectionKey = section;
    const authoredSection = store.siteDocument?.sections?.find((candidate) => candidate.id === siteId);
    const configuredColor = configured[section];
    const hasConfiguredColor = /^#[0-9a-f]{6}$/i.test(configuredColor || "");
    const color = hasConfiguredColor ? configuredColor : authoredSection?.backgroundColor;
    if (!color) return;
    const text = hasConfiguredColor ? backgroundTheme(color).textColor : authoredSection?.textColor || backgroundTheme(color).textColor;
    element.style.setProperty("--zone-bg", color);
    element.style.setProperty("--zone-ink", text);
    element.style.setProperty("--store-section-background", color);
    element.style.setProperty("--store-section-text", text);
    element.style.setProperty("--pg-text", text);
    element.style.setProperty("--pg-text-muted", `color-mix(in srgb, ${text} 76%, ${color})`);
    element.style.setProperty("--pg-text-faint", `color-mix(in srgb, ${text} 62%, ${color})`);
  });
}

function storePreviewSectionInsertionOptions(pageSpecific = false): string {
  const visualOptions = STORE_MOTION_EXPERIENCES
    .filter((type) => !STORE_TEXT_ANIMATION_EXPERIENCES.has(type))
    .map((type) => `<option value="animation:${type}">${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[type])}</option>`)
    .join("");
  const textOptions = STORE_MOTION_EXPERIENCES
    .filter((type) => STORE_TEXT_ANIMATION_EXPERIENCES.has(type))
    .map((type) => `<option value="animation:${type}">${escapeHtml(STORE_MOTION_EXPERIENCE_LABELS[type])}</option>`)
    .join("");
  return `<option value="">Elige qué insertar…</option>
    <optgroup label="Secciones">
      <option value="about">Texto e historia</option>
      ${pageSpecific ? '<option value="products">Productos seleccionados</option>' : ""}
      <option value="gallery">Galería visual</option>
      <option value="links">Redes sociales</option>
      <option value="contact">Contacto</option>
      <option value="location">Ubicación</option>
      ${pageSpecific ? "" : '<option value="footer">Pie de página</option>'}
    </optgroup>
    <optgroup label="Animaciones visuales">${visualOptions}</optgroup>
    <optgroup label="Animaciones de texto">${textOptions}</optgroup>`;
}

function renderStorePreviewSectionInsertions(): void {
  app.querySelectorAll(".store-section-insert-boundary").forEach((element) => element.remove());
  const siteDocument = storePreviewRenderedSiteDocument();
  const requestedPageSlug = new URLSearchParams(window.location.search).get("page");
  const activePage = requestedPageSlug
    ? siteDocument?.pages?.find((page) => page.slug === requestedPageSlug) ?? null
    : null;
  const sections = Array.from(app.children).filter((element): element is HTMLElement =>
    element instanceof HTMLElement && !!element.dataset.storeSectionKey,
  );
  const sectionLabels: Record<string, string> = {
    hero: "Portada", products: "Productos", about: "Nuestra historia", gallery: "Fotos editoriales",
    links: "Redes y enlaces", contact: "Contáctanos", location: "Ubicación",
  };
  const readableSection = (section: HTMLElement) => {
    const key = section.dataset.storeSectionKey || "";
    if (key.startsWith("animation-")) return "la animación";
    if (key.startsWith("site-")) return section.getAttribute("aria-label")?.trim() || "la sección";
    return sectionLabels[key] || "la sección";
  };
  const addBoundary = (reference: HTMLElement, position: "before" | "after", insertAfter: string, label: string) => {
    const boundary = document.createElement("div");
    boundary.className = "store-section-insert-boundary";
    boundary.dataset.insertAfter = insertAfter;
    boundary.innerHTML = `<label class="store-section-insert-trigger" title="${escapeHtml(label)}">
      <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>
      <strong>Agregar primera sección</strong>
      <select aria-label="${escapeHtml(label)}" data-store-section-insert-select>${storePreviewSectionInsertionOptions(Boolean(activePage))}</select>
    </label>`;
    const select = boundary.querySelector<HTMLSelectElement>("select")!;
    select.addEventListener("change", () => {
      const choice = select.value;
      select.value = "";
      if (choice) postToParent("STORE_EDITOR_INSERT_SECTION", { choice, insertAfter, ...(activePage ? { pageId: activePage.id } : {}) });
    });
    if (position === "before") reference.before(boundary);
    else reference.after(boundary);
    return boundary;
  };
  if (!sections.length) {
    const header = app.querySelector<HTMLElement>(".store-site-header");
    if (header && activePage) addBoundary(header, "after", "__start__", `Agregar la primera sección a ${activePage.label}`).classList.add("is-empty-page");
    return;
  }
  addBoundary(sections[0], "before", "__start__", "Insertar una sección al inicio");
  sections.forEach((section, index) => {
    const next = sections[index + 1];
    const label = next
      ? `Insertar una sección entre ${readableSection(section)} y ${readableSection(next)}`
      : "Insertar una sección al final";
    addBoundary(section, "after", section.dataset.storeSectionKey || "__start__", label);
  });
}

function annotateStorePreviewEditor(store: Store): void {
  if (!storeEditorMode) return;
  const siteKindLabels: Record<string, string> = { hero: "portada", story: "historia con scroll", catalog: "catálogo", gallery: "galería", contact: "contacto", location: "ubicación", links: "redes" };
  app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-kind]").forEach((element) => {
    const kind = element.dataset.siteKind;
    const id = element.dataset.siteSection;
    const section = id ? `site-${id}` : kind === "catalog" ? "products" : kind === "story" ? "about" : kind;
    if (!section) return;
    const title = element.getAttribute("aria-label")?.trim();
    markStorePreviewEditorTarget(element, { section: section as StorePreviewSection, field: "section", label: title || siteKindLabels[kind || ""] || "sección de marca" });
    if (!id) return;
    const sectionSelection = { section: `site-${id}` as StorePreviewSection, field: "section", label: title || siteKindLabels[kind || ""] || "sección de marca" };
    if (!element.querySelector(":scope > .store-site-section-resize-handle")) {
      const resizeHandle = document.createElement("button");
      resizeHandle.type = "button";
      resizeHandle.className = "store-site-section-resize-handle";
      resizeHandle.setAttribute("aria-label", `Cambiar el alto de ${sectionSelection.label}`);
      resizeHandle.title = "Arrastra para cambiar el alto";
      resizeHandle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h14M5 15h14"/></svg><span>Alto</span>';
      resizeHandle.addEventListener("pointerdown", (event) => beginSiteSectionResizeGesture(event, element, sectionSelection));
      element.append(resizeHandle);
    }
    const markBlockText = (target: HTMLElement, fallbackField: string, label: string) => markStorePreviewEditorTarget(target, {
      section: `site-${id}`,
      field: target.dataset.siteBlock ? "siteBlockText" : fallbackField,
      label,
      ...(target.dataset.siteBlock ? { itemId: target.dataset.siteBlock } : {}),
    });
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy :is(h1, h2)").forEach((target) => markBlockText(target, "siteTitle", `título de ${siteKindLabels[kind || ""] || "la sección"}`));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy p").forEach((target) => markBlockText(target, "siteBody", `texto de ${siteKindLabels[kind || ""] || "la sección"}`));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-copy .bespoke-cta").forEach((target) => markBlockText(target, "siteCtaLabel", "botón de la sección"));
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-free-copy-layer > [data-site-block]").forEach((target) => {
      const blockKind = target.dataset.siteBlockKind;
      const label = blockKind === "heading"
        ? "título adicional de la sección"
        : blockKind === "action"
          ? "botón adicional de la sección"
          : "texto adicional de la sección";
      markBlockText(target, "siteBlockText", label);
    });
    element.querySelectorAll<HTMLElement>(":scope > .bespoke-media [data-site-block-kind='media']").forEach((target) => {
      markStorePreviewEditorTarget(target, { section: `site-${id}`, field: "siteBlockMedia", label: "imagen de la sección", itemId: target.dataset.siteBlock });
    });
    element.querySelectorAll<HTMLElement>(".bespoke-story-flow .store-flow-section").forEach((scene, itemIndex) => {
      const heading = scene.querySelector<HTMLElement>(".store-flow-copy h3");
      const body = scene.querySelector<HTMLElement>(".store-flow-copy p");
      const media = scene.querySelector<HTMLElement>("figure");
      if (heading) markStorePreviewEditorTarget(heading, { section: `site-${id}`, field: heading.dataset.siteBlock ? "siteBlockText" : "siteItemTitle", label: `título de escena ${itemIndex + 1}`, itemIndex, ...(heading.dataset.siteBlock ? { itemId: heading.dataset.siteBlock } : {}) });
      if (body) markStorePreviewEditorTarget(body, { section: `site-${id}`, field: body.dataset.siteBlock ? "siteBlockText" : "siteItemBody", label: `texto de escena ${itemIndex + 1}`, itemIndex, ...(body.dataset.siteBlock ? { itemId: body.dataset.siteBlock } : {}) });
      if (media) markStorePreviewEditorTarget(media, { section: `site-${id}`, field: media.dataset.siteBlock ? "siteBlockMedia" : "siteMedia", label: `imagen de escena ${itemIndex + 1}`, itemIndex, ...(media.dataset.siteBlock ? { itemId: media.dataset.siteBlock } : {}) });
    });
  });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-hero:not([data-site-section]) .bespoke-copy :is(h1, h2)'), { section: "hero", field: "storeTagline", label: "título de portada" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-hero:not([data-site-section]) .bespoke-media'), { section: "hero", field: "storeBanner", label: "imagen de portada" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-copy h2'), { section: "about", field: "aboutTitle", label: "título de la historia" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-copy p'), { section: "about", field: "aboutBody", label: "historia de la marca" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-story:not([data-site-section]) .bespoke-media'), { section: "about", field: "aboutImage", label: "imagen de la historia" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-gallery:not([data-site-section]) .bespoke-copy h2'), { section: "gallery", field: "galleryTitle", label: "título de la galería" });
  markStorePreviewEditorTarget(app.querySelector('.bespoke-gallery:not([data-site-section]) .bespoke-copy p'), { section: "gallery", field: "gallerySubtitle", label: "subtítulo de la galería" });
  app.querySelectorAll<HTMLElement>(".bespoke-gallery[data-site-section]").forEach((gallery) => {
    const siteSectionId = gallery.dataset.siteSection;
    if (!siteSectionId) return;
    const mediaTargets = gallery.querySelectorAll<HTMLElement>(":scope > .bespoke-media > [data-site-block-kind='media'], :scope > .bespoke-media > .store-fidelity-media, :scope > .bespoke-media > video");
    mediaTargets.forEach((media, itemIndex) => {
      markStorePreviewEditorTarget(media, {
        section: `site-${siteSectionId}`,
        field: media.dataset.siteBlock ? "siteBlockMedia" : "editorialMedia",
        label: `imagen ${itemIndex + 1} de ${gallery.getAttribute("aria-label") || "la galería"}`,
        itemIndex,
        ...(media.dataset.siteBlock ? { itemId: media.dataset.siteBlock } : {}),
      });
    });
  });
  app.querySelectorAll<HTMLElement>("[data-store-section-key]").forEach((element) => {
    const section = element.dataset.storeSectionKey!;
    const animationId = section.startsWith("animation-") ? section.slice("animation-".length) : undefined;
    const siteId = section.startsWith("site-") ? section.slice("site-".length) : undefined;
    const authoredSection = siteId ? store.siteDocument?.sections?.find((candidate) => candidate.id === siteId) : undefined;
    markStorePreviewEditorTarget(element, {
      section: section as StorePreviewEditorSelection["section"],
      field: "section",
      label: animationId
        ? "sección animada"
        : authoredSection?.title || (authoredSection ? siteKindLabels[authoredSection.kind] : undefined) || `sección ${section}`,
      ...(animationId ? { animationId } : {}),
    });
  });
  markStorePreviewEditorTarget(app.querySelector(".store-title"), { section: "brand", field: "storeName", label: "nombre de la tienda" });
  markStorePreviewEditorTarget(app.querySelector(".store-tagline"), { section: "brand", field: "storeTagline", label: "descripción corta" });
  markStorePreviewEditorTarget(app.querySelector(".merchant-header-logo"), { section: "brand", field: "storeLogo", label: "logo" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-nav"), { section: "navigation", field: "section", label: "navegación superior" });
  markAllStorePreviewEditorTargets(".store-site-nav [data-site-navigation-item]", (element, index) => ({
    section: "navigation",
    field: "navigationLabel",
    label: `enlace superior ${index + 1}`,
    itemIndex: Number(element.dataset.siteNavigationIndex || index),
  }));
  const announcement = app.querySelector<HTMLElement>(".store-announcement");
  markStorePreviewEditorTarget(announcement, { section: "announcement", field: "announcementText", label: "marquesina superior" });
  if (announcement) {
    announcement.removeAttribute("data-store-editor-inline");
    announcement.tabIndex = 0;
    announcement.setAttribute("role", "button");
    announcement.setAttribute("aria-label", "Configurar marquesina superior");
    announcement.setAttribute("aria-description", "Cambia el texto y la apariencia, o quita la marquesina desde la vista previa.");
  }
  markStorePreviewEditorTarget(app.querySelector(".store-hero.has-banner img"), { section: "hero", field: "storeBanner", label: "imagen de portada" });
  const authoredHeroId = app.querySelector<HTMLElement>(".bespoke-hero[data-site-section]")?.dataset.siteSection;
  markAllStorePreviewEditorTargets(".store-slide", (element) => ({
    section: authoredHeroId ? `site-${authoredHeroId}` : "hero",
    field: authoredHeroId ? "siteMedia" : "media",
    label: `escena ${Number(element.dataset.slideIndex || 0) + 1} de la portada`,
    itemIndex: Number(element.dataset.slideIndex || 0),
  }));
  markAllStorePreviewEditorTargets(".store-slide h2", (element) => ({ section: authoredHeroId ? `site-${authoredHeroId}` : "hero", field: authoredHeroId ? "siteItemTitle" : "title", label: "título de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide p", (element) => ({ section: authoredHeroId ? `site-${authoredHeroId}` : "hero", field: authoredHeroId ? "siteItemBody" : "body", label: "texto de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markAllStorePreviewEditorTargets(".store-slide-cta", (element) => ({ section: "hero", field: "ctaLabel", label: "botón de portada", itemIndex: Number(element.closest<HTMLElement>(".store-slide")?.dataset.slideIndex || 0) }));
  markStorePreviewEditorTarget(app.querySelector("#store-products-title"), { section: "products", field: "catalogTitle", label: "título del catálogo" });
  markStorePreviewEditorTarget(app.querySelector(".store-catalog-heading p"), { section: "products", field: "catalogSubtitle", label: "subtítulo del catálogo" });
  app.querySelectorAll<HTMLElement>(".catalog-section-card[data-catalog-section]").forEach((card) => {
    const categoryId = card.dataset.catalogSection;
    if (!categoryId || categoryId === "null") return;
    const category = store.categories.find((candidate) => candidate.id === categoryId);
    markStorePreviewEditorTarget(card.querySelector(".catalog-section-media"), {
      section: "products",
      field: "categoryBanner",
      label: `portada de ${category?.name || "la sección de productos"}`,
      itemId: categoryId,
    });
  });
  markAllStorePreviewEditorTargets(".store-item", (element) => {
    const item = store.items.find((candidate) => candidate.id === element.dataset.id);
    const siteCatalog = element.closest<HTMLElement>(".bespoke-zone[data-site-kind='catalog'][data-site-section]");
    if (siteCatalog?.dataset.siteSection) {
      return {
        section: `site-${siteCatalog.dataset.siteSection}`,
        field: "section",
        label: item ? `productos de ${item.name}` : "productos del catálogo",
      };
    }
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
    if (!section.querySelector(".store-animation-delete-control")) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "store-animation-delete-control";
      deleteButton.dataset.animationId = animationId;
      deleteButton.setAttribute("aria-label", `Eliminar ${animation?.name || "animación"}`);
      deleteButton.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>Eliminar animación</span>`;
      section.prepend(deleteButton);
    }
    const animationMediaUrls = (animation?.media ?? []).map((entry) => assetUrl(entry.imageUrl));
    const markAnimationMediaTarget = (element: HTMLElement | null, itemIndex: number) => {
      if (!element || itemIndex < 0 || itemIndex >= animationMediaUrls.length) return;
      markStorePreviewEditorTarget(element, {
        section: `animation-${animationId}`,
        field: "media",
        label: `medio ${itemIndex + 1} de la animación`,
        animationId,
        itemIndex,
      });
    };
    section.querySelectorAll<HTMLElement>("img[src], video[src]").forEach((media) => {
      if (media.closest("[data-animation-product-card]")) return;
      const itemIndex = animationMediaUrls.indexOf(media.getAttribute("src"));
      markAnimationMediaTarget(media, itemIndex);
    });
    const indexedTargets = [
      [".store-flow-section", null],
      ["[data-motion-hero-to]", "data-motion-hero-to"],
      ["[data-gallery-scroll-cell]", "data-gallery-scroll-cell"],
      ["[data-testimonial-index]", "data-testimonial-index"],
      ["[data-zoom-index]", "data-zoom-index"],
      ["[data-portfolio-panel]", "data-portfolio-panel"],
      ["[data-full-chapter-copy]", "data-full-chapter-copy"],
      ["[data-frame]", "data-frame"],
    ] as const;
    indexedTargets.forEach(([selector, attribute]) => {
      section.querySelectorAll<HTMLElement>(selector).forEach((element, fallbackIndex) => {
        const itemIndex = attribute ? Number(element.getAttribute(attribute)) : fallbackIndex;
        if (Number.isInteger(itemIndex)) markAnimationMediaTarget(element, itemIndex);
      });
    });
    section.querySelectorAll<HTMLElement>(".store-image-stream-grid > figure").forEach(markAnimationMediaTarget);
    markAnimationMediaTarget(section.querySelector<HTMLElement>(".store-scroll-expansion-sticky > figure"), 0);
    markAnimationMediaTarget(section.querySelector<HTMLElement>(".store-scroll-expansion-background"), 1);
    const magneticTarget = section.querySelector<HTMLElement>("[data-magnetic-target]");
    markAnimationMediaTarget(magneticTarget, 0);
    section.querySelectorAll<HTMLElement>(
      "[data-animation-general-copy] > h3, [data-animation-general-copy] > p, [data-animation-copy] [data-animation-copy-field]",
    ).forEach((text) => {
      const textBlock = text.closest<HTMLElement>("[data-animation-text-block]");
      if (textBlock) {
        const blockId = textBlock.dataset.animationTextBlock;
        const block = animation?.textBlocks?.find((candidate) => candidate.id === blockId);
        if (blockId) markStorePreviewEditorTarget(text, {
          section: `animation-${animationId}`,
          field: "textBlock",
          label: block?.role === "subtitle" ? "subtítulo adicional" : "título adicional",
          animationId,
          itemId: blockId,
        });
        return;
      }
      const general = !!text.closest("[data-animation-general-copy]");
      const copy = text.closest<HTMLElement>("[data-animation-copy]");
      const itemIndex = Number(copy?.dataset.animationMediaIndex);
      const explicitField = text.dataset.animationCopyField;
      const inferredField = text.matches("h3, strong") ? "title" : text.matches("blockquote") ? "body" : "body";
      const field = general
        ? text.matches("h3") ? "animationTitle" : "animationSubtitle"
        : Number.isInteger(itemIndex)
          ? explicitField || inferredField
          : ["body", "caption"].includes(explicitField || inferredField) ? "animationSubtitle" : "animationTitle";
      const labels: Record<string, string> = {
        title: "título de la escena",
        caption: "subtítulo de la escena",
        body: "texto de la escena",
        animationTitle: "título general de la animación",
        animationSubtitle: "subtítulo general de la animación",
      };
      markStorePreviewEditorTarget(text, {
        section: `animation-${animationId}`,
        field,
        label: labels[field] || "texto de la animación",
        animationId,
        ...(!general && Number.isInteger(itemIndex) ? { itemIndex } : {}),
      });
    });
    section.querySelectorAll<HTMLElement>("[data-animation-style-target]").forEach((text) => {
      markStorePreviewEditorTarget(text, {
        section: `animation-${animationId}`,
        field: "animationStyle",
        label: "texto de la animación",
        animationId,
      });
    });
    section.querySelectorAll<HTMLElement>("[data-animation-copy]").forEach((copy, copyIndex) => {
      if (copy.hasAttribute("data-animation-media-index")) applyAnimationCopySceneLayout(copy);
      // Text-along-path is a full-bleed animation surface, not a movable copy
      // layer. Dragging it used to pull the background and SVG out of the
      // section instead of repositioning text.
      if (copy.matches("[data-text-along-path]")) {
        delete copy.dataset.animationLayoutTarget;
        delete copy.dataset.animationCopyIndex;
        copy.classList.remove("store-animation-layout-static", "store-animation-layout-selected");
        copy.querySelector(":scope > .store-animation-layout-controls")?.remove();
        copy.removeAttribute("aria-description");
        return;
      }
      copy.dataset.animationLayoutTarget = animationId;
      copy.dataset.animationCopyIndex = String(copyIndex);
      copy.tabIndex = 0;
      copy.classList.toggle("store-animation-layout-static", getComputedStyle(copy).position === "static");
      copy.setAttribute("aria-description", "Arrastra el bloque o su agarre para mover el texto. Haz clic para escribir; el ancho y el tamaño se ajustan en el panel.");
      if (copy.querySelector(":scope > .store-animation-layout-controls")) return;
      const controls = document.createElement("span");
      controls.className = "store-animation-layout-controls";
      controls.setAttribute("aria-label", "Mover el bloque de texto");
      controls.innerHTML = `
        <button type="button" data-animation-layout-handle="move" aria-label="Mover texto" title="Arrastrar para mover el texto"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="7" cy="10" r="1.35"/><circle cx="13" cy="10" r="1.35"/><circle cx="7" cy="15" r="1.35"/><circle cx="13" cy="15" r="1.35"/></svg></button>`;
      copy.appendChild(controls);
    });
    const animationButtonSelection: StorePreviewEditorSelection = {
      section: `animation-${animationId}`,
      field: "buttonLabel",
      label: "botón de la animación",
      animationId,
    };
    const animationButton = section.querySelector<HTMLElement>(".store-animation-cta[data-animation-button-layout-target]");
    const animationButtonLabel = animationButton?.querySelector<HTMLElement>(".store-animation-cta-label") ?? null;
    markStorePreviewEditorTarget(animationButtonLabel, animationButtonSelection);
    // The whole CTA belongs to the editor while preview editing is active.
    // Marking only its text allowed clicks on the arrow/padding to follow the
    // storefront link and made the button feel much harder to grab.
    markStorePreviewEditorTarget(animationButton, animationButtonSelection);
    if (animationButton) {
      delete animationButton.dataset.storeEditorInline;
      animationButton.setAttribute("aria-description", "Arrastra desde cualquier parte del botón para moverlo. Tócalo para editar su texto.");
      if (!animationButton.querySelector(".store-animation-button-handle")) {
        const handle = document.createElement("span");
        handle.className = "store-animation-button-handle";
        handle.setAttribute("aria-hidden", "true");
        handle.innerHTML = `<svg viewBox="0 0 20 20"><circle cx="7" cy="5" r="1.35"/><circle cx="13" cy="5" r="1.35"/><circle cx="7" cy="10" r="1.35"/><circle cx="13" cy="10" r="1.35"/><circle cx="7" cy="15" r="1.35"/><circle cx="13" cy="15" r="1.35"/></svg>`;
        animationButton.appendChild(handle);
      }
    }
  });
  markAllStorePreviewEditorTargets(".store-link-btn", (_element, index) => ({ section: "links", field: "linkLabel", label: `enlace social ${index + 1}`, itemIndex: index }));
  markStorePreviewEditorTarget(app.querySelector("#store-links-title"), { section: "links", field: "linksTitle", label: "título de redes sociales" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-footer"), { section: "footer", field: "section", label: "pie de página" });
  markStorePreviewEditorTarget(app.querySelector(".store-site-footer-brand p"), { section: "footer", field: "footerBrandDescription", label: "descripción del pie" });
  markAllStorePreviewEditorTargets(".store-site-footer-column h2", (_element, index) => ({ section: "footer", field: "footerColumnTitle", label: `título de columna ${index + 1}`, itemIndex: index }));
  app.querySelectorAll<HTMLElement>(".store-site-footer-column").forEach((column, columnIndex) => {
    column.querySelectorAll<HTMLElement>("[data-site-footer-item]").forEach((item, itemIndex) => markStorePreviewEditorTarget(item, {
      section: "footer",
      field: "footerItemLabel",
      label: `elemento ${itemIndex + 1} de la columna ${columnIndex + 1}`,
      itemId: `${columnIndex}:${itemIndex}`,
    }));
  });
  markStorePreviewEditorTarget(app.querySelector("[data-site-footer-copyright]"), { section: "footer", field: "footerCopyright", label: "texto legal del pie" });
  markStorePreviewEditorTarget(app.querySelector("[data-site-footer-badge]"), { section: "footer", field: "footerBadge", label: "sello del pie" });
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
  renderStorePreviewSectionInsertions();
  syncStorePreviewEditorMode();
  syncStorePreviewEditorSelection();
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
  const animationCopy = target.closest<HTMLElement>("[data-animation-copy][data-animation-layout-target]");
  const siteDraggableCopy = target.matches("[data-canvas-text-style]")
    && target.dataset.storeEditorInline === "text"
    && (target.dataset.storeEditorSection?.startsWith("site-")
      || target.dataset.storeEditorSection === "brand"
      || target.dataset.storeEditorSection === "navigation");
  const selectedAnimationCopy = document.querySelector<HTMLElement>("[data-animation-copy].store-animation-layout-selected");
  if (selectedAnimationCopy && target.closest(".store-motion-section") === selectedAnimationCopy.closest(".store-motion-section")) {
    label.style.display = "none";
    return;
  }
  const action = target.dataset.storeEditorInline === "image" ? "cambiar" : target.dataset.storeEditorInline === "text" ? "editar" : "abrir";
  label.textContent = target.dataset.storeEditorField === "announcementText"
    ? "Toca para configurar o quitar la marquesina"
    : target.dataset.storeEditorInline === "image" && !animationCopy
    ? `Toca para editar ${target.dataset.storeEditorLabel || "esta imagen"}`
    : animationCopy
    ? `Arrastra para mover · doble clic para ${action}`
    : siteDraggableCopy
    ? `Arrastra para mover · doble clic para ${action}`
    : `${target.dataset.storeEditorInline === "text" ? "Un clic" : "Doble clic"} para ${action} ${target.dataset.storeEditorLabel || "esta parte"}`;
  const rect = target.getBoundingClientRect();
  label.style.display = "block";
  label.style.left = `${Math.max(8, Math.min(rect.left + 8, window.innerWidth - 270))}px`;
  label.style.top = `${Math.max(8, Math.min(rect.top + 8, window.innerHeight - 48))}px`;
}

function insertStorePreviewInlineLineBreak(target: HTMLElement): void {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || !target.contains(range.commonAncestorContainer)) {
    target.append(document.createTextNode("\n"));
    return;
  }
  range.deleteContents();
  const newline = document.createTextNode("\n");
  range.insertNode(newline);
  range.setStartAfter(newline);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function beginStorePreviewInlineTextEdit(target: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (storePreviewInlineEditorTarget) return;
  const originalText = target.textContent || "";
  const originalBounds = target.getBoundingClientRect();
  const siteSection = selection.section.startsWith("site-")
    ? target.closest<HTMLElement>(".bespoke-zone[data-site-section]")
    : null;
  const siteSectionBounds = siteSection?.getBoundingClientRect();
  const sectionViewport = activeSiteSectionViewport();
  const heightAttribute = sectionViewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const heightProperty = sectionViewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const freezeSectionHeight = Boolean(siteSection && siteSectionBounds && !siteSection.hasAttribute(heightAttribute));
  const originalHeightProperty = siteSection?.style.getPropertyValue(heightProperty) || "";
  const fixedSectionHeight = siteSectionBounds
    ? Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(siteSectionBounds.height)))
    : null;
  const anchorPrimaryCopy = Boolean(
    siteSection
    && siteSectionBounds
    && target.parentElement?.classList.contains("bespoke-copy")
    && target.dataset.canvasTextOffsetBasis !== "section",
  );
  const anchoredOffsetX = anchorPrimaryCopy && siteSectionBounds
    ? Math.round(((originalBounds.left - siteSectionBounds.left) / siteSectionBounds.width) * 100)
    : null;
  const anchoredOffsetY = anchorPrimaryCopy && siteSectionBounds
    ? Math.round(((originalBounds.top - siteSectionBounds.top) / siteSectionBounds.height) * 100)
    : null;
  const anchoredTextWidth = anchorPrimaryCopy && siteSectionBounds
    ? Math.min(100, Math.max(20, Math.round((originalBounds.width / siteSectionBounds.width) * 100)))
    : null;
  const originallyPositionedPrimaryCopy = siteSection?.classList.contains("has-section-positioned-copy") || false;
  const originalDataOffsetX = target.dataset.canvasTextOffsetX;
  const originalDataOffsetY = target.dataset.canvasTextOffsetY;
  const originalDataOffsetBasis = target.dataset.canvasTextOffsetBasis;
  const originalDataTextWidth = target.dataset.canvasTextWidth;
  const originalCustomLayout = target.hasAttribute("data-canvas-text-custom-layout");
  const originalInlineOffsetX = target.style.getPropertyValue("--canvas-text-offset-x");
  const originalInlineOffsetY = target.style.getPropertyValue("--canvas-text-offset-y");
  const originalInlineTextWidth = target.style.getPropertyValue("--canvas-text-width");
  if (freezeSectionHeight && siteSection && fixedSectionHeight !== null) {
    applySiteSectionPreviewHeight(siteSection, fixedSectionHeight, sectionViewport);
  }
  if (anchorPrimaryCopy && siteSection && anchoredOffsetX !== null && anchoredOffsetY !== null && anchoredTextWidth !== null) {
    siteSection.classList.add("has-section-positioned-copy");
    target.dataset.canvasTextOffsetX = String(anchoredOffsetX);
    target.dataset.canvasTextOffsetY = String(anchoredOffsetY);
    target.dataset.canvasTextOffsetBasis = "section";
    target.dataset.canvasTextWidth = String(anchoredTextWidth);
    target.style.setProperty("--canvas-text-offset-x", `${anchoredOffsetX}%`);
    target.style.setProperty("--canvas-text-offset-y", `${anchoredOffsetY}%`);
    target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
  }
  const originalOffsetX = Number(target.dataset.canvasTextOffsetX || 0);
  const originalOffsetY = Number(target.dataset.canvasTextOffsetY || 0);
  const computedTranslatePixels = () => {
    const parts = getComputedStyle(target).translate.split(/\s+/);
    const pixels = (part?: string) => part?.endsWith("px") ? Number.parseFloat(part) || 0 : 0;
    return { x: pixels(parts[0]), y: pixels(parts[1] ?? parts[0]) };
  };
  let lockedTranslate = computedTranslatePixels();
  const restoreInlineOffset = (property: string, value: string) => {
    if (value) target.style.setProperty(property, value);
    else target.style.removeProperty(property);
  };
  const keepEditorAtOriginalPosition = () => {
    const bounds = target.getBoundingClientRect();
    lockedTranslate = {
      x: lockedTranslate.x + originalBounds.left - bounds.left,
      y: lockedTranslate.y + originalBounds.top - bounds.top,
    };
    target.style.setProperty("--canvas-text-offset-x", `${lockedTranslate.x}px`);
    target.style.setProperty("--canvas-text-offset-y", `${lockedTranslate.y}px`);
  };
  storePreviewInlineEditorTarget = target;
  // Selecting inline copy must also move the dashboard to its dedicated tab.
  // The dashboard deliberately avoids focusing its mirrored field for
  // preview-originated selections, so the contenteditable node keeps focus.
  postToParent("STORE_EDITOR_SELECT", { selection });
  target.classList.add("store-preview-inline-editing");
  target.setAttribute("contenteditable", "plaintext-only");
  target.setAttribute("role", "textbox");
  target.setAttribute("aria-label", `Editando ${selection.label}. Return o Tab crea una línea nueva, Control más Return guarda y Escape cancela.`);
  target.spellcheck = true;
  target.style.setProperty("--canvas-text-offset-x", `${lockedTranslate.x}px`);
  target.style.setProperty("--canvas-text-offset-y", `${lockedTranslate.y}px`);
  keepEditorAtOriginalPosition();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(keepEditorAtOriginalPosition);
  resizeObserver?.observe(target);
  target.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(target);
  const browserSelection = window.getSelection();
  const scrollingElement = document.scrollingElement;
  const editScrollPosition = {
    left: scrollingElement?.scrollLeft || 0,
    top: scrollingElement?.scrollTop || 0,
  };
  const restoreEditScrollPosition = () => {
    if (!scrollingElement) return;
    scrollingElement.scrollLeft = editScrollPosition.left;
    scrollingElement.scrollTop = editScrollPosition.top;
  };
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);
  // Chromium can scroll a contenteditable iframe when a programmatic range is
  // selected, even though focus used preventScroll. Keep the canvas viewport
  // fixed while the merchant starts typing.
  restoreEditScrollPosition();
  window.requestAnimationFrame(() => {
    restoreEditScrollPosition();
    window.requestAnimationFrame(restoreEditScrollPosition);
  });

  let finished = false;
  let onKeydown: ((event: KeyboardEvent) => void) | null = null;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    resizeObserver?.disconnect();
    if (onKeydown) target.removeEventListener("keydown", onKeydown, true);
    const value = (target.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!commit) target.textContent = originalText;
    target.removeAttribute("contenteditable");
    target.removeAttribute("role");
    target.removeAttribute("aria-label");
    target.classList.remove("store-preview-inline-editing");
    restoreInlineOffset("--canvas-text-offset-x", originalInlineOffsetX);
    restoreInlineOffset("--canvas-text-offset-y", originalInlineOffsetY);
    storePreviewInlineEditorTarget = null;
    if (storePreviewInlineEditorFinish === finish) storePreviewInlineEditorFinish = null;
    if ((!commit || value === originalText.trim()) && freezeSectionHeight && siteSection) {
      siteSection.removeAttribute(heightAttribute);
      if (originalHeightProperty) siteSection.style.setProperty(heightProperty, originalHeightProperty);
      else siteSection.style.removeProperty(heightProperty);
    }
    if ((!commit || value === originalText.trim()) && anchorPrimaryCopy && siteSection) {
      if (originalDataOffsetX === undefined) delete target.dataset.canvasTextOffsetX;
      else target.dataset.canvasTextOffsetX = originalDataOffsetX;
      if (originalDataOffsetY === undefined) delete target.dataset.canvasTextOffsetY;
      else target.dataset.canvasTextOffsetY = originalDataOffsetY;
      if (originalDataOffsetBasis === undefined) delete target.dataset.canvasTextOffsetBasis;
      else target.dataset.canvasTextOffsetBasis = originalDataOffsetBasis;
      if (originalDataTextWidth === undefined) delete target.dataset.canvasTextWidth;
      else target.dataset.canvasTextWidth = originalDataTextWidth;
      target.toggleAttribute("data-canvas-text-custom-layout", originalCustomLayout);
      if (originalInlineTextWidth) target.style.setProperty("--canvas-text-width", originalInlineTextWidth);
      else target.style.removeProperty("--canvas-text-width");
      if (!originallyPositionedPrimaryCopy) siteSection.classList.remove("has-section-positioned-copy");
    }
    if (commit && value !== originalText.trim()) {
      if (freezeSectionHeight && fixedSectionHeight !== null) {
        postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: fixedSectionHeight });
      }
      if (anchorPrimaryCopy && siteSection && anchoredOffsetX !== null && anchoredOffsetY !== null && anchoredTextWidth !== null) {
        siteSection.classList.add("has-section-positioned-copy");
        target.dataset.canvasTextOffsetX = String(anchoredOffsetX);
        target.dataset.canvasTextOffsetY = String(anchoredOffsetY);
        target.dataset.canvasTextOffsetBasis = "section";
        target.dataset.canvasTextWidth = String(anchoredTextWidth);
        target.style.setProperty("--canvas-text-offset-x", `${anchoredOffsetX}%`);
        target.style.setProperty("--canvas-text-offset-y", `${anchoredOffsetY}%`);
        target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
        postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", {
          selection,
          textOffsetX: anchoredOffsetX,
          textOffsetY: anchoredOffsetY,
          textOffsetBasis: "section",
          textWidthPercent: anchoredTextWidth,
        });
      } else if ((selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation")
        && target.dataset.canvasTextOffsetBasis !== "section") {
        const finalBounds = target.getBoundingClientRect();
        const finalTranslate = computedTranslatePixels();
        const desiredTranslateX = finalTranslate.x + originalBounds.left - finalBounds.left;
        const desiredTranslateY = finalTranslate.y + originalBounds.top - finalBounds.top;
        const textOffsetX = finalBounds.width > 0 ? Math.round((desiredTranslateX / finalBounds.width) * 100) : originalOffsetX;
        const textOffsetY = finalBounds.height > 0 ? Math.round((desiredTranslateY / finalBounds.height) * 100) : originalOffsetY;
        if (textOffsetX !== originalOffsetX || textOffsetY !== originalOffsetY) {
          target.dataset.canvasTextOffsetX = String(textOffsetX);
          target.dataset.canvasTextOffsetY = String(textOffsetY);
          target.toggleAttribute("data-canvas-text-custom-layout", Boolean(textOffsetX || textOffsetY));
          target.style.setProperty("--canvas-text-offset-x", `${textOffsetX}%`);
          target.style.setProperty("--canvas-text-offset-y", `${textOffsetY}%`);
          postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", { selection, textOffsetX, textOffsetY, textOffsetBasis: "element" });
        }
      }
      // The dashboard owns the canonical generated document, but a preview
      // patch that was already queued can arrive before it records this blur.
      // Keep the optimistic copy through those redraws until the parent echoes
      // the committed value back with PAGOSYA_STORE_EDITOR_TEXT_UPDATE.
      storePreviewPendingInlineTextCommit = { selection, value };
      postToParent("STORE_EDITOR_INLINE_TEXT", { selection, value });
    }
    showStorePreviewEditorHover(target);
  };
  storePreviewInlineEditorFinish = finish;
  onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finish(true);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      insertStorePreviewInlineLineBreak(target);
    }
  };
  target.addEventListener("keydown", onKeydown, { capture: true });
  target.addEventListener("blur", () => finish(true), { once: true });
}

function beginStorePreviewInlineImageEdit(selection: StorePreviewEditorSelection): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = selection.animationId && ["media", "mediaAdd"].includes(selection.field)
    ? "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
    : "image/png,image/jpeg,image/webp";
  input.className = "store-preview-inline-file-input";
  input.setAttribute("aria-label", `Cambiar ${selection.label}`);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) postToParent("STORE_EDITOR_INLINE_IMAGE", { selection, file });
    input.remove();
  }, { once: true });
  input.addEventListener("cancel", () => input.remove(), { once: true });
  document.body.appendChild(input);
  input.click();
}

function animationTextScaleVariables(section: HTMLElement, textScale: number): void {
  const scale = textScale / 100;
  section.style.setProperty("--animation-heading-size", `clamp(${Math.round(40 * scale)}px, ${(6.5 * scale).toFixed(2)}vw, ${Math.round(88 * scale)}px)`);
  section.style.setProperty("--animation-card-copy-size", `clamp(${Math.round(20 * scale)}px, ${(2.6 * scale).toFixed(2)}vw, ${Math.round(26 * scale)}px)`);
  section.style.setProperty("--animation-body-size", `clamp(${Math.round(15 * scale)}px, ${(1.7 * scale).toFixed(2)}vw, ${Math.round(20 * scale)}px)`);
}

function applyAnimationCopySceneLayout(copy: HTMLElement, source: HTMLElement = copy): void {
  const hasCustomLayout = source.hasAttribute("data-animation-copy-custom-layout");
  copy.toggleAttribute("data-animation-copy-custom-layout", hasCustomLayout);
  const index = Number(source.dataset.animationMediaIndex);
  if (Number.isInteger(index)) {
    copy.dataset.animationMediaIndex = String(index);
    copy.querySelectorAll<HTMLElement>("[data-store-editor-target]").forEach((target) => {
      target.dataset.storeEditorItemIndex = String(index);
      if (target.dataset.storeEditorField === "title") target.dataset.storeEditorLabel = `texto de la escena ${index + 1}`;
      if (target.dataset.storeEditorField === "caption") target.dataset.storeEditorLabel = `subtítulo de la escena ${index + 1}`;
      if (target.dataset.storeEditorField === "body") target.dataset.storeEditorLabel = `descripción de la escena ${index + 1}`;
    });
  }
  const textPositionX = Number(source.dataset.animationTextX || 18);
  const textPositionY = Number(source.dataset.animationTextY || 76);
  const textScale = Number(source.dataset.animationTextScale || 100);
  const textWidthPercent = Number(source.dataset.animationTextWidthPercent || 62);
  copy.dataset.animationTextX = String(textPositionX);
  copy.dataset.animationTextY = String(textPositionY);
  copy.dataset.animationTextScale = String(textScale);
  copy.dataset.animationTextWidthPercent = String(textWidthPercent);
  copy.dataset.animationTextAlign = source.dataset.animationTextAlign || "left";
  if (hasCustomLayout) {
    copy.style.setProperty("--animation-text-x", `${textPositionX}%`);
    copy.style.setProperty("--animation-text-y", `${textPositionY}%`);
    copy.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    animationTextScaleVariables(copy, textScale);
    copy.style.setProperty("--animation-copy-align", copy.dataset.animationTextAlign);
    const translateX = copy.dataset.animationTextAlign === "right" ? "-100%" : copy.dataset.animationTextAlign === "center" ? "-50%" : "0";
    copy.style.setProperty("--animation-copy-translate", `${translateX} -50%`);
  } else {
    ["--animation-text-x", "--animation-text-y", "--animation-copy-width", "--animation-heading-size", "--animation-card-copy-size", "--animation-body-size", "--animation-copy-align", "--animation-copy-translate"].forEach((property) => copy.style.removeProperty(property));
  }
  if (source.dataset.animationTextColor) {
    copy.dataset.animationTextColor = source.dataset.animationTextColor;
    copy.style.setProperty("--animation-scene-text-color", source.dataset.animationTextColor);
  } else {
    delete copy.dataset.animationTextColor;
    copy.style.removeProperty("--animation-scene-text-color");
  }
}

function beginAnimationTextGesture(event: PointerEvent, copy: HTMLElement, action: "move" | "width" | "scale"): void {
  if (!storePreviewEditorEnabled || event.button !== 0 || storePreviewInlineEditorTarget) return;
  if (copy.matches("[data-text-along-path]")) return;
  const section = copy.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  const animationId = section?.dataset.animationId;
  if (!section || !animationId) return;
  const positioner = copy.offsetParent instanceof HTMLElement ? copy.offsetParent : section;
  const bounds = positioner.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  const copyBounds = copy.getBoundingClientRect();
  const copyHasCustomLayout = copy.hasAttribute("data-animation-copy-custom-layout");
  const sectionHasCustomLayout = section.hasAttribute("data-animation-custom-layout");
  const alreadyCustom = copyHasCustomLayout || sectionHasCustomLayout;
  const mediaIndex = Number(copy.dataset.animationMediaIndex);
  const textBlockId = copy.dataset.animationTextBlock;
  const selection: StorePreviewEditorSelection = {
    section: `animation-${animationId}`,
    field: textBlockId ? "textBlock" : "layout",
    label: textBlockId ? "texto adicional" : "posición y tamaño del texto",
    animationId,
    ...(Number.isInteger(mediaIndex) ? { itemIndex: mediaIndex } : {}),
    ...(textBlockId ? { itemId: textBlockId } : {}),
  };
  const startX = event.clientX;
  const startY = event.clientY;
  const align = copyHasCustomLayout ? (copy.dataset.animationTextAlign || "left") : (section.dataset.animationTextAlign || "left");
  const inferredAnchorX = align === "right"
    ? copyBounds.right
    : align === "center" ? copyBounds.left + (copyBounds.width / 2) : copyBounds.left;
  const finiteNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const startPositionX = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextX : section.dataset.animationTextX, 18)
    : Math.round(Math.min(100, Math.max(0, ((inferredAnchorX - bounds.left) / bounds.width) * 100)));
  const startPositionY = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextY : section.dataset.animationTextY, 76)
    : Math.round(Math.min(100, Math.max(0, (((copyBounds.top + (copyBounds.height / 2)) - bounds.top) / bounds.height) * 100)));
  const startWidth = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextWidthPercent : section.dataset.animationTextWidthPercent, 62)
    : Math.round(Math.min(100, Math.max(20, (copyBounds.width / bounds.width) * 100)));
  const startScale = finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextScale : section.dataset.animationTextScale, 100);
  let positionX = startPositionX;
  let positionY = startPositionY;
  let textWidthPercent = startWidth;
  let textScale = startScale;
  let moved = false;
  let gestureActive = false;
  const activateGesture = () => {
    if (gestureActive) return;
    gestureActive = true;
    storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    showStorePreviewEditorHover(null);
    section.classList.add("store-animation-layout-dragging");
    try {
      copy.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  if (action !== "move") {
    activateGesture();
    event.preventDefault();
  }

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    moved = true;
    activateGesture();
    moveEvent.preventDefault();
    if (!copy.hasAttribute("data-animation-copy-custom-layout")) {
      copy.setAttribute("data-animation-copy-custom-layout", "");
      copy.style.setProperty("--animation-text-x", `${startPositionX}%`);
      copy.style.setProperty("--animation-text-y", `${startPositionY}%`);
      copy.style.setProperty("--animation-copy-width", `${startWidth}%`);
      animationTextScaleVariables(copy, startScale);
      copy.dataset.animationTextAlign = align;
      copy.style.setProperty("--animation-copy-align", align);
      copy.style.setProperty("--animation-copy-translate", `${align === "right" ? "-100%" : align === "center" ? "-50%" : "0"} -50%`);
    }
    if (action === "move") {
      // Keep the point that the merchant grabbed under their pointer. Mapping
      // the pointer itself to the text anchor made the copy jump on press.
      positionX = Math.round(Math.min(100, Math.max(0, startPositionX + ((deltaX / bounds.width) * 100))));
      positionY = Math.round(Math.min(100, Math.max(0, startPositionY + ((deltaY / bounds.height) * 100))));
      copy.style.setProperty("--animation-text-x", `${positionX}%`);
      copy.style.setProperty("--animation-text-y", `${positionY}%`);
    } else if (action === "width") {
      const direction = align === "right" ? -1 : align === "center" ? 2 : 1;
      textWidthPercent = Math.round(Math.min(100, Math.max(20, startWidth + ((deltaX / bounds.width) * 100 * direction))));
      copy.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    } else {
      const scaleDelta = ((deltaX + deltaY) / 2 / Math.max(160, Math.min(bounds.width, bounds.height))) * 100;
      textScale = Math.round(Math.min(200, Math.max(50, startScale + scaleDelta)));
      animationTextScaleVariables(copy, textScale);
    }
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    if (gestureActive) section.classList.remove("store-animation-layout-dragging");
    try {
      copy.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    if (!moved || !commit) return;
    // Consume only the synthetic click produced by this drag. A timed lock also
    // swallowed the merchant's next intentional double-click to edit the text.
    storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => {
      storePreviewEditorSuppressNextClick = false;
    }, 0);
    copy.dataset.animationTextX = String(positionX);
    copy.dataset.animationTextY = String(positionY);
    copy.dataset.animationTextWidthPercent = String(textWidthPercent);
    copy.dataset.animationTextScale = String(textScale);
    postToParent("STORE_EDITOR_ANIMATION_LAYOUT", {
      selection,
      textPositionX: positionX,
      textPositionY: positionY,
      textWidthPercent,
      textScale,
      textAlign: align,
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    copy.style.setProperty("--animation-text-x", `${startPositionX}%`);
    copy.style.setProperty("--animation-text-y", `${startPositionY}%`);
    copy.style.setProperty("--animation-copy-width", `${startWidth}%`);
    animationTextScaleVariables(copy, startScale);
    if (!alreadyCustom) copy.removeAttribute("data-animation-copy-custom-layout");
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

function beginSiteSectionResizeGesture(event: PointerEvent, section: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (!storePreviewEditorEnabled || event.button !== 0 || storePreviewInlineEditorTarget) return;
  event.preventDefault();
  event.stopPropagation();
  const viewport = activeSiteSectionViewport();
  const attribute = viewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const property = viewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const originalAttribute = section.getAttribute(attribute);
  const originalProperty = section.style.getPropertyValue(property);
  const startHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(section.getBoundingClientRect().height)));
  const startY = event.clientY;
  let heightPx = startHeight;
  let moved = false;
  storePreviewEditorSelection = selection;
  syncStorePreviewEditorSelection();
  renderStorePreviewCanvasToolbar(section, selection);
  postToParent("STORE_EDITOR_SELECT", { selection });
  const updateToolbar = () => {
    const control = storePreviewCanvasToolbar()?.querySelector<HTMLInputElement>("[data-canvas-section-height]");
    const output = storePreviewCanvasToolbar()?.querySelector<HTMLOutputElement>("[data-canvas-section-height-output]");
    const reset = storePreviewCanvasToolbar()?.querySelector<HTMLButtonElement>("[data-canvas-section-height-reset]");
    if (control) control.value = String(heightPx);
    if (output) output.value = `${heightPx} px`;
    if (reset) reset.disabled = false;
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.abs(deltaY) < 3) return;
    moved = true;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    heightPx = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round((startHeight + deltaY) / 10) * 10));
    section.classList.add("store-site-section-resizing");
    applySiteSectionPreviewHeight(section, heightPx, viewport);
    updateToolbar();
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-site-section-resizing");
    if (!moved || !commit) return;
    postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport, heightPx });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    if (originalAttribute === null) section.removeAttribute(attribute);
    else section.setAttribute(attribute, originalAttribute);
    if (originalProperty) section.style.setProperty(property, originalProperty);
    else section.style.removeProperty(property);
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

function resolveMobileSiteTextCollision(
  section: HTMLElement,
  target: HTMLElement,
  predicted: { left: number; top: number; width: number; height: number },
): { x: number; y: number; adjusted: boolean } | null {
  const sectionBounds = section.getBoundingClientRect();
  const gap = 12;
  const edge = 10;
  const intersects = (a: typeof predicted, b: DOMRect) => (
    a.left < b.right + gap
    && a.left + a.width > b.left - gap
    && a.top < b.bottom + gap
    && a.top + a.height > b.top - gap
  );
  const blockers = Array.from(section.querySelectorAll<HTMLElement>(
    "img, video, .store-products, .store-contact-section, .store-location-section, .store-event, .store-site-footer",
  )).filter((candidate) => {
    if (candidate === target || candidate.contains(target) || target.contains(candidate)) return false;
    if (candidate.closest(".store-site-section-resize-handle, .store-preview-canvas-toolbar")) return false;
    const rect = candidate.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > sectionBounds.top && rect.top < sectionBounds.bottom;
  }).map((candidate) => candidate.getBoundingClientRect());
  const clamp = (left: number, top: number) => ({
    left: Math.min(sectionBounds.right - edge - predicted.width, Math.max(sectionBounds.left + edge, left)),
    top: Math.min(sectionBounds.bottom - edge - predicted.height, Math.max(sectionBounds.top + edge, top)),
    width: predicted.width,
    height: predicted.height,
  });
  const initial = clamp(predicted.left, predicted.top);
  if (!blockers.some((blocker) => intersects(initial, blocker))) {
    return { x: initial.left - predicted.left, y: initial.top - predicted.top, adjusted: initial.left !== predicted.left || initial.top !== predicted.top };
  }
  const candidates = blockers.flatMap((blocker) => [
    clamp(initial.left, blocker.top - gap - predicted.height),
    clamp(initial.left, blocker.bottom + gap),
    clamp(blocker.left - gap - predicted.width, initial.top),
    clamp(blocker.right + gap, initial.top),
  ]).filter((candidate) => !blockers.some((blocker) => intersects(candidate, blocker)));
  candidates.sort((a, b) => Math.hypot(a.left - initial.left, a.top - initial.top) - Math.hypot(b.left - initial.left, b.top - initial.top));
  const safe = candidates[0];
  return safe ? { x: safe.left - predicted.left, y: safe.top - predicted.top, adjusted: true } : null;
}

function beginSiteTextGesture(event: PointerEvent, target: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (!storePreviewEditorEnabled || event.button !== 0 || storePreviewInlineEditorTarget) return;
  const draggableSection = selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation";
  if (!draggableSection || target.dataset.storeEditorInline !== "text") return;
  const section = target.closest<HTMLElement>(".bespoke-zone[data-site-section], .store-site-header");
  if (!section) return;
  const bounds = section.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1 || targetBounds.width < 1 || targetBounds.height < 1) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const originalDataOffsetX = target.dataset.canvasTextOffsetX;
  const originalDataOffsetY = target.dataset.canvasTextOffsetY;
  const originalDataOffsetBasis = target.dataset.canvasTextOffsetBasis;
  const originalDataTextWidth = target.dataset.canvasTextWidth;
  const originalCustomLayout = target.hasAttribute("data-canvas-text-custom-layout");
  const originalOffsetPropertyX = target.style.getPropertyValue("--canvas-text-offset-x");
  const originalOffsetPropertyY = target.style.getPropertyValue("--canvas-text-offset-y");
  const originalWidthProperty = target.style.getPropertyValue("--canvas-text-width");
  const siteSectionCanvas = selection.section.startsWith("site-") && section.matches(".bespoke-zone[data-site-section]");
  const primaryCopyCanAnchorToSection = siteSectionCanvas && target.parentElement?.classList.contains("bespoke-copy");
  const convertingPrimaryCopy = primaryCopyCanAnchorToSection && target.dataset.canvasTextOffsetBasis !== "section";
  const sectionRelative = target.dataset.canvasTextOffsetBasis === "section" || target.classList.contains("site-free-canvas-text") || primaryCopyCanAnchorToSection;
  const startOffsetX = convertingPrimaryCopy
    ? Math.round(((targetBounds.left - bounds.left) / bounds.width) * 100)
    : Number(target.dataset.canvasTextOffsetX || 0);
  const startOffsetY = convertingPrimaryCopy
    ? Math.round(((targetBounds.top - bounds.top) / bounds.height) * 100)
    : Number(target.dataset.canvasTextOffsetY || 0);
  const anchoredTextWidth = convertingPrimaryCopy
    ? Math.min(100, Math.max(20, Math.round((targetBounds.width / bounds.width) * 100)))
    : Number(target.dataset.canvasTextWidth || 62);
  const sectionViewport = activeSiteSectionViewport();
  const heightAttribute = sectionViewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const heightProperty = sectionViewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const freezeSectionHeight = siteSectionCanvas && !section.hasAttribute(heightAttribute);
  const originalHeightProperty = section.style.getPropertyValue(heightProperty);
  const fixedSectionHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(bounds.height)));
  const originallyPositionedPrimaryCopy = section.classList.contains("has-section-positioned-copy");
  const horizontalBasis = sectionRelative ? bounds.width : targetBounds.width;
  const verticalBasis = sectionRelative ? bounds.height : targetBounds.height;
  const minimumX = sectionRelative ? -100 : startOffsetX + ((bounds.left - targetBounds.left) / targetBounds.width) * 100;
  const maximumX = sectionRelative ? 100 : startOffsetX + ((bounds.right - targetBounds.right) / targetBounds.width) * 100;
  const minimumY = sectionRelative ? -100 : startOffsetY + ((bounds.top - targetBounds.top) / targetBounds.height) * 100;
  const maximumY = sectionRelative ? 100 : startOffsetY + ((bounds.bottom - targetBounds.bottom) / targetBounds.height) * 100;
  let offsetX = startOffsetX;
  let offsetY = startOffsetY;
  let lastSafeOffsetX = startOffsetX;
  let lastSafeOffsetY = startOffsetY;
  let moved = false;
  let active = false;
  const activate = () => {
    if (active) return;
    active = true;
    storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    // Selection normally opens its editing popover. During a drag that panel
    // obscures the exact letter position, so dismiss it until the merchant
    // deliberately clicks the text again after placing it.
    renderStorePreviewCanvasToolbar(null, null);
    showStorePreviewEditorHover(null);
    section.classList.add("store-site-text-dragging");
    if (freezeSectionHeight) applySiteSectionPreviewHeight(section, fixedSectionHeight, sectionViewport);
    if (convertingPrimaryCopy) {
      section.classList.add("has-section-positioned-copy");
      target.dataset.canvasTextOffsetBasis = "section";
      target.dataset.canvasTextOffsetX = String(startOffsetX);
      target.dataset.canvasTextOffsetY = String(startOffsetY);
      target.dataset.canvasTextWidth = String(anchoredTextWidth);
      target.style.setProperty("--canvas-text-offset-x", `${startOffsetX}%`);
      target.style.setProperty("--canvas-text-offset-y", `${startOffsetY}%`);
      target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
    }
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    moved = true;
    activate();
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    offsetX = Math.round(Math.min(maximumX, Math.max(minimumX, startOffsetX + (deltaX / horizontalBasis) * 100)));
    offsetY = Math.round(Math.min(maximumY, Math.max(minimumY, startOffsetY + (deltaY / verticalBasis) * 100)));
    if (siteSectionCanvas && sectionViewport === "mobile") {
      const predicted = {
        left: targetBounds.left + ((offsetX - startOffsetX) / 100) * horizontalBasis,
        top: targetBounds.top + ((offsetY - startOffsetY) / 100) * verticalBasis,
        width: targetBounds.width,
        height: targetBounds.height,
      };
      const collision = resolveMobileSiteTextCollision(section, target, predicted);
      if (collision) {
        offsetX = Math.round(Math.min(maximumX, Math.max(minimumX, offsetX + (collision.x / horizontalBasis) * 100)));
        offsetY = Math.round(Math.min(maximumY, Math.max(minimumY, offsetY + (collision.y / verticalBasis) * 100)));
        lastSafeOffsetX = offsetX;
        lastSafeOffsetY = offsetY;
        section.classList.toggle("store-site-text-collision-guarded", collision.adjusted);
      } else {
        offsetX = lastSafeOffsetX;
        offsetY = lastSafeOffsetY;
        section.classList.add("store-site-text-collision-guarded");
      }
    }
    target.dataset.canvasTextOffsetX = String(offsetX);
    target.dataset.canvasTextOffsetY = String(offsetY);
    target.toggleAttribute("data-canvas-text-custom-layout", Boolean(offsetX || offsetY));
    target.style.setProperty("--canvas-text-offset-x", `${offsetX}%`);
    target.style.setProperty("--canvas-text-offset-y", `${offsetY}%`);
    if (sectionRelative) target.dataset.canvasTextOffsetBasis = "section";
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-site-text-dragging");
    section.classList.remove("store-site-text-collision-guarded");
    try {
      target.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have released the pointer already.
    }
    if (!moved || !commit) return;
    storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => { storePreviewEditorSuppressNextClick = false; }, 0);
    if (freezeSectionHeight) postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: fixedSectionHeight });
    postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", {
      selection,
      textOffsetX: offsetX,
      textOffsetY: offsetY,
      textOffsetBasis: sectionRelative ? "section" : "element",
      ...(convertingPrimaryCopy ? { textWidthPercent: anchoredTextWidth } : {}),
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    if (convertingPrimaryCopy) {
      if (originalDataOffsetX === undefined) delete target.dataset.canvasTextOffsetX;
      else target.dataset.canvasTextOffsetX = originalDataOffsetX;
      if (originalDataOffsetY === undefined) delete target.dataset.canvasTextOffsetY;
      else target.dataset.canvasTextOffsetY = originalDataOffsetY;
      if (originalDataOffsetBasis === undefined) delete target.dataset.canvasTextOffsetBasis;
      else target.dataset.canvasTextOffsetBasis = originalDataOffsetBasis;
      if (originalDataTextWidth === undefined) delete target.dataset.canvasTextWidth;
      else target.dataset.canvasTextWidth = originalDataTextWidth;
      target.toggleAttribute("data-canvas-text-custom-layout", originalCustomLayout);
      if (originalOffsetPropertyX) target.style.setProperty("--canvas-text-offset-x", originalOffsetPropertyX);
      else target.style.removeProperty("--canvas-text-offset-x");
      if (originalOffsetPropertyY) target.style.setProperty("--canvas-text-offset-y", originalOffsetPropertyY);
      else target.style.removeProperty("--canvas-text-offset-y");
      if (originalWidthProperty) target.style.setProperty("--canvas-text-width", originalWidthProperty);
      else target.style.removeProperty("--canvas-text-width");
      if (!originallyPositionedPrimaryCopy) section.classList.remove("has-section-positioned-copy");
    } else {
      target.dataset.canvasTextOffsetX = String(startOffsetX);
      target.dataset.canvasTextOffsetY = String(startOffsetY);
      target.toggleAttribute("data-canvas-text-custom-layout", Boolean(startOffsetX || startOffsetY));
      target.style.setProperty("--canvas-text-offset-x", `${startOffsetX}%`);
      target.style.setProperty("--canvas-text-offset-y", `${startOffsetY}%`);
    }
    if (freezeSectionHeight) {
      section.removeAttribute(heightAttribute);
      if (originalHeightProperty) section.style.setProperty(heightProperty, originalHeightProperty);
      else section.style.removeProperty(heightProperty);
    }
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

function beginAnimationButtonGesture(event: PointerEvent, button: HTMLElement): void {
  if (!storePreviewEditorEnabled || event.button !== 0 || storePreviewInlineEditorTarget) return;
  const section = button.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  const animationId = section?.dataset.animationId;
  if (!section || !animationId) return;
  const bounds = section.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startPositionX = Number(button.dataset.animationButtonX || 18);
  const startPositionY = Number(button.dataset.animationButtonY || 86);
  let positionX = startPositionX;
  let positionY = startPositionY;
  let moved = false;
  const selection: StorePreviewEditorSelection = {
    section: `animation-${animationId}`,
    field: "buttonLabel",
    label: "botón de la animación",
    animationId,
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    if (!moved) {
      moved = true;
      storePreviewEditorSelection = selection;
      syncStorePreviewEditorSelection();
      showStorePreviewEditorHover(null);
      section.classList.add("store-animation-layout-dragging");
      try { button.setPointerCapture?.(event.pointerId); } catch {}
    }
    moveEvent.preventDefault();
    positionX = Math.round(Math.min(100, Math.max(0, startPositionX + (deltaX / bounds.width) * 100)));
    positionY = Math.round(Math.min(100, Math.max(0, startPositionY + (deltaY / bounds.height) * 100)));
    button.style.setProperty("--animation-button-x", `${positionX}%`);
    button.style.setProperty("--animation-button-y", `${positionY}%`);
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-animation-layout-dragging");
    try { button.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved || !commit) return;
    storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => { storePreviewEditorSuppressNextClick = false; }, 0);
    button.dataset.animationButtonX = String(positionX);
    button.dataset.animationButtonY = String(positionY);
    postToParent("STORE_EDITOR_ANIMATION_BUTTON_LAYOUT", {
      selection,
      buttonPositionX: positionX,
      buttonPositionY: positionY,
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    button.style.setProperty("--animation-button-x", `${startPositionX}%`);
    button.style.setProperty("--animation-button-y", `${startPositionY}%`);
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

function isStorePreviewTextEditingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "number"].includes(target.type)) return true;
  return target instanceof HTMLElement
    && (target.isContentEditable || !!target.closest('[contenteditable]:not([contenteditable="false"])'));
}

function clearStorePreviewEditorSelection(): void {
  const hadSelection = storePreviewEditorSelection !== null;
  storePreviewInlineEditorFinish?.(true);
  if (storePreviewEditorClickTimer !== null) window.clearTimeout(storePreviewEditorClickTimer);
  storePreviewEditorClickTimer = null;
  storePreviewEditorSelection = null;
  syncStorePreviewEditorSelection();
  showStorePreviewEditorHover(null);
  if (hadSelection) postToParent("STORE_EDITOR_SELECT", { selection: null });
}

if (storeEditorMode) {
  app.addEventListener("submit", (event) => {
    const form = event.target instanceof Element
      ? event.target.closest<HTMLFormElement>("[data-store-location-inline-editor]")
      : null;
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector<HTMLTextAreaElement>("[data-store-location-map-input]");
    const status = form.querySelector<HTMLElement>(".store-location-inline-status");
    if (!input) return;
    const normalized = normalizeStoreMapEmbedInput(input.value);
    const safeUrl = normalized ? safeStoreMapEmbedUrl(normalized) : null;
    if (normalized && !safeUrl) {
      input.setAttribute("aria-invalid", "true");
      if (status) {
        status.dataset.state = "error";
        status.textContent = "Usa el código de inserción de Google Maps u OpenStreetMap.";
      }
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    input.value = safeUrl || "";
    if (status) {
      status.dataset.state = "success";
      status.textContent = safeUrl ? "Mapa listo para guardar." : "Mapa quitado.";
    }
    postToParent("STORE_EDITOR_LOCATION_MAP", {
      locationId: form.dataset.locationId,
      mapEmbedUrl: safeUrl || "",
    });
  });
  app.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const clearMapButton = event.target.closest<HTMLButtonElement>("[data-store-location-map-clear]");
    if (clearMapButton) {
      const form = clearMapButton.closest<HTMLFormElement>("[data-store-location-inline-editor]");
      const input = form?.querySelector<HTMLTextAreaElement>("[data-store-location-map-input]");
      if (form && input) {
        input.value = "";
        form.requestSubmit();
      }
      return;
    }
    const deleteLocationButton = event.target.closest<HTMLButtonElement>("[data-store-location-delete]");
    if (deleteLocationButton) {
      postToParent("STORE_EDITOR_DELETE_LOCATION", { locationId: deleteLocationButton.dataset.locationId });
      return;
    }
    const deleteAnimationButton = event.target.closest<HTMLButtonElement>(".store-animation-delete-control[data-animation-id]");
    if (deleteAnimationButton) {
      postToParent("STORE_EDITOR_DELETE_ANIMATION", { animationId: deleteAnimationButton.dataset.animationId });
    }
  });
  document.addEventListener("keydown", (event) => {
    const textEditing = isStorePreviewTextEditingTarget(event.target);
    if (!textEditing && (event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
      const target = event.target.closest<HTMLElement>('[data-store-editor-target][role="button"]');
      const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
      if (target && selection) {
        event.preventDefault();
        storePreviewEditorSelection = selection;
        syncStorePreviewEditorSelection();
        showStorePreviewEditorHover(target);
        postToParent("STORE_EDITOR_SELECT", { selection });
        return;
      }
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (textEditing) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      postToParent("STORE_EDITOR_UNDO", {});
    } else if (key === "c" && storePreviewEditorSelection && STORE_PREVIEW_INLINE_TEXT_FIELDS.has(storePreviewEditorSelection.field)) {
      event.preventDefault();
      const selectedText = document.querySelector<HTMLElement>(".store-preview-editor-selected[data-store-editor-inline='text']");
      postToParent("STORE_EDITOR_COPY_TEXT", { selection: storePreviewEditorSelection, value: selectedText?.textContent || "" });
    } else if (key === "v" && storePreviewEditorSelection && STORE_PREVIEW_INLINE_TEXT_FIELDS.has(storePreviewEditorSelection.field)) {
      event.preventDefault();
      postToParent("STORE_EDITOR_PASTE_TEXT", { selection: storePreviewEditorSelection });
    } else if (key === "d" && storePreviewEditorSelection && (storePreviewEditorSelection.animationId || storePreviewEditorSelection.section.startsWith("site-"))) {
      event.preventDefault();
      postToParent("STORE_EDITOR_DUPLICATE_TEXT", { selection: storePreviewEditorSelection });
    }
  }, true);
  window.addEventListener("blur", () => storePreviewInlineEditorFinish?.(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") storePreviewInlineEditorFinish?.(true);
  });
  app.addEventListener("pointerover", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    showStorePreviewEditorHover(event.target.closest<HTMLElement>("[data-store-editor-target]"));
  }, true);
  app.addEventListener("pointerleave", () => showStorePreviewEditorHover(null), true);
  app.addEventListener("dragstart", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-store-editor-draggable-text], [data-store-editor-drag-host]")) event.preventDefault();
  }, true);
  app.addEventListener("pointerdown", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    const siteText = event.target.closest<HTMLElement>("[data-store-editor-target][data-store-editor-inline='text'][data-canvas-text-style]");
    const siteTextSelection = siteText ? selectionFromStorePreviewEditorTarget(siteText) : null;
    if (siteText && siteTextSelection && (siteTextSelection.section.startsWith("site-") || siteTextSelection.section === "brand" || siteTextSelection.section === "navigation")) {
      beginSiteTextGesture(event, siteText, siteTextSelection);
      return;
    }
    const button = event.target.closest<HTMLElement>(".store-animation-cta[data-animation-button-layout-target]");
    if (button) {
      event.stopPropagation();
      const handle = event.target.closest<HTMLElement>(".store-animation-button-handle");
      if (event.pointerType === "touch" && !handle) return;
      if (event.detail <= 1) beginAnimationButtonGesture(event, button);
      return;
    }
    const copy = event.target.closest<HTMLElement>("[data-animation-copy][data-animation-layout-target]");
    if (!copy) return;
    // Editor gestures own this pointer. Do not let an underlying carousel or
    // swipe controller interpret the same press as scene navigation.
    event.stopPropagation();
    const handle = event.target.closest<HTMLElement>("[data-animation-layout-handle]");
    if (event.pointerType === "touch" && !handle) return;
    // The first press remains available for dragging. The second press of a
    // double-click must remain untouched so the inline text editor can open.
    if (!handle && event.detail > 1) return;
    const action = handle?.dataset.animationLayoutHandle;
    beginAnimationTextGesture(event, copy, action === "width" || action === "scale" ? action : "move");
  }, true);
  app.addEventListener("click", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    if (storePreviewEditorSuppressNextClick) {
      storePreviewEditorSuppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (storePreviewInlineEditorTarget && event.target.closest("[contenteditable]")) return;
    // Category cards are storefront navigation first. Their dedicated
    // "Cambiar portada" canvas control still edits the image, while touching
    // anywhere on the card opens that category even inside the live preview.
    if (event.target.closest("[data-catalog-section]")) {
      clearStorePreviewEditorSelection();
      return;
    }
    const target = event.target.closest<HTMLElement>("[data-store-editor-target]");
    const interactive = event.target.closest("button, a, input, select, textarea, [role='button']");
    // Controls inside a large editable section still own their click. The one
    // exception is editor text nested by a link (the store name), where the
    // interactive wrapper contains the actual direct-edit target.
    if (interactive && (!target || !interactive.contains(target))) {
      clearStorePreviewEditorSelection();
      return;
    }
    const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
    if (!target || !selection) {
      clearStorePreviewEditorSelection();
      return;
    }
    // Section wrappers are intentionally large so their background can be
    // edited. When another element is already selected, however, a tap on that
    // visually empty canvas should dismiss the editor first instead of merely
    // replacing it with the section-level toolbar.
    if (selection.field === "section" && storePreviewEditorSelection) {
      clearStorePreviewEditorSelection();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    if (storePreviewEditorClickTimer !== null) window.clearTimeout(storePreviewEditorClickTimer);
    if (target.dataset.storeEditorInline === "text" && !selection.animationId) {
      storePreviewEditorClickTimer = null;
      if (target.dataset.storeEditorDraggableText === "true") {
        showStorePreviewEditorHover(target);
        postToParent("STORE_EDITOR_SELECT", { selection });
        const destination = target.closest<HTMLAnchorElement>("a[href]");
        if (destination && (selection.section === "brand" || selection.section === "navigation")) {
          storePreviewEditorClickTimer = window.setTimeout(() => {
            storePreviewEditorClickTimer = null;
            const selector = destination.dataset.storeScrollTarget || "";
            let scrollDestination: HTMLElement | null = null;
            try {
              scrollDestination = selector ? app.querySelector<HTMLElement>(selector) : null;
            } catch {
              scrollDestination = null;
            }
            if (scrollDestination) {
              scrollDestination.scrollIntoView({
                behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start",
              });
            } else {
              window.location.assign(destination.href);
            }
          }, 320);
        }
        return;
      }
      showStorePreviewEditorHover(null);
      beginStorePreviewInlineTextEdit(target, selection);
      return;
    }
    if (selection.animationId && Number.isInteger(selection.itemIndex)) {
      const section = target.closest<HTMLElement>(".store-motion-section[data-animation-id]");
      section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: selection.itemIndex } }));
      // Scene-driven carousels reuse one copy node and update its media index
      // while showing the scene, so apply the selection after that update.
      syncStorePreviewEditorSelection();
      showStorePreviewEditorHover(target);
      storePreviewEditorClickTimer = null;
      postToParent("STORE_EDITOR_SELECT", { selection });
      return;
    }
    showStorePreviewEditorHover(target);
    storePreviewEditorClickTimer = window.setTimeout(() => {
      storePreviewEditorClickTimer = null;
      postToParent("STORE_EDITOR_SELECT", { selection });
    }, 320);
  }, true);
  app.addEventListener("dblclick", (event) => {
    if (!storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    storePreviewEditorSuppressNextClick = false;
    const target = event.target.closest<HTMLElement>("[data-store-editor-target]");
    const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
    if (!target || !selection || !target.dataset.storeEditorInline) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (storePreviewEditorClickTimer !== null) window.clearTimeout(storePreviewEditorClickTimer);
    storePreviewEditorClickTimer = null;
    storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    showStorePreviewEditorHover(null);
    if (target.dataset.storeEditorInline === "text") beginStorePreviewInlineTextEdit(target, selection);
    else beginStorePreviewInlineImageEdit(selection);
  }, true);

  let toolbarPositionFrame = 0;
  const refreshCanvasToolbarPosition = () => {
    if (toolbarPositionFrame) return;
    toolbarPositionFrame = window.requestAnimationFrame(() => {
      toolbarPositionFrame = 0;
      const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar:not([hidden])");
      const target = app.querySelector<HTMLElement>(".store-preview-editor-selected");
      if (toolbar && target) positionStorePreviewCanvasToolbar(toolbar, target);
    });
  };
  window.addEventListener("scroll", refreshCanvasToolbarPosition, { passive: true });
  window.addEventListener("resize", refreshCanvasToolbarPosition, { passive: true });
}

function scrollStorePreviewToSection(section: StorePreviewSection | `animation-${string}` | `site-${string}`): void {
  if (section.startsWith("animation-")) {
    window.requestAnimationFrame(() => {
      const id = section.slice("animation-".length);
      const target = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
        .find((entry) => entry.dataset.animationId === id);
      if (target) scrollStorePreviewToElement(target);
    });
    return;
  }
  if (section.startsWith("site-")) {
    window.requestAnimationFrame(() => {
      const id = section.slice("site-".length);
      const target = Array.from(app.querySelectorAll<HTMLElement>(".bespoke-zone[data-site-section]"))
        .find((entry) => entry.dataset.siteSection === id);
      if (target) scrollStorePreviewToElement(target);
    });
    return;
  }
  const selectors: Record<StorePreviewSection, string> = {
    brand: ".merchant-header",
    navigation: ".store-site-nav, .merchant-header",
    announcement: ".store-announcement, .merchant-header",
    hero: ".store-carousel, .store-hero, .merchant-header",
    products: ".store-products",
    about: ".store-about, .store-products",
    gallery: ".store-editorial-gallery, .store-products",
    motion: ".store-motion-section, .store-editorial-gallery, .store-products",
    contact: ".store-contact-section, .store-footer, .secure-note",
    links: ".store-footer, .secure-note",
    location: ".store-location-section, .secure-note",
    footer: ".store-site-footer, .secure-note",
    promotion: ".promotion-dialog, .merchant-header",
  };
  window.requestAnimationFrame(() => {
    const target = app.querySelector<HTMLElement>(selectors[section as StorePreviewSection]);
    if (!target) return;
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // scrollIntoView can propagate through an iframe and move the merchant
    // dashboard. Scrolling this window directly keeps all movement inside the
    // storefront preview while preserving the editor's page position.
    window.scrollTo({ top: storePreviewScrollTop(target), behavior: reduceMotion ? "auto" : "smooth" });
  });
}

function storePreviewScrollTop(target: HTMLElement): number {
  const targetRect = target.getBoundingClientRect();
  const documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  const maxTop = Math.max(0, documentHeight - window.innerHeight);
  const absoluteTop = window.scrollY + targetRect.top;
  // Center compact controls, but align long storefront sections near their
  // beginning. Centering a multi-viewport animation jumps thousands of pixels
  // into its scroll track and makes the preview appear blank or broken.
  const topInset = Math.min(96, Math.max(20, Math.round(window.innerHeight * .14)));
  const proposedTop = targetRect.height >= window.innerHeight * .9
    ? absoluteTop - topInset
    : absoluteTop - (window.innerHeight - targetRect.height) / 2;
  return Math.max(0, Math.min(proposedTop, maxTop));
}

function scrollStorePreviewToElement(target: HTMLElement): void {
  const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: storePreviewScrollTop(target), behavior: reduceMotion ? "auto" : "smooth" });
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
    const storyTabs = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-story-to]"));
    const storyPanels = Array.from(app.querySelectorAll<HTMLElement>(".store-story-panel"));
    if (storyTabs.length && storyPanels.length) {
      const targetIndex = Math.min(safeIndex, Math.min(storyTabs.length, storyPanels.length) - 1);
      storyTabs.forEach((tab, tabIndex) => tab.setAttribute("aria-selected", String(tabIndex === targetIndex)));
      storyPanels.forEach((panel, panelIndex) => {
        const active = panelIndex === targetIndex;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
        panel.inert = !active;
      });
      const gallery = app.querySelector<HTMLElement>(".store-editorial-gallery");
      if (gallery) scrollStorePreviewToElement(gallery);
      return;
    }

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

    scrollStorePreviewToSection("gallery");
  });
}

function sanitizeStorePreviewPatch(value: unknown): StorePreviewPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if ("siteDocument" in source) {
    const siteDocument = sanitizeSiteDocument(source.siteDocument);
    clean.siteDocument = siteDocument;
  }
  if (source.sectionBackgrounds && typeof source.sectionBackgrounds === "object" && !Array.isArray(source.sectionBackgrounds)) {
    clean.sectionBackgrounds = Object.fromEntries(
      Object.entries(source.sectionBackgrounds as Record<string, unknown>)
        .filter(([section, color]) => /^(?:hero|products|about|gallery|links|contact|location|motion|animation-[a-z0-9][a-z0-9_-]{0,47}|site-[a-z][a-z0-9-]{1,47})$/.test(section) && typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))
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
  if (["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(String(source.fontStyle))) clean.fontStyle = source.fontStyle;
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
  clean.announcementSize = ["small", "medium", "large"].includes(String(source.announcementSize))
    ? source.announcementSize as Store["announcementSize"]
    : "small";
  if (typeof source.announcementColor === "string" && /^#[0-9a-f]{6}$/i.test(source.announcementColor)) {
    clean.announcementColor = source.announcementColor.toLowerCase();
  }
  if (["store", "modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(String(source.announcementFont))) {
    clean.announcementFont = source.announcementFont as Store["announcementFont"];
  }
  if (["none", "wave", "pulse", "sparkle"].includes(String(source.announcementEffect))) {
    clean.announcementEffect = source.announcementEffect as Store["announcementEffect"];
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
    const allowedSections = ["hero", "products", "about", "gallery", "contact", "location", "links", "motion", ...motionSections];
    const order = source.contentOrder.filter((section): section is string =>
      typeof section === "string" && (allowedSections.includes(section) || /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(section) || /^site-[a-z][a-z0-9-]{1,47}$/.test(section)),
    );
    const requiredSections = ["hero", "products", "about", "gallery", "contact", "links"];
    const authoredOrder = order.some((section) => /^site-[a-z]/.test(section));
    if ((authoredOrder || requiredSections.every((section) => order.includes(section))) && new Set(order).size === order.length) clean.contentOrder = order;
  }
  if (["cinematic", "editorial", "collage", "catalog-first"].includes(String(source.layoutStyle))) clean.layoutStyle = source.layoutStyle;
  if (["editorial-grid", "story-scroller"].includes(String(source.experienceStyle))) clean.experienceStyle = source.experienceStyle;
  else if (["coverflow", "diagonal-marquee"].includes(String(source.experienceStyle))) clean.experienceStyle = "editorial-grid";
  if (typeof source.motionDuoEnabled === "boolean") clean.motionDuoEnabled = source.motionDuoEnabled;
  if (isStoreMotionExperience(source.motionExperience)) clean.motionExperience = source.motionExperience;
  if (Array.isArray(source.motionExperiences)) {
    const motionExperiences = source.motionExperiences.filter(isStoreMotionExperience);
    if (motionExperiences.length && new Set(motionExperiences).size === motionExperiences.length) clean.motionExperiences = motionExperiences;
  }
  if (Array.isArray(source.animations)) {
    const previewSiteDocument = (clean.siteDocument as StoreSiteDocument | undefined)
      ?? sanitizeSiteDocument(activePreviewRenderedStore?.siteDocument ?? activePreviewStore?.store.siteDocument);
    const previewPageIds = new Set(
      previewSiteDocument?.pages?.map((page) => page.id) ?? [],
    );
    clean.animations = source.animations
      .filter((animation): animation is Record<string, unknown> => !!animation && typeof animation === "object" && !Array.isArray(animation))
      .map((animation) => ({
        id: typeof animation.id === "string" && /^[a-z0-9][a-z0-9_-]{0,47}$/.test(animation.id) ? animation.id : "",
        name: typeof animation.name === "string" ? animation.name.slice(0, 60) : "",
        type: isStoreMotionExperience(animation.type) ? animation.type : "",
        ...(typeof animation.pageId === "string" && previewPageIds.has(animation.pageId)
          ? { pageId: animation.pageId }
          : {}),
        title: typeof animation.title === "string" ? animation.title.slice(0, 100) : "",
        subtitle: typeof animation.subtitle === "string" ? animation.subtitle.slice(0, 220) : "",
        productId: typeof animation.productId === "string" ? animation.productId.slice(0, 80) : "",
        ...(typeof animation.buttonLabel === "string" ? { buttonLabel: animation.buttonLabel.slice(0, 36) } : {}),
        ...(typeof animation.buttonPositionX === "number" && Number.isInteger(animation.buttonPositionX) && animation.buttonPositionX >= 0 && animation.buttonPositionX <= 100 ? { buttonPositionX: animation.buttonPositionX } : {}),
        ...(typeof animation.buttonPositionY === "number" && Number.isInteger(animation.buttonPositionY) && animation.buttonPositionY >= 0 && animation.buttonPositionY <= 100 ? { buttonPositionY: animation.buttonPositionY } : {}),
        ...(typeof animation.textPositionX === "number" && Number.isInteger(animation.textPositionX) && animation.textPositionX >= 0 && animation.textPositionX <= 100 ? { textPositionX: animation.textPositionX } : {}),
        ...(typeof animation.textPositionY === "number" && Number.isInteger(animation.textPositionY) && animation.textPositionY >= 0 && animation.textPositionY <= 100 ? { textPositionY: animation.textPositionY } : {}),
        ...(typeof animation.textScale === "number" && Number.isInteger(animation.textScale) && animation.textScale >= 50 && animation.textScale <= 200 ? { textScale: animation.textScale } : {}),
        ...(typeof animation.textWidthPercent === "number" && Number.isInteger(animation.textWidthPercent) && animation.textWidthPercent >= 20 && animation.textWidthPercent <= 100 ? { textWidthPercent: animation.textWidthPercent } : {}),
        ...(typeof animation.textAlign === "string" && ["left", "center", "right"].includes(animation.textAlign) ? { textAlign: animation.textAlign as StoreAnimation["textAlign"] } : {}),
        ...(typeof animation.textSize === "string" && ["small", "medium", "large"].includes(animation.textSize) ? { textSize: animation.textSize as StoreAnimation["textSize"] } : {}),
        ...(typeof animation.textWidth === "string" && ["narrow", "medium", "wide"].includes(animation.textWidth) ? { textWidth: animation.textWidth as StoreAnimation["textWidth"] } : {}),
        ...(typeof animation.textColor === "string" && /^#[0-9a-f]{6}$/i.test(animation.textColor) ? { textColor: animation.textColor } : {}),
        ...(typeof animation.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(animation.backgroundColor) ? { backgroundColor: animation.backgroundColor } : {}),
        ...(typeof animation.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(animation.fontStyle) ? { fontStyle: animation.fontStyle as StoreAnimation["fontStyle"] } : {}),
        textBlocks: Array.isArray(animation.textBlocks)
          ? animation.textBlocks.flatMap((entry) => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
              const block = entry as Record<string, unknown>;
              if (typeof block.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(block.id)) return [];
              if (block.role !== "title" && block.role !== "subtitle") return [];
              if (typeof block.text !== "string" || !block.text.trim()) return [];
              return [{
                id: block.id,
                role: block.role,
                text: block.text.slice(0, 220),
                ...(typeof block.textPositionX === "number" && Number.isInteger(block.textPositionX) && block.textPositionX >= 0 && block.textPositionX <= 100 ? { textPositionX: block.textPositionX } : {}),
                ...(typeof block.textPositionY === "number" && Number.isInteger(block.textPositionY) && block.textPositionY >= 0 && block.textPositionY <= 100 ? { textPositionY: block.textPositionY } : {}),
                ...(typeof block.textScale === "number" && Number.isInteger(block.textScale) && block.textScale >= 50 && block.textScale <= 200 ? { textScale: block.textScale } : {}),
                ...(typeof block.textWidthPercent === "number" && Number.isInteger(block.textWidthPercent) && block.textWidthPercent >= 20 && block.textWidthPercent <= 100 ? { textWidthPercent: block.textWidthPercent } : {}),
                ...(typeof block.textAlign === "string" && ["left", "center", "right"].includes(block.textAlign) ? { textAlign: block.textAlign as "left" | "center" | "right" } : {}),
                ...(typeof block.textColor === "string" && /^#[0-9a-f]{6}$/i.test(block.textColor) ? { textColor: block.textColor } : {}),
                ...(typeof block.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(block.fontStyle) ? { fontStyle: block.fontStyle as StoreAnimation["fontStyle"] } : {}),
              }];
            }).slice(0, 24)
          : [],
        media: Array.isArray(animation.media)
          ? animation.media
              .filter((image): image is Record<string, unknown> => !!image && typeof image === "object" && !Array.isArray(image))
              .map((image) => ({
                imageUrl: typeof image.imageUrl === "string" && /^\/v1\/uploads\//.test(image.imageUrl) ? image.imageUrl : "",
                ...(typeof image.productId === "string" && image.productId.length <= 80 ? { productId: image.productId } : {}),
                title: typeof image.title === "string" ? image.title.slice(0, 100) : "",
                caption: typeof image.caption === "string" ? image.caption.slice(0, 180) : "",
                body: typeof image.body === "string" ? image.body.slice(0, 360) : "",
                boxColor: typeof image.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(image.boxColor) ? image.boxColor : undefined,
                ...(typeof image.textPositionX === "number" && Number.isInteger(image.textPositionX) && image.textPositionX >= 0 && image.textPositionX <= 100 ? { textPositionX: image.textPositionX } : {}),
                ...(typeof image.textPositionY === "number" && Number.isInteger(image.textPositionY) && image.textPositionY >= 0 && image.textPositionY <= 100 ? { textPositionY: image.textPositionY } : {}),
                ...(typeof image.textScale === "number" && Number.isInteger(image.textScale) && image.textScale >= 50 && image.textScale <= 200 ? { textScale: image.textScale } : {}),
                ...(typeof image.textWidthPercent === "number" && Number.isInteger(image.textWidthPercent) && image.textWidthPercent >= 20 && image.textWidthPercent <= 100 ? { textWidthPercent: image.textWidthPercent } : {}),
                ...(typeof image.textAlign === "string" && ["left", "center", "right"].includes(image.textAlign) ? { textAlign: image.textAlign as "left" | "center" | "right" } : {}),
                ...(typeof image.textColor === "string" && /^#[0-9a-f]{6}$/i.test(image.textColor) ? { textColor: image.textColor } : {}),
                ...(typeof image.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(image.fontStyle) ? { fontStyle: image.fontStyle as StoreAnimation["fontStyle"] } : {}),
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
        ...(typeof image.productId === "string" && image.productId.length <= 80 ? { productId: image.productId } : {}),
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
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  document.body.classList.toggle("has-bespoke-site", Boolean(siteDocument));
  if (siteDocument) {
    store.siteDocument = siteDocument;
    document.body.dataset.siteArtDirection = siteDocument.artDirection || "custom";
    document.body.dataset.siteHeadingFont = siteDocument.theme.headingFont;
    document.body.dataset.siteBodyFont = siteDocument.theme.bodyFont;
    document.body.dataset.siteNav = siteDocument.navigation.layout;
    document.body.dataset.siteHeaderStyle = "full";
    document.body.dataset.siteBrandPosition = siteDocument.navigation.brandPosition || (siteDocument.navigation.layout === "centered" ? "center" : "left");
    document.body.dataset.siteNavPosition = siteDocument.navigation.navPosition || (siteDocument.navigation.layout === "split" ? "left" : "center");
    document.body.dataset.siteSearchPosition = siteDocument.navigation.searchPosition || "right";
    document.body.dataset.siteProfilePosition = siteDocument.navigation.profilePosition || "right";
    document.body.dataset.siteCartPosition = siteDocument.navigation.cartPosition || "right";
    document.body.dataset.siteSticky = String(siteDocument.navigation.sticky);
    document.body.dataset.siteTransparent = String(siteDocument.navigation.transparent);
    document.body.dataset.siteProducts = siteDocument.theme.productLayout;
    document.body.dataset.siteShadow = siteDocument.theme.shadow;
    document.body.dataset.siteScale = siteDocument.theme.displayScale;
    document.body.dataset.siteDensity = siteDocument.theme.density;
    document.body.dataset.siteImageTreatment = siteDocument.theme.imageTreatment;
    document.body.dataset.siteLogoTreatment = siteDocument.navigation.logoTreatment;
    document.body.dataset.siteMotionIntensity = siteDocument.motion.intensity;
    document.body.dataset.siteSpotlight = siteDocument.merchandising.spotlightLayout;
    document.body.dataset.siteComposition = siteDocument.designGenome.composition;
    document.body.dataset.siteRhythm = siteDocument.designGenome.rhythm;
    document.body.dataset.siteGeometry = siteDocument.designGenome.geometry;
    document.body.dataset.siteColorStrategy = siteDocument.designGenome.colorStrategy;
    document.body.dataset.siteMediaStrategy = siteDocument.designGenome.mediaStrategy;
    document.body.dataset.siteTypeScale = siteDocument.designGenome.typeScale;
    document.body.dataset.siteMotionLanguage = siteDocument.designGenome.motionLanguage;
    document.documentElement.style.setProperty("--site-page", siteDocument.theme.pageBackground);
    document.documentElement.style.setProperty("--site-ink", siteDocument.theme.textColor);
    document.documentElement.style.setProperty("--site-accent", siteDocument.theme.accentColor);
    document.documentElement.style.setProperty("--site-secondary", siteDocument.theme.secondaryColor);
    document.documentElement.style.setProperty("--site-surface", siteDocument.theme.surfaceColor);
    document.documentElement.style.setProperty("--site-muted", siteDocument.theme.mutedColor);
    document.documentElement.style.setProperty("--site-border", siteDocument.theme.borderColor);
    document.documentElement.style.setProperty("--site-radius", `${siteDocument.theme.radius}px`);
  } else {
    delete document.body.dataset.siteArtDirection;
    delete document.body.dataset.siteHeadingFont;
    delete document.body.dataset.siteBodyFont;
    delete document.body.dataset.siteNav;
    delete document.body.dataset.siteHeaderStyle;
    delete document.body.dataset.siteBrandPosition;
    delete document.body.dataset.siteNavPosition;
    delete document.body.dataset.siteSearchPosition;
    delete document.body.dataset.siteProfilePosition;
    delete document.body.dataset.siteCartPosition;
    delete document.body.dataset.siteSticky;
    delete document.body.dataset.siteTransparent;
    delete document.body.dataset.siteProducts;
    delete document.body.dataset.siteShadow;
    delete document.body.dataset.siteScale;
    delete document.body.dataset.siteDensity;
    delete document.body.dataset.siteImageTreatment;
    delete document.body.dataset.siteLogoTreatment;
    delete document.body.dataset.siteMotionIntensity;
    delete document.body.dataset.siteSpotlight;
    delete document.body.dataset.siteComposition;
    delete document.body.dataset.siteRhythm;
    delete document.body.dataset.siteGeometry;
    delete document.body.dataset.siteColorStrategy;
    delete document.body.dataset.siteMediaStrategy;
    delete document.body.dataset.siteTypeScale;
    delete document.body.dataset.siteMotionLanguage;
  }

  // Storefront branding is per-store, not per-page. Set it for both the
  // catalog and product routes so a shared product link still feels wholly
  // owned by the merchant and never inherits another store's appearance.
  const solidBackground = siteDocument?.theme.pageBackground || store.backgroundColor || "#0a0a0a";
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

  const authoredAccent = siteDocument?.theme.accentColor || store.accentColor;
  if (authoredAccent) {
    const effectiveAccent = clampAccentLightness(authoredAccent);
    document.documentElement.style.setProperty("--pg-accent", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-2", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-contrast", accentContrastColor(effectiveAccent));
  } else {
    const palette = DEFAULT_ACCENT_PALETTES[useLightTheme ? "light" : "dark"];
    document.documentElement.style.setProperty("--pg-accent", palette.accent);
    document.documentElement.style.setProperty("--pg-accent-2", palette.accent2);
    document.documentElement.style.setProperty("--pg-accent-contrast", palette.contrast);
  }
  document.body.classList.toggle("has-custom-accent", !!authoredAccent);
  document.body.dataset.fontStyle = store.fontStyle || "modern";
  document.body.dataset.buttonStyle = store.buttonStyle || "rounded";
  document.body.dataset.buttonVariant = store.buttonVariant || "solid";
  document.body.dataset.buttonMotion = store.buttonMotion || "lift";
  document.body.dataset.boardTexture = store.boardTexture || "chalkboard";
  // A generated site document owns its composition. Letting an older store
  // layout leak through here made otherwise-desktop heroes inherit compact
  // catalog-first heights or collage insets inside the appearance preview.
  document.body.dataset.layoutStyle = siteDocument ? "cinematic" : store.layoutStyle || "cinematic";
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

function collectionIdFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get("collection");
}

function renderStoreRoute(slug: string, store: Store, options: { focusPromotion?: boolean } = {}): void {
  activeStoreRoute = { slug, store };
  const productId = productIdFromLocation();
  if (productId) renderProductPage(slug, store, productId);
  else {
    selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    selectedCollectionId = collectionIdFromLocation() ?? "ALL";
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
  app.querySelectorAll<HTMLAnchorElement>("[data-store-scroll-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const selector = link.dataset.storeScrollTarget || "";
      const target = selector ? app.querySelector<HTMLElement>(selector) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  });
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
      </main>
      ${storefrontFooterHtml(store)}`;
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

  const configuredRelatedItems = store.items
    .filter((candidate) => (item.recommendedProductIds ?? []).includes(candidate.id))
    .sort((first, second) => (item.recommendedProductIds ?? []).indexOf(first.id) - (item.recommendedProductIds ?? []).indexOf(second.id))
    .slice(0, 4);
  const fallbackRelatedItems = store.items
    .filter((candidate) => candidate.id !== item.id)
    .sort((first, second) => Number(second.categoryId === item.categoryId) - Number(first.categoryId === item.categoryId))
    .slice(0, 4);
  const relatedItems = storeEditorMode ? configuredRelatedItems : configuredRelatedItems.length ? configuredRelatedItems : fallbackRelatedItems;
  const relatedProductsHtml = relatedItems.length || storeEditorMode
    ? `<section class="product-detail-related" aria-labelledby="product-detail-related-title">
        <div class="product-detail-related-heading">
          <h2 id="product-detail-related-title">${escapeHtml(storeEditorMode ? "Productos recomendados" : itemCategory ? `Más de ${itemCategory.name}` : "Sigue explorando")}</h2>
          <a class="store-catalog-link" href="${escapeHtml(catalogUrl)}">Ver la colección${ICON_ARROW_RIGHT}</a>
        </div>
        <div class="product-detail-related-grid">
          ${relatedItems.map((relatedItem) => {
            const relatedImageUrl = relatedItem.imageUrls.map(assetUrl).find((url): url is string => Boolean(url));
            return `<a class="product-detail-related-item product-page-link" href="${escapeHtml(productPageUrl(slug, relatedItem.id))}" aria-label="Ver ${escapeHtml(relatedItem.name)}">
              <span class="product-detail-related-media">${relatedImageUrl
                ? `<img src="${escapeHtml(relatedImageUrl)}" alt="" loading="lazy" decoding="async" style="object-position:${productImagePosition(relatedItem, 0)}">`
                : `<span aria-hidden="true">${escapeHtml(initials(relatedItem.name))}</span>`}</span>
              <span class="product-detail-related-copy"><strong>${escapeHtml(relatedItem.name)}</strong><span>${formatAmount(discountedProductAmount(relatedItem, relatedItem.amount), relatedItem.currency)}</span></span>
            </a>`;
          }).join("")}
          ${storeEditorMode ? Array.from({ length: Math.max(1, 4 - relatedItems.length) }, () => previewBlueprintButton("recommendation", { label: store.items.length > 1 ? "Agregar recomendado" : "Crea otro producto", copy: store.items.length > 1 ? "Elige desde tu catálogo" : "Después podrás recomendarlo", productId: item.id, compact: true })).join("") : ""}
        </div>
      </section>`
    : "";

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

  const startingVariant = selectedVariant ?? variants
    .filter(variant => optionStock(item, variant) !== 0)
    .sort((a, b) => a.amount - b.amount)[0];
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
      <section class="product-detail-content product-detail-buy">
        ${itemCategory ? `<div class="product-detail-category">${escapeHtml(itemCategory.name)}</div>` : ""}
        ${detailSaleBanner}
        ${item.tags.length ? `<div class="store-item-tags">${item.tags.map((tag) => `<span class="tag-badge">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
        <h1>${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" aria-hidden="true"></span>` : ""}${escapeHtml(item.name)}</h1>
        ${variantsHtml}
        ${extrasHtml}
        ${!configurationComplete ? `<div class="product-configuration-note" role="status">Selecciona todas las opciones requeridas para continuar.</div>` : ""}
        <div class="product-detail-purchase">
          <div>
            ${variants.length && !selectedVariant ? '<span>Desde </span>' : ''}${salePriceHtml(item, selectedUnitAmount(item, startingVariant, selectedExtras), originalSelectedUnitAmount(item, startingVariant, selectedExtras), "product-detail-price")}
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
      <aside class="product-detail-information" aria-label="Información de ${escapeHtml(item.name)}">
        <details open>
          <summary>El producto<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy">${item.description ? `<p class="product-detail-description">${escapeHtml(item.description)}</p>` : `<p>Consulta las opciones disponibles y elige la configuración que prefieras.</p>`}</div>
        </details>
        <details>
          <summary>Detalles<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy">${itemCategory ? `<p><strong>Categoría:</strong> ${escapeHtml(itemCategory.name)}</p>` : ""}${item.tags.length ? `<p><strong>Características:</strong> ${escapeHtml(item.tags.join(" · "))}</p>` : ""}<p>El precio y la disponibilidad se actualizan según la versión seleccionada.</p></div>
        </details>
        <details>
          <summary>Entrega y retiro<span aria-hidden="true"></span></summary>
          <div class="product-detail-information-copy"><p>Las opciones disponibles para tu pedido se muestran antes de completar la compra.</p></div>
        </details>
      </aside>
    </main>
    ${relatedProductsHtml}
    <div class="cart-bar product-detail-cart-bar">
      <span class="cart-summary" aria-live="polite"></span>
      <button type="button" class="primary" id="cart-pay">Ver carrito</button>
      <span class="cart-checkout-error" role="alert" hidden></span>
    </div>
    <div class="secure-note product-detail-secure-note">${store.checkoutMode === "payment" ? ICON_LOCK : store.checkoutMode === "whatsapp" ? ICON_WHATSAPP : ICON_EXTERNAL}<span>${store.checkoutMode === "payment" ? "Pago procesado de forma segura por pagosYa" : store.checkoutMode === "whatsapp" ? "El pedido se enviará directamente a WhatsApp" : "Tu correo y selección se enviarán a la tienda"}</span></div>
    ${storefrontFooterHtml(store)}`;

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
  bindPreviewBlueprints(store);
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
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  const requestedPageSlug = new URLSearchParams(window.location.search).get("page");
  const activeSitePage = requestedPageSlug ? siteDocument?.pages?.find((page) => page.slug === requestedPageSlug) ?? null : null;
  const siteSectionsForPage: StoreSiteDocument["sections"] = (siteDocument?.sections ?? []).filter((section) => activeSitePage ? section.pageId === activeSitePage.id : !section.pageId);
  if (siteDocument?.merchandising.productOrderIds.length) {
    const productRank = new Map(siteDocument.merchandising.productOrderIds.map((id, index) => [id, index]));
    store = {
      ...store,
      items: [...store.items].sort((first, second) => (productRank.get(first.id) ?? Number.MAX_SAFE_INTEGER) - (productRank.get(second.id) ?? Number.MAX_SAFE_INTEGER)),
    };
  }
  const siteSection = (kind: StoreSiteDocument["sections"][number]["kind"]) => siteSectionsForPage.find((section) => section.kind === kind);
  const activeCatalogSection = siteSection("catalog");
  // Older generated documents stored [] on the primary catalog even though
  // their merchandising inventory was complete. Recover those sites as a
  // full catalog; manually-created empty sections have no generated order and
  // keep their intentional empty-state blueprint.
  const recoverGeneratedPrimaryCatalog = Boolean(
    activeCatalogSection
    && !activeCatalogSection.pageId
    && Array.isArray(activeCatalogSection.productIds)
    && activeCatalogSection.productIds.length === 0
    && siteDocument?.merchandising.productOrderIds.length,
  );
  const activeCatalogProductIds = activeCatalogSection?.productIds && !recoverGeneratedPrimaryCatalog
    ? new Set(activeCatalogSection.productIds.filter((id) => store.items.some((item) => item.id === id)))
    : null;
  if (activeCatalogSection?.productIds?.length) {
    const pageProductRank = new Map(activeCatalogSection.productIds.map((id, index) => [id, index]));
    store = {
      ...store,
      items: [...store.items].sort((first, second) =>
        (pageProductRank.get(first.id) ?? Number.MAX_SAFE_INTEGER)
        - (pageProductRank.get(second.id) ?? Number.MAX_SAFE_INTEGER)),
    };
  }
  const currency = store.items[0]?.currency ?? "BOB";
  const visibleStoreName = store.storeName.trim();
  const bannerUrl = assetUrl(store.bannerUrl);
  if (activeCatalogStoreId !== store.storeId) {
    activeCatalogStoreId = store.storeId;
    searchQuery = "";
    selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    sortMode = "featured";
  }
  const siteHeroSection = siteSection("hero");
  const siteHeroSlides = (siteHeroSection?.mediaUrls ?? []).map((imageUrl, index) => {
    const item = siteHeroSection?.items.find((candidate) => candidate.mediaUrl === imageUrl) ?? siteHeroSection?.items[index];
    return {
      imageUrl,
      title: item?.title || siteHeroSection?.title || visibleStoreName,
      body: item?.body || siteHeroSection?.body || "",
      ctaLabel: siteHeroSection?.ctaLabel || "",
      ctaUrl: "",
      titleStyle: item?.titleStyle || siteHeroSection?.titleStyle,
      bodyStyle: item?.bodyStyle || siteHeroSection?.bodyStyle,
    };
  });
  const heroSlides = (siteDocument ? siteHeroSlides : store.heroSlides ?? [])
    .map((slide) => ({ ...slide, resolvedMediaUrl: assetUrl(slide.imageUrl) }))
    .filter((slide): slide is typeof slide & { resolvedMediaUrl: string } => !!slide.resolvedMediaUrl)
    .slice(0, 5);

  const visibleCatalogStore = activeCatalogProductIds === null
    ? store
    : { ...store, items: store.items.filter((item) => activeCatalogProductIds.has(item.id)) };
  const catalogSections = catalogSectionsForStore(visibleCatalogStore);
  const catalogCollections = (siteDocument?.merchandising.collections ?? [])
    .map((collection) => ({ ...collection, productIds: collection.productIds.filter((id) => store.items.some((item) => item.id === id)) }))
    .filter((collection) => collection.productIds.length > 0);
  if (activeCatalogProductIds !== null || (selectedCollectionId !== "ALL" && !catalogCollections.some((collection) => collection.id === selectedCollectionId))) selectedCollectionId = "ALL";
  // The editorial-maker grammar is a shop-first journal: after the animated
  // campaign opening, shoppers should meet actual products rather than a
  // second navigation layer made of category cards. Category headings still
  // organize the product grid and the normal catalog URL behavior is preserved
  // for every other composition grammar.
  const usesDirectEditorialCatalog = siteDocument?.designGenome.composition === "editorial-maker";
  const hasCatalogSectionPicker = !usesDirectEditorialCatalog && store.categories.length > 0 && catalogSections.length > 0;
  if (hasCatalogSectionPicker && selectedCategoryId !== "ALL" && !catalogSections.some((section) => section.id === selectedCategoryId)) {
    selectedCategoryId = "ALL";
  }
  const selectedCatalogSection = catalogSections.find((section) => section.id === selectedCategoryId) ?? null;
  document.body.classList.toggle("category-page", selectedCatalogSection !== null);
  // Categorized stores disclose their browsing tools after a shopper chooses
  // a section. Uncategorized stores keep the compact direct-catalog behavior.
  const visibleCatalogItemCount = activeCatalogProductIds === null ? store.items.length : activeCatalogProductIds.size;
  const showToolbar = hasCatalogSectionPicker ? selectedCatalogSection !== null : visibleCatalogItemCount > 1;

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
  const linkedEditorialMediaHtml = (
    mediaUrl: string,
    sourceUrl: string,
    alt: string,
    productId?: string,
    allowLink = true,
  ) => {
    const media = fidelityImageHtml(mediaUrl, sourceUrl, alt);
    const product = productId ? store.items.find((item) => item.id === productId) : undefined;
    if (!product || !allowLink || storeEditorMode) return media;
    return `<a class="store-editorial-product-link product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" aria-label="Ver ${escapeHtml(product.name)}">
      ${media}
      <span class="store-editorial-product-cue"><span>Ver ${escapeHtml(product.name)}</span>${ICON_ARROW_RIGHT}</span>
    </a>`;
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
              const titleLength = Array.from(slide.title || "").length;
              const titleClass = titleLength > 88 ? " is-very-long" : titleLength > 56 ? " is-long" : "";
              return `<article class="store-slide ${index === 0 ? "active" : ""}" data-slide-index="${index}" aria-hidden="${index === 0 ? "false" : "true"}">
                ${
                  isVideoMediaUrl(slide.resolvedMediaUrl)
                    ? `<video src="${escapeHtml(slide.resolvedMediaUrl)}" aria-label="${escapeHtml(slide.title || `Destacado ${index + 1}`)}" muted loop playsinline preload="metadata"></video>`
                    : fidelityImageHtml(slide.resolvedMediaUrl, slide.imageUrl, slide.title || `Destacado ${index + 1}`, { eager: index === 0 })
                }
                ${
                  hasCopy
                    ? `<div class="store-slide-overlay">
                        ${slide.title ? `<h2 class="store-slide-title${titleClass}"${canvasTextStyleAttributes(slide.titleStyle)}>${escapeHtml(slide.title)}</h2>` : ""}
                        ${slide.body ? `<p${canvasTextStyleAttributes(slide.bodyStyle)}>${escapeHtml(slide.body)}</p>` : ""}
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

  const catalogTitle = siteSection("catalog")?.title || store.catalogTitle?.trim() || "La tienda";
  const catalogSubtitle = siteSection("catalog")?.body || store.catalogSubtitle?.trim() || (visibleStoreName ? `Explora la selección de ${visibleStoreName}.` : "Explora nuestra selección.");
  const sectionCover = (section: CatalogSection): { url: string | null; position: string } => {
    if (section.bannerUrl) return { url: assetUrl(section.bannerUrl), position: "50% 50%" };
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
          ${storeEditorMode ? previewBlueprintButton("category", { label: "Nueva categoría", copy: "Nombre + foto, aquí mismo" }) : ""}
        </div>
      </div>`
    : "";
  const selectedSectionCover = selectedCatalogSection ? sectionCover(selectedCatalogSection) : null;
  const collectionMenuStyle = siteDocument?.merchandising.collectionMenuStyle === "editorial-sidebar" ? "editorial-sidebar" : "tabs";
  const collectionMenuHtml = activeCatalogProductIds === null && catalogCollections.length
    ? `<nav class="store-collection-menu is-${collectionMenuStyle}" role="tablist" aria-label="Colecciones de productos"><button id="store-collection-tab-ALL" type="button" role="tab" data-store-collection="ALL" aria-selected="${selectedCollectionId === "ALL"}" aria-controls="store-grid" tabindex="${selectedCollectionId === "ALL" ? "0" : "-1"}">Todo</button>${catalogCollections.map((collection) => `<button id="store-collection-tab-${escapeHtml(collection.id)}" type="button" role="tab" data-store-collection="${escapeHtml(collection.id)}" aria-selected="${selectedCollectionId === collection.id}" aria-controls="store-grid" tabindex="${selectedCollectionId === collection.id ? "0" : "-1"}">${escapeHtml(collection.name)}</button>`).join("")}</nav>`
    : "";
  const catalogBrowserHtml = !hasCatalogSectionPicker || selectedCatalogSection
    ? `<div class="store-catalog-browser${collectionMenuStyle === "editorial-sidebar" && catalogCollections.length ? " has-editorial-collection-menu" : ""}" id="store-catalog-browser" tabindex="-1">
        ${selectedCatalogSection
          ? `<div class="catalog-section-banner${selectedSectionCover?.url ? " has-image" : " is-placeholder"}" aria-labelledby="catalog-section-banner-title">
              ${selectedSectionCover?.url ? `<img src="${escapeHtml(selectedSectionCover.url)}" alt="" fetchpriority="high" decoding="async" style="object-position:${selectedSectionCover.position}">` : ""}
              <div class="catalog-section-banner-shade" aria-hidden="true"></div>
              <a class="catalog-section-back" href="${escapeHtml(storeCatalogUrl(slug))}">${ICON_ARROW_LEFT}<span>Ver secciones</span></a>
              <div class="catalog-section-banner-copy">
                <h3 id="catalog-section-banner-title">${escapeHtml(selectedCatalogSection.name)}</h3>
                <p>${selectedCatalogSection.items.length} ${selectedCatalogSection.items.length === 1 ? "producto" : "productos"} en esta sección</p>
                ${selectedCatalogSection.highlights.length ? `<ul class="catalog-section-highlights" aria-label="Información de esta sección">${selectedCatalogSection.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join("")}</ul>` : ""}
              </div>
            </div>`
          : ""}
        ${collectionMenuHtml}
        <div class="store-collection-content">
          ${toolbarHtml}
          <div id="store-grid" role="tabpanel" aria-labelledby="store-collection-tab-${escapeHtml(selectedCollectionId)}"></div>
          <div class="cart-bar">
            <span class="cart-summary" aria-live="polite"></span>
            <button type="button" class="primary" id="cart-pay">Ver carrito</button>
            <span class="cart-checkout-error" role="alert" hidden></span>
          </div>
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

  const aboutTitle = siteSection("story")?.title || store.aboutTitle?.trim() || "Conoce la marca";
  const aboutSubtitle = siteSection("story")?.body || store.aboutSubtitle?.trim() || store.tagline?.trim() || "Una mirada a la intención detrás de cada elección.";
  const aboutHtml = aboutParagraphs.length || aboutImageUrl || store.aboutTitle || store.aboutSubtitle
    ? `<section class="store-about${aboutImageUrl ? " has-image" : ""}${hasStoreAnimatedIn ? "" : " story-intro"}" aria-labelledby="store-about-title"${aboutImageUrl ? ` style="--store-about-image:url(&quot;${escapeHtml(aboutImageUrl)}&quot;);--store-about-position:${storeImagePosition(store, store.aboutImageUrl)}"` : ""}>
        <div class="store-about-heading">
          <h2 id="store-about-title"><span class="store-about-title-text">${escapeHtml(aboutTitle)}</span></h2>
          <p class="store-about-subtitle">${escapeHtml(aboutSubtitle)}</p>
        </div>
        <div class="store-about-body">${aboutParagraphs.length ? aboutParagraphs.map((paragraph, index) => `<p style="--story-delay:${340 + Math.min(index, 3) * 70}ms">${escapeHtml(paragraph)}</p>`).join("") : `<p style="--story-delay:340ms">${visibleStoreName ? `Pronto conocerás más sobre ${escapeHtml(visibleStoreName)}.` : "Pronto conocerás más sobre esta tienda."}</p>`}</div>
      </section>`
    : "";

  const experienceStyle = store.experienceStyle === "story-scroller" ? "story-scroller" : "editorial-grid";
  const storyVideoEntries = heroSlides
    .filter((slide) => isVideoMediaUrl(slide.resolvedMediaUrl))
    .map((slide) => ({
      mediaUrl: slide.resolvedMediaUrl,
      sourceUrl: slide.imageUrl,
      title: slide.title || "Una escena de la marca",
      caption: "Historia en movimiento",
      body: slide.body || "Un capítulo visual que continúa el recorrido después del catálogo.",
      isVideo: true,
      productId: undefined,
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
        productId: image.productId,
      }));
  const editorialFigure = (image: (typeof editorialImages)[number], index: number, extraClass = "", allowProductLink = true) => {
    const boxColor = typeof image.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(image.boxColor) ? image.boxColor : null;
    const boxStyle = boxColor
      ? `--store-editorial-card-bg:${boxColor};--store-editorial-card-ink:${accentContrastColor(boxColor)};`
      : "";
    return `<figure class="store-editorial-item ${extraClass}" style="${boxStyle}--experience-index:${index}">
      ${linkedEditorialMediaHtml(image.resolvedImageUrl, image.imageUrl, image.caption || `Imagen de la tienda ${index + 1}`, image.productId, allowProductLink)}
      ${(image.title || image.caption || image.body) ? `<figcaption>${image.title ? `<strong>${escapeHtml(image.title)}</strong>` : ""}${image.caption ? `<span>${escapeHtml(image.caption)}</span>` : ""}${image.body ? `<p>${escapeHtml(image.body)}</p>` : ""}</figcaption>` : ""}
    </figure>`;
  };
  const galleryExperienceHtml = experienceStyle === "story-scroller"
      ? `<div class="store-story-scroller">
          <div class="store-story-nav" role="tablist" aria-label="Capítulos de la marca">
            ${storyEntries.map((entry, index) => `<button type="button" role="tab" data-story-to="${index}" aria-selected="${index === 0}" aria-controls="store-story-${index}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(entry.title || `Capítulo ${index + 1}`)}</button>`).join("")}
          </div>
          <div class="store-story-stage">
            ${storyEntries.map((entry, index) => `<div id="store-story-${index}" class="store-story-panel${index === 0 ? " active" : ""}" role="tabpanel" aria-hidden="${index !== 0}">
              <figure class="store-editorial-item store-story-item">
                ${entry.isVideo
                  ? `<video src="${escapeHtml(entry.mediaUrl)}" aria-label="${escapeHtml(entry.title)}" muted loop playsinline preload="metadata" controls></video>`
                  : linkedEditorialMediaHtml(entry.mediaUrl, entry.sourceUrl, entry.caption, entry.productId)}
                <figcaption><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.caption)}</span><p>${escapeHtml(entry.body)}</p></figcaption>
              </figure>
            </div>`).join("")}
          </div>
        </div>`
      : `<div class="store-editorial-grid">${editorialImages.map((image, index) => editorialFigure(image, index)).join("")}</div>`;
  const hasGalleryExperience = experienceStyle === "story-scroller" ? storyEntries.length > 0 : editorialImages.length > 0;
  const allowedMotionExperiences = STORE_MOTION_EXPERIENCES;
  const savedMotionExperiences = Array.isArray(store.motionExperiences)
    ? store.motionExperiences.filter((experience) => allowedMotionExperiences.includes(experience))
    : [];
  const legacyMotionExperience = allowedMotionExperiences.includes(store.motionExperience as (typeof allowedMotionExperiences)[number])
    ? store.motionExperience as (typeof allowedMotionExperiences)[number]
    : null;
  const motionExperiences = [...new Set(savedMotionExperiences.length ? savedMotionExperiences : legacyMotionExperience ? [legacyMotionExperience] : [])];
  const savedAnimations = Array.isArray(store.animations)
    ? store.animations.filter((animation) =>
        !!animation &&
        /^[a-z0-9][a-z0-9_-]{0,47}$/.test(animation.id) &&
        allowedMotionExperiences.includes(animation.type),
      )
    : [];
  const legacyAnimationInstances: StoreAnimation[] = savedAnimations.length
    ? savedAnimations
    : store.motionDuoEnabled === true
      ? motionExperiences.map((type, index) => ({
          id: `legacy-${index + 1}-${type}`,
          name: type === "stagger-testimonials" ? "Reseñas" : type.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
          type,
          title: "",
          subtitle: "",
          productId: "",
          media: store.editorialGallery ?? [],
        }))
      : [];
  const authoredExperience = siteDocument?.experience;
  const authoredTextExperience = authoredExperience
    && ["layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"].includes(authoredExperience.type);
  const authoredTypewriterTitle = authoredExperience?.type === "text-rotate"
    && !authoredExperience.title.includes("|")
    ? [...new Set(store.items.map((item) => item.name.trim()).filter(Boolean))].slice(0, 5).join("|") || authoredExperience.title
    : authoredExperience?.title || "";
  const authoredTypewriterPrefix = authoredExperience?.type === "text-rotate"
    && !authoredExperience.title.includes("|")
    ? authoredExperience.title
    : authoredExperience?.body || "";
  const signatureAnimation: StoreAnimation | null = authoredExperience
    && authoredExperience.type !== "none"
    && (["layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"].includes(authoredExperience.type)
      || authoredExperience.mediaUrls.length >= 2)
      ? {
          id: "ai-signature-experience",
          name: authoredExperience.title || "Experiencia visual",
          type: authoredExperience.type,
          title: authoredTypewriterTitle,
          subtitle: authoredTypewriterPrefix,
          textColor: authoredTextExperience ? "#f4ead7" : siteDocument?.theme.textColor,
          backgroundColor: authoredTextExperience ? "#171612" : siteDocument?.theme.surfaceColor,
          media: authoredExperience.mediaUrls.map((imageUrl, index) => ({
            imageUrl,
            title: authoredExperience.title || `Escena ${index + 1}`,
            caption: authoredExperience.body,
            body: authoredExperience.body,
          })),
        }
      : null;
  const allAnimationInstances: StoreAnimation[] = [
    ...legacyAnimationInstances,
    ...(signatureAnimation && !legacyAnimationInstances.some((animation) => animation.type === signatureAnimation.type) ? [signatureAnimation] : []),
  ];
  const animationInstances = allAnimationInstances.filter((animation) =>
    activeSitePage ? animation.pageId === activeSitePage.id : !animation.pageId,
  );
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
  const technicalAnimationTitles = new Set([
    "story scroll", "hero editorial", "image stream", "scroll expansion", "hero gallery",
    "reseñas", "menú de momentos", "revelado circular", "preguntas en movimiento", "texto en capas",
    "texto mecanografiado", "texto revelado", "revelado por bloques", "texto en recorrido",
    "capítulos a pantalla completa", "capítulos completos", "llamado magnético", "secuencia por fotogramas",
    "secuencia de cuadros", "galería tridimensional", "video de fondo",
    "tarjetas arrastrables", "carrusel con perspectiva", "vista previa de enlace", "video revelado",
    "galería acordeón", "relato dividido", "galería fija", "historia fija", "texto en paralaje",
  ]);
  const renderedCopyKey = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const catalogTitleKey = renderedCopyKey(siteSection("catalog")?.title || store.catalogTitle?.trim() || "");
  const catalogBodyKey = renderedCopyKey(siteSection("catalog")?.body || store.catalogSubtitle?.trim() || "");
  const motionSectionHtmlByKey = Object.fromEntries(animationInstances.map((animation) => {
    const rawDescription = animation.subtitle?.trim() || "";
    const publicDescription = generatedAnimationDescriptions.has(rawDescription)
      || technicalAnimationTerms.some((term) => rawDescription.toLowerCase().includes(term))
      || (!!catalogBodyKey && renderedCopyKey(rawDescription) === catalogBodyKey)
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
        title: image.title?.trim() || "",
        caption: image.caption?.trim() || "",
        body: image.body?.trim() || "",
        textPositionX: image.textPositionX,
        textPositionY: image.textPositionY,
        textScale: image.textScale,
        textWidthPercent: image.textWidthPercent,
        textAlign: image.textAlign,
	        textColor: image.textColor,
	        fontStyle: image.fontStyle,
        productId: image.productId,
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
          textPositionX: undefined,
          textPositionY: undefined,
          textScale: undefined,
          textWidthPercent: undefined,
          textAlign: undefined,
          textColor: undefined,
          fontStyle: undefined,
          productId: selectedProduct.id,
        }
      : null;
    const mediaLimit = animation.type === "clarity-marquee"
      ? 0
      : ["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(animation.type) ? 1 : 8;
    const fallbackProductMotionImage = !["video-background", "video-pin-reveal"].includes(animation.type) && configuredMotionImages.length === 0 ? productMotionImage : null;
    const motionImages = [
      ...(fallbackProductMotionImage ? [fallbackProductMotionImage] : []),
      ...configuredMotionImages,
    ].slice(0, mediaLimit);
    const motionStories = motionImages.map((image) => ({ ...image, isVideo: isVideoMediaUrl(image.mediaUrl) }));
    const motionMediaLabel = (image: (typeof motionImages)[number], index: number) => image.title || image.caption || `Imagen ${index + 1}`;
    const motionAutoplay = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : " autoplay";
    const motionProductFor = (image: (typeof motionImages)[number]) => image.productId
      ? store.items.find((item) => item.id === image.productId)
      : undefined;
    const motionMediaHtml = (image: (typeof motionImages)[number], index: number, { controls = false, decorative = false, allowProductLink = true } = {}) => {
      const media = isVideoMediaUrl(image.mediaUrl)
        ? `<video class="store-motion-video" src="${escapeHtml(image.mediaUrl)}"${decorative ? " aria-hidden=\"true\"" : ` aria-label="${escapeHtml(motionMediaLabel(image, index))}"`} muted loop playsinline preload="metadata"${motionAutoplay}${controls ? " controls" : ""}></video>`
        : fidelityImageHtml(image.mediaUrl, image.sourceUrl, decorative ? "" : image.caption);
      const product = !isVideoMediaUrl(image.mediaUrl) && !decorative && allowProductLink ? motionProductFor(image) : undefined;
      if (!product || storeEditorMode) return media;
      return `<a class="store-animation-media-product-link product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" aria-label="Ver ${escapeHtml(product.name)}">${media}<span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`;
    };
    const motionProductActionHtml = (image: (typeof motionImages)[number]) => {
      const product = motionProductFor(image);
      return product && !storeEditorMode
        ? `<a class="store-animation-scene-cta product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</a>`
        : "";
    };
    const motionHeadingHtml = (value: string, attributes = "") => value ? `<h3 data-animation-copy-field="title"${attributes}>${escapeHtml(value)}</h3>` : "";
    const motionParagraphHtml = (value: string, attributes = "") => value ? `<p data-animation-copy-field="body"${attributes}>${escapeHtml(value)}</p>` : "";
    const motionCaptionHtml = (value: string) => value ? `<span data-animation-copy-field="caption">${escapeHtml(value)}</span>` : "";
    const motionSceneDataAttributes = (image: (typeof motionImages)[number], index: number) => {
      const hasLayout = Number.isInteger(image.textPositionX)
        || Number.isInteger(image.textPositionY)
        || Number.isInteger(image.textScale)
        || Number.isInteger(image.textWidthPercent)
        || !!image.textAlign
        || !!image.textColor;
      const sceneScale = Number.isInteger(image.textScale) ? image.textScale! : 100;
      return ` data-animation-media-index="${index}"${hasLayout ? " data-animation-copy-custom-layout" : ""}`
        + ` data-animation-text-x="${Number.isInteger(image.textPositionX) ? image.textPositionX : 18}"`
        + ` data-animation-text-y="${Number.isInteger(image.textPositionY) ? image.textPositionY : 76}"`
        + ` data-animation-text-scale="${sceneScale}"`
        + ` data-animation-text-width-percent="${Number.isInteger(image.textWidthPercent) ? image.textWidthPercent : 62}"`
        + ` data-animation-text-align="${image.textAlign || "left"}"`
	        + `${image.textColor ? ` data-animation-text-color="${image.textColor}"` : ""}`
	        + `${image.fontStyle ? ` data-animation-font-style="${image.fontStyle}"` : ""}`;
    };
    const motionCopyAttributes = (image: (typeof motionImages)[number], index: number) => `data-animation-copy${motionSceneDataAttributes(image, index)}`;
    const motionFigureCaptionHtml = (image: (typeof motionImages)[number], index: number) => {
      const hasCopy = !!(image.title || image.caption || image.body);
      return `<figcaption ${motionCopyAttributes(image, index)}${hasCopy ? "" : " hidden"}><strong data-animation-copy-field="title"${image.title ? "" : " hidden"}>${escapeHtml(image.title)}</strong><span data-animation-copy-field="caption"${image.caption ? "" : " hidden"}>${escapeHtml(image.caption)}</span><p data-animation-copy-field="body"${image.body ? "" : " hidden"}>${escapeHtml(image.body)}</p></figcaption>`;
    };
    const hasCustomTextLayout = Number.isInteger(animation.textPositionX)
      || Number.isInteger(animation.textPositionY)
      || Number.isInteger(animation.textScale)
      || Number.isInteger(animation.textWidthPercent)
      || !!animation.textAlign
      || !!animation.textSize
      || !!animation.textWidth;
    const textPositionX = Number.isInteger(animation.textPositionX) ? animation.textPositionX! : 18;
    const textPositionY = Number.isInteger(animation.textPositionY) ? animation.textPositionY! : 76;
    const textAlign = animation.textAlign || "left";
    const textSize = animation.textSize || "medium";
    const textWidth = animation.textWidth || "medium";
    const textScale = Number.isInteger(animation.textScale)
      ? animation.textScale!
      : ({ small: 80, medium: 100, large: 135 } as const)[textSize];
    const textWidthPercent = Number.isInteger(animation.textWidthPercent)
      ? animation.textWidthPercent!
      : ({ narrow: 42, medium: 62, wide: 86 } as const)[textWidth];
    const scale = textScale / 100;
	    const animationStyle = [
      `--animation-text-x:${textPositionX}%`,
      `--animation-text-y:${textPositionY}%`,
      `--animation-copy-width:${textWidthPercent}%`,
      `--animation-heading-size:clamp(${Math.round(40 * scale)}px,${(6.5 * scale).toFixed(2)}vw,${Math.round(88 * scale)}px)`,
      `--animation-card-copy-size:clamp(${Math.round(20 * scale)}px,${(2.6 * scale).toFixed(2)}vw,${Math.round(26 * scale)}px)`,
      `--animation-body-size:clamp(${Math.round(15 * scale)}px,${(1.7 * scale).toFixed(2)}vw,${Math.round(20 * scale)}px)`,
      ...(animation.textColor ? [`--animation-text-color:${animation.textColor}`] : []),
	      ...(animation.backgroundColor ? [`--animation-background:${animation.backgroundColor}`] : []),
	    ].join(";");
	    const animationAttributes = `${hasCustomTextLayout ? " data-animation-custom-layout" : ""} data-animation-text-x="${textPositionX}" data-animation-text-y="${textPositionY}" data-animation-text-align="${textAlign}" data-animation-text-size="${textSize}" data-animation-text-width="${textWidth}" data-animation-text-scale="${textScale}" data-animation-text-width-percent="${textWidthPercent}" data-animation-text-color="${animation.textColor || "#171717"}" data-animation-background="${animation.backgroundColor || "#ffffff"}"${animation.fontStyle ? ` data-animation-font-style="${animation.fontStyle}"` : ""}${animation.textColor ? " data-animation-has-text-color" : ""}${animation.backgroundColor ? " data-animation-has-background" : ""} style="${animationStyle}"`;
	    const sectionKey = `animation-${animation.id}`;
	    const extraTextHtml = (animation.textBlocks ?? []).map((block) => {
	      const blockScale = Number.isInteger(block.textScale) ? block.textScale! : block.role === "title" ? 100 : 82;
	      const blockX = Number.isInteger(block.textPositionX) ? block.textPositionX! : 18;
	      const blockY = Number.isInteger(block.textPositionY) ? block.textPositionY! : block.role === "title" ? 30 : 48;
	      const blockWidth = Number.isInteger(block.textWidthPercent) ? block.textWidthPercent! : 62;
	      const blockAlign = block.textAlign || "left";
	      const blockColor = block.textColor || animation.textColor || "#ffffff";
	      const tag = block.role === "title" ? "h3" : "p";
	      const blockRatio = blockScale / 100;
	      return `<div class="store-animation-free-text" data-animation-copy data-animation-copy-custom-layout data-animation-text-block="${escapeHtml(block.id)}" data-animation-text-x="${blockX}" data-animation-text-y="${blockY}" data-animation-text-scale="${blockScale}" data-animation-text-width-percent="${blockWidth}" data-animation-text-align="${blockAlign}" data-animation-text-color="${blockColor}"${block.fontStyle ? ` data-animation-font-style="${block.fontStyle}"` : ""} style="--animation-text-x:${blockX}%;--animation-text-y:${blockY}%;--animation-copy-width:${blockWidth}%;--animation-copy-align:${blockAlign};--animation-copy-translate:${blockAlign === "right" ? "-100%" : blockAlign === "center" ? "-50%" : "0"} -50%;--animation-scene-text-color:${blockColor};--animation-heading-size:clamp(${Math.round(40 * blockRatio)}px,${(6.5 * blockRatio).toFixed(2)}vw,${Math.round(88 * blockRatio)}px);--animation-body-size:clamp(${Math.round(15 * blockRatio)}px,${(1.7 * blockRatio).toFixed(2)}vw,${Math.round(20 * blockRatio)}px)"><${tag} data-animation-copy-field="textBlock">${escapeHtml(block.text)}</${tag}></div>`;
	    }).join("");
    const hasMotionImages = (minimum: number) => motionImages.length >= minimum;
    const hasMotionStories = (minimum: number) => motionStories.length >= minimum;
    const textAnimationTypes = ["clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"];
    const isTextAnimation = animation.type !== "clarity-marquee" && textAnimationTypes.includes(animation.type);
    const textPhrases = [...new Set([
      animation.title?.includes("|") ? null : animation.title,
      ...(animation.title?.split("|") ?? []),
      animation.subtitle,
      selectedProduct?.name,
      ...(selectedProduct?.tags ?? []),
      ...store.items.slice(0, 6).map((item) => item.name),
      store.storeName,
    ].map((phrase) => phrase?.trim()).filter((phrase): phrase is string => !!phrase))].slice(0, 8);
    const primaryText = animation.title?.split("|")[0]?.trim() || textPhrases[0] || store.storeName;
    const secondaryText = animation.subtitle?.trim() || textPhrases[1] || store.storeName;
    let blockHtml = "";
    if (animation.type === "video-background") {
      const scene = motionStories[0];
      if (scene?.isVideo) {
        const overlayTitle = animation.title?.trim() || scene.title;
        const overlayBody = animation.subtitle?.trim() || scene.body || scene.caption;
        const overlay = overlayTitle || overlayBody
          ? `<div class="store-video-background-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(overlayTitle)}${motionParagraphHtml(overlayBody)}</div>`
          : "";
        blockHtml = `<div class="store-video-background" aria-label="${escapeHtml(accessibleLabel)}"><video class="store-motion-video" src="${escapeHtml(scene.mediaUrl)}" aria-label="${escapeHtml(motionMediaLabel(scene, 0))}" muted loop playsinline preload="metadata"${motionAutoplay}></video><span class="store-video-background-shade" aria-hidden="true"></span>${overlay}</div>`;
      } else if (storeEditorMode) {
        blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status"><span class="store-animation-incomplete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v14H4zM10 9l5 3-5 3z"/></svg></span><div><strong>Agrega un video</strong><p>Sube un archivo MP4 o WebM para usarlo como fondo.</p><small>Se reproducirá sin sonido, en bucle y respetará la preferencia de movimiento reducido.</small></div></div>`;
      }
    } else if (animation.type === "video-pin-reveal") {
      const scene = motionStories[0];
      if (scene?.isVideo) {
        const copy = scene.title || scene.body || animation.title || animation.subtitle
          ? `<div class="store-video-pin-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(animation.title?.trim() || scene.title)}${motionParagraphHtml(animation.subtitle?.trim() || scene.body || scene.caption)}</div>`
          : "";
        blockHtml = `<div class="store-video-pin" data-video-pin-reveal style="--video-pin-progress:0" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-video-pin-sticky"><div class="store-video-pin-media">${motionMediaHtml(scene, 0)}</div>${copy}</div></div>`;
      } else if (storeEditorMode) {
        blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status"><div><strong>Agrega un video</strong><p>Sube un MP4 o WebM para crear el revelado al desplazarse.</p></div></div>`;
      }
    } else if (animation.type === "draggable-cards" && hasMotionImages(2)) {
      blockHtml = `<div class="store-draggable-cards" data-draggable-cards aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => `<figure data-draggable-card="${index}" tabindex="0" style="--card-index:${index};--card-rotate:${((index % 5) - 2) * 2}deg">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div>`;
    } else if (animation.type === "perspective-carousel" && hasMotionImages(2)) {
      blockHtml = `<div class="store-perspective-carousel" data-perspective-carousel tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-perspective-stage">${motionImages.map((image, index) => `<figure data-perspective-slide="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div><div class="store-experience-controls"><button type="button" data-perspective-step="-1" aria-label="Ver escena anterior">${ICON_ARROW_LEFT}</button><span data-perspective-status aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-perspective-step="1" aria-label="Ver escena siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
    } else if (animation.type === "link-preview" && motionImages.length >= 1) {
      const scene = motionImages[0];
      const previewProduct = motionProductFor(scene) || selectedProduct;
      const previewHref = previewProduct ? productPageUrl(slug, previewProduct.id) : "#store-grid";
      blockHtml = `<div class="store-link-preview" data-link-preview><div class="store-link-preview-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(scene.title || animation.title || store.storeName)}${motionParagraphHtml(scene.body || scene.caption || animation.subtitle || "Descubre la colección.")}<a href="${escapeHtml(previewHref)}" data-link-preview-trigger aria-describedby="store-link-preview-${escapeHtml(animation.id)}">Explorar ${ICON_ARROW_RIGHT}</a></div><figure id="store-link-preview-${escapeHtml(animation.id)}" role="tooltip">${motionMediaHtml(scene, 0)}</figure></div>`;
    } else if (animation.type === "gallery-accordion" && hasMotionImages(3)) {
      blockHtml = `<div class="store-gallery-accordion" data-gallery-accordion aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => {
        const product = motionProductFor(image);
        const action = product && !storeEditorMode
          ? `<a class="store-gallery-accordion-action product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" aria-label="Ver ${escapeHtml(product.name)}"><span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`
          : `<button type="button" aria-label="Ampliar ${escapeHtml(motionMediaLabel(image, index))}" data-gallery-accordion-open="${index}"></button>`;
        return `<figure data-gallery-accordion-item="${index}" class="${index === 0 ? "active" : ""}">${motionMediaHtml(image, index, { allowProductLink: false })}${action}${motionFigureCaptionHtml(image, index)}</figure>`;
      }).join("")}<div class="store-gallery-modal" data-gallery-modal hidden role="dialog" aria-modal="true" aria-label="Imagen ampliada"><button type="button" data-gallery-modal-close aria-label="Cerrar imagen">×</button><div data-gallery-modal-content></div></div></div>`;
    } else if (animation.type === "split-scroll" && hasMotionStories(3)) {
      blockHtml = `<div class="store-split-scroll" data-split-scroll aria-label="${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<article data-split-scroll-item="${index}"><figure>${motionMediaHtml(scene, index)}</figure><div ${motionCopyAttributes(scene, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body || scene.caption)}</div></article>`).join("")}</div>`;
    } else if (animation.type === "sticky-gallery" && hasMotionImages(3)) {
      blockHtml = `<div class="store-sticky-gallery" data-sticky-gallery aria-label="${escapeHtml(accessibleLabel)}">${motionImages.map((image, index) => `<figure style="--sticky-gallery-index:${index}">${motionMediaHtml(image, index)}${motionFigureCaptionHtml(image, index)}</figure>`).join("")}</div>`;
    } else if (animation.type === "sticky-story" && hasMotionStories(2)) {
      blockHtml = `<div class="store-sticky-story" data-sticky-story aria-label="${escapeHtml(accessibleLabel)}"><div class="store-sticky-story-media">${motionStories.map((scene, index) => `<figure data-sticky-story-media="${index}" class="${index === 0 ? "active" : ""}">${motionMediaHtml(scene, index)}</figure>`).join("")}</div><div class="store-sticky-story-copy">${motionStories.map((scene, index) => `<article data-sticky-story-item="${index}" ${motionCopyAttributes(scene, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body || scene.caption)}</article>`).join("")}</div></div>`;
    } else if (animation.type === "text-parallax" && hasMotionStories(2)) {
      blockHtml = `<div class="store-text-parallax" data-text-parallax aria-label="${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<article data-text-parallax-item="${index}" style="--text-parallax-progress:0"><div class="store-text-parallax-sticky"><figure>${motionMediaHtml(scene, index)}</figure><div ${motionCopyAttributes(scene, index)}>${motionCaptionHtml(scene.caption)}${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div></div></article>`).join("")}</div>`;
    } else if (animation.type === "story-scroll" && hasMotionStories(2)) {
      blockHtml = `<div class="store-flow-art" data-motion-flow aria-label="Story Scroll">${motionStories.map((entry, index) => `<article class="store-flow-section" style="--flow-index:${index}"><div class="store-flow-inner"><div class="store-flow-copy" ${motionCopyAttributes(entry, index)}><span>${String(index + 1).padStart(2, "0")}</span>${motionHeadingHtml(entry.title)}${motionParagraphHtml(entry.body)}</div><figure>${motionMediaHtml(entry, index, { controls: entry.isVideo })}</figure></div></article>`).join("")}</div>`;
    } else if (animation.type === "hero-carousel" && hasMotionImages(2)) {
      const heroSceneControls = motionImages.map((image, index) => {
        const product = motionProductFor(image);
        const attributes = `data-motion-hero-to="${index}" data-motion-title="${escapeHtml(image.title)}" data-motion-caption="${escapeHtml(image.caption)}"${motionSceneDataAttributes(image, index)} aria-current="${index === 0}"`;
        const media = motionMediaHtml(image, index, { allowProductLink: false });
        return product && !storeEditorMode
          ? `<a class="store-motion-scene-product-link product-page-link" href="${escapeHtml(productPageUrl(slug, product.id))}" ${attributes} aria-label="Ver ${escapeHtml(product.name)}">${media}<span class="store-animation-media-product-cue">Ver ${escapeHtml(product.name)} ${ICON_ARROW_RIGHT}</span></a>`
          : `<button type="button" ${attributes} aria-label="Ver ${escapeHtml(motionMediaLabel(image, index))}">${media}</button>`;
      }).join("");
      blockHtml = `<div class="store-motion-hero" data-motion-hero role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}" tabindex="0"><div class="store-motion-hero-backgrounds" aria-hidden="true">${motionImages.map((image, index) => isVideoMediaUrl(image.mediaUrl) ? `<video class="store-motion-video ${index === 0 ? "active" : ""}" src="${escapeHtml(image.mediaUrl)}" data-motion-hero-background="${index}" muted loop playsinline preload="metadata"${motionAutoplay}></video>` : `<img src="${escapeHtml(image.mediaUrl)}" alt="" data-motion-hero-background="${index}" class="${index === 0 ? "active" : ""}">`).join("")}</div><div class="store-motion-hero-copy" ${motionCopyAttributes(motionImages[0], 0)}><h3 data-animation-copy-field="title" data-motion-hero-title ${motionImages[0].title ? "" : "hidden"}>${escapeHtml(motionImages[0].title)}</h3><p data-animation-copy-field="caption" data-motion-hero-caption ${motionImages[0].caption ? "" : "hidden"}>${escapeHtml(motionImages[0].caption)}</p></div><div class="store-motion-filmstrip">${heroSceneControls}</div><div class="store-motion-hero-rail"><span data-motion-hero-status>01</span><span>${String(motionImages.length).padStart(2, "0")}</span></div></div>`;
    } else if (animation.type === "image-stream" && hasMotionImages(2)) {
      const streamColumns = Math.min(4, motionImages.length);
      blockHtml = `<div class="store-image-stream" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-image-stream-grid" data-image-count="${motionImages.length}" style="--image-stream-columns:${streamColumns}">${motionImages.map((image, index) => `<figure>${motionMediaHtml(image, index)}</figure>`).join("")}</div></div>`;
    } else if (animation.type === "scroll-expansion" && hasMotionImages(2)) {
      const image = motionImages[0];
      const background = motionImages[1] ?? image;
      const copy = image.title || image.body ? `<div class="store-scroll-expansion-copy" ${motionCopyAttributes(image, 0)}>${motionHeadingHtml(image.title)}${motionParagraphHtml(image.body)}</div>` : "";
      blockHtml = `<div class="store-scroll-expansion" data-scroll-expansion style="--expansion-progress:0" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-scroll-expansion-sticky"><div class="store-scroll-expansion-background" aria-hidden="true">${motionMediaHtml(background, 1, { decorative: true })}</div><figure>${motionMediaHtml(image, 0)}</figure>${copy}</div></div>`;
    } else if (animation.type === "hero-gallery-scroll" && hasMotionImages(3)) {
      blockHtml = `<div class="store-gallery-scroll" data-gallery-scroll aria-label="${escapeHtml(accessibleLabel)}"><div class="store-gallery-scroll-sticky"><div class="store-gallery-scroll-grid">${motionImages.slice(0, 5).map((image, index) => `<figure data-gallery-scroll-cell="${index}">${motionMediaHtml(image, index)}</figure>`).join("")}</div></div></div>`;
    } else if (animation.type === "stagger-testimonials" && hasMotionImages(2)) {
      blockHtml = `<div class="store-testimonials" data-testimonials tabindex="0" role="region" aria-roledescription="carousel" aria-label="${escapeHtml(accessibleLabel)}"><div class="store-testimonials-stage">${motionImages.map((image, index) => `<article class="store-testimonial-card" data-testimonial-index="${index}" style="--testimonial-offset:${index}" aria-hidden="${index !== 0}">${motionMediaHtml(image, index)}<div class="store-testimonial-copy" ${motionCopyAttributes(image, index)}>${image.body ? `<blockquote data-animation-copy-field="body">“${escapeHtml(image.body)}”</blockquote>` : ""}${image.caption ? `<p data-animation-copy-field="caption">— ${escapeHtml(image.caption)}</p>` : ""}</div></article>`).join("")}</div><div class="store-experience-controls"><button type="button" data-testimonial-step="-1" aria-label="Ver reseña anterior">${ICON_ARROW_LEFT}</button><span class="store-testimonial-status" aria-live="polite">1 / ${motionImages.length}</span><button type="button" data-testimonial-step="1" aria-label="Ver reseña siguiente">${ICON_ARROW_RIGHT}</button></div></div>`;
    } else if (animation.type === "portfolio-scroller" && hasMotionStories(2)) {
      blockHtml = `<div class="store-portfolio" data-portfolio-scroller tabindex="0" role="region" aria-label="${escapeHtml(accessibleLabel)}"><nav aria-label="Escenas de ${escapeHtml(accessibleLabel)}">${motionStories.map((scene, index) => `<button type="button" data-portfolio-to="${index}" aria-label="Ver ${escapeHtml(motionMediaLabel(scene, index))}" aria-current="${index === 0}"><span>${String(index + 1).padStart(2, "0")}</span>${scene.title ? `<strong>${escapeHtml(scene.title)}</strong>` : ""}</button>`).join("")}</nav><div class="store-portfolio-stage">${motionStories.map((scene, index) => `<article data-portfolio-panel="${index}" class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><div class="store-portfolio-media">${motionMediaHtml(scene, index)}</div>${scene.title || scene.body ? `<div class="store-portfolio-copy" ${motionCopyAttributes(scene, index)}>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : ""}</article>`).join("")}</div></div>`;
    } else if (animation.type === "circle-reveal" && motionStories.length >= 1) {
      const scene = motionStories[0];
      const copy = scene.title || scene.body ? `<div class="store-circle-reveal-copy" ${motionCopyAttributes(scene, 0)}>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : "";
      blockHtml = `<div class="store-circle-reveal" data-circle-reveal aria-label="${escapeHtml(accessibleLabel)}"><div class="store-circle-reveal-sticky"><div class="store-circle-reveal-media">${motionMediaHtml(scene, 0)}</div>${copy}</div></div>`;
    } else if (animation.type === "clarity-marquee") {
      const authoredPhrases = (animation.title?.split("|") ?? [])
        .map((phrase) => phrase.trim())
        .filter((phrase) => {
          const normalized = phrase.toLocaleLowerCase();
          return !!phrase && normalized !== accessibleLabel.toLocaleLowerCase() && !technicalAnimationTitles.has(normalized);
        });
      const phrases = [...new Set([
        ...authoredPhrases,
        animation.subtitle?.trim(),
        selectedProduct?.name,
        ...(selectedProduct?.tags ?? []),
        ...store.items.map((item) => item.name),
        store.storeName,
      ].map((phrase) => phrase?.trim()).filter((phrase): phrase is string => !!phrase))].slice(0, 8);
      const phraseHtml = phrases.map((phrase, index) => `<span data-animation-copy-field="${index === 0 ? "title" : "body"}"><b>${String(index + 1).padStart(2, "0")}</b>${escapeHtml(phrase)}</span>`).join("");
      blockHtml = `<div class="store-clarity-marquee" data-clarity-marquee data-animation-copy aria-label="${escapeHtml(accessibleLabel)}"><div class="store-clarity-rail"><div>${phraseHtml}</div><div aria-hidden="true">${phraseHtml}</div></div></div>`;
    } else if (animation.type === "layered-text") {
      const authoredLayeredPhrases = (animation.title?.split("|") ?? []).map((phrase) => phrase.trim()).filter(Boolean);
      const layeredPhrases = [...new Set([
        ...(authoredLayeredPhrases.length > 1 ? authoredLayeredPhrases : [primaryText]),
        secondaryText,
      ])].slice(0, 5);
      const layeredLines = Array.from({ length: Math.min(7, Math.max(4, layeredPhrases.length + 1)) }, (_, index) => {
        const top = index === 0 ? "\u00a0" : layeredPhrases[(index - 1) % layeredPhrases.length];
        const bottom = index === Math.min(7, Math.max(4, layeredPhrases.length + 1)) - 1 ? "\u00a0" : layeredPhrases[index % layeredPhrases.length];
        return `<li style="--layer-index:${index}"><span data-animation-copy-field="title">${escapeHtml(top)}</span><span data-animation-copy-field="body">${escapeHtml(bottom)}</span></li>`;
      }).join("");
      blockHtml = `<div class="store-layered-text" data-layered-text data-animation-copy tabindex="0" aria-label="${escapeHtml(accessibleLabel)}"><ul>${layeredLines}</ul></div>`;
    } else if (animation.type === "text-rotate") {
      const authoredRotatingValues = (animation.title?.split("|") ?? []).map((phrase) => phrase.trim()).filter(Boolean);
      const typewriterPrefix = animation.subtitle?.trim() || "Descubre";
      const normalizedPrefix = typewriterPrefix.toLocaleLowerCase();
      const rotatingValues = [...new Set([
        ...(authoredRotatingValues.length > 1 ? authoredRotatingValues : [primaryText]),
        ...textPhrases.filter((phrase) => phrase !== animation.subtitle?.trim()),
        ...store.items.map((item) => item.name.trim()).filter(Boolean),
      ])].filter((phrase) => phrase.toLocaleLowerCase() !== normalizedPrefix).slice(0, 8);
      blockHtml = `<div class="store-text-rotate" data-text-rotate data-text-rotate-values="${escapeHtml(rotatingValues.join("\u001f"))}" aria-label="${escapeHtml(accessibleLabel)}"><p data-animation-copy><span class="store-text-rotate-prefix" data-animation-copy-field="body">${escapeHtml(typewriterPrefix)}</span><span class="store-text-rotate-window"><span data-text-rotate-current data-animation-copy-field="title">${escapeHtml(rotatingValues[0] || "")}</span><span class="store-text-typewriter-cursor" aria-hidden="true">_</span></span></p></div>`;
    } else if (animation.type === "text-glitch") {
      blockHtml = `<div class="store-text-glitch" data-text-glitch data-animation-copy tabindex="0" data-hover-text="${escapeHtml(secondaryText)}" aria-label="${escapeHtml(accessibleLabel)}"><span class="store-text-glitch-base" data-animation-copy-field="title">${escapeHtml(primaryText)}</span><span class="store-text-glitch-hover" data-text-glitch-hover data-animation-copy-field="body" aria-hidden="true">${escapeHtml(secondaryText)}</span></div>`;
    } else if (animation.type === "text-reveal-block") {
      blockHtml = `<div class="store-text-reveal" data-text-reveal data-animation-copy aria-label="${escapeHtml(accessibleLabel)}"><span class="store-text-reveal-line"><strong data-animation-copy-field="title">${escapeHtml(primaryText)}</strong></span><span class="store-text-reveal-line"><span data-animation-copy-field="body">${escapeHtml(secondaryText)}</span></span></div>`;
    } else if (animation.type === "text-along-path") {
      const pathId = `store-text-path-${animation.id.replace(/[^a-z0-9_-]/gi, "")}`;
      const pathText = `${primaryText} · ${secondaryText} · ${primaryText} · ${secondaryText} · `;
      blockHtml = `<div class="store-text-path" data-text-along-path data-animation-copy data-animation-style-target aria-label="${escapeHtml(accessibleLabel)}"><svg viewBox="0 0 1000 360" role="img" aria-labelledby="${pathId}-title" preserveAspectRatio="xMidYMid meet"><title id="${pathId}-title">${escapeHtml(primaryText)}</title><path id="${pathId}" d="M70 180 C180 20 360 20 500 180 S820 340 930 180" fill="none"/><text><textPath href="#${pathId}" startOffset="0%"><animate attributeName="startOffset" from="-100%" to="100%" dur="18s" repeatCount="indefinite"/>${escapeHtml(pathText)}</textPath></text></svg><span class="sr-only" data-animation-copy-field="title">${escapeHtml(primaryText)}</span><span class="sr-only" data-animation-copy-field="body">${escapeHtml(secondaryText)}</span></div>`;
    } else if (animation.type === "full-screen-chapters" && hasMotionStories(2)) {
      blockHtml = `<div class="store-full-chapters" data-full-chapters role="region" aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(220, motionStories.length * 90)}svh"><div class="store-full-chapters-sticky"><div class="store-full-chapter-backgrounds" aria-hidden="true">${motionStories.map((scene, index) => `<div data-full-chapter-bg="${index}" class="${index === 0 ? "active" : ""}">${scene.isVideo ? `<video src="${escapeHtml(scene.mediaUrl)}" muted loop playsinline preload="metadata"></video>` : fidelityImageHtml(scene.mediaUrl, scene.sourceUrl, "")}</div>`).join("")}</div><div class="store-full-chapter-copy">${motionStories.map((scene, index) => `<article data-full-chapter-copy="${index}" ${motionCopyAttributes(scene, index)} class="${index === 0 ? "active" : ""}" aria-hidden="${index !== 0}"><span>${String(index + 1).padStart(2, "0")} / ${String(motionStories.length).padStart(2, "0")}</span>${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}${motionProductActionHtml(scene)}</article>`).join("")}</div><div class="store-full-chapter-progress" aria-hidden="true"><span></span></div></div></div>`;
    } else if (animation.type === "magnetic-target" && motionImages.length >= 1) {
      const scene = motionImages[0];
      const magneticProduct = motionProductFor(scene) || selectedProduct;
      const magneticHref = magneticProduct ? productPageUrl(slug, magneticProduct.id) : "#store-grid";
      const magneticLabel = magneticProduct ? `Ver ${magneticProduct.name}` : "Explorar colección";
      const copy = scene.caption || scene.title || scene.body ? `<div class="store-magnetic-copy" ${motionCopyAttributes(scene, 0)}>${motionCaptionHtml(scene.caption)}${motionHeadingHtml(scene.title)}${motionParagraphHtml(scene.body)}</div>` : "";
      blockHtml = `<div class="store-magnetic" data-magnetic-target${isVideoMediaUrl(scene.mediaUrl) ? "" : ` style="--magnetic-image:url(&quot;${escapeHtml(scene.mediaUrl)}&quot;)"`}>${isVideoMediaUrl(scene.mediaUrl) ? motionMediaHtml(scene, 0, { decorative: true }) : ""}${copy}<a href="${escapeHtml(magneticHref)}" data-magnetic-link><span>${escapeHtml(magneticLabel)}</span>${ICON_ARROW_RIGHT}</a></div>`;
    } else if (animation.type === "frame-sequence" && hasMotionImages(2)) {
      blockHtml = `<div class="store-frame-sequence" data-frame-sequence aria-label="${escapeHtml(accessibleLabel)}" style="height:${Math.max(200, motionImages.length * 55)}svh"><div class="store-frame-sticky"><div class="store-frame-media">${motionImages.map((image, index) => `<div data-frame="${index}" data-frame-title-value="${escapeHtml(image.title)}" data-frame-body-value="${escapeHtml(image.body)}"${motionSceneDataAttributes(image, index)} class="${index === 0 ? "active" : ""}">${motionMediaHtml(image, index)}</div>`).join("")}</div><div class="store-frame-copy" ${motionCopyAttributes(motionImages[0], 0)}><span data-frame-status>01 / ${String(motionImages.length).padStart(2, "0")}</span><h3 data-animation-copy-field="title" data-frame-title ${motionImages[0].title ? "" : "hidden"}>${escapeHtml(motionImages[0].title)}</h3><p data-animation-copy-field="body" data-frame-body ${motionImages[0].body ? "" : "hidden"}>${escapeHtml(motionImages[0].body)}</p></div></div></div>`;
    }
    if (!blockHtml && storeEditorMode) {
      const requirement = storeAnimationMediaRequirement(animation.type);
      const missing = Math.max(0, requirement.min - motionImages.length);
      blockHtml = `<div class="store-animation-incomplete" data-animation-incomplete role="status">
        <span class="store-animation-incomplete-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9h.01"/></svg></span>
        <div><strong>Completa ${escapeHtml(accessibleLabel)}</strong><p>${missing ? `Agrega ${missing} ${missing === 1 ? "archivo" : "archivos"} para activar esta animación.` : "Agrega contenido para activar esta animación."}</p><small>Tócala para abrir sus opciones. Puedes usar imágenes, GIF, MP4 o WebM.</small></div>
      </div>`;
    }
    const productCardImageUrl = selectedProduct?.imageUrls?.[0] ? assetUrl(selectedProduct.imageUrls[0]) : null;
    const productActionHtml = selectedProduct
      ? `<a class="store-motion-product-link store-motion-product-card product-page-link" data-animation-product-card href="${escapeHtml(productPageUrl(slug, selectedProduct.id))}" aria-label="Ver ${escapeHtml(selectedProduct.name)}">
          <span class="store-motion-product-media">${productCardImageUrl
            ? `<img src="${escapeHtml(productCardImageUrl)}" alt="" style="object-position:${productImagePosition(selectedProduct, 0)}">`
            : `<span aria-hidden="true">${escapeHtml(initials(selectedProduct.name))}</span>`}</span>
          <span class="store-motion-product-copy">
            <small>Producto en esta animación</small>
            <strong>${escapeHtml(selectedProduct.name)}</strong>
            ${selectedProduct.description ? `<span class="store-motion-product-description">${escapeHtml(selectedProduct.description)}</span>` : ""}
            ${salePriceHtml(selectedProduct, discountedProductAmount(selectedProduct, selectedProduct.amount), selectedProduct.amount, "store-motion-product-price")}
          </span>
          <span class="store-motion-product-action"><span>Ver producto</span>${ICON_ARROW_RIGHT}</span>
        </a>`
      : "";
    const buttonLabel = animation.buttonLabel?.trim() || "";
    const buttonPositionX = Number.isInteger(animation.buttonPositionX) ? animation.buttonPositionX! : 18;
    const buttonPositionY = Number.isInteger(animation.buttonPositionY) ? animation.buttonPositionY! : 86;
    const buttonHref = selectedProduct ? productPageUrl(slug, selectedProduct.id) : "#store-products";
    const buttonActionHtml = buttonLabel
      ? `<a class="store-animation-cta" href="${escapeHtml(buttonHref)}" data-animation-button-layout-target data-animation-button-x="${buttonPositionX}" data-animation-button-y="${buttonPositionY}" style="--animation-button-x:${buttonPositionX}%;--animation-button-y:${buttonPositionY}%"><span class="store-animation-cta-label">${escapeHtml(buttonLabel)}</span>${ICON_ARROW_RIGHT}</a>`
      : "";
    const hasSceneCopy = !["image-stream", "hero-gallery-scroll", ...textAnimationTypes].includes(animation.type);
    const generalTitle = animation.title?.trim() || "";
    const normalizedGeneralTitle = generalTitle.toLocaleLowerCase();
    const publicTitle = normalizedGeneralTitle === accessibleLabel.toLocaleLowerCase()
      || technicalAnimationTitles.has(normalizedGeneralTitle)
      || technicalAnimationTerms.some((term) => normalizedGeneralTitle === term)
      || (!!catalogTitleKey && renderedCopyKey(generalTitle) === catalogTitleKey)
      ? ""
      : generalTitle;
    const descriptionHtml = !["video-background", "video-pin-reveal"].includes(animation.type) && !isTextAnimation && (publicTitle || publicDescription)
      ? `<div class="store-motion-description" data-animation-general-copy${hasSceneCopy ? "" : " data-animation-copy"}>${publicTitle ? `<h3>${escapeHtml(publicTitle)}</h3>` : ""}${publicDescription ? `<p>${escapeHtml(publicDescription)}</p>` : ""}</div>`
      : "";
    const html = blockHtml
	      ? `<section class="store-motion-section" data-animation-id="${escapeHtml(animation.id)}" data-motion-experience="${animation.type}"${blockHtml.includes("data-animation-incomplete") ? " data-animation-is-incomplete" : ""} aria-label="${escapeHtml(accessibleLabel)}"${animationAttributes}>${descriptionHtml}${blockHtml}${extraTextHtml}${buttonActionHtml}${productActionHtml}</section>`
      : "";
    return [sectionKey, html];
  }));
  const editorialGalleryHtml = hasGalleryExperience
    ? `<section class="store-editorial-gallery" data-experience-style="${experienceStyle}" aria-labelledby="store-gallery-title">
        <div class="store-section-heading">
          <h2 id="store-gallery-title">${escapeHtml(siteSection("gallery")?.title || store.galleryTitle?.trim() || "La marca en imágenes")}</h2>
          <p>${escapeHtml(siteSection("gallery")?.body || store.gallerySubtitle?.trim() || "Detalles, atmósferas y perspectivas que completan la historia.")}</p>
        </div>
        ${galleryExperienceHtml}
      </section>`
    : "";

  const linksHtml = safeLinks.length
    ? `<section class="store-footer" aria-labelledby="store-links-title">
        <h2 class="store-footer-label" id="store-links-title">${escapeHtml(siteSection("links")?.title || store.linksTitle?.trim() || "Síguenos")}</h2>
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
          <h2 id="store-contact-title">${escapeHtml(siteSection("contact")?.title || store.contactTitle?.trim() || "¿Tienes una pregunta?")}</h2>
          <p>${escapeHtml(siteSection("contact")?.body || store.contactSubtitle?.trim() || `Escríbele directamente al equipo de ${store.storeName}. La tienda recibirá tu pregunta desde pagosYa y podrá responder a tu correo.`)}</p>
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
    const inlineMapEditor = storeEditorMode ? `<form class="store-location-inline-editor" data-store-location-inline-editor data-location-id="${escapeHtml(location.id)}">
        <label for="store-location-map-${escapeHtml(location.id)}">Insertar mapa aquí</label>
        <textarea id="store-location-map-${escapeHtml(location.id)}" data-store-location-map-input rows="3" spellcheck="false" aria-describedby="store-location-map-help-${escapeHtml(location.id)} store-location-map-status-${escapeHtml(location.id)}" placeholder="Pega el código &lt;iframe&gt; de Google Maps o su URL de inserción">${escapeHtml(mapUrl || "")}</textarea>
        <p id="store-location-map-help-${escapeHtml(location.id)}" class="store-location-inline-help">Google Maps: Compartir → Insertar un mapa → Copiar HTML.</p>
        <div class="store-location-inline-actions">
          <button class="primary" type="submit">${mapUrl ? "Actualizar mapa" : "Insertar mapa"}</button>
          ${mapUrl ? `<button type="button" data-store-location-map-clear>Quitar mapa</button>` : ""}
          <button class="store-location-delete-control" type="button" data-store-location-delete data-location-id="${escapeHtml(location.id)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg><span>Eliminar ubicación</span></button>
        </div>
        <p id="store-location-map-status-${escapeHtml(location.id)}" class="store-location-inline-status" role="status" aria-live="polite"></p>
      </form>` : "";
    return `<article class="store-location-card${mapUrl ? " has-map" : ""}${storeEditorMode ? " has-editor" : ""}" tabindex="-1">
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
      ${mapUrl || storeEditorMode ? `<div class="store-location-map-column">${inlineMapEditor}<div class="store-location-map${mapUrl ? "" : " is-empty"}">${mapUrl ? `<iframe src="${escapeHtml(mapUrl)}" title="${escapeHtml(location.name)} de ${escapeHtml(store.storeName)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" allowfullscreen></iframe>` : `<p>El mapa aparecerá aquí.</p>`}</div></div>` : ""}
    </article>`;
  };
  const locationHtml = locations.length
    ? `<section class="store-location-section${locations.length > 1 ? " has-many" : ""}" id="store-location" aria-labelledby="store-location-title">
        <div class="store-location-heading">
          <div><h2 id="store-location-title">${escapeHtml(siteSection("location")?.title || store.locationTitle?.trim() || "Visítanos")}</h2><p>${escapeHtml(siteSection("location")?.body || store.locationSubtitle?.trim() || (locations.length === 1 ? "Encuentra esta tienda y elige cómo recibir tu pedido." : `${locations.length} ubicaciones para retirar o recibir tu pedido.`))}</p></div>
          ${locations.length > 1 ? `<button class="store-locations-toggle" type="button" aria-expanded="false" aria-controls="store-locations-list">Ver ubicaciones <span>${locations.length}</span></button>` : ""}
        </div>
        <div class="store-locations-list${locations.length === 1 ? " is-single" : ""}" id="store-locations-list" ${locations.length > 1 ? "hidden" : ""}>
          ${locations.map(locationCardHtml).join("")}
        </div>
      </section>`
    : "";

  const siteBlockAttribute = (block: NonNullable<StoreSiteDocument["sections"][number]["blocks"]>[number]) => ` data-site-block="${escapeHtml(block.id)}" data-site-slot="${escapeHtml(block.slot)}" data-site-block-kind="${block.kind}" data-site-block-role="${block.role}"`;
  const siteBlocks = (section: StoreSiteDocument["sections"][number]) => section.blocks ?? [];
  const siteBlockMedia = (section: StoreSiteDocument["sections"][number]) => siteBlocks(section).filter((block) => block.kind === "media" && block.mediaUrl);
  const bespokeMediaHtml = (section: StoreSiteDocument["sections"][number]) => {
    const blocks = siteBlockMedia(section);
    const sources = blocks.length ? blocks.map((block) => block.mediaUrl!).filter(Boolean) : section.mediaUrls;
    const media = sources.flatMap((source, index) => {
      const resolved = assetUrl(source);
      if (!resolved) return [];
      const label = section.title || `${visibleStoreName || "La tienda"}, imagen ${index + 1}`;
      const attribute = blocks[index] ? siteBlockAttribute(blocks[index]) : "";
      return [isVideoMediaUrl(resolved)
        ? `<video${attribute} src="${escapeHtml(resolved)}" aria-label="${escapeHtml(label)}" muted loop playsinline preload="metadata" ${index === 0 ? "autoplay" : ""}></video>`
        : `<div class="site-block-media"${attribute}>${fidelityImageHtml(resolved, source, label, { eager: section.kind === "hero" && index === 0 })}</div>`];
    }).join("");
    if (!media) return "";
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    const horizontallyScrollable = sources.length > 1 && (section.layout === "rail" || (section.kind === "gallery" && family === "cinematic"));
    const scrollRegion = horizontallyScrollable
      ? ` data-store-drag-scroll role="region" aria-label="${escapeHtml(section.title ? `Galería desplazable: ${section.title}` : "Galería desplazable")}" tabindex="0"`
      : "";
    return `<div class="bespoke-media" data-count="${sources.length}"${scrollRegion}>${media}</div>`;
  };
  const bespokeStoryFlowHtml = (section: StoreSiteDocument["sections"][number]) => {
    const chapterBlocks = siteBlocks(section).filter((block) => block.kind === "group" && block.slot === "chapters").slice(0, 3);
    const scenes = chapterBlocks.length >= 2 ? chapterBlocks.flatMap((block) => {
      const heading = block.children.find((child) => child.kind === "heading");
      const body = block.children.find((child) => child.kind === "text");
      const media = block.children.find((child) => child.kind === "media" && child.mediaUrl);
      const resolved = media?.mediaUrl ? assetUrl(media.mediaUrl) : null;
      return resolved ? [{
        source: media!.mediaUrl!, resolved, title: heading?.text || section.title, body: body?.text || section.body,
        titleStyle: heading?.style || section.titleStyle, bodyStyle: body?.style || section.bodyStyle,
        block, headingBlock: heading, bodyBlock: body, mediaBlock: media,
      }] : [];
    }) : section.mediaUrls.slice(0, 3).flatMap((source, index) => {
      const resolved = assetUrl(source);
      if (!resolved) return [];
      const item = section.items.find((candidate) => candidate.mediaUrl === source) ?? section.items[index];
      return [{
        source,
        resolved,
        title: item?.title || section.title,
        body: item?.body || section.body,
        titleStyle: item?.titleStyle || section.titleStyle,
        bodyStyle: item?.bodyStyle || section.bodyStyle,
        block: null,
        headingBlock: null,
        bodyBlock: null,
        mediaBlock: null,
      }];
    });
    if (scenes.length < 2) return "";
    return `<div class="store-flow-art bespoke-story-flow" data-motion-flow aria-label="${escapeHtml(section.title || "Historia de la marca")}">
      ${scenes.map((scene, index) => `<article class="store-flow-section" style="--flow-index:${index}"${scene.block ? siteBlockAttribute(scene.block) : ""}>
        <div class="store-flow-inner">
          <div class="store-flow-copy"><span>${String(index + 1).padStart(2, "0")}</span>${scene.title ? `<h3${scene.headingBlock ? siteBlockAttribute(scene.headingBlock) : ""}${canvasTextStyleAttributes(scene.titleStyle)}>${escapeHtml(scene.title)}</h3>` : ""}${scene.body ? `<p${scene.bodyBlock ? siteBlockAttribute(scene.bodyBlock) : ""}${canvasTextStyleAttributes(scene.bodyStyle)}>${escapeHtml(scene.body)}</p>` : ""}</div>
          <figure${scene.mediaBlock ? siteBlockAttribute(scene.mediaBlock) : ""}>${isVideoMediaUrl(scene.resolved)
            ? `<video src="${escapeHtml(scene.resolved)}" aria-label="${escapeHtml(scene.title || `Escena ${index + 1}`)}" muted loop playsinline preload="metadata" controls></video>`
            : fidelityImageHtml(scene.resolved, scene.source, scene.title || `Escena ${index + 1}`)}</figure>
        </div>
      </article>`).join("")}
    </div>`;
  };
  const bespokeFrame = (
    section: StoreSiteDocument["sections"][number],
    content: string,
    element: "section" | "div" = "section",
    modifier = "",
  ) => {
    if (!content) return "";
    const label = section.title ? ` aria-label="${escapeHtml(section.title)}"` : "";
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    const position = siteSectionsForPage.findIndex((candidate) => candidate.id === section.id);
    const opening = position === 0 ? " is-site-opening" : "";
    const desktopHeight = Number.isInteger(section.heightPx) ? section.heightPx! : null;
    const mobileHeight = Number.isInteger(section.mobileHeightPx) ? section.mobileHeightPx! : null;
    const positionedPrimaryCopy = Boolean(
      section.titleStyle?.textOffsetBasis === "section"
      || section.bodyStyle?.textOffsetBasis === "section"
      || siteBlocks(section).some((block) => ["heading", "body", "action"].includes(block.id) && block.style?.textOffsetBasis === "section"),
    );
    const sizingClass = positionedPrimaryCopy ? " has-section-positioned-copy" : "";
    const sizingAttributes = `${desktopHeight !== null ? ` data-site-height-desktop="${desktopHeight}"` : ""}${mobileHeight !== null ? ` data-site-height-mobile="${mobileHeight}"` : ""}`;
    const sizingStyle = `${desktopHeight !== null ? `;--site-section-height-desktop:${desktopHeight}px` : ""}${mobileHeight !== null ? `;--site-section-height-mobile:${mobileHeight}px` : ""}`;
    return `<${element} id="site-section-${escapeHtml(section.id)}" class="bespoke-zone bespoke-${section.kind}${opening}${sizingClass}${modifier ? ` ${modifier}` : ""}" data-site-section="${escapeHtml(section.id)}" data-site-kind="${section.kind}" data-site-position="${position}" data-site-family="${family}" data-site-layout="${section.layout}" data-site-width="${section.width}" data-site-align="${section.align}" data-site-motion="${section.motion}"${sizingAttributes} style="--zone-bg:${section.backgroundColor};--zone-ink:${section.textColor}${sizingStyle}"${label}>${content}</${element}>`;
  };
  const bespokeCopy = (section: StoreSiteDocument["sections"][number], showCta = false) => {
    const headingElement = section.kind === "hero" ? "h1" : "h2";
    const copyBlocks = siteBlocks(section).filter((block) => ["heading", "text", "action"].includes(block.kind));
    if (!copyBlocks.length) return `<div class="bespoke-copy">
      ${section.title ? `<${headingElement}${canvasTextStyleAttributes(section.titleStyle)}>${escapeHtml(section.title)}</${headingElement}>` : ""}
      ${section.body ? `<p${canvasTextStyleAttributes(section.bodyStyle)}>${escapeHtml(section.body)}</p>` : ""}
      ${showCta && section.ctaLabel ? `<button type="button" class="bespoke-cta hero-catalog-cta">${escapeHtml(section.ctaLabel)}${ICON_ARROW_RIGHT}</button>` : ""}
    </div>`;
    const renderCopyBlock = (block: (typeof copyBlocks)[number], free = false) => {
      const attributes = siteBlockAttribute(block);
      const freeClass = free ? " class=\"site-free-canvas-text\"" : "";
      if (block.kind === "heading") return block.text ? `<${headingElement}${freeClass}${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</${headingElement}>` : "";
      if (block.kind === "text") return block.text ? `<p${freeClass}${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</p>` : "";
      return block.text ? `<button type="button" class="bespoke-cta hero-catalog-cta${free ? " site-free-canvas-text" : ""}"${attributes}${free ? canvasTextStyleAttributes(block.style) : ""}>${escapeHtml(block.text)}${ICON_ARROW_RIGHT}</button>` : "";
    };
    const flowBlocks = copyBlocks.filter((block) => ["heading", "body", "action"].includes(block.id));
    const freeBlocks = copyBlocks.filter((block) => !["heading", "body", "action"].includes(block.id));
    return `<div class="bespoke-copy">${flowBlocks.map((block) => renderCopyBlock(block)).join("")}</div>${freeBlocks.length ? `<div class="bespoke-free-copy-layer">${freeBlocks.map((block) => renderCopyBlock(block, true)).join("")}</div>` : ""}`;
  };
  const bespokeAdditionalCopy = (section: StoreSiteDocument["sections"][number]) => {
    const additionalBlocks = siteBlocks(section).filter((block) =>
      ["heading", "text", "action"].includes(block.kind) && !["heading", "body", "action"].includes(block.id));
    if (!additionalBlocks.length) return "";
    return `<div class="bespoke-free-copy-layer bespoke-copy-additional">${additionalBlocks.map((block) => {
      const attributes = siteBlockAttribute(block);
      if (block.kind === "heading") return block.text ? `<h2 class="site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</h2>` : "";
      if (block.kind === "text") return block.text ? `<p class="site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}</p>` : "";
      return block.text ? `<button type="button" class="bespoke-cta hero-catalog-cta site-free-canvas-text"${attributes}${canvasTextStyleAttributes(block.style)}>${escapeHtml(block.text)}${ICON_ARROW_RIGHT}</button>` : "";
    }).join("")}</div>`;
  };
  const visualFamilyContent = (copy: string, media: string) => `${copy}${media}`;
  const trustedFamilyContent = (section: StoreSiteDocument["sections"][number], trusted: string) => {
    const additional = bespokeAdditionalCopy(section);
    const family = resolveSiteSectionFamily(section.kind, section.family, siteDocument!.designGenome);
    return family === "product-led" || family === "cinematic" ? `${trusted}${additional}` : `${additional}${trusted}`;
  };
  const renderBespokeSection = (section: StoreSiteDocument["sections"][number]): string => {
    if (section.kind === "hero") return carouselHtml && section.motion !== "none" && !(section.layout === "split" && section.motion === "clip" && section.mediaUrls.length >= 2)
      ? bespokeFrame(section, carouselHtml, "div", "has-site-carousel")
      : bespokeFrame(section, visualFamilyContent(bespokeCopy(section, true), bespokeMediaHtml(section)));
    if (section.kind === "story") {
      const storyFlow = section.motion === "story-scroll" ? bespokeStoryFlowHtml(section) : "";
      return storyFlow
        ? bespokeFrame(section, storyFlow, "section", "has-story-flow")
        : bespokeFrame(section, visualFamilyContent(bespokeCopy(section), bespokeMediaHtml(section)));
    }
    if (section.kind === "gallery") {
      const authoredGallery = bespokeMediaHtml(section);
      return bespokeFrame(section, visualFamilyContent(bespokeCopy(section), authoredGallery || editorialGalleryHtml));
    }
    if (section.kind === "catalog") return bespokeFrame(
      section,
      trustedFamilyContent(section, productsHtml + appointmentsHtml),
      "div",
      section.productIds ? "is-curated-products" : "",
    );
    if (section.kind === "contact") return bespokeFrame(section, trustedFamilyContent(section, contactHtml), "div");
    if (section.kind === "location") return bespokeFrame(section, trustedFamilyContent(section, locationHtml), "div");
    if (section.kind === "links") return bespokeFrame(section, trustedFamilyContent(section, linksHtml), "div");
    return "";
  };

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
  const signatureSectionKey = signatureAnimation && animationInstances.some((animation) => animation.id === signatureAnimation.id)
    ? `animation-${signatureAnimation.id}`
    : null;
  const bespokeSectionHtmlByKey = Object.fromEntries(siteSectionsForPage.map((section) => [`site-${section.id}`, renderBespokeSection(section)]));
  const authoredBespokeOrder = normalizeStorefrontSiteContentOrder(
    requestedContentOrder,
    siteSectionsForPage,
    animationSections,
    {
      signatureSectionKey,
      signaturePlacement: siteDocument?.experience.placement,
    },
  );
  const orderedSectionsHtml = selectedCatalogSection
    ? productsHtml
    : siteDocument
      ? authoredBespokeOrder.map((section) => bespokeSectionHtmlByKey[section] || motionSectionHtmlByKey[section] || "").join("")
      : contentOrder.map((section) => sectionHtml[section] || "").join("");
  app.innerHTML = `
    ${storefrontHeaderHtml(slug, store, { current: selectedCatalogSection ? "catalog" : activeSitePage ? "page" : "home", pageId: activeSitePage?.id, catalogUrl: selectedCatalogSection ? categoryPageUrl(slug, selectedCatalogSection.id) : storeCatalogUrl(slug) })}
    ${announcementHtml}
    ${orderedSectionsHtml}
    ${selectedCatalogSection ? "" : storefrontFooterHtml(store)}
    <div class="secure-note">${store.checkoutMode === "payment" ? ICON_LOCK : store.checkoutMode === "whatsapp" ? ICON_WHATSAPP : ICON_EXTERNAL}<span>${store.checkoutMode === "payment" ? "Pago procesado de forma segura por pagosYa" : store.checkoutMode === "whatsapp" ? "El pedido se enviará directamente a WhatsApp" : "Tu correo y selección se enviarán a la tienda"}</span></div>
    ${selectedCatalogSection ? "" : promotionHtml}
  `;
  applyStoreSectionBackgrounds(store);

  const dragScrollCleanups = Array.from(app.querySelectorAll<HTMLElement>("[data-store-drag-scroll]")).map(bindHorizontalDragScroll);
  if (dragScrollCleanups.length) {
    activeStoreExperienceCleanup = () => {
      dragScrollCleanups.forEach((cleanup) => cleanup());
    };
  }

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

  app.querySelector<HTMLFormElement>("#store-newsletter-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".store-newsletter-status")!;
    const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
    status.textContent = "";
    status.setAttribute("role", "status");
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    const originalLabel = submit.textContent || "Suscribirme";
    submit.textContent = "Guardando…";
    try {
      await subscribeStoreNewsletter(slug, email);
      form.reset();
      status.textContent = status.dataset.successMessage || "Listo. Ya estás en la lista.";
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = `No pudimos guardar tu correo: ${(error as Error).message}`;
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = originalLabel;
    }
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

  app.querySelectorAll<HTMLButtonElement>(".hero-catalog-cta").forEach((button) =>
    button.addEventListener("click", () => {
      const target = app.querySelector<HTMLElement>(".catalog-section-picker")
        ?? app.querySelector<HTMLElement>("#store-grid")
        ?? app.querySelector<HTMLElement>(".store-products");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );

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
      if (slides.length > 1 && !prefersReducedMotion && !autoplayPausedByUser && !storePreviewEditorEnabled) {
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
    showSlide(0);
    startAutoplay();
    activeHeroCleanup = () => {
      stopAutoplay();
      document.removeEventListener("visibilitychange", syncCarouselVisibility);
      slides.forEach((slide) => slide.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }

  const editorSceneIndexFor = (container: HTMLElement, count: number) => {
    if (!storePreviewEditorEnabled || !storePreviewEditorSelection?.animationId || !Number.isInteger(storePreviewEditorSelection.itemIndex)) return 0;
    const section = container.closest<HTMLElement>(".store-motion-section[data-animation-id]");
    if (section?.dataset.animationId !== storePreviewEditorSelection.animationId) return 0;
    return Math.min(Math.max(storePreviewEditorSelection.itemIndex!, 0), Math.max(count - 1, 0));
  };

  const selectEditorAnimationScene = (container: HTMLElement, itemIndex: number) => {
    if (!storePreviewEditorEnabled || !Number.isInteger(itemIndex)) return;
    const section = container.closest<HTMLElement>(".store-motion-section[data-animation-id]");
    const animationId = section?.dataset.animationId;
    if (!animationId) return;
    const selection: StorePreviewEditorSelection = {
      section: `animation-${animationId}`,
      field: "media",
      label: `imagen ${itemIndex + 1} de la animación`,
      animationId,
      itemIndex,
    };
    storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    postToParent("STORE_EDITOR_SELECT", { selection });
  };

  app.querySelectorAll<HTMLElement>("[data-motion-hero]").forEach((motionHero) => {
    const backgrounds = Array.from(motionHero.querySelectorAll<HTMLElement>("[data-motion-hero-background]"));
    const buttons = Array.from(motionHero.querySelectorAll<HTMLElement>("[data-motion-hero-to]"));
    const title = motionHero.querySelector<HTMLElement>("[data-motion-hero-title]");
    const caption = motionHero.querySelector<HTMLElement>("[data-motion-hero-caption]");
    const status = motionHero.querySelector<HTMLElement>("[data-motion-hero-status]");
    const animationCopy = motionHero.querySelector<HTMLElement>("[data-animation-copy]");
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(motionHero, buttons.length);
    const show = (next: number, focus = false) => {
      if (!buttons.length) return;
      selected = (next + buttons.length) % buttons.length;
      backgrounds.forEach((background, index) => {
        const active = index === selected;
        background.classList.toggle("active", active);
        if (background instanceof HTMLVideoElement) {
          if (active && !reduceMotion) playStoreVideo(background);
          else background.pause();
        }
      });
      buttons.forEach((button, index) => button.setAttribute("aria-current", String(index === selected)));
      if (title) {
        title.textContent = buttons[selected]?.dataset.motionTitle ?? "";
        title.hidden = !title.textContent;
      }
      if (caption) {
        caption.textContent = buttons[selected]?.dataset.motionCaption ?? "";
        caption.hidden = !caption.textContent;
      }
      if (animationCopy && buttons[selected]) applyAnimationCopySceneLayout(animationCopy, buttons[selected]);
      if (status) status.textContent = String(selected + 1).padStart(2, "0");
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => {
      show(index);
      selectEditorAnimationScene(motionHero, selected);
    }));
    motionHero.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1), true);
      selectEditorAnimationScene(motionHero, selected);
    });
    motionHero.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
  });

  app.querySelectorAll<HTMLElement>("[data-testimonials]").forEach((testimonials) => {
    const cards = Array.from(testimonials.querySelectorAll<HTMLElement>("[data-testimonial-index]"));
    const status = testimonials.querySelector<HTMLElement>(".store-testimonial-status");
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(testimonials, cards.length);
    const show = (next: number) => {
      if (!cards.length) return;
      selected = (next + cards.length) % cards.length;
      cards.forEach((card, index) => {
        let offset = index - selected;
        if (offset > cards.length / 2) offset -= cards.length;
        if (offset < -cards.length / 2) offset += cards.length;
        card.style.setProperty("--testimonial-offset", String(offset));
        card.style.zIndex = String(30 - Math.abs(offset));
        card.style.opacity = String(Math.max(.2, 1 - Math.abs(offset) * .16));
        card.setAttribute("aria-hidden", String(index !== selected));
        const video = card.querySelector<HTMLVideoElement>("video");
        if (video) {
          if (index === selected && !reduceMotion) playStoreVideo(video);
          else video.pause();
        }
      });
      if (status) status.textContent = `${selected + 1} / ${cards.length}`;
    };
    testimonials.querySelectorAll<HTMLButtonElement>("[data-testimonial-step]").forEach((button) =>
      button.addEventListener("click", () => {
        show(selected + Number(button.dataset.testimonialStep));
        selectEditorAnimationScene(testimonials, selected);
      }),
    );
    testimonials.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1));
      selectEditorAnimationScene(testimonials, selected);
    });
    testimonials.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
  });

  app.querySelectorAll<HTMLElement>("[data-portfolio-scroller]").forEach((portfolio) => {
    const buttons = Array.from(portfolio.querySelectorAll<HTMLButtonElement>("[data-portfolio-to]"));
    const panels = Array.from(portfolio.querySelectorAll<HTMLElement>("[data-portfolio-panel]"));
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(portfolio, panels.length);
    let visible = true;
    const syncVideos = () => panels.forEach((panel, index) => {
      const video = panel.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      if (index === selected && visible && !reduceMotion) playStoreVideo(video);
      else video.pause();
    });
    const show = (next: number, focus = false) => {
      if (!panels.length) return;
      selected = (next + panels.length) % panels.length;
      buttons.forEach((button, index) => {
        button.setAttribute("aria-current", String(index === selected));
        button.tabIndex = index === selected ? 0 : -1;
      });
      panels.forEach((panel, index) => {
        const active = index === selected;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
        panel.inert = !active;
      });
      syncVideos();
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => {
      show(index);
      selectEditorAnimationScene(portfolio, selected);
    }));
    portfolio.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      show(selected + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1), true);
      selectEditorAnimationScene(portfolio, selected);
    });
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncVideos(); }, { threshold: .2 })
      : null;
    observer?.observe(portfolio);
    portfolio.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
    const priorCleanup = activeStoreExperienceCleanup as (() => void) | null;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      observer?.disconnect();
      panels.forEach((panel) => panel.querySelector<HTMLVideoElement>("video")?.pause());
    };
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

  const libraryMotionCleanups: Array<() => void> = [];
  const reduceLibraryMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  app.querySelectorAll<HTMLElement>("[data-draggable-cards]").forEach((container) => {
    if (storePreviewEditorEnabled) return;
    container.querySelectorAll<HTMLElement>("[data-draggable-card]").forEach((card) => {
      let pointerId: number | null = null;
      let originX = 0;
      let originY = 0;
      let offsetX = 0;
      let offsetY = 0;
      const render = () => {
        card.style.setProperty("--card-x", `${offsetX}px`);
        card.style.setProperty("--card-y", `${offsetY}px`);
      };
      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        pointerId = event.pointerId;
        originX = event.clientX - offsetX;
        originY = event.clientY - offsetY;
        card.setPointerCapture(pointerId);
        card.classList.add("dragging");
      };
      const move = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        offsetX = Math.max(-container.clientWidth * .38, Math.min(container.clientWidth * .38, event.clientX - originX));
        offsetY = Math.max(-container.clientHeight * .38, Math.min(container.clientHeight * .38, event.clientY - originY));
        render();
      };
      const up = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        card.releasePointerCapture(pointerId);
        pointerId = null;
        card.classList.remove("dragging");
      };
      card.addEventListener("pointerdown", down);
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerup", up);
      card.addEventListener("pointercancel", up);
      libraryMotionCleanups.push(() => {
        card.removeEventListener("pointerdown", down);
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerup", up);
        card.removeEventListener("pointercancel", up);
      });
    });
  });

  app.querySelectorAll<HTMLElement>("[data-perspective-carousel]").forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>("[data-perspective-slide]"));
    const status = carousel.querySelector<HTMLElement>("[data-perspective-status]");
    let selected = editorSceneIndexFor(carousel, slides.length);
    const show = (next: number, focus = false) => {
      if (!slides.length) return;
      selected = (next + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === selected;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      if (status) status.textContent = `${selected + 1} / ${slides.length}`;
      if (focus) carousel.focus({ preventScroll: true });
    };
    const step = (event: Event) => {
      const button = event.currentTarget as HTMLElement;
      show(selected + Number(button.dataset.perspectiveStep), true);
      selectEditorAnimationScene(carousel, selected);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1), true);
      selectEditorAnimationScene(carousel, selected);
    };
    const buttons = Array.from(carousel.querySelectorAll<HTMLButtonElement>("[data-perspective-step]"));
    buttons.forEach((button) => button.addEventListener("click", step));
    carousel.addEventListener("keydown", keydown);
    carousel.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", ((event: CustomEvent<{ index?: number }>) => show(Number(event.detail?.index) || 0)) as EventListener);
    show(selected);
    libraryMotionCleanups.push(() => {
      buttons.forEach((button) => button.removeEventListener("click", step));
      carousel.removeEventListener("keydown", keydown);
    });
  });

  app.querySelectorAll<HTMLElement>("[data-gallery-accordion]").forEach((gallery) => {
    const figures = Array.from(gallery.querySelectorAll<HTMLElement>("[data-gallery-accordion-item]"));
    const modal = gallery.querySelector<HTMLElement>("[data-gallery-modal]");
    const content = gallery.querySelector<HTMLElement>("[data-gallery-modal-content]");
    const closeButton = gallery.querySelector<HTMLButtonElement>("[data-gallery-modal-close]");
    const close = () => {
      if (!modal) return;
      modal.hidden = true;
      content?.replaceChildren();
      document.body.classList.remove("store-gallery-modal-open");
    };
    const open = (event: Event) => {
      const button = event.currentTarget as HTMLElement;
      const index = Number(button.dataset.galleryAccordionOpen);
      figures.forEach((figure, figureIndex) => figure.classList.toggle("active", figureIndex === index));
      selectEditorAnimationScene(gallery, index);
      if (storePreviewEditorEnabled || !modal || !content || !Number.isInteger(index)) return;
      const source = figures[index];
      const media = source?.querySelector<HTMLElement>(".store-fidelity-media, video");
      const copy = source?.querySelector<HTMLElement>("figcaption");
      if (media) content.append(media.cloneNode(true));
      if (copy) content.append(copy.cloneNode(true));
      modal.hidden = false;
      document.body.classList.add("store-gallery-modal-open");
      closeButton?.focus({ preventScroll: true });
    };
    const backdrop = (event: MouseEvent) => { if (event.target === modal) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && modal && !modal.hidden) close(); };
    const buttons = Array.from(gallery.querySelectorAll<HTMLButtonElement>("[data-gallery-accordion-open]"));
    buttons.forEach((button) => button.addEventListener("click", open));
    closeButton?.addEventListener("click", close);
    modal?.addEventListener("click", backdrop);
    document.addEventListener("keydown", escape);
    libraryMotionCleanups.push(() => {
      buttons.forEach((button) => button.removeEventListener("click", open));
      closeButton?.removeEventListener("click", close);
      modal?.removeEventListener("click", backdrop);
      document.removeEventListener("keydown", escape);
      close();
    });
  });

  app.querySelectorAll<HTMLElement>("[data-sticky-story]").forEach((story) => {
    const items = Array.from(story.querySelectorAll<HTMLElement>("[data-sticky-story-item]"));
    const media = Array.from(story.querySelectorAll<HTMLElement>("[data-sticky-story-media]"));
    const show = (index: number) => media.forEach((figure, figureIndex) => figure.classList.toggle("active", figureIndex === index));
    const observer = typeof IntersectionObserver === "function" && !reduceLibraryMotion
      ? new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (entry.isIntersecting) show(Number((entry.target as HTMLElement).dataset.stickyStoryItem) || 0);
        }), { rootMargin: "-40% 0px -40%", threshold: 0 })
      : null;
    items.forEach((item) => observer?.observe(item));
    show(0);
    libraryMotionCleanups.push(() => observer?.disconnect());
  });

  const scrollDriven = Array.from(app.querySelectorAll<HTMLElement>("[data-video-pin-reveal], [data-text-parallax-item]"));
  if (scrollDriven.length && !reduceLibraryMotion) {
    let frame = 0;
    const update = () => {
      frame = 0;
      scrollDriven.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(bounds.height - window.innerHeight, 1)));
        element.style.setProperty(element.hasAttribute("data-video-pin-reveal") ? "--video-pin-progress" : "--text-parallax-progress", progress.toFixed(4));
      });
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    libraryMotionCleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    });
  }

  if (libraryMotionCleanups.length) {
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      libraryMotionCleanups.forEach((cleanup) => cleanup());
    };
  }

  const textEffectCleanups: Array<() => void> = [];
  const reduceTextMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  app.querySelectorAll<HTMLElement>("[data-text-rotate]").forEach((container) => {
    const current = container.querySelector<HTMLElement>("[data-text-rotate-current]");
    const values = (container.dataset.textRotateValues || "").split("\u001f").map((value) => value.trim()).filter(Boolean);
    if (!current || values.length < 2 || reduceTextMotion || storePreviewEditorEnabled) return;
    let index = 0;
    let timer = 0;
    let visible = false;
    let characterIndex = Array.from(values[0]).length;
    let phase: "hold" | "erase" | "type" = "hold";
    const stop = () => { if (timer) window.clearTimeout(timer); timer = 0; };
    const schedule = (delay: number) => {
      stop();
      if (!visible || document.hidden) return;
      timer = window.setTimeout(tick, delay);
    };
    const tick = () => {
      if (!visible || typeof document === "undefined" || document.hidden) return;
      if (phase === "hold") {
        phase = "erase";
        schedule(1400);
        return;
      }
      if (phase === "erase") {
        const characters = Array.from(values[index]);
        characterIndex = Math.max(0, characterIndex - 1);
        current.textContent = characters.slice(0, characterIndex).join("");
        if (characterIndex === 0) {
          index = (index + 1) % values.length;
          phase = "type";
          schedule(180);
        } else schedule(42);
        return;
      }
      const characters = Array.from(values[index]);
      characterIndex = Math.min(characters.length, characterIndex + 1);
      current.textContent = characters.slice(0, characterIndex).join("");
      if (characterIndex === characters.length) {
        phase = "hold";
        schedule(0);
      } else schedule(72);
    };
    const start = () => {
      stop();
      if (!visible || document.hidden) return;
      phase = "hold";
      characterIndex = Array.from(values[index]).length;
      current.textContent = values[index];
      schedule(0);
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }, { threshold: .2 })
      : null;
    if (observer) observer.observe(container);
    else { visible = true; start(); }
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    textEffectCleanups.push(() => { stop(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); });
  });

  app.querySelectorAll<HTMLElement>("[data-text-glitch]").forEach((container) => {
    const hover = container.querySelector<HTMLElement>("[data-text-glitch-hover]");
    const target = container.dataset.hoverText || hover?.textContent || "";
    if (!hover || !target || reduceTextMotion) return;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let timer = 0;
    const stop = () => { if (timer) window.clearInterval(timer); timer = 0; };
    const reveal = () => {
      stop();
      let progress = 0;
      timer = window.setInterval(() => {
        hover.textContent = Array.from(target).map((letter, index) => {
          if (/\s/.test(letter) || index < progress) return letter;
          return letters[Math.floor(Math.random() * letters.length)];
        }).join("");
        progress += .5;
        if (progress >= Array.from(target).length) { stop(); hover.textContent = target; }
      }, 32);
    };
    const reset = () => { stop(); hover.textContent = target; };
    container.addEventListener("pointerenter", reveal);
    container.addEventListener("focus", reveal);
    container.addEventListener("pointerleave", reset);
    container.addEventListener("blur", reset);
    textEffectCleanups.push(() => {
      stop();
      container.removeEventListener("pointerenter", reveal);
      container.removeEventListener("focus", reveal);
      container.removeEventListener("pointerleave", reset);
      container.removeEventListener("blur", reset);
    });
  });

  app.querySelectorAll<HTMLElement>("[data-text-reveal]").forEach((container) => {
    if (reduceTextMotion || storePreviewEditorEnabled || typeof IntersectionObserver !== "function") {
      container.classList.add("is-revealed");
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      container.classList.add("is-revealed");
      observer.disconnect();
    }, { threshold: .25 });
    observer.observe(container);
    textEffectCleanups.push(() => observer.disconnect());
  });

  app.querySelectorAll<SVGSVGElement>("[data-text-along-path] svg").forEach((svg) => {
    const pause = () => { try { svg.pauseAnimations(); } catch {} };
    const play = () => { if (!reduceTextMotion && !storePreviewEditorEnabled && !document.hidden) try { svg.unpauseAnimations(); } catch {} };
    if (reduceTextMotion || storePreviewEditorEnabled) { pause(); return; }
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => entry.isIntersecting ? play() : pause(), { threshold: .05 })
      : null;
    observer?.observe(svg);
    const onVisibility = () => document.hidden ? pause() : play();
    document.addEventListener("visibilitychange", onVisibility);
    textEffectCleanups.push(() => { pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); });
  });

  if (textEffectCleanups.length) {
    const priorCleanup = activeStoreExperienceCleanup as (() => void) | null;
    activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      textEffectCleanups.forEach((cleanup) => cleanup());
    };
  }

  const circleReveals = Array.from(app.querySelectorAll<HTMLElement>("[data-circle-reveal]"));
  const frameSequences = Array.from(app.querySelectorAll<HTMLElement>("[data-frame-sequence]"));
  const fullChapters = Array.from(app.querySelectorAll<HTMLElement>("[data-full-chapters]"));
  if (circleReveals.length || frameSequences.length || fullChapters.length) {
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let frame = 0;
    const progressFor = (element: HTMLElement) => {
      const travel = Math.max(element.offsetHeight - window.innerHeight, 1);
      return Math.max(0, Math.min(1, -element.getBoundingClientRect().top / travel));
    };
    const syncVideo = (container: HTMLElement, shouldPlay: boolean) => {
      const video = container.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      const nextPlaybackState = shouldPlay && !reduceMotion?.matches ? "playing" : "paused";
      if (video.dataset.motionPlayback === nextPlaybackState) return;
      video.dataset.motionPlayback = nextPlaybackState;
      if (nextPlaybackState === "playing") {
        playStoreVideo(video, () => {
          video.dataset.motionPlayback = "paused";
        });
      } else {
        if (!video.paused) video.pause();
      }
    };
    const paint = () => {
      frame = 0;
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
        const selectedEditorIndex = editorSceneIndexFor(sequence, frames.length);
        const hasEditorScene = storePreviewEditorEnabled
          && storePreviewEditorSelection?.animationId === sequence.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(storePreviewEditorSelection?.itemIndex);
        const index = hasEditorScene ? selectedEditorIndex : Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)));
        frames.forEach((item, itemIndex) => {
          const active = itemIndex === index;
          item.classList.toggle("active", active);
          syncVideo(item, active && progress < .99);
        });
        const image = frames[index];
        const status = sequence.querySelector<HTMLElement>("[data-frame-status]");
        const title = sequence.querySelector<HTMLElement>("[data-frame-title]");
        const body = sequence.querySelector<HTMLElement>("[data-frame-body]");
        const animationCopy = sequence.querySelector<HTMLElement>("[data-animation-copy]");
        if (animationCopy && image) applyAnimationCopySceneLayout(animationCopy, image);
        if (status) status.textContent = `${String(index + 1).padStart(2, "0")} / ${String(frames.length).padStart(2, "0")}`;
        if (title) {
          title.textContent = image?.dataset.frameTitleValue || "";
          title.hidden = !title.textContent;
        }
        if (body) {
          body.textContent = image?.dataset.frameBodyValue || "";
          body.hidden = !body.textContent;
        }
      });
      fullChapters.forEach((chapters) => {
        const backgrounds = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-bg]"));
        const copies = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-copy]"));
        const progress = reduceMotion?.matches ? 0 : progressFor(chapters);
        const selectedEditorIndex = editorSceneIndexFor(chapters, backgrounds.length);
        const hasEditorScene = storePreviewEditorEnabled
          && storePreviewEditorSelection?.animationId === chapters.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(storePreviewEditorSelection?.itemIndex);
        const index = hasEditorScene ? selectedEditorIndex : Math.min(backgrounds.length - 1, Math.round(progress * (backgrounds.length - 1)));
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
    [...frameSequences, ...fullChapters].forEach((container) => {
      container.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", requestPaint);
    });
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", requestPaint);
    reduceMotion?.addEventListener("change", requestPaint);
    paint();
    const priorCleanup = activeStoreExperienceCleanup;
    activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      reduceMotion?.removeEventListener("change", requestPaint);
      [...circleReveals, ...fullChapters].forEach((container) =>
        container.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()),
      );
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
      else playStoreVideo(video);
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
  if (motionFlows.length) {
    const flowEntries = motionFlows.flatMap((motionFlow) =>
      Array.from(motionFlow.querySelectorAll<HTMLElement>(".store-flow-inner"))
        .map((inner, flowIndex) => ({ inner, flowIndex })),
    );
    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frame = 0;
    let settleTimer = 0;
    const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
    const releaseMotionLayers = () => {
      flowEntries.forEach(({ inner }) => (inner.style.willChange = "auto"));
      settleTimer = 0;
    };
    const paintMotionDuo = () => {
      frame = 0;
      if (motionQuery?.matches) {
        flowEntries.forEach(({ inner }) => {
          inner.style.transform = "none";
          inner.style.clipPath = "inset(0 round 0)";
          inner.style.opacity = "1";
        });
        releaseMotionLayers();
        return;
      }
      const viewportHeight = Math.max(window.innerHeight, 1);
      flowEntries.forEach(({ inner, flowIndex }) => {
        const section = inner.closest<HTMLElement>(".store-flow-section");
        if (!section) return;
        const progress = clampProgress((viewportHeight - section.getBoundingClientRect().top) / (viewportHeight * .75));
        const isGeneratedStory = Boolean(inner.closest(".bespoke-story-flow"));
        const isCompactViewport = window.matchMedia?.("(max-width: 720px)").matches;
        if (isGeneratedStory) {
          const remaining = 1 - progress;
          inner.style.transform = isCompactViewport
            ? `translateY(${remaining * 24}px) scale(${.98 + progress * .02})`
            : `translateY(${remaining * 8}svh) rotate(${remaining * 3}deg) scale(${.96 + progress * .04})`;
          inner.style.clipPath = `inset(${remaining * 9}% 0 0 round ${remaining * 22}px)`;
          inner.style.opacity = String(.72 + progress * .28);
        } else if (flowIndex === 0) {
          inner.style.transform = "none";
          inner.style.clipPath = "inset(0 round 0)";
          inner.style.opacity = "1";
        } else {
          inner.style.transform = `rotate(${(1 - progress) * 30}deg)`;
        }
      });
    };
    const requestMotionPaint = () => {
      flowEntries.forEach(({ inner }) => (inner.style.willChange = "transform, clip-path, opacity"));
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(releaseMotionLayers, 180);
      if (!frame) frame = window.requestAnimationFrame(paintMotionDuo);
    };
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
      motionFlows.forEach((motionFlow) => motionFlow.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()));
    };
  }

  const searchInput = app.querySelector<HTMLInputElement>("#store-search");
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value;
    renderStoreGrid(slug, store, currency, activeCatalogProductIds);
  });

  const sortSelect = app.querySelector<HTMLSelectElement>("#store-sort");
  if (sortSelect) {
    // Restore the previous choice — renderStore() fully re-renders the shell,
    // and the sort shouldn't silently reset when that happens.
    sortSelect.value = sortMode;
    sortSelect.addEventListener("change", () => {
      sortMode = sortSelect.value as typeof sortMode;
      renderStoreGrid(slug, store, currency, activeCatalogProductIds);
    });
  }

  const collectionTabs = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-store-collection]"));
  const selectCollectionTab = (button: HTMLButtonElement, focus = false) => {
    selectedCollectionId = button.dataset.storeCollection || "ALL";
    collectionTabs.forEach((candidate) => {
      const active = candidate === button;
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
    });
    app.querySelector("#store-grid")?.setAttribute("aria-labelledby", button.id);
    if (!storePreviewMode) {
      window.history.pushState(
        { pagosyaView: "collection", collectionId: selectedCollectionId },
        "",
        storeCollectionUrl(slug, selectedCollectionId),
      );
    }
    renderStoreGrid(slug, store, currency, activeCatalogProductIds);
    if (focus) button.focus({ preventScroll: true });
  };
  collectionTabs.forEach((button, index) => {
    button.addEventListener("click", () => selectCollectionTab(button));
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? collectionTabs.length - 1
        : (index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + collectionTabs.length) % collectionTabs.length;
      selectCollectionTab(collectionTabs[nextIndex], true);
    });
  });

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

  renderStoreGrid(slug, store, currency, activeCatalogProductIds);
  bindPreviewBlueprints(store);
  annotateStorePreviewEditor(store);
  if (storeEditorMode) {
    postToParent("STORE_EDITOR_PAGE_CONTEXT", {
      pageId: activeSitePage?.id ?? null,
      pageSlug: activeSitePage?.slug ?? null,
      pageLabel: activeSitePage?.label ?? "Inicio",
    });
  }
  hasStoreAnimatedIn = true;
  if (storePreviewMode && !previewReadyAnnounced) {
    previewReadyAnnounced = true;
    postToParent("CHECKOUT_READY", { mode: "store-preview" });
  }
}

function updateStorePreviewAnimationText(selection: StorePreviewEditorSelection, value: string): void {
  if (!selection.animationId) return;
  const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
    .find((candidate) => candidate.dataset.animationId === selection.animationId);
  if (!section) return;
  const normalizedValue = value.replace(/\u00a0/g, " ").slice(0, 360);
  const targets = Array.from(section.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((target) => {
    if (target.dataset.storeEditorField !== selection.field) return false;
    if (target.dataset.storeEditorAnimationId !== selection.animationId) return false;
    if (selection.itemId) return target.dataset.storeEditorItemId === selection.itemId;
    if (Number.isInteger(selection.itemIndex)) return Number(target.dataset.storeEditorItemIndex) === selection.itemIndex;
    return !target.hasAttribute("data-store-editor-item-index");
  });
  targets.forEach((target) => {
    if (target.matches(".store-testimonial-copy blockquote")) target.textContent = normalizedValue ? `“${normalizedValue}”` : "";
    else if (target.matches('.store-testimonial-copy [data-animation-copy-field="caption"]')) target.textContent = normalizedValue ? `— ${normalizedValue}` : "";
    else target.textContent = normalizedValue;
    target.hidden = !normalizedValue;
  });
  if (selection.field === "buttonLabel") {
    const button = section.querySelector<HTMLElement>(".store-animation-cta");
    if (button) button.hidden = !normalizedValue;
  }
  new Set(targets.map((target) => target.closest<HTMLElement>("[data-animation-copy]")).filter(Boolean)).forEach((copy) => {
    if (!copy) return;
    const hasVisibleText = Array.from(copy.querySelectorAll<HTMLElement>("[data-animation-copy-field]"))
      .some((target) => !target.hidden && !!target.textContent?.trim());
    copy.hidden = !hasVisibleText;
  });
  if (!Number.isInteger(selection.itemIndex)) return;
  const itemIndex = selection.itemIndex!;
  const heroButton = section.querySelector<HTMLElement>(`[data-motion-hero-to="${itemIndex}"]`);
  if (heroButton && selection.field === "title") heroButton.dataset.motionTitle = normalizedValue;
  if (heroButton && selection.field === "caption") heroButton.dataset.motionCaption = normalizedValue;
  const frame = section.querySelector<HTMLElement>(`[data-frame="${itemIndex}"]`);
  if (frame && selection.field === "title") frame.dataset.frameTitleValue = normalizedValue;
  if (frame && selection.field === "body") frame.dataset.frameBodyValue = normalizedValue;
}

function sameStorePreviewEditorSelection(left: StorePreviewEditorSelection, right: StorePreviewEditorSelection): boolean {
  return left.section === right.section
    && left.field === right.field
    && left.itemId === right.itemId
    && left.itemIndex === right.itemIndex
    && left.animationId === right.animationId;
}

function updateStorePreviewEditorText(selection: StorePreviewEditorSelection, value: string): void {
  if (selection.animationId) {
    updateStorePreviewAnimationText(selection, value);
    return;
  }
  const normalizedValue = value.replace(/\u00a0/g, " ").slice(0, 2_000);
  app.querySelectorAll<HTMLElement>("[data-store-editor-target]").forEach((target) => {
    if (target.dataset.storeEditorSection !== selection.section) return;
    if (target.dataset.storeEditorField !== selection.field) return;
    if (selection.itemId && target.dataset.storeEditorItemId !== selection.itemId) return;
    if (Number.isInteger(selection.itemIndex) && Number(target.dataset.storeEditorItemIndex) !== selection.itemIndex) return;
    target.textContent = normalizedValue;
  });
}

function updateStorePreviewAnimationStyle(animationId: string, key: string, value: unknown, selection: StorePreviewEditorSelection | null = null): void {
  const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
    .find((candidate) => candidate.dataset.animationId === animationId);
  if (!section) return;
  const selectedTargets = selection
    ? Array.from(section.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((target) => {
        if (target.dataset.storeEditorField !== selection.field) return false;
        if (selection.itemId) return target.dataset.storeEditorItemId === selection.itemId;
        if (Number.isInteger(selection.itemIndex)) return Number(target.dataset.storeEditorItemIndex) === selection.itemIndex;
        return !target.hasAttribute("data-store-editor-item-index");
      })
    : [];
  const copy = selectedTargets.map((target) => target.closest<HTMLElement>("[data-animation-copy]")).find(Boolean) ?? null;
  const styleTarget = copy ?? section;
  if (key === "textAlign" && ["left", "center", "right"].includes(String(value))) {
    const align = String(value);
    styleTarget.dataset.animationTextAlign = align;
    styleTarget.setAttribute(styleTarget === section ? "data-animation-custom-layout" : "data-animation-copy-custom-layout", "");
    styleTarget.style.setProperty("--animation-copy-align", align);
    styleTarget.style.setProperty("--animation-copy-translate", `${align === "right" ? "-100%" : align === "center" ? "-50%" : "0"} -50%`);
    return;
  }
  if (key === "textScale") {
    const textScale = Math.min(200, Math.max(50, Math.round(Number(value))));
    if (!Number.isFinite(textScale)) return;
    styleTarget.dataset.animationTextScale = String(textScale);
    styleTarget.setAttribute(styleTarget === section ? "data-animation-custom-layout" : "data-animation-copy-custom-layout", "");
    animationTextScaleVariables(styleTarget, textScale);
    return;
  }
  if (key === "textWidthPercent") {
    const textWidthPercent = Math.min(100, Math.max(20, Math.round(Number(value))));
    if (!Number.isFinite(textWidthPercent)) return;
    section.dataset.animationTextWidthPercent = String(textWidthPercent);
    section.setAttribute("data-animation-custom-layout", "");
    section.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    return;
  }
  if (key === "textColor" && /^#[0-9a-f]{6}$/i.test(String(value))) {
    if (styleTarget === section) {
      section.toggleAttribute("data-animation-has-text-color", true);
      section.dataset.animationTextColor = String(value);
      section.style.setProperty("--animation-text-color", String(value));
    } else {
      styleTarget.dataset.animationTextColor = String(value);
      styleTarget.style.setProperty("--animation-scene-text-color", String(value));
    }
    return;
  }
  if (key === "fontStyle" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(String(value))) {
    styleTarget.dataset.animationFontStyle = String(value);
    return;
  }
  if (key === "backgroundColor" && /^#[0-9a-f]{6}$/i.test(String(value))) {
    section.toggleAttribute("data-animation-has-background", true);
    section.style.setProperty("--animation-background", String(value));
  }
}

// The editor iframe is opt-in and visual-only: a normal customer storefront
// never listens for parent-window customization. Checking event.source keeps
// unrelated tabs/windows from driving the preview even when they know its URL.
if (storeEditorMode) {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !activePreviewStore) return;
    if (!event.data || typeof event.data !== "object") return;
    try {
    if (event.data.type === "PAGOSYA_PREVIEW_BUILDER_RESULT") {
      const dialog = document.querySelector<HTMLDialogElement>(`.preview-builder-dialog[data-request-id="${CSS.escape(String(event.data.requestId || ""))}"]`);
      if (!dialog) return;
      const saveTimeout = Number(dialog.dataset.saveTimeout);
      if (Number.isFinite(saveTimeout)) window.clearTimeout(saveTimeout);
      delete dialog.dataset.saveTimeout;
      if (event.data.ok === true) {
        dialog.querySelector<HTMLElement>(".preview-builder-status")?.replaceChildren("Listo. Actualizando la tienda…");
        window.setTimeout(() => {
          if (dialog.isConnected && dialog.open) dialog.close();
        }, 900);
        return;
      }
      dialog.removeAttribute("aria-busy");
      const submit = dialog.querySelector<HTMLButtonElement>(".preview-builder-submit");
      if (submit) {
        submit.disabled = false;
        submit.textContent = String(event.data.submitLabel || "Intentar de nuevo");
      }
      dialog.querySelector<HTMLElement>(".preview-builder-status")?.replaceChildren(String(event.data.error || "No pudimos guardar el cambio. Intenta nuevamente."));
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_TEXT_UPDATE") {
      storePreviewEditorEnabled = event.data.editorMode !== false;
      const selection = sanitizeStorePreviewEditorSelection(event.data.selection);
      if (!selection || typeof event.data.value !== "string") return;
      const sceneChanged = selection.animationId
        && Number.isInteger(selection.itemIndex)
        && (storePreviewEditorSelection?.animationId !== selection.animationId || storePreviewEditorSelection.itemIndex !== selection.itemIndex);
      storePreviewEditorSelection = selection;
      syncStorePreviewEditorMode();
      if (sceneChanged) {
        const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
          .find((candidate) => candidate.dataset.animationId === selection.animationId);
        section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: selection.itemIndex } }));
      }
      updateStorePreviewEditorText(selection, event.data.value);
      if (storePreviewPendingInlineTextCommit
        && sameStorePreviewEditorSelection(storePreviewPendingInlineTextCommit.selection, selection)
        && storePreviewPendingInlineTextCommit.value === event.data.value.replace(/\u00a0/g, " ")) {
        storePreviewPendingInlineTextCommit = null;
      }
      syncStorePreviewEditorSelection();
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_STYLE_UPDATE") {
      storePreviewEditorEnabled = event.data.editorMode !== false;
      if (typeof event.data.animationId !== "string" || typeof event.data.key !== "string") return;
      syncStorePreviewEditorMode();
      const selection = sanitizeStorePreviewEditorSelection(event.data.selection);
      updateStorePreviewAnimationStyle(event.data.animationId.slice(0, 64), event.data.key.slice(0, 64), event.data.value, selection);
      syncStorePreviewEditorSelection();
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_SELECTION") {
      storePreviewEditorEnabled = event.data.editorMode !== false;
      storePreviewEditorSelection = sanitizeStorePreviewEditorSelection(event.data.editorSelection);
      syncStorePreviewEditorMode();
      if (storePreviewEditorSelection?.animationId && Number.isInteger(storePreviewEditorSelection.itemIndex)) {
        const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
          .find((candidate) => candidate.dataset.animationId === storePreviewEditorSelection?.animationId);
        section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: storePreviewEditorSelection.itemIndex } }));
      }
      syncStorePreviewEditorSelection();
      if (event.data.reveal === true && storePreviewEditorSelection) {
        const selection = storePreviewEditorSelection;
        const animationSection = selection.animationId
          ? Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
              .find((candidate) => candidate.dataset.animationId === selection.animationId)
          : null;
        const storyScene = animationSection?.querySelector<HTMLElement>(`[data-motion-flow] [data-animation-media-index="${selection.itemIndex}"]`)?.closest<HTMLElement>(".store-flow-section");
        if (storyScene && Number.isInteger(selection.itemIndex)) scrollStorePreviewToElement(storyScene);
        else scrollStorePreviewToSection(selection.section);
      }
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_PREVIEW_NAVIGATION") {
      const requestedAction = String(event.data.previewAction || "scroll");
      const previewAction = ["cart", "motion", "hero-item", "editorial-item"].includes(requestedAction) ? requestedAction : "scroll";
      const previewSection = STORE_PREVIEW_SECTIONS.includes(event.data.previewSection)
        ? event.data.previewSection as StorePreviewSection
        : typeof event.data.previewSection === "string" && /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(event.data.previewSection)
          ? event.data.previewSection as `animation-${string}`
          : typeof event.data.previewSection === "string" && /^site-[a-z][a-z0-9-]{1,47}$/.test(event.data.previewSection)
            ? event.data.previewSection as `site-${string}`
            : null;
      if (previewAction !== "cart") document.querySelector(".cart-review-dialog")?.remove();
      if (previewAction === "cart") {
        const renderedStore = activePreviewRenderedStore ?? activePreviewStore.store;
        const existingCart = document.querySelector<HTMLDialogElement>(".cart-review-dialog.is-preview-open");
        if (existingCart?.isConnected) renderCartReviewDialog(existingCart, activePreviewStore.slug, renderedStore);
        else openCartReview(activePreviewStore.slug, renderedStore, { preview: true, allowEmpty: true });
      } else if (previewAction === "motion") {
        if (previewSection?.startsWith("animation-")) scrollStorePreviewToSection(previewSection);
        else scrollStorePreviewToMotion();
      } else if (previewAction === "hero-item" && Number.isInteger(event.data.previewTargetIndex)) {
        scrollStorePreviewToHeroItem(Math.max(0, event.data.previewTargetIndex));
      } else if (previewAction === "editorial-item" && Number.isInteger(event.data.previewTargetIndex)) {
        scrollStorePreviewToEditorialItem(Math.max(0, event.data.previewTargetIndex), event.data.previewTargetKind === "media" ? "media" : "text");
      } else if (previewSection) scrollStorePreviewToSection(previewSection);
      return;
    }
    if (event.data.type !== "PAGOSYA_STORE_PREVIEW") return;
    // A delayed preview patch must never replace the contenteditable node
    // while the merchant is typing. Commit the live text first and let the
    // parent send the next authoritative patch after it records that value.
    if (storePreviewInlineEditorTarget) {
      storePreviewInlineEditorFinish?.(true);
      return;
    }
    const patch = sanitizeStorePreviewPatch(event.data.patch);
    if (!patch) return;
    storePreviewLockedSectionIds = new Set(Array.isArray(event.data.lockedSectionIds)
      ? event.data.lockedSectionIds.filter((id: unknown): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{1,47}$/.test(id)).slice(0, 64)
      : []);
    storePreviewEditorEnabled = event.data.editorMode !== false;
    storePreviewEditorSelection = sanitizeStorePreviewEditorSelection(event.data.editorSelection);
    const previousPreviewStore = activePreviewRenderedStore ?? activePreviewStore.store;
    let previewStore = { ...activePreviewStore.store, ...patch };
    // A generated section can now be edited as its own structured document in
    // the dashboard. Prefer that safe draft over the last persisted document;
    // legacy controls are projected onto the draft below so both editor paths
    // stay compatible without flattening scene copy, layout, or motion.
    const currentDocument = sanitizeSiteDocument(patch.siteDocument) ?? sanitizeSiteDocument(activePreviewStore.store.siteDocument);
    if (currentDocument) {
      previewStore.siteDocument = synchronizeSiteDocument(currentDocument, changedLegacySiteTextPatch(patch, previousPreviewStore), {
        banner: patch.bannerUrl !== undefined && patch.bannerUrl !== activePreviewStore.store.bannerUrl,
        about: patch.aboutImageUrl !== undefined && patch.aboutImageUrl !== activePreviewStore.store.aboutImageUrl,
        gallery: patch.editorialGallery !== undefined && JSON.stringify(patch.editorialGallery) !== JSON.stringify(activePreviewStore.store.editorialGallery),
      });
    }
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
    const previewSection = STORE_PREVIEW_SECTIONS.includes(event.data.previewSection)
      ? event.data.previewSection as StorePreviewSection
      : typeof event.data.previewSection === "string" && /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(event.data.previewSection)
        ? event.data.previewSection as `animation-${string}`
        : typeof event.data.previewSection === "string" && /^site-[a-z][a-z0-9-]{1,47}$/.test(event.data.previewSection)
          ? event.data.previewSection as `site-${string}`
          : null;
    const renderSignature = JSON.stringify(previewStore);
    const previewViewport = { top: Math.max(0, window.scrollY), left: Math.max(0, window.scrollX) };
    if (previewAction !== "cart") document.querySelector(".cart-review-dialog")?.remove();
    if (previewAction === "product" && previewProduct) {
      const productView = `product:${previewProduct.id}`;
      if (renderSignature !== activePreviewRenderSignature || activePreviewRenderedView !== productView) {
        renderProductPage(activePreviewStore.slug, previewStore, previewProduct.id);
        activePreviewRenderedStore = previewStore;
        activePreviewRenderSignature = renderSignature;
        activePreviewRenderedView = productView;
      }
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return;
    }
    // A preview message can be emitted more than once for the same editor
    // state (for example, a click followed by focus). Replacing #app for an
    // identical store makes every section and image disappear and mount again,
    // producing the brief blank frame seen by merchants. Navigation and
    // selection still run below, but unchanged data keeps the existing DOM.
    if (renderSignature !== activePreviewRenderSignature || activePreviewRenderedView !== "store") {
      renderStoreRoute(activePreviewStore.slug, previewStore, { focusPromotion: false });
      activePreviewRenderedStore = previewStore;
      activePreviewRenderSignature = renderSignature;
      activePreviewRenderedView = "store";
      // Replacing #app can briefly collapse the document and clamp an embedded
      // preview back to its beginning. Keep the merchant at the same place for
      // ordinary edits; explicit editor navigation below remains authoritative.
      if (previewAction === "scroll" && !previewSection) window.scrollTo({ ...previewViewport, behavior: "auto" });
    } else {
      syncStorePreviewEditorMode();
      syncStorePreviewEditorSelection();
    }
    // A stale generated snapshot may repaint immediately after contenteditable
    // blurs. Reapply the optimistic commit synchronously so the merchant never
    // sees their copy snap back while the dashboard processes the message.
    if (storePreviewPendingInlineTextCommit) {
      updateStorePreviewEditorText(storePreviewPendingInlineTextCommit.selection, storePreviewPendingInlineTextCommit.value);
    }
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
    } catch (error) {
      // Invalid or stale editor messages should leave the last good preview
      // running instead of breaking every later edit in the iframe.
      console.error("Ignored invalid store editor update", error);
    }
  });
}

/**
 * Renders just the product grid + cart bar total — split out from
 * renderStore() so typing in the search box or clicking a category chip
 * never touches (and so never loses focus/scroll on) the surrounding
 * toolbar, header, or cart bar shell.
 */
function renderStoreGrid(slug: string, store: Store, currency: string, visibleProductIds: Set<string> | null = null): void {
  const grid = app.querySelector<HTMLElement>("#store-grid");
  if (!grid) return;

  const visibleStoreItems = visibleProductIds
    ? store.items.filter((item) => visibleProductIds.has(item.id))
    : store.items;
  const byCategory = new Map<string | null, StoreItem[]>();
  for (const item of visibleStoreItems) {
    const list = byCategory.get(item.categoryId) ?? [];
    list.push(item);
    byCategory.set(item.categoryId, list);
  }

  const query = searchQuery.trim().toLowerCase();
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  const selectedCollection = selectedCollectionId === "ALL"
    ? null
    : siteDocument?.merchandising.collections?.find((collection) => collection.id === selectedCollectionId) ?? null;
  const collectionProductIds = selectedCollection ? new Set(selectedCollection.productIds) : null;
  const featuredProducts = new Set(siteDocument?.merchandising.featuredProductIds ?? []);
  const showDescriptions = siteDocument?.merchandising.showDescriptions !== false;
  const sections = (
    store.categories.length === 0
      ? [{ id: "ALL", name: null as string | null, items: visibleStoreItems }]
      : [
          ...store.categories.map((c) => ({ id: c.id, name: c.name, items: byCategory.get(c.id) ?? [] })),
          ...(byCategory.get(null)?.length ? [{ id: "null", name: "Otros", items: byCategory.get(null)! }] : []),
        ]
  )
    .filter((section) => selectedCategoryId === "ALL" || section.id === selectedCategoryId)
    .map((section) => ({ ...section, items: sortStoreItems(section.items.filter((item) => (!collectionProductIds || collectionProductIds.has(item.id)) && itemMatchesSearch(item, query))) }))
    .filter((section) => section.items.length > 0 || (storeEditorMode && !query));

  if (sections.length === 0 || (storeEditorMode && store.items.length === 0 && store.categories.length === 0)) {
    grid.innerHTML = storeEditorMode && store.items.length === 0
      ? `<section class="preview-blueprint-launchpad" aria-label="Construir catálogo"><div><h3>Construye tu catálogo aquí</h3><p>Empieza con una categoría para ordenar la tienda, o publica directamente tu primer producto.</p></div><div>${previewBlueprintButton("category", { label: "Agregar categoría", copy: "Nombre + foto" })}${previewBlueprintButton("product", { label: "Agregar producto", copy: "Nombre + precio + foto" })}</div></section>`
      : `<div class="status empty">${
          visibleProductIds && visibleProductIds.size === 0
            ? "Selecciona productos para esta sección desde el editor de la página."
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
          <div class="store-items">${section.items.map((item) => renderProductCard(slug, item, cardIndex++, store.showLowStockToCustomers === true, { featured: featuredProducts.has(item.id), showDescription: showDescriptions })).join("")}${storeEditorMode ? previewBlueprintButton("product", { label: section.items.length ? "Agregar otro producto" : "Primer producto", copy: section.name ? `Dentro de ${section.name}` : "Nombre + precio + foto", categoryId: section.id !== "ALL" && section.id !== "null" ? section.id : undefined }) : ""}</div>`,
      )
      .join("");
  }

  bindPreviewBlueprints(store);

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
      renderStoreGrid(slug, store, currency, visibleProductIds);
    });
    row.querySelectorAll<HTMLInputElement>(".extra-toggle").forEach((input) => input.addEventListener("change", () => {
      const selected = new Set(selectedExtraIdsByItem.get(id) ?? []);
      if (input.checked) selected.add(input.dataset.extraId!);
      else selected.delete(input.dataset.extraId!);
      selectedExtraIdsByItem.set(id, selected);
      renderStoreGrid(slug, store, currency, visibleProductIds);
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
      renderStoreGrid(slug, store, currency, visibleProductIds);
      updateCartBar(store, currency);
    });
    row.querySelector(".qty-minus")?.addEventListener("click", () => {
      const key = cartItemKey(id, selectedVariantFor(item)?.id, selectedExtrasFor(item).map((extra) => extra.id));
      const next = (cart.get(key) ?? 0) - 1;
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
      saveCart(store);
      renderStoreGrid(slug, store, currency, visibleProductIds);
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

  const receiptContentHtml = `
    <header class="receipt-brand">
      <span><img src="/logo-mark.png" alt=""><strong>pagosYa</strong></span>
      <small>Comprobante de pago</small>
    </header>
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
  `;
  const trackingActionHtml = activeOrderTrackingToken
    ? `<a class="tracking-success-link receipt-action" href="/track/${encodeURIComponent(activeOrderTrackingToken)}">${ICON_CLOCK}<span><strong>Ver estado del pedido</strong><small>Preparación, envío o recojo</small></span>${ICON_ARROW_RIGHT}</a>`
    : "";
  const printActionHtml = `<button class="secondary receipt-download receipt-print receipt-action" type="button">${ICON_PRINTER}<span><strong>Imprimir comprobante</strong><small>Abrir vista de impresión</small></span>${ICON_ARROW_RIGHT}</button>`;
  const machineSummaryHtml = `
    <div class="payment-printer-machine-order">
      <span>${storeCheckout ? `${cart?.length ?? 0} ${(cart?.length ?? 0) === 1 ? "producto" : "productos"}` : "Comprobante"}</span>
      <strong>${formatAmount(order.amount, order.currency)}</strong>
    </div>
    <div class="payment-printer-machine-meta">
      <span>${escapeHtml(linkHeader?.storeName || "pagosYa")}</span>
      <code>${escapeHtml(order.id)}</code>
    </div>
  `;

  app.innerHTML = `
    <div class="payment-success-panel">
      <div class="status success">${ICON_CHECK}<span>${storeCheckout ? "Pedido recibido" : "Pago confirmado"}</span></div>
      <article class="receipt">${receiptContentHtml}</article>
      <div class="payment-success-actions">${trackingActionHtml}${printActionHtml}</div>
      ${backToStoreHtml()}
    </div>
  `;
  app.querySelector<HTMLButtonElement>(".receipt-print")?.addEventListener("click", () => window.print());
  launchPaymentPrinter(order.id, {
    receiptContentHtml,
    machineSummaryHtml,
    subject: storeCheckout ? "pedido" : "comprobante",
    title: storeCheckout ? "Tu pedido está listo" : "Tu comprobante está listo",
    trackingActionHtml,
    printActionHtml,
  });
  postToParent("PAYMENT_SUCCEEDED", { paymentIntentId: order.id, status: "succeeded" });
}

const celebratedPaymentIntentIds = new Set<string>();

function launchPaymentPrinter(
  paymentIntentId: string,
  content: {
    printActionHtml: string;
    receiptContentHtml: string;
    machineSummaryHtml: string;
    subject: "pedido" | "comprobante";
    title: string;
    trackingActionHtml: string;
  },
): void {
  if (celebratedPaymentIntentIds.has(paymentIntentId)) return;
  celebratedPaymentIntentIds.add(paymentIntentId);

  const celebration = document.createElement("div");
  celebration.className = "payment-success-overlay";
  celebration.dataset.stage = "printing";
  celebration.setAttribute("role", "dialog");
  celebration.setAttribute("aria-modal", "true");
  celebration.setAttribute("aria-labelledby", "payment-printer-title");
  celebration.tabIndex = -1;
  celebration.innerHTML = `
    <button class="payment-printer-close" type="button" aria-label="Cerrar comprobante">
      <span aria-hidden="true">×</span>
      <small>Presiona X</small>
    </button>
    <div class="payment-printer-scene">
      <div class="payment-printer-device" aria-hidden="true">
        <div class="payment-printer-machine-header">
          <span class="payment-printer-machine-brand"><img src="/logo-mark.png" alt=""><strong>pagosYa</strong></span>
          <span class="payment-printer-machine-led"><i></i> POS</span>
        </div>
        <div class="payment-printer-machine-screen">
          ${content.machineSummaryHtml}
          <div class="payment-printer-progress">
            <span class="payment-printer-progress-mark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span data-printer-status>Imprimiendo tu ${content.subject}…</span>
          </div>
        </div>
        <span class="payment-printer-slot"></span>
      </div>
      <div class="payment-printer-output" aria-hidden="true">
        <span class="payment-printer-output-shadow"></span>
        <article class="payment-printer-feed">
          <h2>Comprobante</h2>
          ${content.receiptContentHtml}
        </article>
      </div>
      <article class="payment-printer-paper" aria-hidden="true" inert>
        <h1 id="payment-printer-title">${escapeHtml(content.title)}</h1>
        <div class="payment-printer-receipt">${content.receiptContentHtml}</div>
        <div class="payment-printer-actions">${content.trackingActionHtml}${content.printActionHtml}</div>
      </article>
      <p class="payment-printer-dismiss-hint">Cuando termine, presiona <kbd>X</kbd> para cerrar.</p>
    </div>
    <p class="payment-printer-live" data-printer-live role="status" aria-live="polite" aria-atomic="true">Imprimiendo tu ${content.subject}…</p>
  `;

  const receipt = celebration.querySelector<HTMLElement>(".payment-printer-paper")!;
  const feedPaper = celebration.querySelector<HTMLElement>(".payment-printer-feed")!;
  const closeButton = celebration.querySelector<HTMLButtonElement>(".payment-printer-close")!;
  const status = celebration.querySelector<HTMLElement>("[data-printer-status]")!;
  const liveStatus = celebration.querySelector<HTMLElement>("[data-printer-live]")!;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const shouldReduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const receiptFinal = "translate(-50%, -50%) translateY(0%) scale(1)";
  const runningAnimations: Animation[] = [];
  let stageTimer: number | null = null;
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    if (stageTimer !== null) window.clearTimeout(stageTimer);
    runningAnimations.forEach((animation) => animation.cancel());
    document.removeEventListener("keydown", handleKeydown);
    celebration.remove();
    app.removeAttribute("inert");
    if (!document.querySelector(".payment-success-overlay")) {
      document.documentElement.classList.remove("payment-success-overlay-open");
      document.body.classList.remove("payment-success-overlay-open");
    }
    previousFocus?.focus();
  };

  const showReceipt = () => {
    if (finished || celebration.dataset.stage === "receipt") return;
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations.length = 0;
    celebration.dataset.stage = "receipt";
    receipt.removeAttribute("aria-hidden");
    receipt.removeAttribute("inert");
    status.textContent = content.title;
    liveStatus.textContent = content.title;
    if (!shouldReduceMotion && typeof receipt.animate === "function") {
      const expand = receipt.animate(
        [
          { opacity: 0, transform: "translate(-50%, -50%) translateY(8px) scale(.96)" },
          { opacity: 1, transform: receiptFinal },
        ],
        { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" },
      );
      runningAnimations.push(expand);
      void expand.finished.then(() => {
        receipt.style.transform = receiptFinal;
        expand.cancel();
        closeButton.focus();
      }).catch(() => undefined);
    } else {
      receipt.style.transform = receiptFinal;
      closeButton.focus();
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" || event.key.toLowerCase() === "x") {
      event.preventDefault();
      finish();
      return;
    }
    if (event.key !== "Tab" || celebration.dataset.stage !== "receipt") return;
    const focusable = Array.from(celebration.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.documentElement.classList.add("payment-success-overlay-open");
  document.body.classList.add("payment-success-overlay-open");
  app.setAttribute("inert", "");
  document.body.appendChild(celebration);
  celebration.focus();
  closeButton.addEventListener("click", finish);
  celebration.addEventListener("click", (event) => {
    if (event.target === celebration && celebration.dataset.stage === "receipt") finish();
  });
  celebration.querySelectorAll<HTMLButtonElement>(".receipt-print").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });
  document.addEventListener("keydown", handleKeydown);

  if (shouldReduceMotion || typeof feedPaper.animate !== "function") {
    stageTimer = window.setTimeout(showReceipt, shouldReduceMotion ? 320 : 2400);
    return;
  }

  const feed = feedPaper.animate(
    [
      { opacity: 0, transform: "translateY(calc(-100% + 2px))", offset: 0 },
      { opacity: 1, transform: "translateY(-91%)", offset: 0.075 },
      { opacity: 1, transform: "translateY(-91%)", offset: 0.105 },
      { opacity: 1, transform: "translateY(-81%)", offset: 0.18 },
      { opacity: 1, transform: "translateY(-81%)", offset: 0.21 },
      { opacity: 1, transform: "translateY(-70%)", offset: 0.285 },
      { opacity: 1, transform: "translateY(-70%)", offset: 0.315 },
      { opacity: 1, transform: "translateY(-58%)", offset: 0.39 },
      { opacity: 1, transform: "translateY(-58%)", offset: 0.42 },
      { opacity: 1, transform: "translateY(-45%)", offset: 0.495 },
      { opacity: 1, transform: "translateY(-45%)", offset: 0.525 },
      { opacity: 1, transform: "translateY(-32%)", offset: 0.6 },
      { opacity: 1, transform: "translateY(-32%)", offset: 0.63 },
      { opacity: 1, transform: "translateY(-20%)", offset: 0.705 },
      { opacity: 1, transform: "translateY(-20%)", offset: 0.735 },
      { opacity: 1, transform: "translateY(-10%)", offset: 0.81 },
      { opacity: 1, transform: "translateY(-10%)", offset: 0.84 },
      { opacity: 1, transform: "translateY(-3%)", offset: 0.915 },
      { opacity: 1, transform: "translateY(-3%)", offset: 0.945 },
      { opacity: 1, transform: "translateY(0%)", offset: 1 },
    ],
    { duration: 2400, easing: "linear", fill: "forwards" },
  );
  runningAnimations.push(feed);
  void feed.finished.then(showReceipt).catch(() => undefined);
  stageTimer = window.setTimeout(showReceipt, 2520);
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
