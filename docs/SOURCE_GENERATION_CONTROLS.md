# Source generation controls

This narrow extension helps merchants create a first working site quickly and choose the model and usage limit for later changes. It belongs to Merchant Studio’s existing **Sitio a medida** conversation-and-preview editor. It preserves the paper, graphite, monospace treatment and existing CSS variables; it defines no new visual system or tokens. `PRODUCT.md` and `DESIGN.md` remain the broader product and design references.

## Composer controls

- A **Modelo y créditos** region sits immediately above the composer, keeping the request, model choice, estimate, and result in the same workspace. Credit details and usage expand above the compact model row.
- **Modelo** offers Auto · OpenAI, GPT-5.6 Luna, Terra and Sol, plus DeepSeek Flash, Pro and Flash Vision (experimental). The browser remembers the explicit selection; Auto is the initial selection without a saved preference.
- **Límite por solicitud** starts at 50 credits and accepts whole numbers from 1 through 500. Invalid changes invoke native validation and restore the last accepted value.
- Estimates refresh after a 600 ms pause when the instruction, selected model, limit, or attachments change, and when a project revision loads. Superseded responses are ignored. The displayed range is capped by the selected request limit and accompanied by the API’s explanation. Loading and estimate errors appear in the same status line.
- The request sends the selected model and limit with the instruction, attachments, current revision, and setup action. Controls are disabled during an action or while code has unsaved changes. Viewing an older revision also prevents sending changes until it is restored.

## First version and usage history

The first site requires a short conversation. `SourceConversationService` uses the explicitly selected model (or `app.openAi.conversationModel` for Auto) to interpret messages with saved brand facts, recent conversation and image roles. YAPI asks two contextual questions across two turns: clarify the business and customer action, then the visual direction and useful references. The merchant can delegate design choices or proceed without photos. Once those questions have been answered and the brief is usable, generation can start. Existing-site edits do not repeat this discovery.

The immediate-build shortcut has been removed. `SourceChatService` enforces the two-question minimum even if an old client sends `quick` or `generate`; the direct `/generate` endpoint only accepts existing projects. Discovery progress lives in server-authored message metadata, survives failures and resets when the merchant restarts. Legacy setup facts remain context but cannot bypass discovery.

The brand dialog shows three core fields: positioning, audience and personality. Design/voice settings, reference import and revision history are collapsed. Redundant technical fields are removed from the form, while their previously saved values are preserved. Saving partial brand information never starts website generation, and failed saves keep the entered values for retry.

Confirmed brand context is serialized in a fixed field order using only confirmed values, without evidence, source notes or unconfirmed suggestions. Site generation includes these rules before its explicit cache boundary. Conversation requests using the supported GPT-5.6 generation models also place confirmed brand context in a separate cacheable block; other configured conversation models retain compatible implicit caching. Both paths retain store-scoped cache keys. The current request, catalog/source context and images stay after the explicit boundary, so changing them does not change the brand prefix. Editing a confirmed value immediately changes that prefix and the next generated brand stylesheet; reordering fields alone does not.

Cache reuse is not guaranteed: model, settings, response schema, prefix length and cache availability also affect hits. Existing usage telemetry records provider-reported cached tokens and cache writes; no savings are inferred from a configured cache key. First/cache-miss requests can incur cache-write charges. Existing page-specific source selection remains in place, with full context retained for ambiguous or global edits.


Structured response parsing reads the final assistant message and combines its content parts, ignoring intermediate commentary. It rejects incomplete, refused or malformed final output. Source generation allows one bounded repair for incomplete output, transient HTTP failures or invalid source; a failed result never replaces the saved project.

Conversation decisions also allow one retry within a shared 60-second deadline. Returned image URLs are constrained to the currently owned attachment batch; obsolete image annotations are removed from context. Failures log a reason category and provider response ID without logging private message content. Full visual redesigns and explicit marquee/animation requests receive the larger edit budget in Auto, even when their wording also contains “color”. An explicitly requested decorative marquee is allowed with pause/resume and reduced-motion support.

