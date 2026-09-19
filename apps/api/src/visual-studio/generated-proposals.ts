/** Shapes AI-generated layout proposals: brand palettes, motion, sections, commerce pages, and the guardrails every generated document must pass. */
import { Store, MediaAsset } from "@prisma/client";
import { type SiteArtDirection, isSiteArtDirection, SITE_ART_DIRECTIONS, deriveLegacySiteSectionBlocks } from "@pagosya/shared-types";
import { storefrontPageProductIds } from "./storefront-page-products";
import { type StoreSiteDocument, SITE_SECTION_MOTIONS, AI_SITE_DOCUMENT_SCHEMA } from "./site-document";
import { TtlLruCache } from "./storefront-engine";
import { blendHex, readableInk, hexSaturation } from "./color";
import { type StoreLinkContext, MOTION_EXPERIENCES, TEXT_MOTION_EXPERIENCES, CONTENT_SECTIONS, type StoreProductContext, type ProposalPreset, type VisualConfig } from "./visual-config";


export function advancesGeneratedBatch(
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

export type BrandAnalysis = {
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

export const brandAnalysisCache = new TtlLruCache<BrandAnalysis>(64, 30 * 60_000);
export const SAFE_GENERATED_BACKGROUNDS = ["#eef1f5", "#e8f2ef", "#eeebf5"] as const;
export const GENERATED_SIGNATURE_PROFILES = [
  "text-reveal-block", "text-rotate", "text-along-path",
] as const;

export function proposalArtDirections(preferred: unknown, generation: number): SiteArtDirection[] {
  const start = isSiteArtDirection(preferred)
    ? preferred
    : SITE_ART_DIRECTIONS[generation % SITE_ART_DIRECTIONS.length];
  const ordered = [start, ...SITE_ART_DIRECTIONS.filter((direction) => direction !== start)];
  return ordered.slice(0, 3);
}

export function generatedMotionProfile(index: number, assetCount: number) {
  void assetCount;
  return { section: "none" as const, signature: GENERATED_SIGNATURE_PROFILES[index % GENERATED_SIGNATURE_PROFILES.length] };
}

export type GeneratedBrandPalette = {
  page: string;
  text: string;
  accent: string;
  secondary: string;
  surface: string;
  story: string;
  muted: string;
  border: string;
};

export function normalizedBrandColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((entry) =>
    typeof entry === "string" && /^#[0-9a-f]{6}$/i.test(entry) ? [entry.toLowerCase()] : [],
  ))].slice(0, 6);
}

export function brandLedGeneratedPalette(
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

export function applyGeneratedBrandPalette(
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

export function withGeneratedDefaultFooter(
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

export function withGeneratedDefaultNavigation(document: StoreSiteDocument): StoreSiteDocument {
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

export function enforceGeneratedHeroOpening(
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

export function enforceUniqueGeneratedAnimationTypes(
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

export function staticGeneratedPhotography(document: StoreSiteDocument): StoreSiteDocument {
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

export function repairGeneratedPrimaryCatalog(document: StoreSiteDocument): StoreSiteDocument {
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

export function enforceUniqueGeneratedProposalConfig(value: unknown): unknown {
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

export function stableGeneratedProposalConfig(value: unknown): unknown {
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

export function cleanGeneratedContentOrder(value: unknown): string[] {
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

export function expandMotionSections(value: unknown, animationIds: string[]): string[] {
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

export function animationMediaRequirement(type: string): { min: number; max: number } {
  if (["clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"].includes(type)) return { min: 0, max: 0 };
  if (["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(type)) return { min: 1, max: 1 };
  if (type === "scroll-expansion") return { min: 2, max: 2 };
  if (["hero-gallery-scroll", "gallery-accordion", "split-scroll", "sticky-gallery"].includes(type)) return { min: 3, max: 8 };
  return { min: 2, max: 8 };
}

export function distributedAnimationMedia(
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

export function safeGeneratedBackground(candidate: unknown, index: number): string {
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

export function generatedCopy(value: string): string {
  return value.replace(/[—–]/g, "-").trim();
}

export function passesPremiumDirectionGuardrails(document: StoreSiteDocument): boolean {
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

export const FEATURED_AI_MOTION_EXPERIENCES = [
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

export function seededAnimationLibrary(seed: string): Array<(typeof MOTION_EXPERIENCES)[number]> {
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

export const GENERATED_ANIMATION_NAMES: Record<(typeof MOTION_EXPERIENCES)[number], string> = {
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

export function generatedAnimationSuite(
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

export const AI_DIRECTIONS_SCHEMA = {
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

export const BRAND_ANALYSIS_SCHEMA = {
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

export function localSiteDocument(store: Store, preset: ProposalPreset, assets: MediaAsset[], products: StoreProductContext[], links: StoreLinkContext[], index: number, brandColors: readonly string[] = []): StoreSiteDocument {
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

export function ensureGeneratedCommercePages(
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

export function enforceGeneratedNarrative(
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

export function finalizeGeneratedPages(
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

/**
 * A generated direction is a replacement creative canvas, not a patch over the
 * merchant's previous layout. These explicit values make proposal previews and
 * applies deterministic even though the dashboard preview starts from the live
 * store object. Commerce records (products, links, locations, checkout routing,
 * logo and store identity) live outside this reset and remain untouched.
 */
export function freshGeneratedVisualReset(): VisualConfig {
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
