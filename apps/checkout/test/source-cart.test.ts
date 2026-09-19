import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';
import { mountPublishedSource } from '../src/source-storefront';
import type { Store } from '../src/api';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => ({ track: vi.fn(), token: () => undefined }) }));
vi.mock('@pagosya/storefront-preview', async importOriginal => ({ ...await importOriginal<typeof import('@pagosya/storefront-preview')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const key = 'pagosya:cart:tienda';
const items = [{ id: 'bottle', quantity: 2 }];
const store = { storeName: 'Tienda', items: [{ id: 'bottle', name: 'Botella', amount: 2500, currency: 'BOB', variants: [], extras: [] }], categories: [] } as unknown as Store;
const windows: JSDOM[] = [];
const snapshot = { schemaVersion: 1, brief: {}, files: [
  { path: 'index.html', content: '<h1>Tienda</h1><script src="config.js"></script>' },
  { path: 'product.html', content: '<h1>Producto</h1>' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
] };

async function mount(slug = 'tienda', onPayment = vi.fn()) {
  window.dispatchEvent(new Event('pagehide'));
  document.body.innerHTML = '<main id="app"></main>';
  window.history.replaceState({}, '', `/s/${slug}`);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ published: true, snapshot: structuredClone(snapshot) }) }));
  await mountPublishedSource(document.querySelector('#app')!, slug, store, onPayment, true);
  return document.querySelector('iframe')!;
}
function send(frame: HTMLIFrameElement, data: unknown, origin = 'null', source = frame.contentWindow) {
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
}
function restored(frame: HTMLIFrameElement) {
  return JSON.parse(frame.srcdoc.match(/window\.PAGOSYA_PREVIEW_CART=([^;]*);/)![1]);
}
function runtime(frame: HTMLIFrameElement, hosted = true, catalog = store) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => { if (!error.message.includes('Could not parse CSS stylesheet')) throw error; });
  // Simulate the unavailable storage of the hosted opaque frame.
  const dom = new JSDOM('<body><button data-add="bottle">Añadir</button><section data-pagosya-cart></section></body>', { runScripts: 'outside-only', virtualConsole });
  windows.push(dom);
  const w = dom.window;
  for (const storage of ['localStorage', 'sessionStorage']) Object.defineProperty(w, storage, { get() { throw new w.DOMException('Origen opaco', 'SecurityError'); } });
  w.PAGOSYA_HOSTED = hosted;
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = restored(frame);
  w.PAGOSYA_CONFIG = { slug: 'tienda', data: catalog };
  w.matchMedia = () => ({ matches: true });
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const post = vi.fn((data: unknown) => send(frame, data));
  Object.defineProperty(w, 'parent', { value: { postMessage: post } });
  w.eval(commerce);
  return { w, post };
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  windows.splice(0).forEach(dom => dom.window.close());
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('persists debounced mutations from an opaque runtime across refresh and a new session', async () => {
  vi.useFakeTimers();
  const frame = await mount();
  const { w, post } = runtime(frame);
  expect(() => w.localStorage.getItem(key)).toThrow();
  w.document.querySelector<HTMLButtonElement>('[data-add="bottle"]')!.click();
  w.document.querySelector<HTMLButtonElement>('[data-add="bottle"]')!.click();
  await vi.advanceTimersByTimeAsync(149);
  expect(post.mock.calls.filter(([data]) => (data as any).type === 'pagosya:cart-changed')).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:cart-changed', items }, '*');
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ items, expiresAt: Date.now() + 30 * 86400000 });
  sessionStorage.clear();
  const refreshed = await mount();
  expect(restored(refreshed)).toEqual(items);
  const next = runtime(refreshed);
  const state = { items: [] };
  next.w.document.dispatchEvent(new next.w.CustomEvent('pagosya:serialize-cart', { detail: state }));
  expect(state.items).toEqual(items);
  next.w.document.querySelector<HTMLButtonElement>('[data-remove="bottle"]')!.click();
  next.w.document.querySelector<HTMLButtonElement>('[data-remove="bottle"]')!.click();
  await vi.advanceTimersByTimeAsync(150);
  expect(restored(await mount())).toEqual([]);
});

it('does not send cart changes from a non-hosted preview', async () => {
  vi.useFakeTimers();
  const { w, post } = runtime(await mount(), false);
  w.document.querySelector<HTMLButtonElement>('[data-add="bottle"]')!.click();
  await vi.advanceTimersByTimeAsync(150);
  expect(post.mock.calls.filter(([data]) => (data as any).type === 'pagosya:cart-changed')).toHaveLength(0);
});

