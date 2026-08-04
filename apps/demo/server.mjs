import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PagosYa } from "@pagosya/sdk-node";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const SECRET_KEY = process.env.PAGOSYA_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("Set PAGOSYA_SECRET_KEY to a sk_test_... key (run `pnpm --filter @pagosya/api run seed`).");
  process.exit(1);
}

const API_BASE_URL = process.env.PAGOSYA_API_BASE_URL ?? "http://localhost:3000/v1";
const CHECKOUT_ORIGIN = process.env.PAGOSYA_CHECKOUT_ORIGIN ?? "http://localhost:5173";
const PORT = process.env.PORT ?? 4321;

const client = new PagosYa(SECRET_KEY, { baseUrl: API_BASE_URL });

function renderPage(clientSecret, checkoutOrigin) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>pagosYa — merchant demo</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 16px; }
  #payment-container { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
  #result { margin-top: 16px; font-weight: 600; }
</style>
</head>
<body>
  <h1>Tienda Demo</h1>
  <p>Pedido #DEMO-1 &mdash; Bs 50.00</p>
  <div id="payment-container"></div>
  <div id="result"></div>
  <script src="/pagosya.js"></script>
  <script>
    const pagosYa = PagosYa('pk_test_demo', { checkoutOrigin: '${checkoutOrigin}' });
    pagosYa.mount('#payment-container', {
      clientSecret: '${clientSecret}',
      onSuccess: () => { document.getElementById('result').textContent = 'Pago exitoso'; },
      onError: (e) => { document.getElementById('result').textContent = 'Error: ' + e.message; },
    });
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/pagosya.js") {
      const js = await readFile(path.join(dirname, "..", "..", "packages", "widget-js", "dist", "pagosya.js"));
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end(js);
      return;
    }

    if (req.url === "/") {
      // Stand-in for the merchant's own backend: create the PaymentIntent
      // server-side with the secret key, hand the browser only client_secret.
      const intent = await client.paymentIntents.create({ amount: 5000, description: "pagosYa demo order" });
      res.writeHead(200, { "content-type": "text/html" });
      res.end(renderPage(intent.clientSecret, CHECKOUT_ORIGIN));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(PORT, () => console.log(`pagosYa merchant demo on http://localhost:${PORT}`));
