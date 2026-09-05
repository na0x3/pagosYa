import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
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
import { PaymentLinksService } from "../payment-links/payment-links.service";
import { SAFE_TEXT_PATTERN } from "../common/validation/safe-text.decorator";
import { MAX_IMAGE_UPLOAD_BYTES, UploadsService } from "../uploads/uploads.service";
import { STORE_FONT_STYLES, STORE_MOTION_EXPERIENCES, type StoreFontStyle } from "./dto/create-store.dto";
import { GenerateVisualProposalsDto } from "./dto/generate-visual-proposals.dto";
import { StoreAgentSelectionDto } from "./dto/send-store-agent-message.dto";
import { assertWebsiteRevision, saveWebsiteDraftPatch, websiteEditorStore, websiteDraft } from "./website-draft";
import { assertSelectedOperations, instructionUsesSelection, resolveStoreAgentSelection, selectedOperation } from "./store-agent-selection";
import { storefrontPageProductIds } from "./storefront-page-products";
import {
  AI_SITE_DOCUMENT_SCHEMA,
  SITE_SECTION_MOTIONS,
  materializeSiteDocument,
  siteDocumentJson,
  type AiSiteDocument,
  type StoreSiteDocument,
  type StoreSiteFooter,
} from "./site-document";
import {
  TtlLruCache,
  applyStorefrontCreativeRecipe,
  applyStorefrontTopology,
  beginStorefrontGeneration,
  evaluateStorefrontDiversity,
  storefrontBrandFingerprint,
  storefrontCreativeRecipe,
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
import {
  STORE_AGENT_EDITOR_CATALOG,
  STORE_AGENT_EDITOR_ENTITIES,
  applyStoreAgentEditorOperations,
  applyStoreAgentProposalVisualOperations,
  assertStoreAgentOperationBudget,
  storeAgentEditableInventory,
  storeAgentOperationIsProposalVisual,
  type StoreAgentEditorOperation,
} from "./store-agent-editor";

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

type StoreAgentImageRequest = {
  action: "add" | "set";
  entity: "section-media" | "section-item" | "section-block" | "visual-setting" | "hero-slide" | "editorial-image" | "animation-media" | "new-product";
  targetId: string;
  parentId: string;
  field: string;
  position: number;
  aspectRatio: "landscape" | "portrait" | "square";
  prompt: string;
};

type StoreAgentProductRequest = {
  key: string;
  name: string;
  nameEvidence: string;
  description: string;
  descriptionEvidence: string;
  amount: number;
  amountEvidence: string;
  currency: "BOB";
  stock: number;
  stockEvidence: string;
  categoryId: string;
  imageUrls: string[];
  pageIds: string[];
};

export type StoreAgentRevisionPlan = {
  target: "opening" | "catalog" | "story" | "gallery" | "contact" | "footer" | "site" | "unsupported";
  tone: "warmer" | "cooler" | "bolder" | "quieter" | "minimal" | "editorial" | "unchanged";
  action: "restyle" | "replace-title" | "replace-body" | "replace-cta" | "set-color" | "move-up" | "move-down" | "social-link" | "set-link" | "unsupported";
  value: string;
  color: string;
  preserveCatalog: boolean;
  socialHandle: string;
  socialPlatform: "instagram" | "tiktok" | "facebook" | "x" | "youtube" | "unknown";
  linkLabel: string;
  linkUrl: string;
  operations: StoreAgentEditorOperation[];
  imageRequests: StoreAgentImageRequest[];
  productRequests: StoreAgentProductRequest[];
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
// This is the only animation inventory the AI composition path may use. The
// model never supplies component names or executable motion code.
const MOTION_EXPERIENCES = STORE_MOTION_EXPERIENCES;
const TEXT_MOTION_EXPERIENCES = new Set([
  "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
]);
const SAFE_GENERATED_BACKGROUNDS = ["#eef1f5", "#e8f2ef", "#eeebf5"] as const;
const GENERATED_SIGNATURE_PROFILES = [
  "text-reveal-block", "text-rotate", "text-along-path",
] as const;

function proposalArtDirections(preferred: unknown, generation: number): SiteArtDirection[] {
  const start = isSiteArtDirection(preferred)
    ? preferred
    : SITE_ART_DIRECTIONS[generation % SITE_ART_DIRECTIONS.length];
  const ordered = [start, ...SITE_ART_DIRECTIONS.filter((direction) => direction !== start)];
  return ordered.slice(0, 3);
}

function generatedMotionProfile(index: number, assetCount: number) {
  void assetCount;
  return { section: "none" as const, signature: GENERATED_SIGNATURE_PROFILES[index % GENERATED_SIGNATURE_PROFILES.length] };
}

type GeneratedBrandPalette = {
  page: string;
  text: string;
  accent: string;
  secondary: string;
  surface: string;
  story: string;
  muted: string;
  border: string;
};

function normalizedBrandColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) =>
    typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry) ? [entry.toLowerCase()] : [],
  ))].slice(0, 6);
}

function brandLedGeneratedPalette(
  brandColors: readonly string[],
  index: number,
  fallback: GeneratedBrandPalette,
): GeneratedBrandPalette {
  const colors = normalizedBrandColors(brandColors);
  if (!colors.length) return fallback;
  const anchor = colors[index % colors.length];
  const support = colors[(index + 1) % colors.length] || anchor;
  const detail = colors[(index + 2) % colors.length] || support;
  const page = blendHex(anchor, "#ffffff", index % 2 === 0 ? 0.88 : 0.93);
  const surface = blendHex(detail, "#ffffff", 0.94);
  const story = blendHex(support, "#ffffff", index % 2 === 0 ? 0.62 : 0.72);
  const accent = blendHex(anchor, "#625b55", 0.16);
  const secondary = blendHex(support, "#514c47", 0.22);
  const text = readableInk(page);
  return {
    page,
    text,
    accent,
    secondary,
    surface,
    story,
    muted: blendHex(text, page, 0.42),
    border: blendHex(detail, page, 0.66),
  };
}

function applyGeneratedBrandPalette(
  document: StoreSiteDocument,
  brandColors: readonly string[],
  index: number,
): StoreSiteDocument {
  if (!normalizedBrandColors(brandColors).length) return document;
  const palette = brandLedGeneratedPalette(brandColors, index, {
    page: document.theme.pageBackground,
    text: document.theme.textColor,
    accent: document.theme.accentColor,
    secondary: document.theme.secondaryColor,
    surface: document.theme.surfaceColor,
    story: document.theme.surfaceColor,
    muted: document.theme.mutedColor,
    border: document.theme.borderColor,
  });
  const sectionBackground = (kind: StoreSiteDocument["sections"][number]["kind"]) => {
    if (kind === "hero") return palette.page;
    if (kind === "catalog") return palette.surface;
    if (kind === "story" || kind === "links") return palette.story;
    if (kind === "gallery") return index % 2 === 0 ? palette.accent : palette.secondary;
    if (kind === "contact" || kind === "location") return index % 2 === 0 ? palette.secondary : palette.surface;
    return palette.surface;
  };
  return {
    ...document,
    theme: {
      ...document.theme,
      pageBackground: palette.page,
      textColor: palette.text,
      accentColor: palette.accent,
      secondaryColor: palette.secondary,
      surfaceColor: palette.surface,
      mutedColor: palette.muted,
      borderColor: palette.border,
    },
    sections: document.sections.map((section) => {
      const backgroundColor = sectionBackground(section.kind);
      return { ...section, backgroundColor, textColor: readableInk(backgroundColor) };
    }),
  };
}

