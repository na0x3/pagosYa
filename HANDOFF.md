<!-- last-updated-commit: bf017746aacd6fb53f5b10c88830fddc8d5a7c42 -->
# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it should describe *current truth*, not what
happened. For session-by-session narrative/history, see
`docs/SESSION_LOG.md`. For architecture, the regulatory model, and
how to run locally, see `README.md` — don't duplicate that here.

**This file is only updated when the user explicitly asks** — the Stop
hook that used to auto-force this on every turn was disabled by request
(`.claude/settings.json` is `{"hooks": {}}`). Don't re-add that
automation; see the memory note on this if unsure.

Updated: 2026-08-08
Branch: main
HEAD: (see last-updated-commit marker above — updated in a follow-up commit)
Working tree: clean — everything through 2026-08-08 committed and pushed
  to origin/main this session, ending a long uncommitted streak (see §6)
Last verified: 2026-08-08 (110 API + 29 checkout tests, tsc clean, live
  browser QA of this session's changes — see §7)

## 1. Current objective

Two threads in flight: (a) the payment gateway itself — only one rail
(Banco Económico QR) and no payout disbursement adapter are real, and
(b) the merchant storefront product — categories, richer products,
finances, and a full visual redesign, refined further on 2026-08-08.
(b) doesn't move (a) forward; the payment-rail work is still where it
was.

## 2. Next action

Implement a real payout disbursement adapter, replacing
`apps/api/src/payouts/adapters/mock-bank-disbursement.adapter.ts`. Not
started — this session went entirely toward storefront features instead
(see §6).

### Done when
- `mock-bank-disbursement.adapter.ts` is swappable for a real adapter
  the same way `BanecoQrAdapter` swaps in for `MockQrRailAdapter` (one
  class + one provider wire-up, no caller changes)
- Idempotency implemented (a retried disbursement can't double-pay)
- Failed-payout retry policy exists and is bounded (not infinite retry)
- Bank reference persisted on the `Payout` row
- Payout webhook/status reconciliation works (bank confirms async)
- Tests added
- Mock adapter remains usable/selectable in test environments

### Blocked by
- Selecting a bank/payout provider and obtaining real API credentials —
  no provider chosen yet, this is a decision only the user can make

## 3. Current production readiness

**REAL:**
- Banco Económico QR Simple (`BanecoQrAdapter`) — flagged off by default,
  enable via `BANECO_QR_ENABLED=true`

**MOCK:**
- Card payments (`mock-card.adapter.ts`)
- Tigo Money (`mock-tigo-money.adapter.ts`)
- Bank transfer (`mock-bank-transfer.adapter.ts`)
- Payout/disbursement to merchant bank accounts (`mock-bank-disbursement.adapter.ts`)
- SIN/SIAT e-invoicing (`mock-sin-invoicing.adapter.ts` — SIAT's own API
  was unreachable when built, broken TLS chain)

**DO NOT deploy for real-money production.** Even the one real rail
(QR) can't complete end-to-end yet — see §2. Everything in §6 below is
storefront/UX, not payment-rail work — it doesn't change this section.

## 4. Architectural decisions

Don't reverse these without a deliberate reason — they're intentional,
not accidental gaps.

- **Default settlement mode is `AGGREGATOR`**, not `FACILITATOR`.
  pagosYa pools funds, deducts its fee, auto-sweeps the payable balance
  to the merchant's KYC bank account once `ACTIVE`.
- **`FACILITATOR` merchants are deliberately skipped by the payout
  worker** (`payouts.service.ts` `createDuePayouts` filters to
  `AGGREGATOR` only) — the card network/bank is expected to settle
  directly to them; pagosYa never holds their money.
- **LIVE API keys are gated on KYC approval regardless of settlement
  mode** (`issueLiveKeys` checks `MerchantStatus.ACTIVE`) — TEST-mode
  keys are never gated.
- **Checkout branding belongs to the merchant, not pagosYa.** Each
  store shows its own logo/banner/background (color or photo);
  pagosYa's own brand (colorful parrot mark) is only used in
  the merchant dashboard and ops console chrome, never injected into a
  storefront.
- **Stores/products persist in Postgres.** Merchant dashboard's login
  token is `sessionStorage`. A buyer's cart is `localStorage` per store.
- **Rail selection is a single pluggable registry** (`RailRegistry` +
  one adapter class per rail, wired in `rails.module.ts`).
- **Store background image takes priority over background color** when
  both are set — the color is only a fallback shown while the image
  loads, not a layered/combined effect.
- **Categories are optional and additive.** A store with zero categories
  renders exactly as before (flat product list, no section headers) —
  category UI only appears once at least one category actually exists.
- **"Most sold product" only counts cart-checkout purchases.** It reads
  `PaymentIntent.metadata.cart`, which only exists for storefront/cart
  checkouts (`StoresService.createCartCheckout`) — a merchant's own
  API-created `PaymentIntent` has no cart metadata and correctly can't
  be attributed to a specific catalog product.
- **Store view counting is a plain counter, not analytics.** Incremented
  once per `getStorePublic` call, not deduplicated per visitor. Good
  enough for "is anyone looking at this store," not a substitute for
  real analytics.
- **Stock is enforced twice.** A soft check at cart-checkout (nice error
  message), and a hard atomic `stock: { gte: quantity }` guard on
  decrement at payment success — the second one is what actually
  prevents overselling under a race; the first is just UX.

## 5. Current system state

- **API**: running locally, `apps/api` (`pnpm run start:dev`), port 3000
- **Checkout**: running locally, `apps/checkout` (`pnpm run dev`), port 5173
- **Dashboard**: stopped (was run repeatedly this session for QA, not
  left up — `apps/merchant-dashboard`, `node server.mjs`, port 4323)
- **Ops**: stopped (`apps/ops`, port 4322, tested once for the delivery-failures panel)
- **Database**: embedded Postgres, port 54329, running; 19 migrations, all applied cleanly
- **Payment rails**: see §3
- **Payouts**: worker code complete and running, disbursement itself is mocked (see §3)

## 6. Changes made this session

Full narrative for every item below is in `docs/SESSION_LOG.md`, under
2026-08-07 (the original storefront/finances build-out) and 2026-08-08
(this session: sizing refinements, real bug fixes, first commit).

### CI: migration-safety job
`.github/workflows/ci.yml` — new job applies the PR base branch's
migrations + seed data, then the PR's new migrations on top, catching
exactly the class of bug a real earlier migration had (NOT NULL column,
no backfill, only breaks with pre-existing data). Verified with a
throwaway bad migration that it actually fails the same way.

### Frontend tests for apps/checkout (new)
Vitest + jsdom added from scratch — 20 tests now covering the storefront
(categories, tags, stock, sold-out state, gallery), payment form
(merchant identity, tab switching, XSS escaping), and payment outcomes.

### Background-worker failures surfaced
`payouts`/`invoicing`/`webhooks` workers now log `warn` (retrying) vs.
`error` (exhausted, giving up) instead of one flat `warn` — and one
silent path (provider-returned failure) now logs at all. New
`GET /internal/delivery_failures` + ops console panel showing exhausted
vs. retrying deliveries.

### Store catalog v2 (schema + API + dashboard + storefront)
New `Category` model, `Store.tagline`/`bannerUrl`,
`PaymentLink.imageUrls` (array, replaced `imageUrl` with a properly
backfilled migration)/`tags`/`stock`. New `apps/api/src/categories/`
module. Dashboard: category management, richer product form (gallery
upload, tags, stock, category select). Storefront: products grouped
into category sections, image galleries with thumbnails, tag badges,
stock display + cart cap, sold-out state.

### Finanzas dashboard menu (new)
New `apps/api/src/finances/` module: total revenue, inventory value,
store views (`Store.viewCount`, new), top-selling products. Merchant-
wide, not per-store.

### Storefront visual redesign
Big circular logo overlapping the banner, gradient title/buttons/tag
colors, card hover lift + image zoom, staggered entrance animation
(first paint only), gallery crossfade — all native CSS, no animation
library (see §4-adjacent note in `docs/SESSION_LOG.md` for why not
literally Framer Motion). Caught and fixed two bugs introduced earlier
in the same session while doing this (merchant background-color
override had silently stopped working; store title briefly rendered
uppercase) — both live-verified fixed.

### Store background image (new)
`Store.backgroundImageUrl`, independent of `backgroundColor`. Full-page,
with a dark scrim so text stays readable against any photo. Dashboard
upload field added.

### 2026-08-08: storefront sizing/legibility fixes + clear-field bug
Full detail in `docs/SESSION_LOG.md`. Summary:
- `body.store-page #app` reverted `1400px → 640px` (2026-08-07's redesign
  had made the storefront too wide/sparse per live feedback); logo then
  re-enlarged and moved top-left overlapping the banner per follow-up
  feedback.
- Fixed an unstyled inline SVG (`.store-about-icon`) rendering as a giant
  book graphic in the "Nuestra historia" section.
- Added Instagram/WhatsApp logo icons to store link buttons, matched by
  URL domain (`store.links` has no platform field).
- `.merchant-header`/`.store-about` cards made transparent (were opaque/
  frosted panels) with larger type; legibility over a background photo
  now comes from light text + drop-shadow instead of a glass panel.
- **Fixed the "can't clear an optional field" bug** noted below in §9 as
  known-minor — store fields (tagline, logo/banner/background-image
  URLs, contact phone/email, about text, announcement) and product
  fields (description, stock, category, color) can now be cleared back
  to empty, not just overwritten. DTOs widened to accept explicit `null`
  (mirroring the pre-existing `accentColor` pattern); dashboard sends
  `null` for emptied fields and gained "Quitar" buttons for the three
  image fields, which previously had no clear affordance at all.
- Near-miss: an automated dashboard click meant to select a store row
  landed on "Eliminar" instead, likely triggering the confirm()-dialog-
  hangs-automation issue (see §10). Caught immediately, user asked to
  dismiss manually, store confirmed intact afterward — no data lost.

## 7. Tests / verification

- `pnpm exec jest` (apps/api): **110/110 passing**
- `pnpm test` (apps/checkout, Vitest): **29/29 passing**
- `tsc --noEmit` (api + checkout): clean
- Migrations: all applied cleanly against the live local DB
- Extensive browser QA (Claude-in-Chrome) across 2026-08-07:
  storefront categories/gallery/tags/stock/sold-out, dashboard category
  + product CRUD, Finanzas numbers against real seeded activity, ops
  delivery-failures panel with seeded test failures, background image +
  scrim + glass header, hover/animation states. All test/demo data
  created for these checks was cleaned up afterward via API calls.
  2026-08-08's changes were verified live in-browser (storefront sizing/
  icons/transparency) except the dashboard clear-field fix, which was
  verified by code review + passing tests only, not live-clicked, after
  the Eliminar near-miss above cut the dashboard browser session short.

## 8. Known bugs

- None currently known. (Two were introduced and self-caught/fixed
  within this same session — see §6's "Storefront visual redesign" —
  not carried forward as open issues.)

## 9. Missing / mocked functionality

**Priority 1** (blocks real money end-to-end):
- Real payout/disbursement bank adapter — see §2
- Settlement-mode has no dashboard/signup toggle (API-only DTO field;
  user chose "flip the default" over building this in an earlier session)

**Priority 2**:
- Real card rail
- Real Tigo Money rail
- Real bank-transfer rail
- SIN/SIAT e-invoicing integration
- Per-merchant/per-store payment-method opt-out (every checkout always
  shows all four rails; QR's only toggle is the global
  `BANECO_QR_ENABLED` env flag, not per-merchant)

**Security follow-up (not a code task, from an earlier session):**
- A demo merchant's TEST-mode secret key was committed to git history in
  earlier versions of `HANDOFF.md` (removed from the file, already on
  GitHub via prior pushes). TEST-mode keys can't reach LIVE money. Low
  priority, but purging git history is the real fix if it matters.

## 10. Database / migration warnings

- **4 new migrations this session**, all straightforward additive/
  backfilled — no data-loss risk like the one below:
  `20260807142552_settlement_mode_default_aggregator`,
  `20260807160924_store_catalog_v2`, `20260807164022_store_view_count`,
  `20260807173744_store_background_image`.
- **`20260807024643_multi_store` was rewritten in place in an earlier
  session** (not a fix-forward migration) because it never successfully
  applied anywhere with real data. Any other checkout with pre-existing
  `PaymentLink` rows and a half-applied copy of this migration needs
  `prisma migrate resolve --rolled-back 20260807024643_multi_store`
  before `migrate deploy` will succeed — a plain `git pull` isn't enough.
- Two unrelated leftover test stores ("Tienda QA Test") remain in the
  live local DB from a much earlier session's manual QA — harmless,
  delete via the dashboard when a human's at the keyboard. **Do not
  delete via Claude-in-Chrome automation** — the delete confirm dialog
  hangs it (confirmed twice now, most recently 2026-08-08 when a
  misclicked automated action nearly deleted a real store; see §6).

## 11. Local development

- `pnpm run dev:db` — starts embedded Postgres (port 54329)
- `pnpm --filter @pagosya/shared-types run build` — required before
  `apps/api` watch mode picks up shared types
- `apps/api`: `pnpm run start:dev` (port 3000)
- `apps/checkout`: `pnpm run dev` (port 5173), now also `pnpm test` (Vitest)
- `apps/merchant-dashboard` / `apps/ops`: `node server.mjs` (ports 4323 / 4322)
- If the dev DB gets reset, re-run `pnpm run seed` after
- Demo credentials, merchant API keys, store links: see `seed.ts` and
  `.env` — **not reproduced here.**

## 12. Files worth reading next

- `apps/api/src/payouts/adapters/mock-bank-disbursement.adapter.ts` — what §2's task replaces
- `apps/api/src/payouts/payout-delivery.worker.ts` — how disbursement is triggered/retried today
- `apps/checkout/src/main.ts` (`renderStore`/`renderProductCard`) — this session's storefront work, if extending it further
- `apps/api/src/finances/finances.service.ts` — the Finanzas aggregation logic, if adding more metrics
- `.github/workflows/ci.yml` — the new migration-safety job, if it needs tuning
