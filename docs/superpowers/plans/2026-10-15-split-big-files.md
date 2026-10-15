# Split Big Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the three largest files the next feature projects will grow — `packages/storefront-kit/kit/commerce.js` (4,491 lines), `apps/api/src/storefront-source/source-generation.service.ts` (1,936 lines) and `apps/merchant-dashboard/src/dashboard.js` (4,223 lines) — into focused modules with **no behaviour change**, before store controls, store voice and business tools land in them.

**Architecture:**
- **commerce.js** stays one served file. It is a single IIFE whose ~620 top-level statements share one scope, so it is split into *parts*: runs of whole lines of that IIFE, kept in `packages/storefront-kit/commerce-src/<area>/<topic>.js`. A deterministic tool, `packages/storefront-kit/tools/build-commerce.mjs`, concatenates them in a fixed order and writes `kit/commerce.js`, which stays checked in, so every consumer keeps reading the same path. A node test fails when `kit/commerce.js` differs from the parts. The parts are cut at statement boundaries in the existing order, so the generated file stays **byte-identical** (its sha256 is pinned in Task 0) at every commit.
- **source-generation.service.ts** keeps its Nest class, constructor and public methods. The two private methods that already take explicit input (style proposals, background review) move into modules that take a `deps` object. The parts of `generate()` that share its locals use two small context objects:
  - `facts`: the run's fixed values, passed by value.
  - `live`: getter/setter views of `generate()`'s `let` locals. Every extracted stage reads and writes the real local, never a copy.
  The stages extracted this way are save assembly, the Sep-5 author stage, its review and touch closure, the chat kit touch and the agent stage.
- **dashboard.js** follows the existing panel pattern (`mountCobrosPanel(deps)` and the others). Each screen moves into `src/<screen>-panel.mjs`, which exports `create<Screen>Panel(deps)`:
  - `create…` runs with no side effects and returns the screen's functions plus `init()`.
  - `init()` runs the screen's original top-level statements, such as listeners.
  - `dashboard.js` creates each panel at the spot where its first moved line was.
  - Shared state stays in `dashboard.js` and reaches a panel through getter and setter deps.

**Tech Stack:** plain browser JS (storefront kit, dashboard ES modules served by `server.mjs` / bundled by Vite 6), NestJS 11 + TypeScript (API), Jest 29 + ts-jest (API specs), `node:test` (kit and dashboard unit tests), Playwright (dashboard and Studio browser specs), ESLint 9 flat config, dependency-cruiser.

**Spec:** none (owner instruction 2026-10-15: "can we also like split really big files?" → split first, behaviour-identical; files: commerce.js, source-generation.service.ts, dashboard.js)

## Global Constraints

- **No behaviour change.** Every task is a move plus only the glue this plan prints: context objects, deps objects, imports and exports, re-exports. Do not rename, reorder, reformat or "improve" moved code beyond the listed replacements, and do not fix a bug you notice. Write it down for the owner instead.
- **commerce.js stays byte-identical.** From Task 1 on, `packages/storefront-kit/kit/commerce.js` is generated: never edit it by hand. After every commerce task its sha256 must equal the value recorded in Task 0.
- **The owner's dev stack runs from this working tree.**
  - Editing `apps/api/src/**` restarts the owner's API (`nest start --watch`). This is fine overnight with no builds running. Commit at the end of each task so the watcher never sits on a half-moved file for long.
  - Editing `apps/merchant-dashboard/server.mjs` restarts the dashboard server (`node --watch`).
  - `kit/commerce.js` never changes, so running stores and previews are unaffected.
- **Never touch the owner's uncommitted work** in `apps/api/src/store-emails/*` (6 modified files). Do not edit `docs/superpowers/plans/2026-10-14-store-controls.md` either. It was committed as `e98226a0` while this plan was being written, and it cites pre-split line numbers. Task 30 hands the owner the move map for it.
- **Committing.** Every commit stages exact paths with `git add <paths>`, never `git add -A`, `git add .` or `git commit -a`. Run `git status --short` before each commit and check that only this task's files are staged.
- **Commit message.** Use the form `refactor(<area>): <what moved>`, followed by a blank line and the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- **Databases.**
  - Never run `prisma migrate`, `prisma db push`, `prisma migrate reset` or `prisma migrate diff`.
  - Never run `*.integration.spec.ts` (they create and drop databases) or `apps/api/test/*.e2e-spec.ts`.
- **Jest.** Always run `cd apps/api && npx jest <paths> --maxWorkers=2`. Never run the whole API suite with default workers.
- **Line numbers** are at commit `5a206a30`. HEAD moved to `e98226a0` (a docs-only commit) while this plan was written, and the three files are identical in both. Every range is also given by its quoted first line, and usually its last line, so you can find it after earlier tasks have shifted the numbers. When a quote and a number disagree, trust the quote. If a quoted line cannot be found, stop and report: the file changed since this plan was written.
- **Pre-existing failures are not fixed here.** Task 0 records them. A task passes when every suite gives the same pass/fail result as in Task 0, not only when it is green.
- **No new dependencies.** Node ≥ 20.9 (the machine runs Node 26). `fs.readdirSync(…, { recursive: true })` and `Dirent.parentPath ?? Dirent.path` are fine.
- **Branch:** `feature/store-page-architecture`. The three groups (A commerce, B service, C dashboard) are independent. Do them in this order, but a group may be paused between tasks.

## Review Focus

The five failure modes most likely to bite, each with the test that pins it and the task that adds or uses that test.

1. **A closure variable captured by reference becomes a stale copy, or is read in its temporal dead zone.**
   - **Where.** `generate()` reassigns `model` (single-call repair), `generated`, `kitTouch`, `visualSystem`, `taskPrompt` and `revisionLook` after the stages that read them are created. `dashboard.js` reassigns `currentStoreId`, `lastStores` and `lastPaymentLinks`.
   - **What breaks.**
     - Destructuring `live`, or passing a value where a getter is needed, freezes the old value.
     - Passing `assembleSave` itself instead of `(…a) => assembleSave(…a)` to a stage created before `assembleSave` is declared throws a `ReferenceError`.
     - In the dashboard, a panel created before another panel must get that panel's functions through arrow wrappers.
   - **Pinned by:**
     - the existing review specs: "N+1 falls back to the look revision N just measured when its own measurement fails" (live `revisionLook`), "measures the home at most twice in a touched build" (live `kitTouch` and the lazy `assembleSave`), and "saves N+1 with exactly one brand.css …";
     - new `apps/api/src/storefront-source/source-sep5-call.spec.ts` (Task 12: the model is read at each call);
     - new `apps/merchant-dashboard/tests/dashboard-store-switch.spec.mjs` (Task 17: every moved screen uses the store picked *now*).
2. **Concatenation order and bytes of commerce.js.** Parts out of order, a dropped or duplicated part, a missing final newline, or a part outside the list would ship a different runtime to every store.
   - **Pinned by** new `packages/storefront-kit/tools/build-commerce.test.mjs` (Task 1). It checks that the file equals the built parts, that every part is listed exactly once, and that the build parses as one classic script.
   - **Also:** the sha256 check against Task 0 in every commerce task.
3. **`this` binding in extracted service helpers.**
   - **What breaks.** `coverWithRewardCredits` passed unbound loses `this`. Its own `try/catch` then swallows the `TypeError` and reward credits silently become 0. The timing fields `stylePickPollMs`, `pickHeroWaitMs` and `reviewHeartbeatMs` must be read from the instance when the helper starts, because the specs overwrite them on the instance.
   - **Pinned by:**
     - new review test "redeems reward credits for the review row it saves" (Task 11). It is written and green **before** the move.
     - the existing style specs that set `(service as any).stylePickPollMs` and `pickHeroWaitMs`;
     - the existing review spec "keeps the review row beating while it runs …" (`reviewHeartbeatMs = 5`).
4. **Dashboard modules relying on shared mutable state, DOM ids or hoisting at load.** A function that was a hoisted declaration becomes a `const` from `create…()`. A panel that touches `document` when imported, or a missed rename of a `let` (for example `currentStoreId`), breaks the page.
   - **Pinned by:**
     - `tests/dashboard-smoke.spec.mjs` (every view opens without a `pageerror`);
     - `unit/served-modules.test.mjs` (every new module is served);
     - new `unit/dashboard-panels.test.mjs` (Task 18 on: each panel imports under Node with no DOM and exports its factory);
     - new `tests/dashboard-store-switch.spec.mjs`;
     - `npx eslint <panel>`: `no-undef` is an error for `.mjs`, so a missed rename fails lint.
5. **Studio / preview `?raw` import of commerce.js.**
   - **What breaks.** `packages/storefront-preview/src/source-preview.ts` imports `@pagosya/storefront-kit/kit/commerce.js?raw`. The dashboard serves a **pre-built** Studio (`apps/merchant-dashboard/public/studio`). If the generated file moved or changed, previews would silently diverge from published stores.
   - **Pinned by:**
     - `build-commerce.test.mjs` (the served path stays the file that is built);
     - the API specs that read `kitPath('commerce.js')`;
     - Task 9's rebuild of the Studio and its check that the built bundle still carries the runtime marker `pagosya-product-options:v1`.

## File Structure

**Group A — commerce.js** (all new files are under `packages/storefront-kit/`):

| Path | Role |
|---|---|
| `tools/build-commerce.mjs` (new) | `PARTS` order, `buildCommerce()`, `--check` |
| `tools/build-commerce.test.mjs` (new) | equality, completeness and parse tests (`node:test`) |
| `commerce-src/shared/config-dna.js` | IIFE opening, `config`, DNA values, motion tokens, `LOOK`, cart word, checkout photo |
| `commerce-src/motifs/drawings.js` | motif drawing sanitiser, AI and pack motif lists |
| `commerce-src/shared/analytics.js` | hosted flag, pixels, analytics queue, card observer |
| `commerce-src/shared/state.js` | preview flag, store/cart state, escape, money, option groups |
| `commerce-src/catalog/offers.js` | memberships, subscriptions (cadence), boxes |
| `commerce-src/cart/lines.js` | cart lines, limits, restore, hosted cart sync |
| `commerce-src/product/dialog-style.js` | gallery helpers and the product dialog/page CSS |
| `commerce-src/product/setup.js` | product page/dialog setup, prices, badges, quantity, box, reviews stars |
| `commerce-src/product/bundles-related.js` | bundle offers, cart suggestions, related, sticky bar |
| `commerce-src/pages/policy-links.js` | assurance icons, policy titles and links, info links |
| `commerce-src/account/pages.js` | account gates and signed-in account views |
| `commerce-src/pages/standard.js` | FAQ, collections, search, cookies, info pages, policy dialog |
| `commerce-src/product/page.js` | delivery, options, gallery, openProduct, highlights, content blocks |
| `commerce-src/checkout/page-setup.js` | checkout slot and checkout CSS |
| `commerce-src/cart/drawer.js` | cart drawer, policy links, added notice |
| `commerce-src/motifs/placement.js` | motif matching, slots, patterns, dividers, stickers |
| `commerce-src/checkout/overlay.js` | shopping CSS, show/close/open checkout |
| `commerce-src/catalog/cards.js` | product cards, card fitting |
| `commerce-src/look/contrast-guard.js` | readable-text contrast guard |
| `commerce-src/catalog/render.js` | catalog layouts, collections, `render()` |
| `commerce-src/templates/kit-templates.js` | T1 authored templates |
| `commerce-src/cart/render.js` | `renderCart()` |
| `commerce-src/contact/form.js` | `renderContact()` and contact CSS |
| `commerce-src/look/dna-css.js` | DNA button/frame/page CSS, LOOK CSS, theme CSS keys |
| `commerce-src/catalog/card-extras.js` | second photo, quick look |
| `commerce-src/checkout/shipping.js` | departments, map, shipping quotes, delivery validation |
| `commerce-src/checkout/submit.js` | `checkout()` |
| `commerce-src/shared/click-actions.js` | the document click handler (product, box, cart, checkout buttons) |
| `commerce-src/content/load.js` | `load()`, blog/reviews/bundles content, review form |
| `commerce-src/header/platform-header.js` | `initPlatformHeader()` |
| `commerce-src/shared/start.js` | contact-open trigger, first loads, IIFE close |

`kit/commerce.js` is generated and checked in, with unchanged bytes. Also modified in Group A:
- `packages/storefront-kit/package.json` (test script);
- `eslint.config.mjs` (ignore `commerce-src`);
- `.dependency-cruiser.cjs` (exclude `commerce-src`).

**Group B — source-generation.service.ts** (all new files are in `apps/api/src/storefront-source/`):

| Path | Role |
|---|---|
| `source-generation-types.ts` (new) | `SourceGenerationAttempt`, `StyleProposalResult`, `Sep5Review`, `SourceInputImage`, `GenerateExecution`, `GeneratedSource`, `AgentOutcome`, `GenerationRunFacts`, `GenerationLive` |
| `source-style-proposals.ts` (new) | `runStyleProposal`, `watchStyleDecision` |
| `source-review-runner.ts` (new) | `startBackgroundReview`, `withSavedCatalog` |
| `source-sep5-call.ts` (+ `.spec.ts`) (new) | `sep5Caller` → `{ sep5Call, touchCall }` |
| `source-save-assembly.ts` (new) | `assembleSourceSave`, `designMotifs`, `LookChoice`, `SaveAssemblyContext` |
| `source-sep5-stage.ts` (new) | `runSep5AuthorStage` |
| `source-sep5-review.ts` (new) | `createSep5Review`, `runChatKitTouch`, `REVIEW_SAVE_MARGIN_MS` |
| `source-agent-stage.ts` (new) | `runAgentStage` |

Also modified in Group B:
- `source-generation.service.ts` (shrinks to about 1,350 lines);
- `source-generation-review.spec.ts` (one added test);
- `apps/api/scripts/benchmark-source.ts` (generator digest list).

**Group C — dashboard.js** (all new files are in `apps/merchant-dashboard/`):

| Path | Role |
|---|---|
| `src/inbox-panel.mjs` | Bandeja: threads, reply, domain notice |
| `src/discounts-panel.mjs` | promo codes + bulk discount studio |
| `src/products-panel.mjs` | payment links / products list and search |
| `src/debt-links-panel.mjs` | debt collection links (Cobrar deudas) |
| `src/quick-payment-panel.mjs` | quick payment + polling |
| `src/finances-panel.mjs` | balances, settlement, international card, payouts, finance charts |
| `src/orders-panel.mjs` | orders table, filters, CSV/PDF downloads |
| `src/stores-panel.mjs` | Mi tienda list, thumbnails, Shopify import, bulk selection, current store banner/links |
| `src/inventory-import-panel.mjs` | CSV/AI inventory import |
| `src/account-panel.mjs` | Cuenta, KYC, terms, level |
| `src/profile-sessions.mjs` | profile menu, sessions, login profile picker |
| `unit/dashboard-panels.test.mjs` (new) | panels import without a DOM |
| `tests/dashboard-store-switch.spec.mjs` (new) | switching store reloads the moved screens for the new store |

Also modified in Group C:
- `src/dashboard.js` (shrinks to roughly 1,500 lines: shell, navigation, auth, `refresh()`, `api()`, glue);
- `server.mjs` (allow-list);
- `src/onboarding-walkthrough.test.mjs` (reads `stores-panel.mjs` too).

---

### Task 0: Record the green baseline

**Files:** none modified. Results go in your task notes (not the repo).

**Interfaces:** Consumes: the working tree at `e98226a0` (the three files are as at `5a206a30`). Produces: the baseline every later task compares against.

- [ ] **Step 1: Pin the three files.**

```bash
cd /Users/saramia/pagosYa
git rev-parse --short HEAD
wc -l packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-generation.service.ts apps/merchant-dashboard/src/dashboard.js
shasum -a 256 packages/storefront-kit/kit/commerce.js
git status --short
```
Expected:
- HEAD `e98226a0` (or later, with these three files unchanged);
- line counts `4491`, `1936`, `4223`;
- sha256 `e24458642f2af6eab7867b6d0b5e8c6b98ac03618ae8aa3ae9ba8e5c3d01e83e`;
- `git status` shows only the 6 `apps/api/src/store-emails/*` modifications (plus this plan, untracked until the owner commits it).

If the sha differs, commerce.js changed after this plan was written. Find every part boundary of Tasks 2–8 again by its quoted first line (`grep -nF '<first line>' packages/storefront-kit/kit/commerce.js`), and record the new sha.

- [ ] **Step 2: Kit package.**

```bash
pnpm --filter @pagosya/storefront-kit test
```
Expected: `6 storefront runtimes parsed cleanly.` then `tsc` with no output, exit 0.

- [ ] **Step 3: API type-check, lint, boundaries.**

```bash
cd /Users/saramia/pagosYa/apps/api && npx tsc -p tsconfig.json --noEmit --incremental false; echo "tsc exit $?"
cd /Users/saramia/pagosYa && npx eslint apps/api/src/storefront-source/source-generation.service.ts | tail -3
pnpm check:boundaries 2>&1 | tail -3
```
Expected:
- **tsc:** no output, `tsc exit 0` (about 45 s).
- **eslint:** `✖ 43 problems (2 errors, 41 warnings)`.
  - The 2 errors are pre-existing unused imports, `SOURCE_KIT_CSS_PATH` (line 89) and `ORDER_EMAIL_TEMPLATE_PATH` (line 91). Leave them.
  - Later tasks may lower the warnings but must not add errors.
- **boundaries:** `x 17 dependency violations (17 errors, 0 warnings)` and `‼ 14 known violations ignored`.
  - All 17 are pre-existing (`no-circular` in sketch/design-engine/checkout, plus one `no-cross-app-imports` from merchant-studio).
  - Save the full list with `pnpm check:boundaries 2>&1 | grep -E '^\s+error' > /tmp/boundaries-before.txt`. The final tasks diff against it.

- [ ] **Step 4: API specs that cover the moved code.** Run each group; record pass/fail per suite.

```bash
cd /Users/saramia/pagosYa/apps/api
# Commerce readers: every spec that reads kitPath('commerce.js') as text or in a browser.
npx jest src/storefront-source/source-commerce- src/storefront-source/source-runtime.spec.ts src/storefront-source/design-engine/header-clickable.spec.ts src/storefront-source/design-engine/sep5-review-capture.spec.ts src/storefront-source/agent/agent-scratch-preview.spec.ts --maxWorkers=2 2>&1 | tail -8
# Generation service: everything that constructs SourceGenerationService or exercises its pieces.
npx jest src/storefront-source/source-generation src/storefront-source/source-background-review.spec.ts src/storefront-source/source-interrupted-preview.spec.ts src/storefront-source/kit-touch.spec.ts src/storefront-source/source-style-proposal.spec.ts src/storefront-source/source-chat.service.spec.ts --maxWorkers=2 2>&1 | tail -8
```
Expected: measured 2026-10-15 at `5a206a30` (these counts come from the full-folder run in step 5 and must match a targeted run):
  - **Commerce readers** (about 3–4 min): `Test Suites: 2 failed, 32 passed, 34 total`, `Tests: 14 failed, 490 passed, 504 total`. All 14 failures are pre-existing:
    - `source-commerce-conversion.spec.ts`, 13 failed:
      - photo badge ×4;
      - conversion product page style ×7;
      - store name slots ×2.
    - `source-commerce-product-card.spec.ts`, 1 failed: "product card DNA in the kit guarded product theme CSS injects nothing when the value is empty, not text, too long or the store has no DNA".
  - **Generation service** (about 13 min; `source-generation-agent.spec.ts` alone takes most of it): `Test Suites: 11 passed, 11 total`, `Tests: 387 passed, 387 total`.
    - Per file: agent 43, service 94, review 27, chat 102, style 32, header 5, background-review 6, policy 11, interrupted-preview 9, kit-touch 47, style-proposal 11.

- [ ] **Step 5: Whole storefront-source folder (long; run in the background, once here and once at the end of each group).**

```bash
cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source --maxWorkers=2 --json --outputFile=/tmp/sfs-before.json > /tmp/sfs-before.log 2>&1
node -e 'const r=require("/tmp/sfs-before.json");console.log(r.numPassedTests,"passed",r.numFailedTests,"failed",r.numFailedTestSuites,"failed suites");for(const s of r.testResults)if(s.status!=="passed")console.log(s.name.split("/src/")[1])'
```
Expected: about 45 min with two workers. At `5a206a30`: 221 suites, 3,900 tests: **3,874 passed, 24 failed, 2 skipped**.
  - The one-liner prints `3874 passed 24 failed 8 failed suites`, then 10 names: the 8 failing suites and the 2 skipped tool suites (`source-templates-previews.tool.spec.ts`, `source-templates-qa.tool.spec.ts`).
  - The 8 pre-existing failing suites (24 tests). The "9 failing storefront suites" noted on 2026-10-13 are now these 8:
    - `source-validation-error.spec.ts` (1)
    - `source-product-card-presets.spec.ts` (5)
    - `product-card-distance.spec.ts` (1)
    - `source-email-direction.spec.ts` (1)
    - `source-dna.spec.ts` (1)
    - `source-commerce-conversion.spec.ts` (13)
    - `source-next-pages.spec.ts` (1)
    - `source-commerce-product-card.spec.ts` (1)
  - A suite that fails with `A jest worker process (pid=…) was terminated by another process: signal=SIGTERM` is environmental (memory pressure on this machine): rerun that suite alone. In the baseline run, `source-content-pages.spec.ts` crashed that way and then passed alone (12/12).

- [ ] **Step 6: Dashboard.**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard
node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -8
npx playwright test --workers=1 --reporter=line 2>&1 | tail -6
```
Expected:
- **unit:** `tests 217`, `pass 217`, `fail 0`.
- **playwright:** 150 tests, `149 passed, 1 skipped` (about 5 min).
  - The run reuses the owner's dashboard server on :4323. The API is mocked with `page.route`, so nothing reaches the real API.
  - **Known flaky:** `tests/merchant-workspace.spec.mjs:203` ("saved site previews refresh the real catalog …") sometimes times out on `#storeFullscreenNavHandle` in the full run. It passes when its file runs alone: `npx playwright test tests/merchant-workspace.spec.mjs --workers=1` gives `9 passed`.
  - In every later task, a failure of exactly that test counts as a pass if it passes alone.

- [ ] **Step 7: Studio kit browser specs (commerce.js in a real page).**

```bash
cd /Users/saramia/pagosYa/apps/merchant-studio
npx playwright test tests/product-page-kit.spec.ts tests/source-catalog.spec.ts tests/kit-templates.spec.ts tests/kit-no-look-baseline.spec.ts tests/commerce-parity.spec.ts tests/store-look.spec.ts 2>&1 | tail -12
```
The config starts Studio's Vite dev server on :4312 if it is not running, and reuses the checkout on :5175. Expected: `65` tests: **63 passed, 2 failed** (about 1 min). The 2 failures are the known pre-existing ones:
  - `tests/product-page-kit.spec.ts:124` ("dense page keeps photo and purchase side by side above the fold at 1280×844");
  - `tests/source-catalog.spec.ts:79` ("mobile product detail supports swipe, one photo, and sold-out products without photos").

- [ ] **Step 8: Write the baseline down.** Keep the numbers from steps 1–7 in your task notes. "Identical results" in later tasks means:
  - the same suites fail;
  - the same tests fail inside them;
  - the same pass counts.

No commit for Task 0.

## Group A — `packages/storefront-kit/kit/commerce.js`

**How commerce.js reaches a store (what must not change).** Every path below reads the file *by name* (`kitPath('commerce.js')`, or the `?raw` import of `@pagosya/storefront-kit/kit/commerce.js`). Keeping the generated file at the same path with the same bytes therefore keeps all of them identical. Never edit `kit/commerce.js` by hand.

1. **Saves (every revision).** `assembleSave` in `source-generation.service.ts` (line 1542; `source-save-assembly.ts` after Task 13) copies `build.mjs`, `server.mjs` and `commerce.js` from the kit into the saved snapshot: `readFile(kitPath(path))`. So a saved store carries the kit's commerce.js as it was at save time. Template saves do the same through `TEMPLATE_KIT_FILES` in `source-templates.ts`.
2. **Previews and publishing.** `currentSourceRuntime()` / `withSourceRuntime()` in `source-runtime.ts` read `privacy.js`, `commerce.js`, `retention.js`, `chat.js`, `video.js` and `motion.js` fresh from the kit (`currentSourceRuntimeBundle()`). They then **replace** the snapshot's `commerce.js` with `privacy.js + "\n" + commerce.js + "\n" + retention.js + "\n" + chat.js`, and `withSourceMotion` appends `video.js` + `motion.js` between `/* pagosya-motion:start */` markers. `source-publishing.service.ts` publishes that bundle (pinned by digest). This is how a published store loads "this ONE file fresh by name": the kit file is re-read on every preview and publish.
3. **Studio (browser).** `packages/storefront-preview/src/source-preview.ts` does `import commerceRuntime from '@pagosya/storefront-kit/kit/commerce.js?raw'` and swaps it into the iframe the same way (line 92). The dashboard serves a **pre-built** Studio from `apps/merchant-dashboard/public/studio` (`pnpm run build:studio`), so that copy only changes when the Studio is rebuilt.
4. **Agent sandbox and checks.** `generate()`'s agent preview base (line 1277), `source-scorecard-capture.ts`, and the specs and scripts that `readFileSync(kitPath('commerce.js'))`, about 30 API specs and `apps/merchant-dashboard/tests/merchant-workspace.spec.mjs`.

