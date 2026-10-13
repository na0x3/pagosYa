import { Store, type StoreHeroSlide } from "../api";
import { state } from "../state";
import { app } from "../ui/app";
import { escapeHtml } from "../ui/html";
import { ICON_ARROW_LEFT, ICON_ARROW_RIGHT } from "../ui/icons";
import { isVideoMediaUrl } from "../ui/media";
import { storeImagePosition } from "./catalog";
import { canvasTextStyleAttributes } from "./motion";
import type { FidelityImageHtml } from "./store-fidelity-media";

export function storeHeroHtml(
  store: Store,
  heroSlides: Array<StoreHeroSlide & { resolvedMediaUrl: string }>,
  visibleStoreName: string,
  bannerUrl: string | null,
  fidelityImageHtml: FidelityImageHtml,
): string {
  return heroSlides.length
    ? `<section class="store-carousel" aria-label="${escapeHtml(visibleStoreName ? `Destacados de ${visibleStoreName}` : "Destacados de la tienda")}" aria-roledescription="carrusel">
        <div class="store-carousel-viewport">
          ${heroSlides
            .map((slide, index) => {
              const safeCtaUrl = slide.ctaUrl && /^https?:\/\//i.test(slide.ctaUrl) ? slide.ctaUrl : null;
              const hasCopy = !!(slide.title || slide.body || slide.ctaLabel);
              const titleLength = Array.from(slide.title || "").length;
              const titleClass = titleLength > 88 ? " is-very-long" : titleLength > 56 ? " is-long" : "";
              return `<article class="store-slide ${index === 0 ? "active" : ""}" data-slide-index="${index}" aria-hidden="${index === 0 ? "false" : "true"}">
                ${
                  isVideoMediaUrl(slide.resolvedMediaUrl)
                    ? `<video src="${escapeHtml(slide.resolvedMediaUrl)}" aria-label="${escapeHtml(slide.title || `Destacado ${index + 1}`)}" muted loop playsinline preload="metadata"></video>`
                    : fidelityImageHtml(slide.resolvedMediaUrl, slide.imageUrl, slide.title || `Destacado ${index + 1}`, { eager: index === 0 })
                }
                ${
                  hasCopy
                    ? `<div class="store-slide-overlay">
                        ${slide.title ? `<h2 class="store-slide-title${titleClass}"${canvasTextStyleAttributes(slide.titleStyle)}>${escapeHtml(slide.title)}</h2>` : ""}
                        ${slide.body ? `<p${canvasTextStyleAttributes(slide.bodyStyle)}>${escapeHtml(slide.body)}</p>` : ""}
                        ${
                          slide.ctaLabel
                            ? safeCtaUrl
                              ? `<a class="store-slide-cta" href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(slide.ctaLabel)}</a>`
                              : `<button type="button" class="store-slide-cta hero-catalog-cta">${escapeHtml(slide.ctaLabel)}</button>`
                            : ""
                        }
                      </div>`
                    : ""
                }
              </article>`;
            })
            .join("")}
        </div>
        ${
          heroSlides.length > 1
            ? `<button type="button" class="store-carousel-arrow previous" aria-label="Ver destacado anterior">${ICON_ARROW_LEFT}</button>
               <button type="button" class="store-carousel-arrow next" aria-label="Ver siguiente destacado">${ICON_ARROW_RIGHT}</button>
               <button type="button" class="store-carousel-toggle" aria-pressed="false">Pausar</button>
               <div class="store-carousel-dots" aria-label="Elegir destacado">
                 ${heroSlides.map((_, index) => `<button type="button" data-slide-to="${index}" aria-label="Ver destacado ${index + 1}" aria-current="${index === 0 ? "true" : "false"}"></button>`).join("")}
               </div>`
            : ""
        }
      </section>`
      : bannerUrl
      ? `<div class="store-hero has-banner"><img class="store-banner" src="${escapeHtml(bannerUrl)}" alt="" style="object-position:${storeImagePosition(store, store.bannerUrl)}" /></div>`
      : "";
}

export function bindStoreHeroCarousel(): void {
  const carousel = app.querySelector<HTMLElement>(".store-carousel");
  if (carousel) {
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>(".store-slide"));
    const dots = Array.from(carousel.querySelectorAll<HTMLButtonElement>("[data-slide-to]"));
    const autoplayToggle = carousel.querySelector<HTMLButtonElement>(".store-carousel-toggle");
    let activeIndex = 0;
    let autoplayTimer: number | undefined;
    let autoplayPausedByUser = false;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const syncVideoPlayback = () => {
      slides.forEach((slide, index) => {
        const video = slide.querySelector<HTMLVideoElement>("video");
        if (!video) return;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        if (index !== activeIndex || autoplayPausedByUser || prefersReducedMotion) {
          video.pause();
          return;
        }
        try {
          const playAttempt = video.play();
          void playAttempt?.catch(() => undefined);
        } catch {
          // Browser autoplay policy may block playback; the first frame remains useful.
        }
      });
    };
    const showSlide = (nextIndex: number) => {
      activeIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === activeIndex;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
        slide.querySelectorAll<HTMLElement>("a, button, input, select, textarea, [tabindex]").forEach((control) => {
          control.tabIndex = active ? 0 : -1;
        });
      });
      dots.forEach((dot, index) => dot.setAttribute("aria-current", String(index === activeIndex)));
      syncVideoPlayback();
    };
    const stopAutoplay = () => {
      if (autoplayTimer !== undefined) window.clearInterval(autoplayTimer);
      autoplayTimer = undefined;
    };
    const startAutoplay = () => {
      stopAutoplay();
      if (slides.length > 1 && !prefersReducedMotion && !autoplayPausedByUser && !state.storePreviewEditorEnabled) {
        autoplayTimer = window.setInterval(() => showSlide(activeIndex + 1), 6000);
      }
    };
    autoplayToggle?.addEventListener("click", () => {
      autoplayPausedByUser = !autoplayPausedByUser;
      autoplayToggle.setAttribute("aria-pressed", String(autoplayPausedByUser));
      autoplayToggle.textContent = autoplayPausedByUser ? "Reanudar" : "Pausar";
      if (autoplayPausedByUser) stopAutoplay();
      else startAutoplay();
      syncVideoPlayback();
    });
    carousel.querySelector<HTMLButtonElement>(".previous")?.addEventListener("click", () => {
      showSlide(activeIndex - 1);
      startAutoplay();
    });
    carousel.querySelector<HTMLButtonElement>(".next")?.addEventListener("click", () => {
      showSlide(activeIndex + 1);
      startAutoplay();
    });
    dots.forEach((dot) =>
      dot.addEventListener("click", () => {
        showSlide(Number(dot.dataset.slideTo));
        startAutoplay();
      }),
    );
    carousel.addEventListener("pointerenter", stopAutoplay);
    carousel.addEventListener("pointerleave", startAutoplay);
    carousel.addEventListener("focusin", stopAutoplay);
    carousel.addEventListener("focusout", startAutoplay);
    const syncCarouselVisibility = () => document.hidden ? stopAutoplay() : startAutoplay();
    document.addEventListener("visibilitychange", syncCarouselVisibility);
    showSlide(0);
    startAutoplay();
    state.activeHeroCleanup = () => {
      stopAutoplay();
      document.removeEventListener("visibilitychange", syncCarouselVisibility);
      slides.forEach((slide) => slide.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }
}
