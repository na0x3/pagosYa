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
