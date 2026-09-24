/**
 * Shopper data for published stores is typed here, in pagosYa's own page, never inside the generated
 * design's frame. The frame only asks for a step ("send a contact message", "continue to payment");
 * this module collects the personal fields and the trusted parent merges them into the API request.
 */
import { destinationMarkup, mountDestinationMap, readDestination, readDestinationDraft, reportDestinationValidity, type ShippingDestination } from './shipping-destination';

export type TrustedField = {
  name: string; label: string; type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox';
  required?: boolean; maxLength?: number; autocomplete?: string; hint?: string; options?: Array<[string, string]>;
};
export type TrustedValues = Record<string, string | boolean>;
/** A block of pagosYa's own UI inside the dialog that the plain field list cannot express (the courier map). */
type TrustedSection = { html: string; mount(form: HTMLFormElement): void; valid(form: HTMLFormElement): boolean };

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function injectStyles() {
  if (document.getElementById('pagosya-trusted-styles')) return;
  const style = document.createElement('style');
  style.id = 'pagosya-trusted-styles';
  style.textContent = `
.pagosya-trusted{box-sizing:border-box;width:min(520px,calc(100% - 24px));max-height:calc(100dvh - 24px);margin:auto;padding:0;border:0;border-radius:16px;background:#fff;color:#1b1a17;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 24px 64px -16px rgb(0 0 0/.4);overflow:auto}
.pagosya-trusted::backdrop{background:rgb(15 20 18/.55);backdrop-filter:blur(2px)}
.pagosya-trusted form{display:grid;gap:14px;padding:22px}
.pagosya-trusted__badge{display:inline-flex;align-items:center;gap:6px;justify-self:start;padding:4px 10px;border-radius:999px;background:#e3f1ea;color:#0f3d2e;font-size:12px;font-weight:600}
.pagosya-trusted h2{margin:0;font-size:20px;line-height:1.25}
.pagosya-trusted p{margin:0;color:#4a463f;font-size:14px}
.pagosya-trusted label{display:grid;gap:6px;font-weight:600;font-size:14px}
.pagosya-trusted label small{font-weight:400;color:#5c5850}
.pagosya-trusted :is(input,textarea,select){box-sizing:border-box;width:100%;min-height:46px;padding:10px 12px;border:1px solid #c9c4ba;border-radius:10px;background:#fff;color:inherit;font:inherit;font-weight:400}
.pagosya-trusted textarea{min-height:96px;resize:vertical}
.pagosya-trusted :is(input,textarea,select):focus-visible{outline:2px solid #0f3d2e;outline-offset:1px;border-color:#0f3d2e}
.pagosya-trusted .pagosya-trusted__check{display:flex;align-items:flex-start;gap:10px;font-weight:400}
.pagosya-trusted .pagosya-trusted__check input{width:20px;min-height:20px;margin-top:2px}
.pagosya-trusted fieldset{display:grid;gap:14px;min-width:0;margin:0;padding:0;border:0}
.pagosya-trusted legend{padding:0;margin-bottom:2px;font-weight:700}
.pagosya-trusted [data-use-location]{justify-self:start;min-height:44px;padding:0 16px;border:1px solid #c9c4ba;border-radius:10px;background:#fff;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.pagosya-trusted [data-pin-status]{font-size:14px;color:#4a463f}
.pagosya-trusted [role=alert]{padding:10px 12px;border-radius:10px;background:#fbeaea;color:#8a1c1c;font-size:14px}
.pagosya-trusted [role=alert]:empty{display:none}
.pagosya-trusted__actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px;margin-top:4px}
.pagosya-trusted__actions button{min-height:46px;padding:0 18px;border-radius:10px;font:inherit;font-weight:600;cursor:pointer}
.pagosya-trusted__actions [type=submit]{border:0;background:#0f3d2e;color:#fff}
.pagosya-trusted__actions [data-cancel]{border:1px solid #c9c4ba;background:#fff;color:inherit}
@media (prefers-reduced-motion:no-preference){.pagosya-trusted[open]{animation:pagosya-trusted-in .18s cubic-bezier(.22,1,.36,1)}}
@keyframes pagosya-trusted-in{from{opacity:0;transform:translateY(8px) scale(.98)}}`;
  document.head.append(style);
}

function fieldMarkup(field: TrustedField, value: string | boolean | undefined) {
  const id = `pagosya-trusted-${field.name}`;
  const common = `id="${id}" name="${escape(field.name)}"${field.required ? ' required' : ''}${field.maxLength ? ` maxlength="${field.maxLength}"` : ''}${field.autocomplete ? ` autocomplete="${escape(field.autocomplete)}"` : ''}`;
  const text = typeof value === 'string' ? value : '';
  if (field.type === 'checkbox') return `<label class="pagosya-trusted__check" for="${id}"><input type="checkbox" ${common}${value === true ? ' checked' : ''}><span>${escape(field.label)}</span></label>`;
  const hint = field.hint ? ` <small>${escape(field.hint)}</small>` : '';
  const control = field.type === 'textarea' ? `<textarea ${common} rows="3">${escape(text)}</textarea>`
    : field.type === 'select' ? `<select ${common}>${(field.options || []).map(([option, label]) => `<option value="${escape(option)}"${option === text ? ' selected' : ''}>${escape(label)}</option>`).join('')}</select>`
    : `<input type="${field.type}" ${common} value="${escape(text)}">`;
  return `<label for="${id}">${escape(field.label)}${field.required ? '' : ' <small>(opcional)</small>'}${hint}${control}</label>`;
}

