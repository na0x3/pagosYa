# Analytics capture (G1) — design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-business-documents-and-guided-growth-design.md`
(§1 "Analytics", §2 row G1, §3 decision 5). Owner request: "i want user to have more control to its analytics,
like clicks on site, clicks on checkout, many more insights, on actions he could take to take his store to another
level, and etc, i want everything guided and easy". The owner asked not to be asked questions: every choice below
is a ruling the owner may overturn. G1 only captures and serves the data; G2 draws the "Crecimiento" view.

## 1. What exists (from the code, 2026-09-25)

- **Funnel.** `POST v1/stores/public/:slug/funnel` (`store-growth/store-funnel.controller.ts`) takes one event
  (`visit`, `product_view`, `add_to_cart`, `checkout_started`, `delivery_selected`) with a client session UUID.
  The service stores `sha256(sessionId)` and one `StoreFunnelVisit` row per session with first-occurrence
  timestamps. Only `ACTIVE`, published (`publishedSourceRevision` set) and not paused stores are accepted; a
  session older than 24 h is refused.
- **Funnel client.** `apps/checkout/src/store-funnel.ts`: session id in `sessionStorage` (`pagosya:funnel:<slug>`,
  30 min), each event once per session, `credentials: 'omit'`, 2.5 s timeout, nothing in a preview or without
  consent (`privacy.analyticsAllowed(slug)`; GPC forces false).
- **Kit.** `packages/storefront-kit/kit/commerce.js` `track()` posts `pagosya:funnel` to the host page only when
  `PAGOSYA_HOSTED`, and feeds the merchant's pixels. A published store runs in a sandboxed `srcdoc` iframe
  (`allow-scripts allow-forms`, opaque origin, no storage), so the kit cannot see consent or keep a session: the
  host page (`apps/checkout/src/source-storefront.ts`) does both and forwards funnel messages.
- **Nothing else.** No click tracking, no per-product views, no rollups, no retention. `Store.viewCount` is raw.
  `GET v1/stores/:storeId/growth/insights` has a 30-day funnel no screen uses.

## 2. Decisions

1. **One raw event table, one daily rollup table, own module.** `StoreAnalyticsEvent` and `StoreAnalyticsDaily`
   live in a new `apps/api/src/store-analytics` module. Neither declares a Prisma relation (plain indexed
   `storeId`, the D0 rule), so the migration only creates tables and `schema.prisma` gets one appended block;
   no existing model changes. The funnel stays exactly as it is: G1 adds events beside it.
2. **Events (allow-list).**

   | type | extra field | fired when |
   |---|---|---|
   | `page_view` | `path`; `referrerHost` on the session's first one | a store page loads |
   | `cta_click` | `target` = label (required) | a click on an element with an allow-listed `data-track` |
   | `product_card_impression` | `productId` | half a catalog card is on screen; once per product per session |
   | `product_card_click` | `productId` | a click that opens a product from its card (not the add button) |
   | `product_view` | `productId` | a product page or dialog opens (once per product per page) |
   | `add_to_cart` | `productId` | a product is added (a bundle: one event per product) |
   | `cart_open` | — | the cart drawer opens |
   | `checkout_step` | `step` ∈ `review`, `delivery`, `contact`, `payment` | the review shows; a delivery method is chosen; pagosYa's secure form opens; the payment form opens |
   | `pay_click` | — | the review's final action is pressed |
   | `whatsapp_click` | — | a `wa.me` / WhatsApp link or the WhatsApp checkout is used |
   | `contact_submit` | — | the contact form is sent successfully |
   | `search` | — | a search box is committed (never the words) |

   CTA labels (the only accepted `data-track` values): `hero-cta`, `nav-cart`, `nav-catalog`, `card`, `add`,
   `checkout`, `pay`, `whatsapp`, `contact`, `promo`, `social`, `newsletter`. The same three lists exist in the
   API, the kit and the host page; tests pin them equal.
