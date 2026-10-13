import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEmailList } from './email-list-panel.mjs';

const T = (id, extra = {}) => ({ id, name: id, trigger: `Cuando ${id}`, supported: true, enabled: false, subject: `Asunto ${id}`, body: `Mensaje ${id}`, delayHours: 0, ...extra });
const OVERVIEW = { storeName: 'Café', revision: 4, templates: [T('REFUND'), T('SHIPPED'), T('WELCOME'), T('CANCELED'), T('DELIVERED'), T('GIFT_CARD'), T('SUBSCRIPTION_FAILED'), T('SUBSCRIPTION_SKIPPED', { supported: false }), T('RECOVERY', { delayHours: 24 }), T('REVIEW_REQUEST', { delayHours: 24 })] };
const STATUS = { kit: 'active', candidate: false, previous: false, siteChanged: false, maxCredits: 25, types: [{ type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' }, { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' }] };
const CONTENT = { available: true, content: {}, promos: [], photos: [], defaults: { announcement: 'Gracias.', storyTitle: 'Sobre {tienda}', storyText: 'Somos {tienda}.', note: 'Gracias.' } };

function fakeApi({ calls = [], handle = () => undefined } = {}) {
  return async (path, init = {}) => {
    const method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    calls.push([method, path, body]);
    const custom = await handle(method, path, body);
    if (custom !== undefined) return custom;
    if (path.endsWith('/email-workspace')) return structuredClone(OVERVIEW);
    if (path.includes('/email-workspace/templates/')) return { saved: true };
    if (path.endsWith('/emails')) return STATUS;
    if (path.endsWith('/emails/content')) return CONTENT;
    if (path.includes('/emails/preview')) return { html: '<p>PREVIEW</p>', subject: 'x', repairs: [] };
    if (path.includes('/emails/copy/')) return { storeName: 'Café', fields: [] };
    return { ok: true };
  };
}
function mount(api, { storeId = () => 'store_1', confirm = () => true } = {}) {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  return { container, window, panel: mountEmailList(container, { api, storeId, confirm }) };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };
const type = (window, el, value) => { el.value = value; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const submit = (window, container) => container.querySelector('[data-email-text-form]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
const puts = (calls, id) => calls.filter(([m, p]) => m === 'PUT' && p.endsWith(`/email-workspace/templates/${id}`));

test('lists every store email once, grouped, the confirmations always on', async () => {
  const { container, panel } = mount(fakeApi({ handle: (m, p) => p.endsWith('/email-workspace') ? { ...structuredClone(OVERVIEW), templates: [...OVERVIEW.templates, T('ORDER_CONFIRMATION', { enabled: true })] } : undefined }));
  panel.show(); await settle();
  assert.deepEqual([...container.querySelectorAll('[data-email-row]')].map(b => b.dataset.emailRow), ['order_confirmation', 'appointment_confirmed', 'SHIPPED', 'DELIVERED', 'CANCELED', 'REFUND', 'GIFT_CARD', 'SUBSCRIPTION_FAILED', 'SUBSCRIPTION_SKIPPED', 'WELCOME', 'RECOVERY', 'REVIEW_REQUEST']);
  assert.deepEqual([...container.querySelectorAll('.email-list-group h3')].map(h => h.textContent), ['Compras', 'Suscripciones', 'Automáticos']);
  assert.equal(container.querySelector('[data-email-switch="order_confirmation"]'), null);
  assert.equal(container.querySelectorAll('.email-list-state').length, 2);
  assert.match(container.querySelector('[data-email-row="RECOVERY"]').textContent, /24 h/);
});

test('opens on the purchase confirmation in the designed editor, with its content below and no second switcher', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  assert.equal(container.querySelector('[data-email-row="order_confirmation"]').getAttribute('aria-pressed'), 'true');
  assert.equal(container.querySelector('[data-email-designed-root]').hidden, false);
  assert.equal(container.querySelector('[data-email-text-root]').hidden, true);
  assert.equal(container.querySelector('[data-email-type]'), null);
  assert.ok(container.querySelector('[data-email-content-root] [data-content-save]'));
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=order_confirmation&which=active')));
});

test('selecting Cita confirmada shows that designed email', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-row="appointment_confirmed"]').click(); await settle();
  assert.equal(container.querySelector('.email-studio-head h3').textContent, 'Cita confirmada');
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=appointment_confirmed&which=active')));
});

test('a switch saves its email with the stored wording and reloads the list', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-switch="REVIEW_REQUEST"]').click(); await settle();
  assert.deepEqual(puts(calls, 'REVIEW_REQUEST').map(([, , body]) => body), [{ revision: 4, enabled: true, subject: 'Asunto REVIEW_REQUEST', body: 'Mensaje REVIEW_REQUEST' }]);
  assert.equal(calls.filter(([m, p]) => m === 'GET' && p.endsWith('/email-workspace')).length, 2);
  assert.match(container.querySelector('.email-list-status').textContent, /Pedir reseña: activado/);
});

test('an email that cannot be sent yet has no working switch', async () => {
  const { container, panel } = mount(fakeApi());
  panel.show(); await settle();
  const box = container.querySelector('[data-email-switch="SUBSCRIPTION_SKIPPED"]');
  assert.equal(box.disabled, true);
  assert.match(box.closest('label').textContent, /Por conectar/);
});

