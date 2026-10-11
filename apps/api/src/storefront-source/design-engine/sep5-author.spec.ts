import { sep5AuthorPrompt, sep5AuthoredPlan, sep5ProjectIsUsable, sep5FilesSchema, sep5ReviewPrompt, sep5ReviewSchema, applySep5Edits, SEP5_REVIEW_RESPONSE_SCHEMA, SEP5_AUTHOR_VERSION, SEP5_STORE_SHELL, SEP5_STORE_SHELL_FRAMED, SEP5_BOLD_DEFAULT, sep5BoldDefault, sep5FontDirection } from './sep5-author';
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
  // "Nothing to fix" is an empty edits list, so a clean draft does not cost a second write at all.
  expect(sep5ReviewSchema.safeParse({ label: 'Eje', notes: [], edits: [] }).success).toBe(true);
  expect(sep5ReviewSchema.safeParse({ label: 'Eje', notes: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], edits: [] }).success).toBe(false);
});

// Sep-5 never read the planner, so a concept's signature (spec 2026-10-09) reached only the agent builder. It is
// appended like the choreography: after the pinned paragraphs, before the motion plan so motion stays last.
it('appends the signature when there is one, and keeps September 5 intact when there is not', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const signature = 'SIGNATURE. When the selected concept has a signature it is your through-line.\nSignature to carry: la imprenta.';
  const withSignature = sep5AuthorPrompt({ ...base, signature, motionPlan: 'MOTION CHOREOGRAPHY: x' });
  expect(withSignature).toContain('Signature to carry: la imprenta.');
  expect(withSignature.indexOf('Signature to carry')).toBeLessThan(withSignature.indexOf('MOTION CHOREOGRAPHY'));
  expect(withSignature.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
  expect(sep5ReviewPrompt({ ...base, signature, draft: [], measured: [] })).toContain('Signature to carry: la imprenta.');
  expect(sep5AuthorPrompt({ ...base, signature: '  ' })).toBe(sep5AuthorPrompt(base));
});

// Bold is the default for a fresh design (owner 2026-10-10): colour fields, varied section shapes, one brand device.
// Appended like the signature, before the motion plan so motion stays last; absent, September 5 stays intact.
it('asks for a bold store when told to, before the choreography, and keeps September 5 intact when not', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const bold = sep5AuthorPrompt({ ...base, boldDefault: true, motionPlan: 'MOTION CHOREOGRAPHY: x' });
  expect(bold).toContain(SEP5_BOLD_DEFAULT);
  expect(SEP5_BOLD_DEFAULT).toMatch(/colour fields/);
  expect(SEP5_BOLD_DEFAULT).toMatch(/marquee/);
  expect(SEP5_BOLD_DEFAULT).toMatch(/image \| text/);
  expect(SEP5_BOLD_DEFAULT).toMatch(/break a word in the middle/);
  expect(bold.indexOf(SEP5_BOLD_DEFAULT)).toBeLessThan(bold.indexOf('MOTION CHOREOGRAPHY'));
  expect(bold.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
  expect(sep5ReviewPrompt({ ...base, boldDefault: true, draft: [], measured: [] })).toContain(SEP5_BOLD_DEFAULT);
  expect(sep5AuthorPrompt({ ...base, boldDefault: false })).toBe(sep5AuthorPrompt(base));
});

it('is bold for a fresh design unless motion is subtle or off or the merchant asked for a quiet look', () => {
  const fresh = { creative: true, motion: 'auto' as const, instruction: 'Crea mi tienda', brief: { visualDirection: 'Studio de pilates en Bolivia' } };
  expect(sep5BoldDefault(fresh)).toBe(true);
  expect(sep5BoldDefault({ ...fresh, motion: 'expressive' })).toBe(true);
  expect(sep5BoldDefault({ ...fresh, creative: false })).toBe(false);
  expect(sep5BoldDefault({ ...fresh, motion: 'subtle' })).toBe(false);
  expect(sep5BoldDefault({ ...fresh, motion: 'off' })).toBe(false);
  expect(sep5BoldDefault({ ...fresh, instruction: 'Quiero algo minimalista' })).toBe(false);
  expect(sep5BoldDefault({ ...fresh, brief: { visualDirection: 'Sobria y elegante' } })).toBe(false);
  expect(sep5BoldDefault({ ...fresh, brief: null })).toBe(true);
  expect(sep5BoldDefault({ ...fresh, instruction: 'YAPI: te propongo algo limpio.\nPedido actual del comercio:\nHazla con mucho color' })).toBe(true);
});

it('names the concept fonts and how to load them, falling back to the default pair', () => {
  const design = (display?: string, text?: string) => ({ selected: 0, concepts: [{ dna: { type: { display, text } } }] });
  const direction = sep5FontDirection(design('big-shoulders-display', 'instrument'));
  expect(direction).toMatch(/^TYPE: /);
  expect(direction).toContain('Big Shoulders Display');
  expect(direction).toContain('url("assets/big-shoulders-display.ttf")');
  expect(direction).toContain('url("assets/instrument.ttf")');
  expect(direction).toContain('Never load fonts from another site');
  const fallback = sep5FontDirection(design('comic-sans', undefined));
  expect(fallback).toContain('url("assets/bricolage.ttf")');
  expect(fallback).toContain('url("assets/instrument.ttf")');
  expect(sep5FontDirection(undefined)).toContain('url("assets/bricolage.ttf")');
  const single = sep5FontDirection(design('rubik', 'rubik'));
  expect(single.match(/src: url\("assets\/rubik\.ttf"\)/g)).toHaveLength(1);
});

