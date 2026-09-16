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
