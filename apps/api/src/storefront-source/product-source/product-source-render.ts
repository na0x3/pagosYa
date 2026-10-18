/// <reference lib="dom" />
/** Tier 2 of the product-link reader (spec 2026-10-18, decision 1): the page rendered in the same guarded browser as the website
 *  reference capture, returning its HTML. Every request still goes through the DNS-pinned Node fetcher, and Chromium never opens a
 *  connection; unlike the capture, GET data requests (fetch/XHR) are answered too, because many shops load the product by script
 *  (spike 2026-10-18: AliExpress filled its JSON-LD only after its scripts ran). */
import { chromium } from 'playwright';
import { publicBrandUrl } from '../../brand/brand-import';
import { readSourceReferenceResource, type SourceReferenceResourceKind } from '../source-website-fetch';
import { sourceReferenceRequestKind } from '../source-reference-capture';

export const PRODUCT_SOURCE_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const LIMITS = { requests: 300, concurrent: 6, bytes: 16_000_000, timeMs: 30_000, settleMs: 4_000 };
const CSP = "default-src 'none'; script-src https: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:; media-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";

/** The capture's request rules, plus same-page data GETs. */
export function productRenderRequestKind(method: string, type: string, url: string, initialUrl: string, mainFrame: boolean): SourceReferenceResourceKind | null {
  if (method === 'GET' && (type === 'fetch' || type === 'xhr')) {
    try { publicBrandUrl(url); return 'data'; } catch { return null; }
  }
  return sourceReferenceRequestKind(method, type, url, initialUrl, mainFrame);
}

/** The rendered page's HTML and final address, or null when it did not load. */
export async function renderProductPage(raw: string): Promise<{ url: string; html: string; status: number } | null> {
  if (process.env.SOURCE_REFERENCE_CAPTURE === 'false') return null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); void browser?.close(); }, LIMITS.timeMs);
  let requests = 0, active = 0, bytes = 0;
  const waiting: Array<() => void> = [];
  const resourceFor = async (url: string, kind: SourceReferenceResourceKind) => {
    if (++requests > LIMITS.requests) throw new Error('Product page request budget exceeded');
    if (active < LIMITS.concurrent) active++;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      const signal = kind === 'html' ? controller.signal : AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
      return await readSourceReferenceResource(url, kind, signal, count => {
        bytes += count;
        if (bytes > LIMITS.bytes) { controller.abort(); throw new Error('Product page byte budget exceeded'); }
      }, undefined, PRODUCT_SOURCE_USER_AGENT);
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
  try {
    const initialUrl = publicBrandUrl(raw).href;
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 10_000,
      // As in the capture: routing answers every request, and this unreachable proxy stops anything routing missed.
      proxy: { server: 'http://127.0.0.1:9' },
      args: ['--js-flags=--max-old-space-size=192', '--proxy-bypass-list=<-loopback>', '--host-resolver-rules=MAP * ~NOTFOUND', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
      env: { PATH: process.env.PATH || '/usr/bin:/bin', ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}) },
    });
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [], offline: true, userAgent: PRODUCT_SOURCE_USER_AGENT, locale: 'es-ES', viewport: { width: 1280, height: 900 } });
    await context.routeWebSocket('**/*', socket => socket.close());
    let status = 0;
    await context.route('**/*', async route => {
      const request = route.request();
      const kind = productRenderRequestKind(request.method(), request.resourceType(), request.url(), initialUrl, request.frame() === request.frame().page().mainFrame());
      if (!kind || controller.signal.aborted) { await route.abort().catch(() => {}); return; }
      try {
        const resource = await resourceFor(request.url(), kind);
        await route.fulfill({ body: resource.body, contentType: resource.contentType, headers: { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      } catch {
        // The page itself refused (403 and the like): the caller reads that as blocked.
        if (kind === 'html' && !status) status = 403;
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.on('dialog', dialog => { void dialog.dismiss(); });
    page.on('popup', popup => { void popup.close(); });
    const response = await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
    if (!response) return status ? { url: initialUrl, html: '', status } : null;
    await page.waitForTimeout(LIMITS.settleMs);
    return { url: page.url(), html: await page.content(), status: response.status() };
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); await browser?.close().catch(() => {}); }
}
