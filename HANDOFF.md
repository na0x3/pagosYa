# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it describes *current truth*. For session narrative,
see `docs/history/SESSION_LOG.md`. For architecture and how to run locally, see
`README.md`.

**This file is only updated when the user explicitly asks.** The Stop hook
that used to force this every turn was disabled by request. Don't re-add it.

Updated: 2026-11-18
Branch: `oct24-clean` — the owner's working branch (their dev servers read this tree; never switch branches under them).
Pushed to origin up to `2efefb7f` (spec commit `2a68c186` local). Prod is the separate branch `prod/2026-11-07`.
Local only: `apps/api/.env` has `YAPI_CHAT_ON_CLAUDE` commented out (YAPI on the ChatGPT bridge, owner 2026-11-18).

## 1. Next actions (owner, 2026-11-18)

**A. International merchants with Mercado Pago — spec written, awaiting owner review.**
`docs/superpowers/specs/2026-11-18-international-merchants-mercado-pago-design.md`. Owner decisions: foreign merchants are paid
into their OWN Mercado Pago account (plugin model, pagosYa never holds the money); all 7 Mercado Pago countries (AR, BR, CL, CO, MX,
PE, UY), each store in its own currency, no conversion; Checkout Pro behind a small payment-connection layer (Stripe/PayPal later);
free while we launch. Next: owner reviews the spec → confirm whether Mercado Pago needs one application per country (§6.1) →
`superpowers:writing-plans` → build. Owner also needs terms for foreign merchants reviewed (§6.2).

**B. Language versions — next spec (piece 2).** Portuguese (Brazil) everywhere: dashboard, Studio, YAPI replies, store platform
texts (cart, checkout, account, emails), help; Spanish stays the default. Brainstorm + spec after A is approved.

**C. Copy-a-store runs waiting on AI.** Both AI sources were out on 2026-11-18 (Anthropic balance empty; ChatGPT plan
`subscription_sharing_usage_limit_exceeded`). When one is back, run the V2 own-site remix with the new login + 404 copying
(`remixExtras`, never live-tested) on Graza copy 2 (`cmwlk04yi0004h94u7l6fqhad`) and Fishwife (`cmwlnbe4l000asqkii24qqgmc`):
`POST /v1/stores/:id/source-project/v2-prototype {creative:true, remix:<site>, ownSite:true}`; compare home, login and 404 with
the real site. The demo merchant's free import design was reset by hand for tests (`importBuildUsedAt`, `designTries`).

**D. Older items still open:** a real-phone check of product card videos; deploy is the owner's call (no deploy config in repo).

## 2. Older sections below are carried forward from 2026-10-05 — NOT re-verified this session.

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

- Start the stack with **`pnpm dev:chatgpt`** (YAPI on the owner's ChatGPT plan) — never plain `pnpm dev`
  (paid OpenAI credits). If it dies: `nohup pnpm dev:chatgpt > <log> 2>&1 &`, then check ports.
- Ports: API 3001, merchant dashboard + Studio 4323, ops 4322, checkout 5175, embedded Postgres 54329.
- The Studio is served from `apps/merchant-dashboard/public/studio` — rebuild after kit edits
  (`pnpm --filter @pagosya/merchant-dashboard run build:studio`).
- Dev login: the seed's demo merchant (`apps/api/prisma/seed.ts`).
- Read-only DB queries: Prisma `$queryRawUnsafe` from a script inside `apps/api` (no `psql` installed).

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
