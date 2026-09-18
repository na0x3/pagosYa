**Yapi and website editor improvement plan — 5 September 2026**

Make Yapi excellent at three connected jobs: understanding a merchant's request, producing a good website, and making further edits easy. The product promise should be: **“Tell Yapi what you want, see the exact change, and stay in control of your store.”**

The primary user is an independent Bolivian merchant working in Spanish, often without design experience. Optimize for completing a real task: launching a store, replacing a photo, improving a headline, organizing products, or preparing a promotion. Keep Yapi's personality warm and concise, with specific explanations of what actually happened.

The initial review used the working tree, the open dashboard editor and its saved conversation, and an existing mobile screenshot. Historical conversation failures became regression examples. The older graph and product notes were used for orientation and checked against current source. Implementation began on 5 September; progress is recorded below.

**Reference direction: Amboras**

Use Amboras as a reference for the interaction model: a central business assistant, contextual chat on operating pages, a real storefront preview beside the conversation, and direct editing of generated results. Its public description covers these behaviors; its claimed performance and conversion gains have not been independently tested here. [Amboras product overview](https://www.amboras.com/what-is-amboras), [Amboras editing FAQ](https://www.amboras.com/faq).

For pagosYa, make Yapi the common entry point for store creation, site editing, catalog tasks, and explanations of actual business data. Reuse existing Bolivian commerce capabilities. The website preview remains the editing surface, and the chat carries a concrete task through execution and review. Retain pagosYa's visual identity.

After the website workflow is reliable, extend the same capability registry to Products, Orders, and Analytics. Start with read-only explanations and draftable catalog work, then add explicitly authorized business actions. Reference-led design, product-photo improvements, and measured variant comparison follow. Automated A/B promotion requires real experiment assignment and conversion measurement before it can be offered as a capability.

**Implementation progress — first milestone**

- Removed the 48-second minimum presentation delay and timer-driven simulated build activity. Chat now reflects actual client events: preparing the request, uploading attachments, awaiting a response, and receiving the result. Persisted server run events remain a later milestone.
- Replaced inferred implementation filenames with the changed areas returned by the service. Initially relabeled public apply actions to make their effect clear; the next milestone below replaces them with private draft actions and a separate Publish action.
- Added plural and slider/carrusel vocabulary so concrete image and text requests do not enter the broad style questionnaire.
- Persisted the original request, proposal, and ordered attachments with clarification questions. A reply resumes that context after refresh or a failed attempt; selecting another proposal does not inherit the pending task.
- Replaced silent operation clipping with whole-request budget validation. The complete plan, including generated-media and product-placement steps, is replayed privately before image generation or product creation.
- Added regression coverage for these behaviors. Shared assistant routing, durable runs, and visual-result verification remain scheduled work; server drafts and selected-element targeting are implemented below.

Verification: 64 backend tests passed across the conversation, operation, and visual-service suites; 10 focused browser workflows passed; a further desktop/mobile capture checked that the composer and publishing action remain in view. API and dashboard builds passed. Model and business endpoints were mocked in the relevant tests; these checks do not measure live-model interpretation or design quality. Screenshots: [desktop chat](../.impeccable/yapi-phase1-desktop.png), [mobile chat](../.impeccable/yapi-phase1-mobile.png).

**Implementation progress — private drafts and selected edits**

P0-B is implemented, together with the selected text/photo path in P1-A and supporting checks from P1-B:

- Manual saves, using an AI proposal, and restoring a website version now save a server-backed private draft. Reloading either the dashboard or connected Studio recovers that draft. `Usar en borrador` and `Publicar` are separate actions; public storefront responses continue to read the published Store fields.
- Every save, proposal application, restoration, and publication requires the exact website revision. The server uses conditional writes to reject stale requests. Publication promotes the draft atomically and records the previous website fields and links for restoration. An explicit discard action returns to the public version.
- Before sending Yapi a request, the dashboard privately saves pending manual changes. It preserves newer local edits during an in-flight save and blocks applying a proposal over an unsaved canvas. A response that arrives after further edits stays in the conversation without automatically replacing the newer canvas.
- Clicking a supported text or photo field adds a removable selection chip. Requests include the page, section/block/animation address, media position, and saved revision. The API validates the target and rejects operations outside a specifically selected field. Exact quoted text and attached-image replacements have bounded handling; unchanged values cannot be reported as successful selected edits. Compatibility fields and rendered blocks are updated together.
- Deictic requests with no selection ask for the missing target. Recognized advice questions return general suggestions without generating or changing a design. This is an initial advice route; contextual visual critique and the shared business-assistant router are still pending.
- Explicit location-inventory edits are staged separately from visual data. Saving a normal appearance snapshot does not stage its incidental stock values. When stock changes are pending, the publishing action says `Publicar sitio y stock`; publication checks the original stock/allocation and rolls back the entire operation if they changed.
- The fullscreen toolbar keeps Save and Publish within a 390px mobile viewport. Desktop and mobile captures verify editor controls using a mocked storefront; they do not validate generated storefront design quality. Screenshots: [desktop editor](../.impeccable/yapi-phase2-desktop.png), [mobile editor](../.impeccable/yapi-phase2-mobile.png).

Migration `20260905090000_private_website_drafts` is applied to the local development database. Existing stores start at revision zero and use their published settings until their first private save; no public content is copied or published by migration. Deploy the migration with the matching API and editor clients. Historical proposals without a matching `baseWebsiteRevision` must be regenerated before applying.

| Editor API contract | Effect |
| --- | --- |
| `PUT /v1/stores/:id/settings` with settings, links, `revision`, and optional `inventoryProductIds` | Save normalized private website data; only explicitly listed products can stage inventory adjustments. |
| `POST /v1/stores/:id/agent-conversation/messages` with `revision` and optional `selection` | Interpret against that draft; any produced proposal records its base revision. |
| `POST /v1/stores/:id/visual-proposals/:proposalId/apply` with `revision` | Put a current proposal into the private draft. |
| `POST /v1/stores/:id/visual-versions/:versionId/restore` with `revision` | Restore website content privately; publishing it is a separate action. |
| `POST /v1/stores/:id/website-draft/publish` with `revision` | Atomically publish that saved draft and any explicitly staged inventory adjustment. |
| `POST /v1/stores/:id/website-draft/discard` with `revision` | Explicitly discard the private draft. |

Legacy operational store updates remain public and advance the published revision. An existing draft based on an older public revision then conflicts; it must be reviewed and discarded before starting from the updated public version. Automatic merging, background autosave, task-specific conflict recovery, durable/idempotent runs, and automated screenshot review are not implemented. Product creation retains its existing immediate-activation exception. Studio shares draft/publish semantics but does not yet have dashboard selection/direct-edit parity.

Validation includes 133 targeted API tests, 29 editor state/command unit tests, 20 focused dashboard browser workflows and one connected-Studio workflow, and successful builds of all three applications. The [local PostgreSQL check](../apps/api/test/website-draft.database-check.cjs) verifies competing draft saves, private/public reads, stale publication, publication, restoration, and discard inside a transaction that rolls back all fixture writes. Model calls are mocked in automated tests; live-model interpretation and merchant design-quality targets remain unmeasured.

Selected AI edits require a structured site document. A legacy site without one receives a specific explanation; selecting a photo never silently starts a full-site generation. Editing advanced animation settings also preserves the current settings view instead of reopening fullscreen over the controls.

Live-browser follow-up on 5 September found an integration defect missed by the earlier authenticated fixtures: a remembered Appearance view opened fullscreen while signed out, covering the login form with an empty editor. Fullscreen now requires authentication and a loaded store; signing out or expiring a session closes it and returns the preview to the hidden application. HTTP 401 recovery also works with Spanish error messages. The user's browser was reloaded and the login form verified as reachable.

**Follow-up — failures from the 18:18 screenshot**

The signed-in conversation exposed a different failure: `haz el website de nuevo, quiero un cambio profundo coloca tabs unicas con animaciones textos con sentido, fotos` entered the small-edit planner and failed with an unrelated header error. Explicit full-site rebuild requests now take precedence over editor keywords, selected elements, selected proposals and pending clarifications. Scoped requests such as rebuilding only the header stay scoped. The navigation operation catalog now uses the same supported values as the executor, and the brand-analysis page/motion instructions agree with the full compositor.

The real-browser retry found two additional integration failures. Saving a site with zero standalone animations was rejected by `motionExperiences`' minimum length; the DTO now accepts an empty array. Then the real OpenAI endpoint rejected `uniqueItems` in the generation schemas, forcing a curated fallback before AI composition could begin. Those unsupported constraints were removed from the outbound schemas; materialization continues to deduplicate product IDs and section media. Yapi now explicitly labels curated fallback results instead of implying custom AI generation succeeded.

Further real calls exposed truncated analysis and a complete response rejected before composition. Analysis now uses medium reasoning with an 8k total output budget; three complete site documents receive a 32k budget and a bounded four-minute composition timeout. Incomplete responses are recognized before JSON parsing, and stage completion logs include the provider response ID and output-token count. This increases the maximum possible cost; full-site latency remains to be improved. Supported section motion is accepted, and structural diversity is checked after topology assignment and bounded repair, with the final originality/diversity gates still required before persistence.

The completed real response then exposed two conversion mismatches: it declared Inicio as an explicit `home` page and selected `clip` for catalog sections. The materializer now canonicalizes that unambiguous home alias and repairs registered motion that a particular section cannot use to its supported reveal. Unknown motion, orphan destinations, unsafe references and ambiguous duplicate home declarations remain invalid. The outbound schema now constrains layout, motion and block slots separately for each section kind. The real provider accepted this final schema in a bounded 16-token schema check; the deliberately incomplete example response was not used as a design.

Three completed AI designs were recovered from the actual provider response, passed through the corrected materializer/compositor and final originality/diversity gates, and stored as private proposals: Índice de color, Manifiesto solar and Catálogo recortado. A database transaction check verified that published store fields, private draft data/revision, products, prices and stock remained unchanged (apart from the normal store update timestamp). The browser now exposes all three in the conversation, and the Crochet and Enterizos navigation was exercised on desktop and in the mobile preview. That check caught arbitrary positional catalog assignment: page catalogs now use explicit, validated product indices, category/name matches or products depicted in their own imagery. The recovered proposals were corrected to show the two crochet bikinis and the two one-piece suits on their respective pages.

All 139 focused tests across routing, editor operations, DTOs, schema/materialization, page products and visual composition pass. A complete TypeScript build passes and the local API is running. A fresh full browser request through the final schema succeeded at 19:09: it returned Índice vivo de formas, Manifiesto de siluetas and Campaña de producto recortada from the configured AI provider, without curated fallback or manual recovery. The provider reported 5,007 output tokens for analysis and 15,004 for composition. All three private previews were opened; the new Crochet page showed its two matching products, and mobile rendering was inspected. A public API response comparison before/after these runs was identical. No proposal was applied or published.

The successful fresh generation took about four minutes. Durable progress/retry handling, broader visual review, footer/navigation consistency, repeated hero/animation copy and overall editor polish remain work. These repairs establish a working redesign path, not the plan's overall excellence or merchant-pilot targets.

**1. Build on what already works**

The project already has persistent store conversations, private visual proposals, version restoration, section locks, structured AI output, validated editing operations, uploaded and generated imagery, visual diversity checks, and direct canvas editing. The dashboard also has a dedicated editor state, command, and persistence boundary. Preserve and extend these foundations.

| Initial review evidence | Why it matters | Planned improvement |
| --- | --- | --- |
| The floating helper answers through `assistantAgentReply()` keyword rules; the editor uses `StoreAgentService`. | The same character has different capabilities depending on where a merchant opens it. | Give both entry points one capability router and store context. Keep deterministic factual lookups as tools. |
| Message input includes instruction, proposal ID, and asset URLs, but no selected element or draft revision. | “This photo” and edits made manually immediately before an AI request are difficult to resolve reliably. | Send validated selection context and bind each request to an exact private draft revision. |
| The service reads eight recent messages; the revision planner includes the last six textual entries. | Long conversations retain visible history while older references and preferences can fall out of working context. | Add explicit task state, durable brand preferences, and retrieval of relevant earlier messages and attachments. |
| The open conversation includes a slider-photo request followed by an unrelated broad style clarification. | Questions can divert a merchant from an already concrete task. | Use this as a named regression case; clarification must preserve the original request and ask only for a missing detail. |
| `apply()` updates the Store in a transaction and saves a previous version; the dashboard labels its action “Usar y editar.” | A merchant can reasonably read that label as entering a private editing mode. | Immediately make public effects explicit; then separate draft persistence from publication on the server. |
| Full-site proposal presentation can wait until 48 seconds have elapsed; build steps also advance on a timer. | Fast work feels slow and progress can imply activity that was not reported by the server. | Remove the minimum wait and show actual run events. |
| Revision assembly reserves room for generated-image/product operations by slicing earlier operations. | A compound request can lose intended operations at the twelve-operation limit. | Validate the complete plan before side effects; split explicitly or reject with a precise explanation. |
| Merchant Studio embeds the real renderer with `editor=0`; its connected toolbar exposes desktop and home/checkout controls. | The new shell does not yet have the dashboard's complete direct-editing workflow. | Reuse the existing editor engine and close capability gaps before promoting Studio as the default. |

Current source: [helper replies](../apps/merchant-dashboard/index.html), [conversation service](../apps/api/src/stores/store-agent.service.ts), [message contract](../apps/api/src/stores/dto/send-store-agent-message.dto.ts), [visual service](../apps/api/src/stores/visual-studio.service.ts), [editor operations](../apps/api/src/stores/store-agent-editor.ts), [editor state](../apps/merchant-dashboard/src/store-editor/state.js), [connected Studio](../apps/merchant-studio/src/connected-studio.ts), and [Studio API adapter](../apps/merchant-studio/src/api.ts).

**2. Make Yapi understand and finish the requested task**

Use one workflow: receive the request and current context → identify the intent and target → clarify only if necessary → prepare validated operations → apply to a private revision → verify the result → show the actual changes.

- **Resolve the selected object.** Carry page, section, block or slide, media slot, viewport, proposal, and base revision. Show a removable chip such as `Inicio › Portada › Foto 1`. Resolve “primer slider,” “segunda foto,” and “ese título” against the visible page order. Use stable IDs for slides and media slots where positional indexes currently make references fragile.
- **Understand different intents.** Distinguish asking a question, editing a specific element, generating a new design, generating an image, creating a product, and undoing a change. A question such as “¿Qué mejorarías?” should return recommendations. A command such as “cambia solo esta foto” should prepare that edit.
- **Clarify narrowly.** When two sliders match, show their names or thumbnails and ask which one. Do not replace the original photo task with a store-wide style questionnaire. Keep the pending request and attachments while waiting for the answer. Exact text changes should preserve the supplied text.
- **Maintain useful memory.** Store merchant-approved brand colors, tone, image preferences, and section locks separately from conversation summaries. Record where a preference came from and let the merchant edit or remove it. Current store data and the current instruction take precedence over older summaries. Keep memory isolated by merchant and store.
- **Use a shared capability registry.** Define each supported edit, valid target, fields, constraints, and side effects once. Derive planner descriptions, runtime validation, and editor affordances from that registry. Reuse the existing immutable command layer instead of duplicating behavior across dashboard, Studio, and API.
- **Verify completion.** Compare the resulting document against the requested scope, resolve the changed field in the real renderer, and detect no-op changes. Generate “Cambió / Conservó” from a diff and execution results. A valid JSON response alone does not establish that the right photograph or heading changed.
- **Recover precisely.** A retry retains the instruction and successful uploads. Undo points to the relevant task or version, and preserves subsequent unrelated edits where possible. A rejected plan leaves a clear explanation of the specific unsupported or ambiguous operation.

Keep structured outputs, but strengthen semantic checks and schema parity. OpenAI's documentation explicitly notes that structured output can still contain mistakes and recommends preventing divergence between schemas and application types. [Structured output guidance](https://developers.openai.com/api/docs/guides/structured-outputs).

**3. Make private editing reliable**

The server-backed draft foundation is implemented as described above. Drafts overlay published settings only for authenticated editor work; public storefront reads continue to use the published Store fields. Publication atomically promotes the reviewed draft and preserves the previous public website version. Keep the explicit save/publish distinction when adding recovery or autosave later.

Use optimistic concurrency for draft saves and publication. Bind a proposal and its approval to the base revision and resulting content hash; invalidate approval if the content changes. Reject stale overlapping edits with a targeted conflict explanation. Merge independent edits only when the command system can prove they do not conflict. Client revision counters alone do not protect against another tab or device.

Represent long work as a persisted run with an idempotency key, stage, result revision, errors, and asset references. Show events such as `Entendiendo`, `Generando imagen 1 de 2`, `Comprobando`, and `Listo para revisar` only when those stages actually occur. Reconnect after refresh, support cancellation before publication, reuse completed uploads, and prevent retries from duplicating products or paid image requests.

Validate the full operation budget and all known targets before generating images or creating products. Never silently truncate a request. Track generated assets and product actions so failures and cleanup are recoverable after a process restart.

Product creation currently has an explicit immediate-activation exception. Proposed behavior: prepare product creation as a separate, reviewable action with the exact name, price, stock, images, and destination. Bind confirmation to that action. A visual proposal must not imply that an immediately created product is still private. Existing prices, stock, payments, and compliance remain outside free-form visual editing.

**4. Improve the quality of the websites**

Create a compact brand brief from the real catalog, business category, logo, approved palette, imagery, audience, and primary action. Distinguish a factual business claim from design copy. Ask for essential missing business facts; omit unsupported claims such as delivery promises, certifications, or testimonials.

For new websites, use the existing art directions and section grammar to make three deliberate choices: what visitors should understand first, what action they should take, and how the page helps them reach it. Favor a strong opening, clear product discovery, useful factual information, and an obvious route to purchase or contact. Edit requests should preserve the surrounding design unless the merchant asks for broader changes.

| Quality area | What to improve | Evidence of success |
| --- | --- | --- |
| Brand consistency | Carry color, type hierarchy, spacing, image treatment, and voice through the whole site. | The merchant recognizes their brand across every page. |
| Copy | Replace generic repeated language with concise copy grounded in the actual business. | Headline, supporting text, and action each have a clear purpose. |
| Images | Show asset role, origin, crop/focal point, and exact destination; reuse good existing photos. | “Replace photo 1” changes that slot and preserves its text, position, and other photos. |
| Page structure | Keep existing diversity checks, but prioritize relevance and usability alongside originality. | Alternatives differ meaningfully without forcing unnecessary sections or effects. |
| Mobile | Check text wrapping, image crops, navigation, forms, and purchase actions in the real renderer. | The whole journey works on a narrow screen, including long product names. |
| Motion | Use the existing motion recipes for a clear purpose and verify reduced-motion behavior. | Content remains readable and usable with animation disabled. |
| Quality review | Combine deterministic checks with a bounded visual review of rendered desktop/mobile pages. | A proposal cannot be called visually checked while only its JSON has been validated. |

Perform cheap document checks on every edit. Reserve screenshot-based review for visual changes and full generations. Allow at most one automatic repair pass within the requested scope, then present any remaining issue honestly. Retain merchant editing control over the generated result.

**5. Make the editor easier to use**

Keep the existing pagosYa identity and canvas-plus-conversation arrangement. The main improvement is clearer hierarchy and state, especially on a small laptop or phone.

| Editor area | Proposed behavior |
| --- | --- |
| Top toolbar | Keep page, desktop/mobile preview, undo/redo, draft status, and Publish visible. Move global style changes into a clearly labeled design control. |
| Canvas | Click an element to edit or ask Yapi about it. Highlight the exact target and keep it in view while reviewing the result. |
| Inspector | Show content and image controls first. Keep layout, spacing, typography, and motion in the existing advanced disclosure. |
| Page/section outline | Provide names, thumbnails, visible order, selection, lock, duplicate, hide, and reorder controls. Make drag actions available through keyboard controls too. |
| Conversation | Reduce the large introductory area after the first task. Keep the composer accessible, preserve text on failure, and allow drafting the next instruction while a run completes. |
| Change review | Show a short, specific result, before/after for the changed area, and a link to that area. Replace implementation filenames such as `catalog/products.json` with merchant-facing descriptions. |
| Save and publish | Clearly distinguish `Cambios locales`, `Guardando borrador`, `Borrador guardado`, and `Publicado`. Show one explicit Publish action for the reviewed revision. |
| Images | Keep ordered thumbnails, per-image upload state, individual retry, replacement, crop, alt text, and reuse from a store asset library. Standardize limits across entry points. |
| Mobile editor | Use explicit `Sitio`, `Yapi`, and `Ajustes` views with preserved context and a reachable composer. Do not require scrolling through the full chat to inspect the page. |
| Recovery | Offer task-specific undo, redo, and a named version history with preview before restoring a public version. |

Ship these improvements in the dashboard first, because it is the active editor and already has more editing capabilities. Share its state and command contracts with Merchant Studio. Promote Studio only after it supports selection, direct edits, responsive preview, page navigation, draft recovery, and the same publishing semantics. A frontend framework migration is not a dependency of this plan.

**6. Deliver in this order**

These are dependency-based milestones; dates should follow an implementation estimate.

| Order | Work package | Primary ownership | Acceptance criteria |
| --- | --- | --- | --- |
| P0-A | Capture baseline and fix misleading feedback | Frontend + QA | Record representative tasks; remove the 48-second wait; show real stages and public-effect labels; preserve failed prompts. |
| P0-B | Draft/public separation and revision checks | Backend + frontend | A manual or AI draft survives refresh and cannot change the public site; stale overlapping edits cannot overwrite newer work. |
| P0-C | Complete and retryable runs | Backend | Twelve-operation limits never drop requested work silently; duplicate submissions produce one logical run; failed work can resume or clean up deterministically. |
| P1-A | Selected-element context and intent routing | Backend + frontend | “Esta foto” targets the selected slot; general questions do not generate designs; clarification retains the original task and attachments. |
| P1-B | Shared command semantics and factual change reports | Backend + frontend | Manual and AI edits produce equivalent results; no-op or wrong-target changes cannot be reported as completed. |
| P1-C | Editor review and navigation | Frontend + design | A merchant can find an element, change it, compare, undo, and publish without losing the canvas or confusing draft/public state. |
| P2-A | Brand memory and visual quality review | AI/backend + design | Brand preferences persist; generated pages pass defined desktop/mobile checks and a merchant-calibrated design rubric. |
| P2-B | Studio parity and measured rollout | Frontend + QA | Both shells pass the same critical workflows; a small merchant pilot meets release targets before broader rollout. |

P0-A and P0-B are implemented; P1-A has a bounded selected text/photo path and initial advice routing. Next implement durable, idempotent runs in P0-C, then broaden intent routing and shared command semantics in P1-A/P1-B. More animation recipes, extra templates, autonomous growth campaigns, and fine-tuning can wait until the core editing loop has measured reliability.

**7. Define what “excellent” means**

Build an initial suite of 60 representative tasks, mostly in natural Spanish with typos, ordinals, and short follow-ups. Include clear edits, ambiguous targets, multiple changes, image generation, product creation, corrections, refresh/retry, store switching, and publishing conflicts. Keep a held-out subset for release decisions. Reuse the existing unit and browser tests for deterministic behavior; add actual model evaluation for interpretation quality.

OpenAI recommends task-specific datasets, typical and difficult cases, continuous evaluation, and human calibration. Use trace records to distinguish routing, planning, execution, and verification failures. The current direct HTTP integration will need instrumentation; traces will not appear merely because the application calls the Responses API. [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices), [agent workflow evaluation](https://developers.openai.com/api/docs/guides/agent-evals).

| Proposed release target | Measurement |
| --- | --- |
| At least 95% correct first attempt on supported, unambiguous edits | Compare exact target, requested fields, and preserved fields against expected document changes. |
| Zero unauthorized public or commerce mutations in the release suite | Assert public revision, prices, stock, payments, and cross-store isolation before and after each relevant task. This is a release gate, not a guarantee of zero production failures. |
| Zero lost accepted draft edits in recovery tests | Test refresh, failed save, two tabs, late AI responses, store switching, retry, and restore. |
| No more than 5% unnecessary clarification on clear requests | Human-label whether the request already contained a unique target and enough information. |
| At least 80% of pilot merchants complete five core editing tasks without assistance | Observe find, change, compare, undo, and publish; record completion time and points of confusion. |
| Average design score of at least 4/5, with no critical usability defect | Score brand fit, hierarchy, copy, imagery, and mobile usability using calibrated human review. |
| Immediate local acknowledgment; simple text-edit preview p95 under 15 seconds | Proposed latency target excluding image generation. Measure actual baseline first and report image/full-generation latency separately. |

Track cost per successfully accepted task, failure stage, fallback provider, correction rate, undo rate, and time to an acceptable draft. Compare prompts and models on the same dataset before selecting a more expensive model or changing providers. Avoid storing secrets or unnecessary personal data in traces.

Use these concrete acceptance examples:

- “Cambia solo el título del primer slider a ‘Nueva colección’.” Exactly that title changes; its photos, motion, prices, and other sections stay identical.
- “Genera una foto y reemplaza la primera foto de ese slider.” The selected media slot receives the generated asset; its existing copy and other images survive.
- “Usa la segunda imagen que adjunté.” The ordered attachment identity remains resolvable after clarification or refresh.
- “¿Qué mejorarías para que se entienda mejor?” Yapi proposes useful changes and does not mutate the draft.
- “No te pedí cambiar los colores.” Yapi identifies the relevant task and offers or prepares a scoped correction without reverting later unrelated work.
- A manual heading edit followed by an AI image request preserves both changes in the same private revision history.
- A stale publish, duplicate request, or lost connection cannot silently publish an outdated site or create duplicate products.

The first complete milestone is a merchant changing one selected element through either manual controls or Yapi, seeing the correct result, recovering it after refresh, undoing it, and publishing it deliberately—with the public store unchanged until publication.
