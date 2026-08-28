import { BadGatewayException, BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaAsset, Prisma, Store } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { UploadsService } from "../uploads/uploads.service";
import { STORE_FONT_STYLES, type StoreFontStyle } from "./dto/create-store.dto";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { AI_SITE_DOCUMENT_SCHEMA, materializeSiteDocument, siteDocumentJson, type AiSiteDocument, type StoreSiteDocument } from "./site-document";

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
  riskChecks: string[];
};

const CONTENT_SECTIONS = ["hero", "products", "about", "gallery", "motion", "links"] as const;
const MOTION_EXPERIENCES = [
  "story-scroll", "coverflow-carousel", "hero-carousel", "image-stream",
  "scroll-expansion", "hero-gallery-scroll", "stagger-testimonials",
  "portfolio-scroller", "circle-reveal", "clarity-marquee",
  "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  "full-screen-chapters", "magnetic-target", "frame-sequence", "3d-gallery",
] as const;
const SAFE_GENERATED_BACKGROUNDS = ["#eef1f5", "#e8f2ef", "#eeebf5"] as const;

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
  return { min: ["hero-gallery-scroll", "3d-gallery"].includes(type) ? 3 : 2, max: 8 };
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
  const [hero, story, catalog] = document.sections;
  if (!hero || hero.layout === "centered" || hero.align === "center") return false;
  if (hero.kind !== "hero" || story?.kind !== "story" || catalog?.kind !== "catalog") return false;
  if (story.motion !== "story-scroll") return false;
  if (document.navigation.sticky) return false;
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
      ["coverflow-carousel", "circle-reveal"],
      ["image-stream", "magnetic-target"],
    ][index % 3];
  }
  return [
    ["hero-gallery-scroll", "frame-sequence", "text-along-path"],
    ["coverflow-carousel", "frame-sequence", "circle-reveal"],
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
      required: ["brandEssence", "audienceScene", "logoStrategy", "colorStrategy", "typographyStrategy", "compositionStrategy", "motionStrategy", "assetRoles", "merchandisingPlan", "sectionPlan", "riskChecks"],
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
        riskChecks: { type: "array", minItems: 3, maxItems: 12, items: { type: "string", minLength: 5, maxLength: 220 } },
      },
    },
  },
} as const;

