# Analytics Capture (G1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published store records consented, allow-listed shopper events (page views, CTA clicks, card impressions and clicks, product views, adds, cart opens, checkout steps, pay and WhatsApp clicks, contact sends, searches), rolls them up per day, keeps raw rows 13 months, and serves a merchant read API that G2 will draw.

**Architecture:** The kit (sandboxed, no storage) emits events to the host page; the host (checkout app) applies consent, reuses the funnel session, dedupes, batches and posts to `POST v1/stores/public/:slug/events`. The API validates each event, stores raw rows (`StoreAnalyticsEvent`), and a 15-minute worker rebuilds yesterday+today's `StoreAnalyticsDaily` rows and prunes raw rows past 13 months. `GET v1/stores/:storeId/analytics` assembles totals, series, products, CTAs, devices, referrers and checkout drop-off from rollups. The funnel is untouched.

**Tech Stack:** NestJS + Prisma (Postgres), Jest (ts-jest, `rootDir: src`; `*.integration.spec.ts` via `jest.integration.config.js` and `common/testing/integration-database`), plain browser JS kit (jsdom specs in `storefront-source`), Vite/Vitest checkout app.

**Spec:** `docs/superpowers/specs/2026-09-25-analytics-capture-design.md`.

## Global Constraints

- Never touch `apps/api/src/business-documents/**`, `apps/api/src/payment-intents/**`, `apps/merchant-dashboard/src/cobros*`, `apps/checkout/src/**/cobro*` (another agent). `schema.prisma` gets one appended block, committed immediately after editing.
- The migration is additive (CREATE TABLE / INDEX only). `prisma migrate diff` also prints an unrelated `ALTER INDEX "IntegrationProductMapping_…" RENAME` line: remove it.
- `commerce.js` stays plain, dependency-free browser JS: no ES2022+ built-ins (`source-kit-browser-floor.spec.ts`).
- The kit emits only when `PAGOSYA_HOSTED`; the host sends nothing in a preview or without consent (`privacy.analyticsAllowed`).
- Rows never hold an IP, a user agent, a customer field or search words; rollups hold no session hash.
- Jest paths are relative to `apps/api/src`. Commit per task with `git commit -m … -- <paths>`.

## Review Focus

