import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, hardenHttpServer } from "../../scripts/http-security.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 4323;
// Full-page live reload is opt-in. Native file pickers and browser-control
// helpers can touch local files while a merchant is choosing imagery; treating
// those filesystem events as source edits refreshes the document and destroys
// in-progress forms. The dashboard already updates previews in place.
const liveReloadEnabled = process.env.DASHBOARD_LIVE_RELOAD === "1";
const liveReloadVersion = `${process.pid}-${Date.now()}`;
const liveReloadClients = new Set();
const mascotAssets = new Map([
  ["/assets/yapi-idle.png", "yapi-idle.png"],
  ["/assets/yapi-fly.png", "yapi-fly.png"],
  ["/assets/yapi-wave.png", "yapi-wave.png"],
  ["/assets/yapi-walk-a.png", "yapi-walk-a.png"],
  ["/assets/yapi-walk-b.png", "yapi-walk-b.png"],
]);
const sharedAssets = new Map([
  ["/assets/logo.png", path.join(dirname, "..", "..", "assets", "brand", "logo.png")],
  ["/assets/adventure-guide.png", path.join(dirname, "..", "..", "assets", "brand", "Untitled design.png")],
  ["/assets/gamification-1.png", path.join(dirname, "..", "..", "assets", "gamification", "1.png")],
  ["/assets/gamification-2.png", path.join(dirname, "..", "..", "assets", "gamification", "2.png")],
  ["/assets/gamification-3.png", path.join(dirname, "..", "..", "assets", "gamification", "3.png")],
  ["/assets/gamification-4.png", path.join(dirname, "..", "..", "assets", "gamification", "4.png")],
  ["/assets/profile-1.png", path.join(dirname, "..", "..", "assets", "profile-pictures", "1.png")],
  ["/assets/profile-2.png", path.join(dirname, "..", "..", "assets", "profile-pictures", "2.png")],
  ["/assets/profile-3.png", path.join(dirname, "..", "..", "assets", "profile-pictures", "3.png")],
  ["/assets/profile-4.png", path.join(dirname, "..", "..", "assets", "profile-pictures", "4.png")],
]);

function injectLiveReload(html) {
  if (!liveReloadEnabled) return html;
  const script = `<script data-dashboard-live-reload>
  (() => {
    const version = ${JSON.stringify(liveReloadVersion)};
    const events = new EventSource("/__live_reload?version=" + encodeURIComponent(version));
    events.addEventListener("reload", () => window.location.reload());
  })();
</script>`;
  return html.replace("</body>", `${script}\n</body>`);
}

function broadcastReload() {
  for (const response of liveReloadClients) {
    response.write("event: reload\ndata: changed\n\n");
  }
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(broadcastReload, 80);
}

function isDashboardSourceFile(filename) {
  const normalized = String(filename || "").split(path.sep).join("/");
  return normalized === "index.html" || normalized.startsWith("assets/") || normalized.startsWith("fonts/");
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  try {
    const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (requestUrl.pathname === "/__live_reload" && liveReloadEnabled) {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
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
    if (requestUrl.pathname === "/journey.css") {
      const css = await readFile(path.join(dirname, "journey.css"), "utf8");
      res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": liveReloadEnabled ? "no-cache" : "public, max-age=3600" });
      res.end(css);
      return;
    }
    if (mascotAssets.has(requestUrl.pathname)) {
      const image = await readFile(path.join(dirname, "assets", mascotAssets.get(requestUrl.pathname)));
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": liveReloadEnabled ? "no-cache" : "public, max-age=86400",
      });
      res.end(image);
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
    console.error("Merchant dashboard request failed", err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("internal server error");
  }
});
hardenHttpServer(server);

if (liveReloadEnabled) {
  watch(dirname, { recursive: true }, (_event, filename) => {
    // Browser-control helpers, Playwright results, uploads, and other runtime
    // artifacts can live below this directory. Reload only for files that the
    // dashboard actually serves, otherwise opening a file picker can restart
    // the whole page and discard the merchant's in-progress AI setup.
    if (!isDashboardSourceFile(filename)) return;
    scheduleReload();
  });
  for (const assetPath of sharedAssets.values()) {
    watch(assetPath, scheduleReload);
  }
}

server.listen(PORT, () => {
  console.log(`pagosYa merchant dashboard on http://localhost:${PORT}`);
  if (liveReloadEnabled) console.log("Live reload enabled — press Ctrl+C to stop");
});
