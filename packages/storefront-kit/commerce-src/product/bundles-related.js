  const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;
  const productHref = (item) => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  const bundleEntries = (bundle) => (Array.isArray(bundle?.items) ? bundle.items : []).map(item => ({ p: products().find(candidate => candidate.id === item?.productId), quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)) }));
  /* Offers the owner set up in Studio. Only the server cart quote decides which discount applies. */
  function bundleOffersMarkup(p) {
    if (!store.bundlesEnabled || !Array.isArray(store.bundles)) return '';
    const offers = store.bundles.flatMap(bundle => {
      // Showcase commerce: a one-product pack shown as an offer square is not repeated here.
      if (packOffers(p).some(offer => offer.id === bundle.id)) return [];
      const entries = bundleEntries(bundle);
      if (!entries.some(entry => entry.p?.id === p.id) || entries.some(entry => !entry.p)) return [];
      const names = entries.map(entry => entry.p.name), list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
      const percent = Math.max(0, Math.min(100, Number(bundle.discountPercent) || 0));
      const copy = bundle.kind === 'BOGO' ? `Lleva 2 entre ${list}: el de menor precio es gratis.`
        : bundle.kind === 'MIX_MATCH' ? `Combina ${Math.max(2, Number(bundle.minimumQuantity) || 2)} o más entre ${list} · ahorra ${percent}%`
        : `${entries.map(entry => `${entry.quantity > 1 ? `${entry.quantity} × ` : ''}${entry.p.name}`).join(' + ')} · ahorra ${percent}%`;
      const addable = bundle.kind === 'FIXED' && entries.every(entry => simpleProduct(entry.p) && remaining(entry.p) >= entry.quantity);
      const links = entries.filter(entry => entry.p.id !== p.id).map(entry => `<a href="${escape(productHref(entry.p))}">${escape(entry.p.name)}</a>`).join('');
      return [`<article><h3>${escape(bundle.name)}</h3><p>${escape(copy)}</p>${links ? `<p class="product-detail__bundle-links">${links}</p>` : ''}${addable ? `<button type="button" class="product-detail__bundle-add" data-bundle-add="${escape(bundle.id)}" aria-label="Añadir paquete ${escape(bundle.name)}">Añadir paquete</button>` : ''}</article>`];
    });
    return offers.length ? `<section class="product-detail__bundles" aria-labelledby="product-bundles-title"><h2 id="product-bundles-title">Llévalo en paquete</h2>${offers.join('')}</section>` : '';
  }
  /* Owner 2026-11-13 (Clyro «Complete your routine»): a product page template with a «pairs» slot shows two more of the store's own
   * products beside the buy box — the merchant's picks for this product first, then its category, then the rest — each added with one
   * tap when it is simple, else a link to choose its options. */
  function pairsMarkup(p) {
    if (!productTemplateHas('pairs')) return '';
    const picks = Array.isArray(p.recommendedProductIds) ? p.recommendedProductIds : [];
    const rank = item => picks.includes(item.id) ? 0 : item.categoryId && item.categoryId === p.categoryId ? 1 : 2;
    const items = products().map((item, index) => ({ item, index })).filter(({ item }) => item.id !== p.id && limit(item) !== 0 && !isMembership(item))
      .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).slice(0, 2).map(entry => entry.item);
    if (!items.length) return '';
    return `<section class="product-detail__pairs" data-part="pairs" aria-labelledby="product-pairs-title"><h2 id="product-pairs-title">Completa tu compra</h2><ul>${items.map(item => {
      const image = galleryImages(item)[0], href = escape(productHref(item));
      const amounts = item.variants?.length ? item.variants.map(v => price({ ...item, amount: v.amount })) : [price(item)];
      const low = Math.min(...amounts), from = new Set(amounts).size > 1;
      return `<li data-part="pair">${image ? `<a class="product-detail__pair-photo" data-part="pair-photo" href="${href}" tabindex="-1" aria-hidden="true"><img src="${escape(image)}" alt="" loading="lazy" /></a>` : ''}`
        + `<span class="product-detail__pair-copy" data-part="pair-copy"><a href="${href}">${escape(item.name)}</a><span>${from ? 'desde ' : ''}${escape(money(low, item.currency))}</span></span>`
        + (simpleProduct(item) ? `<button type="button" class="product-detail__pair-add" data-part="pair-add" data-add="${escape(lineKey(item.id))}" aria-label="Agregar ${escape(item.name)} al pedido">Agregar</button>` : `<a class="product-detail__pair-add" data-part="pair-add" href="${href}">Elegir</a>`)
        + '</li>';
    }).join('')}</ul></section>`;
  }
  /* Owner 2026-11-13 (Clyro's logo row): under the buy button, how the store takes payment — the methods pagosYa processes, only for
   * a store that takes payment online, and only in a template with a «payments» slot. */
  function paymentsMarkup() {
    if (!productTemplateHas('payments') || (config.data?.checkoutMode || 'payment') !== 'payment') return '';
    return `<div class="product-detail__payments" data-part="payments"><p>Paga con QR, tarjeta, Tigo Money o transferencia</p><div class="product-detail__payment-logos" data-part="payment-logos" aria-hidden="true">${['qr', 'visa', 'mastercard', 'amex', 'tigo', 'bank'].map(name => PAYMENT_LOGOS.logos?.[name] || '').join('')}</div></div>`;
  }
  /* "Súmale algo más": the owner's cart picks that are not in the cart yet. */
  /* Spec 2026-11-09 Merman cart: the merchant's chosen products first; with none chosen, «Te puede gustar» picks — the cart's categories
   * first, then the best-seller, then the catalogue — never one already in the cart. Up to 6 (the checkout's «Completa tu compra» takes the first). */
  function cartSuggestionItems() {
    if (store.cartRecommendationsEnabled === false || !cart.size) return [];
    const inCart = new Set(cartItems().map(item => item.id));
    const ids = Array.isArray(store.cartRecommendationProductIds) ? store.cartRecommendationProductIds : [];
    const chosen = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(Boolean);
    const categories = new Set([...inCart].map(id => products().find(item => item.id === id)?.categoryId).filter(Boolean));
    const rank = item => categories.has(item.categoryId) ? 0 : item.id === store.topSellerId ? 1 : 2;
    const picked = chosen.length ? chosen : products().map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item);
    // A membership joins through its own page (final review 2026-11-09: its «Añadir» did nothing here).
    return picked.filter(item => item && !inCart.has(item.id) && !isMembership(item) && limit(item) !== 0).slice(0, 6);
  }
  function cartSuggestionsMarkup() {
    const items = cartSuggestionItems();
    if (!items.length) return '';
    return `<section class="order-recommendations" data-part="cart-suggestions" aria-label="Te puede gustar"><h3>Te puede gustar</h3><ul>${items.map(item => {
      const image = galleryImages(item)[0];
      return `<li>${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : ''}<span><strong>${escape(item.name)}</strong><span>${money(price(item), item.currency)}</span></span>${simpleProduct(item) ? `<button type="button" data-add="${escape(lineKey(item.id))}" aria-label="Añadir ${escape(item.name)}">Añadir</button>` : `<a href="${escape(productHref(item))}" aria-label="Elegir opciones de ${escape(item.name)}">Elegir</a>`}</li>`;
    }).join('')}</ul></section>`;
  }
  function relatedMarkup(p) {
    const ids = Array.isArray(p.recommendedProductIds) ? p.recommendedProductIds : [];
    let items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(item => item && item.id !== p.id && limit(item) !== 0).slice(0, 4);
    /* Studio preview: sample the catalog so the merchant sees the row; the published page only shows
     * the recommendations they actually configured. */
    const sample = preview && !items.length;
    if (sample) items = products().filter(item => item.id !== p.id && limit(item) !== 0).slice(0, 4);
    if (!items.length) return '';
    return `<section class="product-detail__related" aria-labelledby="product-related-title"><h2 id="product-related-title">${productPageStyle() === 'fashion' ? 'También te puede gustar' : 'Combínalo con'}${sample ? ' · ejemplo' : ''}</h2>${sample ? '<p class="product-detail__related-note">Elige los productos sugeridos de cada producto en tu panel; mientras tanto esta fila es una muestra de tu catálogo.</p>' : ''}<ul>${items.map(item => {
      const image = galleryImages(item)[0];
      const amounts = item.variants?.length ? item.variants.map(v => price({ ...item, amount: v.amount })) : [price(item)];
      const low = Math.min(...amounts);
      return `<li><a href="${escape(pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id)))}">${image ? `<img src="${escape(image)}" alt="" loading="lazy" />` : ''}<span class="product-detail__related-name">${escape(item.name)}</span><span class="product-detail__related-price">${amounts.some(amount => amount !== low) ? 'Desde ' : ''}${money(low, item.currency)}</span></a></li>`;
    }).join('')}</ul></section>`;
  }
  function updateStickyBar() {
    const bar = detail.querySelector('[data-product-sticky]');
    if (!bar || !selectedProduct) return;
    const groups = optionGroups(selectedProduct), variant = selectedVariant(), buy = detail.querySelector('.product-detail__buy');
    const box = boxGroup(selectedProduct), pending = groups && !variant || box && selectedPicks.length !== box.count;
    bar.querySelector('[data-product-sticky-price]').textContent = detail.querySelector('.product-detail__price')?.textContent || '';
    // Lively stores (spec 2026-11-03): the bar shows the photo and what is chosen, on every width.
    const photo = bar.querySelector('[data-product-sticky-photo]'), shown = detail.querySelector('.product-detail__photo img, .product-detail__gallery img');
    if (photo) { photo.hidden = !shown; if (shown) photo.src = shown.currentSrc || shown.src; }
    const choice = bar.querySelector('[data-product-sticky-choice]');
    if (choice) choice.textContent = [...detail.querySelectorAll('[data-product-selection]')].map(el => el.textContent.trim()).filter(Boolean).join(' · ');
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : isMembership(selectedProduct) ? 'Hacerme miembro' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const phone = matchMedia('(max-width: 640px)').matches, lively = document.documentElement.hasAttribute('data-pya-lively');
    // Owner 2026-11-13 (product page «duo»): a template with a «sticky» slot gets the lively stores' floating bar on every width.
    const sticky = productTemplateHas('sticky') || config.selling?.stickyBuy === true; // «La tienda que vende sola» switch (spec 2026-11-16)
    document.documentElement.toggleAttribute('data-pya-sticky-buy', sticky);
    const show = buyPassed && !footerSeen && (lively || phone || sticky);
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show || !phone;
  }
  let highlightObserver = null;
  // Looping icons rest while nobody is looking at them.
  function watchHighlights() {
    highlightObserver?.disconnect();
    const row = detail.querySelector('.product-detail__highlights,.product-detail__tiles');
    delete detail.dataset.highlightsPaused;
    if (!row || typeof IntersectionObserver !== 'function') return;
    highlightObserver = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      if (entry.isIntersecting) delete detail.dataset.highlightsPaused; else detail.dataset.highlightsPaused = '';
    });
    highlightObserver.observe(row);
  }
  function watchStickyBar() {
    stickyObserver?.disconnect(); buyPassed = false;
    const buy = fullProductPage && detail.querySelector('.product-detail__buy');
    if (!buy || typeof IntersectionObserver !== 'function') return;
    stickyObserver = new IntersectionObserver(entries => { const entry = entries[entries.length - 1]; buyPassed = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0; updateStickyBar(); });
    stickyObserver.observe(buy);
    // Lively stores: the bar steps aside once the footer is on screen.
    footerObserver?.disconnect(); footerSeen = false;
    // The page's own footer (Esencial's, else the last one outside a fixed card or panel), never a footer inside an overlay.
    const footer = document.querySelector('.es-footer') || [...document.querySelectorAll('footer')].reverse().find(el => {
      for (let box = el; box; box = box.parentElement) if (getComputedStyle(box).position === 'fixed') return false;
      return true;
    });
    if (footer) { footerObserver = new IntersectionObserver(entries => { footerSeen = entries[entries.length - 1].isIntersecting; updateStickyBar(); }); footerObserver.observe(footer); }
  }
  function optionPrices(groups) {
    const p = selectedProduct;
    return groups.map((group, index) => {
      const prices = group.values.map(value => {
        const matches = p.variants.filter(v => variantValues(v).every((candidate, i) => i === index ? candidate === value : selectedOptions[i] === undefined || candidate === selectedOptions[i]));
        const amounts = (matches.some(v => remaining(p, v) > 0) ? matches.filter(v => remaining(p, v) > 0) : matches).map(v => price({ ...p, amount: v.amount }));
        return amounts.length ? { low: Math.min(...amounts), high: Math.max(...amounts) } : null;
      });
      // Only label choices when this group actually changes what the shopper pays.
      const distinct = new Set(prices.filter(Boolean).map(range => range.low + ':' + range.high));
      // Ranges ("desde") on every choice read as noise; label a group once each choice has one exact price.
      return distinct.size > 1 && prices.every(range => !range || range.low === range.high) ? prices.map(range => range ? range.low : null) : null;
    });
  }
