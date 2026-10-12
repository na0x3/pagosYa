import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';

/** Account, checkout and the cart path drawn per store (spec 2026-10-11 commerce surfaces): the runtime side. Harness from
 * source-commerce-surfaces.spec.ts; jsdom has no layout, so these pin attributes, markup and CSS text. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const DNA_VALUES: Record<string, string[]> = runInNewContext(`(${commerce.match(/const DNA_VALUES = (\{[\s\S]*?\n {2}\});/)![1]})`);

type Boot = { w: any; doc: any; close: () => void };
const opened: Boot[] = [];
afterEach(() => { while (opened.length) opened.pop()!.close(); });

function boot(dna: Record<string, string> | undefined, options: { items?: unknown[]; body?: string; settings?: Record<string, unknown>; cart?: unknown[] } = {}): Boot {
  const body = options.body ?? '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = (query: string) => ({ matches: /reduce/.test(query) ? false : /hover/.test(query), addEventListener() {}, removeEventListener() {} });
  // jsdom has no <dialog> modality: record how the kit opens it.
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); (w as any).__modal = (w as any).__modal ?? []; (w as any).__modal.push(this); };
  w.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); (w as any).__shown = true; };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Marca', items: options.items ?? [] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(dna ? { dna } : {}), ...options.settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const handle = { w, doc: w.document, close: () => w.close() };
  opened.push(handle);
  return handle;
}

const DNA = { version: 1 as unknown as string, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };

import { COMMERCE_RUNTIME_ENUMS } from './design-engine/commerce-draw';
const COMMERCE_DNA: Record<string, string[]> = runInNewContext(`(${commerce.match(/const COMMERCE_DNA = (\{[\s\S]*?\});/)![1]})`);
const drawCss = (doc: any) => doc.querySelector('style[data-pagosya-kit="commerce-draw"]')?.textContent ?? '';

describe('commerce surfaces drawn per store (runtime)', () => {
  it('pins the runtime-only values to the API', () => {
    expect(COMMERCE_DNA).toEqual(Object.fromEntries(Object.entries(COMMERCE_RUNTIME_ENUMS).map(([k, v]) => [k, [...v]])));
    for (const name of Object.keys(COMMERCE_DNA)) expect(DNA_VALUES[name]).toBeUndefined();
  });
  it('sets data-dna-checkout and data-dna-fields for known values and ignores the rest', () => {
    const { doc } = boot({ ...DNA, checkout: 'steps', fields: 'pill' });
    expect([doc.documentElement.getAttribute('data-dna-checkout'), doc.documentElement.getAttribute('data-dna-fields')]).toEqual(['steps', 'pill']);
    const other = boot({ ...DNA, checkout: 'zigzag', fields: 'x' });
    expect([other.doc.documentElement.hasAttribute('data-dna-checkout'), other.doc.documentElement.hasAttribute('data-dna-fields')]).toEqual([false, false]);
  });
  it('adds no style and no attribute without the new keys (today unchanged)', () => {
    const { doc } = boot(DNA);
    expect(drawCss(doc)).toBe('');
    expect(doc.documentElement.hasAttribute('data-dna-checkout')).toBe(false);
    expect(doc.documentElement.style.getPropertyValue('--checkout-panel')).toBe('');
  });
  it('has rules for every checkout layout and field style, scoped to their attribute, 48px fields, no raw colours', () => {
    const css = drawCss(boot({ ...DNA, checkout: 'brand', fields: 'boxed' }).doc);
    for (const id of ['steps', 'ticket', 'brand']) expect(css).toContain(`[data-dna-checkout=${id}]`);
    for (const id of COMMERCE_RUNTIME_ENUMS.fields) expect(css).toContain(`[data-dna-fields=${id}]`);
    expect(css).toContain('min-height:48px');
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    // Checkboxes and radios (terms, delivery choice) keep their own look.
    expect(css).toContain(':not([type=checkbox],[type=radio])');
  });
  it('the brand panel uses a valid store photo and refuses anything else', () => {
    const ok = boot({ ...DNA, checkout: 'brand' }, { settings: { checkoutPhoto: 'assets/hero-1.jpg' } });
    expect(ok.doc.documentElement.style.getPropertyValue('--checkout-panel')).toContain('url("assets/hero-1.jpg")');
    for (const bad of ['assets/x.jpg") ; background:red', 'https://evil.test/x.jpg', 'assets/../x.jpg', 42]) {
      expect(boot({ ...DNA, checkout: 'brand' }, { settings: { checkoutPhoto: bad } }).doc.documentElement.style.getPropertyValue('--checkout-panel')).toBe('');
    }
    expect(boot({ ...DNA, checkout: 'ticket' }, { settings: { checkoutPhoto: 'assets/hero-1.jpg' } }).doc.documentElement.style.getPropertyValue('--checkout-panel')).toBe('');
  });
  it('the account submit follows the button DNA', () => {
    expect(commerce).toMatch(/const KIT_BUTTONS = '[^']*\[data-account-gate\] \[data-part=submit\]/);
  });
  it('names the drawer with the store\'s word, keeps "Tu pedido" without one, refuses markup', () => {
    expect(boot(DNA, { settings: { cartWord: 'Tu bolsa' } }).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu bolsa');
    expect(boot(DNA).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu pedido');
    expect(boot(DNA, { settings: { cartWord: '<b>x</b>' } }).doc.querySelector('#cart-drawer-title')?.textContent).toBe('Tu pedido');
  });
  it('rewrites the kit pages\' "Mi pedido (n)" link to the word, keeping the count element', () => {
    const body = '<header class="commerce-header"><nav><a href="checkout.html">Mi pedido (<span data-cart-count>0</span>)</a></nav></header><section data-pagosya-cart></section><p data-pagosya-status></p>';
    const link = boot(DNA, { body, settings: { cartWord: 'Tu ramo' } }).doc.querySelector('a[href="checkout.html"]');
    expect(link.textContent).toBe('Tu ramo (0)');
    expect(link.querySelector('[data-cart-count]')).not.toBeNull();
    expect(boot(DNA, { body }).doc.querySelector('a[href="checkout.html"]').textContent).toBe('Mi pedido (0)');
  });
  it('titles the kit pages\' order panel with the word', () => {
    const body = '<aside class="commerce-order" aria-label="Tu pedido"><h2>Tu pedido</h2><div data-pagosya-cart></div></aside><p data-pagosya-status></p>';
    const panel = boot(DNA, { body, settings: { cartWord: 'Tu caja' } }).doc.querySelector('aside.commerce-order');
    expect([panel.getAttribute('aria-label'), panel.querySelector('h2').textContent]).toEqual(['Tu caja', 'Tu caja']);
    expect(boot(DNA, { body }).doc.querySelector('aside.commerce-order h2').textContent).toBe('Tu pedido');
  });
});
