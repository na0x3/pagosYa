import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountPublishedSource } from '../src/source-storefront';
import { SOURCE_PRODUCT_OPTIONS_MARKER } from '../src/source-product-capabilities';
import type { Store } from '../src/api';
vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => ({ track: vi.fn(), token: () => undefined }) }));
vi.mock('../../merchant-studio/src/source-preview-media', async importOriginal => ({ ...await importOriginal<typeof import('../../merchant-studio/src/source-preview-media')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));
const product = { id: 'bottle', name: 'Botella', variants: [{ id: 'sage', name: 'Salvia', amount: 8900 }], extras: [], imageUrls: [], tags: [], amount: 8900 };
const store = { storeName: 'Savia', items: [product], categories: [] } as unknown as Store;
function site(runtime = SOURCE_PRODUCT_OPTIONS_MARKER) {
  return { published: true, snapshot: { schemaVersion: 1, brief: {}, files: [
    { path: 'index.html', content: '<h1>Store</h1><script src="config.js"></script>' },
    { path: 'product.html', content: '<header>Savia identity</header><main data-pagosya-product-page></main><script src="config.js"></script><script src="commerce.js"></script>' },
    { path: 'commerce.js', content: '// ' + runtime },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"productPage":"product.html"};' },
  ] } };
}
beforeEach(() => { document.body.innerHTML = '<main id="app"></main>'; document.body.className = ''; window.history.replaceState({}, '', '/s/savia/p/bottle'); });
afterEach(() => { window.dispatchEvent(new Event('pagehide')); vi.unstubAllGlobals(); });
it('mounts the authored PDP and passes the exact product identity to the sandbox', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'savia', store, vi.fn(), true)).toBe(true);
  const frame = document.querySelector('iframe')!;
  expect(frame.srcdoc).toContain('Savia identity');
  expect(frame.srcdoc).toContain('id=bottle');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
});
it('leaves the standard configurator available for old unsupported snapshots', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site('old runtime') }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'savia', store, vi.fn(), true)).toBe(false);
  expect(document.querySelector('iframe')).toBeNull();
});
it('never routes extras through the variant-only runtime', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => site() }));
  expect(await mountPublishedSource(document.querySelector('#app')!, 'savia', { ...store, items: [{ ...product, extras: [{ id: 'extra', amount: 100 }] }] } as unknown as Store, vi.fn(), true)).toBe(false);
});
