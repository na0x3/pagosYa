import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountPublishedSource } from '../src/source-storefront';
import type { Store } from '../src/api';

const analytics = vi.hoisted(() => ({ record: vi.fn(), flush: vi.fn(), dispose: vi.fn(), created: [] as unknown[][] }));
vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => true } }));
const funnel = vi.hoisted(() => ({ track: vi.fn(), token: () => undefined, sessionId: () => '3b241101-e2bb-4255-8caf-4136c566a962' }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => funnel }));
vi.mock('../src/store-analytics', () => ({ createStoreAnalytics: (...args: unknown[]) => { analytics.created.push(args); return analytics; } }));
vi.mock('../src/trusted-form', () => ({ collectPersonalFields: vi.fn(async () => ({})), withoutPersonalFields: (_action: string, body: object) => body }));
vi.mock('@pagosya/storefront-preview', async importOriginal => ({ ...await importOriginal<typeof import('@pagosya/storefront-preview')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));

const store = { storeName: 'Savia', items: [{ id: 'bottle', name: 'Botella', variants: [], extras: [], imageUrls: [], amount: 8900 }], categories: [] } as unknown as Store;
const site = () => ({ published: true, snapshot: { schemaVersion: 1, brief: {}, files: [
  { path: 'index.html', content: '<h1>Store</h1><script src="config.js"></script>' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
] } });
const send = (frame: HTMLIFrameElement, data: unknown) => window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, origin: 'null', data }));

beforeEach(() => {
  document.body.innerHTML = '<main id="app"></main>';
  window.history.replaceState({}, '', '/s/tienda');
  analytics.record.mockClear(); analytics.flush.mockClear(); analytics.created.length = 0;
});
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });

it('creates the store analytics with the funnel session and forwards what the frame hands over', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false);
  expect(analytics.created[0].slice(0, 2)).toEqual(['tienda', false]);
  expect((analytics.created[0][2] as () => string)()).toBe('3b241101-e2bb-4255-8caf-4136c566a962');
  const frame = document.querySelector('iframe')!;
  send(frame, { type: 'pagosya:analytics', events: [{ type: 'page_view', path: 'index.html' }, { type: 'cart_open' }] });
  send(frame, { type: 'pagosya:analytics', events: 'nope' });
  expect(analytics.record.mock.calls.map(([event]) => event)).toEqual([{ type: 'page_view', path: 'index.html' }, { type: 'cart_open' }]);
});

it('ignores analytics posted by anything but the store frame', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false);
  window.dispatchEvent(new MessageEvent('message', { source: window, origin: location.origin, data: { type: 'pagosya:analytics', events: [{ type: 'page_view' }] } }));
  expect(analytics.record).not.toHaveBeenCalled();
});

it('marks the contact step when pagosYa\'s secure form opens and the payment step before the payment form', async () => {
  const onPayment = vi.fn(async () => {});
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, onPayment, false);
  const frame = document.querySelector('iframe')!;
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ clientSecret: 'secret' }) } as Response);
  send(frame, { type: 'pagosya:hosted-request', id: 1, action: 'checkout', body: { items: [] } });
  await vi.waitFor(() => expect(onPayment).toHaveBeenCalledWith('secret'));
  expect(analytics.record.mock.calls.map(([event]) => event)).toEqual([{ type: 'checkout_step', step: 'contact' }, { type: 'checkout_step', step: 'payment' }]);
  expect(analytics.flush.mock.invocationCallOrder[0]).toBeLessThan(onPayment.mock.invocationCallOrder[0]);
});

it('ignores the funnel steps an older store kit still posts: only the visit reaches /funnel', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  funnel.track.mockClear();
  await mountPublishedSource(document.querySelector('#app')!, 'tienda', store, vi.fn(), false);
  const frame = document.querySelector('iframe')!;
  send(frame, { type: 'pagosya:funnel', event: 'add_to_cart' });
  send(frame, { type: 'pagosya:funnel', event: 'delivery_selected', method: 'pickup' });
  expect(funnel.track.mock.calls).toEqual([['visit']]);
});
