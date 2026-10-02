# Yapi reliability, pages, accounts and security

Date: 2026-10-01. Local implementation and validation; no storefront published.

## What changed

Yapi now gets a shared page registry, a per-store inventory of actual source files and local assets, content ownership, catalogue state, and the page currently open in Studio. The conversation preserves separate-page requests and every requested destination. An explicit `create_page` tool creates independent routes; navigation is verified by clicking real links at desktop and mobile widths. Studio provides a New page form that prepares a reviewable chat request.

The agent plans observable requirements before editing. Verification combines compilation, existing commerce/scope guards, browser health, and per-requirement evidence at 1280 and 390 pixels. The same acceptance gate runs during verify and finish, followed by verification of the final assembled snapshot. A timeout or incomplete answer no longer becomes a successful saved revision. Partial and blocked work is recorded honestly. Private checkpoints can resume the same request within 24 hours only when its source, assets, business context and current-page context match. The usage endpoint excludes checkpoints.

New uploads are included in existing-store previews. The agent can inspect local images, capture any registered page, and diagnose broken images and horizontal overflow. Long transcripts evict stale screenshots and file reads. Compound requests route conservatively to a stronger model; this remains a heuristic, not a guarantee of semantic understanding.

Customer forms share markup and appearance rules between checkout, Studio and offline agent verification. Protected authentication stays on the trusted checkout origin. Yapi can change the real form's colours and radius through a dedicated tool. Preview forms clearly state they do not create accounts or submit real requests. Password reveal, native validation, mobile input sizes, account sample states and load retry are implemented.

Studio has a grouped page picker, clearer menu/actions, a styled file tree and syntax highlighting that preserves safe plain-text editing. It explains that standard pages come from templates, informational content comes from store settings, and catalogue/account pages depend on real data.

Local ChatGPT mode uses an unmetered Yapi request budget, reports its provider mode in estimates, and labels the editor accordingly. It does not fall back to paid provider credentials. ChatGPT's own plan limits still apply.

## Security changes

- Unverified registrations replace pending credentials and invalidate earlier verification links together. This prevents preserving an earlier registrant's password when the email owner registers.
- Serializable transactions with bounded retries protect concurrent registration/verification and password reset. Reset atomically consumes the token, changes credentials and revokes sessions. A login cannot escape a concurrent reset using an old password. Account deletion is atomic and rechecks credentials.
- Oversized passwords cannot authenticate by truncation. Address updates reject missing required fields, invalid phone numbers and duplicate identifiers. Email-provider errors do not log arbitrary message bodies.
- When embedded browser storage is unavailable, a bounded in-memory session fallback keeps the current visit working. Logout and expiry clear it; credentials remain on the checkout origin.
- Account responses are non-cacheable and non-indexable, suppress referrers, and restrict framing to the same origin and configured editor origins. The offline verification sandbox remains network-isolated.
- Asset recompilation, standard-page insertion, contact-form changes and revision restoration share a merchant compile budget. Asset edits also receive a per-route request limit.
- Production dependency updates include sharp, multer, PostCSS and transitive parsers. Audit details and remaining development-only findings are recorded below after final validation.

Production account embedding requires `MERCHANT_DASHBOARD_ORIGIN` and, when separate, `MERCHANT_STUDIO_ORIGIN` on the checkout server. Supply exact trusted HTTPS origins. Local development allows the known loopback editor ports. Run `prisma migrate deploy` before deploying the checkpoint/outcome changes. Local migrations have been applied.

## Research translated into this implementation

These are documented public product behaviours, not access to competitors' internals or independently measured performance.

