# YAPI — current architecture (audit 2026-11-13)

Verified against the code on branch `oct24-clean` (HEAD `624fd2fd` plus today's uncommitted round work). Every number below was
counted in the repository, not taken from the brief. Paths are repo-relative. Companion docs: [YAPI_GENERATION_V2.md](YAPI_GENERATION_V2.md)
(target) and [YAPI_MIGRATION_PLAN.md](YAPI_MIGRATION_PLAN.md) (how to get there). Older docs (`AI_STOREFRONT_ARCHITECTURE.md`,
`yapi-design-engine.md`) describe pipelines from September that are no longer the live path.

## 1. Stack

| Part | Where | What it is |
|---|---|---|
| API | `apps/api` | NestJS + Prisma (PostgreSQL on :54329 in dev). All generation lives in `apps/api/src/storefront-source/` — **233 non-test modules**. |
| Merchant Studio | `apps/merchant-studio` | The YAPI chat + preview the merchant uses. |
| Merchant dashboard | `apps/merchant-dashboard` | Back office; serves a pre-built Studio from `public/studio`. |
| Checkout | `apps/checkout` | Separate checkout app (payments, orders). |
| Templates | `packages/store-templates/templates` | **133 template folders, 64 visible / 69 hidden**; 72 are presets of a base. |
| Storefront kit | `packages/storefront-kit` | The shared commerce runtime (`kit/commerce.js`, built from `commerce-src/`), kit UI (`kit/ui.tsx`), checkout shell. |
| Preview | `packages/storefront-preview` | Preview server used by the viewer (:4330 in dev). |

AI providers are switched in one place, `source-provider.ts` (`sourceProvider`): the local ChatGPT-plan bridge first, then
Anthropic for `claude-*` models, then OpenAI. Calls use the Responses API with strict `json_schema` outputs.

## 2. The live generation path (template stores, «section fill»)

The path that builds today's stores — the one the owner chose to keep for two weeks:

1. **Chat entry** — `SourceChatService.send` (`source-chat.service.ts`, 3 008 lines) reads the request, asks up to four
   questions first (`askBeforeBuild`), then `firstBuild`.
2. **Template pick** — `pickStoreTemplate`: one template from `YAPI_TEMPLATE_POOL` (15 in the dev `.env`), never the last stores'
   choice; clothing-only templates filtered (`CLOTHING_ONLY_TEMPLATES`).
3. **Master template** — every pooled template is the **Esencial** master (`templates/esencial`) wearing a theme:
   `master.variants.theme` lists **52 themes**; 27 other variant axes (header 8, hero 10, grid 7, card 5, footer 15, pdp 11,
   button 12, …). State lives in the store's files and is read by `readMasterState`.
4. **Section fill** — `sectionLibrary` (`source-chat.service.ts:922`):
   - `libraryFacts` gathers the store's facts: products, photos (up to 24), codes, packs, delivery zones, locations,
     `checkoutMode`.
   - **one model call**, `dialogue.composeLibrary`, fills the template's own home (`template` = the theme's `layout`) with
     words, photo indexes and looks. Schema: `libraryAnswerSchema`.
   - `validateLibraryLayout` (`source-section-library.ts`) keeps only what is real: known section ids (**92 in the catalogue**),
     photo indexes into real uploads, exact product names, the store's real codes.
   - ~12 deterministic passes rewrite the layout as data: `withoutRepeatedProductRows`, `withSharpCover`, `topUpHome`,
     `withPersonalizer`, `withPacks`, `withPayWays`, `withPromoCode`, `withVisit`, `withCleanHome` / `withRowTints`,
     `withPlainBackgrounds`, `withHeroShape`, `withCutouts`.
   - product-page sections by a second `composeLibrary` call (`productPageSections`).
   - `templates.refill` saves a **new revision** labelled «Portada de YAPI».
5. **Background QA** — `logTemplateQa` → `templateQaFindings` (`source-template-qa.ts`) renders the saved home at 1280 px and
   390 px in the offline sandbox and runs `evaluateTemplateRules` (`source-template-qa-rules.ts`, 208 lines). The blocking lines
   go **only to the product log and the reply metadata**. Nothing is corrected.

Rendering: Esencial's `components/home.tsx` maps `layout` blocks to `components/library.tsx` (135 KB). Every library section
root carries `data-lb-at={index}` and `data-lb={type}` — the rendered page can be traced back to the layout index.

## 3. Other generation paths that exist (dormant or flagged)

There are several ways to make a store. Only section fill is on for template stores. The rest still work, but are off or limited:

| Path | Files | Flag (dev `.env`) | Status |
|---|---|---|---|
| Store composer (brand-composed home + vision review loop) | `source-composer.ts`, `source-composer-run.ts` | `YAPI_COMPOSER` | off; owner verdict 2026-11-11 «we had better versions» |
| Studio writer (model writes home TSX) | `source-studio-spike.ts`, `source-home-writer-stage.ts`, `agent/*` | `YAPI_STUDIO` | off |
| Store chassis (model writes header/card/cart/pdp parts) | `agent/chassis-parts.ts`, `home-directions.ts` (`pickDesignPlan`) | `YAPI_CHASSIS` | off |
| Agent engine (tool-using agent loop, workspace, checks) | `agent/agent-loop.ts`, `agent-tools.ts`, `agent-verify.ts` | engine setting | used by older stores |
| Older single-call generator | `source-generation.service.ts` (1 693 lines) | — | legacy stores |

## 4. Contracts that already protect commerce

- **Commerce runtime is shared, not generated.** Generated pages place commerce through `data-pagosya-*` mounts
  (`data-pagosya-catalog`, `data-pagosya-bundles`, `data-pagosya-payways`, `[data-add]`, `data-cart-open`). Prices, stock,
  variants, cart, checkout and payments are drawn by `commerce.js` from `config.js` data at runtime.
