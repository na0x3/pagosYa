import { loadEmailContext, promoDiscountLabel, socialIcon } from './email-context';

const opts = { assetBase: 'https://api.example', checkoutOrigin: 'https://pagar.bo' };
const store = (over: object = {}) => ({ name: 'Café Illimani', slug: 'cafe', logoUrl: null, bannerUrl: null, contactEmail: null, contactPhone: null,
  checkoutMode: 'payment', policies: {}, locations: [], publishedSourceRevision: null, customDomains: [], ...over });

let mock: any;
function prisma(over: { store?: object | null; links?: object[]; collections?: object[]; review?: object | null; promos?: object[]; products?: object[]; version?: object | null } = {}) {
  mock = {
    store: { findUnique: jest.fn(async () => (over.store === null ? null : store(over.store))) },
    storeLink: { findMany: jest.fn(async () => over.links ?? []) },
    collection: { findMany: jest.fn(async () => over.collections ?? []) },
    storeReview: { findFirst: jest.fn(async () => over.review ?? null) },
    promoCode: { findMany: jest.fn(async () => over.promos ?? []) },
    paymentLink: { findMany: jest.fn(async () => over.products ?? []) },
    storeSourceVersion: { findUnique: jest.fn(async () => over.version ?? null) },
  };
  return mock;
}

describe('socialIcon', () => {
  it.each([
    ['https://www.instagram.com/cafe', 'instagram'], ['https://tiktok.com/@cafe', 'tiktok'], ['https://wa.me/59170000000', 'whatsapp'],
    ['https://x.com/cafe', 'x'], ['https://twitter.com/cafe', 'x'], ['https://m.facebook.com/cafe', 'facebook'],
    ['https://youtu.be/1', 'youtube'], ['https://linktr.ee/cafe', null], ['https://notinstagram.com/cafe', null], ['nota', null],
  ])('%s → %s', (url, icon) => expect(socialIcon(url)).toBe(icon));
});

describe('promoDiscountLabel', () => {
  it('builds the discount from the code itself', () => {
    expect(promoDiscountLabel('PERCENT', 10, 'BOB')).toBe('10% en tu próxima compra');
    expect(promoDiscountLabel('FIXED', 2000, 'BOB')).toBe('Bs 20 en tu próxima compra');
    expect(promoDiscountLabel('FIXED', 1550, 'USD')).toBe('USD 15.50 en tu próxima compra');
  });
});

