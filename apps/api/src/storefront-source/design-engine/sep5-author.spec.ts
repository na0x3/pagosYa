import { sep5AuthorPrompt, sep5AuthoredPlan, sep5ProjectIsUsable, sep5FilesSchema, SEP5_AUTHOR_VERSION } from './sep5-author';
import { creativePlanSchema } from './design-schemas';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

it('pins the Sep-5 contract clauses that make its output translatable', () => {
  const prompt = sep5AuthorPrompt({ brief: { businessType: 'Cafetería' }, instruction: 'Hazme la tienda.', data: { storeName: 'Ruta 7' }, assetLegend: [] });
  // Without these the generator stops emitting a commerce mount or a stylesheet,
  // and there is nothing left to read decisions out of.
  expect(prompt).toContain('data-pagosya-catalog');
  expect(prompt).toContain('Required files: index.html, styles.css, site.js');
  expect(prompt).toContain('no CDN scripts, external fonts');
  expect(prompt).toContain('Cafetería');
  expect(SEP5_AUTHOR_VERSION).toBe('sep5-author/26f889c8');
});

it('rejects an authored project with no commerce mount', () => {
  expect(sep5ProjectIsUsable([{ path: 'index.html', content: '<h1>hi</h1>' }])).toBe(false);
  expect(sep5ProjectIsUsable([
    { path: 'index.html', content: '<div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p>' },
    { path: 'styles.css', content: ':root{}' },
  ])).toBe(true);
});

it('turns authored source straight into a schema-valid plan', () => {
  const { plan, losses } = sep5AuthoredPlan([
    { path: 'index.html', content: '<section class="hero"><h1>Tu día pide otra ruta.</h1></section><section class="shop"><h2>La carta</h2></section><section class="origin-story"><h2>De dónde viene</h2></section>' },
    { path: 'styles.css', content: ':root{--ink:#15100d;--paper:#fff9ed;--red:#a72820;--green:#0b241e;--blue:#16627b;}\n.hero{background:var(--red)}\nh1{font-family:var(--serif);font-size:4rem}' },
  ]);
  expect(creativePlanSchema.safeParse(plan).success).toBe(true);
  expect(plan.palette.accent).toBe('#a72820');
  expect(plan.sections[0].intent).toBe('Tu día pide otra ruta.');
  expect(Array.isArray(losses)).toBe(true);
});

it('accepts the shape the provider returns', () => {
  expect(sep5FilesSchema.safeParse({ label: 'Ruta 7', files: [{ path: 'index.html', content: '<h1/>' }] }).success).toBe(true);
  expect(sep5FilesSchema.safeParse({ label: 'x', files: [{ path: 'a.html', content: 'x', extra: 1 }] }).success).toBe(false);
});

// The port exists to send the September 5 text and nothing else. The fixture was extracted straight from
// commit 26f889c8, so any drift in the prompt — a clause softened, a contract bolted on — fails here rather
// than quietly becoming a different generator under the same pinned version string.
it('sends the September 5 instruction text byte for byte', () => {
  const expected = readFileSync(join(__dirname, 'sep5-prompt.26f889c8.txt'), 'utf8').trimEnd();
  const sent = sep5AuthorPrompt({ brief: {}, instruction: '', data: {}, assetLegend: [] })
    .split('\n\n').filter(paragraph => !paragraph.startsWith('Business brief:')).join('\n\n');
  expect(sent).toBe(expected);
});

// Without this an edit re-authors the store from nothing, which is the opposite of what the prompt's last
// paragraph asks for. The Sep-5 engine always sent the merchant's own files here.
it('carries the merchant previous source into an edit', () => {
  const previous = [{ path: 'index.html', content: '<h1>Mantecate</h1>' }];
  expect(sep5AuthorPrompt({ brief: {}, instruction: 'Cambia el color', data: {}, assetLegend: [], previousSource: previous }))
    .toContain(`Previous authored source: ${JSON.stringify(previous)}`);
  expect(sep5AuthorPrompt({ brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] }))
    .toContain('Previous authored source: []');
});
