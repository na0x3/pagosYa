import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store, StoreVisualProposal } from "@prisma/client";
import {
  SITE_ART_DIRECTIONS,
  applySiteArtDirection,
  deriveLegacySiteSectionBlocks,
  isSiteArtDirection,
  type SiteArtDirection,
  type SiteCreativeRecipe,
} from "@pagosya/shared-types";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { STORE_FONT_STYLES, type StoreFontStyle } from "./dto/create-store.dto";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { AI_SITE_DOCUMENT_SCHEMA, materializeSiteDocument, siteDocumentJson, type AiSiteDocument, type StoreSiteDocument } from "./site-document";
import {
  TtlLruCache,
  applyStorefrontCreativeRecipe,
  applyStorefrontTopology,
  beginStorefrontGeneration,
  evaluateStorefrontDiversity,
  storefrontBrandFingerprint,
  storefrontCreativeRecipe,
  storefrontDirectionsAreDiverse,
  storefrontOriginalityGate,
  storefrontStructuralSignature,
  storedStorefrontStructuralSignature,
  storefrontTopologyPlan,
  preserveLockedStorefrontSections,
  varyStorefrontStructure,
  withStorefrontEngineMetadata,
  type StorefrontEngineContext,
  type StorefrontSemanticMediaCandidate,
  type StorefrontStructuralSignature,
} from "./storefront-engine";

const VISUAL_FIELDS = [
  "tagline", "bannerUrl", "backgroundColor", "backgroundMode", "backgroundGradientStart", "backgroundGradientEnd", "backgroundGradientAngle", "backgroundImageUrl", "aboutText", "aboutTitle", "aboutSubtitle", "aboutImageUrl",
  "catalogTitle", "catalogSubtitle", "galleryTitle", "gallerySubtitle", "linksTitle", "contactTitle", "contactSubtitle", "locationTitle", "locationSubtitle", "sectionBackgrounds",
  "accentColor", "fontStyle", "buttonStyle", "boardTexture", "announcement", "announcementMode",
  "announcementSpeed", "announcementSize", "announcementColor", "announcementFont", "announcementEffect", "promotionEnabled", "promotionImageUrl", "promotionTitle",
  "promotionBody", "promotionCtaLabel", "promotionCtaUrl", "heroSlides", "contentOrder", "layoutStyle", "experienceStyle", "motionDuoEnabled", "motionExperience", "motionExperiences", "animations", "editorialGallery",
  "buttonVariant", "buttonMotion", "cartButtonLabel", "siteDocument", "checkoutMode", "leadCaptureUrl", "contactPhone", "contactFormEnabled",
] as const;

type VisualField = (typeof VISUAL_FIELDS)[number];
type VisualConfig = Partial<Record<VisualField, unknown>>;
type StoreProductContext = { id: string; name: string; description: string | null; imageUrls: string[]; tags: string[] };
type StoreLinkContext = { label: string; url: string };

type ProposalPreset = {
  title: string;
  rationale: string;
  config: VisualConfig;
};

type AiDirection = { title: string; rationale: string; siteDocument: AiSiteDocument };
type MaterializedAiDirection = Omit<AiDirection, "siteDocument"> & { siteDocument: StoreSiteDocument };

export type StoreAgentRevisionPlan = {
  target: "opening" | "catalog" | "story" | "gallery" | "contact" | "site";
  tone: "warmer" | "cooler" | "bolder" | "quieter" | "minimal" | "editorial" | "unchanged";
  preserveCatalog: boolean;
  summary: string;
};

function advancesGeneratedBatch(
  candidate: StoreSiteDocument,
  accepted: readonly StoreSiteDocument[],
  requireMultipleOpenings: boolean,
): boolean {
  const order = candidate.sections.map((section) => section.kind).join("/");
  const grammar = candidate.designGenome.composition;
  if (accepted.some((document) => document.sections.map((section) => section.kind).join("/") === order)) return false;
  if (accepted.some((document) => document.designGenome.composition === grammar)) return false;
  if (!requireMultipleOpenings) return true;
  return new Set([...accepted, candidate].map((document) => document.sections[0]?.kind ?? "none")).size >= 2;
}

type BrandAnalysis = {
  brandEssence: string;
  audienceScene: string;
  logoStrategy: string;
  colorStrategy: string;
  typographyStrategy: string;
  compositionStrategy: string;
  motionStrategy: string;
  assetRoles: Array<{
    assetIndex: number;
    role: "logo" | "product" | "editorial" | "lifestyle" | "background" | "detail" | "avoid";
    productIndex: number;
    reasoning: string;
  }>;
  merchandisingPlan: Array<{
    productIndex: number;
    role: "lead" | "support" | "catalog";
    placement: string;
    imageAssetIndices: number[];
  }>;
  sectionPlan: Array<{
    kind: "hero" | "story" | "catalog" | "gallery" | "contact" | "location" | "links";
    purpose: string;
    backgroundRole: string;
  }>;
  pagePlan: Array<{
    id: string;
    label: string;
    slug: string;
    purpose: string;
    sectionKinds: Array<"story" | "gallery" | "contact" | "location" | "links">;
  }>;
  riskChecks: string[];
};

const brandAnalysisCache = new TtlLruCache<BrandAnalysis>(64, 30 * 60_000);

const CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "motion", "links"] as const;
const MOTION_EXPERIENCES = [
  "story-scroll", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials",
  "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  "full-screen-chapters", "magnetic-target", "frame-sequence",
] as const;
const RETIRED_MOTION_EXPERIENCES = new Set(["3d-gallery", "coverflow-carousel", "zoom-parallax", "video-pill"]);
const SAFE_GENERATED_BACKGROUNDS = ["#eef1f5", "#e8f2ef", "#eeebf5"] as const;
const GENERATED_SIGNATURE_PROFILES = [
  { visual: "scroll-expansion", text: "text-reveal-block", section: "clip" },
  { visual: "full-screen-chapters", text: "text-rotate", section: "drift" },
  { visual: "frame-sequence", text: "text-along-path", section: "scale" },
] as const;

function proposalArtDirections(preferred: unknown, generation: number): SiteArtDirection[] {
  const start = isSiteArtDirection(preferred)
    ? preferred
    : SITE_ART_DIRECTIONS[generation % SITE_ART_DIRECTIONS.length];
  const ordered = [start, ...SITE_ART_DIRECTIONS.filter((direction) => direction !== start)];
  return ordered.slice(0, 3);
}

function generatedMotionProfile(index: number, assetCount: number) {
  const profile = GENERATED_SIGNATURE_PROFILES[index % GENERATED_SIGNATURE_PROFILES.length];
  return { ...profile, signature: assetCount >= 2 ? profile.visual : profile.text };
}

function enforceUniqueGeneratedAnimationTypes(
  document: StoreSiteDocument,
  animationCandidates: unknown,
  motionExperienceCandidates: unknown,
): { siteDocument: StoreSiteDocument; animations: unknown[]; motionExperiences: string[] } {
  const generatedTypes = new Set<string>();
  const sections: StoreSiteDocument["sections"] = document.sections.map((section) => {
    // A generated multi-scene hero is already the page's hero-carousel. It is
    // stored as the hero primitive rather than a named animation, but must count
    // toward the same one-per-type rule.
    if (section.kind === "hero" && Array.isArray(section.mediaUrls) && section.mediaUrls.length >= 2) generatedTypes.add("hero-carousel");
    if (section.motion === "none") return section;
    if (generatedTypes.has(section.motion)) return { ...section, motion: "none" as const };
    generatedTypes.add(section.motion);
    return section;
  });

  const animationTypes = new Set<string>();
  const animations = (Array.isArray(animationCandidates) ? animationCandidates : []).filter((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const type = (candidate as Record<string, unknown>).type;
    if (typeof type !== "string" || !MOTION_EXPERIENCES.includes(type as (typeof MOTION_EXPERIENCES)[number])) return false;
    if (generatedTypes.has(type) || animationTypes.has(type)) return false;
    animationTypes.add(type);
    return true;
  });

  const motionExperienceTypes = new Set<string>();
  const motionExperiences = (Array.isArray(motionExperienceCandidates) ? motionExperienceCandidates : []).filter((candidate): candidate is string => {
    if (typeof candidate !== "string" || !MOTION_EXPERIENCES.includes(candidate as (typeof MOTION_EXPERIENCES)[number])) return false;
    if (generatedTypes.has(candidate) || motionExperienceTypes.has(candidate)) return false;
    motionExperienceTypes.add(candidate);
    return true;
  });

  const renderedTypes = new Set([
    ...generatedTypes,
    ...animationTypes,
    ...(animations.length ? [] : motionExperienceTypes),
  ]);
  const experienceType = document.experience.type;
  const experience = experienceType !== "none" && renderedTypes.has(experienceType)
    ? { ...document.experience, type: "none" as const, mediaUrls: [] }
    : document.experience;

  return { siteDocument: { ...document, sections, experience }, animations, motionExperiences };
}

function enforceUniqueGeneratedProposalConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const config = value as Record<string, unknown>;
  const document = config.siteDocument;
  if (!document || typeof document !== "object" || Array.isArray(document)) return value;
  const siteDocument = document as unknown as StoreSiteDocument;
  if (!Array.isArray(siteDocument.sections) || !siteDocument.experience || typeof siteDocument.experience !== "object") return value;
  const uniqueInventory = enforceUniqueGeneratedAnimationTypes(
    siteDocument,
    [],
    [],
  );
  const generatedDocument = {
    ...uniqueInventory.siteDocument,
    sections: uniqueInventory.siteDocument.sections.map((section) =>
      section.kind === "gallery" && section.layout === "rail"
        ? { ...section, layout: "grid" as const }
        : section,
    ),
  };
  return {
    ...freshGeneratedVisualReset(),
    ...config,
    siteDocument: generatedDocument,
    contentOrder: cleanGeneratedContentOrder(config.contentOrder),
    animations: [],
    motionExperiences: [],
    motionExperience: "hero-carousel",
    motionDuoEnabled: false,
  };
}

function cleanGeneratedContentOrder(value: unknown): string[] {
  const order: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry) => {
      if (typeof entry === "string" && CONTENT_SECTIONS.includes(entry as (typeof CONTENT_SECTIONS)[number]) && !order.includes(entry)) order.push(entry);
    });
  }
  for (const section of ["hero", "about", "products", "gallery", "links"] as const) {
    if (!order.includes(section)) order.push(section);
  }
  return order;
}

function expandMotionSections(value: unknown, animationIds: string[]): string[] {
  const baseSections = ["hero", "products", "about", "gallery"];
  const result: string[] = [];
  const append = (section: string) => { if (!result.includes(section)) result.push(section); };
  if (Array.isArray(value)) {
    value.forEach((section) => {
      if (typeof section === "string" && baseSections.includes(section)) append(section);
    });
  }
  baseSections.forEach(append);
  ["links", "contact", "location"].forEach(append);
  if (!animationIds.length) return result;

  // Split AI-authored motion around the catalog so the storefront has a visual
  // lead-in and a visual continuation. The merchant can still reorder every
  // named animation independently after applying the proposal.
  const productIndex = result.indexOf("products");
  const linksIndex = result.indexOf("links");
  const beforeCount = Math.ceil(animationIds.length / 2);
  const beforeIds = animationIds.slice(0, beforeCount);
  const afterIds = animationIds.slice(beforeCount);
  const beforeGaps = Array.from({ length: productIndex + 1 }, (_, gap) => gap);
  const afterLastGap = linksIndex > productIndex ? linksIndex : result.length;
  const afterGaps = Array.from({ length: Math.max(1, afterLastGap - productIndex) }, (_, index) => productIndex + 1 + index);
  const animationGroups = Array.from({ length: result.length + 1 }, () => [] as string[]);
  const distribute = (ids: string[], gaps: number[]) => ids.forEach((id, index) => {
    const gapIndex = ids.length === 1 ? 0 : Math.round(index * (gaps.length - 1) / (ids.length - 1));
    animationGroups[gaps[gapIndex] ?? gaps[0] ?? 0].push(`animation-${id}`);
  });
  distribute(beforeIds, beforeGaps);
  distribute(afterIds, afterGaps);
  return result.flatMap((section, index) => [...animationGroups[index], section]).concat(animationGroups[result.length]);
}

function animationMediaRequirement(type: string): { min: number; max: number } {
  if (["clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"].includes(type)) return { min: 0, max: 0 };
  if (["circle-reveal", "magnetic-target"].includes(type)) return { min: 1, max: 1 };
  if (type === "scroll-expansion") return { min: 2, max: 2 };
  return { min: type === "hero-gallery-scroll" ? 3 : 2, max: 8 };
}

