import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { applySeoDocument, createStorefrontSeo } from '../storefront-seo.mjs';
// fetch() forbids setting the Host header, so custom-domain requests (identified purely by Host,
// since there's no /s/<slug> prefix to carry the slug) are made with a raw http.request instead.
function fetchAsHost(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers: { Host: host } }, res => {
      let body = ''; res.on('data', chunk => { body += chunk; }); res.on('end', () => resolve({ status: res.statusCode, text: body }));
    });
    req.on('error', reject); req.end();
  });
}
test('initial HTML replaces generic metadata and exposes the same useful content without JavaScript', () => {
  const result = applySeoDocument('<head><title>Checkout</title><meta name="robots" content="noindex"></head><div id="app"></div>', { head: '<title>Café $&</title><meta name="robots" content="index, follow, max-image-preview:large">', body: '<h1>Café $&</h1><a href="/s/cafe/p/one">Origen</a>' });
  assert.match(result, /<h1>Café \$&<\/h1>/); assert.equal((result.match(/<title>/g) || []).length, 1); assert.doesNotMatch(result, /noindex/);
});
test('serves crawler files, noindexes personal links and returns real 404/503 statuses', async () => {
  const backend = createServer((req, res) => {
    if (req.url.includes('/missing/')) { res.writeHead(404).end(); return; }
    if (req.url.includes('/failed/')) { res.writeHead(500).end(); return; }
    if (req.url.includes('sitemap.xml')) return res.end('<urlset><url><loc>https://shop.example/s/cafe</loc></url></urlset>');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url.includes('store-discovery') ? [{ name: 'Café', home: 'https://shop.example/s/cafe', sitemap: 'https://shop.example/s/cafe/sitemap.xml' }] : { head: '<title>Café</title><meta name="robots" content="index, follow, max-image-preview:large">', body: '<h1>Café</h1>' }));
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const middleware = createStorefrontSeo({ apiBase: `http://127.0.0.1:${backend.address().port}`, checkoutOrigin: 'https://shop.example', template: async () => '<head><title>Checkout</title></head><div id="app"></div>' });
  const frontend = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end())); frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  const base = `http://127.0.0.1:${frontend.address().port}`;
  try {
    assert.match(await (await fetch(base + '/s/cafe')).text(), /<h1>Café<\/h1>/);
    const privatePage = await fetch(base + '/s/cafe?comeback=secret'); assert.equal(privatePage.headers.get('x-robots-tag'), 'noindex, nofollow'); assert.doesNotMatch(await privatePage.text(), /secret/);
    assert.ok((await (await fetch(base + '/robots.txt')).text()).includes(`Sitemap: ${base}/sitemap.xml`));
    assert.match(await (await fetch(base + '/sitemap.xml')).text(), /<sitemapindex/);
    assert.match(await (await fetch(base + '/s/cafe/sitemap.xml')).text(), /<urlset>/);
    assert.equal((await fetch(base + '/s/missing')).status, 404); assert.equal((await fetch(base + '/s/failed')).status, 503);
  } finally { frontend.closeAllConnections(); backend.closeAllConnections(); await Promise.all([new Promise(r => frontend.close(r)), new Promise(r => backend.close(r))]); }
});
test('renders server-side SEO for the whole-catalog and collection storefront pages, not the bare SPA shell', async () => {
  const seoRequests = [];
  const backend = createServer((req, res) => {
    seoRequests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    const url = new URL(req.url, 'http://backend.internal');
    const page = url.searchParams.get('page');
    const collection = url.searchParams.get('collection');
    if (page === 'productos.html') return res.end(JSON.stringify({ head: '<title>Catálogo completo · Café</title><link rel="canonical" href="https://shop.example/s/cafe/productos">', body: '<h1>Catálogo completo</h1>' }));
    if (page === 'coleccion.html' && collection === 'verano') return res.end(JSON.stringify({ head: '<title>Verano · Café</title><link rel="canonical" href="https://shop.example/s/cafe/c/verano">', body: '<h1>Verano</h1>' }));
    if (page === 'coleccion.html') return res.end(JSON.stringify({ head: '<title>Catálogo completo · Café</title><link rel="canonical" href="https://shop.example/s/cafe/productos">', body: '<h1>Catálogo completo (colección desconocida)</h1>' }));
    res.end(JSON.stringify({ head: '<title>Café</title>', body: '<h1>Café</h1>' }));
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const middleware = createStorefrontSeo({ apiBase: `http://127.0.0.1:${backend.address().port}`, checkoutOrigin: 'https://shop.example', template: async () => '<head><title>Checkout</title></head><div id="app"></div>' });
  const frontend = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end())); frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  const base = `http://127.0.0.1:${frontend.address().port}`;
  try {
    const catalog = await fetch(base + '/s/cafe/productos');
    assert.match(await catalog.text(), /<h1>Catálogo completo<\/h1>/);
    assert.match(seoRequests.at(-1), /[?&]page=productos\.html/);
    const collection = await fetch(base + '/s/cafe/c/verano');
    assert.match(await collection.text(), /<h1>Verano<\/h1>/);
    assert.match(seoRequests.at(-1), /[?&]page=coleccion\.html/);
    assert.match(seoRequests.at(-1), /[?&]collection=verano/);
    const unknown = await fetch(base + '/s/cafe/c/no-existe');
    assert.match(await unknown.text(), /<h1>Catálogo completo \(colección desconocida\)<\/h1>/);
    assert.match(seoRequests.at(-1), /[?&]collection=no-existe/);
  } finally { frontend.closeAllConnections(); backend.closeAllConnections(); await Promise.all([new Promise(r => frontend.close(r)), new Promise(r => backend.close(r))]); }
});
test('renders the same server-side SEO for the whole-catalog and collection pages on a custom domain, which carries no /s/<slug> prefix', async () => {
  const seoRequests = [];
  const backend = createServer((req, res) => {
    const url = new URL(req.url, 'http://backend.internal');
    if (url.pathname === '/stores/public/domain') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ slug: 'cafe' })); }
    seoRequests.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    const page = url.searchParams.get('page');
    const collection = url.searchParams.get('collection');
    if (page === 'productos.html') return res.end(JSON.stringify({ head: '<title>Catálogo completo · Café</title><link rel="canonical" href="https://cafe-seo.test/productos">', body: '<h1>Catálogo completo (dominio propio)</h1>' }));
    if (page === 'coleccion.html' && collection === 'verano') return res.end(JSON.stringify({ head: '<title>Verano · Café</title><link rel="canonical" href="https://cafe-seo.test/c/verano">', body: '<h1>Verano (dominio propio)</h1>' }));
    res.end(JSON.stringify({ head: '<title>Café</title>', body: '<h1>Café</h1>' }));
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const middleware = createStorefrontSeo({ apiBase: `http://127.0.0.1:${backend.address().port}`, checkoutOrigin: 'https://shop.example', template: async () => '<head><title>Checkout</title></head><div id="app"></div>' });
  const frontend = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end())); frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  const port = frontend.address().port;
  try {
    const catalog = await fetchAsHost(port, '/productos', 'cafe-seo.test');
    assert.equal(catalog.status, 200); assert.match(catalog.text, /<h1>Catálogo completo \(dominio propio\)<\/h1>/);
    assert.match(seoRequests.at(-1), /\/stores\/public\/cafe\/seo/); assert.match(seoRequests.at(-1), /[?&]page=productos\.html/);
    const collection = await fetchAsHost(port, '/c/verano', 'cafe-seo.test');
    assert.equal(collection.status, 200); assert.match(collection.text, /<h1>Verano \(dominio propio\)<\/h1>/);
    assert.match(seoRequests.at(-1), /[?&]page=coleccion\.html/); assert.match(seoRequests.at(-1), /[?&]collection=verano/);
  } finally { frontend.closeAllConnections(); backend.closeAllConnections(); await Promise.all([new Promise(r => frontend.close(r)), new Promise(r => backend.close(r))]); }
});

