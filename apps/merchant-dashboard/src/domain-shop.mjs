const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const price = row => new Intl.NumberFormat('es-BO', { style: 'currency', currency: row.currency }).format(row.amount / 100);
const labels = { AWAITING_PAYMENT: 'Esperando tu pago', REGISTERING: 'Registrando tu dominio', CONNECTING: 'Activando tu tienda y HTTPS', ACTIVE: 'Conectado', REVIEW_REQUIRED: 'En revisión con soporte', CANCELED: 'Compra cancelada', TEST_COMPLETE: 'Prueba completada' };
const fields = [
  ['firstName', 'Nombre', 'given-name'], ['lastName', 'Apellido', 'family-name'], ['email', 'Correo del titular', 'email', 'email'],
  ['phone', 'Teléfono con código de país', 'tel', 'tel'], ['address1', 'Dirección', 'street-address'],
  ['city', 'Ciudad', 'address-level2'], ['state', 'Departamento / estado', 'address-level1'], ['zip', 'Código postal', 'postal-code'],
  ['country', 'País (código de dos letras, p. ej. BO)', 'country'],
];

export function mountDomainShop(root, { api, onConnected, onSupport }) {
  let storeId = null, sequence = 0, timer, busy = false;
  const drafts = new Map();
  const state = () => drafts.get(storeId);
  root.innerHTML = `<div class="domain-shop-heading"><div><h4>Encuentra el nombre de tu tienda</h4><p>Compra un dominio y lo conectamos por ti, con y sin www.</p></div><span class="badge" data-mode hidden>Modo de prueba</span></div>
    <p data-availability role="status">Cargando disponibilidad…</p>
    <form data-search class="domain-shop-search"><label>Nombre de tu dominio<input name="query" placeholder="mitienda o mitienda.com" maxlength="100" required autocomplete="off"></label><button class="primary">Buscar dominio</button></form>
    <p data-message role="status" aria-live="polite"></p><div data-results class="domain-shop-results"></div>
    <div data-review></div><div data-orders class="domain-shop-orders" aria-live="polite"></div>`;
  const find = selector => root.querySelector(selector);
  const message = text => { find('[data-message]').textContent = text; };
  function saveDraft() {
    if (!state()) return;
    state().query = find('[name=query]').value;
    const form = find('[data-checkout]');
    if (form) state().contact = Object.fromEntries(fields.map(([name]) => [name, form.elements[name].value]));
  }
  function renderReview() {
    const draft = state(), quote = draft?.quote;
    find('[data-review]').innerHTML = quote ? `<form data-checkout class="domain-shop-review"><h4>${escapeHtml(quote.hostname)}</h4>
      <p><strong>${price(quote)} por el primer año</strong> · Renovación estimada: ${price({ ...quote, amount: quote.renewalAmount })}/año.</p>
      <p>Se registrará a nombre del titular indicado abajo. Podría recibir un correo para confirmar su dirección.</p>
      <div class="domain-shop-contact">${fields.map(([name, label, autocomplete, type]) => `<label>${label}<input name="${name}" type="${type || 'text'}" autocomplete="${autocomplete}" required maxlength="${name === 'country' ? 2 : name === 'zip' ? 20 : 160}" value="${escapeHtml(draft.contact?.[name] || (name === 'country' ? 'BO' : ''))}" ${name === 'phone' ? 'placeholder="+59170000000" pattern="\\+[1-9][0-9]{6,14}"' : name === 'country' ? 'pattern="[A-Z]{2}"' : ''}></label>`).join('')}</div>
      <p>Incluye conexión automática y HTTPS. La renovación automática está desactivada; solicita la renovación a soporte antes del vencimiento. Su precio puede cambiar.</p>
      <label class="domain-shop-consent"><input type="checkbox" name="accepted" required>Confirmo los datos del titular y la compra por un año por ${price(quote)}. Autorizo el registro y la configuración del dominio para esta tienda.</label>
      <div class="domain-shop-actions"><button type="submit" class="primary">Continuar al pago · ${price(quote)}</button><button type="button" class="ghost" data-back>Volver a buscar</button></div>
      <p>Si el nombre deja de estar disponible después del pago, soporte revisará la compra y el reembolso. No tendrás que pagar otra vez.</p></form>` : '';
  }
  function renderOrders(rows) {
    find('[data-orders]').innerHTML = rows.length ? `<h4>Tus dominios</h4>${rows.map(row => `<article class="domain-shop-order"><div><strong>${escapeHtml(row.hostname)}</strong><span class="badge">${escapeHtml(labels[row.status] || row.status)}</span></div>
      <p>${escapeHtml(row.message || (row.status === 'AWAITING_PAYMENT' ? 'Completa el pago. La conexión continuará automáticamente aunque cierres esta página.' : ''))}</p>
      ${row.expiresAt ? `<p>Vence: ${new Intl.DateTimeFormat('es-BO').format(new Date(row.expiresAt))} · Renovación automática desactivada.</p>` : ''}
      ${row.expiresAt && !row.sandbox && !row.contactVerified ? '<p>Revisa el correo del titular y completa la verificación para mantener el dominio disponible.</p>' : ''}
      <div class="domain-shop-actions">${row.checkoutUrl ? `<a class="primary domain-shop-link" href="${escapeHtml(row.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Pagar ${price(row)}</a><button type="button" class="ghost" data-cancel="${escapeHtml(row.id)}">Cancelar compra pendiente</button>` : ''}
      ${row.url ? `<a class="domain-shop-link" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">Abrir tienda ↗</a>` : ''}
      ${row.status === 'REVIEW_REQUIRED' || row.expiresAt ? '<button type="button" class="ghost" data-support>Contactar a soporte</button>' : ''}</div></article>`).join('')}` : '';
  }
  async function refresh() {
    const id = storeId, version = sequence;
    if (!id) return;
    try {
      const data = await api(`/stores/${encodeURIComponent(id)}/domain-shop`);
      if (id !== storeId || version !== sequence) return;
      find('[data-mode]').hidden = !data.sandbox;
      find('[data-availability]').textContent = data.available ? 'Busca entre .com, .net, .org, .store y .shop.' : 'La compra de dominios estará disponible pronto. Por ahora puedes conectar uno que ya tengas.';
      find('[data-search]').hidden = !data.available;
      renderOrders(data.orders || []);
      if ((data.orders || []).some(row => row.status === 'ACTIVE')) onConnected(id);
    } catch (error) {
      if (id === storeId && version === sequence) { find('[data-availability]').textContent = 'No pudimos cargar tus dominios. Volveremos a intentarlo.'; find('[data-search]').hidden = true; }
    }
  }
  find('[data-search]').addEventListener('submit', async event => {
    event.preventDefault(); if (!storeId || busy) return;
    const id = storeId, version = sequence, button = event.submitter;
    saveDraft(); busy = true; button.disabled = true; message('Buscando nombres disponibles…');
    try {
      const rows = await api(`/stores/${id}/domain-shop/search`, { method: 'POST', body: JSON.stringify({ query: state().query }) });
      if (id !== storeId || version !== sequence) return;
      find('[data-results]').innerHTML = rows.map(row => `<article><div><strong>${escapeHtml(row.hostname)}</strong><small>${row.available ? `${price(row)}/primer año · renovación estimada ${price({ ...row, amount: row.renewalAmount })}/año` : 'No disponible para comprar'}</small></div><button type="button" class="${row.available ? 'primary' : 'ghost'}" data-buy="${escapeHtml(row.hostname)}" ${row.available ? '' : 'disabled'}>${row.available ? 'Elegir' : 'No disponible'}</button></article>`).join('');
      message('Los precios y la disponibilidad se confirman antes del pago.');
    } catch (error) { if (id === storeId && version === sequence) message(error.message); }
    finally { busy = false; button.disabled = false; }
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !storeId || busy) return;
    if (button.hasAttribute('data-support')) { onSupport(); return; }
    if (button.hasAttribute('data-back')) { saveDraft(); state().quote = null; renderReview(); return; }
    if (!button.dataset.buy && !button.dataset.cancel) return;
    const id = storeId, version = sequence;
    busy = true; button.disabled = true;
    try {
      if (button.dataset.cancel) {
        await api(`/stores/${id}/domain-shop/orders/${button.dataset.cancel}/cancel`, { method: 'POST' });
        if (id === storeId && version === sequence) { message('Compra pendiente cancelada.'); await refresh(); }
      } else {
        saveDraft(); message('Confirmando el precio…');
        const quote = await api(`/stores/${id}/domain-shop/quotes`, { method: 'POST', body: JSON.stringify({ hostname: button.dataset.buy }) });
        if (id !== storeId || version !== sequence) return;
        state().quote = quote; renderReview(); message('Revisa el precio y los datos del titular.');
        find('[data-review]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (error) { if (id === storeId && version === sequence) message(error.message); }
    finally { busy = false; button.disabled = false; }
  });
  root.addEventListener('submit', async event => {
    if (!event.target.matches('[data-checkout]')) return;
    event.preventDefault(); if (!storeId || busy) return;
    const id = storeId, version = sequence, button = event.submitter;
    saveDraft(); const draft = state();
    busy = true; button.disabled = true; message('Preparando tu pago…');
    try {
      await api(`/stores/${id}/domain-shop/checkout`, { method: 'POST', body: JSON.stringify({ quoteId: draft.quote.id, registrant: draft.contact, accepted: event.target.elements.accepted.checked }) });
      draft.quote = null;
      if (id !== storeId || version !== sequence) return;
      renderReview(); message('Pago listo. Abre el enlace de pago de tu dominio para continuar.'); await refresh();
    } catch (error) { if (id === storeId && version === sequence) message(error.message); }
    finally { busy = false; button.disabled = false; }
  });
  return {
    setStore(id) {
      if (id === storeId) return;
      saveDraft(); clearInterval(timer); storeId = id; sequence++;
      root.hidden = !id;
      if (!id) return;
      if (!drafts.has(id)) drafts.set(id, { query: '', quote: null, contact: {} });
      find('[name=query]').value = state().query; find('[data-results]').innerHTML = ''; find('[data-orders]').innerHTML = ''; message(''); renderReview();
      void refresh(); timer = setInterval(() => { if (!document.hidden && !busy) void refresh(); }, 15_000);
    },
    refresh,
  };
}
