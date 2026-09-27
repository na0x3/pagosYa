import { seoHead, seoPrice, sourceSeoCopy } from './store-seo';
import { withSourceSeo } from '../storefront-source/source-seo';
import { StoreSeoService } from './store-seo.service';
it('extracts published copy without executing scripts or copying hidden/template content', () => {
  const result = sourceSeoCopy('<head><title>Tienda &amp; café</title><meta name="description" content="Café de origen"></head><h1>Una pausa</h1><script>stealSecrets()</script><p hidden>Private</p><template><p>Not rendered</p></template><p>Hecho aquí.</p>');
  expect(result).toMatchObject({ title: 'Tienda & café', description: 'Café de origen', blocks: [{ tag: 'h1', text: 'Una pausa' }, { tag: 'p', text: 'Hecho aquí.' }] });
});
it('escapes HTML and script terminators and keeps metadata truthful', () => {
  const head = seoHead({ title: '"><script>alert(1)</script>', description: 'A & B', canonical: 'https://store.example/?a=1&b=2', graph: [{ name: '</script><script>alert(1)</script>' }] });
  expect(head).not.toContain('<script>alert'); expect(head).toContain('\\u003c/script>'); expect(head).toContain('A &amp; B');
  expect(seoPrice({ amount: 1000, discountPercent: 20, discountEndsAt: '2026-09-01' }, Date.parse('2026-09-08'))).toBe(1000);
  expect(seoPrice({ amount: 1000, discountPercent: 20 }, Date.parse('2026-09-08'))).toBe(800);
});
it('adds discovery files to existing snapshots and noindexes checkout without exposing the private brief', () => {
  const snapshot: any = { schemaVersion: 1, brief: { audience: 'private strategy' }, files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'cafe', checkoutOrigin: 'https://shops.example', data: { storeName: 'Café', items: [{ id: 'p1', name: 'Café & leche' }] } }) + ';' }, { path: 'index.html', content: '<html><head><title>Café</title></head><body><h1>Café</h1></body></html>' }, { path: 'checkout.html', content: '<html><head></head><body>Pago</body></html>' }] };
  const files = withSourceSeo(snapshot).files;
  expect(files.find(f => f.path === 'llms.txt')!.content).toContain('/s/cafe/p/p1');
  expect(files.find(f => f.path === 'sitemap.xml')!.content).not.toContain('checkout');
  expect(files.find(f => f.path === 'llms.txt')!.content).not.toContain('private strategy');
  expect(files.find(f => f.path === 'checkout.html')!.content).toContain('noindex, nofollow');
  const repeated = withSourceSeo({ ...snapshot, files }).files;
  expect(repeated.filter(f => f.path === 'llms.txt')).toHaveLength(1);
  expect((repeated.find(f => f.path === 'index.html')!.content.match(/application\/ld\+json/g) || [])).toHaveLength(1);
});
it('gives productos.html a stable pretty canonical that agrees with its sitemap entry, while product.html/coleccion.html stay on the neutral fallback', () => {
  const snapshot: any = {
    schemaVersion: 1, brief: { audience: 'private' },
    files: [
      { path: 'config.js', content: 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'cafe', checkoutOrigin: 'https://shops.example', data: { storeName: 'Café', items: [] } }) + ';' },
      { path: 'index.html', content: '<html><head><title>Café</title></head><body><h1>Café</h1></body></html>' },
      { path: 'product.html', content: '<html><head></head><body><main data-pagosya-product-page></main></body></html>' },
      { path: 'productos.html', content: '<html><head></head><body><main data-pagosya-catalog data-catalog-full></main></body></html>' },
      { path: 'coleccion.html', content: '<html><head></head><body><main data-pagosya-catalog data-catalog-full data-collection-page></main></body></html>' },
    ],
  };
  const files = withSourceSeo(snapshot).files;
  const canonicalOf = (path: string) => files.find(f => f.path === path)!.content.match(/<link rel="canonical" href="([^"]*)">/)![1];
  // productos.html has one stable URL: its own canonical, its sitemap entry and the pretty URL
  // commerce.js sets at runtime (Task 4) all agree, unlike the parameterized product/collection pages.
  expect(canonicalOf('productos.html')).toBe('https://shops.example/s/cafe/productos');
  expect(canonicalOf('product.html')).toBe('https://shops.example/s/cafe');
  expect(canonicalOf('coleccion.html')).toBe('https://shops.example/s/cafe');
  const sitemap = files.find(f => f.path === 'sitemap.xml')!.content;
  expect(sitemap).toContain('<loc>https://shops.example/s/cafe/productos</loc>');
  expect(sitemap).not.toContain('product.html');
  expect(sitemap).not.toContain('coleccion.html');
  const llms = files.find(f => f.path === 'llms.txt')!.content;
  expect(llms).toContain('https://shops.example/s/cafe/productos');
});
describe('StoreSeoService — the two new platform-owned catalog pages (Task 8/CATALOG_ARRANGEMENT §4)', () => {
  function makeService(opts: { files?: any[]; items?: any[]; collections?: any[] } = {}) {
    const store = { id: 's1', slug: 'cafe', name: 'Café', tagline: 'Café de origen', bannerUrl: null, logoUrl: null, customDomains: [], publishedSourceRevision: 1, updatedAt: new Date('2026-01-01T00:00:00Z') };
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue(store) },
      storeExtension: { findMany: jest.fn(async () => []) },
      storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ snapshot: { files: opts.files || [] }, createdAt: new Date('2026-01-02T00:00:00Z') }) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
      collection: { findMany: jest.fn().mockResolvedValue([{ slug: 'invierno', updatedAt: new Date('2026-09-01') }]) },
    };
    const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', tagline: 'Café de origen', items: opts.items || [], collections: opts.collections || [] }) };
    const config: any = { get: jest.fn((key: string) => (key === 'app.checkoutOrigin' ? 'https://shops.example' : key === 'app.port' ? 3001 : undefined)) };
    return new StoreSeoService(prisma, stores, config);
  }
  const files = [
    { path: 'index.html', content: '<html><head><title>Café</title></head><body><h1>Café</h1></body></html>' },
    { path: 'productos.html', content: '<html><head><title>Catálogo completo</title><meta name="description" content="Todo el catálogo de Café."></head><body><h1>Catálogo</h1></body></html>' },
    { path: 'coleccion.html', content: '<html><head><title>Colección</title></head><body><h1>Colección</h1></body></html>' },
    { path: 'product.html', content: '<html><head></head><body></body></html>' },
    { path: 'checkout.html', content: '<h1>Checkout</h1>' },
  ];
  const items = [
    { id: 'p1', name: 'Producto Uno', description: 'Uno bueno', currency: 'BOB', amount: 1000, imageUrls: [], stock: null },
    { id: 'p2', name: 'Producto Dos', description: 'Dos bueno', currency: 'BOB', amount: 2000, imageUrls: [], stock: null },
  ];
  const collections = [{ id: 'c1', name: 'Colección de verano', slug: 'verano', productIds: ['p1'] }];
  it("gives /productos (productos.html) the same pretty canonical source-seo bakes, not the raw ?source_page= fallback", async () => {
    const doc = await makeService({ files, items, collections }).document('cafe', undefined, 'productos.html');
    expect(doc.canonical).toBe('https://shops.example/s/cafe/productos');
    expect(doc.canonical).not.toContain('source_page');
  });
  it("gives a known collection its own title, description and canonical, scoped to its own products only", async () => {
    const doc = await makeService({ files, items, collections }).document('cafe', undefined, 'coleccion.html', 'verano');
    expect(doc.canonical).toBe('https://shops.example/s/cafe/c/verano');
    expect(doc.title).toBe('Colección de verano · Café');
    expect(doc.head).toContain('Colección de verano');
    expect(doc.body).toContain('Producto Uno');
    expect(doc.body).not.toContain('Producto Dos');
  });
  it('never emits a canonical implying a collection that does not exist; an unknown slug renders the whole catalog like the storefront runtime does', async () => {
    const doc = await makeService({ files, items, collections }).document('cafe', undefined, 'coleccion.html', 'no-existe');
    expect(doc.canonical).toBe('https://shops.example/s/cafe/productos');
    expect(doc.canonical).not.toContain('no-existe');
    expect(doc.body).toContain('Producto Uno');
    expect(doc.body).toContain('Producto Dos');
  });
  it('advertises the catalog page at its pretty URL in the sitemap, and never advertises the parameterized coleccion.html template', async () => {
    const xml = await makeService({ files, items, collections }).sitemap('cafe');
    expect(xml).toContain('<loc>https://shops.example/s/cafe/productos</loc>');
    expect(xml).not.toContain('coleccion.html');
    expect(xml).not.toContain('product.html');
  });
});
describe('StoreSeoService — React homepages, collections and locale (task 5.4)', () => {
  const service = (files: any[]) => {
    const store = { id: 's1', slug: 'cafe', name: 'Café', tagline: null, bannerUrl: null, logoUrl: null, customDomains: [], publishedSourceRevision: 1, updatedAt: new Date('2026-01-01T00:00:00Z') };
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue(store) },
      storeExtension: { findMany: jest.fn(async () => []) },
      storeSourceVersion: { findUnique: jest.fn().mockResolvedValue({ snapshot: { files }, createdAt: new Date('2026-01-02T00:00:00Z') }) },
      paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
      collection: { findMany: jest.fn().mockResolvedValue([{ slug: 'invierno', updatedAt: new Date('2026-09-01T00:00:00Z') }]) },
    };
    const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', items: [], collections: [] }) };
    const config: any = { get: jest.fn((key: string) => (key === 'app.checkoutOrigin' ? 'https://shops.example' : undefined)) };
    return new StoreSeoService(prisma, stores, config);
  };
  const reactShell = { path: 'index.html', content: '<!doctype html><html lang="es"><head><title></title></head><body><div id="pagosya-react-root"></div></body></html>' };
  const layout = { path: 'source-next-layout.json', content: JSON.stringify({ 'index.html': '<main><h1>Café de altura</h1><p>Tostado cada martes en La Paz.</p><script>alert(1)</script></main>' }) };
  it('reads a React homepage from its statically rendered layout, as text only', async () => {
    const doc = await service([reactShell, layout]).document('cafe');
    expect(doc.title).toBe('Café de altura');
    expect(doc.head).toContain('Tostado cada martes en La Paz.');
    expect(doc.body).toContain('<h1>Café de altura</h1>');
    expect(doc.body).not.toContain('<script>');
  });
  it('lists collections with active products in the sitemap after the homepage, and marks the locale', async () => {
    const seo = service([reactShell, layout]);
    const sitemap = await seo.sitemap('cafe');
    expect(sitemap).toContain('<loc>https://shops.example/s/cafe/c/invierno</loc>');
    expect(sitemap.indexOf('/s/cafe</loc>')).toBeLessThan(sitemap.indexOf('/c/invierno'));
    expect((await seo.document('cafe')).head).toContain('<meta property="og:locale" content="es_BO">');
  });
});
