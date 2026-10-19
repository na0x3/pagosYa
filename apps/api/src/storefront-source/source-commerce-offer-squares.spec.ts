import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Showcase commerce §1 (spec 2026-10-19): offer squares — 1 unidad, one-product packs and subscription — in the buy box. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const coffee = (extra: Record<string, unknown> = {}) => ({ id: 'coffee', name: 'Café', amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], highlights: [], subscriptionOptions: [], ...extra });
const pack = (quantity: number, percent: number, extra: Record<string, unknown> = {}) => ({ id: `p${quantity}`, name: `Lleva ${quantity}`, kind: 'FIXED', items: [{ productId: 'coffee', quantity }], minimumQuantity: 2, discountPercent: percent, ...extra });

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function page({ items = [coffee()] as any[], settings = {}, showcase, fullPage = true }: { items?: any[]; settings?: Record<string, unknown>; showcase?: Record<string, string>; fullPage?: boolean } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet') && !error.message.includes('getComputedStyle(elt, pseudoElt)')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}</body></html>`,
    { url: `https://shop.test/product.html?id=${items[0]?.id ?? 'coffee'}`, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Antojo', checkoutMode: 'payment', items, bundlesEnabled: true, bundles: [], subscriptionsEnabled: true, ...settings };
  w.PAGOSYA_CONFIG = { slug: 'antojo', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', ...(fullPage ? { productPage: 'product.html' } : {}), data, ...(showcase ? { showcase } : {}) };
  const quote = { subtotal: 7500, discountAmount: 0, amount: 7500, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await tick();
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const keys = () => all('[data-pagosya-product] [data-offer-square]').map(square => square.dataset.offerSquare);
  return { w, q, all, keys };
}

describe('offer squares', () => {
  it('show 1 unidad first and selected, then each one-product pack with the server math', async () => {
    const { all, keys } = await page({ settings: { bundles: [pack(3, 15), pack(2, 10)] } });
    expect(keys()).toEqual(['once:1', 'pack:2', 'pack:3']);
    const squares = all('[data-pagosya-product] [data-offer-square]');
    expect(squares[0].getAttribute('aria-checked')).toBe('true');
    // 3 × 75 = 225; floor(22500 × 15 / 100) = 3375 → 19125 = Bs 191,25; per unit 63,75
    expect(squares[2].textContent).toMatch(/191,25/);
    expect(squares[2].textContent).toMatch(/Ahorras Bs\s33,75/);
    expect(squares[2].textContent).toMatch(/63,75 c\/u/);
  });

  it('marks «Mejor precio» only on the strictly cheapest per unit, never on 1 unidad', async () => {
    const { all } = await page({ settings: { bundles: [pack(2, 10), pack(3, 15)] } });
    expect(all('[data-pagosya-product] .offer-square__tag').map(tag => tag.closest('[data-offer-square]').dataset.offerSquare)).toEqual(['pack:3']);
    expect(all('[data-pagosya-product] .offer-square__tag')[0].textContent).toBe('Mejor precio');
  });

  it('the merchant label replaces «Mejor precio» on its square only', async () => {
    const { all } = await page({ settings: { bundles: [pack(2, 10, { label: 'Recomendado' }), pack(3, 15)] } });
    const tags = Object.fromEntries(all('[data-pagosya-product] [data-offer-square]').map(square => [square.dataset.offerSquare, square.querySelector('.offer-square__tag')?.textContent ?? null]));
    expect(tags).toEqual({ 'once:1': null, 'pack:2': 'Recomendado', 'pack:3': 'Mejor precio' });
  });

  it('ignores mixed and multi-product bundles, and keeps at most 3 packs', async () => {
    const mug = { id: 'mug', name: 'Taza', amount: 3000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
    const { keys } = await page({ items: [coffee(), mug], settings: { bundles: [pack(2, 5), pack(3, 10), pack(4, 15), pack(6, 20), { ...pack(2, 30), id: 'duo', items: [{ productId: 'coffee', quantity: 1 }, { productId: 'mug', quantity: 1 }] }, { ...pack(2, 30), id: 'mix', kind: 'MIX_MATCH' }] } });
    expect(keys()).toEqual(['once:1', 'pack:2', 'pack:3', 'pack:4']);
  });

  it('picking a pack sets the quantity and the add button total', async () => {
    const { q } = await page({ settings: { bundles: [pack(3, 15)] } });
    q('[data-pagosya-product] [data-offer-square="pack:3"]').click(); await tick();
    expect(q('[data-product-quantity-value]').textContent).toBe('3');
    expect(q('[data-product-total]').textContent).toMatch(/191,25/);
    expect(q('[data-pagosya-product] [data-offer-square="pack:3"]').getAttribute('aria-checked')).toBe('true');
  });

  it('subscription squares choose the cadence and keep the existing consent text', async () => {
    const { q } = await page({ items: [coffee({ subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] })] });
    q('[data-pagosya-product] [data-offer-square="sub:MONTHLY"]').click(); await tick();
    expect(q('[name=purchaseMode]:checked').value).toBe('subscribe');
    expect(q('[data-subscription-choice]').textContent).toContain('No se cobra automáticamente');
    expect(q('[data-pagosya-product] [data-offer-square="sub:MONTHLY"]').getAttribute('aria-checked')).toBe('true');
  });

  it('pack squares follow the selected variant (price and stock) — Review Focus 1', async () => {
    const variants = [{ id: 'v250', name: '250 g', amount: 7500, stock: 5, options: [{ name: 'Tamaño', value: '250 g' }] }, { id: 'v1k', name: '1 kg', amount: 20000, stock: 2, options: [{ name: 'Tamaño', value: '1 kg' }] }];
    const { q, keys } = await page({ items: [coffee({ variants })], settings: { bundles: [pack(3, 15)] } });
    q('[data-product-option="0"][data-option-value="1"]').click(); await tick();
    expect(keys()).toEqual([]);
    q('[data-product-option="0"][data-option-value="0"]').click(); await tick();
    expect(q('[data-pagosya-product] [data-offer-square="pack:3"]').textContent).toMatch(/191,25/);
  });

  it('sale price feeds the pack math — Review Focus 2', async () => {
    const { q, all } = await page({ items: [coffee({ discountPercent: 20 })], settings: { bundles: [pack(2, 5)] } });
    // unit 60; 2 × 60 = 120; floor(12000 × 5 / 100) = 600 → 11400 → 57 c/u, strictly lower → Mejor precio
    expect(q('[data-pagosya-product] [data-offer-square="pack:2"]').textContent).toMatch(/57,00 c\/u/);
    expect(all('[data-pagosya-product] .offer-square__tag').length).toBe(1);
  });

  it('no squares for a product with neither packs nor subscription, nor for a membership', async () => {
    const plain = await page();
    expect(plain.keys()).toEqual([]);
    const club = await page({ items: [coffee({ fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm', months: 1, amount: 5000 }] })], settings: { bundles: [pack(2, 10)] } });
    expect(club.keys()).toEqual([]);
  });

  it('a pack shown as a square is not repeated in «Llévalo en paquete»', async () => {
    const { q } = await page({ settings: { bundles: [pack(2, 10)] } });
    expect(q('.product-detail__bundles')).toBeNull();
  });

  it('chooses the layout: grid for one kind, steps for packs and subscription, rows above 4 options', async () => {
    const both = await page({ items: [coffee({ subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] })], settings: { bundles: [pack(2, 10)] }, showcase: { offers: 'grid' } });
    expect(both.q('[data-pagosya-product] [data-offer-layout]').getAttribute('data-offer-layout')).toBe('steps');
    const many = await page({ items: [coffee({ subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 5 }, { cadence: 'MONTHLY', discountPercent: 10 }] })], settings: { bundles: [pack(2, 5), pack(3, 10), pack(4, 15)] }, showcase: { offers: 'grid' } });
    expect(many.q('[data-pagosya-product] [data-offer-layout]').getAttribute('data-offer-layout')).toBe('rows');
    const packs = await page({ settings: { bundles: [pack(2, 10)] }, showcase: { offers: 'grid' } });
    expect(packs.q('[data-pagosya-product] [data-offer-layout]').getAttribute('data-offer-layout')).toBe('grid');
  });

  it('the quick-look dialog shows the same squares (spec §1, owner option 3)', async () => {
    const { q } = await page({ fullPage: false, settings: { bundles: [pack(2, 10)] } });
    q('[data-pagosya-catalog] [data-product="coffee"], [data-pagosya-catalog] .menu-item__details').click(); await tick();
    expect(q('[data-pagosya-product] [data-offer-square="pack:2"]')).not.toBeNull();
  });

  it('long labels never widen the square — Review Focus 5', async () => {
    const { w } = await page({ settings: { bundles: [pack(2, 10, { label: 'El favorito de la casa!' })] } });
    const css = [...w.document.querySelectorAll('style')].map((style: any) => style.textContent).join('');
    expect(css).toMatch(/\.offer-square\{[^}]*min-width:0/);
    expect(css).toMatch(/\.offer-square\{[^}]*overflow-wrap:anywhere/);
  });
});

describe('the cart prices a picked pack the way the server will (live 2026-10-19: square Bs 242,25, cart Bs 285)', () => {
  const addCoffee = async (q: (s: string) => any, times: number) => { for (let i = 0; i < times; i++) { q('[data-pagosya-catalog] [data-add="coffee"]').click(); await tick(); } };
  it('three units with a 3-pack show the pack saving and the square total', async () => {
    const { q } = await page({ settings: { bundles: [pack(3, 15), pack(2, 10)] }, fullPage: false });
    await addCoffee(q, 3);
    expect(q('[data-pagosya-cart] .order-savings').textContent).toMatch(/33,75/);
    expect(q('[data-pagosya-cart] .order-total strong').textContent).toMatch(/191,25/);
  });
  it('the best single pack wins, as on the server (4 units: one 3-pack beats two 2-packs)', async () => {
    const { q } = await page({ settings: { bundles: [pack(3, 15), pack(2, 10)] }, fullPage: false });
    await addCoffee(q, 4);
    expect(q('[data-pagosya-cart] .order-total strong').textContent).toMatch(/266,25/);
  });
  it('fewer units than any pack show plain prices', async () => {
    const { q } = await page({ settings: { bundles: [pack(3, 15)] }, fullPage: false });
    await addCoffee(q, 2);
    expect(q('[data-pagosya-cart] .order-savings')).toBeNull();
    expect(q('[data-pagosya-cart] .order-total strong').textContent).toMatch(/150,00/);
  });
});