function distributedAnimationMedia(
  assets: MediaAsset[],
  authoredMedia: Array<Record<string, unknown>>,
  animationIndex: number,
  animationCount: number,
  type: string,
): Array<Record<string, unknown>> {
  const requirement = animationMediaRequirement(type);
  if (!requirement.max || !assets.length) return [];
  const draftsByUrl = new Map(authoredMedia.flatMap((item) => typeof item.imageUrl === "string" ? [[item.imageUrl, item] as const] : []));
  const candidates = assets.map((asset) => ({
    imageUrl: asset.url,
    title: "",
    caption: "",
    body: "",
    boxColor: "#f4ead7",
    ...(draftsByUrl.get(asset.url) ?? {}),
  }));
  if (requirement.max === 1) return [candidates[animationIndex % candidates.length]];

  const baseSize = Math.floor(candidates.length / animationCount);
  const remainder = candidates.length % animationCount;
  const start = animationIndex * baseSize + Math.min(animationIndex, remainder);
  const uniqueSize = Math.min(requirement.max, baseSize + (animationIndex < remainder ? 1 : 0));
  const selected = candidates.slice(start, start + uniqueSize);
  for (let offset = 0; selected.length < Math.min(requirement.min, candidates.length); offset += 1) {
    const candidate = candidates[(start + uniqueSize + offset) % candidates.length];
    if (!selected.some((item) => item.imageUrl === candidate.imageUrl)) selected.push(candidate);
  }
  return selected;
}

function safeGeneratedBackground(candidate: unknown, index: number): string {
  if (typeof candidate !== "string" || !/^#[0-9a-f]{6}$/i.test(candidate)) {
    return SAFE_GENERATED_BACKGROUNDS[index % SAFE_GENERATED_BACKGROUNDS.length];
  }
  const channels = [1, 3, 5].map((offset) => Number.parseInt(candidate.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta > 0) {
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (maximum + minimum) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const isRed = saturation >= 0.12 && (hue <= 22 || hue >= 338);
  const isYellow = saturation >= 0.12 && hue >= 38 && hue <= 72;
  return isRed || isYellow
    ? SAFE_GENERATED_BACKGROUNDS[index % SAFE_GENERATED_BACKGROUNDS.length]
    : candidate.toLowerCase();
}

function generatedCopy(value: string): string {
  return value.replace(/[—–]/g, "-").trim();
}

function hexSaturation(value: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const maximum = Math.max(...channels);
  const minimum = Math.min(...channels);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  return delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
}

function readableInk(background: string): "#171717" | "#ffffff" {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(background.slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.36 ? "#171717" : "#ffffff";
}

function passesPremiumDirectionGuardrails(document: StoreSiteDocument): boolean {
  const colors = [
    document.theme.pageBackground,
    document.theme.textColor,
    document.theme.accentColor,
    document.theme.secondaryColor,
    document.theme.surfaceColor,
    document.theme.mutedColor,
    document.theme.borderColor,
    ...document.sections.flatMap((section) => [section.backgroundColor, section.textColor]),
  ];
  if (colors.some((color) => color.toLowerCase() === "#000000")) return false;
  if (hexSaturation(document.theme.accentColor) >= 0.8) return false;
  const chromaticColors = new Set(colors.filter((color) => hexSaturation(color) >= 0.24).map((color) => color.toLowerCase()));
  if (chromaticColors.size < 3) return false;
  const hero = document.sections.find((section) => section.kind === "hero");
  const story = document.sections.find((section) => section.kind === "story");
  const catalog = document.sections.find((section) => section.kind === "catalog");
  const opening = document.sections[0];
  const quietDirection = document.artDirection === "quiet-gallery";
  if (!hero || !story || !catalog) return false;
  if (opening?.kind === "hero" && !quietDirection && (hero.layout === "centered" || hero.align === "center")) return false;
  if (story.motion !== "story-scroll") return false;
  if (document.navigation.sticky && !["product-studio", "graphic-market"].includes(document.artDirection || "")) return false;
  const copy = [
    document.direction,
    document.experience.title,
    document.experience.body,
    ...document.sections.flatMap((section) => [section.title, section.body, section.ctaLabel, ...section.items.flatMap((item) => [item.title, item.body])]),
  ].join(" ");
  if (/\b(?:elevate|seamless|unleash|next[- ]gen|eleva|revoluciona|sin límites)\b/i.test(copy)) return false;
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(copy)) return false;
  return true;
}

function defaultMotionSuite(index: number, assetCount: number): string[] {
  if (assetCount <= 1) {
    return [
      ["text-reveal-block", "magnetic-target"],
      ["circle-reveal", "text-rotate"],
      ["text-glitch", "circle-reveal"],
    ][index % 3];
  }
  if (assetCount === 2) {
    return [
      ["story-scroll", "layered-text"],
      ["hero-carousel", "circle-reveal"],
      ["image-stream", "magnetic-target"],
    ][index % 3];
  }
  return [
    ["hero-gallery-scroll", "frame-sequence", "text-along-path"],
    ["portfolio-scroller", "frame-sequence", "circle-reveal"],
    ["image-stream", "full-screen-chapters", "magnetic-target"],
  ][index % 3];
}

const AI_DIRECTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["directions"],
  properties: {
    directions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "rationale", "siteDocument"],
        properties: {
          title: { type: "string", minLength: 3, maxLength: 48 },
          rationale: { type: "string", minLength: 20, maxLength: 240 },
          siteDocument: AI_SITE_DOCUMENT_SCHEMA,
        },
      },
    },
  },
} as const;

const BRAND_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["analysis"],
  properties: {
    analysis: {
      type: "object",
      additionalProperties: false,
      required: ["brandEssence", "audienceScene", "logoStrategy", "colorStrategy", "typographyStrategy", "compositionStrategy", "motionStrategy", "assetRoles", "merchandisingPlan", "sectionPlan", "pagePlan", "riskChecks"],
      properties: {
        brandEssence: { type: "string", minLength: 20, maxLength: 500 },
        audienceScene: { type: "string", minLength: 20, maxLength: 400 },
        logoStrategy: { type: "string", minLength: 20, maxLength: 500 },
        colorStrategy: { type: "string", minLength: 20, maxLength: 500 },
        typographyStrategy: { type: "string", minLength: 20, maxLength: 500 },
        compositionStrategy: { type: "string", minLength: 20, maxLength: 700 },
        motionStrategy: { type: "string", minLength: 20, maxLength: 500 },
        assetRoles: {
          type: "array", minItems: 1, maxItems: 24,
          items: {
            type: "object", additionalProperties: false,
            required: ["assetIndex", "role", "productIndex", "reasoning"],
            properties: {
              assetIndex: { type: "integer", minimum: 0, maximum: 23 },
              role: { type: "string", enum: ["logo", "product", "editorial", "lifestyle", "background", "detail", "avoid"] },
              productIndex: { type: "integer", minimum: -1, maximum: 23 },
              reasoning: { type: "string", minLength: 10, maxLength: 300 },
            },
          },
        },
        merchandisingPlan: {
          type: "array", minItems: 0, maxItems: 24,
          items: {
            type: "object", additionalProperties: false,
            required: ["productIndex", "role", "placement", "imageAssetIndices"],
            properties: {
              productIndex: { type: "integer", minimum: 0, maximum: 23 },
              role: { type: "string", enum: ["lead", "support", "catalog"] },
              placement: { type: "string", minLength: 3, maxLength: 160 },
              imageAssetIndices: { type: "array", minItems: 0, maxItems: 8, uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 23 } },
            },
          },
        },
        sectionPlan: {
          type: "array", minItems: 4, maxItems: 9,
          items: {
            type: "object", additionalProperties: false,
            required: ["kind", "purpose", "backgroundRole"],
            properties: {
              kind: { type: "string", enum: ["hero", "story", "catalog", "gallery", "contact", "location", "links"] },
              purpose: { type: "string", minLength: 10, maxLength: 240 },
              backgroundRole: { type: "string", minLength: 3, maxLength: 160 },
            },
          },
        },
        pagePlan: {
          type: "array", minItems: 0, maxItems: 3,
          items: {
            type: "object", additionalProperties: false,
            required: ["id", "label", "slug", "purpose", "sectionKinds"],
            properties: {
              id: { type: "string", minLength: 2, maxLength: 40, pattern: "^[a-z][a-z0-9-]*$" },
              label: { type: "string", minLength: 2, maxLength: 40 },
              slug: { type: "string", minLength: 2, maxLength: 40, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
              purpose: { type: "string", minLength: 10, maxLength: 240 },
              sectionKinds: {
                type: "array", minItems: 1, maxItems: 5, uniqueItems: true,
                items: { type: "string", enum: ["story", "gallery", "contact", "location", "links"] },
              },
            },
          },
        },
        riskChecks: { type: "array", minItems: 3, maxItems: 12, items: { type: "string", minLength: 5, maxLength: 220 } },
      },
    },
  },
} as const;

