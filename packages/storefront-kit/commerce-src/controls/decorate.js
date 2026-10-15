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
