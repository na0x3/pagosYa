import { ManualCarrier } from './manual.carrier';
import { CarrierRegistry } from './carrier-registry';

describe('ManualCarrier', () => {
  const carrier = new ManualCarrier();
  it('books without calling anyone and asks for a waybill', async () => {
    await expect(carrier.book()).resolves.toEqual({ trackingNumber: null, carrierRef: null, labelPdf: null, cost: null, needsWaybill: true });
  });
  it('cancels for free and never reports tracking on its own', async () => {
    await expect(carrier.cancel()).resolves.toEqual({ fee: 0 });
    await expect(carrier.track()).resolves.toEqual([]);
  });
});

describe('CarrierRegistry', () => {
  const registry = new CarrierRegistry(new ManualCarrier());
  it('serves every MANUAL carrier code with the manual adapter', () => {
    expect(registry.get('servientrega', 'MANUAL').mode).toBe('MANUAL');
    expect(registry.get('other', 'MANUAL').mode).toBe('MANUAL');
  });
  it('refuses API carriers that have no adapter yet', () => {
    expect(() => registry.get('dhl_express', 'API')).toThrow('no está disponible');
  });
});
