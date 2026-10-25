// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

// Owner, 2026-10-25 (BOXY): «i dont see the popup». «Ver en navegador» asks for the signup popup as a demo on its first page;
// the editor's own preview never does, so it does not pop up on every reload while the merchant edits.
const snapshot = { schemaVersion: 1, brief: {} as any, files: [{ path: 'index.html', content: '<html><body><h1>BOXY</h1></body></html>' }] };

describe('signup popup demo in the browser view', () => {
  it('flags the popup demo only when asked', () => {
    expect(sourcePreviewDocument(snapshot as any, 'index.html', { paymentForm: true, popupDemo: true })).toContain('window.PAGOSYA_POPUP_DEMO=true;');
    expect(sourcePreviewDocument(snapshot as any, 'index.html', { paymentForm: true })).not.toContain('PAGOSYA_POPUP_DEMO');
    expect(sourcePreviewDocument(snapshot as any, 'index.html', { editing: true, inlineText: true })).not.toContain('PAGOSYA_POPUP_DEMO');
  });
});
