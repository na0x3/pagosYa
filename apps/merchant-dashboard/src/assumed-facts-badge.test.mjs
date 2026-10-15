import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assumedFactsBadge } from './assumed-facts-badge.mjs';

test('names the facts waiting on a store, and nothing when there are none (spec 2026-10-14 store voice)', () => {
  assert.equal(assumedFactsBadge(1), '<span class="store-card-status" data-status="assumed">1 dato por confirmar</span>');
  assert.equal(assumedFactsBadge(3), '<span class="store-card-status" data-status="assumed">3 datos por confirmar</span>');
  for (const none of [0, undefined, null, 'x', -2, 1.5]) assert.equal(assumedFactsBadge(none), '');
});

test('the store cards show the badge, and the dashboard refresh loads the counts', () => {
  const panel = readFileSync(new URL('./stores-panel.mjs', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
  assert.match(panel, /assumedFactsBadge\(assumedFactCounts\[store\.id\]\)/);
  assert.match(panel, /api\("\/assumed-facts\/counts"\)/);
  assert.match(panel, /return \{[^}]*loadAssumedFactCounts[^}]*\}/);
  assert.match(dashboard, /renderStoreRows\(stores\);\s*void storesPanel\.loadAssumedFactCounts\(\);/);
});
