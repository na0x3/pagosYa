(() => {
  "use strict";
  // pagosya-product-options:v1 — bounded variant IDs, prices, stock and galleries.
  // pagosya-product-content:v1 — per-colour photo sets and product content blocks.
  const config = window.PAGOSYA_CONFIG || {};
  // Design DNA: each enum becomes data-dna-<name> on <html>, so variant CSS and motion can key on it.
  // Same values as SOURCE_DNA_RUNTIME_ENUMS in the API (a test pins them); anything else is ignored.
  const DNA_VALUES = {
    display: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda'],
    text: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda'],
    case: ['none', 'upper', 'small-caps'], tracking: ['tight', 'normal', 'wide'],
    radius: ['none', 'soft', 'round', 'pill'], border: ['none', 'hairline', 'bold'], frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape'],
    button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'], hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
    motion: ['calm', 'snappy', 'playful', 'cinematic'], grammar: ['editorial', 'grid', 'collage', 'index', 'poster', 'magazine', 'brutalist'], density: ['airy', 'balanced', 'dense'],
    cart: ['drawer', 'sheet', 'page', 'overlay'], added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'], product: ['editorial', 'dense', 'image-led', 'story-led'],
    review: ['split', 'stacked', 'ticket', 'notebook'], card: ['still', 'second-photo', 'swatch-swap', 'zoom', 'quick-look', 'tilt'],
    swatch: ['pill', 'circle', 'square', 'label', 'photo'], gallery: ['rail', 'strip', 'stack', 'mosaic'],
    blocks: ['plain', 'card', 'outline', 'tape', 'ticket'], divider: ['none', 'hairline', 'dashed', 'bold'], enter: ['none', 'fade-up', 'slide', 'pop'],
    media: ['left', 'right'],
  };
  // Motion personality (sub-project 6): data-dna-motion sets these as --motion-* tokens (MOTION_CSS). Same table as
  // SOURCE_MOTION_TOKENS in the API and MOTION_PERSONALITIES in ui.tsx (tests pin them). The tokens exist only for a
  // personality; every use site falls back to its own literal, so a store without one moves exactly as before.
  // ease/exit may overshoot (playful): transforms only. settle/settleExit stay inside 0..1: every other property, and
  // surfaces anchored to a screen edge, where an overshoot would open a gap.
  const MOTION_TOKENS = {
    calm: { ease: 'cubic-bezier(.25,.1,.25,1)', settle: 'cubic-bezier(.25,.1,.25,1)', exit: 'cubic-bezier(.4,0,1,1)', settleExit: 'cubic-bezier(.4,0,1,1)', fast: 180, base: 320, slow: 560, distance: 12, stagger: 70, parallax: .5, press: .98 },
    snappy: { ease: 'cubic-bezier(.2,.9,.2,1)', settle: 'cubic-bezier(.2,.9,.2,1)', exit: 'cubic-bezier(.4,0,.6,1)', settleExit: 'cubic-bezier(.4,0,.6,1)', fast: 120, base: 200, slow: 320, distance: 8, stagger: 35, parallax: .3, press: .96 },
    playful: { ease: 'cubic-bezier(.34,1.56,.64,1)', settle: 'cubic-bezier(.22,1,.36,1)', exit: 'cubic-bezier(.36,0,.66,-.56)', settleExit: 'cubic-bezier(.5,0,.75,0)', fast: 200, base: 360, slow: 600, distance: 18, stagger: 60, parallax: .8, press: .92 },
    cinematic: { ease: 'cubic-bezier(.16,1,.3,1)', settle: 'cubic-bezier(.16,1,.3,1)', exit: 'cubic-bezier(.7,0,.84,0)', settleExit: 'cubic-bezier(.7,0,.84,0)', fast: 260, base: 520, slow: 900, distance: 28, stagger: 110, parallax: 1.3, press: .98 },
  };
  const MOTION_CSS = [
    ...Object.entries(MOTION_TOKENS).map(([name, t]) => `:root[data-dna-motion=${name}]{--motion-ease:${t.ease};--motion-ease-settle:${t.settle};--motion-ease-exit:${t.exit};--motion-ease-settle-exit:${t.settleExit};--motion-fast:${t.fast}ms;--motion-base:${t.base}ms;--motion-slow:${t.slow}ms;--motion-distance:${t.distance}px;--motion-stagger:${t.stagger}ms;--motion-parallax:${t.parallax};--motion-press-scale:${t.press}}`),
    /* The kit's long-referenced but never-defined eases become the personality's settle curve. */
    ':root[data-dna-motion]{--ease-out:var(--motion-ease-settle);--ease-drawer:var(--motion-ease-settle)}',
    /* Leaving: panels on the settle exit curve (never anticipates), the notice's slide on the exit curve. */
    ':root[data-dna-motion] .cart-drawer:not([open]){transition-timing-function:var(--motion-ease-settle-exit)}',
    /* Curves only (the notice's transition lists opacity, transform, visibility): the kit's instant and reduced-motion rules still switch it off. */
    ':root[data-dna-motion] .cart-added:not([data-visible=true]){transition-timing-function:var(--motion-ease-settle-exit),var(--motion-ease-exit),linear}',
    /* The ribbon hangs from a screen edge: an overshoot would open a gap above it. */
    ':root[data-dna-added=ribbon] .cart-added{--motion-ease:var(--motion-ease-settle);--motion-ease-exit:var(--motion-ease-settle-exit)}',
  ];
  const MOTION_TOKEN_NAMES = { ease: '--motion-ease', settle: '--motion-ease-settle', exit: '--motion-ease-exit', settleExit: '--motion-ease-settle-exit', fast: '--motion-fast', base: '--motion-base', slow: '--motion-slow', distance: '--motion-distance', stagger: '--motion-stagger', parallax: '--motion-parallax', press: '--motion-press-scale' };
  /* A store's own numbers are held to the range @pagosya/ui allows (a press scale of 0 would collapse the button; a
   * negative duration makes animate() throw). */
  const MOTION_LIMITS = { fast: [0, 900], base: [0, 900], slow: [0, 900], distance: [0, 40], stagger: [0, 120], parallax: [0, 2], press: [.85, 1] };
  /* One token for WAAPI, which cannot read the cascade: the store's own --motion-* value (computed, clamped), else the
   * personality's table value, else the use site's literal (today's value). */
  function motionValue(name, fallback) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(MOTION_TOKEN_NAMES[name]).trim();
    if (raw && typeof fallback === 'string') return raw;
    const number = raw.match(/^(-?\d*\.?\d+)(ms|s|px)?$/);
    if (number) { const [min, max] = MOTION_LIMITS[name]; return Math.min(max, Math.max(min, Number(number[1]) * (number[2] === 's' ? 1000 : 1))); }
    const personality = document.documentElement.getAttribute('data-dna-motion');
    return Object.prototype.hasOwnProperty.call(MOTION_TOKENS, personality ?? '') ? MOTION_TOKENS[personality][name] : fallback;
  }
  // product is the one exception: render() sets it from productPageStyle(), the page this kit actually draws.
  const hasDna = Boolean(config.dna && typeof config.dna === 'object');
  if (hasDna) {
    for (const name of Object.keys(DNA_VALUES)) if (name !== 'product' && DNA_VALUES[name].includes(config.dna[name])) document.documentElement.setAttribute(`data-dna-${name}`, config.dna[name]);
  }
  /* DNA motifs (sub-project 3): small line drawings the kit places next to the product title, in a corner of matching
   * cards and in the cart header, and animates with its own keyframes on the --motion-* tokens. The API sanitised the
   * markup; it is verified again against the same allow-lists (a test pins them) and imported as nodes, never as HTML.
   * A store without motifs gets no style, no slot and no attribute. */
  const MOTIF_ELEMENTS = ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'title', 'desc'];
  const MOTIF_ATTRIBUTES = ['viewBox', 'preserveAspectRatio', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr', 'd', 'points', 'pathLength', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-opacity', 'opacity', 'color', 'transform', 'vector-effect', 'clip-path', 'clip-rule', 'mask', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits', 'class', 'id', 'data-part', 'aria-hidden', 'focusable'];
  const MOTIF_BEHAVIORS = ['glow', 'draw', 'sway', 'steam', 'grow', 'bounce', 'spin', 'float'];
  const MOTIF_SLOT_TRIGGERS = ['appear', 'scroll', 'hover', 'add-to-cart'];
  function parseMotifDrawing(markup) {
    let root;
    try { root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement; } catch { return null; }
    const SVG_NS = 'http://www.w3.org/2000/svg';
    if (!root || root.namespaceURI !== SVG_NS || root.localName !== 'svg') return null;
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.namespaceURI !== SVG_NS || !MOTIF_ELEMENTS.includes(el.localName)) return null;
      for (const attr of [...el.attributes]) {
        if (el === root && attr.name === 'xmlns') continue;
        const value = attr.value;
        if (!MOTIF_ATTRIBUTES.includes(attr.name) || /[<>"`\\]|(?:javascript|vbscript|data)\s*:|expression\s*\(/i.test(value)
          || /url\s*\(/i.test(value) && !/^url\(\s*#[A-Za-z][\w-]*\s*\)$/.test(value.trim())) return null;
      }
    }
    root.removeAttribute('transform'); // a root transform would move the drawing out of its slot
    return root;
  }
  // Every distinct drawing string is parsed and sanitised once (finding 4): a public catalog can place the same
  // drawing on well over a hundred cards, and DOMParser is not cheap. Every call after the first for the same
  // markup clones the cached, already-sanitised element; callers may freely mutate their own clone. Defined here,
  // ahead of AI_MOTIFS/PACK_MOTIFS below (both call motifDrawing while filtering, at module-evaluation time).
  const motifDrawingCache = new Map();
  function motifDrawing(markup) {
    if (!motifDrawingCache.has(markup)) motifDrawingCache.set(markup, parseMotifDrawing(markup));
    const cached = motifDrawingCache.get(markup);
    return cached ? cached.cloneNode(true) : null;
  }
  const AI_MOTIFS = (Array.isArray(config.motifs) ? config.motifs : []).slice(0, 3).filter(motif => motif && typeof motif === 'object'
    && MOTIF_BEHAVIORS.includes(motif.behavior) && MOTIF_SLOT_TRIGGERS.includes(motif.trigger) && ['product', 'card', 'cart'].includes(motif.placement)
    && ['store', 'category', 'product'].includes(motif.for) && typeof motif.target === 'string' && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg));
  /* Identity libraries (T2a): one drawn motif pack, at most 8 placements, one drawing each. The API sanitised the markup
   * (config.motifPack, re-sanitised on every save); it is verified again here with the same lists. Pack motifs are
   * store-wide; the store's own targeted motifs above keep precedence in the slots both can fill. A store without a
   * pack gets nothing new: no entry, no style, no observer. */
  const MOTIF_PACK_PLACEMENTS = ['button', 'pattern', 'divider', 'sticker', 'empty', 'product', 'card', 'cart'];
  const MOTIF_PACK_TRIGGERS = { product: 'appear', card: 'hover', cart: 'add-to-cart', button: 'hover', pattern: 'none', divider: 'scroll', sticker: 'appear', empty: 'appear' };
  const MOTIF_PACK = config.motifPack && typeof config.motifPack === 'object' && typeof config.motifPack.id === 'string'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(config.motifPack.id) && Array.isArray(config.motifPack.motifs) ? config.motifPack : null;
  const PACK_MOTIFS = (MOTIF_PACK ? MOTIF_PACK.motifs : []).slice(0, 8).filter((motif, index, all) => motif && typeof motif === 'object'
    && MOTIF_PACK_PLACEMENTS.includes(motif.placement) && all.findIndex(other => other && other.placement === motif.placement) === index
    && MOTIF_BEHAVIORS.includes(motif.behavior) && typeof motif.svg === 'string' && motif.svg.length <= 6144 && motifDrawing(motif.svg))
    .map(motif => ({ file: '', for: 'store', target: '', behavior: motif.behavior, trigger: MOTIF_PACK_TRIGGERS[motif.placement], placement: motif.placement, svg: motif.svg, pack: true }));
  const MOTIFS = [...AI_MOTIFS, ...PACK_MOTIFS];
  const packMotif = placement => MOTIFS.findIndex(motif => motif.pack && motif.placement === placement);
  let motifObserver = null;
  const hosted = window.PAGOSYA_HOSTED === true;
  // One moment, two audiences: pagosYa's own funnel (only while hosted in the studio)
  // and the merchant's measurement tags. Those tags exist only after the shopper accepted
  // statistics — see privacy.js and the gate the API puts in the head — so a missing
  // gtag/fbq/ttq here is that refusal, and the event is dropped rather than queued.
  const PIXEL_EVENTS = { product_view: ['view_item', 'ViewContent'], add_to_cart: ['add_to_cart', 'AddToCart'], checkout_started: ['begin_checkout', 'InitiateCheckout'] };
  const track = (event, method, detail) => {
    if (hosted) parent.postMessage({ type: 'pagosya:funnel', event, ...(method ? { method } : {}) }, '*');
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
  const preview = window.PAGOSYA_PREVIEW === true && !hosted;
  const request = async (url, options) => {
    if (!hosted) return fetch(url, options);
    const action = url.endsWith('/cart-checkout') ? 'checkout' : url.endsWith('/leads') ? 'lead' : url.endsWith('/shipping/quote') ? 'shipping' : url.includes('/content/reviews') ? 'review' : url.includes('/content') ? 'content' : 'catalog';
    const result = await window.PAGOSYA_HOSTED_REQUEST(action, options?.body ? JSON.parse(options.body) : url.includes('/content') ? { locale: document.documentElement.lang || 'es' } : {});
    return { ok: result.ok, json: async () => result.body };
  };
  let store = config.data || {};
  let ready = Boolean(config.demo || preview || hosted);
  let category = "all";
  let checkingOut = false;
  const cart = new Map();
  let partnerCode;
  if (!preview && !config.demo && window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug)) {
    const key = `pagosya:partner:${config.slug}`;
    const incoming = new URLSearchParams(location.search).get('partner');
    const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,40}$/.test(value);
    if (valid(incoming)) partnerCode = incoming;
    try {
      if (partnerCode) sessionStorage.setItem(key, partnerCode);
      else { const stored = sessionStorage.getItem(key); if (valid(stored)) partnerCode = stored; }
    } catch {}
  }

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // Published stores: personal fields are typed in pagosYa's secure form outside the design, never in this frame.
  function secureFields(root, names, note) {
    if (!hosted || !root) return;
    let removed = false;
    for (const name of names) root.querySelectorAll(`[name="${name}"]`).forEach(field => { (field.closest('label') || field).remove(); removed = true; });
    if (names.includes('creditCode')) root.querySelectorAll('[data-credit-apply],[data-credit-status]').forEach(el => el.remove());
    if (removed && !root.querySelector('.pagosya-secure-note')) (root.querySelector('.order-total') || root.querySelector('[type=submit]'))?.insertAdjacentHTML('beforebegin', `<p class="pagosya-secure-note">${escape(note)}</p>`);
  }
  // Platform uploads have width-limited WebP copies (?w=); embedded or authored images do not.
  const RESPONSIVE_WIDTHS = [320, 480, 640, 960, 1280, 1600];
  const responsiveSrcset = (url) => /\/v1\/uploads\/[0-9a-f-]{36}\.(?:png|jpe?g|webp)$/i.test(String(url || "")) ? RESPONSIVE_WIDTHS.map((width) => `${url}?w=${width} ${width}w`).join(", ") : "";
  const responsiveAttrs = (url, sizes) => { const set = responsiveSrcset(url); return set ? ` srcset="${escape(set)}" sizes="${escape(sizes)}"` : ""; };
  const money = (amount, currency = "BOB") => new Intl.NumberFormat("es-BO", { style: "currency", currency }).format(amount / 100);
  const products = () => Array.isArray(store.items) ? store.items : [];
  const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));
  const price = (p) => {
    const now = Date.now();
    const active = p.discountPercent > 0 && (!p.discountStartsAt || Date.parse(p.discountStartsAt) <= now) && (!p.discountEndsAt || Date.parse(p.discountEndsAt) > now);
    return active ? Math.round(p.amount * (1 - p.discountPercent / 100)) : p.amount;
  };
  const safeUrl = (value) => { try { if (typeof value !== "string" || !value.trim()) return ""; const source = value.trim(); if (/^data:image\/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$/i.test(source)) return source; if (source.startsWith("blob:")) return source; const u = new URL(source, source.startsWith("assets/") ? document.baseURI : config.apiBaseUrl || location.href); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const hostedProduct = (id) => `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}/p/${encodeURIComponent(id)}${partnerCode ? "?partner=" + encodeURIComponent(partnerCode) : ""}`;
  // Only unambiguous, bounded option sets can be purchased inline. Legacy named
  // variants use one group; extras still need the hosted configuration flow.
  const optionGroupCache = new WeakMap();
  function optionGroups(p) {
    if (!p) return null;
    // Catalog refreshes replace product objects. Reuse their validated groups
    // while checking availability across all values and existing cart lines.
    if (!optionGroupCache.has(p)) optionGroupCache.set(p, buildOptionGroups(p));
    return optionGroupCache.get(p);
  }
  function buildOptionGroups(p) {
    const variants = p?.variants;
    if (p?.extras?.length || !Array.isArray(variants) || !variants.length || variants.length > 256 || variants.some(v => !v || typeof v !== 'object')) return null;
    const structured = variants.some(v => v.options?.length);
    const groups = [];
    const ids = new Set(), combinations = new Set();
    for (const variant of variants) {
      const options = structured ? variant.options : [{ name: 'Opción', value: variant.name }];
      if (!variant.id || ids.has(variant.id) || !Number.isSafeInteger(variant.amount) || variant.amount < 0 || !Array.isArray(options) || !options.length || options.length > 6) return null;
      ids.add(variant.id);
      if (options.some(o => typeof o?.name !== 'string' || !o.name.trim() || typeof o.value !== 'string' || !o.value.trim()) || new Set(options.map(o => o.name)).size !== options.length) return null;
      if (!groups.length) options.forEach(o => groups.push({ name: o.name, values: [] }));
      if (options.length !== groups.length || options.some((o, i) => o.name !== groups[i].name)) return null;
      const key = JSON.stringify(options.map(o => o.value));
      if (combinations.has(key)) return null;
      combinations.add(key);
      options.forEach((o, i) => { if (!groups[i].values.includes(o.value)) groups[i].values.push(o.value); });
    }
    return groups;
  }
  const variantValues = v => v.options?.length ? v.options.map(o => o.value) : [v.name];
  const lineKey = (id, variantId, cadence) => cadence ? JSON.stringify([id, variantId || '', null, cadence]) : variantId ? JSON.stringify([id, variantId]) : id;
  /* Subscriptions are offered only where checkout can record consent and create them: online payment. */
  const subscriptionsAvailable = () => store?.subscriptionsEnabled === true && store?.checkoutMode === 'payment';
  /* Memberships (spec 2026-10-09): chosen by period and joined on the trusted checkout origin, never added to the cart. */
  const MEMBERSHIP_LABEL = { 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
  const MEMBERSHIP_SUFFIX = { 1: '/ mes', 3: '/ 3 meses', 6: '/ 6 meses', 12: '/ año' };
  const isMembership = p => p?.fulfillmentType === 'MEMBERSHIP' && Array.isArray(p.membershipPeriods) && p.membershipPeriods.length > 0;
  const cheapestPeriod = p => p.membershipPeriods.reduce((best, period) => (period.amount < best.amount ? period : best));
  const membershipJoinUrl = (p, periodId) => { try { return new URL(`/cuenta/${encodeURIComponent(config.slug)}/unirme?producto=${encodeURIComponent(p.id)}&periodo=${encodeURIComponent(periodId)}`, config.checkoutOrigin).href; } catch { return ''; } };
  const membershipPriceText = p => { const period = cheapestPeriod(p); return `Desde ${money(period.amount, p.currency)} ${MEMBERSHIP_SUFFIX[period.months] || ''}`.trim(); };
  function membershipMarkup(p) {
    const first = p.membershipPeriods[0];
    const join = membershipJoinUrl(p, first.id);
    return `<fieldset class="product-detail__membership" data-membership-choice><legend>Elige tu período</legend>${p.membershipPeriods.map((period, index) => `<label><input type="radio" name="membershipPeriod" value="${escape(period.id)}"${index ? '' : ' checked'}><span>${escape(MEMBERSHIP_LABEL[period.months] || `Cada ${period.months} meses`)}</span><strong>${money(period.amount, p.currency)}</strong></label>`).join('')}</fieldset>`
      + (preview || config.demo || !join ? '<button class="product-detail__buy checkout-button" disabled>Hacerme miembro</button>' : `<a class="product-detail__buy checkout-button" data-membership-join href="${escape(join)}">Hacerme miembro</a>`)
      + '<p class="product-detail__membership-note">Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.</p>';
  }
  const CADENCE_TEXT = { WEEKLY: 'cada semana', BIWEEKLY: 'cada dos semanas', MONTHLY: 'cada mes' };
  const CADENCE_CONFLICT = 'Por ahora solo puedes suscribirte a una frecuencia por pedido. Separa las frecuencias en pedidos distintos.';
  const offerFor = (p, cadence) => subscriptionsAvailable() && p?.fulfillmentType !== 'DIGITAL' ? (p?.subscriptionOptions || []).find(o => o.cadence === cadence) : undefined;
  /* Same rule as the API: min(one-time price, base - discount). */
  const subscriptionPrice = (p, variant, cadence) => {
    const offer = offerFor(p, cadence), base = variant ? variant.amount : p.amount, oneTime = price(variant ? { ...p, amount: variant.amount } : p);
    return offer ? Math.min(oneTime, Math.round(base * (100 - offer.discountPercent) / 100)) : oneTime;
  };
  /* What the subscriber keeps paying: the discounted base, ignoring any scheduled one-time sale. */
  const subscriptionRecurringPrice = (p, variant, cadence) => {
    const offer = offerFor(p, cadence), base = variant ? variant.amount : p.amount;
    return offer ? Math.round(base * (100 - offer.discountPercent) / 100) : subscriptionPrice(p, variant, cadence);
  };
  /* "Bs 30 hoy, luego Bs 45 / cada mes" when a sale makes the first order cheaper than the locked price; else "Bs 45 cada mes". */
  const subscriptionPriceNote = (p, variant, cadence) => {
    const today = subscriptionPrice(p, variant, cadence), later = subscriptionRecurringPrice(p, variant, cadence);
    return today === later ? `${money(today, p.currency)} ${CADENCE_TEXT[cadence]}` : `${money(today, p.currency)} hoy, luego ${money(later, p.currency)} / ${CADENCE_TEXT[cadence]}`;
  };
  const keyCadence = key => { try { const parsed = JSON.parse(key); return Array.isArray(parsed) ? parsed[3] : undefined; } catch { return undefined; } };
  /* The API takes one frequency per order: the message to show when `cadence` differs from one already in the cart. */
  const cadenceConflict = cadence => cadence && [...cart.keys()].some(key => { const existing = keyCadence(key); return existing && existing !== cadence; }) ? CADENCE_CONFLICT : '';
  const consentText = cadence => `Acepto que este pedido se repita ${CADENCE_TEXT[cadence]}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
  const subscriptionLineInCart = () => [...cart.keys()].map(cartLine).find(line => line?.cadence);
  /* A box: one "choose N" group the shopper fills, repeats allowed (6 cookies, 2 of them Matcha).
   * Any other kind of extra still needs the hosted configuration page. */
  function boxGroup(p) {
    const extras = Array.isArray(p?.extras) ? p.extras : [], count = extras[0]?.pickCount;
    if (!extras.length || p.variants?.length || !Number.isInteger(count) || count < 1 || count > 24) return null;
    if (extras.some(e => !e || typeof e.id !== 'string' || typeof e.name !== 'string' || e.pickCount !== count || e.groupName !== extras[0].groupName || e.required || !Number.isSafeInteger(e.amount) || e.amount < 0)) return null;
    return { name: extras[0].groupName || 'Elige', count, extras };
  }
  const boxKey = (id, picks) => JSON.stringify([id, '', [...picks].sort()]);
  const pickedExtras = (group, picks) => group.extras.flatMap(e => Array(picks.filter(id => id === e.id).length).fill(e));
  function pickLabel(extras) {
    const counts = new Map();
    for (const e of extras) counts.set(e.id, { name: e.name, count: (counts.get(e.id)?.count || 0) + 1 });
    return [...counts.values()].map(pick => pick.count > 1 ? `${pick.name} ×${pick.count}` : pick.name).join(' · ');
  }
  function cartLine(key) {
    let p = products().find(p => p.id === key), variant, picks;
    if (!p) {
      try {
        const [id, variantId, keyPicks, cadence] = JSON.parse(key);
        p = products().find(p => p.id === id);
        if (cadence) {
          variant = variantId ? p?.variants?.find(v => v.id === variantId) : undefined;
          if (!p || !offerFor(p, cadence) || p.extras?.length || (variantId && !variant) || (p.variants?.length && (!variant || !optionGroups(p)))) return null;
          return { p, variant, cadence, name: `${variant ? `${p.name} · ${variant.name}` : p.name} · ${CADENCE_TEXT[cadence]}`, amount: subscriptionPrice(p, variant, cadence) };
        }
        if (Array.isArray(keyPicks)) picks = keyPicks; else variant = p?.variants?.find(v => v.id === variantId);
      } catch {}
      if (!variant && !picks) return null;
    }
    if (isMembership(p)) return null;
    if (picks) {
      const group = boxGroup(p);
      if (!group || picks.length !== group.count || picks.some(id => !group.extras.some(e => e.id === id && e.available !== false))) return null;
      const extras = pickedExtras(group, picks);
      return { p, picks: extras.map(e => e.id), extras, name: `${p.name} · ${pickLabel(extras)}`, amount: price(p) + extras.reduce((sum, e) => sum + e.amount, 0) };
    }
    if (!p || p.extras?.length || (p.variants?.length && (!variant || !optionGroups(p)))) return null;
    return { p, variant, name: variant ? `${p.name} · ${variant.name}` : p.name, amount: price(variant ? { ...p, amount: variant.amount } : p) };
  }
  /* Units of a product already in the cart: its own lines plus every box pick that stands for it. */
  function usedUnits(productId) {
    let units = 0;
    for (const [key, count] of cart) {
      const line = cartLine(key);
      if (!line) continue;
      if (line.p.id === productId) units += count;
      for (const e of line.extras || []) if (e.productId === productId) units += count;
    }
    return units;
  }
  function remaining(p, variant, picks) {
    const variantUnits = variant ? [...cart].reduce((sum, [key, count]) => { const line = cartLine(key); return line?.variant?.id === variant.id && line.p.id === p.id ? sum + count : sum; }, 0) : 0;
    let left = Math.max(0, Math.min(limit(p) - usedUnits(p.id), variant ? limit(variant) - variantUnits : 99));
    const group = picks && boxGroup(p);
    for (const e of group ? group.extras : []) {
      const per = picks.filter(id => id === e.id).length, linked = e.productId && products().find(item => item.id === e.productId);
      if (per && linked) left = Math.min(left, Math.floor(Math.max(0, limit(linked) - usedUnits(linked.id)) / per));
    }
    return left;
  }
  function cartValue() { return [...cart].reduce((sum, [key, quantity]) => { const line = cartLine(key); return sum + (line?.amount || 0) * quantity; }, 0); }
  function cartCurrency() { for (const [key] of cart) { const line = cartLine(key); if (line?.p?.currency) return line.p.currency; } return selectedProduct?.currency || 'BOB'; }
  const cartItems = () => [...cart].flatMap(([key, quantity]) => {
    const line = cartLine(key);
    return line ? [{ id: line.p.id, ...(line.variant ? { variantId: line.variant.id } : {}), ...(line.picks ? { extraIds: line.picks } : {}), ...(line.cadence ? { subscriptionCadence: line.cadence } : {}), quantity }] : [];
  });
  const checkoutItems = () => cartItems().map(({ id, ...item }) => ({ paymentLinkId: id, ...item }));
  function message(text) {
    document.querySelectorAll("[data-pagosya-status]").forEach((el) => { el.textContent = text; });
    // Keep feedback beside the payment action on long mobile checkout pages.
    // The existing live region announces it; this copy remains ordinary text.
    document.querySelectorAll('[data-pagosya-checkout-status]').forEach(el => { el.textContent = text; el.hidden = !text; });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-article-url],[data-membership-join]');
    // Only the account app on the checkout origin is outside the store; the store's own account pages navigate as usual.
    if (link && hosted && /^https?:/i.test(link.getAttribute('href') || '')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:source-external', url: link.href }, '*'); }
  });
  const cartKey = `pagosya:cart:${config.slug || 'store'}`;
  function restoreCart(items) {
    if (!Array.isArray(items)) return;
    cart.clear();
    for (const item of items.slice(0, 100)) {
      const p = products().find(p => p.id === item?.id);
      const key = item?.subscriptionCadence ? Array.isArray(item.extraIds) ? '' : lineKey(item.id, item.variantId, item.subscriptionCadence) : Array.isArray(item?.extraIds) ? boxKey(item.id, item.extraIds) : lineKey(item?.id, item?.variantId), line = cartLine(key);
      // Lines with a cadence need subscriptions to still be on and a single frequency in the cart.
      if (p && line && !cart.has(key) && !cadenceConflict(line.cadence) && Number.isInteger(item.quantity) && item.quantity > 0) {
        const quantity = Math.min(item.quantity, remaining(p, line.variant, line.picks));
        if (quantity > 0) cart.set(key, quantity);
      }
    }
  }
  if (preview || hosted) restoreCart(window.PAGOSYA_PREVIEW_CART);
  // The Studio opens checkout.html with an empty cart (Boceto's Pedido tab, the page picker); one
  // simple product seeds the order so the merchant reviews a real checkout, never an empty state.
  if (preview && !cart.size && document.querySelector('[data-pagosya-checkout-page]')) {
    const simple = products().find(p => !p.variants?.length && !p.extras?.length && !boxGroup(p) && limit(p) > 0);
    if (simple) restoreCart([{ id: simple.id, quantity: 1 }]);
  }
  if (!preview && !hosted) {
    try { restoreCart(JSON.parse((config.demo ? sessionStorage : localStorage).getItem(cartKey) || "[]")); } catch { /* Storage can be unavailable. */ }
    window.addEventListener("storage", event => {
      if (event.key !== cartKey || checkingOut) return;
      try { restoreCart(JSON.parse(event.newValue || "[]")); renderCart(); } catch { /* Ignore invalid stored state. */ }
    });
  }
  let lastHostedCart = JSON.stringify(cartItems()), pendingHostedCart, cartChangedTimer;
  function flushHostedCart() {
    clearTimeout(cartChangedTimer);
    if (!pendingHostedCart) return;
    parent.postMessage({ type: 'pagosya:cart-changed', items: pendingHostedCart }, '*');
    pendingHostedCart = undefined;
  }
  function notifyHostedCart() {
    const items = cartItems(), value = JSON.stringify(items);
    if (value === lastHostedCart) return;
    const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 64;
    if (items.length > 100 || items.some(item => !validId(item.id) || (item.variantId !== undefined && !validId(item.variantId)) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999 || (item.extraIds !== undefined && (!Array.isArray(item.extraIds) || item.extraIds.length > 100 || ![...item.extraIds].every(validId))))) {
      clearTimeout(cartChangedTimer); pendingHostedCart = undefined; return;
    }
    lastHostedCart = value;
    pendingHostedCart = items.map(({ extraIds, ...item }) => ({ ...item, ...(extraIds !== undefined ? { extras: extraIds } : {}) }));
    clearTimeout(cartChangedTimer);
    cartChangedTimer = setTimeout(flushHostedCart, 150);
  }
  if (hosted) window.addEventListener('pagehide', flushHostedCart);
  document.addEventListener("pagosya:serialize-cart", event => {
    if (event.detail && typeof event.detail === "object") event.detail.items = cartItems();
  });
  document.addEventListener("pagosya:restore-cart", event => { restoreCart(event.detail?.items); renderCart(); });
  const variantPhotos = v => (Array.isArray(v?.imageUrls) && v.imageUrls.length ? v.imageUrls : [v?.imageUrl]).map(safeUrl).filter(Boolean);
  const galleryImages = (p) => {
    const sources = [
      ...(Array.isArray(p?.imageUrls) ? p.imageUrls : []),
      ...(typeof p?.imageUrl === "string" ? [p.imageUrl] : []),
      ...(Array.isArray(p?.variants) ? p.variants.flatMap(variantPhotos) : []),
    ];
    return [...new Set(sources.map(safeUrl).filter(Boolean))];
  };
  const imagePosition = (p, url) => {
    const index = (Array.isArray(p.imageUrls) ? p.imageUrls : []).findIndex(value => safeUrl(value) === url);
    const value = index >= 0 ? p.imagePositions?.[index] : null;
    return typeof value === 'string' && /^(?:100|[0-9]{1,2})(?:\.\d+)?% (?:100|[0-9]{1,2})(?:\.\d+)?%$/.test(value) ? value : '50% 50%';
  };
  const detailStyle = document.createElement("style");
  detailStyle.dataset.pagosyaKit = 'product';
  // Cascade order (sub-project 5 review): kit defaults < the store's DNA < the store's own CSS, which is unlayered
  // and therefore wins over both. The contact base sits under the DNA so the DNA button form reaches its submit.
  detailStyle.textContent = `
    @layer pagosya-commerce, pagosya-contact-base, pagosya-dna;
    .menu-item__badge{position:absolute;top:10px;left:10px;z-index:2;max-width:calc(100% - 20px);padding:4px 10px;border-radius:999px;background:var(--store-accent,var(--brand-accent,var(--accent,#111)));color:var(--store-accent-foreground,var(--brand-accent-foreground,#fff));font-size:12px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    .menu-item{position:relative}.menu-item:not([data-custom-product]) .menu-item__details{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:inherit;background:transparent;box-shadow:none;cursor:pointer;color:inherit}
    .menu-item .menu-item__details:focus-visible{outline:3px solid currentColor;outline-offset:-4px}.menu-item:not([data-custom-product]) .menu-add{position:relative;inset:auto;z-index:2}
    [data-pagosya-categories][hidden],[data-product-field][hidden],[data-product-media][hidden],[data-product-link][hidden],[data-pagosya-cart][hidden]{display:none!important}
    [data-cart-slot][hidden],[data-cart-field][hidden],[data-added-field][hidden]{display:none!important}
    [data-pagosya-status]:empty{width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;box-shadow:none!important}
    /* Default catalog cards: framed photos and a photo grid when the store's CSS leaves them unstyled. Authored rules still win. */
    @layer pagosya-commerce {
      .menu-item:not([data-custom-product]) button.menu-add[data-product]{width:auto;height:auto;min-width:44px;min-height:44px;padding:10px 14px;border-radius:var(--store-radius,var(--brand-radius,0px));font:inherit}
      .menu-item:not([data-custom-product]) .menu-item__image{display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover}
      [data-pagosya-catalog][data-pagosya-grid],[data-pagosya-catalog] .catalog-group__items{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr));gap:16px;align-items:stretch}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]),[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]){display:flex;flex-direction:column;gap:8px}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy :is(h3,p),[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy :is(h3,p){margin:0}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy p,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy p{margin-top:2px;opacity:.8}
      /* A card's size never depends on its copy: descriptions stop at a fixed line count and price and action sit on the card's bottom edge, so a row of cards stays even. */
      .menu-item:not([data-custom-product]) .menu-item__copy p,.menu-item[data-custom-product] .menu-item__description{display:-webkit-box;-webkit-line-clamp:var(--pagosya-description-lines,2);line-clamp:var(--pagosya-description-lines,2);-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-item__copy,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-item__copy{flex:1 1 auto}
      [data-pagosya-grid]>.menu-item:not([data-custom-product]) .menu-add,[data-pagosya-catalog] .catalog-group__items>.menu-item:not([data-custom-product]) .menu-add{align-self:flex-start}
      /* Arrangement chrome: group headings, the "see all" link, and the collection tab row. */
      [data-pagosya-catalog] .catalog-group__title{margin:24px 0 12px;font-family:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));font-size:1.05rem}
      [data-pagosya-catalog] .catalog-group:first-child .catalog-group__title{margin-top:0}
      [data-pagosya-catalog] .catalog-more{display:inline-block;padding:12px 0;text-decoration:underline}
      [data-pagosya-catalog] .catalog-tabs{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 16px}
      [data-pagosya-catalog] .catalog-tabs a[aria-current="page"]{text-decoration:none}
    }
    /* Product page: shared commerce DOM; style selects a presentation and stores supply tokens. */
    [data-pagosya-product]{--pd-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#302c2a)));--pd-paper:var(--store-background,var(--brand-background,var(--paper,#fffdfb)));--pd-surface:var(--store-surface,var(--brand-surface,var(--pd-paper)));--pd-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--pd-ink))));--pd-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--pd-paper)));--pd-muted:color-mix(in srgb,var(--pd-ink) 64%,var(--pd-paper));--pd-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--pd-ink) 16%,var(--pd-paper))));--pd-tint:color-mix(in srgb,var(--pd-accent) 7%,var(--pd-paper));--pd-alert:var(--store-danger,var(--brand-danger,#b3261e));--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px);--pd-heading:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));--pd-body:var(--store-body-font,var(--brand-body-font,var(--font-body,inherit)));box-sizing:border-box;color:var(--pd-ink);background:var(--pd-paper);font-family:var(--pd-body)}
    [data-pagosya-product] *{box-sizing:border-box}
    [data-pagosya-product] [hidden]{display:none!important}
    dialog[data-pagosya-product]{width:min(1040px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--pd-line);border-radius:var(--pd-radius);box-shadow:0 16px 64px #0003;overflow:auto;overscroll-behavior:contain}
    dialog[data-pagosya-product]::backdrop{background:#0009}
    [data-pagosya-product][data-pagosya-product-page]{display:block;width:100%;max-width:1440px;max-height:none;margin:0 auto;padding:0;border:0;border-radius:0;box-shadow:none;overflow:visible}
    [data-pagosya-product][data-style] :is(button,a){font:inherit;cursor:pointer}
    [data-pagosya-product][data-style] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] :is(button,a,[tabindex]):focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__close{position:sticky;top:12px;z-index:3;display:grid;place-items:center;width:44px;height:44px;margin:12px 12px -56px auto;padding:0;border:1px solid var(--pd-line);border-radius:50%;background:var(--pd-paper);color:inherit;font-size:26px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);align-items:start}
    /* dna.media=right mirrors the ficha on desktop: copy first, gallery second. story-led is a single
     * column and mobile stacks photo-first, so both keep their order. */
    @media(min-width:900px){
      :root[data-dna-media=right] [data-pagosya-product][data-style]:not([data-style=story-led]) .product-detail__layout:not([data-no-images])>.product-detail__gallery{order:2}
      :root[data-dna-media=right] [data-pagosya-product][data-style]:not([data-style=story-led]) .product-detail__layout:not([data-no-images])>.product-detail__copy{order:1}
    }
    [data-pagosya-product][data-style] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)}
    /* Gallery: the photo fills its column; dense pages overlay thumbnails and a plain counter, editorial pages use dots. */
    [data-pagosya-product][data-style] .product-detail__gallery{position:relative;min-width:0;margin:0;padding:0;border-radius:0;background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__decor{display:none}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:sticky;top:0}
    [data-pagosya-product][data-style] .product-detail__stage{position:relative;min-width:0}
    [data-pagosya-product] .product-detail__badge{position:absolute;top:14px;left:14px;z-index:2;max-width:calc(100% - 28px);padding:6px 12px;border-radius:999px;background:var(--pd-accent,#111);color:var(--pd-on-accent,#fff);font-size:13px;font-weight:600;line-height:1.2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    [data-pagosya-product][data-style] .product-detail__photo{display:block;width:100%;height:min(calc(100dvh - 64px),760px);min-height:420px;max-height:none;margin:0;object-fit:cover;border:0;border-radius:0;background:var(--pd-tint);touch-action:pan-y}
    dialog[data-pagosya-product][data-style] .product-detail__photo{height:min(calc(100dvh - 34px),640px);min-height:360px}
    [data-pagosya-product][data-style] .product-detail__navigation{position:absolute;right:16px;bottom:22px;display:flex;align-items:center;gap:8px;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;font-size:12px;font-variant-numeric:tabular-nums;color:var(--pd-ink);text-shadow:0 0 8px var(--pd-paper)}
    [data-pagosya-product][data-style] .product-detail__navigation span{order:-1}
    [data-pagosya-product][data-style] .product-detail__navigation button{display:grid;place-items:center;width:36px;height:36px;min-height:0;padding:0;border:1px solid color-mix(in srgb,var(--pd-ink) 35%,transparent);border-radius:50%;background:color-mix(in srgb,var(--pd-paper) 72%,transparent);color:inherit;font-size:15px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__thumbnails{position:absolute;left:16px;bottom:16px;display:flex;gap:6px;max-width:calc(100% - 170px);margin:0;padding:5px;overflow-x:auto;border-radius:calc(var(--pd-radius) + 3px);background:color-mix(in srgb,var(--pd-paper) 84%,transparent)}
    [data-pagosya-product][data-style] .product-detail__thumbnails button{flex:0 0 56px;width:56px;height:56px;padding:0;border:0;border-radius:var(--pd-radius);overflow:hidden;background:var(--pd-tint);outline:1px solid color-mix(in srgb,var(--pd-ink) 12%,transparent);outline-offset:0}
    [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{outline:2px solid var(--pd-ink);outline-offset:1px}
    [data-pagosya-product][data-style] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
    [data-pagosya-product][data-style=editorial] .product-detail__navigation{display:none}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button,[data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails img{display:none}
    /* Desktop product pages show every photo, so a styled scene is seen without guessing that dots can be clicked; phones keep swipe and dots. */
    @media(min-width:900px){
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail]{background:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__photo{height:min(calc(100dvh - 148px),676px)}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails{position:static;display:flex;gap:10px;max-width:none;margin:0;padding:12px 0 0;overflow-x:auto;background:none;transform:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button{display:block;flex:0 0 72px;width:72px;height:72px;padding:0;border-radius:var(--pd-radius);overflow:hidden;background:var(--pd-tint);outline:1px solid color-mix(in srgb,var(--pd-ink) 10%,transparent);outline-offset:0;opacity:.72;transition:opacity .2s}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button:hover{opacity:1}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button[aria-pressed=true]{opacity:1;outline:1.5px solid var(--pd-ink);outline-offset:2px}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails button::before{content:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy:not([data-split]){padding:0 0 0 clamp(40px,4.4vw,72px)}
    }
    [data-pagosya-product][data-style] .product-detail__empty{display:grid;min-height:220px;place-items:center;color:inherit}
    [data-pagosya-product][data-style] .product-detail__blocks{display:grid;gap:24px;padding:24px;color:var(--pd-ink);background:var(--pd-paper)}
    [data-pagosya-product][data-style] .product-detail__block{min-width:0;margin:0;padding:16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__block [data-part=block-media]{display:block;width:100%;height:auto;border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] .product-detail__block :is(figcaption,h3){margin:12px 0;line-height:1.5;color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__compare{position:relative;isolation:isolate;overflow:hidden;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .pd-compare__before{display:block;width:100%;height:auto}
    [data-pagosya-product][data-style] .pd-compare__after{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;clip-path:inset(0 0 0 var(--pd-compare))}
    [data-pagosya-product][data-style] .pd-compare__label{position:absolute;bottom:8px;max-width:45%;padding:4px 8px;background:var(--pd-paper);color:var(--pd-ink);border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] .pd-compare__label--before{left:8px}
    [data-pagosya-product][data-style] .pd-compare__label--after{right:8px}
    [data-pagosya-product][data-style] .pd-compare__range{display:block;width:100%;min-height:44px;margin:8px 0 0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .pd-compare__range:focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    /* Purchase column */
    [data-pagosya-product][data-style] .product-detail__copy{align-self:start;min-width:0;width:100%;max-width:620px;margin:0;padding:clamp(28px,4vw,56px)}
    dialog[data-pagosya-product][data-style] .product-detail__copy{padding:44px 32px 28px}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{max-width:1200px;margin:0 auto}
    @media(min-width:900px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto 1fr;column-gap:clamp(40px,6vw,96px);align-items:start}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__summary{grid-column:1;grid-row:1}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__details{grid-column:1;grid-row:2}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px;padding:clamp(20px,2.4vw,32px);border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    }
    [data-pagosya-product][data-style] .product-detail__breadcrumb{display:flex;flex-wrap:nowrap;min-width:0;align-items:center;gap:4px 10px;margin:0 0 18px;font-size:12px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__breadcrumb a{display:inline-flex;align-items:center;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__breadcrumb>span:last-child{min-width:0;max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__eyebrow{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] #pagosya-product-title{margin:0 0 12px;font-family:var(--pd-heading);font-size:clamp(32px,3.4vw,46px);font-weight:380;line-height:1.18;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=editorial] #pagosya-product-title[data-length=long]{font-size:clamp(28px,2.7vw,38px)}
    [data-pagosya-product][data-style=dense] #pagosya-product-title{margin-bottom:10px;font-family:var(--pd-body);font-size:clamp(24px,2.3vw,30px);font-weight:650;line-height:1.12;letter-spacing:-.025em}
    [data-pagosya-product][data-style=dense] #pagosya-product-title[data-length=long]{font-size:clamp(22px,2vw,26px)}
    [data-pagosya-product][data-style] .product-detail__rating{display:flex;align-items:center;gap:8px;margin:-2px 0 12px;font-size:13px}
    [data-pagosya-product][data-style] .product-detail__rating a{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__stars{--rating:0;display:inline-block;letter-spacing:1px;line-height:1;background:linear-gradient(90deg,var(--pd-accent) calc(var(--rating) * 20%),color-mix(in srgb,var(--pd-ink) 22%,transparent) 0);-webkit-background-clip:text;background-clip:text;color:transparent}
    [data-pagosya-product][data-style] .product-detail__pricing{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin:0 0 14px}
    [data-pagosya-product][data-style] .product-detail__price{margin:0;font-size:17px;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__original{font-size:.9em;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__saving{padding:3px 7px;border-radius:var(--pd-radius);background:var(--pd-tint);color:var(--pd-accent);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    [data-pagosya-product][data-style=dense] .product-detail__pricing{padding-bottom:14px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__price{font-size:30px;font-weight:700;letter-spacing:-.03em}
    [data-pagosya-product][data-style=dense] .product-detail__original{font-size:16px}
    [data-pagosya-product][data-style] .product-detail__intro{max-width:52ch;margin:0 0 20px;font-size:14.5px;line-height:1.6;color:var(--pd-muted);white-space:pre-line;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__intro{margin:12px 0 14px}
    [data-pagosya-product][data-style] .product-detail__chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__chips li{padding:5px 8px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    [data-pagosya-product][data-style] :is(.product-detail__sr,.product-detail__review-score){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    /* Choices: pills by default, swatch circles for colors, radio rows for priced dense choices. */
    [data-pagosya-product][data-style] .product-detail__options{display:grid;gap:18px;margin:0 0 20px;padding:18px 0 0;border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__options{padding-top:4px;border-top:0}
    [data-pagosya-product][data-style] .product-detail__options fieldset{min-width:0;margin:0;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__options legend{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__options legend{font-size:12.5px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style] [data-product-selection]{font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style] [data-product-option]{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:40px;max-width:100%;padding:8px 16px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:13.5px;line-height:1.2;overflow-wrap:anywhere;transition:border-color .15s,box-shadow .15s}
    [data-pagosya-product][data-style=dense] [data-product-option]{border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] [data-product-option]:hover:not(:disabled){border-color:color-mix(in srgb,var(--pd-ink) 55%,var(--pd-paper))}
    [data-pagosya-product][data-style] [data-product-option][aria-pressed=true]{border-color:var(--pd-ink);box-shadow:inset 0 0 0 1px var(--pd-ink)}
    [data-pagosya-product][data-style] [data-product-option]:disabled{opacity:.45;text-decoration:line-through}
    [data-pagosya-product][data-style] [data-product-option][data-option-delta]::after{content:attr(data-option-delta);color:var(--pd-muted);font-size:.85em;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__values[data-kind=swatch]{gap:14px}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option],[data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{flex-direction:column;gap:6px;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__swatch{display:block;width:22px;height:22px;flex:0 0 auto;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}
    [data-pagosya-product][data-style] [data-kind=swatch] .product-detail__swatch{width:34px;height:34px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__swatch{width:28px;height:28px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    [data-pagosya-product][data-style] [data-kind=swatch] [aria-pressed=true] .product-detail__swatch{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__values[data-priced]:not([data-kind=swatch]){display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;justify-content:stretch;gap:12px;width:100%;min-height:48px;padding:10px 14px;background:var(--pd-surface);font-size:14px;text-align:left}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]::before{content:"";width:16px;height:16px;border:1.5px solid color-mix(in srgb,var(--pd-ink) 45%,var(--pd-paper));border-radius:50%}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][aria-pressed=true]::before{border:5px solid var(--pd-ink)}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][data-option-price]::after{content:attr(data-option-price);font-size:14px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]:disabled::after{text-decoration:line-through}
    /* Compra única vs. suscripción: a grouped card between the options and the purchase row. The
     * runtime only renders it when the product carries cadences, so these rules idle otherwise.
     * flow-root, not grid: a rendered legend never joins grid flow, so it would straddle the border.
     * The legend floats full-width to sit inside the card, and the rest clears it. Spacing is on
     * margin-top so the two notes, which the runtime hides until they apply, leave no gap behind. */
    [data-pagosya-product][data-style] .product-detail__membership{display:grid;gap:8px;min-width:0;margin:0 0 18px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__membership legend{padding:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__membership label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;font-size:15px;cursor:pointer}
    [data-pagosya-product][data-style] .product-detail__membership label strong{margin-left:auto;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__membership input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .product-detail__membership-note{margin:10px 0 0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subscription{display:flow-root;min-width:0;margin:0 0 18px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__subscription>:not(legend){clear:both}
    [data-pagosya-product][data-style] .product-detail__subscription legend{float:left;width:100%;margin:0 0 10px;padding:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subscription label{display:flex;align-items:center;gap:10px;min-height:44px;margin:0;font-size:15px;cursor:pointer}
    [data-pagosya-product][data-style] .product-detail__subscription input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pd-accent)}
    [data-pagosya-product][data-style] .product-detail__subscription select{width:100%;min-height:44px;margin:8px 0 0;padding:10px 12px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-paper);color:inherit;font:inherit}
    [data-pagosya-product][data-style] .product-detail__subscription select:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] .product-detail__subscription-price{margin:12px 0 0;font-size:15px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subscription-conflict{margin:8px 0 0;font-size:14px;line-height:1.5;color:var(--pd-alert)}
    [data-pagosya-product][data-style] .product-detail__subscription p:not([class]){margin:10px 0 0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style=dense] .product-detail__subscription{padding:0;border:0;border-radius:0;background:none}
    /* Quantity and action share one row; the live total rides on the dense action. */
    [data-pagosya-product][data-style] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch;gap:10px;margin:22px 0 12px}
    [data-pagosya-product][data-style] .product-detail__quantity{display:flex;align-items:center;justify-content:space-between;min-width:118px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);overflow:hidden}
    [data-pagosya-product][data-style] .product-detail__quantity button{width:40px;min-height:46px;padding:0;border:0;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__quantity output{min-width:24px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subtotal{grid-column:1 / -1;grid-row:2;font-size:13px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subtotal:empty{display:none}
    [data-pagosya-product][data-style] .product-detail__buy{display:flex;align-items:center;justify-content:center;gap:0;width:100%;min-height:48px;margin:0;padding:12px 20px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:filter .15s}
    [data-pagosya-product][data-style] .product-detail__buy:hover:not(:disabled){filter:brightness(.92)}
    [data-pagosya-product][data-style] .product-detail__buy-total{white-space:nowrap;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style=editorial] .product-detail__buy-total{display:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy{min-height:50px;font-size:15px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 8px}
    /* Narrow phones keep the action on one line; the price above already shows the total. */
    @media(max-width:480px){[data-pagosya-product][data-style=dense] .product-detail__buy-total{display:none}}
    [data-pagosya-product][data-style] .product-detail__status{min-height:20px;margin:0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px 18px;margin:14px 0 0;padding:12px 14px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);list-style:none}
    [data-pagosya-product][data-style=dense] .product-detail__assurances{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));margin-top:16px;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__assurances li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.4}
    [data-pagosya-product][data-style] .product-detail__assurances svg{flex:0 0 20px;color:var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__assurances svg{flex-basis:24px;width:24px;height:24px}
    [data-pagosya-product][data-style] .product-detail__assurances strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__assurances span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__assurances button{display:flex;align-items:center;gap:10px;min-height:40px;margin:0;padding:0;border:0;background:transparent;color:inherit;font-size:inherit;text-align:left}
    [data-pagosya-product][data-style] .product-detail__assurances button strong{text-decoration:underline;text-decoration-color:var(--pd-line);text-underline-offset:4px}
    /* Details, related products and verified reviews use only published catalog data. */
    [data-pagosya-product][data-style] .product-tabs{display:flex;gap:24px;margin:28px 0 16px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-tabs button{min-height:44px;margin:0 0 -1px;padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style] .product-tabs button[aria-selected=true]{border-bottom-color:var(--pd-ink);color:var(--pd-ink)}
    [data-pagosya-product][data-style] [role=tabpanel]{font-size:14px;line-height:1.6}
    [data-pagosya-product][data-style] .product-delivery-list{margin:0 0 12px;padding-left:18px;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-delivery-list li{margin-bottom:14px}
    [data-pagosya-product][data-style] .product-detail__specs{margin:0 0 16px;padding:0}
    [data-pagosya-product][data-style] .product-detail__specs div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__specs dt{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__specs dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__facts{margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__facts li{padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__fact{display:flex;justify-content:space-between;gap:16px}
    [data-pagosya-product][data-style] .product-detail__fact span:first-child{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__fact span:last-child{text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews):not([hidden]){display:grid;gap:20px;margin:clamp(40px,6vw,72px) clamp(16px,4vw,56px) 0;padding-top:clamp(24px,4vw,40px);border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews) h2{margin:0;font-family:var(--pd-heading);font-size:clamp(22px,2.4vw,28px);font-weight:400;line-height:1.2}
    [data-pagosya-product][data-style] .product-detail__related ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr));gap:20px 16px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__related a{display:grid;gap:6px;color:inherit;text-decoration:none}
    [data-pagosya-product][data-style] .product-detail__related img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__related a:hover .product-detail__related-name{text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__box{margin:0 0 16px;padding:0;border:0;min-width:0}
    [data-pagosya-product][data-style] .product-detail__box legend{display:flex;gap:8px;align-items:baseline;margin:0 0 4px;font-weight:600}
    [data-pagosya-product][data-style] [data-box-progress]{font-weight:400;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__box-help{margin:0 0 10px;font-size:14px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__box ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__box li{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:12px;padding:8px;border:1px solid var(--pd-line);border-radius:12px}
    [data-pagosya-product][data-style] .product-detail__box li[data-unavailable]{opacity:.55}
    [data-pagosya-product][data-style] .product-detail__box img,[data-pagosya-product][data-style] .product-detail__box-photo{width:48px;height:48px;border-radius:8px;object-fit:cover;background:var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__box-name{display:grid;overflow-wrap:anywhere;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__box-name small{font-weight:400;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__box-stepper{display:inline-flex;align-items:center;gap:6px}
    [data-pagosya-product][data-style] .product-detail__box-stepper button{min-width:44px;min-height:44px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__box-stepper button:disabled{opacity:.4}
    [data-pagosya-product][data-style] .product-detail__box-stepper output{min-width:2ch;text-align:center;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__bundles{display:grid;gap:12px;margin:clamp(32px,5vw,56px) 0 0}
    [data-pagosya-product][data-style] .product-detail__bundles h2{margin:0;font-family:var(--pd-heading);font-size:clamp(20px,2.4vw,26px)}
    [data-pagosya-product][data-style] .product-detail__bundles article{display:grid;gap:8px;padding:16px;border:1px solid var(--pd-line);border-radius:12px}
    [data-pagosya-product][data-style] .product-detail__bundles h3{margin:0;font-size:16px}
    [data-pagosya-product][data-style] .product-detail__bundles p{margin:0;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__bundle-links{display:flex;flex-wrap:wrap;gap:6px 14px}
    [data-pagosya-product][data-style] .product-detail__bundle-links a{color:inherit;text-underline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__bundle-add{justify-self:start;min-height:44px}
    [data-pagosya-product][data-style] .product-detail__related-name{font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__related-price{font-size:14px;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__reviews-summary{display:flex;align-items:center;gap:10px;margin:0}
    [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}
    [data-pagosya-product][data-style] .product-detail__review-list article{padding:18px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    @media(min-width:900px){ :root[data-dna-review=split] [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:1fr 1fr;gap:12px} }
    :root[data-dna-review=ticket] [data-pagosya-product][data-style] .product-detail__review-list article{border-style:dashed;border-radius:2px}
    :root[data-dna-review=notebook] [data-pagosya-product][data-style] .product-detail__review-list article{border-width:0 0 1px;border-radius:0;background:transparent;padding:14px 2px}
    [data-pagosya-product][data-style] .product-detail__related-note{margin:-6px 0 14px;font-size:13px;opacity:.7}
    [data-pagosya-product][data-style] .product-detail__review-list p{margin:0;line-height:1.55;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__review-list .product-detail__review-meta{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:13px}
    [data-pagosya-product][data-style] :is(.product-detail__sticky,.product-detail__sticky-space){display:none}
    @media(max-width:899px){
      [data-pagosya-product][data-style] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:relative}
      [data-pagosya-product][data-style] .product-detail__photo,dialog[data-pagosya-product][data-style] .product-detail__photo{height:auto;min-height:0;max-height:72dvh;aspect-ratio:4/5}
      [data-pagosya-product][data-style] .product-detail__navigation{display:none}
      [data-pagosya-product][data-style] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
      [data-pagosya-product][data-style] .product-detail__thumbnails button,[data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
      [data-pagosya-product][data-style] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
      [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
      [data-pagosya-product][data-style] .product-detail__thumbnails img{display:none}
      [data-pagosya-product][data-style] .product-detail__copy,dialog[data-pagosya-product][data-style] .product-detail__copy{max-width:none;padding:22px 16px 28px}
    }
    @media(max-width:640px){
      [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--pd-line);background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 -6px 24px #0000001a}
      [data-pagosya-product][data-style] .product-detail__sticky>div{flex:1;min-width:0;font-size:13px;line-height:1.3}
      [data-pagosya-product][data-style] .product-detail__sticky strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-pagosya-product][data-style] .product-detail__sticky button{flex:0 0 auto;min-height:44px;padding:10px 18px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-weight:700}
      [data-pagosya-product][data-style] .product-detail__sticky-space:not([hidden]){display:block;height:72px}
    }
    /* Approved highlights: one small looping motion each, paused off screen and stopped for reduced motion. */
    [data-pagosya-product][data-style] .product-detail__highlights{display:grid;gap:12px 18px;margin:0 0 20px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__highlights li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.35}
    [data-pagosya-product][data-style] .product-detail__highlights strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-long{max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px)}
    [data-pagosya-product][data-style] .product-long>section{margin:clamp(48px,7vw,96px) 0}
    [data-pagosya-product][data-style] .product-long h2{margin:0 0 20px;font-family:var(--store-heading-font,inherit);font-size:clamp(26px,3.2vw,40px);line-height:1.1}
    [data-pagosya-product][data-style] .product-long__features ul{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-long__features li{display:grid;gap:6px;padding:20px;border:1px solid var(--store-border,rgba(0,0,0,.12));border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__features svg{width:32px;height:32px;color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__story{display:grid;gap:14px;max-width:760px;font-size:18px;line-height:1.55}
    [data-pagosya-product][data-style] .product-long__details{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
    [data-pagosya-product][data-style] .product-long__details img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__details figcaption{display:grid;gap:4px;margin-top:10px}
    [data-pagosya-product][data-style] .product-long__versus table{width:100%;border-collapse:collapse}
    [data-pagosya-product][data-style] .product-long__versus th,[data-pagosya-product][data-style] .product-long__versus td{padding:14px 12px;border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));text-align:center}
    [data-pagosya-product][data-style] .product-long__versus th[scope=row]{text-align:left;font-weight:500}
    [data-pagosya-product][data-style] .product-long__mark[data-yes=true]{color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__faq details{border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));padding:16px 0}
    [data-pagosya-product][data-style] .product-long__faq summary{cursor:pointer;font-weight:600}
    [data-pagosya-product][data-style] .product-long__buy{display:grid;justify-items:center;gap:8px;margin:clamp(32px,5vw,64px) 0;text-align:center}
    [data-pagosya-product][data-style] .product-long__buy .checkout-button{min-width:min(100%,360px)}
    [data-pagosya-product][data-style] .product-detail__highlights span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .pd-icon{flex:0 0 26px;width:26px;height:26px;overflow:visible;color:var(--pd-ink)}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights{grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr));gap:16px 10px;margin:0 0 22px;padding:18px 0;border-top:1px solid var(--pd-line);border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights li{flex-direction:column;gap:8px;text-align:center}
    [data-pagosya-product][data-style=editorial] .product-detail__highlights strong{font-size:10.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase}
    [data-pagosya-product][data-style=editorial] .pd-icon{flex-basis:28px;width:28px;height:28px}
    [data-pagosya-product][data-style=dense] .product-detail__highlights{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));margin:16px 0 0}
    /* Image-led: large uncropped photograph beside a compact purchase column.
       Story-led: an expansive photograph followed by a readable single-column product story.
       Both use the same controls, stock, variants and checkout as the established presentations. */
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{object-fit:contain}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails{position:static;max-width:100%;gap:10px;padding:12px 4px;margin:0;background:none;transform:none;border-radius:0}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button,[data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button[aria-pressed=true]{display:block;flex:0 0 64px;width:64px;height:64px;min-height:44px;border-radius:var(--pd-radius);background:var(--pd-tint);outline:1px solid var(--pd-line);outline-offset:-1px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button[aria-pressed=true]{outline:2px solid var(--pd-accent);outline-offset:-2px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails button::before{content:none}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:contain}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__navigation{display:none}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) [data-product-option]{min-height:44px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__buy{white-space:normal;flex-wrap:wrap;gap:4px 12px;padding-inline:16px;letter-spacing:.08em}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity{min-width:136px}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity button{width:44px}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__gallery{position:relative}
    [data-pagosya-product][data-style=story-led] .product-detail__thumbnails{justify-content:center}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy{width:100%;max-width:760px;margin-inline:auto;padding:clamp(28px,5vw,64px) 20px}
    [data-pagosya-product][data-style=story-led] .product-detail__intro{max-width:none;font-size:16px;line-height:1.75}
    [data-pagosya-product][data-style=story-led] .product-detail__highlights{padding-block:20px;border-block:1px solid var(--pd-line);grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
    @media(min-width:900px){
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr);gap:clamp(24px,3vw,48px)}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__copy:not([data-split]){padding:24px clamp(24px,3vw,48px) 24px 0;position:sticky;top:24px}
      [data-pagosya-product][data-style=image-led] .product-detail__photo{height:auto;aspect-ratio:4/5;min-height:0;max-height:none}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__photo{height:auto;aspect-ratio:16/9;min-height:0;max-height:56dvh}
      [data-pagosya-product][data-style=story-led] #pagosya-product-title{font-size:clamp(40px,4.5vw,60px)}
    }
    @media(max-width:899px){
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{height:auto;aspect-ratio:1/1;min-height:0;max-height:none}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy{padding:24px 16px 32px}
    }
    @media(max-width:480px){
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__purchase{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__quantity{justify-self:start;width:136px}
    }
    /* Structural product families: use the same live controls in different reading hierarchies. */
    [data-pagosya-product][data-style] .product-detail__summary,[data-pagosya-product][data-style] .product-detail__buybox,[data-pagosya-product][data-style] .product-detail__details{min-width:0}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__layout>.product-detail__summary{width:100%;max-width:1000px;padding:24px clamp(16px,4vw,56px);margin:0 auto;box-sizing:border-box}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy[data-story]{max-width:1200px;box-sizing:border-box}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox{padding:24px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox .product-detail__purchase{grid-template-columns:minmax(0,1fr)}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__buybox .product-detail__quantity{justify-self:start;width:136px}
    [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__photo{object-fit:contain;height:auto;min-height:0;aspect-ratio:1/1}
    @media(min-width:900px){
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:32px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]{padding:0;grid-template-columns:minmax(0,1fr);gap:24px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]>div{grid-column:auto;grid-row:auto;position:static}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__copy[data-split]{grid-template-columns:minmax(0,1fr) minmax(300px,.8fr);column-gap:48px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__buybox{grid-column:2;grid-row:1 / span 2}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout[data-no-images] .product-detail__details{grid-column:1}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy[data-story] .product-detail__details{grid-row:1 / span 2}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1.9fr) minmax(300px,1fr)}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout[data-no-images] #pagosya-product-title{font-size:clamp(40px,5vw,72px);line-height:1.1}
    }
    @media(min-width:1200px){
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1fr) minmax(0,1.8fr)}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split]{grid-template-columns:minmax(0,1fr) minmax(280px,1fr)}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px}
      [data-pagosya-product][data-style=dense][data-pagosya-product-page] .product-detail__copy[data-split] .product-detail__details{grid-column:1}
    }
    @media(max-width:899px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:flex;flex-direction:column;gap:24px;box-sizing:border-box}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]>div{width:100%;box-sizing:border-box}
    }
    @keyframes pd-roll{0%,100%{transform:translateX(-1.5px)}50%{transform:translateX(1.5px)}}
    @keyframes pd-drip{0%,55%{transform:translateY(0);opacity:1}75%{transform:translateY(2px);opacity:.55}100%{transform:translateY(0);opacity:1}}
    @keyframes pd-sweep{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
    @keyframes pd-spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    @keyframes pd-settle{0%,100%{transform:translateY(0)}50%{transform:translateY(1px)}}
    @keyframes pd-stream{0%,100%{transform:translateY(-1px);opacity:.75}50%{transform:translateY(1px);opacity:1}}
    @keyframes pd-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
    @keyframes pd-tick{0%,100%{transform:rotate(0)}50%{transform:rotate(10deg)}}
    @keyframes pd-flicker{0%,58%,68%,100%{opacity:1}62%{opacity:.45}}
    @keyframes pd-fill{0%,100%{opacity:.5;transform:scaleX(.6)}50%{opacity:1;transform:scaleX(1)}}
    @keyframes pd-nudge{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1px)}}
    @keyframes pd-pulse{0%,100%{opacity:.7}50%{opacity:1}}
    @keyframes pd-glow{0%,100%{opacity:.75}50%{opacity:1}}
    @keyframes pd-sway{0%,100%{transform:rotate(-3.5deg)}50%{transform:rotate(3.5deg)}}
    @keyframes pd-rays{0%,100%{transform:rotate(0);opacity:.8}50%{transform:rotate(12deg);opacity:1}}
    @keyframes pd-drum{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
    @keyframes pd-twinkle{0%,100%{opacity:.6;transform:scale(.92)}50%{opacity:1;transform:scale(1)}}
    @keyframes pd-wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
    @keyframes pd-snip{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
    @keyframes pd-steam{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(-2px);opacity:1}}
    @keyframes pd-tilt{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
    @keyframes pd-beat{0%,100%{transform:scale(1)}30%{transform:scale(1.08)}60%{transform:scale(.98)}}
    @keyframes pd-draw{0%{stroke-dasharray:1;stroke-dashoffset:1}60%,100%{stroke-dasharray:1;stroke-dashoffset:0}}
    [data-pagosya-product][data-style] .pd-icon>*{transform-box:fill-box;transform-origin:center}
    [data-pagosya-product][data-style] :is(.pd-roll,.pd-sweep,.pd-spin,.pd-settle,.pd-bob,.pd-flicker,.pd-nudge,.pd-pulse,.pd-glow,.pd-sway,.pd-twinkle,.pd-wave,.pd-snip,.pd-tilt,.pd-beat)>*{animation:var(--pd-motion) var(--pd-duration,2.4s) ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-roll>*{--pd-motion:pd-roll}
    [data-pagosya-product][data-style] .pd-sweep>*{--pd-motion:pd-sweep;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-spin>*{--pd-motion:pd-spin;--pd-duration:6s;animation-timing-function:linear}
    [data-pagosya-product][data-style] .pd-settle>*{--pd-motion:pd-settle;--pd-duration:3s}
    [data-pagosya-product][data-style] .pd-bob>*{--pd-motion:pd-bob;--pd-duration:2.6s}
    [data-pagosya-product][data-style] .pd-flicker>*{--pd-motion:pd-flicker;--pd-duration:2.6s}
    [data-pagosya-product][data-style] .pd-nudge>*{--pd-motion:pd-nudge;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-pulse>*{--pd-motion:pd-pulse;--pd-duration:2.2s}
    [data-pagosya-product][data-style] .pd-glow>*{--pd-motion:pd-glow;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-sway>*{--pd-motion:pd-sway;--pd-duration:2.8s}
    [data-pagosya-product][data-style] .pd-twinkle>*{--pd-motion:pd-twinkle;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-wave>*{--pd-motion:pd-wave;--pd-duration:2.4s}
    [data-pagosya-product][data-style] .pd-snip>*{--pd-motion:pd-snip;--pd-duration:2.2s}
    [data-pagosya-product][data-style] .pd-tilt>*{--pd-motion:pd-tilt;--pd-duration:3s}
    [data-pagosya-product][data-style] .pd-beat>*{--pd-motion:pd-beat;--pd-duration:1.8s}
    [data-pagosya-product][data-style] .pd-drip>*{animation:pd-drip 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-stream>*{animation:pd-stream 2.2s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-tick .pd-hand{animation:pd-tick 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-fill .pd-level{animation:pd-fill 2.8s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-rays .pd-rays,[data-pagosya-product][data-style] .pd-rays>*{animation:pd-rays 3s ease-in-out infinite}
    [data-pagosya-product][data-style] .pd-drum .pd-drum{animation:pd-drum 6s linear infinite}
    [data-pagosya-product][data-style] .pd-steam .pd-steam{animation:pd-steam 2.6s ease-in-out infinite}
    [data-pagosya-product][data-style] :is(.pd-draw) :is(.pd-check){pathLength:1;animation:pd-draw 3.2s ease-in-out infinite}
    [data-pagosya-product][data-style][data-highlights-paused] .pd-icon,[data-pagosya-product][data-style][data-highlights-paused] .pd-icon *{animation-play-state:paused}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] .pd-icon *{animation:none!important}}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] *,[data-pagosya-product] *::before{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.append(detailStyle);
  const fullProductPage = document.querySelector("[data-pagosya-product-page]");
  const fullCheckoutPage = document.querySelector("[data-pagosya-checkout-page]");
  // Kit-owned pages: the whole catalog (productos.html) and one collection per page (coleccion.html).
  const fullCatalogPage = Boolean(document.querySelector('[data-catalog-full]'));
  const collectionPage = Boolean(document.querySelector('[data-collection-page]'));
  const currentCollection = () => {
    const slug = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('c');
    return collections().find((c) => c.slug === slug) || null;
  };
  const rootPath = /(?:^|\/)pages\//.test(window.PAGOSYA_PREVIEW_PAGE || location.pathname) ? "../" : "";
  const pageHref = (page, query = "") => rootPath + page + query;
  // Older kit pages guessed an authored homepage section that many stores do not have.
  document.querySelectorAll('.commerce-header a[href="index.html#catalogo"]').forEach(link => { link.href = pageHref('productos.html'); });
  const detail = fullProductPage || document.createElement("dialog");
  detail.setAttribute("data-pagosya-product", "");
  detail.addEventListener('change', event => {
    const input = event.target;
    if (!input?.matches?.('[name=membershipPeriod]') || !selectedProduct) return;
    const join = detail.querySelector('[data-membership-join]');
    if (join) join.href = membershipJoinUrl(selectedProduct, input.value);
  });
  detail.setAttribute("aria-labelledby", "pagosya-product-title");
  if (!fullProductPage) document.body.append(detail);
  // The product page is platform-rendered; authored rules aimed at its hooks would fight the kit layout.
  // Exactly the product page hooks; catalog hooks such as [data-pagosya-product-template] stay authored.
  const productHook = /\[data-pagosya-product(?:-page)?(?=[\]~|^$*=\s])|\.product-detail__/;
  function splitSelectors(list) {
    const parts = []; let depth = 0, start = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }
  function releaseRules(container) {
    const rules = container.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (rule.cssRules?.length) releaseRules(rule);
      if (typeof rule.selectorText !== 'string' || !productHook.test(rule.selectorText)) continue;
      const kept = splitSelectors(rule.selectorText).filter(selector => !productHook.test(selector));
      if (kept.length) rule.selectorText = kept.join(', '); else container.deleteRule(i);
    }
  }
  function releaseProductPageStyles() {
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.ownerNode?.dataset?.pagosyaKit !== undefined) continue;
      try { releaseRules(sheet); } catch { /* Unreadable sheets keep their rules; kit selectors still outrank them. */ }
    }
  }
  releaseProductPageStyles();
  window.addEventListener('load', releaseProductPageStyles);
  // A wrapper that holds nothing but the product page must not paint panels beside the kit layout.
  const productWrapper = fullProductPage?.parentElement;
  if (productWrapper && productWrapper !== document.body && productWrapper.children.length === 1) productWrapper.style.setProperty('background', 'none', 'important');
  let selectedProduct = null, selectedImage = 0, detailTrigger = null, oldOverflow = "";
  let selectedOptions = [], selectedQuantity = 1, selectedPicks = [];
  const swatchColors = { negro: '#292b29', black: '#292b29', blanco: '#fffdf7', white: '#fffdf7', rojo: '#b5443f', red: '#b5443f', azul: '#446a98', blue: '#446a98', verde: '#71866a', green: '#71866a', rosa: '#d89ca6', pink: '#d89ca6', beige: '#d8c5a9', crema: '#eee4c9', cream: '#eee4c9', salvia: '#8b987b', 'verde salvia': '#8b987b', sage: '#8b987b', coral: '#d98b70', marfil: '#f1e8d5', ivory: '#f1e8d5', marron: '#805d48', brown: '#805d48', gris: '#92928e', gray: '#92928e', grey: '#92928e', amarillo: '#e0b847', yellow: '#e0b847', naranja: '#d28349', orange: '#d28349', morado: '#80678f', purple: '#80678f', oliva: '#757853', olive: '#757853' };
  function swatchColor(group, value) {
    if (!/^(color|colour|tono|tinte|acabado|finish)$/i.test(group)) return '';
    return swatchColors[value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || '';
  }
  function priceMarkup(p, variant, from = false) {
    const base = variant ? { ...p, amount: variant.amount } : p;
    const amount = price(base), sale = amount < base.amount;
    return `<strong class="product-detail__price">${from ? 'Desde ' : ''}${money(amount, p.currency)}</strong>${sale ? `<del class="product-detail__original" aria-label="Precio anterior">${money(base.amount, p.currency)}</del><span class="product-detail__saving">${escape(p.discountPercent)}% de descuento</span>` : ''}`;
  }
  const BADGE_NEW_MS = 30 * 86400000;
  /** The photo badge (spec 2026-10-10): the merchant's own words, '' for none, else only what is true right now. */
  function productBadge(p) {
    if (typeof p.badge === 'string') return p.badge.trim().slice(0, 20);
    if (store.topSellerId && store.topSellerId === p.id) return 'Más vendido';
    if (!isMembership(p) && p.discountPercent && price(p) < p.amount) return `−${p.discountPercent}%`;
    const created = Date.parse(p.createdAt);
    return Number.isFinite(created) && Date.now() - created < BADGE_NEW_MS ? 'Nuevo' : '';
  }
  const badgeMarkup = (p, className) => { const text = productBadge(p); return text ? `<span class="${className}">${escape(text)}</span>` : ''; };
  /* Compra única vs. Suscríbete y ahorra: offered only for plain products of a store that can take the consent at payment. */
  function subscriptionChoice(p) {
    const offers = subscriptionsAvailable() && p.fulfillmentType !== 'DIGITAL' && !p.extras?.length ? (p.subscriptionOptions || []) : [];
    if (!offers.length) return '';
    const best = Math.max(...offers.map(o => o.discountPercent));
    return `<fieldset class="product-detail__subscription" data-subscription-choice><legend>Cómo lo quieres</legend>`
      + `<label><input type="radio" name="purchaseMode" value="once" checked> Compra única</label>`
      + `<label><input type="radio" name="purchaseMode" value="subscribe"> ${best ? `Suscríbete y ahorra hasta ${best}%` : 'Suscríbete'}</label>`
      + (offers.length > 1
        ? `<select name="subscriptionCadence" aria-label="Frecuencia" disabled>${offers.map(o => `<option value="${escape(o.cadence)}">${escape(CADENCE_TEXT[o.cadence])}${o.discountPercent ? ` · −${o.discountPercent}%` : ''}</option>`).join('')}</select>`
        : `<input type="hidden" name="subscriptionCadence" value="${escape(offers[0].cadence)}">`)
      + `<p class="product-detail__subscription-price" data-subscription-price hidden></p>`
      + `<p class="product-detail__subscription-conflict" data-subscription-conflict role="alert" hidden></p>`
      + `<p>Te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente.</p></fieldset>`;
  }
  function selectedCadence() {
    const choice = detail.querySelector('[data-subscription-choice]');
    if (!choice || !selectedProduct || !subscriptionsAvailable() || choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe') return undefined;
    const cadence = choice.querySelector('[name=subscriptionCadence]')?.value;
    return offerFor(selectedProduct, cadence) ? cadence : undefined;
  }
  function showCadenceConflict(cadence) {
    const note = detail.querySelector('[data-subscription-conflict]');
    const text = cadenceConflict(cadence);
    if (note) { note.textContent = text; note.hidden = !text; }
    return text;
  }
  function updateSubscriptionChoice() {
    const choice = detail.querySelector('[data-subscription-choice]');
    if (!choice || !selectedProduct) return;
    const cadence = selectedCadence(), note = choice.querySelector('[data-subscription-price]'), select = choice.querySelector('select[name=subscriptionCadence]');
    if (select) select.disabled = choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe';
    const groups = optionGroups(selectedProduct), variant = groups ? selectedVariant() : undefined;
    if (note) {
      note.hidden = !cadence || (groups && !variant);
      if (!note.hidden) note.textContent = subscriptionPriceNote(selectedProduct, variant || undefined, cadence);
    }
    showCadenceConflict(cadence);
  }
  function quantityMarkup(action = '') {
    return '<div class="product-detail__purchase"><div class="product-detail__quantity" role="group" aria-label="Cantidad"><button type="button" data-product-quantity="-1" aria-label="Reducir cantidad" disabled>−</button><output data-product-quantity-value aria-live="polite" aria-label="Cantidad de unidades">1</output><button type="button" data-product-quantity="1" aria-label="Aumentar cantidad">+</button></div><span class="product-detail__subtotal" data-product-subtotal></span>' + action + '</div>';
  }
  function boxMarkup(p, group) {
    return `<fieldset class="product-detail__box"><legend>${escape(group.name)} <span data-box-progress aria-live="polite">0 de ${group.count}</span></legend><p class="product-detail__box-help">Elige ${group.count}; puedes repetir.</p><ul>${group.extras.map(e => {
      const image = safeUrl(e.imageUrl);
      return `<li${e.available === false ? ' data-unavailable' : ''}>${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : '<span class="product-detail__box-photo" aria-hidden="true"></span>'}<span class="product-detail__box-name">${escape(e.name)}${e.available === false ? '<small>Agotado</small>' : ''}${e.amount ? `<small>+${money(e.amount, p.currency)} c/u</small>` : ''}</span><span class="product-detail__box-stepper" role="group" aria-label="Cantidad de ${escape(e.name)}"><button type="button" data-box-pick="${escape(e.id)}" data-step="-1" aria-label="Quitar ${escape(e.name)}">−</button><output data-box-count="${escape(e.id)}">0</output><button type="button" data-box-pick="${escape(e.id)}" data-step="1" aria-label="Agregar ${escape(e.name)}">+</button></span></li>`;
    }).join('')}</ul></fieldset>`;
  }
  function updateBox() {
    const p = selectedProduct, group = boxGroup(p), buy = detail.querySelector('[data-box-add]');
    if (!group || !buy) return;
    const full = selectedPicks.length >= group.count;
    group.extras.forEach(e => {
      const count = selectedPicks.filter(id => id === e.id).length, linked = e.productId && products().find(item => item.id === e.productId);
      const room = !linked || limit(linked) - usedUnits(linked.id) > count;
      detail.querySelector(`[data-box-count="${CSS.escape(e.id)}"]`).textContent = count;
      detail.querySelectorAll(`[data-box-pick="${CSS.escape(e.id)}"]`).forEach(button => {
        button.disabled = !ready || checkingOut || (Number(button.dataset.step) < 0 ? !count : full || e.available === false || !room);
      });
    });
    detail.querySelector('[data-box-progress]').textContent = `${selectedPicks.length} de ${group.count}`;
    const line = selectedPicks.length === group.count ? cartLine(boxKey(p.id, selectedPicks)) : null;
    const available = line ? remaining(p, null, line.picks) : 0;
    buy.disabled = !ready || checkingOut || !available;
    if (line) buy.dataset.add = boxKey(p.id, selectedPicks); else delete buy.dataset.add;
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, { amount: p.amount + pickedExtras(group, selectedPicks).reduce((sum, e) => sum + e.amount, 0) });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = line
      ? available ? `${pickLabel(line.extras)}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : 'Ya añadiste la cantidad disponible de esta caja.'
      : `Elige ${group.count - selectedPicks.length} más para completar tu caja.`;
  }
  function updateQuantity() {
    if (!selectedProduct || !detail.querySelector('[data-product-quantity-value]')) return;
    const box = boxGroup(selectedProduct), boxLine = box && selectedPicks.length === box.count ? cartLine(boxKey(selectedProduct.id, selectedPicks)) : null;
    const groups = optionGroups(selectedProduct), variant = selectedVariant();
    const available = groups && !variant || box && !boxLine ? 0 : remaining(selectedProduct, variant, boxLine?.picks);
    selectedQuantity = Math.max(1, Math.min(selectedQuantity, available));
    updateSubscriptionChoice();
    detail.querySelector('[data-product-quantity-value]').textContent = selectedQuantity;
    detail.querySelectorAll('[data-product-quantity]').forEach(button => {
      button.disabled = !ready || checkingOut || (Number(button.dataset.productQuantity) < 0 ? selectedQuantity <= 1 : selectedQuantity >= available);
    });
    const cadence = selectedCadence();
    const amount = boxLine ? boxLine.amount : cadence && !(groups && !variant) ? subscriptionPrice(selectedProduct, variant || undefined, cadence) : price(variant ? { ...selectedProduct, amount: variant.amount } : selectedProduct);
    const pending = groups && !variant || box && !boxLine;
    const startingAt = pending && !box ? selectedProduct.variants.filter(v => remaining(selectedProduct, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value)).map(v => price({ ...selectedProduct, amount: v.amount })) : [];
    const total = pending ? startingAt.length ? `desde ${money(Math.min(...startingAt), selectedProduct.currency)}` : '' : available ? money(amount * selectedQuantity, selectedProduct.currency) : '';
    // The action carries the live total; the subtotal line only adds information for several units.
    detail.querySelector('[data-product-subtotal]').textContent = !pending && total && selectedQuantity > 1 ? `Subtotal ${total}` : '';
    detail.querySelectorAll('[data-product-total]').forEach(el => { el.textContent = total; });
    updateStickyBar();
  }
  let stickyObserver = null, buyPassed = false, commerceData = null;
  const starsMarkup = rating => `<span class="product-detail__stars" style="--rating:${Math.max(0, Math.min(5, Number(rating) || 0))}" aria-hidden="true">★★★★★</span>`;
  // Exact published totals come from the server summary, never from the latest-reviews page.
  function decorateProductReviews() {
    const p = selectedProduct, line = detail.querySelector('[data-product-rating]'), section = detail.querySelector('[data-product-reviews]');
    if (!p || !line) return;
    /* Studio preview: the merchant sees how real reviews will look, labeled as an example; a store
     * never ships these — outside the preview only verified shopper reviews render. */
    const sample = preview && !commerceData?.reviewSummary?.[p.id];
    if (!sample && !commerceData) return;
    const summary = sample ? { average: 5, count: 2 } : commerceData.reviewSummary?.[p.id];
    if (!summary || !Number.isSafeInteger(summary.count) || summary.count < 1 || !(summary.average >= 1 && summary.average <= 5)) { line.hidden = true; if (section) section.hidden = true; return; }
    const list = sample
      ? [{ rating: 5, displayName: 'Ejemplo', body: 'Así se verá una reseña verificada de tus clientes después de su compra.' }, { rating: 5, displayName: 'Ejemplo', body: 'Las reseñas reales llegan solas: pagosYa se las pide a quien ya recibió su pedido.' }]
      : (Array.isArray(commerceData.reviews) ? commerceData.reviews : []).filter(review => review.productId === p.id && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5).slice(0, 6);
    const authoredReviews = [...document.querySelectorAll('[data-pagosya-reviews]')].some(slot => !detail.contains(slot));
    const label = `${summary.average.toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 5 · ${summary.count} ${summary.count === 1 ? 'reseña verificada' : 'reseñas verificadas'}${sample ? ' · ejemplo' : ''}`;
    const showSection = !!section && list.length > 0 && !authoredReviews;
    line.innerHTML = showSection ? `<a href="#product-reviews">${starsMarkup(summary.average)}<span>${label}</span></a>` : `${starsMarkup(summary.average)}<span>${label}</span>`;
    line.hidden = false;
    if (!section) return;
    section.hidden = !showSection;
    section.innerHTML = showSection ? `<h2 id="product-reviews-title">Reseñas verificadas${sample ? ' · ejemplo' : ''}</h2><p class="product-detail__reviews-summary">${starsMarkup(summary.average)}<span>${label}</span></p><div class="product-detail__review-list">${list.map(review => `<article><p class="product-detail__review-meta">${starsMarkup(review.rating)}<span class="product-detail__review-score">${review.rating} de 5</span> <strong>${escape(review.displayName)}</strong></p><p>${escape(review.body)}</p></article>`).join('')}</div>` : '';
  }
  const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;
  const productHref = (item) => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  const bundleEntries = (bundle) => (Array.isArray(bundle?.items) ? bundle.items : []).map(item => ({ p: products().find(candidate => candidate.id === item?.productId), quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)) }));
  /* Offers the owner set up in Studio. Only the server cart quote decides which discount applies. */
  function bundleOffersMarkup(p) {
    if (!store.bundlesEnabled || !Array.isArray(store.bundles)) return '';
    const offers = store.bundles.flatMap(bundle => {
      const entries = bundleEntries(bundle);
      if (!entries.some(entry => entry.p?.id === p.id) || entries.some(entry => !entry.p)) return [];
      const names = entries.map(entry => entry.p.name), list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
      const percent = Math.max(0, Math.min(100, Number(bundle.discountPercent) || 0));
      const copy = bundle.kind === 'BOGO' ? `Lleva 2 entre ${list}: el de menor precio es gratis.`
        : bundle.kind === 'MIX_MATCH' ? `Combina ${Math.max(2, Number(bundle.minimumQuantity) || 2)} o más entre ${list} · ahorra ${percent}%`
        : `${entries.map(entry => `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${entry.p.name}`).join(' + ')} · ahorra ${percent}%`;
      const addable = bundle.kind === 'FIXED' && entries.every(entry => simpleProduct(entry.p) && remaining(entry.p) >= entry.quantity);
      const links = entries.filter(entry => entry.p.id !== p.id).map(entry => `<a href="${escape(productHref(entry.p))}">${escape(entry.p.name)}</a>`).join('');
      return [`<article><h3>${escape(bundle.name)}</h3><p>${escape(copy)}</p>${links ? `<p class="product-detail__bundle-links">${links}</p>` : ''}${addable ? `<button type="button" class="product-detail__bundle-add" data-bundle-add="${escape(bundle.id)}" aria-label="Añadir paquete ${escape(bundle.name)}">Añadir paquete</button>` : ''}</article>`];
    });
    return offers.length ? `<section class="product-detail__bundles" aria-labelledby="product-bundles-title"><h2 id="product-bundles-title">Llévalo en paquete</h2>${offers.join('')}</section>` : '';
  }
  /* "Súmale algo más": the owner's cart picks that are not in the cart yet. */
  function cartSuggestionsMarkup() {
    if (store.cartRecommendationsEnabled === false || !cart.size) return '';
    const inCart = new Set(cartItems().map(item => item.id));
    const ids = Array.isArray(store.cartRecommendationProductIds) ? store.cartRecommendationProductIds : [];
    const items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(item => item && !inCart.has(item.id) && limit(item) !== 0).slice(0, 3);
    if (!items.length) return '';
    return `<section class="order-recommendations" aria-label="Súmale algo más"><h3>Súmale algo más</h3><ul>${items.map(item => {
      const image = galleryImages(item)[0];
      return `<li>${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : ''}<span><strong>${escape(item.name)}</strong><span>${money(price(item), item.currency)}</span></span>${simpleProduct(item) ? `<button type="button" data-add="${escape(lineKey(item.id))}" aria-label="Añadir ${escape(item.name)}">Añadir</button>` : `<a href="${escape(productHref(item))}" aria-label="Elegir opciones de ${escape(item.name)}">Elegir</a>`}</li>`;
    }).join('')}</ul></section>`;
  }
  function relatedMarkup(p) {
    const ids = Array.isArray(p.recommendedProductIds) ? p.recommendedProductIds : [];
    let items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(item => item && item.id !== p.id && limit(item) !== 0).slice(0, 4);
    /* Studio preview: sample the catalog so the merchant sees the row; the published page only shows
     * the recommendations they actually configured. */
    const sample = preview && !items.length;
    if (sample) items = products().filter(item => item.id !== p.id && limit(item) !== 0).slice(0, 4);
    if (!items.length) return '';
    return `<section class="product-detail__related" aria-labelledby="product-related-title"><h2 id="product-related-title">Combínalo con${sample ? ' · ejemplo' : ''}</h2>${sample ? '<p class="product-detail__related-note">Elige los productos sugeridos de cada producto en tu panel; mientras tanto esta fila es una muestra de tu catálogo.</p>' : ''}<ul>${items.map(item => {
      const image = galleryImages(item)[0];
      const amounts = item.variants?.length ? item.variants.map(v => price({ ...item, amount: v.amount })) : [price(item)];
      const low = Math.min(...amounts);
      return `<li><a href="${escape(pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : ''}<span class="product-detail__related-name">${escape(item.name)}</span><span class="product-detail__related-price">${amounts.some(amount => amount !== low) ? 'Desde ' : ''}${money(low, item.currency)}</span></a></li>`;
    }).join('')}</ul></section>`;
  }
  function updateStickyBar() {
    const bar = detail.querySelector('[data-product-sticky]');
    if (!bar || !selectedProduct) return;
    const groups = optionGroups(selectedProduct), variant = selectedVariant(), buy = detail.querySelector('.product-detail__buy');
    const box = boxGroup(selectedProduct), pending = groups && !variant || box && selectedPicks.length !== box.count;
    bar.querySelector('[data-product-sticky-price]').textContent = detail.querySelector('.product-detail__price')?.textContent || '';
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : isMembership(selectedProduct) ? 'Hacerme miembro' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const show = buyPassed && matchMedia('(max-width: 640px)').matches;
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show;
  }
  let highlightObserver = null;
  // Looping icons rest while nobody is looking at them.
  function watchHighlights() {
    highlightObserver?.disconnect();
    const row = detail.querySelector('.product-detail__highlights');
    delete detail.dataset.highlightsPaused;
    if (!row || typeof IntersectionObserver !== 'function') return;
    highlightObserver = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry.isIntersecting) delete detail.dataset.highlightsPaused; else detail.dataset.highlightsPaused = '';
    });
    highlightObserver.observe(row);
  }
  function watchStickyBar() {
    stickyObserver?.disconnect(); buyPassed = false;
    const buy = fullProductPage && detail.querySelector('.product-detail__buy');
    if (!buy || typeof IntersectionObserver !== 'function') return;
    stickyObserver = new IntersectionObserver(entries => { const entry = entries[entries.length - 1]; buyPassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0; updateStickyBar(); });
    stickyObserver.observe(buy);
  }
  function optionPrices(groups) {
    const p = selectedProduct;
    return groups.map((group, index) => {
      const prices = group.values.map(value => {
        const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : selectedOptions[i] === undefined || candidate === selectedOptions[i]));
        const amounts = (matches.some(v => remaining(p, v) > 0) ? matches.filter(v => remaining(p, v) > 0) : matches).map(v => price({ ...p, amount: v.amount }));
        return amounts.length ? { low: Math.min(...amounts), high: Math.max(...amounts) } : null;
      });
      // Only label choices when this group actually changes what the shopper pays.
      const distinct = new Set(prices.filter(Boolean).map(range => range.low + ':' + range.high));
      // Ranges ("desde") on every choice read as noise; label a group once each choice has one exact price.
      return distinct.size > 1 && prices.every(range => !range || range.low === range.high) ? prices.map(range => range ? range.low : null) : null;
    });
  }
  const assuranceIcons = {
    pickup: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 9v10h14V9"/><path d="M10 19v-5h4v5"/>',
    delivery: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.5"/><circle cx="17.5" cy="17.5" r="1.5"/>',
    digital: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    payment: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    /* Curated extras for merchant-authored assurance lines (config.productAssurances); Lucide outlines. */
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    leaf: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    gift: '<path d="M12 7v14"/><path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/><path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/><rect x="3" y="7" width="18" height="4" rx="1"/>',
    heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
    award: '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    sparkles: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    package: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
    coffee: '<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>',
    'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    'thumbs-up': '<path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/>',
  };
  // Merchant-authored policies, rendered as escaped text in a runtime-owned dialog.
  const POLICY_TITLES = { returns: 'Cambios y devoluciones', delivery: 'Envíos y entregas', privacy: 'Privacidad', terms: 'Términos y condiciones' };
  const storePolicies = () => (store.policies && typeof store.policies === 'object' ? store.policies : {});
  function policyLinks(keys = Object.keys(POLICY_TITLES)) {
    const present = keys.filter(key => typeof storePolicies()[key] === 'string' && storePolicies()[key].trim());
    return present.length ? `<nav class="pagosya-policies" aria-label="Políticas de la tienda">${present.map(key => `<button type="button" data-pagosya-policy="${key}">${escape(POLICY_TITLES[key])}</button>`).join('')}</nav>` : '';
  }
  // Information pages (spec 2026-09-30-store-content-pages-design): each `data-pagosya-page` mount is filled from the
  // live store with escaped text, and `data-pagosya-pages` links only the pages that have something to show.
  const INFO_LINKS = [
    ['collections', 'colecciones.html', 'Colecciones'], ['search', 'buscar.html', 'Buscar'],
    ['about', 'nosotros.html', 'Nosotros'], ['contact', 'contacto.html', 'Contacto'], ['shipping', 'envios.html', 'Envíos y entregas'],
    ['faq', 'faq.html', 'Preguntas frecuentes'], ['refund', 'reembolsos.html', 'Cambios y devoluciones'], ['privacy', 'privacidad.html', 'Privacidad'],
    ['terms', 'terminos.html', 'Términos y condiciones'], ['cookies', 'cookies.html', 'Cookies y almacenamiento'],
  ];
  // The shopper's account is served by the checkout app on its own origin, never inside the store, where authored code runs.
  const accountUrl = () => { try { return config.slug && config.checkoutOrigin ? new URL(`/cuenta/${encodeURIComponent(config.slug)}`, config.checkoutOrigin).href : ''; } catch { return ''; } };
  // The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.
  const ACCOUNT_GATE_PATHS = { login: '', register: '/registro', 'forgot-password': '/recuperar', 'reset-password': '/recuperar', orders: '/pedidos', addresses: '/direcciones', profile: '/perfil', subscriptions: '/suscripciones' };
  function renderAccountGateLinks() {
    const base = accountEntry();
    // Account access is a platform baseline even when an authored shell omits it.
    // Existing local account navigation and the information slot remain authoritative.
    if (base && !document.querySelector('[data-pagosya-pages],a[data-pagosya-account],a[href="acceso-ingresar.html"],a[href="cuenta-perfil.html"]')) {
      const nav = document.createElement('nav');
      nav.className = 'pagosya-info-nav';
      nav.setAttribute('aria-label', 'Cuenta de cliente');
      const access = document.createElement('a');
      access.href = base; access.textContent = 'Mi cuenta';
      access.setAttribute('data-pagosya-account', '');
      nav.append(access);
      (document.querySelector('footer') || document.body).append(nav);
    }
    document.querySelectorAll('a[data-pagosya-account]').forEach(link => {
      const view = link.getAttribute('data-pagosya-account');
      if (!view) return;
      if (accountBridge && ACCOUNT_PAGES[view]) { link.setAttribute('href', ACCOUNT_PAGES[view]); link.removeAttribute('aria-disabled'); return; }
      if (base && Object.prototype.hasOwnProperty.call(ACCOUNT_GATE_PATHS, view)) { link.setAttribute('href', base + ACCOUNT_GATE_PATHS[view]); link.removeAttribute('aria-disabled'); return; }
      link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.textContent = 'Cuenta no disponible';
    });
  }
  // ---- Shopper account (spec 2026-10-08-store-built-in-account-pages): drawn here and styled by the store; the trusted
  // parent keeps the session and calls the API. Without a parent (an exported static site) the gate keeps its link.
  const ACCOUNT_PAGES = { login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html', 'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html', profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html' };
  const ACCOUNT_LAYOUTS = ['card', 'split', 'minimal', 'panel'];
  const SIGNED_IN_VIEWS = ['orders', 'addresses', 'profile', 'subscriptions'];
  const accountBridge = typeof window.PAGOSYA_ACCOUNT_REQUEST === 'function' ? window.PAGOSYA_ACCOUNT_REQUEST : null;
  const accountEntry = () => accountBridge ? ACCOUNT_PAGES.login : accountUrl();
  const accountAsk = async (action, body = {}) => { try { return await accountBridge(action, body); } catch { return { ok: false, body: { message: 'No pudimos conectar. Inténtalo de nuevo.' } }; } };
  const accountTheme = () => { const theme = config.accountTheme && typeof config.accountTheme === 'object' ? config.accountTheme : {}; return { layout: ACCOUNT_LAYOUTS.includes(theme.layout) ? theme.layout : 'card', photo: typeof theme.photo === 'string' ? theme.photo : '', css: typeof theme.css === 'string' ? theme.css : '' }; };
  const accountGo = page => { const link = document.createElement('a'); link.href = page; link.hidden = true; document.body.append(link); link.click(); link.remove(); };
  const accountInput = (name, label, type, autocomplete, value = '') => `<label data-part="field"><span data-part="label">${escape(label)}</span><input data-part="input" name="${name}" type="${type}" autocomplete="${autocomplete}" value="${escape(value)}" ${type === 'tel' ? '' : 'required'}></label>`;
  const ACCOUNT_FORMS = {
    login: { title: 'Ingresa a tu cuenta', lead: 'Revisa tus pedidos y compra más rápido.', fields: [['email', 'Correo', 'email', 'email'], ['password', 'Contraseña', 'password', 'current-password']], submit: 'Ingresar', action: 'login', links: [['register', '¿No tienes cuenta? Crea una'], ['forgot-password', '¿Olvidaste tu contraseña?']] },
    register: { title: 'Crea tu cuenta', lead: 'Sigue tus pedidos y guarda tus direcciones.', fields: [['name', 'Nombre', 'text', 'name'], ['email', 'Correo', 'email', 'email'], ['password', 'Contraseña (8 caracteres o más)', 'password', 'new-password']], submit: 'Crear cuenta', action: 'register', links: [['login', 'Ya tengo una cuenta']] },
    'forgot-password': { title: 'Recupera tu contraseña', lead: 'Te enviamos un enlace para elegir una nueva.', fields: [['email', 'Correo', 'email', 'email']], submit: 'Enviar enlace', action: 'forgot', links: [['login', 'Volver a ingresar']] },
    'reset-password': { title: 'Elige una contraseña nueva', lead: 'Usa 8 caracteres o más.', fields: [['password', 'Contraseña nueva', 'password', 'new-password']], submit: 'Guardar contraseña', action: 'reset', links: [['login', 'Volver a ingresar']] },
  };
  const ACCOUNT_ORDER_STATUS = { AWAITING_PAYMENT: 'Esperando pago', PAID: 'Pagado', PREPARING: 'Preparando', READY_FOR_PICKUP: 'Listo para retirar', SHIPPED: 'Enviado', DELIVERED: 'Entregado', CANCELED: 'Cancelado', REFUNDED: 'Reembolsado' };
  const ACCOUNT_SUBSCRIPTION_STATUS = { ACTIVE: 'Activa', PAUSED: 'Pausada', CANCELED: 'Cancelada' };
  const ACCOUNT_CADENCE = { WEEKLY: 'cada semana', BIWEEKLY: 'cada dos semanas', MONTHLY: 'cada mes' };
  const accountDay = iso => { try { return iso ? new Date(iso).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; } catch { return ''; } };
  // Unlayered on purpose: the store's own generic rules (h1, input) must not undo the form; YAPI's theme comes after and wins.
  const ACCOUNT_CSS = `
[data-account-gate] [data-part=account]{--acc-bg:var(--account-background,var(--ui-paper,#fff));--acc-ink:var(--account-foreground,var(--ui-ink,#111));--acc-accent:var(--account-accent,var(--ui-accent,#111));--acc-radius:var(--account-radius,var(--ui-radius-control,10px));display:grid;gap:var(--ui-s5,24px);color:var(--acc-ink)}
[data-account-gate] [data-part=card]{display:grid;gap:var(--ui-s3,12px)}
[data-account-gate] [data-layout=card] [data-part=card]{width:100%;max-width:440px;margin-inline:auto;box-sizing:border-box;padding:clamp(24px,4vw,40px);background:var(--ui-surface,var(--acc-bg));border:1px solid var(--ui-line,#0002);border-radius:calc(var(--acc-radius) * 1.6)}
[data-account-gate] [data-layout=split]{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}
[data-account-gate] [data-layout=split] [data-part=media]{margin:0}
[data-account-gate] [data-layout=split] [data-part=media] img{display:block;width:100%;height:100%;min-height:320px;object-fit:cover;border-radius:var(--ui-radius-media,12px)}
[data-account-gate] [data-layout=minimal] [data-part=card]{max-width:560px}
[data-account-gate] [data-layout=panel]{grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
[data-account-gate] [data-part=title]{margin:0;font-family:var(--ui-display-font,var(--store-heading-font,inherit));font-size:clamp(28px,3vw,40px);line-height:1.1}
[data-account-gate] [data-part=lead]{margin:0;opacity:.8}
[data-account-gate] [data-part=form]{display:grid;gap:var(--ui-s4,16px)}
[data-account-gate] [data-part=field]{display:grid;gap:6px}
[data-account-gate] [data-part=label]{font-size:.85em;font-weight:600}
[data-account-gate] [data-part=input]{box-sizing:border-box;width:100%;min-height:48px;padding:0 14px;border:1px solid var(--ui-line,#0003);border-radius:var(--acc-radius);background:var(--acc-bg);color:var(--acc-ink);font:inherit}
[data-account-gate] [data-part=submit]{min-height:48px;background:var(--acc-accent);color:var(--ui-on-accent,#fff);border-radius:var(--acc-radius);border:0;font:inherit;font-weight:700;cursor:pointer}
[data-account-gate] [data-part=link]{color:inherit;text-decoration:underline;text-underline-offset:3px;background:none;border:0;padding:0;font:inherit;cursor:pointer;justify-self:start}
[data-account-gate] [data-part=error]:empty{display:none}
[data-account-gate] [data-part=error]{margin:0;color:#b42318;font-weight:600}
[data-account-gate] [data-part=notice]{margin:0;padding:10px 12px;border-radius:var(--acc-radius);background:color-mix(in srgb,var(--acc-accent) 10%,transparent)}
[data-account-gate] [data-part=nav]{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
[data-account-gate] [data-part=nav-item][aria-current=page]{font-weight:700;text-decoration:underline}
[data-account-gate] [data-part=list]{display:grid;gap:12px;margin:0;padding:0;list-style:none}
[data-account-gate] :is([data-part=order],[data-part=address]){display:grid;gap:4px;padding:14px 16px;border:1px solid var(--ui-line,#0002);border-radius:var(--acc-radius)}
[data-account-gate] [data-part=danger]{display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--ui-line,#0002)}
@media (max-width:720px){[data-account-gate] :is([data-layout=split],[data-layout=panel]){grid-template-columns:1fr}[data-account-gate] [data-layout=split] [data-part=media] img{min-height:0;max-height:220px}}
`;
  function accountFrame(slot, inner) {
    const { layout, photo } = accountTheme();
    const media = layout === 'split' && photo ? `<figure data-part="media"><img src="${escape(photo)}" alt=""></figure>` : '';
    slot.innerHTML = `<section data-part="account" data-layout="${layout}">${media}<div data-part="card">${preview ? '<p data-part="notice">Vista previa · No se crean cuentas</p>' : ''}${inner}</div></section>`;
  }
  // A submitted form keeps what the shopper typed and shows the API's message in its error part.
  function accountSubmit(form, action, done) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const error = form.querySelector('[data-part=error]'); if (error) error.textContent = '';
      const button = form.querySelector('[data-part=submit]'); if (button) button.disabled = true;
      const result = await accountAsk(action, Object.fromEntries(new FormData(form)));
      if (button) button.disabled = false;
      if (!result.ok) { if (error) error.textContent = result.body?.message || 'No pudimos completar la operación.'; return; }
      done(result);
    });
  }
  function accountForm(slot, view, { notice = '', after = '' } = {}) {
    const form = ACCOUNT_FORMS[view];
    accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="lead">${escape(form.lead)}</p>${notice ? `<p data-part="notice">${escape(notice)}</p>` : ''}<form data-part="form" novalidate>${form.fields.map(field => accountInput(...field)).join('')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">${escape(form.submit)}</button></form>${form.links.map(([target, label]) => `<a data-part="link" href="${ACCOUNT_PAGES[target]}">${escape(label)}</a>`).join('')}`);
    accountSubmit(slot.querySelector('form'), form.action, result => {
      if (form.action === 'login') accountGo(after || ACCOUNT_PAGES.orders);
      else if (form.action === 'reset') accountForm(slot, 'login', { notice: 'Tu contraseña quedó guardada. Ya puedes ingresar.' });
      else accountFrame(slot, `<h1 data-part="title">${escape(form.title)}</h1><p data-part="notice">${escape(result.body?.message || 'Listo. Revisa tu correo.')}</p><a data-part="link" href="${ACCOUNT_PAGES.login}">Ir a ingresar</a>`);
    });
  }
  const ACCOUNT_NAV = [['orders', 'Pedidos'], ['subscriptions', 'Suscripciones'], ['addresses', 'Direcciones'], ['profile', 'Perfil']];
  const ACCOUNT_TITLES = { orders: 'Mis pedidos', subscriptions: 'Mis suscripciones', addresses: 'Mis direcciones', profile: 'Mi perfil' };
  const ADDRESS_FIELDS = [['label', 'Nombre de la dirección', 'text', 'off'], ['recipient', 'Quién recibe', 'text', 'name'], ['phone', 'Teléfono', 'tel', 'tel'], ['department', 'Departamento', 'text', 'address-level1'], ['city', 'Ciudad', 'text', 'address-level2'], ['street', 'Dirección', 'text', 'street-address'], ['references', 'Referencias', 'text', 'off']];
  function accountBody(view, data) {
    const list = Array.isArray(data) ? data : [];
    if (view === 'orders') return list.length ? `<ul data-part="list">${list.map(order => `<li data-part="order"><strong>Pedido del ${escape(accountDay(order.createdAt))}</strong><span data-part="order-status">${escape(ACCOUNT_ORDER_STATUS[order.status] || order.status || '')}</span><span>${escape(money(Number(order.amount) || 0, order.currency || 'BOB'))}</span><span data-part="hint">${escape((Array.isArray(order.items) ? order.items : []).map(item => `${item.quantity || 1} × ${item.name || ''}`).join(', '))}</span></li>`).join('')}</ul>` : '<p data-part="empty">Todavía no tienes pedidos.</p>';
    if (view === 'subscriptions') return list.length ? `<ul data-part="list">${list.map(item => `<li data-part="order"><strong>${escape(item.itemName || 'Suscripción')}</strong><span data-part="order-status">${escape(ACCOUNT_SUBSCRIPTION_STATUS[item.status] || item.status || '')}</span><span data-part="hint">${escape([item.quantity ? `${item.quantity} ×` : '', ACCOUNT_CADENCE[item.cadence] || '', item.nextBillingAt ? `próxima: ${accountDay(item.nextBillingAt)}` : ''].filter(Boolean).join(' '))}</span></li>`).join('')}</ul>` : '<p data-part="empty">No tienes suscripciones.</p>';
    if (view === 'addresses') {
      const addresses = Array.isArray(data?.addresses) ? data.addresses : [];
      return `${addresses.length ? `<ul data-part="list">${addresses.map((address, index) => `<li data-part="address"><strong>${escape(address.label || 'Dirección')}</strong><span>${escape([address.street, address.city, address.department].filter(Boolean).join(', '))}</span><span data-part="hint">${escape([address.recipient, address.phone].filter(Boolean).join(' · '))}</span><button data-part="link" type="button" data-account-remove="${index}">Quitar</button></li>`).join('')}</ul>` : '<p data-part="empty">Todavía no guardaste direcciones.</p>'}<form data-part="form" data-account-address novalidate><h2 data-part="lead">Agregar una dirección</h2>${ADDRESS_FIELDS.map(field => accountInput(...field)).join('')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">Guardar dirección</button></form>`;
    }
    const me = data && typeof data === 'object' ? data : {};
    return `<form data-part="form" data-account-profile novalidate>${accountInput('name', 'Nombre', 'text', 'name', me.name || '')}${accountInput('phone', 'Teléfono', 'tel', 'tel', me.phone || '')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="solid" type="submit">Guardar cambios</button></form><button data-part="link" type="button" data-account-export>Descargar mis datos</button><form data-part="danger" data-account-delete novalidate><strong>Eliminar mi cuenta</strong><span data-part="hint">Borra tus datos personales. Tus pedidos quedan con la tienda.</span>${accountInput('password', 'Tu contraseña', 'password', 'current-password')}<p data-part="error" role="alert"></p><button data-part="submit" class="ui-button" data-variant="outline" type="submit">Eliminar mi cuenta</button></form>`;
  }
  async function accountSignedIn(slot, view, name) {
    const result = await accountAsk(view === 'profile' || view === 'addresses' ? 'me' : view);
    if (!result.ok && result.body?.status === 401) { accountForm(slot, 'login', { notice: 'Tu sesión terminó. Vuelve a ingresar.', after: ACCOUNT_PAGES[view] }); return; }
    const nav = `<nav data-part="nav" aria-label="Mi cuenta">${ACCOUNT_NAV.map(([key, label]) => `<a data-part="nav-item" href="${ACCOUNT_PAGES[key]}"${key === view ? ' aria-current="page"' : ''}>${escape(label)}</a>`).join('')}<button data-part="link" type="button" data-account-logout>Salir</button></nav>`;
    const body = result.ok ? accountBody(view, result.body) : `<p data-part="error" role="alert">${escape(result.body?.message || 'No pudimos cargar tu cuenta.')}</p>`;
    accountFrame(slot, `${nav}<h1 data-part="title">${escape(ACCOUNT_TITLES[view])}</h1>${name ? `<p data-part="lead">Hola, ${escape(name)}</p>` : ''}${body}`);
    slot.querySelector('[data-account-logout]')?.addEventListener('click', async () => { await accountAsk('logout'); accountGo(ACCOUNT_PAGES.login); });
    const profile = slot.querySelector('[data-account-profile]');
    if (profile) accountSubmit(profile, 'update-me', () => accountSignedIn(slot, view, name));
    slot.querySelector('[data-account-export]')?.addEventListener('click', () => void accountAsk('export'));
    const remove = slot.querySelector('[data-account-delete]');
    if (remove) accountSubmit(remove, 'delete', () => accountGo(ACCOUNT_PAGES.login));
    const saved = Array.isArray(result.body?.addresses) ? result.body.addresses : [];
    const address = slot.querySelector('[data-account-address]');
    if (address) address.addEventListener('submit', async event => {
      event.preventDefault();
      const entry = Object.fromEntries(new FormData(address));
      const outcome = await accountAsk('addresses', { addresses: [...saved, entry] });
      if (!outcome.ok) { address.querySelector('[data-part=error]').textContent = outcome.body?.message || 'No pudimos guardar la dirección.'; return; }
      accountSignedIn(slot, view, name);
    });
    slot.querySelectorAll('[data-account-remove]').forEach(button => button.addEventListener('click', async () => {
      const index = Number(button.getAttribute('data-account-remove'));
      await accountAsk('addresses', { addresses: saved.filter((_, at) => at !== index) });
      accountSignedIn(slot, view, name);
    }));
  }
  let accountDrawn = false;
  async function renderAccountViews() {
    const gates = [...document.querySelectorAll('[data-account-gate]')];
    if (!gates.length || accountDrawn) return;
    accountDrawn = true;
    const kit = document.createElement('style'); kit.dataset.pagosyaKit = 'account'; kit.textContent = ACCOUNT_CSS; document.head.append(kit);
    const theme = accountTheme();
    // Defence in depth: the API sanitized this CSS (account-theme.ts); this only refuses what the sanitizer never emits.
    if (theme.css && theme.css.length <= 8000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|!\s*important/i.test(theme.css)) {
      const style = document.createElement('style'); style.dataset.pagosyaKit = 'account-theme'; style.textContent = theme.css; document.head.append(style);
    }
    const state = await accountAsk('state');
    const signedIn = state.ok && state.body?.signedIn === true;
    for (const gate of gates) {
      const view = gate.getAttribute('data-account-gate');
      const slot = gate.querySelector('.ui-container') || gate;
      if (SIGNED_IN_VIEWS.includes(view)) { if (signedIn) await accountSignedIn(slot, view, state.body.name); else accountForm(slot, 'login', { after: ACCOUNT_PAGES[view] }); }
      else if (view === 'login' && signedIn && !preview) accountGo(ACCOUNT_PAGES.orders);
      else if (ACCOUNT_FORMS[view]) accountForm(slot, view, view === 'login' && state.body?.verified === true ? { notice: 'Tu correo quedó confirmado. Ya puedes ingresar.' } : view === 'login' && state.body?.verified === false ? { notice: 'El enlace de verificación no es válido o ya se usó.' } : {});
    }
  }
  function renderAccountGates() {
    renderAccountGateLinks();
    if (accountBridge) void renderAccountViews();
  }
  document.addEventListener('click', event => {
    const link = event.target.closest && event.target.closest('[data-pagosya-account]');
    // Only the account app on the checkout origin is outside the store; the store's own account pages navigate as usual.
    if (link && hosted && /^https?:/i.test(link.getAttribute('href') || '')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:source-external', url: link.href }, '*'); }
  });
  const infoText = value => (typeof value === 'string' ? value.trim() : '');
  const infoParagraphs = text => text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('');
  const policyText = key => infoText(storePolicies()[key]);
  const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const infoLocations = () => (Array.isArray(store.locations) ? store.locations.filter(place => place && typeof place.name === 'string') : []);
  const placeNames = places => places.map(place => escape(place.name)).join(', ');
  function placeHours(place) {
    const rows = (Array.isArray(place.openingHours) ? place.openingHours : []).filter(row => row && Number.isInteger(row.day) && row.day >= 0 && row.day <= 6);
    return rows.map(row => `${WEEKDAYS[row.day]}: ${row.closed ? 'cerrado' : `${escape(row.open)} a ${escape(row.close)}`}`).join(' · ');
  }
  function placeList(keep = () => true) {
    const items = infoLocations().filter(keep).map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? `<br>${escape(place.address)}` : ''}${placeHours(place) ? `<br>${placeHours(place)}` : ''}<br>${[place.pickupEnabled && 'Retiro en tienda', place.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`);
    return items.length ? `<ul class="pagosya-info__list">${items.join('')}</ul>` : '';
  }
  const phoneLink = () => { const phone = infoText(store.contactPhone); return /^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) ? `<a href="tel:${escape(phone.replace(/[^0-9+]/g, ''))}">${escape(phone)}</a>` : ''; };
  const emailLink = () => { const email = infoText(store.contactEmail); return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''; };
  function faqBody() {
    const places = infoLocations(), delivering = places.filter(place => place.deliveryEnabled), pickup = places.filter(place => place.pickupEnabled);
    const entries = [];
    if (store.shippingEnabled || delivering.length) entries.push(['¿Hacen envíos?', delivering.length ? `Sí, entregamos a domicilio desde: ${placeNames(delivering)}.` : 'Sí, hacemos envíos.']);
    if (pickup.length || store.shippingPickupEnabled) entries.push(['¿Puedo retirar mi pedido?', pickup.length ? `Sí, puedes retirarlo en: ${placeNames(pickup)}.` : 'Sí, puedes retirar tu pedido.']);
    if (places.length) entries.push(['¿Dónde están?', `<ul class="pagosya-info__list">${places.map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? ` — ${escape(place.address)}` : ''}</li>`).join('')}</ul>`]);
    if (store.checkoutMode === 'payment') entries.push(['¿Cómo pago?', 'Pagas con QR o tarjeta desde la tienda, con pago seguro procesado por pagosYa.']);
    const contact = [phoneLink(), emailLink()].filter(Boolean);
    if (contact.length) entries.push(['¿Cómo los contacto?', contact.join(' · ')]);
    return entries.length >= 2 ? entries.map(([question, answer]) => `<section class="pagosya-info__qa"><h2>${escape(question)}</h2>${answer.startsWith('<') ? answer : `<p>${answer}</p>`}</section>`).join('') : '';
  }
  // Catalog pages. `collections()` and `collectionHref` are declared further down the file, so these read the store directly.
  const foldText = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const infoCollections = () => (Array.isArray(store.collections) ? store.collections : [])
    .filter(collection => collection && typeof collection.slug === 'string' && typeof collection.name === 'string')
    .map(collection => ({ ...collection, count: (Array.isArray(collection.productIds) ? collection.productIds : []).filter(id => products().some(item => item.id === id)).length }))
    .filter(collection => collection.count > 0);
  function collectionsBody() {
    const list = infoCollections();
    if (!list.length) return '';
    return `<ul class="pagosya-info__cards">${list.map(collection => `<li><a href="${escape(pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug)))}"><strong>${escape(collection.name)}</strong><small>${collection.count} ${collection.count === 1 ? 'producto' : 'productos'}</small></a></li>`).join('')}</ul><p><a href="${escape(pageHref('productos.html'))}">Ver todos los productos</a></p>`;
  }
  const searchQuery = () => (new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('q') || '').trim().slice(0, 80);
  const safeImage = url => (typeof url === 'string' && /^(?:https?:\/\/|\/(?!\/))/.test(url) ? url : '');
  function searchBody() {
    const items = products();
    if (!items.length) return '';
    const q = searchQuery();
    const form = `<form class="pagosya-search" role="search" method="get" action="${escape(pageHref('buscar.html'))}"><label>Buscar productos<input type="search" name="q" value="${escape(q)}" maxlength="80" autocomplete="off"></label><button type="submit">Buscar</button></form>`;
    if (!q) return `${form}<p>Escribe lo que buscas.</p>`;
    const words = foldText(q).split(/\s+/).filter(Boolean);
    const categoryName = item => (Array.isArray(store.categories) ? store.categories : []).find(category => category && category.id === item.categoryId)?.name;
    const haystack = item => foldText([item.name, item.description, ...(Array.isArray(item.tags) ? item.tags : []), categoryName(item)].filter(Boolean).join(' '));
    const hits = items.filter(item => { const text = haystack(item); return words.every(word => text.includes(word)); });
    if (!hits.length) return `${form}<p role="status">No encontramos productos para “${escape(q)}”.</p>`;
    const cards = hits.slice(0, 48).map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : ''); return `<li><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : ''}<strong>${escape(item.name)}</strong><span>${escape(money(item.amount, item.currency))}</span></a></li>`; });
    return `${form}<p role="status">${hits.length > 48 ? `Mostrando 48 de ${hits.length} resultados` : `${hits.length} ${hits.length === 1 ? 'resultado' : 'resultados'}`} para “${escape(q)}”.</p><ul class="pagosya-info__cards">${cards.join('')}</ul>`;
  }
  const COOKIES_BODY = '<p>Esta tienda no usa cookies.</p><p>Para funcionar guarda algunos datos en el almacenamiento de tu navegador. Esos datos no salen de tu dispositivo, salvo lo que envías al hacer un pedido.</p><ul class="pagosya-info__list"><li><strong>Tu carrito:</strong> para que no pierdas lo que elegiste al cambiar de página.</li><li><strong>Tu elección de privacidad:</strong> si aceptaste o rechazaste las estadísticas; se recuerda 180 días.</li><li><strong>Estadísticas de visita</strong> (solo si las aceptas): identificadores anónimos de visitante y de visita para contar cuántas personas ven la tienda.</li><li><strong>Código de referido:</strong> si llegaste con un enlace de un socio, se recuerda durante la visita.</li><li><strong>Avisos de la tienda:</strong> si cerraste un aviso o tienes un enlace para recuperar un pedido, se recuerda durante la visita.</li></ul>';
  const infoBody = kind => ({
    about: () => [infoText(store.tagline) && `<p class="pagosya-info__lead">${escape(infoText(store.tagline))}</p>`, infoText(store.aboutText) && infoParagraphs(infoText(store.aboutText))].filter(Boolean).join(''),
    contact: () => [phoneLink() && `<p>Teléfono: ${phoneLink()}</p>`, emailLink() && `<p>Correo: ${emailLink()}</p>`, placeList()].filter(Boolean).join(''),
    shipping: () => [policyText('delivery') && infoParagraphs(policyText('delivery')), placeList(place => place.pickupEnabled || place.deliveryEnabled)].filter(Boolean).join(''),
    refund: () => (policyText('returns') ? infoParagraphs(policyText('returns')) : ''),
    privacy: () => (policyText('privacy') ? infoParagraphs(policyText('privacy')) : ''),
    terms: () => (policyText('terms') ? infoParagraphs(policyText('terms')) : ''),
    faq: faqBody,
    collections: collectionsBody,
    search: searchBody,
    cookies: () => COOKIES_BODY,
  })[kind]?.() || '';
  function setNoindex(on) {
    let meta = document.head.querySelector('meta[data-pagosya-noindex]');
    if (on && !meta) { meta = document.createElement('meta'); meta.name = 'robots'; meta.content = 'noindex'; meta.setAttribute('data-pagosya-noindex', ''); document.head.append(meta); }
    else if (!on && meta) meta.remove();
  }
  // Outside preview, demo and hosted the store is only trusted once the live copy arrived (`ready`), so a page never
  // flashes "no disponible" while it loads; `force` fills from whatever the store holds when that fetch failed.
  function renderInfoPages(force = false) {
    renderAccountGates();
    const live = force || ready;
    if (live) document.querySelectorAll('[data-pagosya-pages]').forEach(slot => {
      const account = accountEntry();
      slot.innerHTML = INFO_LINKS.filter(([kind]) => infoBody(kind)).map(([, href, label]) => `<a href="${href}">${escape(label)}</a>`).join('') + (account ? `<a href="${escape(account)}" data-pagosya-account>Mi cuenta</a>` : '');
      slot.hidden = !slot.innerHTML;
    });
    let unavailable = false;
    document.querySelectorAll('[data-pagosya-page]').forEach(mount => {
      const kind = mount.getAttribute('data-pagosya-page');
      // The fixed pages need no store data, so they never wait for it.
      if (kind === 'notfound') { mount.innerHTML = '<p>La página que buscas no existe.</p><p><a href="index.html">Volver al inicio</a></p>'; return; }
      if (kind === 'cookies') { mount.innerHTML = `<div class="pagosya-info">${COOKIES_BODY}</div>`; return; }
      if (!live) return;
      const html = infoBody(kind);
      mount.innerHTML = html ? `<div class="pagosya-info">${html}</div>` : '<p>Esta información aún no está disponible.</p><p><a href="index.html">Volver al inicio</a></p>';
      if (!html) unavailable = true;
    });
    // A failed live fetch (`force`) says nothing about the page, so it never asks search engines to drop it.
    if (live && document.querySelector('[data-pagosya-page]')) setNoindex(unavailable && !force);
  }
  let policyDialog;
  function openPolicy(key, trigger) {
    const text = storePolicies()[key];
    if (!POLICY_TITLES[key] || typeof text !== 'string') return;
    if (!policyDialog) {
      policyDialog = document.createElement('dialog');
      policyDialog.className = 'pagosya-policy-dialog';
      policyDialog.setAttribute('aria-labelledby', 'pagosya-policy-title');
      policyDialog.addEventListener('click', event => { if (event.target === policyDialog || event.target.closest('[data-policy-close]')) policyDialog.close(); });
      document.body.append(policyDialog);
    }
    policyDialog.innerHTML = `<header><h2 id="pagosya-policy-title">${escape(POLICY_TITLES[key])}</h2><button type="button" data-policy-close aria-label="Cerrar">×</button></header><div>${text.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}</div><p class="pagosya-policy-dialog__store">${escape(store.storeName || '')}</p>`;
    policyDialog.addEventListener('close', () => trigger?.focus?.(), { once: true });
    if (typeof policyDialog.showModal === 'function') policyDialog.showModal(); else policyDialog.setAttribute('open', '');
    policyDialog.querySelector('[data-policy-close]')?.focus();
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-pagosya-policy]');
    if (button) { event.preventDefault(); openPolicy(button.dataset.pagosyaPolicy, button); }
  });
  // Reassurance comes only from real store settings; nothing here is a marketing claim.
  function deliveryMarkup(p) {
    const locations = store.locations || [];
    const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${assuranceIcons[name]}</svg>`;
    const pickupPlaces = locations.filter(l => l.pickupEnabled).length;
    const items = p?.fulfillmentType === 'DIGITAL' ? [{ icon: 'digital', title: 'Entrega digital', detail: 'Descarga segura después del pago' }] : [
      (store.shippingPickupEnabled || pickupPlaces) && { icon: 'pickup', title: 'Retiro en tienda', detail: pickupPlaces > 1 ? `${pickupPlaces} sucursales disponibles` : 'Lo eliges al revisar tu pedido', delivery: true },
      (store.shippingEnabled || locations.some(l => l.deliveryEnabled)) && { icon: 'delivery', title: 'Entrega a domicilio', detail: 'El total se confirma al pagar', delivery: true },
    ].filter(Boolean);
    if (store.checkoutMode === 'whatsapp') items.push({ icon: 'chat', title: 'Pedido por WhatsApp', detail: 'Confirmas los detalles con la tienda' });
    else if (store.checkoutMode !== 'external') items.push({ icon: 'payment', title: 'Pago seguro', detail: 'Procesado por pagosYa' });
    // Merchant-authored lines (API-sanitized config.productAssurances) lead the row; the platform's
    // delivery and payment lines above stay derived from store facts and always render after them.
    const authored = Array.isArray(config.productAssurances) ? config.productAssurances.slice(0, 3) : [];
    items.unshift(...authored
      .filter((item) => item && typeof item.title === 'string' && item.title.trim())
      .map((item) => ({ icon: assuranceIcons[item.icon] ? item.icon : 'sparkles', title: String(item.title).slice(0, 40), detail: String(item.detail || '').slice(0, 80) })));
    const hasDeliveryTab = !!(locations.length || store.shippingEnabled || store.shippingPickupEnabled);
    return items.length ? `<ul class="product-detail__assurances" aria-label="Entrega y pago">${items.map(item => {
      const body = `${icon(item.icon)}<div><strong>${escape(item.title)}</strong><span>${escape(item.detail)}</span></div>`;
      return `<li>${item.delivery && hasDeliveryTab ? `<button type="button" data-product-delivery>${body}</button>` : body}</li>`;
    }).join('')}</ul>${policyLinks(['delivery', 'returns'])}` : policyLinks(['delivery', 'returns']);
  }
  /* Product card DNA, swatch=photo: the first photo of a variant that carries this option value (empty when none does). */
  function optionPhoto(groupIndex, value) {
    if (document.documentElement.getAttribute('data-dna-swatch') !== 'photo') return '';
    const found = (selectedProduct?.variants || []).find(v => variantValues(v)[groupIndex] === value && variantPhotos(v)[0]);
    return found ? `<span class="product-detail__swatch-photo" aria-hidden="true"><img src="${escape(variantPhotos(found)[0])}" alt="" loading="lazy" /></span>` : '';
  }
  function optionsMarkup(groups) {
    return `<div class="product-detail__options">${groups.map((group, index) => {
      const colors = group.values.map(value => swatchColor(group.name, value));
      return `<fieldset><legend>${escape(group.name)} <span data-product-selection="${index}"></span></legend><div class="product-detail__values"${colors.every(Boolean) ? ' data-kind="swatch"' : ''}>${group.values.map((value, valueIndex) => `<button type="button" data-part="swatch" data-product-option="${index}" data-option-value="${valueIndex}" aria-pressed="false">${optionPhoto(index, value) || (colors[valueIndex] ? `<span class="product-detail__swatch" style="--swatch:${colors[valueIndex]}" aria-hidden="true"></span>` : '')}<span class="product-detail__option-label">${escape(value)}</span></button>`).join('')}</div></fieldset>`;
    }).join('')}</div>`;
  }
  /** Fill every group with an available value, keeping the shopper's choices where a variant still allows them. */
  function completeSelection(p, preferred) {
    const groups = optionGroups(p);
    if (!groups) return [];
    const result = [];
    for (let index = 0; index < groups.length; index++) {
      const available = value => p.variants.some(v => remaining(p, v) > 0 && variantValues(v).every((candidate, i) => i > index || (i === index ? candidate === value : candidate === result[i])));
      const value = preferred[index] !== undefined && available(preferred[index]) ? preferred[index] : groups[index].values.find(available);
      if (value === undefined) return preferred.slice(0, index);
      result[index] = value;
    }
    return result;
  }
  let selectionNote = '';
  function selectedVariant() {
    const groups = optionGroups(selectedProduct);
    return groups && groups.every((g, i) => selectedOptions[i] !== undefined)
      ? selectedProduct.variants.find(v => variantValues(v).every((value, i) => value === selectedOptions[i])) : null;
  }
  function updateOptions() {
    const p = selectedProduct, groups = optionGroups(p);
    if (!groups) return;
    const prices = optionPrices(groups);
    detail.querySelectorAll('.product-detail__values').forEach((values, index) => { values.toggleAttribute('data-priced', !!prices[index] && groups[index].values.length <= 4); });
    detail.querySelectorAll('[data-product-option]').forEach(button => {
      const index = Number(button.dataset.productOption), value = groups[index].values[Number(button.dataset.optionValue)];
      const amounts = prices[index], amount = amounts?.[Number(button.dataset.optionValue)];
      if (amount != null) {
        const lowest = Math.min(...amounts.filter(value => value != null));
        button.dataset.optionPrice = money(amount, p.currency);
        if (amount > lowest) button.dataset.optionDelta = `+ ${money(amount - lowest, p.currency)}`; else delete button.dataset.optionDelta;
      } else { delete button.dataset.optionPrice; delete button.dataset.optionDelta; }
      // Earlier groups constrain later ones. Changing an earlier choice clears
      // later choices, so sparse catalogs never trap shoppers in a combination.
      const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : i > index || selectedOptions[i] === undefined || candidate === selectedOptions[i]));
      const available = matches.some(v => remaining(p, v) > 0);
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(selectedOptions[index] === value));
      button.setAttribute('aria-label', `${value}${available ? '' : matches.length ? ' · Sin disponibilidad' : ' · Combinación no disponible'}`);
    });
    const variant = selectedVariant(), buy = detail.querySelector('[data-variant-add]');
    const available = variant && remaining(p, variant) > 0;
    buy.disabled = !ready || checkingOut || !available;
    if (variant) buy.dataset.add = lineKey(p.id, variant.id, selectedCadence()); else delete buy.dataset.add;
    const compatible = p.variants.filter(v => remaining(p, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
    const lowest = (compatible.length ? compatible : p.variants).reduce((a, b) => a.amount <= b.amount ? a : b);
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, variant || lowest, !variant);
    groups.forEach((group, index) => { detail.querySelector(`[data-product-selection="${index}"]`).textContent = selectedOptions[index] || ''; });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = variant
      ? available ? `${selectionNote || variant.name}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : 'Ya añadiste la cantidad disponible de esta combinación.'
      : p.variants.some(v => remaining(p, v) > 0) ? 'Selecciona una opción de cada grupo.' : 'Sin disponibilidad para añadir más unidades.';
  }
  function showImage(index) {
    const images = currentGallery();
    if (!images.length) return;
    selectedImage = (index + images.length) % images.length;
    const photo = detail.querySelector(".product-detail__photo");
    // srcset wins over src, so both must change or the first photo keeps showing.
    const set = responsiveSrcset(images[selectedImage]);
    if (set) { photo.srcset = set; photo.sizes = '(max-width: 820px) 100vw, 55vw'; } else photo.removeAttribute('srcset');
    photo.src = images[selectedImage];
    photo.style.objectPosition = imagePosition(selectedProduct, images[selectedImage]);
    photo.alt = `${selectedProduct.name} · imagen ${selectedImage + 1} de ${images.length}`;
    const counter = detail.querySelector("[data-product-count]");
    if (counter) counter.textContent = `${selectedImage + 1} / ${images.length}`;
    detail.querySelectorAll("[data-product-image]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.productImage) === selectedImage)));
  }
  let activeGallery = null;
  const currentGallery = () => activeGallery || galleryImages(selectedProduct);
  /* Product card DNA, gallery=stack|mosaic: every photo full width in place of the thumbnail buttons. The stage stays in the
   * DOM (hidden by CSS) so showImage and the photo-set swap keep working unchanged. */
  function galleryMarkup(images, p) {
    let html = plainGalleryMarkup(images, p);
    const mode = document.documentElement.getAttribute('data-dna-gallery');
    if ((mode === 'stack' || mode === 'mosaic') && images.length > 1) {
      const at = html.indexOf('<div class="product-detail__thumbnails"');
      if (at > -1) html = html.slice(0, at) + `<div class="product-detail__stack" data-part="thumbs">${images.map((url, index) => `<img data-part="thumb" src="${escape(url)}"${responsiveAttrs(url, "(max-width: 820px) 100vw, 55vw")} alt="${escape(`${p.name} · imagen ${index + 1} de ${images.length}`)}" loading="${index ? 'lazy' : 'eager'}" />`).join('')}</div>`;
    }
    return html + '<span class="product-detail__decor" data-part="decor-a" aria-hidden="true"></span>';
  }
  function plainGalleryMarkup(images, p) {
    return images.length ? `<div class="product-detail__stage" data-part="stage">${badgeMarkup(p, 'product-detail__badge')}<img class="product-detail__photo" src="${escape(images[0])}"${responsiveAttrs(images[0], "(max-width: 820px) 100vw, 55vw")} alt="${escape(p.name)}" /><div class="product-detail__navigation"${images.length > 1 ? '' : ' hidden'}>${images.length > 1 ? '<button type="button" data-product-prev aria-label="Foto anterior">←</button>' : ''}<span data-product-count aria-live="polite">1 / ${images.length}</span>${images.length > 1 ? '<button type="button" data-product-next aria-label="Foto siguiente">→</button>' : ''}</div></div>${images.length > 1 ? `<div class="product-detail__thumbnails" data-part="thumbs" aria-label="Elegir foto">${images.map((url, index) => `<button type="button" data-part="thumb" data-product-image="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === 0}"><img src="${escape(url)}"${responsiveAttrs(url, "56px")} alt="" loading="lazy" /></button>`).join('')}</div>` : ''}` : '<p class="product-detail__empty">Sin fotos disponibles</p>';
  }
  function drawGallery(images) {
    const gallery = detail.querySelector('.product-detail__gallery');
    gallery.innerHTML = galleryMarkup(images, selectedProduct);
    gallery.hidden = !images.length;
    gallery.toggleAttribute('data-rail', images.length > 1);
    selectedImage = 0;
    showImage(0);
  }
  function openProduct(id, trigger) {
    const p = products().find(p => p.id === id);
    if (!p) { if (fullProductPage) detail.innerHTML = `<h1>Producto no disponible</h1><p>Este producto ya no está en el catálogo.</p><a href="${escape(pageHref('productos.html'))}">Explorar productos</a>`; return; }
    track('product_view', undefined, { value: price(p), currency: p.currency });
    analytics('product_view', { productId: p.id }, 'view:' + p.id);
    selectedProduct = p; selectedImage = 0; selectedQuantity = 1; detailTrigger = trigger; selectionNote = ''; selectedPicks = [];
    activeGallery = null;
    selectedOptions = completeSelection(p, []);
    const images = galleryImages(p), box = boxGroup(p), complex = !box && (p.variants?.length || p.extras?.length), groups = optionGroups(p);
    const style = productPageStyle();
    detail.dataset.style = style;
    adoptAuthoredAction();
    // Stores nearly always author their own way back right above the mount; a second trail beside it reads as a template.
    let authoredTrail = false;
    for (let node = fullProductPage ? detail.previousElementSibling : null; node && !node.matches('header,[role=banner]'); node = node.previousElementSibling) if (node.matches('a[href]') || node.querySelector('a[href]')) { authoredTrail = true; break; }
    const breadcrumb = authoredTrail ? '' : `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('productos.html'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>`;
    detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}<div class="product-detail__layout"${images.length ? '' : ' data-no-images'}><section class="product-detail__gallery" data-part="gallery" aria-label="Fotos del producto"${images.length ? '' : ' hidden'}${images.length > 1 ? ' data-rail' : ''}>${galleryMarkup(images, p)}</section><section class="product-detail__copy"><span class="product-detail__decor" data-part="decor-b" aria-hidden="true"></span>${fullProductPage ? breadcrumb : ''}<p class="product-detail__eyebrow" data-part="eyebrow">${escape((store.categories || []).find(c => c.id === p.categoryId)?.name || store.storeName || 'Tu tienda')}</p><${fullProductPage ? "h1" : "h2"} id="pagosya-product-title" data-part="title"${p.name.length > 32 ? ' data-length="long"' : ''}>${escape(p.name)}</${fullProductPage ? "h1" : "h2"}>${fullProductPage ? '<p class="product-detail__rating" data-product-rating hidden></p>' : ''}<div class="product-detail__pricing" data-product-pricing>${isMembership(p) ? `<strong class="product-detail__price">${escape(membershipPriceText(p))}</strong>` : priceMarkup(p)}</div>${p.description ? `<p class="product-detail__intro" data-part="intro">${escape(p.description)}</p>` : ''}${style === 'dense' ? specChipsMarkup(p) : ''}${style !== 'dense' ? highlightsMarkup(p) : ''}${isMembership(p) ? membershipMarkup(p) : groups ? `${optionsMarkup(groups)}${subscriptionChoice(p)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-variant-add disabled>Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : limit(p) === 0 ? '<p>Agotado</p>' : box ? `${boxMarkup(p, box)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-box-add disabled>Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : complex ? preview || config.demo ? '<button class="product-detail__buy checkout-button" disabled>Elegir opciones en la tienda</button>' : `<a class="product-detail__buy checkout-button" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `${subscriptionChoice(p)}${quantityMarkup(`<button class="product-detail__buy checkout-button" type="button" data-add="${escape(p.id)}">Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>`)}`}<p class="product-detail__status" role="status" aria-live="polite"></p>${style === 'dense' ? highlightsMarkup(p) : ''}${deliveryMarkup(p)}${productInformation(p)}</section></div>${contentBlocksMarkup(p)}${fullProductPage ? longPageTop(p) : ''}${fullProductPage ? `${bundleOffersMarkup(p)}${relatedMarkup(p)}<section class="product-detail__reviews" id="product-reviews" data-product-reviews aria-labelledby="product-reviews-title" hidden></section>${longPageBottom(p)}<div class="product-detail__sticky-space" data-product-sticky-space hidden></div><div class="product-detail__sticky" data-product-sticky hidden><div><strong>${escape(p.name)}</strong><span data-product-sticky-price></span></div><button type="button" data-product-jump>${isMembership(p) ? 'Hacerme miembro' : 'Añadir'}</button></div>` : ''}`;
    detail.removeAttribute('data-page-template');
    applyProductPageTemplate();
    showImage(0);
    if (fullProductPage && (!images.length || style === 'dense' || style === 'story-led') && !detail.hasAttribute('data-page-template')) {
      // Mobile reads identity, purchase, then details; desktop places the purchase panel beside both.
      const copy = detail.querySelector('.product-detail__copy'), [summary, buybox, details] = ['summary', 'buybox', 'details'].map(name => Object.assign(document.createElement('div'), { className: 'product-detail__' + name }));
      for (const child of [...copy.children]) (child.matches('.product-detail__pricing,.product-detail__options,.product-detail__box,.product-detail__subscription,.product-detail__purchase,.product-detail__buy,.product-detail__status,.product-detail__assurances,p:not([class])') ? buybox : child.matches('.product-tabs,[role=tabpanel]') ? details : summary).append(child);
      copy.append(summary, buybox, ...(details.children.length ? [details] : [])); copy.dataset.split = '';
      if (style === 'story-led') {
        detail.querySelector('.product-detail__layout').prepend(summary);
        copy.dataset.story = '';
      }
    }
    if (MOTIFS.length) { placeProductMotif(p); placeButtonMotifs(detail); }
    watchHighlights();
    watchStickyBar();
    decorateProductReviews();
    renderCart();
    if (!fullProductPage && !detail.open) { oldOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; detail.showModal(); }
    detail.querySelector("[data-product-close]")?.focus();
    let touchStart;
    const gallery = detail.querySelector(".product-detail__gallery");
    gallery?.addEventListener("touchstart", event => { if (event.target.closest('.product-detail__photo')) touchStart = event.touches[0]; }, { passive: true });
    gallery?.addEventListener("touchend", event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.clientX, dy = event.changedTouches[0].clientY - touchStart.clientY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showImage(selectedImage + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
  }
  // Stores without accent tokens often color their action through .checkout-button; the product page keeps that brand color.
  function adoptAuthoredAction() {
    const root = getComputedStyle(document.documentElement);
    if (detail.style.getPropertyValue('--pd-accent') || ['--store-accent', '--brand-accent', '--accent'].some(name => root.getPropertyValue(name).trim())) return;
    const probe = Object.assign(document.createElement('button'), { className: 'checkout-button', type: 'button', hidden: true });
    probe.style.cssText = 'display:block!important;position:absolute;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const action = getComputedStyle(probe), background = action.backgroundColor;
    if (!/^rgba?\(0, 0, 0, 0\)$|transparent/.test(background)) { detail.style.setProperty('--pd-accent', background); detail.style.setProperty('--pd-on-accent', action.color); }
    probe.remove();
  }
  // Icons for owner-approved highlights. Each keeps one gentle loop; the kit owns the drawings.
  const highlightIcons = {
    car: { motion: 'roll', paths: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>' },
    fuel: { motion: 'drip', paths: '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.8a2 2 0 0 0-.6-1.4L18 5"/>' },
    gauge: { motion: 'sweep', paths: '<path d="M3.3 19a10 10 0 1 1 17.4 0"/><path d="m12 14 4-4"/>' },
    gear: { motion: 'spin', paths: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' },
    seat: { motion: 'settle', paths: '<path d="M5 18v-2a3 3 0 0 1 3-3h3"/><path d="M8 13V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v9"/><path d="M5 18h13"/><path d="M18 15v6"/>' },
    road: { motion: 'stream', paths: '<path d="M4 22 8 2"/><path d="M20 22 16 2"/><path d="M12 6v3M12 12v3M12 18v3"/>' },
    truck: { motion: 'roll', paths: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>' },
    package: { motion: 'bob', paths: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/>' },
    clock: { motion: 'tick', paths: '<circle cx="12" cy="12" r="9"/><path class="pd-hand" d="M12 7v5l3 2"/>' },
    calendar: { motion: 'bob', paths: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
    bolt: { motion: 'flicker', paths: '<path d="M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z"/>' },
    battery: { motion: 'fill', paths: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path class="pd-level" d="M5 10v4"/>' },
    plug: { motion: 'nudge', paths: '<path d="M12 22v-5"/><path d="M9 7V2M15 7V2"/><path d="M7 7h10v4a5 5 0 0 1-10 0z"/>' },
    wifi: { motion: 'pulse', paths: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>' },
    chip: { motion: 'pulse', paths: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3"/>' },
    screen: { motion: 'glow', paths: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>' },
    leaf: { motion: 'sway', paths: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>' },
    ruler: { motion: 'nudge', paths: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>' },
    drop: { motion: 'drip', paths: '<path d="M12 3c3 4 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 3-6 6-10z"/>' },
    sun: { motion: 'rays', paths: '<circle cx="12" cy="12" r="4"/><path class="pd-rays" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>' },
    flame: { motion: 'flicker', paths: '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 3 1-1-2 0-4 0-6z"/>' },
    snowflake: { motion: 'spin', paths: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>' },
    shirt: { motion: 'sway', paths: '<path d="M15 3a3 3 0 0 1-6 0"/><path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3"/>' },
    wash: { motion: 'drum', paths: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 6h.01M11 6h.01"/><circle class="pd-drum" cx="12" cy="14" r="5"/><path class="pd-drum" d="M9.5 14a2.5 2.5 0 0 1 5 0"/>' },
    sparkle: { motion: 'twinkle', paths: '<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="pd-spark" d="M19 15l.7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8L16.5 18l1.8-.7z"/>' },
    hand: { motion: 'wave', paths: '<path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10V4a1.5 1.5 0 0 1 3 0v8"/><path d="M17 11V7a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a1.5 1.5 0 0 1 3 0v1"/><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/>' },
    scissors: { motion: 'snip', paths: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path class="pd-blade" d="M8.1 7.9 20 20"/><path class="pd-blade" d="M8.1 16.1 20 4"/>' },
    cup: { motion: 'steam', paths: '<path class="pd-steam" d="M8 3v3M12 2v4M16 3v3"/><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/>' },
    wheat: { motion: 'sway', paths: '<path d="M12 22V9"/><path d="M12 9c0-2 1.5-4 4-4 0 2.5-1.5 4-4 4z"/><path d="M12 9c0-2-1.5-4-4-4 0 2.5 1.5 4 4 4z"/><path d="M12 15c0-2 1.5-4 4-4 0 2.5-1.5 4-4 4z"/><path d="M12 15c0-2-1.5-4-4-4 0 2.5 1.5 4 4 4z"/>' },
    'chef-hat': { motion: 'bob', paths: '<path d="M6 21h12"/><path d="M7 18h10v-4a4 4 0 0 0 .8-7.8A4 4 0 0 0 12 3a4 4 0 0 0-5.8 3.2A4 4 0 0 0 7 14z"/>' },
    bottle: { motion: 'tilt', paths: '<path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z"/><path d="M8 13h8"/>' },
    thermometer: { motion: 'bob', paths: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v6"/>' },
    laptop: { motion: 'tilt', paths: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>' },
    backpack: { motion: 'sway', paths: '<path d="M5 10a7 7 0 0 1 14 0v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 14h8v4"/>' },
    umbrella: { motion: 'sway', paths: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>' },
    shield: { motion: 'draw', paths: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path class="pd-check" d="m9 12 2 2 4-4"/>' },
    star: { motion: 'twinkle', paths: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z"/>' },
    heart: { motion: 'beat', paths: '<path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>' },
    recycle: { motion: 'spin', paths: '<path d="M7 19H5a2 2 0 0 1-1.7-3l1.6-2.7"/><path d="m9 22 2-3-3-2"/><path d="M17 5.5 15.5 3a2 2 0 0 0-3.4 0L10.5 5.7"/><path d="m8 4 3.5.3L11 7.8"/><path d="M19 19h-7"/><path d="m15 22 3-3-3-3"/>' },
    check: { motion: 'draw', paths: '<circle cx="12" cy="12" r="9"/><path class="pd-check" d="m8.5 12.5 2.5 2.5 4.5-5"/>' },
  };
  function highlightsMarkup(p) {
    const rows = (Array.isArray(p?.highlights) ? p.highlights : [])
      .filter(row => row && highlightIcons[row.icon] && typeof row.label === 'string' && row.label.trim())
      .slice(0, 6);
    if (!rows.length) return '';
    return `<ul class="product-detail__highlights" data-part="highlights" aria-label="Destacados del producto">${rows.map(row => {
      const icon = highlightIcons[row.icon];
      const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
      return `<li><svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg><div><strong>${escape(row.label.trim())}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }
  function specRows(p) {
    return (Array.isArray(p?.specifications) ? p.specifications : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string' && row.label.trim() && row.value.trim());
  }
  function contentBlocksMarkup(p) {
    const blocks = [];
    for (const block of Array.isArray(p?.contentBlocks) ? p.contentBlocks : []) {
      if (!block || typeof block.alt !== 'string' || !block.alt.trim()) continue;
      if (block.type === 'media') {
        const url = safeUrl(block.imageUrl);
        if (!url) continue;
        blocks.push(`<figure class="product-detail__block" data-part="block" data-part-type="media"><img data-part="block-media" src="${escape(url)}" alt="${escape(block.alt)}" loading="lazy">${typeof block.caption === 'string' && block.caption.trim() ? `<figcaption>${escape(block.caption)}</figcaption>` : ''}</figure>`);
      } else if (block.type === 'compare') {
        const before = safeUrl(block.beforeUrl), after = safeUrl(block.afterUrl);
        if (!before || !after || ['title', 'beforeLabel', 'afterLabel'].some(key => typeof block[key] !== 'string' || !block[key].trim())) continue;
        blocks.push(`<div class="product-detail__block" data-part="block" data-part-type="compare" data-part-compare><h3>${escape(block.title)}</h3><div class="product-detail__compare" data-part="block-compare" style="--pd-compare:50%"><img class="pd-compare__before" src="${escape(before)}" alt="${escape(block.alt)}" loading="lazy"><img class="pd-compare__after" src="${escape(after)}" alt="" loading="lazy"><span class="pd-compare__label pd-compare__label--before">${escape(block.beforeLabel)}</span><span class="pd-compare__label pd-compare__label--after">${escape(block.afterLabel)}</span></div><input class="pd-compare__range" type="range" min="0" max="100" value="50" aria-label="Comparar: ${escape(block.beforeLabel)} y ${escape(block.afterLabel)}"></div>`);
      }
      if (blocks.length === 6) break;
    }
    return blocks.length ? `<section class="product-detail__blocks" data-part="blocks" aria-label="Más sobre este producto">${blocks.join('')}</section>` : '';
  }
  /* The long product page (spec 2026-10-09): product data the store draws below the product. Text is escaped, photos
   * go through safeUrl, and the repeated buy button only scrolls to the purchase box, so options are never skipped. */
  const pageBlock = (p, type) => (Array.isArray(p?.contentBlocks) ? p.contentBlocks : []).find(block => block && block.type === type);
  const nonEmpty = value => typeof value === 'string' && value.trim();
  function buyAgainMarkup() {
    const lines = [];
    if (store.shippingEnabled) lines.push('Envío a domicilio');
    if (store.shippingPickupEnabled) lines.push('Retiro en tienda');
    if (nonEmpty(storePolicies().returns)) lines.push('Cambios y devoluciones según la política de la tienda');
    return `<div class="product-long__buy" data-part="buy-again"><button type="button" class="checkout-button" data-buy-again>Comprar ahora</button>${lines.length ? `<p>${lines.map(escape).join(' · ')}</p>` : ''}</div>`;
  }
  function longPageTop(p) {
    const parts = [];
    const features = pageBlock(p, 'features');
    const featureItems = (features?.items || []).filter(item => item && highlightIcons[item.icon] && nonEmpty(item.label));
    if (featureItems.length >= 3) parts.push(`<section class="product-long__features" data-part="features"><h2>${escape(nonEmpty(features.title) || 'Lo que lo hace especial')}</h2><ul>${featureItems.map(item => { const icon = highlightIcons[item.icon]; return `<li data-part="feature"><svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg><strong>${escape(item.label)}</strong>${nonEmpty(item.detail) ? `<span>${escape(item.detail)}</span>` : ''}</li>`; }).join('')}</ul></section>`);
    const story = pageBlock(p, 'story');
    if (story && nonEmpty(story.problem) && nonEmpty(story.tried) && nonEmpty(story.solution)) parts.push(`<section class="product-long__story" data-part="story">${nonEmpty(story.title) ? `<h2>${escape(story.title)}</h2>` : ''}<p data-part="story-problem">${escape(story.problem)}</p><p data-part="story-tried">${escape(story.tried)}</p><p data-part="story-solution">${escape(story.solution)}</p></section>`);
    const details = (pageBlock(p, 'details')?.items || []).map(item => ({ ...item, url: safeUrl(item?.imageUrl) })).filter(item => item.url && nonEmpty(item.title) && nonEmpty(item.alt));
    if (details.length) parts.push(`<section class="product-long__details" data-part="details">${details.map(item => `<figure data-part="detail"><img src="${escape(item.url)}" alt="${escape(item.alt)}" loading="lazy"><figcaption><strong>${escape(item.title)}</strong>${nonEmpty(item.text) ? `<span>${escape(item.text)}</span>` : ''}</figcaption></figure>`).join('')}</section>`);
    if (parts.length) parts.push(buyAgainMarkup());
    const versus = pageBlock(p, 'versus');
    const rows = (versus?.rows || []).filter(row => row && nonEmpty(row.label) && typeof row.ours === 'boolean' && typeof row.theirs === 'boolean');
    if (versus && rows.length >= 2 && nonEmpty(versus.ours) && nonEmpty(versus.theirs)) {
      const mark = yes => `<span class="product-long__mark" data-yes="${yes}" aria-label="${yes ? 'Sí' : 'No'}">${yes ? '✓' : '✕'}</span>`;
      parts.push(`<section class="product-long__versus" data-part="versus">${nonEmpty(versus.title) ? `<h2>${escape(versus.title)}</h2>` : ''}<table><thead><tr><th scope="col"><span class="product-detail__sr">Característica</span></th><th scope="col">${escape(versus.ours)}</th><th scope="col">${escape(versus.theirs)}</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.label)}</th><td>${mark(row.ours)}</td><td>${mark(row.theirs)}</td></tr>`).join('')}</tbody></table></section>`);
    }
    return parts.length ? `<div class="product-long" data-part="long-page">${parts.join('')}</div>` : '';
  }
  function longPageBottom(p) {
    const faq = pageBlock(p, 'faq');
    const items = (faq?.items || []).filter(item => item && nonEmpty(item.q) && nonEmpty(item.a));
    const hasTop = !!longPageTop(p);
    if (!hasTop && items.length < 2) return '';
    return `<div class="product-long" data-part="long-page">${hasTop ? buyAgainMarkup() : ''}${items.length >= 2 ? `<section class="product-long__faq" data-part="faq"><h2>${escape(nonEmpty(faq.title) || 'Preguntas frecuentes')}</h2>${items.map(item => `<details data-part="faq-item"><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</section>` : ''}</div>`;
  }
  // A stored choice wins; older stores read their catalog, and spec-heavy catalogs get the dense page.
  function productPageStyle() {
    if (['editorial', 'dense', 'image-led', 'story-led'].includes(config.productPageStyle)) return config.productPageStyle;
    const items = products();
    return items.length && items.filter(p => specRows(p).length >= 3).length * 2 >= items.length ? 'dense' : 'editorial';
  }
  function specChipsMarkup(p) {
    const chips = specRows(p).filter(row => row.value.trim().length <= 24).slice(0, 4);
    return chips.length ? `<ul class="product-detail__chips" aria-label="Características">${chips.map(row => `<li><span class="product-detail__sr">${escape(row.label.trim())}: </span>${escape(row.value.trim())}</li>`).join('')}</ul>` : '';
  }
  function productInformation(p) {
    const delivery = (store.locations || []).map(l => `<li><strong>${escape(l.name)}</strong>${l.address ? `<br>${escape(l.address)}` : ''}<br>${[l.pickupEnabled && 'Retiro en tienda', l.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`).join('');
    const tags = Array.isArray(p.tags) ? [...new Set(p.tags.filter(tag => typeof tag === 'string' && tag.trim()))] : [];
    const panels = [];
    const specs = specRows(p).slice(0, 8);
    if (tags.length || specs.length) panels.push({ id: 'description', label: 'Detalles', content: `${specs.length ? `<dl class="product-detail__specs">${specs.map(row => `<div><dt>${escape(row.label.trim())}</dt><dd>${escape(row.value.trim())}</dd></div>`).join('')}</dl>` : ''}${tags.length ? `<ul class="product-detail__facts">${tags.map(tag => { const fact = tag.match(/^([^:]{1,40}):\s*(\S.*)$/); return fact ? `<li class="product-detail__fact"><span>${escape(fact[1].trim())}</span><span>${escape(fact[2])}</span></li>` : `<li>${escape(tag)}</li>`; }).join('')}</ul>` : ''}` });
    if (delivery || store.shippingEnabled || store.shippingPickupEnabled) panels.push({ id: 'delivery', label: 'Envíos y retiro', content: `${delivery ? `<ul class="product-delivery-list">${delivery}</ul>` : ''}<p>Elige la opción disponible al revisar tu pedido. El total final se confirma en pagosYa.</p>` });
    if (!panels.length) return '';
    return `<div class="product-tabs" role="tablist" aria-label="Información del producto">${panels.map((panel, index) => `<button type="button" role="tab" id="product-${panel.id}-tab" aria-controls="product-${panel.id}-panel" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-product-tab="${panel.id}">${panel.label}</button>`).join('')}</div>${panels.map((panel, index) => `<div role="tabpanel" id="product-${panel.id}-panel" aria-labelledby="product-${panel.id}-tab" tabindex="0"${index ? ' hidden' : ''}>${panel.content}</div>`).join('')}`;
  }
  function selectProductTab(button) {
    detail.querySelectorAll('[data-product-tab]').forEach(tab => {
      const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      detail.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !active;
    });
  }
  detail.addEventListener("close", () => { document.documentElement.style.overflow = oldOverflow; detailTrigger?.focus(); selectedProduct = null; });
  detail.addEventListener('change', event => {
    if (!selectedProduct || !event.target.matches('[name=purchaseMode],[name=subscriptionCadence]')) return;
    const buy = detail.querySelector('.product-detail__buy[data-add], .product-detail__buy[data-variant-add]'), variant = optionGroups(selectedProduct) ? selectedVariant() : undefined;
    if (buy && (variant || !selectedProduct.variants?.length)) buy.dataset.add = lineKey(selectedProduct.id, variant?.id, selectedCadence());
    updateQuantity();
    renderCart();
  });
  // "Comprar ahora" on the long product page brings the shopper back to the purchase box, so options are never skipped.
  detail.addEventListener("click", event => {
    if (!event.target.closest?.("[data-buy-again]")) return;
    const target = detail.querySelector(".product-detail__options button:not([disabled]), .product-detail__options input, .product-detail__options select, .product-detail__buy:not([hidden])");
    target?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target?.focus({ preventScroll: true });
  });
  detail.addEventListener("click", event => {
    if (fullProductPage || event.target !== detail) return;
    const rect = detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) detail.close();
  });
  detail.addEventListener("keydown", event => {
    if (event.target.closest('.pd-compare__range')) return;
    const tab = event.target.closest('[data-product-tab]');
    if (tab) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const tabs = [...detail.querySelectorAll('[data-product-tab]')];
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectProductTab(next); next.focus();
      }
      return;
    }
    if (event.target.closest('[data-product-option]')) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); showImage(selectedImage + (event.key === "ArrowRight" ? 1 : -1)); }
  });
  detail.addEventListener('input', event => {
    if (!event.target.matches('.pd-compare__range')) return;
    const compare = event.target.closest('[data-part-compare]')?.querySelector('.product-detail__compare');
    const value = Number(event.target.value);
    if (compare && Number.isFinite(value)) compare.style.setProperty('--pd-compare', Math.max(0, Math.min(100, value)) + '%');
  });
  // Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.
  const checkoutSlots = [...document.querySelectorAll("[data-pagosya-checkout]")];
  for (const slot of checkoutSlots) slot.hidden = true;
  const checkoutPage = checkoutSlots[0] || fullCheckoutPage || document.createElement("section");
  // The runtime supplies one order review inside the active checkout surface.
  // Some authored pages also leave a sibling review slot; do not show two payment forms.
  if (fullCheckoutPage) document.querySelectorAll('[data-pagosya-cart][data-checkout-review]').forEach(slot => {
    if (slot !== checkoutPage && !checkoutPage.contains(slot)) {
      slot.hidden = true; slot.inert = true; slot.setAttribute('data-pagosya-redundant-review', '');
    }
  });
  checkoutPage.setAttribute("data-pagosya-checkout", "");
  checkoutPage.hidden = true;
  if (!fullCheckoutPage) document.body.append(checkoutPage);
  const checkoutStyle = document.createElement("style");
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
    @layer pagosya-commerce {
    [data-pagosya-checkout]:not([hidden]){display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;overscroll-behavior:contain;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font-family:inherit;padding:clamp(20px,5vw,64px)}
    [data-pagosya-checkout] *{box-sizing:border-box}
    [data-pagosya-checkout] .checkout-page__inner{max-width:1000px;margin:auto}
    [data-pagosya-checkout] .checkout-page__back{display:inline-flex;align-items:center;min-height:44px;padding:8px 0;margin:0 0 32px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-checkout] h1{margin:0 0 16px;font-size:clamp(30px,5vw,52px);line-height:1.1;font-weight:800}
    [data-pagosya-checkout] h1[tabindex="-1"]:focus:not(:focus-visible){outline:none}
    [data-pagosya-checkout] .checkout-page__intro{max-width:60ch;line-height:1.6;margin:0 0 32px}
    [data-pagosya-checkout] .checkout-page__layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:clamp(24px,5vw,64px)}
    [data-pagosya-checkout] .checkout-page__summary{padding:24px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:12px;align-self:start;background:var(--store-surface,var(--brand-surface,transparent))}
    [data-pagosya-checkout] .checkout-page__summary h2{margin:0 0 20px;font-size:22px}
    [data-pagosya-checkout] .order-items{list-style:none;padding:0;margin:0}
    [data-pagosya-checkout] .order-item{display:block;padding:16px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    [data-pagosya-checkout] .order-item>div:first-child{display:flex;justify-content:space-between;gap:16px;line-height:1.5}
    [data-pagosya-checkout] .quantity{display:flex;align-items:center;gap:12px;margin-top:12px}
    [data-pagosya-checkout] .quantity button{width:44px;min-height:44px;background:transparent;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));border-radius:50%;font:inherit;color:inherit;cursor:pointer}
    [data-pagosya-checkout] .order-field{display:grid;gap:8px;margin:20px 0;font:inherit}
    [data-pagosya-checkout] select{width:100%;min-height:44px;padding:8px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:inherit;font:inherit}
    [data-pagosya-checkout] .order-total{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:20px}
    [data-pagosya-checkout] .order-note{font-size:14px;line-height:1.6;color:inherit;opacity:.8}
    [data-pagosya-checkout] .checkout-button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:48px;padding:12px 20px;border:0;border-radius:var(--store-radius,var(--brand-radius,0px));background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,CanvasText))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,Canvas)));font:inherit;font-weight:700;cursor:pointer}
    [data-pagosya-checkout] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-checkout] [data-pagosya-status]{margin:24px 0;font-size:15px;line-height:1.6}
    @media(max-width:640px){[data-pagosya-checkout] .checkout-page__layout{grid-template-columns:1fr}[data-pagosya-checkout] .checkout-page__summary{padding:20px}}
  `;
  checkoutStyle.textContent += `
    }
    :where([data-pagosya-checkout-page]):not([hidden]){position:static;inset:auto;z-index:auto;overflow:visible;background:inherit;color:inherit}
  `;
  document.head.append(checkoutStyle);
  // Native dialog owns modal focus, Escape and the backdrop. Authored cart markup
  // is moved into it while open so there is only one editable copy of that cart.
  // A generated dialog cannot serve as a closed dialog inside our cart dialog.
  // Normalize only this runtime-owned slot; preserve the author's other markup.
  document.querySelectorAll('dialog[data-pagosya-cart]').forEach(slot => {
    const container = document.createElement('div');
    for (const attr of [...slot.attributes]) if (!['open', 'aria-modal', 'aria-label', 'aria-labelledby', 'role'].includes(attr.name)) container.setAttribute(attr.name, attr.value);
    container.classList.remove('cart-drawer'); container.hidden = true;
    container.append(...slot.childNodes); slot.replaceWith(container);
  });
  // An empty mount is reserved for the drawer. Preserve deliberately authored
  // inline cart content, but do not append a second empty order below the footer.
  // Every control that opens the cart (source-commerce-contract accepts these); the click handler, the drawer mount
  // and the added-notice overlap check share it. A link or button holding the cart count opens the cart too.
  const CART_TRIGGERS = '[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]';
  const cartTriggers = () => [...new Set([...document.querySelectorAll(CART_TRIGGERS), ...[...document.querySelectorAll('[data-cart-count]')].map(count => count.closest('a,button')).filter(Boolean)])].filter(el => !el.closest('template'));
  const authoredDrawerTrigger = [...document.querySelectorAll(CART_TRIGGERS)].find(el => !el.closest('template'));
  if (authoredDrawerTrigger) document.querySelectorAll('[data-pagosya-cart]:not([data-checkout-review])').forEach(slot => {
    if (!slot.childElementCount && !slot.textContent.trim()) slot.hidden = true;
  });
  const cartDrawer = document.createElement('dialog');
  cartDrawer.className = 'cart-drawer';
  cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title');
  cartDrawer.innerHTML = '<header class="cart-drawer__header"><h2 id="cart-drawer-title">Tu pedido</h2><button type="button" data-cart-close aria-label="Cerrar pedido">×</button></header><div class="cart-drawer__body"></div><button type="button" class="cart-drawer__continue" data-cart-close>Seguir comprando</button>';
  document.body.append(cartDrawer);
  // A bottom-sheet cart shows a grab handle; the element only exists for stores with a DNA.
  if (hasDna) cartDrawer.querySelector('.cart-drawer__header').insertAdjacentHTML('afterbegin', '<span class="cart-drawer__grip" aria-hidden="true"></span>');
  function renderPolicyLinks() {
    cartDrawer.querySelector(':scope > .pagosya-policies')?.remove();
    const drawerPolicies = policyLinks(['returns', 'delivery', 'terms', 'privacy']);
    if (drawerPolicies) cartDrawer.insertAdjacentHTML('beforeend', drawerPolicies);
    document.querySelectorAll('[data-pagosya-policies]').forEach(slot => { slot.innerHTML = policyLinks(); slot.hidden = !slot.innerHTML; });
    renderInfoPages();
  }
  renderPolicyLinks();
  let drawerSlot, drawerPlaceholder, drawerWasHidden, drawerDisplay, drawerHadStyle, drawerOverflow, drawerTrigger;
  function openCart(trigger, keyboard = false) {
    if (cartDrawer.open || checkingOut) return;
    if (detail.open) detail.close();
    drawerTrigger = trigger;
    drawerSlot = [...document.querySelectorAll('[data-pagosya-cart]')].find(el => !el.hasAttribute('data-checkout-review')) || document.createElement('div');
    drawerSlot.setAttribute('data-pagosya-cart', '');
    drawerPlaceholder = document.createComment('cart slot');
    if (drawerSlot.isConnected) drawerSlot.replaceWith(drawerPlaceholder);
    drawerWasHidden = drawerSlot.hidden; drawerSlot.hidden = false;
    // Generated designs commonly hide this empty mount with a class (or inline display:none).
    // The platform owns its visibility only while it is inside the open drawer, including
    // authored !important rules; restore the precise display declaration when returning it.
    drawerHadStyle = drawerSlot.hasAttribute('style');
    drawerDisplay = [drawerSlot.style.getPropertyValue('display'), drawerSlot.style.getPropertyPriority('display')];
    drawerSlot.style.setProperty('display', 'block', 'important');
    cartDrawer.querySelector('.cart-drawer__body').append(drawerSlot);
    drawerOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    cartDrawer.dataset.instant = String(keyboard || config.motion === 'off');
    delete addedNotice.dataset.visible;
    cartDrawer.showModal(); renderCart();
    const templated = Boolean(drawerSlot.querySelector('[data-cart-panel]'));
    cartDrawer.toggleAttribute('data-template', templated);
    if (templated) { cartDrawer.removeAttribute('aria-labelledby'); cartDrawer.setAttribute('aria-label', 'Tu pedido'); }
    else { cartDrawer.removeAttribute('aria-label'); cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title'); }
    analytics('cart_open');
    (cartDrawer.querySelector('[data-cart-panel] [data-cart-close]') || cartDrawer.querySelector('[data-cart-close]')).focus();
  }
  function restoreDrawer() {
    if (!drawerSlot) return;
    if (drawerDisplay[0]) drawerSlot.style.setProperty('display', drawerDisplay[0], drawerDisplay[1]);
    else drawerSlot.style.removeProperty('display');
    if (!drawerHadStyle && !drawerSlot.getAttribute('style')) drawerSlot.removeAttribute('style');
    if (drawerPlaceholder?.isConnected) { drawerSlot.hidden = drawerWasHidden; drawerPlaceholder.replaceWith(drawerSlot); }
    else drawerSlot?.remove();
    document.documentElement.style.overflow = drawerOverflow || '';
    drawerTrigger?.focus({ preventScroll: true }); drawerSlot = null;
  }
  cartDrawer.addEventListener('close', restoreDrawer);
  cartDrawer.addEventListener('click', event => {
    if (event.target.closest('[data-cart-close]')) cartDrawer.close();
    if (event.target === cartDrawer) {
      const rect = cartDrawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) cartDrawer.close();
    }
  });
  document.addEventListener('click', event => {
    const trigger = event.target.closest(CART_TRIGGERS)
      || event.target.closest('a,button')?.querySelector('[data-cart-count]')?.closest('a,button');
    if (!trigger) return;
    event.preventDefault(); event.stopImmediatePropagation(); openCart(trigger, event.detail === 0);
  }, true);
  const addedNotice = document.createElement('div');
  addedNotice.className = 'cart-added'; addedNotice.setAttribute('role', 'status'); addedNotice.setAttribute('aria-live', 'polite');
  addedNotice.innerHTML = '<span></span><button type="button" data-cart-open>Ver pedido</button>';
  document.body.append(addedNotice);
  let addedTimer;
  /* DNA placements: the bubble hangs under the cart button, the inline note under the pressed button.
   * Whatever the placement, the note never covers a cart button (phone headers especially): it moves to the other edge. */
  function placeAddedNotice(button) {
    if (!hasDna) return;
    for (const name of ['--added-top', '--added-left', '--added-right', '--added-arrow']) addedNotice.style.removeProperty(name);
    delete addedNotice.dataset.flip;
    const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const triggers = cartTriggers().filter(el => !addedNotice.contains(el) && !cartDrawer.contains(el) && shown(el));
    const placement = document.documentElement.getAttribute('data-dna-added');
    const cartBox = triggers[0]?.getBoundingClientRect();
    if (placement === 'bubble') {
      addedNotice.style.setProperty('--added-top', `${cartBox ? Math.round(cartBox.bottom + 10) : 16}px`);
      // Hang from the side the cart button is on, so the bubble stays on screen.
      if (cartBox && cartBox.left + cartBox.width / 2 < innerWidth / 2) addedNotice.style.setProperty('--added-left', `${Math.max(12, Math.round(cartBox.left))}px`);
      else addedNotice.style.setProperty('--added-right', `${cartBox ? Math.max(12, Math.round(innerWidth - cartBox.right)) : 16}px`);
    }
    if (placement === 'inline' && button?.isConnected) {
      const r = button.getBoundingClientRect();
      addedNotice.style.setProperty('--added-top', `${Math.round(Math.min(r.bottom + 8, innerHeight - 96))}px`);
      addedNotice.style.setProperty('--added-left', `${Math.round(Math.max(12, Math.min(r.left, innerWidth - 332)))}px`);
    }
    const box = addedNotice.getBoundingClientRect();
    if (placement === 'bubble' && cartBox && box.width) addedNotice.style.setProperty('--added-arrow', `${Math.round(Math.max(14, Math.min(box.width - 26, cartBox.left + cartBox.width / 2 - box.left - 6)))}px`);
    const covers = triggers.some(el => { const r = el.getBoundingClientRect(); return r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top; });
    if (covers) addedNotice.dataset.flip = box.top + box.bottom < innerHeight ? 'bottom' : 'top';
  }
  function addedFeedback(product, button, keyboard) {
    if (button.closest('[data-pagosya-cart]')) return;
    addedNotice.dataset.instant = String(keyboard || config.motion === 'off');
    const template = addedTemplate();
    if (template && !addedNotice.hasAttribute('data-template')) { addedNotice.replaceChildren(template.make()); addedNotice.setAttribute('data-template', ''); }
    const text = `${product.name} añadido a tu pedido.`;
    if (addedNotice.hasAttribute('data-template')) {
      addedNotice.querySelector('[data-added-field="message"]').textContent = text;
      const name = addedNotice.querySelector('[data-added-field="name"]');
      if (name) name.textContent = product.name;
      const photo = addedNotice.querySelector('[data-added-field="photo"]'), image = galleryImages(product)[0];
      if (photo) { photo.hidden = !image; if (image) { photo.src = image; photo.alt = ''; } else photo.removeAttribute('src'); }
    } else addedNotice.querySelector('span').textContent = text;
    addedNotice.dataset.visible = 'true';
    placeAddedNotice(button);
    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => { if (!addedNotice.contains(document.activeElement)) delete addedNotice.dataset.visible; }, 4000);
    // The confirmation remains visible with reduced motion or motion explicitly off.
    if (!keyboard && config.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const targets = [button, ...document.querySelectorAll('[data-cart-count]')];
      const duration = motionValue('fast', 200), scale = motionValue('press', .96);
      const ease = motionValue('ease', 'cubic-bezier(.23,1,.32,1)'), settle = motionValue('settle', 'cubic-bezier(.23,1,.32,1)');
      for (const target of targets) if (target.isConnected && target.animate) {
        target.getAnimations().forEach(animation => animation.cancel());
        // Two animations so a playful overshoot moves only the scale; the fade always settles.
        target.animate([{ transform: `scale(${scale})` }, { transform: 'scale(1)' }], { duration, easing: ease });
        target.animate([{ opacity: .65 }, { opacity: 1 }], { duration, easing: settle });
      }
    }
  }
  /* DNA motifs: verification, slots, triggers. Every animation is finite, ends at rest and starts only when motion is
   * allowed; the kit's reduced-motion rule also switches it off in CSS. */
  const motifText = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const motifWords = value => motifText(value).split(/[^a-z0-9]+/).filter(Boolean);
  /* The target's words appear in order as whole words (a word also matches its plural, -s/-es): "té" is not inside
   * "Chocolate caliente", "pan" is not inside "Empanada", "lámpara" matches "Lámpara de mesa" and "Lámparas". */
  function motifWordsMatch(text, target) {
    const words = motifWords(text);
    for (let i = 0; target.length && i + target.length <= words.length; i++) {
      if (target.every((word, j) => [word, `${word}s`, `${word}es`].includes(words[i + j]))) return true;
    }
    return false;
  }
  /* A product matches its motif by id, by name, or by its category's name; a store-wide motif matches every product. */
  function motifMatches(motif, p) {
    if (!p) return false;
    if (motif.for === 'store' || p.id === motif.target) return true;
    const target = motifWords(motif.target);
    const category = (store.categories || []).find(c => c.id === p.categoryId);
    return motifWordsMatch(p.name, target) || Boolean(category) && motifWordsMatch(category.name, target);
  }
  const motifMotion = () => config.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  function playMotif(holder) {
    if (!holder.isConnected || !motifMotion()) return;
    holder.removeAttribute('data-motif-play');
    void holder.getBoundingClientRect(); // restarts the keyframes when it plays again
    holder.setAttribute('data-motif-play', '');
  }
  function observeMotif(holder, once) {
    if (typeof IntersectionObserver !== 'function') { playMotif(holder); return; }
    if (!motifObserver) motifObserver = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        playMotif(entry.target);
        if (entry.target.hasAttribute('data-motif-once')) motifObserver.unobserve(entry.target);
      }
    }, { threshold: .5 });
    if (once) holder.setAttribute('data-motif-once', '');
    motifObserver.observe(holder);
  }
  /* appear plays once when first seen, scroll each time it comes into view, hover on the card or product (focus too;
   * appear on a device without hover), add-to-cart from the add handler. */
  function armMotif(holder, scope) {
    const trigger = holder.dataset.motifTrigger;
    if (trigger === 'hover' && scope) {
      scope.addEventListener('pointerenter', () => playMotif(holder));
      scope.addEventListener('focusin', () => playMotif(holder));
      if (!matchMedia('(hover: hover)').matches) observeMotif(holder, true);
    } else if (trigger === 'appear' || trigger === 'scroll') observeMotif(holder, trigger === 'appear');
  }
  /* Each placed copy gets its own ids (the same drawing sits in several cards, and a gradient or mask must resolve inside
   * its own copy), all under the platform prefix pym-, which no page or kit id uses. A reference to an id the drawing
   * lacks points nowhere. */
  let motifCopies = 0;
  function scopeMotifIds(svg, prefix) {
    const copy = ++motifCopies;
    const scoped = id => `${id.startsWith('pym-') ? id : prefix + id}-${copy}`;
    for (const el of [svg, ...svg.querySelectorAll('*')]) {
      for (const attr of [...el.attributes]) {
        const ref = attr.value.trim().match(/^url\(\s*#([A-Za-z][\w-]*)\s*\)$/);
        if (attr.name === 'id') el.setAttribute('id', scoped(attr.value));
        else if (ref) el.setAttribute(attr.name, `url(#${scoped(ref[1])})`);
      }
    }
  }
  function motifSlot(index, slot, productId) {
    const motif = MOTIFS[index], drawing = motifDrawing(motif.svg);
    if (!drawing) return null;
    const holder = document.createElement('span');
    holder.className = 'pagosya-motif';
    holder.setAttribute('aria-hidden', 'true');
    Object.assign(holder.dataset, { motifSlot: slot, motifBehavior: motif.behavior, motifTrigger: motif.trigger, motifIndex: String(index) }, productId ? { motifProduct: productId } : {});
    holder.style.setProperty('--pagosya-motif-ms', `${motionValue('slow', 560)}ms`);
    const svg = document.importNode(drawing, true);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    scopeMotifIds(svg, `pym-${/^motifs\/([a-z0-9-]+)\.svg$/.exec(motif.file)?.[1] ?? 'motif'}-`);
    // A behaviour with a labelled part animates that part; a drawing without one animates as a whole.
    const part = { glow: 'light', steam: 'steam' }[motif.behavior];
    if (part && !svg.querySelector(`[data-part="${part}"]`)) svg.setAttribute('data-part', part);
    if (motif.behavior === 'draw') svg.querySelectorAll('path,line,polyline,polygon,circle,ellipse,rect').forEach(el => el.setAttribute('pathLength', '1'));
    holder.append(svg);
    return holder;
  }
  /* A motif never covers a price, a purchase control or a total: a placed one that would is removed. A card motif must also
   * sit inside its card (a card the store made static would anchor the corner elsewhere). */
  const MOTIF_BLEED = 8;
  const MOTIF_PROTECTED = '.menu-item__price,.menu-add,[data-product-field="price"],[data-product-add],[data-product-pricing],.product-detail__buy,.checkout-button,.order-total';
  function guardMotif(holder, scope, contained) {
    const check = () => {
      if (!holder.isConnected) return;
      const box = holder.getBoundingClientRect(), frame = scope.getBoundingClientRect();
      if (!box.width || !box.height) return;
      if (contained && (box.left < frame.left - 1 || box.right > frame.right + 1 || box.top < frame.top - 1 || box.bottom > frame.bottom + 1)) { holder.remove(); return; }
      // The paint may reach MOTIF_BLEED px past the box (the clip's margin for the glow).
      const covers = [...scope.querySelectorAll(MOTIF_PROTECTED)].some(el => {
        const r = el.getBoundingClientRect(), b = MOTIF_BLEED;
        return r.width > 0 && r.height > 0 && r.left < box.right + b && r.right > box.left - b && r.top < box.bottom + b && r.bottom > box.top - b;
      });
      if (covers) holder.remove();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(check); else check();
  }
  const motifFor = (placement, p) => MOTIFS.findIndex(motif => motif.placement === placement && motifMatches(motif, p));
  function placeProductMotif(p) {
    const index = motifFor('product', p), title = detail.querySelector('#pagosya-product-title');
    if (index < 0 || !title) return;
    const holder = motifSlot(index, 'product', p.id);
    if (!holder) return;
    title.before(holder);
    armMotif(holder, detail.querySelector(':scope > .product-detail__layout, :scope > [data-product-page-root]'));
    guardMotif(holder, detail);
  }
  function placeCardMotifs(root) {
    if (!MOTIFS.some(motif => motif.placement === 'card')) return;
    root.querySelectorAll('.menu-item').forEach(card => {
      if (card.querySelector(':scope > .pagosya-motif')) return;
      const control = card.querySelector('[data-add],[data-product]');
      const link = card.querySelector('a[href*="id="]');
      const id = card.dataset.productId || control?.dataset.add || control?.dataset.product || (link ? new URL(link.getAttribute('href'), location.href).searchParams.get('id') : null);
      const p = products().find(item => item.id === id), index = motifFor('card', p);
      if (index < 0) return;
      const holder = motifSlot(index, 'card', p.id);
      if (!holder) return;
      card.append(holder);
      armMotif(holder, card);
      guardMotif(holder, card, true);
    });
  }
  function playMotifs(p) {
    document.querySelectorAll('.pagosya-motif[data-motif-trigger="add-to-cart"]').forEach(holder => {
      const motif = MOTIFS[Number(holder.dataset.motifIndex)];
      if (motif && (holder.dataset.motifProduct ? holder.dataset.motifProduct === p.id : motifMatches(motif, p))) playMotif(holder);
    });
  }
  /* The empty placement: the kit's own empty cart line shows the pack drawing. A store's cart template shows it only where
   * it asks, in an element marked data-motif-empty inside its "empty" slot: the template owns that state's design. */
  function placeEmptyMotif(el) {
    const index = packMotif('empty');
    if (index < 0) return;
    const asked = [...el.querySelectorAll('[data-cart-slot="empty"] [data-motif-empty]')];
    const hosts = asked.length ? asked : [...el.querySelectorAll('.order-items > li.order-empty')];
    for (const host of hosts) {
      if (host.querySelector(':scope > .pagosya-motif[data-motif-slot="empty"]')) continue;
      const holder = motifSlot(index, 'empty');
      if (!holder) return;
      host.prepend(holder);
      armMotif(holder, host);
    }
  }
  /* The button placement and the data-motif-icon slot (T2a/T2b): the pack's small drawing beside the label of the add and
   * buy buttons, and inside any element a store marks data-motif-icon (its own calls to action). Never on the cart's
   * checkout or pay buttons, never over a price, and never at the cost of the label: an icon that would wrap the label or
   * overflow its button is taken out again (the slot says "removed", so it is not retried). */
  const MOTIF_PRICES = '.menu-item__price,[data-product-field="price"],[data-product-pricing],.product-detail__buy-total,.order-total';
  // The sticky bar's jump button is excluded on purpose: updateStickyBar() sets its whole label with textContent on
  // every quantity/selection change, which would silently wipe any icon placed here (finding 7).
  const KIT_ICON_BUTTONS = '.menu-add,.product-detail__buy';
  const NO_ICON = '.checkout-button:not(.product-detail__buy),[data-pay],[data-checkout],[data-finish-demo],template *';
  /* Batched across every slot in one placeButtonMotifs pass (finding 4): a public catalog can hold well over a
   * hundred cards, and filling each icon slot one at a time — read, insert, then its own rAF of read/write/read/
   * write — forces a synchronous layout per card. Every phase below (read, then write, then, in the rAF, read,
   * write, read, write, read, write) runs once for every prepared slot before the next phase starts, so the whole
   * batch costs one forced layout per phase instead of one per slot. */
  function fillIconSlots(entries) {
    const index = packMotif('button');
    if (index < 0 || !entries.length) return;
    const prepared = [];
    for (const { slot, button } of entries) {
      if (slot.getAttribute('data-motif-icon') === 'placed') continue;
      const holder = motifSlot(index, 'button');
      if (holder) prepared.push({ slot, button, holder });
    }
    if (!prepared.length) return;
    for (const entry of prepared) { // read: the "before" box and spare overflow room, before any insertion
      entry.before = entry.button.getBoundingClientRect();
      entry.spareX = entry.button.scrollWidth - entry.button.clientWidth;
      entry.spareY = entry.button.scrollHeight - entry.button.clientHeight;
    }
    for (const entry of prepared) { // write: insert every holder
      entry.slot.replaceChildren(entry.holder);
      entry.slot.setAttribute('data-motif-icon', 'placed');
      entry.slot.setAttribute('aria-hidden', 'true');
      armMotif(entry.holder, entry.button);
    }
    const check = () => {
      const live = prepared.filter(entry => entry.holder.isConnected);
      if (!live.length) return;
      for (const entry of live) { entry.after = entry.button.getBoundingClientRect(); entry.box = entry.holder.getBoundingClientRect(); } // read
      // A flex button can hide true overflow by shrinking its other content instead of growing: measure with every
      // child's shrink neutralised (a same-frame, no-paint probe), then put every value straight back.
      for (const entry of live) { entry.kids = [...entry.button.children]; entry.shrinks = entry.kids.map(kid => kid.style.flexShrink); entry.kids.forEach(kid => { kid.style.flexShrink = '0'; }); } // write
      for (const entry of live) entry.overflows = entry.button.scrollWidth - entry.button.clientWidth > Math.max(0, entry.spareX) + 1 || entry.button.scrollHeight - entry.button.clientHeight > Math.max(0, entry.spareY) + 1; // read
      for (const entry of live) entry.kids.forEach((kid, i) => { kid.style.flexShrink = entry.shrinks[i]; }); // write (restore)
      for (const entry of live) { // read: price overlap
        const scope = entry.button.closest('.menu-item,[data-custom-product],[data-pagosya-product],.product-detail__sticky') || entry.button;
        entry.onPrice = [...scope.querySelectorAll(MOTIF_PRICES)].some(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.left < entry.box.right && r.right > entry.box.left && r.top < entry.box.bottom && r.bottom > entry.box.top; });
      }
      for (const entry of live) { // write: remove any that wrap, overflow or cover a price
        if (!entry.after.width) continue; // nothing laid out to measure
        const wraps = entry.before.height > 0 && entry.after.height > entry.before.height + 1;
        if (!wraps && !entry.overflows && !entry.onPrice) continue;
        entry.holder.remove();
        // Mark terminal (never remove the slot itself, kit-owned or not): a removed slot element would leave no
        // trace for the KIT_ICON_BUTTONS guard below, so the next unrelated mutation re-inserts and re-removes it
        // forever (finding 3's icon flash).
        entry.slot.setAttribute('data-motif-icon', 'removed');
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(check); else check();
  }
  function placeButtonMotifs(root) {
    if (packMotif('button') < 0 || !root?.querySelectorAll) return;
    const entries = [];
    root.querySelectorAll(KIT_ICON_BUTTONS).forEach(button => {
      // A disabled button (sold out, or a card the kit marked sold out) never gets a paw (finding 8).
      if (button.matches(NO_ICON) || button.disabled || button.closest('[data-sold-out],.sold-out') || button.querySelector(':scope > [data-motif-icon]')) return;
      const slot = document.createElement('span');
      slot.setAttribute('data-motif-icon', '');
      slot.setAttribute('data-motif-kit', '');
      button.insertBefore(slot, button.firstChild);
      entries.push({ slot, button });
    });
    root.querySelectorAll('[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"])').forEach(slot => {
      // A slot the loop above just created (data-motif-kit) is already queued in entries and still reads
      // data-motif-icon="" until fillIconSlots's write phase runs below: skip it here, or it would be queued twice.
      if (slot.closest('template') || slot.hasAttribute('data-motif-kit')) return;
      const host = slot.closest('button,a,[role="button"]') || slot;
      // Mark terminal (finding 3): a slot inside an excluded host is never left unmarked to be rescanned forever.
      if (host.matches(NO_ICON) || host.disabled || host.closest('[data-sold-out],.sold-out')) { slot.setAttribute('data-motif-icon', 'removed'); return; }
      entries.push({ slot, button: host });
    });
    fillIconSlots(entries);
  }
  /* The pattern placement: a tile behind a section the store marks data-motif-pattern, never behind or around the kit's
   * catalog, cart, product or checkout. It is a background image (an SVG data URL; every storefront CSP allows img-src
   * data:), drawn in the section's own text colour at the highest opacity, at most .12, that keeps it under the contrast
   * floor: the tile against the background at most 1.35:1, every text in the section still 4.5:1 over it. A section whose
   * background the page cannot compare (a photo, a gradient, an unknown colour syntax), or whose text is already weaker than
   * that, gets no pattern. Static: nothing moves. */
  const PATTERN_EXCLUDED = '[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-product],[data-pagosya-product-page],.cart-drawer,.checkout-review,dialog,template';
  const PATTERN_TILE_LIMIT = 1.35;
  // Chromium reports a color-mix() background as color(srgb r g b / a) (0-1 channels), not rgb(): reused by
  // guardContrast's own parser below (finding 10).
  const motifRgb = value => {
    const text = String(value || '').trim();
    if (!text || text === 'transparent') return [0, 0, 0, 0];
    const n = (text.match(/-?[\d.]+/g) || []).map(Number);
    if (n.length < 3) return null;
    if (/^color\(srgb/i.test(text)) return [n[0] * 255, n[1] * 255, n[2] * 255, n.length > 3 ? n[3] : 1];
    return /^rgba?\(/i.test(text) ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null;
  };
  const motifLuminance = c => [0, 1, 2].map(i => { const v = c[i] / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const motifContrast = (a, b) => { const [x, y] = [motifLuminance(a), motifLuminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
  // The real page canvas (guardContrast's own Canvas resolution, reused here): a Canvas keyword resolves dark
  // under color-scheme: dark, so a translucent backdrop with nothing opaque behind it must not assume white
  // (finding 10).
  function motifCanvas() {
    if (typeof document === 'undefined' || !document.body) return [255, 255, 255, 1];
    const probe = document.createElement('span');
    probe.hidden = true; probe.style.color = 'Canvas';
    document.body.append(probe);
    const c = motifRgb(getComputedStyle(probe).color);
    probe.remove();
    return c && c[3] >= .99 ? c : [255, 255, 255, 1];
  }
  const motifOverTile = (colour, strength, base) => [0, 1, 2].map(i => colour[i] * strength + base[i] * (1 - strength));
  function patternBackdrop(section) {
    const layers = [];
    for (let node = section; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none') return null;
      const colour = motifRgb(style.backgroundColor);
      if (!colour) return null;
      if (colour[3] > 0) layers.push(colour);
      if (colour[3] >= .99) break;
    }
    return layers.reverse().reduce((under, top) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])), motifCanvas());
  }
  function patternAlpha(ink, back, texts) {
    for (let step = 12; step >= 4; step--) {
      const alpha = step / 100, tile = [0, 1, 2].map(i => back[i] + (ink[i] - back[i]) * alpha);
      if (motifContrast(tile, back) <= PATTERN_TILE_LIMIT && texts.every(text => motifContrast(motifOverTile(text.colour, text.strength, tile), tile) >= 4.5)) return alpha;
    }
    return 0;
  }
  function placePatterns(root) {
    const index = packMotif('pattern');
    if (index < 0 || !root?.querySelectorAll) return;
    const sections = [...(root.matches?.('[data-motif-pattern]') ? [root] : []), ...root.querySelectorAll('[data-motif-pattern]')];
    for (const section of sections) {
      const state = section.getAttribute('data-motif-pattern');
      if (state === 'placed' || state === 'skipped') continue;
      // Mark terminal (finding 3): a section that wraps the kit's own catalog/cart/etc never becomes placeable, so
      // it is never left unmarked to be rescanned on every later, unrelated mutation.
      if (section.closest(PATTERN_EXCLUDED) || section.querySelector(PATTERN_EXCLUDED)) { section.setAttribute('data-motif-pattern', 'skipped'); continue; }
      const back = patternBackdrop(section), ink = motifRgb(getComputedStyle(section).color);
      // A text element that (or whose own ancestor up to the section) paints its own opaque background sits on that
      // colour, not on the tile: a filled badge or button inside a patterned section is not part of this check.
      const sitsOnTile = el => { for (let node = el; node && node !== section; node = node.parentElement) { const colour = motifRgb(getComputedStyle(node).backgroundColor); if (colour && colour[3] >= .99) return false; } return true; };
      // Every text in the section is checked (finding 9: no more slice(0,40)), and each one's real, on-tile
      // strength accounts for its own alpha and any ancestor opacity between it and the section — a semi-transparent
      // text reads far weaker than its raw ink colour once composited over the tile.
      const opacityAbove = el => { let factor = 1; for (let node = el; node && node !== section; node = node.parentElement) factor *= parseFloat(getComputedStyle(node).opacity ?? '1') || 0; return factor; };
      const texts = [section, ...section.querySelectorAll('*')]
        .filter(el => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && sitsOnTile(el))
        .map(el => { const colour = motifRgb(getComputedStyle(el).color); return colour ? { colour, strength: colour[3] * opacityAbove(el) } : null; })
        .filter(text => text && text.strength > 0);
      const alpha = back && ink && ink[3] > 0 ? patternAlpha(ink, back, texts) : 0;
      const drawing = alpha ? motifDrawing(MOTIFS[index].svg) : null;
      const box = drawing ? (drawing.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number) : [];
      if (!drawing || box.length !== 4 || !(box[2] > 0 && box[3] > 0)) { section.setAttribute('data-motif-pattern', 'skipped'); continue; }
      drawing.setAttribute('width', String(box[2]));
      drawing.setAttribute('height', String(box[3]));
      drawing.setAttribute('color', `rgb(${ink.slice(0, 3).map(Math.round).join(',')})`);
      drawing.setAttribute('opacity', String(alpha));
      section.style.setProperty('--pagosya-pattern', `url("data:image/svg+xml,${encodeURIComponent(new XMLSerializer().serializeToString(drawing))}")`);
      section.setAttribute('data-motif-pattern-alpha', String(alpha));
      section.setAttribute('data-motif-pattern', 'placed');
    }
  }
  /* Divider and sticker placements. An empty element marked data-motif-divider becomes a decorative separator (hairlines
   * either side of the drawing); an element with content is the store's own and is left alone. A badge marked
   * data-motif-sticker ("¡Nuevo!") keeps its text; the drawing leads it and comes off a price it would cover. */
  const markedHosts = (root, attribute) => [...(root.matches?.(`[${attribute}]`) ? [root] : []), ...root.querySelectorAll(`[${attribute}]`)]
    .filter(host => host.getAttribute(attribute) !== 'placed' && host.getAttribute(attribute) !== 'skipped' && !host.closest('template'));
  function placeDividers(root) {
    const index = packMotif('divider');
    if (index < 0 || !root?.querySelectorAll) return;
    for (const host of markedHosts(root, 'data-motif-divider')) {
      // Mark terminal (finding 3): a divider with its own content (or an <hr>, which can hold none) never becomes
      // placeable, so it is never left unmarked to be rescanned on every later, unrelated mutation.
      if (/^(?:HR|IMG|INPUT|BR)$/.test(host.tagName) || host.childElementCount || host.textContent.trim()) { host.setAttribute('data-motif-divider', 'skipped'); continue; }
      const holder = motifSlot(index, 'divider');
      if (!holder) return;
      host.append(holder);
      host.setAttribute('data-motif-divider', 'placed');
      host.setAttribute('aria-hidden', 'true');
      if (!host.hasAttribute('role')) host.setAttribute('role', 'presentation');
      armMotif(holder, host);
      guardMotif(holder, document.body);
    }
  }
  function placeStickers(root) {
    const index = packMotif('sticker');
    if (index < 0 || !root?.querySelectorAll) return;
    for (const host of markedHosts(root, 'data-motif-sticker')) {
      const holder = motifSlot(index, 'sticker');
      if (!holder) return;
      host.prepend(holder);
      host.setAttribute('data-motif-sticker', 'placed');
      armMotif(holder, host);
      guardMotif(holder, document.body);
      // A sticker drawn in the store's accent nearly disappears when the accent is close to the badge's own
      // background (a filled badge painted in the accent colour): fall back to the badge's own text colour, which
      // is presumably already readable against it (finding 11).
      const back = patternBackdrop(host), accent = motifRgb(getComputedStyle(holder).color);
      if (back && accent && accent[3] > 0 && motifContrast(accent, back) < 1.5) holder.style.color = getComputedStyle(host).color;
    }
  }
  if (MOTIFS.length) {
    const motifStyle = document.createElement('style');
    motifStyle.dataset.pagosyaKit = 'motifs';
    const ms = factor => `calc(var(--pagosya-motif-ms,560ms)*${factor})`;
    // The settle curve only: the personality's overshoot curve is kept for transform transitions (glow and steam fade).
    const settle = 'var(--motion-ease-settle,cubic-bezier(.23,1,.32,1))';
    const play = behavior => `.pagosya-motif[data-motif-play][data-motif-behavior=${behavior}]`;
    // Layered !important: the store's own CSS (unlayered) cannot enlarge a slot past 64px, make it catch clicks or lift
    // the clip. The clip keeps every stroke inside the slot plus MOTIF_BLEED px, room for the glow's drop-shadow.
    motifStyle.textContent = `@layer pagosya-commerce {
      .pagosya-motif{display:inline-block!important;box-sizing:border-box;width:48px;height:48px;max-width:64px!important;max-height:64px!important;overflow:visible!important;clip-path:inset(-${MOTIF_BLEED}px)!important;pointer-events:none!important;line-height:0;vertical-align:middle;flex:none;color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}
      .pagosya-motif>svg{display:block;width:100%;height:100%;max-width:64px!important;max-height:64px!important;overflow:visible;transform-origin:50% 100%}
      .pagosya-motif svg [data-part]{transform-box:fill-box;transform-origin:50% 100%}
      .pagosya-motif[data-motif-slot=product]{display:block!important;width:56px;height:56px;margin:0 0 10px}
      .pagosya-motif[data-motif-slot=card]{position:absolute;top:10px;right:10px;z-index:2;width:40px;height:40px}
      .pagosya-motif[data-motif-slot=cart]{width:36px;height:36px;margin-inline:12px auto}
      @keyframes pagosya-motif-glow{0%{opacity:.2;filter:none}18%{opacity:.85}28%{opacity:.45}55%{opacity:1;filter:drop-shadow(0 0 6px currentColor)}100%{opacity:1;filter:none}}
      @keyframes pagosya-motif-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
      @keyframes pagosya-motif-sway{0%,100%{transform:rotate(0)}30%{transform:rotate(-6deg)}70%{transform:rotate(5deg)}}
      @keyframes pagosya-motif-steam{0%{opacity:0;transform:translateY(5px)}55%{opacity:1}100%{opacity:1;transform:none}}
      @keyframes pagosya-motif-grow{from{transform:scale(.35);opacity:0}to{transform:none;opacity:1}}
      @keyframes pagosya-motif-bounce{0%,100%{transform:none}35%{transform:translateY(-8px)}65%{transform:translateY(0)}80%{transform:translateY(-3px)}}
      @keyframes pagosya-motif-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
      @keyframes pagosya-motif-float{0%,100%{transform:none}50%{transform:translateY(-5px)}}
      ${play('glow')} svg [data-part=light],${play('glow')} svg[data-part=light]{animation:pagosya-motif-glow ${ms(2)} ${settle} 1 backwards}
      ${play('draw')} svg [pathLength]{stroke-dasharray:1;animation:pagosya-motif-draw ${ms(2.5)} ${settle} 1 backwards}
      ${play('sway')}>svg{animation:pagosya-motif-sway ${ms(1.5)} ${settle} 3}
      ${play('steam')} svg [data-part=steam],${play('steam')} svg[data-part=steam]{animation:pagosya-motif-steam ${ms(1.6)} ${settle} 3 backwards}
      ${play('grow')}>svg{animation:pagosya-motif-grow ${ms(1.2)} ${settle} 1 backwards}
      ${play('bounce')}>svg{animation:pagosya-motif-bounce ${ms(1.4)} ${settle} 2}
      ${play('spin')}>svg{transform-origin:50% 50%;animation:pagosya-motif-spin ${ms(4)} linear 1}
      ${play('float')}>svg{animation:pagosya-motif-float ${ms(2)} ${settle} 2}
      @media (prefers-reduced-motion: reduce){.pagosya-motif,.pagosya-motif *{animation:none!important;transition:none!important}}
    }`;
    document.head.append(motifStyle);
    const cartIndex = MOTIFS.findIndex(motif => motif.placement === 'cart');
    const cartHolder = cartIndex < 0 ? null : motifSlot(cartIndex, 'cart');
    if (cartHolder) { cartDrawer.querySelector('#cart-drawer-title').after(cartHolder); armMotif(cartHolder, cartDrawer); }
  }
  /* Pack placements' own rules, written only for a store with a pack: a store without one keeps exactly the styles it had.
   * Later placements add their rules to this list. */
  const PACK_CSS = [
    '.pagosya-motif[data-motif-slot=empty]{display:block!important;width:64px;height:64px;margin:0 0 12px}',
    '[data-motif-icon=placed]{display:inline-flex;vertical-align:middle;line-height:0}',
    '[data-motif-icon=placed][data-motif-kit]{margin-inline-end:.45em}',
    '.pagosya-motif[data-motif-slot=button]{width:1.15em;height:1.15em;color:inherit}',
    ':root[data-dna-button=split] :is(.product-detail__buy,.product-detail__sticky button)>[data-motif-icon]{display:none}',
    ':root[data-dna-button=bubbly] .pagosya-motif[data-motif-slot=button]{width:1.35em;height:1.35em}',
    '[data-motif-pattern=placed]{background-image:var(--pagosya-pattern)!important;background-repeat:repeat!important;background-size:auto!important;background-position:0 0!important}',
    '[data-motif-divider=placed]{display:flex;align-items:center;gap:16px;margin-block:clamp(16px,4vw,40px);color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}',
    '[data-motif-divider=placed]::before,[data-motif-divider=placed]::after{content:"";flex:1;height:1px;background:currentColor;opacity:.35}',
    '.pagosya-motif[data-motif-slot=divider]{width:64px;height:24px}',
    '[data-motif-sticker=placed]{display:inline-flex;align-items:center;gap:.35em}',
    '.pagosya-motif[data-motif-slot=sticker]{width:1.7em;height:1.7em}',
  ];
  if (PACK_MOTIFS.length) {
    const packStyle = document.createElement('style');
    packStyle.dataset.pagosyaKit = 'motif-pack';
    packStyle.textContent = `@layer pagosya-commerce {\n${PACK_CSS.join('\n')}\n}`;
    document.head.append(packStyle);
  }
  /* Store-marked slots are placed once the page is parsed, and again whenever the store's own scripts (React) add or
   * replace them. Only a store with a pack observes anything. */
  const MOTIF_SLOTS = '[data-motif-icon]:not([data-motif-icon="placed"]):not([data-motif-icon="removed"]),[data-motif-pattern]:not([data-motif-pattern="placed"]):not([data-motif-pattern="skipped"]),[data-motif-divider]:not([data-motif-divider="placed"]):not([data-motif-divider="skipped"]),[data-motif-sticker]:not([data-motif-sticker="placed"])';
  function placeIdentityMotifs(root) { placeButtonMotifs(root); placePatterns(root); placeDividers(root); placeStickers(root); }
  if (PACK_MOTIFS.length) {
    const startIdentity = () => {
      placeIdentityMotifs(document.body);
      if (typeof MutationObserver !== 'function') return;
      new MutationObserver(records => {
        // Every distinct parent that gained a match in this batch is placed once (finding 2): stopping at the
        // first match dropped every other host added under a different parent in the same task.
        const parents = new Set();
        for (const record of records) for (const node of record.addedNodes) {
          if (node.nodeType !== 1 || node.classList?.contains('pagosya-motif')) continue;
          if (node.matches?.(MOTIF_SLOTS) || node.querySelector?.(MOTIF_SLOTS)) parents.add(node.parentElement || node);
        }
        for (const parent of parents) placeIdentityMotifs(parent);
      }).observe(document.body, { childList: true, subtree: true });
    };
    if (document.body) startIdentity(); else document.addEventListener('DOMContentLoaded', startIdentity, { once: true });
  }
  const shoppingStyle = document.createElement('style');
  // Kit defaults for the cart, the added notice and the order review: low priority, so the store's own CSS
  // (and its DNA) restyle them. Layered !important declarations still outrank authored ones.
  shoppingStyle.textContent = `@layer pagosya-commerce {
    .cart-drawer{box-sizing:border-box;position:fixed;inset:0 0 0 auto;width:min(600px,48vw);max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font:inherit;overflow:auto;overscroll-behavior:contain;transform:translateX(0);transition:transform var(--motion-base,250ms) var(--ease-drawer,cubic-bezier(.32,.72,0,1)),opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),display var(--motion-base,250ms) allow-discrete,overlay var(--motion-base,250ms) allow-discrete}
    .cart-drawer:not([open]){transform:translateX(100%);opacity:0}
    /* The contrast guard's colour: the first layer's !important outranks every stylesheet, and yields while the control is
       hovered or focused so the store's own interactive colours (an inverted hover…) still apply. */
    [data-pagosya-contrast-guard=fixed]:not(:hover):not(:where(:focus-visible)),[data-pagosya-contrast-guard=fixed]:not(:hover):not(:where(:focus-visible)) [data-pagosya-contrast-guard=text]{color:var(--pagosya-contrast-color)!important;-webkit-text-fill-color:var(--pagosya-contrast-color)!important}
    .pagosya-secure-note{margin:12px 0 0;font-size:13px;opacity:.78}
    .pagosya-policies{display:flex;flex-wrap:wrap;gap:4px 16px;margin:12px 0 0}.cart-drawer>.pagosya-policies{padding:0 24px 20px}
    .pagosya-policies button{min-height:32px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:.25em;text-decoration-color:color-mix(in srgb,currentColor 35%,transparent);cursor:pointer}
    .pagosya-info-nav,[data-pagosya-pages]{display:flex;flex-wrap:wrap;gap:4px 16px;margin:16px 0 0}.pagosya-info-nav a,[data-pagosya-pages] a{color:inherit;font:inherit;font-size:13px;text-decoration:underline;text-underline-offset:.25em}
    .pagosya-info{max-width:68ch;line-height:1.7}.pagosya-info__lead{font-size:1.15em}.pagosya-info__list{padding-left:1.2em}.pagosya-info__qa h2{margin:1.4em 0 .3em;font-size:1.05em}
    .pagosya-info__cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;margin:16px 0;padding:0;list-style:none}.pagosya-info__cards a{display:grid;gap:6px;color:inherit;text-decoration:none}.pagosya-info__cards img{width:100%;aspect-ratio:1;object-fit:cover}.pagosya-search{display:flex;flex-wrap:wrap;gap:8px;align-items:end}.pagosya-search label{display:grid;gap:4px;flex:1 1 220px}.pagosya-search input{min-height:44px;padding:0 12px;font:inherit}.pagosya-search button{min-height:44px;padding:0 18px;font:inherit;cursor:pointer}
    .pagosya-policy-dialog{box-sizing:border-box;width:min(640px,calc(100% - 32px));max-height:min(80dvh,720px);margin:auto;padding:0;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:min(var(--store-radius,12px),16px);background:var(--store-background,var(--brand-background,Canvas));color:var(--store-foreground,var(--brand-foreground,CanvasText));font:inherit;overflow:auto}
    .pagosya-policy-dialog::backdrop{background:#0008}
    .pagosya-policy-dialog header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;background:inherit;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pagosya-policy-dialog h2{margin:0;font-size:1.2rem;font-family:var(--store-heading-font,inherit)}.pagosya-policy-dialog header button{width:44px;height:44px;border:0;border-radius:50%;background:none;color:inherit;font-size:26px;cursor:pointer}
    .pagosya-policy-dialog div{padding:8px 20px}.pagosya-policy-dialog div p{margin:12px 0;line-height:1.65;max-width:66ch}
    .pagosya-policy-dialog__store{margin:0;padding:0 20px 20px;font-size:13px;opacity:.7}
    .cart-drawer::backdrop{background:#0007}
    @starting-style{.cart-drawer[open]{transform:translateX(100%);opacity:0}}
    .cart-drawer__header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 32px;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer__header h2{font:inherit;font-size:28px;font-weight:700;margin:0}
    .cart-drawer button{font:inherit;cursor:pointer;color:inherit;min-height:44px}
    .cart-drawer__header button{width:44px;border:0;background:transparent;font-size:28px}
    .cart-drawer__body{padding:8px 32px 24px}
    .cart-drawer [data-pagosya-cart]{position:static;inset:auto;width:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;box-shadow:none;background:transparent;color:inherit}
    .cart-drawer .order-items{padding:0;margin:0;list-style:none}
    /* Order lines: photo, then name + line total, option, unit price and stock under it. */
    .order-items .order-item[data-has-image]{display:grid;grid-template-columns:72px minmax(0,1fr);gap:16px;align-items:start}
    .order-items .order-item>.order-item__body{display:block;min-width:0;margin:0}
    .order-item__photo{display:block;width:72px;height:72px;object-fit:cover;border-radius:10px;background:color-mix(in srgb,currentColor 6%,transparent)}
    .order-item__head{display:flex;justify-content:space-between;align-items:baseline;gap:16px;line-height:1.4;overflow-wrap:anywhere}
    .order-item__head>span{flex:none;white-space:nowrap;font-variant-numeric:tabular-nums}
    .order-item__body>p{margin:4px 0 0;font-size:.875em;line-height:1.45;opacity:.72}
    .order-item__body>.order-item__stock{opacity:1;font-weight:600;color:var(--store-accent,var(--brand-accent,var(--accent,currentColor)))}
    .order-item__unit{white-space:nowrap}.order-item__unit s{margin-left:4px}
    .order-items .order-item .quantity{margin-top:10px}
    .order-savings{display:flex;justify-content:space-between;gap:16px;margin:16px 0 0;font-size:15px}
    .checkout-review__summary>.checkout-review__count{margin:4px 0 8px;font-size:14px;line-height:1.4;opacity:.7}
    .order-recommendations{margin:20px 0 0}
    .order-recommendations h3{margin:0 0 10px;font-size:15px}
    .order-recommendations ul{display:grid;gap:10px;margin:0;padding:0;list-style:none}
    .order-recommendations li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px}
    .order-recommendations li:not(:has(img)){grid-template-columns:minmax(0,1fr) auto}
    .order-recommendations img{width:48px;height:48px;border-radius:8px;object-fit:cover}
    .order-recommendations li>span{display:grid;overflow-wrap:anywhere}
    .order-recommendations :is(button,a){min-height:44px;padding:0 14px;display:inline-flex;align-items:center}
    .cart-drawer .order-item{padding:24px 0;border-bottom:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    .cart-drawer .order-item>div:first-child:not(.order-item__body),.cart-drawer .order-total{display:flex;justify-content:space-between;gap:20px;overflow-wrap:anywhere}
    .cart-drawer .quantity{display:flex;align-items:center;gap:16px;margin-top:16px}
    .cart-drawer .quantity button{width:44px;border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));background:transparent}
    .cart-drawer .order-total{padding:24px 0;font-size:20px}.cart-drawer .order-empty{padding:40px 0;line-height:1.6}
    .cart-drawer .order-note{font-size:14px;line-height:1.5}
    .cart-drawer .checkout-button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:16px 20px;border:0;background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))}
    .cart-drawer button:disabled{opacity:.5;cursor:default}.cart-drawer>.cart-drawer__continue{display:block!important;position:static!important;float:none!important;box-sizing:border-box!important;width:calc(100% - 64px)!important;max-width:none!important;margin:0 32px 32px!important;padding:10px 0;border:0;background:transparent;text-align:center!important;text-decoration:underline;text-underline-offset:4px}.cart-drawer[data-template]>:is(.cart-drawer__header,.cart-drawer__continue,.pagosya-policies){display:none!important}.cart-drawer[data-template] .cart-drawer__body{padding:0}
    .cart-drawer :focus-visible,.cart-added :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    .cart-added{position:fixed;inset:auto 24px 24px auto;z-index:2147483001;display:flex;align-items:center;gap:20px;max-width:min(480px,calc(100vw - 48px));padding:12px 16px;background:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));color:var(--store-background,var(--brand-background,var(--paper,#fff)));font:inherit;box-shadow:0 8px 24px #0002;opacity:0;transform:translateY(12px);visibility:hidden;transition:opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),transform var(--motion-fast,200ms) var(--motion-ease,var(--ease-out,cubic-bezier(.23,1,.32,1))),visibility var(--motion-fast,200ms)}
    .cart-added[data-visible=true]{opacity:1;transform:translateY(0);visibility:visible}.cart-added span{overflow-wrap:anywhere}.cart-added button{flex-shrink:0;min-height:44px;background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:4px}
    @media(max-width:700px){.cart-drawer{width:100vw}.cart-drawer__header{padding:20px}.cart-drawer__body{padding:8px 20px 24px}.cart-drawer>.cart-drawer__continue{width:calc(100% - 40px)!important;margin:0 20px 24px!important}.cart-added{inset:auto 12px 12px;max-width:none;gap:12px}}
    .cart-drawer[data-instant=true],.cart-added[data-instant=true]{transition:none}[data-cart-count]{display:inline-block}
    @media(prefers-reduced-motion:reduce){.cart-drawer,.cart-added{transition:none;transform:none}}
  `;
  shoppingStyle.textContent += `
    [data-pagosya-checkout] .checkout-page__inner{max-width:1200px;min-width:0;container-type:inline-size}
    /* Under the store's own intro, the review lines up with that intro instead of adding a second inset. */
    [data-pagosya-checkout-page][data-authored-intro]:not([hidden]){padding:0 0 clamp(40px,6vw,80px)}
    [data-pagosya-checkout-page][data-authored-intro] .checkout-page__inner{margin:0}
    [data-pagosya-checkout] .checkout-page__summary{padding:0;border:0;border-radius:0;background:transparent}
    [data-pagosya-checkout] .checkout-review{display:grid;grid-template-columns:minmax(280px,1fr) minmax(0,1.35fr);gap:clamp(32px,6vw,96px);align-items:start}
    /* The order review shares cart behavior, but must not inherit an authored
       fixed drawer's geometry. Keep it in the checkout's own content column. */
    [data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{position:static!important;inset:auto!important;z-index:auto;width:100%!important;min-width:0;max-width:none;height:auto!important;min-height:0;max-height:none;margin:0;padding:0;overflow:visible!important;transform:none;box-shadow:none;border:0;background:transparent;color:inherit;opacity:1;visibility:visible}
    [data-pagosya-checkout] .checkout-review>[data-retention-recovery]{grid-column:1 / -1;width:100%;min-width:0}
    [data-pagosya-checkout] .checkout-review>[data-review-root]{grid-column:1 / -1;width:100%;min-width:0}
    .checkout-review__fields{min-width:0}.checkout-review__summary{min-width:0;border-top:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)));padding-top:24px}
    [data-pagosya-checkout] input:not([type=checkbox]):not([type=radio]),[data-pagosya-checkout] textarea{box-sizing:border-box;min-height:48px;width:100%;padding:12px;font:inherit;color:inherit;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));border:1px solid var(--store-border,var(--brand-border,var(--line,#d7d2c7)))}
    [data-pagosya-checkout] fieldset{min-width:0;margin:24px 0;padding:0;border:0}
    [data-pagosya-checkout] [hidden]{display:none!important}
    [data-pagosya-checkout] button{min-height:44px;font:inherit}
    [data-pagosya-checkout] :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    @media(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:1fr;gap:32px}}
    @container(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:minmax(0,1fr);gap:32px}}
  }`;
  document.head.append(shoppingStyle);
  let checkoutTrigger = null, checkoutPreviousHash = "", checkoutOverflow = "";
  const inertBeforeCheckout = new Map();
  const checkoutAnswers = new Map();
  const rememberCheckout = panel => panel.querySelectorAll('input[name],textarea[name],select[name]').forEach(field => { if (field.name !== 'shippingZoneId') checkoutAnswers.set(field.name, field.value); });
  document.addEventListener('input', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  document.addEventListener('change', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  function showCheckout(payment = false) {
    const mode = payment ? 'payment' : 'review';
    // Opening the review also changes the hash; preserve fields on that second notification.
    if (!checkoutPage.hidden && checkoutPage.dataset.mode === mode) return;
    checkoutPage.dataset.mode = mode;
    if (checkoutPage.hidden && !fullCheckoutPage) {
      checkoutOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      for (const child of document.body.children) if (child !== checkoutPage) { inertBeforeCheckout.set(child, child.inert); child.inert = true; }
    }
    checkoutPage.hidden = false;
    // A checkout page usually carries the store's own way back and title right above the mount; repeating
    // them stacks two intros. Only the page mount checks this; the overlay always needs its own.
    const authored = { back: false, title: false };
    for (let node = fullCheckoutPage && checkoutPage === fullCheckoutPage ? checkoutPage.previousElementSibling : null; node && !node.matches('header,[role=banner]'); node = node.previousElementSibling) {
      if (node.matches('a[href]') || node.querySelector('a[href]')) authored.back = true;
      if (node.matches('h1') || node.querySelector('h1')) authored.title = true;
    }
    checkoutPage.toggleAttribute('data-authored-intro', authored.back || authored.title);
    const back = fullCheckoutPage && !payment ? authored.back ? '' : '<a class="checkout-page__back" href="index.html">Volver a la tienda</a>' : `<button class="checkout-page__back" type="button" data-checkout-back>${payment ? 'Volver al resumen' : 'Volver a la tienda'}</button>`;
    const heading = payment ? '<h1 tabindex="-1">Pago de prueba</h1><p class="checkout-page__intro">Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.</p>' : authored.title ? '' : '<h1 tabindex="-1">Revisa tu pedido</h1>';
    checkoutPage.innerHTML = `<div class="checkout-page__inner">${back}<div>${heading}${preview || config.demo ? '<p class="order-note">Vista previa · Sin cobros</p>' : ''}<p data-pagosya-status role="status" aria-live="polite"></p></div><div class="checkout-page__summary"><div data-pagosya-cart data-checkout-review="${payment ? 'payment' : 'review'}"></div></div></div>`;
    renderCart();
    // Moving focus is for the overlay, which opens over the page. A full checkout page is simply loaded, and
    // scripted focus there paints a keyboard ring around the title for mouse and touch users.
    if (checkoutPage !== fullCheckoutPage || payment) checkoutPage.querySelector("h1")?.focus({ preventScroll: true });
    checkoutPage.scrollTop = 0;
  }
  function closeCheckout() {
    if (checkoutPage.hidden) return;
    checkoutPage.hidden = true; checkoutPage.innerHTML = "";
    document.documentElement.style.overflow = checkoutOverflow;
    inertBeforeCheckout.forEach((value, element) => { element.inert = value; }); inertBeforeCheckout.clear();
    checkoutTrigger?.focus();
  }
  function openCheckout(button) {
    if (!cart.size || !ready || checkingOut) return;
    track('checkout_started');
    if (cartDrawer.open) { cartDrawer.close(); restoreDrawer(); }
    if (config.checkoutPage && !fullCheckoutPage) { const link = document.createElement('a'); link.href = pageHref(config.checkoutPage); document.body.append(link); link.click(); link.remove(); return; }
    checkoutTrigger = button; checkoutPreviousHash = location.hash;
    showCheckout();
    location.hash = "checkout";
  }
  window.addEventListener("hashchange", () => {
    if (location.hash === "#checkout") showCheckout();
    else if (location.hash === "#pago-de-prueba" && (preview || config.demo)) showCheckout(true);
    else if (fullCheckoutPage) showCheckout();
    else closeCheckout();
  });
  // Runtime-bound product navigation keeps its item ID even if presentation
  // code later normalizes hrefs. Run before the sandbox's document navigation.
  for (const eventName of ['click', 'auxclick']) window.addEventListener(eventName, event => {
    const link = event.target.closest?.('a[data-product-link]');
    const id = link?.closest('[data-custom-product]')?.dataset.productId;
    if (config.productPage && id && products().some(product => product.id === id)) link.href = pageHref(config.productPage, '?id=' + encodeURIComponent(id));
  }, true);
  // Sold out means no units for the product or for any of its combinations; a shopper cannot choose options that cannot be bought.
  const soldOut = p => limit(p) === 0 || (Array.isArray(p.variants) && p.variants.length > 0 && p.variants.every(v => limit(v) === 0));
  /* Card preview (DNA): how a catalog card previews the product before it is opened. Each falls back to a
   * still card when its data is missing (one photo, fewer than two variant photos, or a full product page). */
  const cardMode = () => hasDna ? document.documentElement.getAttribute('data-dna-card') : null;
  function cardSwatches(p) {
    const seen = new Set(), list = [];
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      const url = variantPhotos(v)[0];
      if (!url || seen.has(url) || typeof v.name !== 'string' || !v.name.trim()) continue;
      seen.add(url);
      list.push({ url, name: v.name, color: (Array.isArray(v.options) ? v.options : []).map(o => typeof o?.name === 'string' && typeof o?.value === 'string' ? swatchColor(o.name, o.value) : '').find(Boolean) || '' });
      if (list.length === 4) break;
    }
    return list.length > 1 ? list : [];
  }
  function cardPreview(p, image) {
    const mode = cardMode();
    if (!image || !mode) return {};
    if (mode === 'second-photo') { const alt = galleryImages(p).find(url => url !== image); return alt ? { alt } : {}; }
    if (mode === 'swatch-swap') { const swatches = cardSwatches(p); return swatches.length ? { swatches } : {}; }
    if (mode === 'quick-look' && !fullProductPage) return { chip: true };
    return {};
  }
  // The second photo is fetched only when the shopper reaches the card (pointer, focus or touch): see loadCardAlt.
  const CARD_SIZES = '(max-width: 820px) 50vw, 25vw';
  const cardAltMarkup = url => `<img class="menu-item__image-alt" data-src="${escape(url)}"${responsiveSrcset(url) ? ` data-srcset="${escape(responsiveSrcset(url))}" data-sizes="${CARD_SIZES}"` : ''} alt="" aria-hidden="true" decoding="async">`;
  // Swatch thumbnails are 22px: the smallest rendition is enough.
  const cardSwatchMarkup = (p, swatches) => `<div class="menu-item__swatches" role="group" aria-label="Variantes de ${escape(p.name)}">${swatches.map(s => `<button type="button" data-card-swatch="${escape(s.url)}" aria-label="Ver ${escape(s.name)}" aria-pressed="false"><span${s.color ? ` style="--swatch:${escape(s.color)}"` : ''}>${s.color ? '' : `<img src="${escape(s.url)}"${responsiveAttrs(s.url, '22px')} alt="" loading="lazy" decoding="async">`}</span></button>`).join('')}</div>`;
  const cardChipMarkup = p => `<button type="button" class="menu-item__quick-look" data-product="${escape(p.id)}" aria-label="Vista rápida de ${escape(p.name)}">Vista rápida</button>`;
  function customProductCard(p, image, complex) {
    const template = document.querySelector('template[data-pagosya-product-template]');
    if (!template || !template.content) return null;
    // React's client renderer appends <template> children to the element, not to its content fragment.
    const source = template.content.children.length ? template.content : template;
    const root = source.firstElementChild?.cloneNode(true);
    const field = name => root?.querySelector(`[data-product-field="${name}"]`);
    const detail = root?.querySelector('a[data-product-link]');
    const buy = root?.querySelector('button[data-product-add]');
    if (source.children.length !== 1 || !root || !field('name') || !field('price') || !detail || !buy) {
      document.documentElement.dataset.productTemplateInvalid = 'true';
      return null;
    }
    root.classList.add('menu-item');
    root.dataset.customProduct = '';
    root.dataset.productId = p.id;
    const fill = (name, value, className) => {
      const node = field(name);
      if (!node) return;
      node.textContent = value; node.classList.add(className);
      if (name === 'description' || name === 'options') node.hidden = !value;
    };
    const groups = optionGroups(p);
    const plural = { color: 'colores', tamaño: 'tamaños', talla: 'tallas', capacidad: 'capacidades', sabor: 'sabores', peso: 'pesos', presentación: 'presentaciones' };
    fill('options', groups ? groups.map(g => plural[g.name.toLowerCase()] ? `${g.values.length} ${plural[g.name.toLowerCase()]}` : `${g.name}: ${g.values.length}`).join(' · ') : '', 'menu-item__options');
    fill('name', p.name, 'menu-item__name');
    fill('price', isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency), 'menu-item__price');
    fill('description', p.description && p.description.trim() !== p.name.trim() ? p.description : '', 'menu-item__description');
    const photo = field('image');
    if (photo) {
      if (photo.tagName !== 'IMG') { document.documentElement.dataset.productTemplateInvalid = 'true'; return null; }
      photo.hidden = !image;
      if (image) { const set = responsiveSrcset(image); if (set) { photo.srcset = set; photo.sizes = '(max-width: 820px) 50vw, 33vw'; } photo.src = image; photo.alt = p.name; photo.loading = 'lazy'; photo.decoding = 'async'; photo.style.objectPosition = imagePosition(p, image); }
      else photo.removeAttribute('src');
      photo.classList.add('menu-item__image');
    }
    const badgeText = productBadge(p), badgeField = field('badge');
    if (badgeField) { badgeField.textContent = badgeText; badgeField.hidden = !badgeText; }
    else if (photo && image && badgeText) {
      photo.insertAdjacentHTML('afterend', badgeMarkup(p, 'menu-item__badge'));
      const holder = photo.parentElement;
      if (holder && getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    }
    root.querySelectorAll('a[data-product-link]').forEach(detail => {
      detail.setAttribute('aria-label', `Ver detalle de ${p.name}`);
      // An image-only link with no image should not leave an empty focus target.
      if (!image && detail.querySelector('img') && !detail.textContent.trim() && !detail.querySelector('svg,canvas')) detail.hidden = true;
      if (config.productPage) detail.href = pageHref(config.productPage, '?id=' + encodeURIComponent(p.id));
      else {
        const button = document.createElement('button');
        for (const attr of [...detail.attributes]) if (attr.name !== 'href') button.setAttribute(attr.name, attr.value);
        button.type = 'button'; button.dataset.product = p.id; button.innerHTML = detail.innerHTML;
        detail.replaceWith(button);
      }
    });
    const cardExtras = cardPreview(p, image);
    // Re-read the photo: an image link may have been rebuilt as a button above.
    if (cardExtras.alt) root.querySelector('.menu-item__image')?.insertAdjacentHTML('afterend', cardAltMarkup(cardExtras.alt));
    if (cardExtras.swatches) {
      const after = field('price');
      if (after && !after.closest('a,button')) after.insertAdjacentHTML('afterend', cardSwatchMarkup(p, cardExtras.swatches)); else root.insertAdjacentHTML('beforeend', cardSwatchMarkup(p, cardExtras.swatches));
    }
    if (cardExtras.chip) {
      // The chip belongs to the photo: right after it, outside any link or button that wraps it.
      let anchor = root.querySelector('.menu-item__image');
      for (let el = anchor?.parentElement; el && el !== root; el = el.parentElement) if (el.matches('a,button')) anchor = el;
      if (anchor) anchor.insertAdjacentHTML('afterend', cardChipMarkup(p)); else root.insertAdjacentHTML('beforeend', cardChipMarkup(p));
    }
    root.toggleAttribute('data-no-image', !image);
    root.querySelectorAll('[data-product-media]').forEach(media => { media.hidden = !image; });
    // Hiding an empty photo must not remove the only route to product details.
    if (!image && ![...root.querySelectorAll('[data-product-link]')].some(link => !link.closest('[hidden]'))) {
      const link = document.createElement(config.productPage ? 'a' : 'button');
      link.dataset.productLink = '';
      link.setAttribute('aria-label', `Ver detalle de ${p.name}`);
      if (config.productPage) link.href = pageHref(config.productPage, '?id=' + encodeURIComponent(p.id));
      else { link.type = 'button'; link.dataset.product = p.id; }
      const name = field('name');
      if (!name.closest('a,button,[hidden]')) { link.textContent = p.name; name.replaceChildren(link); }
      else { link.textContent = 'Ver detalle'; root.append(link); }
    }
    buy.classList.add('menu-add'); buy.type = 'button';
    if (isMembership(p)) {
      buy.dataset.product = p.id; buy.disabled = false; buy.textContent = 'Hacerme miembro';
      buy.setAttribute('aria-label', `Hacerme miembro de ${p.name}`);
    } else {
    buy.dataset.add = p.id; buy.disabled = !ready || soldOut(p) || complex;
    buy.setAttribute('aria-label', `${complex ? 'Elegir opciones de' : 'Añadir'} ${p.name}`);
    if (soldOut(p)) { buy.textContent = 'Agotado'; root.dataset.soldOut = 'true'; }
    else if (complex && (optionGroups(p) || boxGroup(p))) {
      delete buy.dataset.add; buy.dataset.product = p.id; buy.disabled = false;
      buy.textContent = 'Elegir opciones';
    }
    else if (complex) {
      buy.textContent = 'Elegir opciones';
      if (!preview && !config.demo) {
        const link = document.createElement('a');
        for (const attr of [...buy.attributes]) if (!['disabled', 'type', 'data-add'].includes(attr.name)) link.setAttribute(attr.name, attr.value);
        link.href = safeUrl(hostedProduct(p.id)); link.textContent = 'Elegir opciones'; buy.replaceWith(link);
      }
    }
    }
    return root.outerHTML;
  }
  // The default catalog card. Custom templates (customProductCard) take priority when the store authored one.
  function productCard(p) {
    const image = galleryImages(p)[0];
    const complex = p.variants?.length || p.extras?.length;
    const custom = customProductCard(p, image, complex);
    if (custom) return custom;
    const cardExtras = cardPreview(p, image);
    return `<article class="menu-item">${config.productPage ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>` : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`}${image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, "(max-width: 820px) 50vw, 25vw")} alt="${escape(p.name)}" loading="lazy" decoding="async" />${badgeMarkup(p, 'menu-item__badge')}` : ""}${cardExtras.alt ? cardAltMarkup(cardExtras.alt) : ''}${cardExtras.chip ? cardChipMarkup(p) : ''}<div class="menu-item__copy"><h3>${escape(p.name)}</h3>${p.description && p.description.trim() !== p.name.trim() ? `<p>${escape(p.description)}</p>` : ""}${soldOut(p) ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}</strong>${cardExtras.swatches ? cardSwatchMarkup(p, cardExtras.swatches) : ''}${isMembership(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Hacerme miembro de ${escape(p.name)}">Hacerme miembro</button>` : soldOut(p) && complex ? `<button class="menu-add" type="button" disabled aria-label="${escape(p.name)} agotado">Agotado</button>` : complex ? optionGroups(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Elegir opciones de ${escape(p.name)}">Elegir opciones</button>` : preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}</article>`;
  }
  // A catalog without its own layout whose photos fill each card becomes a photo grid, not a stack of full-width cards.
  function structureCatalog(el) {
    // Grid autodetection only makes sense for the mount's own flat list: `sections` cards sit
    // inside .catalog-group__items and already get their grid unconditionally from CSS.
    const ownCards = [...el.querySelectorAll(':scope > .menu-item:not([data-custom-product])')];
    const card = ownCards[0], photo = card?.querySelector('.menu-item__image');
    if (photo && !el.hasAttribute('data-pagosya-grid') && getComputedStyle(el).display === 'block' && photo.getBoundingClientRect().width >= card.getBoundingClientRect().width * 0.6) el.setAttribute('data-pagosya-grid', '');
    // Contrast correction must reach every card, including ones nested inside `sections` groups.
    readableText(el);
  }
  // Card text must not disappear into the card: switch to the store's text or background color, whichever reads.
  // WCAG AA guard for runtime-owned text only: 4.5:1 for body text, 3:1 for large text. Text over
  // photographs or gradients is left alone (its real background is unknown); authored markup outside
  // the commerce slots is never touched.
  const CONTRAST_SLOTS = '[data-pagosya-catalog],[data-pagosya-product-page],[data-pagosya-cart],[data-pagosya-checkout-page],dialog[data-pagosya-product]';
  // The colour probes are inserted and removed on every pass; the observer ignores them, or each pass would queue the next.
  const contrastProbe = () => { const probe = document.createElement('span'); probe.hidden = true; probe.setAttribute('data-pagosya-contrast-probe', ''); return probe; };
  const probeOnly = record => [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && node.hasAttribute('data-pagosya-contrast-probe'));
  function readableText(root) {
    if (!root || !root.isConnected) return;
    const probe = contrastProbe(); root.append(probe);
    // Browsers report color-mix() results as color(srgb r g b / a) with 0–1 channels, not rgb().
    const parseColor = value => { const n = (String(value).match(/[\d.]+/g) || []).map(Number); if (n.length < 3) return null; const scale = /^color\(srgb/i.test(value) ? 255 : 1; return [n[0] * scale, n[1] * scale, n[2] * scale, n.length > 3 ? n[3] : 1]; };
    const rgba = value => { probe.style.color = ''; probe.style.color = value; return parseColor(getComputedStyle(probe).color); };
    const luminance = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    const candidates = ['var(--store-foreground, var(--brand-foreground, #111111))', 'var(--store-background, var(--brand-background, #ffffff))', '#111111', '#ffffff'].map(rgba).filter(Boolean);
    const backgroundOf = element => {
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage && style.backgroundImage !== 'none') return null;
        const color = parseColor(style.backgroundColor);
        if (color && color[3] > .5) return color;
        if (node.tagName === 'IMG' || node.tagName === 'VIDEO') return null;
      }
      return [255, 255, 255, 1];
    };
    const elements = [root, ...root.querySelectorAll('h1,h2,h3,h4,h5,p,span,a,button,label,li,strong,small,dt,dd,th,td,legend,summary,output')].slice(0, 800);
    for (const element of elements) {
      if (element === probe || element.closest('[data-pagosya-contrast="skip"]')) continue;
      if (![...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim())) continue;
      const style = getComputedStyle(element);
      const text = parseColor(style.color);
      const background = backgroundOf(element);
      if (!text || !background || text[3] < .5) continue;
      const size = parseFloat(style.fontSize) || 16, bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
      const required = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (contrast(text, background) >= required) continue;
      // Prefer the store's own colors when they read; fall back to the strongest contrast.
      const chosen = candidates.find(c => contrast(c, background) >= required) || candidates.reduce((best, c) => contrast(c, background) > contrast(best, background) ? c : best);
      element.style.color = `rgb(${chosen.slice(0, 3).join(',')})`;
      element.dataset.pagosyaContrast = 'corrected';
    }
    probe.remove();
  }
  /* Sub-project 7: pay and buy buttons and totals read at 4.5:1 whatever sets their colours (the store's CSS, its kit
   * CSS, the DNA). Measured as the scorecard measures: text composited over the ancestors' background colours, over the
   * page canvas (dark under color-scheme: dark). A failing control takes the first readable colour among the store's ink,
   * paper and on-accent, else pure black or white (one of the two always reaches 4.5:1). The colour is set through a guard
   * attribute and a custom property that the kit's first layer answers with !important, so no stylesheet undoes it at
   * rest, while the store's hover and focus colours still apply. Text over an image, a gradient, a pseudo-element or
   * backdrop filter, or a colour syntax the page cannot compare is left alone, and a hovered or focused control is never
   * measured (its interactive colours would be pinned onto its resting state); it is measured once the pointer leaves. */
  const CONTRAST_GUARDED = '.checkout-button,.menu-add,.product-detail__sticky button,[data-pay],[data-checkout],.order-total,.product-detail__subtotal';
  const contrastWarned = typeof WeakSet === 'function' ? new WeakSet() : null;
  const contrastWaiting = typeof WeakSet === 'function' ? new WeakSet() : null;
  const interacting = el => { try { return el.matches(':hover') || el.matches(':focus-visible'); } catch { return el.matches(':hover'); } };
  function resetContrastGuard() {
    document.querySelectorAll('[data-pagosya-contrast-guard]').forEach(el => {
      const target = el.closest('[data-pagosya-contrast-guard="fixed"]');
      if (target && interacting(target)) return;
      el.style.removeProperty('--pagosya-contrast-color'); el.removeAttribute('data-pagosya-contrast-guard');
    });
  }
  function guardContrast() {
    const targets = document.querySelectorAll(CONTRAST_GUARDED);
    if (!targets.length || !document.body) return;
    const parse = value => {
      const text = String(value), n = (text.match(/-?[\d.]+/g) || []).map(Number);
      if (!/^(?:rgba?\(|color\(srgb)/i.test(text) || n.length < 3) return null;
      const scale = /^color\(srgb/i.test(text) ? 255 : 1;
      return [n[0] * scale, n[1] * scale, n[2] * scale, n.length > 3 ? n[3] : 1];
    };
    const over = (top, base) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
    const luminance = ([r, g, b]) => [r, g, b].map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
    // A decoration paints no real background: a gradient drawn as a line (the DNA underline-grow hover, at most 2px in
    // one direction, 0 at rest) or a gradient whose colours are all mostly transparent (the DNA shine).
    const decorative = style => {
      const image = style.backgroundImage;
      if (!image || image === 'none') return true;
      if (/url\(/i.test(image)) return false;
      const thin = style.backgroundSize.split(',').every(size => size.trim().split(/\s+/).some(part => /^[\d.]+px$/.test(part) && parseFloat(part) <= 2));
      const stops = image.match(/(?:rgba?|color)\([^)]*\)/gi) || [];
      return thin || (stops.length > 0 && stops.every(stop => { const c = parse(stop); return c && c[3] <= .5; }));
    };
    const REPLACED = 'img,video,canvas,picture,iframe,object,embed';
    // Whether a node's own painting hides what is really behind its text: a backdrop filter, a positioned ::before/::after
    // that paints, or a positioned box over a photo or video (its container's opaque colour is not what it sits on).
    const hidden = new Map();
    const obscured = (node, style) => {
      if (hidden.has(node)) return hidden.get(node);
      let result = false;
      const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;
      if (backdropFilter && backdropFilter !== 'none') result = true;
      for (const pseudo of result ? [] : ['::before', '::after']) {
        const box = getComputedStyle(node, pseudo);
        if (!box.content || box.content === 'none' || box.content === 'normal' || !/^(?:absolute|fixed)$/.test(box.position)) continue;
        const color = parse(box.backgroundColor);
        if ((color && color[3] > .1) || !decorative(box)) { result = true; break; }
      }
      if (!result && /^(?:absolute|fixed|sticky)$/.test(style.position)) {
        const rect = node.getBoundingClientRect(), container = node.offsetParent || node.parentElement;
        result = !!container && [...container.querySelectorAll(REPLACED)].some(media => {
          if (node.contains(media)) return false;
          const box = media.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.left < rect.right && box.right > rect.left && box.top < rect.bottom && box.bottom > rect.top;
        });
      }
      hidden.set(node, result);
      return result;
    };
    const probe = contrastProbe(); document.body.append(probe);
    const resolve = value => { probe.style.color = ''; probe.style.color = value; return parse(getComputedStyle(probe).color); };
    const candidates = ['var(--store-foreground, var(--brand-foreground, #111111))', 'var(--store-background, var(--brand-background, #ffffff))', 'var(--store-accent-foreground, var(--brand-accent-foreground, #ffffff))', '#000000', '#ffffff'].map(resolve).filter(c => c && c[3] >= .99);
    // The page canvas under everything: dark when the page asks for color-scheme: dark.
    const canvas = (() => { const c = resolve('Canvas'); return c && c[3] >= .99 ? c : [255, 255, 255, 1]; })();
    probe.remove();
    // `deep` also asks whether anything hides the real background; only a failing control pays for it.
    const backdrop = (element, deep) => {
      const layers = [];
      for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (!decorative(style) || (deep && obscured(node, style))) return null;
        const color = parse(style.backgroundColor);
        if (!color) return null;
        if (color[3] > 0) layers.push(color);
        if (color[3] >= .99) break;
      }
      return layers.reverse().reduce((base, layer) => over(layer, base), canvas);
    };
    targets.forEach(target => {
      // A disabled control is exempt (WCAG 1.4.3); renderCart measures again once it is enabled.
      if (target.closest('[data-pagosya-contrast="skip"]') || target.matches(':disabled,[aria-disabled="true"]')) return;
      if (interacting(target)) {
        if (contrastWaiting && !contrastWaiting.has(target)) {
          contrastWaiting.add(target);
          const later = () => { contrastWaiting.delete(target); target.removeEventListener('pointerleave', later); target.removeEventListener('focusout', later); queueReadableText(); };
          target.addEventListener('pointerleave', later); target.addEventListener('focusout', later);
        }
        return;
      }
      const texts = [target, ...target.querySelectorAll('*')].filter(node => [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim()));
      // An icon-only button (the card's + icon) is read through its own colour, which the icon strokes with.
      const nodes = texts.length ? texts : target.querySelector('svg') ? [target] : [];
      const measured = [];
      for (const node of nodes) {
        const background = backdrop(node, false), text = parse(getComputedStyle(node).color);
        if (!background || !text) return;
        measured.push({ node, background, ratio: contrast(over(text, background), background) });
      }
      if (!measured.length || measured.every(entry => entry.ratio >= 4.5)) return;
      if (measured.some(entry => !backdrop(entry.node, true))) return;
      const worst = color => Math.min(...measured.map(entry => contrast(color, entry.background)));
      const chosen = candidates.find(color => worst(color) >= 4.5) || candidates.reduce((best, color) => worst(color) > worst(best) ? color : best, candidates[0]);
      if (!chosen) return;
      const value = `rgb(${chosen.slice(0, 3).map(Math.round).join(',')})`;
      for (const node of new Set([target, ...measured.map(entry => entry.node)])) {
        node.style.setProperty('--pagosya-contrast-color', value);
        node.setAttribute('data-pagosya-contrast-guard', node === target ? 'fixed' : 'text');
      }
      if (contrastWarned && !contrastWarned.has(target)) {
        contrastWarned.add(target);
        console.warn(`pagosYa: contraste ${Math.min(...measured.map(entry => entry.ratio)).toFixed(2)}:1 en un botón de compra o un total; se usó ${value} para que se lea (mínimo 4.5:1).`, target);
      }
    });
  }
  let contrastQueued = false;
  function queueReadableText() {
    if (contrastQueued) return;
    contrastQueued = true;
    setTimeout(() => {
      contrastQueued = false;
      try { resetContrastGuard(); } catch { /* Guards never break the store. */ }
      document.querySelectorAll(CONTRAST_SLOTS).forEach(readableText);
      try { guardContrast(); } catch { /* Guards never break the store. */ }
    }, 120);
  }
  function guardContrastNow() { try { guardContrast(); } catch { /* Guards never break the store. */ } }
  window.addEventListener('load', queueReadableText);
  if (typeof MutationObserver === 'function') {
    // The guard also runs right away (a mutation callback runs before the page's next task), so a pay or buy button
    // never shows unreadable, not even for the timer's 120ms; the timer then measures again with the text fixes applied.
    const watch = () => new MutationObserver(records => { if (records.some(record => record.type === 'childList' && !probeOnly(record) && (record.target.closest?.(CONTRAST_SLOTS) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches?.(CONTRAST_SLOTS) || node.querySelector?.(CONTRAST_SLOTS)))))) { guardContrastNow(); queueReadableText(); } }).observe(document.body, { childList: true, subtree: true });
    if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch, { once: true });
  }
  const catalogLayout = () => ['all', 'sections', 'page', 'tabs'].includes(store.catalogLayout) ? store.catalogLayout : 'all';
  const collections = () => Array.isArray(store.collections) ? store.collections : [];
  const HOME_PREVIEW = 4;
  // Collected products keep the owner's order inside each group; whatever is
  // left lands in one final group so nothing becomes unreachable.
  function collectionGroups(selected) {
    const byId = new Map(selected.map((p) => [p.id, p]));
    const groups = collections().map((c) => ({
      name: c.name, slug: c.slug,
      items: (c.productIds || []).map((id) => byId.get(id)).filter(Boolean),
    })).filter((group) => group.items.length);
    const grouped = new Set(groups.flatMap((group) => group.items.map((p) => p.id)));
    const rest = selected.filter((p) => !grouped.has(p.id));
    return rest.length ? [...groups, { name: 'Más productos', slug: '', items: rest }] : groups;
  }
  const productsHref = () => pageHref('productos.html');
  const collectionHref = (slug) => pageHref('coleccion.html', '?c=' + encodeURIComponent(slug));
  // Under `page` the link goes to the standalone products page, as it always has. Under `tabs`
  // the catalog already reads as organized by collection, so "Ver todos los productos" instead
  // goes to the first collection's own page — the products page it would otherwise point to
  // isn't reachable from anywhere else in that layout. Falls back to the products page if the
  // store has no collections yet (tabs itself doesn't render without at least one).
  const catalogMore = (layout) => {
    const firstCollection = collections()[0];
    const href = layout === 'tabs' && firstCollection ? collectionHref(firstCollection.slug) : productsHref();
    return `<a class="catalog-more" data-catalog-more href="${escape(href)}">Ver todos los productos</a>`;
  };
  // Shared by the home `tabs` layout (no current tab) and the collection page (marks its own tab).
  const catalogTabs = (currentSlug) => `<nav class="catalog-tabs" aria-label="Colecciones">${collections().map((c) => `<a href="${escape(collectionHref(c.slug))}"${c.slug === currentSlug ? ' aria-current="page"' : ''}>${escape(c.name)}</a>`).join("")}</nav>`;
  function render() {
    delete document.documentElement.dataset.productTemplateInvalid;
    // The catalog can change the fallback style, so this follows every render.
    if (hasDna) document.documentElement.setAttribute('data-dna-product', productPageStyle());
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = store.storeName || "Tu tienda"; });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.hidden = !(store.categories || []).length;
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      // Inventory is live. An empty-at-generation catalog must not stay permanently hidden.
      el.hidden = false;
      const priorities = (el.getAttribute('data-design-product-ids') || '').split(',').filter(Boolean);
      const priority = new Map(priorities.map((id, index) => [id, index]));
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      if (priorities.length) selected.sort((a, b) => (priority.get(a.id) ?? priorities.length) - (priority.get(b.id) ?? priorities.length));
      const layout = el.hasAttribute('data-catalog-full') ? 'all' : catalogLayout();
      el.dataset.catalogLayout = layout;
      if (collectionPage) {
        // An unknown or missing collection shows every product rather than an error.
        const current = currentCollection();
        const items = current ? selected.filter((p) => (current.productIds || []).includes(p.id)) : selected;
        const tabs = collections().length ? catalogTabs(current?.slug) : '';
        const heading = current ? `<h2 class="catalog-group__title">${escape(current.name)}</h2>` : '';
        // The shopper is on a specific collection's page here, not a category filter — "en esta
        // categoría" would describe a page that doesn't exist in this layout.
        el.innerHTML = tabs + (items.length ? heading + items.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta colección.</p>');
      } else if (layout === 'sections' && collections().length) {
        const groups = collectionGroups(selected);
        el.innerHTML = groups.length
          ? groups.map((group) => `<section class="catalog-group"><h3 class="catalog-group__title">${escape(group.name)}</h3><div class="catalog-group__items">${group.items.map(productCard).join("")}</div></section>`).join("")
          : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      } else if (layout === 'page' || layout === 'tabs') {
        const tabs = layout === 'tabs' && collections().length ? catalogTabs() : '';
        el.innerHTML = tabs + selected.slice(0, HOME_PREVIEW).map(productCard).join("") + catalogMore(layout);
      } else {
        // Also covers `sections` with no collections yet: a single "Más productos" group holding
        // the whole catalog isn't an arrangement, so it falls back to the same flat grid as `all`.
        el.innerHTML = selected.length ? selected.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      }
      structureCatalog(el);
      if (MOTIFS.length) { placeCardMotifs(el); placeButtonMotifs(el); }
    });
    observeCards();
    if (hasDna && typeof requestAnimationFrame === 'function') requestAnimationFrame(placeQuickLooks);
    if (fullProductPage && !preview) {
      const p = products().find(item => item.id === new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id'));
      if (p) {
        const canonical = `${(config.publicSiteUrl || `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}`).replace(/\/$/, '')}/p/${encodeURIComponent(p.id)}`;
        document.title = `${p.name} · ${store.storeName || config.slug}`;
        for (const [selector, attribute, value] of [
          ['link[rel="canonical"]', 'href', canonical], ['meta[property="og:url"]', 'content', canonical],
          ['meta[property="og:title"]', 'content', document.title], ['meta[name="description"]', 'content', p.description || p.name],
          ['meta[property="og:description"]', 'content', p.description || p.name], ['meta[property="og:image"]', 'content', safeUrl(p.imageUrls?.[0])],
        ]) document.querySelector(selector)?.setAttribute(attribute, value);
      }
    }
    if (fullCatalogPage && !preview) {
      const current = collectionPage ? currentCollection() : null;
      const canonical = `${(config.publicSiteUrl || `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}`).replace(/\/$/, '')}${current ? `/c/${encodeURIComponent(current.slug)}` : '/productos'}`;
      document.title = `${current ? current.name : 'Productos'} · ${store.storeName || config.slug}`;
      const description = current
        ? `Productos de ${current.name} en ${store.storeName || config.slug}.`
        : `Todos los productos de ${store.storeName || config.slug}.`;
      for (const [selector, attribute, value] of [
        ['link[rel="canonical"]', 'href', canonical], ['meta[property="og:url"]', 'content', canonical],
        ['meta[property="og:title"]', 'content', document.title], ['meta[name="description"]', 'content', description],
        ['meta[property="og:description"]', 'content', description],
      ]) document.querySelector(selector)?.setAttribute(attribute, value);
    }
    // The Studio opens product.html without an id (Boceto's Producto tab, the page picker); a
    // store with a catalog previews its first product. A shopper's broken link keeps the error.
    if (fullProductPage) openProduct(new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id') ?? (preview ? products()[0]?.id : null));
    else if (selectedProduct && detail.open) {
      if (products().some(p => p.id === selectedProduct.id)) openProduct(selectedProduct.id, detailTrigger);
      else detail.close();
    }
    if (fullCheckoutPage) showCheckout(location.hash === '#pago-de-prueba' && (preview || config.demo));
    renderCart();
    renderContact();
    // Validate every authored template as soon as the store is ready, not only when its surface
    // happens to render: added/review/product-page templates otherwise stay unvalidated until a
    // shopper adds to cart, opens checkout or opens a product, which is too late for Studio's
    // publishing check to catch a broken one. This is validation only — each reader just sets or
    // clears its flag and discards the clone; their lazy use at the real render site is unchanged.
    cartLineTemplate(); cartTemplate(); addedTemplate(); reviewTemplate(); productPageTemplate();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  /* T1 templates: a store may author the markup of a kit surface. Read at use time (React may render the
   * <template> after this script, and puts its children on the element instead of .content). */
  function kitTemplate(name, flag, isValid) {
    const template = document.querySelector(`template[data-pagosya-${name}-template]`);
    if (!template) return null;
    const source = template.content && template.content.children.length ? template.content : template;
    const root = source.firstElementChild;
    if (source.children.length !== 1 || !root || !isValid(root)) { document.documentElement.dataset[flag] = 'true'; return null; }
    delete document.documentElement.dataset[flag];
    return { make: () => root.cloneNode(true) };
  }
  const imgField = (root, selector) => { const node = root.querySelector(selector); return !node || node.tagName === 'IMG'; };
  const addedTemplate = () => kitTemplate('added', 'addedTemplateInvalid', root =>
    root.querySelector('[data-added-field="message"]') && root.querySelector('button[data-cart-open]') && imgField(root, '[data-added-field="photo"]'));
  const cartLineTemplate = () => kitTemplate('cart-line', 'cartLineTemplateInvalid', root =>
    ['name', 'line-total', 'quantity'].every(field => root.querySelector(`[data-cart-field="${field}"]`)) && imgField(root, '[data-cart-field="photo"]'));
  function applyLineTemplate(el, views, template) {
    [...el.querySelectorAll('.order-items > li.order-item')].forEach((li, index) => {
      const view = views[index];
      if (!view) return;
      const root = template.make();
      const field = name => root.querySelector(`[data-cart-field="${name}"]`);
      const text = (name, value) => { const node = field(name); if (!node) return; node.textContent = value; node.hidden = !value; };
      root.classList.add('order-item');
      root.dataset.cartLine = view.id;
      text('name', view.p.name);
      text('line-total', money(view.amount * view.quantity, view.p.currency));
      text('option', view.option);
      text('unit', view.unit);
      text('stock', view.stock);
      const photo = field('photo');
      if (photo) {
        photo.hidden = !view.image;
        if (view.image) { photo.src = view.image; photo.alt = ''; photo.loading = 'lazy'; } else photo.removeAttribute('src');
      }
      field('quantity').replaceChildren(li.querySelector('.quantity'));
      const remove = field('remove');
      if (remove) { remove.setAttribute('type', 'button'); remove.setAttribute('data-remove-line', view.id); remove.setAttribute('aria-label', `Quitar ${view.name} del pedido`); }
      li.replaceWith(root);
    });
  }
  const cartTemplate = () => kitTemplate('cart', 'cartTemplateInvalid', root =>
    ['lines', 'total', 'action'].every(slot => root.querySelector(`[data-cart-slot="${slot}"]`)) && root.querySelector('button[data-cart-close]'));
  const CART_PARTS = { lines: '.order-items', suggestions: '.order-recommendations', savings: '.order-savings', total: '.order-total', action: '[data-checkout]', note: '.order-note' };
  function applyCartTemplate(el, empty, template) {
    const root = template.make();
    root.setAttribute('data-cart-panel', '');
    const slot = name => root.querySelector(`[data-cart-slot="${name}"]`);
    root.querySelectorAll('[data-cart-slot]').forEach(node => { if (node.dataset.cartSlot !== 'empty') node.replaceChildren(); });
    let anchor = slot('action');
    for (const part of [...el.children]) {
      const name = Object.keys(CART_PARTS).find(key => part.matches(CART_PARTS[key]));
      const target = name && slot(name);
      if (target) target.append(part);
      else { anchor.after(part); anchor = part; }
    }
    const policies = slot('policies');
    if (policies) policies.innerHTML = policyLinks(['returns', 'delivery', 'terms', 'privacy']);
    const emptySlot = slot('empty');
    if (emptySlot) emptySlot.hidden = !empty;
    // Every other slot hides while the cart is empty, whether or not the template authored an
    // "empty" slot. "lines" is the one exception without an "empty" slot: it carries the kit's own
    // empty-cart text, so it must stay visible to say anything at all.
    for (const name of Object.keys(CART_PARTS)) {
      if (name === 'lines' && !emptySlot) continue;
      const node = slot(name);
      if (node) node.hidden = empty;
    }
    el.replaceChildren(root);
  }
  const reviewTemplate = () => kitTemplate('review', 'reviewTemplateInvalid', root =>
    root.querySelector('[data-review-slot="summary"]') && root.querySelector('[data-review-slot="fields"]'));
  const productPageTemplate = () => kitTemplate('product-page', 'productPageTemplateInvalid', root =>
    ['gallery', 'title', 'pricing', 'buy'].every(slot => root.querySelector(`[data-product-slot="${slot}"]`)));
  // A piece goes to the first slot whose selector it matches; "buy" is last because its "p" catches the sold-out note.
  const PRODUCT_PARTS = [
    ['gallery', '.product-detail__gallery'], ['breadcrumb', '.product-detail__breadcrumb'], ['category', '.product-detail__eyebrow'],
    ['title', '#pagosya-product-title'], ['rating', '.product-detail__rating'], ['pricing', '.product-detail__pricing'],
    ['description', '.product-detail__intro'], ['highlights', '.product-detail__highlights,.product-detail__chips'],
    ['delivery', '.product-detail__assurances'], ['info', '.product-tabs,[role=tabpanel],.product-detail__facts,.product-delivery-list'],
    ['bundles', '.product-detail__bundles,.product-detail__bundle-links'], ['related', '.product-detail__related'], ['reviews', '.product-detail__reviews'],
    ['buy', '.product-detail__options,.product-detail__box,.product-detail__purchase,.product-detail__buy,.product-detail__status,p'],
  ];
  // Purchase terms and anything unrecognised are never lost: they follow the buy slot when the template has no place for them.
  const PRODUCT_DROPPABLE = new Set(['breadcrumb', 'category', 'rating', 'description', 'highlights', 'bundles', 'related', 'reviews']);
  function applyProductPageTemplate() {
    const template = productPageTemplate();
    const layout = detail.querySelector(':scope > .product-detail__layout');
    if (!template || !layout) return;
    const copy = layout.querySelector(':scope > .product-detail__copy');
    const pieces = [...[...layout.children].filter(child => child !== copy), ...(copy ? [...copy.children] : []),
      ...[...detail.children].filter(child => child.matches('.product-detail__bundles,.product-detail__bundle-links,.product-detail__related,.product-detail__reviews'))];
    const root = template.make();
    const slot = name => root.querySelector(`[data-product-slot="${name}"]`);
    root.querySelectorAll('[data-product-slot]').forEach(node => node.replaceChildren());
    const followers = [];
    for (const piece of pieces) {
      const name = PRODUCT_PARTS.find(([, selector]) => piece.matches(selector))?.[0];
      const target = name && slot(name);
      // decorateProductReviews() needs [data-product-rating] to stay in the DOM even without its own slot:
      // a template that authors "reviews" but not "rating" still gets the rating line, leading the reviews it asked for.
      if (target) target.append(piece);
      else if (name === 'rating' && slot('reviews')) slot('reviews').prepend(piece);
      else if (name && PRODUCT_DROPPABLE.has(name)) piece.remove();
      else followers.push(piece);
    }
    if (followers.length) slot('buy').after(...followers);
    layout.replaceWith(root);
    root.setAttribute('data-product-page-root', '');
    detail.setAttribute('data-page-template', '');
  }
  function renderCart() {
    if (hosted && ready) notifyHostedCart();
    else if (!preview && ready) {
      try {
        const value = JSON.stringify(cartItems());
        const storage = config.demo ? sessionStorage : localStorage;
        if (storage.getItem(cartKey) !== value) storage.setItem(cartKey, value);
      } catch { /* The current page still works when storage is unavailable. */ }
    }
    document.querySelectorAll("[data-pagosya-catalog] [data-add], [data-pagosya-product] [data-add]").forEach((button) => {
      const line = cartLine(button.dataset.add);
      button.disabled = !ready || checkingOut || !line || remaining(line.p, line.variant, line.picks) <= 0;
    });
    let total = 0, count = 0, savings = 0;
    const rows = [];
    const lineViews = [];
    for (const [id, quantity] of cart) {
      const line = cartLine(id);
      if (!line) continue;
      const { p, variant, name, amount } = line;
      total += amount * quantity; count += quantity;
      // Each line shows its photo, chosen option, unit price and any active discount.
      const image = safeUrl(variant?.imageUrl) || galleryImages(p)[0];
      const option = [variant ? variant.name : line.extras ? pickLabel(line.extras) : '', line.cadence ? `Suscripción · ${CADENCE_TEXT[line.cadence]}` : ''].filter(Boolean).join(' · ');
      const listUnit = (variant ? variant.amount : p.amount) + (line.extras || []).reduce((sum, e) => sum + e.amount, 0);
      const saved = listUnit > amount ? (listUnit - amount) * quantity : 0;
      savings += saved;
      const laterUnit = line.cadence ? subscriptionRecurringPrice(p, variant, line.cadence) : amount;
      const later = laterUnit !== amount ? `hoy, luego ${money(laterUnit, p.currency)} / ${CADENCE_TEXT[line.cadence]}` : '';
      const unitCopy = quantity > 1 || saved || later ? `<p class="order-item__unit">${money(amount, p.currency)} ${later || 'c/u'}${saved ? ` <s>${money(listUnit, p.currency)}</s>` : ''}</p>` : '';
      const few = Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? `<p class="order-item__stock">${p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`}</p>` : '';
      rows.push(`<li class="order-item"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" src="${escape(image)}"${responsiveAttrs(image, "72px")} alt="" loading="lazy" style="object-position:${escape(imagePosition(p, image))}" />` : ''}<div class="order-item__body"><div class="order-item__head"><strong>${escape(p.name)}</strong><span>${money(amount * quantity, p.currency)}</span></div>${option ? `<p class="order-item__option">${escape(option)}</p>` : ''}${unitCopy}${few}<div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}" ${checkingOut || remaining(p, variant, line.picks) <= 0 ? "disabled" : ""}>+</button></div></div></li>`);
      lineViews.push({ id, p, name, amount, quantity, image, option,
        unit: quantity > 1 || saved || later ? `${money(amount, p.currency)} ${later || 'c/u'}${saved ? ` · antes ${money(listUnit, p.currency)}` : ''}` : '',
        stock: Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? (p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`) : '' });
    }
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
    document.querySelectorAll("[data-pagosya-cart]").forEach((el) => {
      const focused = el.contains(document.activeElement) ? document.activeElement : null;
      const focusedAction = focused?.hasAttribute('data-add') ? 'data-add' : focused?.hasAttribute('data-remove') ? 'data-remove' : focused?.hasAttribute('data-remove-line') ? 'data-remove-line' : null;
      const focusedId = focusedAction ? focused.getAttribute(focusedAction) : null;
      const remembered = el.hasAttribute("data-checkout-review") ? [...checkoutAnswers] : [];
      const answers = [...remembered, ...[...el.querySelectorAll('input:not([type=checkbox]),textarea')].map(field => [field.name, field.value])];
      const previousLocation = el.querySelector("[name=location]")?.value || checkoutAnswers.get("location");
      const previousMethod = el.querySelector("[name=method]")?.value || checkoutAnswers.get("method");
      delete el.dataset.discountedSubtotal;
      const previousCredit = el.querySelector('[name=creditCode]')?.value || '';
      const previousAddress = el.querySelector('[name=shippingAddress]')?.value || '';
      const consentChecked = el.querySelector('[name=subscriptionConsent]')?.checked === true;
      const review = el.hasAttribute("data-checkout-review");
      // Studio's separate payment-preview calculator currently accepts only
      // simple lines. Keep options and order review interactive without sending
      // unsupported variant carts to that calculator (or any real checkout).
      const previewOptions = preview && review && cartItems().some(item => item.variantId || item.extraIds);
      if (review && cart.size && ready) { track('checkout_started'); analytics('checkout_step', { step: 'review' }, 'step:review'); }
      const payment = el.dataset.checkoutReview === "payment";
      const action = review ? payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
      el.innerHTML = `<ul class="order-items">${rows.join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>${cartSuggestionsMarkup()}${review && !digitalOnlyCart() && store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : review && !digitalOnlyCart() && store.shippingEnabled ? '<label class="order-field">Entrega<select name="method"></select></label>' : ""}${review && !digitalOnlyCart() && !store.shippingEnabled && store.locations?.length ? '<fieldset data-delivery-address hidden><legend>Entrega a domicilio</legend><label class="order-field">Dirección y referencia<textarea name="shippingAddress" rows="3" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia"></textarea></label><p class="order-note">Podrás compartir tu ubicación actual al completar tus datos en el pago.</p></fieldset>' : ''}${!digitalOnlyCart() && store.shippingEnabled && review ? `<fieldset data-shipping><legend>Envío</legend>${store.shippingCarriersEnabled ? `${hosted ? departmentMarkup(checkoutAnswers) : destinationMarkup(checkoutAnswers)}<input type="hidden" name="shippingAddress" value="${escape(previousAddress)}">` : `<label class="order-field">Dirección<input name="shippingAddress" maxlength="300" autocomplete="street-address" value="${escape(previousAddress)}"></label>`}<label class="order-field">País de entrega (código de dos letras)<input name="shippingCountry" maxlength="2" placeholder="BO" autocomplete="country"></label><label class="order-field">Código postal<input name="shippingPostalCode" maxlength="20" autocomplete="postal-code"></label><button type="button" data-shipping-quote>Calcular envío</button><label class="order-field">Opción de envío<select name="shippingZoneId"><option value="">Calcula las opciones disponibles</option></select></label><p data-shipping-status role="status" aria-live="polite"></p></fieldset>` : ''}${review && store.creditsEnabled ? `<label class="order-field">Tarjeta de regalo o saldo<input name="creditCode" maxlength="39" autocomplete="off" spellcheck="false" value="${escape(previousCredit)}"></label><button type="button" data-credit-apply>Aplicar saldo</button><p data-credit-status role="status"></p>` : ''}${savings > 0 ? `<div class="order-savings"><span>Ahorras</span><strong>${money(savings, products()[0]?.currency)}</strong></div>` : ''}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">${review ? 'El total final se confirma al pagar.' : 'El total final se confirma en el checkout.'}</p>${review && (store.bundlesEnabled || store.creditsEnabled) ? '<p data-bundle-quote-status role="status"></p>' : ''}${review && !payment && subscriptionLineInCart() ? `<label class="commerce-consent"><input type="checkbox" name="subscriptionConsent"${consentChecked ? ' checked' : ''}> ${escape(consentText(subscriptionLineInCart().cadence))}</label>` : ''}<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut || previewOptions ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`;
      const lineTemplate = cartLineTemplate();
      if (lineTemplate) applyLineTemplate(el, lineViews, lineTemplate);
      const panelTemplate = review ? null : cartTemplate();
      if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);
      if (!count && PACK_MOTIFS.length) placeEmptyMotif(el);
      if (hosted) secureFields(el, ['shippingAddress', 'creditCode'], 'Tu dirección y tu saldo se piden en el formulario seguro de pagosYa al continuar.');
      if (previewOptions) {
        const note = document.createElement('p'); note.className = 'order-note';
        note.textContent = 'Puedes revisar tus opciones aquí. El pago estará disponible en la tienda publicada.';
        el.append(note);
      }
      for (const [name, value] of answers) { const field = [...el.querySelectorAll('input,textarea')].find(field => field.name === name); if (field) field.value = value; }
      const reviewLayout = review ? reviewTemplate() : null;
      if (reviewLayout) {
        const root = reviewLayout.make();
        root.setAttribute('data-review-root', '');
        const summary = root.querySelector('[data-review-slot="summary"]'), fields = root.querySelector('[data-review-slot="fields"]');
        summary.replaceChildren(); fields.replaceChildren();
        for (const child of [...el.children]) (child.matches('.order-items,.order-recommendations,.order-savings,.order-total,.order-note') ? summary : fields).append(child);
        const feedback = document.createElement('p');
        feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
        fields.append(feedback);
        el.replaceChildren(root);
        el.classList.add('checkout-review'); el.setAttribute('data-review-template', '');
      } else if (review) {
        const summary = document.createElement('aside'); summary.className = 'checkout-review__summary';
        summary.innerHTML = `<h2>Tu pedido</h2>${count ? `<p class="checkout-review__count">${count} ${count === 1 ? 'producto' : 'productos'}</p>` : ''}`;
        for (const child of [...el.children]) if (child.matches('.order-items,.order-recommendations,.order-savings,.order-total,.order-note')) summary.append(child);
        const fields = document.createElement('section'); fields.className = 'checkout-review__fields';
        // With nothing to choose, the action button already says what happens next; a heading repeating it is noise.
        fields.innerHTML = digitalOnlyCart() || !(store.locations?.length || store.shippingEnabled) ? '' : '<h2>¿Cómo quieres recibir tu pedido?</h2>';
        fields.append(...el.children); el.append(summary, fields);
        const feedback = document.createElement('p');
        feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
        fields.append(feedback);
        el.classList.add('checkout-review');
      }
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      const branchInfo = document.createElement('p'); branchInfo.className = 'order-note'; branchInfo.setAttribute('data-branch-address', '');
      el.querySelector('[name=method]')?.closest('label')?.after(branchInfo);
      select?.addEventListener("change", () => { updateMethods(el); updateShipping(el); });
      el.querySelector('[name=method]')?.addEventListener('change', () => { updateShipping(el); track('delivery_selected', el.querySelector('[name=method]')?.value); analytics('checkout_step', { step: 'delivery' }, 'step:delivery'); if (el.querySelector('[name=method]')?.value === 'delivery') void mountDestinationMap(el); });
      el.querySelector('[name=shippingZoneId]')?.addEventListener('change', () => void shippingQuote(el));
      // Re-quote only with a complete destination; a partial one would be rejected by the API.
      el.querySelector('[name=destDepartment]')?.addEventListener('change', () => { if (hosted) checkoutAnswers.set('destDepartment', el.querySelector('[name=destDepartment]').value); if (!shippingDestination(el) && !(hosted && shippingDepartment(el))) return; const rate = el.querySelector('[name=shippingZoneId]'); if (rate) rate.value = ''; void shippingQuote(el); });
      el.querySelectorAll('[name=shippingCountry],[name=shippingPostalCode]').forEach(field => field.addEventListener('input', () => updateShipping(el)));
      el.querySelector('[data-credit-apply]')?.addEventListener('click', () => void applyCredit(el));
      el.querySelector('[name=creditCode]')?.addEventListener('input', () => { el.dataset.creditReady = 'false'; el.querySelector('[data-credit-status]').textContent = 'Aplica el código para actualizar el total.'; });
      updateShipping(el);
      if (el.querySelector('[name=method]')?.value === 'delivery') void mountDestinationMap(el);
      if (review && ready && count && store.bundlesEnabled) void bundleQuote(el);
      if (focusedAction) {
        const buttons = [...el.querySelectorAll('button')];
        const replacement = buttons.find(button => button.getAttribute(focusedAction) === focusedId && !button.disabled)
          || buttons.find(button => (button.getAttribute('data-add') === focusedId || button.getAttribute('data-remove') === focusedId) && !button.disabled)
          || buttons.find(button => !button.disabled);
        if (replacement) replacement.focus({preventScroll: true});
        else { el.tabIndex = -1; el.focus({preventScroll: true}); }
      }
    });
    updateOptions();
    updateBox();
    updateQuantity();
    // Totals and pay buttons were just re-rendered (and add buttons re-enabled): measure them again.
    guardContrastNow();
    queueReadableText();
    document.dispatchEvent(new CustomEvent("pagosya:cart-updated"));
  }
  function renderContact() {
    let slot = document.querySelector('[data-pagosya-contact]');
    if (!store.contactFormEnabled) { if (slot) slot.hidden = true; return; }
    // Only an enabled store setting permits the legacy fallback; new stores default off.
    if (!slot && store.contactFormEnabled === true && !fullProductPage && !fullCheckoutPage && (!window.PAGOSYA_PREVIEW_PAGE || window.PAGOSYA_PREVIEW_PAGE === 'index.html')) {
      slot = document.createElement('section'); slot.setAttribute('data-pagosya-contact', '');
      const footer = document.querySelector('body > footer');
      if (footer) footer.before(slot); else (document.querySelector('main') || document.body).append(slot);
    }
    if (!slot) return;
    slot.hidden = false;
    // Older generated pages may already contain the legacy inline form. Keep
    // the widget idempotent, but replace that old markup once with the
    // viewport-pinned launcher and panel.
    if (slot.querySelector('[data-contact-toggle]')) return;
    slot.innerHTML = `<button type="button" class="pagosya-contact-launcher" data-contact-toggle aria-controls="pagosya-contact-panel" aria-expanded="false" aria-label="Abrir formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 7.4 7.4 0 0 1-3.2-.72L5 19.5l1.22-3.15A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span>Contacto</span></button><div class="pagosya-contact-panel" id="pagosya-contact-panel" data-contact-panel hidden><div class="pagosya-contact-heading"><div><h2>${escape(store.contactTitle || 'Conversemos')}</h2><p>${escape(store.contactSubtitle || 'Deja tus datos y tu consulta. El equipo de la tienda te responderá directamente.')}</p></div><button type="button" class="pagosya-contact-close" data-contact-close aria-label="Cerrar formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><form><label>Nombre<input name="name" autocomplete="name" maxlength="120" required></label><label>Correo<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>WhatsApp (opcional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label>Tu mensaje<textarea name="message" rows="4" maxlength="600" required></textarea></label><p>Usaremos estos datos para responder a tu consulta.</p><button type="submit">Enviar consulta</button><p role="status" aria-live="polite" data-contact-status></p></form></div>`;
    const toggle = slot.querySelector('[data-contact-toggle]');
    const panel = slot.querySelector('[data-contact-panel]');
    const close = slot.querySelector('[data-contact-close]');
    const setOpen = (open, returnFocus = false) => {
      slot.dataset.contactOpen = String(open);
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (open) requestAnimationFrame(() => panel.querySelector('input, textarea, button[type="submit"]')?.focus());
      else if (returnFocus) toggle.focus();
    };
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    close.addEventListener('click', () => setOpen(false, true));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && slot.dataset.contactOpen === 'true') setOpen(false, true);
    });
    const form = slot.querySelector('form');
    secureFields(form, ['name', 'email', 'phone', 'message'], 'Tu mensaje se escribe en un formulario seguro de pagosYa.');
    // Opaque previews intentionally disallow native form navigation.
    if (preview || config.demo) {
      const simulate = event => { event.preventDefault(); if (form.reportValidity()) form.querySelector('[data-contact-status]').textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; };
      form.querySelector('button[type="submit"]').addEventListener('click', simulate);
      form.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') simulate(event); });
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'); const status = form.querySelector('[data-contact-status]');
      if (button.disabled || !form.reportValidity()) return;
      if (preview || config.demo) { status.textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; return; }
      button.disabled = true; status.textContent = 'Enviando…';
      try {
        const data = new FormData(form);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [], name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), phone: String(data.get('phone')).trim() || undefined, message: String(data.get('message')).trim() }) });
        const result = await response.json();
        if (!response.ok || !result.submitted) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'No se pudo enviar. Inténtalo otra vez.');
        form.reset(); status.textContent = 'Consulta recibida. El equipo de la tienda te contactará.';
        analytics('contact_submit');
      } catch (error) { status.textContent = error.message || 'No se pudo enviar. Inténtalo otra vez.'; }
      finally { button.disabled = false; }
    });
  }
  const contactStyle = document.createElement('style');
  contactStyle.textContent = `[data-pagosya-contact]{position:fixed;right:24px;bottom:24px;z-index:1000;width:auto;max-width:none;margin:0;padding:0;color:inherit;font:inherit;pointer-events:none}[data-pagosya-contact][hidden]{display:none}[data-pagosya-contact] button{font:inherit;cursor:pointer}[data-pagosya-contact] svg{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.7}[data-pagosya-contact] .pagosya-contact-launcher{display:grid;place-items:center;width:56px;height:56px;padding:0;border:1px solid currentColor!important;border-radius:14px;background:var(--ink,#20211d)!important;color:var(--paper,#fffaf0)!important;pointer-events:auto}[data-pagosya-contact] .pagosya-contact-launcher span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}[data-pagosya-contact] .pagosya-contact-panel{position:absolute;right:0;bottom:68px;width:min(380px,calc(100vw - 32px));max-height:min(720px,calc(100dvh - 104px));overflow:auto;padding:24px;border:1px solid currentColor!important;border-radius:16px;background:var(--paper,#fffaf0)!important;color:var(--ink,#20211d)!important;pointer-events:auto}[data-pagosya-contact] .pagosya-contact-panel[hidden]{display:none}[data-pagosya-contact] .pagosya-contact-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}[data-pagosya-contact] h2{font:inherit;font-size:clamp(24px,4vw,32px);font-weight:700;margin:0 0 10px}[data-pagosya-contact] p{line-height:1.6}[data-pagosya-contact] .pagosya-contact-heading p{margin:0}[data-pagosya-contact] .pagosya-contact-close{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;padding:0;border:1px solid currentColor;border-radius:50%;background:transparent;color:inherit}[data-pagosya-contact] form{display:grid;gap:16px;margin-top:24px}[data-pagosya-contact] label{display:grid;gap:8px;font-size:15px}[data-pagosya-contact] input,[data-pagosya-contact] textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit}[data-pagosya-contact] form>button[type="submit"]{min-height:48px;padding:12px 24px;background:var(--ink,#20211d);color:var(--paper,#fffaf0);border:1px solid currentColor;font:inherit}[data-pagosya-contact] button:disabled{opacity:.6}[data-pagosya-contact] :focus-visible{outline:3px solid currentColor;outline-offset:4px}[data-contact-status]{min-height:24px;overflow-wrap:anywhere}@media(max-width:560px){[data-pagosya-contact]{right:16px;bottom:16px}[data-pagosya-contact] .pagosya-contact-panel{bottom:68px;width:calc(100vw - 32px);padding:20px}}@media(prefers-reduced-motion:reduce){[data-pagosya-contact] *{transition:none!important;animation:none!important}}`;
  // DNA stores: the launcher and panel take the store's tokens and DNA shape (inside the same layer, so its !important colours yield).
  contactStyle.textContent += ':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-launcher{border-radius:var(--kit-radius-panel);border:var(--kit-border) solid var(--kit-line)!important;background:var(--kit-accent)!important;color:var(--kit-on-accent)!important;box-shadow:0 12px 30px -14px #0009}'
    + ':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-panel{border-radius:var(--kit-radius-panel);border:max(var(--kit-border),1px) solid var(--kit-line)!important;background:var(--kit-paper)!important;color:var(--kit-ink)!important;box-shadow:0 24px 60px -24px #0009}'
    + ':root[data-dna-button] [data-pagosya-contact] :is(input,textarea){border-radius:var(--kit-radius);border-color:var(--kit-line)}:root[data-dna-button] [data-pagosya-contact] .pagosya-contact-close{border-radius:var(--kit-radius)}'
    + ':root[data-dna-button] [data-pagosya-contact] h2{font-family:var(--store-heading-font,var(--brand-heading-font,inherit))}';
  contactStyle.textContent = '@layer pagosya-contact-base {' + contactStyle.textContent + '}';
  document.head.append(contactStyle);
  // Design DNA variants (sub-project 5): form becomes per store, behaviour stays platform-owned. Every
  // variant is keyed on :root[data-dna-*] and this element exists only when the store has a DNA, so a
  // store without one renders exactly as before. Surfaces read one shared token set.
  const KIT_BUTTONS = ':where(.menu-add,.checkout-button,[data-pagosya-product] .product-detail__buy,.product-detail__sticky button,.cart-added button,.order-recommendations :is(button,a),.product-detail__bundle-add,[data-pagosya-contact] form>button[type=submit])';
  const KIT_STEPPERS = ':where(.quantity button,.product-detail__quantity,.product-detail__box-stepper button)';
  /* The product page is platform-owned: its kit styles are unlayered and authored rules on its hooks are released
   * (releaseProductPageStyles), so the DNA reaches its buttons with an unlayered, product-scoped copy of the rules. */
  const PAGE_BUTTONS = '[data-pagosya-product][data-style] :is(.product-detail__buy,.product-detail__sticky button,.product-detail__bundle-add)';
  const PAGE_STEPPERS = '[data-pagosya-product][data-style] :is(.product-detail__quantity,.product-detail__box-stepper button)';
  const dnaForm = (value, tokens) => `:root[data-dna-button=${value}]{${tokens}}`;
  const dnaHover = (buttons, value, declarations) => `@media(hover:hover){:root[data-dna-hover=${value}] ${buttons}:hover:not(:disabled){${declarations}}}:root[data-dna-hover=${value}] ${buttons}:focus-visible{${declarations}}`;
  /* Form, focus, hover and press of a set of buttons (and the shape of their steppers). */
  const dnaButtonRules = (buttons, steppers) => [
    /* Primary pay, checkout and buy buttons (.checkout-button) keep their full size (52px cart, 48px checkout and product) and padding. */
    `:root[data-dna-button] ${buttons}:not(.checkout-button){min-height:44px;padding:var(--kit-btn-pad)}`,
    `:root[data-dna-button] ${buttons}{border:var(--kit-btn-border);border-radius:var(--kit-btn-radius);background:var(--kit-btn-bg);color:var(--kit-btn-fg);text-transform:var(--kit-btn-case);font-variant-caps:var(--kit-btn-caps,normal);letter-spacing:var(--kit-btn-tracking);text-decoration:var(--kit-btn-decor);clip-path:var(--kit-btn-clip);box-shadow:var(--kit-btn-shadow);transition:transform var(--motion-fast,160ms) var(--motion-ease,var(--kit-ease)),box-shadow var(--motion-fast,160ms) var(--kit-ease),background-position var(--motion-slow,480ms) var(--kit-ease),background-size var(--motion-base,240ms) var(--kit-ease),filter var(--motion-fast,160ms)}`,
    `:root[data-dna-button] ${steppers}{border-radius:var(--kit-radius);border-width:max(var(--kit-border),1px)}`,
    /* Hover (and keyboard focus): never the only focus indicator. */
    dnaHover(buttons, 'lift', 'transform:translateY(-2px);box-shadow:var(--kit-btn-shadow),0 8px 18px -8px color-mix(in srgb,currentColor 60%,transparent)'),
    /* Fill: the button's edge fills in with its own text colour. The background never changes, so the text keeps its contrast. */
    dnaHover(buttons, 'fill', 'box-shadow:var(--kit-btn-shadow),inset 0 0 0 .2em currentColor'),
    `:root[data-dna-hover=underline-grow] ${buttons}{background-image:linear-gradient(currentColor,currentColor);background-repeat:no-repeat;background-position:50% calc(100% - .35em);background-size:0 1.5px}`,
    dnaHover(buttons, 'underline-grow', 'background-size:calc(100% - 2em) 1.5px'),
    dnaHover(buttons, 'tilt', 'transform:rotate(-2deg)'),
    `:root[data-dna-hover=shine] ${buttons}{background-image:linear-gradient(110deg,transparent 35%,rgb(255 255 255/.38) 50%,transparent 65%);background-repeat:no-repeat;background-size:260% 100%;background-position:100% 0}`,
    dnaHover(buttons, 'shine', 'background-position:0 0'),
    dnaHover(buttons, 'invert', 'background-color:var(--kit-btn-invert-bg);color:var(--kit-btn-invert-fg)'),
    /* Press. The stamp form rocks a little instead. */
    `:root[data-dna-press] ${buttons}:active:not(:disabled){transform:var(--kit-press)}:root[data-dna-press=sink] ${buttons}:active:not(:disabled){box-shadow:none}`,
    `:root[data-dna-button=stamp] ${buttons}:active:not(:disabled){transform:var(--kit-press) rotate(-2.5deg)}`,
    /* Keyboard focus, last so no hover effect replaces it: an ink ring on a paper halo reads on filled and open
     * forms alike, and the tag notch is dropped so nothing clips the ring. The store's own focus style still wins. */
    `:root[data-dna-button] ${buttons}:focus-visible:not(:disabled){outline:3px solid var(--kit-ink);outline-offset:2px;box-shadow:0 0 0 2px var(--kit-paper),var(--kit-btn-shadow);clip-path:none}`,
  ];
  /* Per-form details of the T2b forms that a token cannot carry: press, the ticket notches (unmasked on focus), weight,
   * and the bubbly form's larger pack icon (the icon's base size sits in the lower pagosya-commerce layer). */
  const TICKET_MASK = 'radial-gradient(circle at 0 50%,#0000 .5em,#000 calc(.5em + .5px)) 0 0/51% 100% no-repeat,radial-gradient(circle at 100% 50%,#0000 .5em,#000 calc(.5em + .5px)) 100% 0/51% 100% no-repeat';
  const dnaIdentityButtonRules = buttons => [
    `:root[data-dna-button=sticker] ${buttons}:active:not(:disabled){transform:translate(3px,3px);box-shadow:1px 1px 0 var(--kit-ink)}`,
    `:root[data-dna-button=ticket] ${buttons}{-webkit-mask:${TICKET_MASK};mask:${TICKET_MASK}}`,
    `:root[data-dna-button=ticket] ${buttons}:focus-visible:not(:disabled){-webkit-mask:none;mask:none}`,
    `:root[data-dna-button=bubbly] ${buttons}{font-weight:700}`,
    `:root[data-dna-button=bubbly] ${buttons}:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 -1px 0 color-mix(in srgb,#000 18%,transparent)}`,
    `:root[data-dna-button=brutal] ${buttons}{font-weight:800}`,
    `:root[data-dna-button=brutal] ${buttons}:active:not(:disabled){transform:translate(2px,2px)}`,
  ];
  /* Identity frames (T2b): the photos frames apply to, the stamp's perforated edge and the tape's translucent corners. */
  const FRAMED_PHOTOS = ':is(.menu-item :is(.menu-item__image,.menu-item__image-alt),.order-item__photo)';
  const STAMP_MASK = 'radial-gradient(4px,#0000 97%,#000) round -6px -6px/12px 12px,linear-gradient(#000 0 0) no-repeat 50%/calc(100% - 12px) calc(100% - 12px)';
  const TAPE = 'color-mix(in srgb,var(--kit-accent) 40%,transparent)';
  const TAPE_CORNERS = `linear-gradient(135deg,${TAPE} 0 13px,#0000 13px),linear-gradient(225deg,${TAPE} 0 13px,#0000 13px),linear-gradient(45deg,${TAPE} 0 13px,#0000 13px),linear-gradient(315deg,${TAPE} 0 13px,#0000 13px)`;
  const DNA_CSS = [
    /* Tokens. Colours stay the store's own (--store-*, then --brand-*, then legacy names). */
    `:root{--kit-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));--kit-paper:var(--store-background,var(--brand-background,var(--paper,#fff)));--kit-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--kit-ink))));--kit-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--kit-paper)));--kit-surface:var(--store-surface,var(--brand-surface,color-mix(in srgb,var(--kit-ink) 5%,var(--kit-paper))));--kit-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--kit-ink) 18%,var(--kit-paper))));--kit-radius:var(--store-radius,var(--brand-radius,0px));--kit-radius-panel:var(--kit-radius);--kit-border:1px;--kit-photo-radius:var(--kit-radius);--kit-photo-pad:0px;--kit-photo-bg:transparent;--kit-photo-shadow:none;--kit-ease:var(--motion-ease-settle,cubic-bezier(.23,1,.32,1))}`,
    ...MOTION_CSS,
    ':root[data-dna-radius=none]{--kit-radius:0px;--kit-radius-panel:0px}',
    ':root[data-dna-radius=soft]{--kit-radius:6px;--kit-radius-panel:10px}',
    ':root[data-dna-radius=round]{--kit-radius:14px;--kit-radius-panel:22px}',
    ':root[data-dna-radius=pill]{--kit-radius:999px;--kit-radius-panel:30px}',
    ':root[data-dna-border=none]{--kit-border:0px}:root[data-dna-border=hairline]{--kit-border:1px}:root[data-dna-border=bold]{--kit-border:2.5px}',
    /* Type voice: case and tracking reach open button forms and the kit's panel titles. */
    ':root[data-dna-case=none]{--kit-type-case:none;--kit-type-caps:normal}:root[data-dna-case=upper]{--kit-type-case:uppercase;--kit-type-caps:normal}:root[data-dna-case=small-caps]{--kit-type-case:none;--kit-type-caps:all-small-caps}',
    ':root[data-dna-tracking=tight]{--kit-type-tracking:-.01em}:root[data-dna-tracking=normal]{--kit-type-tracking:.01em}:root[data-dna-tracking=wide]{--kit-type-tracking:.1em}',
    ':root[data-dna-case] :is(.cart-drawer__header h2,.checkout-review__summary h2){font-family:var(--store-heading-font,var(--brand-heading-font,inherit));text-transform:var(--kit-type-case);font-variant-caps:var(--kit-type-caps);letter-spacing:var(--kit-type-tracking)}',
    /* Image framing, for card and cart photos. */
    ':root[data-dna-frame=bleed]{--kit-photo-radius:min(var(--kit-radius),28px);--kit-photo-pad:0px}',
    ':root[data-dna-frame=inset]{--kit-photo-radius:min(var(--kit-radius),24px);--kit-photo-pad:6px;--kit-photo-bg:var(--kit-surface)}',
    ':root[data-dna-frame=rounded]{--kit-photo-radius:18px;--kit-photo-pad:0px}',
    ':root[data-dna-frame=arch]{--kit-photo-radius:999px 999px 8px 8px / 42% 42% 8px 8px;--kit-photo-pad:0px}',
    ':root[data-dna-frame=polaroid]{--kit-photo-radius:2px;--kit-photo-pad:6px 6px 22px;--kit-photo-bg:#fff;--kit-photo-shadow:0 6px 18px -8px #0006}',
    ':root[data-dna-frame=blob]{--kit-photo-radius:58% 42% 55% 45% / 45% 55% 45% 55%;--kit-photo-pad:0px}',
    // A pad mixed toward white nearly vanishes against a light palette (finding 6): --kit-surface already reads as a
    // distinct tint against --kit-paper on any palette, and a hairline ring keeps the perforated edge legible too.
    ':root[data-dna-frame=stamp]{--kit-photo-radius:0px;--kit-photo-pad:8px;--kit-photo-bg:var(--kit-surface);--kit-photo-shadow:inset 0 0 0 1px var(--kit-line)}',
    ':root[data-dna-frame=tape]{--kit-photo-radius:2px;--kit-photo-pad:8px;--kit-photo-bg:color-mix(in srgb,var(--kit-paper) 82%,#fff);--kit-photo-shadow:0 6px 16px -10px #0007}',
    /* Button forms. Filled forms use the store's accent pair; open forms take currentColor, so they read on any card. */
    dnaForm('pill', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:999px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.6em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('block', '--kit-btn-invert-bg:var(--kit-paper);--kit-btn-invert-fg:var(--kit-ink);--kit-btn-radius:0px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-ink);--kit-btn-fg:var(--kit-paper);--kit-btn-case:uppercase;--kit-btn-tracking:.09em;--kit-btn-pad:.9em 1.5em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('underline', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:0px;--kit-btn-border:0 solid transparent;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.5em .15em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:inset 0 -2px 0 currentColor'),
    dnaForm('tag', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:3px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.06em;--kit-btn-pad:.7em 1.7em .7em 1.3em;--kit-btn-decor:none;--kit-btn-clip:polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,0 100%);--kit-btn-shadow:0 0 #0000'),
    dnaForm('stamp', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:2px;--kit-btn-border:4px double currentColor;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:uppercase;--kit-btn-tracking:.16em;--kit-btn-pad:.6em 1.3em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('outline', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:var(--kit-radius);--kit-btn-border:1.5px solid currentColor;--kit-btn-bg:transparent;--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('ghost', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:var(--kit-radius);--kit-btn-border:0 solid transparent;--kit-btn-bg:color-mix(in srgb,currentColor 11%,transparent);--kit-btn-fg:inherit;--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.75em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('split', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:var(--kit-radius);--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.75em 1.2em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    /* Identity libraries (T2b). Sticker: an offset hard shadow in the ink. Ticket: notched ends (a mask, dropped on focus so
     * the ring shows). Bubbly: soft and round with a shaded lip; the pack icon shows a little larger. Brutal: thick ink
     * border on flat accent. All four fill with the store's accent pair, so a pay button reads the way pill does. */
    dnaForm('sticker', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:min(var(--kit-radius),12px);--kit-btn-border:2px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:var(--kit-type-case,none);--kit-btn-caps:var(--kit-type-caps,normal);--kit-btn-tracking:var(--kit-type-tracking,0);--kit-btn-pad:.7em 1.5em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:4px 4px 0 var(--kit-ink)'),
    dnaForm('ticket', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:4px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.08em;--kit-btn-pad:.75em 1.8em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    dnaForm('bubbly', '--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent);--kit-btn-radius:999px;--kit-btn-border:0 solid transparent;--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:none;--kit-btn-tracking:.01em;--kit-btn-pad:.8em 1.7em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:inset 0 -3px 0 color-mix(in srgb,#000 18%,transparent),0 6px 14px -8px color-mix(in srgb,var(--kit-accent) 70%,transparent)'),
    dnaForm('brutal', '--kit-btn-invert-bg:var(--kit-ink);--kit-btn-invert-fg:var(--kit-paper);--kit-btn-radius:0px;--kit-btn-border:3px solid var(--kit-ink);--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-case:uppercase;--kit-btn-tracking:.04em;--kit-btn-pad:.75em 1.4em;--kit-btn-decor:none;--kit-btn-clip:none;--kit-btn-shadow:0 0 #0000'),
    /* Open forms keep a primary pay, checkout or buy button filled with the store's accent pair: it must read as the next step. */
    ':root:is([data-dna-button=underline],[data-dna-button=ghost],[data-dna-button=outline],[data-dna-button=stamp]) :where(.checkout-button,.product-detail__sticky button){--kit-btn-bg:var(--kit-accent);--kit-btn-fg:var(--kit-on-accent);--kit-btn-invert-bg:var(--kit-on-accent);--kit-btn-invert-fg:var(--kit-accent)}',
    /* Split: the price (or the arrow) sits in its own cell. */
    ':root[data-dna-button=split] .checkout-button{display:flex;justify-content:space-between;gap:0}',
    ':root[data-dna-button=split] .checkout-button>svg{box-sizing:content-box;padding-left:1em;margin-left:1em;border-left:1px solid color-mix(in srgb,currentColor 45%,transparent)}',
    ...dnaButtonRules(KIT_BUTTONS, KIT_STEPPERS), ...dnaIdentityButtonRules(KIT_BUTTONS),
    ':root[data-dna-press=squash]{--kit-press:scale(.97,.9)}:root[data-dna-press=sink]{--kit-press:translateY(2px)}:root[data-dna-press=pop]{--kit-press:scale(1.06)}:root[data-dna-press=none]{--kit-press:translate(0)}',
    /* Cart: right drawer (today's place, restyled), bottom sheet, full page or centred card. */
    ':root[data-dna-cart] .cart-drawer{border:0 solid var(--kit-line)}:root[data-dna-cart] .cart-drawer__grip{display:none}',
    ':root[data-dna-cart=drawer] .cart-drawer{inset:0 0 0 auto;width:min(440px,92vw);border-left-width:var(--kit-border);border-radius:var(--kit-radius-panel) 0 0 var(--kit-radius-panel);background:color-mix(in srgb,var(--kit-ink) 3%,var(--kit-paper))}',
    ':root[data-dna-cart=drawer] .cart-drawer:not([open]){transform:translateX(100%);opacity:0}',
    '@starting-style{:root[data-dna-cart=drawer] .cart-drawer[open]{transform:translateX(100%);opacity:0}}',
    ':root[data-dna-cart=sheet] .cart-drawer{inset:auto 0 0 0;margin:0 auto;width:min(760px,100vw);height:auto;max-height:min(88dvh,900px);border-top-width:var(--kit-border);border-radius:var(--kit-radius-panel) var(--kit-radius-panel) 0 0;background:var(--kit-surface);transform:translateY(0)}',
    ':root[data-dna-cart=sheet] .cart-drawer:not([open]){transform:translateY(100%);opacity:0}',
    '@starting-style{:root[data-dna-cart=sheet] .cart-drawer[open]{transform:translateY(100%);opacity:0}}',
    ':root[data-dna-cart=sheet] .cart-drawer__header{position:relative;padding-top:32px}:root[data-dna-cart=sheet] .cart-drawer__grip{display:block;position:absolute;top:12px;left:50%;width:44px;height:5px;border-radius:3px;background:currentColor;opacity:.3;transform:translateX(-50%)}',
    ':root[data-dna-cart=page] .cart-drawer{inset:0;width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;border-radius:0;border-top:var(--kit-border) solid var(--kit-accent);background:var(--kit-surface)}',
    ':root[data-dna-cart=page] .cart-drawer:not([open]){transform:translateY(28px);opacity:0}',
    '@starting-style{:root[data-dna-cart=page] .cart-drawer[open]{transform:translateY(28px);opacity:0}}',
    ':root[data-dna-cart=page] .cart-drawer :is(.cart-drawer__header,.cart-drawer__body),:root[data-dna-cart=page] .cart-drawer>.pagosya-policies{box-sizing:border-box;width:100%;max-width:880px;margin-inline:auto}:root[data-dna-cart=page] .cart-drawer__header{border-bottom-width:max(var(--kit-border),1px)}:root[data-dna-cart=page] .cart-drawer::backdrop{background:var(--kit-surface)}',
    ':root[data-dna-cart=overlay] .cart-drawer{inset:0;margin:auto;width:min(620px,calc(100vw - 32px));height:auto;max-height:min(86dvh,820px);border-width:var(--kit-border);border-radius:var(--kit-radius-panel);background:var(--kit-paper);box-shadow:0 24px 80px -24px #0009}',
    ':root[data-dna-cart=overlay] .cart-drawer:not([open]){transform:scale(.96);opacity:0}',
    '@starting-style{:root[data-dna-cart=overlay] .cart-drawer[open]{transform:scale(.96);opacity:0}}',
    '@media(max-width:700px){:root[data-dna-cart=drawer] .cart-drawer{width:100vw;border-radius:0}:root[data-dna-cart=sheet] .cart-drawer{width:100vw;max-height:92dvh}:root[data-dna-cart=page] .cart-drawer{width:100vw}:root[data-dna-cart=overlay] .cart-drawer{width:calc(100vw - 24px);max-height:calc(100dvh - 24px)}}',
    ':root[data-dna-frame] .order-item__photo{box-sizing:border-box;border-radius:var(--kit-photo-radius);padding:var(--kit-photo-pad);background:var(--kit-photo-bg);box-shadow:var(--kit-photo-shadow)}',
    /* Added to cart: corner toast (restyled), ribbon, bubble under the cart button, inline note, centred stamp. */
    ':root[data-dna-added] .cart-added{box-sizing:border-box;border:var(--kit-border) solid var(--kit-line);flex-wrap:wrap;gap:6px 16px}',
    ':root[data-dna-added=toast] .cart-added{inset:auto 24px 24px auto;width:min(360px,calc(100vw - 48px));padding:14px 16px;border-radius:var(--kit-radius-panel);background:var(--kit-paper);color:var(--kit-ink);box-shadow:0 18px 44px -18px #0008}',
    ':root[data-dna-added=ribbon] .cart-added{inset:0 0 auto 0;width:auto;max-width:none;justify-content:center;padding:14px 24px;border-width:0 0 var(--kit-border);border-radius:0;background:var(--kit-accent);color:var(--kit-on-accent);box-shadow:0 10px 30px -18px #0009}',
    ':root[data-dna-added=ribbon] .cart-added:not([data-visible=true]){transform:translateY(-100%)}',
    ':root[data-dna-added=bubble] .cart-added{inset:var(--added-top,16px) var(--added-right,auto) auto var(--added-left,auto);width:min(300px,calc(100vw - 24px));padding:12px 14px;border-radius:max(var(--kit-radius-panel),8px);background:var(--kit-ink);color:var(--kit-paper);box-shadow:0 14px 34px -14px #0009}',
    ':root[data-dna-added=bubble] .cart-added::before{content:"";position:absolute;top:-7px;left:var(--added-arrow,calc(100% - 36px));width:12px;height:12px;background:inherit;transform:rotate(45deg)}',
    ':root[data-dna-added=bubble] .cart-added:not([data-visible=true]){transform:translateY(-8px) scale(.96)}',
    ':root[data-dna-added=inline] .cart-added{inset:var(--added-top,auto) auto auto var(--added-left,12px);width:min(320px,calc(100vw - 24px));padding:10px 12px;border-radius:min(var(--kit-radius),12px);border-left:4px solid var(--kit-accent);background:var(--kit-surface);color:var(--kit-ink);box-shadow:0 10px 24px -14px #0008}',
    ':root[data-dna-added=inline] .cart-added:not([data-visible=true]){transform:translateY(-6px)}',
    ':root[data-dna-added=stamp] .cart-added{inset:0;margin:auto;width:fit-content;height:fit-content;max-width:calc(100vw - 48px);flex-direction:column;justify-content:center;padding:18px 28px;border:4px double currentColor;border-radius:var(--kit-radius);background:var(--kit-paper);color:var(--kit-ink);text-align:center;text-transform:uppercase;letter-spacing:.12em;box-shadow:0 30px 80px -30px #0009;transform:rotate(-4deg)}',
    ':root[data-dna-added=stamp] .cart-added:not([data-visible=true]){transform:rotate(-4deg) scale(1.12)}',
    '@media(max-width:700px){:root[data-dna-added=toast] .cart-added{inset:auto 12px 12px 12px;width:auto}:root[data-dna-added=ribbon] .cart-added{inset:auto 0 0 0;border-width:var(--kit-border) 0 0}:root[data-dna-added=ribbon] .cart-added:not([data-visible=true]){transform:translateY(100%)}:root[data-dna-added=bubble] .cart-added{left:12px;right:12px;width:auto}}',
    ':root[data-dna-added] .cart-added[data-flip=bottom]{inset:auto 12px 12px 12px;width:auto;margin:0}:root[data-dna-added] .cart-added[data-flip=top]{inset:12px 12px auto 12px;width:auto;margin:0}',
    /* Checkout review: the same fields and actions in four layouts; the order summary becomes a DNA panel. */
    ':root[data-dna-density=airy]{--kit-review-max:680px;--kit-summary-fr:.8fr;--kit-gap:clamp(40px,7vw,112px);--kit-pad:clamp(22px,3.4vw,36px)}:root[data-dna-density=balanced]{--kit-review-max:780px;--kit-summary-fr:1fr;--kit-gap:clamp(32px,5vw,80px);--kit-pad:clamp(18px,3vw,28px)}:root[data-dna-density=dense]{--kit-review-max:920px;--kit-summary-fr:1.3fr;--kit-gap:clamp(20px,3vw,40px);--kit-pad:clamp(14px,2vw,20px)}',
    ':root[data-dna-review] .checkout-review__summary{box-sizing:border-box;padding:var(--kit-pad,clamp(18px,3vw,28px));border:var(--kit-border) solid var(--kit-line);border-radius:var(--kit-radius-panel);background:var(--kit-surface)}',
    ':root[data-dna-review=split] .checkout-review{grid-template-columns:minmax(260px,var(--kit-summary-fr,1fr)) minmax(0,1.35fr);gap:var(--kit-gap,clamp(32px,6vw,96px))}:root[data-dna-review=split] .checkout-review__summary{position:sticky;top:24px}',
    ':root[data-dna-review=stacked] .checkout-review{grid-template-columns:minmax(0,1fr);max-width:var(--kit-review-max,760px);margin-inline:auto;gap:var(--kit-gap,32px)}:root[data-dna-review=stacked] .checkout-review__summary{box-shadow:0 18px 40px -30px #0007}',
    ':root[data-dna-review=ticket] .checkout-review{grid-template-columns:minmax(0,1.35fr) minmax(260px,var(--kit-summary-fr,.9fr));gap:var(--kit-gap,clamp(32px,6vw,96px))}:root[data-dna-review=ticket] .checkout-review__fields{grid-column:1;grid-row:1}',
    ':root[data-dna-review=ticket] .checkout-review__summary{grid-column:2;grid-row:1;position:sticky;top:24px;padding-bottom:40px;border:1.5px dashed color-mix(in srgb,var(--kit-ink) 35%,transparent);border-bottom:0;border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:var(--kit-paper);font-variant-numeric:tabular-nums;-webkit-mask:radial-gradient(circle at 9px 100%,#0000 6px,#000 6.5px) 0 0/18px 100%;mask:radial-gradient(circle at 9px 100%,#0000 6px,#000 6.5px) 0 0/18px 100%;box-shadow:0 1px 0 color-mix(in srgb,var(--kit-ink) 8%,transparent)}',
    ':root[data-dna-review=ticket] .checkout-review__summary h2{text-transform:uppercase;letter-spacing:.14em;font-size:max(13px,.8em)}',
    ':root[data-dna-review=notebook] .checkout-review{grid-template-columns:minmax(0,var(--kit-summary-fr,.85fr)) minmax(0,1.15fr);gap:var(--kit-gap,clamp(28px,5vw,72px))}',
    ':root[data-dna-review=notebook] .checkout-review__summary{padding-left:32px;border:0;border-left:3px double color-mix(in srgb,var(--kit-accent) 70%,transparent);border-radius:0;background:repeating-linear-gradient(var(--kit-paper) 0 31px,color-mix(in srgb,var(--kit-accent) 22%,var(--kit-paper)) 31px 32px)}',
    ':root[data-dna-review=notebook] .checkout-review__summary .order-item{border-bottom-style:dotted}',
    '@media(max-width:700px){:root[data-dna-review] .checkout-review{grid-template-columns:minmax(0,1fr)}:root[data-dna-review] :is(.checkout-review__summary,.checkout-review__fields){grid-column:auto;grid-row:auto;position:static}}',
    '@container(max-width:700px){:root[data-dna-review] .checkout-review{grid-template-columns:minmax(0,1fr)}:root[data-dna-review] :is(.checkout-review__summary,.checkout-review__fields){grid-column:auto;grid-row:auto;position:static}}',
    /* Catalog cards: framing, and how the card previews the product (hover, keyboard focus, long press on touch). */
    ':root[data-dna-frame=bleed]{--kit-photo-round:min(var(--kit-radius),28px)}:root[data-dna-frame=inset]{--kit-photo-round:min(var(--kit-radius),24px)}:root[data-dna-frame=rounded]{--kit-photo-round:18px}:root[data-dna-frame=arch]{--kit-photo-round:50% 50% 8px 8px / 42% 42% 8px 8px}:root[data-dna-frame=polaroid]{--kit-photo-round:2px}',
    ':root[data-dna-frame=blob]{--kit-photo-round:58% 42% 55% 45% / 45% 55% 45% 55%}:root[data-dna-frame=stamp]{--kit-photo-round:0px}:root[data-dna-frame=tape]{--kit-photo-round:2px}',
    ':root[data-dna-frame] .menu-item :is(.menu-item__image,.menu-item__image-alt){box-sizing:border-box;border-radius:var(--kit-photo-radius);padding:var(--kit-photo-pad);background-color:var(--kit-photo-bg);box-shadow:var(--kit-photo-shadow)}',
    `:root[data-dna-frame=stamp] ${FRAMED_PHOTOS}{-webkit-mask:${STAMP_MASK};mask:${STAMP_MASK}}`,
    `:root[data-dna-frame=tape] ${FRAMED_PHOTOS}{background-image:${TAPE_CORNERS};background-repeat:no-repeat;background-size:30px 30px;background-position:0 0,100% 0,0 100%,100% 100%}`,
    ':root[data-dna-card=second-photo] .menu-item__image-alt{position:absolute;z-index:0;top:0;left:0;width:100%;height:auto;object-fit:cover;opacity:0;pointer-events:none;transition:opacity var(--motion-base,320ms) var(--kit-ease)}',
    '@media(hover:hover){:root[data-dna-card=second-photo] .menu-item:hover .menu-item__image-alt{opacity:1}}:root[data-dna-card=second-photo] .menu-item:is(:focus-within,[data-previewing]) .menu-item__image-alt{opacity:1}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches{position:relative;z-index:2;display:flex;flex-wrap:wrap;gap:4px;margin:4px 0 0}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches button{display:grid;place-items:center;width:36px;height:36px;min-height:0;margin:0;padding:0;border:0;border-radius:50%;background:none;color:inherit;cursor:pointer}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches span{display:block;width:22px;height:22px;overflow:hidden;border-radius:50%;background:var(--swatch,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,currentColor 28%,transparent)}:root[data-dna-card=swatch-swap] .menu-item__swatches img{display:block;width:100%;height:100%;object-fit:cover}',
    ':root[data-dna-card=swatch-swap] .menu-item__swatches button[aria-pressed=true] span{box-shadow:0 0 0 2px var(--kit-paper),0 0 0 3.5px currentColor}:root[data-dna-card=swatch-swap] .menu-item__swatches button:focus-visible{outline:2px solid currentColor;outline-offset:1px}',
    ':root[data-dna-card=zoom] .menu-item__image{clip-path:inset(0 round var(--kit-photo-round,0px));transition:transform var(--motion-slow,600ms) var(--motion-ease,var(--kit-ease)),clip-path var(--motion-slow,600ms) var(--kit-ease)}',
    '@media(hover:hover){:root[data-dna-card=zoom] .menu-item:hover .menu-item__image{transform:scale(1.08);clip-path:inset(3.7% round var(--kit-photo-round,0px))}}:root[data-dna-card=zoom] .menu-item:focus-within .menu-item__image{transform:scale(1.08);clip-path:inset(3.7% round var(--kit-photo-round,0px))}',
    ':root[data-dna-card=quick-look] .menu-item__quick-look{position:absolute;z-index:3;top:calc(var(--look-top,0px) + 10px);left:calc(var(--look-left,100%) - 10px);right:auto;min-height:36px;margin:0;padding:6px 14px;border:1px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);color:var(--kit-ink);font:inherit;font-size:13px;line-height:1.2;cursor:pointer;opacity:0;transform:translate(-100%,-4px);transition:opacity var(--motion-fast,200ms) var(--kit-ease),transform var(--motion-fast,200ms) var(--motion-ease,var(--kit-ease))}',
    '@media(hover:hover){:root[data-dna-card=quick-look] .menu-item:hover .menu-item__quick-look{opacity:1;transform:translateX(-100%)}}:root[data-dna-card=quick-look] .menu-item:focus-within .menu-item__quick-look{opacity:1;transform:translateX(-100%)}@media(hover:none){:root[data-dna-card=quick-look] .menu-item__quick-look{opacity:1;transform:translateX(-100%)}}',
    ':root[data-dna-card=quick-look] .menu-item__quick-look:focus-visible{outline:3px solid currentColor;outline-offset:2px}',
    ':root[data-dna-card=tilt] .menu-item{transition:transform var(--motion-fast,240ms) var(--kit-ease)}:root[data-dna-card=tilt] .menu-item[data-tilting]{transform:perspective(900px) rotateX(var(--card-tilt-y,0deg)) rotateY(var(--card-tilt-x,0deg))}',
  ];
  const DNA_REDUCED_MOTION = `@media(prefers-reduced-motion:reduce){:root[data-dna-button] ${KIT_BUTTONS},:root[data-dna-cart] .cart-drawer,:root[data-dna-added] .cart-added,:root[data-dna-card] .menu-item,:root[data-dna-card] .menu-item :is(.menu-item__image,.menu-item__image-alt,.menu-item__quick-look){transition:none}:root[data-dna-card=tilt] .menu-item[data-tilting]{transform:none}}`;
  /* Product card DNA (theme plan): each value keys on :root[data-dna-*], so a store without these values renders as before.
   * Only cosmetic parts change; price, stock, option state, quantity and the buy button are never restyled here. */
  const PC = '[data-pagosya-product][data-style]';
  const PRODUCT_CARD_CSS = [
    /* swatch: shape of the option choices. Every shape keeps a 44px target and the same aria-pressed state. */
    `:root[data-dna-swatch=circle] ${PC} .product-detail__swatch{border-radius:50%}:root[data-dna-swatch=circle] ${PC} .product-detail__values:not([data-kind=swatch]) [data-product-option]{min-width:44px;min-height:44px;padding:8px 12px;border-radius:999px}`,
    `:root[data-dna-swatch=square] ${PC} .product-detail__swatch{border-radius:3px}:root[data-dna-swatch=square] ${PC} [data-product-option]{border-radius:2px}:root[data-dna-swatch=square] ${PC} [data-kind=swatch] [data-product-option]{border-radius:0}`,
    `:root[data-dna-swatch=label] ${PC} .product-detail__swatch{display:none}:root[data-dna-swatch=label] ${PC} [data-product-option],:root[data-dna-swatch=label] ${PC} [data-product-option][aria-pressed=true]{min-width:44px;min-height:44px;padding:6px 4px;border:0;border-radius:0;box-shadow:none;background:none;text-decoration:underline;text-decoration-color:transparent;text-underline-offset:7px;text-decoration-thickness:2px}`,
    `:root[data-dna-swatch=label] ${PC} [data-product-option][aria-pressed=true]{text-decoration-color:currentColor;color:var(--pd-ink)}:root[data-dna-swatch=label] ${PC} [data-kind=swatch] .product-detail__option-label{position:static;width:auto;height:auto;overflow:visible;clip-path:none;white-space:normal}`,
    `:root[data-dna-swatch=photo] ${PC} .product-detail__swatch-photo{display:block;width:52px;height:52px;flex:0 0 auto;overflow:hidden;border-radius:var(--pd-radius,8px);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}:root[data-dna-swatch=photo] ${PC} .product-detail__swatch-photo img{display:block;width:100%;height:100%;object-fit:cover}`,
    `:root[data-dna-swatch=photo] ${PC} [data-product-option]:has(.product-detail__swatch-photo){flex-direction:column;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px}:root[data-dna-swatch=photo] ${PC} [aria-pressed=true] .product-detail__swatch-photo{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}`,
    /* gallery: rail is today's layout. strip puts the thumbnails in a row under the photo; stack and mosaic show every photo. */
    `:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails{position:static;display:flex;flex-direction:row;flex-wrap:nowrap;gap:8px;margin-top:10px;overflow-x:auto}:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails button{flex:0 0 64px;width:64px;height:64px}:root[data-dna-gallery=strip] ${PC} .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}`,
    `:root[data-dna-gallery=stack] ${PC} .product-detail__stage,:root[data-dna-gallery=mosaic] ${PC} .product-detail__stage{display:none}:root[data-dna-gallery=stack] ${PC} .product-detail__gallery,:root[data-dna-gallery=mosaic] ${PC} .product-detail__gallery{position:static}`,
    `:root[data-dna-gallery=stack] ${PC} .product-detail__stack{display:grid;gap:12px}:root[data-dna-gallery=stack] ${PC} .product-detail__stack img{display:block;width:100%;height:auto}`,
    `:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack img{display:block;width:100%;height:100%;object-fit:cover}:root[data-dna-gallery=mosaic] ${PC} .product-detail__stack img:first-child{grid-column:1/-1}`,
    /* blocks: the frame around each content block. */
    `:root[data-dna-blocks=card] ${PC} .product-detail__block{padding:14px;border:1px solid var(--pd-line);border-radius:var(--pd-radius,10px);background:var(--pd-surface,var(--pd-paper));box-shadow:0 6px 18px -12px color-mix(in srgb,var(--pd-ink) 45%,transparent)}`,
    `:root[data-dna-blocks=outline] ${PC} .product-detail__block{padding:12px;border:1.5px solid var(--pd-ink);border-radius:0}`,
    `:root[data-dna-blocks=tape] ${PC} .product-detail__block{position:relative;padding:16px 14px 12px;border:1px solid var(--pd-line);background:var(--pd-surface,var(--pd-paper))}:root[data-dna-blocks=tape] ${PC} .product-detail__block::before{content:"";position:absolute;top:-9px;left:50%;width:72px;height:18px;transform:translateX(-50%) rotate(-2deg);background:color-mix(in srgb,var(--pd-ink) 14%,transparent)}`,
    `:root[data-dna-blocks=ticket] ${PC} .product-detail__block{padding:16px;border:1.5px solid var(--pd-ink);border-radius:8px;outline:1px dashed var(--pd-line);outline-offset:-8px}`,
    /* divider: the rule that opens the blocks section. */
    `:root[data-dna-divider=hairline] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:1px solid var(--pd-line)}`,
    `:root[data-dna-divider=dashed] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:1.5px dashed var(--pd-ink)}`,
    `:root[data-dna-divider=bold] ${PC} .product-detail__blocks{margin-top:32px;padding-top:24px;border-top:3px solid var(--pd-ink)}`,
    /* enter: entrance of the cosmetic parts, only when the shopper allows motion. */
    `@media(prefers-reduced-motion:no-preference){@keyframes pd-enter-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes pd-enter-slide{from{opacity:0;transform:translateX(-22px)}to{opacity:1;transform:none}}@keyframes pd-enter-pop{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}`
      + [['fade-up'], ['slide'], ['pop']].map(([name]) => `:root[data-dna-enter=${name}] ${PC} :is([data-part=gallery],[data-part=eyebrow],[data-part=title],[data-part=intro],[data-part=highlights],[data-part=blocks]){animation:pd-enter-${name} var(--motion-slow,520ms) var(--motion-ease-settle,ease) both}`).join('') + '}',
  ];
  const DNA_PAGE_CSS = [
    ...PRODUCT_CARD_CSS,
    ...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS), ...dnaIdentityButtonRules(PAGE_BUTTONS),
    ':root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy{display:flex;justify-content:space-between;gap:0}',
    '@media(min-width:481px){:root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy-total:not(:empty){display:inline-block;margin-left:1em;padding-left:1em;border-left:1px solid color-mix(in srgb,currentColor 45%,transparent)}:root[data-dna-button=split] [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:none}}',
  ];
  if (hasDna) {
    const dnaStyle = document.createElement('style');
    dnaStyle.dataset.pagosyaKit = 'dna';
    // Every variant sits in the pagosya-dna layer: above the kit defaults, below the store's own (unlayered) CSS.
    dnaStyle.textContent = `@layer pagosya-dna {\n${[...DNA_CSS, DNA_REDUCED_MOTION].join('\n')}\n}\n${DNA_PAGE_CSS.join('\n')}`;
    document.head.append(dnaStyle);
    /* Product theme: guarded CSS the API sanitized (product-theme-css.ts) before it reached config.dna.productCss. This check is
     * defence in depth only, a coarse refusal of what the sanitizer never emits; it does not re-implement the sanitizer.
     * It goes after the kit's own styles so an equally specific theme rule wins. */
    const themeCss = config.dna.productCss;
    if (typeof themeCss === 'string' && themeCss && themeCss.length <= 8000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|pointer-events|!\s*important/i.test(themeCss)) {
      const themeStyle = document.createElement('style');
      themeStyle.dataset.pagosyaKit = 'product-theme';
      themeStyle.textContent = themeCss;
      document.head.append(themeStyle);
    }
  }
  /* Card preview listeners (DNA stores only). The second photo follows the photo's box; a long press previews
   * it on touch (and swallows the click that follows); keyboard focus previews it too (CSS :focus-within). */
  function loadCardAlt(alt) {
    if (!alt?.dataset.src || alt.hasAttribute('src')) return;
    if (alt.dataset.srcset) { alt.srcset = alt.dataset.srcset; alt.sizes = alt.dataset.sizes || CARD_SIZES; }
    alt.src = alt.dataset.src;
  }
  function syncCardAlt(card) {
    const photo = card?.querySelector('.menu-item__image'), alt = card?.querySelector('.menu-item__image-alt');
    if (!photo || !alt) return;
    loadCardAlt(alt);
    const style = getComputedStyle(photo);
    Object.assign(alt.style, { top: `${photo.offsetTop}px`, left: `${photo.offsetLeft}px`, width: `${photo.offsetWidth}px`, height: `${photo.offsetHeight}px`, borderRadius: style.borderRadius, objectPosition: style.objectPosition });
  }
  /* The quick-look chip hangs from the photo's top-right corner (measured in the chip's positioned ancestor),
   * so a row or an asymmetric template never has its price or name covered. */
  function placeQuickLook(card) {
    const chip = card?.querySelector('.menu-item__quick-look'), photo = card?.querySelector('.menu-item__image');
    if (!chip || !photo) return;
    const host = chip.offsetParent || card, p = photo.getBoundingClientRect(), h = host.getBoundingClientRect();
    if (!p.width || !p.height) return;
    chip.style.setProperty('--look-top', `${Math.round(p.top - h.top - (host.clientTop || 0))}px`);
    chip.style.setProperty('--look-left', `${Math.round(p.right - h.left - (host.clientLeft || 0))}px`);
  }
  function placeQuickLooks() { if (cardMode() === 'quick-look') document.querySelectorAll('.menu-item').forEach(placeQuickLook); }
  if (hasDna) {
    const cardOf = event => event.target?.closest?.('.menu-item');
    const reach = card => { syncCardAlt(card); placeQuickLook(card); };
    document.addEventListener('pointerover', event => reach(cardOf(event)), { passive: true });
    document.addEventListener('focusin', event => reach(cardOf(event)));
    // Touch shows the chip without hover: place it once the photos have a size, and again when the layout changes.
    document.addEventListener('load', event => { if (event.target?.matches?.('.menu-item .menu-item__image')) placeQuickLook(cardOf(event)); }, true);
    addEventListener('resize', placeQuickLooks, { passive: true });
    let pressTimer, pressedCard = null, swallowUntil = 0;
    /* Only a press on the photo previews: a slow tap on the add button, a link or a field must still act. The default
     * card's details overlay covers the photo, so a press on it counts when the finger is inside the photo's box. */
    const photoPress = event => {
      const card = cardOf(event), photo = card?.querySelector('.menu-item__image');
      if (!photo || !card.querySelector('.menu-item__image-alt')) return null;
      if (photo.contains(event.target) || event.target.closest?.('.menu-item__image-alt')) return card;
      const control = event.target.closest?.('button,a,input,select,textarea,label,summary,[role=button]');
      if (control && !control.contains(photo) && !control.matches('.menu-item__details')) return null;
      const touch = event.touches?.[0], r = photo.getBoundingClientRect();
      return touch && touch.clientX >= r.left && touch.clientX <= r.right && touch.clientY >= r.top && touch.clientY <= r.bottom ? card : null;
    };
    document.addEventListener('touchstart', event => {
      const card = photoPress(event);
      if (!card) return;
      loadCardAlt(card.querySelector('.menu-item__image-alt'));
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => { syncCardAlt(card); card.setAttribute('data-previewing', ''); pressedCard = card; }, 450);
    }, { passive: true });
    const release = () => { clearTimeout(pressTimer); if (pressedCard) { pressedCard.removeAttribute('data-previewing'); pressedCard = null; swallowUntil = Date.now() + 600; } };
    for (const name of ['touchend', 'touchcancel', 'touchmove']) document.addEventListener(name, release, { passive: true });
    document.addEventListener('contextmenu', event => { if (event.target?.closest?.('.menu-item[data-previewing]')) event.preventDefault(); });
    document.addEventListener('click', event => {
      if (Date.now() < swallowUntil && cardOf(event)) { swallowUntil = 0; event.preventDefault(); event.stopImmediatePropagation(); return; }
      const swatch = event.target?.closest?.('[data-card-swatch]');
      const card = swatch?.closest('.menu-item'), photo = card?.querySelector('.menu-item__image');
      if (!photo) return;
      event.preventDefault();
      const set = responsiveSrcset(swatch.dataset.cardSwatch);
      if (set) { photo.srcset = set; photo.sizes = photo.getAttribute('sizes') || CARD_SIZES; } else { photo.removeAttribute('srcset'); photo.removeAttribute('sizes'); }
      photo.src = swatch.dataset.cardSwatch; photo.style.objectPosition = '';
      card.querySelectorAll('[data-card-swatch]').forEach(button => button.setAttribute('aria-pressed', String(button === swatch)));
    }, true);
    // Tilt follows a fine pointer only, and never with reduced motion.
    const tiltAllowed = () => cardMode() === 'tilt' && config.motion !== 'off' && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.addEventListener('pointermove', event => {
      const card = event.pointerType === 'mouse' && tiltAllowed() ? cardOf(event) : null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      card.setAttribute('data-tilting', '');
      card.style.setProperty('--card-tilt-x', `${(((event.clientX - r.left) / r.width) - 0.5) * 7}deg`);
      card.style.setProperty('--card-tilt-y', `${(0.5 - ((event.clientY - r.top) / r.height)) * 7}deg`);
    }, { passive: true });
    document.addEventListener('pointerout', event => {
      const card = cardOf(event);
      if (!card || card.contains(event.relatedTarget)) return;
      card.removeAttribute('data-tilting'); card.style.removeProperty('--card-tilt-x'); card.style.removeProperty('--card-tilt-y');
    }, { passive: true });
  }
  // Carrier stores (shippingCarriersEnabled) need a structured Bolivian address
  // and a door pin. The map is optional: address + "Usar mi ubicación" still work.
  const DEPARTMENTS = [['LA_PAZ','La Paz'],['SANTA_CRUZ','Santa Cruz'],['COCHABAMBA','Cochabamba'],['ORURO','Oruro'],['POTOSI','Potosí'],['CHUQUISACA','Chuquisaca'],['TARIJA','Tarija'],['BENI','Beni'],['PANDO','Pando']];
  const DEPARTMENT_CENTERS = { LA_PAZ: [-16.5, -68.15], SANTA_CRUZ: [-17.78, -63.18], COCHABAMBA: [-17.39, -66.16], ORURO: [-17.97, -67.11], POTOSI: [-19.58, -65.75], CHUQUISACA: [-19.05, -65.26], TARIJA: [-21.53, -64.73], BENI: [-14.83, -64.9], PANDO: [-11.03, -68.77] };
  const insideBolivia = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;
  // Subresource Integrity for the cdnjs Leaflet 1.9.4 files (sha512 of the exact bytes served).
  const LEAFLET_JS_SRI = 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==';
  const LEAFLET_CSS_SRI = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
  // Quoted rates by id → carrierId (null for the store's own riders). Only carrier rates need the pin.
  const shippingRateCarriers = new Map();
  const carrierRateSelected = panel => { const id = panel?.querySelector('[name=shippingZoneId]')?.value; return Boolean(id && shippingRateCarriers.get(id)); };
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    leafletLoading ??= new Promise((resolve, reject) => {
      const fail = () => { leafletLoading = null; reject(new Error('No se pudo cargar el mapa.')); };
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = 'anonymous'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(css);
      const script = document.createElement('script'); script.integrity = LEAFLET_JS_SRI; script.crossOrigin = 'anonymous'; script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => window.L ? resolve(window.L) : fail(); script.onerror = fail;
      document.head.append(script);
    });
    return leafletLoading;
  }
  // Hosted stores never collect the address inside the design: only the department (enough to quote
  // courier rates) is chosen here, and pagosYa's secure form asks for the rest at checkout.
  function departmentMarkup(saved) {
    return `<label class="order-field">Departamento de entrega<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.get('destDepartment') === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  }
  function shippingDepartment(panel) {
    if (!store.shippingCarriersEnabled || panel?.querySelector('[name=method]')?.value !== 'delivery') return undefined;
    return panel.querySelector('[name=destDepartment]')?.value || undefined;
  }
  function destinationMarkup(saved) {
    const v = key => escape(saved.get(key) || '');
    return `<fieldset class="shipping-destination" data-shipping-destination><legend>Dirección de entrega</legend>
      <label class="order-field">Departamento<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.get('destDepartment') === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <label class="order-field">Ciudad<input name="destCity" required maxlength="80" autocomplete="address-level2" value="${v('destCity')}"></label>
      <label class="order-field">Calle y número<input name="destStreet" required maxlength="200" autocomplete="street-address" value="${v('destStreet')}"></label>
      <label class="order-field">Referencias<input name="destReferences" maxlength="300" placeholder="Color de la puerta, un lugar cercano…" value="${v('destReferences')}"></label>
      <label class="order-field">Nombre de quien recibe<input name="destName" required maxlength="120" autocomplete="name" value="${v('destName')}"></label>
      <label class="order-field">Teléfono de quien recibe<input name="destPhone" type="tel" required inputmode="tel" pattern="\\+?[0-9 ]{7,16}" autocomplete="tel" value="${v('destPhone')}"></label>
      <input type="hidden" name="destLat" value="${v('destLat')}"><input type="hidden" name="destLng" value="${v('destLng')}">
      <div class="shipping-map" data-shipping-map style="height:220px;border-radius:12px" role="group" aria-label="Mapa: mueve el marcador a tu puerta"></div>
      <button type="button" class="ghost" data-use-location>Usar mi ubicación</button>
      <p class="order-note" data-pin-status role="status">Marca tu puerta en el mapa.</p></fieldset>`;
  }
  async function mountDestinationMap(panel) {
    const box = panel?.querySelector('[data-shipping-map]'); if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    const lat = panel.querySelector('[name=destLat]'), lng = panel.querySelector('[name=destLng]'), status = panel.querySelector('[data-pin-status]');
    let marker = null;
    if (insideBolivia(Number(lat.value || NaN), Number(lng.value || NaN))) status.textContent = 'Ubicación marcada.';
    const setPin = (a, b) => {
      if (!insideBolivia(a, b)) { status.textContent = 'La ubicación debe estar dentro de Bolivia.'; return false; }
      lat.value = String(a); lng.value = String(b); status.textContent = 'Ubicación marcada.';
      checkoutAnswers.set('destLat', lat.value); checkoutAnswers.set('destLng', lng.value);
      marker?.setLatLng([a, b]); return true;
    };
    if (preview || config.demo || location.hostname === 'localhost') window.__pagosyaSetPin = setPin;
    panel.querySelector('[data-use-location]').addEventListener('click', () => {
      const failed = () => { status.textContent = 'No pudimos obtener tu ubicación; marca tu puerta en el mapa.'; };
      if (!navigator.geolocation) { status.textContent = 'Tu navegador no comparte la ubicación.'; return; }
      status.textContent = 'Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude), failed, { enableHighAccuracy: true, timeout: 10000 });
    });
    try {
      const L = await loadLeaflet();
      if (!box.isConnected) return;
      const dept = panel.querySelector('[name=destDepartment]').value;
      const pinned = insideBolivia(Number(lat.value || NaN), Number(lng.value || NaN));
      const start = pinned ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[dept] || DEPARTMENT_CENTERS.LA_PAZ;
      const map = L.map(box).setView(start, pinned ? 17 : 13);
      // The panel may still be settling when the map mounts; re-measure so tiles fill the box.
      requestAnimationFrame(() => map.invalidateSize?.());
      if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize?.()).observe(box);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      if (L.Icon?.Default) L.Icon.Default.imagePath = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/';
      marker = L.marker(start, { draggable: true, keyboard: true, title: 'Tu puerta', alt: 'Tu puerta: usa las flechas para moverla' }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); if (!setPin(p.lat, p.lng)) marker.setLatLng(lat.value ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[panel.querySelector('[name=destDepartment]').value] || DEPARTMENT_CENTERS.LA_PAZ); });
      // Leaflet markers are focusable but not keyboard-draggable; arrow keys move the pin (Shift for bigger steps).
      marker.getElement?.()?.addEventListener('keydown', event => {
        const step = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key]; if (!step) return;
        event.preventDefault(); event.stopPropagation();
        const p = marker.getLatLng(), d = event.shiftKey ? 0.002 : 0.0002;
        if (setPin(p.lat + step[0] * d, p.lng + step[1] * d)) map.panTo(marker.getLatLng());
      });
      map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
      panel.querySelector('[name=destDepartment]').addEventListener('change', event => { const c = DEPARTMENT_CENTERS[event.target.value]; if (c && !lat.value) { map.setView(c, 13); marker.setLatLng(c); } });
    } catch { if (status.isConnected) status.textContent = 'No se pudo cargar el mapa. Escribe bien las referencias y usa "Usar mi ubicación".'; }
  }
  function shippingDestination(panel) {
    if (!store.shippingCarriersEnabled || panel?.querySelector('[name=method]')?.value !== 'delivery') return undefined;
    const get = name => panel.querySelector(`[name=${name}]`)?.value.trim() || '';
    const lat = Number(get('destLat') || NaN), lng = Number(get('destLng') || NaN);
    if (!get('destDepartment') || !insideBolivia(lat, lng)) return undefined;
    if ([...panel.querySelectorAll('[data-shipping-destination] [required]')].some(input => !input.checkValidity())) return undefined;
    return { department: get('destDepartment'), city: get('destCity'), street: get('destStreet'), references: get('destReferences') || undefined, lat, lng, recipientName: get('destName'), recipientPhone: get('destPhone') };
  }
  function syncShippingAddress(panel) {
    const field = panel?.querySelector('[name=shippingAddress]'); if (!field || !panel.querySelector('[data-shipping-destination]')) return;
    const dest = shippingDestination(panel);
    if (carrierRateSelected(panel)) { if (dest) field.value = `${dest.street}, ${dest.city}`; return; }
    // Own-rider rates keep today's plain address: street, city and references, no pin needed.
    const get = name => panel.querySelector(`[name=${name}]`)?.value.trim() || '';
    field.value = [get('destStreet'), get('destCity'), get('destReferences')].filter(Boolean).join(', ');
  }
  function digitalOnlyCart() { return cart.size > 0 && [...cart.keys()].every(id => cartLine(id)?.p.fulfillmentType === 'DIGITAL'); }
  function updateMethods(el, selected) {
    const method = el.querySelector("[name=method]");
    if (!method) return;
    const location = store.locations?.find((l) => l.id === el.querySelector("[name=location]")?.value);
    const methods = [((location ? location.pickupEnabled : store.shippingPickupEnabled) && (!store.shippingEnabled || store.shippingPickupEnabled)) && ["pickup", "Recoger en tienda"], (location ? location.deliveryEnabled : store.shippingEnabled) && ["delivery", "Entrega a domicilio"]].filter(Boolean);
    method.innerHTML = methods.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (methods.some(([value]) => value === selected)) method.value = selected;
  }
  function updateShipping(panel) {
    const address = panel.querySelector('[data-delivery-address]');
    if (address) address.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const branch = store.locations?.find(location => location.id === panel.querySelector('[name=location]')?.value);
    const info = panel.querySelector('[data-branch-address]');
    if (info) info.textContent = panel.querySelector('[name=method]')?.value === 'pickup' ? branch?.address || '' : '';
    const field = panel.querySelector('[data-shipping]');
    if (field) field.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const rate = panel.querySelector('[name=shippingZoneId]');
    if (rate) rate.value = '';
    if (panel.dataset.discountedSubtotal) panel.querySelector('.order-total strong').textContent = money(Number(panel.dataset.discountedSubtotal), products()[0]?.currency);
    panel.querySelector('.order-total span').textContent = 'Subtotal';

  }
  async function bundleQuote(panel) {
    const status = panel.querySelector('[data-bundle-quote-status]');
    if (!status || preview || config.demo) return;
    status.textContent = 'Comprobando ofertas…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), locationId: panel.querySelector('[name=location]')?.value || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudieron comprobar las ofertas.');
      if (panel.querySelector('[data-bundle-quote-status]') !== status) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - quote.discountAmount);
      if (!panel.querySelector('[name=shippingZoneId]')?.value) panel.querySelector('.order-total strong').textContent = money(quote.subtotal - quote.discountAmount, quote.currency);
      status.textContent = quote.discountAmount ? `Oferta aplicada: −${money(quote.discountAmount, quote.currency)}.` : 'No hay ofertas aplicables a esta selección.';
    } catch (error) { status.textContent = error.message || 'No se pudieron comprobar las ofertas.'; }
  }
  async function shippingQuote(panel) {
    const field = panel.querySelector('[data-shipping]'); if (!field || !cart.size) return;
    const status = field.querySelector('[data-shipping-status]');
    if (preview || config.demo) { status.textContent = 'Las tarifas reales se calculan en la tienda publicada. Esta vista no crea pedidos.'; return; }
    const button = field.querySelector('[data-shipping-quote]');
    const select = field.querySelector('[name=shippingZoneId]');
    const selected = select.value;
    syncShippingAddress(panel);
    button.disabled = true; status.textContent = 'Calculando envío…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), fulfillmentMethod: 'delivery', locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: selected || undefined, creditCode: panel.querySelector('[name=creditCode]')?.value.trim() || undefined, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo calcular el envío.');
      for (const option of quote.shippingOptions || []) shippingRateCarriers.set(option.id, option.carrierId || null);
      if (panel.querySelector('[name=shippingZoneId]') !== select || select.value !== selected) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - (quote.discountAmount || 0));
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      panel.querySelector('.order-total span').textContent = selected ? 'Total' : 'Subtotal';
      select.innerHTML = '<option value="">Elige tu zona y servicio</option>' + quote.shippingOptions.map(option => `<option value="${escape(option.id)}">${escape(option.name)} · ${money(option.amount, option.currency)}</option>`).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
      status.textContent = !quote.shippingOptions.length ? 'No hay opciones disponibles para este pedido. Contacta al comercio.' : selected ? `Envío: ${money(quote.shippingAmount, quote.currency)}. Total: ${money(quote.amount, quote.currency)}.` : 'Elige la opción que corresponde a tu dirección.';
    } catch (error) { status.textContent = error.message || 'No se pudo calcular el envío.'; select.value = ''; }
    finally { button.disabled = false; }
  }
  async function applyCredit(panel) {
    const status = panel.querySelector('[data-credit-status]');
    if (preview || config.demo) { status.textContent = 'El saldo se valida en la tienda publicada.'; return; }
    const code = panel.querySelector('[name=creditCode]').value.trim();
    const button = panel.querySelector('[data-credit-apply]'); button.disabled = true;
    panel.dataset.creditReady = 'false'; status.textContent = 'Validando saldo…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), creditCode: code || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined, locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: panel.querySelector('[name=shippingZoneId]')?.value || undefined, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo aplicar el saldo.');
      if (panel.querySelector('[name=creditCode]')?.value.trim() !== code || !button.isConnected) return;
      panel.dataset.creditReady = 'true';
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      status.textContent = `Saldo aplicado: ${money(quote.creditAmount || 0, quote.currency)}. Restante a pagar: ${money(quote.amount, quote.currency)}.`;
    } catch (error) { status.textContent = error.message || 'No se pudo aplicar el saldo.'; }
    finally { button.disabled = false; }
  }
  function validateDelivery(panel) {
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !panel?.querySelector('[name=method]')?.value) {
      message('Esta sucursal no tiene un método de entrega disponible.');
      panel?.querySelector('[name=location]')?.focus(); return false;
    }
    const department = panel?.querySelector('select[name=destDepartment]');
    if (hosted && department && !department.value && panel.querySelector('[name=method]')?.value === 'delivery' && !digitalOnlyCart()) {
      department.reportValidity(); department.focus(); message('Elige el departamento de entrega.'); return false;
    }
    if (store.shippingCarriersEnabled && panel?.querySelector('[data-shipping-destination]') && panel.querySelector('[name=method]')?.value === 'delivery' && !digitalOnlyCart()) {
      if (carrierRateSelected(panel)) {
        for (const input of panel.querySelectorAll('[data-shipping-destination] [required]')) if (!input.reportValidity()) { input.focus(); return false; }
        if (!shippingDestination(panel)) { message('Marca tu puerta en el mapa.'); panel.querySelector('[data-pin-status]').textContent = 'Marca tu puerta en el mapa o usa "Usar mi ubicación".'; return false; }
      } else {
        const street = panel.querySelector('[name=destStreet]');
        if (street && !street.value.trim()) {
          street.setCustomValidity('Escribe la dirección y una referencia para la entrega.'); street.reportValidity(); street.focus();
          street.addEventListener('input', () => street.setCustomValidity(''), { once: true }); return false;
        }
      }
      syncShippingAddress(panel);
    }
    const field = panel?.querySelector('[name=shippingAddress]');
    if (!field || panel.querySelector('[name=method]')?.value !== 'delivery' || digitalOnlyCart()) return true;
    const valid = Boolean(field.value.trim());
    field.setCustomValidity(valid ? '' : 'Escribe la dirección y una referencia para la entrega.');
    if (!valid) { field.reportValidity(); field.focus(); }
    field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
    return valid;
  }
  document.addEventListener('pagosya:validate-checkout', event => { if (event.detail) event.detail.valid = validateDelivery(event.detail.panel); });
  async function checkout(button) {
    if (!cart.size || !ready || checkingOut || button.disabled) return;
    analytics('pay_click');
    const panel = button.closest("[data-pagosya-cart]");
    if (!validateDelivery(panel)) return;
    const subscriptionLine = subscriptionLineInCart();
    // Consent is only needed when actually paying: WhatsApp/external flows never carry subscription lines.
    const paying = !preview && !config.demo && store.checkoutMode !== 'whatsapp' && store.checkoutMode !== 'external';
    if (subscriptionLine && paying && !panel.querySelector('[name=subscriptionConsent]')?.checked) { message('Acepta las condiciones de la suscripción para continuar.'); return; }
    const locationId = panel.querySelector("[name=location]")?.value;
    const fulfillmentMethod = panel.querySelector("[name=method]")?.value;
    if (fulfillmentMethod) { track('delivery_selected', fulfillmentMethod); analytics('checkout_step', { step: 'delivery' }, 'step:delivery'); }
    const shippingZoneId = panel.querySelector('[name=shippingZoneId]')?.value;
    const creditCode = panel.querySelector('[name=creditCode]')?.value.trim() || undefined;
    if (creditCode && panel.dataset.creditReady !== 'true') { message('Aplica el saldo antes de continuar.'); return; }
    const shippingAddress = panel.querySelector('[name=shippingAddress]')?.value.trim();
    if (!preview && !config.demo && !digitalOnlyCart() && store.shippingEnabled && fulfillmentMethod === 'delivery' && (!shippingZoneId || (!hosted && !shippingAddress))) { message(hosted ? 'Calcula el envío y elige tu zona.' : 'Calcula el envío, elige tu zona y escribe la dirección.'); return; }
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !fulfillmentMethod) { message("Esta sucursal no tiene un método de entrega disponible."); return; }
    if (preview || config.demo) { showCheckout(true); location.hash = "pago-de-prueba"; return; }
    if (store.checkoutMode === "whatsapp") {
      const phone = String(store.contactPhone || "").replace(/\D/g, "");
      if (!phone) { message("El comercio todavía no tiene un número de WhatsApp configurado."); return; }
      const text = [...cart].map(([id, quantity]) => `${quantity} × ${cartLine(id)?.name}`).join("\n");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, quisiera pedir:\n${text}`)}`;
      analytics('whatsapp_click'); flushAnalytics();
      if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); return;
    }
    if (store.checkoutMode === "external") {
      const url = safeUrl(store.leadCaptureUrl);
      if (url) { if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); } else message("El comercio todavía no tiene un enlace de contacto configurado.");
      return;
    }
    checkingOut = true; button.disabled = true; button.setAttribute("aria-busy", "true"); message("Preparando tu pedido…");
    flushAnalytics();
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/cart-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ partnerCode: window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug) ? partnerCode : undefined, creditCode, recoveryToken: window.PAGOSYA_RETENTION_STATE?.token || undefined, ...(fulfillmentMethod === 'delivery' ? { shippingAddress, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) } : {}), ...(store.shippingEnabled ? { fulfillmentMethod, shippingZoneId, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined } : {}), items: checkoutItems(), ...(subscriptionLine ? { subscriptionConsent: true } : {}), ...(locationId ? { locationId, fulfillmentMethod } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(" ") : result.message || "No pudimos preparar el pedido.");
      if (hosted) return;
      if (typeof result.clientSecret !== "string" || !result.clientSecret) throw new Error("El checkout no devolvió una sesión válida.");
      const destination = new URL(`/s/${encodeURIComponent(config.slug)}`, config.checkoutOrigin);
      destination.hash = `client_secret=${encodeURIComponent(result.clientSecret)}`;
      window.location.assign(destination.href);
    } catch (error) { checkingOut = false; message(error.message); button.disabled = false; button.removeAttribute("aria-busy"); }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button || button.disabled) return;
    if (button.hasAttribute('data-product-delivery')) {
      const tab = detail.querySelector('[data-product-tab="delivery"]'); selectProductTab(tab); tab.focus(); return;
    }
    if (button.hasAttribute('data-product-jump')) {
      const groups = optionGroups(selectedProduct), buy = detail.querySelector('.product-detail__buy');
      const missing = groups && groups.findIndex((group, index) => selectedOptions[index] === undefined);
      if (groups && missing >= 0) {
        const fieldset = detail.querySelectorAll('.product-detail__options fieldset')[missing];
        fieldset.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        fieldset.querySelector('[data-product-option]:not(:disabled)')?.focus({ preventScroll: true });
      } else if (buy && !buy.disabled) buy.click();
      return;
    }
    if (button.hasAttribute('data-product-quantity')) {
      selectedQuantity += Number(button.dataset.productQuantity); updateQuantity(); return;
    }
    if (button.hasAttribute('data-box-pick')) {
      const group = boxGroup(selectedProduct), id = button.dataset.boxPick;
      if (!group) return;
      if (Number(button.dataset.step) > 0) { if (selectedPicks.length < group.count) selectedPicks.push(id); }
      else if (selectedPicks.includes(id)) selectedPicks.splice(selectedPicks.lastIndexOf(id), 1);
      updateBox();
      // The clicked control can become disabled (box full, none left); keep keyboard users in the picker.
      const again = detail.querySelector(`[data-box-pick="${CSS.escape(id)}"][data-step="${button.dataset.step}"]`);
      (again && !again.disabled ? again : detail.querySelector('[data-box-add]:not(:disabled)') || detail.querySelector('[data-box-progress]'))?.focus?.();
      return;
    }
    if (button.hasAttribute('data-product-option')) {
      const index = Number(button.dataset.productOption), groups = optionGroups(selectedProduct);
      if (!groups) return;
      const previous = [...selectedOptions];
      const chosen = [...selectedOptions]; chosen[index] = groups[index].values[Number(button.dataset.optionValue)];
      selectedOptions = completeSelection(selectedProduct, chosen);
      // Never change a later choice silently: say which ones availability replaced.
      const replaced = groups.map((group, i) => i > index && previous[i] !== undefined && previous[i] !== selectedOptions[i] ? `${group.name}: ${selectedOptions[i] ?? 'sin elegir'}` : '').filter(Boolean);
      selectionNote = replaced.length ? `Actualizamos ${replaced.join(', ')} por disponibilidad.` : '';
      updateOptions();
      // An early choice may preview a photo only if every compatible variant agrees.
      const matches = selectedProduct.variants.filter(v => variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
      const sets = matches.map(variantPhotos);
      const agreed = sets.length && sets.every(set => set.length && JSON.stringify(set) === JSON.stringify(sets[0])) ? sets[0] : [];
      const nextGallery = agreed.length > 1 ? agreed : null;
      const changed = JSON.stringify(nextGallery) !== JSON.stringify(activeGallery);
      activeGallery = nextGallery;
      if (changed) drawGallery(currentGallery());
      if (!activeGallery) showImage(agreed.length === 1 ? currentGallery().indexOf(agreed[0]) : 0);
      return;
    }
    if (button.hasAttribute("data-product-tab")) { selectProductTab(button); return; }
    if (button.hasAttribute("data-product-close")) { detail.close(); return; }
    if (button.hasAttribute("data-product")) { openProduct(button.dataset.product, button); return; }
    if (button.hasAttribute("data-product-image")) { showImage(Number(button.dataset.productImage)); return; }
    if (button.hasAttribute("data-product-prev")) { showImage(selectedImage - 1); return; }
    if (button.hasAttribute("data-product-next")) { showImage(selectedImage + 1); return; }
    if (checkingOut) return;
    if (button.hasAttribute("data-checkout-back")) { location.hash = location.hash === "#pago-de-prueba" ? "checkout" : checkoutPreviousHash; return; }
    if (button.hasAttribute("data-finish-demo") && (preview || config.demo)) {
      if (fullCheckoutPage) showCheckout(); else closeCheckout();
      const completed = () => message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      // hashchange can rebuild the review after this click; retain its confirmation.
      if (location.hash !== checkoutPreviousHash) window.addEventListener('hashchange', completed, { once: true });
      location.hash = checkoutPreviousHash; completed(); return;
    }
    if (button.hasAttribute("data-category")) { category = button.dataset.category; render(); }
    if (button.hasAttribute("data-bundle-add") && ready) {
      const bundle = (Array.isArray(store.bundles) ? store.bundles : []).find(candidate => candidate.id === button.dataset.bundleAdd), entries = bundleEntries(bundle);
      if (!bundle || !entries.length || entries.some(entry => !entry.p || !simpleProduct(entry.p) || remaining(entry.p) < entry.quantity)) { message("Este paquete ya no está disponible completo."); return; }
      track('add_to_cart', undefined, { value: entries.reduce((sum, entry) => sum + price(entry.p) * entry.quantity, 0), currency: entries[0].p.currency });
      for (const entry of entries) analytics('add_to_cart', { productId: entry.p.id });
      for (const entry of entries) cart.set(lineKey(entry.p.id), (cart.get(lineKey(entry.p.id)) || 0) + entry.quantity);
      renderCart(); message(`${bundle.name} añadido a tu pedido.`);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${bundle.name} añadido a tu pedido.`;
      return;
    }
    if (button.hasAttribute("data-add") && ready) {
      // The product page's buy button follows the shopper's current choice, not a stale key.
      const choosing = button.classList.contains('product-detail__buy') && selectedProduct && detail.querySelector('[data-subscription-choice]');
      const chosenVariant = choosing && optionGroups(selectedProduct) ? selectedVariant() : undefined;
      const key = choosing && !(optionGroups(selectedProduct) && !chosenVariant) ? lineKey(selectedProduct.id, chosenVariant?.id, selectedCadence()) : button.dataset.add, line = cartLine(key);
      if (!line) return;
      const conflict = cadenceConflict(line.cadence);
      if (conflict) {
        showCadenceConflict(line.cadence); message(conflict);
        if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = conflict;
        return;
      }
      const { p, variant, name } = line;
      const quantity = cart.get(key) || 0;
      if (remaining(p, variant, line.picks) <= 0) { message("Ya añadiste la cantidad disponible."); return; }
      track('add_to_cart', undefined, { value: line.amount, currency: line.p.currency });
      analytics('add_to_cart', { productId: p.id });
      const units = button.classList.contains('product-detail__buy') ? Math.min(selectedQuantity, remaining(p, variant, line.picks)) : 1;
      cart.set(key, quantity + units); renderCart(); message(`${name} añadido a tu pedido.`); addedFeedback({ ...p, name }, button, event.detail === 0);
      if (MOTIFS.length) playMotifs(p);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${name} añadido a tu pedido.`;
    }
    if (button.hasAttribute("data-remove-line")) { cart.delete(button.dataset.removeLine); renderCart(); message("Pedido actualizado."); return; }
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
    if (button.hasAttribute("data-checkout")) openCheckout(button);
    if (button.hasAttribute('data-shipping-quote')) { void shippingQuote(button.closest('[data-pagosya-cart]')); return; }
    if (button.hasAttribute("data-pay")) void checkout(button);
    if (button.hasAttribute("data-retry")) void load();
  });
  async function load() {
    render();
    if (preview || config.demo || hosted) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      const saved = cartItems();
      store = await response.json(); ready = true; category = "all"; renderPolicyLinks();
      restoreCart(saved);
      render(); message("");
    } catch (error) { ready = false; renderInfoPages(true); render(); message(error.message); }
  }
  async function loadCommerceContent() {
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length && !fullProductPage) return;
    if (preview || config.demo) { slots.forEach(slot => { slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.'; }); return; }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      commerceData = data; decorateProductReviews();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = data.articles.map(article => `<article id="articulo-${escape(article.slug)}"><h2>${escape(article.title)}</h2><p>${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p><p>${escape(article.excerpt)}</p><p><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p><details><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>';
        if (slot.hasAttribute('data-pagosya-reviews')) slot.innerHTML = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id).map(review => `<article><strong>${escape(review.displayName)}</strong><p>${review.rating} de 5 · Compra verificada</p><p>${escape(review.body)}</p></article>`).join('') || '<p>Todavía no hay reseñas publicadas.</p>';
        if (slot.hasAttribute('data-pagosya-bundles')) slot.innerHTML = data.bundles.map(bundle => `<article><h3>${escape(bundle.name)}</h3><p>${bundle.kind === 'BOGO' ? 'Lleva dos; el de menor precio es gratis.' : `${bundle.discountPercent}% de descuento ${bundle.kind === 'FIXED' ? 'al completar el paquete' : 'desde ' + bundle.minimumQuantity + ' unidades'}.`}</p><ul>${bundle.items.map(item => `<li>${escape(products().find(p => p.id === item.productId)?.name || 'Producto del paquete')}${bundle.kind === 'FIXED' ? ' × ' + item.quantity : ''}</li>`).join('')}</ul><p>Añade los productos al carrito. La mejor oferta se aplica automáticamente al pagar; no se acumula con otros códigos.</p></article>`).join('') || '<p>No hay paquetes activos.</p>';
      });
    } catch { slots.forEach(slot => { slot.textContent = 'No pudimos cargar esta sección. Recarga la página para intentar de nuevo.'; }); }
  }
  document.querySelectorAll('[data-pagosya-review-form]').forEach(slot => {
    slot.innerHTML = `<form><h2>Comparte tu experiencia</h2><label class="order-field">Código de seguimiento del pedido<input name="trackingToken" required maxlength="250" autocomplete="off"></label><label class="order-field">Producto<select name="productId">${products().map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><label class="order-field">Nombre público<input name="displayName" required maxlength="80"></label><label class="order-field">Calificación<select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} de 5</option>`).join('')}</select></label><label class="order-field">Tu reseña<textarea name="body" required minlength="3" maxlength="2000"></textarea></label><p>Tu nombre y reseña podrán publicarse después de la revisión del comercio.</p><button type="submit">Enviar reseña</button><p role="status"></p></form>`;
    secureFields(slot.querySelector('form'), ['trackingToken', 'displayName', 'rating', 'body'], 'Tu reseña se escribe en un formulario seguro de pagosYa.');
    slot.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); const form = event.target; const status = form.querySelector('[role=status]'); const button = form.querySelector('button');
      if (preview || config.demo) { status.textContent = 'Prueba completada. No se envió ninguna reseña.'; return; }
      if (button.disabled || !form.reportValidity()) return;
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form)); values.rating = Number(values.rating);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content/reviews`, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
        const result = await response.json(); if (!response.ok) throw new Error(result.message || 'No se pudo enviar la reseña.');
        status.textContent = 'Reseña recibida. Está pendiente de revisión.'; form.reset();
      } catch (error) { status.textContent = error.message || 'No se pudo enviar la reseña.'; }
      finally { button.disabled = false; }
    });
  });
  void loadCommerceContent();
  void load();
})();
