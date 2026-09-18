# Premium storefront pilot · 13 September 2026

Six actual production-generator builds: three fictional merchant briefs, two fresh runs each. These use the configured GPT API through `SourceGenerationService`, not hand-authored substitutes. Each run has its own isolated merchant and store. Pantry uses two products with photography; hydration uses one product with six variants; café uses three products without photography. All contain real, stable option IDs.

The selected direction is now chosen by the planner from the brief, catalog and assets, with a recorded rationale; it is no longer selected randomly. This is brief-based selection, not a claim that the model inspected a rendered result before choosing.

| Run | Initial generation time | Initial credits | Initial opening checks | After repair |
|---|---:|---:|---|---|
| pantry-1 | 132s | 35 | fail | pass |
| pantry-2 | 166s | 38 | pass | pass |
| hydration-1 | 164s | 37 | fail | pass |
| hydration-2 | 130s | 32 | pass | pass |
| cafe-1 | 116s | 26 | pass | pass |
| cafe-2 | 136s | 28 | pass (first capture in final audit) | pass |

The opening checks are geometry checks, not a beauty score: at actual 1280×844 and 390×844, the promised catalog starts before 320px and at least one product price and purchase control fit before 844px. Required visible images and fonts must load, and the page must not overflow horizontally. All 12 final captures passed these checks. All six initial outputs contained the nine canonical style variables. This small, unpaired pilot does **not** prove an 80% production acceptance rate or superiority to Amboras.

Two initial outputs failed. Pantry 1 stacked the mobile introduction into an effectively zero-width text column, pushing the catalog to y=797; its desktop purchase action also fell below the opening viewport. Hydration 1 placed its mobile action at y=869. Each received one GPT repair with actual screenshots and measured findings. Pantry's mobile catalog moved to y=216 and first action to y=726; hydration's action moved to y=832. No manual CSS edits were made to make the pilot designs pass. The initially narrow-paragraph detector missed a zero-width column; the screenshot exposed it and the detector was corrected.

The repair script is bounded at two attempts per case and 100 credits per attempt. Both cases used one attempt at 19 credits. This is an operator-run pilot loop, **not** a deployed autonomous quality gate with durable jobs, cancellation, leases and rollback. Original revisions, initial screenshots and failures remain available.

The pilot also exposed an asset portability bug: variant-only photographs could retain server URLs in exported stores. The generator now bundles them, with regression coverage. `platform-refresh.json` records the subsequent platform-only refresh of local origins, current runtime and variant URLs; it did not alter authored HTML/CSS. Original generation receipts remain unchanged.

Total recorded GPT provider estimate for six builds plus two repairs: **USD 2.300130 / 234 platform credits**. Caps were 300 credits per initial build and 100 per repair. This excludes Savia's original generation, image generation, Claude, and Codex work. These are application estimates, not a billing reconciliation.

Evidence: `results.json`, `repairs.json`, `audit-initial.json`, `audit.json`, and `platform-refresh.json`. Screenshots are in `../review/pilot-*.jpg`; failed initial views are retained in `../review/pilot-before/`. Serve this folder with `python3 -m http.server 4327 --bind 127.0.0.1 --directory examples/savia/pilot` from the repository root.

Next production phase: calibrated visual acceptance on held-out categories, then durable review jobs and a paired 36-run benchmark. These conditional follow-ups from the plan are not implemented or claimed complete by this pilot.
