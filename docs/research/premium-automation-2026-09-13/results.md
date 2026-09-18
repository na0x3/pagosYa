# Durable design improvement — implementation and experiment

Date: September 13, 2026. Work continued autonomously after the Savia pilot. Codex implemented and tested the workflow. Claude Opus supplied two independent read-only architecture/code reviews; the saved CLI receipts identify the actual models and costs. No production publication or real payment was made.

## Delivered

- A merchant-owned, PostgreSQL-backed review job with an idempotent request ID, exact source revision, catalog/brand/retention fingerprint, exclusive active job, renewable lease, cancellation, conservative spend reservations, resumable checkpoints, and per-call receipts.
- An offline browser captures the selected page/product at desktop and mobile sizes. Uploaded assets are hydrated only into temporary review copies. Those screenshot assets never become the source to apply.
- The vision reviewer identifies local issues. A private GPT repair preserves the catalog and runtime and cannot create products or migrate frameworks. A bounded repair count and total allowance cover the complete job.
- The candidate must pass resource/overflow checks, sampled variant/cart/simulated-checkout checks, and a masked visual comparison. Uncertain or regressed candidates retain the baseline. Saving the exact prepared candidate and its job outcome is atomic; it creates an editable revision and does not publish.
- Studio exposes **Mejorar diseño**, status/cost, cancel and resume. Reload restores the server job without another paid request. Poll results are ordered, historical revisions are not replaced, and keyboard focus survives state changes.
- Queue availability prevents a store waiting on chat generation from starving other stores. Serialization/admission conflicts are retried without pretending that a new design was generated. Unknown remote usage keeps its allowance reserved.
- Private visual artifacts expire after 30 days in bounded batches. Financial receipts and source history remain; expired failed jobs cannot resume without their evidence.
- Feature flag `SOURCE_DESIGN_JOBS_ENABLED` defaults to false. It is enabled in this local development environment. Three additive migrations are included and applied locally.

## Experiment outcome

The planned matrix is six catalog types × three repetitions × two workflow arms, or 36 initial generations. Both arms use the current generator; their initial outputs are independent draws under identical fixture briefs, catalog data and owned photo bytes. The candidate arm additionally enters the review workflow. This is not a comparison against historical generator code. Food and single-product cases reuse Savia assets; they are not fully independent held-out brands. The other four fixtures deliberately provide no photos.

| Result | Count |
| --- | ---: |
| Initial stores generated | 20 / 36 |
| Generation failures before stop | 3 |
| Interrupted runs | 2 |
| Runs not started | 11 |
| Catalog types with completed stores | 4 / 6 |
| Original homepage captures | 120 |
| Original captures passing loading and width gates | 120 / 120 |
| Original simulated purchase checks passed | 78 / 80 |
| Original stores passing all sampled purchase checks | 19 / 20 |
| Candidate reviews retaining the original without repair | 3 |
| Candidate review workflows ending in failure | 7 |
| Live durable candidates automatically applied | 0 |

OpenAI reported `insufficient_quota`/exhausted balance during the batch. Further paid processes were stopped, and their admission slots were released only for these isolated benchmark stores. Three repair attempts exposed a missing database status constraint before the follow-up migration was applied. That migration is now included. Other failed review work hit the provider balance limit. All original failures and known costs remain recorded.

The benchmark receipts contain **$6.353034 in observed estimated provider usage**, plus seven attempt/usage records without known provider totals. This is not an invoice total. It excludes the earlier Savia pilot, image production and Claude CLI reviews. The second Claude review receipt reports $1.552816. Unknown usage is not asserted to be zero.

The automated purchase probe samples up to the first three products and one available combination per product at 1280px and 390px. It verifies product identity, selected variant, cart contents, and a complete simulated payment. It does not exercise every combination, extras, live payment providers, every viewport, or every scroll position. Screenshot preference does not establish accessibility, performance or security.

## Diagnosed and corrected mobile failure

`technical-1-candidate` authored a fixed cart rule with `!important`. In checkout that rule moved the order review out of document flow and left the payment button below the reachable mobile viewport. Homepage width checks did not detect it; the purchase probe did.

The shared runtime now forces the embedded checkout review to use normal positioning and sizing, even when drawer styles request fixed positioning. A real Chromium regression test reproduces this condition. The isolated technical demo has a separate corrected revision 2 and **4/4** passing purchase checks. Original revision 1 and its **2/4** result remain in the gallery. This correction was written by Codex, not produced or accepted by the AI review job.

## Validation

- 411 source unit/regression tests across 40 suites passed. This includes real Chromium checkout probing; most generator/evaluator unit tests use mocked provider responses.
- 17 PostgreSQL workflow tests passed against a separate temporary database: ownership, request deduplication, concurrent claims, interruption/resume, held allowances, known overspend, cancellation fencing, delayed availability, catalog/retention staleness, artifact integrity, atomic apply/rollback, and both accept/reject outcomes. The full-stage tests mock inference/capture; they do not prove live visual improvement.
- 208 checkout tests passed.
- Five Studio browser tests passed, including desktop/mobile restore without paid replay, cancellation/focus, the existing resource controls and live progress.
- API and Studio builds passed. Gallery desktop/mobile inspection found no horizontal overflow.
- Actual Savia purchase sampling passed 6/6. Corrected technical demo passed 4/4. No real order or charge was created.

## What the result does and does not establish

The durable implementation and its failure protections are present and tested. The 36-run aesthetic comparison, live post-fix repair acceptance, paid edit-preservation trials and human preference calibration remain incomplete because the configured API balance ran out. No 80% taste acceptance, superiority over Amboras, production readiness of aesthetic selection, or completed M6 gate is claimed. The feature stays opt-in for general installations.

## Open the evidence

- Gallery: http://localhost:4328/
- Savia: http://localhost:4326/
- Original raw results: `examples/premium-benchmark/results.json`
- Each completed store has `receipt.json`, `evidence.json`, six captures and a standalone `site/` export.
- Corrected technical demo: `examples/premium-benchmark/technical-1-candidate/corrected/`; its independent verification is in `remediation.json`.

To serve the gallery again: `python3 -m http.server 4328 --bind 127.0.0.1 --directory examples/premium-benchmark` from the repository root. Do not use the benchmark scripts as an automatic quota retry loop. Complete a new clearly versioned cohort after provider balance is restored; preserve this interrupted cohort as evidence.
