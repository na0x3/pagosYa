export const SITE_COMPOSITION_GRAMMARS = [
  "editorial-maker",
  "editorial-split",
  "spatial-cascade",
  "collection-rail",
  "material-ledger",
  "quiet-monument",
  "catalog-poster",
  "narrative-offset",
  "gallery-axis",
  "studio-index",
] as const;

export const SITE_DESIGN_RHYTHMS = ["balanced", "editorial", "cinematic", "compact"] as const;
export const SITE_DESIGN_GEOMETRIES = ["soft", "structured", "framed", "cut-paper", "borderless"] as const;
export const SITE_COLOR_STRATEGIES = ["accent-led", "surface-led", "contrast-blocks", "monochrome"] as const;
export const SITE_MEDIA_STRATEGIES = ["natural", "full-bleed", "cutout", "collage", "framed"] as const;
export const SITE_TYPE_SCALES = ["balanced", "editorial", "poster", "cinematic"] as const;
export const SITE_MOTION_LANGUAGES = ["still", "reveal", "tactile", "cinematic"] as const;

export type SiteCompositionGrammar = (typeof SITE_COMPOSITION_GRAMMARS)[number];
export type SiteDesignRhythm = (typeof SITE_DESIGN_RHYTHMS)[number];
export type SiteDesignGeometry = (typeof SITE_DESIGN_GEOMETRIES)[number];
export type SiteColorStrategy = (typeof SITE_COLOR_STRATEGIES)[number];
export type SiteMediaStrategy = (typeof SITE_MEDIA_STRATEGIES)[number];
export type SiteTypeScale = (typeof SITE_TYPE_SCALES)[number];
export type SiteMotionLanguage = (typeof SITE_MOTION_LANGUAGES)[number];

export const SITE_SEMANTIC_MEDIA_ROLES = [
  "featured-product",
  "product-detail",
  "brand-texture",
  "process-image",
  "founder-or-story",
  "campaign-image",
  "collection-cover",
  "ambient-detail",
  "lifestyle",
  "logo",
  "editorial",
  "none",
] as const;
export type SiteSemanticMediaRole = (typeof SITE_SEMANTIC_MEDIA_ROLES)[number];

export interface SiteWeightedOption<T extends string> {
  value: T;
  /** Relative probability. Zero disables an option without deleting the recipe. */
  weight: number;
}

export interface SiteWeightedSequence<T extends string> {
  value: T[];
  /** Relative probability for this complete, content-free sequence. */
  weight: number;
}

export interface SiteCreativeRecipeBlock {
  kind: SiteSectionBlockKind;
  slot: string;
  role: SiteSectionBlockRole;
  children: SiteCreativeRecipeBlock[];
}

export interface SiteSemanticMediaBinding {
  slot: string;
  role: SiteSemanticMediaRole;
  cardinality: number;
}

export interface SiteCreativeRecipeSection {
  kind: SiteCapabilitySectionKind;
  family: SiteWeightedOption<SiteSectionFamily>[];
  layout: SiteWeightedOption<SiteCapabilityLayout>[];
  width: SiteWeightedOption<"full" | "wide" | "contained">[];
  align: SiteWeightedOption<"left" | "center" | "right">[];
  motion: SiteWeightedOption<SiteCapabilityMotion>[];
  blocks: SiteCreativeRecipeBlock[];
  mediaBindings: SiteSemanticMediaBinding[];
}

/**
 * Portable art direction. It intentionally cannot contain merchant copy,
 * product ids, asset urls, or section ids, so saving a template stores the
 * composition recipe rather than cloning a storefront.
 */
