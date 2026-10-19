import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Showcase commerce §3 (spec 2026-10-19): chosen product sets, product spotlights and spotlight videos. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const p = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), amount: 5000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], highlights: [], ...extra });

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function open(items: any[], body: string, data: Record<string, unknown> = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section id="home" data-pagosya-catalog></section>${body}<section data-pagosya-cart></section></body></html>`, { url: 'https://shop.test/regalos.html', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const store = { storeName: 'Antojo', checkoutMode: 'payment', items, ...data };
  w.PAGOSYA_CONFIG = { slug: 'antojo', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data: store };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce);
  await tick();
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const ids = (selector: string) => [...w.document.querySelectorAll(`${selector} .menu-item`)].map((card: any) => card.dataset.productId);
  return { w, q, ids };
}

describe('products anywhere', () => {
  it('a chosen set shows only the named products, in the merchant order', async () => {
    const { ids } = await open([p('a'), p('b'), p('c')], '<section id="regalos" data-pagosya-catalog data-products="c, a"></section>');
    expect(ids('#regalos')).toEqual(['c', 'a']);
    expect(ids('#home')).toEqual(['a', 'b', 'c']);
  });

  it('a category or a collection set shows that group', async () => {
    const { ids } = await open([p('a', { categoryId: 'k' }), p('b')], '<section id="cafe" data-pagosya-catalog data-category="k"></section><section id="col" data-pagosya-catalog data-collection="verano"></section>', { categories: [{ id: 'k', name: 'Café' }], collections: [{ id: 'x', name: 'Verano', slug: 'verano', productIds: ['b'] }] });
    expect(ids('#cafe')).toEqual(['a']);
    expect(ids('#col')).toEqual(['b']);
  });

  it('a deleted product disappears from blocks — Review Focus 4', async () => {
    const { q, ids } = await open([p('a')], '<section id="set" data-pagosya-catalog data-products="gone"></section><section id="half" data-pagosya-catalog data-products="gone,a"></section><div id="spot" data-pagosya-spotlight="gone"><p>Historia</p></div>');
    expect(q('#set').hidden).toBe(true);
    expect(ids('#half')).toEqual(['a']);
    expect(q('#spot').hidden).toBe(true);
  });

  it('a spotlight renders a live buy card with price, offer squares and an add button', async () => {
    const { q } = await open([p('latte', { amount: 2800 })], '<div id="spot" data-pagosya-spotlight="latte" data-side="right"><p id="story">Lo preparamos así.</p></div>', { bundlesEnabled: true, bundles: [{ id: 'b', name: 'x', kind: 'FIXED', items: [{ productId: 'latte', quantity: 3 }], minimumQuantity: 2, discountPercent: 15 }] });
    expect(q('#spot .spotlight__name').textContent).toBe('LATTE');
    expect(q('#spot .spotlight__price').textContent).toMatch(/28,00/);
    expect(q('#spot [data-offer-square="pack:3"]')).not.toBeNull();
    expect(q('#spot button[data-add="latte"]')).not.toBeNull();
    expect(q('#spot').lastElementChild.classList.contains('spotlight')).toBe(true);
  });

  it('a spotlight pack square makes its add button add that many', async () => {
    const { q, w } = await open([p('latte', { amount: 2800 })], '<div id="spot" data-pagosya-spotlight="latte"></div>', { bundlesEnabled: true, bundles: [{ id: 'b', name: 'x', kind: 'FIXED', items: [{ productId: 'latte', quantity: 3 }], minimumQuantity: 2, discountPercent: 15 }] });
    q('#spot [data-offer-square="pack:3"]').click(); await tick();
    expect(q('#spot [data-offer-square="pack:3"]').getAttribute('aria-checked')).toBe('true');
    q('#spot button[data-add="latte"]').click(); await tick();
    expect(w.document.querySelector('[data-cart-count]').textContent).toBe('3');
  });

  it('spotlight videos are muted, inline, looping and wait to load', async () => {
    const { q } = await open([p('latte')], '<div data-pagosya-spotlight="latte"><video data-spotlight-video src="assets/latte.mp4"></video></div>');
    const video = q('video[data-spotlight-video]');
    expect([video.muted, video.loop, video.playsInline, video.getAttribute('preload')]).toEqual([true, true, true, 'none']);
  });
});
