import type { MediaAsset, Prisma } from "@prisma/client";

export const SITE_SECTION_KINDS = ["hero", "story", "catalog", "gallery", "contact", "location", "links"] as const;
export const SITE_SECTION_LAYOUTS = ["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"] as const;
export const SITE_SECTION_WIDTHS = ["full", "wide", "contained"] as const;
export const SITE_SECTION_ALIGNS = ["left", "center", "right"] as const;
export const SITE_SECTION_MOTIONS = ["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll", "coverflow"] as const;
export const SITE_FONT_ROLES = ["grotesk", "editorial", "humanist", "geometric", "classic", "mono"] as const;
export const SITE_NAV_LAYOUTS = ["brand-left", "centered", "split"] as const;
export const SITE_PRODUCT_LAYOUTS = ["gallery", "editorial", "compact", "showcase"] as const;
export const SITE_SHADOW_STYLES = ["none", "soft", "lifted"] as const;
export const SITE_DISPLAY_SCALES = ["balanced", "dramatic", "monumental"] as const;
export const SITE_DENSITIES = ["airy", "balanced", "dense"] as const;
export const SITE_IMAGE_TREATMENTS = ["natural", "cinematic", "cutout", "editorial"] as const;
export const SITE_LOGO_TREATMENTS = ["mark", "wordmark", "oversized", "seal"] as const;
export const SITE_MOTION_INTENSITIES = ["restrained", "expressive", "cinematic"] as const;
export const SITE_SPOTLIGHT_LAYOUTS = ["feature-first", "alternating", "lookbook", "collection"] as const;
export const SITE_SIGNATURE_EXPERIENCES = [
  "none", "scroll-expansion", "hero-gallery-scroll", "image-stream", "full-screen-chapters", "frame-sequence", "3d-gallery", "coverflow-carousel",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
] as const;
export const SITE_EXPERIENCE_PLACEMENTS = ["after-hero", "after-story", "after-catalog"] as const;

export type SiteSectionKind = (typeof SITE_SECTION_KINDS)[number];
export type SiteSectionLayout = (typeof SITE_SECTION_LAYOUTS)[number];
export type SiteSectionWidth = (typeof SITE_SECTION_WIDTHS)[number];
export type SiteSectionAlign = (typeof SITE_SECTION_ALIGNS)[number];
export type SiteSectionMotion = (typeof SITE_SECTION_MOTIONS)[number];
export type SiteFontRole = (typeof SITE_FONT_ROLES)[number];

export type AiSiteDocument = {
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
    headingFont: SiteFontRole;
    bodyFont: SiteFontRole;
    radius: number;
    shadow: (typeof SITE_SHADOW_STYLES)[number];
    productLayout: (typeof SITE_PRODUCT_LAYOUTS)[number];
    displayScale: (typeof SITE_DISPLAY_SCALES)[number];
    density: (typeof SITE_DENSITIES)[number];
    imageTreatment: (typeof SITE_IMAGE_TREATMENTS)[number];
  };
  navigation: {
    layout: (typeof SITE_NAV_LAYOUTS)[number];
    sticky: boolean;
    transparent: boolean;
    logoTreatment: (typeof SITE_LOGO_TREATMENTS)[number];
  };
  motion: { intensity: (typeof SITE_MOTION_INTENSITIES)[number] };
  merchandising: {
    featuredProductIndices: number[];
    productOrderIndices: number[];
    spotlightLayout: (typeof SITE_SPOTLIGHT_LAYOUTS)[number];
    showDescriptions: boolean;
  };
  experience: {
    type: (typeof SITE_SIGNATURE_EXPERIENCES)[number];
    placement: (typeof SITE_EXPERIENCE_PLACEMENTS)[number];
    title: string;
    body: string;
    mediaIndices: number[];
  };
  sections: Array<{
    id: string;
    kind: SiteSectionKind;
    layout: SiteSectionLayout;
    width: SiteSectionWidth;
    align: SiteSectionAlign;
    motion: SiteSectionMotion;
    title: string;
    body: string;
    ctaLabel: string;
    backgroundColor: string;
    textColor: string;
    mediaIndices: number[];
    items: Array<{ title: string; body: string; assetIndex: number }>;
  }>;
};

