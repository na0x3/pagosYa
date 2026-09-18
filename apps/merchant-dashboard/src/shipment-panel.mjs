const LABELS = { BOOKING: 'Reservando', BOOKED: 'Guía lista', PICKED_UP: 'Recogido', IN_TRANSIT: 'En camino', DELIVERED: 'Entregado', FAILED: 'Falló la reserva', CANCELED: 'Cancelado', RETURNED: 'Devuelto' };
const TRACKABLE = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function renderShipmentPanel(container, api, orderId) {
  let shipment = await api(`/orders/${encodeURIComponent(orderId)}/shipment`);
  const draw = (message = '') => {
    if (!shipment) { container.innerHTML = ''; return; }
    const s = shipment;
    container.innerHTML = `<div class="shipment-panel"><strong>${esc(s.carrier.name)} · ${esc(LABELS[s.status] ?? s.status)}</strong>
      ${s.trackingNumber ? `<span>Nº ${esc(s.trackingNumber)}${s.trackingUrl && /^https:\/\//.test(s.trackingUrl) ? ` · <a href="${esc(s.trackingUrl)}" target="_blank" rel="noopener noreferrer">rastrear</a>` : ''}</span>` : ''}
      ${s.hasLabel ? '<button type="button" class="ghost" data-shipment-label>Descargar guía (PDF)</button>' : ''}
      ${TRACKABLE.includes(s.status) ? `<form data-shipment-tracking><label>Nº de seguimiento<input name="trackingNumber" required maxlength="60" value="${esc(s.trackingNumber ?? '')}"></label><button>Guardar</button></form><button type="button" class="ghost" data-shipment-delivered>Marcar entregado</button>` : ''}
      ${s.status === 'FAILED' ? `<p class="error">${esc(s.lastError ?? 'No se pudo reservar el envío.')}</p><button type="button" data-shipment-retry>Reintentar</button>` : ''}
      ${s.events?.length ? `<ol>${s.events.map(e => `<li>${esc(new Date(e.occurredAt).toLocaleString())} · ${esc(e.description ?? LABELS[e.status] ?? e.status)}</li>`).join('')}</ol>` : ''}
      <p role="status">${esc(message)}</p></div>`;
    const act = async (path, body) => {
      try { shipment = await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); draw('Envío actualizado.'); }
      catch (error) { draw(error.message || 'No se pudo actualizar el envío.'); }
    };
    container.querySelector('form[data-shipment-tracking]')?.addEventListener('submit', event => { event.preventDefault(); void act(`/shipments/${encodeURIComponent(s.id)}/tracking`, { trackingNumber: event.target.querySelector('[name=trackingNumber]').value.trim() }); });
    container.querySelector('[data-shipment-delivered]')?.addEventListener('click', () => void act(`/shipments/${encodeURIComponent(s.id)}/delivered`));
    container.querySelector('[data-shipment-retry]')?.addEventListener('click', () => void act(`/shipments/${encodeURIComponent(s.id)}/retry`));
    container.querySelector('[data-shipment-label]')?.addEventListener('click', () => void api(`/shipments/${encodeURIComponent(s.id)}/label`, { raw: true })
      .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `guia-${s.id}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })
      .catch(error => draw(error.message)));
  };
  draw();
}
