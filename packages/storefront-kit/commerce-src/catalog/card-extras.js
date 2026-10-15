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
