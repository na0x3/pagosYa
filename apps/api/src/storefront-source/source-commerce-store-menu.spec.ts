import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Dropdown menu (spec 2026-10-21): the kit draws the store menu from config.header.menu and runs its tabs, hover and keys. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const item = (id: string, categoryId: string) => ({ id, name: id, amount: 1000, currency: 'BOB', stock: null, categoryId, imageUrls: [`https://api.test/${id}.jpg`], variants: [], extras: [], highlights: [] });
const DATA = {
  storeName: 'Noa', contactPhone: '+591 70000000',
  categories: [{ id: 'C1', name: 'Vestidos' }, { id: 'c2', name: 'Sastrería' }, { id: 'c3', name: 'Seda' }, { id: 'c4', name: 'Punto' }, { id: 'empty', name: 'Vacía' }],
  items: [item('a', 'C1'), item('b', 'c2'), item('c', 'c3'), item('d', 'c4')],
};
const HOST = '<header class="host"><div data-pagosya-store-menu="toggle"></div><button data-store-menu-replaces>Viejo</button><a href="index.html">Noa</a><div data-pagosya-store-menu="links"></div><nav data-store-menu-replaces><a href="index.html">Inicio</a><a href="index.html#historia">Nuestra historia</a></nav></header>';

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open({ menu, data = DATA, host = HOST, extra = {} }: { menu?: unknown; data?: any; host?: string; extra?: Record<string, unknown> } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${host}<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /min-width/.test(query), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...extra, ...(menu ? { header: { menu } } : {}) };
  const quote = { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  const key = (target: any, name: string, extra: object = {}) => target.dispatchEvent(new w.KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }));
  const pointer = (target: any, type: string, pointerType = 'mouse') => { const event = new w.Event(type, { bubbles: false }); Object.defineProperty(event, 'pointerType', { value: pointerType }); target.dispatchEvent(event); };
  return { w, q, all, key, pointer };
}

