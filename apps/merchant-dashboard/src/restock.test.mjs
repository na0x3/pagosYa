import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lowStock, renderRestock } from './restock.mjs';

const link = (id, name, stock, extra = {}) => ({ id, name, status: 'ACTIVE', stock, ...extra });

test('lists active products at or under 3 units, the emptiest first, at most five', () => {
  const items = lowStock([
    link('a', 'Taza', 2), link('b', 'Plato', 0), link('c', 'Vaso', 10), link('d', 'Jarra', null),
    link('e', 'Bol', 1, { status: 'ARCHIVED' }), link('f', 'Mate', 3), link('g', 'Tetera', 1), link('h', 'Cuchara', 2), link('i', 'Tenedor', 0),
  ]);
  assert.deepEqual(items.map(i => i.id), ['b', 'i', 'g', 'a', 'h']);
});

test('a product with variants is listed by the variant that is running out', () => {
  const items = lowStock([link('v', 'Polera', undefined, { variants: [{ id: 'v1', name: 'M', stock: 8 }, { id: 'v2', name: 'L', stock: 1 }, { id: 'v3', name: 'XL', stock: null }] })]);
  assert.deepEqual(items, [{ id: 'v', name: 'Polera · L', stock: 1 }]);
});

test('the card says what is left, escapes names, and is empty when nothing runs low', () => {
  assert.equal(renderRestock([]), '');
  const html = renderRestock([{ id: 'x"1', name: '<b>Taza</b>', stock: 0 }, { id: 'y', name: 'Plato', stock: 2 }]);
  assert.match(html, /<h2[^>]*>Por reponer<\/h2>/);
  assert.match(html, /&lt;b&gt;Taza&lt;\/b&gt;/);
  assert.match(html, /Agotado/);
  assert.match(html, /Quedan 2/);
  assert.match(html, /data-restock-id="x&quot;1"/);
});

test('Inicio shows the card and «Reponer» opens the product at its stock step', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(html, /<section class="panel overview-restock" id="overviewRestock" aria-labelledby="overviewRestockTitle" hidden><\/section>/);
  assert.match(js, /setPaymentLinks: \(links\) => \{ lastPaymentLinks = links; showRestock\(links\); \},/);
  assert.match(js, /editProductById\(button\.dataset\.restockId, "stock"\)/);
});

test('the card sits after Primeros pasos and Tu cuenta, across the row', () => {
  const css = readFileSync(new URL('./premium.css', import.meta.url), 'utf8');
  assert.match(css, /body\.is-logged-in \.overview-restock \{ grid-column: 1 \/ -1; order: 3; \}/);
});
