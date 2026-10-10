/// <reference lib="dom" />
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import type { SourceProjectSnapshot } from '../source-project';

export type Sep5ReviewShot = { width: 1280 | 390; y: number; image: string };
export type Sep5HeaderFacts = { width: number; pageWidth: number; missingImages: number; search: boolean; account: boolean; cart: boolean; brokenWords: string[]; errors: string[] };

/** What the browser can say for certain, in the Spanish the merchant's notes are written in. */
export function sep5MeasuredFacts(facts: Sep5HeaderFacts[]): string[] {
  return facts.flatMap(fact => [
    ...(fact.pageWidth > fact.width + 2 ? [`${fact.width}px: la página es más ancha que la pantalla (${fact.pageWidth}px).`] : []),
    ...(fact.missingImages ? [`${fact.width}px: ${fact.missingImages} imagen(es) visibles no cargaron.`] : []),
    ...(fact.search ? [] : [`${fact.width}px: no hay enlace a buscar.html fuera del pie de página.`]),
    ...(fact.account ? [] : [`${fact.width}px: no hay enlace data-pagosya-account fuera del pie de página.`]),
    ...(fact.cart ? [] : [`${fact.width}px: no hay botón de carrito con [data-cart-count].`]),
    ...(fact.brokenWords.length ? [`${fact.width}px: un título corta la palabra ${fact.brokenWords.map(word => `«${word}»`).join(', ')} a mitad de línea; dale ancho para que salte solo entre palabras.`] : []),
    ...fact.errors.map(error => `${fact.width}px: error de JavaScript: ${error}`),
  ]);
}

/**
 * index.html as a shopper first sees it, at desktop and phone widths: top, middle and bottom of the page.
 * Motion is left on, as a shopper has it, and each scroll gets time for its reveals, so a section that
 * stays invisible until an observer fires is judged as it ends up rather than mid-entrance.
 */
export async function captureSep5Draft(snapshot: SourceProjectSnapshot, signal?: AbortSignal): Promise<{ shots: Sep5ReviewShot[]; facts: Sep5HeaderFacts[] }> {
  const shots: Sep5ReviewShot[] = [], facts: Sep5HeaderFacts[] = [];
  await withVisualSandbox(snapshot, sourceVisualState(snapshot, 'index.html', undefined, true).query, signal, false, async context => {
    // 1024 is measured, not photographed: a heading sized for 1280 can split a word at a laptop width.
    for (const width of [1280, 1024, 390] as const) {
      signal?.throwIfAborted();
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => { if (errors.length < 3) errors.push(error.message.slice(0, 200)); });
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: 844 });
      page.setDefaultTimeout(7000);
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      await page.evaluate(async () => { await document.fonts.ready; });
      await page.waitForTimeout(1000);
      const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      if (width !== 1024) for (const y of [...new Set([0, Math.max(0, Math.round((pageHeight - 844) / 2)), Math.max(0, pageHeight - 844)])]) {
        await page.evaluate(offset => window.scrollTo(0, offset), y);
        await page.waitForTimeout(700);
        await page.evaluate(async () => { await Promise.all(Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).map(i => i.decode().catch(() => {}))); });
        const image = await page.screenshot({ type: 'jpeg', quality: 70, animations: 'disabled', timeout: 7000 });
        shots.push({ width, y, image: `data:image/jpeg;base64,${image.toString('base64')}` });
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      // Lazy images never scrolled past would read as broken; load them all before counting.
      await page.evaluate(async () => {
        for (const img of Array.from(document.images)) img.loading = 'eager';
        await Promise.race([Promise.all(Array.from(document.images).map(img => img.decode().catch(() => {}))), new Promise(resolve => setTimeout(resolve, 3000))]);
      });
      // Present outside the footer is the bar: on a phone the link may rightly live in a closed menu, and the
      // footer's information slot lists account and search for every store, so it proves nothing about the header.
      const header = await page.evaluate(() => {
        const outsideFooter = (selector: string) => Array.from(document.querySelectorAll(selector)).some(el => !el.closest('footer,[data-pagosya-pages]'));
        return {
          pageWidth: document.documentElement.scrollWidth,
          // Only the store's own files: catalog photos still on the platform API cannot load in the offline render.
          missingImages: Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && new URL(i.currentSrc || i.src, location.href).origin === location.origin && (!i.complete || !i.naturalWidth); }).length,
          search: outsideFooter('a[href$="buscar.html"],form[role=search],input[type=search]'),
          account: outsideFooter('a[data-pagosya-account]'),
          cart: outsideFooter('[data-cart-count]'),
          // A word whose own line boxes sit on two lines was split mid-word: a heading squeezed into a narrow column.
          brokenWords: (() => {
            const broken: string[] = [];
            // h1/h2 only: the baseline lets smaller headings break anywhere by design. A box under 2px is visually hidden text.
            for (const heading of Array.from(document.querySelectorAll('h1,h2'))) {
              if (broken.length >= 3) break;
              const box = heading.getBoundingClientRect();
              if (box.width < 2 || box.height < 2) continue;
              const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node && broken.length < 3; node = walker.nextNode()) {
                for (const match of (node.textContent || '').matchAll(/[\p{L}\p{N}]{4,}/gu)) {
                  const range = document.createRange();
                  range.setStart(node, match.index!); range.setEnd(node, match.index! + match[0].length);
                  const lines = new Set(Array.from(range.getClientRects()).filter(rect => rect.width > 0).map(rect => Math.round(rect.top)));
                  if (lines.size > 1 && !broken.includes(match[0])) broken.push(match[0]);
                }
              }
            }
            return broken;
          })(),
        };
      });
      facts.push({ width, ...header, errors });
      await page.close();
    }
  }, 'no-preference');
  return { shots, facts };
}
