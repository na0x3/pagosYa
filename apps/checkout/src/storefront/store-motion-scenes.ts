import { postToParent } from "../postmessage";
import { state } from "../state";
import { type StorePreviewEditorSelection } from "../preview-mode";
import { app } from "../ui/app";
import { playStoreVideo } from "../ui/media";
import { syncStorePreviewEditorSelection } from "../preview-editor/selection";
import { applyAnimationCopySceneLayout } from "../preview-editor/editor-base";

export const editorSceneIndexFor = (container: HTMLElement, count: number) => {
  if (!state.storePreviewEditorEnabled || !state.storePreviewEditorSelection?.animationId || !Number.isInteger(state.storePreviewEditorSelection.itemIndex)) return 0;
  const section = container.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  if (section?.dataset.animationId !== state.storePreviewEditorSelection.animationId) return 0;
  return Math.min(Math.max(state.storePreviewEditorSelection.itemIndex!, 0), Math.max(count - 1, 0));
};

export const selectEditorAnimationScene = (container: HTMLElement, itemIndex: number) => {
  if (!state.storePreviewEditorEnabled || !Number.isInteger(itemIndex)) return;
  const section = container.closest<HTMLElement>(".store-motion-section[data-animation-id]");
  const animationId = section?.dataset.animationId;
  if (!animationId) return;
  const selection: StorePreviewEditorSelection = {
    section: `animation-${animationId}`,
    field: "media",
    label: `imagen ${itemIndex + 1} de la animación`,
    animationId,
    itemIndex,
  };
  state.storePreviewEditorSelection = selection;
  syncStorePreviewEditorSelection();
  postToParent("STORE_EDITOR_SELECT", { selection });
};

