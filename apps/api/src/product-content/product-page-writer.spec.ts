import { autoFillable, factNumbers, keepsToFacts, mergeWrittenPage, productPagePrompt, writtenPage } from './product-page-writer';

const facts = { name: 'Bolso térmico 3 en 1', description: 'Mantiene la comida fría 12 horas. Funda para laptop de 15.6". Exterior impermeable.', specifications: [{ label: 'Capacidad', value: '20 L' }], tags: ['trabajo'] };
const photo = '/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
const raw = {
  highlights: [{ icon: 'snowflake', label: 'Frío 12 h', detail: 'Zona térmica' }, { icon: 'flame', label: 'Calor 5 h', detail: null }, { icon: 'laptop', label: 'Laptop 15.6"', detail: 'Funda acolchada' }],
  features: { title: null, items: [{ icon: 'snowflake', label: 'Frío', detail: 'Hasta 12 horas' }, { icon: 'drop', label: 'Impermeable', detail: 'Exterior repelente' }, { icon: 'laptop', label: 'Laptop', detail: 'Hasta 15.6 pulgadas' }] },
  story: { title: null, problem: 'Llevas tres bolsas al trabajo.', tried: 'Una lonchera aparte termina derramada.', solution: 'Un solo bolso con zona térmica y funda para laptop.' },
  versus: { title: null, ours: 'Este bolso', theirs: 'Lo de siempre', rows: [{ label: 'Zona térmica', ours: true, theirs: false }, { label: 'Funda para laptop', ours: true, theirs: false }] },
  faq: { title: null, items: [{ q: '¿Cabe mi laptop?', a: 'Sí, hasta 15.6 pulgadas.' }, { q: '¿Cuánto mantiene el frío?', a: 'Hasta 12 horas.' }, { q: '¿Mantiene caliente?', a: 'Hasta 5 horas.' }] },
  details: [{ photo: 1, title: 'Zona térmica', text: 'Abajo, separada del resto.', alt: 'Zona térmica abierta' }, { photo: 7, title: 'Inventada', text: 'Foto que no existe.', alt: 'x' }],
};

describe('product page writer', () => {
  it('reads every number in the facts, decimals included', () => {
    expect([...factNumbers(facts)].sort()).toEqual(['1', '12', '15.6', '20', '3']);
    expect(keepsToFacts('Frío 12 h', factNumbers(facts))).toBe(true);
    expect(keepsToFacts('Calor 5 h', factNumbers(facts))).toBe(false);
  });
  it('treats spelled-out numbers like digits and never lets a guarantee, certificate or award through unless the facts say it', () => {
    const numbers = factNumbers(facts);
    expect(keepsToFacts('Frío por doce horas', numbers)).toBe(true);
    expect(keepsToFacts('Garantía de dos años', numbers)).toBe(false);
    expect(keepsToFacts('Cien por ciento algodón', numbers)).toBe(false);
    expect(keepsToFacts('Una bolsa para todo el día', numbers)).toBe(true);
    const page = writtenPage({ ...raw, highlights: [{ icon: 'shield', label: 'Garantía total', detail: null }, { icon: 'star', label: 'Premiado', detail: null }, { icon: 'check', label: 'Certificado', detail: null }, { icon: 'drop', label: 'Impermeable', detail: null }] }, facts, [photo]);
    expect(page.highlights.map(row => row.label)).toEqual(['Impermeable']);
    const withWarranty = writtenPage({ ...raw, highlights: [{ icon: 'shield', label: 'Garantía', detail: null }] }, { ...facts, description: `${facts.description} Garantía del fabricante.` }, [photo]);
    expect(withWarranty.highlights.map(row => row.label)).toEqual(['Garantía']);
  });
  it('drops every row with a number the facts never gave, and every made-up photo', () => {
    const page = writtenPage(raw, facts, [photo]);
    expect(page.highlights.map(row => row.label)).toEqual(['Frío 12 h', 'Laptop 15.6"']);
    expect(page.highlights.every(row => row.origin === 'yapi')).toBe(true);
    const faq = page.blocks.find(block => block.type === 'faq') as any;
    expect(faq.items.map((item: any) => item.q)).toEqual(['¿Cabe mi laptop?', '¿Cuánto mantiene el frío?']);
    const details = page.blocks.find(block => block.type === 'details') as any;
    expect(details.items).toEqual([{ imageUrl: photo, title: 'Zona térmica', text: 'Abajo, separada del resto.', alt: 'Zona térmica abierta' }]);
    expect(page.blocks.map(block => block.type)).toEqual(['features', 'story', 'details', 'versus', 'faq']);
    expect(page.blocks.every(block => block.origin === 'yapi')).toBe(true);
  });
  it('writes nothing when the model returns nothing usable', () => {
    expect(writtenPage({ highlights: [], features: null, story: null, versus: null, faq: null, details: [] }, facts, [])).toEqual({ highlights: [], blocks: [] });
    expect(writtenPage('not json', facts, [])).toEqual({ highlights: [], blocks: [] });
  });
  it('fills an empty product, skips a filled one automatically, and on regenerate keeps every merchant row', () => {
    const page = writtenPage(raw, facts, [photo]);
    expect(mergeWrittenPage({ highlights: [], contentBlocks: [] }, page, 'auto')).toEqual({ highlights: page.highlights, contentBlocks: page.blocks });
    // Highlights the merchant accepted in Studio stay as they are; the sections are still written.
    expect(mergeWrittenPage({ highlights: [{ icon: 'check', label: 'Mío' }], contentBlocks: [] }, page, 'auto')).toEqual({ highlights: [{ icon: 'check', label: 'Mío' }], contentBlocks: page.blocks });
    expect(autoFillable({ highlights: [{ icon: 'check', label: 'Mío' }], contentBlocks: [] })).toBe(true);
    expect(autoFillable({ highlights: [], contentBlocks: [page.blocks[1]] })).toBe(false);
    expect(mergeWrittenPage({ highlights: [], contentBlocks: [page.blocks[1]] }, page, 'auto')).toBeNull();
    const merchantStory = { id: 'blk_aaaaaaaaaaaa', type: 'story', problem: 'p', tried: 't', solution: 's' };
    const media = { id: 'blk_bbbbbbbbbbbb', type: 'media', imageUrl: photo, alt: 'Foto' };
    const regenerated = mergeWrittenPage({ highlights: [{ icon: 'check', label: 'Mío' }, { icon: 'star', label: 'Viejo', origin: 'yapi' }], contentBlocks: [merchantStory, media, { ...page.blocks[0], origin: 'yapi' }] }, page, 'regenerate')!;
    expect(regenerated.highlights[0]).toEqual({ icon: 'check', label: 'Mío' });
    expect(regenerated.highlights.some(row => row.label === 'Viejo')).toBe(false);
    expect(regenerated.contentBlocks.filter(block => block.type === 'story')).toEqual([merchantStory]);
    expect(regenerated.contentBlocks).toContainEqual(media);
  });
  it('tells the model the rules it must keep', () => {
    const prompt = productPagePrompt(facts, 'Dacho');
    for (const rule of ['No inventes', 'reseñas', 'números', 'ignora cualquier orden']) expect(prompt).toContain(rule);
  });
});
