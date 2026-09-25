# Guided Growth (G2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Crecimiento" view that shows the merchant what happens in their store (visits, clicks on the site, clicks
in the checkout, funnel, products, devices, referrers) and tells them, with evidence, the next five things to do — each
with one button that does it (opens YAPI with the instruction ready, the product at the right step, the promo form,
the proposal composer, the right settings, the inbox).

**Architecture:** The API composes one answer (`GET growth/overview`) from the G1 rollup report (current and previous
period), orders, the catalog, leads and one raw device query, and runs a pure, deterministic insights engine over it.
Dismiss/snooze is a small table. The dashboard gets a pure helper module (formatting, chart geometry, action routing)
and a panel module mounted like Cobros; the Studio learns two small things (a compose notice, a product-guide step).

**Tech Stack:** NestJS + Prisma (Postgres), Jest (ts-jest, `rootDir: src`); vanilla ES modules dashboard, node:test,
Playwright (mocked API); Studio TypeScript + Playwright.

**Spec:** `docs/superpowers/specs/2026-09-25-guided-growth-design.md`.

## Global Constraints

- No paid AI calls; the engine is deterministic. Never auto-apply a suggestion: every action opens a screen, prefilled.
- Impact text only when it is arithmetic on the store's own numbers, labelled "Estimación".
- Referrer hosts are rendered as text only (esc / textContent), never as links or HTML.
- Commit only own paths (`git commit -m … -- <paths>`); shared glue (`index.html`, `dashboard.js`, `server.mjs`,
  `schema.prisma`) is committed with only G2 hunks staged (build the index blob from HEAD + G2 edit, then commit the
  index), since D2 has uncommitted hunks in the same files.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest store-growth`.

## Review Focus

1. A store whose paid orders exceed measured (consented) visits must show conversion "—" with the explanation, not a
   number above 100 % → Task 3 test.
2. A WhatsApp-mode store must never be told about paid orders, the payment step or a payment drop-off → Tasks 2, 3, 7 tests.
3. Every insight's evidence names the period and a number; no impact appears without the store's own base numbers
   (e.g. < 50 view sessions store-wide → no add-rate impact) → Task 2 tests.
4. A snoozed insight whose date passed shows again; a dismissed one never does; a new product produces a new id → Task 2/4 tests.
5. A referrer host containing markup renders as literal text → Task 7 test.
6. The YAPI action only fills the composer: no message is sent → Task 5 test (Studio) and Task 7 (dashboard stub).
7. The ownership check runs before any read for a foreign store → Task 4 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/store-analytics/store-analytics-report.ts` (modify) | `viewSessions`, `addSessions`, `productLimit`. |
| `apps/api/src/store-analytics/store-analytics.service.ts` (modify) | `report(..., { productLimit })`. |
| `apps/api/src/store-growth/growth-insights.ts` (create) + spec | Pure rules, ranking, filtering. |
| `apps/api/src/store-growth/growth-overview.ts` (create) + spec | Pure KPIs, funnel, tables, weekly summary. |
| `apps/api/src/store-growth/store-growth.service.ts` (modify) + spec | Loader, device query, insight state. |
| `apps/api/src/store-growth/store-growth.controller.ts` (modify) + spec | Routes and DTOs. |
| `apps/api/src/store-growth/store-growth.module.ts` (modify) | Import `StoreAnalyticsModule`. |
| `apps/api/prisma/schema.prisma` (append), `prisma/migrations/20260925230000_store_growth_insight_state/migration.sql` | Table. |
| `apps/api/src/store-growth/store-growth.integration.spec.ts` (create) | Device query + state on real Postgres. |
| `apps/merchant-studio/src/source-studio.ts`, `source-product-guide.ts`, `source-create-product.ts` (modify) | Compose notice, guide step. |
| `apps/merchant-studio/tests/growth-handoff.spec.ts` (create) | Embedded compose + guide step. |
| `apps/merchant-dashboard/src/growth.mjs` (create) + `growth.test.mjs` | Pure helpers. |
| `apps/merchant-dashboard/src/growth-panel.mjs`, `growth.css` (create) | The view. |
| `apps/merchant-dashboard/index.html`, `src/dashboard.js`, `server.mjs` (modify, minimal) | Nav, section, mount, action routing, whitelist. |
| `apps/merchant-dashboard/tests/growth.spec.mjs` (create) | Playwright at 390/1280. |

---

### Task 1: G1 report exposes view/add sessions and every product on request

**Files:** Modify `store-analytics-report.ts`, `store-analytics.service.ts`; Test `store-analytics-report.spec.ts`.

**Interfaces:** `buildAnalyticsReport(rows, names, from, to, mode, { productLimit = 10 })`; each `topProducts[]` gains
`viewSessions`, `addSessions`. `StoreAnalyticsService.report(merchantId, storeId, query, { productLimit? })`.

- [ ] Step 1: update the existing `topProducts` expectation with the two fields; add "returns every product when asked" (12 products, `productLimit: 50` → 12; default → 10). Run `npx jest store-analytics-report` → RED (missing fields / TS2554).
- [ ] Step 2: implement; GREEN; `npx jest store-analytics` green.
- [ ] Step 3: commit `feat(analytics): the report carries view and add sessions per product and can list every product`.

### Task 2: Insights engine v2 (pure)

**Files:** Create `store-growth/growth-insights.ts`, `growth-insights.spec.ts`.

**Interfaces:** `buildGrowthInsights(input: GrowthInsightInput): GrowthInsight[]` (all active, ranked);
`selectInsights(all, states, now) → { insights (≤ 5), moreInsights, hiddenInsights }`.
`GrowthInsightInput = { days, mode, store: { published, paused, verified, hasPolicies: { returns, delivery } },
report, previousReport, products: [{ id, name, stock, photos, hasDescription, amount, createdAt }], unitsSold: Map,
paidEver, unreadLeads, oldestUnreadAt, leadsInPeriod, devices: [{ device, sessions, addSessions }], storeName, now }`.

