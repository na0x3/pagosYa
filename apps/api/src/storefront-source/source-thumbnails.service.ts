import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from 'playwright';
import sharp from 'sharp';
import { UploadsService } from '../uploads/uploads.service';
import { SourceGenerationService } from './source-generation.service';
import type { SourceProjectSnapshot } from './source-project';
import { SourceProjectsService } from './source-projects.service';
import { currentSourceRuntime } from './source-runtime';
import { withSeededDna } from './source-dna';
import { withLiveCatalog } from './source-store-config';

const ORIGIN = 'https://preview.invalid';
const TYPES: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', ttf: 'font/ttf', woff: 'font/woff', woff2: 'font/woff2' };

/** The part of the page a circle covers (spec 2026-11-05 point-at): its box plus 48 px, inside the page, at most 1400 × 1000. */
export function regionClip(area: { rect: { x: number; y: number; width: number; height: number }; width: number }) {
  const x = Math.max(0, Math.round(area.rect.x - 48)), y = Math.max(0, Math.round(area.rect.y - 48));
  const width = Math.min(1400, area.width - x, Math.round(area.rect.x + area.rect.width + 48) - x);
  const height = Math.min(1000, Math.round(area.rect.y + area.rect.height + 48) - y);
  return { x, y, width: Math.max(1, width), height: Math.max(1, height) };
}

/** «Tus tiendas» used to run every store's whole live site in its own Studio frame — 3 to 24 MB each, 157 MB for 34 stores on
 *  every visit, and the photos of all of them at once (owner 2026-10-26: «when i refresh the whole site lags out»). A card now
 *  shows one picture of its store's first screen, drawn once per saved revision and kept on disk; revisions never change. */
@Injectable()
export class SourceThumbnailsService {
  private readonly logger = new Logger(SourceThumbnailsService.name);
  private readonly dir = process.env.SOURCE_THUMBNAIL_DIR || join(tmpdir(), 'pagosya-store-thumbnails');
  private readonly drawing = new Map<string, Promise<Buffer>>();
  // One browser at a time: a page of 30 new cards must not start 30 browsers.
  private queue: Promise<unknown> = Promise.resolve();
  // Circled-area pictures, one at a time too, on a line of their own.
  private regions: Promise<unknown> = Promise.resolve();

  constructor(private readonly projects: SourceProjectsService, private readonly generation: SourceGenerationService, private readonly uploads: UploadsService) {}

  async thumbnail(merchantId: string, storeId: string, revision: number): Promise<Buffer> {
    const saved = await this.projects.version(merchantId, storeId, revision);
    const key = `${storeId}-${revision}-${String((saved as { digest?: string }).digest ?? '').slice(0, 16)}.jpg`;
    const file = join(this.dir, key);
    const cached = await readFile(file).catch(() => null);
    if (cached) return cached;
    const pending = this.drawing.get(key);
    if (pending) return pending;
    const job = this.queue.then(() => this.draw(merchantId, storeId, saved.snapshot as unknown as SourceProjectSnapshot)).then(async image => {
      await mkdir(this.dir, { recursive: true });
      await writeFile(file, image);
      return image;
    }).finally(() => this.drawing.delete(key));
    this.queue = job.catch(() => undefined);
    this.drawing.set(key, job);
    return job;
  }

  /** The store as its preview shows it — live catalog, store photos from the uploads store — at 1280 wide, first screen only. */
  private async draw(merchantId: string, storeId: string, stored: SourceProjectSnapshot): Promise<Buffer> {
    try {
      const shot = await this.withStorePage(merchantId, storeId, stored, { width: 1280, height: 800 }, 'index.html', page => page.screenshot({ type: 'png', timeout: 10_000 }));
      return await sharp(shot).resize({ width: 640 }).jpeg({ quality: 74 }).toBuffer();
    } catch (error) {
      this.logger.warn(JSON.stringify({ event: 'store_thumbnail_failed', storeId, reason: (error as Error).message.slice(0, 200) }));
      throw error;
    }
  }

