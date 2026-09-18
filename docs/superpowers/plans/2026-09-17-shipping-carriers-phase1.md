# Shipping Carriers — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stores can ship orders through named external carriers (Servientrega, OCS, BoA Cargo, Correos, etc.) with per-department rates, a structured Bolivian address + map pin at checkout, an automatically generated waybill on payment, merchant-entered tracking numbers, and a buyer-visible shipment timeline.

**Architecture:** New NestJS module `apps/api/src/shipping/` with a `CarrierAdapter` interface. Phase 1 ships only `ManualCarrier`. Checkout keeps the existing authoritative `shippingZoneId` pricing path; a `DeliveryZone` with a `carrierId` produces a `Shipment` row in `BOOKING`, which the payment-success transaction arms (`nextAttemptAt = now`) and a polling worker books (waybill PDF → private file → `BOOKED`). Everything sits behind `Store.shippingCarriersEnabled`.

**Tech Stack:** NestJS 11, Prisma 5 / Postgres, Jest (unit `*.spec.ts`, e2e `test/*.e2e-spec.ts`), pdfkit, vanilla JS storefront kit (`source-kit/commerce.js`), Leaflet 1.9.4 from cdnjs + OpenStreetMap tiles, merchant-studio (TS + Vite), merchant-dashboard (`index.html`).

**Spec:** `docs/superpowers/specs/2026-09-17-shipping-carriers-design.md`

## Global Constraints

