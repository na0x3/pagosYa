(() => {
  "use strict";
  const config = window.PAGOSYA_CONFIG || {};
  const hosted = window.PAGOSYA_HOSTED === true;
  const track = (event, method) => { if (hosted) parent.postMessage({ type: 'pagosya:funnel', event, ...(method ? { method } : {}) }, '*'); };
  const preview = window.PAGOSYA_PREVIEW === true && !hosted;
  const request = async (url, options) => {
    if (!hosted) return fetch(url, options);
    const action = url.endsWith('/cart-checkout') ? 'checkout' : url.endsWith('/leads') ? 'lead' : url.endsWith('/shipping/quote') ? 'shipping' : url.includes('/content/reviews') ? 'review' : url.includes('/content') ? 'content' : 'catalog';
    const result = await window.PAGOSYA_HOSTED_REQUEST(action, options?.body ? JSON.parse(options.body) : url.includes('/content') ? { locale: document.documentElement.lang || 'es' } : {});
    return { ok: result.ok, json: async () => result.body };
  };
  let store = config.data || {};
  let ready = Boolean(config.demo || preview || hosted);
  let category = "all";
  let checkingOut = false;
  const cart = new Map();
  let partnerCode;
  if (!preview && !config.demo && window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug)) {
    const key = `pagosya:partner:${config.slug}`;
    const incoming = new URLSearchParams(location.search).get('partner');
    const valid = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,40}$/.test(value);
    if (valid(incoming)) partnerCode = incoming;
    try {
      if (partnerCode) sessionStorage.setItem(key, partnerCode);
      else { const stored = sessionStorage.getItem(key); if (valid(stored)) partnerCode = stored; }
    } catch {}
  }

  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const money = (amount, currency = "BOB") => new Intl.NumberFormat("es-BO", { style: "currency", currency }).format(amount / 100);
  const products = () => Array.isArray(store.items) ? store.items : [];
  const limit = (p) => Math.max(0, Math.min(99, p.purchaseLimit ?? 99, p.stock ?? 99));
  const price = (p) => {
    const now = Date.now();
    const active = p.discountPercent > 0 && (!p.discountStartsAt || Date.parse(p.discountStartsAt) <= now) && (!p.discountEndsAt || Date.parse(p.discountEndsAt) > now);
    return active ? Math.round(p.amount * (1 - p.discountPercent / 100)) : p.amount;
  };
  const safeUrl = (value) => { try { if (typeof value !== "string" || !value) return ""; if (/^data:image\/(png|jpeg|webp|avif|gif);base64,[a-zA-Z0-9+/=]+$/.test(value)) return value; const u = new URL(value, value.startsWith("assets/") ? document.baseURI : config.apiBaseUrl || location.href); return ["http:", "https:"].includes(u.protocol) ? u.href : ""; } catch { return ""; } };
  const hostedProduct = (id) => `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}/p/${encodeURIComponent(id)}${partnerCode ? "?partner=" + encodeURIComponent(partnerCode) : ""}`;
  function message(text) { document.querySelectorAll("[data-pagosya-status]").forEach((el) => { el.textContent = text; }); }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-article-url]');
    if (link && hosted) { event.preventDefault(); parent.postMessage({ type: 'pagosya:source-external', url: link.href }, '*'); }
  });
  const cartKey = `pagosya:cart:${config.slug || 'store'}`;
  function restoreCart(items) {
    if (!Array.isArray(items)) return;
    cart.clear();
    for (const item of items.slice(0, 100)) {
      const p = products().find(p => p.id === item?.id);
      if (p && limit(p) > 0 && !p.variants?.length && !p.extras?.length && Number.isInteger(item.quantity) && item.quantity > 0) cart.set(p.id, Math.min(item.quantity, limit(p)));
    }
  }
  if (preview || hosted) restoreCart(window.PAGOSYA_PREVIEW_CART);
  else {
    try { restoreCart(JSON.parse((config.demo ? sessionStorage : localStorage).getItem(cartKey) || "[]")); } catch { /* Storage can be unavailable. */ }
    window.addEventListener("storage", event => {
      if (event.key !== cartKey || checkingOut) return;
      try { restoreCart(JSON.parse(event.newValue || "[]")); renderCart(); } catch { /* Ignore invalid stored state. */ }
    });
  }
  document.addEventListener("pagosya:serialize-cart", event => {
    if (event.detail && typeof event.detail === "object") event.detail.items = [...cart].map(([id, quantity]) => ({ id, quantity }));
  });
  document.addEventListener("pagosya:restore-cart", event => { restoreCart(event.detail?.items); renderCart(); });
  const galleryImages = (p) => [...new Set((p.imageUrls || []).map(safeUrl).filter(Boolean))];
  const detailStyle = document.createElement("style");
  detailStyle.textContent = `
    .menu-item{position:relative}.menu-item:not([data-custom-product]) .menu-item__details{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;border-radius:inherit;background:transparent;box-shadow:none;cursor:pointer;color:inherit}
    .menu-item .menu-item__details:focus-visible{outline:3px solid currentColor;outline-offset:-4px}.menu-item:not([data-custom-product]) .menu-add{position:relative;inset:auto;z-index:2}
    [data-pagosya-categories][hidden],[data-product-field][hidden],[data-product-media][hidden],[data-product-link][hidden],[data-pagosya-cart][hidden]{display:none!important}
    [data-pagosya-status]:empty{width:0!important;height:0!important;min-width:0!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;overflow:hidden!important;box-shadow:none!important}
    [data-pagosya-product] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)!important}
    [data-pagosya-product] .product-detail__gallery[hidden]{display:none!important}
    @layer pagosya-commerce {
    [data-pagosya-product]{box-sizing:border-box;width:min(960px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--brand-border,var(--line,currentColor));border-radius:var(--brand-radius,0px);color:var(--brand-foreground,var(--ink,CanvasText));background:var(--brand-background,var(--paper,Canvas));font:inherit;box-shadow:0 16px 64px #0003;overflow:auto;overscroll-behavior:contain}
    [data-pagosya-product]::backdrop{background:#0009}[data-pagosya-product] *{box-sizing:border-box}
    [data-pagosya-product] button,[data-pagosya-product] a{font:inherit;cursor:pointer}[data-pagosya-product] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-product] button:focus-visible,[data-pagosya-product] a:focus-visible{outline:3px solid #5f6547;outline-offset:3px}
    [data-pagosya-product] .product-detail__close{position:sticky;top:12px;z-index:3;display:flex;align-items:center;justify-content:center;width:44px;min-height:44px;margin:12px 12px -56px auto;padding:0;border:1px solid var(--brand-border,var(--line,currentColor));border-radius:50%;background:var(--brand-background,var(--paper,Canvas));color:inherit;font-size:28px;line-height:1}
    [data-pagosya-product] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}
    [data-pagosya-product] .product-detail__gallery{min-width:0;padding:24px;background:var(--brand-surface,transparent)}
    [data-pagosya-product] .product-detail__photo{display:block;width:100%;height:360px;max-height:48dvh;object-fit:contain;border:0;border-radius:8px;background:var(--brand-surface,transparent);touch-action:pan-y}
    [data-pagosya-product] .product-detail__navigation{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0}
    [data-pagosya-product] .product-detail__navigation button{width:44px;min-height:44px;padding:0;border:1px solid var(--brand-border,var(--line,currentColor));border-radius:50%;background:var(--brand-background,var(--paper,Canvas));color:inherit;font-size:22px}
    [data-pagosya-product] .product-detail__thumbnails{display:flex;gap:8px;overflow-x:auto;padding:4px}
    [data-pagosya-product] .product-detail__thumbnails button{flex:0 0 64px;width:64px;height:64px;padding:3px;border:2px solid transparent;border-radius:8px;background:var(--brand-background,var(--paper,Canvas))}
    [data-pagosya-product] .product-detail__thumbnails button[aria-pressed=true]{border-color:var(--brand-accent,var(--accent,currentColor))}
    [data-pagosya-product] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:contain}
    [data-pagosya-product] .product-detail__copy{padding:64px 32px 32px;align-self:center;min-width:0}
    [data-pagosya-product] h2{margin:0 0 16px;font:inherit;font-size:clamp(24px,4vw,34px);font-weight:700;line-height:1.15;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__description{margin:0 0 24px;font-size:16px;line-height:1.6;white-space:pre-line}
    [data-pagosya-product] .product-detail__price{display:block;margin:0 0 20px;font-size:22px;font-weight:700}
    [data-pagosya-product] .product-detail__buy{display:flex;align-items:center;justify-content:center;min-height:48px;width:100%;padding:12px 20px;border:0;border-radius:8px;color:var(--brand-accent-foreground,var(--paper,Canvas));background:var(--brand-accent,var(--accent,var(--ink,CanvasText)));text-decoration:none;font-weight:700}
    [data-pagosya-product] .product-detail__status{min-height:24px;margin:12px 0 0;font-size:14px;line-height:1.5}
    [data-pagosya-product] .product-detail__empty{display:grid;min-height:220px;place-items:center;color:inherit}
    @media(max-width:640px){[data-pagosya-product]{width:calc(100% - 16px);max-height:calc(100dvh - 16px)}[data-pagosya-product] .product-detail__layout{grid-template-columns:1fr}[data-pagosya-product] .product-detail__gallery{padding:20px}[data-pagosya-product] .product-detail__copy{padding:24px}[data-pagosya-product] .product-detail__photo{height:280px;max-height:36dvh}}
  `;
  detailStyle.textContent += `
    }
    :where([data-pagosya-product-page]){display:block;width:100%;max-width:1200px;max-height:none;margin:24px auto;padding:0 24px;border:0;border-radius:0;box-shadow:none;background:inherit;color:inherit;overflow:visible}
    :where([data-pagosya-product-page]) h1{font-size:clamp(30px,4vw,64px);line-height:1.1;overflow-wrap:anywhere}
  `;
  document.head.append(detailStyle);
  const fullProductPage = document.querySelector("[data-pagosya-product-page]");
  const fullCheckoutPage = document.querySelector("[data-pagosya-checkout-page]");
  const rootPath = /(?:^|\/)pages\//.test(window.PAGOSYA_PREVIEW_PAGE || location.pathname) ? "../" : "";
  const pageHref = (page, query = "") => rootPath + page + query;
  const detail = fullProductPage || document.createElement("dialog");
  detail.setAttribute("data-pagosya-product", "");
  detail.setAttribute("aria-labelledby", "pagosya-product-title");
  if (!fullProductPage) document.body.append(detail);
  let selectedProduct = null, selectedImage = 0, detailTrigger = null, oldOverflow = "";
  function showImage(index) {
    const images = galleryImages(selectedProduct);
    if (!images.length) return;
    selectedImage = (index + images.length) % images.length;
    const photo = detail.querySelector(".product-detail__photo");
    photo.src = images[selectedImage];
    photo.alt = `${selectedProduct.name} · imagen ${selectedImage + 1} de ${images.length}`;
    detail.querySelector("[data-product-count]").textContent = `${selectedImage + 1} / ${images.length}`;
    detail.querySelectorAll("[data-product-image]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.productImage) === selectedImage)));
  }
  function openProduct(id, trigger) {
    const p = products().find(p => p.id === id);
    if (!p) { if (fullProductPage) detail.innerHTML = '<h1>Producto no disponible</h1><p>Este producto ya no está en el catálogo.</p><a href="index.html#catalogo">Explorar productos</a>'; return; }
    track('product_view');
    selectedProduct = p; selectedImage = 0; detailTrigger = trigger;
    const images = galleryImages(p), complex = p.variants?.length || p.extras?.length;
    detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}<div class="product-detail__layout"${images.length ? '' : ' data-no-images'}><section class="product-detail__gallery" aria-label="Fotos del producto"${images.length ? '' : ' hidden'}>${images.length ? `<img class="product-detail__photo" src="${escape(images[0])}" alt="${escape(p.name)}" /><div class="product-detail__navigation">${images.length > 1 ? '<button type="button" data-product-prev aria-label="Foto anterior">←</button>' : ''}<span data-product-count aria-live="polite">1 / ${images.length}</span>${images.length > 1 ? '<button type="button" data-product-next aria-label="Foto siguiente">→</button>' : ''}</div>${images.length > 1 ? `<div class="product-detail__thumbnails" aria-label="Elegir foto">${images.map((url, index) => `<button type="button" data-product-image="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === 0}"><img src="${escape(url)}" alt="" loading="lazy" /></button>`).join('')}</div>` : ''}` : '<p class="product-detail__empty">Sin fotos disponibles</p>'}</section><section class="product-detail__copy"><${fullProductPage ? "h1" : "h2"} id="pagosya-product-title">${escape(p.name)}</${fullProductPage ? "h1" : "h2"}><strong class="product-detail__price">${money(price(p), p.currency)}</strong>${limit(p) === 0 ? '<p>Agotado</p>' : complex ? preview || config.demo ? '<button class="product-detail__buy checkout-button" disabled>Elegir opciones en la tienda</button>' : `<a class="product-detail__buy checkout-button" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="product-detail__buy checkout-button" type="button" data-add="${escape(p.id)}">Añadir al pedido</button>`}<p class="product-detail__status" role="status" aria-live="polite"></p>${productInformation(p)}</section></div>`;
    renderCart();
    if (!fullProductPage && !detail.open) { oldOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; detail.showModal(); }
    detail.querySelector("[data-product-close]")?.focus();
    let touchStart;
    const photo = detail.querySelector(".product-detail__photo");
    photo?.addEventListener("touchstart", event => { touchStart = event.touches[0]; }, { passive: true });
    photo?.addEventListener("touchend", event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.clientX, dy = event.changedTouches[0].clientY - touchStart.clientY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showImage(selectedImage + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
  }
  function productInformation(p) {
    const delivery = (store.locations || []).map(l => `<li><strong>${escape(l.name)}</strong>${l.address ? `<br>${escape(l.address)}` : ''}<br>${[l.pickupEnabled && 'Retiro en tienda', l.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`).join('');
    return `<div class="product-tabs" role="tablist" aria-label="Información del producto"><button type="button" role="tab" id="product-description-tab" aria-controls="product-description-panel" aria-selected="true" tabindex="0" data-product-tab="description">Descripción</button><button type="button" role="tab" id="product-delivery-tab" aria-controls="product-delivery-panel" aria-selected="false" tabindex="-1" data-product-tab="delivery">Envíos y retiro</button></div><div role="tabpanel" id="product-description-panel" aria-labelledby="product-description-tab" tabindex="0"><p class="product-detail__description">${escape(p.description || 'El comercio aún no agregó una descripción.')}</p></div><div role="tabpanel" id="product-delivery-panel" aria-labelledby="product-delivery-tab" tabindex="0" hidden>${delivery ? `<ul class="product-delivery-list">${delivery}</ul>` : '<p>El comercio aún no configuró opciones de entrega.</p>'}<p>Elige la opción disponible al revisar tu pedido. El total final se confirma en pagosYa.</p></div>`;
  }
  function selectProductTab(button) {
    detail.querySelectorAll('[data-product-tab]').forEach(tab => {
      const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      detail.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !active;
    });
  }
  detail.addEventListener("close", () => { document.documentElement.style.overflow = oldOverflow; detailTrigger?.focus(); selectedProduct = null; });
  detail.addEventListener("click", event => {
    if (fullProductPage || event.target !== detail) return;
    const rect = detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) detail.close();
  });
  detail.addEventListener("keydown", event => {
    const tab = event.target.closest('[data-product-tab]');
    if (tab) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const tabs = [...detail.querySelectorAll('[data-product-tab]')];
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectProductTab(next); next.focus();
      }
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); showImage(selectedImage + (event.key === "ArrowRight" ? 1 : -1)); }
  });
  // Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.
  const checkoutSlots = [...document.querySelectorAll("[data-pagosya-checkout]")];
  for (const slot of checkoutSlots) slot.hidden = true;
  const checkoutPage = checkoutSlots[0] || fullCheckoutPage || document.createElement("section");
  // The runtime supplies one order review inside the active checkout surface.
  // Some authored pages also leave a sibling review slot; do not show two payment forms.
  if (fullCheckoutPage) document.querySelectorAll('[data-pagosya-cart][data-checkout-review]').forEach(slot => {
    if (slot !== checkoutPage && !checkoutPage.contains(slot)) {
      slot.hidden = true; slot.inert = true; slot.setAttribute('data-pagosya-redundant-review', '');
    }
  });
  checkoutPage.setAttribute("data-pagosya-checkout", "");
  checkoutPage.hidden = true;
  if (!fullCheckoutPage) document.body.append(checkoutPage);
  const checkoutStyle = document.createElement("style");
  checkoutStyle.textContent = `
    [data-pagosya-checkout][hidden]{display:none!important}
    [data-pagosya-redundant-review]{display:none!important}
    @layer pagosya-commerce {
    [data-pagosya-checkout]:not([hidden]){display:block;position:fixed;inset:0;z-index:2147483000;overflow:auto;overscroll-behavior:contain;background:var(--paper,#fffaf0);color:var(--ink,#20211d);font-family:inherit;padding:clamp(20px,5vw,64px)}
    [data-pagosya-checkout] *{box-sizing:border-box}
    [data-pagosya-checkout] .checkout-page__inner{max-width:1000px;margin:auto}
    [data-pagosya-checkout] .checkout-page__back{display:inline-flex;align-items:center;min-height:44px;padding:8px 0;margin:0 0 32px;border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-checkout] h1{margin:0 0 16px;font-size:clamp(30px,5vw,52px);line-height:1.1;font-weight:800}
    [data-pagosya-checkout] .checkout-page__intro{max-width:60ch;line-height:1.6;margin:0 0 32px}
    [data-pagosya-checkout] .checkout-page__layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:clamp(24px,5vw,64px)}
    [data-pagosya-checkout] .checkout-page__summary{padding:24px;border:1px solid var(--line,#d7d2c7);border-radius:12px;align-self:start;background:var(--brand-surface,transparent)}
    [data-pagosya-checkout] .checkout-page__summary h2{margin:0 0 20px;font-size:22px}
    [data-pagosya-checkout] .order-items{list-style:none;padding:0;margin:0}
    [data-pagosya-checkout] .order-item{display:block;padding:16px 0;border-bottom:1px solid var(--line,#d7d2c7)}
    [data-pagosya-checkout] .order-item>div:first-child{display:flex;justify-content:space-between;gap:16px;line-height:1.5}
    [data-pagosya-checkout] .quantity{display:flex;align-items:center;gap:12px;margin-top:12px}
    [data-pagosya-checkout] .quantity button{width:44px;min-height:44px;background:transparent;border:1px solid var(--line,#d7d2c7);border-radius:50%;font:inherit;color:inherit;cursor:pointer}
    [data-pagosya-checkout] .order-field{display:grid;gap:8px;margin:20px 0;font:inherit}
    [data-pagosya-checkout] select{width:100%;min-height:44px;padding:8px;border:1px solid var(--line,#d7d2c7);background:var(--paper,#fffaf0);color:inherit;font:inherit}
    [data-pagosya-checkout] .order-total{display:flex;justify-content:space-between;gap:16px;margin:24px 0;font-size:20px}
    [data-pagosya-checkout] .order-note{font-size:14px;line-height:1.6;color:inherit;opacity:.8}
    [data-pagosya-checkout] .checkout-button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:48px;padding:12px 20px;border:0;border-radius:var(--brand-radius,0px);background:var(--brand-accent,var(--accent,var(--ink,CanvasText)));color:var(--brand-accent-foreground,var(--paper,Canvas));font:inherit;font-weight:700;cursor:pointer}
    [data-pagosya-checkout] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-checkout] [data-pagosya-status]{margin:24px 0;font-size:15px;line-height:1.6}
    @media(max-width:640px){[data-pagosya-checkout] .checkout-page__layout{grid-template-columns:1fr}[data-pagosya-checkout] .checkout-page__summary{padding:20px}}
  `;
  checkoutStyle.textContent += `
    }
    :where([data-pagosya-checkout-page]):not([hidden]){position:static;inset:auto;z-index:auto;overflow:visible;background:inherit;color:inherit}
  `;
  document.head.append(checkoutStyle);
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
  const authoredDrawerTrigger = document.querySelector('[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]');
  if (authoredDrawerTrigger) document.querySelectorAll('[data-pagosya-cart]:not([data-checkout-review])').forEach(slot => {
    if (!slot.childElementCount && !slot.textContent.trim()) slot.hidden = true;
  });
  const cartDrawer = document.createElement('dialog');
  cartDrawer.className = 'cart-drawer';
  cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title');
  cartDrawer.innerHTML = '<header class="cart-drawer__header"><h2 id="cart-drawer-title">Tu pedido</h2><button type="button" data-cart-close aria-label="Cerrar pedido">×</button></header><div class="cart-drawer__body"></div><button type="button" class="cart-drawer__continue" data-cart-close>Seguir comprando</button>';
  document.body.append(cartDrawer);
  let drawerSlot, drawerPlaceholder, drawerWasHidden, drawerOverflow, drawerTrigger;
  function openCart(trigger, keyboard = false) {
    if (cartDrawer.open || checkingOut) return;
    if (detail.open) detail.close();
    drawerTrigger = trigger;
    drawerSlot = [...document.querySelectorAll('[data-pagosya-cart]')].find(el => !el.hasAttribute('data-checkout-review')) || document.createElement('div');
    drawerSlot.setAttribute('data-pagosya-cart', '');
    drawerPlaceholder = document.createComment('cart slot');
    if (drawerSlot.isConnected) drawerSlot.replaceWith(drawerPlaceholder);
    drawerWasHidden = drawerSlot.hidden; drawerSlot.hidden = false;
    cartDrawer.querySelector('.cart-drawer__body').append(drawerSlot);
    drawerOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    cartDrawer.dataset.instant = String(keyboard || config.motion === 'off');
    delete addedNotice.dataset.visible;
    cartDrawer.showModal(); renderCart();
    cartDrawer.querySelector('[data-cart-close]').focus();
  }
  function restoreDrawer() {
    if (!drawerSlot) return;
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
    const trigger = event.target.closest('[data-cart-open],a[href="#pedido"],a[href="#carrito"],a[href="#cart"]')
      || event.target.closest('a,button')?.querySelector('[data-cart-count]')?.closest('a,button');
    if (!trigger) return;
    event.preventDefault(); event.stopImmediatePropagation(); openCart(trigger, event.detail === 0);
  }, true);
  const addedNotice = document.createElement('div');
  addedNotice.className = 'cart-added'; addedNotice.setAttribute('role', 'status'); addedNotice.setAttribute('aria-live', 'polite');
  addedNotice.innerHTML = '<span></span><button type="button" data-cart-open>Ver pedido</button>';
  document.body.append(addedNotice);
  let addedTimer;
  function addedFeedback(product, button, keyboard) {
    if (button.closest('[data-pagosya-cart]')) return;
    addedNotice.dataset.instant = String(keyboard || config.motion === 'off');
    addedNotice.querySelector('span').textContent = `${product.name} añadido a tu pedido.`;
    addedNotice.dataset.visible = 'true';
    clearTimeout(addedTimer);
    addedTimer = setTimeout(() => { if (!addedNotice.contains(document.activeElement)) delete addedNotice.dataset.visible; }, 4000);
    // The confirmation remains visible with reduced motion or motion explicitly off.
    if (!keyboard && config.motion !== 'off' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const targets = [button, ...document.querySelectorAll('[data-cart-count]')];
      for (const target of targets) if (target.isConnected && target.animate) {
        target.getAnimations().forEach(animation => animation.cancel());
        target.animate([{ transform: 'scale(0.96)', opacity: 0.65 }, { transform: 'scale(1)', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.23,1,.32,1)' });
      }
    }
  }
  const shoppingStyle = document.createElement('style');
  shoppingStyle.textContent = `
    .cart-drawer{box-sizing:border-box;position:fixed;inset:0 0 0 auto;width:min(600px,48vw);max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;background:var(--brand-background,var(--paper,Canvas));color:var(--brand-foreground,var(--ink,CanvasText));font:inherit;overflow:auto;overscroll-behavior:contain;transform:translateX(0);transition:transform 250ms var(--ease-drawer,cubic-bezier(.32,.72,0,1)),opacity 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),display 250ms allow-discrete,overlay 250ms allow-discrete}
    .cart-drawer:not([open]){transform:translateX(100%);opacity:0}
    .cart-drawer::backdrop{background:#0007}
    @starting-style{.cart-drawer[open]{transform:translateX(100%);opacity:0}}
    .cart-drawer__header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:24px 32px;border-bottom:1px solid var(--brand-border,var(--line,#d7d2c7))}
    .cart-drawer__header h2{font:inherit;font-size:28px;font-weight:700;margin:0}
    .cart-drawer button{font:inherit;cursor:pointer;color:inherit;min-height:44px}
    .cart-drawer__header button{width:44px;border:0;background:transparent;font-size:28px}
    .cart-drawer__body{padding:8px 32px 24px}
    .cart-drawer [data-pagosya-cart]{position:static;inset:auto;width:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;box-shadow:none;background:transparent;color:inherit}
    .cart-drawer .order-items{padding:0;margin:0;list-style:none}
    .cart-drawer .order-item{padding:24px 0;border-bottom:1px solid var(--brand-border,var(--line,#d7d2c7))}
    .cart-drawer .order-item>div:first-child,.cart-drawer .order-total{display:flex;justify-content:space-between;gap:20px;overflow-wrap:anywhere}
    .cart-drawer .quantity{display:flex;align-items:center;gap:16px;margin-top:16px}
    .cart-drawer .quantity button{width:44px;border:1px solid var(--brand-border,var(--line,#d7d2c7));background:transparent}
    .cart-drawer .order-total{padding:24px 0;font-size:20px}.cart-drawer .order-empty{padding:40px 0;line-height:1.6}
    .cart-drawer .order-note{font-size:14px;line-height:1.5}
    .cart-drawer .checkout-button{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;min-height:52px;padding:16px 20px;border:0;background:var(--brand-accent,var(--accent,var(--ink,#20211d)));color:var(--brand-accent-foreground,var(--paper,#fff))}
    .cart-drawer button:disabled{opacity:.5;cursor:default}.cart-drawer__continue{display:block;margin:0 auto 32px;border:0;background:transparent;text-decoration:underline;text-underline-offset:4px}
    .cart-drawer :focus-visible,.cart-added :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    .cart-added{position:fixed;inset:auto 24px 24px auto;z-index:2147483001;display:flex;align-items:center;gap:20px;max-width:min(480px,calc(100vw - 48px));padding:12px 16px;background:var(--brand-foreground,var(--ink,#20211d));color:var(--brand-background,var(--paper,#fff));font:inherit;box-shadow:0 8px 24px #0002;opacity:0;transform:translateY(12px);visibility:hidden;transition:opacity 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),transform 200ms var(--ease-out,cubic-bezier(.23,1,.32,1)),visibility 200ms}
    .cart-added[data-visible=true]{opacity:1;transform:translateY(0);visibility:visible}.cart-added span{overflow-wrap:anywhere}.cart-added button{flex-shrink:0;min-height:44px;background:transparent;border:0;color:inherit;font:inherit;text-decoration:underline;text-underline-offset:4px}
    @media(max-width:700px){.cart-drawer{width:100vw}.cart-drawer__header{padding:20px}.cart-drawer__body{padding:8px 20px 24px}.cart-added{inset:auto 12px 12px;max-width:none;gap:12px}}
    .cart-drawer[data-instant=true],.cart-added[data-instant=true]{transition:none}[data-cart-count]{display:inline-block}
    @media(prefers-reduced-motion:reduce){.cart-drawer,.cart-added{transition:none;transform:none}}
  `;
  shoppingStyle.textContent += `
    [data-pagosya-checkout] .checkout-page__inner{max-width:1200px;min-width:0;container-type:inline-size}
    [data-pagosya-checkout] .checkout-page__summary{padding:0;border:0;border-radius:0;background:transparent}
    [data-pagosya-checkout] .checkout-review{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,1fr);gap:clamp(32px,6vw,96px);align-items:start}
    /* The order review shares cart behavior, but must not inherit an authored
       fixed drawer's geometry. Keep it in the checkout's own content column. */
    [data-pagosya-checkout] [data-pagosya-cart][data-checkout-review]{position:static;inset:auto;z-index:auto;width:100%;min-width:0;max-width:none;height:auto;min-height:0;max-height:none;margin:0;padding:0;overflow:visible;transform:none;box-shadow:none;border:0;background:transparent;color:inherit;opacity:1;visibility:visible}
    [data-pagosya-checkout] .checkout-review>[data-retention-recovery]{grid-column:1 / -1;width:100%;min-width:0}
    .checkout-review__fields{min-width:0}.checkout-review__summary{min-width:0;border-top:1px solid var(--brand-border,var(--line,#d7d2c7));padding-top:24px}
    [data-pagosya-checkout] input:not([type=checkbox]):not([type=radio]),[data-pagosya-checkout] textarea{box-sizing:border-box;min-height:48px;width:100%;padding:12px;font:inherit;color:inherit;background:var(--brand-background,var(--paper,Canvas));border:1px solid var(--brand-border,var(--line,#d7d2c7))}
    [data-pagosya-checkout] fieldset{min-width:0;margin:24px 0;padding:0;border:0}
    [data-pagosya-checkout] [hidden]{display:none!important}
    [data-pagosya-checkout] button{min-height:44px;font:inherit}
    [data-pagosya-checkout] :focus-visible{outline:3px solid currentColor;outline-offset:3px}
    @media(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:1fr;gap:32px}}
    @container(max-width:700px){[data-pagosya-checkout] .checkout-review{grid-template-columns:minmax(0,1fr);gap:32px}}
  `;
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
    checkoutPage.innerHTML = `<div class="checkout-page__inner">${fullCheckoutPage && !payment ? '<a class="checkout-page__back" href="index.html">Volver a la tienda</a>' : `<button class="checkout-page__back" type="button" data-checkout-back>${payment ? 'Volver al resumen' : 'Volver a la tienda'}</button>`}<div><h1 tabindex="-1">${payment ? 'Pago de prueba' : 'Revisa tu pedido'}</h1><p class="checkout-page__intro">${payment ? 'Puedes completar el recorrido de prueba. No se realizará ningún cobro ni se creará un pedido real.' : 'Revisa los cómics y ajusta las cantidades. Puedes completar este recorrido de prueba sin datos de pago ni cobros.'}</p><p data-pagosya-status role="status" aria-live="polite"></p></div><div class="checkout-page__summary"><div data-pagosya-cart data-checkout-review="${payment ? 'payment' : 'review'}"></div></div></div>`;
    renderCart();
    checkoutPage.querySelector("h1").focus();
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
  function customProductCard(p, image, complex) {
    const template = document.querySelector('template[data-pagosya-product-template]');
    if (!template || !template.content) return null;
    const root = template.content.firstElementChild?.cloneNode(true);
    const field = name => root?.querySelector(`[data-product-field="${name}"]`);
    const detail = root?.querySelector('a[data-product-link]');
    const buy = root?.querySelector('button[data-product-add]');
    if (template.content.children.length !== 1 || !root || !field('name') || !field('price') || !detail || !buy) {
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
      if (name === 'description') node.hidden = !value;
    };
    fill('name', p.name, 'menu-item__name');
    fill('price', money(price(p), p.currency), 'menu-item__price');
    fill('description', p.description && p.description.trim() !== p.name.trim() ? p.description : '', 'menu-item__description');
    const photo = field('image');
    if (photo) {
      if (photo.tagName !== 'IMG') { document.documentElement.dataset.productTemplateInvalid = 'true'; return null; }
      photo.hidden = !image;
      if (image) { photo.src = image; photo.alt = p.name; photo.loading = 'lazy'; }
      else photo.removeAttribute('src');
      photo.classList.add('menu-item__image');
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
    root.toggleAttribute('data-no-image', !image);
    root.querySelectorAll('[data-product-media]').forEach(media => { media.hidden = !image; });
    buy.classList.add('menu-add'); buy.type = 'button';
    buy.dataset.add = p.id; buy.disabled = !ready || limit(p) === 0 || complex;
    buy.setAttribute('aria-label', `${complex ? 'Elegir opciones de' : 'Añadir'} ${p.name}`);
    if (limit(p) === 0) { buy.textContent = 'Agotado'; root.dataset.soldOut = 'true'; }
    else if (complex) {
      buy.textContent = 'Elegir opciones';
      if (!preview && !config.demo) {
        const link = document.createElement('a');
        for (const attr of [...buy.attributes]) if (!['disabled', 'type', 'data-add'].includes(attr.name)) link.setAttribute(attr.name, attr.value);
        link.href = safeUrl(hostedProduct(p.id)); link.textContent = 'Elegir opciones'; buy.replaceWith(link);
      }
    }
    return root.outerHTML;
  }
  function render() {
    delete document.documentElement.dataset.productTemplateInvalid;
    document.querySelectorAll("[data-store-name]").forEach((el) => { el.textContent = store.storeName || "Tu tienda"; });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.hidden = !(store.categories || []).length;
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      el.innerHTML = selected.length ? selected.map((p) => {
        const image = galleryImages(p)[0];
        const complex = p.variants?.length || p.extras?.length;
        const custom = customProductCard(p, image, complex);
        if (custom) return custom;
        return `<article class="menu-item">${config.productPage ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>` : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`}${image ? `<img class="menu-item__image" src="${escape(image)}" alt="${escape(p.name)}" loading="lazy" />` : ""}<div class="menu-item__copy"><h3>${escape(p.name)}</h3>${p.description && p.description.trim() !== p.name.trim() ? `<p>${escape(p.description)}</p>` : ""}${limit(p) === 0 ? '<span class="sold-out">Agotado</span>' : ""}</div><strong class="menu-item__price">${money(price(p), p.currency)}</strong>${complex ? preview || config.demo ? `<button class="menu-add" disabled>Elegir opciones</button>` : `<a class="menu-add" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `<button class="menu-add" type="button" data-add="${escape(p.id)}" aria-label="Añadir ${escape(p.name)}" ${!ready || limit(p) === 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`}</article>`;
      }).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
    });
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
    if (fullProductPage) openProduct(new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id'));
    if (fullCheckoutPage) showCheckout(location.hash === '#pago-de-prueba' && (preview || config.demo));
    renderCart();
    renderContact();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  function renderCart() {
    if (!preview && ready) {
      try {
        const value = JSON.stringify([...cart].map(([id, quantity]) => ({ id, quantity })));
        const storage = config.demo ? sessionStorage : localStorage;
        if (storage.getItem(cartKey) !== value) storage.setItem(cartKey, value);
      } catch { /* The current page still works when storage is unavailable. */ }
    }
    document.querySelectorAll("[data-pagosya-catalog] [data-add], [data-pagosya-product] [data-add]").forEach((button) => {
      const product = products().find((p) => p.id === button.dataset.add);
      button.disabled = !ready || checkingOut || !product || (cart.get(product.id) || 0) >= limit(product);
    });
    let total = 0, count = 0;
    const rows = [];
    for (const [id, quantity] of cart) {
      const p = products().find((p) => p.id === id);
      if (!p) continue;
      total += price(p) * quantity; count += quantity;
      rows.push(`<li class="order-item"><div><strong>${escape(p.name)}</strong><span>${money(price(p) * quantity, p.currency)}</span></div><div class="quantity"><button type="button" data-remove="${escape(id)}" aria-label="Quitar una unidad de ${escape(p.name)}">−</button><output>${quantity}</output><button type="button" data-add="${escape(id)}" aria-label="Añadir una unidad de ${escape(p.name)}" ${quantity >= limit(p) ? "disabled" : ""}>+</button></div></li>`);
    }
    document.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = String(count); });
    document.querySelectorAll("[data-pagosya-cart]").forEach((el) => {
      const focused = el.contains(document.activeElement) ? document.activeElement : null;
      const focusedAction = focused?.hasAttribute('data-add') ? 'data-add' : focused?.hasAttribute('data-remove') ? 'data-remove' : null;
      const focusedId = focusedAction ? focused.getAttribute(focusedAction) : null;
      const remembered = el.hasAttribute("data-checkout-review") ? [...checkoutAnswers] : [];
      const answers = [...remembered, ...[...el.querySelectorAll('input,textarea')].map(field => [field.name, field.value])];
      const previousLocation = el.querySelector("[name=location]")?.value || checkoutAnswers.get("location");
      const previousMethod = el.querySelector("[name=method]")?.value || checkoutAnswers.get("method");
      delete el.dataset.discountedSubtotal;
      const previousCredit = el.querySelector('[name=creditCode]')?.value || '';
      const previousAddress = el.querySelector('[name=shippingAddress]')?.value || '';
      const review = el.hasAttribute("data-checkout-review");
      if (review && cart.size && ready) track('checkout_started');
      const payment = el.dataset.checkoutReview === "payment";
      const action = review ? payment ? "data-finish-demo" : "data-pay" : "data-checkout";
      const actionLabel = review ? payment ? "Completar prueba" : preview || config.demo ? "Continuar al pago de prueba" : store.checkoutMode === "whatsapp" ? "Pedir por WhatsApp" : store.checkoutMode === "external" ? "Continuar al contacto" : "Pagar con pagosYa" : "Continuar con mi pedido";
      el.innerHTML = `<ul class="order-items">${rows.join("") || '<li class="order-empty">Tu pedido está vacío.<br>Explora los productos para comenzar.</li>'}</ul>${review && !digitalOnlyCart() && store.locations?.length ? `<label class="order-field">Sucursal<select name="location">${store.locations.map((l) => `<option value="${escape(l.id)}">${escape(l.name)}</option>`).join("")}</select></label><label class="order-field">Entrega<select name="method"></select></label>` : review && !digitalOnlyCart() && store.shippingEnabled ? '<label class="order-field">Entrega<select name="method"></select></label>' : ""}${review && !digitalOnlyCart() && !store.shippingEnabled && store.locations?.length ? '<fieldset data-delivery-address hidden><legend>Entrega a domicilio</legend><label class="order-field">Dirección y referencia<textarea name="shippingAddress" rows="3" maxlength="300" autocomplete="street-address" placeholder="Zona, calle, número y una referencia"></textarea></label><p class="order-note">Podrás compartir tu ubicación actual al completar tus datos en el pago.</p></fieldset>' : ''}${!digitalOnlyCart() && store.shippingEnabled && review ? `<fieldset data-shipping><legend>Envío</legend><label class="order-field">Dirección<input name="shippingAddress" maxlength="300" autocomplete="street-address" value="${escape(previousAddress)}"></label><label class="order-field">País de entrega (código de dos letras)<input name="shippingCountry" maxlength="2" placeholder="BO" autocomplete="country"></label><label class="order-field">Código postal<input name="shippingPostalCode" maxlength="20" autocomplete="postal-code"></label><button type="button" data-shipping-quote>Calcular envío</button><label class="order-field">Opción de envío<select name="shippingZoneId"><option value="">Calcula las opciones disponibles</option></select></label><p data-shipping-status role="status" aria-live="polite"></p></fieldset>` : ''}${review && store.creditsEnabled ? `<label class="order-field">Tarjeta de regalo o saldo<input name="creditCode" maxlength="39" autocomplete="off" spellcheck="false" value="${escape(previousCredit)}"></label><button type="button" data-credit-apply>Aplicar saldo</button><p data-credit-status role="status"></p>` : ''}<div class="order-total"><span>Subtotal</span><strong>${money(total, products()[0]?.currency)}</strong></div><p class="order-note">El total final se confirma en el checkout.</p>${review && (store.bundlesEnabled || store.creditsEnabled) ? '<p data-bundle-quote-status role="status"></p>' : ''}<button class="checkout-button" ${action} type="button" ${!ready || !count || checkingOut ? "disabled" : ""}>${actionLabel}<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg></button>`;
      for (const [name, value] of answers) { const field = [...el.querySelectorAll('input,textarea')].find(field => field.name === name); if (field) field.value = value; }
      if (review) {
        const summary = document.createElement('aside'); summary.className = 'checkout-review__summary';
        summary.innerHTML = '<h2>Tu pedido</h2>';
        for (const child of [...el.children]) if (child.matches('.order-items,.order-total,.order-note')) summary.append(child);
        const fields = document.createElement('section'); fields.className = 'checkout-review__fields';
        fields.innerHTML = `<h2>${digitalOnlyCart() || !(store.locations?.length || store.shippingEnabled) ? 'Continúa al pago' : '¿Cómo quieres recibir tu pedido?'}</h2>`;
        fields.append(...el.children); el.append(fields, summary);
        el.classList.add('checkout-review');
      }
      const select = el.querySelector("[name=location]");
      if (select && previousLocation && Array.from(select.options).some((o) => o.value === previousLocation)) select.value = previousLocation;
      updateMethods(el, previousMethod);
      const branchInfo = document.createElement('p'); branchInfo.className = 'order-note'; branchInfo.setAttribute('data-branch-address', '');
      el.querySelector('[name=method]')?.closest('label')?.after(branchInfo);
      select?.addEventListener("change", () => { updateMethods(el); updateShipping(el); });
      el.querySelector('[name=method]')?.addEventListener('change', () => { updateShipping(el); track('delivery_selected', el.querySelector('[name=method]')?.value); });
      el.querySelector('[name=shippingZoneId]')?.addEventListener('change', () => void shippingQuote(el));
      el.querySelectorAll('[name=shippingCountry],[name=shippingPostalCode]').forEach(field => field.addEventListener('input', () => updateShipping(el)));
      el.querySelector('[data-credit-apply]')?.addEventListener('click', () => void applyCredit(el));
      el.querySelector('[name=creditCode]')?.addEventListener('input', () => { el.dataset.creditReady = 'false'; el.querySelector('[data-credit-status]').textContent = 'Aplica el código para actualizar el total.'; });
      updateShipping(el);
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
    document.dispatchEvent(new CustomEvent("pagosya:cart-updated"));
  }
  function renderContact() {
    let slot = document.querySelector('[data-pagosya-contact]');
    if (!store.contactFormEnabled) { if (slot) slot.hidden = true; return; }
    // Only an enabled store setting permits the legacy fallback; new stores default off.
    if (!slot && store.contactFormEnabled === true && !fullProductPage && !fullCheckoutPage && (!window.PAGOSYA_PREVIEW_PAGE || window.PAGOSYA_PREVIEW_PAGE === 'index.html')) {
      slot = document.createElement('section'); slot.setAttribute('data-pagosya-contact', '');
      const footer = document.querySelector('body > footer');
      if (footer) footer.before(slot); else (document.querySelector('main') || document.body).append(slot);
    }
    if (!slot) return;
    slot.hidden = false;
    if (slot.querySelector('form')) return;
    slot.innerHTML = `<h2>${escape(store.contactTitle || 'Conversemos')}</h2><p>${escape(store.contactSubtitle || 'Deja tus datos y tu consulta. El equipo de la tienda te responderá directamente.')}</p><form><label>Nombre<input name="name" autocomplete="name" maxlength="120" required></label><label>Correo<input name="email" type="email" autocomplete="email" maxlength="254" required></label><label>WhatsApp (opcional)<input name="phone" type="tel" autocomplete="tel" maxlength="40"></label><label>Tu mensaje<textarea name="message" rows="4" maxlength="600" required></textarea></label><p>Usaremos estos datos para responder a tu consulta.</p><button type="submit">Enviar consulta</button><p role="status" aria-live="polite" data-contact-status></p></form>`;
    const form = slot.querySelector('form');
    // Opaque previews intentionally disallow native form navigation.
    if (preview || config.demo) {
      const simulate = event => { event.preventDefault(); if (form.reportValidity()) form.querySelector('[data-contact-status]').textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; };
      form.querySelector('button').addEventListener('click', simulate);
      form.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.tagName !== 'TEXTAREA') simulate(event); });
    }
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const button = form.querySelector('button'); const status = form.querySelector('[data-contact-status]');
      if (button.disabled || !form.reportValidity()) return;
      if (preview || config.demo) { status.textContent = 'Prueba completada. Tu consulta no se envió al comercio.'; return; }
      button.disabled = true; status.textContent = 'Enviando…';
      try {
        const data = new FormData(form);
        const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [], name: String(data.get('name')).trim(), email: String(data.get('email')).trim(), phone: String(data.get('phone')).trim() || undefined, message: String(data.get('message')).trim() }) });
        const result = await response.json();
        if (!response.ok || !result.submitted) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'No se pudo enviar. Inténtalo otra vez.');
        form.reset(); status.textContent = 'Consulta recibida. El equipo de la tienda te contactará.';
      } catch (error) { status.textContent = error.message || 'No se pudo enviar. Inténtalo otra vez.'; }
      finally { button.disabled = false; }
    });
  }
  const contactStyle = document.createElement('style');
  contactStyle.textContent = `[data-pagosya-contact]{max-width:760px;margin:clamp(48px,8vw,96px) auto;padding:24px;color:inherit;font:inherit}[data-pagosya-contact][hidden]{display:none}[data-pagosya-contact] h2{font:inherit;font-size:clamp(28px,4vw,40px);font-weight:700;margin:0 0 16px}[data-pagosya-contact] p{line-height:1.6}[data-pagosya-contact] form{display:grid;gap:18px;margin-top:28px}[data-pagosya-contact] label{display:grid;gap:8px;font-size:16px}[data-pagosya-contact] input,[data-pagosya-contact] textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid currentColor;border-radius:4px;background:transparent;color:inherit;font:inherit}[data-pagosya-contact] button{min-height:48px;padding:12px 24px;background:var(--ink,#20211d);color:var(--paper,#fffaf0);border:1px solid currentColor;font:inherit;cursor:pointer}[data-pagosya-contact] button:disabled{opacity:.6}[data-pagosya-contact] :focus-visible{outline:3px solid currentColor;outline-offset:4px}[data-contact-status]{min-height:24px;overflow-wrap:anywhere}`;
  contactStyle.textContent = '@layer pagosya-contact-base {' + contactStyle.textContent + '}';
  document.head.append(contactStyle);
  function digitalOnlyCart() { return cart.size > 0 && [...cart.keys()].every(id => products().find(product => product.id === id)?.fulfillmentType === 'DIGITAL'); }
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
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [...cart].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity })), locationId: panel.querySelector('[name=location]')?.value || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined }) });
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
    button.disabled = true; status.textContent = 'Calculando envío…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [...cart].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity })), fulfillmentMethod: 'delivery', locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: selected || undefined, creditCode: panel.querySelector('[name=creditCode]')?.value.trim() || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo calcular el envío.');
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
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: [...cart].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity })), creditCode: code || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined, locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: panel.querySelector('[name=shippingZoneId]')?.value || undefined }) });
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
    const panel = button.closest("[data-pagosya-cart]");
    if (!validateDelivery(panel)) return;
    const locationId = panel.querySelector("[name=location]")?.value;
    const fulfillmentMethod = panel.querySelector("[name=method]")?.value;
    if (fulfillmentMethod) track('delivery_selected', fulfillmentMethod);
    const shippingZoneId = panel.querySelector('[name=shippingZoneId]')?.value;
    const creditCode = panel.querySelector('[name=creditCode]')?.value.trim() || undefined;
    if (creditCode && panel.dataset.creditReady !== 'true') { message('Aplica el saldo antes de continuar.'); return; }
    const shippingAddress = panel.querySelector('[name=shippingAddress]')?.value.trim();
    if (!preview && !config.demo && !digitalOnlyCart() && store.shippingEnabled && fulfillmentMethod === 'delivery' && (!shippingZoneId || !shippingAddress)) { message('Calcula el envío, elige tu zona y escribe la dirección.'); return; }
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !fulfillmentMethod) { message("Esta sucursal no tiene un método de entrega disponible."); return; }
    if (preview || config.demo) { showCheckout(true); location.hash = "pago-de-prueba"; return; }
    if (store.checkoutMode === "whatsapp") {
      const phone = String(store.contactPhone || "").replace(/\D/g, "");
      if (!phone) { message("El comercio todavía no tiene un número de WhatsApp configurado."); return; }
      const text = [...cart].map(([id, quantity]) => `${quantity} × ${products().find((p) => p.id === id)?.name}`).join("\n");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(`Hola, quisiera pedir:\n${text}`)}`;
      if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); return;
    }
    if (store.checkoutMode === "external") {
      const url = safeUrl(store.leadCaptureUrl);
      if (url) { if (hosted) parent.postMessage({type:'pagosya:source-external',url},'*'); else window.location.assign(url); } else message("El comercio todavía no tiene un enlace de contacto configurado.");
      return;
    }
    checkingOut = true; button.disabled = true; button.setAttribute("aria-busy", "true"); message("Preparando tu pedido…");
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/cart-checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ partnerCode: window.PAGOSYA_PRIVACY?.analyticsAllowed(config.slug) ? partnerCode : undefined, creditCode, recoveryToken: window.PAGOSYA_RETENTION_STATE?.token || undefined, ...(fulfillmentMethod === 'delivery' ? { shippingAddress } : {}), ...(store.shippingEnabled ? { fulfillmentMethod, shippingZoneId, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined } : {}), items: [...cart].map(([paymentLinkId, quantity]) => ({ paymentLinkId, quantity })), ...(locationId ? { locationId, fulfillmentMethod } : {}) }) });
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
    if (button.hasAttribute("data-add") && ready) {
      const p = products().find((p) => p.id === button.dataset.add);
      if (!p || p.variants?.length || p.extras?.length) return;
      const quantity = cart.get(p.id) || 0;
      if (quantity >= limit(p)) { message("Ya añadiste la cantidad disponible."); return; }
      track('add_to_cart');
      cart.set(p.id, quantity + 1); renderCart(); message(`${p.name} añadido a tu pedido.`); addedFeedback(p, button, event.detail === 0);
      if (detail.open || fullProductPage && selectedProduct) detail.querySelector(".product-detail__status").textContent = `${p.name} añadido a tu pedido.`;
    }
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
      store = await response.json(); ready = true; category = "all";
      for (const [id, quantity] of cart) { const p = products().find((p) => p.id === id); if (!p || !limit(p)) cart.delete(id); else cart.set(id, Math.min(quantity, limit(p))); }
      render(); message("");
    } catch (error) { ready = false; render(); message(error.message); }
  }
  async function loadCommerceContent() {
    const slots = document.querySelectorAll('[data-pagosya-blog],[data-pagosya-reviews],[data-pagosya-bundles]');
    if (!slots.length) return;
    if (preview || config.demo) { slots.forEach(slot => { slot.textContent = 'El contenido publicado del comercio aparecerá aquí en la tienda.'; }); return; }
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/content?locale=${encodeURIComponent(document.documentElement.lang || 'es')}`, { credentials: 'omit' });
      if (!response.ok) throw new Error('No se pudo cargar el contenido.');
      const data = await response.json();
      slots.forEach(slot => {
        if (slot.hasAttribute('data-pagosya-blog')) slot.innerHTML = data.articles.map(article => `<article id="articulo-${escape(article.slug)}"><h2>${escape(article.title)}</h2><p>${escape(article.author)} · ${new Date(article.publishedAt).toLocaleDateString('es-BO')}</p><p>${escape(article.excerpt)}</p><p><a data-article-url href="${escape(new URL(config.apiBaseUrl, config.checkoutOrigin).href.replace(/\/$/, ''))}/stores/public/${encodeURIComponent(config.slug)}/pages/${encodeURIComponent(article.locale)}/${encodeURIComponent(article.slug)}">Abrir artículo</a></p><details><summary>Leer aquí</summary>${article.body.split(/\n\s*\n/).map(paragraph => `<p>${escape(paragraph)}</p>`).join('')}</details></article>`).join('') || '<p>Todavía no hay artículos publicados.</p>';
        if (slot.hasAttribute('data-pagosya-reviews')) slot.innerHTML = data.reviews.filter(review => !fullProductPage || review.productId === selectedProduct?.id).map(review => `<article><strong>${escape(review.displayName)}</strong><p>${review.rating} de 5 · Compra verificada</p><p>${escape(review.body)}</p></article>`).join('') || '<p>Todavía no hay reseñas publicadas.</p>';
        if (slot.hasAttribute('data-pagosya-bundles')) slot.innerHTML = data.bundles.map(bundle => `<article><h3>${escape(bundle.name)}</h3><p>${bundle.kind === 'BOGO' ? 'Lleva dos; el de menor precio es gratis.' : `${bundle.discountPercent}% de descuento ${bundle.kind === 'FIXED' ? 'al completar el paquete' : 'desde ' + bundle.minimumQuantity + ' unidades'}.`}</p><ul>${bundle.items.map(item => `<li>${escape(products().find(p => p.id === item.productId)?.name || 'Producto del paquete')}${bundle.kind === 'FIXED' ? ' × ' + item.quantity : ''}</li>`).join('')}</ul><p>Añade los productos al carrito. La mejor oferta se aplica automáticamente al pagar; no se acumula con otros códigos.</p></article>`).join('') || '<p>No hay paquetes activos.</p>';
      });
    } catch { slots.forEach(slot => { slot.textContent = 'No pudimos cargar esta sección. Recarga la página para intentar de nuevo.'; }); }
  }
  document.querySelectorAll('[data-pagosya-review-form]').forEach(slot => {
    slot.innerHTML = `<form><h2>Comparte tu experiencia</h2><label class="order-field">Código de seguimiento del pedido<input name="trackingToken" required maxlength="250" autocomplete="off"></label><label class="order-field">Producto<select name="productId">${products().map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('')}</select></label><label class="order-field">Nombre público<input name="displayName" required maxlength="80"></label><label class="order-field">Calificación<select name="rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} de 5</option>`).join('')}</select></label><label class="order-field">Tu reseña<textarea name="body" required minlength="3" maxlength="2000"></textarea></label><p>Tu nombre y reseña podrán publicarse después de la revisión del comercio.</p><button type="submit">Enviar reseña</button><p role="status"></p></form>`;
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
  void loadCommerceContent();
  void load();
})();
