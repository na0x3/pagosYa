  const hosted = window.PAGOSYA_HOSTED === true;
  // The merchant's measurement tags only: pagosYa's own checkout steps travel as G1 analytics events (analytics()
  // below; spec 2026-10-13-abandoned-carts). Those tags exist only after the shopper accepted statistics — see
  // privacy.js and the gate the API puts in the head — so a missing gtag/fbq/ttq here is that refusal, and the event
  // is dropped rather than queued.
  const PIXEL_EVENTS = { product_view: ['view_item', 'ViewContent'], add_to_cart: ['add_to_cart', 'AddToCart'], checkout_started: ['begin_checkout', 'InitiateCheckout'] };
  const track = (event, method, detail) => {
    const names = PIXEL_EVENTS[event];
    if (!names) return;
    // Amounts are integer centavos here; every provider expects major units.
    const amount = detail?.value ?? (event === 'checkout_started' ? cartValue() : 0);
    const payload = amount > 0 ? { value: amount / 100, currency: detail?.currency || cartCurrency() } : {};
    try { window.gtag?.('event', names[0], payload); } catch {}
    try { window.fbq?.('track', names[1], payload); } catch {}
    try { window.ttq?.track?.(names[1], payload); } catch {}
  };
  /* Store analytics (G1), hosted stores only. The sandbox has no storage and cannot see the shopper's choice, so the
   * kit hands small allow-listed events to pagosYa's page, which applies consent, the session and dedupe, and sends
   * them. The labels are the API's ANALYTICS_TRACK_LABELS (a test pins them). Never a word the shopper typed. */
  const ANALYTICS_LABELS = ['hero-cta', 'nav-cart', 'nav-catalog', 'card', 'add', 'checkout', 'pay', 'whatsapp', 'contact', 'promo', 'social', 'newsletter'];
  const ANALYTICS_PAGE = typeof window.PAGOSYA_PREVIEW_PAGE === 'string' ? window.PAGOSYA_PREVIEW_PAGE : 'index.html';
  const analyticsQueue = [];
  const analyticsOnce = new Set();
  let analyticsTimer = 0;
  function flushAnalytics() {
    clearTimeout(analyticsTimer); analyticsTimer = 0;
    if (analyticsQueue.length) parent.postMessage({ type: 'pagosya:analytics', events: analyticsQueue.splice(0) }, '*');
  }
  /** `once` names a moment counted a single time on this page (a product view, a checkout step). */
  function analytics(type, fields, once) {
    if (!hosted) return;
    if (once) { if (analyticsOnce.has(once)) return; analyticsOnce.add(once); }
    analyticsQueue.push(Object.assign({ type }, fields, { path: ANALYTICS_PAGE }));
    if (analyticsQueue.length >= 20) flushAnalytics();
    else if (!analyticsTimer) analyticsTimer = setTimeout(flushAnalytics, 400);
  }
  /** The catalog card's product, only when it is one of this store's products. */
  function cardProductId(card) {
    const control = card.querySelector('[data-add],[data-product]');
    let id = card.dataset.productId || control?.dataset.add || control?.dataset.product || null;
    const link = id ? null : card.querySelector('a[href*="id="]');
    if (link) { try { id = new URL(link.getAttribute('href'), document.baseURI).searchParams.get('id'); } catch { id = null; } }
    return products().some(item => item.id === id) ? id : null;
  }
  const WHATSAPP_LINK = /^https:\/\/(?:wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i;
  if (hosted) {
    window.addEventListener('pagehide', flushAnalytics);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAnalytics(); });
    // Window capture runs before the kit's own cart-trigger listener, which stops the click from going further.
    window.addEventListener('click', event => {
      const target = event.target?.closest ? event.target : null;
      if (!target) return;
      const label = target.closest('[data-track]')?.getAttribute('data-track');
      if (label && ANALYTICS_LABELS.includes(label)) analytics('cta_click', { target: label });
      const control = target.closest('a,button');
      const card = control?.closest('.menu-item');
      if (card && !control.matches('[data-add],[data-card-swatch]')) { const id = cardProductId(card); if (id) analytics('product_card_click', { productId: id }); }
      // The shopper is leaving for WhatsApp: hand the queue over now.
      if (control?.matches('a[href]') && WHATSAPP_LINK.test(control.href)) { analytics('whatsapp_click'); flushAnalytics(); }
    }, true);
    document.addEventListener('change', event => { if (event.target?.matches?.('input[type=search]') && event.target.value.trim()) analytics('search'); });
  }
  let cardObserver = null;
  const watchedCards = new WeakSet();
  /** Each catalog card counts as seen once half of it is on screen, once per product on this page. */
  function observeCards() {
    if (!hosted || typeof IntersectionObserver !== 'function') return;
    if (!cardObserver) cardObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      cardObserver.unobserve(entry.target);
      const id = cardProductId(entry.target);
      if (id) analytics('product_card_impression', { productId: id }, 'impression:' + id);
    }), { threshold: 0.5 });
    document.querySelectorAll('[data-pagosya-catalog] .menu-item').forEach(card => { if (!watchedCards.has(card)) { watchedCards.add(card); cardObserver.observe(card); } });
  }
  analytics('page_view');
