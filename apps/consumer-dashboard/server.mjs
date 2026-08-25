import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, hardenHttpServer } from "../../scripts/http-security.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 4324;
const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001/v1";
const checkoutOrigin = process.env.CHECKOUT_ORIGIN ?? "http://localhost:5175";
const liveReloadEnabled = process.env.CONSUMER_LIVE_RELOAD !== "0";
const version = `${process.pid}-${Date.now()}`;
const clients = new Set();

function prepareHtml(html) {
  const config = `<script>window.__PAGOSYA_CONSUMER_CONFIG__=${JSON.stringify({ apiBaseUrl, checkoutOrigin })}</script>`;
  const reload = liveReloadEnabled ? `<script>(()=>{const e=new EventSource('/__live_reload?version=${version}');e.addEventListener('reload',()=>location.reload())})()</script>` : "";
  return html.replace("</head>", `${config}\n</head>`).replace("</body>", `${reload}\n</body>`);
}

function send(res, status, type, body, cache = "no-cache") {
  res.writeHead(status, { "content-type": type, "cache-control": cache });
  res.end(body);
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/__live_reload" && liveReloadEnabled) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
      if (url.searchParams.get("version") !== version) return res.end("event: reload\ndata: restarted\n\n");
      res.write(": connected\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return send(res, 200, "text/html; charset=utf-8", prepareHtml(await readFile(path.join(dirname, "index.html"), "utf8")), "no-store");
    }
    if (url.pathname === "/assets/logo.png") {
      return send(res, 200, "image/png", await readFile(path.join(dirname, "..", "..", "assets", "brand", "logo.png")), "public, max-age=86400");
    }
    if (["/assets/icon-192.png", "/assets/icon-512.png", "/assets/icon-maskable-512.png"].includes(url.pathname)) {
      return send(res, 200, "image/png", await readFile(path.join(dirname, "assets", path.basename(url.pathname))), "public, max-age=31536000, immutable");
    }
    if (url.pathname === "/assets/tiendas-logo.png") {
      return send(res, 200, "image/png", await readFile(path.join(dirname, "..", "..", "assets", "brand", "logo.png")), "public, max-age=86400");
    }
    if (url.pathname === "/assets/tiendas-banner.png") {
      return send(res, 200, "image/png", await readFile(path.join(dirname, "..", "..", "assets", "brand", "Banner Web Nuevo Álbum Musical Artista Fotográfico Rosa copy.png")), "public, max-age=86400");
    }
    if (url.pathname === "/assets/2.png") {
      return send(res, 200, "image/png", await readFile(path.join(dirname, "..", "..", "assets", "brand", "2.png")), "public, max-age=86400");
    }
    if (url.pathname === "/manifest.webmanifest") {
      return send(res, 200, "application/manifest+json; charset=utf-8", await readFile(path.join(dirname, "manifest.webmanifest"), "utf8"), "public, max-age=3600");
    }
    if (url.pathname === "/sw.js") {
      return send(res, 200, "application/javascript; charset=utf-8", await readFile(path.join(dirname, "sw.js"), "utf8"), "no-cache");
    }
    if (url.pathname === "/fonts/0xProtoNerdFontMono-Bold.ttf") {
      return send(res, 200, "font/ttf", await readFile(path.join(dirname, "..", "merchant-dashboard", "fonts", "0xProtoNerdFontMono-Bold.ttf")), "public, max-age=86400");
    }
    send(res, 404, "text/plain; charset=utf-8", "not found");
  } catch (error) {
    console.error("Consumer dashboard request failed", error);
    send(res, 500, "text/plain; charset=utf-8", "internal server error", "no-store");
  }
});
hardenHttpServer(server);

if (liveReloadEnabled) {
  let timer;
  watch(dirname, { recursive: true }, (_event, filename) => {
    if (!filename || filename === "server.mjs") return;
    clearTimeout(timer);
    timer = setTimeout(() => clients.forEach((client) => client.write("event: reload\ndata: changed\n\n")), 80);
  });
}

server.listen(PORT, "127.0.0.1", () => console.log(`pagosYa consumer panel on http://localhost:${PORT}`));
