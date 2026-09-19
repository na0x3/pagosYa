import { createHash } from "node:crypto";
import {
  SITE_COLOR_STRATEGIES,
  SITE_COMPOSITION_GRAMMARS,
  SITE_DESIGN_GEOMETRIES,
  SITE_DESIGN_RHYTHMS,
  SITE_MEDIA_STRATEGIES,
  SITE_MOTION_LANGUAGES,
  SITE_SECTION_CAPABILITIES,
  SITE_TYPE_SCALES,
  deriveLegacySiteSectionBlocks,
  isSiteArtDirection,
  resolveSiteSectionFamily,
  sanitizeSiteDesignGenome,
  type SiteCapabilityLayout,
  type SiteCapabilitySectionKind,
  type SiteCompositionGrammar,
  type SiteCreativeRecipe,
  type SiteCreativeRecipeBlock,
  type SiteSectionBlock,
  type SiteSectionFamily,
  type SiteSemanticMediaBinding,
  type SiteSemanticMediaRole,
  type SiteWeightedOption,
} from "@pagosya/shared-types";
import type { StoreSiteDocument } from "./site-document";

export interface StorefrontEngineContext {
  brandFingerprint: string;
  generation: number;
  seed: number;
}

export interface StorefrontEngineMetadata {
  version: "2.0";
  brandFingerprint: string;
  generation: number;
  seed: number;
  grammar: string;
}

export interface StorefrontOriginalityResult {
  accepted: boolean;
  closestSimilarity: number;
}

export interface StorefrontSemanticMediaCandidate {
  url: string;
  roles: readonly SiteSemanticMediaRole[];
  priority?: number;
}

export interface StorefrontStructuralSignature {
  version: 1;
  fingerprint: string;
  features: string[];
}

export interface StorefrontDiversityReport {
  accepted: boolean;
  documentCount: number;
  uniqueOpenings: number;
  uniqueOrders: number;
  uniqueGrammars: number;
  maximumPairSimilarity: number;
  averagePairSimilarity: number;
}

type StorefrontTopologyTreatment = {
  family: SiteSectionFamily;
  layout: SiteCapabilityLayout;
  width: "full" | "wide" | "contained";
  align: "left" | "center" | "right";
  /** Content-free asset intent. URLs are resolved from the destination store. */
  mediaBindings?: readonly SiteSemanticMediaBinding[];
};

export interface StorefrontTopologyPlan {
  id: string;
  grammar: SiteCompositionGrammar;
  order: readonly SiteCapabilitySectionKind[];
  sections: Partial<Record<SiteCapabilitySectionKind, StorefrontTopologyTreatment>>;
}

/** Content-free page topologies. These change the opening, narrative order and
 * section anatomy together; they are intentionally not cosmetic presets. */
