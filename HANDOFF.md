# pagosYa — Session Handoff

Read this first, every session, before touching code. It's a restart
snapshot, not a diary — it describes *current truth*. For session narrative,
see `docs/history/SESSION_LOG.md`. For architecture and how to run locally, see
`README.md`.

**This file is only updated when the user explicitly asks.** The Stop hook
that used to force this every turn was disabled by request. Don't re-add it.

Updated: 2026-11-03
Branch: `oct24-clean` — the owner's working branch (their dev servers read this tree; never switch branches
under them). **Not pushed.** ~600 commits ahead of `main`.
Working tree: ~220 uncommitted files of earlier work (Oct 31–Nov 3: 34 templates, template quick edits, shipping
ask, layout edit, screenshot→product, capture fix…). The owner's «commit it in chunks» step is still pending —
commits from this session stage only their own hunks.

## 1. Next action — build the Único premium landing (owner chose **Native**)

Execute `docs/superpowers/plans/2026-11-03-unico-premium-landing.md` (7 tasks) with
`superpowers:executing-plans`, inline, then one fresh reviewer on the whole range. Spec:
`docs/superpowers/specs/2026-11-03-unico-premium-landing-design.md`. Ledger: create
`.superpowers/sdd/2026-11-03-unico-premium-landing/progress.md` (sdd-workspace script).

What it builds: one-product (Único) stores look like nubecorp.pages.dev + Shopify Expanse — split hero (words
beside the photo, never over it), word band, colour cards (kit-drawn from colour photos; tap picks the colour),
buy box, benefits band, hotspots, chip band, comparison, calm FAQ, closing photo; a `shop` header with
«Comprar»; type/spacing/button finish. Also: the `cover-full` look `right` hero (Crocante, Oh Belly…) — the
owner dislikes its «transparent» words over the photo — gets a solid left-aligned card (Task 1).

Rules that bit this session (all in the plan's Global Constraints):
- Before saving ANY file under `apps/api/src` (spec files too): check no `StoreSourceChatJob` RUNNING/QUEUED —
  nest --watch restarts and kills YAPI jobs.
- Jest: name spec files, always `--maxWorkers=2`. **Never pass a folder** — a whole `storefront-source/` run
  took the entire dev stack down today. Contract suite needs `NODE_OPTIONS=--max-old-space-size=6144`.
- Files that also hold other uncommitted work: stage as HEAD + exact text replacements, never `-U0` hunks
  (that once committed an unparseable file; repaired in 07caf590). Check TS/JS parse; check CSS rules land
  inside their `/* lb:… */` / `/* theme:… */` block.
- Kit: edit `packages/storefront-kit/commerce-src/`, then `node packages/storefront-kit/tools/build-commerce.mjs`,
  then `pnpm --filter @pagosya/merchant-dashboard run build:studio` (the Studio preview uses its own bundled kit).
- Task 7's live check needs the owner's real photos (a sofa fabric close-up, one photo per colour, plus one
  calm product).

### What shipped this session (do not redo it)
- **Lively one-product stores** — commits `35121d01..0b27abf7`: kit `look/lively.js` (glow, add-button pulse,
  bubble ripple, WhatsApp bubble, late-page start), buy bar on laptops (photo + choice, hides at the page footer),
  hero pills, `detail-hotspots` + `chips-marquee` sections, colourful/calm mood (`variants.mood`, letters, blobs),
  library rules (caps, whole backed numbers), «hazla más tranquila / más colorida» (`source-mood-ask.ts`).
  Fresh opus review done; all Critical/Important fixed with tests. Spec/plan: `docs/superpowers/*/2026-11-03-lively-*`.
- **Uncommitted but live in the stack** (inside files with other pending work): `source-chat.service.ts` (mood
  saved with the home + mood switch routing; screenshot `pendingListing` → photos make the product;
  `keepOnMessage` fixes progress saves wiping message metadata), `product-screenshot.ts` (nameless reads use the
  catalog name; prompt avoids dimmed photos), `source-visual-capture.ts` (on-screen = both axes + 5 s decode cap —
  fixed the 8 templates' 45 s layout timeouts).

### Known gaps, honestly
- 13 deferred minors from the lively review: `.superpowers/sdd/2026-11-03-lively-one-product-stores/progress.md`.
- Lively Task 8 with real photos never run (stand-in crops only). Test stores: «Sofá Cama Test» 1–4,
  «Sofá Nube Test» (11krrr2d, rev 3 colourful).
- `source-templates-motion` spec fails: the Esencial stylesheet is over the 180 kB source limit (pre-existing,
  grows with each section; template stores filter CSS per section, unaffected).
- Product names from screenshots ignore the merchant's own words; CNY prices count as «no price».

### Queued (owner asked; each gets its own spec after the Único work)
1. Growing stores — a Único store that adds products keeps product 1 as the hero; offer/move to a catalogue
   template (3+ products), keeping photos/words/colours.
2. pagosYa browser button — Chrome extension: capture the supplier page + YAPI reads it; «Crear tienda con este
   producto» or «Agregar a mi tienda»; laptop only (phones keep screenshots).
3. AliExpress official dropshipping API for plain AliExpress links.

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