**Structure.** The file is one arrow IIFE, `(() => {` … `"use strict";` … `})();`. It has 4,491 lines and about 620 top-level statements in one shared scope, mixing hoisted `function`s, `const`/`let` state and immediate side effects (style injection, listeners, `void load()`). Order is behaviour: `const`/`let` are in their temporal dead zone until their line runs. The parts are therefore contiguous line ranges in the current order, cut only at top-level statement boundaries, each with the comment lines above it. The concatenation is byte-identical. A dry run of exactly these 31 ranges reproduced the file byte for byte (sha above).

An area that is interleaved in the file is split into several parts, for example `product/setup.js` and `product/page.js`. New code for an area goes into the part where it must run. `PARTS` order is execution order.

**The full part map (used by Tasks 2–8; lines in today's `kit/commerce.js`):**

| Part | Lines | First line (trimmed) | Last line (trimmed) |
|---|---|---|---|
| `commerce-src/shared/config-dna.js` | 1–135 (135) | `(() => {` | `});` (the line before `/* DNA motifs (sub-project 3): …`) |
| `commerce-src/motifs/drawings.js` | 136–188 (53) | `/* DNA motifs (sub-project 3): small line drawings the kit places next to the product title, in a co…` | `let motifObserver = null;` |
| `commerce-src/shared/analytics.js` | 189–264 (76) | `const hosted = window.PAGOSYA_HOSTED === true;` | `analytics('page_view');` |
| `commerce-src/shared/state.js` | 265–345 (81) | `const preview = window.PAGOSYA_PREVIEW === true && !hosted;` | `const subscriptionsAvailable = () => store?.subscriptionsEnabled === true && store?.checkoutMode === 'payment';` |
| `commerce-src/catalog/offers.js` | 346–397 (52) | `/* Memberships (spec 2026-10-09): chosen by period and joined on the trusted checkout origin, never added to the cart. */` | `}` (the line before `function cartLine(key) {`) |
| `commerce-src/cart/lines.js` | 398–522 (125) | `function cartLine(key) {` | `});` (the line before `const variantPhotos = v => …`) |
| `commerce-src/product/dialog-style.js` | 523–984 (462) | `const variantPhotos = v => (Array.isArray(v?.imageUrls) && v.imageUrls.length ? v.imageUrls : [v?.imageUrl]).map(safeUrl).filter(Boolean);` | `document.head.append(detailStyle);` |
| `commerce-src/product/setup.js` | 985–1180 (196) | `const fullProductPage = document.querySelector("[data-pagosya-product-page]");` | `}` (the line before `const simpleProduct = …`) |
| `commerce-src/product/bundles-related.js` | 1181–1273 (93) | `const simpleProduct = (item) => !item.variants?.length && !item.extras?.length;` | `}` (the line before `const assuranceIcons = {`) |
| `commerce-src/pages/policy-links.js` | 1274–1314 (41) | `const assuranceIcons = {` | `const accountUrl = () => { try { return config.slug && config.checkoutOrigin ? new URL(` … |
| `commerce-src/account/pages.js` | 1315–1485 (171) | `// The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.` | `});` (the line before `const infoText = value => …`) |
| `commerce-src/pages/standard.js` | 1486–1601 (116) | `const infoText = value => (typeof value === 'string' ? value.trim() : '');` | `});` (the line before `// Reassurance comes only from real store settings; …`) |
| `commerce-src/product/page.js` | 1602–1998 (397) | `// Reassurance comes only from real store settings; nothing here is a marketing claim.` | `});` (the line before `// Reuse an authored checkout slot; …`) |
| `commerce-src/checkout/page-setup.js` | 1999–2046 (48) | `// Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.` | `document.head.append(checkoutStyle);` |
| `commerce-src/cart/drawer.js` | 2047–2195 (149) | `// Native dialog owns modal focus, Escape and the backdrop. Authored cart markup` | `}` (the line before `/* DNA motifs: verification, slots, triggers. …`) |
| `commerce-src/motifs/placement.js` | 2196–2637 (442) | `/* DNA motifs: verification, slots, triggers. Every animation is finite, ends at rest and starts only when motion is` | `}` (the line before `const shoppingStyle = document.createElement('style');`) |
| `commerce-src/checkout/overlay.js` | 2638–2789 (152) | `const shoppingStyle = document.createElement('style');` | `}, true);` |
| `commerce-src/catalog/cards.js` | 2790–2974 (185) | `// Sold out means no units for the product or for any of its combinations; a shopper cannot choose options that cannot be bought.` | `}` (the line before `// Card text must not disappear into the card: …`) |
| `commerce-src/look/contrast-guard.js` | 2975–3160 (186) | `// Card text must not disappear into the card: switch to the store's text or background color, whichever reads.` | `}` (the line before `const catalogLayout = () => …`) |
| `commerce-src/catalog/render.js` | 3161–3303 (143) | `const catalogLayout = () => ['all', 'sections', 'page', 'tabs'].includes(store.catalogLayout) ? store.catalogLayout : 'all';` | `}` (the line before `/* T1 templates: …`) |
| `commerce-src/templates/kit-templates.js` | 3304–3416 (113) | `/* T1 templates: a store may author the markup of a kit surface. Read at use time (React may render the` | `}` (the line before `function renderCart() {`) |
| `commerce-src/cart/render.js` | 3417–3545 (129) | `function renderCart() {` | `}` (the line before `function renderContact() {`) |
| `commerce-src/contact/form.js` | 3546–3611 (66) | `function renderContact() {` | `document.head.append(contactStyle);` |
| `commerce-src/look/dna-css.js` | 3612–3927 (316) | `// Design DNA variants (sub-project 5): form becomes per store, behaviour stays platform-owned. Every` | `}` (the line before `/* Card preview listeners (DNA stores only). …`) |
| `commerce-src/catalog/card-extras.js` | 3928–4010 (83) | `/* Card preview listeners (DNA stores only). The second photo follows the photo's box; a long press previews` | `}` (the line before `// Carrier stores (shippingCarriersEnabled) …`) |
| `commerce-src/checkout/shipping.js` | 4011–4222 (212) | `// Carrier stores (shippingCarriersEnabled) need a structured Bolivian address` | `document.addEventListener('pagosya:validate-checkout', event => { if (event.detail) event.detail.valid = validateDelivery(event.detail.panel); });` |
| `commerce-src/checkout/submit.js` | 4223–4267 (45) | `async function checkout(button) {` | `}` (the line before `document.addEventListener("click", (event) => {`) |
| `commerce-src/shared/click-actions.js` | 4268–4373 (106) | `document.addEventListener("click", (event) => {` | `});` (the line before `async function load() {`) |
| `commerce-src/content/load.js` | 4374–4419 (46) | `async function load() {` | `});` (the line before `// ---- Platform header …`) |
| `commerce-src/header/platform-header.js` | 4420–4478 (59) | `// ---- Platform header (spec 2026-10-13 showcase stores and the header library) ----` | `initPlatformHeader();` |
| `commerce-src/shared/start.js` | 4479–4491 (13) | `// «Pide una cotización» in the header, and any call to action marked data-pagosya-contact-open, opens the platform contact` | `})();` |

**Carving method (Tasks 2–8).** `kit/commerce.js` keeps the same bytes throughout this group, so its line numbers never move. Each task cuts its parts straight out of it with `sed -n 'A,Bp'` and regenerates the remainder part `commerce-src/rest.js` as `sed -n 'NEXT,$p'`. Each task then updates `PARTS` and proves byte equality.

**Per-task commerce verification (used by Tasks 1–8, referred to as "the commerce check").**

```bash
cd /Users/saramia/pagosYa
node packages/storefront-kit/tools/build-commerce.mjs --check          # → "kit/commerce.js matches N commerce-src parts."
node --test packages/storefront-kit/tools/build-commerce.test.mjs      # → tests 3, pass 3, fail 0
shasum -a 256 packages/storefront-kit/kit/commerce.js                   # → the Task 0 sha
git diff --stat -- packages/storefront-kit/kit/commerce.js              # → empty (the generated file is untouched)
pnpm --filter @pagosya/storefront-kit test                             # → tests 3 pass, "6 storefront runtimes parsed cleanly.", tsc clean
cd apps/api && npx jest src/storefront-source/source-commerce- src/storefront-source/source-runtime.spec.ts src/storefront-source/design-engine/header-clickable.spec.ts src/storefront-source/design-engine/sep5-review-capture.spec.ts src/storefront-source/agent/agent-scratch-preview.spec.ts --maxWorkers=2 2>&1 | tail -8
```
Expected for the jest run: identical to Task 0 step 4 (commerce readers). The bytes are identical, so any difference means the environment changed. Stop and investigate before committing.

---

### Task 1: Build tool, equality test, and the whole runtime as one part

**Files:**
- Create: `packages/storefront-kit/tools/build-commerce.mjs`
- Create: `packages/storefront-kit/tools/build-commerce.test.mjs`
- Create: `packages/storefront-kit/commerce-src/rest.js` (a byte copy of `kit/commerce.js`)
- Modify: `packages/storefront-kit/package.json` (`scripts.test`)
- Modify: `eslint.config.mjs` (ignores)
- Modify: `.dependency-cruiser.cjs` (`options.exclude`)

**Interfaces:**
- **Consumes:** `kit/commerce.js` as it is.
- **Produces:** `PARTS: string[]`, `SOURCE_DIR`, `TARGET`, `sourceFiles(dir?) → string[]` (sorted, `/`-separated), `buildCommerce() → string`. CLI: `node packages/storefront-kit/tools/build-commerce.mjs [--check]`.

- [ ] **Step 1: Write the tool.** Create `packages/storefront-kit/tools/build-commerce.mjs`:

```js
#!/usr/bin/env node
/**
 * Builds packages/storefront-kit/kit/commerce.js, the one runtime every store loads by name, from its parts in
 * packages/storefront-kit/commerce-src/. The runtime is a single IIFE whose top-level functions and state share one
 * scope, so the parts are not modules: each is a run of whole lines of that IIFE, and the build is their plain
 * concatenation in PARTS order, byte for byte (the first part opens the IIFE, the last one closes it).
 * kit/commerce.js stays checked in because the API (kitPath('commerce.js')), the Studio (`?raw` import) and saved
 * stores all read that path. Never edit it by hand: edit a part, then run this tool.
 *
 * Usage: node packages/storefront-kit/tools/build-commerce.mjs           write kit/commerce.js
 *        node packages/storefront-kit/tools/build-commerce.mjs --check   exit 1 when kit/commerce.js differs from the parts
 */
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE_DIR = join(root, 'commerce-src');
export const TARGET = join(root, 'kit', 'commerce.js');

/** Concatenation order, which is execution order: top-level statements run in this order, and a `const`/`let` is in
 *  its temporal dead zone until its part has run. A new part goes where its code must run, not where it reads best. */
export const PARTS = [
  'rest.js',
];

/** Every .js file under commerce-src/, relative to it, with forward slashes, sorted. */
export function sourceFiles(dir = SOURCE_DIR) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => relative(dir, join(entry.parentPath ?? entry.path, entry.name)).split('\\').join('/'))
    .sort();
}

/** The runtime as the parts spell it. Throws when PARTS and the folder disagree or a part lacks its final newline. */
export function buildCommerce() {
  if (new Set(PARTS).size !== PARTS.length) throw new Error('commerce-src: a part is listed twice in PARTS');
  const files = sourceFiles();
  const unlisted = files.filter(file => !PARTS.includes(file));
  const missing = PARTS.filter(part => !files.includes(part));
  if (unlisted.length || missing.length) throw new Error(`commerce-src and PARTS disagree. Unlisted: ${unlisted.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`);
  return PARTS.map(part => {
    const text = readFileSync(join(SOURCE_DIR, part), 'utf8');
    if (!text.endsWith('\n')) throw new Error(`commerce-src/${part} must end with a newline`);
    return text;
  }).join('');
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  const built = buildCommerce();
  if (process.argv.includes('--check')) {
    if (readFileSync(TARGET, 'utf8') !== built) {
      console.error('kit/commerce.js differs from packages/storefront-kit/commerce-src. Edit the parts, then run: node packages/storefront-kit/tools/build-commerce.mjs');
      process.exit(1);
    }
    console.log(`kit/commerce.js matches ${PARTS.length} commerce-src parts.`);
  } else {
    writeFileSync(TARGET, built);
    console.log(`Wrote kit/commerce.js from ${PARTS.length} commerce-src parts.`);
  }
}
```

- [ ] **Step 2: Seed the single part.**

```bash
cd /Users/saramia/pagosYa
mkdir -p packages/storefront-kit/commerce-src
cp packages/storefront-kit/kit/commerce.js packages/storefront-kit/commerce-src/rest.js
node packages/storefront-kit/tools/build-commerce.mjs --check
```
Expected: `kit/commerce.js matches 1 commerce-src parts.`

- [ ] **Step 3: Write the equality test.** Create `packages/storefront-kit/tools/build-commerce.test.mjs`:

```js
// kit/commerce.js is generated from commerce-src/ (tools/build-commerce.mjs). These tests keep it that way.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script } from 'node:vm';
import { PARTS, TARGET, buildCommerce, sourceFiles } from './build-commerce.mjs';

test('kit/commerce.js is exactly its commerce-src parts, concatenated in PARTS order', () => {
  // assert.ok, not assert.equal: a 4,000-line diff in the failure output helps nobody.
  assert.ok(readFileSync(TARGET, 'utf8') === buildCommerce(),
    'kit/commerce.js was edited by hand or not rebuilt. Edit packages/storefront-kit/commerce-src/… and run: node packages/storefront-kit/tools/build-commerce.mjs');
});

test('every part is listed once and every listed part exists', () => {
  assert.equal(new Set(PARTS).size, PARTS.length);
  assert.deepEqual([...PARTS].sort(), sourceFiles());
});

test('the built runtime parses as one classic script', () => {
  assert.doesNotThrow(() => new Script(buildCommerce(), { filename: 'commerce.js' }));
});
```

Run: `node --test packages/storefront-kit/tools/build-commerce.test.mjs`. Expected: `tests 3`, `pass 3`, `fail 0`.

- [ ] **Step 4: Prove the test fails on a hand edit** (on the part, never on the served file).

```bash
cd /Users/saramia/pagosYa
printf '// stray\n' >> packages/storefront-kit/commerce-src/rest.js
node packages/storefront-kit/tools/build-commerce.mjs --check; echo "exit $?"
node --test packages/storefront-kit/tools/build-commerce.test.mjs 2>&1 | grep -E '^# (pass|fail)'
cp packages/storefront-kit/kit/commerce.js packages/storefront-kit/commerce-src/rest.js
node packages/storefront-kit/tools/build-commerce.mjs --check
```
Expected:
- `exit 1` with the "differs" message;
- `# pass 2` / `# fail 1`;
- after the restore, `matches 1 commerce-src parts.`

- [ ] **Step 5: Wire it into the package test.** In `packages/storefront-kit/package.json`, replace

```json
    "test": "node kit/check-runtimes.mjs && tsc -p tsconfig.json"
```
with
```json
    "test": "node --test tools/build-commerce.test.mjs && node kit/check-runtimes.mjs && tsc -p tsconfig.json"
```
`check-runtimes.mjs` scans only `kit/`, so the parts (which mostly do not parse alone) are never fed to it. CI runs this through `pnpm test` → `pnpm -r run test`.

- [ ] **Step 6: Keep lint and the boundary check off the parts.** They are fragments of one IIFE. 29 of the 31 happen to parse alone, but every cross-part name would fail `no-undef`, and the first and last parts do not parse alone.
  - In `eslint.config.mjs`, in the first config object's `ignores` array, add one line right after `"packages/storefront-kit/kit/**",`:

```js
      "packages/storefront-kit/commerce-src/**",
```
  - In `.dependency-cruiser.cjs`, replace the `exclude` line

```js
    exclude: { path: '(^|/)(node_modules|dist|build|test-results|graphify-out|\\.next|\\.wrangler)/|^apps/merchant-dashboard/public/studio/' },
```
with
```js
    exclude: { path: '(^|/)(node_modules|dist|build|test-results|graphify-out|\\.next|\\.wrangler)/|^apps/merchant-dashboard/public/studio/|^packages/storefront-kit/commerce-src/' },
```

- [ ] **Step 7: Verify.** Run the commerce check (above), then:

```bash
cd /Users/saramia/pagosYa
npx eslint packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/tools/build-commerce.test.mjs packages/storefront-kit/commerce-src/rest.js
pnpm check:boundaries 2>&1 | grep -E '^\s+error' | diff /tmp/boundaries-before.txt - && echo "boundaries unchanged"
```
Expected:
- **eslint:** no errors. `rest.js` reports "File ignored because of a matching ignore pattern" as a warning, which is fine.
- **boundaries:** `boundaries unchanged`.
- **commerce check:** `matches 1 commerce-src parts.`, 3/3 tests, the Task 0 sha, jest identical to Task 0.

- [ ] **Step 8: Commit.**

```bash
cd /Users/saramia/pagosYa
git add packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/tools/build-commerce.test.mjs packages/storefront-kit/commerce-src/rest.js packages/storefront-kit/package.json eslint.config.mjs .dependency-cruiser.cjs
git status --short
git commit -m "refactor(storefront-kit): build kit/commerce.js from commerce-src parts (one part for now)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the shared foundation (config/DNA, motif drawings, analytics, state, offers, cart lines)

**Files:**
- Create:
  - `packages/storefront-kit/commerce-src/shared/config-dna.js` (lines 1–135)
  - `packages/storefront-kit/commerce-src/motifs/drawings.js` (136–188)
  - `packages/storefront-kit/commerce-src/shared/analytics.js` (189–264)
  - `packages/storefront-kit/commerce-src/shared/state.js` (265–345)
  - `packages/storefront-kit/commerce-src/catalog/offers.js` (346–397)
  - `packages/storefront-kit/commerce-src/cart/lines.js` (398–522)
- Modify:
  - `packages/storefront-kit/commerce-src/rest.js` (becomes 523–4491)
  - `packages/storefront-kit/tools/build-commerce.mjs` (`PARTS`)

**Interfaces:**
- **Consumes:** none.
- **Produces:** no JS interface. The top-level names keep their scope:
  - `config`, `DNA_VALUES`, `MOTION_*`, `hasDna`, `COMMERCE_DNA`, `LOOK`, `lookFilters`, `CHECKOUT_PHOTO`, `CART_WORD`;
  - `MOTIF_*`, `parseMotifDrawing`, `motifDrawing`, `AI_MOTIFS`, `MOTIF_PACK`, `PACK_MOTIFS`, `MOTIFS`, `packMotif`, `motifObserver`;
  - `hosted`, `track`, `analytics`, `cardProductId`, `observeCards`;
  - `preview`, `request`, `store`, `ready`, `category`, `checkingOut`, `cart`, `partnerCode`, `escape`, `secureFields`, `responsiveSrcset`, `money`, `products`, `price`, `optionGroups`, `lineKey`, `subscriptionsAvailable`;
  - the membership/cadence/box helpers;
  - `cartLine`, `remaining`, `cartItems`, `message`, `restoreCart`, the hosted cart sync and its `pagosya:*` events.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 1 136 189 265 346 398 523; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-90; done
```
Expected, in order: `(() => {`, `  /* DNA motifs (sub-project 3): small line drawings…`, `  const hosted = window.PAGOSYA_HOSTED === true;`, `  const preview = window.PAGOSYA_PREVIEW === true && !hosted;`, `  /* Memberships (spec 2026-10-09): …`, `  function cartLine(key) {`, `  const variantPhotos = v => …`.

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/shared $S/motifs $S/catalog $S/cart
sed -n '1,135p'   $K/kit/commerce.js > $S/shared/config-dna.js
sed -n '136,188p' $K/kit/commerce.js > $S/motifs/drawings.js
sed -n '189,264p' $K/kit/commerce.js > $S/shared/analytics.js
sed -n '265,345p' $K/kit/commerce.js > $S/shared/state.js
sed -n '346,397p' $K/kit/commerce.js > $S/catalog/offers.js
sed -n '398,522p' $K/kit/commerce.js > $S/cart/lines.js
sed -n '523,$p'   $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** In `build-commerce.mjs`, replace the `PARTS` array with:

```js
export const PARTS = [
  'shared/config-dna.js',
  'motifs/drawings.js',
  'shared/analytics.js',
  'shared/state.js',
  'catalog/offers.js',
  'cart/lines.js',
  'rest.js',
];
```

- [ ] **Step 4: Verify.** Run the commerce check. Expected: `kit/commerce.js matches 7 commerce-src parts.`; tests 3/3; the Task 0 sha; empty `git diff` on `kit/commerce.js`; jest identical to Task 0.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/shared/config-dna.js $S/motifs/drawings.js $S/shared/analytics.js $S/shared/state.js $S/catalog/offers.js $S/cart/lines.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src shared foundation, motif drawings, analytics, offers and cart lines" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Extract the product dialog styles, product setup and bundles/related

**Files:**
- Create:
  - `commerce-src/product/dialog-style.js` (523–984): `variantPhotos`, `galleryImages`, `imagePosition`, then the `detailStyle` CSS through `document.head.append(detailStyle);`
  - `commerce-src/product/setup.js` (985–1180)
  - `commerce-src/product/bundles-related.js` (1181–1273)
- Modify: `commerce-src/rest.js` (→ 1274–4491), `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** names from the Task 2 parts (`config`, `escape`, `safeUrl`, `products`, `optionGroups`, …), which are in scope because the parts concatenate into one IIFE.
- **Produces:**
  - `detailStyle`, `fullProductPage`, `fullCheckoutPage`, `fullCatalogPage`, `collectionPage`, `rootPath`, `pageHref`, `detail`;
  - `releaseProductPageStyles`, `selectedProduct`/`selectedOptions`/`selectedQuantity`/`selectedPicks`;
  - `priceMarkup`, `productBadge`, `subscriptionChoice`, `updateQuantity`, `decorateProductReviews`, `commerceData`;
  - `productHref`, `bundleOffersMarkup`, `cartSuggestionsMarkup`, `relatedMarkup`, `updateStickyBar`, `watchHighlights`, `optionPrices`.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 523 984 985 1181 1274; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-90; done
```
Expected:
- 523 `  const variantPhotos = v => …`
- 984 `  document.head.append(detailStyle);`
- 985 `  const fullProductPage = document.querySelector("[data-pagosya-product-page]");`
- 1181 `  const simpleProduct = (item) => …`
- 1274 `  const assuranceIcons = {`

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/product
sed -n '523,984p'   $K/kit/commerce.js > $S/product/dialog-style.js
sed -n '985,1180p'  $K/kit/commerce.js > $S/product/setup.js
sed -n '1181,1273p' $K/kit/commerce.js > $S/product/bundles-related.js
sed -n '1274,$p'    $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** Insert after `'cart/lines.js',` (before `'rest.js'`):

```js
  'product/dialog-style.js',
  'product/setup.js',
  'product/bundles-related.js',
```

- [ ] **Step 4: Verify.** Run the commerce check. Expected: `matches 10 commerce-src parts.`, tests 3/3, sha unchanged, jest identical.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/product/dialog-style.js $S/product/setup.js $S/product/bundles-related.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src product dialog styles, product setup, bundles and related" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Extract the store pages (policy links, account pages, standard pages)

**Files:**
- Create:
  - `commerce-src/pages/policy-links.js` (1274–1314): `assuranceIcons` through `const accountUrl = …`
  - `commerce-src/account/pages.js` (1315–1485): the account gates and views through the `document.addEventListener('click', …)` that ends the block
  - `commerce-src/pages/standard.js` (1486–1601): `infoText` through the policy dialog click listener
- Modify: `commerce-src/rest.js` (→ 1602–4491), `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** foundation and product parts.
- **Produces:**
  - `POLICY_TITLES`, `storePolicies`, `policyLinks`, `INFO_LINKS`, `SHOWCASE`, `accountUrl`;
  - `renderAccountGateLinks`, `ACCOUNT_*`, `accountForm`, `renderAccountViews`, `renderAccountGates`;
  - `infoText`, `faqBody`, `collectionsBody`, `searchBody`, `COOKIES_BODY`, `infoBody`, `setNoindex`, `renderInfoPages`, `openPolicy`.

  The store-voice spec's "standard pages" work (`commerce.js:1502-1576`) lands in `pages/standard.js`.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 1274 1314 1315 1486 1602; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-100; done
```
Expected:
- 1274 `  const assuranceIcons = {`
- 1314 `  const accountUrl = () => { try { …`
- 1315 `  // The gate pages (components/auth, components/account) only point at the trusted account app; this fills in where.`
- 1486 `  const infoText = value => …`
- 1602 `  // Reassurance comes only from real store settings; nothing here is a marketing claim.`

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/pages $S/account
sed -n '1274,1314p' $K/kit/commerce.js > $S/pages/policy-links.js
sed -n '1315,1485p' $K/kit/commerce.js > $S/account/pages.js
sed -n '1486,1601p' $K/kit/commerce.js > $S/pages/standard.js
sed -n '1602,$p'    $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** Insert after `'product/bundles-related.js',`:

```js
  'pages/policy-links.js',
  'account/pages.js',
  'pages/standard.js',
```

- [ ] **Step 4: Verify.** Commerce check. Expected: `matches 13 commerce-src parts.`, 3/3, sha unchanged, jest identical.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/pages/policy-links.js $S/account/pages.js $S/pages/standard.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src policy links, account pages and standard pages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Extract the product page, the checkout page setup and the cart drawer

**Files:**
- Create:
  - `commerce-src/product/page.js` (1602–1998): `deliveryMarkup` … `openProduct` … `productInformation`, `selectProductTab`, and the `detail` listeners through `detail.addEventListener('input', …)`
  - `commerce-src/checkout/page-setup.js` (1999–2046): checkout slot + `checkoutStyle`
  - `commerce-src/cart/drawer.js` (2047–2195): `dialog[data-pagosya-cart]` handling, `CART_TRIGGERS`, `cartDrawer`, `renderPolicyLinks`, `openCart`, `restoreDrawer`, `addedNotice`, `placeAddedNotice`, `addedFeedback`
- Modify: `commerce-src/rest.js` (→ 2196–4491), `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** earlier parts.
- **Produces:** `openProduct`, `galleryMarkup`, `highlightsMarkup`, `contentBlocksMarkup`, `longPageTop`/`Bottom`, `productInformation`, `checkoutPage`, `checkoutStyle`, `cartDrawer`, `openCart`, `renderPolicyLinks`, `addedFeedback`.

  The store-controls spec's runtime pieces split this way: drawer close and cart badge state in `cart/drawer.js`, steppers in `product/page.js`.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 1602 1999 2047 2196; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-100; done
```
Expected:
- 1602 `  // Reassurance comes only …`
- 1999 `  // Reuse an authored checkout slot; never leave an empty fixed overlay over the shop.`
- 2047 `  // Native dialog owns modal focus, Escape and the backdrop. Authored cart markup`
- 2196 `  /* DNA motifs: verification, slots, triggers. …`

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/checkout
sed -n '1602,1998p' $K/kit/commerce.js > $S/product/page.js
sed -n '1999,2046p' $K/kit/commerce.js > $S/checkout/page-setup.js
sed -n '2047,2195p' $K/kit/commerce.js > $S/cart/drawer.js
sed -n '2196,$p'    $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** Insert after `'pages/standard.js',`:

```js
  'product/page.js',
  'checkout/page-setup.js',
  'cart/drawer.js',
```

- [ ] **Step 4: Verify.** Commerce check. Expected: `matches 16 commerce-src parts.`, 3/3, sha unchanged, jest identical.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/product/page.js $S/checkout/page-setup.js $S/cart/drawer.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src product page, checkout page setup and cart drawer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Extract motif placement, the checkout overlay, catalog cards and the contrast guard

**Files:**
- Create:
  - `commerce-src/motifs/placement.js` (2196–2637): from `/* DNA motifs: verification, slots, triggers. …` through the `if (PACK_MOTIFS.length) { … }` block before `const shoppingStyle`
  - `commerce-src/checkout/overlay.js` (2638–2789): `shoppingStyle` … `showCheckout`/`closeCheckout`/`openCheckout` … the `click`/`auxclick` capture listener ending `}, true);`
  - `commerce-src/catalog/cards.js` (2790–2974): `soldOut` … `customProductCard` … `fitCards` … `structureCatalog`
  - `commerce-src/look/contrast-guard.js` (2975–3160): `CONTRAST_SLOTS` … `guardContrast` … the `MutationObserver` block
- Modify: `commerce-src/rest.js` (→ 3161–4491), `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** earlier parts.
- **Produces:** `placeIdentityMotifs`, `placeProductMotif`, `placeCardMotifs`, `playMotifs`, `placeEmptyMotif`, `showCheckout`, `closeCheckout`, `openCheckout`, `soldOut`, `cardMode`, `productCard`, `fitCards`, `structureCatalog`, `readableText`, `guardContrast`, `queueReadableText`.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 2196 2638 2789 2790 2975 3161; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-100; done
```
Expected:
- 2196 `  /* DNA motifs: verification, …`
- 2638 `  const shoppingStyle = document.createElement('style');`
- 2789 `  }, true);`
- 2790 `  // Sold out means no units …`
- 2975 `  // Card text must not disappear into the card: …`
- 3161 `  const catalogLayout = () => …`

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/look
sed -n '2196,2637p' $K/kit/commerce.js > $S/motifs/placement.js
sed -n '2638,2789p' $K/kit/commerce.js > $S/checkout/overlay.js
sed -n '2790,2974p' $K/kit/commerce.js > $S/catalog/cards.js
sed -n '2975,3160p' $K/kit/commerce.js > $S/look/contrast-guard.js
sed -n '3161,$p'    $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** Insert after `'cart/drawer.js',`:

```js
  'motifs/placement.js',
  'checkout/overlay.js',
  'catalog/cards.js',
  'look/contrast-guard.js',
```

- [ ] **Step 4: Verify.** Commerce check. Expected: `matches 20 commerce-src parts.`, 3/3, sha unchanged, jest identical.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/motifs/placement.js $S/checkout/overlay.js $S/catalog/cards.js $S/look/contrast-guard.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src motif placement, checkout overlay, catalog cards and contrast guard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Extract catalog rendering, kit templates, the cart render and the contact form

**Files:**
- Create:
  - `commerce-src/catalog/render.js` (3161–3303): `catalogLayout`, `collections`, `collectionGroups`, `catalogTabs`, `markKitParts`, `render()`
  - `commerce-src/templates/kit-templates.js` (3304–3416): `kitTemplate`, the added/cart-line/cart/review/product-page templates, `applyProductPageTemplate`
  - `commerce-src/cart/render.js` (3417–3545): `renderCart()`
  - `commerce-src/contact/form.js` (3546–3611): `renderContact()` + `contactStyle`
- Modify: `commerce-src/rest.js` (→ 3612–4491), `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** earlier parts.
- **Produces:** `render`, `markKitParts`, `kitTemplate`, `applyLineTemplate`, `applyCartTemplate`, `applyProductPageTemplate`, `renderCart`, `renderContact`.

  The business-tools spec's "kit widget mount from config" and the contact/leads work land next to `contact/form.js` (a new part goes where its code must run).

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 3161 3304 3417 3546 3612; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-100; done
```
Expected:
- 3161 `  const catalogLayout = …`
- 3304 `  /* T1 templates: …`
- 3417 `  function renderCart() {`
- 3546 `  function renderContact() {`
- 3612 `  // Design DNA variants (sub-project 5): …`

- [ ] **Step 2: Carve.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/templates $S/contact
sed -n '3161,3303p' $K/kit/commerce.js > $S/catalog/render.js
sed -n '3304,3416p' $K/kit/commerce.js > $S/templates/kit-templates.js
sed -n '3417,3545p' $K/kit/commerce.js > $S/cart/render.js
sed -n '3546,3611p' $K/kit/commerce.js > $S/contact/form.js
sed -n '3612,$p'    $K/kit/commerce.js > $S/rest.js
```

- [ ] **Step 3: Set `PARTS`.** Insert after `'look/contrast-guard.js',`:

```js
  'catalog/render.js',
  'templates/kit-templates.js',
  'cart/render.js',
  'contact/form.js',
```

- [ ] **Step 4: Verify.** Commerce check. Expected: `matches 24 commerce-src parts.`, 3/3, sha unchanged, jest identical.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/catalog/render.js $S/templates/kit-templates.js $S/cart/render.js $S/contact/form.js $S/rest.js packages/storefront-kit/tools/build-commerce.mjs
git commit -m "refactor(storefront-kit): commerce-src catalog render, kit templates, cart render and contact form" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Extract the rest (DNA/look CSS, card extras, shipping, checkout, click actions, content, header, start) and drop `rest.js`

**Files:**
- Create:
  - `commerce-src/look/dna-css.js` (3612–3927): `KIT_BUTTONS` … `DNA_CSS`, `PRODUCT_CARD_CSS`, `COMMERCE_DRAW_CSS`, `DNA_PAGE_CSS`, `LOOK_*_CSS`, the `if (hasDna)` / `if (LOOK)` style injection, `THEME_CSS_KEYS`
  - `commerce-src/catalog/card-extras.js` (3928–4010): `loadCardAlt`, `syncCardAlt`, `placeQuickLook`, the DNA card preview listeners
  - `commerce-src/checkout/shipping.js` (4011–4222): `DEPARTMENTS` … `mountDestinationMap` … `validateDelivery` + the `pagosya:validate-checkout` listener
  - `commerce-src/checkout/submit.js` (4223–4267): `checkout(button)`
  - `commerce-src/shared/click-actions.js` (4268–4373): the document `click` handler
  - `commerce-src/content/load.js` (4374–4419): `load()`, `loadCommerceContent()`, the review form
  - `commerce-src/header/platform-header.js` (4420–4478): `initPlatformHeader()` and its call
  - `commerce-src/shared/start.js` (4479–4491): the contact-open trigger, `void loadCommerceContent(); void load();`, and `})();`
- Delete: `commerce-src/rest.js`.
- Modify: `tools/build-commerce.mjs`.

**Interfaces:**
- **Consumes:** earlier parts.
- **Produces:** `DNA_CSS` and its siblings, `checkout`, `validateDelivery`, `load`, `loadCommerceContent`, `initPlatformHeader`. The store-controls runtime CSS lands in `look/dna-css.js`; header behaviour lands in `header/platform-header.js`.

- [ ] **Step 1: Check the anchors.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit
for n in 3612 3928 4011 4222 4223 4268 4374 4420 4478 4479 4491; do printf '%5s  ' $n; sed -n "${n}p" $K/kit/commerce.js | cut -c1-100; done
```
Expected:
- 3612 `  // Design DNA variants …`
- 3928 `  /* Card preview listeners (DNA stores only). …`
- 4011 `  // Carrier stores (shippingCarriersEnabled) need a structured Bolivian address`
- 4222 `  document.addEventListener('pagosya:validate-checkout', …`
- 4223 `  async function checkout(button) {`
- 4268 `  document.addEventListener("click", (event) => {`
- 4374 `  async function load() {`
- 4420 `  // ---- Platform header …`
- 4478 `  initPlatformHeader();`
- 4479 `  // «Pide una cotización» …`
- 4491 `})();`

