  // Lively one-product stores (spec 2026-11-03, after nubecorp.pages.dev): only on a page that carries [data-pya-lively] (Esencial's
  // Único theme). Buttons glow in the accent, the product's own add button pulses until the shopper has scrolled past it once, the
  // corner bubbles ripple (the WhatsApp button itself is contact/whatsapp-bubble.js, on every store). Everything stands still with reduced motion.
  (function lively() {
    // The flagged page may be drawn after the kit starts (the Studio preview renders with React): wait for it a little while.
    if (!document.querySelector('[data-pya-lively]')) {
      const wait = new MutationObserver(() => { if (document.querySelector('[data-pya-lively]')) { wait.disconnect(); lively(); } });
      wait.observe(document.body || document.documentElement, { childList: true, subtree: true });
      setTimeout(() => wait.disconnect(), 15000);
      return;
    }
    const rootEl = document.documentElement;
    rootEl.setAttribute('data-pya-lively', '');
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-lively', '');
    style.textContent = `@layer pagosya-motion{
      :root[data-pya-lively] :is(.es-btn,.checkout-button){transition:transform .2s cubic-bezier(.2,.9,.2,1),box-shadow .2s}
      :root[data-pya-lively] :is(.es-btn,.checkout-button):not(:disabled){box-shadow:0 12px 26px -14px color-mix(in srgb,var(--kit-accent,var(--es-accent,#2457c5)) 75%,transparent)}
      @media (hover:hover){:root[data-pya-lively] .es-btn:hover{transform:translateY(-2px)}}
      :root[data-pya-lively] .es-btn:active{transform:scale(.96)}
      @media (prefers-reduced-motion:no-preference){
        :root[data-pya-lively] .product-detail__buy[data-pya-pulse]:not(:disabled){animation:pya-pulse 4s ease-in-out infinite}
        :root[data-pya-lively] [data-pagosya-assistant] .pya-launcher{animation:pya-ripple 2.4s ease-out infinite}
        .pya-wa{animation:pya-ripple-wa 2.4s ease-out infinite}
      }
      @keyframes pya-pulse{0%,84%,100%{transform:none}92%{transform:scale(1.04)}}
      @keyframes pya-ripple{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--kit-accent,#20211d) 45%,transparent),0 8px 24px rgba(0,0,0,.18)}100%{box-shadow:0 0 0 16px transparent,0 8px 24px rgba(0,0,0,.18)}}
      @keyframes pya-ripple-wa{0%{box-shadow:0 0 0 0 #25d36673}100%{box-shadow:0 0 0 16px #25d36600}}
    }`;
    document.head.append(style);
    // The pulse stops for good once the button has left the screen upwards.
    const pulsed = new WeakSet();
    const watchBuy = () => document.querySelectorAll('[data-pagosya-product-page] .product-detail__buy').forEach(buy => {
      if (pulsed.has(buy)) return;
      pulsed.add(buy); buy.setAttribute('data-pya-pulse', '');
      if (typeof IntersectionObserver !== 'function') return;
      const seen = new IntersectionObserver(entries => entries.forEach(entry => {
        if (!entry.isIntersecting && entry.boundingClientRect.bottom <= 0) { buy.removeAttribute('data-pya-pulse'); seen.disconnect(); }
      }));
      seen.observe(buy);
    });
    // The corner bubble rides above the buy bar when it shows (chat.js does this only for its own launcher).
    const lift = () => { const bar = document.querySelector('[data-product-sticky]'); rootEl.style.setProperty('--pya-lift', !bar || bar.hidden ? '0px' : Math.ceil(bar.getBoundingClientRect().height + 12) + 'px'); };
    watchBuy(); lift();
    new MutationObserver(() => { watchBuy(); lift(); }).observe(document.body || rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  })();
