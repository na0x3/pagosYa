import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEmailStudio } from './email-studio-panel.mjs';

const TYPES = [{ type: 'order_confirmation', label: 'Confirmación de compra', group: 'Compras' }, { type: 'appointment_confirmed', label: 'Cita confirmada', group: 'Compras' }];
const FIELDS = { storeName: 'Café', fields: [{ field: 'subject', value: 'Recibo de tu compra en {tienda}', edited: false, max: 90 }, { field: 'headline', value: 'Gracias', edited: true, max: 80 }] };
const status = (over = {}) => ({ kit: 'active', candidate: false, previous: false, siteChanged: false, maxCredits: 25, types: TYPES, ...over });

function fakeApi(statusBody, calls = []) {
  return async (path, init = {}) => {
    calls.push([init.method || 'GET', path, init.body ? JSON.parse(init.body) : undefined]);
    if (path.endsWith('/emails')) return statusBody;
    if (path.includes('/emails/preview')) return { html: '<p>PREVIEW</p>', subject: 'x', repairs: [] };
    if (path.includes('/emails/copy/')) return init.method === 'PUT' ? { value: 'Nuevo', repairs: [] } : init.method === 'DELETE' ? { ok: true } : FIELDS;
    return { ok: true, status: 'saved', credits: 7, repairs: [], sent: true };
  };
}
function mount(api, storeId = () => 'store_1') {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  return { container, window, panel: mountEmailStudio(container, { api, storeId }) };
}
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); };

test('a store without a look offers to design one, with its credit ceiling', async () => {
  const { container, panel } = mount(fakeApi(status({ kit: 'none' })));
  panel.show(); await settle();
  assert.match(container.textContent, /diseño estándar/);
  assert.equal(container.querySelector('[data-email-design]').textContent.trim(), 'Diseñar mis correos · hasta 25 créditos');
});

test('a changed site offers to update; a candidate offers use and back', async () => {
  const changed = mount(fakeApi(status({ siteChanged: true })));
  changed.panel.show(); await settle();
  assert.match(changed.container.textContent, /Tu sitio cambió/);
  assert.equal(changed.container.querySelector('[data-email-design]').textContent.trim(), 'Actualizar correos');
  const pending = mount(fakeApi(status({ candidate: true, previous: true })));
  pending.panel.show(); await settle();
  assert.ok(pending.container.querySelector('[data-email-accept]'));
  assert.ok(pending.container.querySelector('[data-email-discard]'));
});

test('previews the selected email at both widths in closed sandboxes, the candidate when there is one', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(status({ candidate: true }), calls));
  panel.show(); await settle();
  const frames = container.querySelectorAll('iframe');
  assert.deepEqual([...frames].map(f => f.getAttribute('width')), ['390', '640']);
  for (const frame of frames) { assert.equal(frame.getAttribute('sandbox'), ''); assert.match(frame.getAttribute('srcdoc'), /PREVIEW/); }
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=order_confirmation&which=candidate')));
});

test('switching email loads its preview and its wording', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(status(), calls));
  panel.show(); await settle();
  container.querySelector('[data-email-type="appointment_confirmed"]').click(); await settle();
  assert.equal(container.querySelector('[data-email-type="appointment_confirmed"]').getAttribute('aria-pressed'), 'true');
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/preview?type=appointment_confirmed&which=active')));
  assert.ok(calls.some(([, p]) => p.endsWith('/emails/copy/appointment_confirmed')));
});

test('wording: edited fields say so and can be restored; saving sends only changed fields', async () => {
  const calls = [];
  const { container, panel, window } = mount(fakeApi(status(), calls));
  panel.show(); await settle();
  assert.match(container.querySelector('[data-copy-row="headline"]').textContent, /Editado por ti/);
  const subject = container.querySelector('[data-copy-field="subject"]');
  subject.value = 'Gracias por tu compra en {tienda}';
  subject.dispatchEvent(new window.Event('input', { bubbles: true }));
  container.querySelector('[data-copy-save]').click(); await settle();
  assert.deepEqual(calls.filter(([m]) => m === 'PUT').map(([, p, b]) => [p.split('/').at(-1), b.value]), [['subject', 'Gracias por tu compra en {tienda}']]);
  container.querySelector('[data-copy-restore="headline"]').click(); await settle();
  assert.ok(calls.some(([m, p]) => m === 'DELETE' && p.endsWith('/emails/copy/order_confirmation/headline')));
});

test('designing disables the actions while it runs, then reloads', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(status({ kit: 'none' }), calls));
  panel.show(); await settle();
  container.querySelector('[data-email-design]').click();
  assert.equal(container.querySelector('[data-email-design]').disabled, true);
  await settle();
  assert.ok(calls.some(([m, p, b]) => m === 'POST' && p.endsWith('/emails/design') && b.mode === 'twin'));
  assert.ok(calls.filter(([m, p]) => m === 'GET' && p.endsWith('/emails')).length >= 2);
});

test('the test send names the selected email', async () => {
  const calls = [];
  const { container, panel } = mount(fakeApi(status(), calls));
  panel.show(); await settle();
  container.querySelector('[data-email-test]').click(); await settle();
  assert.ok(calls.some(([m, p, b]) => m === 'POST' && p.endsWith('/emails/test-send') && b.type === 'order_confirmation'));
  assert.match(container.textContent, /Te enviamos una prueba/);
});

test('a store switch reloads, and reset clears', async () => {
  const calls = [];
  let store = 'store_1';
  const { container, panel } = mount(fakeApi(status({ kit: 'none' }), calls), () => store);
  panel.show(); await settle();
  store = 'store_2'; panel.show(); await settle();
  assert.ok(calls.some(([, p]) => p.startsWith('/stores/store_2/')));
  panel.reset();
  assert.equal(container.innerHTML, '');
});

test('a failed preview says so instead of showing empty frames', async () => {
  const api = async (path) => {
    if (path.endsWith('/emails')) return status();
    if (path.includes('/emails/preview')) throw new Error('No pudimos preparar la vista previa.');
    return FIELDS;
  };
  const { container, panel } = mount(api);
  panel.show(); await settle();
  assert.equal(container.querySelectorAll('iframe').length, 0);
  assert.match(container.textContent, /No pudimos preparar la vista previa/);
  assert.doesNotMatch(container.textContent, /Preparando la vista previa/);
});
