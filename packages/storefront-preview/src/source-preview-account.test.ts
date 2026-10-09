// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

const snapshot = { schemaVersion: 1, brief: { businessType: '', audience: '', primaryAction: '', visualDirection: '' }, files: [{ path: 'index.html', content: '<h1>Tienda</h1>' }] };

// Spec 2026-10-08: the account pages are drawn in the store and reach the trusted parent only through this bridge.
it('gives the store an account bridge only where a trusted parent answers it, and no overlay slot', () => {
  const withForms = sourcePreviewDocument(snapshot, 'index.html', { accountForms: true });
  expect(withForms).toContain('PAGOSYA_ACCOUNT_REQUEST');
  expect(withForms).toContain('pagosya:account-request');
  const without = sourcePreviewDocument(snapshot, 'index.html', {});
  expect(without).not.toContain('pagosya:account-request');
  expect(withForms + without).not.toContain('pagosya:account-slot');
});
