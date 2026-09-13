// @ts-check

/** @typedef {Record<string, any>} JsonObject */

const STORE_FONT_STYLES = new Set(["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"]);
const SECTION_LAYOUTS = new Set(["split", "full-bleed", "centered", "offset", "grid", "stacked", "rail", "minimal"]);
const TEXT_FIELDS = new Set(["siteTitle", "siteBody", "siteCtaLabel", "siteItemTitle", "siteItemBody"]);
/** @type {Record<string, Record<string, string>>} */
const SITE_COPY_SLOTS = {
  hero: { heading: "heading", text: "body", action: "actions" },
  story: { heading: "heading", text: "body", action: "body" },
  catalog: { heading: "heading", text: "intro", action: "footer-action" },
  gallery: { heading: "heading", text: "body", action: "caption" },
  contact: { heading: "heading", text: "body", action: "actions" },
  location: { heading: "heading", text: "address", action: "hours" },
  links: { heading: "heading", text: "body", action: "links" },
};

const VISUAL_CANVAS_FIELDS = [
  "tagline", "bannerUrl", "backgroundColor", "backgroundMode", "backgroundGradientStart", "backgroundGradientEnd", "backgroundGradientAngle", "backgroundImageUrl",
  "aboutText", "aboutTitle", "aboutSubtitle", "aboutImageUrl", "catalogTitle", "catalogSubtitle", "galleryTitle", "gallerySubtitle", "linksTitle",
  "contactTitle", "contactSubtitle", "locationTitle", "locationSubtitle", "sectionBackgrounds", "accentColor", "fontStyle", "buttonStyle", "boardTexture",
  "announcement", "announcementMode", "announcementSpeed", "announcementSize", "announcementColor", "announcementFont", "announcementEffect", "promotionEnabled",
  "promotionImageUrl", "promotionTitle", "promotionBody", "promotionCtaLabel", "promotionCtaUrl", "heroSlides", "contentOrder", "layoutStyle", "experienceStyle",
  "motionDuoEnabled", "motionExperience", "motionExperiences", "animations", "editorialGallery", "buttonVariant", "buttonMotion", "cartButtonLabel", "siteDocument",
  "checkoutMode", "leadCaptureUrl", "contactPhone", "contactFormEnabled",
];

const FRESH_CREATIVE_CANVAS = Object.freeze({
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
});

/** @template T @param {T} value @returns {T} */
function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

/** @param {unknown} value @param {number} limit @param {boolean} [trim] */
function boundedText(value, limit, trim = false) {
  const text = trim ? String(value ?? "").trim() : String(value ?? "");
  return Array.from(text).slice(0, limit).join("");
}

/** @param {JsonObject} section @param {unknown} blockId @returns {JsonObject | null} */
function findBlock(section, blockId) {
  if (typeof blockId !== "string" || !blockId) return null;
  /** @param {unknown} blocks @returns {JsonObject | null} */
  const visit = (blocks) => {
    if (!Array.isArray(blocks)) return null;
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      if (block.id === blockId) return block;
      const nested = visit(block.children);
      if (nested) return nested;
    }
    return null;
  };
  return visit(section.blocks);
}

/** @param {JsonObject} section @param {unknown} blockId @returns {{ blocks: JsonObject[], index: number, block: JsonObject } | null} */
function findBlockLocation(section, blockId) {
  if (typeof blockId !== "string" || !blockId) return null;
  /** @param {unknown} blocks @returns {{ blocks: JsonObject[], index: number, block: JsonObject } | null} */
  const visit = (blocks) => {
    if (!Array.isArray(blocks)) return null;
    for (let index = 0; index < blocks.length; index += 1) {
      if (blocks[index]?.id === blockId) return { blocks, index, block: blocks[index] };
      const nested = visit(blocks[index]?.children);
      if (nested) return nested;
    }
    return null;
  };
  return visit(section.blocks);
}

/** Keep projected legacy copy visible when the first free text block is added. @param {JsonObject} section */
function materializeProjectedCopyBlocks(section) {
  if (!Array.isArray(section.blocks)) section.blocks = [];
  const slots = SITE_COPY_SLOTS[section.kind] || SITE_COPY_SLOTS.story;
  const projected = [
    { id: "heading", kind: "heading", slot: slots.heading, role: "primary", text: section.title, style: section.titleStyle },
    { id: "body", kind: "text", slot: slots.text, role: "supporting", text: section.body, style: section.bodyStyle },
    { id: "action", kind: "action", slot: slots.action, role: "primary", text: section.ctaLabel, style: undefined },
  ];
  const missing = projected.filter((entry) => entry.text && !findBlock(section, entry.id)).map((entry) => ({
    ...entry,
    text: String(entry.text),
    mediaUrl: null,
    ...(entry.style ? { style: clone(entry.style) } : {}),
    children: [],
  }));
  if (missing.length) section.blocks = [...missing, ...section.blocks];
}

