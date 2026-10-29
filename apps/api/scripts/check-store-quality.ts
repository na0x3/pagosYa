/** The template polish bar (docs/superpowers/specs/2026-10-28-template-polish-programme.md), checked on a store's latest saved
 *  revision in a real browser: a long home, a photo in every business section, no photo twice, no broken image, no header item
 *  over another, a working search box, no sideways scroll. Prints one line per store and what failed.
 *   npx ts-node --transpile-only scripts/check-store-quality.ts <storeId|slug> [more…]
 *  Local database only; reads, never writes. */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { chromium, type Page } from 'playwright';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UploadsService } from '../src/uploads/uploads.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceGenerationService } from '../src/storefront-source/source-generation.service';
import { withLiveCatalog } from '../src/storefront-source/source-store-config';

const MIN_DESKTOP_HEIGHT = 7000;
const TYPES: Record<string, string> = { html: 'text/html', css: 'text/css', js: 'text/javascript', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', ttf: 'font/ttf', woff2: 'font/woff2', json: 'application/json' };

type Measure = { height: number; overflowX: boolean; broken: string[]; repeats: string[]; bareSections: string[]; sections: number; photos: number; headerOverlap: string[]; search: boolean };

/** Runs in the page: what the bar looks at on the home. */
function measure(): Measure {
  const key = (src: string) => src.split(/[?#]/)[0].split('/').pop() || src;
  const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 40 && getComputedStyle(el).visibility !== 'hidden'; };
  const main = document.querySelector('main') ?? document.body;
  // Product cards repeat their own photo on purpose (grid + carousel); the bar is about the page's own pictures.
  const own = Array.from(main.querySelectorAll('img')).filter(img => !img.closest('[data-pagosya-catalog],[data-pagosya-product],.es-card,[data-pagosya-reviews]') && visible(img));
  // Where each picture sits (the block's id or class), so a repeat names both places.
  const counts = new Map<string, string[]>();
  const place = (img: Element) => { const block = img.closest('main > *'); return block ? (block.id || String(block.className).split(' ')[0] || block.tagName) : 'header'; };
  for (const img of own) { const k = key(img.currentSrc || img.src); if (k) counts.set(k, [...(counts.get(k) ?? []), place(img)]); }
  const biz = Array.from(main.querySelectorAll(':scope > section[id]')).filter(section => /biz|spread|module/.test(section.className) && !/faq|blog/.test(section.id));
  const header = document.querySelector('header');
  // Menu links are small: anything drawn in the header counts here.
  const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
  const parts = header ? Array.from(header.querySelectorAll('a,button,input,img')).filter(shown).map(el => ({ el, r: el.getBoundingClientRect() })) : [];
  const overlap: string[] = [];
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i], b = parts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 6 && h > 6) overlap.push(`${(a.el.textContent || a.el.getAttribute('aria-label') || a.el.tagName).trim().slice(0, 20)} / ${(b.el.textContent || b.el.getAttribute('aria-label') || b.el.tagName).trim().slice(0, 20)}`);
  }
  return {
    height: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > innerWidth + 1,
    broken: Array.from(document.images).filter(img => img.complete && img.naturalWidth === 0 && img.getAttribute('src')).map(img => key(img.src)),
    repeats: [...counts].filter(([, at]) => at.length > 1).map(([k, at]) => `${k.slice(0, 8)} en ${at.join(' + ')}`),
    bareSections: biz.filter(section => !section.querySelector('img')).map(section => section.id),
    sections: main.querySelectorAll(':scope > section').length,
    photos: counts.size,
    headerOverlap: overlap.slice(0, 4),
    search: Boolean(document.querySelector('form[role=search] input[name=q], a[href$="buscar.html"]')),
  };
}

async function shoot(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 20000 });
  for (let y = 0; y < 40; y++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(60); }
  await page.waitForTimeout(800);
  return page.evaluate(measure);
}

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length) throw new Error('usage: check-store-quality.ts <storeId|slug> [more…]');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  const browser = await chromium.launch({ headless: true });
  try {
    const prisma = app.get(PrismaService), projects = app.get(SourceProjectsService), uploads = app.get(UploadsService), generation = app.get(SourceGenerationService);
    for (const id of ids) {
      const store = await prisma.store.findFirst({ where: { OR: [{ id }, { slug: id }] }, select: { id: true, slug: true, name: true, merchantId: true } });
      if (!store) { console.log(`${id}: no such store`); continue; }
      const version = await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' } });
      if (!version) { console.log(`${store.slug} ${store.name}: no saved design`); continue; }
      const snap = version.snapshot as any;
      const prepared: any = await projects.prepare({ revision: 0, brief: snap.brief, label: 'check', files: snap.files } as any);
      const catalog = await generation.catalog(store.merchantId, store.id, { assistant: true } as any);
      const files = new Map<string, any>(withLiveCatalog(prepared.files, catalog).map((file: any) => [file.path, file]));
      const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname.startsWith('/v1/uploads/')) {
          const name = url.pathname.split('/').at(-1)!;
          const bytes = await readFile(join(__dirname, '..', 'uploads', name)).catch(() => null);
          return bytes ? route.fulfill({ body: bytes, contentType: uploads.contentTypeFor(name), headers: { 'Access-Control-Allow-Origin': '*' } }) : route.abort();
        }
        let path = ''; try { path = decodeURIComponent(url.pathname.slice(1)); } catch { /* not a store file */ }
        const file = url.origin === 'https://preview.invalid' ? files.get(path) : undefined;
        if (!file) return route.abort();
        await route.fulfill({ body: Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'), contentType: TYPES[path.split('.').at(-1)!] || 'application/octet-stream' });
      });
      await context.addInitScript(() => { Object.assign(window, { PAGOSYA_PREVIEW_QUERY: '', PAGOSYA_PREVIEW: true, PAGOSYA_HOSTED: false, PAGOSYA_ACCOUNT_REQUEST: async () => ({ ok: true, body: { signedIn: false } }) }); window.open = () => null; });
      const page = await context.newPage();
      const errors: string[] = []; page.on('pageerror', error => errors.push(error.message.slice(0, 120)));
      const desk = await shoot(page, 1280), phone = await shoot(page, 390);
      await context.close();
      const fails = [
        desk.height < MIN_DESKTOP_HEIGHT ? `corta (${desk.height}px < ${MIN_DESKTOP_HEIGHT})` : '',
        desk.bareSections.length ? `secciones sin foto: ${desk.bareSections.join(', ')}` : '',
        desk.repeats.length ? `fotos repetidas: ${desk.repeats.join(', ')}` : '',
        [...desk.broken, ...phone.broken].length ? `imágenes rotas: ${[...new Set([...desk.broken, ...phone.broken])].join(', ')}` : '',
        desk.headerOverlap.length ? `encabezado encimado: ${desk.headerOverlap.join('; ')}` : '',
        phone.headerOverlap.length ? `encabezado encimado (celular): ${phone.headerOverlap.join('; ')}` : '',
        desk.overflowX || phone.overflowX ? 'scroll lateral' : '',
        desk.search ? '' : 'sin buscador',
        errors.length ? `errores: ${[...new Set(errors)].join(' | ')}` : '',
      ].filter(Boolean);
      console.log(`${fails.length ? 'FALLA' : 'OK   '} ${store.slug} ${store.name} r${version.revision} · ${desk.height}px · ${desk.sections} bloques · ${desk.photos} fotos${fails.length ? `\n      - ${fails.join('\n      - ')}` : ''}`);
    }
  } finally { await browser.close(); await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