- [ ] **Step 2: Carve and drop the remainder.**

```bash
cd /Users/saramia/pagosYa && K=packages/storefront-kit && S=$K/commerce-src
mkdir -p $S/content $S/header
sed -n '3612,3927p' $K/kit/commerce.js > $S/look/dna-css.js
sed -n '3928,4010p' $K/kit/commerce.js > $S/catalog/card-extras.js
sed -n '4011,4222p' $K/kit/commerce.js > $S/checkout/shipping.js
sed -n '4223,4267p' $K/kit/commerce.js > $S/checkout/submit.js
sed -n '4268,4373p' $K/kit/commerce.js > $S/shared/click-actions.js
sed -n '4374,4419p' $K/kit/commerce.js > $S/content/load.js
sed -n '4420,4478p' $K/kit/commerce.js > $S/header/platform-header.js
sed -n '4479,4491p' $K/kit/commerce.js > $S/shared/start.js
git rm -q $S/rest.js
```

- [ ] **Step 3: Set the final `PARTS`.** Replace the whole array with:

```js
export const PARTS = [
  'shared/config-dna.js',
  'motifs/drawings.js',
  'shared/analytics.js',
  'shared/state.js',
  'catalog/offers.js',
  'cart/lines.js',
  'product/dialog-style.js',
  'product/setup.js',
  'product/bundles-related.js',
  'pages/policy-links.js',
  'account/pages.js',
  'pages/standard.js',
  'product/page.js',
  'checkout/page-setup.js',
  'cart/drawer.js',
  'motifs/placement.js',
  'checkout/overlay.js',
  'catalog/cards.js',
  'look/contrast-guard.js',
  'catalog/render.js',
  'templates/kit-templates.js',
  'cart/render.js',
  'contact/form.js',
  'look/dna-css.js',
  'catalog/card-extras.js',
  'checkout/shipping.js',
  'checkout/submit.js',
  'shared/click-actions.js',
  'content/load.js',
  'header/platform-header.js',
  'shared/start.js',
];
```

- [ ] **Step 4: Verify.** Run the commerce check, then:

```bash
cd /Users/saramia/pagosYa
ls -R packages/storefront-kit/commerce-src | grep -c '\.js$'      # → 31
cat $(node --input-type=module -e "const m = await import('/Users/saramia/pagosYa/packages/storefront-kit/tools/build-commerce.mjs'); console.log(m.PARTS.map(p => 'packages/storefront-kit/commerce-src/' + p).join(' '))") | shasum -a 256
```
Expected:
- `matches 31 commerce-src parts.`; 3/3; the Task 0 sha from both `shasum` commands (the file and the plain `cat` of the parts);
- `git diff -- packages/storefront-kit/kit/commerce.js` empty;
- jest identical to Task 0.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && S=packages/storefront-kit/commerce-src
git add $S/look/dna-css.js $S/catalog/card-extras.js $S/checkout/shipping.js $S/checkout/submit.js $S/shared/click-actions.js $S/content/load.js $S/header/platform-header.js $S/shared/start.js packages/storefront-kit/tools/build-commerce.mjs
git status --short   # rest.js shows as "D " (staged by git rm)
git commit -m "refactor(storefront-kit): commerce-src DNA/look CSS, card extras, shipping, checkout, click actions, content, header; no remainder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rebuild the embedded Studio and close Group A

**Files:** none in git. `apps/merchant-dashboard/public/studio/` is git-ignored build output.

**Interfaces:**
- **Consumes:** `kit/commerce.js` (generated, unchanged bytes).
- **Produces:** a freshly built Studio for the owner's dashboard.

- [ ] **Step 1: Rebuild the Studio the dashboard serves.**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && pnpm run build:studio 2>&1 | tail -5
grep -l "pagosya-product-options:v1" public/studio/assets/*.js | head -3
```
Expected:
- the Vite build ends with `✓ built in …`;
- `grep` prints at least one `public/studio/assets/*.js`: the `?raw` runtime is in the bundle;
- a Studio reload in the browser shows the same store previews as before.

- [ ] **Step 2: Studio kit browser specs.** Rerun Task 0 step 7. Expected: identical to the Task 0 result.

- [ ] **Step 3: Whole storefront-source folder.** Rerun Task 0 step 5 with `--outputFile=/tmp/sfs-after-a.json`. Expected: the same failing suites and tests as `/tmp/sfs-before.json`.

```bash
node -e 'const a=require("/tmp/sfs-before.json"),b=require("/tmp/sfs-after-a.json");const f=r=>r.testResults.flatMap(s=>s.assertionResults.filter(t=>t.status==="failed").map(t=>s.name.split("/src/")[1]+" › "+t.fullName)).sort();console.log(JSON.stringify(f(a))===JSON.stringify(f(b))?"same failures":"DIFFERENT",a.numPassedTests,b.numPassedTests)'
```

- [ ] **Step 4: Dashboard specs that read the kit.** Run:

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && npx playwright test tests/merchant-workspace.spec.mjs --workers=1
```
Expected: `9 passed`.

No commit (no tracked file changed).

## Group B — `apps/api/src/storefront-source/source-generation.service.ts`

**Shape today.**
- The file opens with 128 import lines.
- Lines 130–138 hold the types `StyleProposalResult`, `SourceGenerationAttempt` and `Sep5Review`, and the constant `REVIEW_SAVE_MARGIN_MS`.
- `@Injectable() class SourceGenerationService` starts at 149. Its constructor (151) takes `prisma, publicStores, projects, uploads, config, brands?, metering?, designPlanner, rewards?, emailKits?, pageWriter?`.
- `generate()` runs 308–1692, about 1,385 lines. Its locals are shared by closures:
  - `acceptCandidate` (777);
  - `sep5Call` / `touchCall` (901 / 930);
  - the Sep-5 author branch (938–1065), with its review closure (1003–1063);
  - the sketch branches (1066–1265);
  - the agent branch (1266–1391);
  - the single-call loop (1392–1510);
  - `assembleSave` (1518–1604);
  - the chat kit touch (1605–1625).
- The private helpers `withSavedCatalog` (1695), `startSep5Review` (1715), `proposeStyles` (1777) and `watchStyleDecision` (1922) take explicit input.

**What stays on the class.** The public surface and Nest DI:
- **Constructor:** unchanged.
- **Public methods:** `catalog`, `newBudget`, `usesChatGptPlan`, `interruptedPreview`, `estimate`, `usage`, `cancelReview`, `reviewPending`, `reviewSettled`, `generate`.
- **Protected seams the specs and the benchmark subclass use:** `stylePickPollMs`, `pickHeroWaitMs`, `reviewHeartbeatMs`, `exploreDesign`, `composeUi`, `narrativePlanning`.
- **Private helpers:** `coverWithRewardCredits`, `ownedProductPhotos`, `bundleAuthoredUploads`. `proposeStyles` and `startSep5Review` stay as thin private wrappers, so `generate()`'s call sites are unchanged.
- **Re-exports:** `StyleProposalResult` and `SourceGenerationAttempt` are re-exported from the service (`source-chat.service.ts` imports `StyleProposalResult` from it).

**Out of scope (left in `generate()` for a later pass):**
- `acceptCandidate`;
- the two sketch branches;
- the single-call attempt loop;
- the run setup before the design stage.

**Context objects (introduced in Task 13).**
- `facts: GenerationRunFacts` holds the run's fixed values. Every field is a `const` (or a parameter never reassigned after line 411) by the time it is built. Stages may destructure it.
- `live: GenerationLive` is an object of getters and setters onto `generate()`'s `let` locals. A stage reads and writes `live.x`, which reads and writes the real local, so nothing goes stale.
  - **Rule:** never destructure `live`, never store `live.x` in a variable that outlives a single synchronous step, and never pass `live.x` where the callee may run later.
- Each stage declares the exact fields it uses with `Pick<…>` types, so its inputs are explicit and checked by the compiler.

**The generation suite (used by every task in this group).**

```bash
cd /Users/saramia/pagosYa/apps/api
npx tsc -p tsconfig.json --noEmit --incremental false; echo "tsc exit $?"            # → no output, exit 0
npx jest src/storefront-source/source-generation src/storefront-source/source-background-review.spec.ts src/storefront-source/source-interrupted-preview.spec.ts src/storefront-source/kit-touch.spec.ts src/storefront-source/source-style-proposal.spec.ts src/storefront-source/source-chat.service.spec.ts --maxWorkers=2 2>&1 | tail -8
cd /Users/saramia/pagosYa && npx eslint apps/api/src/storefront-source/source-generation.service.ts <the task's new files> | tail -3
pnpm check:boundaries 2>&1 | grep -E '^\s+error' | diff /tmp/boundaries-before.txt - && echo "boundaries unchanged"
```
Expected:
- **jest:** identical to Task 0 step 4 (generation service), plus any test the task adds.
- **eslint:** errors only the two pre-existing ones in the service (`SOURCE_KIT_CSS_PATH`, `ORDER_EMAIL_TEMPLATE_PATH`) and **0 errors** in the new files. `no-explicit-any` / `no-unnecessary-type-assertion` warnings carried over with moved code are fine.
- **boundaries:** `boundaries unchanged`. A new `no-circular` means a new module imports `./source-generation.service`; it must import `./source-generation-types` instead.

---

### Task 10: Move the shared types and the style proposals out of the service

**Files:**
- Create: `apps/api/src/storefront-source/source-generation-types.ts`
- Create: `apps/api/src/storefront-source/source-style-proposals.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **Consumes:** the prisma, metering and logger instances, and the two timing fields, from the service.
- **Produces:**
  - `source-generation-types.ts`: `StyleProposalResult`, `SourceGenerationAttempt`.
  - `source-style-proposals.ts`:
    - `type StyleProposalDeps = { prisma: PrismaService; metering?: AiUsageService; logger: Logger; stylePickPollMs: number; pickHeroWaitMs: number }`
    - `type ProposeStylesInput` (today's inline parameter type of `proposeStyles`)
    - `runStyleProposal(deps: StyleProposalDeps, input: ProposeStylesInput): Promise<StyleProposalResult | { design?: SourceDesign }>`
    - `watchStyleDecision(deps: Pick<StyleProposalDeps, 'prisma' | 'stylePickPollMs'>, runId: string, stop: AbortSignal): Promise<StyleDecision | null>`

- [ ] **Step 1: Run the generation suite** and confirm it matches Task 0 (it must start from the same place).

- [ ] **Step 2: Create `source-generation-types.ts`:**

```ts
import type { SourceModel, sourceUsage } from './source-generation-policy';

// Types shared by SourceGenerationService and the modules split out of generate() (2026-10-15). This module imports
// types only and must never import the service: the service re-exports what its importers already use.

/** What a proposal-mode generate returns: the run now waits for the merchant to pick a card. */
export type StyleProposalResult = { styleProposal: { generationId: string; cards: number } };
/** One provider call of a run (or of its background review), as the row's attempts record it. */
export type SourceGenerationAttempt = { model: SourceModel; phase?: 'design' | 'source' | 'agent' | 'visual' | 'sketch' | 'composition' | 'brand' | 'creative' | 'critic' | 'author' | 'review' | 'touch'; durationMs: number; status: string; usage: ReturnType<typeof sourceUsage>; responseStatus?: string; incompleteReason?: string; reasoningTokens?: number; reasoningEffort?: string; failureReason?: string; tools?: string[]; diagnostics?: Array<{ tool: string; digest: string; durationMs: number; output: string }> };
```

- [ ] **Step 3: Create `source-style-proposals.ts`.** The header:

```ts
import { ConflictException, type Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiUsageService } from '../ai-usage/ai-usage.service';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceImageUse } from './source-setup';
import { styleSlotDirection, type StyleSlot } from './design-engine/style-draws';
import type { SourceDesign, SourceDesignConcept } from './source-design';
import { numbersIn, templateHero, writeStyleHero, type HeroFacts } from './design-engine/style-hero';
import type { SourceModel } from './source-generation-policy';
import type { SourceRequestBudget } from './source-request-budget';
import type { DesignPlanningAttempt } from './source-design-planner';
import { styleDecision, type StyleDecision, type StyleProposal, type StyleProposalStatus } from './source-style-proposal';
import { distinctBoldDisplay, distinctBoldDisplays, styleOpeningKey, styleRecommendation } from './source-style-design';
import { retryProviderRejection } from './source-provider-error';
import { completedCredits } from './source-generation-run';
import type { StyleProposalResult } from './source-generation-types';

/** What a style proposal needs from SourceGenerationService. The service builds it when the proposal starts, so the two
 *  timings are the instance's at that moment (the specs shorten them on the instance). */
export type StyleProposalDeps = { prisma: PrismaService; metering?: AiUsageService; logger: Logger; stylePickPollMs: number; pickHeroWaitMs: number };
export type ProposeStylesInput = { runId: string; storeId: string; dto: GenerateSourceProjectDto; imageUses: SourceImageUse[]; redesign: boolean; styleSlots: Array<StyleSlot & { playbook: string }>; plan: (slot: StyleSlot & { playbook: string }) => Promise<SourceDesign>; boldAsked: boolean; assetLegend: Array<{ original: string; path: string }>; storeName: string; logoUrl: string | null; brandPalette?: HeroFacts['palette']; model: SourceModel; provider: { endpoint: string; name: string }; apiKey: string; budget: SourceRequestBudget; signal: AbortSignal; attempts: DesignPlanningAttempt[]; started: number; freeRun: boolean; maxCredits: number; onPickable?: (result: StyleProposalResult) => void };
```

Then move, as module functions:
- **The doc comment and body of `proposeStyles`**: from `  /**` + `   * Elige tu estilo in two lanes (spec 2026-10-11, amendments "four parallel lanes" and "two cards"): …` (line 1770) through the method's closing `  }` (line 1919, right after `    return { styleProposal: { generationId: input.runId, cards: live().length } };`).
  - Give it the signature `export async function runStyleProposal(deps: StyleProposalDeps, input: ProposeStylesInput): Promise<StyleProposalResult | { design?: SourceDesign }> {`.
  - Dedent the body by two spaces.
- **`watchStyleDecision`**: its doc comment (line 1921, `  /** Reads the run's own row every stylePickPollMs …`) through its closing `  }` (line 1935).
  - Give it the signature `export async function watchStyleDecision(deps: Pick<StyleProposalDeps, 'prisma' | 'stylePickPollMs'>, runId: string, stop: AbortSignal): Promise<StyleDecision | null> {`.

The only edits inside the moved bodies:

| Original | Becomes |
|---|---|
| `this.prisma` (lines 1814, 1896, 1915, 1930) | `deps.prisma` |
| `this.metering` (1844) | `deps.metering` |
| `this.logger` (1836, 1850, 1910) | `deps.logger` |
| `this.pickHeroWaitMs` (1905) | `deps.pickHeroWaitMs` |
| `this.stylePickPollMs` (1926) | `deps.stylePickPollMs` |
| `this.watchStyleDecision(input.runId, watch.signal)` (1887) | `watchStyleDecision(deps, input.runId, watch.signal)` |

Check: `grep -n 'this\.' apps/api/src/storefront-source/source-style-proposals.ts` must print nothing.

- [ ] **Step 4: Edit the service.**
  1. Delete lines 130–133 (the `StyleProposalResult` and `SourceGenerationAttempt` comments and types).
  2. After the last import (line 128, `import { sourceMarqueeEditPaths, validateGeneratedSource } from './source-generation-checks';`) add:

```ts
import type { SourceGenerationAttempt, StyleProposalResult } from './source-generation-types';
import { runStyleProposal, type ProposeStylesInput } from './source-style-proposals';
export type { SourceGenerationAttempt, StyleProposalResult } from './source-generation-types';
```
  3. Replace the whole `proposeStyles` method (its doc comment through its closing brace) and the whole `watchStyleDecision` method (doc comment through closing brace) with:

```ts
  /** Elige tu estilo in two lanes (source-style-proposals.ts). The timings are read from this instance when it starts. */
  private proposeStyles(input: ProposeStylesInput) {
    return runStyleProposal({ prisma: this.prisma, metering: this.metering, logger: this.logger, stylePickPollMs: this.stylePickPollMs, pickHeroWaitMs: this.pickHeroWaitMs }, input);
  }