Confirmed context, pending questions and image roles are saved in message metadata and restored after reload or failure. Invalid/unavailable model output fails without starting a generation. The conversation call uses a shared 60-second timeout and a bounded structured response. It does not bill generation credits, but its estimated provider cost counts against the same request allowance as generation and automatic repair. Each paid attempt reserves estimated input/cache-write and output cost before calling the provider, then reconciles reported usage. Missing usage retains the reservation. A repair recalculates its output allowance at its own model rate; Auto falls back to its original model if escalation is unaffordable. This is an estimated provider-cost control, not a guaranteed invoice cap, because input token counts are estimated. Unpriced conversation models are rejected before spending through the budgeted chat route. See [Complete generated stores](COMPLETE_GENERATED_STORES.md) for the resulting product and checkout pages.

Sending clears the composer text and attachment tray immediately. The pending request keeps its own text and image count in the conversation while uploads and AI work finish. If upload or submission fails before the message is saved, the draft and attachments return to the composer. If the server saved the message but generation failed, the composer stays empty and **Reintentar mensaje** resends that request using its existing upload URLs. The retry is disabled while a new draft is being written or has attachments, so it cannot replace that draft.

**Ver uso reciente** toggles an ordered list of API-recorded runs. Each row shows the revision, “En curso,” or “Sin revisión,” plus model, credits, and duration when available. An empty result says there are no generations yet. If history is open, the send handler refreshes it in `finally` after a successful or failed message request; if that refresh fails, the panel closes instead of retaining stale entries. Generation metadata also appears below the corresponding chat reply when supplied by the API.

The UI explicitly describes these as **usage credits, without purchasing a balance**. Its policy is zero YAPI credits for a failed generation and at most one automatic repair within the remaining API allowance. Failed calls can still incur provider cost; the UI states that distinction. There is no prepaid balance, top-up, purchase flow, or monetary price in this extension; enforcement and recorded usage belong to the API.

## Reference images

The composer accepts up to 24 PNG, JPEG, or WebP references. Each input may be up to 20,000,000 bytes before browser preparation. Larger images are drawn to a canvas targeting a maximum dimension of 1600 px and encoded as WebP at quality 0.82. Small images can remain unchanged; the original is also retained when it is smaller than the encoded result and already within the 2,000,000-byte and 1600 px limits.

Prepared images must fit within 2,000,000 bytes each and 6 MiB in total. Before the first site, the conversation accumulates attachments across replies, with the server enforcing 24 overall. For an existing site, a newly selected batch replaces earlier pending uploads; a text-only follow-up or retry reuses the latest batch after the last completed revision. Historical uploads and image-role annotations do not count as new attachments; later generation also counts retained bundled assets toward the 6 MiB budget. The conversation model inspects new and unresolved images with their original URL labels and preserves confirmed roles. Empty-text uploads use neutral copy, without assuming a logo or reference role. The site generator sees the first six selected images directly, receives the agreed image roles, and bundles accepted attachments as local assets. References guide style; rejected images are excluded from the generation. Uploads run with at most three concurrent requests. The attachment list shows previews, filenames, and individually named remove buttons.

## Accessibility and layout

The model selector and numeric limit use native controls with visible wrapping labels. The surrounding region has an accessible name; the estimate uses `role="status"`, and request errors use `role="alert"`. Fields and the history/build buttons have a minimum height of 44 px. Keyboard focus has a visible graphite outline, 3 px wide with a 3 px offset. Labels and usage text wrap, and the history list scrolls within a 160 px maximum height. The two-field grid reuses the editor’s existing surfaces, ink, and keylines; it adds no animation or breakpoint.

These are observed implementation properties, not an accessibility certification. The history toggle currently retains its label when open and does not expose `aria-expanded`. Those limitations are not changed by this documentation pass.

