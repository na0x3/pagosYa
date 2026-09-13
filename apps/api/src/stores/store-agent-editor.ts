import { BadRequestException } from "@nestjs/common";
import {
  SITE_ART_DIRECTIONS,
  SITE_COLOR_STRATEGIES,
  SITE_COMPOSITION_GRAMMARS,
  SITE_DESIGN_GEOMETRIES,
  SITE_DESIGN_RHYTHMS,
  SITE_MEDIA_STRATEGIES,
  SITE_MOTION_LANGUAGES,
  SITE_TYPE_SCALES,
} from "@pagosya/shared-types";
import type { StoreSiteDocument } from "./site-document";
import { STORE_FONT_STYLES, STORE_MOTION_EXPERIENCES } from "./dto/create-store.dto";

export const STORE_AGENT_EDITOR_ENTITIES = [
  "art-direction",
  "design-genome",
  "theme",
  "navigation",
  "navigation-item",
  "page",
  "section",
  "section-item",
  "section-block",
  "section-media",
  "footer",
  "footer-column",
  "footer-link",
  "newsletter",
  "motion",
  "merchandising",
  "collection",
  "experience",
  "visual-setting",
  "content-order",
  "hero-slide",
  "editorial-image",
  "animation",
  "animation-text",
  "animation-media",
] as const;

export type StoreAgentEditorEntity = (typeof STORE_AGENT_EDITOR_ENTITIES)[number];
export type StoreAgentEditorAction = "set" | "add" | "remove" | "move" | "duplicate";

export const MAX_STORE_AGENT_OPERATIONS = 12;

export function assertStoreAgentOperationBudget(count: number): void {
  if (count > MAX_STORE_AGENT_OPERATIONS) {
    throw new BadRequestException(`Este pedido necesita ${count} pasos y Yapi admite hasta ${MAX_STORE_AGENT_OPERATIONS} por cambio. Divídelo en dos pedidos; no se aplicó ningún paso.`);
  }
}

/**
 * A compact, model-friendly command envelope. Every field is present in the
 * structured response; commands use only the fields documented in the catalog.
 */
export type StoreAgentEditorOperation = {
  action: StoreAgentEditorAction;
  entity: StoreAgentEditorEntity;
  targetId: string;
  parentId: string;
  field: string;
  value: string;
  secondaryValue: string;
  position: number;
};

