import type { MediaAsset, Prisma } from "@prisma/client";
import {
  SITE_COLOR_STRATEGIES,
  SITE_ART_DIRECTIONS,
  SITE_COMPOSITION_GRAMMARS,
  SITE_DESIGN_GEOMETRIES,
  SITE_DESIGN_RHYTHMS,
  SITE_MEDIA_STRATEGIES,
  SITE_MOTION_LANGUAGES,
  SITE_SECTION_BLOCK_KINDS,
  SITE_SECTION_BLOCK_ROLES,
  SITE_SECTION_FAMILIES,
  SITE_SECTION_CAPABILITIES,
  SITE_TYPE_SCALES,
  STORE_SITE_DENSITIES,
  STORE_SITE_DISPLAY_SCALES,
  STORE_SITE_EXPERIENCE_PLACEMENTS,
  STORE_SITE_FONT_ROLES,
  STORE_SITE_HEADER_ACTION_POSITIONS,
  STORE_SITE_HEADER_POSITIONS,
  STORE_SITE_HEADER_STYLES,
  STORE_SITE_IMAGE_TREATMENTS,
  STORE_SITE_LOGO_TREATMENTS,
  STORE_SITE_MOTION_INTENSITIES,
  STORE_SITE_NAV_LAYOUTS,
  STORE_SITE_PRODUCT_LAYOUTS,
  STORE_SITE_SECTION_ALIGNS,
  STORE_SITE_SECTION_LAYOUTS,
  STORE_SITE_SECTION_MOTIONS,
  STORE_SITE_SECTION_WIDTHS,
  STORE_SITE_SHADOW_STYLES,
  STORE_SITE_SIGNATURE_EXPERIENCES,
  STORE_SITE_SPOTLIGHT_LAYOUTS,
  STORE_SITE_TEXT_EXPERIENCES,
  applySiteArtDirection,
  deriveLegacySiteSectionBlocks,
  resolveSiteSectionFamily,
  sanitizeSiteDesignGenome,
  isSiteArtDirection,
  siteSectionBlockSlotIsSupported,
  siteSectionSupportsCapability,
  type SiteDesignGenome,
  type SiteArtDirection,
  type SiteSectionBlock,
  type SiteSectionFamily,
  type StoreCanvasTextStyle,
  type StoreSiteDocument,
  type StoreSiteFooter,
  type StoreSiteNavigationItem,
  type StoreSitePage,
} from "@pagosya/shared-types";

/** AI-authored sections only. Server-owned event-ticket bindings are excluded. */
export const SITE_SECTION_KINDS = ["hero", "story", "catalog", "gallery", "contact", "location", "links"] as const;
export const SITE_SECTION_LAYOUTS = STORE_SITE_SECTION_LAYOUTS;
export const SITE_SECTION_WIDTHS = STORE_SITE_SECTION_WIDTHS;
export const SITE_SECTION_ALIGNS = STORE_SITE_SECTION_ALIGNS;
export const SITE_SECTION_MOTIONS = STORE_SITE_SECTION_MOTIONS;
export const SITE_FONT_ROLES = STORE_SITE_FONT_ROLES;
export const SITE_HEADER_ACTION_POSITIONS = STORE_SITE_HEADER_ACTION_POSITIONS;
export const SITE_HEADER_POSITIONS = STORE_SITE_HEADER_POSITIONS;
export const SITE_HEADER_STYLES = STORE_SITE_HEADER_STYLES;
export const SITE_NAV_LAYOUTS = STORE_SITE_NAV_LAYOUTS;
export const SITE_PRODUCT_LAYOUTS = STORE_SITE_PRODUCT_LAYOUTS;
export const SITE_SHADOW_STYLES = STORE_SITE_SHADOW_STYLES;
export const SITE_DISPLAY_SCALES = STORE_SITE_DISPLAY_SCALES;
export const SITE_DENSITIES = STORE_SITE_DENSITIES;
export const SITE_IMAGE_TREATMENTS = STORE_SITE_IMAGE_TREATMENTS;
export const SITE_LOGO_TREATMENTS = STORE_SITE_LOGO_TREATMENTS;
export const SITE_MOTION_INTENSITIES = STORE_SITE_MOTION_INTENSITIES;
export const SITE_SPOTLIGHT_LAYOUTS = STORE_SITE_SPOTLIGHT_LAYOUTS;
export const SITE_SIGNATURE_EXPERIENCES = STORE_SITE_SIGNATURE_EXPERIENCES;
const SITE_TEXT_EXPERIENCES = new Set<string>(STORE_SITE_TEXT_EXPERIENCES);
export const SITE_EXPERIENCE_PLACEMENTS = STORE_SITE_EXPERIENCE_PLACEMENTS;

