import { BadRequestException, Injectable } from '@nestjs/common';
import type { CarrierAdapter } from './carrier';
import { ManualCarrier } from './manual.carrier';

@Injectable()
export class CarrierRegistry {
  // Phase 2 adds DhlExpressCarrier here, Phase 3 Patio and Uber Direct.
  private readonly api = new Map<string, CarrierAdapter>();
  constructor(private readonly manual: ManualCarrier) {}
  get(code: string, mode: 'API' | 'MANUAL'): CarrierAdapter {
    if (mode === 'MANUAL') return this.manual;
    const adapter = this.api.get(code);
    if (!adapter) throw new BadRequestException('Este courier no está disponible todavía.');
    return adapter;
  }
}
