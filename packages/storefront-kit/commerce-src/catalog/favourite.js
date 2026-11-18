  // Spec 2026-11-10 rasca y elige: the favourite the shopper chose in the popup game — remembered on this device, or given by the parent
  // page on a published store (window.PAGOSYA_FAVOURITE) — comes first in the store's grid, marked «Tu favorito». A flavour
  // («id:Sabor») counts as its product; a product gone or sold out changes nothing.
  function favouriteProductId() {
    let id = typeof window.PAGOSYA_FAVOURITE === 'string' ? window.PAGOSYA_FAVOURITE : '';
    if (!id) { try { id = localStorage.getItem(`pagosya:fav:${config.slug}`) || ''; } catch {} }
    id = String(id).split(':')[0];
    return id && products().some(p => p.id === id && limit(p) !== 0) ? id : '';
  }
  function favouriteFirst(list) {
    const id = favouriteProductId(), at = id ? list.findIndex(p => p.id === id) : -1;
    return at > 0 ? [list[at], ...list.slice(0, at), ...list.slice(at + 1)] : list;
  }
  let favouriteStyled = false;
  function markFavourite(root) {
    root.querySelectorAll('.pya-fav-tag').forEach(tag => tag.remove());
    const id = favouriteProductId();
    if (!id) return;
    if (!favouriteStyled) {
      favouriteStyled = true;
      const style = document.createElement('style'); style.setAttribute('data-pagosya-favourite', '');
      style.textContent = '[data-pagosya-catalog] [data-product-id]{position:relative}.pya-fav-tag{position:absolute;left:10px;top:10px;z-index:2;padding:6px 10px;border-radius:999px;background:var(--store-foreground,#111);color:var(--store-background,#fff);font:800 11px/1 var(--store-body-font,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;transform:rotate(-3deg);pointer-events:none}';
      document.head.append(style);
    }
    root.querySelectorAll(`[data-product-id="${CSS.escape(id)}"]`).forEach(card => card.insertAdjacentHTML('afterbegin', '<span class="pya-fav-tag">Tu favorito</span>'));
  }
  // Popups 2.0 (spec 2026-11-18): a YAPI popup lands the shopper with its code already in the cart.
  document.addEventListener('pagosya:apply-promo', event => {
    const code = String(event.detail?.code || '').trim();
    if (/^[A-Za-z0-9-]{3,40}$/.test(code)) rememberPromo(code);
  });
  document.addEventListener('pagosya:favourite', event => {
    const id = event.detail && typeof event.detail.id === 'string' ? event.detail.id : '';
    if (!id) return;
    window.PAGOSYA_FAVOURITE = id;
    render();
    if (!event.detail.go) return;
    // The popup's «Ver …»: its card on this page, else its own page.
    const productId = id.split(':')[0];
    const card = document.querySelector(`[data-pagosya-catalog] [data-product-id="${CSS.escape(productId)}"], [data-pagosya-product-page][data-product-id="${CSS.escape(productId)}"]`);
    if (card) card.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    // A real link (final review I3): the sandboxed store frame routes link clicks; a relative location.href resolved against the parent page.
    else if (products().some(p => p.id === productId)) {
      const link = document.createElement('a'); link.href = pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(productId)); link.hidden = true;
      document.body.append(link); link.click(); link.remove();
    }
  });
