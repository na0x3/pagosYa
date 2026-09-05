import {
  STORE_SITE_DENSITIES,
  STORE_SITE_DISPLAY_SCALES,
  STORE_SITE_EXPERIENCE_PLACEMENTS,
  STORE_SITE_FONT_ROLES,
  STORE_SITE_HEADER_ACTION_POSITIONS,
  STORE_SITE_HEADER_POSITIONS,
  STORE_SITE_IMAGE_TREATMENTS,
  STORE_SITE_LOGO_TREATMENTS,
  STORE_SITE_MOTION_INTENSITIES,
  STORE_SITE_NAV_LAYOUTS,
  STORE_SITE_PRODUCT_LAYOUTS,
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_KINDS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
  STORE_SITE_SHADOW_STYLES,
  STORE_SITE_SIGNATURE_EXPERIENCES,
  STORE_SITE_SPOTLIGHT_LAYOUTS,
  STORE_SITE_TEXT_EXPERIENCES,
  SITE_SECTION_BLOCK_KINDS,
  SITE_SECTION_BLOCK_ROLES,
  SITE_SECTION_FAMILIES,
  deriveLegacySiteSectionBlocks,
  isSiteArtDirection,
  resolveSiteSectionFamily,
  sanitizeSiteDesignGenome,
  siteSectionBlockSlotIsSupported,
  type SiteSectionBlock,
  type StoreCanvasTextStyle,
  type StoreSiteDocument,
  type StoreSiteFooter,
  type StoreSiteNavigationItem,
  type StoreSitePage,
} from "@pagosya/shared-types";

export const SITE_SECTION_KINDS = STORE_SITE_SECTION_KINDS;
const SITE_SECTION_LAYOUTS = STORE_SITE_SECTION_LAYOUTS;
const SITE_SECTION_WIDTHS = STORE_SITE_SECTION_WIDTHS;
const SITE_SECTION_ALIGNS = STORE_SITE_SECTION_ALIGNS;
const SITE_SECTION_MOTIONS = STORE_SITE_SECTION_MOTIONS;
const SITE_FONT_ROLES = STORE_SITE_FONT_ROLES;
const SITE_HEADER_ACTION_POSITIONS = STORE_SITE_HEADER_ACTION_POSITIONS;
const SITE_HEADER_POSITIONS = STORE_SITE_HEADER_POSITIONS;
const SITE_NAV_LAYOUTS = STORE_SITE_NAV_LAYOUTS;
const SITE_PRODUCT_LAYOUTS = STORE_SITE_PRODUCT_LAYOUTS;
const SITE_SHADOWS = STORE_SITE_SHADOW_STYLES;
const SITE_DISPLAY_SCALES = STORE_SITE_DISPLAY_SCALES;
const SITE_DENSITIES = STORE_SITE_DENSITIES;
const SITE_IMAGE_TREATMENTS = STORE_SITE_IMAGE_TREATMENTS;
const SITE_LOGO_TREATMENTS = STORE_SITE_LOGO_TREATMENTS;
const SITE_MOTION_INTENSITIES = STORE_SITE_MOTION_INTENSITIES;
const SITE_SPOTLIGHT_LAYOUTS = STORE_SITE_SPOTLIGHT_LAYOUTS;
const SITE_SIGNATURE_EXPERIENCES = STORE_SITE_SIGNATURE_EXPERIENCES;
const SITE_TEXT_EXPERIENCES = new Set<string>(STORE_SITE_TEXT_EXPERIENCES);
const SITE_EXPERIENCE_PLACEMENTS = STORE_SITE_EXPERIENCE_PLACEMENTS;

export type {
  StoreCanvasTextStyle,
  StoreSiteDocument,
  StoreSiteFooter,
  StoreSiteFooterItem,
  StoreSiteNavigationItem,
  StoreSitePage,
} from "@pagosya/shared-types";

