import { buildLibraryFacts, libraryAnswerSchema, libraryHours, libraryOfferEnd, librarySocial, LIBRARY_CATALOG, validateLibraryLayout, type LibraryFacts } from './source-section-library';

const facts = (over: Partial<LibraryFacts> = {}): LibraryFacts => ({
  storeName: 'Dulce Nube', what: 'Galletas artesanales', story: '', city: 'La Paz', request: '', tone: 'calm',
  products: [{ id: 'p1', name: 'Galleta de chocolate', category: 'Galletas' }, { id: 'p2', name: 'Caja surtida', category: 'Cajas' }, { id: 'p3', name: 'Brownie' }],
  categories: ['Galletas', 'Cajas'],
  photos: [0, 1, 2, 3, 4].map(index => ({ url: `/v1/uploads/0000000${index}-aaaa.jpg` })),
  codes: [{ code: 'DULCE10', offer: '10% de descuento' }],
  services: [{ title: 'Envío a domicilio', text: 'Te lo llevamos en La Paz', icon: 'truck' }, { title: 'Pago seguro', text: 'Pagas en línea con pagosYa', icon: 'lock' }],
  reviews: 0, ...over,
});
const types = (layout: Array<{ type: string }>) => layout.map(block => block.type);

describe('section library', () => {
  it('every catalogue id is unique and the schema lists them all', () => {
    const ids = LIBRARY_CATALOG.map(section => section.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect((libraryAnswerSchema(5) as any).properties.blocks.items.properties.type.enum).toEqual(ids);
  });

  it('keeps the frame: a cover first, the grid early, a closing last — even from an empty answer', () => {
    const layout = validateLibraryLayout({ blocks: [] }, facts());
    expect(layout[0].type).toBe('cover-split');
    expect(layout[0].photo).toBe('/v1/uploads/00000000-aaaa.jpg');
    expect(types(layout)).toContain('products-grid');
    expect(layout.at(-1)!.type).toBe('closing-photo');
  });

  it('moves the cover first and the grid right after it (or after a strip)', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'story-split', title: 'Nuestra historia', photo: 1 },
      { type: 'cover-centered', title: 'Galletas de verdad', photo: 0 },
      { type: 'strip-marquee', items: [{ title: 'Chocolate' }, { title: 'Vainilla' }, { title: 'Avena' }] },
      { type: 'closing-wordmark', title: 'Hasta pronto' },
    ] as never }, facts());
    expect(types(layout)).toEqual(['cover-centered', 'strip-marquee', 'products-grid', 'story-split', 'closing-wordmark']);
  });

  it('shows each photo once: a repeat is dropped and a section that needed it goes', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-split', title: 'Hola', photo: 0 },
      { type: 'story-split', title: 'Historia', photo: 0 },
      { type: 'promo-banner', title: 'Regalos', photo: 2 },
    ] as never }, facts());
    expect(types(layout)).not.toContain('story-split');
    const shown = layout.flatMap(block => [block.photo, block.photo2, ...(block.items ?? []).map(item => item.photo)]).filter(Boolean);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('drops what the store cannot back: bold covers on a calm store, reviews without reviews, unknown codes, no location', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-poster', title: 'DULCE', photo: 0 },
      { type: 'reviews-cards', title: 'Opiniones' },
      { type: 'promo-code', title: 'Oferta', code: 'INVENTADO' },
      { type: 'visit-store', title: 'Visítanos', photo: 1 },
    ] as never }, facts());
    for (const gone of ['cover-poster', 'reviews-cards', 'promo-code', 'visit-store']) expect(types(layout)).not.toContain(gone);
  });

  it('keeps real products, categories and codes only, in their exact spelling', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-split', title: 'Hola', photo: 0 },
      { type: 'products-cards', title: 'Favoritos', products: ['galleta de chocolate', 'Brownie', 'Pastel inventado'] },
      { type: 'products-spotlight', title: 'Del mes', product: 'p2' },
      { type: 'promo-code', title: 'Oferta', code: 'dulce10', cta: 'Comprar', link: 'category:galletas' },
    ] as never }, facts({ products: [...facts().products, ...Array.from({ length: 7 }, (_, at) => ({ id: `x${at}`, name: `Extra ${at}` }))] }));
    expect(layout.find(block => block.type === 'products-cards')!.products).toEqual(['Galleta de chocolate', 'Brownie']);
    expect(layout.find(block => block.type === 'products-spotlight')!.product).toBe('p2');
    const promo = layout.find(block => block.type === 'promo-code')!;
    expect(promo.code).toBe('DULCE10');
    expect(promo.link).toBe('category:Galletas');
  });

  it('never leaves two blocks of one role side by side', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-split', title: 'Hola', photo: 0 },
      { type: 'story-split', title: 'Uno', photo: 1 },
      { type: 'story-list', title: 'Dos', photo: 2, items: [{ title: 'a' }, { title: 'b' }] },
      { type: 'faq-split', title: 'Preguntas', items: [{ title: '¿Envíos?', text: 'Sí.' }, { title: '¿Recojo?', text: 'No.' }, { title: '¿Pago?', text: 'En línea.' }] },
    ] as never }, facts());
    for (let index = 1; index < layout.length; index++) {
      expect([layout[index - 1].type.split('-')[0], layout[index].type.split('-')[0]]).not.toEqual(['story', 'story']);
    }
  });

  it('never puts a dark or accent band behind words alone', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'strip-services', band: 'deep' },
      { type: 'faq-split', band: 'accent', title: 'Preguntas', items: [{ title: '¿Envíos?', text: 'Sí.' }, { title: '¿Recojo?', text: 'No.' }, { title: '¿Pago?', text: 'En línea.' }] },
      { type: 'promo-banner', band: 'deep', title: 'Regalos', photo: 3 },
    ] as never }, facts());
    expect(layout.find(block => block.type === 'strip-services')!.band).toBeUndefined();
    expect(layout.find(block => block.type === 'faq-split')!.band).toBeUndefined();
    expect(layout.find(block => block.type === 'promo-banner')!.band).toBe('deep');
  });

  it('the main grid always carries a product card: the model pick, else the tone default', () => {
    const picked = validateLibraryLayout({ blocks: [{ type: 'products-tabs', title: 'Todo', card: 'ribbon' }] as never }, facts());
    expect(picked.find(block => block.type === 'products-tabs')!.card).toBe('ribbon');
    expect(validateLibraryLayout({ blocks: [] }, facts()).find(block => block.type === 'products-grid')!.card).toBe('classic');
    expect(validateLibraryLayout({ blocks: [{ type: 'products-grid', card: 'nope' }] as never }, facts({ tone: 'bold' })).find(block => block.type === 'products-grid')!.card).toBe('soft');
    expect(validateLibraryLayout({ blocks: [{ type: 'story-split', title: 'Hola', photo: 1, card: 'ribbon' }] as never }, facts()).find(block => block.type === 'story-split')!.card).toBeUndefined();
  });

  it('drops what only repeats: a marquee under the ribbon cover, a picked row on a catalogue the grid already shows', () => {
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-ribbon', title: 'Burbujas', photo: 0, items: [{ title: 'Uno' }, { title: 'Dos' }] },
      { type: 'strip-marquee', items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
      { type: 'products-cards', title: 'Favoritos', products: ['Brownie', 'Caja surtida'] },
    ] as never }, facts({ tone: 'bold' }));
    expect(types(layout)).not.toContain('strip-marquee');
    expect(types(layout)).not.toContain('products-cards');
  });

  it('strip-services always carries the platform facts, never the model words', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'strip-services', items: [{ title: 'Envío gratis a todo el mundo' }] }] as never }, facts());
    expect(layout.find(block => block.type === 'strip-services')!.items!.map(item => item.title)).toEqual(['Envío a domicilio', 'Pago seguro']);
  });
});

