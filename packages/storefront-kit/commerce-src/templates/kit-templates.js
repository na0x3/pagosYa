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
