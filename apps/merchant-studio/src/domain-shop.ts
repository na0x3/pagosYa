import { preserveDialogForms } from './dialog-form-state';
import { DomainOrderView, DomainSearchResult, DomainShopState, MerchantStudioApi } from './api';
import { escapeHtml as escape } from './studio-ui';
import './brand-profile.css';
import './settings-shell.css';

const STATUS_LABELS: Record<string, string> = {
  AWAITING_PAYMENT: 'Esperando tu pago', REGISTERING: 'Registrando tu dominio',
  CONNECTING: 'Activando tu tienda y HTTPS', ACTIVE: 'Conectado',
  REVIEW_REQUIRED: 'En revisión con soporte', CANCELED: 'Compra cancelada',
  TEST_COMPLETE: 'Prueba completada',
};

// Name, label, autocomplete, input type. The registrar rejects a registration
// whose contact is incomplete, so every field is required.
const REGISTRANT_FIELDS: Array<[string, string, string, string?]> = [
  ['firstName', 'Nombre', 'given-name'], ['lastName', 'Apellido', 'family-name'],
  ['email', 'Correo del titular', 'email', 'email'],
  ['phone', 'Teléfono con código de país', 'tel', 'tel'],
  ['address1', 'Dirección', 'street-address'], ['city', 'Ciudad', 'address-level2'],
  ['state', 'Departamento / estado', 'address-level1'], ['zip', 'Código postal', 'postal-code'],
  ['country', 'País (código de dos letras, p. ej. BO)', 'country'],
];

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('es-BO', { style: 'currency', currency }).format(amount / 100);

const EXPIRY_WARNING_DAYS = 30;

/**
 * Renewal is manual — nothing charges the merchant again — so the last month
 * before expiry has to read as something to act on, not as a date. Derived from
 * expiresAt at render time rather than stored on the order: the fulfilment loop
 * rewrites an active order's message on every pass and would erase a warning.
 */
export function expiryNotice(expiresAt: string | null | undefined): string {
  if (!expiresAt) return '';
  const date = new Date(expiresAt), when = new Intl.DateTimeFormat('es-BO').format(date);
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60_000));
  if (days <= 0) return `Este dominio venció el ${when}. Escríbenos para recuperarlo cuanto antes.`;
  if (days <= EXPIRY_WARNING_DAYS) return `Vence en ${days} día${days === 1 ? '' : 's'}, el ${when}. La renovación no es automática: escríbenos para renovarlo.`;
  return `Vence el ${when} · Renovación automática desactivada.`;
}

