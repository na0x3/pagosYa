import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Fashion look (spec 2026-10-21): the kit's fashion card and fashion product page. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const variant = (id: string, talla: string, color?: string, extra: Record<string, unknown> = {}) => ({ id, name: [talla, color].filter(Boolean).join(' / '), amount: 715000, stock: 3,
  options: [{ name: 'Talla', value: talla }, ...(color ? [{ name: 'Color', value: color }] : [])], ...extra });
const product = (over: Record<string, unknown> = {}) => ({ id: 'carden', name: 'Carden', amount: 715000, currency: 'BOB', stock: null, categoryId: 'k',
  imageUrls: ['https://shop.test/c1.jpg', 'https://shop.test/c2.jpg'], variants: [], extras: [], highlights: [], cardEyebrow: 'Corte holgado', ...over });

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open({ items = [product()] as any[], fullPage = false, cards = 'fashion', style = 'fashion' }: { items?: any[]; fullPage?: boolean; cards?: string; style?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const url = fullPage ? `https://shop.test/product.html?id=${items[0]?.id}` : 'https://shop.test/';
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
    { url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Noa', items, categories: [{ id: 'k', name: 'Vestidos' }] };
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data, showcase: { cards }, productPageStyle: style };
  const quote = { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  return { w, q, all };
}

describe('fashion card', () => {
  it('a tinted photo panel with the label, name and price on one row, the colour count, no add button', async () => {
    const variants = [variant('a', 'S', 'Negro'), variant('b', 'M', 'Negro'), variant('c', 'S', 'Gris'), variant('d', 'S', 'Azul')];
    const { q } = await open({ items: [product({ variants })] });
    const card = q('.menu-item[data-product-id="carden"]');
    expect(card.getAttribute('data-anatomy')).toBe('fashion');
    expect(card.querySelector('.menu-item__panel img.menu-item__image')).not.toBeNull();
    expect(card.querySelector('.menu-item__panel .menu-item__label').textContent).toBe('Corte holgado');
    expect(card.querySelector('.menu-item__row .menu-item__name').textContent).toBe('Carden');
    expect(card.querySelector('.menu-item__row .menu-item__price').textContent).toMatch(/7\.150/);
    expect(card.querySelector('.menu-item__colors').textContent).toBe('3 colores');
    expect(card.querySelector('.menu-add,[data-add]')).toBeNull();
    expect(card.querySelector('.menu-item__panel [data-product-zoom]')).not.toBeNull();
  });

  it('no label without a written one (never the category); one colour shows its name; no colours, no line', async () => {
    const { q } = await open({ items: [product({ cardEyebrow: null, variants: [variant('a', 'S', 'Negro'), variant('b', 'M', 'Negro')] }), product({ id: 'liso', cardEyebrow: '' })] });
    expect(q('[data-product-id="carden"] .menu-item__label')).toBeNull();
    expect(q('[data-product-id="carden"] .menu-item__colors').textContent).toBe('Negro');
    expect(q('[data-product-id="liso"] .menu-item__colors')).toBeNull();
  });

  it('a bar per known colour, showing that colour\'s photo on hover, back to the first photo on leave', async () => {
    const variants = [variant('a', 'S', 'Negro', { imageUrls: ['https://shop.test/negro.jpg'] }), variant('b', 'S', 'Gris', { imageUrls: ['https://shop.test/gris.jpg'] })];
    const { w, q, all } = await open({ items: [product({ variants })] });
    const bars = all('[data-product-id="carden"] .menu-item__bars [data-card-swatch]');
    expect(bars.map((bar: any) => bar.getAttribute('aria-label'))).toEqual(['Ver en Negro', 'Ver en Gris']);
    bars[1].dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true }));
    const photo = q('[data-product-id="carden"] .menu-item__image');
    expect(photo.getAttribute('src')).toBe('https://shop.test/gris.jpg');
    q('[data-product-id="carden"]').dispatchEvent(new w.MouseEvent('pointerleave'));
    expect(photo.getAttribute('src')).toBe('https://shop.test/c1.jpg');
  });

  it('unknown colour names: count, no bars', async () => {
    const variants = [variant('a', 'S', 'Marfil'), variant('b', 'S', 'Champán'), variant('c', 'S', 'Hueso')];
    const { q } = await open({ items: [product({ variants })] });
    expect(q('[data-product-id="carden"] .menu-item__colors').textContent).toBe('3 colores');
    expect(q('[data-product-id="carden"] .menu-item__bars')).toBeNull();
  });

  it('other stores keep their card', async () => {
    const { q } = await open({ cards: 'compact', style: 'editorial' });
    expect(q('.menu-item[data-product-id="carden"]').hasAttribute('data-anatomy')).toBe(false);
  });
});
