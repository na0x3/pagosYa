  /* Memberships (spec 2026-10-09): chosen by period and joined on the trusted checkout origin, never added to the cart. */
  const MEMBERSHIP_LABEL = { 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' };
  const MEMBERSHIP_SUFFIX = { 1: '/ mes', 3: '/ 3 meses', 6: '/ 6 meses', 12: '/ año' };
  const isMembership = p => p?.fulfillmentType === 'MEMBERSHIP' && Array.isArray(p.membershipPeriods) && p.membershipPeriods.length > 0;
  const cheapestPeriod = p => p.membershipPeriods.reduce((best, period) => (period.amount < best.amount ? period : best));
  const membershipJoinUrl = (p, periodId) => { try { return new URL(`/cuenta/${encodeURIComponent(config.slug)}/unirme?producto=${encodeURIComponent(p.id)}&periodo=${encodeURIComponent(periodId)}`, config.checkoutOrigin).href; } catch { return ''; } };
  const membershipPriceText = p => { const period = cheapestPeriod(p); return `Desde ${money(period.amount, p.currency)} ${MEMBERSHIP_SUFFIX[period.months] || ''}`.trim(); };
  function membershipMarkup(p) {
    const first = p.membershipPeriods[0];
    const join = membershipJoinUrl(p, first.id);
    return `<fieldset class="product-detail__membership" data-membership-choice><legend>Elige tu período</legend>${p.membershipPeriods.map((period, index) => `<label><input type="radio" name="membershipPeriod" value="${escape(period.id)}"${index ? '' : ' checked'}><span>${escape(MEMBERSHIP_LABEL[period.months] || `Cada ${period.months} meses`)}</span><strong>${money(period.amount, p.currency)}</strong></label>`).join('')}</fieldset>`
      + (preview || config.demo || !join ? '<button class="product-detail__buy checkout-button" disabled>Hacerme miembro</button>' : `<a class="product-detail__buy checkout-button" data-membership-join href="${escape(join)}">Hacerme miembro</a>`)
      + '<p class="product-detail__membership-note">Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente.</p>';
  }
  const CADENCE_TEXT = { WEEKLY: 'cada semana', BIWEEKLY: 'cada dos semanas', MONTHLY: 'cada mes' };
  const CADENCE_CONFLICT = 'Por ahora solo puedes suscribirte a una frecuencia por pedido. Separa las frecuencias en pedidos distintos.';
  const offerFor = (p, cadence) => subscriptionsAvailable() && p?.fulfillmentType !== 'DIGITAL' ? (p?.subscriptionOptions || []).find(o => o.cadence === cadence) : undefined;
  /* Same rule as the API: min(one-time price, base - discount). */
  const subscriptionPrice = (p, variant, cadence) => {
    const offer = offerFor(p, cadence), base = variant ? variant.amount : p.amount, oneTime = price(variant ? { ...p, amount: variant.amount } : p);
    return offer ? Math.min(oneTime, Math.round(base * (100 - offer.discountPercent) / 100)) : oneTime;
  };
  /* What the subscriber keeps paying: the discounted base, ignoring any scheduled one-time sale. */
  const subscriptionRecurringPrice = (p, variant, cadence) => {
    const offer = offerFor(p, cadence), base = variant ? variant.amount : p.amount;
    return offer ? Math.round(base * (100 - offer.discountPercent) / 100) : subscriptionPrice(p, variant, cadence);
  };
  /* "Bs 30 hoy, luego Bs 45 / cada mes" when a sale makes the first order cheaper than the locked price; else "Bs 45 cada mes". */
  const subscriptionPriceNote = (p, variant, cadence) => {
    const today = subscriptionPrice(p, variant, cadence), later = subscriptionRecurringPrice(p, variant, cadence);
    return today === later ? `${money(today, p.currency)} ${CADENCE_TEXT[cadence]}` : `${money(today, p.currency)} hoy, luego ${money(later, p.currency)} / ${CADENCE_TEXT[cadence]}`;
  };
  const keyCadence = key => { try { const parsed = JSON.parse(key); return Array.isArray(parsed) ? parsed[3] : undefined; } catch { return undefined; } };
  /* The API takes one frequency per order: the message to show when `cadence` differs from one already in the cart. */
  const cadenceConflict = cadence => cadence && [...cart.keys()].some(key => { const existing = keyCadence(key); return existing && existing !== cadence; }) ? CADENCE_CONFLICT : '';
  const consentText = cadence => `Acepto que este pedido se repita ${CADENCE_TEXT[cadence]}. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.`;
  const subscriptionLineInCart = () => [...cart.keys()].map(cartLine).find(line => line?.cadence);
  /* A box: one "choose N" group the shopper fills, repeats allowed (6 cookies, 2 of them Matcha).
   * Any other kind of extra still needs the hosted configuration page. */
  function boxGroup(p) {
    const extras = Array.isArray(p?.extras) ? p.extras : [], count = extras[0]?.pickCount;
    if (!extras.length || p.variants?.length || !Number.isInteger(count) || count < 1 || count > 24) return null;
    if (extras.some(e => !e || typeof e.id !== 'string' || typeof e.name !== 'string' || e.pickCount !== count || e.groupName !== extras[0].groupName || e.required || !Number.isSafeInteger(e.amount) || e.amount < 0)) return null;
    return { name: extras[0].groupName || 'Elige', count, extras };
  }
  const boxKey = (id, picks) => JSON.stringify([id, '', [...picks].sort()]);
  const pickedExtras = (group, picks) => group.extras.flatMap(e => Array(picks.filter(id => id === e.id).length).fill(e));
  function pickLabel(extras) {
    const counts = new Map();
    for (const e of extras) counts.set(e.id, { name: e.name, count: (counts.get(e.id)?.count || 0) + 1 });
    return [...counts.values()].map(pick => pick.count > 1 ? `${pick.name} ×${pick.count}` : pick.name).join(' · ');
  }
