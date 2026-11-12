import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from '../source-templates';
import { SOURCE_FONT_CATALOG } from '../source-font-catalog';
import { nextSourceFile } from '../source-next';
import { MASTER_THEME_END, MASTER_THEME_START, masterThemeBlock } from '../source-master';
import { AgentWorkspace } from './agent-workspace';
import { FOOTER_PATH, HomeWriterToolbox, HOME_PATH, HOME_WRITER_LIMITS, HOME_WRITER_TOOLS, footerProblems, homeWriterTools, inventedClasses, nearColour, shellWithStoreFooter, shoutedHeadings, templateFonts } from './home-writer-tools';

// Spec 2026-10-29 home page writer §2: five tools plus finish, on the locked Esencial chassis.
jest.setTimeout(240_000);
let base: Awaited<ReturnType<typeof templateDemoRevision>>;
beforeAll(async () => { base = await templateDemoRevision(templateManifest('esencial')!, templateSourceFiles('esencial')); });
const box = (gate: () => Promise<string | null> = async () => null) => {
  const authored = base.files.filter(f => nextSourceFile(f.path));
  return new HomeWriterToolbox({ workspace: new AgentWorkspace(authored, { redesign: true, lockedShell: true }), base, gate });
};
/** The demo palette's deep is near-black, so its closing band is a black text-only band (owner rule 2026-10-22); the writer
 *  gives it the brand colour first, as a real run would. */
