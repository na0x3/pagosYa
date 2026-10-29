import { touchStaysInside } from './source-guarded-touch';

// Owner 2026-10-27: a guarded touch may add one section and its .es-touch styles, nothing else.
describe('the guarded touch', () => {
  const home = "import Shell from './Shell';\nexport default function Home() { return <Shell><main>\n<section id=\"inicio\" />\n<section id=\"productos\" />\n</main></Shell>; }\n";
  const css = '.es-hero{color:red}\n';
  const base = [{ path: 'components/home.tsx', content: home }, { path: 'styles/globals.css', content: css }, { path: 'components/store-data.tsx', content: 'export const copy = {};' }, { path: 'index.html', content: '<html>' }];
  const touched = (changes: Record<string, string>) => base.map(file => changes[file.path] !== undefined ? { ...file, content: changes[file.path] } : file).concat(changes['components/touch.tsx'] ? [{ path: 'components/touch.tsx', content: changes['components/touch.tsx'] }] : []);
  it('accepts one new section, its line in home and its .es-touch styles; built files may change', () => {
    const after = touched({ 'components/touch.tsx': 'export default function Touch() { return <section id="toque" className="es-touch" />; }',
      'components/home.tsx': home.replace("import Shell from './Shell';", "import Shell from './Shell';\nimport Touch from './touch';").replace('<section id="productos" />', '<Touch />\n<section id="productos" />'),
      'styles/globals.css': `${css}.es-touch{padding:24px}\n@media (max-width:760px){.es-touch{padding:12px}}\n`, 'index.html': '<html lang="es">' });
    expect(touchStaysInside(base, after)).toEqual({ ok: true });
  });
  it('undoes a touch that changes the hero, other styles or the store data', () => {
    expect(touchStaysInside(base, touched({ 'components/home.tsx': home.replace('<section id="inicio" />', '<section id="inicio" className="x" />') })).ok).toBe(false);
    expect(touchStaysInside(base, touched({ 'styles/globals.css': `${css}.es-hero{color:blue}\n` })).ok).toBe(false);
    expect(touchStaysInside(base, touched({ 'styles/globals.css': '.es-hero{color:blue}\n' })).ok).toBe(false);
    expect(touchStaysInside(base, touched({ 'components/store-data.tsx': 'export const copy = { a: 1 };' })).ok).toBe(false);
  });
  it('lets the save rewrite the photo and feature lines of the store data', () => {
    const before = base.map(file => file.path === 'components/store-data.tsx' ? { ...file, content: 'export const copy = {};\nexport const photos = {"p1":"http://x/u.jpg"};' } : file);
    const after = before.map(file => file.path === 'components/store-data.tsx' ? { ...file, content: 'export const copy = {};\nexport const photos = {"p1":"assets/a.jpg"};' } : file);
    expect(touchStaysInside(before, after)).toEqual({ ok: true });
  });
});
