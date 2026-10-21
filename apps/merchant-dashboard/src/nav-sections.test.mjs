import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_SECTIONS, KNOWN_VIEWS, sectionOf, sectionEntry, resolveView, visibleTabs, renderSectionTabs, tabKey, fullNavOn } from './nav-sections.mjs';

test('seven sections show by default; Documentos is full-nav only', () => {
  assert.deepEqual(NAV_SECTIONS.filter(s => !s.fullNavOnly).map(s => s.label), ['Inicio', 'Tienda', 'Pedidos', 'Cobrar', 'Dinero', 'Clientes', 'Ajustes']);
  assert.deepEqual(NAV_SECTIONS.filter(s => s.fullNavOnly).map(s => s.id), ['documentos']);
});

test('every tab key belongs to exactly one section', () => {
  const keys = NAV_SECTIONS.flatMap(s => s.tabs.map(tabKey));
  assert.equal(new Set(keys).size, keys.length);
});

test('every view the dashboard opens today is known', () => {
  for (const view of ['overview', 'growth', 'stores', 'workspace', 'templates', 'products', 'media', 'charge-links', 'inbox', 'payments', 'subscriptions', 'payouts', 'cobros', 'proposals', 'contracts', 'marketing', 'abandoned-carts', 'assistant', 'experiments', 'integrations', 'compliance', 'connect-ai', 'store-settings', 'account']) {
    assert.ok(KNOWN_VIEWS.has(view), view);
  }
});

test('sectionOf maps views and marketing tabs', () => {
  assert.equal(sectionOf('payments').section.id, 'pedidos');
  assert.equal(sectionOf('marketing', 'emails').section.id, 'clientes');
  assert.equal(sectionOf('marketing', 'staff').section.id, 'ajustes');
  assert.equal(sectionOf('marketing', 'domain').tab.label, 'Remitente');
  assert.equal(sectionOf('marketing', 'nope').section.id, 'clientes');
  assert.equal(sectionOf('account').section.id, 'ajustes');
  assert.equal(sectionOf('account').tab, null);
});

test('resolveView sends hidden and unknown views to Inicio', () => {
  assert.equal(resolveView('contracts', false), 'overview');
  assert.equal(resolveView('contracts', true), 'contracts');
  assert.equal(resolveView('payments', false), 'payments');
  assert.equal(resolveView('nope', true), 'overview');
  assert.equal(resolveView('', false), 'overview');
});

test('visibleTabs drops full-nav-only and hidden views', () => {
  const clientes = NAV_SECTIONS.find(s => s.id === 'clientes');
  assert.ok(!visibleTabs(clientes, { fullNav: false }).some(t => t.marketingTab === 'logs'));
  assert.ok(visibleTabs(clientes, { fullNav: true }).some(t => t.marketingTab === 'logs'));
  const tienda = NAV_SECTIONS.find(s => s.id === 'tienda');
  assert.ok(!visibleTabs(tienda, { fullNav: false, hiddenViews: new Set(['templates']) }).some(t => t.view === 'templates'));
});

test('renderSectionTabs marks the active pill and skips single-tab sections', () => {
  const pedidos = NAV_SECTIONS.find(s => s.id === 'pedidos');
  const html = renderSectionTabs(pedidos, pedidos.tabs[1], { fullNav: false });
  assert.match(html, /<button type="button" class="section-tab" data-section-view="inbox" aria-current="page">Mensajes<\/button>/);
  assert.match(html, /data-section-view="payments">Pedidos</);
  const clientes = NAV_SECTIONS.find(s => s.id === 'clientes');
  assert.match(renderSectionTabs(clientes, clientes.tabs[0], { fullNav: false }), /data-section-view="marketing" data-section-marketing-tab="emails" aria-current="page"/);
  assert.equal(renderSectionTabs(NAV_SECTIONS.find(s => s.id === 'cobrar'), null, { fullNav: false }), '');
});

test('fullNavOn reads the html attribute', () => {
  assert.equal(fullNavOn({ documentElement: { hasAttribute: name => name === 'data-full-nav' } }), true);
  assert.equal(fullNavOn({ documentElement: { hasAttribute: () => false } }), false);
  assert.equal(fullNavOn(undefined), false);
});

test('sectionEntry is the first tab a sidebar link opens', () => {
  assert.deepEqual(sectionEntry('clientes'), { view: 'marketing', marketingTab: 'emails', label: 'Correos' });
  assert.equal(sectionEntry('ajustes').view, 'store-settings');
  assert.equal(sectionEntry('nope'), null);
});

test('Tienda opens on Productos: Diseño is full screen and would hide the pills', () => {
  assert.equal(sectionEntry('tienda').view, 'products');
});