function withGeneratedDefaultFooter(
  document: StoreSiteDocument,
  store: Store,
  links: StoreLinkContext[],
  index: number,
): StoreSiteDocument {
  if (document.footer?.enabled) return document;
  const existingFooter = document.footer;
  const sectionItem = (kind: StoreSiteDocument["sections"][number]["kind"], fallbackLabel: string) => {
    const section = document.sections.find((candidate) => candidate.kind === kind);
    return section ? [{ id: `section-${kind}`, label: section.title || fallbackLabel, href: `#site-section-${section.id}` }] : [];
  };
  const pageItems = (document.pages ?? []).map((page) => ({
    id: `page-${page.id}`.slice(0, 48),
    label: page.label,
    href: `/s/${store.slug}?page=${page.slug}`,
  }));
  const navigationVariants = [
    { title: "Explora", items: pageItems.length ? pageItems : [...sectionItem("catalog", "La tienda"), ...sectionItem("story", "Nuestra historia")] },
    { title: "Descubre", items: pageItems.length ? pageItems : [...sectionItem("catalog", "Productos"), ...sectionItem("gallery", "Galería")] },
    { title: "Visita", items: pageItems.length ? pageItems : [...sectionItem("catalog", "Catálogo"), ...sectionItem("contact", "Contacto")] },
  ];
  const navigation = navigationVariants[index % navigationVariants.length];
  const realLinks = links
    .filter((link) => /^https:\/\//i.test(link.url))
    .slice(0, 4)
    .map((link, linkIndex) => ({ id: `brand-link-${linkIndex + 1}`, label: link.label, href: link.url }));
  const supportingItems = realLinks.length
    ? realLinks
    : [...sectionItem("contact", "Escríbenos"), ...sectionItem("links", "Redes y enlaces")];
  const descriptions = [
    `${store.name}: productos, imágenes y formas de conectar con la marca.`,
    `Conoce el universo visual de ${store.name} y explora su catálogo actual.`,
    `La selección, la historia y las novedades de ${store.name} en un solo lugar.`,
  ];
  const badges = ["Sitio impulsado por pagosYa", "Tienda creada con pagosYa", "Experiencia de compra pagosYa"];
  return {
    ...document,
    footer: {
      enabled: true,
      brandDescription: existingFooter?.brandDescription || descriptions[index % descriptions.length],
      columns: existingFooter?.columns.length ? existingFooter.columns : [
        { id: "explore", title: navigation.title, items: navigation.items },
        ...(supportingItems.length ? [{ id: "connect", title: realLinks.length ? "Conecta" : "Información", items: supportingItems }] : []),
      ],
      copyright: existingFooter?.copyright || `© ${new Date().getFullYear()} ${store.name}`,
      badge: existingFooter?.badge || badges[index % badges.length],
    },
  };
}

function withGeneratedDefaultNavigation(document: StoreSiteDocument): StoreSiteDocument {
  const homeSections = document.sections.filter((section) => !section.pageId);
  const conciseLabel = (title: string | undefined, fallback: string) => {
    const candidate = title?.replace(/\s+/g, " ").trim() ?? "";
    return candidate && candidate.length <= 30 && candidate.split(" ").length <= 4 ? candidate : fallback;
  };
  const catalog = homeSections.find((section) => section.kind === "catalog");
  const sectionSpecs: Array<{ kind: "story" | "gallery" | "contact"; fallback: string }> = [
    { kind: "story", fallback: "Nuestra historia" },
    { kind: "gallery", fallback: "Lookbook" },
    { kind: "contact", fallback: "Contacto" },
  ];
  const items: NonNullable<StoreSiteDocument["navigation"]["items"]> = [
    { id: "home", label: "Inicio", target: "home" },
  ];
  if (catalog) items.push({ id: "catalog", label: conciseLabel(catalog.title, "Colección"), target: "catalog" });
  for (const { kind, fallback } of (document.pages?.length ? [] : sectionSpecs)) {
    const section = homeSections.find((candidate) => candidate.kind === kind);
    if (!section) continue;
    const proposedLabel = conciseLabel(section.title, fallback);
    const label = items.some((item) => item.label.toLocaleLowerCase("es") === proposedLabel.toLocaleLowerCase("es"))
      ? fallback
      : proposedLabel;
    items.push({ id: `nav-${kind}`, label, target: "section", sectionId: section.id });
  }
  for (const page of document.pages ?? []) {
    items.push({ id: `nav-${page.id}`.slice(0, 48), label: page.label, target: "page", pageId: page.id });
  }
  return {
    ...document,
    navigation: { ...document.navigation, items: items.slice(0, 8) },
  };
}

function enforceGeneratedHeroOpening(
  document: StoreSiteDocument,
  assets: MediaAsset[],
  directionIndex: number,
  lockedSectionIds: readonly string[] = [],
): StoreSiteDocument {
  const hero = document.sections.find((section) => section.kind === "hero");
  const catalog = document.sections.find((section) => section.kind === "catalog");
  if (!hero || !catalog) return document;
  const locked = new Set(lockedSectionIds);
  if (locked.has(hero.id) || locked.has(catalog.id) || (document.sections[0] && locked.has(document.sections[0].id))) return document;
  const videoUrls = assets.filter((asset) => asset.mimeType.startsWith("video/")).map((asset) => asset.url);
  const prioritizedMedia = directionIndex % 3 === 2 && videoUrls.length
    ? [...videoUrls, ...hero.mediaUrls.filter((url) => !videoUrls.includes(url))]
    : hero.mediaUrls;
  const mediaUrls = [...new Set(prioritizedMedia)].slice(0, 3);
  const itemByMedia = new Map(hero.items.map((item) => [item.mediaUrl, item]));
  const openingMotions = ["reveal", "drift", "scale"] as const;
  const openingHero = {
    ...hero,
    motion: openingMotions[directionIndex % openingMotions.length],
    mediaUrls,
    items: mediaUrls.map((mediaUrl) => itemByMedia.get(mediaUrl) ?? {
      mediaUrl,
      title: hero.title,
      body: hero.body,
    }),
  };
  const tail = document.sections.filter((section) => section.id !== hero.id && section.id !== catalog.id);
  const tailOffset = tail.length ? directionIndex % tail.length : 0;
  const variedTail = [...tail.slice(tailOffset), ...tail.slice(0, tailOffset)];
  return {
    ...document,
    sections: [openingHero, catalog, ...variedTail],
  };
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
    if (generatedTypes.has(section.motion)) {
      return { ...section, motion: "none" as const };
    }
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

function staticGeneratedPhotography(document: StoreSiteDocument): StoreSiteDocument {
  return {
    ...document,
    sections: document.sections.map((section) => {
      const sourceMediaUrls = Array.isArray(section.mediaUrls) ? section.mediaUrls : [];
      const mediaUrls = section.kind === "hero" ? sourceMediaUrls.slice(0, 1) : sourceMediaUrls;
      const heroMedia = mediaUrls[0];
      const items = Array.isArray(section.items) ? section.items : [];
      return {
        ...section,
        mediaUrls,
        ...(section.kind === "hero"
          ? { items: heroMedia ? items.filter((item) => item.mediaUrl === heroMedia).slice(0, 1) : [] }
          : {}),
        ...(section.kind === "gallery" && section.layout === "rail" ? { layout: "grid" as const } : {}),
      };
    }),
    experience: TEXT_MOTION_EXPERIENCES.has(document.experience.type)
      ? { ...document.experience, mediaUrls: [] }
      : { ...document.experience, type: "none" as const, mediaUrls: [] },
  };
}

function repairGeneratedPrimaryCatalog(document: StoreSiteDocument): StoreSiteDocument {
  let changed = false;
  const sections = document.sections.map((section) => {
    if (section.kind !== "catalog" || section.pageId || !Array.isArray(section.productIds) || section.productIds.length > 0) {
      return section;
    }
    changed = true;
    const { productIds: _emptyGeneratedSelection, ...fullInventoryCatalog } = section;
    return fullInventoryCatalog;
  });
  return changed ? { ...document, sections } : document;
}

function enforceUniqueGeneratedProposalConfig(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const config = value as Record<string, unknown>;
  const document = config.siteDocument;
  if (!document || typeof document !== "object" || Array.isArray(document)) return value;
  const siteDocument = document as unknown as StoreSiteDocument;
  if (!Array.isArray(siteDocument.sections) || !siteDocument.experience || typeof siteDocument.experience !== "object") return value;
  const openingDocument = enforceGeneratedHeroOpening(siteDocument, [], 0);
  const uniqueInventory = enforceUniqueGeneratedAnimationTypes(
    openingDocument,
    config.animations,
    config.motionExperiences,
  );
  const generatedDocument = staticGeneratedPhotography(repairGeneratedPrimaryCatalog(uniqueInventory.siteDocument));
  const animations = uniqueInventory.animations;
  const animationTypes = animations.flatMap((animation) => {
    const type = animation && typeof animation === "object" && !Array.isArray(animation)
      ? (animation as Record<string, unknown>).type
      : null;
    return typeof type === "string" ? [type] : [];
  });
  return {
    ...freshGeneratedVisualReset(),
    ...config,
    siteDocument: generatedDocument,
    contentOrder: expandMotionSections(cleanGeneratedContentOrder(config.contentOrder), animations.flatMap((animation) => {
      const id = animation && typeof animation === "object" && !Array.isArray(animation)
        ? (animation as Record<string, unknown>).id
        : null;
      return typeof id === "string" ? [id] : [];
    })),
    animations,
    motionExperiences: animationTypes,
    motionExperience: animationTypes[0] || "clarity-marquee",
    motionDuoEnabled: animations.length > 0,
  };
}

function stableGeneratedProposalConfig(value: unknown): unknown {
  const repaired = enforceUniqueGeneratedProposalConfig(value);
  if (!repaired || typeof repaired !== "object" || Array.isArray(repaired)) return repaired;
  const config = repaired as Record<string, unknown>;
  const document = config.siteDocument;
  if (!document || typeof document !== "object" || Array.isArray(document)) return repaired;
  return {
    ...config,
    siteDocument: withGeneratedDefaultNavigation(document as unknown as StoreSiteDocument),
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

  // Generated sites have an authored hero opening. Keep that opening first in
  // the rendered content order as well as in siteDocument.sections; otherwise
  // the first generated animation becomes the public page's first section and
  // makes the intended opening look like section two.
  const heroIndex = result.indexOf("hero");
  if (heroIndex > 0) {
    result.splice(heroIndex, 1);
    result.unshift("hero");
  }
  if (!animationIds.length) return result;

  // Split AI-authored motion around the catalog so the storefront has a visual
  // lead-in and a visual continuation. The merchant can still reorder every
  // named animation independently after applying the proposal.
  const productIndex = result.indexOf("products");
  const linksIndex = result.indexOf("links");
  const beforeCount = Math.ceil(animationIds.length / 2);
  const beforeIds = animationIds.slice(0, beforeCount);
  const afterIds = animationIds.slice(beforeCount);
  // Gap zero is before the hero. Motion may bridge the opening and catalog,
  // but it must never displace the opening itself.
  const beforeGaps = Array.from({ length: Math.max(1, productIndex) }, (_, gap) => gap + 1);
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
  if (["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(type)) return { min: 1, max: 1 };
  if (type === "scroll-expansion") return { min: 2, max: 2 };
  if (["hero-gallery-scroll", "gallery-accordion", "split-scroll", "sticky-gallery"].includes(type)) return { min: 3, max: 8 };
  return { min: 2, max: 8 };
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
  if (document.sections.some((section) => !(SITE_SECTION_MOTIONS as readonly string[]).includes(section.motion))) return false;
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

const FEATURED_AI_MOTION_EXPERIENCES = [
  "draggable-cards",
  "perspective-carousel",
  "link-preview",
  "video-pin-reveal",
  "gallery-accordion",
  "split-scroll",
  "sticky-gallery",
  "sticky-story",
  "text-parallax",
] as const satisfies ReadonlyArray<(typeof MOTION_EXPERIENCES)[number]>;

function seededAnimationLibrary(seed: string): Array<(typeof MOTION_EXPERIENCES)[number]> {
  let state = Array.from(seed).reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619),
    2166136261,
  ) >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const shuffle = <T,>(values: readonly T[]) => {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const next = Math.floor(random() * (index + 1));
      [result[index], result[next]] = [result[next], result[index]];
    }
    return result;
  };
  const featured = new Set<(typeof MOTION_EXPERIENCES)[number]>(FEATURED_AI_MOTION_EXPERIENCES);
  return [
    ...shuffle(FEATURED_AI_MOTION_EXPERIENCES),
    ...shuffle(MOTION_EXPERIENCES.filter((type) => !featured.has(type))),
  ];
}

const GENERATED_ANIMATION_NAMES: Record<(typeof MOTION_EXPERIENCES)[number], string> = {
  "story-scroll": "Historia al desplazarse",
  "hero-carousel": "Slider de colección",
  "image-stream": "Flujo de imágenes",
  "scroll-expansion": "Expansión al desplazarse",
  "hero-gallery-scroll": "Galería al desplazarse",
  "stagger-testimonials": "Escenas escalonadas",
  "portfolio-scroller": "Recorrido de colección",
  "circle-reveal": "Revelado circular",
  "clarity-marquee": "Cinta de marca",
  "layered-text": "Texto en capas",
  "text-rotate": "Texto rotativo",
  "text-glitch": "Texto con interferencia",
  "text-reveal-block": "Revelado tipográfico",
  "text-along-path": "Texto en recorrido",
  "full-screen-chapters": "Capítulos completos",
  "magnetic-target": "Llamado magnético",
  "frame-sequence": "Secuencia de cuadros",
  "video-background": "Video de fondo",
  "draggable-cards": "Tarjetas arrastrables",
  "perspective-carousel": "Carrusel con perspectiva",
  "link-preview": "Vista previa de enlace",
  "video-pin-reveal": "Video revelado",
  "gallery-accordion": "Galería acordeón",
  "split-scroll": "Relato dividido",
  "sticky-gallery": "Galería fija",
  "sticky-story": "Historia fija",
  "text-parallax": "Texto en paralaje",
};

function generatedAnimationSuite(
  preferredTypes: unknown,
  assets: MediaAsset[],
  products: StoreProductContext[],
  storeName: string,
  proposalIndex: number,
  generation: number,
): Array<Record<string, unknown>> {
  const requested = Array.isArray(preferredTypes)
    ? preferredTypes.filter((type): type is (typeof MOTION_EXPERIENCES)[number] =>
        typeof type === "string" && MOTION_EXPERIENCES.includes(type as (typeof MOTION_EXPERIENCES)[number]))
    : [];
  const rotatedLibrary = seededAnimationLibrary(`${storeName}:${generation}:${proposalIndex}`);
  const candidates = [...new Set([
    ...requested,
    ...rotatedLibrary,
  ])] as Array<(typeof MOTION_EXPERIENCES)[number]>;
  const targetCount = assets.length >= 3 ? 3 : 2;
  const selected = candidates.filter((type) => {
    const availableAssets = ["video-background", "video-pin-reveal"].includes(type)
      ? assets.filter((asset) => asset.mimeType.startsWith("video/"))
      : assets;
    return animationMediaRequirement(type).min <= availableAssets.length;
  }).slice(0, targetCount);
  const visualCount = Math.max(1, selected.filter((type) => animationMediaRequirement(type).max > 0).length);

  return selected.map((type, animationIndex) => {
    const availableAssets = ["video-background", "video-pin-reveal"].includes(type)
      ? assets.filter((asset) => asset.mimeType.startsWith("video/"))
      : assets;
    const media = distributedAnimationMedia(availableAssets, [], animationIndex, visualCount, type).map((item, sceneIndex) => {
      const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl : "";
      const product = products.find((candidate) => candidate.imageUrls.includes(imageUrl));
      return {
        ...item,
        title: product?.name || `${storeName} · escena ${sceneIndex + 1}`,
        caption: product?.description || "",
        body: "",
      };
    });
    const featuredProduct = products[(proposalIndex + animationIndex) % Math.max(1, products.length)];
    return {
      id: `ai-${proposalIndex + 1}-${type}`,
      name: GENERATED_ANIMATION_NAMES[type],
      type,
      title: storeName,
      subtitle: featuredProduct?.description || `Una escena de ${storeName} construida con contenido real de la tienda.`,
      ...(featuredProduct?.id ? { productId: featuredProduct.id } : {}),
      media,
    };
  });
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
              imageAssetIndices: { type: "array", minItems: 0, maxItems: 8, items: { type: "integer", minimum: 0, maximum: 23 } },
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
                type: "array", minItems: 1, maxItems: 5,
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

function localSiteDocument(store: Store, preset: ProposalPreset, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[], index: number, brandColors: readonly string[] = []): StoreSiteDocument {
  const config = preset.config as Record<string, unknown>;
  const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
  const copy = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;
  const palettes = [
    { page: "#fff2df", text: "#261814", accent: "#c94b3c", secondary: "#2d766d", surface: "#fffaf2", story: "#f4c767", muted: "#72554c", border: "#dfb2a0" },
    { page: "#f3efff", text: "#211a32", accent: "#6950b8", secondary: "#d97835", surface: "#fff7e8", story: "#d9ccff", muted: "#665b78", border: "#c8bce2" },
    { page: "#eaf8f1", text: "#142321", accent: "#b6365f", secondary: "#146c73", surface: "#fff2d8", story: "#bfe6d4", muted: "#516a64", border: "#afd2c5" },
  ] as const;
  const fallbackPalette = palettes[index % palettes.length];
  const palette = brandLedGeneratedPalette(brandColors, index, fallbackPalette);
  const pageBackground = brandColors.length ? palette.page : color(config.backgroundColor, palette.page);
  const accentColor = brandColors.length ? palette.accent : color(config.accentColor, palette.accent);
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
  const heroMediaUrls = rotatedMediaUrls.slice(0, 1);
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
      ],
    },
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
        kind: "story",
        layout: "stacked",
        width: "full",
        align: index === 1 ? "right" : "left",
        motion: "none",
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

function ensureGeneratedCommercePages(
  document: StoreSiteDocument,
  store: Store,
  assets: MediaAsset[],
  products: StoreProductContext[],
  directionIndex: number,
): StoreSiteDocument {
  const pages = [...(document.pages ?? [])].slice(0, 3);
  const usedPageIds = new Set(pages.map((page) => page.id));
  const usedSlugs = new Set(pages.map((page) => page.slug));
  const defaults = [
    { id: "collection-page", label: "Colección", slug: "coleccion" },
    { id: "story-page", label: "Historia", slug: "historia" },
    { id: "new-page", label: "Novedades", slug: "novedades" },
  ];
  for (const candidate of defaults) {
    if (pages.length >= 2) break;
    if (usedPageIds.has(candidate.id) || usedSlugs.has(candidate.slug)) continue;
    pages.push(candidate);
    usedPageIds.add(candidate.id);
    usedSlugs.add(candidate.slug);
  }

  const visualMedia = assets.filter((asset) => asset.url !== store.logoUrl).map((asset) => asset.url);
  const sections = document.sections.map((section, sectionIndex) => {
    if (!section.pageId) return section;
    if (section.kind === "catalog") {
      const pageIndex = Math.max(0, pages.findIndex((page) => page.id === section.pageId));
      const assigned = storefrontPageProductIds(pages[pageIndex], document.sections, products, pageIndex, section.productIds);
      return {
        ...section,
        productIds: assigned,
        motion: section.motion === "none" ? (["scale", "reveal", "drift"] as const)[(pageIndex + directionIndex) % 3] : section.motion,
      };
    }
    return section.motion === "none" && ["story", "gallery", "contact", "location", "links"].includes(section.kind)
      ? { ...section, motion: "reveal" as const }
      : section;
  });
  const sectionIds = new Set(sections.map((section) => section.id));
  const uniqueSectionId = (base: string) => {
    let id = base;
    let suffix = 2;
    while (sectionIds.has(id)) id = `${base}-${suffix++}`;
    sectionIds.add(id);
    return id;
  };

  pages.forEach((page, pageIndex) => {
    const pageSections = sections.filter((section) => section.pageId === page.id);
    if (!pageSections.some((section) => section.kind !== "catalog")) {
      const mediaUrl = visualMedia.length ? visualMedia[(pageIndex + directionIndex) % visualMedia.length] : null;
      const story: StoreSiteDocument["sections"][number] = {
        id: uniqueSectionId(`${page.id}-story`.slice(0, 48)),
        pageId: page.id,
        kind: "story",
        family: pageIndex % 2 === 0 ? "editorial" : "cinematic",
        layout: pageIndex % 2 === 0 ? "offset" : "stacked",
        width: "wide",
        align: pageIndex % 2 === 0 ? "left" : "right",
        motion: pageIndex % 2 === 0 ? "clip" : "reveal",
        title: page.label,
        body: pageIndex % 2 === 0
          ? `Una selección curada del universo de ${store.name}.`
          : `Conoce las piezas, la intención y las novedades de ${store.name}.`,
        ctaLabel: "",
        backgroundColor: pageIndex % 2 === 0 ? document.theme.surfaceColor : document.theme.secondaryColor,
        textColor: pageIndex % 2 === 0 ? document.theme.textColor : readableInk(document.theme.secondaryColor),
        mediaUrls: mediaUrl ? [mediaUrl] : [],
        items: mediaUrl ? [{ mediaUrl, title: page.label, body: `Descubre ${store.name} en detalle.` }] : [],
      };
      sections.push({ ...story, blocks: deriveLegacySiteSectionBlocks(story) });
    }
    if (!pageSections.some((section) => section.kind === "catalog")) {
      const assigned = storefrontPageProductIds(page, sections, products, pageIndex);
      const catalog: StoreSiteDocument["sections"][number] = {
        id: uniqueSectionId(`${page.id}-shop`.slice(0, 48)),
        pageId: page.id,
        productIds: [...new Set(assigned)],
        kind: "catalog",
        family: "product-led",
        layout: pageIndex % 2 === 0 ? "grid" : "offset",
        width: "wide",
        align: "left",
        motion: (["scale", "reveal", "drift"] as const)[(pageIndex + directionIndex) % 3],
        title: `Productos de ${page.label}`,
        body: `Una selección de ${store.name} elegida para esta página.`,
        ctaLabel: "",
        backgroundColor: document.theme.pageBackground,
        textColor: document.theme.textColor,
        mediaUrls: [],
        items: [],
      };
      sections.push({ ...catalog, blocks: deriveLegacySiteSectionBlocks(catalog) });
    }
  });

  return withGeneratedDefaultNavigation({ ...document, pages, sections: sections.slice(0, 16) });
}

function enforceGeneratedNarrative(
  document: StoreSiteDocument,
  store: Store,
  assets: MediaAsset[],
  products: StoreProductContext[],
  directionIndex: number,
): StoreSiteDocument {
  const hero = document.sections.find((section) => section.kind === "hero" && !section.pageId);
  const catalog = document.sections.find((section) => section.kind === "catalog" && !section.pageId);
  if (!hero || !catalog) return document;

  const visualAssetUrls = assets
    .filter((asset) => asset.url !== store.logoUrl)
    .map((asset) => asset.url);
  const usableAssetUrls = visualAssetUrls.length ? visualAssetUrls : assets.map((asset) => asset.url);
  const knownAssetUrls = new Set(usableAssetUrls);
  const uniqueMedia = (preferred: string[], fallbackOffset: number, limit: number, used: ReadonlySet<string> = new Set()) => {
    const fallback = usableAssetUrls.length
      ? [...usableAssetUrls.slice(fallbackOffset % usableAssetUrls.length), ...usableAssetUrls.slice(0, fallbackOffset % usableAssetUrls.length)]
      : [];
    return [...new Set([...preferred.filter((url) => knownAssetUrls.has(url)), ...fallback])]
      .filter((url) => !used.has(url))
      .slice(0, limit);
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

  const rebindSectionMedia = (
    section: StoreSiteDocument["sections"][number],
    mediaUrls: string[],
  ): StoreSiteDocument["sections"][number] => {
    let mediaIndex = 0;
    const visitBlocks = (blocks: NonNullable<StoreSiteDocument["sections"][number]["blocks"]>): NonNullable<StoreSiteDocument["sections"][number]["blocks"]> => blocks.map((block) => {
      if (block.kind === "media") {
        const mediaUrl = mediaUrls[mediaIndex] ?? null;
        mediaIndex += 1;
        return { ...block, mediaUrl };
      }
      return block.children.length ? { ...block, children: visitBlocks(block.children) } : block;
    });
    return {
      ...section,
      mediaUrls,
      items: pairNarrativeItems(section, mediaUrls),
      ...(section.blocks?.length ? { blocks: visitBlocks(section.blocks) } : {}),
    };
  };

  const simplifyAdditionalFullBleed = (sections: StoreSiteDocument["sections"]): StoreSiteDocument["sections"] => {
    let photographicFullBleedClaimed = false;
    return sections.map((section) => {
      const photographic = ["hero", "story", "gallery", "location"].includes(section.kind) && section.mediaUrls.length > 0;
      const fullBleed = photographic && (section.width === "full" || section.layout === "full-bleed");
      if (!fullBleed) return section;
      if (!photographicFullBleedClaimed) {
        photographicFullBleedClaimed = true;
        return section;
      }
      return {
        ...section,
        width: "wide",
        layout: section.layout === "full-bleed"
          ? section.kind === "gallery" ? "grid" : "split"
          : section.layout,
      };
    });
  };

  const heroMediaUrls = uniqueMedia(hero.mediaUrls, 0, 1);
  const pageUsedMedia = new Set(heroMediaUrls);
  const { pageId: _heroPageId, ...heroOnHome } = hero;
  const normalizedHero = rebindSectionMedia({
    ...heroOnHome,
    motion: "none" as const,
  }, heroMediaUrls);
  const existingStory = document.sections.find((section) => section.kind === "story" && !section.pageId);
  const story = existingStory ?? {
    id: "brand-story",
    kind: "story" as const,
    layout: "stacked" as const,
    width: "full" as const,
    align: "left" as const,
    motion: "none" as const,
    title: `Conoce ${store.name}`,
    body: `Una mirada a la selección y al universo visual de ${store.name}.`,
    ctaLabel: "",
    backgroundColor: document.theme.pageBackground,
    textColor: document.theme.textColor,
    mediaUrls: [],
    items: [],
  };
  const storyMediaLimit = usableAssetUrls.length >= 5 ? 2 : usableAssetUrls.length >= 3 ? 1 : 0;
  const storyMediaUrls = uniqueMedia(story.mediaUrls, 1, storyMediaLimit, pageUsedMedia);
  storyMediaUrls.forEach((url) => pageUsedMedia.add(url));
  const { pageId: _storyPageId, ...storyOnHome } = story;
  const normalizedStory = rebindSectionMedia({
    ...storyOnHome,
    layout: "stacked" as const,
    width: "full" as const,
    motion: "none" as const,
  }, storyMediaUrls);
  const motionProfile = generatedMotionProfile(directionIndex, usableAssetUrls.length);
  const normalizedSections = document.sections.map((section) => {
    if (section.id === hero.id) return normalizedHero;
    if (section.id === story.id) return normalizedStory;
    if (section.id === catalog.id) {
      const { pageId: _catalogPageId, ...catalogOnHome } = catalog;
      return catalogOnHome;
    }
    if (section.kind === "gallery") {
      if (!section.pageId) {
        const remainingCount = Math.max(0, usableAssetUrls.length - pageUsedMedia.size);
        const galleryMediaUrls = usableAssetUrls.length >= 3
          ? uniqueMedia(section.mediaUrls, 1 + storyMediaUrls.length, Math.min(4, remainingCount), pageUsedMedia)
          : [];
        galleryMediaUrls.forEach((url) => pageUsedMedia.add(url));
        return rebindSectionMedia({
          ...section,
          layout: galleryMediaUrls.length < 3 || section.layout === "rail" ? "grid" as const : section.layout,
          width: galleryMediaUrls.length < 3 ? "wide" as const : section.width,
          motion: galleryMediaUrls.length ? motionProfile.section : "none" as const,
        }, galleryMediaUrls);
      }
      return {
        ...section,
        // Generated galleries avoid the thin peeking-image treatment, while
        // their position remains owned by the selected page topology.
        layout: section.layout === "rail" ? (directionIndex % 2 === 0 ? "grid" as const : "split" as const) : section.layout,
        motion: motionProfile.section,
      };
    }
    if (section.kind === "contact") {
      return section.pageId ? { ...section, motion: "reveal" as const } : { ...section, motion: "none" as const };
    }
    return { ...section, motion: "none" as const };
  });
  if (!existingStory) {
    const catalogIndex = normalizedSections.findIndex((section) => section.kind === "catalog");
    normalizedSections.splice(catalogIndex < 0 ? normalizedSections.length : catalogIndex, 0, normalizedStory);
  }
  const experienceMediaUrls: string[] = [];
  const copyKey = (value: string) => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const sectionTitleKeys = new Set(normalizedSections.map((section) => copyKey(section.title)).filter(Boolean));
  const sectionBodyKeys = new Set(normalizedSections.map((section) => copyKey(section.body)).filter(Boolean));
  const productNames = products.map((product) => product.name.trim()).filter(Boolean).slice(0, 3);
  const evidence = productNames.length
    ? `Un recorrido visual por ${productNames.join(", ")}.`
    : `Una secuencia visual construida con las imágenes de ${store.name}.`;
  const experienceFallbacks = [
    { title: `${store.name}, en detalle`, body: evidence },
    { title: `Otra mirada a ${store.name}`, body: evidence },
    { title: `${store.name} en movimiento`, body: evidence },
  ];
  const experienceFallback = experienceFallbacks[directionIndex % experienceFallbacks.length];
  const experienceTitle = sectionTitleKeys.has(copyKey(document.experience.title))
    ? experienceFallback.title.slice(0, 100)
    : document.experience.title;
  const experienceBody = sectionBodyKeys.has(copyKey(document.experience.body))
    ? experienceFallback.body.slice(0, 220)
    : document.experience.body;

  return {
    ...document,
    experience: {
      ...document.experience,
      type: motionProfile.signature,
      placement: "after-catalog",
      title: experienceTitle,
      body: experienceBody,
      mediaUrls: experienceMediaUrls,
    },
    sections: simplifyAdditionalFullBleed(normalizedSections),
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
  return withGeneratedDefaultNavigation({
    ...documentWithoutPages,
    ...(pages.length ? { pages } : {}),
    ...(liveDocument?.footer ? { footer: structuredClone(liveDocument.footer) } : {}),
    navigation: {
      ...document.navigation,
    },
    sections,
  });
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
    announcementMode: "marquee",
    announcementSpeed: 22,
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

function agentInstructionExplicitlyRequestsMotion(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  if (/(?:no te pedi|nunca pedi|nada que ver|solo queria|unicamente queria).{0,64}(?:animacion|animaciones|movimiento)/.test(normalized)) return false;
  return /(?:cambi|edit|modific|ajust|agreg|anad|quit|elimin|borra|muev|reorden|duplic|pon|restaur|recuper).{0,48}(?:animacion|animaciones|movimiento)/.test(normalized)
    || /(?:animacion|animaciones|movimiento).{0,48}(?:cambi|edit|modific|ajust|agreg|anad|quit|elimin|borra|muev|reorden|duplic|pon|restaur|recuper)/.test(normalized);
}

function assertAgentRevisionScope(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
  selectedTarget = false,
): void {
  const normalized = normalizedAgentInstruction(instruction);
  const motionEntities = new Set(["motion", "animation", "animation-text", "animation-media"]);
  const changesMotion = plan.operations.some((operation) => (
    motionEntities.has(operation.entity)
    || (operation.entity === "section" && operation.field === "motion")
    || (operation.entity === "design-genome" && operation.field === "motionLanguage")
  ));
  if (changesMotion && !agentInstructionExplicitlyRequestsMotion(instruction)) {
    throw new BadRequestException("Yapi intentó cambiar animaciones que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  const requestsGeneratedImage = /(?:genera|generar|crea|crear|generate|create).{0,40}(?:imagen|imagenes|foto|fotos|image|photo)/.test(normalized);
  if (plan.imageRequests.length && !requestsGeneratedImage) {
    throw new BadRequestException("Yapi intentó generar imágenes cuando sólo pediste usar o cambiar una foto. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  if (plan.productRequests.length && !storeAgentInstructionLooksLikeProductCreation(instruction)) {
    throw new BadRequestException("Yapi intentó crear productos que no pediste. La variante fue rechazada y el borrador anterior sigue intacto.");
  }

  if (selectedTarget) return;
  const targetsOpeningContent = /(?:primera seccion|primer bloque|portada|apertura|\bhero\b)/.test(normalized)
    && /(?:foto|imagen|texto|titulo|encabezado|descripcion|subtitulo|boton|cta)/.test(normalized);
  const broadRedesign = /(?:redisen|disen|crea|genera|arma).{0,36}(?:sitio|website|pagina web|tienda|direccion visual|propuesta).{0,24}(?:complet|desde cero|nuev)/.test(normalized);
  if (!targetsOpeningContent || broadRedesign) return;

  const openingId = document.sections.find((section) => !section.pageId)?.id ?? document.sections[0]?.id;
  const imageRequestsAllowed = plan.imageRequests.every((request) => (
    request.entity === "section-media" && request.parentId === openingId
  ) || request.entity === "hero-slide" || (request.entity === "visual-setting" && ["bannerUrl", "backgroundImageUrl"].includes(request.field)));
  if (!imageRequestsAllowed) {
    throw new BadRequestException("Yapi intentó colocar una imagen fuera de la primera sección. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
  const allowed = plan.operations.every((operation) => {
    if (operation.entity === "section") {
      return operation.action === "set"
        && operation.targetId === openingId
        && ["title", "body", "ctaLabel"].includes(operation.field);
    }
    if (["section-media", "section-item", "section-block"].includes(operation.entity)) {
      return operation.parentId === openingId
        && (operation.entity !== "section-block" || operation.field === "text");
    }
    if (operation.entity === "hero-slide") {
      return ["imageUrl", "title", "body", "ctaLabel", "ctaUrl", ""].includes(operation.field);
    }
    if (operation.entity === "visual-setting") {
      return ["bannerUrl", "tagline"].includes(operation.field);
    }
    return false;
  });
  if (!allowed) {
    throw new BadRequestException("Yapi intentó modificar partes fuera de la primera sección. La variante fue rechazada y el borrador anterior sigue intacto.");
  }
}

function localAgentRevisionPlan(instruction: string): StoreAgentRevisionPlan {
  const normalized = normalizedAgentInstruction(instruction);
  const linkUrl = (instruction.match(/https:\/\/[^\s<>"'’]+/iu)?.[0] ?? "")
    .replace(/[),.;!?]+$/u, "")
    .slice(0, 500);
  const linkLabel = (instruction.match(/(?:que|cual)\s+dice\s+[“"'‘]?(.{1,100}?)[”"'’]?\s+(?:ponle|pon|agrega|anade|añade|cambia|asigna|vincula)\b/iu)?.[1] ?? "")
    .trim()
    .replace(/^[“"'‘]|[”"'’]$/gu, "")
    .trim()
    .slice(0, 100);
  const preserveCatalog = /(manten|mantener|conserv|preserv|no (?:cambies|toques|modifiques)).{0,32}(catalog|producto|tienda)/.test(normalized);
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
  const target: StoreAgentRevisionPlan["target"] = /(footer|pie de pagina|\bred(?:es)?\b|\bsocial(?:es)?\b|sigueme|siguenos)/.test(normalized)
    || (linkUrl && /\b(enlace|link|vinculo)\b/.test(normalized))
    ? "footer"
    : /(primera seccion|primer bloque|apertura|portada|inicio|hero|cabecera)/.test(normalized)
    ? "opening"
    : /(historia|story|relato)/.test(normalized)
      ? "story"
      : /(galeria|gallery)/.test(normalized)
        ? "gallery"
        : /(contacto|contact)/.test(normalized)
          ? "contact"
          : /(catalog|producto|tienda)/.test(normalized) && !preserveCatalog
            ? "catalog"
            : /(boton|cta|titulo|encabezado|descripcion|subtitulo)/.test(normalized)
              ? "opening"
            : tone !== "unchanged"
              ? "site"
              : "unsupported";
  const handleMatch = instruction.match(/(?:^|\s)@([a-z0-9._-]{1,30})\b/i);
  const socialHandle = handleMatch ? `@${handleMatch[1]}` : "";
  const socialPlatform: StoreAgentRevisionPlan["socialPlatform"] = /instagram/.test(normalized)
    ? "instagram"
    : /tiktok/.test(normalized)
      ? "tiktok"
      : /facebook/.test(normalized)
        ? "facebook"
        : /(?:^|\s)(?:twitter|x)(?:\s|$)/.test(normalized)
          ? "x"
          : /youtube/.test(normalized)
            ? "youtube"
            : "unknown";
  const quotedValue = instruction.match(/[“"]([^”"]{1,600})[”"]/u)?.[1]?.trim()
    ?? instruction.match(/['‘]([^'’]{1,600})['’]/u)?.[1]?.trim()
    ?? "";
  const trailingValue = instruction.match(/(?:\ba\b|\bpor\b|:)\s*[“"'‘]?(.{1,600}?)[”"'’]?[.!]?$/iu)?.[1]?.trim() ?? "";
  const value = (quotedValue || trailingValue).slice(0, 600);
  const color = instruction.match(/#[0-9a-f]{6}\b/i)?.[0].toLowerCase() ?? "";
  const action: StoreAgentRevisionPlan["action"] = target === "footer" && socialHandle
    ? "social-link"
    : target === "footer" && linkUrl
      ? "set-link"
    : /(mueve|sube|subir|lleva|coloca).{0,32}(arriba|antes)/.test(normalized)
      ? "move-up"
      : /(mueve|baja|bajar|lleva|coloca).{0,32}(abajo|despues)/.test(normalized)
        ? "move-down"
        : color && /(color|fondo|background)/.test(normalized)
          ? "set-color"
          : /(boton|cta|llamada a la accion)/.test(normalized) && value
            ? "replace-cta"
            : /(titulo|encabezado)/.test(normalized) && value
              ? "replace-title"
              : /(descripcion|subtitulo|texto|parrafo)/.test(normalized) && value
                ? "replace-body"
                : tone !== "unchanged"
                  ? "restyle"
                  : "unsupported";
  const targetLabel = target === "opening" ? "la apertura" : target === "site" ? "el lenguaje visual" : target === "footer" ? "el pie de página" : `la sección ${target}`;
  const toneLabel = tone === "unchanged" ? "siguiendo la instrucción" : `con un tono ${tone}`;
  const summary = target === "footer" && socialHandle
    ? `Agregar ${socialHandle} al pie de página sin cambiar el resto de la tienda.`
    : target === "footer" && action === "set-link"
      ? `Asignar ${linkUrl} al enlace “${linkLabel || "indicado"}” del pie de página.`
    : target === "unsupported" || action === "unsupported"
      ? "La instrucción no identifica una zona editable de forma segura."
      : action === "replace-title" ? `Cambiar el título de ${targetLabel} a “${value.slice(0, 80)}”.`
        : action === "replace-body" ? `Cambiar el texto de ${targetLabel}.`
          : action === "replace-cta" ? `Cambiar el botón de ${targetLabel} a “${value.slice(0, 40)}”.`
            : action === "set-color" ? `Cambiar el fondo de ${targetLabel} a ${color}.`
              : action === "move-up" ? `Mover ${targetLabel} una posición hacia arriba.`
                : action === "move-down" ? `Mover ${targetLabel} una posición hacia abajo.`
                  : `Ajustar ${targetLabel} ${toneLabel}.`;
  const operations: StoreAgentEditorOperation[] = action === "set-link"
    ? [{ action: "set", entity: "footer-link", targetId: linkLabel, parentId: "", field: "href", value: linkUrl, secondaryValue: "", position: -1 }]
    : [];
  return { target, tone, action, value, color, preserveCatalog, socialHandle, socialPlatform, linkLabel, linkUrl, operations, imageRequests: [], productRequests: [], summary };
}

export function storeAgentInstructionIsScoped(instruction: string): boolean {
  const plan = localAgentRevisionPlan(instruction);
  return plan.target !== "unsupported" && plan.action !== "unsupported" && (plan.target !== "site" || plan.action !== "restyle");
}

export function storeAgentInstructionLooksLikeEditorCommand(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  if (/(?:redisen|diseñ|disen|crea|genera|arma).{0,36}(?:sitio|website|pagina web|tienda|direccion visual|propuesta).{0,24}(?:complet|desde cero|nuev)/.test(normalized)) return false;
  const operation = /(cambi|edit|modific|ajust|agreg|anad|añad|quit|elimin|borra|muev|sube|baja|reorden|duplic|copi|ocult|muestr|activ|desactiv|vincul|enlaz|asign|renombr|pon|fij)/.test(normalized)
    || /(?:genera|crea).{0,32}(?:imagen|foto)/.test(normalized);
  const editorEntity = /(portada|titulo|texto|boton|tema|color|tipograf|encabezado|menu|naveg|pagina|seccion|galeria|historia|catalog|producto|footer|pie de pagina|columna|enlace|link|boletin|newsletter|coleccion|animacion|movimiento|experiencia|imagen|foto|alto|ancho|alineacion|fondo)/.test(normalized);
  return operation && editorEntity;
}

export function storeAgentInstructionLooksLikeProductCreation(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  return /(?:crea|crear|agrega|agregar|anade|anadir|añade|añadir).{0,32}(?:producto|articulo|servicio)/.test(normalized);
}

function instructionExplicitlyUsesAttachedImage(instruction: string): boolean {
  const normalized = normalizedAgentInstruction(instruction);
  const placementVerb = "(?:cambi|reempla|sustitu|pon|usa|utiliz|coloca|agreg|anad|anade|adjunt|replace|use)";
  const imageNoun = "(?:foto|fotos|imagen|imagenes|image|photo)";
  return new RegExp(`${placementVerb}.{0,48}${imageNoun}|${imageNoun}.{0,48}${placementVerb}`).test(normalized);
}

function withDeterministicAttachedImage(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
  attachedImageUrls: string[],
): StoreAgentRevisionPlan {
  if (!attachedImageUrls.length || !instructionExplicitlyUsesAttachedImage(instruction)) return plan;
  const locallyDetectedTarget = localAgentRevisionPlan(instruction).target;
  const target = ["opening", "story", "gallery", "contact"].includes(plan.target)
    ? plan.target
    : locallyDetectedTarget;
  if (!["opening", "story", "gallery", "contact"].includes(target)) return plan;
  const section = target === "opening"
    ? document.sections.find((candidate) => !candidate.pageId) ?? document.sections[0]
    : document.sections.find((candidate) => candidate.kind === target);
  if (!section) return plan;

  const imageUrl = attachedImageUrls[0];
  const replacement: StoreAgentEditorOperation = {
    action: section.mediaUrls.length ? "set" : "add",
    entity: "section-media",
    targetId: "",
    parentId: section.id,
    field: "imageUrl",
    value: imageUrl,
    secondaryValue: "",
    position: 0,
  };
  const operations = plan.operations.filter((operation) => !(
    operation.entity === "section-media"
    && operation.parentId === section.id
    && (operation.position === 0 || operation.value === imageUrl)
  ));
  return {
    ...plan,
    target,
    operations: [...operations, replacement],
  };
}

function withDeterministicGeneratedOpeningImage(
  instruction: string,
  document: StoreSiteDocument,
  plan: StoreAgentRevisionPlan,
): StoreAgentRevisionPlan {
  const normalized = normalizedAgentInstruction(instruction);
  const requestsGeneratedImage = /(?:genera|generar|crea|crear|generate|create).{0,40}(?:imagen|imagenes|foto|fotos|image|photo)/.test(normalized);
  const targetsOpening = /(?:primera seccion|primer bloque|portada|apertura|\bhero\b)/.test(normalized);
  if (!requestsGeneratedImage || !targetsOpening) return plan;
  // The local repair can fill one missing opening destination. It must not
  // discard a compound image request that the planner already supplied.
  if (plan.imageRequests.length > 1) return plan;

  const opening = document.sections.find((section) => !section.pageId) ?? document.sections[0];
  if (!opening) return plan;
  const authoredRequest = plan.imageRequests.find((request) => request.entity !== "new-product");
  const prompt = authoredRequest?.prompt?.trim()
    || `Una imagen editorial original para la portada de esta tienda, coherente con ${document.direction || "su identidad visual"}`;
  const imageRequest: StoreAgentImageRequest = {
    action: opening.mediaUrls.length ? "set" : "add",
    entity: "section-media",
    targetId: "",
    parentId: opening.id,
    field: "",
    position: 0,
    aspectRatio: authoredRequest?.aspectRatio ?? "landscape",
    prompt: prompt.slice(0, 1_200),
  };

  return {
    ...plan,
    target: "opening",
    imageRequests: [imageRequest],
  };
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

function generatedImageOperation(request: StoreAgentImageRequest, url: string): StoreAgentEditorOperation {
  if (request.entity === "new-product") throw new BadRequestException("Las fotos de producto se asignan al crear el producto, no como una operación visual.");
  const base: StoreAgentEditorOperation = {
    action: request.action,
    entity: request.entity,
    targetId: request.targetId,
    parentId: request.parentId,
    field: request.field,
    value: url,
    secondaryValue: "",
    position: request.position,
  };
  if (request.entity === "section-media" && request.parentId && (request.action === "add" || request.action === "set")) {
    return { ...base, field: "" };
  }
  if (["section-item", "section-block"].includes(request.entity) && request.action === "set" && request.parentId && request.field === "mediaUrl") return base;
  if (request.entity === "visual-setting" && request.action === "set" && ["bannerUrl", "backgroundImageUrl", "aboutImageUrl", "promotionImageUrl"].includes(request.field)) return base;
  if (request.entity === "hero-slide" && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  if (request.entity === "editorial-image" && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  if (request.entity === "animation-media" && request.parentId && (request.action === "add" || (request.action === "set" && request.field === "imageUrl"))) return base;
  throw new BadRequestException("Yapi intentó colocar una imagen generada en un destino que no admite imágenes.");
}

function evidenceAppearsInInstruction(instruction: string, evidence: string): boolean {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase("es");
  const needle = normalize(evidence);
  return Boolean(needle) && normalize(instruction).includes(needle);
}

function bobAmountFromEvidence(evidence: string): number | null {
  const normalized = evidence.normalize("NFKC").replace(/\s+/g, " ").trim();
  const before = /(?:\bBs\.?|\bBOB\b|bolivianos?)\s*(\d{1,9}(?:[.,]\d{1,2})?)/i.exec(normalized)?.[1];
  const after = /(\d{1,9}(?:[.,]\d{1,2})?)\s*(?:\bBs\.?|\bBOB\b|bolivianos?)/i.exec(normalized)?.[1];
  const amount = Number((before || after || "").replace(",", "."));
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function validatedProductRequest(
  request: StoreAgentProductRequest,
  instruction: string,
  document: StoreSiteDocument,
  allowedMediaUrls: ReadonlySet<string>,
): StoreAgentProductRequest {
  if (!request || !/^[a-z][a-z0-9-]{0,47}$/.test(request.key)) {
    throw new BadRequestException("Yapi no pudo asignar una clave segura al producto nuevo.");
  }
  if (!evidenceAppearsInInstruction(instruction, request.nameEvidence)) {
    throw new BadRequestException("Indica el nombre exacto del producto para que Yapi no tenga que inventarlo.");
  }
  const name = request.nameEvidence.trim();
  if (!name || name.length > 120 || !SAFE_TEXT_PATTERN.test(name)) throw new BadRequestException("El nombre del producto no es válido.");
  const amount = evidenceAppearsInInstruction(instruction, request.amountEvidence)
    ? bobAmountFromEvidence(request.amountEvidence)
    : null;
  if (amount === null || amount !== request.amount) {
    throw new BadRequestException("Indica el precio explícitamente en BOB o Bs. para crear el producto sin adivinarlo.");
  }
  let description = "";
  if (request.descriptionEvidence) {
    if (!evidenceAppearsInInstruction(instruction, request.descriptionEvidence)) {
      throw new BadRequestException("La descripción propuesta no aparece en tu instrucción.");
    }
    description = request.descriptionEvidence.trim();
  }
  if (description.length > 500 || !SAFE_TEXT_PATTERN.test(description)) throw new BadRequestException("La descripción del producto no es válida.");
  let stock = -1;
  if (request.stockEvidence) {
    if (!evidenceAppearsInInstruction(instruction, request.stockEvidence)) {
      throw new BadRequestException("El stock propuesto no aparece en tu instrucción.");
    }
    const stockMatch = /\d{1,7}/.exec(request.stockEvidence);
    const parsedStock = stockMatch ? Number(stockMatch[0]) : NaN;
    if (!Number.isInteger(parsedStock) || parsedStock < 0 || parsedStock > 1_000_000 || parsedStock !== request.stock) {
      throw new BadRequestException("El stock indicado para el producto no es válido.");
    }
    stock = parsedStock;
  } else if (request.stock !== -1) {
    throw new BadRequestException("Yapi no puede inventar el stock de un producto.");
  }
  if (request.categoryId) throw new BadRequestException("Yapi no puede inventar una categoría; asígnala después desde Productos.");
  const imageUrls = [...new Set(Array.isArray(request.imageUrls) ? request.imageUrls : [])].slice(0, 10);
  if (imageUrls.some((url) => !allowedMediaUrls.has(url))) {
    throw new BadRequestException("Todas las fotos del producto deben pertenecer a este comercio.");
  }
  const knownPageIds = new Set(["", ...(document.pages ?? []).map((page) => page.id)]);
  const pageIds = [...new Set(Array.isArray(request.pageIds) ? request.pageIds : [])].slice(0, 6);
  if (!pageIds.length || pageIds.some((pageId) => !knownPageIds.has(pageId))) {
    throw new BadRequestException("Elige al menos una página existente para colocar el producto.");
  }
  return {
    ...request,
    name,
    nameEvidence: name,
    description,
    descriptionEvidence: description,
    amount,
    currency: "BOB",
    stock,
    imageUrls,
    pageIds,
  };
}

function productCatalogOperations(
  document: StoreSiteDocument,
  products: Array<{ id: string; pageIds: string[] }>,
): StoreAgentEditorOperation[] {
  const operations: StoreAgentEditorOperation[] = [];
  const usedSectionIds = new Set(document.sections.map((section) => section.id));
  const productsByPage = new Map<string, string[]>();
  for (const product of products) {
    for (const pageId of product.pageIds) {
      const ids = productsByPage.get(pageId) ?? [];
      ids.push(product.id);
      productsByPage.set(pageId, ids);
    }
  }
  for (const [pageId, productIds] of productsByPage) {
    const existing = document.sections.find((section) => section.kind === "catalog" && (section.pageId ?? "") === pageId);
    let sectionId = existing?.id ?? `catalog-${pageId || "home"}`.slice(0, 48);
    for (let suffix = 2; !existing && usedSectionIds.has(sectionId); suffix += 1) sectionId = `catalog-${pageId || "home"}-${suffix}`.slice(0, 48);
    if (!existing) {
      usedSectionIds.add(sectionId);
      operations.push({ action: "add", entity: "section", targetId: sectionId, parentId: pageId, field: "catalog", value: "Productos", secondaryValue: "", position: -1 });
    }
    operations.push({
      action: "set",
      entity: "section",
      targetId: sectionId,
      parentId: "",
      field: "productIds",
      value: [...new Set([...(existing?.productIds ?? []), ...productIds])].join(","),
      secondaryValue: "",
      position: -1,
    });
  }
  return operations;
}

function socialHref(platform: StoreAgentRevisionPlan["socialPlatform"], handle: string): string {
  const username = handle.replace(/^@/, "");
  if (!username) return "";
  if (platform === "instagram") return `https://instagram.com/${username}`;
  if (platform === "tiktok") return `https://tiktok.com/@${username}`;
  if (platform === "facebook") return `https://facebook.com/${username}`;
  if (platform === "x") return `https://x.com/${username}`;
  if (platform === "youtube") return `https://youtube.com/@${username}`;
  return "";
}

function footerWithSocialHandle(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteFooter {
  const footer: StoreSiteFooter = document.footer
    ? structuredClone(document.footer)
    : {
        enabled: true,
        brandDescription: "",
        columns: [],
        copyright: "",
        badge: "",
      };
  footer.enabled = true;
  if (!plan.socialHandle) return footer;
  let column = footer.columns.find((candidate) => /(redes|social|siguenos|síguenos)/i.test(`${candidate.id} ${candidate.title}`));
  if (!column && footer.columns.length < 4) {
    column = { id: "social", title: "Redes", items: [] };
    footer.columns.push(column);
  }
  column ??= footer.columns.find((candidate) => candidate.items.length < 8);
  if (!column) throw new BadRequestException("El pie de página ya alcanzó el máximo de enlaces. Quita uno antes de agregar otra red.");
  const href = socialHref(plan.socialPlatform, plan.socialHandle);
  const duplicate = column.items.find((item) => item.label.toLowerCase() === plan.socialHandle.toLowerCase());
  if (duplicate) {
    if (href) duplicate.href = href;
    return footer;
  }
  const baseId = `social-${plan.socialHandle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`.slice(0, 48);
  const existingIds = new Set(footer.columns.flatMap((candidate) => candidate.items.map((item) => item.id)));
  let id = baseId || "social-handle";
  for (let suffix = 2; existingIds.has(id); suffix += 1) id = `${baseId.slice(0, 44)}-${suffix}`;
  column.items.push({ id, label: plan.socialHandle, href });
  return footer;
}

function normalizedFooterLinkLabel(value: string): string {
  return normalizedAgentInstruction(value).replace(/\s+/g, " ").trim();
}

function footerWithUpdatedLink(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteFooter {
  const footer = document.footer ? structuredClone(document.footer) : null;
  if (!footer) throw new BadRequestException("Esta tienda todavía no tiene un pie de página editable.");
  if (!/^https:\/\/[^\s]+$/i.test(plan.linkUrl) || plan.linkUrl.length > 500) {
    throw new BadRequestException("Indica un enlace HTTPS válido para actualizar el pie de página.");
  }
  const requestedLabel = normalizedFooterLinkLabel(plan.linkLabel);
  const allItems = footer.columns.flatMap((column) => column.items);
  const matchingItems = requestedLabel
    ? allItems.filter((item) => normalizedFooterLinkLabel(item.label) === requestedLabel)
    : allItems.filter((item) => !item.href.trim());
  if (matchingItems.length === 0) {
    throw new BadRequestException(plan.linkLabel
      ? `No encontré un enlace llamado “${plan.linkLabel}” en el pie de página.`
      : "Dime el texto del enlace del pie de página que quieres actualizar.");
  }
  if (matchingItems.length > 1) {
    throw new BadRequestException(`Hay más de un enlace llamado “${plan.linkLabel || "Nuevo enlace"}”. Cambia uno de los nombres para poder identificarlo.`);
  }
  matchingItems[0].href = plan.linkUrl;
  return footer;
}

function applyAgentRevisionPlan(document: StoreSiteDocument, plan: StoreAgentRevisionPlan): StoreSiteDocument {
  if (plan.target === "unsupported" || plan.action === "unsupported") {
    throw new BadRequestException("Dime qué quieres cambiar —por ejemplo ‘cambia el título de la portada a …’, ‘mueve la galería arriba’ o ‘haz la historia más cálida’— para preparar una variante segura.");
  }
  if (plan.target === "footer") {
    return {
      ...structuredClone(document),
      direction: `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120),
      footer: plan.action === "set-link"
        ? footerWithUpdatedLink(document, plan)
        : footerWithSocialHandle(document, plan),
    };
  }
  const openingId = document.sections.find((section) => !section.pageId && (!plan.preserveCatalog || section.kind !== "catalog"))?.id
    ?? document.sections[0]?.id;
  const matchesTarget = (section: StoreSiteDocument["sections"][number]) => {
    if (plan.target === "site") return plan.preserveCatalog ? section.kind !== "catalog" : true;
    if (plan.target === "opening") return section.id === openingId;
    return section.kind === plan.target;
  };
  const nextDocument = structuredClone(document);
  if (plan.action === "move-up" || plan.action === "move-down") {
    const fromIndex = nextDocument.sections.findIndex(matchesTarget);
    if (fromIndex < 0) throw new BadRequestException("La sección indicada no existe en esta tienda.");
    const pageId = nextDocument.sections[fromIndex].pageId;
    const direction = plan.action === "move-up" ? -1 : 1;
    let toIndex = fromIndex + direction;
    while (toIndex >= 0 && toIndex < nextDocument.sections.length && nextDocument.sections[toIndex].pageId !== pageId) toIndex += direction;
    if (toIndex < 0 || toIndex >= nextDocument.sections.length) throw new BadRequestException("Esa sección ya está en el extremo solicitado.");
    [nextDocument.sections[fromIndex], nextDocument.sections[toIndex]] = [nextDocument.sections[toIndex], nextDocument.sections[fromIndex]];
    nextDocument.direction = `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120);
    return nextDocument;
  }
  const tint = plan.tone === "warmer" ? "#f1ad62"
    : plan.tone === "cooler" ? "#9fc7d4"
      : plan.tone === "bolder" ? "#e58a32"
        : plan.tone === "editorial" ? "#cbb69a"
          : "#eee9df";
  const amount = plan.tone === "bolder" ? 0.42 : plan.tone === "unchanged" ? 0 : 0.28;
  return {
    ...nextDocument,
    direction: `${document.direction || "Dirección propia"} · ${plan.summary}`.slice(0, 120),
    sections: nextDocument.sections.map((section) => {
      if (!matchesTarget(section)) return structuredClone(section);
      const backgroundColor = plan.action === "set-color" && /^#[0-9a-f]{6}$/i.test(plan.color)
        ? plan.color
        : plan.tone === "minimal"
        ? document.theme.pageBackground
        : blendHex(section.backgroundColor, tint, amount);
      return {
        ...section,
        backgroundColor,
        textColor: readableText(backgroundColor, section.textColor),
        ...(plan.action === "replace-title" ? { title: plan.value.slice(0, 120) } : {}),
        ...(plan.action === "replace-body" ? { body: plan.value.slice(0, 600) } : {}),
        ...(plan.action === "replace-cta" ? { ctaLabel: plan.value.slice(0, 40) } : {}),
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
    allowed.motionExperience = "clarity-marquee";
  }
  if (Array.isArray(allowed.animations)) {
    const supportedAnimations = allowed.animations.filter((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
      return MOTION_EXPERIENCES.includes((entry as Record<string, unknown>).type as (typeof MOTION_EXPERIENCES)[number]);
    });
    allowed.animations = supportedAnimations;
    allowed.motionDuoEnabled = supportedAnimations.length > 0;
  }
  if (allowed.siteDocument && typeof allowed.siteDocument === "object" && !Array.isArray(allowed.siteDocument)) {
    const document = structuredClone(allowed.siteDocument) as Record<string, any>;
    if (document.experience && typeof document.experience === "object" && !TEXT_MOTION_EXPERIENCES.has(document.experience.type)) {
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
    private readonly paymentLinks: PaymentLinksService,
  ) {}

  canPlanStorefrontOperations(): boolean {
    return Boolean(this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey"));
  }

  private canGenerateStorefrontImages(): boolean {
    return Boolean(
      this.config.get<boolean>("app.openAi.enabled")
      && this.config.get<string>("app.openAi.apiKey")
      && this.config.get<string>("app.openAi.imageModel"),
    );
  }

  private async generateStorefrontImage(
    merchantId: string,
    storeId: string,
    storeName: string,
    request: Pick<StoreAgentImageRequest, "prompt" | "aspectRatio">,
    context = "",
    allowProductRepresentation = false,
  ): Promise<MediaAsset> {
    if (!this.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("La generación de imágenes de Yapi no está configurada en este momento.");
    }
    const prompt = [
      `Crea una fotografía editorial original para el sitio web de ${storeName}.`,
      request.prompt,
      context,
      allowProductRepresentation
        ? "Representa únicamente el producto descrito literalmente por el comercio. No inventes materiales, ingredientes, funciones, empaque, texto, logotipo, beneficios ni afirmaciones que no estén en la descripción."
        : "Debe funcionar como atmósfera visual de marca y dejar espacio útil para texto de interfaz.",
      allowProductRepresentation
        ? "Fotografía de producto limpia y compatible con una galería comercial. Sin marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua."
        : "No representes un producto específico ni inventes características del negocio. Sin logotipos, marcas ajenas, texto legible, interfaz, precios, descuentos, certificaciones, sellos ni marcas de agua.",
    ].filter(Boolean).join("\n");
    const size = request.aspectRatio === "portrait" ? "1024x1536" : request.aspectRatio === "square" ? "1024x1024" : "1536x1024";
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.imageModel") ?? "gpt-image-2",
          prompt,
          n: 1,
          size,
          quality: "medium",
          output_format: "jpeg",
          output_compression: 86,
          moderation: "auto",
        }),
        signal: AbortSignal.timeout(150_000),
      });
    } catch (error) {
      throw new ServiceUnavailableException(`No pudimos generar la imagen en este momento: ${(error as Error).message}`);
    }
    const body = await response.json() as { data?: Array<{ b64_json?: string }>; error?: { code?: string; message?: string } };
    if (!response.ok) {
      if (body.error?.code === "moderation_blocked") {
        throw new BadRequestException("La imagen solicitada no pudo generarse de forma segura. Describe otra escena editorial sin personas identificables, logos ni afirmaciones.");
      }
      throw new BadGatewayException(body.error?.message || "El proveedor de imágenes no devolvió una imagen utilizable.");
    }
    const encoded = body.data?.[0]?.b64_json;
    if (!encoded) throw new BadGatewayException("El proveedor de imágenes no devolvió una imagen utilizable.");
    const buffer = Buffer.from(encoded, "base64");
    if (!buffer.length || buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadGatewayException("La imagen generada no tiene un tamaño compatible con la biblioteca de la tienda.");
    }
    const stored = await this.uploads.saveBuffer(buffer, "image/jpeg");
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          merchantId,
          storeId,
          url: stored.url,
          storageKey: stored.filename,
          kind: "AI_DERIVED",
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
        },
      });
    } catch (error) {
      await this.uploads.deleteFiles([stored.url]);
      throw error;
    }
  }

  async list(merchantId: string, storeId: string) {
    const store = await this.ownedStore(merchantId, storeId);
    const [proposals, versions, templates] = await Promise.all([
      this.prisma.storeVisualProposal.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualVersion.findMany({ where: { storeId }, orderBy: { createdAt: "desc" }, take: 12 }),
      this.prisma.storeVisualTemplate.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" }, take: 24 }),
    ]);
    return {
      proposals: proposals.map((proposal) => ({ ...proposal, config: stableGeneratedProposalConfig(proposal.config) })),
      versions,
      templates,
      lockedSectionIds: storedSectionLocks(store.visualSectionLocks),
    };
  }

  private async agentRevisionPlan(
    instruction: string,
    document: StoreSiteDocument,
    conversationContext: string[],
    allowedProductIds: ReadonlySet<string>,
    allowedMediaUrls: ReadonlySet<string>,
    sourceConfig: Record<string, unknown>,
    attachedAssets: Array<Pick<MediaAsset, "url" | "mimeType">> = [],
    selection?: StoreAgentSelectionDto,
  ): Promise<StoreAgentRevisionPlan> {
    const fallback = localAgentRevisionPlan(instruction);
    if (!this.config.get<boolean>("app.openAi.enabled") || !this.config.get<string>("app.openAi.apiKey")) return fallback;
    const schema = {
      type: "object",
      additionalProperties: false,
      required: ["target", "tone", "action", "value", "color", "preserveCatalog", "socialHandle", "socialPlatform", "linkLabel", "linkUrl", "operations", "imageRequests", "productRequests", "summary"],
      properties: {
        target: { type: "string", enum: ["opening", "catalog", "story", "gallery", "contact", "footer", "site", "unsupported"] },
        tone: { type: "string", enum: ["warmer", "cooler", "bolder", "quieter", "minimal", "editorial", "unchanged"] },
        action: { type: "string", enum: ["restyle", "replace-title", "replace-body", "replace-cta", "set-color", "move-up", "move-down", "social-link", "set-link", "unsupported"] },
        value: { type: "string", maxLength: 600 },
        color: { type: "string", maxLength: 7, pattern: "^$|^#[0-9A-Fa-f]{6}$" },
        preserveCatalog: { type: "boolean" },
        socialHandle: { type: "string", maxLength: 31, pattern: "^$|^@[A-Za-z0-9._-]{1,30}$" },
        socialPlatform: { type: "string", enum: ["instagram", "tiktok", "facebook", "x", "youtube", "unknown"] },
        linkLabel: { type: "string", maxLength: 100 },
        linkUrl: { type: "string", maxLength: 500, pattern: "^$|^https://[^\\s]+$" },
        operations: {
          type: "array",
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "entity", "targetId", "parentId", "field", "value", "secondaryValue", "position"],
            properties: {
              action: { type: "string", enum: ["set", "add", "remove", "move", "duplicate"] },
              entity: { type: "string", enum: [...STORE_AGENT_EDITOR_ENTITIES] },
              targetId: { type: "string", maxLength: 120 },
              parentId: { type: "string", maxLength: 120 },
              field: { type: "string", maxLength: 80 },
              value: { type: "string", maxLength: 1200 },
              secondaryValue: { type: "string", maxLength: 600 },
              position: { type: "integer", minimum: -1, maximum: 99 },
            },
          },
        },
        imageRequests: {
          type: "array",
          maxItems: 2,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["action", "entity", "targetId", "parentId", "field", "position", "aspectRatio", "prompt"],
            properties: {
              action: { type: "string", enum: ["add", "set"] },
              entity: { type: "string", enum: ["section-media", "section-item", "section-block", "visual-setting", "hero-slide", "editorial-image", "animation-media", "new-product"] },
              targetId: { type: "string", maxLength: 120 },
              parentId: { type: "string", maxLength: 120 },
              field: { type: "string", maxLength: 80 },
              position: { type: "integer", minimum: -1, maximum: 99 },
              aspectRatio: { type: "string", enum: ["landscape", "portrait", "square"] },
              prompt: { type: "string", minLength: 12, maxLength: 800 },
            },
          },
        },
        productRequests: {
          type: "array",
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "name", "nameEvidence", "description", "descriptionEvidence", "amount", "amountEvidence", "currency", "stock", "stockEvidence", "categoryId", "imageUrls", "pageIds"],
            properties: {
              key: { type: "string", pattern: "^[a-z][a-z0-9-]{0,47}$" },
              name: { type: "string", minLength: 1, maxLength: 120 },
              nameEvidence: { type: "string", minLength: 1, maxLength: 120 },
              description: { type: "string", maxLength: 500 },
              descriptionEvidence: { type: "string", maxLength: 500 },
              amount: { type: "integer", minimum: 0, maximum: 99999999999 },
              amountEvidence: { type: "string", minLength: 1, maxLength: 60 },
              currency: { type: "string", enum: ["BOB"] },
              stock: { type: "integer", minimum: -1, maximum: 1000000 },
              stockEvidence: { type: "string", maxLength: 80 },
              categoryId: { type: "string", enum: [""] },
              imageUrls: { type: "array", maxItems: 10, items: { type: "string", maxLength: 240 } },
              pageIds: { type: "array", minItems: 1, maxItems: 6, items: { type: "string", maxLength: 48 } },
            },
          },
        },
        summary: { type: "string", minLength: 1, maxLength: 160 },
      },
    };
    const sections = document.sections.map((section, index) => `${index === 0 ? "opening " : ""}${section.id}:${section.kind}:${section.title}`).join("\n");
    const footerLinks = document.footer?.columns.flatMap((column) => column.items.map((item) => `${column.title}:${item.label}:${item.href || "sin enlace"}`)).join("\n") || "Sin enlaces editables.";
    const attachedImageUrls = attachedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).map((asset) => asset.url);
    const prompt = [
      "Interpreta una instrucción de edición para una tienda. Devuelve sólo un plan JSON acotado; no escribas HTML, CSS ni código.",
      "La INSTRUCCIÓN ACTUAL tiene prioridad absoluta. El contexto reciente sólo sirve para resolver referencias como ‘esa foto’ o ‘la sección anterior’; nunca continúes cambios antiguos que la instrucción actual no repita.",
      "Cambia únicamente los elementos y campos nombrados en la instrucción actual. Todo campo, sección, orden, estilo y animación no mencionado debe quedar exactamente igual. Las palabras ‘solo’, ‘solamente’, ‘únicamente’, ‘just’ y ‘only’ convierten este límite en una restricción estricta.",
      "Si la instrucción pide foto y texto de una sección, limita operations a los medios y campos de texto de esa sección. No cambies su layout, colores, movimiento, otras secciones ni animaciones.",
      "Las referencias adjuntas en este mensaje son entradas visuales reales y autorizadas. Examínalas, respeta su orden y usa exactamente sus URLs permitidas cuando la instrucción diga usar, poner, cambiar o reemplazar una foto. No respondas que falta una imagen cuando esta lista no esté vacía.",
      "El plan puede ejecutar cualquier operación del catálogo del editor sobre el borrador privado, pero nunca cambiar precios, inventario, pagos, checkout, KYC, publicación ni datos fuera del sitio.",
      "Usa replace-title, replace-body o replace-cta sólo cuando el comercio haya dado el texto exacto; cópialo en value y nunca inventes contenido. Usa set-color sólo con un hex explícito en color.",
      "Usa move-up o move-down para mover una sección exactamente una posición dentro de su misma página.",
      "Usa target footer para redes sociales o pie de página. Copia un @usuario en socialHandle. No inventes una plataforma: usa unknown cuando no esté nombrada.",
      "Usa set-link sólo para asignar una URL HTTPS explícita a un enlace existente del pie de página. Copia su texto visible exacto en linkLabel y la URL en linkUrl; no inventes ninguno.",
      "Para cualquier edición concreta usa operations y sigue exactamente el catálogo. Puedes combinar varias operaciones cuando el comercio pida varios cambios. Los campos legacy anteriores sirven para compatibilidad y resumen.",
      "Usa imageRequests sólo cuando el comercio pida explícitamente generar una imagen nueva. Máximo 2. No pongas URLs de relleno en operations: señala la entidad y el ID exactos donde irá la imagen; el sistema generará la URL y construirá la operación.",
      "Salvo cuando entity=new-product, las imágenes generadas sólo pueden ser editoriales o ambientales para el sitio. Nunca representes un producto específico, logo, texto legible, precio, descuento, certificación ni afirmación comercial. No inventes hechos visuales sobre el negocio.",
      "Usa productRequests sólo cuando el comercio pida explícitamente crear productos. Máximo 6. Copia literalmente el nombre en nameEvidence, el precio completo con Bs./BOB/bolivianos en amountEvidence y cualquier descripción en descriptionEvidence; esos fragmentos deben existir en la instrucción. amount usa centavos y currency siempre BOB. Si no se indicó stock usa stock=-1 y stockEvidence vacío. Nunca inventes precio, descripción, stock, variantes, extras, descuento, categoría ni datos fiscales.",
      "Cada productRequest debe indicar una o más pageIds existentes; usa el string vacío para Inicio. imageUrls admite hasta 10 URLs del inventario permitido y conserva el orden: la primera será portada. Para generar hasta dos fotos nuevas del producto usa imageRequests con entity=new-product, action=add, targetId igual a productRequest.key y field=imageUrl. Sólo hazlo si el comercio pidió explícitamente generar fotos del producto y describió su apariencia con suficiente precisión.",
      "Usa target unsupported cuando la instrucción no identifique una zona o un cambio visual seguro; nunca uses site como comodín.",
      "preserveCatalog debe ser true cuando el comercio pida mantener, conservar o no tocar el catálogo o los productos.",
      `Secciones disponibles:\n${sections}`,
      `Enlaces del pie de página:\n${footerLinks}`,
      `Catálogo completo de operaciones:\n${STORE_AGENT_EDITOR_CATALOG}`,
      `Inventario editable actual (fuente de verdad para IDs y valores):\n${storeAgentEditableInventory(document, allowedProductIds, allowedMediaUrls, sourceConfig)}`,
      attachedImageUrls.length
        ? `Referencias adjuntas en este mensaje, en orden:\n${attachedImageUrls.map((url, index) => `${index + 1}. ${url}`).join("\n")}`
        : "Este mensaje no incluye referencias visuales nuevas.",
      conversationContext.length ? `Contexto reciente:\n${conversationContext.slice(-6).join("\n")}` : "Sin contexto anterior.",
      `Instrucción actual:\n${instruction}`,
      selection ? `Elemento seleccionado validado: ${JSON.stringify(selection)}. Si el pedido dice este/esta/ese/this, cambia únicamente este campo mediante operaciones set. No cambies el resto del sitio.` : "Sin elemento seleccionado.",
    ].join("\n\n");
    try {
      const attachedInputs = (await Promise.all(attachedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).slice(0, 6).map(async (asset, index) => {
        const filename = asset.url.split("/").pop();
        const bytes = filename ? await this.uploads.getBuffer(filename) : null;
        return bytes ? [
          { type: "input_text" as const, text: `Referencia adjunta ${index + 1}: ${asset.url}` },
          { type: "input_image" as const, image_url: `data:${asset.mimeType};base64,${bytes.toString("base64")}`, detail: "high" as const },
        ] : [];
      }))).flat();
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.get<string>("app.openAi.apiKey")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol",
          input: [{ role: "user", content: [{ type: "input_text", text: prompt }, ...attachedInputs] }],
          text: { format: { type: "json_schema", name: "store_agent_revision_plan", strict: true, schema } },
          reasoning: { effort: "medium" },
          max_output_tokens: 2400,
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
        target: fallback.target !== "site" && fallback.target !== "unsupported" ? fallback.target : plan.target,
        tone: fallback.tone !== "unchanged" ? fallback.tone : plan.tone,
        action: fallback.action !== "unsupported" ? fallback.action : plan.action,
        value: fallback.value || String(plan.value || "").slice(0, 600),
        color: fallback.color || (/^#[0-9a-f]{6}$/i.test(plan.color) ? plan.color.toLowerCase() : ""),
        preserveCatalog: fallback.preserveCatalog || plan.preserveCatalog,
        socialHandle: fallback.socialHandle || (/^@[A-Za-z0-9._-]{1,30}$/.test(plan.socialHandle) ? plan.socialHandle : ""),
        socialPlatform: fallback.target === "footer"
          ? fallback.socialPlatform
          : fallback.socialPlatform !== "unknown"
            ? fallback.socialPlatform
            : plan.socialPlatform,
        linkLabel: fallback.linkLabel || String(plan.linkLabel || "").slice(0, 100),
        linkUrl: fallback.linkUrl || (/^https:\/\/[^\s]+$/i.test(plan.linkUrl) ? plan.linkUrl.slice(0, 500) : ""),
        operations: Array.isArray(plan.operations) ? plan.operations : fallback.operations,
        imageRequests: Array.isArray(plan.imageRequests) ? plan.imageRequests : [],
        productRequests: Array.isArray(plan.productRequests) ? plan.productRequests : [],
      };
      const targetExists = ["site", "opening", "footer", "unsupported"].includes(guardedPlan.target)
        || document.sections.some((section) => section.kind === guardedPlan.target);
      return targetExists ? guardedPlan : fallback;
    } catch (error) {
      this.logger.warn(`Agent revision planning fell back to bounded local intent: ${(error as Error).message}`);
      return fallback;
    }
  }

  async revise(
    merchantId: string,
    storeId: string,
    proposalId: string | null,
    instruction: string,
    conversationContext: string[] = [],
    requestedAssetUrls: string[] = [],
    editorContext?: { revision: number; selection?: StoreAgentSelectionDto },
  ) {
    const publishedStore = await this.ownedStore(merchantId, storeId);
    if (editorContext) assertWebsiteRevision(publishedStore, editorContext.revision);
    const store = websiteEditorStore(publishedStore);
    const source = proposalId
      ? await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } })
      : null;
    if (proposalId && !source) throw new NotFoundException("Visual proposal not found");
    if (source && source.baseWebsiteRevision !== (store.websiteRevision ?? 0)) {
      throw new ConflictException("Esta propuesta parte de un borrador anterior. Abre el borrador actual y vuelve a pedir el cambio.");
    }
    const sourceConfig = source?.config && typeof source.config === "object" && !Array.isArray(source.config)
      ? source.config as Record<string, unknown>
      : snapshot(store) as Record<string, unknown>;
    const sourceDocument = storedSiteDocument(sourceConfig.siteDocument);
    if (!sourceDocument) {
      throw new BadRequestException(proposalId
        ? "La propuesta ya no contiene un documento visual editable"
        : "La tienda actual todavía no tiene un sitio estructurado que el agente pueda editar sin regenerarlo. Crea una dirección visual primero.");
    }
    const selection = editorContext?.selection;
    const selected = selection ? resolveStoreAgentSelection(selection, sourceDocument, sourceConfig) : null;
    const useSelection = selected && instructionUsesSelection(instruction);
    const assetUrls = [...new Set(requestedAssetUrls)];
    const ownedAssets = assetUrls.length
      ? await this.prisma.mediaAsset.findMany({
          where: { merchantId, url: { in: assetUrls }, mimeType: { in: ["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"] } },
          select: { url: true, mimeType: true },
        })
      : [];
    if (ownedAssets.length !== assetUrls.length) throw new BadRequestException("Una o más referencias visuales no pertenecen a este comercio.");
    const orderedOwnedAssets = assetUrls.flatMap((url) => ownedAssets.find((asset) => asset.url === url) ?? []);
    const allowedProductIds = new Set([
      ...sourceDocument.merchandising.featuredProductIds,
      ...sourceDocument.merchandising.productOrderIds,
      ...sourceDocument.sections.flatMap((section) => section.productIds ?? []),
      ...(sourceDocument.merchandising.collections ?? []).flatMap((collection) => collection.productIds),
    ]);
    const allowedMediaUrls = new Set(orderedOwnedAssets.map((asset) => asset.url));
    let plan = await this.agentRevisionPlan(instruction, sourceDocument, conversationContext, allowedProductIds, allowedMediaUrls, sourceConfig, orderedOwnedAssets, selection);
    assertStoreAgentOperationBudget(plan.operations.length);
    if (plan.imageRequests.length > 2 || plan.productRequests.length > 6) {
      throw new BadRequestException("Este pedido supera el límite de 2 imágenes nuevas o 6 productos por cambio. Divídelo en dos pedidos; todavía no se creó nada.");
    }
    if (!useSelection) plan = withDeterministicAttachedImage(
      instruction,
      sourceDocument,
      plan,
      orderedOwnedAssets.filter((asset) => typeof asset.mimeType === "string" && asset.mimeType.startsWith("image/")).map((asset) => asset.url),
    );
    if (!useSelection) plan = withDeterministicGeneratedOpeningImage(instruction, sourceDocument, plan);
    if (useSelection && selected) {
      // Fill bounded local plans only; a model plan that leaves the selected
      // target is rejected below, never silently rewritten or partially used.
      if (!plan.operations.length && !plan.imageRequests.length && !plan.productRequests.length) {
        const quoted = /["“«]([^"”»]+)["”»]/.exec(instruction)?.[1];
        const ordinal = /\b(segunda|segundo|second)\b/i.test(instruction) ? 1 : 0;
        const imageUrl = orderedOwnedAssets.filter((asset) => asset.mimeType.startsWith("image/"))[ordinal]?.url;
        if (selected.image && imageUrl && instructionExplicitlyUsesAttachedImage(instruction)) plan.operations = [selectedOperation(selected.selection, imageUrl)];
        else if (!selected.image && quoted) plan.operations = [selectedOperation(selected.selection, quoted)];
        else if (selected.image && /(?:genera|crea|generate|create).{0,40}(?:imagen|foto|image|photo)/i.test(instruction)) {
          const operation = selectedOperation(selected.selection, "");
          plan.imageRequests = [{ ...operation, entity: operation.entity as StoreAgentImageRequest["entity"], action: "set", aspectRatio: "landscape", prompt: instruction }];
        }
      }
      if (plan.productRequests.length) throw new BadRequestException("Seleccionaste un elemento visual. Pide la creación de productos en un pedido separado.");
      assertSelectedOperations(selected.selection, [...plan.operations, ...plan.imageRequests]);
      if (plan.operations.length && !plan.imageRequests.length && plan.operations.every((operation) => operation.value === selected.value)) {
        throw new BadRequestException("Ese elemento ya tiene ese contenido. No hay cambios para preparar.");
      }
      // Selection authorizes content in an animation, not changes to its motion.
      assertAgentRevisionScope(instruction, sourceDocument, { ...plan, operations: plan.operations.filter((operation) => !["animation", "animation-media"].includes(operation.entity)) }, true);
    } else assertAgentRevisionScope(instruction, sourceDocument, plan);
    const productRequests = plan.productRequests.map((request) => validatedProductRequest(request, instruction, sourceDocument, allowedMediaUrls));
    const productKeys = new Set(productRequests.map((request) => request.key));
    if (productKeys.size !== productRequests.length) throw new BadRequestException("Cada producto nuevo debe tener una clave distinta.");
    if (storeAgentInstructionLooksLikeProductCreation(instruction) && !productRequests.length) {
      throw new BadRequestException("Para crear un producto, indica su nombre exacto, precio en Bs. o BOB y la página donde quieres mostrarlo.");
    }
    const imageRequests = plan.imageRequests;
    const productImageInstruction = /(?:genera|generar|crea|crear).{0,40}(?:imagen|imagenes|foto|fotos)/.test(normalizedAgentInstruction(instruction));
    imageRequests.forEach((request) => {
      if (request.entity !== "new-product") {
        generatedImageOperation(request, "/v1/uploads/pending-generated-image.jpg");
        return;
      }
      if (request.action !== "add" || request.field !== "imageUrl" || !productKeys.has(request.targetId)) {
        throw new BadRequestException("Yapi intentó generar una foto para un producto que no forma parte de esta solicitud.");
      }
      if (!productImageInstruction) {
        throw new BadRequestException("Yapi sólo puede generar fotos de producto cuando lo pides explícitamente.");
      }
    });
    productRequests.forEach((product) => {
      const generatedPhotoCount = imageRequests.filter((request) => request.entity === "new-product" && request.targetId === product.key).length;
      if (product.imageUrls.length + generatedPhotoCount > 10) {
        throw new BadRequestException(`El producto “${product.name}” supera el máximo de 10 fotos. Quita algunas antes de generar nuevas.`);
      }
    });
    // Replay the complete plan against private stand-ins before any paid image
    // call or product creation. Both validation and the budget include the
    // operations that the server will add for generated media and placement.
    const preflightProducts = productRequests.map((request, index) => ({ id: `pending-yapi-product-${index}`, pageIds: request.pageIds }));
    const preflightImageUrls = imageRequests.map((_, index) => `/v1/uploads/pending-yapi-image-${index}.jpg`);
    const preflightOperations = [
      ...plan.operations,
      ...imageRequests.flatMap((request, index) => request.entity === "new-product" ? [] : [generatedImageOperation(request, preflightImageUrls[index])]),
      ...productCatalogOperations(sourceDocument, preflightProducts),
    ];
    assertStoreAgentOperationBudget(preflightOperations.length);
    const preflightOptions = {
      allowedProductIds: new Set([...allowedProductIds, ...preflightProducts.map((product) => product.id)]),
      allowedMediaUrls: new Set([...allowedMediaUrls, ...preflightImageUrls]),
    };
    const preflightDocumentOperations = preflightOperations.filter((operation) => !storeAgentOperationIsProposalVisual(operation));
    const preflightVisualOperations = preflightOperations.filter(storeAgentOperationIsProposalVisual);
    const preflightDocument = preflightDocumentOperations.length
      ? applyStoreAgentEditorOperations(sourceDocument, preflightDocumentOperations, preflightOptions).document
      : sourceDocument;
    if (preflightVisualOperations.length) {
      applyStoreAgentProposalVisualOperations({ ...sourceConfig, siteDocument: siteDocumentJson(preflightDocument) }, preflightVisualOperations, preflightOptions);
    }
    if (imageRequests.length && !this.canGenerateStorefrontImages()) {
      throw new ServiceUnavailableException("Yapi entendió dónde debe ir la imagen, pero la generación de imágenes no está configurada en este momento.");
    }
    const generatedAssets = await Promise.all(imageRequests.map((request) => this.generateStorefrontImage(
      merchantId,
      storeId,
      store.name,
      request,
      request.entity === "new-product"
        ? `La imagen será una foto del producto ${productRequests.find((product) => product.key === request.targetId)?.name ?? "descrito"} y debe integrarse con la paleta visual de la tienda.`
        : `La imagen se usará en ${request.entity}; conserva la paleta y el lenguaje visual del documento actual.`,
      request.entity === "new-product",
    )));
    generatedAssets.forEach((asset) => allowedMediaUrls.add(asset.url));
    imageRequests.forEach((request, index) => {
      if (request.entity !== "new-product") return;
      const product = productRequests.find((candidate) => candidate.key === request.targetId)!;
      if (!product.imageUrls.includes(generatedAssets[index].url) && product.imageUrls.length < 10) product.imageUrls.push(generatedAssets[index].url);
    });
    const generatedOperations = imageRequests.flatMap((request, index) => request.entity === "new-product"
      ? []
      : [generatedImageOperation(request, generatedAssets[index].url)]);
    const createdProducts: Awaited<ReturnType<PaymentLinksService["create"]>>[] = [];
    try {
      for (const request of productRequests) {
        createdProducts.push(await this.paymentLinks.create(merchantId, storeId, {
          name: request.name,
          description: request.description || null,
          amount: request.amount,
          currency: "BOB",
          stock: request.stock >= 0 ? request.stock : null,
          imageUrls: request.imageUrls,
        }));
      }
      createdProducts.forEach((product) => allowedProductIds.add(product.id));
      const productOperations = productCatalogOperations(sourceDocument, createdProducts.map((product, index) => ({
        id: product.id,
        pageIds: productRequests[index].pageIds,
      })));
      const allOperations = [...plan.operations, ...generatedOperations, ...productOperations];
      assertStoreAgentOperationBudget(allOperations.length);
      const documentOperations = allOperations.filter((operation) => !storeAgentOperationIsProposalVisual(operation));
      const proposalOperations = allOperations.filter(storeAgentOperationIsProposalVisual);
      const documentResult = documentOperations.length
        ? applyStoreAgentEditorOperations(sourceDocument, documentOperations, { allowedProductIds, allowedMediaUrls })
        : null;
      const nextDocument = documentResult?.document
        ?? (allOperations.length ? sourceDocument : applyAgentRevisionPlan(sourceDocument, plan));
      // A revision is a patch, not a fresh generated direction. Rebuilding the
      // complete legacy projection here used to reset animations, galleries and
      // content order even when the merchant only edited one title or photo.
      const documentConfig = {
        ...sourceConfig,
        siteDocument: siteDocumentJson(nextDocument),
      } as Record<string, unknown>;
      const proposalResult = proposalOperations.length
        ? applyStoreAgentProposalVisualOperations(documentConfig, proposalOperations, { allowedProductIds, allowedMediaUrls })
        : null;
      const nextConfig = (proposalResult?.config ?? documentConfig) as Prisma.InputJsonObject;
      const signature = storefrontStructuralSignature(nextDocument);
      const proposal = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.storeVisualProposal.create({
          data: {
            storeId,
            title: `${source?.title ?? store.name} · ajuste`.slice(0, 120),
            baseWebsiteRevision: store.websiteRevision ?? 0,
            rationale: plan.summary,
            provider: this.config.get<boolean>("app.openAi.enabled") && this.config.get<string>("app.openAi.apiKey")
              ? `agent:${this.config.get<string>("app.openAi.designModel") ?? "gpt-5.6-sol"}`
              : "agent:bounded-local",
            config: nextConfig,
            sourceAssetUrls: [...new Set([
              ...(Array.isArray(source?.sourceAssetUrls) ? source.sourceAssetUrls.filter((url): url is string => typeof url === "string") : []),
              ...assetUrls,
            ])] as Prisma.InputJsonValue,
            generatedUrls: [...new Set([
              ...(Array.isArray(source?.generatedUrls) ? source.generatedUrls.filter((url): url is string => typeof url === "string") : []),
              ...generatedAssets.map((asset) => asset.url),
            ])] as Prisma.InputJsonValue,
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
      const operationChangedAreas = [...new Set([
        ...(documentResult?.changedAreas ?? []),
        ...(proposalResult?.changedAreas ?? []),
        ...(createdProducts.length ? ["productos"] : []),
        ...(generatedAssets.length ? ["imágenes generadas"] : []),
      ])];
      const changedAreas = operationChangedAreas.length ? operationChangedAreas : (plan.target === "opening"
        ? ["apertura"]
        : plan.target === "site"
          ? ["lenguaje visual"]
          : plan.target === "footer"
            ? ["pie de página"]
            : [plan.target]);
      const preservedAreas = [
        ...(plan.preserveCatalog || plan.target !== "catalog" ? [createdProducts.length ? "catálogo existente" : "catálogo"] : []),
        ...(plan.target === "footer" ? ["menú", "secciones", "colores y tipografía"] : []),
        ...(createdProducts.length ? ["productos, precios e inventario existentes"] : ["productos", "precios", "inventario"]),
        "checkout",
        "estado público",
      ];
      return { proposal, plan, changedAreas, preservedAreas, createdProducts };
    } catch (error) {
      if (createdProducts.length) {
        await this.prisma.paymentLink.deleteMany({ where: { storeId, id: { in: createdProducts.map((product) => product.id) } } }).catch((cleanupError: unknown) => {
          this.logger.error(`No se pudieron retirar productos de una revisión fallida: ${(cleanupError as Error).message}`);
        });
      }
      throw error;
    }
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
    try {
      return await this.generateProposals(merchantId, storeId, dto);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `Visual proposal generation failed for store ${storeId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        "No pudimos completar las propuestas por un problema temporal del compositor. Tus fotos y tu tienda siguen guardadas; vuelve a intentarlo en unos segundos.",
      );
    }
  }

  private async generateProposals(merchantId: string, storeId: string, dto: GenerateVisualProposalsDto) {
    const store = websiteEditorStore(await this.ownedStore(merchantId, storeId));
    if (dto.revision !== undefined) assertWebsiteRevision(store, dto.revision);
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

    let orderedAssets = assetUrls.flatMap((url) => assets.find((asset) => asset.url === url) ?? []);
    let generatedAssetUrls: string[] = [];
    if (!orderedAssets.some((asset) => asset.url !== store.logoUrl) && this.canGenerateStorefrontImages()) {
      const generatedAssets = await Promise.all([
        this.generateStorefrontImage(merchantId, storeId, store.name, {
          aspectRatio: "landscape",
          prompt: "Escena principal amplia, distintiva y serena, pensada como portada editorial con espacio negativo para el titular.",
        }, `Categoría: ${proposalInput.businessCategory || "comercio independiente"}. Personalidad: ${proposalInput.personality || "auténtica"}. Brief: ${proposalInput.creativeBrief || "sin brief adicional"}.`),
        this.generateStorefrontImage(merchantId, storeId, store.name, {
          aspectRatio: "portrait",
          prompt: "Detalle ambiental vertical y complementario, con luz y textura coherentes, pensado para una sección de historia o galería.",
        }, `Categoría: ${proposalInput.businessCategory || "comercio independiente"}. Personalidad: ${proposalInput.personality || "auténtica"}. Brief: ${proposalInput.creativeBrief || "sin brief adicional"}.`),
      ]);
      orderedAssets = [...orderedAssets, ...generatedAssets];
      generatedAssetUrls = generatedAssets.map((asset) => asset.url);
    }
    if (orderedAssets.length === 0) {
      throw new BadRequestException("Agrega al menos una foto o video a la tienda o a un producto antes de crear el sitio con IA");
    }
    const brandFingerprint = storefrontBrandFingerprint({
      store: { id: store.id, name: store.name, logoUrl: store.logoUrl, accentColor: store.accentColor },
      brief: { category: proposalInput.businessCategory || "", personality: proposalInput.personality || "", creativeBrief: proposalInput.creativeBrief || "", checkoutMode, brandPalette: normalizedBrandColors(proposalInput.brandPalette) },
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
    const measuredBrandColors = normalizedBrandColors([
      ...(proposalInput.brandPalette ?? []),
      store.accentColor,
    ]);
    presets = presets.map((preset, index) => {
      const existingDocument = preset.config.siteDocument as StoreSiteDocument | undefined;
      const baseDocument = existingDocument ?? localSiteDocument(store, preset, orderedAssets, products, links, index + engineContext.generation, measuredBrandColors);
      const directedDocument = applySiteArtDirection(baseDocument, assignedArtDirections[index]);
      const brandedDocument = applyGeneratedBrandPalette(directedDocument, measuredBrandColors, index + engineContext.generation);
      const narrativeDocument = withGeneratedDefaultFooter(
        ensureGeneratedCommercePages(
          enforceGeneratedNarrative(brandedDocument, store, orderedAssets, products, index),
          store,
          orderedAssets,
          products,
          index + engineContext.generation,
        ),
        store,
        links,
        index + engineContext.generation,
      );
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
      const openingDocument = enforceGeneratedHeroOpening(topologyDocument, orderedAssets, index, lockedSectionIds);
      const templateDocuments = (merchantTemplates ?? []).flatMap((template) => {
        if (template.id === selectedTemplate?.id) return [];
        try {
          return [applyStorefrontCreativeRecipe(narrativeDocument, template.recipe as unknown as SiteCreativeRecipe, engineContext, index, mediaCandidates)];
        } catch {
          return [];
        }
      });
      const uniqueInventory = enforceUniqueGeneratedAnimationTypes(
        withStorefrontEngineMetadata(openingDocument, engineContext, index),
        [],
        [],
      );
      let siteDocument = withGeneratedDefaultFooter(
        finalizeGeneratedPages(
          preserveLockedStorefrontSections(uniqueInventory.siteDocument, liveDocument, lockedSectionIds),
          liveDocument,
          lockedSectionIds,
        ),
        store,
        links,
        index + engineContext.generation,
      );
      let originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
      // A locked opening owns its position as well as its contents. Requiring
      // a second opening kind in that case is impossible without violating the
      // merchant's lock, so diversity is measured on the remaining axes.
      let advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, false);
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
          withStorefrontEngineMetadata(enforceGeneratedHeroOpening(varied, orderedAssets, index, lockedSectionIds), engineContext, index),
          [],
          [],
        );
        siteDocument = withGeneratedDefaultFooter(
          finalizeGeneratedPages(
            preserveLockedStorefrontSections(uniqueVariation.siteDocument, liveDocument, lockedSectionIds),
            liveDocument,
            lockedSectionIds,
          ),
          store,
          links,
          index + engineContext.generation,
        );
        originality = storefrontOriginalityGate(siteDocument, [...previousDocuments, ...templateDocuments, ...acceptedDocuments], lockedSectionIds, 0.66, previousSignatures);
        advancesBatch = advancesGeneratedBatch(siteDocument, acceptedDocuments, false);
      }
      if (!originality.accepted || !advancesBatch) {
        throw new BadRequestException("No pudimos crear tres direcciones suficientemente originales y distintas sin tocar tus secciones bloqueadas. Desbloquea una sección, amplía la receta o cambia el brief e inténtalo otra vez.");
      }
      siteDocument = staticGeneratedPhotography(repairGeneratedPrimaryCatalog(siteDocument));
      const requestedAnimationTypes = [dto.motionExperience, ...(dto.motionExperiences ?? [])].filter(Boolean);
      const generatedAnimations = generatedAnimationSuite(
        requestedAnimationTypes,
        orderedAssets.filter((asset) => asset.url !== store.logoUrl),
        products,
        store.name,
        index,
        engineContext.generation,
      );
      const finalAnimationInventory = enforceUniqueGeneratedAnimationTypes(siteDocument, generatedAnimations, []);
      siteDocument = finalAnimationInventory.siteDocument;
      const animations = finalAnimationInventory.animations;
      const animationIds = animations.flatMap((animation) => {
        const id = animation && typeof animation === "object" && !Array.isArray(animation)
          ? (animation as Record<string, unknown>).id
          : null;
        return typeof id === "string" ? [id] : [];
      });
      const animationTypes = animations.flatMap((animation) => {
        const type = animation && typeof animation === "object" && !Array.isArray(animation)
          ? (animation as Record<string, unknown>).type
          : null;
        return typeof type === "string" ? [type] : [];
      });
      acceptedDocuments.push(siteDocument);
      acceptedOriginality.push(originality.closestSimilarity);
      const legacyConfig = legacyConfigFromSiteDocument(siteDocument);
      return {
        ...preset,
        config: {
          ...freshGeneratedVisualReset(),
          ...preset.config,
          ...legacyConfig,
          contentOrder: expandMotionSections(legacyConfig.contentOrder, animationIds),
          motionDuoEnabled: animations.length > 0,
          motionExperience: animationTypes[0] || "clarity-marquee",
          motionExperiences: animationTypes,
          animations,
          announcement: `${store.name} • Explora la tienda`,
          announcementMode: dto.announcementMarqueeEnabled === false ? "static" : "marquee",
          announcementSpeed: 22,
          announcementSize: "medium",
          announcementFont: "store",
          announcementEffect: "none",
          checkoutMode,
          ...(checkoutMode === "whatsapp" && { cartButtonLabel: "Pedir por WhatsApp", contactPhone: whatsappPhone }),
          ...(checkoutMode === "external" && { cartButtonLabel: "Continuar al enlace", leadCaptureUrl }),
        },
      };
    });

    const diversity = evaluateStorefrontDiversity(acceptedDocuments, 0.66, 1);
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
            baseWebsiteRevision: store.websiteRevision ?? 0,
            rationale: preset.rationale,
            provider,
            config: preset.config as Prisma.InputJsonObject,
            sourceAssetUrls: assetUrls,
            generatedUrls: generatedAssetUrls,
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

  async apply(merchantId: string, storeId: string, proposalId: string, revision?: number) {
    const store = await this.ownedStore(merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const proposal = await this.prisma.storeVisualProposal.findFirst({ where: { id: proposalId, storeId } });
    if (!proposal) throw new NotFoundException("Visual proposal not found");
    if (proposal.baseWebsiteRevision !== revision) throw new ConflictException("Esta propuesta pertenece a un borrador anterior. Pide el cambio de nuevo sobre el borrador actual.");
    const config = toStoreUpdate(stableGeneratedProposalConfig(proposal.config)) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, config, undefined, {
      label: `Antes de “${proposal.title}”`, source: `draft-proposal:${proposal.id}`, snapshot: snapshot(websiteEditorStore(store)),
    });
  }

  async restore(merchantId: string, storeId: string, versionId: string, revision?: number) {
    const store = await this.ownedStore(merchantId, storeId);
    assertWebsiteRevision(store, revision);
    const version = await this.prisma.storeVisualVersion.findFirst({ where: { id: versionId, storeId } });
    if (!version) throw new NotFoundException("Visual version not found");
    const saved = version.snapshot as Prisma.JsonObject;
    // Publication snapshots contain additional normalized settings. All keys
    // originate on the server, never from a restore request body.
    const { links, ...data } = version.source.startsWith("publish:") ? saved : toStoreUpdate(saved) as Prisma.JsonObject;
    return saveWebsiteDraftPatch(this.prisma, store, revision, data,
      Array.isArray(links) ? links as Array<{ label: string; url: string }> : undefined,
      { label: "Antes de restaurar borrador", source: `draft-restore:${version.id}`, snapshot: snapshot(websiteEditorStore(store)) });
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
      const measuredPalette = normalizedBrandColors([
        ...(dto.brandPalette ?? []),
        store.accentColor,
      ]);
      const measuredPaletteNote = measuredPalette.length
        ? measuredPalette.join(", ")
        : "sin muestras técnicas; deriva el color directamente de las imágenes";
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
        reasoningEffort: "medium" | "high",
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
            reasoning: { effort: reasoningEffort },
            max_output_tokens: maxOutputTokens,
          }),
          signal: AbortSignal.timeout(name === "store_visual_directions" ? 240_000 : 120_000),
        });
        const body = await response.json() as {
          id?: string;
          status?: string;
          incomplete_details?: { reason?: string };
          usage?: { output_tokens?: number };
          output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string; refusal?: string }> }>;
          error?: { message?: string };
        };
        if (!response.ok) throw new BadGatewayException(body.error?.message || "OpenAI design generation failed");
        if (body.status === "incomplete") {
          throw new BadGatewayException(`OpenAI ${name} incomplete: ${body.incomplete_details?.reason || "unknown reason"}`);
        }
        const outputText = body.output
          ?.flatMap((item) => item.content ?? [])
          .find((item) => item.type === "output_text")?.text;
        if (!outputText) throw new BadGatewayException("OpenAI design generation returned no structured output");
        this.logger.log(`${name} completed: response=${body.id || "unknown"}, outputTokens=${body.usage?.output_tokens ?? "unknown"}`);
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
        `Paleta medida del logo y las fotografías: ${measuredPaletteNote}. Trátala como evidencia de marca, no como una sugerencia genérica. Puedes aclarar u oscurecer estos tonos para asegurar contraste, pero no reemplazarlos por una familia cromática ajena.`,
        "Examina visualmente cada imagen. Distingue con seguridad logo, arte editorial, imagen de ambiente, detalle y foto de producto. Mantén cada foto de producto unida al producto que indica la leyenda. Si un activo es débil, redundante o imposible de usar sin deformarlo, márcalo como avoid.",
        "Define el papel del logo, la escena real del público y una estrategia de color derivada de la identidad con 3 a 5 colores coordinados: base, acento, apoyo y superficies. Indica dónde usar fondos cromáticos y palabras de color sin perder contraste. Añade una estrategia tipográfica con carácter, una lógica de composición asimétrica, un plan de merchandising producto por producto y una sola idea de movimiento con propósito.",
        "La regla fija de orden es abrir con un hero visual estático de una sola imagen y colocar el catálogo inmediatamente después. El título del hero es el único gran gesto tipográfico de la página; los títulos posteriores son claramente menores. La apertura nunca es un bloque de historia con tipografía gigante, slider, video automático ni reveal dirigido por scroll. Después del catálogo, varía composición y densidad y planifica movimiento compatible con el renderer: reveal, clip, drift, scale, parallax o story-scroll, con un propósito concreto y lectura completa con movimiento reducido. Hero, story y catalog deben existir. Si no hay historia empresarial verificable, los capítulos deben contar la colección usando nombres, descripciones y fotos reales, sin inventar origen ni proceso. No incluyas una sección genérica que explique que el sitio permite explorar, elegir o contactar.",
        "Decide también la arquitectura de páginas en pagePlan. Inicio es implícita y debe ser una experiencia completa y larga: hero, catalog, story, gallery y contact permanecen en Inicio. Planifica dos o tres destinos adicionales con contenido real, alineados con las pestañas o colecciones que pida el comercio. Cada destino debe aportar una narrativa o galería propia usando sectionKinds válidos; el compositor añadirá un catálogo con productos reales a cada página. No limites las páginas a location o links, no dupliques el mismo relato y nunca declares una página vacía. Usa ids y slugs únicos, breves y seguros; labels y slugs deben ser naturales en español.",
        "No inventes datos, origen, materiales, descuentos, testimonios ni promesas. Escribe el análisis en español y devuelve solo el esquema.",
      ].join("\n");
      let brandAnalysis = brandAnalysisCache.get(engineContext.brandFingerprint);
      const analysisCacheHit = Boolean(brandAnalysis);
      if (!brandAnalysis) {
        // The token cap includes reasoning. A 5k/high budget truncated the real
        // analysis before its JSON completed, forcing that run to fall back.
        const analysisText = await requestStructuredOutput("store_brand_analysis", BRAND_ANALYSIS_SCHEMA, analysisPrompt, 8_000, "medium");
        brandAnalysis = (JSON.parse(analysisText) as { analysis?: BrandAnalysis }).analysis;
        if (brandAnalysis) brandAnalysisCache.set(engineContext.brandFingerprint, brandAnalysis);
      }
      if (!brandAnalysis) throw new BadGatewayException("OpenAI brand analysis returned no usable plan");

      const prompt = [
        "Actúa como el director de diseño y desarrollo de un estudio digital senior. El estándar es una web de agencia de alta gama que se siente construida para una marca real, nunca una plantilla embellecida. Recibes un análisis de marca ya realizado. Úsalo como evidencia y devuelve exactamente tres documentos de sitio completos, personalizados y estructuralmente distintos. No son variaciones de una plantilla ni configuraciones del editor existente. Usa solamente los medios indicados y no solicites imágenes nuevas.",
        `Clave creativa de esta generación: ${creativeRun}. Úsala para evitar repetir decisiones de generaciones anteriores sin mencionarla en el resultado.`,
        `Direcciones de arte asignadas, en orden: ${proposalArtDirections(dto.artDirection, engineContext.generation).join(", ")}. Cada siteDocument.artDirection debe copiar exactamente la dirección correspondiente. Si el comercio eligió una, ocupa la primera propuesta; las otras dos deben contrastarla.`,
        `Topologías de página asignadas, en orden: ${topologyAssignments.join(", ")}. Diseña el contenido para esas siluetas. La plataforma materializará la topología final de forma determinista: hero visual primero y catálogo segundo. La variedad de apertura viene de layout, medios y movimiento, no de convertir story en una portada tipográfica.`,
        "designGenome es el contrato visual vinculante, no metadata decorativa. Debe obedecer la dirección de arte asignada y hacer que todas las decisiones de secciones, tipografía, medios, color y movimiento pertenezcan al mismo mundo. Las tres combinaciones deben diferir claramente.",
        "family es la familia estructural de cada sección y debe ser exactamente editorial, cinematic, product-led o minimal. No es un sinónimo de layout: decide qué lidera la sección y cómo se leen los mismos blocks. Editorial prioriza copy y ritmo asimétrico; cinematic prioriza medios y escala; product-led pone catálogo, producto o acción antes que decoración; minimal reduce la composición a lo esencial. Usa al menos tres familias distintas dentro de cada página y cambia de familia entre propuestas para una misma sección importante.",
        "blocks es la composición interna canónica de cada sección y los campos planos title, body, ctaLabel, mediaIndices e items siguen como proyección compatible. Usa group solo en el nivel superior y hojas heading, text, action, media o commerce dentro; children no puede contener otro group. Cada id debe ser único dentro de la sección. Usa únicamente las ranuras registradas para ese kind. Catalog, contact, location, links y event-tickets conservan un bloque commerce en su ranura funcional: ese bloque posiciona UI confiable de pagosYa y nunca contiene HTML.",
        `Tienda: ${store.name}. Categoría: ${category}. Personalidad: ${personality}.`,
        `Brief creativo del comercio:\n${creativeBrief}`,
        `Conversión elegida por el comercio: ${conversion}. Respeta esta decisión en el tono de los llamados a la acción.`,
        `Catálogo actual:\n${catalog}`,
        `Enlaces actuales (la plataforma los inyecta de forma segura):\n${socialLinks}`,
        `Índices de imágenes reutilizables:\n${assetLegend}`,
        `Paleta medida del logo y las fotografías: ${measuredPaletteNote}. Construye theme y los fondos de sección con variaciones tonales de estos colores. No introduzcas un acento ajeno solo para diferenciar propuestas; la diferencia debe venir de composición, tipografía, escala y ritmo.`,
        `Análisis de marca obligatorio, realizado en la fase anterior:\n${JSON.stringify(brandAnalysis, null, 2)}`,
        "Contrato multipágina obligatorio: siteDocument.pages materializa dos o tres destinos reales y cada sección declara pageId. El string vacío significa Inicio. Conserva hero, un catalog principal, story, gallery y contact en Inicio. Cada página adicional usa su id exacto en al menos dos secciones: una sección narrativa o visual y un catalog propio. En cada catalog adicional elige productIndices del catálogo real que correspondan a esa página; nunca mezcles categorías por posición ni inventes productos. La plataforma valida esos índices, deriva enlaces seguros y mantiene una URL estable por slug; no escribas items de navegación.",
        "Contrato narrativo obligatorio de cada siteDocument: debe existir exactamente un hero, un story, un catalog, un gallery y un contact en Inicio, además de un catalog por cada página adicional. Inicio forma un descenso sustancial, no una portada corta. Hero debe ser la primera sección y el catalog principal la segunda. Después de ese par, alterna escala y densidad. Hero usa exactamente un medio, nunca el logo, con copy breve. Da a las páginas movimientos compatibles y variados entre reveal, clip, drift, scale, parallax o story-scroll; evita repetir el mismo efecto en todas. Catalog es la zona transaccional donde la plataforma inserta productos, carrito y checkout reales. No existe benefits: no generes una sección genérica de razones, pasos, Explora/Elige/Conecta ni una explicación de lo que hace una tienda.",
        "Antes de componer, elige para cada propuesta una combinación distinta y pertinente entre atmósferas de lujo editorial, estructuralismo suave o tecnología sobria, y layouts de split editorial, bento asimétrico o cascada espacial sin solapamientos. Da a cada propuesta un concepto rector visible de principio a fin: una idea de marca que conecte paleta, escala, ritmo, recortes de imagen, navegación, catálogo, formulario y cierre. Haz que cambien de verdad en jerarquía, densidad, orden, tipografía, geometría, composición de producto y relación entre imagen y texto.",
        "Contrato de diferenciación verificable: las tres propuestas deben usar tres hero.layout distintos, las tres navigation.layout disponibles exactamente una vez cada una y tres theme.productLayout distintos. No basta cambiar color o copy. Cada dirección debe seguir siendo reconocible en escala de grises por su silueta, proporciones, orden y composición del catálogo.",
        "Distingue logo, arte editorial y foto de producto por su función. El logo pertenece a la identidad o navegación: no lo estires, no lo recortes como fotografía y no lo uses como fondo. Sitúa cada foto de producto con su producto correcto y usa merchandising para decidir qué productos abren la colección, cuáles se destacan y en qué orden se cuentan. Reserva una imagen dominante para el hero y asigna imágenes distintas a story y gallery; solo repite cuando el inventario único se agote. Mantén un solo lenguaje de recorte y tratamiento por propuesta. Con pocos activos, simplifica o elimina la galería antes de duplicar fotografías.",
        "Aplica este protocolo anti-genérico obligatorio: densidad visual cercana a 4/10, varianza 8/10 y movimiento tipográfico 2/10; una paleta coherente de 3 a 5 colores con un acento principal de saturación menor a 80%, uno o dos tonos de apoyo y un solo sistema de radios. Al menos dos secciones posteriores a la portada deben usar fondos cromáticos distintos y algunas palabras o frases breves pueden usar color cuando el contraste siga siendo AA. El color debe responder a la marca, no repartirse al azar. Nunca uses #000000, morado o azul neón, glow exterior, degradado de texto ni mezcla de grises cálidos y fríos. La portada debe caber en el primer viewport, ser asimétrica, estar alineada a la izquierda o dividida y tener como máximo un CTA. No uses hero centrado. La navegación debe tener sticky=false para evitar una barra pegada de borde a borde. Mantén cada elemento en una zona espacial limpia, sin texto superpuesto sobre otro contenido.",
        "La tipografía debe sentirse elegida: usa roles grotesk, humanist o geometric para una voz tipo Geist, Satoshi o Cabinet Grotesk; editorial solo cuando el rubro justifique una serif moderna tipo Instrument Serif o Editorial New. No uses una estética equivalente a Inter, Roboto, Arial, Helvetica, Times, Georgia, Garamond o Palatino. Controla el tamaño con jerarquía y peso; cuerpo mínimo 16px, interlineado relajado y líneas de máximo 65 caracteres.",
        "En páginas largas usa al menos cuatro familias de composición. Prohíbe tres tarjetas iguales, la repetición constante de texto a la izquierda e imagen a la derecha, etiquetas decorativas, números de sección, scroll cues, tiras de hora o clima e interfaz falsa hecha con rectángulos. No apiles muchas fotografías una debajo de otra ni conviertas el descenso de la página en un collage sin relato: una imagen solo entra si cumple una función clara dentro de la portada, un capítulo Story Scroll, un producto o una galería posterior acotada. Usa tarjetas solo cuando la elevación comunique jerarquía; cuando existan, deben sentirse como una pieza dentro de un marco concéntrico y no como un rectángulo con borde gris. No uses guiones largos Unicode. Cada sección debe tener una función real y una composición propia dentro del mismo mundo.",
        "Usa este sistema de calidad Impeccable como constitución, no como estilo visual: jerarquía inequívoca, contraste AA, texto corporal legible, controles táctiles de 44px, foco de teclado visible, composición responsive sin scroll horizontal, estados estables y copy que nombra una acción real. El catálogo, carrito y formulario deben sentirse parte del mismo mundo visual. Alterna escala y densidad y crea uno o dos momentos memorables, no una colección de efectos.",
        "El movimiento debe tener propósito y variar por página. Usa motion=none donde la lectura necesite calma y elige reveal, clip, drift, scale, parallax o story-scroll solo cuando refuerce la jerarquía. Evita pinning largo, zoom agresivo y escenas que bloqueen el desplazamiento; toda composición debe seguir siendo legible con movimiento reducido.",
        `Contrato cerrado de animación: no inventes nombres, componentes, transiciones, HTML, CSS ni JavaScript de movimiento. Para motion de sección usa exclusivamente ${SITE_SECTION_MOTIONS.join(", ")}. Para experience usa exclusivamente el enum del esquema. Después de validar el documento, la plataforma elegirá de forma variada y reproducible dos o tres componentes existentes de esta biblioteca registrada: ${MOTION_EXPERIENCES.join(", ")}. El modelo no puede ampliar ni reemplazar esa biblioteca.`,
        "Elige una sola experience tipográfica discreta para después del catálogo y no repitas su tipo entre las tres propuestas. Usa únicamente layered-text, text-rotate, text-glitch, text-reveal-block o text-along-path. La experience lleva mediaIndices=[] y copy real, breve y verificable. Su placement siempre es after-catalog.",
        "Usa full-bleed, offset, split, centered, grid, stacked, rail y minimal como herramientas libres, no como una receta. Evita una secuencia repetida de tarjetas genéricas y evita el patrón constante texto a la izquierda e imagen a la derecha.",
        "Respeta las capacidades del renderer: hero admite split, full-bleed, centered u offset; story admite split, offset, stacked, rail o centered; catalog admite grid, stacked, offset, rail o minimal; gallery admite grid, split, offset, stacked, full-bleed o rail; contact admite split, stacked, centered o minimal; location admite split, stacked, full-bleed u offset; links admite centered, stacked, minimal o rail. Usa únicamente movimientos compatibles con cada kind.",
        "Ranuras válidas por sección: hero = eyebrow, heading, body, actions, primary-media, secondary-media; story = heading, body, chapters, media-rail; catalog = heading, intro, filters, products, footer-action; gallery = heading, body, media-grid, caption; contact = heading, body, details, actions; location = heading, address, hours, map, media; links = heading, body, links. Todos los children heredan una ranura válida de su sección.",
        "Los CTA deben ser breves, específicos al rubro y conducir al catálogo o contacto. Evita emojis, nombres genéricos, porcentajes redondos falsos y clichés como Elevate, Seamless, Unleash, Next-Gen, Eleva, Revoluciona o Sin límites. Nunca inventes descuentos, envíos, certificaciones, origen, materiales, testimonios ni promesas verificables.",
        "mediaIndices y assetIndex solo pueden referenciar los índices disponibles. Usa assetIndex=-1 cuando un item no necesite medio. No incluyas URLs externas.",
        "Escribe copy borrador atractivo en español. No devuelvas HTML, CSS, JavaScript ni texto fuera del esquema estructurado.",
      ].join("\n");

      const outputText = await requestStructuredOutput("store_visual_directions", AI_DIRECTIONS_SCHEMA, prompt, 32_000, "high");
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
      if (!siteDocument) this.logger.warn(`AI direction ${directionIndex + 1} could not be materialized`);
      else if (!passesPremiumDirectionGuardrails(siteDocument)) this.logger.warn(`AI direction ${directionIndex + 1} did not pass theme/content checks`);
      return siteDocument && passesPremiumDirectionGuardrails(siteDocument)
        ? [{ title: generatedCopy(direction.title), rationale: generatedCopy(direction.rationale), siteDocument }]
        : [];
    });
    if (materialized.length !== 3) return null;
    // Measure diversity after the compositor assigns art direction and topology.
    // Rejecting here prevented its bounded repair pass from ever running.
    // generateProposals still requires the final originality and diversity gates
    // to pass before it persists any proposal.
    return materialized;
  }
}
