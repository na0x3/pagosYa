import { offersPickupAt, storeOffersPickup } from './store-locations';

// Owner 2026-10-22: «some stores don't have pick up». Pickup needs a branch with an address.
const branch = (address?: string, pickupEnabled = true) => ({ id: 'l1', name: 'Centro', ...(address !== undefined ? { address } : {}), pickupEnabled, deliveryEnabled: true, openingHours: [] });

describe('pickup needs an address', () => {
  it('is off without any branch, even with the store switch on', () => {
    expect(storeOffersPickup({ shippingPickupEnabled: true, locations: [] })).toBe(false);
  });
  it('is off for a branch without an address or with pickup off', () => {
    expect(storeOffersPickup({ shippingPickupEnabled: true, locations: [branch('  ')] })).toBe(false);
    expect(storeOffersPickup({ shippingPickupEnabled: true, locations: [branch('Av. Arce 123', false)] })).toBe(false);
    expect(offersPickupAt(branch())).toBe(false);
  });
  it('is on with a pickup branch that has an address, unless the store switch is off', () => {
    expect(storeOffersPickup({ shippingPickupEnabled: true, locations: [branch('Av. Arce 123')] })).toBe(true);
    expect(storeOffersPickup({ shippingPickupEnabled: false, locations: [branch('Av. Arce 123')] })).toBe(false);
    expect(offersPickupAt(branch('Av. Arce 123'))).toBe(true);
  });
});