// Exercise the middleware directly so TTL boundaries need no real-time sleeps.
function seoHarness(t) {
  let now = 0;
  const calls = [];
  let upstream = async url => new Response(JSON.stringify(
    url.includes('/domain?') ? { slug: 'cafe' } : {
      head: '<title>Café</title><meta name="robots" content="index, follow, max-image-preview:large">',
      body: `<h1>${url}</h1>`,
    },
  ));
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', (url, options) => {
    calls.push({ url, options });
    return upstream(url);
  });
  const middleware = createStorefrontSeo({
    apiBase: 'https://api.example/v1', checkoutOrigin: 'https://shop.example',
    template: async () => '<head></head><div id="app"></div>',
  });
  return {
    calls,
    advance: ms => { now += ms; },
    respond: fn => { upstream = fn; },
    async render(url = '/s/cafe', host = 'shop.example', headers = {}) {
      const result = {};
      await middleware({ method: 'GET', url, headers: { host, ...headers } }, {
        writeHead(status, headers) { Object.assign(result, { status, headers }); },
        end(body) { result.body = body; },
      }, () => { result.next = true; });
      return result;
    },
  };
}

test('coalesces identical requests including body consumption and retries after failure', async t => {
  const h = seoHarness(t);
  const finishes = [];
  h.respond(() => new Response(new ReadableStream({
    start(controller) { finishes.push(() => { controller.enqueue(new TextEncoder().encode(JSON.stringify({ head: '<title>Café</title>', body: '<h1>Café</h1>' }))); controller.close(); }); },
  })));
  const first = h.render();
  const second = h.render();
  await new Promise(resolve => setImmediate(resolve));
  const callsBeforeFinish = h.calls.length;
  finishes.forEach(finish => finish());
  const results = await Promise.all([first, second]);
  assert.equal(callsBeforeFinish, 1);
  assert.equal(results[0].body, results[1].body);
  assert.equal(results[0].status, 200);

  h.respond(async () => { throw new Error('offline'); });
  assert.equal((await h.render('/s/failed')).status, 503);
  h.respond(async () => new Response(JSON.stringify({ head: '', body: 'Recuperada' })));
  assert.equal((await h.render('/s/failed')).status, 200);
});

