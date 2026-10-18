import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** A store that wraps its cart mount in its own `.cart-drawer` element must not get the kit drawer's fixed, full-screen
 * styles on that wrapper: with a "page" cart DNA the closed wrapper was an invisible layer over the whole page that
 * swallowed scrolling and clicks (baek nje0ay4a r3). Only the runtime's dialog is the drawer. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const windows: any[] = [];
const errors: Error[] = [];
async function open(body: string) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|Not implemented: window\.getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  w.matchMedia = () => ({ matches: true });
  const data = { storeName: 'Marca', checkoutMode: 'payment', items: [{ id: 'pan', name: 'Pan', amount: 1500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] }] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return w.document as any;
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

describe('authored cart wrapper named .cart-drawer', () => {
  it('leaves the runtime dialog as the only .cart-drawer', async () => {
    const doc = await open('<div class="cart-drawer shop-cart" aria-label="Tu pedido"><div data-pagosya-cart></div></div>');
    expect(Array.from(doc.querySelectorAll('.cart-drawer'), (el: any) => el.tagName)).toEqual(['DIALOG']);
    // The store's other classes on its wrapper stay.
    expect(doc.querySelector('.shop-cart')).not.toBeNull();
  });

  it('still opens the cart in the dialog', async () => {
    const doc = await open('<div class="cart-drawer"><div data-pagosya-cart></div></div>');
    doc.querySelector('[data-cart-open]').click();
    const drawer = doc.querySelector('dialog.cart-drawer');
    expect(drawer?.hasAttribute('open')).toBe(true);
    expect(drawer?.querySelector('[data-pagosya-cart]')).not.toBeNull();
  });

  // The Bake Lab 1vz7qsns 2026-10-17: YAPI wrote the mount itself as <aside class="cart-drawer" data-pagosya-cart> with a
  // designed empty state inside; once the class was stripped it sat in the page, full width, cart lines and all.
  it('keeps a mount the design named the drawer out of the page, and shows it only inside the dialog', async () => {
    const doc = await open('<aside class="cart-drawer" data-pagosya-cart aria-label="Tu pedido"><div class="empty-state"><h2>Tu pedido está vacío.</h2></div></aside>');
    const mount = doc.querySelector('aside[data-pagosya-cart]');
    expect(mount.style.getPropertyValue('display')).toBe('none');
    doc.querySelector('[data-cart-open]').click();
    const drawer = doc.querySelector('dialog.cart-drawer');
    expect(drawer.querySelector('aside[data-pagosya-cart]')).toBe(mount);
    expect(mount.style.getPropertyValue('display')).toBe('block');
    drawer.close(); drawer.dispatchEvent(new doc.defaultView.Event('close'));
    expect(mount.parentElement).toBe(doc.body);
    expect(mount.style.getPropertyValue('display')).toBe('none');
  });

  it('hides a wrapper named the drawer, with its heading, while its mount moves into the dialog', async () => {
    const doc = await open('<div class="cart-drawer shop-cart"><h2>Tu pedido</h2><div data-pagosya-cart></div></div>');
    expect(doc.querySelector('.shop-cart').style.getPropertyValue('display')).toBe('none');
    doc.querySelector('[data-cart-open]').click();
    expect(doc.querySelector('dialog.cart-drawer [data-pagosya-cart]')).not.toBeNull();
  });

  // The Bake Lab 2026-10-17: its floating .store-status chip repeated «… añadido a tu caja.» beside the kit's added notice.
  it('says «added» once: the notice speaks, the page status line stays empty', async () => {
    const doc = await open('<p class="store-status" data-pagosya-status role="status"></p><div data-pagosya-cart></div>');
    await new Promise(resolve => setTimeout(resolve, 50));
    doc.querySelector('.menu-add').click();
    expect(doc.querySelector('.cart-added').textContent).toContain('Pan añadido a');
    expect(doc.querySelector('[data-pagosya-status]').textContent).toBe('');
  });
});