function localSiteDocument(store: Store, preset: ProposalPreset, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[], index: number): StoreSiteDocument {
  const config = preset.config as Record<string, unknown>;
  const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const copy = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
  const palettes = [
    { page: "#fff2df", text: "#261814", accent: "#c94b3c", secondary: "#2d766d", surface: "#fffaf2", story: "#f4c767", muted: "#72554c", border: "#dfb2a0" },
    { page: "#f3efff", text: "#211a32", accent: "#6950b8", secondary: "#d97835", surface: "#fff7e8", story: "#d9ccff", muted: "#665b78", border: "#c8bce2" },
    { page: "#eaf8f1", text: "#142321", accent: "#b6365f", secondary: "#146c73", surface: "#fff2d8", story: "#bfe6d4", muted: "#516a64", border: "#afd2c5" },
  ] as const;
  const palette = palettes[index % palettes.length];
  const pageBackground = color(config.backgroundColor, palette.page);
  const accentColor = color(config.accentColor, palette.accent);
  const surfaceColor = palette.surface;
  const layouts = [
    { hero: "split", story: "offset", catalog: "gallery" },
    { hero: "full-bleed", story: "split", catalog: "editorial" },
    { hero: "offset", story: "rail", catalog: "showcase" },
  ] as const;
  const selected = layouts[index % layouts.length];
  const mediaUrls = assets.map((asset) => asset.url);
  const narrativeMediaUrls = assets
    .filter((asset) => asset.url !== store.logoUrl)
    .map((asset) => asset.url);
  const usableMediaUrls = narrativeMediaUrls.length ? narrativeMediaUrls : mediaUrls;
  const rotatedMediaUrls = usableMediaUrls.length
    ? [...usableMediaUrls.slice(index % usableMediaUrls.length), ...usableMediaUrls.slice(0, index % usableMediaUrls.length)]
    : [];
  const motionProfile = generatedMotionProfile(index, rotatedMediaUrls.length);
  const pages: NonNullable<StoreSiteDocument["pages"]> = [];
  const storyPageId = (Boolean(store.aboutText?.trim() || store.aboutTitle?.trim()) || usableMediaUrls.length >= 2) ? "story-page" : "";
  const contactPageId = (links.length > 0 || Boolean(store.contactEmail?.trim() || store.contactPhone?.trim())) ? "contact-page" : "";
  if (storyPageId) pages.push({ id: storyPageId, label: "Nuestra historia", slug: "nuestra-historia" });
  if (contactPageId) pages.push({ id: contactPageId, label: "Contacto", slug: "contacto" });
  const heroMediaUrls = rotatedMediaUrls.slice(0, Math.min(3, rotatedMediaUrls.length));
  const storyMediaUrls = rotatedMediaUrls.length > 1
    ? [...rotatedMediaUrls.slice(1), rotatedMediaUrls[0]].slice(0, Math.min(3, rotatedMediaUrls.length))
    : rotatedMediaUrls;
  const productForMedia = (url: string) => products.find((product) => product.imageUrls.includes(url));
  const narrativeItems = (
    urls: string[],
    fallbackTitle: string,
    fallbackBody: string,
  ): StoreSiteDocument["sections"][number]["items"] => urls.map((url) => {
    const product = productForMedia(url);
    return {
      mediaUrl: url,
      title: product?.name || fallbackTitle,
      body: product?.description || fallbackBody,
    };
  });
  const document: StoreSiteDocument = {
    version: 1,
    direction: preset.title,
    designGenome: index === 0
      ? {
          composition: "editorial-split",
          rhythm: "editorial",
          geometry: "soft",
          colorStrategy: "accent-led",
          mediaStrategy: "framed",
          typeScale: "editorial",
          motionLanguage: "reveal",
        }
      : index === 1
        ? {
            composition: "quiet-monument",
            rhythm: "cinematic",
            geometry: "framed",
            colorStrategy: "surface-led",
            mediaStrategy: "full-bleed",
            typeScale: "cinematic",
            motionLanguage: "cinematic",
          }
        : {
            composition: "spatial-cascade",
            rhythm: "compact",
            geometry: "structured",
            colorStrategy: "contrast-blocks",
            mediaStrategy: "collage",
            typeScale: "poster",
            motionLanguage: "tactile",
          },
    theme: {
      pageBackground,
      textColor: palette.text,
      accentColor,
      secondaryColor: palette.secondary,
      surfaceColor,
      mutedColor: palette.muted,
      borderColor: palette.border,
      headingFont: index === 0 ? "humanist" : index === 1 ? "editorial" : "geometric",
      bodyFont: index === 2 ? "grotesk" : "humanist",
      radius: [4, 22, 0][index % 3],
      shadow: index === 1 ? "soft" : "none",
      productLayout: selected.catalog,
      displayScale: index === 2 ? "monumental" : index === 1 ? "dramatic" : "balanced",
      density: index === 0 ? "balanced" : index === 1 ? "airy" : "balanced",
      imageTreatment: index === 0 ? "cinematic" : index === 1 ? "editorial" : "cutout",
    },
    navigation: {
      layout: index === 0 ? "brand-left" : index === 1 ? "centered" : "split",
      sticky: false,
      transparent: index === 1,
      logoTreatment: index === 0 ? "wordmark" : index === 1 ? "oversized" : "seal",
      items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        ...pages.map((page) => ({ id: `nav-${page.id}`, label: page.label, target: "page" as const, pageId: page.id })),
      ],
    },
    ...(pages.length ? { pages } : {}),
    motion: { intensity: index === 0 ? "expressive" : index === 1 ? "cinematic" : "expressive" },
    merchandising: {
      featuredProductIds: products.slice(index, index + 2).map((product) => product.id).filter(Boolean),
      productOrderIds: [...products.slice(index), ...products.slice(0, index)].map((product) => product.id).filter(Boolean),
      spotlightLayout: index === 0 ? "feature-first" : index === 1 ? "lookbook" : "alternating",
      showDescriptions: index !== 2,
    },
    experience: {
      type: motionProfile.signature,
      placement: "after-catalog",
      title: index === 0 ? copy(config.aboutTitle, `Conoce ${store.name}`) : index === 1 ? copy(config.catalogTitle, "La tienda") : store.name,
      body: index === 0
        ? copy(config.aboutSubtitle, "Una frase editorial que continúa la historia de la marca.")
        : copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
      mediaUrls: motionProfile.signature === "scroll-expansion"
        ? rotatedMediaUrls.slice(0, 2)
        : motionProfile.signature === motionProfile.visual
          ? rotatedMediaUrls.slice(0, 5)
          : [],
    },
    sections: [
      {
        id: "opening",
        kind: "hero",
        layout: selected.hero,
        width: selected.hero === "full-bleed" ? "full" : "wide",
        align: "left",
        motion: "none",
        title: copy(config.tagline, store.name),
        body: copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
        ctaLabel: copy(config.cartButtonLabel, "Ver la tienda"),
        backgroundColor: pageBackground,
        textColor: palette.text,
        mediaUrls: heroMediaUrls,
        items: narrativeItems(
          heroMediaUrls,
          copy(config.tagline, store.name),
          copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
        ),
      },
      {
        id: "brand-story",
        ...(storyPageId ? { pageId: storyPageId } : {}),
        kind: "story",
        layout: "stacked",
        width: "full",
        align: index === 1 ? "right" : "left",
        motion: "story-scroll",
        title: copy(config.aboutTitle, `Conoce ${store.name}`),
        body: copy(config.aboutText, `Descubre la intención y la selección detrás de ${store.name}.`),
        ctaLabel: "",
        backgroundColor: palette.story,
        textColor: palette.text,
        mediaUrls: storyMediaUrls,
        items: narrativeItems(
          storyMediaUrls,
          copy(config.aboutTitle, `Conoce ${store.name}`),
          copy(config.aboutText, `Descubre la intención y la selección detrás de ${store.name}.`),
        ),
      },
      {
        id: "shop",
        kind: "catalog",
        layout: selected.catalog === "editorial" ? "offset" : selected.catalog === "showcase" ? "grid" : "stacked",
        width: "wide",
        align: "left",
        motion: "none",
        title: copy(config.catalogTitle, "La tienda"),
        body: copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
        ctaLabel: "",
        backgroundColor: surfaceColor,
        textColor: palette.text,
        mediaUrls: [],
        items: [],
      },
      {
        id: "visual-world",
        ...(storyPageId ? { pageId: storyPageId } : {}),
        kind: "gallery",
        layout: index === 0 ? "grid" : index === 1 ? "split" : "offset",
        width: "full",
        align: "left",
        motion: motionProfile.section,
        title: copy(config.galleryTitle, "La marca en imágenes"),
        body: copy(config.gallerySubtitle, "Una mirada más cercana a su universo visual."),
        ctaLabel: "",
        backgroundColor: accentColor,
        textColor: readableInk(accentColor),
        mediaUrls: rotatedMediaUrls.slice(0, 4),
        items: [],
      },
      {
        id: "information",
        ...(contactPageId ? { pageId: contactPageId } : {}),
        kind: "contact",
        layout: "split",
        width: "wide",
        align: "left",
        motion: "none",
        title: "¿Tienes una pregunta?",
        body: `Escríbele directamente al equipo de ${store.name}.`,
        ctaLabel: "Enviar pregunta",
        backgroundColor: palette.secondary,
        textColor: readableInk(palette.secondary),
        mediaUrls: [],
        items: [],
      },
      {
        id: "follow",
        ...(contactPageId ? { pageId: contactPageId } : {}),
        kind: "links",
        layout: "minimal",
        width: "wide",
        align: "center",
        motion: "none",
        title: "Sigue la marca",
        body: "",
        ctaLabel: "",
        backgroundColor: palette.story,
        textColor: palette.text,
        mediaUrls: [],
        items: [],
      },
    ],
  };
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      blocks: section.blocks?.length ? section.blocks : deriveLegacySiteSectionBlocks(section),
    })),
  };
}

function enforceGeneratedNarrative(
  document: StoreSiteDocument,
  store: Store,
  assets: MediaAsset[],
  products: StoreProductContext[],
  directionIndex: number,
): StoreSiteDocument {
  const hero = document.sections.find((section) => section.kind === "hero");
  const catalog = document.sections.find((section) => section.kind === "catalog");
  if (!hero || !catalog) return document;

  const visualAssetUrls = assets
    .filter((asset) => asset.url !== store.logoUrl)
    .map((asset) => asset.url);
  const usableAssetUrls = visualAssetUrls.length ? visualAssetUrls : assets.map((asset) => asset.url);
  const knownAssetUrls = new Set(usableAssetUrls);
  const uniqueMedia = (preferred: string[], fallbackOffset: number, limit: number) => {
    const fallback = usableAssetUrls.length
      ? [...usableAssetUrls.slice(fallbackOffset % usableAssetUrls.length), ...usableAssetUrls.slice(0, fallbackOffset % usableAssetUrls.length)]
      : [];
    return [...new Set([...preferred.filter((url) => knownAssetUrls.has(url)), ...fallback])].slice(0, limit);
  };
  const productForMedia = (url: string) => products.find((product) => product.imageUrls.includes(url));
  const pairNarrativeItems = (
    section: StoreSiteDocument["sections"][number],
    mediaUrls: string[],
  ): StoreSiteDocument["sections"][number]["items"] => mediaUrls.map((mediaUrl, index) => {
    const authored = section.items.find((item) => item.mediaUrl === mediaUrl) ?? section.items[index];
    const product = productForMedia(mediaUrl);
    return {
      mediaUrl,
      title: authored?.title || product?.name || section.title,
      body: authored?.body || product?.description || section.body,
    };
  });

  const heroMediaUrls = uniqueMedia(hero.mediaUrls, 0, 3);
  const normalizedHero = {
    ...hero,
    motion: "none" as const,
    mediaUrls: heroMediaUrls,
    items: pairNarrativeItems(hero, heroMediaUrls),
  };
  const existingStory = document.sections.find((section) => section.kind === "story");
  const story = existingStory ?? {
    id: "brand-story",
    kind: "story" as const,
    layout: "stacked" as const,
    width: "full" as const,
    align: "left" as const,
    motion: "story-scroll" as const,
    title: `Conoce ${store.name}`,
    body: `Una mirada a la selección y al universo visual de ${store.name}.`,
    ctaLabel: "",
    backgroundColor: document.theme.pageBackground,
    textColor: document.theme.textColor,
    mediaUrls: [],
    items: [],
  };
  const storyMediaUrls = uniqueMedia(story.mediaUrls, 1, 3);
  const normalizedStory = {
    ...story,
    layout: "stacked" as const,
    width: "full" as const,
    motion: "story-scroll" as const,
    mediaUrls: storyMediaUrls,
    items: pairNarrativeItems(story, storyMediaUrls),
  };
  const motionProfile = generatedMotionProfile(directionIndex, usableAssetUrls.length);
  const normalizedSections = document.sections.map((section) => {
    if (section.kind === "hero") return normalizedHero;
    if (section.kind === "story") return normalizedStory;
    if (section.kind === "catalog") return catalog;
    if (section.kind === "gallery") {
      return {
        ...section,
        // Generated galleries avoid the thin peeking-image treatment, while
        // their position remains owned by the selected page topology.
        layout: section.layout === "rail" ? (directionIndex % 2 === 0 ? "grid" as const : "split" as const) : section.layout,
        motion: motionProfile.section,
      };
    }
    return { ...section, motion: "none" as const };
  });
  if (!existingStory) {
    const catalogIndex = normalizedSections.findIndex((section) => section.kind === "catalog");
    normalizedSections.splice(catalogIndex < 0 ? normalizedSections.length : catalogIndex, 0, normalizedStory);
  }
  const experienceMediaUrls = motionProfile.signature === "scroll-expansion"
    ? uniqueMedia(document.experience.mediaUrls, 2, 2)
    : motionProfile.signature === motionProfile.visual
      ? uniqueMedia(document.experience.mediaUrls, 2, 5)
      : [];

  return {
    ...document,
    experience: {
      ...document.experience,
      type: motionProfile.signature,
      placement: "after-catalog",
      mediaUrls: experienceMediaUrls,
    },
    sections: normalizedSections,
  };
}

function finalizeGeneratedPages(
  document: StoreSiteDocument,
  liveDocument: StoreSiteDocument | null,
  lockedSectionIds: readonly string[],
): StoreSiteDocument {
  const pageById = new Map((document.pages ?? []).map((page) => [page.id, page]));
  const lockedPageIds = new Set(document.sections
    .filter((section) => lockedSectionIds.includes(section.id) && section.pageId)
    .map((section) => section.pageId!));
  for (const page of liveDocument?.pages ?? []) {
    if (lockedPageIds.has(page.id) && !pageById.has(page.id)) pageById.set(page.id, structuredClone(page));
  }
  const sections: StoreSiteDocument["sections"] = document.sections.map((section) => {
    if (!section.pageId || pageById.has(section.pageId)) return section;
    const { pageId: _orphanedPageId, ...sectionWithoutPage } = section;
    return sectionWithoutPage;
  });
  const usedPageIds = new Set(sections.flatMap((section) => section.pageId ? [section.pageId] : []));
  const pages = [...pageById.values()].filter((page) => usedPageIds.has(page.id)).slice(0, 6);
  if (pages.length) {
    const homeIndexes = sections.flatMap((section, index) => section.pageId ? [] : [index]);
    if (sections[homeIndexes[0]]?.kind === "catalog" && sections[homeIndexes[1]]?.kind === "hero") {
      [sections[homeIndexes[0]], sections[homeIndexes[1]]] = [sections[homeIndexes[1]], sections[homeIndexes[0]]];
    }
  }
  const { pages: _previousPages, ...documentWithoutPages } = document;
  return {
    ...documentWithoutPages,
    ...(pages.length ? { pages } : {}),
    navigation: {
      ...document.navigation,
      items: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "catalog", label: "Tienda", target: "catalog" },
        ...pages.map((page) => ({ id: `nav-${page.id}`.slice(0, 48), label: page.label, target: "page" as const, pageId: page.id })),
      ],
    },
    sections,
  };
}

