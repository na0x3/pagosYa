import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const templates = require('../index.js');

test('lists the seed template with its manifest', () => {
  const list = templates.listTemplates();
  assert.ok(list.some(t => t.id === 'aurora'));
  const aurora = templates.templateManifest('aurora');
  assert.equal(aurora.sitePurpose, 'shop');
  assert.ok(templates.TEMPLATE_CATEGORIES.includes(aurora.category));
});

test('an id that is not a plain slug is never read', () => {
  assert.equal(templates.templateManifest('../aurora'), undefined);
  assert.equal(templates.templateManifest('aurora/../../x'), undefined);
  assert.deepEqual(templates.templateSourceFiles('../aurora'), []);
});

test('a manifest with an unknown category is rejected naming the template and field', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  mkdirSync(join(root, 'bad', 'components'), { recursive: true });
  writeFileSync(join(root, 'bad', 'template.json'), JSON.stringify({ id: 'bad', name: 'Bad', category: 'nope', description: 'x', tags: [], sitePurpose: 'shop', order: 1, photos: [] }));
  assert.throws(() => templates.loadTemplates(root), /bad.*category/);
});

test('a demo photo over 600 KB is rejected', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  mkdirSync(join(root, 'big', 'demo'), { recursive: true });
  writeFileSync(join(root, 'big', 'demo', 'hero.jpg'), Buffer.alloc(600 * 1024 + 1));
  writeFileSync(join(root, 'big', 'template.json'), JSON.stringify({ id: 'big', name: 'Big', category: 'comida', description: 'x', tags: [], sitePurpose: 'shop', order: 1, photos: [{ slot: 'hero', role: 'hero', demo: 'hero.jpg' }] }));
  assert.throws(() => templates.loadTemplates(root), /big.*hero\.jpg.*600/);
});

test('source files are the React components and the global stylesheet only', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  mkdirSync(join(root, 'src', 'components', 'parts'), { recursive: true });
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  writeFileSync(join(root, 'src', 'components', 'home.tsx'), 'export default function Home() { return null; }');
  writeFileSync(join(root, 'src', 'components', 'parts', 'Hero.tsx'), 'export default function Hero() { return null; }');
  writeFileSync(join(root, 'src', 'components', 'notes.md'), 'not source');
  writeFileSync(join(root, 'src', 'styles', 'globals.css'), 'body{}');
  writeFileSync(join(root, 'src', 'template.json'), '{}');
  const paths = templates.readTemplateSource(join(root, 'src')).map(f => f.path);
  assert.deepEqual(paths, ['components/home.tsx', 'components/parts/Hero.tsx', 'styles/globals.css']);
});

test('demo photos are returned with their extension', () => {
  const photo = templates.templateDemoPhoto('aurora', 'hero');
  assert.ok(photo && photo.bytes.length > 0 && ['jpg', 'png', 'webp'].includes(photo.ext));
  assert.equal(templates.templateDemoPhoto('aurora', 'nope'), undefined);
});

function writeTemplate(root, id, extra = {}) {
  mkdirSync(join(root, id, 'components'), { recursive: true });
  writeFileSync(join(root, id, 'template.json'), JSON.stringify({ id, name: id, category: 'comida', description: 'x', tags: [], sitePurpose: 'shop', order: 1, photos: [], ...extra }));
}

test('construccion is a template category', () => {
  assert.ok(templates.TEMPLATE_CATEGORIES.includes('construccion'));
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'obras', { category: 'construccion' });
  assert.equal(templates.loadTemplates(root)[0].manifest.category, 'construccion');
});

test('motor is a template category', () => {
  assert.ok(templates.TEMPLATE_CATEGORIES.includes('motor'));
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'autos', { category: 'motor' });
  assert.equal(templates.loadTemplates(root)[0].manifest.category, 'motor');
});

test('hidden must be true or false when present', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'raro', { hidden: 'yes' });
  assert.throws(() => templates.loadTemplates(root), /raro.*hidden/);
});

test('the gallery leaves hidden templates out, but a hidden template keeps its manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'tpl-'));
  writeTemplate(root, 'visible');
  writeTemplate(root, 'oculta', { hidden: true });
  const manifests = templates.loadTemplates(root).map(entry => entry.manifest);
  assert.deepEqual(templates.gallerySelection(manifests).map(m => m.id), ['visible']);
  assert.equal(manifests.find(m => m.id === 'oculta').hidden, true);
});

test('the real gallery is the full list minus hidden ones and starters, and hidden ones still resolve by id', () => {
  const all = templates.listTemplates();
  // Starters (spec 2026-10-24) are offered by YAPI's pick and «Probar otro estilo», not the Plantillas gallery.
  assert.deepEqual(templates.galleryTemplates().map(t => t.id), all.filter(t => !t.hidden && !(t.starter && !t.preset)).map(t => t.id));
  for (const t of all.filter(t => t.hidden)) assert.equal(templates.templateManifest(t.id).id, t.id);
});

// Spec 2026-10-19 master template: a manifest may carry a `master` block (default copy, eight palettes, eight font pairs).
const masterManifest = master => ({ id: 'base', name: 'Base', category: 'general', description: 'x', tags: [], sitePurpose: 'shop', order: 1, hidden: true, photos: [], master });
const palette = id => ({ id, name: id, paper: '#ffffff', ink: '#111111', muted: '#eeeeee', accent: '#aa3300', deep: '#222222' });
const pair = id => ({ id, name: id, heading: 'fraunces', body: 'geist' });
const eight = make => [1, 2, 3, 4, 5, 6, 7, 8].map(n => make(`p${n}`));
const masterCopy = { announcement: '', eyebrow: 'e', headline: 'h', subcopy: 's', primaryCta: 'p', secondaryCta: 's', productsTitle: 't', storyTitle: 't', storyBody: 'b', values: [{ title: 'a', text: 'b' }, { title: 'a', text: 'b' }, { title: 'a', text: 'b' }], closingLine: 'c', closingCta: 'c', tagline: '' };
const writeManifest = manifest => { const root = mkdtempSync(join(tmpdir(), 'tpl-')); mkdirSync(join(root, 'base'), { recursive: true }); writeFileSync(join(root, 'base', 'template.json'), JSON.stringify(manifest)); return root; };

test('a master manifest with copy, eight palettes and eight font pairs loads', () => {
  const [{ manifest }] = templates.loadTemplates(writeManifest(masterManifest({ copy: masterCopy, palettes: eight(palette), fonts: eight(pair) })));
  assert.equal(manifest.master.palettes.length, 8);
  assert.equal(manifest.category, 'general');
});

test('a master palette with a colour that is not #rrggbb is rejected', () => {
  const palettes = eight(palette); palettes[3] = { ...palettes[3], accent: 'red' };
  assert.throws(() => templates.loadTemplates(writeManifest(masterManifest({ copy: masterCopy, palettes, fonts: eight(pair) }))), /base.*master palette p4/);
});

test('a master copy without three values is rejected', () => {
  assert.throws(() => templates.loadTemplates(writeManifest(masterManifest({ copy: { ...masterCopy, values: [] }, palettes: eight(palette), fonts: eight(pair) }))), /base.*master\.copy\.values/);
});
