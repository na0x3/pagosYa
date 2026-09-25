# Clean code plan

Started 2026-09-18. Goal: a codebase a new engineer can understand quickly — low coupling between modules, each module doing one job, and no behavior changes.

## Ground rules

- **Behavior-preserving.** Each refactor is a move or extraction with tests green before and after. Feature changes go in separate commits.
- **One phase per branch/PR**, small enough to review.
- **Baseline first.** Record the current test/build state (the older dashboard browser suite already has 12 known failures — see `history/CODE_CLEANUP_2026-09-12.md`), so we never confuse old failures with new regressions.

## Findings (2026-09-18 survey)

| # | Problem | Where | Why it hurts onboarding |
|---|---------|-------|------------------------|
| 1 | 20,011-line single file with 5 inline `<script>` blocks | `apps/merchant-dashboard/index.html` | Can't be navigated, type-checked, or unit-tested; every change touches one file |
| 2 | 10,248-line entry file | `apps/checkout/src/main.ts` | Cart, product detail, payment, international, and preview logic are all mixed together |
| 3 | God module: 133 non-test files, 61 of them `source-*` | `apps/api/src/stores/` | Several bounded contexts (AI source generation, brand, retention, email, shipping, domains, catalog) in one Nest module |
| 4 | Oversized services | `visual-studio.service.ts` (3.6k), `stores.service.ts` (2.1k), `operations.service.ts` (1.6k), `create-store.dto.ts` (1.7k) | Too many responsibilities per class |
| 5 | Apps import another app's source via `../../api/src/...` | checkout (`main.ts`, `privacy.ts`, `comeback-card.ts`), merchant-studio (`source-preview.ts`, `comeback-preview.ts`, a test) | Hidden coupling between apps; the `source-kit` runtime should be its own package |
| 6 | Cart/box rules duplicated | `checkout/src/cart-state.ts` vs `api/src/stores/source-kit/commerce.js` (`pickedExtras`, box grouping) | Two implementations drift apart |
| 7 | `stores` has high fan-out into `payment-links`, `dashboard`, `auth`, `prisma` | API | Cross-module imports bypass module boundaries |
| 8 | No ESLint/Prettier config; no architectural boundary lint | repo | Style and layering aren't enforced |
| 9 | Root and docs clutter | `archive/` (tracked), untracked dumps/PDFs/screenshots at root, ~40 flat docs incl. dated repair logs | Newcomers can't tell current docs from history |
| 10 | License mismatch | `LICENSE` is GPL-3.0, `package.json` says AGPL-3.0-only | Legal ambiguity |

## Phases

0. **Baseline + tooling** — record build/test state; add ESLint + Prettier (format-only commit), plus `eslint-plugin-boundaries` or dependency-cruiser rules describing allowed imports.
1. **Hygiene quick wins** — delete `archive/` (it stays in git history); move dated repair/plan docs to `docs/history/`; add `docs/ARCHITECTURE.md` (apps, packages, API modules, request flow); resolve the license mismatch.
2. **Extract `packages/storefront-kit`** — move `api/src/stores/source-kit/*` (commerce, privacy, retention, video runtimes) into a workspace package; make checkout's `cart-state` and the kit share one cart/box implementation. Fixes #5 and #6.
3. **Split the API `stores` module** into focused Nest modules (proposed): `storefront-source` (AI generation/design/chat), `brand`, `retention`, `email-workspace`, `shipping`, `domains`, `catalog`, and `stores` core. Each exposes a service interface; no deep imports across modules. Split the four oversized services along the same lines.
4. **Break up `checkout/src/main.ts`** into feature modules (cart, product detail, payment flow, international, preview bridge) with a thin bootstrap.
5. **Break up the dashboard `index.html`** — move inline scripts/styles into `src/` modules built by the existing Vite config, one module per screen, with shared state/commands in `src/store-editor`.
6. **Enforce** — turn on boundary lint in CI so the structure can't regress.

