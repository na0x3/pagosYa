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