1. A click on an authored cart button with `data-track="nav-cart"` must still record `cta_click` even though the kit's cart listener calls `stopImmediatePropagation` → Task 6 test (window capture listener).
2. One bad event in a batch must not lose the other 19, but a malformed envelope (no v4 UUID, not an array, 21 events) must be a 400 → Task 1 test.
3. The rollup must bucket by Bolivia day: an event at 03:30 UTC on the 2nd belongs to the 1st → Task 4 integration test; re-running the rollup must not double counts → same test.
4. Card impressions: once per product per session across page navigations (the kit resets per page; the host remembers) → Task 7 test.
5. Withdrawn consent mid-session must drop the queued events and clear the analytics session key → Task 7 test.
6. A `productId` from another store must be dropped (not stored) → Task 3 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/store-analytics/store-analytics.constants.ts` (create) | `ANALYTICS_EVENT_TYPES`, `ANALYTICS_TRACK_LABELS`, `ANALYTICS_CHECKOUT_STEPS`, limits. |
| `apps/api/src/store-analytics/store-analytics-input.ts` (+ spec) | `normalizeAnalyticsBatch`, `deviceClass`, `referrerHost`. |
| `apps/api/prisma/schema.prisma`, `prisma/migrations/20260925200000_store_analytics/migration.sql` | Two tables. |
| `apps/api/src/store-analytics/store-analytics.service.ts` (+ spec, + integration spec) | `ingest`, `rollup`, `prune`, `report`. |
| `apps/api/src/store-analytics/store-analytics-report.ts` (+ spec) | `buildAnalyticsReport(rows, names, from, to)`, `boliviaDay`. |
| `apps/api/src/store-analytics/store-analytics.controller.ts` (+ spec) | Public POST; owner GET. |
| `apps/api/src/store-analytics/store-analytics.worker.ts` | 15-minute rollup + prune. |
| `apps/api/src/store-analytics/store-analytics.module.ts`, `apps/api/src/app.module.ts` | Wiring. |
| `packages/storefront-kit/kit/commerce.js`, `privacy.js` | Emit and flush; clear the key. |
| `apps/api/src/storefront-source/source-commerce-analytics.spec.ts` (create) | Kit behaviour in jsdom. |
| `apps/checkout/src/store-analytics.ts` (+ `test/store-analytics.test.ts`) | Host queue. |
| `apps/checkout/src/store-funnel.ts`, `source-storefront.ts`, `main.ts`, `state.ts`, `storefront/product-page.ts`, `storefront/store-page.ts`, `cart/cart.ts`, `cart/cart-review-dialog.ts` | Wiring and legacy events. |
| `apps/api/src/storefront-source/source-shopping-flow.ts` (+ spec line) | Prompt line. |

---

### Task 1: Allow-lists and batch normalisation

**Files:** create `store-analytics.constants.ts`, `store-analytics-input.ts`, `store-analytics-input.spec.ts`.

**Interfaces:**
- Produces: `normalizeAnalyticsBatch(body: unknown): { sessionId: string; events: NormalizedEvent[]; referrerHost: string | null }` (throws `BadRequestException` on a bad envelope); `NormalizedEvent = { type; productId: string | null; target: string | null; path: string | null }`; `deviceClass(userAgent?: string): 'mobile' | 'desktop'`; `referrerHost(value: unknown): string | null`.

- [ ] **Step 1: failing tests** — envelope: missing/v1 UUID, non-array, empty, 21 events → 400. Events: unknown type dropped; `cta_click` without/with unknown label dropped, with `hero-cta` kept; `checkout_step` takes `step` into `target`; product events without a `^[\w-]{1,64}$` id dropped; `path` kept only for `^[a-z0-9][a-z0-9_-]{0,60}\.html$`; extra fields (`email`, `at`) never reach the output; `referrerHost('https://WWW.Instagram.com/x?y')` → `instagram.com`, junk → null; `deviceClass` iPhone/Android → mobile, desktop Chrome/undefined → desktop.
- [ ] **Step 2:** `cd apps/api && npx jest store-analytics/store-analytics-input` → FAIL (module missing).
- [ ] **Step 3:** implement.
- [ ] **Step 4:** PASS. **Step 5:** commit `feat(analytics): allow-listed store events and strict batch normalisation`.

### Task 2: Schema and migration

**Files:** `schema.prisma` (append), `prisma/migrations/20260925200000_store_analytics/migration.sql`.

- `StoreAnalyticsEvent { id BigInt @id @default(autoincrement()); storeId; sessionHash; type; productId?; target?; path?; device; referrerHost?; createdAt @default(now()); @@index([storeId, createdAt]); @@index([createdAt]) }`
- `StoreAnalyticsDaily { id cuid; storeId; day @db.Date; type; productId @default(""); target @default(""); count Int; uniqueSessions Int; updatedAt @updatedAt; @@unique([storeId, day, type, productId, target]); @@index([storeId, day]) }`

- [ ] Re-read the schema tail, append the block, `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`, keep only the two tables' lines, `npx prisma migrate deploy`, `npx prisma generate`, `npx prisma migrate status` → up to date; `npx tsc --noEmit` clean. Commit `feat(analytics): StoreAnalyticsEvent and StoreAnalyticsDaily tables`.

### Task 3: Ingestion

**Files:** `store-analytics.service.ts` (`ingest`), `store-analytics.controller.ts` (public POST), `store-analytics.module.ts`, `app.module.ts`; tests in `store-analytics.service.spec.ts`, `store-analytics.controller.spec.ts`.

**Interfaces:** `ingest(slug, body, { userAgent?, gpc? }): Promise<{ accepted: number }>`.

- [ ] **Step 1: failing tests** — unpublished/paused/inactive store → 404 with the funnel's `where`; `gpc` → `{accepted:0}` with no DB write; product events keep only ids returned by `paymentLink.findMany({ where: { storeId, id: { in } } })`; `createMany` rows carry `sessionHash = sha256(sessionId)` (equal to the funnel's), server `device`, `referrerHost` only on `page_view`; zero accepted → no `createMany`. Controller: throttle metadata 30/min, `@HttpCode(202)`, passes `user-agent` and `sec-gpc === '1'`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS + `npx jest store-growth`. **Step 5:** commit `feat(analytics): public batched event ingestion`.

### Task 4: Rollup, retention and worker

**Files:** `store-analytics.service.ts` (`rollup(days?)`, `prune(now?)`), `store-analytics.worker.ts`, `store-analytics.integration.spec.ts`.

- [ ] **Step 1: failing integration test** (real Postgres harness): seed events across 2026-09-01 03:30Z (→ Bolivia 08-31) and 09-01 12:00Z, two sessions, product and CTA rows, a mobile and a desktop page view with a referrer; `rollup` over those days → exact rows incl. `_device`/`_referrer`; run twice → same rows; `prune` deletes a 14-month-old row and keeps a 12-month-old one.
- [ ] **Step 2:** FAIL. **Step 3:** implement SQL (`("createdAt" - interval '4 hours')::date`, `COUNT(DISTINCT "sessionHash")`, advisory xact lock, delete+insert in one transaction; prune in 5 000-row batches). Worker: 15-min `@Interval`, 7 days on the first tick, 2 after; prune when 6 h have passed. **Step 4:** PASS. **Step 5:** commit `feat(analytics): idempotent daily rollup and 13-month retention`.

### Task 5: Read API

**Files:** `store-analytics-report.ts` (+ spec), service `report`, controller owner GET (+ spec), integration assertion.

- [ ] **Step 1: failing tests** — pure `buildAnalyticsReport`: dense series with zero days, totals, top products sorted by views with `addRate` and "Producto eliminado", CTAs, devices, referrers, checkout drop-off skipping the optional `delivery` when computing the next step's loss; controller: `from > to`, > 400 days, bad date, `granularity=hour` → 400; other merchant's store → 404.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS (unit + integration). **Step 5:** commit `feat(analytics): merchant analytics read API for G2`.

### Task 6: Kit emits events

**Files:** `packages/storefront-kit/kit/commerce.js`, `privacy.js`; create `apps/api/src/storefront-source/source-commerce-analytics.spec.ts`.

- [ ] **Step 1: failing jsdom tests** (hosted boot with `parent.postMessage` spied): page_view with path on boot; `data-track="hero-cta"` → `cta_click`; unknown label → none; `data-track="nav-cart"` on `[data-cart-open]` → `cta_click` + `cart_open`; card click → `product_card_click` with id, add button → `add_to_cart` with id and no card click; product open → `product_view` once; review → `checkout_step review` once; pay → `pay_click`; WhatsApp mode → `whatsapp_click`; impressions via a stubbed `IntersectionObserver` once per card; events arrive batched in one message and flush on `pagehide`; preview (not hosted) → no `pagosya:analytics` message; kit label list equals `ANALYTICS_TRACK_LABELS`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (`analytics(type, fields, onceKey)`, window capture click listener, `observeCards()` after catalog render, `cardProductId` shared with motifs). `privacy.js` `clearTracking` also removes `pagosya:analytics:<slug>`. **Step 4:** PASS + `npx jest storefront-source --runInBand` + `pnpm --filter @pagosya/storefront-kit test`. **Step 5:** commit `feat(kit): emit allow-listed analytics events to the host`.

### Task 7: Host queue and forwarding

**Files:** create `apps/checkout/src/store-analytics.ts`, `test/store-analytics.test.ts`; modify `store-funnel.ts` (export `sessionId()`), `source-storefront.ts`, `test/source-storefront.test.ts`.

**Interfaces:** `createStoreAnalytics(slug, preview, session: () => string | undefined): { record(event: unknown): void; flush(): void; dispose(): void }`.

- [ ] **Step 1: failing tests** — no consent / preview → no fetch; consented: events batched into one POST to `/stores/public/<slug>/events` with `credentials:'omit'`, `keepalive:true`, the funnel session id; 20 queued → immediate flush; impression for the same product twice (even from a new instance in the same session) → once; `referrer` sent once; unknown type / label dropped client-side; consent withdrawn → queue dropped and `pagosya:analytics:<slug>` removed; `source-storefront` forwards `pagosya:analytics` frame messages and records `checkout_step contact` when the secure checkout form opens and `payment` before `onPayment`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `pnpm --filter @pagosya/checkout test` PASS. **Step 5:** commit `feat(checkout): consented analytics queue for hosted stores`.

### Task 8: Legacy storefront events

**Files:** `main.ts`, `state.ts`, `storefront/product-page.ts`, `storefront/store-page.ts`, `cart/cart.ts`, `cart/cart-review-dialog.ts`.

- [ ] Wire `state.activeStoreAnalytics` beside `activeStoreFunnel` and emit `page_view`, `product_view` (id), `add_to_cart` (id of the line that grew), `checkout_step` review/delivery/payment, `pay_click`, `whatsapp_click`, `search` (debounced). Test in `test/store-analytics.test.ts` for the add-diff helper. Commit `feat(checkout): legacy storefront emits the same analytics events`.

### Task 9: Generation prompt line

**Files:** `source-shopping-flow.ts`, a spec asserting the line lists exactly `ANALYTICS_TRACK_LABELS`.

- [ ] RED → add the line → GREEN (`npx jest storefront-source/source-shopping-flow storefront-source/source-generation.service`). Commit `feat(yapi): tag primary calls to action with allow-listed data-track labels`.

### Task 10: Verification

- [ ] `npx jest store-analytics store-growth`; `npx jest --config jest.integration.config.js store-analytics`; `npx jest storefront-source --runInBand`; checkout vitest; `pnpm --filter @pagosya/storefront-kit test`; Studio Playwright `tests/cross-sell-kit.spec.ts tests/checkout-layout.spec.ts`; `tsc --noEmit` (api, checkout); eslint on touched TS; Chromium probe under `/tmp` (hosted fixture with consent → journey types; without → none). Record in the ledger.
