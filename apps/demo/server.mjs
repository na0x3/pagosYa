import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PagosYa } from "@pagosya/sdk-node";
import { applySecurityHeaders, hardenHttpServer } from "../../scripts/http-security.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const SECRET_KEY = process.env.PAGOSYA_SECRET_KEY;
if (!SECRET_KEY) {
  console.error("Set PAGOSYA_SECRET_KEY to a sk_test_... key (run `pnpm --filter @pagosya/api run seed`).");
  process.exit(1);
}

const API_BASE_URL = process.env.PAGOSYA_API_BASE_URL ?? "http://localhost:3000/v1";
const CHECKOUT_ORIGIN = process.env.PAGOSYA_CHECKOUT_ORIGIN ?? "http://localhost:5174";
const PORT = process.env.PORT ?? 4321;

const client = new PagosYa(SECRET_KEY, { baseUrl: API_BASE_URL });

function renderPage(clientSecret, checkoutOrigin) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Demostración de un cobro local con pagosYa.">
<title>pagosYa - Demostración de cobro</title>
<style>
  @font-face { font-family: "0xProto Mono"; src: url("/fonts/0xProtoNerdFontMono-Bold.ttf") format("truetype"); font-weight: 700; font-display: swap; }
  :root { color-scheme: dark; --bg:#0a0a0a; --surface:#171717; --surface-soft:#202020; --border:#404040; --text:#f5f5f5; --muted:#a3a3a3; --faint:#8c8c8c; --amber:#ffbd59; --amber-text:#241804; --indigo:#818cf8; --success:#34d399; --error:#f87171; }
  * { box-sizing: border-box; }
  body { min-width:320px; min-height:100dvh; margin:0; background:var(--bg); color:var(--text); font-family:"0xProto Mono",ui-monospace,"SF Mono",Menlo,monospace; -webkit-font-smoothing:antialiased; }
  body::before { content:""; position:fixed; inset:0; z-index:-1; background:radial-gradient(circle at 15% 5%,rgba(255,189,89,.11),transparent 30rem),linear-gradient(rgba(255,189,89,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,189,89,.035) 1px,transparent 1px); background-size:auto,44px 44px,44px 44px; mask-image:linear-gradient(to bottom,#000,transparent 80%); }
  .shell { width:min(1080px,calc(100% - 32px)); margin:0 auto; padding:28px 0 64px; }
  .brand { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:clamp(42px,8vw,86px); }
  .wordmark { font-size:1.05rem; letter-spacing:-.02em; }
  .secure { color:var(--success); font-size:.72rem; }
  .layout { display:grid; grid-template-columns:minmax(0,.82fr) minmax(340px,1.18fr); gap:clamp(24px,5vw,72px); align-items:start; }
  .summary { position:sticky; top:28px; padding-top:8px; }
  .summary h1 { max-width:10ch; margin:0 0 16px; font-size:clamp(2.4rem,6vw,4.8rem); line-height:.96; letter-spacing:-.04em; text-wrap:balance; }
  .summary > p { max-width:48ch; margin:0 0 30px; color:var(--muted); font-size:.84rem; line-height:1.65; }
  .order { display:grid; gap:14px; padding:18px 0; border-top:1px solid var(--border); border-bottom:1px solid var(--border); }
  .order-row { display:flex; justify-content:space-between; gap:20px; color:var(--muted); font-size:.8rem; }
  .order-row strong { color:var(--text); font-variant-numeric:tabular-nums; }
  .payment-shell { padding:12px; border:1px solid var(--border); border-radius:16px; background:color-mix(in srgb,var(--surface) 94%,var(--indigo)); box-shadow:0 28px 80px -50px rgba(0,0,0,.95); }
  .payment-heading { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 8px 16px; }
  .payment-heading h2 { margin:0; font-size:.92rem; }
  .payment-heading span { color:var(--faint); font-size:.68rem; }
  #payment-container { min-height:300px; overflow:hidden; border:1px solid var(--border); border-radius:11px; background:var(--surface); }
  #result { min-height:1.25rem; margin:12px 8px 2px; color:var(--muted); font-size:.78rem; font-weight:700; }
  #result[data-state="success"] { color:var(--success); }
  #result[data-state="error"] { color:var(--error); }
  @media (max-width:760px) { .shell{padding-top:18px}.brand{margin-bottom:42px}.layout{grid-template-columns:1fr}.summary{position:static}.summary h1{font-size:clamp(2.5rem,13vw,4.1rem)}.payment-shell{padding:8px} }
  @media (prefers-reduced-motion:reduce) { *{scroll-behavior:auto!important;transition-duration:.01ms!important} }
</style>
</head>
<body>
  <!-- THESIS: a real local payment should feel precise before it feels technical. OWN-WORLD: pagosYa's dark terminal ledger, amber signal and quiet indigo focus. STORY: verify the order, choose a local payment rail and receive a clear result. FIRST VIEWPORT: order context at left, working checkout at right. FORM: incumbent system refinement for the SDK demo. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md. -->
  <main class="shell">
    <header class="brand"><strong class="wordmark">pagosYa</strong><span class="secure">Cobro protegido</span></header>
    <div class="layout">
      <section class="summary" aria-labelledby="demo-title">
        <h1 id="demo-title">Prueba un cobro local.</h1>
        <p>Esta tienda de demostración crea un intento de pago real en el entorno de pruebas y monta el checkout con el SDK.</p>
        <div class="order" aria-label="Resumen del pedido">
          <div class="order-row"><span>Pedido</span><strong>#DEMO-1</strong></div>
          <div class="order-row"><span>Total</span><strong>Bs 50,00</strong></div>
        </div>
      </section>
      <section class="payment-shell" aria-labelledby="payment-title">
        <div class="payment-heading"><h2 id="payment-title">Completa el pago</h2><span>Entorno de pruebas</span></div>
        <div id="payment-container"></div>
        <div id="result" aria-live="polite"></div>
      </section>
    </div>
  </main>
  <script src="/pagosya.js"></script>
  <script>
    const pagosYa = PagosYa('pk_test_demo', { checkoutOrigin: '${checkoutOrigin}' });
    pagosYa.mount('#payment-container', {
      clientSecret: '${clientSecret}',
      onSuccess: () => { const result = document.getElementById('result'); result.dataset.state = 'success'; result.textContent = 'Pago confirmado'; },
      onError: (e) => { const result = document.getElementById('result'); result.dataset.state = 'error'; result.textContent = 'No pudimos completar el pago: ' + e.message; },
    });
  </script>
</body>
</html>`;
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    if (req.url === "/pagosya.js") {
      const js = await readFile(path.join(dirname, "..", "..", "packages", "widget-js", "dist", "pagosya.js"));
      res.writeHead(200, { "content-type": "application/javascript" });
      res.end(js);
      return;
    }

    if (req.url === "/fonts/0xProtoNerdFontMono-Bold.ttf") {
      const font = await readFile(path.join(dirname, "..", "merchant-dashboard", "fonts", "0xProtoNerdFontMono-Bold.ttf"));
      res.writeHead(200, { "content-type": "font/ttf", "cache-control": "public, max-age=31536000, immutable" });
      res.end(font);
      return;
    }

    if (req.url === "/") {
      // Stand-in for the merchant's own backend: create the PaymentIntent
      // server-side with the secret key, hand the browser only client_secret.
      const intent = await client.paymentIntents.create({ amount: 5000, description: "pagosYa demo order" });
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end(renderPage(intent.clientSecret, CHECKOUT_ORIGIN));
      return;
    }

    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    console.error("Demo request failed", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("internal server error");
  }
});
hardenHttpServer(server);

server.listen(PORT, () => console.log(`pagosYa merchant demo on http://localhost:${PORT}`));