export interface SiteCreativeRecipe {
  version: 1;
  name: string;
  genome: {
    composition: SiteWeightedOption<SiteCompositionGrammar>[];
    rhythm: SiteWeightedOption<SiteDesignRhythm>[];
    geometry: SiteWeightedOption<SiteDesignGeometry>[];
    colorStrategy: SiteWeightedOption<SiteColorStrategy>[];
    mediaStrategy: SiteWeightedOption<SiteMediaStrategy>[];
    typeScale: SiteWeightedOption<SiteTypeScale>[];
    motionLanguage: SiteWeightedOption<SiteMotionLanguage>[];
  };
  /** Weighted page silhouettes. Values contain section kinds only, never ids. */
  sectionOrders?: SiteWeightedSequence<SiteCapabilitySectionKind>[];
  /** Typography and density travel with the recipe without carrying brand copy. */
  theme?: {
    headingFont: SiteWeightedOption<"grotesk" | "editorial" | "humanist" | "geometric" | "classic" | "mono" | "artisan" | "condensed" | "luxury">[];
    bodyFont: SiteWeightedOption<"grotesk" | "editorial" | "humanist" | "geometric" | "classic" | "mono" | "artisan" | "condensed" | "luxury">[];
    productLayout: SiteWeightedOption<"gallery" | "editorial" | "compact" | "showcase">[];
    displayScale: SiteWeightedOption<"balanced" | "dramatic" | "monumental">[];
    density: SiteWeightedOption<"airy" | "balanced" | "dense">[];
    imageTreatment: SiteWeightedOption<"natural" | "cinematic" | "cutout" | "editorial">[];
  };
  navigation?: {
    layout: SiteWeightedOption<"brand-left" | "centered" | "split">[];
    logoTreatment: SiteWeightedOption<"mark" | "wordmark" | "oversized" | "seal">[];
  };
  merchandising?: {
    spotlightLayout: SiteWeightedOption<"feature-first" | "alternating" | "lookbook" | "collection">[];
  };
  sectionOrder: SiteCapabilitySectionKind[];
  sections: SiteCreativeRecipeSection[];
}

export interface SiteDesignGenome {
  composition: SiteCompositionGrammar;
  rhythm: SiteDesignRhythm;
  geometry: SiteDesignGeometry;
  colorStrategy: SiteColorStrategy;
  mediaStrategy: SiteMediaStrategy;
  typeScale: SiteTypeScale;
  motionLanguage: SiteMotionLanguage;
}

/** Neutral values deliberately reproduce the storefront's pre-genome behavior. */
export const DEFAULT_SITE_DESIGN_GENOME: SiteDesignGenome = Object.freeze({
  composition: "editorial-split",
  rhythm: "balanced",
  geometry: "soft",
  colorStrategy: "accent-led",
  mediaStrategy: "natural",
  typeScale: "balanced",
  motionLanguage: "still",
});

function oneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === "string" && options.includes(value);
}

export function sanitizeSiteDesignGenome(value: unknown): SiteDesignGenome {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    composition: oneOf(source.composition, SITE_COMPOSITION_GRAMMARS) ? source.composition : DEFAULT_SITE_DESIGN_GENOME.composition,
    rhythm: oneOf(source.rhythm, SITE_DESIGN_RHYTHMS) ? source.rhythm : DEFAULT_SITE_DESIGN_GENOME.rhythm,
    geometry: oneOf(source.geometry, SITE_DESIGN_GEOMETRIES) ? source.geometry : DEFAULT_SITE_DESIGN_GENOME.geometry,
    colorStrategy: oneOf(source.colorStrategy, SITE_COLOR_STRATEGIES) ? source.colorStrategy : DEFAULT_SITE_DESIGN_GENOME.colorStrategy,
    mediaStrategy: oneOf(source.mediaStrategy, SITE_MEDIA_STRATEGIES) ? source.mediaStrategy : DEFAULT_SITE_DESIGN_GENOME.mediaStrategy,
    typeScale: oneOf(source.typeScale, SITE_TYPE_SCALES) ? source.typeScale : DEFAULT_SITE_DESIGN_GENOME.typeScale,
    motionLanguage: oneOf(source.motionLanguage, SITE_MOTION_LANGUAGES) ? source.motionLanguage : DEFAULT_SITE_DESIGN_GENOME.motionLanguage,
  };
}

export type SiteCapabilitySectionKind = "hero" | "story" | "catalog" | "gallery" | "contact" | "location" | "links";
export type SiteCapabilityLayout = "split" | "full-bleed" | "centered" | "offset" | "grid" | "stacked" | "rail" | "minimal";
export type SiteCapabilityMotion = "none" | "reveal" | "clip" | "drift" | "scale" | "parallax" | "story-scroll";

