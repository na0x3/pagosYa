  const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;
  const productHref = (item) => pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id));
  const bundleEntries = (bundle) => (Array.isArray(bundle?.items) ? bundle.items : []).map(item => ({ p: products().find(candidate => candidate.id === item?.productId), quantity: Math.max(1, Math.min(99, Number(item?.quantity) || 1)) }));
  /* Offers the owner set up in Studio. Only the server cart quote decides which discount applies. */
  function bundleOffersMarkup(p) {
    if (!store.bundlesEnabled || !Array.isArray(store.bundles)) return '';
    const offers = store.bundles.flatMap(bundle => {
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
  /* "Súmale algo más": the owner's cart picks that are not in the cart yet. */
  function cartSuggestionsMarkup() {
    if (store.cartRecommendationsEnabled === false || !cart.size) return '';
    const inCart = new Set(cartItems().map(item => item.id));
    const ids = Array.isArray(store.cartRecommendationProductIds) ? store.cartRecommendationProductIds : [];
    const items = [...new Set(ids)].map(id => products().find(item => item.id === id)).filter(item => item && !inCart.has(item.id) && limit(item) !== 0).slice(0, 3);
    if (!items.length) return '';
    return `<section class="order-recommendations" aria-label="Súmale algo más"><h3>Súmale algo más</h3><ul>${items.map(item => {
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
    return `<section class="product-detail__related" aria-labelledby="product-related-title"><h2 id="product-related-title">Combínalo con${sample ? ' · ejemplo' : ''}</h2>${sample ? '<p class="product-detail__related-note">Elige los productos sugeridos de cada producto en tu panel; mientras tanto esta fila es una muestra de tu catálogo.</p>' : ''}<ul>${items.map(item => {
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
    const jump = bar.querySelector('[data-product-jump]');
    jump.textContent = pending ? 'Elegir opciones' : isMembership(selectedProduct) ? 'Hacerme miembro' : 'Añadir';
    jump.disabled = !pending && (!buy || buy.disabled);
    const show = buyPassed && matchMedia('(max-width: 640px)').matches;
    bar.hidden = !show; detail.querySelector('[data-product-sticky-space]').hidden = !show;
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
