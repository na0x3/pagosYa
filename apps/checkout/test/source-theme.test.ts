import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { mountPublishedSource } from '../src/source-storefront';
import { sourcePreviewDocument, type SourceSnapshot } from '../../merchant-studio/src/source-preview';
import type { Store } from '../src/api';

vi.mock('../src/privacy', () => ({ privacy: { mount: vi.fn(), analyticsAllowed: () => false } }));
vi.mock('../src/store-funnel', () => ({ createStoreFunnel: () => ({ track: vi.fn(), token: () => undefined }) }));
vi.mock('../../merchant-studio/src/source-preview-media', async importOriginal => ({ ...await importOriginal<typeof import('../../merchant-studio/src/source-preview-media')>(), createPreviewImageLoader: () => async (snapshot: unknown) => snapshot }));

const snapshot: SourceSnapshot = {
  schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [
    { path: 'index.html', content: '<html><body><a href="#guia">Tallas y cuidados</a><section id="guia">Guía</section><a href="product.html">Producto</a></body></html>' },
    { path: 'product.html', content: '<h1>Producto</h1>' },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {};' },
  ],
};
const store = { storeName: 'Hilar', items: [], categories: [] } as unknown as Store;
function send(frame: HTMLIFrameElement, data: unknown, origin = 'null', source = frame.contentWindow) {
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
}
function theme(frame: HTMLIFrameElement) {
  return new DOMParser().parseFromString(frame.srcdoc, 'text/html').documentElement.dataset.theme;
}
async function mount(slug = 'hilar-theme-test') {
  window.history.replaceState({}, '', `/s/${slug}`);
  document.body.innerHTML = '<main id="app"></main>';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ published: true, snapshot: structuredClone(snapshot) }) }));
  await mountPublishedSource(document.querySelector('#app')!, slug, store, vi.fn(), true);
  return document.querySelector('iframe')!;
}
afterEach(() => { window.dispatchEvent(new Event('pagehide')); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('keeps explicit themes through product navigation and remounts, scoped to this store', async () => {
  const frame = await mount();
  expect(theme(frame)).toBeUndefined(); // Keep the system preference until a choice is made.
  send(frame, { type: 'pagosya:source-theme', theme: 'light' });
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html', theme: 'light' });
  expect(theme(frame)).toBe('light');
  send(frame, { type: 'pagosya:source-theme', theme: 'dark' });
  send(frame, { type: 'pagosya:source-navigate', page: 'index.html', fragment: '#guia' });
  expect(theme(frame)).toBe('dark');
  window.dispatchEvent(new Event('pagehide'));
  expect(theme(await mount())).toBe('dark');
  window.dispatchEvent(new Event('pagehide'));
  expect(theme(await mount('another-store'))).toBeUndefined();
});

it('ignores invalid themes and messages from another frame or origin', async () => {
  const frame = await mount();
  send(frame, { type: 'pagosya:source-theme', theme: 'light' }, 'https://untrusted.test');
  send(frame, { type: 'pagosya:source-theme', theme: 'light' }, 'null', window);
  send(frame, { type: 'pagosya:source-theme', theme: 'arbitrary' });
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html', theme: 'arbitrary' });
  expect(theme(frame)).toBeUndefined();
  expect(sessionStorage.getItem('pagosya:source-theme:hilar-theme-test')).toBeNull();
});

it('preserves the in-memory preference when session storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  const frame = await mount();
  send(frame, { type: 'pagosya:source-theme', theme: 'light' });
  send(frame, { type: 'pagosya:source-navigate', page: 'product.html' });
  expect(theme(frame)).toBe('light');
});

it('scrolls section links without navigating srcdoc and carries the theme on page links', () => {
  const dom = new JSDOM(sourcePreviewDocument(snapshot, 'index.html', { theme: 'light' }), { runScripts: 'dangerously', url: 'https://store.test/' });
  try {
    const doc = dom.window.document;
    const scroll = vi.fn();
    doc.getElementById('guia')!.scrollIntoView = scroll;
    const post = vi.spyOn(dom.window, 'postMessage').mockImplementation(() => {});
    doc.querySelector<HTMLAnchorElement>('a[href="#guia"]')!.click();
    expect(scroll).toHaveBeenCalledOnce();
    expect(dom.window.location.hash).toBe('');
    expect(doc.documentElement.dataset.theme).toBe('light');
    expect(post).not.toHaveBeenCalled();
    doc.querySelector<HTMLAnchorElement>('a[href="product.html"]')!.click();
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'pagosya:source-navigate', page: 'product.html', theme: 'light' }), '*');
  } finally { dom.window.close(); }
});
