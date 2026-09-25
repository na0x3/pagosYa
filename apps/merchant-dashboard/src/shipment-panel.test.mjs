import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderShipmentPanel } from './shipment-panel.mjs';

const booked = { id: 'shp_1', status: 'BOOKED', carrier: { name: 'Servientrega Bolivia', mode: 'MANUAL' }, trackingNumber: null, trackingUrl: null, hasLabel: true, lastError: null, events: [] };

test('renders a booked manual shipment with waybill download and tracking form', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const calls = [];
  const api = async (path) => { calls.push(path); return path.endsWith('/shipment') ? booked : { ...booked, status: 'IN_TRANSIT', trackingNumber: 'SV-1' }; };
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, api, 'ord_1');
  assert.match(c.textContent, /Servientrega Bolivia/);
  assert.ok(c.querySelector('[data-shipment-label]'));
  c.querySelector('[name=trackingNumber]').value = 'SV-1';
  c.querySelector('form[data-shipment-tracking]').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls[1], '/shipments/shp_1/tracking');
  assert.match(c.textContent, /SV-1/);
});

test('shows retry for failed shipments', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, async () => ({ ...booked, status: 'FAILED', lastError: 'storage down', hasLabel: false }), 'ord_1');
  assert.ok(c.querySelector('[data-shipment-retry]'));
  assert.match(c.textContent, /storage down/);
});

test('renders nothing when the order has no carrier shipment', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, async () => null, 'ord_1');
  assert.equal(c.innerHTML, '');
});
