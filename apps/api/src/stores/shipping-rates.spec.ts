import { quoteShipping, type ShippingRate } from './shipping-rates';
const rate: ShippingRate = { id: 'la-paz', name: 'La Paz', fee: 1500, currency: 'BOB', minimumOrder: 0, maximumOrder: null, freeAbove: 20000, minimumWeightGrams: null, maximumWeightGrams: null, isActive: true };
describe('Authoritative shipping rates', () => {
  it('applies a free-shipping threshold at the exact discounted-subtotal boundary', () => {
    const input = { zoneId: rate.id, currency: 'BOB', subtotal: 19999, weightGrams: null };
    expect(quoteShipping([rate], input).selected?.amount).toBe(1500);
    expect(quoteShipping([rate], { ...input, subtotal: 20000 }).selected?.amount).toBe(0);
  });
  it('rejects unavailable, foreign-currency and out-of-range choices', () => {
    for (const changed of [{ isActive: false }, { currency: 'USD' }, { minimumOrder: 6000 }, { maximumOrder: 4000 }, { maximumWeightGrams: 100 }]) {
      expect(() => quoteShipping([{ ...rate, ...changed }], { zoneId: rate.id, currency: 'BOB', subtotal: 5000, weightGrams: null })).toThrow('no está disponible');
    }
  });
  it('enforces country and normalized postal prefixes and rejects missing destinations', () => {
    const destinationRate = { ...rate, countryCodes: ['CA'], postalPrefixes: ['K1A'] };
    const input = { currency: 'BOB', subtotal: 10000, weightGrams: 500, shippingCountry: 'CA', shippingPostalCode: 'k1a 0b1' };
    expect(quoteShipping([destinationRate], input).options).toHaveLength(1);
    for (const changed of [{ shippingCountry: 'US' }, { shippingCountry: undefined }, { shippingPostalCode: 'M5V' }, { shippingPostalCode: undefined }]) {
      expect(() => quoteShipping([destinationRate], { ...input, ...changed, zoneId: rate.id })).toThrow('no está disponible');
    }
  });
  it('supports inclusive weight bands without treating unknown weight as zero', () => {
    const weighted = { ...rate, minimumWeightGrams: 500, maximumWeightGrams: 1000 };
    const input = { currency: 'BOB', subtotal: 5000, weightGrams: 500 };
    expect(quoteShipping([weighted], input).options).toHaveLength(1);
    expect(quoteShipping([weighted], { ...input, weightGrams: 1001 }).options).toHaveLength(0);
    expect(quoteShipping([weighted], { ...input, weightGrams: null }).options).toHaveLength(0);
  });
});