function localSiteDocument(store: Store, preset: ProposalPreset, assets: MediaAsset[], products: StoreProductContext[], index: number): StoreSiteDocument {
  const config = preset.config as Record<string, unknown>;
  const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const copy = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
  const pageBackground = color(config.backgroundColor, ["#eef1f5", "#e8f2ef", "#eeebf5"][index % 3]);
  const accentColor = color(config.accentColor, ["#315c49", "#31527a", "#713f67"][index % 3]);
  const surfaceColor = ["#ffffff", "#f8fff9", "#fff9fe"][index % 3];
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
  const heroMediaUrls = rotatedMediaUrls.slice(0, Math.min(3, rotatedMediaUrls.length));
  const storyMediaUrls = rotatedMediaUrls.length > 1
    ? [...rotatedMediaUrls.slice(1), rotatedMediaUrls[0]].slice(0, Math.min(3, rotatedMediaUrls.length))
    : rotatedMediaUrls;
  const productForMedia = (url: string) => products.find((product) => product.imageUrls.includes(url));
  const narrativeItems = (
    urls: string[],
    fallbackTitle: string,
    fallbackBody: string,
  ): StoreSiteDocument["sections"][number]["items"] => urls.map((url, mediaIndex) => {
    const product = productForMedia(url);
    return {
      mediaUrl: url,
      title: product?.name || (mediaIndex === 0 ? fallbackTitle : ""),
      body: product?.description || (mediaIndex === 0 ? fallbackBody : ""),
    };
  });
  const document: StoreSiteDocument = {
    version: 1,
    direction: preset.title,
    theme: {
      pageBackground,
      textColor: "#171717",
      accentColor,
      secondaryColor: ["#d9d7d2", "#e2e0dc", "#d4d6d8"][index % 3],
      surfaceColor,
      mutedColor: "#626262",
      borderColor: "#c9c9c4",
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
    },
    motion: { intensity: index === 0 ? "expressive" : index === 1 ? "cinematic" : "expressive" },
    merchandising: {
      featuredProductIds: products.slice(index, index + 2).map((product) => product.id).filter(Boolean),
      productOrderIds: [...products.slice(index), ...products.slice(0, index)].map((product) => product.id).filter(Boolean),
      spotlightLayout: index === 0 ? "feature-first" : index === 1 ? "lookbook" : "alternating",
      showDescriptions: index !== 2,
    },
    experience: {
      type: index === 0 ? "text-reveal-block" : index === 1 ? "text-rotate" : "text-along-path",
      placement: "after-catalog",
      title: index === 0 ? copy(config.aboutTitle, `Conoce ${store.name}`) : index === 1 ? copy(config.catalogTitle, "La tienda") : store.name,
      body: index === 0
        ? copy(config.aboutSubtitle, "Una frase editorial que continúa la historia de la marca.")
        : copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
      mediaUrls: [],
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
        textColor: "#171717",
        mediaUrls: heroMediaUrls,
        items: narrativeItems(
          heroMediaUrls,
          copy(config.tagline, store.name),
          copy(config.catalogSubtitle, `Explora la selección actual de ${store.name}.`),
        ),
      },
      {
        id: "brand-story",
        kind: "story",
        layout: "stacked",
        width: "full",
        align: index === 1 ? "right" : "left",
        motion: "story-scroll",
        title: copy(config.aboutTitle, `Conoce ${store.name}`),
        body: copy(config.aboutText, `Descubre la intención y la selección detrás de ${store.name}.`),
        ctaLabel: "",
        backgroundColor: pageBackground,
        textColor: "#171717",
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
        textColor: "#171717",
        mediaUrls: [],
        items: [],
      },
      {
        id: "visual-world",
        kind: "gallery",
        layout: index === 0 ? "grid" : index === 1 ? "rail" : "offset",
        width: "full",
        align: "left",
        motion: index === 2 ? "coverflow" : "none",
        title: copy(config.galleryTitle, "La marca en imágenes"),
        body: copy(config.gallerySubtitle, "Una mirada más cercana a su universo visual."),
        ctaLabel: "",
        backgroundColor: accentColor,
        textColor: "#ffffff",
        mediaUrls: rotatedMediaUrls.slice(0, 4),
        items: [],
      },
      {
        id: "information",
        kind: "contact",
        layout: "split",
        width: "wide",
        align: "left",
        motion: "none",
        title: "¿Tienes una pregunta?",
        body: `Escríbele directamente al equipo de ${store.name}.`,
        ctaLabel: "Enviar pregunta",
        backgroundColor: surfaceColor,
        textColor: "#171717",
        mediaUrls: [],
        items: [],
      },
      {
        id: "follow",
        kind: "links",
        layout: "minimal",
        width: "wide",
        align: "center",
        motion: "none",
        title: "Sigue la marca",
        body: "",
        ctaLabel: "",
        backgroundColor: pageBackground,
        textColor: "#171717",
        mediaUrls: [],
        items: [],
      },
    ],
  };
  const sectionOrders = [
    ["hero", "story", "catalog", "gallery", "contact", "links"],
    ["hero", "story", "catalog", "contact", "gallery", "links"],
    ["hero", "story", "catalog", "gallery", "links", "contact"],
  ];
  const order = sectionOrders[index % sectionOrders.length];
  return { ...document, sections: [...document.sections].sort((first, second) => order.indexOf(first.kind) - order.indexOf(second.kind)) };
}

