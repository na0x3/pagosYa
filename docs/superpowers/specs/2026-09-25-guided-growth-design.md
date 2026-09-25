# Guided growth (G2) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md` (§2 row G2,
row UX). Data: G1 `docs/superpowers/specs/2026-09-25-analytics-capture-design.md` (§2.9 read API). Owner request: "i want
user to have more control to its analytics, like clicks on site, clicks on checkout, many more insights, on actions he
could take to take his store to another level, and etc, i want everything guided and easy for the user, i want the user
experience to be bomb". The owner asked not to be asked questions: every choice below is a ruling the owner may overturn.

## 1. What exists (from the code, 2026-09-25)

- **G1 read API** `GET v1/stores/:storeId/analytics` (`store-analytics.service.ts` `report`): totals and dense daily
  series per event type, top 10 products (views, adds, addRate), CTAs, devices (page views only), referrer hosts
  (plain text), checkout steps with `reachable`/`dropOff` by the store's checkout mode. Rollups only, ≤ 15 min stale.
- **Growth v1** `GET v1/stores/:storeId/growth/insights` (`store-growth.service.ts:87`): a 30-day funnel from
  `StoreFunnelVisit`, paid orders net of refunds (`summarizeGrowth`), and five string suggestions. No screen uses it;
  `test/source-publishing.e2e-spec.ts` reads its `funnel`.
- **Store Brain** (`store-knowledge/store-knowledge.ts`): gaps (no photo, one photo each, no description, sold out, no
  contact, missing policies, test-mode payments) and `performance30d`. Its chat may offer changes, never apply them.
- **Dashboard ↔ Studio**: the dashboard already queues a `pagosya:studio-action` `{ action: 'compose', text }` for the
  embedded Studio (`dashboard.js` `pendingStudioAction`/`deliverStudioAction`, delivered after `pagosya:studio-ready`);
  the Studio appends the text to its composer and focuses it without sending (`source-studio.ts:137`). The product
  editor is the Studio product guide (`pagosya:product-guide-edit` with the product row), an 8-step form.

## 2. Decisions

1. **One endpoint for the view.** `GET v1/stores/:storeId/growth/overview?days=7|30|90` (default 30, merchant auth,
   foreign store → 404) answers everything "Crecimiento" draws. Growth v1 stays as it is.
2. **Periods are Bolivia days** (G1 rule): `to` = today, `from` = `to − (days − 1)`; the previous period is the same
   length just before. Orders are bucketed by the same UTC−4 day bounds.
3. **KPIs, by checkout mode.** Visits (`page_view` sessions), product views, add-to-cart, checkouts started (`review`
   step sessions), the outcome and conversion, each with the previous period and a delta in percent (`null` when the
   previous value is 0: the UI says "nuevo"). The outcome is: `payment` → paid live orders (PaymentIntent SUCCEEDED,
   net of refunds, the `summarizeGrowth` rule) with net sales as detail; `whatsapp` → "Pedidos por WhatsApp"
   (`whatsapp_click` sessions); `external` → "Clics en pedir" (`pay_click` sessions). Conversion = outcome / visits in
   percent, one decimal; **`null` when the outcome exceeds measured visits** (visits count only shoppers who accepted
   analytics, paid orders count everyone) — the UI explains it instead of printing 140 %.
4. **Funnel.** Visits → viewed a product → added to cart → started the order → outcome (by mode), each with its share of
   visits and the loss from the step before (never below 0). The checkout section shows G1's `checkoutSteps` as they
   are (unreachable steps hidden, the optional delivery step marked).
5. **G1 report gains `viewSessions` and `addSessions` per product and a `productLimit` option** (default 10, so the
   public answer is unchanged in size); growth asks for every product. Additive only.
6. **Device conversion reads raw events** (rollups keep the device for page views only): one grouped
   `COUNT(DISTINCT sessionHash)` per device for `page_view` and `add_to_cart` over the period (≤ 90 days, one store,
   `(storeId, createdAt)` index). Only counts leave the query.
