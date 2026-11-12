import { LIBRARY_FILL_PROMPT, withSharpCover, withoutRepeatedProductRows, withPersonalizer, buildLibraryFacts, carriedSections, libraryTopUp, withTopUp, librarySectionBlocker, withCarriedSections, libraryAnswerSchema, libraryHours, libraryOfferEnd, librarySocial, LIBRARY_CATALOG, validateLibraryLayout, withoutDemoWords, type LibraryFacts } from './source-section-library';

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
  // Spec 2026-11-10 hand-made styles (Merienda, Burbuja, Neón, Mimo): their own sections inside a template's fixed home.
  // Live 2026-11-10 (Perra Please on Neón, one category): three campaigns showed the same four sauces three times.
  it('gives each category\'s products to one campaign only; another campaign keeps its photo and links to the catalogue', () => {
    const fixed = [{ type: 'campaign-strip' }, { type: 'campaign-strip' }, { type: 'campaign-strip' }] as never;
    const layout = validateLibraryLayout({ blocks: [
      { type: 'campaign-strip', title: 'Galletas', photo: 0, cta: 'Comprar', link: 'category:Galletas' },
      { type: 'campaign-strip', title: 'Más galletas', photo: 1, cta: 'Comprar', link: 'category:Galletas' },
      { type: 'campaign-strip', title: 'Cajas', photo: 2, cta: 'Comprar', link: 'category:Cajas' },
    ] as never }, facts(), { fixed });
    expect(layout.map(block => block.link)).toEqual(['category:Galletas', 'products', 'category:Cajas']);
  });

  it('keeps a nickname over each real product and drops a name that is not a product', () => {
    const [block] = validateLibraryLayout({ blocks: [{ type: 'products-nicknames', title: 'Como debe ser', cta: 'Ver todo', items: [
      { title: 'Brownie', value: '«Para la tarde»' }, { title: 'caja surtida', value: 'Regalo' }, { title: 'Torta inventada', value: 'nada' }] }] as never },
      facts(), { fixed: [{ type: 'products-nicknames' }] as never });
    expect(block.items).toEqual([{ title: 'Brownie', value: 'Para la tarde' }, { title: 'Caja surtida', value: 'Regalo' }]);
  });

  it('puts one lowercase word over each real product in the tall cards and drops a name that is not a product', () => {
    const [block] = validateLibraryLayout({ blocks: [{ type: 'products-words', title: 'Para cada momento', items: [
      { title: 'Galleta de chocolate', value: 'Antojo' }, { title: 'caja surtida', value: 'Para Regalar' }, { title: 'Brownie', value: 'merienda' }, { title: 'Torta inventada', value: 'nada' }] }] as never },
      facts(), { fixed: [{ type: 'products-words' }] as never });
    expect(block.items).toEqual([{ title: 'Galleta de chocolate', value: 'antojo' }, { title: 'Caja surtida', value: 'para regalar' }, { title: 'Brownie', value: 'merienda' }]);
  });

  it('keeps the cover\'s ribbon words, one line per real product in the rows, and links each big name to its product', () => {
    const fixed = [{ type: 'cover-mega' }, { type: 'products-rows' }, { type: 'names-list' }, { type: 'statement-sticker' }] as never;
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-mega', title: 'Galletas de verdad', photo: 0, eyebrow: 'Hecho hoy', items: [{ title: 'Horneá' }, { title: 'Disfrutá' }] },
      { type: 'products-rows', title: 'Elige tu sabor', products: ['Galleta de chocolate', 'Caja surtida'], items: [{ title: 'galleta de chocolate', text: 'Chips de chocolate amargo.' }, { title: 'Torta inventada', text: 'No existe.' }] },
      { type: 'names-list', eyebrow: '¿Cuál es tu favorito?', items: [{ title: 'Brownie', photo: 1 }, { title: 'Caja surtida', photo: 2 }, { title: 'Galleta de chocolate', photo: 3 }] },
      { type: 'statement-sticker', title: 'Horneado cada mañana', photo: 4, photo2: 1 },
    ] as never }, facts(), { fixed });
    const byType = Object.fromEntries(layout.map(block => [block.type, block]));
    expect(byType['cover-mega'].items).toEqual([{ title: 'Horneá' }, { title: 'Disfrutá' }]);
    expect(byType['products-rows'].products).toEqual(['Galleta de chocolate', 'Caja surtida']);
    expect(byType['products-rows'].items).toEqual([{ title: 'Galleta de chocolate', text: 'Chips de chocolate amargo.' }]);
    expect(byType['names-list'].items!.map(item => item.link)).toEqual(['product:p3', 'product:p2', 'product:p1']);
    expect(byType['statement-sticker'].photo2).toBeDefined();
  });

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

  it('runs one dictated phrase on its own, repeated so the band fills (Meat House 2026-11-07)', () => {
    const [one] = validateLibraryLayout({ blocks: [{ type: 'strip-marquee', items: [{ title: 'Pedidos con 24 hrs de anticipación' }] }] } as never, facts(), { fixed: [{ type: 'strip-marquee' }] });
    expect(one.items?.map(item => item.title)).toEqual(Array(3).fill('Pedidos con 24 hrs de anticipación'));
    const [two] = validateLibraryLayout({ blocks: [{ type: 'strip-marquee', items: [{ title: 'Asado' }, { title: 'Parrilla' }] }] } as never, facts(), { fixed: [{ type: 'strip-marquee' }] });
    expect(two.items?.map(item => item.title)).toEqual(['Asado', 'Parrilla', 'Asado', 'Parrilla']);
    // The model cut the dictated phrase into pieces: they run as the one phrase.
    const request = 'despues del header pon texto moviendose que diga pedidos con 24 hrs de anticipacion';
    const [cut] = validateLibraryLayout({ blocks: [{ type: 'strip-marquee', items: [{ title: 'Pedidos' }, { title: 'con 24 hrs' }, { title: 'de anticipación' }] }] } as never, facts({ request }), { fixed: [{ type: 'strip-marquee' }] });
    expect(cut.items?.map(item => item.title)).toEqual(Array(3).fill('Pedidos con 24 hrs de anticipación'));
    const [words] = validateLibraryLayout({ blocks: [{ type: 'strip-marquee', items: [{ title: 'Asado' }, { title: 'Parrilla' }, { title: 'Carbón' }] }] } as never, facts({ request: 'franja asado parrilla carbón' }), { fixed: [{ type: 'strip-marquee' }] });
    expect(words.items?.map(item => item.title)).toEqual(['Asado', 'Parrilla', 'Carbón']);
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

  it('shows every store photo before a template repeats one, never in one section nor in neighbouring sections', () => {
    const fixed = [{ type: 'cover-stage', photo: 'slot:a' }, { type: 'story-split', photo: 'slot:b' }, { type: 'promo-banner', photo: 'slot:c' }, { type: 'closing-photo', photo: 'slot:d' }];
    const layout = validateLibraryLayout({ blocks: [
      { type: 'cover-stage', title: 'Hola', photo: 0 }, { type: 'story-split', title: 'Historia', photo: 1 },
      { type: 'promo-banner', title: 'Regalos', photo: 0 }, { type: 'closing-photo', title: 'Chau', photo: 0 },
    ] as never }, facts(), { fixed: fixed as never, now });
    // Owner 2026-11-02 («unused photos first»): while the store has photos not shown yet, the banner and the closing take those.
    const url = (at: number) => `/v1/uploads/0000000${at}-aaaa.jpg`;
    expect(types(layout)).toEqual(['cover-stage', 'story-split', 'promo-banner', 'closing-photo']);
    expect(layout.map(block => block.photo)).toEqual([url(0), url(1), url(2), url(3)]);
    // Once every photo has shown, a photo may come back — two sections on, never a third time.
    const two = { ...facts(), photos: facts().photos.slice(0, 2) };
    const repeat = validateLibraryLayout({ blocks: [
      { type: 'cover-stage', title: 'Hola', photo: 0 }, { type: 'story-split', title: 'Historia', photo: 1 },
      { type: 'promo-banner', title: 'Regalos', photo: 0 }, { type: 'closing-photo', title: 'Chau', photo: 0 },
    ] as never }, two as never, { fixed: fixed as never, now });
    expect(repeat.map(block => block.photo)).toEqual([url(0), url(1), url(0), url(1)]);
    // Beside the section that already shows it: refused — the story takes another photo instead of repeating the cover's.
    const beside = validateLibraryLayout({ blocks: [{ type: 'cover-stage', title: 'Hola', photo: 0 }, { type: 'story-split', title: 'Historia', photo: 0 }] as never }, facts(), { fixed: fixed.slice(0, 2) as never, now });
    expect(beside.map(block => block.photo)).toEqual([url(0), url(1)]);
  });

  it('keeps a template look and its second photo even when the free catalogue would not list them', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'story-split', title: 'Diario', photo: 1, photo2: 2 }] as never }, facts(),
      { fixed: [{ type: 'story-split', look: 'arch', photo: 'slot:a', photo2: 'slot:b' }] as never, now });
    expect(layout[0]).toMatchObject({ look: 'arch', photo2: '/v1/uploads/00000002-aaaa.jpg' });
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
    // A bare date is the day the merchant named, and runs to its end in La Paz.
    expect(libraryOfferEnd('2026-11-30', '20% hasta el 30 de noviembre', now)).toBe('2026-12-01T03:59:00.000Z');
  });
});