const branded = async (b: HomeWriterToolbox) => {
  const font = (await b.run('read_chassis', '{}')).output.match(/fuentes: ([a-z0-9-]+) \(/)![1];
  expect((await b.run('set_tokens', tokens(font))).output).toMatch(/^Colores y fuentes guardados/);
  return b;
};
const tokens = (font: string) => JSON.stringify({ paper: '#f4efe6', ink: '#1d2a22', muted: '#e8e1d4', accent: '#b5562b', deep: '#2f4a33', heading: font, body: font });

describe('HomeWriterToolbox', () => {
  it('offers exactly the seven tools', () => {
    expect(HOME_WRITER_TOOLS.map(t => t.name)).toEqual(['read_chassis', 'write_home', 'write_footer', 'set_tokens', 'check', 'screenshot', 'finish']);
  });
  it('read_chassis names the kit parts, the store data, the fonts and the current home', async () => {
    const out = (await box().run('read_chassis', '{}')).output;
    expect(out).toContain('data-pagosya-catalog');
    expect(out).toContain('./store-data');
    expect(out).toMatch(/fuentes: [a-z0-9-]+ \(/);
    expect(out).toContain(`--- ${HOME_PATH} ---`);
  });
  it('write_home replaces the home, and a home without <Shell> is refused as output', async () => {
    const b = box();
    const home = b.workspace.read(HOME_PATH);
    expect((await b.run('write_home', JSON.stringify({ content: home.replace('export default function Home', 'export default function Home /* nuevo */') }))).output).toMatch(/^Portada escrita y compilada/);
    expect(b.workspace.changedPaths()).toEqual([HOME_PATH]);
    expect((await b.run('write_home', JSON.stringify({ content: 'export default function Home() { return <main>hola</main>; }' }))).output).toMatch(/Shell/);
    expect(b.workspace.read(HOME_PATH)).toContain('/* nuevo */');
  });
  it('write_home reports a compile error as output', async () => {
    const out = (await box().run('write_home', JSON.stringify({ content: `import Shell from './Shell';\nexport default function Home() { return <Shell><main>{nope(</main></Shell>; }` }))).output;
    expect(out).toMatch(/no compila/);
  });
  it('set_tokens rewrites only the theme block, and refuses an unknown font without changing anything', async () => {
    const b = box();
    const before = b.workspace.read('styles/globals.css');
    expect((await b.run('set_tokens', tokens('comic-sans'))).output).toMatch(/no está en el catálogo/);
    expect(b.workspace.read('styles/globals.css')).toBe(before);
    const font = (await b.run('read_chassis', '{}')).output.match(/fuentes: ([a-z0-9-]+) \(/)![1];
    expect((await b.run('set_tokens', tokens(font))).output).toMatch(/^Colores y fuentes guardados/);
    const after = b.workspace.read('styles/globals.css');
    expect(after).toContain('--es-paper:#f4efe6');
    expect(after.split(MASTER_THEME_START).length).toBe(2);
    const rest = (css: string) => css.slice(css.indexOf(MASTER_THEME_END));
    expect(rest(after)).toBe(rest(before));
  });
  it('the demo palette\'s black closing band blocks until the brand colour paints it', async () => {
    expect((await box().run('check', '{}')).output).toMatch(/Debes corregir:[\s\S]*Banda oscura/);
  });
  it('check on the branded template home has nothing blocking; finish goes through the gate', async () => {
    const b = await branded(box());
    expect((await b.run('finish', JSON.stringify({ summary: 'x' }))).output).toMatch(/llama check/);
    expect((await b.run('check', '{}')).output).not.toMatch(/Debes corregir/);
    expect(b.draftIsClean()).toBe(true);
    expect((await b.run('finish', JSON.stringify({ summary: 'Nueva portada.' }))).output).toMatch(/^Listo/);
    expect(b.finished).toEqual({ summary: 'Nueva portada.' });
    const refused = await branded(box(async () => 'El build falló: x'));
    await refused.run('check', '{}');
    expect((await refused.run('finish', JSON.stringify({ summary: 's' }))).output).toContain('El build falló');
    expect(refused.finished).toBeNull();
  });
  // NOA 2026-10-29: the writer's grid dropped the sort and colour picker the owner asked for on the home (data-pagosya-filters).
  it('a home whose product grid lost the sort and colour picker must be fixed', async () => {
    const b = await branded(box());
    const home = b.workspace.read(HOME_PATH);
    expect(home).toContain('data-pagosya-filters');
    await b.run('write_home', JSON.stringify({ content: home.replace(/ data-pagosya-filters data-filters-style="chips"/g, '') }));
    expect((await b.run('check', '{}')).output).toMatch(/Debes corregir:[\s\S]*ordenar/);
  });
  // Spec 2026-10-30 home writer variety: the kit's motion parts are offered only to an animated store, and advised when unused.
  it('an animated store reads the motion parts and is advised to use three; a still store never sees them', async () => {
    const authored = base.files.filter(f => nextSourceFile(f.path));
    const animated = new HomeWriterToolbox({ workspace: new AgentWorkspace(authored, { redesign: true, lockedShell: true }), base, gate: async () => null, animated: true });
    expect((await animated.run('read_chassis', '{}')).output).toContain('ScrollScale');
    expect((await box().run('read_chassis', '{}')).output).not.toContain('ScrollScale');
    await branded(animated);
    // Live check 2026-10-30 (Oh Belly i20pm2rq): advice alone was ignored — an animated home with fewer than 2 kit motion parts must be fixed.
    expect((await animated.run('check', '{}')).output).toMatch(/Debes corregir:[\s\S]*movimiento/);
    const still = await branded(box());
    expect((await still.run('check', '{}')).output).not.toMatch(/movimientos/);
  });
  // Token cut 2026-10-30: check hands back its desktop and phone captures, so a run needs no separate screenshot calls.
  it('check returns the desktop and phone captures it took', async () => {
    const b = await branded(box());
    const result = await b.run('check', '{}');
    expect(result.images).toHaveLength(2);
    // Review 2026-10-30: the merchant's progress shows the check's capture now that screenshot calls are rare.
    expect(b.steps.find(step => step.kind === 'check')?.thumbnail).toBeTruthy();
  });
  it('stops screenshots at the limit (8, spec 2026-11-04 §4)', async () => {
    const b = box();
    for (let i = 0; i < HOME_WRITER_LIMITS.screenshots; i++) expect((await b.run('screenshot', JSON.stringify({ width: 390 }))).image).toBeTruthy();
    expect((await b.run('screenshot', JSON.stringify({ width: 390 }))).output).toMatch(/No quedan capturas/);
  });
  it('acceptIfBuildable ships a changed draft whose last check was clean, and nothing else', async () => {
    const untouched = box();
    await untouched.run('check', '{}');
    expect(await untouched.acceptIfBuildable()).toBe(false);
    const b = await branded(box());
    await b.run('write_home', JSON.stringify({ content: b.workspace.read(HOME_PATH).replace('export default function Home', 'export default function Home /* y */') }));
    expect(await b.acceptIfBuildable()).toBe(false);
    await b.run('check', '{}');
    expect(await b.acceptIfBuildable()).toBe(true);
  });
});

// Owner 2026-10-30: YAPI writes each footer; calm brands never shout; the brand's own colour stays; fun stores move on their own.
const FOOTER = `import { store } from './store-data';
export default function StoreFooter() {
  return <footer className="es-footer"><p>{store.name}</p><nav data-pagosya-pages aria-label="Información" />
    <div data-pagosya-subscribe-block><div data-pagosya-subscribe-inline data-track="newsletter" /></div>
    <p>{'\\u00a9'} {new Date().getFullYear()} {store.name} · Pagos seguros con pagosYa</p></footer>;
}
`;
const extra = (ctx: object) => {
  const authored = base.files.filter(f => nextSourceFile(f.path));
  return new HomeWriterToolbox({ workspace: new AgentWorkspace(authored, { redesign: true, lockedShell: true }), base, gate: async () => null, ...ctx });
};

describe('the footer YAPI writes', () => {
  it('swaps the template footer in the Shell once, and leaves a Shell it cannot read alone', () => {
    // The last import spans two lines (the kit Shell's icon list): the new import goes above the first one (studio 2026-11-12).
    const shell = "import { a } from 'b';\nimport { IconA,\n  IconB } from './icons';\nexport default function Shell() { return <div><Header />{children}<Footer /></div>; }";
    const swapped = shellWithStoreFooter(shell)!;
    expect(swapped).toContain("import StoreFooter from './footer';\nimport { a } from 'b';\nimport { IconA,\n  IconB } from './icons';");
    expect(swapped).toContain('<StoreFooter />');
    expect(shellWithStoreFooter(swapped)).toBe(swapped);
    expect(shellWithStoreFooter('export default function Shell() { return <div />; }')).toBeNull();
  });
  it('names each must the footer misses', () => {
    expect(footerProblems(FOOTER)).toEqual([]);
    expect(footerProblems('export default function StoreFooter() { return <footer><p>Hola</p></footer>; }').join(' ')).toMatch(/data-pagosya-pages.*correo.*línea final/);
  });
  it('write_footer saves the file and points the locked Shell at it; check blocks until the footer exists', async () => {
    const b = await branded(extra({ footer: true }));
    expect((await b.run('check', '{}')).output).toMatch(/Falta el pie/);
    expect((await b.run('write_footer', JSON.stringify({ content: FOOTER }))).output).toMatch(/^Pie escrito y compilado\.$/);
    expect(b.workspace.read(FOOTER_PATH)).toBe(FOOTER);
    expect(b.workspace.read('components/Shell.tsx')).toContain('<StoreFooter />');
    expect((await b.run('check', '{}')).output).not.toMatch(/pie/i);
  });
});

describe('calm brands and brand colours', () => {
  it('finds titles written all in capitals, not labels or normal titles', () => {
    expect(shoutedHeadings('<h1 className="x">EL ESPACIO TAMBIÉN ES ESTILO.</h1><h2>Menos ajuste.</h2><p className="es-eyebrow">01 / MANIFIESTO</p>')).toEqual(['EL ESPACIO TAMBIÉN ES ESTILO.']);
    expect(shoutedHeadings("<h2 style={{ textTransform: 'uppercase' }}>Hecho para durar</h2>")).toHaveLength(1);
    expect(shoutedHeadings('<h2>BOXY</h2><h1>Hoodies <br />para diario</h1>')).toEqual([]);
  });
  it('check blocks a shouted title only for a calm brand', async () => {
    const shout = (b: HomeWriterToolbox) => b.workspace.write(HOME_PATH, b.workspace.read(HOME_PATH).replace(/<h1([^>]*)>[\s\S]*?<\/h1>/, '<h1$1>HOODIES PARA TODOS LOS DÍAS</h1>'));
    const calm = await branded(extra({ calm: true })); shout(calm);
    expect((await calm.run('check', '{}')).output).toMatch(/Esta marca es tranquila/);
    const bold = await branded(extra({})); shout(bold);
    expect((await bold.run('check', '{}')).output).not.toMatch(/tranquila/);
  });
  it('set_tokens keeps the brand accent or deep', async () => {
    const b = extra({ brandColours: ['#1b1d33'] });
    const font = (await b.run('read_chassis', '{}')).output.match(/fuentes: ([a-z0-9-]+) \(/)![1];
    expect((await b.run('set_tokens', tokens(font))).output).toMatch(/sus propios colores \(#1b1d33\)/);
    expect((await b.run('set_tokens', JSON.stringify({ ...JSON.parse(tokens(font)), deep: '#20223a' }))).output).toMatch(/^Colores y fuentes guardados/);
    expect(nearColour('#1b1d33', '#c45b3c')).toBe(false);
  });
});

describe('playful stores', () => {
  it('check blocks a fun store whose home only moves on scroll, until two always-moving parts are used', async () => {
    const b = await branded(extra({ playful: true, animated: true }));
    expect((await b.run('check', '{}')).output).toMatch(/Esta tienda es divertida/);
    const home = b.workspace.read(HOME_PATH).replace(/import \{([^}]*)\} from '@pagosya\/ui';/, "import {$1, Float, Sticker, ScrollScale, Marquee } from '@pagosya/ui';")
      .replace(/(<main[^>]*>)/, '$1<Float><Sticker>Nuevo sabor</Sticker></Float>').replace('</main>', '<Marquee items={["Burbujas"]} /><ScrollScale><p>Hola</p></ScrollScale></main>');
    expect((await b.run('write_home', JSON.stringify({ content: home }))).output).toMatch(/compilada/);
    expect((await b.run('check', '{}')).output).not.toMatch(/divertida/);
  });
});

// Live check 2026-10-30 (Oh Belly ujy3rqxr): the writer cannot write CSS, so its own class names (oh-grid) styled nothing.
describe('inventedClasses', () => {
  it('finds class names no stylesheet defines, and none in the template\'s own home, Shell or catalogue pages', () => {
    const css = base.files.find(f => f.path === 'styles/globals.css')!.content;
    for (const path of ['components/home.tsx', 'components/Shell.tsx', 'components/page-productos.tsx']) expect([path, inventedClasses(base.files.find(f => f.path === path)!.content, css)]).toEqual([path, []]);
    expect(inventedClasses('<div className="oh-grid"><div className="es-section oh-media ui-float pagosya-info-nav" /></div>', css)).toEqual(['oh-grid', 'oh-media']);
  });
});

// Spec 2026-11-04 writer on templates §2–3: inside a themed template the footer and fonts are the template's.
describe('HomeWriterToolbox on a template store (Sorbo)', () => {
  let sorbo: Awaited<ReturnType<typeof templateDemoRevision>>;
  beforeAll(async () => {
    const resolved = resolvePresetTemplate(templateManifest('sorbo')!, templateManifest);
    sorbo = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
  });
  const template = { id: 'sorbo', name: 'Sorbo', layout: [{ type: 'cover-split', title: 'Tómate un sorbo', photo: 'slot:in-p1' }, { type: 'products-slider', title: 'Los más pedidos', link: 'products' }] };
  const sorboBox = () => new HomeWriterToolbox({ workspace: new AgentWorkspace(sorbo.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base: sorbo, gate: async () => null, template });

  it('offers no footer tool', () => {
    expect(homeWriterTools({ footer: false }).map(t => t.name)).toEqual(['read_chassis', 'write_home', 'set_tokens', 'check', 'screenshot', 'finish']);
    expect(homeWriterTools({ footer: true }).map(t => t.name)).toContain('write_footer');
  });
  it('read_chassis names the template, its tested sections with an example each, and how to place them', async () => {
    const out = (await sorboBox().run('read_chassis', '{}')).output;
    expect(out).toContain('PLANTILLA Sorbo');
    expect(out).toContain("import { LibraryHome } from './library'");
    expect(out).toContain('- cover-split: {"type":"cover-split","title":"Tómate un sorbo","photo":"slot:in-p1"}');
    expect(out).not.toContain('PIE (');
    // Review 2026-11-04: library sections sit inside <main data-lb-home>, whose overflow clip stops a tilted marquee scrolling sideways on phones.
    expect(out).toContain('<main data-lb-home>');
  });
  it('set_tokens keeps the template\'s fonts whatever fonts it is given', async () => {
    const b = sorboBox();
    const before = templateFonts(b.workspace.read('styles/globals.css'));
    expect(before).toEqual({ heading: 'dm-sans', body: 'space-mono' });
    const other = SOURCE_FONT_CATALOG.find(font => font.id !== before!.heading && font.id !== before!.body)!.id;
    const out = (await b.run('set_tokens', JSON.stringify({ paper: '#fbf8f2', ink: '#1d2a22', muted: '#efe7da', accent: '#2f6b4a', deep: '#1f3a2b', heading: other, body: other }))).output;
    expect(out).toMatch(/^Colores guardados\. Las fuentes son de la plantilla Sorbo/);
    expect(templateFonts(b.workspace.read('styles/globals.css'))).toEqual(before);
  });
  it('reads the fonts by role, so a template with one face for titles and text keeps its label font (Palo Alto)', () => {
    const css = masterThemeBlock({ paper: '#ffffff', ink: '#111111', muted: '#eeeeee', accent: '#2255aa', deep: '#112244' }, 'archivo', 'archivo', 'space-mono');
    expect(templateFonts(css)).toEqual({ heading: 'archivo', body: 'archivo', mono: 'space-mono' });
  });
  // Spike 2026-11-12 (YAPI_STUDIO): Lovable's way — the design system (colours and fonts) is the store's own.
  const studioBox = () => new HomeWriterToolbox({ workspace: new AgentWorkspace(sorbo.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base: sorbo, gate: async () => null, template, studio: true });
  it('studio: set_tokens takes the brand\'s own fonts on a template, keeping its label font', async () => {
    const b = studioBox();
    const out = (await b.run('set_tokens', JSON.stringify({ paper: '#fbf8f2', ink: '#1d2a22', muted: '#efe7da', accent: '#2f6b4a', deep: '#1f3a2b', heading: 'fraunces', body: 'figtree' }))).output;
    expect(out).toMatch(/^Colores y fuentes guardados/);
    expect(templateFonts(b.workspace.read('styles/globals.css'))).toMatchObject({ heading: 'fraunces', body: 'figtree' });
  });
  it('studio: check asks for the design system first and refuses colours written by hand', async () => {
    const b = studioBox();
    const home = b.workspace.read(HOME_PATH).replace('<Shell>', '<Shell><section style={{ background: \'#ff3300\' }}>Hola</section>');
    b.workspace.write(HOME_PATH, home);
    const first = (await b.run('check', '{}')).output;
    expect(first).toMatch(/Empieza por el sistema de diseño/);
    expect(first).toMatch(/colores escritos a mano: #ff3300/);
  });
  it('studio: check refuses a kit variable that does not exist', async () => {
    const b = studioBox();
    await b.run('set_tokens', JSON.stringify({ paper: '#fbf8f2', ink: '#1d2a22', muted: '#efe7da', accent: '#2f6b4a', deep: '#1f3a2b', heading: 'fraunces', body: 'figtree' }));
    b.workspace.write(HOME_PATH, b.workspace.read(HOME_PATH).replace('<Shell>', '<Shell><h2 style={{ fontFamily: \'var(--es-font-heading)\' }}>Hola mundo bonito</h2>'));
    expect((await b.run('check', '{}')).output).toMatch(/no existen en el sistema de diseño: --es-font-heading/);
  });
  it('studio: check refuses a home that hides the photos of the product cards (NOA studio3 2026-11-12)', async () => {
    const b = studioBox();
    b.workspace.write(HOME_PATH, b.workspace.read(HOME_PATH).replace('<Shell>', '<Shell><style>{`.es-catalog .es-card__media{display:none!important}`}</style>'));
    expect((await b.run('check', '{}')).output).toMatch(/tarjetas de producto sin su foto: \.es-catalog \.es-card__media/);
  });
  it('write_footer is refused', async () => {
    expect((await sorboBox().run('write_footer', JSON.stringify({ content: 'export default function StoreFooter() { return <footer />; }' }))).output).toBe('Esta tienda usa el pie de su plantilla; no escribas uno.');
  });
  it('studio: the store writes its own footer (owner 2026-11-12 «the footer is the same always»)', async () => {
    const b = new HomeWriterToolbox({ workspace: new AgentWorkspace(sorbo.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base: sorbo, gate: async () => null, template, studio: true, footer: true });
    const chassis = (await b.run('read_chassis', '{}')).output;
    expect(chassis).toContain('PIE (components/footer.tsx');
    expect(chassis).toContain('El pie lo escribes tú.');
    expect((await b.run('check', '{}')).output).toMatch(/Falta el pie/);
    expect((await b.run('write_footer', JSON.stringify({ content: 'export default function StoreFooter() { return <footer />; }' }))).output).not.toMatch(/pie de su plantilla/);
    expect(b.workspace.read('components/Shell.tsx')).toContain('<StoreFooter />');
  });
});

describe('the visual review at finish (spec 2026-11-04 §5)', () => {
  // The template's own home passes check (see «check on the branded template home…»), so it stands in for a writer's good home.
  const goodHome = () => base.files.find(file => file.path === HOME_PATH)!.content;
  const reviewBox = (reviewer: jest.Mock) => new HomeWriterToolbox({ workspace: new AgentWorkspace(base.files.filter(f => nextSourceFile(f.path)), { redesign: true, lockedShell: true }), base, gate: async () => null, reviewer });
  const ready = async (b: HomeWriterToolbox) => { await branded(b); await b.run('write_home', JSON.stringify({ content: goodHome() })); await b.run('check', '{}'); return b; };
  const changed = (n: string) => goodHome().replace('</Shell>', `<p style={{ margin: 0 }}>Gracias ${n}.</p></Shell>`);

  it('problems go back to the writer; finishing unchanged is refused; after a fix the second review passes and it saves', async () => {
    const reviewer = jest.fn().mockResolvedValueOnce(['título tocado o tapado por una imagen — portada: separa el título de la foto']).mockResolvedValueOnce([]);
    const b = await ready(reviewBox(reviewer));
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toMatch(/^Revisión visual — Debes corregir:/);
    expect(reviewer.mock.calls[0][0]).toHaveLength(2);
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toMatch(/^Todavía no corregiste lo que encontró la revisión/);
    expect(reviewer).toHaveBeenCalledTimes(1);
    await b.run('write_home', JSON.stringify({ content: changed('uno') })); await b.run('check', '{}');
    expect((await b.run('finish', '{"summary":"Listo"}')).output).toBe('Listo.');
    expect(reviewer).toHaveBeenCalledTimes(2);
  });
  it('after two rounds the clean draft saves without a third review', async () => {
    const reviewer = jest.fn().mockResolvedValue(['palabras cortadas — portada: acorta el titular']);
    const b = await ready(reviewBox(reviewer));
    await b.run('finish', '{"summary":"x"}');
    await b.run('write_home', JSON.stringify({ content: changed('uno') })); await b.run('check', '{}');
    await b.run('finish', '{"summary":"x"}');
    await b.run('write_home', JSON.stringify({ content: changed('dos') })); await b.run('check', '{}');
    expect((await b.run('finish', '{"summary":"x"}')).output).toBe('Listo.');
    expect(reviewer).toHaveBeenCalledTimes(2);
  });
  it('a review that errors never blocks the save', async () => {
    const b = await ready(reviewBox(jest.fn().mockRejectedValue(new Error('provider down'))));
    expect((await b.run('finish', '{"summary":"x"}')).output).toBe('Listo.');
  });
  it('a fix cut off by the limit before its check falls back to the last clean draft, never losing it (review 2026-11-04 I2)', async () => {
    const b = await ready(reviewBox(jest.fn().mockResolvedValue(['palabras cortadas — portada: acorta'])));
    const clean = b.workspace.read(HOME_PATH);
    await b.run('finish', '{"summary":"x"}');
    await b.run('write_home', JSON.stringify({ content: changed('a medias') }));
    expect(b.draftIsClean()).toBe(false);
    expect(await b.acceptIfBuildable()).toBe(true);
    expect(b.workspace.read(HOME_PATH)).toBe(clean);
  });
  it('out of time with a clean draft, it saves even when the last review found problems', async () => {
    const b = await ready(reviewBox(jest.fn().mockResolvedValue(['palabras cortadas — portada: acorta'])));
    await b.run('finish', '{"summary":"x"}');
    expect(await b.acceptIfBuildable()).toBe(true);
  });
});
