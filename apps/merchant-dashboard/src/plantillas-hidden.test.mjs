import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Spec 2026-10-19 §5.1: the Plantillas section is removed for now (the page and API stay so it can come back).
test('the dashboard menu has no Plantillas entry', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /data-dashboard-view="templates"/);
});
