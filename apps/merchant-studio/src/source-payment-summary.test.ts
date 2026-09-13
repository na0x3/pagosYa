import { describe, expect, it } from 'vitest';
import { sourcePaymentSummary } from './source-payment-summary';
import type { SourceSnapshot } from './source-preview';

const snapshot = { files: [{ path: 'config.js', content: `window.PAGOSYA_CONFIG=${JSON.stringify({ data: { storeName: 'PEANU', items: [{ id: 'p1', name: 'Maní', amount: 10000, currency: 'BOB', stock: 3, discountPercent: 15 }, { id: 'p2', name: 'Snack', amount: 2500, currency: 'BOB', stock: 5, discountPercent: 10, discountEndsAt: '2020-01-01' }] } })};` }] } as SourceSnapshot;
describe('payment preview totals', () => {
  it('uses catalog prices and active discounts, ignoring authored amounts', () => {
    expect(sourcePaymentSummary(snapshot, [{ id: 'p1', quantity: 2, amount: 1 }, { id: 'p2', quantity: 1 }])).toEqual({ amount: 19500, currency: 'BOB', merchantName: 'PEANU', description: '2 × Maní · 1 × Snack' });
  });
  it.each([[], [{ id: 'foreign', quantity: 1 }], [{ id: 'p1', quantity: 4 }], [{ id: 'p1', quantity: -1 }], [{ id: 'p1', quantity: 1 }, { id: 'p1', quantity: 1 }]].map(cart => ({ cart })))('rejects an invalid cart: $cart', ({ cart }) => {
    expect(() => sourcePaymentSummary(snapshot, cart)).toThrow();
  });
});
