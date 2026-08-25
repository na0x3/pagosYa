import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, hardenHttpServer } from "../../scripts/http-security.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 4322;
const liveReloadEnabled = process.env.OPS_LIVE_RELOAD !== "0";
const liveReloadVersion = `${process.pid}-${Date.now()}`;
const liveReloadClients = new Set();
const sharedAssets = new Map([
  ["/assets/logo.png", path.join(dirname, "..", "..", "assets", "brand", "logo.png")],
]);

function injectLiveReload(html) {
  if (!liveReloadEnabled) return html;
  const script = `<script data-ops-live-reload>
  (() => {
    const events = new EventSource("/__live_reload?version=${encodeURIComponent(liveReloadVersion)}");
    events.addEventListener("reload", () => window.location.reload());
  })();
</script>`;
  return html.replace("</body>", `${script}\n</body>`);
}

function broadcastReload() {
  for (const response of liveReloadClients) response.write("event: reload\ndata: changed\n\n");
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(broadcastReload, 80);
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (requestUrl.pathname === "/__live_reload" && liveReloadEnabled) {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
      if (requestUrl.searchParams.get("version") !== liveReloadVersion) {
        res.end("event: reload\ndata: server-restarted\n\n");
        return;
      }
      res.write(": connected\n\n");
      liveReloadClients.add(res);
      req.on("close", () => liveReloadClients.delete(res));
      return;
    }
    if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
      const html = await readFile(path.join(dirname, "index.html"), "utf8");
      res.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
      res.end(injectLiveReload(html));
      return;
    }
    if (requestUrl.pathname === "/fonts/0xProtoNerdFontMono-Bold.ttf") {
      const font = await readFile(path.join(dirname, "fonts/0xProtoNerdFontMono-Bold.ttf"));
      res.writeHead(200, { "content-type": "font/ttf" });
      res.end(font);
      return;
    }
    if (sharedAssets.has(requestUrl.pathname)) {
      const image = await readFile(sharedAssets.get(requestUrl.pathname));
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": liveReloadEnabled ? "no-cache" : "public, max-age=86400",
      });
      res.end(image);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    console.error("Ops console request failed", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("internal server error");
  }
});
hardenHttpServer(server);

if (liveReloadEnabled) {
  watch(dirname, { recursive: true }, (_event, filename) => {
    if (!filename || filename === "server.mjs" || filename.includes("node_modules")) return;
    scheduleReload();
  });
  for (const assetPath of sharedAssets.values()) watch(assetPath, scheduleReload);
}

server.listen(PORT, () => {
  console.log(`pagosYa ops console on http://localhost:${PORT}`);
  if (liveReloadEnabled) console.log("Live reload enabled — press Ctrl+C to stop");
});
