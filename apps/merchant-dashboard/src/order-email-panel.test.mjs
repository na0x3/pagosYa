import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountOrderEmailPanel } from './order-email-panel.mjs';

const PREVIEW = { html: '<p>Orden: pi_SYNTH001</p>', repairs: ['logo: not an https url, dropped'] };

function mount(api, storeId = 'store_1') {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  return { window, container, panel: mountOrderEmailPanel(container, { api, storeId: () => storeId }) };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('shows the render at phone and desktop width in sandboxed frames', async () => {
  const paths = [];
  const { container, panel } = mount(async (path) => { paths.push(path); return PREVIEW; });
  panel.show();
  await settle();

  assert.equal(paths[0], '/stores/store_1/source-project/order-email/preview');
  const frames = container.querySelectorAll('iframe');
  assert.equal(frames.length, 2);
  assert.deepEqual([...frames].map(f => f.getAttribute('width')), ['390', '640']);
  // Email HTML has no reason to run scripts, so the sandbox stays fully closed.
  for (const frame of frames) {
    assert.equal(frame.getAttribute('sandbox'), '');
    assert.match(frame.getAttribute('srcdoc'), /Orden: pi_SYNTH001/);
  }
});

test('lists the repairs the validator reported', async () => {
  const { container, panel } = mount(async () => PREVIEW);
  panel.show();
  await settle();
  assert.match(container.textContent, /logo: not an https url, dropped/);
  assert.match(container.querySelector('.order-email-repairs summary').textContent, /\(1\)/);
});

test('sends a test and reports it, without posting an address', async () => {
  const calls = [];
  const { window, container, panel } = mount(async (path, options) => { calls.push({ path, options }); return path.endsWith('/preview') ? PREVIEW : { sent: true }; });
  panel.show();
  await settle();

  container.querySelector('[data-order-email-test]').dispatchEvent(new window.Event('click'));
  await settle();

  const send = calls.find(call => call.path.endsWith('/test-send'));
  assert.equal(send.path, '/stores/store_1/source-project/order-email/test-send');
  assert.equal(send.options.method, 'POST');
  // The address comes from the session on the server; the panel must not supply one.
  assert.equal(send.options.body, undefined);
  assert.match(container.textContent, /Te enviamos una prueba/);
});

test('surfaces a failed preview instead of rendering an empty frame', async () => {
  const { container, panel } = mount(async () => { throw new Error('No pudimos leer la tienda.'); });
  panel.show();
  await settle();
  assert.equal(container.querySelectorAll('iframe').length, 0);
  assert.match(container.textContent, /No pudimos leer la tienda\./);
});

test('surfaces a failed test-send and keeps the preview on screen', async () => {
  const { window, container, panel } = mount(async (path) => {
    if (path.endsWith('/preview')) return PREVIEW;
    throw new Error('Confirma tu correo primero.');
  });
  panel.show();
  await settle();
  container.querySelector('[data-order-email-test]').dispatchEvent(new window.Event('click'));
  await settle();
  assert.match(container.textContent, /Confirma tu correo primero\./);
  assert.equal(container.querySelectorAll('iframe').length, 2);
});

test('does not refetch on a second show of the same store, and refetches after a switch', async () => {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  let calls = 0;
  let storeId = 'store_1';
  const panel = mountOrderEmailPanel(container, { api: async () => { calls += 1; return PREVIEW; }, storeId: () => storeId });

  panel.show();
  await settle();
  assert.equal(calls, 1);

  panel.show();
  await settle();
  assert.equal(calls, 1, 'revisiting the page reuses the render');

  storeId = 'store_2';
  panel.show();
  await settle();
  assert.equal(calls, 2, "switching store fetches that store's own email");
});

test('reset clears the panel and lets the next show refetch', async () => {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  let calls = 0;
  const panel = mountOrderEmailPanel(container, { api: async () => { calls += 1; return PREVIEW; }, storeId: () => 'store_1' });
  panel.show();
  await settle();
  panel.reset();
  assert.equal(container.innerHTML, '');
  panel.show();
  await settle();
  assert.equal(calls, 2);
});

test('does nothing without an active store', async () => {
  const { window } = new JSDOM('<div id="c"></div>');
  globalThis.document = window.document;
  const container = window.document.getElementById('c');
  let calls = 0;
  const panel = mountOrderEmailPanel(container, { api: async () => { calls += 1; return PREVIEW; }, storeId: () => '' });
  panel.show();
  await settle();
  assert.equal(calls, 0);
  assert.equal(container.querySelectorAll('iframe').length, 0);
});
