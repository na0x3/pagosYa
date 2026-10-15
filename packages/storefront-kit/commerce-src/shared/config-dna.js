(() => {
  "use strict";
  // pagosya-product-options:v1 — bounded variant IDs, prices, stock and galleries.
  // pagosya-product-content:v1 — per-colour photo sets and product content blocks.
  const config = window.PAGOSYA_CONFIG || {};
  // Design DNA: each enum becomes data-dna-<name> on <html>, so variant CSS and motion can key on it.
  // Same values as SOURCE_DNA_RUNTIME_ENUMS in the API (a test pins them); anything else is ignored.
  const DNA_VALUES = {
    display: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda', 'courier-prime', 'big-shoulders-stencil', 'black-ops-one', 'stardos-stencil', 'staatliches', 'teko', 'barlow-condensed', 'orbitron', 'audiowide', 'michroma', 'pacifico', 'caveat', 'kaushan-script', 'lobster', 'bungee', 'titan-one', 'bowlby-one', 'fredoka', 'monoton', 'righteous', 'abril-fatface', 'archivo-black'],
    text: ['bricolage', 'fraunces', 'instrument', 'instrument-serif', 'oswald', 'syne', 'unbounded', 'space-grotesk', 'dm-serif-display', 'playfair-display', 'epilogue', 'sora', 'manrope', 'newsreader', 'young-serif', 'rubik', 'space-mono', 'big-shoulders-display', 'bebas-neue', 'anton', 'chivo', 'lora', 'libre-caslon-text', 'outfit', 'figtree', 'familjen-grotesk', 'bitter', 'nunito', 'shrikhand', 'bodoni-moda', 'courier-prime', 'big-shoulders-stencil', 'black-ops-one', 'stardos-stencil', 'staatliches', 'teko', 'barlow-condensed', 'orbitron', 'audiowide', 'michroma', 'pacifico', 'caveat', 'kaushan-script', 'lobster', 'bungee', 'titan-one', 'bowlby-one', 'fredoka', 'monoton', 'righteous', 'abril-fatface', 'archivo-black'],
    case: ['none', 'upper', 'small-caps'], tracking: ['tight', 'normal', 'wide'],
    radius: ['none', 'soft', 'round', 'pill'], border: ['none', 'hairline', 'bold'], frame: ['bleed', 'inset', 'rounded', 'arch', 'polaroid', 'blob', 'stamp', 'tape'],
    button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split', 'sticker', 'ticket', 'bubbly', 'brutal'], hover: ['lift', 'fill', 'underline-grow', 'tilt', 'shine', 'invert'], press: ['squash', 'sink', 'pop', 'none'],
    motion: ['calm', 'snappy', 'playful', 'cinematic'], grammar: ['editorial', 'grid', 'collage', 'index', 'poster', 'magazine', 'brutalist'], density: ['airy', 'balanced', 'dense'],
    cart: ['drawer', 'sheet', 'page', 'overlay'], added: ['toast', 'ribbon', 'bubble', 'inline', 'stamp'], product: ['editorial', 'dense', 'image-led', 'story-led', 'conversion'],
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
