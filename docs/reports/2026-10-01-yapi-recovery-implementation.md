# YAPI recovery implementation

Status: substantial recovery implementation completed locally; live qualification blocked by ChatGPT authorization refresh HTTP 500. YAPI is not yet release-qualified. The original audit is in `2026-10-01-yapi-architecture-audit.md`.

## Implemented foundation

- Browser requirements compare canonical CSS values and include expected/observed evidence. Normal and reduced-motion profiles are explicit. Media checks distinguish a visible element from a decoded video. Invalid checks have a distinct evidence kind.
- A plan can repair selectors after editing while preserving every requirement's ID, description, page, check, expected outcome, and motion profile. Planning failures are retained in tool diagnostics.
- The acceptance gate's normalized authored files return to the workspace before browser checks. Finish uses the verified workspace version instead of running a mutating gate again.
- The final prepared design has a frozen snapshot and digest. Generation validates that prepared snapshot, and ordinary design commits consume those bytes without another compile. Input changes and artifact changes are rejected.
- Chat requests use persisted `StoreSourceChatJob` rows. Request IDs deduplicate submissions, active-store uniqueness prevents duplicate admission, leases identify a worker, heartbeat loss aborts generation, and the revision transaction checks the same lease. Cancellation cannot authorize a late commit. Expiration does not automatically repeat model calls.
- Generation heartbeat replaces age-only ten-minute expiry. Interrupted jobs expose their retained draft. Expired chat leases release their associated generation in a transaction.
- Studio sends jobs and polls their durable result. Reload reconnects to active work. Failure and reload retain the draft. Cancellation is exposed. Conversation replies awaiting more information are distinguished from completed builds.
- Toolbar, job/recovery notice, preview and footer have stable grid slots. Desktop/mobile recovery tests assert useful geometry.
- Job input preserves a typed original merchant request independently of the generated conversational summary. Its visual scope informs generation.
- Development and other environments default to the agent engine. `YAPI_ENGINE=single` remains an explicit compatibility/rollback option.
- The ChatGPT transport classifies authentication, connection, timeout, stream and cancellation failures without returning credentials or exception text. No paid fallback was added.

## Known boundaries still requiring work or qualification

The complete target architecture is not yet established:

1. Catalog-changing generations still use the existing transactional catalog rewrite path. Their final `config.js` reflects committed product data; they are not covered by the exact whole-snapshot artifact claim above. Commerce transactions are preserved.
2. Interrupted work is resumed through an explicit merchant retry and compatible generation checkpoints. Automatic replay of an unknown dispatched model call is deliberately absent. A fully staged chat continuation after a template commit is not yet implemented.
3. Original request scope is typed, but historical business facts and asset-role decisions still use existing conversation structures. This is not a claim that every intent heuristic has been removed.
4. Studio build submission, accepted job identity, completion, interruption, and cancellation use an explicit state reducer. Unrelated editor controls retain their existing state.
5. Repeated live qualification is incomplete. Nine of fifteen planned cases were attempted across evolving code; six were not attempted after the authorization outage. Original failures are retained. Scratch/template/populated-catalog completion remains unqualified.

## Evidence so far

Private fixtures and reports remain in ignored `.yapi-evaluation/`; do not publish merchant source or media.

- Checker and configuration batch: 27 passing tests.
- Generation service and agent tests: 106 passing tests in the combined batch, plus artifact/job tests; the only initial remaining failure was a malformed-selector test fixture that Chromium permissively accepted. It was corrected to an actually invalid selector and the checker batch passed.
- Save/tool/artifact batch: 30 passing tests; job suite subsequently passed all 4 after a TypeScript union fix.
- Browser recovery: four combinations of first/existing site and 1440/390 width pass failure retention, reload during work, reload after failure, and preview geometry checks.
- Merchant Studio embedded build passes. API typecheck passes as of the latest completed check.
- A real ChatGPT-plan logo edit in an isolated private store produced a progressive preview, saved revision 2 once, deduplicated the request, and remained unpublished. Result recovery after a dev-server restart succeeded. This is one flow, not the release gate.
- The repeated suite covers local edit, video, six photos, scratch and template flows three times, including empty/populated catalogs. Results and independent 1280/390 browser checks are being recorded as they occur. Its HTTP calls use the same durable job endpoints as Studio; UI reload behavior is tested separately. Do not describe this harness as fifteen browser-driven user sessions.

## Migrations and rollback

Apply `20261001190000_yapi_chat_jobs`, `20261001191000_yapi_generation_lease`, and `20261001193000_yapi_job_progress` before running the new API. These additive migrations were applied to the local development database. No deployment or publication was performed.

To roll back the primary generation engine, explicitly select `YAPI_ENGINE=single`. Do not drop job or checkpoint data. Preserve the working-tree baseline at `.yapi-evaluation/recovery-baseline/working-tree.patch` and untracked-file hashes; it includes pre-existing changes that must not be reset.

## Live findings during qualification

Every failure remains in the private report; a later success does not erase it.

- Six-photo attempt 1 stopped after the agent planned an impossible product-gallery assertion on an empty catalog and treated a browser-normalized font fallback as a font mismatch. Plan feasibility now rejects that product assertion before editing; primary-font equivalence requires the actual loaded font. A separate retry saved revision 2, with all six original photos decoded and visible and no horizontal overflow at 1280/390. The retry took about 399 seconds.
- That retry also exposed unstable checkpoint identity based on model-generated prose. Durable job requests now carry original instruction, base revision, upload set, selection, design options, and a conversation anchor. Compatible source can survive rephrasing; browser evidence is rebuilt. Legacy checkpoints migrate only through their original durable job. The key and invalidation tests pass; real resumed-source qualification remains pending.
- A real lease-expiry fault test initially revealed that expiry was blocked behind the active worker loop. Expiry now runs on its own timer. Three real-database scenarios pass: cancelled worker cannot commit; expired job is interrupted; its generation is released while its checkpoint survives.
- Video attempt 1 saved, and playback/decoding tests passed, but stronger independent checks rejected the result: the hero measured about 608px on desktop and 620px on mobile against an 844px viewport, and hidden media continued playing in reduced motion. This is a false completion and fails the release gate. A stricter geometry and media-plan contract is being implemented; do not describe the first video result as fully correct.