## Scope and limitations

Model choice, request limit, and whether history is open live in the mounted editor’s memory and reset on a full reload. Estimates depend on the service response and are not final usage receipts. Recent usage is not a paginated billing ledger. A generated revision can be reviewed in the editor, opened in a browser, or downloaded through the existing controls; these generation controls do not establish a production publishing workflow.

## Source of truth

- `apps/merchant-studio/src/source-studio.ts`: state, controls, estimates, conversation rendering, message submission, and history refresh.
- `apps/merchant-studio/src/source-studio.css`: control layout, minimum target heights, focus treatment, and history overflow.
- `apps/merchant-studio/src/source-images.ts`: browser image preparation and input limits.
- `apps/merchant-studio/src/api.ts`: `SourceGenerationSettings`, `SourceGenerationEstimate`, `SourceGenerationRun`, and the source-project message, estimate, and usage calls.
- `apps/merchant-studio/src/studio-ui.ts`: shared composer and editor navigation.
- `apps/api/src/stores/source-setup.ts` and `source-chat.service.ts`: welcome copy, saved context, legacy draft migration and generation handoff.
- `apps/api/src/stores/source-conversation.service.ts`: contextual reply/generation decisions, image inspection, ownership checks and validated model output.


## Recovery and current-site context

Interpretation receives the saved revision's page titles/headings, bundled asset paths and references, and current motion mode. Existing assets remain available independently of new upload batches; binary content and configuration are excluded from this inventory. Multi-part requests produce a plan covering each requested change. Request interpretation, concept planning and both static/React generators share `SOURCE_VISUAL_ASSET_DIRECTION`: animation defaults to purposeful movement of real supplied imagery and polished existing icons. Illustration requires an explicit request or supplied illustrated brand style. Missing image/video capabilities lead to a simpler composition using available assets, never a silent cartoon substitute or invented media URL.

Local edits remain atomic and exact. A failed search produces structured repair context containing its path, index, missing/ambiguous reason, search, intermediate file content, and prior candidate. This context goes only to the bounded repair; it is not returned in public error bodies or usage telemetry. Explicit whole-site redesigns may replace only server-approved HTML and styles.css files; other paths stay under the local-edit contract. Duplicate replacements, no-op revisions, reserved paths and invalid commerce hooks remain rejected. The saved revision is replaced only after validation succeeds.

A clear new request for more animations selects expressive mode even when Studio submits the previously selected subtle mode. Requests to remove or reduce motion select off or subtle; other requests preserve the existing setting. Expressive mode controls motion intensity, not illustration style. Keep one clear focal point, a convincing still composition, bounded transform/opacity movement and reduced-motion fallbacks outside checkout. Continuous decorative movement needs a pause control. Functional browser checks do not certify visual quality.

An immediate identical retry (same revision, instruction, attachments, site inventory, setup action and motion, within ten minutes, with no intervening message) reuses the last validated interpretation after a failed generation. It starts a new user-authorized request allowance; it does not claim the prior API work was free. New wording or context triggers fresh interpretation. Generation usage status now reflects source validation; the generation run separately records whether the revision was saved.


### Compact edits and real-browser validation (2026-09-09)

Existing-site output now includes `appends`: at most one addition each to `styles.css` and `site.js`. This avoids reproducing a large stylesheet just to add a section or animation. Appends are applied atomically with edits and new files; reserved targets, duplicate targets, binary files, empty additions and invalid JavaScript are rejected. New HTML uses short unique anchors. Whole-file replacement is available only for approved redesign files of at most 12,000 characters.

Every attempt receives its actual allocated output-token limit, with room reserved for reasoning. A repair includes the failed operation and compact diagnostics instead of duplicating the full candidate. Attempts record provider status, incomplete reason and validation failure text without retaining the source response. Truncated JSON is still rejected: incomplete code is never saved as a successful revision. See [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) for incomplete-response handling.


