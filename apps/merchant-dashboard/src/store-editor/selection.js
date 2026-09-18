// @ts-check
/** Translate the canvas selection into the bounded server operation address.
 * Positional slots are safe only together with the saved website revision.
 * @param {Record<string, any> | null} selection
 * @param {Record<string, any>} snapshot
 */
export function storeAgentSelection(selection, snapshot) {
  if (!selection) return null;
  const { section = "", field = "", itemId = "", itemIndex = -1 } = selection;
  const base = { entity: "", targetId: "", parentId: "", field: "", position: -1, pageId: "" };
  if (section.startsWith("site-")) {
    const id = section.slice(5);
    const owner = snapshot.siteDocument?.sections?.find((/** @type {any} */ entry) => entry.id === id);
    if (!owner) return null;
    base.pageId = owner.pageId || "";
    if (["siteBlockText", "siteBlockMedia"].includes(field) && itemId) return { ...base, entity: "section-block", parentId: id, targetId: itemId, field: field === "siteBlockText" ? "text" : "mediaUrl" };
    const copyField = { siteTitle: "title", siteBody: "body", siteCtaLabel: "ctaLabel" }[/** @type {"siteTitle"} */ (field)];
    if (copyField) return { ...base, entity: "section", targetId: id, field: copyField };
    if (["siteItemTitle", "siteItemBody"].includes(field) && itemIndex >= 0) return { ...base, entity: "section-item", parentId: id, targetId: String(itemIndex), field: field === "siteItemTitle" ? "title" : "body" };
    if (["siteMedia", "editorialMedia"].includes(field) && itemIndex >= 0) return { ...base, entity: "section-media", parentId: id, field: "imageUrl", position: itemIndex };
  }
  if (section.startsWith("animation-")) {
    const id = section.slice(10);
    const owner = snapshot.animations?.find((/** @type {any} */ entry) => entry.id === id);
    if (!owner) return null;
    base.pageId = owner.pageId || "";
    if (field === "media" && itemIndex >= 0) return { ...base, entity: "animation-media", parentId: id, targetId: String(itemIndex), field: "imageUrl", position: itemIndex };
    const copyField = { animationTitle: "title", animationSubtitle: "subtitle", buttonLabel: "buttonLabel" }[/** @type {"animationTitle"} */ (field)];
    if (copyField) return { ...base, entity: "animation", targetId: id, field: copyField };
  }
  if (section === "hero" && itemIndex >= 0) return { ...base, entity: "hero-slide", targetId: String(itemIndex), position: itemIndex, field: field === "media" ? "imageUrl" : field };
  if (section === "gallery" && itemIndex >= 0) {
    const copyField = { editorialTitle: "title", editorialCaption: "caption", editorialBody: "body", editorialMedia: "imageUrl" }[/** @type {"editorialTitle"} */ (field)];
    if (copyField) return { ...base, entity: "editorial-image", targetId: String(itemIndex), position: itemIndex, field: copyField };
  }
  const setting = { storeTagline: "tagline", storeBanner: "bannerUrl", aboutTitle: "aboutTitle", aboutBody: "aboutText", aboutImage: "aboutImageUrl", catalogTitle: "catalogTitle", catalogSubtitle: "catalogSubtitle", promotionTitle: "promotionTitle", promotionBody: "promotionBody", promotionImage: "promotionImageUrl" }[/** @type {"storeTagline"} */ (field)];
  return setting ? { ...base, entity: "visual-setting", field: setting } : null;
}