it('asks for the fonts before the choreography, keeps them in the self-review, and keeps September 5 intact without them', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const fonts = sep5FontDirection({ selected: 0, concepts: [{ dna: { type: { display: 'anton', text: 'manrope' } } }] });
  const prompt = sep5AuthorPrompt({ ...base, fonts, motionPlan: 'MOTION CHOREOGRAPHY: x' });
  expect(prompt.indexOf('TYPE: ')).toBeGreaterThan(-1);
  expect(prompt.indexOf('TYPE: ')).toBeLessThan(prompt.indexOf('MOTION CHOREOGRAPHY'));
  expect(sep5ReviewPrompt({ ...base, fonts, draft: [], measured: [] })).toContain('url("assets/anton.ttf")');
  expect(sep5AuthorPrompt({ ...base, fonts: '  ' })).toBe(sep5AuthorPrompt(base));
});

// Spec 2026-10-10 frame and hero draw: the ordered shell made every header identical.
it('builds the drawn frame instead of the ordered shell, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const frame = 'FRAME AND HERO: test frame\n- Header: giant wordmark.';
  const framed = sep5AuthorPrompt({ ...base, storeShell: true, frame, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(framed).toContain(frame);
  expect(framed).toContain(SEP5_STORE_SHELL_FRAMED);
  expect(framed).not.toContain(SEP5_STORE_SHELL);
  expect(framed.indexOf(frame)).toBeLessThan(framed.indexOf('MOTION CHOREOGRAPHY'));
  expect(SEP5_STORE_SHELL_FRAMED).toContain('href="buscar.html"');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('data-pagosya-account="login"');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('[data-cart-count]');
  expect(SEP5_STORE_SHELL_FRAMED).toContain('data-pagosya-pages');
  expect(sep5AuthorPrompt({ ...base, storeShell: true, frame: '  ' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
  expect(sep5AuthorPrompt({ ...base, frame: '  ' })).toBe(sep5AuthorPrompt(base));
});

it('asks the self-review to check the drawn frame only when there is one', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toMatch(/header and hero match FRAME AND HERO/);
  expect(sep5ReviewPrompt(input)).not.toMatch(/FRAME AND HERO/);
});

it('keeps the cart, Buscar and Mi cuenta reachable on phones even when the merchant overrides the drawn header', () => {
  expect(SEP5_STORE_SHELL_FRAMED).toMatch(/On mobile all four stay reachable/);
});

it('keeps the whole store name inside one data-store-name slot', () => {
  for (const shell of [SEP5_STORE_SHELL, SEP5_STORE_SHELL_FRAMED]) expect(shell).toMatch(/whole store name inside one \[data-store-name\]/);
});

it('asks the self-review to check colours, buttons and photos when there is a design draw', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'DESIGN DRAW: x' })).toMatch(/colours, buttons, photo treatment and structure match DESIGN DRAW/);
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).not.toMatch(/DESIGN DRAW/);
});

// Speed (2026-10-11): the review rewrote the whole site to fix a few things, half of every generation's time.
describe('self-review as edits', () => {
  const draft = [{ path: 'index.html', content: '<h1>Eje</h1><p>Hola</p><p>Hola</p>' }, { path: 'styles.css', content: 'h1{color:red}' }];
  it('applies a snippet found exactly once and skips missing, ambiguous, unknown and platform targets', () => {
    const { files, skipped } = applySep5Edits(draft, [
      { path: 'styles.css', find: 'color:red', replace: 'color:#123456' },
      { path: 'index.html', find: '<p>Hola</p>', replace: '<p>Chau</p>' },
      { path: 'index.html', find: '<h2>', replace: 'x' },
      { path: 'nope.html', find: 'a', replace: 'b' },
      { path: 'config.js', find: 'a', replace: 'b' },
    ]);
    expect(files.find(file => file.path === 'styles.css')!.content).toBe('h1{color:#123456}');
    expect(files.find(file => file.path === 'index.html')!.content).toBe(draft[0].content);
    expect(skipped).toHaveLength(4);
    expect(draft[1].content).toBe('h1{color:red}');
  });
  it('applies edits in order, each on the result of the one before', () => {
    const { files } = applySep5Edits(draft, [{ path: 'index.html', find: '<h1>Eje</h1>', replace: '<h1>Eje Pilates</h1>' }, { path: 'index.html', find: 'Eje Pilates', replace: 'Estudio Eje' }]);
    expect(files[0].content.startsWith('<h1>Estudio Eje</h1>')).toBe(true);
  });
  it('asks for short unique edits instead of the whole project', () => {
    const prompt = sep5ReviewPrompt({ brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft, measured: [] });
    expect(prompt).toMatch(/return only edits/i);
    expect(prompt).toMatch(/instead of the whole project/i);
    expect(JSON.stringify(SEP5_REVIEW_RESPONSE_SCHEMA)).toContain('"edits"');
    expect(JSON.stringify(SEP5_REVIEW_RESPONSE_SCHEMA)).not.toContain('"files"');
    expect(sep5ReviewSchema.safeParse({ label: 'x', notes: [], edits: Array.from({ length: 21 }, () => ({ path: 'a', find: 'b', replace: 'c' })) }).success).toBe(false);
  });
});

it('keeps bold for merchants who ask when the playbook is on', () => {
  const base = { creative: true, motion: 'expressive' as never, brief: {} };
  expect(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda', playbook: true })).toBe(false);
  expect(sep5BoldDefault({ ...base, instruction: 'Pedido actual del comercio:\nhazla atrevida', playbook: true })).toBe(true);
  expect(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda' })).toBe(sep5BoldDefault({ ...base, instruction: 'Hazme la tienda', playbook: false }));
});