```
  4. Delete the imports the service no longer uses:
     - `HeroFacts`, `templateHero`, `writeStyleHero` from `./design-engine/style-hero` (keep `numbersIn`);
     - `SourceDesignConcept` from the `./source-design` import (keep the rest of that import line);
     - `StyleProposalStatus`, `styleDecision`, `StyleDecision` from `./source-style-proposal` (keep `type StyleProposal`);
     - the whole `./source-style-design` import (`distinctBoldDisplay`, `distinctBoldDisplays`, `styleOpeningKey`, `styleRecommendation`);
     - `retryProviderRejection` from `./source-provider-error` (keep `checkSourceProviderQuota`).

     `npx eslint` on the service must show no new `no-unused-vars` error.

- [ ] **Step 5: Verify.** Run the generation suite with `<the task's new files>` = `apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-style-proposals.ts`. Expected:
  - identical to Task 0;
  - `source-generation-style.spec.ts` in particular: it shortens `stylePickPollMs` and `pickHeroWaitMs` on the instance.

- [ ] **Step 6: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-style-proposals.ts apps/api/src/storefront-source/source-generation.service.ts
git status --short
git commit -m "refactor(source-generation): style proposals and shared generation types in their own modules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Move the background review runner (`startSep5Review`, `withSavedCatalog`)

**Files:**
- Modify (test first): `apps/api/src/storefront-source/source-generation-review.spec.ts`
- Create: `apps/api/src/storefront-source/source-review-runner.ts`
- Modify: `apps/api/src/storefront-source/source-generation-types.ts` (adds `Sep5Review`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **Consumes:** the service's `prisma`, `projects`, `config`, `logger`, `reviews`, `reviewHeartbeatMs` and a **bound** `coverWithRewardCredits`.
- **Produces:**
  - `type Sep5Review` (moved to the types module)
  - `type BackgroundReviewDeps = { prisma: PrismaService; projects: SourceProjectsService; config: ConfigService; logger: Logger; reviews: SourceReviewRegistry; reviewHeartbeatMs: number; coverWithRewardCredits: (merchantId: string, generationId: string, credits: number) => Promise<number> }`
  - `type BackgroundReviewInput = { merchantId: string; storeId: string; revision: number; brief: SaveSourceProjectDto['brief']; savedFiles: SourceProjectFileDto[]; model: SourceModel; requestedModel: string; maxCredits: number; freeRun: boolean; review: Sep5Review }`
  - `startBackgroundReview(deps, input): Promise<void>`
  - `withSavedCatalog(deps: Pick<BackgroundReviewDeps, 'projects'>, merchantId, storeId, revision, files): Promise<SourceProjectFileDto[]>`

- [ ] **Step 1: Pin the `this` binding before moving anything.** In `source-generation-review.spec.ts`, inside `describe('Sep-5 self-review after the save', …)`, add this test right after `it('keeps the catalog revision N saved in config.js when the review saves N+1', …)`:

```ts
  it('redeems reward credits for the review row it saves (the service helper keeps its `this`)', async () => {
    // coverWithRewardCredits swallows its own errors: called without `this` it would return 0 and redeem nothing, silently.
    const rewards = { redeemForGeneration: jest.fn().mockResolvedValue(0) };
    (service as any).rewards = rewards;
    await generateN();
    await service.reviewSettled('s1');
    expect(fenceWrite().data.credits).toBeGreaterThan(0);
    expect(rewards.redeemForGeneration).toHaveBeenCalledWith('m1', 'review-1', fenceWrite().data.credits);
  });
```
  Run: `cd apps/api && npx jest src/storefront-source/source-generation-review.spec.ts --maxWorkers=2 -t 'redeems reward credits'`.

  Expected: **1 passed on the current code.** It pins existing behaviour. If it fails, stop and report; do not change it to fit.

- [ ] **Step 2: Move `Sep5Review` to the types module.** In `source-generation-types.ts`, add `import type { SaveSourceProjectDto } from './dto/save-source-project.dto';` under the existing import, and append:

```ts
/** The Sep-5 self-review as generate() hands it to startSep5Review: null when it has nothing to change. `deadline` is when
 * the stage's own signal times out (epoch ms), so a step inside it can keep time for the N+1 save. */
export type Sep5Review = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[]; deadline: number }) => Promise<{ saveInput: SaveSourceProjectDto; notes: string[] } | null>;
```
  In the service, delete lines 134–136 (the `Sep5Review` doc comment and `type Sep5Review = …`). Then change the Task 10 types import to `import type { Sep5Review, SourceGenerationAttempt, StyleProposalResult } from './source-generation-types';`.

- [ ] **Step 3: Create `source-review-runner.ts`:**

```ts
import { ConflictException, type Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { SourceProjectsService } from './source-projects.service';
import type { SaveSourceProjectDto, SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceModel } from './source-generation-policy';
import { reviewMessage, SOURCE_REVIEW_LABEL, SOURCE_REVIEW_STATUS, SourceReviewCancelled, SourceReviewDiscarded, type SourceReviewRegistry } from './source-background-review';
import { sourceRequestContext } from './source-request-context';
import { completedCredits, SEP5_CLIENT_TIMEOUT_MS } from './source-generation-run';
import { captureHeaderCovers, headerCoverProblems, introducedHeaderCovers, type HeaderCover } from './design-engine/header-clickable';
import { currentSourceRuntime } from './source-runtime';
import type { SourceProjectSnapshot } from './source-project';
import type { Sep5Review, SourceGenerationAttempt } from './source-generation-types';

/** What the background review needs from SourceGenerationService, read when the review starts. */
export type BackgroundReviewDeps = {
  prisma: PrismaService; projects: SourceProjectsService; config: ConfigService; logger: Logger;
  reviews: SourceReviewRegistry; reviewHeartbeatMs: number;
  /** The service's coverWithRewardCredits, bound to the service (it reads this.rewards and swallows its own errors). */
  coverWithRewardCredits: (merchantId: string, generationId: string, credits: number) => Promise<number>;
};
export type BackgroundReviewInput = { merchantId: string; storeId: string; revision: number; brief: SaveSourceProjectDto['brief']; savedFiles: SourceProjectFileDto[]; model: SourceModel; requestedModel: string; maxCredits: number; freeRun: boolean; review: Sep5Review };
```
  Then move:
  - **`withSavedCatalog`:** its doc comment (line 1694, `  /** The catalog items revision N saved in config.js, …`) through its closing brace (1704).
    - Signature: `export async function withSavedCatalog(deps: Pick<BackgroundReviewDeps, 'projects'>, merchantId: string, storeId: string, revision: number, files: SourceProjectFileDto[]): Promise<SourceProjectFileDto[]> {`
  - **`startSep5Review`:** its doc comment (lines 1706–1714, starting `  /**` + `   * YAPI's self-review of a Sep-5 store, after revision N is saved and shown …`) through its closing brace (1768).
    - Signature: `export async function startBackgroundReview(deps: BackgroundReviewDeps, input: BackgroundReviewInput): Promise<void> {`
  - Dedent both by two spaces.

  The only edits inside:

| Original | Becomes |
|---|---|
| `this.projects` (1697, 1753) | `deps.projects` |
| `this.prisma` (1716, 1723, 1733, 1757, 1758, 1764) | `deps.prisma` |
| `this.logger` (1717, 1734, 1746, 1760, 1765) | `deps.logger` |
| `this.config` (1738) | `deps.config` |
| `this.reviews` (1720) | `deps.reviews` |
| `this.reviewHeartbeatMs` (1724) | `deps.reviewHeartbeatMs` |
| `this.coverWithRewardCredits(` (1759) | `deps.coverWithRewardCredits(` |
| `this.withSavedCatalog(input.merchantId, …)` (1752) | `withSavedCatalog(deps, input.merchantId, …)` |

  Check: `grep -n 'this\.' apps/api/src/storefront-source/source-review-runner.ts` prints nothing.

- [ ] **Step 4: Edit the service.**
  1. Add `import { startBackgroundReview, type BackgroundReviewInput } from './source-review-runner';` after the Task 10 imports.
  2. Delete the `withSavedCatalog` method.
  3. Replace the `startSep5Review` method (its doc comment through its closing brace) with:

```ts
  /** YAPI's self-review of a Sep-5 store after revision N is saved (source-review-runner.ts). The reward helper is passed
   *  bound: unbound it would lose `this` and its own catch would turn that into "no credits", silently. */
  private startSep5Review(input: BackgroundReviewInput): Promise<void> {
    return startBackgroundReview({ prisma: this.prisma, projects: this.projects, config: this.config, logger: this.logger, reviews: this.reviews, reviewHeartbeatMs: this.reviewHeartbeatMs,
      coverWithRewardCredits: (merchantId, generationId, credits) => this.coverWithRewardCredits(merchantId, generationId, credits) }, input);
  }
```
  4. Delete the imports the service no longer uses:
     - `SourceReviewDiscarded`, `SOURCE_REVIEW_LABEL`, `SourceReviewCancelled`, `reviewMessage` from `./source-background-review` (keep `SourceReviewRegistry`, `SOURCE_REVIEW_HEARTBEAT_MS`, `SOURCE_REVIEW_STATUS`, `reviewPendingWhere`);
     - `SaveSourceProjectDto` from `./dto/save-source-project.dto` (keep `SourceProjectFileDto`).

- [ ] **Step 5: Verify.** Generation suite with new files `apps/api/src/storefront-source/source-review-runner.ts apps/api/src/storefront-source/source-generation-types.ts`. Expected:
  - identical to Task 0 **plus** the new test passing;
  - the review spec's heartbeat test ("keeps the review row beating …") and "redeems reward credits …" both pass.

- [ ] **Step 6: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-review-runner.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "refactor(source-generation): background review runner in its own module; pin reward credits for the review row" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Move the metered whole-project call (`sep5Call`, `touchCall`)

**Files:**
- Create: `apps/api/src/storefront-source/source-sep5-call.ts`
- Create: `apps/api/src/storefront-source/source-sep5-call.spec.ts`
- Modify: `apps/api/src/storefront-source/source-generation-types.ts` (adds `SourceInputImage`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **Consumes** (from `generate()`): `provider`, `apiKey`, `budget`, `() => model`, `signal`, `attempts`, `storeId`, `this.metering`.
- **Produces:**
  - `type SourceInputImage = { type: 'input_image'; image_url: string; detail: 'auto' }`
  - `type Sep5CallContext`, `type Sep5CallOptions`
  - `sep5Caller(context) → { sep5Call(phase, text, attached, schemaName, schema, timeoutMs, options?) → Promise<{ attempt; body }>, touchCall(run) → (text, attached) → Promise<{ body; used(): void }> }`
  - `type Sep5Caller = ReturnType<typeof sep5Caller>`

- [ ] **Step 1: Add `SourceInputImage`** to `source-generation-types.ts`:

```ts
/** One image input of a Responses API request, as generate() builds them. */
export type SourceInputImage = { type: 'input_image'; image_url: string; detail: 'auto' };
```

- [ ] **Step 2: Create `source-sep5-call.ts`:**

```ts
import type { AiUsageService } from '../ai-usage/ai-usage.service';
import { KIT_TOUCH_MAX_OUTPUT_TOKENS, KIT_TOUCH_SCHEMA, KIT_TOUCH_TIMEOUT_MS } from './kit-touch';
import { SEP5_MAX_OUTPUT_TOKENS } from './source-generation-run';
import { sourceUsage, type SourceModel } from './source-generation-policy';
import type { sourceProvider } from './source-provider';
import type { SourceRequestBudget } from './source-request-budget';
import type { SourceGenerationAttempt, SourceInputImage } from './source-generation-types';

export type Sep5CallContext = {
  provider: Pick<ReturnType<typeof sourceProvider>, 'endpoint'>;
  apiKey: ReturnType<typeof sourceProvider>['apiKey'];
  budget: SourceRequestBudget;
  /** The run's model at the moment of each call. generate()'s single-call repair can switch it before the chat touch runs,
   *  so it is read per call, never captured. */
  model: () => SourceModel;
  signal: AbortSignal;
  attempts: SourceGenerationAttempt[];
  storeId: string;
  metering?: AiUsageService;
};
export type Sep5CallOptions = { signal?: AbortSignal; attempts?: SourceGenerationAttempt[]; maxOutputTokens?: number; effort?: 'low' | 'medium' | 'high' };
export type Sep5Caller = ReturnType<typeof sep5Caller>;

/** One whole-project call, shared by the author and its self-review so both are budgeted, metered and recorded alike. */
export function sep5Caller(context: Sep5CallContext) {
  const { provider, apiKey, budget, signal, attempts, storeId, metering } = context;
  const sep5Call = async (phase: 'author' | 'review' | 'touch', text: string, attached: SourceInputImage[], schemaName: string, schema: object, timeoutMs: number, options: Sep5CallOptions = {}) => {
    // ← body of today's sep5Call (service lines 902–926), see the replacements below
  };
  /** The touch call (spec 2026-10-14): the same metered client, a smaller answer, and one more try after 3 s when the
   *  bridge gives no completed answer. The attempt is charged only when its CSS is kept (`used`). */
  const touchCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: SourceInputImage[]) => {
    // ← body of today's touchCall (service lines 931–936), see the replacements below
  };
  return { sep5Call, touchCall };
}
```
  Fill the two bodies with the moved lines:
  - **`sep5Call`:** from `const callSignal = options.signal ?? signal;` through `return { attempt, body };`.
  - **`touchCall`:** the `for (let tries = 0; ; tries++) { … }` loop.

  The only edits inside:

| Original | Becomes |
|---|---|
| every read of `model` in `sep5Call` (5 sites: `{ model, phase, …}` at 903, `budget.reserve(model, …` at 908, `JSON.stringify({ model, store: false, …` at 913, `sourceUsage(model, …` at 919, `…'source-generation', model, …` at 925) | `context.model()` (write `model: context.model()` in the two object literals) |
| `this.metering?.record(` (925) | `metering?.record(` |
| `attached as typeof images` (932) | `attached` |

- [ ] **Step 3: Replace the closures in `generate()`.** Delete lines 900–937: from `      // One whole-project call, shared by the author and its self-review …` through the `      };` that closes `touchCall`. Put in their place:

```ts
      // One whole-project call, shared by the author and its self-review (source-sep5-call.ts). `model` is read at each call:
      // the single-call repair may switch it before the chat touch runs.
      const { sep5Call, touchCall } = sep5Caller({ provider, apiKey, budget, model: () => model, signal, attempts, storeId, metering: this.metering });
```
  Add `import { sep5Caller } from './source-sep5-call';` to the service imports. Delete `KIT_TOUCH_SCHEMA`, `KIT_TOUCH_TIMEOUT_MS`, `KIT_TOUCH_MAX_OUTPUT_TOKENS` from the `./kit-touch` import (the rest of that import stays).

- [ ] **Step 4: Write `source-sep5-call.spec.ts`:**

```ts
import { sep5Caller } from './source-sep5-call';
import { SourceRequestBudget } from './source-request-budget';
import type { SourceGenerationAttempt } from './source-generation-types';
import type { SourceModel } from './source-generation-policy';

const completed = () => new Response(JSON.stringify({ status: 'completed', output: [], usage: { input_tokens: 10, output_tokens: 10 } }));
const caller = (model: () => SourceModel, attempts: SourceGenerationAttempt[]) =>
  sep5Caller({ provider: { endpoint: 'https://provider.test/v1/responses' }, apiKey: 'k', budget: new SourceRequestBudget(500), model, signal: new AbortController().signal, attempts, storeId: 's1' });

describe('sep5Caller', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reads the run model at each call, not when the caller is made (the repair may switch it before the chat touch)', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => completed());
    let model: SourceModel = 'gpt-5.6-terra';
    const attempts: SourceGenerationAttempt[] = [];
    const { sep5Call } = caller(() => model, attempts);
    await sep5Call('author', 'hola', [], 'independent_storefront', {}, 5_000);
    model = 'gpt-5.6-sol';
    await sep5Call('touch', 'hola', [], 'storefront_kit_touch', {}, 5_000);
    expect(attempts.map(attempt => attempt.model)).toEqual(['gpt-5.6-terra', 'gpt-5.6-sol']);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).model).toBe('gpt-5.6-sol');
  });

  it("records into the attempts it is given (the review's), not the run's", async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => completed());
    const runAttempts: SourceGenerationAttempt[] = [], reviewAttempts: SourceGenerationAttempt[] = [];
    const { sep5Call } = caller(() => 'gpt-5.6-terra', runAttempts);
    const { attempt } = await sep5Call('review', 'hola', [], 'storefront_self_review', {}, 5_000, { attempts: reviewAttempts });
    expect(runAttempts).toEqual([]);
    expect(reviewAttempts).toEqual([attempt]);
    expect(attempt).toMatchObject({ phase: 'review', responseStatus: 'completed', status: 'FAILED' });
  });
});
```
  `status` stays `'FAILED'`: callers mark an attempt `COMPLETED`, exactly as today.

  Run: `cd apps/api && npx jest src/storefront-source/source-sep5-call.spec.ts --maxWorkers=2`. Expected: 2 passed.

- [ ] **Step 5: Verify.** Generation suite with new files `apps/api/src/storefront-source/source-sep5-call.ts apps/api/src/storefront-source/source-sep5-call.spec.ts apps/api/src/storefront-source/source-generation-types.ts`. Expected: identical to Task 0 + Task 11's test + the 2 new tests.

- [ ] **Step 6: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-sep5-call.ts apps/api/src/storefront-source/source-sep5-call.spec.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "refactor(source-generation): metered Sep-5 call and touch call in their own module; model read per call" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Introduce the run context (`facts`, `live`) and move save assembly

**Files:**
- Create: `apps/api/src/storefront-source/source-save-assembly.ts`
- Modify: `apps/api/src/storefront-source/source-generation-types.ts` (adds `GenerateExecution`, `GeneratedSource`, `AgentOutcome`, `GenerationRunFacts`, `GenerationLive`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **Consumes:** `generate()`'s locals through `facts` / `live`, plus `platformHeader` and `agentPolicyChange`.
- **Produces:**
  - `designMotifs(value?: SourceDesign | null)`
  - `type LookChoice = { reuse?: { look: StoreLook | undefined }; fallback?: StoreLook }`
  - `type SaveAssemblyContext`
  - `assembleSourceSave(context, assembleSignal = context.facts.signal, lookChoice = {}) → Promise<the save input>`, the same value `assembleSave` returns today

- [ ] **Step 1: Append to `source-generation-types.ts`.** Add these imports at the top (all `import type`):

```ts
import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiUsageService } from '../ai-usage/ai-usage.service';
import type { BrandProfileService } from '../brand/brand-profile.service';
import type { GenerateSourceProjectDto } from './dto/generate-source-project.dto';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import type { SourceProgressReporter } from './source-progress';
import type { sourceGenerationPlan } from './source-generation-policy';
import type { sourceProvider } from './source-provider';
import type { SourceRequestBudget } from './source-request-budget';
import type { sourceStoreConfigData } from './source-store-config';
import type { SourceImageUse } from './source-setup';
import type { SourcePhotoFacts } from './source-photo-facts';
import type { SourceDesign } from './source-design';
import type { SourceVisualSystem } from './source-visual-system';
import type { sourceSectionScope } from './source-edit-scope';
import type { SourceSitePurpose } from './source-site-purpose';
import type { SourceMotionMode, SourceScrollFeel } from './source-motion';
import type { resolveStoreAction } from './source-primary-action';
import type { SourceProjectSnapshot } from './source-project';
import type { StyleProposal } from './source-style-proposal';
import type { KitTouchCss } from './kit-touch';
import type { StoreLook } from './store-look';
import type { frameForRun } from './design-engine/frame-draw';
import type { AgentStep, AgentToolbox } from './agent/agent-tools';
import type { PendingPolicies } from './source-agent-policies';
import type { requestedSourceProducts } from './source-products';
```
  Then append:

```ts
/** generate()'s `execution` argument (unchanged; named so the stages can refer to it). */
export type GenerateExecution = { candidate?: boolean; free?: boolean; /** Who pays instead of the merchant (spec 2026-09-27 §3); recorded on the run. */ sponsor?: 'shopify-import'; redesign?: boolean; /** The chat kept the store on its template: the agent may rewrite whole components, not the stylesheet. */ keepTemplate?: boolean; /** "Guardar borrador": continue the preserved draft of this revision's latest unfinished run, whatever the chat said since. */ resumeDraft?: boolean; /** Evaluation script only: a candidate that keeps the merchant instruction and may use the agent. */ evaluate?: boolean; snapshot?: SourceProjectSnapshot; findings?: unknown; referenceCaptures?: Array<{ image: string; viewport: string; y: number; url?: string }>; signal?: AbortSignal; onDispatch?: () => void; onAttempts?: (attempts: unknown[]) => void; /** Elige tu estilo: a fresh design saves two style cards (one calm, one bold) on the run and returns before building. */ styleProposal?: boolean; /** Elige tu estilo: called once both cards are planned and choosable, before their heroes finish (spec 2026-10-12). */ onPickable?: (result: StyleProposalResult) => void; /** Elige tu estilo: build the card the merchant picked from a saved proposal. */ style?: { proposal: StyleProposal; index: number } };

/** The run's generated files as the acceptance chain sees them. */
export type GeneratedSource = { label: string; files: SourceProjectFileDto[]; products?: unknown; productOperations?: unknown; design?: SourceDesign };
/** What the agent reports with its revision. */
export type AgentOutcome = { summary: string; sections: string[]; steps: Array<Omit<AgentStep, 'thumbnail'>>; requirements: AgentToolbox['requirements']; evidence: AgentToolbox['evidence'] };

/** A generate() run's fixed values, built once inside generate() after its last `let` is declared. Every field is a `const`
 *  (or a parameter never reassigned after that point), so a stage may destructure it. */
export type GenerationRunFacts = {
  prisma: PrismaService; config: ConfigService; logger: Logger; metering?: AiUsageService;
  storeId: string; runId: string; slug: string;
  dto: GenerateSourceProjectDto; execution?: GenerateExecution; progress?: SourceProgressReporter;
  plan: ReturnType<typeof sourceGenerationPlan>; claude: boolean; chatgptPlan: boolean;
  provider: ReturnType<typeof sourceProvider>; apiKey: ReturnType<typeof sourceProvider>['apiKey']; agentProvider: ReturnType<typeof sourceProvider> | null;
  budget: SourceRequestBudget; signal: AbortSignal; attempts: SourceGenerationAttempt[]; autoRepairs: string[];
  started: number; runTimeout: number; stablePrompt: string; signatureOn: boolean;
  brand: Awaited<ReturnType<BrandProfileService['get']>> | undefined; apiUrl: URL; data: ReturnType<typeof sourceStoreConfigData>;
  images: SourceInputImage[]; assets: SourceProjectFileDto[]; retainedAssets: SourceProjectFileDto[];
  assetLegend: Array<{ original: string; path: string }>; assetUrls: string[]; ownedUrls: Set<string>;
  imageUses: SourceImageUse[]; photoFacts: Record<string, SourcePhotoFacts>; fontPaths: Record<string, string>;
  previous: { snapshot: unknown } | null; previousFiles: SourceProjectFileDto[]; oldFiles: SourceProjectFileDto[];
  previousDesign: SourceDesign | null; previousScene: SourceVisualSystem['scene'] | null; sectionScope: ReturnType<typeof sourceSectionScope>;
  sitePurpose: SourceSitePurpose; scrollFeel: SourceScrollFeel; motion: SourceMotionMode; primaryAction: ReturnType<typeof resolveStoreAction> | undefined;
  creative: boolean; redesign: boolean; useNext: boolean; editExisting: boolean;
};

/** generate()'s mutable run state, seen live: each property is a getter (and, where a stage writes it, a setter) onto
 *  generate()'s own `let`. Never destructure it or keep a property value past one synchronous step. That is how a
 *  stage would end up holding a stale copy. */
export type GenerationLive = {
  generated: GeneratedSource;
  products: ReturnType<typeof requestedSourceProducts>;
  unusedImagePaths: string[];
  motifFiles: SourceProjectFileDto[];
  lenient: boolean;
  reviewing: boolean;
  sep5Review: Sep5Review | undefined;
  kitTouch: KitTouchCss | undefined;
  readonly revisionLook: StoreLook | undefined;
  acceptedPreviewFiles: SourceProjectFileDto[];
  readonly committedDesign: SourceDesign | undefined;
  readonly boldAsked: boolean;
  readonly frame: ReturnType<typeof frameForRun>;
  readonly playbookText: string;
  readonly styleBold: boolean;
  visualSystem: SourceVisualSystem;
  readonly sketchFile: SourceProjectFileDto | null;
  readonly websiteDesignFile: SourceProjectFileDto | null;
  readonly compiledNext: SourceProjectFileDto[];
  agentTheme: AgentToolbox['pendingTheme'];
  agentAccountTheme: AgentToolbox['pendingAccountTheme'];
  agentMotifPack: AgentToolbox['pendingMotifPack'];
  agentPolicies: PendingPolicies;
  agentOutcome: AgentOutcome | undefined;
  unfinishedStatus: 'PARTIAL' | 'BLOCKED' | null;
  taskPrompt: string;
  readonly model: SourceModel;
};
```
  If `tsc` reports that a facts field's type does not match its local (Step 4), copy the local's declared type into the field rather than adding a cast. The fields above were derived from the declarations at `5a206a30`.

- [ ] **Step 2: Name the types in `generate()`** (type-only edits):
  - **Signature (line 308):** replace the whole inline `execution?: { candidate?: boolean; … style?: { proposal: StyleProposal; index: number } }` with `execution?: GenerateExecution`.
  - **Line 643:** `let generated!: { label: string; files: SourceProjectFileDto[]; products?: unknown; productOperations?: unknown; design?: SourceDesign };` → `let generated!: GeneratedSource;`
  - **Line 644:** `let agentOutcome: { summary: string; … } | undefined;` → `let agentOutcome: AgentOutcome | undefined;`
  - **Line 673:** delete `    const designMotifs = (value?: SourceDesign | null) => value?.concepts[value.selected]?.dna?.motifs ?? [];`. It moves to the new module and is imported back.
  - Change the types import to `import type { AgentOutcome, GenerateExecution, GeneratedSource, GenerationLive, GenerationRunFacts, Sep5Review, SourceGenerationAttempt } from './source-generation-types';`. `StyleProposalResult` now appears only inside `GenerateExecution`, so it stays only in the `export type { SourceGenerationAttempt, StyleProposalResult } from …` re-export.

- [ ] **Step 3: Build `facts` and `live` in `generate()`.** Right after the line `      let acceptedPreviewFiles: SourceProjectFileDto[] = [];` (line 759, inside the `try`), insert:

```ts
      // The run as the stages split out of generate() see it (source-generation-types.ts): fixed values by value, and every
      // `let` above through a getter/setter, so a stage always reads and writes the real local.
      const facts: GenerationRunFacts = {
        prisma: this.prisma, config: this.config, logger: this.logger, metering: this.metering,
        storeId, runId: run.id, slug: owner.slug,
        dto, execution, progress, plan, claude, chatgptPlan, provider, apiKey, agentProvider,
        budget, signal, attempts, autoRepairs, started, runTimeout, stablePrompt, signatureOn,
        brand, apiUrl, data, images, assets, retainedAssets, assetLegend, assetUrls, ownedUrls, imageUses, photoFacts, fontPaths,
        previous, previousFiles, oldFiles, previousDesign, previousScene, sectionScope,
        sitePurpose, scrollFeel, motion, primaryAction, creative, redesign, useNext, editExisting,
      };
      const live: GenerationLive = {
        get generated() { return generated; }, set generated(value) { generated = value; },
        get products() { return products; }, set products(value) { products = value; },
        get unusedImagePaths() { return unusedImagePaths; }, set unusedImagePaths(value) { unusedImagePaths = value; },
        get motifFiles() { return motifFiles; }, set motifFiles(value) { motifFiles = value; },
        get lenient() { return lenient; }, set lenient(value) { lenient = value; },
        get reviewing() { return reviewing; }, set reviewing(value) { reviewing = value; },
        get sep5Review() { return sep5Review; }, set sep5Review(value) { sep5Review = value; },
        get kitTouch() { return kitTouch; }, set kitTouch(value) { kitTouch = value; },
        get revisionLook() { return revisionLook; },
        get acceptedPreviewFiles() { return acceptedPreviewFiles; }, set acceptedPreviewFiles(value) { acceptedPreviewFiles = value; },
        get committedDesign() { return committedDesign; },
        get boldAsked() { return boldAsked; },
        get frame() { return frame; },
        get playbookText() { return playbookText; },
        get styleBold() { return styleBold; },
        get visualSystem() { return visualSystem; }, set visualSystem(value) { visualSystem = value; },
        get sketchFile() { return sketchFile; },
        get websiteDesignFile() { return websiteDesignFile; },
        get compiledNext() { return compiledNext; },
        get agentTheme() { return agentTheme; }, set agentTheme(value) { agentTheme = value; },
        get agentAccountTheme() { return agentAccountTheme; }, set agentAccountTheme(value) { agentAccountTheme = value; },
        get agentMotifPack() { return agentMotifPack; }, set agentMotifPack(value) { agentMotifPack = value; },
        get agentPolicies() { return agentPolicies; }, set agentPolicies(value) { agentPolicies = value; },
        get agentOutcome() { return agentOutcome; }, set agentOutcome(value) { agentOutcome = value; },
        get unfinishedStatus() { return unfinishedStatus; }, set unfinishedStatus(value) { unfinishedStatus = value; },
        get taskPrompt() { return taskPrompt; }, set taskPrompt(value) { taskPrompt = value; },
        get model() { return model; },
      };
```
  Nothing reads `facts`/`live` yet except the save context below. Tasks 14–15 use the rest.

- [ ] **Step 4: Create `source-save-assembly.ts`.** The header:

```ts
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { patchConfigFile, type StoreLook } from './store-look';
import { applyProductThemeToDesign, productThemeRuntime, resolveProductTheme, sanitizeProductAssurances } from './product-theme';
import { sourceDesignAfterSectionEdit } from './source-edit-scope';
import { buildSourceVisualSystem, sourceProductPageStyle, SOURCE_VISUAL_SYSTEM_FILE, withSourceStyleTokens } from './source-visual-system';
import { sourceAssetInventory, withSourceAssets } from './source-asset-library';
import { designBrandCss, parseFrameDraw, storePhotoPaths } from './design-engine/frame-draw';
import { brandHasColours, brandStyles, linkBrandStylesheet } from '../brand/brand-profile';
import { nextContentPages, nextProjectScaffold } from './source-next';
import { sketchKitDna, sketchProductTheme } from './sketch';
import { SOURCE_PRODUCT_PAGE_STYLES, sourceRuntimeDna } from './source-dna';
import { commerceConfig } from './source-commerce-config';
import { carriedTouch } from './kit-touch';
import { sourceMotifConfig, sourceMotifPaths } from './source-motifs';
import { normalizeAccountTheme } from './account-theme';
import { chosenMotifPack } from './source-motif-packs';
import { mergeAgentPolicies } from './source-agent-policies';
import { sourceCommerceRoutes } from './source-commerce-pages';
import { withSourceMotion } from './source-motion';
import { withSourceCommerceDesign } from './source-commerce-design';
import { withSourceFonts } from './source-fonts';
import { SOURCE_DESIGN_FILE, type SourceDesign } from './source-design';
import { measureStoreLook, withMeasuredLook } from './store-look-measure';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';

/** The DNA motifs a design's selected concept declares. */
export const designMotifs = (value?: SourceDesign | null) => value?.concepts[value.selected]?.dna?.motifs ?? [];

/** `reuse`: a look already measured on this same home (the touch base), written as is without measuring again;
 *  `fallback`: the look to keep when measuring fails (the review stage's revision N), instead of the previous
 *  revision's. A new store or a redesign never falls back to the previous revision's look: its design is new. */
export type LookChoice = { reuse?: { look: StoreLook | undefined }; fallback?: StoreLook };

export type SaveAssemblyContext = {
  facts: Pick<GenerationRunFacts, 'prisma' | 'config' | 'logger' | 'storeId' | 'runId' | 'slug' | 'dto' | 'brand' | 'apiUrl' | 'data' | 'assets' | 'retainedAssets' | 'assetLegend' | 'imageUses' | 'photoFacts' | 'fontPaths' | 'previous' | 'previousFiles' | 'previousDesign' | 'previousScene' | 'sectionScope' | 'sitePurpose' | 'scrollFeel' | 'motion' | 'primaryAction' | 'creative' | 'useNext' | 'signal'>;
  live: Pick<GenerationLive, 'generated' | 'agentTheme' | 'visualSystem' | 'frame' | 'compiledNext' | 'sketchFile' | 'websiteDesignFile' | 'kitTouch' | 'motifFiles' | 'agentAccountTheme' | 'agentMotifPack' | 'agentPolicies'>;
  /** generate()'s platformHeader: draws the platform header on every static page and logs its notes once per run. */
  platformHeader: (files: SourceProjectFileDto[], platformPages: string[]) => SourceProjectFileDto[];
  /** YAPI rewrote at least one store policy this run (computed once after the engine branch). */
  agentPolicyChange: boolean;
};

/** Everything a save carries besides the model's authored files: kit files, assets, design and visual-system files,
 *  config.js. Built from `live.generated` as it is when called: once for revision N, and again by the background review. */
export async function assembleSourceSave(context: SaveAssemblyContext, assembleSignal: AbortSignal = context.facts.signal, lookChoice: LookChoice = {}) {
  const { facts, live, platformHeader, agentPolicyChange } = context;
  // Run constants only. `live` is read through on purpose; see GenerationLive.
  const { prisma, config, logger, storeId, runId, slug, dto, brand, apiUrl, data, assets, retainedAssets, assetLegend, imageUses, photoFacts, fontPaths, previous, previousFiles, previousDesign, previousScene, sectionScope, sitePurpose, scrollFeel, motion, primaryAction, creative, useNext } = facts;
  // ← the body of today's assembleSave (service lines 1519–1603), with the replacements below
}
```
  Move the body: service lines 1519–1603, from `const acceptedDesign = applyProductThemeToDesign(…` through `return measured.input;`. Dedent to the function body. The only edits inside:

| Original | Becomes |
|---|---|
| `generated.` (1519 ×2, 1521, 1584) | `live.generated.` |
| `agentTheme` (1519, 1552, 1564, 1569 ×2, 1582) | `live.agentTheme` |
| `visualSystem = buildSourceVisualSystem(` (1522, the one write) | `live.visualSystem = buildSourceVisualSystem(` |
| other reads of `visualSystem` (1546, 1590) | `live.visualSystem` |
| `frame.` (1530, 1568, 1569, 1589 ×2, 1601) | `live.frame.` |
| `compiledNext` (1531) | `live.compiledNext` |
| `sketchFile` (1552, 1554, 1587 ×2) | `live.sketchFile` |
| `kitTouch` (1569 ×2) | `live.kitTouch` |
| `motifFiles` (1572) | `live.motifFiles` |
| `agentAccountTheme` (1576) | `live.agentAccountTheme` |
| `agentMotifPack` (1578) | `live.agentMotifPack` |
| `agentPolicies` (1579) | `live.agentPolicies` |
| `websiteDesignFile` (1588 ×2) | `live.websiteDesignFile` |
| `owner.slug` (1531, 1583, 1592) | `slug` |
| `run.id` (1602) | `runId` |
| `this.prisma` (1579) | `prisma` |
| `this.config` (1583, 1601) | `config` |
| `this.logger` (1602) | `logger` |

  Check: `grep -nE '\bthis\.|\bowner\.|\brun\.id' apps/api/src/storefront-source/source-save-assembly.ts` prints nothing. `tsc` reports any `live.` field you missed as an undeclared name.

- [ ] **Step 5: Replace `assembleSave` in `generate()`.** Delete lines 1513–1604: the three doc comments starting `    /** Everything a save carries besides the model's authored files: …` through the `    };` closing `assembleSave`. Put in their place:

```ts
    // Everything a save carries besides the model's authored files (source-save-assembly.ts). It reads `generated` as it is
    // when called: once for revision N, and again by the background review.
    const saveContext: SaveAssemblyContext = { facts, live, platformHeader, agentPolicyChange };
    const assembleSave = (assembleSignal: AbortSignal = signal, lookChoice: LookChoice = {}) => assembleSourceSave(saveContext, assembleSignal, lookChoice);
```
  Add `import { assembleSourceSave, designMotifs, type LookChoice, type SaveAssemblyContext } from './source-save-assembly';` to the service imports. Delete the imports the service no longer uses. After this edit, `npx eslint` on the service must again show only the two pre-existing errors; delete any other import it reports as unused.

| Module | Remove |
|---|---|
| `./kit-touch` | `carriedTouch` |
| `./product-theme` (first import line) | `applyProductThemeToDesign`, `sanitizeProductAssurances`, `productThemeRuntime`, `resolveProductTheme` (keep `instructionConcernsProductCard`) |
| `./source-edit-scope` | `sourceDesignAfterSectionEdit` |
| `./design-engine/frame-draw` | `designBrandCss`, `storePhotoPaths` |
| `./source-next` | `nextProjectScaffold`, `nextContentPages` |
| `../brand/brand-profile` | `linkBrandStylesheet` |
| `./sketch` | `sketchProductTheme`, `sketchKitDna` |
| `./source-dna` | `SOURCE_PRODUCT_PAGE_STYLES` |
| `./source-commerce-config` | whole import |
| `./source-motifs` | `sourceMotifConfig` |
| `./source-motif-packs` | whole import |
| `./source-agent-policies` | `mergeAgentPolicies` (keep `AGENT_POLICY_KINDS`, `type PendingPolicies`) |
| `./source-commerce-pages` | whole import |
| `./source-motion` | `withSourceMotion` |
| `./source-commerce-design` | whole import |
| `./source-visual-system` | `withSourceStyleTokens` |
| `./store-look` | `patchConfigFile` |
| `./store-look-measure` | whole import |
| `./source-style-proposal` | the remaining `import type { StyleProposal }` line (`StyleProposal` now appears only in `GenerateExecution`) |
| `./agent/agent-tools` | `type AgentStep` (now only in `AgentOutcome`) |
| `./source-generation-types` (the `import type` line) | `StyleProposalResult` (keep it in the `export type { … }` re-export line; it now appears only in `GenerateExecution`) |

- [ ] **Step 6: Verify.** Generation suite with new files `apps/api/src/storefront-source/source-save-assembly.ts apps/api/src/storefront-source/source-generation-types.ts`. Expected: identical (Task 0 + the tests added in Tasks 11–12). In particular these review specs must pass:
  - "measures the home at most twice in a touched build …";
  - "N+1 falls back to the look revision N just measured …";
  - "a redesign whose measurement fails saves no look …";
  - both "with a confirmed brand" tests (brand.css exactly once).

- [ ] **Step 7: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-save-assembly.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "refactor(source-generation): run context (facts, live) and save assembly in its own module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Move the Sep-5 author stage, its background review/touch closure, and the chat kit touch

**Files:**
- Create: `apps/api/src/storefront-source/source-sep5-stage.ts`
- Create: `apps/api/src/storefront-source/source-sep5-review.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **`source-sep5-review.ts`:**
  - `REVIEW_SAVE_MARGIN_MS = 90_000` (moved from the service, lines 137–138)
  - `type Sep5ReviewContext`, `createSep5Review(context): Sep5Review`
  - `type ChatKitTouchContext`, `runChatKitTouch(context): Promise<void>`
- **`source-sep5-stage.ts`:** `type Sep5StageContext`, `runSep5AuthorStage(context): Promise<void>`. It writes `live.generated`, `live.products`, `live.lenient`, `live.sep5Review` and the others exactly where today's code assigns them.

- [ ] **Step 1: Create `source-sep5-review.ts`.** The header:

```ts
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { currentSourceRuntime } from './source-runtime';
import type { SourceProjectSnapshot } from './source-project';
import { captureSep5Draft, sep5MeasuredFacts } from './design-engine/sep5-review-capture';
import { contractMisses, craftFacts, type Evidence, type PlaybookEntry } from './design-engine/playbook';
import { applySep5Edits, sep5ProjectIsUsable, sep5ReviewPrompt, sep5ReviewSchema, SEP5_REVIEW_RESPONSE_SCHEMA, type sep5AuthorPrompt, type Sep5Files } from './design-engine/sep5-author';
import { SEP5_CLIENT_TIMEOUT_MS } from './source-generation-run';
import { sourceResponseJson } from './source-response';
import { sep5AuthorableFiles } from './source-authorable';
import { readConfigFile, sanitizeLook, type StoreLook } from './store-look';
import { chatTouchKept, instructionConcernsKitSurfaces, MERCHANT_MARKER, pickTouch, runKitTouch, touchBudgetMs } from './kit-touch';
import type { assembleSourceSave, LookChoice } from './source-save-assembly';
import type { Sep5Caller } from './source-sep5-call';
import type { GenerationLive, GenerationRunFacts, Sep5Review } from './source-generation-types';

/** The review stage keeps this much of its time for assembling and saving N+1 after a touch. */
export const REVIEW_SAVE_MARGIN_MS = 90_000;

/** generate()'s assembleSave. Stages receive it wrapped, `(…a) => assembleSave(…a)`, because it is declared after them. */
export type AssembleSave = (assembleSignal?: AbortSignal, lookChoice?: LookChoice) => ReturnType<typeof assembleSourceSave>;

export type Sep5ReviewContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'apiUrl' | 'data' | 'sitePurpose' | 'scrollFeel'>;
  live: GenerationLive;
  sep5SelfReview: boolean; kitTouchOn: boolean;
  playbookEntry: PlaybookEntry | undefined; playbookEvidence: Record<Evidence, boolean>;
  authorInput: Parameters<typeof sep5AuthorPrompt>[0];
  draftFiles: Sep5Files['files']; draftPreview: SourceProjectFileDto[];
  addSep5StandardPages: () => Promise<void>;
  acceptCandidate: () => Promise<void>;
  sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];
  assembleSave: AssembleSave;
};

/** Self-review after the save (spec 2026-10-12 faster generation) plus the kit touch (spec 2026-10-14). The author writes
 *  blind; the review is shown the draft once, at desktop and phone widths, with what the browser measured, and the
 *  corrected project lands as N+1 only if it passes the same acceptance and the store is still on N. */
export function createSep5Review(context: Sep5ReviewContext): Sep5Review {
  const { facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, assembleSave } = context;
  const { config, logger, runId, slug, dto, apiUrl, data, sitePurpose, scrollFeel } = facts;
  return async review => {
    // ← the body of today's review closure (service lines 1004–1062), with the replacements below
  };
}

export type ChatKitTouchContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'claude' | 'data' | 'sitePurpose' | 'creative' | 'started' | 'runTimeout' | 'signal' | 'attempts'>;
  live: Pick<GenerationLive, 'agentTheme' | 'kitTouch'>;
  touchCall: Sep5Caller['touchCall'];
  assembleSave: AssembleSave;
};