- **Publish gate** — `assertSourceCommerceContract` (`source-commerce-contract.ts`): `config.js` + `commerce.js` on every page,
  catalogue on the home, a cart button, product placements must name real products (`productPlacementFindings`), price claims
  checked (`validateSourcePriceClaims`).
- **Required checks** — `requireSourceChecks` stores a `SourceCheckResult` per (revision, snapshot digest, runtime digest).

## 5. Versioning and publishing

- `StoreSourceVersion` (`storeId`, `revision`) is **append-only**: each build, edit or restore writes a new revision with its
  whole snapshot (`snapshot` JSON) and `digest`; `restoredFrom` records rollbacks.
- **Publishing is a pointer move**: `SourcePublishingService.publish` checks the contract, pending assumptions, unconfirmed prices
  and the required checks, then sets `Store.publishedSourceRevision` inside a locked transaction. The kit used is pinned in
  `SourceRuntimeBundle` / `StoreRuntimePublication` (digest-addressed).
- So a failed generation already cannot overwrite the published store: it can only add (or fail to add) a draft revision.
- A/B tests (`StoreSourceExperiment`) run a second revision against the published one.

## 6. Jobs

`StoreSourceChatJob`: lease-based queue (`leaseToken`, `leaseUntil`, `attempt`, `lastCommittedRevision`), one active job per
store (`activeStoreId` unique), idempotent per `requestId`, progress in `progress` JSON. A cut-off build is resumed by «sigue»
(`pendingRequest` in the reply metadata). Cost per call is metered (`metering.record`, `sourceUsage`).

## 7. Browser sandbox (already built)

`withVisualSandbox` (`source-visual-capture.ts`): headless Chromium with `chromiumSandbox`, serves **only the snapshot's bytes**
from `https://preview.invalid`, aborts every other request, blocks WebSockets / service workers / downloads, a strict CSP
(`connect-src 'none'`, no frames/workers/forms), and a 45 s hard deadline. Used by template QA, visual capture
(`captureSourceVisuals`: desktop 1280 + phone 390, three scroll positions), shopping probes, and the agent/composer captures
(`agent/agent-capture.ts`). This is a **render** sandbox. There is no **build** sandbox for model-written code yet — the studio
writer's TSX is compiled by the API process itself (`source-next.ts`, `validateNextSources`).

## 8. Asset handling

Uploads live under `/v1/uploads/*`. Sharp is used server-side for photo facts: `samplePhotoColours`, `photoBackdrop`
(edge colour, uniformity, width/height), `productGrounds` (edge median per product), `photoComposite` (design boards),
cut-outs (`source-photo-cutout.ts`, server model), `withSharpCover` (no full-width cover from a small photo). Photo
descriptions: `photo-descriptions.ts`. Originals are never modified; cut-outs are separate files.

## 9. CSS — the main source of conflicts

- Esencial ships **one stylesheet**, `templates/esencial/styles/globals.css`: **484 826 bytes**, **1 305 lines with theme-scoped
  selectors**, **247 `lb:` markers** (blocks shipped only when the section is used), **41 lines with `!important`**.
- A store's `styles/globals.css` is that sheet cut down for the store; the cap was raised from 180 000 to
  `MAX_STORE_SHEET = 400 000` chars today (`source-project.ts`).
- On top: theme blocks, look CSS generated in `source-master.ts` (`masterThemeCss`, `lookShapeCss` with `!important` radii,
  `lookCleanCss`), and the kit's own CSS (`kit/commerce-pages.css`, `controls.css`), which deletes store rules aimed at its
  product page (`releaseProductPageStyles`). The layers fight by specificity; that is where most «why does it look like that»
  hours go.

## 10. Tests and commands

- Jest specs sit beside each module (`*.spec.ts`); the owner's rule is one spec file per run (`npx jest <file>` in `apps/api`).
- Known pre-existing failures: `home-writer-tools.spec` («write_footer saves…», «playful stores check…»),
  `source-chat-master.spec` (editLayout mocks), `source-conversation.spec` (hidden «tostado»).
- Dev stack: `pnpm dev:chatgpt` (API with `nest --watch` — **saving any `apps/api` file restarts it and kills running YAPI
  jobs**).
- Seven benchmark brands: NOA, Oh Belly, BOXY, Pawby, rhode, Remolino, Cuadrízate (`examples/cmp-<round>-<brand>/demo.json`).
  Their rebuild drivers (`prepare.cjs`, `drive.cjs`, `shots.cjs`) live only in session scratchpads, not in the repo.
- Scorecard artifact (owner scores 1–5: unique / professional / brand / works): `https://claude.ai/artifact/MvdtDX1Em7wYYeH4de6uzF`.

## 11. What to reuse, replace, leave alone

| Keep untouched | Reuse and extend | Replace over time |
|---|---|---|
| Commerce runtime (`commerce.js`, mounts, checkout app, payments, orders, stock) | `withVisualSandbox` + captures (the render sandbox) | The single 485 KB `globals.css` → per-section scoped styles |
| Publish gate, append-only versions, pointer publish | `validateLibraryLayout` and the `with*` data passes (deterministic, testable) | Theme-specific CSS exceptions and `!important` look CSS |
| Lease-based job queue, «sigue» resume, metering | `runComposer` review half + `applyComposerChanges` (typed, bounded, keeps the last good layout) | Five parallel generation paths → one pipeline with typed stages |
| Provider switch (`source-provider.ts`) | `evaluateTemplateRules` (deterministic page rules) | Log-only QA → QA that corrects |
| | Photo facts (sharp), `section-fit.json` (51 templates fitted, 50 with signatures) | |
