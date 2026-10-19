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
  assert.equal(esencial.master.palettes.length, 16);
  assert.equal(esencial.master.fonts.length, 14);
  assert.equal(esencial.master.variants.hero.length, 10);
  assert.equal(esencial.master.sections.length, 10);
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

test('the product card carries every hook the kit needs (else the catalog falls back to its plain card)', () => {
  const card = file('components/home.tsx').match(/<template data-pagosya-product-template>([\s\S]*?)<\/template>/)?.[1] ?? '';
  for (const hook of ['data-product-field="name"', 'data-product-field="price"', 'data-product-link', 'data-product-add']) assert.ok(card.includes(hook), `card misses ${hook}`);
});

test('on a phone the hero text sits on an even shade, not on the light side of the photo (live check)', () => {
  const css = file('styles/globals.css');
  const phone = css.slice(css.indexOf('@media (max-width:760px)'));
  assert.match(phone, /\.es-hero::after\{background:linear-gradient\(0deg/);
});

const variantRules = part => test(`every catalogued ${part} variant has its own styles`, () => {
  const css = file('styles/globals.css');
  for (const id of esencial.master.variants[part]) assert.match(css, new RegExp(`data-es-${part}="${id}"`), `${part} ${id} has no styles`);
});
for (const part of ['header', 'announce', 'hero']) variantRules(part);

test('every header variant keeps the login link (login comes with every store)', () => {
  const css = file('styles/globals.css');
  assert.doesNotMatch(css, /data-es-header="[a-z]+"\][^{]*\.es-header__end a\{display:none/);
});
for (const part of ['grid', 'card', 'story', 'values', 'closing', 'footer']) variantRules(part);

test('every card variant keeps the kit hooks', () => {
  const home = file('components/home.tsx');
  for (const hook of ['data-product-link', 'data-product-field="name"', 'data-product-field="price"', 'data-product-add']) assert.ok(home.includes(hook), hook);
  assert.match(home, /data-es-card=\{/);
});
for (const part of ['pdp']) variantRules(part);

test('the product page reads its layout and section order from the roll, and keeps every kit slot', () => {
  const page = file('components/product.tsx');
  assert.match(page, /data-es-pdp=\{/);
  assert.match(page, /data-es-pdp-order=\{/);
  for (const slot of ['breadcrumb', 'gallery', 'title', 'rating', 'pricing', 'description', 'buy', 'highlights', 'delivery', 'info', 'reviews', 'related']) assert.match(page, new RegExp(`name="${slot}"`), slot);
  const css = file('styles/globals.css');
  for (const order of esencial.master.variants.pdpOrder) assert.match(css, new RegExp(`data-es-pdp-order="${order}"`), order);
});
