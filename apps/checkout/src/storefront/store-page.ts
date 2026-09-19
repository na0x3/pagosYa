import { cartItemKey } from "../cart-state";
import { resolveSiteSectionFamily } from "@pagosya/shared-types";
import { Store, assetUrl, StoreLocation, submitStoreLead, StoreItem, StoreLink, type StoreAnimation, subscribeStoreNewsletter, fetchAppointmentAvailability, createAppointmentPayment } from "../api";
import { postToParent } from "../postmessage";
import { sanitizeSiteDocument, type StoreSiteDocument, normalizeStorefrontSiteContentOrder } from "../site-document";
import { state } from "../state";
import { storePreviewMode, storeEditorMode, type StorePreviewEditorSelection } from "../preview-mode";
import { app } from "../ui/app";
import { cart, optionStock, optionCartQuantity, remainingStock, saveCart, selectedVariantFor, selectedExtrasFor, productConfigurationComplete, discountedProductAmount, selectedExtraIdsByItem, salePriceHtml, selectedVariantByItem } from "../cart/cart";
import { categoryIdFromLocation, productPageUrl, storeCatalogUrl, categoryPageUrl, storeCollectionUrl } from "./routes";
import { productImagePosition, catalogSectionsForStore, storeImagePosition, consumeStoreContentOnce, type CatalogSection, sortStoreItems, itemMatchesSearch } from "./catalog";
import { publicStoreLocations, locationOpeningState, safeStoreMapEmbedUrl } from "./locations";
import { escapeHtml, initials, formatAmount } from "../ui/html";
import { ICON_EXTERNAL, ICON_LOCK, ICON_WHATSAPP, ICON_ARROW_LEFT, ICON_ARROW_RIGHT, ICON_INSTAGRAM, ICON_MAP_PIN } from "../ui/icons";
import { loadLeadEmail, saveLeadEmail } from "../checkout/customer-contact";
import { applyStoreTheme, applyStoreSectionBackgrounds } from "./theme";
import { storefrontHeaderHtml, storeAnnouncementHtml, storefrontFooterHtml, bindStoreAnnouncementPlayback } from "./chrome";
import { previewBlueprintButton, bindPreviewBlueprints } from "../preview-editor/blueprints";
import { isVideoMediaUrl, bindHorizontalDragScroll, playStoreVideo } from "../ui/media";
import { canvasTextStyleAttributes, STORE_MOTION_EXPERIENCES, storeAnimationMediaRequirement } from "./motion";
import { accentContrastColor } from "../ui/color";
import { syncStorePreviewEditorSelection } from "../preview-editor/selection";
import { applyAnimationCopySceneLayout } from "../preview-editor/editor-base";
import { annotateStorePreviewEditor } from "../preview-editor/annotate";
import { renderProductCard } from "./product-card";
import { bindTimedDiscountSchedule, bindInternalStoreLinks, navigateWithinStore } from "./navigation";
import { bindCartCheckout } from "../cart/cart-review-dialog";
import { updateCartBar } from "../cart/cart-bar";

export function bindStoreContactWidget(): void {
  const widget = app.querySelector<HTMLElement>("[data-store-contact-widget]");
  if (!widget) return;
  const toggle = widget.querySelector<HTMLButtonElement>("[data-contact-toggle]");
  const panel = widget.querySelector<HTMLElement>("[data-contact-panel]");
  const close = widget.querySelector<HTMLButtonElement>("[data-contact-close]");
  if (!toggle || !panel || !close) return;
  const setOpen = (open: boolean, returnFocus = false) => {
    widget.dataset.contactOpen = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) requestAnimationFrame(() => panel.querySelector<HTMLElement>("input, textarea, button[type=submit]")?.focus());
    else if (returnFocus) toggle.focus();
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false, true));
  widget.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && widget.dataset.contactOpen === "true") setOpen(false, true);
  });
}

