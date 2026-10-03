/// <reference lib="dom" />
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { Page } from 'playwright';
import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import { agentPreviewSnapshot } from '../agent/agent-capture';
import { nextStoreFiles } from '../fixtures/next-store';
import { withSourceIcons } from '../source-asset-library';
import { withVisualSandbox } from '../source-visual-capture';

/** The free layer on the real browser layout (the canvas unit tests fake every box): the built page opens in Chromium
 * with the Boceto canvas script, and real pointer events pull a part out of its box. */
jest.setTimeout(120_000);

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const tinyJpeg = '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';
const bocetoScript = readFileSync(resolve(__dirname, '../../../../../packages/storefront-preview/src/source-preview-boceto-mode.js'), 'utf8');

async function openPage<T>(blocks: object[], visit: (page: Page) => Promise<T>): Promise<T> {
  const files = await withSourceIcons(assembleSketch(repairSketch({ blocks }, ctx).sketch, ctx));
  const base = [...nextStoreFiles().filter(file => ['config.js', 'commerce.js'].includes(file.path)), { path: 'assets/a.jpg', content: tinyJpeg, encoding: 'base64' as const }];
  const snapshot = await agentPreviewSnapshot({ brief: { businessType: 'Repostería', audience: 'Vecinos', primaryAction: 'Comprar', visualDirection: 'Cálida' }, files: base }, files);
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(img => { img.loading = 'eager'; return img.decode().catch(() => {}); }));
    });
    return visit(page);
  });
}

it('a part pulled out of a section it held up lands under the pointer, and the section closes the gap', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Algo dulce para mirar despacio', sub: 'Repostería de verdad', cta: 'Ver productos', bg: 'paper', size: 'l' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-free') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
      window.postMessage({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline', 'copy/sub', 'copy/actions'], free: {} } } }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const measure = () => page.evaluate(() => {
      const box = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
      return { part: box('[data-skb="h"] [data-skb-el="headline"]'), section: box('[data-skb="h"]'), column: box('[data-skb="h"] [data-skb-group="copy"]') };
    });
    const before = await measure();
    const press = { x: before.part.left + 30, y: before.part.top + before.part.height / 2 };
    // Well past the copy column's right edge (24px pulls it out), still inside the section.
    const drop = { x: before.column.left + before.column.width + 150, y: press.y + 40 };
    await page.mouse.move(press.x, press.y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) await page.mouse.move(press.x + ((drop.x - press.x) * step) / 12, press.y + ((drop.y - press.y) * step) / 12);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    return { before, after: await measure(), posted: await page.evaluate(() => (window as any).posted), moved: { x: drop.x - press.x, y: drop.y - press.y } };
  });
  expect(result.posted).toEqual([expect.objectContaining({ id: 'h', path: 'copy/headline' })]);
  // The section no longer holds the headline up…
  expect(result.after.section.height).toBeLessThan(result.before.section.height - 20);
  // …and the headline moved exactly as far as the pointer did, at its own width.
  expect(Math.abs(result.after.part.left - (result.before.part.left + result.moved.x))).toBeLessThan(3);
  expect(Math.abs(result.after.part.top - (result.before.part.top + result.moved.y))).toBeLessThan(3);
  expect(Math.abs(result.after.part.width - result.before.part.width)).toBeLessThan(3);
});

it('inserted elements show whole in the marquee and the footer; the giant name keeps its cut', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Hola', cta: 'Ver', bg: 'paper', size: 'm' },
    { id: 'm', type: 'marquee', text: 'Horneado · Fresco', glyph: '✦', bg: 'pop', size: 's', extras: [{ id: 'eab1', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 20, w: 22 }, { id: 'eab2', kind: 'text', value: 'Un texto largo que no cabe en una sola línea', x: 70, y: 10, w: 12 }] },
    { id: 'g', type: 'gallery', title: 'Galería', photos: ['assets/a.jpg'], bg: 'paper', size: 'm' },
    { id: 'z', type: 'footer', tagline: 'Hecho con calma.', wordmark: 'giant', bg: 'deep', size: 'm', extras: [{ id: 'eab3', kind: 'photo', value: 'assets/a.jpg', x: 70, y: 85, w: 22 }] },
  ], page => page.evaluate(() => {
    const shownAt = (node: Element, x: number, y: number) => { const hit = document.elementFromPoint(x, y); return Boolean(hit && node.contains(hit)); };
    const marquee = document.querySelector('[data-skb="m"]')!, photo = marquee.querySelector('[data-skb-node="eab1"]')!, text = marquee.querySelector('[data-skb-node="eab2"]')!;
    window.scrollTo(0, marquee.getBoundingClientRect().top + window.scrollY - 100);
    const strip = marquee.getBoundingClientRect(), shot = photo.getBoundingClientRect();
    const inMarquee = { overhangs: shot.bottom > strip.bottom + 40, shownBelow: shownAt(photo, shot.left + shot.width / 2, strip.bottom + 20), textWraps: text.getBoundingClientRect().height > parseFloat(getComputedStyle(text).lineHeight) * 1.5 };
    window.scrollTo(0, document.documentElement.scrollHeight);
    const footer = document.querySelector('[data-skb="z"]')!, footerPhoto = footer.querySelector('[data-skb-node="eab3"]')!, wordmark = footer.querySelector('.skb-wordmark')!;
    const end = footer.getBoundingClientRect(), footerShot = footerPhoto.getBoundingClientRect(), name = wordmark.getBoundingClientRect();
    return {
      inMarquee,
      inFooter: { overhangs: footerShot.bottom > end.bottom + 40, shownBelow: shownAt(footerPhoto, footerShot.left + footerShot.width / 2, end.bottom + 20) },
      // The giant name still ends where the footer ends, as before.
      name: { aboveEnd: shownAt(wordmark, name.left + name.width / 3, end.bottom - 6), belowEnd: shownAt(wordmark, name.left + name.width / 3, end.bottom + 3) },
      scrollWidth: document.documentElement.scrollWidth,
    };
  }));
  expect(result.inMarquee).toEqual({ overhangs: true, shownBelow: true, textWraps: true });
  expect(result.inFooter).toEqual({ overhangs: true, shownBelow: true });
  expect(result.name).toEqual({ aboveEnd: true, belowEnd: false });
  expect(result.scrollWidth).toBe(1280);
});