describe('adding and carrying sections (fixes 3 and 6, 2026-11-02)', () => {
  const store = (partial: Partial<LibraryFacts> = {}): LibraryFacts => ({ storeName: 'Tienda', what: '', story: '', city: 'La Paz', request: '', tone: 'calm',
    products: [{ id: 'p1', name: 'Uno' }, { id: 'p2', name: 'Dos' }], categories: [], photos: [{ url: '/v1/uploads/a.jpg' }, { url: '/v1/uploads/b.jpg' }],
    codes: [], services: [], reviews: 0, ...partial });

  it('says what a store lacks for a section before any call', () => {
    expect(librarySectionBlocker('reviews-cards', store())).toContain('reseñas');
    expect(librarySectionBlocker('reviews-cards', store({ reviews: 3 }))).toBeNull();
    expect(librarySectionBlocker('visit-store', store())).toContain('dirección');
    expect(librarySectionBlocker('promo-code', store())).toContain('código');
    expect(librarySectionBlocker('social-posts', store())).toContain('Instagram');
    expect(librarySectionBlocker('faq-split', store())).toBeNull();
    expect(librarySectionBlocker('steps-howto', store())).toBeNull();
    expect(librarySectionBlocker('nope', store())).toBeTruthy();
  });

  it('carries the sections added after the old template, and its questions, when the new one has none', () => {
    const oldTemplate = [{ type: 'cover-split' }, { type: 'products-grid' }, { type: 'faq-split' }, { type: 'story-split' }, { type: 'closing-photo' }];
    const oldLayout = [{ type: 'cover-split', title: 'Viejo' }, { type: 'products-grid' }, { type: 'steps-howto', title: 'Cómo se toma', items: [{ title: 'a' }] },
      { type: 'faq-split', title: 'Preguntas', items: [{ title: '¿Envían?', text: 'Sí' }] }, { type: 'story-split', title: 'Historia' }, { type: 'closing-photo' }];
    const newLayout = [{ type: 'cover-full', title: 'Nuevo' }, { type: 'products-grid' }, { type: 'image-columns' }, { type: 'closing-wordmark', title: 'Fin' }];
    const carried = carriedSections(oldLayout, oldTemplate, newLayout);
    expect(carried.map(block => block.type)).toEqual(['steps-howto', 'faq-split']);
    expect(withCarriedSections(newLayout, carried).map(block => block.type)).toEqual(['cover-full', 'products-grid', 'image-columns', 'steps-howto', 'faq-split', 'closing-wordmark']);
    // A new template that has its own questions keeps them; nothing is carried twice.
    expect(carriedSections(oldLayout, oldTemplate, [...newLayout, { type: 'faq-split' }, { type: 'steps-howto' }])).toEqual([]);
  });
});