test('caches store/product payloads for 30 seconds and keeps page variants separate', async t => {
  const h = seoHarness(t);
  for (const path of ['/s/cafe', '/s/cafe/p/one', '/s/cafe/p/two', '/s/cafe/productos', '/s/cafe/c/verano']) {
    await h.render(path);
  }
  assert.equal(h.calls.length, 5);
  h.advance(29_999);
  await h.render('/s/cafe'); await h.render('/s/cafe/p/one');
  assert.equal(h.calls.length, 5);
  h.advance(1);
  await h.render('/s/cafe'); await h.render('/s/cafe/p/one');
  assert.equal(h.calls.length, 7);
});

test('caches and coalesces domain resolution for five minutes', async t => {
  const h = seoHarness(t);
  await Promise.all([h.render('/', 'cafe.example'), h.render('/', 'cafe.example')]);
  assert.equal(h.calls.filter(call => call.url.includes('/domain?')).length, 1);
  h.advance(299_999);
  await h.render('/', 'cafe.example');
  assert.equal(h.calls.filter(call => call.url.includes('/domain?')).length, 1);
  h.advance(1);
  await h.render('/', 'cafe.example');
  assert.equal(h.calls.filter(call => call.url.includes('/domain?')).length, 2);
});

test('serves stale SEO and domain payloads on 429 but keeps other failures visible', async t => {
  const h = seoHarness(t);
  const original = await h.render('/', 'cafe.example');
  h.advance(300_000);
  h.respond(async () => new Response('', { status: 429 }));
  const stale = await h.render('/', 'cafe.example');
  assert.equal(stale.status, 200);
  assert.equal(stale.body, original.body);
  assert.equal(h.calls.length, 4);
  assert.equal((await h.render('/s/uncached')).status, 503);
  h.respond(async () => new Response('', { status: 404 }));
  assert.equal((await h.render('/', 'cafe.example')).status, 404);
  h.respond(async () => new Response('', { status: 429 }));
  assert.equal((await h.render('/', 'cafe.example')).status, 503);
});

test('evicts the least recently used payload beyond 500 entries', async t => {
  const h = seoHarness(t);
  for (let i = 0; i < 500; i++) await h.render(`/s/store-${i}`);
  await h.render('/s/store-0');
  assert.equal(h.calls.length, 500);
  await h.render('/s/store-500');
  await h.render('/s/store-0');
  assert.equal(h.calls.length, 501);
  await h.render('/s/store-1');
  assert.equal(h.calls.length, 502);
});

