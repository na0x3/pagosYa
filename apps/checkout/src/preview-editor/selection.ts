/** Which element the editor has selected or hovered, and keeping the toolbar in sync with it. */
import { state } from "../state";
import { type StorePreviewEditorSelection, storePreviewMode, storeEditorMode } from "../preview-mode";
import { STORE_PREVIEW_INLINE_TEXT_FIELDS, STORE_PREVIEW_INLINE_IMAGE_FIELDS, storePreviewEditorLabel } from "./editor-base";
import { app } from "../ui/app";
import { renderStorePreviewCanvasToolbar } from "./toolbar";


export function markStorePreviewEditorTarget(element: Element | null, selection: StorePreviewEditorSelection): void {
  if (!(element instanceof HTMLElement)) return;
  element.dataset.storeEditorTarget = "true";
  element.dataset.storeEditorSection = selection.section;
  element.dataset.storeEditorField = selection.field;
  element.dataset.storeEditorLabel = selection.label;
  if (selection.itemId) element.dataset.storeEditorItemId = selection.itemId;
  if (Number.isInteger(selection.itemIndex)) element.dataset.storeEditorItemIndex = String(selection.itemIndex);
  if (selection.animationId) element.dataset.storeEditorAnimationId = selection.animationId;
  if (STORE_PREVIEW_INLINE_TEXT_FIELDS.has(selection.field)) {
    element.dataset.storeEditorInline = "text";
    const draggableCanvasText = element.hasAttribute("data-canvas-text-style")
      && (selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation");
    if (draggableCanvasText) {
      element.dataset.storeEditorDraggableText = "true";
      element.setAttribute("aria-description", "Arrastra para mover. Haz doble clic para editar el texto.");
      const dragHost = element.closest<HTMLAnchorElement>("a");
      if (dragHost) {
        dragHost.draggable = false;
        dragHost.dataset.storeEditorDragHost = "true";
      }
    }
  } else if (STORE_PREVIEW_INLINE_IMAGE_FIELDS.has(selection.field)) {
    element.dataset.storeEditorInline = "image";
    element.tabIndex = 0;
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", `Cambiar ${selection.label}`);
  }
}

export function markAllStorePreviewEditorTargets(
  selector: string,
  selection: StorePreviewEditorSelection | ((element: HTMLElement, index: number) => StorePreviewEditorSelection),
): void {
  app.querySelectorAll<HTMLElement>(selector).forEach((element, index) => {
    markStorePreviewEditorTarget(element, typeof selection === "function" ? selection(element, index) : selection);
  });
}

export function syncStorePreviewEditorMode(): void {
  document.documentElement.classList.toggle("store-preview-mode", storePreviewMode);
  document.documentElement.classList.toggle("store-editor-mode", storeEditorMode);
  document.body.classList.toggle("store-preview-editor-enabled", storeEditorMode && state.storePreviewEditorEnabled);
  if (!state.storePreviewEditorEnabled) {
    state.storePreviewInlineEditorFinish?.(true);
    state.storePreviewPendingInlineTextCommit = null;
    if (state.storePreviewEditorClickTimer !== null) window.clearTimeout(state.storePreviewEditorClickTimer);
    state.storePreviewEditorClickTimer = null;
    state.storePreviewEditorSuppressNextClick = false;
  }
  if (!state.storePreviewEditorEnabled && state.storePreviewEditorHover) {
    state.storePreviewEditorHover.classList.remove("store-preview-editor-hover");
    state.storePreviewEditorHover = null;
  }
  if (!state.storePreviewEditorEnabled) renderStorePreviewCanvasToolbar(null, null);
}

export function syncStorePreviewEditorSelection(): void {
  app.querySelectorAll<HTMLElement>(".store-preview-editor-selected").forEach((element) => element.classList.remove("store-preview-editor-selected"));
  app.querySelectorAll<HTMLElement>(".store-animation-layout-selected").forEach((element) => element.classList.remove("store-animation-layout-selected"));
  const selection = state.storePreviewEditorSelection;
  if (!selection || !state.storePreviewEditorEnabled) {
    renderStorePreviewCanvasToolbar(null, null);
    return;
  }
  if (selection.animationId) {
    const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
      .find((candidate) => candidate.dataset.animationId === selection.animationId);
    const copies = Array.from(section?.querySelectorAll<HTMLElement>("[data-animation-copy]") ?? []);
    const selectedCopy = selection.itemId
      ? copies.find((copy) => copy.dataset.animationTextBlock === selection.itemId)
      : Number.isInteger(selection.itemIndex)
      ? copies.find((copy) => Number(copy.dataset.animationMediaIndex) === selection.itemIndex)
      : copies.find((copy) => !copy.hasAttribute("data-animation-media-index")) || copies[0];
    selectedCopy?.classList.add("store-animation-layout-selected");
  }
  const candidates = Array.from(app.querySelectorAll<HTMLElement>("[data-store-editor-target]")).filter((element) => {
    if (element.dataset.storeEditorSection !== selection.section) return false;
    if (selection.animationId && element.dataset.storeEditorAnimationId !== selection.animationId) return false;
    if (selection.itemId && element.dataset.storeEditorItemId !== selection.itemId) return false;
    if (Number.isInteger(selection.itemIndex) && Number(element.dataset.storeEditorItemIndex) !== selection.itemIndex) return false;
    return element.dataset.storeEditorField === selection.field;
  });
  const target = candidates[0] || Array.from(app.querySelectorAll<HTMLElement>("[data-store-editor-section]"))
    .find((candidate) => candidate.dataset.storeEditorSection === selection.section);
  target?.classList.add("store-preview-editor-selected");
  renderStorePreviewCanvasToolbar(target ?? null, selection);
}

export function selectionFromStorePreviewEditorTarget(target: HTMLElement): StorePreviewEditorSelection | null {
  const section = target.dataset.storeEditorSection;
  const field = target.dataset.storeEditorField;
  if (!section || !field) return null;
  const selection: StorePreviewEditorSelection = {
    section: section as StorePreviewEditorSelection["section"],
    field,
    label: target.dataset.storeEditorLabel || "parte de la tienda",
  };
  if (target.dataset.storeEditorItemId) selection.itemId = target.dataset.storeEditorItemId;
  if (target.dataset.storeEditorItemIndex && Number.isInteger(Number(target.dataset.storeEditorItemIndex))) selection.itemIndex = Number(target.dataset.storeEditorItemIndex);
  if (target.dataset.storeEditorAnimationId) selection.animationId = target.dataset.storeEditorAnimationId;
  return selection;
}

export function showStorePreviewEditorHover(target: HTMLElement | null): void {
  if (state.storePreviewEditorHover && state.storePreviewEditorHover !== target) state.storePreviewEditorHover.classList.remove("store-preview-editor-hover");
  state.storePreviewEditorHover = target;
  const label = storePreviewEditorLabel();
  if (!target || !state.storePreviewEditorEnabled) {
    label.style.display = "none";
    return;
  }
  target.classList.add("store-preview-editor-hover");
  const animationCopy = target.closest<HTMLElement>("[data-animation-copy][data-animation-layout-target]");
  const siteDraggableCopy = target.matches("[data-canvas-text-style]")
    && target.dataset.storeEditorInline === "text"
    && (target.dataset.storeEditorSection?.startsWith("site-")
      || target.dataset.storeEditorSection === "brand"
      || target.dataset.storeEditorSection === "navigation");
  const selectedAnimationCopy = document.querySelector<HTMLElement>("[data-animation-copy].store-animation-layout-selected");
  if (selectedAnimationCopy && target.closest(".store-motion-section") === selectedAnimationCopy.closest(".store-motion-section")) {
    label.style.display = "none";
    return;
  }
  const action = target.dataset.storeEditorInline === "image" ? "cambiar" : target.dataset.storeEditorInline === "text" ? "editar" : "abrir";
  label.textContent = target.dataset.storeEditorField === "announcementText"
    ? "Toca para configurar o quitar la marquesina"
    : target.dataset.storeEditorInline === "image" && !animationCopy
    ? `Toca para editar ${target.dataset.storeEditorLabel || "esta imagen"}`
    : animationCopy
    ? `Arrastra para mover · doble clic para ${action}`
    : siteDraggableCopy
    ? `Arrastra para mover · doble clic para ${action}`
    : `${target.dataset.storeEditorInline === "text" ? "Un clic" : "Doble clic"} para ${action} ${target.dataset.storeEditorLabel || "esta parte"}`;
  const rect = target.getBoundingClientRect();
  label.style.display = "block";
  label.style.left = `${Math.max(8, Math.min(rect.left + 8, window.innerWidth - 270))}px`;
  label.style.top = `${Math.max(8, Math.min(rect.top + 8, window.innerHeight - 48))}px`;
}