- Scratch attempt 1 stopped on missing platform scaffold files (`package.json` and `README.md`) during preview. Scratch preview now supplies the trusted framework scaffold without a designer template; a real compiler regression test passes. Its plan also contained CSS `@media` rules where selectors were required; these are now rejected at planning time.
- Scratch attempt 1 drifted from blue/white sans to ivory/black serif. Root cause: the first automatically ranked visual direction was labeled “chosen by the merchant (mandatory).” Automatic ranking no longer adds that binding palette. Explicit selections have merchant provenance; permission to proceed is remembered separately. All 85 conversation tests pass after adding this regression.
- A live video repair was submitted through embedded Studio, reloaded during work, deliberately cancelled after producing a draft, and resubmitted with the same original request. The UI retained the draft. The job and generation became CANCELLED/INTERRUPTED without a commit; the retry matched the same stable request key and retained source, then saved revision 3. Independent desktop/mobile normal/reduced checks all pass: hero dimensions 1280×844 and 390×844, decoded playback in normal, visible poster plus paused hidden video in reduced motion. This is a separate successful recovery scenario; video attempt 1 remains a failed fidelity result.

## Final local state and qualification boundary

The app is running with `pnpm dev:chatgpt` at http://localhost:4323. Startup no longer requires a successful remote token refresh before opening the local editor. Inference still requires valid ChatGPT authorization and never falls back to API keys. The latest smoke check failed with `chatgpt_authentication_unavailable`; an earlier direct refresh exposed HTTP 500 from the authorization endpoint. This establishes an authorization-service failure for this session, not exhausted allowance or a worldwide outage. Saved credentials were preserved; no new login was attempted.

Transport now preserves safe stage/status distinctions. Authentication 5xx is temporary; 4xx rejection directs reconnection. Conversation handling retains the safe provider code/status and does not perform a second interpretation call for authentication failure. Tests cover these paths without real credentials.

Final browser review also found that the merchant-copy sanitizer converted a successful message containing “viewport” into a failure. Message formatting now takes the persisted outcome into account, translates that word to “pantalla,” and cannot introduce a failure fallback for a successful saved revision. Its regression test and the standalone/embedded Studio builds pass.

### Live matrix at interruption

| Flow | First attempt | Separate recovery result | Remaining qualification |
|---|---|---|---|
| Local logo edit | Saved; correct at 1280/390 | Additional initial smoke also passed idempotency and result retrieval | Populated repeat blocked by authorization; third not attempted |
| Full-screen video | Saved but independent full-height/reduced-motion checks failed | Real Studio submit → reload → cancel → exact-request retry → revision 3; all four independent viewport/motion checks pass | Populated repeat blocked; third not attempted |
| Six uploaded photos | Failed on impossible gallery/font assertions | Revision 2 saved; all six original images visible/decoded at 1280/390 | Populated repeat blocked; third not attempted |
| Scratch creation | Partial: scaffold/checker defects and wrongly promoted automatic palette | Fixes pass deterministic tests; retry interrupted by authorization failure | No successful live scratch completion yet |
| Optional template | Setup conversation reached; later request blocked by authorization | None claimed | Adaptation and both repeats remain unqualified |

The suite used real durable chat endpoints, plus independent browser rendering. The video recovery used the actual embedded Studio UI. Four mocked browser recovery scenarios separately verified first/existing site at desktop/mobile, including reload during work and failure retention. These are distinct forms of evidence.

Latency observations are not release statistics: the six-photo retry took about 399 seconds; video recovery after deliberate cancellation took about 134 seconds. Runs included development pauses, serialized queues and changing code, so reporting median/tail latency from them would be misleading. The two-second render-delivery target remains unmeasured.

### Final checks and cleanup

- API typecheck passes. Studio typecheck, standalone build and embedded build pass.
- Latest relevant batches: 90 generation/request/job tests; 85 chat tests; 39 conversation tests; provider-error regression; 25 checker/task/tool tests; scratch preview compilation regression; 25 Studio state/copy tests; 12 ChatGPT transport/auth tests. Counts describe batches, not a deduplicated repository-wide total.
- All scheduled test jobs are terminal. Twelve task-created private fixture stores were archived, preserving their revisions and evidence. Temporary suite authentication keys were removed.
- MATCHO remains at saved revision 1. Merchant uploads and prior working-tree changes were preserved. No merchant store was published, deployed, or deleted.
- Private full reports, checkpoints and screenshots remain under `.yapi-evaluation/`. The main suite report is `live-recovery-suite.json`; independent evidence includes `photo-retry-independent.json`, `ui-video-independent.json`, `ui-recovery-identity.json`, and `job-fault-checks.json` when present. These contain private test data and must not be published.

### Remaining execution

After ChatGPT authorization recovers, run the plan smoke check with the dev gateway stopped (account refresh ownership is exclusive), restart `pnpm dev:chatgpt`, and resume private qualification. Re-run the fixed scratch flow first, then template adaptation and populated-catalog flows, followed by a clean repeated campaign on a frozen code version. Keep the failed campaign as baseline evidence. Complete the catalog-mutation artifact boundary and template continuation boundary before retiring legacy orchestration. Nothing in this report claims those remaining architecture boundaries are complete.