export const STOREFRONT_TOPOLOGY_PLANS: readonly StorefrontTopologyPlan[] = Object.freeze([
  {
    id: "editorial-maker", grammar: "editorial-maker",
    order: ["hero", "catalog", "gallery", "story", "location", "contact", "links"],
    sections: {
      hero: {
        family: "cinematic", layout: "full-bleed", width: "full", align: "left",
        mediaBindings: [{ slot: "primary-media", role: "campaign-image", cardinality: 2 }],
      },
      catalog: { family: "product-led", layout: "grid", width: "full", align: "left" },
      gallery: {
        family: "editorial", layout: "grid", width: "full", align: "left",
        mediaBindings: [
          { slot: "media-grid", role: "process-image", cardinality: 2 },
          { slot: "media-grid", role: "ambient-detail", cardinality: 2 },
        ],
      },
      story: {
        family: "editorial", layout: "offset", width: "wide", align: "left",
        mediaBindings: [
          { slot: "media-rail", role: "founder-or-story", cardinality: 1 },
          { slot: "media-rail", role: "process-image", cardinality: 2 },
        ],
      },
      location: { family: "cinematic", layout: "split", width: "full", align: "left" },
      contact: { family: "minimal", layout: "minimal", width: "contained", align: "left" },
      links: { family: "minimal", layout: "minimal", width: "contained", align: "left" },
    },
  },
  {
    id: "editorial-prologue", grammar: "narrative-offset",
    order: ["story", "catalog", "hero", "gallery", "contact", "location", "links"],
    sections: {
      story: { family: "editorial", layout: "offset", width: "wide", align: "left" },
      hero: { family: "editorial", layout: "split", width: "wide", align: "left" },
      gallery: { family: "editorial", layout: "offset", width: "full", align: "left" },
      catalog: { family: "product-led", layout: "offset", width: "wide", align: "left" },
    },
  },
  {
    id: "collection-index", grammar: "collection-rail",
    order: ["hero", "catalog", "story", "gallery", "contact", "links", "location"],
    sections: {
      catalog: { family: "product-led", layout: "rail", width: "full", align: "left" },
      hero: { family: "product-led", layout: "split", width: "wide", align: "left" },
      gallery: { family: "product-led", layout: "grid", width: "wide", align: "left" },
      story: { family: "editorial", layout: "rail", width: "wide", align: "left" },
    },
  },
  {
    id: "image-overture", grammar: "gallery-axis",
    order: ["gallery", "catalog", "hero", "story", "contact", "location", "links"],
    sections: {
      gallery: { family: "cinematic", layout: "full-bleed", width: "full", align: "left" },
      hero: { family: "cinematic", layout: "full-bleed", width: "full", align: "left" },
      story: { family: "cinematic", layout: "stacked", width: "full", align: "left" },
      catalog: { family: "product-led", layout: "grid", width: "wide", align: "left" },
    },
  },
  {
    id: "campaign-cut", grammar: "spatial-cascade",
    order: ["hero", "catalog", "gallery", "story", "contact", "links", "location"],
    sections: {
      hero: { family: "product-led", layout: "offset", width: "wide", align: "left" },
      gallery: { family: "cinematic", layout: "offset", width: "full", align: "left" },
      catalog: { family: "product-led", layout: "grid", width: "full", align: "left" },
      story: { family: "editorial", layout: "rail", width: "wide", align: "left" },
    },
  },
  {
    id: "quiet-collection", grammar: "quiet-monument",
    order: ["hero", "catalog", "story", "gallery", "contact", "location", "links"],
    sections: {
      hero: { family: "minimal", layout: "centered", width: "contained", align: "center" },
      catalog: { family: "minimal", layout: "minimal", width: "wide", align: "left" },
      story: { family: "minimal", layout: "centered", width: "contained", align: "center" },
      gallery: { family: "minimal", layout: "stacked", width: "contained", align: "left" },
    },
  },
  {
    id: "catalog-poster", grammar: "catalog-poster",
    order: ["hero", "catalog", "story", "gallery", "links", "contact", "location"],
    sections: {
      catalog: { family: "product-led", layout: "grid", width: "full", align: "left" },
      hero: { family: "product-led", layout: "offset", width: "wide", align: "left" },
      story: { family: "editorial", layout: "split", width: "wide", align: "left" },
      gallery: { family: "product-led", layout: "grid", width: "full", align: "left" },
    },
  },
  {
    id: "studio-index", grammar: "studio-index",
    order: ["story", "catalog", "gallery", "hero", "contact", "location", "links"],
    sections: {
      catalog: { family: "minimal", layout: "stacked", width: "wide", align: "left" },
      story: { family: "minimal", layout: "rail", width: "wide", align: "left" },
      gallery: { family: "editorial", layout: "grid", width: "wide", align: "left" },
      hero: { family: "minimal", layout: "centered", width: "contained", align: "center" },
    },
  },
  {
    id: "material-story", grammar: "material-ledger",
    order: ["story", "catalog", "hero", "gallery", "contact", "links", "location"],
    sections: {
      story: { family: "product-led", layout: "split", width: "wide", align: "left" },
      catalog: { family: "product-led", layout: "stacked", width: "wide", align: "left" },
      hero: { family: "editorial", layout: "split", width: "wide", align: "left" },
      gallery: { family: "product-led", layout: "grid", width: "wide", align: "left" },
    },
  },
  {
    id: "split-house", grammar: "editorial-split",
    order: ["story", "catalog", "hero", "contact", "gallery", "location", "links"],
    sections: {
      hero: { family: "editorial", layout: "split", width: "wide", align: "left" },
      story: { family: "cinematic", layout: "offset", width: "wide", align: "left" },
      catalog: { family: "product-led", layout: "offset", width: "wide", align: "left" },
      gallery: { family: "cinematic", layout: "split", width: "full", align: "left" },
    },
  },
  {
    id: "visual-ledger", grammar: "spatial-cascade",
    order: ["gallery", "catalog", "story", "hero", "contact", "links", "location"],
    sections: {
      gallery: { family: "cinematic", layout: "offset", width: "full", align: "left" },
      catalog: { family: "product-led", layout: "rail", width: "full", align: "left" },
      story: { family: "editorial", layout: "stacked", width: "wide", align: "left" },
      hero: { family: "product-led", layout: "offset", width: "wide", align: "left" },
    },
  },
  {
    id: "commerce-narrative", grammar: "material-ledger",
    order: ["story", "catalog", "hero", "contact", "gallery", "links", "location"],
    sections: {
      catalog: { family: "product-led", layout: "stacked", width: "wide", align: "left" },
      story: { family: "editorial", layout: "split", width: "wide", align: "left" },
      hero: { family: "minimal", layout: "centered", width: "contained", align: "center" },
      gallery: { family: "minimal", layout: "stacked", width: "contained", align: "left" },
    },
  },
  {
    id: "manifesto-close", grammar: "narrative-offset",
    order: ["story", "catalog", "gallery", "contact", "hero", "location", "links"],
    sections: {
      story: { family: "editorial", layout: "offset", width: "wide", align: "left" },
      gallery: { family: "cinematic", layout: "full-bleed", width: "full", align: "left" },
      catalog: { family: "minimal", layout: "minimal", width: "wide", align: "left" },
      hero: { family: "editorial", layout: "split", width: "wide", align: "left" },
    },
  },
]);

/** Small process-local LRU for expensive, deterministic strategy work. The
 * final compositions are deliberately never cached: every generation run gets
 * a fresh seed while the same unchanged brand analysis can be reused. */
export class TtlLruCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly maxEntries = 64, private readonly ttlMs = 15 * 60_000) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
}

const generationRuns = new Map<string, number>();
export function storefrontBrandFingerprint(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 20);
}

export function beginStorefrontGeneration(brandFingerprint: string): StorefrontEngineContext {
  const generation = generationRuns.get(brandFingerprint) ?? 0;
  generationRuns.set(brandFingerprint, generation + 1);
  const seedHex = createHash("sha256").update(`${brandFingerprint}:${generation}`).digest("hex").slice(0, 8);
  return { brandFingerprint, generation, seed: Number.parseInt(seedHex, 16) };
}

export function storefrontGrammar(context: StorefrontEngineContext, directionIndex: number): SiteCompositionGrammar {
  return SITE_COMPOSITION_GRAMMARS[(context.seed + directionIndex * 4) % SITE_COMPOSITION_GRAMMARS.length];
}

export function storefrontTopologyPlan(
  context: StorefrontEngineContext,
  directionIndex: number,
  attempt = 0,
): StorefrontTopologyPlan {
  const index = (context.seed + directionIndex * 5 + attempt * 7) % STOREFRONT_TOPOLOGY_PLANS.length;
  return STOREFRONT_TOPOLOGY_PLANS[index];
}

/** Applies one coherent macro composition while retaining every section's
 * content, media bindings, commerce behavior and stable id. */
