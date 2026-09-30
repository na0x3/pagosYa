import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');

// The runtime fills this slot with links to the store's information pages (spec 2026-09-30-store-content-pages-design).
test('every template footer has exactly one information nav slot, inside the footer', () => {
  for (const { dir, manifest } of templates.loadTemplates()) {
    const source = readFileSync(join(dir, 'components', 'Shell.tsx'), 'utf8');
    assert.equal(source.match(/data-pagosya-pages/g)?.length ?? 0, 1, `${manifest.id}: needs exactly one data-pagosya-pages slot`);
    const footer = source.slice(source.indexOf('export function Footer'));
    assert.ok(footer.indexOf('data-pagosya-pages') < footer.indexOf('</footer>'), `${manifest.id}: the slot must sit inside the footer`);
  }
});