export type SiteSectionKind = (typeof SITE_SECTION_KINDS)[number];
export type SiteSectionLayout = (typeof SITE_SECTION_LAYOUTS)[number];
export type SiteSectionWidth = (typeof SITE_SECTION_WIDTHS)[number];
export type SiteSectionAlign = (typeof SITE_SECTION_ALIGNS)[number];
export type SiteSectionMotion = (typeof SITE_SECTION_MOTIONS)[number];
export type SiteFontRole = (typeof SITE_FONT_ROLES)[number];

export type AiSiteSectionBlock = {
  id: string;
  kind: (typeof SITE_SECTION_BLOCK_KINDS)[number];
  slot: string;
  role: (typeof SITE_SECTION_BLOCK_ROLES)[number];
  text: string;
  assetIndex: number;
  children: AiSiteSectionBlock[];
};

export type AiSiteDocument = {
  version: 1;
  direction: string;
  artDirection?: SiteArtDirection;
  pages: StoreSitePage[];
  designGenome: SiteDesignGenome;
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
    barStyle?: (typeof SITE_HEADER_STYLES)[number];
    brandPosition?: (typeof SITE_HEADER_POSITIONS)[number];
    navPosition?: (typeof SITE_HEADER_POSITIONS)[number];
    searchPosition?: (typeof SITE_HEADER_ACTION_POSITIONS)[number];
    profilePosition?: (typeof SITE_HEADER_ACTION_POSITIONS)[number];
    cartPosition?: (typeof SITE_HEADER_ACTION_POSITIONS)[number];
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
    /** Empty string means Inicio. Otherwise this must match one entry in pages. */
    pageId: string;
    kind: SiteSectionKind;
    family?: SiteSectionFamily;
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
    productIndices?: number[];
    items: Array<{ title: string; body: string; assetIndex: number }>;
    blocks: AiSiteSectionBlock[];
  }>;
};

export type {
  StoreCanvasTextStyle,
  StoreSiteDocument,
  StoreSiteFooter,
  StoreSiteFooterItem,
  StoreSiteNavigationItem,
  StoreSitePage,
} from "@pagosya/shared-types";

