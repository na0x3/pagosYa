  // Carousels (spec 2026-10-18-trust-draw-design.md): [data-pagosya-carousel] shows one slide at a time, so a store with many
  // photos or reviews never stacks them into a wall. The store designs the slides; the kit adds swiping (scroll-snap), the
  // arrows and dots after the track, the keyboard, and a slow turn for data-carousel-auto (never under reduced motion).
  const carouselStyle = document.createElement('style');
  carouselStyle.textContent = `@layer pagosya-commerce {
    [data-pagosya-carousel]{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden;scroll-snap-type:x mandatory!important;scrollbar-width:none;overscroll-behavior-x:contain}
    [data-pagosya-carousel]::-webkit-scrollbar{display:none}
    [data-pagosya-carousel]>*{flex:0 0 100%;box-sizing:border-box;min-width:0;margin:0;scroll-snap-align:start}
    [data-pagosya-carousel] img{display:block;max-width:100%}
    /* A wall the save turned into a carousel (source-photo-groups.ts) keeps its slides a readable photo height. */
    [data-carousel-repaired]{grid-column:1/-1!important;width:100%!important;min-width:0}
    [data-carousel-repaired] img{width:100%!important;height:min(78vh,680px)!important;max-height:none!important;object-fit:cover}
    [data-pagosya-carousel]:focus-visible{outline:3px solid currentColor;outline-offset:4px}
    .pagosya-carousel__controls{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:16px}
    .pagosya-carousel__controls[hidden]{display:none!important}
    .pagosya-carousel__button{display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid color-mix(in srgb,currentColor 30%,transparent);border-radius:999px;background:transparent;color:inherit;font:inherit;cursor:pointer}
    .pagosya-carousel__dots{display:flex;flex-wrap:wrap;justify-content:center}
    .pagosya-carousel__dot{position:relative;width:24px;height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}
    .pagosya-carousel__dot::after{content:"";position:absolute;inset:18px 8px;border-radius:999px;background:currentColor;opacity:.3}
    .pagosya-carousel__dot[aria-current=true]::after{opacity:1}
    :is(.pagosya-carousel__button,.pagosya-carousel__dot):focus-visible{outline:3px solid currentColor;outline-offset:2px}
    /* Reviews (content/load.js reviewMarkup): bare defaults, the store's design restyles them. */
    .pagosya-review{display:flex;flex-direction:column;gap:10px}
    .pagosya-review__stars,.pagosya-review__body,.pagosya-review__body p,.pagosya-review__by{margin:0}
    .pagosya-review__stars{letter-spacing:.12em}
    .pagosya-review__by{font-size:.9em}.pagosya-review__source{opacity:.75}
  }`;
  document.head.appendChild(carouselStyle);
  const carouselTimers = new WeakMap();
  function mountCarousels() { document.querySelectorAll('[data-pagosya-carousel]').forEach(mountCarousel); }
  /** Mounts one track; the reviews slot mounts again once the store's reviews arrive. */
  function mountCarousel(track) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearInterval(carouselTimers.get(track));
    if (track.nextElementSibling?.classList.contains('pagosya-carousel__controls')) track.nextElementSibling.remove();
    const slides = Array.from(track.children).filter(slide => !slide.hidden);
    if (slides.length < 2) return;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-roledescription', 'carrusel');
    if (!track.hasAttribute('aria-label')) track.setAttribute('aria-label', 'Carrusel');
    if (!track.hasAttribute('tabindex')) track.tabIndex = 0;
    slides.forEach((slide, index) => { slide.setAttribute('role', 'group'); slide.setAttribute('aria-roledescription', 'diapositiva'); slide.setAttribute('aria-label', `${index + 1} de ${slides.length}`); });
    const controls = document.createElement('div');
    controls.className = 'pagosya-carousel__controls';
    controls.innerHTML = `<button type="button" class="pagosya-carousel__button" data-carousel-prev aria-label="Anterior"><span aria-hidden="true">←</span></button><span class="pagosya-carousel__dots">${slides.map((_, index) => `<button type="button" class="pagosya-carousel__dot" aria-label="Ir a ${index + 1} de ${slides.length}"></button>`).join('')}</span><button type="button" class="pagosya-carousel__button" data-carousel-next aria-label="Siguiente"><span aria-hidden="true">→</span></button>`;
    track.after(controls);
    const dots = Array.from(controls.querySelectorAll('.pagosya-carousel__dot'));
    const offset = slide => slide.getBoundingClientRect().left - track.getBoundingClientRect().left;
    const current = () => slides.reduce((best, slide, index) => Math.abs(offset(slide)) < Math.abs(offset(slides[best])) ? index : best, 0);
    const mark = () => { const at = current(); dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === at))); };
    const go = index => { const next = (index + slides.length) % slides.length; track.scrollTo({ left: track.scrollLeft + offset(slides[next]), behavior: reduced ? 'auto' : 'smooth' }); };
    controls.querySelector('[data-carousel-prev]').addEventListener('click', () => go(current() - 1));
    controls.querySelector('[data-carousel-next]').addEventListener('click', () => go(current() + 1));
    dots.forEach((dot, index) => dot.addEventListener('click', () => go(index)));
    track.addEventListener('keydown', event => {
      if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      go(current() + (event.key === 'ArrowRight' ? 1 : -1));
    });
    let frame = 0;
    track.addEventListener('scroll', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(mark); }, { passive: true });
    mark();
    if (!track.hasAttribute('data-carousel-auto') || reduced) return;
    let paused = false;
    const pause = value => () => { paused = value; };
    for (const element of [track, controls]) {
      element.addEventListener('pointerenter', pause(true)); element.addEventListener('pointerleave', pause(false));
      element.addEventListener('focusin', pause(true)); element.addEventListener('focusout', pause(false));
    }
    carouselTimers.set(track, setInterval(() => { if (!paused && !document.hidden) go(current() + 1); }, 7000));
  }
