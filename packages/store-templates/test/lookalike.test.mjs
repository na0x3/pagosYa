import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { listTemplates, templateSourceFiles } = require('../index.js');

/** The Plantillas that existed before the Wix-style set (spec 2026-09-28 §6.3). */
const LEGACY = new Set(['aro', 'aurora', 'barro', 'brillo', 'chispa', 'crunch', 'cumbre', 'encaje', 'flora', 'huella', 'huerta', 'juguete', 'lienzo', 'miga', 'nido', 'pagina', 'pasarela', 'paso', 'pausa', 'piel', 'punto', 'raiz', 'ritmo', 'sesion', 'solo', 'taller', 'tostado', 'trenza', 'urbano', 'vela']);

const tsx = id => templateSourceFiles(id).filter(f => f.path.endsWith('.tsx')).map(f => f.content).join('\n');
const homeSections = id => {
  const home = templateSourceFiles(id).find(f => f.path === 'components/home.tsx')?.content ?? '';
  return [...home.matchAll(/\n {6}<section id="([^"]+)"/g)].map(m => m[1]);
};
const fresh = () => listTemplates().filter(t => !LEGACY.has(t.id));

test('a new template has 6–9 home sections in a sequence no other template uses', () => {
  const all = listTemplates().map(t => ({ id: t.id, seq: homeSections(t.id).join(',') }));
  for (const t of fresh()) {
    const count = homeSections(t.id).length;
    assert.ok(count >= 6 && count <= 9, `${t.id} has ${count} home sections; it needs 6–9`);
    const seq = homeSections(t.id).join(',');
    const twin = all.find(o => o.id !== t.id && o.seq === seq);
    assert.equal(twin, undefined, `${t.id} repeats the home sections of ${twin?.id}: ${seq}`);
  }
});

const REQUIRED = {
  CartTemplate: ['data-cart-close', 'name="lines"', 'name="total"', 'name="action"'],
  CartLineTemplate: ['name="name"', 'name="line-total"', 'name="quantity"'],
  AddedTemplate: ['name="message"', 'data-cart-open'],
  ReviewTemplate: ['name="summary"', 'name="fields"'],
  ProductPageTemplate: ['name="gallery"', 'name="title"', 'name="pricing"', 'name="buy"'],
};

test('a new template owns its cart, line, added notice, review and product page with every required slot', () => {
  for (const t of fresh()) {
    const code = tsx(t.id);
    for (const [component, slots] of Object.entries(REQUIRED)) {
      const block = code.match(new RegExp(`<${component}>([\\s\\S]*?)</${component}>`))?.[1];
      assert.ok(block, `${t.id} has no <${component}>`);
      for (const slot of slots) assert.ok(block.includes(slot), `${t.id} <${component}> is missing ${slot}`);
    }
  }
});

test('the section reader sees real home sections', () => {
  assert.ok(homeSections('aro').length >= 3);
});