- Departments (exact codes): `LA_PAZ`, `SANTA_CRUZ`, `COCHABAMBA`, `ORURO`, `POTOSI`, `CHUQUISACA`, `TARIJA`, `BENI`, `PANDO`.
- Bolivia bounding box for pins: lat −23.0..−9.6, lng −69.7..−57.4.
- Rollout flag: `Store.shippingCarriersEnabled Boolean @default(false)`; `Store.shippingPrepMinutes Int @default(60)`.
- Booking retries: 3 attempts, backoff 1 min, 5 min, 30 min, then `FAILED`.
- Shipment statuses: `BOOKING`, `BOOKED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `FAILED`, `CANCELED`, `RETURNED`.
- Order mapping: `PICKED_UP`/`IN_TRANSIT` → order `SHIPPED`; `DELIVERED` → order `DELIVERED`.
- Amounts are integer minor units. All user-facing copy is Spanish (es-BO).
- Label/waybill PDFs only via `PrivateFilesService`; never public uploads.
- Never trust a shipping amount from the client.
- Existing stores with `shippingCarriersEnabled = false` must behave exactly as today (the existing `brand-shipping.e2e-spec.ts` must keep passing unchanged).

## Phase-1 scoping decisions (deviations from the spec, deliberate)

1. **No signed quote tokens yet.** Manual carrier prices are recomputable server-side from `DeliveryZone`, so the existing `shippingZoneId` path stays authoritative. Signed `quoteId`s arrive in Phase 2 with DHL, whose prices can't be recomputed.
2. **Quote endpoint reused.** The spec's `POST /v1/stores/:storeId/shipping/quotes` is served by the existing public `POST /v1/stores/public/:slug/shipping/quote`, which gains destination fields and carrier metadata on each option.
3. **Buyer emails reuse the existing `SHIPPED` / `DELIVERED` workspace templates**, with tracking details appended, instead of new `SHIPMENT_BOOKED` / `SHIPMENT_DELIVERED` keys. A manual booking has no tracking number yet, so the first buyer email goes out when the merchant enters one.
4. **`common/secret-box.ts` and merchant carrier credentials move to Phase 2.** Manual carriers have no credentials.
5. **Ledger builders are added and unit-tested now, but they are wired into capture in Phase 2.** Manual carriers are always merchant-billed, so no platform money moves in Phase 1.
6. **Spec gap found — platform accounts require `SettlementMode.AGGREGATOR`.** FACILITATOR merchants settle straight to their bank, so PagosYa can't deduct courier costs. Phase 2 must reject platform carrier accounts for FACILITATOR merchants.

---

## File Structure

**Create**
- `apps/api/prisma/migrations/20260917120000_shipping_carriers/migration.sql` — tables, columns, enums, carrier seed.
- `apps/api/src/shipping/bolivia-address.ts` — department list, bbox check, `ShippingDestinationDto`.
- `apps/api/src/shipping/carriers/carrier.ts` — adapter interface + types.
- `apps/api/src/shipping/carriers/manual.carrier.ts` — manual adapter.
- `apps/api/src/shipping/carriers/carrier-registry.ts` — code → adapter.
- `apps/api/src/shipping/waybill-pdf.ts` — pdfkit waybill.
- `apps/api/src/shipping/shipments.service.ts` — book / tracking / deliver / cancel / retry / switch.
- `apps/api/src/shipping/shipment-booking.worker.ts` — interval worker.
- `apps/api/src/shipping/shipping-ledger.ts` — pure journal builders (wired in Phase 2).
- `apps/api/src/shipping/merchant-shipments.controller.ts` — merchant endpoints.
- `apps/api/src/shipping/ops-carriers.controller.ts` — ops carrier catalog.
- `apps/api/src/shipping/dto.ts` — DTOs for the controllers.
- `apps/api/src/shipping/shipping.module.ts`
- Tests next to each file (`*.spec.ts`) + `apps/api/test/shipping-carriers.e2e-spec.ts`.
- `apps/merchant-dashboard/src/shipment-panel.mjs` — order shipment panel.

**Modify**
- `apps/api/prisma/schema.prisma`
- `apps/api/src/stores/shipping-rates.ts` (+ spec) — department matching, carrier on options.
- `apps/api/src/stores/shipping.controller.ts` — carriers list, prep minutes, flag.
- `apps/api/src/operations/dto/*.ts` (`CreateDeliveryZoneDto`) + `operations.service.ts:createDeliveryZone` — `carrierId`, `departments`.
- `apps/api/src/stores/dto/create-store.dto.ts` (`StoreLocationDto`) — `lat`, `lng`, `department`, `city`.
- `apps/api/src/payment-links/dto/cart-checkout.dto.ts` — structured destination.
- `apps/api/src/stores/stores.service.ts` (~L1805–1882) — destination, shipment creation.
- `apps/api/src/payment-intents/payment-intents.service.ts` (~L597) — arm shipment on success.
- `apps/api/src/consumer/consumer.service.ts` — `trackOrder` shipment data; cancel shipment on CANCELED/REFUNDED.
- `apps/api/src/app.module.ts` — import `ShippingModule`.
- `apps/api/src/stores/source-kit/commerce.js` — address fieldset, Leaflet pin, payload.
- `apps/checkout/src/api.ts`, `cart-quote.ts` — destination fields in the payload type.
- `apps/checkout/src/main.ts` — tracking page shipment timeline.
- `apps/merchant-studio/src/api.ts`, `shipping-settings.ts` — carriers, departments, prep minutes, flag.
- `apps/merchant-dashboard/index.html` — mount shipment panel in order detail.

---

### Task 1: Schema, migration and carrier seed

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260917120000_shipping_carriers/migration.sql`

**Interfaces:**
- Produces: Prisma models `ShippingCarrier`, `StoreCarrierAccount`, `Shipment`, `ShipmentEvent`, `ShipmentCharge`; enums `ShipmentStatus`, `CarrierMode`, `CarrierAccountType`, `ShipmentChargeKind`; new columns on `StoreOrder`, `DeliveryZone`, `Store`; `LedgerAccount.SHIPPING_CLEARING`, `LedgerAccount.COURIER_PAYABLE`.

- [ ] **Step 1: Add enums and models to `schema.prisma`**

Append:

```prisma
enum CarrierMode {
  API
  MANUAL
}

enum CarrierAccountType {
  MERCHANT
  PLATFORM
}

enum ShipmentStatus {
  BOOKING
  BOOKED
  PICKED_UP
  IN_TRANSIT
  DELIVERED
  FAILED
  CANCELED
  RETURNED
}

enum ShipmentChargeKind {
  SURCHARGE
  CANCELLATION_FEE
  CREDIT
}

model ShippingCarrier {
  id                  String                @id @default(cuid())
  code                String                @unique
  name                String
  mode                CarrierMode
  // "{tracking}" is replaced with the URL-encoded tracking number.
  trackingUrlTemplate String?
  platformEnabled     Boolean               @default(false)
  platformMarginBps   Int                   @default(0)
  isActive            Boolean               @default(true)
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
  accounts            StoreCarrierAccount[]
  shipments           Shipment[]
  zones               DeliveryZone[]
}

model StoreCarrierAccount {
  id                    String             @id @default(cuid())
  storeId               String
  store                 Store              @relation(fields: [storeId], references: [id], onDelete: Cascade)
  carrierId             String
  carrier               ShippingCarrier    @relation(fields: [carrierId], references: [id])
  accountType           CarrierAccountType @default(MERCHANT)
  credentialsCiphertext String?
  credentialsHint       String?
  isActive              Boolean            @default(true)
  lastVerifiedAt        DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt

  @@unique([storeId, carrierId])
}

model Shipment {
  id                String             @id @default(cuid())
  orderId           String             @unique
  order             StoreOrder         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  storeId           String
  merchantId        String
  carrierId         String
  carrier           ShippingCarrier    @relation(fields: [carrierId], references: [id])
  accountType       CarrierAccountType @default(MERCHANT)
  // Phase 1: the DeliveryZone id that priced this shipment. Phase 2: signed quote id.
  quoteId           String?
  quotedAmount      Int
  marginAmount      Int                @default(0)
  actualCost        Int?
  currency          String             @default("BOB")
  status            ShipmentStatus     @default(BOOKING)
  trackingNumber    String?
  carrierRef        String?
  labelFileId       String?
  pickupScheduledAt DateTime?
  bookingAttempts   Int                @default(0)
  // null = not armed yet (order unpaid). Payment success sets it to now().
  nextAttemptAt     DateTime?
  lastError         String?
  bookedAt          DateTime?
  deliveredAt       DateTime?
  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt
  events            ShipmentEvent[]
  charges           ShipmentCharge[]

  @@index([status, nextAttemptAt])
  @@index([storeId, status, createdAt])
}

model ShipmentEvent {
  id             String         @id @default(cuid())
  shipmentId     String
  shipment       Shipment       @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  status         ShipmentStatus
  description    String?
  location       String?
  occurredAt     DateTime       @default(now())
  carrierEventId String?
  createdAt      DateTime       @default(now())

  @@unique([shipmentId, carrierEventId])
  @@index([shipmentId, occurredAt])
}

model ShipmentCharge {
  id            String             @id @default(cuid())
  shipmentId    String
  shipment      Shipment           @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  kind          ShipmentChargeKind
  amount        Int
  reason        String
  ledgerGroupId String?
  createdAt     DateTime           @default(now())

  @@index([shipmentId])
}
```

- [ ] **Step 2: Add columns to existing models**

In `enum LedgerAccount` add `SHIPPING_CLEARING` and `COURIER_PAYABLE`.

In `model Store` add:
```prisma
  shippingCarriersEnabled Boolean               @default(false)
  shippingPrepMinutes     Int                   @default(60)
  carrierAccounts         StoreCarrierAccount[]
```

In `model StoreOrder` add:
```prisma
  shippingDepartment String?
  shippingCity       String?
  shippingStreet     String?
  shippingReferences String?
  shippingLat        Float?
  shippingLng        Float?
  recipientName      String?
  recipientPhone     String?
  shipment           Shipment?
```

In `model DeliveryZone` add:
```prisma
  // null = the store's own riders (pre-carrier behavior).
  carrierId   String?
  carrier     ShippingCarrier? @relation(fields: [carrierId], references: [id], onDelete: SetNull)
  departments String[]         @default([])
```

- [ ] **Step 3: Generate the migration without applying it, then add the seed**

Run: `cd apps/api && pnpm prisma migrate dev --create-only --name shipping_carriers`
Rename the generated folder to `20260917120000_shipping_carriers` if the timestamp differs (it must sort after `20260917090000_international_payments`). Append to its `migration.sql`:

```sql
INSERT INTO "ShippingCarrier" ("id","code","name","mode","trackingUrlTemplate","updatedAt") VALUES
  ('car_dhl_express','dhl_express','DHL Express','API','https://www.dhl.com/bo-es/home/tracking.html?tracking-id={tracking}',NOW()),
  ('car_patio','patio','Patio Service','API',NULL,NOW()),
  ('car_uber_direct','uber_direct','Uber Direct','API',NULL,NOW()),
  ('car_servientrega','servientrega','Servientrega Bolivia','MANUAL',NULL,NOW()),
  ('car_ocs','ocs','OCS Bolivia','MANUAL',NULL,NOW()),
  ('car_boa_cargo','boa_cargo','BoA Cargo','MANUAL',NULL,NOW()),
  ('car_correos_bo','correos_bo','Correos de Bolivia','MANUAL',NULL,NOW()),
  ('car_pakex','pakex','Pakex','MANUAL',NULL,NOW()),
  ('car_bc_plus','bc_plus','BC Plus Courier','MANUAL',NULL,NOW()),
  ('car_cargo_express','cargo_express','Cargo Express','MANUAL',NULL,NOW()),
  ('car_other','other','Otro courier','MANUAL',NULL,NOW());
-- API carriers stay inactive until their adapters ship (Phase 2/3).
UPDATE "ShippingCarrier" SET "isActive" = false WHERE "mode" = 'API';
```

- [ ] **Step 4: Apply and generate**

Run: `cd apps/api && pnpm prisma migrate dev && pnpm prisma generate`
Expected: migration applied, client generated, no drift warning.

- [ ] **Step 5: Verify nothing regressed**

Run: `cd apps/api && pnpm test -- shipping-rates && pnpm test:e2e -- brand-shipping`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260917120000_shipping_carriers
git commit -m "Add shipping carrier, shipment and structured address schema"
```

---

### Task 2: Bolivian address rules

**Files:**
- Create: `apps/api/src/shipping/bolivia-address.ts`
- Test: `apps/api/src/shipping/bolivia-address.spec.ts`

**Interfaces:**
- Produces: `BOLIVIA_DEPARTMENTS: readonly Department[]`, `type Department`, `DEPARTMENT_LABELS: Record<Department,string>`, `isInsideBolivia(lat:number,lng:number): boolean`, `class ShippingDestinationDto { department; city; street; references?; lat; lng; recipientName; recipientPhone }`.

- [ ] **Step 1: Write the failing test**

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BOLIVIA_DEPARTMENTS, isInsideBolivia, ShippingDestinationDto } from './bolivia-address';

const valid = { department: 'LA_PAZ', city: 'La Paz', street: 'Av. 6 de Agosto 2170', references: 'Frente al parque', lat: -16.5, lng: -68.12, recipientName: 'Ana Quispe', recipientPhone: '+59171234567' };

describe('Bolivian shipping destination', () => {
  it('lists the nine departments', () => {
    expect(BOLIVIA_DEPARTMENTS).toEqual(['LA_PAZ', 'SANTA_CRUZ', 'COCHABAMBA', 'ORURO', 'POTOSI', 'CHUQUISACA', 'TARIJA', 'BENI', 'PANDO']);
  });
  it('accepts pins inside Bolivia and rejects pins outside', () => {
    expect(isInsideBolivia(-17.78, -63.18)).toBe(true);
    expect(isInsideBolivia(-12.05, -77.04)).toBe(false); // Lima
    expect(isInsideBolivia(-23.01, -65)).toBe(false);
    expect(isInsideBolivia(Number.NaN, -65)).toBe(false);
  });
  it('validates a complete destination', async () => {
    expect(await validate(plainToInstance(ShippingDestinationDto, valid))).toHaveLength(0);
  });
  it('rejects unknown departments, foreign pins, bad phones and missing fields', async () => {
    for (const changed of [{ department: 'LIMA' }, { lat: -12.05, lng: -77.04 }, { recipientPhone: 'abc' }, { street: '' }, { city: undefined }]) {
      expect((await validate(plainToInstance(ShippingDestinationDto, { ...valid, ...changed }))).length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd apps/api && pnpm test -- bolivia-address`
Expected: FAIL, "Cannot find module './bolivia-address'".

- [ ] **Step 3: Implement**

```ts
import { IsIn, IsNumber, IsOptional, IsString, Matches, MaxLength, MinLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

export const BOLIVIA_DEPARTMENTS = ['LA_PAZ', 'SANTA_CRUZ', 'COCHABAMBA', 'ORURO', 'POTOSI', 'CHUQUISACA', 'TARIJA', 'BENI', 'PANDO'] as const;
export type Department = (typeof BOLIVIA_DEPARTMENTS)[number];
export const DEPARTMENT_LABELS: Record<Department, string> = {
  LA_PAZ: 'La Paz', SANTA_CRUZ: 'Santa Cruz', COCHABAMBA: 'Cochabamba', ORURO: 'Oruro', POTOSI: 'Potosí',
  CHUQUISACA: 'Chuquisaca', TARIJA: 'Tarija', BENI: 'Beni', PANDO: 'Pando',
};

export function isInsideBolivia(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23.0 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;
}

@ValidatorConstraint({ name: 'insideBolivia' })
class InsideBolivia implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments) {
    const { lat, lng } = args.object as { lat: number; lng: number };
    return isInsideBolivia(lat, lng);
  }
  defaultMessage() { return 'La ubicación del mapa debe estar dentro de Bolivia.'; }
}

export class ShippingDestinationDto {
  @IsIn(BOLIVIA_DEPARTMENTS) department!: Department;
  @IsString() @MinLength(2) @MaxLength(80) city!: string;
  @IsString() @MinLength(3) @MaxLength(200) street!: string;
  @IsOptional() @IsString() @MaxLength(300) references?: string;
  @IsNumber() @Validate(InsideBolivia) lat!: number;
  @IsNumber() lng!: number;
  @IsString() @MinLength(2) @MaxLength(120) recipientName!: string;
  @Matches(/^\+?[0-9 ]{7,16}$/) recipientPhone!: string;
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/api && pnpm test -- bolivia-address`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shipping/bolivia-address.ts apps/api/src/shipping/bolivia-address.spec.ts
git commit -m "Validate Bolivian departments and delivery pins"
```

---

### Task 3: Department-aware rate matching

**Files:**
- Modify: `apps/api/src/stores/shipping-rates.ts`
- Test: `apps/api/src/stores/shipping-rates.spec.ts`

**Interfaces:**
- Produces: `ShippingRate` gains optional `departments?: string[]` and `carrierId?: string | null`; `quoteShipping` input gains optional `shippingDepartment?: string`; options gain `carrierId: string | null`; exported `type ShippingOption`.

- [ ] **Step 1: Add failing tests** (append inside the existing `describe`)

```ts
  it('matches departments and rejects rates for other departments or unknown destinations', () => {
    const scz = { ...rate, id: 'scz', departments: ['SANTA_CRUZ'], carrierId: 'car_servientrega' };
    const input = { currency: 'BOB', subtotal: 5000, weightGrams: null, shippingDepartment: 'SANTA_CRUZ' };
    expect(quoteShipping([scz], input).options).toEqual([{ id: 'scz', name: 'La Paz', amount: 1500, currency: 'BOB', carrierId: 'car_servientrega' }]);
    expect(quoteShipping([scz], { ...input, shippingDepartment: 'LA_PAZ' }).options).toHaveLength(0);
    expect(quoteShipping([scz], { ...input, shippingDepartment: undefined }).options).toHaveLength(0);
  });
  it('keeps rates without departments available everywhere and reports own-rider rates as carrierId null', () => {
    expect(quoteShipping([rate], { currency: 'BOB', subtotal: 5000, weightGrams: null, shippingDepartment: 'BENI' }).options[0].carrierId).toBeNull();
  });
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- shipping-rates`
Expected: FAIL (missing `carrierId` on options; department not filtered).

- [ ] **Step 3: Implement**: replace the file body:

```ts
import { BadRequestException } from '@nestjs/common';

export type ShippingRate = { countryCodes?: string[]; postalPrefixes?: string[]; departments?: string[]; carrierId?: string | null; id: string; name: string; fee: number; currency: string; minimumOrder: number; maximumOrder: number | null; freeAbove: number | null; minimumWeightGrams: number | null; maximumWeightGrams: number | null; isActive: boolean };
export type ShippingOption = { id: string; name: string; amount: number; currency: string; carrierId: string | null };
export function quoteShipping(rates: ShippingRate[], input: { shippingCountry?: string; shippingPostalCode?: string; shippingDepartment?: string; zoneId?: string; currency: string; subtotal: number; weightGrams: number | null }) {
  const eligible = rates.filter(rate => rate.isActive && (!rate.countryCodes?.length || rate.countryCodes.includes(input.shippingCountry || ''))
    && (!rate.postalPrefixes?.length || !!input.shippingPostalCode && rate.postalPrefixes.some(prefix => input.shippingPostalCode!.replace(/[ -]/g, '').toUpperCase().startsWith(prefix)))
    && (!rate.departments?.length || !!input.shippingDepartment && rate.departments.includes(input.shippingDepartment))
    && rate.currency === input.currency && input.subtotal >= rate.minimumOrder
    && (rate.maximumOrder === null || input.subtotal <= rate.maximumOrder)
    && (rate.minimumWeightGrams === null || input.weightGrams !== null && input.weightGrams >= rate.minimumWeightGrams)
    && (rate.maximumWeightGrams === null || input.weightGrams !== null && input.weightGrams <= rate.maximumWeightGrams));
  const options: ShippingOption[] = eligible.map(rate => ({ id: rate.id, name: rate.name, amount: rate.freeAbove !== null && input.subtotal >= rate.freeAbove ? 0 : rate.fee, currency: rate.currency, carrierId: rate.carrierId ?? null }));
  const selected = options.find(option => option.id === input.zoneId);
  if (input.zoneId && !selected) throw new BadRequestException('La opción de envío no está disponible para este pedido.');
  return { options, selected: selected ?? null };
}
```

- [ ] **Step 4: Run all shipping-rate tests**

Run: `cd apps/api && pnpm test -- shipping-rates`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stores/shipping-rates.ts apps/api/src/stores/shipping-rates.spec.ts
git commit -m "Match shipping rates by Bolivian department and expose their carrier"
```

---

### Task 4: Carrier adapter interface, manual carrier, registry

**Files:**
- Create: `apps/api/src/shipping/carriers/carrier.ts`, `manual.carrier.ts`, `carrier-registry.ts`
- Test: `apps/api/src/shipping/carriers/manual.carrier.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  type CarrierCredentials = Record<string, string>;
  type ShipmentParty = { name: string; phone: string; department: string; city: string; street: string; references?: string; lat?: number | null; lng?: number | null };
  type BookInput = { shipmentId: string; orderReference: string; origin: ShipmentParty; destination: ShipmentParty; weightGrams: number | null; declaredAmount: number; currency: string; pickupAt: Date | null; items: Array<{ name: string; quantity: number }> };
  type BookResult = { trackingNumber: string | null; carrierRef: string | null; labelPdf: Buffer | null; cost: number | null; needsWaybill: boolean };
  type CarrierRef = { carrierRef: string | null; trackingNumber: string | null };
  type TrackingUpdate = { status: ShipmentStatus; occurredAt: Date; description?: string; location?: string; carrierEventId?: string };
  interface CarrierAdapter { code; mode: 'API'|'MANUAL'; supportsScheduledPickup; book(input, creds); cancel(ref, creds): Promise<{ fee: number }>; track(ref, creds): Promise<TrackingUpdate[]>; verifyWebhook?(req); testConnection?(creds) }
  class CarrierRegistry { get(code: string, mode: 'API'|'MANUAL'): CarrierAdapter }
  ```
  `quote()` is left out in Phase 1 (manual pricing is `quoteShipping`); Phase 2 adds it as an optional member.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- manual.carrier`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `carrier.ts`**

```ts
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
```

- [ ] **Step 4: Implement `manual.carrier.ts`**

```ts
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
```

- [ ] **Step 5: Implement `carrier-registry.ts`**

```ts
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
```

- [ ] **Step 6: Run the tests**

Run: `cd apps/api && pnpm test -- manual.carrier`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shipping/carriers
git commit -m "Add carrier adapter interface with a manual carrier"
```

---

### Task 5: Waybill PDF

**Files:**
- Create: `apps/api/src/shipping/waybill-pdf.ts`
- Test: `apps/api/src/shipping/waybill-pdf.spec.ts`

**Interfaces:**
- Consumes: `BookInput`, `ShipmentParty` (Task 4); `DEPARTMENT_LABELS` (Task 2).
- Produces: `renderWaybillPdf(input: BookInput & { carrierName: string; storeName: string }): Promise<Buffer>`.

- [ ] **Step 1: Write the failing test**

```ts
import { renderWaybillPdf } from './waybill-pdf';

const party = { name: 'Tienda Sol', phone: '+59170000000', department: 'LA_PAZ', city: 'La Paz', street: 'Calle 21 #100' };
const input = {
  shipmentId: 'shp_1', orderReference: 'AB12CD34', carrierName: 'Servientrega Bolivia', storeName: 'Tienda Sol',
  origin: party, destination: { ...party, name: 'Ana Quispe', department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: 'Portón verde' },
  weightGrams: 1200, declaredAmount: 15000, currency: 'BOB', pickupAt: null, items: [{ name: 'Café 500 g', quantity: 2 }],
};

describe('renderWaybillPdf', () => {
  it('produces a one-page PDF', async () => {
    const pdf = await renderWaybillPdf(input);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it('handles unknown weight and missing references', async () => {
    const pdf = await renderWaybillPdf({ ...input, weightGrams: null, destination: { ...input.destination, references: undefined } });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- waybill-pdf`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import PDFDocument from 'pdfkit';
import type { BookInput, ShipmentParty } from './carriers/carrier';
import { DEPARTMENT_LABELS, type Department } from './bolivia-address';

const INK = '#111111';
const MUTED = '#666666';

function money(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function partyBlock(doc: PDFKit.PDFDocument, title: string, party: ShipmentParty, x: number, y: number) {
  doc.fillColor(MUTED).fontSize(9).text(title.toUpperCase(), x, y);
  doc.fillColor(INK).fontSize(12).text(party.name, x, y + 14, { width: 240 });
  doc.fontSize(10).text(party.phone, { width: 240 });
  doc.text(party.street, { width: 240 });
  doc.text(`${party.city}, ${DEPARTMENT_LABELS[party.department as Department] ?? party.department}`, { width: 240 });
  if (party.references) doc.fillColor(MUTED).text(`Ref.: ${party.references}`, { width: 240 });
}

export function renderWaybillPdf(input: BookInput & { carrierName: string; storeName: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fillColor(INK).fontSize(18).text(`Guía de envío · ${input.carrierName}`, 28, 28);
    doc.fillColor(MUTED).fontSize(10).text(`Pedido ${input.orderReference} · ${input.storeName} · ${new Date().toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' })}`);
    partyBlock(doc, 'Remitente', input.origin, 28, 90);
    partyBlock(doc, 'Destinatario', input.destination, 300, 90);
    doc.fillColor(INK).fontSize(10)
      .text(`Peso: ${input.weightGrams === null ? 'por pesar' : `${(input.weightGrams / 1000).toFixed(2)} kg`}`, 28, 230)
      .text(`Valor declarado: ${money(input.declaredAmount, input.currency)}`)
      .text(`Contenido: ${input.items.map(item => `${item.name} ×${item.quantity}`).join(', ').slice(0, 300)}`, { width: 520 });
    doc.fillColor(MUTED).fontSize(9).text(`Nº de seguimiento del courier: ______________________   ID PagosYa: ${input.shipmentId}`, 28, 330);
    doc.end();
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm test -- waybill-pdf`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shipping/waybill-pdf.ts apps/api/src/shipping/waybill-pdf.spec.ts
git commit -m "Render printable waybills for manual carriers"
```

---

### Task 6: ShipmentsService

**Files:**
- Create: `apps/api/src/shipping/shipments.service.ts`
- Test: `apps/api/src/shipping/shipments.service.spec.ts`

**Interfaces:**
- Consumes: `CarrierRegistry` (T4), `renderWaybillPdf` (T5), `PrivateFilesService` (`../commerce-platform/private-files.service`), `PrismaService`, `queueStoreEmail` (`../stores/email-workspace.config`), `createOrderTrackingToken` + `DEVELOPMENT_ORDER_TRACKING_SECRET` (import from the same module `payment-intents.service.ts` imports them from; confirm with `grep -rn "export.*DEVELOPMENT_ORDER_TRACKING_SECRET" apps/api/src`), `ConfigService`.
- Produces (used by T7, T8, T9, T12):
  - `BOOKING_BACKOFF_MS = [60_000, 300_000, 1_800_000]`
  - `book(shipmentId: string): Promise<void>`: one attempt; on error it schedules a retry or marks `FAILED`.
  - `setTrackingNumber(merchantId, shipmentId, trackingNumber): Promise<ShipmentView>`
  - `markDelivered(merchantId, shipmentId): Promise<ShipmentView>`
  - `retry(merchantId, shipmentId): Promise<ShipmentView>`
  - `switchCarrier(merchantId, shipmentId, carrierId): Promise<ShipmentView>`: active manual carriers only.
  - `cancelForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void>`
  - `viewForMerchant(merchantId, orderId): Promise<ShipmentView | null>`
  - `label(merchantId, shipmentId): Promise<Buffer>`
  - `static trackingUrl(template: string | null | undefined, trackingNumber: string | null | undefined): string | null`
  - `type ShipmentView = { id; status; carrier: { id; code; name; mode }; trackingNumber; trackingUrl; hasLabel; lastError; bookingAttempts; quotedAmount; currency; events: Array<{ status; description; location; occurredAt }> }`

- [ ] **Step 1: Write the failing tests** (an in-memory Prisma fake, so the tests check behavior rather than mock calls)

```ts
import { ShipmentsService, BOOKING_BACKOFF_MS } from './shipments.service';
import { ManualCarrier } from './carriers/manual.carrier';
import { CarrierRegistry } from './carriers/carrier-registry';

const carrier = { id: 'car_servientrega', code: 'servientrega', name: 'Servientrega Bolivia', mode: 'MANUAL', trackingUrlTemplate: 'https://t.example/{tracking}' };

function fakePrisma() {
  const db: any = { shipments: new Map<string, any>(), events: [] as any[], orders: new Map<string, any>(), statusEvents: [] as any[], emails: [] as any[] };
  const carriers: Record<string, any> = { car_servientrega: carrier, car_ocs: { ...carrier, id: 'car_ocs', code: 'ocs', name: 'OCS Bolivia', trackingUrlTemplate: null }, car_dhl_express: { ...carrier, id: 'car_dhl_express', code: 'dhl_express', mode: 'API' } };
  const hydrate = (s: any) => s && { ...s, carrier: carriers[s.carrierId], events: db.events.filter((e: any) => e.shipmentId === s.id), order: db.orders.get(s.orderId) };
  const matches = (s: any, where: any) => (!where.id || s.id === where.id) && (!where.orderId || s.orderId === where.orderId) && (!where.merchantId || s.merchantId === where.merchantId)
    && (where.status === undefined || (typeof where.status === 'string' ? s.status === where.status : where.status.in.includes(s.status)));
  const client: any = {
    shipment: {
      findUnique: async ({ where }: any) => hydrate([...db.shipments.values()].find((s: any) => matches(s, where))),
      findFirst: async ({ where }: any) => hydrate([...db.shipments.values()].find((s: any) => matches(s, where))),
      update: async ({ where, data }: any) => { Object.assign(db.shipments.get(where.id), data); return hydrate(db.shipments.get(where.id)); },
      updateMany: async ({ where, data }: any) => { let count = 0; for (const s of db.shipments.values()) if (matches(s, where)) { Object.assign(s, data); count++; } return { count }; },
    },
    shipmentEvent: { create: async ({ data }: any) => { db.events.push({ occurredAt: new Date(), description: null, location: null, ...data }); return data; } },
    shippingCarrier: { findFirst: async ({ where }: any) => carriers[where.id] ?? null },
    storeOrder: { updateMany: async ({ where, data }: any) => { const o = db.orders.get(where.id); if (o && where.status.in.includes(o.status)) { Object.assign(o, data); return { count: 1 }; } return { count: 0 }; } },
    storeOrderStatusEvent: { create: async ({ data }: any) => { db.statusEvents.push(data); return { id: `evt_${db.statusEvents.length}`, ...data }; } },
    paymentIntent: { findUnique: async () => ({ livemode: true, customerEmail: 'ana@example.com', customerName: 'Ana' }) },
    store: { findUnique: async () => ({ name: 'Tienda Sol', contactPhone: '+59170000000', shippingPrepMinutes: 60, locations: [{ id: 'loc1', name: 'Centro', address: 'Calle 21', department: 'LA_PAZ', city: 'La Paz', lat: -16.5, lng: -68.1 }] }) },
    storeRetention: { findUnique: async () => null },
    storeEmailDelivery: { upsert: async ({ create }: any) => { db.emails.push(create); return create; } },
    $transaction: async (fn: any) => fn(client),
  };
  return { db, client };
}

function seed(db: any, overrides: any = {}) {
  db.orders.set('ord_1', { id: 'ord_1', storeId: 'st_1', storeName: 'Tienda Sol', status: 'PAID', paymentIntentId: 'pi_1', amount: 16500, currency: 'BOB', items: [{ name: 'Café', quantity: 1 }], fulfillmentLocationId: 'loc1', shippingDepartment: 'SANTA_CRUZ', shippingCity: 'Santa Cruz', shippingStreet: 'Av. Busch 55', shippingReferences: null, shippingLat: -17.78, shippingLng: -63.18, recipientName: 'Ana', recipientPhone: '+59171111111' });
  db.shipments.set('shp_1', { id: 'shp_1', orderId: 'ord_1', storeId: 'st_1', merchantId: 'm_1', carrierId: 'car_servientrega', status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), quotedAmount: 1500, currency: 'BOB', trackingNumber: null, carrierRef: null, labelFileId: null, lastError: null, ...overrides });
}

describe('ShipmentsService', () => {
  const FILE = '11111111-1111-1111-1111-111111111111';
  const files = { put: jest.fn(async () => FILE), get: jest.fn(async () => Buffer.from('%PDF-')) };
  const config = { get: (key: string) => (key === 'app.checkoutOrigin' ? 'https://pay.example' : key === 'app.orderTrackingSecret' ? 'test-secret' : undefined) };
  const make = (client: any) => new ShipmentsService(client, new CarrierRegistry(new ManualCarrier()), files as any, config as any);
  beforeEach(() => { files.put.mockReset(); files.put.mockResolvedValue(FILE); });

  it('books a manual shipment: stores a waybill, marks BOOKED and the order PREPARING', async () => {
    const { db, client } = fakePrisma(); seed(db);
    await make(client).book('shp_1');
    expect(db.shipments.get('shp_1')).toMatchObject({ status: 'BOOKED', labelFileId: FILE, nextAttemptAt: null, bookingAttempts: 1 });
    expect(files.put).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf');
    expect(db.orders.get('ord_1').status).toBe('PREPARING');
    expect(db.events.map((e: any) => e.status)).toEqual(['BOOKED']);
  });

  it('ignores shipments that are not in BOOKING', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'CANCELED' });
    await make(client).book('shp_1');
    expect(files.put).not.toHaveBeenCalled();
  });

  it('retries with backoff and fails after three attempts', async () => {
    const { db, client } = fakePrisma(); seed(db);
    files.put.mockRejectedValue(new Error('storage down'));
    const service = make(client);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const before = Date.now();
      await service.book('shp_1');
      const s = db.shipments.get('shp_1');
      if (attempt < 3) { expect(s.status).toBe('BOOKING'); expect(s.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(before + BOOKING_BACKOFF_MS[attempt - 1]); }
      else expect(s).toMatchObject({ status: 'FAILED', nextAttemptAt: null, lastError: 'storage down', bookingAttempts: 3 });
    }
  });

  it('entering a tracking number ships the order and emails the buyer the tracking link', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    const view = await make(client).setTrackingNumber('m_1', 'shp_1', ' SV-123 ');
    expect(view).toMatchObject({ trackingNumber: 'SV-123', trackingUrl: 'https://t.example/SV-123', status: 'IN_TRANSIT' });
    expect(db.orders.get('ord_1').status).toBe('SHIPPED');
    expect(db.statusEvents.map((e: any) => e.status)).toEqual(['SHIPPED']);
  });

  it("rejects tracking on another merchant's shipment", async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    await expect(make(client).setTrackingNumber('m_other', 'shp_1', 'SV-1')).rejects.toThrow('no encontrado');
  });

  it('marks delivered and moves the order to DELIVERED', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'IN_TRANSIT', trackingNumber: 'SV-1' }); db.orders.get('ord_1').status = 'SHIPPED';
    await make(client).markDelivered('m_1', 'shp_1');
    expect(db.shipments.get('shp_1').status).toBe('DELIVERED');
    expect(db.orders.get('ord_1').status).toBe('DELIVERED');
  });

  it('retry re-arms a FAILED shipment; switchCarrier only accepts active manual carriers', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'FAILED', bookingAttempts: 3 });
    const service = make(client);
    await service.retry('m_1', 'shp_1');
    expect(db.shipments.get('shp_1')).toMatchObject({ status: 'BOOKING', bookingAttempts: 0 });
    db.shipments.get('shp_1').status = 'FAILED';
    await service.switchCarrier('m_1', 'shp_1', 'car_ocs');
    expect(db.shipments.get('shp_1')).toMatchObject({ carrierId: 'car_ocs', status: 'BOOKING' });
    db.shipments.get('shp_1').status = 'FAILED';
    await expect(service.switchCarrier('m_1', 'shp_1', 'car_dhl_express')).rejects.toThrow('manual');
  });

  it('cancelForOrder cancels shipments not yet picked up and leaves picked-up ones alone', async () => {
    const { db, client } = fakePrisma(); seed(db, { status: 'BOOKED' });
    await make(client).cancelForOrder(client, 'ord_1');
    expect(db.shipments.get('shp_1').status).toBe('CANCELED');
    db.shipments.get('shp_1').status = 'IN_TRANSIT';
    await make(client).cancelForOrder(client, 'ord_1');
    expect(db.shipments.get('shp_1').status).toBe('IN_TRANSIT');
  });

  it('builds tracking URLs safely', () => {
    expect(ShipmentsService.trackingUrl('https://t.example/{tracking}', 'A B/1')).toBe('https://t.example/A%20B%2F1');
    expect(ShipmentsService.trackingUrl(null, 'X')).toBeNull();
    expect(ShipmentsService.trackingUrl('https://t.example/{tracking}', null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- shipments.service`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `shipments.service.ts`**

```ts
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderFulfillmentStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateFilesService } from '../commerce-platform/private-files.service';
import { queueStoreEmail } from '../stores/email-workspace.config';
import { createOrderTrackingToken, DEVELOPMENT_ORDER_TRACKING_SECRET } from '../consumer/order-tracking-token';
import { CarrierRegistry } from './carriers/carrier-registry';
import type { ShipmentParty } from './carriers/carrier';
import { renderWaybillPdf } from './waybill-pdf';

export const BOOKING_BACKOFF_MS = [60_000, 300_000, 1_800_000];
const MAX_ATTEMPTS = BOOKING_BACKOFF_MS.length;
const CANCELABLE: ShipmentStatus[] = ['BOOKING', 'BOOKED', 'FAILED'];
const TRACKABLE: ShipmentStatus[] = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT'];

export type ShipmentView = {
  id: string; status: ShipmentStatus; carrier: { id: string; code: string; name: string; mode: string };
  trackingNumber: string | null; trackingUrl: string | null; hasLabel: boolean; lastError: string | null;
  bookingAttempts: number; quotedAmount: number; currency: string;
  events: Array<{ status: ShipmentStatus; description: string | null; location: string | null; occurredAt: Date }>;
};

type StoreLocation = { id: string; name?: string; address?: string | null; department?: string; city?: string; lat?: number; lng?: number };
type OrderRef = { id: string; storeId: string; storeName: string; paymentIntentId: string; amount: number; currency: string };

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly carriers: CarrierRegistry,
    private readonly files: PrivateFilesService,
    private readonly config: ConfigService,
  ) {}

  static trackingUrl(template: string | null | undefined, trackingNumber: string | null | undefined): string | null {
    return template && trackingNumber ? template.replace('{tracking}', encodeURIComponent(trackingNumber)) : null;
  }

  private view(s: any): ShipmentView {
    return {
      id: s.id, status: s.status,
      carrier: { id: s.carrier.id, code: s.carrier.code, name: s.carrier.name, mode: s.carrier.mode },
      trackingNumber: s.trackingNumber ?? null,
      trackingUrl: ShipmentsService.trackingUrl(s.carrier.trackingUrlTemplate, s.trackingNumber),
      hasLabel: !!s.labelFileId, lastError: s.lastError ?? null, bookingAttempts: s.bookingAttempts,
      quotedAmount: s.quotedAmount, currency: s.currency,
      events: (s.events ?? []).map((e: any) => ({ status: e.status, description: e.description ?? null, location: e.location ?? null, occurredAt: e.occurredAt })),
    };
  }

  private async owned(merchantId: string, shipmentId: string): Promise<any> {
    const shipment = await this.prisma.shipment.findFirst({ where: { id: shipmentId, merchantId }, include: { carrier: true, events: { orderBy: { occurredAt: 'asc' } }, order: true } });
    if (!shipment) throw new NotFoundException('Envío no encontrado');
    return shipment;
  }

  /** Moves the order forward only from states where that move is legal; never backwards. */
  private async advanceOrder(tx: Prisma.TransactionClient, order: OrderRef, to: OrderFulfillmentStatus, from: OrderFulfillmentStatus[], details?: string) {
    const changed = await tx.storeOrder.updateMany({ where: { id: order.id, status: { in: from } }, data: { status: to } });
    if (!changed.count) return;
    const event = await tx.storeOrderStatusEvent.create({ data: { orderId: order.id, status: to } });
    if (to !== 'SHIPPED' && to !== 'DELIVERED') return;
    const payment = await tx.paymentIntent.findUnique({ where: { id: order.paymentIntentId } });
    if (payment?.livemode) await queueStoreEmail(tx, order.storeId, to, event.id, payment.customerEmail, { store: order.storeName, order: order.id, customer: payment.customerName || 'cliente', amount: `${(order.amount / 100).toFixed(2)} ${order.currency}`, ...(details ? { details } : {}) });
  }

  private buyerTrackingLink(orderId: string) {
    const origin = (this.config.get<string>('app.checkoutOrigin') ?? 'http://localhost:5174').replace(/\/$/, '');
    return `${origin}/track/${createOrderTrackingToken(orderId, this.config.get<string>('app.orderTrackingSecret') ?? DEVELOPMENT_ORDER_TRACKING_SECRET)}`;
  }

  async book(shipmentId: string): Promise<void> {
    const shipment: any = await this.prisma.shipment.findUnique({ where: { id: shipmentId }, include: { carrier: true, order: true } });
    if (!shipment || shipment.status !== 'BOOKING') return;
    const attempt = shipment.bookingAttempts + 1;
    try {
      const order = shipment.order;
      const store: any = await this.prisma.store.findUnique({ where: { id: shipment.storeId }, select: { name: true, contactPhone: true, locations: true, shippingPrepMinutes: true } });
      const locations = (Array.isArray(store?.locations) ? store.locations : []) as StoreLocation[];
      const branch = locations.find(l => l.id === order.fulfillmentLocationId) ?? locations[0];
      const origin: ShipmentParty = { name: store?.name ?? order.storeName, phone: store?.contactPhone ?? '', department: branch?.department ?? '', city: branch?.city ?? '', street: branch?.address ?? '', lat: branch?.lat ?? null, lng: branch?.lng ?? null };
      const destination: ShipmentParty = { name: order.recipientName ?? '', phone: order.recipientPhone ?? '', department: order.shippingDepartment ?? '', city: order.shippingCity ?? '', street: order.shippingStreet ?? '', references: order.shippingReferences ?? undefined, lat: order.shippingLat, lng: order.shippingLng };
      const adapter = this.carriers.get(shipment.carrier.code, shipment.carrier.mode);
      const items = (Array.isArray(order.items) ? order.items : []).map((i: any) => ({ name: String(i.name ?? 'Producto'), quantity: Number(i.quantity) || 1 }));
      const pickupAt = adapter.supportsScheduledPickup ? new Date(Date.now() + (store?.shippingPrepMinutes ?? 60) * 60_000) : null;
      const input = { shipmentId: shipment.id, orderReference: order.id.slice(-8).toUpperCase(), origin, destination, weightGrams: null, declaredAmount: order.amount - shipment.quotedAmount, currency: shipment.currency, pickupAt, items };
      const result = await adapter.book(input, null);
      const pdf = result.labelPdf ?? (result.needsWaybill ? await renderWaybillPdf({ ...input, carrierName: shipment.carrier.name, storeName: store?.name ?? order.storeName }) : null);
      const labelFileId = pdf ? await this.files.put(pdf, 'application/pdf') : null;
      await this.prisma.$transaction(async tx => {
        const updated = await tx.shipment.updateMany({ where: { id: shipment.id, status: 'BOOKING' }, data: { status: 'BOOKED', bookingAttempts: attempt, nextAttemptAt: null, lastError: null, labelFileId, trackingNumber: result.trackingNumber, carrierRef: result.carrierRef, actualCost: result.cost, pickupScheduledAt: pickupAt, bookedAt: new Date() } });
        if (!updated.count) return;
        await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'BOOKED', description: `Reservado con ${shipment.carrier.name}` } });
        await this.advanceOrder(tx, order, 'PREPARING', ['PAID']);
      });
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      this.logger.warn(`Booking ${shipment.id} attempt ${attempt} failed: ${message}`);
      const failed = attempt >= MAX_ATTEMPTS;
      await this.prisma.shipment.updateMany({ where: { id: shipment.id, status: 'BOOKING' }, data: { bookingAttempts: attempt, lastError: message, status: failed ? 'FAILED' : 'BOOKING', nextAttemptAt: failed ? null : new Date(Date.now() + BOOKING_BACKOFF_MS[attempt - 1]) } });
    }
  }

  async setTrackingNumber(merchantId: string, shipmentId: string, trackingNumber: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    const value = trackingNumber.trim();
    if (!/^[A-Za-z0-9 ._\/-]{3,60}$/.test(value)) throw new BadRequestException('Escribe un número de seguimiento válido.');
    if (!TRACKABLE.includes(shipment.status)) throw new BadRequestException('Este envío ya no acepta número de seguimiento.');
    await this.prisma.$transaction(async tx => {
      await tx.shipment.update({ where: { id: shipment.id }, data: { trackingNumber: value, status: 'IN_TRANSIT' } });
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'IN_TRANSIT', description: `Entregado a ${shipment.carrier.name} · ${value}` } });
      const url = ShipmentsService.trackingUrl(shipment.carrier.trackingUrlTemplate, value);
      await this.advanceOrder(tx, shipment.order, 'SHIPPED', ['PAID', 'PREPARING'], `Courier: ${shipment.carrier.name}\nNº de seguimiento: ${value}${url ? `\nRastrea en el courier: ${url}` : ''}\nSigue tu pedido: ${this.buyerTrackingLink(shipment.order.id)}`);
    });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  async markDelivered(merchantId: string, shipmentId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (!TRACKABLE.includes(shipment.status)) throw new BadRequestException('Este envío no se puede marcar como entregado.');
    await this.prisma.$transaction(async tx => {
      await tx.shipment.update({ where: { id: shipment.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
      await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'DELIVERED', description: 'Entregado al destinatario' } });
      await this.advanceOrder(tx, shipment.order, 'DELIVERED', ['PAID', 'PREPARING', 'SHIPPED']);
    });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  async retry(merchantId: string, shipmentId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (shipment.status !== 'FAILED') throw new BadRequestException('Solo se reintentan envíos fallidos.');
    await this.prisma.shipment.update({ where: { id: shipment.id }, data: { status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), lastError: null } });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  async switchCarrier(merchantId: string, shipmentId: string, carrierId: string): Promise<ShipmentView> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (shipment.status !== 'FAILED') throw new BadRequestException('Solo se cambia el courier de envíos fallidos.');
    const carrier = await this.prisma.shippingCarrier.findFirst({ where: { id: carrierId, isActive: true } });
    if (!carrier || carrier.mode !== 'MANUAL') throw new BadRequestException('Elige un courier manual activo.');
    await this.prisma.shipment.update({ where: { id: shipment.id }, data: { carrierId: carrier.id, accountType: 'MERCHANT', status: 'BOOKING', bookingAttempts: 0, nextAttemptAt: new Date(), lastError: null } });
    return this.view(await this.owned(merchantId, shipmentId));
  }

  /** Runs inside the order-cancel/refund transaction. Picked-up parcels are handled by returns, not here. */
  async cancelForOrder(tx: Prisma.TransactionClient, orderId: string): Promise<void> {
    const shipment: any = await tx.shipment.findUnique({ where: { orderId }, include: { carrier: true } });
    if (!shipment || !CANCELABLE.includes(shipment.status)) return;
    if (shipment.status === 'BOOKED') {
      // Phase 2: a non-zero fee becomes a ShipmentCharge + cancellationFeeJournal.
      await this.carriers.get(shipment.carrier.code, shipment.carrier.mode).cancel({ carrierRef: shipment.carrierRef ?? null, trackingNumber: shipment.trackingNumber ?? null }, null);
    }
    const changed = await tx.shipment.updateMany({ where: { id: shipment.id, status: { in: CANCELABLE } }, data: { status: 'CANCELED', nextAttemptAt: null } });
    if (changed.count) await tx.shipmentEvent.create({ data: { shipmentId: shipment.id, status: 'CANCELED', description: 'Envío cancelado con el pedido' } });
  }

  async viewForMerchant(merchantId: string, orderId: string): Promise<ShipmentView | null> {
    const shipment = await this.prisma.shipment.findFirst({ where: { orderId, merchantId }, include: { carrier: true, events: { orderBy: { occurredAt: 'asc' } } } });
    return shipment ? this.view(shipment) : null;
  }

  async label(merchantId: string, shipmentId: string): Promise<Buffer> {
    const shipment = await this.owned(merchantId, shipmentId);
    if (!shipment.labelFileId) throw new NotFoundException('Este envío todavía no tiene guía.');
    return this.files.get(shipment.labelFileId);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm test -- shipments.service`
Expected: PASS (9 tests). If the fake lacks a Prisma method that the service legitimately uses, add it to `fakePrisma`; don't bend the service to fit the fake.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shipping/shipments.service.ts apps/api/src/shipping/shipments.service.spec.ts
git commit -m "Book, track, deliver and cancel carrier shipments"
```

---

### Task 7: Booking worker and module wiring

**Files:**
- Create: `apps/api/src/shipping/shipment-booking.worker.ts`, `apps/api/src/shipping/shipping.module.ts`
- Test: `apps/api/src/shipping/shipment-booking.worker.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ShipmentsService.book` (T6).
- Produces: `ShipmentBookingWorker.tick(): Promise<number>`; `ShippingModule` exports `ShipmentsService`.

- [ ] **Step 1: Write the failing test**

```ts
import { ShipmentBookingWorker } from './shipment-booking.worker';

describe('ShipmentBookingWorker', () => {
  it('books only armed, due BOOKING shipments, oldest first, 20 at a time', async () => {
    const findMany = jest.fn(async () => [{ id: 'a' }, { id: 'b' }]);
    const book = jest.fn(async () => undefined);
    const worker = new ShipmentBookingWorker({ shipment: { findMany } } as any, { book } as any);
    await expect(worker.tick()).resolves.toBe(2);
    expect(findMany).toHaveBeenCalledWith({ where: { status: 'BOOKING', nextAttemptAt: { lte: expect.any(Date) } }, orderBy: { nextAttemptAt: 'asc' }, take: 20, select: { id: true } });
    expect(book.mock.calls.map(c => c[0])).toEqual(['a', 'b']);
  });
  it('does not overlap runs', async () => {
    let release!: () => void;
    const book = jest.fn(() => new Promise<void>(r => { release = r; }));
    const worker = new ShipmentBookingWorker({ shipment: { findMany: async () => [{ id: 'a' }] } } as any, { book } as any);
    const first = worker.tick();
    await new Promise(r => setImmediate(r));
    await expect(worker.tick()).resolves.toBe(0);
    release(); await first;
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- shipment-booking.worker`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the worker**

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ShipmentsService } from './shipments.service';

