import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Showcase commerce §2 (spec 2026-10-19): card insides — eyebrow, points, chips, best deal, save pill, best value. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const base = { amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], highlights: [] };

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open(items: any[], { body = '', showcase, data = {} }: { body?: string; showcase?: Record<string, string>; data?: Record<string, unknown> } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${body}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  const store = { storeName: 'Antojo', checkoutMode: 'payment', items, ...data };
  w.PAGOSYA_CONFIG = { slug: 'antojo', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data: store, ...(showcase ? { showcase } : {}) };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const card = (id: string) => q(`[data-pagosya-catalog] .menu-item[data-product-id="${id}"]`);
  return { q, all, card };
}

describe('card insides', () => {
  it('fills eyebrow, points, chips and save on a showcase card', async () => {
    const variants = [{ id: 'a', name: '250 g', amount: 7500, options: [{ name: 'Tamaño', value: '250 g' }] }, { id: 'b', name: '500 g', amount: 14000, options: [{ name: 'Tamaño', value: '500 g' }] }];
    const { card } = await open([{ ...base, id: 'c', name: 'Café', cardEyebrow: 'Elige tu tueste', discountPercent: 10, variants, highlights: [{ icon: 'leaf', label: 'De los Yungas' }, { icon: 'leaf', label: 'Tostado semanal' }, { icon: 'leaf', label: 'Molido o grano' }, { icon: 'leaf', label: 'Extra' }] }], { showcase: { cards: 'showcase' } });
    expect(card('c').querySelector('.menu-item__eyebrow')?.textContent).toBe('Elige tu tueste');
    expect([...card('c').querySelectorAll('.menu-item__points li')].map((li: any) => li.textContent)).toEqual(['De los Yungas', 'Tostado semanal', 'Molido o grano']);
    expect([...card('c').querySelectorAll('.menu-item__chips span')].map((s: any) => s.textContent)).toEqual(['250 g', '500 g']);
    expect(card('c').querySelector('.menu-item__save')?.textContent).toMatch(/Ahorras Bs\s7,50/);
  });

  it('falls back to the category name for the eyebrow once a design is chosen, and shows nothing when both are missing', async () => {
    const { card } = await open([{ ...base, id: 'c', name: 'Café', categoryId: 'k' }, { ...base, id: 'd', name: 'Taza' }], { showcase: { cards: 'showcase' }, data: { categories: [{ id: 'k', name: 'Café de altura' }] } });
    expect(card('c').querySelector('.menu-item__eyebrow')?.textContent).toBe('Café de altura');
    expect(card('d').querySelector('.menu-item__eyebrow')).toBeNull();
  });

  it('a store without a showcase setting keeps today\'s card, plus a written eyebrow, the save pill and the true deal line', async () => {
    const { card } = await open([{ ...base, id: 'c', name: 'Café', categoryId: 'k', highlights: [{ icon: 'leaf', label: 'Yungas' }], subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] }, { ...base, id: 'd', name: 'Taza', cardEyebrow: 'Hecha a mano' }],
      { data: { categories: [{ id: 'k', name: 'Café' }], subscriptionsEnabled: true } });
    expect(card('c').querySelector('.menu-item__eyebrow')).toBeNull();
    expect(card('c').querySelector('.menu-item__points')).toBeNull();
    expect(card('c').querySelector('.menu-item__deal')?.textContent).toBe('Suscríbete −10%');
    expect(card('d').querySelector('.menu-item__eyebrow')?.textContent).toBe('Hecha a mano');
  });

  it('best value goes only to a real saving, once per grid', async () => {
    const { all } = await open([{ ...base, id: 'a', name: 'A' }, { ...base, id: 'b', name: 'B', discountPercent: 30 }, { ...base, id: 'c', name: 'C', discountPercent: 10 }], { showcase: { cards: 'showcase' } });
    const best = all('[data-pagosya-catalog] [data-card-best]');
    expect(best.map(card => card.dataset.productId)).toEqual(['b']);
    expect(best[0].querySelector('.menu-item__best')?.textContent).toBe('Mejor precio');
    const none = await open([{ ...base, id: 'a', name: 'A' }], { showcase: { cards: 'showcase' } });
    expect(none.q('[data-card-best]')).toBeNull();
  });

  it('colour variants become dots, other options text chips, max 4 then «+N»', async () => {
    const colours = ['Rojo', 'Azul', 'Negro', 'Blanco', 'Verde', 'Rosa'].map((value, i) => ({ id: String(i), name: value, amount: 6000, options: [{ name: 'Color', value }] }));
    const { card } = await open([{ ...base, id: 'm', name: 'Taza', variants: colours }], { showcase: { cards: 'compact' } });
    expect(card('m').querySelectorAll('.menu-item__chips [data-swatch]').length).toBe(4);
    expect(card('m').querySelector('.menu-item__chips')?.textContent).toContain('+2');
  });

  it('showcase with more than 8 products falls back to compact', async () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ ...base, id: `p${i}`, name: `P${i}` }));
    const { q } = await open(items, { showcase: { cards: 'showcase' } });
    expect(q('[data-pagosya-catalog]').getAttribute('data-card-design')).toBe('compact');
  });

  it('an authored template gets the new optional fields filled and hidden when empty', async () => {
    const TEMPLATE = '<template data-pagosya-product-template><article><a data-product-link href="#"><img data-product-field="image" alt=""></a><p data-product-field="eyebrow"></p><h3 data-product-field="name"></h3><ul data-product-field="points"></ul><p data-product-field="deal"></p><p data-product-field="price"></p><button data-product-add></button></article></template>';
    const { q } = await open([{ ...base, id: 'c', name: 'Café', cardEyebrow: 'Tueste medio', highlights: [{ icon: 'leaf', label: 'Yungas' }] }], { body: TEMPLATE, showcase: { cards: 'compact' } });
    expect(q('[data-custom-product] [data-product-field="eyebrow"]').textContent).toBe('Tueste medio');
    expect(q('[data-custom-product] [data-product-field="points"] li').textContent).toBe('Yungas');
    expect(q('[data-custom-product] [data-product-field="deal"]').hidden).toBe(true);
  });

  it('showcase cards: a simple product adds with «Agregar», a product with options opens its options', async () => {
    const { card } = await open([{ ...base, id: 's', name: 'Simple' }, { ...base, id: 'v', name: 'Con talla', variants: [{ id: 'x', name: 'M', amount: 7500, options: [{ name: 'Talla', value: 'M' }] }] }], { showcase: { cards: 'showcase' } });
    expect(card('s').querySelector('.menu-add')?.textContent).toContain('Agregar');
    expect(card('v').querySelector('.menu-add')?.textContent).toContain('Elegir opciones');
  });

  it('an icon-only add button keeps its icon for options and sold out; the words go to its label (Gramiyaa 2026-10-26)', async () => {
    const TEMPLATE = '<template data-pagosya-product-template><article><a data-product-link href="#"><img data-product-field="image" alt=""></a><h3 data-product-field="name"></h3><p data-product-field="price"></p><button data-product-add aria-label="Agregar"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button></article></template>';
    const { q } = await open([
      { ...base, id: 'v', name: 'Maní', variants: [{ id: 'x', name: '1 L', amount: 7500, options: [{ name: 'Tamaño', value: '1 L' }] }, { id: 'y', name: '5 L', amount: 33000, options: [{ name: 'Tamaño', value: '5 L' }] }] },
      { ...base, id: 'o', name: 'Coco', stock: 0 },
    ], { body: TEMPLATE });
    const options = q('[data-custom-product][data-product-id="v"] .menu-add'), soldOut = q('[data-custom-product][data-product-id="o"] .menu-add');
    expect(options.textContent).toBe(''); expect(options.querySelector('svg')).not.toBeNull();
    expect(options.getAttribute('aria-label')).toBe('Elegir opciones de Maní');
    expect(soldOut.querySelector('svg')).not.toBeNull(); expect(soldOut.getAttribute('aria-label')).toBe('Coco agotado');
  });
});