// Owner rule 2026-10-29 (no section of only words on a plain ground), enforced on templates 2026-11-02.
it('a template home keeps no section of only words', () => {
  const now = Date.UTC(2026, 10, 2);
  const layout = validateLibraryLayout({ blocks: [
    { type: 'statement-reveal', text: 'BOXY hace hoodies amplios de tela pesada para todos los días, en pocas piezas por lote.' },
    { type: 'icon-columns', items: [{ title: 'Tela pesada', icon: 'sparkles' }, { title: 'Hecho a mano', icon: 'heart' }] },
  ] as never }, { ...facts(), categories: ['Básicos', 'Gráficos'] } as never, { fixed: [{ type: 'statement-reveal' }, { type: 'icon-columns' }] as never, now });
  expect(layout.map(block => block.type)).toEqual(['icon-columns']);
  expect(layout[0]).toMatchObject({ look: 'side', photo: expect.stringMatching(/^\/v1\/uploads\//) });
});

// Owner 2026-11-02 («drop unfilled sections»; Brisa Portátil kept Conecta's demo brands).
describe('withoutDemoWords', () => {
  const template = [{ type: 'cover-full', look: 'dark' }, { type: 'press-quotes' }, { type: 'products-slider' }, { type: 'faq-split' }] as never;
  const store = { ...facts(), storeName: 'Brisa Portátil', what: 'Ventiladores de cuello para el calor. Envío a todo Bolivia.', products: [{ id: 'p1', name: 'Ventilador de cuello portátil LED' }] };
  it('gives an empty fill a cover from the store and its product grid, never a template block', () => {
    const out = withoutDemoWords([], template, store as never);
    expect(out.map(block => block.type)).toEqual(['cover-full', 'products-grid']);
    expect(out[0]).toMatchObject({ title: 'Brisa Portátil', text: 'Ventiladores de cuello para el calor.', link: 'products', look: 'dark' });
    expect(out[1]).toMatchObject({ title: 'Ventilador de cuello portátil LED' });
  });
  it('keeps what was filled and adds only what is missing', () => {
    const filled = [{ type: 'cover-split', title: 'Fresco todo el día', photo: '/v1/uploads/00000000-aaaa.jpg' }, { type: 'products-slider', title: 'Elige el tuyo' }] as never;
    expect(withoutDemoWords(filled, template, store as never)).toEqual(filled);
  });
  it('a store without photos gets no cover it cannot show', () => {
    expect(withoutDemoWords([], template, { ...store, photos: [] } as never).map(block => block.type)).toEqual(['products-grid']);
  });
});

// New sections copied from real stores (spec docs/superpowers/specs/2026-11-04-new-sections-from-real-stores.md).
describe('sections from real stores (2026-11-04)', () => {
  const find = (layout: Array<{ type: string }>, type: string) => layout.find(block => block.type === type) as any;

  it('cover-duo: two photos and a button on each; a second button without a link goes to the catalogue', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'cover-duo', title: 'Galletas para todos', photo: 0, photo2: 1, cta: 'Galletas', link: 'category:Galletas', cta2: 'Cajas', link2: '' }] as never }, facts());
    const cover = find(layout, 'cover-duo');
    expect(layout[0].type).toBe('cover-duo');
    expect([cover.photo, cover.photo2].every(Boolean)).toBe(true);
    expect(cover.link).toBe('category:Galletas');
    expect(cover.link2).toBe('products');
  });

  it('cover-duo with one photo is not a cover', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'cover-duo', title: 'Hola', photo: 0, photo2: 0 }] as never }, facts());
    expect(types(layout)).not.toContain('cover-duo');
  });

  it('promo-lines: two photo cards; a sticker keeps words but never a number the merchant did not write', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'promo-lines', title: 'Dos sabores', cta: 'Ver', items: [
      { title: 'Galletas', photo: 2, link: 'category:Galletas', value: 'Nuevo' },
      { title: 'Cajas', photo: 3, link: 'category:Cajas', value: '50% menos' },
    ] }] as never }, facts());
    const lines = find(layout, 'promo-lines');
    expect(lines.items.map((item: any) => item.value)).toEqual(['Nuevo', undefined]);
    expect(lines.items.map((item: any) => item.link)).toEqual(['category:Galletas', 'category:Cajas']);
  });

  it('perks-rows: a pill with the merchant\'s own number stays, each row keeps its link', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'perks-rows', title: 'Comprar aquí', photo: 2, items: [
      { title: 'Suscripción', text: 'Cada mes en tu puerta', value: '10% menos', link: 'products' },
      { title: 'Envío', text: 'En La Paz', value: 'En 2 horas', link: 'category:Cajas' },
    ] }] as never }, facts({ story: 'Con la suscripción pagas 10% menos.' }));
    const perks = find(layout, 'perks-rows');
    expect(perks.items.map((item: any) => item.value)).toEqual(['10% menos', undefined]);
    expect(perks.items[1].link).toBe('category:Cajas');
  });

  it('before-after only when the merchant speaks of a before and an after', () => {
    const answer = { blocks: [{ type: 'before-after', title: 'Así quedan', photo: 2, photo2: 3 }] } as never;
    expect(types(validateLibraryLayout(answer, facts()))).not.toContain('before-after');
    expect(librarySectionBlocker('before-after', facts())).toMatch(/antes y después/);
    const backed = facts({ what: 'Limpieza de sofás: mira el antes y el después' });
    expect(find(validateLibraryLayout(answer, backed), 'before-after')).toMatchObject({ photo: '/v1/uploads/00000002-aaaa.jpg', photo2: '/v1/uploads/00000003-aaaa.jpg' });
    expect(librarySectionBlocker('before-after', backed)).toBeNull();
  });

  it('story-sunburst takes its rings look in a free home', () => {
    const layout = validateLibraryLayout({ blocks: [{ type: 'story-sunburst', look: 'rings', title: 'Hecho a mano', photo: 4 }] as never }, facts());
    expect(find(layout, 'story-sunburst')).toMatchObject({ look: 'rings', photo: '/v1/uploads/00000004-aaaa.jpg' });
  });
});