@Injectable()
export class ShipmentBookingWorker {
  private readonly logger = new Logger(ShipmentBookingWorker.name);
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly shipments: ShipmentsService) {}

  @Interval('shipment-booking', 30_000)
  async run() { await this.tick().catch(error => this.logger.error(`Shipment booking failed: ${(error as Error).message}`)); }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.shipment.findMany({ where: { status: 'BOOKING', nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: 'asc' }, take: 20, select: { id: true } });
      for (const { id } of due) await this.shipments.book(id);
      return due.length;
    } finally { this.running = false; }
  }
}
```

- [ ] **Step 4: Implement the module** (controllers are added in T9/T10)

First check how sibling modules get Prisma and private files: `grep -n "imports\|providers\|exports" apps/api/src/commerce-platform/commerce-platform.module.ts apps/api/src/operations/operations.module.ts`. Copy that pattern. The shape is:

```ts
import { Module } from '@nestjs/common';
import { PrivateFilesService } from '../commerce-platform/private-files.service';
import { ManualCarrier } from './carriers/manual.carrier';
import { CarrierRegistry } from './carriers/carrier-registry';
import { ShipmentsService } from './shipments.service';
import { ShipmentBookingWorker } from './shipment-booking.worker';

@Module({
  providers: [ManualCarrier, CarrierRegistry, PrivateFilesService, ShipmentsService, ShipmentBookingWorker],
  exports: [ShipmentsService],
})
export class ShippingModule {}
```

(Add `imports: [PrismaModule]` if `PrismaService` isn't global. If `CommercePlatformModule` exports `PrivateFilesService`, import that module instead of re-providing the service.)

- [ ] **Step 5: Register**: add `ShippingModule` to `imports` in `apps/api/src/app.module.ts`.

- [ ] **Step 6: Run tests and build**

Run: `cd apps/api && pnpm test -- shipment-booking.worker && pnpm build`
Expected: PASS; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shipping/shipment-booking.worker.ts apps/api/src/shipping/shipment-booking.worker.spec.ts apps/api/src/shipping/shipping.module.ts apps/api/src/app.module.ts
git commit -m "Book due carrier shipments from a background worker"
```