const LEGACY_CONTENT_SECTION_KIND = {
  hero: "hero",
  products: "catalog",
  about: "story",
  gallery: "gallery",
  contact: "contact",
  location: "location",
  links: "links",
} as const;

/**
 * Resolve both historical (`hero`, `products`, ...) and current (`site-*`)
 * content-order entries onto the structured site document. The dashboard
 * performs the same migration for its editable preview; Checkout must do it
 * too so a newly applied AI proposal cannot reorder itself when it becomes
 * the public storefront.
 */
export function normalizeStorefrontSiteContentOrder(
  value: unknown,
  sections: StoreSiteDocument["sections"],
  animationSectionKeys: readonly string[],
  options: {
    signatureSectionKey?: string | null;
    signaturePlacement?: (typeof STORE_SITE_EXPERIENCE_PLACEMENTS)[number] | null;
  } = {},
): string[] {
  const siteSectionKeys = sections.map((section) => `site-${section.id}`);
  const allowedSiteSections = new Set(siteSectionKeys);
  const allowedAnimations = new Set(animationSectionKeys);
  const result: string[] = [];
  const append = (section: string) => {
    if (!result.includes(section)) result.push(section);
  };
  const requested = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const signatureWasExplicit = !!options.signatureSectionKey && requested.includes(options.signatureSectionKey);

  requested.forEach((entry) => {
    if (allowedSiteSections.has(entry) || allowedAnimations.has(entry)) {
      append(entry);
      return;
    }
    const kind = LEGACY_CONTENT_SECTION_KIND[entry as keyof typeof LEGACY_CONTENT_SECTION_KIND];
    if (kind) sections.filter((section) => section.kind === kind).forEach((section) => append(`site-${section.id}`));
  });

  siteSectionKeys.forEach(append);

  const missingAnimations = animationSectionKeys.filter((section) => !result.includes(section) && section !== options.signatureSectionKey);
  if (missingAnimations.length) {
    const linksKey = sections.find((section) => section.kind === "links");
    const linksIndex = linksKey ? result.indexOf(`site-${linksKey.id}`) : -1;
    result.splice(linksIndex < 0 ? result.length : linksIndex, 0, ...missingAnimations);
  }

  if (options.signatureSectionKey && allowedAnimations.has(options.signatureSectionKey) && !signatureWasExplicit) {
    const placementKind = options.signaturePlacement === "after-hero"
      ? "hero"
      : options.signaturePlacement === "after-story"
        ? "story"
        : "catalog";
    const placementSection = sections.find((section) => section.kind === placementKind);
    const placementIndex = placementSection ? result.indexOf(`site-${placementSection.id}`) : -1;
    result.splice(placementIndex < 0 ? result.length : placementIndex + 1, 0, options.signatureSectionKey);
  }

  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function color(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[—–]/g, "-").trim().slice(0, max) : "";
}

function mediaUrl(value: unknown): string | null {
  return typeof value === "string" && /^\/v1\/uploads\/[a-z0-9._-]+$/i.test(value) ? value : null;
}

function safeFooterHref(value: unknown): string {
  if (typeof value !== "string") return "";
  const href = value.trim().slice(0, 500);
  if (!href) return "";
  if (/^#[a-z][a-z0-9-]{0,63}$/i.test(href) || /^\/(?!\/)[^\s]*$/.test(href)) return href;
  try {
    const url = new URL(href);
    return ["https:", "mailto:", "tel:"].includes(url.protocol) ? href : "";
  } catch {
    return "";
  }
}

function sanitizePages(value: unknown): StoreSitePage[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const pages = value.slice(0, 6).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const source = entry as Record<string, unknown>;
    const id = text(source.id, 48);
    const label = text(source.label, 40);
    const slug = text(source.slug, 48).toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ids.has(id) || slugs.has(slug) || !label) return [];
    ids.add(id);
    slugs.add(slug);
    return [{ id, label, slug }];
  });
  return pages.length ? pages : undefined;
}

