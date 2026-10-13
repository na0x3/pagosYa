import { state } from "../state";
import { app } from "../ui/app";
import { playStoreVideo } from "../ui/media";
import { applyAnimationCopySceneLayout } from "../preview-editor/editor-base";
import { editorSceneIndexFor } from "./store-motion-scenes";

/** Typewriter, glitch, block reveal and text-on-path effects. */
export function bindStoreTextEffects(): void {
  const textEffectCleanups: Array<() => void> = [];
  const reduceTextMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  app.querySelectorAll<HTMLElement>("[data-text-rotate]").forEach((container) => {
    const current = container.querySelector<HTMLElement>("[data-text-rotate-current]");
    const values = (container.dataset.textRotateValues || "").split("\u001f").map((value) => value.trim()).filter(Boolean);
    if (!current || values.length < 2 || reduceTextMotion || state.storePreviewEditorEnabled) return;
    let index = 0;
    let timer = 0;
    let visible = false;
    let characterIndex = Array.from(values[0]).length;
    let phase: "hold" | "erase" | "type" = "hold";
    const stop = () => { if (timer) window.clearTimeout(timer); timer = 0; };
    const schedule = (delay: number) => {
      stop();
      if (!visible || document.hidden) return;
      timer = window.setTimeout(tick, delay);
    };
    const tick = () => {
      if (!visible || typeof document === "undefined" || document.hidden) return;
      if (phase === "hold") {
        phase = "erase";
        schedule(1400);
        return;
      }
      if (phase === "erase") {
        const characters = Array.from(values[index]);
        characterIndex = Math.max(0, characterIndex - 1);
        current.textContent = characters.slice(0, characterIndex).join("");
        if (characterIndex === 0) {
          index = (index + 1) % values.length;
          phase = "type";
          schedule(180);
        } else schedule(42);
        return;
      }
      const characters = Array.from(values[index]);
      characterIndex = Math.min(characters.length, characterIndex + 1);
      current.textContent = characters.slice(0, characterIndex).join("");
      if (characterIndex === characters.length) {
        phase = "hold";
        schedule(0);
      } else schedule(72);
    };
    const start = () => {
      stop();
      if (!visible || document.hidden) return;
      phase = "hold";
      characterIndex = Array.from(values[index]).length;
      current.textContent = values[index];
      schedule(0);
    };
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); }, { threshold: .2 })
      : null;
    if (observer) observer.observe(container);
    else { visible = true; start(); }
    const onVisibility = () => start();
    document.addEventListener("visibilitychange", onVisibility);
    textEffectCleanups.push(() => { stop(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); });
  });

  app.querySelectorAll<HTMLElement>("[data-text-glitch]").forEach((container) => {
    const hover = container.querySelector<HTMLElement>("[data-text-glitch-hover]");
    const target = container.dataset.hoverText || hover?.textContent || "";
    if (!hover || !target || reduceTextMotion) return;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let timer = 0;
    const stop = () => { if (timer) window.clearInterval(timer); timer = 0; };
    const reveal = () => {
      stop();
      let progress = 0;
      timer = window.setInterval(() => {
        hover.textContent = Array.from(target).map((letter, index) => {
          if (/\s/.test(letter) || index < progress) return letter;
          return letters[Math.floor(Math.random() * letters.length)];
        }).join("");
        progress += .5;
        if (progress >= Array.from(target).length) { stop(); hover.textContent = target; }
      }, 32);
    };
    const reset = () => { stop(); hover.textContent = target; };
    container.addEventListener("pointerenter", reveal);
    container.addEventListener("focus", reveal);
    container.addEventListener("pointerleave", reset);
    container.addEventListener("blur", reset);
    textEffectCleanups.push(() => {
      stop();
      container.removeEventListener("pointerenter", reveal);
      container.removeEventListener("focus", reveal);
      container.removeEventListener("pointerleave", reset);
      container.removeEventListener("blur", reset);
    });
  });

  app.querySelectorAll<HTMLElement>("[data-text-reveal]").forEach((container) => {
    if (reduceTextMotion || state.storePreviewEditorEnabled || typeof IntersectionObserver !== "function") {
      container.classList.add("is-revealed");
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      container.classList.add("is-revealed");
      observer.disconnect();
    }, { threshold: .25 });
    observer.observe(container);
    textEffectCleanups.push(() => observer.disconnect());
  });

  app.querySelectorAll<SVGSVGElement>("[data-text-along-path] svg").forEach((svg) => {
    const pause = () => { try { svg.pauseAnimations(); } catch {} };
    const play = () => { if (!reduceTextMotion && !state.storePreviewEditorEnabled && !document.hidden) try { svg.unpauseAnimations(); } catch {} };
    if (reduceTextMotion || state.storePreviewEditorEnabled) { pause(); return; }
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => entry.isIntersecting ? play() : pause(), { threshold: .05 })
      : null;
    observer?.observe(svg);
    const onVisibility = () => document.hidden ? pause() : play();
    document.addEventListener("visibilitychange", onVisibility);
    textEffectCleanups.push(() => { pause(); observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibility); });
  });

  if (textEffectCleanups.length) {
    const priorCleanup = state.activeStoreExperienceCleanup as (() => void) | null;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      textEffectCleanups.forEach((cleanup) => cleanup());
    };
  }
}

