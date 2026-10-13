import { cartItemKey } from "../cart-state";
import { Store, assetUrl, StoreItem, StoreLink, type StoreAnimation } from "../api";
import { postToParent } from "../postmessage";
import { sanitizeSiteDocument, type StoreSiteDocument, normalizeStorefrontSiteContentOrder } from "../site-document";
import { state } from "../state";
import { storePreviewMode, storeEditorMode } from "../preview-mode";
import { app } from "../ui/app";
import { cart, optionStock, optionCartQuantity, remainingStock, saveCart, selectedVariantFor, selectedExtrasFor, productConfigurationComplete, selectedExtraIdsByItem, selectedVariantByItem } from "../cart/cart";
import { categoryIdFromLocation, productPageUrl, storeCatalogUrl, categoryPageUrl, storeCollectionUrl } from "./routes";
import { productImagePosition, catalogSectionsForStore, storeImagePosition, consumeStoreContentOnce, type CatalogSection, sortStoreItems, itemMatchesSearch } from "./catalog";
import { publicStoreLocations } from "./locations";
import { escapeHtml } from "../ui/html";
import { ICON_EXTERNAL, ICON_LOCK, ICON_WHATSAPP, ICON_ARROW_LEFT, ICON_ARROW_RIGHT, ICON_INSTAGRAM } from "../ui/icons";
import { applyStoreTheme, applyStoreSectionBackgrounds } from "./theme";
import { storefrontHeaderHtml, storeAnnouncementHtml, storefrontFooterHtml, bindStoreAnnouncementPlayback } from "./chrome";
import { previewBlueprintButton, bindPreviewBlueprints } from "../preview-editor/blueprints";
import { isVideoMediaUrl, bindHorizontalDragScroll } from "../ui/media";
import { STORE_MOTION_EXPERIENCES } from "./motion";
import { accentContrastColor } from "../ui/color";
import { annotateStorePreviewEditor } from "../preview-editor/annotate";
import { renderProductCard } from "./product-card";
import { bindTimedDiscountSchedule, bindInternalStoreLinks, navigateWithinStore } from "./navigation";
import { bindCartCheckout } from "../cart/cart-review-dialog";
import { updateCartBar } from "../cart/cart-bar";
import { storeFidelityImageHtml } from "./store-fidelity-media";
import { storeHeroHtml, bindStoreHeroCarousel } from "./store-hero";
import { storePromotionHtml, bindStorePromotion } from "./store-promotion";
import { renderedCopyKey, storeMotionSectionEntry } from "./store-motion-sections";
import { storeContactHtml, bindStoreContactWidget, bindStoreNewsletterForm, bindStoreContactForm } from "./store-contact";
import { storeAppointmentsHtml, bindStoreAppointmentForm } from "./store-appointments";
import { storeLocationHtml, bindStoreLocationsToggle } from "./store-location-section";
import { storeBespokeSectionRenderer } from "./store-bespoke-sections";
import { bindStoreMotionScenes } from "./store-motion-scenes";
import { bindStoreTextEffects, bindStoreScrollMotion } from "./store-scroll-motion";

export { bindStoreContactWidget };

/** Debounces the legacy catalog search analytics event (G1). */
let searchAnalyticsTimer: ReturnType<typeof setTimeout> | undefined;

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

  const fidelityImageHtml = storeFidelityImageHtml(store);
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
  const promotionHtml = storePromotionHtml(store, showPromotion, promotionImageUrl);

  const carouselHtml = storeHeroHtml(store, heroSlides, visibleStoreName, bannerUrl, fidelityImageHtml);
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
  const catalogTitleKey = renderedCopyKey(siteSection("catalog")?.title || store.catalogTitle?.trim() || "");
  const catalogBodyKey = renderedCopyKey(siteSection("catalog")?.body || store.catalogSubtitle?.trim() || "");
  const motionSectionHtmlByKey = Object.fromEntries(animationInstances.map((animation) => storeMotionSectionEntry(animation, { slug, store, fidelityImageHtml, catalogTitleKey, catalogBodyKey })));
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

  const contactHtml = storeContactHtml(store, siteSection);

  const appointmentsHtml = storeAppointmentsHtml(store);

  const locationHtml = storeLocationHtml(store, locations, siteSection);

  const renderBespokeSection = storeBespokeSectionRenderer({
    siteDocument,
    siteSectionsForPage,
    visibleStoreName,
    fidelityImageHtml,
    carouselHtml,
    editorialGalleryHtml,
    productsHtml,
    appointmentsHtml,
    contactHtml,
    locationHtml,
    linksHtml,
  });

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

  bindStoreLocationsToggle();

  bindStoreNewsletterForm(slug);

  bindStoreContactForm(slug, store);

  bindStoreAppointmentForm(slug);

  bindStoreAnnouncementPlayback();
  bindTimedDiscountSchedule(slug, store);

  bindStorePromotion(showPromotion, options);

  app.querySelectorAll<HTMLButtonElement>(".hero-catalog-cta").forEach((button) =>
    button.addEventListener("click", () => {
      const target = app.querySelector<HTMLElement>(".catalog-section-picker")
        ?? app.querySelector<HTMLElement>("#store-grid")
        ?? app.querySelector<HTMLElement>(".store-products");
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    }),
  );

  bindStoreHeroCarousel();
  bindStoreMotionScenes();
  bindStoreTextEffects();
  bindStoreScrollMotion();

  const searchInput = app.querySelector<HTMLInputElement>("#store-search");
  searchInput?.addEventListener("input", () => {
    state.searchQuery = searchInput.value;
    renderStoreGrid(slug, store, currency, activeCatalogProductIds);
    // G1: one search event once the shopper pauses; the words never leave the page.
    clearTimeout(searchAnalyticsTimer);
    searchAnalyticsTimer = setTimeout(() => { if (searchInput.value.trim().length >= 2) state.activeStoreAnalytics?.record({ type: "search" }); }, 1500);
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
