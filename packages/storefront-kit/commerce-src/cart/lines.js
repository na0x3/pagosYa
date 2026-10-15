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
