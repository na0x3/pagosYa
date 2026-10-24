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