/** `host`: draw the panel inside the settings window instead of opening a modal of its own. */
export async function openDomainShop(api: MerchantStudioApi, storeId: string, onConnected?: () => void, host?: HTMLElement) {
  const dialog = document.createElement('dialog'); dialog.className = 'brand-dialog';
  dialog.setAttribute('aria-label', 'Tu propio dominio');
  let state: DomainShopState | undefined, results: DomainSearchResult[] = [], quote: DomainOrderView | null = null;
  let busy = false, message = '', query = '', connected = false, timer: ReturnType<typeof setInterval> | undefined;
  (host ?? document.body).append(dialog); dialog.innerHTML = '<p role="status">Cargando dominios…</p>'; if (host) dialog.setAttribute('open', ''); else dialog.showModal();
  dialog.addEventListener('close', () => { clearInterval(timer); dialog.remove(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });

  try { state = await api.domainShop(storeId); render(); }
  catch (error) {
    dialog.innerHTML = `<p>${escape(error instanceof Error ? error.message : 'No se pudo cargar la compra de dominios.')}</p><button>Cerrar</button>`;
    dialog.querySelector('button')!.onclick = () => dialog.close();
    return;
  }

  // The purchase continues on the server, so a merchant who leaves the payment
  // link open sees the status change without reopening the panel.
  timer = setInterval(() => { if (!document.hidden && !busy && dialog.open) void refresh(); }, 15_000);

  async function refresh() {
    try { state = await api.domainShop(storeId); notifyIfConnected(); render(); }
    catch { /* A transient failure keeps the panel on screen; the next tick retries. */ }
  }
  function notifyIfConnected() {
    if (connected || !state?.orders.some(order => order.status === 'ACTIVE')) return;
    connected = true; onConnected?.();
  }
  async function run(task: () => Promise<void>) {
    if (busy) return;
    const restore = preserveDialogForms(dialog);
    let failed = false; busy = true; message = '';
    dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,select,button').forEach(control => control.disabled = true);
    try { await task(); }
    catch (error) { failed = true; message = error instanceof Error ? error.message : 'No se pudo completar la operación.'; }
    finally { busy = false; render(); if (failed) restore(); }
  }

  function searchSection() {
    if (!state!.available) {
      return `<section class="settings-card"><h3>Comprar un dominio</h3><p>La compra de dominios estará disponible pronto. Mientras tanto puedes conectar un dominio que ya tengas desde el panel, en <strong>Apariencia → Publica con tu propio dominio</strong>.</p></section>`;
    }
    return `<section class="settings-card"><h3>Comprar un dominio</h3>
      <form id="domain-search" class="settings-inline"><input name="query" value="${escape(query)}" placeholder="Busca un dominio, p. ej. tu-marca" aria-label="Nombre de tu dominio" maxlength="100" required autocomplete="off"><button type="submit">Buscar</button></form>
      <p>Busca entre ${escape(state!.tlds.map(tld => '.' + tld).join(', '))}. Los precios son por el primer año y la renovación no es automática. Compramos el nombre y lo conectamos a esta tienda, con y sin www.</p></section>
      ${results.length ? `<section class="settings-card"><h3>Resultados</h3>${results.map(row => `<article><strong>${escape(row.hostname)}</strong><p>${row.available ? `${escape(money(row.amount, row.currency))} el primer año · renovación estimada ${escape(money(row.renewalAmount, row.currency))}/año` : 'No disponible para comprar'}</p><button class="button${row.available ? ' button--publish' : ''}" type="button" data-choose="${escape(row.hostname)}" ${row.available ? '' : 'disabled'}>${row.available ? 'Elegir' : 'No disponible'}</button></article>`).join('')}</section>` : ''}`;
  }

  function reviewSection() {
    if (!quote) return '';
    return `<form id="domain-checkout" class="settings-card"><h3>${escape(quote.hostname)}</h3>
      <p><strong>${escape(money(quote.amount, quote.currency))} por el primer año</strong> · Renovación estimada ${escape(money(quote.renewalAmount, quote.currency))}/año.</p>
      <p>El dominio se registra a nombre del titular indicado abajo, que podría recibir un correo para confirmar su dirección.</p>
      <div class="brand-fields">${REGISTRANT_FIELDS.map(([name, label, autocomplete, type]) => `<label>${escape(label)}<input name="${escape(name)}" type="${escape(type || 'text')}" autocomplete="${escape(autocomplete)}" required maxlength="${name === 'country' ? 2 : name === 'zip' ? 20 : 160}" ${name === 'country' ? 'value="BO" pattern="[A-Z]{2}"' : ''}${name === 'phone' ? ' placeholder="+59170000000" pattern="\\+[1-9][0-9]{6,14}"' : ''}></label>`).join('')}</div>
      <p>Incluye la conexión automática y el HTTPS. <strong>La renovación automática está desactivada</strong>: pide la renovación a soporte antes del vencimiento, y su precio puede cambiar.</p>
      <label><span><input type="checkbox" name="accepted" required style="width:auto"> Confirmo los datos del titular y la compra por un año por ${escape(money(quote.amount, quote.currency))}. Autorizo el registro y la configuración del dominio para esta tienda.</span></label>
      <button class="button button--publish" type="submit">Continuar al pago · ${escape(money(quote.amount, quote.currency))}</button>
      <button class="button" type="button" id="domain-back">Volver a buscar</button>
      <p>Si el nombre deja de estar disponible después del pago, soporte revisa la compra y el reembolso. No tendrás que pagar otra vez.</p></form>`;
  }

  function ordersSection() {
    const orders = state!.orders;
    if (!orders.length) {
      return `<section class="settings-card"><h3>Tus dominios</h3><div class="settings-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg><strong>Aún no tienes dominios</strong><p>${state!.available ? 'Busca arriba para comprar tu primer dominio.' : 'Cuando conectes un dominio aparecerá aquí.'}</p></div></section>`;
    }
    return `<section class="settings-card"><h3>Tus dominios</h3>${orders.map(order => `<article><strong>${escape(order.hostname)}</strong>
      <p>${escape(STATUS_LABELS[order.status] || order.status)}${order.message ? ` · ${escape(order.message)}` : ''}</p>
      ${order.expiresAt ? `<p>${escape(expiryNotice(order.expiresAt))}</p>` : ''}
      ${order.expiresAt && !order.sandbox && !order.contactVerified ? '<p>Revisa el correo del titular y completa la verificación para mantener el dominio activo.</p>' : ''}
      ${order.checkoutUrl ? `<a class="button button--publish" href="${escape(order.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Pagar ${escape(money(order.amount, order.currency))}</a><button class="button" type="button" data-cancel="${escape(order.id)}">Cancelar compra pendiente</button>` : ''}
      ${order.url ? `<a class="button" href="${escape(order.url)}" target="_blank" rel="noopener noreferrer">Abrir tienda ↗</a>` : ''}</article>`).join('')}</section>`;
  }

  function render() {
    dialog.innerHTML = `<header><h2>Tu propio dominio</h2><button class="button" id="domain-close">Cerrar</button></header>
      ${state!.sandbox && state!.available ? '<p class="settings-note"><strong>Modo de prueba.</strong> No se compra ni se publica un dominio real.</p>' : ''}
      ${searchSection()}${reviewSection()}${ordersSection()}<p role="status">${escape(message)}</p>`;

    dialog.querySelector('#domain-close')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#domain-back')?.addEventListener('click', () => { quote = null; render(); });

    dialog.querySelector('#domain-search')?.addEventListener('submit', event => {
      event.preventDefault();
      query = String(new FormData(event.target as HTMLFormElement).get('query') || '');
      void run(async () => {
        results = await api.searchDomains(storeId, query);
        message = 'El precio y la disponibilidad se confirman antes del pago.';
      });
    });

    dialog.querySelectorAll<HTMLButtonElement>('[data-choose]').forEach(button => button.onclick = () => void run(async () => {
      quote = await api.quoteDomain(storeId, button.dataset.choose!);
      message = 'Revisa el precio y completa los datos del titular.';
    }));

    dialog.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach(button => button.onclick = () => void run(async () => {
      await api.cancelDomainOrder(storeId, button.dataset.cancel!);
      state = await api.domainShop(storeId);
      message = 'Compra pendiente cancelada.';
    }));

    dialog.querySelector('#domain-checkout')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = new FormData(event.target as HTMLFormElement);
      const registrant = Object.fromEntries(REGISTRANT_FIELDS.map(([name]) => [name, String(form.get(name) || '')]));
      const quoteId = quote!.id;
      void run(async () => {
        await api.checkoutDomain(storeId, { quoteId, registrant, accepted: form.has('accepted') });
        quote = null; results = [];
        state = await api.domainShop(storeId);
        message = 'Tu pago está listo. Abre el enlace de pago para continuar; la conexión sigue aunque cierres esta ventana.';
      });
    });
  }
}