export function applyStorefrontTopology(
  document: StoreSiteDocument,
  context: StorefrontEngineContext,
  directionIndex: number,
  attempt = 0,
  lockedSectionIds: readonly string[] = [],
  mediaCandidates: readonly StorefrontSemanticMediaCandidate[] = [],
): StoreSiteDocument {
  const plan = storefrontTopologyPlan(context, directionIndex, attempt);
  const locked = new Set(lockedSectionIds);
  const rank = new Map(plan.order.map((kind, index) => [kind, index]));
  const orderedSections = document.sections
    .map((section, sourceIndex) => {
      const treatment = plan.sections[section.kind];
      const visualTreatment = treatment ? {
        family: treatment.family,
        layout: treatment.layout,
        width: treatment.width,
        align: treatment.align,
      } : null;
      return {
        section: visualTreatment && !locked.has(section.id) ? { ...section, ...visualTreatment } : section,
        sourceIndex,
      };
    })
    .sort((left, right) => {
      const leftRank = rank.get(left.section.kind) ?? plan.order.length + left.sourceIndex;
      const rightRank = rank.get(right.section.kind) ?? plan.order.length + right.sourceIndex;
      return leftRank - rightRank || left.sourceIndex - right.sourceIndex;
    })
    .map(({ section }) => section);
  const usedMedia = new Set<string>();
  const mediaForBindings = (bindings: readonly SiteSemanticMediaBinding[]) => {
    const urls: string[] = [];
    bindings.forEach((binding) => {
      const preferred = mediaCandidates.filter((candidate) => candidate.roles.includes(binding.role) && !usedMedia.has(candidate.url));
      const fallback = mediaCandidates.filter((candidate) => !usedMedia.has(candidate.url) && !candidate.roles.includes("logo"));
      let selectedForBinding = 0;
      (preferred.length ? preferred : fallback).forEach((candidate) => {
        if (selectedForBinding >= binding.cardinality || usedMedia.has(candidate.url)) return;
        urls.push(candidate.url);
        usedMedia.add(candidate.url);
        selectedForBinding += 1;
      });
    });
    return urls;
  };
  const bindBlockMedia = (blocks: readonly SiteSectionBlock[], urls: readonly string[]) => {
    let cursor = 0;
    const visit = (block: SiteSectionBlock): SiteSectionBlock => ({
      ...block,
      ...(block.kind === "media" && cursor < urls.length ? { mediaUrl: urls[cursor++] } : {}),
      children: block.children.map(visit),
    });
    return blocks.map(visit);
  };
  const sections = orderedSections.map((sourceSection, index) => {
    let section = index === 0 && plan.grammar === "editorial-maker" && !locked.has(sourceSection.id)
      ? { ...sourceSection, motion: "clip" as const }
      : index === 0 && sourceSection.motion === "none"
        ? { ...sourceSection, motion: sourceSection.kind === "story" ? "story-scroll" as const : "reveal" as const }
        : sourceSection;
    const bindings = plan.sections[section.kind]?.mediaBindings;
    if (!locked.has(section.id) && bindings?.length && mediaCandidates.length) {
      const mediaUrls = mediaForBindings(bindings);
      if (mediaUrls.length) {
        const sourceBlocks = section.blocks ?? [];
        const mediaBlockCount = sourceBlocks.flatMap((block) => [block, ...block.children]).filter((block) => block.kind === "media").length;
        const blocks = mediaBlockCount >= mediaUrls.length
          ? bindBlockMedia(sourceBlocks, mediaUrls)
          : deriveLegacySiteSectionBlocks({ ...section, mediaUrls });
        section = { ...section, mediaUrls, blocks };
      }
    }
    return section;
  });
  const engine = "engine" in document && document.engine && typeof document.engine === "object"
    ? { ...document.engine, grammar: plan.grammar }
    : undefined;
  return {
    ...document,
    designGenome: { ...sanitizeSiteDesignGenome(document.designGenome), composition: plan.grammar },
    sections,
    ...(engine ? { engine } : {}),
  } as StoreSiteDocument;
}

function preferredWeights<T extends string>(selected: T, values: readonly T[]): SiteWeightedOption<T>[] {
  return values.map((value) => ({ value, weight: value === selected ? 8 : 1 }));
}

function semanticMediaRole(kind: SiteCapabilitySectionKind, slot: string): SiteSemanticMediaRole {
  if (slot.includes("logo")) return "logo";
  if (slot.includes("product")) return slot.includes("detail") ? "product-detail" : "featured-product";
  if (slot.includes("texture") || slot.includes("background")) return "brand-texture";
  if (slot.includes("process") || slot.includes("chapter")) return "process-image";
  return kind === "hero"
    ? slot.includes("secondary") ? "campaign-image" : "featured-product"
    : kind === "story"
      ? slot.includes("media") ? "founder-or-story" : "process-image"
      : kind === "gallery"
        ? "editorial"
        : kind === "location"
          ? "lifestyle"
          : "none";
}

function recipeBlocks(blocks: readonly SiteSectionBlock[]): SiteCreativeRecipeBlock[] {
  return blocks.map((block) => ({
    kind: block.kind,
    slot: block.slot,
    role: block.role,
    children: recipeBlocks(block.children),
  }));
}

function mediaBindingsForSection(kind: SiteCapabilitySectionKind, blocks: readonly SiteSectionBlock[], count: number): SiteSemanticMediaBinding[] {
  const mediaBlocks = blocks.flatMap((block) => [block, ...block.children]).filter((block) => block.kind === "media");
  if (mediaBlocks.length) {
    const bySlot = new Map<string, SiteSemanticMediaBinding>();
    mediaBlocks.forEach((block) => {
      const existing = bySlot.get(block.slot);
      if (existing) existing.cardinality += 1;
      else bySlot.set(block.slot, { slot: block.slot, role: semanticMediaRole(kind, block.slot), cardinality: 1 });
    });
    return [...bySlot.values()];
  }
  if (SITE_SECTION_CAPABILITIES[kind].media.max === 0) return [];
  const slot = SITE_SECTION_CAPABILITIES[kind].slots.find((candidate) => candidate.includes("media")) || "media";
  return [{ slot, role: semanticMediaRole(kind, slot), cardinality: Math.min(SITE_SECTION_CAPABILITIES[kind].media.max, Math.max(1, count)) }];
}

