/// <reference lib="dom" />
import { chromium } from 'playwright';
import type { SourceProjectSnapshot } from './source-project';

export type VisualCapture = { viewport: 'desktop' | 'mobile'; width: number; height: number; y: number; pageHeight: number; image: string };
const origin = 'https://preview.invalid';
const mime: Record<string, string> = { mp4: 'video/mp4', html: 'text/html', css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif', woff2: 'font/woff2', ttf: 'font/ttf' };

/** Render only owned snapshot bytes in an ephemeral sandbox. Never visit merchant URLs. */
export async function captureSourceVisuals(snapshot: SourceProjectSnapshot, entry: string): Promise<VisualCapture[]> {
  const files = new Map(snapshot.files.map(f => [f.path, f]));
  if (!entry.endsWith('.html') || !files.has(entry)) throw new Error('La página seleccionada no existe en esta revisión.');
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 15000 });
  const deadline = setTimeout(() => { void browser.close(); }, 45000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce' });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      let path = ''; try { path = decodeURIComponent(url.pathname.slice(1)); } catch {}
      const file = url.origin === origin && request.method() === 'GET' && !url.search ? files.get(path) : undefined;
      if (!file || !['document', 'stylesheet', 'script', 'image', 'font', 'media'].includes(request.resourceType())) return route.abort();
      // Even local documents cannot escape to APIs, workers, frames, forms or sockets.
      const csp = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; media-src 'self' data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      await route.fulfill({ body: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'), contentType: mime[path.split('.').at(-1)!] || 'application/octet-stream', headers: { 'Content-Security-Policy': csp, 'Cache-Control': 'no-store' } });
    });
    await context.addInitScript(() => {
      (window as any).PAGOSYA_PREVIEW = true;
      (window as any).PAGOSYA_HOSTED = false;
      window.open = () => null;
    });
    const captures: VisualCapture[] = [];
    for (const [viewport, width] of [['desktop', 1280], ['mobile', 390]] as const) {
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: 844 });
      page.setDefaultTimeout(7000);
      await page.goto(`${origin}/${entry}`, { waitUntil: 'load', timeout: 12000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      // Each screenshot remains readable; explicitly disclose gaps on long pages.
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      const positions = [...new Set([0, Math.max(0, Math.round((pageHeight - 844) / 2)), Math.max(0, pageHeight - 844)])];
      for (const y of positions) {
        await page.evaluate(offset => window.scrollTo(0, offset), y);
        await page.evaluate(async () => { await Promise.all(Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(i => i.decode().catch(() => {}))); });
        const image = await page.screenshot({ type: 'jpeg', quality: 75, animations: 'disabled', timeout: 7000 });
        captures.push({ viewport, width, height: 844, y, pageHeight, image: `data:image/jpeg;base64,${image.toString('base64')}` });
      }
      await page.close();
    }
    return captures;
  } finally { clearTimeout(deadline); await browser.close(); }
}
