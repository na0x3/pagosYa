import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsLine, importStep, parseExchangeRate, progressLabel } from './store-import.mjs';

test('the dialog step follows the import and its design build', () => {
  assert.equal(importStep({ status: 'REVIEW' }), 'review');
  assert.equal(importStep({ status: 'QUEUED' }), 'importing');
  assert.equal(importStep({ status: 'RUNNING' }), 'importing');
  assert.equal(importStep({ status: 'FAILED' }), 'failed');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: null }), 'design');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'FAILED' }), 'design');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'RUNNING' }), 'building');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'COMPLETED' }), 'done');
});

test('counts read like Bolivian Spanish and skip empty kinds', () => {
  assert.equal(countsLine({ products: 48, variants: 112, collections: 6, pages: 3, policies: 4, photos: 1210 }), '48 productos · 112 variantes · 6 colecciones · 3 páginas · 4 políticas · 1.210 fotos');
  assert.equal(countsLine({ products: 1, variants: 1, collections: 0, pages: 0, policies: 0, photos: 1 }), '1 producto · 1 variante · 1 foto');
});

test('progress and exchange rate', () => {
  assert.equal(progressLabel({ stage: 'photos', done: 30, total: 120 }), 'Copiando fotos: 30 de 120');
  assert.equal(progressLabel({ stage: 'catalog' }), 'Creando productos, colecciones y páginas…');
  assert.equal(progressLabel({}), 'En cola…');
  assert.equal(parseExchangeRate('6,96'), 6.96);
  assert.equal(parseExchangeRate(' 6.96 '), 6.96);
  assert.equal(parseExchangeRate('0'), null);
  assert.equal(parseExchangeRate('abc'), null);
});
