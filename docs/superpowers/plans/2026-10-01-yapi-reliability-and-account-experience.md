# YAPI reliability and customer account experience

Date: 2026-10-01. Status: implementation and regression validation in progress. The findings below preserve the original investigation; see [implementation, research and validation report](../../reports/2026-10-01-yapi-reliability.md) for current results. Local runtime and database migrations were updated; no storefront was published.

## Objective

Make YAPI reliably understand, execute, and verify supported merchant requests across templates, authored pages, platform content, products, and customer accounts. A successful request must satisfy the merchant's requested outcome, preserve unrelated behavior, and produce an accurately described revision.

“Understand anything asked” is a product ambition, not a testable guarantee. YAPI should recognize the affected feature, retrieve its current implementation and constraints, execute supported operations, and clearly identify genuinely unsupported work or missing facts. More prompt text alone cannot supply missing tools or browser access.

## Verified findings

| Evidence | Implication |
| --- | --- |
| Bhakara's photo request at 00:48 produced revision 7. The response said the four supplied images could not load, then announced that changes were saved. Revision 7 actually contains four new bundled image files and changed home source. | Stored revision success and task success are being conflated. The response is contradictory; the report alone cannot establish that the requested image placements worked. |
| The next request asked to adapt the store for dog-food imports to Bolivia, use photo colors, and add sections. The run started at 00:54:43, failed after approximately 447 seconds, recorded 43 model attempts, and saved no new revision. Several verify steps reported one problem before the agent stopped calling tools. | The failure needs a recoverable diagnostic and requirement tracking. Current progress stores counts, but not the exact validator finding needed to diagnose this run conclusively. |
| That request used `requestedModel: auto` and resolved to Luna with low reasoning. `source-generation-policy.ts` treats short requests containing “color” as simple unless another regular expression matches. | A multi-part change can be routed as a small color edit. Routing should use task scope and affected surfaces, not keywords and length alone. |
| Its first agent turn used 53,642 input tokens; its last used 70,441. `runAgent` accumulates the transcript without compaction. | Investigate the context breakdown and duplication. These sizes are measured; their causal contribution to failure remains a hypothesis. |
| In `source-generation.service.ts`, the agent preview for an existing store receives `previousFiles`; newly bundled `assets` are only included in the new-store branch. Final acceptance subsequently assembles assets separately. | Existing-store screenshots can inspect a different set of assets from the final revision. This is a concrete implementation gap consistent with the photo complaint; reproduce it with a fixture before fixing. |
| `captureAgentDraft` always opens `index.html`. The screenshot tool accepts width only. The agent page map omits `components/auth/*` and `components/account/*`. | YAPI cannot inspect the requested account/information page through its current screenshot tool, even when it can edit that page's source. |
| `verifyAgentDraft` checks compilation, contracts, scope, and artwork; `finish` additionally runs the acceptance gate. It does not receive a structured list of merchant requirements. | Passing verification does not demonstrate that the requested edit was completed. Some errors first surface at finish. |
| The agent prompt describes account pages as gates to another app; the newer implementation renders a trusted sibling account iframe over a slot inside the store. Agent browser capture uses an offline sandbox with frames disabled and does not mount this account host. | The agent's account instructions and inspection environment lag behind the actual editor experience. |
| `AccountGatePage`, the slot script, the trusted account host, and checkout's account renderer jointly control login. The agent can edit the wrapper but has no explicit account appearance tool. | A request to change the login form can reach the wrong layer. The form itself must remain isolated from authored code, with deliberate customization capabilities. |

The screenshot was referenced by filename but not attached. The exact visual complaint remains unverified. This plan interprets “login” as the customer form inside the store; merchant dashboard login and Mi pagosYa are separate identities and must remain clearly labeled.

## Current system map

| Surface | Main implementation | Responsibility |
| --- | --- | --- |
| Merchant workspace | `apps/merchant-dashboard`, `apps/merchant-studio/src/source-studio.ts` | Store selection, instructions, attachments, current preview, edits and publication |
| Conversation | `apps/api/src/storefront-source/source-chat.service.ts`, `source-conversation.service.ts` | Interpret current request against conversation, business facts and site context |
| Generation orchestration | `source-generation.service.ts`, `source-generation-policy.ts` | Prepare assets, choose execution policy, build prompts, run agent, accept/save revision |
| Agent execution | `storefront-source/agent/` | Read/write private draft, capture, verify, finish, product appearance tool |
| Templates and routes | `source-templates.ts`, `source-content-pages.ts`, `source-next.ts`, `packages/store-templates` | Template application, standard page wrappers, compilation and routing |
| Storefront runtime | `packages/storefront-kit`, `packages/storefront-preview`, `apps/checkout/src/source-storefront.ts` | Products, dynamic information, sandboxed previews, hosted storefront |
| Customer account | `apps/checkout/src/account`, `apps/api/src/store-customers`, `packages/storefront-preview/src/source-account-host.ts` | Trusted forms, account state, authentication, navigation and store integration |

