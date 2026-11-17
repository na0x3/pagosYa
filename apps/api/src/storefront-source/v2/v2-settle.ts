import type { SourceProjectSnapshot } from '../source-project';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import type { V2File } from './v2-context';

/** Owner 2026-11-16 («cant we fix this directly?»): what has one right answer is settled in code after the build, not sent back to
 *  the writer for another 3–10 minute round. First: photos over the desktop size rule («huge-photo» in source-template-qa-rules.ts)
 *  get a height cap of their own in the design's CSS — measured on the built page, so the cap matches the rule exactly. */

/** A photo the desktop rule finds too big, as measured on the built page. */
export type HugePhoto = { file: string; width: number; height: number; positioned: boolean; words: boolean; scale?: number };

/** The same limits as the page rule, with a little room: a band wider than 760 px stays under 520 px tall, any other photo under
 *  820 px tall and 500 000 px². */
export const capHeight = (width: number) => width > 760 ? 500 : Math.min(780, Math.floor(490_000 / Math.max(width, 1)));

const BLOCK = /\n?\/\* v2:photo-caps[^]*?\/\* \/v2:photo-caps \*\/\n?/;
const RULE = /\[src\$="([^"]+)"\][^{]*\{max-height:(\d+)px/g;
/** The lines the page checks send back that this step settles. */
export const SETTLES = /Fotos demasiado grandes/;

/** The design's CSS with a cap for each photo (the caps it had are kept, a new measure replaces one). A photo laid over its box
 *  (absolute/fixed) cannot be capped without leaving a hole, so it is left to the writer. Photos with words and cut-outs are never
 *  cropped (contain); others fill their capped box (cover). Desktop only: the rule does not apply on a phone. */
export function withPhotoCaps(files: readonly V2File[], photos: readonly HugePhoto[], cutouts: ReadonlySet<string> = new Set()): { files: V2File[]; repairs: string[] } | null {
  const css = files.find(file => file.path === 'styles/globals.css');
  const fixable = photos.filter(photo => !photo.positioned && photo.file);
  if (!css || !fixable.length) return null;
  const caps = new Map<string, number>();
  for (const match of (css.content.match(BLOCK)?.[0] ?? '').matchAll(RULE)) caps.set(match[1], Number(match[2]));
  const repairs: string[] = [];
  for (const photo of fixable) {
    // A photo drawn bigger than its box (a scroll zoom, Oh Belly r26: ×1.02) is measured drawn, so its box is capped that much lower.
    const cap = Math.min(Math.floor(capHeight(photo.width) / Math.max(photo.scale ?? 1, 1)), caps.get(photo.file) ?? Infinity);
    caps.set(photo.file, cap);
    repairs.push(`styles/globals.css: ${photo.file} ${Math.round(photo.width)}×${Math.round(photo.height)} → alto máx. ${cap} px`);
  }
  const contained = (file: string) => cutouts.has(`assets/${file}`) || photos.some(photo => photo.file === file && photo.words);
  // No !important (the V2 contract refuses it — live 2026-11-16, rg store: the capped version's next round was lost to it). A cap wins
  // over any height the design sets (max-height beats height); html body raises it over a design's own max-height on the photo.
  const rules = [...caps].map(([file, cap]) => `html body main :is(img,video)[src$="${file}"],html body main video:has(source[src$="${file}"]){max-height:${cap}px;box-sizing:border-box;object-fit:${contained(file) ? 'contain' : 'cover'}}`);
  const block = `\n/* v2:photo-caps — photos kept medium on a desktop (owner rule), settled in code */\n@media (min-width:1000px){\n${rules.join('\n')}\n}\n/* /v2:photo-caps */\n`;
  const content = `${css.content.replace(BLOCK, '\n').trimEnd()}\n${block}`;
  return { files: files.map(file => file === css ? { ...file, content } : file), repairs };
}

/** The photos of the home the desktop rule finds too big, measured as the rule measures them (1280 px, after scrolling the page
 *  once so entrances settle). Product cards are the platform's and never counted. */
