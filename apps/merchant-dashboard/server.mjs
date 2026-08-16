import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 4323;
const mascotAssets = new Map([
  ["/assets/yapi-idle.png", "yapi-idle.png"],
  ["/assets/yapi-wave.png", "yapi-wave.png"],
  ["/assets/yapi-walk-a.png", "yapi-walk-a.png"],
  ["/assets/yapi-walk-b.png", "yapi-walk-b.png"],
]);
const sharedAssets = new Map([
  ["/assets/logo.png", path.join(dirname, "..", "..", "assets", "brand", "logo.png")],
]);

const server = createServer(async (req, res) => {
  try {
    if (req.url === "/" || req.url === "/index.html") {
      const html = await readFile(path.join(dirname, "index.html"));
      res.writeHead(200, { "content-type": "text/html" });
      res.end(html);
      return;
    }
    if (req.url === "/fonts/0xProtoNerdFontMono-Bold.ttf") {
      const font = await readFile(path.join(dirname, "fonts/0xProtoNerdFontMono-Bold.ttf"));
      res.writeHead(200, { "content-type": "font/ttf" });
      res.end(font);
      return;
    }
    if (mascotAssets.has(req.url)) {
      const image = await readFile(path.join(dirname, "assets", mascotAssets.get(req.url)));
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      res.end(image);
      return;
    }
    if (sharedAssets.has(req.url)) {
      const image = await readFile(sharedAssets.get(req.url));
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      res.end(image);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(PORT, () => console.log(`pagosYa merchant dashboard on http://localhost:${PORT}`));