const COLOR_PATTERN = "^#[0-9A-Fa-f]{6}$";
const leafBlockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "slot", "role", "text", "assetIndex", "children"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 48, pattern: "^[a-z][a-z0-9-]*$" },
    kind: { type: "string", enum: SITE_SECTION_BLOCK_KINDS.filter((kind) => kind !== "group") },
    slot: { type: "string", minLength: 2, maxLength: 32, pattern: "^[a-z][a-z0-9-]*$" },
    role: { type: "string", enum: SITE_SECTION_BLOCK_ROLES },
    text: { type: "string", maxLength: 600 },
    assetIndex: { type: "integer", minimum: -1, maximum: 23 },
    children: {
      type: "array",
      minItems: 0,
      maxItems: 0,
      items: { type: "object", additionalProperties: false, properties: {}, required: [] },
    },
  },
} as const;
const blockSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "kind", "slot", "role", "text", "assetIndex", "children"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 48, pattern: "^[a-z][a-z0-9-]*$" },
    kind: { type: "string", enum: SITE_SECTION_BLOCK_KINDS },
    slot: { type: "string", minLength: 2, maxLength: 32, pattern: "^[a-z][a-z0-9-]*$" },
    role: { type: "string", enum: SITE_SECTION_BLOCK_ROLES },
    text: { type: "string", maxLength: 600 },
    assetIndex: { type: "integer", minimum: -1, maximum: 23 },
    children: { type: "array", minItems: 0, maxItems: 8, items: leafBlockSchema },
  },
} as const;
const sectionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "pageId", "kind", "family", "layout", "width", "align", "motion", "title", "body", "ctaLabel", "backgroundColor", "textColor", "mediaIndices", "items", "blocks"],
  properties: {
    id: { type: "string", minLength: 2, maxLength: 48, pattern: "^[a-z][a-z0-9-]*$" },
    pageId: { type: "string", minLength: 0, maxLength: 40, pattern: "^$|^[a-z][a-z0-9-]*$" },
    kind: { type: "string", enum: SITE_SECTION_KINDS },
    family: { type: "string", enum: SITE_SECTION_FAMILIES },
    layout: { type: "string", enum: SITE_SECTION_LAYOUTS },
    width: { type: "string", enum: SITE_SECTION_WIDTHS },
    align: { type: "string", enum: SITE_SECTION_ALIGNS },
    motion: { type: "string", enum: SITE_SECTION_MOTIONS },
    title: { type: "string", maxLength: 120 },
    body: { type: "string", maxLength: 600 },
    ctaLabel: { type: "string", maxLength: 40 },
    backgroundColor: { type: "string", pattern: COLOR_PATTERN },
    textColor: { type: "string", pattern: COLOR_PATTERN },
    mediaIndices: { type: "array", minItems: 0, maxItems: 8, items: { type: "integer", minimum: 0, maximum: 23 } },
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
    blocks: { type: "array", minItems: 0, maxItems: 16, items: blockSchema },
  },
} as const;

// Responses strict schemas do not support uniqueItems. Materialization below
// deduplicates product IDs and section media after validating asset ownership.
export const AI_SITE_DOCUMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["version", "direction", "artDirection", "pages", "designGenome", "theme", "navigation", "motion", "merchandising", "experience", "sections"],
  properties: {
    version: { type: "integer", enum: [1] },
    direction: { type: "string", minLength: 3, maxLength: 120 },
    artDirection: { type: "string", enum: SITE_ART_DIRECTIONS },
    pages: {
      type: "array",
      description: "Only additional pages. Inicio is implicit; never add home/inicio here. Home sections use pageId=\"\".",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "slug"],
        properties: {
          id: { type: "string", minLength: 2, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" },
          label: { type: "string", minLength: 2, maxLength: 40 },
          slug: { type: "string", minLength: 2, maxLength: 40, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
        },
      },
    },
    designGenome: {
      type: "object",
      additionalProperties: false,
      required: ["composition", "rhythm", "geometry", "colorStrategy", "mediaStrategy", "typeScale", "motionLanguage"],
      properties: {
        composition: { type: "string", enum: SITE_COMPOSITION_GRAMMARS },
        rhythm: { type: "string", enum: SITE_DESIGN_RHYTHMS },
        geometry: { type: "string", enum: SITE_DESIGN_GEOMETRIES },
        colorStrategy: { type: "string", enum: SITE_COLOR_STRATEGIES },
        mediaStrategy: { type: "string", enum: SITE_MEDIA_STRATEGIES },
        typeScale: { type: "string", enum: SITE_TYPE_SCALES },
        motionLanguage: { type: "string", enum: SITE_MOTION_LANGUAGES },
      },
    },
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
        featuredProductIndices: { type: "array", minItems: 0, maxItems: 6, items: { type: "integer", minimum: 0, maximum: 23 } },
        productOrderIndices: { type: "array", minItems: 0, maxItems: 24, items: { type: "integer", minimum: 0, maximum: 23 } },
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
        mediaIndices: { type: "array", minItems: 0, maxItems: 8, items: { type: "integer", minimum: 0, maximum: 23 } },
      },
    },
    sections: { type: "array", minItems: 4, maxItems: 16, items: {
      anyOf: SITE_SECTION_KINDS.map((kind) => {
        const capability = SITE_SECTION_CAPABILITIES[kind];
        const slot = { type: "string", enum: capability.slots };
        return {
          ...sectionSchema,
          required: [...sectionSchema.required, ...(kind === "catalog" ? ["productIndices"] : [])],
          properties: {
            ...sectionSchema.properties,
            ...(kind === "catalog" ? { productIndices: { type: "array", minItems: 0, maxItems: 24, items: { type: "integer", minimum: 0, maximum: 23 } } } : {}),
            kind: { type: "string", enum: [kind] },
            layout: { type: "string", enum: capability.layouts },
            motion: { type: "string", enum: capability.motions },
            blocks: { ...sectionSchema.properties.blocks, items: {
              ...blockSchema,
              properties: { ...blockSchema.properties, slot,
                children: { ...blockSchema.properties.children, items: {
                  ...leafBlockSchema, properties: { ...leafBlockSchema.properties, slot },
                } },
              },
            } },
          },
        };
      }),
    } },
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

