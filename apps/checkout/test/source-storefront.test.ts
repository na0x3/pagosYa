import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountPublishedSource } from '../src/source-storefront';
import type { Store } from '../src/api';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => ({ track: vi.fn(), token: () => undefined }) }));
vi.mock('../../merchant-studio/src/source-preview-media', async importOriginal => ({ ...await importOriginal<typeof import('../../merchant-studio/src/source-preview-media')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));

const store = {
  storeName: 'Savia',
  items: [{ id: 'bottle', name: 'Botella', variants: [], extras: [], imageUrls: [], tags: [], amount: 8900 }],
  categories: [],
  collections: [{ id: 'col_verano', name: 'Verano', slug: 'verano', productIds: ['bottle'] }],
} as unknown as Store;

function site() {
  return {
    published: true,
    snapshot: {
      schemaVersion: 1,
      brief: {},
      files: [
        { path: 'index.html', content: '<h1>Store</h1><script src="config.js"></script>' },
        { path: 'productos.html', content: '<header>Catálogo Savia</header><script src="config.js"></script>' },
        { path: 'coleccion.html', content: '<header>Colección Savia</header><script src="config.js"></script>' },
        { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"productPage":"product.html"};' },
      ],
    },
  };
}

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  document.body.className = '';
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  vi.unstubAllGlobals();
});

it('mounts productos.html at its own hosted route', async () => {
  window.history.replaceState({}, '', '/s/tienda/productos');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  expect(document.querySelector('iframe')!.srcdoc).toContain('Catálogo Savia');
});

it('resolves /c/<x> as a collection first when the catalog has a matching slug', async () => {
  window.history.replaceState({}, '', '/s/tienda/c/verano');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  const frame = document.querySelector('iframe')!;
  expect(frame.srcdoc).toContain('Colección Savia');
  expect(frame.srcdoc).toContain('c=verano');
});

it('falls back to today’s category behavior when the segment is not a collection slug', async () => {
  window.history.replaceState({}, '', '/s/tienda/c/cat_123');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  const frame = document.querySelector('iframe')!;
  expect(frame.srcdoc).not.toContain('Colección Savia');
  expect(frame.srcdoc).toContain('<h1>Store</h1>');
});

it('resolves a collection slug that also equals a category id as the collection', async () => {
  window.history.replaceState({}, '', '/s/tienda/c/verano');
  const ambiguousStore = { ...store, categories: [{ id: 'verano', name: 'Verano (categoría)' }] } as unknown as Store;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', ambiguousStore, vi.fn(), true)).toBe(true);
  expect(document.querySelector('iframe')!.srcdoc).toContain('Colección Savia');
});

it('mounts the custom-domain /productos the same way, with a "/" home prefix', async () => {
  window.history.replaceState({}, '', '/productos');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  expect(document.querySelector('iframe')!.srcdoc).toContain('Catálogo Savia');
});

function send(frame: HTMLIFrameElement, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data }));
}

it('writes a real /s/<slug>/c/<collection> URL — not ?source_page= — and restores /s/<slug> from index.html', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false)).toBe(true);
  const frame = document.querySelector('iframe')!;

  send(frame, { type: 'pagosya:source-navigate', page: 'coleccion.html', query: '?c=verano' });
  expect(window.location.pathname).toBe('/s/tienda/c/verano');
  expect(window.location.search).not.toContain('source_page');

  send(frame, { type: 'pagosya:source-navigate', page: 'index.html', query: '?' });
  expect(window.location.pathname).toBe('/s/tienda');
});

it('writes the bare /productos and /c/<collection> back to the URL bar on a custom domain', async () => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false)).toBe(true);
  const frame = document.querySelector('iframe')!;

  send(frame, { type: 'pagosya:source-navigate', page: 'productos.html', query: '?' });
  expect(window.location.pathname).toBe('/productos');
  expect(window.location.search).not.toContain('source_page');

  send(frame, { type: 'pagosya:source-navigate', page: 'coleccion.html', query: '?c=verano' });
  expect(window.location.pathname).toBe('/c/verano');
  expect(window.location.search).not.toContain('source_page');
  expect(window.location.search).not.toContain('c=verano');
});

it('lets the hosted storefront load the carrier map and ask for the buyer position', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true)).toBe(true);
  const frame = document.querySelector('iframe')!;
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  expect(frame.getAttribute('allow')).toBe('geolocation');
  const csp = new DOMParser().parseFromString(frame.srcdoc, 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!;
  const directive = (name: string) => csp.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `));
  expect(directive('script-src')).toBe("script-src 'unsafe-inline' data: https://cdnjs.cloudflare.com");
  expect(directive('style-src')).toBe("style-src 'unsafe-inline' data: https://cdnjs.cloudflare.com");
  expect(directive('img-src')).toBe('img-src data: blob: https://cdnjs.cloudflare.com https://*.tile.openstreetmap.org');
  expect(directive('connect-src')).toBe("connect-src 'none'");
});

it('answers the kit location request with this page geolocation', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: -17.78, longitude: -63.18 } } as GeolocationPosition));
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  // The buyer's click inside the frame activates this page too.
  Object.defineProperty(navigator, 'userActivation', { value: { isActive: true }, configurable: true });
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true);
  const frame = document.querySelector('iframe')!;
  const source = frame.contentWindow!;
  const replies: unknown[] = [];
  const post = vi.spyOn(source, 'postMessage').mockImplementation(((message: unknown) => { replies.push(message); }) as Window['postMessage']);
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'pagosya:hosted-request', id: 7, action: 'location', body: {} }, origin: 'null', source }));
  await vi.waitFor(() => expect(replies).toEqual([{ type: 'pagosya:hosted-response', id: 7, result: { ok: true, body: { lat: -17.78, lng: -63.18 } } }]));
  expect(getCurrentPosition).toHaveBeenCalledOnce();
  post.mockRestore();
});

it('refuses a location request the buyer did not trigger, without asking for the position', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: -17.78, longitude: -63.18 } } as GeolocationPosition));
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  Object.defineProperty(navigator, 'userActivation', { value: { isActive: false }, configurable: true });
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true);
  const source = document.querySelector('iframe')!.contentWindow!;
  const replies: unknown[] = [];
  const post = vi.spyOn(source, 'postMessage').mockImplementation(((message: unknown) => { replies.push(message); }) as Window['postMessage']);
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'pagosya:hosted-request', id: 8, action: 'location', body: {} }, origin: 'null', source }));
  await vi.waitFor(() => expect(replies).toHaveLength(1));
  expect(replies[0]).toMatchObject({ type: 'pagosya:hosted-response', id: 8, result: { ok: false } });
  expect(getCurrentPosition).not.toHaveBeenCalled();
  post.mockRestore();
});

it('refuses a location request when the browser cannot report a buyer gesture', async () => {
  window.history.replaceState({}, '', '/s/tienda');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  const getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  Object.defineProperty(navigator, 'userActivation', { value: undefined, configurable: true });
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), true);
  const source = document.querySelector('iframe')!.contentWindow!;
  const replies: unknown[] = [];
  const post = vi.spyOn(source, 'postMessage').mockImplementation(((message: unknown) => { replies.push(message); }) as Window['postMessage']);
  window.dispatchEvent(new MessageEvent('message', { data: { type: 'pagosya:hosted-request', id: 9, action: 'location', body: {} }, origin: 'null', source }));
  await vi.waitFor(() => expect(replies).toHaveLength(1));
  expect(replies[0]).toMatchObject({ result: { ok: false } });
  expect(getCurrentPosition).not.toHaveBeenCalled();
  post.mockRestore();
});
