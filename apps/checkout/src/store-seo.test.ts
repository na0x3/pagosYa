import { afterEach, expect, test, vi } from 'vitest';
import { refreshStoreSeo } from './store-seo';

const head = '<title>Eje</title><link rel="icon" type="image/png" sizes="32x32" href="https://api.example/v1/stores/public/eje/favicon.png"><link rel="apple-touch-icon" href="https://api.example/v1/stores/public/eje/favicon.png?size=180">';
afterEach(() => { vi.unstubAllGlobals(); document.head.innerHTML = ''; });

test('the store icon replaces the platform icon and stays single across page changes', async () => {
  document.head.innerHTML = '<link rel="icon" type="image/png" href="/logo-mark.png">';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ head }) })));
  await refreshStoreSeo('eje');
  expect([...document.head.querySelectorAll('link[rel~="icon"]')].map(link => link.getAttribute('href'))).toEqual(['https://api.example/v1/stores/public/eje/favicon.png']);
  expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')).toContain('size=180');
  await refreshStoreSeo('eje', 'product-1');
  expect(document.head.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
  expect(document.head.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(1);
});