  /** A circled area of a saved revision with the merchant's loop drawn on it (spec 2026-11-05 point-at). Not cached, never stored.
   *  The points are finite numbers and the page matches the DTO's file pattern, so nothing sent becomes markup or leaves ORIGIN. */
  async region(merchantId: string, storeId: string, revision: number, area: { pageQuery: string; width: number; height?: number; rect: { x: number; y: number; width: number; height: number }; points: number[] }): Promise<Buffer> {
    const saved = await this.projects.version(merchantId, storeId, revision);
    const clip = regionClip(area);
    // Its own line (small fixes 2026-11-05): a picture never waits behind store cards being drawn, which outlasted its 20 s.
    const job = this.regions.then(() => this.withStorePage(merchantId, storeId, saved.snapshot as unknown as SourceProjectSnapshot, { width: area.width, height: area.height ?? 900 }, area.pageQuery, async page => {
      await page.evaluate(points => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('style', `position:absolute;left:0;top:0;width:${document.documentElement.scrollWidth}px;height:${document.documentElement.scrollHeight}px;pointer-events:none;z-index:2147483647;overflow:visible`);
        const list: string[] = []; for (let i = 0; i < points.length; i += 2) list.push(`${Number(points[i])},${Number(points[i + 1])}`);
        svg.innerHTML = `<polyline points="${list.join(' ')}" fill="none" stroke="#fff" stroke-width="8"/><polyline points="${list.join(' ')}" fill="none" stroke="#e11d48" stroke-width="4"/>`;
        document.body.appendChild(svg);
      }, area.points);
      return page.screenshot({ type: 'png', fullPage: true, clip, timeout: 10_000 });
    })).then(shot => sharp(shot).resize({ width: Math.min(1024, clip.width), withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer());
    this.regions = job.catch(() => undefined);
    return job;
  }

  /** One sandboxed browser on a saved revision, served like the preview, for `use` to read; always closed after (30 s at most). */
  private async withStorePage<T>(merchantId: string, storeId: string, stored: SourceProjectSnapshot, viewport: { width: number; height: number }, pageQuery: string, use: (page: Page) => Promise<T>): Promise<T> {
    const snapshot = await currentSourceRuntime(stored);
    const catalog = await this.generation.catalog(merchantId, storeId, { assistant: true } as never);
    const files = new Map(withLiveCatalog(withSeededDna(snapshot.files, storeId), catalog).map(f => [f.path, f]));
    const [path, query = ''] = pageQuery.split('?');
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 15_000 });
    const deadline = setTimeout(() => { void browser.close(); }, 30_000);
    try {
      const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport });
      await context.routeWebSocket('**/*', socket => socket.close());
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        const upload = /\/v1\/uploads\/([^/?#]+)$/.exec(url.pathname)?.[1];
        if (upload && ['image', 'font'].includes(route.request().resourceType())) {
          const bytes = await this.uploads.getBuffer(upload).catch(() => null);
          return bytes ? route.fulfill({ body: bytes, contentType: this.uploads.contentTypeFor(upload) }) : route.abort();
        }
        let path = ''; try { path = decodeURIComponent(url.pathname.slice(1)); } catch { /* not a file */ }
        const file = url.origin === ORIGIN && route.request().method() === 'GET' ? files.get(path) : undefined;
        // Videos stay out: the picture uses each video's poster, and an mp4 is the heaviest file a store has.
        if (!file || route.request().resourceType() === 'media') return route.abort();
        await route.fulfill({ body: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'), contentType: TYPES[path.split('.').at(-1) ?? ''] || 'application/octet-stream' });
      });
      await context.addInitScript(q => { const w = window as unknown as Record<string, unknown>; w.PAGOSYA_PREVIEW_QUERY = q ? `?${q}` : ''; w.PAGOSYA_PREVIEW = true; w.PAGOSYA_HOSTED = false; window.open = () => null; }, query);
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/${path}`, { waitUntil: 'load', timeout: 15_000 });
      await page.waitForTimeout(1200);
      return await use(page);
    } finally { clearTimeout(deadline); await browser.close(); }
  }
}
