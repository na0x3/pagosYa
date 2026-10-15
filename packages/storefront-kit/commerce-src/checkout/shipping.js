  // Carrier stores (shippingCarriersEnabled) need a structured Bolivian address
  // and a door pin. The map is optional: address + "Usar mi ubicación" still work.
  const DEPARTMENTS = [['LA_PAZ','La Paz'],['SANTA_CRUZ','Santa Cruz'],['COCHABAMBA','Cochabamba'],['ORURO','Oruro'],['POTOSI','Potosí'],['CHUQUISACA','Chuquisaca'],['TARIJA','Tarija'],['BENI','Beni'],['PANDO','Pando']];
  const DEPARTMENT_CENTERS = { LA_PAZ: [-16.5, -68.15], SANTA_CRUZ: [-17.78, -63.18], COCHABAMBA: [-17.39, -66.16], ORURO: [-17.97, -67.11], POTOSI: [-19.58, -65.75], CHUQUISACA: [-19.05, -65.26], TARIJA: [-21.53, -64.73], BENI: [-14.83, -64.9], PANDO: [-11.03, -68.77] };
  const insideBolivia = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;
  // Subresource Integrity for the cdnjs Leaflet 1.9.4 files (sha512 of the exact bytes served).
  const LEAFLET_JS_SRI = 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g==';
  const LEAFLET_CSS_SRI = 'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw==';
  // Quoted rates by id → carrierId (null for the store's own riders). Only carrier rates need the pin.
  const shippingRateCarriers = new Map();
  const carrierRateSelected = panel => { const id = panel?.querySelector('[name=shippingZoneId]')?.value; return Boolean(id && shippingRateCarriers.get(id)); };
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    leafletLoading ??= new Promise((resolve, reject) => {
      const fail = () => { leafletLoading = null; reject(new Error('No se pudo cargar el mapa.')); };
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = 'anonymous'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(css);
      const script = document.createElement('script'); script.integrity = LEAFLET_JS_SRI; script.crossOrigin = 'anonymous'; script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => window.L ? resolve(window.L) : fail(); script.onerror = fail;
      document.head.append(script);
    });
    return leafletLoading;
  }
  // Hosted stores never collect the address inside the design: only the department (enough to quote
  // courier rates) is chosen here, and pagosYa's secure form asks for the rest at checkout.
  function departmentMarkup(saved) {
    return `<label class="order-field">Departamento de entrega<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.get('destDepartment') === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>`;
  }
  function shippingDepartment(panel) {
    if (!store.shippingCarriersEnabled || panel?.querySelector('[name=method]')?.value !== 'delivery') return undefined;
    return panel.querySelector('[name=destDepartment]')?.value || undefined;
  }
  function destinationMarkup(saved) {
    const v = key => escape(saved.get(key) || '');
    return `<fieldset class="shipping-destination" data-shipping-destination><legend>Dirección de entrega</legend>
      <label class="order-field">Departamento<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.get('destDepartment') === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <label class="order-field">Ciudad<input name="destCity" required maxlength="80" autocomplete="address-level2" value="${v('destCity')}"></label>
      <label class="order-field">Calle y número<input name="destStreet" required maxlength="200" autocomplete="street-address" value="${v('destStreet')}"></label>
      <label class="order-field">Referencias<input name="destReferences" maxlength="300" placeholder="Color de la puerta, un lugar cercano…" value="${v('destReferences')}"></label>
      <label class="order-field">Nombre de quien recibe<input name="destName" required maxlength="120" autocomplete="name" value="${v('destName')}"></label>
      <label class="order-field">Teléfono de quien recibe<input name="destPhone" type="tel" required inputmode="tel" pattern="\\+?[0-9 ]{7,16}" autocomplete="tel" value="${v('destPhone')}"></label>
      <input type="hidden" name="destLat" value="${v('destLat')}"><input type="hidden" name="destLng" value="${v('destLng')}">
      <div class="shipping-map" data-shipping-map style="height:220px;border-radius:12px" role="group" aria-label="Mapa: mueve el marcador a tu puerta"></div>
      <button type="button" class="ghost" data-use-location>Usar mi ubicación</button>
      <p class="order-note" data-pin-status role="status">Marca tu puerta en el mapa.</p></fieldset>`;
  }
  async function mountDestinationMap(panel) {
    const box = panel?.querySelector('[data-shipping-map]'); if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    const lat = panel.querySelector('[name=destLat]'), lng = panel.querySelector('[name=destLng]'), status = panel.querySelector('[data-pin-status]');
    let marker = null;
    if (insideBolivia(Number(lat.value || NaN), Number(lng.value || NaN))) status.textContent = 'Ubicación marcada.';
    const setPin = (a, b) => {
      if (!insideBolivia(a, b)) { status.textContent = 'La ubicación debe estar dentro de Bolivia.'; return false; }
      lat.value = String(a); lng.value = String(b); status.textContent = 'Ubicación marcada.';
      checkoutAnswers.set('destLat', lat.value); checkoutAnswers.set('destLng', lng.value);
      marker?.setLatLng([a, b]); return true;
    };
    if (preview || config.demo || location.hostname === 'localhost') window.__pagosyaSetPin = setPin;
    panel.querySelector('[data-use-location]').addEventListener('click', () => {
      const failed = () => { status.textContent = 'No pudimos obtener tu ubicación; marca tu puerta en el mapa.'; };
      if (!navigator.geolocation) { status.textContent = 'Tu navegador no comparte la ubicación.'; return; }
      status.textContent = 'Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude), failed, { enableHighAccuracy: true, timeout: 10000 });
    });
    try {
      const L = await loadLeaflet();
      if (!box.isConnected) return;
      const dept = panel.querySelector('[name=destDepartment]').value;
      const pinned = insideBolivia(Number(lat.value || NaN), Number(lng.value || NaN));
      const start = pinned ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[dept] || DEPARTMENT_CENTERS.LA_PAZ;
      const map = L.map(box).setView(start, pinned ? 17 : 13);
      // The panel may still be settling when the map mounts; re-measure so tiles fill the box.
      requestAnimationFrame(() => map.invalidateSize?.());
      if (window.ResizeObserver) new ResizeObserver(() => map.invalidateSize?.()).observe(box);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      if (L.Icon?.Default) L.Icon.Default.imagePath = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/';
      marker = L.marker(start, { draggable: true, keyboard: true, title: 'Tu puerta', alt: 'Tu puerta: usa las flechas para moverla' }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); if (!setPin(p.lat, p.lng)) marker.setLatLng(lat.value ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[panel.querySelector('[name=destDepartment]').value] || DEPARTMENT_CENTERS.LA_PAZ); });
      // Leaflet markers are focusable but not keyboard-draggable; arrow keys move the pin (Shift for bigger steps).
      marker.getElement?.()?.addEventListener('keydown', event => {
        const step = { ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key]; if (!step) return;
        event.preventDefault(); event.stopPropagation();
        const p = marker.getLatLng(), d = event.shiftKey ? 0.002 : 0.0002;
        if (setPin(p.lat + step[0] * d, p.lng + step[1] * d)) map.panTo(marker.getLatLng());
      });
      map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
      panel.querySelector('[name=destDepartment]').addEventListener('change', event => { const c = DEPARTMENT_CENTERS[event.target.value]; if (c && !lat.value) { map.setView(c, 13); marker.setLatLng(c); } });
    } catch { if (status.isConnected) status.textContent = 'No se pudo cargar el mapa. Escribe bien las referencias y usa "Usar mi ubicación".'; }
  }
  function shippingDestination(panel) {
    if (!store.shippingCarriersEnabled || panel?.querySelector('[name=method]')?.value !== 'delivery') return undefined;
    const get = name => panel.querySelector(`[name=${name}]`)?.value.trim() || '';
    const lat = Number(get('destLat') || NaN), lng = Number(get('destLng') || NaN);
    if (!get('destDepartment') || !insideBolivia(lat, lng)) return undefined;
    if ([...panel.querySelectorAll('[data-shipping-destination] [required]')].some(input => !input.checkValidity())) return undefined;
    return { department: get('destDepartment'), city: get('destCity'), street: get('destStreet'), references: get('destReferences') || undefined, lat, lng, recipientName: get('destName'), recipientPhone: get('destPhone') };
  }
  function syncShippingAddress(panel) {
    const field = panel?.querySelector('[name=shippingAddress]'); if (!field || !panel.querySelector('[data-shipping-destination]')) return;
    const dest = shippingDestination(panel);
    if (carrierRateSelected(panel)) { if (dest) field.value = `${dest.street}, ${dest.city}`; return; }
    // Own-rider rates keep today's plain address: street, city and references, no pin needed.
    const get = name => panel.querySelector(`[name=${name}]`)?.value.trim() || '';
    field.value = [get('destStreet'), get('destCity'), get('destReferences')].filter(Boolean).join(', ');
  }
  function digitalOnlyCart() { return cart.size > 0 && [...cart.keys()].every(id => cartLine(id)?.p.fulfillmentType === 'DIGITAL'); }
  function updateMethods(el, selected) {
    const method = el.querySelector("[name=method]");
    if (!method) return;
    const location = store.locations?.find((l) => l.id === el.querySelector("[name=location]")?.value);
    const methods = [((location ? location.pickupEnabled : store.shippingPickupEnabled) && (!store.shippingEnabled || store.shippingPickupEnabled)) && ["pickup", "Recoger en tienda"], (location ? location.deliveryEnabled : store.shippingEnabled) && ["delivery", "Entrega a domicilio"]].filter(Boolean);
    method.innerHTML = methods.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (methods.some(([value]) => value === selected)) method.value = selected;
  }
  function updateShipping(panel) {
    const address = panel.querySelector('[data-delivery-address]');
    if (address) address.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const branch = store.locations?.find(location => location.id === panel.querySelector('[name=location]')?.value);
    const info = panel.querySelector('[data-branch-address]');
    if (info) info.textContent = panel.querySelector('[name=method]')?.value === 'pickup' ? branch?.address || '' : '';
    const field = panel.querySelector('[data-shipping]');
    if (field) field.hidden = panel.querySelector('[name=method]')?.value !== 'delivery';
    const rate = panel.querySelector('[name=shippingZoneId]');
    if (rate) rate.value = '';
    if (panel.dataset.discountedSubtotal) panel.querySelector('.order-total strong').textContent = money(Number(panel.dataset.discountedSubtotal), products()[0]?.currency);
    panel.querySelector('.order-total span').textContent = 'Subtotal';

  }
  async function bundleQuote(panel) {
    const status = panel.querySelector('[data-bundle-quote-status]');
    if (!status || preview || config.demo) return;
    status.textContent = 'Comprobando ofertas…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), locationId: panel.querySelector('[name=location]')?.value || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudieron comprobar las ofertas.');
      if (panel.querySelector('[data-bundle-quote-status]') !== status) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - quote.discountAmount);
      if (!panel.querySelector('[name=shippingZoneId]')?.value) panel.querySelector('.order-total strong').textContent = money(quote.subtotal - quote.discountAmount, quote.currency);
      status.textContent = quote.discountAmount ? `Oferta aplicada: −${money(quote.discountAmount, quote.currency)}.` : 'No hay ofertas aplicables a esta selección.';
    } catch (error) { status.textContent = error.message || 'No se pudieron comprobar las ofertas.'; }
  }
  async function shippingQuote(panel) {
    const field = panel.querySelector('[data-shipping]'); if (!field || !cart.size) return;
    const status = field.querySelector('[data-shipping-status]');
    if (preview || config.demo) { status.textContent = 'Las tarifas reales se calculan en la tienda publicada. Esta vista no crea pedidos.'; return; }
    const button = field.querySelector('[data-shipping-quote]');
    const select = field.querySelector('[name=shippingZoneId]');
    const selected = select.value;
    syncShippingAddress(panel);
    button.disabled = true; status.textContent = 'Calculando envío…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), fulfillmentMethod: 'delivery', locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: selected || undefined, creditCode: panel.querySelector('[name=creditCode]')?.value.trim() || undefined, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo calcular el envío.');
      for (const option of quote.shippingOptions || []) shippingRateCarriers.set(option.id, option.carrierId || null);
      if (panel.querySelector('[name=shippingZoneId]') !== select || select.value !== selected) return;
      panel.dataset.discountedSubtotal = String(quote.subtotal - (quote.discountAmount || 0));
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      panel.querySelector('.order-total span').textContent = selected ? 'Total' : 'Subtotal';
      select.innerHTML = '<option value="">Elige tu zona y servicio</option>' + quote.shippingOptions.map(option => `<option value="${escape(option.id)}">${escape(option.name)} · ${money(option.amount, option.currency)}</option>`).join('');
      if ([...select.options].some(option => option.value === selected)) select.value = selected;
      status.textContent = !quote.shippingOptions.length ? 'No hay opciones disponibles para este pedido. Contacta al comercio.' : selected ? `Envío: ${money(quote.shippingAmount, quote.currency)}. Total: ${money(quote.amount, quote.currency)}.` : 'Elige la opción que corresponde a tu dirección.';
    } catch (error) { status.textContent = error.message || 'No se pudo calcular el envío.'; select.value = ''; }
    finally { button.disabled = false; }
  }
  async function applyCredit(panel) {
    const status = panel.querySelector('[data-credit-status]');
    if (preview || config.demo) { status.textContent = 'El saldo se valida en la tienda publicada.'; return; }
    const code = panel.querySelector('[name=creditCode]').value.trim();
    const button = panel.querySelector('[data-credit-apply]'); button.disabled = true;
    panel.dataset.creditReady = 'false'; status.textContent = 'Validando saldo…';
    try {
      const response = await request(`${config.apiBaseUrl}/stores/public/${encodeURIComponent(config.slug)}/shipping/quote`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ items: checkoutItems(), creditCode: code || undefined, fulfillmentMethod: panel.querySelector('[name=method]')?.value || undefined, locationId: panel.querySelector('[name=location]')?.value || undefined, shippingCountry: panel.querySelector('[name=shippingCountry]')?.value.trim().toUpperCase() || undefined, shippingPostalCode: panel.querySelector('[name=shippingPostalCode]')?.value.trim() || undefined, shippingZoneId: panel.querySelector('[name=shippingZoneId]')?.value || undefined, shippingDestination: shippingDestination(panel), shippingDepartment: shippingDepartment(panel) }) });
      const quote = await response.json(); if (!response.ok) throw new Error(quote.message || 'No se pudo aplicar el saldo.');
      if (panel.querySelector('[name=creditCode]')?.value.trim() !== code || !button.isConnected) return;
      panel.dataset.creditReady = 'true';
      panel.querySelector('.order-total strong').textContent = money(quote.amount, quote.currency);
      status.textContent = `Saldo aplicado: ${money(quote.creditAmount || 0, quote.currency)}. Restante a pagar: ${money(quote.amount, quote.currency)}.`;
    } catch (error) { status.textContent = error.message || 'No se pudo aplicar el saldo.'; }
    finally { button.disabled = false; }
  }
  function validateDelivery(panel) {
    if (!digitalOnlyCart() && (store.locations?.length || store.shippingEnabled) && !panel?.querySelector('[name=method]')?.value) {
      message('Esta sucursal no tiene un método de entrega disponible.');
      panel?.querySelector('[name=location]')?.focus(); return false;
    }
    const department = panel?.querySelector('select[name=destDepartment]');
    if (hosted && department && !department.value && panel.querySelector('[name=method]')?.value === 'delivery' && !digitalOnlyCart()) {
      department.reportValidity(); department.focus(); message('Elige el departamento de entrega.'); return false;
    }
    if (store.shippingCarriersEnabled && panel?.querySelector('[data-shipping-destination]') && panel.querySelector('[name=method]')?.value === 'delivery' && !digitalOnlyCart()) {
      if (carrierRateSelected(panel)) {
        for (const input of panel.querySelectorAll('[data-shipping-destination] [required]')) if (!input.reportValidity()) { input.focus(); return false; }
        if (!shippingDestination(panel)) { message('Marca tu puerta en el mapa.'); panel.querySelector('[data-pin-status]').textContent = 'Marca tu puerta en el mapa o usa "Usar mi ubicación".'; return false; }
      } else {
        const street = panel.querySelector('[name=destStreet]');
        if (street && !street.value.trim()) {
          street.setCustomValidity('Escribe la dirección y una referencia para la entrega.'); street.reportValidity(); street.focus();
          street.addEventListener('input', () => street.setCustomValidity(''), { once: true }); return false;
        }
      }
      syncShippingAddress(panel);
    }
    const field = panel?.querySelector('[name=shippingAddress]');
    if (!field || panel.querySelector('[name=method]')?.value !== 'delivery' || digitalOnlyCart()) return true;
    const valid = Boolean(field.value.trim());
    field.setCustomValidity(valid ? '' : 'Escribe la dirección y una referencia para la entrega.');
    if (!valid) { field.reportValidity(); field.focus(); }
    field.addEventListener('input', () => field.setCustomValidity(''), { once: true });
    return valid;
  }
  document.addEventListener('pagosya:validate-checkout', event => { if (event.detail) event.detail.valid = validateDelivery(event.detail.panel); });