function recipeOrderOptions(order: SiteCapabilitySectionKind[]) {
  const unique = new Map<string, { value: SiteCapabilitySectionKind[]; weight: number }>();
  const add = (value: SiteCapabilitySectionKind[], weight: number) => {
    const key = value.join("/");
    if (!unique.has(key)) unique.set(key, { value, weight });
  };
  add([...order], 8);
  if (order.length > 3) add([...order.slice(1), order[0]], 2);
  const narrative = order.filter((kind) => ["hero", "story", "catalog", "gallery"].includes(kind)).reverse();
  const utility = order.filter((kind) => !narrative.includes(kind));
  add([...narrative, ...utility], 1);
  return [...unique.values()];
}

/** Builds a portable, weighted recipe without carrying merchant-owned content. */
export function storefrontCreativeRecipe(document: StoreSiteDocument, name: string): SiteCreativeRecipe {
  const genome = sanitizeSiteDesignGenome(document.designGenome);
  const sections = document.sections.map((section) => {
    const blocks = section.blocks ?? [];
    return {
    kind: section.kind,
    family: preferredWeights(resolveSiteSectionFamily(section.kind, section.family, genome), ["editorial", "cinematic", "product-led", "minimal"] as const),
    layout: preferredWeights(section.layout, ["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"] as const),
    width: preferredWeights(section.width, ["full", "wide", "contained"] as const),
    align: preferredWeights(section.align, ["left", "center", "right"] as const),
    motion: preferredWeights(section.motion, ["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll"] as const),
    blocks: recipeBlocks(blocks),
    mediaBindings: mediaBindingsForSection(section.kind, blocks, section.mediaUrls.length),
  };
  });
  return {
    version: 1,
    name: name.trim().slice(0, 80),
    genome: {
      composition: preferredWeights(genome.composition, SITE_COMPOSITION_GRAMMARS),
      rhythm: preferredWeights(genome.rhythm, SITE_DESIGN_RHYTHMS),
      geometry: preferredWeights(genome.geometry, SITE_DESIGN_GEOMETRIES),
      colorStrategy: preferredWeights(genome.colorStrategy, SITE_COLOR_STRATEGIES),
      mediaStrategy: preferredWeights(genome.mediaStrategy, SITE_MEDIA_STRATEGIES),
      typeScale: preferredWeights(genome.typeScale, SITE_TYPE_SCALES),
      motionLanguage: preferredWeights(genome.motionLanguage, SITE_MOTION_LANGUAGES),
    },
    sectionOrders: recipeOrderOptions(sections.map((section) => section.kind)),
    theme: {
      headingFont: preferredWeights(document.theme.headingFont, ["grotesk", "editorial", "humanist", "geometric", "classic", "mono"] as const),
      bodyFont: preferredWeights(document.theme.bodyFont, ["grotesk", "editorial", "humanist", "geometric", "classic", "mono"] as const),
      productLayout: preferredWeights(document.theme.productLayout, ["gallery", "editorial", "compact", "showcase"] as const),
      displayScale: preferredWeights(document.theme.displayScale, ["balanced", "dramatic", "monumental"] as const),
      density: preferredWeights(document.theme.density, ["airy", "balanced", "dense"] as const),
      imageTreatment: preferredWeights(document.theme.imageTreatment, ["natural", "cinematic", "cutout", "editorial"] as const),
    },
    navigation: {
      layout: preferredWeights(document.navigation.layout, ["brand-left", "centered", "split"] as const),
      logoTreatment: preferredWeights(document.navigation.logoTreatment, ["mark", "wordmark", "oversized", "seal"] as const),
    },
    merchandising: {
      spotlightLayout: preferredWeights(document.merchandising.spotlightLayout, ["feature-first", "alternating", "lookbook", "collection"] as const),
    },
    sectionOrder: sections.map((section) => section.kind),
    sections,
  };
}

/** Deterministic weighted selection, suitable for reproducible generation seeds. */
export function storefrontWeightedChoice<T extends string>(options: readonly SiteWeightedOption<T>[], seed: number): T {
  const enabled = options.filter((option) => Number.isFinite(option.weight) && option.weight > 0);
  if (!enabled.length) throw new Error("At least one weighted storefront option must be enabled");
  const total = enabled.reduce((sum, option) => sum + option.weight, 0);
  let cursor = (seed >>> 0) / 0x1_0000_0000 * total;
  for (const option of enabled) {
    cursor -= option.weight;
    if (cursor < 0) return option.value;
  }
  return enabled[enabled.length - 1].value;
}

function seededAxis(context: StorefrontEngineContext, directionIndex: number, attempt: number, axis: string): number {
  return Number.parseInt(createHash("sha256")
    .update(`${context.seed}:${directionIndex}:${attempt}:${axis}`)
    .digest("hex")
    .slice(0, 8), 16);
}

/**
 * Re-rolls bounded visual axes with a strong bias toward the authored
 * direction. This gives the originality gate a coherent alternative instead
 * of falling back to random CSS or merely changing colors.
 */
