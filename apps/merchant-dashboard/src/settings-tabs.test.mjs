import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountSettingsTabs, settingsEmbedUrl, SETTINGS_TABS } from './settings-tabs.mjs';

const MARKUP = `<div id="root">
  <div role="tablist">${SETTINGS_TABS.map(tab => `<button role="tab" data-settings-tab="${tab}">${tab}</button>`).join('')}</div>
  <div role="tabpanel" data-settings-panel="general"></div>
  <div role="tabpanel" data-settings-panel="studio"><iframe class="settings-embed"></iframe></div>
</div>`;

function mount(storeId = 's1') {
  const { window } = new JSDOM(MARKUP);
  const root = window.document.getElementById('root');
  const shown = [];
  let store = storeId;
  const tabs = mountSettingsTabs(root, { storeId: () => store, onShow: tab => shown.push(tab) });
  return { root, tabs, shown, setStore: next => { store = next; } };
}

const visible = root => [...root.querySelectorAll('[data-settings-panel]')].filter(panel => !panel.hidden).map(panel => panel.dataset.settingsPanel);
const selected = root => [...root.querySelectorAll('[data-settings-tab]')].filter(tab => tab.getAttribute('aria-selected') === 'true').map(tab => tab.dataset.settingsTab);

test('the Studio panels load inline, in the page, for the selected store', () => {
  assert.equal(settingsEmbedUrl('s 1', 'domain'), '/studio/?embedded=1&library=settings&inline=1&section=domain&store=s%201');
  assert.throws(() => settingsEmbedUrl('s1', 'payouts'), /sección/);
});

test('opens on General with only its panel showing', () => {
  const { root } = mount();
  assert.deepEqual(selected(root), ['general']);
  assert.deepEqual(visible(root), ['general']);
});

test('a Studio tab shows the embedded panel for that section', () => {
  const { root, tabs, shown } = mount();
  tabs.select('domain');
  assert.deepEqual(selected(root), ['domain']);
  assert.deepEqual(visible(root), ['studio']);
  assert.equal(root.querySelector('iframe').getAttribute('src'), settingsEmbedUrl('s1', 'domain'));
  assert.deepEqual(shown, ['domain']);
});

test('clicking a tab selects it', () => {
  const { root } = mount();
  root.querySelector('[data-settings-tab="shipping"]').click();
  assert.deepEqual(selected(root), ['shipping']);
  assert.deepEqual(visible(root), ['studio']);
});

test('arrow keys move between tabs, as a tablist should', () => {
  const { root } = mount();
  const general = root.querySelector('[data-settings-tab="general"]');
  general.dispatchEvent(new general.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.deepEqual(selected(root), ['domain']);
});

test('switching store reloads the open Studio panel for the new store', () => {
  const { root, tabs, setStore } = mount();
  tabs.select('brand');
  setStore('s2');
  tabs.refresh();
  assert.equal(root.querySelector('iframe').getAttribute('src'), settingsEmbedUrl('s2', 'brand'));
});

test('without a store the Studio panel stays empty instead of loading someone else\'s', () => {
  const { root, tabs } = mount(null);
  tabs.select('shipping');
  assert.equal(root.querySelector('iframe').hasAttribute('src'), false);
});

test('an unknown tab is ignored', () => {
  const { root, tabs } = mount();
  tabs.select('payouts');
  assert.deepEqual(selected(root), ['general']);
});

test('Correos is no longer an Ajustes tab: the emails live in Correos y marketing', () => {
  assert.deepEqual(SETTINGS_TABS, ['general', 'brand', 'shipping', 'domain']);
  const { root, tabs } = mount();
  tabs.select('emails');
  assert.deepEqual(selected(root), ['general']);
});

test('each settings tab carries one icon', () => {
  const { root } = mount();
  assert.equal(root.querySelectorAll('[data-settings-tab] svg.ui-icon').length, 4);
  for (const tab of root.querySelectorAll('[data-settings-tab]')) assert.equal(tab.querySelectorAll('svg').length, 1);
});

test('a full-nav-only tab is skipped by the arrow keys and by requests unless the switch is on', () => {
  const html = MARKUP.replace('data-settings-tab="brand"', 'data-settings-tab="brand" data-full-nav-only');
  const hidden = new JSDOM(html);
  const root = hidden.window.document.getElementById('root');
  const tabs = mountSettingsTabs(root, { storeId: () => 's1' });
  root.querySelector('[data-settings-tab="general"]').dispatchEvent(new hidden.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.deepEqual(selected(root), ['shipping']);
  tabs.select('brand');
  assert.deepEqual(selected(root), ['shipping']);
  const on = new JSDOM(html.replace('<div id="root">', '<div id="root">'));
  on.window.document.documentElement.setAttribute('data-full-nav', '');
  const onRoot = on.window.document.getElementById('root');
  const onTabs = mountSettingsTabs(onRoot, { storeId: () => 's1' });
  onTabs.select('brand');
  assert.deepEqual(selected(onRoot), ['brand']);
});
