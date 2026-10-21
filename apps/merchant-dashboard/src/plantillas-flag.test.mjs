import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Spec 2026-10-19 §5.1 hid Plantillas; spec 2026-10-20 brings the menu entry back, hidden until the API flag says on.
test('the Plantillas menu entry ships hidden and the dashboard shows it only with the flag', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<a [^>]*data-dashboard-view="templates" id="dashboardTemplatesNav" hidden>/);
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /api\("\/store-templates\/settings"\)/);
  assert.match(js, /document\.getElementById\("dashboardTemplatesNav"\)\.hidden = !plantillasOn;/);
  assert.match(js, /\.\.\.\(plantillasOn \? \{ onTemplates:/);
});

test('a product double-clicked in the Studio preview opens its editor', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /event\.data\.view === "products" && typeof event\.data\.productId === "string"/);
});
