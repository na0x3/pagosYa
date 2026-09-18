# Shipping Carriers — Design

**Date:** 2026-09-17
**Status:** Approved in brainstorming, pending spec review
**Sub-project:** 3 of the Shopify-parity roadmap (shipping & couriers)

## Goal

Let a PagosYa store ship orders through external carriers — domestic and international — with live
quotes at checkout, automatic booking on payment, labels/waybills, tracking and buyer notifications.
Works with every Bolivian carrier from day one (manual mode) and with API carriers as integrations
become available.

## Carrier research summary (2026-09-17)

| Carrier | API | Bolivia | Role here |
|---|---|---|---|
| DHL Express (MyDHL API) | Public, documented: rates, shipments/labels, pickups, tracking | Domestic + international | First API adapter (phase 2) |
| Patio Service / MotoClick | No public docs; builds custom B2B software | ~35% share; SCZ, LPZ, CBBA, TJA | Same-city adapter once API access is granted (phase 3) |
| Uber Direct | Public API | Unconfirmed in Bolivia | Same-city adapter if confirmed (phase 3) |
| Servientrega BO, OCS Bolivia, BoA Cargo, Correos de Bolivia, Pakex, BC Plus, Cargo Express | None found | Yes | Manual carriers |
| PedidosYa Envíos, Yango | — | — | Excluded by product decision |

## Decisions

1. **Accounts: both.** A store may connect its own carrier account; otherwise the PagosYa platform
   account for that carrier is used.
2. **Platform-account settlement: payout deduction.** Buyer pays live carrier price + a per-carrier
   PagosYa margin. PagosYa retains it from the payout. Post-shipment carrier surcharges are deducted
   from the merchant's next payout as visible line items.
3. **Address: structured + map pin.** Department (9), city, street, references, recipient name/phone,
   confirmed lat/lng pin. Map: Leaflet + OpenStreetMap tiles (no API key).
4. **Booking: always automatic on payment.** Pickup time is scheduled at `paidAt + store prep time`
   when the carrier supports scheduled pickup; otherwise it dispatches immediately.
5. **Architecture: carrier adapter module inside `apps/api`.** No aggregator (ShipEngine/EasyPost),
   no separate microservice.

## Architecture

New NestJS module `apps/api/src/shipping/`:

```
shipping/
  shipping.module.ts
  carriers/
    carrier.ts                 # CarrierAdapter interface + shared types
    manual.carrier.ts          # rate tables + waybill PDF + typed tracking
    dhl-express.carrier.ts     # MyDHL API
    patio.carrier.ts           # stub, registered disabled until API access
    uber-direct.carrier.ts     # stub, registered disabled until confirmed
    carrier-registry.ts        # code -> adapter
  quotes.service.ts            # fan-out quoting, signing, verification
  shipments.service.ts         # create/book/cancel/track, status mapping
  shipment-booking.worker.ts   # booking + polling jobs (existing worker pattern)
  shipping-ledger.ts           # ledger postings for platform accounts
  waybill-pdf.ts               # manual carrier waybill
  shipping-webhooks.controller.ts
  shipping-quotes.controller.ts   # public storefront endpoint
  merchant-shipments.controller.ts
  carrier-accounts.controller.ts
  ops-carriers.controller.ts
common/secret-box.ts           # AES-256-GCM helper extracted from google-calendar.service.ts
```

The existing `stores/shipping.controller.ts` and `stores/shipping-rates.ts` keep working;
`quoteShipping` becomes the pricing core of `ManualCarrier`.

### Adapter interface

```ts
interface CarrierAdapter {
  code: string;
  mode: 'API' | 'MANUAL';
  supportsScheduledPickup: boolean;
  quote(input: QuoteInput, creds: CarrierCredentials | null): Promise<CarrierQuote[]>;
  book(input: BookInput, creds: CarrierCredentials | null): Promise<BookResult>; // trackingNumber?, carrierRef, labelPdf?, cost
  cancel(shipment: ShipmentRef, creds: CarrierCredentials | null): Promise<{ fee: number }>;
  track(shipment: ShipmentRef, creds: CarrierCredentials | null): Promise<TrackingUpdate[]>;
  verifyWebhook?(req: RawWebhook): TrackingUpdate[] | null;
  testConnection?(creds: CarrierCredentials): Promise<void>;
}
```

