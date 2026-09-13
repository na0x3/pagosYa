# Archived: Events + biometric access-control feature

Not part of the build (nothing imports from `archive/`). Kept here so this code and schema
are easy to find and reuse later without digging through git history, after the feature was
retired from the live app.

## What this was

A full event-ticketing and biometric (face-recognition) venue access-control system:
ticket sales/reservations, admissions/QR entry, venue kiosk devices, cash shifts, guest
lists, promoter allocations, and a `zkteco-speedface` biometric device integration running
on a separate offline-capable edge process.

## What's in here

- `apps/api/src/events/` — NestJS controllers/services for events, ticketing, the
  events-payment bridge, access policy/security, and face-entry enrollment.
- `apps/edge/` — the offline-queue process that ran on venue kiosk hardware.
- `packages/access-control/` — the biometric device SDK (`zkteco-speedface` provider) and
  its mock/testing provider.
- `apps/merchant-dashboard/tests/operations-hub.spec.mjs` — the merchant "Centro operativo"
  screen's browser test.
- `scripts/` — the events-migration builder and demo/verification scripts.
- `schema-before-removal.prisma` — the *complete* API Prisma schema exactly as it stood
  before the Events-domain models/enums were removed (commit `0e5e87e`), for reference. The
  actual removal (which models/enums, exactly) was decided in the follow-up cleanup pass —
  check that commit's message for the precise list.

## Provenance

- Application code recovered from commit `b16e432` (the last commit before
  `f200e98 "Retire Events and remove obsolete merchant screens"` deleted it).
- Schema snapshot taken from commit `0e5e87e` (the last commit before the Events-domain
  tables/enums were dropped from `schema.prisma` and the database migration).

## Reusing this

This code was written against the schema in `schema-before-removal.prisma` and against
dependencies current as of commit `b16e432` — expect it to need updating (Prisma client
types, NestJS module wiring, `app.module.ts` registration, `access-control` package
publishing/linking) before it would run again as-is.
