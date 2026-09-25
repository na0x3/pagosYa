import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** T1: store-authored templates for the product page, cart, cart lines, added notice and checkout review. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'lamp', name: 'Lámpara Luna', amount: 42000, currency: 'BOB', stock: 2, imageUrls: ['https://cdn.test/lamp.jpg'], description: 'Luz cálida' },
  { id: 'desk', name: 'Mesa de roble', amount: 90000, currency: 'BOB', stock: 5, imageUrls: [] },
];
const HEADER = '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section>';
const SLOTS = '<section data-pagosya-cart hidden></section><p data-pagosya-status></p>';
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop().close(); });

function boot(templates: string, options: { cart?: Array<{ id: string; quantity: number }>; items?: unknown[]; body?: string } = {}) {
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${options.body ?? HEADER + SLOTS}${templates}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Luz', items: options.items ?? ITEMS, categories: [] };
  w.PAGOSYA_CONFIG = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const $ = (selector: string) => w.document.querySelector(selector);
  const $$ = (selector: string) => [...w.document.querySelectorAll(selector)];
  const flag = (name: string) => w.document.documentElement.dataset[name];
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  return { w, $, $$, flag, tick, errors };
}

const LINE = `<template data-pagosya-cart-line-template><li class="mi-linea"><img data-cart-field="photo" alt=""><h4 data-cart-field="name">Nombre falso</h4><p data-cart-field="option"></p><p data-cart-field="unit"></p><p data-cart-field="stock"></p><strong data-cart-field="line-total">Bs 1,00</strong><div data-cart-field="quantity">9</div><button data-cart-field="remove">Quitar</button></li></template>`;

describe('cart line template', () => {
  it('fills each line from the kit: name, real line total, photo, stock, the kit quantity controls', async () => {
    const shop = boot(LINE, { cart: [{ id: 'lamp', quantity: 2 }] });
    await shop.tick();
    const line = shop.$('[data-pagosya-cart] .mi-linea')!;
    expect(line.querySelector('[data-cart-field="name"]').textContent).toBe('Lámpara Luna');
    expect(line.querySelector('[data-cart-field="line-total"]').textContent).toMatch(/840/);
    expect(line.querySelector('[data-cart-field="line-total"]').textContent).not.toContain('1,00');
    expect(line.querySelector('[data-cart-field="photo"]').getAttribute('src')).toBe('https://cdn.test/lamp.jpg');
    expect(line.querySelector('[data-cart-field="stock"]').textContent).toBe('Últimas 2 unidades');
    expect(line.querySelector('[data-cart-field="option"]').hidden).toBe(true);
    const quantity = line.querySelector('[data-cart-field="quantity"]');
    expect(quantity.textContent).not.toContain('9');
    expect(quantity.querySelector('output').textContent).toBe('2');
    // Stock is 2 and the line already holds 2: the kit's own "+" stays disabled inside the template.
    expect(quantity.querySelector('[data-add="lamp"]').disabled).toBe(true);
    expect(shop.flag('cartLineTemplateInvalid')).toBeUndefined();
  });

  it('removes the whole line with the template remove button, and − still removes one unit', async () => {
    const shop = boot(LINE, { cart: [{ id: 'lamp', quantity: 2 }, { id: 'desk', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-pagosya-cart] [data-remove="lamp"]').click();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="lamp"] output').textContent).toBe('1');
    shop.$('[data-pagosya-cart] [data-remove-line="lamp"]').click();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="lamp"]')).toBeNull();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="desk"]')).not.toBeNull();
    expect(shop.$('[data-cart-count]').textContent).toBe('1');
  });

  it('is ignored when a required field is missing: default lines render and the invalid flag is set', async () => {
    const shop = boot('<template data-pagosya-cart-line-template><li><h4 data-cart-field="name"></h4></li></template>', { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    expect(shop.$('[data-pagosya-cart] li.order-item .order-item__head strong').textContent).toBe('Lámpara Luna');
    expect(shop.flag('cartLineTemplateInvalid')).toBe('true');
  });

  it('reads a React-rendered template whose children sit on the element instead of its content', async () => {
    const shop = boot('', { cart: [{ id: 'lamp', quantity: 1 }], body: HEADER + SLOTS + '<template data-pagosya-cart-line-template></template>' });
    const tpl = shop.$('template[data-pagosya-cart-line-template]')!;
    const li = shop.w.document.createElement('li');
    li.className = 'mi-linea';
    li.innerHTML = '<span data-cart-field="name"></span><b data-cart-field="line-total"></b><div data-cart-field="quantity"></div>';
    tpl.appendChild(li);
    shop.$('[data-cart-open]').click();
    await shop.tick();
    expect(shop.$('.cart-drawer .mi-linea [data-cart-field="name"]').textContent).toBe('Lámpara Luna');
  });
});
