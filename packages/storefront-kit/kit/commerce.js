(() => {
  "use strict";
  // pagosya-product-options:v1 — bounded variant IDs, prices, stock and galleries.
  // pagosya-product-content:v1 — per-colour photo sets and product content blocks.
  const config = window.PAGOSYA_CONFIG || {};
  // Design DNA: each enum becomes data-dna-<name> on <html>, so variant CSS and motion can key on it.
  // Same values as SOURCE_DNA_RUNTIME_ENUMS in the API (a test pins them); anything else is ignored.
  const DNA_VALUES = {
    display: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda', 'courier-prime', 'big-shoulders-stencil', 'black-ops-one', 'stardos-stencil', 'staatliches', 'teko', 'barlow-condensed', 'orbitron', 'audiowide', 'michroma', 'pacifico', 'caveat', 'kaushan-script', 'lobster', 'bungee', 'titan-one', 'bowlby-one', 'fredoka', 'monoton', 'righteous', 'abril-fatface', 'archivo-black', 'inter', 'archivo', 'plus-jakarta-sans', 'dm-sans', 'cormorant-garamond', 'geist', 'mona-sans', 'hanken-grotesk', 'schibsted-grotesk', 'gloock', 'crimson-pro'],
    text: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda', 'courier-prime', 'big-shoulders-stencil', 'black-ops-one', 'stardos-stencil', 'staatliches', 'teko', 'barlow-condensed', 'orbitron', 'audiowide', 'michroma', 'pacifico', 'caveat', 'kaushan-script', 'lobster', 'bungee', 'titan-one', 'bowlby-one', 'fredoka', 'monoton', 'righteous', 'abril-fatface', 'archivo-black', 'inter', 'archivo', 'plus-jakarta-sans', 'dm-sans', 'cormorant-garamond', 'geist', 'mona-sans', 'hanken-grotesk', 'schibsted-grotesk', 'gloock', 'crimson-pro'],
    case: ['none', 'upper', 'small-caps'], tracking: ['tight', 'normal', 'wide'],
    radius: ['none', 'soft', 'round', 'pill'], border: ['none', 'hairline', 'bold'], frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape'],
    button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'], hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
    motion: ['calm', 'snappy', 'playful', 'cinematic'], grammar: ['editorial', 'grid', 'collage', 'index', 'poster', 'magazine', 'brutalist'], density: ['airy', 'balanced', 'dense'],
    cart: ['drawer', 'sheet', 'page', 'overlay'], added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'], product: ['editorial', 'dense', 'image-led', 'story-led', 'conversion', 'atelier', 'fashion'],
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
    // Every cart opens as the half-screen side panel (owner 2026-10-17); a saved sheet, page or overlay is drawn as one too.
    for (const name of Object.keys(DNA_VALUES)) if (name !== 'product' && DNA_VALUES[name].includes(config.dna[name])) document.documentElement.setAttribute(`data-dna-${name}`, name === 'cart' ? 'drawer' : config.dna[name]);
  }
  // Account, checkout and the cart path drawn per store (spec 2026-10-11 commerce surfaces). Runtime-only values, never in
  // DNA_VALUES (the API's planner and seed must not see them); a test pins them to COMMERCE_RUNTIME_ENUMS.
  const COMMERCE_DNA = {
    checkout: ['columns', 'steps', 'ticket', 'brand'],
    fields: ['boxed', 'underline', 'filled', 'pill'],
  };
  if (hasDna) for (const name of Object.keys(COMMERCE_DNA)) if (COMMERCE_DNA[name].includes(config.dna[name])) document.documentElement.setAttribute(`data-dna-${name}`, config.dna[name]);
  // One look per store (spec 2026-10-14): what the store's own home page does, measured at each save (store-look.ts in the
  // API). Validated again here; every look rule keys on a data-look-* attribute, so a store without config.look renders as before.
  const LOOK = (() => {
    const look = config.look && typeof config.look === 'object' && config.look.version === 1 ? config.look : null;
    if (!look) return null;
    const root = document.documentElement;
    const set = (name, value = '') => root.setAttribute(`data-look-${name}`, value);
    const prop = (name, value) => root.style.setProperty(`--lk-${name}`, value);
    const num = (value, low, high) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
    const radius = (value, arch, pill = '999px') => value === 'pill' ? pill : arch && value === 'arch' ? '999px 999px 8px 8px / 42% 42% 8px 8px' : num(value, 0, 48) ? `${Math.round(value)}px` : '';
    root.setAttribute('data-look', '');
    const heading = look.type?.heading;
    if (heading && typeof heading === 'object') {
      if (typeof heading.family === 'string' && /^[\p{L}\p{N} '-]{1,60}$/u.test(heading.family)) { set('hf'); prop('hf', `"${heading.family.replace(/'/g, '')}"`); }
      if (num(heading.weight, 300, 900)) { set('hw'); prop('hw', String(heading.weight)); }
      if (heading.case === 'upper' || heading.case === 'none') set('hc', heading.case);
      if (num(heading.tracking, -0.05, 0.3)) { set('ht'); prop('ht', `${heading.tracking}em`); }
      if (heading.italic === true) set('hi');
    }
    const label = look.type?.label;
    if (label && label.case === 'upper') { set('label'); prop('lt', num(label.tracking, 0, 0.3) ? `${label.tracking}em` : '.08em'); prop('lw', num(label.weight, 300, 900) ? String(label.weight) : '600'); }
    for (const [key, attribute, arch, pill] of [['photo', 'rp', true], ['card', 'rc', false, '24px'], ['button', 'rb', false]]) {
      const value = radius(look.shape?.[key], arch, pill);
      if (value) { set(attribute, look.shape[key] === 'arch' ? 'arch' : ''); prop(attribute, value); }
    }
    if (['none', 'hairline', 'outline', 'offset', 'soft'].includes(look.edge)) set('edge', look.edge);
    if (['natural', 'mono', 'duotone', 'sepia', 'grain', 'polaroid', 'tight'].includes(look.photo?.treatment)) set('photo', look.photo.treatment);
    const aspect = { square: '1 / 1', portrait: '4 / 5', landscape: '4 / 3' }[look.photo?.aspect];
    if (aspect) { set('aspect', look.photo.aspect); prop('aspect', aspect); }
    if (num(look.photo?.tilt, 0.5, 4)) { set('tilt'); prop('tilt', `${look.photo.tilt}deg`); }
    if (['tinted', 'banded'].includes(look.surface)) set('surface', look.surface);
    return look;
  })();
  // Store controls (spec 2026-10-14): one button language per store, chosen and checked by the API (store-controls.ts) and
  // drawn into the platform header at save time. Validated again here; every controls rule keys on data-controls-*, so a
  // store without config.controls renders as before.
  const CONTROL_ENUMS = {
    outline: ['rounded', 'pill', 'square', 'ticket', 'tag', 'sticker', 'tab', 'stamp', 'bracket', 'underline', 'blob'],
    border: ['none', 'hairline', 'solid', 'double', 'dashed', 'offset'],
    fill: ['solid', 'outline', 'ghost', 'inverted'],
    colour: ['accent', 'ink', 'paper'],
    badge: ['dot', 'circle', 'inline', 'corner', 'stamp'],
  };
  const CONTROLS = (() => {
    const record = config.controls && typeof config.controls === 'object' && config.controls.version === 1 ? config.controls : null;
    const shape = record && record.shape && typeof record.shape === 'object' ? record.shape : null;
    if (!shape) return null;
    const values = { outline: shape.outline, border: shape.border, fill: shape.fill, colour: shape.colour, badge: record.badge };
    if (Object.keys(CONTROL_ENUMS).some(name => !CONTROL_ENUMS[name].includes(values[name]))) return null;
    const ranges = { corner: [0, 24, 'px'], notch: [0, 10, 'px'], tilt: [-6, 6, 'deg'], weight: [1, 3, 'px'] };
    if (Object.keys(ranges).some(name => typeof shape[name] !== 'number' || !Number.isFinite(shape[name]) || shape[name] < ranges[name][0] || shape[name] > ranges[name][1])) return null;
    const root = document.documentElement;
    for (const name of Object.keys(CONTROL_ENUMS)) root.setAttribute(`data-controls-${name}`, values[name]);
    for (const name of Object.keys(ranges)) root.style.setProperty(`--ctl-${name}`, `${shape[name]}${ranges[name][2]}`);
    const icons = {};
    const given = record.icons && typeof record.icons === 'object' ? record.icons : {};
    for (const slot of ['cart', 'account', 'menu', 'search', 'plus', 'minus', 'close']) if (typeof given[slot] === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]{1,1500}$/.test(given[slot])) icons[slot] = given[slot];
    const word = typeof record.words?.cart === 'string' ? record.words.cart.trim() : '';
    return { icons, cartWord: /^[\p{L}\p{M}][\p{L}\p{M} '’.-]{0,13}$/u.test(word) ? word : '' };
  })();
  const controlIcon = slot => CONTROLS && CONTROLS.icons[slot] ? `<svg class="ctl-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" clip-rule="evenodd"><path fill="currentColor" fill-rule="evenodd" d="${CONTROLS.icons[slot]}"/></svg>` : '';
  /* Duotone and grain are SVG filters in the page (no store url()): duotone maps luminance onto the store's ink→paper. */
  function lookFilters() {
    if (!LOOK || !['duotone', 'grain'].includes(LOOK.photo?.treatment) || document.getElementById('pagosya-look-filters')) return;
    // A computed colour may be oklch(), color(srgb …) or lab(), not rgb(): drawing it onto a 1×1 canvas reads true sRGB channels.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const paint = canvas.getContext('2d', { willReadFrequently: true });
    const rgb = name => {
      const probe = document.createElement('span'); probe.style.color = `var(${name})`; document.body.append(probe);
      const color = getComputedStyle(probe).color; probe.remove();
      if (paint) { paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = color; paint.fillRect(0, 0, 1, 1); const d = paint.getImageData(0, 0, 1, 1).data; return [d[0] / 255, d[1] / 255, d[2] / 255]; }
      return (color.match(/[\d.]+/g) || ['0', '0', '0']).slice(0, 3).map(v => Number(v) / 255);
    };
    const luminance = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    let ink = rgb('--lk-ink'), paper = rgb('--lk-paper');
    if (luminance(ink) > luminance(paper)) [ink, paper] = [paper, ink]; // luminance 0 maps to the darker colour, 1 to the lighter, also on a dark store
    const rows = [0, 1, 2].map(i => { const d = paper[i] - ink[i]; return `${(d * 0.2126).toFixed(4)} ${(d * 0.7152).toFixed(4)} ${(d * 0.0722).toFixed(4)} 0 ${ink[i].toFixed(4)}`; }).join(' ');
    document.body.insertAdjacentHTML('beforeend', `<svg id="pagosya-look-filters" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><filter id="pagosya-look-duotone" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${rows} 0 0 0 1 0"/></filter><filter id="pagosya-look-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="saturate" values="0" result="mono"/><feComponentTransfer in="mono" result="soft"><feFuncA type="table" tableValues="0 .18"/></feComponentTransfer><feComposite in="soft" in2="SourceGraphic" operator="in" result="grain"/><feBlend in="grain" in2="SourceGraphic" mode="multiply"/></filter></svg>`);
  }
  // The brand checkout's panel photo: only a bundled asset path, so nothing can leave the url().
  const CHECKOUT_PHOTO = typeof config.checkoutPhoto === 'string' && /^assets\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp|avif|gif)$/i.test(config.checkoutPhoto) && !config.checkoutPhoto.includes('..') ? config.checkoutPhoto : '';
  if (CHECKOUT_PHOTO && document.documentElement.getAttribute('data-dna-checkout') === 'brand') document.documentElement.style.setProperty('--checkout-panel', `center / cover no-repeat url("${CHECKOUT_PHOTO}")`);
  // The cart's own word (Tu bolsa, Tu ramo…): short plain words only, else today's label.
  // The record's cart word wins (spec 2026-10-14: the store's cart word reaches the header, the drawer and the order panel alike).
  const CART_WORD = [CONTROLS ? CONTROLS.cartWord : '', config.cartWord].map(value => typeof value === 'string' ? value.trim() : '').find(value => /^[\p{L} ]{2,24}$/u.test(value)) || '';
  // The words the added messages close on: «añadido a tu reserva», «a tu canasta»; «tu pedido» without a word of its own.
  const ADDED_TO = CART_WORD ? `tu ${CART_WORD.toLowerCase().replace(/^(?:tu|mi)\s+/, '')}` : 'tu pedido';
  // The kit pages' header says "Mi pedido (n)"; with a word of its own the store says "Tu bolsa (n)". The count element stays.
  if (CART_WORD) document.querySelectorAll('a[href="checkout.html"]').forEach(link => {
    const first = link.firstChild;
    if (first && first.nodeType === 3 && /^\s*Mi pedido\s*\($/.test(first.textContent) && link.querySelector('[data-cart-count]')) first.textContent = `${CART_WORD} (`;
  });
  // The kit pages' order panel beside the product or catalogue.
  if (CART_WORD) document.querySelectorAll('aside.commerce-order').forEach(panel => {
    panel.setAttribute('aria-label', CART_WORD);
    const title = panel.querySelector(':scope>h2');
    if (title && title.textContent.trim() === 'Tu pedido') title.textContent = CART_WORD;
  });
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
    // A hosted store runs sandboxed: the merchant's tags live on pagosYa's page, which applies consent (overnight 2026-10-29).
    if (hosted) { try { parent.postMessage({ type: 'pagosya:pixel', event, value: amount > 0 ? amount : 0, currency: detail?.currency || cartCurrency() }, '*'); } catch {} return; }
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
      if (card && !control.matches('[data-add],[data-card-swatch],[data-product-zoom]')) { const id = cardProductId(card); if (id) analytics('product_card_click', { productId: id }); }
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
  // Pickup needs somewhere to pick up (owner 2026-10-22): only a branch with an address offers it, and the store-wide
  // flag holds only while one exists, so no page or checkout promises «Retiro en tienda» to an online-only store.
  const pickupFacts = data => {
    const locations = (Array.isArray(data?.locations) ? data.locations : []).map(l => ({ ...l, pickupEnabled: l?.pickupEnabled === true && typeof l.address === 'string' && l.address.trim() !== '' }));
    return { ...data, locations, shippingPickupEnabled: data?.shippingPickupEnabled === true && locations.some(l => l.pickupEnabled) };
  };
  let store = pickupFacts(config.data || {});
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
  /* Card insides (spec 2026-10-19 showcase commerce §2): eyebrow, ✓ points, chips, best-deal line and save pill — all from
   * real data; an empty field is absent. The store's design is config.showcase.cards (showcase | compact | split). A store that
   * never chose one keeps today's card plus what is plainly true: a written eyebrow, the save pill and the best-deal line. */
  const showcaseChosen = () => ['showcase', 'compact', 'split'].includes(config.showcase?.cards);
  function cardDesign(count) {
    const wanted = showcaseChosen() ? config.showcase.cards : 'compact';
    return wanted === 'showcase' && count > 8 ? 'compact' : wanted;
  }
  function cardInsides(p) {
    const chosen = showcaseChosen();
    const written = typeof p.cardEyebrow === 'string' ? p.cardEyebrow.trim() : '';
    const category = chosen ? (store.categories || []).find(c => c.id === p.categoryId)?.name || '' : '';
    const eyebrow = (written || category).slice(0, 28);
    const points = chosen ? (Array.isArray(p.highlights) ? p.highlights : []).map(h => typeof h === 'string' ? h : h?.label).filter(text => typeof text === 'string' && text.trim()).slice(0, 3) : [];
    const chips = [];
    if (chosen) for (const group of optionGroups(p) || []) for (const value of group.values) {
      const color = swatchColor(group.name, value);
      chips.push(color ? { text: value, color } : { text: value });
    }
    const sale = !isMembership(p) && price(p) < p.amount ? p.amount - price(p) : 0;
    return { eyebrow, points, chips: chips.slice(0, 4), more: Math.max(0, chips.length - 4), deal: isMembership(p) ? '' : bestDealLine(p), save: sale ? `Ahorras ${money(sale, p.currency)}` : '' };
  }
  /** The product with the largest real saving per unit in this grid (sale, pack or subscription); '' when nothing saves. */
  function bestValueId(items) {
    let best = { id: '', saving: 0 };
    for (const p of items) {
      if (!p || isMembership(p)) continue;
      const perUnit = Math.min(price(p), ...offerOptions(p, undefined).map(o => o.perUnit));
      const saving = p.amount - perUnit;
      if (saving > best.saving) best = { id: p.id, saving };
    }
    return best.id;
  }
  const chipsHtml = parts => parts.chips.map(c => c.color ? `<span data-swatch style="--swatch:${escape(c.color)}" role="img" aria-label="${escape(c.text)}" title="${escape(c.text)}"></span>` : `<span>${escape(c.text)}</span>`).join('') + (parts.more ? `<span>+${parts.more}</span>` : '');
  function cardInsidesMarkup(p) {
    const parts = cardInsides(p), chips = chipsHtml(parts);
    return {
      eyebrow: parts.eyebrow ? `<p class="menu-item__eyebrow">${escape(parts.eyebrow)}</p>` : '',
      points: parts.points.length ? `<ul class="menu-item__points">${parts.points.map(t => `<li>${escape(t)}</li>`).join('')}</ul>` : '',
      chips: chips ? `<p class="menu-item__chips">${chips}</p>` : '',
      deal: parts.deal ? `<p class="menu-item__deal">${escape(parts.deal)}</p>` : '',
      save: parts.save ? `<span class="menu-item__save">${escape(parts.save)}</span>` : '',
    };
  }
  /** After a grid renders: its design, and the one best-value card. */
  function markCardDesign(el) {
    const cards = [...el.querySelectorAll('.menu-item[data-product-id]')];
    el.dataset.cardDesign = cardDesign(cards.length);
    const bestId = showcaseChosen() ? bestValueId(cards.map(card => products().find(p => p.id === card.dataset.productId))) : '';
    for (const card of cards) {
      const best = Boolean(bestId) && card.dataset.productId === bestId;
      card.toggleAttribute('data-card-best', best);
      card.querySelector(':scope > .menu-item__best')?.remove();
      if (best) card.insertAdjacentHTML('afterbegin', '<span class="menu-item__best">Mejor precio</span>');
    }
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
  // The store assistant (chat.js) opens product pages and asks which product is on screen.
  document.addEventListener("pagosya:open-product", event => {
    const item = products().find(p => p.id === event.detail?.id);
    if (!item) return;
    const link = document.createElement('a'); link.href = productHref(item); document.body.append(link); link.click(); link.remove();
  });
  document.addEventListener("pagosya:current-product", event => {
    if (event.detail && typeof event.detail === "object" && fullProductPage && selectedProduct) { event.detail.id = selectedProduct.id; event.detail.name = selectedProduct.name; }
  });
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
      .menu-item__original{margin-inline-start:.15em;font-size:.82em;font-weight:400;opacity:.7;white-space:nowrap}
      /* A card the kit does not lay out (a design's own grid) flows price and button inline: the price keeps a gap after it
         (BOXY 2026-10-25, «Bs 320,00Elegir opciones»). Zero specificity, so any design rule wins. */
      :where(.menu-item__price){margin-inline-end:.75em}
      /* A product page is the photo beside the words, never a full-width photo with the text below it (owner 2026-10-25, Oh Belly:
         a redesign dropped the template's product layout). Zero specificity: a page whose own CSS lays out the slots wins. */
      @media (min-width:761px){:where(:has(> [data-product-slot=gallery]):has(> [data-product-slot=buy], > * [data-product-slot=buy])){display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:clamp(32px,4vw,64px);align-items:start}}
      :where([data-product-slot=gallery]) :where(img.product-detail__photo,.product-detail__stage img,.product-detail__stage video){max-height:min(78svh,860px);object-fit:cover}
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
    [data-pagosya-product][data-style] .product-detail__badge{position:absolute;top:14px;left:14px;z-index:2;max-width:calc(100% - 28px);padding:6px 12px;border-radius:999px;background:var(--pd-accent,#111);color:var(--pd-on-accent,#fff);font-size:13px;font-weight:600;line-height:1.2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    [data-pagosya-product][data-style] .product-detail__photo{display:block;width:100%;height:min(calc(100dvh - 64px),760px);min-height:420px;max-height:none;margin:0;object-fit:cover;border:0;border-radius:0;background:var(--pd-tint);touch-action:pan-y}
    dialog[data-pagosya-product][data-style] .product-detail__photo{height:min(calc(100dvh - 34px),640px);min-height:360px}
    [data-pagosya-product][data-style] .product-detail__navigation{position:absolute;right:16px;bottom:22px;display:flex;align-items:center;gap:8px;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;font-size:12px;font-variant-numeric:tabular-nums;color:#1c1917}
    /* Gallery controls sit on any photo: solid white chips with a soft shadow, never tinted by the store palette. */
    [data-pagosya-product][data-style] .product-detail__navigation span{order:-1;padding:5px 10px;border-radius:999px;background:#fff;color:#1c1917;font-weight:600;line-height:1;box-shadow:0 1px 3px rgb(0 0 0/.18)}
    [data-pagosya-product][data-style] .product-detail__navigation button{display:grid;place-items:center;width:36px;height:36px;min-height:0;padding:0;border:0;border-radius:50%;background:#fff;color:#1c1917;font-size:15px;line-height:1;box-shadow:0 1px 3px rgb(0 0 0/.22)}
    [data-pagosya-product][data-style] .product-detail__thumbnails{position:absolute;left:16px;bottom:16px;display:flex;gap:8px;max-width:calc(100% - 170px);margin:0;padding:2px;overflow-x:auto;border-radius:0;background:none}
    [data-pagosya-product][data-style] .product-detail__thumbnails button{flex:0 0 56px;width:56px;height:56px;padding:0;border:2px solid #fff;border-radius:max(var(--pd-radius),8px);overflow:hidden;background:var(--pd-tint);box-shadow:0 1px 3px rgb(0 0 0/.22);opacity:.86}
    [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{opacity:1;outline:2px solid var(--pd-ink);outline-offset:1px}
    [data-pagosya-product][data-style] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
    [data-pagosya-product][data-style=editorial] .product-detail__navigation{display:none}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button,[data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0;border:0;box-shadow:none;opacity:1}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails img{display:none}
    /* Desktop product pages show every photo, so a styled scene is seen without guessing that dots can be clicked; phones keep swipe and dots. */
    @media(min-width:900px){
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail]{background:none}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__photo{height:min(calc(100dvh - 148px),676px)}
      [data-pagosya-product][data-style=editorial][data-pagosya-product-page] .product-detail__gallery[data-rail] .product-detail__thumbnails{position:static;display:flex;gap:10px;max-width:none;margin:0;padding:12px clamp(16px,2vw,24px) 0;overflow-x:auto;background:none;transform:none}
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
    [data-pagosya-product][data-style] .product-detail__stars{--rating:0;display:inline-block;white-space:nowrap;letter-spacing:1px;line-height:1;background:linear-gradient(90deg,var(--pd-accent) calc(var(--rating) * 20%),color-mix(in srgb,var(--pd-ink) 22%,transparent) 0);-webkit-background-clip:text;background-clip:text;color:transparent}
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
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][data-unavailable]{opacity:.6}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-unavailable] .product-detail__swatch{position:relative}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-unavailable] .product-detail__swatch::after{content:"";position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,transparent 46%,var(--pd-ink) 47% 53%,transparent 54%)}
    [data-pagosya-product][data-style] [data-kind=swatch] [aria-pressed=true] .product-detail__swatch{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__values[data-priced]:not([data-kind=swatch]){display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;justify-content:stretch;gap:12px;width:100%;min-height:48px;padding:10px 14px;background:var(--pd-surface);font-size:14px;text-align:left}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]::before{content:"";box-sizing:border-box;width:16px;height:16px;border:1.5px solid color-mix(in srgb,var(--pd-ink) 45%,var(--pd-paper));border-radius:50%}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][aria-pressed=true]::before{border-color:var(--pd-ink);background:radial-gradient(circle,var(--pd-ink) 0 3.5px,transparent 4px)}
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
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total{display:inline}
    [data-pagosya-product][data-style=conversion] .product-detail__buy{white-space:normal;text-wrap:balance}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles)>:is(.product-detail__stage,.product-detail__thumbnails){grid-column:1}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles)>.product-detail__tiles{grid-column:2;grid-row:1/span 2}
    @media(max-width:480px){[data-pagosya-product][data-style=conversion] .product-detail__purchase{grid-template-columns:minmax(0,1fr)}[data-pagosya-product][data-style=conversion] .product-detail__quantity{justify-self:start;width:136px}}
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total:not(:empty)::before{content:"·";margin:0 10px}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:12px;align-items:start;background:none}
    [data-pagosya-product] .product-detail__tiles{display:grid;gap:12px;margin:0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__tiles li{display:grid;justify-items:center;align-content:center;gap:8px;aspect-ratio:1;min-width:0;padding:10px 6px;border-radius:var(--pd-radius,14px);background:var(--pd-tint);color:var(--pd-ink);text-align:center;font-size:13px;line-height:1.2;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__tiles .pd-icon{width:34px;height:34px;color:var(--pd-accent)}
    [data-pagosya-product] .product-detail__checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__checks li{display:flex;align-items:center;gap:8px;min-width:0;padding:10px 12px;border-radius:var(--pd-radius,10px);background:var(--pd-tint);color:var(--pd-ink);font-size:14px;line-height:1.25;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__checks li:last-child:nth-child(odd){grid-column:1/-1}
    [data-pagosya-product] .product-detail__checks li:only-child{padding:0;background:none}
    [data-pagosya-product] .product-detail__check{flex:0 0 20px;width:20px;height:20px}
    [data-pagosya-product] .product-detail__check circle{fill:var(--pd-accent)}
    [data-pagosya-product] .product-detail__check path{fill:none;stroke:var(--pd-on-accent,#fff);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
    [data-pagosya-product][data-style=dense] .product-detail__buy{min-height:50px;font-size:15px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 8px}
    /* Narrow phones keep the action on one line; the price above already shows the total. */
    @media(max-width:480px){[data-pagosya-product][data-style=dense] .product-detail__buy-total{display:none}}
    [data-pagosya-product][data-style] .product-detail__status{min-height:20px;margin:0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,max(140px,calc((100% - 36px) / 3))),1fr));gap:12px 18px;margin:16px 0 0;padding:14px 0 0;border:0;border-top:1px solid var(--pd-line);border-radius:0;list-style:none}
    [data-pagosya-product][data-style=dense] .product-detail__assurances{margin-top:16px;padding:0;border:0}
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
    [data-pagosya-product][data-style] .product-detail__bundles article{display:grid;gap:10px;padding:18px 20px;border:1px solid var(--pd-line);border-radius:20px;background:color-mix(in srgb,var(--pd-accent) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style] .product-detail__bundles h3{margin:0;font-size:16px}
    [data-pagosya-product][data-style] .product-detail__bundles p{margin:0;overflow-wrap:anywhere}
    /* Owner 2026-10-22: bundle buttons are round and friendly in every store — never the store's square, stamp or ticket form. */
    [data-pagosya-product][data-style] .product-detail__bundle-links{display:flex;flex-wrap:wrap;gap:6px}
    [data-pagosya-product][data-style] .product-detail__bundle-links a{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border:1px solid var(--pd-line);border-radius:999px;background:var(--pd-paper);color:inherit;font-size:13px;text-decoration:none;transition:border-color .2s ease}
    [data-pagosya-product][data-style] .product-detail__bundle-links a:hover{border-color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add{justify-self:start;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;margin-top:4px;padding:0 22px;border:0;border-radius:999px;background:var(--pd-accent);color:var(--pd-on-accent);box-shadow:none;font:inherit;font-size:15px;font-weight:600;letter-spacing:0;text-transform:none;cursor:pointer;transition:transform .2s ease,filter .2s ease;-webkit-mask:none;mask:none;clip-path:none}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:hover{transform:translateY(-1px);filter:brightness(.95)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:active{transform:scale(.97)}
    [data-pagosya-product][data-style] .product-detail__bundles .product-detail__bundle-add:focus-visible{outline:2px solid var(--pd-ink);outline-offset:3px}
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
      [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){grid-template-columns:minmax(0,1fr) 28%;gap:8px}
      [data-pagosya-product] .product-detail__tiles{gap:8px}
      [data-pagosya-product] .product-detail__tiles li{gap:6px;padding:8px 4px;font-size:11px}
      [data-pagosya-product] .product-detail__tiles .pd-icon{width:26px;height:26px}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:relative}
      [data-pagosya-product][data-style] .product-detail__photo,dialog[data-pagosya-product][data-style] .product-detail__photo{height:auto;min-height:0;max-height:72dvh;aspect-ratio:4/5}
      [data-pagosya-product][data-style] .product-detail__navigation{display:none}
      [data-pagosya-product][data-style] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
      [data-pagosya-product][data-style] .product-detail__thumbnails button,[data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0;border:0;box-shadow:none;opacity:1}
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
    /* Lively one-product stores (spec 2026-11-03): the buy bar also shows on laptops, a floating pill with the photo and choice. */
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:50%;right:auto;bottom:max(16px,env(safe-area-inset-bottom,0px));z-index:40;display:flex;align-items:center;gap:12px;width:min(720px,calc(100% - 24px));padding:10px 10px 10px 12px;border:1px solid var(--pd-line);border-radius:20px;background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 18px 40px -18px #0000004d;transform:translateX(-50%)}
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky>div{flex:1;min-width:0;font-size:13px;line-height:1.3}
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky button{flex:0 0 auto;min-height:44px;padding:10px 18px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-weight:700}
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky img:not([hidden]){display:block;width:44px;height:44px;border-radius:12px;object-fit:cover;flex:0 0 auto}
    :root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky [data-product-sticky-choice]{display:block;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__sticky img{display:none}
    @media (prefers-reduced-motion:no-preference){:root[data-pya-lively] [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){animation:pya-bar-in .35s cubic-bezier(.2,.9,.2,1) both}}
    /* Lively one-product stores (spec 2026-11-03): short facts floating over the product photo, each with a pinging dot. */
    .product-detail__pills{position:absolute;left:14px;top:14px;z-index:2;display:grid;gap:8px;margin:0;padding:0;list-style:none;pointer-events:none}
    .product-detail__pills li{display:inline-flex;align-items:center;gap:8px;justify-self:start;padding:7px 12px;border-radius:999px;background:color-mix(in srgb,var(--pd-paper,#fff) 92%,transparent);color:var(--pd-ink,#111);font-size:12.5px;font-weight:600;box-shadow:0 8px 22px -12px #0000004d;backdrop-filter:blur(8px)}
    .product-detail__pills li span{width:7px;height:7px;border-radius:50%;background:#2fbf71}
    .product-detail__gallery:has(.product-detail__badge) .product-detail__pills{top:60px}
    @media (max-width:640px){.product-detail__pills,.product-detail__gallery:has(.product-detail__badge) .product-detail__pills{top:auto;bottom:14px}.product-detail__gallery[data-rail] .product-detail__pills{bottom:56px}}
    @media (prefers-reduced-motion:no-preference){.product-detail__pills li{animation:pya-float 5s ease-in-out infinite;animation-delay:calc(var(--i) * -1.4s)}.product-detail__pills li span{animation:pya-ping 2s ease-out infinite}}
    @keyframes pya-ping{0%{box-shadow:0 0 0 0 #2fbf7180}100%{box-shadow:0 0 0 8px #2fbf7100}}
    @keyframes pya-bar-in{from{opacity:0;transform:translate(-50%,24px)}to{opacity:1;transform:translateX(-50%)}}
    /* Approved highlights: one small looping motion each, paused off screen and stopped for reduced motion. */
    [data-pagosya-product][data-style] .product-detail__highlights{display:grid;gap:12px 18px;margin:0 0 20px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__highlights li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.35}
    [data-pagosya-product][data-style] .product-detail__highlights strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-long{box-sizing:border-box;width:100%;max-width:1200px;margin:0 auto;padding:0 clamp(20px,4vw,48px)}
    [data-pagosya-product][data-style] .product-long>section{margin:clamp(48px,7vw,96px) 0}
    [data-pagosya-product][data-style] .product-long h2{margin:0 0 20px;font-family:var(--store-heading-font,inherit);font-size:clamp(26px,3.2vw,40px);line-height:1.1}
    /* Columns follow the count, so six features are two rows of three, not five and one left alone (ZARA 2026-10-27). */
    [data-pagosya-product][data-style] .product-long__features ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style]:not([data-style=atelier]) .product-long__features ul[data-count="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}
    [data-pagosya-product][data-style] .product-long__features li{display:grid;gap:6px;padding:20px;border:1px solid var(--store-border,rgba(0,0,0,.12));border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__features svg{width:32px;height:32px;color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__story{display:grid;gap:14px;max-width:760px;font-size:18px;line-height:1.55}
    [data-pagosya-product][data-style] .product-long__details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
    [data-pagosya-product][data-style] .product-long__details figure{margin:0}
    [data-pagosya-product][data-style] .product-long__details img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,12px)}
    [data-pagosya-product][data-style] .product-long__details figcaption{display:grid;gap:4px;margin-top:10px}
    /* One or two details stay photo-sized: one alone filled the whole 1200px row, a photo 1500px tall (Gramiyaa 2026-10-27). */
    [data-pagosya-product][data-style] .product-long__details[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr));max-width:880px}
    [data-pagosya-product][data-style] .product-long__details[data-count="1"]{grid-template-columns:1fr}
    [data-pagosya-product][data-style] .product-long__details[data-count="1"] figure{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);align-items:center;gap:clamp(24px,5vw,64px)}
    [data-pagosya-product][data-style] .product-long__details[data-count="1"] img{max-height:560px}
    [data-pagosya-product][data-style] .product-long__details[data-count="1"] figcaption{gap:10px;margin:0;font-size:18px;line-height:1.55}
    [data-pagosya-product][data-style] .product-long__details[data-count="1"] figcaption strong{font-family:var(--store-heading-font,inherit);font-size:clamp(22px,2.4vw,30px);line-height:1.15}
    @media(max-width:900px){[data-pagosya-product][data-style]:not([data-style=atelier]) .product-long__features ul[data-count],[data-pagosya-product][data-style] .product-long__details:not([data-count="1"]){grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){[data-pagosya-product][data-style]:not([data-style=atelier]) .product-long__features ul[data-count]{grid-template-columns:1fr}[data-pagosya-product][data-style] .product-long__details[data-count="1"] figure{grid-template-columns:1fr}[data-pagosya-product][data-style] .product-long__details[data-count="1"] img{max-height:420px}}
    [data-pagosya-product][data-style] .product-long__versus table{width:100%;border-collapse:collapse}
    [data-pagosya-product][data-style] .product-long__versus th,[data-pagosya-product][data-style] .product-long__versus td{padding:14px 12px;border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));text-align:center}
    [data-pagosya-product][data-style] .product-long__versus th[scope=row]{text-align:left;font-weight:500}
    [data-pagosya-product][data-style] .product-long__mark[data-yes=true]{color:var(--store-accent,currentColor)}
    [data-pagosya-product][data-style] .product-long__faq details{border-bottom:1px solid var(--store-border,rgba(0,0,0,.12));padding:16px 0}
    [data-pagosya-product][data-style] .product-long__faq summary{cursor:pointer;font-weight:600}
    [data-pagosya-product][data-style] .product-long__buy{display:grid;justify-items:center;gap:8px;margin:clamp(32px,5vw,64px) 0;text-align:center}
    /* Its own copy of the buy button's look: a template page left this one as bare text (Antojo, Gramiyaa 2026-10-27). */
    [data-pagosya-product][data-style] .product-long__buy .checkout-button{display:inline-flex;align-items:center;justify-content:center;width:auto;min-width:min(100%,360px);min-height:48px;margin:0;padding:12px 28px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font:inherit;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;transition:filter .15s}
    [data-pagosya-product][data-style] .product-long__buy .checkout-button:hover{filter:brightness(.92)}
    [data-pagosya-product][data-style] .product-long__buy p{margin:0;font-size:13px;color:var(--pd-muted)}
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
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__stage{width:fit-content;max-width:100%;margin-inline:auto}
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{width:auto;height:auto;max-width:100%;max-height:min(calc(100dvh - 64px),760px);min-height:0;aspect-ratio:auto;object-fit:contain}
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
    [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__thumbnails{justify-content:center}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
    [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__copy{width:100%;max-width:760px;margin-inline:auto;padding:clamp(28px,5vw,64px) 20px}
    [data-pagosya-product][data-style=story-led] .product-detail__intro{max-width:none;font-size:16px;line-height:1.75}
    [data-pagosya-product][data-style=story-led] .product-detail__highlights{padding-block:20px;border-block:1px solid var(--pd-line);grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr))}
    @media(min-width:900px){
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__layout:not([data-no-images]){grid-template-columns:minmax(0,1.55fr) minmax(320px,1fr);gap:clamp(24px,3vw,48px)}
      [data-pagosya-product][data-style=image-led][data-pagosya-product-page] .product-detail__copy:not([data-split]){padding:24px clamp(24px,3vw,48px) 24px 0;position:sticky;top:24px}
      [data-pagosya-product][data-style=story-led][data-pagosya-product-page] .product-detail__photo{max-height:56dvh}
      [data-pagosya-product][data-style=story-led] #pagosya-product-title{font-size:clamp(40px,4.5vw,60px)}
    }
    @media(max-width:899px){
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__stage{width:100%}
      [data-pagosya-product]:is([data-style=image-led],[data-style=story-led]) .product-detail__photo{width:100%;height:auto;aspect-ratio:auto;min-height:0;max-height:none}
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
    /* Atelier (2026-10-19): the product page of the owner's Amboras references. Breadcrumb and stars, a provenance eyebrow
       on a hairline, a large tight title with an italic subtitle, the price on a rule, options as hairline pills named in
       tracked small caps, purchase choices as cards, a wide tracked call to action carrying the total, a centred trust row.
       Motion is one 0.18 s standard ease on hover; nothing bounces. */
    /* The fashion product page (2026-10-21, the John Smedley references): info left, photos right, round sizes, colour bars. */
    [data-pagosya-product][data-style=fashion] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch}
    [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:2;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__photo{height:min(calc(100dvh - 64px),880px);object-fit:contain;background:transparent}
    [data-pagosya-product][data-style=fashion] .product-detail__copy{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px) clamp(20px,3vw,48px)}
    [data-pagosya-product][data-style=fashion] [data-part=title]{order:0;margin:0;font:400 clamp(30px,3.2vw,44px)/1.1 var(--pd-heading);letter-spacing:-.01em}
    [data-pagosya-product][data-style=fashion] .product-detail__eyebrow{order:1;margin:-6px 0 0;font:400 15px/1.4 var(--pd-body);letter-spacing:0;text-transform:none;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__copy>:not([data-part=title],.product-detail__eyebrow){order:2}
    [data-pagosya-product][data-style=fashion] .product-detail__intro{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;margin:0;font:400 18px/1.55 var(--pd-heading)}
    [data-pagosya-product][data-style=fashion] .product-detail__intro[data-expanded]{display:block}
    [data-pagosya-product][data-style=fashion] .product-detail__more{align-self:flex-start;padding:0;border:0;background:none;font:inherit;font-size:14px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;color:inherit}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button{position:relative;min-width:56px;min-height:56px;padding:0 14px;border:1px dashed color-mix(in srgb,var(--pd-ink) 55%,transparent);border-radius:999px;background:transparent;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button[aria-pressed=true]{border-style:solid;border-color:var(--pd-ink);background:var(--pd-ink);color:var(--pd-paper)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button:disabled{opacity:.45;background:linear-gradient(to top right,transparent calc(50% - .5px),currentColor calc(50% - .5px),currentColor calc(50% + .5px),transparent calc(50% + .5px))}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch]{display:flex;gap:4px}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button{position:relative;flex:1;height:22px;min-height:0;padding:0;border:0;border-radius:0;background:none}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__swatch{display:block;width:100%;height:100%;border-radius:0}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button[aria-pressed=true]{box-shadow:inset 0 -3px 0 var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__buy{width:100%;min-height:56px;border:0;border-radius:0;background:var(--pd-ink);color:var(--pd-paper);font:500 16px/1 var(--pd-body);letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=fashion] .product-detail__buy-total:not(:empty)::before{content:"·";margin:0 10px}
    [data-pagosya-product][data-style=fashion] .product-detail__buy:disabled .product-detail__buy-total{display:none}
    /* «También te puede gustar»: the kit's related list, dressed like the fashion card (tinted 4:5 panel, name and price). */
    [data-pagosya-product][data-style=fashion] .product-detail__related img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:0;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__related h2{font:400 clamp(26px,2.6vw,36px)/1.15 var(--pd-heading);padding-top:18px;border-top:1px solid var(--pd-ink)}
    @media(max-width:820px){
      [data-pagosya-product][data-style=fashion] .product-detail__layout{grid-template-columns:1fr}
      [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:0}
      [data-pagosya-product][data-style=fashion] .product-detail__photo{height:auto;aspect-ratio:4/5}
    }
    [data-pagosya-product][data-style=atelier] .product-detail__copy{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px)}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__breadcrumb{order:-3;margin:0;font-size:12px;font-style:italic;letter-spacing:.02em;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__rating{order:-2;margin:0;font-size:13px}
    [data-pagosya-product][data-style=atelier] .product-detail__copy>.product-detail__eyebrow{order:-1}
    [data-pagosya-product][data-style=atelier] .product-detail__stars{color:var(--pd-accent);letter-spacing:.12em}
    [data-pagosya-product][data-style=atelier] .product-detail__eyebrow{display:flex;align-items:center;gap:12px;margin:0;font:600 11px/1.4 var(--pd-body);letter-spacing:.22em;text-transform:uppercase;color:var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__eyebrow::before{content:"";flex:0 0 28px;height:1px;background:currentColor;opacity:.6}
    [data-pagosya-product][data-style=atelier] [data-part=title]{margin:0;font-family:var(--pd-heading);font-size:clamp(34px,4.4vw,58px);line-height:1.02;letter-spacing:-.02em;text-wrap:balance}
    [data-pagosya-product][data-style=atelier] [data-part=title][data-length=long]{font-size:clamp(28px,3.4vw,44px)}
    [data-pagosya-product][data-style=atelier] .product-detail__subtitle{margin:-4px 0 0;font-family:var(--pd-heading);font-style:italic;font-size:18px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__pricing{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px;padding-bottom:18px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=atelier] .product-detail__price{font-family:var(--pd-heading);font-size:clamp(24px,2.4vw,32px);font-weight:700;letter-spacing:-.01em}
    [data-pagosya-product][data-style=atelier] .product-detail__original{font-size:15px;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__intro{margin:0;font-size:15px;line-height:1.65;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] :is(.product-detail__options fieldset,.product-detail__subscription){margin:0 0 4px;padding:0;border:0}
    [data-pagosya-product][data-style=atelier] :is(.product-detail__options,.product-detail__subscription) legend{margin-bottom:10px;padding:0;font:600 11px/1.4 var(--pd-body);letter-spacing:.18em;text-transform:uppercase;color:var(--pd-ink)}
    [data-pagosya-product][data-style=atelier] .product-detail__options legend span{font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] .product-detail__options legend span:not(:empty)::before{content:"— "}
    [data-pagosya-product][data-style=atelier] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button{min-height:40px;padding:8px 18px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:var(--pd-ink);font-size:13px;letter-spacing:.02em;transition:border-color .18s cubic-bezier(.4,0,.2,1),background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button:hover{border-color:var(--pd-ink)}
    [data-pagosya-product][data-style=atelier] .product-detail__values:not([data-kind=swatch]) button[aria-pressed=true]{border-color:var(--pd-accent);background:var(--pd-accent);color:var(--pd-on-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__values[data-kind=swatch] button[aria-pressed=true]{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3px var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__subscription label{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);cursor:pointer;transition:border-color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__subscription label:has(input:checked){border-color:var(--pd-accent);box-shadow:inset 0 0 0 1px var(--pd-accent)}
    [data-pagosya-product][data-style=atelier] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;margin-top:6px}
    [data-pagosya-product][data-style=atelier] .product-detail__quantity{min-height:56px;border:1px solid var(--pd-line);border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy{width:100%;min-height:56px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font:700 13px/1.2 var(--pd-body);letter-spacing:.16em;text-transform:uppercase;white-space:normal;text-wrap:balance;transition:filter .18s cubic-bezier(.4,0,.2,1),transform .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy:hover:not(:disabled){filter:brightness(1.08)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy:active:not(:disabled){transform:translateY(1px)}
    [data-pagosya-product][data-style=atelier] .product-detail__buy-total{display:inline}
    [data-pagosya-product][data-style=atelier] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 10px}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:8px 0 0;padding:18px 0 0;border-top:1px solid var(--pd-line);list-style:none}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li>button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:0;border:0;background:none;color:inherit;text-align:center}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances li div{display:grid;gap:2px}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances strong{font-size:12px;font-weight:600}
    [data-pagosya-product][data-style=atelier] .product-detail__assurances span{font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style=atelier] [data-product-count]{position:static;font:500 12px/1 var(--pd-body);letter-spacing:.08em}
    [data-pagosya-product][data-style=atelier] .product-detail__thumbnails button[aria-pressed=true]{outline:1px solid var(--pd-ink);outline-offset:2px}
    /* The atelier card (2026-10-19, the Amboras references): a clean photo that zooms inside its own frame, the name in the
     * heading font, a quiet price, and one tracked full-width «Agregar» with a bag. Inside the DNA layer, more specific than
     * its card rules; the store's own CSS still wins. */
    @layer pagosya-dna {
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier]:not([data-custom-product]){display:flex;flex-direction:column;gap:0;padding:0;border:0;background:transparent;box-shadow:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__image{aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,0px);clip-path:inset(0);transition:transform .5s cubic-bezier(.4,0,.2,1),clip-path .5s cubic-bezier(.4,0,.2,1)}
      @media(hover:hover){[data-pagosya-catalog] .menu-item[data-anatomy=atelier]:hover .menu-item__image{transform:scale(1.04);clip-path:inset(1.92%)}}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy{margin-top:16px}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy h3{margin:0;font-family:var(--store-heading-font,inherit);font-size:15px;font-weight:600;line-height:1.3;letter-spacing:-.01em;text-transform:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__copy p{display:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-item__price{margin-top:6px;font-size:14px;font-weight:500;opacity:.78}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add{display:inline-flex;align-items:center;justify-content:center;gap:10px;align-self:stretch;width:100%;min-height:46px;margin-top:16px;padding:0 16px;border:1px solid currentColor;border-radius:var(--store-radius,0px);background:transparent;color:inherit;font:600 11px/1 var(--store-body-font,inherit);letter-spacing:.16em;text-transform:uppercase;transition:background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1)}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add:not(:disabled):hover{background:var(--store-foreground,#111);color:var(--store-background,#fff)}
      [data-pagosya-catalog] .menu-item[data-anatomy=atelier] .menu-add:disabled{opacity:.45}
    }
    /* The fashion card (2026-10-21, the John Smedley references). Inside the DNA layer; the store's own CSS still wins. */
    @layer pagosya-dna {
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion]{display:flex;flex-direction:column;gap:0;padding:0;border:0;background:transparent;box-shadow:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--store-radius,0px);background:color-mix(in srgb,var(--store-foreground,#111) 6%,var(--store-background,#fff))}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__image{width:100%;height:100%;aspect-ratio:auto;object-fit:cover;transition:opacity .3s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__tag{position:absolute;top:12px;left:12px;z-index:2;max-width:calc(100% - 24px);margin:0;padding:4px 8px;border-radius:2px;background:color-mix(in srgb,var(--store-background,#fff) 88%,transparent);font:400 13px/1.3 var(--store-body-font,inherit);color:var(--store-foreground,#111);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:600px){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__tag{top:8px;left:8px;max-width:calc(100% - 16px);padding:3px 6px;font-size:11px}}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:2px;opacity:0;transition:opacity .2s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars button{flex:1;height:12px;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:var(--swatch);cursor:pointer}
      @media(hover:hover){[data-pagosya-catalog] .menu-item[data-anatomy=fashion]:is(:hover,:focus-within) .menu-item__bars{opacity:1}}
      @media(hover:none){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{display:none}}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin-top:14px}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__name{margin:0;font:400 17px/1.3 var(--store-heading-font,inherit);letter-spacing:0;text-transform:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__price{margin:0;font:400 15px/1.3 var(--store-body-font,inherit);white-space:nowrap}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__price del{margin-left:8px;opacity:.6}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__colors{margin:2px 0 0;font:400 14px/1.3 var(--store-body-font,inherit);opacity:.72}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel:has([data-product-zoom]) .menu-item__bars{right:56px}
      @media(prefers-reduced-motion:reduce){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] :is(.menu-item__image,.menu-item__bars){transition:none}}
    }
    /* The badge base rule is unlayered, so this one is too, at the base's own specificity (later wins; store CSS still wins). */
    :where(.menu-item[data-anatomy=atelier]) .menu-item__badge{top:12px;left:12px;padding:5px 8px;border-radius:0;background:var(--store-background,#fff);color:var(--store-foreground,#111);font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
    /* A YAPI page template's slot with nothing visible in it (no related products, no reviews yet) takes no room: its own
     * borders and padding drew an empty band on Pulso Studio (2026-10-19). Reviews that arrive later show it again. */
    [data-pagosya-product] [data-product-page-root] [data-product-slot]:not(:has(> :not([hidden]))){display:none!important}
    /* Story steps (2026-10-19, pawfectt.com): a tall section whose stage sticks; the photo and the copy swap as it travels. */
    [data-pagosya-product] .product-steps{position:relative;height:calc(var(--steps,3) * 64vh + 40vh)}
    [data-pagosya-product] .product-steps__stage{position:sticky;top:96px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(32px,6vw,96px);align-items:center}
    [data-pagosya-product] .product-steps__frame{width:min(100%,calc((100vh - 220px) * .8));justify-self:end}
    [data-pagosya-product] .product-steps__media{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--pd-radius,4px);background:var(--pd-surface,transparent)}
    [data-pagosya-product] .product-steps__media img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transform:scale(1.04);transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .9s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__media img[data-active]{opacity:1;transform:none}
    [data-pagosya-product] .product-steps__caption{display:flex;justify-content:space-between;gap:16px;margin:16px 0 10px;font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product] .product-steps__caption span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product] .product-steps__progress{display:block;height:1px;background:var(--pd-line,rgba(0,0,0,.14))}
    [data-pagosya-product] .product-steps__progress span{display:block;width:var(--step-progress,0);height:100%;background:var(--pd-accent,currentColor);transition:width .5s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__pills{display:flex;gap:8px;margin:0 0 clamp(28px,4vw,44px)}
    [data-pagosya-product] .product-steps__pills button{display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid var(--pd-line,rgba(0,0,0,.18));border-radius:999px;background:transparent;color:var(--pd-muted);font:600 12px/1 var(--pd-body,inherit);letter-spacing:.04em;cursor:pointer;transition:background-color .18s cubic-bezier(.4,0,.2,1),color .18s cubic-bezier(.4,0,.2,1),border-color .18s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product] .product-steps__pills button[aria-pressed=true]{border-color:var(--pd-accent,currentColor);background:var(--pd-accent,currentColor);color:var(--pd-on-accent,#fff)}
    [data-pagosya-product] .product-steps__pills button:focus-visible{outline:2px solid var(--pd-accent,currentColor);outline-offset:3px}
    [data-pagosya-product] .product-steps__list{display:grid;margin:0;padding:0;list-style:none}
    [data-pagosya-product] .product-steps__step{grid-area:1/1;opacity:0;visibility:hidden;transform:translateY(12px);transition:opacity .45s cubic-bezier(.4,0,.2,1),transform .45s cubic-bezier(.4,0,.2,1),visibility 0s .45s}
    [data-pagosya-product] .product-steps__step[data-active]{opacity:1;visibility:visible;transform:none;transition-delay:0s}
    [data-pagosya-product] .product-steps__photo{display:none}
    [data-pagosya-product] .product-steps .product-steps__eyebrow{margin:0 0 14px;color:var(--pd-accent,currentColor);font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
    [data-pagosya-product] .product-steps__step h3{margin:0 0 18px;font-family:var(--pd-heading,inherit);font-size:clamp(28px,3.2vw,44px);line-height:1.06;letter-spacing:-.02em}
    [data-pagosya-product] .product-steps__step p:not(.product-steps__eyebrow){max-width:44ch;margin:0;padding-top:18px;border-top:1px solid var(--pd-line,rgba(0,0,0,.12));color:var(--pd-muted);font-size:16px;line-height:1.65}
    @media(max-width:760px){[data-pagosya-product] .product-steps{height:auto}[data-pagosya-product] .product-steps__stage{position:static;grid-template-columns:1fr}[data-pagosya-product] .product-steps__frame,[data-pagosya-product] .product-steps__pills{display:none}[data-pagosya-product] .product-steps__list{gap:44px}[data-pagosya-product] .product-steps__step{grid-area:auto;opacity:1;visibility:visible;transform:none}[data-pagosya-product] .product-steps__photo{display:block;width:100%;aspect-ratio:4/5;margin:0 0 20px;object-fit:cover;border-radius:var(--pd-radius,4px)}}
    /* Atelier reviews (pawfectt.com): the score column on the left, the reviews on hairlines on the right. */
    @media(min-width:900px){[data-pagosya-product][data-style=atelier] .product-detail__reviews:not([hidden]){grid-template-columns:minmax(220px,.75fr) 2fr;column-gap:clamp(40px,7vw,112px);align-items:start}[data-pagosya-product][data-style=atelier] .product-detail__reviews>h2,[data-pagosya-product][data-style=atelier] .product-detail__reviews-summary{grid-column:1}[data-pagosya-product][data-style=atelier] .product-detail__review-list{grid-column:2;grid-row:1/span 3}}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews>h2{font-weight:600;letter-spacing:-.02em}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-summary{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:6px 14px}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-summary>span:last-child{grid-column:1/-1;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style=atelier] .product-detail__reviews-average{font-family:var(--pd-heading,inherit);font-size:clamp(44px,5vw,64px);font-weight:600;line-height:1;letter-spacing:-.03em}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list{display:grid;grid-template-columns:1fr;gap:0}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list article{padding:24px 0;border:0;border-top:1px solid var(--pd-line,rgba(0,0,0,.12));border-radius:0;background:transparent}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list article:last-child{border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-detail__review-list p:not(.product-detail__review-meta){max-width:68ch;color:var(--pd-muted);line-height:1.65}
    [data-pagosya-product][data-style=atelier] .product-detail__review-verified{margin-left:auto;color:var(--pd-muted);font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
    [data-pagosya-product][data-style=atelier] [data-reveal]:not([data-revealed]){opacity:0;transform:translateY(12px)}
    [data-pagosya-product][data-style=atelier] [data-reveal]{transition:opacity .6s cubic-bezier(.4,0,.2,1),transform .6s cubic-bezier(.4,0,.2,1)}
    /* Atelier long page: features as a hairline list, the FAQ with a drawn +, one quiet repeated buy. */
    [data-pagosya-product][data-style=atelier] .product-long h2{letter-spacing:-.02em}
    /* Even rows (Lana Andina's six features wrapped five and one): two or four per row when that is the count, else three. */
    [data-pagosya-product][data-style=atelier] .product-long__features ul{--cols:3;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:0;border-top:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="2"]{--cols:2}
    [data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="4"]{--cols:4}
    [data-pagosya-product][data-style=atelier] .product-long__features li{gap:10px;padding:28px;border:0;border-left:1px solid var(--pd-line,rgba(0,0,0,.12));border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12));border-radius:0;align-content:start}
    [data-pagosya-product][data-style=atelier] .product-long__features ul:not([data-count="2"],[data-count="4"]) li:nth-child(3n+1),[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="2"] li:nth-child(2n+1),[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count="4"] li:first-child{padding-left:0;border-left:0}
    [data-pagosya-product][data-style=atelier] .product-long__features svg{width:26px;height:26px;margin-bottom:6px}
    [data-pagosya-product][data-style=atelier] .product-long__features strong{font-family:var(--pd-heading,inherit);font-size:18px;letter-spacing:-.01em}
    [data-pagosya-product][data-style=atelier] .product-long__features span{color:var(--pd-muted);line-height:1.6}
    [data-pagosya-product][data-style=atelier] .product-long__faq{max-width:880px}
    [data-pagosya-product][data-style=atelier] .product-long__faq details{padding:0;border-bottom:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__faq details:first-of-type{border-top:1px solid var(--pd-line,rgba(0,0,0,.12))}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary{position:relative;display:block;padding:22px 44px 22px 0;font-family:var(--pd-heading,inherit);font-size:18px;font-weight:600;list-style:none}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::-webkit-details-marker{display:none}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::before,[data-pagosya-product][data-style=atelier] .product-long__faq summary::after{content:"";position:absolute;top:50%;right:4px;width:14px;height:1.5px;background:currentColor;transition:transform .2s cubic-bezier(.4,0,.2,1)}
    [data-pagosya-product][data-style=atelier] .product-long__faq summary::after{transform:rotate(90deg)}
    [data-pagosya-product][data-style=atelier] .product-long__faq details[open] summary::after{transform:rotate(0)}
    [data-pagosya-product][data-style=atelier] .product-long__faq details p{max-width:64ch;margin:0;padding:0 0 22px;color:var(--pd-muted);line-height:1.65}
    [data-pagosya-product][data-style=atelier] .product-long__buy .checkout-button{width:auto;min-width:min(100%,320px);min-height:56px;padding:0 40px;font-size:12px;letter-spacing:.16em;text-transform:uppercase}
    [data-pagosya-product][data-style=atelier] .product-long__buy p{color:var(--pd-muted);font-size:13px}
    @media(max-width:900px){[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count]{--cols:2}[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count] li{padding:24px 20px 24px 0;border-left:0}}
    @media(max-width:640px){[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count]{--cols:1}[data-pagosya-product][data-style=atelier] .product-long__features ul[data-count] li{padding:22px 0}}
    @media(max-width:640px){[data-pagosya-product][data-style=atelier] .product-detail__copy{padding:20px}[data-pagosya-product][data-style=atelier] .product-detail__assurances{grid-template-columns:minmax(0,1fr)}[data-pagosya-product][data-style=atelier] .product-detail__assurances li{flex-direction:row;text-align:left}}
    [data-pagosya-product] .offer-squares{display:grid;gap:8px;margin:4px 0 8px}
    [data-pagosya-product] .offer-squares__label{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product] .offer-squares__group{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,104px),1fr));gap:12px 8px;padding-top:6px}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-squares__group{grid-template-columns:1fr}
    [data-pagosya-product] .offer-squares{--offer-warm:#ffb27a}
    [data-pagosya-product] .offer-square{position:relative;display:grid;gap:2px;justify-items:center;align-content:start;min-width:0;overflow-wrap:anywhere;padding:16px 10px 12px;border:1.5px solid color-mix(in srgb,var(--pd-accent) 22%,var(--pd-line));border-radius:18px;background:color-mix(in srgb,var(--offer-warm) 9%,var(--pd-surface));color:var(--pd-ink);font:inherit;text-align:center;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,background-color .16s ease}
    [data-pagosya-product] .offer-square:hover{transform:translateY(-1px);box-shadow:0 8px 18px -12px color-mix(in srgb,var(--pd-accent) 60%,transparent)}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square{grid-template-columns:minmax(0,1fr) auto;justify-items:start;text-align:left;padding:14px 16px;border-radius:16px}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square__total{grid-column:2;grid-row:1;justify-self:end}
    [data-pagosya-product] .offer-square[aria-checked=true]{border:2px solid var(--pd-accent);background:color-mix(in srgb,var(--pd-accent) 12%,color-mix(in srgb,var(--offer-warm) 16%,var(--pd-surface)));box-shadow:0 10px 22px -14px color-mix(in srgb,var(--pd-accent) 70%,transparent)}
    [data-pagosya-product] .offer-square:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}
    @media (prefers-reduced-motion:reduce){[data-pagosya-product] .offer-square{transition:none}[data-pagosya-product] .offer-square:hover{transform:none}}
    [data-pagosya-product] .offer-square__title{font-weight:700}
    [data-pagosya-product] .offer-square__total{font-size:1.15em;font-weight:800}
    [data-pagosya-product] .offer-square__regular,[data-pagosya-product] .offer-square__line{font-size:12px;opacity:.75}
    [data-pagosya-product] .offer-square__save{margin-top:4px;padding:2px 9px;border-radius:99px;background:color-mix(in srgb,var(--offer-warm) 22%,var(--pd-surface));color:color-mix(in srgb,var(--pd-accent) 72%,#6b3410);font-size:11px;font-weight:700}
    [data-pagosya-product] .offer-square__tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);max-width:calc(100% - 8px);padding:2px 8px;border-radius:99px;background:var(--pd-accent);color:var(--pd-on-accent);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square__tag{left:auto;right:12px;transform:none}
    [data-pagosya-product] [data-subscription-choice][data-offer-driven]>:is(legend,label,select){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] .pd-icon *{animation:none!important}}
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] *,[data-pagosya-product] *::before{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.append(detailStyle);
  const fullProductPage = document.querySelector("[data-pagosya-product-page]");
  // Owner 2026-11-02 (one-product stores: «the product card should be bigger»): a page that is not product.html can hold one product's
  // whole detail — gallery, options, «Agregar» — with [data-pagosya-product-page][data-product-id]; the page keeps its own title.
  const embeddedProductId = fullProductPage?.getAttribute("data-product-id") || null;
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
    // One build path live check 2026-10-29: «Nuevo» singles a product out; on a store whose catalog is mostly new (it just opened)
    // every card said it, so it says nothing there.
    return isNewProduct(p) && products().filter(isNewProduct).length * 2 <= products().length ? 'Nuevo' : '';
  }
  function isNewProduct(p) { const created = Date.parse(p.createdAt); return Number.isFinite(created) && Date.now() - created < BADGE_NEW_MS; }
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
    // Showcase commerce: a quantity that matches a one-product pack is priced the way the cart quote will price it.
    const packSaving = pending || cadence || boxLine ? 0 : packDiscount(selectedProduct, amount, selectedQuantity);
    const total = pending ? startingAt.length ? `desde ${money(Math.min(...startingAt), selectedProduct.currency)}` : '' : available ? money(amount * selectedQuantity - packSaving, selectedProduct.currency) : '';
    // The action carries the live total; the subtotal line only adds information for several units.
    detail.querySelector('[data-product-subtotal]').textContent = !pending && total && selectedQuantity > 1 ? `Subtotal ${total}` : '';
    detail.querySelectorAll('[data-product-total]').forEach(el => { el.textContent = total; });
    const offers = detail.querySelector('.product-detail__offers');
    const key = cadence ? `sub:${cadence}` : `${packOffers(selectedProduct).some(o => o.quantity === selectedQuantity) ? 'pack' : 'once'}:${selectedQuantity}`;
    const fresh = offers ? offerSquaresMarkup(selectedProduct, variant || undefined, key) : '';
    if (offers) { if (fresh) offers.outerHTML = fresh; else offers.replaceChildren(); }
    detail.querySelector('[data-subscription-choice]')?.toggleAttribute('data-offer-driven', Boolean(detail.querySelector('.product-detail__offers [data-offer-square]')));
    updateStickyBar();
  }
  let stickyObserver = null, buyPassed = false, commerceData = null, footerSeen = false, footerObserver = null;
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
    section.innerHTML = showSection ? `<h2 id="product-reviews-title">Reseñas verificadas${sample ? ' · ejemplo' : ''}</h2><p class="product-detail__reviews-summary">${detail.dataset.style === 'atelier' ? `<strong class="product-detail__reviews-average" aria-hidden="true">${summary.average.toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong>` : ''}${starsMarkup(summary.average)}<span>${label}</span></p><div class="product-detail__review-list">${list.map(review => `<article><p class="product-detail__review-meta">${starsMarkup(review.rating)}<span class="product-detail__review-score">${review.rating} de 5</span> <strong>${escape(review.displayName)}</strong>${detail.dataset.style === 'atelier' && !sample ? '<span class="product-detail__review-verified">Compra verificada</span>' : ''}</p><p>${escape(review.body)}</p></article>`).join('')}</div>` : '';
  }
  /* Offer squares (spec 2026-10-19 showcase commerce §1): 1 unidad, one-product packs and subscription cadences, with the
   * server's own math (bundle-pricing.ts: best single FIXED offer, floor(eligible × % / 100)). Never a figure checkout won't charge. */
  function packOffers(p) {
    if (!p || !store.bundlesEnabled || !Array.isArray(store.bundles) || isMembership(p) || boxGroup(p) || p.fulfillmentType === 'DIGITAL') return [];
    return store.bundles
      .filter(b => b.kind === 'FIXED' && Array.isArray(b.items) && b.items.length === 1 && b.items[0]?.productId === p.id && Number(b.items[0].quantity) >= 2)
      .map(b => ({ id: b.id, quantity: Number(b.items[0].quantity), percent: Math.max(0, Math.min(99, Number(b.discountPercent) || 0)), ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim().slice(0, 24) } : {}) }))
      .sort((a, b) => a.quantity - b.quantity).slice(0, 3);
  }
  function packDiscount(p, unitAmount, quantity) {
    let best = 0;
    for (const offer of packOffers(p)) {
      const cycles = Math.floor(quantity / offer.quantity);
      if (cycles > 0) best = Math.max(best, Math.floor(cycles * offer.quantity * unitAmount * offer.percent / 100));
    }
    return Math.min(best, Math.max(0, unitAmount * quantity - 1));
  }
  /** The cart's pack saving, priced as the server's bestBundleDiscount prices one-product packs: each product's units across
   *  its lines, cheapest first, and the single best pack in the cart. Other offers are confirmed at checkout. */
  function cartPackSaving(lines) {
    const units = new Map();
    for (const line of lines) {
      if (line.cadence || !line.p) continue;
      const entry = units.get(line.p.id) || { p: line.p, prices: [] };
      for (let i = 0; i < line.quantity; i++) entry.prices.push(line.amount);
      units.set(line.p.id, entry);
    }
    let best = 0;
    for (const { p, prices } of units.values()) {
      prices.sort((a, b) => a - b);
      for (const offer of packOffers(p)) {
        const cycles = Math.floor(prices.length / offer.quantity);
        if (cycles > 0) best = Math.max(best, Math.floor(prices.slice(0, cycles * offer.quantity).reduce((sum, amount) => sum + amount, 0) * offer.percent / 100));
      }
    }
    return best;
  }
  function offerOptions(p, variant) {
    if (!p || isMembership(p) || boxGroup(p)) return [];
    const unit = price(variant ? { ...p, amount: variant.amount } : p);
    const left = remaining(p, variant || undefined);
    const packs = packOffers(p).filter(offer => left >= offer.quantity);
    const subs = subscriptionsAvailable() && p.fulfillmentType !== 'DIGITAL' && !p.extras?.length ? (p.subscriptionOptions || []) : [];
    if (!packs.length && !subs.length) return [];
    const rows = [{ key: 'once:1', kind: 'once', quantity: 1, total: unit, regular: unit, perUnit: unit, saving: 0 }];
    for (const offer of packs) {
      const regular = unit * offer.quantity, saving = packDiscount(p, unit, offer.quantity);
      rows.push({ key: `pack:${offer.quantity}`, kind: 'pack', quantity: offer.quantity, total: regular - saving, regular, perUnit: Math.round((regular - saving) / offer.quantity), saving, ...(offer.label ? { label: offer.label } : {}) });
    }
    for (const option of subs) {
      const total = subscriptionPrice(p, variant || undefined, option.cadence);
      rows.push({ key: `sub:${option.cadence}`, kind: 'sub', quantity: 1, cadence: option.cadence, total, regular: unit, perUnit: total, saving: unit - total, ...(typeof option.label === 'string' && option.label.trim() ? { label: option.label.trim().slice(0, 24) } : {}) });
    }
    const cheapest = Math.min(...rows.map(row => row.perUnit));
    const unique = rows.filter(row => row.perUnit === cheapest).length === 1;
    return rows.map(row => ({ ...row, best: row.kind !== 'once' && unique && row.perUnit === cheapest && cheapest < unit }));
  }
  function offerLayout(options) {
    const wanted = ['steps', 'grid', 'rows'].includes(config.showcase?.offers) ? config.showcase.offers : 'grid';
    const kinds = new Set(options.filter(o => o.kind !== 'once').map(o => o.kind));
    if (options.length > (kinds.size > 1 ? 5 : 4)) return 'rows';
    if (kinds.size > 1) return wanted === 'rows' ? 'rows' : 'steps';
    return wanted === 'steps' ? 'grid' : wanted;
  }
  function offerSquareMarkup(p, option, selected) {
    const title = option.kind === 'once' ? '1 unidad' : option.kind === 'pack' ? `Pack x${option.quantity}` : (CADENCE_TEXT[option.cadence] || 'Suscripción').replace(/^./, c => c.toUpperCase());
    // Owner 2026-10-23: a tag that only repeats the title («CADA MES» over «Cada mes») says nothing; the deal line speaks instead.
    const label = option.label && option.label.toLowerCase() !== title.toLowerCase() ? option.label : '';
    const tag = label || (option.best ? 'Mejor precio' : '');
    const line = option.kind === 'pack' ? `${money(option.perUnit, p.currency)} c/u` : option.kind === 'sub' ? 'Te llega sola · cancela cuando quieras' : 'Para probar';
    return `<button type="button" role="radio" class="offer-square" data-offer-square="${escape(option.key)}" aria-checked="${selected}">`
      + (tag ? `<span class="offer-square__tag">${escape(tag)}</span>` : '')
      + `<span class="offer-square__title">${escape(title)}</span><span class="offer-square__total">${money(option.total, p.currency)}</span>`
      + (option.kind === 'pack' && option.saving > 0 ? `<del class="offer-square__regular" aria-label="Precio sin pack">${money(option.regular, p.currency)}</del>` : '')
      + (line ? `<span class="offer-square__line">${escape(line)}</span>` : '')
      + (option.saving > 0 ? `<span class="offer-square__save">Ahorras ${money(option.saving, p.currency)}</span>` : '')
      + '</button>';
  }
  /** The squares of the selected product/variant; '' when there is nothing to choose. */
  function offerSquaresMarkup(p, variant, selectedKey = 'once:1') {
    const options = offerOptions(p, variant);
    if (options.length < 2) return '';
    const layout = offerLayout(options);
    const quantities = options.filter(o => o.kind !== 'sub'), subs = options.filter(o => o.kind === 'sub');
    const group = (rows, label) => `<div class="offer-squares__group" role="radiogroup" aria-label="${escape(label)}">${rows.map(o => offerSquareMarkup(p, o, o.key === selectedKey)).join('')}</div>`;
    const body = layout === 'steps' && subs.length && quantities.length > 1
      ? group(quantities, '¿Cuántos?') + `<p class="offer-squares__label">O suscríbete</p>` + group(subs, 'Suscríbete')
      : group(options, 'Elige tu opción');
    return `<div class="product-detail__offers offer-squares" data-offer-layout="${layout}"><p class="offer-squares__label">${layout === 'rows' ? 'Elige tu opción' : '¿Cuántos?'}</p>${body}</div>`;
  }
  /** One short best-deal line for cards: «Desde Bs X c/u» and/or «Suscríbete −N%». */
  function bestDealLine(p) {
    const options = offerOptions(p, undefined);
    const best = options.filter(o => o.kind === 'pack').sort((a, b) => a.perUnit - b.perUnit)[0];
    const sub = options.some(o => o.kind === 'sub') ? (p.subscriptionOptions || []).reduce((max, o) => Math.max(max, Number(o.discountPercent) || 0), 0) : 0;
    return [best ? `Desde ${money(best.perUnit, p.currency)} c/u` : '', sub ? `Suscríbete −${sub}%` : ''].filter(Boolean).join(' · ');
  }
  const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;
  const productHref = (item) => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  const bundleEntries = (bundle) => (Array.isArray(bundle?.items) ? bundle.items : []).map(item => ({ p: products().find(candidate => candidate.id === item?.productId), quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)) }));
  /* Offers the owner set up in Studio. Only the server cart quote decides which discount applies. */
  function bundleOffersMarkup(p) {
    if (!store.bundlesEnabled || !Array.isArray(store.bundles)) return '';
    const offers = store.bundles.flatMap(bundle => {
      // Showcase commerce: a one-product pack shown as an offer square is not repeated here.
      if (packOffers(p).some(offer => offer.id === bundle.id)) return [];
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
    return `<section class="product-detail__related" aria-labelledby="product-related-title"><h2 id="product-related-title">${productPageStyle() === 'fashion' ? 'También te puede gustar' : 'Combínalo con'}${sample ? ' · ejemplo' : ''}</h2>${sample ? '<p class="product-detail__related-note">Elige los productos sugeridos de cada producto en tu panel; mientras tanto esta fila es una muestra de tu catálogo.</p>' : ''}<ul>${items.map(item => {
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
    // Lively stores (spec 2026-11-03): the bar shows the photo and what is chosen, on every width.
    const photo = bar.querySelector('[data-product-sticky-photo]'), shown = detail.querySelector('.product-detail__photo img, .product-detail__gallery img');
    if (photo) { photo.hidden = !shown; if (shown) photo.src = shown.currentSrc || shown.src; }
    const choice = bar.querySelector('[data-product-sticky-choice]');
    if (choice) choice.textContent = [...detail.querySelectorAll('[data-product-selection]')].map(el => el.textContent.trim()).filter(Boolean).join(' · ');
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : isMembership(selectedProduct) ? 'Hacerme miembro' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const phone = matchMedia('(max-width: 640px)').matches, lively = document.documentElement.hasAttribute('data-pya-lively');
    const show = buyPassed && !footerSeen && (lively || phone);
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show || !phone;
  }
  let highlightObserver = null;
  // Looping icons rest while nobody is looking at them.
  function watchHighlights() {
    highlightObserver?.disconnect();
    const row = detail.querySelector('.product-detail__highlights,.product-detail__tiles');
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
    // Lively stores: the bar steps aside once the footer is on screen.
    footerObserver?.disconnect(); footerSeen = false;
    // The page's own footer (Esencial's, else the last one outside a fixed card or panel), never a footer inside an overlay.
    const footer = document.querySelector('.es-footer') || [...document.querySelectorAll('footer')].reverse().find(el => {
      for (let box = el; box; box = box.parentElement) if (getComputedStyle(box).position === 'fixed') return false;
      return true;
    });
    if (footer) { footerObserver = new IntersectionObserver(entries => { footerSeen = entries[entries.length - 1].isIntersecting; updateStickyBar(); }); footerObserver.observe(footer); }
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
  // Trust block (owner 2026-10-18: «instead [of photo groups] write structured sections with emojis, and things for the
  // customers to trust»). A `data-pagosya-trust` mount lists what is true of this store now, from its live settings, one
  // emoji per point; nothing here is a marketing claim. Authored children (a heading) stay; with under two points it hides.
  function trustPoints() {
    const locations = store.locations || [];
    const pickupPlaces = locations.filter(l => l.pickupEnabled).length;
    const phone = String(store.contactPhone || '').replace(/\D/g, '');
    const email = typeof store.contactEmail === 'string' && /^[^\s@<>"]+@[^\s@<>"]+$/.test(store.contactEmail.trim()) ? store.contactEmail.trim() : '';
    const points = [];
    if (!SHOWCASE) {
      if (store.checkoutMode === 'whatsapp') points.push(['💬', 'Pedido por WhatsApp', 'Confirmas los detalles con la tienda']);
      else if (store.checkoutMode !== 'external') points.push(['🔒', 'Pago seguro', 'Procesado por pagosYa']);
      points.push(['🧾', 'Sin sorpresas', 'Revisas tu pedido y el total antes de pagar']);
      if (store.shippingPickupEnabled || pickupPlaces) points.push(['🛍️', 'Retiro en tienda', pickupPlaces > 1 ? `${pickupPlaces} sucursales disponibles` : 'Lo eliges al revisar tu pedido']);
      if (store.shippingEnabled || locations.some(l => l.deliveryEnabled)) points.push(['🚚', 'Entrega a domicilio', 'El costo se confirma al pagar']);
      if (store.digitalGoodsEnabled) points.push(['📩', 'Entrega digital', 'Descarga segura después del pago']);
      if (typeof storePolicies().returns === 'string' && storePolicies().returns.trim()) points.push(['↩️', POLICY_TITLES.returns, 'Lee la política antes de comprar', { policy: 'returns' }]);
    }
    if (phone.length >= 7 && store.checkoutMode !== 'whatsapp') points.push(['💬', 'Escríbenos por WhatsApp', String(store.contactPhone).trim(), { href: `https://wa.me/${phone}` }]);
    // A shop already has enough to say; a showcase lists every way to reach it.
    if (email && (SHOWCASE || points.length < 3)) points.push(['✉️', 'Escríbenos', email, { href: `mailto:${email}` }]);
    const place = locations.find(l => typeof l.address === 'string' && l.address.trim());
    if (SHOWCASE && place) points.push(['📍', typeof place.name === 'string' && place.name.trim() ? place.name.trim() : 'Visítanos', place.address.trim()]);
    return points;
  }
  function renderTrust() {
    const points = trustPoints();
    document.querySelectorAll('[data-pagosya-trust]').forEach(mount => {
      mount.querySelector(':scope > .pagosya-trust__list')?.remove();
      mount.hidden = points.length < 2;
      // A section the save turned into this block (source-photo-groups.ts) has nothing else to show either.
      const section = mount.closest('[data-pagosya-trust-section]');
      if (section) section.hidden = mount.hidden;
      if (mount.hidden) return;
      mount.insertAdjacentHTML('beforeend', `<ul class="pagosya-trust__list" role="list">${points.map(([emoji, title, detail, link]) => {
        const body = `<span class="pagosya-trust__emoji" aria-hidden="true">${emoji}</span><strong>${escape(title)}</strong><span class="pagosya-trust__detail">${escape(detail)}</span>`;
        const card = link?.href ? `<a class="pagosya-trust__card" href="${escape(link.href)}" target="_blank" rel="noopener">${body}</a>`
          : link?.policy ? `<button class="pagosya-trust__card" type="button" data-pagosya-policy="${link.policy}">${body}</button>` : `<div class="pagosya-trust__card">${body}</div>`;
        return `<li class="pagosya-trust__item">${card}</li>`;
      }).join('')}</ul>`);
    });
  }
  // Information pages (spec 2026-09-30-store-content-pages-design): each `data-pagosya-page` mount is filled from the
  // live store with escaped text, and `data-pagosya-pages` links only the pages that have something to show.
  const INFO_LINKS = [
    ['collections', 'colecciones.html', 'Colecciones'], ['search', 'buscar.html', 'Buscar'],
    ['about', 'nosotros.html', 'Nosotros'], ['contact', 'contacto.html', 'Contacto'], ['shipping', 'envios.html', 'Envíos y entregas'],
    ['faq', 'faq.html', 'Preguntas frecuentes'], ['refund', 'reembolsos.html', 'Cambios y devoluciones'], ['privacy', 'privacidad.html', 'Privacidad'],
    ['terms', 'terminos.html', 'Términos y condiciones'], ['cookies', 'cookies.html', 'Cookies y almacenamiento'],
  ];
  // A showcase (spec 2026-10-13) sells nothing online: its footer never links search, collections, shipping, refunds or a
  // shopper account. A store saved before sitePurpose was written into config.js is a shop.
  const SHOWCASE = typeof config.sitePurpose === 'string' && config.sitePurpose !== 'shop';
  const SHOP_ONLY_INFO = new Set(['collections', 'search', 'shipping', 'refund']);
  // The shopper's account is served by the checkout app on its own origin, never inside the store, where authored code runs.
  const accountUrl = () => { try { return config.slug && config.checkoutOrigin ? new URL(`/cuenta/${encodeURIComponent(config.slug)}`, config.checkoutOrigin).href : ''; } catch { return ''; } };
  // The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.
  const ACCOUNT_GATE_PATHS = { login: '', register: '/registro', 'forgot-password': '/recuperar', 'reset-password': '/recuperar', orders: '/pedidos', addresses: '/direcciones', profile: '/perfil', subscriptions: '/suscripciones' };
  function renderAccountGateLinks() {
    const base = accountEntry();
    // Account access is a platform baseline even when an authored shell omits it.
    // Existing local account navigation and the information slot remain authoritative.
    if (base && !SHOWCASE && !document.querySelector('[data-pagosya-pages],a[data-pagosya-account],a[href="acceso-ingresar.html"],a[href="cuenta-perfil.html"]')) {
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
  // Each rule weighs one attribute ([data-account-gate] :where(…)), so a store rule on a part ([data-account-gate]
  // [data-part=input] in styles.css) wins although this sheet is appended later (2026-10-18, florart: the kit's later
  // copy of the same selector overrode the store's title, and its fields went dark).
  const ACCOUNT_CSS = `
[data-account-gate] :where([data-part=account]){--acc-bg:var(--account-background,var(--ui-paper,#fff));--acc-ink:var(--account-foreground,var(--ui-ink,#111));--acc-accent:var(--account-accent,var(--ui-accent,#111));--acc-radius:var(--account-radius,var(--ui-radius-control,10px));display:grid;gap:var(--ui-s5,24px);color:var(--acc-ink)}
[data-account-gate] :where([data-part=card]){display:grid;gap:var(--ui-s3,12px)}
[data-account-gate] :where([data-layout=card] [data-part=card]){width:100%;max-width:440px;margin-inline:auto;box-sizing:border-box;padding:clamp(24px,4vw,40px);background:var(--ui-surface,var(--acc-bg));border:1px solid var(--ui-line,#0002);border-radius:calc(var(--acc-radius) * 1.6)}
[data-account-gate] :where([data-layout=split]){grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:stretch}
[data-account-gate] :where([data-layout=split] [data-part=media]){margin:0}
[data-account-gate] :where([data-layout=split] [data-part=media] img){display:block;width:100%;height:100%;min-height:320px;object-fit:cover;border-radius:var(--ui-radius-media,12px)}
[data-account-gate] :where([data-layout=minimal] [data-part=card]){max-width:560px}
[data-account-gate] :where([data-layout=panel]){grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr)}
[data-account-gate] :where([data-part=title]){margin:0;font-family:var(--ui-display-font,var(--store-heading-font,inherit));font-size:clamp(28px,3vw,40px);line-height:1.1}
[data-account-gate] :where([data-part=lead]){margin:0;opacity:.8}
[data-account-gate] :where([data-part=form]){display:grid;gap:var(--ui-s4,16px)}
[data-account-gate] :where([data-part=field]){display:grid;gap:6px}
[data-account-gate] :where([data-part=label]){font-size:.85em;font-weight:600}
[data-account-gate] :where([data-part=input]){box-sizing:border-box;width:100%;min-height:48px;padding:0 14px;border:1px solid var(--ui-line,#0003);border-radius:var(--acc-radius);background:var(--acc-bg);color:var(--acc-ink);font:inherit}
[data-account-gate] :where([data-part=submit]){min-height:48px;font:inherit;font-weight:700;cursor:pointer}
:where(:root:not([data-dna-fields])) [data-account-gate] :where([data-part=submit]){background:var(--acc-accent);color:var(--ui-on-accent,#fff);border-radius:var(--acc-radius);border:0}
[data-account-gate] :where([data-part=link]){color:inherit;text-decoration:underline;text-underline-offset:3px;background:none;border:0;padding:0;font:inherit;cursor:pointer;justify-self:start}
[data-account-gate] :where([data-part=error]:empty){display:none}
[data-account-gate] :where([data-part=error]){margin:0;color:#b42318;font-weight:600}
[data-account-gate] :where([data-part=notice]){margin:0;padding:10px 12px;border-radius:var(--acc-radius);background:color-mix(in srgb,var(--acc-accent) 10%,transparent)}
[data-account-gate] :where([data-part=nav]){display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}
[data-account-gate] :where([data-part=nav-item][aria-current=page]){font-weight:700;text-decoration:underline}
[data-account-gate] :where([data-part=list]){display:grid;gap:12px;margin:0;padding:0;list-style:none}
[data-account-gate] :where(:is([data-part=order],[data-part=address])){display:grid;gap:4px;padding:14px 16px;border:1px solid var(--ui-line,#0002);border-radius:var(--acc-radius)}
[data-account-gate] :where([data-part=danger]){display:grid;gap:12px;padding-top:16px;border-top:1px solid var(--ui-line,#0002)}
@media (max-width:720px){[data-account-gate] :where([data-layout=split],[data-layout=panel]){grid-template-columns:1fr}[data-account-gate] :where([data-layout=split] [data-part=media] img){min-height:0;max-height:220px}}
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
    // The gate's fallback CSS, saved in the page, styled every h1, p and .ui-button in the gate: the drawn submit (a
    // .ui-button) took color:inherit over the store's own button colour. Pages saved before 2026-10-18 get it narrowed
    // to the fallback (the .ui-container's own children), as source-static-pages.ts writes it now.
    document.querySelectorAll('[data-account-gate] style[data-pagosya-standard-pages]').forEach(style => { style.textContent = style.textContent.replace(/\.ui-account-gate (h1|p|\.ui-button)(?=[\s{[:])/g, '.ui-account-gate>.ui-container>$1'); });
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
    // An empty block is left out (spec 2026-10-14 store voice): a place without pickup or delivery says nothing about them.
    const items = infoLocations().filter(keep).map(place => {
      const methods = [place.pickupEnabled && 'Retiro en tienda', place.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ');
      return `<li><strong>${escape(place.name)}</strong>${place.address ? `<br>${escape(place.address)}` : ''}${placeHours(place) ? `<br>${placeHours(place)}` : ''}${methods ? `<br>${methods}` : ''}</li>`;
    });
    return items.length ? `<ul class="pagosya-info__list">${items.join('')}</ul>` : '';
  }
  const phoneLink = () => { const phone = infoText(store.contactPhone); return /^\+?[0-9][0-9 ()-]{5,24}$/.test(phone) ? `<a href="tel:${escape(phone.replace(/[^0-9+]/g, ''))}">${escape(phone)}</a>` : ''; };
  const emailLink = () => { const email = infoText(store.contactEmail); return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(email) ? `<a href="mailto:${escape(email)}">${escape(email)}</a>` : ''; };
  // YAPI edits everything (spec 2026-11-03): the store's links (Instagram, TikTok…) close a footer's information links, so every
  // store shows them with no change to its files. http(s) only; at most six.
  const storeLinks = () => (Array.isArray(store.links) ? store.links : []).filter(link => link && infoText(link.label) && /^https?:\/\//i.test(infoText(link.url))).slice(0, 6)
    .map(link => `<a href="${escape(infoText(link.url))}" target="_blank" rel="noopener noreferrer" data-pagosya-store-link>${escape(infoText(link.label))}</a>`).join('');
  // YAPI edits everything (spec 2026-11-03): the merchant's own questions, written in the chat, come first.
  const ownQuestions = () => (Array.isArray(store.faq) ? store.faq : []).filter(entry => entry && infoText(entry.q) && infoText(entry.a)).slice(0, 12);
  function faqBody() {
    const places = infoLocations(), delivering = places.filter(place => place.deliveryEnabled), pickup = places.filter(place => place.pickupEnabled);
    const own = ownQuestions();
    const entries = own.map(entry => [infoText(entry.q), infoParagraphs(infoText(entry.a))]);
    if (store.shippingEnabled || delivering.length) entries.push(['¿Hacen envíos?', delivering.length ? `Sí, entregamos a domicilio desde: ${placeNames(delivering)}.` : 'Sí, hacemos envíos.']);
    // Only questions the store can answer (spec 2026-10-14): pickup needs a place that offers it, not only the switch.
    if (pickup.length) entries.push(['¿Puedo retirar mi pedido?', `Sí, puedes retirarlo en: ${placeNames(pickup)}.`]);
    if (places.length) entries.push(['¿Dónde están?', `<ul class="pagosya-info__list">${places.map(place => `<li><strong>${escape(place.name)}</strong>${place.address ? ` — ${escape(place.address)}` : ''}</li>`).join('')}</ul>`]);
    // How to order and how to pay are always answerable in a store that sells something (2026-10-18: a new store's FAQ had
    // fewer than two answers and showed nothing but the voice sheet's line).
    if (products().length) entries.push(['¿Cómo hago mi pedido?', store.checkoutMode === 'whatsapp' ? 'Eliges tu producto, lo sumas a tu pedido y lo confirmas por WhatsApp.' : store.checkoutMode === 'payment' ? 'Eliges tu producto, lo sumas a tu pedido y pagas desde la tienda.' : 'Eliges tu producto, lo sumas a tu pedido y lo confirmas desde la tienda.']);
    entries.push(['¿Cómo pago?', store.checkoutMode === 'payment' ? 'Pagas con QR o tarjeta desde la tienda, con pago seguro procesado por pagosYa.' : store.checkoutMode === 'whatsapp' ? 'Confirmas tu pedido por WhatsApp y acuerdas el pago con la tienda.' : 'Acuerdas el pago con la tienda al confirmar tu pedido.']);
    const contact = [phoneLink(), emailLink()].filter(Boolean);
    if (contact.length) entries.push(['¿Cómo los contacto?', contact.join(' · ')]);
    // One question of the merchant's own is a page; the facts alone need two.
    return own.length || entries.length >= 2 ? entries.map(([question, answer]) => `<section class="pagosya-info__qa"><h2>${escape(question)}</h2>${answer.startsWith('<') ? answer : `<p>${answer}</p>`}</section>`).join('') : '';
  }
  // Catalog pages. `collections()` and `collectionHref` are declared further down the file, so these read the store directly.
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
  // Owner 2026-10-28 («things appear without pictures when searched»): the editor's preview hands the photos over as data: and
  // blob: URLs, which the results dropped; an inline image is a photo too.
  const safeImage = url => (typeof url === 'string' && /^(?:https?:\/\/|\/(?!\/)|data:image\/|blob:)/.test(url) ? url : '');
  function searchBody() {
    const items = products();
    if (!items.length) return '';
    const q = searchQuery();
    const form = `<form class="pagosya-search" role="search" method="get" action="${escape(pageHref('buscar.html'))}"><label>Buscar productos<input type="search" name="q" value="${escape(q)}" maxlength="80" autocomplete="off"></label><button type="submit">Buscar</button></form>`;
    if (!q) return `${form}<p>Escribe lo que buscas.</p>`;
    // One match rule with the catalogue's search bar (catalog/filters.js, amendment 2026-10-21).
    const words = searchWords(q);
    const found = items.filter(item => matchesSearch(item, words));
    if (!found.length) return `${form}<p role="status">No encontramos productos para “${escape(q)}”.</p>`;
    // Owner 2026-10-28 («put like a sorter by category and etc»): the results narrow to one category and sort by price or name.
    // Both are links that keep the query, so they work in the editor's preview and on the published store alike.
    const params = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search);
    const categories = (Array.isArray(store.categories) ? store.categories : []).filter(c => c && found.some(item => item.categoryId === c.id));
    const category = categories.find(c => c.id === params.get('c'))?.id || '';
    const order = ['precio-asc', 'precio-desc', 'nombre'].includes(params.get('orden')) ? params.get('orden') : '';
    const searchLink = (next = {}) => { const query = new URLSearchParams({ q }); const c = 'c' in next ? next.c : category, o = 'orden' in next ? next.orden : order;
      if (c) query.set('c', c); if (o) query.set('orden', o); return escape(pageHref('buscar.html', '?' + query.toString())); };
    const narrowed = category ? found.filter(item => item.categoryId === category) : found;
    const price = item => Number(item.amount) || 0;
    const hits = order === 'precio-asc' ? [...narrowed].sort((a, b) => price(a) - price(b)) : order === 'precio-desc' ? [...narrowed].sort((a, b) => price(b) - price(a))
      : order === 'nombre' ? [...narrowed].sort((a, b) => String(a.name).localeCompare(String(b.name), 'es')) : narrowed;
    const chip = (label, href, on) => `<a class="pagosya-search__chip" href="${href}"${on ? ' aria-current="true"' : ''}>${escape(label)}</a>`;
    const cats = categories.length > 1 || category ? `<nav class="pagosya-search__row" aria-label="Categorías">${chip('Todo', searchLink({ c: '' }), !category)}${categories.map(c => chip(c.name, searchLink({ c: c.id }), c.id === category)).join('')}</nav>` : '';
    const sorts = found.length > 1 ? `<nav class="pagosya-search__row pagosya-search__sort" aria-label="Ordenar"><span>Ordenar</span>${[['', 'Relevancia'], ['precio-asc', 'Precio: menor'], ['precio-desc', 'Precio: mayor'], ['nombre', 'A–Z']].map(([id, label]) => chip(label, searchLink({ orden: id }), id === order)).join('')}</nav>` : '';
    const tools = cats || sorts ? `<div class="pagosya-search__tools">${cats}${sorts}</div>` : '';
    const cards = hits.slice(0, 48).map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : ''); return `<li><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : ''}<strong>${escape(item.name)}</strong><span>${escape(money(item.amount, item.currency))}</span></a></li>`; });
    return `${form}${tools}<p role="status">${hits.length > 48 ? `Mostrando 48 de ${hits.length} resultados` : `${hits.length} ${hits.length === 1 ? 'resultado' : 'resultados'}`} para “${escape(q)}”.</p><ul class="pagosya-info__cards">${cards.join('')}</ul>`;
  }
  // Owner 2026-10-28 («when searching give suggestions»): a store's search field shows up to six matching products — photo,
  // name, price — under it while the shopper types, and a line to every result. ↓ moves into the list, Escape closes it.
  function searchSuggest(field) {
    const form = field.form; if (!form) return;
    let box = form.querySelector('.pagosya-suggest');
    const q = field.value.trim().slice(0, 80);
    const words = searchWords(q);
    const hits = words.length ? products().filter(item => matchesSearch(item, words)).slice(0, 6) : [];
    if (!q) { box?.remove(); field.removeAttribute('aria-expanded'); return; }
    if (!box) {
      box = document.createElement('ul'); box.className = 'pagosya-suggest'; box.id = `pagosya-suggest-${Math.random().toString(36).slice(2, 8)}`;
      box.setAttribute('role', 'listbox'); box.setAttribute('aria-label', 'Sugerencias');
      form.append(box); field.setAttribute('aria-controls', box.id); field.setAttribute('autocomplete', 'off');
    }
    const all = `<li class="pagosya-suggest__all"><a href="${escape(pageHref('buscar.html', '?q=' + encodeURIComponent(q)))}">${hits.length ? 'Ver todos los resultados' : `Buscar “${escape(q)}”`}</a></li>`;
    box.innerHTML = hits.map(item => { const image = safeImage(Array.isArray(item.imageUrls) ? item.imageUrls[0] : '');
      return `<li role="option"><a href="${escape(productHref(item))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy">` : '<span class="pagosya-suggest__blank"></span>'}<span><strong>${escape(item.name)}</strong><small>${escape(money(item.amount, item.currency))}</small></span></a></li>`; }).join('') + all;
    field.setAttribute('aria-expanded', 'true');
  }
  const suggestField = target => target instanceof HTMLInputElement && target.name === 'q' && target.closest('form[role=search]') ? target : null;
  document.addEventListener('input', event => { const field = suggestField(event.target); if (field) searchSuggest(field); });
  document.addEventListener('keydown', event => {
    const box = event.target.closest?.('form[role=search]')?.querySelector('.pagosya-suggest'); if (!box) return;
    const links = [...box.querySelectorAll('a')]; const at = links.indexOf(event.target);
    if (event.key === 'Escape') { box.remove(); suggestField(event.target)?.removeAttribute('aria-expanded'); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const next = event.key === 'ArrowDown' ? at + 1 : at - 1;
    if (next < 0) { box.closest('form').querySelector('input[name=q]')?.focus(); return; }
    links[Math.min(next, links.length - 1)]?.focus();
  });
  document.addEventListener('focusout', event => {
    const form = event.target.closest?.('form[role=search]'); if (!form) return;
    setTimeout(() => { if (!form.contains(document.activeElement)) form.querySelector('.pagosya-suggest')?.remove(); }, 150);
  });
  const COOKIES_BODY = '<p>Esta tienda no usa cookies.</p><p>Para funcionar guarda algunos datos en el almacenamiento de tu navegador. Esos datos no salen de tu dispositivo, salvo lo que envías al hacer un pedido.</p><ul class="pagosya-info__list"><li><strong>Tu carrito:</strong> para que no pierdas lo que elegiste al cambiar de página.</li><li><strong>Tu elección de privacidad:</strong> si aceptaste o rechazaste las estadísticas; se recuerda 180 días.</li><li><strong>Estadísticas de visita</strong> (solo si las aceptas): identificadores anónimos de visitante y de visita para contar cuántas personas ven la tienda.</li><li><strong>Código de referido:</strong> si llegaste con un enlace de un socio, se recuerda durante la visita.</li><li><strong>Avisos de la tienda:</strong> si cerraste un aviso o tienes un enlace para recuperar un pedido, se recuerda durante la visita.</li><li><strong>Ventana de novedades:</strong> cuándo la viste o la cerraste por última vez, para no volver a mostrártela durante 30 días; queda en este dispositivo.</li></ul>';
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
      const account = SHOWCASE ? '' : accountEntry();
      slot.innerHTML = INFO_LINKS.filter(([kind]) => !(SHOWCASE && SHOP_ONLY_INFO.has(kind)) && infoBody(kind)).map(([, href, label]) => `<a href="${href}">${escape(label)}</a>`).join('') + (account ? `<a href="${escape(account)}" data-pagosya-account>Mi cuenta</a>` : '')
        + (slot.closest('footer') ? storeLinks() : '');
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
      // A page with nothing to show links home, never a placeholder (spec 2026-10-14). It no longer prints the voice sheet's line:
      // that line tells YAPI's writers how the store talks and was never meant for customers (live 2026-10-18, Batido Ya's FAQ).
      mount.innerHTML = html ? `<div class="pagosya-info">${html}</div>` : '<p><a href="index.html">Volver al inicio</a></p>';
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
  // ---- Photo viewer (spec 2026-10-21 photo zoom) ----
  // One full-screen modal <dialog> for a product's photos: ‹ ›, ←/→ or a swipe move between them; double-click, double-tap,
  // pinch or the wheel zoom (1×–4×) at the point asked; a zoomed photo is dragged to look around. A modal dialog so it rises
  // above the product dialog (top layer). The page scroll lock it sets is always given back as it found it.
  const VIEWER_VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
  const VIEWER_MAX = 4, VIEWER_STEP = 2.5;
  const ZOOM_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>';
  const PHOTO_VIEWER_CSS = `
    dialog.pagosya-viewer{position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:var(--store-background,#fff);color:var(--store-foreground,#111);overflow:hidden}
    .pagosya-viewer::backdrop{background:transparent}
    .pagosya-viewer:not([open]){display:none}
    .pagosya-viewer__stage{position:absolute;inset:0 0 88px;overflow:hidden;touch-action:none;cursor:zoom-in}
    .pagosya-viewer[data-single] .pagosya-viewer__stage{bottom:0}
    .pagosya-viewer[data-zoomed] .pagosya-viewer__stage{cursor:grab}
    .pagosya-viewer[data-dragging] .pagosya-viewer__stage{cursor:grabbing}
    .pagosya-viewer__photo{display:block;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;transition:transform .25s cubic-bezier(.2,.7,.2,1);will-change:transform}
    .pagosya-viewer[data-dragging] .pagosya-viewer__photo{transition:none}
    .pagosya-viewer button{font:inherit;color:inherit;background:var(--store-background,#fff);border:1px solid color-mix(in srgb,currentColor 18%,transparent);cursor:pointer}
    .pagosya-viewer :is(.pagosya-viewer__close,.pagosya-viewer__nav){position:absolute;z-index:2;display:grid;place-items:center;width:44px;height:44px;padding:0;border-radius:999px;font-size:26px;line-height:1}
    .pagosya-viewer__close{top:16px;right:16px}
    .pagosya-viewer__nav{top:calc(50% - 66px)}
    .pagosya-viewer__nav--prev{left:16px}.pagosya-viewer__nav--next{right:16px}
    .pagosya-viewer .pagosya-viewer__nav[hidden]{display:none}
    .pagosya-viewer__count{position:absolute;top:28px;left:20px;margin:0;font-size:13px;letter-spacing:.06em}
    .pagosya-viewer__thumbs{position:absolute;left:0;right:0;bottom:16px;display:flex;justify-content:safe center;gap:8px;padding:0 16px;overflow-x:auto}
    .pagosya-viewer .pagosya-viewer__thumbs button{flex:0 0 56px;width:56px;height:56px;padding:0;border-radius:4px;overflow:hidden;opacity:.6}
    .pagosya-viewer__thumbs button[aria-current=true]{opacity:1;outline:1.5px solid currentColor;outline-offset:2px}
    .pagosya-viewer__thumbs img{display:block;width:100%;height:100%;object-fit:cover}
    @media(max-width:640px){.pagosya-viewer .pagosya-viewer__nav{display:none}}
    .menu-item [data-product-zoom]{position:absolute;right:10px;bottom:10px;z-index:3;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:color-mix(in srgb,var(--store-background,#fff) 88%,transparent);color:var(--store-foreground,#111);cursor:zoom-in;box-shadow:0 1px 3px rgba(0,0,0,.12)}
    [data-product-zoom] svg{width:18px;height:18px}
    :where(:has(>[data-product-zoom])){position:relative}
    @media(hover:hover){.menu-item [data-product-zoom]{opacity:0;transition:opacity .2s}.menu-item:is(:hover,:focus-within) [data-product-zoom]{opacity:1}}
    @media(hover:none){.menu-item [data-product-zoom]{width:30px;height:30px}}
    :where([data-photo-zoom]){cursor:zoom-in}
    :where(.product-detail__stage[data-magnify]){overflow:hidden}
    .product-detail__stage[data-magnify] .product-detail__photo{scale:2;transition:scale .2s ease}
    @media(prefers-reduced-motion:reduce){.pagosya-viewer__photo,.product-detail__stage[data-magnify] .product-detail__photo,.menu-item [data-product-zoom]{transition:none}}
  `;
  let photoViewer = null;
  const viewerState = { images: [], index: 0, scale: 1, x: 0, y: 0, title: '', opener: null, lockedFrom: null, moved: false, pressedPhoto: false, lastTap: 0, touchToggle: 0, locked: false };
  const viewerPhotos = list => (Array.isArray(list) ? list : []).filter(url => typeof url === 'string' && url && !VIEWER_VIDEO.test(url));
  function ensurePhotoViewerStyle() {
    if (document.querySelector('style[data-pagosya-photo-viewer]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-photo-viewer', '');
    // A kit sheet: the product-page style release (product/setup.js) strips product-detail rules from every other sheet
    // (live check 2026-10-21: the magnifier rules vanished on pages that drew a catalog before load).
    style.setAttribute('data-pagosya-kit', '');
    style.textContent = PHOTO_VIEWER_CSS;
    document.head.append(style);
  }
  function photoViewerElement() {
    if (photoViewer?.isConnected) return photoViewer;
    ensurePhotoViewerStyle();
    photoViewer = document.createElement('dialog');
    photoViewer.className = 'pagosya-viewer';
    photoViewer.setAttribute('data-pagosya-viewer', '');
    photoViewer.innerHTML = '<div class="pagosya-viewer__stage" data-viewer-stage><img class="pagosya-viewer__photo" data-viewer-photo alt="" draggable="false" /></div>'
      + '<p class="pagosya-viewer__count" data-viewer-count aria-live="polite"></p>'
      + '<button type="button" class="pagosya-viewer__close" data-viewer-close aria-label="Cerrar">×</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--prev" data-viewer-prev aria-label="Foto anterior">‹</button>'
      + '<button type="button" class="pagosya-viewer__nav pagosya-viewer__nav--next" data-viewer-next aria-label="Foto siguiente">›</button>'
      + '<div class="pagosya-viewer__thumbs" data-viewer-thumbs></div>';
    document.body.append(photoViewer);
    wirePhotoViewer(photoViewer);
    return photoViewer;
  }
  // The picture as drawn inside the stage (object-fit: contain), not the photo box, which always fills the stage.
  function viewerDrawn() {
    const stage = photoViewer.querySelector('[data-viewer-stage]'), photo = photoViewer.querySelector('[data-viewer-photo]');
    const W = stage.clientWidth, H = stage.clientHeight, nw = photo.naturalWidth, nh = photo.naturalHeight;
    if (!W || !H || !nw || !nh) return null;
    const fit = Math.min(W / nw, H / nh);
    return { w: nw * fit, h: nh * fit, W, H };
  }
  function viewerApply() {
    const el = photoViewer, photo = el.querySelector('[data-viewer-photo]');
    const s = viewerState.scale, drawn = viewerDrawn();
    // Pan stops where the picture's edge meets the stage's: never into empty background (review 2026-10-21).
    const maxX = drawn ? Math.max(0, (drawn.w * s - drawn.W) / 2) : 0, maxY = drawn ? Math.max(0, (drawn.h * s - drawn.H) / 2) : 0;
    viewerState.x = s === 1 ? 0 : Math.max(-maxX, Math.min(maxX, viewerState.x));
    viewerState.y = s === 1 ? 0 : Math.max(-maxY, Math.min(maxY, viewerState.y));
    photo.style.transform = `translate(${Math.round(viewerState.x)}px, ${Math.round(viewerState.y)}px) scale(${s})`;
    el.dataset.zoom = String(Math.round(s * 100) / 100);
    el.toggleAttribute('data-zoomed', s > 1);
  }
  // Zoom to `next` keeping the point (px, py), measured from the stage centre, under the finger or cursor.
  function viewerZoomTo(next, px = 0, py = 0) {
    const from = viewerState.scale, to = Math.max(1, Math.min(VIEWER_MAX, next));
    viewerState.x = px - (px - viewerState.x) * (to / from);
    viewerState.y = py - (py - viewerState.y) * (to / from);
    viewerState.scale = to;
    viewerApply();
  }
  function viewerPoint(event) {
    const rect = photoViewer.querySelector('[data-viewer-stage]').getBoundingClientRect();
    return [(event.clientX || 0) - (rect.left + rect.width / 2), (event.clientY || 0) - (rect.top + rect.height / 2)];
  }
  function viewerToggleZoom(event) {
    const [px, py] = viewerPoint(event);
    viewerZoomTo(viewerState.scale > 1 ? 1 : VIEWER_STEP, px, py);
  }
  function viewerShow(index) {
    const el = photoViewer, count = viewerState.images.length;
    viewerState.index = ((index % count) + count) % count;
    viewerState.scale = 1; viewerState.x = 0; viewerState.y = 0;
    const photo = el.querySelector('[data-viewer-photo]');
    photo.src = viewerState.images[viewerState.index];
    photo.alt = count > 1 ? `${viewerState.title} · foto ${viewerState.index + 1} de ${count}` : viewerState.title;
    el.querySelector('[data-viewer-count]').textContent = count > 1 ? `${viewerState.index + 1} / ${count}` : '';
    el.querySelectorAll('[data-viewer-thumb]').forEach(button => button.setAttribute('aria-current', String(Number(button.dataset.viewerThumb) === viewerState.index)));
    el.dataset.index = String(viewerState.index);
    viewerApply();
  }
  const viewerGo = step => { if (viewerState.images.length > 1) viewerShow(viewerState.index + step); };
  function openPhotoViewer(images, index, options = {}) {
    const list = viewerPhotos(images);
    if (!list.length) return false;
    const el = photoViewerElement();
    const asked = Array.isArray(images) ? images[index] : undefined;
    viewerState.images = list;
    viewerState.title = String(options.title || '');
    viewerState.opener = options.opener || document.activeElement;
    el.setAttribute('aria-label', `Fotos de ${viewerState.title}`);
    el.toggleAttribute('data-single', list.length === 1);
    el.querySelector('[data-viewer-prev]').hidden = list.length === 1;
    el.querySelector('[data-viewer-next]').hidden = list.length === 1;
    el.querySelector('[data-viewer-thumbs]').innerHTML = list.length > 1
      ? list.map((url, i) => `<button type="button" data-viewer-thumb="${i}" aria-label="Ver foto ${i + 1}"><img src="${escape(url)}" alt="" loading="lazy" /></button>`).join('') : '';
    viewerShow(Math.max(0, list.indexOf(asked)));
    if (!el.open) {
      viewerState.lockedFrom = document.documentElement.style.overflow;
      viewerState.locked = true;
      document.documentElement.style.overflow = 'hidden';
      if (typeof el.showModal === 'function') el.showModal(); else el.setAttribute('open', '');
    }
    el.querySelector('[data-viewer-close]').focus({ preventScroll: true });
    return true;
  }
  // Gives the page its scroll and the opener its focus back, once, however the dialog closed: the viewer's own controls, or
  // the browser (a back gesture) or store code closing the dialog directly (review 2026-10-21).
  function viewerRelease() {
    if (!viewerState.locked) return;
    viewerState.locked = false;
    document.documentElement.style.overflow = viewerState.lockedFrom || '';
    viewerState.lockedFrom = null;
    const opener = viewerState.opener;
    viewerState.opener = null;
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
  }
  function closePhotoViewer() {
    const el = photoViewer;
    if (!el || !el.open) return;
    if (typeof el.close === 'function') el.close(); else el.removeAttribute('open');
    viewerRelease();
  }
  function wirePhotoViewer(el) {
    const stage = el.querySelector('[data-viewer-stage]');
    const pointers = new Map();
    let pinchFrom = 0, pinchScale = 1, start = null;
    el.addEventListener('cancel', event => { event.preventDefault(); closePhotoViewer(); });
    el.addEventListener('close', viewerRelease);
    el.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); viewerGo(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); viewerGo(1); }
      else if (event.key === 'Escape') { event.preventDefault(); closePhotoViewer(); }
    });
    el.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (button?.hasAttribute('data-viewer-close')) return closePhotoViewer();
      if (button?.hasAttribute('data-viewer-prev')) return viewerGo(-1);
      if (button?.hasAttribute('data-viewer-next')) return viewerGo(1);
      if (button?.hasAttribute('data-viewer-thumb')) return viewerShow(Number(button.dataset.viewerThumb));
      // Only a press that began on the empty backdrop closes: with pointer capture the browser sends the click to the stage
      // even when the press was on the photo (live check 2026-10-21: the first click of a double-click closed the viewer).
      const fromPhoto = viewerState.pressedPhoto;
      viewerState.pressedPhoto = false;
      if (event.target === stage && viewerState.scale === 1 && !viewerState.moved && !fromPhoto) closePhotoViewer();
    });
    stage.addEventListener('dblclick', event => {
      event.preventDefault();
      // Some phones send a dblclick after the double-tap the touch path already toggled (review 2026-10-21).
      if (Date.now() - viewerState.touchToggle < 500) return;
      viewerToggleZoom(event);
    });
    stage.addEventListener('wheel', event => {
      event.preventDefault();
      const [px, py] = viewerPoint(event);
      viewerZoomTo(viewerState.scale * Math.exp(-event.deltaY * 0.002), px, py);
    }, { passive: false });
    stage.addEventListener('pointerdown', event => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try { stage.setPointerCapture?.(event.pointerId); } catch { /* a pointer the browser no longer tracks: no capture, the gesture still counts */ }
      viewerState.moved = false;
      // On the picture or on the background beside it: the photo box fills the stage, so the drawn picture decides.
      const drawn = viewerDrawn(), [px, py] = viewerPoint(event);
      viewerState.pressedPhoto = drawn
        ? Math.abs(px - viewerState.x) <= (drawn.w * viewerState.scale) / 2 && Math.abs(py - viewerState.y) <= (drawn.h * viewerState.scale) / 2
        : event.target !== stage;
      start = { x: event.clientX, y: event.clientY, panX: viewerState.x, panY: viewerState.y };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchFrom = Math.hypot(a.x - b.x, a.y - b.y) || 1; pinchScale = viewerState.scale;
      }
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !start) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) viewerState.moved = true;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const [px, py] = viewerPoint({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
        viewerZoomTo(pinchScale * (Math.hypot(a.x - b.x, a.y - b.y) / pinchFrom), px, py);
      } else if (viewerState.scale > 1) {
        el.setAttribute('data-dragging', '');
        viewerState.x = start.panX + (event.clientX - start.x);
        viewerState.y = start.panY + (event.clientY - start.y);
        viewerApply();
      }
    });
    const release = event => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      el.removeAttribute('data-dragging');
      // One finger left after a pinch: it pans from where the photo is now, and the gesture is no longer a tap or swipe.
      if (pointers.size === 1) {
        const [rest] = [...pointers.values()];
        start = { x: rest.x, y: rest.y, panX: viewerState.x, panY: viewerState.y };
        viewerState.moved = true;
        return;
      }
      if (pointers.size || !start) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      // A swipe at 1× moves between photos; a quick second tap on touch toggles zoom (mobile Safari sends no dblclick).
      if (viewerState.scale === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) viewerGo(dx < 0 ? 1 : -1);
      else if (event.pointerType === 'touch' && !viewerState.moved) {
        const now = Date.now();
        if (now - viewerState.lastTap < 300) { viewerToggleZoom(event); viewerState.lastTap = 0; viewerState.touchToggle = now; viewerState.moved = true; } else viewerState.lastTap = now;
      }
      start = null;
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
  }
  // A public handle so a store's own code can open the same viewer (and the kit's specs can reach it).
  // Product page: the shown photo (data-photo-zoom="") or a stacked one (its index) opens the viewer. A click an editor already
  // handled (defaultPrevented) is left alone.
  function openProductPhoto(target) {
    const own = target.getAttribute('data-photo-zoom');
    const index = own === '' ? selectedImage : Number(own);
    return openPhotoViewer(currentGallery(), Number.isFinite(index) ? index : 0, { title: selectedProduct?.name || '', opener: target });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ')) return;
    const target = event.target.closest?.('[data-pagosya-product] [data-photo-zoom]');
    if (target && openProductPhoto(target)) event.preventDefault();
  });
  // Desktop magnifier: a fine mouse over the stage photo zooms it 2× around the cursor; leaving the stage resets it.
  document.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const photo = event.target.closest?.('[data-pagosya-product] .product-detail__stage .product-detail__photo');
    if (!photo || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    ensurePhotoViewerStyle();
    const stage = photo.closest('.product-detail__stage'), rect = photo.getBoundingClientRect();
    const x = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50, y = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
    photo.style.transformOrigin = `${Math.max(0, Math.min(100, x)).toFixed(1)}% ${Math.max(0, Math.min(100, y)).toFixed(1)}%`;
    if (!stage.hasAttribute('data-magnify')) {
      stage.setAttribute('data-magnify', '');
      stage.addEventListener('pointerleave', () => stage.removeAttribute('data-magnify'), { once: true });
    }
  });
  // Cards: a small «Ampliar foto» button on every card that shows a photo. It goes in the photo's holder, or in the card itself
  // when the holder is the card's link or button (a button inside a link would follow the link). A template's own button stays.
  function decorateZoomButtons(root) {
    const cards = root?.querySelectorAll?.('.menu-item[data-product-id]');
    if (!cards?.length) return;
    let added = false;
    cards.forEach(card => {
      if (card.querySelector('[data-product-zoom]')) return;
      const photo = card.querySelector('img.menu-item__image[src]');
      const p = products().find(item => item.id === card.dataset.productId);
      if (!photo || photo.hidden || !p || !viewerPhotos(galleryImages(p)).length) return;
      const holder = photo.parentElement && photo.parentElement !== card && !photo.parentElement.closest('a,button') ? photo.parentElement : card;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-product-zoom', '');
      button.setAttribute('aria-label', `Ampliar foto de ${p.name}`);
      button.innerHTML = ZOOM_ICON;
      holder.append(button);
      if (holder === card) button.setAttribute('data-zoom-float', '');
      added = true;
    });
    if (added) { ensurePhotoViewerStyle(); placeZoomButtons(root); }
  }
  // A button that could not go inside the photo's holder (the photo sits in the card itself, or in the card link) is measured onto
  // the photo's bottom-right corner, and kept there when the card changes size (a horizontal or split card would otherwise show
  // it beside the name). Bottom-right: badges hold the top-left, «Más vendido» and quick look the top-right.
  const zoomResize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => entries.forEach(entry => placeZoomButtons(entry.target))) : null;
  function placeZoomButtons(root) {
    const buttons = root?.matches?.('[data-zoom-float]') ? [root] : [...(root?.querySelectorAll?.('[data-zoom-float]') || [])];
    buttons.forEach(button => {
      const card = button.closest('.menu-item'), photo = card?.querySelector('img.menu-item__image');
      if (!card || !photo) return;
      const box = card.getBoundingClientRect(), shot = photo.getBoundingClientRect();
      const inset = 10, size = button.offsetWidth || 36;
      button.style.top = `${Math.round(shot.bottom - box.top - inset - size)}px`;
      button.style.bottom = 'auto';
      button.style.left = `${Math.round(shot.right - box.left - inset - size)}px`;
      button.style.right = 'auto';
      if (zoomResize && !card.hasAttribute('data-zoom-watched')) { card.setAttribute('data-zoom-watched', ''); zoomResize.observe(card); }
    });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const button = event.target.closest?.('[data-product-zoom]');
    if (!button) return;
    const card = button.closest('[data-product-id]');
    const p = card && products().find(item => item.id === card.dataset.productId);
    if (!p) return;
    event.preventDefault();
    event.stopPropagation();
    openPhotoViewer(galleryImages(p), 0, { title: p.name, opener: button });
  });
  // A public handle so a store's own code can open the same viewer (and the kit's specs can reach it).
  window.pagosyaPhotos = { open: openPhotoViewer, close: closePhotoViewer, decorate: decorateZoomButtons, place: placeZoomButtons };
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
    // Fashion look (spec 2026-10-21): the colour group reads «4 colores:» with the chosen colour after it.
    const fashion = productPageStyle() === 'fashion', colourIndex = colourGroupIndex(groups);
    return `<div class="product-detail__options">${groups.map((group, index) => {
      const colors = group.values.map(value => swatchColor(group.name, value));
      return `<fieldset><legend>${fashion && index === colourIndex ? `${group.values.length} ${group.values.length === 1 ? 'color' : 'colores'}:` : escape(group.name)} <span data-product-selection="${index}"></span></legend><div class="product-detail__values"${colors.every(Boolean) ? ' data-kind="swatch"' : ''}>${group.values.map((value, valueIndex) => `<button type="button" data-part="swatch" data-product-option="${index}" data-option-value="${valueIndex}" aria-pressed="false">${optionPhoto(index, value) || (colors[valueIndex] ? `<span class="product-detail__swatch" style="--swatch:${colors[valueIndex]}" aria-hidden="true"></span>` : '')}<span class="product-detail__option-label">${escape(value)}</span></button>`).join('')}</div></fieldset>`;
    }).join('')}</div>`;
  }
  /** Fill every group with an available value, keeping the shopper's choices where a variant still allows them. */
  function completeSelection(p, preferred) {
    const groups = optionGroups(p);
    if (!groups) return [];
    const result = [];
    // Fashion look: the size stays the shopper's to pick — never filled in, and dropped rather than swapped when a colour rules
    // it out (review 2026-10-21: picking a colour first chose a size and undid the colour).
    const open = productPageStyle() === 'fashion' ? sizeGroupIndex(groups) : -1;
    for (let index = 0; index < groups.length; index++) {
      const available = value => p.variants.some(v => remaining(p, v) > 0 && variantValues(v).every((candidate, i) => i > index || (i === index ? candidate === value : result[i] === undefined || candidate === result[i])));
      if (index === open && (preferred[index] === undefined || !available(preferred[index]))) { result[index] = undefined; continue; }
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
      // Fashion look: the size is picked last or first, so every chosen group narrows it (a colour picked first greys out its missing sizes).
      const narrowsAll = productPageStyle() === 'fashion';
      const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : (i > index && !narrowsAll) || selectedOptions[i] === undefined || candidate === selectedOptions[i]));
      const available = matches.some(v => remaining(p, v) > 0);
      // Colour circles stay tappable when sold out, marked with a line, so the shopper still sees the colour's name and photo
      // (owner 2026-10-25); other choices (sizes) are switched off as before.
      const swatch = Boolean(button.closest('[data-kind="swatch"]'));
      button.disabled = !available && !swatch;
      button.toggleAttribute('data-unavailable', !available);
      button.setAttribute('aria-pressed', String(selectedOptions[index] === value));
      button.setAttribute('aria-label', `${value}${available ? '' : matches.length ? ' · Sin disponibilidad' : ' · Combinación no disponible'}`);
    });
    const variant = selectedVariant(), buy = detail.querySelector('[data-variant-add]');
    const available = variant && remaining(p, variant) > 0;
    buy.disabled = !ready || checkingOut || !available;
    if (productPageStyle() === 'fashion') {
      const missing = groups.findIndex((group, index) => selectedOptions[index] === undefined);
      const text = missing < 0 ? 'Agregar al pedido' : missing === sizeGroupIndex(groups) ? 'Elige una talla' : missing === colourGroupIndex(groups) ? 'Elige un color' : `Elige ${groups[missing].name.toLowerCase()}`;
      const node = [...buy.childNodes].find(child => child.nodeType === 3);
      if (node) node.textContent = text; else buy.prepend(text);
    }
    if (variant) buy.dataset.add = lineKey(p.id, variant.id, selectedCadence()); else delete buy.dataset.add;
    const compatible = p.variants.filter(v => remaining(p, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
    const lowest = (compatible.length ? compatible : p.variants).reduce((a, b) => a.amount <= b.amount ? a : b);
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, variant || lowest, !variant);
    groups.forEach((group, index) => { detail.querySelector(`[data-product-selection="${index}"]`).textContent = selectedOptions[index] || ''; });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = variant
      ? available ? `${selectionNote || variant.name}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : variant.stock === 0 ? `${variant.name} · Agotado` : 'Ya añadiste la cantidad disponible de esta combinación.'
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
  // Lively one-product stores (spec 2026-11-03): short facts the store wrote (data-product-pills on the embedded product) float over
  // the photo, each with a pinging dot. Never more than three, never without a photo.
  function pillsMarkup(images) {
    if (!images.length || !fullProductPage) return '';
    let pills = [];
    try { pills = JSON.parse(fullProductPage.getAttribute('data-product-pills') || '[]'); } catch { pills = []; }
    pills = (Array.isArray(pills) ? pills : []).map(pill => String(pill).replace(/\s+/g, ' ').trim()).filter(pill => pill && pill.length <= 32).slice(0, 3);
    return pills.length ? `<ul class="product-detail__pills" aria-label="Destacados">${pills.map((pill, at) => `<li style="--i:${at}"><span aria-hidden="true"></span>${escape(pill)}</li>`).join('')}</ul>` : '';
  }
  function galleryMarkup(images, p) {
    let html = plainGalleryMarkup(images, p);
    const badge = images.length ? badgeMarkup(p, 'product-detail__badge') : '';
    const mode = document.documentElement.getAttribute('data-dna-gallery');
    const stacked = (mode === 'stack' || mode === 'mosaic') && images.length > 1;
    // The badge rides on the photo's own corner; a stacked gallery hides the stage, so there it leads the gallery.
    html = stacked ? badge + html : html.replace('<div class="product-detail__stage" data-part="stage">', `<div class="product-detail__stage" data-part="stage">${badge}`);
    if (stacked) {
      const at = html.indexOf('<div class="product-detail__thumbnails"');
      if (at > -1) html = html.slice(0, at) + `<div class="product-detail__stack" data-part="thumbs">${images.map((url, index) => `<img data-part="thumb" data-photo-zoom="${index}" src="${escape(url)}"${responsiveAttrs(url, "(max-width: 820px) 100vw, 55vw")} alt="${escape(`${p.name} · imagen ${index + 1} de ${images.length}`)}" loading="${index ? 'lazy' : 'eager'}" />`).join('')}</div>`;
    }
    const tiles = productPageStyle() === 'conversion' && images.length ? tilesMarkup(conversionHighlights(p).tiles) : '';
    return html + tiles + '<span class="product-detail__decor" data-part="decor-a" aria-hidden="true"></span>';
  }
  function plainGalleryMarkup(images, p) {
    return images.length ? `<div class="product-detail__stage" data-part="stage"><img class="product-detail__photo" src="${escape(images[0])}"${responsiveAttrs(images[0], "(max-width: 820px) 100vw, 55vw")} alt="${escape(p.name)}" data-photo-zoom="" role="button" tabindex="0" aria-label="${escape(`Ampliar foto de ${p.name}`)}" /><div class="product-detail__navigation"${images.length > 1 ? '' : ' hidden'}>${images.length > 1 ? '<button type="button" data-product-prev aria-label="Foto anterior">←</button>' : ''}<span data-product-count aria-live="polite">1 / ${images.length}</span>${images.length > 1 ? '<button type="button" data-product-next aria-label="Foto siguiente">→</button>' : ''}</div></div>${images.length > 1 ? `<div class="product-detail__thumbnails" data-part="thumbs" aria-label="Elegir foto">${images.map((url, index) => `<button type="button" data-part="thumb" data-product-image="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === 0}"><img src="${escape(url)}"${responsiveAttrs(url, "56px")} alt="" loading="lazy" /></button>`).join('')}</div>` : ''}` : '<p class="product-detail__empty">Sin fotos disponibles</p>';
  }
  function drawGallery(images) {
    const gallery = detail.querySelector('.product-detail__gallery');
    gallery.innerHTML = galleryMarkup(images, selectedProduct);
    gallery.hidden = !images.length;
    gallery.toggleAttribute('data-rail', images.length > 1);
    selectedImage = 0;
    showImage(0);
    watchHighlights();
  }
  function openProduct(id, trigger) {
    const p = products().find(p => p.id === id);
    if (!p && embeddedProductId && id === embeddedProductId) { fullProductPage.hidden = true; return; }
    if (!p) { if (fullProductPage) detail.innerHTML = `<h1>Producto no disponible</h1><p>Este producto ya no está en el catálogo.</p><a href="${escape(pageHref('productos.html'))}">Explorar productos</a>`; return; }
    track('product_view', undefined, { value: price(p), currency: p.currency });
    analytics('product_view', { productId: p.id }, 'view:' + p.id);
    selectedProduct = p; selectedImage = 0; selectedQuantity = 1; detailTrigger = trigger; selectionNote = ''; selectedPicks = [];
    activeGallery = null;
    // A card's colour swatch sends the shopper here with ?color=: that colour starts chosen (owner 2026-10-25).
    const linkedColour = fullProductPage ? new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('color') : null;
    const linkedGroups = linkedColour ? optionGroups(p) : null;
    selectedOptions = completeSelection(p, linkedGroups ? linkedGroups.map(group => /^colou?r$/i.test(group.name.trim()) && group.values.includes(linkedColour) ? linkedColour : undefined) : []);
    const images = galleryImages(p), box = boxGroup(p), complex = !box && (p.variants?.length || p.extras?.length), groups = optionGroups(p);
    const style = productPageStyle();
    // Atelier (2026-10-19, the Amboras product page): a short first sentence becomes the subtitle under the title.
    const lead = style === 'atelier' ? productLead(p.description) : null;
    const rating = fullProductPage ? '<p class="product-detail__rating" data-product-rating hidden></p>' : '';
    // Fashion look: the category alone under the title (a store without one shows nothing there).
    const category = (store.categories || []).find(c => c.id === p.categoryId)?.name;
    const eyebrowText = style === 'fashion' ? category || '' : (category || store.storeName || 'Tu tienda');
    const addText = style === 'fashion' ? 'Agregar al pedido' : 'Añadir al pedido';
    detail.dataset.style = style;
    adoptAuthoredAction();
    // Stores nearly always author their own way back right above the mount; a second trail beside it reads as a template.
    let authoredTrail = false;
    for (let node = fullProductPage ? detail.previousElementSibling : null; node && !node.matches('header,[role=banner]'); node = node.previousElementSibling) if (node.matches('a[href]') || node.querySelector('a[href]')) { authoredTrail = true; break; }
    const breadcrumb = authoredTrail ? '' : `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('productos.html'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>`;
    detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}<div class="product-detail__layout"${images.length ? '' : ' data-no-images'}><section class="product-detail__gallery" data-part="gallery" aria-label="Fotos del producto"${images.length ? '' : ' hidden'}${images.length > 1 ? ' data-rail' : ''}>${galleryMarkup(images, p)}${pillsMarkup(images)}</section><section class="product-detail__copy"><span class="product-detail__decor" data-part="decor-b" aria-hidden="true"></span>${fullProductPage ? breadcrumb : ''}<p class="product-detail__eyebrow" data-part="eyebrow">${escape(eyebrowText)}</p>${style === 'conversion' || style === 'atelier' ? rating : ''}<${fullProductPage ? "h1" : "h2"} id="pagosya-product-title" data-part="title"${p.name.length > 32 ? ' data-length="long"' : ''}>${escape(p.name)}</${fullProductPage ? "h1" : "h2"}>${lead ? `<p class="product-detail__subtitle" data-part="subtitle">${escape(lead.lead)}</p>` : ''}${style !== 'conversion' && style !== 'atelier' ? rating : ''}<div class="product-detail__pricing" data-product-pricing>${isMembership(p) ? `<strong class="product-detail__price">${escape(membershipPriceText(p))}</strong>` : priceMarkup(p)}</div>${style === 'conversion' ? checksMarkup(conversionHighlights(p).checks) : ''}${p.description ? `<p class="product-detail__intro" data-part="intro">${escape(lead ? lead.rest : p.description)}</p>` : ''}${style === 'fashion' && (p.description || '').length > 220 ? '<button type="button" class="product-detail__more" data-product-more aria-expanded="false">Leer más</button>' : ''}${style === 'dense' ? specChipsMarkup(p) : ''}${style !== 'dense' && style !== 'conversion' ? highlightsMarkup(p) : ''}${isMembership(p) ? membershipMarkup(p) : groups ? `${optionsMarkup(groups)}${offerSquaresMarkup(p, undefined)}${subscriptionChoice(p)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-variant-add disabled>' + addText + '<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : limit(p) === 0 ? '<p>Agotado</p>' : box ? `${boxMarkup(p, box)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-box-add disabled>' + addText + '<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : complex ? preview || config.demo ? '<button class="product-detail__buy checkout-button" disabled>Elegir opciones en la tienda</button>' : `<a class="product-detail__buy checkout-button" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `${offerSquaresMarkup(p, undefined)}${subscriptionChoice(p)}${quantityMarkup(`<button class="product-detail__buy checkout-button" type="button" data-add="${escape(p.id)}">${addText}<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>`)}`}<p class="product-detail__status" role="status" aria-live="polite"></p>${style === 'dense' ? highlightsMarkup(p) : ''}${deliveryMarkup(p)}${productInformation(p)}</section></div>${contentBlocksMarkup(p)}${fullProductPage ? longPageTop(p) : ''}${fullProductPage ? `${bundleOffersMarkup(p)}${relatedMarkup(p)}<section class="product-detail__reviews" id="product-reviews" data-product-reviews aria-labelledby="product-reviews-title" hidden></section>${longPageBottom(p)}<div class="product-detail__sticky-space" data-product-sticky-space hidden></div><div class="product-detail__sticky" data-product-sticky hidden><img data-product-sticky-photo alt="" hidden /><div><strong>${escape(p.name)}</strong><span data-product-sticky-choice></span><span data-product-sticky-price></span></div><button type="button" data-product-jump>${isMembership(p) ? 'Hacerme miembro' : 'Añadir'}</button></div>` : ''}`;
    detail.removeAttribute('data-page-template');
    applyProductPageTemplate();
    showImage(0);
    if (fullProductPage && (!images.length || style === 'dense' || style === 'story-led') && !detail.hasAttribute('data-page-template')) {
      // Mobile reads identity, purchase, then details; desktop places the purchase panel beside both.
      const copy = detail.querySelector('.product-detail__copy'), [summary, buybox, details] = ['summary', 'buybox', 'details'].map(name => Object.assign(document.createElement('div'), { className: 'product-detail__' + name }));
      for (const child of [...copy.children]) (child.matches('.product-detail__pricing,.product-detail__checks,.product-detail__options,.product-detail__box,.product-detail__offers,.product-detail__subscription,.product-detail__purchase,.product-detail__buy,.product-detail__status,.product-detail__assurances,p:not([class])') ? buybox : child.matches('.product-tabs,[role=tabpanel]') ? details : summary).append(child);
      copy.append(summary, buybox, ...(details.children.length ? [details] : [])); copy.dataset.split = '';
      if (style === 'story-led') {
        detail.querySelector('.product-detail__layout').prepend(summary);
        copy.dataset.story = '';
      }
    }
    if (MOTIFS.length) { placeProductMotif(p); placeButtonMotifs(detail); }
    watchHighlights();
    watchSteps();
    watchReveal();
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
    scoop: { motion: 'tilt', paths: '<path d="M3 11h11a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M14 12h7"/><path d="M6 8c1-1.5 3-1.5 4 0"/>' },
    brain: { motion: 'pulse', paths: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 6 3 3 0 0 0 3 5 3 3 0 0 0 5-1z"/><path d="M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 6 3 3 0 0 1-3 5 3 3 0 0 1-5-1z"/><path d="M12 5v13"/>' },
    moon: { motion: 'sway', paths: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
    dumbbell: { motion: 'nudge', paths: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9.5v5"/><path d="M21 9.5v5"/><path d="M6 12h12"/>' },
    bean: { motion: 'settle', paths: '<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(35 12 12)"/><path d="M9 17c1-3 5-7 6-10"/>' },
    bowl: { motion: 'wave', paths: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 21h8"/><path d="M9 7.5c0-1.5 1-2 1-3.5"/><path d="M14 7.5c0-1.5 1-2 1-3.5"/>' },
    pill: { motion: 'tilt', paths: '<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>' },
    sprout: { motion: 'sway', paths: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 10c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>' },
    lotion: { motion: 'bob', paths: '<path d="M9.5 2h5v3h-5z"/><path d="M10.5 5h3v3h-3z"/><rect x="7" y="8" width="10" height="13" rx="2"/><path d="M10 13h4"/>' },
    mirror: { motion: 'glow', paths: '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v5"/><path d="M9 21h6"/><path d="m9.5 7.5 2-2"/>' },
    eye: { motion: 'twinkle', paths: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    headphones: { motion: 'beat', paths: '<path d="M4 18v-6a8 8 0 0 1 16 0v6"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>' },
    camera: { motion: 'pulse', paths: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>' },
    timer: { motion: 'nudge', paths: '<circle cx="12" cy="14" r="8"/><path d="M12 14v-4"/><path d="M10 2h4"/><path d="M12 2v4"/>' },
    glass: { motion: 'wave', paths: '<path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M6.5 9h11"/>' },
    shield: { motion: 'draw', paths: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path class="pd-check" d="m9 12 2 2 4-4"/>' },
    star: { motion: 'twinkle', paths: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z"/>' },
    heart: { motion: 'beat', paths: '<path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>' },
    recycle: { motion: 'spin', paths: '<path d="M7 19H5a2 2 0 0 1-1.7-3l1.6-2.7"/><path d="m9 22 2-3-3-2"/><path d="M17 5.5 15.5 3a2 2 0 0 0-3.4 0L10.5 5.7"/><path d="m8 4 3.5.3L11 7.8"/><path d="M19 19h-7"/><path d="m15 22 3-3-3-3"/>' },
    check: { motion: 'draw', paths: '<circle cx="12" cy="12" r="9"/><path class="pd-check" d="m8.5 12.5 2.5 2.5 4.5-5"/>' },
  };
  function highlightRows(p) {
    return (Array.isArray(p?.highlights) ? p.highlights : [])
      .filter(row => row && highlightIcons[row.icon] && typeof row.label === 'string' && row.label.trim())
      .slice(0, 6);
  }
  const iconSvg = icon => `<svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg>`;
  function highlightsMarkup(p) {
    const rows = highlightRows(p);
    if (!rows.length) return '';
    return `<ul class="product-detail__highlights" data-part="highlights" aria-label="Destacados del producto">${rows.map(row => {
      const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
      return `<li>${iconSvg(highlightIcons[row.icon])}<div><strong>${escape(row.label.trim())}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }
  /** conversion (spec 2026-10-10): three tiles beside the photo when there are three and a photo; every other highlight a check. */
  function conversionHighlights(p) {
    const rows = highlightRows(p);
    return rows.length >= 3 && galleryImages(p).length ? { tiles: rows.slice(0, 3), checks: rows.slice(3) } : { tiles: [], checks: rows };
  }
  function tilesMarkup(rows) {
    return rows.length ? `<ul class="product-detail__tiles" aria-label="Lo esencial">${rows.map(row => `<li>${iconSvg(highlightIcons[row.icon])}<span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
  }
  function checksMarkup(rows) {
    return rows.length ? `<ul class="product-detail__checks" aria-label="Beneficios">${rows.map(row => `<li><svg class="product-detail__check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg><span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
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
    if (featureItems.length >= 3) parts.push(`<section class="product-long__features" data-part="features"><h2>${escape(nonEmpty(features.title) || 'Lo que lo hace especial')}</h2><ul data-count="${featureItems.length}">${featureItems.map(item => { const icon = highlightIcons[item.icon]; return `<li data-part="feature"><svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg><strong>${escape(item.label)}</strong>${nonEmpty(item.detail) ? `<span>${escape(item.detail)}</span>` : ''}</li>`; }).join('')}</ul></section>`);
    const story = pageBlock(p, 'story');
    if (story && nonEmpty(story.problem) && nonEmpty(story.tried) && nonEmpty(story.solution)) parts.push(`<section class="product-long__story" data-part="story">${nonEmpty(story.title) ? `<h2>${escape(story.title)}</h2>` : ''}<p data-part="story-problem">${escape(story.problem)}</p><p data-part="story-tried">${escape(story.tried)}</p><p data-part="story-solution">${escape(story.solution)}</p></section>`);
    // Owner 2026-10-27: the gallery already shows the main photo; a details row on it was the same photo again, huge.
    const mainPhoto = safeUrl(Array.isArray(p?.imageUrls) ? p.imageUrls[0] : '');
    const details = (pageBlock(p, 'details')?.items || []).map(item => ({ ...item, url: safeUrl(item?.imageUrl) })).filter(item => item.url && item.url !== mainPhoto && nonEmpty(item.title) && nonEmpty(item.alt));
    // Atelier (2026-10-19, pawfectt.com): two or more photographed details become story steps, a sticky frame whose photo
    // follows the step being read, instead of a row of small photos.
    if (details.length >= 2 && productPageStyle() === 'atelier') parts.push(storyStepsMarkup(p, details.slice(0, 6)));
    else if (details.length) parts.push(`<section class="product-long__details" data-part="details" data-count="${Math.min(details.length, 3)}">${details.map(item => `<figure data-part="detail"><img src="${escape(item.url)}" alt="${escape(item.alt)}" loading="lazy"><figcaption><strong>${escape(item.title)}</strong>${nonEmpty(item.text) ? `<span>${escape(item.text)}</span>` : ''}</figcaption></figure>`).join('')}</section>`);
    const versus = pageBlock(p, 'versus');
    const rows = (versus?.rows || []).filter(row => row && nonEmpty(row.label) && typeof row.ours === 'boolean' && typeof row.theirs === 'boolean');
    const hasVersus = Boolean(versus && rows.length >= 2 && nonEmpty(versus.ours) && nonEmpty(versus.theirs));
    // The bottom half opens with its own «Comprar ahora»: this one only when the compare table stands between them, or the
    // two buttons met back to back (Pulso Studio, 2026-10-19).
    if (parts.length && hasVersus) parts.push(buyAgainMarkup());
    if (hasVersus) {
      const mark = yes => `<span class="product-long__mark" data-yes="${yes}" aria-label="${yes ? 'Sí' : 'No'}">${yes ? '✓' : '✕'}</span>`;
      parts.push(`<section class="product-long__versus" data-part="versus">${nonEmpty(versus.title) ? `<h2>${escape(versus.title)}</h2>` : ''}<table><thead><tr><th scope="col"><span class="product-detail__sr">Característica</span></th><th scope="col">${escape(versus.ours)}</th><th scope="col">${escape(versus.theirs)}</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.label)}</th><td>${mark(row.ours)}</td><td>${mark(row.theirs)}</td></tr>`).join('')}</tbody></table></section>`);
    }
    return parts.length ? `<div class="product-long" data-part="long-page">${parts.join('')}</div>` : '';
  }
  const twoDigits = n => String(n).padStart(2, '0');
  function storyStepsMarkup(p, items) {
    const total = twoDigits(items.length);
    const media = items.map((item, i) => `<img src="${escape(item.url)}" alt="${escape(item.alt)}" loading="lazy" data-step-media="${i}"${i ? '' : ' data-active'}>`).join('');
    const pills = items.map((item, i) => `<button type="button" data-step-pill="${i}" aria-label="Paso ${i + 1}: ${escape(item.title)}" aria-pressed="${i === 0}">${twoDigits(i + 1)}</button>`).join('');
    const steps = items.map((item, i) => `<li class="product-steps__step" data-step="${i}"${i ? '' : ' data-active'}><img class="product-steps__photo" src="${escape(item.url)}" alt="${escape(item.alt)}" loading="lazy"><p class="product-steps__eyebrow">${twoDigits(i + 1)}${nonEmpty(item.kicker) ? ` / ${escape(item.kicker)}` : ''}</p><h3>${escape(item.title)}</h3>${nonEmpty(item.text) ? `<p>${escape(item.text)}</p>` : ''}</li>`).join('');
    return `<section class="product-steps" data-part="steps" style="--steps:${items.length}" aria-label="${escape(p.name || 'Producto')} paso a paso"><div class="product-steps__stage"><div class="product-steps__frame" aria-hidden="true"><div class="product-steps__media">${media}</div><p class="product-steps__caption"><span>${escape(p.name || '')}</span><span data-step-count>01 / ${total}</span></p><span class="product-steps__progress"><span data-step-progress style="--step-progress:${100 / items.length}%"></span></span></div><div class="product-steps__copy"><div class="product-steps__pills">${pills}</div><ol class="product-steps__list">${steps}</ol></div></div></section>`;
  }
  let stepsScroll = null;
  function showStep(section, index) {
    const steps = [...section.querySelectorAll('[data-step]')];
    if (!steps[index]) return;
    steps.forEach((step, i) => step.toggleAttribute('data-active', i === index));
    section.querySelectorAll('[data-step-media]').forEach((img, i) => img.toggleAttribute('data-active', i === index));
    section.querySelectorAll('[data-step-pill]').forEach((pill, i) => pill.setAttribute('aria-pressed', String(i === index)));
    const count = section.querySelector('[data-step-count]');
    if (count) count.textContent = `${twoDigits(index + 1)} / ${twoDigits(steps.length)}`;
    section.querySelector('[data-step-progress]')?.style.setProperty('--step-progress', `${(index + 1) * 100 / steps.length}%`);
  }
  /** The section is tall and its stage sticks (pawfectt.com): how far the stage has travelled picks the step. A pill scrolls
   *  to its step's share of that travel. On a phone the steps simply stack, so nothing is computed there. */
  function watchSteps() {
    if (stepsScroll) { removeEventListener('scroll', stepsScroll); stepsScroll = null; }
    const section = detail.querySelector('.product-steps');
    if (!section) return;
    const count = section.querySelectorAll('[data-step]').length;
    const travel = () => { const stage = section.querySelector('.product-steps__stage'); return Math.max(1, section.offsetHeight - (stage?.offsetHeight || 0)); };
    const stacked = () => matchMedia('(max-width: 760px)').matches;
    let frame = 0;
    stepsScroll = () => {
      if (frame || stacked()) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const progress = Math.min(.999, Math.max(0, (96 - section.getBoundingClientRect().top) / travel()));
        showStep(section, Math.floor(progress * count));
      });
    };
    addEventListener('scroll', stepsScroll, { passive: true });
    section.querySelectorAll('[data-step-pill]').forEach(pill => pill.addEventListener('click', () => {
      const index = Number(pill.dataset.stepPill);
      showStep(section, index);
      if (stacked()) return;
      const top = section.getBoundingClientRect().top + scrollY - 96 + (index + .5) / count * travel();
      scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }));
  }
  let revealObserver = null;
  /** Atelier sections below the purchase box rise 12px and fade in once as they enter (the premium references' only motion
   *  besides hovers). Nothing is hidden without IntersectionObserver or under reduced motion. */
  function watchReveal() {
    revealObserver?.disconnect(); revealObserver = null;
    // Automated browsers (the build's checks and screenshots) see every section at once.
    if (detail.dataset.style !== 'atelier' || typeof IntersectionObserver !== 'function' || navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const sections = [...detail.querySelectorAll('.product-long > section, .product-long > .product-long__buy, .product-detail__reviews')];
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute('data-revealed', ''); revealObserver?.unobserve(entry.target);
    }), { rootMargin: '0px 0px -10% 0px' });
    sections.forEach(section => { section.setAttribute('data-reveal', ''); revealObserver.observe(section); });
  }
  function longPageBottom(p) {
    const faq = pageBlock(p, 'faq');
    const items = (faq?.items || []).filter(item => item && nonEmpty(item.q) && nonEmpty(item.a));
    const hasTop = !!longPageTop(p);
    if (!hasTop && items.length < 2) return '';
    return `<div class="product-long" data-part="long-page">${hasTop ? buyAgainMarkup() : ''}${items.length >= 2 ? `<section class="product-long__faq" data-part="faq"><h2>${escape(nonEmpty(faq.title) || 'Preguntas frecuentes')}</h2>${items.map(item => `<details data-part="faq-item"><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</section>` : ''}</div>`;
  }
  // A stored choice wins; older stores read their catalog, and spec-heavy catalogs get the dense page.
  /** The description's first sentence when it is short enough to sit under the title as a subtitle, and the rest. */
  function productLead(text) {
    const match = /^(.{12,90}?[.!?])\s+([\s\S]+)$/.exec(String(text || '').trim());
    return match ? { lead: match[1], rest: match[2] } : null;
  }
  function productPageStyle() {
    if (['editorial', 'dense', 'image-led', 'story-led', 'conversion', 'atelier', 'fashion'].includes(config.productPageStyle)) return config.productPageStyle;
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
  // The calm checkout (checkout/shell.js) draws the checkout itself; these only keep hidden mounts hidden.
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
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
  // Only the runtime dialog below is the drawer. An authored wrapper named .cart-drawer would wear its fixed styles
  // while closed: with the "page" cart DNA that is an invisible full-screen layer that swallows scrolling and clicks.
  // The design meant it as the drawer, though, so it never shows in the page either (The Bake Lab 2026-10-17: the
  // mount itself was the aside, and its cart sat full width above the footer); openCart lends the mount to the dialog.
  document.querySelectorAll('.cart-drawer').forEach(wrapper => { wrapper.classList.remove('cart-drawer'); wrapper.style.setProperty('display', 'none', 'important'); });
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
  // The store's CSS may describe its own hidden panel as .cart-drawer; this attribute names the platform's (overlay.js).
  cartDrawer.setAttribute('data-pagosya-drawer', '');
  cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title');
  cartDrawer.innerHTML = `<header class="cart-drawer__header" data-part="cart-head"><h2 id="cart-drawer-title">${escape(CART_WORD || 'Tu pedido')}</h2><button type="button" data-cart-close aria-label="Cerrar pedido">×</button></header><div class="cart-drawer__body"></div><button type="button" class="cart-drawer__continue" data-cart-close>Seguir comprando</button>`;
  document.body.append(cartDrawer);
  function renderPolicyLinks() {
    cartDrawer.querySelector(':scope > .pagosya-policies')?.remove();
    const drawerPolicies = policyLinks(['returns', 'delivery', 'terms', 'privacy']);
    if (drawerPolicies) cartDrawer.insertAdjacentHTML('beforeend', drawerPolicies);
    document.querySelectorAll('[data-pagosya-policies]').forEach(slot => { slot.innerHTML = policyLinks(); slot.hidden = !slot.innerHTML; });
    renderInfoPages(); renderTrust();
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
    if (templated) { cartDrawer.removeAttribute('aria-labelledby'); cartDrawer.setAttribute('aria-label', CART_WORD || 'Tu pedido'); }
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
  /** Shows the added notice; false when it does not show (a button inside the cart), so the page status line speaks instead. */
  function addedFeedback(product, button, keyboard) {
    if (button.closest('[data-pagosya-cart]')) return false;
    addedNotice.dataset.instant = String(keyboard || config.motion === 'off');
    const template = addedTemplate();
    if (template && !addedNotice.hasAttribute('data-template')) { addedNotice.replaceChildren(template.make()); addedNotice.setAttribute('data-template', ''); }
    const text = `${product.name} añadido a ${ADDED_TO}.`;
    if (addedNotice.hasAttribute('data-template')) {
      addedNotice.querySelector('[data-added-field="message"]').textContent = text;
      const name = addedNotice.querySelector('[data-added-field="name"]');
      if (name) name.textContent = product.name;
      const photo = addedNotice.querySelector('[data-added-field="photo"]'), image = galleryImages(product)[0];
      if (photo) { photo.hidden = !image; if (image) { photo.src = image; photo.alt = ''; } else photo.removeAttribute('src'); }
    } else addedNotice.querySelector('span').textContent = text;
    // A template that positions itself keeps its own place; the DNA notice then only carries it (overlay.js).
    const templateRoot = addedNotice.hasAttribute('data-template') ? addedNotice.firstElementChild : null;
    addedNotice.toggleAttribute('data-template-placed', Boolean(templateRoot) && ['fixed', 'absolute'].includes(getComputedStyle(templateRoot).position));
    addedNotice.dataset.visible = 'true';
    // A template's own entrance runs when it is first inserted; every later add plays it again.
    if (templateRoot) for (const animation of addedNotice.getAnimations?.({ subtree: true }) || []) if (animation instanceof CSSAnimation) { animation.cancel(); animation.play(); }
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
    return true;
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
  // Generated by tools/build-commerce.mjs from checkout-shell/shell.css and checkout-shell/logos.json.
  const CHECKOUT_SHELL_CSS = "/* One calm checkout (docs/superpowers/specs/2026-10-20-calm-checkout-design.md). The same shell in every store and on\n   the hosted payment page. Unlayered and two classes deep, so a store's element and class rules never reach it; the\n   resets use :where() so the shell's own component rules (same weight, later) always win over them. */\n.pya-checkout{--pya-ink:#1a1a1a;--pya-muted:#6b6b6b;--pya-line:#d9d9d9;--pya-soft:#f7f7f7;--pya-divider:#ececec;--pya-accent:#1a1a1a;--pya-accent-ink:#ffffff;--pya-gutter:clamp(20px,4vw,56px);position:fixed;inset:0;z-index:2147483000;display:block;margin:0;padding:0;overflow:auto;overscroll-behavior:contain;background:#fff;color:var(--pya-ink);color-scheme:light;font:400 15px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,\"Helvetica Neue\",Arial,sans-serif;letter-spacing:normal;text-align:left;text-transform:none;-webkit-font-smoothing:antialiased}\n.pya-checkout.pya-checkout{width:auto;height:auto;min-width:0;min-height:0;max-width:none;max-height:none}\n.pya-checkout[hidden]{display:none}\n.pya-checkout.pya-checkout--page{position:static;inset:auto;z-index:auto;min-height:100dvh;overflow:visible}\n.pya-checkout.pya-checkout :is(*,*::before,*::after){box-sizing:border-box}\n.pya-checkout.pya-checkout :where(h1,h2,h3,p,ul,ol,li,dl,dt,dd,fieldset,legend,figure,small,strong,output){margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;letter-spacing:normal;text-transform:none;text-shadow:none;box-shadow:none;transform:none}\n.pya-checkout.pya-checkout :where(strong){font-weight:600}\n.pya-checkout.pya-checkout :where(ul,ol){list-style:none}\n.pya-checkout.pya-checkout :where(button,input,select,textarea){margin:0;border-radius:0;font:inherit;color:inherit;letter-spacing:normal;text-transform:none;text-shadow:none;box-shadow:none;transform:none;filter:none;-webkit-text-fill-color:currentColor}\n.pya-checkout.pya-checkout :where(a){color:inherit;text-decoration:underline;text-underline-offset:3px}\n.pya-checkout.pya-checkout :where(img){display:block;max-width:100%;border:0;border-radius:0;filter:none}\n.pya-checkout.pya-checkout :focus-visible{outline:2px solid var(--pya-ink);outline-offset:2px}\n.pya-checkout.pya-checkout [hidden]{display:none!important}\n.pya-checkout .pya-co__bar{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:64px;padding:10px var(--pya-gutter);border-bottom:1px solid var(--pya-divider);background:#fff}\n.pya-checkout .pya-co__brand{display:flex;align-items:center;gap:10px;min-width:0;font-size:17px;font-weight:600}\n.pya-checkout .pya-co__logo{width:auto;height:32px;max-width:120px;object-fit:contain}\n.pya-checkout .pya-co__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.pya-checkout .pya-co__back{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0;border:0;background:none;color:var(--pya-muted);font-size:14px;text-decoration:none;cursor:pointer}\n.pya-checkout .pya-co__back:hover{color:var(--pya-ink)}\n.pya-checkout .pya-co__secure{display:inline-flex;align-items:center;gap:6px;color:var(--pya-muted);font-size:13px;white-space:nowrap}\n.pya-checkout .pya-co__summary-toggle{display:none}\n.pya-checkout .pya-co__frame{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);grid-template-rows:auto 1fr;min-height:calc(100dvh - 65px)}\n.pya-checkout [data-pagosya-cart][data-checkout-review]{display:contents!important}\n.pya-checkout .pya-co__lead,.pya-checkout .pya-co__main{grid-column:1;justify-self:end;width:min(100% - 2 * var(--pya-gutter),580px);margin-right:var(--pya-gutter)}\n.pya-checkout .pya-co__lead{grid-row:1;padding-top:32px}\n.pya-checkout .pya-co__main{grid-row:2;display:grid;align-content:start;gap:0;padding:4px 0 56px}\n.pya-checkout .pya-co__steps{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;font-size:13px;color:var(--pya-muted)}\n.pya-checkout .pya-co__steps li{display:inline-flex;align-items:center;gap:6px}\n.pya-checkout .pya-co__steps li+li::before{content:\"›\";color:var(--pya-line)}\n.pya-checkout .pya-co__steps [aria-current=step]{color:var(--pya-ink);font-weight:600}\n.pya-checkout .pya-co__steps button{min-height:32px;padding:0;border:0;background:none;color:var(--pya-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}\n.pya-checkout .pya-co__lead h1{font-size:26px;line-height:1.2;font-weight:600}\n.pya-checkout .pya-co__lead h1:focus{outline:none}\n.pya-checkout .pya-co__note{margin-top:4px;color:var(--pya-muted);font-size:13px}\n.pya-checkout .pya-co__status{margin-top:14px;padding:12px 14px;border-radius:6px;background:var(--pya-soft);font-size:14px}\n.pya-checkout .pya-co__status:empty{display:none}\n/* message() writes the same line at the top and beside the pay button: one shows — beside the button while it has text,\n   at the top on the confirmation, where the order can no longer change. */\n.pya-checkout:has([data-pagosya-checkout-status]:not([hidden]):not(:empty)):not([data-mode=done]) .pya-co__status{display:none}\n.pya-checkout[data-mode=done] [data-pagosya-checkout-status],.pya-checkout[data-mode=done] .pya-co__stepper{display:none}\n.pya-checkout [data-pagosya-checkout-status]:not([hidden]){margin-top:12px;padding:12px 14px;border-radius:6px;background:var(--pya-soft);font-size:14px}\n.pya-checkout .pya-co__section{display:grid;gap:12px;padding:26px 0 0}\n.pya-checkout .pya-co__title{font-size:17px;font-weight:600;line-height:1.3}\n.pya-checkout .pya-co__hint{color:var(--pya-muted);font-size:13px}\n.pya-checkout .pya-co__row{display:grid;grid-template-columns:1fr 1fr;gap:12px}\n.pya-checkout :is(.pya-co__field,.order-field,.field){position:relative;display:grid;gap:2px;padding:8px 14px 9px;border:1px solid var(--pya-line);border-radius:6px;background:#fff;color:var(--pya-muted);font-size:12px;line-height:1.3;cursor:text}\n.pya-checkout :is(.pya-co__field,.order-field,.field):focus-within{border-color:var(--pya-ink);box-shadow:0 0 0 1px var(--pya-ink)}\n.pya-checkout :is(.pya-co__field,.order-field,.field) :is(input,select,textarea){display:block;width:100%;min-height:26px;padding:0;border:0;border-radius:0;background:transparent;color:var(--pya-ink);font-size:16px;line-height:1.4;outline:none;appearance:none}\n.pya-checkout :is(.pya-co__field,.order-field,.field) select{padding-right:28px;background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b6b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\") no-repeat right 0 center}\n.pya-checkout :is(.pya-co__field,.order-field,.field) textarea{min-height:56px;resize:vertical}\n.pya-checkout :is(.pya-co__field,.order-field,.field):has([aria-invalid=true]){border-color:#c0392b}\n.pya-checkout .field>label{color:var(--pya-muted);font-size:12px}\n.pya-checkout :is(.field-error,.field-hint,.hint){color:var(--pya-muted);font-size:12px}\n.pya-checkout .field-error{color:#c0392b}\n.pya-checkout .field-error:empty{display:none}\n.pya-checkout :is(fieldset[data-shipping],fieldset[data-delivery-address],fieldset[data-shipping-destination]){display:grid;gap:12px}\n.pya-checkout :is(fieldset[data-shipping],fieldset[data-delivery-address],fieldset[data-shipping-destination])>legend{margin-bottom:12px;font-size:15px;font-weight:600}\n.pya-checkout .pya-co__mirrored{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}\n.pya-checkout .pya-co__choices,.pya-checkout .pya-co__methods{display:grid;border:1px solid var(--pya-line);border-radius:6px;overflow:hidden;background:#fff}\n.pya-checkout :is(.pya-co__choice,.pya-co__method)+:is(.pya-co__choice,.pya-co__method){border-top:1px solid var(--pya-line)}\n.pya-checkout .pya-co__choice,.pya-checkout .pya-co__method>label{display:flex;align-items:center;gap:12px;min-height:56px;padding:12px 16px;cursor:pointer}\n.pya-checkout .pya-co__methods--preview .pya-co__method{display:flex;align-items:center;gap:12px;min-height:52px;padding:10px 16px}\n.pya-checkout :is(.pya-co__choice,.pya-co__method) input[type=radio]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--pya-accent)}\n.pya-checkout .pya-co__choice:has(input:checked),.pya-checkout .pya-co__method:has(input:checked)>label{background:color-mix(in srgb,var(--pya-accent) 6%,#fff);box-shadow:inset 0 0 0 1px var(--pya-accent)}\n.pya-checkout .pya-co__method-name{flex:1;min-width:0;font-size:15px}\n.pya-checkout .pya-co__method-body{display:grid;gap:10px;padding:16px;border-top:1px solid var(--pya-line);background:var(--pya-soft);font-size:14px;color:var(--pya-muted)}\n@media (prefers-reduced-motion:no-preference){.pya-checkout .pya-co__method-body{animation:pya-co-open .2s cubic-bezier(.23,1,.32,1)}}\n@keyframes pya-co-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}\n.pya-checkout .pya-co__logos{display:inline-flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}\n.pya-checkout .pya-co__logo-badge{display:inline-flex;flex:none;width:38px;height:24px;border:1px solid var(--pya-line);border-radius:4px;overflow:hidden;background:#fff}\n.pya-checkout .pya-co__logo-badge svg{display:block;width:100%;height:100%}\n.pya-checkout .pya-co__pay{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px;margin-top:24px;padding:14px 20px;border:0;border-radius:6px;background:var(--pya-accent);color:var(--pya-accent-ink);font-size:17px;font-weight:600;cursor:pointer;transition:filter .15s ease}\n.pya-checkout .pya-co__pay:hover:not(:disabled){filter:brightness(.92)}\n.pya-checkout .pya-co__pay:disabled{background:#a6a6a6;color:#fff;cursor:default}\n.pya-checkout .pya-co__pay-total{font-weight:400;opacity:.9}\n.pya-checkout .pya-co__secondary{width:100%;min-height:48px;margin-top:10px;padding:10px 16px;border:1px solid var(--pya-line);border-radius:6px;background:#fff;cursor:pointer}\n.pya-checkout .pya-co__trust{display:grid;justify-items:center;gap:8px;margin-top:16px;color:var(--pya-muted);font-size:12px;text-align:center}\n.pya-checkout .pya-co__trust>span:last-child{display:inline-flex;align-items:center;gap:6px}\n.pya-checkout .pya-co__summary{grid-column:2;grid-row:1 / -1;align-self:stretch;padding:32px var(--pya-gutter) 56px;background:var(--pya-soft);border-left:1px solid var(--pya-divider)}\n.pya-checkout .pya-co__summary-inner{position:sticky;top:24px;display:grid;gap:18px;width:min(100%,440px)}\n.pya-checkout .pya-co__photo{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:12px;background:#ececec}\n.pya-checkout .pya-co__count{color:var(--pya-muted);font-weight:400}\n.pya-checkout .pya-co__lines{display:grid;gap:16px}\n.pya-checkout .pya-co__line{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:start}\n.pya-checkout .pya-co__line:not(:has(.pya-co__thumb)){grid-template-columns:minmax(0,1fr) auto}\n.pya-checkout .pya-co__thumb{position:relative;width:64px;height:64px;border:1px solid var(--pya-divider);border-radius:8px;background:#fff}\n.pya-checkout .pya-co__thumb img{width:100%;height:100%;object-fit:cover;border-radius:7px}\n.pya-checkout .pya-co__qty{position:absolute;top:-8px;right:-8px;display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#6b6b6b;color:#fff;font-size:12px;font-weight:600}\n.pya-checkout .pya-co__line-text{display:grid;gap:2px;min-width:0;overflow-wrap:anywhere}\n.pya-checkout .pya-co__line-text small{color:var(--pya-muted);font-size:13px}\n.pya-checkout .pya-co__line-price{white-space:nowrap;font-variant-numeric:tabular-nums}\n.pya-checkout .pya-co__stepper{display:inline-flex;align-items:center;gap:4px;margin-top:6px}\n.pya-checkout .pya-co__stepper button{width:32px;min-height:32px;padding:0;border:1px solid var(--pya-line);border-radius:6px;background:#fff;cursor:pointer}\n.pya-checkout .pya-co__stepper button:disabled{opacity:.4;cursor:default}\n.pya-checkout .pya-co__stepper output{min-width:24px;text-align:center}\n.pya-checkout .pya-co__code{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:stretch}\n.pya-checkout .pya-co__code>button{min-height:48px;padding:0 16px;border:1px solid var(--pya-line);border-radius:6px;background:#ececec;color:var(--pya-ink);cursor:pointer}\n.pya-checkout .pya-co__code>p{grid-column:1 / -1;color:var(--pya-muted);font-size:13px}\n.pya-checkout .pya-co__code>p:empty{display:none}\n.pya-checkout [data-retention-recovery]{width:auto;margin:32px 0 0;padding:24px 0 0;border:0;border-top:1px solid var(--pya-divider);background:none;color:var(--pya-ink);font:inherit}\n.pya-checkout [data-retention-recovery] h3{margin:0 0 12px;font-size:15px;font-weight:600;line-height:1.3}\n.pya-checkout [data-retention-recovery] form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 8px;max-width:none}\n.pya-checkout [data-retention-recovery] .retention-consent{grid-column:1 / -1;grid-row:2;display:flex;align-items:flex-start;gap:8px;color:var(--pya-muted);font-size:12.5px;line-height:1.45}\n.pya-checkout [data-retention-recovery] input[type=checkbox]{flex:none;width:15px;height:15px;margin:1px 0 0;accent-color:var(--pya-accent)}\n.pya-checkout [data-retention-recovery] [role=status]{grid-column:1 / -1;color:var(--pya-muted);font-size:13px}\n/* Owner 2026-10-22: the reminder email and the gift card code are slim pills, each with its button beside it. */\n.pya-checkout :is(.pya-co__code .order-field,[data-retention-recovery] .retention-email){display:flex;align-items:center;min-height:44px;padding:0 18px;border:1px solid var(--pya-line);border-radius:999px;background:#fff;color:var(--pya-ink);font-size:14px;line-height:1.3;cursor:text}\n.pya-checkout :is(.pya-co__code .order-field,[data-retention-recovery] .retention-email):focus-within{border-color:var(--pya-ink);box-shadow:0 0 0 1px var(--pya-ink)}\n.pya-checkout :is(.pya-co__code .order-field,[data-retention-recovery] .retention-email) input{display:block;width:100%;min-width:0;min-height:42px;padding:0;border:0;border-radius:0;background:transparent;color:var(--pya-ink);font-size:14px;outline:none}\n.pya-checkout :is(.pya-co__code .order-field,[data-retention-recovery] .retention-email) input::placeholder{color:var(--pya-muted);opacity:1}\n.pya-checkout :is(.pya-co__code .pya-co__label,[data-retention-recovery] .retention-label){position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}\n.pya-checkout :is(.pya-co__code>button,[data-retention-recovery] button){min-height:44px;padding:0 18px;border:1px solid var(--pya-line);border-radius:999px;background:#fff;color:var(--pya-ink);font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer;transition:background .15s ease}\n.pya-checkout :is(.pya-co__code>button,[data-retention-recovery] button):hover:not(:disabled){background:var(--pya-soft)}\n@media(pointer:coarse){.pya-checkout :is(.pya-co__code .order-field,[data-retention-recovery] .retention-email) input{font-size:16px}}\n@media(max-width:480px){.pya-checkout [data-retention-recovery] form{grid-template-columns:minmax(0,1fr)}}\n.pya-checkout .pya-co__totals{display:grid;gap:10px;padding-top:4px}\n.pya-checkout .pya-co__totals :is(.order-savings,.order-total,dl>div){display:flex;justify-content:space-between;gap:16px}\n.pya-checkout .pya-co__totals>div{display:flex;justify-content:space-between;gap:16px}\n.pya-checkout .pya-co__totals .order-total{align-items:baseline;padding-top:12px;border-top:1px solid var(--pya-divider);font-size:17px;font-weight:600}\n.pya-checkout .pya-co__totals .order-total strong{font-size:24px;font-variant-numeric:tabular-nums;white-space:nowrap}\n.pya-checkout .pya-co__totals .order-total small{margin-right:6px;color:var(--pya-muted);font-size:12px;font-weight:400}\n.pya-checkout .pya-co__totals :is(.order-note,[data-bundle-quote-status],.pagosya-secure-note){color:var(--pya-muted);font-size:13px}\n.pya-checkout .pya-co__totals [data-bundle-quote-status]:empty{display:none}\n.pya-checkout .pya-co__delivery-row{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:14px 16px;border:1px solid var(--pya-line);border-radius:6px;font-size:14px}\n.pya-checkout .pya-co__delivery-row button{min-height:40px;padding:0;border:0;background:none;text-decoration:underline;text-underline-offset:3px;cursor:pointer}\n.pya-checkout .pya-co__done{display:grid;gap:16px;padding-top:12px}\n.pya-checkout .pya-co__check{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:var(--pya-accent);color:var(--pya-accent-ink)}\n.pya-checkout .pya-co__next{display:grid;gap:8px;padding-left:20px;list-style:decimal}\n.pya-checkout :is(.commerce-consent,.reminder-consent){display:flex;gap:10px;align-items:flex-start;font-size:14px}\n@media (max-width:760px){\n  .pya-checkout .pya-co__bar{padding:8px 16px}\n  .pya-checkout .pya-co__secure{font-size:0}\n  .pya-checkout .pya-co__summary-toggle{display:flex;justify-content:space-between;align-items:center;width:100%;min-height:52px;padding:12px 16px;border:0;border-bottom:1px solid var(--pya-divider);background:var(--pya-soft);color:var(--pya-ink);cursor:pointer}\n  .pya-checkout .pya-co__frame{grid-template-columns:minmax(0,1fr);grid-template-rows:none}\n  .pya-checkout .pya-co__summary{grid-column:1;grid-row:auto;order:-1;display:none;padding:20px 16px;border-left:0;border-bottom:1px solid var(--pya-divider)}\n  .pya-checkout[data-summary-open] .pya-co__summary{display:block}\n  .pya-checkout .pya-co__summary-inner{position:static;width:100%}\n  .pya-checkout .pya-co__lead,.pya-checkout .pya-co__main{grid-column:1;grid-row:auto;justify-self:stretch;width:auto;margin:0 16px}\n  .pya-checkout .pya-co__lead{padding-top:20px}\n  .pya-checkout .pya-co__row{grid-template-columns:1fr}\n}\n@media (max-width:760px) and (prefers-reduced-motion:no-preference){.pya-checkout[data-summary-open] .pya-co__summary{animation:pya-co-open .2s cubic-bezier(.23,1,.32,1)}}\n";
  const PAYMENT_LOGOS = {"logos":{"visa":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Visa\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><text x=\"19\" y=\"16.2\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"11\" font-weight=\"700\" font-style=\"italic\" letter-spacing=\".4\" fill=\"#1434CB\">VISA</text></svg>","mastercard":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Mastercard\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><circle cx=\"15\" cy=\"12\" r=\"7\" fill=\"#EB001B\"/><circle cx=\"23\" cy=\"12\" r=\"7\" fill=\"#F79E1B\"/><path d=\"M19 6.1a7 7 0 0 1 0 11.8 7 7 0 0 1 0-11.8z\" fill=\"#FF5F00\"/></svg>","amex":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"American Express\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#2E77BC\"/><text x=\"19\" y=\"15.3\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"8.5\" font-weight=\"700\" letter-spacing=\".4\" fill=\"#fff\">AMEX</text></svg>","qr":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"QR\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><g fill=\"none\" stroke=\"#1a1a1a\" stroke-width=\"1.4\"><rect x=\"11.7\" y=\"4.7\" width=\"5\" height=\"5\"/><rect x=\"21.3\" y=\"4.7\" width=\"5\" height=\"5\"/><rect x=\"11.7\" y=\"14.3\" width=\"5\" height=\"5\"/></g><g fill=\"#1a1a1a\"><rect x=\"13.5\" y=\"6.5\" width=\"1.4\" height=\"1.4\"/><rect x=\"23.1\" y=\"6.5\" width=\"1.4\" height=\"1.4\"/><rect x=\"13.5\" y=\"16.1\" width=\"1.4\" height=\"1.4\"/><rect x=\"21\" y=\"14\" width=\"2\" height=\"2\"/><rect x=\"24.5\" y=\"16.4\" width=\"2\" height=\"2\"/><rect x=\"21\" y=\"18\" width=\"2\" height=\"1.6\"/></g></svg>","tigo":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Tigo Money\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#00377B\"/><text x=\"19\" y=\"12.6\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"9\" font-weight=\"700\" fill=\"#fff\">tigo</text><text x=\"19\" y=\"19.2\" text-anchor=\"middle\" font-family=\"Arial,Helvetica,sans-serif\" font-size=\"5\" font-weight=\"700\" letter-spacing=\".6\" fill=\"#FFD100\">MONEY</text></svg>","bank":"<svg viewBox=\"0 0 38 24\" role=\"img\" aria-label=\"Transferencia bancaria\"><rect width=\"38\" height=\"24\" rx=\"4\" fill=\"#fff\"/><g fill=\"none\" stroke=\"#1a1a1a\" stroke-width=\"1.3\" stroke-linejoin=\"round\" stroke-linecap=\"round\"><path d=\"M12 10l7-4 7 4z\"/><path d=\"M13.6 11v5.6M17.2 11v5.6M20.8 11v5.6M24.4 11v5.6\"/><path d=\"M12 18.4h14\"/></g></svg>"},"methods":[{"type":"CARD","label":"Tarjeta","logos":["visa","mastercard","amex"],"note":"Paga con Visa, Mastercard o American Express."},{"type":"QR","label":"QR","logos":["qr"],"note":"Escanea el código con la app de tu banco."},{"type":"TIGO_MONEY","label":"Tigo Money","logos":["tigo"],"note":"Confirmas el pago desde tu billetera Tigo Money."},{"type":"BANK_TRANSFER","label":"Transferencia","logos":["bank"],"note":"Transfiere desde tu banco; el comercio confirma al recibirla."}]};
  // One calm checkout (spec 2026-10-20): shell pieces shared by the order review, the test payment and its confirmation.
  // The look is checkout-shell/shell.css, the same file the hosted payment page imports; stores only lend their logo,
  // name, photo and a readable accent.
  const shellStyle = document.createElement('style');
  shellStyle.setAttribute('data-pagosya-checkout-shell', '');
  shellStyle.textContent = CHECKOUT_SHELL_CSS;
  document.head.append(shellStyle);
  const LOCK_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
  const CHECK_ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const BACK_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeAssetUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try { return safeUrl(/^\/v1\//.test(value.trim()) && config.apiBaseUrl ? new URL(value.trim(), config.apiBaseUrl).href : value); } catch { return ''; }
  }
  function shellBrand() {
    const logo = storeAssetUrl(store.logoUrl);
    return `<span class="pya-co__brand">${logo ? `<img class="pya-co__logo" src="${escape(logo)}" alt="">` : ''}<strong class="pya-co__name">${escape(store.storeName || '')}</strong></span>`;
  }
  // Carrito › Entrega › Pago: the step just before the current one goes back to it.
  function shellSteps(current) {
    const steps = ['Carrito', 'Entrega', 'Pago'];
    const at = current === 'done' ? steps.length : current === 'payment' ? 2 : 1;
    return `<ol class="pya-co__steps">${steps.map((label, index) => `<li${index === at ? ' aria-current="step"' : ''}>${index === at - 1 && current !== 'done' ? `<button type="button" data-checkout-back>${label}</button>` : label}</li>`).join('')}</ol>`;
  }
  function logoBadges(names) {
    return names.map(name => PAYMENT_LOGOS.logos[name] ? `<span class="pya-co__logo-badge">${PAYMENT_LOGOS.logos[name]}</span>` : '').join('');
  }
  // The review previews how the shopper will pay; the test payment lets them pick one (nothing is charged).
  function paymentMethodsList(selectable, selected = PAYMENT_LOGOS.methods[0].type) {
    if (!selectable) return `<ul class="pya-co__methods pya-co__methods--preview">${PAYMENT_LOGOS.methods.map(method => `<li class="pya-co__method"><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></li>`).join('')}</ul>`;
    return `<div class="pya-co__methods" role="radiogroup" aria-label="Método de pago">${PAYMENT_LOGOS.methods.map(method => `<div class="pya-co__method"><label><input type="radio" name="demoPaymentMethod" value="${method.type}"${method.type === selected ? ' checked' : ''}><span class="pya-co__method-name">${escape(method.label)}</span><span class="pya-co__logos">${logoBadges(method.logos)}</span></label>${method.type === selected ? `<div class="pya-co__method-body"><p>${escape(method.note)}</p><p>Es una prueba: no se cobra nada.</p></div>` : ''}</div>`).join('')}</div>`;
  }
  function trustStrip() {
    const names = [...new Set(PAYMENT_LOGOS.methods.flatMap(method => method.logos))];
    return `<div class="pya-co__trust"><span class="pya-co__logos">${logoBadges(names)}</span><span>${LOCK_ICON} Pago seguro procesado por pagosYa</span></div>`;
  }
  const parseRgb = text => { const value = String(text), n = value.match(/[\d.]+/g); return /^rgba?\(/.test(value) && n && n.length >= 3 && (n[3] === undefined || Number(n[3]) === 1) ? n.slice(0, 3).map(Number) : null; };
  function contrastRatio(a, b) {
    const lum = c => { const [r, g, bl] = c.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * bl; };
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + .05) / (y + .05);
  }
  // The store's accent paints the pay button and the chosen radio only when it reads: its text at 4.5:1 and the button
  // at 3:1 on the white page. Otherwise ink. The browser resolves whatever colour syntax the store used.
  function shellAccent(root) {
    let accent = null, ink = null;
    try {
      const probe = document.createElement('span');
      probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--store-accent,var(--brand-accent,var(--accent,#1a1a1a)))';
      document.body.append(probe);
      accent = parseRgb(getComputedStyle(probe).color);
      probe.style.color = 'var(--store-accent-foreground,var(--brand-accent-foreground,#ffffff))';
      ink = parseRgb(getComputedStyle(probe).color);
      probe.remove();
      // Stores without accent tokens often colour their action through .checkout-button (as the product page reads it).
      const root = getComputedStyle(document.documentElement);
      if (!['--store-accent', '--brand-accent', '--accent'].some(name => root.getPropertyValue(name).trim())) {
        const action = Object.assign(document.createElement('button'), { className: 'checkout-button', type: 'button' });
        action.style.cssText = 'display:block!important;position:absolute;visibility:hidden;pointer-events:none';
        document.body.append(action);
        const styles = getComputedStyle(action), background = parseRgb(styles.backgroundColor);
        if (background) { accent = background; ink = parseRgb(styles.color); }
        action.remove();
      }
    } catch { /* No colour to read: ink. */ }
    const readable = accent && ink && contrastRatio(accent, ink) >= 4.5 && contrastRatio(accent, [255, 255, 255]) >= 3;
    root.style.setProperty('--pya-accent', readable ? `rgb(${accent.join(',')})` : '#1a1a1a');
    root.style.setProperty('--pya-accent-ink', readable ? `rgb(${ink.join(',')})` : '#ffffff');
  }
  // Everything around the open checkout leaves the tab order: its own siblings and those of every ancestor.
  function inertAround(node, saved) {
    for (let child = node; child && child !== document.body && child.parentElement; child = child.parentElement) {
      for (const sibling of child.parentElement.children) if (sibling !== child && !saved.has(sibling) && !sibling.matches('script,style,template')) { saved.set(sibling, sibling.inert); sibling.inert = true; }
    }
  }
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('[data-shell-summary]');
    if (!toggle) return;
    const root = toggle.closest('.pya-checkout');
    const open = !root.hasAttribute('data-summary-open');
    root.toggleAttribute('data-summary-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('[data-shell-summary-label]').textContent = open ? 'Ocultar resumen del pedido' : 'Ver resumen del pedido';
  });
  function checkoutPhoto(firstLineImage) { return storeAssetUrl(store.bannerUrl) || firstLineImage || ''; }
  function shellLineMarkup({ id, p, name, amount, quantity, image, option, unit, stock, canAdd }) {
    return `<li class="pya-co__line" data-part="cart-line">${image ? `<span class="pya-co__thumb"><img src="${escape(image)}" alt="" loading="lazy"><b class="pya-co__qty" aria-label="Cantidad ${quantity}">${quantity}</b></span>` : ''}<span class="pya-co__line-text"><strong>${escape(p.name)}</strong>${option ? `<small>${escape(option)}</small>` : ''}${unit ? `<small>${escape(unit)}</small>` : ''}${stock ? `<small class="order-item__stock">${escape(stock)}</small>` : ''}<span class="pya-co__stepper"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}"${canAdd ? '' : ' disabled'}>+</button></span></span><span class="pya-co__line-price">${money(amount * quantity, p.currency)}</span></li>`;
  }
  // The review's controls keep their names and listeners; this only moves them into the shell's two columns.
  function shapeShellReview(el, { mode, count, photo }) {
    const take = selector => [...el.children].filter(child => child.matches(selector));
    const aside = document.createElement('aside');
    aside.className = 'pya-co__summary'; aside.id = 'pya-co-summary'; aside.setAttribute('aria-label', 'Resumen del pedido');
    const inner = document.createElement('div'); inner.className = 'pya-co__summary-inner';
    inner.innerHTML = `${photo ? `<img class="pya-co__photo" src="${escape(photo)}" alt="">` : ''}<h2 class="pya-co__title">${escape(CART_WORD || 'Tu pedido')}${count ? ` <span class="pya-co__count">· ${count} ${count === 1 ? 'producto' : 'productos'}</span>` : ''}</h2>`;
    inner.append(...take('.pya-co__lines,.order-recommendations'));
    const credit = el.querySelector('[name=creditCode]')?.closest('label');
    if (credit) { const code = document.createElement('div'); code.className = 'pya-co__code'; code.append(credit, ...[el.querySelector('[data-credit-apply]'), el.querySelector('[data-credit-status]')].filter(Boolean)); inner.append(code); }
    const totals = document.createElement('div'); totals.className = 'pya-co__totals';
    totals.append(...take('.pagosya-secure-note,.order-savings,.order-total,.order-note,[data-bundle-quote-status]'));
    inner.append(totals); aside.append(inner);
    const main = document.createElement('div'); main.className = 'pya-co__main';
    const delivery = take('label.order-field,fieldset[data-delivery-address],fieldset[data-shipping]');
    if (delivery.length) {
      const section = document.createElement('section'); section.className = 'pya-co__section'; section.setAttribute('aria-labelledby', 'pya-co-delivery');
      section.innerHTML = '<h2 class="pya-co__title" id="pya-co-delivery">Entrega</h2>';
      section.append(...delivery);
      main.append(section);
      if (mode !== 'review') {
        section.hidden = true;
        const chosen = checkoutAnswers.get('method') === 'delivery' ? 'Envío a domicilio' : checkoutAnswers.get('method') === 'pickup' ? 'Recoger en tienda' : '';
        if (chosen && mode === 'payment') main.insertAdjacentHTML('beforeend', `<section class="pya-co__section"><h2 class="pya-co__title">Entrega</h2><div class="pya-co__delivery-row"><span>${escape(chosen)}</span><button type="button" data-checkout-back>Cambiar</button></div></section>`);
      }
    }
    const paying = store.checkoutMode !== 'whatsapp' && store.checkoutMode !== 'external';
    if (mode === 'review' && paying) main.insertAdjacentHTML('beforeend', `<section class="pya-co__section" data-pya-pay-preview><h2 class="pya-co__title">Pago</h2><p class="pya-co__hint">Eliges cómo pagar en el siguiente paso.</p>${paymentMethodsList(false)}</section>`);
    if (mode === 'payment') main.insertAdjacentHTML('beforeend', `<section class="pya-co__section"><h2 class="pya-co__title">Pago</h2>${paymentMethodsList(true, checkoutAnswers.get('demoPaymentMethod') || undefined)}</section>`);
    if (mode === 'done') main.insertAdjacentHTML('beforeend', `<div class="pya-co__done"><span class="pya-co__check">${CHECK_ICON}</span><p><strong>Pedido de prueba</strong></p><ol class="pya-co__next"><li>El comercio confirma tu pago.</li><li>Prepara tu pedido.</li><li>Te avisa cuando sale o está listo para recoger.</li></ol></div>`);
    const button = take('.pya-co__pay')[0];
    main.append(...take('.commerce-consent'));
    if (button) { main.append(button); if (mode !== 'done' && paying) main.insertAdjacentHTML('beforeend', trustStrip()); }
    const feedback = document.createElement('p'); feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
    main.append(feedback, ...[...el.children].filter(child => child !== aside && child !== main));
    el.replaceChildren(main, aside);
    el.classList.add('checkout-review');
  }
  // Delivery reads as radio cards; the select stays the one source the shipping and submit code read.
  function mirrorChoices(el) {
    const select = el.querySelector('select[name=method]');
    const label = select?.closest('label');
    el.querySelector('.pya-co__choices')?.remove();
    if (!select || !label) return;
    label.classList.add('pya-co__mirrored'); label.setAttribute('aria-hidden', 'true'); select.tabIndex = -1;
    const group = document.createElement('div');
    group.className = 'pya-co__choices'; group.setAttribute('role', 'radiogroup'); group.setAttribute('aria-label', 'Entrega');
    group.innerHTML = [...select.options].map(option => `<label class="pya-co__choice"><input type="radio" name="pyaDeliveryChoice" value="${escape(option.value)}"${option.value === select.value ? ' checked' : ''}><span class="pya-co__method-name">${escape(option.textContent)}</span></label>`).join('');
    group.addEventListener('change', event => { select.value = event.target.value; select.dispatchEvent(new Event('change', { bubbles: true })); });
    label.after(group);
  }
  // Shipping and pack quotes rewrite .order-total; the pay button and the phone bar repeat whatever it says.
  function syncShellTotals(el) {
    const root = el.closest('.pya-checkout');
    const total = el.querySelector('.order-total strong');
    if (!root || !total) return;
    const copy = () => { const text = total.textContent.trim(); const bar = root.querySelector('[data-shell-total]'); if (bar) bar.textContent = text; const pay = el.querySelector('.pya-co__pay-total'); if (pay) pay.textContent = text ? `· ${text}` : ''; };
    el._shellTotals?.disconnect();
    if (typeof MutationObserver === 'function') { el._shellTotals = new MutationObserver(copy); el._shellTotals.observe(total, { childList: true, characterData: true, subtree: true }); }
    copy();
  }
  document.addEventListener('change', event => { if (event.target.name === 'demoPaymentMethod') { checkoutAnswers.set('demoPaymentMethod', event.target.value); renderCart(); } });
  const shoppingStyle = document.createElement('style');
  // Kit defaults for the cart, the added notice and the order review: low priority, so the store's own CSS
  // (and its DNA) restyle them. Layered !important declarations still outrank authored ones.
  shoppingStyle.textContent = `@layer pagosya-commerce {
    .cart-drawer{box-sizing:border-box;position:fixed;inset:0 0 0 auto;width:min(760px,max(420px,50vw));max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--store-background,var(--brand-background,var(--paper,Canvas)));color:var(--store-foreground,var(--brand-foreground,var(--ink,CanvasText)));font:inherit;overflow:auto;overscroll-behavior:contain;transform:translateX(0);transition:transform var(--motion-base,250ms) var(--ease-drawer,cubic-bezier(.32,.72,0,1)),opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),display var(--motion-base,250ms) allow-discrete,overlay var(--motion-base,250ms) allow-discrete}
    .cart-drawer:not([open]){transform:translateX(100%);opacity:0}
    /* The kit's own dialog keeps its place, size and visibility whatever a design says about .cart-drawer: florart
       2026-10-18 hid its own panel off-screen until its script added body.cart-open, so the kit's cart opened as an
       invisible modal and the page froze. Layered !important outranks every store rule; colours, borders, padding and
       motion stay the store's. Half the screen, the whole width on a phone (owner 2026-10-17). */
    dialog[data-pagosya-drawer]{position:fixed!important;inset:0 0 0 auto!important;box-sizing:border-box!important;width:min(760px,max(420px,50vw))!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;margin:0!important;overflow:auto!important;visibility:visible!important;clip-path:none!important;pointer-events:auto!important}
    dialog[data-pagosya-drawer][open]{display:block!important;opacity:1!important;transform:none!important}
    dialog[data-pagosya-drawer]:not([open]){display:none!important;opacity:0!important;transform:translateX(100%)!important}
    @starting-style{dialog[data-pagosya-drawer][open]{opacity:0!important;transform:translateX(100%)!important}}
    @media(max-width:700px){dialog[data-pagosya-drawer]{width:100vw!important}}
    /* Inside the dialog, the store's cart mount and a template's panel are its content, never a second drawer: Pokeate
       2026-10-18 kept a fixed 440px .cart-runtime panel in styles.css and its cart template was a fixed 50vw aside, so the
       cart drew as two overlapping columns with the text across both. A template is the whole design, so the mount around
       it also gives up its own padding and paint. */
    dialog[data-pagosya-drawer] :is([data-pagosya-cart],[data-cart-panel]){position:relative!important;inset:auto!important;z-index:auto!important;box-sizing:border-box!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;transform:none!important;overflow:visible!important}
    dialog[data-pagosya-drawer][data-template] :is([data-pagosya-cart],[data-cart-panel]){min-height:100dvh!important}
    dialog[data-pagosya-drawer][data-template] [data-pagosya-cart]{padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
    /* An added template that positions itself (fixed, absolute) keeps its own place: the DNA notice (a ribbon, a bubble, a
       stamp…) only carries it, with no box, paint or transform of its own, since a transformed carrier re-anchors the
       template's position:fixed to itself (Pokeate 2026-10-18: the card drew 164px above the screen under an empty 29px
       ribbon). The carrier lets clicks through. A template in the flow still sits in the DNA notice and wears its paint. */
    .cart-added[data-template-placed]{padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;transform:none!important;filter:none!important;pointer-events:none!important}
    .cart-added[data-template-placed]::before{content:none!important}
    .cart-added[data-template-placed]>*{pointer-events:auto}
    /* The cart is a half-screen panel, so it reads in one column (owner 2026-10-17): a store template drawn as a page with a
       side summary stacks inside it. Each declaration is inert on an element that is not a grid or flex container. */
    .cart-drawer :is([data-cart-panel],[data-cart-panel] *):has([data-cart-slot=lines]):has([data-cart-slot=total]){grid-template-columns:minmax(0,1fr)!important;grid-template-rows:none!important;grid-template-areas:none!important;flex-direction:column!important}
    /* A money figure never breaks mid-number («Bs 20,0 / 0» on a phone, FLORZ 2026-10-17). */
    .cart-drawer :is([data-cart-field=line-total],[data-cart-field=unit]){white-space:nowrap!important}
    .cart-drawer :is([data-cart-panel],[data-cart-panel] *):has([data-cart-slot=lines]):has([data-cart-slot=total])>*{grid-column:auto!important;grid-row:auto!important;order:0!important}
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
    /* The store's CSS reset clears borders and button fills after these rules load; the search keeps its own (2026-10-28). */
    form[role=search]{position:relative}
    .pagosya-suggest{position:absolute;z-index:60;top:calc(100% + 8px);left:0;right:0;min-width:280px;max-height:min(70vh,520px);overflow:auto;margin:0;padding:6px;list-style:none;border-radius:14px;background:var(--es-paper,#fff);color:var(--es-ink,inherit);box-shadow:0 18px 50px -18px #0006,0 0 0 1px color-mix(in srgb,currentColor 10%,transparent);text-align:left}
    .pagosya-suggest a{display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;color:inherit;text-decoration:none;outline:none}
    .pagosya-suggest a:is(:hover,:focus-visible){background:color-mix(in srgb,currentColor 7%,transparent)}
    .pagosya-suggest img,.pagosya-suggest__blank{flex:none;width:44px;height:44px;border-radius:8px;object-fit:cover;background:color-mix(in srgb,currentColor 8%,transparent)}
    .pagosya-suggest strong{display:block;font-size:14px;font-weight:600;line-height:1.3}.pagosya-suggest small{display:block;font-size:13px;opacity:.7}
    .pagosya-suggest__all a{justify-content:center;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:.25em}
    .pagosya-info:has(.pagosya-search){max-width:none}
    .pagosya-search{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;margin:8px 0 18px}
    .pagosya-search label{display:grid;gap:8px;flex:1 1 320px;font-size:14px;font-weight:600}
    .pagosya-search input{box-sizing:border-box;width:100%;min-height:48px;padding:0 18px!important;border:1px solid color-mix(in srgb,currentColor 22%,transparent)!important;border-radius:999px;background:var(--es-paper,transparent)!important;color:inherit;font:inherit;font-weight:400}
    .pagosya-search input:focus-visible{outline:2px solid var(--es-accent,currentColor);outline-offset:2px}
    .pagosya-search>button{min-height:48px;padding:0 24px!important;border:0;border-radius:999px;background:var(--es-accent,#111)!important;color:var(--es-on-accent,#fff)!important;font:inherit;font-weight:600;cursor:pointer}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:24px;padding:0!important;margin-inline:0!important}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards img{border-radius:var(--es-radius,14px)}
    .pagosya-info:has(.pagosya-search) .pagosya-info__cards strong{font-weight:600;text-decoration:none}
    .pagosya-search__tools{display:grid;gap:12px;margin:0 0 18px}.pagosya-search__row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .pagosya-search__sort>span{margin-right:4px;font-size:13px;font-weight:600;opacity:.7}
    .pagosya-search__chip{display:inline-flex;align-items:center;min-height:36px;padding:0 16px!important;border:1px solid color-mix(in srgb,currentColor 18%,transparent)!important;border-radius:999px;color:inherit;font-size:14px;text-decoration:none!important;white-space:nowrap}
    .pagosya-search__chip:hover{border-color:currentColor!important}
    .pagosya-search__chip[aria-current]{background:var(--es-ink,#111)!important;border-color:var(--es-ink,#111)!important;color:var(--es-paper,#fff)!important}
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
    /* A store grid drawn for a photo column (78px 1fr) would put a photo-less line's text in that column: span it. */
    .order-items .order-item:not([data-has-image])>.order-item__body{grid-column:1/-1}
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
    /* Small kit text keeps normal spacing: a heading's em tracking is inherited as pixels (FLORZ 2026-10-17: -.04em at 66px
       reached the 12px «Vista previa · Sin cobros» as -2.64px and fused the words). A store's own rule still wins. */
    .order-note,[data-pagosya-status],[data-pagosya-checkout-status]{letter-spacing:normal}
    .cart-drawer .checkout-button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:16px 20px;border:0;background:var(--store-accent,var(--brand-accent,var(--accent,var(--ink,#20211d))));color:var(--store-accent-foreground,var(--brand-accent-foreground,var(--paper,#fff)))}
    .cart-drawer button:disabled{opacity:.5;cursor:default}.cart-drawer>.cart-drawer__continue{display:block!important;position:static!important;float:none!important;box-sizing:border-box!important;width:calc(100% - 64px)!important;max-width:none!important;margin:0 32px 32px!important;padding:10px 0;border:0;background:transparent;text-align:center!important;text-decoration:underline;text-underline-offset:4px}.cart-drawer[data-template]>:is(.cart-drawer__header,.cart-drawer__continue,.pagosya-policies){display:none!important}.cart-drawer[data-template] .cart-drawer__body{padding:0}
    .cart-drawer :focus-visible,.cart-added :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    /* Trust block (pages/policy-links.js renderTrust): emoji points on cards that take the section's own colours and type. */
    :is([data-pagosya-trust],[data-pagosya-trust-section])[hidden]{display:none!important}
    [data-pagosya-trust]{box-sizing:border-box;grid-column:1/-1;flex:1 1 100%;width:100%}
    .pagosya-trust__list{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:16px;margin:28px 0 0;padding:0;list-style:none}
    .pagosya-trust__item{display:flex;margin:0;padding:0}
    .pagosya-trust__card{box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;gap:6px;width:100%;margin:0;padding:22px 20px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:var(--kit-radius-panel,16px);background:color-mix(in srgb,currentColor 4%,transparent);color:inherit;font:inherit;text-align:left;text-decoration:none}
    :is(a,button).pagosya-trust__card{cursor:pointer;transition:border-color var(--motion-fast,200ms) ease,transform var(--motion-fast,200ms) ease}
    @media(hover:hover){:is(a,button).pagosya-trust__card:hover{border-color:color-mix(in srgb,currentColor 40%,transparent);transform:translateY(-2px)}}
    .pagosya-trust__emoji{font-size:30px;line-height:1;margin-bottom:8px}
    .pagosya-trust__card strong{font-size:1.05em;line-height:1.3}
    .pagosya-trust__detail{font-size:.95em;line-height:1.5;opacity:.78;overflow-wrap:anywhere}
    .pagosya-trust__card:focus-visible{outline:3px solid currentColor;outline-offset:3px}
    .cart-added{position:fixed;inset:auto 24px 24px auto;z-index:2147483001;display:flex;align-items:center;gap:20px;max-width:min(480px,calc(100vw - 48px));padding:12px 16px;background:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));color:var(--store-background,var(--brand-background,var(--paper,#fff)));font:inherit;box-shadow:0 8px 24px #0002;opacity:0;transform:translateY(12px);visibility:hidden;transition:opacity var(--motion-fast,200ms) var(--ease-out,cubic-bezier(.23,1,.32,1)),transform var(--motion-fast,200ms) var(--motion-ease,var(--ease-out,cubic-bezier(.23,1,.32,1))),visibility var(--motion-fast,200ms)}
    .cart-added[data-visible=true]{opacity:1;transform:translateY(0);visibility:visible}.cart-added span{overflow-wrap:anywhere}.cart-added button{flex-shrink:0;min-height:44px;background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:4px}
    @media(max-width:700px){.cart-drawer{width:100vw}.cart-drawer__header{padding:20px}.cart-drawer__body{padding:8px 20px 24px}.cart-drawer>.cart-drawer__continue{width:calc(100% - 40px)!important;margin:0 20px 24px!important}.cart-added{inset:auto 12px 12px;max-width:none;gap:12px}}
    .cart-drawer[data-instant=true],.cart-added[data-instant=true]{transition:none}[data-cart-count]{display:inline-block}
    @media(prefers-reduced-motion:reduce){.cart-drawer,.cart-added{transition:none;transform:none}}
  `;
  shoppingStyle.textContent += `
    @layer pagosya-commerce {
    /* The calm checkout (checkout/shell.js, checkout-shell/shell.css) draws the review; the review must still never take an
       authored fixed drawer's geometry. */
    [data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{position:static!important;inset:auto!important;z-index:auto;width:100%!important;min-width:0;max-width:none;height:auto!important;min-height:0;max-height:none;margin:0;padding:0;overflow:visible!important;transform:none;box-shadow:none;border:0;background:transparent;color:inherit;opacity:1;visibility:visible}
  }`;
  document.head.append(shoppingStyle);
  let checkoutTrigger = null, checkoutPreviousHash = "", checkoutOverflow = "";
  const inertBeforeCheckout = new Map();
  const checkoutAnswers = new Map();
  const rememberCheckout = panel => panel.querySelectorAll('input[name],textarea[name],select[name]').forEach(field => { if (field.name !== 'shippingZoneId') checkoutAnswers.set(field.name, field.value); });
  document.addEventListener('input', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  document.addEventListener('change', event => { const panel = event.target.closest('[data-checkout-review]'); if (panel) rememberCheckout(panel); });
  function showCheckout(mode = 'review') {
    // Opening the review also changes the hash; preserve fields on that second notification.
    if (!checkoutPage.hidden && checkoutPage.dataset.mode === mode) return;
    checkoutPage.dataset.mode = mode;
    // The calm checkout covers the whole page, an authored checkout page too: what is around it leaves the tab order.
    if (checkoutPage.hidden) { checkoutOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; inertAround(checkoutPage, inertBeforeCheckout); }
    checkoutPage.hidden = false;
    checkoutPage.classList.add('pya-checkout');
    const back = fullCheckoutPage && mode === 'review' ? `<a class="pya-co__back" href="index.html">${BACK_ICON} Seguir comprando</a>` : `<button class="pya-co__back" type="button" ${mode === 'done' ? 'data-shell-close' : 'data-checkout-back'}>${BACK_ICON} ${mode === 'payment' ? 'Volver a la entrega' : 'Seguir comprando'}</button>`;
    const heading = mode === 'payment' ? 'Pago de prueba' : mode === 'done' ? '¡Gracias por tu compra!' : 'Revisa tu pedido';
    const note = mode === 'payment' ? 'Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.' : preview || config.demo ? 'Vista previa · Sin cobros' : '';
    checkoutPage.innerHTML = `<header class="pya-co__bar">${back}${shellBrand()}<span class="pya-co__secure">${LOCK_ICON} Pago seguro</span></header><button type="button" class="pya-co__summary-toggle" aria-expanded="false" aria-controls="pya-co-summary" data-shell-summary><span data-shell-summary-label>Ver resumen del pedido</span><strong data-shell-total></strong></button><div class="pya-co__frame"><div class="pya-co__lead">${shellSteps(mode)}<h1 tabindex="-1">${heading}</h1>${note ? `<p class="pya-co__note order-note">${note}</p>` : ''}<p class="pya-co__status" data-pagosya-status role="status" aria-live="polite"></p></div><div data-pagosya-cart data-checkout-review="${mode}"></div></div>`;
    shellAccent(checkoutPage);
    renderCart();
    // Moving focus is for the overlay, which opens over the page. A full checkout page is simply loaded, and
    // scripted focus there paints a keyboard ring around the title for mouse and touch users.
    if (checkoutPage !== fullCheckoutPage || mode !== 'review') checkoutPage.querySelector("h1")?.focus({ preventScroll: true });
    checkoutPage.scrollTop = 0;
  }
  function closeCheckout() {
    if (checkoutPage.hidden) return;
    checkoutPage.hidden = true; checkoutPage.innerHTML = ""; checkoutPage.classList.remove("pya-checkout"); delete checkoutPage.dataset.mode;
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
    else if (location.hash === "#pago-de-prueba" && (preview || config.demo)) showCheckout('payment');
    else if (location.hash === "#pedido-de-prueba" && (preview || config.demo)) showCheckout('done');
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
      // The colour option's own value travels to the product page (owner 2026-10-25: a picked colour opened another one).
      const colourValue = (Array.isArray(v.options) ? v.options : []).find(o => typeof o?.name === 'string' && /^colou?r$/i.test(o.name.trim()) && typeof o.value === 'string')?.value;
      list.push({ url, name: v.name, ...(colourValue ? { value: colourValue } : {}), color: (Array.isArray(v.options) ? v.options : []).map(o => typeof o?.name === 'string' && typeof o?.value === 'string' ? swatchColor(o.name, o.value) : '').find(Boolean) || '' });
    }
    return list.length > 1 ? list : [];
  }
  // Browse stores (spec 2026-11-06, the Nike shop page): every card with two colour photos or more shows them as a strip of up to
  // six thumbnails, «+N» after, whatever the DNA; a card without them is unchanged.
  const browseCards = () => config.filterStyle === 'browse';
  const STRIP_CAP = 6;
  function cardPreview(p, image) {
    if (image && browseCards()) { const all = cardSwatches(p); return all.length ? { swatches: all.slice(0, STRIP_CAP), more: all.length - STRIP_CAP, strip: true } : {}; }
    const mode = cardMode();
    if (!image || !mode) return {};
    if (mode === 'second-photo') { const alt = galleryImages(p).find(url => url !== image); return alt ? { alt } : {}; }
    if (mode === 'swatch-swap') { const swatches = cardSwatches(p).slice(0, 4); return swatches.length ? { swatches } : {}; }
    if (mode === 'quick-look' && !fullProductPage) return { chip: true };
    return {};
  }
  // The second photo is fetched only when the shopper reaches the card (pointer, focus or touch): see loadCardAlt.
  const CARD_SIZES = '(max-width: 820px) 50vw, 25vw';
  const cardAltMarkup = url => `<img class="menu-item__image-alt" data-src="${escape(url)}"${responsiveSrcset(url) ? ` data-srcset="${escape(responsiveSrcset(url))}" data-sizes="${CARD_SIZES}"` : ''} alt="" aria-hidden="true" decoding="async">`;
  // Swatch thumbnails are 22px: the smallest rendition is enough. A browse strip always shows the colour's photo, 56px.
  const cardSwatchMarkup = (p, swatches, more = 0, strip = false) => `<div class="menu-item__swatches${strip ? ' menu-item__swatches--strip' : ''}" role="group" aria-label="Variantes de ${escape(p.name)}">${swatches.map(s => { const dot = s.color && !strip; return `<button type="button" data-card-swatch="${escape(s.url)}"${s.value ? ` data-card-colour="${escape(s.value)}"` : ''} aria-label="Ver ${escape(s.name)}" aria-pressed="false"><span${dot ? ` style="--swatch:${escape(s.color)}"` : ''}>${dot ? '' : `<img src="${escape(s.url)}"${responsiveAttrs(s.url, strip ? '56px' : '22px')} alt="" loading="lazy" decoding="async">`}</span></button>`; }).join('')}${more > 0 ? `<span class="menu-item__swatches-more">+${more}</span>` : ''}</div>`;
  // A sale's old price sits inside the price element, so an authored card layout gains no new item to place. The space before
  // it lets it drop to its own line on a narrow card instead of running into the add button.
  const cardOriginalMarkup = p => !isMembership(p) && price(p) < p.amount ? ` <del class="menu-item__original" aria-label="Precio anterior">${money(p.amount, p.currency)}</del>` : '';
  const cardChipMarkup = p =>`<button type="button" class="menu-item__quick-look" data-product="${escape(p.id)}" aria-label="Vista rápida de ${escape(p.name)}">Vista rápida</button>`;
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
    // Showcase commerce: optional fields an authored card may place; each is hidden when there is nothing true to say.
    const parts = cardInsides(p);
    const set = (name, html, empty) => { const node = field(name); if (!node) return; node.innerHTML = html; node.hidden = empty; };
    set('eyebrow', escape(parts.eyebrow), !parts.eyebrow);
    set('points', parts.points.map(t => `<li>${escape(t)}</li>`).join(''), !parts.points.length);
    set('chips', chipsHtml(parts), !parts.chips.length);
    set('deal', escape(parts.deal), !parts.deal);
    set('save', escape(parts.save), !parts.save);
    field('price').insertAdjacentHTML('beforeend', cardOriginalMarkup(p));
    fill('description', p.description && p.description.trim() !== p.name.trim() ? p.description : '', 'menu-item__description');
    const photo = field('image');
    if (photo) {
      if (photo.tagName !== 'IMG') { document.documentElement.dataset.productTemplateInvalid = 'true'; return null; }
      photo.hidden = !image;
      if (image) { const set = responsiveSrcset(image); if (set) { photo.srcset = set; photo.sizes = '(max-width: 820px) 50vw, 33vw'; } photo.src = image; photo.alt = p.name; photo.loading = 'lazy'; photo.decoding = 'async'; photo.style.objectPosition = imagePosition(p, image); }
      else photo.removeAttribute('src');
      photo.classList.add('menu-item__image');
      // A product without a photo: its frame carries the name's first letter, so a template can draw a tile, not a grey box.
      if (image) photo.parentElement?.removeAttribute('data-product-initial');
      else photo.parentElement?.setAttribute('data-product-initial', (p.name || '').trim().charAt(0).toLocaleUpperCase('es'));
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
      const markup = cardSwatchMarkup(p, cardExtras.swatches, cardExtras.more, cardExtras.strip);
      // A browse strip sits under the photo, outside any link or button that wraps it; the dots after the price.
      let after = field('price');
      if (cardExtras.strip) { after = root.querySelector('.menu-item__image'); for (let el = after?.parentElement; el && el !== root; el = el.parentElement) if (el.matches('a,button')) after = el; }
      if (after && (cardExtras.strip || !after.closest('a,button'))) after.insertAdjacentHTML('afterend', markup); else root.insertAdjacentHTML('beforeend', markup);
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
    // A round icon button (Esencial's «+») keeps its icon: «Elegir opciones» or «Agotado» squeezed into a 44 px circle spilled out
    // of it (Gramiyaa 2026-10-26). The aria-label carries the words; the product page opens the same way.
    const iconOnly = !buy.textContent.trim() && !!buy.querySelector('svg,img');
    const face = text => { if (!iconOnly) buy.textContent = text; };
    if (isMembership(p)) {
      buy.dataset.product = p.id; buy.disabled = false; face('Hacerme miembro');
      buy.setAttribute('aria-label', `Hacerme miembro de ${p.name}`);
    } else {
    buy.dataset.add = p.id; buy.disabled = !ready || soldOut(p) || complex;
    buy.setAttribute('aria-label', `${complex ? 'Elegir opciones de' : 'Añadir'} ${p.name}`);
    if (soldOut(p)) { face('Agotado'); if (iconOnly) buy.setAttribute('aria-label', `${p.name} agotado`); root.dataset.soldOut = 'true'; }
    else if (complex && (optionGroups(p) || boxGroup(p))) {
      delete buy.dataset.add; buy.dataset.product = p.id; buy.disabled = false;
      face('Elegir opciones');
    }
    else if (complex) {
      face('Elegir opciones');
      if (!preview && !config.demo) {
        const link = document.createElement('a');
        for (const attr of [...buy.attributes]) if (!['disabled', 'type', 'data-add'].includes(attr.name)) link.setAttribute(attr.name, attr.value);
        link.href = safeUrl(hostedProduct(p.id));
        if (iconOnly) link.append(...buy.childNodes); else link.textContent = 'Elegir opciones';
        buy.replaceWith(link);
      }
    }
    }
    return root.outerHTML;
  }
  // The price sits beside .menu-item__copy, not inside it, so a store that pads only the copy leaves the price on the
  // card edge (night run 2026-10-11). Line its start up with the product name; a price laid out elsewhere is left alone.
  function alignCardPrices() {
    document.querySelectorAll('.menu-item').forEach(card => {
      const name = card.querySelector('.menu-item__copy h3'), price = card.querySelector('.menu-item__price');
      if (!name || !price) return;
      price.style.marginInlineStart = '';
      const gap = name.getBoundingClientRect().left - price.getBoundingClientRect().left;
      const card0 = card.getBoundingClientRect().left;
      // Only a price flush with the card edge, inside the name's padding: never a price placed on the right or below a photo column.
      if (gap > 2 && gap < 64 && price.getBoundingClientRect().left - card0 < 4) price.style.marginInlineStart = `${(parseFloat(getComputedStyle(price).marginInlineStart) || 0) + gap}px`;
    });
  }
  // A photo bled to the card edges with negative margins, capped by a reset's img{max-width:100%}, stops short of the
  // right edge (night run 2026-10-11): release the cap so it reaches both edges. A photo without a bleed is left alone.
  function fitCardPhotos() {
    document.querySelectorAll('.menu-item img.menu-item__image').forEach(img => {
      if (img.style.maxWidth === 'none' || parseFloat(getComputedStyle(img).marginLeft) >= 0) return;
      const card = img.closest('.menu-item').getBoundingClientRect(), box = img.getBoundingClientRect();
      if (box.width && (card.right - box.right) - (box.left - card.left) > 6) img.style.maxWidth = 'none';
    });
  }
  // The card's add button is an icon-only "+". A store that decorates it with a symbol of its own (a split "+" cell drawn
  // with ::after) drew it for a word label, so give it one instead of showing "+ | +".
  function labelDecoratedAddButtons() {
    document.querySelectorAll('.menu-add[data-add]').forEach(button => {
      if ((button.textContent || '').trim() || !button.querySelector('svg')) return;
      if (['::before', '::after'].some(pseudo => /^["'].*\S.*["']$/.test(getComputedStyle(button, pseudo).content))) button.textContent = 'Añadir';
    });
  }
  function fitCards() { labelDecoratedAddButtons(); fitCardPhotos(); alignCardPrices(); }
  if (typeof addEventListener === 'function') addEventListener('resize', () => fitCards(), { passive: true });
  const BAG_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 8.5h13l-1 11.5h-11z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/></svg>';
  // ---- Fashion card (spec 2026-10-21 fashion look, the John Smedley card) ----
  // A tinted photo panel with one tag, the name and price on one row, «N colores», colour bars on hover. No add
  // button: clothing needs a size first, so the whole card opens the product.
  const COLOUR_GROUP = /^(colou?r|colores|tono)$/;
  const SIZE_GROUP = /^(tallas?|size|medida)$/;
  const groupKey = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const colourGroupIndex = groups => (groups || []).findIndex(group => COLOUR_GROUP.test(groupKey(group.name)));
  const sizeGroupIndex = groups => (groups || []).findIndex(group => SIZE_GROUP.test(groupKey(group.name)));
  const fashionCards = () => config.showcase?.cards === 'fashion';
  function fashionColours(p) {
    const groups = optionGroups(p), index = colourGroupIndex(groups);
    if (index < 0) return [];
    const alt = galleryImages(p)[1] || '';
    return groups[index].values.map(value => {
      const own = (p.variants || []).find(v => variantValues(v)[index] === value && variantPhotos(v)[0]);
      return { value, color: swatchColor(groups[index].name, value), photo: own ? variantPhotos(own)[0] : alt };
    });
  }
  function fashionCardMarkup(p, image) {
    // Only a tag rides on the photo (owner 2026-10-21): sold out, the merchant's badge, best seller, the sale or «Nuevo» — never a
    // descriptive phrase.
    const colours = fashionColours(p), tag = limit(p) === 0 ? 'Agotado' : productBadge(p);
    const line = colours.length > 1 ? `${colours.length} colores` : colours[0]?.value || '';
    const bars = colours.filter(colour => colour.color && colour.photo);
    const details = config.productPage
      ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>`
      : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`;
    const photo = image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, '(max-width: 820px) 50vw, 33vw')} alt="${escape(p.name)}" loading="lazy" decoding="async" />` : '';
    const barsHtml = bars.length > 1 ? `<div class="menu-item__bars">${bars.map(bar => `<button type="button" data-card-swatch="${escape(bar.photo)}" data-card-colour="${escape(bar.value)}" aria-label="Ver en ${escape(bar.value)}" aria-pressed="false" style="--swatch:${escape(bar.color)}"></button>`).join('')}</div>` : '';
    const priceText = isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency);
    // Owner 2026-10-29 («the rounded sizes that existed before»): the sizes as round chips under the name; colours stay as bars.
    const optionList = optionGroups(p) || [], colourAt = colourGroupIndex(optionList);
    const sizeChips = optionList.filter((group, index) => index !== colourAt).flatMap(group => group.values).slice(0, 6);
    const sizesHtml = sizeChips.length ? `<p class="menu-item__chips">${sizeChips.map(value => `<span>${escape(value)}</span>`).join('')}</p>` : '';
    return `<article class="menu-item" data-product-id="${escape(p.id)}" data-anatomy="fashion">${details}<div class="menu-item__panel">${photo}${tag ? `<p class="menu-item__tag">${escape(tag)}</p>` : ''}${barsHtml}</div><div class="menu-item__row"><h3 class="menu-item__name">${escape(p.name)}</h3><p class="menu-item__price">${escape(priceText)}${cardOriginalMarkup(p)}</p></div>${line ? `<p class="menu-item__colors">${escape(line)}</p>` : ''}${sizesHtml}</article>`;
  }
  // Hovering a bar shows that colour's photo; leaving the card brings the first photo back.
  document.addEventListener('pointerover', event => {
    const bar = event.target.closest?.('[data-anatomy=fashion] [data-card-swatch]');
    const card = bar?.closest('.menu-item'), photo = card?.querySelector('.menu-item__image');
    if (!photo) return;
    if (!photo.dataset.firstSrc) photo.dataset.firstSrc = photo.getAttribute('src') || '';
    photo.removeAttribute('srcset'); photo.src = bar.dataset.cardSwatch;
    if (!card.hasAttribute('data-bars-watched')) {
      card.setAttribute('data-bars-watched', '');
      card.addEventListener('pointerleave', () => { if (photo.dataset.firstSrc) photo.src = photo.dataset.firstSrc; card.removeAttribute('data-bars-watched'); }, { once: true });
    }
  });
  // The default catalog card. Custom templates (customProductCard) take priority when the store authored one.
  function productCard(p) {
    const image = galleryImages(p)[0];
    const complex = p.variants?.length || p.extras?.length;
    // Fashion look: the fashion card wins over an authored card template — a YAPI-edited home keeps the template it had, and a
    // fashion store still shows the fashion card everywhere (live check 2026-10-21, NOA VARGAS revision 5).
    if (fashionCards()) return fashionCardMarkup(p, image);
    const custom = customProductCard(p, image, complex);
    if (custom) return custom;
    const cardExtras = cardPreview(p, image);
    // Atelier stores (2026-10-19, the Amboras card): the add button says what it does, with a bag, across the card.
    const atelier = productPageStyle() === 'atelier';
    // Showcase commerce: richer insides; showcase and split cards say «Agregar» across the card.
    const inside = cardInsidesMarkup(p), wide = ['showcase', 'split'].includes(config.showcase?.cards);
    const addFace = atelier || wide ? `${BAG_ICON}<span>Agregar</span>` : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    return `<article class="menu-item" data-product-id="${escape(p.id)}"${atelier ? ' data-anatomy="atelier"' : ''}>${config.productPage ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>` : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`}${image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, "(max-width: 820px) 50vw, 25vw")} alt="${escape(p.name)}" loading="lazy" decoding="async" />${badgeMarkup(p, 'menu-item__badge')}` : ""}${cardExtras.strip ? cardSwatchMarkup(p, cardExtras.swatches, cardExtras.more, true) : ''}${cardExtras.alt ? cardAltMarkup(cardExtras.alt) : ''}${cardExtras.chip ? cardChipMarkup(p) : ''}<div class="menu-item__copy">${inside.eyebrow}<h3>${escape(p.name)}</h3>${p.description && p.description.trim() !== p.name.trim() ? `<p>${escape(p.description)}</p>` : ""}${inside.points}${cardExtras.swatches ? '' : inside.chips}${inside.deal}${soldOut(p) ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}${cardOriginalMarkup(p)}</strong>${inside.save}${cardExtras.swatches && !cardExtras.strip ? cardSwatchMarkup(p, cardExtras.swatches) : ''}${isMembership(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Hacerme miembro de ${escape(p.name)}">Hacerme miembro</button>` : soldOut(p) && complex ? `<button class="menu-add" type="button" disabled aria-label="${escape(p.name)} agotado">Agotado</button>` : complex ? optionGroups(p) ? `<button class="menu-add" type="button" data-product="${escape(p.id)}" aria-label="Elegir opciones de ${escape(p.name)}">Elegir opciones</button>` : preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}>${addFace}</button>`}</article>`;
  }
  // A catalog without its own layout whose photos fill each card becomes a photo grid, not a stack of full-width cards.
  function structureCatalog(el) {
    // Grid autodetection only makes sense for the mount's own flat list: `sections` cards sit
    // inside .catalog-group__items and already get their grid unconditionally from CSS.
    const ownCards = [...el.querySelectorAll(':scope > .menu-item:not([data-custom-product])')];
    const card = ownCards[0], photo = card?.querySelector('.menu-item__image');
    if (photo && !el.hasAttribute('data-pagosya-grid') && getComputedStyle(el).display === 'block' && photo.getBoundingClientRect().width >= card.getBoundingClientRect().width * 0.6) el.setAttribute('data-pagosya-grid', '');
    // Photo zoom (spec 2026-10-21): every card with a photo gets its «Ampliar foto» button.
    decorateZoomButtons(el);
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
    // The checkout shell picks its own readable accent (checkout/shell.js shellAccent); the guard leaves it alone.
    const targets = [...document.querySelectorAll(CONTRAST_GUARDED)].filter(el => !el.closest('.pya-checkout'));
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
  /* Sort & filter (spec 2026-10-19 showcase commerce §4): only on full catalog pages with 6 or more products; a filter appears
   * only when the store's data has it; the state lives in the URL so a filtered page can be shared and the back button works. */
  // A hoisted function, not a const: buscar.html (pages/standard.js, an earlier part) searches before this part has run
  // (owner 2026-10-22: «la lupa del header nunca sirve» — «Cannot access 'filterFold' before initialization»).
  function filterFold(text) { return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
  const SORTS = [['destacados', 'Destacados'], ['precio-asc', 'Precio ↑'], ['precio-desc', 'Precio ↓'], ['novedades', 'Novedades'], ['mejor-oferta', 'Mejor oferta']];
  const FILTER_TOGGLES = ['descuento', 'disponible', 'ofertas', 'recoger'];
  /** Search (amendment 2026-10-21): the words of a query, folded; the catalogue and buscar.html match with the same rule —
   *  every word in the product's name, description, tags or category name, case and accents ignored. */
  function searchWords(text) { return filterFold(String(text || '').slice(0, 80)).split(/\s+/).filter(Boolean); }
  function matchesSearch(item, words) {
    if (!words.length) return true;
    const category = (Array.isArray(store.categories) ? store.categories : []).find(c => c && c.id === item.categoryId)?.name;
    const haystack = filterFold([item.name, item.description, ...(Array.isArray(item.tags) ? item.tags : []), category].filter(Boolean).join(' '));
    return words.every(word => haystack.includes(word));
  }
  function filterGroups(items) {
    const groups = [];
    const cats = (store.categories || []).filter(c => items.some(p => p.categoryId === c.id));
    if (cats.length > 1) groups.push({ key: 'categoria', label: 'Categoría', kind: 'check', values: cats.map(c => ({ value: filterFold(c.id), text: c.name })) });
    const prices = items.map(p => price(p));
    if (Math.min(...prices) < Math.max(...prices)) groups.push({ key: 'precio', label: 'Precio', kind: 'range', values: [Math.min(...prices), Math.max(...prices)] });
    const options = new Map();
    for (const p of items) for (const g of optionGroups(p) || []) {
      const key = filterFold(g.name);
      const entry = options.get(key) || { key, label: g.name.charAt(0).toUpperCase() + g.name.slice(1).toLowerCase(), values: new Map() };
      for (const value of g.values) if (!entry.values.has(filterFold(value))) entry.values.set(filterFold(value), { value: filterFold(value), text: value, color: swatchColor(g.name, value) });
      options.set(key, entry);
    }
    for (const entry of options.values()) groups.push({ key: entry.key, label: entry.label, kind: [...entry.values.values()].some(v => v.color) ? 'swatch' : 'check', values: [...entry.values.values()] });
    if (items.some(p => !isMembership(p) && price(p) < p.amount)) groups.push({ key: 'descuento', label: 'Con descuento', kind: 'toggle', values: [] });
    if (items.some(p => p.stock === 0) && items.some(p => p.stock !== 0)) groups.push({ key: 'disponible', label: 'Disponible', kind: 'toggle', values: [] });
    if (items.some(p => offerOptions(p, undefined).length)) groups.push({ key: 'ofertas', label: 'Packs y suscripción', kind: 'toggle', values: [] });
    return groups;
  }
  /** The query the page last wrote, kept in memory too: in the Studio preview the frame's address cannot change, and a typed
   *  search or a chosen chip was read back from the old address and lost (live check 2026-10-21, NOA VARGAS rev 8). */
  let filterQuery = null;
  function readFilterState() {
    const params = new URLSearchParams(filterQuery ?? (window.PAGOSYA_PREVIEW_QUERY || location.search));
    const state = { orden: SORTS.some(([v]) => v === params.get('orden')) ? params.get('orden') : 'destacados', precio: null, sets: {}, toggles: new Set(), q: (params.get('q') || '').slice(0, 80) };
    const range = /^(\d+)-(\d+)$/.exec(params.get('precio') || '');
    if (range) state.precio = [Number(range[1]) * 100, Number(range[2]) * 100];
    for (const [key, value] of params) if (key.startsWith('f_')) state.sets[filterFold(key.slice(2))] = value.split(',').map(filterFold).filter(Boolean);
    // Owner 2026-11-06: a home section links a category by its name (?f_categoria=Noche), the menu by its id; a name is read as
    // that category's id, so both open its products (an unknown value still matches nothing, as before).
    if (state.sets.categoria) {
      const categories = Array.isArray(store.categories) ? store.categories : [];
      state.sets.categoria = state.sets.categoria.map(value => { const named = categories.find(c => c && c.id && filterFold(c.name) === value); return named ? filterFold(named.id) : value; });
    }
    for (const key of FILTER_TOGGLES) if (params.get(key) === '1') state.toggles.add(key);
    return state;
  }
  function writeFilterState(state) {
    const params = new URLSearchParams(filterQuery ?? (window.PAGOSYA_PREVIEW_QUERY || location.search));
    [...params.keys()].filter(k => k.startsWith('f_') || ['orden', 'precio', 'q', ...FILTER_TOGGLES].includes(k)).forEach(k => params.delete(k));
    if (state.q && state.q.trim()) params.set('q', state.q.slice(0, 80));
    if (state.orden !== 'destacados') params.set('orden', state.orden);
    if (state.precio) params.set('precio', `${Math.floor(state.precio[0] / 100)}-${Math.ceil(state.precio[1] / 100)}`);
    for (const [key, values] of Object.entries(state.sets)) if (values.length) params.set(`f_${key}`, values.join(','));
    for (const key of state.toggles) params.set(key, '1');
    filterQuery = params.toString() ? `?${params}` : '';
    try { history.replaceState(history.state, '', `${location.pathname}${filterQuery}${location.hash}`); } catch { /* sandboxed previews keep it in memory */ }
  }
  function applyFilters(items, state) {
    const words = searchWords(state.q);
    return items.filter(p => {
      if (!matchesSearch(p, words)) return false;
      if (state.precio && (price(p) < state.precio[0] || price(p) > state.precio[1])) return false;
      if (state.toggles.has('descuento') && !(price(p) < p.amount)) return false;
      if (state.toggles.has('disponible') && p.stock === 0) return false;
      if (state.toggles.has('ofertas') && !offerOptions(p, undefined).length) return false;
      // «Recoger hoy» (browse, spec 2026-11-06): what can be bought now — not sold out, any combination left.
      if (state.toggles.has('recoger') && soldOut(p)) return false;
      for (const [key, values] of Object.entries(state.sets)) {
        if (!values.length) continue;
        if (key === 'categoria') { if (!values.includes(filterFold(p.categoryId))) return false; continue; }
        const group = (optionGroups(p) || []).find(g => filterFold(g.name) === key);
        if (!group || !group.values.some(v => values.includes(filterFold(v)))) return false;
      }
      return true;
    });
  }
  function sortItems(items, order) {
    const saving = p => p.amount - Math.min(price(p), ...offerOptions(p, undefined).map(o => o.perUnit));
    const list = [...items];
    if (order === 'precio-asc') list.sort((a, b) => price(a) - price(b));
    if (order === 'precio-desc') list.sort((a, b) => price(b) - price(a));
    if (order === 'novedades') list.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
    if (order === 'mejor-oferta') list.sort((a, b) => saving(b) - saving(a));
    return list;
  }
  /* Sort & filter styles (spec 2026-10-21): three finished styles over the same state — `bar` (top row + drawer), `chips` (the
   * John Smedley explorer: category and option chip rows, price and switches in «Más filtros») and `sidebar` (collapsible groups
   * beside the grid; the drawer under 900 px). Every control edits the state directly (read → change → write → render).
   * `browse` (spec 2026-11-06, the Nike shop page): the sidebar's column under a head row — count, «Ocultar filtros» (kept for
   * the tab) and the sort —, «Recoger hoy» first when the store has a pickup location, and colour-photo strips on the cards. */
  const FILTER_STYLES = ['bar', 'chips', 'sidebar', 'browse'];
  let filtersDrawerOpen = false, filtersLockedFrom = null, filtersOpener = null;
  const FILTERS_HIDDEN_KEY = 'pagosya-filters-hidden';
  let filtersHidden = (() => { try { return sessionStorage.getItem(FILTERS_HIDDEN_KEY) === '1'; } catch { return false; } })();
  const pickupToday = () => (Array.isArray(store.locations) ? store.locations : []).some(l => l?.pickupEnabled);
  const filterStyleFor = (all, groups) => FILTER_STYLES.includes(config.filterStyle) ? config.filterStyle : all.length >= 9 || groups.length >= 3 ? 'sidebar' : 'bar';
  const productsWord = n => `${n} ${n === 1 ? 'producto' : 'productos'}`;
  function filtersMarkup(all, state, shown, forcedStyle) {
    const groups = filterGroups(all);
    // Owner 2026-10-28 («que tenga los sorters siempre»): a collection page shows its categories and colours as open chip rows.
    const style = FILTER_STYLES.includes(forcedStyle) ? forcedStyle : filterStyleFor(all, groups);
    if (style === 'browse' && pickupToday()) groups.unshift({ key: 'recoger', label: 'Recoger hoy', kind: 'toggle', values: [] });
    const chosen = key => state.sets[key] || [];
    const chip = (g, v) => `<button type="button" class="cf-chip"${v.color ? ' data-swatch-chip' : ''} data-filter-chip="${escape(g.key)}:${escape(v.value)}" data-key="${escape(g.key)}" data-value="${escape(v.value)}" aria-pressed="${chosen(g.key).includes(v.value)}">${v.color ? `<span data-swatch style="--swatch:${escape(v.color)}" aria-hidden="true"></span>` : ''}<span>${escape(v.text)}</span></button>`;
    const range = g => {
      const lo = Math.floor(g.values[0] / 100), hi = Math.ceil(g.values[1] / 100);
      const a = Math.floor((state.precio?.[0] ?? g.values[0]) / 100), b = Math.ceil((state.precio?.[1] ?? g.values[1]) / 100);
      return `<div class="cf-range" data-filter-range data-lo="${lo}" data-hi="${hi}"><p class="cf-range__values"><output data-range-out="min">Bs ${a}</output><span aria-hidden="true">–</span><output data-range-out="max">Bs ${b}</output></p>`
        + `<input type="range" name="precio-min" min="${lo}" max="${hi}" step="1" value="${a}" aria-label="Precio desde"><input type="range" name="precio-max" min="${lo}" max="${hi}" step="1" value="${b}" aria-label="Precio hasta"></div>`;
    };
    const toggle = g => `<button type="button" class="cf-switch" role="switch" data-filter-toggle="${escape(g.key)}" aria-checked="${state.toggles.has(g.key)}"><span class="cf-switch__track" aria-hidden="true"></span><span>${escape(g.label)}</span></button>`;
    const body = g => g.kind === 'range' ? range(g) : g.kind === 'toggle' ? toggle(g) : `<div class="cf-chips" role="group" aria-label="${escape(g.label)}">${g.values.map(v => chip(g, v)).join('')}</div>`;
    const title = g => g.kind === 'range' ? 'Precio' : g.label;
    const section = g => g.kind === 'toggle' ? `<div class="cf-group cf-group--toggle" data-filter-group="${escape(g.key)}">${body(g)}</div>` : `<section class="cf-group" data-filter-group="${escape(g.key)}"><h3 class="cf-group__title">${escape(title(g))}</h3>${body(g)}</section>`;
    const textOf = (key, value) => groups.find(g => g.key === key)?.values?.find?.(v => v.value === value)?.text || value;
    const active = [...(state.q ? [['q', '', `“${state.q}”`]] : []), ...Object.entries(state.sets).flatMap(([key, values]) => values.map(value => [key, value, textOf(key, value)])), ...[...state.toggles].map(key => [key, '', groups.find(g => g.key === key)?.label || key]), ...(state.precio ? [['precio', '', 'Precio']] : [])];
    const filterCount = active.filter(([key]) => key !== 'q').length;
    const sortLabel = (SORTS.find(([value]) => value === state.orden) || SORTS[0])[1];
    const sort = `<div class="cf-sort"><button type="button" class="cf-sort__toggle" data-sort-toggle aria-haspopup="listbox" aria-expanded="false" aria-controls="cf-sort-list">Ordenar: <strong>${escape(sortLabel)}</strong><span class="cf-caret" aria-hidden="true"></span></button>`
      + `<ul class="cf-sort__list" id="cf-sort-list" role="listbox" aria-label="Ordenar" hidden>${SORTS.map(([value, text]) => `<li role="option" tabindex="-1" data-sort="${value}" aria-selected="${state.orden === value}">${escape(text)}</li>`).join('')}</ul></div>`;
    const search = `<div class="catalog-search" role="search"><label class="catalog-search__label" for="catalog-q">Buscar productos</label><span class="catalog-search__icon" aria-hidden="true"></span><input id="catalog-q" type="search" name="q" maxlength="80" autocomplete="off" placeholder="Buscar en la tienda" value="${escape(state.q || '')}">${state.q ? '<button type="button" class="catalog-search__clear" data-search-clear aria-label="Borrar búsqueda">✕</button>' : ''}</div>`;
    const count = `<p class="catalog-filters__count" aria-live="polite">${productsWord(shown)}</p>`;
    const activeRow = active.length ? `<p class="catalog-filters__active">${active.map(([key, value, text]) => `<button type="button" data-filter-remove="${escape(key)}:${escape(value)}" data-key="${escape(key)}" data-value="${escape(value)}" aria-label="Quitar ${escape(text)}">${escape(text)} <span aria-hidden="true">✕</span></button>`).join('')}<button type="button" class="cf-link" data-filters-clear>Borrar todo</button></p>` : '';
    const opener = label => `<button type="button" class="cf-open" data-filters-open aria-expanded="${filtersDrawerOpen}" aria-controls="cf-drawer">${escape(label)}${filterCount ? ` (${filterCount})` : ''}</button>`;
    const drawer = (list, label) => list.length ? `<div class="cf-drawer" id="cf-drawer" data-filters-drawer role="dialog" aria-modal="true" aria-label="${escape(label)}"${filtersDrawerOpen ? '' : ' hidden'}><div class="cf-drawer__panel"><div class="cf-drawer__head"><h2>${escape(label)}</h2><button type="button" class="cf-drawer__close" data-filters-close aria-label="Cerrar">✕</button></div><div class="cf-drawer__body">${list.map(section).join('')}</div><div class="cf-drawer__foot"><button type="button" class="cf-link" data-filters-clear>Borrar todo</button><button type="button" class="cf-done" data-filters-done>Ver ${productsWord(shown)}</button></div></div></div>` : '';
    let inner;
    if (style === 'chips') {
      const cat = groups.find(g => g.key === 'categoria');
      const options = groups.filter(g => g.key !== 'categoria' && (g.kind === 'check' || g.kind === 'swatch'));
      const more = groups.filter(g => g.kind === 'range' || g.kind === 'toggle');
      const catRow = cat ? `<div class="catalog-filters__row catalog-filters__row--categories" data-filter-group="categoria" role="group" aria-label="${escape(cat.label)}"><button type="button" class="cf-chip cf-chip--plain" data-filter-chip="categoria:" data-key="categoria" data-value="" aria-pressed="${!chosen('categoria').length}">Todo</button>${cat.values.map(v => chip(cat, v).replace('class="cf-chip"', 'class="cf-chip cf-chip--plain"')).join('')}</div>` : '';
      const optionRow = options.length ? `<div class="catalog-filters__row catalog-filters__row--options">${options.map(g => `<div class="cf-chips" data-filter-group="${escape(g.key)}" role="group" aria-label="${escape(g.label)}">${g.values.map(v => chip(g, v)).join('')}</div>`).join('')}</div>` : '';
      inner = `${search}<div class="catalog-filters__top">${catRow}${sort}</div>${optionRow}<div class="catalog-filters__bar">${count}${more.length ? opener('Más filtros') : ''}</div>${activeRow}${drawer(more, 'Más filtros')}`;
    } else if (style === 'sidebar' || style === 'browse') {
      const details = g => g.kind === 'toggle' ? `<div class="cf-group cf-group--toggle" data-filter-group="${escape(g.key)}">${toggle(g)}</div>`
        : `<details class="cf-group" data-filter-group="${escape(g.key)}" open><summary>${escape(title(g))}${chosen(g.key).length ? ` · ${chosen(g.key).length}` : ''}<span class="cf-caret" aria-hidden="true"></span></summary>${body(g)}</details>`;
      // On desktop the sidebar takes a fixed left column of the catalogue and its groups stay in view as the products scroll;
      // a grid row span left the products ~2300 px below it (final review 2026-10-21).
      const side = `<aside class="catalog-filters__side" aria-label="Filtros"><div class="catalog-filters__side-inner">${groups.map(details).join('')}${filterCount ? '<button type="button" class="cf-link" data-filters-clear="filters">Borrar filtros</button>' : ''}</div></aside>`;
      const hide = `<button type="button" class="cf-hide" data-filters-hide aria-expanded="${!filtersHidden}">${filtersHidden ? 'Mostrar filtros' : 'Ocultar filtros'}</button>`;
      inner = style === 'browse'
        ? `${search}${side}<div class="catalog-filters__head">${count}<div class="catalog-filters__tools">${opener('Filtrar')}${hide}${sort}</div></div>${activeRow}${drawer(groups, 'Filtrar')}`
        : `${search}${side}<div class="catalog-filters__bar">${count}${opener('Filtrar')}${sort}</div>${activeRow}${drawer(groups, 'Filtrar')}`;
    } else {
      inner = `${search}<div class="catalog-filters__bar">${count}${sort}${groups.length ? opener('Filtrar') : ''}</div>${activeRow}${drawer(groups, 'Filtrar')}`;
    }
    return `<div class="catalog-filters" data-filter-style="${style}"${style === 'browse' && filtersHidden ? ' data-filters-hidden' : ''}>${inner}</div>`;
  }
  /** The search field filters as the shopper types (150 ms after the last key); Esc and ✕ clear it. */
  let searchTimer = 0;
  const setSearch = (value, focus = false) => { clearTimeout(searchTimer); const state = readFilterState(); state.q = String(value || '').slice(0, 80); writeFilterState(state); render(); if (focus) document.querySelector('.catalog-search input[name=q]')?.focus({ preventScroll: true }); };
  /** A value inside a double-quoted attribute selector (CSS.escape is missing in some runtimes). */
  const attrValue = value => String(value).replace(/["\\]/g, '\\$&');
  const filterControl = selector => document.querySelector(`.catalog-filters ${selector}`);
  /** Writes a changed state, redraws, and gives the focus back to the control that was used (the redraw replaced it). */
  function applyFilterChange(state, focusSelector) {
    writeFilterState(state);
    render();
    if (focusSelector) filterControl(focusSelector)?.focus({ preventScroll: true });
  }
  const drawerFocusable = drawer => [...drawer.querySelectorAll('button:not([disabled]),input,[tabindex="0"],summary')].filter(el => !el.closest('[hidden]'));
  function openFiltersDrawer(opener) {
    const drawer = document.querySelector('[data-filters-drawer]');
    if (!drawer) return;
    filtersDrawerOpen = true; filtersOpener = opener;
    drawer.hidden = false;
    document.querySelectorAll('[data-filters-open]').forEach(button => button.setAttribute('aria-expanded', 'true'));
    if (filtersLockedFrom === null) { filtersLockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
    drawerFocusable(drawer)[0]?.focus({ preventScroll: true });
  }
  function closeFiltersDrawer(returnFocus) {
    filtersDrawerOpen = false;
    const drawer = document.querySelector('[data-filters-drawer]');
    if (drawer) drawer.hidden = true;
    document.querySelectorAll('[data-filters-open]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (filtersLockedFrom !== null) { document.documentElement.style.overflow = filtersLockedFrom; filtersLockedFrom = null; }
    if (returnFocus) (document.querySelector('[data-filters-open]') || filtersOpener)?.focus({ preventScroll: true });
  }
  function setSortOpen(open) {
    const list = document.querySelector('.cf-sort__list'), toggle = document.querySelector('[data-sort-toggle]');
    if (!list || !toggle) return;
    list.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) (list.querySelector('[aria-selected="true"]') || list.querySelector('[role=option]'))?.focus({ preventScroll: true });
  }
  function pickSort(value) {
    const state = readFilterState();
    state.orden = SORTS.some(([v]) => v === value) ? value : 'destacados';
    applyFilterChange(state, '[data-sort-toggle]');
  }
  document.addEventListener('input', event => {
    const target = event.target;
    if (target?.matches?.('.catalog-search input[name=q]')) {
      const value = target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => setSearch(value), 150);
      return;
    }
    // The price range shows its numbers while it is dragged; the products follow on release (`change`).
    const range = target?.closest?.('[data-filter-range]');
    if (range) for (const name of ['min', 'max']) { const out = range.querySelector(`[data-range-out="${name}"]`), input = range.querySelector(`input[name="precio-${name}"]`); if (out && input) out.textContent = `Bs ${input.value}`; }
  });
  document.addEventListener('change', event => {
    const range = event.target?.closest?.('[data-filter-range]');
    if (!range) return;
    let a = Number(range.querySelector('input[name="precio-min"]').value), b = Number(range.querySelector('input[name="precio-max"]').value);
    if (a > b) [a, b] = [b, a];
    const state = readFilterState();
    state.precio = a <= Number(range.dataset.lo) && b >= Number(range.dataset.hi) ? null : [a * 100, b * 100];
    applyFilterChange(state, `[data-filter-range] input[name="${event.target.name}"]`);
  });
  document.addEventListener('click', event => {
    const target = event.target;
    if (target?.closest?.('[data-search-clear]')) { setSearch('', true); return; }
    const chipButton = target?.closest?.('[data-filter-chip]');
    if (chipButton) {
      // The key and value travel in their own attributes: an option group named «Talla: EU» holds a colon (2026-10-21).
      const raw = chipButton.dataset.filterChip, key = chipButton.dataset.key ?? raw.slice(0, raw.indexOf(':')), value = chipButton.dataset.value ?? raw.slice(raw.indexOf(':') + 1);
      const state = readFilterState(), single = key === 'categoria' && chipButton.closest('.catalog-filters__row--categories');
      const current = state.sets[key] || [];
      state.sets[key] = !value ? [] : single ? (current.length === 1 && current[0] === value ? [] : [value]) : current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      applyFilterChange(state, `[data-filter-chip="${attrValue(raw)}"]`);
      return;
    }
    const switchButton = target?.closest?.('[data-filter-toggle]');
    if (switchButton) {
      const state = readFilterState(), key = switchButton.dataset.filterToggle;
      if (state.toggles.has(key)) state.toggles.delete(key); else state.toggles.add(key);
      applyFilterChange(state, `[data-filter-toggle="${attrValue(key)}"]`);
      return;
    }
    if (target?.closest?.('[data-filters-hide]')) {
      filtersHidden = !filtersHidden;
      try { if (filtersHidden) sessionStorage.setItem(FILTERS_HIDDEN_KEY, '1'); else sessionStorage.removeItem(FILTERS_HIDDEN_KEY); } catch { /* storage can be unavailable */ }
      render();
      filterControl('[data-filters-hide]')?.focus({ preventScroll: true });
      return;
    }
    if (target?.closest?.('[data-sort-toggle]')) { setSortOpen(document.querySelector('.cf-sort__list')?.hidden !== false); return; }
    const option = target?.closest?.('.cf-sort__list [data-sort]');
    if (option) { pickSort(option.dataset.sort); return; }
    if (!target?.closest?.('.cf-sort')) setSortOpen(false);
    if (target?.closest?.('[data-filters-open]')) { if (filtersDrawerOpen) closeFiltersDrawer(true); else openFiltersDrawer(target.closest('[data-filters-open]')); return; }
    if (target?.closest?.('[data-filters-close],[data-filters-done]') || target?.matches?.('[data-filters-drawer]')) closeFiltersDrawer(true);
  });
  document.addEventListener('keydown', event => {
    const target = event.target;
    if (event.key === 'Escape' && target?.matches?.('.catalog-search input[name=q]') && target.value) { event.preventDefault(); setSearch(''); return; }
    const list = document.querySelector('.cf-sort__list');
    if (list && !list.hidden) {
      const options = [...list.querySelectorAll('[role=option]')], at = options.indexOf(document.activeElement);
      if (event.key === 'Escape') { event.preventDefault(); setSortOpen(false); document.querySelector('[data-sort-toggle]')?.focus({ preventScroll: true }); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus(); return; }
      if ((event.key === 'Enter' || event.key === ' ') && at >= 0) { event.preventDefault(); pickSort(options[at].dataset.sort); return; }
    }
    if (!filtersDrawerOpen) return;
    if (event.key === 'Escape') { event.preventDefault(); closeFiltersDrawer(true); return; }
    const drawer = document.querySelector('[data-filters-drawer]');
    if (event.key === 'Tab' && drawer && drawer.contains(target)) {
      const items = drawerFocusable(drawer), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && target === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && target === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('pagehide', () => { if (filtersDrawerOpen) closeFiltersDrawer(false); });
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
  /* Named parts for YAPI's guarded CSS on the kit's own surfaces (spec 2026-10-14; profiles in the API's product-theme-css.ts).
   * Protected controls (prices, add-to-cart, totals) never get a part. An element that already names a part keeps it. */
  function markKitParts() {
    const mark = (selector, part) => document.querySelectorAll(selector).forEach(el => { if (!el.hasAttribute('data-part')) el.setAttribute('data-part', part); });
    mark('[data-pagosya-catalog] .menu-item', 'card');
    mark('[data-pagosya-catalog] .menu-item .menu-item__image', 'card-media');
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__name,.menu-item__copy h3)', 'card-name');
    // A custom card's price can sit in .menu-item__copy p: it is protected, never card-meta.
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__description,.menu-item__options,.menu-item__copy p):not([data-product-field=price],.menu-item__price)', 'card-meta');
    mark('[data-pagosya-catalog] .menu-item .menu-item__badge', 'card-badge');
    mark('.commerce-page-title', 'page-title');
    mark('[data-pagosya-catalog] .catalog-tabs', 'tabs');
    mark('[data-pagosya-catalog] .catalog-group__title', 'group-title');
    mark('[data-pagosya-catalog][data-catalog-full]', 'grid');
    mark('[data-pagosya-catalog] .catalog-empty', 'empty');
  }
  function render() {
    delete document.documentElement.dataset.productTemplateInvalid;
    // The catalog can change the fallback style, so this follows every render.
    if (hasDna) document.documentElement.setAttribute('data-dna-product', productPageStyle());
    // A wordmark styled as <span data-store-name>Tostadero</span> <strong>Yungas</strong> already shows the whole
    // name; writing it into the span again read "Tostadero Yungas Yungas". Stale and empty slots are still filled.
    const storeName = store.storeName || "Tu tienda", squash = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
    document.querySelectorAll("[data-store-name]").forEach((el) => {
      const own = squash(el.textContent), around = squash(el.parentElement?.textContent);
      if (own && own !== squash(storeName) && squash(storeName).includes(own) && around.includes(squash(storeName))) return;
      el.textContent = storeName;
    });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.hidden = !(store.categories || []).length;
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      // Inventory is live. An empty-at-generation catalog must not stay permanently hidden.
      el.hidden = false;
      // Chosen set (showcase commerce §3): only the named products in the merchant's order, a category, or a collection.
      // A deleted product is skipped; a set left empty hides itself.
      // An entry is a product id, or its name (atelier rebuild 2026-10-25: YAPI wrote names joined by «|» and every set
      // came out empty); names match without case or accents.
      const named = (el.getAttribute('data-products') || '').split(/[,|]/).map(id => id.trim()).filter(Boolean);
      const byCategory = el.getAttribute('data-category'), byCollection = el.getAttribute('data-collection'), byColor = el.getAttribute('data-color');
      if (named.length || byCategory || byCollection || byColor) {
        const chosen = named.length ? named.map(ref => products().find(item => item.id === ref) || products().find(item => filterFold(item.name) === filterFold(ref))).filter(Boolean)
          : byCategory ? products().filter(item => item.categoryId === byCategory)
          : byCollection ? products().filter(item => (collections().find(c => c.slug === byCollection)?.productIds || []).includes(item.id))
          : products();
        // John Smedley sections (spec 2026-10-21): an `explore` rail can also show one colour, accents and case ignored.
        const set = byColor ? chosen.filter(item => (optionGroups(item) || []).some(g => /^(color|colour|tono|tinte|acabado|finish)$/i.test(g.name) && g.values.some(v => filterFold(v) === filterFold(byColor)))) : chosen;
        el.hidden = !set.length;
        el.innerHTML = set.map(productCard).join('');
        structureCatalog(el);
        markCardDesign(el);
        return;
      }
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
        // A page with its own title slot (Esencial's coleccion page) shows the name there, not as a second heading (2026-10-21).
        const titleSlot = document.querySelector('[data-collection-title]');
        if (titleSlot && current) titleSlot.textContent = current.name;
        const heading = current && !titleSlot ? `<h2 class="catalog-group__title">${escape(current.name)}</h2>` : '';
        // The shopper is on a specific collection's page here, not a category filter — "en esta
        // categoría" would describe a page that doesn't exist in this layout.
        // Owner 2026-10-28 («colección Mujer y adentro zapatos, ropa… que tenga los sorters siempre»): a collection with two
        // products or more gets the catalogue's sort and filters — its categories as chips, colours as swatches, sizes, price.
        if (items.length >= 2) {
          const state = readFilterState(), shown = sortItems(applyFilters(items, state), state.orden);
          el.innerHTML = tabs + heading + filtersMarkup(items, state, shown.length, 'chips') + (shown.length ? shown.map(productCard).join('')
            : '<p class="catalog-empty">No hay productos con estos filtros. <button type="button" data-filters-clear="filters">Borrar filtros</button></p>');
        } else el.innerHTML = tabs + (items.length ? heading + items.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta colección.</p>');
      } else if (layout === 'sections' && collections().length) {
        const groups = collectionGroups(selected);
        el.innerHTML = groups.length
          ? groups.map((group) => `<section class="catalog-group"><h3 class="catalog-group__title">${escape(group.name)}</h3><div class="catalog-group__items">${group.items.map(productCard).join("")}</div></section>`).join("")
          : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      } else if (layout === 'page' || layout === 'tabs') {
        const tabs = layout === 'tabs' && collections().length ? catalogTabs() : '';
        el.innerHTML = tabs + selected.slice(0, HOME_PREVIEW).map(productCard).join("") + catalogMore(layout);
      } else if ((el.hasAttribute('data-pagosya-filters') || el.hasAttribute('data-catalog-full')) && selected.length >= 2) {
        // Showcase commerce §4: the full catalog can be sorted and filtered; from two products, not six (owner 2026-10-28: «siempre»).
        const state = readFilterState(), shown = sortItems(applyFilters(selected, state), state.orden);
        // Typing in the search re-renders the grid: the field keeps the focus and the caret (amendment 2026-10-21).
        const typing = document.activeElement?.matches?.('.catalog-search input') && el.contains(document.activeElement) ? document.activeElement.selectionStart : null;
        const filtered = Boolean(state.precio || state.toggles.size || Object.values(state.sets).some(values => values.length));
        const empty = state.q
          ? `<p class="catalog-empty">Sin resultados para “${escape(state.q)}”. <button type="button" data-search-clear>Borrar búsqueda</button>${filtered ? ' <button type="button" data-filters-clear="filters">Borrar filtros</button>' : ''}</p>`
          : '<p class="catalog-empty">No hay productos con estos filtros. <button type="button" data-filters-clear="filters">Borrar filtros</button></p>';
        // Owner 2026-10-29 («color picker, sorter» on the home): a home grid keeps its cap (data-catalog-limit) and may name its
        // filter style (data-filters-style); «Ver todo» has the rest.
        const cap = el.hasAttribute('data-catalog-full') ? 0 : Number.parseInt(el.getAttribute('data-catalog-limit') || '', 10);
        const drawn = cap > 0 ? shown.slice(0, cap) : shown;
        el.innerHTML = filtersMarkup(selected, state, shown.length, el.getAttribute('data-filters-style') || undefined) + (drawn.length ? drawn.map(productCard).join('') : empty);
        const field = typing === null ? null : el.querySelector('.catalog-search input');
        if (field) { field.focus({ preventScroll: true }); try { field.setSelectionRange(typing, typing); } catch { /* search inputs without selection support */ } }
      } else {
        // Also covers `sections` with no collections yet: a single "Más productos" group holding
        // the whole catalog isn't an arrangement, so it falls back to the same flat grid as `all`.
        // A full catalogue too small for the filters still honours a link's category or colour (final review 2026-10-21).
        // One build path live check 2026-10-29: a home grid may cap its cards (data-catalog-limit); «Ver todo» leads to the rest.
        const limit = el.hasAttribute('data-catalog-full') ? 0 : Number.parseInt(el.getAttribute('data-catalog-limit') || '', 10);
        const shown = el.hasAttribute('data-catalog-full') ? applyFilters(selected, readFilterState()) : limit > 0 ? selected.slice(0, limit) : selected;
        el.innerHTML = shown.length ? shown.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      }
      structureCatalog(el);
      markCardDesign(el);
      if (MOTIFS.length) { placeCardMotifs(el); placeButtonMotifs(el); }
    });
    renderSpotlights();
    observeCards();
    markKitParts();
    fitCards();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitCards);
    if (hasDna && typeof requestAnimationFrame === 'function') requestAnimationFrame(placeQuickLooks);
    if (fullProductPage && !embeddedProductId && !preview) {
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
    if (fullProductPage) openProduct(embeddedProductId ?? new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id') ?? (preview ? products()[0]?.id : null));
    else if (selectedProduct && detail.open) {
      if (products().some(p => p.id === selectedProduct.id)) openProduct(selectedProduct.id, detailTrigger);
      else detail.close();
    }
    if (fullCheckoutPage) showCheckout(location.hash === '#pago-de-prueba' && (preview || config.demo) ? 'payment' : location.hash === '#pedido-de-prueba' && (preview || config.demo) ? 'done' : 'review');
    renderCart();
    renderContact();
    // Validate every authored template as soon as the store is ready, not only when its surface
    // happens to render: added/review/product-page templates otherwise stay unvalidated until a
    // shopper adds to cart, opens checkout or opens a product, which is too late for Studio's
    // publishing check to catch a broken one. This is validation only — each reader just sets or
    // clears its flag and discards the clone; their lazy use at the real render site is unchanged.
    cartLineTemplate(); cartTemplate(); addedTemplate(); reviewTemplate(); productPageTemplate(); checkoutTemplate();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  /* Product spotlight (showcase commerce §3): a live buy card beside the merchant's text or video. A product that no longer
   * exists hides the block. Videos stay muted, inline and looping, and load only near the screen. */
  function renderSpotlights() {
    document.querySelectorAll('[data-pagosya-spotlight]').forEach(el => {
      const p = products().find(item => item.id === el.getAttribute('data-pagosya-spotlight'));
      el.hidden = !p;
      el.querySelector(':scope > .spotlight')?.remove();
      if (!p) return;
      const inside = cardInsidesMarkup(p), image = galleryImages(p)[0], complex = p.variants?.length || p.extras?.length;
      const add = isMembership(p) || complex ? `<button type="button" class="menu-add spotlight__add" data-product="${escape(p.id)}">Elegir opciones</button>`
        : `<button type="button" class="menu-add spotlight__add" data-add="${escape(p.id)}" data-quantity="1"${!ready || limit(p) === 0 ? ' disabled' : ''}>Agregar</button>`;
      const card = `<div class="spotlight" data-pagosya-product>${image ? `<img class="spotlight__image" src="${escape(image)}" alt="${escape(p.name)}" loading="lazy" decoding="async">` : ''}${inside.eyebrow}<h3 class="spotlight__name">${escape(p.name)}</h3><p class="spotlight__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}${inside.save}</p>${inside.points}${complex ? '' : offerSquaresMarkup(p, undefined)}${add}</div>`;
      el.insertAdjacentHTML(el.getAttribute('data-side') === 'right' ? 'beforeend' : 'afterbegin', card);
      el.querySelectorAll('video[data-spotlight-video]').forEach(video => {
        video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('preload', 'none');
        if (video.dataset.spotlightWatched || typeof IntersectionObserver !== 'function') return;
        video.dataset.spotlightWatched = '';
        new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) { video.preload = 'auto'; video.play?.()?.catch?.(() => {}); } else video.pause?.();
        }, { rootMargin: '200px' }).observe(video);
        video.addEventListener('click', () => { video.muted = !video.muted; });
      });
    });
  }
  // ---- Catalogue mounts that change (spec 2026-10-21 John Smedley sections) ----
  // A page can switch a mount's category or colour after load (the `explore` section's chips): the catalogue redraws once per
  // change, after the page has finished setting its attributes.
  if (typeof MutationObserver === 'function') {
    let mountRedraw = false;
    new MutationObserver(records => {
      if (mountRedraw || !records.some(record => record.target.matches?.('[data-pagosya-catalog]'))) return;
      mountRedraw = true;
      queueMicrotask(() => { mountRedraw = false; render(); });
    }).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-category', 'data-color'] });
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
  // Spec 2026-10-15 free commerce surfaces: the whole checkout page. The kit still builds every piece (back, heading, status,
  // the review with the payment box) and only moves them into the template's slots.
  const checkoutTemplate = () => kitTemplate('checkout', 'checkoutTemplateInvalid', root =>
    root.querySelector('[data-checkout-slot="heading"]') && root.querySelector('[data-checkout-slot="review"]'));
  function applyCheckoutTemplate() {
    const layout = checkoutTemplate();
    const inner = checkoutPage.querySelector(':scope > .checkout-page__inner');
    if (!layout || !inner) return;
    const root = layout.make();
    const slot = name => root.querySelector(`[data-checkout-slot="${name}"]`);
    root.querySelectorAll('[data-checkout-slot]').forEach(node => node.replaceChildren());
    const back = inner.querySelector(':scope > .checkout-page__back');
    const intro = inner.querySelector(':scope > div:not(.checkout-page__summary)');
    const status = intro?.querySelector('[data-pagosya-status]');
    const review = inner.querySelector(':scope > .checkout-page__summary > [data-pagosya-cart]');
    if (status) (slot('status') || slot('heading')).append(status);
    if (intro) slot('heading').prepend(...intro.childNodes);
    if (back) (slot('back') || slot('heading')).prepend(back);
    slot('review').append(review);
    root.setAttribute('data-checkout-root', '');
    inner.replaceChildren(root);
    checkoutPage.setAttribute('data-checkout-template', '');
  }
  const productPageTemplate = () => kitTemplate('product-page', 'productPageTemplateInvalid', root =>
    ['gallery', 'title', 'pricing', 'buy'].every(slot => root.querySelector(`[data-product-slot="${slot}"]`)));
  // A piece goes to the first slot whose selector it matches; "buy" is last because its "p" catches the sold-out note.
  const PRODUCT_PARTS = [
    ['gallery', '.product-detail__gallery'], ['breadcrumb', '.product-detail__breadcrumb'], ['category', '.product-detail__eyebrow'],
    ['title', '#pagosya-product-title'], ['rating', '.product-detail__rating'], ['pricing', '.product-detail__pricing'],
    ['description', '.product-detail__intro,.product-detail__more'], ['highlights', '.product-detail__highlights,.product-detail__chips'],
    ['delivery', '.product-detail__assurances'], ['info', '.product-tabs,[role=tabpanel],.product-detail__facts,.product-delivery-list'],
    ['bundles', '.product-detail__bundles,.product-detail__bundle-links'], ['related', '.product-detail__related'], ['reviews', '.product-detail__reviews'],
    ['checks', '.product-detail__checks'],
    ['buy', '.product-detail__options,.product-detail__box,.product-detail__purchase,.product-detail__buy,.product-detail__status,p'],
  ];
  // Purchase terms and anything unrecognised are never lost: they follow the buy slot when the template has no place for them.
  const PRODUCT_DROPPABLE = new Set(['breadcrumb', 'category', 'rating', 'description', 'bundles', 'related', 'reviews']);
  function applyProductPageTemplate() {
    const template = productPageTemplate();
    const layout = detail.querySelector(':scope > .product-detail__layout');
    if (!template || !layout) return;
    const copy = layout.querySelector(':scope > .product-detail__copy');
    const pieces = [...[...layout.children].filter(child => child !== copy), ...(copy ? [...copy.children] : []),
      ...[...detail.children].filter(child => child.matches('.product-detail__bundles,.product-detail__bundle-links,.product-detail__related,.product-detail__reviews'))];
    // YAPI's long page (features, story, details, compare, questions): the half drawn before the reviews and the half after them.
    const reviewsPiece = detail.querySelector(':scope > .product-detail__reviews');
    const longParts = [...detail.children].filter(child => child.matches('.product-long'));
    const longBefore = longParts.filter(part => !reviewsPiece || Boolean(part.compareDocumentPosition(reviewsPiece) & Node.DOCUMENT_POSITION_FOLLOWING));
    const longAfter = longParts.filter(part => !longBefore.includes(part));
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
      else if (name === 'checks' && slot('pricing')) slot('pricing').after(piece);
      else if (name && PRODUCT_DROPPABLE.has(name)) piece.remove();
      else followers.push(piece);
    }
    if (followers.length) slot('buy').after(...followers);
    // Owner 2026-10-27 (Esencial): with no place of its own the long page fell after the template's reviews and related products.
    // A "long" slot takes it whole; otherwise it goes around the template's reviews, as on the kit's own page.
    const anchor = root.querySelector('[data-product-slot="bundles"],[data-product-slot="reviews"],[data-product-slot="related"]');
    if (slot('long')) slot('long').append(...longBefore, ...longAfter);
    else if (anchor) { anchor.before(...longBefore); if (slot('reviews')) slot('reviews').after(...longAfter); else anchor.before(...longAfter); }
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
    const shellRows = [];
    const packLines = [];
    const lineViews = [];
    for (const [id, quantity] of cart) {
      const line = cartLine(id);
      if (!line) continue;
      const { p, variant, name, amount } = line;
      total += amount * quantity; count += quantity;
      packLines.push({ p, amount, quantity, cadence: line.cadence });
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
      rows.push(`<li class="order-item" data-part="cart-line"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" data-part="cart-line-media" src="${escape(image)}"${responsiveAttrs(image, "72px")} alt="" loading="lazy" style="object-position:${escape(imagePosition(p, image))}" />` : ''}<div class="order-item__body"><div class="order-item__head"><strong>${escape(p.name)}</strong><span>${money(amount * quantity, p.currency)}</span></div>${option ? `<p class="order-item__option">${escape(option)}</p>` : ''}${unitCopy}${few}<div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}" ${checkingOut || remaining(p, variant, line.picks) <= 0 ? "disabled" : ""}>+</button></div></div></li>`);
      lineViews.push({ id, p, name, amount, quantity, image, option,
        unit: quantity > 1 || saved || later ? `${money(amount, p.currency)} ${later || 'c/u'}${saved ? ` · antes ${money(listUnit, p.currency)}` : ''}` : '',
        stock: Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? (p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`) : '' });
      const view = lineViews[lineViews.length - 1];
      shellRows.push(shellLineMarkup({ id, p, name, amount, quantity, image, option, unit: view.unit, stock: view.stock, canAdd: !checkingOut && remaining(p, variant, line.picks) > 0 }));
    }
    // Showcase commerce: a pack the shopper picked shows its saving here, as the checkout will price it.
    const packSaving = cartPackSaving(packLines);
    savings += packSaving; total -= packSaving;
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(count);
      if (!CONTROLS) return;
      // The badge hides at zero (controls.css); the plain label around it reads «Carrito, 1 producto» / «…, 2 productos».
      el.toggleAttribute('data-empty', count === 0);
      const unit = el.parentElement?.querySelector('[data-ctl-unit]');
      if (unit) unit.textContent = count === 1 ? ' producto' : ' productos';
    });
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
      const mode = review ? (["payment", "done"].includes(el.dataset.checkoutReview) ? el.dataset.checkoutReview : "review") : null;
      const payment = mode === "payment", done = mode === "done";
      const action = review ? done ? "data-shell-close" : payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? done ? "Volver a la tienda" : payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
      el.innerHTML = `<ul class="${review ? "pya-co__lines order-items" : "order-items"}">${(review ? shellRows : rows).join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>${cartSuggestionsMarkup()}${review && !digitalOnlyCart() && store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : review && !digitalOnlyCart() && store.shippingEnabled ? '<label class="order-field">Entrega<select name="method"></select></label>' : ""}${review && !digitalOnlyCart() && !store.shippingEnabled && store.locations?.length ? '<fieldset data-delivery-address hidden><legend>Entrega a domicilio</legend><label class="order-field">Dirección y referencia<textarea name="shippingAddress" rows="3" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia"></textarea></label><p class="order-note">Podrás compartir tu ubicación actual al completar tus datos en el pago.</p></fieldset>' : ''}${!digitalOnlyCart() && store.shippingEnabled && review ? `<fieldset data-shipping><legend>Envío</legend>${store.shippingCarriersEnabled ? `${hosted ? departmentMarkup(checkoutAnswers) : destinationMarkup(checkoutAnswers)}<input type="hidden" name="shippingAddress" value="${escape(previousAddress)}">` : `<label class="order-field">Dirección<input name="shippingAddress" maxlength="300" autocomplete="street-address" value="${escape(previousAddress)}"></label>`}<label class="order-field">País de entrega (código de dos letras)<input name="shippingCountry" maxlength="2" placeholder="BO" autocomplete="country"></label><label class="order-field">Código postal<input name="shippingPostalCode" maxlength="20" autocomplete="postal-code"></label><button type="button" data-shipping-quote>Calcular envío</button><label class="order-field">Opción de envío<select name="shippingZoneId"><option value="">Calcula las opciones disponibles</option></select></label><p data-shipping-status role="status" aria-live="polite"></p></fieldset>` : ''}${review && store.creditsEnabled ? `<label class="order-field"><span class="pya-co__label">Tarjeta de regalo o saldo</span><input name="creditCode" maxlength="39" autocomplete="off" spellcheck="false" placeholder="Tarjeta de regalo o saldo" value="${escape(previousCredit)}"></label><button type="button" data-credit-apply>Aplicar saldo</button><p data-credit-status role="status"></p>` : ''}${savings > 0 ? `<div class="order-savings"><span>Ahorras</span><strong>${money(savings, products()[0]?.currency)}</strong></div>` : ''}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">${review ? 'El total final se confirma al pagar.' : 'El total final se confirma en el checkout.'}</p>${review && (store.bundlesEnabled || store.creditsEnabled) ? '<p data-bundle-quote-status role="status"></p>' : ''}${review && !payment && subscriptionLineInCart() ? `<label class="commerce-consent"><input type="checkbox" name="subscriptionConsent"${consentChecked ? ' checked' : ''}> ${escape(consentText(subscriptionLineInCart().cadence))}</label>` : ''}${review ? `<button class="pya-co__pay" ${action} type="button" ${!done && (!ready || !count || checkingOut || previewOptions) ? "disabled" : ""}>${actionLabel}${done ? "" : `<span class="pya-co__pay-total" aria-hidden="true"></span>`}</button>` : `<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut || previewOptions ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`}`;
      const lineTemplate = cartLineTemplate();
      if (lineTemplate && !review) applyLineTemplate(el, lineViews, lineTemplate);
      const panelTemplate = review ? null : cartTemplate();
      if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);
      if (!count && PACK_MOTIFS.length && !review) placeEmptyMotif(el);
      if (hosted) secureFields(el, ['shippingAddress', 'creditCode'], 'Tu dirección y tu saldo se piden en el formulario seguro de pagosYa al continuar.');
      if (previewOptions) {
        const note = document.createElement('p'); note.className = 'order-note';
        note.textContent = 'Puedes revisar tus opciones aquí. El pago estará disponible en la tienda publicada.';
        el.append(note);
      }
      for (const [name, value] of answers) { const field = [...el.querySelectorAll('input,textarea')].find(field => field.name === name); if (field) field.value = value; }
      if (review) shapeShellReview(el, { mode, count, photo: checkoutPhoto(lineViews.find(view => view.image)?.image) });
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      if (review) mirrorChoices(el);
      const branchInfo = document.createElement('p'); branchInfo.className = 'order-note'; branchInfo.setAttribute('data-branch-address', '');
      el.querySelector('[name=method]')?.closest('label')?.after(branchInfo);
      select?.addEventListener("change", () => { updateMethods(el); if (review) mirrorChoices(el); updateShipping(el); });
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
      if (review) syncShellTotals(el);
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
    // The store assistant takes the corner while it is on (spec 2026-10-13-store-assistant-design); a form the page placed in
    // its content stays, shown inline where it was put (2026-10-16: baek's quote page card stood empty with the bot on).
    // A form the design built a section for (a visible slot inside a section with its own heading) also stays where it
    // was put, assistant or not (PEPPA please 2026-10-20: «Contáctanos» stood empty while the form floated in the corner).
    const designed = Boolean(slot) && !slot.hidden && Boolean(slot.parentElement?.closest('section')?.querySelector('h1,h2,h3'));
    const inline = (Boolean(store.assistant) && Boolean(slot)) || designed;
    if (!store.contactFormEnabled || (store.assistant && !slot)) { if (slot) slot.hidden = true; return; }
    // A slot hidden in the markup is a placeholder (every showcase home has one): with the assistant on it stays hidden;
    // only a form the page shows in its content goes inline (final review 2026-10-16, I4).
    if (inline && slot.hidden && !slot.hasAttribute('data-contact-inline')) return;
    // Only an enabled store setting permits the legacy fallback; new stores default off.
    if (!slot && store.contactFormEnabled === true && (!fullProductPage || embeddedProductId) && !fullCheckoutPage && (!window.PAGOSYA_PREVIEW_PAGE || window.PAGOSYA_PREVIEW_PAGE === 'index.html')) {
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
    if (inline) {
      slot.setAttribute('data-contact-inline', '');
      // The page's own heading already introduces the form: the panel's heading would say it twice.
      if (slot.parentElement && slot.parentElement.querySelector(':scope > :is(h1,h2,h3)')) slot.setAttribute('data-contact-headed', '');
      panel.hidden = false;
    }
    const setOpen = (open, returnFocus = false) => {
      if (inline) return;
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
  // Inline (the store assistant owns the corner): the panel sits in the page where the slot is, with no launcher or close.
  // The inline form's placement is the platform's: a store rule pinning the slot fixed (models write one for a floating form)
  // must not pull it out of its card. A layered !important outranks the store's own CSS; colours and spacing stay the store's.
  contactStyle.textContent += '[data-pagosya-contact][data-contact-inline]{position:static!important;inset:auto!important;z-index:auto!important;transform:none!important;width:100%;margin:16px 0 0;pointer-events:auto}'
    + '[data-pagosya-contact][data-contact-inline] :is(.pagosya-contact-launcher,.pagosya-contact-close){display:none}'
    + '[data-pagosya-contact][data-contact-inline] .pagosya-contact-panel{position:static!important;inset:auto!important;width:100%;max-height:none;box-shadow:none}'
    + '[data-pagosya-contact][data-contact-inline][data-contact-headed] .pagosya-contact-heading{display:none}';
  // DNA stores: the launcher and panel take the store's tokens and DNA shape (inside the same layer, so its !important colours yield).
  contactStyle.textContent += ':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-launcher{border-radius:var(--kit-radius-panel);border:var(--kit-border) solid var(--kit-line)!important;background:var(--kit-accent)!important;color:var(--kit-on-accent)!important;box-shadow:0 12px 30px -14px #0009}'
    + ':root[data-dna-button] [data-pagosya-contact] .pagosya-contact-panel{border-radius:var(--kit-radius-panel);border:max(var(--kit-border),1px) solid var(--kit-line)!important;background:var(--kit-paper)!important;color:var(--kit-ink)!important;box-shadow:0 24px 60px -24px #0009}'
    + ':root[data-dna-button] [data-pagosya-contact] :is(input,textarea){border-radius:var(--kit-radius);border-color:var(--kit-line)}:root[data-dna-button] [data-pagosya-contact] .pagosya-contact-close{border-radius:var(--kit-radius)}'
    + ':root[data-dna-button] [data-pagosya-contact] h2{font-family:var(--store-heading-font,var(--brand-heading-font,inherit))}';
  contactStyle.textContent = '@layer pagosya-contact-base {' + contactStyle.textContent + '}';
  // A store's CSS reset (Tailwind preflight: *{border-width:0}, input{padding:0}, button{background:transparent}) is unlayered
  // and beat the layer above: fields with no line, «Enviar consulta» with no fill (PEPPA please 2026-10-20). This floor is as
  // weak as the reset and comes after it, handing those properties back to the layers; a store rule with a class still wins.
  contactStyle.textContent += ':where([data-pagosya-contact]) :is(input,textarea),:where([data-pagosya-contact] form)>button:where([type="submit"]){border:revert-layer;border-radius:revert-layer;padding:revert-layer;background:revert-layer;color:revert-layer}';
  document.head.append(contactStyle);
  // Design DNA variants (sub-project 5): form becomes per store, behaviour stays platform-owned. Every
  // variant is keyed on :root[data-dna-*] and this element exists only when the store has a DNA, so a
  // store without one renders exactly as before. Surfaces read one shared token set.
  const KIT_BUTTONS = ':where(.menu-add,.checkout-button,[data-pagosya-product] .product-detail__buy,.product-detail__sticky button,.cart-added button,.order-recommendations :is(button,a),[data-pagosya-contact] form>button[type=submit],[data-dna-fields] [data-account-gate] [data-part=submit])';
  const KIT_STEPPERS = ':where(.quantity button,.product-detail__quantity,.product-detail__box-stepper button)';
  /* The product page is platform-owned: its kit styles are unlayered and authored rules on its hooks are released
   * (releaseProductPageStyles), so the DNA reaches its buttons with an unlayered, product-scoped copy of the rules. */
  const PAGE_BUTTONS = '[data-pagosya-product][data-style] :is(.product-detail__buy,.product-detail__sticky button)';
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
    /* Cart: always the right-hand panel, half the screen (owner 2026-10-17: «the cart in half of screen, then confirmation,
       then payment»). Older DNA values (sheet, page, overlay) are drawn the same way; config-dna.js sets drawer for all. */
    ':root[data-dna-cart] .cart-drawer{border:0 solid var(--kit-line)}',
    ':root[data-dna-cart=drawer] .cart-drawer{inset:0 0 0 auto;width:min(760px,max(420px,50vw));max-width:100vw;border-left-width:var(--kit-border);border-radius:var(--kit-radius-panel) 0 0 var(--kit-radius-panel);background:color-mix(in srgb,var(--kit-ink) 3%,var(--kit-paper))}',
    ':root[data-dna-cart=drawer] .cart-drawer:not([open]){transform:translateX(100%);opacity:0}',
    '@starting-style{:root[data-dna-cart=drawer] .cart-drawer[open]{transform:translateX(100%);opacity:0}}',
    '@media(max-width:700px){:root[data-dna-cart=drawer] .cart-drawer{width:100vw;border-radius:0}}',
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
    // Placed at the photo's right edge and pulled left by translate(-100%): its width would come from the space to the
    // right of that edge, about 35px on a full-width photo, and «Vista rápida» wrapped letter by letter (Meathouse 2026-10-20).
    ':root[data-dna-card=quick-look] .menu-item__quick-look{position:absolute;z-index:3;top:calc(var(--look-top,0px) + 10px);left:calc(var(--look-left,100%) - 10px);right:auto;width:max-content;max-width:none;white-space:nowrap;min-height:36px;margin:0;padding:6px 14px;border:1px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);color:var(--kit-ink);font:inherit;font-size:13px;line-height:1.2;cursor:pointer;opacity:0;transform:translate(-100%,-4px);transition:opacity var(--motion-fast,200ms) var(--kit-ease),transform var(--motion-fast,200ms) var(--motion-ease,var(--kit-ease))}',
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
    // Only a gallery that drew its stack hides the big photo: one photo is never stacked (page.js), and hiding the stage then
    // left an empty frame on every single-photo product (Meathouse 2026-10-20).
    `:root[data-dna-gallery=stack] ${PC} .product-detail__gallery:has(.product-detail__stack) .product-detail__stage,:root[data-dna-gallery=mosaic] ${PC} .product-detail__gallery:has(.product-detail__stack) .product-detail__stage{display:none}:root[data-dna-gallery=stack] ${PC} .product-detail__gallery,:root[data-dna-gallery=mosaic] ${PC} .product-detail__gallery{position:relative}`,
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
  // Fields: checkout's .order-field controls; checkboxes and radios (terms, delivery choice) keep their look.
  const DRAWN_FIELD = ':is([data-pagosya-checkout] .order-field :is(input,select,textarea),[data-pagosya-cart][data-checkout-review] .order-field :is(input,select,textarea))';
  const DRAWN_TEXT_FIELD = `${DRAWN_FIELD}:not([type=checkbox],[type=radio])`;
  const COMMERCE_DRAW_CSS = [
    `:root[data-dna-fields] ${DRAWN_TEXT_FIELD}{box-sizing:border-box;min-height:48px;font:inherit;color:var(--kit-ink)}`,
    `:root[data-dna-fields] ${DRAWN_FIELD}:focus-visible{outline:2px solid var(--kit-accent);outline-offset:2px}`,
    `:root[data-dna-fields=boxed] ${DRAWN_TEXT_FIELD}{border:1px solid var(--kit-line);border-radius:var(--kit-radius);background:var(--kit-paper);padding:0 14px}`,
    `:root[data-dna-fields=underline] ${DRAWN_TEXT_FIELD}{border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 55%,var(--kit-paper));border-radius:0;background:transparent;padding:0 2px}`,
    `:root[data-dna-fields=filled] ${DRAWN_TEXT_FIELD}{border:0;border-bottom:2px solid color-mix(in srgb,var(--kit-ink) 40%,var(--kit-paper));border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:color-mix(in srgb,var(--kit-ink) 7%,var(--kit-paper));padding:0 14px}`,
    `:root[data-dna-fields=filled] ${DRAWN_TEXT_FIELD}:focus{border-bottom-color:var(--kit-accent)}`,
    `:root[data-dna-fields=pill] ${DRAWN_TEXT_FIELD}{border:1.5px solid var(--kit-line);border-radius:999px;background:var(--kit-paper);padding:0 18px}`,
    `:root[data-dna-fields] ${DRAWN_FIELD}:is(textarea){min-height:96px;padding-block:12px}:root[data-dna-fields=pill] ${DRAWN_FIELD}:is(textarea){border-radius:22px}`,
    /* The account form's fields (2026-10-18, florart): the store usually sets the form on its own panel, so a field takes its
     * colours from that panel (currentColor), never the page's paper, which drew black pills on a cream card. One attribute
     * and one element of weight: above the kit's account sheet, below a store rule on [data-account-gate] [data-part=input]. */
    `:where(:root[data-dna-fields]) [data-account-gate] input:where([data-part=input]){box-sizing:border-box;min-height:48px;font:inherit;color:inherit}`,
    `:where(:root[data-dna-fields]) [data-account-gate] input:where([data-part=input]):focus-visible{outline:2px solid var(--kit-accent);outline-offset:2px}`,
    `:where(:root[data-dna-fields=boxed]) [data-account-gate] input:where([data-part=input]){border:1px solid color-mix(in srgb,currentColor 40%,transparent);border-radius:var(--kit-radius);background:transparent;padding:0 14px}`,
    `:where(:root[data-dna-fields=underline]) [data-account-gate] input:where([data-part=input]){border:0;border-bottom:2px solid color-mix(in srgb,currentColor 55%,transparent);border-radius:0;background:transparent;padding:0 2px}`,
    `:where(:root[data-dna-fields=filled]) [data-account-gate] input:where([data-part=input]){border:0;border-bottom:2px solid color-mix(in srgb,currentColor 40%,transparent);border-radius:var(--kit-radius) var(--kit-radius) 0 0;background:color-mix(in srgb,currentColor 7%,transparent);padding:0 14px}`,
    `:where(:root[data-dna-fields=filled]) [data-account-gate] input:where([data-part=input]):focus{border-bottom-color:var(--kit-accent)}`,
    `:where(:root[data-dna-fields=pill]) [data-account-gate] input:where([data-part=input]){border:1.5px solid color-mix(in srgb,currentColor 40%,transparent);border-radius:999px;background:transparent;padding:0 18px}`,
    // Steps numbers the review's sections; ticket tears the summary's bottom edge; brand sets a panel beside the page.
    ':root[data-dna-checkout=steps] .checkout-review{counter-reset:checkout-step}',
    ':root[data-dna-checkout=steps] :is(.checkout-review__summary,.checkout-review__fields)>h2::before{counter-increment:checkout-step;content:counter(checkout-step);display:inline-grid;place-items:center;width:1.7em;height:1.7em;margin-right:.5em;border-radius:50%;background:var(--kit-accent);color:var(--kit-on-accent);font-size:.8em;vertical-align:.1em}',
    ':root[data-dna-checkout=ticket] .checkout-review__summary{font-variant-numeric:tabular-nums;-webkit-mask:linear-gradient(black 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,transparent,black 1deg 89deg,transparent 90deg) bottom/20px 10px repeat-x;mask:linear-gradient(black 0 0) top/100% calc(100% - 10px) no-repeat,conic-gradient(from -45deg at bottom,transparent,black 1deg 89deg,transparent 90deg) bottom/20px 10px repeat-x}',
    // The panel sits beside .checkout-page__inner, never inside it: the inner block stays the container the review measures.
    '@media(min-width:1100px){:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden]){display:grid;grid-template-columns:minmax(200px,.36fr) minmax(0,1fr);column-gap:clamp(24px,4vw,56px);align-items:start}:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden])::before{content:"";grid-column:1;grid-row:1;align-self:stretch;min-height:min(70vh,640px);border-radius:var(--kit-radius-panel);background:var(--checkout-panel,color-mix(in srgb,var(--kit-accent) 82%,var(--kit-paper)))}:root[data-dna-checkout=brand] [data-pagosya-checkout]:not([hidden])>.checkout-page__inner{grid-column:2;grid-row:1;width:100%;min-width:0;margin:0}:root[data-dna-checkout=brand] [data-pagosya-checkout] .checkout-review{margin-inline:0}}',
  ].join('\n');
  const DNA_PAGE_CSS = [
    ...PRODUCT_CARD_CSS,
    ...dnaButtonRules(PAGE_BUTTONS, PAGE_STEPPERS), ...dnaIdentityButtonRules(PAGE_BUTTONS),
    ':root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy{display:flex;justify-content:space-between;gap:0}',
    '@media(min-width:481px){:root[data-dna-button=split] [data-pagosya-product][data-style] .product-detail__buy-total:not(:empty){display:inline-block;margin-left:1em;padding-left:1em;border-left:1px solid color-mix(in srgb,currentColor 45%,transparent)}:root[data-dna-button=split] [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:none}}',
  ];
  /* One look per store (spec 2026-10-14). Unlayered, after the DNA styles, before YAPI's guarded CSS: the measured look wins
   * over drawn DNA and YAPI's touches win over both. Colours stay the store's own; protected controls are never selected. */
  const LOOK_FILTERED = ':where(:root:is([data-look-photo=mono],[data-look-photo=sepia],[data-look-photo=duotone],[data-look-photo=grain]))';
  // `caseTarget`: where case and italic go when it differs from `target` (the product title: a preset or YAPI touch styles its
  // case on [data-part=title], which must win over the look, while the kit sets no case of its own there).
  const lookHeadingRules = (target, caseTarget = target) => [
    `:where(:root[data-look-hf]) ${target}{font-family:var(--lk-hf)}`,
    `:where(:root[data-look-hw]) ${target}{font-weight:var(--lk-hw)}`,
    `:where(:root[data-look-hc=upper]) ${caseTarget}{text-transform:uppercase}`,
    `:where(:root[data-look-hc=none]) ${caseTarget}{text-transform:none}`,
    `:where(:root[data-look-ht]) ${target}{letter-spacing:var(--lk-ht)}`,
    `:where(:root[data-look-hi]) ${caseTarget}{font-style:italic}`,
  ];
  const LOOK_BASE_CSS = [
    ':root[data-look]{--lk-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#20211d)));--lk-paper:var(--store-background,var(--brand-background,var(--paper,#fff)));--lk-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--lk-ink) 16%,var(--lk-paper))))}',
    ':root[data-look-edge=hairline]{--lk-edge:0 0 0 1px var(--lk-line)}:root[data-look-edge=outline]{--lk-edge:0 0 0 2px var(--lk-ink)}:root[data-look-edge=offset]{--lk-edge:5px 5px 0 var(--lk-ink)}:root[data-look-edge=soft]{--lk-edge:0 14px 34px -16px color-mix(in srgb,var(--lk-ink) 55%,transparent)}',
    ':root[data-look-photo=mono]{--lk-filter:grayscale(1)}:root[data-look-photo=sepia]{--lk-filter:sepia(.65) saturate(.85)}:root[data-look-photo=duotone]{--lk-filter:url(#pagosya-look-duotone)}:root[data-look-photo=grain]{--lk-filter:url(#pagosya-look-grain);--lk-grain:url(#pagosya-look-grain)}',
  ];
  const LPC = '[data-pagosya-product][data-style]';
  const LOOK_CHIPS = `${LPC} .product-detail__values:not([data-kind=swatch]) [data-product-option]`;
  const LOOK_PDP_CSS = [
    ...lookHeadingRules(`${LPC} #pagosya-product-title`, `${LPC} [data-part=title]`),
    `:where(:root[data-look-label]) :is(${LPC} [data-part=eyebrow],${LPC} .product-detail__options legend,${LPC} .product-tabs [role=tab],${LPC} .product-detail__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rc] [data-pagosya-product]{--pd-radius:var(--lk-rc)}`,
    `:where(:root[data-look-rp]) ${LPC} :is(.product-detail__photo,.product-detail__stack img,.product-detail__related img){border-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rp]) ${LPC} .product-detail__stage{border-radius:var(--lk-rp);overflow:hidden}`,
    `:where(:root[data-look-rb]) :is(${LOOK_CHIPS},${LPC} .product-detail__badge,${LPC} .product-detail__navigation button,${LPC} .product-detail__navigation span){border-radius:var(--lk-rb)}`,
    `:where(:root[data-look]) ${LPC} :is(.product-detail__navigation button,.product-detail__navigation span){background:var(--pd-paper);color:var(--pd-ink)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC} .product-detail__stage{box-shadow:var(--lk-edge)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC} .product-detail__related img{box-shadow:var(--lk-edge)}`,
    `:where(:root[data-look-edge]:not([data-look-edge=none])) ${LPC}[data-style=dense] .product-detail__buybox{border-color:transparent;box-shadow:var(--lk-edge)}`,
    `:where(:root:is([data-look-edge=outline],[data-look-edge=offset]):not([data-dna-swatch=label])) ${LOOK_CHIPS}{box-shadow:var(--lk-edge)}`,
    `:where(:root:is([data-look-edge=outline],[data-look-edge=offset]):not([data-dna-swatch=label])) ${LOOK_CHIPS}[aria-pressed=true]{box-shadow:var(--lk-edge),inset 0 0 0 2px var(--pd-ink)}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails img,.product-detail__related img){filter:var(--lk-filter);transition:filter .25s}`,
    `${LOOK_FILTERED} ${LPC} :is(.product-detail__thumbnails button:is(:hover,:focus-visible) img,.product-detail__related li:is(:hover,:focus-within) img){filter:none}`,
    `:where(:root[data-look-photo=grain]) ${LPC} :is(.product-detail__photo,.product-detail__stack img){filter:var(--lk-grain)}`,
    `:where(:root[data-look-photo=polaroid]) ${LPC} .product-detail__stage{padding:12px 12px 40px;background:#fff;box-shadow:0 10px 26px -14px #0007}`,
    `:where(:root[data-look-aspect]) ${LPC} .product-detail__related img{aspect-ratio:var(--lk-aspect)}`,
    `:where(:root[data-look-aspect]) ${LPC}[data-style=dense][data-pagosya-product-page] .product-detail__photo{aspect-ratio:var(--lk-aspect);background:var(--pd-paper)}`,
    `:where(:root[data-look-surface=banded]) ${LPC} .product-detail__related{--pd-ink:var(--lk-paper);--pd-paper:var(--lk-ink);--pd-muted:color-mix(in srgb,var(--pd-ink) 70%,var(--pd-paper));--pd-line:color-mix(in srgb,var(--pd-ink) 22%,var(--pd-paper));--pd-tint:color-mix(in srgb,var(--pd-ink) 10%,var(--pd-paper));background:var(--pd-paper);color:var(--pd-ink);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
    `:where(:root[data-look-surface=tinted]) ${LPC} .product-detail__related{background:var(--pd-tint);padding:clamp(28px,5vw,64px) clamp(16px,4vw,48px)}`,
  ];
  /* Cards, catalog and cart. Only the kit's own cards: a YAPI-authored card ([data-custom-product]) is already the store's look. */
  const LKC = '[data-pagosya-catalog] .menu-item:not([data-custom-product])';
  const LOOK_CART_PHOTO = '.cart-drawer .order-item__photo';
  const LOOK_CARD_PHOTOS = `${LKC} :is(.menu-item__image,.menu-item__image-alt)`;
  const LOOK_EDGED = ':where(:root[data-look-edge]:not([data-look-edge=none]))';
  const LOOK_SURFACE_CSS = [
    ...lookHeadingRules(`:is(.commerce-page-title,[data-pagosya-catalog] .catalog-group__title,${LKC} .menu-item__copy h3,.cart-drawer__header h2)`),
    `:where(:root[data-look-label]) :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){text-transform:uppercase;letter-spacing:var(--lk-lt);font-weight:var(--lk-lw)}`,
    `:root[data-look-rp]{--kit-photo-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rp]) :is(${LOOK_CARD_PHOTOS},${LOOK_CART_PHOTO}){border-radius:var(--lk-rp)}`,
    `:where(:root[data-look-rc]) ${LKC}{border-radius:var(--lk-rc)}`,
    `:where(:root[data-look-rb]) :is([data-pagosya-catalog] .catalog-tabs a,${LKC} .menu-item__badge){border-radius:var(--lk-rb)}`,
    `${LOOK_EDGED} :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-shadow:var(--lk-edge)}`,
    `${LOOK_FILTERED} :is(${LOOK_CARD_PHOTOS},${LOOK_CART_PHOTO}){filter:var(--lk-filter)}`,
    `@media(hover:hover){${LOOK_FILTERED} ${LKC}:hover :is(.menu-item__image,.menu-item__image-alt){filter:none}}`,
    `${LOOK_FILTERED} ${LKC}:focus-within :is(.menu-item__image,.menu-item__image-alt){filter:none}`,
    `:where(:root[data-look-photo=polaroid]) :is(${LKC} .menu-item__image,${LOOK_CART_PHOTO}){box-sizing:border-box;padding:6px 6px 20px;background:#fff;box-shadow:0 6px 18px -8px #0006;border-radius:2px}`,
    `:where(:root[data-look-photo=tight]) ${LKC} .menu-item__image{object-view-box:inset(10%)}`,
    `:where(:root[data-look-aspect]) ${LKC} .menu-item__image{aspect-ratio:var(--lk-aspect)}`,
    `:where(:root[data-look-tilt]) ${LKC}:nth-child(odd) .menu-item__image{rotate:calc(var(--lk-tilt) * -1)}`,
    `:where(:root[data-look-tilt]) ${LKC}:nth-child(even) .menu-item__image{rotate:var(--lk-tilt)}`,
  ];
  if (hasDna) {
    const dnaStyle = document.createElement('style');
    dnaStyle.dataset.pagosyaKit = 'dna';
    // Every variant sits in the pagosya-dna layer: above the kit defaults, below the store's own (unlayered) CSS.
    dnaStyle.textContent = `@layer pagosya-dna {\n${[...DNA_CSS, DNA_REDUCED_MOTION].join('\n')}\n}\n${DNA_PAGE_CSS.join('\n')}`;
    document.head.append(dnaStyle);
    // Drawn checkout layout and field style (spec 2026-10-11 commerce surfaces), unlayered like DNA_PAGE_CSS. The field rules
    // out-rank the account CSS by specificity (it is appended later, on demand), so order does not matter. Only with a draw.
    if (document.documentElement.hasAttribute('data-dna-checkout') || document.documentElement.hasAttribute('data-dna-fields')) {
      const drawStyle = document.createElement('style');
      drawStyle.dataset.pagosyaKit = 'commerce-draw';
      drawStyle.textContent = COMMERCE_DRAW_CSS;
      document.head.append(drawStyle);
    }
  }
  if (LOOK) {
    const lookStyle = document.createElement('style');
    lookStyle.dataset.pagosyaKit = 'look';
    lookStyle.textContent = [...LOOK_BASE_CSS, ...LOOK_PDP_CSS, ...LOOK_SURFACE_CSS].join('\n');
    document.head.append(lookStyle);
    lookFilters();
  }
  /* YAPI's guarded CSS: the API sanitized it (product-theme-css.ts) before it reached config.dna. This check is defence in
   * depth only, a coarse refusal of what the sanitizer never emits; it does not re-implement the sanitizer. It goes after
   * the kit's own styles and the look, so an equally specific theme rule wins. */
  const THEME_CSS_KEYS = [['productCss', 'product-theme'], ['catalogCss', 'catalog-theme'], ['cardCss', 'card-theme'], ['cartCss', 'cart-theme']];
  if (hasDna) for (const [key, name] of THEME_CSS_KEYS) {
    const themeCss = config.dna[key];
    if (typeof themeCss === 'string' && themeCss && themeCss.length <= 16000 && !/@\s*import|url\s*\(|expression\s*\(|<|\\|position\s*:\s*fixed|pointer-events|!\s*important/i.test(themeCss)) {
      const themeStyle = document.createElement('style');
      themeStyle.dataset.pagosyaKit = name;
      themeStyle.textContent = themeCss;
      document.head.append(themeStyle);
    }
  }
  /* Showcase commerce (spec 2026-10-19): card insides, product spotlights and catalog filters, for every store. One layer below
   * the store's own CSS, so an authored card or a YAPI theme always wins. */
  const SHOWCASE_CSS = [
    '[data-pagosya-catalog] .menu-item__eyebrow{margin:6px 0 0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.7}',
    '[data-pagosya-catalog] .menu-item__points{list-style:none;margin:6px 0;padding:0;display:grid;gap:3px;font-size:13px}',
    '[data-pagosya-catalog] .menu-item__points li::before{content:"✓";margin-right:6px;color:var(--store-accent,currentColor)}',
    '[data-pagosya-catalog] .menu-item__chips{display:flex;flex-wrap:wrap;align-items:center;align-content:flex-start;gap:4px;margin:6px 0}',
    '[data-pagosya-catalog] .menu-item__chips span{font-size:10px;font-weight:700;letter-spacing:.06em;border:1px solid currentColor;border-radius:99px;padding:3px 8px;opacity:.85}',
    '[data-pagosya-catalog] .menu-item__chips [data-swatch]{width:14px;height:14px;padding:0;border-radius:50%;background:var(--swatch);border-color:rgba(0,0,0,.2)}',
    '[data-pagosya-catalog] .menu-item__deal{margin:4px 0;font-size:12px;font-weight:700;color:#2e7d4f}',
    '[data-pagosya-catalog] .menu-item__save{display:inline-block;margin:4px 0 0 6px;padding:2px 8px;border-radius:99px;background:var(--store-accent,#c0392b);color:var(--store-on-accent,#fff);font-size:10px;font-weight:800;letter-spacing:.04em;vertical-align:middle}',
    '[data-pagosya-catalog] .menu-item[data-card-best]{position:relative}',
    '[data-pagosya-catalog] .menu-item__best{position:absolute;top:10px;right:10px;z-index:2;padding:3px 9px;border-radius:99px;background:var(--store-accent,#c0392b);color:var(--store-on-accent,#fff);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}',
    '[data-pagosya-catalog][data-card-design=showcase]{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:20px}',
    '[data-pagosya-catalog][data-card-design=showcase] .menu-item:not([data-custom-product]){position:relative;padding:16px;border-radius:var(--store-radius,18px);background:var(--store-surface,#fbf6ea)}',
    '[data-pagosya-catalog][data-card-design=showcase] .menu-item[data-card-best]:not([data-custom-product]){background:var(--store-foreground,#1d2b4f);color:var(--store-background,#fff)}',
    '[data-pagosya-catalog][data-card-design=showcase] .menu-item:not([data-custom-product]) .menu-add{width:100%;justify-content:center;border-radius:99px}',
    '[data-pagosya-catalog][data-card-design=split] .menu-item:not([data-custom-product]){display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:14px;align-items:center}',
    '@media(max-width:640px){[data-pagosya-catalog][data-card-design=split] .menu-item:not([data-custom-product]){grid-template-columns:1fr}}',
    '[data-pagosya-spotlight]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}',
    '[data-pagosya-spotlight] .spotlight{display:grid;gap:8px;padding:16px;border-radius:var(--store-radius,16px);background:var(--store-surface,#fff);border:1px solid rgba(0,0,0,.08)}',
    '[data-pagosya-spotlight] .spotlight__image{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--store-radius,12px)}',
    '[data-pagosya-spotlight] .spotlight__name{margin:0;font-family:var(--store-heading-font,inherit)}',
    '[data-pagosya-spotlight] .spotlight__price{margin:0;font-weight:700}',
    '[data-pagosya-spotlight] .spotlight__add{width:100%;justify-content:center}',
    '[data-pagosya-spotlight] video{width:100%;border-radius:var(--store-radius,16px);background:#111}',
    '@media(max-width:760px){[data-pagosya-spotlight]{grid-template-columns:1fr}}',
  ];
  /* Sort & filter styles (spec 2026-10-21): their own unlayered sheet, first in the head. In the low kit layer Tailwind's reset
   * (`*{border-width:0}`, unlayered) won and stripped every chip and the search field (live check, NOA VARGAS rev 8); first in
   * source order, a store's own stylesheet still wins at equal weight. */
  const FILTERS_CSS = [
    '/* Sort & filter styles (spec 2026-10-21): bar, chips and sidebar, drawn with the store\'s tokens. */',
    '.catalog-filters{grid-column:1/-1;display:grid;gap:12px;margin:0 0 20px;font-family:var(--store-body-font,inherit);color:var(--store-foreground,inherit)}',
    '.catalog-filters button{font:inherit;color:inherit;cursor:pointer}',
    '.catalog-search{position:relative;display:flex;align-items:center;max-width:560px}',
    '.catalog-search__label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}',
    '.catalog-search__icon{position:absolute;left:14px;top:50%;width:14px;height:14px;margin-top:-9px;border:1.6px solid currentColor;border-radius:50%;opacity:.6;pointer-events:none}',
    '.catalog-search__icon::after{content:"";position:absolute;right:-6px;bottom:-5px;width:7px;height:1.6px;background:currentColor;transform:rotate(45deg)}',
    '.catalog-search input{width:100%;min-height:46px;padding:0 44px 0 42px;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:var(--store-radius,999px);background:var(--store-background,#fff);color:inherit;font:inherit;font-size:15px;-webkit-appearance:none;appearance:none}',
    '.catalog-search input::-webkit-search-cancel-button{display:none}',
    '.catalog-search input:focus{outline:2px solid var(--store-accent,currentColor);outline-offset:2px}',
    '.catalog-search__clear{position:absolute;right:4px;width:40px;height:40px;border:0;border-radius:50%;background:none;font-size:14px}',
    '.catalog-filters__bar,.catalog-filters__top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}',
    '.catalog-filters__count{margin:0;font-size:13px;letter-spacing:.04em;opacity:.7}',
    '.catalog-filters__bar .cf-sort,.catalog-filters__top .cf-sort{margin-left:auto}',
    '.cf-open{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border:1px solid currentColor;border-radius:var(--store-radius,999px);background:none;font-size:13px;letter-spacing:.06em;text-transform:uppercase}',
    '.cf-link{border:0;background:none;padding:0 4px;min-height:44px;font-size:13px;text-decoration:underline;text-underline-offset:4px}',
    '.cf-caret{display:inline-block;width:7px;height:7px;margin-left:8px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg)}',
    '.cf-sort{position:relative}',
    '.cf-sort__toggle{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;border:0;background:none;font-size:14px}',
    '.cf-sort__toggle strong{margin-left:4px;font-weight:600}',
    '.cf-sort__list{position:absolute;right:0;top:100%;z-index:30;min-width:200px;margin:6px 0 0;padding:6px;list-style:none;background:var(--store-background,#fff);border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;box-shadow:0 18px 40px -18px rgb(0 0 0 / .35)}',
    '.cf-sort__list[hidden]{display:none}',
    '.cf-sort__list [role=option]{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;font-size:14px;cursor:pointer}',
    '.cf-sort__list [role=option]:hover,.cf-sort__list [role=option]:focus{background:color-mix(in srgb,currentColor 8%,transparent);outline:none}',
    '.cf-sort__list [aria-selected=true]{font-weight:700}',
    '.cf-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.cf-chip{flex:0 0 auto;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:var(--store-radius,999px);background:none;font-size:14px;transition:background .15s,color .15s}',
    '.cf-chip[aria-pressed=true]{background:var(--store-foreground,#111);border-color:var(--store-foreground,#111);color:var(--store-background,#fff)}',
    '.cf-chip [data-swatch]{width:22px;height:22px;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px rgb(0 0 0 / .15)}',
    '.cf-chip[data-swatch-chip][aria-pressed=true] [data-swatch]{box-shadow:0 0 0 2px var(--store-background,#fff)}',
    '.cf-chip--plain{border-color:transparent;padding:0 6px;border-radius:0;font-size:13px;letter-spacing:.1em;text-transform:uppercase}',
    '.cf-chip--plain[aria-pressed=true]{background:none;color:inherit;border-color:transparent;box-shadow:inset 0 -2px 0 currentColor}',
    '.cf-switch{display:inline-flex;align-items:center;gap:12px;min-height:44px;padding:0;border:0;background:none;font-size:14px}',
    '.cf-switch__track{position:relative;width:40px;height:24px;border-radius:999px;background:color-mix(in srgb,currentColor 22%,transparent);transition:background .15s}',
    '.cf-switch__track::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--store-background,#fff);transition:transform .15s}',
    '.cf-switch[aria-checked=true] .cf-switch__track{background:var(--store-foreground,#111)}',
    '.cf-switch[aria-checked=true] .cf-switch__track::after{transform:translateX(16px)}',
    '.cf-range{display:grid;gap:6px}',
    '.cf-range__values{display:flex;gap:8px;margin:0;font-size:14px}',
    '.cf-range input[type=range]{width:100%;min-height:28px;margin:0;background:none;-webkit-appearance:none;appearance:none}',
    '.cf-range input[type=range]::-webkit-slider-runnable-track{height:2px;background:color-mix(in srgb,currentColor 30%,transparent)}',
    '.cf-range input[type=range]::-moz-range-track{height:2px;background:color-mix(in srgb,currentColor 30%,transparent)}',
    '.cf-range input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-8px;border-radius:50%;background:var(--store-foreground,#111);border:2px solid var(--store-background,#fff)}',
    '.cf-range input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--store-foreground,#111);border:2px solid var(--store-background,#fff)}',
    '.cf-group{display:grid;gap:10px;margin:0}',
    '.cf-group__title{margin:0;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.75}',
    '.catalog-filters__active{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0}',
    '.catalog-filters__active [data-filter-remove]{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:0;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:13px}',
    '.catalog-filters__row{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}',
    '.catalog-filters__row::-webkit-scrollbar{display:none}',
    '.catalog-filters__row--options{gap:20px}',
    '.catalog-filters__row--options .cf-chips{flex-wrap:nowrap}',
    '.cf-drawer{position:fixed;inset:0;z-index:2147482000;display:flex;justify-content:flex-end;background:rgb(0 0 0 / .35)}',
    '.cf-drawer[hidden]{display:none}',
    '.cf-drawer__panel{display:flex;flex-direction:column;width:min(420px,100%);height:100%;background:var(--store-background,#fff);color:var(--store-foreground,#111);animation:cf-in .2s ease-out}',
    '.cf-drawer__head{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent)}',
    '.cf-drawer__head h2{margin:0;font-family:var(--store-heading-font,inherit);font-size:20px}',
    '.cf-drawer__close{width:44px;height:44px;border:0;background:none;font-size:16px}',
    '.cf-drawer__body{flex:1;overflow:auto;display:grid;align-content:start;gap:24px;padding:24px}',
    '.cf-drawer__foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 24px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}',
    '.cf-done{flex:1;min-height:48px;border:0;border-radius:var(--store-radius,999px);background:var(--store-foreground,#111);color:var(--store-background,#fff)!important;font-weight:600}',
    '@keyframes cf-in{from{transform:translateX(24px);opacity:0}}',
    '@media(max-width:760px){.cf-drawer{align-items:flex-end}.cf-drawer__panel{width:100%;height:auto;max-height:85vh;border-radius:18px 18px 0 0;animation-name:cf-up}@keyframes cf-up{from{transform:translateY(24px);opacity:0}}}',
    '.catalog-filters[data-filter-style=sidebar] .catalog-filters__side,.catalog-filters[data-filter-style=browse] .catalog-filters__side{display:none}',
    /* browse (spec 2026-11-06, the Nike shop page): a head row over the grid — count left; filters, hide and sort right. */
    '.catalog-filters__head{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}',
    '.catalog-filters__tools{display:flex;flex-wrap:wrap;align-items:center;gap:4px 18px;margin-left:auto}',
    '.cf-hide{display:none;align-items:center;min-height:44px;padding:0 4px;border:0;background:none;font-size:14px}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip{position:relative;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:8px 0 4px}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip button{display:block;width:48px;height:48px;min-height:0;margin:0;padding:0;border:0;border-radius:6px;overflow:hidden;background:color-mix(in srgb,currentColor 6%,transparent);cursor:pointer}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip span{display:block;width:100%;height:100%;border-radius:0;box-shadow:none}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip img{display:block;width:100%;height:100%;object-fit:cover}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip button[aria-pressed=true]{box-shadow:inset 0 0 0 2px currentColor}',
    ':root .menu-item .menu-item__swatches.menu-item__swatches--strip button:focus-visible{outline:2px solid currentColor;outline-offset:2px}',
    '.menu-item__swatches-more{padding:0 4px;font-size:13px;opacity:.7}',
    '@media(max-width:600px){:root .menu-item .menu-item__swatches.menu-item__swatches--strip button{width:38px;height:38px}}',
    '.catalog-filters__side details>summary{display:flex;align-items:center;justify-content:space-between;min-height:44px;cursor:pointer;list-style:none;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}',
    '.catalog-filters__side details>summary::-webkit-details-marker{display:none}',
    '.catalog-filters__side details[open]>summary .cf-caret{transform:translateY(2px) rotate(-135deg)}',
    '@media(min-width:900px){',
    '[data-pagosya-catalog]:has(>.catalog-filters[data-filter-style=sidebar]){position:relative;padding-left:272px}',
    '.catalog-filters[data-filter-style=sidebar] .catalog-filters__side{display:block;position:absolute;left:0;top:0;bottom:0;width:240px}',
    '.catalog-filters__side-inner{position:sticky;top:96px;display:grid;gap:18px;max-height:calc(100vh - 120px);overflow:auto;padding-right:8px}',
    '.catalog-filters[data-filter-style=sidebar] .cf-open{display:none}',
    '[data-pagosya-catalog]:has(>.catalog-filters[data-filter-style=browse]:not([data-filters-hidden])){position:relative;padding-left:272px}',
    '.catalog-filters[data-filter-style=browse]:not([data-filters-hidden]) .catalog-filters__side{display:block;position:absolute;left:0;top:0;bottom:0;width:240px}',
    '.catalog-filters[data-filter-style=browse] .cf-open{display:none}',
    '.cf-hide{display:inline-flex}',
    '}',
    '@media(prefers-reduced-motion:reduce){.cf-drawer__panel{animation:none}.cf-chip,.cf-switch__track,.cf-switch__track::after{transition:none}}',
  ];
  const filtersStyle = document.createElement('style');
  filtersStyle.dataset.pagosyaKit = 'filters';
  filtersStyle.textContent = FILTERS_CSS.join('\n');
  document.head.prepend(filtersStyle);
  const showcaseStyle = document.createElement('style');
  showcaseStyle.dataset.pagosyaKit = 'showcase';
  showcaseStyle.textContent = `@layer pagosya-showcase {\n${SHOWCASE_CSS.join('\n')}\n}`;
  document.head.append(showcaseStyle);
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
  /** A colour swatch on a card: the card photo becomes that colour's, and the card's links open the product in it. */
  function pickCardSwatch(swatch) {
    const card = swatch?.closest('.menu-item'), photo = card?.querySelector('.menu-item__image');
    if (!photo) return false;
    const set = responsiveSrcset(swatch.dataset.cardSwatch);
    if (set) { photo.srcset = set; photo.sizes = photo.getAttribute('sizes') || CARD_SIZES; } else { photo.removeAttribute('srcset'); photo.removeAttribute('sizes'); }
    photo.src = swatch.dataset.cardSwatch; photo.style.objectPosition = '';
    card.querySelectorAll('[data-card-swatch]').forEach(button => button.setAttribute('aria-pressed', String(button === swatch)));
    // The card's links open the product in the colour the shopper picked (owner 2026-10-25).
    const colour = swatch.dataset.cardColour;
    if (colour) card.querySelectorAll('a.menu-item__details[href],a[data-product-link][href]').forEach(link => {
      const [path, hash] = link.getAttribute('href').split('#'), [base, query = ''] = path.split('?'), params = new URLSearchParams(query);
      params.set('color', colour);
      link.setAttribute('href', `${base}?${params}${hash !== undefined ? '#' + hash : ''}`);
    });
    return true;
  }
  // A browse strip (spec 2026-11-06) works in every store, DNA or not: pointing at a photo or tapping it picks that colour.
  const stripSwatch = event => event.target?.closest?.('.menu-item__swatches--strip [data-card-swatch]');
  if (!hasDna) document.addEventListener('click', event => { if (pickCardSwatch(stripSwatch(event))) event.preventDefault(); }, true);
  document.addEventListener('pointerover', event => { const swatch = stripSwatch(event); if (swatch) pickCardSwatch(swatch); }, { passive: true });
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
      if (pickCardSwatch(event.target?.closest?.('[data-card-swatch]'))) event.preventDefault();
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
    if (preview || config.demo) { showCheckout('payment'); location.hash = "pago-de-prueba"; return; }
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
    if (button.hasAttribute('data-product-more')) {
      const intro = detail.querySelector('.product-detail__intro'), open = !intro?.hasAttribute('data-expanded');
      intro?.toggleAttribute('data-expanded', open);
      button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Leer menos' : 'Leer más';
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
    // «Borrar filtros» (data-filters-clear="filters") keeps the search; «Borrar todo» clears it too (final review 2026-10-21).
    // After a clear the redraw replaces the button that had the focus: keyboard users land back on the filters (2026-10-21).
    const searchField = () => document.querySelector('.catalog-search input[name=q]');
    if (button.hasAttribute('data-filters-clear')) { const now = readFilterState(); writeFilterState({ orden: now.orden, precio: null, sets: {}, toggles: new Set(), q: button.getAttribute('data-filters-clear') === 'filters' ? now.q : '' }); render(); searchField()?.focus({ preventScroll: true }); return; }
    if (button.hasAttribute('data-filter-remove')) {
      const state = readFilterState(), raw = button.dataset.filterRemove;
      const key = button.dataset.key ?? raw.slice(0, raw.indexOf(':')), value = button.dataset.value ?? raw.slice(raw.indexOf(':') + 1);
      const index = [...document.querySelectorAll('.catalog-filters__active [data-filter-remove]')].indexOf(button);
      if (key === 'q') state.q = ''; else if (key === 'precio') state.precio = null; else if (value) state.sets[key] = (state.sets[key] || []).filter(v => v !== value); else state.toggles.delete(key);
      writeFilterState(state); render();
      const left = [...document.querySelectorAll('.catalog-filters__active [data-filter-remove]')];
      (left[Math.min(index, left.length - 1)] || searchField())?.focus({ preventScroll: true });
      return;
    }
    if (button.hasAttribute('data-offer-square') && button.closest('[data-pagosya-spotlight]')) {
      // A spotlight's squares choose how many its add button adds (subscriptions are chosen on the product page).
      const spot = button.closest('[data-pagosya-spotlight]'), [kind, value] = button.dataset.offerSquare.split(':');
      spot.querySelectorAll('[data-offer-square]').forEach(square => square.setAttribute('aria-checked', String(square === button)));
      const add = spot.querySelector('.spotlight [data-add]');
      if (kind === 'sub') { const id = spot.getAttribute('data-pagosya-spotlight'); if (id) openProduct(id, button); return; }
      if (add) add.dataset.quantity = kind === 'pack' ? value : '1';
      return;
    }
    if (button.hasAttribute('data-offer-square') && selectedProduct && button.closest('[data-pagosya-product]') === detail) {
      // Showcase commerce: a square picks the purchase mode and quantity; the buy box keeps its own state and totals.
      const [kind, value] = button.dataset.offerSquare.split(':');
      const choice = detail.querySelector('[data-subscription-choice]');
      if (choice) {
        const mode = choice.querySelector(`[name=purchaseMode][value="${kind === 'sub' ? 'subscribe' : 'once'}"]`); if (mode) mode.checked = true;
        const cadence = choice.querySelector('[name=subscriptionCadence]'); if (kind === 'sub' && cadence) { cadence.disabled = false; cadence.value = value; }
      }
      selectedQuantity = kind === 'pack' ? Number(value) : 1;
      updateQuantity();
      return;
    }
    if (button.hasAttribute('data-product-option')) {
      const index = Number(button.dataset.productOption), groups = optionGroups(selectedProduct);
      if (!groups) return;
      const previous = [...selectedOptions];
      const chosen = [...selectedOptions]; chosen[index] = groups[index].values[Number(button.dataset.optionValue)];
      // A sold-out colour is still chosen (owner 2026-10-25): its name, photo and «Agotado» show; the later choices it rules out
      // are cleared rather than swapped for available ones.
      selectedOptions = button.hasAttribute('data-unavailable')
        ? chosen.map((value, i) => i <= index || selectedProduct.variants.some(v => variantValues(v).every((candidate, j) => j > i || candidate === chosen[j])) ? value : undefined)
        : completeSelection(selectedProduct, chosen);
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
    // The test payment ends on the calm checkout's confirmation; «Volver a la tienda» (data-shell-close) leaves it.
    if (button.hasAttribute("data-finish-demo") && (preview || config.demo)) {
      showCheckout("done"); location.hash = "pedido-de-prueba";
      message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      return;
    }
    if (button.hasAttribute("data-shell-close")) {
      if (fullCheckoutPage) { location.href = "index.html"; return; }
      closeCheckout(); location.hash = checkoutPreviousHash;
      message("Prueba completada. No se creó ningún pedido ni se realizó ningún cobro.");
      return;
    }
    if (button.hasAttribute("data-category")) { category = button.dataset.category; render(); }
    if (button.hasAttribute("data-bundle-add") && ready) {
      const bundle = (Array.isArray(store.bundles) ? store.bundles : []).find(candidate => candidate.id === button.dataset.bundleAdd), entries = bundleEntries(bundle);
      if (!bundle || !entries.length || entries.some(entry => !entry.p || !simpleProduct(entry.p) || remaining(entry.p) < entry.quantity)) { message("Este paquete ya no está disponible completo."); return; }
      track('add_to_cart', undefined, { value: entries.reduce((sum, entry) => sum + price(entry.p) * entry.quantity, 0), currency: entries[0].p.currency });
      for (const entry of entries) analytics('add_to_cart', { productId: entry.p.id });
      for (const entry of entries) cart.set(lineKey(entry.p.id), (cart.get(lineKey(entry.p.id)) || 0) + entry.quantity);
      renderCart(); message(`${bundle.name} añadido a ${ADDED_TO}.`);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${bundle.name} añadido a ${ADDED_TO}.`;
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
      const units = button.classList.contains('product-detail__buy') ? Math.min(selectedQuantity, remaining(p, variant, line.picks)) : Math.min(Math.max(1, Number(button.dataset.quantity) || 1), remaining(p, variant, line.picks));
      cart.set(key, quantity + units); renderCart();
      // The added notice is its own live region: the page status line repeats it only when no notice shows (The Bake Lab 2026-10-17).
      message(addedFeedback({ ...p, name }, button, event.detail === 0) ? '' : `${name} añadido a ${ADDED_TO}.`);
      if (MOTIFS.length) playMotifs(p);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${name} añadido a ${ADDED_TO}.`;
    }
    if (button.hasAttribute("data-remove-line")) { cart.delete(button.dataset.removeLine); renderCart(); message("Pedido actualizado."); return; }
    if (button.hasAttribute("data-remove")) { const id = button.dataset.remove; const quantity = cart.get(id) || 0; if (quantity > 1) cart.set(id, quantity - 1); else cart.delete(id); renderCart(); message("Pedido actualizado."); }
    if (button.hasAttribute("data-checkout")) openCheckout(button);
    if (button.hasAttribute('data-shipping-quote')) { void shippingQuote(button.closest('[data-pagosya-cart]')); return; }
    if (button.hasAttribute("data-pay")) void checkout(button);
    if (button.hasAttribute("data-retry")) void load();
  });
  // Carousels (spec 2026-10-18-trust-draw-design.md): [data-pagosya-carousel] shows one slide at a time, so a store with many
  // photos or reviews never stacks them into a wall. The store designs the slides; the kit adds swiping (scroll-snap), the
  // arrows and dots after the track, the keyboard, and a slow turn for data-carousel-auto (never under reduced motion).
  const carouselStyle = document.createElement('style');
  carouselStyle.textContent = `@layer pagosya-commerce {
    [data-pagosya-carousel]{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden;scroll-snap-type:x mandatory!important;scrollbar-width:none;overscroll-behavior-x:contain}
    [data-pagosya-carousel]::-webkit-scrollbar{display:none}
    [data-pagosya-carousel]>*{flex:0 0 calc((100% - (var(--pya-per-view,1) - 1) * 16px) / var(--pya-per-view,1));box-sizing:border-box;min-width:0;margin:0;scroll-snap-align:start}
    [data-pagosya-carousel][data-carousel-per-view]{gap:16px!important}
    [data-pagosya-carousel] img{display:block;max-width:100%}
    /* One slide never outgrows the screen: a square photo at full width made Gramiyaa's slider 1,800 px tall (2026-10-26). The
       store's own limit wins; contain only fills in where the store set no fit of its own, so a photo is never squashed. */
    [data-pagosya-carousel]>* :is(img,video){max-height:min(72vh,620px);object-fit:contain}
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
  const carouselWatchers = new WeakMap();
  function mountCarousels() { document.querySelectorAll('[data-pagosya-carousel]').forEach(mountCarousel); }
  /** Mounts one track; the reviews slot mounts again once the store's reviews arrive. */
  function mountCarousel(track) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearInterval(carouselTimers.get(track));
    if (track.nextElementSibling?.classList.contains('pagosya-carousel__controls')) track.nextElementSibling.remove();
    // Stores hide every slide but the first until the kit has the track (`:not([data-carousel-ready]) > :not(:first-child)`,
    // Dulce Horno 2026-10-26); without this mark their arrows and dots had nothing to scroll to.
    track.setAttribute('data-carousel-ready', '');
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
    // Video slides (spec 2026-10-18 A2): muted and inline; only the slide on screen plays, and only while the carousel is in
    // view. Under reduced motion nothing plays by itself and the video's own controls show.
    const videos = slides.map(slide => slide.querySelector('video'));
    videos.forEach(video => {
      if (!video) return;
      video.muted = true; video.defaultMuted = true; video.loop = true; video.autoplay = false;
      video.setAttribute('playsinline', ''); video.removeAttribute('autoplay');
      if (reduced) video.controls = true;
    });
    let inView = false;
    const syncVideos = () => {
      const at = current();
      videos.forEach((video, index) => {
        if (!video) return;
        if (!reduced && inView && !document.hidden && index === at) { const playing = video.play?.(); if (playing?.catch) playing.catch(() => {}); }
        else video.pause?.();
      });
    };
    if (videos.some(Boolean)) {
      carouselWatchers.get(track)?.disconnect();
      if (typeof IntersectionObserver === 'function') {
        const watcher = new IntersectionObserver(entries => { inView = entries.some(entry => entry.isIntersecting); syncVideos(); }, { threshold: 0.35 });
        watcher.observe(track);
        carouselWatchers.set(track, watcher);
      }
      document.addEventListener('visibilitychange', syncVideos);
    }
    const mark = () => { const at = current(); dots.forEach((dot, index) => dot.setAttribute('aria-current', String(index === at))); syncVideos(); };
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
    // A slide taller than the screen on a wide track (a store's 4-up card rail turned into one card at 1,240 px, Gramiyaa
    // 2026-10-26) shows two to four slides at a time instead; a phone keeps one.
    const fit = () => {
      track.removeAttribute('data-carousel-per-view'); track.style.removeProperty('--pya-per-view');
      const tall = Math.max(...slides.map(slide => slide.getBoundingClientRect().height));
      if (track.clientWidth < 640 || !(tall > innerHeight * 0.9)) return;
      const perView = Math.min(slides.length, 4, Math.max(2, Math.ceil(tall / (innerHeight * 0.6))));
      track.setAttribute('data-carousel-per-view', ''); track.style.setProperty('--pya-per-view', String(perView));
    };
    fit();
    if (!track.__pyaFitWired) { track.__pyaFitWired = true; let resize = 0; addEventListener('resize', () => { cancelAnimationFrame(resize); resize = requestAnimationFrame(() => track.__pyaFit?.()); }); }
    track.__pyaFit = fit;
    mark();
    if (!track.hasAttribute('data-carousel-auto') || reduced) return;
    let paused = false;
    const pause = value => () => { paused = value; };
    for (const element of [track, controls]) {
      element.addEventListener('pointerenter', pause(true)); element.addEventListener('pointerleave', pause(false));
      element.addEventListener('focusin', pause(true)); element.addEventListener('focusout', pause(false));
    }
    // The auto-turn waits while a video slide is on screen: the visitor moves on when they want.
    carouselTimers.set(track, setInterval(() => { if (!paused && !document.hidden && !videos[current()]) go(current() + 1); }, 7000));
  }
  async function load() {
    render();
    if (preview || config.demo || hosted) return;
    message("Actualizando disponibilidad…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/store`, { credentials: "omit", cache: "no-store" });
      if (!response.ok) throw new Error("No pudimos cargar la carta. Intenta de nuevo.");
      const saved = cartItems();
      store = pickupFacts(await response.json()); ready = true; category = "all"; renderPolicyLinks();
      restoreCart(saved);
      render(); message("");
    } catch (error) { ready = false; renderInfoPages(true); render(); message(error.message); }
  }
  // Real reviews only: a verified purchase, or the merchant's entry of a real customer's words with where it came from.
  function reviewMarkup(review) {
    const rating = Math.max(1, Math.min(5, Math.round(Number(review.rating) || 0)));
    const source = review.source === 'MERCHANT' ? `Reseña de cliente${review.sourceNote ? ` · ${escape(review.sourceNote)}` : ''}` : 'Compra verificada';
    return `<article class="pagosya-review"><p class="pagosya-review__stars" role="img" aria-label="${rating} de 5">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</p><blockquote class="pagosya-review__body"><p>${escape(review.body)}</p></blockquote><p class="pagosya-review__by"><strong>${escape(review.displayName)}</strong> · <span class="pagosya-review__source">${source}</span></p></article>`;
  }
  // The store's published articles; the editor preview draws them from config.data (owner 2026-10-25: BOXY's blog showed
  // only a placeholder line while editing).
  // A list a reader can scan: the title as a heading, date and author small, the summary, then the links (owner 2026-10-25:
  // BOXY's feed was bare text, titles the size of the dates). Zero-specificity rules, so a design's own blog styles win.
  const ensureBlogStyle = () => {
    if (document.getElementById('pagosya-blog-style')) return;
    const style = document.createElement('style'); style.id = 'pagosya-blog-style';
    style.textContent = ':where([data-pagosya-blog]:has(.pagosya-article)){display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:8px 32px}'
      + ':where(.pagosya-article){display:flex;flex-direction:column;gap:10px;padding:20px 0;border-top:1px solid color-mix(in srgb,currentColor 20%,transparent)}'
      + ':where(.pagosya-article__title){margin:0;font:400 clamp(1.2rem,1.8vw,1.5rem)/1.25 var(--store-heading-font,inherit);letter-spacing:-.01em;text-wrap:balance}'
      + ':where(.pagosya-article__meta){margin:0;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;opacity:.62}'
      + ':where(.pagosya-article__excerpt){margin:0;line-height:1.55;opacity:.85}'
      + ':where(.pagosya-article__links){display:flex;flex-wrap:wrap;gap:16px;margin:4px 0 0;font-size:.9rem}'
      + ':where(.pagosya-article__links a,.pagosya-article__more summary){color:inherit;text-decoration:underline;text-underline-offset:3px;cursor:pointer}'
      + ':where(.pagosya-article__more) p{margin:10px 0 0;line-height:1.6}';
    document.head.append(style);
  };
  const blogMarkup = articles => { ensureBlogStyle(); return articles.map(article => `<article class="pagosya-article" id="articulo-${escape(article.slug)}"><h2 class="pagosya-article__title">${escape(article.title)}</h2><p class="pagosya-article__meta">${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p>${article.excerpt ? `<p class="pagosya-article__excerpt">${escape(article.excerpt)}</p>` : ''}<details class="pagosya-article__more"><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details><p class="pagosya-article__links"><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>'; };
  async function loadCommerceContent() {
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length && !fullProductPage) return;
    if (preview || config.demo) {
      slots.forEach(slot => {
        // Reviews cannot load here; the preview shows what a store without reviews shows, no placeholder line (2026-10-19).
        if (slot.hasAttribute('data-pagosya-reviews') && !fullProductPage) {
          slot.hidden = true;
          const section = slot.closest('[data-pagosya-reviews-section]');
          if (section) section.hidden = true;
          return;
        }
        if (slot.hasAttribute('data-pagosya-blog') && Array.isArray(config.data?.articles)) { slot.innerHTML = blogMarkup(config.data.articles); return; }
        slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.';
      });
      return;
    }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      commerceData = data; decorateProductReviews();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = blogMarkup(data.articles);
        if (slot.hasAttribute('data-pagosya-reviews')) {
          const reviews = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id);
          slot.innerHTML = reviews.map(reviewMarkup).join('') || (fullProductPage && !embeddedProductId ? '<p>Todavía no hay reseñas publicadas.</p>' : '');
          // Away from the product page a store without reviews shows no empty reviews section (spec 2026-10-18).
          const section = slot.closest('[data-pagosya-reviews-section]');
          // A product shown whole on the home (one-product stores, 2026-11-02) hides its reviews until it has some.
          slot.hidden = !reviews.length && (!fullProductPage || Boolean(embeddedProductId));
          if (section) section.hidden = slot.hidden;
          if (slot.hasAttribute('data-pagosya-carousel')) mountCarousel(slot);
        }
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
  // ---- Platform header (spec 2026-10-13 showcase stores and the header library) ----
  // The platform writes the header (header[data-pagosya-header]); the kit owns how it behaves. One menu: it takes the focus
  // when it opens; Escape, its close button, its backdrop or any choice inside it closes it; Tab stays inside it; and the
  // scroll lock it set always goes back to what the page had (part 1: a lock left behind froze the page).
  function initPlatformHeader() {
    const header = document.querySelector('header[data-pagosya-header]');
    if (!header || header.hasAttribute('data-header-ready')) return;
    header.setAttribute('data-header-ready', '');
    const menu = header.querySelector('[data-pagosya-header-menu]');
    const toggles = [...header.querySelectorAll('[data-pagosya-header-toggle]')];
    const focusable = () => (menu ? [...menu.querySelectorAll('a[href],button:not([disabled])')] : []);
    let lockedFrom = null, opener = null;
    const isOpen = () => Boolean(menu && !menu.hidden);
    const setOpen = (open, returnFocus) => {
      if (!menu || open === isOpen()) return;
      menu.hidden = !open;
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', String(open)));
      if (open) {
        lockedFrom = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        (focusable()[0] || menu).focus({ preventScroll: true });
        return;
      }
      document.documentElement.style.overflow = lockedFrom || '';
      lockedFrom = null;
      if (returnFocus) (opener || toggles[0])?.focus({ preventScroll: true });
    };
    toggles.forEach(toggle => toggle.addEventListener('click', () => { opener = toggle; setOpen(!isOpen(), true); }));
    header.querySelector('[data-pagosya-header-close]')?.addEventListener('click', () => setOpen(false, true));
    menu?.addEventListener('click', event => {
      if (event.target === menu) setOpen(false, true);
      else if (event.target.closest('a[href],[data-cart-open],[data-pagosya-account]')) setOpen(false, false);
    });
    menu?.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && isOpen()) { event.preventDefault(); setOpen(false, true); } });
    window.addEventListener('pagehide', () => setOpen(false, false));
    const shape = header.getAttribute('data-shape');
    if (shape === 'shrinking' || shape === 'reveal') {
      let last = window.scrollY;
      const onScroll = () => {
        const y = window.scrollY;
        // Shrinking moves the page under the bar, so it shrinks past 80px and grows back only near the top: one threshold
        // would toggle by itself (final review, 2026-10-13).
        if (shape === 'shrinking') header.toggleAttribute('data-scrolled', header.hasAttribute('data-scrolled') ? y > 8 : y > 80);
        else header.toggleAttribute('data-hidden', y > 120 && y > last && !isOpen());
        last = y;
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }
  }
  initPlatformHeader();
  // ---- Store menu (spec 2026-10-21 dropdown menu) ----
  // config.header.menu = { style: 'panel' | 'dropdowns', groups? } turns the menu on. The host header holds the mounts
  // [data-pagosya-store-menu="toggle"] (☰, opens the panel) and optionally [data-pagosya-store-menu="links"] (desktop top links
  // for dropdowns); what the menu replaces carries data-store-menu-replaces. Links name targets, resolved here against the live
  // store, so a deleted category never leaves a dead link; without groups the menu is built from the categories and pages.
  // One panel per header: it takes focus when opened from ☰, Esc or a choice closes it, Tab stays inside, and the scroll lock
  // goes back to what the page had.
  const STORE_MENU_PAGES = { about: ['nosotros.html', 'Nuestra historia'], contact: ['contacto.html', 'Contacto'], shipping: ['envios.html', 'Envíos y entregas'], refund: ['reembolsos.html', 'Cambios y devoluciones'], faq: ['faq.html', 'Preguntas frecuentes'] };
  const STORE_MENU_OPEN_MS = 120, STORE_MENU_CLOSE_MS = 200;
  const STORE_MENU_CSS = `
    [data-store-menu] [data-store-menu-replaces]{display:none!important}
    [data-pagosya-store-menu="links"]{display:none}
    .pym-toggle{display:inline-grid;place-items:center;width:44px;height:44px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}
    .pym-bars,.pym-bars::before,.pym-bars::after{display:block;width:20px;height:1.5px;background:currentColor;content:""}
    .pym-bars{position:relative}.pym-bars::before{position:absolute;top:-6px}.pym-bars::after{position:absolute;top:6px}
    .pym-top{min-height:44px;padding:0;border:0;background:none;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-top[aria-expanded="true"]{text-decoration:underline;text-underline-offset:6px}
    .pym-panel{position:absolute;left:0;right:0;top:100%;z-index:40;max-height:calc(100dvh - 72px);overflow:auto;padding:24px max(20px,calc((100% - 1280px)/2));background:var(--store-background,#fff);color:var(--store-foreground,#111);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);box-shadow:0 24px 48px -24px rgb(0 0 0 / .25);text-align:left;animation:pym-in .18s ease-out}
    .pym-panel[hidden],.pym-group[hidden]{display:none!important}
    @keyframes pym-in{from{opacity:0;transform:translateY(-6px)}}
    @media (prefers-reduced-motion: reduce){.pym-panel{animation:none}}
    .pym-tabs{display:flex;width:max-content;max-width:100%;margin:0 0 20px;border:1px solid currentColor}
    .pym-panel[data-mode="dropdown"] .pym-tabs,.pym-tabs[data-single]{display:none}
    .pym-tab{min-height:44px;padding:10px 20px;border:0;background:transparent;color:inherit;font:inherit;font-size:13px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .pym-tab[aria-selected="true"]{background:var(--store-foreground,#111);color:var(--store-background,#fff)}
    .pym-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2px 32px;margin:0;padding:0;list-style:none}
    .pym-links a{display:flex;align-items:center;min-height:44px;color:inherit;font-size:15px;text-decoration:none}
    .pym-links a:hover{text-decoration:underline;text-underline-offset:5px}
    .pym-tiles{margin-top:24px}
    .pym-tiles-title{margin:0 0 12px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
    .pym-tiles ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;padding:0;list-style:none}
    .pym-tiles a{display:grid;gap:8px;color:inherit;font-size:14px;text-decoration:none}
    .pym-tiles img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover}
    .pym-price{font-size:13px;opacity:.75}
    .pym-footer{display:flex;align-items:center;justify-content:center;min-height:52px;margin-top:24px;background:var(--store-foreground,#111);color:var(--store-background,#fff);font-size:13px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
    .pym-extras{display:flex;flex-wrap:wrap;gap:4px 24px;margin-top:20px;padding-top:16px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
    .pym-extras a{display:inline-flex;align-items:center;min-height:44px;color:inherit;font-size:14px}
    /* Owner 2026-10-29 («a little menu with the accent of the brand colors, font»): the menu wears the brand where the store sets it. */
    .pym-panel{background:var(--store-surface,var(--store-background,#fff));border-top:3px solid var(--store-accent,currentColor)}
    .pym-tab[aria-selected="true"]{background:var(--store-accent,var(--store-foreground,#111));color:var(--store-on-accent,var(--store-background,#fff))}
    .pym-links a{font-family:var(--store-heading-font,inherit);font-size:19px}
    .pym-links a:hover{color:var(--store-accent,inherit)}
    .pym-tiles a{font-family:var(--store-heading-font,inherit)}
    .pym-footer{background:var(--store-accent,var(--store-foreground,#111));color:var(--store-on-accent,var(--store-background,#fff))}
    .pym-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media (min-width:861px){
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="toggle"]{display:none}
      [data-store-menu="dropdowns"][data-store-menu-links] [data-pagosya-store-menu="links"]{display:flex;align-items:center;gap:28px}
      .pym-group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:16px 40px;align-items:start}
      .pym-tiles{margin-top:0}
      .pym-footer{grid-column:1/-1;margin-top:8px}
      .pyh--side-rail .pym-panel{position:fixed;top:0;left:88px;right:auto;width:min(960px,calc(100vw - 88px));max-height:100dvh;padding:32px}
    }`;
  function ensureStoreMenuStyle() {
    if (document.querySelector('style[data-pagosya-store-menu-style]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-store-menu-style', '');
    style.textContent = STORE_MENU_CSS;
    document.head.appendChild(style);
  }
  function storeMenuConfig() {
    const menu = config.header && config.header.menu;
    return menu && (menu.style === 'panel' || menu.style === 'dropdowns') ? menu : null;
  }
  const storeMenuCategories = () => (Array.isArray(store.categories) ? store.categories : []).filter(category => category && typeof category.id === 'string' && products().some(item => item.categoryId === category.id));
  /** A target as { href, label }, or null when the live store has nothing there. */
  function storeMenuTarget(to) {
    const value = String(to || '');
    // A showcase sells nothing online: no catalog, category, collection, shipping or refund page to link (final review 2026-10-21).
    if (SHOWCASE && (value === 'all' || value === 'new' || /^(?:category|collection):/.test(value) || SHOP_ONLY_INFO.has(value.slice(5)) && value.startsWith('page:'))) return null;
    if (value === 'all') return { href: pageHref('productos.html'), label: 'Todos los productos' };
    if (value === 'new') return products().length ? { href: pageHref('productos.html', '?orden=novedades'), label: 'Novedades' } : null;
    if (value.startsWith('category:')) {
      const category = storeMenuCategories().find(entry => entry.id === value.slice(9));
      return category ? { href: pageHref('productos.html', '?f_categoria=' + encodeURIComponent(filterFold(category.id))), label: category.name } : null;
    }
    // Owner 2026-10-28: «Mujer → Zapatos» is the Mujer collection showing one category (collection:<slug>/category:<id>).
    const nested = /^collection:([^/]+)\/category:(.+)$/.exec(value);
    if (nested) {
      const collection = infoCollections().find(entry => entry.slug === nested[1]);
      const category = storeMenuCategories().find(entry => entry.id === nested[2]);
      return collection && category ? { href: pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug) + '&f_categoria=' + encodeURIComponent(filterFold(category.id))), label: category.name } : null;
    }
    if (value.startsWith('collection:')) {
      const collection = infoCollections().find(entry => entry.slug === value.slice(11));
      return collection ? { href: pageHref('coleccion.html', '?c=' + encodeURIComponent(collection.slug)), label: collection.name } : null;
    }
    // The pages YAPI made (spec 2026-11-05 creates anything): <slug>.html; the link carries its own label.
    if (value.startsWith('extra:') && /^[a-z][a-z0-9-]{0,39}$/.test(value.slice(6))) return { href: pageHref(value.slice(6) + '.html'), label: '' };
    if (value.startsWith('page:')) {
      const kind = value.slice(5), page = STORE_MENU_PAGES[kind];
      return page && infoBody(kind) ? { href: pageHref(page[0]), label: page[1] } : null;
    }
    if (value.startsWith('section:') && /^[\w-]{1,60}$/.test(value.slice(8))) return { href: pageHref('index.html', '#' + value.slice(8)), label: '' };
    return null;
  }
  // A store photo: an http(s) upload, or the data URL the Studio preview turns it into (live check 2026-10-21, NOA VARGAS).
  const storeMenuPhoto = url => (typeof url === 'string' && /^(?:https?:\/\/|data:image\/(?:png|jpe?g|webp|avif|gif);)/i.test(url) ? url : '');
  /** The default menu (spec): «Tienda» from the categories, «Descubre» from the host's own links and the info pages. */
  function defaultStoreMenuGroups(host) {
    const categories = storeMenuCategories();
    const tiles = categories.map(category => ({ title: category.name, to: 'category:' + category.id, image: storeMenuPhoto(category.bannerUrl) || storeMenuPhoto((products().find(item => item.categoryId === category.id)?.imageUrls || [])[0]) }))
      .filter(tile => tile.image).slice(0, 3);
    const shop = { label: 'Tienda', links: [{ to: 'new' }, ...categories.map(category => ({ to: 'category:' + category.id })), { to: 'all' }], tilesTitle: 'Por categoría', tiles, footer: { label: 'Ver toda la tienda', to: 'all' } };
    const own = [...host.querySelectorAll('[data-store-menu-replaces] a[href]')]
      .map(anchor => ({ href: anchor.getAttribute('href'), label: anchor.textContent.trim() }))
      .filter(link => link.label && !/^(?:\.\.\/)*(?:index|productos)\.html$/.test(link.href));
    const discover = { label: 'Descubre', links: [...own, ...['about', 'shipping', 'refund', 'faq', 'contact'].map(kind => ({ to: 'page:' + kind }))] };
    // Owner 2026-10-28 («colección Mujer y adentro zapatos, ropa…»): with two collections or more (Mujer, Hombre, Niños), each is
    // its own menu — the categories it holds, a photo tile per category, and «Ver todo».
    const collectionsWithProducts = infoCollections();
    if (collectionsWithProducts.length >= 2) {
      const byCollection = collectionsWithProducts.slice(0, 3).map(collection => {
        const ids = new Set(Array.isArray(collection.productIds) ? collection.productIds : []);
        const inside = products().filter(item => ids.has(item.id));
        const cats = categories.filter(category => inside.some(item => item.categoryId === category.id));
        const tilesHere = cats.map(category => ({ title: category.name, to: `collection:${collection.slug}/category:${category.id}`,
          image: storeMenuPhoto((inside.find(item => item.categoryId === category.id)?.imageUrls || [])[0]) })).filter(tile => tile.image).slice(0, 3);
        return { label: collection.name, links: [...cats.map(category => ({ to: `collection:${collection.slug}/category:${category.id}` })), { label: `Ver todo ${collection.name}`, to: `collection:${collection.slug}` }],
          tilesTitle: 'Por categoría', tiles: tilesHere, footer: { label: `Ver todo ${collection.name}`, to: `collection:${collection.slug}` } };
      });
      return [...byCollection, discover];
    }
    return [shop, discover];
  }
  /** The first product photo behind a «category:id», «collection:slug» or «collection:slug/category:id» link; '' otherwise. */
  function storeMenuLinkPhoto(to) {
    const match = /^(?:collection:([^/]+))?\/?(?:category:(.+))?$/.exec(to);
    if (!match || (!match[1] && !match[2])) return '';
    const collection = match[1] ? infoCollections().find(c => c && c.slug === match[1]) : null;
    if (match[1] && !collection) return '';
    const ids = collection ? new Set(Array.isArray(collection.productIds) ? collection.productIds : []) : null;
    const item = products().find(product => (!ids || ids.has(product.id)) && (!match[2] || product.categoryId === match[2]) && storeMenuPhoto((product.imageUrls || [])[0]));
    return item ? storeMenuPhoto(item.imageUrls[0]) : '';
  }
  // A store upload path ("/v1/uploads/…") lives on the API, not on the store's own origin.
  function storeMenuStorePhoto(url) {
    if (typeof url !== 'string' || !url.trim()) return '';
    try { return storeMenuPhoto(/^\/v1\//.test(url.trim()) && config.apiBaseUrl ? new URL(url.trim(), config.apiBaseUrl).href : url.trim()); } catch { return ''; }
  }
  /** Spec 2026-11-04 §3 (Canasta Viva: «Descubre» was four words over an empty panel): a group with no photo of its own shows the
   *  store's own photo on «Nuestra historia» (never a product photo) and up to two products, badged ones first. */
  function storeMenuDiscoverTiles(group) {
    const tiles = [];
    const about = (Array.isArray(group.links) ? group.links : []).some(link => link && link.to === 'page:about') ? storeMenuTarget('page:about') : null;
    const story = about ? storeMenuStorePhoto(store.aboutImageUrl) || storeMenuStorePhoto(store.bannerUrl) : '';
    if (about && story) tiles.push({ href: about.href, title: about.label, image: story });
    const shown = products().filter(item => storeMenuPhoto((item.imageUrls || [])[0]));
    for (const item of [...shown.filter(entry => entry.badge), ...shown.filter(entry => !entry.badge)].slice(0, 2)) {
      tiles.push({ href: pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)), title: String(item.name || '').slice(0, 28),
        image: storeMenuPhoto(item.imageUrls[0]), price: money(price(item), item.currency || 'BOB') });
    }
    return tiles;
  }
  /** Groups with every link, tile and footer resolved; a repeated label is shown once, and a group with no link left is dropped. */
  function resolveStoreMenuGroups(groups) {
    return (Array.isArray(groups) ? groups : []).slice(0, 4).map(group => {
      const seen = new Set();
      const links = (Array.isArray(group.links) ? group.links : []).map(link => {
        if (link.href) return { href: link.href, label: String(link.label).slice(0, 28) };
        const target = storeMenuTarget(link.to);
        return target && (link.label || target.label) ? { href: target.href, label: String(link.label || target.label).slice(0, 28) } : null;
      }).filter(link => link && !seen.has(link.label.toLowerCase()) && seen.add(link.label.toLowerCase())).slice(0, 12);
      const named = (Array.isArray(group.tiles) ? group.tiles : []).map(tile => { const target = storeMenuTarget(tile.to); return target && storeMenuPhoto(tile.image) ? { href: target.href, title: String(tile.title || target.label).slice(0, 28), image: tile.image } : null; }).filter(Boolean).slice(0, 3);
      // Owner 2026-10-30 («dropdown menus now dont have pictures»): a group written without tiles shows the first product photo
      // of each category or collection its links point to, as the default menu does.
      const tiles = named.length ? named : (Array.isArray(group.links) ? group.links : []).map(link => {
        const target = typeof link.to === 'string' ? storeMenuTarget(link.to) : null;
        const image = target ? storeMenuLinkPhoto(link.to) : '';
        return target && image ? { href: target.href, title: String(link.label || target.label).slice(0, 28), image } : null;
      // Each photo and each page once (review 2026-10-30: «Ver todo» and the first category share a photo).
      }).filter((tile, index, list) => tile && list.findIndex(other => other && (other.image === tile.image || other.href === tile.href)) === index).slice(0, 3);
      const shownTiles = tiles.length ? tiles : storeMenuDiscoverTiles(group);
      const footerTarget = group.footer ? storeMenuTarget(group.footer.to) : null;
      return { label: String(group.label || '').slice(0, 28), links, direct: group.direct === true && links.length === 1, tilesTitle: shownTiles.length ? String(group.tilesTitle || '') : '', tiles: shownTiles, footer: footerTarget ? { href: footerTarget.href, label: String(group.footer.label || footerTarget.label).slice(0, 28) } : null };
    }).filter(group => group.label && group.links.length);
  }
  let storeMenuCount = 0;
  const storeMenuOpenState = { host: null, close: null };
  function renderStoreMenu(host, menu) {
    const toggleMount = host.querySelector('[data-pagosya-store-menu="toggle"]');
    if (!toggleMount) return;
    const linksMount = menu.style === 'dropdowns' ? host.querySelector('[data-pagosya-store-menu="links"]') : null;
    let groups = resolveStoreMenuGroups(menu.groups);
    if (!groups.length) groups = resolveStoreMenuGroups(defaultStoreMenuGroups(host));
    // Only direct page links (spec 2026-11-05 creates anything): the kit's own menu stays, the links follow it.
    else if (groups.every(group => group.direct)) groups = [...resolveStoreMenuGroups(defaultStoreMenuGroups(host)), ...groups];
    if (!groups.length) return;
    const id = 'pym-' + (++storeMenuCount);
    host.setAttribute('data-store-menu', menu.style);
    host.toggleAttribute('data-store-menu-links', Boolean(linksMount));
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    toggleMount.innerHTML = `<button type="button" class="pym-toggle" data-store-menu-toggle aria-expanded="false" aria-controls="${id}"><span class="pym-bars" aria-hidden="true"></span><span class="pym-sr">Menú</span></button>`;
    if (linksMount) linksMount.innerHTML = groups.map((group, index) => group.direct
      ? `<a class="pym-top" href="${escape(group.links[0].href)}">${escape(group.label)}</a>`
      : `<button type="button" class="pym-top" data-store-menu-top="${index}" aria-expanded="false" aria-controls="${id}">${escape(group.label)}</button>`).join('');
    const extras = [...host.querySelectorAll('[data-store-menu-extra] a[href]')].map(anchor => { const copy = anchor.cloneNode(true); copy.removeAttribute('id'); copy.removeAttribute('class'); return copy.outerHTML; }).join('');
    const panel = document.createElement('div');
    panel.className = 'pym-panel';
    panel.id = id;
    panel.hidden = true;
    panel.setAttribute('data-store-menu-panel', '');
    panel.setAttribute('aria-label', 'Menú');
    panel.innerHTML = `<div class="pym-tabs" role="tablist" aria-label="Menú"${groups.length === 1 ? ' data-single' : ''}>${groups.map((group, index) => `<button type="button" class="pym-tab" role="tab" id="${id}-tab-${index}" aria-controls="${id}-group-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${escape(group.label)}</button>`).join('')}</div>`
      + groups.map((group, index) => `<div class="pym-group" role="tabpanel" id="${id}-group-${index}" aria-labelledby="${id}-tab-${index}"${index ? ' hidden' : ''}>`
        + `<ul class="pym-links">${group.links.map(link => `<li><a href="${escape(link.href)}">${escape(link.label)}</a></li>`).join('')}</ul>`
        + (group.tiles.length ? `<div class="pym-tiles">${group.tilesTitle ? `<p class="pym-tiles-title">${escape(group.tilesTitle)}</p>` : ''}<ul>${group.tiles.map(tile => `<li><a href="${escape(tile.href)}"><img src="${escape(tile.image)}" alt="" loading="lazy"><span>${escape(tile.title)}</span>${tile.price ? `<small class="pym-price">${escape(tile.price)}</small>` : ''}</a></li>`).join('')}</ul></div>` : '')
        + (group.footer ? `<a class="pym-footer" href="${escape(group.footer.href)}">${escape(group.footer.label)}</a>` : '')
        + '</div>').join('')
      + (extras ? `<div class="pym-extras">${extras}</div>` : '');
    host.appendChild(panel);
    const toggle = toggleMount.querySelector('[data-store-menu-toggle]');
    const tops = linksMount ? [...linksMount.querySelectorAll('[data-store-menu-top]')] : [];
    const tabs = [...panel.querySelectorAll('[role=tab]')];
    const panes = [...panel.querySelectorAll('[role=tabpanel]')];
    // openedBy: a hover-opened dropdown closes when the pointer leaves; a clicked one stays until clicked again (final review 2026-10-21).
    let opener = null, openedBy = '', lockedFrom = null, openTimer = 0, closeTimer = 0;
    const select = index => tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panes[i].hidden = i !== index; });
    const focusable = () => [...panel.querySelectorAll('a[href],button:not([disabled])')].filter(el => !el.closest('[hidden]') && !el.closest('.pym-tabs[data-single]') && !(panel.getAttribute('data-mode') === 'dropdown' && el.closest('.pym-tabs')));
    const unlock = () => { if (lockedFrom !== null) { document.documentElement.style.overflow = lockedFrom; lockedFrom = null; } };
    const mouse = event => !event.pointerType || event.pointerType === 'mouse';
    function close(returnFocus) {
      clearTimeout(openTimer); clearTimeout(closeTimer);
      if (panel.hidden) return;
      panel.hidden = true;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', 'false'));
      unlock();
      storeMenuOpenState.host = storeMenuOpenState.close = null;
      if (returnFocus && opener) opener.focus({ preventScroll: true });
    }
    function open(mode, index, from, focus, by = 'click') {
      if (storeMenuOpenState.close && storeMenuOpenState.host !== host) storeMenuOpenState.close(false);
      opener = from;
      openedBy = by;
      panel.setAttribute('data-mode', mode);
      select(index);
      panel.hidden = false;
      [toggle, ...tops].forEach(button => button.setAttribute('aria-expanded', String(button === from)));
      storeMenuOpenState.host = host; storeMenuOpenState.close = close;
      if (mode === 'panel' && lockedFrom === null) { lockedFrom = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden'; }
      if (mode === 'dropdown') unlock();
      if (focus) (mode === 'panel' ? tabs.find(tab => tab.getAttribute('aria-selected') === 'true') : focusable()[0])?.focus({ preventScroll: true });
    }
    toggle.addEventListener('click', () => (panel.hidden || panel.getAttribute('data-mode') !== 'panel' ? open('panel', 0, toggle, true) : close(true)));
    // Each top button opens its own group: direct page links (plain <a>) are not buttons, so the list index is not the group's.
    tops.forEach(top => {
      const index = Number(top.getAttribute('data-store-menu-top'));
      top.addEventListener('click', () => { clearTimeout(openTimer); clearTimeout(closeTimer); if (!panel.hidden && opener === top && openedBy === 'click') close(false); else open('dropdown', index, top, true); });
      top.addEventListener('pointerenter', event => { if (!mouse(event)) return; clearTimeout(closeTimer); clearTimeout(openTimer); if (!panel.hidden && openedBy === 'click') return; openTimer = setTimeout(() => open('dropdown', index, top, false, 'hover'), STORE_MENU_OPEN_MS); });
      top.addEventListener('pointerleave', event => { if (!mouse(event)) return; clearTimeout(openTimer); if (panel.getAttribute('data-mode') === 'dropdown' && openedBy === 'hover') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    });
    panel.addEventListener('pointerenter', event => { if (mouse(event)) clearTimeout(closeTimer); });
    panel.addEventListener('pointerleave', event => { if (mouse(event) && panel.getAttribute('data-mode') === 'dropdown' && openedBy === 'hover') closeTimer = setTimeout(() => close(false), STORE_MENU_CLOSE_MS); });
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(index));
      tab.addEventListener('keydown', event => {
        const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        const target = (next + tabs.length) % tabs.length;
        select(target);
        tabs[target].focus();
      });
    });
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) close(false); });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || panel.getAttribute('data-mode') !== 'panel') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    host.__pagosyaStoreMenu = { close, panel };
  }
  function renderStoreMenus() {
    const menu = storeMenuConfig();
    document.querySelectorAll('[data-pagosya-store-menu="toggle"]').forEach(mount => {
      const host = mount.closest('header') || mount.parentElement;
      if (host.__pagosyaStoreMenu) { host.__pagosyaStoreMenu.close(false); host.__pagosyaStoreMenu.panel.remove(); host.__pagosyaStoreMenu = null; }
      if (!menu) return;
      ensureStoreMenuStyle();
      renderStoreMenu(host, menu);
    });
  }
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !storeMenuOpenState.close) return;
    event.preventDefault();
    storeMenuOpenState.close(true);
  });
  document.addEventListener('click', event => {
    if (!storeMenuOpenState.close || storeMenuOpenState.host.contains(event.target)) return;
    storeMenuOpenState.close(false);
  });
  window.addEventListener('pagehide', () => storeMenuOpenState.close && storeMenuOpenState.close(false));
  document.addEventListener('pagosya:ready', renderStoreMenus);
  window.pagosyaStoreMenu = { render: renderStoreMenus, close: () => storeMenuOpenState.close && storeMenuOpenState.close(false) };
  renderStoreMenus();
  // The kit's own small controls take the store's language: the card "+", the quantity steppers and the cart drawer's close
  // button. Their aria-label and data-* hooks never change; only the inside of the button becomes the face. A store-authored
  // card ([data-custom-product]) keeps its own button.
  function decorateControls() {
    if (!CONTROLS) return;
    const face = (button, slot) => {
      button.setAttribute('data-ctl', slot);
      const inner = document.createElement('span');
      inner.className = 'ctl-face';
      inner.innerHTML = controlIcon(slot) || button.innerHTML;
      button.replaceChildren(inner);
    };
    document.querySelectorAll('.menu-item:not([data-custom-product]) .menu-add[data-add]:not([data-ctl])').forEach(button => face(button, 'plus'));
    document.querySelectorAll(':is(.quantity,.product-detail__quantity)>button:not([data-ctl])').forEach(button => face(button, button.matches('[data-remove],[data-product-quantity="-1"]') ? 'minus' : 'plus'));
    document.querySelectorAll('.cart-drawer__header>[data-cart-close]:not([data-ctl])').forEach(button => face(button, 'close'));
  }
  // Cards and cart lines are re-rendered on every change; one microtask after each batch of DOM changes redraws what is new.
  if (CONTROLS && typeof MutationObserver === 'function' && document.body) {
    decorateControls();
    let queued = false;
    // A page that is going away (its document torn down under the observer) must not throw from the microtask.
    new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; try { decorateControls(); } catch { /* the page is going away */ } }); }).observe(document.body, { childList: true, subtree: true });
  }
  // A headline never splits a word (2026-10-16, baek's Nosotros: «NUESTR / A HISTORI / A»). The layout baseline lets h1/h2
  // break inside a word rather than spill sideways, and a model that sets 11rem in a narrow column gets exactly that. When a
  // word does not fit its line, the headline steps down in size until every word is whole, never below 55% of its authored
  // size: a single word wider than a phone still breaks, as the baseline intends. A size the store set inline is never touched.
  const FIT_MIN = .55;
  const fitWords = /[^\s\-‐–—/]{2,}/g;
  function splitsWord(heading) {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const match of node.data.matchAll(fitWords)) {
        range.setStart(node, match.index); range.setEnd(node, match.index + match[0].length);
        const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
        if (lines.size > 1) return true;
      }
    }
    return false;
  }
  function fitHeadline(heading) {
    if (heading.closest('[data-pagosya-fit="off"]')) return;
    // A size this left behind is taken back first, so a wider window gets the authored size again.
    if (heading.hasAttribute('data-pagosya-fit') && heading.style.fontSize === heading.getAttribute('data-pagosya-fit')) heading.style.removeProperty('font-size');
    heading.removeAttribute('data-pagosya-fit');
    if (heading.style.fontSize || !heading.getClientRects().length || !splitsWord(heading)) return;
    const authored = parseFloat(getComputedStyle(heading).fontSize);
    if (!authored) return;
    for (let size = authored * .94; size >= authored * FIT_MIN; size *= .94) {
      heading.style.fontSize = `${size.toFixed(2)}px`;
      heading.setAttribute('data-pagosya-fit', heading.style.fontSize);
      if (!splitsWord(heading)) return;
    }
  }
  function fitHeadlines() {
    Array.from(document.querySelectorAll('h1,h2')).slice(0, 80).forEach(fitHeadline);
  }
  // Some embedded browsers (and jsdom) have no animation frames: a timer stands in rather than throwing on every page.
  const nextFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 16);
  const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
  let fitFrame = 0;
  const scheduleFit = () => { cancelFrame(fitFrame); fitFrame = nextFrame(fitHeadlines); };
  addEventListener('resize', scheduleFit, { passive: true });
  document.addEventListener('pagosya:ready', scheduleFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit, scheduleFit);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleFit, { once: true }); else scheduleFit();
  // Motion pieces (owner 2026-10-22): tested animations YAPI may put on photos, badges and decoration with data-pya-motion
  // (float, bob, spin, breathe, bubbles, marquee, pop, zoom). Never text, navigation, cart, selectors or checkout; everything
  // stops with reduced motion and pauses off screen. data-pya-motion-speed="slow|fast" and data-pya-motion-delay="0-600".
  (function motionPieces() {
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-motion-pieces', '');
    style.textContent = `@layer pagosya-motion{
      [data-pya-motion=marquee]{display:flex;width:max-content;white-space:nowrap}
      [data-pya-motion=bubbles]{position:relative;overflow:hidden}
      [data-pya-motion=bubbles]>i[data-pya-bubble]{position:absolute;bottom:-60px;width:var(--s,28px);height:var(--s,28px);border-radius:50%;background:color-mix(in srgb,currentColor 18%,transparent);pointer-events:none}
      @media (prefers-reduced-motion:no-preference){
        [data-pya-motion=float]{animation:pya-float 5s ease-in-out infinite}
        [data-pya-motion=bob]{animation:pya-float 3s ease-in-out infinite}
        [data-pya-motion=spin]{animation:pya-spin 14s linear infinite}
        [data-pya-motion=breathe]{animation:pya-breathe 4.5s ease-in-out infinite}
        [data-pya-motion=marquee]{animation:pya-slide 38s linear infinite}
        [data-pya-motion=pop]{animation:pya-pop .6s cubic-bezier(.34,1.56,.64,1) both}
        [data-pya-motion=zoom]{animation:pya-zoom 22s ease-in-out infinite alternate}
        [data-pya-motion=bubbles]>i[data-pya-bubble]{animation:pya-rise var(--d,9s) linear infinite;animation-delay:var(--w,0s)}
        [data-pya-motion=float][data-pya-motion-speed=slow]{animation-duration:8s}[data-pya-motion=float][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=spin][data-pya-motion-speed=slow]{animation-duration:22s}[data-pya-motion=spin][data-pya-motion-speed=fast]{animation-duration:8s}
        [data-pya-motion=breathe][data-pya-motion-speed=slow]{animation-duration:7s}[data-pya-motion=breathe][data-pya-motion-speed=fast]{animation-duration:3s}
        [data-pya-motion=marquee][data-pya-motion-speed=slow]{animation-duration:60s}[data-pya-motion=marquee][data-pya-motion-speed=fast]{animation-duration:22s}
        [data-pya-motion=zoom][data-pya-motion-speed=slow]{animation-duration:30s}[data-pya-motion=zoom][data-pya-motion-speed=fast]{animation-duration:14s}
        [data-pya-motion][data-pya-offscreen]{animation-play-state:paused}
      }
      :is([data-pagosya-cart],[data-pagosya-checkout],.pya-checkout,nav,header) [data-pya-motion]{animation:none!important}
      @keyframes pya-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-14px) rotate(1.5deg)}}
      @keyframes pya-spin{to{transform:rotate(360deg)}}
      @keyframes pya-breathe{0%,100%{transform:scale(.94);opacity:.75}50%{transform:scale(1.06);opacity:1}}
      @keyframes pya-slide{to{transform:translateX(-50%)}}
      @keyframes pya-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
      @keyframes pya-zoom{from{transform:scale(1)}to{transform:scale(1.12)}}
      @keyframes pya-rise{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(-900px);opacity:0}}
    }`;
    document.head.append(style);
    const reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const SIZES = [22, 40, 16, 30, 20, 46, 18, 28], LEFT = [6, 18, 32, 47, 61, 73, 86, 94];
    const fill = root => root.querySelectorAll('[data-pya-motion=bubbles]').forEach(host => {
      if (reduced || host.querySelector('[data-pya-bubble]')) return;
      SIZES.forEach((size, index) => {
        const bubble = document.createElement('i'); bubble.setAttribute('data-pya-bubble', ''); bubble.setAttribute('aria-hidden', 'true');
        bubble.style.cssText = `--s:${size}px;left:${LEFT[index]}%;--d:${7 + (index % 3) * 2.5}s;--w:-${(index * 1.3).toFixed(1)}s`;
        host.append(bubble);
      });
    });
    const delays = root => root.querySelectorAll('[data-pya-motion-delay]').forEach(el => {
      el.style.animationDelay = Math.max(0, Math.min(600, Number(el.getAttribute('data-pya-motion-delay')) || 0)) + 'ms';
    });
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => entries.forEach(entry => entry.target.toggleAttribute('data-pya-offscreen', !entry.isIntersecting)))
      : null;
    const watch = root => { fill(root); delays(root); if (observer) root.querySelectorAll('[data-pya-motion]').forEach(el => observer.observe(el)); };
    watch(document);
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === 1 && !node.hasAttribute('data-pya-bubble') && node.parentNode) watch(node.parentNode);
    }))).observe(document.body || document.documentElement, { childList: true, subtree: true });
  })();
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
  // Premium landing (spec 2026-11-03): one card per colour that has its own photo, from the product's variants; a tap picks that colour
  // in the buy box and scrolls there. Fewer than two photographed colours: the section and «Ver colores» hide.
  (function variantCards() {
    let styled = false;
    const ensureStyle = () => {
      if (styled) return;
      styled = true;
      const style = document.createElement('style');
      style.setAttribute('data-pagosya-colour-cards', '');
      style.textContent = `.pya-colour-cards{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
      .pya-colour-card{all:unset;box-sizing:border-box;cursor:pointer;scroll-snap-align:start;display:grid;gap:6px;min-width:0}
      .pya-colour-card img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:22px;transition:transform .3s}
      @media (hover:hover){.pya-colour-card:hover img{transform:scale(1.02)}}
      @media (prefers-reduced-motion:reduce){.pya-colour-card img{transition:none}}
      .pya-colour-card:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:22px}
      .pya-colour-card strong{font-size:15px}.pya-colour-card span{font-size:13px;opacity:.75}
      [data-lb="variant-cards"][hidden],[data-needs-colour-cards][hidden]{display:none!important}`;
      document.head.append(style);
    };
    const cardsFor = (product) => {
      const groups = optionGroups(product) || [], colourAt = colourGroupIndex(groups);
      if (colourAt < 0) return [];
      const seen = new Set(), cards = [];
      groups[colourAt].values.forEach((value, valueAt) => {
        const variant = (product.variants || []).find(v => (v.options || [])[colourAt]?.value === value && variantPhotos(v)[0]);
        const photo = variant && variantPhotos(variant)[0];
        if (!photo || seen.has(photo)) return;
        seen.add(photo);
        const amount = price({ ...product, amount: variant.amount });
        cards.push(`<button type="button" class="pya-colour-card" data-colour-group="${colourAt}" data-colour-value="${valueAt}"><img src="${escape(photo)}" alt="" loading="lazy"><strong>${escape(value)}</strong>${amount > 0 ? `<span>desde ${escape(money(amount, product.currency))}</span>` : ''}</button>`);
      });
      return cards;
    };
    const pick = (card) => {
      const option = document.querySelector(`[data-pagosya-product-page] [data-product-option="${card.dataset.colourGroup}"][data-option-value="${card.dataset.colourValue}"]`);
      if (option && option.getAttribute('aria-pressed') !== 'true') option.click();
      const target = option?.closest('[data-pagosya-product-page]')?.closest('section') || document.getElementById('comprar');
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    // Returns true once every host on the page is drawn (or hidden).
    const draw = () => {
      let pending = false;
      document.querySelectorAll('[data-pagosya-variant-cards][data-product-id]').forEach(host => {
        if (host.dataset.drawn) return;
        const product = products().find(item => String(item.id) === host.getAttribute('data-product-id'));
        // Not in a catalogue that has loaded (archived, or an old id after a template switch): no cards. An empty catalogue may still load.
        if (!product && !products().length) { pending = true; return; }
        host.dataset.drawn = '1';
        ensureStyle();
        const cards = product ? cardsFor(product) : [], section = host.closest('section') || host;
        if (cards.length < 2) { section.hidden = true; document.querySelectorAll('[data-needs-colour-cards]').forEach(el => { el.hidden = true; }); return; }
        host.innerHTML = `<div class="pya-colour-cards">${cards.join('')}</div>`;
        host.addEventListener('click', event => { const card = event.target.closest('.pya-colour-card'); if (card) pick(card); });
      });
      return !pending;
    };
    // The host may be drawn after the kit starts (the Studio preview renders with React): wait a little while for one. A host whose
    // product is not in the catalogue yet waits for the catalogue (it loads after the kit starts on a live store).
    const hosts = () => document.querySelector('[data-pagosya-variant-cards]');
    if (draw() && hosts()) return;
    const watch = new MutationObserver(() => { if (draw() && hosts()) watch.disconnect(); });
    watch.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (!hosts()) watch.disconnect(); }, 15000);
  })();
  // «Pide una cotización» in the header, and any call to action marked data-pagosya-contact-open, opens the platform contact
  // form; a store without the form keeps the link, which goes to its Contacto page.
  document.addEventListener('click', event => {
    const trigger = event.target.closest && event.target.closest('[data-pagosya-contact-open]');
    // A form shown inline on this page (the store assistant owns the corner): go to it instead of opening a panel.
    const inlineForm = trigger && document.querySelector('[data-pagosya-contact][data-contact-inline]:not([hidden])');
    if (inlineForm) {
      event.preventDefault();
      inlineForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const field = inlineForm.querySelector('input:not([type=hidden]), textarea');
      if (field) field.focus({ preventScroll: true });
      return;
    }
    const launcher = trigger && document.querySelector('[data-pagosya-contact]:not([hidden]) [data-contact-toggle]');
    if (!launcher) return;
    event.preventDefault();
    if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click();
  });

  mountCarousels();
  void loadCommerceContent();
  void load();
})();
