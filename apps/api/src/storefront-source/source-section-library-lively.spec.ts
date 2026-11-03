import { libraryAnswerSchema, libraryMood, libraryVariants, validateLibraryLayout, type LibraryFacts } from './source-section-library';

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

describe('backed numbers are whole numbers (review 2026-11-03)', () => {
  it('drops a delivery time whose digits only hide inside a fee or a phone number', () => {
    const noisy = { ...facts, notes: 'Envío Santa Cruz: Bs 24,00. Escríbenos al 72448123. Envío a El Alto: Bs 20.' };
    const [hero] = validateLibraryLayout({ blocks: [raw('product-hero', { product: 'p1', items: [item('Entrega 24–48 h'), item('Llega en 2 días'), item('Llega en caja')] })] } as never, noisy, { fixed: [{ type: 'product-hero' }] });
    expect(hero.items?.map(entry => entry.title)).toEqual(['Llega en caja']);
  });
  it('keeps a number the store wrote on its own', () => {
    const [chips] = validateLibraryLayout({ blocks: [raw('chips-marquee', { photo: 0, items: ['7 colores', 'Llega en caja', 'Sin herramientas', 'Para departamentos', 'Fácil de mover', 'Se despliega en cama'].map(phrase => item(phrase)) })] } as never, facts, { fixed: [{ type: 'chips-marquee' }] });
    expect(chips.items?.[0].title).toBe('7 colores');
  });
});

describe('hero-split (spec 2026-11-03 premium landing)', () => {
  it('keeps a titled hero with its photo and up to three backed pills', () => {
    const [hero] = fill(raw('hero-split', { title: 'El sofá que llega en una caja', text: 'Lo abres y toma su forma.', eyebrow: 'Santa Cruz', cta: 'Ver el producto', cta2: 'Ver colores', photo: 0, items: [item('Llega en caja'), item('Entrega 24–48 h')] }));
    expect(hero).toMatchObject({ type: 'hero-split', title: 'El sofá que llega en una caja', photo: '/v1/uploads/a.jpg', cta2: 'Ver colores' });
    expect(hero.items?.map(entry => entry.title)).toEqual(['Llega en caja']);
  });
  it('drops a hero without a title', () => {
    expect(fill(raw('hero-split', { photo: 0 }))).toEqual([]);
  });
  it('variant-cards takes the store product and keeps only its title', () => {
    const [cards] = fill(raw('variant-cards', { title: 'Elige tu color' }));
    expect(cards).toMatchObject({ type: 'variant-cards', product: 'p1', title: 'Elige tu color' });
  });
});

describe('title style from the library answer (spec 2026-11-03 chunky colour titles)', () => {
  it('asks YAPI for a title style beside the mood', () => {
    const schema = libraryAnswerSchema(2) as unknown as { required: string[]; properties: Record<string, { enum?: string[] }> };
    expect(schema.required).toContain('titleStyle');
    expect(schema.properties.titleStyle.enum).toEqual(['burbuja', 'redonda', 'firme', 'poster']);
  });
  it('saves mood and title style on Único only; a playful business gets burbuja', () => {
    expect(libraryVariants('unico', { mood: 'calm', titleStyle: 'redonda' }, facts)).toEqual({ mood: 'calm', titles: 'redonda' });
    expect(libraryVariants('unico', { mood: 'calm', titleStyle: 'firme' }, { ...facts, what: 'Gomitas y caramelos para fiestas infantiles' })).toEqual({ mood: 'colourful', titles: 'burbuja' });
    expect(libraryVariants('crocante', { mood: 'calm', titleStyle: 'firme' }, facts)).toBeUndefined();
  });
});
