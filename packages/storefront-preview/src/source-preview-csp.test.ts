// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<h1>Tienda</h1>' }] };
const policy = (hosted: boolean) => {
  const csp = new DOMParser().parseFromString(sourcePreviewDocument(snapshot, 'index.html', { hosted }), 'text/html').querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content')!;
  return Object.fromEntries(csp.split(';').map(part => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
};

// The courier map and door pin live in pagosYa's secure form, so no design frame loads Leaflet or map tiles.
it.each([true, false])('keeps scripts, styles and map tiles local to the design frame (hosted: %s)', hosted => {
  const csp = policy(hosted);
  expect(csp['default-src']).toBe("'none'");
  expect(csp['script-src']).toBe("'unsafe-inline' data:");
  expect(csp['style-src']).toBe("'unsafe-inline' data:");
  expect(csp['img-src']).not.toContain('openstreetmap');
  expect(csp['img-src']).not.toContain('cdnjs');
  expect(csp['connect-src']).toBe("'none'");
});
