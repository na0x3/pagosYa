/** Structured Bolivian delivery address + door pin for stores with shipping carriers.
 * Mirrors the standalone kit (apps/api/src/stores/source-kit/commerce.js), which ships its own copy.
 * The map is optional: when Leaflet cannot load, the address and "Usar mi ubicación" still work. */
export type ShippingDestination = { department: string; city: string; street: string; references?: string; lat: number; lng: number; recipientName: string; recipientPhone: string };

export const DEPARTMENTS: ReadonlyArray<readonly [string, string]> = [['LA_PAZ', 'La Paz'], ['SANTA_CRUZ', 'Santa Cruz'], ['COCHABAMBA', 'Cochabamba'], ['ORURO', 'Oruro'], ['POTOSI', 'Potosí'], ['CHUQUISACA', 'Chuquisaca'], ['TARIJA', 'Tarija'], ['BENI', 'Beni'], ['PANDO', 'Pando']];
export const DEPARTMENT_CENTERS: Record<string, [number, number]> = { LA_PAZ: [-16.5, -68.15], SANTA_CRUZ: [-17.78, -63.18], COCHABAMBA: [-17.39, -66.16], ORURO: [-17.97, -67.11], POTOSI: [-19.58, -65.75], CHUQUISACA: [-19.05, -65.26], TARIJA: [-21.53, -64.73], BENI: [-14.83, -64.9], PANDO: [-11.03, -68.77] };
export const insideBolivia = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;

const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const FIELDS = ['destDepartment', 'destCity', 'destStreet', 'destReferences', 'destName', 'destPhone', 'destLat', 'destLng'] as const;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// Leaflet is loaded on demand from cdnjs; keep its surface untyped rather than adding a dependency.
type Leaflet = any;
let leafletLoading: Promise<Leaflet> | null = null;
function loadLeaflet(): Promise<Leaflet> {
  const existing = (window as any).L;
  if (existing) return Promise.resolve(existing);
  leafletLoading ??= new Promise((resolve, reject) => {
    const fail = () => { leafletLoading = null; reject(new Error('No se pudo cargar el mapa.')); };
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = `${LEAFLET}leaflet.min.css`; document.head.append(css);
    const script = document.createElement('script'); script.src = `${LEAFLET}leaflet.min.js`;
    script.onload = () => (window as any).L ? resolve((window as any).L) : fail(); script.onerror = fail;
    document.head.append(script);
  });
  return leafletLoading;
}