test('does not forward client identity headers or cache personalized HTML', async t => {
  const h = seoHarness(t);
  const privatePage = await h.render('/s/cafe?comeback=secret', 'shop.example', { 'x-forwarded-for': '1.2.3.4' });
  const publicPage = await h.render();
  assert.equal(privatePage.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(publicPage.headers['X-Robots-Tag'], 'index, follow');
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0].options.headers, { Accept: 'application/json' });
  assert.ok(!h.calls[0].url.includes('secret'));
});

test('coalesces crawler text payloads as reusable bodies', async t => {
  const h = seoHarness(t);
  h.respond(async () => new Response('<urlset/>'));
  const results = await Promise.all([h.render('/s/cafe/sitemap.xml'), h.render('/s/cafe/sitemap.xml')]);
  assert.equal(h.calls.length, 1);
  assert.equal(results[0].body, '<urlset/>');
  assert.equal(results[1].body, '<urlset/>');
});

test('keeps the merchant analytics tags on public pages and drops them on links carrying a secret', () => {
  const document = {
    head: '<title>Café</title><script async data-pagosya-analytics="ga4-loader" src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234567"></script><script data-pagosya-analytics="ga4">gtag(\'config\',\'G-ABC1234567\');</script>',
    body: '<h1>Café</h1>',
  };
  const shell = '<head><title>Checkout</title></head><div id="app"></div>';
  const publicPage = applySeoDocument(shell, document, false, false);
  assert.match(publicPage, /G-ABC1234567/);
  // A page the merchant excluded from search still gets measured.
  assert.match(applySeoDocument(shell, document, true, false), /G-ABC1234567/);
  // A recovery/checkout URL must not report its query string to any provider.
  const privatePage = applySeoDocument(shell, document, true, true);
  assert.doesNotMatch(privatePage, /G-ABC1234567/);
  assert.doesNotMatch(privatePage, /data-pagosya-analytics/);
  assert.match(privatePage, /<h1>Café<\/h1>/);
});
test('old Shopify links on a custom domain 301 to the imported product and collection', async () => {
  const backend = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/stores/public/domain')) return res.end(JSON.stringify({ slug: 'cafe' }));
    if (req.url === '/stores/public/cafe/redirect?path=%2Fproducts%2Fgrano') return res.end(JSON.stringify({ location: '/p/abc' }));
    if (req.url === `/stores/public/cafe/redirect?path=${encodeURIComponent('/Products/Café')}`) return res.end(JSON.stringify({ location: '/p/cafe' }));
    res.writeHead(404).end();
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const middleware = createStorefrontSeo({ apiBase: `http://127.0.0.1:${backend.address().port}`, checkoutOrigin: 'https://shop.example', template: async () => '<head></head>' });
  const frontend = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end('next'))); frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  try {
    const port = frontend.address().port;
    const head = path => new Promise((resolve, reject) => { const req = httpRequest({ host: '127.0.0.1', port, path, agent: false, headers: { Host: 'micafe.com' } }, res => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location }); }); req.on('error', reject); req.end(); });
    assert.deepEqual(await head('/products/grano'), { status: 301, location: '/p/abc' });
    assert.deepEqual(await head('/collections/cafes/products/grano?ref=ig'), { status: 301, location: '/p/abc?ref=ig' });
    assert.equal((await head('/products/otro')).status, 404);
    // Capitals and accents reach the API decoded; it reduces them to the key the import stored.
    assert.deepEqual(await head('/Products/Caf%C3%A9'), { status: 301, location: '/p/cafe' });
    assert.equal((await head('/products/%E0%A4%A')).status, 404);
  } finally {
    backend.closeAllConnections(); frontend.closeAllConnections(); backend.close(); frontend.close();
  }
});

test('a store head replaces the platform icon; a page without a store icon keeps it', () => {
  const template = '<head><title>Checkout</title><link rel="icon" type="image/png" href="/logo-mark.png" /></head><div id="app"></div>';
  const store = applySeoDocument(template, { head: '<title>Eje</title><link rel="icon" type="image/png" sizes="32x32" href="https://api.example/v1/stores/public/eje/favicon.png"><link rel="apple-touch-icon" href="https://api.example/v1/stores/public/eje/favicon.png?size=180">', body: '' });
  assert.doesNotMatch(store, /logo-mark\.png/);
  assert.equal((store.match(/rel="icon"/g) || []).length, 1);
  const plain = applySeoDocument(template, { head: '<title>Eje</title>', body: '' });
  assert.match(plain, /logo-mark\.png/);
});
