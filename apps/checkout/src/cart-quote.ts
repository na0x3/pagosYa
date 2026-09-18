import { quoteCart, type CartFulfillment, type CartQuote } from './api';
import { destinationMarkup, mountDestinationMap, plainDestinationAddress, readDestination, reportDestinationValidity } from './shipping-destination';

/** The server owns discounts and fees. Any cart rerender discards the old quote. */
export function mountCartQuote(root: HTMLElement, options: {
  slug: string; items: Parameters<typeof quoteCart>[1]; promoCode?: string;
  credits?: boolean; shipping: boolean; pickup: boolean; fulfillment?: CartFulfillment;
  address?: string;
  /** Carrier stores collect a structured Bolivian address and a map pin instead of one address field. */
  carriers?: boolean; destination?: Record<string, string>;
  money: (amount: number, currency: string) => string;
  onQuote: (quote: CartQuote) => void;
}) {
  let quote: CartQuote | null = null;
  let sequence = 0;
  root.innerHTML = `${options.shipping ? `<h3>Entrega del pedido</h3>
    ${options.fulfillment ? '' : `<label>Modalidad<select data-method>${options.pickup ? '<option value="pickup">Retiro sin costo</option>' : ''}<option value="delivery">Envío</option></select></label>`}
    <div data-delivery>${options.carriers ? destinationMarkup(options.destination) : '<label>Dirección de entrega<input data-address autocomplete="street-address" maxlength="600"></label>'}
    <label>País de entrega (código de dos letras)<input data-country maxlength="2" placeholder="BO" autocomplete="country" pattern="[A-Za-z]{2}"></label><label>Código postal<input data-postal maxlength="20" autocomplete="postal-code"></label><label>Opción de envío<select data-rate><option value="">Selecciona una tarifa</option></select></label></div>` : ''}
    ${options.credits ? '<label>Tarjeta de regalo o saldo<input data-credit maxlength="39" autocomplete="off" spellcheck="false"></label><button type="button" data-credit-apply>Aplicar saldo</button>' : ''}
    <p data-quote-status role="status">Calculando total…</p><button type="button" data-retry hidden>Volver a calcular</button>`;
  const address = root.querySelector<HTMLInputElement>('[data-address]');
  if (address) address.value = options.address || '';
  const methodInput = root.querySelector<HTMLSelectElement>('[data-method]');
  const rate = root.querySelector<HTMLSelectElement>('[data-rate]');
  const status = root.querySelector<HTMLElement>('[data-quote-status]')!;
  const retry = root.querySelector<HTMLButtonElement>('[data-retry]')!;
  // Only carrier rates need the structured destination and pin; own-rider rates keep the plain address.
  // Kept across re-quotes (the quote itself is cleared while one is in flight).
  const rateCarriers = new Map<string, string | null>();
  const carrierRate = (zoneId?: string) => Boolean(zoneId && rateCarriers.get(zoneId));
  function selection(): CartFulfillment | undefined {
    const creditCode = root.querySelector<HTMLInputElement>('[data-credit]')?.value.trim() || undefined;
    if (!options.shipping) return { ...options.fulfillment, creditCode };
    const fulfillmentMethod = options.fulfillment?.fulfillmentMethod || methodInput!.value as 'pickup' | 'delivery';
    const destination = options.carriers && fulfillmentMethod === 'delivery' ? readDestination(root) : undefined;
    return { ...options.fulfillment, creditCode, fulfillmentMethod, ...(fulfillmentMethod === 'delivery' ? { shippingCountry: root.querySelector<HTMLInputElement>('[data-country]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: root.querySelector<HTMLInputElement>('[data-postal]')?.value.trim() || undefined, shippingZoneId: rate?.value || undefined, shippingAddress: options.carriers ? carrierRate(rate?.value) ? destination && `${destination.street}, ${destination.city}` : plainDestinationAddress(root) || undefined : address?.value.trim(), ...(destination ? { shippingDestination: destination } : {}) } : {}) };
  }
  async function refresh() {
    const requestId = ++sequence;
    quote = null; retry.hidden = true; status.textContent = 'Calculando total…';
    const selected = selection();
    const delivery = selected?.fulfillmentMethod === 'delivery';
    const fields = root.querySelector<HTMLElement>('[data-delivery]');
    if (fields) fields.hidden = !delivery;
    if (delivery) void mountDestinationMap(root, destinationChanged);
    quotedDepartment = selected?.shippingDestination?.department;
    try {
      const result = await quoteCart(options.slug, options.items, options.promoCode, selected);
      if (requestId !== sequence || !root.isConnected) return;
      quote = result;
      for (const option of result.shippingOptions) rateCarriers.set(option.id, option.carrierId ?? null);
      if (rate) {
        const previous = rate.value;
        rate.replaceChildren(new Option('Selecciona una tarifa', ''), ...result.shippingOptions.map(item => new Option(`${item.name} · ${options.money(item.amount, item.currency)}`, item.id)));
        rate.value = previous;
      }
      options.onQuote(result);
      status.textContent = delivery && !rate?.value
        ? result.shippingOptions.length ? 'Selecciona el servicio para incluir el envío en el total.' : 'No hay tarifas para este carrito. Contacta a la tienda o elige retiro si está disponible.'
        : `${result.discountAmount ? `Descuento: ${options.money(result.discountAmount, result.currency)}. ` : ''}${options.shipping ? `Envío: ${options.money(result.shippingAmount, result.currency)}. ` : ''}${result.creditAmount ? `Saldo aplicado: ${options.money(result.creditAmount, result.currency)}. ` : ''}Total: ${options.money(result.amount, result.currency)}.`;
    } catch (error) {
      if (requestId !== sequence || !root.isConnected) return;
      status.textContent = error instanceof Error ? error.message : 'No se pudo calcular el total.'; retry.hidden = false;
    }
  }
  // Department-scoped carrier rates only appear once the destination is complete, so re-quote when that changes.
  let quotedDepartment: string | undefined;
  function destinationChanged() { if (readDestination(root)?.department !== quotedDepartment) { if (rate) rate.value = ''; void refresh(); } }
  // Any destination field can complete (or break) the destination; `change` fires once per edit, not per keystroke.
  root.querySelector('[data-shipping-destination]')?.addEventListener('change', destinationChanged);
  root.querySelectorAll('[data-country],[data-postal]').forEach(el => el.addEventListener('input', () => { sequence++; quote = null; if (rate) rate.value = ''; status.textContent = 'Vuelve a calcular las tarifas para este destino.'; retry.hidden = false; }));
  methodInput?.addEventListener('change', () => { if (rate) rate.value = ''; void refresh(); });
  rate?.addEventListener('change', () => void refresh());
  root.querySelector('[data-credit]')?.addEventListener('input', () => { sequence++; quote = null; status.textContent = 'Aplica el código para actualizar el total.'; });
  root.querySelector('[data-credit-apply]')?.addEventListener('click', () => void refresh());
  retry.addEventListener('click', () => void refresh());
  void refresh();
  return () => {
    if (!quote) throw new Error('Espera a que se calcule el total o vuelve a calcularlo.');
    const selected = selection();
    if (options.carriers && options.shipping && selected?.fulfillmentMethod === 'delivery') {
      if (carrierRate(selected.shippingZoneId)) {
        if (!reportDestinationValidity(root)) throw new Error('Completa la dirección de entrega.');
        if (!selected.shippingDestination) throw new Error('Completa la dirección de entrega y marca tu puerta en el mapa.');
      } else if (!selected.shippingAddress) {
        root.querySelector<HTMLInputElement>('[name=destStreet]')?.reportValidity();
        throw new Error('Selecciona una tarifa de envío y completa la dirección.');
      }
    }
    if (options.shipping && selected?.fulfillmentMethod === 'delivery' && (!selected.shippingZoneId || !selected.shippingAddress)) throw new Error('Selecciona una tarifa de envío y completa la dirección.');
    return selected;
  };
}
