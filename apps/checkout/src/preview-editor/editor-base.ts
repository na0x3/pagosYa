/** Shared pieces of the preview editor: editable fields, selection labels, and the rendered site document. */
import { Store } from "../api";
import { postToParent } from "../postmessage";
import { state } from "../state";
import { type StorePreviewEditorSelection } from "../preview-mode";


export const STORE_PREVIEW_INLINE_TEXT_FIELDS = new Set([
  "storeName", "storeTagline", "title", "caption", "body", "ctaLabel",
  "announcementText",
  "animationTitle", "animationSubtitle", "textBlock", "buttonLabel",
  "siteTitle", "siteBody", "siteCtaLabel", "siteItemTitle", "siteItemBody", "siteBlockText",
  "catalogTitle", "catalogSubtitle", "aboutTitle", "aboutSubtitle", "aboutBody",
  "galleryTitle", "gallerySubtitle", "editorialTitle", "editorialCaption", "editorialBody",
  "linksTitle", "linkLabel", "contactTitle", "contactSubtitle", "locationTitle",
  "locationSubtitle", "promotionTitle", "promotionBody", "promotionAction", "cartButton",
  "navigationLabel", "footerBrandDescription", "footerColumnTitle", "footerItemLabel", "footerCopyright", "footerBadge",
]);
export const STORE_PREVIEW_INLINE_IMAGE_FIELDS = new Set([
  "storeLogo", "storeBanner", "aboutImage", "editorialMedia", "media", "siteMedia", "siteBlockMedia", "promotionImage", "categoryBanner",
]);

export function sanitizeStorePreviewEditorSelection(value: unknown): StorePreviewEditorSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as Record<string, unknown>;
  if (typeof selection.section !== "string" || typeof selection.field !== "string") return null;
  return {
    section: selection.section.slice(0, 64) as StorePreviewEditorSelection["section"],
    field: selection.field.slice(0, 64),
    label: typeof selection.label === "string" ? selection.label.slice(0, 120) : "parte seleccionada",
    ...(typeof selection.itemId === "string" ? { itemId: selection.itemId.slice(0, 200) } : {}),
    ...(Number.isInteger(selection.itemIndex) ? { itemIndex: Math.max(0, Number(selection.itemIndex)) } : {}),
    ...(typeof selection.animationId === "string" ? { animationId: selection.animationId.slice(0, 64) } : {}),
  };
}

export function storePreviewEditorLabel(): HTMLElement {
  let label = document.querySelector<HTMLElement>(".store-preview-editor-label");
  if (!label) {
    label = document.createElement("div");
    label.className = "store-preview-editor-label";
    label.setAttribute("aria-hidden", "true");
    document.body.appendChild(label);
  }
  return label;
}

export function storePreviewRenderedSiteDocument(): Store["siteDocument"] | null {
  const renderedStore = state.activePreviewRenderedStore ?? state.activePreviewStore?.store ?? state.activeStoreRoute?.store;
  return renderedStore?.siteDocument ?? null;
}

export function insertStorePreviewInlineLineBreak(target: HTMLElement): void {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (!selection || !range || !target.contains(range.commonAncestorContainer)) {
    target.append(document.createTextNode("\n"));
    return;
  }
  range.deleteContents();
  const newline = document.createTextNode("\n");
  range.insertNode(newline);
  range.setStartAfter(newline);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

export function beginStorePreviewInlineImageEdit(selection: StorePreviewEditorSelection): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = selection.animationId && ["media", "mediaAdd"].includes(selection.field)
    ? "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
    : "image/png,image/jpeg,image/webp";
  input.className = "store-preview-inline-file-input";
  input.setAttribute("aria-label", `Cambiar ${selection.label}`);
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) postToParent("STORE_EDITOR_INLINE_IMAGE", { selection, file });
    input.remove();
  }, { once: true });
  input.addEventListener("cancel", () => input.remove(), { once: true });
  document.body.appendChild(input);
  input.click();
}