The correction was verified in the merchant's existing Chrome session with real API calls: a basic headline change saved QUEMADO revision 5, then the previously failing request to expand the page with natural-tart copy, refrigeration guidance and animation saved revision 6 in a single generation attempt (45.232 seconds, 3,505 output tokens). The saved homepage grew to 9,836 characters and 12 motion hooks; no repair was needed. Eight relevant backend suites passed 100 tests before the final Spanish motion-phrase extension. The four remaining purchase-check blockers were traced to an empty catalog, not generation failures.

## DeepSeek

Explicit model selection now controls chat, generation and repair and persists in the browser. DeepSeek has a separate server key and never falls back to OpenAI. See [setup and comparison workflow](DEEPSEEK_COMPARISON.md).

## Conversation deadlines and failure diagnostics

Interpretation and its optional repair share a 120-second deadline. A timeout ends that request with HTTP 504 and `conversation_timeout`; it does not automatically start another provider call. The editor preserves the selected model, the saved merchant message and owned uploads, and permits an explicit retry. Missing provider usage retains the existing cost reservation rather than assuming that the call was free.

Timeouts, connection failures, provider HTTP errors, incomplete output and invalid structured output now have distinct user-facing messages. A timeout reports that site generation did not begin. The saved chat adds one shared attachment/retry notice, avoiding the duplicated reassurance previously shown in TOLEDO. Existing historical messages are preserved.

Failed interpretation attempts persist a whitelisted `usage.diagnostic` object alongside existing usage telemetry, even when no usage or response ID arrives. Fields include the failure code, attempt, deadline, HTTP status and provider request ID when received, plus recognized provider status/incomplete reason values. Duration and model remain on the usage row. Raw errors, provider response content, prompts, files and credentials are not included in diagnostic records. The terminal warning uses the same whitelist. Conversation failures also retain their structured cause in the saved message metadata.

Verified with mocked timeout, connection, HTTP 503, invalid/incomplete response, diagnostic redaction and attachment-preservation tests. This change does not replay TOLEDO's failed request or submit its media to a provider.

## Repairing complete React drafts with media

A complete React response that fails source validation now uses a narrow edit repair against that unsaved candidate. The repair receives the candidate source, the exact validation error and committed concept. It uses the edit schema, preserves unchanged files and requested products, and does not resend image pixels or repeat conversation/concept planning. Normal source, TypeScript, commerce and design validation still run before any save.

Repair capacity is calculated from the actual repair payload, capped at 4,000 output tokens with a 1,024-token minimum, under the original shared request budget. Explicit model selections stay unchanged. Malformed or truncated responses and failed original search edits still use their existing repair paths. If repair cannot fit the remaining allowance, the error identifies the original validation failure and says that no new revision was saved.

Regression coverage reproduces TOLEDO's missing `data-cart-open` validation failure with five images and the observed earlier-stage consumption under a 50-credit Sol allowance. The second call patches the shared header, sends no image inputs, keeps the homepage unchanged and retains all five assets.

### Named shared React components (TOLEDO)

The real TOLEDO reproduction exposed the underlying false rejection: the generated `Header` and `CommerceStatus` were valid named exports imported from `./shared`, but `nextPageMarkup` only followed default imports. It therefore reported missing commerce hooks that were already rendered by the site. The JSX inspector now resolves named import aliases, named function/variable exports, separately exported defaults and referenced local components. It inspects the selected component instead of borrowing markup from every export in a shared file. Unused exports cannot satisfy missing hooks; source remains parsed, never executed in the API.

The original TOLEDO response passed compilation and design validation after this correction. Its already-received response was recovered locally as a private draft, retaining the photos/videos and recording the original generation provenance; recovery made no provider call. The preceding live reproduction did use Sol under the selected 50-credit request allowance, with its usage retained in the existing telemetry.