function sanitizeNavigationItems(value: unknown, sectionIds: Set<string>, pageIds: Set<string>): StoreSiteNavigationItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const items = value.slice(0, 8).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const source = entry as Record<string, unknown>;
    const id = text(source.id, 48);
    const label = text(source.label, 40);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id) || !label || !["home", "catalog", "section", "page"].includes(String(source.target))) return [];
    const target = source.target as StoreSiteNavigationItem["target"];
    const storedSectionId = text(source.sectionId, 48);
    const inferredSectionId = id.startsWith("section-") ? id.slice("section-".length) : "";
    const sectionId = inferredSectionId && sectionIds.has(inferredSectionId) ? inferredSectionId : storedSectionId;
    const pageId = text(source.pageId, 48);
    if (target === "section" && !sectionIds.has(sectionId)) return [];
    if (target === "page" && !pageIds.has(pageId)) return [];
    ids.add(id);
    return [{
      id,
      label,
      target,
      ...(target === "section" ? { sectionId } : {}),
      ...(target === "page" ? { pageId } : {}),
      ...(canvasTextStyle(source.style) ? { style: canvasTextStyle(source.style) } : {}),
    }];
  });
  return items.length ? items : undefined;
}

function sanitizeFooter(value: unknown): StoreSiteFooter | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.enabled !== "boolean") return undefined;
  const columnIds = new Set<string>();
  const columns = Array.isArray(source.columns) ? source.columns.slice(0, 4).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const column = entry as Record<string, unknown>;
    const id = text(column.id, 48);
    const title = text(column.title, 60);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || columnIds.has(id) || !title) return [];
    columnIds.add(id);
    const itemIds = new Set<string>();
    const items = Array.isArray(column.items) ? column.items.slice(0, 8).flatMap((entryItem) => {
      if (!entryItem || typeof entryItem !== "object" || Array.isArray(entryItem)) return [];
      const item = entryItem as Record<string, unknown>;
      const itemId = text(item.id, 48);
      const label = text(item.label, 100);
      if (!/^[a-z][a-z0-9-]*$/.test(itemId) || itemIds.has(itemId) || !label) return [];
      itemIds.add(itemId);
      return [{ id: itemId, label, href: safeFooterHref(item.href) }];
    }) : [];
    return [{ id, title, items }];
  }) : [];
  const newsletterSource = source.newsletter && typeof source.newsletter === "object" && !Array.isArray(source.newsletter)
    ? source.newsletter as Record<string, unknown>
    : null;
  const newsletter = newsletterSource && typeof newsletterSource.enabled === "boolean" ? {
    enabled: newsletterSource.enabled,
    title: text(newsletterSource.title, 80),
    body: text(newsletterSource.body, 240),
    buttonLabel: text(newsletterSource.buttonLabel, 40) || "Suscribirme",
    successMessage: text(newsletterSource.successMessage, 120) || "Listo. Ya estás en la lista.",
  } : undefined;
  return {
    enabled: source.enabled,
    brandDescription: text(source.brandDescription, 320),
    columns,
    copyright: text(source.copyright, 160),
    badge: text(source.badge, 80),
    ...(newsletter ? { newsletter } : {}),
  };
}

