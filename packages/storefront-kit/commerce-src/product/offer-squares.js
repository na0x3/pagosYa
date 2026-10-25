  /* Offer squares (spec 2026-10-19 showcase commerce §1): 1 unidad, one-product packs and subscription cadences, with the
   * server's own math (bundle-pricing.ts: best single FIXED offer, floor(eligible × % / 100)). Never a figure checkout won't charge. */
  function packOffers(p) {
    if (!p || !store.bundlesEnabled || !Array.isArray(store.bundles) || isMembership(p) || boxGroup(p) || p.fulfillmentType === 'DIGITAL') return [];
    return store.bundles
      .filter(b => b.kind === 'FIXED' && Array.isArray(b.items) && b.items.length === 1 && b.items[0]?.productId === p.id && Number(b.items[0].quantity) >= 2)
      .map(b => ({ id: b.id, quantity: Number(b.items[0].quantity), percent: Math.max(0, Math.min(99, Number(b.discountPercent) || 0)), ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim().slice(0, 24) } : {}) }))
      .sort((a, b) => a.quantity - b.quantity).slice(0, 3);
  }
  function packDiscount(p, unitAmount, quantity) {
    let best = 0;
    for (const offer of packOffers(p)) {
      const cycles = Math.floor(quantity / offer.quantity);
      if (cycles > 0) best = Math.max(best, Math.floor(cycles * offer.quantity * unitAmount * offer.percent / 100));
    }
    return Math.min(best, Math.max(0, unitAmount * quantity - 1));
  }
  /** The cart's pack saving, priced as the server's bestBundleDiscount prices one-product packs: each product's units across
   *  its lines, cheapest first, and the single best pack in the cart. Other offers are confirmed at checkout. */
  function cartPackSaving(lines) {
    const units = new Map();
    for (const line of lines) {
      if (line.cadence || !line.p) continue;
      const entry = units.get(line.p.id) || { p: line.p, prices: [] };
      for (let i = 0; i < line.quantity; i++) entry.prices.push(line.amount);
      units.set(line.p.id, entry);
    }
    let best = 0;
    for (const { p, prices } of units.values()) {
      prices.sort((a, b) => a - b);
      for (const offer of packOffers(p)) {
        const cycles = Math.floor(prices.length / offer.quantity);
        if (cycles > 0) best = Math.max(best, Math.floor(prices.slice(0, cycles * offer.quantity).reduce((sum, amount) => sum + amount, 0) * offer.percent / 100));
      }
    }
    return best;
  }
  function offerOptions(p, variant) {
    if (!p || isMembership(p) || boxGroup(p)) return [];
    const unit = price(variant ? { ...p, amount: variant.amount } : p);
    const left = remaining(p, variant || undefined);
    const packs = packOffers(p).filter(offer => left >= offer.quantity);
    const subs = subscriptionsAvailable() && p.fulfillmentType !== 'DIGITAL' && !p.extras?.length ? (p.subscriptionOptions || []) : [];
    if (!packs.length && !subs.length) return [];
    const rows = [{ key: 'once:1', kind: 'once', quantity: 1, total: unit, regular: unit, perUnit: unit, saving: 0 }];
    for (const offer of packs) {
      const regular = unit * offer.quantity, saving = packDiscount(p, unit, offer.quantity);
      rows.push({ key: `pack:${offer.quantity}`, kind: 'pack', quantity: offer.quantity, total: regular - saving, regular, perUnit: Math.round((regular - saving) / offer.quantity), saving, ...(offer.label ? { label: offer.label } : {}) });
    }
    for (const option of subs) {
      const total = subscriptionPrice(p, variant || undefined, option.cadence);
      rows.push({ key: `sub:${option.cadence}`, kind: 'sub', quantity: 1, cadence: option.cadence, total, regular: unit, perUnit: total, saving: unit - total, ...(typeof option.label === 'string' && option.label.trim() ? { label: option.label.trim().slice(0, 24) } : {}) });
    }
    const cheapest = Math.min(...rows.map(row => row.perUnit));
    const unique = rows.filter(row => row.perUnit === cheapest).length === 1;
    return rows.map(row => ({ ...row, best: row.kind !== 'once' && unique && row.perUnit === cheapest && cheapest < unit }));
  }
  function offerLayout(options) {
    const wanted = ['steps', 'grid', 'rows'].includes(config.showcase?.offers) ? config.showcase.offers : 'grid';
    const kinds = new Set(options.filter(o => o.kind !== 'once').map(o => o.kind));
    if (options.length > (kinds.size > 1 ? 5 : 4)) return 'rows';
    if (kinds.size > 1) return wanted === 'rows' ? 'rows' : 'steps';
    return wanted === 'steps' ? 'grid' : wanted;
  }
  function offerSquareMarkup(p, option, selected) {
    const title = option.kind === 'once' ? '1 unidad' : option.kind === 'pack' ? `Pack x${option.quantity}` : (CADENCE_TEXT[option.cadence] || 'Suscripción').replace(/^./, c => c.toUpperCase());
    // Owner 2026-10-23: a tag that only repeats the title («CADA MES» over «Cada mes») says nothing; the deal line speaks instead.
    const label = option.label && option.label.toLowerCase() !== title.toLowerCase() ? option.label : '';
    const tag = label || (option.best ? 'Mejor precio' : '');
    const line = option.kind === 'pack' ? `${money(option.perUnit, p.currency)} c/u` : option.kind === 'sub' ? 'Te llega sola · cancela cuando quieras' : 'Para probar';
    return `<button type="button" role="radio" class="offer-square" data-offer-square="${escape(option.key)}" aria-checked="${selected}">`
      + (tag ? `<span class="offer-square__tag">${escape(tag)}</span>` : '')
      + `<span class="offer-square__title">${escape(title)}</span><span class="offer-square__total">${money(option.total, p.currency)}</span>`
      + (option.kind === 'pack' && option.saving > 0 ? `<del class="offer-square__regular" aria-label="Precio sin pack">${money(option.regular, p.currency)}</del>` : '')
      + (line ? `<span class="offer-square__line">${escape(line)}</span>` : '')
      + (option.saving > 0 ? `<span class="offer-square__save">Ahorras ${money(option.saving, p.currency)}</span>` : '')
      + '</button>';
  }
  /** The squares of the selected product/variant; '' when there is nothing to choose. */
  function offerSquaresMarkup(p, variant, selectedKey = 'once:1') {
    const options = offerOptions(p, variant);
    if (options.length < 2) return '';
    const layout = offerLayout(options);
    const quantities = options.filter(o => o.kind !== 'sub'), subs = options.filter(o => o.kind === 'sub');
    const group = (rows, label) => `<div class="offer-squares__group" role="radiogroup" aria-label="${escape(label)}">${rows.map(o => offerSquareMarkup(p, o, o.key === selectedKey)).join('')}</div>`;
    const body = layout === 'steps' && subs.length && quantities.length > 1
      ? group(quantities, '¿Cuántos?') + `<p class="offer-squares__label">O suscríbete</p>` + group(subs, 'Suscríbete')
      : group(options, 'Elige tu opción');
    return `<div class="product-detail__offers offer-squares" data-offer-layout="${layout}"><p class="offer-squares__label">${layout === 'rows' ? 'Elige tu opción' : '¿Cuántos?'}</p>${body}</div>`;
  }
  /** One short best-deal line for cards: «Desde Bs X c/u» and/or «Suscríbete −N%». */
  function bestDealLine(p) {
    const options = offerOptions(p, undefined);
    const best = options.filter(o => o.kind === 'pack').sort((a, b) => a.perUnit - b.perUnit)[0];
    const sub = options.some(o => o.kind === 'sub') ? (p.subscriptionOptions || []).reduce((max, o) => Math.max(max, Number(o.discountPercent) || 0), 0) : 0;
    return [best ? `Desde ${money(best.perUnit, p.currency)} c/u` : '', sub ? `Suscríbete −${sub}%` : ''].filter(Boolean).join(' · ');
  }
