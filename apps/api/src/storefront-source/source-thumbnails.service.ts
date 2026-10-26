import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
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
    const snapshot = await currentSourceRuntime(stored);
    const catalog = await this.generation.catalog(merchantId, storeId, { assistant: true } as never);
    const files = new Map(withLiveCatalog(withSeededDna(snapshot.files, storeId), catalog).map(f => [f.path, f]));
    const browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 15_000 });
    const deadline = setTimeout(() => { void browser.close(); }, 30_000);
    try {
      const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
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
      await context.addInitScript(() => { const w = window as unknown as Record<string, unknown>; w.PAGOSYA_PREVIEW_QUERY = ''; w.PAGOSYA_PREVIEW = true; w.PAGOSYA_HOSTED = false; window.open = () => null; });
      const page = await context.newPage();
      await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load', timeout: 15_000 });
      await page.waitForTimeout(1200);
      const shot = await page.screenshot({ type: 'png', timeout: 10_000 });
      return await sharp(shot).resize({ width: 640 }).jpeg({ quality: 74 }).toBuffer();
    } catch (error) {
      this.logger.warn(JSON.stringify({ event: 'store_thumbnail_failed', storeId, reason: (error as Error).message.slice(0, 200) }));
      throw error;
    } finally { clearTimeout(deadline); await browser.close(); }
  }
}
