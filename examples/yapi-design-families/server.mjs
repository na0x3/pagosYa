import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { dist } from './build.mjs';

export function createGalleryServer() {
  const encoded = new Map();
  return createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = resolve(dist, '.' + path);
      if (file !== dist && !file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ttf': 'font/ttf' }[extname(file)] || 'application/octet-stream';
      const acceptsBrotli = /\bbr\b/.test(request.headers['accept-encoding'] || '') && /\.(?:html|js|css|ttf)$/.test(file);
      let bytes;
      if (acceptsBrotli) {
        const version = (await stat(file)).mtimeMs;
        const cached = encoded.get(file);
        if (cached?.version === version) bytes = cached.bytes;
        else { bytes = brotliCompressSync(await readFile(file), { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }); encoded.set(file, { version, bytes }); }
      } else bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-store', Vary: 'Accept-Encoding', ...(acceptsBrotli ? { 'Content-Encoding': 'br' } : {}) }); response.end(bytes);
    } catch { response.writeHead(404).end('Not found'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4328);
  createGalleryServer().listen(port, '127.0.0.1', () => console.log(`YAPI designs: http://127.0.0.1:${port}`));
}