describe('store menu', () => {
  it('stays off without config.header.menu', async () => {
    const { q } = await open();
    expect(q('[data-pagosya-store-menu="toggle"]').innerHTML).toBe('');
    expect(q('header').hasAttribute('data-store-menu')).toBe(false);
  });

  it('builds the default menu from the categories with products and the host links', async () => {
    const { q, all } = await open({ menu: { style: 'panel' } });
    expect(q('header').getAttribute('data-store-menu')).toBe('panel');
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Tienda', 'Descubre']);
    const shop = all('.pym-group')[0];
    expect([...shop.querySelectorAll('.pym-links a')].map((a: any) => a.textContent)).toEqual(['Novedades', 'Vestidos', 'Sastrería', 'Seda', 'Punto', 'Todos los productos']);
    expect(shop.querySelector('.pym-links a[href*="f_categoria=c1"]')).not.toBeNull();
    expect(shop.querySelectorAll('.pym-tiles img')).toHaveLength(3);
    expect(shop.querySelector('.pym-tiles-title').textContent).toBe('Por categoría');
    expect(shop.querySelector('.pym-footer').textContent).toBe('Ver toda la tienda');
    const discover = [...all('.pym-group')[1].querySelectorAll('.pym-links a')].map((a: any) => a.textContent);
    expect(discover).toContain('Nuestra historia');
    expect(discover).not.toContain('Inicio');
    expect(discover).toContain('Contacto');
  });

  // Owner 2026-10-30 («dropdown menus now dont have pictures»): a group the build wrote without tiles shows the first product
  // photo of each category or collection its links point to.
  it('a dropdown group without tiles shows a photo for each category it links to', async () => {
    const { all } = await open({ menu: { style: 'dropdowns', groups: [{ label: 'Novias', links: [{ label: 'Vestidos', to: 'category:C1' }, { label: 'Sastrería', to: 'category:c2' }, { label: 'Vacía', to: 'category:empty' }, { to: 'all' }] }] } });
    expect(all('.pym-tiles img').map(img => img.getAttribute('src'))).toEqual(['https://api.test/a.jpg', 'https://api.test/b.jpg']);
    expect(all('.pym-tiles a').map(a => a.textContent.trim())).toEqual(['Vestidos', 'Sastrería']);
  });

  // Review 2026-10-30: «Ver todo» (the whole collection) and the first category point at the same photo; each photo shows once.
  it('a dropdown fallback never shows the same photo twice', async () => {
    const data = { ...DATA, collections: [{ id: 'k1', slug: 'mujer', name: 'Mujer', productIds: ['a', 'b'] }] };
    const { all } = await open({ data, menu: { style: 'dropdowns', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'collection:mujer/category:C1' }, { label: 'Sastrería', to: 'collection:mujer/category:c2' }, { label: 'Ver todo', to: 'collection:mujer' }, { label: 'Vestidos otra vez', to: 'category:C1' }] }] } });
    expect(all('.pym-tiles img').map(img => img.getAttribute('src'))).toEqual(['https://api.test/a.jpg', 'https://api.test/b.jpg']);
  });

  it('shows tiles in the Studio preview, where photos are data URLs (live check 2026-10-21, NOA VARGAS)', async () => {
    const photo = 'data:image/jpeg;base64,/9j/AA==';
    const data = { ...DATA, items: DATA.items.map(entry => ({ ...entry, imageUrls: [photo] })) };
    const { all } = await open({ menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:C1' }], tiles: [{ title: 'Vestidos', image: photo, to: 'category:C1' }, { title: 'Otro', image: 'javascript:alert(1)', to: 'category:C1' }] }] }, data });
    expect(all('.pym-tiles img').map(img => img.getAttribute('src'))).toEqual([photo]);
    const { all: fallback } = await open({ menu: { style: 'panel' }, data });
    expect(fallback('.pym-tiles img')).toHaveLength(3);
  });

  it('draws the merchant groups, dropping targets the live store no longer has', async () => {
    const { all } = await open({ menu: { style: 'panel', groups: [
      { label: 'Mujer', links: [{ label: 'Vestidos', to: 'category:C1' }, { label: 'Borrada', to: 'category:gone' }, { label: 'Vacía', to: 'category:empty' }],
        tilesTitle: 'Por estilo', tiles: [{ title: 'Vestidos', image: 'https://api.test/a.jpg', to: 'category:C1' }, { title: 'Borrada', image: 'https://api.test/b.jpg', to: 'category:gone' }], footer: { label: 'Ver toda la tienda', to: 'all' } },
      { label: 'Fantasma', links: [{ label: 'Borrada', to: 'category:gone' }] },
    ] } });
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Mujer']);
    expect(all('.pym-links a').map(a => a.textContent)).toEqual(['Vestidos']);
    expect(all('.pym-tiles a').map(a => a.textContent)).toEqual(['Vestidos']);
  });

  it('falls back to the default when no saved link is left', async () => {
    const { all } = await open({ menu: { style: 'panel', groups: [{ label: 'Mujer', links: [{ label: 'Borrada', to: 'category:gone' }] }] } });
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Tienda', 'Descubre']);
  });

  it('opens from ☰, moves between tabs with the arrows, closes on Esc and gives focus and scroll back', async () => {
    const { w, q, all, key } = await open({ menu: { style: 'panel' } });
    w.document.documentElement.style.overflow = 'clip';
    const toggle = q('[data-store-menu-toggle]');
    toggle.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(w.document.documentElement.style.overflow).toBe('hidden');
    const tabs = all('[role=tab]');
    expect(w.document.activeElement).toBe(tabs[0]);
    key(tabs[0], 'ArrowRight');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(w.document.activeElement).toBe(tabs[1]);
    expect(all('.pym-group')[0].hidden).toBe(true);
    expect(all('.pym-group')[1].hidden).toBe(false);
    key(tabs[1], 'ArrowRight');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    key(w.document, 'Escape');
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    expect(w.document.activeElement).toBe(toggle);
    expect(w.document.documentElement.style.overflow).toBe('clip');
  });

  it('keeps Tab inside the open panel', async () => {
    const { w, q, key } = await open({ menu: { style: 'panel' } });
    q('[data-store-menu-toggle]').click();
    const items = [...q('[data-store-menu-panel]').querySelectorAll('a[href],button')].filter((el: any) => !el.closest('[hidden]'));
    (items.at(-1) as any).focus();
    key(items.at(-1), 'Tab');
    expect(w.document.activeElement).toBe(items[0]);
    key(items[0], 'Tab', { shiftKey: true });
    expect(w.document.activeElement).toBe(items.at(-1));
  });

  it('dropdowns: top links open after 120 ms of hover, stay while the pointer moves into the panel, close 200 ms after it leaves', async () => {
    const { q, all, pointer } = await open({ menu: { style: 'dropdowns' } });
    expect(q('header').hasAttribute('data-store-menu-links')).toBe(true);
    const tops = all('[data-store-menu-top]');
    expect(tops.map(top => top.textContent)).toEqual(['Tienda', 'Descubre']);
    const panel = q('[data-store-menu-panel]');
    pointer(tops[1], 'pointerenter');
    await sleep(60);
    expect(panel.hidden).toBe(true);
    await sleep(100);
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('data-mode')).toBe('dropdown');
    expect(all('.pym-group')[1].hidden).toBe(false);
    pointer(tops[1], 'pointerleave');
    await sleep(80);
    pointer(panel, 'pointerenter');
    await sleep(200);
    expect(panel.hidden).toBe(false);
    pointer(panel, 'pointerleave');
    await sleep(240);
    expect(panel.hidden).toBe(true);
  });

  it('dropdowns: touch never opens on hover; a click opens and a second click closes', async () => {
    const { q, all, pointer } = await open({ menu: { style: 'dropdowns' } });
    const top = all('[data-store-menu-top]')[0];
    pointer(top, 'pointerenter', 'touch');
    await sleep(160);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    expect(top.getAttribute('aria-expanded')).toBe('true');
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('a host without a links mount gets the panel even for dropdowns', async () => {
    const { q, all } = await open({ menu: { style: 'dropdowns' }, host: '<header><div data-pagosya-store-menu="toggle"></div></header>' });
    expect(q('header').hasAttribute('data-store-menu-links')).toBe(false);
    expect(all('[data-store-menu-toggle]')).toHaveLength(1);
  });

  it('copies the host extras (Buscar, Mi cuenta) into the panel', async () => {
    const { all } = await open({ menu: { style: 'panel' }, host: '<header><div data-pagosya-store-menu="toggle"></div><div hidden><div data-store-menu-extra><a href="buscar.html">Buscar</a><a href="#" data-pagosya-account="login">Mi cuenta</a></div></div></header>' });
    expect(all('.pym-extras a').map(a => a.textContent)).toEqual(['Buscar', 'Mi cuenta']);
  });

  it('a second render (pagosya:ready) neither duplicates the menu nor leaves it open or locked', async () => {
    const { w, q, all } = await open({ menu: { style: 'panel' } });
    q('[data-store-menu-toggle]').click();
    w.pagosyaStoreMenu.render();
    expect(all('[data-store-menu-panel]')).toHaveLength(1);
    expect(all('[data-store-menu-toggle]')).toHaveLength(1);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
    expect(w.document.documentElement.style.overflow).toBe('');
  });

  it('Escape with the menu closed does nothing (the photo viewer owns its own Escape)', async () => {
    const { w, q } = await open({ menu: { style: 'panel' } });
    const event = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    w.document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('ships a reduced-motion rule and closes when a link is chosen', async () => {
    const { w, q } = await open({ menu: { style: 'panel' } });
    expect(q('style[data-pagosya-store-menu-style]').textContent).toMatch(/prefers-reduced-motion:\s*reduce/);
    q('[data-store-menu-toggle]').click();
    q('.pym-links a').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('a showcase (no online shop) never links the shop pages (final review 2026-10-21)', async () => {
    const { all } = await open({ menu: { style: 'panel' }, extra: { sitePurpose: 'service' } });
    expect(all('[role=tab]').map(tab => tab.textContent)).toEqual(['Descubre']);
    expect(all('.pym-panel a').map(a => a.getAttribute('href')).filter(href => /productos|coleccion|envios|reembolsos/.test(href))).toEqual([]);
    const { all: own } = await open({ menu: { style: 'panel', groups: [{ label: 'Tienda', links: [{ label: 'Todo', to: 'all' }, { label: 'Vestidos', to: 'category:C1' }] }] }, extra: { sitePurpose: 'service' } });
    expect(own('[role=tab]').map(tab => tab.textContent)).toEqual(['Descubre']);
  });

  it('dropdowns: a click after the hover opened it keeps it open; the next click closes (final review 2026-10-21)', async () => {
    const { q, all, pointer } = await open({ menu: { style: 'dropdowns' } });
    const top = all('[data-store-menu-top]')[0];
    pointer(top, 'pointerenter');
    await sleep(160);
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    pointer(top, 'pointerleave');
    await sleep(240);
    expect(q('[data-store-menu-panel]').hidden).toBe(false);
    top.click();
    expect(q('[data-store-menu-panel]').hidden).toBe(true);
  });

  it('the side rail places the panel beside the rail, not under it (final review 2026-10-21)', async () => {
    const { q } = await open({ menu: { style: 'panel' } });
    expect(q('style[data-pagosya-store-menu-style]').textContent).toMatch(/\.pyh--side-rail \.pym-panel\{position:fixed;top:0;left:88px/);
  });
});