---

### Task 8: Checkout, payment and cancellation integration (+ e2e)

**Files:**
- Modify: `apps/api/src/payment-links/dto/cart-checkout.dto.ts`, `apps/api/src/stores/stores.service.ts` (~L1805–1882), `apps/api/src/payment-intents/payment-intents.service.ts` (~L597–606), `apps/api/src/consumer/consumer.service.ts` (`updateOrderStatus`), `apps/api/src/consumer/consumer.module.ts`, `apps/api/src/consumer/consumer.service.spec.ts`
- Test: `apps/api/test/shipping-carriers.e2e-spec.ts`

**Interfaces:**
- Consumes: `ShippingDestinationDto` (T2), `quoteShipping` + `ShippingOption` (T3), `ShipmentsService.cancelForOrder` (T6), `ShipmentBookingWorker.tick` (T7).
- Produces: `CartCheckoutDto.shippingDestination?: ShippingDestinationDto`. Carrier zones create a `Shipment` at checkout, and payment success arms it.

- [ ] **Step 1: Write the failing e2e test**

(The rate and flag are set through Prisma here; T9 moves them to the API.)

```ts
import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShipmentBookingWorker } from '../src/shipping/shipment-booking.worker';

describe('Carrier shipping checkout', () => {
  let app: INestApplication, prisma: PrismaService, token: string, storeId: string, slug: string, productId: string, rateId: string, merchantId: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const destination = { department: 'SANTA_CRUZ', city: 'Santa Cruz', street: 'Av. Busch 55', references: 'Portón verde', lat: -17.78, lng: -63.18, recipientName: 'Ana Quispe', recipientPhone: '+59171234567' };
  const pay = (paid: any) => request(app.getHttpServer()).post(`/v1/payment_intents/${paid.id}/confirm`).set({ Authorization: `Bearer ${paid.clientSecret}` }).send({ paymentMethod: { type: 'CARD', token: 'tok_visa_success' } }).expect(201);
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init(); prisma = app.get(PrismaService);
    token = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'CarrierOwner', email: 'carrier-owner@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body.testKeys.secretKey;
    const store = (await request(app.getHttpServer()).post('/v1/stores').set(auth()).send({ name: 'Tienda Courier' }).expect(201)).body;
    storeId = store.id; slug = store.slug;
    productId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/payment_links`).set(auth()).send({ name: 'Café', amount: 10000, currency: 'BOB', shippingWeightGrams: 500 }).expect(201)).body.id;
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/shipping`).set(auth()).send({ enabled: true, pickupEnabled: false }).expect(201);
    merchantId = (await prisma.store.update({ where: { id: storeId }, data: { shippingCarriersEnabled: true } })).merchantId;
    rateId = (await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Servientrega · Santa Cruz', fee: 2500, currency: 'BOB', departments: ['SANTA_CRUZ'], carrierId: 'car_servientrega' } })).id;
  });
  afterAll(async () => { await app?.close(); });

  const cart = () => ({ items: [{ paymentLinkId: productId, quantity: 1 }], fulfillmentMethod: 'delivery', shippingZoneId: rateId, shippingAddress: 'Av. Busch 55, Santa Cruz', shippingDestination: destination });

  it('offers the carrier rate only for its department', async () => {
    const quote = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
    expect(quote.shippingOptions).toEqual([expect.objectContaining({ id: rateId, amount: 2500, carrierId: 'car_servientrega' })]);
    const lp = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, shippingDestination: { ...destination, department: 'LA_PAZ' } }).expect(201)).body;
    expect(lp.shippingOptions).toEqual([]);
  });

  it('requires a structured destination for carrier rates and rejects pins outside Bolivia', async () => {
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingDestination: undefined }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingDestination: { ...destination, lat: -12.05, lng: -77.04 } }).expect(400);
  });

  it('creates an unarmed shipment at checkout, arms it on payment and books it with a waybill', async () => {
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    expect(paid.amount).toBe(12500);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order).toMatchObject({ shippingDepartment: 'SANTA_CRUZ', shippingCity: 'Santa Cruz', recipientPhone: '+59171234567', shippingLat: -17.78 });
    expect(await prisma.shipment.findUnique({ where: { orderId: order.id } })).toMatchObject({ status: 'BOOKING', nextAttemptAt: null, quotedAmount: 2500, carrierId: 'car_servientrega', quoteId: rateId });
    await pay(paid);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).nextAttemptAt).not.toBeNull();
    await app.get(ShipmentBookingWorker).tick();
    const booked = await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(booked.status).toBe('BOOKED'); expect(booked.labelFileId).toMatch(/^[a-f\d-]{36}$/);
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PREPARING');
  });

  it('cancels the shipment when the merchant cancels the order', async () => {
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    await pay(paid);
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    await request(app.getHttpServer()).patch(`/v1/orders/${order.id}/fulfillment`).set(auth()).send({ status: 'CANCELED' }).expect(200);
    expect((await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe('CANCELED');
  });

  it('leaves own-rider rates on the old path (no shipment row)', async () => {
    const own = await prisma.deliveryZone.create({ data: { merchantId, storeId, name: 'Moto propia', fee: 1000, currency: 'BOB' } });
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: own.id, shippingDestination: undefined }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(await prisma.shipment.findUnique({ where: { orderId: order.id } })).toBeNull();
    expect(await prisma.deliveryAssignment.findUnique({ where: { orderId: order.id } })).not.toBeNull();
  });
});
```

If `PATCH /v1/orders/:id/fulfillment` returns 401 with a secret key, copy the merchant-session auth helper from whichever e2e file already calls that route (`grep -ln "fulfillment" apps/api/test`).

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test:e2e -- shipping-carriers`
Expected: FAIL (`shippingDestination` rejected by `forbidNonWhitelisted`; no `carrierId`; no shipment row).

- [ ] **Step 3: Extend the DTO**: in `cart-checkout.dto.ts`:

```ts
import { ShippingDestinationDto } from "../../shipping/bolivia-address";
// inside CartCheckoutDto:
  @ApiProperty({ required: false, type: () => ShippingDestinationDto })
  @IsOptional() @ValidateNested() @Type(() => ShippingDestinationDto)
  shippingDestination?: ShippingDestinationDto;
```

If `stores-public.controller.ts:48` (`:slug/shipping/quote`) binds a different DTO class, add the same property there too.

- [ ] **Step 4: Wire into `stores.service.ts`**
- Import `type ShippingOption` from `./shipping-rates`. Change `let shipping: {...} | null` to `let shipping: ShippingOption | null = null;` and `shippingOptions` to `ShippingOption[]`.
- At the `quoteShipping(...)` call (~L1810), add `shippingDepartment: dto.shippingDestination?.department`.
- After `shipping = quote.selected;` in the `delivery` branch, add:
  ```ts
        if (!quoteOnly && shipping?.carrierId && !store.shippingCarriersEnabled) throw new BadRequestException('La opción de envío no está disponible para este pedido.');
        if (!quoteOnly && shipping?.carrierId && !dto.shippingDestination) throw new BadRequestException('Completa la dirección de entrega y marca tu ubicación en el mapa.');
  ```
  Confirm `store` exposes `shippingCarriersEnabled` (if the store query uses `select`, add it).
- In `tx.storeOrder.create({ data })`, add:
  ```ts
          ...(shipping?.carrierId && dto.shippingDestination ? {
            shippingDepartment: dto.shippingDestination.department,
            shippingCity: dto.shippingDestination.city.trim(),
            shippingStreet: dto.shippingDestination.street.trim(),
            shippingReferences: dto.shippingDestination.references?.trim() || null,
            shippingLat: dto.shippingDestination.lat,
            shippingLng: dto.shippingDestination.lng,
            recipientName: dto.shippingDestination.recipientName.trim(),
            recipientPhone: dto.shippingDestination.recipientPhone.replace(/\s+/g, ''),
          } : {}),
  ```
- Replace the `deliveryAssignment.create` line (~L1882) with:
  ```ts
      if (shipping?.carrierId) await tx.shipment.create({ data: { orderId: order.id, storeId: store.id, merchantId: store.merchantId, carrierId: shipping.carrierId, quoteId: shipping.id, quotedAmount: shipping.amount, currency: shipping.currency } });
      else if (shipping) await tx.deliveryAssignment.create({ data: { merchantId: store.merchantId, storeId: store.id, orderId: order.id, zoneId: shipping.id, fee: shipping.amount, address: dto.shippingAddress!.trim() } });
  ```
- The `metadata.shipping` spread keeps working because `ShippingOption` only adds `carrierId`.

- [ ] **Step 5: Arm on payment success**: in `payment-intents.service.ts`, inside `if (order?.status === OrderFulfillmentStatus.AWAITING_PAYMENT) { ... }` and right after the `tx.storeOrder.update` to `PAID`:

```ts
          await tx.shipment.updateMany({ where: { orderId: order.id, status: 'BOOKING', nextAttemptAt: null }, data: { nextAttemptAt: new Date() } });
```

If `payment-intents.service.spec.ts` builds a fake `tx` without `shipment`, add `shipment: { updateMany: jest.fn(async () => ({ count: 0 })) }` there.

- [ ] **Step 6: Cancel with the order**: `consumer.service.ts`:
- Add constructor param `private readonly shipments: ShipmentsService` (import from `../shipping/shipments.service`). Add `ShippingModule` to `ConsumerModule.imports`.
- In `updateOrderStatus`, right after `const statusEvent = await tx.storeOrderStatusEvent.create(...)`:
  ```ts
      if (status === OrderFulfillmentStatus.CANCELED || status === OrderFulfillmentStatus.REFUNDED) await this.shipments.cancelForOrder(tx, order.id);
  ```
- In `consumer.service.spec.ts`, pass `{ cancelForOrder: jest.fn() } as any` as the new constructor argument wherever the service is built.

- [ ] **Step 7: Run the suites**

Run: `cd apps/api && pnpm test:e2e -- shipping-carriers brand-shipping && pnpm test -- consumer.service payment-intents stores.service`
Expected: all PASS; `brand-shipping` unchanged.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payment-links/dto/cart-checkout.dto.ts apps/api/src/stores/stores.service.ts apps/api/src/stores/stores-public.controller.ts apps/api/src/payment-intents apps/api/src/consumer apps/api/test/shipping-carriers.e2e-spec.ts
git commit -m "Create carrier shipments at checkout and book them after payment"
```

---

### Task 9: Merchant shipping API (carriers, rates, branches, shipments)

**Files:**
- Create: `apps/api/src/shipping/dto.ts`, `apps/api/src/shipping/merchant-shipments.controller.ts`
- Modify: `apps/api/src/shipping/shipping.module.ts`, `apps/api/src/stores/shipping.controller.ts`, the file declaring `CreateDeliveryZoneDto` in `apps/api/src/operations/dto/`, `apps/api/src/operations/operations.service.ts` (`createDeliveryZone`), `apps/api/src/stores/dto/create-store.dto.ts` (`StoreLocationDto`), and the store service code that persists `locations` if it maps fields explicitly
- Test: extend `apps/api/test/shipping-carriers.e2e-spec.ts`

**Interfaces:**
- Consumes: `ShipmentsService` (T6), `BOLIVIA_DEPARTMENTS` (T2).
- Produces HTTP:
  - `GET /v1/stores/:storeId/shipping` adds `carriersEnabled`, `prepMinutes`, `carriers: Array<{ id; code; name; mode }>` (active MANUAL only).
  - `POST /v1/stores/:storeId/shipping` accepts optional `carriersEnabled: boolean`, `prepMinutes: 0..1440`.
  - `POST /v1/stores/:storeId/operations/delivery/zones` accepts optional `carrierId`, `departments`.
  - `GET /v1/orders/:orderId/shipment` → `ShipmentView | null`
  - `GET /v1/shipments/:id/label` → `application/pdf`
  - `POST /v1/shipments/:id/tracking` `{ trackingNumber }` · `POST /v1/shipments/:id/delivered` · `POST /v1/shipments/:id/retry` · `POST /v1/shipments/:id/carrier` `{ carrierId }`
  - `StoreLocationDto` accepts optional `lat`, `lng`, `department`, `city`.

- [ ] **Step 1: Switch the e2e setup to the API and add failing cases**

