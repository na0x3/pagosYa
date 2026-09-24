/** Normalizes a store's presentation settings (hero, sections, gallery, animations) and keeps the legacy fields and the site document in sync on update. */
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { STORE_SITE_SECTION_PATTERN, STORE_BASE_CONTENT_SECTIONS, STORE_MOTION_EXPERIENCES } from "./dto/store-options";
import { UpdateStoreDto } from "./dto/update-store.dto";
import { applySiteArtDirection, siteSectionBlockSlotIsSupported, resolveSiteSectionFamily } from "@pagosya/shared-types";
import { storeLocationSnapshot } from "./store-locations";
import { normalizeAnalyticsId } from "../store-seo/store-analytics";

export type StoreHeroSlide = {
  imageUrl: string;
  title?: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
};
export type StoreContentSection = string;
export type StoreEditorialImage = {
  imageUrl: string;
  productId?: string;
  title?: string;
  caption?: string;
  body?: string;
  boxColor?: string;
  textPositionX?: number;
  textPositionY?: number;
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: string;
  textColor?: string;
  fontStyle?: string;
};
export type StoreAnimationTextBlock = {
  id: string;
  role: "title" | "subtitle";
  text: string;
  textPositionX?: number;
  textPositionY?: number;
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: string;
  textColor?: string;
  fontStyle?: string;
};
export type StoreAnimation = {
  id: string;
  name: string;
  type: string;
  pageId?: string;
  title?: string;
  subtitle?: string;
  productId?: string;
  buttonLabel?: string;
  buttonPositionX?: number;
  buttonPositionY?: number;
  textPositionX?: number;
  textPositionY?: number;
  textScale?: number;
  textWidthPercent?: number;
  textAlign?: string;
  textSize?: string;
  textWidth?: string;
  textColor?: string;
  backgroundColor?: string;
  fontStyle?: string;
  textBlocks?: StoreAnimationTextBlock[];
  media: StoreEditorialImage[];
};
export const DEFAULT_STORE_ANIMATION: StoreAnimation = {
  id: "welcome",
  name: "Bienvenida en movimiento",
  type: "clarity-marquee",
  media: [],
};
export const DEFAULT_STORE_CONTENT_ORDER: StoreContentSection[] = [
  animationContentSection(DEFAULT_STORE_ANIMATION.id),
  "hero",
  "about",
  "products",
  "gallery",
  "links",
  "contact",
  "location",
];

export function readStoreHeroSlides(value: Prisma.JsonValue): StoreHeroSlide[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string",
    )
    .slice(0, 5)
    .map((entry) => ({
      imageUrl: entry.imageUrl as string,
      ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
      ...(typeof entry.body === "string" && entry.body ? { body: entry.body } : {}),
      ...(typeof entry.ctaLabel === "string" && entry.ctaLabel ? { ctaLabel: entry.ctaLabel } : {}),
      ...(typeof entry.ctaUrl === "string" && entry.ctaUrl ? { ctaUrl: entry.ctaUrl } : {}),
    }));
}

export function animationContentSection(id: string): StoreContentSection {
  return `animation-${id}`;
}

export function readStoreContentOrder(value: unknown, animations: StoreAnimation[]): StoreContentSection[] {
  const ordered = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
  const animationSections = animations.map((animation) => animationContentSection(animation.id));
  const animationSectionSet = new Set(animationSections);
  const unique: StoreContentSection[] = [];
  const append = (section: StoreContentSection) => {
    if (!unique.includes(section)) unique.push(section);
  };
  ordered.forEach((section) => {
    if (section === "motion") {
      animationSections.forEach(append);
      return;
    }
    if (section.startsWith("motion-")) {
      const legacyType = section.slice("motion-".length);
      animations
        .filter((animation) => animation.type === legacyType)
        .map((animation) => animationContentSection(animation.id))
        .forEach(append);
      return;
    }
    if (section.startsWith("animation-")) {
      if (animationSectionSet.has(section)) append(section);
      return;
    }
    if (STORE_SITE_SECTION_PATTERN.test(section)) {
      append(section);
      return;
    }
    if ((STORE_BASE_CONTENT_SECTIONS as readonly string[]).includes(section)) append(section);
  });
  const hasAuthoredSiteOrder = unique.some((section) => STORE_SITE_SECTION_PATTERN.test(section));
  if (hasAuthoredSiteOrder) {
    const missingAnimations = animationSections.filter((section) => !unique.includes(section));
    const linksIndex = unique.findIndex((section) => section.startsWith("site-") && /(?:follow|links|social)/.test(section));
    unique.splice(linksIndex < 0 ? unique.length : linksIndex, 0, ...missingAnimations);
    return unique;
  }
  ["hero", "products", "about", "gallery"].forEach((section) => {
    if (unique.includes(section)) return;
    const footerIndex = unique.findIndex((entry) => ["links", "contact", "location"].includes(entry));
    if (footerIndex < 0) append(section);
    else unique.splice(footerIndex, 0, section);
  });
  ["links", "contact", "location"].forEach(append);
  const missingAnimations = animationSections.filter((section) => !unique.includes(section));
  if (missingAnimations.length) unique.unshift(...missingAnimations);
  return unique;
}

