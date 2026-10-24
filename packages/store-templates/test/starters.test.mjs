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

// Task 1's own-source rule, pinned once a starter that extends Esencial exists (plan ruling 2026-10-24).
test('a starter that extends Esencial builds from its own files, a preset still from Esencial’s', () => {
  const { templateSourceFiles, templateManifest } = require('../index.js');
  const home = id => templateSourceFiles(id).find(file => file.path === 'components/home.tsx').content;
  assert.equal(templateManifest('taller').extends, 'esencial');
  assert.match(home('taller'), /es-firma/);
  assert.doesNotMatch(home('esencial'), /es-firma/);
  const preset = require('../index.js').listTemplates().find(manifest => manifest.preset && !manifest.starter);
  assert.equal(home(preset.id), home('esencial'));
});

// Starter dice (spec 2026-10-24-starter-dice §1): each varying part lists 2–4 ids; only a starter that extends a master rolls.
test('a starter dice list needs 2–4 ids per part and a master to extend', () => {
  assert.throws(() => loadTemplates(join(import.meta.dirname, 'fixtures', 'starters-dice-bad')), /starter\.dice/);
});

test('every dice id of a real starter exists in Esencial, and starter-only entries never sit in a preset', () => {
  const { listTemplates, templateManifest } = require('../index.js');
  const master = templateManifest('esencial').master;
  for (const manifest of listTemplates().filter(m => m.starter?.dice)) {
    const { palettes = [], fonts = [], ...parts } = manifest.starter.dice;
    for (const [part, ids] of Object.entries(parts)) for (const id of ids) assert.ok(master.variants[part]?.includes(id), `${manifest.id}: ${part}:${id}`);
    for (const id of palettes) assert.ok(master.palettes.some(p => p.id === id), `${manifest.id}: palette ${id}`);
    for (const id of fonts) assert.ok(master.fonts.some(f => f.id === id), `${manifest.id}: fonts ${id}`);
  }
  const starterOnly = new Set([...master.palettes, ...master.fonts].filter(entry => entry.starterOnly).map(entry => entry.id));
  for (const manifest of listTemplates().filter(m => m.preset && !m.starter)) {
    assert.ok(!starterOnly.has(manifest.preset.palette) && !starterOnly.has(manifest.preset.fonts), manifest.id);
  }
});
