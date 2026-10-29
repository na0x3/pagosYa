import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';

// Owner 2026-10-29 («the rounded sizes that existed before»): clothing stores draw the kit's fashion card, which had no size chips.
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const windows: JSDOM[] = [];
afterEach(() => { while (windows.length) windows.pop()!.window.close(); });

it('a fashion card shows the sizes as round chips', async () => {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Could not parse CSS stylesheet|Not implemented/.test(error.message)) throw error; });
  const dom = new JSDOM('<body><div data-pagosya-catalog></div></body>', { runScripts: 'outside-only', virtualConsole, url: 'https://tienda.test/' });
  windows.push(dom);
  const sizes = ['S', 'M', 'L'];
  const item = { id: 'p1', name: 'Vestido Cala', amount: 680000, currency: 'BOB', imageUrls: ['https://tienda.test/p1.jpg'], extras: [], categoryId: null,
    variants: sizes.map((size, index) => ({ id: `v${index}`, amount: 680000, options: [{ name: 'Talla', value: size }] })) };
  const w = dom.window as unknown as Window & { PAGOSYA_CONFIG: unknown; eval: (code: string) => void };
  w.PAGOSYA_CONFIG = { slug: 'atelier', demo: true, showcase: { cards: 'fashion' }, data: { storeName: 'Atelier', categories: [], collections: [], items: [item] } };
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 50));
  const card = dom.window.document.querySelector('[data-anatomy=fashion]')!;
  expect([...card.querySelectorAll('.menu-item__chips span')].map(span => span.textContent)).toEqual(sizes);
});
