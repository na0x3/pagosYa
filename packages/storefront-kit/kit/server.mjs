import { createServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const base = await stat(resolve(root, "dist/index.html")).then(() => resolve(root, "dist")).catch(() => root);
// Exported designs run in this origin, so the server supplies the boundary the hosted sandbox used to:
// the page may only talk to itself, the pagosYa API and checkout configured in config.js, and map embeds.
const origins = await readFile(resolve(base, "config.js"), "utf8").then(text => {
  const config = JSON.parse(text.match(/window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)?.[1] || "{}");
  return [config.apiBaseUrl, config.checkoutOrigin].flatMap(value => { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? [url.origin] : []; } catch { return []; } });
}).catch(() => []);
const platform = [...new Set(origins)].join(" ");
const maps = "https://www.google.com https://maps.google.com https://www.openstreetmap.org";
const securityHeaders = {
  "Content-Security-Policy": `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${platform} https://*.tile.openstreetmap.org; font-src 'self' data:; media-src 'self' blob: ${platform}; connect-src 'self' ${platform}; frame-src ${platform} ${maps}; form-action 'self' ${platform}; base-uri 'none'; object-src 'none'; frame-ancestors 'self'`.replace(/\s+/g, " "),
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  ...(process.env.NODE_ENV === "production" ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
};
const mime = { ".mp4": "video/mp4", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".ico": "image/x-icon", ".avif": "image/avif" };
const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) { res.writeHead(405).end(); return; }
    const url = new URL(req.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + sep) || relative.split("/").some((p) => p.startsWith(".")) || !mime[extname(file)] || ["package.json", "pagosya-project.json"].includes(relative)) { res.writeHead(404).end(); return; }
    if (!(await realpath(file)).startsWith(base + sep)) { res.writeHead(404).end(); return; }
    const bytes = await readFile(file);
    res.writeHead(200, { ...(extname(file) === ".html" ? securityHeaders : {}), "Content-Type": mime[extname(file)], "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-cache", ...((relative === "checkout.html" || ["recover", "comeback", "unsubscribe", "client_secret", "preview", "source_owner"].some(key => url.searchParams.has(key))) ? { "X-Robots-Tag": "noindex, nofollow" } : {}) });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch { res.writeHead(404).end("Not found"); }
});
server.listen(Number(process.env.PORT || 4315), process.env.HOST || "127.0.0.1", () => console.log(`Storefront: http://${process.env.HOST || "127.0.0.1"}:${server.address().port}`));
