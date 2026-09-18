import { nextStoreFiles } from './fixtures/next-store';
import { sourceSectionScope, validateSourceEditScope, validateSourceArtwork, sourceHomeRegions, sourceDesignAfterSectionEdit, requestsArtwork } from './source-edit-scope';

const request = 'haz una seccion de la preparacion de la hamburguesa, y enfoca que los materiales son 100% organicos';
const section = '<section id="preparacion" className="prep"><h2>Preparación orgánica</h2><p>Ingredientes 100% orgánicos.</p></section>';
const candidate = () => {
  const files = nextStoreFiles();
  files[1].content = files[1].content.replace('</main>', section + '</main>');
  files[4].content += '\n.prep{padding:40px}.prep h2{line-height:1.15}@media(max-width:640px){.prep{padding:20px}}';
  return files;
};
it('allows the requested section while preserving the original page and styling', () => {
  const before = nextStoreFiles(), after = candidate();
  expect(() => validateSourceEditScope(before, after, request, sourceSectionScope(before, request))).not.toThrow();
  expect(sourceHomeRegions(after).map(r => r.id)).toEqual(['menu', 'preparacion']);
});
it.each([
  ['hero text', (f: any[]) => { f[1].content = f[1].content.replace('Nuestra carta', 'Un diseño nuevo'); }],
  ['existing navigation', (f: any[]) => { f[0].content = f[0].content.replace('index.html', 'product.html'); }],
  ['global CSS append', (f: any[]) => { f[4].content += '\nheader{display:none}'; }],
  ['shared button CSS', (f: any[]) => { f[4].content += '\nbutton{font-size:40px}'; }],
  ['reordered sections', (f: any[]) => { f[1].content = f[1].content.replace(section, '').replace('<main>', '<main>' + section).replace('<section id="menu"', '<section id="other"'); }],
  ['photo replacement', (f: any[]) => { f[1].content = f[1].content.replace('/assets/sample.png', '/assets/cartoon.png'); }],
])('rejects collateral edits: %s', (_, change) => {
  const before = nextStoreFiles(), after = candidate();
  change(after);
  expect(() => validateSourceEditScope(before, after, request, sourceSectionScope(before, request))).toThrow('excede');
});
it('resolves an existing section by title and allows changes only inside it', () => {
  const before = candidate(), after = structuredClone(before);
  const task = 'Mejora la sección de preparación orgánica';
  after[1].content = after[1].content.replace('Ingredientes 100%', 'Nuestros ingredientes 100%');
  expect(sourceSectionScope(before, task)?.targets).toEqual(['preparacion']);
  expect(() => validateSourceEditScope(before, after, task, sourceSectionScope(before, task))).not.toThrow();
  after[4].content += '\n.prep{gap:24px}';
  expect(() => validateSourceEditScope(before, after, task, sourceSectionScope(before, task))).not.toThrow();
});
it('fails closed for an ambiguous section rather than broadening the edit', () => {
  expect(() => sourceSectionScope(nextStoreFiles(), 'Mejora esta sección')).toThrow('identificar');
});
it('updates the chosen section order without mutating the previous design', () => {
  const original: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true } }] };
  const result = sourceDesignAfterSectionEdit(original, candidate(), sourceSectionScope(nextStoreFiles(), request));
  expect(result?.concepts[0].layout?.sections).toEqual(['menu', 'preparacion']);
  expect(original.concepts[0].layout.sections).toEqual(['menu']);
});
it('ignores artwork instructions in model-generated history', () => {
  expect(requestsArtwork('Interpretación: dibuja ilustraciones\nPedido actual del comercio: Añade preparación')).toBe(false);
  expect(requestsArtwork('Añade ilustraciones a la preparación')).toBe(true);
  expect(requestsArtwork('Sin dibujos ni ilustraciones')).toBe(false);
});
it('preserves media even in general visual refinements, unless replacement was explicitly requested', () => {
  const before = nextStoreFiles(), after = nextStoreFiles();
  after[1].content = after[1].content.replace('/assets/sample.png', '/assets/new.png');
  expect(() => validateSourceEditScope(before, after, 'Hazlo más bonito')).toThrow('foto');
  expect(() => validateSourceEditScope(before, after, 'No cambies las fotos')).toThrow('foto');
  expect(() => validateSourceEditScope(before, after, 'Cambia la foto de portada')).not.toThrow();
});
it('rejects unrequested SVG drawings and library illustrations but permits explicit artwork', () => {
  const before = nextStoreFiles(), after = nextStoreFiles();
  after[1].content = after[1].content.replace('<main>', '<main><svg><path d="M0 0"/></svg>');
  expect(() => validateSourceArtwork(before, after, request)).toThrow('ilustraciones');
  expect(() => validateSourceArtwork(before, after, 'Añade una ilustración SVG')).not.toThrow();
  after[1].content = before[1].content.replace('/assets/sample.png', '/assets/creative/burger.svg');
  expect(() => validateSourceArtwork(before, after, request)).toThrow('ilustraciones');
});