/** Scroll-painted animations (circle reveal, frame sequence, chapters, expansion, gallery), the story scroller and story-flow sections. */
export function bindStoreScrollMotion(): void {
  const circleReveals = Array.from(app.querySelectorAll<HTMLElement>("[data-circle-reveal]"));
  const frameSequences = Array.from(app.querySelectorAll<HTMLElement>("[data-frame-sequence]"));
  const fullChapters = Array.from(app.querySelectorAll<HTMLElement>("[data-full-chapters]"));
  if (circleReveals.length || frameSequences.length || fullChapters.length) {
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let frame = 0;
    const progressFor = (element: HTMLElement) => {
      const travel = Math.max(element.offsetHeight - window.innerHeight, 1);
      return Math.max(0, Math.min(1, -element.getBoundingClientRect().top / travel));
    };
    const syncVideo = (container: HTMLElement, shouldPlay: boolean) => {
      const video = container.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      const nextPlaybackState = shouldPlay && !reduceMotion?.matches ? "playing" : "paused";
      if (video.dataset.motionPlayback === nextPlaybackState) return;
      video.dataset.motionPlayback = nextPlaybackState;
      if (nextPlaybackState === "playing") {
        playStoreVideo(video, () => {
          video.dataset.motionPlayback = "paused";
        });
      } else {
        if (!video.paused) video.pause();
      }
    };
    const paint = () => {
      frame = 0;
      circleReveals.forEach((reveal) => {
        const progress = reduceMotion?.matches ? 1 : progressFor(reveal);
        const media = reveal.querySelector<HTMLElement>(".store-circle-reveal-media");
        const copy = reveal.querySelector<HTMLElement>(".store-circle-reveal-copy");
        if (media) media.style.clipPath = `circle(${12 + progress * 138}% at 50% 50%)`;
        if (copy) {
          copy.style.opacity = String(Math.max(0, Math.min(1, (progress - .58) * 2.6)));
          copy.style.transform = `translateY(${(1 - progress) * 20}px)`;
        }
        syncVideo(reveal, progress > .05 && progress < .98);
      });
      frameSequences.forEach((sequence) => {
        const frames = Array.from(sequence.querySelectorAll<HTMLElement>("[data-frame]"));
        const progress = reduceMotion?.matches ? 0 : progressFor(sequence);
        const selectedEditorIndex = editorSceneIndexFor(sequence, frames.length);
        const hasEditorScene = state.storePreviewEditorEnabled
          && state.storePreviewEditorSelection?.animationId === sequence.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(state.storePreviewEditorSelection?.itemIndex);
        const index = hasEditorScene ? selectedEditorIndex : Math.min(frames.length - 1, Math.round(progress * (frames.length - 1)));
        frames.forEach((item, itemIndex) => {
          const active = itemIndex === index;
          item.classList.toggle("active", active);
          syncVideo(item, active && progress < .99);
        });
        const image = frames[index];
        const status = sequence.querySelector<HTMLElement>("[data-frame-status]");
        const title = sequence.querySelector<HTMLElement>("[data-frame-title]");
        const body = sequence.querySelector<HTMLElement>("[data-frame-body]");
        const animationCopy = sequence.querySelector<HTMLElement>("[data-animation-copy]");
        if (animationCopy && image) applyAnimationCopySceneLayout(animationCopy, image);
        if (status) status.textContent = `${String(index + 1).padStart(2, "0")} / ${String(frames.length).padStart(2, "0")}`;
        if (title) {
          title.textContent = image?.dataset.frameTitleValue || "";
          title.hidden = !title.textContent;
        }
        if (body) {
          body.textContent = image?.dataset.frameBodyValue || "";
          body.hidden = !body.textContent;
        }
      });
      fullChapters.forEach((chapters) => {
        const backgrounds = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-bg]"));
        const copies = Array.from(chapters.querySelectorAll<HTMLElement>("[data-full-chapter-copy]"));
        const progress = reduceMotion?.matches ? 0 : progressFor(chapters);
        const selectedEditorIndex = editorSceneIndexFor(chapters, backgrounds.length);
        const hasEditorScene = state.storePreviewEditorEnabled
          && state.storePreviewEditorSelection?.animationId === chapters.closest<HTMLElement>(".store-motion-section")?.dataset.animationId
          && Number.isInteger(state.storePreviewEditorSelection?.itemIndex);
        const index = hasEditorScene ? selectedEditorIndex : Math.min(backgrounds.length - 1, Math.round(progress * (backgrounds.length - 1)));
        backgrounds.forEach((background, itemIndex) => {
          background.classList.toggle("active", itemIndex === index);
          syncVideo(background, itemIndex === index && progress < .99);
        });
        copies.forEach((copy, itemIndex) => {
          const active = itemIndex === index;
          copy.classList.toggle("active", active);
          copy.setAttribute("aria-hidden", String(!active));
        });
        const progressBar = chapters.querySelector<HTMLElement>(".store-full-chapter-progress span");
        if (progressBar) progressBar.style.transform = `scaleX(${progress})`;
      });
    };
    const requestPaint = () => { if (!frame) frame = window.requestAnimationFrame(paint); };
    [...frameSequences, ...fullChapters].forEach((container) => {
      container.closest(".store-motion-section")?.addEventListener("pagosya:editor-scene", requestPaint);
    });
    window.addEventListener("scroll", requestPaint, { passive: true });
    window.addEventListener("resize", requestPaint);
    reduceMotion?.addEventListener("change", requestPaint);
    paint();
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      reduceMotion?.removeEventListener("change", requestPaint);
      [...circleReveals, ...fullChapters].forEach((container) =>
        container.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()),
      );
    };
  }

  app.querySelectorAll<HTMLElement>("[data-scroll-expansion]").forEach((scrollExpansion) => {
    const expansionFigure = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-sticky > figure");
    const expansionBackground = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-background");
    const expansionCopy = scrollExpansion.querySelector<HTMLElement>(".store-scroll-expansion-copy");
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    let expansionFrame = 0;
    const paintExpansion = () => {
      expansionFrame = 0;
      const rect = scrollExpansion.getBoundingClientRect();
      const travel = Math.max(scrollExpansion.offsetHeight - window.innerHeight, 1);
      const progress = reduceMotion?.matches ? 1 : Math.max(0, Math.min(1, -rect.top / travel));
      scrollExpansion.style.setProperty("--expansion-progress", String(progress));
      if (expansionFigure) expansionFigure.style.transform = `translate(-50%,-50%) scale(${.34 + progress * .66})`;
      if (expansionBackground) expansionBackground.style.opacity = String(1 - progress);
      if (expansionCopy) {
        expansionCopy.style.opacity = String(progress);
        expansionCopy.style.transform = `translateY(${(1 - progress) * 24}px)`;
      }
    };
    const requestExpansionPaint = () => {
      if (!expansionFrame) expansionFrame = window.requestAnimationFrame(paintExpansion);
    };
    window.addEventListener("scroll", requestExpansionPaint, { passive: true });
    window.addEventListener("resize", requestExpansionPaint);
    reduceMotion?.addEventListener("change", requestExpansionPaint);
    paintExpansion();
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (expansionFrame) window.cancelAnimationFrame(expansionFrame);
      window.removeEventListener("scroll", requestExpansionPaint);
      window.removeEventListener("resize", requestExpansionPaint);
      reduceMotion?.removeEventListener("change", requestExpansionPaint);
    };
  });

  app.querySelectorAll<HTMLElement>("[data-gallery-scroll]").forEach((galleryScroll) => {
    const cells = Array.from(galleryScroll.querySelectorAll<HTMLElement>("[data-gallery-scroll-cell]"));
    const copy = galleryScroll.querySelector<HTMLElement>(".store-gallery-scroll-copy");
    const reduceMotion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const origins = [
      [-28, -24], [24, -18], [-22, 20], [26, 22], [0, 28],
    ];
    let galleryFrame = 0;
    const paintGallery = () => {
      galleryFrame = 0;
      const rect = galleryScroll.getBoundingClientRect();
      const travel = Math.max(galleryScroll.offsetHeight - window.innerHeight, 1);
      const progress = reduceMotion?.matches ? 1 : Math.max(0, Math.min(1, -rect.top / travel));
      cells.forEach((cell, index) => {
        const [x, y] = origins[index % origins.length];
        const scale = .5 + progress * .5;
        cell.style.transform = `translate(${x * (1 - progress)}%, ${y * (1 - progress)}%) scale(${scale})`;
      });
      if (copy) {
        copy.style.opacity = String(Math.max(0, 1 - progress * 2));
        copy.style.transform = `translate(-50%,-50%) scale(${Math.max(.92, 1 - progress * .08)})`;
      }
    };
    const requestGalleryPaint = () => {
      if (!galleryFrame) galleryFrame = window.requestAnimationFrame(paintGallery);
    };
    window.addEventListener("scroll", requestGalleryPaint, { passive: true });
    window.addEventListener("resize", requestGalleryPaint);
    reduceMotion?.addEventListener("change", requestGalleryPaint);
    paintGallery();
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      (priorCleanup as (() => void) | null)?.();
      if (galleryFrame) window.cancelAnimationFrame(galleryFrame);
      window.removeEventListener("scroll", requestGalleryPaint);
      window.removeEventListener("resize", requestGalleryPaint);
      reduceMotion?.removeEventListener("change", requestGalleryPaint);
    };
  });

  const storyScroller = app.querySelector<HTMLElement>(".store-story-scroller");
  if (storyScroller) {
    const tabs = Array.from(storyScroller.querySelectorAll<HTMLButtonElement>("[data-story-to]"));
    const panels = Array.from(storyScroller.querySelectorAll<HTMLElement>(".store-story-panel"));
    const reduceStoryMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let storyVisible = false;
    let selectedStory = 0;
    const syncStoryVideo = () => panels.forEach((panel, index) => {
      const video = panel.querySelector<HTMLVideoElement>("video");
      if (!video) return;
      if (index !== selectedStory || !storyVisible || reduceStoryMotion) video.pause();
      else playStoreVideo(video);
    });
    const showStory = (next: number, focus = false) => {
      const selected = (next + tabs.length) % tabs.length;
      selectedStory = selected;
      tabs.forEach((tab, index) => {
        tab.setAttribute("aria-selected", String(index === selected));
        tab.tabIndex = index === selected ? 0 : -1;
      });
      panels.forEach((panel, index) => {
        const active = index === selected;
        panel.classList.toggle("active", active);
        panel.setAttribute("aria-hidden", String(!active));
      });
      syncStoryVideo();
      if (focus) tabs[selected]?.focus({ preventScroll: true });
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => showStory(index));
      tab.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        showStory(index + (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1), true);
      });
    });
    const storyObserver = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          storyVisible = entry.isIntersecting && entry.intersectionRatio >= .35;
          syncStoryVideo();
        }, { threshold: [.35] })
      : null;
    storyObserver?.observe(storyScroller);
    showStory(0);
    state.activeStoreExperienceCleanup = () => {
      storyObserver?.disconnect();
      panels.forEach((panel) => panel.querySelector<HTMLVideoElement>("video")?.pause());
    };
  }

  const motionFlows = Array.from(app.querySelectorAll<HTMLElement>("[data-motion-flow]"));
  if (motionFlows.length) {
    const flowEntries = motionFlows.flatMap((motionFlow) =>
      Array.from(motionFlow.querySelectorAll<HTMLElement>(".store-flow-inner"))
        .map((inner, flowIndex) => ({ inner, flowIndex })),
    );
    const motionQuery = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    let frame = 0;
    let settleTimer = 0;
    const clampProgress = (value: number) => Math.max(0, Math.min(1, value));
    const releaseMotionLayers = () => {
      flowEntries.forEach(({ inner }) => (inner.style.willChange = "auto"));
      settleTimer = 0;
    };
    const paintMotionDuo = () => {
      frame = 0;
      if (motionQuery?.matches) {
        flowEntries.forEach(({ inner }) => {
          inner.style.transform = "none";
          inner.style.clipPath = "inset(0 round 0)";
          inner.style.opacity = "1";
        });
        releaseMotionLayers();
        return;
      }
      const viewportHeight = Math.max(window.innerHeight, 1);
      flowEntries.forEach(({ inner, flowIndex }) => {
        const section = inner.closest<HTMLElement>(".store-flow-section");
        if (!section) return;
        const progress = clampProgress((viewportHeight - section.getBoundingClientRect().top) / (viewportHeight * .75));
        const isGeneratedStory = Boolean(inner.closest(".bespoke-story-flow"));
        const isCompactViewport = window.matchMedia?.("(max-width: 720px)").matches;
        if (isGeneratedStory) {
          const remaining = 1 - progress;
          inner.style.transform = isCompactViewport
            ? `translateY(${remaining * 24}px) scale(${.98 + progress * .02})`
            : `translateY(${remaining * 8}svh) rotate(${remaining * 3}deg) scale(${.96 + progress * .04})`;
          inner.style.clipPath = `inset(${remaining * 9}% 0 0 round ${remaining * 22}px)`;
          inner.style.opacity = String(.72 + progress * .28);
        } else if (flowIndex === 0) {
          inner.style.transform = "none";
          inner.style.clipPath = "inset(0 round 0)";
          inner.style.opacity = "1";
        } else {
          inner.style.transform = `rotate(${(1 - progress) * 30}deg)`;
        }
      });
    };
    const requestMotionPaint = () => {
      flowEntries.forEach(({ inner }) => (inner.style.willChange = "transform, clip-path, opacity"));
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(releaseMotionLayers, 180);
      if (!frame) frame = window.requestAnimationFrame(paintMotionDuo);
    };
    window.addEventListener("scroll", requestMotionPaint, { passive: true });
    window.addEventListener("resize", requestMotionPaint);
    motionQuery?.addEventListener("change", requestMotionPaint);
    paintMotionDuo();
    const priorCleanup = state.activeStoreExperienceCleanup;
    state.activeStoreExperienceCleanup = () => {
      priorCleanup?.();
      if (frame) window.cancelAnimationFrame(frame);
      if (settleTimer) window.clearTimeout(settleTimer);
      window.removeEventListener("scroll", requestMotionPaint);
      window.removeEventListener("resize", requestMotionPaint);
      motionQuery?.removeEventListener("change", requestMotionPaint);
      motionFlows.forEach((motionFlow) => motionFlow.querySelectorAll<HTMLVideoElement>("video").forEach((video) => video.pause()));
    };
  }
}