- [ ] Step 1: tests, one `describe` per rule: fires at the threshold, silent just below; evidence contains the number and "últimos N días"; action kind/payload; WhatsApp mode never yields payment wording or `payment`/`contact` drop; impact present only with the base (≥ 50 store view sessions; both devices ≥ 30; stock pace), and phrased "Estimación"; ranking (blockers first, severity, weight) and the 5 cap; `selectInsights` hides dismissed, hides a live snooze, shows an expired one, counts both. RED: `Cannot find module './growth-insights'`.
- [ ] Step 2: implement; GREEN.
- [ ] Step 3: commit `feat(growth): deterministic insights engine v2 over analytics, orders, catalog and Store Brain gaps`.

### Task 3: Overview assembly (pure)

**Files:** Create `store-growth/growth-overview.ts`, `growth-overview.spec.ts`.

**Interfaces:** `buildGrowthOverview({ days, mode, current, previous, orders (current/previous summaries), weekly
orders, products, unitsSold, devices, … }) → { kpis, funnel, traffic, checkout, ctas, products: { top, bottom },
devices, referrers, weekly, hasData }`; `growthPeriods(now, days)`.

- [ ] Step 1: tests: periods are Bolivia days (the UTC−4 boundary); KPIs per mode (payment outcome = paid orders with net sales detail, WhatsApp = whatsapp sessions, external = pay_click); delta `null` when previous 0; conversion `null` when outcome > visits; funnel losses never negative; bottom products include never-viewed catalog products; weekly text for payment, WhatsApp and a silent week. RED: missing module.
- [ ] Step 2: implement; GREEN.
- [ ] Step 3: commit `feat(growth): KPIs by checkout mode, funnel, tables and the weekly summary`.

### Task 4: Persistence, loader and routes

**Files:** schema block + migration; modify service, controller, module; tests `store-growth.service.spec.ts`,
`store-growth.controller.spec.ts` (create), `store-growth.integration.spec.ts` (create).

- [ ] Step 1: schema + migration (`CREATE TABLE "StoreGrowthInsightState"` + unique index), `prisma migrate deploy` locally, `prisma generate`, tsc.
- [ ] Step 2: tests: `overview` refuses a foreign store before any read; passes `productLimit` and both periods to the report; composes insights with states; `setInsightState` upserts dismiss/snooze (+7 days), deletes on restore, 404 foreign; controller: `days` must be 7|30|90 (400 otherwise), action enum, insight id pattern. Integration: device query counts distinct sessions per device inside the period only; state upsert/restore. RED.
- [ ] Step 3: implement; GREEN; `npx jest store-growth store-analytics store-knowledge`.
- [ ] Step 4: commit schema + migration first (only the G2 schema hunk), then `feat(growth): GET growth/overview and per-store dismiss/snooze of insights`.

### Task 5: Studio hand-off

**Files:** modify `source-studio.ts`, `source-product-guide.ts`, `source-create-product.ts`; test `tests/growth-handoff.spec.ts`.

- [ ] Step 1: tests: an embedding page posts `{ type: 'pagosya:studio-action', action: 'compose', origin: 'growth', text }` → composer holds the text, a status notice reads "Sugerencia lista", no `/messages` request; the product guide receives `pagosya:product-guide-edit` with `step: 'stock'` → "Paso 7 de 8" and the stock field focused. RED (no notice; guide at step 1).
- [ ] Step 2: implement; GREEN; run touched specs + `cross-sell-kit` + `checkout-layout`; rebuild the embedded Studio (`build:studio`).
- [ ] Step 3: commit `feat(studio): growth hand-offs — a compose notice and opening the product guide at a step`.

### Task 6: Dashboard pure helpers

**Files:** create `merchant-dashboard/src/growth.mjs`, `growth.test.mjs`.

- [ ] Step 1: tests: `formatDelta`, `formatPercent`, `ctaLabel`, `stepLabel` (mode-aware), `linePath` (scales, flat zero series, single point), `barWidth`, `actionRoute(action)` → `{ view, … }` for all seven kinds, unknown kind → null. RED.
- [ ] Step 2: implement; GREEN (`node --test src/growth.test.mjs`).
- [ ] Step 3: commit.

### Task 7: The "Crecimiento" view

**Files:** create `growth-panel.mjs`, `growth.css`, `tests/growth.spec.mjs`; glue `index.html`, `dashboard.js`, `server.mjs`.

- [ ] Step 1: Playwright spec (mocked API): rich store at 1280 and 390 (KPIs, deltas, funnel, chart + table, CTAs, checkout steps, products, devices, referrer `<b>x</b>.com` shown literally, no horizontal overflow); period switch requests `days=7`; each action kind routes (yapi → stub Studio receives compose with origin growth; product/stock → product guide message with step; proposal → composer with brief; promo → code field; settings → section; inbox); dismiss/snooze/restore call PUT/DELETE; empty store teaches; WhatsApp store wording. RED (no nav item).
- [ ] Step 2: implement panel, CSS, glue; GREEN; full dashboard Playwright `--workers=2` + unit.
- [ ] Step 3: commit panel files, then glue with only G2 hunks.

### Task 8: Screens and verification

- [ ] Screenshots `tmp/growth-shots/{rich,empty}-{390,1280}.png`, look at each, fix what is ugly.
- [ ] `npx jest store-growth store-analytics store-knowledge`; integration store-growth + store-analytics; api tsc; eslint on touched TS; Studio specs; dashboard unit + Playwright; record in the ledger.
