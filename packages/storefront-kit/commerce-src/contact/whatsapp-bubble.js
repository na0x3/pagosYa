  // The floating WhatsApp button (owner 2026-11-08: «what if the user wants whatsapp and chatbot at the same time»): every store
  // with a number and the switch on (Store.whatsappButton), whatever its checkout. With the assistant it is a smaller circle just
  // above the chat bubble and steps aside while the chat window is open. Never on the checkout. (It used to live only in the
  // lively look, for WhatsApp-checkout stores without the assistant.)
  (function whatsappBubble() {
    const phone = String(store.contactPhone || '').replace(/\D/g, '');
    if (store.whatsappButton === false || phone.length < 7) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-whatsapp', '');
    // The chat bubble is 56px at 24px (16px on a phone) from the corner: the stacked circle shares its centre line, 12px above it.
    style.textContent = `@layer pagosya-whatsapp{
      .pya-wa{position:fixed;right:24px;bottom:calc(24px + var(--pya-lift,0px));z-index:1000;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#25d366;color:#fff;box-shadow:0 10px 26px -10px #25d366b3;transition:bottom .25s,opacity .2s,transform .2s}
      .pya-wa svg{width:28px;height:28px}
      @media (hover:hover){.pya-wa:hover{transform:translateY(-2px)}}
      .pya-wa:focus-visible{outline:3px solid #128c7e;outline-offset:3px}
      .pya-wa.is-stacked{right:30px;bottom:calc(92px + var(--pya-lift,0px));width:44px;height:44px}
      .pya-wa.is-stacked svg{width:22px;height:22px}
      .pya-wa.is-away{opacity:0;pointer-events:none;transform:scale(.8)}
      @media (max-width:560px){.pya-wa{right:16px;bottom:calc(16px + var(--pya-lift,0px))}.pya-wa.is-stacked{right:22px;bottom:calc(84px + var(--pya-lift,0px))}}
      @media (prefers-reduced-motion:reduce){.pya-wa{transition:none}}
    }`;
    document.head.append(style);
    const link = document.createElement('a');
    link.className = 'pya-wa'; link.href = `https://wa.me/${phone}`; link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', 'Escríbenos por WhatsApp');
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.2.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.1 1.4Z"/></svg>';
    let queued = false;
    const place = () => {
      queued = false;
      const assistant = document.querySelector('[data-pagosya-assistant]');
      const checkout = document.querySelector('[data-pagosya-checkout]:not([hidden]),.pya-checkout:not([hidden])');
      if (checkout) { link.remove(); return; }
      if (!link.isConnected) document.body.append(link);
      link.classList.toggle('is-stacked', Boolean(assistant));
      link.classList.toggle('is-away', Boolean(assistant && assistant.querySelector('.pya-panel:not([hidden])')));
      // Rides above the product page's buy bar like the chat bubble does.
      const bar = document.querySelector('[data-product-sticky]');
      link.style.setProperty('--pya-lift', !bar || bar.hidden ? '0px' : Math.ceil(bar.getBoundingClientRect().height) + 'px');
    };
    const later = () => { if (!queued) { queued = true; requestAnimationFrame(place); } };
    place();
    new MutationObserver(later).observe(document.body || document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  })();