// Owner 2026-11-06 («they are too short, there should be more things on the main page»): a template home shorter than 11
// sections is topped up with library sections the store can really fill, most useful first, before its closing.
describe('top-up', () => {
  const home = (types: string[]) => types.map(type => ({ type }));
  it('adds what the store can back, most useful first, up to 11 sections, never one it already has', () => {
    const f = facts({ location: { name: 'Dulce Nube', address: 'Calle Sagárnaga 120', hours: 'Lun a Vie 9:00–18:00' } });
    expect(libraryTopUp(home(['cover-split', 'products-grid', 'faq-split', 'story-split', 'benefits-bento', 'closing-photo']), f))
      .toEqual(['visit-store', 'promo-code', 'strip-services', 'steps-howto', 'products-spotlight']);
  });

  it('never adds a section the store cannot fill', () => {
    expect(libraryTopUp(home(['cover-split', 'products-grid']), facts({ codes: [], services: [] }), 5)).toEqual(['steps-howto', 'faq-split', 'products-spotlight']);
    expect(libraryTopUp(home(['cover-split']), facts({ photos: [], codes: [], services: [], categories: [], products: [] }), 4)).toEqual(['faq-split']);
  });

  it('a home that is long enough gets nothing', () => {
    expect(libraryTopUp(home(Array.from({ length: 11 }, (_, at) => `x-${at}`)), facts())).toEqual([]);
  });

  it('the new sections go before the closing, or at the end when there is none', () => {
    expect(types(withTopUp(home(['cover-split', 'products-grid', 'closing-photo']), home(['visit-store', 'promo-code']))))
      .toEqual(['cover-split', 'products-grid', 'visit-store', 'promo-code', 'closing-photo']);
    expect(types(withTopUp(home(['cover-split', 'products-grid']), home(['visit-store'])))).toEqual(['cover-split', 'products-grid', 'visit-store']);
  });
});

