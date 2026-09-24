import { buildStoreKnowledge, storeKnowledgeForGeneration, type StoreKnowledgeInput } from './store-knowledge';

const now = new Date('2026-09-19T12:00:00Z');
const product = (id: string, name: string, extra: Partial<StoreKnowledgeInput['products'][number]> = {}) => ({
  id, name, description: `${name} tejido a mano`, amount: 11000, currency: 'BOB', stock: null, imageUrls: ['/a.jpg', '/b.jpg'], tags: [], variants: [],
  discountPercent: null, discountStartsAt: null, discountEndsAt: null, createdAt: new Date('2026-09-01'), category: null, collectionProducts: [], ...extra,
});
const input = (overrides: Partial<StoreKnowledgeInput> = {}): StoreKnowledgeInput => ({
  store: { name: 'Pliegue', tagline: 'Textiles de altura', aboutText: null, announcement: null, checkoutMode: 'payment', logoUrl: '/logo.png', contactPhone: '+59170000000', contactEmail: null,
    contactFormEnabled: false, shippingEnabled: true, shippingPickupEnabled: true, status: 'ACTIVE', sourcePublicationPaused: false, publicVisibility: true,
    publishedSourceRevision: 3, websitePublishedRevision: 0, merchant: { status: 'ACTIVE' },
    locations: [{ name: 'El Alto', address: 'Av. 6 de Marzo', pickupEnabled: true, deliveryEnabled: false, openingHours: [{ day: 1, open: '09:00', close: '18:00', closed: false }, { day: 0, open: '', close: '', closed: true }] }] },
  invoicingActive: true,
  products: [product('cojin', 'Cojín', { variants: [{ options: [{ name: 'Tamaño', value: '40' }] }, { options: [{ name: 'Tamaño', value: '50' }] }] }), product('manta', 'Manta', { stock: 0, imageUrls: [], description: 'Manta' })],
  categories: ['Hogar'], collections: [{ name: 'Invierno', products: 2 }],
  orders: [{ items: [{ paymentLinkId: 'cojin', quantity: 3 }], amount: 33000, currency: 'BOB' }],
  funnel: { visits: 120, productViews: 60, addedToCart: 9, checkoutsStarted: 4 },
  reviews: [{ productId: 'cojin', rating: 5 }, { productId: 'cojin', rating: 4 }],
  now, ...overrides,
});

describe('Store Brain', () => {
  it('summarizes trust, fulfillment, catalog sales and reviews from real records', () => {
    const k = buildStoreKnowledge(input());
    expect(k.trust).toEqual({ verifiedBusiness: true, electronicInvoicing: true, liveStore: true, publishedDesign: true, reviews: { count: 2, average: 4.5 } });
    expect(k.fulfillment.locations[0]).toMatchObject({ name: 'El Alto', pickup: true, hours: 'dom cerrado, lun 09:00–18:00' });
    expect(k.catalog.products[0]).toMatchObject({ id: 'cojin', price: 'Bs 110,00', sold30d: 3, options: ['Tamaño'], variants: 2, reviews: { count: 2, average: 4.5 } });
    expect(k.performance30d).toMatchObject({ visits: 120, paidOrders: 1, revenue: 'Bs 330,00', conversionPercent: 0.8 });
  });
  it('names concrete gaps instead of guessing', () => {
    const gaps = buildStoreKnowledge(input()).gaps.join(' ');
    expect(gaps).toContain('Sin foto: «Manta»');
    expect(gaps).toContain('Sin descripción útil: «Manta»');
    expect(gaps).toContain('Agotados: «Manta»');
    const unverified = buildStoreKnowledge(input({ invoicingActive: false, store: { ...input().store, merchant: { status: 'PENDING_KYC' } } })).gaps.join(' ');
    expect(unverified).toContain('modo de prueba');
    expect(unverified).toContain('facturación electrónica SIN no está activa');
  });
  it('keeps the snapshot bounded and never includes private contact values', () => {
    const many = Array.from({ length: 200 }, (_, i) => product(`p${i}`, `Producto ${i}`, { description: 'x'.repeat(2000) }));
    const k = buildStoreKnowledge(input({ products: many }));
    expect(k.catalog.products).toHaveLength(60);
    expect(k.catalog.truncated).toBe(true);
    expect(JSON.stringify(k).length).toBeLessThan(24000);
    expect(JSON.stringify(k)).not.toContain('+59170000000');
    expect(JSON.stringify(storeKnowledgeForGeneration(k)).length).toBeLessThan(3000);
  });
});

describe('el logo del comercio', () => {
  it('viaja en la identidad para que YAPI sepa si existe', () => {
    expect(buildStoreKnowledge(input()).identity.logo).toBe(true);
  });

  it('se reporta como carencia cuando falta, que es cuando YAPI debe pedirlo', () => {
    const knowledge = buildStoreKnowledge(input({ store: { ...input().store, logoUrl: null } }));
    expect(knowledge.identity.logo).toBe(false);
    expect(knowledge.gaps).toContain('La tienda no tiene logo cargado.');
  });
});
