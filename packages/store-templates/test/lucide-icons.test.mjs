import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../../apps/api/package.json'));
const lucideDir = join(dirname(require.resolve('lucide-static/package.json')), 'icons');
const icons = readFileSync(join(here, '../templates/esencial/components/icons.tsx'), 'utf8');

// Spec 2026-10-19 §1.6: Esencial's icons are Lucide's own paths, unchanged.
test('every generated icon carries the exact Lucide geometry', () => {
  for (const [component, file] of [['IconShoppingBag', 'shopping-bag'], ['IconMenu', 'menu'], ['IconLogIn', 'log-in'], ['IconSearch', 'search']]) {
    const start = icons.indexOf(`export function ${component}(`);
    assert.ok(start >= 0, `${component} is missing`);
    const block = icons.slice(start, icons.indexOf('</svg>', start));
    for (const d of [...readFileSync(join(lucideDir, `${file}.svg`), 'utf8').matchAll(/ d="([^"]+)"/g)].map(m => m[1])) assert.ok(block.includes(`d="${d}"`), `${component} misses ${d}`);
  }
});

test('icons are thin, decorative and credit Lucide', () => {
  assert.match(icons, /Lucide.*ISC/);
  assert.doesNotMatch(icons, /strokeWidth=\{2\}/);
  assert.match(icons, /strokeWidth=\{1\.5\}/);
  assert.match(icons, /aria-hidden="true"/);
});
