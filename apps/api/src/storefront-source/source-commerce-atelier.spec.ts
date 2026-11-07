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
const _rows = (n: number) => ([['cup', 'Café de altura'], ['bolt', 'Energía natural'], ['leaf', 'Enfoque limpio'], ['check', 'Fácil de digerir'], ['heart', 'Sin azúcar'], ['star', 'Hecho en Bolivia']] as const)
  .slice(0, n).map(([icon, label]) => ({ icon, label }));

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function page({ items = [product()] as any[], style, settings = {}, fullPage = true, template = '', gallery }: { items?: any[]; style?: string; settings?: Record<string, unknown>; fullPage?: boolean; template?: string; gallery?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  // jsdom implements neither CSS parsing of every rule nor getComputedStyle with a pseudo-element; browsers do both.
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet') && !error.message.includes('getComputedStyle(elt, pseudoElt)')) errors.push(error); });
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

describe('atelier product page (2026-10-19, the Amboras layout)', () => {
  it('is a product page style the kit accepts, with the stars before the title and a short first sentence as the subtitle', async () => {
    const { q } = await page({ style: 'atelier', items: [product({ description: 'Frío, cremoso y sin azúcar. Lo preparamos con café de altura de los Yungas y leche entera.' })] });
    expect(q('[data-pagosya-product]')?.getAttribute('data-style')).toBe('atelier');
    expect(q('.product-detail__subtitle')?.textContent).toBe('Frío, cremoso y sin azúcar.');
    expect(q('.product-detail__intro')?.textContent).toBe('Lo preparamos con café de altura de los Yungas y leche entera.');
    const copy = q('.product-detail__copy')!;
    const order = [...copy.children].map((child: any) => child.matches('[data-product-rating]') ? 'rating' : child.matches('[data-part=title]') ? 'title' : child.matches('.product-detail__subtitle') ? 'subtitle' : '').filter(Boolean);
    expect(order).toEqual(['rating', 'title', 'subtitle']);
  });

  it('keeps the whole description when its first sentence is long, and other styles never get a subtitle', async () => {
    const long = await page({ style: 'atelier', items: [product({ description: 'Un café helado proteico preparado con granos de altura, leche entera y nada de azúcar añadida para la mañana. Rinde dos vasos.' })] });
    expect(long.q('.product-detail__subtitle')).toBeNull();
    expect(long.q('.product-detail__intro')?.textContent).toMatch(/^Un café helado proteico/);
    const editorial = await page({ style: 'editorial', items: [product({ description: 'Frío, cremoso y sin azúcar. Lo preparamos con café de altura.' })] });
    expect(editorial.q('.product-detail__subtitle')).toBeNull();
  });

  // 2026-10-19, pawfectt.com: photographed details become story steps on the atelier page.
  const detailItems = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Detalle ${i + 1}`, text: `Texto ${i + 1}`, alt: `Foto ${i + 1}`, imageUrl: `https://shop.test/d${i}.jpg` }));
  const longPage = (blocks: unknown[]) => product({ contentBlocks: blocks });
  it('draws photographed details as story steps whose pills move the frame, with one repeated buy', async () => {
    const { q, all } = await page({ style: 'atelier', items: [longPage([{ type: 'details', items: detailItems(3) }, { type: 'faq', items: [{ q: '¿Uno?', a: 'Sí.' }, { q: '¿Dos?', a: 'Sí.' }] }])] });
    expect(q('.product-long__details')).toBeNull();
    expect(all('.product-steps [data-step]')).toHaveLength(3);
    expect(all('[data-step-media]').map(img => img.hasAttribute('data-active'))).toEqual([true, false, false]);
    expect(q('[data-step-count]')?.textContent).toBe('01 / 03');
    all('[data-step-pill]')[1].click();
    expect(all('[data-step-pill]').map(pill => pill.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(all('[data-step-media]').map(img => img.hasAttribute('data-active'))).toEqual([false, true, false]);
    expect(q('[data-step-count]')?.textContent).toBe('02 / 03');
    expect(q('.product-steps__eyebrow')?.textContent).toBe('01');
    expect(all('[data-buy-again]')).toHaveLength(1);
  });
  it('keeps the photo row for one detail or another style, and two buys only around a compare table', async () => {
    const one = await page({ style: 'atelier', items: [longPage([{ type: 'details', items: detailItems(1) }])] });
    expect(one.q('.product-steps')).toBeNull();
    expect(one.all('.product-long__details [data-part=detail]')).toHaveLength(1);
    const editorial = await page({ style: 'editorial', items: [longPage([{ type: 'details', items: detailItems(3) }])] });
    expect(editorial.q('.product-steps')).toBeNull();
    const versus = { type: 'versus', ours: 'Nuestra', theirs: 'Otras', rows: [{ label: 'A', ours: true, theirs: false }, { label: 'B', ours: true, theirs: false }] };
    const withTable = await page({ style: 'atelier', items: [longPage([{ type: 'details', items: detailItems(2) }, versus])] });
    expect(withTable.all('[data-buy-again]')).toHaveLength(2);
  });

  // 2026-10-19, the Amboras card: atelier stores get a tracked «Agregar» with a bag across the card; others keep the «+».
  it('gives atelier catalog cards the anatomy marker and a worded add button that still adds the product', async () => {
    const atelier = await page({ style: 'atelier', fullPage: false });
    const card = atelier.q('[data-pagosya-catalog] .menu-item')!;
    expect(card.getAttribute('data-anatomy')).toBe('atelier');
    const add = card.querySelector('.menu-add[data-add]')!;
    expect(add.textContent.trim()).toBe('Agregar');
    expect(add.getAttribute('aria-label')).toBe('Añadir Café helado proteico');
    const editorial = await page({ style: 'editorial', fullPage: false });
    const plain = editorial.q('[data-pagosya-catalog] .menu-item')!;
    expect(plain.hasAttribute('data-anatomy')).toBe(false);
    expect(plain.querySelector('.menu-add[data-add]')!.textContent.trim()).toBe('');
  });
});