describe('library facts', () => {
  it('takes the merchant uploads only, one per product first, and the codes as passed', () => {
    const out = buildLibraryFacts({ storeName: 'X', what: '', story: '', city: 'La Paz', request: '', tone: 'calm',
      items: [{ id: 'a', name: 'A', categoryId: 'c1', amount: 2500, imageUrls: ['http://localhost:3001/v1/uploads/aaaa-1.jpg', '/v1/uploads/aaaa-2.jpg'] },
        { id: 'b', name: 'B', imageUrls: ['https://cdn.example.com/b.jpg'] }],
      categories: [{ id: 'c1', name: 'Uno' }, { id: 'c2', name: 'Vacía' }], uploads: ['/v1/uploads/bbbb-9.png'],
      codes: [{ code: 'HOLA', discountType: 'PERCENT', discountValue: 15 }], reviews: 2, shippingEnabled: true });
    expect(out.photos.map(photo => photo.url)).toEqual(['/v1/uploads/aaaa-1.jpg', '/v1/uploads/bbbb-9.png', '/v1/uploads/aaaa-2.jpg']);
    expect(out.photos[0]).toMatchObject({ product: 'A', category: 'Uno' });
    expect(out.categories).toEqual(['Uno']);
    expect(out.products[0].price).toBe('Bs 25');
    expect(out.codes).toEqual([{ code: 'HOLA', offer: '15% de descuento' }]);
    expect(out.services.map(service => service.title)).toEqual(['Envío a domicilio', 'Pago seguro']);
  });

  it('reads opening hours as day ranges', () => {
    const hours = [1, 2, 3, 4, 5].map(day => ({ day, open: '09:00', close: '19:00', closed: false })).concat([{ day: 6, open: '10:00', close: '14:00', closed: false }, { day: 0, open: '', close: '', closed: true }]);
    expect(libraryHours(hours)).toBe('Lunes a viernes, 09:00 a 19:00 · sábado, 10:00 a 14:00');
  });
});

