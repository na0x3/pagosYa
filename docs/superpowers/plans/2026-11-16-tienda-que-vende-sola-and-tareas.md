# «La tienda que vende sola» + «Tareas de YAPI» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, owner 2026-11-16 «fix everything first, then run
> the tests»). Steps use checkbox (`- [ ]`) syntax.

**Goal:** a published store tries one small selling change at a time (section order, best seller first, button word, sticky buy bar),
keeps it only when it sells more, shows returning shoppers what they looked at, reports the week to the merchant with «Deshacer»; and a
dashboard «Tareas» page lists YAPI's jobs as cards with minutes, credits and «Empezar».

**Architecture:** the kit reads `PAGOSYA_CONFIG.selling` (runtime switches, no rebuild, no model call). The API keeps the store's kept
changes (`StoreSellingChange`), runs one test at a time as a `StoreSourceExperiment` of kind `'selling'` (same revision, B's switches in
`variantSettings`), tags analytics events with the visitor's side, and a daily job decides keep/undo by pure rules. The hosted page puts
the visitor's switches and their recently viewed products into config.js. The dashboard reads one summary endpoint.

**Tech Stack:** NestJS + Prisma (Postgres), the storefront kit (commerce-src parts → kit/commerce.js), the hosted checkout app (Vite TS),
the merchant dashboard (plain ES modules, node:test).

**Spec:** docs/superpowers/specs/2026-11-16-tienda-que-vende-sola-and-tareas-design.md (APPROVED 2026-11-16).