export async function measureHugePhotos(snapshot: SourceProjectSnapshot): Promise<HugePhoto[]> {
  return withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html', undefined, true).query, undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
    return page.evaluate(() => {
      const productish = '[data-product-id],[data-pagosya-product],[data-pagosya-catalog],[data-pagosya-spotlight],.menu-item,[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel,.lb-names';
      const main = document.querySelector('main') ?? document.body;
      const shown = (el: Element) => { for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) { const s = getComputedStyle(node); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05 || s.position === 'fixed') return false; } return true; };
      return Array.from(main.querySelectorAll('img,video')).filter(el => !el.closest(productish) && shown(el)).map(el => {
        const r = el.getBoundingClientRect();
        const src = (el as HTMLImageElement).currentSrc || el.getAttribute('src') || el.querySelector('source')?.getAttribute('src') || '';
        const position = getComputedStyle(el).position;
        const box = (el as HTMLElement).offsetHeight;
        return { file: (src.split(/[?#]/)[0].split('/').pop() || ''), width: r.width, height: r.height, positioned: position === 'absolute' || position === 'fixed', words: el.hasAttribute('data-pagosya-words'), scale: box > 0 ? r.height / box : 1 };
      }).filter(({ width, height }) => height > 820 || (width > 760 && height > 520) || (width <= 760 && width * height > 500_000));
    });
  }, 'no-preference');
}

/** Owner 2026-11-16 (NOA r14 product page: «when you scroll the text cramps up»): a sticky column (the buy box) that stays pinned over
 *  the sections below it — its words land on theirs mid-scroll, which a check at the top of the page never sees. The product page
 *  is scrolled step by step and every pinned element whose words cover other words is named. */
export async function stickyOverlapLines(snapshot: SourceProjectSnapshot, productId: string): Promise<string[]> {
  // The sandbox takes the product through its query, never the page address (v2-look).
  return withVisualSandbox(snapshot, sourceVisualState(snapshot, 'product.html', productId, true).query, undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('https://preview.invalid/product.html', { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(async () => { await document.fonts.ready; });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const found = new Set<string>();
    for (let y = 0; y < height; y += 300) {
      await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60);
      const hits: string[] = await page.evaluate(() => {
        const words = (root: Element) => { const out: Array<{ r: DOMRect; t: string }> = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) { const t = (n.textContent || '').trim(); if (!t) continue; const range = document.createRange(); range.selectNodeContents(n);
            for (const r of Array.from(range.getClientRects())) if (r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight) out.push({ r, t }); } return out; };
        const pinned = Array.from(document.querySelectorAll('body *')).filter(el => getComputedStyle(el).position === 'sticky' && !el.closest('header,.ui-nav,[data-nav-shell]'));
        const hits: string[] = [];
        for (const el of pinned) {
          const mine = words(el); if (!mine.length) continue;
          const others = words(document.querySelector('main') ?? document.body).filter(w => !el.contains(document.elementFromPoint(w.r.left + 1, w.r.top + 1) ?? null) && !(w.t && el.textContent?.includes(w.t)));
          // Only the pinned words a shopper sees: words a later section paints over are hidden, not cramped.
          const seen = mine.filter(a => { const top = document.elementFromPoint(a.r.left + a.r.width / 2, a.r.top + a.r.height / 2); return Boolean(top && el.contains(top)); });
          for (const a of seen) for (const b of others) {
            const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (w > 8 && h > 6) { hits.push(`«${a.t.slice(0, 30)}» sobre «${b.t.slice(0, 30)}»`); break; }
          }
        }
        return hits;
      });
      hits.forEach(hit => found.add(hit));
      if (found.size >= 3) break;
    }
    return found.size ? [`Escritorio: Página de producto: al bajar, una columna fija (position: sticky) se monta sobre las secciones de abajo (${[...found].slice(0, 3).join('; ')}). Deja la columna fija solo junto a la galería (lo de abajo va fuera de esa retícula) o quítale position: sticky.`] : [];
  }, 'no-preference');
}
