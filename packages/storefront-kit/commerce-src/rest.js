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
    markKitParts();
    fitCards();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitCards);
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
      rows.push(`<li class="order-item" data-part="cart-line"${image ? ' data-has-image' : ''}>${image ? `<img class="order-item__photo" data-part="cart-line-media" src="${escape(image)}"${responsiveAttrs(image, "72px")} alt="" loading="lazy" style="object-position:${escape(imagePosition(p, image))}" />` : ''}<div class="order-item__body"><div class="order-item__head"><strong>${escape(p.name)}</strong><span>${money(amount * quantity, p.currency)}</span></div>${option ? `<p class="order-item__option">${escape(option)}</p>` : ''}${unitCopy}${few}<div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(name)}" ${checkingOut || remaining(p, variant, line.picks) <= 0 ? "disabled" : ""}>+</button></div></div></li>`);
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
        summary.innerHTML = `<h2>${escape(CART_WORD || 'Tu pedido')}</h2>${count ? `<p class="checkout-review__count">${count} ${count === 1 ? 'producto' : 'productos'}</p>` : ''}`;
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
    // The store assistant takes this corner while it is on (spec 2026-10-13-store-assistant-design).
    if (!store.contactFormEnabled || store.assistant) { if (slot) slot.hidden = true; return; }
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
  const KIT_BUTTONS = ':where(.menu-add,.checkout-button,[data-pagosya-product] .product-detail__buy,.product-detail__sticky button,.cart-added button,.order-recommendations :is(button,a),.product-detail__bundle-add,[data-pagosya-contact] form>button[type=submit],[data-dna-fields] [data-account-gate] [data-part=submit])';
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
    `:root[data-dna-gallery=stack] ${PC} .product-detail__stage,:root[data-dna-gallery=mosaic] ${PC} .product-detail__stage{display:none}:root[data-dna-gallery=stack] ${PC} .product-detail__gallery,:root[data-dna-gallery=mosaic] ${PC} .product-detail__gallery{position:relative}`,
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
  // Fields: checkout's .order-field controls and the account inputs; checkboxes and radios (terms, delivery choice) keep their look.
  const DRAWN_FIELD = ':is([data-pagosya-checkout] .order-field :is(input,select,textarea),[data-pagosya-cart][data-checkout-review] .order-field :is(input,select,textarea),[data-account-gate] [data-part=input])';
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
  // «Pide una cotización» in the header, and any call to action marked data-pagosya-contact-open, opens the platform contact
  // form; a store without the form keeps the link, which goes to its Contacto page.
  document.addEventListener('click', event => {
    const trigger = event.target.closest && event.target.closest('[data-pagosya-contact-open]');
    const launcher = trigger && document.querySelector('[data-pagosya-contact]:not([hidden]) [data-contact-toggle]');
    if (!launcher) return;
    event.preventDefault();
    if (launcher.getAttribute('aria-expanded') !== 'true') launcher.click();
  });

  void loadCommerceContent();
  void load();
})();
