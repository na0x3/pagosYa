import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loadTemplates, readTemplateSource } = require('../index.js');
const root = join(import.meta.dirname, 'fixtures', 'starters');

// Starters (spec 2026-10-24): a finished store a new store starts from, with its own files beside the master it extends.
test('a starter with extends keeps its own source files', () => {
  const own = loadTemplates(root).find(entry => entry.manifest.id === 'dulce');
  assert.equal(own.manifest.starter.fits.includes('postres'), true);
  assert.deepEqual(readTemplateSource(own.dir).map(file => file.path), ['components/home.tsx', 'components/store-data.tsx', 'styles/globals.css']);
});

test('a starter needs a description and at least three fit words', () => {
  assert.throws(() => loadTemplates(join(import.meta.dirname, 'fixtures', 'starters-bad')), /starter/);
});

// Review Focus 1–2 (plan 2026-10-24): nothing a new store cannot have — a source store's uploads, photos, video or record ids.
test('no starter carries a store’s own uploads or record ids', () => {
  const { listStarters, templateSourceFiles } = require('../index.js');
  for (const manifest of listStarters()) {
    for (const file of templateSourceFiles(manifest.id)) {
      assert.doesNotMatch(file.content, /\/v1\/uploads\/|\bassets\/(?:image|video)-[\w-]+\.\w+/, `${manifest.id} ${file.path}`);
      assert.doesNotMatch(file.content, /(?<![\w-])c[a-z0-9]{24}(?![\w-])/, `${manifest.id} ${file.path}`);
    }
  }
});

test('vitrina is a slots starter that fills every text', () => {
  const { templateManifest } = require('../index.js');
  const vitrina = templateManifest('vitrina');
  assert.equal(vitrina.extends, undefined);
  assert.ok(vitrina.copy.length > 40);
  assert.equal(vitrina.curated, true);
});
