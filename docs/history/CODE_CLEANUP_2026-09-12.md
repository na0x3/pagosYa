# Events and obsolete-code cleanup

Completed locally on 2026-09-12. Changes remain uncommitted. The workspace contains earlier unrelated work; the cleanup baseline is saved in `tmp/code-cleanup/baseline/`.

## Removed

- Merchant navigation and screens for **Centro operativo**, **Consultas y crecimiento**, and **Eventos**, including their loading logic and the unused growth editor module.
- Events controllers/services, ticket reservations and storefront blocks, payment-completion bridge, consumer event discovery and Face Entry UI/requests.
- Event-only access-control providers, the venue edge process, their package dependencies, demo scripts, tests, and leftover compiled package output.
- Proven unused dashboard adventure-map helpers and obsolete CSV parsing helpers. The active AI inventory importer remains in use.
- An unused Studio navigation listener and unused local declarations. The final TypeScript unused-declaration audit of the dashboard's inline scripts reports none.
- Obsolete Events setup commands from README. Historical Events/Face Entry design documents are marked archived.

Shipping, inventory integrations, calendar appointments, payment processing, customer retention, and the current Studio still have callers and were retained. Existing Events database tables and migration history were retained to preserve historical records. This change does not delete data or publish a storefront.

## Corrections made during verification

- CI no longer invokes the deleted growth-screen test. Its replacement covers current merchant navigation, account access, and consumer login.
- Workspace browser fixtures use the current product-management controls and hosted payment-preview dialog, select the correct preview frame/button, provide currency, and avoid injecting merchant session storage into opaque preview frames.
- Legacy product details now show the cheapest **available** variant under “Desde,” rather than the unrelated base price. Tests cover both an available cheaper variant and a sold-out cheaper variant, selection, and cart pricing.
- The older agent-message DTO test supplies the required revision. Invalid-instruction assertions now verify an instruction validation error instead of passing because the revision was missing.

## Claude review

One fresh Claude Code session reviewed the cleanup-only diffs with Read, Grep, and Glob tools. It had no file-editing or shell tools. The review found no dangling Events/dashboard connections and identified the legacy variant pricing issue corrected above.

The readable review and resolution are in `tmp/code-cleanup/review/claude-review.md`; its raw result is in `claude-review.json`. No previous Claude conversation was resumed.

## Verification

| Check | Result |
| --- | --- |
| API, checkout, merchant dashboard, and Studio production builds | Passed |
| API unit tests | 101 suites passed in the full run; the remaining DTO suite passed after its fixture correction: 102 suites / 889 tests covered |
| Checkout unit tests | Original full run: 200 passed; affected storefront suite after pricing correction: 138 passed, including one additional case (201 tests covered overall) |
| Dashboard state/commands/persistence unit tests | 29 passed |
| Disposable-PostgreSQL security and source-project integration tests | 27 passed, including retired Events endpoints returning 404 and product combinations through checkout |
| Current merchant navigation, account access, and consumer login browser suite | 13 passed in the final run |
| Older appearance/settings browser suite | 79 passed, 12 failed, 14 previously skipped |
| Pre-cleanup comparison of all 12 older-editor failures | All 12 failures reproduced |
| Whitespace and dashboard unused-declaration checks | Passed |

Desktop/mobile workspace screenshots were generated and the mobile screenshot was inspected. Test logs and the baseline comparison are in `tmp/code-cleanup/`; the final current-flow log is `dashboard-current.log`.

## Existing older-editor failures

These remain unresolved; the complete browser suite is **not green**. They reproduce against the saved pre-cleanup dashboard and are not evidence of new removal regressions:

- Three tests attempt to navigate through an old Appearance sidebar entry that no longer exists.
- Two expect the older shared product preview/catalog editor to be visible in the product-management page.
- Two expect old page/header selection controls.
- Two upload fixtures return `/uploads/...` instead of the upload contract's `/v1/uploads/...`.
- Two encounter overlays intercepting the achievement-close or YAPI-close buttons.
- One expects a 1440px legacy preview canvas where the current canvas is 1200px.

Exact test names, errors, and before/after evidence are recorded in `tmp/code-cleanup/legacy-comparison.json`, `baseline-comparison.log`, and `dashboard-final.log`. The old editor still supports saved storefronts; its implementation and tests were not deleted merely to obtain a passing suite.