export function varyStorefrontStructure(
  document: StoreSiteDocument,
  context: StorefrontEngineContext,
  directionIndex: number,
  attempt: number,
  lockedSectionIds: readonly string[] = [],
  mediaCandidates: readonly StorefrontSemanticMediaCandidate[] = [],
): StoreSiteDocument {
  const locked = new Set(lockedSectionIds);
  const genome = sanitizeSiteDesignGenome(document.designGenome);
  const choose = <T extends string>(selected: T, values: readonly T[], axis: string) => storefrontWeightedChoice(
    preferredWeights(selected, values),
    seededAxis(context, directionIndex, attempt, axis),
  );
  const nextGenome = {
    composition: choose(genome.composition, SITE_COMPOSITION_GRAMMARS, "composition"),
    rhythm: choose(genome.rhythm, SITE_DESIGN_RHYTHMS, "rhythm"),
    geometry: choose(genome.geometry, SITE_DESIGN_GEOMETRIES, "geometry"),
    colorStrategy: choose(genome.colorStrategy, SITE_COLOR_STRATEGIES, "color"),
    mediaStrategy: choose(genome.mediaStrategy, SITE_MEDIA_STRATEGIES, "media"),
    typeScale: choose(genome.typeScale, SITE_TYPE_SCALES, "type"),
    motionLanguage: choose(genome.motionLanguage, SITE_MOTION_LANGUAGES, "motion-language"),
  };
  const sections = document.sections.map((section, index) => {
    if (locked.has(section.id)) return section;
    const capability = SITE_SECTION_CAPABILITIES[section.kind];
    // Historical proposal JSON predates the current section capability
    // contract. Keep an unknown legacy section stable while varying the
    // supported sections instead of crashing proposal generation.
    if (!capability) return section;
    return {
      ...section,
      family: choose(resolveSiteSectionFamily(section.kind, section.family, genome), capability.families, `family:${index}`),
      layout: choose(section.layout, capability.layouts, `layout:${index}`),
      width: choose(section.width, ["full", "wide", "contained"] as const, `width:${index}`),
      align: choose(section.align, ["left", "center", "right"] as const, `align:${index}`),
      motion: section.kind === "story" && section.motion === "story-scroll"
        ? section.motion
        : choose(section.motion, capability.motions, `motion:${index}`),
    };
  });
  return applyStorefrontTopology(
    { ...document, designGenome: nextGenome, sections } as StoreSiteDocument,
    context,
    directionIndex,
    attempt,
    lockedSectionIds,
    mediaCandidates,
  );
}

