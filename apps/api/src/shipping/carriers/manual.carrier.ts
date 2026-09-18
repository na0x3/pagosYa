import { Injectable } from '@nestjs/common';
import type { BookResult, CarrierAdapter, TrackingUpdate } from './carrier';

/** Any carrier without an API: the merchant hands over the parcel with our waybill and types the tracking number. */
@Injectable()
export class ManualCarrier implements CarrierAdapter {
  readonly code = 'manual';
  readonly mode = 'MANUAL' as const;
  readonly supportsScheduledPickup = false;
  async book(): Promise<BookResult> { return { trackingNumber: null, carrierRef: null, labelPdf: null, cost: null, needsWaybill: true }; }
  async cancel() { return { fee: 0 }; }
  async track(): Promise<TrackingUpdate[]> { return []; }
}
