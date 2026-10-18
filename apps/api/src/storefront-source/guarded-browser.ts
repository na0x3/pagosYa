/// <reference lib="dom" />
/** A page opened in a guarded browser (product links 2026-10-18, website copy 2026-10-18), on the same rules as the website
 *  reference capture: every request is answered by the DNS-pinned Node fetcher, Chromium never opens a connection, no cookies,
 *  no writes, no frames, no workers. GET data requests (fetch/XHR) are answered too, because shops and sites fill their pages by
 *  script. */
import { chromium, type Page } from 'playwright';
import { publicBrandUrl } from '../brand/brand-import';
import { readSourceReferenceResource, type SourceReferenceResourceKind } from './source-website-fetch';
import { sourceReferenceRequestKind } from './source-reference-capture';

export const GUARDED_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
const CSP = "default-src 'none'; script-src https: 'unsafe-inline' 'unsafe-eval'; style-src https: 'unsafe-inline'; img-src https: data:; font-src https: data:; connect-src https:; media-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'";

/** The capture's request rules, plus same-page data GETs. */
export function guardedRequestKind(method: string, type: string, url: string, initialUrl: string, mainFrame: boolean): SourceReferenceResourceKind | null {
  if (method === 'GET' && (type === 'fetch' || type === 'xhr')) {
    try { publicBrandUrl(url); return 'data'; } catch { return null; }
  }
  return sourceReferenceRequestKind(method, type, url, initialUrl, mainFrame);
}

export type GuardedPageOptions = { width: number; height: number; timeMs: number; requests?: number; bytes?: number };
export type GuardedPage = { page: Page; initialUrl: string; status: number; refused: boolean };

/** Opens the page, runs `work` on it and always closes the browser. Null when the browser could not start or the page never
 *  answered; `refused` when the site answered with an error (the caller reads that as blocked). */
export async function withGuardedPage<T>(raw: string, options: GuardedPageOptions, work: (opened: GuardedPage) => Promise<T>): Promise<T | null> {
  if (process.env.SOURCE_REFERENCE_CAPTURE === 'false') return null;
  const limits = { requests: options.requests ?? 300, concurrent: 6, bytes: options.bytes ?? 16_000_000 };
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); void browser?.close(); }, options.timeMs);
  let requests = 0, active = 0, bytes = 0;
  const waiting: Array<() => void> = [];
  const resourceFor = async (url: string, kind: SourceReferenceResourceKind) => {
    if (++requests > limits.requests) throw new Error('Guarded page request budget exceeded');
    if (active < limits.concurrent) active++;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try {
      const signal = kind === 'html' ? controller.signal : AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]);
      return await readSourceReferenceResource(url, kind, signal, count => {
        bytes += count;
        if (bytes > limits.bytes) { controller.abort(); throw new Error('Guarded page byte budget exceeded'); }
      }, undefined, GUARDED_USER_AGENT);
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
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, permissions: [], offline: true, reducedMotion: 'reduce', userAgent: GUARDED_USER_AGENT, locale: 'es-ES', viewport: { width: options.width, height: options.height } });
    await context.routeWebSocket('**/*', socket => socket.close());
    let refused = false;
    await context.route('**/*', async route => {
      const request = route.request();
      const kind = guardedRequestKind(request.method(), request.resourceType(), request.url(), initialUrl, request.frame() === request.frame().page().mainFrame());
      if (!kind || controller.signal.aborted) { await route.abort().catch(() => {}); return; }
      try {
        const resource = await resourceFor(request.url(), kind);
        await route.fulfill({ body: resource.body, contentType: resource.contentType, headers: { 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
      } catch {
        if (kind === 'html') refused = true;
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    page.on('dialog', dialog => { void dialog.dismiss(); });
    page.on('popup', popup => { void popup.close(); });
    const response = await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
    if (!response && !refused) return null;
    return await work({ page, initialUrl, status: response?.status() ?? 403, refused: refused || !response });
  } catch { return null; }
  finally { clearTimeout(timer); controller.abort(); await browser?.close().catch(() => {}); }
}