export function readStoreMotionExperiences(value: unknown, legacy: unknown): string[] {
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string =>
        typeof entry === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(entry),
      )
    : [];
  const unique = [...new Set(selected)];
  if (unique.length) return unique;
  if (typeof legacy === "string" && (STORE_MOTION_EXPERIENCES as readonly string[]).includes(legacy)) return [legacy];
  return ["hero-carousel"];
}

export function readStoreEditorialGallery(value: unknown): StoreEditorialImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Prisma.JsonObject =>
        !!entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.imageUrl === "string",
    )
    .slice(0, 8)
    .map((entry) => ({
      imageUrl: entry.imageUrl as string,
      ...(typeof entry.productId === "string" && entry.productId ? { productId: entry.productId.slice(0, 80) } : {}),
      ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
      ...(typeof entry.caption === "string" && entry.caption ? { caption: entry.caption } : {}),
      ...(typeof entry.body === "string" && entry.body ? { body: entry.body } : {}),
      ...(typeof entry.boxColor === "string" && /^#[0-9a-f]{6}$/i.test(entry.boxColor) ? { boxColor: entry.boxColor } : {}),
      ...(typeof entry.textPositionX === "number" && Number.isInteger(entry.textPositionX) && entry.textPositionX >= 0 && entry.textPositionX <= 100 ? { textPositionX: entry.textPositionX } : {}),
      ...(typeof entry.textPositionY === "number" && Number.isInteger(entry.textPositionY) && entry.textPositionY >= 0 && entry.textPositionY <= 100 ? { textPositionY: entry.textPositionY } : {}),
      ...(typeof entry.textScale === "number" && Number.isInteger(entry.textScale) && entry.textScale >= 50 && entry.textScale <= 200 ? { textScale: entry.textScale } : {}),
      ...(typeof entry.textWidthPercent === "number" && Number.isInteger(entry.textWidthPercent) && entry.textWidthPercent >= 20 && entry.textWidthPercent <= 100 ? { textWidthPercent: entry.textWidthPercent } : {}),
      ...(typeof entry.textAlign === "string" && ["left", "center", "right"].includes(entry.textAlign) ? { textAlign: entry.textAlign } : {}),
      ...(typeof entry.textColor === "string" && /^#[0-9a-f]{6}$/i.test(entry.textColor) ? { textColor: entry.textColor } : {}),
      ...(typeof entry.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(entry.fontStyle) ? { fontStyle: entry.fontStyle } : {}),
    }));
}

export function animationMediaLimit(type: string): number {
  return ["circle-reveal", "magnetic-target", "video-background", "link-preview", "video-pin-reveal"].includes(type)
    ? 1
    : type === "scroll-expansion" ? 2 : 8;
}

export function readStoreAnimationTextBlocks(value: unknown): StoreAnimationTextBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const block = entry as Prisma.JsonObject;
    if (typeof block.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(block.id)) return [];
    if (block.role !== "title" && block.role !== "subtitle") return [];
    if (typeof block.text !== "string" || !block.text.trim()) return [];
    return [{
      id: block.id,
      role: block.role,
      text: block.text.slice(0, 220),
      ...(typeof block.textPositionX === "number" && Number.isInteger(block.textPositionX) && block.textPositionX >= 0 && block.textPositionX <= 100 ? { textPositionX: block.textPositionX } : {}),
      ...(typeof block.textPositionY === "number" && Number.isInteger(block.textPositionY) && block.textPositionY >= 0 && block.textPositionY <= 100 ? { textPositionY: block.textPositionY } : {}),
      ...(typeof block.textScale === "number" && Number.isInteger(block.textScale) && block.textScale >= 50 && block.textScale <= 200 ? { textScale: block.textScale } : {}),
      ...(typeof block.textWidthPercent === "number" && Number.isInteger(block.textWidthPercent) && block.textWidthPercent >= 20 && block.textWidthPercent <= 100 ? { textWidthPercent: block.textWidthPercent } : {}),
      ...(typeof block.textAlign === "string" && ["left", "center", "right"].includes(block.textAlign) ? { textAlign: block.textAlign } : {}),
      ...(typeof block.textColor === "string" && /^#[0-9a-f]{6}$/i.test(block.textColor) ? { textColor: block.textColor } : {}),
      ...(typeof block.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(block.fontStyle) ? { fontStyle: block.fontStyle } : {}),
    } as StoreAnimationTextBlock];
  }).slice(0, 24);
}

export function normalizeAnimationMedia<T extends { type: string; media: unknown[] }>(animation: T): T {
  return { ...animation, media: animation.media.slice(0, animationMediaLimit(animation.type)) };
}

