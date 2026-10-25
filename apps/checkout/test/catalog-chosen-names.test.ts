import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, expect, it } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';

// Atelier rebuild 2026-10-25: YAPI listed a chosen set by product name, «|»-separated, and the kit read only
// comma-separated ids, so every set on every page came out empty.
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const item = (id: string, name: string) => ({ id, name, amount: 680000, currency: 'BOB', imageUrls: [], variants: [], extras: [], categoryId: null });
const windows: JSDOM[] = [];
afterEach(() => { while (windows.length) windows.pop()!.window.close(); });

async function chosen(products: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!/Could not parse CSS stylesheet|Not implemented/.test(error.message)) throw error; });
  const dom = new JSDOM(`<body><div data-pagosya-catalog data-products="${products}"></div></body>`, { runScripts: 'outside-only', virtualConsole, url: 'https://tienda.test/' });
  windows.push(dom);
  const w = dom.window as unknown as Window & { PAGOSYA_CONFIG: unknown; eval: (code: string) => void };
  w.PAGOSYA_CONFIG = { slug: 'atelier', demo: true, data: { storeName: 'Atelier', categories: [], collections: [], items: [item('p1', 'Vestido Escultura'), item('p2', 'Corsé Anturio'), item('p3', 'Collar de Calas'), item('p4', 'Vestido Cala')] } };
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 50));
  const set = dom.window.document.querySelector<HTMLElement>('[data-pagosya-catalog]')!;
  return { hidden: set.hidden, text: set.textContent || '' };
}

it('shows a set named by product names joined by «|», in that order, ignoring case and accents', async () => {
  const { hidden, text } = await chosen('Collar de Calas|corse anturio|Vestido Escultura');
  expect(hidden).toBe(false);
  expect(text.indexOf('Collar de Calas')).toBeLessThan(text.indexOf('Corsé Anturio'));
  expect(text.indexOf('Corsé Anturio')).toBeLessThan(text.indexOf('Vestido Escultura'));
  expect(text).not.toContain('Vestido Cala ');
});

it('still shows a set named by comma-separated ids', async () => {
  const { hidden, text } = await chosen('p4,p1');
  expect(hidden).toBe(false);
  expect(text).toContain('Vestido Cala');
  expect(text).toContain('Vestido Escultura');
  expect(text).not.toContain('Corsé Anturio');
});
