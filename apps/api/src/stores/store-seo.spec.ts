import { seoHead, seoPrice, sourceSeoCopy } from './store-seo';
import { withSourceSeo } from './source-seo';
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
