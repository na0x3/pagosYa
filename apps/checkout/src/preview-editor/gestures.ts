/** Inline text editing and drag/resize gestures in the preview editor. */
import { postToParent } from "../postmessage";
import { state } from "../state";
import { type StorePreviewEditorSelection } from "../preview-mode";
import { activeSiteSectionViewport, SITE_SECTION_MAX_HEIGHT, SITE_SECTION_MIN_HEIGHT, applySiteSectionPreviewHeight } from "../storefront/motion";
import { showStorePreviewEditorHover, syncStorePreviewEditorSelection } from "./selection";
import { insertStorePreviewInlineLineBreak, animationTextScaleVariables } from "./editor-base";
import { renderStorePreviewCanvasToolbar, storePreviewCanvasToolbar } from "./toolbar";


export function beginStorePreviewInlineTextEdit(target: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (state.storePreviewInlineEditorTarget) return;
  const originalText = target.textContent || "";
  const originalBounds = target.getBoundingClientRect();
  const siteSection = selection.section.startsWith("site-")
    ? target.closest<HTMLElement>(".bespoke-zone[data-site-section]")
    : null;
  const siteSectionBounds = siteSection?.getBoundingClientRect();
  const sectionViewport = activeSiteSectionViewport();
  const heightAttribute = sectionViewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const heightProperty = sectionViewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const freezeSectionHeight = Boolean(siteSection && siteSectionBounds && !siteSection.hasAttribute(heightAttribute));
  const originalHeightProperty = siteSection?.style.getPropertyValue(heightProperty) || "";
  const fixedSectionHeight = siteSectionBounds
    ? Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(siteSectionBounds.height)))
    : null;
  const anchorPrimaryCopy = Boolean(
    siteSection
    && siteSectionBounds
    && target.parentElement?.classList.contains("bespoke-copy")
    && target.dataset.canvasTextOffsetBasis !== "section",
  );
  const anchoredOffsetX = anchorPrimaryCopy && siteSectionBounds
    ? Math.round(((originalBounds.left - siteSectionBounds.left) / siteSectionBounds.width) * 100)
    : null;
  const anchoredOffsetY = anchorPrimaryCopy && siteSectionBounds
    ? Math.round(((originalBounds.top - siteSectionBounds.top) / siteSectionBounds.height) * 100)
    : null;
  const anchoredTextWidth = anchorPrimaryCopy && siteSectionBounds
    ? Math.min(100, Math.max(20, Math.round((originalBounds.width / siteSectionBounds.width) * 100)))
    : null;
  const originallyPositionedPrimaryCopy = siteSection?.classList.contains("has-section-positioned-copy") || false;
  const originalDataOffsetX = target.dataset.canvasTextOffsetX;
  const originalDataOffsetY = target.dataset.canvasTextOffsetY;
  const originalDataOffsetBasis = target.dataset.canvasTextOffsetBasis;
  const originalDataTextWidth = target.dataset.canvasTextWidth;
  const originalCustomLayout = target.hasAttribute("data-canvas-text-custom-layout");
  const originalInlineOffsetX = target.style.getPropertyValue("--canvas-text-offset-x");
  const originalInlineOffsetY = target.style.getPropertyValue("--canvas-text-offset-y");
  const originalInlineTextWidth = target.style.getPropertyValue("--canvas-text-width");
  if (freezeSectionHeight && siteSection && fixedSectionHeight !== null) {
    applySiteSectionPreviewHeight(siteSection, fixedSectionHeight, sectionViewport);
  }
  if (anchorPrimaryCopy && siteSection && anchoredOffsetX !== null && anchoredOffsetY !== null && anchoredTextWidth !== null) {
    siteSection.classList.add("has-section-positioned-copy");
    target.dataset.canvasTextOffsetX = String(anchoredOffsetX);
    target.dataset.canvasTextOffsetY = String(anchoredOffsetY);
    target.dataset.canvasTextOffsetBasis = "section";
    target.dataset.canvasTextWidth = String(anchoredTextWidth);
    target.style.setProperty("--canvas-text-offset-x", `${anchoredOffsetX}%`);
    target.style.setProperty("--canvas-text-offset-y", `${anchoredOffsetY}%`);
    target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
  }
  const originalOffsetX = Number(target.dataset.canvasTextOffsetX || 0);
  const originalOffsetY = Number(target.dataset.canvasTextOffsetY || 0);
  const computedTranslatePixels = () => {
    const parts = getComputedStyle(target).translate.split(/\s+/);
    const pixels = (part?: string) => part?.endsWith("px") ? Number.parseFloat(part) || 0 : 0;
    return { x: pixels(parts[0]), y: pixels(parts[1] ?? parts[0]) };
  };
  let lockedTranslate = computedTranslatePixels();
  const restoreInlineOffset = (property: string, value: string) => {
    if (value) target.style.setProperty(property, value);
    else target.style.removeProperty(property);
  };
  const keepEditorAtOriginalPosition = () => {
    const bounds = target.getBoundingClientRect();
    lockedTranslate = {
      x: lockedTranslate.x + originalBounds.left - bounds.left,
      y: lockedTranslate.y + originalBounds.top - bounds.top,
    };
    target.style.setProperty("--canvas-text-offset-x", `${lockedTranslate.x}px`);
    target.style.setProperty("--canvas-text-offset-y", `${lockedTranslate.y}px`);
  };
  state.storePreviewInlineEditorTarget = target;
  // Selecting inline copy must also move the dashboard to its dedicated tab.
  // The dashboard deliberately avoids focusing its mirrored field for
  // preview-originated selections, so the contenteditable node keeps focus.
  postToParent("STORE_EDITOR_SELECT", { selection });
  target.classList.add("store-preview-inline-editing");
  target.setAttribute("contenteditable", "plaintext-only");
  target.setAttribute("role", "textbox");
  target.setAttribute("aria-label", `Editando ${selection.label}. Return o Tab crea una línea nueva, Control más Return guarda y Escape cancela.`);
  target.spellcheck = true;
  target.style.setProperty("--canvas-text-offset-x", `${lockedTranslate.x}px`);
  target.style.setProperty("--canvas-text-offset-y", `${lockedTranslate.y}px`);
  keepEditorAtOriginalPosition();
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(keepEditorAtOriginalPosition);
  resizeObserver?.observe(target);
  target.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(target);
  const browserSelection = window.getSelection();
  const scrollingElement = document.scrollingElement;
  const editScrollPosition = {
    left: scrollingElement?.scrollLeft || 0,
    top: scrollingElement?.scrollTop || 0,
  };
  const restoreEditScrollPosition = () => {
    if (!scrollingElement) return;
    scrollingElement.scrollLeft = editScrollPosition.left;
    scrollingElement.scrollTop = editScrollPosition.top;
  };
  browserSelection?.removeAllRanges();
  browserSelection?.addRange(range);
  // Chromium can scroll a contenteditable iframe when a programmatic range is
  // selected, even though focus used preventScroll. Keep the canvas viewport
  // fixed while the merchant starts typing.
  restoreEditScrollPosition();
  window.requestAnimationFrame(() => {
    restoreEditScrollPosition();
    window.requestAnimationFrame(restoreEditScrollPosition);
  });

  let finished = false;
  let onKeydown: ((event: KeyboardEvent) => void) | null = null;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    resizeObserver?.disconnect();
    if (onKeydown) target.removeEventListener("keydown", onKeydown, true);
    const value = (target.textContent || "").replace(/\u00a0/g, " ").trim();
    if (!commit) target.textContent = originalText;
    target.removeAttribute("contenteditable");
    target.removeAttribute("role");
    target.removeAttribute("aria-label");
    target.classList.remove("store-preview-inline-editing");
    restoreInlineOffset("--canvas-text-offset-x", originalInlineOffsetX);
    restoreInlineOffset("--canvas-text-offset-y", originalInlineOffsetY);
    state.storePreviewInlineEditorTarget = null;
    if (state.storePreviewInlineEditorFinish === finish) state.storePreviewInlineEditorFinish = null;
    if ((!commit || value === originalText.trim()) && freezeSectionHeight && siteSection) {
      siteSection.removeAttribute(heightAttribute);
      if (originalHeightProperty) siteSection.style.setProperty(heightProperty, originalHeightProperty);
      else siteSection.style.removeProperty(heightProperty);
    }
    if ((!commit || value === originalText.trim()) && anchorPrimaryCopy && siteSection) {
      if (originalDataOffsetX === undefined) delete target.dataset.canvasTextOffsetX;
      else target.dataset.canvasTextOffsetX = originalDataOffsetX;
      if (originalDataOffsetY === undefined) delete target.dataset.canvasTextOffsetY;
      else target.dataset.canvasTextOffsetY = originalDataOffsetY;
      if (originalDataOffsetBasis === undefined) delete target.dataset.canvasTextOffsetBasis;
      else target.dataset.canvasTextOffsetBasis = originalDataOffsetBasis;
      if (originalDataTextWidth === undefined) delete target.dataset.canvasTextWidth;
      else target.dataset.canvasTextWidth = originalDataTextWidth;
      target.toggleAttribute("data-canvas-text-custom-layout", originalCustomLayout);
      if (originalInlineTextWidth) target.style.setProperty("--canvas-text-width", originalInlineTextWidth);
      else target.style.removeProperty("--canvas-text-width");
      if (!originallyPositionedPrimaryCopy) siteSection.classList.remove("has-section-positioned-copy");
    }
    if (commit && value !== originalText.trim()) {
      if (freezeSectionHeight && fixedSectionHeight !== null) {
        postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: fixedSectionHeight });
      }
      if (anchorPrimaryCopy && siteSection && anchoredOffsetX !== null && anchoredOffsetY !== null && anchoredTextWidth !== null) {
        siteSection.classList.add("has-section-positioned-copy");
        target.dataset.canvasTextOffsetX = String(anchoredOffsetX);
        target.dataset.canvasTextOffsetY = String(anchoredOffsetY);
        target.dataset.canvasTextOffsetBasis = "section";
        target.dataset.canvasTextWidth = String(anchoredTextWidth);
        target.style.setProperty("--canvas-text-offset-x", `${anchoredOffsetX}%`);
        target.style.setProperty("--canvas-text-offset-y", `${anchoredOffsetY}%`);
        target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
        postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", {
          selection,
          textOffsetX: anchoredOffsetX,
          textOffsetY: anchoredOffsetY,
          textOffsetBasis: "section",
          textWidthPercent: anchoredTextWidth,
        });
      } else if ((selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation")
        && target.dataset.canvasTextOffsetBasis !== "section") {
        const finalBounds = target.getBoundingClientRect();
        const finalTranslate = computedTranslatePixels();
        const desiredTranslateX = finalTranslate.x + originalBounds.left - finalBounds.left;
        const desiredTranslateY = finalTranslate.y + originalBounds.top - finalBounds.top;
        const textOffsetX = finalBounds.width > 0 ? Math.round((desiredTranslateX / finalBounds.width) * 100) : originalOffsetX;
        const textOffsetY = finalBounds.height > 0 ? Math.round((desiredTranslateY / finalBounds.height) * 100) : originalOffsetY;
        if (textOffsetX !== originalOffsetX || textOffsetY !== originalOffsetY) {
          target.dataset.canvasTextOffsetX = String(textOffsetX);
          target.dataset.canvasTextOffsetY = String(textOffsetY);
          target.toggleAttribute("data-canvas-text-custom-layout", Boolean(textOffsetX || textOffsetY));
          target.style.setProperty("--canvas-text-offset-x", `${textOffsetX}%`);
          target.style.setProperty("--canvas-text-offset-y", `${textOffsetY}%`);
          postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", { selection, textOffsetX, textOffsetY, textOffsetBasis: "element" });
        }
      }
      // The dashboard owns the canonical generated document, but a preview
      // patch that was already queued can arrive before it records this blur.
      // Keep the optimistic copy through those redraws until the parent echoes
      // the committed value back with PAGOSYA_STORE_EDITOR_TEXT_UPDATE.
      state.storePreviewPendingInlineTextCommit = { selection, value };
      postToParent("STORE_EDITOR_INLINE_TEXT", { selection, value });
    }
    showStorePreviewEditorHover(target);
  };
  state.storePreviewInlineEditorFinish = finish;
  onKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      finish(true);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      insertStorePreviewInlineLineBreak(target);
    }
  };
  target.addEventListener("keydown", onKeydown, { capture: true });
  target.addEventListener("blur", () => finish(true), { once: true });
}

