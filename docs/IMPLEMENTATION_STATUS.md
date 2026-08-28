# Events MVP implementation status

Updated: 2026-08-27

Legend: `[x]` complete, `[~]` implemented with a documented production follow-up, `[ ]` not implemented.

## Repository and architecture

- [x] Inspected PagosYa authentication, merchant/users, checkout, payment state machine, ledger, webhook outbox, site builder, dashboards, Prisma migrations, deployment and local-development tooling.
- [x] Imported the current source tree into the initially empty `paya` workspace without copying Git history, secrets, databases or caches.
- [x] Documented the integration in `docs/EVENTS_INTEGRATION_PLAN.md`.
- [x] Implemented Events as a bounded NestJS module in the existing modular monolith. There is no duplicate account, builder, checkout, online-payment or customer system.
- [x] Preserved and extended the legacy production `Event`, `EventPriceStage`, `EventOrder`, `EventSeat` and `EventTicket` tables discovered in applied migrations.

## Domain and database

- [x] Event, venue, ticket type, reservation/item, admission order and independent admission models.
- [x] Orthogonal payment, reservation, admission, assignment, enrollment and presence states.
- [x] Attendees, secure hashed claim/management tokens, invitations and single-use claims.
- [x] Cash shifts and append-only event financial transactions.
- [x] Event staff roles, promoter profiles, allocations and guest-list schema/seed.
- [x] Biometric consent, credential references, deletion jobs and retention deadlines.
- [x] Devices, event-scoped person mappings, normalized event ingestion, attempts/events and unique event idempotency.
- [x] Additive production-safe Prisma migrations and repeatable demo seed.
- [~] Refund/void history is modeled and payment policy denies refunded admissions; dedicated Events refund/void operator endpoints remain a production follow-up.
- [~] Promoter allocation models and RBAC are present; promoter CRUD and conversion-report screens remain a follow-up.

## Online commerce integration

- [x] Serializable inventory reservation with configurable expiry and atomic availability updates.
- [x] Existing PagosYa `PaymentIntent` creation using the server-calculated reservation amount.
- [x] Trusted in-transaction payment-success bridge; the browser cannot confirm payment.
- [x] Idempotent admission materialization, one admission per purchased unit.
- [x] Buyer management, private invitation links, browser claim screen and one-time claim tokens.
- [x] `event-tickets` block in the existing Store site document, builder integration and storefront renderer.
- [x] Existing checkout receipt exposes `Gestionar entradas` after a successful event payment.

## Venue operation

- [x] Touch-friendly cash POS and independent admissions for group sales.
- [x] Random six-digit, 15-minute, HMAC-stored, single-use enrollment codes.
- [x] Device-side mock enrollment with explicit, versioned consent.
- [x] Mock recognition, unknown-face, spoof, offline/online, duplicate and enrollment-failure simulation.
- [x] Atomic entry, exit, re-entry and anti-passback using serializable transactions, database locks and bounded serialization retries.
- [x] Manual entry/exit with permission, reason and immutable audit record.
- [x] Server-derived capacity, sales, cash, device, denied-attempt and recent-access dashboard.
- [x] Cash reconciliation (`expectedCash`, declared cash and difference).
- [~] Promoter aggregate dashboard is not yet exposed in the UI.

## Hardware and edge

- [x] Vendor-neutral `packages/access-control` contract.
- [x] Fully functional `MockAccessControlProvider`.
- [x] Isolated, fail-closed `ZKTecoSpeedFaceProvider` with no invented protocol behavior.
- [x] Executable `apps/edge` service with normalized input validation, persistent owner-only JSON queue, exponential retry, idempotency key forwarding and `/health` lag metrics.
- [~] Cloud remains authoritative in this MVP. Local roster/config caching and an explicitly provisioned least-privilege edge credential need deployment work before offline authorization is enabled.
- [x] `docs/ZKTECO_INTEGRATION.md` labels confirmed, unconfirmed and vendor-documentation requirements.

## Privacy, security and operations

- [x] `docs/PRIVACY_AND_COMPLIANCE.md` with an explicit Bolivian legal-review gate.
- [x] Event RBAC enforced in services, not only in the UI.
- [x] Explicit biometric deletion action removes provider/device mappings and credential references and audits completion.
- [~] Retention timestamps and deletion jobs exist; the scheduled retention worker and alerting are still required for production.
- [~] Device secrets are never returned after configuration. Production must connect `encryptedSecrets` to the existing KMS/secret-envelope implementation before accepting real device credentials.
- [x] Normalized observability excludes images, templates, passwords and raw vendor payloads.
- [x] Security tokens use `node:crypto`; bearer tokens are hashed at rest and removed from claim URLs before rendering.

## Verification completed

- [x] Prisma schema formatted/generated; additive migrations deployed to the local PagosYa database.
- [x] Seed completed for Noche Demo / Club Demo La Paz / Fiesta Demo.
- [x] API, checkout, access-control and edge TypeScript builds pass.
- [x] Checkout production Vite build passes.
- [x] 23 Events-specific automated tests pass: 19 API/domain/security/payment, 2 access-provider and 2 edge-queue tests.
- [x] Executable end-to-end demo script passes cash group sale, three independent enrollments, entry, anti-passback, exit, re-entry, simultaneous-reader locking, duplicate replay, cash close, online PaymentIntent, three online admissions, invitation/claim, RBAC, privacy response filtering and biometric deletion.
- [x] Edge process smoke-tested in local-only mode: `/health` and persistent queue acceptance.
- [ ] Browser visual smoke test could not run because this execution environment exposed no connected in-app/Chrome browser and no `playwright-cli` executable. Static TypeScript/Vite builds passed; run the documented browser check locally before release.

## Hardware limitation

No official SpeedFace-V5 SDK, PUSH, ADMS or protocol documentation exists in the inspected repository. Real device communication is intentionally unimplemented until the exact model/firmware documentation is supplied. Mock-backed PagosYa Events remains fully demonstrable without hardware.