export function renderStore(slug: string, store: Store, options: { focusPromotion?: boolean } = {}) {
  state.activeHeroCleanup?.();
  state.activeHeroCleanup = null;
  state.activeStoreExperienceCleanup?.();
  state.activeStoreExperienceCleanup = null;
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
  if (state.activeCatalogStoreId !== store.storeId) {
    state.activeCatalogStoreId = store.storeId;
    state.searchQuery = "";
    state.selectedCategoryId = categoryIdFromLocation() ?? "ALL";
    state.sortMode = "featured";
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
  if (activeCatalogProductIds !== null || (state.selectedCollectionId !== "ALL" && !catalogCollections.some((collection) => collection.id === state.selectedCollectionId))) state.selectedCollectionId = "ALL";
  // The editorial-maker grammar is a shop-first journal: after the animated
  // campaign opening, shoppers should meet actual products rather than a
  // second navigation layer made of category cards. Category headings still
  // organize the product grid and the normal catalog URL behavior is preserved
  // for every other composition grammar.
  const usesDirectEditorialCatalog = siteDocument?.designGenome.composition === "editorial-maker";
  const hasCatalogSectionPicker = !usesDirectEditorialCatalog && store.categories.length > 0 && catalogSections.length > 0;
  if (hasCatalogSectionPicker && state.selectedCategoryId !== "ALL" && !catalogSections.some((section) => section.id === state.selectedCategoryId)) {
    state.selectedCategoryId = "ALL";
  }
  const selectedCatalogSection = catalogSections.find((section) => section.id === state.selectedCategoryId) ?? null;
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
            <input type="search" id="store-search" class="store-search" placeholder="Buscar productos..." aria-label="Buscar productos" value="${escapeHtml(state.searchQuery)}" />
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
    ? `<nav class="store-collection-menu is-${collectionMenuStyle}" role="tablist" aria-label="Colecciones de productos"><button id="store-collection-tab-ALL" type="button" role="tab" data-store-collection="ALL" aria-selected="${state.selectedCollectionId === "ALL"}" aria-controls="store-grid" tabindex="${state.selectedCollectionId === "ALL" ? "0" : "-1"}">Todo</button>${catalogCollections.map((collection) => `<button id="store-collection-tab-${escapeHtml(collection.id)}" type="button" role="tab" data-store-collection="${escapeHtml(collection.id)}" aria-selected="${state.selectedCollectionId === collection.id}" aria-controls="store-grid" tabindex="${state.selectedCollectionId === collection.id ? "0" : "-1"}">${escapeHtml(collection.name)}</button>`).join("")}</nav>`
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
          <div id="store-grid" role="tabpanel" aria-labelledby="store-collection-tab-${escapeHtml(state.selectedCollectionId)}"></div>
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
    ? `<section class="store-about${aboutImageUrl ? " has-image" : ""}${state.hasStoreAnimatedIn ? "" : " story-intro"}" aria-labelledby="store-about-title"${aboutImageUrl ? ` style="--store-about-image:url(&quot;${escapeHtml(aboutImageUrl)}&quot;);--store-about-position:${storeImagePosition(store, store.aboutImageUrl)}"` : ""}>
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
    ? `<section class="store-contact-section store-contact-widget" id="store-contact" data-store-contact-widget aria-labelledby="store-contact-title">
        <button class="store-contact-launcher" id="store-contact-toggle" type="button" data-contact-toggle aria-controls="store-contact-panel" aria-expanded="false" aria-label="Abrir formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 7.4 7.4 0 0 1-3.2-.72L5 19.5l1.22-3.15A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span>Contacto</span></button>
        <div class="store-contact-panel" id="store-contact-panel" data-contact-panel hidden>
          <div class="store-contact-heading">
            <div class="store-contact-copy">
              <h2 id="store-contact-title">${escapeHtml(siteSection("contact")?.title || store.contactTitle?.trim() || "¿Tienes una pregunta?")}</h2>
              <p>${escapeHtml(siteSection("contact")?.body || store.contactSubtitle?.trim() || `Escríbele directamente al equipo de ${store.storeName}. La tienda recibirá tu pregunta desde pagosYa y podrá responder a tu correo.`)}</p>
            </div>
            <button class="store-contact-close" type="button" data-contact-close aria-label="Cerrar formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </div>
          <form class="store-contact-form" id="store-contact-form">
          <div class="field"><label for="store-contact-name">Nombre <span class="store-contact-optional">(opcional)</span></label><input id="store-contact-name" name="name" autocomplete="name" maxlength="120" placeholder="Cómo te llamas"></div>
          <div class="field"><label for="store-contact-email">Tu Gmail o correo</label><input id="store-contact-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(loadLeadEmail(store.storeId))}" placeholder="tunombre@gmail.com" aria-describedby="store-contact-email-help" required><small id="store-contact-email-help" class="store-contact-field-help">La tienda usará este correo para responderte.</small></div>
          <div class="field"><label for="store-contact-phone">WhatsApp (opcional)</label><input id="store-contact-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
          <div class="field store-contact-message"><label for="store-contact-message">Tu pregunta</label><textarea id="store-contact-message" name="message" maxlength="600" rows="5" placeholder="Escribe aquí lo que quieres consultar…" required></textarea></div>
          <div class="store-contact-actions"><button class="primary" type="submit">Enviar pregunta</button><span class="store-contact-status" role="status" aria-live="polite"></span></div>
          </form>
        </div>
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
  bindStoreContactWidget();

  const dragScrollCleanups = Array.from(app.querySelectorAll<HTMLElement>("[data-store-drag-scroll]")).map(bindHorizontalDragScroll);
  if (dragScrollCleanups.length) {
    state.activeStoreExperienceCleanup = () => {
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
        phone: String(data.get("phone") || "").trim() || undefined,
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

  state.activePromotionCleanup?.();
  state.activePromotionCleanup = null;
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
      state.activePromotionCleanup = null;
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
    state.activePromotionCleanup = () => {
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
      if (slides.length > 1 && !prefersReducedMotion && !autoplayPausedByUser && !state.storePreviewEditorEnabled) {
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
    state.activeHeroCleanup = () => {
      stopAutoplay();
      document.removeEventListener("visibilitychange", syncCarouselVisibility);
      slides.forEach((slide) => slide.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }

  const editorSceneIndexFor = (container: HTMLElement, count: number) => {
    if (!state.storePreviewEditorEnabled || !state.storePreviewEditorSelection?.animationId || !Number.isInteger(state.storePreviewEditorSelection.itemIndex)) return 0;
    const section = container.closest<HTMLElement>(".store-motion-section[data-animation-id]");
    if (section?.dataset.animationId !== state.storePreviewEditorSelection.animationId) return 0;
    return Math.min(Math.max(state.storePreviewEditorSelection.itemIndex!, 0), Math.max(count - 1, 0));
  };

  const selectEditorAnimationScene = (container: HTMLElement, itemIndex: number) => {
    if (!state.storePreviewEditorEnabled || !Number.isInteger(itemIndex)) return;
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
    state.storePreviewEditorSelection = selection;
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
    const priorCleanup = state.activeStoreExperienceCleanup as (() => void) | null;
    state.activeStoreExperienceCleanup = () => {
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      magnetic.removeEventListener("pointermove", move);
      magnetic.removeEventListener("pointerleave", reset);
    };
  });

  const libraryMotionCleanups: Array<() => void> = [];
  const reduceLibraryMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  app.querySelectorAll<HTMLElement>("[data-draggable-cards]").forEach((container) => {
    if (state.storePreviewEditorEnabled) return;
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
      if (state.storePreviewEditorEnabled || !modal || !content || !Number.isInteger(index)) return;
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
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
    if (!current || values.length < 2 || reduceTextMotion || state.storePreviewEditorEnabled) return;
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
    if (reduceTextMotion || state.storePreviewEditorEnabled || typeof IntersectionObserver !== "function") {
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
    const play = () => { if (!reduceTextMotion && !state.storePreviewEditorEnabled && !document.hidden) try { svg.unpauseAnimations(); } catch {} };
    if (reduceTextMotion || state.storePreviewEditorEnabled) { pause(); return; }
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => entry.isIntersecting ? play() : pause(), { threshold: .05 })
      : null;
    observer?.observe(svg);
    const onVisibility = () => document.hidden ? pause() : play();
    document.addEventListener("visibilitychange", onVisibility);
    textEffectCleanups.push(() => { pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); });
  });

  if (textEffectCleanups.length) {
    const priorCleanup = state.activeStoreExperienceCleanup as (() => void) | null;
    state.activeStoreExperienceCleanup = () => {
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
        const hasEditorScene = state.storePreviewEditorEnabled
          && state.storePreviewEditorSelection?.animationId === sequence.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(state.storePreviewEditorSelection?.itemIndex);
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
        const hasEditorScene = state.storePreviewEditorEnabled
          && state.storePreviewEditorSelection?.animationId === chapters.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(state.storePreviewEditorSelection?.itemIndex);
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
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
    state.activeStoreExperienceCleanup = () => {
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
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
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
    state.searchQuery = searchInput.value;
    renderStoreGrid(slug, store, currency, activeCatalogProductIds);
  });

  const sortSelect = app.querySelector<HTMLSelectElement>("#store-sort");
  if (sortSelect) {
    // Restore the previous choice — renderStore() fully re-renders the shell,
    // and the sort shouldn't silently reset when that happens.
    sortSelect.value = state.sortMode;
    sortSelect.addEventListener("change", () => {
      state.sortMode = sortSelect.value as typeof state.sortMode;
      renderStoreGrid(slug, store, currency, activeCatalogProductIds);
    });
  }

  const collectionTabs = Array.from(app.querySelectorAll<HTMLButtonElement>("[data-store-collection]"));
  const selectCollectionTab = (button: HTMLButtonElement, focus = false) => {
    state.selectedCollectionId = button.dataset.storeCollection || "ALL";
    collectionTabs.forEach((candidate) => {
      const active = candidate === button;
      candidate.setAttribute("aria-selected", String(active));
      candidate.tabIndex = active ? 0 : -1;
    });
    app.querySelector("#store-grid")?.setAttribute("aria-labelledby", button.id);
    if (!storePreviewMode) {
      window.history.pushState(
        { pagosyaView: "collection", collectionId: state.selectedCollectionId },
        "",
        storeCollectionUrl(slug, state.selectedCollectionId),
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
    state.selectedCategoryId = nextCategoryId;
    state.searchQuery = "";
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
  state.hasStoreAnimatedIn = true;
  if (storePreviewMode && !state.previewReadyAnnounced) {
    state.previewReadyAnnounced = true;
    postToParent("CHECKOUT_READY", { mode: "store-preview" });
  }
}

/**
 * Renders just the product grid + cart bar total — split out from
 * renderStore() so typing in the search box or clicking a category chip
 * never touches (and so never loses focus/scroll on) the surrounding
 * toolbar, header, or cart bar shell.
 */
export function renderStoreGrid(slug: string, store: Store, currency: string, visibleProductIds: Set<string> | null = null): void {
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

  const query = state.searchQuery.trim().toLowerCase();
  const siteDocument = sanitizeSiteDocument(store.siteDocument);
  const selectedCollection = state.selectedCollectionId === "ALL"
    ? null
    : siteDocument?.merchandising.collections?.find((collection) => collection.id === state.selectedCollectionId) ?? null;
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
    .filter((section) => state.selectedCategoryId === "ALL" || section.id === state.selectedCategoryId)
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
          ${section.name && state.selectedCategoryId === "ALL" ? `<div class="category-section-title">${escapeHtml(section.name)}</div>` : ""}
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
      const selected = (selectedExtraIdsByItem.get(id) ?? []).filter(extraId => extraId !== input.dataset.extraId);
      if (input.checked) selected.push(input.dataset.extraId!);
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