`TrackingUpdate.status` uses the normalized shipment statuses below. Each adapter owns its own
mapping from the carrier's status codes.

## Data model (Prisma)

**New**

- `ShippingCarrier`: `id`, `code` (unique), `name`, `mode` (`API`|`MANUAL`), `trackingUrlTemplate?`
  (`{tracking}` placeholder), `platformEnabled` bool, `platformMarginBps` int (default 0), `isActive`.
  Seeded with: `dhl_express`, `patio`, `uber_direct`, `servientrega`, `ocs`, `boa_cargo`,
  `correos_bo`, `pakex`, `bc_plus`, `cargo_express`, `other`.
- `StoreCarrierAccount`: `storeId`, `carrierId`, `accountType` (`MERCHANT`|`PLATFORM`),
  `credentialsCiphertext?`, `credentialsHint?` (last 4), `isActive`,
  `lastVerifiedAt?`. Unique `(storeId, carrierId)`.
- `Shipment`: `id`, `orderId` (unique), `storeId`, `merchantId`, `carrierId`, `accountType`,
  `quoteId`, `quotedAmount`, `marginAmount`, `actualCost?`, `currency`, `status`,
  `trackingNumber?`, `carrierRef?`, `labelFileId?`, `pickupScheduledAt?`, `bookingAttempts`,
  `nextAttemptAt?`, `lastError?`, `bookedAt?`, `deliveredAt?`, timestamps.
  Status enum `ShipmentStatus`: `BOOKING`, `BOOKED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`,
  `FAILED`, `CANCELED`, `RETURNED`.
- `ShipmentEvent`: `shipmentId`, `status`, `description?`, `location?`, `occurredAt`,
  `carrierEventId?`, `createdAt`. Unique `(shipmentId, carrierEventId)` for webhook idempotency.
- `ShipmentCharge`: `shipmentId`, `kind` (`SURCHARGE`|`CANCELLATION_FEE`|`CREDIT`), `amount`,
  `reason`, `ledgerGroupId`, `createdAt`. Visible to the merchant on payout statements.

**Changed**

- `StoreOrder`: add `shippingDepartment?`, `shippingCity?`, `shippingStreet?`,
  `shippingReferences?`, `shippingLat?`, `shippingLng?`, `recipientName?`, `recipientPhone?`,
  relation `shipment Shipment?`.
- `Store.locations` JSON entries: add optional `lat`, `lng`, `department`, `city` (validated at the
  DTO layer). A branch without coordinates cannot be the origin for API carriers; it still works for
  manual carriers.
- `DeliveryZone`: add `carrierId?` (null = the store's own riders, today's behavior) and
  `departments String[] @default([])` matched against the destination department.
- `Store`: add `shippingCarriersEnabled Boolean @default(false)` (rollout flag) and
  `shippingPrepMinutes Int @default(60)`.
- `LedgerAccount` enum: add `SHIPPING_CLEARING`, `COURIER_PAYABLE`.

Departments are a fixed enum-like list validated in code: `LA_PAZ`, `SANTA_CRUZ`, `COCHABAMBA`,
`ORURO`, `POTOSI`, `CHUQUISACA`, `TARIJA`, `BENI`, `PANDO`.

## Flows

### 1. Checkout quote

1. The storefront (source-kit `commerce.js` + checkout app) collects the structured address and the
   map pin (Leaflet/OSM, starting from `navigator.geolocation` with a manual fallback).
2. `POST /v1/stores/:storeId/shipping/quotes` with `{ items, destination, originLocationId? }`.
   It is public and rate-limited per IP and per store.
3. `QuotesService` loads the store's active carrier accounts and calls each adapter's `quote()` in
   parallel with a **4 s timeout per carrier**. A failing carrier is dropped from the results and
   logged. Checkout never fails because of one carrier.