export type StoreSiteDocument = Omit<AiSiteDocument, "sections" | "merchandising" | "experience"> & {
  merchandising: {
    featuredProductIds: string[];
    productOrderIds: string[];
    spotlightLayout: (typeof SITE_SPOTLIGHT_LAYOUTS)[number];
    showDescriptions: boolean;
  };
  experience: Omit<AiSiteDocument["experience"], "mediaIndices"> & { mediaUrls: string[] };
  sections: Array<Omit<AiSiteDocument["sections"][number], "mediaIndices" | "items"> & {
    mediaUrls: string[];
    items: Array<{ title: string; body: string; mediaUrl: string | null }>;
  }>;
};

const COLOR_PATTERN = "^#[0-9A-Fa-f]{6}$";
const sectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "layout", "width", "align", "motion", "title", "body", "ctaLabel", "backgroundColor", "textColor", "mediaIndices", "items"],
  properties: {
    id: { type: "string", minLength: 2, maxLength: 48, pattern: "^[a-z][a-z0-9-]*$" },
    kind: { type: "string", enum: SITE_SECTION_KINDS },
    layout: { type: "string", enum: SITE_SECTION_LAYOUTS },
    width: { type: "string", enum: SITE_SECTION_WIDTHS },
    align: { type: "string", enum: SITE_SECTION_ALIGNS },
    motion: { type: "string", enum: SITE_SECTION_MOTIONS },
    title: { type: "string", maxLength: 120 },
    body: { type: "string", maxLength: 600 },
    ctaLabel: { type: "string", maxLength: 40 },
    backgroundColor: { type: "string", pattern: COLOR_PATTERN },
    textColor: { type: "string", pattern: COLOR_PATTERN },
    mediaIndices: { type: "array", minItems: 0, maxItems: 8, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 23 } },
    items: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "assetIndex"],
        properties: {
          title: { type: "string", maxLength: 100 },
          body: { type: "string", maxLength: 320 },
          assetIndex: { type: "integer", minimum: -1, maximum: 23 },
        },
      },
    },
  },
} as const;

export const AI_SITE_DOCUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "direction", "theme", "navigation", "motion", "merchandising", "experience", "sections"],
  properties: {
    version: { type: "integer", enum: [1] },
    direction: { type: "string", minLength: 3, maxLength: 120 },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["pageBackground", "textColor", "accentColor", "secondaryColor", "surfaceColor", "mutedColor", "borderColor", "headingFont", "bodyFont", "radius", "shadow", "productLayout", "displayScale", "density", "imageTreatment"],
      properties: {
        pageBackground: { type: "string", pattern: COLOR_PATTERN },
        textColor: { type: "string", pattern: COLOR_PATTERN },
        accentColor: { type: "string", pattern: COLOR_PATTERN },
        secondaryColor: { type: "string", pattern: COLOR_PATTERN },
        surfaceColor: { type: "string", pattern: COLOR_PATTERN },
        mutedColor: { type: "string", pattern: COLOR_PATTERN },
        borderColor: { type: "string", pattern: COLOR_PATTERN },
        headingFont: { type: "string", enum: SITE_FONT_ROLES },
        bodyFont: { type: "string", enum: SITE_FONT_ROLES },
        radius: { type: "integer", minimum: 0, maximum: 32 },
        shadow: { type: "string", enum: SITE_SHADOW_STYLES },
        productLayout: { type: "string", enum: SITE_PRODUCT_LAYOUTS },
        displayScale: { type: "string", enum: SITE_DISPLAY_SCALES },
        density: { type: "string", enum: SITE_DENSITIES },
        imageTreatment: { type: "string", enum: SITE_IMAGE_TREATMENTS },
      },
    },
    navigation: {
      type: "object",
      additionalProperties: false,
      required: ["layout", "sticky", "transparent", "logoTreatment"],
      properties: {
        layout: { type: "string", enum: SITE_NAV_LAYOUTS },
        sticky: { type: "boolean" },
        transparent: { type: "boolean" },
        logoTreatment: { type: "string", enum: SITE_LOGO_TREATMENTS },
      },
    },
    motion: {
      type: "object",
      additionalProperties: false,
      required: ["intensity"],
      properties: { intensity: { type: "string", enum: SITE_MOTION_INTENSITIES } },
    },
    merchandising: {
      type: "object",
      additionalProperties: false,
      required: ["featuredProductIndices", "productOrderIndices", "spotlightLayout", "showDescriptions"],
      properties: {
        featuredProductIndices: { type: "array", minItems: 0, maxItems: 6, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 23 } },
        productOrderIndices: { type: "array", minItems: 0, maxItems: 24, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 23 } },
        spotlightLayout: { type: "string", enum: SITE_SPOTLIGHT_LAYOUTS },
        showDescriptions: { type: "boolean" },
      },
    },
    experience: {
      type: "object",
      additionalProperties: false,
      required: ["type", "placement", "title", "body", "mediaIndices"],
      properties: {
        type: { type: "string", enum: SITE_SIGNATURE_EXPERIENCES },
        placement: { type: "string", enum: SITE_EXPERIENCE_PLACEMENTS },
        title: { type: "string", maxLength: 100 },
        body: { type: "string", maxLength: 320 },
        mediaIndices: { type: "array", minItems: 0, maxItems: 8, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 23 } },
      },
    },
    sections: { type: "array", minItems: 4, maxItems: 10, items: sectionSchema },
  },
} as const;

function isColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value);
}

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.replace(/[—–]/g, "-").trim().slice(0, maxLength) : "";
}

export function materializeSiteDocument(value: unknown, assets: MediaAsset[], products: Array<{ id: string }> = []): StoreSiteDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const theme = source.theme && typeof source.theme === "object" && !Array.isArray(source.theme) ? source.theme as Record<string, unknown> : null;
  const navigation = source.navigation && typeof source.navigation === "object" && !Array.isArray(source.navigation) ? source.navigation as Record<string, unknown> : null;
  const motion = source.motion && typeof source.motion === "object" && !Array.isArray(source.motion) ? source.motion as Record<string, unknown> : null;
  const merchandising = source.merchandising && typeof source.merchandising === "object" && !Array.isArray(source.merchandising) ? source.merchandising as Record<string, unknown> : null;
  const experience = source.experience && typeof source.experience === "object" && !Array.isArray(source.experience) ? source.experience as Record<string, unknown> : null;
  if (source.version !== 1 || !theme || !navigation || !Array.isArray(source.sections)) return null;
  if (![theme.pageBackground, theme.textColor, theme.accentColor, theme.secondaryColor, theme.surfaceColor, theme.mutedColor, theme.borderColor].every(isColor)) return null;
  if (!enumValue(theme.headingFont, SITE_FONT_ROLES) || !enumValue(theme.bodyFont, SITE_FONT_ROLES) || !enumValue(theme.shadow, SITE_SHADOW_STYLES) || !enumValue(theme.productLayout, SITE_PRODUCT_LAYOUTS)) return null;
  if (!Number.isInteger(theme.radius) || Number(theme.radius) < 0 || Number(theme.radius) > 32) return null;
  if (!enumValue(navigation.layout, SITE_NAV_LAYOUTS) || typeof navigation.sticky !== "boolean" || typeof navigation.transparent !== "boolean") return null;

  const displayScale = enumValue(theme.displayScale, SITE_DISPLAY_SCALES) ? theme.displayScale : "balanced";
  const density = enumValue(theme.density, SITE_DENSITIES) ? theme.density : "balanced";
  const imageTreatment = enumValue(theme.imageTreatment, SITE_IMAGE_TREATMENTS) ? theme.imageTreatment : "natural";
  const logoTreatment = enumValue(navigation.logoTreatment, SITE_LOGO_TREATMENTS) ? navigation.logoTreatment : "wordmark";
  const motionIntensity = motion && enumValue(motion.intensity, SITE_MOTION_INTENSITIES) ? motion.intensity : "restrained";
  const spotlightLayout = merchandising && enumValue(merchandising.spotlightLayout, SITE_SPOTLIGHT_LAYOUTS) ? merchandising.spotlightLayout : "collection";
  const productIdsFrom = (candidate: unknown, limit: number) => Array.isArray(candidate)
    ? [...new Set(candidate.flatMap((index) => Number.isInteger(index) && products[index as number]?.id ? [products[index as number].id] : []))].slice(0, limit)
    : [];

  const seenIds = new Set<string>();
  const sections: StoreSiteDocument["sections"] = [];
  for (const raw of source.sections.slice(0, 10)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const section = raw as Record<string, unknown>;
    const id = text(section.id, 48);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seenIds.has(id)) return null;
    const sectionMotion = section.motion === "marquee"
      ? "none"
      : enumValue(section.motion, SITE_SECTION_MOTIONS) ? section.motion : null;
    if (!enumValue(section.kind, SITE_SECTION_KINDS) || !enumValue(section.layout, SITE_SECTION_LAYOUTS) || !enumValue(section.width, SITE_SECTION_WIDTHS) || !enumValue(section.align, SITE_SECTION_ALIGNS) || !sectionMotion) return null;
    if (!isColor(section.backgroundColor) || !isColor(section.textColor)) return null;
    seenIds.add(id);
    const mediaIndices = Array.isArray(section.mediaIndices) ? section.mediaIndices : [];
    const items = Array.isArray(section.items) ? section.items : [];
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
      backgroundColor: section.backgroundColor.toLowerCase(),
      textColor: section.textColor.toLowerCase(),
      mediaUrls: [...new Set(mediaIndices.flatMap((index) => Number.isInteger(index) && assets[index as number] ? [assets[index as number].url] : []))].slice(0, 8),
      items: items.slice(0, 8).flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const asset = Number.isInteger(record.assetIndex) && Number(record.assetIndex) >= 0 ? assets[Number(record.assetIndex)] : null;
        return [{ title: text(record.title, 100), body: text(record.body, 320), mediaUrl: asset?.url ?? null }];
      }),
    });
  }
  if (sections.length < 4) return null;
  for (const required of ["hero", "catalog", "contact"] as const) {
    if (sections.filter((section) => section.kind === required).length !== 1) return null;
  }
  return {
    version: 1,
    direction: text(source.direction, 120),
    theme: {
      pageBackground: String(theme.pageBackground).toLowerCase(),
      textColor: String(theme.textColor).toLowerCase(),
      accentColor: String(theme.accentColor).toLowerCase(),
      secondaryColor: String(theme.secondaryColor).toLowerCase(),
      surfaceColor: String(theme.surfaceColor).toLowerCase(),
      mutedColor: String(theme.mutedColor).toLowerCase(),
      borderColor: String(theme.borderColor).toLowerCase(),
      headingFont: theme.headingFont,
      bodyFont: theme.bodyFont,
      radius: Number(theme.radius),
      shadow: theme.shadow,
      productLayout: theme.productLayout,
      displayScale,
      density,
      imageTreatment,
    },
    navigation: { layout: navigation.layout, sticky: navigation.sticky, transparent: navigation.transparent, logoTreatment },
    motion: { intensity: motionIntensity },
    merchandising: {
      featuredProductIds: productIdsFrom(merchandising?.featuredProductIndices, 6),
      productOrderIds: productIdsFrom(merchandising?.productOrderIndices, 24),
      spotlightLayout,
      showDescriptions: merchandising?.showDescriptions !== false,
    },
    experience: {
      type: experience && enumValue(experience.type, SITE_SIGNATURE_EXPERIENCES) ? experience.type : "none",
      placement: experience && enumValue(experience.placement, SITE_EXPERIENCE_PLACEMENTS) ? experience.placement : "after-catalog",
      title: text(experience?.title, 100),
      body: text(experience?.body, 320),
      mediaUrls: experience && Array.isArray(experience.mediaIndices)
        ? [...new Set(experience.mediaIndices.flatMap((index) => Number.isInteger(index) && assets[index as number] ? [assets[index as number].url] : []))].slice(0, 8)
        : [],
    },
    sections,
  };
}

export function siteDocumentJson(value: StoreSiteDocument): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}
