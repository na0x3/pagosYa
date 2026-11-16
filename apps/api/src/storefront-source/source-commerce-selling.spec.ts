import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** «La tienda que vende sola» (spec 2026-11-16): section events and the selling switches the kit reads from PAGOSYA_CONFIG. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const item = (id: string, name = id) => ({ id, name, amount: 1000, currency: 'BOB', stock: null, categoryId: 'c1', imageUrls: [`https://api.test/${id}.jpg`], variants: [], extras: [], highlights: [] });
const DATA = { storeName: 'Oh Belly', contactPhone: '+591 70000000', categories: [{ id: 'c1', name: 'Sodas' }], items: [item('a', 'Lemon'), item('b', 'Ginger'), item('c', 'Berry')] };
const HOME = '<main><section data-hero>Hero</section><section data-pagosya-catalog></section><section id="sabores">Sabores <a href="#x">ver</a></section><section id="historia">Historia</section><section id="preguntas">Preguntas</section></main>';

const windows: any[] = [];
const errors: Error[] = [];
const closed = new WeakSet<object>();
afterEach(() => { windows.splice(0).forEach(w => { closed.add(w); w.close(); }); expect(errors.splice(0)).toEqual([]); });

async function open({ body = HOME, extra = {}, hosted = false, data = DATA }: { body?: string; extra?: Record<string, unknown>; hosted?: boolean; data?: any } = {}) {
  const virtualConsole = new VirtualConsole();
  let opened: object | null = null;
  virtualConsole.on('jsdomError', (error: Error) => { if (!(opened && closed.has(opened)) && !/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${body}<section data-pagosya-cart></section><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w); opened = w;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.requestAnimationFrame = (cb: (t: number) => void) => w.setTimeout(() => cb(Date.now()), 16);
  w.cancelAnimationFrame = (id: number) => w.clearTimeout(id);
  w.matchMedia = (query: string) => ({ matches: /min-width/.test(query), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  const observers: Array<{ cb: (entries: any[]) => void; targets: any[] }> = [];
  w.IntersectionObserver = class { cb: any; targets: any[] = []; constructor(cb: any) { this.cb = cb; observers.push(this as any); } observe(t: any) { this.targets.push(t); } unobserve() {} disconnect() {} };
  const posted: any[] = [];
  w.postMessage = (message: any) => posted.push(message);
  if (hosted) w.PAGOSYA_HOSTED = true;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  w.PAGOSYA_CONFIG = { slug: 'ohbelly', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...extra };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] } }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  await sleep(50);
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  /** Shows main's child at `index` to every section observer. */
  const show = (index: number, ratio = 0.6) => {
    const target = w.document.querySelector('main').children[index];
    for (const observer of observers) if (observer.targets.includes(target)) observer.cb([{ target, isIntersecting: ratio > 0, intersectionRatio: ratio }]);
  };
  const events = () => posted.filter(message => message?.type === 'pagosya:analytics').flatMap(message => message.events);
  return { w, q, all, show, events };
}

describe('la tienda que vende sola — section events (Task 1)', () => {
  it('counts a home section seen for a second once, and a click inside it', async () => {
    const { q, show, events } = await open({ hosted: true });
    show(2); await sleep(1100); show(2, 0); show(2); await sleep(1100);
    q('#sabores a').click();
    await sleep(500);
    const mine = events().filter((event: any) => /^section_/.test(event.type));
    expect(mine.filter((event: any) => event.type === 'section_view')).toEqual([expect.objectContaining({ type: 'section_view', target: 's2' })]);
    expect(mine.filter((event: any) => event.type === 'section_click')).toEqual([expect.objectContaining({ type: 'section_click', target: 's2' })]);
  });
  it('does not count a section that left the screen before a second', async () => {
    const { show, events } = await open({ hosted: true });
    show(3); await sleep(300); show(3, 0); await sleep(1200);
    expect(events().filter((event: any) => event.type === 'section_view')).toEqual([]);
  });
});