/** Materializes a content-free recipe against the destination store's content. */
export function applyStorefrontCreativeRecipe(
  document: StoreSiteDocument,
  recipe: SiteCreativeRecipe,
  context: StorefrontEngineContext,
  directionIndex: number,
  mediaCandidates: readonly StorefrontSemanticMediaCandidate[] = [],
  attempt = 0,
): StoreSiteDocument {
  if (recipe?.version !== 1 || !Array.isArray(recipe.sections)) throw new Error("Invalid storefront creative recipe");
  const pick = <T extends string>(options: readonly SiteWeightedOption<T>[], axis: string) => storefrontWeightedChoice(
    options,
    seededAxis(context, directionIndex, attempt, `recipe:${axis}`),
  );
  const pickOptional = <T extends string>(options: readonly SiteWeightedOption<T>[] | undefined, fallback: T, axis: string): T =>
    Array.isArray(options) && options.length ? pick<T>(options, axis) : fallback;
  const pickSequence = <T extends string>(
    options: ReadonlyArray<{ value: T[]; weight: number }> | undefined,
    fallback: T[],
    axis: string,
  ): T[] => {
    const enabled = (options ?? []).filter((option) => Array.isArray(option.value) && Number.isFinite(option.weight) && option.weight > 0);
    if (!enabled.length) return fallback;
    const total = enabled.reduce((sum, option) => sum + option.weight, 0);
    let cursor = (seededAxis(context, directionIndex, attempt, `recipe:${axis}`) >>> 0) / 0x1_0000_0000 * total;
    for (const option of enabled) {
      cursor -= option.weight;
      if (cursor < 0) return [...option.value];
    }
    return [...enabled[enabled.length - 1].value];
  };
  const fallbackCandidates: StorefrontSemanticMediaCandidate[] = document.sections
    .flatMap((section) => section.mediaUrls)
    .concat(document.experience.mediaUrls)
    .filter((url, index, all) => Boolean(url) && all.indexOf(url) === index)
    .map((url, index) => ({ url, roles: ["editorial", "lifestyle", "ambient-detail"], priority: index }));
  const candidates = (mediaCandidates.length ? mediaCandidates : fallbackCandidates)
    .filter((candidate, index, all) => Boolean(candidate.url) && all.findIndex((entry) => entry.url === candidate.url) === index)
    .map((candidate, index) => ({ ...candidate, priority: candidate.priority ?? index }))
    .sort((left, right) => left.priority - right.priority);
  // Prefer a different destination asset for each recipe slot across the page.
  // Sparse catalogs can still reuse an eligible image after the unique pool is
  // exhausted, so applying a recipe never empties a required media section.
  const pageUsedMedia = new Set<string>();
  const resolveBindings = (bindings: readonly SiteSemanticMediaBinding[]) => {
    const resolved = new Map<string, string[]>();
    bindings.forEach((binding) => {
      if (binding.role === "none" || binding.cardinality <= 0) return;
      const preferred = candidates.filter((candidate) => candidate.roles.includes(binding.role));
      const fallback = candidates.filter((candidate) => !preferred.includes(candidate) && (binding.role === "logo" || !candidate.roles.includes("logo")));
      const eligible = [...preferred, ...fallback];
      const uniqueFirst = [
        ...eligible.filter((candidate) => !pageUsedMedia.has(candidate.url)),
        ...eligible.filter((candidate) => pageUsedMedia.has(candidate.url)),
      ];
      const urls = uniqueFirst
        .filter((candidate, index, all) => all.findIndex((entry) => entry.url === candidate.url) === index)
        .slice(0, Math.max(0, Math.min(8, binding.cardinality)))
        .map((candidate) => candidate.url);
      urls.forEach((url) => pageUsedMedia.add(url));
      resolved.set(binding.slot, urls);
    });
    return resolved;
  };
  const materializeBlocks = (
    plans: readonly SiteCreativeRecipeBlock[],
    sourceBlocks: readonly SiteSectionBlock[],
    mediaBySlot: ReadonlyMap<string, string[]>,
  ): SiteSectionBlock[] => {
    const sourcePool = sourceBlocks.flatMap((block) => [block, ...block.children]);
    const sourceUsed = new Set<SiteSectionBlock>();
    const mediaCursor = new Map<string, number>();
    const sourceFor = (plan: SiteCreativeRecipeBlock) => {
      const source = sourcePool.find((candidate) => !sourceUsed.has(candidate) && candidate.kind === plan.kind && candidate.slot === plan.slot && candidate.role === plan.role)
        ?? sourcePool.find((candidate) => !sourceUsed.has(candidate) && candidate.kind === plan.kind && candidate.slot === plan.slot)
        ?? sourcePool.find((candidate) => !sourceUsed.has(candidate) && candidate.kind === plan.kind);
      if (source) sourceUsed.add(source);
      return source;
    };
    const visit = (plan: SiteCreativeRecipeBlock, path: number[]): SiteSectionBlock => {
      const source = sourceFor(plan);
      const cursor = mediaCursor.get(plan.slot) ?? 0;
      const mediaUrl = plan.kind === "media" ? mediaBySlot.get(plan.slot)?.[cursor] ?? null : null;
      if (plan.kind === "media") mediaCursor.set(plan.slot, cursor + 1);
      return {
        id: `recipe-${path.join("-")}`.slice(0, 48),
        kind: plan.kind,
        slot: plan.slot,
        role: plan.role,
        text: source?.text ?? "",
        mediaUrl,
        ...(source?.style ? { style: structuredClone(source.style) } : {}),
        children: plan.children.map((child, index) => visit(child, [...path, index + 1])),
      };
    };
    return plans.map((plan, index) => visit(plan, [index + 1]));
  };
  const unused = new Set(document.sections);
  const sections = recipe.sections.flatMap((plan, index) => {
    const section = [...unused].find((candidate) => candidate.kind === plan.kind);
    if (!section) return [];
    unused.delete(section);
    const mediaBySlot = resolveBindings(plan.mediaBindings ?? []);
    const mediaUrls = [...mediaBySlot.values()].flat().filter((url, mediaIndex, all) => all.indexOf(url) === mediaIndex);
    const items = plan.mediaBindings?.length && mediaUrls.length && section.items.length
      ? mediaUrls.map((mediaUrl, itemIndex) => ({ ...section.items[itemIndex % section.items.length], mediaUrl }))
      : section.items;
    const sourceBlocks = section.blocks?.length ? section.blocks : deriveLegacySiteSectionBlocks(section);
    const blocks = plan.blocks?.length
      ? materializeBlocks(plan.blocks, sourceBlocks, mediaBySlot)
      : plan.mediaBindings?.length
        ? deriveLegacySiteSectionBlocks({ ...section, mediaUrls, items })
        : sourceBlocks.map((block) => structuredClone(block));
    return [{
      ...section,
      family: pick(plan.family, `family:${index}`),
      layout: pick(plan.layout, `layout:${index}`),
      width: pick(plan.width, `width:${index}`),
      align: pick(plan.align, `align:${index}`),
      motion: pick(plan.motion, `motion:${index}`),
      ...(plan.mediaBindings?.length ? { mediaUrls, blocks } : { blocks }),
      items,
    }];
  });
  const sectionOrder = pickSequence(recipe.sectionOrders, recipe.sectionOrder ?? recipe.sections.map((section) => section.kind), "section-order");
  const rank = new Map(sectionOrder.map((kind, index) => [kind, index]));
  const orderedSections = [...sections, ...unused]
    .map((section, sourceIndex) => ({ section, sourceIndex }))
    .sort((left, right) => (rank.get(left.section.kind) ?? sectionOrder.length + left.sourceIndex) - (rank.get(right.section.kind) ?? sectionOrder.length + right.sourceIndex))
    .map(({ section }) => section);
  return {
    ...document,
    designGenome: {
      composition: pick(recipe.genome.composition, "composition"),
      rhythm: pick(recipe.genome.rhythm, "rhythm"),
      geometry: pick(recipe.genome.geometry, "geometry"),
      colorStrategy: pick(recipe.genome.colorStrategy, "color"),
      mediaStrategy: pick(recipe.genome.mediaStrategy, "media"),
      typeScale: pick(recipe.genome.typeScale, "type"),
      motionLanguage: pick(recipe.genome.motionLanguage, "motion"),
    },
    theme: {
      ...document.theme,
      headingFont: pickOptional<typeof document.theme.headingFont>(recipe.theme?.headingFont, document.theme.headingFont, "heading-font"),
      bodyFont: pickOptional<typeof document.theme.bodyFont>(recipe.theme?.bodyFont, document.theme.bodyFont, "body-font"),
      productLayout: pickOptional<typeof document.theme.productLayout>(recipe.theme?.productLayout, document.theme.productLayout, "product-layout"),
      displayScale: pickOptional<typeof document.theme.displayScale>(recipe.theme?.displayScale, document.theme.displayScale, "display-scale"),
      density: pickOptional<typeof document.theme.density>(recipe.theme?.density, document.theme.density, "density"),
      imageTreatment: pickOptional<typeof document.theme.imageTreatment>(recipe.theme?.imageTreatment, document.theme.imageTreatment, "image-treatment"),
    },
    navigation: {
      ...document.navigation,
      layout: pickOptional<typeof document.navigation.layout>(recipe.navigation?.layout, document.navigation.layout, "navigation-layout"),
      logoTreatment: pickOptional<typeof document.navigation.logoTreatment>(recipe.navigation?.logoTreatment, document.navigation.logoTreatment, "logo-treatment"),
    },
    merchandising: {
      ...document.merchandising,
      spotlightLayout: pickOptional<typeof document.merchandising.spotlightLayout>(recipe.merchandising?.spotlightLayout, document.merchandising.spotlightLayout, "spotlight-layout"),
    },
    sections: orderedSections,
  };
}

