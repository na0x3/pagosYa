import { nextStoreFiles } from './fixtures/next-store';
import { sourceSectionScope, validateSourceEditScope, validateSourceArtwork, sourceHomeRegions, sourceDesignAfterSectionEdit, requestsArtwork } from './source-edit-scope';

import { sourceSectionScopePrompt } from './source-edit-scope';

describe('an explicit section selection', () => {
  const withPrep = () => { const files = nextStoreFiles(); files[1].content = files[1].content.replace('</main>', '<section id="preparacion" className="prep"><h2>Preparación</h2></section></main>'); return files; };

  it('scopes a request that names no section to the selected one', () => {
    const scope = sourceSectionScope(withPrep(), 'hazlo más grande', 'preparacion');
    expect(scope).toMatchObject({ add: false, targets: ['preparacion'], selected: 'preparacion' });
    expect(scope!.original.map(region => region.id)).toEqual(['menu', 'preparacion']);
  });
  it('says the selected section is gone instead of editing the whole page', () => {
    expect(() => sourceSectionScope(nextStoreFiles(), 'hazlo más grande', 'ghost')).toThrow('La sección seleccionada ya no existe. Vuelve a seleccionarla.');
  });
  it('lets a whole-site redesign win over a selection', () => {
    expect(sourceSectionScope(withPrep(), 'Rediseña todo el sitio con otro estilo', 'preparacion')).toBeUndefined();
  });
  it('keeps an add-a-section request as an addition', () => {
    expect(sourceSectionScope(withPrep(), 'agrega una sección de preguntas frecuentes', 'preparacion')).toMatchObject({ add: true, targets: [] });
  });
  it('behaves exactly as before when no section is selected', () => {
    expect(() => sourceSectionScope(nextStoreFiles(), 'Mejora esta sección')).toThrow('identificar');
    expect(sourceSectionScope(nextStoreFiles(), 'hazlo más grande')).toBeUndefined();
    expect(sourceSectionScope(nextStoreFiles(), 'hazlo más grande', undefined)).toBeUndefined();
  });
  it('tells the model which section was explicitly selected, and only then', () => {
    const selected = sourceSectionScopePrompt(sourceSectionScope(withPrep(), 'hazlo más grande', 'preparacion'));
    expect(selected).toContain('explicitly selected section "preparacion"');
    expect(sourceSectionScopePrompt(sourceSectionScope(withPrep(), 'Mejora la preparación'))).not.toContain('explicitly selected');
  });
  it('an edit inside the selected section passes validation and one outside it is refused', () => {
    const before = withPrep();
    const inside = withPrep(); inside[1].content = inside[1].content.replace('<h2>Preparación</h2>', '<h2>Preparación cuidada</h2>');
    const outside = withPrep(); outside[1].content = outside[1].content.replace('Nuestra carta', 'Un diseño nuevo');
    const scope = sourceSectionScope(before, 'hazlo más grande', 'preparacion');
    expect(() => validateSourceEditScope(before, inside, 'hazlo más grande', scope)).not.toThrow();
    expect(() => validateSourceEditScope(before, outside, 'hazlo más grande', scope)).toThrow();
  });
});

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
  const original: any = { selected: 0, concepts: [{ layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
    story: { beats: [{ section: 'menu', role: 'offer', headline: 'Elige', media: 'product' }] }, motion: { scenes: [{ section: 'menu', kind: 'sequence', intensity: 1 }] } }] };
  const result = sourceDesignAfterSectionEdit(original, candidate(), sourceSectionScope(nextStoreFiles(), request));
  expect(result?.concepts[0].layout?.sections).toEqual(['menu', 'preparacion']);
  expect(result?.concepts[0].story?.beats.map(beat => beat.section)).toEqual(['menu']);
  expect(result?.concepts[0].motion?.scenes.map(scene => scene.section)).toEqual(['menu']);
  expect(original.concepts[0].layout.sections).toEqual(['menu']);
});
it('ignores artwork instructions in model-generated history', () => {
  expect(requestsArtwork('Interpretación: dibuja ilustraciones\nPedido actual del comercio: Añade preparación')).toBe(false);
  expect(requestsArtwork('Añade ilustraciones a la preparación')).toBe(true);
  expect(requestsArtwork('Sin dibujos ni ilustraciones')).toBe(false);
});
it('lets a Plantilla demo photo give way to the merchant’s own photos, while the merchant’s photos stay protected', () => {
  const storeData = (photos: Record<string, string>) => ({ path: 'components/store-data.tsx', content: `export const photos: Record<string, string> = ${JSON.stringify(photos)};\n` });
  const before = [storeData({ hero: 'assets/template-pausa-hero.jpg', p1: '/v1/uploads/merchant-a.jpg' })];
  const demoReplaced = [storeData({ hero: '/v1/uploads/merchant-b.jpg', p1: '/v1/uploads/merchant-a.jpg' })];
  expect(() => validateSourceEditScope(before, demoReplaced, 'sisi porfa')).not.toThrow();
  const merchantDropped = [storeData({ hero: 'assets/template-pausa-hero.jpg', p1: '/v1/uploads/merchant-b.jpg' })];
  expect(() => validateSourceEditScope(before, merchantDropped, 'sisi porfa')).toThrow('foto');
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
it('allows only the DNA motif files the platform declared, never an unrequested inline drawing', () => {
  const before = nextStoreFiles(), after = nextStoreFiles();
  after[1].content = after[1].content.replace('<main>', '<main><img src="motifs/lampara.svg" alt="" aria-hidden="true" />');
  expect(() => validateSourceArtwork(before, after, request, ['motifs/lampara.svg'])).not.toThrow();
  // A motif the DNA did not declare is unrequested art, whichever way the page references it.
  expect(() => validateSourceArtwork(before, after, request, ['motifs/taza.svg'])).toThrow('ilustraciones');
  expect(() => validateSourceArtwork(before, after, request)).toThrow('ilustraciones');
  after[4].content += '\n.hero{background:url(motifs/sol.svg)}';
  expect(() => validateSourceArtwork(before, after, request, ['motifs/lampara.svg'])).toThrow('ilustraciones');
  // Declared motifs never license an inline <svg> copy in a page: the sanitiser only sees motifs/*.svg files.
  const inline = nextStoreFiles();
  inline[1].content = inline[1].content.replace('<main>', '<main><svg viewBox="0 0 4 4"><path d="M0 0"/></svg>');
  expect(() => validateSourceArtwork(before, inline, request, ['motifs/lampara.svg'])).toThrow('ilustraciones');
  // A reference the previous revision already had is not new art.
  expect(() => validateSourceArtwork(after, after, request, [])).not.toThrow();
});

it('prunes and reorders existing composition sections without inventing a plan for additions', () => {
  const planned = (id: string) => ({ id, intent: 'Choose real products.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Shop' });
  const original: any = { selected: 0, concepts: [{ layout: { sections: ['intro', 'menu', 'story'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false },
    story: { beats: ['intro', 'menu', 'story'].map(section => ({ section, role: 'offer', headline: 'Real products', media: 'product' })) },
    composition: { family: 'catalog-led', rationale: 'Choose products.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose products.', sections: ['intro', 'menu', 'story'].map(planned) }] },
  }] };
  const scope = { add: false, targets: ['intro'], original: [] };
  const files = [{ path: 'components/home.tsx', content: '<main><section id="story"></section><section id="menu"></section></main>' }];
  const result = sourceDesignAfterSectionEdit(original, files, scope)!;
  expect(result.concepts[0].composition!.pages[0].sections.map(s => s.id)).toEqual(['story', 'menu']);
  expect(result.concepts[0].story!.beats.map(s => s.section)).toEqual(['story', 'menu']);
  expect(original.concepts[0].composition.pages[0].sections.map((s: any) => s.id)).toEqual(['intro', 'menu', 'story']);
  files[0].content = '<main><section id="menu"></section><section id="new"></section></main>';
  expect(sourceDesignAfterSectionEdit(original, files, scope)!.concepts[0].composition).toBeUndefined();
});

describe('a Boceto store (sketch-born)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { assembleSketch, repairSketch } = require('./sketch');
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: [] as string[] };
  const files = () => assembleSketch(repairSketch({ blocks: [{ id: 'intro', type: 'hero', headline: 'Hola' }, { id: 'faq', type: 'faq', title: 'P', items: [{ q: 'q', a: 'a' }] }] }, ctx).sketch, ctx);
  it('finds its block sections, whose ids are JSX string expressions', () => {
    expect(sourceHomeRegions(files()).map(region => region.id)).toEqual(expect.arrayContaining(['skb-intro', 'skb-faq']));
  });
  it('scopes a chat request to the block picked in the Boceto', () => {
    expect(sourceSectionScope(files(), 'Pedido actual del comercio: hazlo más grande', 'skb-faq')).toMatchObject({ targets: ['skb-faq'], selected: 'skb-faq' });
  });
});
