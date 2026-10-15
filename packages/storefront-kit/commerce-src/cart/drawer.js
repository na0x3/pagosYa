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
  cartDrawer.innerHTML = `<header class="cart-drawer__header" data-part="cart-head"><h2 id="cart-drawer-title">${escape(CART_WORD || 'Tu pedido')}</h2><button type="button" data-cart-close aria-label="Cerrar pedido">×</button></header><div class="cart-drawer__body"></div><button type="button" class="cart-drawer__continue" data-cart-close>Seguir comprando</button>`;
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