In `beforeAll`, replace the `prisma.store.update` + `prisma.deliveryZone.create` lines with:

```ts
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/shipping`).set(auth()).send({ enabled: true, pickupEnabled: false, carriersEnabled: true, prepMinutes: 45 }).expect(201);
    merchantId = (await prisma.store.findUniqueOrThrow({ where: { id: storeId } })).merchantId;
    rateId = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Servientrega · Santa Cruz', fee: 2500, departments: ['SANTA_CRUZ'], carrierId: 'car_servientrega' }).expect(201)).body.id;
```

Add:

```ts
  it('lets the merchant see the shipment, download the waybill, add tracking and mark delivered', async () => {
    const settings = (await request(app.getHttpServer()).get(`/v1/stores/${storeId}/shipping`).set(auth()).expect(200)).body;
    expect(settings).toMatchObject({ carriersEnabled: true, prepMinutes: 45 });
    expect(settings.carriers.map((c: any) => c.code)).toEqual(expect.arrayContaining(['servientrega', 'ocs', 'correos_bo']));
    expect(settings.carriers.map((c: any) => c.code)).not.toContain('dhl_express');
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'X', fee: 1, departments: ['LIMA'] }).expect(400);
    await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Y', fee: 1, carrierId: 'car_dhl_express' }).expect(400);

    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send(cart()).expect(201)).body;
    await pay(paid);
    await app.get(ShipmentBookingWorker).tick();
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    const view = (await request(app.getHttpServer()).get(`/v1/orders/${order.id}/shipment`).set(auth()).expect(200)).body;
    expect(view).toMatchObject({ status: 'BOOKED', hasLabel: true, carrier: { code: 'servientrega' } });
    const pdf = await request(app.getHttpServer()).get(`/v1/shipments/${view.id}/label`).set(auth()).buffer(true)
      .parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', d => chunks.push(d)); res.on('end', () => cb(null, Buffer.concat(chunks))); }).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const other = (await request(app.getHttpServer()).post('/v1/merchants').send({ name: 'CarrierOther', email: 'carrier-other@test.example', settlementMode: 'AGGREGATOR' }).expect(201)).body.testKeys.secretKey;
    await request(app.getHttpServer()).get(`/v1/shipments/${view.id}/label`).set({ Authorization: `Bearer ${other}` }).expect(404);
    const tracked = (await request(app.getHttpServer()).post(`/v1/shipments/${view.id}/tracking`).set(auth()).send({ trackingNumber: 'SV-000123' }).expect(201)).body;
    expect(tracked).toMatchObject({ status: 'IN_TRANSIT', trackingNumber: 'SV-000123' });
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('SHIPPED');
    await request(app.getHttpServer()).post(`/v1/shipments/${view.id}/delivered`).set(auth()).expect(201);
    expect((await prisma.storeOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('DELIVERED');
  });

  it('stores branch coordinates for pickup origins', async () => {
    const updated = (await request(app.getHttpServer()).patch(`/v1/stores/${storeId}`).set(auth()).send({ locations: [{ id: 'centro', name: 'Centro', address: 'Calle 21 #100', department: 'LA_PAZ', city: 'La Paz', lat: -16.5, lng: -68.12 }] }).expect(200)).body;
    expect(updated.locations[0]).toMatchObject({ department: 'LA_PAZ', lat: -16.5 });
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}`).set(auth()).send({ locations: [{ id: 'x', name: 'X', lat: 40, lng: -3 }] }).expect(400);
  });
```

Before running, confirm the store update route (`grep -n "@Patch" apps/api/src/stores/stores.controller.ts`) and the required `StoreLocationDto` fields (`sed -n 960,1000p apps/api/src/stores/dto/create-store.dto.ts`). Add any other required location field with the values `create-store.dto.spec.ts:250` uses.

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test:e2e -- shipping-carriers`
Expected: FAIL (unknown properties; 404 routes).

- [ ] **Step 3: DTOs**: `apps/api/src/shipping/dto.ts`:

```ts
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
export class TrackingNumberDto { @IsString() @MaxLength(60) @Matches(/^[A-Za-z0-9 ._\/-]{3,60}$/) trackingNumber!: string; }
export class SwitchCarrierDto { @IsString() @MaxLength(48) carrierId!: string; }
export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() platformEnabled?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(5000) platformMarginBps?: number;
}
```

- [ ] **Step 4: Merchant controller**: `merchant-shipments.controller.ts`:

```ts
import { Body, Controller, Get, Header, Param, Post, StreamableFile, UseGuards } from '@nestjs/common';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { ShipmentsService } from './shipments.service';
import { SwitchCarrierDto, TrackingNumberDto } from './dto';

@UseGuards(MerchantAuthGuard)
@Controller('v1')
export class MerchantShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}
  @Get('orders/:orderId/shipment') view(@CurrentMerchant() m: { id: string }, @Param('orderId') orderId: string) { return this.shipments.viewForMerchant(m.id, orderId); }
  @Get('shipments/:id/label') @Header('Content-Type', 'application/pdf') @Header('Cache-Control', 'private, no-store')
  async label(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return new StreamableFile(await this.shipments.label(m.id, id), { disposition: `attachment; filename="guia-${id}.pdf"` }); }
  @Post('shipments/:id/tracking') tracking(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: TrackingNumberDto) { return this.shipments.setTrackingNumber(m.id, id, dto.trackingNumber); }
  @Post('shipments/:id/delivered') delivered(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.shipments.markDelivered(m.id, id); }
  @Post('shipments/:id/retry') retry(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.shipments.retry(m.id, id); }
  @Post('shipments/:id/carrier') carrier(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: SwitchCarrierDto) { return this.shipments.switchCarrier(m.id, id, dto.carrierId); }
}
```

Add `controllers: [MerchantShipmentsController]` to `ShippingModule`. (`merchant-orders.controller.ts` only declares `PATCH v1/orders/:id/fulfillment`, so there's no route clash.)

- [ ] **Step 5: Settings endpoint**: `stores/shipping.controller.ts`:
- DTO:
  ```ts
  class ShippingSettingsDto {
    @IsBoolean() enabled!: boolean; @IsBoolean() pickupEnabled!: boolean;
    @IsOptional() @IsBoolean() carriersEnabled?: boolean;
    @IsOptional() @IsInt() @Min(0) @Max(1440) prepMinutes?: number;
  }
  ```
  (import `IsOptional`).
- `owner()` select adds `shippingCarriersEnabled: true, shippingPrepMinutes: true`.
- `get()` adds a third query to the `Promise.all`: `this.prisma.shippingCarrier.findMany({ where: { isActive: true, mode: 'MANUAL' }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true, mode: true } })`, and returns `{ enabled, pickupEnabled, carriersEnabled: store.shippingCarriersEnabled, prepMinutes: store.shippingPrepMinutes, rates, products, carriers }`.
- `save()` data adds `...(dto.carriersEnabled !== undefined ? { shippingCarriersEnabled: dto.carriersEnabled } : {}), ...(dto.prepMinutes !== undefined ? { shippingPrepMinutes: dto.prepMinutes } : {})`.

- [ ] **Step 6: Zone DTO + service**
- `CreateDeliveryZoneDto` adds:
  ```ts
  @IsOptional() @IsString() @MaxLength(48) carrierId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(9) @IsIn(BOLIVIA_DEPARTMENTS, { each: true }) departments?: string[];
  ```
  (import `BOLIVIA_DEPARTMENTS` from `../../shipping/bolivia-address`; add any missing class-validator imports).
- `operations.service.ts:createDeliveryZone`, before `create`:
  ```ts
    if (dto.carrierId && !(await this.prisma.shippingCarrier.findFirst({ where: { id: dto.carrierId, isActive: true, mode: 'MANUAL' } }))) throw new BadRequestException('Elige un courier disponible.');
  ```
  and add `carrierId: dto.carrierId ?? null, departments: dto.departments ?? []` to the create `data`.

- [ ] **Step 7: Branch coordinates**: `StoreLocationDto` adds:
```ts
  @ApiPropertyOptional() @IsOptional() @IsIn(BOLIVIA_DEPARTMENTS) department?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-23.0) @Max(-9.6) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-69.7) @Max(-57.4) lng?: number;
```
Then run `grep -n "mapEmbedUrl" apps/api/src/stores/stores.service.ts`. If locations are rebuilt field by field when saved, add `department`, `city`, `lat`, `lng` next to `mapEmbedUrl`.

- [ ] **Step 8: Run the suites**

Run: `cd apps/api && pnpm test:e2e -- shipping-carriers brand-shipping && pnpm test -- create-store.dto operations.service`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/shipping apps/api/src/stores/shipping.controller.ts apps/api/src/operations apps/api/src/stores/dto/create-store.dto.ts apps/api/src/stores/stores.service.ts apps/api/test/shipping-carriers.e2e-spec.ts
git commit -m "Let merchants configure carriers and manage shipments"
```

---

### Task 10: Ops carrier catalog

**Files:**
- Create: `apps/api/src/shipping/ops-carriers.controller.ts`
- Modify: `apps/api/src/shipping/shipping.module.ts`
- Test: `apps/api/src/shipping/ops-carriers.controller.spec.ts`

**Interfaces:**
- Consumes: `OpsAuthGuard` (`../ops/guards/ops-auth.guard`), `CurrentOpsUser` (`../ops/decorators/current-ops-user.decorator`), `AuditLogService` (`../ops/audit-log.service`), `UpdateCarrierDto` (T9).
- Produces HTTP: `GET /internal/shipping/carriers`, `PATCH /internal/shipping/carriers/:id`, `GET /internal/shipping/shipments/failed`.

- [ ] **Step 1: Read the audit call shape**

Run: `sed -n 60,80p apps/api/src/ops/support.service.ts` and `grep -n "record(" -A12 apps/api/src/ops/audit-log.service.ts | head -20`. In Step 3, use the exact field names `record()` takes. The code below assumes `{ opsUserId, action, targetType, targetId, metadata }`; rename to match.

- [ ] **Step 2: Write the failing test**

```ts
import { OpsCarriersController } from './ops-carriers.controller';

describe('OpsCarriersController', () => {
  const tx = { shippingCarrier: { update: jest.fn(async ({ data }: any) => ({ id: 'car_ocs', ...data })) } };
  const prisma: any = { $transaction: (fn: any) => fn(tx), shippingCarrier: { findMany: jest.fn(async () => []) }, shipment: { findMany: jest.fn(async () => []) } };
  const audit = { record: jest.fn(async () => undefined) };
  const controller = new OpsCarriersController(prisma, audit as any);
  it('updates a carrier and writes an audit entry', async () => {
    await controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'https://ocs.example/t/{tracking}', platformMarginBps: 500 });
    expect(tx.shippingCarrier.update).toHaveBeenCalledWith({ where: { id: 'car_ocs' }, data: { trackingUrlTemplate: 'https://ocs.example/t/{tracking}', platformMarginBps: 500 } });
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
  it('rejects templates without the placeholder or not on https', async () => {
    await expect(controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'http://x.example/{tracking}' })).rejects.toThrow('https');
    await expect(controller.update({ id: 'ops_1' } as any, 'car_ocs', { trackingUrlTemplate: 'https://x.example/' })).rejects.toThrow('{tracking}');
  });
});
```

- [ ] **Step 3: Implement**

```ts
import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { OpsAuthGuard } from '../ops/guards/ops-auth.guard';
import { CurrentOpsUser } from '../ops/decorators/current-ops-user.decorator';
import { AuditLogService } from '../ops/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCarrierDto } from './dto';

@UseGuards(OpsAuthGuard)
@Controller('internal/shipping')
export class OpsCarriersController {
  constructor(private readonly prisma: PrismaService, private readonly auditLog: AuditLogService) {}
  @Get('carriers') list() { return this.prisma.shippingCarrier.findMany({ orderBy: { name: 'asc' } }); }
  @Get('shipments/failed') failed() {
    return this.prisma.shipment.findMany({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: 100, include: { carrier: { select: { name: true } } } });
  }
  @Patch('carriers/:id')
  async update(@CurrentOpsUser() opsUser: { id: string }, @Param('id') id: string, @Body() dto: UpdateCarrierDto) {
    if (dto.trackingUrlTemplate) {
      if (!dto.trackingUrlTemplate.startsWith('https://')) throw new BadRequestException('La plantilla debe usar https.');
      if (!dto.trackingUrlTemplate.includes('{tracking}')) throw new BadRequestException('La plantilla debe incluir {tracking}.');
    }
    return this.prisma.$transaction(async tx => {
      const carrier = await tx.shippingCarrier.update({ where: { id }, data: dto });
      await this.auditLog.record(tx, { opsUserId: opsUser.id, action: 'shipping.carrier.update', targetType: 'ShippingCarrier', targetId: id, metadata: { ...dto } });
      return carrier;
    });
  }
}
```

Register in `ShippingModule.controllers`. Make `AuditLogService` available too: import the module that exports it (`grep -n "AuditLogService" apps/api/src/ops/ops.module.ts`) or add it to providers.

- [ ] **Step 4: Run tests and build**

