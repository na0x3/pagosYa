import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const templates = require('../index.js');

// Plantillas presets (owner 2026-10-22): the gallery is now looks of Esencial, one or more per kind of business.
const presets = () => templates.loadTemplates().filter(entry => entry.manifest.preset);

test('the gallery shows only presets, and the old templates are hidden but still resolve', () => {
  const gallery = templates.galleryTemplates();
  assert.ok(gallery.length >= 12, `${gallery.length} in the gallery`);
  for (const manifest of gallery) assert.ok(manifest.preset && manifest.extends === 'esencial' && manifest.curated, `${manifest.id} is not a curated Esencial preset`);
  for (const id of ['obra', 'urbano', 'atelier', 'tostado']) assert.equal(templates.templateManifest(id)?.hidden, true, `${id} stays resolvable and hidden`);
});

test('presets cover the kinds of business the owner asked for', () => {
  const byCategory = presets().reduce((counts, { manifest }) => ({ ...counts, [manifest.category]: (counts[manifest.category] || 0) + 1 }), {});
  for (const [category, least] of Object.entries({ moda: 2, comida: 2, tecnologia: 2, construccion: 1, ninos: 1 })) assert.ok((byCategory[category] || 0) >= least, `${category}: ${byCategory[category] || 0}`);
});

test('a preset has no source of its own, its demo photos fill every Esencial photo slot, and the looks differ', () => {
  const esencial = templates.templateSourceFiles('esencial').map(file => file.path).join();
  const slots = templates.templateManifest('esencial').photos.map(photo => photo.slot).sort().join();
  const looks = new Set();
  for (const { dir, manifest } of presets()) {
    assert.equal(templates.templateSourceFiles(manifest.id).map(file => file.path).join(), esencial, `${manifest.id} reads Esencial's source`);
    assert.equal(manifest.photos.map(photo => photo.slot).sort().join(), slots, `${manifest.id} photo slots`);
    for (const photo of manifest.photos) assert.ok(statSync(join(dir, 'demo', photo.demo)).size <= templates.DEMO_MAX_BYTES, `${manifest.id}/${photo.demo}`);
    const look = [manifest.preset.palette, manifest.preset.fonts, manifest.preset.variants.hero, manifest.preset.variants.cards].join('/');
    assert.ok(!looks.has(look), `${manifest.id} repeats another preset's look ${look}`);
    looks.add(look);
  }
});

test('a preset may only name what its master offers', () => {
  assert.throws(() => templates.loadTemplates(join(import.meta.dirname, 'fixtures', 'bad-preset')), /preset\.palette|preset\.variants|extends/);
});
