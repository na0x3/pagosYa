import test from 'node:test';
import assert from 'node:assert/strict';
import { WALKTHROUGH_STEPS, nextState, productDrafts, walkthroughView } from './onboarding-walkthrough.mjs';

const start = { step: 0, values: {}, storeId: null, busy: false, error: null };

test('seven steps, only the first two required', () => {
  assert.deepEqual(WALKTHROUGH_STEPS.map(s => s.id), ['name', 'what', 'logo', 'photos', 'products', 'story', 'contact']);
  assert.deepEqual(WALKTHROUGH_STEPS.filter(s => !s.optional).map(s => s.id), ['name', 'what']);
});

test('cannot advance a required step while empty; optional steps can be skipped', () => {
  assert.equal(nextState(start, { type: 'next' }).error, 'Escribe el nombre de tu negocio.');
  const named = nextState(nextState(start, { type: 'field', name: 'name', value: 'Café Buna' }), { type: 'next' });
  assert.equal(named.step, 1);
  assert.equal(nextState({ ...named, step: 2 }, { type: 'skip' }).step, 3);
  assert.equal(nextState(start, { type: 'skip' }).step, 0);
  assert.equal(nextState(named, { type: 'back' }).step, 0);
});

test('one question per screen with progress, Atrás, Siguiente and Saltar only when optional', () => {
  const html = walkthroughView({ ...start, step: 2, values: { name: 'Café Buna' } });
  assert.match(html, /aria-valuenow="3"/);
  assert.match(html, /Saltar/);
  assert.match(html, /No tengo, YAPI te hace uno/);
  assert.doesNotMatch(walkthroughView(start), /Saltar/);
  assert.match(walkthroughView(start), /¿Vienes de Shopify\?/);
  assert.match(walkthroughView({ ...start, step: 6 }), /Crear mi tienda/);
  assert.doesNotMatch(walkthroughView({ ...start, values: { name: '"><img src=x>' } }), /<img src=x>/);
});

test('product rows become centavos and incomplete rows are dropped', () => {
  assert.deepEqual(productDrafts([{ name: 'Café molido', price: 'Bs 45' }, { name: 'Taza', price: '35,50', imageUrl: '/v1/uploads/t.webp' }, { name: '', price: '10' }, { name: 'Sin precio', price: '' }]),
    [{ name: 'Café molido', amount: 4500, imageUrls: [] }, { name: 'Taza', amount: 3550, imageUrls: ['/v1/uploads/t.webp'] }]);
  assert.equal(productDrafts(Array.from({ length: 9 }, (_, i) => ({ name: `P${i}`, price: '1' }))).length, 5);
  assert.deepEqual(productDrafts([{ name: 'Mil', price: '1.200' }]), [{ name: 'Mil', amount: 120000, imageUrls: [] }]);
});
