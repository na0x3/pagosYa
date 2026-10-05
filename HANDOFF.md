# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it describes *current truth*. For session narrative,
see `docs/history/SESSION_LOG.md`. For architecture and how to run locally, see
`README.md`.

**This file is only updated when the user explicitly asks.** The Stop hook
that used to force this every turn was disabled by request. Don't re-add it.

Updated: 2026-10-05
Branch: `feature/store-page-architecture` — **not merged, not pushed.** 98 commits ahead of `main`;
only the most recent 31 are the YAPI page-grammar work and the design engine described below. Merging this
branch integrates all 98, which is a much larger decision than finishing that work.
Working tree: `source-publishing.service.ts` + its spec are modified ON PURPOSE (the drawn-signup change,
complete with four tests, deliberately kept out of every commit). Plus some stray .mov files and `fixit/`.

## 1. Next action — the owner's call first

**Look at a generated store and judge the design engine.** It is built and committed (`a01083bf`,
`1274e6b2`) but no human has seen its output on a real store. Two ways in:

- `node examples/yapi-design-engine/server.mjs` serves the deterministic demos on http://127.0.0.1:4336 —
  three AFTER HOURS directions built from the *same* facts, products, prices and photos, plus all 28
  principal adapters under `/variants/`.
- Generate with YAPI on a store **with products and a real name**. The last real generation was an empty
  store called "tienda", which proves nothing about the copy.

Then specify what is still wrong. Hard constraint from the owner, unchanged: **no fixed design rules** —
add capability, never a grammar.

### What shipped (do not redo it)

**The design engine**, built 2026-10-04 evening, committed 2026-10-05 as `a01083bf` + `1274e6b2`.
Full architecture in `docs/yapi-design-engine.md` — read that before touching it.
- `apps/api/src/storefront-source/design-engine/`: brand analysis and creative planning calls, a bounded
  critic (≤3 layout patches, cannot touch copy/prices/products/assets), Zod schemas, deterministic quality
  repair, seeded brand-aware defaults, and the fixtures.
- `packages/shared-types/src/sketch-registry.ts` owns the shared composition vocabulary (28 principal
  adapters across hero/catalog/story/gallery/collections/footer); `website-design.ts` owns design metadata.
  `StoreSketch` stays authoritative and editable; no new database tables.
- It answers the modern-feel spec: generated stores now carry keyframe animation, sticky positioning and
  gradients, against the measured "1 `@keyframes`, zero sticky, zero gradients" that motivated it. The spec
  (`docs/superpowers/specs/2026-10-04-yapi-modern-feel-design.md`) is still the statement of intent; nobody
  has confirmed by eye that it is *met*.
- Verified 2026-10-05 before committing: design-engine/critic/registry/sketch/sketch-studio **77/77**,
  merchant-studio **340/340**, `tsc --noEmit` clean on api and merchant-studio, shared-types builds.
  Capture pass over all three AFTER HOURS fixtures and all 28 variants at 1440/820/390: no overflow, no
  missing images, one h1, commerce hydrating, zero runtime errors (`examples/yapi-design-engine/dist/`,
  gitignored).

Before that, the page-grammar program: 14 tasks + a fix wave, all reviewed, on this branch.
- `drawPageStructure()` generates the page skeleton from drawn parameters BEFORE the model is called;
  `fillStructure` binds the response to it by slot id, drops inventions, caps vetoes, drops bands that are
  empty after repair, and owns each band's size/width/media.
- The prompt carries a real product digest (names, prices, categories, options, facts) instead of 30 bare
  names; `el bloque catalog los muestra solo` is gone; the energy lines no longer dictate band count.
- Page-wide component vocabulary went 5 style keys → 11 (buttons ×6, buttonIcon, icons, dividers, badges,
  fields, links), rendered in CSS and offered to merchants in the Boceto look panel.
- Ledger with all 49 rulings, deferred minors and known gaps:
  `.superpowers/sdd/2026-10-04-yapi-page-grammar-real-copy-and-components/progress.md`

### Known gaps, honestly

- **Nobody has looked at the design engine's output.** Every claim above it is a passing test or a geometry
  capture, not a judgement that the stores look good.
- **Nine tests fail in `apps/api` `storefront-source`, and all nine predate the design engine.** They were
  checked one by one against the previous commit (`036623da`) and none is a regression from it:
  - 5 in `source-product-card-presets.spec.ts` — the spec hardcodes a 5-key `DEFAULTS` while the presets
    ship 6 (`media`). Both files are untouched since before this work.
  - 1 in `agent/agent-tools.theme.spec.ts` — `set_product_card_theme` grew `assurances` and `media`; the
    expected key list was never updated. Source and spec both untouched.
  - 1 in `source-validation-error.spec.ts` — the raw-diagnostics ratchet reads 31 against a `BASELINE` of
    29. The previous commit scores 31 too, with an identical list.
  - 1 in `source-commerce-pages.spec.ts` (preview shows a rating with no published summary) and 1 in
    `source-next-pages.spec.ts` (a hand-written `page-SLUG` no longer demands its hooks). Attributed from
    the diff, not by a rerun: the design-engine commit touches none of the code either test exercises —
    the rating line last changed in `708ce191`.
  - Also still true from before: `source-generation.service.spec.ts` "steers planning away from recent
    fingerprints".
- Running the whole `storefront-source` suite at once dies with SIGABRT partway through. Run it in slices.
- **The Boceto look panel's 11 controls have never been seen.** The dashboard serves a PRE-BUILT Studio, so
  they do not appear until it is rebuilt. Generation uses all 11; the merchant cannot click the new 6 yet.
- **Nothing has proven the copy got less generic.** `specificityReport` is exported and wired into
  `apps/api/scripts/evaluate-yapi-agent.ts`, but running it spends the owner's ChatGPT plan and needs port
  3001. Not run.
- A real compositional weakness seen in the last real generation: the hero landed 5th, after announce →
  catalog → story → steps. The grammar enforces legality, not editorial sense.

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