function materializeSectionBlocks(
  value: unknown,
  sectionKind: SiteSectionKind,
  assets: MediaAsset[],
): SiteSectionBlock[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const visit = (candidate: unknown, depth: number): SiteSectionBlock | null => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || depth > 1) return null;
    const source = candidate as Record<string, unknown>;
    const id = text(source.id, 48);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) return null;
    if (!enumValue(source.kind, SITE_SECTION_BLOCK_KINDS) || !enumValue(source.role, SITE_SECTION_BLOCK_ROLES)) return null;
    if (typeof source.slot !== "string" || !siteSectionBlockSlotIsSupported(sectionKind, source.slot)) return null;
    if (!Number.isInteger(source.assetIndex) || Number(source.assetIndex) < -1 || Number(source.assetIndex) > 23) return null;
    if (!Array.isArray(source.children) || source.children.length > 8) return null;
    if (depth === 1 && (source.kind === "group" || source.children.length)) return null;
    ids.add(id);
    const children = source.children.map((child) => visit(child, depth + 1));
    if (children.some((child) => !child)) return null;
    const asset = Number(source.assetIndex) >= 0 ? assets[Number(source.assetIndex)] : null;
    return {
      id,
      kind: source.kind,
      slot: source.slot,
      role: source.role,
      text: text(source.text, 600),
      mediaUrl: asset?.url ?? null,
      children: children as SiteSectionBlock[],
    };
  };
  const blocks = value.slice(0, 16).map((block) => visit(block, 0));
  return blocks.some((block) => !block) ? null : blocks as SiteSectionBlock[];
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
  const barStyle = enumValue(navigation.barStyle, SITE_HEADER_STYLES) ? navigation.barStyle : "floating";
  const brandPosition = enumValue(navigation.brandPosition, SITE_HEADER_POSITIONS)
    ? navigation.brandPosition
    : navigation.layout === "centered" ? "center" : "left";
  const navPosition = enumValue(navigation.navPosition, SITE_HEADER_POSITIONS)
    ? navigation.navPosition
    : navigation.layout === "split" ? "left" : "center";
  const searchPosition = enumValue(navigation.searchPosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.searchPosition : "right";
  const profilePosition = enumValue(navigation.profilePosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.profilePosition : "right";
  const cartPosition = enumValue(navigation.cartPosition, SITE_HEADER_ACTION_POSITIONS) ? navigation.cartPosition : "right";
  const motionIntensity = motion && enumValue(motion.intensity, SITE_MOTION_INTENSITIES) ? motion.intensity : "restrained";
  const spotlightLayout = merchandising && enumValue(merchandising.spotlightLayout, SITE_SPOTLIGHT_LAYOUTS) ? merchandising.spotlightLayout : "collection";
  const designGenome = sanitizeSiteDesignGenome(source.designGenome);
  const productIdsFrom = (candidate: unknown, limit: number) => Array.isArray(candidate)
    ? [...new Set(candidate.flatMap((index) => Number.isInteger(index) && products[index as number]?.id ? [products[index as number].id] : []))].slice(0, limit)
    : [];

  const rawPages = source.pages === undefined ? [] : source.pages;
  if (!Array.isArray(rawPages) || rawPages.length > 3) return null;
  const pageIds = new Set<string>();
  const pageSlugs = new Set<string>();
  const explicitHomeIds = new Set<string>();
  const pages: StoreSitePage[] = [];
  for (const rawPage of rawPages) {
    if (!rawPage || typeof rawPage !== "object" || Array.isArray(rawPage)) return null;
    const page = rawPage as Record<string, unknown>;
    const id = text(page.id, 40);
    const label = text(page.label, 40);
    const slug = text(page.slug, 40).toLowerCase();
    if (!/^[a-z][a-z0-9-]*$/.test(id) || !label || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
    // The model sometimes declares Inicio explicitly. This is an unambiguous
    // alias of the implicit home page, not an extra destination or orphan hero.
    if (["home", "inicio"].includes(id) && ["home", "inicio"].includes(slug)) {
      if (explicitHomeIds.size || pageIds.has(id)) return null;
      explicitHomeIds.add(id);
      continue;
    }
    if (explicitHomeIds.has(id)) return null;
    if (pageIds.has(id) || pageSlugs.has(slug) || ["home", "catalog", "inicio", "tienda"].includes(slug)) return null;
    pageIds.add(id);
    pageSlugs.add(slug);
    pages.push({ id, label, slug });
  }

  const seenIds = new Set<string>();
  const sections: StoreSiteDocument["sections"] = [];
  for (const raw of source.sections.slice(0, 16)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const section = raw as Record<string, unknown>;
    const id = text(section.id, 48);
    const sourcePageId = text(section.pageId, 40);
    const pageId = explicitHomeIds.has(sourcePageId) ? "" : sourcePageId;
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seenIds.has(id)) return null;
    let sectionMotion = section.motion === "marquee" || section.motion === "coverflow"
      ? "none"
      : enumValue(section.motion, SITE_SECTION_MOTIONS) ? section.motion : null;
    if (!enumValue(section.kind, SITE_SECTION_KINDS) || !enumValue(section.layout, SITE_SECTION_LAYOUTS) || !enumValue(section.width, SITE_SECTION_WIDTHS) || !enumValue(section.align, SITE_SECTION_ALIGNS) || !sectionMotion) return null;
    if ((pageId && !pageIds.has(pageId)) || (section.kind === "hero" && pageId)) return null;
    if (!isColor(section.backgroundColor) || !isColor(section.textColor)) return null;
    seenIds.add(id);
    const mediaIndices = Array.isArray(section.mediaIndices) ? section.mediaIndices : [];
    if (section.family !== undefined && !enumValue(section.family, SITE_SECTION_FAMILIES)) return null;
    const family = resolveSiteSectionFamily(section.kind, section.family, designGenome);
    // Older provider responses used the global motion enum, which allowed
    // decorative combinations the renderer cannot use (e.g. catalog + clip).
    // Repair only a registered motion to a supported reveal, preserving content.
    const supportedMotions = SITE_SECTION_CAPABILITIES[section.kind].motions;
    if (!supportedMotions.includes(sectionMotion)) sectionMotion = supportedMotions.includes("reveal") ? "reveal" : "none";
    if (!siteSectionSupportsCapability(section.kind, section.layout, sectionMotion, undefined, family)) return null;
    const items = Array.isArray(section.items) ? section.items : [];
    const materializedItems = items.slice(0, 8).flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const asset = Number.isInteger(record.assetIndex) && Number(record.assetIndex) >= 0 ? assets[Number(record.assetIndex)] : null;
      return [{ title: text(record.title, 100), body: text(record.body, 320), mediaUrl: asset?.url ?? null }];
    });
    const materializedMediaUrls = [...new Set(mediaIndices.flatMap((index) => Number.isInteger(index) && assets[index as number] ? [assets[index as number].url] : []))].slice(0, 8);
    const authoredBlocks = Array.isArray(section.blocks) && section.blocks.length
      ? materializeSectionBlocks(section.blocks, section.kind, assets)
      : null;
    if (Array.isArray(section.blocks) && section.blocks.length && !authoredBlocks) return null;
    const storeSection = {
      id,
      kind: section.kind,
      family,
      layout: section.layout,
      width: section.width,
      align: section.align,
      motion: sectionMotion,
      title: text(section.title, 120),
      body: text(section.body, 600),
      ctaLabel: text(section.ctaLabel, 40),
      backgroundColor: section.backgroundColor.toLowerCase(),
      textColor: section.textColor.toLowerCase(),
      mediaUrls: materializedMediaUrls,
      items: materializedItems,
    };
    sections.push({
      ...storeSection,
      ...(pageId ? { pageId } : {}),
      // The generated home catalog starts with the store's complete active
      // inventory. Omitting productIds is the document contract for "all
      // products", and also lets products created later appear automatically.
      // Additional-page catalogs remain explicit selections and are populated
      // by ensureGeneratedCommercePages after materialization.
      ...(section.kind === "catalog" && pageId ? { productIds: productIdsFrom(section.productIndices, 24) } : {}),
      blocks: authoredBlocks?.length ? authoredBlocks : deriveLegacySiteSectionBlocks(storeSection),
    });
  }
  if (sections.length < 4) return null;
  for (const required of ["hero", "catalog", "contact"] as const) {
    if (sections.filter((section) => section.kind === required && !section.pageId).length !== 1) return null;
  }
  if (pages.some((page) => !sections.some((section) => section.pageId === page.id && section.kind === "catalog"))) return null;
  const result: StoreSiteDocument = {
    version: 1,
    direction: text(source.direction, 120),
    ...(isSiteArtDirection(source.artDirection) ? { artDirection: source.artDirection } : {}),
    designGenome,
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
    navigation: {
      layout: navigation.layout,
      barStyle,
      brandPosition,
      navPosition,
      searchPosition,
      profilePosition,
      cartPosition,
      sticky: navigation.sticky,
      transparent: navigation.transparent,
      logoTreatment,
      items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        ...pages.map((page) => ({ id: `nav-${page.id}`, label: page.label, target: "page" as const, pageId: page.id })),
      ],
    },
    ...(pages.length ? { pages } : {}),
    motion: { intensity: motionIntensity },
    merchandising: {
      featuredProductIds: productIdsFrom(merchandising?.featuredProductIndices, 6),
      productOrderIds: productIdsFrom(merchandising?.productOrderIndices, 24),
      spotlightLayout,
      showDescriptions: merchandising?.showDescriptions !== false,
    },
    experience: {
      type: experience && enumValue(experience.type, SITE_SIGNATURE_EXPERIENCES) && SITE_TEXT_EXPERIENCES.has(experience.type)
        ? experience.type
        : "none",
      placement: experience && enumValue(experience.placement, SITE_EXPERIENCE_PLACEMENTS) ? experience.placement : "after-catalog",
      title: text(experience?.title, 100),
      body: text(experience?.body, 320),
      mediaUrls: [],
    },
    sections,
  };
  return isSiteArtDirection(source.artDirection)
    ? applySiteArtDirection(result, source.artDirection)
    : result;
}

export function siteDocumentJson(value: StoreSiteDocument): Prisma.InputJsonObject {
  return value as unknown as Prisma.InputJsonObject;
}
