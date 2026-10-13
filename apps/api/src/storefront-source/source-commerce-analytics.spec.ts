import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { ANALYTICS_EVENT_TYPES, ANALYTICS_TRACK_LABELS } from '../store-analytics/store-analytics.constants';

/** G1: the kit hands allow-listed analytics events to the hosting page (never to the network itself): hosted only,
 * batched into one `pagosya:analytics` message, flushed on pagehide. Consent and sessions live in the host. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'lamp', name: 'Lámpara Luna', amount: 42000, currency: 'BOB', stock: 5, imageUrls: [] },
  { id: 'desk', name: 'Mesa de roble', amount: 90000, currency: 'BOB', stock: 5, imageUrls: [] },
];
const BODY = '<header><a href="#catalogo" data-track="hero-cta">Ver colección</a><a href="#x" data-track="buy-now">Otro</a><button data-cart-open data-track="nav-cart">Pedido (<span data-cart-count>0</span>)</button><a href="https://wa.me/59170000000">WhatsApp</a><input type="search" aria-label="Buscar"></header><section data-pagosya-catalog></section><section data-pagosya-cart hidden></section><p data-pagosya-status></p>';

type Message = { type: string; events?: Record<string, unknown>[] };
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop()!.close(); });

function boot({ hosted = true, settings = {} as Record<string, unknown>, page = 'index.html' } = {}) {
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${BODY}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const observed: any[] = [];
  let intersect: (entries: { target: any; isIntersecting: boolean }[]) => void = () => {};
  w.IntersectionObserver = class { constructor(callback: typeof intersect) { intersect = callback; } observe(el: any) { observed.push(el); } unobserve() {} disconnect() {} };
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_HOSTED = hosted;
  w.PAGOSYA_PREVIEW_PAGE = page;
  w.PAGOSYA_PREVIEW_QUERY = '';
  const data = { storeName: 'Luz', items: ITEMS, categories: [], ...settings };
  w.PAGOSYA_CONFIG = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.PAGOSYA_HOSTED_REQUEST = jest.fn(async (action: string) => ({ ok: true, body: action === 'lead' ? { submitted: true } : {} }));
  const messages: Message[] = [];
  w.postMessage = (message: Message) => { messages.push(message); };
  w.eval(commerce);
  const $ = (selector: string) => w.document.querySelector(selector);
  const click = (selector: string) => { expect($(selector)).not.toBeNull(); $(selector).click(); };
  const flush = () => { w.dispatchEvent(new w.Event('pagehide')); return messages.filter(m => m.type === 'pagosya:analytics'); };
  const events = () => flush().flatMap(m => m.events || []);
  return { w, $, click, flush, events, messages, observed, intersect: (targets: any[]) => intersect(targets.map(target => ({ target, isIntersecting: true }))), errors };
}

describe('kit analytics events (hosted stores)', () => {
  it('counts the page view with its page file, and hands everything over in one message on pagehide', () => {
    const shop = boot({ page: 'index.html' });
    const batches = shop.flush();
    expect(batches).toHaveLength(1);
    expect(batches[0].events).toEqual([{ type: 'page_view', path: 'index.html' }]);
    expect(shop.flush()).toHaveLength(1);
  });

  it('batches on a short timer too', async () => {
    const shop = boot();
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(shop.flush().length).toBeGreaterThanOrEqual(1);
  });

  it('names authored calls to action by their allow-listed data-track label only, even on the cart button', () => {
    const shop = boot();
    shop.click('[data-track="hero-cta"]'); shop.click('[data-track="buy-now"]'); shop.click('[data-track="nav-cart"]');
    const events = shop.events();
    expect(events.filter(e => e.type === 'cta_click')).toEqual([{ type: 'cta_click', target: 'hero-cta', path: 'index.html' }, { type: 'cta_click', target: 'nav-cart', path: 'index.html' }]);
    expect(events.filter(e => e.type === 'cart_open')).toHaveLength(1);
    expect(shop.$('.cart-drawer').open).toBe(true);
  });

  it('tells a card click from an add, and views a product once per page', () => {
    const shop = boot();
    const lamp = [...shop.w.document.querySelectorAll('.menu-item')].find((card: any) => card.textContent.includes('Lámpara'));
    lamp.querySelector('.menu-item__details').click();
    shop.$('.product-detail [data-product-close]')?.click();
    lamp.querySelector('.menu-item__details').click();
    lamp.querySelector('.menu-add').click();
    const events = shop.events().filter(e => e.type !== 'page_view');
    expect(events.filter(e => e.type === 'product_card_click')).toEqual([{ type: 'product_card_click', productId: 'lamp', path: 'index.html' }, { type: 'product_card_click', productId: 'lamp', path: 'index.html' }]);
    expect(events.filter(e => e.type === 'product_view')).toEqual([{ type: 'product_view', productId: 'lamp', path: 'index.html' }]);
    expect(events.filter(e => e.type === 'add_to_cart')).toEqual([{ type: 'add_to_cart', productId: 'lamp', path: 'index.html' }]);
  });

  it('marks the checkout review once and the pay click', async () => {
    const shop = boot();
    shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]'); shop.click('.cart-drawer [data-checkout]');
    shop.w.dispatchEvent(new shop.w.HashChangeEvent('hashchange'));
    shop.click('[data-checkout-review] [data-pay]');
    await new Promise(resolve => setImmediate(resolve));
    const types = shop.events().map(e => e.type === 'checkout_step' ? `step:${e.step}` : e.type);
    // The cart button carries data-track="nav-cart" in this fixture, so the open is also a named CTA click.
    expect(types).toEqual(['page_view', 'add_to_cart', 'cta_click', 'cart_open', 'step:review', 'pay_click']);
  });

  it('counts the WhatsApp checkout and WhatsApp links', () => {
    const shop = boot({ settings: { checkoutMode: 'whatsapp', contactPhone: '59170000000' } });
    shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]'); shop.click('.cart-drawer [data-checkout]');
    shop.click('[data-checkout-review] [data-pay]');
    shop.$('a[href^="https://wa.me"]').addEventListener('click', (event: Event) => event.preventDefault());
    shop.click('header a[href^="https://wa.me"]');
    const types = shop.events().map(e => e.type);
    expect(types.filter(type => type === 'whatsapp_click')).toHaveLength(2);
    expect(types).toContain('pay_click');
  });

  it('counts a sent contact form and a committed search, never the words', async () => {
    const shop = boot({ settings: { contactFormEnabled: true } });
    const form = shop.$('[data-pagosya-contact] form');
    // Hosted: name and email are asked by pagosYa's secure form outside the design; only the message stays here.
    for (const [name, value] of [['name', 'Ana'], ['email', 'ana@test.test'], ['message', 'Hola']]) { const field = form.querySelector(`[name=${name}]`); if (field) field.value = value; }
    form.dispatchEvent(new shop.w.Event('submit', { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    const search = shop.$('input[type=search]'); search.value = 'zapatos rojos';
    search.dispatchEvent(new shop.w.Event('change', { bubbles: true }));
    const events = shop.events();
    expect(events.filter(e => e.type === 'contact_submit')).toEqual([{ type: 'contact_submit', path: 'index.html' }]);
    expect(events.filter(e => e.type === 'search')).toEqual([{ type: 'search', path: 'index.html' }]);
    expect(JSON.stringify(events)).not.toMatch(/zapatos|ana@test/);
  });

  it('reports a card impression once per product on this page', () => {
    const shop = boot();
    const cards = [...shop.w.document.querySelectorAll('[data-pagosya-catalog] .menu-item')];
    expect(shop.observed).toEqual(cards);
    shop.intersect(cards); shop.intersect(cards);
    expect(shop.events().filter(e => e.type === 'product_card_impression').map(e => e.productId)).toEqual(['lamp', 'desk']);
  });

  it('emits only allow-listed types', () => {
    const shop = boot();
    shop.click('[data-track="hero-cta"]'); shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]');
    for (const event of shop.events()) expect(ANALYTICS_EVENT_TYPES).toContain(event.type);
  });

  it('hands the host page no funnel steps: the steps travel as analytics events only', async () => {
    const shop = boot();
    shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]'); shop.click('.cart-drawer [data-checkout]');
    shop.w.dispatchEvent(new shop.w.HashChangeEvent('hashchange'));
    shop.click('[data-checkout-review] [data-pay]');
    await new Promise(resolve => setImmediate(resolve));
    expect(shop.messages.filter(message => message.type === 'pagosya:funnel')).toEqual([]);
    expect(shop.events().map(e => e.type)).toEqual(expect.arrayContaining(['add_to_cart', 'checkout_step', 'pay_click']));
  });
});

describe('kit analytics outside a hosted store', () => {
  it('sends nothing from a preview, a demo or a store served without pagosYa', () => {
    const shop = boot({ hosted: false });
    shop.click('[data-track="hero-cta"]'); shop.click('[data-add="lamp"]'); shop.click('[data-cart-open]');
    expect(shop.flush()).toEqual([]);
    expect(shop.observed).toEqual([]);
  });
});

it('keeps the kit label list equal to the API allow-list', () => {
  const list = /const ANALYTICS_LABELS = (\[[^\]]*\]);/.exec(commerce)?.[1];
  expect(list && JSON.parse(list.replace(/'/g, '"'))).toEqual([...ANALYTICS_TRACK_LABELS]);
});