// Spec 2026-11-09 personalizador: the product with real options on a big stage; the frame only in art stores.
describe('personalizador (2026-11-09)', () => {
  const opt = (pairs: Array<[string, string]>, photo?: string) => ({ options: pairs.map(([name, value]) => ({ name, value })), ...(photo ? { imageUrls: [photo] } : {}) });
  const input = (over: Record<string, unknown> = {}) => ({ storeName: 'Vórtice', what: 'Licuadoras en Santa Cruz', story: '', city: 'Santa Cruz', request: '', tone: 'calm' as const,
    items: [{ id: 'cup', name: 'Vaso extra', imageUrls: ['/v1/uploads/cup.jpg'] },
      { id: 'one', name: 'Licuadora uno', imageUrls: ['/v1/uploads/one.jpg'], variants: [opt([['Color', 'Negro']]), opt([['Color', 'Rosa']])] },
      { id: 'two', name: 'Licuadora dos', imageUrls: ['/v1/uploads/two.jpg'], variants: [opt([['Color', 'Negro']], '/v1/uploads/n.jpg'), opt([['Color', 'Rosa']], '/v1/uploads/r.jpg')] }],
    categories: [], uploads: [], codes: [], reviews: 0, ...over });

  it('facts: the product with options and the most photographed ones; art stores by their words', () => {
    const out = buildLibraryFacts(input() as never);
    expect(out.optioned).toEqual({ id: 'two', name: 'Licuadora dos', groups: ['Color'] });
    expect(out.art).toBe(false);
    expect(buildLibraryFacts(input({ what: 'Láminas de arte para decorar' }) as never).art).toBe(true);
    expect(buildLibraryFacts(input({ items: [{ id: 'cup', name: 'Vaso extra' }, { id: 'x', name: 'Uno solo', variants: [opt([['Color', 'Negro']])] }] }) as never).optioned).toBeUndefined();
  });

  it('validation: always the optioned product, the frame only in art stores, never on a dark band; no options → no section', () => {
    const optioned = { id: 'p2', name: 'Caja surtida', groups: ['Sabor'] };
    const [block] = validateLibraryLayout({ blocks: [{ type: 'product-personalizer', product: 'p1', look: 'frame', band: 'deep' } as never] }, facts({ optioned }), { fixed: [{ type: 'product-personalizer' }] });
    expect(block).toMatchObject({ type: 'product-personalizer', product: 'p2', look: 'stage' });
    expect(block.band).toBeUndefined();
    expect(validateLibraryLayout({ blocks: [{ type: 'product-personalizer' } as never] }, facts({ optioned, art: true }), { fixed: [{ type: 'product-personalizer' }] })[0].look).toBe('frame');
    expect(validateLibraryLayout({ blocks: [{ type: 'product-personalizer', product: 'p1' } as never] }, facts(), { fixed: [{ type: 'product-personalizer' }] })).toEqual([]);
    expect(librarySectionBlocker('product-personalizer', facts())).toBe('ninguno de tus productos tiene opciones (colores, tallas o sabores)');
    expect(librarySectionBlocker('product-personalizer', facts({ optioned }))).toBeNull();
  });

  it('every eligible home gets it once: after the main grid, else before the closing section', () => {
    const optioned = { id: 'p2', name: 'Caja surtida', groups: ['Sabor'] };
    const home = [{ type: 'cover-split' }, { type: 'products-grid' }, { type: 'faq-split' }, { type: 'closing-photo' }];
    const out = withPersonalizer(home, facts({ optioned }));
    expect(types(out)).toEqual(['cover-split', 'products-grid', 'product-personalizer', 'faq-split', 'closing-photo']);
    expect(out[2]).toEqual({ type: 'product-personalizer', product: 'p2', look: 'stage' });
    expect(withPersonalizer(out, facts({ optioned }))).toBe(out);
    expect(types(withPersonalizer([{ type: 'cover-split' }, { type: 'closing-photo' }], facts({ optioned, art: true })))).toEqual(['cover-split', 'product-personalizer', 'closing-photo']);
    expect(withPersonalizer(home, facts())).toBe(home);
  });
});

