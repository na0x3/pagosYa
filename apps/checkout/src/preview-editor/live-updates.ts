/** Applies text and style edits from the editor to the rendered preview without a full re-render. */
import { type StorePreviewEditorSelection } from "../preview-mode";
import { app } from "../ui/app";
import { animationTextScaleVariables } from "./editor-base";


export function updateStorePreviewAnimationText(selection: StorePreviewEditorSelection, value: string): void {
  if (!selection.animationId) return;
  const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
    .find((candidate) => candidate.dataset.animationId === selection.animationId);
  if (!section) return;
  const normalizedValue = value.replace(/\u00a0/g, " ").slice(0, 360);
  const targets = Array.from(section.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((target) => {
    if (target.dataset.storeEditorField !== selection.field) return false;
    if (target.dataset.storeEditorAnimationId !== selection.animationId) return false;
    if (selection.itemId) return target.dataset.storeEditorItemId === selection.itemId;
    if (Number.isInteger(selection.itemIndex)) return Number(target.dataset.storeEditorItemIndex) === selection.itemIndex;
    return !target.hasAttribute("data-store-editor-item-index");
  });
  targets.forEach((target) => {
    if (target.matches(".store-testimonial-copy blockquote")) target.textContent = normalizedValue ? `“${normalizedValue}”` : "";
    else if (target.matches('.store-testimonial-copy [data-animation-copy-field="caption"]')) target.textContent = normalizedValue ? `— ${normalizedValue}` : "";
    else target.textContent = normalizedValue;
    target.hidden = !normalizedValue;
  });
  if (selection.field === "buttonLabel") {
    const button = section.querySelector<HTMLElement>(".store-animation-cta");
    if (button) button.hidden = !normalizedValue;
  }
  new Set(targets.map((target) => target.closest<HTMLElement>("[data-animation-copy]")).filter(Boolean)).forEach((copy) => {
    if (!copy) return;
    const hasVisibleText = Array.from(copy.querySelectorAll<HTMLElement>("[data-animation-copy-field]"))
      .some((target) => !target.hidden && !!target.textContent?.trim());
    copy.hidden = !hasVisibleText;
  });
  if (!Number.isInteger(selection.itemIndex)) return;
  const itemIndex = selection.itemIndex!;
  const heroButton = section.querySelector<HTMLElement>(`[data-motion-hero-to="${itemIndex}"]`);
  if (heroButton && selection.field === "title") heroButton.dataset.motionTitle = normalizedValue;
  if (heroButton && selection.field === "caption") heroButton.dataset.motionCaption = normalizedValue;
  const frame = section.querySelector<HTMLElement>(`[data-frame="${itemIndex}"]`);
  if (frame && selection.field === "title") frame.dataset.frameTitleValue = normalizedValue;
  if (frame && selection.field === "body") frame.dataset.frameBodyValue = normalizedValue;
}

export function sameStorePreviewEditorSelection(left: StorePreviewEditorSelection, right: StorePreviewEditorSelection): boolean {
  return left.section === right.section
    && left.field === right.field
    && left.itemId === right.itemId
    && left.itemIndex === right.itemIndex
    && left.animationId === right.animationId;
}

export function updateStorePreviewEditorText(selection: StorePreviewEditorSelection, value: string): void {
  if (selection.animationId) {
    updateStorePreviewAnimationText(selection, value);
    return;
  }
  const normalizedValue = value.replace(/\u00a0/g, " ").slice(0, 2_000);
  app.querySelectorAll<HTMLElement>("[data-store-editor-target]").forEach((target) => {
    if (target.dataset.storeEditorSection !== selection.section) return;
    if (target.dataset.storeEditorField !== selection.field) return;
    if (selection.itemId && target.dataset.storeEditorItemId !== selection.itemId) return;
    if (Number.isInteger(selection.itemIndex) && Number(target.dataset.storeEditorItemIndex) !== selection.itemIndex) return;
    target.textContent = normalizedValue;
  });
}

export function updateStorePreviewAnimationStyle(animationId: string, key: string, value: unknown, selection: StorePreviewEditorSelection | null = null): void {
  const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
    .find((candidate) => candidate.dataset.animationId === animationId);
  if (!section) return;
  const selectedTargets = selection
    ? Array.from(section.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((target) => {
        if (target.dataset.storeEditorField !== selection.field) return false;
        if (selection.itemId) return target.dataset.storeEditorItemId === selection.itemId;
        if (Number.isInteger(selection.itemIndex)) return Number(target.dataset.storeEditorItemIndex) === selection.itemIndex;
        return !target.hasAttribute("data-store-editor-item-index");
      })
    : [];
  const copy = selectedTargets.map((target) => target.closest<HTMLElement>("[data-animation-copy]")).find(Boolean) ?? null;
  const styleTarget = copy ?? section;
  if (key === "textAlign" && ["left", "center", "right"].includes(String(value))) {
    const align = String(value);
    styleTarget.dataset.animationTextAlign = align;
    styleTarget.setAttribute(styleTarget === section ? "data-animation-custom-layout" : "data-animation-copy-custom-layout", "");
    styleTarget.style.setProperty("--animation-copy-align", align);
    styleTarget.style.setProperty("--animation-copy-translate", `${align === "right" ? "-100%" : align === "center" ? "-50%" : "0"} -50%`);
    return;
  }
  if (key === "textScale") {
    const textScale = Math.min(200, Math.max(50, Math.round(Number(value))));
    if (!Number.isFinite(textScale)) return;
    styleTarget.dataset.animationTextScale = String(textScale);
    styleTarget.setAttribute(styleTarget === section ? "data-animation-custom-layout" : "data-animation-copy-custom-layout", "");
    animationTextScaleVariables(styleTarget, textScale);
    return;
  }
  if (key === "textWidthPercent") {
    const textWidthPercent = Math.min(100, Math.max(20, Math.round(Number(value))));
    if (!Number.isFinite(textWidthPercent)) return;
    section.dataset.animationTextWidthPercent = String(textWidthPercent);
    section.setAttribute("data-animation-custom-layout", "");
    section.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    return;
  }
  if (key === "textColor" && /^#[0-9a-f]{6}$/i.test(String(value))) {
    if (styleTarget === section) {
      section.toggleAttribute("data-animation-has-text-color", true);
      section.dataset.animationTextColor = String(value);
      section.style.setProperty("--animation-text-color", String(value));
    } else {
      styleTarget.dataset.animationTextColor = String(value);
      styleTarget.style.setProperty("--animation-scene-text-color", String(value));
    }
    return;
  }
  if (key === "fontStyle" && ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"].includes(String(value))) {
    styleTarget.dataset.animationFontStyle = String(value);
    return;
  }
  if (key === "backgroundColor" && /^#[0-9a-f]{6}$/i.test(String(value))) {
    section.toggleAttribute("data-animation-has-background", true);
    section.style.setProperty("--animation-background", String(value));
  }
}