/** Current field values, so a re-render can restore what the buyer typed. */
export function readDestinationDraft(root: ParentNode): Record<string, string> {
  return Object.fromEntries(FIELDS.flatMap(name => { const el = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`); return el ? [[name, el.value]] : []; }));
}

export function destinationMarkup(saved: Record<string, string> = {}): string {
  const v = (key: string) => escapeHtml(saved[key] || '');
  return `<fieldset class="shipping-destination" data-shipping-destination><legend>Dirección de entrega</legend>
    <label>Departamento<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.destDepartment === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
    <label>Ciudad<input name="destCity" required maxlength="80" autocomplete="address-level2" value="${v('destCity')}"></label>
    <label>Calle y número<input name="destStreet" required maxlength="200" autocomplete="street-address" value="${v('destStreet')}"></label>
    <label>Referencias<input name="destReferences" maxlength="300" placeholder="Color de la puerta, un lugar cercano…" value="${v('destReferences')}"></label>
    <label>Nombre de quien recibe<input name="destName" required maxlength="120" autocomplete="name" value="${v('destName')}"></label>
    <label>Teléfono de quien recibe<input name="destPhone" type="tel" required inputmode="tel" pattern="\\+?[0-9 ]{7,16}" autocomplete="tel" value="${v('destPhone')}"></label>
    <input type="hidden" name="destLat" value="${v('destLat')}"><input type="hidden" name="destLng" value="${v('destLng')}">
    <div class="shipping-map" data-shipping-map style="height:220px;border-radius:12px" role="group" aria-label="Mapa: mueve el marcador a tu puerta"></div>
    <button type="button" class="ghost" data-use-location>Usar mi ubicación</button>
    <p class="hint" data-pin-status role="status">Marca tu puerta en el mapa.</p></fieldset>`;
}

/** The destination to send, or undefined until department and a pin inside Bolivia are set. */
export function readDestination(root: ParentNode): ShippingDestination | undefined {
  const get = (name: string) => root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name=${name}]`)?.value.trim() || '';
  const lat = Number(get('destLat') || Number.NaN), lng = Number(get('destLng') || Number.NaN);
  if (!get('destDepartment') || !insideBolivia(lat, lng)) return undefined;
  return { department: get('destDepartment'), city: get('destCity'), street: get('destStreet'), references: get('destReferences') || undefined, lat, lng, recipientName: get('destName'), recipientPhone: get('destPhone') };
}

/** Reports the first missing required field; true when every required field is filled. */
export function reportDestinationValidity(root: ParentNode): boolean {
  for (const input of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-shipping-destination] [required]')) if (!input.reportValidity()) { input.focus(); return false; }
  return true;
}

/** Wires the pin controls; `onPin` runs after every accepted pin. Safe to call repeatedly. */
export async function mountDestinationMap(root: ParentNode, onPin: () => void = () => {}): Promise<void> {
  const box = root.querySelector<HTMLElement>('[data-shipping-map]'); if (!box || box.dataset.ready) return;
  box.dataset.ready = '1';
  const lat = root.querySelector<HTMLInputElement>('[name=destLat]')!, lng = root.querySelector<HTMLInputElement>('[name=destLng]')!, status = root.querySelector<HTMLElement>('[data-pin-status]')!;
  const department = root.querySelector<HTMLSelectElement>('[name=destDepartment]')!;
  const pinned = () => insideBolivia(Number(lat.value || Number.NaN), Number(lng.value || Number.NaN));
  let marker: Leaflet = null;
  if (pinned()) status.textContent = 'Ubicación marcada.';
  const setPin = (a: number, b: number) => {
    if (!insideBolivia(a, b)) { status.textContent = 'La ubicación debe estar dentro de Bolivia.'; return false; }
    lat.value = String(a); lng.value = String(b); status.textContent = 'Ubicación marcada.';
    marker?.setLatLng([a, b]); onPin(); return true;
  };
  if (location.hostname === 'localhost') (window as any).__pagosyaSetPin = setPin;
  root.querySelector('[data-use-location]')!.addEventListener('click', () => {
    if (!navigator.geolocation) { status.textContent = 'Tu navegador no comparte la ubicación.'; return; }
    status.textContent = 'Buscando tu ubicación…';
    navigator.geolocation.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude), () => { status.textContent = 'No pudimos obtener tu ubicación; marca tu puerta en el mapa.'; }, { enableHighAccuracy: true, timeout: 10000 });
  });
  try {
    const L = await loadLeaflet();
    if (!box.isConnected) return;
    const start = pinned() ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[department.value] || DEPARTMENT_CENTERS.LA_PAZ;
    const map = L.map(box).setView(start, pinned() ? 17 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    if (L.Icon?.Default) L.Icon.Default.imagePath = `${LEAFLET}images/`;
    marker = L.marker(start, { draggable: true, keyboard: true, title: 'Tu puerta', alt: 'Tu puerta: usa las flechas para moverla' }).addTo(map);
    marker.on('dragend', () => { const p = marker.getLatLng(); if (!setPin(p.lat, p.lng) && lat.value) marker.setLatLng([Number(lat.value), Number(lng.value)]); });
    // Leaflet markers are focusable but not keyboard-draggable; arrow keys move the pin (Shift for bigger steps).
    marker.getElement?.()?.addEventListener('keydown', (event: KeyboardEvent) => {
      const step = ({ ArrowUp: [1, 0], ArrowDown: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] } as Record<string, number[]>)[event.key]; if (!step) return;
      event.preventDefault(); event.stopPropagation();
      const p = marker.getLatLng(), d = event.shiftKey ? 0.002 : 0.0002;
      if (setPin(p.lat + step[0] * d, p.lng + step[1] * d)) map.panTo(marker.getLatLng());
    });
    map.on('click', (e: { latlng: { lat: number; lng: number } }) => setPin(e.latlng.lat, e.latlng.lng));
    department.addEventListener('change', () => { const c = DEPARTMENT_CENTERS[department.value]; if (c && !lat.value) { map.setView(c, 13); marker.setLatLng(c); } });
  } catch { if (status.isConnected) status.textContent = 'No se pudo cargar el mapa. Escribe bien las referencias y usa "Usar mi ubicación".'; }
}