Run: `cd apps/api && pnpm test -- ops-carriers && pnpm build`
Expected: PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shipping
git commit -m "Let ops manage the carrier catalog and see failed shipments"
```

---

### Task 11: Shipping ledger builders (wired in Phase 2)

**Files:**
- Create: `apps/api/src/shipping/shipping-ledger.ts`
- Test: `apps/api/src/shipping/shipping-ledger.spec.ts`

**Interfaces:**
- Consumes: `JournalLine` from `../ledger/ledger.service`.
- Produces: `shippingCollectedJournal({ merchantId, transactionId, amount })`, `shipmentBookedJournal({ merchantId, cost, margin })`, `shipmentAdjustmentJournal({ merchantId, delta })`, `cancellationFeeJournal({ merchantId, fee })`, each `JournalLine[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { LedgerDirection } from '@prisma/client';
import { cancellationFeeJournal, shipmentAdjustmentJournal, shipmentBookedJournal, shippingCollectedJournal } from './shipping-ledger';

const net = (lines: { direction: LedgerDirection; amount: number }[]) => lines.reduce((s, l) => s + (l.direction === 'DEBIT' ? l.amount : -l.amount), 0);

describe('shipping ledger journals', () => {
  it('reclassifies the collected shipping line from the merchant to shipping clearing', () => {
    const lines = shippingCollectedJournal({ merchantId: 'm', transactionId: 't', amount: 2500 });
    expect(net(lines)).toBe(0);
    expect(lines).toEqual([
      { account: 'MERCHANT_PAYABLE', direction: 'DEBIT', amount: 2500, merchantId: 'm', transactionId: 't' },
      { account: 'SHIPPING_CLEARING', direction: 'CREDIT', amount: 2500, merchantId: 'm', transactionId: 't' },
    ]);
  });
  it('splits booked shipping into courier payable and PagosYa margin', () => {
    const lines = shipmentBookedJournal({ merchantId: 'm', cost: 2300, margin: 200 });
    expect(net(lines)).toBe(0);
    expect(lines.find(l => l.account === 'COURIER_PAYABLE')?.amount).toBe(2300);
    expect(lines.find(l => l.account === 'PAGOSYA_FEE_REVENUE')?.amount).toBe(200);
  });
  it('omits a zero margin line', () => {
    expect(shipmentBookedJournal({ merchantId: 'm', cost: 2500, margin: 0 }).some(l => l.account === 'PAGOSYA_FEE_REVENUE')).toBe(false);
  });
  it('charges surcharges to the merchant and credits refunds back', () => {
    const up = shipmentAdjustmentJournal({ merchantId: 'm', delta: 400 });
    const down = shipmentAdjustmentJournal({ merchantId: 'm', delta: -400 });
    expect(net(up)).toBe(0); expect(net(down)).toBe(0);
    expect(up.find(l => l.account === 'MERCHANT_PAYABLE')?.direction).toBe('DEBIT');
    expect(down.find(l => l.account === 'MERCHANT_PAYABLE')?.direction).toBe('CREDIT');
    expect(shipmentAdjustmentJournal({ merchantId: 'm', delta: 0 })).toEqual([]);
  });
  it('charges cancellation fees to the merchant', () => {
    const lines = cancellationFeeJournal({ merchantId: 'm', fee: 800 });
    expect(net(lines)).toBe(0);
    expect(lines[0]).toMatchObject({ account: 'MERCHANT_PAYABLE', direction: 'DEBIT', amount: 800 });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test -- shipping-ledger`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
import { LedgerAccount, LedgerDirection } from '@prisma/client';
import type { JournalLine } from '../ledger/ledger.service';

const { DEBIT, CREDIT } = LedgerDirection;

/** Posted after the capture journal for platform-account shipments: the shipping line never becomes the merchant's money. */
export function shippingCollectedJournal(p: { merchantId: string; transactionId: string; amount: number }): JournalLine[] {
  return [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: p.amount, merchantId: p.merchantId, transactionId: p.transactionId },
    { account: LedgerAccount.SHIPPING_CLEARING, direction: CREDIT, amount: p.amount, merchantId: p.merchantId, transactionId: p.transactionId },
  ];
}

export function shipmentBookedJournal(p: { merchantId: string; cost: number; margin: number }): JournalLine[] {
  return [
    { account: LedgerAccount.SHIPPING_CLEARING, direction: DEBIT, amount: p.cost + p.margin, merchantId: p.merchantId },
    { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount: p.cost, merchantId: p.merchantId },
    ...(p.margin > 0 ? [{ account: LedgerAccount.PAGOSYA_FEE_REVENUE, direction: CREDIT, amount: p.margin, merchantId: p.merchantId }] : []),
  ];
}

export function shipmentAdjustmentJournal(p: { merchantId: string; delta: number }): JournalLine[] {
  if (p.delta === 0) return [];
  const amount = Math.abs(p.delta);
  return p.delta > 0
    ? [{ account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount, merchantId: p.merchantId }, { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount, merchantId: p.merchantId }]
    : [{ account: LedgerAccount.COURIER_PAYABLE, direction: DEBIT, amount, merchantId: p.merchantId }, { account: LedgerAccount.MERCHANT_PAYABLE, direction: CREDIT, amount, merchantId: p.merchantId }];
}

export function cancellationFeeJournal(p: { merchantId: string; fee: number }): JournalLine[] {
  return [
    { account: LedgerAccount.MERCHANT_PAYABLE, direction: DEBIT, amount: p.fee, merchantId: p.merchantId },
    { account: LedgerAccount.COURIER_PAYABLE, direction: CREDIT, amount: p.fee, merchantId: p.merchantId },
  ];
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm test -- shipping-ledger`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shipping/shipping-ledger.ts apps/api/src/shipping/shipping-ledger.spec.ts
git commit -m "Add balanced ledger journals for platform-account shipping"
```

---

### Task 12: Buyer tracking page shows the shipment

**Files:**
- Modify: `apps/api/src/consumer/consumer.service.ts` (`trackOrder`), `apps/api/src/consumer/consumer.service.spec.ts`, `apps/checkout/src/main.ts` (tracking renderer), `apps/checkout/src/api.ts` (tracking response type)
- Test: extend `apps/api/test/shipping-carriers.e2e-spec.ts`

**Interfaces:**
- Consumes: `ShipmentsService.trackingUrl` (T6).
- Produces: `trackOrder()` returns `shipment: { carrierName; status; trackingNumber; trackingUrl; events: Array<{ status; description; occurredAt }> } | null`, never the label, recipient phone or `lastError`.

- [ ] **Step 1: Add the failing e2e assertion** at the end of T9's "merchant sees the shipment" test:

```ts
    const trackedByBuyer = (await request(app.getHttpServer()).get(`/v1/orders/track/${paid.trackingToken}`).expect(200)).body;
    expect(trackedByBuyer.shipment).toMatchObject({ carrierName: 'Servientrega Bolivia', trackingNumber: 'SV-000123', status: 'DELIVERED' });
    expect(JSON.stringify(trackedByBuyer.shipment)).not.toMatch(/labelFileId|recipientPhone|lastError/);
```

Confirm the public tracking path with `grep -n "@Controller\|@Get" apps/api/src/consumer/order-tracking.controller.ts` and substitute it for `/v1/orders/track/`.

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/api && pnpm test:e2e -- shipping-carriers`
Expected: FAIL, `shipment` undefined.

- [ ] **Step 3: Implement in `trackOrder`**: extend the `Promise.all` to `const [store, delivery, shipment] = await Promise.all([ ...existing two..., this.prisma.shipment.findUnique({ where: { orderId: order.id }, select: { status: true, trackingNumber: true, carrier: { select: { name: true, trackingUrlTemplate: true } }, events: { orderBy: { occurredAt: 'asc' }, select: { status: true, description: true, occurredAt: true } } } }) ]);` and add to the returned object:

```ts
      shipment: shipment ? {
        carrierName: shipment.carrier.name,
        status: shipment.status,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: ShipmentsService.trackingUrl(shipment.carrier.trackingUrlTemplate, shipment.trackingNumber),
        events: shipment.events,
      } : null,
```

In `consumer.service.spec.ts`, add `shipment: { findUnique: jest.fn(async () => null) }` to the Prisma mock used by the `trackOrder` test, and assert `shipment: null`.

- [ ] **Step 4: Render in checkout**: find the tracking renderer (`grep -n "statusEvents" apps/checkout/src/main.ts`) and add next to it:

```ts
const SHIPMENT_LABELS: Record<string, string> = { BOOKING: 'Preparando el envío', BOOKED: 'Guía generada', PICKED_UP: 'Recogido por el courier', IN_TRANSIT: 'En camino', DELIVERED: 'Entregado', FAILED: 'Estamos resolviendo un problema con el envío', CANCELED: 'Envío cancelado', RETURNED: 'Devuelto' };
type TrackedShipment = { carrierName: string; status: string; trackingNumber: string | null; trackingUrl: string | null; events: Array<{ status: string; description: string | null; occurredAt: string }> };
function shipmentMarkup(shipment: TrackedShipment | null | undefined) {
  if (!shipment) return '';
  const link = shipment.trackingUrl && /^https:\/\//.test(shipment.trackingUrl) ? `<a href="${escapeHtml(shipment.trackingUrl)}" target="_blank" rel="noopener noreferrer">Rastrear en ${escapeHtml(shipment.carrierName)}</a>` : '';
  return `<section class="tracking-shipment" aria-label="Envío"><h2>Envío con ${escapeHtml(shipment.carrierName)}</h2>
    <p><strong>${escapeHtml(SHIPMENT_LABELS[shipment.status] ?? shipment.status)}</strong>${shipment.trackingNumber ? ` · Nº ${escapeHtml(shipment.trackingNumber)}` : ''}</p>${link}
    <ol>${shipment.events.map(e => `<li><time datetime="${escapeHtml(e.occurredAt)}">${escapeHtml(new Date(e.occurredAt).toLocaleString('es-BO', { timeZone: 'America/La_Paz' }))}</time> ${escapeHtml(e.description ?? SHIPMENT_LABELS[e.status] ?? e.status)}</li>`).join('')}</ol></section>`;
}
```

Insert `${shipmentMarkup(data.shipment)}` after the status-events timeline in the tracking template (use whatever variable holds the tracking response). Add `shipment?: TrackedShipment | null` to the tracking response type in `apps/checkout/src/api.ts`.

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && pnpm test -- consumer.service && pnpm test:e2e -- shipping-carriers && cd ../checkout && pnpm vitest run && pnpm build`
Expected: all PASS; checkout builds.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/consumer apps/api/test/shipping-carriers.e2e-spec.ts apps/checkout/src
git commit -m "Show the carrier, tracking number and shipment timeline to buyers"
```

---

### Task 13: Storefront address form + map pin

**Files:**
- Modify: `apps/api/src/stores/source-kit/commerce.js` (panel markup ~L1424, `shippingQuote` ~L1566, checkout payload builder, `validateDelivery` ~L1605), `apps/api/src/stores/stores.service.ts` (public store payload: expose `shippingCarriersEnabled` wherever `shippingPickupEnabled` is exposed), `apps/checkout/src/api.ts` (`CartFulfillment`), `apps/checkout/src/cart-quote.ts` (~L28)
- Test: `apps/merchant-studio/tests/shipping-address.spec.ts` (Playwright, same harness as `tests/cross-sell-kit.spec.ts`)

**Interfaces:**
- Produces: storefront sends `shippingDestination: { department, city, street, references?, lat, lng, recipientName, recipientPhone }` on `/shipping/quote` and `/cart-checkout` whenever `store.shippingCarriersEnabled` and the method is `delivery`. `window.__pagosyaSetPin(lat, lng)` is exposed only in preview/demo/localhost as a test hook.

- [ ] **Step 1: Write the failing Playwright test**

Open `apps/merchant-studio/tests/cross-sell-kit.spec.ts` and reuse its fixture: how it mounts a storefront with a mocked API and opens checkout. Then:

```ts
import { test, expect } from '@playwright/test';
// import the same mount helper / fixture builder cross-sell-kit.spec.ts uses

test('carrier stores collect a structured Bolivian address and a map pin', async ({ page }) => {
  const quoteBodies: any[] = [];
  await page.route('**/shipping/quote', async route => { quoteBodies.push(route.request().postDataJSON()); await route.fulfill({ json: { amount: 12500, subtotal: 10000, discountAmount: 0, shippingAmount: 2500, currency: 'BOB', shippingOptions: [{ id: 'z1', name: 'Servientrega · Santa Cruz', amount: 2500, currency: 'BOB', carrierId: 'car_servientrega' }] } }); });
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ status: 204 }));
  // mount a storefront with store.shippingEnabled = true and store.shippingCarriersEnabled = true, add one product, open checkout
  await page.getByLabel('Envío a domicilio').check();
  await expect(page.getByLabel('Departamento')).toBeVisible();
  await page.getByLabel('Departamento').selectOption('SANTA_CRUZ');
  await page.getByLabel('Ciudad').fill('Santa Cruz');
  await page.getByLabel('Calle y número').fill('Av. Busch 55');
  await page.getByLabel('Referencias').fill('Portón verde');
  await page.getByLabel('Nombre de quien recibe').fill('Ana Quispe');
  await page.getByLabel('Teléfono de quien recibe').fill('71234567');
  await page.evaluate(() => (window as any).__pagosyaSetPin(-17.78, -63.18));
  await page.getByRole('button', { name: 'Calcular envío' }).click();
  await expect.poll(() => quoteBodies.at(-1)?.shippingDestination).toMatchObject({ department: 'SANTA_CRUZ', city: 'Santa Cruz', lat: -17.78, lng: -63.18, recipientPhone: '71234567' });
});

test('stores without carriers keep the single address field', async ({ page }) => {
  // mount with shippingCarriersEnabled = false
  await page.getByLabel('Envío a domicilio').check();
  await expect(page.getByLabel('Departamento')).toHaveCount(0);
});
```

Match the delivery-method and quote-button labels to the ones the kit renders (`grep -n "Calcular\|domicilio" apps/api/src/stores/source-kit/commerce.js`).

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/merchant-studio && pnpm playwright test tests/shipping-address.spec.ts`
Expected: FAIL, "Departamento" not found.

- [ ] **Step 3: Implement in `commerce.js`**: add helpers near the other checkout helpers:

```js
  const DEPARTMENTS = [['LA_PAZ','La Paz'],['SANTA_CRUZ','Santa Cruz'],['COCHABAMBA','Cochabamba'],['ORURO','Oruro'],['POTOSI','Potosí'],['CHUQUISACA','Chuquisaca'],['TARIJA','Tarija'],['BENI','Beni'],['PANDO','Pando']];
  const DEPARTMENT_CENTERS = { LA_PAZ: [-16.5, -68.15], SANTA_CRUZ: [-17.78, -63.18], COCHABAMBA: [-17.39, -66.16], ORURO: [-17.97, -67.11], POTOSI: [-19.58, -65.75], CHUQUISACA: [-19.05, -65.26], TARIJA: [-21.53, -64.73], BENI: [-14.83, -64.9], PANDO: [-11.03, -68.77] };
  const insideBolivia = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && lat >= -23 && lat <= -9.6 && lng >= -69.7 && lng <= -57.4;
  let leafletLoading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    leafletLoading ??= new Promise((resolve, reject) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.append(css);
      const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => resolve(window.L); script.onerror = () => { leafletLoading = null; reject(new Error('No se pudo cargar el mapa.')); };
      document.head.append(script);
    });
    return leafletLoading;
  }
  function destinationMarkup(saved) {
    const v = key => escape(saved.get(key) || '');
    return `<fieldset class="shipping-destination" data-shipping-destination><legend>Dirección de entrega</legend>
      <label>Departamento<select name="destDepartment" required><option value="">Elige</option>${DEPARTMENTS.map(([code, name]) => `<option value="${code}" ${saved.get('destDepartment') === code ? 'selected' : ''}>${name}</option>`).join('')}</select></label>
      <label>Ciudad<input name="destCity" required maxlength="80" autocomplete="address-level2" value="${v('destCity')}"></label>
      <label>Calle y número<input name="destStreet" required maxlength="200" autocomplete="street-address" value="${v('destStreet')}"></label>
      <label>Referencias<input name="destReferences" maxlength="300" placeholder="Color de la puerta, un lugar cercano…" value="${v('destReferences')}"></label>
      <label>Nombre de quien recibe<input name="destName" required maxlength="120" autocomplete="name" value="${v('destName')}"></label>
      <label>Teléfono de quien recibe<input name="destPhone" required inputmode="tel" pattern="\\+?[0-9 ]{7,16}" autocomplete="tel" value="${v('destPhone')}"></label>
      <input type="hidden" name="destLat" value="${v('destLat')}"><input type="hidden" name="destLng" value="${v('destLng')}">
      <div class="shipping-map" data-shipping-map style="height:220px;border-radius:12px" aria-label="Mapa: mueve el marcador a tu puerta"></div>
      <button type="button" class="ghost" data-use-location>Usar mi ubicación</button>
      <p class="hint" data-pin-status role="status">Marca tu puerta en el mapa.</p></fieldset>`;
  }
  async function mountDestinationMap(panel) {
    const box = panel.querySelector('[data-shipping-map]'); if (!box || box.dataset.ready) return;
    box.dataset.ready = '1';
    const lat = panel.querySelector('[name=destLat]'), lng = panel.querySelector('[name=destLng]'), status = panel.querySelector('[data-pin-status]');
    let marker = null;
    const setPin = (a, b) => {
      if (!insideBolivia(a, b)) { status.textContent = 'La ubicación debe estar dentro de Bolivia.'; return false; }
      lat.value = String(a); lng.value = String(b); status.textContent = 'Ubicación marcada.';
      checkoutAnswers.set('destLat', lat.value); checkoutAnswers.set('destLng', lng.value);
      marker?.setLatLng([a, b]); return true;
    };
    if (preview || config.demo || location.hostname === 'localhost') window.__pagosyaSetPin = setPin;
    panel.querySelector('[data-use-location]').addEventListener('click', () => {
      if (!navigator.geolocation) { status.textContent = 'Tu navegador no comparte la ubicación.'; return; }
      status.textContent = 'Buscando tu ubicación…';
      navigator.geolocation.getCurrentPosition(p => setPin(p.coords.latitude, p.coords.longitude), () => { status.textContent = 'No pudimos obtener tu ubicación; marca tu puerta en el mapa.'; }, { enableHighAccuracy: true, timeout: 10000 });
    });
    try {
      const L = await loadLeaflet();
      const dept = panel.querySelector('[name=destDepartment]').value;
      const start = lat.value ? [Number(lat.value), Number(lng.value)] : DEPARTMENT_CENTERS[dept] || DEPARTMENT_CENTERS.LA_PAZ;
      const map = L.map(box).setView(start, lat.value ? 17 : 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      marker = L.marker(start, { draggable: true, keyboard: true, title: 'Tu puerta' }).addTo(map);
      marker.on('dragend', () => { const p = marker.getLatLng(); if (!setPin(p.lat, p.lng) && lat.value) marker.setLatLng([Number(lat.value), Number(lng.value)]); });
      map.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
      panel.querySelector('[name=destDepartment]').addEventListener('change', event => { const c = DEPARTMENT_CENTERS[event.target.value]; if (c && !lat.value) { map.setView(c, 13); marker.setLatLng(c); } });
    } catch (error) { status.textContent = `${error.message} Escribe bien las referencias y usa "Usar mi ubicación".`; }
  }
  function shippingDestination(panel) {
    if (!store.shippingCarriersEnabled || panel?.querySelector('[name=method]')?.value !== 'delivery') return undefined;
    const get = name => panel.querySelector(`[name=${name}]`)?.value.trim() || '';
    const lat = Number(get('destLat')), lng = Number(get('destLng'));
    if (!get('destDepartment') || !insideBolivia(lat, lng)) return undefined;
    return { department: get('destDepartment'), city: get('destCity'), street: get('destStreet'), references: get('destReferences') || undefined, lat, lng, recipientName: get('destName'), recipientPhone: get('destPhone') };
  }
  function syncShippingAddress(panel) {
    const field = panel?.querySelector('[name=shippingAddress]'); const dest = shippingDestination(panel);
    if (field && dest) field.value = `${dest.street}, ${dest.city}`;
  }
```

Wiring:
1. In the `[data-shipping]` markup (~L1424), when `store.shippingCarriersEnabled`, render `destinationMarkup(checkoutAnswers)` plus `<input type="hidden" name="shippingAddress">` in place of the visible `shippingAddress` textarea. Otherwise leave today's markup unchanged.
2. After the panel HTML is set and the method is `delivery`, call `void mountDestinationMap(el)`. Also call it in the method-change handler (~L1540) when switching to `delivery`.
3. In `shippingQuote` and in the cart-checkout request builder, call `syncShippingAddress(panel)` first, then add `shippingDestination: shippingDestination(panel)` to the JSON body. Re-run `shippingQuote` on `change` of `[name=destDepartment]`.
4. In `validateDelivery`, when `store.shippingCarriersEnabled` and the method is `delivery`, `reportValidity()` each `[data-shipping-destination] [required]`, then if `!shippingDestination(panel)` call `message('Marca tu puerta en el mapa.')` and return false. Call `syncShippingAddress(panel)` before the existing `shippingAddress` check.
5. `rememberCheckout` already saves every named field, so the `dest*` values survive re-renders.

- [ ] **Step 4: Expose the flag publicly**: in `stores.service.ts`, find where `shippingPickupEnabled` is included in the public store payload (`grep -n "shippingPickupEnabled" apps/api/src/stores/stores.service.ts`) and add `shippingCarriersEnabled` beside it.

- [ ] **Step 5: Checkout app parity**: in `apps/checkout/src/api.ts`, extend `CartFulfillment` with `shippingDestination?: { department: string; city: string; street: string; references?: string; lat: number; lng: number; recipientName: string; recipientPhone: string }`. In `cart-quote.ts` (~L28), pass `shippingDestination` through from the fulfillment state when present. If the checkout app renders its own delivery address form (`grep -n "shippingAddress" apps/checkout/src/main.ts`), add the same fields there. Put the helpers in `apps/checkout/src/shipping-destination.ts`, ported to TS, and keep `commerce.js`'s copy, because the kit ships standalone.

- [ ] **Step 6: CSP**: run `grep -rn "script-src\|img-src\|style-src" apps/api/src apps/checkout/index.html apps/merchant-dashboard/server.mjs | head`. Wherever the storefront CSP is defined, allow `https://cdnjs.cloudflare.com` in `script-src` and `style-src`, and `https://*.tile.openstreetmap.org` in `img-src`.

- [ ] **Step 7: Run the tests**

Run: `cd apps/merchant-studio && pnpm playwright test tests/shipping-address.spec.ts tests/cross-sell-kit.spec.ts && cd ../checkout && pnpm vitest run && pnpm build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/stores/source-kit/commerce.js apps/api/src/stores/stores.service.ts apps/checkout/src apps/merchant-studio/tests/shipping-address.spec.ts
git commit -m "Collect a structured Bolivian address and map pin at checkout"
```

---

### Task 14: Merchant UI (carrier settings + order shipment panel)

**Files:**
- Modify: `apps/merchant-studio/src/api.ts`, `apps/merchant-studio/src/shipping-settings.ts`, `apps/merchant-dashboard/index.html` (order detail card in `renderPaymentRows`, ~L18359)
- Create: `apps/merchant-dashboard/src/shipment-panel.mjs`
- Test: `apps/merchant-studio/src/shipping-settings.test.ts` (vitest + jsdom), `apps/merchant-dashboard/src/shipment-panel.test.mjs` (`node --test`, jsdom from the workspace)

**Interfaces:**
- Consumes: HTTP from T9.
- Produces: the settings dialog shows the carrier toggle, prep minutes, and carrier + department pickers on new rates. `renderShipmentPanel(container: HTMLElement, api: (path: string, init?: RequestInit & { raw?: boolean }) => Promise<any>, orderId: string): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`apps/merchant-studio/src/shipping-settings.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { openShippingSettings } from './shipping-settings';

describe('shipping settings carriers', () => {
  it('sends carrier and departments when adding a carrier rate', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(); HTMLDialogElement.prototype.close = vi.fn();
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: true, prepMinutes: 60, rates: [], products: [], carriers: [{ id: 'car_servientrega', code: 'servientrega', name: 'Servientrega Bolivia', mode: 'MANUAL' }] };
    const api: any = { shippingSettings: vi.fn(async () => state), createShippingRate: vi.fn(async () => ({})), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const form = document.querySelector<HTMLFormElement>('#shipping-rate')!;
    (form.querySelector('[name=name]') as HTMLInputElement).value = 'Servientrega · SCZ';
    (form.querySelector('[name=fee]') as HTMLInputElement).value = '25';
    (form.querySelector('[name=carrierId]') as HTMLSelectElement).value = 'car_servientrega';
    (form.querySelector('input[name=departments][value=SANTA_CRUZ]') as HTMLInputElement).checked = true;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.createShippingRate).toHaveBeenCalled());
    expect(api.createShippingRate.mock.calls[0][1]).toMatchObject({ carrierId: 'car_servientrega', departments: ['SANTA_CRUZ'], fee: 2500 });
  });
  it('saves the carrier toggle and prep minutes', async () => {
    const state = { enabled: true, pickupEnabled: true, carriersEnabled: false, prepMinutes: 60, rates: [], products: [], carriers: [] };
    const api: any = { shippingSettings: vi.fn(async () => state), saveShippingSettings: vi.fn(async () => state) };
    await openShippingSettings(api, 'st_1');
    const form = document.querySelector<HTMLFormElement>('#shipping-settings')!;
    (form.querySelector('[name=carriersEnabled]') as HTMLInputElement).checked = true;
    (form.querySelector('[name=prepMinutes]') as HTMLInputElement).value = '30';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(api.saveShippingSettings).toHaveBeenCalledWith('st_1', expect.objectContaining({ carriersEnabled: true, prepMinutes: 30 })));
  });
});
```
Check that the rate form's fee input name is `fee` and that the dialog converts Bs to cents (`grep -n "fee" apps/merchant-studio/src/shipping-settings.ts`). Adjust the fixture to the real field name.

`apps/merchant-dashboard/src/shipment-panel.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderShipmentPanel } from './shipment-panel.mjs';

