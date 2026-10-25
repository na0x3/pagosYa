import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Spec 2026-10-19 §5.1 hid Plantillas; spec 2026-10-20 brought it back behind the API flag; spec 2026-10-21 made it a Tienda pill.
test('the Plantillas pill shows only with the flag', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /api\("\/store-templates\/settings"\)/);
  assert.match(js, /hiddenViews: plantillasOn \? new Set\(\) : new Set\(\["templates"\]\)/);
});

test('a product double-clicked in the Studio preview opens its editor', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /event\.data\.view === "products" && typeof event\.data\.productId === "string"/);
});
