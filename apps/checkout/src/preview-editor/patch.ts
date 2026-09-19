/** Sanitizes the store patches the Studio editor posts into the preview. */
import { Store, StoreItem, type StoreAnimation } from "../api";
import { sanitizeSiteDocument, type StoreSiteDocument } from "../site-document";
import { state } from "../state";
import { storePreviewMode } from "../preview-mode";
import { safeStoreMapEmbedUrl } from "../storefront/locations";
import { STORE_MOTION_EXPERIENCES, isStoreMotionExperience } from "../storefront/motion";

export type StorePreviewPatch = Partial<
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

export const STORE_PREVIEW_LEGACY_SITE_FIELDS = [
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
export function changedLegacySiteTextPatch(patch: StorePreviewPatch, previous: Store): StorePreviewPatch {
  const changed = { ...patch };
  for (const key of STORE_PREVIEW_LEGACY_SITE_FIELDS) {
    if (key in patch && patch[key] === previous[key]) delete changed[key];
  }
  return changed;
}

export function sanitizeStorePreviewProduct(value: unknown, store: Store): StoreItem | null {
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
      .slice(0, 64)
      .map((variant, index) => ({
        id: typeof variant.id === "string" ? variant.id.slice(0, 200) : `preview-variant-${index}`,
        ...(Array.isArray(variant.options) && variant.options.length <= 6 && variant.options.every(option=>option && typeof option.name==='string' && typeof option.value==='string') ? {options:variant.options.map(option=>({name:option.name.slice(0,40),value:option.value.slice(0,40)}))}:{}),
        ...(typeof variant.imageUrl==='string' ? {imageUrl:variant.imageUrl.slice(0,1000)}:{}),
        name: typeof variant.name === "string" ? variant.name.slice(0, 140) : `Opción ${index + 1}`,
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
        ...(typeof extra.pickCount === "number" && Number.isInteger(extra.pickCount) && extra.pickCount >= 1 ? { pickCount: Math.min(24, extra.pickCount) } : {}),
        ...(typeof extra.productId === "string" ? { productId: extra.productId.slice(0, 40) } : {}),
        ...(typeof extra.imageUrl === "string" ? { imageUrl: extra.imageUrl.slice(0, 1000) } : {}),
      }));
  }
  return preview;
}

export function sanitizeStorePreviewPatch(value: unknown): StorePreviewPatch | null {
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
      ?? sanitizeSiteDocument(state.activePreviewRenderedStore?.siteDocument ?? state.activePreviewStore?.store.siteDocument);
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

export function standaloneStorePreviewPatch(): StorePreviewPatch | null {
  if (!storePreviewMode || !window.location.hash) return null;
  const serialized = new URLSearchParams(window.location.hash.slice(1)).get("proposal");
  if (!serialized) return null;
  try {
    return sanitizeStorePreviewPatch(JSON.parse(serialized));
  } catch {
    return null;
  }
}