test('Carrito abandonado saves its wait time with its email', async () => {
  const calls = [];
  const { container, window, panel } = mount(fakeApi({ calls }));
  panel.show(); await settle();
  container.querySelector('[data-email-row="RECOVERY"]').click(); await settle();
  const hours = container.querySelector('[data-email-text-form="RECOVERY"] [name=recoveryHours]');
  assert.equal(hours.value, '24');
  assert.match(container.querySelector('[data-email-text-root]').textContent, /ofrece guardar el carrito/);
  type(window, hours, '0'); submit(window, container); await settle();
  assert.equal(puts(calls, 'RECOVERY').length, 0);
  assert.match(container.textContent, /Las horas de espera van de 1 a 168/);
  type(window, container.querySelector('[name=recoveryHours]'), '48'); submit(window, container); await settle();
  assert.deepEqual(puts(calls, 'RECOVERY').map(([, , body]) => body), [{ revision: 4, enabled: false, subject: 'Asunto RECOVERY', body: 'Mensaje RECOVERY', recoveryHours: 48 }]);
  assert.match(container.textContent, /Correo guardado/);
});

test('Bienvenida edits its wording, offers only {{store}} and previews a sample', async () => {
  const { container, window, panel } = mount(fakeApi());
  panel.show(); await settle();
  container.querySelector('[data-email-row="WELCOME"]').click(); await settle();
  const form = container.querySelector('[data-email-text-form="WELCOME"]');
  assert.doesNotMatch(form.textContent, /\{\{customer\}\}/);
  type(window, form.querySelector('[name=subject]'), 'Hola desde {{store}}');
  form.querySelector('[data-email-sample]').click();
  assert.equal(form.querySelector('[data-email-sample-out]').hidden, false);
  assert.match(form.querySelector('[data-email-sample-out]').textContent, /Hola desde Café/);
});

test('a conflicting save keeps the draft and retries on the refreshed revision', async () => {
  const calls = [];
  let revision = 4, attempts = 0;
  const api = fakeApi({ calls, handle: (method, path) => {
    if (method === 'PUT' && path.endsWith('/templates/SHIPPED') && ++attempts === 1) { revision = 5; throw Object.assign(new Error('La configuración cambió. Actualiza antes de guardar.'), { status: 409 }); }
    if (method === 'GET' && path.endsWith('/email-workspace')) return { ...structuredClone(OVERVIEW), revision };
  } });
  const { container, window, panel } = mount(api);
  panel.show(); await settle();
  container.querySelector('[data-email-row="SHIPPED"]').click(); await settle();
  type(window, container.querySelector('[name=subject]'), 'Ya va en camino');
  submit(window, container); await settle();
  assert.match(container.textContent, /conservamos tu borrador/);
  assert.equal(container.querySelector('[name=subject]').value, 'Ya va en camino');
  assert.equal(container.querySelector('.email-list-status').getAttribute('role'), 'alert');
  submit(window, container); await settle();
  assert.deepEqual(puts(calls, 'SHIPPED').at(-1)[2], { revision: 5, enabled: false, subject: 'Ya va en camino', body: 'Mensaje SHIPPED' });
});

test('a switch on the email being edited asks before dropping unsaved text', async () => {
  const calls = [];
  const { container, window, panel } = mount(fakeApi({ calls }), { confirm: () => false });
  panel.show(); await settle();
  container.querySelector('[data-email-row="SHIPPED"]').click(); await settle();
  type(window, container.querySelector('[name=subject]'), 'Borrador sin guardar');
  const box = container.querySelector('[data-email-switch="SHIPPED"]');
  box.click(); await settle();
  assert.equal(puts(calls, 'SHIPPED').length, 0);
  assert.equal(box.checked, false);
  assert.equal(container.querySelector('[name=subject]').value, 'Borrador sin guardar');
  // Leaving for another email asks too, and declining stays.
  container.querySelector('[data-email-row="DELIVERED"]').click(); await settle();
  assert.ok(container.querySelector('[data-email-text-form="SHIPPED"]'));
});

test('a failed load still lists the confirmations and says why', async () => {
  const { container, panel } = mount(fakeApi({ handle: (m, p) => { if (p.endsWith('/email-workspace')) throw new Error('Sin conexión'); } }));
  panel.show(); await settle();
  assert.deepEqual([...container.querySelectorAll('[data-email-row]')].map(b => b.dataset.emailRow), ['order_confirmation', 'appointment_confirmed']);
  assert.equal(container.querySelector('.email-list-status[role=alert]').textContent, 'Sin conexión');
});

test('without a store nothing loads; a store switch reloads; reset clears', async () => {
  const calls = [];
  let store = null;
  const { container, panel } = mount(fakeApi({ calls }), { storeId: () => store });
  panel.show(); await settle();
  assert.equal(calls.length, 0);
  store = 'store_1'; panel.show(); await settle();
  store = 'store_2'; panel.reset(); panel.show(); await settle();
  assert.ok(calls.some(([, p]) => p === '/stores/store_2/email-workspace'));
  assert.ok(calls.some(([, p]) => p.startsWith('/stores/store_2/source-project/emails')));
  panel.reset();
  assert.equal(container.innerHTML, '');
});
