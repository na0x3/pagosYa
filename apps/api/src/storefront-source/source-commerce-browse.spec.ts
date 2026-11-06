import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** «browse» catalogue style (spec 2026-11-06 browse catalogue): the Nike-like shop page — filter column, head row with
 *  «Ocultar filtros» and sort, «Recoger hoy» with a pickup location, and a strip of colour photos on each card.
 *  Every window keeps its own errors: a closed window's timers never fail the next test. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const base = { amount: 9000, currency: 'BOB', stock: null, imageUrls: ['https://img.test/main.jpg'], variants: [], extras: [], highlights: [] };
const colours = (names: string[]) => names.map((value, i) => ({ id: `v${i}`, name: value, amount: 9000, options: [{ name: 'Color', value }], imageUrls: [`https://img.test/${value.toLowerCase()}.jpg`] }));
const pickup = { locations: [{ id: 'l1', name: 'Centro', address: 'Av. Arce 100', pickupEnabled: true }] };

const opened: { window: any; errors: Error[] }[] = [];
afterEach(() => {
  const all = opened.splice(0);
  const errors = all.flatMap(entry => entry.errors);
  all.forEach(entry => entry.window.close());
  expect(errors).toEqual([]);
});

async function open(items: any[], { data = {}, filterStyle = 'browse', session = {} }: { data?: Record<string, unknown>; filterStyle?: string; session?: Record<string, string> } = {}) {
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)|Not implemented/.test(error.message)) errors.push(error); });
  const dom = new JSDOM('<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section></body></html>', { url: 'https://shop.test/productos.html', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  opened.push({ window: w, errors });
  for (const [key, value] of Object.entries(session)) w.sessionStorage.setItem(key, value);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  const store = { storeName: 'Vórtice', checkoutMode: 'payment', items, ...data };
  w.PAGOSYA_CONFIG = { slug: 'vortice', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', filterStyle, data: store };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const card = (id: string) => q(`[data-pagosya-catalog] .menu-item[data-product-id="${id}"]`);
  const click = (selector: string) => q(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  return { w, q, all, card, click };
}

const shoes = [
  { ...base, id: 'a', name: 'Vomero', variants: colours(['Rojo', 'Azul', 'Negro']) },
  { ...base, id: 'b', name: 'Pegasus', stock: 0 },
  { ...base, id: 'c', name: 'Structure', amount: 12000 },
];

describe('browse catalogue', () => {
  it('draws the filter column and a head row with the count, «Ocultar filtros» and the sort', async () => {
    const { q } = await open(shoes);
    expect(q('.catalog-filters')?.getAttribute('data-filter-style')).toBe('browse');
    expect(q('.catalog-filters__side')).not.toBeNull();
    const head = q('.catalog-filters__head');
    expect(head?.querySelector('.catalog-filters__count')?.textContent).toBe('3 productos');
    expect(head?.querySelector('[data-filters-hide]')?.textContent).toBe('Ocultar filtros');
    expect(head?.querySelector('[data-sort-toggle]')).not.toBeNull();
    expect(q('[data-filters-open]')).not.toBeNull();
  });

  it('«Ocultar filtros» hides the column, says «Mostrar filtros», and is remembered for the tab', async () => {
    const { w, q, click } = await open(shoes);
    click('[data-filters-hide]');
    expect(q('.catalog-filters').hasAttribute('data-filters-hidden')).toBe(true);
    expect(q('[data-filters-hide]').textContent).toBe('Mostrar filtros');
    expect(q('[data-filters-hide]').getAttribute('aria-expanded')).toBe('false');
    expect(w.sessionStorage.getItem('pagosya-filters-hidden')).toBe('1');
    click('[data-filters-hide]');
    expect(q('.catalog-filters').hasAttribute('data-filters-hidden')).toBe(false);
    const again = await open(shoes, { session: { 'pagosya-filters-hidden': '1' } });
    expect(again.q('.catalog-filters').hasAttribute('data-filters-hidden')).toBe(true);
  });

  it('«Recoger hoy» is the first filter only with a pickup location, and leaves out what is sold out', async () => {
    const none = await open(shoes);
    expect(none.q('[data-filter-toggle="recoger"]')).toBeNull();
    const { q, all, click } = await open(shoes, { data: pickup });
    const side = q('.catalog-filters__side');
    expect(side.querySelector('[data-filter-group]')?.getAttribute('data-filter-group')).toBe('recoger');
    expect(side.querySelector('[data-filter-toggle="recoger"]')?.textContent).toBe('Recoger hoy');
    click('.catalog-filters__side [data-filter-toggle="recoger"]');
    expect(all('[data-pagosya-catalog] .menu-item').map(card => card.dataset.productId)).toEqual(['a', 'c']);
    expect(q('.catalog-filters__side [data-filter-toggle="recoger"]').getAttribute('aria-checked')).toBe('true');
  });

  it('a product whose every colour is sold out is not «para recoger hoy»', async () => {
    const soldOut = colours(['Rojo', 'Azul']).map(v => ({ ...v, stock: 0 }));
    const { all, click } = await open([{ ...base, id: 'a', name: 'Vomero', variants: soldOut }, { ...base, id: 'c', name: 'Structure' }], { data: pickup });
    expect(all('[data-pagosya-catalog] .menu-item').length).toBe(2);
    click('.catalog-filters__side [data-filter-toggle="recoger"]');
    expect(all('[data-pagosya-catalog] .menu-item').map(card => card.dataset.productId)).toEqual(['c']);
  });

  it('a card shows its colour photos as a strip, up to 6 then «+N»; one photo or one colour shows none', async () => {
    const eight = colours(['Rojo', 'Azul', 'Negro', 'Blanco', 'Verde', 'Rosa', 'Gris', 'Oro']);
    const { card } = await open([{ ...base, id: 'a', name: 'Vomero', variants: eight }, { ...base, id: 'b', name: 'Pegasus', variants: colours(['Rojo']) }, { ...base, id: 'c', name: 'Structure' }]);
    const strip = card('a').querySelector('.menu-item__swatches--strip');
    expect(strip?.querySelectorAll('[data-card-swatch]').length).toBe(6);
    expect(strip.querySelector('img')?.getAttribute('src')).toBe('https://img.test/rojo.jpg');
    expect(strip.querySelector('.menu-item__swatches-more')?.textContent).toBe('+2');
    expect(card('b').querySelector('.menu-item__swatches')).toBeNull();
    expect(card('c').querySelector('.menu-item__swatches')).toBeNull();
  });

  it('pointing at or tapping a strip photo swaps the card photo and opens the product in that colour', async () => {
    const { w, card } = await open(shoes);
    const azul = card('a').querySelector('[data-card-swatch][data-card-colour="Azul"]');
    azul.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(card('a').querySelector('.menu-item__image').getAttribute('src')).toBe('https://img.test/azul.jpg');
    expect(azul.getAttribute('aria-pressed')).toBe('true');
    expect(card('a').querySelector('a.menu-item__details').getAttribute('href')).toContain('color=Azul');
    const negro = card('a').querySelector('[data-card-swatch][data-card-colour="Negro"]');
    negro.dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true }));
    expect(card('a').querySelector('.menu-item__image').getAttribute('src')).toBe('https://img.test/negro.jpg');
  });

  it('another filter style keeps its cards without the strip', async () => {
    const { q, card } = await open(shoes, { filterStyle: 'sidebar' });
    expect(q('.catalog-filters').getAttribute('data-filter-style')).toBe('sidebar');
    expect(q('.catalog-filters__head')).toBeNull();
    expect(card('a').querySelector('.menu-item__swatches')).toBeNull();
  });
});
