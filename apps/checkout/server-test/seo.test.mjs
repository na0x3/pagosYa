import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { applySeoDocument, createStorefrontSeo } from '../storefront-seo.mjs';
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