export const SITE_SECTION_FAMILIES = ["editorial", "cinematic", "product-led", "minimal"] as const;
export type SiteSectionFamily = (typeof SITE_SECTION_FAMILIES)[number];

export const SITE_ART_DIRECTIONS = [
  "editorial-house",
  "cinematic-atelier",
  "product-studio",
  "quiet-gallery",
  "graphic-market",
] as const;
export type SiteArtDirection = (typeof SITE_ART_DIRECTIONS)[number];

export interface SiteSectionCapability {
  layouts: readonly SiteCapabilityLayout[];
  preferredLayouts: readonly SiteCapabilityLayout[];
  motions: readonly SiteCapabilityMotion[];
  families: readonly SiteSectionFamily[];
  preferredFamilies: readonly SiteSectionFamily[];
  slots: readonly string[];
  media: { min: number; max: number };
}

export const SITE_SECTION_BLOCK_KINDS = ["group", "heading", "text", "action", "media", "commerce"] as const;
export const SITE_SECTION_BLOCK_ROLES = ["primary", "secondary", "supporting"] as const;

export type SiteSectionBlockKind = (typeof SITE_SECTION_BLOCK_KINDS)[number];
export type SiteSectionBlockRole = (typeof SITE_SECTION_BLOCK_ROLES)[number];

export interface SiteSectionBlockTextStyle {
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: "left" | "center" | "right";
  textColor?: string;
  fontStyle?: "modern" | "editorial" | "friendly" | "classic" | "geometric" | "artisan" | "condensed" | "luxury";
  textOffsetX?: number;
  textOffsetY?: number;
  textOffsetBasis?: "element" | "section";
}

export interface SiteSectionBlock {
  id: string;
  kind: SiteSectionBlockKind;
  slot: string;
  role: SiteSectionBlockRole;
  text: string;
  mediaUrl: string | null;
  style?: SiteSectionBlockTextStyle;
  children: SiteSectionBlock[];
}

type LegacyBlockSection = {
  kind: SiteCapabilitySectionKind;
  title?: string;
  body?: string;
  ctaLabel?: string;
  titleStyle?: SiteSectionBlockTextStyle;
  bodyStyle?: SiteSectionBlockTextStyle;
  mediaUrls?: string[];
  items?: Array<{
    title?: string;
    body?: string;
    mediaUrl?: string | null;
    titleStyle?: SiteSectionBlockTextStyle;
    bodyStyle?: SiteSectionBlockTextStyle;
  }>;
};

const COPY_SLOTS: Record<SiteCapabilitySectionKind, { heading: string; body: string; action: string; media: string; commerce: string }> = {
  hero: { heading: "heading", body: "body", action: "actions", media: "primary-media", commerce: "actions" },
  story: { heading: "heading", body: "body", action: "body", media: "media-rail", commerce: "chapters" },
  catalog: { heading: "heading", body: "intro", action: "footer-action", media: "products", commerce: "products" },
  gallery: { heading: "heading", body: "body", action: "caption", media: "media-grid", commerce: "media-grid" },
  contact: { heading: "heading", body: "body", action: "actions", media: "details", commerce: "details" },
  location: { heading: "heading", body: "address", action: "hours", media: "media", commerce: "map" },
  links: { heading: "heading", body: "body", action: "links", media: "links", commerce: "links" },
};

function legacyBlock(
  id: string,
  kind: SiteSectionBlockKind,
  slot: string,
  role: SiteSectionBlockRole,
  text = "",
  mediaUrl: string | null = null,
  style?: SiteSectionBlockTextStyle,
  children: SiteSectionBlock[] = [],
): SiteSectionBlock {
  return { id, kind, slot, role, text, mediaUrl, ...(style ? { style } : {}), children };
}

