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

async function page({ items = [product()] as any[], style, settings = {}, fullPage = true, template = '' }: { items?: any[]; style?: string; settings?: Record<string, unknown>; fullPage?: boolean; template?: string } = {}) {
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
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector);
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  return { w, q, all };
}

describe('photo badge', () => {
  it('shows the merchant text on the photo and on the card, and nothing for "Ninguna"', async () => {
    const own = await page({ items: [product({ badge: 'Edición limitada' })] });
    expect(own.q('.product-detail__stage .product-detail__badge')?.textContent).toBe('Edición limitada');
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
