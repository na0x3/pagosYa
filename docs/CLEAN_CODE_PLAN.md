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
- **Known pre-existing browser failures** (identical on `3b9d5aa`, before any refactor): in `merchant-dashboard/tests/merchant-workspace.spec.mjs`, "store opens the shared editor…" and "saved site previews refresh…" time out waiting for `#productCreateDisclosure > summary` to become visible, and "integration logos load…" finds 0 of 17 `.integration-card`s. The other 12 CI dashboard browser tests pass. `merchant-studio/tests/source-checks.spec.ts` "exported contact form…" failed once under a full run and passed 1/1 alone and 18/18 in a 3× repeat — timing flake.
