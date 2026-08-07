<!-- last-updated-commit: 418dffe -->
# HANDOFF

Session handoff notes for pagosYa. Updated at the end of each Claude Code
session (see `.claude/settings.json` Stop hook) so a new session can read
this instead of re-deriving project state from scratch. Keep it short.

## Local dev environment (as of 2026-08-06)

- No standalone `pnpm` binary in PATH; only a corepack shim. `corepack` fails
  fetching the pinned `pnpm@11.20.0` (`Cannot find matching keyid` — a
  signature-verification error, likely this sandbox's network/registry
  access, not a project bug). Workaround: a cached corepack pnpm build
  (9.15.9) is invoked directly — `~/.local/bin/pnpm` wraps
  `node /home/batman/.cache/node/corepack/v1/corepack-*/dist/pnpm.cjs "$@"`.
  Add `~/.local/bin` to PATH to use `pnpm` normally. `pnpm install` needs
  `--no-frozen-lockfile` under 9.x (the `overrides`/`allowBuilds` fields in
  `pnpm-workspace.yaml` are pnpm-10+ syntax) — **do not commit the
  regenerated `pnpm-lock.yaml`** from a 9.x install, it's pure resolution-
  metadata noise vs. the pinned 11.20.0; `git checkout -- pnpm-lock.yaml`
  after installing.
- `apps/api/.env` and `apps/checkout/.env` don't exist in a fresh checkout —
  copy `.env.example` into both (gitignored, `.env` pattern matches any
  depth).
- `apps/api` in watch mode needs `packages/shared-types` built first
  (`pnpm --filter @pagosya/shared-types run build`) or it fails with
  `Cannot find module '@pagosya/shared-types'` — nothing rebuilds it
  automatically.
- Local Postgres (`pnpm dev:db`), the API (`start:dev`), and
  `apps/checkout` (`run dev`) were left running in the background this
  session (ports 54329 / 3000 / 5173) plus `apps/merchant-dashboard` on
  4323 — check for stray processes on those ports before starting fresh
  ones.

## Project state (as of 2026-08-06)

pagosYa is a Bolivian payment gateway monorepo (pnpm workspaces): NestJS API
(`apps/api`), checkout iframe, embeddable widget-js, node SDK, an internal
ops console for KYC review, and a merchant dashboard. Payment rails (cards,
Tigo Money, bank transfer, QR) are mock adapters behind a common
`PaymentRailAdapter` interface — no real bank/acquirer credentials yet.

Working tree is clean, `main` is up to date with `origin/main`, CI
(GitHub Actions build+test) is configured.