Trace a request end to end: current merchant instruction + saved facts + revision + assets → conversation decision → generation plan → private workspace/tools → verification and acceptance → immutable revision → Studio preview → separate publication action.

The architecture has several kinds of ownership: authored layout, generated artifacts, live business data, and trusted platform UI. A file existing in the tree does not mean YAPI can safely change all visible behavior through that file.

## Implementation order

### 1. Preserve evidence and reproduce the exact failures

- Capture a local baseline of relevant revisions, asset manifests, normalized requests, provider mode, and recorded attempts. Keep customer data and credentials out of committed fixtures.
- Turn the photo replacement and dog-food request into fixed regression fixtures. Include an existing template and four new uploads, not just a new-store example.
- Add bounded, structured tool diagnostics: run ID, source revision, target page, workspace digest, tool result code, changed paths, validator findings, repair attempts, elapsed time, and finish rejection reason.
- Persist safe diagnostics on both successful and failed calls. Do not store raw passwords, credentials, private customer records, or unrestricted prompt bodies.
- Capture baseline screens for login, registration, recovery, and an account page in Studio, full-window preview, and a local hosted store.

Exit: every reproduced failure has a specific cause or an explicitly recorded unknown, and a later failure can be diagnosed without asking the model to repeat the work.

### 2. Unify assets and preview state

- Build one prepared draft snapshot used by agent screenshots, browser checks, Studio previews, and final acceptance.
- Merge new uploads with retained assets by canonical path; refresh the catalog/config from the same revision context. Specify collision and reuse behavior explicitly.
- Expose an asset manifest with stable ID, local path, role, dimensions, verified availability, and relationship to products. Give YAPI a way to inspect an asset before placing it.
- Report actual broken image requests and decode failures by path. Wait for relevant images and fonts before capture.
- Preserve uploaded bytes and confirmed image assignments across retries.

Exit: replacing images in an existing store shows the same four images in the agent's preview, saved revision, Studio, and hosted preview, with no broken visible images. No need to weaken the sandbox or expose public upload URLs to make this pass.

### 3. Give YAPI an accurate project and capability map

- Introduce a shared, versioned page/capability registry in the shared package layer. Consumers derive their route maps and tool capabilities from it instead of maintaining separate lists.
- For each page record: public route, source entry, shared layout, runtime component, content source, ownership, allowed operations, editable style tokens, dependencies, required states, and available checks.
- Include auth/account routes, custom pages, product/checkout, and dynamic information pages. Represent absent pages and missing business content separately.
- Derive a per-store project index from its actual snapshot, template provenance, assets, and settings. Read selected dependency contents on demand rather than embedding the entire repository.
- Replace stale account instructions and contradictory generation guidance. Keep rules next to capabilities, with conformance checks tying them to implementation.
- Keep confirmed facts, preferences, pending tasks and previously verified changes as separate state. A merchant correction supersedes old facts; unfinished historical work is not silently added to a new request.

Exit: “change the login button,” “update the shipping policy,” and “change the homepage heading” resolve to their correct owners and operations. The index updates when routes/templates change.

### 4. Make each request an executable, verifiable task

- Preserve the original user request alongside any generated instruction.
- Produce a structured task specification: individual requested changes, target pages/states, preserved behavior, assets, acceptance checks, and missing facts.
- Distinguish layout edits, content/settings changes, product operations, account appearance, and unsupported platform functionality. Allow a single request to contain several types.
- Ask only for consequential missing information. Use store context for references such as “these photos,” “this page,” and “make it match.”
- Route execution by scope, number of dependencies, uncertainty, and capabilities. The observed multi-part request must not qualify as a simple color edit. Respect an explicitly selected model and never switch provider or billing mode silently.
- Add narrow, validated operations for platform-owned settings/appearance where authorized; do not make the agent hack generated files. Show which operations affect live business data versus a design draft.
- Retrieve relevant code and rules by task; compact stale tool output while retaining request requirements, decisions, current diagnostics and file versions.

Exit: every clause in a multi-part request has an execution target and a verification result. Unsupported behavior is reported precisely instead of being simulated.

### 5. Verify the affected page and require truthful completion

