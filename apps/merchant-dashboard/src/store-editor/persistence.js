// @ts-check

/** @typedef {Record<string, any>} JsonObject */

const SECTION_FAMILIES = new Set(["editorial", "cinematic", "product-led", "minimal"]);
/** @type {Readonly<Record<string, string>>} */
const FAMILY_BY_COMPOSITION = Object.freeze({
  "editorial-split": "editorial",
  "narrative-offset": "editorial",
  "spatial-cascade": "cinematic",
  "gallery-axis": "cinematic",
  "collection-rail": "product-led",
  "material-ledger": "product-led",
  "catalog-poster": "product-led",
  "quiet-monument": "minimal",
  "studio-index": "minimal",
});

/** @param {unknown} value @param {number} limit */
function boundedText(value, limit) {
  return Array.from(String(value ?? "").trim()).slice(0, limit).join("");
}

/** @param {unknown} value */
function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

/** @param {unknown} value */
function optionalProperty(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

/** @param {unknown} value @returns {JsonObject[]} */
function objectList(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === "object")
    : [];
}

/** @param {JsonObject} section @param {JsonObject | null} document */
function resolvedSectionFamily(section, document) {
  if (SECTION_FAMILIES.has(section.family)) return section.family;
  return FAMILY_BY_COMPOSITION[String(document?.designGenome?.composition || "")] || "editorial";
}

/** @param {JsonObject} block @param {number} [depth] @returns {JsonObject} */
function blockPayload(block, depth = 0) {
  return {
    id: boundedText(block.id, 48),
    kind: block.kind,
    slot: boundedText(block.slot, 32),
    role: block.role,
    text: boundedText(block.text, 600),
    mediaUrl: block.mediaUrl || null,
    ...(block.style && { style: { ...block.style } }),
    children: depth < 1
      ? objectList(block.children).slice(0, 8).map((child) => blockPayload(child, depth + 1))
      : [],
  };
}

/** @param {JsonObject} section @param {JsonObject | null} document @returns {JsonObject} */
function sectionPayload(section, document) {
  return {
    id: section.id,
    ...(section.pageId ? { pageId: section.pageId } : {}),
    ...(section.kind === "catalog" ? { productIds: [...new Set(section.productIds || [])].slice(0, 200) } : {}),
    kind: section.kind,
    title: boundedText(section.title, 120),
    body: boundedText(section.body, 600),
    ctaLabel: boundedText(section.ctaLabel, 40),
    layout: section.layout,
    width: section.width,
    ...(Number.isInteger(section.heightPx) && { heightPx: section.heightPx }),
    ...(Number.isInteger(section.mobileHeightPx) && { mobileHeightPx: section.mobileHeightPx }),
    align: section.align,
    motion: section.motion,
    family: resolvedSectionFamily(section, document),
    backgroundColor: section.backgroundColor,
    textColor: section.textColor,
    ...(section.titleStyle && { titleStyle: { ...section.titleStyle } }),
    ...(section.bodyStyle && { bodyStyle: { ...section.bodyStyle } }),
    mediaUrls: [...(section.mediaUrls || [])],
    items: objectList(section.items).map((item) => ({
      title: boundedText(item.title, 100),
      body: boundedText(item.body, 320),
      mediaUrl: item.mediaUrl || null,
      ...(item.titleStyle && { titleStyle: { ...item.titleStyle } }),
      ...(item.bodyStyle && { bodyStyle: { ...item.bodyStyle } }),
    })),
    blocks: objectList(section.blocks).slice(0, 16).map((block) => blockPayload(block)),
  };
}

/**
 * Convert one captured editor revision into the API settings contract. This
 * function intentionally has no access to DOM controls or legacy pending
 * variables: a save can only persist the snapshot returned by beginSave().
 * @param {JsonObject | null} snapshot
 * @returns {JsonObject}
 */
