import { reminderCart } from './reminder-cart';

const line = { paymentLinkId: 'p1', variantId: 'v1', variantName: 'Doble', extraIds: ['x1', 'x1'], extras: [{ id: 'x1', name: 'Queso', amount: 500 }], name: 'Burger', quantity: 2, unitAmount: 3000 };
describe('reminderCart', () => {
  it('keeps what a saved cart keeps from a store-page cart: ids and quantities, never names or prices', () => {
    expect(reminderCart({ storeId: 's1', cart: [line, { paymentLinkId: 'p2', name: 'Té', quantity: 1, unitAmount: 900 }] })).toEqual({
      storeId: 's1', items: [{ paymentLinkId: 'p1', variantId: 'v1', extraIds: ['x1', 'x1'], quantity: 2 }, { paymentLinkId: 'p2', quantity: 1 }],
    });
  });
  it('is null for anything that is not a store cart: renewals, memberships, cobros and malformed data', () => {
    for (const metadata of [null, [], 'x', { cart: [line] }, { storeId: 's1' }, { storeId: 's1', cart: [] },
      { storeId: 's1', cart: [line], subscription: { subscriptionId: 'sub_1' } }, { storeId: 's1', cart: [line], membership: { productId: 'p1' } },
      { storeId: 's1', businessDocument: { documentId: 'd1' } }, { storeId: 's1', cart: [{ name: 'sin id', quantity: 1 }] }]) expect(reminderCart(metadata)).toBeNull();
  });
  // Owner decision 2026-10-13: a reminder brings a subscription back as a subscription, not a one-time purchase.
  it('keeps the subscription cadence a store cart line was bought with', () => {
    const monthly = { paymentLinkId: 'p3', name: 'Café mensual', quantity: 1, unitAmount: 7000, subscription: { cadence: 'MONTHLY', discountPercent: 10, lockedUnitAmount: 6300 } };
    expect(reminderCart({ storeId: 's1', cart: [monthly, { ...monthly, paymentLinkId: 'p4', subscription: { cadence: 'YEARLY' } }] })!.items).toEqual([
      { paymentLinkId: 'p3', quantity: 1, subscriptionCadence: 'MONTHLY' }, { paymentLinkId: 'p4', quantity: 1 },
    ]);
  });
});
