import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applySecurityHeaders, hardenHttpServer } from "../../scripts/http-security.mjs";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dirname, "dist");
const port = Number(process.env.PORT ?? 5174);
const host = process.env.HOST ?? "127.0.0.1";
const consumerAppOrigin = process.env.CONSUMER_DASHBOARD_ORIGIN ?? "http://localhost:4324";
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
]);

function responsePath(pathname) {
  if (pathname === "/" || pathname === "/index.html" || /^\/track\/[^/]+\/?$/.test(pathname) || /^\/p\/[^/]+\/?$/.test(pathname) || /^\/s\/[^/]+(?:\/p\/[^/]+)?\/?$/.test(pathname)) {
    return path.join(distDir, "index.html");
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(distDir, `.${decoded}`);
  return candidate.startsWith(`${distDir}${path.sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  // Delivery checkout may request location only after the buyer presses the
  // explicit consent button. Every other browser capability remains denied.
  applySecurityHeaders(response, { allowEmbedding: true, allowGeolocation: true });
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (url.pathname === "/stores" || url.pathname === "/stores/" || url.pathname === "/stores/index.html") {
    const destination = new URL(consumerAppOrigin);
    destination.search = url.search;
    response.writeHead(302, { location: destination.toString(), "cache-control": "no-cache" });
    return response.end();
  }
  const filePath = responsePath(url.pathname);
  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    return response.end("not found");
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
    const cache = filePath.endsWith(".html") ? "no-store" : "public, max-age=31536000, immutable";
    response.writeHead(200, {
      "content-type": mimeTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream",
      "cache-control": cache,
    });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
  }
});
hardenHttpServer(server);

server.listen(port, host, () => console.log(`pagosYa storefront app on http://${host}:${port}`));
