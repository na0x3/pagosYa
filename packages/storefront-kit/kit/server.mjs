import { createServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { dirname, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const base = await stat(resolve(root, "dist/index.html")).then(() => resolve(root, "dist")).catch(() => root);
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
    res.writeHead(200, { "Content-Type": mime[extname(file)], "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-cache", ...((relative === "checkout.html" || ["recover", "comeback", "unsubscribe", "client_secret", "preview", "source_owner"].some(key => url.searchParams.has(key))) ? { "X-Robots-Tag": "noindex, nofollow" } : {}) });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch { res.writeHead(404).end("Not found"); }
});
server.listen(Number(process.env.PORT || 4315), process.env.HOST || "127.0.0.1", () => console.log(`Storefront: http://${process.env.HOST || "127.0.0.1"}:${server.address().port}`));
