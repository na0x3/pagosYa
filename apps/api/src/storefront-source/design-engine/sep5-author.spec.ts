import { sep5AuthorPrompt, SEP5_SHOWCASE_SHELL, sep5MainAction, sep5CardLook, sep5AuthoredPlan, sep5ProjectIsUsable, sep5FilesSchema, sep5ReviewPrompt, sep5ReviewSchema, applySep5Edits, SEP5_REVIEW_RESPONSE_SCHEMA, SEP5_AUTHOR_VERSION, SEP5_STORE_SHELL, SEP5_STORE_SHELL_FRAMED, SEP5_BOLD_DEFAULT, sep5BoldDefault, sep5FontDirection, sep5ResponseSchema, sep5Products, SEP5_RESPONSE_SCHEMA } from './sep5-author';
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
  expect(SEP5_STORE_SHELL).toContain('<header data-pagosya-header></header>');
  expect(SEP5_STORE_SHELL).toContain('data-nav-label');
  expect(SEP5_STORE_SHELL).toContain('--store-heading-font');
  expect(SEP5_STORE_SHELL).toContain('data-pagosya-pages');
  expect(SEP5_STORE_SHELL).not.toContain('data-cart-count');
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
it('keeps one platform shell with or without a drawn frame, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const frame = 'FRAME AND HERO: test frame\n- Hero: giant type.';
  const framed = sep5AuthorPrompt({ ...base, storeShell: true, frame, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
  expect(framed).toContain(frame);
  expect(framed.split(SEP5_STORE_SHELL)).toHaveLength(2);
  expect(SEP5_STORE_SHELL_FRAMED).toBe(SEP5_STORE_SHELL);
  expect(framed.indexOf(frame)).toBeLessThan(framed.indexOf('MOTION CHOREOGRAPHY'));
  expect(sep5AuthorPrompt({ ...base, storeShell: true, frame: '  ' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
  expect(sep5AuthorPrompt({ ...base, frame: '  ' })).toBe(sep5AuthorPrompt(base));
  expect(sep5AuthorPrompt({ ...base, storeShell: true, purpose: 'shop' })).toBe(sep5AuthorPrompt({ ...base, storeShell: true }));
});

it('asks the self-review to check the drawn hero only when there is one, and to leave the platform header alone', () => {
  const input = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [], storeShell: true, draft: [], measured: [] };
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toMatch(/hero matches FRAME AND HERO/);
  expect(sep5ReviewPrompt({ ...input, frame: 'FRAME AND HERO: x' })).toContain('leave <header data-pagosya-header> alone');
  expect(sep5ReviewPrompt(input)).not.toMatch(/FRAME AND HERO/);
  expect(sep5ReviewPrompt(input)).not.toContain('search, account and cart');
  expect(sep5ReviewPrompt(input)).toContain('whether the catalog and the primary action are easy to find');
});

it('leaves the header, its menu and the store name to the platform', () => {
  expect(SEP5_STORE_SHELL).toMatch(/The platform draws the header on every page, so do not write one/);
  expect(SEP5_STORE_SHELL).not.toMatch(/data-pagosya-account|buscar\.html|data-cart-count|\[data-store-name\]/);
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

it('adds the playbook after the frame and stays byte-identical without it', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  const text = sep5AuthorPrompt({ ...base, storeShell: true, frame: 'DESIGN DRAW: x', playbook: 'PLAYBOOK: y' });
  expect(text.indexOf('DESIGN DRAW: x')).toBeLessThan(text.indexOf('PLAYBOOK: y'));
  expect(sep5AuthorPrompt({ ...base, playbook: '  ' })).toBe(sep5AuthorPrompt(base));
});

// A merchant who lists products and prices in the first message gets them in the real catalog (night run 2026-10-11:
// every Sep-5 store shipped with an empty catalog because the author had no way to return products).
describe('Sep-5 products', () => {
  const input = { brief: {}, instruction: 'x', data: {}, assetLegend: [] };
  it('asks for the merchant-listed products only when enabled, and the schema requires them then', () => {
    expect(sep5AuthorPrompt({ ...input, products: true })).toMatch(/PRODUCTS:/);
    expect(sep5AuthorPrompt(input)).not.toMatch(/PRODUCTS:/);
    expect(sep5ResponseSchema(true).required).toContain('products');
    expect(sep5ResponseSchema(false)).toEqual(SEP5_RESPONSE_SCHEMA);
    expect(sep5FilesSchema.safeParse({ label: 'x', files: [], products: [{ name: 'Pan' }] }).success).toBe(true);
  });
  it('keeps products the merchant priced and drops the rest without failing the store', () => {
    const instruction = 'Pedido actual del comercio: Crea estos productos: pan de masa madre Bs 25, galletas Bs 8.';
    const photo = '/v1/uploads/a.jpg';
    const item = (name: string, priceText: string, amount: number) => ({ name, description: name, amount, currency: 'BOB', priceText, imageUrls: [photo], variants: [], subscriptionOptions: [] });
    const kept = sep5Products([item('Pan de masa madre', 'Bs 25', 2500), item('Galletas', 'Bs 8', 800)], instruction, new Set([photo]));
    expect(kept.products.map(product => product.name)).toEqual(['Pan de masa madre', 'Galletas']);
    expect(kept.note).toBeUndefined();
    const invented = sep5Products([item('Torta', 'Bs 90', 9000)], instruction, new Set([photo]));
    expect(invented.products).toEqual([]);
    expect(invented.note).toMatch(/precio/);
    expect(sep5Products(undefined, instruction, new Set()).products).toEqual([]);
  });
});

// "Elige tu estilo" (spec 2026-10-11): the store keeps the header and hero of the card the merchant picked.
it('appends the picked header and hero, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'x', data: {}, assetLegend: [] };
  expect(sep5AuthorPrompt({ ...base, hero: '' })).toBe(sep5AuthorPrompt(base));
  const prompt = sep5AuthorPrompt({ ...base, hero: '<header data-store-name>Buna</header>' });
  expect(prompt).toContain('PICKED HERO');
  expect(prompt).toContain('start the page with the empty <header data-pagosya-header></header>');
  expect(prompt).toContain('<header data-store-name>Buna</header>');
});

// Spec 2026-10-12 faster generation: a pick whose model hero was still being drawn builds from the card's design.
it('describes the picked card when its hero was not finished, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'x', data: {}, assetLegend: [] };
  expect(sep5AuthorPrompt({ ...base, card: '' })).toBe(sep5AuthorPrompt(base));
  const card = sep5CardLook({ name: 'Barra de barrio', fonts: { display: 'fraunces', text: 'instrument' }, palette: { paper: '#fff8ee', ink: '#1a1a1a', accent: '#d2462b', accent2: '#f3e3cf' }, header: 'wordmark-band', hero: 'poster', eyebrow: 'Hecho en Sopocachi', headline: 'Café para compartir', support: 'Tostado cada mañana.', action: 'Ver menú' });
  expect(card).toContain('PICKED STYLE: The merchant chose the style card «Barra de barrio»');
  expect(card).toContain('display type Fraunces, text Instrument Sans');
  expect(card).toContain('background #fff8ee, text #1a1a1a, accent #d2462b, panels #f3e3cf');
  expect(card).toContain('hero "poster"');
  expect(card).not.toContain('wordmark-band');
  expect(card).toContain('Draw the first screen yourself');
  expect(card).toContain('eyebrow "Hecho en Sopocachi", headline "Café para compartir", line "Tostado cada mañana.", action "Ver menú"');
  const prompt = sep5AuthorPrompt({ ...base, card });
  expect(prompt).toContain(card);
  expect(prompt).not.toContain('PICKED HERO');
  expect(sep5CardLook({ name: 'Solo texto', fonts: { display: 'fraunces', text: 'instrument' }, headline: 'Hola' })).not.toContain('colours background');
});

describe('a showcase author (spec 2026-10-13)', () => {
  const base = { brief: { businessType: 'Arquitectura' }, instruction: 'Crea el sitio de mi estudio', data: {}, assetLegend: [], storeShell: true };

  it('drops the shop shell for the showcase shell, the purpose override and the main action, and asks for no products', () => {
    const prompt = sep5AuthorPrompt({ ...base, purpose: 'service', action: { kind: 'booking', value: 'https://cal.com/deff' }, products: false, motionPlan: 'MOTION CHOREOGRAPHY: subtle.' });
    expect(prompt).toContain(SEP5_SHOWCASE_SHELL);
    expect(prompt).not.toContain(SEP5_STORE_SHELL);
    expect(prompt).toContain('SITE PURPOSE OVERRIDE: service');
    expect(prompt).toContain('MAIN ACTION:');
    expect(prompt).toContain('<a href="https://cal.com/deff" target="_blank" rel="noopener">Agenda una cita</a>');
    expect(prompt).not.toContain('PRODUCTS:');
    expect(prompt.indexOf('SITE SHELL')).toBeLessThan(prompt.indexOf('MAIN ACTION'));
    expect(prompt.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
  });

  it('asks for the slot, the menu marks and the platform hooks, and no catalog, cart, checkout, search or account', () => {
    expect(SEP5_SHOWCASE_SHELL).toContain('<header data-pagosya-header></header>');
    expect(SEP5_SHOWCASE_SHELL).toContain('data-nav-label');
    expect(SEP5_SHOWCASE_SHELL).toContain('<section data-pagosya-contact hidden></section>');
    expect(SEP5_SHOWCASE_SHELL).toContain('data-pagosya-status');
    expect(SEP5_SHOWCASE_SHELL).toMatch(/Never write a catalog, cart, checkout, search or account link/);
  });

  it('points every call to action at the main action, and lets the platform open its form', () => {
    expect(sep5MainAction({ kind: 'whatsapp', value: '59170012345' })).toContain('<a href="https://wa.me/59170012345" target="_blank" rel="noopener">Escríbenos</a>');
    expect(sep5MainAction({ kind: 'phone', value: '59122441234' })).toContain('<a href="tel:+59122441234">Llámanos</a>');
    const form = sep5MainAction({ kind: 'form' });
    expect(form).toContain('<a href="contacto.html" data-pagosya-contact-open>Pide una cotización</a>');
    expect(form).toContain('never build a form yourself');
    expect(sep5AuthorPrompt({ ...base, purpose: 'portfolio' })).toContain('<a href="contacto.html" data-pagosya-contact-open>');
  });

  it('keeps the shop prompt byte-identical', () => {
    expect(sep5AuthorPrompt({ ...base, purpose: 'shop', action: { kind: 'form' } })).toBe(sep5AuthorPrompt(base));
  });

  it('judges a showcase by its main action, never by a catalog or cart', () => {
    const styles = { path: 'styles.css', content: ':root{}' };
    const page = (body: string) => [{ path: 'index.html', content: `${body}<p data-pagosya-status></p>` }, styles];
    expect(sep5ProjectIsUsable(page('<header data-pagosya-header></header><main>Hola</main>'), 'service')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main><a href="https://wa.me/59170012345">Escríbenos</a></main>'), 'service')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main><a href="contacto.html" data-pagosya-contact-open>Cotiza</a></main>'), 'portfolio')).toBe(true);
    expect(sep5ProjectIsUsable(page('<main>Hola</main>'), 'service')).toBe(false);
    expect(sep5ProjectIsUsable([{ path: 'index.html', content: '<header data-pagosya-header></header>' }, styles], 'service')).toBe(false);
    expect(sep5ProjectIsUsable(page('<header data-pagosya-header></header>'), 'shop')).toBe(false);
    expect(sep5ProjectIsUsable(page('<div data-pagosya-catalog></div><div data-pagosya-cart></div>'))).toBe(true);
  });
});

describe('store voice in the Sep-5 prompts (spec 2026-10-14, part 3)', () => {
  const base = { brief: {}, instruction: 'Hazme la tienda', data: {}, assetLegend: [] };
  it('adds the Store Brain and the voice after the playbook and before the choreography, and stays byte-identical without them', () => {
    const text = sep5AuthorPrompt({ ...base, storeShell: true, playbook: 'PLAYBOOK: y', brain: 'Store Brain (data): {}', voice: 'STORE VOICE: z', motionPlan: 'MOTION: m' });
    expect(text.indexOf('PLAYBOOK: y')).toBeLessThan(text.indexOf('Store Brain (data)'));
    expect(text.indexOf('Store Brain (data)')).toBeLessThan(text.indexOf('STORE VOICE: z'));
    expect(text.split('\n\n').at(-1)).toContain('Motion follows the choreography above');
    expect(sep5AuthorPrompt({ ...base, voice: ' ', brain: '' })).toBe(sep5AuthorPrompt(base));
  });

  it('gives the review the copy findings to rewrite, and stays as today without them', () => {
    const draft = [{ path: 'index.html', content: '<h1>Eje</h1>' }];
    const review = sep5ReviewPrompt({ ...base, voice: 'STORE VOICE: z', draft, measured: [], copyFindings: ['línea: «En La Paz, sin apuro» (index.html); problema: frase genérica «sin apuro»; reescribe con un specific o una textura de la hoja'] });
    expect(review).toContain('STORE VOICE: z');
    expect(review).toContain('Copy check');
    expect(review).toContain('- línea: «En La Paz, sin apuro» (index.html)');
    expect(sep5ReviewPrompt({ ...base, draft, measured: [], copyFindings: [] })).toBe(sep5ReviewPrompt({ ...base, draft, measured: [] }));
  });
});