/** @param {JsonObject} section @param {JsonObject} block */
function syncBlockProjection(section, block) {
  if (block.id === "heading") section.title = block.text || "";
  if (block.id === "body") section.body = block.text || "";
  if (block.id === "action") section.ctaLabel = block.text || "";
  const chapterMatch = /^chapter-(\d+)-(heading|body)$/.exec(String(block.id || ""));
  if (chapterMatch && Array.isArray(section.items)) {
    const item = section.items[Number(chapterMatch[1]) - 1];
    if (item) item[chapterMatch[2] === "heading" ? "title" : "body"] = block.text || "";
  }
}

/** @param {JsonObject} document @param {JsonObject} selection */
function resolveSection(document, selection) {
  const sectionKey = String(selection.section || "");
  if (!sectionKey.startsWith("site-") || !Array.isArray(document.sections)) return null;
  const sectionIndex = document.sections.findIndex((entry) => entry && `site-${entry.id}` === sectionKey);
  const section = document.sections[sectionIndex];
  return section ? { section, sectionIndex } : null;
}

/** @param {JsonObject} document @param {JsonObject} selection */
function resolveTextStyleTarget(document, selection) {
  const sectionKey = String(selection.section || "");
  if (sectionKey === "brand") {
    const styleKey = selection.field === "storeTagline" ? "taglineStyle" : selection.field === "storeName" ? "brandStyle" : "";
    return styleKey && document.navigation ? { owner: document.navigation, styleKey } : null;
  }
  if (sectionKey === "navigation" && selection.field === "navigationLabel" && Number.isInteger(selection.itemIndex)) {
    const owner = document.navigation?.items?.[selection.itemIndex];
    return owner ? { owner, styleKey: "style" } : null;
  }
  const resolved = resolveSection(document, selection);
  if (!resolved) return null;
  const block = findBlock(resolved.section, selection.itemId);
  if (block && ["heading", "text", "action"].includes(block.kind)) return { ...resolved, owner: block, styleKey: "style" };
  const isBody = ["siteBody", "siteItemBody"].includes(selection.field);
  const isItem = ["siteItemTitle", "siteItemBody"].includes(selection.field) && Number.isInteger(selection.itemIndex);
  const owner = isItem ? resolved.section.items?.[selection.itemIndex] : resolved.section;
  return owner ? { ...resolved, owner, styleKey: isBody ? "bodyStyle" : "titleStyle" } : null;
}

/** @param {JsonObject | null} original @returns {{ document: JsonObject | null, changed: false }} */
function unchangedDocument(original) {
  return { document: original, changed: false };
}

/**
 * Apply a validated, immutable mutation to the canonical site document.
 * @param {JsonObject | null} original
 * @param {JsonObject} command
 * @returns {{ document: JsonObject | null, changed: boolean, createdBlockId?: string, targetSectionId?: string }}
 */
