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

// Popups 2.0 final review (I1): the YAPI popup's code, kept by the parent page, rides into every reloaded page of a published store.
describe('the popup code handed to the store frame', () => {
  const snapshot = { files: [{ path: 'index.html', content: '<!doctype html><html><head></head><body><main>Tienda</main></body></html>' }] } as never;
  it('is set before the kit runs; anything that is not a code is left out', () => {
    expect(sourcePreviewDocument(snapshot, 'index.html', { hosted: true, promo: 'POPABC234' })).toContain('window.PAGOSYA_PROMO="POPABC234"');
    expect(sourcePreviewDocument(snapshot, 'index.html', { hosted: true, promo: 'x"</script>' })).not.toContain('PAGOSYA_PROMO');
  });
});

// Live 2026-11-18: the outer page tells the frame that its cookie question is still open, so the popup waits for the answer.
describe('the cookie question handed to the store frame', () => {
  const snapshot = { files: [{ path: 'index.html', content: '<!doctype html><html><head></head><body><main>Tienda</main></body></html>' }] } as never;
  it('is flagged only while pending', () => {
    expect(sourcePreviewDocument(snapshot, 'index.html', { hosted: true, cookiesPending: true })).toContain('window.PAGOSYA_COOKIES_PENDING=true;');
    expect(sourcePreviewDocument(snapshot, 'index.html', { hosted: true })).not.toContain('PAGOSYA_COOKIES_PENDING');
  });
});

