# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it describes *current truth*. For session narrative,
see `docs/history/SESSION_LOG.md`. For architecture and how to run locally, see
`README.md`.

**This file is only updated when the user explicitly asks.** The Stop hook
that used to force this every turn was disabled by request. Don't re-add it.

Updated: 2026-09-16 (overnight session)
Branch: `feature/independent-storefront-projects` — **not merged to main, not pushed**
HEAD: `1f06747`
Working tree: clean except `.impeccable/*.png` (unrelated, already modified
  when the session started — left alone deliberately)

## 1. Read these first

- `docs/CATALOG_ARRANGEMENT.md` — the catalog arrangement feature, now implemented
- `docs/STOREFRONT_DESIGN_LEVEL_UP.md` — **new**, the design gap vs amboras.com, phased
- `docs/DOMAIN_SHOP_READINESS.md` — **new**, why nobody can buy a domain yet
- `.superpowers/sdd/CATALOG_ARRANGEMENT_PLAN/progress.md` — the build ledger, with all
  37 rulings, their reasoning and what each costs if wrong
- `.superpowers/sdd/design-phase0-report.md` — what Phase 0 changed and what it skipped

## 2. Next action — pick one, they are independent

**(a) Storefront design, Phase 1+** — `docs/STOREFRONT_DESIGN_LEVEL_UP.md`.
Phase 0 is committed but **changes nothing until the four benchmark stores are
regenerated**. Do that first and look at the captures before building further.
The later phases touch `commerce.js` / `commerce-pages.css`, which are served
live to every published store; the spec isolates the risky `line-height`
change with its own revert threshold.

**(b) Domain shop** — `docs/DOMAIN_SHOP_READINESS.md`. The backend is real at
every hop; two things block it, one of which only the owner can do (§4).

**(c) Merge this branch.** The catalog work is review-clean. See §3.

## 3. Catalog arrangement — done, ready to merge

Store owners choose how products are arranged: one grid (`all`, the default
every existing store is on), sections per collection, a separate products
page, or a tab per collection. Plus collections that work like playlists, two
platform-owned pages with real hosted URLs, a Studio panel, and a YAPI chat
flow that **asks before applying**.

- 8 planned tasks, 12 fix rounds, a whole-feature review and a scoped
  re-review. Final verdict: **ready with one logged follow-up**.
- Both migrations applied against a real local database holding 42 stores /
  83 products; all 42 backfilled to `catalogLayout='all'`.
- All four arrangements verified in a browser at 1280×844 and 390×844.
- Suites at review time: api 840 serial, checkout 227 + 4 SEO, studio 44 unit
  + 164 Playwright, all `tsc` clean.

**Known, accepted, logged — not bugs to re-find:**
- Under `tabs`, `/productos` is not linked from the storefront but is still in
  the sitemap. Direct consequence of the owner's own §7 decision.
- A genuine yes phrased `"dale, va a quedar lindo"` falls into the
  confirm-twice guard, because `va a` is a mind-change marker. Benign
  direction: a false negative costs one extra confirmation; a false positive
  changes a live store.
- The YAPI recogniser is a whitelist and will always miss some phrasings. That
  is deliberate — the owner chose ask-before-applying precisely so misses are
  cheap. Do not "improve" it into silently applying changes.

## 4. Domain shop — blocked, and one blocker is the owner's

A merchant **cannot buy a domain today**, for two independent reasons:

1. **No credentials.** Every `NAMECOM_*` / `DOMAIN_*` variable is absent, so
   config throws 503 and the UI degrades correctly. Unblocking needs a funded
   Name.com reseller account and a Cloudflare for SaaS zone — **owner-only work.**
2. **No Studio entry point at all.** The UI exists only in the merchant
   dashboard, three layers deep. Nothing in `apps/merchant-studio` references
   it. A panel spec is in §6 of the readiness doc — it must add both the
   toolbar button *and* the `source-business-workspace.ts` catalog entry;
   adding only the button reproduces a bug found and fixed this session.

**Fix before going live, regardless of the above:** a paid order can stall
forever with no support case. The escalation in `domain-commerce.service.ts`
excludes `AWAITING_PAYMENT`, which is exactly the status a paid-but-
unregistered order holds. Merchant pays, receives nothing, nobody is told.
Also `CUSTOM_DOMAIN_CNAME_TARGET` has a default, so its guard can never fire —
it fails open where every other variable fails closed.

## 5. Storefront design — Phase 0 landed, with a cost

Phase 0 is generator-prompt and token work only. No kit file was touched, so
no published storefront changed. It covers five type roles with a constrained
display:body ratio, an ink-opacity ladder, an eight-step spacing scale, a `ch`
measure cap, a five-slot accent budget sampled from the merchant's own goods,
and a persisted per-store photography scene contract so a catalogue reads as
one shoot rather than one-off packshots.

**Decide before the next generation run:** the stable prompt grew ~4.6 KB
(~2,300 input tokens, ~0.6 credits per attempt). A merchant on a 10-credit
ceiling can no longer afford a repair after a truncated first response; a test
fixture was raised 10 → 12 to reflect that. `minCredits` scales automatically
so nobody is silently under-provisioned, but the practical floor rose.

**Open, from the spec's §13:** one italic role currently forces a sans-led
concept into a serif partner (only two bundled fonts carry true italics);
reading a merchant's uploaded photos to set the surface colour is unbuilt, and
is the half that would fix grey-on-cream for *existing* catalogues without
regenerating; card/scene aspect is not yet a merchant choice.

**Caveat on the reference:** amboras publishes no live demo store. Their
example links are static screenshots of product detail pages only. Their
marketing CSS was quoted exactly; everything about their storefronts is
measured off pixels and stated as ratios. Nobody has seen their homepages.

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