it('round-trips variants and repeated extras through mutation messages and runtime restoration', async () => {
  vi.useFakeTimers();
  const catalog = { ...store, items: [
    { ...store.items[0], id: 'shirt', variants: [{ id: 'red', name: 'Rojo', amount: 4500 }] },
    { ...store.items[0], id: 'box', extras: [{ id: 'cookie', name: 'Galleta', pickCount: 2, amount: 500 }] },
  ] } as unknown as Store;
  const selections = [{ id: 'shirt', variantId: 'red', quantity: 1 }, { id: 'box', extraIds: ['cookie', 'cookie'], quantity: 2 }];
  const { w, post } = runtime(await mount(), true, catalog);
  w.document.dispatchEvent(new w.CustomEvent('pagosya:restore-cart', { detail: { items: selections } }));
  await vi.advanceTimersByTimeAsync(150);
  expect(post).toHaveBeenCalledWith({ type: 'pagosya:cart-changed', items: [selections[0], { id: 'box', extras: ['cookie', 'cookie'], quantity: 2 }] }, '*');
  const refreshed = runtime(await mount(), true, catalog);
  const state = { items: [] };
  refreshed.w.document.dispatchEvent(new refreshed.w.CustomEvent('pagosya:serialize-cart', { detail: state }));
  expect(state.items).toEqual(selections);
});

it('does not send a mutation whose catalog identifiers exceed the bridge bounds', async () => {
  vi.useFakeTimers();
  const id = 'x'.repeat(65);
  const { w, post } = runtime(await mount(), true, { ...store, items: [{ ...store.items[0], id }] });
  w.document.dispatchEvent(new w.CustomEvent('pagosya:restore-cart', { detail: { items: [{ id, quantity: 1 }] } }));
  await vi.advanceTimersByTimeAsync(150);
  expect(post.mock.calls.filter(([data]) => (data as any).type === 'pagosya:cart-changed')).toHaveLength(0);
});

it('flushes a pending mutation on pagehide before the debounce expires', async () => {
  vi.useFakeTimers();
  const { w } = runtime(await mount());
  w.document.querySelector<HTMLButtonElement>('[data-add="bottle"]')!.click();
  w.dispatchEvent(new w.Event('pagehide'));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ items: [{ id: 'bottle', quantity: 1 }] });
});

it('rejects other windows, non-null origins and disconnected frames', async () => {
  const frame = await mount();
  const data = { type: 'pagosya:cart-changed', items };
  send(frame, data, 'https://untrusted.test');
  send(frame, data, location.origin);
  send(frame, data, 'null', window);
  frame.remove();
  send(frame, data);
  expect(localStorage.getItem(key)).toBeNull();
  expect(sessionStorage.getItem(key)).toBeNull();
});

const invalid = [null, {}, Array(101).fill(items[0]), [null], [{ id: '', quantity: 1 }],
  [{ id: 'a'.repeat(65), quantity: 1 }], [{ id: 'bottle', variantId: 'v'.repeat(65), quantity: 1 }],
  ...[0, -1, 1000, 1.5, '2', NaN, Infinity].map(quantity => [{ id: 'bottle', quantity }]),
  [{ id: 'bottle', quantity: 1, extras: {} }], [{ id: 'bottle', quantity: 1, extras: [{ id: 'extra', amount: 1 }] }],
  [{ id: 'bottle', quantity: 1, extras: Array(101).fill('extra') }], [{ id: 'bottle', quantity: 1, extras: ['e'.repeat(65)] }],
  [{ id: 'bottle', quantity: 1, extras: Array(1) }],
];
it.each(invalid.map((value, index) => ({ value, index })))('rejects invalid cart payload $index without replacing the last valid cart', async ({ value }) => {
  const frame = await mount();
  send(frame, { type: 'pagosya:cart-changed', items });
  send(frame, { type: 'pagosya:cart-changed', items: value });
  expect(restored(await mount())).toEqual(items);
});

it('bounds navigation carts before the preview bridge can truncate or filter them', async () => {
  const frame = await mount();
  send(frame, { type: 'pagosya:cart-changed', items });
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html', cart: Array(101).fill(items[0]) });
  expect(restored(await mount())).toEqual(items);
});

