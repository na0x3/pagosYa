/** Connects the preview iframe to the Studio editor. Both functions run only in editor mode (see main.ts). */
import { postToParent } from "../postmessage";
import { sanitizeSiteDocument, synchronizeSiteDocument } from "../site-document";
import { state } from "../state";
import { STORE_PREVIEW_SECTIONS, type StorePreviewSection } from "../preview-mode";
import { app } from "../ui/app";
import { sanitizeStorePreviewPatch, changedLegacySiteTextPatch, sanitizeStorePreviewProduct } from "./patch";
import { renderCartReviewDialog, openCartReview, renderProductPage, renderStoreRoute } from "../storefront/store-page";
import { normalizeStoreMapEmbedInput, safeStoreMapEmbedUrl } from "../storefront/locations";
import { isStorePreviewTextEditingTarget, STORE_PREVIEW_INLINE_TEXT_FIELDS, beginStorePreviewInlineImageEdit, sanitizeStorePreviewEditorSelection } from "./editor-base";
import { selectionFromStorePreviewEditorTarget, syncStorePreviewEditorSelection, showStorePreviewEditorHover, syncStorePreviewEditorMode } from "./selection";
import { beginSiteTextGesture, beginAnimationButtonGesture, beginAnimationTextGesture, clearStorePreviewEditorSelection, beginStorePreviewInlineTextEdit } from "./gestures";
import { positionStorePreviewCanvasToolbar } from "./toolbar";
import { updateStorePreviewEditorText, sameStorePreviewEditorSelection, updateStorePreviewAnimationStyle } from "./live-updates";
import { scrollStorePreviewToElement, scrollStorePreviewToSection, scrollStorePreviewToMotion, scrollStorePreviewToHeroItem, scrollStorePreviewToEditorialItem } from "./scroll";