## Global Constraints
- Keep rule: add-to-cart per visit ≥ 5% better on B AND orders per visit not lower; decided at 14 days or 300 visits per side, whichever first.
- One live test per store (the experiment table's unique `activeStoreId`); never prices, offers or codes; never removes a section.
- Automatic undo of the newest kept change when the last 7 days' paid orders < 80% of the weekly average of the 4 weeks before.
- «Mejora automática» on by default (owner «yes»), switchable in store settings.
- Visitors stay anonymous: no personal data, no age; recently viewed lives only in the shopper's own browser.
- Hero (main's first block) and the product row (`[data-pagosya-catalog]` block) never move.
- Credit prices on the cards (draft, owner-approved): 500 / 250 / 150 / 30 / 80 / 50 / 100 / «incluida en Pro».
- Dev DB: migrations are applied by me in the main session only (memory: dev DB agent guard); `--incremental false` for any tsc.

## Review Focus
1. A store with no section ids / no catalog block: reordering must leave it untouched, never throw.
2. A selling test running while the merchant starts their own A/B test: the merchant's test wins (the selling test is undone first).
3. A visitor without consent: no events, so the test simply gathers fewer visits — the decision must never divide by zero.
4. A kept «best» product later archived/sold out: the kit ignores an unknown id.
5. Recently viewed list with deleted products or only one product: no row.

---

### Task 1: Section events
**Files:** `packages/storefront-kit/commerce-src/shared/analytics.js`, `apps/api/src/store-analytics/store-analytics.constants.ts`,
`apps/api/src/store-analytics/store-analytics-input.ts`, tests `apps/api/src/storefront-source/source-commerce-selling.spec.ts` (new,
jsdom harness copied from the store-menu spec), `apps/api/src/store-analytics/store-analytics-input.spec.ts`.
**Produces:** event types `section_view`, `section_click` with `target` = `s<index>` (index among `main`'s children).
- [ ] RED: kit spec — a hosted page with an IntersectionObserver stand-in posts `section_view` once for s2 and `section_click` on a click
  inside s2; input spec — `normalizeAnalyticsBatch` keeps `{type:'section_view', target:'s2'}` and drops `target:'x'`.
- [ ] GREEN: observer (≥50% for ≥1 s, once per page), click capture; API allow-list + `^s\d{1,2}$` target check.
- [ ] Commit.

### Task 2: Events carry the visitor's side
**Files:** migration `apps/api/prisma/migrations/20261116120000_selling/` (also used by Task 5), `schema.prisma`
(`StoreAnalyticsEvent.experimentId String?`, `variant String?`), `store-analytics-input.ts` (optional `visitToken` ≤ 64 chars),
`store-analytics.service.ts` (resolve token → visit of the store's running experiment), `apps/checkout/src/store-analytics.ts` +
`source-storefront.ts` (send the remembered visit token with each batch).
- [ ] RED: service spec — a batch with a token of a RUNNING experiment stores `variant:'B'`, a foreign or stale token stores null.
- [ ] GREEN + apply migration (`prisma migrate deploy`), regenerate client. Commit.

### Task 3: Kit selling switches
**Files:** `packages/storefront-kit/commerce-src/selling/selling.js` (new part, registered in `tools/build-commerce.mjs` after the
catalog parts), spec `source-commerce-selling.spec.ts`.
**Produces:** reads `PAGOSYA_CONFIG.selling = { order?: string[] /* s-indexes in new order */, best?: string /* productId */,
buyWord?: 'Agregar'|'Comprar ahora'|'Lo quiero', stickyBuy?: boolean }` and `PAGOSYA_CONFIG.recent?: string[]`.
- [ ] RED (one test each): order moves s3 above s2 but never s0 or the catalog block; unknown/garbled order is ignored; best puts the
  product first in `[data-pagosya-catalog]` with «Más vendido» and a feature card after the hero; unknown best → nothing; buyWord
  relabels `[data-add]` buttons that read «Agregar»; stickyBuy shows `.product-detail__sticky` after the buy button scrolls away;
  recent ≥ 2 known products → «Seguir viendo» row after the hero, < 2 → none.
- [ ] GREEN, rebuild runtime (`node packages/storefront-kit/tools/build-commerce.mjs`, under the 1.25 MB cap). Commit.

### Task 4: The hosted page hands over the switches
**Files:** `apps/checkout/src/source-storefront.ts`, `apps/checkout/src/selling-config.ts` (new, pure) + test.
**Produces:** `sellingConfig(settings, site, recent)` → config fields `selling` (site.selling) and `recent` (≤ 8 ids); product views
recorded to `localStorage['pagosya:recent:<slug>']` (functional, on device only).
- [ ] RED/GREEN on the pure helper; wire it where config.js is rebuilt. Commit.

### Task 5: Kept changes and the selling test in the API
**Files:** schema (`Store.autoImprove Boolean @default(true)`, model `StoreSellingChange { id, storeId, kind, settings Json, status
'TRYING'|'KEPT'|'UNDONE', experimentId?, summary?, evidence Json?, startedAt, endedAt? }`), `apps/api/src/selling/` (module, service,
`selling-rules.ts` pure), `source-publishing.service.ts` (`publicSite` returns `selling`: kept switches merged, plus B's switches for a
B visitor of a `'selling'` experiment; a selling experiment always serves the published revision; starting a merchant test undoes a
running selling test first).
- [ ] RED: rules spec — `mergeKept(changes)`; publishing spec — B visitor gets B's buyWord, A visitor the kept one.
- [ ] GREEN. Commit.

### Task 6: The daily decision
**Files:** `apps/api/src/selling/selling-rules.ts` (`nextChange(signals, history)`, `decide(stats)`, `ordersDropped(weeks)`),
`selling.job.ts` (`@Cron('0 4 * * *', { timeZone: 'America/La_Paz' })`), `selling.service.ts`.
- [ ] RED: decide — 300/300 visits with +6% adds and equal orders → KEEP; +4% → UNDO; 10 days 120/118 → WAIT; 14 days → decide;
  zero visits → WAIT/UNDO, never NaN. nextChange — best only with ≥3 paid orders of one product in 14 days; order only with ≥100
  section views and a lower section's click rate ≥ 1.2× the one above; never a kind undone in the last 60 days; buyWord and stickyBuy
  always eligible. ordersDropped — 7 vs 4-week average.
- [ ] GREEN; summary lines in Spanish («Subimos «Sabores» un lugar», «Lemon · Ginger primero como Más vendido», «Botón «Lo quiero»»,
  «Barra de compra fija») with the measured change. Commit.

### Task 7: Merchant side
**Files:** `selling.controller.ts` (`GET v1/stores/:storeId/selling` → `{autoImprove, trying, kept[], undone[] (last 7 days)}`,
`POST …/selling/:changeId/undo`, `PATCH …/selling {autoImprove}`), dashboard `src/selling-card.mjs` + test (Resumen card «Tu tienda esta
semana» with «Deshacer»), `src/store-settings.mjs` («Mejora automática» switch).
- [ ] RED/GREEN on the controller service and the card renderer. Commit.

### Task 8: «Tareas de YAPI»
**Files:** dashboard `src/tareas.mjs` (catalogue + renderer) + `tareas.test.mjs`, `nav-sections.mjs` (Tienda › «Tareas»), `index.html`
view, `dashboard.js` (mount; «Empezar»: Diseño de portada → POST `v2-prototype`, Revisar y mejorar → POST `v2-prototype/look`, the rest
→ `composeInYapi(text)` with the card's request; running: «YAPI trabaja · N min» from the v2 status), drawn SVG pictures per card.
- [ ] RED/GREEN on the renderer (8 cards, minutes, credits, running state). Commit.

### Task 9: Live check (LAST, owner order)
- [ ] Rebuild DooBoo and Meat House (heroes/menus/headers), Oh Belly/DooBoo header check, menu-open look shots in the log.
- [ ] Selling: on one published store, force a selling test, open as A and B visitors, check switches, call the daily job, check the card.
