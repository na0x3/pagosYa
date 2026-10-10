import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

// Same jsdom the other kit specs borrow from the checkout app.
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const DAY = 86_400_000;
const product = (over: Record<string, unknown> = {}) => ({
  id: 'cafe', name: 'Café helado proteico', amount: 3799, currency: 'BOB', stock: null,
  imageUrls: ['https://shop.test/cafe.jpg'], variants: [], extras: [], highlights: [],
  badge: null, createdAt: new Date(Date.now() - 90 * DAY).toISOString(), ...over,
});
const rows = (n: number) => ([['cup', 'Café de altura'], ['bolt', 'Energía natural'], ['leaf', 'Enfoque limpio'], ['check', 'Fácil de digerir'], ['heart', 'Sin azúcar'], ['star', 'Hecho en Bolivia']] as const)
  .slice(0, n).map(([icon, label]) => ({ icon, label }));

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function page({ items = [product()] as any[], style, settings = {}, fullPage = true, template = '', gallery }: { items?: any[]; style?: string; settings?: Record<string, unknown>; fullPage?: boolean; template?: string; gallery?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
    { url: `https://shop.test/product.html?id=${items[0]?.id ?? 'cafe'}`, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Blume', items, ...settings };
  w.PAGOSYA_CONFIG = { slug: 'blume', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(style ? { productPageStyle: style } : {}) };
  const quote = { subtotal: 3799, discountAmount: 0, amount: 3799, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/store') ? data : quote }));
  if (gallery) w.document.documentElement.setAttribute('data-dna-gallery', gallery);
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector);
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  return { w, q, all };
}

describe('photo badge', () => {
  it('shows the merchant text on the photo and on the card, and nothing for "Ninguna"', async () => {
    const own = await page({ items: [product({ badge: 'Edición limitada' })] });
    expect(own.q('.product-detail__gallery > .product-detail__badge')?.textContent).toBe('Edición limitada');
    expect(own.q('[data-pagosya-catalog] .menu-item__badge')?.textContent).toBe('Edición limitada');
    const none = await page({ items: [product({ badge: '', createdAt: new Date().toISOString() })], settings: { topSellerId: 'cafe' } });
    expect(none.q('.product-detail__badge')).toBeNull();
    expect(none.q('.menu-item__badge')).toBeNull();
  });

  it('automatic: best seller, then an active discount, then new, else nothing', async () => {
    const recent = new Date(Date.now() - 3 * DAY).toISOString();
    const top = await page({ items: [product({ discountPercent: 20, createdAt: recent })], settings: { topSellerId: 'cafe' } });
    expect(top.q('.product-detail__badge')?.textContent).toBe('Más vendido');
    const sale = await page({ items: [product({ discountPercent: 20, createdAt: recent })], settings: { topSellerId: 'other' } });
    expect(sale.q('.product-detail__badge')?.textContent).toBe('−20%');
    const fresh = await page({ items: [product({ createdAt: recent })] });
    expect(fresh.q('.product-detail__badge')?.textContent).toBe('Nuevo');
    const old = await page();
    expect(old.q('.product-detail__badge')).toBeNull();
  });

  it('keeps the badge on the gallery when the stage is hidden by a stacked gallery', async () => {
    const stacked = await page({ gallery: 'stack', items: [product({ badge: 'Favorito', imageUrls: ['https://shop.test/a.jpg', 'https://shop.test/b.jpg'] })] });
    expect(stacked.q('.product-detail__gallery > .product-detail__badge')?.textContent).toBe('Favorito');
    expect(stacked.q('.product-detail__stage .product-detail__badge')).toBeNull();
  });

  it('never shows a discount badge for an expired discount', async () => {
    const ended = await page({ items: [product({ discountPercent: 20, discountEndsAt: new Date(Date.now() - DAY).toISOString() })] });
    expect(ended.q('.product-detail__badge')).toBeNull();
  });

  it('fills an authored badge field on a custom card, or places the badge after the photo', async () => {
    const card = (badgeField: string) => `<template data-pagosya-product-template><article><div data-product-media><a data-product-link><img data-product-field="image"></a>${badgeField}</div><h3 data-product-field="name"></h3><span data-product-field="price"></span><button data-product-add>Añadir</button></article></template>`;
    const authored = await page({ fullPage: false, template: card('<span data-product-field="badge"></span>'), items: [product({ badge: 'Favorito' })] });
    const field = authored.q('[data-custom-product] [data-product-field="badge"]');
    expect(field.textContent).toBe('Favorito');
    expect(field.hidden).toBe(false);
    const placed = await page({ fullPage: false, template: card(''), items: [product({ badge: 'Favorito' })] });
    expect(placed.q('[data-custom-product] .menu-item__image + .menu-item__badge')?.textContent).toBe('Favorito');
    const empty = await page({ fullPage: false, template: card('<span data-product-field="badge"></span>') });
    expect(empty.q('[data-custom-product] [data-product-field="badge"]').hidden).toBe(true);
  });
});

describe('conversion product page style', () => {
  it('puts three tiles beside the photo and the rest as checks between price and button', async () => {
    const { q, all } = await page({ style: 'conversion', items: [product({ highlights: rows(6) })] });
    expect(q('[data-pagosya-product-page]').dataset.style).toBe('conversion');
    expect(all('.product-detail__gallery > .product-detail__tiles li').map(li => li.textContent)).toEqual(['Café de altura', 'Energía natural', 'Enfoque limpio']);
    expect(all('.product-detail__checks li').map(li => li.textContent)).toEqual(['Fácil de digerir', 'Sin azúcar', 'Hecho en Bolivia']);
    expect(q('.product-detail__highlights')).toBeNull();
    const pricing = q('.product-detail__pricing'), checks = q('.product-detail__checks'), buy = q('.product-detail__buy');
    expect(pricing.compareDocumentPosition(checks) & 4).toBeTruthy(); // checks follow the price
    expect(checks.compareDocumentPosition(buy) & 4).toBeTruthy(); // the button follows the checks
  });

  it('has no tile column with fewer than three highlights or without a photo, and no empty containers', async () => {
    const two = await page({ style: 'conversion', items: [product({ highlights: rows(2) })] });
    expect(two.q('.product-detail__tiles')).toBeNull();
    expect(two.all('.product-detail__checks li')).toHaveLength(2);
    const noPhoto = await page({ style: 'conversion', items: [product({ imageUrls: [], highlights: rows(3) })] });
    expect(noPhoto.q('.product-detail__tiles')).toBeNull();
    expect(noPhoto.all('.product-detail__checks li')).toHaveLength(3);
    const none = await page({ style: 'conversion' });
    expect(none.q('.product-detail__tiles, .product-detail__checks')).toBeNull();
  });

  it('puts the real rating above the title and keeps the price inside the buy button', async () => {
    const { q } = await page({ style: 'conversion', items: [product({ highlights: rows(3) })] });
    const rating = q('[data-product-rating]'), title = q('#pagosya-product-title');
    expect(rating.compareDocumentPosition(title) & 4).toBeTruthy(); // the title follows the rating
    expect(q('.product-detail__buy [data-product-total]')).not.toBeNull();
  });

  it('keeps the tiles when a variant photo redraws the gallery', async () => {
    const withColours = product({ highlights: rows(4), variants: [
      { id: 'v1', name: 'Rojo', amount: 3799, stock: null, options: [{ name: 'Color', value: 'Rojo' }] },
      { id: 'v2', name: 'Azul', amount: 3799, stock: null, options: [{ name: 'Color', value: 'Azul' }], imageUrl: 'https://shop.test/azul.jpg' },
    ] });
    const { all } = await page({ style: 'conversion', items: [withColours] });
    all('[data-product-option="0"]').find(button => button.textContent === 'Azul').click();
    await new Promise(resolve => setImmediate(resolve));
    expect(all('.product-detail__gallery > .product-detail__tiles li')).toHaveLength(3);
  });

  it('keeps a sold-out product honest and still lists its benefits', async () => {
    const { q, all } = await page({ style: 'conversion', items: [product({ stock: 0, highlights: rows(4) })] });
    expect(q('.product-detail__copy').textContent).toContain('Agotado');
    expect(all('.product-detail__checks li')).toHaveLength(1);
  });

  it('places checks after the price in a template without a checks slot, and in its own slot when there is one', async () => {
    const tpl = (extra: string) => `<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div>${extra}<div data-product-slot="buy"></div></article></template>`;
    const without = await page({ style: 'conversion', template: tpl(''), items: [product({ highlights: rows(5) })] });
    expect(without.q('[data-product-slot="pricing"]').nextElementSibling.matches('.product-detail__checks')).toBe(true);
    const own = await page({ style: 'conversion', template: tpl('<div data-product-slot="checks"></div>'), items: [product({ highlights: rows(5) })] });
    expect(own.q('[data-product-slot="checks"] > .product-detail__checks')).not.toBeNull();
  });

  it('no longer drops highlights in a template without a highlights slot', async () => {
    const tpl = '<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></article></template>';
    const { q } = await page({ style: 'editorial', template: tpl, items: [product({ highlights: rows(2) })] });
    expect(q('.product-detail__highlights')).not.toBeNull();
  });
});
