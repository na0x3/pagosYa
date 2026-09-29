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

test('the real gallery is the full list minus hidden ones, and hidden ones still resolve by id', () => {
  const all = templates.listTemplates();
  assert.deepEqual(templates.galleryTemplates().map(t => t.id), all.filter(t => !t.hidden).map(t => t.id));
  for (const t of all.filter(t => t.hidden)) assert.equal(templates.templateManifest(t.id).id, t.id);
});
