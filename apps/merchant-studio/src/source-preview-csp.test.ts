// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<h1>Tienda</h1>' }] };
const policy = (hosted: boolean) => {
  const csp = new DOMParser().parseFromString(sourcePreviewDocument(snapshot, 'index.html', { hosted }), 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!;
  return Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
};

it('lets only the published (hosted) storefront load Leaflet from cdnjs and OpenStreetMap tiles', () => {
  const hosted = policy(true);
  expect(hosted['script-src']).toBe("'unsafe-inline' data: https://cdnjs.cloudflare.com");
  expect(hosted['style-src']).toBe("'unsafe-inline' data: https://cdnjs.cloudflare.com");
  expect(hosted['img-src']).toBe('data: blob: https://cdnjs.cloudflare.com https://*.tile.openstreetmap.org');
  expect(hosted['connect-src']).toBe("'none'");
  expect(hosted['default-src']).toBe("'none'");
});

it('keeps the Studio preview fully offline', () => {
  const preview = policy(false);
  expect(preview['script-src']).toBe("'unsafe-inline' data:");
  expect(preview['style-src']).toBe("'unsafe-inline' data:");
  expect(preview['img-src']).toBe('data: blob:');
});