7. **Insights engine v2 is a pure function** (`store-growth/growth-insights.ts`), deterministic, no AI. Each insight:
   `{ id, rule, severity: high|medium|low, title, evidence, why: string[], impact: string|null, action: { kind, label,
   payload } }`. `id` is stable (`rule` or `rule:<productId|step|target|host>`) so dismissals stick to the thing.
   Rules and thresholds:

   | rule | fires when | severity | action |
   |---|---|---|---|
   | `unpublished` | no published design | high | settings → workspace (publish) |
   | `paused` | published but paused, or hidden from the public | high | settings → workspace |
   | `test-mode` | checkout `payment` and the merchant is not verified (payments are test only) | high | settings → compliance |
   | `unread-leads` | ≥ 1 NEW lead | high if the oldest waits > 24 h, else medium | inbox |
   | `first-sale` | no live paid order ever (payment mode) | medium | yapi (review the store as a first-time buyer) |
   | `checkout-drop:<step>` | biggest loss among reachable required steps ≥ 50 % with ≥ 10 sessions before it | high ≥ 70 %, else medium | review/pay_click → yapi; whatsapp/contact → settings (checkout); payment → promo |
   | `views-no-adds:<id>` | ≥ 20 view sessions and add rate < 3 % | high ≥ 50 views, else medium | product (step chosen by the diagnosis: sold out → stock, no/one photo → photos, no description → description, price ≥ 1.5× catalog median → price, else photos) |
   | `cta-no-follow:<label>` | label ∈ hero-cta, nav-catalog, promo, contact with ≥ 15 sessions and its follow-through (product view, product view, add to cart, contact sent) < 25 % of them | medium | yapi (contact → settings contact) |
   | `device-gap` | both devices ≥ 30 visit sessions, the weaker add rate < 60 % of the stronger, stronger > 0 | medium | yapi (improve that device) |
   | `referrer-surge:<host>` | a host (not direct) with ≥ 20 sessions and ≥ 2× the previous period | low | promo (a code for that audience) |
   | `never-viewed` | ≥ 50 visit sessions in the period and active products older than the period with no view session | low | yapi (feature them) |
   | `low-stock:<id>` | sold ≥ 1 unit in the period and stock ≤ 5 (0 = sold out, high) — at most 2 | medium/high | stock |
   | `weak-photos` | active products without a photo | medium | product (photos step of the most-viewed one) |
   | `missing-policies` | products exist and the returns or delivery policy is empty | low | settings (policies) |
   | `leads-to-proposal` | ≥ 3 leads in the period | low | proposal (prefilled brief) |

   Evidence always names the numbers and the period ("en los últimos 30 días"). `why` lists the facts and the rule's
   threshold and, when analytics are involved, that only consented visits count and data lag up to 15 minutes.
   **Impact only when it is arithmetic on the store's own numbers, and labelled "Estimación"**: the store's average
   add rate applied to a product's views (only when the store has ≥ 50 view sessions), the stronger device's add rate
   applied to the weaker device's sessions, days of stock at the period's sales pace. Nothing else gets an impact.
8. **Ranking**: blockers (`unpublished`, `paused`, `test-mode`) first, then severity (high, medium, low), then the
   rule's weight (sessions or units affected). The answer carries the top 5 not dismissed or snoozed, the number of
   further active ones (`moreInsights`) and of hidden ones (`hiddenInsights`).
9. **Dismiss and snooze persist per store on the server**: new table `StoreGrowthInsightState` (`storeId`,
   `insightId`, `status` dismissed|snoozed, `until?`), no Prisma relation (the D0/G1 rule), unique
   `(storeId, insightId)`. `PUT v1/stores/:storeId/growth/insights/:insightId` `{ action: dismiss|snooze|restore }`
   (snooze = 7 days); `DELETE v1/stores/:storeId/growth/insights` restores all. A snooze past its date is ignored.
   A new product, step or host is a new id, so it shows again.
10. **Weekly summary**: always the last 7 days vs the 7 before, whatever the selected period, one Spanish paragraph
    from a template (visits, carts, the outcome, net sales, the best seller of the week). Computed from the dense
    series already read, plus orders; no extra rollup read.