export function beginAnimationTextGesture(event: PointerEvent, copy: HTMLElement, action: "move" | "width" | "scale"): void {
  if (!state.storePreviewEditorEnabled || event.button !== 0 || state.storePreviewInlineEditorTarget) return;
  if (copy.matches("[data-text-along-path]")) return;
  const section = copy.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  const animationId = section?.dataset.animationId;
  if (!section || !animationId) return;
  const positioner = copy.offsetParent instanceof HTMLElement ? copy.offsetParent : section;
  const bounds = positioner.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  const copyBounds = copy.getBoundingClientRect();
  const copyHasCustomLayout = copy.hasAttribute("data-animation-copy-custom-layout");
  const sectionHasCustomLayout = section.hasAttribute("data-animation-custom-layout");
  const alreadyCustom = copyHasCustomLayout || sectionHasCustomLayout;
  const mediaIndex = Number(copy.dataset.animationMediaIndex);
  const textBlockId = copy.dataset.animationTextBlock;
  const selection: StorePreviewEditorSelection = {
    section: `animation-${animationId}`,
    field: textBlockId ? "textBlock" : "layout",
    label: textBlockId ? "texto adicional" : "posición y tamaño del texto",
    animationId,
    ...(Number.isInteger(mediaIndex) ? { itemIndex: mediaIndex } : {}),
    ...(textBlockId ? { itemId: textBlockId } : {}),
  };
  const startX = event.clientX;
  const startY = event.clientY;
  const align = copyHasCustomLayout ? (copy.dataset.animationTextAlign || "left") : (section.dataset.animationTextAlign || "left");
  const inferredAnchorX = align === "right"
    ? copyBounds.right
    : align === "center" ? copyBounds.left + (copyBounds.width / 2) : copyBounds.left;
  const finiteNumber = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const startPositionX = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextX : section.dataset.animationTextX, 18)
    : Math.round(Math.min(100, Math.max(0, ((inferredAnchorX - bounds.left) / bounds.width) * 100)));
  const startPositionY = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextY : section.dataset.animationTextY, 76)
    : Math.round(Math.min(100, Math.max(0, (((copyBounds.top + (copyBounds.height / 2)) - bounds.top) / bounds.height) * 100)));
  const startWidth = alreadyCustom
    ? finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextWidthPercent : section.dataset.animationTextWidthPercent, 62)
    : Math.round(Math.min(100, Math.max(20, (copyBounds.width / bounds.width) * 100)));
  const startScale = finiteNumber(copyHasCustomLayout ? copy.dataset.animationTextScale : section.dataset.animationTextScale, 100);
  let positionX = startPositionX;
  let positionY = startPositionY;
  let textWidthPercent = startWidth;
  let textScale = startScale;
  let moved = false;
  let gestureActive = false;
  const activateGesture = () => {
    if (gestureActive) return;
    gestureActive = true;
    state.storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    showStorePreviewEditorHover(null);
    section.classList.add("store-animation-layout-dragging");
    try {
      copy.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  if (action !== "move") {
    activateGesture();
    event.preventDefault();
  }

  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    moved = true;
    activateGesture();
    moveEvent.preventDefault();
    if (!copy.hasAttribute("data-animation-copy-custom-layout")) {
      copy.setAttribute("data-animation-copy-custom-layout", "");
      copy.style.setProperty("--animation-text-x", `${startPositionX}%`);
      copy.style.setProperty("--animation-text-y", `${startPositionY}%`);
      copy.style.setProperty("--animation-copy-width", `${startWidth}%`);
      animationTextScaleVariables(copy, startScale);
      copy.dataset.animationTextAlign = align;
      copy.style.setProperty("--animation-copy-align", align);
      copy.style.setProperty("--animation-copy-translate", `${align === "right" ? "-100%" : align === "center" ? "-50%" : "0"} -50%`);
    }
    if (action === "move") {
      // Keep the point that the merchant grabbed under their pointer. Mapping
      // the pointer itself to the text anchor made the copy jump on press.
      positionX = Math.round(Math.min(100, Math.max(0, startPositionX + ((deltaX / bounds.width) * 100))));
      positionY = Math.round(Math.min(100, Math.max(0, startPositionY + ((deltaY / bounds.height) * 100))));
      copy.style.setProperty("--animation-text-x", `${positionX}%`);
      copy.style.setProperty("--animation-text-y", `${positionY}%`);
    } else if (action === "width") {
      const direction = align === "right" ? -1 : align === "center" ? 2 : 1;
      textWidthPercent = Math.round(Math.min(100, Math.max(20, startWidth + ((deltaX / bounds.width) * 100 * direction))));
      copy.style.setProperty("--animation-copy-width", `${textWidthPercent}%`);
    } else {
      const scaleDelta = ((deltaX + deltaY) / 2 / Math.max(160, Math.min(bounds.width, bounds.height))) * 100;
      textScale = Math.round(Math.min(200, Math.max(50, startScale + scaleDelta)));
      animationTextScaleVariables(copy, textScale);
    }
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    if (gestureActive) section.classList.remove("store-animation-layout-dragging");
    try {
      copy.releasePointerCapture?.(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
    if (!moved || !commit) return;
    // Consume only the synthetic click produced by this drag. A timed lock also
    // swallowed the merchant's next intentional double-click to edit the text.
    state.storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => {
      state.storePreviewEditorSuppressNextClick = false;
    }, 0);
    copy.dataset.animationTextX = String(positionX);
    copy.dataset.animationTextY = String(positionY);
    copy.dataset.animationTextWidthPercent = String(textWidthPercent);
    copy.dataset.animationTextScale = String(textScale);
    postToParent("STORE_EDITOR_ANIMATION_LAYOUT", {
      selection,
      textPositionX: positionX,
      textPositionY: positionY,
      textWidthPercent,
      textScale,
      textAlign: align,
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    copy.style.setProperty("--animation-text-x", `${startPositionX}%`);
    copy.style.setProperty("--animation-text-y", `${startPositionY}%`);
    copy.style.setProperty("--animation-copy-width", `${startWidth}%`);
    animationTextScaleVariables(copy, startScale);
    if (!alreadyCustom) copy.removeAttribute("data-animation-copy-custom-layout");
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

export function beginSiteSectionResizeGesture(event: PointerEvent, section: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (!state.storePreviewEditorEnabled || event.button !== 0 || state.storePreviewInlineEditorTarget) return;
  event.preventDefault();
  event.stopPropagation();
  const viewport = activeSiteSectionViewport();
  const attribute = viewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const property = viewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const originalAttribute = section.getAttribute(attribute);
  const originalProperty = section.style.getPropertyValue(property);
  const startHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(section.getBoundingClientRect().height)));
  const startY = event.clientY;
  let heightPx = startHeight;
  let moved = false;
  state.storePreviewEditorSelection = selection;
  syncStorePreviewEditorSelection();
  renderStorePreviewCanvasToolbar(section, selection);
  postToParent("STORE_EDITOR_SELECT", { selection });
  const updateToolbar = () => {
    const control = storePreviewCanvasToolbar()?.querySelector<HTMLInputElement>("[data-canvas-section-height]");
    const output = storePreviewCanvasToolbar()?.querySelector<HTMLOutputElement>("[data-canvas-section-height-output]");
    const reset = storePreviewCanvasToolbar()?.querySelector<HTMLButtonElement>("[data-canvas-section-height-reset]");
    if (control) control.value = String(heightPx);
    if (output) output.value = `${heightPx} px`;
    if (reset) reset.disabled = false;
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.abs(deltaY) < 3) return;
    moved = true;
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    heightPx = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round((startHeight + deltaY) / 10) * 10));
    section.classList.add("store-site-section-resizing");
    applySiteSectionPreviewHeight(section, heightPx, viewport);
    updateToolbar();
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-site-section-resizing");
    if (!moved || !commit) return;
    postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport, heightPx });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    if (originalAttribute === null) section.removeAttribute(attribute);
    else section.setAttribute(attribute, originalAttribute);
    if (originalProperty) section.style.setProperty(property, originalProperty);
    else section.style.removeProperty(property);
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