it('stores only selections, accepts boundary values and restores extras through the existing path', async () => {
  const frame = await mount();
  const selections = [{ id: 'i'.repeat(64), variantId: 'v'.repeat(64), quantity: 999, extras: ['e', 'e'] }];
  send(frame, { type: 'pagosya:cart-changed', items: selections.map(item => ({ ...item, amount: 1, price: 2, name: 'No guardar' })) });
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ items: selections });
  expect(restored(await mount())).toEqual(selections.map(({ extras, ...item }) => ({ ...item, extraIds: extras })));
  send(document.querySelector('iframe')!, { type: 'pagosya:cart-changed', items: Array.from({ length: 100 }, (_, i) => ({ id: String(i), quantity: 1 })) });
  expect(JSON.parse(localStorage.getItem(key)!).items).toHaveLength(100);
});

it('persists navigation selections without prices and retains cart changes when navigation omits cart', async () => {
  const frame = await mount();
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html', cart: [{ id: 'box', quantity: 1, extraIds: ['e', 'e'], amount: 1 }] });
  expect(JSON.parse(localStorage.getItem(key)!).items).toEqual([{ id: 'box', quantity: 1, extras: ['e', 'e'] }]);
  send(frame, { type: 'pagosya:source-navigate', page: 'index.html' });
  expect(restored(frame)).toEqual([{ id: 'box', quantity: 1, extraIds: ['e', 'e'] }]);
});

it('ignores expired and malformed entries and isolates store slugs', async () => {
  const frame = await mount();
  send(frame, { type: 'pagosya:cart-changed', items });
  expect(restored(await mount('otra'))).toEqual([]);
  expect(restored(await mount())).toEqual(items);
  localStorage.setItem(key, JSON.stringify({ items, expiresAt: Date.now() }));
  expect(restored(await mount())).toEqual([]);
  localStorage.setItem(key, JSON.stringify({ items: invalid[2], expiresAt: Date.now() + 1000 }));
  expect(restored(await mount())).toEqual([]);
  localStorage.setItem(key, '{');
  expect(restored(await mount())).toEqual([]);
});

it('falls back to session storage when local storage fails and never restores the stale local cart', async () => {
  localStorage.setItem(key, JSON.stringify({ items: [{ id: 'old', quantity: 1 }], expiresAt: Date.now() + 1000 }));
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Cuota excedida'); });
  const frame = await mount();
  send(frame, { type: 'pagosya:cart-changed', items });
  expect(JSON.parse(sessionStorage.getItem(key)!)).toMatchObject({ items });
  expect(restored(await mount())).toEqual(items);
});

it('retains in-memory selections during navigation when both storage APIs throw', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Bloqueado'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Bloqueado'); });
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('Bloqueado'); });
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('Bloqueado'); });
  const frame = await mount();
  send(frame, { type: 'pagosya:cart-changed', items });
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html' });
  expect(restored(frame)).toEqual(items);
});

it('migrates the existing session cart with bounded selections', async () => {
  sessionStorage.setItem('pagosya:source-cart:tienda', JSON.stringify(items));
  expect(restored(await mount())).toEqual(items);
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ items });
});

it('clears both storage copies only after a successful checkout handoff', async () => {
  let finish!: () => void;
  const onPayment = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const frame = await mount('tienda', onPayment);
  send(frame, { type: 'pagosya:cart-changed', items });
  sessionStorage.setItem(key, localStorage.getItem(key)!);
  localStorage.setItem('pagosya:cart:otra', localStorage.getItem(key)!);
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'secret' }) } as Response);
  send(frame, { type: 'pagosya:hosted-request', id: 1, action: 'checkout', body: { items: [] } });
  await vi.waitFor(() => expect(onPayment).toHaveBeenCalledWith('secret'));
  expect(localStorage.getItem(key)).not.toBeNull();
  finish();
  await vi.waitFor(() => expect(localStorage.getItem(key)).toBeNull());
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem('pagosya:cart:otra')).not.toBeNull();
  send(frame, { type: 'pagosya:cart-changed', items });
  expect(localStorage.getItem(key)).toBeNull();
});

it.each(['response', 'secret', 'handoff'])('retains the cart after a failed checkout %s', async failure => {
  const frame = await mount('tienda', vi.fn().mockRejectedValue(new Error('No se pudo abrir el pago.')));
  send(frame, { type: 'pagosya:cart-changed', items });
  const reply = vi.spyOn(frame.contentWindow!, 'postMessage');
  vi.mocked(fetch).mockResolvedValue({ ok: failure !== 'response', json: async () => ({ clientSecret: failure === 'secret' ? '' : 'secret' }) } as Response);
  send(frame, { type: 'pagosya:hosted-request', id: 1, action: 'checkout', body: { items: [] } });
  await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ ok: false }) }), '*'));
  expect(JSON.parse(localStorage.getItem(key)!)).toMatchObject({ items });
});
