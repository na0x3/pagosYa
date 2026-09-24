# Merging `feature/yapi-differentiation`

Prepared 2026-09-22. This is a merge *plan*, not a merge: nothing has been
merged and nothing has been pushed.

## Where things stand

| | |
|---|---|
| Branch | `feature/yapi-differentiation` |
| Ahead of `main` | 90 commits |
| **Behind `main`** | **35 commits** |
| `origin/main` | `2bdbbbd` (27 Aug) — local `main` is ahead of it and unpushed |
| Conflicting files | 14 |

Two separate divergences, and it is worth being clear that they are separate:

1. The branch is 35 commits behind local `main`, which carries the whole
   `feature/shipping-carriers` merge — courier shipping, checkout address
   collection with a map pin, shipment booking, balanced ledger journals, and
   several security fixes (the hosted-storefront geolocation gesture, tracking
   URL validation, Leaflet SRI + CSP).
2. Local `main` is itself ahead of `origin/main` and unpushed, so none of that
   work is on the remote either.

A month of work sitting in two unpushed places is the largest single risk in
the repository right now — larger than anything in the code. None of it is
protected by CI until it lands.

## Before merging

`pnpm test` is green on the branch as it stands (verified 2026-09-22 with
`CI=true` against a real Postgres). CI, however, could not have passed until
the `ci:` commit on this branch — `build-and-test` had no database for the
integration suites, and the root `pnpm test` reached merchant-dashboard's
Playwright suite in a job with no browsers. Both are fixed here, so merge this
branch *before* judging main's CI.

## Migrations: clean

No interleaving problem. Main's are older than the branch's, so they apply in
the right order after the merge, and `schema.prisma` auto-merges.

```
main only:    20260917120000_shipping_carriers
              20260917130000_parcel_profile
branch only:  20260919120000_store_public_visibility
              20260919140000_source_check_results
              20260919160000_source_runtime_bundles
              20260919180000_store_policies
              20260922020000_email_delivery_reply_to
              20260922030000_store_inbox
              20260922040000_store_inbox_origin
              20260922050000_email_delivery_message_id
```

The `migration-safety` CI job is exactly the check this needs: it seeds data on
the base schema, then applies the branch's migrations on top. Let it run.

## The 14 conflicts

One needs a real decision; the rest are ordinary two-sided edits to hot files.

### `apps/api/src/shipping/shipping.module.ts` — add/add, **decide this one**

Both branches created a `ShippingModule` independently, for different things.
The resolution is a union, not a choice:

- **main** — `CarrierRegistry`, `ManualCarrier`, `ShipmentsService`,
  `ShipmentBookingWorker`, `MerchantShipmentsController`,
  `OpsCarriersController`, imports `OpsModule`, exports `ShipmentsService`
- **branch** — `ShippingController` (delivery zones and rates)

The merged module wants main's providers and controllers *plus* the branch's
`ShippingController`, importing `OpsModule`. Check afterwards that
`shipping-rates.ts` (the branch's plain checkout-pricing helpers) and main's
carrier rate quoting have not grown two answers to the same question.

### The other 13

| File | Why both sides touched it |
|---|---|
| `apps/api/src/app.module.ts` | both registered new modules |
| `apps/api/src/stores/stores.service.ts` | store core, edited by both |
| `apps/api/src/stores/dto/create-store.dto.ts` | new store fields on both sides |
| `apps/api/src/storefront-source/source-chat.service.ts` | YAPI chat vs. editor browser-check findings |
| `apps/api/src/storefront-source/source-asset-library.ts` | bundle uploads vs. branch asset work |
| `apps/api/src/storefront-source/source-conversation.service.spec.ts` | follows source-chat |
| `apps/checkout/src/main.ts` | thin bootstrap, both added wiring |
| `apps/checkout/src/source-storefront.ts` | hosted storefront, geolocation fix vs. branch changes |
| `apps/merchant-dashboard/index.html` | markup, both sides |
| `apps/merchant-dashboard/server.mjs` | main added the shipment-panel route |
| `apps/merchant-studio/src/source-checks.ts` | browser checks, both sides |
| `packages/storefront-kit/kit/commerce.js` | **served live to every published store** |
| `packages/storefront-preview/src/source-preview.ts` | preview renderer |

`commerce.js` deserves the slowest review: it ships into every already-published
storefront, so a bad resolution there is live for merchants immediately, with no
deploy of ours in between. It is also now parse-checked by
`packages/storefront-kit/kit/check-runtimes.mjs` — run that after resolving.

## Suggested sequence

Merge `main` *into* the branch first, so the conflicts are resolved on the
feature branch where they can be tested, rather than on `main`.

```bash
git switch feature/yapi-differentiation
git merge main                 # resolve the 14 above
pnpm install
pnpm --filter @pagosya/api exec prisma generate
pnpm build
CI=true pnpm test              # needs a reachable Postgres
pnpm check:boundaries
pnpm --filter @pagosya/storefront-kit run test
```

Then the browser suites that CI actually runs:

```bash
pnpm --filter @pagosya/merchant-studio exec playwright test \
  tests/source-next.spec.ts tests/source-shopping-flow.spec.ts \
  tests/source-checks.spec.ts tests/source-publication.spec.ts \
  tests/store-readiness.spec.ts
pnpm --filter @pagosya/merchant-dashboard run build:studio
pnpm --filter @pagosya/merchant-dashboard exec playwright test \
  tests/merchant-workspace.spec.mjs tests/auth-account.spec.mjs \
  tests/consumer-auth-account.spec.mjs --workers=1
```

Expect three known dashboard failures (`merchant-workspace.spec.mjs`), recorded
in `CLEAN_CODE_PLAN.md` as pre-existing on `3b9d5aa`. Anything beyond those is
yours.

Only then:

```bash
git switch main
git merge --no-ff feature/yapi-differentiation
git push origin main           # first push since 27 Aug — expect it to be large
```

## Afterwards

Local `main` being ahead of `origin/main` is the habit to break, not just the
state to fix. Whatever the cause — the 15 local branches suggest long-lived
parallel work — merging monthly means conflict sets like this one every time,
in the same hot files.
