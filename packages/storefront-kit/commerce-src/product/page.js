  // Reassurance comes only from real store settings; nothing here is a marketing claim.
  function deliveryMarkup(p) {
    const locations = store.locations || [];
    const icon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${assuranceIcons[name]}</svg>`;
    const pickupPlaces = locations.filter(l => l.pickupEnabled).length;
    const items = p?.fulfillmentType === 'DIGITAL' ? [{ icon: 'digital', title: 'Entrega digital', detail: 'Descarga segura después del pago' }] : [
      (store.shippingPickupEnabled || pickupPlaces) && { icon: 'pickup', title: 'Retiro en tienda', detail: pickupPlaces > 1 ? `${pickupPlaces} sucursales disponibles` : 'Lo eliges al revisar tu pedido', delivery: true },
      (store.shippingEnabled || locations.some(l => l.deliveryEnabled)) && { icon: 'delivery', title: 'Entrega a domicilio', detail: 'El total se confirma al pagar', delivery: true },
    ].filter(Boolean);
    if (store.checkoutMode === 'whatsapp') items.push({ icon: 'chat', title: 'Pedido por WhatsApp', detail: 'Confirmas los detalles con la tienda' });
    else if (store.checkoutMode !== 'external') items.push({ icon: 'payment', title: 'Pago seguro', detail: 'Procesado por pagosYa' });
    // Merchant-authored lines (API-sanitized config.productAssurances) lead the row; the platform's
    // delivery and payment lines above stay derived from store facts and always render after them.
    const authored = Array.isArray(config.productAssurances) ? config.productAssurances.slice(0, 3) : [];
    items.unshift(...authored
      .filter((item) => item && typeof item.title === 'string' && item.title.trim())
      .map((item) => ({ icon: assuranceIcons[item.icon] ? item.icon : 'sparkles', title: String(item.title).slice(0, 40), detail: String(item.detail || '').slice(0, 80) })));
    const hasDeliveryTab = !!(locations.length || store.shippingEnabled || store.shippingPickupEnabled);
    return items.length ? `<ul class="product-detail__assurances" aria-label="Entrega y pago">${items.map(item => {
      const body = `${icon(item.icon)}<div><strong>${escape(item.title)}</strong><span>${escape(item.detail)}</span></div>`;
      return `<li>${item.delivery && hasDeliveryTab ? `<button type="button" data-product-delivery>${body}</button>` : body}</li>`;
    }).join('')}</ul>${policyLinks(['delivery', 'returns'])}` : policyLinks(['delivery', 'returns']);
  }
  /* Product card DNA, swatch=photo: the first photo of a variant that carries this option value (empty when none does). */
  function optionPhoto(groupIndex, value) {
    if (document.documentElement.getAttribute('data-dna-swatch') !== 'photo') return '';
    const found = (selectedProduct?.variants || []).find(v => variantValues(v)[groupIndex] === value && variantPhotos(v)[0]);
    return found ? `<span class="product-detail__swatch-photo" aria-hidden="true"><img src="${escape(variantPhotos(found)[0])}" alt="" loading="lazy" /></span>` : '';
  }
  function optionsMarkup(groups) {
    return `<div class="product-detail__options">${groups.map((group, index) => {
      const colors = group.values.map(value => swatchColor(group.name, value));
      return `<fieldset><legend>${escape(group.name)} <span data-product-selection="${index}"></span></legend><div class="product-detail__values"${colors.every(Boolean) ? ' data-kind="swatch"' : ''}>${group.values.map((value, valueIndex) => `<button type="button" data-part="swatch" data-product-option="${index}" data-option-value="${valueIndex}" aria-pressed="false">${optionPhoto(index, value) || (colors[valueIndex] ? `<span class="product-detail__swatch" style="--swatch:${colors[valueIndex]}" aria-hidden="true"></span>` : '')}<span class="product-detail__option-label">${escape(value)}</span></button>`).join('')}</div></fieldset>`;
    }).join('')}</div>`;
  }
  /** Fill every group with an available value, keeping the shopper's choices where a variant still allows them. */
  function completeSelection(p, preferred) {
    const groups = optionGroups(p);
    if (!groups) return [];
    const result = [];
    for (let index = 0; index < groups.length; index++) {
      const available = value => p.variants.some(v => remaining(p, v) > 0 && variantValues(v).every((candidate, i) => i > index || (i === index ? candidate === value : candidate === result[i])));
      const value = preferred[index] !== undefined && available(preferred[index]) ? preferred[index] : groups[index].values.find(available);
      if (value === undefined) return preferred.slice(0, index);
      result[index] = value;
    }
    return result;
  }
  let selectionNote = '';
  function selectedVariant() {
    const groups = optionGroups(selectedProduct);
    return groups && groups.every((g, i) => selectedOptions[i] !== undefined)
      ? selectedProduct.variants.find(v => variantValues(v).every((value, i) => value === selectedOptions[i])) : null;
  }
  function updateOptions() {
    const p = selectedProduct, groups = optionGroups(p);
    if (!groups) return;
    const prices = optionPrices(groups);
    detail.querySelectorAll('.product-detail__values').forEach((values, index) => { values.toggleAttribute('data-priced', !!prices[index] && groups[index].values.length <= 4); });
    detail.querySelectorAll('[data-product-option]').forEach(button => {
      const index = Number(button.dataset.productOption), value = groups[index].values[Number(button.dataset.optionValue)];
      const amounts = prices[index], amount = amounts?.[Number(button.dataset.optionValue)];
      if (amount != null) {
        const lowest = Math.min(...amounts.filter(value => value != null));
        button.dataset.optionPrice = money(amount, p.currency);
        if (amount > lowest) button.dataset.optionDelta = `+ ${money(amount - lowest, p.currency)}`; else delete button.dataset.optionDelta;
      } else { delete button.dataset.optionPrice; delete button.dataset.optionDelta; }
      // Earlier groups constrain later ones. Changing an earlier choice clears
      // later choices, so sparse catalogs never trap shoppers in a combination.
      const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : i > index || selectedOptions[i] === undefined || candidate === selectedOptions[i]));
      const available = matches.some(v => remaining(p, v) > 0);
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(selectedOptions[index] === value));
      button.setAttribute('aria-label', `${value}${available ? '' : matches.length ? ' · Sin disponibilidad' : ' · Combinación no disponible'}`);
    });
    const variant = selectedVariant(), buy = detail.querySelector('[data-variant-add]');
    const available = variant && remaining(p, variant) > 0;
    buy.disabled = !ready || checkingOut || !available;
    if (variant) buy.dataset.add = lineKey(p.id, variant.id, selectedCadence()); else delete buy.dataset.add;
    const compatible = p.variants.filter(v => remaining(p, v) > 0 && variantValues(v).every((value, i) => selectedOptions[i] === undefined || selectedOptions[i] === value));
    const lowest = (compatible.length ? compatible : p.variants).reduce((a, b) => a.amount <= b.amount ? a : b);
    detail.querySelector('[data-product-pricing]').innerHTML = priceMarkup(p, variant || lowest, !variant);
    groups.forEach((group, index) => { detail.querySelector(`[data-product-selection="${index}"]`).textContent = selectedOptions[index] || ''; });
    updateQuantity();
    detail.querySelector('.product-detail__status').textContent = variant
      ? available ? `${selectionNote || variant.name}${preview || config.demo ? ' · Vista previa, sin cobros.' : ''}` : 'Ya añadiste la cantidad disponible de esta combinación.'
      : p.variants.some(v => remaining(p, v) > 0) ? 'Selecciona una opción de cada grupo.' : 'Sin disponibilidad para añadir más unidades.';
  }
  function showImage(index) {
    const images = currentGallery();
    if (!images.length) return;
    selectedImage = (index + images.length) % images.length;
    const photo = detail.querySelector(".product-detail__photo");
    // srcset wins over src, so both must change or the first photo keeps showing.
    const set = responsiveSrcset(images[selectedImage]);
    if (set) { photo.srcset = set; photo.sizes = '(max-width: 820px) 100vw, 55vw'; } else photo.removeAttribute('srcset');
    photo.src = images[selectedImage];
    photo.style.objectPosition = imagePosition(selectedProduct, images[selectedImage]);
    photo.alt = `${selectedProduct.name} · imagen ${selectedImage + 1} de ${images.length}`;
    const counter = detail.querySelector("[data-product-count]");
    if (counter) counter.textContent = `${selectedImage + 1} / ${images.length}`;
    detail.querySelectorAll("[data-product-image]").forEach(button => button.setAttribute("aria-pressed", String(Number(button.dataset.productImage) === selectedImage)));
  }
  let activeGallery = null;
  const currentGallery = () => activeGallery || galleryImages(selectedProduct);
  /* Product card DNA, gallery=stack|mosaic: every photo full width in place of the thumbnail buttons. The stage stays in the
   * DOM (hidden by CSS) so showImage and the photo-set swap keep working unchanged. */
  function galleryMarkup(images, p) {
    let html = plainGalleryMarkup(images, p);
    const badge = images.length ? badgeMarkup(p, 'product-detail__badge') : '';
    const mode = document.documentElement.getAttribute('data-dna-gallery');
    const stacked = (mode === 'stack' || mode === 'mosaic') && images.length > 1;
    // The badge rides on the photo's own corner; a stacked gallery hides the stage, so there it leads the gallery.
    html = stacked ? badge + html : html.replace('<div class="product-detail__stage" data-part="stage">', `<div class="product-detail__stage" data-part="stage">${badge}`);
    if (stacked) {
      const at = html.indexOf('<div class="product-detail__thumbnails"');
      if (at > -1) html = html.slice(0, at) + `<div class="product-detail__stack" data-part="thumbs">${images.map((url, index) => `<img data-part="thumb" src="${escape(url)}"${responsiveAttrs(url, "(max-width: 820px) 100vw, 55vw")} alt="${escape(`${p.name} · imagen ${index + 1} de ${images.length}`)}" loading="${index ? 'lazy' : 'eager'}" />`).join('')}</div>`;
    }
    const tiles = productPageStyle() === 'conversion' && images.length ? tilesMarkup(conversionHighlights(p).tiles) : '';
    return html + tiles + '<span class="product-detail__decor" data-part="decor-a" aria-hidden="true"></span>';
  }
  function plainGalleryMarkup(images, p) {
    return images.length ? `<div class="product-detail__stage" data-part="stage"><img class="product-detail__photo" src="${escape(images[0])}"${responsiveAttrs(images[0], "(max-width: 820px) 100vw, 55vw")} alt="${escape(p.name)}" /><div class="product-detail__navigation"${images.length > 1 ? '' : ' hidden'}>${images.length > 1 ? '<button type="button" data-product-prev aria-label="Foto anterior">←</button>' : ''}<span data-product-count aria-live="polite">1 / ${images.length}</span>${images.length > 1 ? '<button type="button" data-product-next aria-label="Foto siguiente">→</button>' : ''}</div></div>${images.length > 1 ? `<div class="product-detail__thumbnails" data-part="thumbs" aria-label="Elegir foto">${images.map((url, index) => `<button type="button" data-part="thumb" data-product-image="${index}" aria-label="Ver foto ${index + 1}" aria-pressed="${index === 0}"><img src="${escape(url)}"${responsiveAttrs(url, "56px")} alt="" loading="lazy" /></button>`).join('')}</div>` : ''}` : '<p class="product-detail__empty">Sin fotos disponibles</p>';
  }
  function drawGallery(images) {
    const gallery = detail.querySelector('.product-detail__gallery');
    gallery.innerHTML = galleryMarkup(images, selectedProduct);
    gallery.hidden = !images.length;
    gallery.toggleAttribute('data-rail', images.length > 1);
    selectedImage = 0;
    showImage(0);
    watchHighlights();
  }
  function openProduct(id, trigger) {
    const p = products().find(p => p.id === id);
    if (!p) { if (fullProductPage) detail.innerHTML = `<h1>Producto no disponible</h1><p>Este producto ya no está en el catálogo.</p><a href="${escape(pageHref('productos.html'))}">Explorar productos</a>`; return; }
    track('product_view', undefined, { value: price(p), currency: p.currency });
    analytics('product_view', { productId: p.id }, 'view:' + p.id);
    selectedProduct = p; selectedImage = 0; selectedQuantity = 1; detailTrigger = trigger; selectionNote = ''; selectedPicks = [];
    activeGallery = null;
    selectedOptions = completeSelection(p, []);
    const images = galleryImages(p), box = boxGroup(p), complex = !box && (p.variants?.length || p.extras?.length), groups = optionGroups(p);
    const style = productPageStyle();
    const rating = fullProductPage ? '<p class="product-detail__rating" data-product-rating hidden></p>' : '';
    detail.dataset.style = style;
    adoptAuthoredAction();
    // Stores nearly always author their own way back right above the mount; a second trail beside it reads as a template.
    let authoredTrail = false;
    for (let node = fullProductPage ? detail.previousElementSibling : null; node && !node.matches('header,[role=banner]'); node = node.previousElementSibling) if (node.matches('a[href]') || node.querySelector('a[href]')) { authoredTrail = true; break; }
    const breadcrumb = authoredTrail ? '' : `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('productos.html'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>`;
    detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}<div class="product-detail__layout"${images.length ? '' : ' data-no-images'}><section class="product-detail__gallery" data-part="gallery" aria-label="Fotos del producto"${images.length ? '' : ' hidden'}${images.length > 1 ? ' data-rail' : ''}>${galleryMarkup(images, p)}</section><section class="product-detail__copy"><span class="product-detail__decor" data-part="decor-b" aria-hidden="true"></span>${fullProductPage ? breadcrumb : ''}<p class="product-detail__eyebrow" data-part="eyebrow">${escape((store.categories || []).find(c => c.id === p.categoryId)?.name || store.storeName || 'Tu tienda')}</p>${style === 'conversion' ? rating : ''}<${fullProductPage ? "h1" : "h2"} id="pagosya-product-title" data-part="title"${p.name.length > 32 ? ' data-length="long"' : ''}>${escape(p.name)}</${fullProductPage ? "h1" : "h2"}>${style !== 'conversion' ? rating : ''}<div class="product-detail__pricing" data-product-pricing>${isMembership(p) ? `<strong class="product-detail__price">${escape(membershipPriceText(p))}</strong>` : priceMarkup(p)}</div>${style === 'conversion' ? checksMarkup(conversionHighlights(p).checks) : ''}${p.description ? `<p class="product-detail__intro" data-part="intro">${escape(p.description)}</p>` : ''}${style === 'dense' ? specChipsMarkup(p) : ''}${style !== 'dense' && style !== 'conversion' ? highlightsMarkup(p) : ''}${isMembership(p) ? membershipMarkup(p) : groups ? `${optionsMarkup(groups)}${subscriptionChoice(p)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-variant-add disabled>Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : limit(p) === 0 ? '<p>Agotado</p>' : box ? `${boxMarkup(p, box)}${quantityMarkup('<button class="product-detail__buy checkout-button" type="button" data-box-add disabled>Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>')}` : complex ? preview || config.demo ? '<button class="product-detail__buy checkout-button" disabled>Elegir opciones en la tienda</button>' : `<a class="product-detail__buy checkout-button" href="${escape(safeUrl(hostedProduct(p.id)))}">Elegir opciones</a>` : `${subscriptionChoice(p)}${quantityMarkup(`<button class="product-detail__buy checkout-button" type="button" data-add="${escape(p.id)}">Añadir al pedido<span class="product-detail__buy-total" data-product-total aria-hidden="true"></span></button>`)}`}<p class="product-detail__status" role="status" aria-live="polite"></p>${style === 'dense' ? highlightsMarkup(p) : ''}${deliveryMarkup(p)}${productInformation(p)}</section></div>${contentBlocksMarkup(p)}${fullProductPage ? longPageTop(p) : ''}${fullProductPage ? `${bundleOffersMarkup(p)}${relatedMarkup(p)}<section class="product-detail__reviews" id="product-reviews" data-product-reviews aria-labelledby="product-reviews-title" hidden></section>${longPageBottom(p)}<div class="product-detail__sticky-space" data-product-sticky-space hidden></div><div class="product-detail__sticky" data-product-sticky hidden><div><strong>${escape(p.name)}</strong><span data-product-sticky-price></span></div><button type="button" data-product-jump>${isMembership(p) ? 'Hacerme miembro' : 'Añadir'}</button></div>` : ''}`;
    detail.removeAttribute('data-page-template');
    applyProductPageTemplate();
    showImage(0);
    if (fullProductPage && (!images.length || style === 'dense' || style === 'story-led') && !detail.hasAttribute('data-page-template')) {
      // Mobile reads identity, purchase, then details; desktop places the purchase panel beside both.
      const copy = detail.querySelector('.product-detail__copy'), [summary, buybox, details] = ['summary', 'buybox', 'details'].map(name => Object.assign(document.createElement('div'), { className: 'product-detail__' + name }));
      for (const child of [...copy.children]) (child.matches('.product-detail__pricing,.product-detail__checks,.product-detail__options,.product-detail__box,.product-detail__subscription,.product-detail__purchase,.product-detail__buy,.product-detail__status,.product-detail__assurances,p:not([class])') ? buybox : child.matches('.product-tabs,[role=tabpanel]') ? details : summary).append(child);
      copy.append(summary, buybox, ...(details.children.length ? [details] : [])); copy.dataset.split = '';
      if (style === 'story-led') {
        detail.querySelector('.product-detail__layout').prepend(summary);
        copy.dataset.story = '';
      }
    }
    if (MOTIFS.length) { placeProductMotif(p); placeButtonMotifs(detail); }
    watchHighlights();
    watchStickyBar();
    decorateProductReviews();
    renderCart();
    if (!fullProductPage && !detail.open) { oldOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden"; detail.showModal(); }
    detail.querySelector("[data-product-close]")?.focus();
    let touchStart;
    const gallery = detail.querySelector(".product-detail__gallery");
    gallery?.addEventListener("touchstart", event => { if (event.target.closest('.product-detail__photo')) touchStart = event.touches[0]; }, { passive: true });
    gallery?.addEventListener("touchend", event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.clientX, dy = event.changedTouches[0].clientY - touchStart.clientY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showImage(selectedImage + (dx < 0 ? 1 : -1));
      touchStart = null;
    }, { passive: true });
  }
  // Stores without accent tokens often color their action through .checkout-button; the product page keeps that brand color.
  function adoptAuthoredAction() {
    const root = getComputedStyle(document.documentElement);
    if (detail.style.getPropertyValue('--pd-accent') || ['--store-accent', '--brand-accent', '--accent'].some(name => root.getPropertyValue(name).trim())) return;
    const probe = Object.assign(document.createElement('button'), { className: 'checkout-button', type: 'button', hidden: true });
    probe.style.cssText = 'display:block!important;position:absolute;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const action = getComputedStyle(probe), background = action.backgroundColor;
    if (!/^rgba?\(0, 0, 0, 0\)$|transparent/.test(background)) { detail.style.setProperty('--pd-accent', background); detail.style.setProperty('--pd-on-accent', action.color); }
    probe.remove();
  }
  // Icons for owner-approved highlights. Each keeps one gentle loop; the kit owns the drawings.
  const highlightIcons = {
    car: { motion: 'roll', paths: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>' },
    fuel: { motion: 'drip', paths: '<path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.8a2 2 0 0 0-.6-1.4L18 5"/>' },
    gauge: { motion: 'sweep', paths: '<path d="M3.3 19a10 10 0 1 1 17.4 0"/><path d="m12 14 4-4"/>' },
    gear: { motion: 'spin', paths: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>' },
    seat: { motion: 'settle', paths: '<path d="M5 18v-2a3 3 0 0 1 3-3h3"/><path d="M8 13V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v9"/><path d="M5 18h13"/><path d="M18 15v6"/>' },
    road: { motion: 'stream', paths: '<path d="M4 22 8 2"/><path d="M20 22 16 2"/><path d="M12 6v3M12 12v3M12 18v3"/>' },
    truck: { motion: 'roll', paths: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.6a1 1 0 0 0-.2-.6l-3.5-4.4a1 1 0 0 0-.8-.4H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>' },
    package: { motion: 'bob', paths: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m3 7 9 5 9-5"/><path d="M12 12v10"/>' },
    clock: { motion: 'tick', paths: '<circle cx="12" cy="12" r="9"/><path class="pd-hand" d="M12 7v5l3 2"/>' },
    calendar: { motion: 'bob', paths: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' },
    bolt: { motion: 'flicker', paths: '<path d="M4 14a1 1 0 0 1-.8-1.6l9.9-10.2a.5.5 0 0 1 .9.5l-1.9 6A1 1 0 0 0 13 10h7a1 1 0 0 1 .8 1.6l-9.9 10.2a.5.5 0 0 1-.9-.5l1.9-6A1 1 0 0 0 11 14z"/>' },
    battery: { motion: 'fill', paths: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2"/><path class="pd-level" d="M5 10v4"/>' },
    plug: { motion: 'nudge', paths: '<path d="M12 22v-5"/><path d="M9 7V2M15 7V2"/><path d="M7 7h10v4a5 5 0 0 1-10 0z"/>' },
    wifi: { motion: 'pulse', paths: '<path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M12 20h.01"/>' },
    chip: { motion: 'pulse', paths: '<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M4 10h3M4 14h3M17 10h3M17 14h3M10 4v3M14 4v3M10 17v3M14 17v3"/>' },
    screen: { motion: 'glow', paths: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>' },
    leaf: { motion: 'sway', paths: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>' },
    ruler: { motion: 'nudge', paths: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>' },
    drop: { motion: 'drip', paths: '<path d="M12 3c3 4 6 6.7 6 10a6 6 0 0 1-12 0c0-3.3 3-6 6-10z"/>' },
    sun: { motion: 'rays', paths: '<circle cx="12" cy="12" r="4"/><path class="pd-rays" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>' },
    flame: { motion: 'flicker', paths: '<path d="M12 2c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2 3 1-1-2 0-4 0-6z"/>' },
    snowflake: { motion: 'spin', paths: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/>' },
    shirt: { motion: 'sway', paths: '<path d="M15 3a3 3 0 0 1-6 0"/><path d="M9 3 4 6l2 4 2-1v12h8V9l2 1 2-4-5-3"/>' },
    wash: { motion: 'drum', paths: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M7 6h.01M11 6h.01"/><circle class="pd-drum" cx="12" cy="14" r="5"/><path class="pd-drum" d="M9.5 14a2.5 2.5 0 0 1 5 0"/>' },
    sparkle: { motion: 'twinkle', paths: '<path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="pd-spark" d="M19 15l.7 1.8L21.5 18l-1.8.7L19 20.5l-.7-1.8L16.5 18l1.8-.7z"/>' },
    hand: { motion: 'wave', paths: '<path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 10V4a1.5 1.5 0 0 1 3 0v8"/><path d="M17 11V7a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-3a1.5 1.5 0 0 1 3 0v1"/><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/>' },
    scissors: { motion: 'snip', paths: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path class="pd-blade" d="M8.1 7.9 20 20"/><path class="pd-blade" d="M8.1 16.1 20 4"/>' },
    cup: { motion: 'steam', paths: '<path class="pd-steam" d="M8 3v3M12 2v4M16 3v3"/><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h2a2 2 0 0 1 0 4h-2"/>' },
    wheat: { motion: 'sway', paths: '<path d="M12 22V9"/><path d="M12 9c0-2 1.5-4 4-4 0 2.5-1.5 4-4 4z"/><path d="M12 9c0-2-1.5-4-4-4 0 2.5 1.5 4 4 4z"/><path d="M12 15c0-2 1.5-4 4-4 0 2.5-1.5 4-4 4z"/><path d="M12 15c0-2-1.5-4-4-4 0 2.5 1.5 4 4 4z"/>' },
    'chef-hat': { motion: 'bob', paths: '<path d="M6 21h12"/><path d="M7 18h10v-4a4 4 0 0 0 .8-7.8A4 4 0 0 0 12 3a4 4 0 0 0-5.8 3.2A4 4 0 0 0 7 14z"/>' },
    bottle: { motion: 'tilt', paths: '<path d="M10 2h4v3l2 3v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V8l2-3z"/><path d="M8 13h8"/>' },
    thermometer: { motion: 'bob', paths: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/><path d="M12 9v6"/>' },
    laptop: { motion: 'tilt', paths: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>' },
    backpack: { motion: 'sway', paths: '<path d="M5 10a7 7 0 0 1 14 0v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M9 6V4a3 3 0 0 1 6 0v2"/><path d="M8 14h8v4"/>' },
    umbrella: { motion: 'sway', paths: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v7a2 2 0 0 0 4 0"/>' },
    scoop: { motion: 'tilt', paths: '<path d="M3 11h11a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M14 12h7"/><path d="M6 8c1-1.5 3-1.5 4 0"/>' },
    brain: { motion: 'pulse', paths: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 6 3 3 0 0 0 3 5 3 3 0 0 0 5-1z"/><path d="M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 6 3 3 0 0 1-3 5 3 3 0 0 1-5-1z"/><path d="M12 5v13"/>' },
    moon: { motion: 'sway', paths: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
    dumbbell: { motion: 'nudge', paths: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9.5v5"/><path d="M21 9.5v5"/><path d="M6 12h12"/>' },
    bean: { motion: 'settle', paths: '<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(35 12 12)"/><path d="M9 17c1-3 5-7 6-10"/>' },
    bowl: { motion: 'wave', paths: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 21h8"/><path d="M9 7.5c0-1.5 1-2 1-3.5"/><path d="M14 7.5c0-1.5 1-2 1-3.5"/>' },
    pill: { motion: 'tilt', paths: '<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>' },
    sprout: { motion: 'sway', paths: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 10c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>' },
    lotion: { motion: 'bob', paths: '<path d="M9.5 2h5v3h-5z"/><path d="M10.5 5h3v3h-3z"/><rect x="7" y="8" width="10" height="13" rx="2"/><path d="M10 13h4"/>' },
    mirror: { motion: 'glow', paths: '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v5"/><path d="M9 21h6"/><path d="m9.5 7.5 2-2"/>' },
    eye: { motion: 'twinkle', paths: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    headphones: { motion: 'beat', paths: '<path d="M4 18v-6a8 8 0 0 1 16 0v6"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>' },
    camera: { motion: 'pulse', paths: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>' },
    timer: { motion: 'nudge', paths: '<circle cx="12" cy="14" r="8"/><path d="M12 14v-4"/><path d="M10 2h4"/><path d="M12 2v4"/>' },
    glass: { motion: 'wave', paths: '<path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M6.5 9h11"/>' },
    shield: { motion: 'draw', paths: '<path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path class="pd-check" d="m9 12 2 2 4-4"/>' },
    star: { motion: 'twinkle', paths: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3 9.5l6.3-.9z"/>' },
    heart: { motion: 'beat', paths: '<path d="M12 20s-7-4.4-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.6 12 20 12 20z"/>' },
    recycle: { motion: 'spin', paths: '<path d="M7 19H5a2 2 0 0 1-1.7-3l1.6-2.7"/><path d="m9 22 2-3-3-2"/><path d="M17 5.5 15.5 3a2 2 0 0 0-3.4 0L10.5 5.7"/><path d="m8 4 3.5.3L11 7.8"/><path d="M19 19h-7"/><path d="m15 22 3-3-3-3"/>' },
    check: { motion: 'draw', paths: '<circle cx="12" cy="12" r="9"/><path class="pd-check" d="m8.5 12.5 2.5 2.5 4.5-5"/>' },
  };
  function highlightRows(p) {
    return (Array.isArray(p?.highlights) ? p.highlights : [])
      .filter(row => row && highlightIcons[row.icon] && typeof row.label === 'string' && row.label.trim())
      .slice(0, 6);
  }
  const iconSvg = icon => `<svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg>`;
  function highlightsMarkup(p) {
    const rows = highlightRows(p);
    if (!rows.length) return '';
    return `<ul class="product-detail__highlights" data-part="highlights" aria-label="Destacados del producto">${rows.map(row => {
      const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
      return `<li>${iconSvg(highlightIcons[row.icon])}<div><strong>${escape(row.label.trim())}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }
  /** conversion (spec 2026-10-10): three tiles beside the photo when there are three and a photo; every other highlight a check. */
  function conversionHighlights(p) {
    const rows = highlightRows(p);
    return rows.length >= 3 && galleryImages(p).length ? { tiles: rows.slice(0, 3), checks: rows.slice(3) } : { tiles: [], checks: rows };
  }
  function tilesMarkup(rows) {
    return rows.length ? `<ul class="product-detail__tiles" aria-label="Lo esencial">${rows.map(row => `<li>${iconSvg(highlightIcons[row.icon])}<span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
  }
  function checksMarkup(rows) {
    return rows.length ? `<ul class="product-detail__checks" aria-label="Beneficios">${rows.map(row => `<li><svg class="product-detail__check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg><span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
  }
  function specRows(p) {
    return (Array.isArray(p?.specifications) ? p.specifications : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string' && row.label.trim() && row.value.trim());
  }
  function contentBlocksMarkup(p) {
    const blocks = [];
    for (const block of Array.isArray(p?.contentBlocks) ? p.contentBlocks : []) {
      if (!block || typeof block.alt !== 'string' || !block.alt.trim()) continue;
      if (block.type === 'media') {
        const url = safeUrl(block.imageUrl);
        if (!url) continue;
        blocks.push(`<figure class="product-detail__block" data-part="block" data-part-type="media"><img data-part="block-media" src="${escape(url)}" alt="${escape(block.alt)}" loading="lazy">${typeof block.caption === 'string' && block.caption.trim() ? `<figcaption>${escape(block.caption)}</figcaption>` : ''}</figure>`);
      } else if (block.type === 'compare') {
        const before = safeUrl(block.beforeUrl), after = safeUrl(block.afterUrl);
        if (!before || !after || ['title', 'beforeLabel', 'afterLabel'].some(key => typeof block[key] !== 'string' || !block[key].trim())) continue;
        blocks.push(`<div class="product-detail__block" data-part="block" data-part-type="compare" data-part-compare><h3>${escape(block.title)}</h3><div class="product-detail__compare" data-part="block-compare" style="--pd-compare:50%"><img class="pd-compare__before" src="${escape(before)}" alt="${escape(block.alt)}" loading="lazy"><img class="pd-compare__after" src="${escape(after)}" alt="" loading="lazy"><span class="pd-compare__label pd-compare__label--before">${escape(block.beforeLabel)}</span><span class="pd-compare__label pd-compare__label--after">${escape(block.afterLabel)}</span></div><input class="pd-compare__range" type="range" min="0" max="100" value="50" aria-label="Comparar: ${escape(block.beforeLabel)} y ${escape(block.afterLabel)}"></div>`);
      }
      if (blocks.length === 6) break;
    }
    return blocks.length ? `<section class="product-detail__blocks" data-part="blocks" aria-label="Más sobre este producto">${blocks.join('')}</section>` : '';
  }
  /* The long product page (spec 2026-10-09): product data the store draws below the product. Text is escaped, photos
   * go through safeUrl, and the repeated buy button only scrolls to the purchase box, so options are never skipped. */
  const pageBlock = (p, type) => (Array.isArray(p?.contentBlocks) ? p.contentBlocks : []).find(block => block && block.type === type);
  const nonEmpty = value => typeof value === 'string' && value.trim();
  function buyAgainMarkup() {
    const lines = [];
    if (store.shippingEnabled) lines.push('Envío a domicilio');
    if (store.shippingPickupEnabled) lines.push('Retiro en tienda');
    if (nonEmpty(storePolicies().returns)) lines.push('Cambios y devoluciones según la política de la tienda');
    return `<div class="product-long__buy" data-part="buy-again"><button type="button" class="checkout-button" data-buy-again>Comprar ahora</button>${lines.length ? `<p>${lines.map(escape).join(' · ')}</p>` : ''}</div>`;
  }
  function longPageTop(p) {
    const parts = [];
    const features = pageBlock(p, 'features');
    const featureItems = (features?.items || []).filter(item => item && highlightIcons[item.icon] && nonEmpty(item.label));
    if (featureItems.length >= 3) parts.push(`<section class="product-long__features" data-part="features"><h2>${escape(nonEmpty(features.title) || 'Lo que lo hace especial')}</h2><ul>${featureItems.map(item => { const icon = highlightIcons[item.icon]; return `<li data-part="feature"><svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg><strong>${escape(item.label)}</strong>${nonEmpty(item.detail) ? `<span>${escape(item.detail)}</span>` : ''}</li>`; }).join('')}</ul></section>`);
    const story = pageBlock(p, 'story');
    if (story && nonEmpty(story.problem) && nonEmpty(story.tried) && nonEmpty(story.solution)) parts.push(`<section class="product-long__story" data-part="story">${nonEmpty(story.title) ? `<h2>${escape(story.title)}</h2>` : ''}<p data-part="story-problem">${escape(story.problem)}</p><p data-part="story-tried">${escape(story.tried)}</p><p data-part="story-solution">${escape(story.solution)}</p></section>`);
    const details = (pageBlock(p, 'details')?.items || []).map(item => ({ ...item, url: safeUrl(item?.imageUrl) })).filter(item => item.url && nonEmpty(item.title) && nonEmpty(item.alt));
    if (details.length) parts.push(`<section class="product-long__details" data-part="details">${details.map(item => `<figure data-part="detail"><img src="${escape(item.url)}" alt="${escape(item.alt)}" loading="lazy"><figcaption><strong>${escape(item.title)}</strong>${nonEmpty(item.text) ? `<span>${escape(item.text)}</span>` : ''}</figcaption></figure>`).join('')}</section>`);
    if (parts.length) parts.push(buyAgainMarkup());
    const versus = pageBlock(p, 'versus');
    const rows = (versus?.rows || []).filter(row => row && nonEmpty(row.label) && typeof row.ours === 'boolean' && typeof row.theirs === 'boolean');
    if (versus && rows.length >= 2 && nonEmpty(versus.ours) && nonEmpty(versus.theirs)) {
      const mark = yes => `<span class="product-long__mark" data-yes="${yes}" aria-label="${yes ? 'Sí' : 'No'}">${yes ? '✓' : '✕'}</span>`;
      parts.push(`<section class="product-long__versus" data-part="versus">${nonEmpty(versus.title) ? `<h2>${escape(versus.title)}</h2>` : ''}<table><thead><tr><th scope="col"><span class="product-detail__sr">Característica</span></th><th scope="col">${escape(versus.ours)}</th><th scope="col">${escape(versus.theirs)}</th></tr></thead><tbody>${rows.map(row => `<tr><th scope="row">${escape(row.label)}</th><td>${mark(row.ours)}</td><td>${mark(row.theirs)}</td></tr>`).join('')}</tbody></table></section>`);
    }
    return parts.length ? `<div class="product-long" data-part="long-page">${parts.join('')}</div>` : '';
  }
  function longPageBottom(p) {
    const faq = pageBlock(p, 'faq');
    const items = (faq?.items || []).filter(item => item && nonEmpty(item.q) && nonEmpty(item.a));
    const hasTop = !!longPageTop(p);
    if (!hasTop && items.length < 2) return '';
    return `<div class="product-long" data-part="long-page">${hasTop ? buyAgainMarkup() : ''}${items.length >= 2 ? `<section class="product-long__faq" data-part="faq"><h2>${escape(nonEmpty(faq.title) || 'Preguntas frecuentes')}</h2>${items.map(item => `<details data-part="faq-item"><summary>${escape(item.q)}</summary><p>${escape(item.a)}</p></details>`).join('')}</section>` : ''}</div>`;
  }
  // A stored choice wins; older stores read their catalog, and spec-heavy catalogs get the dense page.
  function productPageStyle() {
    if (['editorial', 'dense', 'image-led', 'story-led', 'conversion'].includes(config.productPageStyle)) return config.productPageStyle;
    const items = products();
    return items.length && items.filter(p => specRows(p).length >= 3).length * 2 >= items.length ? 'dense' : 'editorial';
  }
  function specChipsMarkup(p) {
    const chips = specRows(p).filter(row => row.value.trim().length <= 24).slice(0, 4);
    return chips.length ? `<ul class="product-detail__chips" aria-label="Características">${chips.map(row => `<li><span class="product-detail__sr">${escape(row.label.trim())}: </span>${escape(row.value.trim())}</li>`).join('')}</ul>` : '';
  }
  function productInformation(p) {
    const delivery = (store.locations || []).map(l => `<li><strong>${escape(l.name)}</strong>${l.address ? `<br>${escape(l.address)}` : ''}<br>${[l.pickupEnabled && 'Retiro en tienda', l.deliveryEnabled && 'Entrega a domicilio'].filter(Boolean).join(' · ') || 'Sin métodos de entrega disponibles'}</li>`).join('');
    const tags = Array.isArray(p.tags) ? [...new Set(p.tags.filter(tag => typeof tag === 'string' && tag.trim()))] : [];
    const panels = [];
    const specs = specRows(p).slice(0, 8);
    if (tags.length || specs.length) panels.push({ id: 'description', label: 'Detalles', content: `${specs.length ? `<dl class="product-detail__specs">${specs.map(row => `<div><dt>${escape(row.label.trim())}</dt><dd>${escape(row.value.trim())}</dd></div>`).join('')}</dl>` : ''}${tags.length ? `<ul class="product-detail__facts">${tags.map(tag => { const fact = tag.match(/^([^:]{1,40}):\s*(\S.*)$/); return fact ? `<li class="product-detail__fact"><span>${escape(fact[1].trim())}</span><span>${escape(fact[2])}</span></li>` : `<li>${escape(tag)}</li>`; }).join('')}</ul>` : ''}` });
    if (delivery || store.shippingEnabled || store.shippingPickupEnabled) panels.push({ id: 'delivery', label: 'Envíos y retiro', content: `${delivery ? `<ul class="product-delivery-list">${delivery}</ul>` : ''}<p>Elige la opción disponible al revisar tu pedido. El total final se confirma en pagosYa.</p>` });
    if (!panels.length) return '';
    return `<div class="product-tabs" role="tablist" aria-label="Información del producto">${panels.map((panel, index) => `<button type="button" role="tab" id="product-${panel.id}-tab" aria-controls="product-${panel.id}-panel" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-product-tab="${panel.id}">${panel.label}</button>`).join('')}</div>${panels.map((panel, index) => `<div role="tabpanel" id="product-${panel.id}-panel" aria-labelledby="product-${panel.id}-tab" tabindex="0"${index ? ' hidden' : ''}>${panel.content}</div>`).join('')}`;
  }
  function selectProductTab(button) {
    detail.querySelectorAll('[data-product-tab]').forEach(tab => {
      const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      detail.querySelector('#' + tab.getAttribute('aria-controls')).hidden = !active;
    });
  }
  detail.addEventListener("close", () => { document.documentElement.style.overflow = oldOverflow; detailTrigger?.focus(); selectedProduct = null; });
  detail.addEventListener('change', event => {
    if (!selectedProduct || !event.target.matches('[name=purchaseMode],[name=subscriptionCadence]')) return;
    const buy = detail.querySelector('.product-detail__buy[data-add], .product-detail__buy[data-variant-add]'), variant = optionGroups(selectedProduct) ? selectedVariant() : undefined;
    if (buy && (variant || !selectedProduct.variants?.length)) buy.dataset.add = lineKey(selectedProduct.id, variant?.id, selectedCadence());
    updateQuantity();
    renderCart();
  });
  // "Comprar ahora" on the long product page brings the shopper back to the purchase box, so options are never skipped.
  detail.addEventListener("click", event => {
    if (!event.target.closest?.("[data-buy-again]")) return;
    const target = detail.querySelector(".product-detail__options button:not([disabled]), .product-detail__options input, .product-detail__options select, .product-detail__buy:not([hidden])");
    target?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target?.focus({ preventScroll: true });
  });
  detail.addEventListener("click", event => {
    if (fullProductPage || event.target !== detail) return;
    const rect = detail.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) detail.close();
  });
  detail.addEventListener("keydown", event => {
    if (event.target.closest('.pd-compare__range')) return;
    const tab = event.target.closest('[data-product-tab]');
    if (tab) {
      if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const tabs = [...detail.querySelectorAll('[data-product-tab]')];
        const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        selectProductTab(next); next.focus();
      }
      return;
    }
    if (event.target.closest('[data-product-option]')) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); showImage(selectedImage + (event.key === "ArrowRight" ? 1 : -1)); }
  });
  detail.addEventListener('input', event => {
    if (!event.target.matches('.pd-compare__range')) return;
    const compare = event.target.closest('[data-part-compare]')?.querySelector('.product-detail__compare');
    const value = Number(event.target.value);
    if (compare && Number.isFinite(value)) compare.style.setProperty('--pd-compare', Math.max(0, Math.min(100, value)) + '%');
  });