/** Replaces generated sections with the exact merchant-approved sections. */
export function preserveLockedStorefrontSections(
  generated: StoreSiteDocument,
  current: StoreSiteDocument | null | undefined,
  lockedSectionIds: readonly string[],
): StoreSiteDocument {
  if (!current || !lockedSectionIds.length) return generated;
  const locked = new Set(lockedSectionIds);
  const lockedSections = current.sections
    .map((section, index) => ({
      section,
      index,
      ordinal: current.sections.slice(0, index).filter((candidate) => candidate.kind === section.kind).length,
    }))
    .filter(({ section }) => locked.has(section.id));
  const generatedSections = generated.sections.map((section, index) => ({
    section,
    index,
    ordinal: generated.sections.slice(0, index).filter((candidate) => candidate.kind === section.kind).length,
  }));
  const removeIndexes = new Set<number>();
  const matchedLocks = new Set<number>();

  // Prefer an exact id match. This protects stable ids without allowing a
  // fallback match to consume the replacement belonging to another lock.
  lockedSections.forEach(({ section }, lockIndex) => {
    const exact = generatedSections.find(({ section: candidate, index }) => (
      !removeIndexes.has(index) && candidate.id === section.id
    ));
    if (!exact) return;
    removeIndexes.add(exact.index);
    matchedLocks.add(lockIndex);
  });

  // Models may rename section ids. In that case replace only the same
  // occurrence of the same kind, not every sibling story/gallery/catalog.
  lockedSections.forEach(({ section, ordinal }, lockIndex) => {
    if (matchedLocks.has(lockIndex)) return;
    const equivalent = generatedSections.find(({ section: candidate, index, ordinal: candidateOrdinal }) => (
      !removeIndexes.has(index)
      && candidate.kind === section.kind
      && candidateOrdinal === ordinal
    ));
    if (equivalent) removeIndexes.add(equivalent.index);
  });

  const sections = generated.sections.filter((_, index) => !removeIndexes.has(index));
  lockedSections.forEach(({ section, index }) => {
    sections.splice(Math.min(Math.max(index, 0), sections.length), 0, structuredClone(section));
  });
  return {
    ...generated,
    sections,
  };
}

function structuralFeatures(document: StoreSiteDocument, ignoredSectionIds: ReadonlySet<string>): string[] {
  const genome = sanitizeSiteDesignGenome(document.designGenome);
  // Saved proposals are intentionally retained across renderer revisions.
  // Some of them can contain retired section kinds, so originality telemetry
  // must compare only sections supported by the current engine.
  const sections = document.sections.filter((section) =>
    !ignoredSectionIds.has(section.id)
    && Boolean(SITE_SECTION_CAPABILITIES[section.kind]),
  );
  const pages = document.pages ?? [];
  return [
    `art:${document.artDirection || "custom"}`,
    ...Object.entries(genome).map(([key, value]) => `genome:${key}:${value}`),
    `theme:heading:${document.theme.headingFont}`,
    `theme:body:${document.theme.bodyFont}`,
    `theme:product:${document.theme.productLayout}`,
    `theme:scale:${document.theme.displayScale}`,
    `theme:density:${document.theme.density}`,
    `theme:image:${document.theme.imageTreatment}`,
    `nav:${document.navigation.layout}:${document.navigation.logoTreatment}`,
    `merch:${document.merchandising.spotlightLayout}`,
    `experience:${document.experience.type}:${document.experience.placement}`,
    `opening:${sections[0]?.kind || "none"}`,
    `order:${sections.map((section) => section.kind).join("/")}`,
    `pages:${pages.length}`,
    `page:home:${sections.filter((section) => !section.pageId).map((section) => section.kind).join("/")}`,
    ...pages.map((page, index) => `page:${index}:${sections.filter((section) => section.pageId === page.id).map((section) => section.kind).join("/")}`),
    ...sections.map((section, index) => `section:${index}:${section.kind}:${resolveSiteSectionFamily(section.kind, section.family, genome)}:${section.layout}:${section.width}:${section.align}:${section.motion}`),
  ];
}

export function storefrontStructuralSignature(
  document: StoreSiteDocument,
  ignoredSectionIds: readonly string[] = [],
): StorefrontStructuralSignature {
  const features = structuralFeatures(document, new Set(ignoredSectionIds)).sort();
  return {
    version: 1,
    fingerprint: createHash("sha256").update(features.join("\n")).digest("hex").slice(0, 24),
    features,
  };
}

export function storedStorefrontStructuralSignature(value: unknown): StorefrontStructuralSignature | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (source.version !== 1 || typeof source.fingerprint !== "string" || !Array.isArray(source.features)) return null;
  const features = source.features.filter((feature): feature is string => typeof feature === "string" && feature.length <= 240).slice(0, 80);
  if (!features.length || !/^[a-f0-9]{24}$/.test(source.fingerprint)) return null;
  return { version: 1, fingerprint: source.fingerprint, features };
}

function featureSimilarity(leftFeatures: readonly string[], rightFeatures: readonly string[]): number {
  const left = new Set(leftFeatures);
  const right = new Set(rightFeatures);
  const union = new Set([...left, ...right]);
  if (!union.size) return 1;
  let intersection = 0;
  left.forEach((feature) => { if (right.has(feature)) intersection += 1; });
  return intersection / union.size;
}

/** Content-free similarity score: 1 means the same creative structure. */
export function storefrontStructuralSimilarity(
  left: StoreSiteDocument,
  right: StoreSiteDocument,
  ignoredSectionIds: readonly string[] = [],
): number {
  const ignored = new Set(ignoredSectionIds);
  return featureSimilarity(structuralFeatures(left, ignored), structuralFeatures(right, ignored));
}

/** Fail-closed originality gate against previously generated storefronts. */
export function storefrontOriginalityGate(
  candidate: StoreSiteDocument,
  previous: readonly StoreSiteDocument[],
  ignoredSectionIds: readonly string[] = [],
  maximumSimilarity = 0.66,
  previousSignatures: readonly StorefrontStructuralSignature[] = [],
): StorefrontOriginalityResult {
  const documentSimilarity = previous.reduce(
    (closest, document) => Math.max(closest, storefrontStructuralSimilarity(candidate, document, ignoredSectionIds)),
    0,
  );
  const candidateSignature = storefrontStructuralSignature(candidate, ignoredSectionIds);
  const signatureSimilarity = previousSignatures.reduce(
    (closest, signature) => Math.max(closest, featureSimilarity(candidateSignature.features, signature.features)),
    0,
  );
  const closestSimilarity = Math.max(documentSimilarity, signatureSimilarity);
  return { accepted: closestSimilarity < maximumSimilarity, closestSimilarity };
}