/** Projects the flat v1 fields into stable named blocks without changing their visual output. */
export function deriveLegacySiteSectionBlocks(section: LegacyBlockSection): SiteSectionBlock[] {
  const slots = COPY_SLOTS[section.kind];
  const blocks: SiteSectionBlock[] = [];
  if (section.title) blocks.push(legacyBlock("heading", "heading", slots.heading, "primary", section.title, null, section.titleStyle));
  if (section.body) blocks.push(legacyBlock("body", "text", slots.body, "supporting", section.body, null, section.bodyStyle));
  if (section.ctaLabel) blocks.push(legacyBlock("action", "action", slots.action, "primary", section.ctaLabel));

  if (section.kind === "story" && section.items?.length) {
    section.items.slice(0, 8).forEach((item, index) => {
      const children = [
        item.title ? legacyBlock(`chapter-${index + 1}-heading`, "heading", "chapters", "secondary", item.title, null, item.titleStyle) : null,
        item.body ? legacyBlock(`chapter-${index + 1}-body`, "text", "chapters", "supporting", item.body, null, item.bodyStyle) : null,
        item.mediaUrl ? legacyBlock(`chapter-${index + 1}-media`, "media", "chapters", "primary", "", item.mediaUrl) : null,
      ].filter((block): block is SiteSectionBlock => Boolean(block));
      if (children.length) blocks.push(legacyBlock(`chapter-${index + 1}`, "group", "chapters", "primary", "", null, undefined, children));
    });
  } else {
    (section.mediaUrls ?? []).slice(0, 8).forEach((mediaUrl, index) => {
      blocks.push(legacyBlock(`media-${index + 1}`, "media", slots.media, index === 0 ? "primary" : "secondary", "", mediaUrl));
    });
  }

  if (["catalog", "contact", "location", "links"].includes(section.kind)) {
    blocks.push(legacyBlock("commerce", "commerce", slots.commerce, "primary"));
  }
  return blocks;
}

export function siteSectionBlockSlotIsSupported(kind: SiteCapabilitySectionKind, slot: string): boolean {
  return SITE_SECTION_CAPABILITIES[kind].slots.includes(slot);
}

const COMPOSITION_SECTION_FAMILY: Record<SiteCompositionGrammar, SiteSectionFamily> = {
  "editorial-maker": "editorial",
  "editorial-split": "editorial",
  "spatial-cascade": "cinematic",
  "collection-rail": "product-led",
  "material-ledger": "product-led",
  "quiet-monument": "minimal",
  "catalog-poster": "product-led",
  "narrative-offset": "editorial",
  "gallery-axis": "cinematic",
  "studio-index": "minimal",
};

/** Resolves old documents from their page genome while preserving an explicit,
 * section-safe family chosen by generation or the merchant. */
export function resolveSiteSectionFamily(
  kind: SiteCapabilitySectionKind,
  value: unknown,
  genome: SiteDesignGenome = DEFAULT_SITE_DESIGN_GENOME,
): SiteSectionFamily {
  const capability = SITE_SECTION_CAPABILITIES[kind];
  if (oneOf(value, SITE_SECTION_FAMILIES) && capability.families.includes(value)) return value;
  const genomeFamily = COMPOSITION_SECTION_FAMILY[sanitizeSiteDesignGenome(genome).composition];
  return capability.families.includes(genomeFamily) ? genomeFamily : capability.preferredFamilies[0];
}

/**
 * The renderer contract for every section family. Nested blocks bind to these
 * names so composition can evolve without allowing arbitrary markup.
 */