- Extend screenshot/browser inspection to accept a registered page and a defined state, not arbitrary network URLs. Cover desktop/mobile and relevant interactions.
- Provide a controlled trusted host for account/payment preview checks; preserve the separation between authored source and sensitive forms. Simulated preview actions must not submit real forms or send mail.
- Run the same acceptance checks before and during finish, with structured, actionable findings. Detect repeated findings even when the model varies its tool arguments.
- Compare requested outcomes with actual changed files, settings and browser evidence. Compilation is one check, not the completion verdict.
- Introduce explicit completed/partial/blocked/failed outcomes, and build merchant responses from those outcomes. A claim that images could not be replaced cannot be paired with a generic “all changes saved” success message.
- On a limit or interruption, retain a private checkpoint where practical; resume only against a compatible base revision. A technically valid partial draft must not be represented as completed work.
- Bound recovery attempts; a persistent validation problem should produce its actual diagnosis, not repeated finish calls or a generic “stopped using tools.”

Exit: completion is supported by every task requirement; repeated validation failures terminate with a useful report and preserve the previous saved revision.

### 6. Make customer login one coherent experience

- Document the customer state flow: signed out → login / registration / recovery → verification or password reset → signed-in account → logout. Keep merchant and marketplace identities distinct.
- In the store show one form and one primary action, with clear secondary links. Keep store navigation and branding consistent; avoid duplicate headings, intermediate gate buttons, or unexpected redirects in supported hosted/preview modes.
- In Studio visibly explain preview behavior before submission: the form is a preview and does not create accounts or send emails. Show realistic, controlled preview states for account pages.
- Define one platform account component contract. Keep the trusted form isolated; expose supported typography, color, spacing, radius and layout choices through validated configuration. YAPI must know which changes affect the wrapper and which affect the form.
- Decide the supported appearance range with actual login designs before extending the API. Unsupported structural requests should be explained rather than implemented as unsafe fake forms.
- Test loading, retry, field errors, password visibility, keyboard navigation, focus, nested scrolling, mobile keyboard/viewport resize, reset links and return destinations. Specify behavior when the trusted form host is unavailable.
- Preserve compatible exported-store fallback behavior and label it accurately; exported static pages do not inherently contain the hosted account backend.

Exit: the merchant sees the expected login form directly, can navigate among account views consistently, and can ask YAPI for supported appearance changes that are visible and verified.

### 7. Evaluate and roll out in stages

Use fixed fixtures and real browser assertions, then a bounded live-model evaluation. Extend the existing `evaluate-yapi-agent.ts` harness; compilation or a saved candidate alone is not a pass.

| Request family | Required evidence |
| --- | --- |
| Change a heading/button/color | Exact requested result; unrelated pages preserved |
| Replace four images on an existing template | Correct assets and placements, all decode successfully |
| Adapt dog-food store copy, colors and sections | Every requested change present; no invented business facts |
| Add/change a standard page | Correct route and content source; missing data explained |
| Style customer login | Actual trusted form appearance changes, not just the wrapper |
| Navigate register/recover/account | Correct state and destination in preview and hosted contexts |
| Change product appearance | Product options, price and buying controls remain functional |
| Full redesign with follow-up correction | Required content retained; correction targets current revision |
| Provider failure, exhausted allowance, limit, retry | Accurate outcome; previous revision retained; no unintended paid fallback |

Proposed release gates:

- All deterministic regression fixtures pass, including credential isolation and no real submissions from preview.
- No false “completed” results in the evaluation corpus.
- At least 95% verified completion across repeated supported simple-edit cases; all required critical account/commerce checks pass.
- All clauses fulfilled in the fixed multi-part scenarios before those are enabled broadly.
- Report time, model calls, context size, repeated findings, repair count, and verified completion rate, separated by provider mode. Establish latency targets from baseline measurements rather than guessing.
- First validate on a cloned Bhakara fixture, then several structurally different templates, then the local merchant workflow. Keep publication separate and retain rollback to the earlier engine/configuration.

## Suggested delivery batches

1. **Evidence + photo reliability + honest outcomes:** phases 1–2 and the minimum completion/diagnostics work from phase 5. This directly targets the observed failures.
2. **Project map + task execution:** phases 3–4 and page-aware verification. This makes template/file growth manageable.
3. **Customer account experience:** phase 6, using the shared registry and trusted browser host.
4. **Evaluation and gradual rollout:** phase 7, with regression evaluation also running after each preceding batch.

Avoid a wholesale rewrite or a bigger-model-only response. Keep the working commerce/account isolation boundaries while fixing the knowledge, tools, shared preview state, and completion criteria around them.

## Remaining questions for the investigation

- What was the exact persistent validation finding in the failed 00:54 run? The stored counts/tool names are insufficient; do not claim a proven root cause for that run until reproduced or recovered from diagnostics.
- Which login state and viewport appeared in the referenced screenshot? Capture the actual UI before choosing a final composition.
- How much prompt volume is duplicated contracts, legacy instructions, source, and tool history? Measure before selecting a context reduction budget.
- Which business settings can already be changed through existing services with revision/audit semantics, and which new task operations need explicit draft behavior?