function enforceGeneratedNarrative(
  document: StoreSiteDocument,
  store: Store,
  assets: MediaAsset[],
  products: StoreProductContext[],
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
      title: authored?.title || product?.name || (index === 0 ? section.title : ""),
      body: authored?.body || product?.description || (index === 0 ? section.body : ""),
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
  const supportingSections = document.sections.filter((section) => !["hero", "story", "catalog"].includes(section.kind));
  const experienceMediaUrls = uniqueMedia(document.experience.mediaUrls, 2, 5);
  const avoidsUnstructuredImagePile = document.experience.type === "hero-gallery-scroll"
    ? "scroll-expansion"
    : document.experience.type === "image-stream"
      ? "coverflow-carousel"
      : document.experience.type;

  return {
    ...document,
    experience: {
      ...document.experience,
      type: experienceMediaUrls.length >= 2 ? avoidsUnstructuredImagePile : "none",
      placement: "after-catalog",
      mediaUrls: experienceMediaUrls.length >= 2 ? experienceMediaUrls : [],
    },
    sections: [normalizedHero, normalizedStory, catalog, ...supportingSections],
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
  const fontStyle: StoreFontStyle = document.theme.headingFont === "editorial" || document.theme.headingFont === "classic"
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

function snapshot(store: Store): Prisma.InputJsonObject {
  return Object.fromEntries(VISUAL_FIELDS.map((field) => [field, store[field] ?? null])) as Prisma.InputJsonObject;
}

function normalizeStoreFontStyle(value: unknown): StoreFontStyle {
  return STORE_FONT_STYLES.includes(value as StoreFontStyle) ? value as StoreFontStyle : "modern";
}

function toStoreUpdate(config: unknown): Prisma.StoreUpdateInput {
  const value = config && typeof config === "object" && !Array.isArray(config) ? config as Record<string, unknown> : {};
  const allowed = Object.fromEntries(VISUAL_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]));
  if ("fontStyle" in allowed) allowed.fontStyle = normalizeStoreFontStyle(allowed.fontStyle);
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
    await this.ownedStore(merchantId, storeId);
    const [proposals, versions] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
    ]);
    return { proposals, versions };
  }

  async generate(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    const store = await this.ownedStore(merchantId, storeId);
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
    const [products, links] = await Promise.all([
      this.prisma.paymentLink.findMany({
        where: { storeId, status: "ACTIVE" },
        select: { id: true, name: true, description: true, imageUrls: true, tags: true },
        orderBy: { createdAt: "asc" },
        take: 24,
      }),
      this.prisma.storeLink.findMany({ where: { storeId }, select: { label: true, url: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    const uploadedAssetUrls = dto.assetUrls ?? [];
    const jsonImageUrls = (value: Prisma.JsonValue) => Array.isArray(value)
      ? value.flatMap((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string" ? [entry.imageUrl] : [])
      : [];
    const assetUrls = [...new Set([
      store.logoUrl,
      ...uploadedAssetUrls,
      store.bannerUrl,
      store.aboutImageUrl,
      store.promotionImageUrl,
      ...jsonImageUrls(store.heroSlides),
      ...jsonImageUrls(store.editorialGallery),
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
    let presets = this.presets(store, proposalInput, orderedAssets, products, links);
    let provider = "local-curated";

    if (this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")) {
      const aiPresets = await this.generateDirections(store, proposalInput, orderedAssets, products, links);
      if (aiPresets) {
        presets = aiPresets;
        provider = `openai:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`;
      }
    }

    presets = presets.map((preset, index) => {
      const existingDocument = preset.config.siteDocument as StoreSiteDocument | undefined;
      const siteDocument = existingDocument ?? localSiteDocument(store, preset, orderedAssets, products, index);
      const preservedAnimations = Array.isArray(store.animations) ? store.animations : [];
      const preservedMotionExperiences = Array.isArray(store.motionExperiences)
        ? store.motionExperiences.filter((experience): experience is string => typeof experience === "string" && MOTION_EXPERIENCES.includes(experience as (typeof MOTION_EXPERIENCES)[number]))
        : [];
      return {
        ...preset,
        config: {
          ...preset.config,
          ...legacyConfigFromSiteDocument(siteDocument),
          motionDuoEnabled: preservedAnimations.length > 0 || store.motionDuoEnabled === true,
          motionExperience: typeof store.motionExperience === "string" && MOTION_EXPERIENCES.includes(store.motionExperience as (typeof MOTION_EXPERIENCES)[number]) ? store.motionExperience : "coverflow-carousel",
          motionExperiences: preservedMotionExperiences,
          animations: preservedAnimations,
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

    const proposals = await this.prisma.$transaction(
      presets.map((preset) => {
        return this.prisma.storeVisualProposal.create({
          data: {
            storeId,
            title: preset.title,
            rationale: preset.rationale,
            provider,
            config: preset.config as Prisma.InputJsonObject,
            sourceAssetUrls: assetUrls,
            generatedUrls: [],
          },
        });
      }),
    );
    return { proposals, mode: provider.startsWith("openai:") ? "ai" : "local", originalsPreserved: true };
  }

  async apply(merchantId: string, storeId: string, proposalId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    const [updated] = await this.prisma.$transaction([
      this.prisma.store.update({ where: { id: storeId }, data: toStoreUpdate(proposal.config) }),
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
        config: { tagline: `${subject}, presentados con calidez y detalle.`, aboutTitle: `La historia de ${store.name}`, aboutSubtitle: "Una marca se conoce mejor cuando entendemos lo que inspira cada elección.", aboutText: `Esta es una propuesta de texto para presentar ${store.name}. Revisa y adapta la historia antes de publicar para que refleje fielmente tu negocio.`, catalogTitle: "Descubre la tienda", catalogSubtitle: `Explora la selección actual de ${store.name} y encuentra lo que mejor encaja contigo.`, galleryTitle: "La marca en imágenes", gallerySubtitle: "Una mirada más cercana a su universo visual.", backgroundColor: "#f4ead7", backgroundImageUrl: null, accentColor: "#7a351f", fontStyle: "friendly", buttonStyle: "rounded", boardTexture: "kraft", announcement: `Descubre la selección de ${store.name} • Compra fácil y segura`, announcementMode: "marquee", announcementSpeed: 20, announcementSize: "medium", announcementColor: "#d8a25e", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "lift", cartButtonLabel: "Quiero comprar", layoutStyle: "cinematic", experienceStyle: "story-scroller", contentOrder: ["hero", "about", "products", "gallery", "motion", "links"], heroSlides: hero(0, `Hecho para disfrutar ${subject}`, "Explora una selección preparada para mostrar cada producto con claridad."), editorialGallery: gallery },
      },
      {
        title: "Editorial sereno",
        rationale: `Una composición con aire, lectura pausada y protagonismo absoluto del catálogo existente. ${socialNote}`,
        config: { tagline: `Una mirada serena a ${subject}.`, aboutTitle: `Detrás de ${store.name}`, aboutSubtitle: "Una introducción pausada a la intención que guía la marca.", aboutText: `Borrador editorial para contar el origen y la intención de ${store.name}. Sustituye este texto con detalles reales de tu proceso, materiales y comunidad antes de publicarlo.`, catalogTitle: "La selección", catalogSubtitle: "Una colección clara, pensada para explorar sin prisa.", galleryTitle: "Notas visuales", gallerySubtitle: "Detalles, atmósferas y perspectivas de la marca.", backgroundColor: "#f7f5f0", backgroundImageUrl: null, accentColor: "#274c43", fontStyle: "editorial", buttonStyle: "square", boardTexture: "painted", announcement: `${store.name} • Colección actual • Explora el catálogo`, announcementMode: "static", announcementSpeed: 24, announcementSize: "small", announcementColor: "#274c43", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "outline", buttonMotion: "none", cartButtonLabel: "Completar pedido", layoutStyle: "editorial", experienceStyle: "coverflow", contentOrder: ["motion", "hero", "gallery", "about", "products", "links"], heroSlides: hero(1, `La selección de ${store.name}`, "Tus imágenes actuales, ordenadas como una portada editorial."), editorialGallery: gallery.slice().reverse() },
      },
      {
        title: "Mercado vibrante",
        rationale: `Una dirección rápida y expresiva, con cinta en movimiento, llamados claros y tus productos al frente. ${socialNote}`,
        config: { tagline: `${subject} con energía propia.`, aboutTitle: `${store.name}, de cerca`, aboutSubtitle: "Personalidad, intención y una forma propia de presentar cada elección.", aboutText: `Texto de muestra para presentar la personalidad de ${store.name}. Revísalo antes de aplicar y agrega únicamente información real sobre tu marca.`, catalogTitle: "Entra a la tienda", catalogSubtitle: `Mira, elige y explora todo lo que ${store.name} tiene para mostrar.`, galleryTitle: "Más para descubrir", gallerySubtitle: "La energía de la marca continúa en cada imagen.", backgroundColor: "#e8f2ef", backgroundImageUrl: null, accentColor: "#7f1d1d", fontStyle: "modern", buttonStyle: "pill", boardTexture: "painted", announcement: `Novedades en ${store.name} • Mira • Elige • Compra`, announcementMode: "marquee", announcementSpeed: 14, announcementSize: "large", announcementColor: "#7f1d1d", promotionEnabled: false, promotionTitle: "", promotionBody: "", promotionCtaLabel: "", promotionCtaUrl: null, buttonVariant: "solid", buttonMotion: "pulse", cartButtonLabel: "Agregar y pagar", layoutStyle: "catalog-first", experienceStyle: "diagonal-marquee", contentOrder: ["products", "hero", "motion", "gallery", "about", "links"], heroSlides: hero(2, `Encuentra tu próximo favorito`, `Explora ${subject} y elige directamente desde el catálogo.`), editorialGallery: gallery },
      },
    ];
    const contentOrders = [
      ["hero", "about", "products", "gallery", "motion", "links"],
      ["motion", "about", "hero", "products", "links", "gallery"],
      ["products", "hero", "motion", "about", "links", "gallery"],
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

  private async generateDirections(store: Store, dto: GenerateVisualProposalsDto, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[]): Promise<ProposalPreset[] | null> {
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
      const creativeRun = `${store.id.slice(-6)}-${Date.now().toString(36).slice(-6)}`;
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
        "Define el papel del logo, la escena real del público, una estrategia de color derivada de la identidad con un solo acento de saturación menor a 80%, una estrategia tipográfica con carácter, una lógica de composición asimétrica, un plan de merchandising producto por producto y una sola idea de movimiento con propósito.",
        "El plan debe seguir una narrativa reconocible inspirada en la tienda Bikano: primero una portada deslizante, después una historia por escenas al hacer scroll y luego el catálogo real. Galería, contacto, ubicación y enlaces son secciones posteriores y solo aparecen cuando aportan algo. Si no hay historia empresarial verificable, los capítulos deben contar la colección usando nombres, descripciones y fotos reales, sin inventar origen ni proceso. No incluyas una sección genérica que explique que el sitio permite explorar, elegir o contactar.",
        "No inventes datos, origen, materiales, descuentos, testimonios ni promesas. Escribe el análisis en español y devuelve solo el esquema.",
      ].join("\n");
      const analysisText = await requestStructuredOutput("store_brand_analysis", BRAND_ANALYSIS_SCHEMA, analysisPrompt, 5_000);
      const brandAnalysis = (JSON.parse(analysisText) as { analysis?: BrandAnalysis }).analysis;
      if (!brandAnalysis) throw new BadGatewayException("OpenAI brand analysis returned no usable plan");

      const prompt = [
        "Actúa como el director de diseño y desarrollo de un estudio digital senior. El estándar es una web de agencia de alta gama que se siente construida para una marca real, nunca una plantilla embellecida. Recibes un análisis de marca ya realizado. Úsalo como evidencia y devuelve exactamente tres documentos de sitio completos, personalizados y estructuralmente distintos. No son variaciones de una plantilla ni configuraciones del editor existente. Usa solamente los medios indicados y no solicites imágenes nuevas.",
        `Clave creativa de esta generación: ${creativeRun}. Úsala para evitar repetir decisiones de generaciones anteriores sin mencionarla en el resultado.`,
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Brief creativo del comercio:\n${creativeBrief}`,
        `Conversión elegida por el comercio: ${conversion}. Respeta esta decisión en el tono de los llamados a la acción.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (la plataforma los inyecta de forma segura):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        `Análisis de marca obligatorio, realizado en la fase anterior:\n${JSON.stringify(brandAnalysis, null, 2)}`,
        "Contrato narrativo obligatorio de cada siteDocument: las tres primeras secciones son exactamente hero, story y catalog, en ese orden. También debe existir exactamente una contact después del catálogo. Hero es la portada deslizante: asígnale 2 o 3 medios cuando estén disponibles, nunca el logo, y crea items con copy breve asociado a cada escena; con un solo medio úsalo una sola vez y no lo dupliques. Story es la experiencia Story Scroll existente: usa motion=story-scroll, layout=stacked, width=full y solo 2 o 3 escenas intencionales, cada una emparejada mediante items con su propia imagen y copy verificable. Catalog es la primera zona estable y transaccional: la plataforma inserta ahí productos, carrito y checkout reales. Gallery, contact, location y links van después. No existe benefits: no generes una sección genérica de razones, pasos, Explora/Elige/Conecta ni una explicación de lo que hace una tienda.",
        "Antes de componer, elige para cada propuesta una combinación distinta y pertinente entre atmósferas de lujo editorial, estructuralismo suave o tecnología sobria, y layouts de split editorial, bento asimétrico o cascada espacial sin solapamientos. Da a cada propuesta un concepto rector visible de principio a fin: una idea de marca que conecte paleta, escala, ritmo, recortes de imagen, navegación, catálogo, formulario y cierre. Haz que cambien de verdad en jerarquía, densidad, orden, tipografía, geometría, composición de producto y relación entre imagen y texto.",
        "Distingue logo, arte editorial y foto de producto por su función. El logo pertenece a la identidad o navegación: no lo estires, no lo recortes como fotografía y no lo uses como fondo. Sitúa cada foto de producto con su producto correcto y usa merchandising para decidir qué productos abren la colección, cuáles se destacan y en qué orden se cuentan.",
        "Aplica este protocolo anti-genérico obligatorio: densidad visual cercana a 4/10, varianza 8/10 y movimiento 6/10; una sola familia cromática, un solo acento con saturación menor a 80% y un solo sistema de radios; nunca #000000, morado o azul neón, glow exterior, degradado de texto ni mezcla de grises cálidos y fríos. La portada debe caber en el primer viewport, ser asimétrica, estar alineada a la izquierda o dividida y tener como máximo un CTA. No uses hero centrado. La navegación debe tener sticky=false para evitar una barra pegada de borde a borde. Mantén cada elemento en una zona espacial limpia, sin texto superpuesto sobre otro contenido.",
        "La tipografía debe sentirse elegida: usa roles grotesk, humanist o geometric para una voz tipo Geist, Satoshi o Cabinet Grotesk; editorial solo cuando el rubro justifique una serif moderna tipo Instrument Serif o Editorial New. No uses una estética equivalente a Inter, Roboto, Arial, Helvetica, Times, Georgia, Garamond o Palatino. Controla el tamaño con jerarquía y peso; cuerpo mínimo 16px, interlineado relajado y líneas de máximo 65 caracteres.",
        "En páginas largas usa al menos cuatro familias de composición. Prohíbe tres tarjetas iguales, la repetición constante de texto a la izquierda e imagen a la derecha, etiquetas decorativas, números de sección, scroll cues, tiras de hora o clima e interfaz falsa hecha con rectángulos. No apiles muchas fotografías una debajo de otra ni conviertas el descenso de la página en un collage sin relato: una imagen solo entra si cumple una función clara dentro de la portada, un capítulo Story Scroll, un producto o una galería posterior acotada. Usa tarjetas solo cuando la elevación comunique jerarquía; cuando existan, deben sentirse como una pieza dentro de un marco concéntrico y no como un rectángulo con borde gris. No uses guiones largos Unicode. Cada sección debe tener una función real y una composición propia dentro del mismo mundo.",
        "Compón páginas con ritmo real y espacio generoso: alterna escala y densidad, crea uno o dos momentos visuales memorables y evita que todas las secciones tengan la misma grilla. El catálogo, el carrito y el formulario deben sentirse parte del mismo mundo visual, no widgets pegados al final. El formulario debe tener etiquetas visibles, campos y placeholder con contraste AA, foco claro y un CTA que no se parta en dos líneas. Los controles táctiles deben medir al menos 44px y las secciones de varias columnas deben colapsar a una sola columna sin scroll horizontal debajo de 768px.",
        "Usa motion como dirección artística coordinada, no decoración. La portada deslizante y Story Scroll forman el dúo principal; fuera de ellas elige como máximo uno o dos momentos entre reveal, clip, drift, scale, parallax y coverflow. El resto debe ser none. Reserva parallax/story-scroll para narrativa y coverflow para exploración horizontal. No generes cintas visuales continuas, galerías marquee ni el mismo reveal en cada sección. Todo movimiento debe poder realizarse con transform y opacity, usar easing personalizado, respetar reduced motion y mantener catálogo y formulario legibles y estables.",
        "Elige además una sola experience distintiva para después del catálogo. Puedes usar layered-text, text-rotate, text-glitch, text-reveal-block o text-along-path cuando una frase breve de la marca sea más coherente que repetir fotografías; estas experiencias tipográficas llevan mediaIndices vacío y deben usar el título y body como copy real, breve y verificable. También puedes elegir scroll-expansion, full-screen-chapters, frame-sequence, 3d-gallery o coverflow-carousel cuando los medios añadan relato. No elijas image-stream ni hero-gallery-scroll: juntar varias fotos en un corredor o mosaico de scroll compite con la historia principal y suele producir una página incoherente. Usa entre 2 y 5 medios solo en experiencias visuales, o type=none cuando no añada significado. Su placement siempre es after-catalog. La plataforma aplica automáticamente los colores de theme a cualquier experiencia tipográfica.",
        "Usa full-bleed, offset, split, centered, grid, stacked, rail y minimal como herramientas libres, no como una receta. Evita una secuencia repetida de tarjetas genéricas y evita el patrón constante texto a la izquierda e imagen a la derecha.",
        "Los CTA deben ser breves, específicos al rubro y conducir al catálogo o contacto. Evita emojis, nombres genéricos, porcentajes redondos falsos y clichés como Elevate, Seamless, Unleash, Next-Gen, Eleva, Revoluciona o Sin límites. Nunca inventes descuentos, envíos, certificaciones, origen, materiales, testimonios ni promesas verificables.",
        "mediaIndices y assetIndex solo pueden referenciar los índices disponibles. Usa assetIndex=-1 cuando un item no necesite medio. No incluyas URLs externas.",
        "Escribe copy borrador atractivo en español. No devuelvas HTML, CSS, JavaScript ni texto fuera del esquema estructurado.",
      ].join("\n");

      const outputText = await requestStructuredOutput("store_visual_directions", AI_DIRECTIONS_SCHEMA, prompt, 14_000);
      const parsed = JSON.parse(outputText) as { directions?: unknown };
      const directions = this.validDirections(parsed.directions, store, assets, products);
      if (!directions) throw new BadGatewayException("OpenAI design generation returned an unsafe theme configuration");

      return directions.map((direction) => ({
        title: direction.title,
        rationale: direction.rationale,
        config: legacyConfigFromSiteDocument(direction.siteDocument),
      }));
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
    const materialized = directions.flatMap((direction) => {
      if (typeof direction.title !== "string" || direction.title.length < 3 || direction.title.length > 48) return [];
      if (typeof direction.rationale !== "string" || direction.rationale.length < 20 || direction.rationale.length > 240) return [];
      const materializedSiteDocument = materializeSiteDocument(direction.siteDocument, assets, products);
      const siteDocument = materializedSiteDocument
        ? enforceGeneratedNarrative(materializedSiteDocument, store, assets, products)
        : null;
      return siteDocument && passesPremiumDirectionGuardrails(siteDocument)
        ? [{ title: generatedCopy(direction.title), rationale: generatedCopy(direction.rationale), siteDocument }]
        : [];
    });
    if (materialized.length !== 3) return null;
    const structures = new Set(materialized.map((direction) => JSON.stringify(direction.siteDocument.sections.map((section) => [section.kind, section.layout, section.width]))));
    return structures.size === 3 ? materialized : null;
  }
}
