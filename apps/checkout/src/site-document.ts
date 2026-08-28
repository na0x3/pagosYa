export const SITE_SECTION_KINDS = ["hero", "story", "catalog", "gallery", "contact", "location", "links"] as const;
const SITE_SECTION_LAYOUTS = ["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"] as const;
const SITE_SECTION_WIDTHS = ["full", "wide", "contained"] as const;
const SITE_SECTION_ALIGNS = ["left", "center", "right"] as const;
const SITE_SECTION_MOTIONS = ["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll", "coverflow"] as const;
const SITE_FONT_ROLES = ["grotesk", "editorial", "humanist", "geometric", "classic", "mono"] as const;
const SITE_NAV_LAYOUTS = ["brand-left", "centered", "split"] as const;
const SITE_PRODUCT_LAYOUTS = ["gallery", "editorial", "compact", "showcase"] as const;
const SITE_SHADOWS = ["none", "soft", "lifted"] as const;
const SITE_DISPLAY_SCALES = ["balanced", "dramatic", "monumental"] as const;
const SITE_DENSITIES = ["airy", "balanced", "dense"] as const;
const SITE_IMAGE_TREATMENTS = ["natural", "cinematic", "cutout", "editorial"] as const;
const SITE_LOGO_TREATMENTS = ["mark", "wordmark", "oversized", "seal"] as const;
const SITE_MOTION_INTENSITIES = ["restrained", "expressive", "cinematic"] as const;
const SITE_SPOTLIGHT_LAYOUTS = ["feature-first", "alternating", "lookbook", "collection"] as const;
const SITE_SIGNATURE_EXPERIENCES = [
  "none", "scroll-expansion", "hero-gallery-scroll", "image-stream", "full-screen-chapters", "frame-sequence", "3d-gallery", "coverflow-carousel",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
] as const;
const SITE_EXPERIENCE_PLACEMENTS = ["after-hero", "after-story", "after-catalog"] as const;

type ValueOf<T extends readonly string[]> = T[number];

export interface StoreSiteDocument {
  version: 1;
  direction: string;
  theme: {
    pageBackground: string;
    textColor: string;
    accentColor: string;
    secondaryColor: string;
    surfaceColor: string;
    mutedColor: string;
    borderColor: string;
    headingFont: ValueOf<typeof SITE_FONT_ROLES>;
    bodyFont: ValueOf<typeof SITE_FONT_ROLES>;
    radius: number;
    shadow: ValueOf<typeof SITE_SHADOWS>;
    productLayout: ValueOf<typeof SITE_PRODUCT_LAYOUTS>;
    displayScale: ValueOf<typeof SITE_DISPLAY_SCALES>;
    density: ValueOf<typeof SITE_DENSITIES>;
    imageTreatment: ValueOf<typeof SITE_IMAGE_TREATMENTS>;
  };
  navigation: {
    layout: ValueOf<typeof SITE_NAV_LAYOUTS>;
    sticky: boolean;
    transparent: boolean;
    logoTreatment: ValueOf<typeof SITE_LOGO_TREATMENTS>;
  };
  motion: { intensity: ValueOf<typeof SITE_MOTION_INTENSITIES> };
  merchandising: {
    featuredProductIds: string[];
    productOrderIds: string[];
    spotlightLayout: ValueOf<typeof SITE_SPOTLIGHT_LAYOUTS>;
    showDescriptions: boolean;
  };
  experience: {
    type: ValueOf<typeof SITE_SIGNATURE_EXPERIENCES>;
    placement: ValueOf<typeof SITE_EXPERIENCE_PLACEMENTS>;
    title: string;
    body: string;
    mediaUrls: string[];
  };
  sections: Array<{
    id: string;
    kind: ValueOf<typeof SITE_SECTION_KINDS>;
    layout: ValueOf<typeof SITE_SECTION_LAYOUTS>;
    width: ValueOf<typeof SITE_SECTION_WIDTHS>;
    align: ValueOf<typeof SITE_SECTION_ALIGNS>;
    motion: ValueOf<typeof SITE_SECTION_MOTIONS>;
    title: string;
    body: string;
    ctaLabel: string;
    backgroundColor: string;
    textColor: string;
    mediaUrls: string[];
    items: Array<{ title: string; body: string; mediaUrl: string | null }>;
  }>;
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

