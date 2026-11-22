import { API_BASE_URL, type MerchantStudioApi, type PopupDesignsOverview, type PopupMomentName } from './api';
import { escapeHtml as esc } from './studio-ui';

type PopupApi = Pick<MerchantStudioApi, 'popupDesigns' | 'popupRedesign' | 'popupRestore' | 'popupSettings'>;
const clampPercent = (value: number) => Math.max(5, Math.min(30, Math.round(Number.isFinite(value) ? value : 10)));
const asset = (url: string) => (url.startsWith('/v1/') ? `${API_BASE_URL.replace(/\/v1\/?$/, '')}${url}` : url);

// Spec 2026-11-21: what each of the store's four popups is for, in the merchant's words.
const MOMENT_LABEL: Record<PopupMomentName, [string, string]> = {
  welcome: ['Bienvenida', 'Primera visita: oferta y su contacto.'],
  rescue: ['Carrito', 'Se va con productos en el carrito: le guarda el carrito y le recuerda su código.'],
  interest: ['Interés', 'Mira varios productos de una categoría: le muestra ese producto con su código.'],
  return: ['Regreso', 'Vuelve alguien que ya dejó su contacto: sus favoritos y lo nuevo.'],
};
function momentCard(m: NonNullable<PopupDesignsOverview['moments']>[number], off: string) {
  const current = m.designs.find(d => d.id === m.liveId) ?? m.designs.find(d => d.status !== 'FAILED');
  const [title, what] = MOMENT_LABEL[m.moment];
  return `<article class="retention-section popup-designs popup-designs__moment" data-popup-moment="${m.moment}">
    <h3>${title}</h3><p>${esc(what)}</p>
    ${current ? `<p><strong>${esc(current.composition || `Versión ${current.version}`)}</strong></p>
      <ol class="popup-designs__steps">${(current.previews ?? []).map((p, i) => `<li><img src="${esc(asset(p.url))}" alt="Paso ${i + 1} del popup ${esc(title)}" loading="lazy" width="195"></li>`).join('')}</ol>
      <p class="popup-designs__counts">Últimos 30 días: ${m.counts.shown} vieron · ${m.counts.closed} cerraron · ${m.counts.completed} completaron</p>
      <label class="retention-toggle"><input type="checkbox" name="momentOn"${m.on ? ' checked' : ''}${off}>Mostrar este popup</label>`
      : '<p>Todavía no tiene diseño.</p>'}
    <p><button type="button" data-moment-redesign${off}>${current ? 'Rediseñar' : 'Pedírselo a YAPI'}</button></p>
  </article>`;
}

/** Popups 2.0 (spec 2026-11-18 §9): the store's YAPI popup — each step as shoppers see it on a phone, «Rediseñar» with an
 *  optional request (a chat request: it shows in the chat and spends a credit), percent, contact, the products in «¿qué buscas?»,
 *  on/off and the earlier versions with «Volver a esta». Settings change without a model call. */
