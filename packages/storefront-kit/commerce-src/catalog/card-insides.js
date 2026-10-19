  /* Card insides (spec 2026-10-19 showcase commerce §2): eyebrow, ✓ points, chips, best-deal line and save pill — all from
   * real data; an empty field is absent. The store's design is config.showcase.cards (showcase | compact | split). A store that
   * never chose one keeps today's card plus what is plainly true: a written eyebrow, the save pill and the best-deal line. */
  const showcaseChosen = () => ['showcase', 'compact', 'split'].includes(config.showcase?.cards);
  function cardDesign(count) {
    const wanted = showcaseChosen() ? config.showcase.cards : 'compact';
    return wanted === 'showcase' && count > 8 ? 'compact' : wanted;
  }
  function cardInsides(p) {
    const chosen = showcaseChosen();
    const written = typeof p.cardEyebrow === 'string' ? p.cardEyebrow.trim() : '';
    const category = chosen ? (store.categories || []).find(c => c.id === p.categoryId)?.name || '' : '';
    const eyebrow = (written || category).slice(0, 28);
    const points = chosen ? (Array.isArray(p.highlights) ? p.highlights : []).map(h => typeof h === 'string' ? h : h?.label).filter(text => typeof text === 'string' && text.trim()).slice(0, 3) : [];
    const chips = [];
    if (chosen) for (const group of optionGroups(p) || []) for (const value of group.values) {
      const color = swatchColor(group.name, value);
      chips.push(color ? { text: value, color } : { text: value });
    }
    const sale = !isMembership(p) && price(p) < p.amount ? p.amount - price(p) : 0;
    return { eyebrow, points, chips: chips.slice(0, 4), more: Math.max(0, chips.length - 4), deal: isMembership(p) ? '' : bestDealLine(p), save: sale ? `Ahorras ${money(sale, p.currency)}` : '' };
  }
  /** The product with the largest real saving per unit in this grid (sale, pack or subscription); '' when nothing saves. */
  function bestValueId(items) {
    let best = { id: '', saving: 0 };
    for (const p of items) {
      if (!p || isMembership(p)) continue;
      const perUnit = Math.min(price(p), ...offerOptions(p, undefined).map(o => o.perUnit));
      const saving = p.amount - perUnit;
      if (saving > best.saving) best = { id: p.id, saving };
    }
    return best.id;
  }
  const chipsHtml = parts => parts.chips.map(c => c.color ? `<span data-swatch style="--swatch:${escape(c.color)}" role="img" aria-label="${escape(c.text)}" title="${escape(c.text)}"></span>` : `<span>${escape(c.text)}</span>`).join('') + (parts.more ? `<span>+${parts.more}</span>` : '');
  function cardInsidesMarkup(p) {
    const parts = cardInsides(p), chips = chipsHtml(parts);
    return {
      eyebrow: parts.eyebrow ? `<p class="menu-item__eyebrow">${escape(parts.eyebrow)}</p>` : '',
      points: parts.points.length ? `<ul class="menu-item__points">${parts.points.map(t => `<li>${escape(t)}</li>`).join('')}</ul>` : '',
      chips: chips ? `<p class="menu-item__chips">${chips}</p>` : '',
      deal: parts.deal ? `<p class="menu-item__deal">${escape(parts.deal)}</p>` : '',
      save: parts.save ? `<span class="menu-item__save">${escape(parts.save)}</span>` : '',
    };
  }
  /** After a grid renders: its design, and the one best-value card. */
  function markCardDesign(el) {
    const cards = [...el.querySelectorAll('.menu-item[data-product-id]')];
    el.dataset.cardDesign = cardDesign(cards.length);
    const bestId = showcaseChosen() ? bestValueId(cards.map(card => products().find(p => p.id === card.dataset.productId))) : '';
    for (const card of cards) {
      const best = Boolean(bestId) && card.dataset.productId === bestId;
      card.toggleAttribute('data-card-best', best);
      card.querySelector(':scope > .menu-item__best')?.remove();
      if (best) card.insertAdjacentHTML('afterbegin', '<span class="menu-item__best">Mejor precio</span>');
    }
  }