export const SITE_SECTION_CAPABILITIES: Readonly<Record<SiteCapabilitySectionKind, SiteSectionCapability>> = Object.freeze({
  hero: {
    layouts: ["split", "full-bleed", "centered", "offset"],
    preferredLayouts: ["split", "full-bleed", "offset"],
    motions: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["cinematic", "editorial", "product-led"],
    slots: ["eyebrow", "heading", "body", "actions", "primary-media", "secondary-media"],
    media: { min: 0, max: 4 },
  },
  story: {
    layouts: ["split", "offset", "stacked", "rail", "centered"],
    preferredLayouts: ["offset", "stacked", "rail"],
    motions: ["none", "reveal", "clip", "drift", "parallax", "story-scroll"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["editorial", "cinematic", "minimal"],
    slots: ["heading", "body", "chapters", "media-rail"],
    media: { min: 0, max: 8 },
  },
  catalog: {
    layouts: ["grid", "stacked", "offset", "rail", "minimal"],
    preferredLayouts: ["grid", "rail", "offset"],
    motions: ["none", "reveal", "drift", "scale"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["product-led", "editorial", "minimal"],
    slots: ["heading", "intro", "filters", "products", "footer-action"],
    media: { min: 0, max: 0 },
  },
  gallery: {
    layouts: ["grid", "split", "offset", "stacked", "full-bleed", "rail"],
    preferredLayouts: ["offset", "full-bleed", "rail"],
    motions: ["none", "reveal", "clip", "drift", "scale", "parallax"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["cinematic", "editorial", "product-led"],
    slots: ["heading", "body", "media-grid", "caption"],
    media: { min: 0, max: 8 },
  },
  contact: {
    layouts: ["split", "stacked", "centered", "minimal"],
    preferredLayouts: ["split", "minimal"],
    motions: ["none", "reveal", "drift"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["minimal", "editorial", "product-led"],
    slots: ["heading", "body", "details", "actions"],
    media: { min: 0, max: 1 },
  },
  location: {
    layouts: ["split", "stacked", "full-bleed", "offset"],
    preferredLayouts: ["split", "full-bleed"],
    motions: ["none", "reveal", "clip", "parallax"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["cinematic", "editorial", "minimal"],
    slots: ["heading", "address", "hours", "map", "media"],
    media: { min: 0, max: 2 },
  },
  links: {
    layouts: ["centered", "stacked", "minimal", "rail"],
    preferredLayouts: ["centered", "rail"],
    motions: ["none", "reveal", "drift"],
    families: SITE_SECTION_FAMILIES,
    preferredFamilies: ["minimal", "editorial", "product-led"],
    slots: ["heading", "body", "links"],
    media: { min: 0, max: 1 },
  },
});

export interface SiteArtDirectionPreset {
  id: SiteArtDirection;
  label: string;
  summary: string;
  character: string;
  designGenome: SiteDesignGenome;
  theme: {
    headingFont: "grotesk" | "editorial" | "humanist" | "geometric" | "classic" | "mono" | "artisan" | "condensed" | "luxury";
    bodyFont: "grotesk" | "editorial" | "humanist" | "geometric" | "classic" | "mono" | "artisan" | "condensed" | "luxury";
    radius: number;
    shadow: "none" | "soft" | "lifted";
    productLayout: "gallery" | "editorial" | "compact" | "showcase";
    displayScale: "balanced" | "dramatic" | "monumental";
    density: "airy" | "balanced" | "dense";
    imageTreatment: "natural" | "cinematic" | "cutout" | "editorial";
  };
  navigation: {
    layout: "brand-left" | "centered" | "split";
    sticky: boolean;
    transparent: boolean;
    logoTreatment: "mark" | "wordmark" | "oversized" | "seal";
  };
  motion: { intensity: "restrained" | "expressive" | "cinematic" };
  merchandising: {
    spotlightLayout: "feature-first" | "alternating" | "lookbook" | "collection";
    showDescriptions: boolean;
  };
  sections: Readonly<Record<SiteCapabilitySectionKind, {
    family: SiteSectionFamily;
    layout: SiteCapabilityLayout;
    width: "full" | "wide" | "contained";
    align: "left" | "center" | "right";
  }>>;
}

/** Five complete visual systems. They intentionally omit palette values: the
 * merchant's brand colors survive while structure, type, rhythm and media
 * treatment move together. */
export const SITE_ART_DIRECTION_PRESETS: Readonly<Record<SiteArtDirection, SiteArtDirectionPreset>> = Object.freeze({
  "editorial-house": {
    id: "editorial-house",
    label: "Casa editorial",
    summary: "Relato asimétrico, tipografía con voz y catálogo como una publicación.",
    character: "Copy primero · aire amplio · imágenes enmarcadas",
    designGenome: { composition: "narrative-offset", rhythm: "editorial", geometry: "borderless", colorStrategy: "accent-led", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "reveal" },
    theme: { headingFont: "editorial", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "editorial" },
    navigation: { layout: "split", sticky: false, transparent: false, logoTreatment: "wordmark" },
    motion: { intensity: "restrained" },
    merchandising: { spotlightLayout: "feature-first", showDescriptions: true },
    sections: {
      hero: { family: "editorial", layout: "split", width: "wide", align: "left" },
      story: { family: "editorial", layout: "offset", width: "wide", align: "left" },
      catalog: { family: "product-led", layout: "offset", width: "wide", align: "left" },
      gallery: { family: "editorial", layout: "offset", width: "full", align: "left" },
      contact: { family: "minimal", layout: "minimal", width: "contained", align: "left" },
      location: { family: "editorial", layout: "split", width: "wide", align: "left" },
      links: { family: "minimal", layout: "centered", width: "contained", align: "center" },
    },
  },
  "cinematic-atelier": {
    id: "cinematic-atelier",
    label: "Atelier cinematográfico",
    summary: "Medios inmersivos, escala monumental y capítulos que se sienten dirigidos.",
    character: "Imagen primero · ritmo pausado · escenas amplias",
    designGenome: { composition: "gallery-axis", rhythm: "cinematic", geometry: "framed", colorStrategy: "surface-led", mediaStrategy: "full-bleed", typeScale: "cinematic", motionLanguage: "cinematic" },
    theme: { headingFont: "editorial", bodyFont: "humanist", radius: 2, shadow: "lifted", productLayout: "showcase", displayScale: "monumental", density: "airy", imageTreatment: "cinematic" },
    navigation: { layout: "brand-left", sticky: false, transparent: true, logoTreatment: "oversized" },
    motion: { intensity: "cinematic" },
    merchandising: { spotlightLayout: "lookbook", showDescriptions: true },
    sections: {
      hero: { family: "cinematic", layout: "full-bleed", width: "full", align: "left" },
      story: { family: "cinematic", layout: "stacked", width: "full", align: "left" },
      catalog: { family: "product-led", layout: "grid", width: "wide", align: "left" },
      gallery: { family: "cinematic", layout: "grid", width: "wide", align: "left" },
      contact: { family: "cinematic", layout: "split", width: "wide", align: "left" },
      location: { family: "cinematic", layout: "split", width: "wide", align: "left" },
      links: { family: "minimal", layout: "centered", width: "contained", align: "center" },
    },
  },
  "product-studio": {
    id: "product-studio",
    label: "Estudio de producto",
    summary: "Sistema preciso, comparación clara y mercancía siempre en primer plano.",
    character: "Producto primero · retícula firme · decisiones rápidas",
    designGenome: { composition: "material-ledger", rhythm: "balanced", geometry: "structured", colorStrategy: "contrast-blocks", mediaStrategy: "framed", typeScale: "balanced", motionLanguage: "tactile" },
    theme: { headingFont: "geometric", bodyFont: "grotesk", radius: 2, shadow: "none", productLayout: "gallery", displayScale: "balanced", density: "balanced", imageTreatment: "natural" },
    navigation: { layout: "split", sticky: true, transparent: false, logoTreatment: "mark" },
    motion: { intensity: "expressive" },
    merchandising: { spotlightLayout: "feature-first", showDescriptions: true },
    sections: {
      hero: { family: "product-led", layout: "split", width: "wide", align: "left" },
      story: { family: "editorial", layout: "split", width: "wide", align: "left" },
      catalog: { family: "product-led", layout: "grid", width: "wide", align: "left" },
      gallery: { family: "product-led", layout: "grid", width: "wide", align: "left" },
      contact: { family: "product-led", layout: "split", width: "wide", align: "left" },
      location: { family: "editorial", layout: "split", width: "wide", align: "left" },
      links: { family: "minimal", layout: "rail", width: "wide", align: "left" },
    },
  },
  "quiet-gallery": {
    id: "quiet-gallery",
    label: "Galería silenciosa",
    summary: "Una dirección contenida donde cada pieza respira y nada compite con ella.",
    character: "Esencial · monocromía · ritmo contemplativo",
    designGenome: { composition: "quiet-monument", rhythm: "editorial", geometry: "borderless", colorStrategy: "monochrome", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "still" },
    theme: { headingFont: "classic", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "balanced", density: "airy", imageTreatment: "editorial" },
    navigation: { layout: "centered", sticky: false, transparent: false, logoTreatment: "wordmark" },
    motion: { intensity: "restrained" },
    merchandising: { spotlightLayout: "collection", showDescriptions: true },
    sections: {
      hero: { family: "minimal", layout: "centered", width: "contained", align: "center" },
      story: { family: "minimal", layout: "centered", width: "contained", align: "center" },
      catalog: { family: "minimal", layout: "minimal", width: "wide", align: "left" },
      gallery: { family: "minimal", layout: "stacked", width: "contained", align: "left" },
      contact: { family: "minimal", layout: "minimal", width: "contained", align: "left" },
      location: { family: "minimal", layout: "split", width: "contained", align: "left" },
      links: { family: "minimal", layout: "centered", width: "contained", align: "center" },
    },
  },
  "graphic-market": {
    id: "graphic-market",
    label: "Mercado gráfico",
    summary: "Composición enérgica, formas recortadas y un catálogo con pulso de cartel.",
    character: "Escala póster · contraste · ritmo compacto",
    designGenome: { composition: "spatial-cascade", rhythm: "compact", geometry: "cut-paper", colorStrategy: "contrast-blocks", mediaStrategy: "collage", typeScale: "poster", motionLanguage: "tactile" },
    theme: { headingFont: "geometric", bodyFont: "humanist", radius: 4, shadow: "soft", productLayout: "gallery", displayScale: "monumental", density: "dense", imageTreatment: "cutout" },
    navigation: { layout: "split", sticky: true, transparent: false, logoTreatment: "seal" },
    motion: { intensity: "expressive" },
    merchandising: { spotlightLayout: "alternating", showDescriptions: true },
    sections: {
      hero: { family: "product-led", layout: "offset", width: "wide", align: "left" },
      story: { family: "editorial", layout: "rail", width: "wide", align: "left" },
      catalog: { family: "product-led", layout: "rail", width: "full", align: "left" },
      gallery: { family: "cinematic", layout: "offset", width: "full", align: "left" },
      contact: { family: "cinematic", layout: "split", width: "wide", align: "left" },
      location: { family: "cinematic", layout: "offset", width: "full", align: "left" },
      links: { family: "product-led", layout: "rail", width: "wide", align: "left" },
    },
  },
});

export function isSiteArtDirection(value: unknown): value is SiteArtDirection {
  return oneOf(value, SITE_ART_DIRECTIONS);
}

type SiteArtDirectionDocument = {
  artDirection?: SiteArtDirection;
  designGenome: SiteDesignGenome;
  theme: SiteArtDirectionPreset["theme"];
  navigation: SiteArtDirectionPreset["navigation"];
  motion: SiteArtDirectionPreset["motion"];
  merchandising: SiteArtDirectionPreset["merchandising"];
  sections: Array<{
    kind: SiteCapabilitySectionKind;
    family?: SiteSectionFamily;
    layout: SiteCapabilityLayout;
    width: "full" | "wide" | "contained";
    align: "left" | "center" | "right";
  }>;
};

/** Applies one coherent world without touching brand colors, copy, media,
 * product bindings, section order or commerce behavior. */
export function applySiteArtDirection<T extends SiteArtDirectionDocument>(document: T, value: unknown): T {
  if (!isSiteArtDirection(value)) return document;
  const preset = SITE_ART_DIRECTION_PRESETS[value];
  return {
    ...document,
    artDirection: preset.id,
    designGenome: { ...preset.designGenome },
    theme: { ...document.theme, ...preset.theme },
    navigation: { ...document.navigation, ...preset.navigation },
    motion: { ...document.motion, ...preset.motion },
    merchandising: { ...document.merchandising, ...preset.merchandising },
    sections: document.sections.map((section) => {
      const plan = preset.sections[section.kind];
      return { ...section, ...plan };
    }),
  } as T;
}

export function siteSectionSupportsCapability(
  kind: SiteCapabilitySectionKind,
  layout: SiteCapabilityLayout,
  motion: SiteCapabilityMotion,
  mediaCount?: number,
  family?: SiteSectionFamily,
): boolean {
  const capability = SITE_SECTION_CAPABILITIES[kind];
  return capability.layouts.includes(layout)
    && capability.motions.includes(motion)
    && (family === undefined || capability.families.includes(family))
    && (mediaCount === undefined || (mediaCount >= capability.media.min && mediaCount <= capability.media.max));
}
