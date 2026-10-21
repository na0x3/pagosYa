import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** John Smedley sections (spec 2026-10-21): the `explore` rail is a catalogue mount whose category and colour the page changes. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
const colour = (value: string) => ({ id: value, name: value, amount: 1000, options: [{ name: 'Color', value }] });
const item = (id: string, categoryId: string, variants: any[] = []) => ({ id, name: id, amount: 1000, currency: 'BOB', stock: null, categoryId, imageUrls: [], variants, extras: [], highlights: [] });
const items = [item('a', 'c1', [colour('Rojo'), colour('Azul')]), item('b', 'c1', [colour('Negro')]), item('c', 'c2'), item('d', 'c2')];

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open(mount: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido</button>${mount}<section data-pagosya-cart></section></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  const store = { storeName: 'Noa', checkoutMode: 'payment', categories: [{ id: 'c1', name: 'Vestidos' }, { id: 'c2', name: 'Faldas' }], items };
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data: store };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce);
  await tick();
  const rail = w.document.querySelector('[data-explore-rail]') as any;
  const ids = () => [...rail.querySelectorAll('.menu-item')].map((card: any) => card.dataset.productId);
  return { w, rail, ids };
}

describe('explore rail', () => {
  it('shows the category, and redraws when the page changes it', async () => {
    const { rail, ids } = await open('<section data-pagosya-catalog data-category="c1" data-explore-rail></section>');
    expect(ids()).toEqual(['a', 'b']);
    rail.setAttribute('data-category', 'c2'); await tick();
    expect(ids()).toEqual(['c', 'd']);
  });
  it('a colour narrows the rail to products in that colour, accents and case ignored', async () => {
    const { rail, ids } = await open('<section data-pagosya-catalog data-category="c1" data-color="ROJO" data-explore-rail></section>');
    expect(ids()).toEqual(['a']);
    rail.removeAttribute('data-color'); await tick();
    expect(ids()).toEqual(['a', 'b']);
  });
  it('a category with nothing left hides the rail — Review Focus 2', async () => {
    const { rail } = await open('<section data-pagosya-catalog data-category="gone" data-explore-rail></section>');
    expect(rail.hidden).toBe(true);
  });
});