function canvasTextStyle(value: unknown): StoreCanvasTextStyle | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const style: StoreCanvasTextStyle = {};
  if (Number.isInteger(source.textScale) && Number(source.textScale) >= 50 && Number(source.textScale) <= 200) style.textScale = Number(source.textScale);
  if (Number.isInteger(source.textWidthPercent) && Number(source.textWidthPercent) >= 20 && Number(source.textWidthPercent) <= 100) style.textWidthPercent = Number(source.textWidthPercent);
  if (["left", "center", "right"].includes(String(source.textAlign))) style.textAlign = source.textAlign as StoreCanvasTextStyle["textAlign"];
  const textColor = color(source.textColor);
  if (textColor) style.textColor = textColor;
  if (["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(String(source.fontStyle))) style.fontStyle = source.fontStyle as StoreCanvasTextStyle["fontStyle"];
  if (Number.isInteger(source.textOffsetX) && Number(source.textOffsetX) >= -1000 && Number(source.textOffsetX) <= 1000) style.textOffsetX = Number(source.textOffsetX);
  if (Number.isInteger(source.textOffsetY) && Number(source.textOffsetY) >= -1000 && Number(source.textOffsetY) <= 1000) style.textOffsetY = Number(source.textOffsetY);
  if (source.textOffsetBasis === "element" || source.textOffsetBasis === "section") style.textOffsetBasis = source.textOffsetBasis;
  return Object.keys(style).length ? style : undefined;
}

function sectionHeight(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) >= 180 && Number(value) <= 1800
    ? Number(value)
    : undefined;
}

function sanitizeSectionBlocks(
  value: unknown,
  section: Omit<StoreSiteDocument["sections"][number], "blocks">,
): SiteSectionBlock[] | null {
  if (!Array.isArray(value) || value.length === 0) return deriveLegacySiteSectionBlocks(section);
  const ids = new Set<string>();
  const visit = (candidate: unknown, depth: number): SiteSectionBlock | null => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || depth > 1) return null;
    const source = candidate as Record<string, unknown>;
    const id = text(source.id, 48);
    const slot = text(source.slot, 32);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) return null;
    if (!enumValue(source.kind, SITE_SECTION_BLOCK_KINDS) || !enumValue(source.role, SITE_SECTION_BLOCK_ROLES)) return null;
    if (!siteSectionBlockSlotIsSupported(section.kind, slot)) return null;
    if (!Array.isArray(source.children) || source.children.length > 8) return null;
    if (depth === 1 && (source.kind === "group" || source.children.length)) return null;
    ids.add(id);
    const children = source.children.map((child) => visit(child, depth + 1));
    if (children.some((child) => !child)) return null;
    const normalizedMediaUrl = source.mediaUrl === null ? null : mediaUrl(source.mediaUrl);
    if (source.mediaUrl !== null && source.mediaUrl !== undefined && !normalizedMediaUrl) return null;
    return {
      id,
      kind: source.kind,
      slot,
      role: source.role,
      text: text(source.text, 600),
      mediaUrl: normalizedMediaUrl,
      ...(canvasTextStyle(source.style) ? { style: canvasTextStyle(source.style) } : {}),
      children: children as SiteSectionBlock[],
    };
  };
  const blocks = value.slice(0, 16).map((block) => visit(block, 0));
  return blocks.some((block) => !block) ? null : blocks as SiteSectionBlock[];
}