// Owner 2026-11-11 (Nov 10 vs Oct 30 comparison): Pawby showed its five products in three rows; Oct 30 carried one brand idea.
describe('no repeated product rows', () => {
  const products = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Producto ${i}` }));
  const types = (layout: { type: string }[]) => layout.map(block => block.type);
  const home = [{ type: 'cover-full' }, { type: 'products-grid' }, { type: 'products-slider' }, { type: 'story-split' }, { type: 'products-cards' }, { type: 'faq-split' }, { type: 'products-slider' }, { type: 'closing-photo' }];
  it('a store with few products keeps the main grid and one more product row', () => {
    expect(types(withoutRepeatedProductRows(home, facts({ products: products(5) } as never)))).toEqual(['cover-full', 'products-grid', 'products-slider', 'story-split', 'faq-split', 'closing-photo']);
  });
  it('a store with 8 or more products keeps two', () => {
    expect(types(withoutRepeatedProductRows(home, facts({ products: products(8) } as never)))).toEqual(['cover-full', 'products-grid', 'products-slider', 'story-split', 'products-cards', 'faq-split', 'closing-photo']);
  });
  it('one featured product, categories and the main grid never count as a row', () => {
    const page = [{ type: 'products-grid' }, { type: 'products-spotlight' }, { type: 'categories-tiles' }, { type: 'products-rows' }, { type: 'product-personalizer' }];
    expect(types(withoutRepeatedProductRows(page, facts({ products: products(3) } as never)))).toEqual(types(page));
  });
});

// Owner 2026-11-11 («no blurry cover photos»): Oh Belly's 736 px photos filled a 1280 px cover.
describe('no blurry cover photos', () => {
  const photos = (...widths: (number | undefined)[]) => widths.map((width, i) => ({ url: `/v1/uploads/p${i}.jpg`, ...(width ? { width } : {}) }));
  const cover = { type: 'cover-stage', look: 'right', eyebrow: 'Oh Belly', title: 'Que la panza baile', text: 'Soda prebiótica.', cta: 'Ver sodas', link: 'products', photo: '/v1/uploads/p0.jpg', items: [{ title: 'x', photo: '/v1/uploads/p2.jpg' }] };
  it('a full-width cover takes the widest sharp photo, and the section that had it gets the small one', () => {
    const layout = [cover, { type: 'story-split', photo: '/v1/uploads/p1.jpg' }];
    const out = withSharpCover(layout as never, facts({ photos: photos(736, 1600, 800) } as never));
    expect(out[0]).toEqual(expect.objectContaining({ type: 'cover-stage', photo: '/v1/uploads/p1.jpg', title: 'Que la panza baile' }));
    expect(out[1].photo).toBe('/v1/uploads/p0.jpg');
  });
  it('with no photo wide enough it becomes the framed cover with the same words and photo', () => {
    const out = withSharpCover([cover, { type: 'faq-split' }] as never, facts({ photos: photos(736, 736) } as never));
    expect(out[0]).toEqual({ type: 'cover-split', look: 'frame', eyebrow: 'Oh Belly', title: 'Que la panza baile', text: 'Soda prebiótica.', cta: 'Ver sodas', link: 'products', photo: '/v1/uploads/p0.jpg' });
    expect(out[1].type).toBe('faq-split');
  });
  it('leaves a sharp full-width cover, a framed cover and a photo of unknown size alone', () => {
    const sharp = [{ ...cover, photo: '/v1/uploads/p1.jpg' }];
    expect(withSharpCover(sharp as never, facts({ photos: photos(736, 1600) } as never))).toEqual(sharp);
    const framed = [{ type: 'cover-split', photo: '/v1/uploads/p0.jpg' }];
    expect(withSharpCover(framed as never, facts({ photos: photos(500) } as never))).toEqual(framed);
    expect(withSharpCover([cover] as never, facts({ photos: photos(undefined) } as never))).toEqual([cover]);
  });
});

describe('one brand idea in a template home', () => {
  it('the fill asks for one idea of the brand in the cover, the titles, the strip and the closing line', () => {
    expect(LIBRARY_FILL_PROMPT).toMatch(/UNA idea de marca/);
    expect(LIBRARY_FILL_PROMPT).toMatch(/franja/);
    expect(LIBRARY_FILL_PROMPT).toMatch(/cierre/);
  });
  // Owner 2026-11-11: Pawby put «momento» in 8 of 10 titles; the idea stays in the cover, at most two titles and the closing line.
  it('keeps the idea light: at most two other titles, the rest say plainly what their section shows', () => {
    expect(LIBRARY_FILL_PROMPT).toMatch(/como máximo dos títulos/);
    expect(LIBRARY_FILL_PROMPT).toMatch(/los demás títulos dicen claro lo que muestra su sección/);
    expect(LIBRARY_FILL_PROMPT).not.toMatch(/dos o tres títulos/);
  });
});

describe('press quotes need the press in the merchant\'s words (live test 2026-11-11)', () => {
  it('blocks press-quotes until the merchant names a newspaper, magazine, radio or interview', () => {
    expect(librarySectionBlocker('press-quotes', facts())).toMatch(/medio/);
    expect(librarySectionBlocker('press-quotes', facts({ story: 'La revista Ego nos dijo «el mejor pan de La Paz».' }))).toBeNull();
  });
});

describe('composed mode (spec 2026-11-11 store composer)', () => {
  const composed = { allowed: ['cover-mega', 'products-rows', 'story-split', 'closing-wordmark'], looks: { 'cover-mega': ['side', 'tilt'] } };
  it('keeps template-only sections the template allows, with the template\'s looks, and drops the rest', () => {
    const out = validateLibraryLayout({ blocks: [
      { type: 'cover-mega', look: 'tilt', title: 'Hola', photo: 0, items: [{ title: 'Uno' }, { title: 'Dos' }] },
      { type: 'products-rows', title: 'Sabores' },
      { type: 'reviews-cards', title: 'Opiniones' },
      { type: 'story-split', title: 'Nuestra historia', text: 'Horneamos cada día.', photo: 1 },
      { type: 'closing-wordmark', title: 'Hasta pronto' },
    ] } as never, facts(), { composed });
    expect(out.map(block => block.type)).toEqual(expect.arrayContaining(['cover-mega', 'story-split', 'closing-wordmark']));
    expect(out.map(block => block.type)).not.toContain('reviews-cards');
    expect(out.find(block => block.type === 'cover-mega')?.look).toBe('tilt');
  });
  it('a template that opens without a cover keeps its opener first and gets no cover added (owner 2026-11-11)', () => {
    const opened = { allowed: ['promo-banner', 'products-grid', 'story-split', 'closing-wordmark'], looks: {}, opener: 'promo-banner' };
    const out = validateLibraryLayout({ blocks: [
      { type: 'story-split', title: 'Nuestra historia', text: 'Horneamos cada día.', photo: 1 },
      { type: 'promo-banner', title: 'Temporada', text: 'Lo nuevo de la casa.', photo: 0 },
      { type: 'products-grid', title: 'Productos' },
      { type: 'closing-wordmark', title: 'Hasta pronto' },
    ] } as never, facts(), { composed: opened });
    expect(out[0].type).toBe('promo-banner');
    expect(out[1].type).toBe('products-grid');
    expect(out.some(block => block.type.startsWith('cover-'))).toBe(false);
  });
  it('without composed, a template-only section is still dropped (free mode unchanged)', () => {
    const out = validateLibraryLayout({ blocks: [{ type: 'cover-mega', look: 'tilt', title: 'Hola', photo: 0 }] } as never, facts());
    expect(out.map(block => block.type)).not.toContain('cover-mega');
  });
});
