import { bestBundleDiscount, type Bundle } from './bundle-pricing';
const bundle: Bundle = { id: 'duo', name: 'Dúo', kind: 'FIXED', items: [{ productId: 'a', quantity: 1 }, { productId: 'b', quantity: 1 }], minimumQuantity: 2, discountPercent: 10 };
describe('Inventory-aware bundle pricing', () => {
  it('discounts complete kits only, including repeated kits', () => {
    expect(bestBundleDiscount([bundle], [{ paymentLinkId: 'a', quantity: 3, unitAmount: 1000 }, { paymentLinkId: 'b', quantity: 2, unitAmount: 2000 }]).amount).toBe(600);
    expect(bestBundleDiscount([bundle], [{ paymentLinkId: 'a', quantity: 3, unitAmount: 1000 }]).amount).toBe(0);
  });
  it('BOGO gives the cheaper qualifying units free and never discounts unrelated products', () => {
    expect(bestBundleDiscount([{ ...bundle, kind: 'BOGO' }], [{ paymentLinkId: 'a', quantity: 1, unitAmount: 1000 }, { paymentLinkId: 'b', quantity: 1, unitAmount: 2000 }, { paymentLinkId: 'c', quantity: 1, unitAmount: 3000 }]).amount).toBe(1000);
  });
  it('mix-and-match requires complete quantity groups, and competing offers do not stack', () => {
    const mix = { ...bundle, kind: 'MIX_MATCH', minimumQuantity: 3, discountPercent: 20 };
    const lines = [{ paymentLinkId: 'a', quantity: 4, unitAmount: 1000 }];
    expect(bestBundleDiscount([mix, { ...mix, id: 'other', discountPercent: 10 }], lines)).toMatchObject({ id: 'duo', amount: 600 });
  });
});
