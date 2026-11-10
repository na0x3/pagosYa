// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

// Spec 2026-11-10 rasca y elige: a published store's frame cannot keep anything; the parent page passes the shopper's favourite in.
describe('the favourite handed to the store frame', () => {
  const snapshot = { files: [{ path: 'index.html', content: '<!doctype html><html><head></head><body><main>Tienda</main></body></html>' }] } as never;
  it('is set before the kit runs, safely escaped', () => {
    const html = sourcePreviewDocument(snapshot, 'index.html', { hosted: true, favourite: 'p1:</script><b>' });
    expect(html).toContain('window.PAGOSYA_FAVOURITE="p1:\\u003c/script>\\u003cb>"');
  });
  it('is left out when there is none', () => {
    expect(sourcePreviewDocument(snapshot, 'index.html', { hosted: true })).not.toContain('PAGOSYA_FAVOURITE');
  });
});
