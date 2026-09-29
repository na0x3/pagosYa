# Plan 1 verification — 2026-09-29

Worktree: `/Users/saramia/pagosYa/.claude/worktrees/wix-templates`, branch `feature/wix-templates`. Plans 2–4 have not started.

## Commits

- Task 1: `64508ec` — variant photo sets
- Task 2: `6e1d6d4` — preview hydration
- Task 3: `a120d7a` — colour-dependent galleries
- Task 4: `0e3d27d` — Studio photo picker
- Task 5: `1366faa` — content-block data and handwritten migration
- Task 6: `e11b17f` — content-block runtime
- Task 7: `7adfeea` — Studio content-block editor
- Review follow-up: `a85953c` — preserve legacy photo edits and resolve set references
- Task 8: the documentation commit containing this report

## Final verification

Every command below ran from the worktree root, sequentially. All 15 named specs passed after the review fixes: 236 tests. No full storefront-source suite was run.

| Command | Final result |
| --- | --- |
| `pnpm --filter @pagosya/api exec jest src/payment-links/product-variants.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/payment-links/product-content-blocks.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/stores/product-variants-public.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/stores/public-stores.service.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/storefront-source/source-product-options.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-surfaces.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-design.spec.ts` | PASS |
| `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-contrast.spec.ts` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vitest run src/source-create-product.test.ts` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vitest run src/variant-photo-sets.test.ts` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vitest run src/product-content-blocks-editor.test.ts` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vitest run src/source-templates-page.test.ts` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vitest run src/source-browser.test.ts` | PASS |
| `pnpm --filter @pagosya/storefront-preview exec vitest run src/source-preview-media.test.ts` | PASS |
| `pnpm --filter @pagosya/api exec tsc --noEmit -p tsconfig.json` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec tsc -p tsconfig.json --noEmit` | PASS |
| `pnpm --filter @pagosya/checkout exec tsc --noEmit` | PASS |
| `pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded` | PASS |
| `pnpm --filter @pagosya/storefront-preview exec tsc --noEmit` | PASS (Tasks 2/6) |
| `pnpm --filter @pagosya/api exec prisma generate` | PASS (local client generation only) |
| `git diff --check` | PASS |

## Earlier red/green runs and corrections

Repeated identical commands are consolidated here; the table above gives their final status.

- `pnpm --filter @pagosya/api exec jest src/payment-links/product-variants.spec.ts src/stores/product-variants-public.spec.ts`: FAIL before implementation (missing imageUrls type), then PASS (10). This early invocation combined two named files contrary to the requested one-at-a-time rule; all later runs were individual.
- `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts -t "photo set|legacy single-photo|without photo sets"`: FAIL (3 failing/2 passing), then PASS (5).
- `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts -t "content blocks|unsafe|six blocks"`: FAIL (2 failing/3 passing), then PASS (5).
- Preview-media spec: FAIL before hydration; an intermediate FAIL exposed a consumed Response mock, corrected to return fresh responses; PASS. Block hydration later followed FAIL → PASS.
- Variant-photo-sets spec: FAIL before picker implementation → PASS.
- Source-create-product spec: FAIL for removed-photo guard → PASS; later FAIL for block mapping → PASS.
- Product-content-blocks spec: FAIL before module implementation → PASS.
- Public-stores service spec: first FAIL from old generated Prisma types; PASS after client generation finished.
- Product-content-blocks-editor spec: FAIL before module implementation → PASS.
- Source-product-options spec: review regressions failed first (legacy-photo edit, then reference resolution); both PASS after fixes, 46 tests total.
- Task 5's commit was created while its final public-store/type checks were still running; both passed before Task 6 began.

## Review and rulings

A fresh-context reviewer inspected `8a6975c..7adfeea`, found two Important defects and no Critical/Minor findings. Both Important defects were reproduced with failing tests, fixed in one pass, and followed by the complete permitted named verification above. No second review was requested.

Rulings, in order:

1. User's permission to correct conflicts superseded the original stop-on-conflict rule; plan deviations govern older spec text. User restrictions override skill suggestions to run broad suites or integrate branches. Cost: deliberately limited verification scope.
2. The UI automatically completes option selections, so the unreachable mixed-selection test was replaced with set-to-no-photo restoration and size-dependent set tests. Cost: no direct partial-selection UI coverage; that state has no UI entry point.
3. Preserve the shared editor's actual `photos(): string[]` interface and adapt Studio to it. Cost: future object-valued consumers need an adapter.
4. Hydrate hosted-catalog image fields as well as preview fields, and exempt native comparison-range arrows from gallery navigation. Cost: new image fields change hosted-media behavior; real browser interaction remains a manual check.
5. Keep review corrections in a separate follow-up commit rather than rewrite the seven task commits. Cost: one additional correctness commit beyond the eight planned commits.
6. Reviewer declined browser appearance/keyboard behavior: automated runtime and contrast checks pass, but no complete manual product flow was performed. Cost: visual/interaction defects could remain.
7. Reviewer declined migration execution: owner must apply the handwritten SQL; agent never accesses the database. Cost: feature is not usable against an unmigrated database.
8. Reviewer declined test-result judgment: implementer reran all permitted named checks after fixes. Cost: unrelated suites remain unverified by design.
9. Reviewer declined deployment readiness: no deployment, push, merge, or live integration claim. Cost: owner still owns rollout.
10. Reviewer declined pending docs: implementation decisions and built statuses are updated in Task 8. Cost: future code drift needs normal documentation maintenance.
11. Reviewer declined older built-in storefront support: optional variant type only; rendering is kit-only as directed by the plan. Cost: the older checkout storefront does not gain these new galleries/blocks.

Deferred minors: none. Existing passing template-page tests still emit jsdom `window.scrollTo` warnings.

## Not verified / owner action

No database access, migration execution, live product-save/preview walkthrough, deployment, or evaluation-agent run. No Playwright downloads. Existing Playwright-backed contrast checks passed.

The owner must apply:

`apps/api/prisma/migrations/20260929120000_product_content_blocks/migration.sql`

before using `contentBlocks` against a real database. Prisma Client generation does not apply this SQL.

Plan 1 is implemented and automated verification is complete. Preserve the branch/worktree and wait for the user's “next” before Plan 2.