4. Platform-account API quotes add `ceil(cost * platformMarginBps / 10000)`.
5. Each option is returned as `{ quoteId, carrier, service, amount, currency, etaText, expiresAt }`.
   `quoteId` is an HMAC-signed token over
   `storeId, carrierId, accountType, service, amount, margin, cost, cartHash, destinationHash, exp`
   (15 min TTL). Pickup at a branch stays available as a separate option.
6. Cart checkout (`cart-checkout.dto.ts`) accepts `shippingQuoteId` in place of `zoneId` for
   carrier shipping. The server verifies the signature, expiry, cart hash and destination hash and
   rebuilds the shipping line itself. A shipping amount sent by the client is never trusted. The
   existing `zoneId` path is unchanged for stores with `shippingCarriersEnabled = false`.

### 2. Automatic booking

1. On payment success (the same hook that moves the order to `PAID`), if the order has a verified
   carrier quote, a `Shipment` is created in `BOOKING` within the payment transaction.
2. `shipment-booking.worker` picks it up and calls `book()`. Pickup time is
   `paidAt + store.shippingPrepMinutes` if `supportsScheduledPickup`; otherwise it dispatches
   immediately.
3. Success sets `BOOKED`, `trackingNumber`, `carrierRef`, `actualCost` and stores the label PDF via
   `PrivateFilesService`. The order moves to `PREPARING`.
4. Failure is retried 3 times with backoff (1 min, 5 min, 30 min) and then set to `FAILED`. The
   merchant dashboard shows an alert with **Reintentar** or **Cambiar a envío manual** (switch to a
   manual carrier and type the tracking number). An order is never dropped.
5. Manual carriers: `book()` generates the waybill PDF immediately and sets `BOOKED` without a
   tracking number. The merchant enters the tracking number when handing over the parcel.

### 3. Tracking

- Webhooks go to `POST /v1/shipping/webhooks/:carrierCode`. The adapter verifies the signature,
  rejects timestamps older than 5 minutes, caps the body at 256 KB, and dedupes events by
  `(shipmentId, carrierEventId)`.
- Polling: API carriers without webhooks are polled by the worker every 30 minutes while the
  shipment is in `BOOKED`, `PICKED_UP` or `IN_TRANSIT`.
- Each update appends a `ShipmentEvent` and updates `Shipment.status`, then maps it onto the order:
  `PICKED_UP`/`IN_TRANSIT` → `SHIPPED`, `DELIVERED` → `DELIVERED`. It also writes a
  `StoreOrderStatusEvent`.
- Buyer notifications reuse `queueStoreEmail`: `SHIPMENT_BOOKED` (with a tracking link),
  `SHIPMENT_DELIVERED`, `SHIPMENT_FAILED`. The existing order-tracking page shows the
  `ShipmentEvent` timeline and a carrier tracking link from `trackingUrlTemplate`.

### 4. Cancellation and refund

- A refund before pickup calls `cancel()`. The carrier's cancellation fee is recorded as a
  `ShipmentCharge` (`CANCELLATION_FEE`).
- A refund after pickup does not cancel the shipment and leaves returns to the existing
  `CustomerReturnRequest` flow.

## Money (platform account only)

Amounts are in minor units and use the existing `LedgerEntry` groups.

| Event | Debit | Credit |
|---|---|---|
| Buyer pays shipping line | `RAIL_CLEARING` | `SHIPPING_CLEARING` (instead of `MERCHANT_PAYABLE`) |
| Shipment booked (cost C, margin M) | `SHIPPING_CLEARING` C+M | `COURIER_PAYABLE` C, `PAGOSYA_FEE_REVENUE` M |
| Carrier bills more than quoted (Δ) | `MERCHANT_PAYABLE` Δ | `COURIER_PAYABLE` Δ, plus a `ShipmentCharge` SURCHARGE |
| Carrier bills less (−Δ) | `COURIER_PAYABLE` Δ | `MERCHANT_PAYABLE` Δ, plus a `ShipmentCharge` CREDIT |
| Cancellation before booking | `SHIPPING_CLEARING` | refunded with the order refund |
| Cancellation fee F | `MERCHANT_PAYABLE` F | `COURIER_PAYABLE` F |