const FONT_ROLES = new Set(["grotesk", "editorial", "humanist", "geometric", "classic", "mono", "artisan", "condensed", "luxury"]);
const SECTION_KINDS = new Set(["story", "catalog", "gallery", "contact", "location", "links"]);
const SECTION_LAYOUTS = new Set(["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"]);
const SECTION_WIDTHS = new Set(["full", "wide", "contained"]);
const SECTION_ALIGNS = new Set(["left", "center", "right"]);
const SECTION_MOTIONS = new Set(["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll"]);
const EXPERIENCE_TYPES = new Set(["none", "scroll-expansion", "hero-gallery-scroll", "image-stream", "full-screen-chapters", "frame-sequence", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path"]);
const ART_DIRECTIONS = new Set<string>(SITE_ART_DIRECTIONS);
const ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const FOOTER_HREF_PATTERN = /^(?:$|#[a-z][a-z0-9-]{0,63}$|\/(?!\/)[^\s]*$|https:\/\/[^\s]+$|mailto:[^\s]+$|tel:[+0-9() .-]+$)/i;

// Share the vocabulary with the planner so it cannot be told to use values the
// editor rejects (for example "center" for layout, which requires "centered").
const NAVIGATION_VALUES: Record<string, readonly string[]> = {
  layout: ["brand-left", "centered", "split"],
  barStyle: ["floating", "square", "full"],
  logoTreatment: ["mark", "wordmark", "oversized", "seal"],
  brandPosition: ["left", "center", "right"],
  navPosition: ["left", "center", "right"],
  searchPosition: ["left", "right"],
  profilePosition: ["left", "right"],
  cartPosition: ["left", "right"],
};

export const STORE_AGENT_EDITOR_CATALOG = `
Devuelve entre 1 y 12 operations. Cada operation usa action, entity, targetId,
parentId, field, value, secondaryValue y position. Usa IDs del inventario; cuando
agregues algo, targetId es un ID nuevo en minúsculas con guiones.

- art-direction set field=value: value ${SITE_ART_DIRECTIONS.join("|")}.
- design-genome set field composition|rhythm|geometry|colorStrategy|mediaStrategy|typeScale|motionLanguage, value según estas listas: composition=${SITE_COMPOSITION_GRAMMARS.join("|")}; rhythm=${SITE_DESIGN_RHYTHMS.join("|")}; geometry=${SITE_DESIGN_GEOMETRIES.join("|")}; colorStrategy=${SITE_COLOR_STRATEGIES.join("|")}; mediaStrategy=${SITE_MEDIA_STRATEGIES.join("|")}; typeScale=${SITE_TYPE_SCALES.join("|")}; motionLanguage=${SITE_MOTION_LANGUAGES.join("|")}.
- theme set field pageBackground|textColor|accentColor|secondaryColor|surfaceColor|mutedColor|borderColor|headingFont|bodyFont|radius|shadow|productLayout|displayScale|density|imageTreatment.
- navigation set: ${Object.entries(NAVIGATION_VALUES).map(([field, values]) => `field=${field}, value=${values.join("|")}`).join("; ")}; field=sticky|transparent, value=true|false. Para crear pestañas usa page y navigation-item; no son un layout de encabezado.
- navigation-item add: targetId nuevo, value=texto, secondaryValue=home|catalog|section:ID|page:ID. set/remove/move usa targetId existente; set field label|target.
- page add: targetId nuevo, value=nombre, secondaryValue=slug. set/remove usa targetId; set field label|slug. Al quitar una página también se quita sólo su contenido.
- section add: targetId nuevo, parentId vacío para Inicio o ID de página, field=story|catalog|gallery|contact|location|links, value=título. set/remove/move/duplicate usa targetId existente. Campos set: title|body|ctaLabel|layout|width|align|motion|backgroundColor|textColor|pageId|heightPx|mobileHeightPx|productIds.
- section-item add/set/remove/move: parentId=ID de sección, targetId=índice como texto para existentes, field title|body|mediaUrl y value.
- section-block add/set/remove/move/duplicate: parentId=ID de sección, targetId=ID de bloque. Al agregar, field=heading|text|action, value=texto. Campos set: text|fontStyle|textScale|textWidthPercent|textColor|textAlign|textOffsetX|textOffsetY.
- section-media add/set/remove/move: parentId=ID de sección, value=URL permitida, position=índice. Usa set para reemplazar una foto existente sin conservar la anterior.
- footer set field enabled|brandDescription|copyright|badge.
- footer-column add/set/remove/move: targetId=ID, value=título; set field=title.
- footer-link add: parentId=ID de columna, targetId=ID nuevo, value=texto, secondaryValue=destino. set/remove/move usa targetId existente; set field label|href.
- newsletter set field enabled|title|body|buttonLabel|successMessage.
- motion set field=intensity, value=restrained|expressive|cinematic.
- merchandising set field spotlightLayout|showDescriptions|collectionMenuStyle|featuredProductIds|productOrderIds. Las listas de productos son IDs separados por comas.
- collection add/set/remove/move: targetId=ID, value=nombre; set field name|productIds.
- experience set field type|placement|title|body|mediaUrls. Las listas de medios son URLs separadas por comas.
- visual-setting set field tagline|backgroundColor|backgroundMode|backgroundGradientStart|backgroundGradientEnd|backgroundGradientAngle|backgroundImageUrl|aboutText|aboutTitle|aboutSubtitle|aboutImageUrl|catalogTitle|catalogSubtitle|galleryTitle|gallerySubtitle|linksTitle|contactTitle|contactSubtitle|locationTitle|locationSubtitle|accentColor|fontStyle|buttonStyle|boardTexture|announcement|announcementMode|announcementSpeed|announcementSize|announcementColor|announcementFont|announcementEffect|promotionEnabled|promotionImageUrl|promotionTitle|promotionBody|promotionCtaLabel|promotionCtaUrl|layoutStyle|experienceStyle|buttonVariant|buttonMotion|cartButtonLabel.
- content-order move: targetId=clave existente (site-ID, animation-ID o sección base), position=índice final.
- hero-slide add/set/remove/move: targetId=índice como texto para existentes; al agregar value=URL permitida, secondaryValue=título. Campos set imageUrl|title|body|ctaLabel|ctaUrl.
- editorial-image add/set/remove/move: targetId=índice como texto; al agregar value=URL permitida. Campos set imageUrl|productId|title|caption|body|boxColor|textPositionX|textPositionY|textScale|textWidthPercent|textAlign|textColor|fontStyle.
- animation add/set/remove/move: targetId=ID; al agregar field=tipo registrado, value=nombre, parentId=ID de página opcional. Campos set name|type|pageId|title|subtitle|productId|buttonLabel|buttonPositionX|buttonPositionY|textPositionX|textPositionY|textScale|textWidthPercent|textAlign|textSize|textWidth|textColor|backgroundColor|fontStyle.
- animation-text add/set/remove/move/duplicate: parentId=ID de animación, targetId=ID de texto; al agregar field=title|subtitle y value=texto. Campos set text|textPositionX|textPositionY|textScale|textWidthPercent|textAlign|textColor|fontStyle.
- animation-media add/set/remove/move: parentId=ID de animación, targetId=índice como texto; al agregar value=URL permitida. Campos set imageUrl|productId|title|caption|body|boxColor|textPositionX|textPositionY|textScale|textWidthPercent|textAlign|textColor|fontStyle.

Nunca edites precios, stock, checkout, pagos, publicación, KYC, IDs de producto,
datos de otras tiendas. No inventes URLs, medios ni IDs existentes.
Si falta un dato imprescindible, devuelve operations=[] y explica qué falta en summary.`.trim();

function normalized(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function text(value: unknown, max: number, trim = true): string {
  const source = trim ? String(value ?? "").trim() : String(value ?? "");
  return Array.from(source).slice(0, max).join("");
}

function bool(value: string): boolean | null {
  if (/^(true|si|sí|yes|1)$/i.test(value.trim())) return true;
  if (/^(false|no|0)$/i.test(value.trim())) return false;
  return null;
}

function integer(value: string, minimum: number, maximum: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : null;
}

function csv(value: string): string[] {
  return [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
}

function safeId(value: string, fallback = ""): string {
  return ID_PATTERN.test(value) ? value : fallback;
}

function uniqueId(preferred: string, existing: Set<string>, fallback: string): string {
  const base = safeId(preferred, fallback);
  let candidate = base;
  for (let suffix = 2; existing.has(candidate); suffix += 1) candidate = `${base.slice(0, 44)}-${suffix}`;
  return candidate;
}

function locateByIdOrLabel<T extends { id: string }>(items: T[], requested: string, label: (item: T) => string): T | null {
  const byId = items.find((item) => item.id === requested);
  if (byId) return byId;
  const matches = items.filter((item) => normalized(label(item)) === normalized(requested));
  return matches.length === 1 ? matches[0] : null;
}

function move<T>(items: T[], fromIndex: number, requestedPosition: number): boolean {
  if (fromIndex < 0 || fromIndex >= items.length || !items.length) return false;
  const toIndex = Math.min(items.length - 1, Math.max(0, requestedPosition));
  if (fromIndex === toIndex) return false;
  const [item] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, item);
  return true;
}

function existingMedia(document: StoreSiteDocument): Set<string> {
  return new Set([
    ...document.sections.flatMap((section) => [
      ...section.mediaUrls,
      ...(section.items ?? []).flatMap((item) => item.mediaUrl ? [item.mediaUrl] : []),
    ]),
    ...document.experience.mediaUrls,
  ]);
}

function assertMediaAllowed(url: string, allowedMediaUrls: Set<string>) {
  if (!allowedMediaUrls.has(url)) throw new BadRequestException("Yapi sólo puede usar imágenes ya presentes en la tienda o adjuntadas por el comercio.");
}

function defaultSection(document: StoreSiteDocument, operation: StoreAgentEditorOperation): StoreSiteDocument["sections"][number] {
  const kind = SECTION_KINDS.has(operation.field) ? operation.field as StoreSiteDocument["sections"][number]["kind"] : null;
  if (!kind) throw new BadRequestException("El tipo de sección solicitado no está disponible en el editor.");
  const theme = document.theme;
  return {
    id: operation.targetId,
    ...(operation.parentId ? { pageId: operation.parentId } : {}),
    ...(kind === "catalog" ? { productIds: [] } : {}),
    kind,
    family: kind === "catalog" ? "product-led" : kind === "gallery" ? "cinematic" : "editorial",
    layout: kind === "gallery" || kind === "catalog" ? "grid" : kind === "links" ? "minimal" : "split",
    width: kind === "gallery" || kind === "catalog" ? "full" : "wide",
    align: kind === "links" ? "center" : "left",
    motion: "none",
    title: text(operation.value || `Nueva ${kind}`, 120),
    body: "",
    ctaLabel: "",
    backgroundColor: theme.surfaceColor,
    textColor: theme.textColor,
    mediaUrls: [],
    items: [],
  };
}

export function storeAgentEditableInventory(
  document: StoreSiteDocument,
  productIds: ReadonlySet<string>,
  mediaUrls: ReadonlySet<string>,
  visualConfig: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    artDirection: document.artDirection ?? "",
    designGenome: document.designGenome,
    theme: document.theme,
    navigation: document.navigation,
    pages: document.pages ?? [],
    sections: document.sections.map((section) => ({
      id: section.id,
      pageId: section.pageId ?? "",
      kind: section.kind,
      title: section.title,
      fields: { body: section.body, ctaLabel: section.ctaLabel, layout: section.layout, width: section.width, align: section.align, motion: section.motion, backgroundColor: section.backgroundColor, textColor: section.textColor, heightPx: section.heightPx, mobileHeightPx: section.mobileHeightPx },
      productIds: section.productIds ?? [],
      mediaUrls: section.mediaUrls,
      items: section.items ?? [],
      blocks: section.blocks ?? [],
    })),
    footer: document.footer ?? null,
    motion: document.motion,
    merchandising: document.merchandising,
    experience: document.experience,
    allowedProductIds: [...productIds],
    allowedMediaUrls: [...mediaUrls],
    proposalVisuals: {
      announcement: visualConfig.announcement ?? null,
      promotion: { enabled: visualConfig.promotionEnabled ?? false, title: visualConfig.promotionTitle ?? null, body: visualConfig.promotionBody ?? null, ctaLabel: visualConfig.promotionCtaLabel ?? null, ctaUrl: visualConfig.promotionCtaUrl ?? null },
      contentOrder: visualConfig.contentOrder ?? [],
      heroSlides: visualConfig.heroSlides ?? [],
      editorialGallery: visualConfig.editorialGallery ?? [],
      animations: visualConfig.animations ?? [],
      editableSettings: Object.fromEntries(Object.entries(visualConfig).filter(([key]) => !["siteDocument", "animations", "heroSlides", "editorialGallery", "contentOrder"].includes(key))),
    },
  });
}

export function applyStoreAgentEditorOperations(
  source: StoreSiteDocument,
  operations: readonly StoreAgentEditorOperation[],
  options: { allowedProductIds?: ReadonlySet<string>; allowedMediaUrls?: ReadonlySet<string> } = {},
): { document: StoreSiteDocument; changedAreas: string[] } {
  assertStoreAgentOperationBudget(operations.length);
  if (!operations.length) throw new BadRequestException("Yapi no encontró una operación concreta que pudiera aplicar con seguridad.");
  const document = structuredClone(source);
  const allowedProducts = new Set(options.allowedProductIds ?? []);
  const allowedMedia = new Set([...existingMedia(source), ...(options.allowedMediaUrls ?? [])]);
  const changedAreas = new Set<string>();
  let changed = false;

  const mark = (area: string) => { changed = true; changedAreas.add(area); };
  const sections = document.sections;
  const pages = document.pages ?? [];
  document.navigation.items ??= [];

  for (const operation of operations) {
    if (!operation || !["set", "add", "remove", "move", "duplicate"].includes(operation.action) || !STORE_AGENT_EDITOR_ENTITIES.includes(operation.entity)) {
      throw new BadRequestException("Yapi propuso una operación visual que esta versión del editor no reconoce.");
    }

    if (operation.entity === "art-direction") {
      if (operation.action !== "set" || !ART_DIRECTIONS.has(operation.value)) throw new BadRequestException("La dirección artística solicitada no está disponible.");
      if (document.artDirection !== operation.value) { document.artDirection = operation.value as StoreSiteDocument["artDirection"]; mark("dirección artística"); }
      continue;
    }

    if (operation.entity === "design-genome") {
      const allowed: Record<string, Set<string>> = {
        composition: new Set(SITE_COMPOSITION_GRAMMARS),
        rhythm: new Set(SITE_DESIGN_RHYTHMS),
        geometry: new Set(SITE_DESIGN_GEOMETRIES),
        colorStrategy: new Set(SITE_COLOR_STRATEGIES),
        mediaStrategy: new Set(SITE_MEDIA_STRATEGIES),
        typeScale: new Set(SITE_TYPE_SCALES),
        motionLanguage: new Set(SITE_MOTION_LANGUAGES),
      };
      if (operation.action !== "set" || !allowed[operation.field]?.has(operation.value)) throw new BadRequestException("Ese ajuste del sistema visual no está disponible.");
      const genome = document.designGenome as unknown as Record<string, string>;
      if (genome[operation.field] !== operation.value) { genome[operation.field] = operation.value; mark("sistema visual"); }
      continue;
    }

    if (operation.entity === "theme") {
      if (operation.action !== "set") throw new BadRequestException("El tema sólo admite cambios de campos existentes.");
      const theme = document.theme as unknown as Record<string, unknown>;
      const colors = new Set(["pageBackground", "textColor", "accentColor", "secondaryColor", "surfaceColor", "mutedColor", "borderColor"]);
      const enums: Record<string, Set<string>> = {
        headingFont: FONT_ROLES, bodyFont: FONT_ROLES,
        shadow: new Set(["none", "soft", "lifted"]), productLayout: new Set(["gallery", "editorial", "compact", "showcase"]),
        displayScale: new Set(["balanced", "dramatic", "monumental"]), density: new Set(["airy", "balanced", "dense"]),
        imageTreatment: new Set(["natural", "cinematic", "cutout", "editorial"]),
      };
      let value: string | number = operation.value;
      if (colors.has(operation.field)) {
        if (!COLOR_PATTERN.test(value)) throw new BadRequestException("Los colores deben indicarse en formato hexadecimal, por ejemplo #112233.");
        value = value.toLowerCase();
      } else if (operation.field === "radius") {
        const parsed = integer(value, 0, 32);
        if (parsed === null) throw new BadRequestException("El radio del tema debe ser un número entre 0 y 32.");
        value = parsed;
      } else if (!enums[operation.field]?.has(value)) throw new BadRequestException("Ese valor no está disponible para el tema.");
      if (theme[operation.field] !== value) { theme[operation.field] = value; mark("tema"); }
      continue;
    }

    if (operation.entity === "navigation") {
      if (operation.action !== "set") throw new BadRequestException("Usa navigation-item para agregar, quitar o mover enlaces del menú.");
      const navigation = document.navigation as unknown as Record<string, unknown>;
      let value: string | boolean = operation.value;
      if (["sticky", "transparent"].includes(operation.field)) {
        const parsed = bool(value); if (parsed === null) throw new BadRequestException("Ese ajuste del encabezado debe ser sí o no."); value = parsed;
      } else if (!NAVIGATION_VALUES[operation.field]?.includes(value)) throw new BadRequestException("Ese ajuste del encabezado no está disponible.");
      if (navigation[operation.field] !== value) { navigation[operation.field] = value; mark("encabezado"); }
      continue;
    }

    if (operation.entity === "navigation-item") {
      const items = document.navigation.items;
      if (operation.action === "add") {
        if (items.length >= 8) throw new BadRequestException("El menú ya alcanzó su máximo de 8 enlaces.");
        const id = uniqueId(operation.targetId, new Set(items.map((item) => item.id)), "nav-link");
        const destination = operation.secondaryValue;
        const item: StoreSiteDocument["navigation"]["items"] extends Array<infer T> | undefined ? T : never = { id, label: text(operation.value || "Nuevo enlace", 40), target: "home" };
        if (destination === "catalog") item.target = "catalog";
        else if (destination.startsWith("section:") && sections.some((section) => section.id === destination.slice(8))) { item.target = "section"; item.sectionId = destination.slice(8); }
        else if (destination.startsWith("page:") && pages.some((page) => page.id === destination.slice(5))) { item.target = "page"; item.pageId = destination.slice(5); }
        else if (destination && destination !== "home") throw new BadRequestException("El destino del nuevo enlace del menú no existe.");
        items.push(item); mark("menú"); continue;
      }
      const item = locateByIdOrLabel(items, operation.targetId, (candidate) => candidate.label);
      if (!item) throw new BadRequestException(`No encontré el enlace “${operation.targetId}” en el menú.`);
      const index = items.indexOf(item);
      if (operation.action === "remove") { items.splice(index, 1); mark("menú"); continue; }
      if (operation.action === "move") { if (move(items, index, operation.position)) mark("menú"); continue; }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para enlaces del menú.");
      if (operation.field === "label") { const value = text(operation.value, 40); if (item.label !== value) { item.label = value; mark("menú"); } continue; }
      if (operation.field !== "target") throw new BadRequestException("Sólo se puede cambiar el texto o destino de un enlace del menú.");
      delete item.sectionId; delete item.pageId;
      if (operation.value === "home" || operation.value === "catalog") item.target = operation.value;
      else if (operation.value.startsWith("section:") && sections.some((section) => section.id === operation.value.slice(8))) { item.target = "section"; item.sectionId = operation.value.slice(8); }
      else if (operation.value.startsWith("page:") && pages.some((page) => page.id === operation.value.slice(5))) { item.target = "page"; item.pageId = operation.value.slice(5); }
      else throw new BadRequestException("El destino solicitado para el menú no existe.");
      mark("menú"); continue;
    }

    if (operation.entity === "page") {
      if (operation.action === "add") {
        if (pages.length >= 6) throw new BadRequestException("La tienda ya alcanzó su máximo de 6 páginas adicionales.");
        const id = uniqueId(operation.targetId, new Set(pages.map((page) => page.id)), `page-${pages.length + 1}`);
        const slug = text(operation.secondaryValue, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (!slug || ["home", "catalog", "inicio", "tienda"].includes(slug) || pages.some((page) => page.slug === slug)) throw new BadRequestException("La URL de la nueva página no es válida o ya existe.");
        pages.push({ id, label: text(operation.value || "Nueva página", 40), slug });
        document.pages = pages;
        document.navigation.items.push({ id: uniqueId(`nav-${id}`, new Set(document.navigation.items.map((item) => item.id)), "nav-page"), label: text(operation.value || "Nueva página", 40), target: "page", pageId: id });
        mark("páginas"); continue;
      }
      const page = locateByIdOrLabel(pages, operation.targetId, (candidate) => candidate.label);
      if (!page) throw new BadRequestException(`No encontré la página “${operation.targetId}”.`);
      if (operation.action === "remove") {
        const owned = new Set(sections.filter((section) => section.pageId === page.id).map((section) => section.id));
        document.sections = sections.filter((section) => section.pageId !== page.id);
        document.navigation.items = document.navigation.items.filter((item) => item.pageId !== page.id && (!item.sectionId || !owned.has(item.sectionId)));
        pages.splice(pages.indexOf(page), 1); mark("páginas"); continue;
      }
      if (operation.action !== "set" || !["label", "slug"].includes(operation.field)) throw new BadRequestException("Sólo se puede cambiar el nombre o URL de una página existente.");
      const value = operation.field === "slug" ? text(operation.value, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : text(operation.value, 40);
      if (!value || (operation.field === "slug" && pages.some((candidate) => candidate !== page && candidate.slug === value))) throw new BadRequestException("El nombre o URL de la página no es válido.");
      (page as unknown as Record<string, string>)[operation.field] = value; mark("páginas"); continue;
    }

    if (operation.entity === "section") {
      if (operation.action === "add") {
        if (sections.length >= 24) throw new BadRequestException("La tienda ya alcanzó el máximo de secciones editables.");
        if (operation.parentId && !pages.some((page) => page.id === operation.parentId)) throw new BadRequestException("La página indicada para la nueva sección no existe.");
        const id = uniqueId(operation.targetId, new Set(sections.map((section) => section.id)), "section-new");
        sections.push(defaultSection(document, { ...operation, targetId: id })); mark("secciones"); continue;
      }
      const section = locateByIdOrLabel(sections, operation.targetId, (candidate) => candidate.title);
      if (!section) throw new BadRequestException(`No encontré la sección “${operation.targetId}”.`);
      const index = sections.indexOf(section);
      if (operation.action === "remove") {
        if (["hero", "catalog", "contact"].includes(section.kind)) throw new BadRequestException("La portada, el catálogo principal y el contacto se protegen; puedes editar u ocultar su contenido, pero no eliminarlos.");
        sections.splice(index, 1); document.navigation.items = document.navigation.items.filter((item) => item.sectionId !== section.id); mark("secciones"); continue;
      }
      if (operation.action === "move") {
        const siblings = sections.filter((candidate) => (candidate.pageId ?? "") === (section.pageId ?? ""));
        const siblingTarget = siblings[Math.min(siblings.length - 1, Math.max(0, operation.position))];
        if (siblingTarget && move(sections, index, sections.indexOf(siblingTarget))) mark("orden de secciones"); continue;
      }
      if (operation.action === "duplicate") {
        if (sections.length >= 24) throw new BadRequestException("La tienda ya alcanzó el máximo de secciones editables.");
        const copy = structuredClone(section); copy.id = uniqueId(operation.secondaryValue || `${section.id}-copy`, new Set(sections.map((candidate) => candidate.id)), "section-copy");
        sections.splice(index + 1, 0, copy); mark("secciones"); continue;
      }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para secciones.");
      const record = section as unknown as Record<string, unknown>;
      let value: unknown = operation.value;
      if (operation.field === "title") value = text(value, 120, false);
      else if (operation.field === "body") value = text(value, 600, false);
      else if (operation.field === "ctaLabel") value = text(value, 40, false);
      else if (operation.field === "layout" && SECTION_LAYOUTS.has(String(value))) value = String(value);
      else if (operation.field === "width" && SECTION_WIDTHS.has(String(value))) value = String(value);
      else if (operation.field === "align" && SECTION_ALIGNS.has(String(value))) value = String(value);
      else if (operation.field === "motion" && SECTION_MOTIONS.has(String(value))) value = String(value);
      else if (["backgroundColor", "textColor"].includes(operation.field) && COLOR_PATTERN.test(String(value))) value = String(value).toLowerCase();
      else if (["heightPx", "mobileHeightPx"].includes(operation.field)) { value = operation.value ? integer(operation.value, 180, 1800) : undefined; if (operation.value && value === null) throw new BadRequestException("El alto de sección debe estar entre 180 y 1800 px."); }
      else if (operation.field === "pageId") { if (value && !pages.some((page) => page.id === value)) throw new BadRequestException("La página de destino de la sección no existe."); value = value || undefined; }
      else if (operation.field === "productIds") { const ids = csv(operation.value); if (ids.some((id) => !allowedProducts.has(id))) throw new BadRequestException("Uno de los productos indicados no pertenece a esta tienda."); value = ids; }
      else throw new BadRequestException(`El campo “${operation.field}” no es editable en una sección.`);
      if (value === undefined) delete record[operation.field]; else record[operation.field] = value;
      const copyBlock = section.blocks?.find((block) => block.id === ({ title: "heading", body: "body", ctaLabel: "action" } as Record<string, string>)[operation.field]);
      if (copyBlock && typeof value === "string") copyBlock.text = value;
      mark(section.kind === "hero" ? "apertura" : `sección ${section.kind}`); continue;
    }

    if (["section-item", "section-media", "section-block"].includes(operation.entity)) {
      const section = locateByIdOrLabel(sections, operation.parentId, (candidate) => candidate.title);
      if (!section) throw new BadRequestException(`No encontré la sección “${operation.parentId}”.`);
      if (operation.entity === "section-media") {
        if (operation.action === "add") {
          assertMediaAllowed(operation.value, allowedMedia);
          if (!section.mediaUrls.includes(operation.value) && section.mediaUrls.length < 12) {
            const insertAt = operation.position >= 0 ? Math.min(operation.position, section.mediaUrls.length) : section.mediaUrls.length;
            section.mediaUrls.splice(insertAt, 0, operation.value);
            mark("medios");
          }
          continue;
        }
        const index = operation.position >= 0 ? operation.position : section.mediaUrls.indexOf(operation.value);
        if (index < 0 || index >= section.mediaUrls.length) throw new BadRequestException("No encontré esa imagen en la sección.");
        if (operation.action === "set") {
          assertMediaAllowed(operation.value, allowedMedia);
          if (section.mediaUrls[index] !== operation.value) {
            section.mediaUrls[index] = operation.value;
            const projected = section.blocks?.find((block) => block.id === `media-${index + 1}`);
            if (projected?.kind === "media") projected.mediaUrl = operation.value;
            mark("medios");
          }
          continue;
        }
        if (operation.action === "remove") { section.mediaUrls.splice(index, 1); mark("medios"); continue; }
        if (operation.action === "move") { if (move(section.mediaUrls, index, Number(operation.secondaryValue))) mark("medios"); continue; }
        throw new BadRequestException("Esa operación no está disponible para imágenes de sección.");
      }
      if (operation.entity === "section-item") {
        section.items ??= [];
        const index = Number(operation.targetId);
        if (operation.action === "add") { if (section.items.length >= 12) throw new BadRequestException("La sección ya alcanzó su máximo de escenas."); section.items.push({ title: text(operation.value, 100), body: text(operation.secondaryValue, 320), mediaUrl: null }); mark("contenido"); continue; }
        if (!Number.isInteger(index) || !section.items[index]) throw new BadRequestException("No encontré la escena indicada en la sección.");
        if (operation.action === "remove") { section.items.splice(index, 1); mark("contenido"); continue; }
        if (operation.action === "move") { if (move(section.items, index, operation.position)) mark("contenido"); continue; }
        if (operation.action !== "set" || !["title", "body", "mediaUrl"].includes(operation.field)) throw new BadRequestException("Esa operación no está disponible para escenas.");
        if (operation.field === "mediaUrl" && operation.value) assertMediaAllowed(operation.value, allowedMedia);
        (section.items[index] as unknown as Record<string, unknown>)[operation.field] = operation.field === "title" ? text(operation.value, 100) : operation.field === "body" ? text(operation.value, 320) : operation.value || null;
        const projected = section.blocks?.flatMap((block) => [block, ...(block.children || [])]).find((block) => block.id === `chapter-${index + 1}-${operation.field === "title" ? "heading" : operation.field === "mediaUrl" ? "media" : "body"}`);
        if (projected) {
          if (operation.field === "mediaUrl") projected.mediaUrl = operation.value || null;
          else projected.text = String((section.items[index] as any)[operation.field]);
        }
        mark("contenido"); continue;
      }
      section.blocks ??= [];
      const blocks = section.blocks;
      const block = blocks.find((candidate) => candidate.id === operation.targetId)
        ?? (operation.action === "set" ? blocks.flatMap((candidate) => candidate.children || []).find((candidate) => candidate.id === operation.targetId) : undefined);
      if (operation.action === "add") {
        if (blocks.length >= 16 || !["heading", "text", "action"].includes(operation.field)) throw new BadRequestException("No se puede agregar otro bloque de texto a esa sección.");
        const id = uniqueId(operation.targetId, new Set(blocks.map((candidate) => candidate.id)), `${operation.field}-new`);
        blocks.push({ id, kind: operation.field as "heading", slot: operation.field === "heading" ? "heading" : operation.field === "action" ? "actions" : "body", role: operation.field === "text" ? "supporting" : "primary", text: text(operation.value, operation.field === "action" ? 40 : operation.field === "heading" ? 120 : 600), mediaUrl: null, children: [] }); mark("textos"); continue;
      }
      if (!block) throw new BadRequestException(`No encontré el bloque de texto “${operation.targetId}”.`);
      const index = blocks.indexOf(block);
      if (operation.action === "remove") { blocks.splice(index, 1); mark("textos"); continue; }
      if (operation.action === "move") { if (move(blocks, index, operation.position)) mark("textos"); continue; }
      if (operation.action === "duplicate") { const copy = structuredClone(block); copy.id = uniqueId(operation.secondaryValue || `${block.id}-copy`, new Set(blocks.map((candidate) => candidate.id)), "text-copy"); blocks.splice(index + 1, 0, copy); mark("textos"); continue; }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para textos.");
      if (operation.field === "text") block.text = text(operation.value, block.kind === "action" ? 40 : block.kind === "heading" ? 120 : 600, false);
      else if (operation.field === "mediaUrl" && block.kind === "media") {
        assertMediaAllowed(operation.value, allowedMedia);
        block.mediaUrl = operation.value;
      }
      else {
        block.style ??= {};
        const style = block.style as Record<string, unknown>;
        if (operation.field === "fontStyle" && FONT_ROLES.has(operation.value)) style.fontStyle = operation.value;
        else if (operation.field === "textColor" && COLOR_PATTERN.test(operation.value)) style.textColor = operation.value.toLowerCase();
        else if (operation.field === "textAlign" && SECTION_ALIGNS.has(operation.value)) style.textAlign = operation.value;
        else if (["textScale", "textWidthPercent"].includes(operation.field)) { const parsed = integer(operation.value, operation.field === "textScale" ? 50 : 20, operation.field === "textScale" ? 200 : 100); if (parsed === null) throw new BadRequestException("Ese tamaño de texto no es válido."); style[operation.field] = parsed; }
        else if (["textOffsetX", "textOffsetY"].includes(operation.field)) { const parsed = integer(operation.value, -1000, 1000); if (parsed === null) throw new BadRequestException("Esa posición de texto no es válida."); style[operation.field] = parsed; style.textOffsetBasis = "section"; }
        else throw new BadRequestException(`El campo “${operation.field}” no es editable en un texto.`);
      }
      if (block.id === "heading") section.title = block.text;
      if (block.id === "body") section.body = block.text;
      if (block.id === "action") section.ctaLabel = block.text;
      const chapter = /^chapter-(\d+)-(heading|body|media)$/.exec(block.id);
      if (chapter && section.items?.[Number(chapter[1]) - 1]) {
        const item = section.items[Number(chapter[1]) - 1];
        if (chapter[2] === "heading") item.title = block.text;
        if (chapter[2] === "body") item.body = block.text;
        if (chapter[2] === "media") item.mediaUrl = block.mediaUrl;
      }
      const mediaSlot = /^media-(\d+)$/.exec(block.id);
      if (mediaSlot && Number(mediaSlot[1]) <= section.mediaUrls.length && block.mediaUrl) section.mediaUrls[Number(mediaSlot[1]) - 1] = block.mediaUrl;
      mark(operation.field === "mediaUrl" ? "medios" : "textos"); continue;
    }

    if (["footer", "footer-column", "footer-link", "newsletter"].includes(operation.entity)) {
      document.footer ??= { enabled: true, brandDescription: "", columns: [], copyright: "", badge: "" };
      const footer = document.footer;
      if (operation.entity === "footer") {
        if (operation.action !== "set") throw new BadRequestException("Usa footer-column o footer-link para cambiar la estructura del pie de página.");
        const limits: Record<string, number> = { brandDescription: 320, copyright: 160, badge: 80 };
        if (operation.field === "enabled") { const value = bool(operation.value); if (value === null) throw new BadRequestException("La visibilidad del pie debe ser sí o no."); footer.enabled = value; }
        else if (limits[operation.field]) (footer as unknown as Record<string, unknown>)[operation.field] = text(operation.value, limits[operation.field]);
        else throw new BadRequestException("Ese campo no es editable en el pie de página.");
        mark("pie de página"); continue;
      }
      if (operation.entity === "footer-column") {
        if (operation.action === "add") { if (footer.columns.length >= 4) throw new BadRequestException("El pie ya alcanzó su máximo de 4 columnas."); footer.columns.push({ id: uniqueId(operation.targetId, new Set(footer.columns.map((column) => column.id)), "column-new"), title: text(operation.value || "Nueva columna", 60), items: [] }); mark("pie de página"); continue; }
        const column = locateByIdOrLabel(footer.columns, operation.targetId, (candidate) => candidate.title);
        if (!column) throw new BadRequestException(`No encontré la columna “${operation.targetId}” en el pie de página.`);
        const index = footer.columns.indexOf(column);
        if (operation.action === "remove") { footer.columns.splice(index, 1); mark("pie de página"); continue; }
        if (operation.action === "move") { if (move(footer.columns, index, operation.position)) mark("pie de página"); continue; }
        if (operation.action === "set" && operation.field === "title") { column.title = text(operation.value, 60); mark("pie de página"); continue; }
        throw new BadRequestException("Esa operación no está disponible para columnas del pie.");
      }
      if (operation.entity === "footer-link") {
        const all = footer.columns.flatMap((column) => column.items.map((item) => ({ column, item })));
        if (operation.action === "add") {
          const column = locateByIdOrLabel(footer.columns, operation.parentId, (candidate) => candidate.title);
          if (!column || column.items.length >= 8) throw new BadRequestException("No encontré la columna o ya alcanzó su máximo de enlaces.");
          if (!FOOTER_HREF_PATTERN.test(operation.secondaryValue)) throw new BadRequestException("El destino del enlace del pie no es válido.");
          column.items.push({ id: uniqueId(operation.targetId, new Set(column.items.map((item) => item.id)), "footer-link"), label: text(operation.value || "Nuevo enlace", 100), href: text(operation.secondaryValue, 500) }); mark("pie de página"); continue;
        }
        const matches = all.filter(({ item }) => item.id === operation.targetId || normalized(item.label) === normalized(operation.targetId));
        if (matches.length !== 1) throw new BadRequestException(matches.length ? `Hay más de un enlace llamado “${operation.targetId}”. Usa su ID exacto.` : `No encontré el enlace “${operation.targetId}” en el pie de página.`);
        const { column, item } = matches[0]; const index = column.items.indexOf(item);
        if (operation.action === "remove") { column.items.splice(index, 1); mark("pie de página"); continue; }
        if (operation.action === "move") { if (move(column.items, index, operation.position)) mark("pie de página"); continue; }
        if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para enlaces del pie.");
        if (operation.field === "label") item.label = text(operation.value, 100);
        else if (operation.field === "href" && FOOTER_HREF_PATTERN.test(operation.value)) item.href = text(operation.value, 500);
        else throw new BadRequestException("Sólo se puede cambiar el texto o un destino seguro del enlace.");
        mark("pie de página"); continue;
      }
      footer.newsletter ??= { enabled: true, title: "Novedades", body: "", buttonLabel: "Suscribirme", successMessage: "Gracias por suscribirte." };
      if (operation.action !== "set") throw new BadRequestException("El boletín admite cambios de sus campos existentes.");
      const limits: Record<string, number> = { title: 80, body: 240, buttonLabel: 40, successMessage: 120 };
      if (operation.field === "enabled") { const value = bool(operation.value); if (value === null) throw new BadRequestException("La visibilidad del boletín debe ser sí o no."); footer.newsletter.enabled = value; }
      else if (limits[operation.field]) (footer.newsletter as unknown as Record<string, unknown>)[operation.field] = text(operation.value, limits[operation.field]);
      else throw new BadRequestException("Ese campo no es editable en el boletín.");
      mark("boletín"); continue;
    }

    if (operation.entity === "motion") {
      if (operation.action !== "set" || operation.field !== "intensity" || !["restrained", "expressive", "cinematic"].includes(operation.value)) throw new BadRequestException("La intensidad de movimiento solicitada no está disponible.");
      document.motion.intensity = operation.value as StoreSiteDocument["motion"]["intensity"]; mark("movimiento"); continue;
    }

    if (operation.entity === "merchandising") {
      if (operation.action !== "set") throw new BadRequestException("Ese cambio de catálogo no está disponible.");
      if (operation.field === "showDescriptions") { const value = bool(operation.value); if (value === null) throw new BadRequestException("Ese ajuste debe ser sí o no."); document.merchandising.showDescriptions = value; }
      else if (operation.field === "spotlightLayout" && ["feature-first", "alternating", "lookbook", "collection"].includes(operation.value)) document.merchandising.spotlightLayout = operation.value as StoreSiteDocument["merchandising"]["spotlightLayout"];
      else if (operation.field === "collectionMenuStyle" && ["tabs", "editorial-sidebar"].includes(operation.value)) document.merchandising.collectionMenuStyle = operation.value as "tabs";
      else if (["featuredProductIds", "productOrderIds"].includes(operation.field)) { const ids = csv(operation.value); if (ids.some((id) => !allowedProducts.has(id))) throw new BadRequestException("Uno de los productos indicados no pertenece a esta tienda."); (document.merchandising as unknown as Record<string, unknown>)[operation.field] = ids; }
      else throw new BadRequestException("Ese ajuste de catálogo no está disponible.");
      mark("presentación del catálogo"); continue;
    }

    if (operation.entity === "collection") {
      document.merchandising.collections ??= [];
      const collections = document.merchandising.collections;
      if (operation.action === "add") { if (collections.length >= 12) throw new BadRequestException("Ya existen 12 colecciones."); collections.push({ id: uniqueId(operation.targetId, new Set(collections.map((entry) => entry.id)), "collection-new"), name: text(operation.value || "Nueva colección", 60), productIds: [] }); mark("colecciones"); continue; }
      const collection = locateByIdOrLabel(collections, operation.targetId, (candidate) => candidate.name);
      if (!collection) throw new BadRequestException(`No encontré la colección “${operation.targetId}”.`);
      const index = collections.indexOf(collection);
      if (operation.action === "remove") { collections.splice(index, 1); mark("colecciones"); continue; }
      if (operation.action === "move") { if (move(collections, index, operation.position)) mark("colecciones"); continue; }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para colecciones.");
      if (operation.field === "name") collection.name = text(operation.value, 60);
      else if (operation.field === "productIds") { const ids = csv(operation.value); if (ids.some((id) => !allowedProducts.has(id))) throw new BadRequestException("Uno de los productos indicados no pertenece a esta tienda."); collection.productIds = ids; }
      else throw new BadRequestException("Sólo se puede cambiar el nombre o los productos de una colección.");
      mark("colecciones"); continue;
    }

    if (operation.entity === "experience") {
      if (operation.action !== "set") throw new BadRequestException("La experiencia visual admite cambios de sus campos existentes.");
      if (operation.field === "type" && EXPERIENCE_TYPES.has(operation.value)) document.experience.type = operation.value as StoreSiteDocument["experience"]["type"];
      else if (operation.field === "placement" && ["after-hero", "after-story", "after-catalog"].includes(operation.value)) document.experience.placement = operation.value as StoreSiteDocument["experience"]["placement"];
      else if (operation.field === "title") document.experience.title = text(operation.value, 100);
      else if (operation.field === "body") document.experience.body = text(operation.value, 360);
      else if (operation.field === "mediaUrls") { const urls = csv(operation.value); urls.forEach((url) => assertMediaAllowed(url, allowedMedia)); document.experience.mediaUrls = urls.slice(0, 8); }
      else throw new BadRequestException("Ese campo no es editable en la experiencia visual.");
      mark("experiencia visual"); continue;
    }
  }

  if (!changed) throw new BadRequestException("La instrucción no produciría ningún cambio en el borrador actual.");
  document.direction = `${source.direction || "Dirección propia"} · edición de Yapi`.slice(0, 120);
  return { document, changedAreas: [...changedAreas] };
}

const PROPOSAL_VISUAL_ENTITIES = new Set<StoreAgentEditorEntity>([
  "visual-setting", "content-order", "hero-slide", "editorial-image", "animation", "animation-text", "animation-media",
]);

export function storeAgentOperationIsProposalVisual(operation: StoreAgentEditorOperation): boolean {
  return PROPOSAL_VISUAL_ENTITIES.has(operation.entity);
}

function proposalMedia(config: Record<string, any>): Set<string> {
  return new Set([
    config.bannerUrl, config.backgroundImageUrl, config.aboutImageUrl, config.promotionImageUrl,
    ...(Array.isArray(config.heroSlides) ? config.heroSlides.map((entry: Record<string, unknown>) => entry?.imageUrl) : []),
    ...(Array.isArray(config.editorialGallery) ? config.editorialGallery.map((entry: Record<string, unknown>) => entry?.imageUrl) : []),
    ...(Array.isArray(config.animations) ? config.animations.flatMap((entry: Record<string, any>) => Array.isArray(entry?.media) ? entry.media.map((media: Record<string, unknown>) => media?.imageUrl) : []) : []),
  ].filter((value): value is string => typeof value === "string" && Boolean(value)));
}

function setBoundedVisualField(target: Record<string, any>, field: string, rawValue: string): boolean {
  const textLimits: Record<string, number> = {
    tagline: 160, aboutText: 600, aboutTitle: 100, aboutSubtitle: 320, catalogTitle: 100, catalogSubtitle: 320,
    galleryTitle: 100, gallerySubtitle: 320, linksTitle: 100, contactTitle: 100, contactSubtitle: 320,
    locationTitle: 100, locationSubtitle: 220, announcement: 160, promotionTitle: 80, promotionBody: 280,
    promotionCtaLabel: 36, cartButtonLabel: 36,
  };
  const colors = new Set(["backgroundColor", "backgroundGradientStart", "backgroundGradientEnd", "accentColor", "announcementColor"]);
  const booleans = new Set(["promotionEnabled", "motionDuoEnabled", "contactFormEnabled"]);
  const enums: Record<string, Set<string>> = {
    backgroundMode: new Set(["solid", "gradient", "image"]), fontStyle: new Set(STORE_FONT_STYLES),
    buttonStyle: new Set(["rounded", "pill", "square"]), boardTexture: new Set(["chalkboard", "kraft", "painted"]),
    announcementMode: new Set(["static", "marquee"]), announcementSize: new Set(["small", "medium", "large"]),
    announcementFont: new Set(["store", ...STORE_FONT_STYLES]), announcementEffect: new Set(["none", "wave", "pulse", "sparkle"]),
    layoutStyle: new Set(["cinematic", "editorial", "collage", "catalog-first"]), experienceStyle: new Set(["editorial-grid", "story-scroller"]),
    buttonVariant: new Set(["solid", "outline", "soft"]), buttonMotion: new Set(["none", "lift", "pulse"]),
  };
  let value: unknown = rawValue;
  if (textLimits[field]) value = text(rawValue, textLimits[field], false) || null;
  else if (colors.has(field)) { if (!COLOR_PATTERN.test(rawValue)) throw new BadRequestException("Ese color visual debe usar el formato #112233."); value = rawValue.toLowerCase(); }
  else if (booleans.has(field)) { value = bool(rawValue); if (value === null) throw new BadRequestException("Ese ajuste visual debe ser sí o no."); }
  else if (field === "backgroundGradientAngle") { value = integer(rawValue, 0, 360); if (value === null) throw new BadRequestException("El ángulo del fondo debe estar entre 0 y 360."); }
  else if (field === "announcementSpeed") { value = integer(rawValue, 8, 40); if (value === null) throw new BadRequestException("La velocidad de la marquesina debe estar entre 8 y 40 segundos."); }
  else if (field === "promotionCtaUrl") { if (rawValue && !/^https?:\/\/[^\s]+$/i.test(rawValue)) throw new BadRequestException("El enlace de la promoción debe ser HTTP(S)."); value = rawValue || null; }
  else if (enums[field]?.has(rawValue)) value = rawValue;
  else return false;
  if (target[field] === value) return false;
  target[field] = value;
  return true;
}

function setSceneField(
  scene: Record<string, any>,
  field: string,
  value: string,
  allowedProducts: Set<string>,
  allowedMedia: Set<string>,
): boolean {
  const limits: Record<string, number> = { title: 100, caption: 180, body: 360 };
  let next: unknown = value;
  if (limits[field]) next = text(value, limits[field], false);
  else if (field === "imageUrl") { assertMediaAllowed(value, allowedMedia); next = value; }
  else if (field === "productId") { if (value && !allowedProducts.has(value)) throw new BadRequestException("El producto elegido no pertenece a esta tienda."); next = value || undefined; }
  else if (["boxColor", "textColor"].includes(field)) { if (!COLOR_PATTERN.test(value)) throw new BadRequestException("Ese color de escena no es válido."); next = value.toLowerCase(); }
  else if (["textPositionX", "textPositionY"].includes(field)) { next = integer(value, 0, 100); if (next === null) throw new BadRequestException("La posición de la escena debe estar entre 0 y 100."); }
  else if (field === "textScale") { next = integer(value, 50, 200); if (next === null) throw new BadRequestException("El tamaño de escena debe estar entre 50 y 200."); }
  else if (field === "textWidthPercent") { next = integer(value, 20, 100); if (next === null) throw new BadRequestException("El ancho de escena debe estar entre 20 y 100."); }
  else if (field === "textAlign" && ["left", "center", "right"].includes(value)) next = value;
  else if (field === "fontStyle" && STORE_FONT_STYLES.includes(value as (typeof STORE_FONT_STYLES)[number])) next = value;
  else return false;
  if (scene[field] === next) return false;
  if (next === undefined) delete scene[field]; else scene[field] = next;
  return true;
}

export function applyStoreAgentProposalVisualOperations(
  source: Record<string, unknown>,
  operations: readonly StoreAgentEditorOperation[],
  options: { allowedProductIds?: ReadonlySet<string>; allowedMediaUrls?: ReadonlySet<string> } = {},
): { config: Record<string, unknown>; changedAreas: string[] } {
  assertStoreAgentOperationBudget(operations.length);
  if (!operations.length) return { config: source, changedAreas: [] };
  const config = structuredClone(source) as Record<string, any>;
  const allowedProducts = new Set(options.allowedProductIds ?? []);
  const allowedMedia = new Set([...proposalMedia(config), ...(options.allowedMediaUrls ?? [])]);
  const changedAreas = new Set<string>();
  let changed = false;
  const mark = (area: string) => { changed = true; changedAreas.add(area); };
  config.heroSlides = Array.isArray(config.heroSlides) ? config.heroSlides : [];
  config.editorialGallery = Array.isArray(config.editorialGallery) ? config.editorialGallery : [];
  config.animations = Array.isArray(config.animations) ? config.animations : [];
  config.contentOrder = Array.isArray(config.contentOrder) ? config.contentOrder : [];

  for (const operation of operations) {
    if (!storeAgentOperationIsProposalVisual(operation)) throw new BadRequestException("La operación no pertenece a los controles visuales del borrador.");
    if (operation.entity === "visual-setting") {
      if (operation.action !== "set") throw new BadRequestException("Los ajustes generales sólo admiten cambios de valor.");
      if (["bannerUrl", "backgroundImageUrl", "aboutImageUrl", "promotionImageUrl"].includes(operation.field)) {
        if (operation.value) assertMediaAllowed(operation.value, allowedMedia);
        if (config[operation.field] !== (operation.value || null)) { config[operation.field] = operation.value || null; mark("ajustes visuales"); }
      } else if (setBoundedVisualField(config, operation.field, operation.value)) mark(operation.field.startsWith("announcement") ? "marquesina" : operation.field.startsWith("promotion") ? "promoción" : "ajustes visuales");
      else if (!(operation.field in config)) throw new BadRequestException(`El ajuste visual “${operation.field}” no está disponible.`);
      continue;
    }
    if (operation.entity === "content-order") {
      if (operation.action !== "move") throw new BadRequestException("El orden visual sólo admite mover bloques existentes.");
      const index = config.contentOrder.indexOf(operation.targetId);
      if (index < 0) throw new BadRequestException(`No encontré “${operation.targetId}” en el orden del sitio.`);
      if (move(config.contentOrder, index, operation.position)) mark("orden del sitio");
      continue;
    }
    if (operation.entity === "hero-slide" || operation.entity === "editorial-image") {
      const list: Record<string, any>[] = operation.entity === "hero-slide" ? config.heroSlides : config.editorialGallery;
      const max = operation.entity === "hero-slide" ? 5 : 8;
      if (operation.action === "add") {
        if (list.length >= max) throw new BadRequestException(`Ya se alcanzó el máximo de ${max} imágenes en esta galería.`);
        assertMediaAllowed(operation.value, allowedMedia);
        list.push(operation.entity === "hero-slide" ? { imageUrl: operation.value, title: text(operation.secondaryValue, 80) } : { imageUrl: operation.value });
        mark(operation.entity === "hero-slide" ? "portada" : "galería editorial"); continue;
      }
      const index = Number(operation.targetId);
      const scene = Number.isInteger(index) ? list[index] : null;
      if (!scene) throw new BadRequestException("No encontré la imagen indicada.");
      if (operation.action === "remove") { list.splice(index, 1); mark(operation.entity === "hero-slide" ? "portada" : "galería editorial"); continue; }
      if (operation.action === "move") { if (move(list, index, operation.position)) mark(operation.entity === "hero-slide" ? "portada" : "galería editorial"); continue; }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para la imagen.");
      let didChange = false;
      if (operation.entity === "hero-slide") {
        const limits: Record<string, number> = { title: 80, body: 180, ctaLabel: 36 };
        if (operation.field === "imageUrl") { assertMediaAllowed(operation.value, allowedMedia); didChange = scene.imageUrl !== operation.value; scene.imageUrl = operation.value; }
        else if (limits[operation.field]) { const value = text(operation.value, limits[operation.field], false); didChange = scene[operation.field] !== value; scene[operation.field] = value; }
        else if (operation.field === "ctaUrl" && (!operation.value || /^https?:\/\/[^\s]+$/i.test(operation.value))) { didChange = scene.ctaUrl !== (operation.value || undefined); if (operation.value) scene.ctaUrl = operation.value; else delete scene.ctaUrl; }
        else throw new BadRequestException("Ese campo no está disponible en una portada.");
      } else didChange = setSceneField(scene, operation.field, operation.value, allowedProducts, allowedMedia);
      if (didChange) mark(operation.entity === "hero-slide" ? "portada" : "galería editorial");
      continue;
    }
    if (operation.entity === "animation") {
      const animations = config.animations as Array<{ id: string; name?: string; [key: string]: any }>;
      if (operation.action === "add") {
        if (!STORE_MOTION_EXPERIENCES.includes(operation.field as (typeof STORE_MOTION_EXPERIENCES)[number])) throw new BadRequestException("Ese tipo de animación no está registrado.");
        const id = uniqueId(operation.targetId, new Set(animations.map((entry) => entry.id)), "animation-new");
        animations.push({ id, name: text(operation.value || "Nueva animación", 60), type: operation.field, ...(operation.parentId ? { pageId: operation.parentId } : {}), title: "", subtitle: "", media: [], textBlocks: [] });
        const key = `animation-${id}`; if (!config.contentOrder.includes(key)) config.contentOrder.push(key); mark("animaciones"); continue;
      }
      const animation = locateByIdOrLabel(animations, operation.targetId, (entry) => String(entry.name ?? ""));
      if (!animation) throw new BadRequestException(`No encontré la animación “${operation.targetId}”.`);
      const index = animations.indexOf(animation);
      if (operation.action === "remove") { animations.splice(index, 1); config.contentOrder = config.contentOrder.filter((key: string) => key !== `animation-${animation.id}`); mark("animaciones"); continue; }
      if (operation.action === "move") { if (move(animations, index, operation.position)) mark("animaciones"); continue; }
      if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para animaciones.");
      let value: unknown = operation.value;
      const limits: Record<string, number> = { name: 60, title: 100, subtitle: 220, buttonLabel: 36 };
      if (limits[operation.field]) value = text(operation.value, limits[operation.field], false);
      else if (operation.field === "type" && STORE_MOTION_EXPERIENCES.includes(operation.value as (typeof STORE_MOTION_EXPERIENCES)[number])) value = operation.value;
      else if (operation.field === "pageId") value = operation.value || undefined;
      else if (operation.field === "productId") { if (operation.value && !allowedProducts.has(operation.value)) throw new BadRequestException("El producto elegido no pertenece a esta tienda."); value = operation.value || undefined; }
      else if (["buttonPositionX", "buttonPositionY", "textPositionX", "textPositionY"].includes(operation.field)) { value = integer(operation.value, 0, 100); if (value === null) throw new BadRequestException("La posición debe estar entre 0 y 100."); }
      else if (operation.field === "textScale") { value = integer(operation.value, 50, 200); if (value === null) throw new BadRequestException("El tamaño debe estar entre 50 y 200."); }
      else if (operation.field === "textWidthPercent") { value = integer(operation.value, 20, 100); if (value === null) throw new BadRequestException("El ancho debe estar entre 20 y 100."); }
      else if (operation.field === "textAlign" && ["left", "center", "right"].includes(operation.value)) value = operation.value;
      else if (operation.field === "textSize" && ["small", "medium", "large"].includes(operation.value)) value = operation.value;
      else if (operation.field === "textWidth" && ["narrow", "medium", "wide"].includes(operation.value)) value = operation.value;
      else if (["textColor", "backgroundColor"].includes(operation.field) && COLOR_PATTERN.test(operation.value)) value = operation.value.toLowerCase();
      else if (operation.field === "fontStyle" && STORE_FONT_STYLES.includes(operation.value as (typeof STORE_FONT_STYLES)[number])) value = operation.value;
      else throw new BadRequestException(`El campo “${operation.field}” no está disponible en una animación.`);
      if (value === undefined) delete animation[operation.field]; else animation[operation.field] = value; mark("animaciones"); continue;
    }
    const animations = config.animations as Array<{ id: string; name?: string; [key: string]: any }>;
    const animation = locateByIdOrLabel(animations, operation.parentId, (entry) => String(entry.name ?? ""));
    if (!animation) throw new BadRequestException(`No encontré la animación “${operation.parentId}”.`);
    if (operation.entity === "animation-media") {
      animation.media = Array.isArray(animation.media) ? animation.media : [];
      if (operation.action === "add") { if (animation.media.length >= 8) throw new BadRequestException("La animación ya tiene 8 medios."); assertMediaAllowed(operation.value, allowedMedia); animation.media.push({ imageUrl: operation.value }); mark("medios de animación"); continue; }
      const index = Number(operation.targetId); const scene = Number.isInteger(index) ? animation.media[index] : null;
      if (!scene) throw new BadRequestException("No encontré la escena indicada en la animación.");
      if (operation.action === "remove") { animation.media.splice(index, 1); mark("medios de animación"); continue; }
      if (operation.action === "move") { if (move(animation.media, index, operation.position)) mark("medios de animación"); continue; }
      if (operation.action === "set" && setSceneField(scene, operation.field, operation.value, allowedProducts, allowedMedia)) mark("medios de animación");
      else if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para medios de animación.");
      continue;
    }
    animation.textBlocks = Array.isArray(animation.textBlocks) ? animation.textBlocks : [];
    const blocks = animation.textBlocks as Array<{ id: string; text?: string; [key: string]: any }>;
    if (operation.action === "add") {
      if (blocks.length >= 24 || !["title", "subtitle"].includes(operation.field)) throw new BadRequestException("No se puede agregar otro texto a esa animación.");
      blocks.push({ id: uniqueId(operation.targetId, new Set(blocks.map((entry) => entry.id)), "text-new"), role: operation.field, text: text(operation.value, 220) }); mark("textos de animación"); continue;
    }
    const block = locateByIdOrLabel(blocks, operation.targetId, (entry) => String(entry.text ?? ""));
    if (!block) throw new BadRequestException(`No encontré el texto “${operation.targetId}” en la animación.`);
    const index = blocks.indexOf(block);
    if (operation.action === "remove") { blocks.splice(index, 1); mark("textos de animación"); continue; }
    if (operation.action === "move") { if (move(blocks, index, operation.position)) mark("textos de animación"); continue; }
    if (operation.action === "duplicate") { const copy = structuredClone(block); copy.id = uniqueId(operation.secondaryValue || `${block.id}-copy`, new Set(blocks.map((entry) => entry.id)), "text-copy"); blocks.splice(index + 1, 0, copy); mark("textos de animación"); continue; }
    if (operation.action !== "set") throw new BadRequestException("Esa operación no está disponible para textos de animación.");
    if (operation.field === "text") { block.text = text(operation.value, 220, false); mark("textos de animación"); }
    else if (setSceneField(block, operation.field, operation.value, allowedProducts, allowedMedia)) mark("textos de animación");
    else throw new BadRequestException(`El campo “${operation.field}” no está disponible en un texto de animación.`);
  }
  if (!changed) throw new BadRequestException("La instrucción no produciría ningún cambio en los controles visuales actuales.");
  const animationTypes = [...new Set(config.animations.map((animation: Record<string, unknown>) => animation.type).filter((type: unknown): type is string => typeof type === "string"))];
  config.motionDuoEnabled = animationTypes.length > 0;
  config.motionExperiences = animationTypes;
  if (animationTypes[0]) config.motionExperience = animationTypes[0];
  return { config, changedAreas: [...changedAreas] };
}
