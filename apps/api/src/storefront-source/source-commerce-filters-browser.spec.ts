import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { withVisualSandbox } from './source-visual-capture';

/** Final review 2026-10-21: the sidebar style laid out in a real browser — jsdom cannot see grid placement. The products sit
 *  beside the sidebar from the top, and the page is not padded with empty grid rows. */
jest.setTimeout(60_000);
const item = (i: number) => ({ id: `p${i}`, name: `Producto ${i}`, amount: 1000 * i, currency: 'BOB', stock: null, categoryId: i % 2 ? 'c1' : 'c2', imageUrls: [], variants: [], extras: [], highlights: [] });
const data = { storeName: 'Prueba', checkoutMode: 'payment', categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }], items: Array.from({ length: 12 }, (_, i) => item(i + 1)) };
const page = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="config.js"></script><script src="commerce.js" defer></script></head><body><main style="max-width:1280px;margin:0 auto;padding:24px"><section data-pagosya-catalog data-catalog-full></section></main></body></html>';

it('sidebar: the products start beside the sidebar and the page has no tall empty tail at 1440 px', async () => {
  const snapshot = { files: [
    { path: 'productos.html', content: page },
    { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'prueba', apiBaseUrl: 'https://api.invalid', checkoutOrigin: 'https://pay.invalid', demo: true, filterStyle: 'sidebar', data })};\n` },
    { path: 'commerce.js', content: readFileSync(kitPath('commerce.js'), 'utf8') },
  ] } as any;
  const read = await withVisualSandbox(snapshot, '', undefined, false, async context => {
    const tab = await context.newPage();
    await tab.setViewportSize({ width: 1440, height: 900 });
    await tab.goto('https://preview.invalid/productos.html', { waitUntil: 'load', timeout: 12000 });
    await tab.waitForSelector('.catalog-filters__side', { timeout: 8000 });
    const out = await tab.evaluate(() => {
      const box = (selector: string) => document.querySelector(selector)!.getBoundingClientRect();
      const side = box('.catalog-filters__side'), card = box('[data-pagosya-catalog] .menu-item'), search = box('.catalog-search');
      return { side: { top: side.top, right: side.right }, card: { top: card.top, left: card.left }, search: { top: search.top }, height: document.documentElement.scrollHeight };
    });
    await tab.close();
    return out;
  });
  expect(read.card.left).toBeGreaterThanOrEqual(read.side.right);
  expect(read.card.top - read.side.top).toBeLessThan(260);
  expect(read.search.top).toBeLessThan(read.card.top);
  expect(read.height).toBeLessThan(2600);
});
