import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';

// One build path live check 2026-10-29: the Esencial home grid drew every product (NOA 11, Andes 12), and on a new store every
// card said «Nuevo» because every product was made that week.
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const day = 86_400_000;
const item = (id: string, createdAt: string) => ({ id, name: `Producto ${id}`, amount: 10000, currency: 'BOB', imageUrls: [`https://tienda.test/${id}.jpg`], variants: [], extras: [], categoryId: null, createdAt });
const windows: JSDOM[] = [];
afterEach(() => { while (windows.length) windows.pop()!.window.close(); });

async function render(markup: string, items: unknown[]) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Could not parse CSS stylesheet|Not implemented/.test(error.message)) throw error; });
  const dom = new JSDOM(`<body>${markup}</body>`, { runScripts: 'outside-only', virtualConsole, url: 'https://tienda.test/' });
  windows.push(dom);
  const w = dom.window as unknown as Window & { PAGOSYA_CONFIG: unknown; eval: (code: string) => void };
  w.PAGOSYA_CONFIG = { slug: 'tienda', demo: true, data: { storeName: 'Tienda', categories: [], collections: [], items } };
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 50));
  return dom.window.document.querySelector<HTMLElement>('[data-pagosya-catalog]')!;
}

const recent = new Date(Date.now() - day).toISOString(), old = new Date(Date.now() - 400 * day).toISOString();

it('a catalog with data-catalog-limit draws at most that many products', async () => {
  const grid = await render('<div data-pagosya-catalog data-catalog-limit="4"></div>', [1, 2, 3, 4, 5, 6].map(n => item(`p${n}`, old)));
  expect(grid.querySelectorAll('[data-product-id]').length).toBe(4);
});

it('a catalog without a limit still draws every product', async () => {
  const grid = await render('<div data-pagosya-catalog></div>', [1, 2, 3, 4, 5, 6].map(n => item(`p${n}`, old)));
  expect(grid.querySelectorAll('[data-product-id]').length).toBe(6);
});

it('no «Nuevo» when most of the catalog is new (a store that just opened)', async () => {
  const grid = await render('<div data-pagosya-catalog></div>', [1, 2, 3, 4].map(n => item(`p${n}`, recent)));
  expect(grid.textContent).not.toContain('Nuevo');
});

it('«Nuevo» still marks the one new product of an older catalog', async () => {
  const grid = await render('<div data-pagosya-catalog></div>', [item('p1', old), item('p2', old), item('p3', old), item('p4', recent)]);
  expect(grid.textContent?.match(/Nuevo/g)?.length).toBe(1);
});