Full architecture/regulatory model/how-to-run-locally: see `README.md`
(kept up to date, don't duplicate it here).

## Recent work (this session — committed and pushed to origin/main)

Five things, building on each other, all driven by the same "let's make a
demo store and see if it actually works" thread:

**1. Product `color` field.** Didn't exist before — every product was
single-price/single-photo with no variant/option concept.
`PaymentLink.color` (`String?`, `#RRGGBB`, same pattern as the old
`backgroundColor`), wired through the create/update DTO, service, storefront
(swatch dot next to the name), and the merchant-dashboard product form/table.

**2. Storefront layout: grid → big vertical feed.** User wanted photos
"bigger, more prominent, one on top of another, not side to side" — like a
real store, not a compact list. `apps/checkout/src/style.css`
`.store-items` went from a multi-column grid to a single-column stack, each
card full-width with a 4:3 photo, bigger name/description/price text,
`max-width: 640px` centered page (`body.store-page`, toggled in
`main.ts` between the store view and the payment-form view — the classic
iframe-embedded single-payment flow is untouched).

**3. Multi-store (the big one).** User asked: "what if an owner wants
multiple stores under his name, separate links by store — let him create a
store, then create links/products inside it." This was a real data-model
change, not just UI:
- New `Store` model (`merchantId`, `slug`, `name`, `logoUrl`,
  `backgroundColor`, `status`) — **branding moved off `Merchant` onto
  `Store`**, since each store now has its own look. `PaymentLink` now has
  `storeId` instead of `merchantId`, and **lost its own `slug`** — the store
  owns the one public slug now; a store's products no longer have individual
  share links, only the store does. Migration `20260807024643_multi_store`.
  This was schema-breaking enough (dropping a unique column with existing
  rows) that the dev DB got fully reset (`prisma migrate reset`) rather than
  hand-written around — fine, no real data existed, but `pnpm run seed` had
  to be re-run afterward (ops reviewer + the two `demo-*@pagosya.bo`
  merchants from seed.ts).
- New `apps/api/src/stores/` module: `StoresController`
  (`/v1/stores` — dashboard-authed create/list/update/archive),
  `StoresPublicController` (`/v1/stores/public/:slug/store` +
  `.../cart-checkout`, no auth). `PaymentLinksController` is now nested
  under `/v1/stores/:storeId/payment_links` and every method verifies the
  store belongs to the calling merchant before touching it.
  `payment-links-public.controller.ts` is gone (superseded by
  `StoresPublicController`). `MerchantsController`/`Service` lost the
  `branding` endpoints entirely (moved to `StoresController`'s
  create/update).
- `apps/checkout`: `fetchStore`/`checkoutCart` now hit `/v1/stores/public/...`;
  `Store.merchantId`/`merchantName` renamed to `storeId`/`storeName`
  throughout (incl. the cart's localStorage key, now per-store not
  per-merchant, so two stores under one merchant don't share a cart).
- `apps/merchant-dashboard`: new "Tus Tiendas" section (create a store,
  click a store row to select it) — the Productos and
  "Datos y apariencia" sections are now scoped to whichever store is
  selected (persisted in `sessionStorage`), instead of being implicitly
  merchant-wide. Per-product Link column is gone from the products table —
  there's one link per *store* now, shown once above the product form with
  its own copy button.
- `scripts/demo-store.mjs` rewritten: one merchant, **two** stores ("Ropa
  Urbana" — 5 clothing products, and "Café Aroma" — 3 coffee products), each
  with its own branding/logo, to actually demonstrate store separation.
  Verified via curl that a product from one store's cart-checkout against
  the *other* store's slug is correctly rejected
  (`400 "productos del carrito ya no están disponibles"`).

**4. Storefront store name: centered + bigger.** Scoped to
`body.store-page .merchant-header` only (24px, centered, logo stacks above
it) — the classic single-payment iframe view's header is untouched.

**5. Hard delete for products and stores.** Archive-only wasn't enough —
user wanted actual removal. `DELETE /v1/stores/:storeId/payment_links/:id`
and `DELETE /v1/stores/:id` (the latter cascades to delete every product in
the store — `onDelete: Cascade` on `PaymentLink.storeId` added in migration
`20260807030925_store_cascade_delete`). Past `PaymentIntent`s are
unaffected either way — they snapshot cart lines as JSON metadata at
checkout time, not a live FK, so deleting a product/store never touches
payment history. Dashboard has "Eliminar" buttons (with a `confirm()`
dialog) next to "Archivar" on products, and on each store row.

**Verification done this session:** `tsc --noEmit` clean on both `apps/api`
and `apps/checkout`; watch-mode API boots with all new routes mapped; ran
the full seed + demo script against a live local Postgres and confirmed via
curl (store creation, per-store product isolation, cart-checkout, PNG
upload round-tripping exact pixel colors, hard-delete + cascade). **Claude
in Chrome never connected this session** (tried repeatedly — extension
never showed up as available) so I never visually drove the browser myself.
However the user WAS testing manually in their own real browser throughout
— that's how the "dashboard asks for a password" / "can't upload pictures"
/ "images too small" feedback happened. Evidence of real manual use: a
store called "theStore" exists (user-created, not from any script) and
"Ropa Urbana"'s logo is a real `.jpg` upload (the demo script only ever
generates synthetic `.png`s) — see current live state below. So the core
flows are human-verified even though I never took a screenshot myself.

## Recent work (last 5 commits before this session)

- Merchant store branding (logo upload) + editable Payment Links
- Payment Links turned into a shared store + cart (one payment per checkout)
- Product photos on Payment Links; merchant dashboard translated to Spanish
- Payment Links feature added (no-code checkout for merchants without a dev/site)
- Fixed Banco Económico `generateQR` amount units bug (centavos vs decimal)

Before that: Banco Económico QR Simple adapter (flagged, `BANECO_QR_ENABLED`),
ops console / merchant dashboard / checkout redesigns, lightweight
observability (exception logging + `/health`), rate limiting on auth
endpoints, password reset, and a couple of real auth-security fixes
(email-enumeration oracle on signup, session tokens that could mint live
secret keys).

## Known problems / open gaps

- **SIN/SIAT e-invoicing is a mock.** No real CUF/CUFD algorithm or XML —
  the real spec was unreachable when this was built (broken TLS cert chain
  on siatinfo.impuestos.gob.bo). Needs the real spec before a production
  adapter can be written.
- **All payment rails are mocks** (cards, Tigo Money, bank transfer, QR)
  except Banco Económico QR Simple, which is real but flagged off by
  default (`BANECO_QR_ENABLED`). No other real bank/acquirer/Tigo Money
  credentials integrated yet.
- No other known open bugs at last check — see `git log` / open PRs for
  anything more recent than this file's `last-updated-commit`.

## Current live local state (as of 2026-08-07, if the processes below are still running)

Postgres / API / checkout / merchant-dashboard were left running in the
background all session (see "Local dev environment" above) — check
`ps aux | grep -E "nest start|vite|node server.mjs|postgres -D"` before
starting new copies. If they're still up, this data is live right now:

- Dashboard: `http://localhost:4323` — login `demo@pagosya.bo` /
  `demopassword123` (recreated once already after a DB reset wiped the
  first one — if login fails again, re-run `POST /v1/dashboard/signup` with
  the merchant's secret key below, then grab the verify link from the API's
  stdout log and hit it).
- Merchant: "pagosYa Demo Merchant", secret key
  `sk_test_xOguOoTUgaAl2ipGcNbR96t5ZykZck10`.
- Stores under it right now: **"Ropa Urbana"**
  (`http://localhost:5173/?link=3xfvwail`, 5 products, real user-uploaded
  `.jpg` logo) and **"theStore"** (`http://localhost:5173/?link=5d6goo2l`,
  empty, user-created via the dashboard while testing). "Café Aroma" (the
  coffee-shop demo store) **no longer exists** — deleted during this
  session's own hard-delete testing, so don't reference its old slug
  (`bpax4lq5`) as if it still works.
- `pnpm run seed` was re-run after the multi-store migration reset — the
  ops reviewer (`ana@pagosya.bo`) and the two unrelated `demo-*@pagosya.bo`
  seed merchants (no stores/products) exist again.

## Notes for next session

- Everything in "Recent work" above is now committed and pushed directly to
  `origin/main` (user's explicit request — no PR, solo-dev repo, matches
  how every other commit in this repo's history landed). Check `git log`
  for the actual commit(s) if you need the exact hash(es) — this file's
  `last-updated-commit` marker at the top reflects it too.
- **Still nobody has visually driven a real Chrome session as Claude** —
  every attempt to connect Claude in Chrome this session failed silently
  (skill/tools never became available, even after the user ran `/chrome`
  multiple times). If it's available in the new session, that's the highest
  ROI next step: open the two store links above and the dashboard, actually
  look at the centered store name, stacked big photos, and delete buttons.
- If the dev DB gets reset again (`prisma migrate reset` / schema changes
  touching non-nullable columns on tables with rows), remember to re-run
  `pnpm run seed` afterward — it doesn't happen automatically, and the ops
  reviewer / demo merchants silently disappear otherwise.