/** A chat request about the kit pages (spec 2026-10-14) re-runs only the touch step, with the merchant's words. The new
 *  CSS replaces the surfaces it covers; surfaces it leaves empty keep the store's earlier touch. It runs before the
 *  receipt so a used attempt is billed, on its own deadline (the touch never fails an edit), and an agent theme chosen
 *  in this same request wins over it on the surfaces the theme set. */
export async function runChatKitTouch(context: ChatKitTouchContext): Promise<void> {
  const { facts, live, touchCall, assembleSave } = context;
  const { config, logger, runId, slug, dto, claude, data, sitePurpose, creative, started, runTimeout, signal, attempts } = facts;
  // ← service lines 1609–1625 (from `const touchBudget = touchBudgetMs(…` through the closing `}` of the `if`), with the replacements below
}
```
  - **Review closure body:** service lines 1004–1062, the inside of `sep5Review = async review => { … };`, from `const notes: string[] = [];` through `return { saveInput: await assembleSave(review.signal, …), notes };`. The only edits inside:

| Original | Becomes |
|---|---|
| `this.config` (1008) | `config` |
| `this.logger` (1021, 1045, 1053, 1056) | `logger` |
| `run.id` (1021, 1045, 1053, 1056) | `runId` |
| `owner.slug` (1008, 1050) | `slug` |
| `boldAsked` (1016) | `live.boldAsked` |
| `reviewing = true` (1028) | `live.reviewing = true` |
| `generated = { label: result.data.label.slice(0, 120) \|\| generated.label, files: kept.files }` (1029) | `live.generated = { label: result.data.label.slice(0, 120) \|\| live.generated.label, files: kept.files }` |
| `lenient = true` / `lenient = false` (1030, 1031) | `live.lenient = true` / `live.lenient = false` |
| `revisionLook` (1049, 1062) | `live.revisionLook` |
| `kitTouch = touch.css` (1052) | `live.kitTouch = touch.css` |
| `committedDesign?.concepts[committedDesign.selected]?.signature` (1050) | `live.committedDesign?.concepts[live.committedDesign.selected]?.signature` |

  - **Chat touch:** service lines 1609–1625. The only edits inside:

| Original | Becomes |
|---|---|
| `this.config` (1610) | `config` |
| `this.logger` (1620, 1623) | `logger` |
| `run.id` (1620, 1623) | `runId` |
| `owner.slug` (1614) | `slug` |
| `agentTheme` (1616) | `live.agentTheme` |
| `kitTouch = { … }` (1619) | `live.kitTouch = { … }` |

  If TypeScript does not narrow `live.committedDesign` inside that optional chain, read it once into a local on the line before (`const design = live.committedDesign;`) and use `design?.concepts[design.selected]?.signature`. It is the same synchronous read.

- [ ] **Step 2: Create `source-sep5-stage.ts`.** The header:

```ts
import { BadGatewayException } from '@nestjs/common';
import { sourceMotionPlan } from './source-motion-plan';
import { sep5AuthorableFiles, sep5PreviousSource } from './source-authorable';
import { sep5AuthorPrompt, sep5BoldDefault, sep5FilesSchema, sep5FontDirection, sep5ProjectIsUsable, sep5Products, sep5ResponseSchema, SEP5_AUTHOR_VERSION } from './design-engine/sep5-author';
import { sourceSignatureAuthorDirection } from './source-signature';
import { framePlatformHeader } from './design-engine/frame-draw';
import { SEP5_CLIENT_TIMEOUT_MS, SEP5_MAX_OUTPUT_TOKENS } from './source-generation-run';
import { sourceResponseJson } from './source-response';
import { withStaticStandardPages } from './source-static-pages';
import type { Evidence, PlaybookEntry } from './design-engine/playbook';
import type { Sep5Caller } from './source-sep5-call';
import { createSep5Review, type AssembleSave } from './source-sep5-review';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';

export type Sep5StageContext = {
  facts: Pick<GenerationRunFacts, 'config' | 'logger' | 'runId' | 'slug' | 'dto' | 'progress' | 'apiUrl' | 'data' | 'assetLegend' | 'images' | 'ownedUrls' | 'sitePurpose' | 'scrollFeel' | 'motion' | 'primaryAction' | 'oldFiles' | 'creative' | 'autoRepairs' | 'signatureOn'>;
  live: GenerationLive;
  sep5SelfReview: boolean; playbookOn: boolean;
  playbookEntry: PlaybookEntry | undefined; playbookEvidence: Record<Evidence, boolean>;
  pickedHero: string; pickedCard: string;
  acceptCandidate: () => Promise<void>;
  sep5Call: Sep5Caller['sep5Call']; touchCall: Sep5Caller['touchCall'];
  /** Lazy: generate() declares assembleSave after the engine branch; the review calls it only after revision N is saved. */
  assembleSave: AssembleSave;
};

/** Sep-5 authors the whole static store in one call (the pinned 26f889c8 prompt), adds the standard pages, and arms the
 *  background review (live.sep5Review) that saves N+1 after revision N is shown. */
export async function runSep5AuthorStage(context: Sep5StageContext): Promise<void> {
  const { facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall, assembleSave } = context;
  const { config, logger, runId, slug, dto, progress, data, assetLegend, images, ownedUrls, sitePurpose, motion, primaryAction, oldFiles, creative, autoRepairs, signatureOn } = facts;
  // ← service lines 939–1065 (the inside of `if (sep5Author) { … }`), with the replacements below
}
```
  Body: service lines 939–1065, from `        // The Sep-5 commit (26f889c8) wrote the store instead of filling a schema, …` through `        await addSep5StandardPages();`. Dedent. The only edits inside:

| Original | Becomes |
|---|---|
| `this.logger` (959, 970, 991) | `logger` |
| `this.config` (1000) | `config` |
| `run.id` (959, 970, 991) | `runId` |
| `owner.slug` (973) | `slug` |
| `styleBold` (950) | `live.styleBold` |
| `playbookText` (950) | `live.playbookText` |
| `committedDesign` (950 ×3: `sep5FontDirection(committedDesign)`, `committedDesign?.concepts[committedDesign.selected]`) | `live.committedDesign` (same narrowing note as Step 1) |
| `frame.paragraph` (950) | `live.frame.paragraph` |
| `const listed: { products: typeof products; note?: string }` (965) | `const listed: { products: GenerationLive['products']; note?: string }` |
| `products = listed.products;` (966) | `live.products = listed.products;` |
| `generated = { label: …, files: authorable.files };` (973) | `live.generated = { label: …, files: authorable.files };` |
| `lenient = true` / `lenient = false` (977, 978, 987, 992) | `live.lenient = …` |
| in `addSep5StandardPages`: `generated.files` (983), `generated` in `before = { generated, … }` (985), `generated = { ...generated, files: pages.files }` (986) | `live.generated.files`; `before = { generated: live.generated, … }`; `live.generated = { ...live.generated, files: pages.files }` |
| in `addSep5StandardPages`: `motifFiles`, `acceptedPreviewFiles`, `unusedImagePaths` in `before` (985) | `live.motifFiles`, `live.acceptedPreviewFiles`, `live.unusedImagePaths` |
| the restore line (990): `generated = before.generated; autoRepairs.length = before.repairs; motifFiles = before.motifs; acceptedPreviewFiles = before.preview; unusedImagePaths = before.unused;` | `live.generated = before.generated; autoRepairs.length = before.repairs; live.motifFiles = before.motifs; live.acceptedPreviewFiles = before.preview; live.unusedImagePaths = before.unused;` |
| `const draftFiles = authored.data.files, draftPreview = acceptedPreviewFiles;` (1002) | `const draftFiles = authored.data.files, draftPreview = live.acceptedPreviewFiles;` |
| `sep5Review = async review => { … };` (1003–1063) | see below |

  The last row: lines 1003–1063 become one statement, because the closure body now lives in `createSep5Review`:

```ts
          live.sep5Review = createSep5Review({ facts, live, sep5SelfReview, kitTouchOn, playbookEntry, playbookEvidence, authorInput, draftFiles, draftPreview, addSep5StandardPages, acceptCandidate, sep5Call, touchCall, assembleSave });
```
  Keep the comment block at 994–999 above the `const kitTouchOn = …` line. `facts` satisfies the review's narrower `Pick` because it is the same object.

  Check: `grep -nE '\bthis\.|\bowner\.|\brun\.id' apps/api/src/storefront-source/source-sep5-stage.ts apps/api/src/storefront-source/source-sep5-review.ts` prints nothing.