/** Wires the editor canvas inside the preview: selection, inline edits, gestures, and the toolbar. */
export function bindStoreEditorCanvas() {
  app.addEventListener("submit", (event) => {
    const form = event.target instanceof Element
      ? event.target.closest<HTMLFormElement>("[data-store-location-inline-editor]")
      : null;
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector<HTMLTextAreaElement>("[data-store-location-map-input]");
    const status = form.querySelector<HTMLElement>(".store-location-inline-status");
    if (!input) return;
    const normalized = normalizeStoreMapEmbedInput(input.value);
    const safeUrl = normalized ? safeStoreMapEmbedUrl(normalized) : null;
    if (normalized && !safeUrl) {
      input.setAttribute("aria-invalid", "true");
      if (status) {
        status.dataset.state = "error";
        status.textContent = "Usa el código de inserción de Google Maps u OpenStreetMap.";
      }
      input.focus();
      return;
    }
    input.removeAttribute("aria-invalid");
    input.value = safeUrl || "";
    if (status) {
      status.dataset.state = "success";
      status.textContent = safeUrl ? "Mapa listo para guardar." : "Mapa quitado.";
    }
    postToParent("STORE_EDITOR_LOCATION_MAP", {
      locationId: form.dataset.locationId,
      mapEmbedUrl: safeUrl || "",
    });
  });
  app.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const clearMapButton = event.target.closest<HTMLButtonElement>("[data-store-location-map-clear]");
    if (clearMapButton) {
      const form = clearMapButton.closest<HTMLFormElement>("[data-store-location-inline-editor]");
      const input = form?.querySelector<HTMLTextAreaElement>("[data-store-location-map-input]");
      if (form && input) {
        input.value = "";
        form.requestSubmit();
      }
      return;
    }
    const deleteLocationButton = event.target.closest<HTMLButtonElement>("[data-store-location-delete]");
    if (deleteLocationButton) {
      postToParent("STORE_EDITOR_DELETE_LOCATION", { locationId: deleteLocationButton.dataset.locationId });
      return;
    }
    const deleteAnimationButton = event.target.closest<HTMLButtonElement>(".store-animation-delete-control[data-animation-id]");
    if (deleteAnimationButton) {
      postToParent("STORE_EDITOR_DELETE_ANIMATION", { animationId: deleteAnimationButton.dataset.animationId });
    }
  });
  document.addEventListener("keydown", (event) => {
    const textEditing = isStorePreviewTextEditingTarget(event.target);
    if (!textEditing && (event.key === "Enter" || event.key === " ") && event.target instanceof HTMLElement) {
      const target = event.target.closest<HTMLElement>('[data-store-editor-target][role="button"]');
      const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
      if (target && selection) {
        event.preventDefault();
        state.storePreviewEditorSelection = selection;
        syncStorePreviewEditorSelection();
        showStorePreviewEditorHover(target);
        postToParent("STORE_EDITOR_SELECT", { selection });
        return;
      }
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (textEditing) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      postToParent("STORE_EDITOR_UNDO", {});
    } else if (key === "c" && state.storePreviewEditorSelection && STORE_PREVIEW_INLINE_TEXT_FIELDS.has(state.storePreviewEditorSelection.field)) {
      event.preventDefault();
      const selectedText = document.querySelector<HTMLElement>(".store-preview-editor-selected[data-store-editor-inline='text']");
      postToParent("STORE_EDITOR_COPY_TEXT", { selection: state.storePreviewEditorSelection, value: selectedText?.textContent || "" });
    } else if (key === "v" && state.storePreviewEditorSelection && STORE_PREVIEW_INLINE_TEXT_FIELDS.has(state.storePreviewEditorSelection.field)) {
      event.preventDefault();
      postToParent("STORE_EDITOR_PASTE_TEXT", { selection: state.storePreviewEditorSelection });
    } else if (key === "d" && state.storePreviewEditorSelection && (state.storePreviewEditorSelection.animationId || state.storePreviewEditorSelection.section.startsWith("site-"))) {
      event.preventDefault();
      postToParent("STORE_EDITOR_DUPLICATE_TEXT", { selection: state.storePreviewEditorSelection });
    }
  }, true);
  window.addEventListener("blur", () => state.storePreviewInlineEditorFinish?.(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") state.storePreviewInlineEditorFinish?.(true);
  });
  app.addEventListener("pointerover", (event) => {
    if (!state.storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    showStorePreviewEditorHover(event.target.closest<HTMLElement>("[data-store-editor-target]"));
  }, true);
  app.addEventListener("pointerleave", () => showStorePreviewEditorHover(null), true);
  app.addEventListener("dragstart", (event) => {
    if (!state.storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-store-editor-draggable-text], [data-store-editor-drag-host]")) event.preventDefault();
  }, true);
  app.addEventListener("pointerdown", (event) => {
    if (!state.storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    const siteText = event.target.closest<HTMLElement>("[data-store-editor-target][data-store-editor-inline='text'][data-canvas-text-style]");
    const siteTextSelection = siteText ? selectionFromStorePreviewEditorTarget(siteText) : null;
    if (siteText && siteTextSelection && (siteTextSelection.section.startsWith("site-") || siteTextSelection.section === "brand" || siteTextSelection.section === "navigation")) {
      beginSiteTextGesture(event, siteText, siteTextSelection);
      return;
    }
    const button = event.target.closest<HTMLElement>(".store-animation-cta[data-animation-button-layout-target]");
    if (button) {
      event.stopPropagation();
      const handle = event.target.closest<HTMLElement>(".store-animation-button-handle");
      if (event.pointerType === "touch" && !handle) return;
      if (event.detail <= 1) beginAnimationButtonGesture(event, button);
      return;
    }
    const copy = event.target.closest<HTMLElement>("[data-animation-copy][data-animation-layout-target]");
    if (!copy) return;
    // Editor gestures own this pointer. Do not let an underlying carousel or
    // swipe controller interpret the same press as scene navigation.
    event.stopPropagation();
    const handle = event.target.closest<HTMLElement>("[data-animation-layout-handle]");
    if (event.pointerType === "touch" && !handle) return;
    // The first press remains available for dragging. The second press of a
    // double-click must remain untouched so the inline text editor can open.
    if (!handle && event.detail > 1) return;
    const action = handle?.dataset.animationLayoutHandle;
    beginAnimationTextGesture(event, copy, action === "width" || action === "scale" ? action : "move");
  }, true);
  app.addEventListener("click", (event) => {
    if (!state.storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    if (state.storePreviewEditorSuppressNextClick) {
      state.storePreviewEditorSuppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }
    if (state.storePreviewInlineEditorTarget && event.target.closest("[contenteditable]")) return;
    // Category cards are storefront navigation first. Their dedicated
    // "Cambiar portada" canvas control still edits the image, while touching
    // anywhere on the card opens that category even inside the live preview.
    if (event.target.closest("[data-catalog-section]")) {
      clearStorePreviewEditorSelection();
      return;
    }
    const target = event.target.closest<HTMLElement>("[data-store-editor-target]");
    const interactive = event.target.closest("button, a, input, select, textarea, [role='button']");
    // Controls inside a large editable section still own their click. The one
    // exception is editor text nested by a link (the store name), where the
    // interactive wrapper contains the actual direct-edit target.
    if (interactive && (!target || !interactive.contains(target))) {
      clearStorePreviewEditorSelection();
      return;
    }
    const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
    if (!target || !selection) {
      clearStorePreviewEditorSelection();
      return;
    }
    // Section wrappers are intentionally large so their background can be
    // edited. When another element is already selected, however, a tap on that
    // visually empty canvas should dismiss the editor first instead of merely
    // replacing it with the section-level toolbar.
    if (selection.field === "section" && state.storePreviewEditorSelection) {
      clearStorePreviewEditorSelection();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    state.storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    if (state.storePreviewEditorClickTimer !== null) window.clearTimeout(state.storePreviewEditorClickTimer);
    if (target.dataset.storeEditorInline === "text" && !selection.animationId) {
      state.storePreviewEditorClickTimer = null;
      if (target.dataset.storeEditorDraggableText === "true") {
        showStorePreviewEditorHover(target);
        postToParent("STORE_EDITOR_SELECT", { selection });
        const destination = target.closest<HTMLAnchorElement>("a[href]");
        if (destination && (selection.section === "brand" || selection.section === "navigation")) {
          state.storePreviewEditorClickTimer = window.setTimeout(() => {
            state.storePreviewEditorClickTimer = null;
            const selector = destination.dataset.storeScrollTarget || "";
            let scrollDestination: HTMLElement | null = null;
            try {
              scrollDestination = selector ? app.querySelector<HTMLElement>(selector) : null;
            } catch {
              scrollDestination = null;
            }
            if (scrollDestination) {
              scrollDestination.scrollIntoView({
                behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                block: "start",
              });
            } else {
              window.location.assign(destination.href);
            }
          }, 320);
        }
        return;
      }
      showStorePreviewEditorHover(null);
      beginStorePreviewInlineTextEdit(target, selection);
      return;
    }
    if (selection.animationId && Number.isInteger(selection.itemIndex)) {
      const section = target.closest<HTMLElement>(".store-motion-section[data-animation-id]");
      section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: selection.itemIndex } }));
      // Scene-driven carousels reuse one copy node and update its media index
      // while showing the scene, so apply the selection after that update.
      syncStorePreviewEditorSelection();
      showStorePreviewEditorHover(target);
      state.storePreviewEditorClickTimer = null;
      postToParent("STORE_EDITOR_SELECT", { selection });
      return;
    }
    showStorePreviewEditorHover(target);
    state.storePreviewEditorClickTimer = window.setTimeout(() => {
      state.storePreviewEditorClickTimer = null;
      postToParent("STORE_EDITOR_SELECT", { selection });
    }, 320);
  }, true);
  app.addEventListener("dblclick", (event) => {
    if (!state.storePreviewEditorEnabled || !(event.target instanceof Element)) return;
    state.storePreviewEditorSuppressNextClick = false;
    const target = event.target.closest<HTMLElement>("[data-store-editor-target]");
    const selection = target ? selectionFromStorePreviewEditorTarget(target) : null;
    if (!target || !selection || !target.dataset.storeEditorInline) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (state.storePreviewEditorClickTimer !== null) window.clearTimeout(state.storePreviewEditorClickTimer);
    state.storePreviewEditorClickTimer = null;
    state.storePreviewEditorSelection = selection;
    syncStorePreviewEditorSelection();
    showStorePreviewEditorHover(null);
    if (target.dataset.storeEditorInline === "text") beginStorePreviewInlineTextEdit(target, selection);
    else beginStorePreviewInlineImageEdit(selection);
  }, true);

  let toolbarPositionFrame = 0;
  const refreshCanvasToolbarPosition = () => {
    if (toolbarPositionFrame) return;
    toolbarPositionFrame = window.requestAnimationFrame(() => {
      toolbarPositionFrame = 0;
      const toolbar = document.querySelector<HTMLElement>(".store-preview-canvas-toolbar:not([hidden])");
      const target = app.querySelector<HTMLElement>(".store-preview-editor-selected");
      if (toolbar && target) positionStorePreviewCanvasToolbar(toolbar, target);
    });
  };
  window.addEventListener("scroll", refreshCanvasToolbarPosition, { passive: true });
  window.addEventListener("resize", refreshCanvasToolbarPosition, { passive: true });
}

