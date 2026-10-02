/// <reference lib="dom" />
import { chromium } from 'playwright';
import { publicBrandUrl } from '../brand/brand-import';
import { readSourceReferenceResource, type SourceReferenceResourceKind } from './source-website-fetch';

export type SourceReferenceCapture = { url: string; viewport: 'desktop' | 'mobile'; width: number; height: number; y: number; pageHeight: number; missingImages: number; image: string };
export type SourceRenderedReference = { status: 'captured' | 'unavailable'; captures: SourceReferenceCapture[]; limitations: string[] };
const LIMITS = { requests: 256, concurrent: 6, bytes: 12_000_000, imageBytes: 250_000, timeMs: 25_000 };
export const SOURCE_REFERENCE_CSP = "default-src 'none'; script-src https: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; sandbox allow-scripts allow-same-origin";

/** Only initial document and public, render-critical GETs. Every request is fulfilled by
 * the DNS-pinned Node fetcher; Chromium never opens the remote network connection. */
export function sourceReferenceRequestKind(method: string, type: string, url: string, initialUrl: string, mainFrame: boolean): SourceReferenceResourceKind | null {
  if (method !== 'GET') return null;
  try { publicBrandUrl(url); } catch { return null; }
  if (type === 'document') return mainFrame && url === initialUrl ? 'html' : null;
  return ({ stylesheet: 'css', script: 'script', image: 'image', font: 'font' } as Record<string, SourceReferenceResourceKind>)[type] || null;
}

/** Ephemeral browser profile, no credentials, blocked direct transport, finite static
 * scroll observations. A screenshot is evidence of these states, never of animations. */
export async function captureSourceReference(raw: string): Promise<SourceRenderedReference> {
  if (process.env.SOURCE_REFERENCE_CAPTURE === 'false') return { status: 'unavailable', captures: [], limitations: ['Rendered reference capture is disabled.'] };
  const captures: SourceReferenceCapture[] = [];
  const limitations = ['Only top and y=844 desktop/mobile states were captured; intervening content and motion were not verified.', 'Forms, APIs, video, frames, workers, downloads, cookies and browser network access are blocked; dynamic content may differ.'];
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); void browser?.close(); }, LIMITS.timeMs);
  let requests = 0, active = 0, bytes = 0, blocked = 0;
  const waiting: Array<{ resolve: () => void; priority: number }> = [];
  const resources = new Map<string, ReturnType<typeof readSourceReferenceResource>>();
  const resourceFor = (url: string, kind: SourceReferenceResourceKind) => {
    const key = `${kind}:${url}`;
    const cached = resources.get(key);
    if (cached) return cached;
    const pending = (async () => {
      if (++requests > LIMITS.requests) throw new Error('Reference request budget exceeded');
      if (active < LIMITS.concurrent) active++;
      else await new Promise<void>(resolve => {
        waiting.push({ resolve, priority: kind === 'image' ? 1 : 0 });
        waiting.sort((a, b) => a.priority - b.priority);
      });
      try {
        controller.signal.throwIfAborted();
        const resourceSignal = kind === 'html' ? controller.signal : AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]);
        return await readSourceReferenceResource(url, kind, resourceSignal, count => {
          bytes += count;
          if (bytes > LIMITS.bytes) { controller.abort(); throw new Error('Reference byte budget exceeded'); }
        });
      } finally {
        const next = waiting.shift();
        if (next) next.resolve(); else active--;
      }
    })();
    resources.set(key, pending);
    return pending;
  };
  try {
    const initialUrl = publicBrandUrl(raw).href;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10_000,
      // Route fulfillment bypasses this deliberately unreachable proxy. Anything missed
      // by routing still cannot reach the network; WebRTC direct UDP is disabled too.
      proxy: { server: 'http://127.0.0.1:9' },
      args: ['--js-flags=--max-old-space-size=128', '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
      env: { PATH: process.env.PATH || '/usr/bin:/bin', ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) },
    });
    controller.signal.throwIfAborted();
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce', permissions: [], offline: true });
    await context.routeWebSocket('**/*', socket => socket.close());
    await context.route('**/*', async route => {
      const request = route.request();
      const kind = sourceReferenceRequestKind(request.method(), request.resourceType(), request.url(), initialUrl, request.frame() === request.frame().page().mainFrame());
      if (!kind || controller.signal.aborted) { blocked++; await route.abort().catch(() => {}); return; }
      try {
        const resource = await resourceFor(request.url(), kind);
        await route.fulfill({ body: resource.body, contentType: resource.contentType, headers: { 'Content-Security-Policy': SOURCE_REFERENCE_CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      } catch { blocked++; await route.abort().catch(() => {}); }
    });
    for (const [viewport, width] of [['desktop', 1280], ['mobile', 390]] as const) {
      controller.signal.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      page.on('popup', popup => { void popup.close(); });
      await page.setViewportSize({ width, height: 844 });
      const response = await page.goto(initialUrl, { waitUntil: 'commit', timeout: 9000 });
      if (!response?.ok()) throw new Error('Reference page did not load');
      await page.waitForSelector('body', { state: 'attached', timeout: 10000 });
      // Do not wait for every third-party script to finish: many commerce pages
      // keep loading analytics indefinitely. Wait a bounded interval for visible media.
      await page.evaluate(async () => {
        await Promise.race([
          Promise.all([document.fonts.ready, ...Array.from(document.images).filter(image => image.getBoundingClientRect().top < innerHeight).map(image => image.decode().catch(() => {}))]),
          new Promise(resolve => setTimeout(resolve, 1500)),
        ]);
      });
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      for (const requestedY of [...new Set([0, Math.min(844, Math.max(0, pageHeight - 844))])]) {
        controller.signal.throwIfAborted();
        await page.evaluate(y => window.scrollTo(0, y), requestedY);
        const image = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled', timeout: 4000 });
        const { usable, ...metadata } = await page.evaluate(() => ({
          usable: Array.from(document.querySelectorAll('h1,h2,img')).some(element => {
            const r = element.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0
              && element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
              && (element instanceof HTMLImageElement ? r.width >= 80 && r.height >= 80 && element.complete && element.naturalWidth > 0 : Boolean(element.textContent?.trim()));
          }),
          y: Math.round(scrollY), missingImages: Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && r.width > 0 && i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && (!i.complete || !i.naturalWidth); }).length }));
        if (metadata.missingImages > 0) { limitations.push(`${viewport} y=${requestedY}: ${metadata.missingImages} visible images unavailable; omitted incomplete capture.`); continue; }
        if (usable === false) { limitations.push(`${viewport} y=${requestedY}: no readable heading or loaded main image; omitted incomplete capture.`); continue; }
        if (image.length > LIMITS.imageBytes) throw new Error('Reference screenshot size exceeded');
        captures.push({ url: initialUrl, viewport, width, height: 844, pageHeight, ...metadata, image: `data:image/jpeg;base64,${image.toString('base64')}` });
      }
      await page.close();
    }
  } catch (error) { limitations.push(`Capture did not finish (${error instanceof Error ? error.message.split('\n')[0].slice(0, 160) : 'unavailable'}); only attached successful screenshots are observed evidence.`); }
  finally { clearTimeout(timer); controller.abort(); await browser?.close().catch(() => {}); }
  if (blocked) limitations.push(`${blocked} resource requests were blocked or unavailable.`);
  return { status: captures.length ? 'captured' : 'unavailable', captures, limitations };
}
