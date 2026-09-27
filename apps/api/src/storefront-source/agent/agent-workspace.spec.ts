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
  });
  it('writes new components, refuses other paths, and replaces a file only when most lines stay or in a redesign', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    expect(ws.write('components/Hero.tsx', 'export function Hero() { return null; }')).toEqual({ ok: true });
    expect(ws.write('server.mjs', 'x')).toMatchObject({ ok: false, reason: 'path' });
    expect(ws.write('styles/globals.css', 'body { margin: 0; }')).toMatchObject({ ok: false, reason: 'rewrite' });
    expect(ws.write('styles/globals.css', '.a { color: red; }\n.b { color: green; }\n.c { color: blue; }')).toEqual({ ok: true });
    expect(new AgentWorkspace(base, { redesign: true }).write('styles/globals.css', 'body { margin: 0; }')).toEqual({ ok: true });
  });
  it('returns every file in the original order with new files last', () => {
    const ws = new AgentWorkspace(base, { redesign: false });
    ws.edit('components/home.tsx', 'Hola', 'Chau');
    ws.write('components/Hero.tsx', 'export function Hero() { return null; }');
    expect(ws.files().map(f => f.path)).toEqual(['components/home.tsx', 'components/store-data.tsx', 'styles/globals.css', 'config.js', 'components/Hero.tsx']);
  });
});