export async function mountPopupDesigns(host: HTMLElement, api: PopupApi, storeId: string): Promise<void> {
  let data: PopupDesignsOverview | null = null;
  let note = ''; let failed = false; let busy = false; let waiting = 0;
  const load = async () => { try { data = await api.popupDesigns(storeId); } catch (e) { failed = true; note = e instanceof Error ? e.message : 'No se pudo cargar el popup.'; } };
  const run = async (task: () => Promise<unknown>, done: string) => {
    if (busy) return; busy = true; failed = false; note = 'Guardando…'; draw();
    try { await task(); note = done; await load(); } catch (e) { failed = true; note = e instanceof Error ? e.message : 'No se pudo completar.'; }
    finally { busy = false; draw(); }
  };
  // A redesign lands in 1–2 minutes: look again a few times, quietly.
  const watch = (before: string | null) => {
    const tries = ++waiting;
    let left = 12;
    const tick = async () => {
      if (tries !== waiting || !host.isConnected || left-- <= 0) return;
      await load();
      if (data?.designs[0] && data.designs[0].id !== before) { note = data.designs[0].status === 'LIVE' ? 'Listo: tu popup nuevo ya está en tu tienda.' : 'YAPI no logró un popup que pase las revisiones; el tuyo sigue igual.'; failed = data.designs[0].status !== 'LIVE'; draw(); return; }
      setTimeout(() => void tick(), 15_000);
    };
    setTimeout(() => void tick(), 15_000);
  };
  function draw() {
    const off = busy ? ' disabled' : '';
    if (!data) { host.innerHTML = `<section class="retention-section popup-designs"><h3>Popup de YAPI</h3><p role="${failed ? 'alert' : 'status'}">${esc(note || 'Cargando…')}</p></section>`; return; }
    const current = data.designs.find(d => d.id === data!.liveId) ?? data.designs.find(d => d.status !== 'FAILED');
    const earlier = data.designs.filter(d => d.status !== 'FAILED' && d.id !== current?.id);
    host.innerHTML = `<article data-popup-moment="welcome"><section class="retention-section popup-designs" aria-label="Popup de YAPI">
      <h3>${data.moments ? 'Bienvenida' : 'Popup de YAPI'}</h3>
      ${current ? `<p><strong>${esc(current.composition || `Versión ${current.version}`)}</strong> · ${data.on ? 'activo en tu tienda' : 'apagado (se muestra la ventana clásica)'}</p>
        <ol class="popup-designs__steps" data-popup-steps>${(current.previews ?? []).map((preview, i) => `<li><img src="${esc(asset(preview.url))}" alt="Paso ${i + 1} del popup" loading="lazy" width="195"></li>`).join('')}</ol>`
        : '<p>YAPI diseña un popup para tu tienda con tus colores y productos: oferta, «¿qué buscas?», tu contacto y el código que lleva al producto con el descuento.</p>'}
      <div class="brand-fields"><label>Pídele algo a YAPI (opcional)<textarea name="popupRequest" rows="2" maxlength="300" placeholder="Más divertido, con una pregunta sobre tallas…"${off}></textarea></label></div>
      <p><button type="button" data-popup-redesign${off}>${current ? 'Rediseñar' : 'Diseñar mi popup'}</button></p>
      ${current ? `<div class="brand-fields">
        <label>Descuento (%)<input name="popupPercent" type="number" min="5" max="30" value="${data.percent}"${off}></label>
        <label>Contacto<select name="popupCapture"${off}>${[['whatsapp', 'WhatsApp'], ['email', 'Correo']].map(([v, l]) => `<option value="${v}"${data!.capture === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="retention-toggle"><input type="checkbox" name="popupOn"${data.on ? ' checked' : ''}${off}>Mostrar el popup de YAPI</label>
      </div>
      ${data.pick.length ? `<fieldset class="popup-designs__products"><legend>Productos en «¿qué buscas?» (de 2 a 6)</legend>${data.products.map(p => `<label><input type="checkbox" name="popupProduct" value="${esc(p.id)}"${data!.pick.includes(p.id) ? ' checked' : ''}${off}>${esc(p.name)}</label>`).join('')}</fieldset>` : ''}
      <p><button type="button" data-popup-save${off}>Guardar popup</button></p>` : ''}
      ${earlier.length ? `<details class="popup-designs__versions"><summary>Versiones anteriores (${earlier.length})</summary><ul>${earlier.map(d => `<li data-popup-version="${esc(d.id)}">${d.previews?.[0] ? `<img src="${esc(asset(d.previews[0].url))}" alt="" width="64" loading="lazy">` : ''}<span>v${d.version} · ${esc(d.composition || '')}</span><button type="button"${off}>Volver a esta</button></li>`).join('')}</ul></details>` : ''}
      <p role="${failed ? 'alert' : 'status'}" class="retention-message">${esc(note)}</p>
    </section></article>${(data.moments ?? []).filter(m => m.moment !== 'welcome').map(m => momentCard(m, off)).join('')}`;
    host.querySelector('[data-popup-redesign]')?.addEventListener('click', () => {
      const request = host.querySelector<HTMLTextAreaElement>('[name=popupRequest]')?.value ?? '';
      const before = data?.designs[0]?.id ?? null;
      void run(() => api.popupRedesign(storeId, request), 'YAPI está diseñando tu popup (1–2 minutos). También lo ves en el chat.').then(() => { if (!failed) watch(before); });
    });
    host.querySelector('[data-popup-save]')?.addEventListener('click', () => {
      const percent = clampPercent(Number(host.querySelector<HTMLInputElement>('[name=popupPercent]')?.value));
      const capture = host.querySelector<HTMLSelectElement>('[name=popupCapture]')?.value === 'email' ? 'email' as const : 'whatsapp' as const;
      const on = Boolean(host.querySelector<HTMLInputElement>('[name=popupOn]')?.checked);
      const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('[name=popupProduct]'));
      const products = boxes.length ? boxes.filter(box => box.checked).map(box => box.value) : undefined;
      if (products && products.length < 2) { failed = true; note = 'Elige al menos 2 productos para «¿qué buscas?».'; draw(); return; }
      // A design is checked with at most 6 tiles; more would be a layout nobody looked at.
      if (products && products.length > 6) { failed = true; note = 'Elige hasta 6 productos para «¿qué buscas?».'; draw(); return; }
      void run(() => api.popupSettings(storeId, { percent, capture, on, ...(products ? { products } : {}) }), 'Popup guardado.');
    });
    host.querySelectorAll<HTMLElement>('[data-popup-version]').forEach(row => row.querySelector('button')?.addEventListener('click', () => void run(() => api.popupRestore(storeId, row.dataset.popupVersion!), 'Volviste a esa versión.')));
    host.querySelectorAll<HTMLElement>('[data-popup-moment]').forEach(card => {
      const moment = card.dataset.popupMoment as PopupMomentName;
      if (moment === 'welcome') return;
      card.querySelector<HTMLInputElement>('[name=momentOn]')?.addEventListener('change', event => void run(() => api.popupSettings(storeId, { moment, on: (event.target as HTMLInputElement).checked }), 'Guardado.'));
      card.querySelector('[data-moment-redesign]')?.addEventListener('click', () => void run(() => api.popupRedesign(storeId, '', moment), 'YAPI está diseñando este popup (2–4 minutos). También lo ves en el chat.'));
    });
  }
  draw();
  await load();
  draw();
}