describe('template fill mode (34 templates)', () => {
  const template = [
    { type: 'bar-note', title: 'Demo' },
    { type: 'cover-stage', title: 'Eleva tu estilo', photo: 'slot:hero1' },
    { type: 'promo-countdown', title: 'Oferta', endsAt: '2026-12-31' },
    { type: 'products-slider', card: 'ribbon', title: 'Lo más buscado' },
    { type: 'social-posts', title: 'Comunidad' },
    { type: 'shop-look', photo: 'slot:e-hero' },
    { type: 'press-quotes', eyebrow: 'Prensa' },
    { type: 'promo-trio', look: 'single', photo: 'slot:look1' },
    { type: 'faq-split', title: 'Preguntas' },
  ];
  const answer = { blocks: [
    { type: 'faq-split', title: 'Dudas', items: [{ title: '¿Envíos?', text: 'Sí.' }, { title: '¿Recojo?', text: 'No.' }, { title: '¿Pago?', text: 'En línea.' }] },
    { type: 'bar-note', title: 'Galletas hechas cada mañana en La Paz' },
    { type: 'cover-stage', title: 'Galletas de verdad', photo: 0, look: 'nope', band: 'deep' },
    { type: 'promo-countdown', title: '20% en cajas', endsAt: '2026-11-15T23:59:00-04:00' },
    { type: 'products-slider', title: 'Las favoritas', card: 'soft' },
    { type: 'social-posts', items: [{ title: 'a', photo: 1 }, { title: 'b', photo: 2 }, { title: 'c', photo: 3 }] },
    { type: 'shop-look', photo: 4, items: [{ title: 'brownie', x: 40, y: 120 }, { title: 'Pastel inventado', x: 20, y: 20 }] },
    { type: 'press-quotes', items: [{ title: 'Diario Inventado', text: 'Las mejores del país' }, { title: 'Página Siete', text: 'Galletas que saben a casa' }] },
    { type: 'promo-trio', photo: 2, items: [{ title: 'Cajas' }, { title: 'Regalos' }, { title: 'Clásicas' }] },
  ] };
  const now = Date.parse('2026-10-31T12:00:00Z');

  it('keeps the template order, type, look, band and card; drops what the store cannot back', () => {
    const story = 'Página Siete escribió: «galletas que saben a casa». Oferta hasta el 15 de noviembre.';
    const layout = validateLibraryLayout(answer as never, facts({ story }), { fixed: template as never, now });
    expect(types(layout)).toEqual(['bar-note', 'cover-stage', 'promo-countdown', 'products-slider', 'shop-look', 'press-quotes', 'promo-trio', 'faq-split']);
    expect(layout.find(block => block.type === 'products-slider')!.card).toBe('ribbon');
    expect(layout.find(block => block.type === 'cover-stage')!.band).toBeUndefined();
    expect(layout.find(block => block.type === 'shop-look')!.items).toEqual([{ title: 'Brownie', x: 40, y: 94 }]);
    expect(layout.find(block => block.type === 'press-quotes')!.items!.map(item => item.title)).toEqual(['Página Siete']);
    expect(layout.find(block => block.type === 'promo-trio')!.photo).toBeDefined();
  });

  it('drops the countdown without the merchant date, and social sections without the store account', () => {
    const layout = validateLibraryLayout(answer as never, facts(), { fixed: template as never, now });
    expect(types(layout)).not.toContain('promo-countdown');
    expect(types(layout)).not.toContain('social-posts');
    const social = validateLibraryLayout(answer as never, facts({ social: { handle: '@dulce', url: 'https://instagram.com/dulce' } }), { fixed: template as never, now });
    expect(social.find(block => block.type === 'social-posts')!.handle).toBe('@dulce');
  });

  it('never offers template-only sections when composing freely', () => {
    expect(types(validateLibraryLayout({ blocks: [{ type: 'press-quotes', items: [{ title: 'X', text: 'Y' }] }] as never }, facts()))).not.toContain('press-quotes');
  });

  it('reads the social account and the offer end', () => {
    expect(librarySocial([{ label: 'IG', url: 'https://www.instagram.com/dulce.nube/' }])).toEqual({ handle: '@dulce.nube', url: 'https://www.instagram.com/dulce.nube/' });
    expect(librarySocial([{ label: 'post', url: 'https://instagram.com/p/abc' }])).toBeUndefined();
    expect(libraryOfferEnd('2026-11-15T23:59:00-04:00', 'oferta hasta el 15 de noviembre', now)).toBeDefined();
    expect(libraryOfferEnd('2026-11-15T23:59:00-04:00', 'oferta por tiempo limitado', now)).toBeUndefined();
  });
});