/**
 * Applies store patches and commands the Studio editor posts into the preview iframe.
 * The editor iframe is opt-in and visual-only: a normal customer storefront
 * never listens for parent-window customization. Checking event.source keeps
 * unrelated tabs/windows from driving the preview even when they know its URL.
 */
export function listenForStoreEditorMessages() {
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !state.activePreviewStore) return;
    if (!event.data || typeof event.data !== "object") return;
    try {
    if (event.data.type === "PAGOSYA_PREVIEW_BUILDER_RESULT") {
      const dialog = document.querySelector<HTMLDialogElement>(`.preview-builder-dialog[data-request-id="${CSS.escape(String(event.data.requestId || ""))}"]`);
      if (!dialog) return;
      const saveTimeout = Number(dialog.dataset.saveTimeout);
      if (Number.isFinite(saveTimeout)) window.clearTimeout(saveTimeout);
      delete dialog.dataset.saveTimeout;
      if (event.data.ok === true) {
        dialog.querySelector<HTMLElement>(".preview-builder-status")?.replaceChildren("Listo. Actualizando la tienda…");
        window.setTimeout(() => {
          if (dialog.isConnected && dialog.open) dialog.close();
        }, 900);
        return;
      }
      dialog.removeAttribute("aria-busy");
      const submit = dialog.querySelector<HTMLButtonElement>(".preview-builder-submit");
      if (submit) {
        submit.disabled = false;
        submit.textContent = String(event.data.submitLabel || "Intentar de nuevo");
      }
      dialog.querySelector<HTMLElement>(".preview-builder-status")?.replaceChildren(String(event.data.error || "No pudimos guardar el cambio. Intenta nuevamente."));
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_TEXT_UPDATE") {
      state.storePreviewEditorEnabled = event.data.editorMode !== false;
      const selection = sanitizeStorePreviewEditorSelection(event.data.selection);
      if (!selection || typeof event.data.value !== "string") return;
      const sceneChanged = selection.animationId
        && Number.isInteger(selection.itemIndex)
        && (state.storePreviewEditorSelection?.animationId !== selection.animationId || state.storePreviewEditorSelection.itemIndex !== selection.itemIndex);
      state.storePreviewEditorSelection = selection;
      syncStorePreviewEditorMode();
      if (sceneChanged) {
        const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
          .find((candidate) => candidate.dataset.animationId === selection.animationId);
        section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: selection.itemIndex } }));
      }
      updateStorePreviewEditorText(selection, event.data.value);
      if (state.storePreviewPendingInlineTextCommit
        && sameStorePreviewEditorSelection(state.storePreviewPendingInlineTextCommit.selection, selection)
        && state.storePreviewPendingInlineTextCommit.value === event.data.value.replace(/\u00a0/g, " ")) {
        state.storePreviewPendingInlineTextCommit = null;
      }
      syncStorePreviewEditorSelection();
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_STYLE_UPDATE") {
      state.storePreviewEditorEnabled = event.data.editorMode !== false;
      if (typeof event.data.animationId !== "string" || typeof event.data.key !== "string") return;
      syncStorePreviewEditorMode();
      const selection = sanitizeStorePreviewEditorSelection(event.data.selection);
      updateStorePreviewAnimationStyle(event.data.animationId.slice(0, 64), event.data.key.slice(0, 64), event.data.value, selection);
      syncStorePreviewEditorSelection();
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_EDITOR_SELECTION") {
      state.storePreviewEditorEnabled = event.data.editorMode !== false;
      state.storePreviewEditorSelection = sanitizeStorePreviewEditorSelection(event.data.editorSelection);
      syncStorePreviewEditorMode();
      if (state.storePreviewEditorSelection?.animationId && Number.isInteger(state.storePreviewEditorSelection.itemIndex)) {
        const section = Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
          .find((candidate) => candidate.dataset.animationId === state.storePreviewEditorSelection?.animationId);
        section?.dispatchEvent(new CustomEvent("pagosya:editor-scene", { detail: { index: state.storePreviewEditorSelection.itemIndex } }));
      }
      syncStorePreviewEditorSelection();
      if (event.data.reveal === true && state.storePreviewEditorSelection) {
        const selection = state.storePreviewEditorSelection;
        const animationSection = selection.animationId
          ? Array.from(app.querySelectorAll<HTMLElement>(".store-motion-section[data-animation-id]"))
              .find((candidate) => candidate.dataset.animationId === selection.animationId)
          : null;
        const storyScene = animationSection?.querySelector<HTMLElement>(`[data-motion-flow] [data-animation-media-index="${selection.itemIndex}"]`)?.closest<HTMLElement>(".store-flow-section");
        if (storyScene && Number.isInteger(selection.itemIndex)) scrollStorePreviewToElement(storyScene);
        else scrollStorePreviewToSection(selection.section);
      }
      return;
    }
    if (event.data.type === "PAGOSYA_STORE_PREVIEW_NAVIGATION") {
      const requestedAction = String(event.data.previewAction || "scroll");
      const previewAction = ["cart", "motion", "hero-item", "editorial-item"].includes(requestedAction) ? requestedAction : "scroll";
      const previewSection = STORE_PREVIEW_SECTIONS.includes(event.data.previewSection)
        ? event.data.previewSection as StorePreviewSection
        : typeof event.data.previewSection === "string" && /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(event.data.previewSection)
          ? event.data.previewSection as `animation-${string}`
          : typeof event.data.previewSection === "string" && /^site-[a-z][a-z0-9-]{1,47}$/.test(event.data.previewSection)
            ? event.data.previewSection as `site-${string}`
            : null;
      if (previewAction !== "cart") document.querySelector(".cart-review-dialog")?.remove();
      if (previewAction === "cart") {
        const renderedStore = state.activePreviewRenderedStore ?? state.activePreviewStore.store;
        const existingCart = document.querySelector<HTMLDialogElement>(".cart-review-dialog.is-preview-open");
        if (existingCart?.isConnected) renderCartReviewDialog(existingCart, state.activePreviewStore.slug, renderedStore);
        else openCartReview(state.activePreviewStore.slug, renderedStore, { preview: true, allowEmpty: true });
      } else if (previewAction === "motion") {
        if (previewSection?.startsWith("animation-")) scrollStorePreviewToSection(previewSection);
        else scrollStorePreviewToMotion();
      } else if (previewAction === "hero-item" && Number.isInteger(event.data.previewTargetIndex)) {
        scrollStorePreviewToHeroItem(Math.max(0, event.data.previewTargetIndex));
      } else if (previewAction === "editorial-item" && Number.isInteger(event.data.previewTargetIndex)) {
        scrollStorePreviewToEditorialItem(Math.max(0, event.data.previewTargetIndex), event.data.previewTargetKind === "media" ? "media" : "text");
      } else if (previewSection) scrollStorePreviewToSection(previewSection);
      return;
    }
    if (event.data.type !== "PAGOSYA_STORE_PREVIEW") return;
    // A delayed preview patch must never replace the contenteditable node
    // while the merchant is typing. Commit the live text first and let the
    // parent send the next authoritative patch after it records that value.
    if (state.storePreviewInlineEditorTarget) {
      state.storePreviewInlineEditorFinish?.(true);
      return;
    }
    const patch = sanitizeStorePreviewPatch(event.data.patch);
    if (!patch) return;
    state.storePreviewLockedSectionIds = new Set(Array.isArray(event.data.lockedSectionIds)
      ? event.data.lockedSectionIds.filter((id: unknown): id is string => typeof id === "string" && /^[a-z][a-z0-9-]{1,47}$/.test(id)).slice(0, 64)
      : []);
    state.storePreviewEditorEnabled = event.data.editorMode !== false;
    state.storePreviewEditorSelection = sanitizeStorePreviewEditorSelection(event.data.editorSelection);
    const previousPreviewStore = state.activePreviewRenderedStore ?? state.activePreviewStore.store;
    let previewStore = { ...state.activePreviewStore.store, ...patch };
    // A generated section can now be edited as its own structured document in
    // the dashboard. Prefer that safe draft over the last persisted document;
    // legacy controls are projected onto the draft below so both editor paths
    // stay compatible without flattening scene copy, layout, or motion.
    const currentDocument = sanitizeSiteDocument(patch.siteDocument) ?? sanitizeSiteDocument(state.activePreviewStore.store.siteDocument);
    if (currentDocument) {
      previewStore.siteDocument = synchronizeSiteDocument(currentDocument, changedLegacySiteTextPatch(patch, previousPreviewStore), {
        banner: patch.bannerUrl !== undefined && patch.bannerUrl !== state.activePreviewStore.store.bannerUrl,
        about: patch.aboutImageUrl !== undefined && patch.aboutImageUrl !== state.activePreviewStore.store.aboutImageUrl,
        gallery: patch.editorialGallery !== undefined && JSON.stringify(patch.editorialGallery) !== JSON.stringify(state.activePreviewStore.store.editorialGallery),
      });
    }
    const previewProduct = sanitizeStorePreviewProduct(event.data.previewProduct, previewStore);
    if (previewProduct) {
      previewStore = {
        ...previewStore,
        items: previewStore.items.map((item) => item.id === previewProduct.id ? previewProduct : item),
      };
    }
    const existingCart = document.querySelector<HTMLDialogElement>(".cart-review-dialog.is-preview-open");
    const requestedAction = String(event.data.previewAction || "scroll");
    const previewAction = ["cart", "product", "motion", "hero-item", "editorial-item"].includes(requestedAction) ? requestedAction : "scroll";
    const previewSection = STORE_PREVIEW_SECTIONS.includes(event.data.previewSection)
      ? event.data.previewSection as StorePreviewSection
      : typeof event.data.previewSection === "string" && /^animation-[a-z0-9][a-z0-9_-]{0,47}$/.test(event.data.previewSection)
        ? event.data.previewSection as `animation-${string}`
        : typeof event.data.previewSection === "string" && /^site-[a-z][a-z0-9-]{1,47}$/.test(event.data.previewSection)
          ? event.data.previewSection as `site-${string}`
          : null;
    const renderSignature = JSON.stringify(previewStore);
    const previewViewport = { top: Math.max(0, window.scrollY), left: Math.max(0, window.scrollX) };
    if (previewAction !== "cart") document.querySelector(".cart-review-dialog")?.remove();
    if (previewAction === "product" && previewProduct) {
      const productView = `product:${previewProduct.id}`;
      if (renderSignature !== state.activePreviewRenderSignature || state.activePreviewRenderedView !== productView) {
        renderProductPage(state.activePreviewStore.slug, previewStore, previewProduct.id);
        state.activePreviewRenderedStore = previewStore;
        state.activePreviewRenderSignature = renderSignature;
        state.activePreviewRenderedView = productView;
      }
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      return;
    }
    // A preview message can be emitted more than once for the same editor
    // state (for example, a click followed by focus). Replacing #app for an
    // identical store makes every section and image disappear and mount again,
    // producing the brief blank frame seen by merchants. Navigation and
    // selection still run below, but unchanged data keeps the existing DOM.
    if (renderSignature !== state.activePreviewRenderSignature || state.activePreviewRenderedView !== "store") {
      renderStoreRoute(state.activePreviewStore.slug, previewStore, { focusPromotion: false });
      state.activePreviewRenderedStore = previewStore;
      state.activePreviewRenderSignature = renderSignature;
      state.activePreviewRenderedView = "store";
      // Replacing #app can briefly collapse the document and clamp an embedded
      // preview back to its beginning. Keep the merchant at the same place for
      // ordinary edits; explicit editor navigation below remains authoritative.
      if (previewAction === "scroll" && !previewSection) window.scrollTo({ ...previewViewport, behavior: "auto" });
    } else {
      syncStorePreviewEditorMode();
      syncStorePreviewEditorSelection();
    }
    // A stale generated snapshot may repaint immediately after contenteditable
    // blurs. Reapply the optimistic commit synchronously so the merchant never
    // sees their copy snap back while the dashboard processes the message.
    if (state.storePreviewPendingInlineTextCommit) {
      updateStorePreviewEditorText(state.storePreviewPendingInlineTextCommit.selection, state.storePreviewPendingInlineTextCommit.value);
    }
    if (previewAction === "cart") {
      if (existingCart?.isConnected) renderCartReviewDialog(existingCart, state.activePreviewStore.slug, previewStore);
      else openCartReview(state.activePreviewStore.slug, previewStore, { preview: true, allowEmpty: true });
    } else if (previewAction === "motion") {
      if (previewSection?.startsWith("animation-")) scrollStorePreviewToSection(previewSection);
      else scrollStorePreviewToMotion();
    } else if (previewAction === "hero-item" && Number.isInteger(event.data.previewTargetIndex)) {
      scrollStorePreviewToHeroItem(Math.max(0, event.data.previewTargetIndex));
    } else if (previewAction === "editorial-item" && Number.isInteger(event.data.previewTargetIndex)) {
      scrollStorePreviewToEditorialItem(Math.max(0, event.data.previewTargetIndex), event.data.previewTargetKind === "media" ? "media" : "text");
    } else if (previewSection) scrollStorePreviewToSection(previewSection);
    } catch (error) {
      // Invalid or stale editor messages should leave the last good preview
      // running instead of breaking every later edit in the iframe.
      console.error("Ignored invalid store editor update", error);
    }
  });
}
