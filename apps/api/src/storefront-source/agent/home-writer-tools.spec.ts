import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from '../source-templates';
import { nextSourceFile } from '../source-next';
import { MASTER_THEME_END, MASTER_THEME_START } from '../source-master';
import { AgentWorkspace } from './agent-workspace';
import { HomeWriterToolbox, HOME_PATH, HOME_WRITER_TOOLS } from './home-writer-tools';

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
  it('offers exactly the six tools', () => {
    expect(HOME_WRITER_TOOLS.map(t => t.name)).toEqual(['read_chassis', 'write_home', 'set_tokens', 'check', 'screenshot', 'finish']);
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
  it('stops screenshots after four', async () => {
    const b = box();
    for (let i = 0; i < 4; i++) expect((await b.run('screenshot', JSON.stringify({ width: 390 }))).image).toBeTruthy();
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