export const LEGACY_ANIMATION_NAMES: Record<string, string> = {
  "story-scroll": "Story Scroll",
  "hero-carousel": "Hero editorial",
  "image-stream": "Image Stream",
  "scroll-expansion": "Scroll Expansion",
  "hero-gallery-scroll": "Hero Gallery",
  "stagger-testimonials": "Reseñas",
  "portfolio-scroller": "Menú de momentos",
  "circle-reveal": "Revelado circular",
  "clarity-marquee": "Preguntas en movimiento",
  "full-screen-chapters": "Capítulos a pantalla completa",
  "magnetic-target": "Llamado magnético",
  "frame-sequence": "Secuencia por fotogramas",
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

export function readStoreAnimations(
  value: unknown,
  enabled: boolean,
  legacyExperiences: string[],
  legacyGallery: StoreEditorialImage[],
): StoreAnimation[] {
  const parsed = Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Prisma.JsonObject =>
            !!entry &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            typeof entry.id === "string" &&
            /^[a-z0-9][a-z0-9_-]{0,47}$/.test(entry.id) &&
            typeof entry.name === "string" &&
            typeof entry.type === "string" &&
            (STORE_MOTION_EXPERIENCES as readonly string[]).includes(entry.type) &&
            Array.isArray(entry.media),
        )
        .map((entry) => ({
          id: entry.id as string,
          name: (entry.name as string).slice(0, 60),
          type: entry.type as string,
          ...(typeof entry.pageId === "string" && /^[a-z][a-z0-9-]{0,47}$/.test(entry.pageId) ? { pageId: entry.pageId } : {}),
          ...(typeof entry.title === "string" && entry.title ? { title: entry.title } : {}),
          ...(typeof entry.subtitle === "string" && entry.subtitle ? { subtitle: entry.subtitle } : {}),
          ...(typeof entry.productId === "string" && entry.productId ? { productId: entry.productId.slice(0, 80) } : {}),
          ...(typeof entry.buttonLabel === "string" && entry.buttonLabel ? { buttonLabel: entry.buttonLabel.slice(0, 36) } : {}),
          ...(typeof entry.buttonPositionX === "number" && Number.isInteger(entry.buttonPositionX) && entry.buttonPositionX >= 0 && entry.buttonPositionX <= 100 ? { buttonPositionX: entry.buttonPositionX } : {}),
          ...(typeof entry.buttonPositionY === "number" && Number.isInteger(entry.buttonPositionY) && entry.buttonPositionY >= 0 && entry.buttonPositionY <= 100 ? { buttonPositionY: entry.buttonPositionY } : {}),
          ...(typeof entry.textPositionX === "number" && Number.isInteger(entry.textPositionX) && entry.textPositionX >= 0 && entry.textPositionX <= 100 ? { textPositionX: entry.textPositionX } : {}),
          ...(typeof entry.textPositionY === "number" && Number.isInteger(entry.textPositionY) && entry.textPositionY >= 0 && entry.textPositionY <= 100 ? { textPositionY: entry.textPositionY } : {}),
          ...(typeof entry.textScale === "number" && Number.isInteger(entry.textScale) && entry.textScale >= 50 && entry.textScale <= 200 ? { textScale: entry.textScale } : {}),
          ...(typeof entry.textWidthPercent === "number" && Number.isInteger(entry.textWidthPercent) && entry.textWidthPercent >= 20 && entry.textWidthPercent <= 100 ? { textWidthPercent: entry.textWidthPercent } : {}),
          ...(typeof entry.textAlign === "string" && ["left", "center", "right"].includes(entry.textAlign) ? { textAlign: entry.textAlign } : {}),
          ...(typeof entry.textSize === "string" && ["small", "medium", "large"].includes(entry.textSize) ? { textSize: entry.textSize } : {}),
          ...(typeof entry.textWidth === "string" && ["narrow", "medium", "wide"].includes(entry.textWidth) ? { textWidth: entry.textWidth } : {}),
          ...(typeof entry.textColor === "string" && /^#[0-9a-f]{6}$/i.test(entry.textColor) ? { textColor: entry.textColor } : {}),
          ...(typeof entry.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(entry.backgroundColor) ? { backgroundColor: entry.backgroundColor } : {}),
          ...(typeof entry.fontStyle === "string" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(entry.fontStyle) ? { fontStyle: entry.fontStyle } : {}),
          ...(readStoreAnimationTextBlocks(entry.textBlocks).length ? { textBlocks: readStoreAnimationTextBlocks(entry.textBlocks) } : {}),
          media: readStoreEditorialGallery(entry.media).slice(0, animationMediaLimit(entry.type as string)),
        }))
    : [];
  if (parsed.length || !enabled) return parsed;
  return legacyExperiences.slice(0, 8).map((type, index) => ({
    id: `legacy-${index + 1}-${type}`,
    name: LEGACY_ANIMATION_NAMES[type] ?? `Animación ${index + 1}`,
    type,
    title: LEGACY_ANIMATION_NAMES[type] ?? `Animación ${index + 1}`,
    media: legacyGallery.slice(0, animationMediaLimit(type)).map((image) => ({ ...image })),
  }));
}

export type SiteDocumentLegacyStore = {
  bannerUrl: string | null;
  aboutImageUrl: string | null;
  editorialGallery: Prisma.JsonValue;
};

export function synchronizedSiteDocument(
  value: Prisma.JsonValue | null,
  dto: UpdateStoreDto,
  currentStore?: SiteDocumentLegacyStore,
): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  let document = JSON.parse(JSON.stringify(value)) as Record<string, any>;
  if (document.version !== 1 || !document.theme || !Array.isArray(document.sections)) return undefined;
  if (dto.siteArtDirection !== undefined) document = applySiteArtDirection(document as any, dto.siteArtDirection) as Record<string, any>;
  if (dto.sitePages !== undefined) {
    const slugs = new Set<string>();
    document.pages = dto.sitePages.map((page) => {
      const slug = page.slug.trim().toLowerCase();
      if (slugs.has(slug)) throw new BadRequestException("Cada página necesita una URL distinta");
      slugs.add(slug);
      return { id: page.id, label: page.label.trim(), slug };
    });
  }
  const pageIds = new Set((Array.isArray(document.pages) ? document.pages : []).map((page: Record<string, unknown>) => page.id));
  const theme = document.theme as Record<string, unknown>;
  if (dto.backgroundColor !== undefined && dto.backgroundColor) theme.pageBackground = dto.backgroundColor;
  if (dto.accentColor !== undefined && dto.accentColor) theme.accentColor = dto.accentColor;
  if (dto.fontStyle !== undefined) {
    const fontRoles: Record<string, string> = { modern: "grotesk", editorial: "editorial", friendly: "humanist", classic: "classic", geometric: "geometric", artisan: "artisan", condensed: "condensed", luxury: "luxury" };
    theme.headingFont = fontRoles[dto.fontStyle] ?? theme.headingFont;
    theme.bodyFont = fontRoles[dto.fontStyle] ?? theme.bodyFont;
  }
  // The dashboard promotes the generated signature experience into the
  // ordinary animations array so its copy, media, layout, type, and deletion
  // all use the same editor and persistence path as merchant-authored motion.
  if (dto.animations !== undefined && document.experience && typeof document.experience === "object" && !Array.isArray(document.experience)) {
    document.experience = { ...document.experience, type: "none" };
  }
  const backgrounds = dto.sectionBackgrounds ?? {};
  const canvasTextStyle = (style: Record<string, unknown> | undefined) => style ? {
    ...(Number.isInteger(style.textScale) ? { textScale: style.textScale } : {}),
    ...(Number.isInteger(style.textWidthPercent) ? { textWidthPercent: Math.min(100, Math.max(20, Number(style.textWidthPercent))) } : {}),
    ...(["left", "center", "right"].includes(String(style.textAlign)) ? { textAlign: style.textAlign } : {}),
    ...(typeof style.textColor === "string" ? { textColor: style.textColor.toLowerCase() } : {}),
    ...(typeof style.fontStyle === "string" ? { fontStyle: style.fontStyle } : {}),
    ...(Number.isInteger(style.textOffsetX) ? { textOffsetX: Math.min(1000, Math.max(-1000, Number(style.textOffsetX))) } : {}),
    ...(Number.isInteger(style.textOffsetY) ? { textOffsetY: Math.min(1000, Math.max(-1000, Number(style.textOffsetY))) } : {}),
    ...(["element", "section"].includes(String(style.textOffsetBasis)) ? { textOffsetBasis: style.textOffsetBasis } : {}),
  } : undefined;
  const normalizedBlocks = (blocks: unknown, sectionKind: string) => {
    if (!Array.isArray(blocks)) return undefined;
    const ids = new Set<string>();
    const visit = (block: any, depth: number): Record<string, unknown> => {
      if (!block || typeof block !== "object" || Array.isArray(block) || depth > 1) throw new BadRequestException("La estructura de bloques de la sección no es válida");
      if (ids.has(block.id) || !siteSectionBlockSlotIsSupported(sectionKind as any, block.slot)) throw new BadRequestException("Un bloque usa un id o una ranura no válida");
      if (depth === 1 && (block.kind === "group" || block.children?.length)) throw new BadRequestException("Los bloques solo pueden tener un nivel de contenido anidado");
      ids.add(block.id);
      return {
        id: block.id,
        kind: block.kind,
        slot: block.slot,
        role: block.role,
        text: block.text || "",
        mediaUrl: block.mediaUrl || null,
        ...(canvasTextStyle(block.style as Record<string, unknown> | undefined) ? { style: canvasTextStyle(block.style as Record<string, unknown>) } : {}),
        children: (block.children || []).map((child: unknown) => visit(child, depth + 1)),
      };
    };
    return blocks.map((block) => visit(block, 0));
  };
  const backgroundKey: Record<string, string> = { hero: "hero", story: "about", catalog: "products", gallery: "gallery", contact: "contact", location: "location", links: "links" };
  const projectedLegacyKinds = new Set<string>();
  const deletedSectionIds = new Set(dto.siteDeletedSectionIds ?? []);
  const requiredSiteSectionIds = new Set(["hero", "catalog", "contact"].flatMap((kind) => {
    const section = document.sections.find((entry: unknown) => {
      if (!(entry && typeof entry === "object" && !Array.isArray(entry))) return false;
      const candidate = entry as Record<string, unknown>;
      return candidate.kind === kind && !candidate.pageId;
    }) as Record<string, unknown> | undefined;
    return typeof section?.id === "string" ? [section.id] : [];
  }));
  document.sections = document.sections.filter((entry: unknown) => {
    if (!(entry && typeof entry === "object" && !Array.isArray(entry))) return false;
    const candidate = entry as Record<string, unknown>;
    if (candidate.kind === "benefits") return false;
    return requiredSiteSectionIds.has(String(candidate.id || "")) || !deletedSectionIds.has(String(candidate.id || ""));
  }).map((entry: unknown) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const section = { ...(entry as Record<string, any>) };
    if (["hero", "story", "catalog", "gallery", "contact", "location", "links"].includes(section.kind)) {
      section.family = resolveSiteSectionFamily(section.kind, section.family, document.designGenome);
    }
    const projectLegacy = !section.pageId && !projectedLegacyKinds.has(section.kind);
    if (!section.pageId) projectedLegacyKinds.add(section.kind);
    const setText = (field: "title" | "body", candidate: unknown) => {
      if (candidate === null || typeof candidate === "string") section[field] = candidate || "";
    };
    if (projectLegacy && section.kind === "hero") {
      setText("title", dto.tagline);
      if (dto.bannerUrl !== undefined && currentStore && dto.bannerUrl !== currentStore.bannerUrl) section.mediaUrls = dto.bannerUrl ? [dto.bannerUrl] : [];
    } else if (projectLegacy && section.kind === "story") {
      setText("title", dto.aboutTitle);
      setText("body", dto.aboutText !== undefined ? dto.aboutText : dto.aboutSubtitle);
      if (dto.aboutImageUrl !== undefined && currentStore && dto.aboutImageUrl !== currentStore.aboutImageUrl) section.mediaUrls = dto.aboutImageUrl ? [dto.aboutImageUrl] : [];
    } else if (projectLegacy && section.kind === "catalog") {
      setText("title", dto.catalogTitle);
      setText("body", dto.catalogSubtitle);
    } else if (projectLegacy && section.kind === "gallery") {
      setText("title", dto.galleryTitle);
      setText("body", dto.gallerySubtitle);
      if (dto.editorialGallery !== undefined && currentStore && JSON.stringify(dto.editorialGallery) !== JSON.stringify(currentStore.editorialGallery)) {
        section.mediaUrls = dto.editorialGallery.map((image) => image.imageUrl).filter(Boolean);
      }
    } else if (projectLegacy && section.kind === "contact") {
      setText("title", dto.contactTitle);
      setText("body", dto.contactSubtitle);
    } else if (projectLegacy && section.kind === "location") {
      setText("title", dto.locationTitle);
      setText("body", dto.locationSubtitle);
    } else if (projectLegacy && section.kind === "links") {
      setText("title", dto.linksTitle);
    }
    const background = backgrounds[`site-${section.id}`] ?? backgrounds[backgroundKey[section.kind]];
    if (background) section.backgroundColor = background;
    const authored = dto.siteSections?.find((candidate) => candidate.id === section.id);
    if (authored) {
      if (authored.pageId && !pageIds.has(authored.pageId)) throw new BadRequestException("Una sección apunta a una página que no existe");
      if (authored.pageId) section.pageId = authored.pageId;
      else delete section.pageId;
      if (section.kind === "catalog") section.productIds = [...new Set(authored.productIds || [])].slice(0, 200);
      section.title = authored.title;
      section.family = resolveSiteSectionFamily(section.kind, authored.family ?? section.family, document.designGenome);
      section.body = authored.body;
      section.ctaLabel = authored.ctaLabel;
      section.layout = authored.layout;
      section.width = authored.width;
      if (authored.heightPx !== undefined) section.heightPx = authored.heightPx;
      else delete section.heightPx;
      if (authored.mobileHeightPx !== undefined) section.mobileHeightPx = authored.mobileHeightPx;
      else delete section.mobileHeightPx;
      section.align = authored.align;
      section.motion = authored.motion;
      section.backgroundColor = authored.backgroundColor.toLowerCase();
      section.textColor = authored.textColor.toLowerCase();
      section.titleStyle = canvasTextStyle(authored.titleStyle as Record<string, unknown> | undefined);
      section.bodyStyle = canvasTextStyle(authored.bodyStyle as Record<string, unknown> | undefined);
      section.mediaUrls = [...authored.mediaUrls];
      section.items = Array.isArray(section.items)
        ? section.items.map((item: unknown, index: number) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return item;
            const copy = authored.items[index];
            return copy ? {
              ...(item as Record<string, unknown>),
              title: copy.title || "",
              body: copy.body || "",
              mediaUrl: copy.mediaUrl || null,
              titleStyle: canvasTextStyle(copy.titleStyle as Record<string, unknown> | undefined),
              bodyStyle: canvasTextStyle(copy.bodyStyle as Record<string, unknown> | undefined),
            } : item;
          })
        : [];
      if (authored.blocks !== undefined) section.blocks = normalizedBlocks(authored.blocks, section.kind);
    }
    if (Array.isArray(section.blocks) && authored?.blocks === undefined) {
      const standardBlocks = new Map(section.blocks.map((block: Record<string, any>) => [block.id, block]));
      if (standardBlocks.has("heading")) standardBlocks.get("heading")!.text = section.title || "";
      if (standardBlocks.has("body")) standardBlocks.get("body")!.text = section.body || "";
      if (standardBlocks.has("action")) standardBlocks.get("action")!.text = section.ctaLabel || "";
      (section.mediaUrls || []).forEach((mediaUrl: string, index: number) => {
        const block = standardBlocks.get(`media-${index + 1}`);
        if (block) block.mediaUrl = mediaUrl;
      });
    }
    return section;
  });
  const existingSectionIds = new Set(document.sections.map((section: Record<string, unknown>) => section.id));
  const singletonKinds = new Set(["contact", "location", "links"]);
  for (const authored of dto.siteSections ?? []) {
    if (existingSectionIds.has(authored.id) || authored.kind === "hero") continue;
    if (singletonKinds.has(authored.kind) && document.sections.some((section: Record<string, unknown>) => section.kind === authored.kind)) continue;
    if (authored.pageId && !pageIds.has(authored.pageId)) throw new BadRequestException("Una sección apunta a una página que no existe");
    document.sections.push({
      id: authored.id,
      ...(authored.pageId ? { pageId: authored.pageId } : {}),
      ...(authored.kind === "catalog" ? { productIds: [...new Set(authored.productIds || [])].slice(0, 200) } : {}),
      kind: authored.kind,
      family: resolveSiteSectionFamily(authored.kind as any, authored.family, document.designGenome),
      title: authored.title,
      body: authored.body,
      ctaLabel: authored.ctaLabel,
      layout: authored.layout,
      width: authored.width,
      ...(authored.heightPx !== undefined ? { heightPx: authored.heightPx } : {}),
      ...(authored.mobileHeightPx !== undefined ? { mobileHeightPx: authored.mobileHeightPx } : {}),
      align: authored.align,
      motion: authored.motion,
      backgroundColor: authored.backgroundColor.toLowerCase(),
      textColor: authored.textColor.toLowerCase(),
      titleStyle: canvasTextStyle(authored.titleStyle as Record<string, unknown> | undefined),
      bodyStyle: canvasTextStyle(authored.bodyStyle as Record<string, unknown> | undefined),
      mediaUrls: [...authored.mediaUrls],
      items: authored.items.map((item) => ({
        title: item.title || "",
        body: item.body || "",
        mediaUrl: item.mediaUrl || null,
        titleStyle: canvasTextStyle(item.titleStyle as Record<string, unknown> | undefined),
        bodyStyle: canvasTextStyle(item.bodyStyle as Record<string, unknown> | undefined),
      })),
      ...(authored.blocks !== undefined ? { blocks: normalizedBlocks(authored.blocks, authored.kind) } : {}),
    });
    existingSectionIds.add(authored.id);
  }
  if (dto.siteNavigation !== undefined) {
    const navigation = document.navigation && typeof document.navigation === "object" && !Array.isArray(document.navigation)
      ? document.navigation as Record<string, unknown>
      : null;
    if (!navigation) throw new BadRequestException("La navegación del sitio no es válida");
    navigation.layout = dto.siteNavigation.layout;
    navigation.barStyle = dto.siteNavigation.barStyle || "floating";
    navigation.brandPosition = dto.siteNavigation.brandPosition || (dto.siteNavigation.layout === "centered" ? "center" : "left");
    navigation.navPosition = dto.siteNavigation.navPosition || (dto.siteNavigation.layout === "split" ? "left" : "center");
    navigation.searchPosition = dto.siteNavigation.searchPosition || "right";
    navigation.profilePosition = dto.siteNavigation.profilePosition || "right";
    navigation.cartPosition = dto.siteNavigation.cartPosition || "right";
    const brandStyle = canvasTextStyle(dto.siteNavigation.brandStyle as Record<string, unknown> | undefined);
    const taglineStyle = canvasTextStyle(dto.siteNavigation.taglineStyle as Record<string, unknown> | undefined);
    if (brandStyle) navigation.brandStyle = brandStyle;
    else delete navigation.brandStyle;
    if (taglineStyle) navigation.taglineStyle = taglineStyle;
    else delete navigation.taglineStyle;
    navigation.sticky = dto.siteNavigation.sticky;
    navigation.transparent = dto.siteNavigation.transparent;
    navigation.logoTreatment = dto.siteNavigation.logoTreatment;
  }
  if (dto.siteNavigationItems !== undefined) {
    const navigation = document.navigation && typeof document.navigation === "object" && !Array.isArray(document.navigation)
      ? document.navigation as Record<string, unknown>
      : null;
    if (!navigation) throw new BadRequestException("La navegación del sitio no es válida");
    for (const item of dto.siteNavigationItems) {
      if (item.target === "section" && (!item.sectionId || !existingSectionIds.has(item.sectionId))) {
        throw new BadRequestException("Un enlace de navegación apunta a una sección que no existe");
      }
      if (item.target === "page" && (!item.pageId || !pageIds.has(item.pageId))) {
        throw new BadRequestException("Un enlace de navegación apunta a una página que no existe");
      }
    }
    navigation.items = dto.siteNavigationItems.map((item) => ({
      id: item.id,
      label: item.label.trim(),
      target: item.target,
      ...(item.target === "section" ? { sectionId: item.sectionId } : {}),
      ...(item.target === "page" ? { pageId: item.pageId } : {}),
      ...(canvasTextStyle(item.style as Record<string, unknown> | undefined) ? { style: canvasTextStyle(item.style as Record<string, unknown>) } : {}),
    }));
  }
  if (dto.siteFooter !== undefined) {
    document.footer = {
      enabled: dto.siteFooter.enabled,
      brandDescription: dto.siteFooter.brandDescription.trim(),
      columns: dto.siteFooter.columns.map((column) => ({
        id: column.id,
        title: column.title.trim(),
        items: column.items.map((item) => ({ id: item.id, label: item.label.trim(), href: item.href.trim() })),
      })),
      copyright: dto.siteFooter.copyright.trim(),
      badge: dto.siteFooter.badge.trim(),
      ...(dto.siteFooter.newsletter ? { newsletter: {
        enabled: dto.siteFooter.newsletter.enabled,
        title: dto.siteFooter.newsletter.title.trim(),
        body: dto.siteFooter.newsletter.body.trim(),
        buttonLabel: dto.siteFooter.newsletter.buttonLabel.trim(),
        successMessage: dto.siteFooter.newsletter.successMessage.trim(),
      } } : {}),
    };
  }
  if (dto.siteCatalogMenuStyle !== undefined || dto.siteCatalogCollections !== undefined) {
    const merchandising = document.merchandising && typeof document.merchandising === "object" && !Array.isArray(document.merchandising)
      ? document.merchandising as Record<string, unknown>
      : {};
    if (dto.siteCatalogMenuStyle !== undefined) merchandising.collectionMenuStyle = dto.siteCatalogMenuStyle;
    if (dto.siteCatalogCollections !== undefined) merchandising.collections = dto.siteCatalogCollections.map((collection) => ({
      id: collection.id,
      name: collection.name.trim(),
      productIds: [...new Set(collection.productIds)],
    }));
    document.merchandising = merchandising;
  }
  return document as Prisma.InputJsonValue;
}

