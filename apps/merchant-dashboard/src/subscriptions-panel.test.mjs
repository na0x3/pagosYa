import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountSubscriptionsPanel } from './subscriptions-panel.mjs';

const SUMMARY = { enabled: true, active: 0, membershipGraceDays: 7 };

function mount() {
  const { window } = new JSDOM('<div id="subscriptionsRoot"></div>');
  globalThis.document = window.document;
  const api = async (path) => {
    if (path.endsWith('/summary')) return structuredClone(SUMMARY);
    if (path.includes('/payment_links/')) return [];
    return { items: [], nextCursor: null };
  };
  const panel = mountSubscriptionsPanel({ api, signedIn: () => true, storeId: () => 'store_1', products: () => [{ id: 'p1', name: 'Café', fulfillmentType: 'PHYSICAL' }] });
  return { window, root: window.document.getElementById('subscriptionsRoot'), panel };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setTimeout(r, 0)); };

test('the tabs carry an icon each and use the shared tab look', async () => {
  const { root, panel } = mount();
  panel.show(); await settle();
  const tabs = [...root.querySelectorAll('[data-tab]')];
  assert.equal(tabs.length, 3);
  assert.ok(root.querySelector('.ui-tabs[role="tablist"]'));
  for (const tab of tabs) {
    assert.equal(tab.className, 'ui-tab');
    assert.equal(tab.querySelectorAll('svg.ui-icon').length, 1);
  }
});

test('Configuración offers subscriptions with a switch and frequencies with section heads', async () => {
  const { root, panel } = mount();
  panel.show(); await settle();
  root.querySelector('[data-tab="settings"]').click(); await settle();
  const offer = root.querySelector('[data-switch]');
  assert.equal(offer.getAttribute('role'), 'switch');
  assert.equal(offer.checked, true);
  assert.equal(offer.closest('label').className, 'ui-option');
  assert.deepEqual([...root.querySelectorAll('.ui-head h3')].map(h => h.textContent), ['Frecuencias por producto', 'Membresías']);
  root.querySelector('[data-edit="p1"]').click(); await settle();
  const cadence = root.querySelector('[name^="offer-"]');
  assert.equal(cadence.getAttribute('role'), 'switch');
  assert.equal(cadence.closest('label').className, 'ui-inline-switch');
});