/** Resolves with the typed values, or null when the shopper cancels. */
export function trustedForm(options: { title: string; intro?: string; fields: TrustedField[]; submitLabel: string; values?: TrustedValues; error?: string; section?: TrustedSection; onSubmit?: (form: HTMLFormElement) => void }): Promise<TrustedValues | null> {
  injectStyles();
  document.querySelector('dialog.pagosya-trusted')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'pagosya-trusted';
  dialog.setAttribute('aria-labelledby', 'pagosya-trusted-title');
  dialog.innerHTML = `<form novalidate>
    <span class="pagosya-trusted__badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.3 7.5 9.5 4.4-1.2 7.5-4.9 7.5-9.5V6L12 3Z"/></svg>Formulario seguro de pagosYa</span>
    <h2 id="pagosya-trusted-title">${escape(options.title)}</h2>
    ${options.intro ? `<p>${escape(options.intro)}</p>` : ''}
    <p role="alert">${escape(options.error || '')}</p>
    ${options.section?.html || ''}
    ${options.fields.map(field => fieldMarkup(field, options.values?.[field.name])).join('')}
    <div class="pagosya-trusted__actions"><button type="button" data-cancel>Cancelar</button><button type="submit">${escape(options.submitLabel)}</button></div>
  </form>`;
  document.body.append(dialog);
  return new Promise(resolve => {
    let settled = false;
    const finish = (values: TrustedValues | null) => { if (settled) return; settled = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(values); };
    const form = dialog.querySelector('form')!;
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (options.section && !options.section.valid(form)) return;
      if (!form.reportValidity()) return;
      options.onSubmit?.(form);
      const values: TrustedValues = {};
      for (const field of options.fields) {
        const control = form.elements.namedItem(field.name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
        if (!control) continue;
        values[field.name] = field.type === 'checkbox' ? (control as HTMLInputElement).checked : control.value.trim();
      }
      finish(values);
    });
    dialog.querySelector('[data-cancel]')!.addEventListener('click', () => finish(null));
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    options.section?.mount(form);
    (dialog.querySelector<HTMLElement>('input,textarea,select') || dialog.querySelector<HTMLElement>('[type=submit]'))?.focus();
  });
}

/** Personal fields the frame must never supply; the trusted parent collects them itself. */
const PERSONAL_FIELDS: Record<string, string[]> = {
  checkout: ['shippingAddress', 'shippingDestination', 'creditCode', 'name', 'email', 'phone'],
  shipping: ['shippingAddress', 'shippingDestination', 'creditCode'],
  lead: ['name', 'email', 'phone', 'message'],
  review: ['trackingToken', 'displayName', 'body', 'rating'],
};
export function withoutPersonalFields(action: string, body: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...body };
  for (const key of PERSONAL_FIELDS[action] || []) delete copy[key];
  if (action === 'retention' && copy.payload && typeof copy.payload === 'object') {
    const payload = { ...(copy.payload as Record<string, unknown>) };
    delete payload.email; delete payload.name; delete payload.phone;
    copy.payload = payload;
  }
  return copy;
}

type StoreInfo = { storeName: string; creditsEnabled?: boolean; carrierRate?: boolean };

// What the shopper typed for a courier delivery, kept in this page (never the frame) so a rejected
// checkout reopens the dialog with the address and pin still in place.
let destinationDraft: Record<string, string> = {};

/** Courier rates need a structured Bolivian address and a door pin, collected here instead of in the design. */
function courierDestinationSection(department: unknown): TrustedSection {
  const draft = { ...destinationDraft };
  if (!draft.destDepartment && typeof department === 'string') draft.destDepartment = department;
  return {
    html: destinationMarkup(draft),
    mount: form => void mountDestinationMap(form),
    valid: form => {
      if (!reportDestinationValidity(form)) return false;
      if (readDestination(form)) return true;
      const status = form.querySelector<HTMLElement>('[data-pin-status]');
      if (status) status.textContent = 'Marca tu puerta en el mapa o usa "Usar mi ubicación".';
      form.querySelector<HTMLElement>('[data-shipping-map]')?.focus();
      return false;
    },
  };
}
/**
 * Collects what an action needs from the shopper in a trusted dialog. Returns the fields to merge into
 * the API request, {} when nothing personal is needed, or null when the shopper cancelled.
 */
