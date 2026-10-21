import { AgentWorkspace } from './agent-workspace';

const base = [
  { path: 'components/home.tsx', content: 'export default function Home() {\n  return <main>\n    <h1>Hola</h1>\n  </main>;\n}' },
  { path: 'components/store-data.tsx', content: 'export const store = { name: "Café" };' },
  { path: 'styles/globals.css', content: '.a { color: red; }\n.b { color: blue; }' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
];

describe('AgentWorkspace', () => {
  it('lists and reads only authored files', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    expect(ws.list()).toEqual(['components/home.tsx', 'components/store-data.tsx', 'styles/globals.css']);
    expect(ws.read('components/home.tsx')).toContain('<h1>Hola</h1>');
    expect(() => ws.read('config.js')).toThrow('no se puede');
  });
  it('applies a unique edit and bumps the version', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    expect(ws.edit('components/home.tsx', '<h1>Hola</h1>', '<h1>Chau</h1>')).toEqual({ ok: true });
    expect(ws.read('components/home.tsx')).toContain('<h1>Chau</h1>');
    expect(ws.version).toBe(1);
    expect(ws.changedPaths()).toEqual(['components/home.tsx']);
  });
  it('reports missing and ambiguous searches with an excerpt and changes nothing', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    expect(ws.edit('components/home.tsx', 'nope', 'x')).toMatchObject({ ok: false, reason: 'missing', excerpt: expect.stringContaining('Hola') });
    expect(ws.edit('styles/globals.css', 'color', 'x')).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(ws.version).toBe(0);
  });
  it('keeps the platform-written store data read-only', () => {
    const ws = new AgentWorkspace(base, { redesign: true });
    expect(ws.edit('components/store-data.tsx', 'Café', 'Otro')).toMatchObject({ ok: false, reason: 'path' });
    expect(ws.write('components/store-data.tsx', 'x')).toMatchObject({ ok: false, reason: 'path' });
    expect(ws.editBatch('components/store-data.tsx', [{ search: 'Café', replacement: 'Otro' }])).toMatchObject({ ok: false, reason: 'path' });
  });
  it('commits an ordered batch once and rolls back all edits if a later search fails', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    const path = 'components/home.tsx';
    expect(ws.editBatch(path, [{ search: 'Hola', replacement: 'Chau' }, { search: 'missing', replacement: 'x' }])).toMatchObject({ ok: false, reason: 'missing' });
    expect(ws.read(path)).toBe(base[0].content);
    expect(ws.version).toBe(0);
    expect(ws.changedPaths()).toEqual([]);
    expect(ws.editBatch(path, [{ search: 'Hola', replacement: 'Chau' }, { search: '<h1>Chau</h1>', replacement: '<h1>Bienvenidos</h1>' }])).toEqual({ ok: true });
    expect(ws.read(path)).toContain('<h1>Bienvenidos</h1>');
    expect(ws.version).toBe(1);
  });
  it('writes new components, refuses other paths, and replaces a file only when most lines stay or in a redesign', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    expect(ws.write('components/Hero.tsx', 'export function Hero() { return null; }')).toEqual({ ok: true });
    expect(ws.write('server.mjs', 'x')).toMatchObject({ ok: false, reason: 'path' });
    expect(ws.write('styles/globals.css', 'body { margin: 0; }')).toMatchObject({ ok: false, reason: 'rewrite' });
    expect(ws.write('styles/globals.css', '.a { color: red; }\n.b { color: green; }\n.c { color: blue; }')).toEqual({ ok: true });
    expect(new AgentWorkspace(base, { redesign: true }).write('styles/globals.css', 'body { margin: 0; }')).toEqual({ ok: true });
  });
  it('lets a store kept on its template replace whole components, never its stylesheet', () => {
    const ws = new AgentWorkspace(base, { redesign: false, rewriteComponents: true });
    expect(ws.write('components/home.tsx', 'export default function Home() { return <h1>Panadería Trigo</h1>; }')).toEqual({ ok: true });
    expect(ws.write('styles/globals.css', 'body { margin: 0; }')).toMatchObject({ ok: false, reason: 'rewrite' });
    expect(new AgentWorkspace(base, { redesign: false }).write('components/home.tsx', 'export default function Home() { return null; }')).toMatchObject({ ok: false, reason: 'rewrite' });
  });
  it('returns every file in the original order with new files last', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    ws.edit('components/home.tsx', 'Hola', 'Chau');
    ws.write('components/Hero.tsx', 'export function Hero() { return null; }');
    expect(ws.files().map(f => f.path)).toEqual(['components/home.tsx', 'components/store-data.tsx', 'styles/globals.css', 'config.js', 'components/Hero.tsx']);
  });
});

describe('design file budget and delete_file (stress test 2026-10-21)', () => {
  const standard = (name: string) => ({ path: `components/pages/${name}.tsx`, content: `// @pagosya-page\nexport default function P() { return null; }` });
  const component = (i: number) => ({ path: `components/Part${i}.tsx`, content: `export function Part${i}() { return null; }` });
  it('standard pages do not count, so a template store still has room for its own pages', () => {
    const ws = new AgentWorkspace([...base, ...['faq', 'about', 'terms', 'privacy', 'shipping', 'contact', 'cookies', 'refund-policy', 'not-found'].map(standard)], { redesign: false });
    expect(ws.designBudget()).toEqual({ used: 3, max: 32 });
    for (let i = 0; i < 29; i++) expect(ws.write(`components/Part${i}.tsx`, 'export const x = 1;')).toEqual({ ok: true });
    expect(ws.write('components/page-extra.tsx', 'export default function E() { return null; }')).toMatchObject({ ok: false, reason: 'budget' });
  });
  it('a full draft is told at the write, and frees room by deleting a component', () => {
    const ws = new AgentWorkspace([...base, ...Array.from({ length: 29 }, (_, i) => component(i))], { redesign: false });
    expect(ws.write('components/page-novias.tsx', 'export default function N() { return null; }')).toMatchObject({ ok: false, reason: 'budget', message: expect.stringContaining('delete_file') });
    expect(ws.remove('components/Part0.tsx')).toEqual({ ok: true });
    expect(ws.write('components/page-novias.tsx', 'export default function N() { return null; }')).toEqual({ ok: true });
    expect(ws.changedPaths()).toEqual(expect.arrayContaining(['components/Part0.tsx', 'components/page-novias.tsx']));
  });
  it('never deletes required files, standard pages or platform data', () => {
    const ws = new AgentWorkspace([...base, standard('faq')], { redesign: false });
    expect(ws.remove('components/home.tsx')).toMatchObject({ ok: false, reason: 'protected' });
    expect(ws.remove('styles/globals.css')).toMatchObject({ ok: false, reason: 'protected' });
    expect(ws.remove('components/pages/faq.tsx')).toMatchObject({ ok: false, reason: 'protected' });
    expect(ws.remove('components/store-data.tsx')).toMatchObject({ ok: false, reason: 'path' });
    expect(ws.remove('config.js')).toMatchObject({ ok: false, reason: 'path' });
  });
  it('a resumed checkpoint keeps a deletion', () => {
    const ws = new AgentWorkspace([...base, component(1)], { redesign: false });
    ws.restore(base, true);
    expect(ws.files().map(f => f.path)).not.toContain('components/Part1.tsx');
    const plain = new AgentWorkspace([...base, component(1)], { redesign: false });
    plain.restore(base);
    expect(plain.files().map(f => f.path)).toContain('components/Part1.tsx');
  });
});