export function resolveMobileSiteTextCollision(
  section: HTMLElement,
  target: HTMLElement,
  predicted: { left: number; top: number; width: number; height: number },
): { x: number; y: number; adjusted: boolean } | null {
  const sectionBounds = section.getBoundingClientRect();
  const gap = 12;
  const edge = 10;
  const intersects = (a: typeof predicted, b: DOMRect) => (
    a.left < b.right + gap
    && a.left + a.width > b.left - gap
    && a.top < b.bottom + gap
    && a.top + a.height > b.top - gap
  );
  const blockers = Array.from(section.querySelectorAll<HTMLElement>(
    "img, video, .store-products, .store-contact-section, .store-location-section, .store-event, .store-site-footer",
  )).filter((candidate) => {
    if (candidate === target || candidate.contains(target) || target.contains(candidate)) return false;
    if (candidate.closest(".store-site-section-resize-handle, .store-preview-canvas-toolbar")) return false;
    const rect = candidate.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > sectionBounds.top && rect.top < sectionBounds.bottom;
  }).map((candidate) => candidate.getBoundingClientRect());
  const clamp = (left: number, top: number) => ({
    left: Math.min(sectionBounds.right - edge - predicted.width, Math.max(sectionBounds.left + edge, left)),
    top: Math.min(sectionBounds.bottom - edge - predicted.height, Math.max(sectionBounds.top + edge, top)),
    width: predicted.width,
    height: predicted.height,
  });
  const initial = clamp(predicted.left, predicted.top);
  if (!blockers.some((blocker) => intersects(initial, blocker))) {
    return { x: initial.left - predicted.left, y: initial.top - predicted.top, adjusted: initial.left !== predicted.left || initial.top !== predicted.top };
  }
  const candidates = blockers.flatMap((blocker) => [
    clamp(initial.left, blocker.top - gap - predicted.height),
    clamp(initial.left, blocker.bottom + gap),
    clamp(blocker.left - gap - predicted.width, initial.top),
    clamp(blocker.right + gap, initial.top),
  ]).filter((candidate) => !blockers.some((blocker) => intersects(candidate, blocker)));
  candidates.sort((a, b) => Math.hypot(a.left - initial.left, a.top - initial.top) - Math.hypot(b.left - initial.left, b.top - initial.top));
  const safe = candidates[0];
  return safe ? { x: safe.left - predicted.left, y: safe.top - predicted.top, adjusted: true } : null;
}

