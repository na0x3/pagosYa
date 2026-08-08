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

const app = document.getElementById("app")!;
let selectedType: PaymentMethodType = PaymentMethodType.CARD;
let linkHeader: LinkHeader | null = null;
// Survives renderForm() re-renders (e.g. switching payment method tabs) so
// typed contact info isn't lost mid-checkout.
const customerContact: CustomerContact = { name: "", email: "", phone: "" };
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
      const store = await fetchStore(linkSlug);
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
    app.innerHTML = `<div class="status failed">No se pudo cargar el pago: ${(err as Error).message}</div>`;
    return;
  }

  postToParent("CHECKOUT_READY", {});
  renderForm(session, clientSecret);
  observeResize(app);
}

// paymentLinkId -> quantity, persisted to localStorage (see loadCart/saveCart) keyed by
// storeId — a merchant can run several independent stores, so the cart must follow the
// particular store a customer is shopping, not bleed across the merchant's other stores.
const cart = new Map<string, number>();

// renderStore() re-runs on every qty +/- click (full re-render, not a patch)
// — the staggered entrance animation should only ever play once, on the
// real first paint, not replay/flash on every cart interaction.
let hasStoreAnimatedIn = false;

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
  try {
    const raw = localStorage.getItem(cartStorageKey(store.storeId));
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, number>;
    for (const [id, qty] of Object.entries(saved)) {
      // Drop entries for items archived/deleted since the cart was saved, and any
      // corrupt values — a stale or tampered cart must never crash the storefront.
      const item = store.items.find((i) => i.id === id);
      if (!item || !Number.isInteger(qty) || qty <= 0) continue;
      // Stock may have dropped (or hit 0) since this cart was saved — never
      // reopen a store showing more of something in-cart than is available.
      const clamped = item.stock !== null ? Math.min(qty, item.stock) : qty;
      if (clamped > 0) cart.set(id, clamped);
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
  return items.reduce((sum, item) => sum + item.amount * (cart.get(item.id) ?? 0), 0);
}

function cartCount(): number {
  return [...cart.values()].reduce((sum, qty) => sum + qty, 0);
}

function renderProductCard(item: StoreItem, index: number): string {
  const qty = cart.get(item.id) ?? 0;
  const images = item.imageUrls.map(assetUrl).filter((u): u is string => !!u);
  const soldOut = item.stock === 0;
  const atStockLimit = item.stock !== null && qty >= item.stock;
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
    : item.stock !== null
      ? `<div class="stock-note">Quedan ${item.stock}</div>`
      : "";

  return `
    <div class="store-item ${soldOut ? "sold-out" : ""}" data-id="${item.id}"${staggerStyle}>
      ${galleryHtml}
      <div class="store-item-info">
        ${tagsHtml}
        <div class="store-item-name">${item.color ? `<span class="store-item-color" style="background:${escapeHtml(item.color)}" title="${escapeHtml(item.color)}"></span>` : ""}${escapeHtml(item.name)}</div>
        ${item.description ? `<div class="store-item-description">${escapeHtml(item.description)}</div>` : ""}
        <div class="store-item-price">${formatAmount(item.amount, item.currency)}${stockNote}</div>
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

function renderStore(slug: string, store: Store) {
  document.body.classList.add("store-page");
  if (store.items.length === 0) {
    app.innerHTML = `<div class="status empty">Esta tienda no tiene productos disponibles todavía.</div>`;
    return;
  }
  const currency = store.items[0].currency;

  // Storefront branding is per-store, not per-page — set it fresh on every render so
  // switching between two different stores in one browser never bleeds one store's
  // background/logo into another's page. This sets the *page* background (the space
  // around the cards), not the cards themselves — those stay on --pg-bg, the normal
  // light/dark surface color, so they read as cards sitting on the merchant's page
  // rather than the whole storefront changing color scheme.
  document.documentElement.style.setProperty("--pg-page-bg", store.backgroundColor || "");
  const backgroundImageUrl = assetUrl(store.backgroundImageUrl);
  document.documentElement.style.setProperty("--pg-page-bg-image", backgroundImageUrl ? `url("${backgroundImageUrl}")` : "none");
  // The header (store name/tagline, not inside a card) gets a frosted-glass
  // backdrop whenever there's a photo behind it — a plain color swap can't
  // guarantee contrast against an arbitrary photo, but light glass + dark
  // text reads fine regardless of what's underneath.
  document.body.classList.toggle("has-bg-image", !!backgroundImageUrl);
  // A merchant-chosen background (color or photo) is meant to sit behind
  // content that assumes dark text — force the light text/border palette so
  // it doesn't collide with a visitor's dark-mode browser (--pg-text would
  // otherwise stay near-white, unreadable against it).
  if (store.backgroundColor || backgroundImageUrl) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  // A merchant-chosen accent recolors every highlight (chips, title gradient,
  // links, pay button). Only the one hex comes from the API — the companion
  // soft/ring shades derive from it in CSS via color-mix (see
  // body.has-custom-accent in style.css), so they stay readable in either theme.
  if (store.accentColor) document.documentElement.style.setProperty("--pg-accent", store.accentColor);
  else document.documentElement.style.removeProperty("--pg-accent");
  document.body.classList.toggle("has-custom-accent", !!store.accentColor);
  // Corner treatment ("rounded" | "pill" | "square") is a pure-CSS switch.
  document.body.dataset.buttonStyle = store.buttonStyle || "rounded";
  const logoUrl = assetUrl(store.logoUrl);
  const bannerUrl = assetUrl(store.bannerUrl);

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

  app.innerHTML = `
    ${store.announcement ? `<div class="store-announcement">${escapeHtml(store.announcement)}</div>` : ""}
    ${
      bannerUrl || logoUrl
        ? `<div class="store-hero ${bannerUrl ? "has-banner" : ""}">
            ${bannerUrl ? `<img class="store-banner" src="${escapeHtml(bannerUrl)}" alt="" />` : ""}
            ${logoUrl ? `<img class="merchant-logo" src="${escapeHtml(logoUrl)}" alt="" />` : ""}
          </div>`
        : ""
    }
    <div class="merchant-header">
      <div class="store-title">${escapeHtml(store.storeName)}</div>
      ${store.tagline ? `<div class="store-tagline">${escapeHtml(store.tagline)}</div>` : ""}
    </div>
    ${
      aboutParagraphs.length
        ? `<section class="store-about">
            <svg class="store-about-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            <div class="store-about-title">Nuestra historia</div>
            <div class="store-about-body">${aboutParagraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</div>
          </section>`
        : ""
    }
    ${
      showToolbar
        ? `<div class="store-toolbar">
            <div class="store-toolbar-row">
              <div class="store-search-field">
                <svg class="store-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="search" id="store-search" class="store-search" placeholder="Buscar productos..." value="${escapeHtml(searchQuery)}" />
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
                        (c) =>
                          `<button type="button" class="category-chip-filter ${selectedCategoryId === c.id ? "active" : ""}" data-category="${c.id}">${escapeHtml(c.name)}</button>`,
                      )
                      .join("")}
                    ${
                      store.items.some((i) => i.categoryId === null)
                        ? `<button type="button" class="category-chip-filter ${selectedCategoryId === "null" ? "active" : ""}" data-category="null">Otros</button>`
                        : ""
                    }
                  </div>`
                : ""
            }
          </div>`
        : ""
    }
    <div id="store-grid"></div>
    <div class="cart-bar">
      <span class="cart-summary"></span>
      <button class="primary" id="cart-pay">Ir a pagar</button>
    </div>
    ${
      safeLinks.length
        ? `<div class="store-footer">
            <div class="store-footer-label">Síguenos</div>
            <div class="store-links">${safeLinks
              .map((l) => {
                const icon = linkIcon(l);
                return `<a class="store-link-btn${icon ? " has-icon" : ""}" href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${icon ? `<span class="store-link-icon">${icon}</span>` : ""}${escapeHtml(l.label)}</a>`;
              })
              .join("")}</div>
          </div>`
        : ""
    }
    <div class="secure-note">${ICON_LOCK}<span>Pago procesado de forma segura por pagosYa</span></div>
  `;

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
      const items = [...cart.entries()].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity }));
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
    grid.innerHTML = `<div class="status empty">No encontramos productos que coincidan con tu búsqueda.</div>`;
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
    row.querySelector(".qty-plus")?.addEventListener("click", () => {
      const next = (cart.get(id) ?? 0) + 1;
      if (item.stock !== null && next > item.stock) return;
      cart.set(id, next);
      saveCart(store);
      renderStoreGrid(slug, store, currency);
      updateCartBar(store, currency);
    });
    row.querySelector(".qty-minus")?.addEventListener("click", () => {
      const next = (cart.get(id) ?? 0) - 1;
      if (next <= 0) cart.delete(id);
      else cart.set(id, next);
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

  app.innerHTML = `
    ${headerHtml}
    <div class="field">
      <label for="customerName">Nombre completo</label>
      <input id="customerName" type="text" autocomplete="name" placeholder="Nombre y apellido" value="${escapeHtml(customerContact.name)}" />
    </div>
    <div class="field">
      <label for="customerEmail">Correo electrónico</label>
      <input id="customerEmail" type="email" autocomplete="email" placeholder="tu@correo.com" value="${escapeHtml(customerContact.email)}" />
    </div>
    <div class="field">
      <label for="customerPhone">Teléfono de contacto</label>
      <input id="customerPhone" type="tel" autocomplete="tel" placeholder="+591 700 00000" value="${escapeHtml(customerContact.phone)}" />
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
    <div class="field">
      <label for="token">Token de prueba (modo test)</label>
      <select id="token">
        ${tokens.map((t) => `<option value="${t.value}">${t.label}</option>`).join("")}
      </select>
      <div class="hint">En producción este campo lo reemplaza el rail real (tokenización de tarjeta, deep link Tigo Money, etc).</div>
    </div>
    <div class="field-error" id="contactError"></div>
    <button class="primary" id="pay">Pagar ${formatAmount(session.amount, session.currency)}</button>
    <button class="secondary" id="cancel">Cancelar pago</button>
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

  app.querySelector<HTMLButtonElement>("#pay")!.addEventListener("click", async () => {
    const contactError = app.querySelector<HTMLElement>("#contactError")!;
    const name = customerContact.name.trim();
    const email = customerContact.email.trim();
    const phone = customerContact.phone.trim();
    if (!name || !email || !phone) {
      contactError.textContent = "Completa tu nombre, correo y teléfono para continuar.";
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      contactError.textContent = "Ingresa un correo electrónico válido.";
      return;
    }
    if (!PHONE_PATTERN.test(phone)) {
      contactError.textContent = "Ingresa un teléfono de contacto válido.";
      return;
    }
    contactError.textContent = "";

    const token = app.querySelector<HTMLSelectElement>("#token")!.value;
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
    app.innerHTML = `<div class="status failed">${ICON_X}<span>Pago cancelado</span></div>`;
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

function renderSuccess(order: OrderSummary) {
  const cart = (order.metadata?.cart as CartLine[] | undefined) ?? null;

  const linesHtml = cart
    ? cart
        .map(
          (line) => `
        <div class="receipt-line">
          <span>${escapeHtml(line.name)} <span class="receipt-qty">x${line.quantity}</span></span>
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
      ${
        linkHeader?.contactPhone || linkHeader?.contactEmail
          ? `<div class="receipt-contact">
              <span>¿Dudas o necesitas un reembolso?</span>
              ${linkHeader.contactPhone ? `<a href="${escapeHtml(whatsAppLink(linkHeader.contactPhone))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}
              ${linkHeader.contactEmail ? `<a href="mailto:${escapeHtml(linkHeader.contactEmail)}">${escapeHtml(linkHeader.contactEmail)}</a>` : ""}
            </div>`
          : ""
      }
    </div>
  `;
  postToParent("PAYMENT_SUCCEEDED", { paymentIntentId: order.id, status: "succeeded" });
}

function renderFailed(paymentIntentId: string, message: string) {
  app.innerHTML = `<div class="status failed">${ICON_X}<span>Pago fallido: ${message}</span></div>`;
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