export function storeSettingsPayloadFromSnapshot(snapshot) {
  if (!snapshot) throw new Error("No hay un borrador de tienda para guardar");
  const document = snapshot.siteDocument && typeof snapshot.siteDocument === "object"
    ? snapshot.siteDocument
    : null;
  const locations = Array.isArray(snapshot.locations) ? snapshot.locations : [];
  const primaryLocation = locations[0];

  return {
    name: String(snapshot.storeName || ""),
    tagline: optionalText(snapshot.tagline),
    logoUrl: snapshot.logoUrl ?? null,
    bannerUrl: snapshot.bannerUrl ?? null,
    backgroundColor: snapshot.backgroundColor,
    contactPhone: optionalText(snapshot.contactPhone),
    contactEmail: optionalText(snapshot.contactEmail),
    contactFormEnabled: snapshot.contactFormEnabled === true,
    contactTitle: optionalText(snapshot.contactTitle),
    contactSubtitle: optionalText(snapshot.contactSubtitle),
    contactFormEmail: optionalText(snapshot.contactFormEmail),
    locationMapUrl: primaryLocation?.mapEmbedUrl || null,
    locationHighlight: primaryLocation?.highlight || null,
    locationDescription: primaryLocation?.description || null,
    locationTitle: optionalText(snapshot.locationTitle),
    locationSubtitle: optionalText(snapshot.locationSubtitle),
    locations: structuredClone(locations),
    aboutText: optionalText(snapshot.aboutText),
    aboutTitle: optionalText(snapshot.aboutTitle),
    aboutSubtitle: optionalText(snapshot.aboutSubtitle),
    aboutImageUrl: snapshot.aboutImageUrl ?? null,
    catalogTitle: optionalText(snapshot.catalogTitle),
    catalogSubtitle: optionalText(snapshot.catalogSubtitle),
    galleryTitle: optionalText(snapshot.galleryTitle),
    gallerySubtitle: optionalText(snapshot.gallerySubtitle),
    linksTitle: optionalText(snapshot.linksTitle),
    announcement: optionalText(snapshot.announcement),
    announcementMode: snapshot.announcementMode,
    announcementSpeed: Number(snapshot.announcementSpeed) || 18,
    announcementSize: snapshot.announcementSize,
    announcementColor: snapshot.announcementColor,
    announcementFont: snapshot.announcementFont,
    announcementEffect: snapshot.announcementEffect,
    promotionEnabled: snapshot.promotionEnabled === true,
    promotionImageUrl: snapshot.promotionImageUrl ?? null,
    promotionTitle: optionalText(snapshot.promotionTitle),
    promotionBody: optionalText(snapshot.promotionBody),
    promotionCtaLabel: optionalText(snapshot.promotionCtaLabel),
    promotionCtaUrl: optionalText(snapshot.promotionCtaUrl),
    heroSlides: objectList(snapshot.heroSlides).map((slide) => ({
      imageUrl: slide.imageUrl,
      ...(optionalProperty(slide.title) && { title: optionalProperty(slide.title) }),
      ...(optionalProperty(slide.body) && { body: optionalProperty(slide.body) }),
      ...(optionalProperty(slide.ctaLabel) && { ctaLabel: optionalProperty(slide.ctaLabel) }),
      ...(optionalProperty(slide.ctaUrl) && { ctaUrl: optionalProperty(slide.ctaUrl) }),
    })),
    siteSections: objectList(document?.sections).map((section) => sectionPayload(section, document)),
    siteArtDirection: document?.artDirection || undefined,
    sitePages: objectList(document?.pages).map((page) => ({
      id: boundedText(page.id, 48),
      label: boundedText(page.label, 40),
      slug: String(page.slug || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48),
    })),
    siteNavigation: document?.navigation ? {
      layout: document.navigation.layout || "brand-left",
      barStyle: "full",
      brandPosition: document.navigation.brandPosition || (document.navigation.layout === "centered" ? "center" : "left"),
      navPosition: document.navigation.navPosition || (document.navigation.layout === "split" ? "left" : "center"),
      searchPosition: document.navigation.searchPosition || "right",
      profilePosition: document.navigation.profilePosition || "right",
      cartPosition: document.navigation.cartPosition || "right",
      ...(document.navigation.brandStyle && { brandStyle: { ...document.navigation.brandStyle } }),
      ...(document.navigation.taglineStyle && { taglineStyle: { ...document.navigation.taglineStyle } }),
      sticky: document.navigation.sticky !== false,
      transparent: document.navigation.transparent === true,
      logoTreatment: document.navigation.logoTreatment || "wordmark",
    } : undefined,
    siteNavigationItems: document?.navigation ? objectList(document.navigation.items).map((item) => ({
      id: boundedText(item.id, 48),
      label: boundedText(item.label, 40),
      target: item.target,
      ...(item.target === "section" && item.sectionId ? { sectionId: item.sectionId } : {}),
      ...(item.target === "page" && item.pageId ? { pageId: item.pageId } : {}),
      ...(item.style && { style: { ...item.style } }),
    })) : undefined,
    siteFooter: document?.footer ? {
      enabled: document.footer.enabled !== false,
      brandDescription: boundedText(document.footer.brandDescription, 320),
      columns: objectList(document.footer.columns).slice(0, 4).map((column) => ({
        id: boundedText(column.id, 48),
        title: boundedText(column.title, 60),
        items: objectList(column.items).slice(0, 8).map((item) => ({
          id: boundedText(item.id, 48),
          label: boundedText(item.label, 100),
          href: String(item.href || "").trim().slice(0, 500),
        })),
      })),
      copyright: boundedText(document.footer.copyright, 160),
      badge: boundedText(document.footer.badge, 80),
      ...(document.footer.newsletter ? { newsletter: {
        enabled: document.footer.newsletter.enabled !== false,
        title: boundedText(document.footer.newsletter.title, 80),
        body: boundedText(document.footer.newsletter.body, 240),
        buttonLabel: boundedText(document.footer.newsletter.buttonLabel, 40),
        successMessage: boundedText(document.footer.newsletter.successMessage, 120),
      } } : {}),
    } : undefined,
    siteCatalogMenuStyle: document?.merchandising?.collectionMenuStyle || "tabs",
    siteCatalogCollections: objectList(document?.merchandising?.collections).slice(0, 12).map((collection) => ({
      id: boundedText(collection.id, 48),
      name: boundedText(collection.name, 60),
      productIds: [...new Set((collection.productIds || []).map((/** @type {unknown} */ id) => String(id)))].slice(0, 200),
    })),
    siteDeletedSectionIds: [...new Set((document?.deletedSectionIds || []).map((/** @type {unknown} */ id) => boundedText(id, 48)))].filter(Boolean).slice(0, 10),
    contentOrder: [...(snapshot.contentOrder || [])],
    sectionBackgrounds: { ...(snapshot.sectionBackgrounds || {}) },
    experienceStyle: snapshot.experienceStyle,
    motionDuoEnabled: snapshot.motionDuoEnabled === true,
    motionExperience: snapshot.motionExperience || "clarity-marquee",
    motionExperiences: [...(snapshot.motionExperiences || [])],
    animations: structuredClone(snapshot.animations || []),
    editorialGallery: objectList(snapshot.editorialGallery).map((image) => ({
      imageUrl: image.imageUrl,
      ...(image.productId && { productId: image.productId }),
      ...(optionalProperty(image.title) && { title: optionalProperty(image.title) }),
      ...(optionalProperty(image.caption) && { caption: optionalProperty(image.caption) }),
      ...(optionalProperty(image.body) && { body: optionalProperty(image.body) }),
      boxColor: image.boxColor,
    })),
    layoutStyle: snapshot.layoutStyle,
    accentColor: snapshot.accentColor ?? null,
    fontStyle: snapshot.fontStyle,
    buttonStyle: snapshot.buttonStyle,
    buttonVariant: snapshot.buttonVariant,
    buttonMotion: snapshot.buttonMotion,
    cartButtonLabel: String(snapshot.cartButtonLabel || "").trim() || "Ir a pagar",
    checkoutMode: snapshot.checkoutMode,
    leadCaptureUrl: snapshot.leadCaptureUrl ?? null,
    cartRecommendationsEnabled: snapshot.cartRecommendationsEnabled === true,
    cartRecommendationProductIds: [...(snapshot.cartRecommendationProductIds || [])],
    showLowStockToCustomers: snapshot.showLowStockToCustomers === true,
    links: structuredClone(snapshot.links || []),
  };
}
