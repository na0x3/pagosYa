  // Lively one-product stores (spec 2026-11-03, after nubecorp.pages.dev): only on a page that carries [data-pya-lively] (Esencial's
  // Único theme). Buttons glow in the accent, the product's own add button pulses until the shopper has scrolled past it once, the
  // corner bubble ripples, and a WhatsApp store with no assistant gets a WhatsApp bubble. Everything stands still with reduced motion.
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
      .pya-wa{position:fixed;right:24px;bottom:calc(24px + var(--pya-lift,0px));z-index:1000;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;box-shadow:0 10px 26px -10px #25d366b3;transition:bottom .25s}
      .pya-wa svg{width:28px;height:28px}
      @media (max-width:560px){.pya-wa{right:16px;bottom:calc(16px + var(--pya-lift,0px))}}
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
    // WhatsApp bubble: a WhatsApp store, a number, no assistant, not the checkout.
    const bubble = () => {
      const wa = document.querySelector('a.pya-wa'), phone = String(store.contactPhone || '').replace(/\D/g, '');
      const wanted = store.checkoutMode === 'whatsapp' && phone.length >= 7 && !document.querySelector('[data-pagosya-assistant]') && !document.querySelector('[data-pagosya-checkout]:not([hidden]),.pya-checkout:not([hidden])');
      if (wanted && !wa) {
        const link = document.createElement('a');
        link.className = 'pya-wa'; link.href = `https://wa.me/${phone}`; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Escríbenos por WhatsApp');
        link.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3Z"/></svg>';
        document.body.append(link);
      } else if (!wanted && wa) wa.remove();
    };
    // The corner bubble rides above the buy bar when it shows (chat.js does this only for its own launcher).
    const lift = () => { const bar = document.querySelector('[data-product-sticky]'); rootEl.style.setProperty('--pya-lift', !bar || bar.hidden ? '0px' : Math.ceil(bar.getBoundingClientRect().height + 12) + 'px'); };
    watchBuy(); bubble(); lift();
    new MutationObserver(() => { watchBuy(); bubble(); lift(); }).observe(document.body || rootEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  })();
