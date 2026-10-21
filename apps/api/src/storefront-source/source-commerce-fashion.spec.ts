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

async function open({ items = [product()] as any[], fullPage = false, cards = 'fashion', style = 'fashion', template = '' }: { items?: any[]; fullPage?: boolean; cards?: string; style?: string; template?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const url = fullPage ? `https://shop.test/product.html?id=${items[0]?.id}` : 'https://shop.test/';
  const dom = new JSDOM(`<html><head></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
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
    expect(card.querySelector('.menu-item__row .menu-item__name').textContent).toBe('Carden');
    expect(card.querySelector('.menu-item__row .menu-item__price').textContent).toMatch(/7\.150/);
    expect(card.querySelector('.menu-item__colors').textContent).toBe('3 colores');
    expect(card.querySelector('.menu-add,[data-add]')).toBeNull();
    expect(card.querySelector('.menu-item__panel [data-product-zoom]')).not.toBeNull();
  });

  it('one colour shows its name; no colours, no line', async () => {
    const { q } = await open({ items: [product({ cardEyebrow: null, variants: [variant('a', 'S', 'Negro'), variant('b', 'M', 'Negro')] }), product({ id: 'liso', cardEyebrow: '' })] });
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

  it('the fashion card wins over a card template the store authored earlier (a YAPI-edited home keeps its template)', async () => {
    const template = '<template data-pagosya-product-template><article class="es-card"><a class="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="" /></a><h3 data-product-field="name">P</h3><p data-product-field="price"></p><button type="button" data-product-add>+</button></article></template>';
    const { q } = await open({ template });
    const card = q('.menu-item[data-product-id="carden"]');
    expect(card.getAttribute('data-anatomy')).toBe('fashion');
    expect(card.hasAttribute('data-custom-product')).toBe(false);
  });

  it('the photo carries a tag only — never the descriptive card phrase — and the sale price is shown', async () => {
    const { q } = await open({ items: [product({ cardEyebrow: 'Vestido halter', badge: 'Edición limitada' }), product({ id: 'rebaja', cardEyebrow: 'Flores bordadas a mano', discountPercent: 20 }), product({ id: 'agotado', stock: 0 }), product({ id: 'liso', cardEyebrow: 'Corte holgado' })] });
    expect(q('[data-product-id="carden"] .menu-item__panel').textContent).not.toContain('Vestido halter');
    expect(q('[data-product-id="carden"] .menu-item__tag').textContent).toBe('Edición limitada');
    expect(q('[data-product-id="rebaja"] .menu-item__tag').textContent).toBe('−20%');
    expect(q('[data-product-id="rebaja"] .menu-item__price del')).not.toBeNull();
    expect(q('[data-product-id="agotado"] .menu-item__tag').textContent).toBe('Agotado');
    expect(q('[data-product-id="liso"] .menu-item__tag')).toBeNull();
    expect(q('.menu-item__label')).toBeNull();
  });

  it('other stores keep their card', async () => {
    const { q } = await open({ cards: 'compact', style: 'editorial' });
    expect(q('.menu-item[data-product-id="carden"]').hasAttribute('data-anatomy')).toBe(false);
  });
});

describe('fashion product page', () => {
  const sized = () => product({ variants: [variant('xs', 'XS', 'Negro'), variant('s', 'S', 'Negro', { stock: 0 }), variant('m', 'M', 'Negro'), variant('g', 'M', 'Gris')] });

  it('no size is chosen for the shopper: the button asks for one, then adds', async () => {
    const { q, all } = await open({ fullPage: true, items: [sized()] });
    expect(q('[data-pagosya-product]').getAttribute('data-style')).toBe('fashion');
    const buy = q('[data-pagosya-product] [data-variant-add]');
    expect(buy.disabled).toBe(true);
    expect(buy.textContent).toMatch(/^Elige una talla/);
    const sizes = all('[data-pagosya-product] .product-detail__values')[0].querySelectorAll('[data-product-option]');
    expect([...sizes].map((b: any) => b.disabled)).toEqual([false, true, false]);
    sizes[0].click();
    expect(q('[data-pagosya-product] [data-variant-add]').textContent).toMatch(/^Agregar al pedido/);
    expect(q('[data-pagosya-product] [data-variant-add]').disabled).toBe(false);
  });

  it('the colour group reads «2 colores:» with the chosen one after it', async () => {
    const { q } = await open({ fullPage: true, items: [sized()] });
    const legends = [...q('[data-pagosya-product]').querySelectorAll('.product-detail__options legend')].map((l: any) => l.textContent.trim());
    expect(legends[1]).toMatch(/^2 colores:/);
  });

  it('picking a colour first never picks a size for the shopper (review: the colour choice was undone)', async () => {
    const { q, all } = await open({ fullPage: true, items: [sized()] });
    const groups = all('[data-pagosya-product] .product-detail__values');
    const gris = [...groups[1].querySelectorAll('[data-product-option]')].find((b: any) => b.textContent.includes('Gris')) as any;
    gris.click();
    expect([...groups[0].querySelectorAll('[aria-pressed=true]')]).toHaveLength(0);
    expect(gris.getAttribute('aria-pressed')).toBe('true');
    const buy = q('[data-pagosya-product] [data-variant-add]');
    expect(buy.textContent).toMatch(/^Elige una talla/);
    expect(buy.disabled).toBe(true);
    // Only M comes in Gris: XS is now unavailable.
    expect([...groups[0].querySelectorAll('[data-product-option]')].map((b: any) => b.disabled)).toEqual([true, true, false]);
  });

  it('«Leer más» stays with the description inside a store\'s product page template', async () => {
    const template = '<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="description"></div><div data-product-slot="buy"></div></article></template>';
    const description = 'Tejido en Inglaterra con lana merino extrafina y cachemira reciclada. '.repeat(5);
    const { q } = await open({ fullPage: true, items: [product({ description })], template });
    expect(q('[data-product-slot="description"] [data-product-more]')).not.toBeNull();
  });

  it('a product without sizes keeps the normal button', async () => {
    const { q } = await open({ fullPage: true, items: [product({ id: 'collar', variants: [] })] });
    const buy = q('[data-pagosya-product] .product-detail__buy');
    expect(buy.textContent).toMatch(/^Agregar al pedido/);
    expect(buy.disabled).toBe(false);
  });

  it('the category under the title, and a long description gets «Leer más»', async () => {
    const description = 'Tejido en Inglaterra con lana merino extrafina y cachemira reciclada. '.repeat(5);
    const { q } = await open({ fullPage: true, items: [product({ description })] });
    // The category only: the card phrase is never shown (owner 2026-10-21: photos and titles carry no YAPI phrases).
    expect(q('[data-pagosya-product] .product-detail__eyebrow').textContent).toBe('Vestidos');
    const more = q('[data-pagosya-product] [data-product-more]');
    expect(more.textContent).toBe('Leer más');
    more.click();
    expect(q('[data-pagosya-product] .product-detail__intro').hasAttribute('data-expanded')).toBe(true);
    expect(more.textContent).toBe('Leer menos');
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('a short description has no «Leer más»', async () => {
    const { q } = await open({ fullPage: true, items: [product({ description: 'Punto inglés.' })] });
    expect(q('[data-pagosya-product] [data-product-more]')).toBeNull();
  });

  it('the related row says «También te puede gustar»', async () => {
    const { q } = await open({ fullPage: true, items: [product(), product({ id: 'otro', name: 'Moor' })] });
    expect(q('#product-related-title')?.textContent).toMatch(/^También te puede gustar/);
  });

  it('other styles keep «Añadir al pedido» and preselect as before', async () => {
    const { q } = await open({ fullPage: true, items: [sized()], style: 'editorial' });
    expect(q('[data-pagosya-product] [data-variant-add]').textContent).toMatch(/^Añadir al pedido/);
  });
});