function legacyConfigFromSiteDocument(document: StoreSiteDocument): VisualConfig {
  const hero = document.sections.find((section) => section.kind === "hero");
  const story = document.sections.find((section) => section.kind === "story");
  const catalog = document.sections.find((section) => section.kind === "catalog");
  const gallery = document.sections.find((section) => section.kind === "gallery");
  const contact = document.sections.find((section) => section.kind === "contact");
  const location = document.sections.find((section) => section.kind === "location");
  const links = document.sections.find((section) => section.kind === "links");
  const legacyOrder = document.sections.flatMap((section) => {
    if (section.kind === "catalog") return ["products"];
    if (section.kind === "story") return ["about"];
    if (section.kind === "hero" || section.kind === "gallery" || section.kind === "links") return [section.kind];
    return [];
  });
  const contentOrder = [...new Set(legacyOrder)].filter((section) => CONTENT_SECTIONS.includes(section as (typeof CONTENT_SECTIONS)[number]));
  for (const section of CONTENT_SECTIONS) if (!contentOrder.includes(section)) contentOrder.push(section);
  const fontStyle: StoreFontStyle = document.theme.headingFont === "artisan"
    ? "artisan"
    : document.theme.headingFont === "condensed"
      ? "condensed"
      : document.theme.headingFont === "luxury"
        ? "luxury"
        : document.theme.headingFont === "editorial" || document.theme.headingFont === "classic"
          ? "editorial"
          : document.theme.headingFont === "humanist"
            ? "friendly"
            : "modern";
  return {
    siteDocument: siteDocumentJson(document),
    tagline: hero?.title ?? document.direction,
    aboutTitle: story?.title ?? "",
    aboutSubtitle: story?.body ?? "",
    aboutText: story?.body ?? "",
    catalogTitle: catalog?.title ?? "La tienda",
    catalogSubtitle: catalog?.body ?? "",
    galleryTitle: gallery?.title ?? "",
    gallerySubtitle: gallery?.body ?? "",
    contactFormEnabled: true,
    contactTitle: contact?.title ?? "¿Tienes una pregunta?",
    contactSubtitle: contact?.body ?? "",
    locationTitle: location?.title ?? "Visítanos",
    locationSubtitle: location?.body ?? "",
    linksTitle: links?.title ?? "Síguenos",
    backgroundColor: document.theme.pageBackground,
    backgroundMode: "solid",
    backgroundGradientStart: document.theme.pageBackground,
    backgroundGradientEnd: document.theme.pageBackground,
    backgroundGradientAngle: 0,
    backgroundImageUrl: null,
    accentColor: document.theme.accentColor,
    announcementColor: document.theme.secondaryColor,
    fontStyle,
    contentOrder,
    heroSlides: [],
    editorialGallery: [],
    motionDuoEnabled: false,
    motionExperiences: [],
    animations: [],
  };
}

/**
 * A generated direction is a replacement creative canvas, not a patch over the
 * merchant's previous layout. These explicit values make proposal previews and
 * applies deterministic even though the dashboard preview starts from the live
 * store object. Commerce records (products, links, locations, checkout routing,
 * logo and store identity) live outside this reset and remain untouched.
 */
function freshGeneratedVisualReset(): VisualConfig {
  return {
    bannerUrl: null,
    backgroundImageUrl: null,
    aboutImageUrl: null,
    sectionBackgrounds: {},
    announcement: null,
    announcementMode: "static",
    announcementSpeed: 18,
    announcementSize: "medium",
    announcementColor: "#111827",
    announcementFont: "store",
    announcementEffect: "none",
    promotionEnabled: false,
    promotionImageUrl: null,
    promotionTitle: null,
    promotionBody: null,
    promotionCtaLabel: null,
    promotionCtaUrl: null,
    heroSlides: [],
    editorialGallery: [],
    contentOrder: ["motion", "products", "hero", "about", "gallery", "links"],
    buttonStyle: "rounded",
    boardTexture: "painted",
    layoutStyle: "cinematic",
    experienceStyle: "editorial-grid",
    buttonVariant: "solid",
    buttonMotion: "none",
    cartButtonLabel: "Ir a pagar",
    motionDuoEnabled: false,
    motionExperience: "hero-carousel",
    motionExperiences: [],
    animations: [],
  };
}

function snapshot(store: Store): Prisma.InputJsonObject {
  return Object.fromEntries(VISUAL_FIELDS.map((field) => [field, store[field] ?? null])) as Prisma.InputJsonObject;
}

function normalizeStoreFontStyle(value: unknown): StoreFontStyle {
  return STORE_FONT_STYLES.includes(value as StoreFontStyle) ? value as StoreFontStyle : "modern";
}

function storedSiteDocument(value: unknown): StoreSiteDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const document = value as Partial<StoreSiteDocument>;
  return document.version === 1 && Array.isArray(document.sections) && document.theme && document.navigation
    ? document as StoreSiteDocument
    : null;
}

function storedSectionLocks(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{1,47}$/.test(id)).slice(0, 12)
    : [];
}

function normalizedAgentInstruction(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function localAgentRevisionPlan(instruction: string): StoreAgentRevisionPlan {
  const normalized = normalizedAgentInstruction(instruction);
  const preserveCatalog = /(manten|mantener|conserv|preserv|no (?:cambies|toques|modifiques)).{0,32}(catalog|producto|tienda)/.test(normalized);
  const target: StoreAgentRevisionPlan["target"] = /(apertura|portada|inicio|hero|cabecera)/.test(normalized)
    ? "opening"
    : /(historia|story|relato)/.test(normalized)
      ? "story"
      : /(galeria|gallery|fotos)/.test(normalized)
        ? "gallery"
        : /(contacto|contact)/.test(normalized)
          ? "contact"
          : /(catalog|producto|tienda)/.test(normalized) && !preserveCatalog
            ? "catalog"
            : "site";
  const tone: StoreAgentRevisionPlan["tone"] = /(calid|acogedor|cercan|humano)/.test(normalized)
    ? "warmer"
    : /(fresc|frio|sobrio azulado)/.test(normalized)
      ? "cooler"
      : /(atrevid|fuerte|impact|bold)/.test(normalized)
        ? "bolder"
        : /(seren|suave|sutil|tranquil)/.test(normalized)
          ? "quieter"
          : /(minimal|simple|limpi)/.test(normalized)
            ? "minimal"
            : /(editorial|revista)/.test(normalized)
              ? "editorial"
              : "unchanged";
  const targetLabel = target === "opening" ? "la apertura" : target === "site" ? "el lenguaje visual" : `la sección ${target}`;
  const toneLabel = tone === "unchanged" ? "siguiendo la instrucción" : `con un tono ${tone}`;
  return { target, tone, preserveCatalog, summary: `Ajustar ${targetLabel} ${toneLabel}.` };
}

function hexChannels(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as [number, number, number];
}

function blendHex(base: string, tint: string, amount: number): string {
  const from = hexChannels(base) ?? [245, 243, 238];
  const to = hexChannels(tint) ?? [245, 243, 238];
  return `#${from.map((channel, index) => Math.round(channel + (to[index] - channel) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(value: string): number {
  const channels = hexChannels(value) ?? [255, 255, 255];
  return channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

function readableText(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, "#17120f") >= contrastRatio(background, "#fffaf2") ? "#17120f" : "#fffaf2";
}

function applyAgentRevisionPlan(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteDocument {
  const openingId = document.sections.find((section) => !section.pageId && (!plan.preserveCatalog || section.kind !== "catalog"))?.id
    ?? document.sections[0]?.id;
  const matchesTarget = (section: StoreSiteDocument["sections"][number]) => {
    if (plan.target === "site") return plan.preserveCatalog ? section.kind !== "catalog" : true;
    if (plan.target === "opening") return section.id === openingId;
    return section.kind === plan.target;
  };
  const tint = plan.tone === "warmer" ? "#f1ad62"
    : plan.tone === "cooler" ? "#9fc7d4"
      : plan.tone === "bolder" ? "#e58a32"
        : plan.tone === "editorial" ? "#cbb69a"
          : "#eee9df";
  const amount = plan.tone === "bolder" ? 0.42 : plan.tone === "unchanged" ? 0.12 : 0.28;
  return {
    ...document,
    direction: `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120),
    sections: document.sections.map((section) => {
      if (!matchesTarget(section)) return structuredClone(section);
      const backgroundColor = plan.tone === "minimal"
        ? document.theme.pageBackground
        : blendHex(section.backgroundColor, tint, amount);
      return {
        ...section,
        backgroundColor,
        textColor: readableText(backgroundColor, section.textColor),
        ...(plan.tone === "minimal" ? { motion: "none" as const } : {}),
      };
    }),
  };
}

function storefrontMediaCandidates(
  store: Store,
  uploadedAssetUrls: readonly string[],
  assets: readonly MediaAsset[],
  products: readonly StoreProductContext[],
): StorefrontSemanticMediaCandidate[] {
  const uploaded = new Set(uploadedAssetUrls);
  const productImagePosition = new Map<string, number>();
  products.forEach((product) => product.imageUrls.forEach((url, index) => {
    if (!productImagePosition.has(url)) productImagePosition.set(url, index);
  }));
  return assets.map((asset, index) => {
    const productPosition = productImagePosition.get(asset.url);
    const roles = new Set<StorefrontSemanticMediaCandidate["roles"][number]>();
    if (asset.url === store.logoUrl) roles.add("logo");
    if (productPosition === 0) {
      roles.add("featured-product");
      roles.add("collection-cover");
      roles.add("campaign-image");
    } else if (typeof productPosition === "number") {
      roles.add("product-detail");
      roles.add("process-image");
      roles.add("ambient-detail");
    }
    if (uploaded.has(asset.url) && typeof productPosition !== "number" && asset.url !== store.logoUrl) {
      roles.add("brand-texture");
      roles.add("process-image");
      roles.add("founder-or-story");
      roles.add("campaign-image");
      roles.add("lifestyle");
      roles.add("editorial");
      roles.add("ambient-detail");
    }
    if (!roles.size) {
      roles.add("editorial");
      roles.add("lifestyle");
      roles.add("ambient-detail");
    }
    return { url: asset.url, roles: [...roles], priority: index };
  });
}

function toStoreUpdate(config: unknown): Prisma.StoreUpdateInput {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
  const allowed = Object.fromEntries(VISUAL_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]));
  if ("fontStyle" in allowed) allowed.fontStyle = normalizeStoreFontStyle(allowed.fontStyle);
  if (typeof allowed.experienceStyle === "string") {
    allowed.experienceStyle = allowed.experienceStyle === "story-scroller" ? "story-scroller" : "editorial-grid";
  }
  if (Array.isArray(allowed.motionExperiences)) {
    allowed.motionExperiences = allowed.motionExperiences.filter((entry) =>
      typeof entry === "string" && MOTION_EXPERIENCES.includes(entry as (typeof MOTION_EXPERIENCES)[number]),
    );
  }
  if (typeof allowed.motionExperience === "string" && !MOTION_EXPERIENCES.includes(allowed.motionExperience as (typeof MOTION_EXPERIENCES)[number])) {
    allowed.motionExperience = "hero-carousel";
  }
  if (Array.isArray(allowed.animations)) {
    allowed.animations = allowed.animations.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      return MOTION_EXPERIENCES.includes((entry as Record<string, unknown>).type as (typeof MOTION_EXPERIENCES)[number]);
    });
  }
  if (allowed.siteDocument && typeof allowed.siteDocument === "object" && !Array.isArray(allowed.siteDocument)) {
    const document = structuredClone(allowed.siteDocument) as Record<string, any>;
    if (Array.isArray(document.sections)) {
      document.sections = document.sections.map((section: unknown) => {
        if (!section || typeof section !== "object" || Array.isArray(section)) return section;
        const normalized = { ...(section as Record<string, unknown>) };
        if (normalized.motion === "coverflow") normalized.motion = "none";
        if (normalized.kind === "gallery" && normalized.layout === "rail") normalized.layout = "grid";
        return normalized;
      });
    }
    if (document.experience && typeof document.experience === "object" && RETIRED_MOTION_EXPERIENCES.has(document.experience.type)) {
      document.experience = { ...document.experience, type: "none", mediaUrls: [] };
    }
    allowed.siteDocument = document;
  }
  return allowed as Prisma.StoreUpdateInput;
}

@Injectable()
export class VisualStudioService {
  private readonly logger = new Logger(VisualStudioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly config: ConfigService,
  ) {}

