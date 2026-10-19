import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');
const esencial = templates.templateManifest('esencial');
const source = templates.templateSourceFiles('esencial');
const file = path => source.find(f => f.path === path)?.content ?? '';

test('esencial is the hidden master template', () => {
  assert.equal(esencial.hidden, true);
  assert.equal(esencial.master.palettes.length, 8);
  assert.equal(esencial.master.fonts.length, 8);
  assert.deepEqual(esencial.photos.map(p => p.slot), ['hero', 'story', 'p1', 'p2', 'p3', 'p4']);
  assert.ok(!templates.galleryTemplates().some(t => t.id === 'esencial'));
});

test('no emoji and no icon outside icons.tsx', () => {
  for (const { path, content } of source) {
    assert.doesNotMatch(content, /\p{Extended_Pictographic}/u, `${path} has an emoji`);
    if (path !== 'components/icons.tsx') assert.doesNotMatch(content, /<svg/, `${path} draws its own icon`);
  }
});

test('every merchant-visible sentence comes from store-data', () => {
  const home = file('components/home.tsx');
  for (const field of ['eyebrow', 'headline', 'subcopy', 'primaryCta', 'secondaryCta', 'productsTitle', 'storyTitle', 'storyBody', 'closingLine', 'closingCta']) assert.match(home, new RegExp(`copy\\.${field}\\b`), `home misses copy.${field}`);
  assert.match(home, /copy\.values\.map/);
  assert.match(file('components/Shell.tsx'), /copy\.announcement/);
});

test('headings never break words anywhere and the theme block is platform-written', () => {
  const css = file('styles/globals.css');
  assert.doesNotMatch(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /pagosya:master-theme/);
  for (const name of ['paper', 'ink', 'muted', 'accent', 'deep', 'on-accent', 'heading', 'body']) assert.match(css, new RegExp(`var\\(--es-${name}\\)`));
});
