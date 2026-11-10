  /* Spec 2026-11-09 Merman cart + checkout: the free-shipping bar, each line's saving and frequency, and the guarantee line — drawn in
   * the store's own accent and fonts. */
  const CART_TRUCK = '<svg class="cart-free__truck" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v9H3z"/><path d="M14 9h4l3 3v3h-7z"/><circle cx="7" cy="17" r="1.6"/><circle cx="17" cy="17" r="1.6"/></svg>';
  const CART_SHIELD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z"/><path d="m9 12 2 2 4-4"/></svg>';

  /* «Te faltan Bs 40 para envío gratis» → «¡Tienes envío gratis!»; nothing when the store has no free-shipping amount or the cart is empty. */
  function freeShippingBar(total, currency) {
    const goal = Number(store.freeShippingFrom);
    // A cart of digital products ships nothing (final review 2026-11-09).
    if (!Number.isInteger(goal) || goal <= 0 || total <= 0 || digitalOnlyCart()) return '';
    const left = goal - total, done = left <= 0;
    const width = done ? 100 : Math.max(4, Math.min(96, Math.round(total / goal * 100)));
    return `<div class="cart-free" data-part="cart-free-shipping"${done ? ' data-done' : ''}><p>${done ? '¡Tienes envío gratis!' : `Te faltan <strong>${money(left, currency)}</strong> para envío gratis`}</p><div class="cart-free__track" aria-hidden="true"><span style="width:${width}%"></span>${CART_TRUCK}</div></div>`;
  }

  /* «(Ahorras Bs 9)» in the accent, under the line's prices. */
  function cartLineSave(saved, currency) {
    return saved > 0 ? `<p class="order-item__save" data-part="cart-line-save">(Ahorras ${money(saved, currency)})</p>` : '';
  }

  /* «Una vez · Suscripción · cada mes (ahorra 10 %)» for a product that offers subscriptions on a store with them on. The API takes one
   * frequency per order, so a frequency another line already uses is the only one left open. */
  function cadenceSelectMarkup(id, line) {
    const { p } = line;
    if (line.picks || line.extras || !subscriptionsAvailable() || p.fulfillmentType === 'DIGITAL') return '';
    const offers = (p.subscriptionOptions || []).filter(offer => CADENCE_TEXT[offer.cadence]);
    if (!offers.length) return '';
    const others = [...cart.keys()].filter(key => key !== id).map(keyCadence).filter(Boolean);
    const options = offers.map(offer => {
      const blocked = others.some(cadence => cadence !== offer.cadence);
      return `<option value="${escape(offer.cadence)}"${line.cadence === offer.cadence ? ' selected' : ''}${blocked ? ' disabled' : ''}>Suscripción · ${CADENCE_TEXT[offer.cadence]}${offer.discountPercent ? ` (ahorra ${offer.discountPercent} %)` : ''}</option>`;
    }).join('');
    return `<label class="order-item__cadence"><select data-cart-cadence="${escape(id)}" aria-label="Frecuencia de ${escape(p.name)}"><option value=""${line.cadence ? '' : ' selected'}>Una vez</option>${options}</select></label>`;
  }

  /* The line keeps its place and quantity; only its frequency (and so its price) changes. */
  function changeLineCadence(id, cadence) {
    const line = cartLine(id);
    if (!line || !cart.has(id)) return;
    const next = lineKey(line.p.id, line.variant?.id, cadence || undefined);
    if (next === id || (cadence && [...cart.keys()].some(key => key !== id && keyCadence(key) && keyCadence(key) !== cadence))) return;
    const merged = cart.has(next) ? cart.get(next) : 0;
    const entries = [...cart].filter(([key]) => key !== next).map(([key, quantity]) => key === id ? [next, quantity + merged] : [key, quantity]);
    cart.clear();
    for (const [key, quantity] of entries) cart.set(key, quantity);
    renderCart();
  }

  /* The store's own returns promise (its first sentence), else pagosYa's. */
  function cartGuaranteeText() {
    const returns = typeof store.policies?.returns === 'string' ? store.policies.returns.trim() : '';
    const first = returns.split(/(?<=[.!?])\s+/)[0]?.slice(0, 140) || '';
    return first || 'Compra segura · Pagos protegidos por pagosYa';
  }
  function cartGuaranteeLine() {
    return `<p class="cart-guarantee" data-part="cart-guarantee">${CART_SHIELD}<span>${escape(cartGuaranteeText())}</span></p>`;
  }