const booked = { id: 'shp_1', status: 'BOOKED', carrier: { name: 'Servientrega Bolivia', mode: 'MANUAL' }, trackingNumber: null, trackingUrl: null, hasLabel: true, lastError: null, events: [] };

test('renders a booked manual shipment with waybill download and tracking form', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const calls = [];
  const api = async (path, init) => { calls.push(path); return path.endsWith('/shipment') ? booked : { ...booked, status: 'IN_TRANSIT', trackingNumber: 'SV-1' }; };
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, api, 'ord_1');
  assert.match(c.textContent, /Servientrega Bolivia/);
  assert.ok(c.querySelector('[data-shipment-label]'));
  c.querySelector('[name=trackingNumber]').value = 'SV-1';
  c.querySelector('form[data-shipment-tracking]').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls[1], '/shipments/shp_1/tracking');
  assert.match(c.textContent, /SV-1/);
});

test('shows retry for failed shipments', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, async () => ({ ...booked, status: 'FAILED', lastError: 'storage down', hasLabel: false }), 'ord_1');
  assert.ok(c.querySelector('[data-shipment-retry]'));
  assert.match(c.textContent, /storage down/);
});

test('renders nothing when the order has no carrier shipment', async () => {
  const { window } = new JSDOM('<div id="c"></div>'); globalThis.document = window.document;
  const c = window.document.getElementById('c');
  await renderShipmentPanel(c, async () => null, 'ord_1');
  assert.equal(c.innerHTML, '');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd apps/merchant-studio && pnpm vitest run src/shipping-settings.test.ts; cd ../merchant-dashboard && node --test src/shipment-panel.test.mjs`
Expected: both FAIL.

- [ ] **Step 3: Studio API type**: in `apps/merchant-studio/src/api.ts`, widen `saveShippingSettings`'s input to `{ enabled: boolean; pickupEnabled: boolean; carriersEnabled?: boolean; prepMinutes?: number }`.

- [ ] **Step 4: Settings dialog**: `shipping-settings.ts`:
- Add at module top: `const DEPTS = [['LA_PAZ','La Paz'],['SANTA_CRUZ','Santa Cruz'],['COCHABAMBA','Cochabamba'],['ORURO','Oruro'],['POTOSI','Potosí'],['CHUQUISACA','Chuquisaca'],['TARIJA','Tarija'],['BENI','Beni'],['PANDO','Pando']] as const;`
- In `#shipping-settings`, add `<label><span><input type="checkbox" name="carriersEnabled" ${state.carriersEnabled ? 'checked' : ''} style="width:auto"> Enviar con couriers (guía y seguimiento)</span></label><label>Minutos de preparación<input type="number" name="prepMinutes" min="0" max="1440" value="${state.prepMinutes ?? 60}"></label>`. Its submit adds `carriersEnabled: form.has('carriersEnabled'), prepMinutes: Number(form.get('prepMinutes') || 60)` to the `saveShippingSettings` payload.
- In `#shipping-rate`, when `state.carriersEnabled`, add `<label>Courier<select name="carrierId"><option value="">Reparto propio</option>${(state.carriers ?? []).map((c: any) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('')}</select></label><fieldset><legend>Departamentos (vacío = todos)</legend>${DEPTS.map(([code, name]) => `<label><input type="checkbox" name="departments" value="${code}" style="width:auto"> ${name}</label>`).join('')}</fieldset>`.
- In the rate submit handler, before `createShippingRate`: `const carrierId = String(form.get('carrierId') || ''); if (carrierId) rate.carrierId = carrierId; const departments = form.getAll('departments').map(String); if (departments.length) rate.departments = departments;`
- In each rate `<article>`, append `· ${escape((state.carriers ?? []).find((c: any) => c.id === rate.carrierId)?.name ?? 'Reparto propio')}${rate.departments?.length ? ` · ${escape(rate.departments.map((d: string) => DEPTS.find(x => x[0] === d)?.[1] ?? d).join(', '))}` : ''}`.

- [ ] **Step 5: Shipment panel**: `apps/merchant-dashboard/src/shipment-panel.mjs`:

```js
const LABELS = { BOOKING: 'Reservando', BOOKED: 'Guía lista', PICKED_UP: 'Recogido', IN_TRANSIT: 'En camino', DELIVERED: 'Entregado', FAILED: 'Falló la reserva', CANCELED: 'Cancelado', RETURNED: 'Devuelto' };
const TRACKABLE = ['BOOKED', 'PICKED_UP', 'IN_TRANSIT'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function renderShipmentPanel(container, api, orderId) {
  let shipment = await api(`/orders/${encodeURIComponent(orderId)}/shipment`);
  const draw = (message = '') => {
    if (!shipment) { container.innerHTML = ''; return; }
    const s = shipment;
    container.innerHTML = `<div class="shipment-panel"><strong>${esc(s.carrier.name)} · ${esc(LABELS[s.status] ?? s.status)}</strong>
      ${s.trackingNumber ? `<span>Nº ${esc(s.trackingNumber)}${s.trackingUrl ? ` · <a href="${esc(s.trackingUrl)}" target="_blank" rel="noopener noreferrer">rastrear</a>` : ''}</span>` : ''}
      ${s.hasLabel ? '<button type="button" class="ghost" data-shipment-label>Descargar guía (PDF)</button>' : ''}
      ${TRACKABLE.includes(s.status) ? `<form data-shipment-tracking><label>Nº de seguimiento<input name="trackingNumber" required maxlength="60" value="${esc(s.trackingNumber ?? '')}"></label><button>Guardar</button></form><button type="button" class="ghost" data-shipment-delivered>Marcar entregado</button>` : ''}
      ${s.status === 'FAILED' ? `<p class="error">${esc(s.lastError ?? 'No se pudo reservar el envío.')}</p><button type="button" data-shipment-retry>Reintentar</button>` : ''}
      ${s.events?.length ? `<ol>${s.events.map(e => `<li>${esc(new Date(e.occurredAt).toLocaleString())} · ${esc(e.description ?? LABELS[e.status] ?? e.status)}</li>`).join('')}</ol>` : ''}
      <p role="status">${esc(message)}</p></div>`;
    const act = async (path, body) => {
      try { shipment = await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) }); draw('Envío actualizado.'); }
      catch (error) { draw(error.message || 'No se pudo actualizar el envío.'); }
    };
    container.querySelector('form[data-shipment-tracking]')?.addEventListener('submit', event => { event.preventDefault(); void act(`/shipments/${encodeURIComponent(s.id)}/tracking`, { trackingNumber: event.target.querySelector('[name=trackingNumber]').value.trim() }); });
    container.querySelector('[data-shipment-delivered]')?.addEventListener('click', () => void act(`/shipments/${encodeURIComponent(s.id)}/delivered`));
    container.querySelector('[data-shipment-retry]')?.addEventListener('click', () => void act(`/shipments/${encodeURIComponent(s.id)}/retry`));
    container.querySelector('[data-shipment-label]')?.addEventListener('click', () => void api(`/shipments/${encodeURIComponent(s.id)}/label`, { raw: true })
      .then(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `guia-${s.id}.pdf`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); })
      .catch(error => draw(error.message)));
  };
  draw();
}
```

- [ ] **Step 6: Mount in the dashboard**: in `index.html`:
- Find how the order id is exposed on payment rows (`grep -n "fulfillment-select" apps/merchant-dashboard/index.html`; the select's `data-order-id` shows the property name).
- Inside the `order-detail-card`, add `<div data-shipment-panel data-order-id="${esc(<that property>)}"></div>` when the row has an order id.
- After rows render, register `document.querySelectorAll('.order-detail').forEach(d => d.addEventListener('toggle', () => { const box = d.querySelector('[data-shipment-panel]'); if (d.open && box && !box.dataset.loaded) { box.dataset.loaded = '1'; void renderShipmentPanel(box, api, box.dataset.orderId).catch(e => { box.textContent = e.message; }); } }));`
- Load the module the way `index.html` loads its other `src/*.mjs` files (`grep -n "\.mjs" apps/merchant-dashboard/index.html | head`).
- If the dashboard's `api()` helper can't return blobs, add: `if (init?.raw) return response.blob();` after its `response.ok` check.

- [ ] **Step 7: Run the tests**

Run: `cd apps/merchant-studio && pnpm vitest run src/shipping-settings.test.ts && pnpm build; cd ../merchant-dashboard && node --test src/shipment-panel.test.mjs`
Expected: PASS; studio builds.

- [ ] **Step 8: Commit**

```bash
git add apps/merchant-studio/src apps/merchant-dashboard/src/shipment-panel.mjs apps/merchant-dashboard/src/shipment-panel.test.mjs apps/merchant-dashboard/index.html
git commit -m "Add courier settings and an order shipment panel for merchants"
```

---

### Task 15: Parcel profile — dimensions, fragility, size class

Picks which vehicle class an order needs and lets rates be restricted by it. Products gain dimensions and handling flags; each order snapshots a computed parcel; rates may list allowed size classes; the waybill prints handling marks.

**Files:**
- Create: `apps/api/src/shipping/parcel.ts`, `apps/api/src/shipping/parcel.spec.ts`, `apps/api/prisma/migrations/20260917130000_parcel_profile/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/src/stores/shipping-rates.ts` (+ spec), `apps/api/src/stores/stores.service.ts` (cart checkout, ~L1808), `apps/api/src/stores/shipping.controller.ts` (`PATCH products/:productId`), the `CreateDeliveryZoneDto` file + `operations.service.ts:createDeliveryZone`, `apps/api/src/shipping/carriers/carrier.ts` (`BookInput`), `apps/api/src/shipping/waybill-pdf.ts` (+ spec), `apps/api/src/shipping/shipments.service.ts` (`book`), `apps/merchant-studio/src/api.ts`, `apps/merchant-studio/src/shipping-settings.ts` (+ test), `apps/api/test/shipping-carriers.e2e-spec.ts`

**Interfaces:**
- Produces:
  ```ts
  type SizeClass = 'MOTO' | 'AUTO' | 'CAMIONETA';
  type ParcelLine = { quantity: number; weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean };
  type Parcel = { weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean; sizeClass: SizeClass | null };
  function computeParcel(lines: ParcelLine[]): Parcel;
  const SIZE_LIMITS: Record<SizeClass, { maxWeightGrams: number; maxDimsCm: [number, number, number] }>;
  ```
  `quoteShipping` input gains `sizeClass?: SizeClass | null`; `ShippingRate` gains `sizeClasses?: string[]`; `BookInput` gains `parcel: Parcel | null`; `StoreOrder.parcel Json?`.
- Rules (starting defaults; replaced per carrier once real quotes arrive):
  - `MOTO`: ≤ 8 kg and sorted box dims fit 40×40×40 cm, and not (fragile and box volume > 20 000 cm³).
  - `AUTO`: ≤ 50 kg and sorted box dims fit 100×60×50 cm.
  - `CAMIONETA`: everything larger.
  - Unknown weight or dimensions on any line → `sizeClass: null`. Rates that list `sizeClasses` don't match `null`, the same way unknown weight never matches a weight band. Rates without `sizeClasses` behave as today.
  - Box estimate: length = max item length, width = max item width, height = max(max item height, ceil(total volume × 1.15 / (length × width))). With `noStack`, height is the tallest item only, and length grows to fit the items side by side: length = ceil(total footprint × 1.15 / width).

- [ ] **Step 1: Schema + migration**

`schema.prisma`:
```prisma
// in model PaymentLink
  lengthCm           Int?
  widthCm            Int?
  heightCm           Int?
  fragile            Boolean           @default(false)
  noStack            Boolean           @default(false)
// in model DeliveryZone
  sizeClasses String[] @default([])
// in model StoreOrder
  parcel             Json?
```
Run: `cd apps/api && pnpm prisma migrate dev --name parcel_profile && pnpm prisma generate`. The folder must sort after `20260917120000_shipping_carriers`; rename it to `20260917130000_parcel_profile` if needed.

- [ ] **Step 2: Write the failing `parcel.spec.ts`**

```ts
import { computeParcel } from './parcel';

const line = (over: Partial<Parameters<typeof computeParcel>[0][number]> = {}) => ({ quantity: 1, weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: false, noStack: false, ...over });

describe('computeParcel', () => {
  it('sums weight across quantities and classifies a small box as MOTO', () => {
    expect(computeParcel([line({ quantity: 3 })])).toMatchObject({ weightGrams: 1500, lengthCm: 20, widthCm: 15, sizeClass: 'MOTO' });
  });
  it('stacks items to estimate height', () => {
    const p = computeParcel([line({ quantity: 4 })]); // 4 × 3000 cm³ × 1.15 / (20×15) = 46 → 46 cm
    expect(p.heightCm).toBe(46);
    expect(p.sizeClass).toBe('AUTO'); // 46 > 40
  });
  it('uses AUTO above 8 kg and CAMIONETA above 50 kg or oversized', () => {
    expect(computeParcel([line({ weightGrams: 9000 })]).sizeClass).toBe('AUTO');
    expect(computeParcel([line({ weightGrams: 51000 })]).sizeClass).toBe('CAMIONETA');
    expect(computeParcel([line({ lengthCm: 120, widthCm: 70, heightCm: 20 })]).sizeClass).toBe('CAMIONETA');
  });
  it('moves large fragile boxes off motorbikes', () => {
    expect(computeParcel([line({ lengthCm: 35, widthCm: 30, heightCm: 25, fragile: true })]).sizeClass).toBe('AUTO'); // 26 250 cm³
    expect(computeParcel([line({ fragile: true })])).toMatchObject({ sizeClass: 'MOTO', fragile: true });
  });
  it('lays no-stack items side by side instead of stacking', () => {
    const p = computeParcel([line({ quantity: 4, noStack: true })]);
    expect(p).toMatchObject({ heightCm: 10, widthCm: 15, noStack: true });
    expect(p.lengthCm).toBe(92); // ceil(4 × 300 cm² × 1.15 / 15)
  });
  it('returns null size class when any line lacks weight or dimensions', () => {
    expect(computeParcel([line(), line({ weightGrams: null })])).toMatchObject({ weightGrams: null, sizeClass: null });
    expect(computeParcel([line({ heightCm: null })]).sizeClass).toBeNull();
  });
});
```

- [ ] **Step 3: Run to confirm failure**

Run: `cd apps/api && pnpm test -- parcel`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `parcel.ts`**

```ts
export type SizeClass = 'MOTO' | 'AUTO' | 'CAMIONETA';
export type ParcelLine = { quantity: number; weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean };
export type Parcel = { weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; fragile: boolean; noStack: boolean; sizeClass: SizeClass | null };

export const SIZE_CLASSES: SizeClass[] = ['MOTO', 'AUTO', 'CAMIONETA'];
export const SIZE_LIMITS: Record<Exclude<SizeClass, 'CAMIONETA'>, { maxWeightGrams: number; maxDimsCm: [number, number, number] }> = {
  MOTO: { maxWeightGrams: 8_000, maxDimsCm: [40, 40, 40] },
  AUTO: { maxWeightGrams: 50_000, maxDimsCm: [100, 60, 50] },
};
const PACKING = 1.15;
const FRAGILE_MOTO_MAX_CM3 = 20_000;

const fits = (dims: number[], limit: [number, number, number]) => {
  const sorted = [...dims].sort((a, b) => b - a);
  return sorted.every((value, index) => value <= limit[index]);
};

export function computeParcel(lines: ParcelLine[]): Parcel {
  const fragile = lines.some(l => l.fragile);
  const noStack = lines.some(l => l.noStack);
  const weightKnown = lines.every(l => l.weightGrams !== null);
  const weightGrams = weightKnown ? lines.reduce((sum, l) => sum + l.weightGrams! * l.quantity, 0) : null;
  if (!lines.length || lines.some(l => l.lengthCm === null || l.widthCm === null || l.heightCm === null)) {
    return { weightGrams, lengthCm: null, widthCm: null, heightCm: null, fragile, noStack, sizeClass: null };
  }
  const length = Math.max(...lines.map(l => l.lengthCm!));
  const width = Math.max(...lines.map(l => l.widthCm!));
  const tallest = Math.max(...lines.map(l => l.heightCm!));
  let lengthCm = length, heightCm: number;
  if (noStack) {
    const footprint = lines.reduce((sum, l) => sum + l.lengthCm! * l.widthCm! * l.quantity, 0);
    lengthCm = Math.max(length, Math.ceil((footprint * PACKING) / width));
    heightCm = tallest;
  } else {
    const volume = lines.reduce((sum, l) => sum + l.lengthCm! * l.widthCm! * l.heightCm! * l.quantity, 0);
    heightCm = Math.max(tallest, Math.ceil((volume * PACKING) / (length * width)));
  }
  const dims = [lengthCm, width, heightCm];
  let sizeClass: SizeClass | null = null;
  if (weightGrams !== null) {
    const boxVolume = lengthCm * width * heightCm;
    if (weightGrams <= SIZE_LIMITS.MOTO.maxWeightGrams && fits(dims, SIZE_LIMITS.MOTO.maxDimsCm) && !(fragile && boxVolume > FRAGILE_MOTO_MAX_CM3)) sizeClass = 'MOTO';
    else if (weightGrams <= SIZE_LIMITS.AUTO.maxWeightGrams && fits(dims, SIZE_LIMITS.AUTO.maxDimsCm)) sizeClass = 'AUTO';
    else sizeClass = 'CAMIONETA';
  }
  return { weightGrams, lengthCm, widthCm: width, heightCm, fragile, noStack, sizeClass };
}
```

- [ ] **Step 5: Run the parcel tests**

Run: `cd apps/api && pnpm test -- parcel`
Expected: PASS (6 tests). If an expected number in the spec is off by one because of rounding, recompute it by hand from the rules above and fix the test, not the rule.

- [ ] **Step 6: Rates filter by size class**: add to `shipping-rates.spec.ts`:

```ts
  it('restricts rates to their size classes and never matches an unknown size', () => {
    const moto = { ...rate, id: 'moto', sizeClasses: ['MOTO'] };
    const base = { currency: 'BOB', subtotal: 5000, weightGrams: 500 };
    expect(quoteShipping([moto], { ...base, sizeClass: 'MOTO' }).options).toHaveLength(1);
    expect(quoteShipping([moto], { ...base, sizeClass: 'AUTO' }).options).toHaveLength(0);
    expect(quoteShipping([moto], { ...base, sizeClass: null }).options).toHaveLength(0);
    expect(quoteShipping([rate], { ...base, sizeClass: null }).options).toHaveLength(1);
  });
```
In `shipping-rates.ts`: add `sizeClasses?: string[]` to `ShippingRate`, `sizeClass?: string | null` to the input, and this filter clause:
`&& (!rate.sizeClasses?.length || !!input.sizeClass && rate.sizeClasses.includes(input.sizeClass))`.
Run: `pnpm test -- shipping-rates` → PASS.

- [ ] **Step 7: Wire into checkout** (`stores.service.ts`)
- Make sure the `links` query selects `lengthCm, widthCm, heightCm, fragile, noStack` next to `shippingWeightGrams`.
- Next to the existing `weightGrams` computation (~L1808), add:
  ```ts
      const parcel = computeParcel(links.map(link => ({ quantity: quantityByLinkId.get(link.id)!, weightGrams: link.shippingWeightGrams, lengthCm: link.lengthCm, widthCm: link.widthCm, heightCm: link.heightCm, fragile: link.fragile, noStack: link.noStack })));
  ```
  Pass `sizeClass: parcel.sizeClass` to `quoteShipping`. Hoist `parcel` (declare `let parcel: Parcel | null = null;` next to `let shipping`) so the order create can read it.
- In `tx.storeOrder.create` data add `...(parcel && shipping?.carrierId ? { parcel: parcel as Prisma.InputJsonValue } : {})`.
- Add `sizeClass: parcel?.sizeClass ?? null` to the `quoteOnly` return object, so the storefront can show "Envío en moto / auto / camioneta".

- [ ] **Step 8: Merchant inputs**
- `stores/shipping.controller.ts`: extend `ShippingWeightDto` with optional `lengthCm`, `widthCm`, `heightCm` (each `@ValidateIf(v => v !== null) @IsInt() @Min(1) @Max(500)`), and optional `fragile`, `noStack` (`@IsOptional() @IsBoolean()`). The `weight` handler writes whichever are present. `get()`'s product select adds `lengthCm, widthCm, heightCm, fragile, noStack`.
- `CreateDeliveryZoneDto`: `@IsOptional() @IsArray() @IsIn(['MOTO','AUTO','CAMIONETA'], { each: true }) sizeClasses?: string[];`. `createDeliveryZone` stores `sizeClasses: dto.sizeClasses ?? []`.
- `merchant-studio/src/api.ts`: `saveShippingWeight(storeId, productId, input: { weightGrams: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; fragile?: boolean; noStack?: boolean })`. Keep backward compatibility: if a number is passed, wrap it as `{ weightGrams }`.
- `shipping-settings.ts`: in each `[data-product-weight]` form, add three number inputs (`Largo cm`, `Ancho cm`, `Alto cm`) and two checkboxes (`Frágil`, `No apilar`), prefilled from state. Submit sends all of them. In the rate form (when `state.carriersEnabled`), add a fieldset `Tamaño del paquete (vacío = todos)` with checkboxes `name="sizeClasses"` for `MOTO` (Moto), `AUTO` (Auto), `CAMIONETA` (Camioneta); on submit add `const sizes = form.getAll('sizeClasses').map(String); if (sizes.length) rate.sizeClasses = sizes;`. Add a vitest case to `shipping-settings.test.ts` asserting `createShippingRate` receives `sizeClasses: ['MOTO']` and `saveShippingWeight` receives `{ lengthCm: 20, fragile: true, ... }`.

- [ ] **Step 9: Carriers and waybill**
- `carrier.ts`: add `parcel: Parcel | null` to `BookInput` (import the type from `../parcel`).
- `shipments.service.ts` `book()`: `const parcel = (order.parcel ?? null) as Parcel | null;` set `weightGrams: parcel?.weightGrams ?? null, parcel` in `input`.
- `waybill-pdf.ts`: under the weight line, print `Medidas: ${l}×${w}×${h} cm` when known and `Vehículo: Moto/Auto/Camioneta` when `sizeClass` is set. When `fragile` or `noStack`, draw a bold red banner at the top right: `FRÁGIL` / `NO APILAR` / `FRÁGIL · NO APILAR` (`doc.fillColor('#b91c1c').fontSize(16).text(mark, 300, 28, { width: 260, align: 'right' })`).
- `waybill-pdf.spec.ts`: add a case with `parcel: { weightGrams: 1200, lengthCm: 30, widthCm: 20, heightCm: 15, fragile: true, noStack: true, sizeClass: 'MOTO' }` that asserts the PDF renders (header `%PDF-`, one page). Add `parcel: null` to the existing fixture.
- `shipments.service.spec.ts`: add `parcel: null` to the seeded order; the tests should still pass.

- [ ] **Step 10: E2E**: in `shipping-carriers.e2e-spec.ts`, add:

```ts
  it('classifies the parcel, hides motorbike rates for big boxes and snapshots the parcel', async () => {
    await request(app.getHttpServer()).patch(`/v1/stores/${storeId}/shipping/products/${productId}`).set(auth()).send({ weightGrams: 500, lengthCm: 20, widthCm: 15, heightCm: 10, fragile: true }).expect(200);
    const moto = (await request(app.getHttpServer()).post(`/v1/stores/${storeId}/operations/delivery/zones`).set(auth()).send({ name: 'Moto SCZ', fee: 1500, departments: ['SANTA_CRUZ'], carrierId: 'car_other', sizeClasses: ['MOTO'] }).expect(201)).body.id;
    const small = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined }).expect(201)).body;
    expect(small.sizeClass).toBe('MOTO');
    expect(small.shippingOptions.map((o: any) => o.id)).toContain(moto);
    const big = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/shipping/quote`).send({ ...cart(), shippingZoneId: undefined, items: [{ paymentLinkId: productId, quantity: 20 }] }).expect(201)).body;
    expect(big.sizeClass).not.toBe('MOTO');
    expect(big.shippingOptions.map((o: any) => o.id)).not.toContain(moto);
    const paid = (await request(app.getHttpServer()).post(`/v1/stores/public/${slug}/cart-checkout`).send({ ...cart(), shippingZoneId: moto }).expect(201)).body;
    const order = await prisma.storeOrder.findUniqueOrThrow({ where: { paymentIntentId: paid.id } });
    expect(order.parcel).toMatchObject({ sizeClass: 'MOTO', fragile: true, weightGrams: 500 });
  });
