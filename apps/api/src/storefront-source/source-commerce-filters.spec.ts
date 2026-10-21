import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Showcase commerce §4 (spec 2026-10-19): sort and filter on the shop page, from the store's own data, state in the URL. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const p = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, name: id, amount, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], highlights: [], createdAt: '2026-10-01T00:00:00.000Z', ...extra });
const six = [p('a', 1000), p('b', 2000, { discountPercent: 10 }), p('c', 3000), p('d', 4000), p('e', 5000), p('f', 6000, { createdAt: '2026-10-18T00:00:00.000Z' })];
const shop = '<main data-pagosya-catalog data-catalog-full data-pagosya-filters></main>';

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });
const tick = () => new Promise(resolve => setImmediate(resolve));

async function open(items: any[], search = '', extra: { filterStyle?: string; categories?: any[] } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button>${shop}<section data-pagosya-cart></section></body></html>`, { url: `https://shop.test/productos.html${search}`, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  const store = { storeName: 'Antojo', checkoutMode: 'payment', items, ...(extra.categories ? { categories: extra.categories } : {}) };
  w.PAGOSYA_CONFIG = { slug: 'antojo', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', ...(extra.filterStyle ? { filterStyle: extra.filterStyle } : {}), data: store };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce);
  await tick();
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const ids = () => all('[data-pagosya-catalog] .menu-item').map(card => card.dataset.productId);
  return { w, q, all, ids };
}

describe('sort and filter', () => {
  it('no filters under 6 products', async () => {
    const { q } = await open(six.slice(0, 5));
    expect(q('.catalog-filters')).toBeNull();
  });

  it('shows only the filters the data supports, and every sort order', async () => {
    const { all } = await open(six);
    expect(all('.catalog-filters [data-filter-group]').map(group => group.dataset.filterGroup)).toEqual(['precio', 'descuento']);
    expect(all('.catalog-filters select[name=orden] option').map(option => option.value)).toEqual(['destacados', 'precio-asc', 'precio-desc', 'novedades', 'mejor-oferta']);
  });

  it('sorts by price and by newest', async () => {
    expect((await open(six, '?orden=precio-desc')).ids()[0]).toBe('f');
    expect((await open(six, '?orden=precio-asc')).ids()[0]).toBe('a');
    expect((await open(six, '?orden=novedades')).ids()[0]).toBe('f');
    expect((await open(six, '?orden=mejor-oferta')).ids()[0]).toBe('b');
  });

  it('filters by colour and size from variants and shows the active filter', async () => {
    const v = (value: string, group = 'Color') => ({ id: value, name: value, amount: 1000, options: [{ name: group, value }] });
    const items = [...six, p('m', 1500, { variants: [v('Rojo'), v('Azul')] }), p('n', 1500, { variants: [v('M', 'Talla')] })];
    const red = await open(items, '?f_color=rojo');
    expect(red.ids()).toEqual(['m']);
    expect(red.q('.catalog-filters__active').textContent).toContain('Rojo');
    const size = await open(items, '?f_talla=m');
    expect(size.ids()).toEqual(['n']);
  });

  it('changing a filter writes the URL and re-renders', async () => {
    const { q, w, ids } = await open(six);
    const box = q('.catalog-filters input[name=descuento]');
    box.checked = true; box.dispatchEvent(new w.Event('change', { bubbles: true })); await tick();
    expect(w.location.search).toContain('descuento=1');
    expect(ids()).toEqual(['b']);
  });

  it('option names group regardless of case and accents — Review Focus 3', async () => {
    const v = (name: string, value: string) => ({ id: name + value, name: value, amount: 1000, options: [{ name, value }] });
    const items = [...six, p('x', 1500, { variants: [v('TALLA', 'S')] }), p('y', 1500, { variants: [v('talla', 'M')] }), p('z', 1500, { variants: [v('Colour', 'Red')] })];
    const { all, q } = await open(items);
    expect(all('.catalog-filters [data-filter-group]').map(group => group.dataset.filterGroup).filter(key => key === 'talla')).toHaveLength(1);
    expect(q('[data-filter-group="colour"] [data-swatch]')).not.toBeNull();
  });

  it('zero results says so and offers to clear', async () => {
    const { q } = await open(six, '?precio=90-95');
    expect(q('.catalog-empty').textContent).toContain('No hay productos con estos filtros');
    expect(q('[data-filters-clear]')).not.toBeNull();
  });

  it('chooses the sidebar for a big catalog and the chip bar for a small one', async () => {
    expect((await open(six)).q('.catalog-filters').dataset.filtersLayout).toBe('bar');
    const nine = [...six, p('g', 7000), p('h', 8000), p('i', 9000)];
    expect((await open(nine)).q('.catalog-filters').dataset.filtersLayout).toBe('sidebar');
  });
});

/** Amendment 2026-10-21: a search bar on the catalogue, the same match rule as buscar.html. */
describe('search', () => {
  const items = [p('a', 1000, { name: 'Vestido de Seda', categoryId: 'c1' }), p('b', 2000, { name: 'Falda', description: 'seda natural' }), p('c', 3000, { name: 'Corsé', tags: ['nocturno'] }),
    p('d', 4000, { name: 'Abrigo' }), p('e', 5000, { name: 'Pañuelo' }), p('f', 6000, { name: 'Blusa', categoryId: 'c2' })];
  const cats = [{ id: 'c1', name: 'Novias' }, { id: 'c2', name: 'Noche' }];
  const field = (env: any) => env.q('.catalog-search input[name=q]');
  const type = async (env: any, text: string) => {
    const input = field(env); input.focus(); input.value = text; input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new env.w.Event('input', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 220));
  };
  it('filters as you type, ignoring case and accents, every word required, and keeps the focus and caret', async () => {
    const env = await open(items, '', { categories: cats });
    await type(env, 'SEDA');
    expect(env.ids()).toEqual(['a', 'b']);
    expect(env.w.document.activeElement).toBe(field(env));
    expect(field(env).selectionStart).toBe(4);
    await type(env, 'seda vestido');
    expect(env.ids()).toEqual(['a']);
    await type(env, 'corse');
    expect(env.ids()).toEqual(['c']);
    expect(env.w.location.search).toContain('q=corse');
  });
  it('matches tags and category names, and a reload with ?q= restores it with its chip', async () => {
    const env = await open(items, '?q=nocturno', { categories: cats });
    expect(env.ids()).toEqual(['c']);
    expect(field(env).value).toBe('nocturno');
    expect(env.q('[data-filter-remove="q:"]').textContent).toContain('nocturno');
    expect((await open(items, '?q=noche', { categories: cats })).ids()).toEqual(['f']);
  });
  it('✕, Esc and «Borrar todo» clear the search; «Borrar todo» keeps the sort', async () => {
    const cross = await open(items, '?q=seda');
    cross.q('[data-search-clear]').click(); await tick();
    expect(cross.w.location.search).not.toContain('q=');
    expect(cross.ids()).toHaveLength(6);
    const esc = await open(items, '?q=seda');
    field(esc).dispatchEvent(new esc.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 220));
    expect(esc.ids()).toHaveLength(6);
    const all = await open(items, '?q=seda&orden=precio-desc');
    all.q('[data-filters-clear]').click(); await tick();
    expect(all.w.location.search).toBe('?orden=precio-desc');
  });
  it('no results says so, offers to clear the search, and the filters too when some are on — Review Focus 2', async () => {
    const only = await open(items, '?q=zzz');
    expect(only.q('.catalog-empty').textContent).toContain('Sin resultados para “zzz”');
    expect(only.q('.catalog-empty [data-search-clear]')).not.toBeNull();
    expect(only.q('.catalog-empty [data-filters-clear]')).toBeNull();
    const both = await open(items, '?q=zzz&precio=10-20');
    expect(both.q('.catalog-empty [data-filters-clear]')).not.toBeNull();
    both.q('.catalog-empty [data-search-clear]').click(); await tick();
    expect(both.w.location.search).toBe('?precio=10-20');
  });
  it('cuts the search at 80 characters', async () => {
    const env = await open(items, `?q=${'a'.repeat(120)}`);
    expect(field(env).value).toHaveLength(80);
  });
});

