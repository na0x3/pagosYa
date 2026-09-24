/// <reference lib="dom" />
import { chromium } from 'playwright';

/** Colour facts read off the pixels themselves, so the accent and surface rules in
 * STOREFRONT_DESIGN_LEVEL_UP.md §4 and §5 have something real to draw from. Nothing here asks a
 * model what a photograph looks like; it measures it. */
export type PhotoSample = {
  /** Most-covering colours first, already merged so four near-identical greys never fill the list. */
  dominant: string[];
  /** The colour of the border ring: what the goods are sitting against. */
  backdropHex?: string;
  /** Share of the border ring close to that colour. 1 is a seamless sweep, 0.2 is a real place. */
  uniformity?: number;
};

const origin = 'https://photo.invalid';
const mime: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', gif: 'image/gif' };
/** 64×64 is enough to rank colour mass and costs a fraction of a millisecond per photograph. */
const GRID = 64;
const extension = (path: string) => path.split('.').at(-1)!.toLowerCase();

/** One browser for the whole batch. Every failure mode — no Chromium, a corrupt file, a timeout —
 * degrades to "no sample" rather than failing the generation that asked for it: a store without
 * colour facts is the status quo, a store that cannot be generated is a regression. */
export async function samplePhotoColours(images: Array<{ url: string; path: string; bytes: Buffer }>, signal?: AbortSignal): Promise<Map<string, PhotoSample>> {
  const samples = new Map<string, PhotoSample>();
  const readable = images.filter(image => mime[extension(image.path)]);
  if (!readable.length || signal?.aborted) return samples;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, chromiumSandbox: true, timeout: 15000 });
  } catch { return samples; }
  const cancel = () => { void browser!.close().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const deadline = setTimeout(cancel, 45000);
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
    const served = new Map(readable.map((image, index) => [`/${index}.${extension(image.path)}`, image]));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin || route.request().method() !== 'GET') return route.abort();
      if (url.pathname === '/') return route.fulfill({ body: '<!doctype html><title>sample</title>', contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; img-src 'self'", 'Cache-Control': 'no-store' } });
      const image = served.get(url.pathname);
      if (!image) return route.abort();
      await route.fulfill({ body: image.bytes, contentType: mime[extension(image.path)], headers: { 'Cache-Control': 'no-store' } });
    });
    const page = await context.newPage();
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const measured = await page.evaluate(measureInPage, { urls: [...served.keys()].map(path => origin + path), grid: GRID });
    [...served.values()].forEach((image, index) => { const sample = measured[index]; if (sample) samples.set(image.url, sample); });
  } catch { /* a partial batch is still worth keeping */ }
  finally { clearTimeout(deadline); signal?.removeEventListener('abort', cancel); await browser.close().catch(() => {}); }
  return samples;
}

/** Runs inside the page, where a decoder for every format we accept already exists. */
function measureInPage({ urls, grid }: { urls: string[]; grid: number }) {
  const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const load = (url: string) => new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  const measure = async (url: string) => {
    const image = await load(url);
    if (!image || !image.naturalWidth || !image.naturalHeight) return null;
    const canvas = document.createElement('canvas');
    canvas.width = grid; canvas.height = grid;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    // Scaling to the grid averages neighbourhoods, which is exactly the smoothing we want before
    // counting: JPEG noise stops splitting one wall colour across a dozen buckets.
    ctx.drawImage(image, 0, 0, grid, grid);
    const { data } = ctx.getImageData(0, 0, grid, grid);
    const add = (into: Map<number, { count: number; r: number; g: number; b: number }>, at: number) => {
      const key = ((data[at] >> 3) << 10) | ((data[at + 1] >> 3) << 5) | (data[at + 2] >> 3);
      const bucket = into.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++; bucket.r += data[at]; bucket.g += data[at + 1]; bucket.b += data[at + 2];
      into.set(key, bucket);
    };
    const mean = (bucket: { count: number; r: number; g: number; b: number }) => [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as const;
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    const ringBuckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    const border: number[] = [];
    // A three-pixel ring is wide enough to survive a drop shadow and narrow enough to miss the goods.
    const ring = 3;
    for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
      const at = (y * grid + x) * 4;
      if (data[at + 3] < 128) continue; // cut-outs are transparent, and transparency is not a colour
      add(buckets, at);
      if (x < ring || y < ring || x >= grid - ring || y >= grid - ring) { border.push(at); add(ringBuckets, at); }
    }
    if (!buckets.size) return null;
    const dominant: Array<readonly [number, number, number]> = [];
    // Merge near neighbours so the list reads as four different colours, not four shades of one.
    for (const colour of [...buckets.values()].sort((a, b) => b.count - a.count).map(mean)) {
      if (dominant.length >= 4) break;
      if (dominant.every(kept => Math.hypot(kept[0] - colour[0], kept[1] - colour[1], kept[2] - colour[2]) > 48)) dominant.push(colour);
    }
    let backdropHex: string | undefined, uniformity: number | undefined;
    if (ringBuckets.size) {
      const [r, g, b] = mean([...ringBuckets.values()].sort((a, c) => c.count - a.count)[0]);
      backdropHex = hex(r, g, b);
      // "Close" is a perceptually small step at 8-bit depth; a seamless sweep still shades a little.
      uniformity = Math.round((border.filter(at => Math.hypot(data[at] - r, data[at + 1] - g, data[at + 2] - b) <= 24).length / border.length) * 100) / 100;
    }
    return { dominant: dominant.map(([r, g, b]) => hex(r, g, b)), backdropHex, uniformity };
  };
  return Promise.all(urls.map(url => measure(url).catch(() => null)));
}