```

- [ ] **Step 11: Run everything touched**

Run: `cd apps/api && pnpm test -- parcel shipping-rates waybill-pdf shipments.service && pnpm test:e2e -- shipping-carriers brand-shipping && cd ../merchant-studio && pnpm vitest run src/shipping-settings.test.ts && pnpm build`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma apps/api/src/shipping apps/api/src/stores apps/api/src/operations apps/api/test/shipping-carriers.e2e-spec.ts apps/merchant-studio/src
git commit -m "Pick the vehicle class from product size, weight and fragility"
```

---

### Task 16: End-to-end verification

- [ ] **Step 1: Full API suites**

Run: `cd apps/api && pnpm test && pnpm test:e2e && pnpm build`
Expected: all PASS.

- [ ] **Step 2: Frontend suites**

Run: `cd apps/checkout && pnpm vitest run && pnpm build; cd ../merchant-studio && pnpm vitest run && pnpm playwright test && pnpm build; cd ../merchant-dashboard && node --test src/shipment-panel.test.mjs`
Expected: all PASS.

- [ ] **Step 3: Browser check** (use the `visual-qa` skill): on a test store, enable carriers and add a Servientrega rate for Santa Cruz. Check out as a buyer at 390 px width and confirm:
  - the map loads, the pin drags, and "Usar mi ubicación" works;
  - the total includes shipping.

  Then pay with `tok_visa_success` and wait up to 30 s. In the dashboard, download the waybill and enter a tracking number. Confirm the buyer tracking page shows the carrier and the timeline.

- [ ] **Step 4: Commit any fixes, then report** what was verified, with command output, and anything that was skipped.

---

## Self-review notes

- **Spec coverage (Phase 1):**
  - Module + adapter interface: T4, T7
  - ManualCarrier: T4
  - Structured address + map: T2, T8, T13
  - Branch pins: T9
  - Waybill: T5, T6
  - Tracking entry: T6, T9, T14
  - Buyer notifications: T6, using the SHIPPED/DELIVERED templates
  - Ledger accounts: T1, T11
  - Rollout flag: T1, T8, T9, T13
  - Ops catalog: T10
  - Buyer tracking page: T12
  - Cancel/refund: T8
  - Retries → FAILED → retry / switch to manual: T6, T9, T14
  - Security (private labels, ownership checks, Bolivia bbox, server-side amounts, https-only tracking templates): T2, T6, T8, T9, T10, T12
- **Deferred to Phase 2 on purpose:** signed quotes, `secret-box`, merchant credentials, courier webhooks and polling, the DHL adapter, ledger wiring, the AGGREGATOR-only rule for platform accounts.
- **Names checked across tasks:** `ShipmentsService.{book,setTrackingNumber,markDelivered,retry,switchCarrier,cancelForOrder,viewForMerchant,label,trackingUrl}` · `ShipmentBookingWorker.tick` · `CarrierRegistry.get(code, mode)` · `ShippingOption.carrierId` · `shippingDestination` payload key · zone fields `carrierId`/`departments` · settings keys `carriersEnabled`/`prepMinutes` · `UpdateCarrierDto` defined in T9 and used in T10.