describe('loadEmailContext', () => {
  it('only shares codes that are active and marked for emails', async () => {
    const ctx = await loadEmailContext(prisma({ promos: [{ id: 'p2', code: 'VUELVE10', discountType: 'PERCENT', discountValue: 10 }] }), 's1', opts);
    expect(ctx.promos).toEqual([{ id: 'p2', code: 'VUELVE10', discount: '10% en tu próxima compra' }]);
    expect(mock.promoCode.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 's1', isActive: true, showInEmails: true } }));
  });

  it('uses only a published review of 4★ or more, with the first name only', async () => {
    const ctx = await loadEmailContext(prisma({ review: { displayName: 'Ana María Quispe', rating: 5, body: 'Llegó perfecto' } }), 's1', opts);
    expect(ctx.review).toEqual({ text: 'Llegó perfecto', author: 'Ana', stars: 5 });
    expect(mock.storeReview.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 's1', status: 'PUBLISHED', rating: { gte: 4 } } }));
  });

  it('a store with nothing set up yields empty, never broken, facts', async () => {
    const ctx = await loadEmailContext(prisma(), 's1', opts);
    expect(ctx).toMatchObject({ storeUrl: 'https://pagar.bo/s/cafe', heroImage: null, nav: [], socials: [], address: null, policies: [], review: null, promos: [],
      contact: { email: null, phone: null, whatsapp: false }, delivers: false });
    expect(ctx.recommendations([])).toEqual([]);
  });

  it('a missing store yields the same empty facts', async () => {
    const ctx = await loadEmailContext(prisma({ store: null }), 's1', opts);
    expect(ctx).toMatchObject({ storeUrl: null, heroImage: null, nav: [], policies: [], promos: [] });
  });

  it('picks the published homepage first photo as hero, else the banner', async () => {
    const version = { digest: 'a'.repeat(64), snapshot: { files: [{ path: 'index.html', content: '<img src="assets/logo.svg"><img src="assets/hero.jpg">' }, { path: 'assets/hero.jpg', content: '' }] } };
    const ctx = await loadEmailContext(prisma({ store: { publishedSourceRevision: 3, bannerUrl: '/v1/uploads/banner.webp' }, version }), 's1', opts);
    expect(ctx.heroImage?.src).toBe('https://api.example/v1/stores/public/cafe/source-site/assets/3-aaaaaaaaaaaa/assets/hero.jpg');
    expect(mock.storeSourceVersion.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId_revision: { storeId: 's1', revision: 3 } } }));
    const banner = await loadEmailContext(prisma({ store: { bannerUrl: '/v1/uploads/banner.webp' } }), 's1', opts);
    expect(banner.heroImage).toEqual({ src: 'https://api.example/v1/uploads/banner.webp', alt: 'Café Illimani' });
  });

  it('no hero photo without an https asset base', async () => {
    const ctx = await loadEmailContext(prisma({ store: { bannerUrl: '/v1/uploads/banner.webp' } }), 's1', { ...opts, assetBase: null });
    expect(ctx.heroImage).toBeNull();
  });

  it('recommends active products with photos, never ones in the order', async () => {
    const products = ['pl_1', 'pl_2', 'pl_3'].map((id, i) => ({ id, name: `Café ${i + 1}`, amount: 5000, currency: 'BOB', imageUrls: [`/v1/uploads/${id}.webp`] }));
    const ctx = await loadEmailContext(prisma({ products }), 's1', opts);
    const picked = ctx.recommendations(['pl_1']);
    expect(picked.map(p => p.name)).toEqual(['Café 2', 'Café 3']);
    expect(picked[0]).toMatchObject({ price: '50.00 BOB', href: 'https://pagar.bo/s/cafe/p/pl_2', image: { src: 'https://api.example/v1/uploads/pl_2.webp', alt: 'Café 2' } });
    expect(ctx.recommendations(['pl_1', 'pl_2'])).toEqual([]); // one is too few to be a section
    expect(mock.paymentLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: 's1', status: 'ACTIVE' } }));
  });

  it('marks WhatsApp when the store takes orders by WhatsApp', async () => {
    const ctx = await loadEmailContext(prisma({ store: { checkoutMode: 'whatsapp', contactPhone: '+591 70000000', contactEmail: 'hola@cafe.bo' } }), 's1', opts);
    expect(ctx.contact).toEqual({ email: 'hola@cafe.bo', phone: '+591 70000000', whatsapp: true });
  });

  it('links an unknown social host as text and a known one with its icon, and drops a link that is not https', async () => {
    const ctx = await loadEmailContext(prisma({ links: [{ label: 'IG', url: 'https://instagram.com/cafe' }, { label: 'Linktree', url: 'https://linktr.ee/cafe' }, { label: 'Raro', url: 'javascript:alert(1)' }] }), 's1', opts);
    expect(ctx.socials.map(s => s.icon)).toEqual(['instagram', null]);
    expect(ctx.socials[1]).toEqual({ icon: null, label: 'Linktree', href: 'https://linktr.ee/cafe' });
  });

  it('builds header links from collections, policies, the address and delivery from the store', async () => {
    const ctx = await loadEmailContext(prisma({
      store: { customDomains: [{ hostname: 'cafe.bo' }], policies: { returns: '30 días', delivery: 'En La Paz', privacy: '' },
        locations: [{ id: 'l1', name: 'Tienda', address: 'Av. 6 de Agosto 123', city: 'La Paz', pickupEnabled: true, deliveryEnabled: true, openingHours: [] }] },
      collections: [{ name: 'Café', slug: 'cafe en grano' }],
    }), 's1', opts);
    expect(ctx.storeUrl).toBe('https://cafe.bo');
    expect(ctx.nav).toEqual([{ label: 'Café', href: 'https://cafe.bo/c/cafe%20en%20grano' }]);
    expect(ctx.policies).toEqual([{ key: 'returns', label: 'Cambios y devoluciones', href: 'https://cafe.bo' }, { key: 'delivery', label: 'Envíos', href: 'https://cafe.bo' }]);
    expect(ctx.address).toBe('Av. 6 de Agosto 123, La Paz');
    expect(ctx.delivers).toBe(true);
  });
});
