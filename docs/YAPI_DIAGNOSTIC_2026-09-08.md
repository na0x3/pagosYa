# YAPI request interpretation and failed generation diagnostic

Diagnostic only; application source and saved storefront revisions were not changed. No live model requests were made. Evidence: the September 8, 10:59:37 PM screenshot, read-only QUEMADO database queries, current source, and mocked-provider tests.

## Observed incident

Request: “cambia los colores, las secciones, haz mas animaciones, personajes comiendo torta basca etc”.

The message was saved at 22:57:47 Bolivia time. Interpretation completed, then generation and its automatic repair both failed validation. The final error at 22:59:30 was “No se pudo localizar con precisión el cambio en checkout.html.” Revision 4 remained saved. The run recorded zero YAPI credits.

| Stage | Model | Duration | Locally estimated API cost |
| --- | --- | ---: | ---: |
| Conversation | Terra | 14.468 s | USD 0.016461 |
| Generation | Terra | 52.858 s | USD 0.118886 |
| Repair | Terra | 35.538 s | USD 0.080815 |
| Total | | 102.864 s | USD 0.216162 |

These amounts come from stored token usage and the application's configured rates. They are not an independently verified provider invoice. Both generation responses completed at the provider, but the application rejected their results.

## Findings

1. **The screenshot shows a source-edit application failure after interpretation.** `applySourceEdits()` requires each generated search string to occur exactly once, with exact whitespace and text, in the progressively edited file. A missing or repeated match produces this error. It rejects the entire candidate revision safely. Local probes against revision 4 reproduced the exact error for both missing and ambiguous checkout searches without changing the saved source. The failed patch text is not persisted, so the exact offending search and the first attempt's validation error cannot be recovered from the stored telemetry. See `apps/api/src/stores/source-edits.ts:19`.

2. **Broad redesigns still use the same small-patch protocol.** Even a full redesign must return exact search/replacement operations; replacing an existing file is prohibited. Global design instructions also require consistency across product and checkout pages. Consequently a colors/sections request can legitimately reach checkout markup, and one incorrect anchor there blocks the whole redesign. The automatic repair receives the original source and a short error string, but not the failed patch or structured information about the offending edit. See `apps/api/src/stores/source-generation.service.ts:165`, `:174`, `:183`, and `:246`.

3. **Zero YAPI credits is not a zero API cost policy.** Conversation is a separate paid request before generation, except for a few local command paths. The generation budget does not include conversation or cumulative repair spending. Failed generations are recorded with zero internal credits after the API work occurs. The UI's “Si falla, 0 créditos” does not explain that distinction alongside the claim. Its “Vista previa · sin cobros” footer refers to payment preview, not model usage. See `apps/api/src/stores/source-chat.service.ts:89`, `apps/api/src/stores/source-generation.service.ts:269`, and `apps/merchant-studio/src/source-studio.ts:270`.

4. **The retry budget can exceed the selected provider-cost allowance.** Auto can promote a failed generation to Sol while retaining the output-token allowance calculated for the initial model. There is no remaining-budget calculation across attempts. A local policy probe with a 2-credit limit produced a Luna allowance of 4,000 output tokens; the same token counts cost an estimated USD 0.094 on Sol, above that nominal USD 0.02 allowance before adding the first attempt. This is a separate defect; the screenshot's run explicitly selected Terra and stayed on Terra. See `apps/api/src/stores/source-generation.service.ts:197`, `:223`, and `:249`.

5. **Conversation lacks a reliable inventory of the existing site.** It receives a revision number, saved summaries, recent messages, and current attachment URLs, but no current page or bundled-asset inventory. After success, attachment batches are cleared correctly; the conversation then filters previous image annotations to the current batch. In this incident its saved summary says earlier images are unavailable and must not be used, while revision 4 actually retains nine bundled assets. The generator separately retains those assets and is instructed to reuse their paths. This creates contradictory guidance between interpretation and generation. See `apps/api/src/stores/source-conversation.service.ts:85`, `apps/api/src/stores/source-chat.service.ts:48`, and `apps/api/src/stores/source-generation.service.ts:154`.

6. **The requested characters and motion need a clearer execution plan.** The saved interpretation proposes original CSS/graphic characters; this conversation path explicitly cannot generate image assets. Revision 4 uses `subtle` motion, and generation defaults to the previous mode. The generator permits restrained reveal hooks, reserves floating decorations for expressive mode, and prohibits custom animation engines. Asking for “más animaciones” does not itself change that mode. This limits how literally it can fulfill characters eating cake. See `apps/api/src/stores/source-conversation.service.ts:46` and `apps/api/src/stores/source-generation.service.ts:153`, `:169`.

7. **Telemetry can look successful despite a failed website edit.** `StoreAiUsage.status` is recorded from provider completion before source validation. In this incident both generation usage rows say COMPLETED, while the generation run and both attempts say FAILED. Preserve provider completion, validation outcome, and revision-save outcome as separate fields. See `apps/api/src/stores/source-generation.service.ts:230`.

## Recommended implementation order

1. Add structured patch diagnostics and repair only the failed operations; preserve exact-match safety. Give explicitly requested broad redesigns a validated, revision-checked replacement strategy instead of forcing all work into tiny patches.
2. Supply interpretation with current page names, existing asset roles/paths, and current motion settings. Distinguish existing assets from newly attached images. Preserve the raw current request and record a plan covering each requested change before generating.
3. Enforce a cumulative API budget across interpretation, generation, and repair. Recalculate affordable output tokens before model escalation, and stop when insufficient budget remains. Explain internal credits and estimated API cost separately.
4. Reuse a validated interpretation when retrying the same request against the same revision and assets. Add request idempotency and acquire the paid-work lock before conversation to prevent duplicate interpretation calls.
5. Make character-art and animation capabilities explicit in the plan. Clarify only essential missing choices; use the user's delegation when given. Add outcome-based evaluation examples for Spanish, English, typos, multi-part edits, corrections, and existing-image references.

## Validation and limits

- Passed 79 tests across seven suites: source edits, source generation, generation policy, conversation, chat, context selection, and usage recording. All provider responses were mocked.
- Reproduced the exact checkout error with missing and repeated anchors using the saved revision in memory.
- Confirmed the screenshot's request routes to Sol in Auto, but honors explicitly selected Terra. Model routing alone does not establish interpretation quality.
- Confirmed nine retained bundled assets and subtle motion in revision 4.
- The four storefront checks shown collapsed in the screenshot were not individually identified. They are separate from the failed generation and require their expanded results or a browser diagnostic.
- No provider invoice was retrieved, no paid retry was triggered, and no application fix was applied during this diagnostic.
