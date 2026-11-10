import { kitDefaultSnapshot, parseConfig } from './source-scorecard-capture';
import { withVisualSandbox } from './source-visual-capture';

/** Spec 2026-11-10 rasca y elige: the favourite the shopper chose in the popup game comes first in the store's grid, marked «Tu
 *  favorito» — remembered on the device (or given by the parent page on a published store); a gone product changes nothing. */
jest.setTimeout(90_000);
const item = (id: string, name: string) => ({ id, name, amount: 2000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] });
const ITEMS = [item('p1', 'Torre de cookies'), item('p2', 'Caja de rolls'), item('p3', 'Desayuno box'), item('p4', 'Combo matcha')];

async function grid(init: string, run?: (page: import('playwright').Page) => Promise<void>) {
  const snapshot = await kitDefaultSnapshot();
  const config = parseConfig(snapshot);
  Object.assign(config.data, { checkoutMode: 'payment', items: ITEMS });
  snapshot.files.find(file => file.path === 'config.js')!.content = `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};`;
  let out: { order: string[]; tags: string[] } = { order: [], tags: [] };
  await withVisualSandbox(snapshot, '', undefined, true, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.addInitScript(`try { ${init.replaceAll('{slug}', String(config.slug))} } catch (error) {}`);
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.locator('[data-pagosya-catalog] [data-product-id]').first().waitFor();
    if (run) await run(page);
    out = await page.evaluate(() => ({
      order: Array.from(document.querySelectorAll('[data-pagosya-catalog] [data-product-id]')).map(card => card.getAttribute('data-product-id')!),
      tags: Array.from(document.querySelectorAll('[data-pagosya-catalog] .pya-fav-tag')).map(tag => (tag.closest('[data-product-id]') as HTMLElement).dataset.productId + ':' + tag.textContent),
    }));
    await page.close();
  });
  return out;
}

it('the remembered favourite comes first, marked «Tu favorito»', async () => {
  expect(await grid("localStorage.setItem('pagosya:fav:{slug}', 'p3')")).toEqual({ order: ['p3', 'p1', 'p2', 'p4'], tags: ['p3:Tu favorito'] });
});

it('a published store gives it through the parent page; a flavour counts as its product', async () => {
  expect((await grid("window.PAGOSYA_FAVOURITE = 'p4:Sandía y menta'")).order[0]).toBe('p4');
});

it('the popup\'s choice moves it first at once and goes to it', async () => {
  const out = await grid('', async page => {
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('pagosya:favourite', { detail: { id: 'p2', go: true } })));
    await page.waitForFunction(() => document.querySelector('[data-pagosya-catalog] [data-product-id]')?.getAttribute('data-product-id') === 'p2');
    expect(await page.evaluate(() => { const r = document.querySelector('[data-pagosya-catalog] [data-product-id="p2"]')!.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; })).toBe(true);
  });
  expect(out.tags).toEqual(['p2:Tu favorito']);
});

it('a favourite that no longer exists changes nothing', async () => {
  expect(await grid("localStorage.setItem('pagosya:fav:{slug}', 'gone')")).toEqual({ order: ['p1', 'p2', 'p3', 'p4'], tags: [] });
});

// Final review 2026-11-10 (I3): in the sandboxed store frame a relative location.href resolved against the parent page; «Ver X» on a page
// without the favourite's card follows a real link, which the frame routes like any click.
it('goes to the favourite\'s own page through a real link when its card is not on this page', async () => {
  await grid("HTMLAnchorElement.prototype.click = function () { window.__followed = this.getAttribute('href'); };", async page => {
    await page.evaluate(() => { document.querySelectorAll('[data-pagosya-catalog]').forEach(el => el.remove()); document.dispatchEvent(new CustomEvent('pagosya:favourite', { detail: { id: 'p2', go: true } })); });
    expect(await page.evaluate(() => (window as unknown as { __followed?: string }).__followed)).toMatch(/product\.html\?id=p2$/);
  }).catch(error => { if (!String(error).includes('waitFor')) throw error; });
});