3. **What a row holds.** `storeId`, `sessionHash` (the funnel's `sha256(sessionId)`, so G2 can join events to
   funnel visits), `type`, `productId?`, `target?` (CTA label or checkout step), `path?` (the store page file,
   e.g. `product.html`), `device` (`mobile` | `desktop`, from the User-Agent on the server; the User-Agent itself
   is never stored), `referrerHost?` (host name only, lower case, no `www.`, never a path or query), `createdAt`
   (server time; the client's clock is not trusted). No IP, no user agent, no customer field, no search words.
4. **Ingestion.** `POST v1/stores/public/:slug/events` `{ sessionId, events: [...] , referrer? }`:
   - The same store eligibility as the funnel (404 otherwise). Throttled 30 requests/min per client; up to 20
     events per request.
   - The envelope is strict (a v4 UUID `sessionId`, an array of 1–20 objects, else 400). Each event is checked on
     its own: an unknown type, a missing or unknown label/step, a malformed field, or a `productId` that is not a
     product of this store drops that event only; unknown fields are dropped. This keeps a batch from an
     older kit useful. The answer is `202 { accepted: n }`.
   - A request carrying `Sec-GPC: 1` records nothing (`accepted: 0`), matching the client rule.
   - Consent is enforced where it lives, in the browser: the host page sends nothing without it, like the funnel.
5. **Client: the kit emits, the host decides and sends.** The kit (hosted only) queues events and hands them to
   the host with one `postMessage({ type: 'pagosya:analytics', events })` at most every 400 ms and on `pagehide`
   / `visibilitychange` → hidden. Clicks are observed by one window-level capture listener (it runs before the
   kit's own cart-trigger listener, which stops propagation). Card impressions use one `IntersectionObserver`
   (threshold 0.5) over catalog cards, each card once per page. The host (`apps/checkout/src/store-analytics.ts`)
   validates each event against the same allow-lists, drops everything in a preview or without consent, reuses
   the funnel's session id, keeps impressions to once per product per session and the referrer to the session's
   first page view, and sends batches of up to 20 every 5 s, at 20 queued, and on `pagehide` / hidden
   (`keepalive: true`, `credentials: 'omit'`, 2.5 s timeout). A failed batch is dropped, never retried (no double
   counting; analytics never interrupts buying). Withdrawing consent empties the queue and `clearTracking`
   removes the analytics session key.
6. **Legacy storefront.** When a published store falls back to the checkout app's own catalog (a product that
   needs the options form), it emits `page_view`, `product_view`, `add_to_cart`, `checkout_step` (review,
   delivery, payment), `pay_click`, `whatsapp_click` and `search` through the same host module. Card impressions
   and clicks stay kit-only.
7. **Rollup.** A worker every 15 minutes recomputes the Bolivia calendar days (UTC−4, no DST) from yesterday to
   today (the first run after a start: the last 7 days) from the raw rows in one transaction under a Postgres
   advisory lock: delete those days' rollups, insert fresh ones. Re-running gives the same rows. A rollup row is
   `(storeId, day, type, productId, target) → count, uniqueSessions`, with `''` for "none" so the unique key
   works. Two derived kinds come from `page_view`: `_device` (target `mobile`/`desktop`) and `_referrer` (target
   = host, or `direct`). Rollups hold no session hash or other personal data and are kept.
8. **Retention.** The same worker deletes raw events older than 13 calendar months, 5 000 rows at a time, at most
   once every 6 hours per instance.
9. **Read API for G2.** `GET v1/stores/:storeId/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day`
   (merchant auth, the store must belong to the merchant, else 404; default the last 30 days; `from ≤ to`, at most
   400 days; `granularity` only `day`). It reads rollups only (data lags at most 15 minutes) and returns:
   - `totals`: per event type `{ count, sessions }`;
   - `series`: per event type, one `{ day, count, sessions }` per day in the range (zeros included);
   - `topProducts` (10, by views): `{ productId, name, impressions, cardClicks, views, adds, addRate }` with
     `addRate = adds sessions / views sessions` (0–100, one decimal; `null` without views); a deleted product is
     named "Producto eliminado";
   - `topCtas`: `{ target, clicks, sessions }`;
   - `devices`: `{ device, pageViews, sessions }`; `referrers` (10): `{ host, pageViews, sessions }`;
   - `checkoutSteps`: `cart_open`, `review`, `delivery` (optional), `pay_click`, `contact`, `payment`, each
     `{ step, sessions, dropOff }`, where `dropOff` is the percentage lost from the previous required step
     (`null` when that step had none). `delivery` is optional because digital-only and pickup-less stores skip it.
   "sessions" over a range is the sum of each day's unique sessions (a session crossing midnight counts twice).
10. **Generation prompt.** One line in `SOURCE_SHOPPING_FLOW`: mark primary calls to action with `data-track`,
    using only the allow-listed labels. Untagged elements still produce every kit event; the labels only name
    authored CTAs.

## 3. Units

| Unit | File | Responsibility |
|---|---|---|
| Schema | `apps/api/prisma/schema.prisma` (appended block), `prisma/migrations/20260925200000_store_analytics/` | Two tables + indexes. |
| Constants | `store-analytics/store-analytics.constants.ts` | Types, labels, steps. |
| Input | `store-analytics/store-analytics-input.ts` | `normalizeAnalyticsBatch`, `deviceClass`, `referrerHost`. |
| Service | `store-analytics/store-analytics.service.ts` | ingest, rollup, prune, report. |
| Report | `store-analytics/store-analytics-report.ts` | Pure assembly of the read API answer from rollup rows. |
| Routes | `store-analytics/store-analytics.controller.ts` | Public POST, owner GET. |
| Worker | `store-analytics/store-analytics.worker.ts` | `@Interval` 15 min: rollup + prune. |
| Module | `store-analytics/store-analytics.module.ts`, `app.module.ts` (one line) | Wiring. |
| Kit | `packages/storefront-kit/kit/commerce.js`, `privacy.js` (one key) | Emit, batch, flush. |
| Host | `apps/checkout/src/store-analytics.ts`, `store-funnel.ts` (expose the session), `source-storefront.ts`, `main.ts`, `state.ts`, legacy `product-page.ts`, `cart.ts`, `cart-review-dialog.ts`, `store-page.ts` | Consent, session, dedupe, send. |
| Prompt | `apps/api/src/storefront-source/source-shopping-flow.ts` | One line. |

## 4. Tests

- API unit: batch normalisation (drops unknown fields, types, labels, steps, bad ids; envelope 400; 20-event
  cap; device and referrer derivation); ingest (eligibility 404, GPC, product ownership, session hash equals the
  funnel's, `createMany`); report assembly (dense series, top products and rates, CTAs, devices, referrers,
  drop-off with the optional step); controller date validation.
- API integration (real Postgres, the existing harness): rollup of two Bolivia days incl. the UTC−4 boundary,
  idempotent re-run, derived `_device` / `_referrer` rows, prune at 13 months, the read API end to end.
- Kit (jsdom in `storefront-source`): hosted emits the right events at the right moments with the right fields,
  once where promised, flushed on pagehide; not hosted emits nothing; the label list equals the API's; the
  browser-floor guard stays green.
- Checkout (vitest): no consent / preview → nothing; batching, 20-cap, impression dedupe per session, referrer
  once, flush on pagehide with keepalive; `source-storefront` forwards frame events and adds contact/payment steps.
- A Chromium probe of a hosted fixture store: with consent the journey produces the expected types; without,
  none.

## 5. Out of scope

The G2 screens and suggestions, search words, scroll depth, heatmaps, A/B tests, per-hour granularity, exports,
server-side consent records, and a relation from the new tables to `Store` (a deleted store's rows age out of the
raw table; its rollups stay orphaned until a later cleanup).
