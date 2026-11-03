  // Premium landing (spec 2026-11-03): one card per colour that has its own photo, from the product's variants; a tap picks that colour
  // in the buy box and scrolls there. Fewer than two photographed colours: the section and «Ver colores» hide.
  (function variantCards() {
    let styled = false;
    const ensureStyle = () => {
      if (styled) return;
      styled = true;
      const style = document.createElement('style');
      style.setAttribute('data-pagosya-colour-cards', '');
      style.textContent = `.pya-colour-cards{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
      .pya-colour-card{all:unset;box-sizing:border-box;cursor:pointer;scroll-snap-align:start;display:grid;gap:6px;min-width:0}
      .pya-colour-card img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:22px;transition:transform .3s}
      @media (hover:hover){.pya-colour-card:hover img{transform:scale(1.02)}}
      @media (prefers-reduced-motion:reduce){.pya-colour-card img{transition:none}}
      .pya-colour-card:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:22px}
      .pya-colour-card strong{font-size:15px}.pya-colour-card span{font-size:13px;opacity:.75}
      [data-lb="variant-cards"][hidden],[data-needs-colour-cards][hidden]{display:none!important}`;
      document.head.append(style);
    };
    const cardsFor = (product) => {
      const groups = optionGroups(product) || [], colourAt = colourGroupIndex(groups);
      if (colourAt < 0) return [];
      const seen = new Set(), cards = [];
      groups[colourAt].values.forEach((value, valueAt) => {
        const variant = (product.variants || []).find(v => (v.options || [])[colourAt]?.value === value && variantPhotos(v)[0]);
        const photo = variant && variantPhotos(variant)[0];
        if (!photo || seen.has(photo)) return;
        seen.add(photo);
        const amount = price({ ...product, amount: variant.amount });
        cards.push(`<button type="button" class="pya-colour-card" data-colour-group="${colourAt}" data-colour-value="${valueAt}"><img src="${escape(photo)}" alt="" loading="lazy"><strong>${escape(value)}</strong>${amount > 0 ? `<span>desde ${escape(money(amount, product.currency))}</span>` : ''}</button>`);
      });
      return cards;
    };
    const pick = (card) => {
      const option = document.querySelector(`[data-pagosya-product-page] [data-product-option="${card.dataset.colourGroup}"][data-option-value="${card.dataset.colourValue}"]`);
      if (option && option.getAttribute('aria-pressed') !== 'true') option.click();
      const target = option?.closest('[data-pagosya-product-page]')?.closest('section') || document.getElementById('comprar');
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    };
    // Returns true once every host on the page is drawn (or hidden).
    const draw = () => {
      let pending = false;
      document.querySelectorAll('[data-pagosya-variant-cards][data-product-id]').forEach(host => {
        if (host.dataset.drawn) return;
        const product = products().find(item => String(item.id) === host.getAttribute('data-product-id'));
        if (!product) { pending = true; return; }
        host.dataset.drawn = '1';
        ensureStyle();
        const cards = cardsFor(product), section = host.closest('section') || host;
        if (cards.length < 2) { section.hidden = true; document.querySelectorAll('[data-needs-colour-cards]').forEach(el => { el.hidden = true; }); return; }
        host.innerHTML = `<div class="pya-colour-cards">${cards.join('')}</div>`;
        host.addEventListener('click', event => { const card = event.target.closest('.pya-colour-card'); if (card) pick(card); });
      });
      return !pending;
    };
    // The host may be drawn after the kit starts (the Studio preview renders with React): wait a little while for one. A host whose
    // product is not in the catalogue yet waits for the catalogue (it loads after the kit starts on a live store).
    const hosts = () => document.querySelector('[data-pagosya-variant-cards]');
    if (draw() && hosts()) return;
    const watch = new MutationObserver(() => { if (draw() && hosts()) watch.disconnect(); });
    watch.observe(document.body || document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { if (!hosts()) watch.disconnect(); }, 15000);
  })();
