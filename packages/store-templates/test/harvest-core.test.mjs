import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvestFiles } from '../tools/harvest-core.mjs';

// Spec 2026-10-24 §1 Harvesting: a store's own source becomes a starter only once nothing names the store or its uploads.
const brand = ['PEPPA please', 'Sopocachi', '+591 70000000'];

test('keeps only components and the global stylesheet', () => {
  const { files } = harvestFiles({ files: [{ path: 'components/home.tsx', content: 'x' }, { path: 'config.js', content: 'y' }, { path: 'styles/globals.css', content: 'z' }, { path: 'assets/image-1.jpg', content: '' }], brand, replacements: {} });
  assert.deepEqual(files.map(f => f.path), ['components/home.tsx', 'styles/globals.css']);
});

test('finds brand words in CSS content and alt text', () => {
  const { findings } = harvestFiles({ files: [{ path: 'styles/globals.css', content: '.seal::after{content:"peppa please"}' }, { path: 'components/home.tsx', content: '<img alt="Tienda en Sopocachi" />' }], brand, replacements: {} });
  assert.deepEqual(findings.map(f => [f.path, f.kind]).sort(), [['components/home.tsx', 'brand'], ['styles/globals.css', 'brand']]);
});

test('flags store-only asset paths but not fonts', () => {
  const { findings } = harvestFiles({ files: [{ path: 'components/home.tsx', content: '<img src="assets/image-ab12.jpg" /><img src="/v1/uploads/x.png" /><link href="assets/fonts/a.woff2" />' }], brand, replacements: {} });
  assert.deepEqual(findings.map(f => f.kind), ['asset', 'asset']);
});

test('replacements run before the scan', () => {
  const { files, findings } = harvestFiles({ files: [{ path: 'components/home.tsx', content: '<h2>Lo nuevo de PEPPA please</h2>' }], brand, replacements: { 'Lo nuevo de PEPPA please': 'Lo nuevo de la casa' } });
  assert.equal(files[0].content, '<h2>Lo nuevo de la casa</h2>');
  assert.equal(findings.length, 0);
});

test('brand words match whole words only', () => {
  const { findings } = harvestFiles({ files: [{ path: 'components/home.tsx', content: '<p>Pasapeppa pleasea</p>' }], brand: ['PEPPA please'], replacements: {} });
  assert.equal(findings.length, 0);
});

test('drops the generated store-data file', () => {
  const { files } = harvestFiles({ files: [{ path: 'components/store-data.tsx', content: 'export const store = {};' }, { path: 'components/home.tsx', content: 'x' }], brand, replacements: {} });
  assert.deepEqual(files.map(f => f.path), ['components/home.tsx']);
});

test('catalogue font files are not store uploads', () => {
  const { findings } = harvestFiles({ files: [{ path: 'styles/globals.css', content: "@font-face{src:url('/assets/fredoka.ttf')}" }], brand, replacements: {} });
  assert.equal(findings.length, 0);
});

test('flags hard-coded product, category and collection ids', () => {
  const { findings } = harvestFiles({ files: [{ path: 'components/home.tsx', content: '<div data-pagosya-catalog data-products="cmvgxe4hl0010f63cubps5p82,cmvgxe4ge000yf63ctbyeo5k9" /><div data-category="cmvgxe4dk000uf63ct8vi4l36" />' }], brand, replacements: {} });
  assert.deepEqual(findings.map(f => f.kind), ['id', 'id', 'id']);
});
