/** The store header, footer, and announcement bar. */
import { Store, assetUrl } from "../api";
import { sanitizeSiteDocument } from "../site-document";
import { state } from "../state";
import { storePreviewMode, storeOwnerMode } from "../preview-mode";
import { escapeHtml, hasReadableContent } from "../ui/html";
import { accentContrastColor } from "../ui/color";
import { storeCatalogUrl, storePreviewFragment, storePageUrl, storeCollectionUrl } from "./routes";
import { cartCount } from "../cart/cart";
import { productImagePosition } from "./catalog";
import { canvasTextStyleAttributes } from "./motion";
import { ICON_CHEVRON_DOWN, ICON_SEARCH, ICON_PERSON, ICON_BAG } from "../ui/icons";
import { app } from "../ui/app";


export function announcementLetteringHtml(text: string, effect: NonNullable<Store["announcementEffect"]>): string {
  if (effect === "none") return escapeHtml(text);
  return Array.from(text).map((character, index) => {
    const classes = character.trim() ? "store-announcement-letter" : "store-announcement-letter is-space";
    return `<span class="${classes}" style="--letter-index:${index}">${escapeHtml(character)}</span>`;
  }).join("");
}

export function storeAnnouncementHtml(store: Store): string {
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

export function storefrontHeaderHtml(
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

export function storefrontFooterHtml(store: Store): string {
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

export function bindStoreAnnouncementPlayback(): void {
  state.activeAnnouncementCleanup?.();
  state.activeAnnouncementCleanup = null;
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
  state.activeAnnouncementCleanup = () => {
    observer?.disconnect();
    document.removeEventListener("visibilitychange", syncPlayback);
  };
}