Phases 3–5 are the large ones; each should be split into several PRs.

## Progress

- **Phase 0 — done (2026-09-18).** Baseline: build passes; API 1396/1396 (after raising the timeout on four Next.js-compiling suites that only failed under parallel load), checkout 237/237, studio 58/58, dashboard unit tests pass. Logs in `tmp/clean-code/baseline/` (local). `pnpm check:boundaries` added to CI with 23 known cross-app import violations + 5 circular warnings recorded. A repo-wide Prettier pass was deliberately **not** done yet — it would rewrite most files and bury blame history; decide before phase 3.
- **Phase 1 — done except `archive/`.** Dated reports, archived designs, and completed plans moved to `docs/history/` with links fixed; `docs/ARCHITECTURE.md` added and linked from the README; license made proprietary (`LICENSE`, `"license": "UNLICENSED"`). Deleting the tracked `archive/` folder was blocked by the local GateGuard hook and is still pending.
- **Phase 2 — done.** (a) Storefront runtimes moved to `packages/storefront-kit` (23 → 15 cross-app imports). (b) The merchant variant editor moved from `merchant-dashboard/src/product-options.*` to `packages/variant-editor`; the dashboard now serves it at `/variant-editor.{js,css}` (15 → 12). The buyer-side helpers in `checkout/src/product-options.ts` are a different responsibility and stay in checkout. (c) The preview renderer moved from Studio to `packages/storefront-preview` (12 → 6); Playwright tests load it through `merchant-studio/src/storefront-preview.ts`. Cart/box logic was **not** merged, by decision: checkout's `cart-state.ts` (multiple pick groups, required extras, `id::variant~~extras` keys in localStorage) and the kit's `commerce.js` (one box group, JSON-array keys, must stay a dependency-free script inside exported sites) only share two small helpers; unifying them would change saved-cart keys in shoppers' browsers. Revisit if `commerce.js` ever gets a build step. Kept as known violations: two Studio browser tests (`source-next`, `source-creative`) that compile projects with the API's `source-next.ts` and fixtures — genuine cross-app integration tests, until they get a home of their own.
- **Phase 3 — done (2026-09-19).** (a) `stores/` split into Nest modules `storefront-source`, `visual-studio`, `brand`, `product-content`, `ai-usage`, `retention`, `email-workspace`, `domains`, `shipping`, `store-growth`, `store-seo`, `promo-codes`; `stores/` keeps the store core. Verified by comparing the full route table (same routes, no order change among overlapping patterns) and every provider's injected dependencies, including `@Optional` ones, before and after. Retention's public routes use `stores/active-store.ts` instead of `StoresService` to avoid a Stores ↔ Retention module cycle. (b) Oversized files split: `visual-studio.service.ts` 3.6k → 1.3k (helpers in `visual-config`, `color`, `generated-proposals`, `agent-revision`), `stores.service.ts` 2.1k → 1.2k (`store-locations`, `product-pricing`, `store-presentation`), `operations.service.ts` 1.6k → 0.7k (new `SubscriptionsService`, `IntegrationsService`, `AppointmentsService`, shared `operations-helpers.ts`), `create-store.dto.ts` 1.7k → 0.7k (`store-options`, `store-motion.dto`, `store-site.dto`, `store-location.dto`). The service classes themselves (`VisualStudioService`, `StoresService`) are still ~1.2k lines each; splitting them further means new providers and is left for later. New log context names: operations log lines now come from the service that owns the method.
- **Phase 4 — done (2026-09-19).** `checkout/src/main.ts` 10.2k → 0.2k. First its 47 module-level variables moved onto `state` in `state.ts`, then declarations moved into `storefront/`, `cart/`, `checkout/`, `orders/`, `preview-editor/`, `ui/` (see `docs/ARCHITECTURE.md`). No import cycles were added. Remaining large module: `storefront/store-page.ts` (3.5k) — `renderStore`, `renderProductPage`, the cart review dialog and in-store navigation call each other; separating them needs a small render/navigation registry. Checkout suite 237/237 and `vite build` pass after each step.
- **Follow-up round (2026-09-19).** `StoresService` split into `StoresService` (management), `PublicStoresService` (public reads, view counting) and `StoreCheckoutService` (cart checkout, leads); `VisualStudioService` split into `VisualStudioService` (saved editor state), `VisualAiService`, `VisualProposalsService` and `VisualRevisionService`. Specs build them through `testing-*-services.ts` helpers that forward spies to the owning service. Checkout's storefront loop is broken with a `storefrontPages` registry in `storefront/navigation.ts` (filled by `main.ts`), so the product page, cart review dialog and cart bar are separate modules; `storefront/store-page.ts` is now 2.6k lines, nearly all of it the single `renderStore` function. Verified: API 1396 unit + 96 e2e, checkout 237, Studio CI browser suite 31/31, dashboard CI browser suite 12/15 with only the three known failures below.
- **Phase 5 — started.** The dashboard's inline CSS (3.6k lines) and inline script (14.5k lines) moved verbatim to `src/dashboard.css` and `src/dashboard.js`; `index.html` is now 1.8k lines of markup. Converting `dashboard.js` into Vite-built modules is the remaining work and is not mechanical: the whole script runs inside one `PagosYaStoreEditorReady.then(...)` callback, so every function shares that closure's variables, and 50 inline `on…=` attributes depend on globals it sets. It needs the closure's variables hoisted onto a state object first (as done for checkout in phase 4), and more reliable browser coverage before it is safe: the full dashboard Playwright suite (not only the CI subset) currently has 39 failing tests — identical before and after the extraction — mostly in `store-settings.spec.mjs`, which CI does not run.
- **Phase 5, continued (2026-09-24).** The browser coverage it was waiting on now exists: the whole
  dashboard Playwright suite is green (73 passed, 1 intentional skip) and CI runs every spec file.
  `dashboard.js` is an ES module. Screen code now leaves the closure one module at a time with
  **`mountX(deps)`**: the code moves verbatim, and each closure variable it used becomes an explicit
  dependency (a getter for mutable state such as `storeId: () => currentStoreId`). No state object
  is needed first. First extraction: the rewards (wheel, album, dice board) went to
  `src/rewards-panel.mjs`, taking `dashboard.js` from 5.1k to 4.9k lines. Mount a module where its
  old state was declared, not where its functions were: init code that runs earlier may call it,
  and a `const` read before its declaration is a TDZ crash. Next candidates, each self-contained:
  profile/sessions menu, payment-link lists, finance charts, product/catalog import.