export async function collectPersonalFields(action: string, body: Record<string, unknown>, store: StoreInfo, previous?: { values?: TrustedValues; error?: string }): Promise<Record<string, unknown> | null> {
  const name = store.storeName || 'la tienda';
  if (action === 'checkout') {
    const fields: TrustedField[] = [];
    const courier = body.fulfillmentMethod === 'delivery' && store.carrierRate === true;
    if (courier) {
      let destination: ShippingDestination | undefined;
      if (store.creditsEnabled) fields.push({ name: 'creditCode', label: 'Tarjeta de regalo o saldo', type: 'text', maxLength: 39, autocomplete: 'off' });
      const values = await trustedForm({
        title: 'Datos para tu envío', intro: `Se envían solo a ${name} y al courier para entregar tu pedido.`, fields, submitLabel: 'Continuar al pago', ...previous,
        section: courierDestinationSection(body.shippingDepartment),
        onSubmit: form => { destinationDraft = readDestinationDraft(form); destination = readDestination(form); },
      });
      return values && destination ? { shippingDestination: destination, shippingAddress: `${destination.street}, ${destination.city}`, creditCode: values.creditCode || undefined } : null;
    }
    if (body.fulfillmentMethod === 'delivery') fields.push({ name: 'shippingAddress', label: 'Dirección y referencia', type: 'textarea', required: true, maxLength: 300, autocomplete: 'street-address', hint: 'Zona, calle, número y una referencia' });
    if (store.creditsEnabled) fields.push({ name: 'creditCode', label: 'Tarjeta de regalo o saldo', type: 'text', maxLength: 39, autocomplete: 'off' });
    if (!fields.length) return {};
    const values = await trustedForm({ title: 'Datos para tu pedido', intro: `Se envían solo a ${name} para preparar tu pedido.`, fields, submitLabel: 'Continuar al pago', ...previous });
    return values && { shippingAddress: values.shippingAddress || undefined, creditCode: values.creditCode || undefined };
  }
  if (action === 'lead') {
    const values = await trustedForm({ title: `Escribe a ${name}`, intro: 'El equipo de la tienda recibirá tu mensaje y te contactará.', submitLabel: 'Enviar consulta', ...previous, fields: [
      { name: 'name', label: 'Nombre', type: 'text', required: true, maxLength: 120, autocomplete: 'name' },
      { name: 'email', label: 'Correo', type: 'email', required: true, maxLength: 254, autocomplete: 'email' },
      { name: 'phone', label: 'Teléfono', type: 'tel', maxLength: 40, autocomplete: 'tel' },
      { name: 'message', label: 'Tu mensaje', type: 'textarea', required: true, maxLength: 2000 },
    ] });
    return values && { name: values.name, email: values.email, phone: values.phone || undefined, message: values.message };
  }
  if (action === 'review') {
    const values = await trustedForm({ title: 'Comparte tu experiencia', intro: 'Solo pueden opinar quienes compraron. El código está en tu comprobante o en el seguimiento del pedido.', submitLabel: 'Enviar reseña', ...previous, fields: [
      { name: 'trackingToken', label: 'Código de seguimiento del pedido', type: 'text', required: true, maxLength: 250, autocomplete: 'off' },
      { name: 'displayName', label: 'Tu nombre', type: 'text', required: true, maxLength: 80, autocomplete: 'given-name' },
      { name: 'rating', label: 'Calificación', type: 'select', required: true, options: [['5', '5 de 5'], ['4', '4 de 5'], ['3', '3 de 5'], ['2', '2 de 5'], ['1', '1 de 5']] },
      { name: 'body', label: 'Tu reseña', type: 'textarea', required: true, maxLength: 2000 },
    ] });
    return values && { trackingToken: values.trackingToken, displayName: values.displayName, rating: Number(values.rating), body: values.body };
  }
  if (action === 'retention' && ['subscribe', 'carts', 'cards'].includes(String(body.path))) {
    const marketing = body.path !== 'cards';
    const values = await trustedForm({
      title: body.path === 'subscribe' ? `Novedades de ${name}` : body.path === 'carts' ? 'Guardar tu pedido para después' : 'Recibir tu tarjeta por correo',
      intro: body.path === 'carts' ? 'Te enviaremos un solo recordatorio con tu pedido guardado.' : undefined,
      submitLabel: body.path === 'subscribe' ? 'Suscribirme' : 'Enviar', ...previous,
      fields: [
        ...(body.path === 'subscribe' ? [{ name: 'name', label: 'Nombre', type: 'text' as const, maxLength: 100, autocomplete: 'given-name' }] : []),
        { name: 'email', label: 'Tu correo', type: 'email', required: true, maxLength: 254, autocomplete: 'email' },
        ...(body.path === 'subscribe' ? [{ name: 'phone', label: 'WhatsApp / Teléfono', type: 'tel' as const, maxLength: 40, autocomplete: 'tel' }] : []),
        ...(marketing ? [{ name: 'consent', label: `Acepto recibir correos de ${name}. Puedo darme de baja cuando quiera.`, type: 'checkbox' as const, required: true }] : []),
      ],
    });
    return values && { email: values.email, ...(values.name ? { name: values.name } : {}), ...(values.phone ? { phone: values.phone } : {}), ...(marketing ? { consent: values.consent === true } : {}) };
  }
  return {};
}
