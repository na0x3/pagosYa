import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** A product on sale shows its old price struck through on the catalog card, inside the price element so no
 * authored card layout gains a new item to place. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const mug = (extra: Record<string, unknown> = {}) => ({ id: 'mug', name: 'Taza', amount: 5000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], ...extra });
const TEMPLATE = '<template data-pagosya-product-template><article><a data-product-link href="#"><img data-product-field="image" alt=""></a><h3 data-product-field="name"></h3><p data-product-field="price"></p><button data-product-add type="button">Añadir</button></article></template>';

const windows: any[] = [];
const errors: Error[] = [];
async function open(items: any[], body = '') {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|Not implemented: window\.getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${body}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  const data = { storeName: 'Marca', checkoutMode: 'payment', items };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return (selector: string) => w.document.querySelector(selector);
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

describe('catalog card sale price', () => {
  it('strikes through the old price inside the default card price', async () => {
    const query = await open([mug({ discountPercent: 20 })]);
    const original = query('.menu-item__price del.menu-item__original');
    expect(original?.textContent).toContain('50');
    expect(original?.getAttribute('aria-label')).toBe('Precio anterior');
    expect(query('.menu-item__price')?.firstChild?.textContent).toContain('40');
  });

  it('strikes through the old price inside a store-authored card price', async () => {
    const query = await open([mug({ discountPercent: 20 })], TEMPLATE);
    const price = query('[data-custom-product] [data-product-field="price"]');
    expect(price?.querySelector('del.menu-item__original')?.textContent).toContain('50');
    expect(price?.firstChild?.textContent).toContain('40');
  });

  it('shows no old price without a sale, after a sale ended, or on a membership', async () => {
    const ended = new Date(Date.now() - 86400000).toISOString();
    const club = mug({ id: 'club', name: 'Club', fulfillmentType: 'MEMBERSHIP', discountPercent: 20, membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }] });
    const query = await open([mug(), mug({ id: 'old', name: 'Vaso', discountPercent: 20, discountEndsAt: ended }), club]);
    expect(query('.menu-item__original')).toBeNull();
  });
});
