import { sep5AuthorPrompt, sep5AuthoredPlan, sep5ProjectIsUsable, sep5FilesSchema, sep5ReviewPrompt, sep5ReviewSchema, SEP5_AUTHOR_VERSION, SEP5_STORE_SHELL } from './sep5-author';
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

// Sep-5 was never asked for movement: measured over the nine benchmark stores it emitted one @keyframes rule
// and two IntersectionObservers in total, and the pinned contract's only word on the subject is "avoid
// unnecessary motion". The choreography goes last, so it is the most specific thing the model reads, and it
// carries the precedence clause because otherwise the two paragraphs contradict each other.
it('appends the choreography when motion is planned, and keeps September 5 intact when it is not', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const plan = 'MOTION CHOREOGRAPHY: Choose a motion language that belongs to the selected brand concept.\nUse native CSS/WAAPI and IntersectionObserver in guarded site.js.';
  const withMotion = sep5AuthorPrompt({ ...base, motionPlan: plan });
  expect(withMotion).toContain('IntersectionObserver in guarded site.js');
  expect(withMotion).toContain('Motion follows the choreography above');
  // The choreography is the last thing in the prompt; the pinned paragraphs still precede it untouched.
  expect(withMotion.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
  expect(withMotion).toContain('Avoid empty decorative cards');
  // No plan, no addition: the byte-for-byte pin above still describes what is sent.
  const without = sep5AuthorPrompt(base);
  expect(without).not.toContain('MOTION CHOREOGRAPHY');
  expect(without).not.toContain('Motion follows the choreography above');
  expect(sep5AuthorPrompt({ ...base, motionPlan: '   ' })).toBe(without);
});

// 'off' is a real merchant choice and reaches here as a choreography too. The precedence clause has to read
// correctly for it, or the prompt ends by arguing with itself.
it('passes a motion-off choreography through without contradicting it', () => {
  const off = sep5AuthorPrompt({ brief: {}, instruction: 'Sin animaciones', data: {}, assetLegend: [],
    motionPlan: 'MOTION CHOREOGRAPHY: motion is off. Keep every scene static and readable; do not add entrances, parallax or animated menus.' });
  expect(off).toContain('motion is off');
  expect(off).toContain('Motion follows the choreography above');
  expect(off).not.toContain('purposeful motion the contract');
});

// The pinned contract asks for catalog, cart and status only, so authored stores shipped with no way to sign in
// or search. The shell is opt-in so the byte-for-byte pin above still describes the unadorned prompt, and it
// precedes the choreography, which stays the last thing the model reads.
it('asks for the store shell when told to, before the choreography', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  expect(sep5AuthorPrompt(base)).not.toContain('STORE SHELL');
  const shelled = sep5AuthorPrompt({ ...base, storeShell: true, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(shelled).toContain(SEP5_STORE_SHELL);
  expect(SEP5_STORE_SHELL).toContain('data-pagosya-account="login"');
  expect(SEP5_STORE_SHELL).toContain('href="buscar.html"');
  expect(SEP5_STORE_SHELL).toContain('data-cart-count');
  expect(SEP5_STORE_SHELL).toContain('data-pagosya-pages');
  expect(shelled.indexOf('STORE SHELL')).toBeLessThan(shelled.indexOf('MOTION CHOREOGRAPHY'));
  expect(shelled.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
});

it('shows the model its own draft and what the browser measured', () => {
  const draft = [{ path: 'index.html', content: '<h1>Eje</h1>' }];
  const prompt = sep5ReviewPrompt({ brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft, measured: ['390px: la página es más ancha que la pantalla (512px).'] });
  expect(prompt).toContain(`Previous authored source: ${JSON.stringify(draft)}`);
  expect(prompt).toContain('SELF-REVIEW');
  expect(prompt).toContain('- 390px: la página es más ancha que la pantalla (512px).');
  expect(prompt).toContain(SEP5_STORE_SHELL);
  expect(sep5ReviewPrompt({ brief: {}, instruction: '', data: {}, assetLegend: [], draft, measured: [] })).not.toContain('Measured by the browser');
  // "Nothing to fix" is an empty files list, so a clean draft does not cost a second full write.
  expect(sep5ReviewSchema.safeParse({ label: 'Eje', notes: [], files: [] }).success).toBe(true);
  expect(sep5ReviewSchema.safeParse({ label: 'Eje', notes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], files: [] }).success).toBe(false);
});
