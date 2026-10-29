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
  // Starter-only entries are Vitrina's; Esencial's own catalogue is what its dice roll.
  assert.equal(esencial.master.palettes.filter(p => !p.starterOnly).length, 16);
  assert.equal(esencial.master.fonts.filter(f => !f.starterOnly).length, 14);
  assert.equal(esencial.master.variants.hero.length, 10);
  assert.equal(esencial.master.sections.length, 12);
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

test('every colour band option has its own styles, and the bands repaint the colour tokens', () => {
  const css = file('styles/globals.css');
  for (const id of esencial.master.variants.bands) assert.match(css, new RegExp(`data-es-bands="${id}"`), `bands ${id}`);
  for (const tone of ['paper', 'muted', 'deep', 'accent']) assert.match(css, new RegExp(`data-es-band="${tone}"\\]\\{--es-band-bg`), tone);
  assert.match(file('components/home.tsx'), /data-es-bands=\{bands\}/);
});

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

test('every catalogued business section and look detail has its own styles', () => {
  const css = file('styles/globals.css');
  for (const id of esencial.master.sections) assert.match(css, new RegExp(`data-es-section="${id}"`), `section ${id}`);
  for (const part of ['button', 'corners', 'density', 'texture', 'photos']) for (const id of esencial.master.variants[part]) assert.match(css, new RegExp(`data-es-${part}="${id}"`), `${part} ${id}`);
});