  const ids = new Set<string>();
  const sections: StoreSiteDocument["sections"] = [];
  for (const entry of source.sections.slice(0, 10)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const section = entry as Record<string, unknown>;
    // Benefits was a generic platform explainer that appeared in every early
    // AI site. Retire it at read time so already-saved sites lose it too.
    if (section.kind === "benefits") continue;
    const id = text(section.id, 48);
    const backgroundColor = color(section.backgroundColor);
    const textColor = color(section.textColor);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id) || !backgroundColor || !textColor) return null;
    const sectionMotion = section.motion === "marquee"
      ? "none"
      : enumValue(section.motion, SITE_SECTION_MOTIONS) ? section.motion : null;
    if (!enumValue(section.kind, SITE_SECTION_KINDS) || !enumValue(section.layout, SITE_SECTION_LAYOUTS) || !enumValue(section.width, SITE_SECTION_WIDTHS) || !enumValue(section.align, SITE_SECTION_ALIGNS) || !sectionMotion) return null;
    ids.add(id);
    sections.push({
      id,
      kind: section.kind,
      layout: section.layout,
      width: section.width,
      align: section.align,
      motion: sectionMotion,
      title: text(section.title, 120),
      body: text(section.body, 600),
      ctaLabel: text(section.ctaLabel, 40),
      backgroundColor,
      textColor,
      mediaUrls: Array.isArray(section.mediaUrls) ? [...new Set(section.mediaUrls.map(mediaUrl).filter((url): url is string => Boolean(url)))].slice(0, 8) : [],
      items: Array.isArray(section.items) ? section.items.slice(0, 8).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const row = item as Record<string, unknown>;
        return [{ title: text(row.title, 100), body: text(row.body, 320), mediaUrl: mediaUrl(row.mediaUrl) }];
      }) : [],
    });
  }
  if (sections.length < 3) return null;
  if (!["hero", "catalog", "contact"].every((kind) => sections.filter((section) => section.kind === kind).length === 1)) return null;
  return {
    version: 1,
    direction: text(source.direction, 120),
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
      sticky: navigation.sticky,
      transparent: navigation.transparent,
      logoTreatment: enumValue(navigation.logoTreatment, SITE_LOGO_TREATMENTS) ? navigation.logoTreatment : "wordmark",
    },
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
    },
    experience: {
      type: experience && enumValue(experience.type, SITE_SIGNATURE_EXPERIENCES) ? experience.type : "none",
      placement: experience && enumValue(experience.placement, SITE_EXPERIENCE_PLACEMENTS) ? experience.placement : "after-catalog",
      title: text(experience?.title, 100),
      body: text(experience?.body, 320),
      mediaUrls: experience && Array.isArray(experience.mediaUrls)
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
  fontStyle?: "modern" | "editorial" | "friendly" | "classic" | "geometric";
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
      modern: "grotesk", editorial: "editorial", friendly: "humanist", classic: "classic", geometric: "geometric",
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
    hero: "hero", story: "about", catalog: "products", gallery: "gallery", contact: "contact", location: "location", links: "links",
  };
  document.sections = document.sections.map((section) => {
    const next = { ...section, mediaUrls: [...section.mediaUrls] };
    const setText = (field: "title" | "body", candidate: unknown) => {
      if (candidate === null || typeof candidate === "string") next[field] = candidate || "";
    };
    if (next.kind === "hero") {
      setText("title", patch.tagline);
      if (mediaChanges.banner && patch.bannerUrl !== undefined) next.mediaUrls = patch.bannerUrl ? [patch.bannerUrl] : [];
    } else if (next.kind === "story") {
      setText("title", patch.aboutTitle);
      setText("body", patch.aboutText !== undefined ? patch.aboutText : patch.aboutSubtitle);
      if (mediaChanges.about && patch.aboutImageUrl !== undefined) next.mediaUrls = patch.aboutImageUrl ? [patch.aboutImageUrl] : [];
    } else if (next.kind === "catalog") {
      setText("title", patch.catalogTitle);
      setText("body", patch.catalogSubtitle);
    } else if (next.kind === "gallery") {
      setText("title", patch.galleryTitle);
      setText("body", patch.gallerySubtitle);
      if (mediaChanges.gallery && patch.editorialGallery !== undefined) next.mediaUrls = patch.editorialGallery.map((image) => image.imageUrl).filter(Boolean);
    } else if (next.kind === "contact") {
      setText("title", patch.contactTitle);
      setText("body", patch.contactSubtitle);
    } else if (next.kind === "location") {
      setText("title", patch.locationTitle);
      setText("body", patch.locationSubtitle);
    } else if (next.kind === "links") {
      setText("title", patch.linksTitle);
    }
    const background = backgrounds[`site-${next.id}`] ?? backgrounds[backgroundKey[next.kind]];
    if (background && /^#[0-9a-f]{6}$/i.test(background)) next.backgroundColor = background.toLowerCase();
    return next;
  });
  return document;
}
