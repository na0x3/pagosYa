import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? 4322;

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
    res.writeHead(404);
    res.end("not found");
  } catch (err) {
    res.writeHead(500);
    res.end(String(err));
  }
});

server.listen(PORT, () => console.log(`pagosYa ops console on http://localhost:${PORT}`));
