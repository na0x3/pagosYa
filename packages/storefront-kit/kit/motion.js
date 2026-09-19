/* pagosya-motion:start */
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
      html[data-pagosya-motion=expressive] .menu-item__image { transition: transform 160ms var(--ease-out, cubic-bezier(.23,1,.32,1)); }
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
  const excluded = 'aside,dialog,[role=dialog],[data-cart-panel],form,button,a,input,select,textarea,[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-checkout],[data-pagosya-checkout-page],[data-checkout-review],[data-pagosya-contact],[data-motion=off]';
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
            ? [{ opacity: .75, transform: `translateY(${mode === 'expressive' ? 10 : 6}px)` }, { opacity: 1, transform: 'translateY(0)' }]
            : [{ opacity: .75 }, { opacity: 1 }];
        const animation = el.animate(frames, { duration: floating ? 2400 : mode === 'expressive' ? 280 : 220, iterations: floating ? 2 : 1, easing: floating ? 'cubic-bezier(.77,0,.175,1)' : ease });
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
