import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Plantillas was removed from the dashboard (owner 2026-10-25): no tab, no page, no import option.
test('the dashboard has no Plantillas section', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('./nav-sections.mjs', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(nav, /label: "Plantillas"/);
  assert.doesNotMatch(html, /storeTemplatesFrame|data-design="template"/);
  assert.match(js, /view === "templates"\) view = "workspace"/);
});

test('a product double-clicked in the Studio preview opens its editor', () => {
  const js = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(js, /event\.data\.view === "products" && typeof event\.data\.productId === "string"/);
});
