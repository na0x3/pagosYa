import type { ShipmentStatus } from '@prisma/client';

export type CarrierCredentials = Record<string, string>;
export type ShipmentParty = { name: string; phone: string; department: string; city: string; street: string; references?: string; lat?: number | null; lng?: number | null };
export type BookInput = { shipmentId: string; orderReference: string; origin: ShipmentParty; destination: ShipmentParty; weightGrams: number | null; declaredAmount: number; currency: string; pickupAt: Date | null; items: Array<{ name: string; quantity: number }> };
export type BookResult = { trackingNumber: string | null; carrierRef: string | null; labelPdf: Buffer | null; cost: number | null; needsWaybill: boolean };
export type CarrierRef = { carrierRef: string | null; trackingNumber: string | null };
export type TrackingUpdate = { status: ShipmentStatus; occurredAt: Date; description?: string; location?: string; carrierEventId?: string };

export interface CarrierAdapter {
  readonly code: string;
  readonly mode: 'API' | 'MANUAL';
  readonly supportsScheduledPickup: boolean;
  book(input: BookInput, creds: CarrierCredentials | null): Promise<BookResult>;
  cancel(ref: CarrierRef, creds: CarrierCredentials | null): Promise<{ fee: number }>;
  track(ref: CarrierRef, creds: CarrierCredentials | null): Promise<TrackingUpdate[]>;
  verifyWebhook?(req: { headers: Record<string, string | undefined>; body: Buffer }): TrackingUpdate[] | null;
  testConnection?(creds: CarrierCredentials): Promise<void>;
}