| Product | Publicly documented approach | Applied to Yapi |
| --- | --- | --- |
| [Amboras FAQ](https://www.amboras.com/faq) | Describes an assistant aware of the admin page, editable storefront/custom pages, draft redesign preview and scoped actions. | Page context and ownership, independent routes, private draft verification, explicit supported operations. |
| [Wix AI website builder](https://www.wix.com/ai-website-builder) | Combines conversational creation with visual editing through Harmony/Aria. | Chat and direct editor controls work together; current preview context informs requests; page creation is discoverable. |
| [Shopify Sidekick help and guidance](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/help-and-guidance) | Uses store context and target selection, proposes supported theme changes, and leaves saving/review under merchant control. | Scoped edits, actual project inventory, trusted styling tools, reviewable revisions and separate publication. |
| [Shopify generated apps](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/generate-apps) | Documents planning, previews, source, versions and desktop/mobile inspection for generated admin apps. | Requirement planning, tool diagnostics, browser evidence and recoverable private drafts. This is a workflow comparison, not feature parity with Shopify apps. |

The resulting approach is to inspect actual project state, plan the request, use bounded native tools, verify what users see and report the outcome accurately. It does not make every possible commerce/admin operation available through Yapi, nor reproduce competitors' proprietary implementations.

## Validation and limits

Work resumed after the interrupted local session. The dependency installation completed, resolving the earlier Vite dependency-transform failure. Browser checks exposed two additional editor issues: background estimate updates closed the page picker, and author CSS overrode the hidden credit controls in ChatGPT mode. Both are fixed. The browser harness now starts checkout as well as Studio so trusted account previews work from a cold start.

Verified after resuming:

- Checkout: 450 tests across 43 files passed with one worker; the earlier four timeouts did not recur.
- Studio: 230 tests across 35 files passed. All 17 selected editor/account browser tests passed, including desktop/mobile login, registration, recovery, page navigation, code editing and full-window preview. Two additional deterministic browser runs passed with the estimate response deliberately released while the page picker was open.
- Database integration: all 60 tests across 11 suites passed against disposable databases, including account races and checkpoint/outcome persistence.
- Storefront preview: 36 tests passed. Storefront kit runtime parsing and type checking passed. The local ChatGPT bridge's 10 offline tests passed.
- API, checkout and Studio production builds passed. Studio type checking was repeated after the menu fix.
- The saved dependency audit reported zero advisories; this is the audit from the interrupted session, not a fresh advisory lookup.

The saved live-model suite used a private copy of the existing Bhakara revision and evaluator-owned checks. Heading changes, trusted login styling and independent page creation passed at desktop/mobile widths (78, 87 and 276 seconds respectively). The compound dog-food redesign did **not** complete: its final attempt reached 40 model calls and the step limit after 562 seconds, despite two successful intermediate verification calls. This was the remaining live-evaluation failure at the end of the first recovery session. The follow-up below records the subsequent reproduction, fixes and passing run; one successful fixture is not an overall reliability measurement.

No live catalogue mutations, store revisions or publication were needed for these evaluations. Private inputs, model diagnostics and screenshots stay under ignored `.yapi-evaluation/`.

Known limitations: a small live fixture suite cannot establish an overall completion rate. Requirements proposed by the model can miss intent, so independent evaluation remains necessary. Account browser previews are simulated; real email delivery and external payment processing require separate integration credentials. Empty catalogues cannot demonstrate real purchases. Uploaded artwork is supported; local ChatGPT mode does not promise image generation. Full business-setting mutation and background jobs across server restarts are not provided by these changes.


## Follow-up: compound redesign completion

Resumed from the screenshot showing the pending ChatGPT-plan evaluation. All runs used the saved private Bhakara fixture, the same dog-food instruction, GPT-5.6 Sol, and the existing 40-tool-call limit. No storefront revision was saved or published and no paid API fallback was enabled.

The first reproduction failed after 40 model calls in 497 seconds. It spent many calls on separate replacements in shared files, then ran out while repairing verification failures. A second run stopped after repeated verification findings (35 calls, 499 seconds). Those diagnostics exposed a preview mismatch: newly referenced bundled Lucide icons were added by the save pipeline but absent from the agent's draft preview. They also exposed acceptance checks that required hidden commerce mounts to be visible or used unsupported navigation destinations.

Changes made during this follow-up:

- Added `edit_file_batch`: up to 20 ordered exact replacements in one file, committed atomically. Missing or ambiguous searches leave the original file unchanged; protected paths remain read-only. Batches invalidate old verification and participate in private checkpoints.
- Clarified task planning and completion guidance: cover the merchant's requested outcomes, avoid unrelated design requirements, reserve calls for verification and finish, and let the commerce verifier check hidden runtime mounts.
- Draft previews now use the same local asset bundler as the save pipeline, preserving existing asset metadata and loading newly referenced icons.
- Unsupported navigation-check formats are rejected during planning, before edits lock the plan. Navigation diagnostics include the requested destination.
- The evaluator retains diagnostics for successful runs and returns a failing exit status for failed or falsely completed runs.

The final live run **passed in 355 seconds with 21 model calls**. All 14 independent checks passed: the requested main heading, two section headings, and four supplied photos, each checked at 1280 and 390 pixels. The saved candidate was inspected visually at both widths: warm orange palette, all supplied photos, no horizontal overflow, and no reported browser/image errors. The catalog matched the fixture exactly. It contains zero products, so the offline shopping probe explicitly reported unsupported rather than claiming a purchase was tested.

Validation: all 37 workspace/tool/loop/prompt tests passed; both provider adapter suites passed; the generation and task browser suites passed (25 tests at that stage); and the final asset/capture/task suites passed (16 tests, including the new icon-loading and early plan-validation regressions). Type checking and `git diff --check` passed. Browser suites required execution outside the filesystem sandbox to launch Chromium; their restricted-run failures were environmental.

Evidence remains in ignored `.yapi-evaluation/`: `recovery-before-batch-report.json`, `recovery-before-assets-report.json`, `recovery-dogfood-report.json`, `recovery-candidate-dogfood-1.json`, `recovery-independent-checks.json`, and `recovery-dogfood-{1280,390}.jpg`. This closes the specific previously failing fixture, not the broader multi-template/repeated-run reliability gate.

## Follow-up: disappearing drafts, grouped photos, and MATCHO adaptation

The Vizz run failed because one `image` requirement contained six comma-separated paths, while the browser checker interpreted the entire value as one path. Planning now validates local image lists, and browser acceptance requires every listed image to load and be visible. A missing image still fails with its individual path.

Draft updates now compile after each successful mutation rather than waiting for a clean verification or screenshot. Compilation failure keeps the last renderable preview. Private checkpoints retain both unfinished source for continued work and the last renderable source/theme for preview recovery. Studio keeps that preview after failure and reload, labels it unfinished, and permits switching back to the saved revision. Unverified drafts cannot be published or exported. Recovery checks store ownership, current revision, latest run state, and ownership of referenced uploads; first-site recovery does not require an existing revision. Checkpoints remain subject to the existing 24-hour recovery window.

MATCHO's Miga adaptation exposed a separate billing-mode bug: the template path constructed a metered 20-credit request budget even in ChatGPT-plan mode. That run exhausted the allowance after three calls. Template adaptation and imported-site generation now obtain their budget from the generation service, honoring ChatGPT-plan mode without changing paid-mode limits. Its compiler also reported “The service is no longer running” during local development updates. Miga revision 1 was saved; the storefront was not deleted. No unfinished generation from that run was available to restore.

Validation includes streaming-before-verification and broken-edit retention, ownership and first-site checkpoint recovery, a regression for uncapped ChatGPT-plan template adaptation, and four browser scenarios covering existing and first-site draft retention after failure/reload at desktop and mobile widths. These changes do not make active jobs survive a server process restart.

Failed template adaptation now retains pending uploads and reports a failed workflow rather than “Trabajo completado.” The next text-only request also recovers uploads from older fallback messages whose lists were cleared, covering MATCHO's existing conversation without modifying its stored history. Targeted conversation tests cover both formats.

The additional six-photo live evaluation **did not pass**: it stopped after 665 seconds and 30 model calls when three consecutive requests returned `chatgpt_connection_unavailable`. No paid API fallback occurred. Before that interruption, image acceptance still reported missing images. Image checks now also inspect image descendants when a requirement selects a gallery/section, and diagnostics name the scope selector; the eight task/browser tests pass with both direct-image and container selectors. This final checker adjustment has not completed a live model evaluation.

Final local validation: 82 conversation tests, 8 interrupted-preview tests, 83 generation-service tests, the 19 generation-agent tests, the tool suite, and 8 task/browser tests passed. Four Studio browser scenarios passed, API and Studio type checks passed, and `git diff --check` passed. Two old failure-message assertions initially failed and passed after being updated to the new merchant-facing wording.

Restarted `pnpm dev:chatgpt`; API health returned 200 and the rebuilt dashboard served successfully. Confirmed in the user's browser that MATCHO revision 1 (Miga) is visible and the billing control says Plan de ChatGPT. Its requested green/white/video adaptation remains unfinished. Private evidence: `sixphoto-report.json`, `sixphoto-live.log`, `final-*-tests.log`, `chatgpt-dev-recovered.log`, and `matcho-restored.png` under `.yapi-evaluation/`.