11. **Actions are buttons that do the thing, never apply it**:
    - `yapi`: opens "Diseñar sitio" and hands the instruction to the Studio composer through the existing `compose`
      studio-action, now with `origin: 'growth'`; the Studio shows "Sugerencia lista: revísala y envíala cuando
      quieras." The merchant sends it; nothing is generated automatically.
    - `product` / `stock`: opens Productos and the product guide on that product at the right step: the edit message
      gains `step` ∈ description, price, photos, stock (guide steps 2, 3, 5, 7). The merchant saves.
    - `proposal`: opens Propuestas with the composer open and the brief filled (`proposals.compose(brief)` when the
      D2 panel exposes it, else it clicks its "new" button and fills `#proposalBrief`).
    - `promo`: opens Correos y marketing → Promociones with the code field filled; the merchant sets the value and saves.
    - `settings`: opens Ajustes at the named section (identity, checkout, contact, policies, locations), or Diseñar
      sitio (publish), or Cumplimiento.
    - `inbox`: opens Inbox.
12. **View**: "Crecimiento", a top-level nav item right after Resumen. Order: period selector (7/30/90 días) and
    freshness note; weekly summary; "Qué hacer ahora" (up to 5 cards: severity chip, title, evidence, one primary
    button, "¿Por qué?" disclosure with `why` and impact, "Recordar en 7 días" and "Ocultar"; a "Mostrar ocultas (n)"
    link restores); KPI tiles with deltas; funnel; traffic chart (this period vs the previous, dashed); clicks on the
    site (CTAs, plain labels); clicks in the checkout (steps with loss, by mode); top and bottom products; devices;
    referrers (hosts as text only, never links). Mobile first at 390 px (one column, KPI tiles 2-up), two columns at
    ≥ 1024 px.
13. **Accessible charts**: inline SVG with `role="img"`, a `<title>` and a one-sentence summary; every chart has a
    "Ver como tabla" disclosure with the same numbers in a `<table>`. Bars carry their number as text. No chart library.
14. **Empty state** (no analytics in either period): what will appear here, a three-step "get your first visits"
    guide (publish, share the link — copy / WhatsApp —, accept analytics note), and the insights still show (the
    onboarding ones fire on a new store). A WhatsApp store gets WhatsApp wording throughout.

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| G1 report | `store-analytics/store-analytics-report.ts`, `store-analytics.service.ts` | `viewSessions`/`addSessions`, `productLimit`. |
| Engine | `store-growth/growth-insights.ts` | Pure rules, ranking, labels. |
| Overview | `store-growth/growth-overview.ts` | Pure KPIs, funnel, weekly summary, product/device/referrer tables. |
| Service | `store-growth/store-growth.service.ts` | `overview()`, `setInsightState()`, `restoreInsights()` (loader + raw device query). |
| Routes | `store-growth/store-growth.controller.ts` | GET overview, PUT/DELETE insight state. |
| Schema | `prisma/schema.prisma` (appended block), `prisma/migrations/20260925230000_store_growth_insight_state/` | One table. |
| Studio | `merchant-studio/src/source-studio.ts`, `source-product-guide.ts`, `source-create-product.ts` | Compose notice; guide `step`. |
| Dashboard | `merchant-dashboard/src/growth.mjs` (pure), `growth-panel.mjs`, `growth.css`; glue in `index.html`, `dashboard.js`, `server.mjs` | The view and its actions. |

## 4. Tests

- API unit: every rule fires at its threshold and not below; evidence carries numbers and period; impact only where
  defined; ranking and the 5 cap; dismissed/snoozed filtering (expired snooze shows again); KPIs per mode incl. the
  conversion `null` case; weekly summary text (payment, WhatsApp, empty); report `viewSessions`/`productLimit`;
  service ownership 404 before any read; controller validation (`days` only 7/30/90, action enum).
- API integration (real Postgres): the device query over raw events; insight state upsert/restore.
- Studio Playwright: embedded compose with `origin: 'growth'` fills the composer, shows the notice and sends nothing;
  the product guide opens at the stock step.
- Dashboard node unit (`growth.mjs`): formatters, deltas, chart geometry, action routing descriptors.
- Dashboard Playwright (`tests/growth.spec.mjs`, mocked API): rich store at 390 and 1280 (KPIs, funnel, charts with
  tables, referrer markup rendered as text), empty store, WhatsApp store wording; each action kind lands in the right
  view with the right prefill (a stub Studio records the compose); dismiss/snooze/restore call the API; no page errors
  and no horizontal overflow at 390.

## 5. Out of scope

Emailing the weekly summary, AI-written insights, per-hour data, exports, A/B tests (the existing Pruebas A/B view),
notifications, benchmarks against other stores (no defensible data), automatic application of any suggestion.