export function applyStoreDocumentCommand(original, command) {
  if (!original || typeof original !== "object" || !command || typeof command !== "object") return unchangedDocument(original);
  const document = clone(original);
  const selection = command.selection && typeof command.selection === "object" ? command.selection : {};

  if (command.type === "delete-section") {
    const resolved = resolveSection(document, selection);
    if (!resolved) return unchangedDocument(original);
    if (["hero", "catalog", "contact"].includes(String(resolved.section.kind))) return unchangedDocument(original);
    const [removed] = document.sections.splice(resolved.sectionIndex, 1);
    if (Array.isArray(document.navigation?.items)) {
      document.navigation.items = document.navigation.items.filter((/** @type {JsonObject} */ item) => item?.sectionId !== removed.id);
    }
    document.deletedSectionIds = [...new Set([...(Array.isArray(document.deletedSectionIds) ? document.deletedSectionIds : []), removed.id])];
    return { document, changed: true };
  }

  if (command.type === "set-inline-text") {
    const sectionKey = String(selection.section || "");
    const field = String(selection.field || "");
    if (sectionKey === "navigation" && field === "navigationLabel" && Number.isInteger(selection.itemIndex)) {
      const target = document.navigation?.items?.[selection.itemIndex];
      if (!target) return unchangedDocument(original);
      const value = boundedText(command.value, 40, true);
      if (target.label === value) return unchangedDocument(original);
      target.label = value;
      return { document, changed: true };
    }
    if (sectionKey === "footer") {
      let target = null;
      let key = "";
      let limit = 100;
      if (field === "footerBrandDescription") { target = document.footer; key = "brandDescription"; limit = 320; }
      else if (field === "footerCopyright") { target = document.footer; key = "copyright"; limit = 160; }
      else if (field === "footerBadge") { target = document.footer; key = "badge"; limit = 80; }
      else if (field === "footerColumnTitle" && Number.isInteger(selection.itemIndex)) { target = document.footer?.columns?.[selection.itemIndex]; key = "title"; limit = 60; }
      else if (field === "footerItemLabel" && typeof selection.itemId === "string") {
        const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
        target = document.footer?.columns?.[columnIndex]?.items?.[itemIndex]; key = "label";
      }
      if (!target || !key) return unchangedDocument(original);
      const value = boundedText(command.value, limit, true);
      if (target[key] === value) return unchangedDocument(original);
      target[key] = value;
      return { document, changed: true };
    }
    const resolved = resolveSection(document, selection);
    if (!resolved) return unchangedDocument(original);
    const block = findBlock(resolved.section, selection.itemId);
    if (block && field === "siteBlockText" && ["heading", "text", "action"].includes(block.kind)) {
      const value = boundedText(command.value, block.kind === "action" ? 40 : block.kind === "heading" ? 120 : 600);
      if (block.text === value) return unchangedDocument(original);
      block.text = value;
      syncBlockProjection(resolved.section, block);
      return { document, changed: true };
    }
    if (!TEXT_FIELDS.has(field)) return unchangedDocument(original);
    const item = Number.isInteger(selection.itemIndex) ? resolved.section.items?.[selection.itemIndex] : null;
    /** @type {Record<string, any[]>} */
    const fieldMap = { siteTitle: [resolved.section, "title", 120], siteBody: [resolved.section, "body", 600], siteCtaLabel: [resolved.section, "ctaLabel", 40] };
    const tuple = fieldMap[field] || (field === "siteItemTitle" ? [item, "title", 100] : [item, "body", 320]);
    const [target, key, limit] = tuple;
    if (!target) return unchangedDocument(original);
    const value = boundedText(command.value, limit);
    if (target[key] === value) return unchangedDocument(original);
    target[key] = value;
    return { document, changed: true };
  }

  if (command.type === "duplicate-site-text-block") {
    const resolved = resolveSection(document, selection);
    const source = command.source && typeof command.source === "object" ? command.source : null;
    const sourceKind = String(source?.kind || "");
    if (!resolved || !source || !["heading", "text", "action"].includes(sourceKind)) return unchangedDocument(original);
    materializeProjectedCopyBlocks(resolved.section);
    if (resolved.section.blocks.length >= 16) return unchangedDocument(original);
    const limit = sourceKind === "action" ? 40 : sourceKind === "heading" ? 120 : 600;
    const text = boundedText(source.text, limit, true);
    if (!text) return unchangedDocument(original);
    const used = new Set();
    /** @param {unknown} blocks */
    const collectIds = (blocks) => (Array.isArray(blocks) ? blocks : []).forEach((block) => {
      if (!block || typeof block !== "object") return;
      used.add(block.id);
      collectIds(block.children);
    });
    collectIds(resolved.section.blocks);
    let number = 1;
    while (used.has(`${sourceKind}-${number}`)) number += 1;
    const currentStyle = source.style && typeof source.style === "object" ? source.style : {};
    /** @param {unknown} value */
    const clampOffset = (value) => Math.min(1000, Math.max(-1000, Math.round(Number(value) || 0)));
    const textScale = Math.min(200, Math.max(50, Math.round(Number(currentStyle.textScale) || 100)));
    const style = {
      ...(STORE_FONT_STYLES.has(currentStyle.fontStyle) ? { fontStyle: currentStyle.fontStyle } : {}),
      ...(/^#[0-9a-f]{6}$/i.test(String(currentStyle.textColor || "")) ? { textColor: currentStyle.textColor } : {}),
      ...(["left", "center", "right"].includes(currentStyle.textAlign) ? { textAlign: currentStyle.textAlign } : {}),
      textScale,
      textWidthPercent: Math.min(100, Math.max(20, Math.round(Number(currentStyle.textWidthPercent) || 62))),
      textOffsetX: currentStyle.textOffsetBasis === "section" ? clampOffset(clampOffset(currentStyle.textOffsetX) + 3) : 3,
      textOffsetY: currentStyle.textOffsetBasis === "section" ? clampOffset(clampOffset(currentStyle.textOffsetY) + 3) : 3,
      textOffsetBasis: "section",
    };
    const block = {
      id: `${sourceKind}-${number}`,
      kind: sourceKind,
      slot: SITE_COPY_SLOTS[String(resolved.section.kind)]?.[sourceKind] || "body",
      role: ["primary", "secondary", "supporting"].includes(source.role) ? source.role : sourceKind === "text" ? "supporting" : "primary",
      text,
      mediaUrl: null,
      style,
      children: [],
    };
    const sourceLocation = findBlockLocation(resolved.section, source.sourceId);
    if (sourceLocation) sourceLocation.blocks.splice(sourceLocation.index + 1, 0, block);
    else resolved.section.blocks.push(block);
    return { document, changed: true, createdBlockId: block.id };
  }

  if (command.type === "delete-site-text") {
    const resolved = resolveSection(document, selection);
    if (!resolved) return unchangedDocument(original);
    const location = findBlockLocation(resolved.section, selection.itemId);
    if (location) {
      if (["heading", "body", "action"].includes(String(location.block.id))) {
        if (!location.block.text) return unchangedDocument(original);
        location.block.text = "";
        syncBlockProjection(resolved.section, location.block);
      } else {
        location.blocks.splice(location.index, 1);
      }
      return { document, changed: true };
    }
    const field = String(selection.field || "");
    if (!TEXT_FIELDS.has(field)) return unchangedDocument(original);
    const item = Number.isInteger(selection.itemIndex) ? resolved.section.items?.[selection.itemIndex] : null;
    /** @type {Record<string, any[]>} */
    const fieldMap = { siteTitle: [resolved.section, "title"], siteBody: [resolved.section, "body"], siteCtaLabel: [resolved.section, "ctaLabel"] };
    const tuple = fieldMap[field] || (field === "siteItemTitle" ? [item, "title"] : [item, "body"]);
    const [target, key] = tuple;
    if (!target || !target[key]) return unchangedDocument(original);
    target[key] = "";
    return { document, changed: true };
  }

  if (command.type === "set-text-layout") {
    const resolved = resolveTextStyleTarget(document, selection);
    if (!resolved) return unchangedDocument(original);
    const currentStyle = resolved.owner[resolved.styleKey] || {};
    /** @param {unknown} value @param {number} fallback */
    const clamp = (value, fallback) => Number.isFinite(Number(value)) ? Math.min(1000, Math.max(-1000, Math.round(Number(value)))) : fallback;
    const textOffsetX = clamp(command.textOffsetX, Number(currentStyle.textOffsetX) || 0);
    const textOffsetY = clamp(command.textOffsetY, Number(currentStyle.textOffsetY) || 0);
    const textOffsetBasis = command.textOffsetBasis === "section" ? "section" : currentStyle.textOffsetBasis === "section" ? "section" : "element";
    const textWidthPercent = Number.isFinite(Number(command.textWidthPercent))
      ? Math.min(100, Math.max(20, Math.round(Number(command.textWidthPercent))))
      : currentStyle.textWidthPercent;
    if (currentStyle.textOffsetX === textOffsetX && currentStyle.textOffsetY === textOffsetY && currentStyle.textOffsetBasis === textOffsetBasis
      && currentStyle.textWidthPercent === textWidthPercent) return unchangedDocument(original);
    resolved.owner[resolved.styleKey] = {
      ...currentStyle,
      textOffsetX,
      textOffsetY,
      textOffsetBasis,
      ...(textWidthPercent !== undefined ? { textWidthPercent } : {}),
    };
    return { document, changed: true };
  }

  if (command.type === "set-section-height") {
    const resolved = resolveSection(document, selection);
    if (!resolved) return unchangedDocument(original);
    const key = command.viewport === "mobile" ? "mobileHeightPx" : "heightPx";
    if (command.heightPx === null) {
      if (resolved.section[key] === undefined) return unchangedDocument(original);
      delete resolved.section[key];
      return { document, changed: true };
    }
    if (!Number.isFinite(Number(command.heightPx))) return unchangedDocument(original);
    const heightPx = Math.min(1800, Math.max(180, Math.round(Number(command.heightPx))));
    if (resolved.section[key] === heightPx) return unchangedDocument(original);
    resolved.section[key] = heightPx;
    return { document, changed: true };
  }

  if (command.type === "set-text-style") {
    const resolved = resolveTextStyleTarget(document, selection);
    const key = String(command.key || "");
    if (!resolved || !["fontStyle", "textScale", "textWidthPercent", "textColor", "textAlign"].includes(key)) return unchangedDocument(original);
    let value = command.value;
    if (key === "textScale" || key === "textWidthPercent") {
      if (!Number.isFinite(Number(value))) return unchangedDocument(original);
      value = key === "textScale"
        ? Math.min(200, Math.max(50, Math.round(Number(value))))
        : Math.min(100, Math.max(20, Math.round(Number(value))));
    } else {
      value = String(value || "");
    }
    if (key === "textColor" && !/^#[0-9a-f]{6}$/i.test(value)) return unchangedDocument(original);
    if (key === "textAlign" && !["left", "center", "right"].includes(value)) return unchangedDocument(original);
    if (key === "fontStyle" && !STORE_FONT_STYLES.has(value)) return unchangedDocument(original);
    const currentStyle = resolved.owner[resolved.styleKey] || {};
    if (currentStyle[key] === value) return unchangedDocument(original);
    resolved.owner[resolved.styleKey] = { ...currentStyle, [key]: value };
    return { document, changed: true };
  }

  if (command.type === "move-site-text-block") {
    const resolved = resolveSection(document, selection);
    const targetSectionId = String(command.targetSectionId || "");
    const targetSection = Array.isArray(document.sections)
      ? document.sections.find((/** @type {JsonObject} */ entry) => entry?.id === targetSectionId)
      : null;
    const location = resolved ? findBlockLocation(resolved.section, selection.itemId) : null;
    if (!resolved || !targetSection || targetSection === resolved.section || !location) return unchangedDocument(original);
    if (["heading", "body", "action"].includes(String(location.block.id)) || !["heading", "text", "action"].includes(location.block.kind)) return unchangedDocument(original);
    if (!Array.isArray(targetSection.blocks)) targetSection.blocks = [];
    if (targetSection.blocks.length >= 16) return unchangedDocument(original);
    const [block] = location.blocks.splice(location.index, 1);
    const used = new Set(targetSection.blocks.map((/** @type {JsonObject} */ entry) => entry?.id));
    let nextId = String(block.id);
    let suffix = 2;
    while (used.has(nextId)) nextId = `${block.kind}-${suffix++}`;
    block.id = nextId;
    block.slot = SITE_COPY_SLOTS[String(targetSection.kind)]?.[block.kind] || "body";
    block.style = { ...(block.style || {}), textOffsetX: 0, textOffsetY: 0, textOffsetBasis: "section" };
    targetSection.blocks.push(block);
    return { document, changed: true, createdBlockId: nextId, targetSectionId };
  }

  if (command.type === "set-section-field") {
    const resolved = resolveSection(document, selection);
    if (!resolved) return unchangedDocument(original);
    const key = String(command.key || "");
    const item = Number.isInteger(selection.itemIndex) ? resolved.section.items?.[selection.itemIndex] : null;
    const block = findBlock(resolved.section, selection.itemId);
    let target = resolved.section;
    let value = String(command.value ?? "");
    if (block && key === "text" && ["heading", "text", "action"].includes(block.kind)) {
      target = block;
      value = boundedText(value, block.kind === "action" ? 40 : block.kind === "heading" ? 120 : 600);
    } else if (item && ["title", "body"].includes(key)) {
      target = item;
      value = boundedText(value, key === "title" ? 100 : 320);
    } else if (["title", "body"].includes(key)) {
      value = boundedText(value, key === "title" ? 120 : 600);
    } else if (key === "motion") {
      if (!["none", "reveal", "clip", "drift", "scale", "parallax", "story-scroll"].includes(value)) return unchangedDocument(original);
    } else if (key === "layout") {
      if (!SECTION_LAYOUTS.has(value)) return unchangedDocument(original);
    } else if (key === "backgroundColor") {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return unchangedDocument(original);
      value = value.toLowerCase();
    } else {
      return unchangedDocument(original);
    }
    if (String(target[key] || "") === value) return unchangedDocument(original);
    target[key] = value;
    if (block && target === block && key === "text") syncBlockProjection(resolved.section, block);
    return { document, changed: true };
  }

  return unchangedDocument(original);
}

/**
 * @param {unknown[]} original
 * @param {number} fromIndex
 * @param {number} toIndex
 * @returns {{ order: unknown[], changed: boolean }}
 */
export function reorderStoreEditorList(original, fromIndex, toIndex) {
  if (!Array.isArray(original) || fromIndex === toIndex || !Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || toIndex < 0 || fromIndex >= original.length || toIndex >= original.length) {
    return { order: original, changed: false };
  }
  const order = [...original];
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  return { order, changed: true };
}

/** @param {unknown} value @param {number} minimum @param {number} maximum @param {number} fallback */
function clampedInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

/** @param {unknown} value */
function mediaIdentity(value) {
  return String(value || "").trim().split(/[?#]/, 1)[0].replace(/^https?:\/\/[^/]+/i, "").replace(/^\/v1(?=\/uploads\/)/, "");
}

/** @param {JsonObject} animation @param {JsonObject} selection */
function resolveAnimationTextTarget(animation, selection) {
  /** @type {JsonObject[]} */
  const textBlocks = animation.textBlocks || [];
  const block = typeof selection.itemId === "string"
    ? textBlocks.find((entry) => entry.id === selection.itemId)
    : null;
  if (block) return { target: block, valueKey: "text", role: block.role, block };
  const itemIndex = Number.isInteger(selection.itemIndex) && animation.media?.[selection.itemIndex] ? selection.itemIndex : null;
  const target = itemIndex === null ? animation : animation.media[itemIndex];
  const valueKey = itemIndex === null
    ? ["animationSubtitle", "subtitle", "caption", "body"].includes(selection.field) ? "subtitle" : "title"
    : selection.field === "caption" ? "caption" : selection.field === "body" ? "body" : "title";
  return target ? { target, valueKey, role: ["subtitle", "caption", "body"].includes(valueKey) ? "subtitle" : "title", block: null } : null;
}

/** @param {JsonObject} animation */
function nextAnimationBlockId(animation) {
  /** @type {JsonObject[]} */
  const textBlocks = animation.textBlocks || [];
  const used = new Set(textBlocks.map((block) => block.id));
  let index = textBlocks.length + 1;
  while (used.has(`text-${index}`)) index += 1;
  return `text-${index}`;
}

/** @param {JsonObject} animation @param {JsonObject} source @param {JsonObject} command */
function createAnimationTextBlock(animation, source, command) {
  const role = source.role === "subtitle" ? "subtitle" : "title";
  /** @type {JsonObject[]} */
  const textBlocks = animation.textBlocks || [];
  const sameRoleCount = textBlocks.filter((block) => block.role === role).length;
  const offset = command.offset !== false;
  const baseX = Number.isInteger(source.textPositionX) ? source.textPositionX : 18;
  const baseY = Number.isInteger(source.textPositionY) ? source.textPositionY : role === "title" ? 30 : 48;
  const fontStyle = STORE_FONT_STYLES.has(source.fontStyle)
    ? source.fontStyle
    : STORE_FONT_STYLES.has(animation.fontStyle) ? animation.fontStyle : STORE_FONT_STYLES.has(command.defaultFontStyle) ? command.defaultFontStyle : "modern";
  return {
    id: nextAnimationBlockId(animation),
    role,
    text: boundedText(source.text || (role === "title" ? "Escribe aquí tu título" : "Escribe aquí tu subtítulo"), 220),
    textPositionX: Math.min(94, Math.max(4, baseX + (offset ? 3 + (sameRoleCount % 3) * 2 : 0))),
    textPositionY: Math.min(94, Math.max(6, baseY + (offset ? 5 + (sameRoleCount % 3) * 3 : 0))),
    textScale: clampedInteger(source.textScale, 50, 200, role === "title" ? 100 : 82),
    textWidthPercent: clampedInteger(source.textWidthPercent, 20, 100, 62),
    textAlign: ["left", "center", "right"].includes(source.textAlign) ? source.textAlign : "left",
    textColor: /^#[0-9a-f]{6}$/i.test(source.textColor || "") ? source.textColor : /^#[0-9a-f]{6}$/i.test(animation.textColor || "") ? animation.textColor : "#ffffff",
    fontStyle,
  };
}

/** @param {JsonObject[]} original @param {string} [animationId] */
function unchangedAnimations(original, animationId = "") {
  return { animations: original, changed: false, animationId, createdBlockId: "" };
}

/**
 * Immutable command boundary for animation copy, layout, styles, scenes and media.
 * @param {JsonObject[]} original
 * @param {JsonObject} command
 * @returns {{ animations: JsonObject[], changed: boolean, animationId: string, createdBlockId: string }}
 */
export function applyAnimationCommand(original, command) {
  if (!Array.isArray(original) || !command || typeof command !== "object") return unchangedAnimations(original);
  const selection = command.selection && typeof command.selection === "object" ? command.selection : {};
  const section = String(selection.section || "");
  const animationId = String(command.animationId || selection.animationId || (section.startsWith("animation-") ? section.slice("animation-".length) : ""));
  if (command.type === "add-animation") {
    const animation = command.animation && typeof command.animation === "object" ? clone(command.animation) : null;
    if (!animation?.id || original.some((entry) => entry?.id === animation.id)) return unchangedAnimations(original, String(animation?.id || ""));
    return { animations: [...clone(original), animation], changed: true, animationId: animation.id, createdBlockId: "" };
  }
  const sourceIndex = original.findIndex((entry) => entry?.id === animationId);
  if (sourceIndex < 0) return unchangedAnimations(original, animationId);
  const animations = clone(original);
  const animation = animations[sourceIndex];
  let createdBlockId = "";

  if (command.type === "set-inline-text") {
    const resolved = resolveAnimationTextTarget(animation, selection);
    if (!resolved?.block) return unchangedAnimations(original, animationId);
    const value = boundedText(command.value, 220);
    if (resolved.block.text === value) return unchangedAnimations(original, animationId);
    resolved.block.text = value;
  } else if (command.type === "set-text-layout") {
    const resolved = resolveAnimationTextTarget(animation, selection);
    if (!resolved) return unchangedAnimations(original, animationId);
    const target = resolved.target;
    const next = {
      textPositionX: clampedInteger(command.textPositionX, 0, 100, Number.isInteger(target.textPositionX) ? target.textPositionX : 18),
      textPositionY: clampedInteger(command.textPositionY, 0, 100, Number.isInteger(target.textPositionY) ? target.textPositionY : 76),
      textScale: clampedInteger(command.textScale, 50, 200, Number.isInteger(target.textScale) ? target.textScale : 100),
      textWidthPercent: clampedInteger(command.textWidthPercent, 20, 100, Number.isInteger(target.textWidthPercent) ? target.textWidthPercent : 62),
      ...(["left", "center", "right"].includes(command.textAlign) ? { textAlign: command.textAlign } : {}),
    };
    if (Object.entries(next).every(([key, value]) => target[key] === value)) return unchangedAnimations(original, animationId);
    Object.assign(target, next);
  } else if (command.type === "set-text-style") {
    const resolved = resolveAnimationTextTarget(animation, selection);
    const key = String(command.key || "");
    if (!resolved || !["fontStyle", "textScale", "textColor", "textAlign"].includes(key)) return unchangedAnimations(original, animationId);
    let value = command.value;
    if (key === "textScale") {
      if (!Number.isFinite(Number(value))) return unchangedAnimations(original, animationId);
      value = Math.min(200, Math.max(50, Math.round(Number(value))));
    } else value = String(value || "");
    if (key === "textColor" && !/^#[0-9a-f]{6}$/i.test(value)) return unchangedAnimations(original, animationId);
    if (key === "textAlign" && !["left", "center", "right"].includes(value)) return unchangedAnimations(original, animationId);
    if (key === "fontStyle" && !STORE_FONT_STYLES.has(value)) return unchangedAnimations(original, animationId);
    if (resolved.target[key] === value) return unchangedAnimations(original, animationId);
    resolved.target[key] = value;
  } else if (command.type === "set-field") {
    const key = String(command.key || "");
    const scene = Number.isInteger(selection.itemIndex) ? animation.media?.[selection.itemIndex] : null;
    /** @type {Record<string, number>} */
    const sceneLimits = { title: 100, caption: 180, body: 360 };
    /** @type {Record<string, number>} */
    const animationLimits = { title: 100, subtitle: 220, buttonLabel: 36, name: 100 };
    let target = animation;
    let value = command.value;
    if (scene && Object.prototype.hasOwnProperty.call(sceneLimits, key)) {
      target = scene;
      value = boundedText(value, sceneLimits[key]);
    } else if (Object.prototype.hasOwnProperty.call(animationLimits, key)) {
      value = boundedText(value, animationLimits[key]);
    } else if (["type", "productId"].includes(key)) {
      value = String(value || "");
      if (key === "productId" && command.allowed !== true) return unchangedAnimations(original, animationId);
    } else if (["textPositionX", "textPositionY", "buttonPositionX", "buttonPositionY"].includes(key)) {
      value = clampedInteger(Number(value), 0, 100, Number.isInteger(animation[key]) ? animation[key] : key.startsWith("button") ? key.endsWith("X") ? 18 : 86 : key.endsWith("X") ? 18 : 76);
    } else if (key === "textScale") {
      value = clampedInteger(Number(value), 50, 200, Number.isInteger(animation[key]) ? animation[key] : 100);
    } else if (key === "textWidthPercent") {
      value = clampedInteger(Number(value), 20, 100, Number.isInteger(animation[key]) ? animation[key] : 62);
    } else if (key === "textAlign") {
      value = String(value || "");
      if (!["left", "center", "right"].includes(value)) return unchangedAnimations(original, animationId);
    } else if (key === "textSize") {
      value = String(value || "");
      if (!["small", "medium", "large"].includes(value)) return unchangedAnimations(original, animationId);
    } else if (key === "textWidth") {
      value = String(value || "");
      if (!["narrow", "medium", "wide"].includes(value)) return unchangedAnimations(original, animationId);
    } else if (["textColor", "backgroundColor"].includes(key)) {
      value = String(value || "");
      if (!/^#[0-9a-f]{6}$/i.test(value)) return unchangedAnimations(original, animationId);
    } else {
      return unchangedAnimations(original, animationId);
    }
    const sameFieldValue = target[key] === value;
    if (sameFieldValue && !(key === "productId" && command.productMedia && Number(command.maxMedia) > 0)) return unchangedAnimations(original, animationId);
    target[key] = value;
    if (key === "productId" && command.productMedia && Number(command.maxMedia) > 0) {
      const media = clone(command.productMedia);
      const max = Math.min(8, Math.max(1, Number(command.maxMedia)));
      /** @type {JsonObject[]} */
      const mediaEntries = animation.media || [];
      const existing = mediaEntries.findIndex((entry) => mediaIdentity(entry.imageUrl) === mediaIdentity(media.imageUrl));
      if (max === 1) animation.media = mediaEntries.length ? [{ ...mediaEntries[0], imageUrl: media.imageUrl }] : [media];
      else animation.media = [media, ...mediaEntries.filter((_entry, index) => index !== existing)].slice(0, max);
    }
  } else if (command.type === "add-text-block") {
    animation.textBlocks ||= [];
    if (animation.textBlocks.length >= 24) return unchangedAnimations(original, animationId);
    const block = createAnimationTextBlock(animation, command.source && typeof command.source === "object" ? command.source : { role: command.role }, command);
    animation.textBlocks.push(block);
    createdBlockId = block.id;
  } else if (command.type === "delete-text-block") {
    const blockId = String(command.blockId || selection.itemId || "");
    /** @type {JsonObject[]} */
    const textBlocks = animation.textBlocks || [];
    const next = textBlocks.filter((block) => block.id !== blockId);
    if (next.length === textBlocks.length) return unchangedAnimations(original, animationId);
    animation.textBlocks = next;
  } else if (command.type === "reset-style") {
    const keys = ["textPositionX", "textPositionY", "textScale", "textWidthPercent", "textAlign", "textSize", "textWidth", "textColor", "backgroundColor"];
    if (!keys.some((key) => key in animation)) return unchangedAnimations(original, animationId);
    keys.forEach((key) => delete animation[key]);
  } else if (command.type === "unset-fields") {
    const keys = Array.isArray(command.keys) ? command.keys.filter((key) => typeof key === "string" && key in animation) : [];
    if (!keys.length) return unchangedAnimations(original, animationId);
    keys.forEach((key) => delete animation[key]);
  } else if (command.type === "set-button-layout") {
    const x = clampedInteger(command.buttonPositionX, 0, 100, Number.isInteger(animation.buttonPositionX) ? animation.buttonPositionX : 18);
    const y = clampedInteger(command.buttonPositionY, 0, 100, Number.isInteger(animation.buttonPositionY) ? animation.buttonPositionY : 86);
    if (animation.buttonPositionX === x && animation.buttonPositionY === y) return unchangedAnimations(original, animationId);
    animation.buttonPositionX = x;
    animation.buttonPositionY = y;
  } else if (command.type === "set-media-field") {
    const media = Number.isInteger(command.mediaIndex) ? animation.media?.[command.mediaIndex] : null;
    const key = String(command.key || "");
    if (!media || !["title", "caption", "body", "boxColor", "productId"].includes(key)) return unchangedAnimations(original, animationId);
    if (key === "productId" && command.allowed !== true) return unchangedAnimations(original, animationId);
    const limit = key === "title" ? 100 : key === "caption" ? 180 : key === "body" ? 360 : 20;
    const value = key === "productId" ? String(command.value || "").slice(0, 80) : boundedText(command.value, limit);
    if (media[key] === value) return unchangedAnimations(original, animationId);
    media[key] = value;
  } else if (command.type === "remove-media") {
    if (!Number.isInteger(command.mediaIndex) || !animation.media?.[command.mediaIndex]) return unchangedAnimations(original, animationId);
    animation.media.splice(command.mediaIndex, 1);
  } else if (command.type === "reorder-media") {
    const reordered = reorderStoreEditorList(animation.media || [], Number(command.fromIndex), Number(command.toIndex));
    if (!reordered.changed) return unchangedAnimations(original, animationId);
    animation.media = reordered.order;
  } else if (command.type === "replace-media-list") {
    if (!Array.isArray(command.media)) return unchangedAnimations(original, animationId);
    const max = Math.min(8, Math.max(0, Number(command.maxMedia ?? 8)));
    const media = clone(command.media).slice(0, max);
    if (JSON.stringify(media) === JSON.stringify(animation.media || [])) return unchangedAnimations(original, animationId);
    animation.media = media;
  } else if (["replace-media", "toggle-media", "add-media"].includes(command.type)) {
    const source = command.media && typeof command.media === "object" ? clone(command.media) : { imageUrl: String(command.imageUrl || "") };
    if (!source.imageUrl) return unchangedAnimations(original, animationId);
    animation.media ||= [];
    /** @type {JsonObject[]} */
    const mediaEntries = animation.media;
    const existingIndex = mediaEntries.findIndex((entry) => mediaIdentity(entry.imageUrl) === mediaIdentity(source.imageUrl));
    const max = Math.min(8, Math.max(1, Number(command.maxMedia ?? 8)));
    if (command.type === "replace-media") {
      const targetIndex = Number(command.mediaIndex);
      if (!Number.isInteger(targetIndex) || !animation.media[targetIndex] || existingIndex === targetIndex) return unchangedAnimations(original, animationId);
      if (existingIndex >= 0) {
        const targetUrl = animation.media[targetIndex].imageUrl;
        animation.media[targetIndex] = { ...animation.media[targetIndex], imageUrl: animation.media[existingIndex].imageUrl };
        animation.media[existingIndex] = { ...animation.media[existingIndex], imageUrl: targetUrl };
      } else animation.media[targetIndex] = { ...animation.media[targetIndex], imageUrl: source.imageUrl };
    } else if (command.type === "add-media") {
      if (existingIndex >= 0 || animation.media.length >= max) return unchangedAnimations(original, animationId);
      animation.media.push(source);
    } else if (command.checked === false) {
      if (existingIndex < 0) return unchangedAnimations(original, animationId);
      animation.media.splice(existingIndex, 1);
    } else if (max === 1) {
      if (animation.media.length) animation.media[0] = { ...animation.media[0], imageUrl: source.imageUrl };
      else animation.media = [source];
    } else if (existingIndex < 0 && animation.media.length < max) animation.media.push(source);
    else if (existingIndex < 0) animation.media[animation.media.length - 1] = { ...animation.media[animation.media.length - 1], imageUrl: source.imageUrl };
    else return unchangedAnimations(original, animationId);
  } else if (command.type === "delete-animation") {
    animations.splice(sourceIndex, 1);
  } else {
    return unchangedAnimations(original, animationId);
  }

  if (JSON.stringify(animations) === JSON.stringify(original)) return unchangedAnimations(original, animationId);
  return { animations, changed: true, animationId, createdBlockId };
}

/**
 * Replace the creative canvas while preserving store identity and commerce data.
 * This deliberately resets stale motion/media fields before applying a proposal.
 * @param {JsonObject} current
 * @param {JsonObject} replacement
 * @returns {JsonObject}
 */
export function replaceStoreCreativeCanvas(current, replacement) {
  const next = clone(current && typeof current === "object" ? current : {});
  Object.assign(next, clone(FRESH_CREATIVE_CANVAS));
  for (const key of VISUAL_CANVAS_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(replacement || {}, key)) next[key] = clone(replacement[key]);
  }
  return next;
}