- [ ] **Step 3: Edit `generate()`.**
  1. **Author branch.** Replace the inside of `if (sep5Author) { … }` (lines 939–1065) with:

```ts
        // Sep-5 authors the store, adds the standard pages and arms the background review (source-sep5-stage.ts).
        // assembleSave is declared after this branch: the stage gets a wrapper, called only by the review after the save.
        await runSep5AuthorStage({ facts, live, sep5SelfReview, playbookOn, playbookEntry, playbookEvidence, pickedHero, pickedCard, acceptCandidate, sep5Call, touchCall,
          assembleSave: (assembleSignal, lookChoice) => assembleSave(assembleSignal, lookChoice) });
```
  2. **Chat touch.** Replace lines 1605–1625 (from `    // A chat request about the kit pages (spec 2026-10-14) re-runs only the touch step, …` through the `    }` that closes `if (!creative && !claude && …)`) with:

```ts
    // A chat request about the kit pages re-runs only the touch step (source-sep5-review.ts runChatKitTouch).
    await runChatKitTouch({ facts, live, touchCall, assembleSave });
```
  3. **Constant.** Delete lines 137–138 (`REVIEW_SAVE_MARGIN_MS` and its comment).
  4. **Imports.** Add `import { runSep5AuthorStage } from './source-sep5-stage';` and `import { runChatKitTouch } from './source-sep5-review';`. Delete the imports the service no longer uses:

| Module | Remove |
|---|---|
| `./source-generation-run` | `SEP5_MAX_OUTPUT_TOKENS`, `SEP5_CLIENT_TIMEOUT_MS` (keep `CLAUDE_COMPANION_MODEL`, `completedCredits`, `brandPalette`, `fillsProductPagesAfterSave`) |
| `./kit-touch` | `touchBudgetMs`, `runKitTouch`, `MERCHANT_MARKER`, `chatTouchKept`, `pickTouch` (keep `instructionConcernsKitSurfaces`; the agent branch still uses it until Task 15) |
| `./source-authorable` | whole import |
| `./design-engine/sep5-author` | `sep5BoldDefault`, `sep5FontDirection`, `sep5ResponseSchema`, `sep5Products`, `SEP5_AUTHOR_VERSION`, `sep5ReviewPrompt`, `SEP5_REVIEW_RESPONSE_SCHEMA`, `sep5ReviewSchema`, `applySep5Edits` (keep `sep5AuthorPrompt`, `sep5CardLook`, `sep5AuthoredPlan`, `sep5FilesSchema`, `sep5ProjectIsUsable`, `SEP5_RESPONSE_SCHEMA`, `SEP5_KEEP_HERO`) |
| `./source-signature` | `sourceSignatureAuthorDirection` (keep `sourceSignatureTaskLine`) |
| `./design-engine/frame-draw` | `framePlatformHeader` |
| `./source-static-pages` | whole import |
| `./design-engine/sep5-review-capture` | whole import |
| `./design-engine/playbook` | `craftFacts`, `contractMisses` |

  Also delete `readConfigFile` and `sanitizeLook` from `./store-look` **only if** eslint reports them unused. `revisionLook = sanitizeLook(readConfigFile(saveInput.files).look);` at the save (line 1632) still uses both.

- [ ] **Step 4: Verify.** Generation suite with new files `apps/api/src/storefront-source/source-sep5-stage.ts apps/api/src/storefront-source/source-sep5-review.ts`. Expected: identical. Every test in `source-generation-review.spec.ts` must pass, in particular:
  - the whole "YAPI touches the kit pages in the review stage" describe, incl. "a touch that outlives its own budget is dropped (reason deadline) …";
  - "a chat request about the kit pages re-runs the touch";
  - "a new request cancels the running review …".

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-sep5-stage.ts apps/api/src/storefront-source/source-sep5-review.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "refactor(source-generation): Sep-5 author stage, background review/touch and chat kit touch in their own modules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Move the agent stage

**Files:**
- Create: `apps/api/src/storefront-source/source-agent-stage.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`

**Interfaces:**
- **Consumes:** `facts`, `live`, `acceptCandidate`, and the resumable checkpoint read in `generate()`'s `try` (`resumable`, `checkpoint`, `checkpointKey`, `requestKey`, `merchantRequest`).
- **Produces:** `type AgentStageContext`, `runAgentStage(context): Promise<void>`.
  - It writes `live.generated`, `live.lenient`, `live.motifFiles`, `live.taskPrompt`, `live.unfinishedStatus`, `live.agentTheme`, `live.agentAccountTheme`, `live.agentMotifPack`, `live.agentPolicies` and `live.agentOutcome` where today's code assigns them.
  - **`live.unfinishedStatus` must be written before the `throw` on line 1381:** `generate()`'s outer `catch` reads it.

- [ ] **Step 1: Create `source-agent-stage.ts`.** The header:

```ts
import { readFile } from 'node:fs/promises';
import { BadGatewayException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { kitPath } from '@pagosya/storefront-kit';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { AgentWorkspace } from './agent/agent-workspace';
import { AgentToolbox, recordTellsKept } from './agent/agent-tools';
import { abortedByTimeout, AGENT_LIMITS, agentLimits, agentWallWithin, runAgent } from './agent/agent-loop';
import { assertMerchantTaskCoverage, assertTaskFeasibility, validateTaskRequirements, workspaceDigest } from './agent/agent-task';
import { agentDraftPreviews } from './agent/agent-draft-previews';
import { anthropicAgentModel } from './agent/agent-model-anthropic';
import { openAiAgentModel } from './agent/agent-model';
import { agentInstructions, agentOpening } from './agent/agent-prompt';
import { SOURCE_VISUAL_SYSTEM_CONTRACT, SOURCE_VISUAL_SYSTEM_FILE, sourceProductPageStyle } from './source-visual-system';
import { sourceRuntimeDna } from './source-dna';
import { SOURCE_DESIGN_FILE, SOURCE_VISUAL_COHERENCE_CONTRACT } from './source-design';
import { nextSourceFile, SOURCE_NEXT_INSTRUCTIONS } from './source-next';
import { repairDiagnostic } from './source-validation-error';
import { sourceRequestContext } from './source-request-context';
import { sourceMediaPolicy } from './source-media-design';
import { reviewSourceComposition } from './source-composition-review';
import { sourceProvider } from './source-provider';
import { sourcePromptCacheKey, sourceUsage } from './source-generation-policy';
import { instructionConcernsProductCard } from './product-theme';
import { instructionConcernsKitSurfaces } from './kit-touch';
import { normalizeAccountTheme } from './account-theme';
import { AGENT_POLICY_KINDS } from './source-agent-policies';
import { SOURCE_SHOPPING_FLOW } from './source-shopping-flow';
import { SOURCE_LOCATION_INSTRUCTIONS } from './source-location';
import { SOURCE_FONT_CHOICES } from './source-fonts';
import { sourceSitePurposePrompt } from './source-site-purpose';
import type { SourceMerchantRequest } from './source-merchant-request';
import type { GenerationLive, GenerationRunFacts } from './source-generation-types';

export type AgentStageContext = {
  facts: Pick<GenerationRunFacts, 'prisma' | 'config' | 'metering' | 'storeId' | 'runId' | 'slug' | 'dto' | 'execution' | 'progress' | 'plan' | 'chatgptPlan' | 'provider' | 'apiKey' | 'agentProvider' | 'budget' | 'signal' | 'attempts' | 'autoRepairs' | 'started' | 'runTimeout' | 'stablePrompt' | 'signatureOn' | 'apiUrl' | 'data' | 'images' | 'assets' | 'assetUrls' | 'previous' | 'previousFiles' | 'oldFiles' | 'sectionScope' | 'sitePurpose' | 'scrollFeel' | 'redesign' | 'editExisting'>;
  live: GenerationLive;
  acceptCandidate: () => Promise<void>;
  /** An earlier unfinished run of this exact request, as generate() read it before the design stage. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the checkpoint is untyped JSON from the run row, read as today
  resume: { resumable: boolean; checkpoint: any; checkpointKey: string; requestKey: string | undefined; merchantRequest: SourceMerchantRequest | undefined };
};

/** The tool-using agent builds or edits a component store (docs/superpowers/specs/2026-09-26-yapi-agent-design.md); finish
 *  is accepted only when the draft passes the same acceptance chain a single-call response must pass. */
export async function runAgentStage(context: AgentStageContext): Promise<void> {
  const { facts, live, acceptCandidate, resume } = context;
  const { resumable, checkpoint, checkpointKey, requestKey, merchantRequest } = resume;
  const { prisma, config, metering, storeId, runId, slug, dto, execution, progress, plan, chatgptPlan, provider, apiKey, agentProvider, budget, signal, attempts, autoRepairs, started, runTimeout, stablePrompt, signatureOn, apiUrl, data, images, assets, assetUrls, previous, previousFiles, oldFiles, sectionScope, sitePurpose, scrollFeel, redesign, editExisting } = facts;
  // ← service lines 1267–1391 (the inside of `} else if (agentEngine) { … }`), with the replacements below
}
```
  Remove any import eslint reports as unused, and add any that `tsc` asks for. The list above is what lines 1267–1391 use at `5a206a30`.

  Body: service lines 1267–1391, from `        await progress?.('building');` through `        agentOutcome = { summary, requirements: …, steps: … };`. Dedent. The only edits inside:

| Original | Becomes |
|---|---|
| `this.config` (1276, 1313) | `config` |
| `this.metering` (1317, 1359) | `metering` |
| `this.prisma` (1350, 1358) | `prisma` |
| `run.id` (1350, 1358) | `runId` |
| `owner.slug` (1276, 1283) | `slug` |
| `visualSystem` (1291, 1296) | `live.visualSystem` |
| `committedDesign` (1292, 1297 ×2, 1309, 1314, 1350) | `live.committedDesign` (same narrowing note as Task 14) |
| `generated = { label: 'Cambios de YAPI', … }` (1302) | `live.generated = { … }` |
| `generated.files` (1303) | `live.generated.files` |
| `generated.label = …` (1390) | `live.generated.label = …` |
| `motifFiles` (1301 read, 1304 restore) | `live.motifFiles` (`saved = { repairs: autoRepairs.length, motifs: live.motifFiles }` … `live.motifFiles = saved.motifs`) |
| `lenient = true` / `lenient = false` (1306) | `live.lenient = …` |
| `const reviewModel = model;` (1312) | `const reviewModel = live.model;` |
| `taskPrompt += …` (1339, 1346) | `live.taskPrompt += …` |
| `taskPrompt` read (1375) | `live.taskPrompt` |
| `frame.paragraph`, `playbookText` (1375) | `live.frame.paragraph`, `live.playbookText` |
| `unfinishedStatus = …` (1379) | `live.unfinishedStatus = …` (stays before the throw at 1381) |
| `agentTheme = toolbox.pendingTheme;` … `agentPolicies = toolbox.pendingPolicies;` (1385–1388) | `live.agentTheme = …`, `live.agentAccountTheme = …`, `live.agentMotifPack = …`, `live.agentPolicies = …` |
| `agentOutcome = { … };` (1391) | `live.agentOutcome = { … };` |

  Check: `grep -nE '\bthis\.|\bowner\.|\brun\.id' apps/api/src/storefront-source/source-agent-stage.ts` prints nothing.

- [ ] **Step 2: Edit `generate()`.** Replace the inside of `} else if (agentEngine) { … }` (lines 1267–1391) with:

```ts
        // The tool-using agent (source-agent-stage.ts). It writes the agent's theme, policies, outcome and unfinished status
        // through `live`, the last one before it throws, so the catch below records PARTIAL/BLOCKED as before.
        await runAgentStage({ facts, live, acceptCandidate, resume: { resumable, checkpoint, checkpointKey, requestKey, merchantRequest } });
```
  Add `import { runAgentStage } from './source-agent-stage';`. Delete the imports the service no longer uses:

| Module | Remove |
|---|---|
| `./kit-touch` | `instructionConcernsKitSurfaces` (the import line is now empty: remove it) |
| `./agent/agent-workspace` | whole import |
| `node:fs/promises` | whole import (`readFile`) |
| `@pagosya/storefront-kit` | whole import (`kitPath`) |
| `./source-visual-system` | `sourceProductPageStyle`, `SOURCE_VISUAL_SYSTEM_FILE` |
| `./source-dna` | `sourceRuntimeDna` |
| `./agent/agent-loop` | `AGENT_LIMITS`, `runAgent`, `agentWallWithin`, `abortedByTimeout` (keep `agentLimits`, `agentRunHeadroom`) |
| `./source-composition-review` | whole import |
| `./product-theme` | `instructionConcernsProductCard` (that import line is now empty: remove it; keep the other `./product-theme` import `snapshotWithProductTheme`) |
| `./agent/agent-draft-previews` | whole import |
| `./agent/agent-task` | `validateTaskRequirements`, `assertTaskFeasibility`, `assertMerchantTaskCoverage` (keep `agentProjectIndex`, `workspaceDigest`) |
| `./account-theme` | whole import |
| `./source-agent-policies` | `AGENT_POLICY_KINDS` (keep `type PendingPolicies`) |
| `./agent/agent-model-anthropic` | whole import |
| `./agent/agent-model` | whole import |
| `./agent/agent-prompt` | whole import |
| `./source-shopping-flow` | whole import |
| `./source-location` | whole import |
| `./source-fonts` | `SOURCE_FONT_CHOICES` (keep `withSourceFonts`) |
| `./agent/agent-tools` | `recordTellsKept` (keep `AgentToolbox`: the `let agentTheme: AgentToolbox['pendingTheme']` declarations still use it) |

  Use eslint's `no-unused-vars` errors on the service as the final word: after this step it must list only the two pre-existing errors.

- [ ] **Step 3: Verify.** Generation suite with new file `apps/api/src/storefront-source/source-agent-stage.ts`. Expected: identical. `source-generation-agent.spec.ts` must match Task 0 exactly (about 12 minutes on its own). It covers resumable checkpoints, PARTIAL/BLOCKED rows, agent theme/policies and the onTurn attempt writes.

- [ ] **Step 4: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-agent-stage.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "refactor(source-generation): agent stage in its own module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Close Group B (benchmark digest, whole-folder run)

**Files:**
- Modify: `apps/api/scripts/benchmark-source.ts` (line 101, the `generatorDigest` file list)

**Interfaces:**
- **Consumes:** the modules of Tasks 10–15.
- **Produces:** a benchmark cache key that still changes whenever generator code changes.

- [ ] **Step 1: Keep the benchmark's generator digest honest.** `benchmark-source.ts` hashes the generator's source files to decide whether cached runs are stale. Code that moved out of the service must still count. In line 101, replace

```ts
['source-generation.service.ts','source-design.ts','source-design-planner.ts','source-fonts.ts','source-composition-registry.ts','source-site-purpose.ts','source-next.ts']
```
with
```ts
['source-generation.service.ts','source-generation-types.ts','source-style-proposals.ts','source-review-runner.ts','source-sep5-call.ts','source-save-assembly.ts','source-sep5-stage.ts','source-sep5-review.ts','source-agent-stage.ts','source-design.ts','source-design-planner.ts','source-fonts.ts','source-composition-registry.ts','source-site-purpose.ts','source-next.ts']
```
  Check with `cd apps/api && npx tsc -p tsconfig.json --noEmit --incremental false` (scripts are in the API program). Do **not** run the benchmark (it makes paid provider calls).

- [ ] **Step 2: Whole storefront-source folder.** Rerun Task 0 step 5 with `--outputFile=/tmp/sfs-after-b.json` and compare with `/tmp/sfs-before.json` using the Task 9 step 3 one-liner (`a` = before, `b` = after-b). Expected: `same failures`. The pass count must equal Task 0's plus the 3 tests added in Tasks 11–12.

- [ ] **Step 3: Size check.** `wc -l apps/api/src/storefront-source/source-generation.service.ts` → about 1,350 (from 1,936). `generate()` keeps the run setup, the design stage, `acceptCandidate`, the sketch branches, the single-call loop, the receipt and the save.

- [ ] **Step 4: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/api/scripts/benchmark-source.ts
git commit -m "chore(benchmark): generator digest covers the modules split out of the generation service" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## Group C — `apps/merchant-dashboard/src/dashboard.js`

**How the dashboard is built and served.**
- `index.html` loads `<script type="module" src="/src/dashboard.js">`.
- In development, `server.mjs` (port 4323, run by the owner's `pnpm dev` with `node --watch`) serves files from `src/` only if they are in its allow-list. That list is the long array on the line that starts `    if (["/src/domain-shop.mjs", …`. Anything else answers 404.
- `vite build` bundles the same files for production. Root-absolute imports such as `"/src/x.mjs"` resolve from the app root.
- Tests:
  - `node --test unit/*.test.mjs src/*.test.mjs` (unit; `unit/served-modules.test.mjs` checks the allow-list against every import);
  - `npx playwright test` (`tests/`, API fully mocked with `page.route`);
  - `tsconfig.json` type-checks only `src/store-settings.mjs`.
- Lint: `npx eslint <file>`. `.mjs` and `.js` files get `no-undef` as an **error**, which catches a missed rename.

**Shape today.** One `(() => { … })();` inside an ES module, about 420 top-level statements:
- element lookups;
- about 60 `let` state variables (`sessionToken`, `currentStoreId`, `lastStores`, `lastPaymentLinks`, …);
- hoisted `function`s;
- listeners attached at load.

`mountCobrosPanel(deps)`, `mountGrowthPanel(deps)` and the others are the existing pattern: `deps` passes functions and getters such as `storeId: () => currentStoreId`.

**The panel recipe (every Group C task follows it).**

1. **New module** `src/<name>.mjs`.
   - It exports `create<Name>(deps)` with a JSDoc `deps:` list, like `cobros-panel.mjs`. It imports its own helpers with relative paths (`./html.mjs`, `./ui-kit.mjs`, `./debt-csv.mjs`, …).
   - **What `create…` does:**
     1. It destructures only **function and element deps**: `const { api, errorEl, … } = deps;`.
     2. It holds, verbatim and in their original order, the moved declarations: state the screen owns, element lookups, consts, functions.
     3. It defines `function init() { … }`, which holds every moved top-level statement that is **not** a declaration (listeners, the inventory toggle, `renderProfileAvatar()`), verbatim, in their original order, with the comments directly above them.
     4. It returns `{ init, …the functions dashboard.js still calls }`.
   - `create…` itself has no side effects beyond element lookups.
2. **State that stays in dashboard.js** (any `let` that other dashboard code also reads or writes) reaches the panel as accessor deps, and is **never destructured**:
   - read: `deps.storeId()`;
   - write: `deps.setStores(value)`.

   Each task lists the exact renames inside the moved code. State used only by the moved code moves into the module unchanged.
3. **In dashboard.js:**
   - Delete the moved ranges.
   - At the position of the **first** moved range, insert the block printed in the task: `const <x>Panel = create…({ … }); const { … } = <x>Panel; <x>Panel.init();`. That position comes before every load-time use of the panel's functions, so hoisting is preserved.
   - Pass functions that are still hoisted declarations in dashboard.js (`api`, `money`, `setButtonBusy`, `refresh`, `setDashboardView`, …) and element consts directly.
   - Pass functions that come from **another panel**, or from a panel created later, as arrow wrappers `(...args) => fn(...args)`, so they resolve when called.
   - Add the import `import { create… } from "/src/<name>.mjs";` after the existing `/src/…` imports.
   - Remove imports dashboard.js no longer uses (listed per task).
4. **`server.mjs`:** add `"/src/<name>.mjs", ` to the allow-list array right after `"/src/dashboard.js", `.
5. **`unit/dashboard-panels.test.mjs`:** add `["<name>.mjs", "create<Name>"]` to `PANELS`.
6. **Verify (the dashboard check):**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard
node --check src/<name>.mjs && node --check src/dashboard.js && echo "parses"
cd /Users/saramia/pagosYa && npx eslint apps/merchant-dashboard/src/<name>.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/unit/dashboard-panels.test.mjs apps/merchant-dashboard/server.mjs
cd apps/merchant-dashboard && node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -8
npx playwright test --workers=1 --reporter=line 2>&1 | tail -6
grep -c . src/dashboard.js
```
Expected:
- `parses`;
- eslint with **no errors** (a `no-undef` error means a rename was missed; fix the module, never add a global);
- unit `fail 0`, with `pass` = 217 + one per row in `PANELS` so far;
- Playwright `150 passed, 1 skipped` (151 tests from Task 17 on). The known flaky `merchant-workspace.spec.mjs:203` counts as a pass if it passes when its file runs alone;
- dashboard.js shrinks by about the moved line count.

7. **Commit** with exact paths.

---

### Task 17: Pin store switching before moving any screen

**Files:**
- Create: `apps/merchant-dashboard/tests/dashboard-store-switch.spec.mjs`

**Interfaces:**
- **Consumes:** the dashboard as it is.
- **Produces:** a Playwright test that every later Group C task must keep green.

- [ ] **Step 1: Write the test.**

```js
import { expect, test } from "@playwright/test";

// Pins the dashboard split (2026-10-15): screens moved out of dashboard.js must read the active store when they run, not
// when they were created. Switching store reloads products, discounts, debt links, orders, finances and the inbox for
// the store picked now, and the inbox shows that store's name.
const store = (id, name) => ({ id, merchantId: "m1", slug: id, name, status: "ACTIVE", websiteRevision: 0, heroSlides: [], contentOrder: [], editorialGallery: [], links: [], locations: [], animations: [], customDomains: [], checkoutMode: "payment" });

test("switching the active store reloads the moved screens for the new store", async ({ page }) => {
  const errors = [];
  const requested = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    if (window !== window.top) return;
    sessionStorage.setItem("pagosya_merchant_session", "switch");
    sessionStorage.setItem("pagosya_merchant_email", "merchant@example.com");
  });
  await page.route("http://localhost:5175/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><main>Tienda</main>" }));
  await page.route("http://localhost:3001/v1/**", (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/v1", "");
    requested.push(path + url.search);
    let body = [];
    if (path === "/stores") body = [store("store_1", "Primera"), store("store_2", "Segunda")];
    else if (path === "/merchants/balance") body = { payableBalance: 0 };
    else if (path === "/merchants/kyc") body = { status: "APPROVED" };
    else if (path === "/merchants/invoicing_profile") body = { status: "NOT_CONFIGURED" };
    else if (path === "/merchants/finances") body = { totalRevenue: 0, paymentCount: 0, inventoryValue: 0, totalStoreViews: 0, topProducts: [], revenueByPaymentMethod: [], currency: "BOB" };
    else if (path.endsWith("/visual-studio")) body = { proposals: [], versions: [] };
    else if (path.endsWith("/source-project")) body = { revision: 0, versions: [], nextBefore: null };
    else if (path.endsWith("/domain-shop")) body = { available: false, sandbox: true, tlds: [], orders: [] };
    else if (path.endsWith("/abandoned-carts")) body = { anonymousSessions: 0, carts: [] };
    else if (path.endsWith("/assistant/conversations")) body = { conversations: [] };
    else if (path.endsWith("/assistant/unanswered")) body = { questions: [] };
    else if (path.endsWith("/assistant")) body = { settings: { enabled: false, name: null, avatarUrl: null, greeting: null, formality: "tu", notes: "" }, usage: { used: 0, cap: 300, previewUsed: 0, previewCap: 50 }, platformEnabled: true, publishedDesign: true, coupons: [] };
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/#dashboard-overview");
  await expect(page.locator("body")).toHaveClass(/is-logged-in/);
  await expect(page.locator("#sidebarStorePicker")).toHaveValue("store_1");
  await expect.poll(() => requested.includes("/stores/store_1/inbox")).toBe(true);
  requested.length = 0;

  await page.locator("#sidebarStorePicker").selectOption("store_2");

  for (const path of ["/stores/store_2/payment_links", "/stores/store_2/promo-codes", "/stores/store_2/debt-collection-links", "/merchants/orders?storeId=store_2", "/merchants/finances?storeId=store_2", "/stores/store_2/inbox"]) {
    await expect.poll(() => requested.includes(path), { message: path }).toBe(true);
  }
  await expect(page.locator("#sidebarStorePicker")).toHaveValue("store_2");
  await expect(page.locator("#inboxScopeLabel")).toHaveText("Segunda");
  expect(errors).toEqual([]);
});
```

- [ ] **Step 2: Run it on the current code.**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && npx playwright test tests/dashboard-store-switch.spec.mjs --workers=1
```
Expected: `1 passed`. It pins today's behaviour. If it fails, fix only the test's mocks: a request path that differs, or an endpoint that needs a body. Never touch `dashboard.js`.

- [ ] **Step 3: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-dashboard/tests/dashboard-store-switch.spec.mjs
git commit -m "test(dashboard): pin that switching store reloads products, discounts, debt links, orders, finances and inbox" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Extract Bandeja (inbox) → `src/inbox-panel.mjs`

