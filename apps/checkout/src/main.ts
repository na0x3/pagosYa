import { PaymentMethodType } from "@pagosya/shared-types";
import {
  assetUrl,
  cancelPaymentIntent,
  checkoutCart,
  confirmPaymentIntent,
  fetchSession,
  fetchStore,
  simulateRailCallback,
  CheckoutSession,
  CustomerContact,
  Store,
  StoreItem,
  StoreLink,
} from "./api";
import { observeResize, postToParent } from "./postmessage";

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

const app = document.getElementById("app")!;
installCustomPointer();
let selectedType: PaymentMethodType = PaymentMethodType.CARD;
let linkHeader: LinkHeader | null = null;
// Survives renderForm() re-renders (e.g. switching payment method tabs) so
// typed contact info isn't lost mid-checkout.
const customerContact: CustomerContact = { name: "", email: "", phone: "" };
// Keyed by field id so an error survives a payment-method tab switch
// (renderForm fully re-renders on every tab click) until the field is fixed.
const contactFieldErrors: Partial<Record<"customerName" | "customerEmail" | "customerPhone", string>> = {};
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

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm)(?:$|[?#])/i.test(url);
}

function installCustomPointer() {
  if (typeof window.matchMedia !== "function" || !window.matchMedia("(pointer: fine)").matches) return;
  const cursorValue = getComputedStyle(document.documentElement).getPropertyValue("--pg-hand-cursor");
  const imageMatch = cursorValue.match(/url\(["']?([^"')]+)["']?\)/);
  if (!imageMatch) return;

  const pointer = document.createElement("span");
  pointer.className = "pg-custom-pointer";
  pointer.setAttribute("aria-hidden", "true");
  pointer.style.backgroundImage = `url("${imageMatch[1]}")`;
  document.body.append(pointer);
  document.documentElement.classList.add("has-pg-custom-pointer");

  const movePointer = (event: PointerEvent) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    pointer.style.setProperty("--pointer-x", `${event.clientX - 5}px`);
    pointer.style.setProperty("--pointer-y", `${event.clientY - 2}px`);
    pointer.classList.add("is-visible");
  };
  const pressPointer = (event: PointerEvent) => {
    if (!event.pointerType || event.pointerType === "mouse") pointer.classList.add("is-pressing");
  };
  const releasePointer = () => pointer.classList.remove("is-pressing");

  document.addEventListener("pointermove", movePointer, { passive: true });
  document.addEventListener("pointerdown", pressPointer, { passive: true });
  document.addEventListener("pointerup", releasePointer, { passive: true });
  document.addEventListener("pointercancel", releasePointer, { passive: true });
  document.documentElement.addEventListener("mouseleave", () => pointer.classList.remove("is-visible"));
  window.addEventListener("blur", releasePointer);
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

function accentContrastColor(hex: string): "#ffffff" | "#000000" {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#ffffff";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Pure black and white overlap at 4.5:1 around this boundary: white is
  // compliant through L=0.1833 and black from L=0.175. Choosing between them
  // at the midpoint therefore guarantees WCAG AA contrast for every color.
  return luminance >= 0.179 ? "#000000" : "#ffffff";
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const linkSlug = params.get("link");
  const clientSecret = params.get("client_secret");

  // Payment Links (no-code path): the URL carries a link slug instead of an
  // already-created client_secret. Any of a merchant's link slugs opens their
  // whole catalog (Store) — a customer buying several things adds them all
  // to one Cart and pays once, instead of needing a separate QR per item.
  if (linkSlug && !clientSecret) {
    try {
      const store = await fetchStore(linkSlug, { preview: storePreviewMode });
      loadCart(store);
      renderStore(linkSlug, store);
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
    app.innerHTML = `<div class="status failed">Falta client_secret o link en la URL.</div>`;
    return;
  }

  await enterPaymentFlow(clientSecret);
}

async function enterPaymentFlow(clientSecret: string) {
  document.body.classList.remove("store-page");
  let session: CheckoutSession;
  try {
    session = await fetchSession(clientSecret);
  } catch (err) {
    app.innerHTML = `<div class="status failed">No se pudo cargar el pago: ${escapeHtml((err as Error).message)}</div>`;
    return;
  }

  postToParent("CHECKOUT_READY", {});
  renderForm(session, clientSecret);
  observeResize(app);
}

// Product/option key -> quantity, persisted to localStorage (see loadCart/saveCart)
// keyed by storeId. A product with options can carry both Pequeña and Grande
// as separate cart lines without duplicating the product in the catalog.
const cart = new Map<string, number>();
const selectedVariantByItem = new Map<string, string>();
const CART_VARIANT_SEPARATOR = "::";

function itemVariants(item: StoreItem): StoreItem["variants"] {
  return item.variants ?? [];
}

function cartItemKey(paymentLinkId: string, variantId?: string): string {
  return variantId ? `${paymentLinkId}${CART_VARIANT_SEPARATOR}${variantId}` : paymentLinkId;
}

function parseCartItemKey(key: string): { paymentLinkId: string; variantId?: string } {
  const [paymentLinkId, variantId] = key.split(CART_VARIANT_SEPARATOR, 2);
  return { paymentLinkId, ...(variantId ? { variantId } : {}) };
}

function selectedVariantFor(item: StoreItem): StoreItem["variants"][number] | undefined {
  const variants = itemVariants(item);
  if (variants.length === 0) return undefined;
  const selectedId = selectedVariantByItem.get(item.id);
  const remembered = variants.find((variant) => variant.id === selectedId);
  const firstPurchasable = variants.find((variant) => optionStock(item, variant) !== 0);
  const selected = remembered && optionStock(item, remembered) !== 0 ? remembered : firstPurchasable ?? variants[0];
  selectedVariantByItem.set(item.id, selected.id);
  return selected;
}

function productCartQuantity(paymentLinkId: string): number {
  let quantity = 0;
  for (const [key, lineQuantity] of cart) {
    if (parseCartItemKey(key).paymentLinkId === paymentLinkId) quantity += lineQuantity;
  }
  return quantity;
}

function optionStock(item: StoreItem, variant: StoreItem["variants"][number] | undefined): number | null {
  if (variant && variant.stock !== undefined) return variant.stock;
  return item.stock;
}

// renderStore() re-runs on every qty +/- click (full re-render, not a patch)
// — the staggered entrance animation should only ever play once, on the
// real first paint, not replay/flash on every cart interaction.
let hasStoreAnimatedIn = false;
let activePromotionCleanup: (() => void) | null = null;
let activeHeroCleanup: (() => void) | null = null;

// Search/category filter state for large catalogs — lives outside
// renderStoreGrid() so typing/clicking doesn't need to touch (and thus
// never loses focus on) the toolbar that renders these controls.
let searchQuery = "";
// "ALL" shows everything; "null" (string) is the sentinel for the
// uncategorized/"Otros" bucket, since categoryId itself is `string | null`
// and dataset attributes can only hold strings.
let selectedCategoryId: string = "ALL";
// "featured" keeps the merchant's own catalog order (createdAt); the others
// re-sort within each category section, never across section boundaries.
let sortMode: "featured" | "price-asc" | "price-desc" | "popular" = "featured";

function sortStoreItems(items: StoreItem[]): StoreItem[] {
  if (sortMode === "price-asc") return [...items].sort((a, b) => a.amount - b.amount);
  if (sortMode === "price-desc") return [...items].sort((a, b) => b.amount - a.amount);
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
  try {
    const raw = localStorage.getItem(cartStorageKey(store.storeId));
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, number>;
    const loadedByProduct = new Map<string, number>();
    const loadedByOption = new Map<string, number>();
    for (const [key, qty] of Object.entries(saved)) {
      // Drop entries for items archived/deleted since the cart was saved, and any
      // corrupt values — a stale or tampered cart must never crash the storefront.
      const { paymentLinkId, variantId } = parseCartItemKey(key);
      const item = store.items.find((candidate) => candidate.id === paymentLinkId);
      if (!item || !Number.isInteger(qty) || qty <= 0) continue;
      const variants = itemVariants(item);
      if (variants.length > 0 && (!variantId || !variants.some((variant) => variant.id === variantId))) continue;
      if (variants.length === 0 && variantId) continue;

      const variant = variants.find((candidate) => candidate.id === variantId);
      const optionKey = cartItemKey(item.id, variantId);
      const alreadyLoaded = loadedByProduct.get(item.id) ?? 0;
      const alreadyLoadedForOption = loadedByOption.get(optionKey) ?? 0;
      const productAvailable = item.stock === null ? qty : Math.max(0, item.stock - alreadyLoaded);
      const availableForOption = optionStock(item, variant);
      const optionAvailable = availableForOption === null ? qty : Math.max(0, availableForOption - alreadyLoadedForOption);
      const clamped = Math.min(qty, productAvailable, optionAvailable);
      if (clamped > 0) {
        cart.set(optionKey, clamped);
        loadedByProduct.set(item.id, alreadyLoaded + clamped);
        loadedByOption.set(optionKey, alreadyLoadedForOption + clamped);
        if (variantId && !selectedVariantByItem.has(item.id)) selectedVariantByItem.set(item.id, variantId);
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
    const { paymentLinkId, variantId } = parseCartItemKey(key);
    const item = items.find((candidate) => candidate.id === paymentLinkId);
    if (!item) continue;
    const variant = itemVariants(item).find((candidate) => candidate.id === variantId);
    total += (variant?.amount ?? item.amount) * quantity;
  }
  return total;
}

function cartCount(): number {
  return [...cart.values()].reduce((sum, qty) => sum + qty, 0);
}

function renderProductCard(item: StoreItem, index: number): string {
  const variants = itemVariants(item);
  const selectedVariant = selectedVariantFor(item);
  const key = cartItemKey(item.id, selectedVariant?.id);
  const qty = cart.get(key) ?? 0;
  const images = item.imageUrls.map(assetUrl).filter((u): u is string => !!u);
  const selectedStock = optionStock(item, selectedVariant);
  const soldOut = item.stock === 0 || selectedStock === 0;
  const atProductLimit = item.stock !== null && productCartQuantity(item.id) >= item.stock;
  const atOptionLimit = selectedStock !== null && qty >= selectedStock;
  const atStockLimit = atProductLimit || atOptionLimit;
  // Staggered on first paint only (see hasStoreAnimatedIn) — capped so a
  // long catalog doesn't leave the last cards waiting a visible beat to
  // appear.
  const staggerStyle = hasStoreAnimatedIn ? "" : ` style="--stagger-delay: ${Math.min(index * 45, 360)}ms"`;

  const galleryHtml = images.length
    ? `
      <div class="store-item-gallery">
        <img class="store-item-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(item.name)}" />
        ${
          images.length > 1
            ? `<div class="gallery-thumbs">
                ${images.map((url, i) => `<button type="button" class="gallery-thumb-btn ${i === 0 ? "active" : ""}" data-src="${escapeHtml(url)}" aria-label="Foto ${i + 1}"></button>`).join("")}
              </div>`
            : ""
        }
      </div>`
    : `<div class="store-item-image placeholder"></div>`;

  const tagsHtml = item.tags.length
    ? `<div class="store-item-tags">${item.tags.map((t) => `<span class="tag-badge">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  const stockNote = soldOut
    ? `<div class="stock-note out">Agotado</div>`
    : selectedStock !== null
      ? `<div class="stock-note">Quedan ${selectedStock}</div>`
      : "";

  const variantsHtml = variants.length
    ? `<div class="store-item-option">
        <label for="variant-${escapeHtml(item.id)}">Elige una opción</label>
        <select id="variant-${escapeHtml(item.id)}" class="variant-select" aria-label="Opción para ${escapeHtml(item.name)}">
          ${variants
            .map(
              (variant) =>
                `<option value="${escapeHtml(variant.id)}" ${variant.id === selectedVariant?.id ? "selected" : ""} ${optionStock(item, variant) === 0 ? "disabled" : ""}>${escapeHtml(variant.name)} — ${formatAmount(variant.amount, item.currency)}${optionStock(item, variant) === 0 ? " · Agotado" : typeof optionStock(item, variant) === "number" ? ` · ${optionStock(item, variant)} disp.` : ""}</option>`,
            )
            .join("")}
        </select>
      </div>`
    : "";

  return `
    <div class="store-item ${soldOut ? "sold-out" : ""}" data-id="${item.id}"${staggerStyle}>
      ${galleryHtml}
      <div class="store-item-info">
        ${tagsHtml}
        <div class="store-item-name">${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" title="${escapeHtml(item.color)}"></span>` : ""}${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
        ${variantsHtml}
        <div class="store-item-price">${formatAmount(selectedVariant?.amount ?? item.amount, item.currency)}${stockNote}</div>
      </div>
      ${
        soldOut
          ? ""
          : `<div class="qty-stepper">
              <button type="button" class="qty-minus" ${qty === 0 ? "disabled" : ""}>−</button>
              <span class="qty-value">${qty}</span>
              <button type="button" class="qty-plus" ${atStockLimit ? "disabled" : ""}>+</button>
            </div>`
      }
    </div>`;
}

// Tracked so a failed/canceled payment screen can offer a real way back
// instead of a dead end — the cart itself is already cleared by the time a
// customer reaches the payment form (see checkoutCart's cart.clear() call),
// so "back to store" means the plain store link, not cart restoration.
let currentStoreSlug: string | null = null;
type StorePreviewPatch = Partial<
  Pick<
    Store,
    | "storeName"
    | "tagline"
    | "logoUrl"
    | "bannerUrl"
    | "backgroundColor"
    | "backgroundImageUrl"
    | "contactPhone"
    | "contactEmail"
    | "aboutText"
    | "aboutImageUrl"
    | "accentColor"
    | "fontStyle"
    | "buttonStyle"
    | "buttonVariant"
    | "buttonMotion"
    | "cartButtonLabel"
    | "boardTexture"
    | "announcement"
    | "announcementMode"
    | "announcementSpeed"
    | "promotionEnabled"
    | "promotionTitle"
    | "promotionBody"
    | "promotionCtaLabel"
    | "promotionCtaUrl"
    | "heroSlides"
    | "contentOrder"
    | "editorialGallery"
    | "links"
  >
>;
const storePreviewMode = new URLSearchParams(window.location.search).get("preview") === "1";
let activePreviewStore: { slug: string; store: Store } | null = null;
let previewReadyAnnounced = false;

function sanitizeStorePreviewPatch(value: unknown): StorePreviewPatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  const nullableStrings = [
    "tagline",
    "logoUrl",
    "bannerUrl",
    "backgroundColor",
    "backgroundImageUrl",
    "contactPhone",
    "contactEmail",
    "aboutText",
    "aboutImageUrl",
    "accentColor",
    "announcement",
    "promotionTitle",
    "promotionBody",
    "promotionCtaLabel",
    "promotionCtaUrl",
  ];

  if (typeof source.storeName === "string") clean.storeName = source.storeName.slice(0, 160);
  for (const key of nullableStrings) {
    const field = source[key];
    if (field === null || typeof field === "string") clean[key] = typeof field === "string" ? field.slice(0, 4000) : null;
  }
  if (["rounded", "pill", "square"].includes(String(source.buttonStyle))) clean.buttonStyle = source.buttonStyle;
  if (["mono", "modern", "editorial", "friendly"].includes(String(source.fontStyle))) clean.fontStyle = source.fontStyle;
  if (["solid", "outline", "soft"].includes(String(source.buttonVariant))) clean.buttonVariant = source.buttonVariant;
  if (["lift", "pulse", "none"].includes(String(source.buttonMotion))) clean.buttonMotion = source.buttonMotion;
  if (typeof source.cartButtonLabel === "string") clean.cartButtonLabel = source.cartButtonLabel.slice(0, 36);
  if (["chalkboard", "kraft", "painted"].includes(String(source.boardTexture))) clean.boardTexture = source.boardTexture;
  if (["static", "marquee"].includes(String(source.announcementMode))) clean.announcementMode = source.announcementMode;
  if (Number.isInteger(source.announcementSpeed)) {
    clean.announcementSpeed = Math.min(40, Math.max(8, source.announcementSpeed as number));
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
    const allowedSections = ["hero", "products", "about", "gallery", "links"];
    const order = source.contentOrder.filter((section): section is string => typeof section === "string" && allowedSections.includes(section));
    if (order.length === allowedSections.length && new Set(order).size === allowedSections.length) clean.contentOrder = order;
  }
  if (Array.isArray(source.editorialGallery)) {
    clean.editorialGallery = source.editorialGallery
      .filter((image): image is Record<string, unknown> => !!image && typeof image === "object" && !Array.isArray(image))
      .map((image) => ({
        imageUrl: typeof image.imageUrl === "string" && /^\/v1\/uploads\//.test(image.imageUrl) ? image.imageUrl : "",
        caption: typeof image.caption === "string" ? image.caption.slice(0, 180) : "",
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

function renderStore(slug: string, store: Store) {
  activeHeroCleanup?.();
  activeHeroCleanup = null;
  currentStoreSlug = slug;
  if (storePreviewMode) activePreviewStore = { slug, store };
  document.body.classList.add("store-page");
  const currency = store.items[0]?.currency ?? "BOB";

  // Storefront branding is per-store, not per-page — set it fresh on every render so
  // switching between two different stores in one browser never bleeds one store's
  // background/logo into another's page. This sets the *page* background (the space
  // around the cards), not the cards themselves — those stay on --pg-bg, the normal
  // light/dark surface color, so they read as cards sitting on the merchant's page
  // rather than the whole storefront changing color scheme.
  document.documentElement.style.setProperty("--pg-page-bg", store.backgroundColor || "");
  const backgroundImageUrl = assetUrl(store.backgroundImageUrl);
  document.documentElement.style.setProperty("--pg-page-bg-image", backgroundImageUrl ? `url("${backgroundImageUrl}")` : "none");
  // Keep the store identity as plain typography rather than wrapping it in a
  // panel. When it sits over a photo, CSS uses light text and a restrained
  // shadow to preserve contrast without adding another visual container.
  document.body.classList.toggle("has-bg-image", !!backgroundImageUrl);
  // A merchant-chosen background PHOTO is meant to sit behind content that
  // assumes dark text — force the light text/border palette so it doesn't
  // collide with a visitor's dark-mode browser. backgroundColor is
  // deliberately excluded here: it's only ever a brief flash color before an
  // image loads (see the dashboard's own copy on this field) — with no image,
  // El Tablero's board texture paints the persistent background instead, and
  // that's always dark, so switching to the light (dark-text) palette on
  // backgroundColor alone would put dark text on a dark board.
  if (backgroundImageUrl) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  // A merchant-chosen accent recolors every highlight (chips, title gradient,
  // links, pay button). Only the one hex comes from the API — the companion
  // soft/ring shades derive from it in CSS via color-mix (see
  // body.has-custom-accent in style.css), so they stay readable in either theme.
  if (store.accentColor) {
    const effectiveAccent = clampAccentLightness(store.accentColor);
    document.documentElement.style.setProperty("--pg-accent", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-2", effectiveAccent);
    document.documentElement.style.setProperty("--pg-accent-contrast", accentContrastColor(effectiveAccent));
  } else {
    const palette = DEFAULT_ACCENT_PALETTES[backgroundImageUrl ? "light" : "dark"];
    document.documentElement.style.setProperty("--pg-accent", palette.accent);
    document.documentElement.style.setProperty("--pg-accent-2", palette.accent2);
    document.documentElement.style.setProperty("--pg-accent-contrast", palette.contrast);
  }
  document.body.classList.toggle("has-custom-accent", !!store.accentColor);
  document.body.dataset.fontStyle = store.fontStyle || "mono";
  // Corner treatment ("rounded" | "pill" | "square") is a pure-CSS switch.
  document.body.dataset.buttonStyle = store.buttonStyle || "rounded";
  document.body.dataset.buttonVariant = store.buttonVariant || "solid";
  document.body.dataset.buttonMotion = store.buttonMotion || "lift";
  // Board ground material ("chalkboard" | "kraft" | "painted") — pure-CSS
  // switch, same pattern as buttonStyle above.
  document.body.dataset.boardTexture = store.boardTexture || "chalkboard";
  const logoUrl = assetUrl(store.logoUrl);
  const bannerUrl = assetUrl(store.bannerUrl);
  const heroSlides = (store.heroSlides ?? [])
    .map((slide) => ({ ...slide, resolvedMediaUrl: assetUrl(slide.imageUrl) }))
    .filter((slide): slide is typeof slide & { resolvedMediaUrl: string } => !!slide.resolvedMediaUrl)
    .slice(0, 5);

  // Search + sort earn their keep as soon as there's more than one product;
  // a single-item store still renders without any toolbar chrome at all.
  const showToolbar = store.items.length > 1 || store.categories.length > 0;

  // Defense-in-depth on top of the API's http(s)-only validation — these
  // land in an href on a customer's page, so re-check the scheme here too.
  const safeLinks = store.links.filter((l) => /^https?:\/\//i.test(l.url));

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
  const defaultContentOrder = ["hero", "products", "about", "gallery", "links"] as const;
  const requestedContentOrder = Array.isArray(store.contentOrder) ? store.contentOrder : [];
  const validContentOrder = requestedContentOrder.filter(
    (section, index) => defaultContentOrder.includes(section) && requestedContentOrder.indexOf(section) === index,
  );
  const contentOrder = [
    ...validContentOrder,
    ...defaultContentOrder.filter((section) => !validContentOrder.includes(section)),
  ];
  const editorialImages = (store.editorialGallery ?? [])
    .map((image) => ({ ...image, resolvedImageUrl: assetUrl(image.imageUrl) }))
    .filter((image): image is typeof image & { resolvedImageUrl: string } => !!image.resolvedImageUrl)
    .slice(0, 8);

  const announcementMode = store.announcementMode === "marquee" ? "marquee" : "static";
  const announcementDuration = Math.min(40, Math.max(8, Number(store.announcementSpeed) || 18));
  const announcementHtml =
    store.announcement && hasReadableContent(store.announcement)
      ? announcementMode === "marquee"
        ? `<div class="store-announcement marquee" style="--marquee-duration:${announcementDuration}s" aria-label="${escapeHtml(store.announcement)}">
            <div class="store-announcement-track">
              <span class="store-announcement-copy">${escapeHtml(store.announcement)}</span>
              <span class="store-announcement-copy" aria-hidden="true">${escapeHtml(store.announcement)}</span>
            </div>
          </div>`
        : `<div class="store-announcement">${escapeHtml(store.announcement)}</div>`
      : "";

  const safePromotionUrl = store.promotionCtaUrl && /^https?:\/\//i.test(store.promotionCtaUrl) ? store.promotionCtaUrl : null;
  const promotionDismissKey = `pagosya_promotion_dismissed_${store.storeId}`;
  let promotionWasDismissed = false;
  try {
    promotionWasDismissed = sessionStorage.getItem(promotionDismissKey) === "1";
  } catch {
    // A locked-down browser may block sessionStorage; the close button still works.
  }
  const showPromotion =
    !!store.promotionEnabled &&
    (!!store.promotionTitle || !!store.promotionBody) &&
    (storePreviewMode || !promotionWasDismissed);
  const promotionHtml = showPromotion
    ? `<div class="promotion-backdrop" data-promotion-backdrop>
        <section class="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
          <button type="button" class="promotion-close" aria-label="Cerrar promoción">×</button>
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

  const heroHtml = heroSlides.length
    ? `<section class="store-carousel" aria-label="Destacados de ${escapeHtml(store.storeName)}" aria-roledescription="carrusel">
        <div class="store-carousel-viewport">
          ${heroSlides
            .map((slide, index) => {
              const safeCtaUrl = slide.ctaUrl && /^https?:\/\//i.test(slide.ctaUrl) ? slide.ctaUrl : null;
              const hasCopy = !!(slide.title || slide.body || slide.ctaLabel);
              return `<article class="store-slide ${index === 0 ? "active" : ""}" data-slide-index="${index}" aria-hidden="${index === 0 ? "false" : "true"}">
                ${
                  isVideoMediaUrl(slide.resolvedMediaUrl)
                    ? `<video src="${escapeHtml(slide.resolvedMediaUrl)}" aria-label="${escapeHtml(slide.title || `Destacado ${index + 1}`)}" muted loop playsinline preload="metadata"></video>`
                    : `<img src="${escapeHtml(slide.resolvedMediaUrl)}" alt="${escapeHtml(slide.title || `Destacado ${index + 1}`)}">`
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
      ? `<div class="store-hero has-banner"><img class="store-banner" src="${escapeHtml(bannerUrl)}" alt="" /></div>`
      : "";

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
        ${
          store.categories.length > 0
            ? `<div class="store-category-filter">
                <button type="button" class="category-chip-filter ${selectedCategoryId === "ALL" ? "active" : ""}" data-category="ALL">Todos</button>
                ${store.categories
                  .map(
                    (category) =>
                      `<button type="button" class="category-chip-filter ${selectedCategoryId === category.id ? "active" : ""}" data-category="${escapeHtml(category.id)}">${escapeHtml(category.name)}</button>`,
                  )
                  .join("")}
                ${
                  store.items.some((item) => item.categoryId === null)
                    ? `<button type="button" class="category-chip-filter ${selectedCategoryId === "null" ? "active" : ""}" data-category="null">Otros</button>`
                    : ""
                }
              </div>`
            : ""
        }
      </div>`
    : "";

  const productsHtml = `<section class="store-products" aria-label="Productos">
    ${toolbarHtml}
    <div id="store-grid"></div>
    <div class="cart-bar">
      <span class="cart-summary"></span>
      <button class="primary" id="cart-pay">${escapeHtml(store.cartButtonLabel || "Ir a pagar")}</button>
    </div>
  </section>`;

  const aboutHtml = aboutParagraphs.length
    ? `<section class="store-about${aboutImageUrl ? " has-image" : ""}" aria-labelledby="store-about-title"${aboutImageUrl ? ` style="--store-about-image:url(&quot;${escapeHtml(aboutImageUrl)}&quot;)"` : ""}>
        <div class="store-about-heading"><h2 id="store-about-title">Nuestra historia</h2></div>
        <div class="store-about-body">${aboutParagraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
      </section>`
    : "";

  const editorialGalleryHtml = editorialImages.length
    ? `<section class="store-editorial-gallery" aria-labelledby="store-gallery-title">
        <h2 id="store-gallery-title">Más de nuestra tienda</h2>
        <div class="store-editorial-grid">
          ${editorialImages
            .map(
              (image, index) => `<figure class="store-editorial-item">
                <img src="${escapeHtml(image.resolvedImageUrl)}" alt="${escapeHtml(image.caption || `Imagen de la tienda ${index + 1}`)}" loading="lazy">
                ${image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : ""}
              </figure>`,
            )
            .join("")}
        </div>
      </section>`
    : "";

  const linksHtml = safeLinks.length
    ? `<section class="store-footer" aria-labelledby="store-links-title">
        <h2 class="store-footer-label" id="store-links-title">Síguenos</h2>
        <div class="store-links">${safeLinks
          .map((link) => {
            const icon = linkIcon(link);
            return `<a class="store-link-btn${icon ? " has-icon" : ""}" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${icon ? `<span class="store-link-icon">${icon}</span>` : ""}${escapeHtml(link.label)}</a>`;
          })
          .join("")}</div>
      </section>`
    : "";

  const sectionHtml = {
    hero: heroHtml,
    products: productsHtml,
    about: aboutHtml,
    gallery: editorialGalleryHtml,
    links: linksHtml,
  };
  const orderedSectionsHtml = contentOrder.map((section) => sectionHtml[section]).join("");

  app.innerHTML = `
    ${announcementHtml}
    <header class="merchant-header">
      ${logoUrl ? `<img class="merchant-header-logo" src="${escapeHtml(logoUrl)}" alt="">` : ""}
      <div class="merchant-header-copy">
        <div class="store-title">${escapeHtml(store.storeName)}</div>
        ${store.tagline ? `<div class="store-tagline">${escapeHtml(store.tagline)}</div>` : ""}
      </div>
    </header>
    ${orderedSectionsHtml}
    <div class="secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
    ${promotionHtml}
  `;

  activePromotionCleanup?.();
  activePromotionCleanup = null;
  document.body.classList.toggle("promotion-open", showPromotion);
  if (showPromotion) {
    const backdrop = app.querySelector<HTMLElement>("[data-promotion-backdrop]")!;
    const closeButton = backdrop.querySelector<HTMLButtonElement>(".promotion-close")!;
    const dismissPromotion = () => {
      backdrop.remove();
      document.body.classList.remove("promotion-open");
      if (!storePreviewMode) {
        try {
          sessionStorage.setItem(promotionDismissKey, "1");
        } catch {
          // The visual dismissal still succeeds when storage is unavailable.
        }
      }
      document.removeEventListener("keydown", onPromotionKeydown);
      activePromotionCleanup = null;
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
    activePromotionCleanup = () => document.removeEventListener("keydown", onPromotionKeydown);
    closeButton.focus();
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
    carousel.querySelectorAll<HTMLButtonElement>(".hero-catalog-cta").forEach((button) =>
      button.addEventListener("click", () => app.querySelector("#store-grid")?.scrollIntoView({ behavior: "smooth", block: "start" })),
    );
    showSlide(0);
    startAutoplay();
    activeHeroCleanup = () => {
      stopAutoplay();
      slides.forEach((slide) => slide.querySelector<HTMLVideoElement>("video")?.pause());
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

  app.querySelectorAll<HTMLElement>(".category-chip-filter").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedCategoryId = chip.dataset.category!;
      app.querySelectorAll(".category-chip-filter").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderStoreGrid(slug, store, currency);
    });
  });

  const payButton = app.querySelector<HTMLButtonElement>("#cart-pay");
  payButton?.addEventListener("click", async () => {
    payButton.disabled = true;
    payButton.textContent = "Procesando...";
    try {
      const items = [...cart.entries()].map(([key, quantity]) => ({ ...parseCartItemKey(key), quantity }));
      const result = await checkoutCart(slug, items);
      linkHeader = {
        storeName: result.storeName,
        description: result.cartDescription,
        contactPhone: result.contactPhone,
        contactEmail: result.contactEmail,
      };
      // Checkout for this cart is now underway — clear it so a buyer who returns to the
      // same storefront link later doesn't see an already-paid cart still populated.
      cart.clear();
      saveCart(store);
      await enterPaymentFlow(result.clientSecret);
    } catch (err) {
      app.innerHTML = `<div class="status failed">${ICON_X}<span>No se pudo iniciar el pago: ${escapeHtml((err as Error).message)}</span></div>`;
    }
  });

  renderStoreGrid(slug, store, currency);
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
    renderStore(activePreviewStore.slug, { ...activePreviewStore.store, ...patch });
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
          ${section.name ? `<div class="category-section-title">${escapeHtml(section.name)}</div>` : ""}
          <div class="store-items">${section.items.map((item) => renderProductCard(item, cardIndex++)).join("")}</div>`,
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
        img.style.opacity = "1";
      }, 130);
      card.querySelectorAll(".gallery-thumb-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  grid.querySelectorAll<HTMLElement>(".store-item").forEach((row) => {
    const id = row.dataset.id!;
    const item = store.items.find((i) => i.id === id)!;
    row.querySelector<HTMLSelectElement>(".variant-select")?.addEventListener("change", (event) => {
      selectedVariantByItem.set(id, (event.currentTarget as HTMLSelectElement).value);
      renderStoreGrid(slug, store, currency);
    });
    row.querySelector(".qty-plus")?.addEventListener("click", () => {
      if (item.stock !== null && productCartQuantity(id) >= item.stock) return;
      const selectedVariant = selectedVariantFor(item);
      const key = cartItemKey(id, selectedVariant?.id);
      const available = optionStock(item, selectedVariant);
      if (available !== null && (cart.get(key) ?? 0) >= available) return;
      cart.set(key, (cart.get(key) ?? 0) + 1);
      saveCart(store);
      renderStoreGrid(slug, store, currency);
      updateCartBar(store, currency);
    });
    row.querySelector(".qty-minus")?.addEventListener("click", () => {
      const key = cartItemKey(id, selectedVariantFor(item)?.id);
      const next = (cart.get(key) ?? 0) - 1;
      if (next <= 0) cart.delete(key);
      else cart.set(key, next);
      saveCart(store);
      renderStoreGrid(slug, store, currency);
      updateCartBar(store, currency);
    });
  });

  updateCartBar(store, currency);
}

function updateCartBar(store: Store, currency: string): void {
  const summary = app.querySelector<HTMLElement>(".cart-summary");
  const payButton = app.querySelector<HTMLButtonElement>("#cart-pay");
  if (summary) {
    summary.textContent = `${cartCount()} ${cartCount() === 1 ? "producto" : "productos"} — ${formatAmount(cartTotal(store.items), currency)}`;
  }
  if (payButton) payButton.disabled = cartCount() === 0;
  const cartBar = app.querySelector<HTMLElement>(".cart-bar");
  if (cartBar) cartBar.hidden = cartCount() === 0;
}

function renderForm(session: CheckoutSession, clientSecret: string) {
  const tokens = TEST_TOKENS[selectedType];

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
    ${headerHtml}
    <form id="payment-form" novalidate>
      <div class="field">
        <label for="customerName">Nombre completo</label>
        <input id="customerName" type="text" autocomplete="name" placeholder="Nombre y apellido" value="${escapeHtml(customerContact.name)}" aria-describedby="customerNameError"${invalid("customerName")} />
        ${fieldError("customerName")}
      </div>
      <div class="field">
        <label for="customerEmail">Correo electrónico</label>
        <input id="customerEmail" type="email" autocomplete="email" placeholder="tu@correo.com" value="${escapeHtml(customerContact.email)}" aria-describedby="customerEmailError"${invalid("customerEmail")} />
        ${fieldError("customerEmail")}
      </div>
      <div class="field">
        <label for="customerPhone">Teléfono de contacto</label>
        <input id="customerPhone" type="tel" autocomplete="tel" placeholder="+591 700 00000" value="${escapeHtml(customerContact.phone)}" aria-describedby="customerPhoneError" enterkeyhint="done"${invalid("customerPhone")} />
        ${fieldError("customerPhone")}
        <div class="hint">El comercio usará estos datos para contactarte sobre tu pedido.</div>
      </div>
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
    </form>
    <div class="secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;

  const nameInput = app.querySelector<HTMLInputElement>("#customerName")!;
  const emailInput = app.querySelector<HTMLInputElement>("#customerEmail")!;
  const phoneInput = app.querySelector<HTMLInputElement>("#customerPhone")!;
  nameInput.addEventListener("input", () => (customerContact.name = nameInput.value));
  emailInput.addEventListener("input", () => (customerContact.email = emailInput.value));
  phoneInput.addEventListener("input", () => (customerContact.phone = phoneInput.value));

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

    const name = customerContact.name.trim();
    const email = customerContact.email.trim();
    const phone = customerContact.phone.trim();
    if (!name) contactFieldErrors.customerName = "Ingresa tu nombre completo.";
    if (!email) contactFieldErrors.customerEmail = "Ingresa tu correo electrónico.";
    else if (!EMAIL_PATTERN.test(email)) contactFieldErrors.customerEmail = "Ingresa un correo electrónico válido.";
    if (!phone) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto.";
    else if (!PHONE_PATTERN.test(phone)) contactFieldErrors.customerPhone = "Ingresa un teléfono de contacto válido.";

    if (contactFieldErrors.customerName || contactFieldErrors.customerEmail || contactFieldErrors.customerPhone) {
      renderForm(session, clientSecret);
      return;
    }

    const tokenEl = app.querySelector<HTMLSelectElement>("#token");
    const token = tokenEl ? tokenEl.value : TEST_TOKENS[selectedType][0].value;
    await submitPayment(session, clientSecret, token, { name, email, phone });
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
      <div class="status failed">${ICON_X}<span>Pago cancelado</span></div>
      ${contactBlockHtml("¿Necesitas ayuda?")}
      ${backToStoreHtml()}
    `;
    postToParent("PAYMENT_CANCELED", { paymentIntentId: intent.id });
  } catch (err) {
    // The intent may have already moved past a cancelable state (e.g. a
    // confirm that was in flight completed first) — re-fetch and show what
    // actually happened instead of a misleading "canceled" screen.
    try {
      const session = await fetchSession(clientSecret);
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

// The cart is already cleared by the time a customer reaches the payment
// form, so a failed/canceled screen is otherwise a dead end — this is the
// one way back, a fresh load of the same store link.
function backToStoreHtml(): string {
  if (!currentStoreSlug) return "";
  return `<a class="back-to-store" href="?link=${encodeURIComponent(currentStoreSlug)}">Volver a la tienda</a>`;
}

function renderSuccess(order: OrderSummary) {
  const cart = (order.metadata?.cart as CartLine[] | undefined) ?? null;

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
    <div class="status success">${ICON_CHECK}<span>Pedido recibido</span></div>
    <div class="receipt">
      <div class="receipt-row">
        <span class="muted-label">N° de orden</span>
        <code>${escapeHtml(order.id)}</code>
      </div>
      <div class="receipt-items">${linesHtml}</div>
      <div class="receipt-row receipt-subtotal">
        <span>Subtotal</span>
        <strong>${formatAmount(order.amount, order.currency)}</strong>
      </div>
      ${contactBlockHtml("¿Dudas o necesitas un reembolso?")}
    </div>
  `;
  postToParent("PAYMENT_SUCCEEDED", { paymentIntentId: order.id, status: "succeeded" });
}

function renderFailed(paymentIntentId: string, message: string) {
  app.innerHTML = `
    <div class="status failed">${ICON_X}<span>Pago fallido: ${escapeHtml(message)}</span></div>
    ${contactBlockHtml("¿Necesitas ayuda?")}
    ${backToStoreHtml()}
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
    <div class="status action">${ICON_CLOCK}<span>${message}</span></div>
    ${qrImageHtml}
    ${import.meta.env.DEV ? `<button class="secondary" id="simulate">[dev] Simular confirmación exitosa</button>` : ""}
  `;

  if (import.meta.env.DEV) {
    app.querySelector<HTMLButtonElement>("#simulate")!.addEventListener("click", async () => {
      await simulateRailCallback(railId, paymentIntentId, "succeeded");
      const updated = await fetchSession(clientSecret);
      renderSuccess(updated);
    });
  }
}

main();
