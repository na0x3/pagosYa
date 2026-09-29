import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { EXTENSION_REGISTRY, EXTENSIONS, type ExtensionRegistry } from '../../extensions/registry';
import type { CarrierAdapter } from './carrier';
import { ManualCarrier } from './manual.carrier';

@Injectable()
export class CarrierRegistry {
  // Couriers arrive as extensions (spec 2026-09-27 §7.4); FedEx is the first.
  private readonly api = new Map<string, CarrierAdapter>();
  constructor(private readonly manual: ManualCarrier, @Optional() @Inject(EXTENSION_REGISTRY) registry?: ExtensionRegistry) {
    for (const manifest of registry ?? EXTENSIONS) if (manifest.shippingCarrier) this.api.set(manifest.shippingCarrier.code, manifest.shippingCarrier);
  }
  get(code: string, mode: 'API' | 'MANUAL'): CarrierAdapter {
    if (mode === 'MANUAL') return this.manual;
    const adapter = this.api.get(code);
    if (!adapter) throw new BadRequestException('Este courier no está disponible todavía.');
    return adapter;
  }
}
