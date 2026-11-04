import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const templates = require('../index.js');

// Template frame variety (owner 2026-11-03 «todo se parece haz más diversidad, bonitas»): the themed templates must not share the
// same footer, buttons, card, product page or cover. Spec docs/superpowers/specs/2026-11-03-template-frame-variety-design.md.
const themed = () => templates.loadTemplates().map(entry => entry.manifest)
  .filter(m => m.preset && m.hidden !== true && m.extends === 'esencial' && m.reference);
const PRODUCT_SECTIONS = ['products-grid', 'products-tabs', 'products-slider'];
const frame = m => {
  const v = m.preset.variants ?? {};
  const layout = m.preset.layout ?? [];
  return {
    id: m.id,
    header: v.header ?? 'centered',
    footer: v.footer ?? 'columns',
    button: v.button ?? 'pill',
    card: layout.find(s => PRODUCT_SECTIONS.includes(s.type))?.card || 'classic',
    pdp: v.pdp ?? 'gallery-left',
    cover: layout[0]?.type ?? 'none',
    types: new Set(layout.map(s => s.type)),
  };
};
const atMost = (part, cap) => {
  const counts = {};
  for (const f of themed().map(frame)) (counts[f[part]] ??= []).push(f.id);
  for (const [value, ids] of Object.entries(counts)) assert.ok(ids.length <= cap, `${part} «${value}» on ${ids.length} templates (max ${cap}): ${ids.join(', ')}`);
};

test('there are still at least 35 themed templates', () => assert.ok(themed().length >= 35, `${themed().length}`));
test('no footer on more than 4 templates', () => atMost('footer', 4));
test('no product card on more than 4 templates', () => atMost('card', 4));
test('no button look on more than 5 templates', () => atMost('button', 5));
test('no product page on more than 6 templates', () => atMost('pdp', 6));
test('no cover on more than 6 homes', () => atMost('cover', 6));
test('no two templates share header, footer, card and product page', () => {
  const seen = new Map();
  for (const f of themed().map(frame)) {
    const key = [f.header, f.footer, f.card, f.pdp].join('|');
    assert.ok(!seen.has(key), `${f.id} and ${seen.get(key)} share ${key}`);
    seen.set(key, f.id);
  }
});
test('the five common filler sections sit on at most 10 homes each', () => {
  for (const type of ['story-split', 'categories-tiles', 'newsletter-split', 'press-quotes', 'products-slider']) {
    const ids = themed().map(frame).filter(f => f.types.has(type)).map(f => f.id);
    assert.ok(ids.length <= 10, `${type} on ${ids.length} homes: ${ids.join(', ')}`);
  }
});
test('homes stay different (average section overlap at most 0.20)', () => {
  const all = themed().map(frame);
  let sum = 0, pairs = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i].types, b = all[j].types;
    const shared = [...a].filter(t => b.has(t)).length;
    sum += shared / new Set([...a, ...b]).size; pairs++;
  }
  // Measured to two places, as the spec states it (today 0.20).
  assert.ok(Math.round(sum / pairs * 100) / 100 <= 0.2, `average overlap ${(sum / pairs).toFixed(3)}`);
});
test('every variant a template names is one Esencial draws', () => {
  const allowed = templates.templateManifest('esencial').master.variants;
  for (const m of themed()) for (const [part, value] of Object.entries(m.preset.variants ?? {})) {
    if (Array.isArray(allowed[part])) assert.ok(allowed[part].includes(value), `${m.id}: ${part} «${value}» is not an Esencial variant`);
  }
});