export function storeUpdateData(
  dto: UpdateStoreDto,
  currentSiteDocument: Prisma.JsonValue | null = null,
  currentStore?: SiteDocumentLegacyStore,
): Prisma.StoreUpdateInput {
  const siteDocument = synchronizedSiteDocument(currentSiteDocument, dto, currentStore);
  const normalizedAnimations = dto.animations?.map(normalizeAnimationMedia);
  return {
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.tagline !== undefined && { tagline: dto.tagline }),
    ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
    ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
    ...(dto.backgroundColor !== undefined && { backgroundColor: dto.backgroundColor, backgroundMode: "solid", backgroundGradientStart: dto.backgroundColor, backgroundGradientEnd: dto.backgroundColor, backgroundGradientAngle: 0, backgroundImageUrl: null, boardTexture: "painted" }),
    ...(dto.contactPhone !== undefined && { contactPhone: dto.contactPhone }),
    ...(dto.contactEmail !== undefined && { contactEmail: dto.contactEmail }),
    ...(dto.contactFormEnabled !== undefined && { contactFormEnabled: dto.contactFormEnabled }),
    ...(dto.contactFormEmail !== undefined && { contactFormEmail: dto.contactFormEmail }),
    ...(dto.contactTitle !== undefined && { contactTitle: dto.contactTitle }),
    ...(dto.contactSubtitle !== undefined && { contactSubtitle: dto.contactSubtitle }),
    ...(dto.locationMapUrl !== undefined && { locationMapUrl: dto.locationMapUrl }),
    ...(dto.locationDescription !== undefined && { locationDescription: dto.locationDescription }),
    ...(dto.locationHighlight !== undefined && { locationHighlight: dto.locationHighlight }),
    ...(dto.locationTitle !== undefined && { locationTitle: dto.locationTitle }),
    ...(dto.locationSubtitle !== undefined && { locationSubtitle: dto.locationSubtitle }),
    ...(dto.locations !== undefined && { locations: storeLocationSnapshot(dto.locations) as unknown as Prisma.InputJsonValue }),
    ...(dto.aboutText !== undefined && { aboutText: dto.aboutText }),
    ...(dto.aboutTitle !== undefined && { aboutTitle: dto.aboutTitle }),
    ...(dto.aboutSubtitle !== undefined && { aboutSubtitle: dto.aboutSubtitle }),
    ...(dto.aboutImageUrl !== undefined && { aboutImageUrl: dto.aboutImageUrl }),
    ...(dto.catalogTitle !== undefined && { catalogTitle: dto.catalogTitle }),
    ...(dto.catalogSubtitle !== undefined && { catalogSubtitle: dto.catalogSubtitle }),
    ...(dto.galleryTitle !== undefined && { galleryTitle: dto.galleryTitle }),
    ...(dto.gallerySubtitle !== undefined && { gallerySubtitle: dto.gallerySubtitle }),
    ...(dto.linksTitle !== undefined && { linksTitle: dto.linksTitle }),
    ...(dto.accentColor !== undefined && { accentColor: dto.accentColor }),
    ...(dto.fontStyle !== undefined && { fontStyle: dto.fontStyle }),
    ...(dto.buttonStyle !== undefined && { buttonStyle: dto.buttonStyle }),
    ...(dto.boardTexture !== undefined && { boardTexture: dto.boardTexture }),
    ...(dto.announcement !== undefined && { announcement: dto.announcement }),
    ...(dto.announcementMode !== undefined && { announcementMode: dto.announcementMode }),
    ...(dto.announcementSpeed !== undefined && { announcementSpeed: dto.announcementSpeed }),
    ...(dto.announcementSize !== undefined && { announcementSize: dto.announcementSize }),
    ...(dto.announcementColor !== undefined && { announcementColor: dto.announcementColor }),
    ...(dto.announcementFont !== undefined && { announcementFont: dto.announcementFont }),
    ...(dto.announcementEffect !== undefined && { announcementEffect: dto.announcementEffect }),
    ...(dto.promotionEnabled !== undefined && { promotionEnabled: dto.promotionEnabled }),
    ...(dto.promotionImageUrl !== undefined && { promotionImageUrl: dto.promotionImageUrl }),
    ...(dto.promotionTitle !== undefined && { promotionTitle: dto.promotionTitle }),
    ...(dto.promotionBody !== undefined && { promotionBody: dto.promotionBody }),
    ...(dto.promotionCtaLabel !== undefined && { promotionCtaLabel: dto.promotionCtaLabel }),
    ...(dto.promotionCtaUrl !== undefined && { promotionCtaUrl: dto.promotionCtaUrl }),
    ...(dto.heroSlides !== undefined && { heroSlides: dto.heroSlides as unknown as Prisma.InputJsonValue }),
    ...(dto.contentOrder !== undefined && { contentOrder: dto.contentOrder as unknown as Prisma.InputJsonValue }),
    ...(dto.sectionBackgrounds !== undefined && { sectionBackgrounds: dto.sectionBackgrounds as unknown as Prisma.InputJsonValue }),
    ...(dto.layoutStyle !== undefined && { layoutStyle: dto.layoutStyle }),
    ...(dto.catalogLayout !== undefined && { catalogLayout: dto.catalogLayout }),
    ...(dto.experienceStyle !== undefined && { experienceStyle: dto.experienceStyle }),
    ...(dto.motionDuoEnabled !== undefined && { motionDuoEnabled: dto.motionDuoEnabled }),
    ...(dto.motionExperience !== undefined && { motionExperience: dto.motionExperience }),
    ...(dto.motionExperiences !== undefined && {
      motionExperiences: dto.motionExperiences as unknown as Prisma.InputJsonValue,
      motionExperience: dto.motionExperiences[0],
    }),
    ...(normalizedAnimations !== undefined && {
      animations: normalizedAnimations as unknown as Prisma.InputJsonValue,
      motionDuoEnabled: normalizedAnimations.length > 0,
      motionExperiences: [...new Set(normalizedAnimations.map((animation) => animation.type))] as unknown as Prisma.InputJsonValue,
      motionExperience: normalizedAnimations[0]?.type ?? "clarity-marquee",
    }),
    ...(dto.editorialGallery !== undefined && { editorialGallery: dto.editorialGallery as unknown as Prisma.InputJsonValue }),
    ...(dto.buttonVariant !== undefined && { buttonVariant: dto.buttonVariant }),
    ...(dto.buttonMotion !== undefined && { buttonMotion: dto.buttonMotion }),
    ...(dto.cartButtonLabel !== undefined && { cartButtonLabel: dto.cartButtonLabel }),
    ...(dto.checkoutMode !== undefined && { checkoutMode: dto.checkoutMode }),
    ...(dto.leadCaptureUrl !== undefined && { leadCaptureUrl: dto.leadCaptureUrl }),
    ...(dto.cartRecommendationsEnabled !== undefined && { cartRecommendationsEnabled: dto.cartRecommendationsEnabled }),
    ...(dto.cartRecommendationProductIds !== undefined && {
      cartRecommendationProductIds: dto.cartRecommendationProductIds as Prisma.InputJsonValue,
    }),
    ...(dto.showLowStockToCustomers !== undefined && { showLowStockToCustomers: dto.showLowStockToCustomers }),
    ...(dto.policies !== undefined && { policies: storePolicies(dto.policies) as Prisma.InputJsonValue }),
    ...(dto.publicVisibility !== undefined && { publicVisibility: dto.publicVisibility }),
    // normalizeAnalyticsId returns null for an empty or malformed value, so clearing a
    // field and pasting something the DTO somehow let through both land as "not configured"
    // rather than as a value the storefront would try to inject.
    ...(dto.analyticsGa4Id !== undefined && { analyticsGa4Id: normalizeAnalyticsId('analyticsGa4Id', dto.analyticsGa4Id) }),
    ...(dto.analyticsGtmId !== undefined && { analyticsGtmId: normalizeAnalyticsId('analyticsGtmId', dto.analyticsGtmId) }),
    ...(dto.analyticsMetaPixelId !== undefined && { analyticsMetaPixelId: normalizeAnalyticsId('analyticsMetaPixelId', dto.analyticsMetaPixelId) }),
    ...(dto.analyticsTiktokPixelId !== undefined && { analyticsTiktokPixelId: normalizeAnalyticsId('analyticsTiktokPixelId', dto.analyticsTiktokPixelId) }),
    ...(dto.salesGoalLabel !== undefined && { salesGoalLabel: dto.salesGoalLabel }),
    ...(dto.salesGoalAmount !== undefined && { salesGoalAmount: dto.salesGoalAmount }),
    ...(siteDocument !== undefined && { siteDocument }),
  };
}

export const STORE_POLICY_KEYS = ["returns", "delivery", "privacy", "terms"] as const;
export type StorePolicies = Partial<Record<(typeof STORE_POLICY_KEYS)[number], string>>;
/** Keeps only non-empty, trimmed policy texts under known keys; anything else is dropped. */
export function storePolicies(value: unknown): StorePolicies {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: StorePolicies = {};
  for (const key of STORE_POLICY_KEYS) {
    const text = typeof source[key] === "string" ? (source[key] as string).replace(/\r\n?/g, "\n").trim().slice(0, 6000) : "";
    if (text) result[key] = text;
  }
  return result;
}