export function beginSiteTextGesture(event: PointerEvent, target: HTMLElement, selection: StorePreviewEditorSelection): void {
  if (!state.storePreviewEditorEnabled || event.button !== 0 || state.storePreviewInlineEditorTarget) return;
  const draggableSection = selection.section.startsWith("site-") || selection.section === "brand" || selection.section === "navigation";
  if (!draggableSection || target.dataset.storeEditorInline !== "text") return;
  const section = target.closest<HTMLElement>(".bespoke-zone[data-site-section], .store-site-header");
  if (!section) return;
  const bounds = section.getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1 || targetBounds.width < 1 || targetBounds.height < 1) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const originalDataOffsetX = target.dataset.canvasTextOffsetX;
  const originalDataOffsetY = target.dataset.canvasTextOffsetY;
  const originalDataOffsetBasis = target.dataset.canvasTextOffsetBasis;
  const originalDataTextWidth = target.dataset.canvasTextWidth;
  const originalCustomLayout = target.hasAttribute("data-canvas-text-custom-layout");
  const originalOffsetPropertyX = target.style.getPropertyValue("--canvas-text-offset-x");
  const originalOffsetPropertyY = target.style.getPropertyValue("--canvas-text-offset-y");
  const originalWidthProperty = target.style.getPropertyValue("--canvas-text-width");
  const siteSectionCanvas = selection.section.startsWith("site-") && section.matches(".bespoke-zone[data-site-section]");
  const primaryCopyCanAnchorToSection = siteSectionCanvas && target.parentElement?.classList.contains("bespoke-copy");
  const convertingPrimaryCopy = primaryCopyCanAnchorToSection && target.dataset.canvasTextOffsetBasis !== "section";
  const sectionRelative = target.dataset.canvasTextOffsetBasis === "section" || target.classList.contains("site-free-canvas-text") || primaryCopyCanAnchorToSection;
  const startOffsetX = convertingPrimaryCopy
    ? Math.round(((targetBounds.left - bounds.left) / bounds.width) * 100)
    : Number(target.dataset.canvasTextOffsetX || 0);
  const startOffsetY = convertingPrimaryCopy
    ? Math.round(((targetBounds.top - bounds.top) / bounds.height) * 100)
    : Number(target.dataset.canvasTextOffsetY || 0);
  const anchoredTextWidth = convertingPrimaryCopy
    ? Math.min(100, Math.max(20, Math.round((targetBounds.width / bounds.width) * 100)))
    : Number(target.dataset.canvasTextWidth || 62);
  const sectionViewport = activeSiteSectionViewport();
  const heightAttribute = sectionViewport === "mobile" ? "data-site-height-mobile" : "data-site-height-desktop";
  const heightProperty = sectionViewport === "mobile" ? "--site-section-height-mobile" : "--site-section-height-desktop";
  const freezeSectionHeight = siteSectionCanvas && !section.hasAttribute(heightAttribute);
  const originalHeightProperty = section.style.getPropertyValue(heightProperty);
  const fixedSectionHeight = Math.min(SITE_SECTION_MAX_HEIGHT, Math.max(SITE_SECTION_MIN_HEIGHT, Math.round(bounds.height)));
  const originallyPositionedPrimaryCopy = section.classList.contains("has-section-positioned-copy");
  const horizontalBasis = sectionRelative ? bounds.width : targetBounds.width;
  const verticalBasis = sectionRelative ? bounds.height : targetBounds.height;
  const minimumX = sectionRelative ? -100 : startOffsetX + ((bounds.left - targetBounds.left) / targetBounds.width) * 100;
  const maximumX = sectionRelative ? 100 : startOffsetX + ((bounds.right - targetBounds.right) / targetBounds.width) * 100;
  const minimumY = sectionRelative ? -100 : startOffsetY + ((bounds.top - targetBounds.top) / targetBounds.height) * 100;
  const maximumY = sectionRelative ? 100 : startOffsetY + ((bounds.bottom - targetBounds.bottom) / targetBounds.height) * 100;
  let offsetX = startOffsetX;
  let offsetY = startOffsetY;
  let lastSafeOffsetX = startOffsetX;
  let lastSafeOffsetY = startOffsetY;
  let moved = false;
  let active = false;
  const activate = () => {
    if (active) return;
    active = true;
    state.storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    // Selection normally opens its editing popover. During a drag that panel
    // obscures the exact letter position, so dismiss it until the merchant
    // deliberately clicks the text again after placing it.
    renderStorePreviewCanvasToolbar(null, null);
    showStorePreviewEditorHover(null);
    section.classList.add("store-site-text-dragging");
    if (freezeSectionHeight) applySiteSectionPreviewHeight(section, fixedSectionHeight, sectionViewport);
    if (convertingPrimaryCopy) {
      section.classList.add("has-section-positioned-copy");
      target.dataset.canvasTextOffsetBasis = "section";
      target.dataset.canvasTextOffsetX = String(startOffsetX);
      target.dataset.canvasTextOffsetY = String(startOffsetY);
      target.dataset.canvasTextWidth = String(anchoredTextWidth);
      target.style.setProperty("--canvas-text-offset-x", `${startOffsetX}%`);
      target.style.setProperty("--canvas-text-offset-y", `${startOffsetY}%`);
      target.style.setProperty("--canvas-text-width", `${anchoredTextWidth}%`);
    }
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic pointer events and older embedded browsers may not own the id.
    }
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    moved = true;
    activate();
    moveEvent.preventDefault();
    moveEvent.stopPropagation();
    offsetX = Math.round(Math.min(maximumX, Math.max(minimumX, startOffsetX + (deltaX / horizontalBasis) * 100)));
    offsetY = Math.round(Math.min(maximumY, Math.max(minimumY, startOffsetY + (deltaY / verticalBasis) * 100)));
    if (siteSectionCanvas && sectionViewport === "mobile") {
      const predicted = {
        left: targetBounds.left + ((offsetX - startOffsetX) / 100) * horizontalBasis,
        top: targetBounds.top + ((offsetY - startOffsetY) / 100) * verticalBasis,
        width: targetBounds.width,
        height: targetBounds.height,
      };
      const collision = resolveMobileSiteTextCollision(section, target, predicted);
      if (collision) {
        offsetX = Math.round(Math.min(maximumX, Math.max(minimumX, offsetX + (collision.x / horizontalBasis) * 100)));
        offsetY = Math.round(Math.min(maximumY, Math.max(minimumY, offsetY + (collision.y / verticalBasis) * 100)));
        lastSafeOffsetX = offsetX;
        lastSafeOffsetY = offsetY;
        section.classList.toggle("store-site-text-collision-guarded", collision.adjusted);
      } else {
        offsetX = lastSafeOffsetX;
        offsetY = lastSafeOffsetY;
        section.classList.add("store-site-text-collision-guarded");
      }
    }
    target.dataset.canvasTextOffsetX = String(offsetX);
    target.dataset.canvasTextOffsetY = String(offsetY);
    target.toggleAttribute("data-canvas-text-custom-layout", Boolean(offsetX || offsetY));
    target.style.setProperty("--canvas-text-offset-x", `${offsetX}%`);
    target.style.setProperty("--canvas-text-offset-y", `${offsetY}%`);
    if (sectionRelative) target.dataset.canvasTextOffsetBasis = "section";
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-site-text-dragging");
    section.classList.remove("store-site-text-collision-guarded");
    try {
      target.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have released the pointer already.
    }
    if (!moved || !commit) return;
    state.storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => { state.storePreviewEditorSuppressNextClick = false; }, 0);
    if (freezeSectionHeight) postToParent("STORE_EDITOR_SECTION_HEIGHT", { selection, viewport: sectionViewport, heightPx: fixedSectionHeight });
    postToParent("STORE_EDITOR_SITE_TEXT_LAYOUT", {
      selection,
      textOffsetX: offsetX,
      textOffsetY: offsetY,
      textOffsetBasis: sectionRelative ? "section" : "element",
      ...(convertingPrimaryCopy ? { textWidthPercent: anchoredTextWidth } : {}),
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    if (convertingPrimaryCopy) {
      if (originalDataOffsetX === undefined) delete target.dataset.canvasTextOffsetX;
      else target.dataset.canvasTextOffsetX = originalDataOffsetX;
      if (originalDataOffsetY === undefined) delete target.dataset.canvasTextOffsetY;
      else target.dataset.canvasTextOffsetY = originalDataOffsetY;
      if (originalDataOffsetBasis === undefined) delete target.dataset.canvasTextOffsetBasis;
      else target.dataset.canvasTextOffsetBasis = originalDataOffsetBasis;
      if (originalDataTextWidth === undefined) delete target.dataset.canvasTextWidth;
      else target.dataset.canvasTextWidth = originalDataTextWidth;
      target.toggleAttribute("data-canvas-text-custom-layout", originalCustomLayout);
      if (originalOffsetPropertyX) target.style.setProperty("--canvas-text-offset-x", originalOffsetPropertyX);
      else target.style.removeProperty("--canvas-text-offset-x");
      if (originalOffsetPropertyY) target.style.setProperty("--canvas-text-offset-y", originalOffsetPropertyY);
      else target.style.removeProperty("--canvas-text-offset-y");
      if (originalWidthProperty) target.style.setProperty("--canvas-text-width", originalWidthProperty);
      else target.style.removeProperty("--canvas-text-width");
      if (!originallyPositionedPrimaryCopy) section.classList.remove("has-section-positioned-copy");
    } else {
      target.dataset.canvasTextOffsetX = String(startOffsetX);
      target.dataset.canvasTextOffsetY = String(startOffsetY);
      target.toggleAttribute("data-canvas-text-custom-layout", Boolean(startOffsetX || startOffsetY));
      target.style.setProperty("--canvas-text-offset-x", `${startOffsetX}%`);
      target.style.setProperty("--canvas-text-offset-y", `${startOffsetY}%`);
    }
    if (freezeSectionHeight) {
      section.removeAttribute(heightAttribute);
      if (originalHeightProperty) section.style.setProperty(heightProperty, originalHeightProperty);
      else section.style.removeProperty(heightProperty);
    }
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

export function beginAnimationButtonGesture(event: PointerEvent, button: HTMLElement): void {
  if (!state.storePreviewEditorEnabled || event.button !== 0 || state.storePreviewInlineEditorTarget) return;
  const section = button.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  const animationId = section?.dataset.animationId;
  if (!section || !animationId) return;
  const bounds = section.getBoundingClientRect();
  if (bounds.width < 1 || bounds.height < 1) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const startPositionX = Number(button.dataset.animationButtonX || 18);
  const startPositionY = Number(button.dataset.animationButtonY || 86);
  let positionX = startPositionX;
  let positionY = startPositionY;
  let moved = false;
  const selection: StorePreviewEditorSelection = {
    section: `animation-${animationId}`,
    field: "buttonLabel",
    label: "botón de la animación",
    animationId,
  };
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId !== event.pointerId) return;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return;
    if (!moved) {
      moved = true;
      state.storePreviewEditorSelection = selection;
      syncStorePreviewEditorSelection();
      showStorePreviewEditorHover(null);
      section.classList.add("store-animation-layout-dragging");
      try { button.setPointerCapture?.(event.pointerId); } catch {}
    }
    moveEvent.preventDefault();
    positionX = Math.round(Math.min(100, Math.max(0, startPositionX + (deltaX / bounds.width) * 100)));
    positionY = Math.round(Math.min(100, Math.max(0, startPositionY + (deltaY / bounds.height) * 100)));
    button.style.setProperty("--animation-button-x", `${positionX}%`);
    button.style.setProperty("--animation-button-y", `${positionY}%`);
  };
  const finish = (finishEvent: PointerEvent, commit = true) => {
    if (finishEvent.pointerId !== event.pointerId) return;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", finish, true);
    window.removeEventListener("pointercancel", cancel, true);
    section.classList.remove("store-animation-layout-dragging");
    try { button.releasePointerCapture?.(event.pointerId); } catch {}
    if (!moved || !commit) return;
    state.storePreviewEditorSuppressNextClick = true;
    window.setTimeout(() => { state.storePreviewEditorSuppressNextClick = false; }, 0);
    button.dataset.animationButtonX = String(positionX);
    button.dataset.animationButtonY = String(positionY);
    postToParent("STORE_EDITOR_ANIMATION_BUTTON_LAYOUT", {
      selection,
      buttonPositionX: positionX,
      buttonPositionY: positionY,
    });
  };
  const cancel = (cancelEvent: PointerEvent) => {
    if (cancelEvent.pointerId !== event.pointerId) return;
    button.style.setProperty("--animation-button-x", `${startPositionX}%`);
    button.style.setProperty("--animation-button-y", `${startPositionY}%`);
    finish(cancelEvent, false);
  };
  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", finish, true);
  window.addEventListener("pointercancel", cancel, true);
}

export function clearStorePreviewEditorSelection(): void {
  const hadSelection = state.storePreviewEditorSelection !== null;
  state.storePreviewInlineEditorFinish?.(true);
  if (state.storePreviewEditorClickTimer !== null) window.clearTimeout(state.storePreviewEditorClickTimer);
  state.storePreviewEditorClickTimer = null;
  state.storePreviewEditorSelection = null;
  syncStorePreviewEditorSelection();
  showStorePreviewEditorHover(null);
  if (hadSelection) postToParent("STORE_EDITOR_SELECT", { selection: null });
}
