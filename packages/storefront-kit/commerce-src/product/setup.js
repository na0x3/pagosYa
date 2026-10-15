  const fullProductPage = document.querySelector("[data-pagosya-product-page]");
  const fullCheckoutPage = document.querySelector("[data-pagosya-checkout-page]");
  // Kit-owned pages: the whole catalog (productos.html) and one collection per page (coleccion.html).
  const fullCatalogPage = Boolean(document.querySelector('[data-catalog-full]'));
  const collectionPage = Boolean(document.querySelector('[data-collection-page]'));
  const currentCollection = () => {
    const slug = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('c');
    return collections().find((c) => c.slug === slug) || null;
  };
  const rootPath = /(?:^|\/)pages\//.test(window.PAGOSYA_PREVIEW_PAGE || location.pathname) ? "../" : "";
  const pageHref = (page, query = "") => rootPath + page + query;
  // Older kit pages guessed an authored homepage section that many stores do not have.
  document.querySelectorAll('.commerce-header a[href="index.html#catalogo"]').forEach(link => { link.href = pageHref('productos.html'); });
  const detail = fullProductPage || document.createElement("dialog");
  detail.setAttribute("data-pagosya-product", "");
  detail.addEventListener('change', event => {
    const input = event.target;
    if (!input?.matches?.('[name=membershipPeriod]') || !selectedProduct) return;
    const join = detail.querySelector('[data-membership-join]');
    if (join) join.href = membershipJoinUrl(selectedProduct, input.value);
  });
  detail.setAttribute("aria-labelledby", "pagosya-product-title");
  if (!fullProductPage) document.body.append(detail);
  // The product page is platform-rendered; authored rules aimed at its hooks would fight the kit layout.
  // Exactly the product page hooks; catalog hooks such as [data-pagosya-product-template] stay authored.
  const productHook = /\[data-pagosya-product(?:-page)?(?=[\]~|^$*=\s])|\.product-detail__/;
  function splitSelectors(list) {
    const parts = []; let depth = 0, start = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }
  function releaseRules(container) {
    const rules = container.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (rule.cssRules?.length) releaseRules(rule);
      if (typeof rule.selectorText !== 'string' || !productHook.test(rule.selectorText)) continue;
      const kept = splitSelectors(rule.selectorText).filter(selector => !productHook.test(selector));
      if (kept.length) rule.selectorText = kept.join(', '); else container.deleteRule(i);
    }
  }
  function releaseProductPageStyles() {
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.ownerNode?.dataset?.pagosyaKit !== undefined) continue;
      try { releaseRules(sheet); } catch { /* Unreadable sheets keep their rules; kit selectors still outrank them. */ }
    }
  }
  releaseProductPageStyles();
  window.addEventListener('load', releaseProductPageStyles);
  // A wrapper that holds nothing but the product page must not paint panels beside the kit layout.
  const productWrapper = fullProductPage?.parentElement;
  if (productWrapper && productWrapper !== document.body && productWrapper.children.length === 1) productWrapper.style.setProperty('background', 'none', 'important');
  let selectedProduct = null, selectedImage = 0, detailTrigger = null, oldOverflow = "";
  let selectedOptions = [], selectedQuantity = 1, selectedPicks = [];
  const swatchColors = { negro: '#292b29', black: '#292b29', blanco: '#fffdf7', white: '#fffdf7', rojo: '#b5443f', red: '#b5443f', azul: '#446a98', blue: '#446a98', verde: '#71866a', green: '#71866a', rosa: '#d89ca6', pink: '#d89ca6', beige: '#d8c5a9', crema: '#eee4c9', cream: '#eee4c9', salvia: '#8b987b', 'verde salvia': '#8b987b', sage: '#8b987b', coral: '#d98b70', marfil: '#f1e8d5', ivory: '#f1e8d5', marron: '#805d48', brown: '#805d48', gris: '#92928e', gray: '#92928e', grey: '#92928e', amarillo: '#e0b847', yellow: '#e0b847', naranja: '#d28349', orange: '#d28349', morado: '#80678f', purple: '#80678f', oliva: '#757853', olive: '#757853' };
  function swatchColor(group, value) {
    if (!/^(color|colour|tono|tinte|acabado|finish)$/i.test(group)) return '';
    return swatchColors[value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] || '';
  }
  function priceMarkup(p, variant, from = false) {
    const base = variant ? { ...p, amount: variant.amount } : p;
    const amount = price(base), sale = amount < base.amount;
    return `<strong class="product-detail__price">${from ? 'Desde ' : ''}${money(amount, p.currency)}</strong>${sale ? `<del class="product-detail__original" aria-label="Precio anterior">${money(base.amount, p.currency)}</del><span class="product-detail__saving">${escape(p.discountPercent)}% de descuento</span>` : ''}`;
  }
  const BADGE_NEW_MS = 30 * 86400000;
  /** The photo badge (spec 2026-10-10): the merchant's own words, '' for none, else only what is true right now. */
  function productBadge(p) {
    if (typeof p.badge === 'string') return p.badge.trim().slice(0, 20);
    if (store.topSellerId && store.topSellerId === p.id) return 'Más vendido';
    if (!isMembership(p) && p.discountPercent && price(p) < p.amount) return `−${p.discountPercent}%`;
    const created = Date.parse(p.createdAt);
    return Number.isFinite(created) && Date.now() - created < BADGE_NEW_MS ? 'Nuevo' : '';
  }
  const badgeMarkup = (p, className) => { const text = productBadge(p); return text ? `<span class="${className}">${escape(text)}</span>` : ''; };
  /* Compra única vs. Suscríbete y ahorra: offered only for plain products of a store that can take the consent at payment. */
  function subscriptionChoice(p) {
    const offers = subscriptionsAvailable() && p.fulfillmentType !== 'DIGITAL' && !p.extras?.length ? (p.subscriptionOptions || []) : [];
    if (!offers.length) return '';
    const best = Math.max(...offers.map(o => o.discountPercent));
    return `<fieldset class="product-detail__subscription" data-subscription-choice><legend>Cómo lo quieres</legend>`
      + `<label><input type="radio" name="purchaseMode" value="once" checked> Compra única</label>`
      + `<label><input type="radio" name="purchaseMode" value="subscribe"> ${best ? `Suscríbete y ahorra hasta ${best}%` : 'Suscríbete'}</label>`
      + (offers.length > 1
        ? `<select name="subscriptionCadence" aria-label="Frecuencia" disabled>${offers.map(o => `<option value="${escape(o.cadence)}">${escape(CADENCE_TEXT[o.cadence])}${o.discountPercent ? ` · −${o.discountPercent}%` : ''}</option>`).join('')}</select>`
        : `<input type="hidden" name="subscriptionCadence" value="${escape(offers[0].cadence)}">`)
      + `<p class="product-detail__subscription-price" data-subscription-price hidden></p>`
      + `<p class="product-detail__subscription-conflict" data-subscription-conflict role="alert" hidden></p>`
      + `<p>Te enviamos un enlace para pagar antes de cada entrega. No se cobra automáticamente.</p></fieldset>`;
  }
  function selectedCadence() {
    const choice = detail.querySelector('[data-subscription-choice]');
    if (!choice || !selectedProduct || !subscriptionsAvailable() || choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe') return undefined;
    const cadence = choice.querySelector('[name=subscriptionCadence]')?.value;
    return offerFor(selectedProduct, cadence) ? cadence : undefined;
  }
  function showCadenceConflict(cadence) {
    const note = detail.querySelector('[data-subscription-conflict]');
    const text = cadenceConflict(cadence);
    if (note) { note.textContent = text; note.hidden = !text; }
    return text;
  }
  function updateSubscriptionChoice() {
    const choice = detail.querySelector('[data-subscription-choice]');
    if (!choice || !selectedProduct) return;
    const cadence = selectedCadence(), note = choice.querySelector('[data-subscription-price]'), select = choice.querySelector('select[name=subscriptionCadence]');
    if (select) select.disabled = choice.querySelector('[name=purchaseMode]:checked')?.value !== 'subscribe';
    const groups = optionGroups(selectedProduct), variant = groups ? selectedVariant() : undefined;
    if (note) {
      note.hidden = !cadence || (groups && !variant);
      if (!note.hidden) note.textContent = subscriptionPriceNote(selectedProduct, variant || undefined, cadence);
    }
    showCadenceConflict(cadence);
  }
  function quantityMarkup(action = '') {
    return '<div class="product-detail__purchase"><div class="product-detail__quantity" role="group" aria-label="Cantidad"><button type="button" data-product-quantity="-1" aria-label="Reducir cantidad" disabled>−</button><output data-product-quantity-value aria-live="polite" aria-label="Cantidad de unidades">1</output><button type="button" data-product-quantity="1" aria-label="Aumentar cantidad">+</button></div><span class="product-detail__subtotal" data-product-subtotal></span>' + action + '</div>';
  }
  function boxMarkup(p, group) {
    return `<fieldset class="product-detail__box"><legend>${escape(group.name)} <span data-box-progress aria-live="polite">0 de ${group.count}</span></legend><p class="product-detail__box-help">Elige ${group.count}; puedes repetir.</p><ul>${group.extras.map(e => {
      const image = safeUrl(e.imageUrl);
      return `<li${e.available === false ? ' data-unavailable' : ''}>${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : '<span class="product-detail__box-photo" aria-hidden="true"></span>'}<span class="product-detail__box-name">${escape(e.name)}${e.available === false ? '<small>Agotado</small>' : ''}${e.amount ? `<small>+${money(e.amount, p.currency)} c/u</small>` : ''}</span><span class="product-detail__box-stepper" role="group" aria-label="Cantidad de ${escape(e.name)}"><button type="button" data-box-pick="${escape(e.id)}" data-step="-1" aria-label="Quitar ${escape(e.name)}">−</button><output data-box-count="${escape(e.id)}">0</output><button type="button" data-box-pick="${escape(e.id)}" data-step="1" aria-label="Agregar ${escape(e.name)}">+</button></span></li>`;
    }).join('')}</ul></fieldset>`;
  }
  function updateBox() {
    const p = selectedProduct, group = boxGroup(p), buy = detail.querySelector('[data-box-add]');
    if (!group || !buy) return;
    const full = selectedPicks.length >= group.count;
    group.extras.forEach(e => {
      const count = selectedPicks.filter(id => id === e.id).length, linked = e.productId && products().find(item => item.id === e.productId);
      const room = !linked || limit(linked) - usedUnits(linked.id) > count;
      detail.querySelector(`[data-box-count="${CSS.escape(e.id)}"]`).textContent = count;
      detail.querySelectorAll(`[data-box-pick="${CSS.escape(e.id)}"]`).forEach(button => {
        button.disabled = !ready || checkingOut || (Number(button.dataset.step) < 0 ? !count : full || e.available === false || !room);
      });
    });
    detail.querySelector('[data-box-progress]').textContent = `${selectedPicks.length} de ${group.count}`;
    const line = selectedPicks.length === group.count ? cartLine(boxKey(p.id, selectedPicks)) : null;
    const available = line ? remaining(p, null, line.picks) : 0;
    buy.disabled = !ready || checkingOut || !available;
    if (line) buy.dataset.add = boxKey(p.id, selectedPicks); else delete buy.dataset.add;
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, { amount: p.amount + pickedExtras(group, selectedPicks).reduce((sum, e) => sum + e.amount, 0) });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = line
      ? available ? `${pickLabel(line.extras)}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : 'Ya añadiste la cantidad disponible de esta caja.'
      : `Elige ${group.count - selectedPicks.length} más para completar tu caja.`;
  }
  function updateQuantity() {
    if (!selectedProduct || !detail.querySelector('[data-product-quantity-value]')) return;
    const box = boxGroup(selectedProduct), boxLine = box && selectedPicks.length === box.count ? cartLine(boxKey(selectedProduct.id, selectedPicks)) : null;
    const groups = optionGroups(selectedProduct), variant = selectedVariant();
    const available = groups && !variant || box && !boxLine ? 0 : remaining(selectedProduct, variant, boxLine?.picks);
    selectedQuantity = Math.max(1, Math.min(selectedQuantity, available));
    updateSubscriptionChoice();
    detail.querySelector('[data-product-quantity-value]').textContent = selectedQuantity;
    detail.querySelectorAll('[data-product-quantity]').forEach(button => {
      button.disabled = !ready || checkingOut || (Number(button.dataset.productQuantity) < 0 ? selectedQuantity <= 1 : selectedQuantity >= available);
    });
    const cadence = selectedCadence();
    const amount = boxLine ? boxLine.amount : cadence && !(groups && !variant) ? subscriptionPrice(selectedProduct, variant || undefined, cadence) : price(variant ? { ...selectedProduct, amount: variant.amount } : selectedProduct);
    const pending = groups && !variant || box && !boxLine;
    const startingAt = pending && !box ? selectedProduct.variants.filter(v => remaining(selectedProduct, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value)).map(v => price({ ...selectedProduct, amount: v.amount })) : [];
    const total = pending ? startingAt.length ? `desde ${money(Math.min(...startingAt), selectedProduct.currency)}` : '' : available ? money(amount * selectedQuantity, selectedProduct.currency) : '';
    // The action carries the live total; the subtotal line only adds information for several units.
    detail.querySelector('[data-product-subtotal]').textContent = !pending && total && selectedQuantity > 1 ? `Subtotal ${total}` : '';
    detail.querySelectorAll('[data-product-total]').forEach(el => { el.textContent = total; });
    updateStickyBar();
  }
  let stickyObserver = null, buyPassed = false, commerceData = null;
  const starsMarkup = rating => `<span class="product-detail__stars" style="--rating:${Math.max(0, Math.min(5, Number(rating) || 0))}" aria-hidden="true">★★★★★</span>`;
  // Exact published totals come from the server summary, never from the latest-reviews page.
  function decorateProductReviews() {
    const p = selectedProduct, line = detail.querySelector('[data-product-rating]'), section = detail.querySelector('[data-product-reviews]');
    if (!p || !line) return;
    /* Studio preview: the merchant sees how real reviews will look, labeled as an example; a store
     * never ships these — outside the preview only verified shopper reviews render. */
    const sample = preview && !commerceData?.reviewSummary?.[p.id];
    if (!sample && !commerceData) return;
    const summary = sample ? { average: 5, count: 2 } : commerceData.reviewSummary?.[p.id];
    if (!summary || !Number.isSafeInteger(summary.count) || summary.count < 1 || !(summary.average >= 1 && summary.average <= 5)) { line.hidden = true; if (section) section.hidden = true; return; }
    const list = sample
      ? [{ rating: 5, displayName: 'Ejemplo', body: 'Así se verá una reseña verificada de tus clientes después de su compra.' }, { rating: 5, displayName: 'Ejemplo', body: 'Las reseñas reales llegan solas: pagosYa se las pide a quien ya recibió su pedido.' }]
      : (Array.isArray(commerceData.reviews) ? commerceData.reviews : []).filter(review => review.productId === p.id && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5).slice(0, 6);
    const authoredReviews = [...document.querySelectorAll('[data-pagosya-reviews]')].some(slot => !detail.contains(slot));
    const label = `${summary.average.toLocaleString('es-BO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} de 5 · ${summary.count} ${summary.count === 1 ? 'reseña verificada' : 'reseñas verificadas'}${sample ? ' · ejemplo' : ''}`;
    const showSection = !!section && list.length > 0 && !authoredReviews;
    line.innerHTML = showSection ? `<a href="#product-reviews">${starsMarkup(summary.average)}<span>${label}</span></a>` : `${starsMarkup(summary.average)}<span>${label}</span>`;
    line.hidden = false;
    if (!section) return;
    section.hidden = !showSection;
    section.innerHTML = showSection ? `<h2 id="product-reviews-title">Reseñas verificadas${sample ? ' · ejemplo' : ''}</h2><p class="product-detail__reviews-summary">${starsMarkup(summary.average)}<span>${label}</span></p><div class="product-detail__review-list">${list.map(review => `<article><p class="product-detail__review-meta">${starsMarkup(review.rating)}<span class="product-detail__review-score">${review.rating} de 5</span> <strong>${escape(review.displayName)}</strong></p><p>${escape(review.body)}</p></article>`).join('')}</div>` : '';
  }