**Files:**
- Create: `apps/merchant-dashboard/src/inbox-panel.mjs`
- Create: `apps/merchant-dashboard/unit/dashboard-panels.test.mjs`
- Modify: `apps/merchant-dashboard/src/dashboard.js`, `apps/merchant-dashboard/server.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `canLeaveMerchantStudio`
  - `selectMarketingTab`
  - `setDashboardView`
  - `storeId()`
  - `stores()`
- **Produces:**
  - `createInboxPanel(deps) → { init, refreshInbox }`

  The business-tools spec shows tool requests "in the dashboard inbox"; that work lands here.

**Moved:** one range, dashboard.js lines 2766–2833:
- first line `  let inboxThreadId = null;`;
- last line `  });`, the end of the `inboxReplyForm` submit listener, the line before `  function csvCell(value) {`.

  - **Into `init()`, in order:**
    - 2785 `document.getElementById("inboxDomainLink").addEventListener("click", …)`
    - 2819 `document.getElementById("inboxThreads").addEventListener("click", …)`
    - 2824 `document.getElementById("inboxReplyForm").addEventListener("submit", …)`
  - **Renames inside:**
    - `currentStoreId` → `deps.storeId()` (6 places)
    - `lastStores` → `deps.stores()` (1)

- [ ] **Step 1: Create `src/inbox-panel.mjs`:**

```js
import { escapeHtml as esc } from "./html.mjs";

/**
 * Bandeja: the store's customer threads, replies and the email-domain notice (moved from dashboard.js 2026-10-15,
 * no behaviour change). create…() only looks things up; init() attaches the listeners dashboard.js attached at load.
 *
 * deps:
 *   api(path, options)          authenticated dashboard API call
 *   canLeaveMerchantStudio()    false while Studio has unsaved work
 *   selectMarketingTab(tab)     opens a Marketing tab
 *   setDashboardView(view)      switches the dashboard view
 *   storeId()                   the active store id, read at use time
 *   stores()                    the merchant's stores, read at use time
 */
export function createInboxPanel(deps) {
  const { api, canLeaveMerchantStudio, selectMarketingTab, setDashboardView } = deps;
  // ← dashboard.js 2766–2833 except the three listener statements, with the renames above
  function init() {
    // ← the three listener statements (2785, 2819, 2824), in order
  }
  return { init, refreshInbox };
}
```

- [ ] **Step 2: Edit dashboard.js.**
  - Delete lines 2766–2833.
  - In their place insert:

```js
  // Bandeja (src/inbox-panel.mjs).
  const inboxPanel = createInboxPanel({
    api, canLeaveMerchantStudio, selectMarketingTab, setDashboardView,
    storeId: () => currentStoreId,
    stores: () => lastStores,
  });
  const { refreshInbox } = inboxPanel;
  inboxPanel.init();
```
  - Add `import { createInboxPanel } from "/src/inbox-panel.mjs";` after the last `/src/…` import.
  - No dashboard.js import becomes unused (`esc` is still used elsewhere).

- [ ] **Step 3: `server.mjs`.** Add `"/src/inbox-panel.mjs", ` to the allow-list right after `"/src/dashboard.js", `.

- [ ] **Step 4: Create `unit/dashboard-panels.test.mjs`:**

```js
import assert from "node:assert/strict";
import test from "node:test";

// Panels moved out of dashboard.js (2026-10-15) touch the page only from create…()/init(), never when imported: each must
// import under Node, with no DOM at all, and export its factory. One row per panel.
const PANELS = [
  ["inbox-panel.mjs", "createInboxPanel"],
];

for (const [file, factory] of PANELS) {
  test(`${file} imports without a DOM and exports ${factory}`, async () => {
    const module = await import(new URL(`../src/${file}`, import.meta.url));
    assert.equal(typeof module[factory], "function");
  });
}
```

- [ ] **Step 5: Verify.** Run the dashboard check with `<name>` = `inbox-panel`. Expected:
  - unit `tests 218, pass 218`;
  - Playwright 151 tests (150 passed, 1 skipped), including `dashboard-store-switch.spec.mjs` and `dashboard-smoke.spec.mjs` (the `inbox` view);
  - eslint clean.

- [ ] **Step 6: Commit.**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-dashboard/src/inbox-panel.mjs apps/merchant-dashboard/unit/dashboard-panels.test.mjs apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/server.mjs
git commit -m "refactor(dashboard): Bandeja in its own panel module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Extract discounts (promo codes + bulk discount studio) → `src/discounts-panel.mjs`

**Files:**
- Create: `src/discounts-panel.mjs`
- Modify: `src/dashboard.js`, `server.mjs`, `unit/dashboard-panels.test.mjs`

All paths are in `apps/merchant-dashboard/`.

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `errorEl`
  - `infoEl`
  - `setButtonBusy`
  - `money`
  - `storeId()`
  - `stores()`
  - `paymentLinks()`
  - `renderPaymentLinkRows(...)` (arrow)
  - `normalizeProductSearch(...)` (arrow)
- **Produces:**
  - `createDiscountsPanel(deps) → { init, bulkDiscountStudioEl, bulkDiscountClearAllEl, renderPromoCodes, renderBulkDiscountProducts }`

**Moved, in this order (dashboard.js lines):**

| Range | First line | Last line |
|---|---|---|
| 316–323 | `  let lastPromoCodes = [];` | `  const promoCodeCountEl = document.getElementById("promoCodeCount");` |
| 329–342 | `  const bulkDiscountStudioEl = document.getElementById("bulkDiscountStudio");` | `  const selectedBulkDiscountProductIds = new Set();` |
| 933–943 | `  function localDateInputValue(value) {` | `  }` (end of `localTimeInputValue`) |
| 945–1088 | `  function promoCodeDiscountLabel(code) {` | `  });` (end of the `promoCodeListEl` click listener) |
| 1090–1266 | `  function bulkDiscountDateTime(dateValue, timeValue) {` | `  });` (end of the `bulkDiscountForm` submit listener; the next line is blank, then `  document.getElementById("aiSetupLaunch")…`) |

- **Into `init()`, in order:** 970 (`promoCodeTypeEl…change`), 978 (`promoCodeFormEl…submit`), 1008 (`promoCodeListEl…change`), 1029 (`promoCodeListEl…click`), 1155 (`bulkDiscountOpen…click`), 1163 (`bulkDiscountClearAllEl…click`), 1190, 1191, 1192, 1193, 1205, 1212 (`[bulkDiscountPercentEl, …].forEach(…)`), 1218 (`bulkDiscountForm…submit`).
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (9)
  - `lastStores` → `deps.stores()` (1)
  - `lastPaymentLinks` → `deps.paymentLinks()` (6)
- **Imports in the module:** `import { escapeHtml as esc } from "./html.mjs";`, `import { uiSwitch } from "./ui-kit.mjs";`.
- **Factory head:** `export function createDiscountsPanel(deps) { const { api, errorEl, infoEl, setButtonBusy, money, renderPaymentLinkRows, normalizeProductSearch } = deps;`

- [ ] **Step 1: Create the module** following the recipe, with the JSDoc `deps:` list above.

- [ ] **Step 2: Edit dashboard.js.**
  - Delete the five ranges.
  - At the position of line 316 (right after `  let lastPaymentLinks = [];`) insert:

```js
  // Descuentos: promo codes and the bulk discount studio (src/discounts-panel.mjs).
  const discountsPanel = createDiscountsPanel({
    api, errorEl, infoEl, setButtonBusy, money,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    paymentLinks: () => lastPaymentLinks,
    renderPaymentLinkRows: (...args) => renderPaymentLinkRows(...args),
    normalizeProductSearch: (...args) => normalizeProductSearch(...args),
  });
  const { bulkDiscountStudioEl, bulkDiscountClearAllEl, renderPromoCodes, renderBulkDiscountProducts } = discountsPanel;
  discountsPanel.init();
```
  - Add the import `import { createDiscountsPanel } from "/src/discounts-panel.mjs";`.
  - Delete `import { uiSwitch } from "/src/ui-kit.mjs";`, which is now unused.

- [ ] **Step 3: `server.mjs` + panels test.** Add `"/src/discounts-panel.mjs", `. Add the `["discounts-panel.mjs", "createDiscountsPanel"]` row.

- [ ] **Step 4: Verify.** Dashboard check (`discounts-panel`). Expected: unit `pass 219`; Playwright as before (`growth.spec.mjs` and `store-settings.spec.mjs` exercise promo codes); eslint clean.

- [ ] **Step 5: Commit.**

```bash
cd /Users/saramia/pagosYa && D=apps/merchant-dashboard
git add $D/src/discounts-panel.mjs $D/src/dashboard.js $D/server.mjs $D/unit/dashboard-panels.test.mjs
git commit -m "refactor(dashboard): promo codes and bulk discounts in their own panel module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Extract products (payment links list) → `src/products-panel.mjs`

**Files:**
- Create: `src/products-panel.mjs`
- Modify: `src/dashboard.js`, `server.mjs`, `unit/dashboard-panels.test.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `errorEl`
  - `infoEl`
  - `money`
  - `syncStoreResourceViews`
  - `dashboardAssetUrl`
  - `bulkDiscountStudioEl`
  - `bulkDiscountClearAllEl`
  - `storeId()`
  - `categories()`
  - `paymentLinks()`
  - `setPaymentLinks(links)`
  - `renderBulkDiscountProducts(...)` (arrow)
  - `refreshFinancesInBackground(...)` (arrow)
- **Produces:**
  - `createProductsPanel(deps) → { init, beginPaymentLinkEdit, renderPaymentLinkRows, normalizeProductSearch, resetPaymentLinkBrowseState }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 324–328 | `  const paymentLinkPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);` | `  const paymentLinkSearchSummaryEl = document.getElementById("paymentLinkSearchSummary");` |
| 2998–3260 | ``  /** `step` (Crecimiento): open the guide at description, price, photos or stock instead of the first question. */`` | `  });` (end of the `paymentLinkSearchClearEl` click listener; the line before the blank line and `  async function api(path, options = {}) {`) |

- **Into `init()`:** 3251 (`paymentLinkSearchEl…input`), 3256 (`paymentLinkSearchClearEl…click`).
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (5)
  - `lastCategories` → `deps.categories()` (2)
  - `lastPaymentLinks` reads → `deps.paymentLinks()` (9)
  - the write `lastPaymentLinks = links;` (line 3011) → `deps.setPaymentLinks(links);`
- **Imports:** `./html.mjs` (`esc`).
- **Factory head:** `export function createProductsPanel(deps) { const { api, errorEl, infoEl, money, syncStoreResourceViews, dashboardAssetUrl, bulkDiscountStudioEl, bulkDiscountClearAllEl, renderBulkDiscountProducts, refreshFinancesInBackground } = deps;`

- [ ] **Step 1: Create the module** (recipe).

- [ ] **Step 2: Edit dashboard.js.**
  - Delete both ranges.
  - At the position of the old line 324 (right after the Task 19 block) insert:

```js
  // Productos: payment links list, search and the edit guide (src/products-panel.mjs).
  const productsPanel = createProductsPanel({
    api, errorEl, infoEl, money, syncStoreResourceViews, dashboardAssetUrl, bulkDiscountStudioEl, bulkDiscountClearAllEl,
    storeId: () => currentStoreId,
    categories: () => lastCategories,
    paymentLinks: () => lastPaymentLinks,
    setPaymentLinks: (links) => { lastPaymentLinks = links; },
    renderBulkDiscountProducts: (...args) => renderBulkDiscountProducts(...args),
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
  });
  const { beginPaymentLinkEdit, renderPaymentLinkRows, normalizeProductSearch, resetPaymentLinkBrowseState } = productsPanel;
  productsPanel.init();
```
  - Add the import `import { createProductsPanel } from "/src/products-panel.mjs";`.

- [ ] **Step 3: `server.mjs` + panels test row** (`products-panel.mjs`, `createProductsPanel`).

- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 220`; Playwright as before (`merchant-workspace`, `growth` "editProduct", `cobros`, `store-settings` cover payment links); eslint clean.

- [ ] **Step 5: Commit** (`refactor(dashboard): products list in its own panel module`), adding `src/products-panel.mjs src/dashboard.js server.mjs unit/dashboard-panels.test.mjs`.

---

### Task 21: Extract debt collection links → `src/debt-links-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `apiBaseEl`
  - `emailEl`
  - `errorEl`
  - `infoEl`
  - `checkoutOriginEl`
  - `money`
  - `storeId()`
  - `sessionToken()`
  - `debtLinks()`
  - `setDebtLinks(links)`
- **Produces:**
  - `createDebtLinksPanel(deps) → { init, resetDebtCollectionEntry, renderDebtCollectionLinks }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 344–351 | `  const debtCollectionPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);` | `  let debtAppendTarget = null;` |
| 470 | `  let debtLinkStatusTab = "ACTIVE";` | (same line) |
| 1633–1766 | `  function resetDebtCollectionEntry(statusText = "") {` | `  });` (end of the `debtCollectionForm` submit listener; the line before the blank line and `  function selectStore(storeId) {`) |
| 1824–2106 | `  function debtCollectionUrl(slug) {` | `  }` (end of `renderDebtCollectionLinks`; the line before the blank line and `  function stopQuickPaymentPolling() {`) |

`let lastDebtCollectionLinks = [];` (line 343) **stays** in dashboard.js: `selectStore()` writes it.

- **Into `init()`:** 1664 (`debtAppendCancel…click`), 1666 (`input[name="debtInputMode"]…forEach`), 1673 (`debtCsvInput…change`), 1721 (`debtCollectionForm…submit`).
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (14)
  - `sessionToken` → `deps.sessionToken()` (1)
  - reads of `lastDebtCollectionLinks` (1965, 1971) → `deps.debtLinks()`
  - the write `lastDebtCollectionLinks = links;` (1829) → `deps.setDebtLinks(links);`
- **Imports:** `./html.mjs` (`esc`), `import { parseDebtCollectionRows, parseDebtCsv } from "./debt-csv.mjs";`.
- **Factory head:** `export function createDebtLinksPanel(deps) { const { api, apiBaseEl, emailEl, errorEl, infoEl, checkoutOriginEl, money } = deps;`

- [ ] **Step 1: Create `src/debt-links-panel.mjs`** (recipe).

- [ ] **Step 2: Edit dashboard.js.**
  - Delete the four ranges.
  - At the position of line 344 (right after `  let lastDebtCollectionLinks = [];`) insert:

```js
  // Cobrar deudas: debt collection links (src/debt-links-panel.mjs).
  const debtLinksPanel = createDebtLinksPanel({
    api, apiBaseEl, emailEl, errorEl, infoEl, checkoutOriginEl, money,
    storeId: () => currentStoreId,
    sessionToken: () => sessionToken,
    debtLinks: () => lastDebtCollectionLinks,
    setDebtLinks: (links) => { lastDebtCollectionLinks = links; },
  });
  const { resetDebtCollectionEntry, renderDebtCollectionLinks } = debtLinksPanel;
  debtLinksPanel.init();
```
  - Import `createDebtLinksPanel` from `"/src/debt-links-panel.mjs"`.
  - In the `/src/debt-csv.mjs` import, remove `parseDebtCollectionRows, parseDebtCsv` and keep `debtAmountInCents` (quick payment still uses it until Task 22).

- [ ] **Step 3: `server.mjs` + panels test row.**

- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 221`; Playwright as before (`store-settings.spec.mjs` covers debt collection); eslint clean.

- [ ] **Step 5: Commit** (`refactor(dashboard): debt collection links in their own panel module`).

---

### Task 22: Extract quick payment → `src/quick-payment-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `storeId()`
  - `refreshFinancesInBackground(...)` (arrow)
- **Produces:**
  - `createQuickPaymentPanel(deps) → { init, stopQuickPaymentPolling }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 352–353 | `  let quickPaymentPollTimer = null;` | `  let quickPaymentPollGeneration = 0;` |
| 1582–1631 | `  document.getElementById("quickPaymentForm").addEventListener("submit", async (event) => {` | `  });` (end of the `quickPaymentNew` click listener) |
| 2108–2151 | `  function stopQuickPaymentPolling() {` | `  }` (end of `pollQuickPayment`; the line before the blank line and `  function renderCurrentStoreBanner() {`) |

- **Into `init()`:** 1582 (`quickPaymentForm…submit`), 1625 (`quickPaymentNew…click`).
- **Renames inside:** `currentStoreId` → `deps.storeId()` (2).
- **Imports:** `import { debtAmountInCents } from "./debt-csv.mjs";`.
- **Factory head:** `export function createQuickPaymentPanel(deps) { const { api, refreshFinancesInBackground } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete the three ranges.
  - At the position of line 352 insert:

```js
  // Cobro rápido (src/quick-payment-panel.mjs).
  const quickPaymentPanel = createQuickPaymentPanel({
    api,
    storeId: () => currentStoreId,
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
  });
  const { stopQuickPaymentPolling } = quickPaymentPanel;
  quickPaymentPanel.init();
```
  - Import `createQuickPaymentPanel`.
  - Delete the now-empty `import { debtAmountInCents } from "/src/debt-csv.mjs";` line.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 222`; Playwright as before (`store-settings.spec.mjs` covers quick payment).
- [ ] **Step 5: Commit** (`refactor(dashboard): quick payment in its own panel module`).

---

### Task 23: Extract finances → `src/finances-panel.mjs`

Money visibility (`MONEY_VISIBILITY_KEY`, `monetaryValuesHidden`, `money()`, `moneyNumber()`, `setMonetaryValuesHidden()`) **stays** in dashboard.js. It re-renders every screen, so it belongs to the shell.

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `money`
  - `moneyNumber`
  - `renderOverview`
  - `storeId()`
  - `stores()`
  - `setSettlement(schedule)`
  - `setPayouts(payouts)`
  - `setTotalFinances(finances)`
  - `setFinances(finances)`
- **Produces:**
  - `createFinancesPanel(deps) → { init, renderBalanceCards, renderSettlementPanel, renderInternationalCard, renderPayoutRows, renderTotalFinances, renderFinances, refreshFinancesInBackground }`
  - `init` is empty: this screen attaches nothing at load. Keep it so every panel has the same shape.

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 2304–2341 | `  // One row per currency in the "Tu cuenta" list on Resumen. available/pending/reserve` | `  }` (end of `renderSettlementPanel`; the next code line is `  function storePublicationState(store) {`) |
| 2365–2380 | `  function renderInternationalCard(intl) {` | `  }` |
| 2395–2409 | `  function renderPayoutRows(payouts) {` | `  }` |
| 2436–2594 | `  const PAYMENT_METHOD_META = {` | `  }` (end of `refreshFinancesInBackground`) |
| 2596–2603 | `  // Shows only the last 4 digits — a payout row has no reason to repeat the` | `  }` (end of `maskBankAccount`) |

`renderOverview`, `storePublicationState` and `setPasswordVisible` (2343–2393) and `setMonetaryValuesHidden` with its two load-time statements (2411–2435) stay.

- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (3)
  - `lastStores` → `deps.stores()` (1)
  - `lastSettlement = schedule;` (2325) → `deps.setSettlement(schedule);`
  - `lastPayouts = payouts;` (2396) → `deps.setPayouts(payouts);`
  - `lastTotalFinances = finances;` (2480) → `deps.setTotalFinances(finances);`
  - `lastFinances = finances;` (2532) → `deps.setFinances(finances);`

  Those four are the only references, all writes; the reads stay in dashboard.js.
- **Imports:** `./html.mjs` (`esc`), `import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "./settlement.mjs";`.
- **Factory head:** `export function createFinancesPanel(deps) { const { api, money, moneyNumber, renderOverview } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete the five ranges.
  - At the position of line 2304 insert:

```js
  // Finanzas: balances, settlement, international payments, payouts and the finance charts (src/finances-panel.mjs).
  const financesPanel = createFinancesPanel({
    api, money, moneyNumber, renderOverview,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    setSettlement: (schedule) => { lastSettlement = schedule; },
    setPayouts: (payouts) => { lastPayouts = payouts; },
    setTotalFinances: (finances) => { lastTotalFinances = finances; },
    setFinances: (finances) => { lastFinances = finances; },
  });
  const { renderBalanceCards, renderSettlementPanel, renderInternationalCard, renderPayoutRows, renderTotalFinances, renderFinances, refreshFinancesInBackground } = financesPanel;
  financesPanel.init();
```
  - Import `createFinancesPanel`.
  - Delete `import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "/src/settlement.mjs";`.
  - The 60-second `setInterval` (line 26) and the `visibilitychange` listener call `refreshFinancesInBackground` only from callbacks, so they work unchanged.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 223`; Playwright as before (`settlement.spec.mjs`, `international-payments.spec.mjs`, `merchant-levels.spec.mjs`, `auth-account.spec.mjs` money toggle).
- [ ] **Step 5: Commit** (`refactor(dashboard): finances in their own panel module`).

---

### Task 24: Extract orders (table, filters, downloads) → `src/orders-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `apiBaseEl`
  - `errorEl`
  - `infoEl`
  - `money`
  - `refresh`
  - `storeId()`
  - `stores()`
  - `payments()`
  - `finances()`
  - `sessionToken()`
- **Produces:**
  - `createOrdersPanel(deps) → { init, renderPaymentRows, resetPaymentPage }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 454–457 | `  let paymentStatusFilter = "active";` | `  const PAYMENT_PAGE_SIZE = 20;` (includes `let paymentPage = 1;`) |
| 468 | `  let renderShipmentPanel = null;` | (same line) |
| 2605–2764 | `  // "active" hides REQUIRES_PAYMENT_METHOD specifically — a customer who` | `  });` (end of the `orderSearch` input listener) |
| 2835–2996 | `  function csvCell(value) {` | `  });` (end of the `downloadFinancePdf` click listener; the line before the blank line and the `/** \`step\` (Crecimiento) …` comment, or `  async function api(` after Task 20) |

**New code in the module** (the only code that is not moved). The one outside use of `paymentPage` is `refresh()`'s `paymentPage = 1;`:

```js
  /** refresh() starts the orders table on its first page again. */
  function resetPaymentPage() { paymentPage = 1; }
```

- **Into `init()`:** 2755 (`paymentStatusFilter…change`), 2760 (`orderSearch…input`), 2906 (`downloadOrdersCsv`), 2911 (`downloadOrdersPdf`), 2935 (`downloadSalesCsv`), 2958 (`downloadPayoutsPdf`), 2975 (`downloadFinancePdf`).
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (11)
  - `lastStores` → `deps.stores()` (4)
  - `lastPayments` → `deps.payments()` (4)
  - `lastFinances` → `deps.finances()` (1)
  - `sessionToken` → `deps.sessionToken()` (1)

  `paymentPage` and `renderShipmentPanel` move with their code and keep their names. The dynamic `import('/src/shipment-panel.mjs')` stays as written; that module is already served.
- **Imports:** `./html.mjs` (`esc`).
- **Factory head:** `export function createOrdersPanel(deps) { const { api, apiBaseEl, errorEl, infoEl, money, refresh } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete the four ranges.
  - At the position of line 454 insert:

```js
  // Pedidos: orders table, filters and CSV/PDF downloads (src/orders-panel.mjs).
  const ordersPanel = createOrdersPanel({
    api, apiBaseEl, errorEl, infoEl, money, refresh,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    payments: () => lastPayments,
    finances: () => lastFinances,
    sessionToken: () => sessionToken,
  });
  const { renderPaymentRows, resetPaymentPage } = ordersPanel;
  ordersPanel.init();
```
  - In `refresh()`, replace the line `      paymentPage = 1;` (right after `      lastPayments = payments;`) with `      resetPaymentPage();`.
  - Import `createOrdersPanel`.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 224`; Playwright as before (`store-settings.spec.mjs` covers `downloadOrdersCsv`, `orderSearch`, `paymentStatusFilter`; `shipment-panel.spec.mjs` covers the lazy shipment panel).
- [ ] **Step 5: Commit** (`refactor(dashboard): orders table and downloads in their own panel module`).

---

### Task 25: Extract Mi tienda (stores list, thumbnails, Shopify import, selection) → `src/stores-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `emailEl`
  - `errorEl`
  - `canLeaveMerchantStudio`
  - `syncMerchantStoreWorkspace`
  - `setDashboardView`
  - `dashboardAssetUrl`
  - `openWalkthrough`
  - `openCreateStore`
  - `selectStore`
  - `currentStoreUrl`
  - `publicStoreUrl`
  - `setButtonBusy`
  - `storePublicationState`
  - `refresh`
  - `storeId()`
  - `stores()`
  - `setStores(stores)`
  - `onboardingEnabled()`
- **Produces:**
  - `createStoresPanel(deps) → { init, watchStoreThumbnails, unloadStoreThumbnails, openShopifyImport, renderCurrentStoreBanner, renderStoreRows }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 459–460 | `  // The ids picked in the stores list while "Seleccionar" is on; null when it is off.` | `  let storeSelection = null, visibleStoreIds = [];` |
| 766–793 | `  // Each card's thumbnail runs that store's whole live site (scripts, animations, video) in its own Studio. They load` | `  }` (end of `unloadStoreThumbnails`; the line before the blank line and `  function setDashboardView(view, { remember = true } = {}) {`) |
| 1374–1547 | `  // Traer mi tienda de Shopify (spec 2026-09-27): paste the address or the CSV, review, import, then pick the look.` | `  });` (end of the `sidebarStorePicker` change listener; the line before the blank line and `  document.getElementById("createStoreForm").addEventListener("submit", …`) |
| 2153–2286 | `  function renderCurrentStoreBanner() {` | `  });` (end of the `shareCurrentStoreLink` click listener) |

Not moved:
- `openCreateStore` (1365–1371) and the `createStoreForm` submit handler (1549–1580) stay in dashboard.js. `unit/create-store.test.mjs` reads that handler from dashboard.js.
- `selectStore`, `updateSelectedStoreDomains`, `currentStoreUrl`, `publicStoreUrl`, `merchantStoreViewUrl` (1768–1822) stay too.

- **Into `init()`, in order:** 1441, 1442, 1443, 1444, 1446, 1458, 1469, 1484, 1497, 1504, 1525, 1526, 1528, 1529, 1540, 1541, 1542, 2256, 2266. These are the Shopify import dialog listeners, the selection/bulk-delete buttons, the library search/status, the sidebar store picker, and copy/share store link.
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (13)
  - `lastStores` reads → `deps.stores()` (6)
  - the write `lastStores = stores;` (2163, first line of `renderStoreRows`) → `deps.setStores(stores);`
  - `onboardingEnabled` → `deps.onboardingEnabled()` (2)
- **Imports in the module:**

```js
import { escapeHtml as esc } from "./html.mjs";
import { isUnfinishedStore } from "./onboarding-walkthrough.mjs";
import { countsLine, designStepItems, importStep, parseExchangeRate, progressLabel, summaryLines } from "./store-import.mjs";
import { openStoreBulkDelete } from "./store-bulk-delete.mjs";
```
- **Factory head:** `export function createStoresPanel(deps) { const { api, emailEl, errorEl, canLeaveMerchantStudio, syncMerchantStoreWorkspace, setDashboardView, dashboardAssetUrl, openWalkthrough, openCreateStore, selectStore, currentStoreUrl, publicStoreUrl, setButtonBusy, storePublicationState, refresh } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete the four ranges.
  - At the position of line 459 (right after `  let lastStores = [];`) insert:

```js
  // Mi tienda: the stores list, thumbnails, Shopify import, selection and the current store's links (src/stores-panel.mjs).
  // Created here, before setDashboardView first runs at load: it calls watchStoreThumbnails/unloadStoreThumbnails.
  const storesPanel = createStoresPanel({
    api, emailEl, errorEl, canLeaveMerchantStudio, syncMerchantStoreWorkspace, setDashboardView, dashboardAssetUrl,
    openWalkthrough, openCreateStore, selectStore, currentStoreUrl, publicStoreUrl, setButtonBusy, storePublicationState, refresh,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    setStores: (stores) => { lastStores = stores; },
    onboardingEnabled: () => onboardingEnabled,
  });
  const { watchStoreThumbnails, unloadStoreThumbnails, openShopifyImport, renderCurrentStoreBanner, renderStoreRows } = storesPanel;
  storesPanel.init();
```
  - Import `createStoresPanel`.
  - Delete from dashboard.js:
    - the `isUnfinishedStore` name from the `/src/onboarding-walkthrough.mjs` import (keep `runWalkthrough, showWalkthroughChoice, walkthroughEntry`);
    - the whole `/src/store-import.mjs` import;
    - the whole `/src/store-bulk-delete.mjs` import.

  The served-modules test still finds those modules through `stores-panel.mjs`'s relative imports.
- [ ] **Step 3: Update the wiring test** that reads source text. In `src/onboarding-walkthrough.test.mjs`, test `'dashboard wiring: Salir refreshes the data, the list shows Sin terminar + Continuar, create offers the choice'`:
  - Replace its first line

```js
  const src = readFileSync(new URL('./dashboard.js', import.meta.url), 'utf8');
```
with
```js
  // The stores list moved to stores-panel.mjs (2026-10-15): the wiring is read across both files.
  const src = ['./dashboard.js', './stores-panel.mjs'].map(file => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
```
  - In its two `isUnfinishedStore` assertions, replace `isUnfinishedStore\(store, onboardingEnabled\)` with `isUnfinishedStore\(store, deps\.onboardingEnabled\(\)\)`. Leave the rest of each regex as is.
  - The other four assertions stay.

- [ ] **Step 4: `server.mjs` + panels test row.**
- [ ] **Step 5: Verify.** Dashboard check. Expected:
  - unit `pass 225`, including the updated wiring test;
  - Playwright as before (`single-store.spec.mjs` status filter, `store-bulk-delete.spec.mjs`, `merchant-workspace.spec.mjs` store rows, `dashboard-store-switch.spec.mjs` picker).
- [ ] **Step 6: Commit** (`refactor(dashboard): Mi tienda list, Shopify import and store selection in their own panel module`), adding `src/stores-panel.mjs src/dashboard.js src/onboarding-walkthrough.test.mjs server.mjs unit/dashboard-panels.test.mjs`.

---

### Task 26: Extract inventory import → `src/inventory-import-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `errorEl`
  - `infoEl`
  - `checkoutOriginEl`
  - `money`
  - `initInlineCollapsible`
  - `uploadFile`
  - `storeId()`
  - `stores()`
  - `paymentLinks()`
  - `categories()`
  - `setCategories(categories)`
  - `renderCurrentStoreBanner(...)` (arrow)
  - `renderStoreRows(...)` (arrow)
  - `refreshFinancesInBackground(...)` (arrow)
  - `renderPaymentLinkRows(...)` (arrow)
  - `resetPaymentLinkBrowseState(...)` (arrow)
- **Produces:**
  - `createInventoryImportPanel(deps) → { init, renderInventoryReview, resetInventoryImportState, preparedRowCount }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 905–931 | `  const inventoryToggle = document.createElement("button");` | `  let inventoryImportVersion = 0;` (includes `let preparedInventoryRows = [];`) |
| 3395–3719 | `  function renderInventoryAiWarnings(warnings = []) {` | `  });` (end of the `inventoryCommitEl` click listener; the line before the blank line and `  // The login's mesh gradient runs only while the login is on screen.`) |

`uploadFile` (3385–3393) stays in dashboard.js. The assistant panel and the walkthrough use it too.

**New code in the module.** The one outside use of `preparedInventoryRows` is `setMonetaryValuesHidden`'s `if (preparedInventoryRows.length) renderInventoryReview();`:

```js
  /** How many rows the import has prepared (setMonetaryValuesHidden re-renders the review only when there are some). */
  function preparedRowCount() { return preparedInventoryRows.length; }
```

- **Into `init()`, in order:**
  - the toggle setup 906–909 (`inventoryToggle.type = "button";` through `document.querySelector(".inventory-import-head")?.appendChild(inventoryToggle);`);
  - 910 (`initInlineCollapsible("inventoryImporter", …)`);
  - 911 (`checkoutOriginEl.addEventListener("change", …)`);
  - 3472, 3473, 3537, 3542, 3545, 3550, 3555, 3556, 3590, 3591, 3593 (`inventoryPrepare`), 3646 (`inventoryCommitEl`).

  `const inventoryToggle = document.createElement("button");` stays in `create…`: creating an element has no visible effect until it is appended.
- **Renames inside:**
  - `currentStoreId` → `deps.storeId()` (13)
  - `lastStores` → `deps.stores()` (3)
  - `lastPaymentLinks` → `deps.paymentLinks()` (1)
  - line 3697 `lastCategories = [...lastCategories, ...categoriesCreated];` → `deps.setCategories([...deps.categories(), ...categoriesCreated]);`
- **Imports:** `./html.mjs` (`esc`), `import { prepareAiInventoryRows } from "./inventory-import.mjs";`.
- **Factory head:** `export function createInventoryImportPanel(deps) { const { api, errorEl, infoEl, checkoutOriginEl, money, initInlineCollapsible, uploadFile, renderCurrentStoreBanner, renderStoreRows, refreshFinancesInBackground, renderPaymentLinkRows, resetPaymentLinkBrowseState } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete both ranges.
  - At the position of line 905 (right after `  initSidebarMenuHandle();`, where `const inventoryToggle` was) insert:

```js
  // Importar inventario (src/inventory-import-panel.mjs).
  const inventoryPanel = createInventoryImportPanel({
    api, errorEl, infoEl, checkoutOriginEl, money, initInlineCollapsible, uploadFile,
    storeId: () => currentStoreId,
    stores: () => lastStores,
    paymentLinks: () => lastPaymentLinks,
    categories: () => lastCategories,
    setCategories: (categories) => { lastCategories = categories; },
    renderCurrentStoreBanner: (...args) => renderCurrentStoreBanner(...args),
    renderStoreRows: (...args) => renderStoreRows(...args),
    refreshFinancesInBackground: (...args) => refreshFinancesInBackground(...args),
    renderPaymentLinkRows: (...args) => renderPaymentLinkRows(...args),
    resetPaymentLinkBrowseState: (...args) => resetPaymentLinkBrowseState(...args),
  });
  const { renderInventoryReview, resetInventoryImportState, preparedRowCount } = inventoryPanel;
  inventoryPanel.init();
```
  - In `setMonetaryValuesHidden`, replace `    if (preparedInventoryRows.length) renderInventoryReview();` with `    if (preparedRowCount()) renderInventoryReview();`.
  - Import `createInventoryImportPanel`.
  - Delete `import { prepareAiInventoryRows } from "/src/inventory-import.mjs";`.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 226`; Playwright as before (`store-settings.spec.mjs` covers the inventory connection and import; `merchant-workspace.spec.mjs` "integration logos load and extension details preserve the inventory draft").
- [ ] **Step 5: Commit** (`refactor(dashboard): inventory import in its own panel module`).

---

### Task 27: Extract Cuenta (account, KYC, terms, level) → `src/account-panel.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `emailEl`
  - `errorEl`
  - `infoEl`
  - `profileMenuEl`
  - `setDashboardView`
  - `setButtonBusy`
  - `refresh`
  - `stores()`
  - `profileSessionsPayload()`
  - `loadProfileSessions(...)` (arrow)
- **Produces:**
  - `createAccountPanel(deps) → { init, renderAccount, renderLevel, renderTermsPrompt }`

**Moved:**

| Range | First line | Last line |
|---|---|---|
| 1281–1325 | `  const KYC_LABELS = { APPROVED: "Verificado", PENDING: "En revisión", …` | `  document.getElementById("accountLogoutProxy")?.addEventListener("click", () => document.getElementById("logout")?.click());` |
| 4068–4208 | `  document.getElementById("internationalPaymentsCard").addEventListener("click", async (event) => {` | `  });` (end of the `invoicingForm` submit listener; the line before the blank line and `  if (sessionToken) {`) |

`dashboardAssetUrl` (1273–1278) stays: Mi tienda and products use it.

- **Into `init()`, in order:** 1317, 1323, 1324, 1325, 4068, 4120, 4121, 4122, 4159, 4175, 4194.
- **Renames inside:**
  - `lastStores` → `deps.stores()` (2)
  - `lastProfileSessionsPayload` → `deps.profileSessionsPayload()` (2)
- **Imports:** `./html.mjs` (`esc`).
- **Factory head:** `export function createAccountPanel(deps) { const { api, emailEl, errorEl, infoEl, profileMenuEl, setDashboardView, setButtonBusy, refresh, loadProfileSessions } = deps;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete both ranges.
  - At the position of line 1281 insert:

```js
  // Cuenta: account card, KYC, terms and the affiliation level (src/account-panel.mjs).
  const accountPanel = createAccountPanel({
    api, emailEl, errorEl, infoEl, profileMenuEl, setDashboardView, setButtonBusy, refresh,
    stores: () => lastStores,
    profileSessionsPayload: () => lastProfileSessionsPayload,
    loadProfileSessions: (...args) => loadProfileSessions(...args),
  });
  const { renderAccount, renderLevel, renderTermsPrompt } = accountPanel;
  accountPanel.init();
```
  - Import `createAccountPanel`.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 227`; Playwright as before (`terms-acceptance.spec.mjs`, `merchant-levels.spec.mjs`, `international-payments.spec.mjs`, `auth-account.spec.mjs`).
- [ ] **Step 5: Commit** (`refactor(dashboard): account, KYC, terms and level in their own panel module`).

---

### Task 28: Extract profile and sessions → `src/profile-sessions.mjs`

**Interfaces:**
- **Consumes (deps):**
  - `api`
  - `setButtonBusy`
  - `emailEl`
  - `elements`: `{ loggedInAsEl, profileMenuEl, profileMenuTriggerEl, profileTriggerAvatarEl, profileMenuAvatarEl, accountAvatarEl, profileDisplayNameEl, profileSessionsEl, profileSessionCountEl, sessionProfileDialogEl, sessionProfileFormEl, sessionProfileExistingEl, sessionProfileChoicesEl, sessionProfileNameEl, sessionProfileErrorEl, sessionProfileContinueEl }`
  - `profileName()`
  - `setProfileName(name)`
  - `profileSessionsPayload()`
  - `setProfileSessionsPayload(payload)`
- **Produces:**
  - `createProfileSessions(deps) → { init, applyProfileIdentity, loadProfileSessions, chooseProfileForNewLogin }`

**Moved:** one range, 70–309:
- first line `  let editingProfileSessionId = null;`;
- last line `  });`, the end of the `profileSessionsEl` submit listener, the line before the blank line and `  const checkoutOriginEl = document.getElementById("checkoutOrigin");`.

`let currentProfileName` (68) and `let lastProfileSessionsPayload` (69) stay. Login and logout (auth) write the first, and the account panel reads the second.

- **Into `init()`, in order:** 111 (`renderProfileAvatar();`), 220, 226, 229, 230, 259, 266 (`window…resize`), 267 (`window…scroll`), 268, 296.

  `init()` now runs at line 70's position instead of 111. Nothing between them changes `emailEl.value` or `currentProfileName`, so the first avatar is the same.
- **Renames inside:**
  - `currentProfileName` reads (90, 98, 102, 108, 244) → `deps.profileName()`
  - the writes at 107 and 243 → `deps.setProfileName(session.profileName || profileNameFromEmail(emailEl.value));` and `deps.setProfileName(profileName);`
  - `lastProfileSessionsPayload = { ...payload, limit, active, sessions };` (133) → `deps.setProfileSessionsPayload({ ...payload, limit, active, sessions });`
  - its reads (276, 282) → `deps.profileSessionsPayload()`
- **Imports:** `./html.mjs` (`esc`), `import { profileInitials } from "./profile-initials.mjs";`, `import { greetingFor } from "./overview.mjs";`.
- **Factory head:** `export function createProfileSessions(deps) { const { api, setButtonBusy, emailEl } = deps; const { loggedInAsEl, profileMenuEl, profileMenuTriggerEl, profileTriggerAvatarEl, profileMenuAvatarEl, accountAvatarEl, profileDisplayNameEl, profileSessionsEl, profileSessionCountEl, sessionProfileDialogEl, sessionProfileFormEl, sessionProfileExistingEl, sessionProfileChoicesEl, sessionProfileNameEl, sessionProfileErrorEl, sessionProfileContinueEl } = deps.elements;`

- [ ] **Step 1: Create the module.**
- [ ] **Step 2: Edit dashboard.js.**
  - Delete lines 70–309.
  - In their place, right after `  let lastProfileSessionsPayload = null;`, insert:

```js
  // Perfil y sesiones: the profile menu, active sessions and the profile picker after login (src/profile-sessions.mjs).
  const profilePanel = createProfileSessions({
    api, setButtonBusy, emailEl,
    elements: { loggedInAsEl, profileMenuEl, profileMenuTriggerEl, profileTriggerAvatarEl, profileMenuAvatarEl, accountAvatarEl, profileDisplayNameEl, profileSessionsEl, profileSessionCountEl, sessionProfileDialogEl, sessionProfileFormEl, sessionProfileExistingEl, sessionProfileChoicesEl, sessionProfileNameEl, sessionProfileErrorEl, sessionProfileContinueEl },
    profileName: () => currentProfileName,
    setProfileName: (name) => { currentProfileName = name; },
    profileSessionsPayload: () => lastProfileSessionsPayload,
    setProfileSessionsPayload: (payload) => { lastProfileSessionsPayload = payload; },
  });
  const { applyProfileIdentity, loadProfileSessions, chooseProfileForNewLogin } = profilePanel;
  profilePanel.init();
```
  - Import `createProfileSessions`.
  - Delete `import { profileInitials } from "/src/profile-initials.mjs";`.
  - Delete `import { escapeHtml as esc } from "/src/html.mjs";` **only if** eslint reports `esc` unused. At `5a206a30` every remaining use of `esc` is in a moved range.
  - Keep `greetingFor`: `renderOverview` still uses it.
- [ ] **Step 3: `server.mjs` + panels test row.**
- [ ] **Step 4: Verify.** Dashboard check. Expected: unit `pass 228`; Playwright as before (`auth-account.spec.mjs` covers the profile menu, the session profile dialog and the money toggle).
- [ ] **Step 5: Commit** (`refactor(dashboard): profile and sessions in their own module`).

---

### Task 29: Close Group C (production build, full suites)

**Files:** none.

**Interfaces:**
- **Consumes:** Tasks 17–28.
- **Produces:** a verified dashboard build.

- [ ] **Step 1: Production bundle.**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && npx tsc -p tsconfig.json && npx vite build 2>&1 | tail -5
```
Expected: `tsc` clean; Vite `✓ built in …`, with `dist/` written (git-ignored) and no unresolved import of `/src/*-panel.mjs`.

- [ ] **Step 2: Everything the dashboard owns.**

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard
node --test unit/*.test.mjs src/*.test.mjs 2>&1 | tail -8          # pass 228, fail 0
npx playwright test --workers=1 --reporter=line 2>&1 | tail -6     # 151 tests: 150 passed, 1 skipped
wc -l src/dashboard.js                                              # about 1,500 (from 4,223)
```
Expected: as commented, and only the known flaky test may need its solo rerun.

- [ ] **Step 3: Repo-wide checks.**

```bash
cd /Users/saramia/pagosYa
pnpm check:boundaries 2>&1 | grep -E '^\s+error' | diff /tmp/boundaries-before.txt - && echo "boundaries unchanged"
npx eslint apps/merchant-dashboard/src apps/merchant-dashboard/unit apps/merchant-dashboard/server.mjs 2>&1 | tail -3
```
Expected: `boundaries unchanged`; eslint with 0 errors.

No commit.

---

### Task 30: Final verification and hand-off

**Files:** none modified.

**Interfaces:**
- **Consumes:** all groups.
- **Produces:** the owner's go/no-go evidence and the move map for the three feature plans.

- [ ] **Step 1: Generated runtime.**

```bash
cd /Users/saramia/pagosYa
node packages/storefront-kit/tools/build-commerce.mjs --check     # matches 31 commerce-src parts.
shasum -a 256 packages/storefront-kit/kit/commerce.js              # the Task 0 sha
pnpm --filter @pagosya/storefront-kit test                        # 3 tests pass, 6 runtimes parsed, tsc clean
```

- [ ] **Step 2: Each group's suites once more.**
  - Task 0 steps 3, 4 and 6 (tsc, eslint on the service, boundaries, both API jest groups, dashboard unit and Playwright).
  - Expected: identical to Task 0, plus exactly the added tests:
    - 1 review test (Task 11);
    - 2 `sep5Caller` tests (Task 12);
    - 1 Playwright store-switch test (Task 17);
    - 11 panel import tests (Tasks 18–28).

- [ ] **Step 3: Rebuild the Studio the dashboard serves** (no-op for commerce bytes, but the owner's dashboard should run what the branch now holds):

```bash
cd /Users/saramia/pagosYa/apps/merchant-dashboard && pnpm run build:studio 2>&1 | tail -3
```

- [ ] **Step 4: Working tree and history.**

```bash
cd /Users/saramia/pagosYa
git status --short           # only the owner's 6 store-emails files (plus this plan if still uncommitted)
git log --oneline e98226a0..HEAD
wc -l packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-generation.service.ts apps/merchant-dashboard/src/dashboard.js
```
Expected:
- 27 commits (plus a commit of this plan, if the owner made one):
  - Group A: 8;
  - Group B: 7 (Tasks 10–16);
  - Group C: 12 (Tasks 17–28).
- `kit/commerce.js` still 4,491 lines (generated);
- the service about 1,350 lines;
- `dashboard.js` about 1,500 lines.

- [ ] **Step 5: Tell the owner** what moved, with the map below. Feature plans written before this split cite old line numbers, notably `docs/superpowers/plans/2026-10-14-store-controls.md` (committed as `e98226a0`), which this plan does not touch. Such a plan must target the new files: edit `commerce-src/…` parts (never `kit/commerce.js`), then run `node packages/storefront-kit/tools/build-commerce.mjs`.

No commit.

---

## Appendix: where the code now lives (for the store controls, store voice and business tools plans)

**commerce.js** (edit the part, then run `node packages/storefront-kit/tools/build-commerce.mjs`; commit the part **and** `kit/commerce.js`):

| Old location (`kit/commerce.js` at 5a206a30) | New part |
|---|---|
| `config`, `DNA_VALUES`, `MOTION_*`, `COMMERCE_DNA`, `LOOK`, `CART_WORD` (1–135) | `commerce-src/shared/config-dna.js` |
| `track`/`analytics` (189–264) | `commerce-src/shared/analytics.js` |
| `store`/`cart` state, `escape`, `money`, option groups (265–345) | `commerce-src/shared/state.js` |
| cart lines, restore, hosted cart sync (398–522) | `commerce-src/cart/lines.js` |
| product dialog CSS (`detailStyle`, 537–984) | `commerce-src/product/dialog-style.js` |
| product setup, prices, badges, quantity, box (985–1180) | `commerce-src/product/setup.js` |
| bundles, suggestions, related, sticky bar (1181–1273) | `commerce-src/product/bundles-related.js` |
| account gates and views (1315–1485) | `commerce-src/account/pages.js` |
| standard pages: FAQ, search, cookies, info pages (1486–1601; store voice's `1502-1576`) | `commerce-src/pages/standard.js` |
| options, gallery, `openProduct`, highlights, long page (1602–1998) | `commerce-src/product/page.js` |
| cart drawer, added notice (2047–2195) | `commerce-src/cart/drawer.js` |
| motifs placement (2196–2637) | `commerce-src/motifs/placement.js` |
| product cards (2790–2974) | `commerce-src/catalog/cards.js` |
| contrast guard (2975–3160) | `commerce-src/look/contrast-guard.js` |
| `render()` (3161–3303) | `commerce-src/catalog/render.js` |
| T1 templates (3304–3416) | `commerce-src/templates/kit-templates.js` |
| `renderCart()` (3417–3545) | `commerce-src/cart/render.js` |
| `renderContact()` (3546–3611) | `commerce-src/contact/form.js` |
| DNA button/frame CSS, LOOK CSS (3612–3927) | `commerce-src/look/dna-css.js` |
| shipping, map, delivery validation (4011–4222) | `commerce-src/checkout/shipping.js` |
| `checkout()` (4223–4267) | `commerce-src/checkout/submit.js` |
| document click handler (4268–4373) | `commerce-src/shared/click-actions.js` |
| `load()`, blog/reviews/bundles content (4374–4419) | `commerce-src/content/load.js` |
| `initPlatformHeader()` (4420–4478) | `commerce-src/header/platform-header.js` |

A new runtime area, such as the store-controls `CONTROLS` reader or the business-tools `data-pagosya-tool` renderers, becomes a **new part**. Add it to `PARTS` at the point where its code must run: after the parts whose names it reads at load, and before the first part that calls it at load.

**source-generation.service.ts:**

| Old location (at 5a206a30) | New home |
|---|---|
| `SourceGenerationAttempt`, `StyleProposalResult`, `Sep5Review` (130–136) | `source-generation-types.ts` (re-exported by the service) |
| `proposeStyles` / `watchStyleDecision` (1770–1935) | `source-style-proposals.ts` (`runStyleProposal`, `watchStyleDecision`); the service keeps a `proposeStyles` wrapper |
| `startSep5Review` / `withSavedCatalog` (1694–1768; store controls' "`startSep5Review` (source-generation.service.ts:1716) inserts `status: 'REVIEWING'`") | `source-review-runner.ts` (`startBackgroundReview`) |
| `sep5Call` / `touchCall` (900–937; store controls' "`touchCall` (928-936)") | `source-sep5-call.ts` (`sep5Caller`) |
| `assembleSave` (1513–1604) | `source-save-assembly.ts` (`assembleSourceSave`); `generate()` keeps a one-line `assembleSave` wrapper, and "the N save" (`const saveInput = await assembleSave();`) stays in `generate()` |
| Sep-5 author branch (938–1065; store controls' "`sep5Review` is armed when `sep5SelfReview \|\| kitTouchOn` (:1001)") | `source-sep5-stage.ts` (`runSep5AuthorStage`) |
| review + kit touch closure (1003–1063), `REVIEW_SAVE_MARGIN_MS` | `source-sep5-review.ts` (`createSep5Review`) |
| chat kit touch (1605–1625) | `source-sep5-review.ts` (`runChatKitTouch`) |
| agent branch (1266–1391) | `source-agent-stage.ts` (`runAgentStage`) |
| run setup, Store Brain in `taskPrompt` (609–610), design stage, `acceptCandidate`, sketch branches, single-call loop, receipt, save | still in `generate()` |

A new stage input or output (for example store controls' `controls` call beside the review) becomes a field on `GenerationRunFacts` (a fixed value) or `GenerationLive` (a `let` the stage reads or writes), plus its `Pick<…>` in that stage's context type.

**dashboard.js:**

| Screen | Module |
|---|---|
| Bandeja / inbox (business tools' requests land here) | `src/inbox-panel.mjs` |
| promo codes, bulk discounts | `src/discounts-panel.mjs` |
| products / payment links | `src/products-panel.mjs` |
| debt collection links | `src/debt-links-panel.mjs` |
| quick payment | `src/quick-payment-panel.mjs` |
| balances, settlement, payouts, finance charts | `src/finances-panel.mjs` |
| orders, downloads | `src/orders-panel.mjs` |
| Mi tienda list, Shopify import, selection | `src/stores-panel.mjs` |
| inventory import | `src/inventory-import-panel.mjs` |
| account, KYC, terms, level | `src/account-panel.mjs` |
| profile menu, sessions | `src/profile-sessions.mjs` |
| shell: navigation, `setDashboardView`, auth/login, `refresh()`, `api()`, money visibility, `selectStore`, create-store, onboarding glue, merchant delete | still in `src/dashboard.js` |

A new dashboard screen is a new `src/<screen>-panel.mjs` that follows the recipe, with its path added to `server.mjs` and a row in `unit/dashboard-panels.test.mjs`.