export function sanitizeSiteDocument(value: unknown): StoreSiteDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const theme = source.theme && typeof source.theme === "object" && !Array.isArray(source.theme) ? source.theme as Record<string, unknown> : null;
  const navigation = source.navigation && typeof source.navigation === "object" && !Array.isArray(source.navigation) ? source.navigation as Record<string, unknown> : null;
  const motion = source.motion && typeof source.motion === "object" && !Array.isArray(source.motion) ? source.motion as Record<string, unknown> : null;
  const merchandising = source.merchandising && typeof source.merchandising === "object" && !Array.isArray(source.merchandising) ? source.merchandising as Record<string, unknown> : null;
  const experience = source.experience && typeof source.experience === "object" && !Array.isArray(source.experience) ? source.experience as Record<string, unknown> : null;
  if (source.version !== 1 || !theme || !navigation || !Array.isArray(source.sections)) return null;
  const colors = [theme.pageBackground, theme.textColor, theme.accentColor, theme.secondaryColor, theme.surfaceColor, theme.mutedColor, theme.borderColor].map(color);
  if (colors.some((entry) => !entry)) return null;
  if (!enumValue(theme.headingFont, SITE_FONT_ROLES) || !enumValue(theme.bodyFont, SITE_FONT_ROLES) || !enumValue(theme.shadow, SITE_SHADOWS) || !enumValue(theme.productLayout, SITE_PRODUCT_LAYOUTS)) return null;
  if (!Number.isInteger(theme.radius) || Number(theme.radius) < 0 || Number(theme.radius) > 32) return null;
  if (!enumValue(navigation.layout, SITE_NAV_LAYOUTS) || typeof navigation.sticky !== "boolean" || typeof navigation.transparent !== "boolean") return null;
  const designGenome = sanitizeSiteDesignGenome(source.designGenome);
  const pages = sanitizePages(source.pages);
  const pageIds = new Set((pages ?? []).map((page) => page.id));
  const collectionIds = new Set<string>();
  const collections = Array.isArray(merchandising?.collections)
    ? merchandising.collections.slice(0, 12).flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
        const collection = candidate as Record<string, unknown>;
        const id = text(collection.id, 48);
        const name = text(collection.name, 60);
        if (!/^[a-z][a-z0-9-]*$/.test(id) || collectionIds.has(id) || !name) return [];
        collectionIds.add(id);
        const productIds = Array.isArray(collection.productIds)
          ? [...new Set(collection.productIds.flatMap((productId) => typeof productId === "string" && /^[a-z0-9_-]{1,200}$/i.test(productId) ? [productId] : []))].slice(0, 200)
          : [];
        return [{ id, name, productIds }];
      })
    : [];

  const ids = new Set<string>();
  const sections: StoreSiteDocument["sections"] = [];
  for (const entry of source.sections.slice(0, 16)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const section = entry as Record<string, unknown>;
    // Benefits was a generic platform explainer that appeared in every early
    // AI site. Retire it at read time so already-saved sites lose it too.
    if (section.kind === "benefits") continue;
    const id = text(section.id, 48);
    const backgroundColor = color(section.backgroundColor);
    const textColor = color(section.textColor);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id) || !backgroundColor || !textColor) return null;
    const sectionMotion = section.motion === "marquee" || section.motion === "coverflow"
      ? "none"
      : enumValue(section.motion, SITE_SECTION_MOTIONS) ? section.motion : null;
    if (!enumValue(section.kind, SITE_SECTION_KINDS) || !enumValue(section.layout, SITE_SECTION_LAYOUTS) || !enumValue(section.width, SITE_SECTION_WIDTHS) || !enumValue(section.align, SITE_SECTION_ALIGNS) || !sectionMotion) return null;
    if (section.family !== undefined && !enumValue(section.family, SITE_SECTION_FAMILIES)) return null;
    ids.add(id);
    const normalizedSection = {
      id,
      ...(pageIds.has(text(section.pageId, 48)) ? { pageId: text(section.pageId, 48) } : {}),
      ...(section.kind === "catalog" && Array.isArray(section.productIds) ? {
        productIds: [...new Set(section.productIds.flatMap((productId) =>
          typeof productId === "string" && /^[a-z0-9_-]{1,200}$/i.test(productId) ? [productId] : [],
        ))].slice(0, 200),
      } : {}),
      kind: section.kind,
      family: resolveSiteSectionFamily(section.kind, section.family, designGenome),
      layout: section.layout,
      width: section.width,
      ...(sectionHeight(section.heightPx) ? { heightPx: sectionHeight(section.heightPx) } : {}),
      ...(sectionHeight(section.mobileHeightPx) ? { mobileHeightPx: sectionHeight(section.mobileHeightPx) } : {}),
      align: section.align,
      motion: sectionMotion,
      title: text(section.title, 120),
      body: text(section.body, 600),
      ctaLabel: text(section.ctaLabel, 40),
      ...(section.kind === "event-tickets" && typeof section.eventId === "string" && /^[a-z0-9_-]{1,200}$/i.test(section.eventId)
        ? { eventId: section.eventId }
        : {}),
      backgroundColor,
      textColor,
      ...(canvasTextStyle(section.titleStyle) ? { titleStyle: canvasTextStyle(section.titleStyle) } : {}),
      ...(canvasTextStyle(section.bodyStyle) ? { bodyStyle: canvasTextStyle(section.bodyStyle) } : {}),
      mediaUrls: Array.isArray(section.mediaUrls) ? [...new Set(section.mediaUrls.map(mediaUrl).filter((url): url is string => Boolean(url)))].slice(0, 8) : [],
      items: Array.isArray(section.items) ? section.items.slice(0, 8).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        return [{
          title: text(row.title, 100),
          body: text(row.body, 320),
          mediaUrl: mediaUrl(row.mediaUrl),
          ...(canvasTextStyle(row.titleStyle) ? { titleStyle: canvasTextStyle(row.titleStyle) } : {}),
          ...(canvasTextStyle(row.bodyStyle) ? { bodyStyle: canvasTextStyle(row.bodyStyle) } : {}),
        }];
      }) : [],
    };
    const blocks = sanitizeSectionBlocks(section.blocks, normalizedSection);
    if (!blocks) return null;
    sections.push({ ...normalizedSection, blocks });
  }
  if (sections.length < 3) return null;
  if (sections.filter((section) => section.kind === "hero" && !section.pageId).length !== 1) return null;
  if (sections.filter((section) => section.kind === "catalog" && !section.pageId).length !== 1) return null;
  if (sections.filter((section) => section.kind === "contact").length !== 1) return null;
  const sectionIds = new Set(sections.map((section) => section.id));
  const navigationItems = sanitizeNavigationItems(navigation.items, sectionIds, pageIds);
  const footer = sanitizeFooter(source.footer);
  return {
    version: 1,
    direction: text(source.direction, 120),
    ...(isSiteArtDirection(source.artDirection) ? { artDirection: source.artDirection } : {}),
    designGenome,
    theme: {
      pageBackground: colors[0]!,
      textColor: colors[1]!,
      accentColor: colors[2]!,
      secondaryColor: colors[3]!,
      surfaceColor: colors[4]!,
      mutedColor: colors[5]!,
      borderColor: colors[6]!,
      headingFont: theme.headingFont,
      bodyFont: theme.bodyFont,
      radius: Number(theme.radius),
      shadow: theme.shadow,
      productLayout: theme.productLayout,
      displayScale: enumValue(theme.displayScale, SITE_DISPLAY_SCALES) ? theme.displayScale : "balanced",
      density: enumValue(theme.density, SITE_DENSITIES) ? theme.density : "balanced",
      imageTreatment: enumValue(theme.imageTreatment, SITE_IMAGE_TREATMENTS) ? theme.imageTreatment : "natural",
    },
    navigation: {
      layout: navigation.layout,
      barStyle: "full",
      brandPosition: enumValue(navigation.brandPosition, SITE_HEADER_POSITIONS)
        ? navigation.brandPosition
        : navigation.layout === "centered" ? "center" : "left",
      navPosition: enumValue(navigation.navPosition, SITE_HEADER_POSITIONS)
        ? navigation.navPosition
        : navigation.layout === "split" ? "left" : "center",
      searchPosition: enumValue(navigation.searchPosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.searchPosition : "right",
      profilePosition: enumValue(navigation.profilePosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.profilePosition : "right",
      cartPosition: enumValue(navigation.cartPosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.cartPosition : "right",
      ...(canvasTextStyle(navigation.brandStyle) ? { brandStyle: canvasTextStyle(navigation.brandStyle) } : {}),
      ...(canvasTextStyle(navigation.taglineStyle) ? { taglineStyle: canvasTextStyle(navigation.taglineStyle) } : {}),
      sticky: navigation.sticky,
      transparent: navigation.transparent,
      logoTreatment: enumValue(navigation.logoTreatment, SITE_LOGO_TREATMENTS) ? navigation.logoTreatment : "wordmark",
      ...(navigationItems ? { items: navigationItems } : {}),
    },
    ...(pages ? { pages } : {}),
    ...(footer ? { footer } : {}),
    motion: { intensity: motion && enumValue(motion.intensity, SITE_MOTION_INTENSITIES) ? motion.intensity : "restrained" },
    merchandising: {
      featuredProductIds: Array.isArray(merchandising?.featuredProductIds)
        ? [...new Set(merchandising.featuredProductIds.flatMap((id) => typeof id === "string" && /^[a-z0-9_-]{1,200}$/i.test(id) ? [id] : []))].slice(0, 6)
        : [],
      productOrderIds: Array.isArray(merchandising?.productOrderIds)
        ? [...new Set(merchandising.productOrderIds.flatMap((id) => typeof id === "string" && /^[a-z0-9_-]{1,200}$/i.test(id) ? [id] : []))].slice(0, 24)
        : [],
      spotlightLayout: merchandising && enumValue(merchandising.spotlightLayout, SITE_SPOTLIGHT_LAYOUTS) ? merchandising.spotlightLayout : "collection",
      showDescriptions: merchandising?.showDescriptions !== false,
      collectionMenuStyle: merchandising?.collectionMenuStyle === "editorial-sidebar" ? "editorial-sidebar" : "tabs",
      collections,
    },
    experience: {
      type: experience && enumValue(experience.type, SITE_SIGNATURE_EXPERIENCES) && SITE_TEXT_EXPERIENCES.has(experience.type)
        ? experience.type
        : "none",
      placement: experience && enumValue(experience.placement, SITE_EXPERIENCE_PLACEMENTS) ? experience.placement : "after-catalog",
      title: text(experience?.title, 100),
      body: text(experience?.body, 320),
      mediaUrls: experience && SITE_TEXT_EXPERIENCES.has(String(experience.type)) && Array.isArray(experience.mediaUrls)
        ? [...new Set(experience.mediaUrls.map(mediaUrl).filter((url): url is string => Boolean(url)))].slice(0, 8)
        : [],
    },
    sections,
  };
}

export interface SiteDocumentLegacyPatch {
  tagline?: string | null;
  backgroundColor?: string | null;
  accentColor?: string | null;
  fontStyle?: "modern" | "editorial" | "friendly" | "classic" | "geometric" | "artisan" | "condensed" | "luxury";
  aboutTitle?: string | null;
  aboutText?: string | null;
  aboutSubtitle?: string | null;
  catalogTitle?: string | null;
  catalogSubtitle?: string | null;
  galleryTitle?: string | null;
  gallerySubtitle?: string | null;
  contactTitle?: string | null;
  contactSubtitle?: string | null;
  locationTitle?: string | null;
  locationSubtitle?: string | null;
  linksTitle?: string | null;
  bannerUrl?: string | null;
  aboutImageUrl?: string | null;
  editorialGallery?: Array<{ imageUrl: string }>;
  animations?: Array<{ id: string }>;
  sectionBackgrounds?: Record<string, string>;
}

/** Projects the compatible legacy editor fields into an authored document
 * without flattening its section order, layout, or visual direction. */
export function synchronizeSiteDocument(
  value: StoreSiteDocument,
  patch: SiteDocumentLegacyPatch,
  mediaChanges: { banner?: boolean; about?: boolean; gallery?: boolean } = {},
): StoreSiteDocument {
  const document = structuredClone(value);
  if (patch.backgroundColor && /^#[0-9a-f]{6}$/i.test(patch.backgroundColor)) document.theme.pageBackground = patch.backgroundColor.toLowerCase();
  if (patch.accentColor && /^#[0-9a-f]{6}$/i.test(patch.accentColor)) document.theme.accentColor = patch.accentColor.toLowerCase();
  if (patch.fontStyle !== undefined) {
    const fontRoles: Record<NonNullable<SiteDocumentLegacyPatch["fontStyle"]>, StoreSiteDocument["theme"]["headingFont"]> = {
      modern: "grotesk", editorial: "editorial", friendly: "humanist", classic: "classic", geometric: "geometric", artisan: "artisan", condensed: "condensed", luxury: "luxury",
    };
    document.theme.headingFont = fontRoles[patch.fontStyle];
    document.theme.bodyFont = fontRoles[patch.fontStyle];
  }
  // The appearance studio materializes the AI signature as a regular named
  // animation. Once that editable list is present, the hidden authored copy
  // must stop rendering or a deleted/retargeted animation would reappear.
  if (Array.isArray(patch.animations)) document.experience = { ...document.experience, type: "none" };
  const backgrounds = patch.sectionBackgrounds ?? {};
  const backgroundKey: Record<StoreSiteDocument["sections"][number]["kind"], string> = {
    hero: "hero", story: "about", catalog: "products", gallery: "gallery", "event-tickets": "products", contact: "contact", location: "location", links: "links",
  };
  const projectedLegacyKinds = new Set<StoreSiteDocument["sections"][number]["kind"]>();
  document.sections = document.sections.map((section) => {
    const next = { ...section, mediaUrls: [...section.mediaUrls], blocks: structuredClone(section.blocks ?? []) };
    const projectLegacy = !projectedLegacyKinds.has(next.kind);
    projectedLegacyKinds.add(next.kind);
    const setText = (field: "title" | "body", candidate: unknown) => {
      if (candidate === null || typeof candidate === "string") next[field] = candidate || "";
    };
    if (projectLegacy && next.kind === "hero") {
      setText("title", patch.tagline);
      if (mediaChanges.banner && patch.bannerUrl !== undefined) next.mediaUrls = patch.bannerUrl ? [patch.bannerUrl] : [];
    } else if (projectLegacy && next.kind === "story") {
      setText("title", patch.aboutTitle);
      setText("body", patch.aboutText !== undefined ? patch.aboutText : patch.aboutSubtitle);
      if (mediaChanges.about && patch.aboutImageUrl !== undefined) next.mediaUrls = patch.aboutImageUrl ? [patch.aboutImageUrl] : [];
    } else if (projectLegacy && next.kind === "catalog") {
      setText("title", patch.catalogTitle);
      setText("body", patch.catalogSubtitle);
    } else if (projectLegacy && next.kind === "gallery") {
      setText("title", patch.galleryTitle);
      setText("body", patch.gallerySubtitle);
      if (mediaChanges.gallery && patch.editorialGallery !== undefined) next.mediaUrls = patch.editorialGallery.map((image) => image.imageUrl).filter(Boolean);
    } else if (projectLegacy && next.kind === "contact") {
      setText("title", patch.contactTitle);
      setText("body", patch.contactSubtitle);
    } else if (projectLegacy && next.kind === "location") {
      setText("title", patch.locationTitle);
      setText("body", patch.locationSubtitle);
    } else if (projectLegacy && next.kind === "links") {
      setText("title", patch.linksTitle);
    }
    const background = backgrounds[`site-${next.id}`] ?? backgrounds[backgroundKey[next.kind]];
    if (background && /^#[0-9a-f]{6}$/i.test(background)) next.backgroundColor = background.toLowerCase();
    const standardBlocks = new Map((next.blocks ?? []).map((block) => [block.id, block]));
    if (standardBlocks.has("heading")) standardBlocks.get("heading")!.text = next.title;
    if (standardBlocks.has("body")) standardBlocks.get("body")!.text = next.body;
    if (standardBlocks.has("action")) standardBlocks.get("action")!.text = next.ctaLabel;
    next.mediaUrls.forEach((mediaUrl, index) => {
      const block = standardBlocks.get(`media-${index + 1}`);
      if (block) block.mediaUrl = mediaUrl;
    });
    return next;
  });
  return document;
}
