import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';
import { privacy } from '../src/privacy';
import { createStoreFunnel } from '../src/store-funnel';
import { createStoreAnalytics, ANALYTICS_TRACK_LABELS } from '../src/store-analytics';

const SESSION = /^[a-f0-9-]{36}$/;
let fetcher: ReturnType<typeof vi.fn>;
const created: ReturnType<typeof createStoreAnalytics>[] = [];
function analyticsFor(slug: string, preview = false) {
  const funnel = createStoreFunnel(slug, preview);
  const analytics = createStoreAnalytics(slug, preview, () => funnel.sessionId());
  created.push(analytics);
  return analytics;
}
const sent = () => fetcher.mock.calls.filter(([url]) => String(url).endsWith('/events')).map(([url, init]) => ({ url: String(url), init: init as RequestInit, body: JSON.parse(String((init as RequestInit).body)) }));

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ accepted: 1 }) });
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { created.splice(0).forEach(analytics => analytics.dispose()); vi.unstubAllGlobals(); });

it('sends nothing without consent or in an owner preview', () => {
  privacy.save('private', false);
  const refused = analyticsFor('private'); refused.record({ type: 'page_view' }); refused.flush();
  privacy.save('preview', true);
  const preview = analyticsFor('preview', true); preview.record({ type: 'page_view' }); preview.flush();
  expect(fetcher).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('pagosya:analytics:private')).toBeNull();
});

it('batches consented events under the funnel session and sends them without credentials, surviving the page', () => {
  privacy.save('shop', true);
  const analytics = analyticsFor('shop');
  analytics.record({ type: 'page_view', path: 'index.html' });
  analytics.record({ type: 'cta_click', target: 'hero-cta', path: 'index.html', email: 'ana@test.test' });
  analytics.record({ type: 'cta_click', target: 'buy-now' });
  analytics.record({ type: 'payment_completed' });
  expect(fetcher).not.toHaveBeenCalled();
  window.dispatchEvent(new Event('pagehide'));
  const [request] = sent();
  expect(request.url).toMatch(/\/stores\/public\/shop\/events$/);
  expect(request.init).toMatchObject({ method: 'POST', credentials: 'omit', keepalive: true });
  expect(request.body).toEqual({ sessionId: expect.stringMatching(SESSION), events: [{ type: 'page_view', path: 'index.html' }, { type: 'cta_click', target: 'hero-cta', path: 'index.html' }] });
  expect(request.body.sessionId).toBe(JSON.parse(sessionStorage.getItem('pagosya:funnel:shop')!).id);
});

it('flushes at 20 events and on a hidden page', () => {
  privacy.save('busy', true);
  const analytics = analyticsFor('busy');
  for (let i = 0; i < 20; i++) analytics.record({ type: 'add_to_cart', productId: `p${i}` });
  expect(sent()).toHaveLength(1);
  expect(sent()[0].body.events).toHaveLength(20);
  analytics.record({ type: 'cart_open' });
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  expect(sent()).toHaveLength(2);
});

it('counts a card impression once per product per session, across pages', () => {
  privacy.save('cards', true);
  const first = analyticsFor('cards');
  first.record({ type: 'product_card_impression', productId: 'lamp' });
  first.record({ type: 'product_card_impression', productId: 'lamp' });
  first.flush();
  const again = analyticsFor('cards');
  again.record({ type: 'product_card_impression', productId: 'lamp' });
  again.record({ type: 'product_card_impression', productId: 'desk' });
  again.flush();
  expect(sent().flatMap(request => request.body.events.map((event: { productId: string }) => event.productId))).toEqual(['lamp', 'desk']);
});

it('sends the referrer host once per session, never the address', () => {
  privacy.save('ref', true);
  Object.defineProperty(document, 'referrer', { value: 'https://www.instagram.com/p/abc?igsh=secret', configurable: true });
  const analytics = analyticsFor('ref');
  analytics.record({ type: 'page_view' }); analytics.flush();
  analytics.record({ type: 'page_view' }); analytics.flush();
  expect(sent().map(request => request.body.referrer)).toEqual(['instagram.com', undefined]);
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
});

it('drops the queue and the analytics session when consent is withdrawn', () => {
  privacy.save('withdraw', true);
  const analytics = analyticsFor('withdraw');
  analytics.record({ type: 'product_card_impression', productId: 'lamp' });
  expect(sessionStorage.getItem('pagosya:analytics:withdraw')).not.toBeNull();
  privacy.save('withdraw', false);
  analytics.flush();
  expect(fetcher).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('pagosya:analytics:withdraw')).toBeNull();
});

it('never lets a failed send reject', async () => {
  privacy.save('offline', true);
  fetcher.mockRejectedValue(new Error('offline'));
  const analytics = analyticsFor('offline');
  analytics.record({ type: 'page_view' });
  expect(() => analytics.flush()).not.toThrow();
  await new Promise(resolve => setTimeout(resolve, 0));
});

it('keeps the host label list equal to the kit', () => {
  const list = /const ANALYTICS_LABELS = (\[[^\]]*\]);/.exec(readFileSync(kitPath('commerce.js'), 'utf8'))?.[1];
  expect(list && JSON.parse(list.replace(/'/g, '"'))).toEqual([...ANALYTICS_TRACK_LABELS]);
});

it('names the products whose quantity grew, for the legacy storefront\'s add events', async () => {
  const { productQuantities, addedProducts } = await import('../src/store-analytics');
  const before = productQuantities([['lamp', 1], [JSON.stringify(['desk', 'oak']), 1]].map(([key, quantity]) => [String(key), Number(quantity)] as [string, number]), key => key.startsWith('[') ? JSON.parse(key)[0] : key);
  const after = productQuantities([['lamp', 1], [JSON.stringify(['desk', 'oak']), 1], [JSON.stringify(['desk', 'pine']), 2], ['cup', 1]], key => key.startsWith('[') ? JSON.parse(key)[0] : key);
  expect([...before]).toEqual([['lamp', 1], ['desk', 1]]);
  expect(addedProducts(before, after)).toEqual(['desk', 'cup']);
  expect(addedProducts(after, before)).toEqual([]);
});

it('still sends on browsers without AbortSignal.timeout (iOS ≤ 15, Chrome < 103), aborting after 2.5 s itself', () => {
  vi.useFakeTimers();
  const timeout = AbortSignal.timeout;
  try {
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
    privacy.save('old-safari', true);
    const analytics = analyticsFor('old-safari');
    analytics.record({ type: 'page_view', path: 'index.html' });
    analytics.flush();
    const [request] = sent();
    expect(request.body.events).toEqual([{ type: 'page_view', path: 'index.html' }]);
    const signal = request.init.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    vi.advanceTimersByTime(2500);
    expect(signal.aborted).toBe(true);
  } finally {
    Object.defineProperty(AbortSignal, 'timeout', { value: timeout, configurable: true, writable: true });
    vi.useRealTimers();
  }
});
