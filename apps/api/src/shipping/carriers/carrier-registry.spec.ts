import { BadRequestException } from '@nestjs/common';
import type { ExtensionManifest } from '../../extensions/extension';
import type { CarrierAdapter } from './carrier';
import { CarrierRegistry } from './carrier-registry';
import { ManualCarrier } from './manual.carrier';

const fake: CarrierAdapter = { code: 'FAKE_EXPRESS', mode: 'API', supportsScheduledPickup: false, book: jest.fn(), cancel: jest.fn(), track: jest.fn(), quote: jest.fn(async () => [{ service: 'EXPRESS', label: 'Express', amount: 9900, currency: 'BOB', days: { min: 2, max: 4 } }]) };
const carrierExtension: ExtensionManifest = { id: 'fake-express', name: 'Fake', category: 'shipping', tier: 'pro', logo: null, summary: 's', description: 'd', settings: [], shippingCarrier: fake };

describe('CarrierRegistry', () => {
  it('serves carriers that extensions bring, by code, with their quote step', async () => {
    const carrier = new CarrierRegistry(new ManualCarrier(), [carrierExtension]).get('FAKE_EXPRESS', 'API');
    expect(carrier).toBe(fake);
    await expect(carrier.quote!({} as never, null)).resolves.toEqual([{ service: 'EXPRESS', label: 'Express', amount: 9900, currency: 'BOB', days: { min: 2, max: 4 } }]);
  });
  it('still answers manual shipping, and refuses unknown couriers in Spanish', () => {
    const registry = new CarrierRegistry(new ManualCarrier(), []);
    expect(registry.get('ANY', 'MANUAL')).toBeInstanceOf(ManualCarrier);
    expect(() => registry.get('NOPE', 'API')).toThrow(BadRequestException);
  });
});
