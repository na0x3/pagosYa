import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readShopifyStore, shopifyOrigin, ShopifyReadError, type JsonGet } from './shopify-reader';

// Recorded 2026-09-27 from peakclyro.myshopify.com (the refund policy from allbirds.com, body replaced).
const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8'));
const meta = fixture('meta'), productsPage = fixture('products-page-1'), collections = fixture('collections'),
  collectionProducts = fixture('collection-products'), pages = fixture('pages'), refund = fixture('refund-policy');

const routes = (overrides: Record<string, any> = {}): JsonGet => async path => {
  const table: Record<string, any> = {
    '/meta.json': meta, '/products.json?limit=250&page=1': productsPage, '/products.json?limit=250&page=2': { products: [] },
    '/collections.json?limit=250': { collections: [...collections.collections, { handle: 'perros', title: 'Perros', description: '<p>Todo</p>', products_count: 2 }] },
    '/collections/perros/products.json?limit=250&page=1': collectionProducts, '/collections/perros/products.json?limit=250&page=2': { products: [] },
    '/pages.json?limit=250': pages, '/policies/refund-policy.json': refund, ...overrides,
  };
  return table[path] != null ? { status: 200, finalPath: path.split('?')[0], json: table[path] } : { status: 404, finalPath: path.split('?')[0], json: null };
};

describe('readShopifyStore', () => {
  it('normalizes the address', () => {
    expect(shopifyOrigin('mitienda.com/collections/x?y=1').href).toBe('https://mitienda.com/');
  });

  it('reads products, variants, images, collections, pages and set policies', async () => {
    const data = await readShopifyStore('peakclyro.myshopify.com', routes());
    expect(data.name).toBe('Peak'); expect(data.currency).toBe('EUR');
    expect(data.products.length).toBe(productsPage.products.length);
    expect(data.products[0]).toMatchObject({ handle: 'peak-choco-bites', title: 'PEAK Choco-Bites', optionNames: ['Title'] });
    expect(data.products[0].variants[0]).toMatchObject({ options: ['Default Title'], price: '1.99', available: true });
    expect(data.products[0].images[0]).toMatch(/^https:\/\/cdn\.shopify\.com\//);
    // Shopify's automatic "frontpage" collection is not a merchant collection.
    expect(data.collections.map(c => c.handle)).toEqual(['perros']);
    expect(data.collections[0].productHandles.length).toBe(collectionProducts.products.length);
    expect(data.articles.map(a => `${a.kind}:${a.handle}`)).toEqual(['page:contact', 'policy:refund-policy']);
    expect(data.stockKnown).toBe(false); expect(data.truncated).toBe(false);
  });

  it('says a protected store is protected and a non-Shopify site is not Shopify', async () => {
    await expect(readShopifyStore('x.com', async () => ({ status: 200, finalPath: '/password', json: null }))).rejects.toMatchObject({ code: 'protected' });
    await expect(readShopifyStore('x.com', async () => ({ status: 404, finalPath: '/meta.json', json: null }))).rejects.toMatchObject({ code: 'not_shopify' });
    await expect(readShopifyStore('x.com', routes({ '/meta.json': { name: 'Wix' } }))).rejects.toBeInstanceOf(ShopifyReadError);
  });

  it('says protected when only the catalog redirects to the password page', async () => {
    const get: JsonGet = async path => path === '/meta.json' ? { status: 200, finalPath: '/meta.json', json: meta } : { status: 200, finalPath: '/password', json: null };
    await expect(readShopifyStore('x.com', get)).rejects.toMatchObject({ code: 'protected' });
  });

  it('stops at 1,000 products and says so', async () => {
    const product = productsPage.products[0];
    const full = { products: Array.from({ length: 250 }, (_, i) => ({ ...product, id: i, handle: `p-${i}` })) };
    const get = routes({ '/products.json?limit=250&page=1': full, '/products.json?limit=250&page=2': full, '/products.json?limit=250&page=3': full, '/products.json?limit=250&page=4': full, '/products.json?limit=250&page=5': full });
    const data = await readShopifyStore('x.com', get);
    expect(data.products.length).toBe(1000); expect(data.truncated).toBe(true);
  });

  it('keeps going with a warning when collections or pages fail', async () => {
    const data = await readShopifyStore('x.com', routes({ '/collections.json?limit=250': null, '/pages.json?limit=250': null }));
    expect(data.products.length).toBeGreaterThan(0);
    expect(data.warnings.join(' ')).toMatch(/colecciones/);
  });

  // Final review, Important #3: a rate limit or a server error is not the end of the catalog, and a hidden catalog is protected.
  it('says Shopify did not respond on a 429 or 5xx instead of reading an empty or shorter catalog', async () => {
    const product = productsPage.products[0];
    const full = { products: Array.from({ length: 250 }, (_, i) => ({ ...product, id: i, handle: `p-${i}` })) };
    const throttled: JsonGet = async path => path === '/products.json?limit=250&page=2' ? { status: 429, finalPath: '/products.json', json: null } : routes({ '/products.json?limit=250&page=1': full })(path);
    await expect(readShopifyStore('x.com', throttled)).rejects.toMatchObject({ code: 'unreachable' });
    const metaDown: JsonGet = async path => path === '/meta.json' ? { status: 503, finalPath: '/meta.json', json: null } : routes()(path);
    await expect(readShopifyStore('x.com', metaDown)).rejects.toMatchObject({ code: 'unreachable' });
  });

  it('says protected when the catalog itself is hidden', async () => {
    const hidden: JsonGet = async path => path.startsWith('/products.json') ? { status: 404, finalPath: '/products.json', json: null } : routes()(path);
    await expect(readShopifyStore('x.com', hidden)).rejects.toMatchObject({ code: 'protected' });
  });

  // Final review, Important #8: mitienda.com, www.mitienda.com and the .myshopify.com address are the same store.
  it('identifies the store by its myshopify domain, whatever address was typed', async () => {
    expect((await readShopifyStore('www.peak.example', routes())).shopDomain).toBe('peakclyro.myshopify.com');
  });
});