/** Scene controls for the animation sections: hero filmstrip, testimonials, portfolio, magnetic link, cards, carousels, accordion, sticky story. */
export function bindStoreMotionScenes(): void {
  app.querySelectorAll<HTMLElement>("[data-motion-hero]").forEach((motionHero) => {
    const backgrounds = Array.from(motionHero.querySelectorAll<HTMLElement>("[data-motion-hero-background]"));
    const buttons = Array.from(motionHero.querySelectorAll<HTMLElement>("[data-motion-hero-to]"));
    const title = motionHero.querySelector<HTMLElement>("[data-motion-hero-title]");
    const caption = motionHero.querySelector<HTMLElement>("[data-motion-hero-caption]");
    const status = motionHero.querySelector<HTMLElement>("[data-motion-hero-status]");
    const animationCopy = motionHero.querySelector<HTMLElement>("[data-animation-copy]");
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(motionHero, buttons.length);
    const show = (next: number, focus = false) => {
      if (!buttons.length) return;
      selected = (next + buttons.length) % buttons.length;
      backgrounds.forEach((background, index) => {
        const active = index === selected;
        background.classList.toggle("active", active);
        if (background instanceof HTMLVideoElement) {
          if (active && !reduceMotion) playStoreVideo(background);
          else background.pause();
        }
      });
      buttons.forEach((button, index) => button.setAttribute("aria-current", String(index === selected)));
      if (title) {
        title.textContent = buttons[selected]?.dataset.motionTitle ?? "";
        title.hidden = !title.textContent;
      }
      if (caption) {
        caption.textContent = buttons[selected]?.dataset.motionCaption ?? "";
        caption.hidden = !caption.textContent;
      }
      if (animationCopy && buttons[selected]) applyAnimationCopySceneLayout(animationCopy, buttons[selected]);
      if (status) status.textContent = String(selected + 1).padStart(2, "0");
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => {
      show(index);
      selectEditorAnimationScene(motionHero, selected);
    }));
    motionHero.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1), true);
      selectEditorAnimationScene(motionHero, selected);
    });
    motionHero.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
  });

  app.querySelectorAll<HTMLElement>("[data-testimonials]").forEach((testimonials) => {
    const cards = Array.from(testimonials.querySelectorAll<HTMLElement>("[data-testimonial-index]"));
    const status = testimonials.querySelector<HTMLElement>(".store-testimonial-status");
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(testimonials, cards.length);
    const show = (next: number) => {
      if (!cards.length) return;
      selected = (next + cards.length) % cards.length;
      cards.forEach((card, index) => {
        let offset = index - selected;
        if (offset > cards.length / 2) offset -= cards.length;
        if (offset < -cards.length / 2) offset += cards.length;
        card.style.setProperty("--testimonial-offset", String(offset));
        card.style.zIndex = String(30 - Math.abs(offset));
        card.style.opacity = String(Math.max(.2, 1 - Math.abs(offset) * .16));
        card.setAttribute("aria-hidden", String(index !== selected));
        const video = card.querySelector<HTMLVideoElement>("video");
        if (video) {
          if (index === selected && !reduceMotion) playStoreVideo(video);
          else video.pause();
        }
      });
      if (status) status.textContent = `${selected + 1} / ${cards.length}`;
    };
    testimonials.querySelectorAll<HTMLButtonElement>("[data-testimonial-step]").forEach((button) =>
      button.addEventListener("click", () => {
        show(selected + Number(button.dataset.testimonialStep));
        selectEditorAnimationScene(testimonials, selected);
      }),
    );
    testimonials.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1));
      selectEditorAnimationScene(testimonials, selected);
    });
    testimonials.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
  });

  app.querySelectorAll<HTMLElement>("[data-portfolio-scroller]").forEach((portfolio) => {
    const buttons = Array.from(portfolio.querySelectorAll<HTMLButtonElement>("[data-portfolio-to]"));
    const panels = Array.from(portfolio.querySelectorAll<HTMLElement>("[data-portfolio-panel]"));
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let selected = editorSceneIndexFor(portfolio, panels.length);
    let visible = true;
    const syncVideos = () => panels.forEach((panel, index) => {
      const video = panel.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      if (index === selected && visible && !reduceMotion) playStoreVideo(video);
      else video.pause();
    });
    const show = (next: number, focus = false) => {
      if (!panels.length) return;
      selected = (next + panels.length) % panels.length;
      buttons.forEach((button, index) => {
        button.setAttribute("aria-current", String(index === selected));
        button.tabIndex = index === selected ? 0 : -1;
      });
      panels.forEach((panel, index) => {
        const active = index === selected;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
        panel.inert = !active;
      });
      syncVideos();
      if (focus) buttons[selected]?.focus({ preventScroll: true });
    };
    buttons.forEach((button, index) => button.addEventListener("click", () => {
      show(index);
      selectEditorAnimationScene(portfolio, selected);
    }));
    portfolio.addEventListener("keydown", (event) => {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      show(selected + (["ArrowUp", "ArrowLeft"].includes(event.key) ? -1 : 1), true);
      selectEditorAnimationScene(portfolio, selected);
    });
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncVideos(); }, { threshold: .2 })
      : null;
    observer?.observe(portfolio);
    portfolio.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", (event) => {
      show(Number((event as CustomEvent<{ index?: number }>).detail?.index) || 0);
    });
    show(selected);
    const priorCleanup = state.activeStoreExperienceCleanup as (() => void) | null;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      observer?.disconnect();
      panels.forEach((panel) => panel.querySelector<HTMLVideoElement>("video")?.pause());
    };
  });

  app.querySelectorAll<HTMLElement>("[data-magnetic-target]").forEach((magnetic) => {
    const link = magnetic.querySelector<HTMLElement>("[data-magnetic-link]");
    if (!link) return;
    const interactivePointer = typeof window.matchMedia === "function"
      && window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
    const reset = () => { link.style.transform = "translate3d(0,0,0)"; };
    const move = (event: PointerEvent) => {
      if (!interactivePointer) return;
      const rect = magnetic.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / Math.max(rect.width, 1) - .5) * 24;
      const y = ((event.clientY - rect.top) / Math.max(rect.height, 1) - .5) * 24;
      link.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    magnetic.addEventListener("pointermove", move);
    magnetic.addEventListener("pointerleave", reset);
    link.addEventListener("click", (event) => {
      if (link.getAttribute("href") !== "#store-grid") return;
      const target = app.querySelector<HTMLElement>("#store-grid, .store-products");
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: interactivePointer ? "smooth" : "auto", block: "start" });
    });
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      magnetic.removeEventListener("pointermove", move);
      magnetic.removeEventListener("pointerleave", reset);
    };
  });

  const libraryMotionCleanups: Array<() => void> = [];
  const reduceLibraryMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  app.querySelectorAll<HTMLElement>("[data-draggable-cards]").forEach((container) => {
    if (state.storePreviewEditorEnabled) return;
    container.querySelectorAll<HTMLElement>("[data-draggable-card]").forEach((card) => {
      let pointerId: number | null = null;
      let originX = 0;
      let originY = 0;
      let offsetX = 0;
      let offsetY = 0;
      const render = () => {
        card.style.setProperty("--card-x", `${offsetX}px`);
        card.style.setProperty("--card-y", `${offsetY}px`);
      };
      const down = (event: PointerEvent) => {
        if (event.button !== 0) return;
        pointerId = event.pointerId;
        originX = event.clientX - offsetX;
        originY = event.clientY - offsetY;
        card.setPointerCapture(pointerId);
        card.classList.add("dragging");
      };
      const move = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        offsetX = Math.max(-container.clientWidth * .38, Math.min(container.clientWidth * .38, event.clientX - originX));
        offsetY = Math.max(-container.clientHeight * .38, Math.min(container.clientHeight * .38, event.clientY - originY));
        render();
      };
      const up = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        card.releasePointerCapture(pointerId);
        pointerId = null;
        card.classList.remove("dragging");
      };
      card.addEventListener("pointerdown", down);
      card.addEventListener("pointermove", move);
      card.addEventListener("pointerup", up);
      card.addEventListener("pointercancel", up);
      libraryMotionCleanups.push(() => {
        card.removeEventListener("pointerdown", down);
        card.removeEventListener("pointermove", move);
        card.removeEventListener("pointerup", up);
        card.removeEventListener("pointercancel", up);
      });
    });
  });

  app.querySelectorAll<HTMLElement>("[data-perspective-carousel]").forEach((carousel) => {
    const slides = Array.from(carousel.querySelectorAll<HTMLElement>("[data-perspective-slide]"));
    const status = carousel.querySelector<HTMLElement>("[data-perspective-status]");
    let selected = editorSceneIndexFor(carousel, slides.length);
    const show = (next: number, focus = false) => {
      if (!slides.length) return;
      selected = (next + slides.length) % slides.length;
      slides.forEach((slide, index) => {
        const active = index === selected;
        slide.classList.toggle("active", active);
        slide.setAttribute("aria-hidden", String(!active));
      });
      if (status) status.textContent = `${selected + 1} / ${slides.length}`;
      if (focus) carousel.focus({ preventScroll: true });
    };
    const step = (event: Event) => {
      const button = event.currentTarget as HTMLElement;
      show(selected + Number(button.dataset.perspectiveStep), true);
      selectEditorAnimationScene(carousel, selected);
    };
    const keydown = (event: KeyboardEvent) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      show(selected + (event.key === "ArrowLeft" ? -1 : 1), true);
      selectEditorAnimationScene(carousel, selected);
    };
    const buttons = Array.from(carousel.querySelectorAll<HTMLButtonElement>("[data-perspective-step]"));
    buttons.forEach((button) => button.addEventListener("click", step));
    carousel.addEventListener("keydown", keydown);
    carousel.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", ((event: CustomEvent<{ index?: number }>) => show(Number(event.detail?.index) || 0)) as EventListener);
    show(selected);
    libraryMotionCleanups.push(() => {
      buttons.forEach((button) => button.removeEventListener("click", step));
      carousel.removeEventListener("keydown", keydown);
    });
  });

  app.querySelectorAll<HTMLElement>("[data-gallery-accordion]").forEach((gallery) => {
    const figures = Array.from(gallery.querySelectorAll<HTMLElement>("[data-gallery-accordion-item]"));
    const modal = gallery.querySelector<HTMLElement>("[data-gallery-modal]");
    const content = gallery.querySelector<HTMLElement>("[data-gallery-modal-content]");
    const closeButton = gallery.querySelector<HTMLButtonElement>("[data-gallery-modal-close]");
    const close = () => {
      if (!modal) return;
      modal.hidden = true;
      content?.replaceChildren();
      document.body.classList.remove("store-gallery-modal-open");
    };
    const open = (event: Event) => {
      const button = event.currentTarget as HTMLElement;
      const index = Number(button.dataset.galleryAccordionOpen);
      figures.forEach((figure, figureIndex) => figure.classList.toggle("active", figureIndex === index));
      selectEditorAnimationScene(gallery, index);
      if (state.storePreviewEditorEnabled || !modal || !content || !Number.isInteger(index)) return;
      const source = figures[index];
      const media = source?.querySelector<HTMLElement>(".store-fidelity-media, video");
      const copy = source?.querySelector<HTMLElement>("figcaption");
      if (media) content.append(media.cloneNode(true));
      if (copy) content.append(copy.cloneNode(true));
      modal.hidden = false;
      document.body.classList.add("store-gallery-modal-open");
      closeButton?.focus({ preventScroll: true });
    };
    const backdrop = (event: MouseEvent) => { if (event.target === modal) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && modal && !modal.hidden) close(); };
    const buttons = Array.from(gallery.querySelectorAll<HTMLButtonElement>("[data-gallery-accordion-open]"));
    buttons.forEach((button) => button.addEventListener("click", open));
    closeButton?.addEventListener("click", close);
    modal?.addEventListener("click", backdrop);
    document.addEventListener("keydown", escape);
    libraryMotionCleanups.push(() => {
      buttons.forEach((button) => button.removeEventListener("click", open));
      closeButton?.removeEventListener("click", close);
      modal?.removeEventListener("click", backdrop);
      document.removeEventListener("keydown", escape);
      close();
    });
  });

  app.querySelectorAll<HTMLElement>("[data-sticky-story]").forEach((story) => {
    const items = Array.from(story.querySelectorAll<HTMLElement>("[data-sticky-story-item]"));
    const media = Array.from(story.querySelectorAll<HTMLElement>("[data-sticky-story-media]"));
    const show = (index: number) => media.forEach((figure, figureIndex) => figure.classList.toggle("active", figureIndex === index));
    const observer = typeof IntersectionObserver === "function" && !reduceLibraryMotion
      ? new IntersectionObserver((entries) => entries.forEach((entry) => {
          if (entry.isIntersecting) show(Number((entry.target as HTMLElement).dataset.stickyStoryItem) || 0);
        }), { rootMargin: "-40% 0px -40%", threshold: 0 })
      : null;
    items.forEach((item) => observer?.observe(item));
    show(0);
    libraryMotionCleanups.push(() => observer?.disconnect());
  });

  const scrollDriven = Array.from(app.querySelectorAll<HTMLElement>("[data-video-pin-reveal], [data-text-parallax-item]"));
  if (scrollDriven.length && !reduceLibraryMotion) {
    let frame = 0;
    const update = () => {
      frame = 0;
      scrollDriven.forEach((element) => {
        const bounds = element.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, -bounds.top / Math.max(bounds.height - window.innerHeight, 1)));
        element.style.setProperty(element.hasAttribute("data-video-pin-reveal") ? "--video-pin-progress" : "--text-parallax-progress", progress.toFixed(4));
      });
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    libraryMotionCleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    });
  }

  if (libraryMotionCleanups.length) {
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      libraryMotionCleanups.forEach((cleanup) => cleanup());
    };
  }
}
