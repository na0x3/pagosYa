import { libraryAnswerSchema, libraryMood, validateLibraryLayout, type LibraryFacts } from './source-section-library';

const facts: LibraryFacts = { storeName: 'Nube', what: 'Vendo un sofá cama plegable comprimido. Entrega en Santa Cruz.', story: '', city: 'Santa Cruz', request: 'sofá cama plegable, llega en caja',
  tone: 'calm', products: [{ id: 'p1', name: 'Sofá cama plegable', about: 'Llega comprimido en una caja. 7 colores.' }], categories: [],
  photos: [{ url: '/v1/uploads/a.jpg', product: 'Sofá cama plegable' }, { url: '/v1/uploads/b.jpg', product: 'Sofá cama plegable' }], codes: [], services: [], reviews: 0 };
const raw = (type: string, extra: Record<string, unknown>) => ({ type, look: '', band: '', eyebrow: '', title: '', text: '', cta: '', link: '', cta2: '', link2: '', photo: -1, photo2: -1, items: [], products: [], product: '', code: '', card: '', endsAt: '', ...extra });
const item = (title: string, x = -1, y = -1) => ({ title, text: '', icon: '', photo: -1, link: '', value: '', x, y });
const fill = (block: ReturnType<typeof raw>) => validateLibraryLayout({ blocks: [block] } as never, facts, { fixed: [{ type: block.type }] });

describe('section library — lively one-product parts (spec 2026-11-03)', () => {
  it('keeps short backed pills and drops long or invented ones (Review Focus 4)', () => {
    const [hero] = fill(raw('product-hero', { product: 'p1', items: [item('Entrega en Santa Cruz'), item('Llega en caja'), item('Entrega 24–48 h'), item('Un texto demasiado largo para una etiqueta flotante')] }));
    expect(hero.items?.map(entry => entry.title)).toEqual(['Entrega en Santa Cruz', 'Llega en caja']);
  });
  it('keeps hotspots with a photo, clamps points into the photo (Review Focus 5) and drops the section without points', () => {
    const [spots] = fill(raw('detail-hotspots', { photo: 1, items: [item('Tela de pana suave', 0, 100), item('Costura doble', 50, 50)] }));
    expect(spots.photo).toBe('/v1/uploads/b.jpg');
    expect(spots.items).toEqual([{ title: 'Tela de pana suave', x: 6, y: 94 }, { title: 'Costura doble', x: 50, y: 50 }]);
    expect(fill(raw('detail-hotspots', { photo: 1, items: [item('Sin punto')] }))).toEqual([]);
  });
  it('keeps a chip band of six to ten short phrases with a photo', () => {
    const phrases = ['Llega en una caja', 'Se despliega en cama', 'Sin herramientas', 'Para departamentos', '7 colores', 'Fácil de mover'];
    const [chips] = fill(raw('chips-marquee', { photo: 0, items: phrases.map(phrase => item(phrase)) }));
    expect(chips.items?.map(entry => entry.title)).toEqual(phrases);
    expect(fill(raw('chips-marquee', { photo: 0, items: phrases.slice(0, 4).map(phrase => item(phrase)) }))).toEqual([]);
  });
  it('asks for a mood and reads it; a playful business is always colourful', () => {
    expect((libraryAnswerSchema(2) as any).required).toContain('mood');
    expect(libraryMood({ mood: 'colourful' }, facts)).toBe('colourful');
    expect(libraryMood({ mood: 'loud' }, facts)).toBe('calm');
    expect(libraryMood(null, { ...facts, what: 'Gomitas y caramelos para fiestas infantiles' })).toBe('colourful');
  });
});