/** Batch-level evaluator used by regression tests and generation telemetry. */
export function evaluateStorefrontDiversity(
  documents: readonly StoreSiteDocument[],
  maximumSimilarity = 0.66,
  minimumUniqueOpenings = 2,
): StorefrontDiversityReport {
  const similarities: number[] = [];
  for (let first = 0; first < documents.length; first += 1) {
    for (let second = first + 1; second < documents.length; second += 1) {
      similarities.push(storefrontStructuralSimilarity(documents[first], documents[second]));
    }
  }
  const uniqueOpenings = new Set(documents.map((document) => document.sections[0]?.kind ?? "none")).size;
  const uniqueOrders = new Set(documents.map((document) => document.sections.map((section) => section.kind).join("/"))).size;
  const uniqueGrammars = new Set(documents.map((document) => sanitizeSiteDesignGenome(document.designGenome).composition)).size;
  const maximumPairSimilarity = similarities.length ? Math.max(...similarities) : 0;
  const averagePairSimilarity = similarities.length
    ? similarities.reduce((sum, similarity) => sum + similarity, 0) / similarities.length
    : 0;
  return {
    accepted: documents.length >= 3
      && uniqueOpenings >= minimumUniqueOpenings
      && uniqueOrders === documents.length
      && uniqueGrammars >= Math.min(3, documents.length)
      && maximumPairSimilarity < maximumSimilarity,
    documentCount: documents.length,
    uniqueOpenings,
    uniqueOrders,
    uniqueGrammars,
    maximumPairSimilarity,
    averagePairSimilarity,
  };
}

export function withStorefrontEngineMetadata(
  document: StoreSiteDocument,
  context: StorefrontEngineContext,
  directionIndex: number,
): StoreSiteDocument & { engine: StorefrontEngineMetadata } {
  const genome = sanitizeSiteDesignGenome(document.designGenome);
  const grammar = isSiteArtDirection(document.artDirection)
    ? genome.composition
    : storefrontGrammar(context, directionIndex);
  return {
    ...document,
    designGenome: { ...genome, composition: grammar },
    engine: {
      version: "2.0",
      brandFingerprint: context.brandFingerprint,
      generation: context.generation,
      seed: context.seed + directionIndex,
      grammar,
    },
  };
}

function directionFeatures(document: StoreSiteDocument): string[] {
  const hero = document.sections.find((section) => section.kind === "hero");
  const story = document.sections.find((section) => section.kind === "story");
  const gallery = document.sections.find((section) => section.kind === "gallery");
  const genome = sanitizeSiteDesignGenome(document.designGenome);
  const family = (section: typeof hero) => section ? resolveSiteSectionFamily(section.kind, section.family, genome) : "";
  const pages = document.pages ?? [];
  const pageAssignment = document.sections.map((section) => `${section.kind}:${section.pageId || "home"}`).join("/");
  return [
    document.artDirection || "custom",
    hero?.layout || "", hero?.width || "", story?.align || "", gallery?.layout || "none",
    family(hero), family(story), family(document.sections.find((section) => section.kind === "catalog")), family(gallery),
    document.theme.headingFont, document.theme.productLayout, document.theme.displayScale,
    document.theme.density, document.theme.imageTreatment, document.navigation.layout,
    document.navigation.logoTreatment, document.merchandising.spotlightLayout,
    document.experience.type, document.sections.map((section) => section.kind).join("/"),
    `pages:${pages.length}`, pageAssignment,
    genome.composition, genome.rhythm, genome.geometry, genome.colorStrategy,
    genome.mediaStrategy, genome.typeScale, genome.motionLanguage,
  ];
}

export function storefrontDirectionsAreDiverse(documents: StoreSiteDocument[]): boolean {
  if (documents.length !== 3) return false;
  const features = documents.map(directionFeatures);
  const heroLayouts = new Set(documents.map((document) => document.sections.find((section) => section.kind === "hero")?.layout));
  const navigationLayouts = new Set(documents.map((document) => document.navigation.layout));
  const productLayouts = new Set(documents.map((document) => document.theme.productLayout));
  const signatureExperiences = new Set(documents.map((document) => document.experience.type));
  const galleryMotions = new Set(documents.map((document) => document.sections.find((section) => section.kind === "gallery")?.motion));
  const genomeCompositions = new Set(documents.map((document) => sanitizeSiteDesignGenome(document.designGenome).composition));
  const genomeGeometries = new Set(documents.map((document) => sanitizeSiteDesignGenome(document.designGenome).geometry));
  const heroFamilies = new Set(documents.map((document) => {
    const section = document.sections.find((candidate) => candidate.kind === "hero");
    return section ? resolveSiteSectionFamily(section.kind, section.family, document.designGenome) : "";
  }));
  const artDirections = new Set(documents.map((document) => document.artDirection));
  if (artDirections.size !== 3) return false;
  if (heroLayouts.size < 2 || navigationLayouts.size < 2 || productLayouts.size < 2) return false;
  if (signatureExperiences.size !== 3) return false;
  // Photo motion is intentionally static across generated directions. Layout,
  // typography, art direction and the text-only signature still carry the
  // meaningful differentiation between proposals.
  if (galleryMotions.size !== 1 || !galleryMotions.has("none")) return false;
  if (genomeCompositions.size !== 3 || genomeGeometries.size < 2) return false;
  if (heroFamilies.size !== 3) return false;
  for (let first = 0; first < features.length; first += 1) {
    for (let second = first + 1; second < features.length; second += 1) {
      const distance = features[first].filter((value, index) => value !== features[second][index]).length;
      if (distance < 4) return false;
    }
  }
  return true;
}
