import { Store } from "../api";
import { state } from "../state";
import { app } from "../ui/app";
import { escapeHtml } from "../ui/html";
import { storeImagePosition } from "./catalog";

export function storePromotionHtml(store: Store, showPromotion: boolean, promotionImageUrl: string | null): string {
  const safePromotionUrl = store.promotionCtaUrl && /^https?:\/\//i.test(store.promotionCtaUrl) ? store.promotionCtaUrl : null;
  return showPromotion
    ? `<div class="promotion-backdrop" data-promotion-backdrop>
        <section class="promotion-dialog" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
          <button type="button" class="promotion-close" aria-label="Cerrar promoción">×</button>
          ${promotionImageUrl ? `<img class="promotion-image" src="${escapeHtml(promotionImageUrl)}" alt="" style="object-position:${storeImagePosition(store, store.promotionImageUrl)}">` : ""}
          ${store.promotionTitle ? `<h2 id="promotion-title">${escapeHtml(store.promotionTitle)}</h2>` : `<h2 id="promotion-title">Promoción</h2>`}
          ${store.promotionBody ? `<p>${escapeHtml(store.promotionBody)}</p>` : ""}
          ${
            store.promotionCtaLabel
              ? safePromotionUrl
                ? `<a class="primary promotion-action" href="${escapeHtml(safePromotionUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(store.promotionCtaLabel)}</a>`
                : `<button type="button" class="primary promotion-action promotion-dismiss">${escapeHtml(store.promotionCtaLabel)}</button>`
              : ""
          }
        </section>
      </div>`
    : "";
}

export function bindStorePromotion(showPromotion: boolean, options: { focusPromotion?: boolean }): void {
  state.activePromotionCleanup?.();
  state.activePromotionCleanup = null;
  document.body.classList.toggle("promotion-open", showPromotion);
  if (showPromotion) {
    const backdrop = app.querySelector<HTMLElement>("[data-promotion-backdrop]")!;
    const closeButton = backdrop.querySelector<HTMLButtonElement>(".promotion-close")!;
    let dismissalTimer: number | undefined;
    let isDismissing = false;
    const finishPromotionDismissal = () => {
      window.clearTimeout(dismissalTimer);
      backdrop.removeEventListener("animationend", onPromotionAnimationEnd);
      document.removeEventListener("keydown", onPromotionKeydown);
      backdrop.remove();
      document.body.classList.remove("promotion-open");
      state.activePromotionCleanup = null;
    };
    const onPromotionAnimationEnd = (event: AnimationEvent) => {
      if (event.target === backdrop && isDismissing) finishPromotionDismissal();
    };
    const dismissPromotion = () => {
      if (isDismissing) return;
      isDismissing = true;
      backdrop.classList.add("is-closing");
      backdrop.setAttribute("aria-hidden", "true");
      document.removeEventListener("keydown", onPromotionKeydown);
      backdrop.addEventListener("animationend", onPromotionAnimationEnd);
      dismissalTimer = window.setTimeout(finishPromotionDismissal, 240);
    };
    const onPromotionKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissPromotion();
      if (event.key === "Tab") {
        const focusable = Array.from(backdrop.querySelectorAll<HTMLElement>("button, a[href]")).filter(
          (element) => !element.hasAttribute("disabled"),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    closeButton.addEventListener("click", dismissPromotion);
    backdrop.querySelector(".promotion-action")?.addEventListener("click", dismissPromotion);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) dismissPromotion();
    });
    document.addEventListener("keydown", onPromotionKeydown);
    state.activePromotionCleanup = () => {
      window.clearTimeout(dismissalTimer);
      backdrop.removeEventListener("animationend", onPromotionAnimationEnd);
      document.removeEventListener("keydown", onPromotionKeydown);
    };
    if (options.focusPromotion !== false) closeButton.focus();
  }
}