test('the home renders the business sections from store-data and the shell carries the look details', () => {
  assert.match(file('components/home.tsx'), /sections\.map\(/);
  assert.match(file('components/home.tsx'), /data-es-section=\{/);
  const shell = file('components/Shell.tsx');
  for (const part of ['button', 'corners', 'density', 'texture', 'photos']) assert.match(shell, new RegExp(`data-es-${part}=\\{`), part);
});

test('duotone never touches the product page gallery', () => {
  assert.doesNotMatch(file('styles/globals.css'), /data-es-photos="duotone"\][^{]*es-pdp/);
});

test('product photos keep their true colours and the underline button stays readable on photos', () => {
  const css = file('styles/globals.css');
  assert.doesNotMatch(css, /data-es-photos="duotone"\][^{]*es-card/);
  assert.doesNotMatch(css, /data-es-button="underline"\][^{]*es-btn--accent\{color:var\(--es-accent\)/);
});

test('no photo shows twice in one block (live check 2026-10-19: the same photo in the pair story, the pick and the gallery)', () => {
  const home = file('components/home.tsx');
  assert.match(home, /const unique = /);
  assert.match(home, /rolledStory === 'pair' && \(!photos\.p1 \|\| photos\.p1 === photos\.story\)/);
  assert.match(home, /const gallery = unique\(/);
  assert.match(home, /const heroPhotos = unique\(/);
});

test('review fix: the overlay card stays readable in the list grid', () => {
  assert.match(file('styles/globals.css'), /\.es-grid\[data-es-grid="list"\] \.es-card\[data-es-card="overlay"\] :is\(\.es-card__name,\.es-card__price/);
});

test('review fix: the centered header falls back to the classic layout on phones', () => {
  const css = file('styles/globals.css');
  assert.doesNotMatch(css, /^\.es-header\[data-es-header="centered"\]/m);
  assert.match(css, /@media \(min-width:761px\)\{\s*\.es-header\[data-es-header="centered"\]/);
});

test('Esencial rolls card and offer styles, and its card fills the kit fields (showcase commerce)', () => {
  assert.deepEqual(esencial.master.variants.cards, ['showcase', 'compact', 'split', 'fashion']);
  assert.deepEqual(esencial.master.variants.offers, ['steps', 'grid', 'rows']);
  const home = file('components/home.tsx');
  for (const field of ['eyebrow', 'points', 'chips', 'deal', 'save']) assert.match(home, new RegExp(`data-product-field="${field}"`), field);
  assert.match(home, /data-es-cards=\{/);
  const css = file('styles/globals.css');
  for (const id of esencial.master.variants.cards) assert.match(css, new RegExp(`data-es-cards="${id}"`), id);
  assert.match(css, /--store-foreground:var\(--es-ink\)/);
});

// Owner 2026-10-22 (NOA VARGAS #3): «this button is all blacked out». Dashed buttons are transparent with the band's own
// colour, but the accent/dark/newsletter closing bands painted .es-btn--light's background after the dashed rule had made
// its text inherit the same colour: black on black. Inside the hero and the closing band, dashed must also own the background.
test('a dashed button stays transparent in the hero and every closing band', () => {
  const css = file('styles/globals.css');
  const rule = css.match(/\.es\[data-es-button="dashed"\] \.es-hero \.es-btn,\.es\[data-es-button="dashed"\] \.es-closing \.es-btn\{([^}]*)\}/);
  assert.ok(rule, 'the dashed hero/closing rule exists');
  assert.match(rule[1], /background:transparent/);
  assert.match(rule[1], /color:inherit/);
});

// Owner 2026-10-27: the closing banner never repeats the hero photo; with no unused photo it is the coloured band.
test('the closing photo is never the hero photo', () => {
  const { templateSourceFiles } = require('../index.js');
  const home = templateSourceFiles('esencial').find(file => file.path === 'components/home.tsx').content;
  assert.doesNotMatch(home, /es-closing__photo" src=\{photos\.hero\}/);
  // 2026-10-29: through taken(), which also excludes the hero, the story and the feature bands' photos.
  assert.match(home, /closingPhoto = unique\(\[photos\.p4, photos\.p3, photos\.p2\]\)\.find\(src => !taken\(src\)/);
  assert.match(home, /const taken = \(src: string \| undefined\) => !src \|\| src === photos\.hero \|\| src === photos\.story/);
});

test('a store with a video plays it as the cover, muted and looping, still for reduced motion (owner 2026-10-25)', () => {
  const home = file('components/home.tsx');
  assert.match(home, /<video[^>]*src=\{photos\.heroVideo\}/);
  assert.match(home, /autoPlay muted loop playsInline poster=\{photos\.hero\}/);
  assert.match(home, /prefers-reduced-motion: reduce/);
});

// Final review 2026-10-29: fixes made after Oct 22 that the template swap must keep — refills rewrite a built store's sections block
// from the template, so a lost fix would also reach stores built Oct 27–29.
test('capsule cards keep a readable width (Oct 27 fix), never three squeezed staggered columns', () => {
  const css = file('styles/globals.css');
  assert.match(css, /\.es-capsule__cards\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(210px,1fr\)\)/);
  assert.doesNotMatch(css, /\.es-capsule__cards>:nth-child\(3\)\{margin-top:112px\}/);
});

test('a centered header keeps its inline links in the menu, never under the centered logo (DooBoo 2026-10-28)', () => {
  assert.match(file('styles/globals.css'), /\.es-header\[data-es-header="centered"\] \.es-header__links\{display:none\}/);
});

test('the sign-in and account pages wear the store\'s fonts and colours (config.accountTheme split)', () => {
  const css = file('styles/globals.css');
  assert.match(css, /\.es \[data-account-gate\] \[data-part=title\]\{font-family:var\(--es-heading\)/);
  assert.match(css, /\.es \[data-account-gate\] \[data-part=submit\]\{[^}]*background:var\(--es-accent\)/);
});

// One build path live check 2026-10-29: the home grid drew every product (NOA 11) and one photo appeared twice on 4 of 5 stores.
test('the home grid shows at most two rows, «Ver todo» has the rest', () => {
  assert.match(file('components/home.tsx'), /data-pagosya-catalog data-catalog-limit=\{homeLimit\}/);
  assert.match(file('components/home.tsx'), /const homeLimit = .*grid3.* \? 6 : 8/);
});

test('no photo twice on the home: business sections skip the photos the feature bands and each other already show', () => {
  const home = file('components/home.tsx');
  assert.match(home, /import \{[^}]*\bfeatures\b[^}]*\} from '\.\/store-data'/);
  assert.match(home, /const bandPhotos: string\[\] = /);
  assert.match(home, /const pickPhoto = unique\(\[photos\.p1, photos\.p2, photos\.p3, photos\.p4\]\)\.find\(src => !taken\(src\)\)/);
  assert.match(home, /const statementPhoto = unique\(\[photos\.p2, photos\.p4, photos\.p1, photos\.p3\]\)\.find\(src => !taken\(src\) && src !== pickPhoto && src !== notePhoto\)/);
});