export function animationTextScaleVariables(section: HTMLElement, textScale: number): void {
  const scale = textScale / 100;
  section.style.setProperty("--animation-heading-size", `clamp(${Math.round(40 * scale)}px, ${(6.5 * scale).toFixed(2)}vw, ${Math.round(88 * scale)}px)`);
  section.style.setProperty("--animation-card-copy-size", `clamp(${Math.round(20 * scale)}px, ${(2.6 * scale).toFixed(2)}vw, ${Math.round(26 * scale)}px)`);
  section.style.setProperty("--animation-body-size", `clamp(${Math.round(15 * scale)}px, ${(1.7 * scale).toFixed(2)}vw, ${Math.round(20 * scale)}px)`);
}

export function applyAnimationCopySceneLayout(copy: HTMLElement, source: HTMLElement = copy): void {
  const hasCustomLayout = source.hasAttribute("data-animation-copy-custom-layout");
  copy.toggleAttribute("data-animation-copy-custom-layout", hasCustomLayout);
  const index = Number(source.dataset.animationMediaIndex);
  if (Number.isInteger(index)) {
    copy.dataset.animationMediaIndex = String(index);
    copy.querySelectorAll<HTMLElement>("[data-store-editor-target]").forEach((target) => {
      target.dataset.storeEditorItemIndex = String(index);
      if (target.dataset.storeEditorField === "title") target.dataset.storeEditorLabel = `texto de la escena ${index + 1}`;
      if (target.dataset.storeEditorField === "caption") target.dataset.storeEditorLabel = `subtítulo de la escena ${index + 1}`;
      if (target.dataset.storeEditorField === "body") target.dataset.storeEditorLabel = `descripción de la escena ${index + 1}`;
    });
  }
  const textPositionX = Number(source.dataset.animationTextX || 18);
  const textPositionY = Number(source.dataset.animationTextY || 76);
  const textScale = Number(source.dataset.animationTextScale || 100);
  const textWidthPercent = Number(source.dataset.animationTextWidthPercent || 62);
  copy.dataset.animationTextX = String(textPositionX);
  copy.dataset.animationTextY = String(textPositionY);
  copy.dataset.animationTextScale = String(textScale);
  copy.dataset.animationTextWidthPercent = String(textWidthPercent);
  copy.dataset.animationTextAlign = source.dataset.animationTextAlign || "left";
  if (hasCustomLayout) {
    copy.style.setProperty("--animation-text-x", `${textPositionX}%`);
    copy.style.setProperty("--animation-text-y", `${textPositionY}%`);
    copy.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    animationTextScaleVariables(copy, textScale);
    copy.style.setProperty("--animation-copy-align", copy.dataset.animationTextAlign);
    const translateX = copy.dataset.animationTextAlign === "right" ? "-100%" : copy.dataset.animationTextAlign === "center" ? "-50%" : "0";
    copy.style.setProperty("--animation-copy-translate", `${translateX} -50%`);
  } else {
    ["--animation-text-x", "--animation-text-y", "--animation-copy-width", "--animation-heading-size", "--animation-card-copy-size", "--animation-body-size", "--animation-copy-align", "--animation-copy-translate"].forEach((property) => copy.style.removeProperty(property));
  }
  if (source.dataset.animationTextColor) {
    copy.dataset.animationTextColor = source.dataset.animationTextColor;
    copy.style.setProperty("--animation-scene-text-color", source.dataset.animationTextColor);
  } else {
    delete copy.dataset.animationTextColor;
    copy.style.removeProperty("--animation-scene-text-color");
  }
}

export function isStorePreviewTextEditingTarget(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "number"].includes(target.type)) return true;
  return target instanceof HTMLElement
    && (target.isContentEditable || !!target.closest('[contenteditable]:not([contenteditable="false"])'));
}
