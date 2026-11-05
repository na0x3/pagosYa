import { visibleChanges } from './source-visible-change';
import { templateStoreDataFile } from './source-templates';
import { MASTER_THEME_START, MASTER_THEME_END, type MasterLook } from './source-master';

const look: MasterLook = { palette: 'mono', fonts: 'zancada', colors: { accent: '#dfff1f' } };
const copy = { headline: 'Hola' } as never;
const data = (layout: unknown[], extra: Record<string, unknown> = {}) => templateStoreDataFile({ name: 'goodProtein' }, { hero: '' },
  { copy, look, variants: { theme: 'zancada', sections: [] } as never, layout, productLayout: [], ...extra });
const library = `const CoverSplit = () => null;\nfunction FaqSplit() { return null; }\nconst SECTIONS = {\n  'cover-split': CoverSplit, 'faq-split': FaqSplit,\n};\nexport function LibraryHome() { return null; }\n`;
const store = (over: Record<string, string> = {}, layout: unknown[] = [{ type: 'cover-split', title: 'Hola' }], extra: Record<string, unknown> = {}) => [
  data(layout, extra),
  { path: 'styles/globals.css', content: over.css ?? `${MASTER_THEME_START}\n:root{--es-accent:#dfff1f;--es-paper:#1f1f1f}\n${MASTER_THEME_END}\n.lb-cover{color:var(--es-accent)}\n.es-btn{padding:4px}` },
  { path: 'config.js', content: over.config ?? `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'panel' } }, data: { items: [1] } })};\n` },
  { path: 'components/library.tsx', content: over.library ?? library },
  { path: 'components/home.tsx', content: over.home ?? 'export default function Home() { return null; }\n' },
];

describe('visible changes', () => {
  it('nothing changed, nothing to see', () => {
    expect(visibleChanges(store(), store())).toEqual([]);
  });

  it('a layout change shows on the home', () => {
    expect(visibleChanges(store(), store({}, [{ type: 'cover-split', title: 'Proteína buena' }]))).toEqual(['home']);
  });

  it('classic copy does not show on a template home', () => {
    const after = store();
    after[0] = templateStoreDataFile({ name: 'goodProtein' }, { hero: '' }, { copy: { headline: 'Otro' } as never, look, variants: { theme: 'zancada', sections: [] } as never, layout: [{ type: 'cover-split', title: 'Hola' }], productLayout: [] });
    expect(visibleChanges(store(), after)).toEqual([]);
  });

  it('a menu page\'s sections show, and so does a design change to a section only a menu page draws (minor 2026-11-05)', () => {
    const about = { pageLayouts: { about: [{ type: 'faq-split', title: 'Preguntas' }] } };
    expect(visibleChanges(store(), store({}, undefined, about))).toEqual(['pages']);
    const redrawn = library.replace("'faq-split': FaqSplit", "'faq-split': FaqCards").replace('export function LibraryHome', 'function FaqCards() { return null; }\nexport function LibraryHome');
    expect(visibleChanges(store({}, undefined, about), store({ library: redrawn }, undefined, about))).toEqual(['components']);
  });

  it('a product page layout and a menu change show', () => {
    expect(visibleChanges(store(), store({}, undefined, { productLayout: [{ type: 'faq-split', title: 'Dudas' }] }))).toEqual(['productPage']);
    const menu = store({ config: `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'dropdowns' } }, data: { items: [1] } })};\n` });
    expect(visibleChanges(store(), menu)).toEqual(['settings']);
  });

  it('a catalogue refresh in config.js is not a change the merchant asked for', () => {
    const refreshed = store({ config: `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'panel' } }, data: { items: [1, 2] } })};\n` });
    expect(visibleChanges(store(), refreshed)).toEqual([]);
  });

  it('a colour shows only when the page paints with it', () => {
    const accent = store({ css: `${MASTER_THEME_START}\n:root{--es-accent:#2f5d46;--es-paper:#1f1f1f}\n${MASTER_THEME_END}\n.lb-cover{color:var(--es-accent)}\n.es-btn{padding:4px}` });
    expect(visibleChanges(store(), accent)).toEqual(['colours']);
    const paper = store({ css: `${MASTER_THEME_START}\n:root{--es-accent:#dfff1f;--es-paper:#ffffff}\n${MASTER_THEME_END}\n.lb-cover{color:var(--es-accent)}\n.es-btn{padding:4px}` });
    expect(visibleChanges(store(), paper)).toEqual([]);
  });

  it('a new component nothing draws does not show; one a section uses does', () => {
    const added = library.replace("const SECTIONS = {\n  'cover-split': CoverSplit, 'faq-split': FaqSplit,", "function ProteinGuide() { return null; }\nconst SECTIONS = {\n  'cover-split': CoverSplit, 'faq-split': FaqSplit, 'protein-guide': ProteinGuide,");
    const css = `${MASTER_THEME_START}\n:root{--es-accent:#dfff1f;--es-paper:#1f1f1f}\n${MASTER_THEME_END}\n.lb-cover{color:var(--es-accent)}\n.es-btn{padding:4px}\n.lb-protein{display:grid}`;
    expect(visibleChanges(store(), store({ library: added, css }))).toEqual([]);
    expect(visibleChanges(store(), store({ library: added, css }, [{ type: 'cover-split', title: 'Hola' }, { type: 'protein-guide' }]))).toEqual(['home', 'components']);
  });

  it('a changed component that is drawn shows, and so does a change to an existing style rule', () => {
    expect(visibleChanges(store(), store({ library: library.replace('function FaqSplit() { return null; }', 'function FaqSplit() { return <section />; }') }))).toEqual(['components']);
    expect(visibleChanges(store(), store({ css: `${MASTER_THEME_START}\n:root{--es-accent:#dfff1f;--es-paper:#1f1f1f}\n${MASTER_THEME_END}\n.lb-cover{color:var(--es-accent)}\n.es-btn{padding:8px}` }))).toEqual(['styles']);
  });

  it('the announcement and the footer line show on a template home (spec 2026-11-03 E1)', () => {
    const after = store();
    after[0] = templateStoreDataFile({ name: 'goodProtein' }, { hero: '' }, { copy: { headline: 'Hola', announcement: 'Envío gratis' } as never, look, variants: { theme: 'zancada', sections: [] } as never, layout: [{ type: 'cover-split', title: 'Hola' }], productLayout: [] });
    expect(visibleChanges(store(), after)).toEqual(['chrome']);
  });

  it('a policy or the about text in the store data shows; the catalogue alone does not (spec 2026-11-03 E2)', () => {
    const config = (data: Record<string, unknown>) => store({ config: `window.PAGOSYA_CONFIG = ${JSON.stringify({ header: { menu: { style: 'panel' } }, data: { items: [1], ...data } })};\n` });
    expect(visibleChanges(store(), config({ policies: { returns: 'Siete días.' } }))).toEqual(['pages']);
    expect(visibleChanges(config({ aboutText: 'A' }), config({ aboutText: 'B', items: [1, 2] }))).toEqual(['pages']);
    expect(visibleChanges(config({ faq: [] }), config({ faq: [], items: [3] }))).toEqual([]);
  });
});

it('a page YAPI made shows as a page change (spec 2026-11-05 creates anything)', () => {
  const page = { extraPages: [{ slug: 'novias', name: 'Novias', menu: '', layout: [{ type: 'story-split', title: 'Novias' }] }] };
  expect(visibleChanges(store(), store({}, undefined, page as never))).toEqual(['pages']);
});
