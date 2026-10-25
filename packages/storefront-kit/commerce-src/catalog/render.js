  const catalogLayout = () => ['all', 'sections', 'page', 'tabs'].includes(store.catalogLayout) ? store.catalogLayout : 'all';
  const collections = () => Array.isArray(store.collections) ? store.collections : [];
  const HOME_PREVIEW = 4;
  // Collected products keep the owner's order inside each group; whatever is
  // left lands in one final group so nothing becomes unreachable.
  function collectionGroups(selected) {
    const byId = new Map(selected.map((p) => [p.id, p]));
    const groups = collections().map((c) => ({
      name: c.name, slug: c.slug,
      items: (c.productIds || []).map((id) => byId.get(id)).filter(Boolean),
    })).filter((group) => group.items.length);
    const grouped = new Set(groups.flatMap((group) => group.items.map((p) => p.id)));
    const rest = selected.filter((p) => !grouped.has(p.id));
    return rest.length ? [...groups, { name: 'Más productos', slug: '', items: rest }] : groups;
  }
  const productsHref = () => pageHref('productos.html');
  const collectionHref = (slug) => pageHref('coleccion.html', '?c=' + encodeURIComponent(slug));
  // Under `page` the link goes to the standalone products page, as it always has. Under `tabs`
  // the catalog already reads as organized by collection, so "Ver todos los productos" instead
  // goes to the first collection's own page — the products page it would otherwise point to
  // isn't reachable from anywhere else in that layout. Falls back to the products page if the
  // store has no collections yet (tabs itself doesn't render without at least one).
  const catalogMore = (layout) => {
    const firstCollection = collections()[0];
    const href = layout === 'tabs' && firstCollection ? collectionHref(firstCollection.slug) : productsHref();
    return `<a class="catalog-more" data-catalog-more href="${escape(href)}">Ver todos los productos</a>`;
  };
  // Shared by the home `tabs` layout (no current tab) and the collection page (marks its own tab).
  const catalogTabs = (currentSlug) => `<nav class="catalog-tabs" aria-label="Colecciones">${collections().map((c) => `<a href="${escape(collectionHref(c.slug))}"${c.slug === currentSlug ? ' aria-current="page"' : ''}>${escape(c.name)}</a>`).join("")}</nav>`;
  /* Named parts for YAPI's guarded CSS on the kit's own surfaces (spec 2026-10-14; profiles in the API's product-theme-css.ts).
   * Protected controls (prices, add-to-cart, totals) never get a part. An element that already names a part keeps it. */
  function markKitParts() {
    const mark = (selector, part) => document.querySelectorAll(selector).forEach(el => { if (!el.hasAttribute('data-part')) el.setAttribute('data-part', part); });
    mark('[data-pagosya-catalog] .menu-item', 'card');
    mark('[data-pagosya-catalog] .menu-item .menu-item__image', 'card-media');
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__name,.menu-item__copy h3)', 'card-name');
    // A custom card's price can sit in .menu-item__copy p: it is protected, never card-meta.
    mark('[data-pagosya-catalog] .menu-item :is(.menu-item__description,.menu-item__options,.menu-item__copy p):not([data-product-field=price],.menu-item__price)', 'card-meta');
    mark('[data-pagosya-catalog] .menu-item .menu-item__badge', 'card-badge');
    mark('.commerce-page-title', 'page-title');
    mark('[data-pagosya-catalog] .catalog-tabs', 'tabs');
    mark('[data-pagosya-catalog] .catalog-group__title', 'group-title');
    mark('[data-pagosya-catalog][data-catalog-full]', 'grid');
    mark('[data-pagosya-catalog] .catalog-empty', 'empty');
  }
  function render() {
    delete document.documentElement.dataset.productTemplateInvalid;
    // The catalog can change the fallback style, so this follows every render.
    if (hasDna) document.documentElement.setAttribute('data-dna-product', productPageStyle());
    // A wordmark styled as <span data-store-name>Tostadero</span> <strong>Yungas</strong> already shows the whole
    // name; writing it into the span again read "Tostadero Yungas Yungas". Stale and empty slots are still filled.
    const storeName = store.storeName || "Tu tienda", squash = (text) => (text || "").replace(/\s+/g, " ").trim().toLowerCase();
    document.querySelectorAll("[data-store-name]").forEach((el) => {
      const own = squash(el.textContent), around = squash(el.parentElement?.textContent);
      if (own && own !== squash(storeName) && squash(storeName).includes(own) && around.includes(squash(storeName))) return;
      el.textContent = storeName;
    });
    document.querySelectorAll("[data-pagosya-categories]").forEach((el) => {
      el.hidden = !(store.categories || []).length;
      el.innerHTML = [{ id: "all", name: "Todo" }, ...(store.categories || [])].map((c) => `<button type="button" data-category="${escape(c.id)}" aria-pressed="${category === c.id}">${escape(c.name)}</button>`).join("");
    });
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      // Inventory is live. An empty-at-generation catalog must not stay permanently hidden.
      el.hidden = false;
      // Chosen set (showcase commerce §3): only the named products in the merchant's order, a category, or a collection.
      // A deleted product is skipped; a set left empty hides itself.
      // An entry is a product id, or its name (atelier rebuild 2026-10-25: YAPI wrote names joined by «|» and every set
      // came out empty); names match without case or accents.
      const named = (el.getAttribute('data-products') || '').split(/[,|]/).map(id => id.trim()).filter(Boolean);
      const byCategory = el.getAttribute('data-category'), byCollection = el.getAttribute('data-collection'), byColor = el.getAttribute('data-color');
      if (named.length || byCategory || byCollection || byColor) {
        const chosen = named.length ? named.map(ref => products().find(item => item.id === ref) || products().find(item => filterFold(item.name) === filterFold(ref))).filter(Boolean)
          : byCategory ? products().filter(item => item.categoryId === byCategory)
          : byCollection ? products().filter(item => (collections().find(c => c.slug === byCollection)?.productIds || []).includes(item.id))
          : products();
        // John Smedley sections (spec 2026-10-21): an `explore` rail can also show one colour, accents and case ignored.
        const set = byColor ? chosen.filter(item => (optionGroups(item) || []).some(g => /^(color|colour|tono|tinte|acabado|finish)$/i.test(g.name) && g.values.some(v => filterFold(v) === filterFold(byColor)))) : chosen;
        el.hidden = !set.length;
        el.innerHTML = set.map(productCard).join('');
        structureCatalog(el);
        markCardDesign(el);
        return;
      }
      const priorities = (el.getAttribute('data-design-product-ids') || '').split(',').filter(Boolean);
      const priority = new Map(priorities.map((id, index) => [id, index]));
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      if (priorities.length) selected.sort((a, b) => (priority.get(a.id) ?? priorities.length) - (priority.get(b.id) ?? priorities.length));
      const layout = el.hasAttribute('data-catalog-full') ? 'all' : catalogLayout();
      el.dataset.catalogLayout = layout;
      if (collectionPage) {
        // An unknown or missing collection shows every product rather than an error.
        const current = currentCollection();
        const items = current ? selected.filter((p) => (current.productIds || []).includes(p.id)) : selected;
        const tabs = collections().length ? catalogTabs(current?.slug) : '';
        // A page with its own title slot (Esencial's coleccion page) shows the name there, not as a second heading (2026-10-21).
        const titleSlot = document.querySelector('[data-collection-title]');
        if (titleSlot && current) titleSlot.textContent = current.name;
        const heading = current && !titleSlot ? `<h2 class="catalog-group__title">${escape(current.name)}</h2>` : '';
        // The shopper is on a specific collection's page here, not a category filter — "en esta
        // categoría" would describe a page that doesn't exist in this layout.
        el.innerHTML = tabs + (items.length ? heading + items.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta colección.</p>');
      } else if (layout === 'sections' && collections().length) {
        const groups = collectionGroups(selected);
        el.innerHTML = groups.length
          ? groups.map((group) => `<section class="catalog-group"><h3 class="catalog-group__title">${escape(group.name)}</h3><div class="catalog-group__items">${group.items.map(productCard).join("")}</div></section>`).join("")
          : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      } else if (layout === 'page' || layout === 'tabs') {
        const tabs = layout === 'tabs' && collections().length ? catalogTabs() : '';
        el.innerHTML = tabs + selected.slice(0, HOME_PREVIEW).map(productCard).join("") + catalogMore(layout);
      } else if ((el.hasAttribute('data-pagosya-filters') || el.hasAttribute('data-catalog-full')) && selected.length >= 6) {
        // Showcase commerce §4: the full catalog of a store with 6+ products can be sorted and filtered.
        const state = readFilterState(), shown = sortItems(applyFilters(selected, state), state.orden);
        // Typing in the search re-renders the grid: the field keeps the focus and the caret (amendment 2026-10-21).
        const typing = document.activeElement?.matches?.('.catalog-search input') && el.contains(document.activeElement) ? document.activeElement.selectionStart : null;
        const filtered = Boolean(state.precio || state.toggles.size || Object.values(state.sets).some(values => values.length));
        const empty = state.q
          ? `<p class="catalog-empty">Sin resultados para “${escape(state.q)}”. <button type="button" data-search-clear>Borrar búsqueda</button>${filtered ? ' <button type="button" data-filters-clear="filters">Borrar filtros</button>' : ''}</p>`
          : '<p class="catalog-empty">No hay productos con estos filtros. <button type="button" data-filters-clear="filters">Borrar filtros</button></p>';
        el.innerHTML = filtersMarkup(selected, state, shown.length) + (shown.length ? shown.map(productCard).join('') : empty);
        const field = typing === null ? null : el.querySelector('.catalog-search input');
        if (field) { field.focus({ preventScroll: true }); try { field.setSelectionRange(typing, typing); } catch { /* search inputs without selection support */ } }
      } else {
        // Also covers `sections` with no collections yet: a single "Más productos" group holding
        // the whole catalog isn't an arrangement, so it falls back to the same flat grid as `all`.
        // A full catalogue too small for the filters still honours a link's category or colour (final review 2026-10-21).
        const shown = el.hasAttribute('data-catalog-full') ? applyFilters(selected, readFilterState()) : selected;
        el.innerHTML = shown.length ? shown.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      }
      structureCatalog(el);
      markCardDesign(el);
      if (MOTIFS.length) { placeCardMotifs(el); placeButtonMotifs(el); }
    });
    renderSpotlights();
    observeCards();
    markKitParts();
    fitCards();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitCards);
    if (hasDna && typeof requestAnimationFrame === 'function') requestAnimationFrame(placeQuickLooks);
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
    if (fullCatalogPage && !preview) {
      const current = collectionPage ? currentCollection() : null;
      const canonical = `${(config.publicSiteUrl || `${config.checkoutOrigin}/s/${encodeURIComponent(config.slug)}`).replace(/\/$/, '')}${current ? `/c/${encodeURIComponent(current.slug)}` : '/productos'}`;
      document.title = `${current ? current.name : 'Productos'} · ${store.storeName || config.slug}`;
      const description = current
        ? `Productos de ${current.name} en ${store.storeName || config.slug}.`
        : `Todos los productos de ${store.storeName || config.slug}.`;
      for (const [selector, attribute, value] of [
        ['link[rel="canonical"]', 'href', canonical], ['meta[property="og:url"]', 'content', canonical],
        ['meta[property="og:title"]', 'content', document.title], ['meta[name="description"]', 'content', description],
        ['meta[property="og:description"]', 'content', description],
      ]) document.querySelector(selector)?.setAttribute(attribute, value);
    }
    // The Studio opens product.html without an id (Boceto's Producto tab, the page picker); a
    // store with a catalog previews its first product. A shopper's broken link keeps the error.
    if (fullProductPage) openProduct(new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('id') ?? (preview ? products()[0]?.id : null));
    else if (selectedProduct && detail.open) {
      if (products().some(p => p.id === selectedProduct.id)) openProduct(selectedProduct.id, detailTrigger);
      else detail.close();
    }
    if (fullCheckoutPage) showCheckout(location.hash === '#pago-de-prueba' && (preview || config.demo) ? 'payment' : location.hash === '#pedido-de-prueba' && (preview || config.demo) ? 'done' : 'review');
    renderCart();
    renderContact();
    // Validate every authored template as soon as the store is ready, not only when its surface
    // happens to render: added/review/product-page templates otherwise stay unvalidated until a
    // shopper adds to cart, opens checkout or opens a product, which is too late for Studio's
    // publishing check to catch a broken one. This is validation only — each reader just sets or
    // clears its flag and discards the clone; their lazy use at the real render site is unchanged.
    cartLineTemplate(); cartTemplate(); addedTemplate(); reviewTemplate(); productPageTemplate(); checkoutTemplate();
    document.dispatchEvent(new CustomEvent("pagosya:ready", { detail: { store, preview, demo: Boolean(config.demo) } }));
  }
  /* Product spotlight (showcase commerce §3): a live buy card beside the merchant's text or video. A product that no longer
   * exists hides the block. Videos stay muted, inline and looping, and load only near the screen. */
  function renderSpotlights() {
    document.querySelectorAll('[data-pagosya-spotlight]').forEach(el => {
      const p = products().find(item => item.id === el.getAttribute('data-pagosya-spotlight'));
      el.hidden = !p;
      el.querySelector(':scope > .spotlight')?.remove();
      if (!p) return;
      const inside = cardInsidesMarkup(p), image = galleryImages(p)[0], complex = p.variants?.length || p.extras?.length;
      const add = isMembership(p) || complex ? `<button type="button" class="menu-add spotlight__add" data-product="${escape(p.id)}">Elegir opciones</button>`
        : `<button type="button" class="menu-add spotlight__add" data-add="${escape(p.id)}" data-quantity="1"${!ready || limit(p) === 0 ? ' disabled' : ''}>Agregar</button>`;
      const card = `<div class="spotlight" data-pagosya-product>${image ? `<img class="spotlight__image" src="${escape(image)}" alt="${escape(p.name)}" loading="lazy" decoding="async">` : ''}${inside.eyebrow}<h3 class="spotlight__name">${escape(p.name)}</h3><p class="spotlight__price">${isMembership(p) ? escape(membershipPriceText(p)) : money(price(p), p.currency)}${inside.save}</p>${inside.points}${complex ? '' : offerSquaresMarkup(p, undefined)}${add}</div>`;
      el.insertAdjacentHTML(el.getAttribute('data-side') === 'right' ? 'beforeend' : 'afterbegin', card);
      el.querySelectorAll('video[data-spotlight-video]').forEach(video => {
        video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('preload', 'none');
        if (video.dataset.spotlightWatched || typeof IntersectionObserver !== 'function') return;
        video.dataset.spotlightWatched = '';
        new IntersectionObserver(([entry]) => {
          if (entry.isIntersecting) { video.preload = 'auto'; video.play?.()?.catch?.(() => {}); } else video.pause?.();
        }, { rootMargin: '200px' }).observe(video);
        video.addEventListener('click', () => { video.muted = !video.muted; });
      });
    });
  }
