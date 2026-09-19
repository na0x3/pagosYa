/** Shared server renderer for Vite development and the production checkout server. */
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const privateKeys = ['client_secret', 'publishable_key', 'recover', 'comeback', 'unsubscribe', 'source_owner', 'source_payment_preview', 'preview', 'source_preview'];
export function applySeoDocument(html, document, noindex = false) {
  html = html.replace(/<title\b[^>]*>[^]*?<\/title>/gi, '').replace(/<meta\b[^>]*(?:name=["'](?:description|robots|twitter:[^"']+)["']|property=["']og:[^"']+["'])[^>]*>/gi, '').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '');
  const head = noindex ? document.head.replace(/content="index, follow, max-image-preview:large"/, 'content="noindex, nofollow"') : document.head;
  return html.replace('</head>', () => `${head}</head>`).replace(/(<div\s+id="app"[^>]*>)[^]*?(<\/div>)/, (_match, open, close) => open + document.body + close);
}
export function createStorefrontSeo({ apiBase, checkoutOrigin, template }) {
  const api = apiBase.replace(/\/$/, '');
  const cache = new Map();
  const inFlight = new Map();
  function remember(key, entry) {
    cache.delete(key);
    cache.set(key, entry);
    if (cache.size > 500) cache.delete(cache.keys().next().value);
  }
  async function get(path, format = 'json', ttl = 30_000) {
    const key = `${format}:${path}`;
    const cached = cache.get(key);
    if (cached) {
      remember(key, cached);
      if (cached.expiresAt > Date.now()) return cached.payload;
    }
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      // Only server-generated headers go upstream; never forward visitor headers.
      const response = await fetch(`${api}${path}`, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429 && cached) return cached.payload;
        // A revoked/missing resource must not reappear from stale cache later.
        cache.delete(key);
        const error = new Error('Tienda no disponible'); error.status = response.status; throw error;
      }
      // Share the consumed payload, not a Response whose body can only be read once.
      const payload = format === 'json' ? await response.json() : await response.text();
      remember(key, { payload, expiresAt: Date.now() + ttl });
      return payload;
    })();
    inFlight.set(key, pending);
    try { return await pending; }
    finally { inFlight.delete(key); }
  }
  return async (request, response, next) => {
    if (!['GET', 'HEAD'].includes(request.method || 'GET')) return next();
    let url;
    try { url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`); } catch { return next(); }
    const route = /^\/s\/([^/]+)(?:\/p\/([^/]+)|\/(sitemap\.xml|llms\.txt)|\/(productos)|\/c\/([^/]+))?\/?$/.exec(url.pathname);
    const rootAsset = /^\/(robots\.txt|sitemap\.xml|llms\.txt)$/.exec(url.pathname)?.[1];
    let slug, productId = route?.[2], asset = route?.[3] || rootAsset, productosRoute = route?.[4] === 'productos', collectionSlug = route?.[5];
    try { slug = route ? decodeURIComponent(route[1]) : undefined; } catch { response.writeHead(400); return response.end('Invalid URL'); }
    const configuredHost = new URL(checkoutOrigin).hostname;
    const customHost = url.hostname !== configuredHost && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    // Custom domains carry no /s/<slug> prefix, so /productos and /c/<x> are matched again here,
    // bare — same page/collection params as the /s/ forms above, just resolved off this host.
    const customHostRoute = customHost ? /^\/(?:p\/([^/]+)|(productos)|c\/([^/]+))?\/?$/.exec(url.pathname) : null;
    if (!route && !rootAsset && !customHostRoute) return next();
    const send = (status, type, body, headers = {}) => { response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...headers }); response.end(request.method === 'HEAD' ? undefined : body); };
    try {
      if (customHost) {
        const domain = await get(`/stores/public/domain?hostname=${encodeURIComponent(url.hostname)}`, 'json', 300_000);
        if (slug && slug !== domain.slug) return send(404, 'text/plain; charset=utf-8', 'Not found');
        slug = domain.slug;
        productId ||= customHostRoute?.[1];
        productosRoute ||= customHostRoute?.[2] === 'productos';
        collectionSlug ??= customHostRoute?.[3];
      }
      if (asset === 'robots.txt') {
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        const origin = customHost ? `https://${url.hostname}` : local ? url.origin : checkoutOrigin.replace(/\/$/, '');
        return send(200, 'text/plain; charset=utf-8', `User-agent: *\nAllow: /\nDisallow: /track/\nDisallow: /studio/\nDisallow: /api/\nDisallow: /*?*client_secret=\nDisallow: /*?*recover=\nDisallow: /*?*comeback=\nDisallow: /*?*unsubscribe=\nDisallow: /*?*source_owner=\n\nSitemap: ${origin}/sitemap.xml\n`);
      }
      if (asset && slug) {
        const part = asset === 'sitemap.xml' && url.searchParams.has('part') ? `?part=${encodeURIComponent(url.searchParams.get('part'))}` : '';
        const result = await get(`/stores/public/${encodeURIComponent(slug)}/seo/${asset}${part}`, 'text');
        return send(200, asset.endsWith('.xml') ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8', result);
      }
      if (rootAsset) {
        const stores = await get('/store-discovery');
        return rootAsset === 'sitemap.xml' ? send(200, 'application/xml; charset=utf-8', `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${stores.map(s => `<sitemap><loc>${escape(s.sitemap)}</loc></sitemap>`).join('')}</sitemapindex>`)
          : send(200, 'text/plain; charset=utf-8', `# Tiendas pagosYa\n\n## Tiendas públicas\n\n${stores.map(s => `- [${s.name.replace(/[\r\n\[\]<>]/g, ' ')}](${s.home}/llms.txt)`).join('\n')}\n`);
      }
      const params = new URLSearchParams();
      if (productId) params.set('productId', decodeURIComponent(productId));
      if (productosRoute) params.set('page', 'productos.html');
      if (collectionSlug !== undefined) { params.set('page', 'coleccion.html'); params.set('collection', decodeURIComponent(collectionSlug)); }
      if (url.searchParams.has('source_page')) params.set('page', url.searchParams.get('source_page'));
      const document = await get(`/stores/public/${encodeURIComponent(slug)}/seo?${params}`);
      const noindex = document.noindex === true || privateKeys.some(key => url.searchParams.has(key));
      // Identical initial HTML for people and crawlers; authored JS remains sandboxed.
      return send(200, 'text/html; charset=utf-8', applySeoDocument(await template(url.pathname + url.search), document, noindex), { 'X-Robots-Tag': noindex ? 'noindex, nofollow' : 'index, follow' });
    } catch (error) {
      const status = error.status === 404 ? 404 : 503;
      return send(status, 'text/html; charset=utf-8', `<!doctype html><html lang="es"><head><meta name="robots" content="noindex"><title>${status === 404 ? 'Tienda o página no disponible' : 'La tienda volverá en un momento'}</title></head><body><h1>${status === 404 ? 'Esta página no está disponible.' : 'No pudimos cargar la tienda. Vuelve a intentarlo en un momento.'}</h1></body></html>`, { 'X-Robots-Tag': 'noindex', ...(status === 503 ? { 'Retry-After': '60' } : {}) });
    }
  };
}