  async list(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const [proposals, versions, templates] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 24 }),
    ]);
    return {
      proposals: proposals.map((proposal) => ({ ...proposal, config: enforceUniqueGeneratedProposalConfig(proposal.config) })),
      versions,
      templates,
      lockedSectionIds: storedSectionLocks(store.visualSectionLocks),
    };
  }

  private async agentRevisionPlan(
    instruction: string,
    document: StoreSiteDocument,
    conversationContext: string[],
  ): Promise<StoreAgentRevisionPlan> {
    const fallback = localAgentRevisionPlan(instruction);
    if (!this.config.get<boolean>("app.openAi.enabled") || !this.config.get<string>("app.openAi.apiKey")) return fallback;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["target", "tone", "preserveCatalog", "summary"],
      properties: {
        target: { type: "string", enum: ["opening", "catalog", "story", "gallery", "contact", "site"] },
        tone: { type: "string", enum: ["warmer", "cooler", "bolder", "quieter", "minimal", "editorial", "unchanged"] },
        preserveCatalog: { type: "boolean" },
        summary: { type: "string", minLength: 1, maxLength: 160 },
      },
    };
    const sections = document.sections.map((section, index) => `${index === 0 ? "opening " : ""}${section.id}:${section.kind}:${section.title}`).join("\n");
    const prompt = [
      "Interpreta una instrucción de edición para una tienda. Devuelve sólo un plan JSON acotado; no escribas HTML, CSS ni código.",
      "El plan puede cambiar el tono visual de una zona, pero nunca precios, productos, inventario, pagos, checkout, formularios, KYC ni publicación.",
      "preserveCatalog debe ser true cuando el comercio pida mantener, conservar o no tocar el catálogo o los productos.",
      `Secciones disponibles:\n${sections}`,
      conversationContext.length ? `Contexto reciente:\n${conversationContext.slice(-6).join("\n")}` : "Sin contexto anterior.",
      `Instrucción actual:\n${instruction}`,
    ].join("\n\n");
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
          text: { format: { type: "json_schema", name: "store_agent_revision_plan", strict: true, schema } },
          reasoning: { effort: "medium" },
          max_output_tokens: 900,
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const body = await response.json() as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message || "OpenAI revision planning failed");
      const output = body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
      if (!output) return fallback;
      const plan = JSON.parse(output) as StoreAgentRevisionPlan;
      const guardedPlan: StoreAgentRevisionPlan = {
        ...plan,
        target: fallback.target !== "site" ? fallback.target : plan.target,
        tone: fallback.tone !== "unchanged" ? fallback.tone : plan.tone,
        preserveCatalog: fallback.preserveCatalog || plan.preserveCatalog,
      };
      const targetExists = guardedPlan.target === "site" || guardedPlan.target === "opening" || document.sections.some((section) => section.kind === guardedPlan.target);
      return targetExists ? guardedPlan : fallback;
    } catch (error) {
      this.logger.warn(`Agent revision planning fell back to bounded local intent: ${(error as Error).message}`);
      return fallback;
    }
  }

  async revise(
    merchantId: string,
    storeId: string,
    proposalId: string,
    instruction: string,
    conversationContext: string[] = [],
  ) {
    await this.ownedStore(merchantId, storeId);
    const source = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!source) throw new NotFoundException("Visual proposal not found");
    const sourceConfig = source.config && typeof source.config === "object" && !Array.isArray(source.config)
      ? source.config as Record<string, unknown>
      : {};
    const sourceDocument = storedSiteDocument(sourceConfig.siteDocument);
    if (!sourceDocument) throw new BadRequestException("La propuesta ya no contiene un documento visual editable");
    const plan = await this.agentRevisionPlan(instruction, sourceDocument, conversationContext);
    const nextDocument = applyAgentRevisionPlan(sourceDocument, plan);
    const nextConfig = {
      ...sourceConfig,
      ...legacyConfigFromSiteDocument(nextDocument),
    } as Prisma.InputJsonObject;
    const signature = storefrontStructuralSignature(nextDocument);
    const proposal = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.storeVisualProposal.create({
        data: {
          storeId,
          title: `${source.title} · ajuste`.slice(0, 120),
          rationale: plan.summary,
          provider: this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")
            ? `agent:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`
            : "agent:bounded-local",
          config: nextConfig,
          sourceAssetUrls: source.sourceAssetUrls as Prisma.InputJsonValue,
          generatedUrls: source.generatedUrls as Prisma.InputJsonValue,
        },
      });
      await transaction.storeVisualSignature.create({
        data: {
          storeId,
          sourceType: "PROPOSAL",
          sourceId: created.id,
          fingerprint: signature.fingerprint,
          signature: signature as unknown as Prisma.InputJsonObject,
        },
      });
      return created;
    });
    const changedAreas = plan.target === "opening" ? ["apertura"] : plan.target === "site" ? ["lenguaje visual"] : [plan.target];
    const preservedAreas = [
      ...(plan.preserveCatalog || plan.target !== "catalog" ? ["catálogo"] : []),
      "productos",
      "precios",
      "inventario",
      "checkout",
      "estado público",
    ];
    return { proposal, plan, changedAreas, preservedAreas };
  }

  async setSectionLocks(merchantId: string, storeId: string, sectionIds: string[]) {
    const store = await this.ownedStore(merchantId, storeId);
    const document = storedSiteDocument(store.siteDocument);
    if (sectionIds.length && (!document || sectionIds.some((id) => !document.sections.some((section) => section.id === id)))) {
      throw new BadRequestException("Una o más secciones bloqueadas ya no existen en la versión actual de la tienda");
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { visualSectionLocks: sectionIds } });
    return { sectionIds };
  }

  async generate(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    const store = await this.ownedStore(merchantId, storeId);
    const selectedTemplate = dto.templateId
      ? await this.prisma.storeVisualTemplate.findFirst({ where: { id: dto.templateId, merchantId } })
      : null;
    if (dto.templateId && !selectedTemplate) throw new BadRequestException("La receta visual seleccionada no existe o no pertenece a tu cuenta");
    const checkoutMode: "payment" | "whatsapp" | "external" = ["payment", "whatsapp", "external"].includes(dto.checkoutMode || "")
      ? dto.checkoutMode as "payment" | "whatsapp" | "external"
      : ["payment", "whatsapp", "external"].includes(store.checkoutMode)
        ? store.checkoutMode as "payment" | "whatsapp" | "external"
        : "payment";
    const whatsappPhone = dto.whatsappPhone?.trim() || store.contactPhone?.trim() || "";
    const whatsappDigits = whatsappPhone.replace(/\D/g, "");
    if (checkoutMode === "whatsapp" && (whatsappDigits.length < 7 || whatsappDigits.length > 15)) {
      throw new BadRequestException("Configura un número de WhatsApp válido, con 7 a 15 dígitos, antes de crear las propuestas");
    }
    const leadCaptureUrl = dto.leadCaptureUrl?.trim() || store.leadCaptureUrl?.trim() || "";
    if (checkoutMode === "external" && !/^https?:\/\/[^\s]+$/i.test(leadCaptureUrl)) {
      throw new BadRequestException("Configura un enlace http(s) válido antes de crear las propuestas");
    }
    const proposalInput: GenerateVisualProposalsDto = {
      ...dto,
      checkoutMode,
      ...(checkoutMode === "whatsapp" && { whatsappPhone }),
      ...(checkoutMode === "external" && { leadCaptureUrl }),
    };
    const [products, links, previousProposals, previousVersions, merchantTemplates, recentSignatures] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId, status: "ACTIVE" },
        select: { id: true, name: true, description: true, imageUrls: true, tags: true },
        orderBy: { createdAt: "asc" },
        take: 24,
      }),
      this.prisma.storeLink.findMany({ where: { storeId }, select: { label: true, url: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, select: { id: true, config: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, select: { source: true, snapshot: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, select: { id: true, recipe: true }, orderBy: { createdAt: "desc" }, take: 24 }),
      this.prisma.storeVisualSignature.findMany({
        where: selectedTemplate ? {
          NOT: [
            { sourceType: "TEMPLATE", sourceId: selectedTemplate.id },
            ...(selectedTemplate.sourceProposalId ? [{ sourceType: "PROPOSAL", sourceId: selectedTemplate.sourceProposalId }] : []),
          ],
        } : undefined,
        select: { signature: true },
        orderBy: { createdAt: "desc" },
        take: 160,
      }),
    ]);
    const uploadedAssetUrls = dto.assetUrls ?? [];
    const assetUrls = [...new Set([
      store.logoUrl,
      ...uploadedAssetUrls,
      ...products.flatMap((product) => product.imageUrls),
    ].filter((url): url is string => typeof url === "string" && /^\/v1\/uploads\//.test(url)))].slice(0, 24);
    const assets = await this.prisma.mediaAsset.findMany({
      where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"] } },
    });
    if (uploadedAssetUrls.some((url) => !assets.some((asset) => asset.url === url))) {
      throw new BadRequestException("Uno o más archivos no pertenecen a tu cuenta o no tienen un formato compatible");
    }
    if (uploadedAssetUrls.length) {
      await this.prisma.mediaAsset.updateMany({ where: { id: { in: assets.filter((asset) => uploadedAssetUrls.includes(asset.url)).map((asset) => asset.id) }, storeId: null }, data: { storeId } });
    }

    const orderedAssets = assetUrls.flatMap((url) => assets.find((asset) => asset.url === url) ?? []);
    if (orderedAssets.length === 0) {
      throw new BadRequestException("Agrega al menos una foto o video a la tienda o a un producto antes de crear el sitio con IA");
    }
    const brandFingerprint = storefrontBrandFingerprint({
      store: { id: store.id, name: store.name, logoUrl: store.logoUrl, accentColor: store.accentColor },
      brief: { category: proposalInput.businessCategory || "", personality: proposalInput.personality || "", creativeBrief: proposalInput.creativeBrief || "", checkoutMode },
      assets: orderedAssets.map((asset) => [asset.url, asset.mimeType, asset.byteSize]),
      products: products.map((product) => [product.id, product.name, product.description, product.tags, product.imageUrls]),
      links,
    });
    const engineContext = beginStorefrontGeneration(brandFingerprint);
    const mediaCandidates = storefrontMediaCandidates(store, uploadedAssetUrls, orderedAssets, products);
    const liveDocument = storedSiteDocument(store.siteDocument);
    const lockedSectionIds = dto.lockedSectionIds ?? storedSectionLocks(store.visualSectionLocks);
    if (lockedSectionIds.length && (!liveDocument || lockedSectionIds.some((id) => !liveDocument.sections.some((section) => section.id === id)))) {
      throw new BadRequestException("Una o más secciones bloqueadas ya no existen en la versión actual de la tienda");
    }
    if (dto.lockedSectionIds) {
      await this.prisma.store.update({ where: { id: storeId }, data: { visualSectionLocks: lockedSectionIds } });
    }
    const previousDocuments = (previousProposals ?? []).flatMap((proposal) => {
      if (proposal.id === selectedTemplate?.sourceProposalId) return [];
      const config = proposal.config && typeof proposal.config === "object" && !Array.isArray(proposal.config)
        ? proposal.config as Record<string, unknown>
        : {};
      const document = storedSiteDocument(config.siteDocument);
      return document ? [document] : [];
    }).concat((previousVersions ?? []).flatMap((version) => {
      if (selectedTemplate?.sourceProposalId && version.source === `proposal:${selectedTemplate.sourceProposalId}`) return [];
      const snapshotValue = version.snapshot && typeof version.snapshot === "object" && !Array.isArray(version.snapshot)
        ? version.snapshot as Record<string, unknown>
        : {};
      const document = storedSiteDocument(snapshotValue.siteDocument);
      return document ? [document] : [];
    }));
    const previousSignatures = (recentSignatures ?? []).flatMap((entry) => {
      const signature = storedStorefrontStructuralSignature(entry.signature);
      return signature ? [signature] : [];
    });
    const assignedArtDirections = proposalArtDirections(proposalInput.artDirection, engineContext.generation);
    let presets = this.presets(store, proposalInput, orderedAssets, products, links);
    let provider = "local-curated";
    let analysisCacheHit = false;

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiResult = await this.generateDirections(store, proposalInput, orderedAssets, products, links, engineContext);
      if (aiResult) {
        presets = aiResult.presets;
        analysisCacheHit = aiResult.analysisCacheHit;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`;
      }
    }

    const acceptedDocuments: StoreSiteDocument[] = [];
    const acceptedOriginality: number[] = [];
    presets = presets.map((preset, index) => {
      const existingDocument = preset.config.siteDocument as StoreSiteDocument | undefined;
      const baseDocument = existingDocument ?? localSiteDocument(store, preset, orderedAssets, products, links, index + engineContext.generation);
      const directedDocument = applySiteArtDirection(baseDocument, assignedArtDirections[index]);
      const narrativeDocument = enforceGeneratedNarrative(directedDocument, store, orderedAssets, products, index);
      let recipeDocument = narrativeDocument;
      if (selectedTemplate) {
        try {
          recipeDocument = applyStorefrontCreativeRecipe(narrativeDocument, selectedTemplate.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates);
        } catch {
          throw new BadRequestException("La receta guardada ya no es compatible con el compositor actual. Guarda una receta nueva desde una propuesta reciente.");
        }
      }
      const topologyDocument = selectedTemplate
        ? recipeDocument
        : applyStorefrontTopology(recipeDocument, engineContext, index, 0, lockedSectionIds, mediaCandidates);
      const templateDocuments = (merchantTemplates ?? []).flatMap((template) => {
        if (template.id === selectedTemplate?.id) return [];
        try {
          return [applyStorefrontCreativeRecipe(narrativeDocument, template.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates)];
        } catch {
          return [];
        }
      });
      const uniqueInventory = enforceUniqueGeneratedAnimationTypes(
        withStorefrontEngineMetadata(topologyDocument, engineContext, index),
        [],
        [],
      );
      let siteDocument = finalizeGeneratedPages(
        preserveLockedStorefrontSections(uniqueInventory.siteDocument, liveDocument, lockedSectionIds),
        liveDocument,
        lockedSectionIds,
      );
      let originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
      // A locked opening owns its position as well as its contents. Requiring
      // a second opening kind in that case is impossible without violating the
      // merchant's lock, so diversity is measured on the remaining axes.
      const openingIsLocked = Boolean(liveDocument?.sections[0] && lockedSectionIds.includes(liveDocument.sections[0].id));
      const requireMultipleOpenings = index === presets.length - 1 && !openingIsLocked;
      let advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, requireMultipleOpenings);
      for (let attempt = 1; (!originality.accepted || !advancesBatch) && attempt <= 12; attempt += 1) {
        let varied: StoreSiteDocument;
        try {
          varied = selectedTemplate
            ? applyStorefrontCreativeRecipe(narrativeDocument, selectedTemplate.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates, attempt)
            : varyStorefrontStructure(siteDocument, engineContext, index, attempt, lockedSectionIds, mediaCandidates);
        } catch {
          throw new BadRequestException("La receta guardada ya no es compatible con el compositor actual. Guarda una receta nueva desde una propuesta reciente.");
        }
        const uniqueVariation = enforceUniqueGeneratedAnimationTypes(
          withStorefrontEngineMetadata(varied, engineContext, index),
          [],
          [],
        );
        siteDocument = finalizeGeneratedPages(
          preserveLockedStorefrontSections(uniqueVariation.siteDocument, liveDocument, lockedSectionIds),
          liveDocument,
          lockedSectionIds,
        );
        originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
        advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, requireMultipleOpenings);
      }
      if (!originality.accepted || !advancesBatch) {
        throw new BadRequestException("No pudimos crear tres direcciones suficientemente originales y distintas sin tocar tus secciones bloqueadas. Desbloquea una sección, amplía la receta o cambia el brief e inténtalo otra vez.");
      }
      acceptedDocuments.push(siteDocument);
      acceptedOriginality.push(originality.closestSimilarity);
      return {
        ...preset,
        config: {
          ...freshGeneratedVisualReset(),
          ...preset.config,
          ...legacyConfigFromSiteDocument(siteDocument),
          motionDuoEnabled: false,
          motionExperience: "hero-carousel",
          motionExperiences: [],
          animations: [],
          // Continuous ribbons are an obvious generated-store tell. Keep the
          // default calm and only animate the announcement when an older,
          // explicit client still asks for that behavior.
          announcementMode: dto.announcementMarqueeEnabled === true ? "marquee" : "static",
          checkoutMode,
          ...(checkoutMode === "whatsapp" && { cartButtonLabel: "Pedir por WhatsApp", contactPhone: whatsappPhone }),
          ...(checkoutMode === "external" && { cartButtonLabel: "Continuar al enlace", leadCaptureUrl }),
        },
      };
    });

    const lockedOpening = Boolean(liveDocument?.sections[0] && lockedSectionIds.includes(liveDocument.sections[0].id));
    const diversity = evaluateStorefrontDiversity(acceptedDocuments, 0.66, lockedOpening ? 1 : 2);
    if (!diversity.accepted) {
      throw new BadRequestException("Las tres propuestas no alcanzaron la variedad estructural mínima. Cambia el brief o la receta e inténtalo otra vez.");
    }

    const proposals = await this.prisma.$transaction(async (transaction) => {
      const created: StoreVisualProposal[] = [];
      for (const preset of presets) {
        created.push(await transaction.storeVisualProposal.create({
          data: {
            storeId,
            title: preset.title,
            rationale: preset.rationale,
            provider,
            config: preset.config as Prisma.InputJsonObject,
            sourceAssetUrls: assetUrls,
            generatedUrls: [],
          },
        }));
      }
      await transaction.storeVisualSignature.createMany({
        data: acceptedDocuments.map((document, index) => {
          const signature = storefrontStructuralSignature(document, lockedSectionIds);
          return {
            storeId,
            sourceType: "PROPOSAL",
            sourceId: created[index]?.id ?? null,
            fingerprint: signature.fingerprint,
            signature: signature as unknown as Prisma.InputJsonObject,
          };
        }),
      });
      return created;
    });
    return {
      proposals,
      mode: provider.startsWith("openai:") ? "ai" : "local",
      originalsPreserved: true,
      engine: {
        version: "2.0",
        brandFingerprint,
        generation: engineContext.generation,
        analysisCacheHit,
        lockedSectionIds,
        originalityGate: "passed",
        closestSimilarities: acceptedOriginality.map((value) => Number(value.toFixed(3))),
        comparedAgainst: previousDocuments.length + previousSignatures.length + (merchantTemplates?.length ?? 0),
        diversity: {
          ...diversity,
          maximumPairSimilarity: Number(diversity.maximumPairSimilarity.toFixed(3)),
          averagePairSimilarity: Number(diversity.averagePairSimilarity.toFixed(3)),
        },
        templateId: selectedTemplate?.id ?? null,
      },
    };
  }

  async saveTemplate(merchantId: string, storeId: string, proposalId: string, name: string) {
    await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const config = proposal.config && typeof proposal.config === "object" && !Array.isArray(proposal.config)
      ? proposal.config as Record<string, unknown>
      : {};
    const document = storedSiteDocument(config.siteDocument);
    if (!document) throw new BadRequestException("La propuesta no contiene una receta visual reutilizable");
    const recipe = storefrontCreativeRecipe(document, name);
    const signature = storefrontStructuralSignature(document);
    return this.prisma.$transaction(async (transaction) => {
      const template = await transaction.storeVisualTemplate.create({
        data: { merchantId, name: recipe.name, sourceProposalId: proposal.id, recipe: recipe as unknown as Prisma.InputJsonObject },
      });
      await transaction.storeVisualSignature.create({
        data: {
          storeId,
          sourceType: "TEMPLATE",
          sourceId: template.id,
          fingerprint: signature.fingerprint,
          signature: signature as unknown as Prisma.InputJsonObject,
        },
      });
      return template;
    });
  }

  async apply(merchantId: string, storeId: string, proposalId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const [updated] = await this.prisma.$transaction([
      this.prisma.store.update({ where: { id: storeId }, data: toStoreUpdate(enforceUniqueGeneratedProposalConfig(proposal.config)) }),
      this.prisma.storeVisualVersion.create({
        data: { storeId, label: `Antes de “${proposal.title}”`, source: `proposal:${proposal.id}`, snapshot: snapshot(store) },
      }),
      this.prisma.storeVisualProposal.updateMany({
        where: { storeId, id: { not: proposal.id }, status: "APPLIED" },
        data: { status: "READY", appliedAt: null },
      }),
      this.prisma.storeVisualProposal.update({ where: { id: proposal.id }, data: { status: "APPLIED", appliedAt: new Date() } }),
    ]);
    return updated;
  }

  async restore(merchantId: string, storeId: string, versionId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const version = await this.prisma.storeVisualVersion.findFirst({ where: { id: versionId, storeId } });
    if (!version) throw new NotFoundException("Visual version not found");
    const [updated] = await this.prisma.$transaction([
      this.prisma.store.update({ where: { id: storeId }, data: toStoreUpdate(version.snapshot) }),
      this.prisma.storeVisualVersion.create({
        data: { storeId, label: "Antes de restaurar", source: `restore:${version.id}`, snapshot: snapshot(store) },
      }),
    ]);
    return updated;
  }

  async dismiss(merchantId: string, storeId: string, proposalId: string) {
    await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    return this.prisma.storeVisualProposal.update({ where: { id: proposalId }, data: { status: "DISMISSED" } });
  }

  private async ownedStore(merchantId: string, storeId: string): Promise<Store> {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, merchantId } });
    if (!store) throw new NotFoundException("Store not found");
    return store;
  }

  private presets(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[]): ProposalPreset[] {
    const subject = dto.businessCategory?.trim() || products.slice(0, 3).map((product) => product.name).join(", ") || "los productos de la marca";
    const normalizedCategory = subject.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const categoryProfile = /cafe|matcha|\bte\b|comida|restaurante|panader|reposter|bebida/.test(normalizedCategory)
      ? { titles: ["Mesa abierta", "Carta de autor", "Antojo directo"], catalog: ["El menú", "Sabores para elegir", "Pide lo que te provoca"], ctas: ["Pedir ahora", "Ver el menú", "Armar mi pedido"], detail: "ritmo sensorial, producto apetecible y decisiones rápidas" }
      : /ropa|moda|calzado|joy|accesorio/.test(normalizedCategory)
        ? { titles: ["Colección viva", "Edición de temporada", "Lookbook directo"], catalog: ["La colección", "Piezas seleccionadas", "Encuentra tu próximo look"], ctas: ["Ver la colección", "Elegir mi pieza", "Explorar novedades"], detail: "dirección editorial, silueta, detalle y descubrimiento de colección" }
        : /belleza|cosmetic|skincare|spa|bienestar/.test(normalizedCategory)
          ? { titles: ["Ritual cotidiano", "Laboratorio sereno", "Resultados a tu ritmo"], catalog: ["Elige tu ritual", "Fórmulas y cuidados", "Encuentra tu cuidado"], ctas: ["Crear mi rutina", "Explorar cuidados", "Elegir mi producto"], detail: "claridad, confianza y una secuencia de cuidado fácil de entender" }
          : /arte|ceram|decor|hogar|mueble|artesania/.test(normalizedCategory)
            ? { titles: ["Taller en escena", "Piezas con historia", "Selección para habitar"], catalog: ["Explora las piezas", "Objetos con intención", "Encuentra tu pieza"], ctas: ["Ver las piezas", "Conocer la colección", "Elegir para mi espacio"], detail: "materialidad, escala, proceso y una lectura pausada de cada pieza" }
            : /tecnolog|electron|software|servicio/.test(normalizedCategory)
              ? { titles: ["Solución en foco", "Sistema claro", "Decisión informada"], catalog: ["Explora las opciones", "Compara con claridad", "Elige lo que necesitas"], ctas: ["Ver opciones", "Comparar productos", "Elegir una solución"], detail: "jerarquía funcional, comparación y reducción de incertidumbre" }
              : { titles: [`${store.name}, de cerca`, "Selección con criterio", "Compra sin vueltas"], catalog: ["Descubre la tienda", "La selección", "Encuentra tu favorito"], ctas: ["Explorar productos", "Ver la selección", "Elegir ahora"], detail: `una experiencia específica para ${subject}, sin recursos genéricos de ecommerce` };
    const hero = (index: number, title: string, body: string) => assets.length
      ? Array.from({ length: 5 }, (_, offset) => ({
          imageUrl: assets[(index + offset) % assets.length].url,
          title: offset === 0 ? title : offset === 1 ? `Conoce ${store.name}` : offset === 2 ? `Explora ${subject}` : offset === 3 ? "Mira cada detalle" : "Elige a tu manera",
          body: offset === 0 ? body : offset === 1 ? "Descubre la intención y personalidad detrás de esta selección." : offset === 2 ? "Encuentra los productos reunidos en una experiencia clara y directa." : offset === 3 ? "Las imágenes y el contexto trabajan juntos para presentar la marca con más profundidad." : "Termina el recorrido en el catálogo y arma una selección propia.",
          ctaLabel: "Ver productos",
          ctaUrl: "",
        }))
      : [];
    const gallery = assets.filter((asset) => asset.mimeType.startsWith("image/")).slice(0, 6).map((asset, index) => ({
      imageUrl: asset.url,
      title: products[index]?.name || `Una mirada a ${store.name}`,
      caption: index % 2 === 0 ? "Detalle de la selección" : "Parte de la historia visual",
      body: products[index]?.description || `Esta imagen amplía la historia de ${store.name} y da contexto a la selección antes de llegar al catálogo.`,
    }));
    const socialNote = links.length ? "Los enlaces sociales existentes aparecen como botones al final." : "Puedes agregar redes sociales y aparecerán como botones al final.";
    const selectedFontStyle = normalizeStoreFontStyle(dto.fontStyle || store.fontStyle);
    const proposals: ProposalPreset[] = [
      {
        title: "Taller cálido",
        rationale: `Una tienda cercana que convierte tus fotos y catálogo actuales en una historia visual completa. ${socialNote}`,
        config: { tagline: `${subject}, presentados con calidez y detalle.`, aboutTitle: `La historia de ${store.name}`, aboutSubtitle: "Una marca se conoce mejor cuando entendemos lo que inspira cada elección.", aboutText: `Conoce la selección y los detalles visuales que dan forma a ${store.name}.`, catalogTitle: "Descubre la tienda", catalogSubtitle: `Explora la selección actual de ${store.name} y encuentra lo que mejor encaja contigo.`, galleryTitle: "La marca en imágenes", gallerySubtitle: "Una mirada más cercana a su universo visual.", backgroundColor: "#f4ead7", backgroundImageUrl: null, accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "square", boardTexture: "kraft", announcement: `Descubre la selección de ${store.name} • Compra fácil y segura`, announcementMode: "marquee", announcementSpeed: 20, announcementSize: "medium", announcementColor: "#d8a25e", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "none", cartButtonLabel: "Quiero comprar", layoutStyle: "cinematic", experienceStyle: "story-scroller", contentOrder: ["motion", "products", "about", "hero", "gallery", "links"], heroSlides: hero(0, `Hecho para disfrutar ${subject}`, "Explora una selección preparada para mostrar cada producto con claridad."), editorialGallery: gallery },
      },
      {
        title: "Editorial sereno",
        rationale: `Una composición con aire, lectura pausada y protagonismo absoluto del catálogo existente. ${socialNote}`,
        config: { tagline: `Una mirada serena a ${subject}.`, aboutTitle: `Detrás de ${store.name}`, aboutSubtitle: "Una introducción pausada a la intención que guía la marca.", aboutText: `Una mirada a la selección, las imágenes y la identidad visual de ${store.name}.`, catalogTitle: "La selección", catalogSubtitle: "Una colección clara, pensada para explorar sin prisa.", galleryTitle: "Notas visuales", gallerySubtitle: "Detalles, atmósferas y perspectivas de la marca.", backgroundColor: "#f7f5f0", backgroundImageUrl: null, accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", announcement: `${store.name} • Colección actual • Explora el catálogo`, announcementMode: "static", announcementSpeed: 24, announcementSize: "small", announcementColor: "#274c43", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", layoutStyle: "editorial", experienceStyle: "editorial-grid", contentOrder: ["motion", "products", "hero", "gallery", "about", "links"], heroSlides: hero(1, `La selección de ${store.name}`, "Tus imágenes actuales, ordenadas como una portada editorial."), editorialGallery: gallery.slice().reverse() },
      },
      {
        title: "Mercado vibrante",
        rationale: `Una dirección rápida y expresiva, con cinta en movimiento, llamados claros y tus productos al frente. ${socialNote}`,
        config: { tagline: `${subject} con energía propia.`, aboutTitle: `${store.name}, de cerca`, aboutSubtitle: "Personalidad, intención y una forma propia de presentar cada elección.", aboutText: `Explora la selección y el universo visual que ${store.name} comparte en esta tienda.`, catalogTitle: "Entra a la tienda", catalogSubtitle: `Mira, elige y explora todo lo que ${store.name} tiene para mostrar.`, galleryTitle: "Más para descubrir", gallerySubtitle: "La energía de la marca continúa en cada imagen.", backgroundColor: "#e8f2ef", backgroundImageUrl: null, accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", announcement: `Novedades en ${store.name} • Mira • Elige • Compra`, announcementMode: "marquee", announcementSpeed: 14, announcementSize: "large", announcementColor: "#7f1d1d", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", layoutStyle: "catalog-first", experienceStyle: "editorial-grid", contentOrder: ["motion", "products", "gallery", "hero", "about", "links"], heroSlides: hero(2, `Encuentra tu próximo favorito`, `Explora ${subject} y elige directamente desde el catálogo.`), editorialGallery: gallery },
      },
    ];
    const contentOrders = [
      ["motion", "products", "hero", "about", "gallery", "links"],
      ["motion", "products", "about", "hero", "links", "gallery"],
      ["motion", "products", "gallery", "about", "links", "hero"],
    ];
    return proposals.map((proposal, index) => ({
      ...proposal,
      title: categoryProfile.titles[index],
      rationale: `${proposal.rationale} La dirección responde al rubro con ${categoryProfile.detail}.`,
      config: {
        ...proposal.config,
        backgroundMode: "solid",
        backgroundGradientStart: proposal.config.backgroundColor,
        backgroundGradientEnd: proposal.config.backgroundColor,
        backgroundGradientAngle: 0,
        fontStyle: selectedFontStyle,
        catalogTitle: categoryProfile.catalog[index],
        cartButtonLabel: categoryProfile.ctas[index],
        contentOrder: contentOrders[index],
      },
    }));
  }

  private async generateDirections(
    store: Store,
    dto: GenerateVisualProposalsDto,
    assets: MediaAsset[],
    products: StoreProductContext[],
    links: StoreLinkContext[],
    engineContext: StorefrontEngineContext,
  ): Promise<{ presets: ProposalPreset[]; analysisCacheHit: boolean } | null> {
    try {
      const imageInputs = await Promise.all(assets.filter((asset) => asset.mimeType.startsWith("image/")).slice(0, 8).map(async (asset) => {
        const filename = asset.url.split("/").pop();
        const bytes = filename ? await this.uploads.getBuffer(filename) : null;
        return bytes ? {
          type: "input_image" as const,
          image_url: `data:${asset.mimeType};base64,${bytes.toString("base64")}`,
          detail: "high" as const,
        } : null;
      }));
      const usableImages = imageInputs.filter((input): input is NonNullable<typeof input> => Boolean(input));
      const category = dto.businessCategory?.trim() || products.map((product) => product.name).slice(0, 6).join(", ") || "productos de la marca";
      const personality = dto.personality?.trim() || "sin una personalidad prefijada; infiérela de las fotos y del catálogo";
      const creativeBrief = dto.creativeBrief?.trim() || "Sin instrucciones adicionales. Sorprende con una dirección propia del rubro y del material visual disponible.";
      const productAssetIndices = (product: StoreProductContext) => product.imageUrls.flatMap((url) => {
        const assetIndex = assets.findIndex((asset) => asset.url === url);
        return assetIndex >= 0 ? [assetIndex] : [];
      });
      const catalog = products.map((product, index) => [
        `${index}. ${product.name}`,
        product.description ? `Descripción: ${product.description}` : "Descripción: no configurada",
        product.tags.length ? `Etiquetas: ${product.tags.join(", ")}` : "Etiquetas: ninguna",
        `Fotos: ${productAssetIndices(product).join(", ") || "ninguna"}`,
      ].join(" · ")).join("\n") || "Catálogo todavía vacío";
      const socialLinks = links.map((link) => `${link.label}: ${link.url}`).join("\n") || "Sin enlaces sociales configurados";
      const assetLegend = assets.map((asset, index) => {
        const productOwners = products.flatMap((product, productIndex) => product.imageUrls.includes(asset.url) ? [`producto ${productIndex} (${product.name})`] : []);
        const role = asset.url === store.logoUrl
          ? "LOGO / IDENTIDAD (solo marca o navegación; nunca usar como foto de fondo)"
          : productOwners.length
            ? `FOTO DE ${productOwners.join(" y ")}`
            : asset.url === store.bannerUrl
              ? "ARTE PRINCIPAL / BANNER"
              : asset.url === store.aboutImageUrl
                ? "IMAGEN DE HISTORIA DE MARCA"
                : "ARTE O REFERENCIA VISUAL SUBIDA POR EL COMERCIO";
        return `${index}: ${role} · ${asset.mimeType}`;
      }).join("\n") || "Sin medios disponibles";
      const creativeRun = `${engineContext.brandFingerprint}-${engineContext.generation}-${engineContext.seed.toString(36)}`;
      const topologyAssignments = [0, 1, 2].map((index) => storefrontTopologyPlan(engineContext, index).id);
      const conversion = dto.checkoutMode === "whatsapp"
        ? "pedido por WhatsApp, sin pago integrado"
        : dto.checkoutMode === "external"
          ? "captación de interesados hacia un enlace externo, sin pago integrado"
          : "pago integrado con pagosYa";
      const requestStructuredOutput = async (
        name: string,
        schema: object,
        requestPrompt: string,
        maxOutputTokens: number,
      ) => {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol",
            input: [{ role: "user", content: [{ type: "input_text", text: requestPrompt }, ...usableImages] }],
            text: { format: { type: "json_schema", name, strict: true, schema } },
            reasoning: { effort: "high" },
            max_output_tokens: maxOutputTokens,
          }),
          signal: AbortSignal.timeout(120_000),
        });
        const body = await response.json() as {
          output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
          error?: { message?: string };
        };
        if (!response.ok) throw new BadGatewayException(body.error?.message || "OpenAI design generation failed");
        const outputText = body.output
          ?.flatMap((item) => item.content ?? [])
          .find((item) => item.type === "output_text")?.text;
        if (!outputText) throw new BadGatewayException("OpenAI design generation returned no structured output");
        return outputText;
      };

      const analysisPrompt = [
        "Eres la fase de estrategia de un estudio digital senior. No diseñes el sitio todavía. Haz una lectura profunda y concreta de la marca, sus activos y su catálogo para que otro director pueda construir una web completa sin adivinar.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad solicitada: ${personality}.`,
        `Brief creativo:\n${creativeBrief}`,
        `Conversión real: ${conversion}.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales:\n${socialLinks}`,
        `Índices y restricciones de activos:\n${assetLegend}`,
        "Examina visualmente cada imagen. Distingue con seguridad logo, arte editorial, imagen de ambiente, detalle y foto de producto. Mantén cada foto de producto unida al producto que indica la leyenda. Si un activo es débil, redundante o imposible de usar sin deformarlo, márcalo como avoid.",
        "Define el papel del logo, la escena real del público y una estrategia de color derivada de la identidad con 3 a 5 colores coordinados: base, acento, apoyo y superficies. Indica dónde usar fondos cromáticos y palabras de color sin perder contraste. Añade una estrategia tipográfica con carácter, una lógica de composición asimétrica, un plan de merchandising producto por producto y una sola idea de movimiento con propósito.",
        "La única regla fija de orden es abrir con una sección visual animada y colocar el catálogo inmediatamente después. La apertura puede ser hero, historia o galería según la evidencia de marca; todo lo posterior debe variar libremente y cambiar el ritmo. Hero, story y catalog deben existir. Si no hay historia empresarial verificable, los capítulos deben contar la colección usando nombres, descripciones y fotos reales, sin inventar origen ni proceso. No incluyas una sección genérica que explique que el sitio permite explorar, elegir o contactar.",
        "Decide también la arquitectura de páginas en pagePlan. Inicio es implícita y siempre contiene hero y catalog. Devuelve [] cuando el contenido no justifica destinos distintos. Crea como máximo tres páginas solo si cada una tiene una función y contenido verificable: por ejemplo Historia para story/gallery, Contacto para contact/links o Visítanos para location. No crees páginas para acortar artificialmente el scroll, no repitas una sección en dos páginas y nunca declares una página vacía. Usa ids y slugs únicos, breves y seguros; labels y slugs deben ser naturales en español.",
        "No inventes datos, origen, materiales, descuentos, testimonios ni promesas. Escribe el análisis en español y devuelve solo el esquema.",
      ].join("\n");
      let brandAnalysis = brandAnalysisCache.get(engineContext.brandFingerprint);
      const analysisCacheHit = Boolean(brandAnalysis);
      if (!brandAnalysis) {
        const analysisText = await requestStructuredOutput("store_brand_analysis", BRAND_ANALYSIS_SCHEMA, analysisPrompt, 5_000);
        brandAnalysis = (JSON.parse(analysisText) as { analysis?: BrandAnalysis }).analysis;
        if (brandAnalysis) brandAnalysisCache.set(engineContext.brandFingerprint, brandAnalysis);
      }
      if (!brandAnalysis) throw new BadGatewayException("OpenAI brand analysis returned no usable plan");

      const prompt = [
        "Actúa como el director de diseño y desarrollo de un estudio digital senior. El estándar es una web de agencia de alta gama que se siente construida para una marca real, nunca una plantilla embellecida. Recibes un análisis de marca ya realizado. Úsalo como evidencia y devuelve exactamente tres documentos de sitio completos, personalizados y estructuralmente distintos. No son variaciones de una plantilla ni configuraciones del editor existente. Usa solamente los medios indicados y no solicites imágenes nuevas.",
        `Clave creativa de esta generación: ${creativeRun}. Úsala para evitar repetir decisiones de generaciones anteriores sin mencionarla en el resultado.`,
        `Direcciones de arte asignadas, en orden: ${proposalArtDirections(dto.artDirection, engineContext.generation).join(", ")}. Cada siteDocument.artDirection debe copiar exactamente la dirección correspondiente. Si el comercio eligió una, ocupa la primera propuesta; las otras dos deben contrastarla.`,
        `Topologías de página asignadas, en orden: ${topologyAssignments.join(", ")}. Diseña el contenido para esas siluetas. La plataforma materializará la topología final de forma determinista: una apertura animada primero y el catálogo segundo; no fuerces hero como única apertura.`,
        "designGenome es el contrato visual vinculante, no metadata decorativa. Debe obedecer la dirección de arte asignada y hacer que todas las decisiones de secciones, tipografía, medios, color y movimiento pertenezcan al mismo mundo. Las tres combinaciones deben diferir claramente.",
        "family es la familia estructural de cada sección y debe ser exactamente editorial, cinematic, product-led o minimal. No es un sinónimo de layout: decide qué lidera la sección y cómo se leen los mismos blocks. Editorial prioriza copy y ritmo asimétrico; cinematic prioriza medios y escala; product-led pone catálogo, producto o acción antes que decoración; minimal reduce la composición a lo esencial. Usa al menos tres familias distintas dentro de cada página y cambia de familia entre propuestas para una misma sección importante.",
        "blocks es la composición interna canónica de cada sección y los campos planos title, body, ctaLabel, mediaIndices e items siguen como proyección compatible. Usa group solo en el nivel superior y hojas heading, text, action, media o commerce dentro; children no puede contener otro group. Cada id debe ser único dentro de la sección. Usa únicamente las ranuras registradas para ese kind. Catalog, contact, location, links y event-tickets conservan un bloque commerce en su ranura funcional: ese bloque posiciona UI confiable de pagosYa y nunca contiene HTML.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Brief creativo del comercio:\n${creativeBrief}`,
        `Conversión elegida por el comercio: ${conversion}. Respeta esta decisión en el tono de los llamados a la acción.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (la plataforma los inyecta de forma segura):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        `Análisis de marca obligatorio, realizado en la fase anterior:\n${JSON.stringify(brandAnalysis, null, 2)}`,
        "Contrato multipágina obligatorio: siteDocument.pages materializa el pagePlan del análisis y cada sección declara pageId. El string vacío significa Inicio. hero y catalog siempre usan pageId=\"\". Un pageId no vacío debe coincidir exactamente con un id de pages, y cada página declarada debe recibir al menos una sección real. Si pagePlan está vacío, devuelve pages=[] y pageId=\"\" en todas las secciones. No inventes una página sin contenido para que el menú parezca más grande. La plataforma deriva de forma segura los enlaces Inicio, Tienda y páginas; no intentes escribir items de navegación.",
        "Distribuye solo secciones compatibles: story y gallery pueden vivir en Historia; contact y links pueden vivir en Contacto; location puede vivir en Visítanos. Mantén una narrativa coherente dentro de cada destino y conserva Inicio como portada comercial completa. Las tres propuestas pueden tomar decisiones de páginas distintas cuando la evidencia lo permita, pero cada decisión debe seguir el pagePlan y el brief del comercio.",
        "Contrato narrativo obligatorio de cada siteDocument: deben existir exactamente un hero, un story, un catalog y un contact. La primera sección debe ser una apertura animada entre hero, historia o galería según la topología asignada; catalog debe ser exactamente la segunda sección. Después de ese par, el orden es libre. Hero conserva 2 o 3 medios cuando estén disponibles, nunca el logo, e items con copy breve asociado a cada escena; con un solo medio úsalo una sola vez y no lo dupliques. Story usa motion=story-scroll y solo 2 o 3 escenas intencionales, cada una emparejada mediante items con su propia imagen y copy verificable. Catalog es la zona transaccional donde la plataforma inserta productos, carrito y checkout reales. No existe benefits: no generes una sección genérica de razones, pasos, Explora/Elige/Conecta ni una explicación de lo que hace una tienda.",
        "Antes de componer, elige para cada propuesta una combinación distinta y pertinente entre atmósferas de lujo editorial, estructuralismo suave o tecnología sobria, y layouts de split editorial, bento asimétrico o cascada espacial sin solapamientos. Da a cada propuesta un concepto rector visible de principio a fin: una idea de marca que conecte paleta, escala, ritmo, recortes de imagen, navegación, catálogo, formulario y cierre. Haz que cambien de verdad en jerarquía, densidad, orden, tipografía, geometría, composición de producto y relación entre imagen y texto.",
        "Contrato de diferenciación verificable: las tres propuestas deben usar tres hero.layout distintos, las tres navigation.layout disponibles exactamente una vez cada una y tres theme.productLayout distintos. No basta cambiar color o copy. Cada dirección debe seguir siendo reconocible en escala de grises por su silueta, proporciones, orden y composición del catálogo.",
        "Distingue logo, arte editorial y foto de producto por su función. El logo pertenece a la identidad o navegación: no lo estires, no lo recortes como fotografía y no lo uses como fondo. Sitúa cada foto de producto con su producto correcto y usa merchandising para decidir qué productos abren la colección, cuáles se destacan y en qué orden se cuentan.",
        "Aplica este protocolo anti-genérico obligatorio: densidad visual cercana a 4/10, varianza 8/10 y movimiento 6/10; una paleta coherente de 3 a 5 colores con un acento principal de saturación menor a 80%, uno o dos tonos de apoyo y un solo sistema de radios. Al menos dos secciones posteriores a la portada deben usar fondos cromáticos distintos y algunas palabras o frases breves pueden usar color cuando el contraste siga siendo AA. El color debe responder a la marca, no repartirse al azar. Nunca uses #000000, morado o azul neón, glow exterior, degradado de texto ni mezcla de grises cálidos y fríos. La portada debe caber en el primer viewport, ser asimétrica, estar alineada a la izquierda o dividida y tener como máximo un CTA. No uses hero centrado. La navegación debe tener sticky=false para evitar una barra pegada de borde a borde. Mantén cada elemento en una zona espacial limpia, sin texto superpuesto sobre otro contenido.",
        "La tipografía debe sentirse elegida: usa roles grotesk, humanist o geometric para una voz tipo Geist, Satoshi o Cabinet Grotesk; editorial solo cuando el rubro justifique una serif moderna tipo Instrument Serif o Editorial New. No uses una estética equivalente a Inter, Roboto, Arial, Helvetica, Times, Georgia, Garamond o Palatino. Controla el tamaño con jerarquía y peso; cuerpo mínimo 16px, interlineado relajado y líneas de máximo 65 caracteres.",
        "En páginas largas usa al menos cuatro familias de composición. Prohíbe tres tarjetas iguales, la repetición constante de texto a la izquierda e imagen a la derecha, etiquetas decorativas, números de sección, scroll cues, tiras de hora o clima e interfaz falsa hecha con rectángulos. No apiles muchas fotografías una debajo de otra ni conviertas el descenso de la página en un collage sin relato: una imagen solo entra si cumple una función clara dentro de la portada, un capítulo Story Scroll, un producto o una galería posterior acotada. Usa tarjetas solo cuando la elevación comunique jerarquía; cuando existan, deben sentirse como una pieza dentro de un marco concéntrico y no como un rectángulo con borde gris. No uses guiones largos Unicode. Cada sección debe tener una función real y una composición propia dentro del mismo mundo.",
        "Usa este sistema de calidad Impeccable como constitución, no como estilo visual: jerarquía inequívoca, contraste AA, texto corporal legible, controles táctiles de 44px, foco de teclado visible, composición responsive sin scroll horizontal, estados estables y copy que nombra una acción real. El catálogo, carrito y formulario deben sentirse parte del mismo mundo visual. Alterna escala y densidad y crea uno o dos momentos memorables, no una colección de efectos.",
        "Usa motion como dirección artística coordinada, no decoración. Cada propuesta debe combinar cuatro momentos distintos: la portada hero-carousel, la historia story-scroll, exactamente una sección gallery con un motion propio entre reveal, clip, drift, scale o parallax, y una experience distintiva después del catálogo. Las tres propuestas deben elegir motions de gallery diferentes. El resto de las secciones debe usar none para mantener catálogo, contacto, ubicación y enlaces legibles y estables. Cada tipo distinto de none puede aparecer como máximo una vez en la misma página. Están prohibidos el layout rail en gallery, las filas de imágenes angostas que dejan ver solo tiras verticales, coverflow, carruseles en profundidad, abanicos de láminas y galerías marquee o diagonales. Todo movimiento debe poder realizarse con transform y opacity, usar easing personalizado, respetar reduced motion y mantener catálogo y formulario estables.",
        "Elige además una sola experience distintiva para después del catálogo y no repitas su tipo entre las tres propuestas. Reparte la variedad entre scroll-expansion, full-screen-chapters y frame-sequence cuando haya al menos dos medios; con menos medios usa tipos distintos entre layered-text, text-rotate, text-glitch, text-reveal-block y text-along-path. Las experiencias tipográficas llevan mediaIndices vacío y copy real, breve y verificable. No uses 3d-gallery, coverflow-carousel, zoom-parallax, video-pill, portfolio-scroller, image-stream, hero-gallery-scroll ni ninguna galería continua, diagonal o de láminas asomadas. Usa exactamente 2 medios en scroll-expansion y entre 2 y 5 en full-screen-chapters o frame-sequence. Su placement siempre es after-catalog.",
        "Usa full-bleed, offset, split, centered, grid, stacked, rail y minimal como herramientas libres, no como una receta. Evita una secuencia repetida de tarjetas genéricas y evita el patrón constante texto a la izquierda e imagen a la derecha.",
        "Respeta las capacidades del renderer: hero admite split, full-bleed, centered u offset; story admite split, offset, stacked, rail o centered; catalog admite grid, stacked, offset, rail o minimal; gallery admite grid, split, offset, stacked, full-bleed o rail; contact admite split, stacked, centered o minimal; location admite split, stacked, full-bleed u offset; links admite centered, stacked, minimal o rail. Mantén story-scroll solamente en story y usa motion compatible con la función real de cada sección.",
        "Ranuras válidas por sección: hero = eyebrow, heading, body, actions, primary-media, secondary-media; story = heading, body, chapters, media-rail; catalog = heading, intro, filters, products, footer-action; gallery = heading, body, media-grid, caption; contact = heading, body, details, actions; location = heading, address, hours, map, media; links = heading, body, links. Todos los children heredan una ranura válida de su sección.",
        "Los CTA deben ser breves, específicos al rubro y conducir al catálogo o contacto. Evita emojis, nombres genéricos, porcentajes redondos falsos y clichés como Elevate, Seamless, Unleash, Next-Gen, Eleva, Revoluciona o Sin límites. Nunca inventes descuentos, envíos, certificaciones, origen, materiales, testimonios ni promesas verificables.",
        "mediaIndices y assetIndex solo pueden referenciar los índices disponibles. Usa assetIndex=-1 cuando un item no necesite medio. No incluyas URLs externas.",
        "Escribe copy borrador atractivo en español. No devuelvas HTML, CSS, JavaScript ni texto fuera del esquema estructurado.",
      ].join("\n");

      const outputText = await requestStructuredOutput("store_visual_directions", AI_DIRECTIONS_SCHEMA, prompt, 14_000);
      const parsed = JSON.parse(outputText) as { directions?: unknown };
      const directions = this.validDirections(parsed.directions, store, assets, products);
      if (!directions) throw new BadGatewayException("OpenAI design generation returned an unsafe theme configuration");

      return {
        analysisCacheHit,
        presets: directions.map((direction) => ({
          title: direction.title,
          rationale: direction.rationale,
          config: legacyConfigFromSiteDocument(direction.siteDocument),
        })),
      };
    } catch (error) {
      this.logger.warn(`AI theme generation fell back to curated directions: ${(error as Error).message}`);
      return null;
    }
  }

  private validDirections(value: unknown, store: Store, assets: MediaAsset[], products: StoreProductContext[]): MaterializedAiDirection[] | null {
    if (!Array.isArray(value) || value.length !== 3) return null;
    if (!value.every((direction) => direction && typeof direction === "object" && !Array.isArray(direction))) return null;
    const directions = value as Array<Record<string, unknown>>;
    const titles = new Set(directions.map((direction) => direction.title));
    if (titles.size !== 3) return null;
    const materialized = directions.flatMap((direction, directionIndex) => {
      if (typeof direction.title !== "string" || direction.title.length < 3 || direction.title.length > 48) return [];
      if (typeof direction.rationale !== "string" || direction.rationale.length < 20 || direction.rationale.length > 240) return [];
      const materializedSiteDocument = materializeSiteDocument(direction.siteDocument, assets, products);
      const siteDocument = materializedSiteDocument
        ? enforceGeneratedNarrative(materializedSiteDocument, store, assets, products, directionIndex)
        : null;
      return siteDocument && passesPremiumDirectionGuardrails(siteDocument)
        ? [{ title: generatedCopy(direction.title), rationale: generatedCopy(direction.rationale), siteDocument }]
        : [];
    });
    if (materialized.length !== 3) return null;
    return storefrontDirectionsAreDiverse(materialized.map((direction) => direction.siteDocument)) ? materialized : null;
  }
}