- **Phase 0 tooling, finished (2026-09-22).** ESLint was the half of phase 0 that never landed
  (finding #8): `depcruise` enforced layering, but nothing caught the mistakes `tsc` cannot see.
  `eslint.config.mjs` at the root is type-aware and deliberately *not* a style config — no
  Prettier pass, so blame history stays readable. Async-correctness rules
  (`no-floating-promises`, `await-thenable`, `no-misused-promises`) are errors; the pre-existing
  backlog is warnings so it stays visible and countable. `pnpm lint`.

  It paid for itself on the first run: `no-misused-promises` found a live defect in
  `idempotency/idempotency.interceptor.ts` (a Prisma write handed to RxJS `tap`, so the response
  was sent before the key was marked COMPLETED) — in a file that had no tests at all.

  Baseline at adoption, to burn down (promote each rule to "error" as it reaches zero):

  | Count | Rule | Note |
  |------:|------|------|
  | 30 | `no-misused-promises` | 2 were the idempotency defect, now fixed |
  | 27 | `no-unused-vars` | mechanical |
  | 4 | `no-floating-promises` | all in checkout browser bootstrap |
  | 4 | `prefer-const` | `--fix` handles these |
  | 3 | `no-unused-expressions` | |
  | 1 each | `await-thenable`, `no-implied-eval`, `no-unsafe-finally` | reviewed, none live defects |
  | 867 | warnings | 324 `no-explicit-any`, 241 `no-unnecessary-type-assertion`, 150 `require-await` |

  **Errors reached zero on 2026-09-24 (74 → 0) and `pnpm lint` now runs in CI.** Most were
  mechanical (unused imports, `prefer-const`). Two config decisions came with it:
  `no-unused-vars` ignores rest siblings (`({ image, ...rest }) => rest` is how the code drops
  fields), and in the browser apps `no-misused-promises` no longer checks async functions passed
  as arguments. Every one of those ~27 sites (DOM listeners, timers) was read and each catches
  its own errors; the API keeps the full rule, since there an ignored promise is a lost write.
  One real fix: `countStoreSales` was counting test-mode payments toward dice-board rolls.
  954 warnings remain; promote each rule to "error" as its count reaches zero.

- **Phase 6 — done.** `no-circular` is now an error; the five cycles that predate it stay listed in `.dependency-cruiser-known-violations.json`, and a new cycle fails `pnpm check:boundaries` in CI.
- **Browser suite, measured 2026-09-22.** The figure recorded below — "39 failing tests" in the
  full dashboard suite — is stale by a wide margin. Actual state, run at a clean checkout of
  HEAD in a throwaway worktree (so none of it is working-tree drift):

  | Suite | Result |
  |---|---|
  | merchant-studio, all 37 spec files | **177 passed, 1 failed** (the failure is `source-face.spec.ts`, still untracked WIP) |
  | merchant-dashboard, all 8 spec files | **48 passed, 9 failed** |

  So the browser suites were in far better shape than the plan assumed, and CI was running 8 of
  45 spec files for no reason. The full Studio suite and three more dashboard specs
  (`store-settings`, `domain-shop`, `international-payments`) are now in `ci.yml`.

  Of the dashboard's 9: one was a dead assertion (`#categoryRows`, an element that no longer
  exists — fixed to use `#paymentLinkRows`), one covers retired custom-domain UI (skipped, with
  the evidence in a comment), and **six are in `merchant-workspace.spec.mjs`, which CI already
  runs — so `browser-tests` is red at HEAD and has been for some time.**

  All six describe the dashboard's *previous* layout, not a product defect. They need a decision
  about intent, not a repair:

  | Test | What it asserts | What is true now |
  |---|---|---|
  | `:316` compact navigation stays at the edge | a 64px rail at `x: 0` | `workspace-design.css` makes it a 240px sidebar |
  | `:107` retired sections are absent | `#storeSettingsRoot` absent | it is live, mounted by `mountStoreSettings`, with 34 passing tests of its own |
  | `:88`, `:209` motion replay | `#source-replay-motion` in the Studio frame | that control no longer exists |
  | `:292` integration logos | the detail panel reads "Sin conectar a esta tienda" | a different integration is selected first |
  | `:129` shared editor | old sidebar bounds | same redesign as `:316` |

  `:107` is the interesting one: it asserts store settings is retired, while `store-settings.spec.mjs`
  tests it as a live feature. Those two cannot both be right. There is a `cleanup/retire-legacy-dashboard`
  branch, which suggests the retirement was planned, started, and reversed — decide which, then
  delete one of the two specs.

- **Known pre-existing browser failures** (identical on `3b9d5aa`, before any refactor): in `merchant-dashboard/tests/merchant-workspace.spec.mjs`, "store opens the shared editor…" and "saved site previews refresh…" time out waiting for `#productCreateDisclosure > summary` to become visible, and "integration logos load…" finds 0 of 17 `.integration-card`s. The other 12 CI dashboard browser tests pass. `merchant-studio/tests/source-checks.spec.ts` "exported contact form…" failed once under a full run and passed 1/1 alone and 18/18 in a 3× repeat — timing flake.
