# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it describes *current truth*. For session narrative,
see `docs/history/SESSION_LOG.md`. For architecture and how to run locally, see
`README.md`.

**This file is only updated when the user explicitly asks.** The Stop hook
that used to force this every turn was disabled by request. Don't re-add it.

Updated: 2026-09-24
Branch: `feature/daily-rewards` — **pushed to origin, not merged to main**
Working tree: clean. `main` = `origin/main` = `b2e4050`; this branch contains it,
so the merge is a clean `--no-ff`.

## 1. Next action — the owner's call first

**(a) Merge `feature/daily-rewards`.** Review-ready: full API suite (1929 + 34),
checkout 313, Studio 189 browser, dashboard 73 browser + 19 unit, `pnpm build`,
`pnpm lint` (0 errors) and `check:boundaries` all green on 2026-09-24. Merging
was deliberately left to the owner. Open a PR at
`https://github.com/na0x3/pagosYa/pull/new/feature/daily-rewards` or merge
locally with `--no-ff` like earlier branches.

**(b) ASFI sub-project 3** (holdback / reserve / automatic payouts). 1 and 2
are on main. Process is spec → owner approves design → plan → build; start with
brainstorming. See the ASFI section of the auto-memory.

**(c) Storefront design** — rerun the four benchmarks (~142 credits, needs the
owner's go-ahead) to render §6.1 photo intelligence, then §6.2. Details in
`docs/STOREFRONT_DESIGN_PHASE0_RESULT.md` §6a.

**(d) Keep splitting `dashboard.js`** (4.9k lines) with the `mountX(deps)`
pattern documented in `docs/CLEAN_CODE_PLAN.md` (Phase 5, continued). Next
candidates: profile/sessions menu, payment-link lists, finance charts,
product/catalog import.

## 2. What this branch carries

- Daily luck wheel and dice board (server-drawn with `crypto.randomInt` under a
  merchant lock); the board pops up per earned roll. Companion profile art.
- pagosYa is light everywhere; dark tokens remain only for a storefront whose
  own brand canvas is dark.
- Comeback card opens centered after the receipt; Studio test sales preview it.
- Studio plugin dialogs restyled and pinned inside the dashboard iframe.
- Storefront cart lines: photo, option, unit price, low stock, savings.
- **Security fixes:**
  - `metadata.fx` was accepted from merchants at intent creation. It is read as
    the BOB price an international charge converts from *and* as the amount
    counted against ASFI limits, so a merchant could overcharge an international
    buyer or record a 1-centavo payment against their limits. `create()` now
    strips it. **Check production for intents created earlier with a
    merchant-seeded `fx`.**
  - Dice-board rolls counted test-mode payments, so free test payments could
    farm rolls and the AI credits they win. Now live payments only.
- One shared HTML escaper (`merchant-dashboard/src/html.mjs`); the old
  `dashboard.js` one did not escape `'`.
- ESLint errors 74 → 0 and `pnpm lint` gates CI. 954 warnings remain as a
  burn-down; promote a rule to error when its count reaches zero.
- Rewards panel moved out of the `dashboard.js` closure into
  `src/rewards-panel.mjs`.

## 3. Domain shop — every remaining blocker is the owner's

All buildable items in `docs/DOMAIN_SHOP_READINESS.md` §5a are done (Studio
entry point, stalled-payment escalation, checkout expiry, required CNAME target,
operator tooling, expiry warnings). Left: Name.com reseller + Cloudflare for
SaaS accounts, the platform merchant, pricing/renewal/refund policy, legal
terms (§5b), then funded sandbox and live smoke tests (§5c).

## 4. Loose files the owner should move

`SFVL-SOL-AUT-709354049-9526` (ASFI/bank PDF) sits at the repo root, and
`visor (1).pdf` is a byte-identical copy. Both are gitignored now (`/*.pdf`),
so they can't be committed by accident. The duplicate and the empty
`pagosya-backup.dump` can be deleted; automated deletion was blocked.

## 6. Production readiness — unchanged, carried forward, NOT re-verified

**REAL:** Banco Económico QR Simple (`BanecoQrAdapter`), flagged off by
default via `BANECO_QR_ENABLED`.

**MOCK:** card, Tigo Money, bank transfer, payout/disbursement to merchant
bank accounts, SIN/SIAT e-invoicing.

**DO NOT deploy for real-money production.** No payment-rail work happened this
session, so this section is inherited from the previous handoff and was not
re-checked. Verify before trusting it.

## 7. Local development

- `pnpm run dev:db` — embedded Postgres, port 54329. `pg_isready` is **not**
  installed on this machine; use `npx prisma migrate status` instead.
- `apps/api`: `pnpm run start:dev` (port 3000)
- `apps/checkout`: `pnpm run dev` — **the real configured port is 5174**, not 5173
- `apps/merchant-dashboard` / `apps/ops`: `node server.mjs` (4323 / 4322)
- **Known env mismatch, pre-existing:** `apps/checkout/.env` points at API port
  3001 while `apps/api/.env` uses 3000. This cost a verification agent real time.
- Some `source-generation` / `source-projects` / `stores.service` specs time out
  under parallel load and pass in isolation or with `--runInBand`. Verified
  twice this session — flake, not a regression.

## 8. Migration warnings

- Two new migrations: `20260916120000_store_collections`,
  `20260916130000_store_catalog_layout`. Both applied cleanly to a real local
  database with pre-existing data; constraints and cascades verified
  functionally; test data removed afterwards.
- `20260807024643_multi_store` was rewritten in place in an earlier session.
  Any checkout with pre-existing `PaymentLink` rows and a half-applied copy
  needs `prisma migrate resolve --rolled-back 20260807024643_multi_store`
  before `migrate deploy` succeeds. A plain `git pull` is not enough.
- Two leftover "Tienda QA Test" stores remain in the local DB from an older
  session. **Do not delete them via browser automation** — the confirm dialog
  hangs it, confirmed twice.

## 9. Pre-existing bug worth fixing sometime

`CategoriesService.reorder` accepts a duplicate id standing in for an omitted
one, so a category silently keeps a stale `sortOrder` and the merchant's saved
order is wrong. The identical bug was found and fixed in the new
`CollectionsService`; categories was deliberately left alone to keep this
branch scoped. `apps/api/src/categories/categories.service.ts`.
