/* pagosya-motion:start */
// Headings wrap differently once the merchant's own font loads, and a display
// line-height chosen against the fallback can leave real glyphs overlapping.
// Measure the loaded font's ink and open only the headings that need it, so the
// merchant never has to read a diagnostic about interlineado.
(() => {
  'use strict';
  let ctx;
  const openTightHeadings = () => {
    ctx ||= document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    for (const el of document.querySelectorAll('h1,h2,h3')) {
      const text = el.textContent?.trim();
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      const advance = parseFloat(style.lineHeight);
      // 'normal' leaves the font's own leading in place and never collides.
      if (!text || !size || !advance) continue;
      // A single line cannot cross another one; leave tight display type alone.
      if (el.getBoundingClientRect().height < advance * 1.5) continue;
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
      const ink = ctx.measureText(text);
      const needed = Math.ceil(ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent);
      if (needed > advance) el.style.lineHeight = `${needed}px`;
    }
  };
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(openTightHeadings, 150); };
  document.fonts?.ready.then(openTightHeadings).catch(() => {});
  window.addEventListener('load', schedule);
  window.addEventListener('resize', schedule);
})();

(() => {
  'use strict';
  const mode = ['auto', 'off', 'subtle', 'expressive'].includes(window.PAGOSYA_CONFIG?.motion) ? window.PAGOSYA_CONFIG.motion : 'subtle';
  const root = document.documentElement;
  root.dataset.pagosyaMotion = mode;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const style = document.createElement('style');
  style.textContent = `
    @media (prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) {
      html[data-pagosya-motion=subtle] .menu-item__image,
      html[data-pagosya-motion=expressive] .menu-item__image { transition: transform var(--motion-fast,160ms) var(--motion-ease,var(--ease-out,cubic-bezier(.23,1,.32,1))); }
      html[data-pagosya-motion=subtle] .menu-item:hover .menu-item__image { transform: scale(1.02); }
      html[data-pagosya-motion=expressive] .menu-item:hover .menu-item__image { transform: scale(1.035); }
    }
    html[data-pagosya-motion=off], html[data-pagosya-motion=off] *, html[data-pagosya-motion=off] *::before, html[data-pagosya-motion=off] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    @media (prefers-reduced-motion: reduce) {
      html[data-pagosya-motion], html[data-pagosya-motion] *, html[data-pagosya-motion] *::before, html[data-pagosya-motion] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
    }
  `;
  document.head.append(style);
  if (mode === 'auto' || mode === 'off' || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const animations = new Set();
  const excluded = '[data-ui-reveal],[data-ui-parallax],[data-ui-entrance-group],aside,dialog,[role=dialog],[data-cart-panel],form,button,a,input,select,textarea,[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-checkout],[data-pagosya-checkout-page],[data-checkout-review],[data-pagosya-contact],[data-motion=off]';
  let observer;
  let stopped = false;
  const cancel = () => { stopped = true; observer?.disconnect(); animations.forEach(a => a.cancel()); animations.clear(); };
  // Keyboard navigation remains immediate and does not restart motion later.
  document.addEventListener('keydown', cancel, { once: true, capture: true });
  reduce.addEventListener('change', event => { if (event.matches) cancel(); });
  document.addEventListener('visibilitychange', () => animations.forEach(a => document.hidden ? a.pause() : a.play()));
  window.addEventListener('pagehide', cancel, { once: true });
  const start = () => {
    if (stopped || reduce.matches) return;
    const ease = getComputedStyle(root).getPropertyValue('--ease-out').trim() || 'cubic-bezier(.23,1,.32,1)';
    // The store's motion personality (--motion-*, set by commerce.js from data-dna-motion); without one, today's values.
    const token = name => { const m = getComputedStyle(root).getPropertyValue(name).trim().match(/^(-?\d*\.?\d+)(ms|s|px)?$/); return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : null; };
    const expressive = mode === 'expressive';
    const duration = (expressive ? token('--motion-base') : token('--motion-fast')) ?? (expressive ? 280 : 220);
    const travel = token('--motion-distance');
    const distance = travel === null ? (expressive ? 10 : 6) : expressive ? travel : travel / 2;
    const seen = new WeakSet();
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (stopped || !entry.isIntersecting || reduce.matches || document.hidden) continue;
        const el = entry.target;
        observer.unobserve(el);
        if (seen.has(el)) continue;
        seen.add(el);
        const floating = mode === 'expressive' && el.dataset.motion === 'float' && el.getAttribute('aria-hidden') === 'true';
        // Preserve authored transforms; animate opacity alone when already transformed.
        const base = getComputedStyle(el).transform;
        const frames = floating && base === 'none'
          ? [{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)' }, { transform: 'translateY(0)' }]
          : base === 'none'
            ? [{ opacity: .75, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'translateY(0)' }]
            : [{ opacity: .75 }, { opacity: 1 }];
        const animation = el.animate(frames, { duration: floating ? 2400 : duration, iterations: floating ? 2 : 1, easing: floating ? 'cubic-bezier(.77,0,.175,1)' : ease });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
      }
    }, { threshold: .15 });
    const targets = document.querySelectorAll('[data-motion=reveal],[data-motion=float],main > section h2,main > section figure');
    let count = 0, floats = 0;
    for (const el of targets) {
      if (count >= 24 || el.closest(excluded) || el.querySelector(excluded)) continue;
      if (el.dataset.motion === 'float') {
        if (mode !== 'expressive' || el.getAttribute('aria-hidden') !== 'true' || floats >= 2) continue;
        floats++;
      }
      // No entrance on first paint. Content is always visible without JavaScript.
      if (el.getBoundingClientRect().top < window.innerHeight && el.dataset.motion !== 'float') continue;
      observer.observe(el); count++;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
/* pagosya-motion:end */