For merchant accounts, the shipping line goes to `MERCHANT_PAYABLE` like any other sale line, and the
carrier bills the merchant directly. Carrier invoice reconciliation (settling `COURIER_PAYABLE`)
reuses the existing `ReconciliationImport` tooling and is an ops task outside this sub-project.

## Credentials & security

- `common/secret-box.ts`: AES-256-GCM extracted from `operations/google-calendar.service.ts`
  (the calendar service is switched to use it). Key from config `app.secretBoxKey`.
- Merchant carrier credentials are write-only through the API. Reads return `credentialsHint` only.
  `POST .../carrier-accounts/:id/test` calls `testConnection`.
- Platform credentials are kept only in env vars (`DHL_API_KEY`, `DHL_API_SECRET`,
  `DHL_ACCOUNT_NUMBER`, `DHL_API_BASE_URL`, and later `PATIO_*` and `UBER_DIRECT_*`).
- Outbound calls are limited to an allowlist of hosts per adapter, with no redirects followed. The
  pin is validated inside Bolivia's bounding box (lat −23.0..−9.6, lng −69.7..−57.4), except for
  international DHL destinations.
- Label PDFs go through `PrivateFilesService`, so only the owning merchant and ops can read them.
- Recipient phone and address are sent only to the booked carrier and follow
  `ACCOUNT_DEACTIVATION_AND_RETENTION.md` rules.
- Merchant endpoints use the existing `MerchantAuthGuard` + store-ownership check. Ops carrier
  config uses the existing ops guards and writes `AuditLogEntry`.

## Merchant & ops UI

- **Merchant dashboard → Envíos:** enable carriers, connect own account or use PagosYa,
  prep minutes, per-department rate tables for manual carriers, branch pins.
- **Merchant dashboard → Pedidos:** shipment panel with status timeline, label/waybill download,
  tracking number entry (manual), retry / switch to manual on `FAILED`, charges.
- **Ops app:** carrier catalog (enable platform account, margin bps, tracking URL template),
  shipments in `FAILED`, surcharge entry.

## Testing

- **Unit:** manual pricing by department and weight; free-above; quote sign/verify and tamper,
  expiry, cart-hash and destination-hash mismatch; margin rounding; status mapping per adapter; each
  ledger case in the table above sums to zero; Bolivia bounding box.
- **Adapter contract tests:** DHL against recorded responses from the MyDHL API documentation
  (rates, shipment, tracking, errors). Patio and Uber stubs assert they are disabled.
- **API integration:** quote → cart checkout → payment → auto-book → webhook → `DELIVERED`; booking
  failure → retries → `FAILED` → switch to manual; refund before pickup → cancel + fee; a stale or
  tampered quote is rejected; a replayed webhook is ignored.
- **E2E (Playwright):** checkout address form + map pin + option selection; merchant shipment panel
  with label download and manual tracking entry.

## Rollout

1. **Phase 1:** module, `ManualCarrier`, structured address + map, branch pins, waybill,
   tracking entry, notifications, ledger accounts. Behind `Store.shippingCarriersEnabled`.
2. **Phase 2:** `DhlExpressCarrier`. Code and tests work without an account. Going live needs DHL
   credentials (platform or merchant).
3. **Phase 3:** `PatioCarrier` and `UberDirectCarrier` once API access is confirmed. This is an
   adapter plus its tests, with no checkout changes.

## Out of scope

- Returns labels (reverse logistics) and multi-parcel shipments.
- Settling `COURIER_PAYABLE` against carrier invoices (ops reconciliation).
- Other Shopify-parity sub-projects (discounts, variants, etc.).

## Business prerequisites

- DHL Express Bolivia business account (platform account).
- Outreach to Patio Service (API access) and Uber (Uber Direct availability in Bolivia).
