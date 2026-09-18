**Premium storefront design plan: pagosYa, using Amboras as the visual benchmark**

Prepared September 13, 2026. Status: planning and evidence review; this document does not claim that the proposed generator has been implemented. Codex owns the investigation, engineering plan and final decisions. Claude completed two independent reviews through the installed Claude Code CLI; the recorded primary model was `claude-opus-5`. Its critique, subsequent corrections and plan review are in the accompanying research folder. The final plan incorporates that review and Codex's verification of its factual claims.

**1. The outcome we need**

The goal is a generator that repeatedly produces a coherent, modern consumer brand across the homepage, product, cart, checkout and mobile. A successful result should make the shopper understand the product, recognize the available choices and trust the purchase flow. The product photography, typography, interface and content must appear deliberately designed together.

Savia currently demonstrates working commerce. It does not yet establish the visual standard the user requested. Passing the functional tests was necessary, but presenting that as evidence of premium design was the wrong acceptance decision.

The work has two deliverables: a substantially better Savia that establishes the standard, and changes to the generation process that can repeat that standard for unrelated merchants. A manually polished example alone will not satisfy the second deliverable.

**2. Evidence and limits of the comparison**

I inspected the user's Amboras screenshot, the current [Amboras examples gallery](https://www.amboras.com/examples), its full-size [Grove & Glass image](https://www.amboras.com/landing/examples/v2/grove-glass.webp), [Grain & Glass image](https://www.amboras.com/landing/examples/v2/grain-glass.webp), and [Tideform image](https://www.amboras.com/landing/examples/v2/tideform.webp). I captured Savia's actual rendered homepage and bottle product page for comparison.

These are visual references. The gallery images do not establish Amboras's internal architecture, generation success rate, conversion performance, accessibility or the behavior of every depicted control. Their dimensions are image dimensions, not verified CSS viewport dimensions. We should learn their hierarchy and composition without copying their commercial claims, branding or tiny text sizes.

| Dimension | Visible difference in Savia | Direction for improvement |
|---|---|---|
| Surface hierarchy | Cream page, large sage image container and full coral purchase panel compete as separate objects. | Let a continuous quiet surface organize the purchase experience; use color for product imagery, choices and deliberate emphasis. |
| Buying density | Two return links, a tall introduction, repeated description and generous gaps consume space before and after the choices. | One breadcrumb; compact product identity; closely grouped price, options, quantity and purchase action. Each secondary section answers a different question. |
| Photography | One composite photograph per product; no useful alternate angles or bottle image that corresponds to the selected color. | One hero asset plus genuinely distinct detail/context/variant images where available, with consistent scale, lighting and crops. |
| Typography | Large display lettering and heavy price compete; the same expressive family carries nearly every role. | A deliberate product-title, price, body, label and supporting-text hierarchy, verified with the actual Spanish copy. |
| Geometry | Rounded photo framing, a square colored panel and several button treatments do not establish one clear system. | Shared rules for corners, borders, control heights, alignment and gaps, with explicit exceptions. |
| Useful detail | Repeating the description makes the page longer without helping another purchase decision. | Materials, capacity, care, ingredients, allergens or fulfillment details only when supplied and relevant. |
| Brand expression | The photos carry much of the identity; the surrounding interface feels generic and the packaging wordmarks differ. | A consistent wordmark, type treatment, photographic direction and interaction language across the entire store. |
| Interaction polish | The correct selection and total work, but functionality alone does not settle hierarchy or visual refinement. | Selected, unavailable, loading and error states should look designed and preserve the same arrangement. |

**3. Engineering causes found in this repository**

| Finding | Existing location | Consequence | Proposed response |
|---|---|---|---|
| Three concepts are generated; `sourceDesignExploration()` samples a random selection index. | `apps/api/src/stores/source-design.ts`, `source-design-planner.ts` | Diversity is encouraged, but the final selection is not based on demonstrated reference fit or visual quality. | Retain deliberate exploration, then select from rendered candidates with evidence. Keep random selection as a benchmark option, not the premium default. |
| The design contract strongly describes homepage section order; the product-page plan remains largely prose. | `source-design.ts` | A highly specified homepage can coexist with an under-designed product panel. | Make the product decision hierarchy and selected-state composition explicit in the design brief. |
| The visual-system manifest records typography prose, icon vocabulary, motion, layout and assets; concrete spacing, radius and color decisions stay in authored CSS. | `source-visual-system.ts` | The system can ask for consistency without providing a complete, checkable record of what consistency means for this project. | Extend the existing manifest with resolved semantic tokens and component rules. Preserve per-merchant freedom. |
| Confirmed brand colors and fonts already exist. | `brand-profile.ts` | Starting a second unrelated theme subsystem would create another source of truth. | Extend and connect the current brand system; distinguish confirmed merchant facts from the generator's resolved presentation choices. |
| Source validation checks structure, compilation, hooks and a narrow tracking rule. Studio adds useful rendered geometry and purchase checks. | `source-design.ts`, `source-generation.service.ts`, Studio `source-checks.ts` and `source-shopping-probe.ts` | Important failures are caught, but an unattractive valid layout can pass. | Add an independent visual review stage using actual screenshots; retain objective checks separately. |
| The generated Savia stylesheet targeted classes such as `.product-detail__option` that the runtime does not render. Later overrides repaired actual selectors. | `examples/savia/site/styles.css`, `refinement.css`, `source-kit/commerce.js` | The model must guess implementation details, and refinement accumulates CSS rather than reliably styling the intended component. | Supply a versioned component contract with real markup, states, selectors and tested examples; consolidate canonical styles. |
| Savia defines `--forest`, while runtime product accents read `--brand-accent` or `--accent` and otherwise fall back to `#813d55`. Browser computed styles confirm plum text on the product eyebrow and selected tab. | `source-kit/commerce.js:179`, Savia `styles.css`, rendered product page | Parts of the interface inherit a different visual identity despite an apparently consistent generated palette. | Provide a required semantic-token adapter; validate computed default and selected states, not merely the presence of CSS variables. |
| The runtime emits a single-image counter and repeats the same description in the introduction and details tab. Every unselected group gets another instruction. Variant images are selected only after all dimensions identify a full variant. | `source-kit/commerce.js`, `openProduct()`, `productInformation()`, `updateOptions()` and option click handling | Several rough edges recur across stores; the last behavior can delay color-image feedback even when an unambiguous matching image exists. | Assign shared defects to the runtime workstream. Fix them in the versioned component presentation instead of adding another Savia-only override. Test partial selection before changing photo behavior. |
| Hosted configurable products can bypass the generated source and render the shared options page. | `apps/checkout/src/main.ts`, `needsOptionsForm` branch | A good portable preview may not retain its identity in the customer-facing purchase route. | Prove and fix preview/export/hosted parity before calling the result production-ready. Keep payment and stock rules platform-owned. |
| Portable inline options reject products with extras. | `source-kit/commerce.js`, `optionGroups()` | A screenshot promising bundles or richer add-ons may exceed the actual renderer's supported behavior. | Model capabilities explicitly. Implement and verify support before the generator offers it; keep unsupported commerce flows out of the design promise. |
| Creation shares a four-minute abort signal, bounded attempts and budget; active runs have a stale-run window. | `source-generation.service.ts`, `source-request-budget.ts` | A longer premium workflow cannot safely be implemented by attaching unlimited critique calls to the existing request. | Use checkpointed stages, a total budget, a live job lease and resumable progress. |

The response to these findings should be a better design process and a smaller reliable styling surface. Adding more adjectives to the current prompt will not address all of them.

**4. The visual standard for the next Savia**

Start with the bottle product page, then the juice page. This proves both swatches/capacities and pack selection before investing in another homepage.

Use a modern pantry-and-hydration direction. Grain & Glass is the primary compositional reference for restrained purchasing surfaces. Grove & Glass supplies a secondary reference for useful pack presentation; Tideform is a separate check on information hierarchy. Each store gets one identity, rather than importing the fonts and palettes of all three examples.

Proposed starting decisions, to be adjusted after rendering:

- Canvas: warm near-white. Main text: deep green-black. Primary actions: forest green. A light neutral surface supports quiet grouping. Orange and coral come mainly from the products and selectively from editorial accents. A full purchase column does not receive a saturated background by default.
- Typography: a restrained, legible sans-serif starting point from the existing licensed font inventory. Consider a second face only if it strengthens the actual brand. Product title approximately 32–42 px desktop and 28–34 px mobile, body 16–18 px, option labels 14–16 px. These are prototype ranges, not universal generator mandates.
- Rhythm: a small spacing scale such as 4/8/12/16/24/32/48/64. Tight spacing within a decision group, larger spacing between different decisions. Do not use identical padding for every section.
- Geometry: one small control radius and one image/frame radius; a consistent subtle border. Shadows communicate elevation only where needed. Avoid adding outer cards around content already grouped by layout.
- Product layout: a large image area and narrower purchase area on a shared grid; stable alignment between image top, product identity and controls. In the initial desktop bottle/juice cases, name, price, required choices and purchase action should fit together at 1280 × 844 without shrinking the copy. Complex products may need progressive disclosure instead of an arbitrary above-the-fold requirement.
- Mobile: choose an intentional image height and then the decision panel. Keep controls comfortable, selected values visible and the cart accessible. Consider a compact persistent purchase summary only if testing shows it helps and it does not cover content or the keyboard.
- Icons: one family, consistent optical size and stroke. Use them for real actions and concise evidenced facts; they should reduce reading effort. Do not place an icon next to every sentence.
- Copy: one short product introduction. Put distinct details in useful follow-on sections. Remove repeated instructions, duplicate breadcrumbs and ornamental labels. Do not add invented reviews, certifications or delivery claims to imitate a fuller reference.
- Motion: restrained feedback on selection and cart changes, purposeful gallery transitions, no layout jumps. Static composition must work before animation is added.
- Media: show the correct object at a useful scale. Provide a shot list for whole product, detail, context and relevant color variants. Keep the bottle, label and packaging accurate. The existing stock juice video should become a supporting editorial element with a deliberate poster, not a section inserted merely because video was requested.

For real merchants, unavailable information remains unavailable. A sparse catalog can still look premium through proportion and photography; the system must never manufacture commercial facts to fill space.

Photography is a named M1 deliverable, owned by Codex with Claude reviewing consistency. For the fictional Savia pilot, aim for three distinct useful views per product, reusing existing photos only if they meet the common brief. Supply whole-product, detail/context and the most relevant variant view; expand to four when there is a real purpose. Record shot role, crop, focal point and variant associations. Begin with at most nine image requests plus three targeted corrections, logged separately from storefront generation. This is a request ceiling rather than a price forecast. Missing real-merchant assets should trigger an honest simpler gallery, not fabricated additional product views.

**5. Codex and Claude: responsibilities and handoffs**

| Stage | Codex responsibility | Claude responsibility | Evidence passed between them |
|---|---|---|---|
| Initial diagnosis | Inspect repository, references, actual DOM, assets and behavior; identify constraints. | Independent visual diagnosis and challenge the proposed direction. | Actual screenshots, reference provenance, brief, known catalog capabilities and current shortcomings. |
| Direction selection | Produce two credible visual candidates within one brand brief; verify they can be implemented. | Compare their composition and reference fit without seeing the author's self-score. | Same product data, same viewport, default and selected states, one primary reference and a compact rubric. |
| Implementation | Own markup, token resolution, component contracts, variants, cart, checkout, tests and saved revisions. | No routine coding role; answer focused art-direction questions if needed. | A specific visual decision and its constraints, rather than the entire repository. |
| Review | Collect screenshots and measurements, reproduce findings and implement targeted fixes. | Rank the largest visible problems and explain why they matter. | Revision digest, viewport, screenshot, relevant component, functional result and previous findings. |
| Final acceptance | Combine reference fit, visual critique, functional checks and the user's taste; record the decision. | One independent final critique when it adds evidence. | Before/after comparison, unresolved issues and the exact release candidate. |

Claude does not need credentials, customer records or authority to change payment logic. Codex remains the accountable integrator. We should avoid two models rewriting the same page in alternating styles.

Review output should identify: location, observed problem, severity, visual consequence, smallest proposed correction, confidence and what must remain unchanged. A report saying only “make it more premium” is unusable.

Disagreements are resolved against evidence: reproduce functional claims; compare visual alternatives at the same viewport; prefer the user's explicit direction over either model's taste. Codex should not declare its own candidate the aesthetic winner solely on its own score: use independent blind comparison or the user's previously calibrated preference. If two rounds disagree without measurable improvement, preserve the stronger candidate and request a focused preference only when the remaining decision materially depends on the user's taste. Do not oscillate indefinitely or require permission for every routine refinement.

**6. Proposed generation workflow**

1. **Compile the evidence.** Separate merchant facts, catalog options, content media and design references. Record asset ownership, roles and product associations. Extract a reference brief describing hierarchy, alignment, color roles, density, image treatment and recurring component rules. Do not infer exact font names or mobile behavior from a thumbnail.
2. **Resolve the project identity.** Produce a small, structured design contract that includes semantic colors, type roles, spacing, geometry, icon treatment and responsive behavior. Confirmed merchant rules win. Inferred presentation choices remain editable and are not promoted into commercial facts.
3. **Explore when it resolves a real choice.** During initial calibration, render two visual directions for the important product surface using identical real data. Compare composition and density, not just two color palettes. After calibration, use one well-supported direction by default; create another only when the brief or evidence warrants it. Use a third direction only if the first two fail to resolve a meaningful choice. Explorations must render at desktop and mobile, not exist solely as prose.
4. **Select deliberately.** Apply hard functional/content constraints, then compare the remaining candidates against the brief and the visual rubric. Use blind A/B ordering where possible. Record why the winner fits; avoid using the generator's own enthusiastic description as evidence. A close tie favors clearer buying decisions and lower complexity.
5. **Finish one working product page.** Complete image gallery, option states, dynamic price, quantity, stock behavior and cart handoff. Establish the representative desktop and mobile states as the reviewed baseline.
6. **Extend the established system.** Build the homepage, other product types, cart, checkout and useful secondary content using the same resolved identity. The homepage should frame the products, not force every store into the same hero and alternating-card sequence.
7. **Render and inspect.** Run existing objective checks, then capture default/selected/cart/checkout states. The visual reviewer sees the actual output. A syntax-valid file is not a screenshot, and an overflow pass is not a design judgment.
8. **Repair within bounds.** Choose the three highest-impact visual findings. Apply a scoped correction, rerun affected functional checks, recapture the same states and compare. Allow at most two visual repair passes per candidate under an explicit total budget. Revert a repair that degrades the accepted identity.
9. **Save a qualified outcome.** Save the best valid draft with separate functional and visual statuses. Distinguish “ready for review” from “meets the premium benchmark.” An uncertain visual judgment should not masquerade as a guarantee or trigger endless paid work.

Existing local edits should bypass full exploration. “Change this price” or “add a color” must not regenerate the whole identity. The resolved design contract becomes preservation context, with explicit current user instructions still able to override it.

**7. A reliable component foundation**

The first implementation should improve and document the existing runtime, not replace all commerce behavior. Create a versioned presentation contract and a component specimen page using the actual runtime markup. The generator receives valid hooks and examples rather than guessing class names.

Initial specimens: product gallery, product identity/price, labeled color swatch, size/capacity choice, flavor choice, pack option row, quantity/total, purchase button, cart line, delivery summary and accessible details disclosure. Each specimen includes empty, selected, unavailable, long-label, loading and error cases that actually apply.

Bindings stay attached to real product and variant IDs. Selecting a color changes the product image only when that association exists. Pack totals and unit comparisons are computed from authoritative variant data, not typed into generated HTML. Distinguish a one-time pack from recurring billing; a subscription-like card is not a subscription implementation.

Use semantic tokens for text, muted text, canvas, surface, border, action, action foreground, selected background, focus and disabled state. Product image surfaces can have their own explicitly named accent role. Resolve them once, emit CSS consistently and pass the same values to the hosted renderer. Preserve legacy snapshots through a versioned adapter instead of silently reinterpreting every old store.

Inventory before extending: the runtime already supports galleries with multiple photos, selected-value labels, variant-specific image associations, dynamic prices, quantity and subtotal. The initial work is to supply and present these capabilities well. Optional fact rows or richer option descriptions should follow an audit of existing tags/metadata, with a narrow additive schema change only if required. Familiar gallery/purchase layouts remain the starting structure; initial visual candidates compare art direction and density, not novel cart mechanics.

The controlled foundation should cover buying decisions and accessibility. Composition, photography, typography and brand expression should still vary by merchant. This is a small set of reliable primitives, not a universal page template.

| Presentation capability | Current boundary | Pilot treatment |
|---|---|---|
| Gallery, thumbnails, selected values, variant price, quantity and subtotal | Already supported by the portable runtime. | Reuse, theme consistently and verify; do not rebuild. |
| Immediate image feedback on a partially selected color | Existing image switch waits for a complete variant. | Show a matching image early only when compatible variants agree on that image; otherwise retain a truthful gallery view until the choice is resolved. |
| Total in the purchase button, number of choices, price differences | Computable from existing authoritative catalog/selection data. | Add precise presentation hooks. Where combinations have different prices, show a contextual range or “desde”; never invent a single surcharge for an unresolved combination. |
| Price per bottle or per unit | Requires reliable numeric quantity/unit metadata, not guessing from a product name. | Compute only where that metadata exists; otherwise show the exact pack price. |
| Material, care, ingredient/allergen or other fact rows | Some facts may already exist in descriptions/tags; structured fields require an audit. | Display supported merchant facts; add narrowly scoped fields only where useful and missing. |
| Rich option descriptions | Not part of the current portable option-button markup. | Optional subsequent extension using merchant-provided data; no filler copy. |
| Extras, subscriptions, delivery-day selection, reviews and discount claims | Platform capabilities and portable/hosted support differ. A reference image does not establish support here. | Audit each actual backend and renderer contract. Include only verified supported flows and evidenced values; defer unsupported controls. |

The initial inactive purchase state needs an intentional neutral treatment and one clear explanation. Do not silently select a paid combination solely to make the page look complete. Honor an explicitly configured merchant default when supported. An enabled control labelled “choose options” must actually take the shopper to the missing choice; it must not pretend the item has been added.

**8. What changes in the prompts**

Replace the growing general-purpose prompt with clearly separated responsibilities: invariant commerce contract, project evidence, design decisions, requested task and review findings. Remove contradictory statements and unnecessary repetition. Prompt size and comprehension should be measured, not assumed to improve with more rules.

Example art-direction instruction:

> Build a coherent product-buying experience from the supplied catalog and primary reference. First state the hierarchy and the role of each surface. Resolve a small visual system and use it throughout the project. Make photographs, title, price, actual options and purchase action feel like one composition. Use color to support those roles. Eliminate repeated explanations and decorative containers that do not help a purchase decision. Preserve truthful content and platform-owned commerce behavior. Judge the rendered result before claiming the design is finished.

Example repair instruction:

> In revision X at 1280 × 844, the second breadcrumb and the title-to-price gap push the required controls down. Remove the redundant return row and tighten only this panel's internal rhythm. Preserve the chosen type family, image, option bindings, cart and unrelated pages. Return a focused patch. The next screenshot must show the same product and selection so the change can be judged fairly.

The important improvement is the evidence and enforceable component contract around these instructions. These example paragraphs alone are not the implementation.

**9. Acceptance: distinguish visual judgment from functional proof**

Use a provisional visual rubric for consistent discussion, calibrated with the user on real screenshots. It is not a scientific measure of beauty or an automated substitute for preference.

| Criterion | Weight | Example of a strong result | Example of a failure |
|---|---:|---|---|
| Hierarchy and purchase clarity | 25 | Product, price, choices and action form a clear sequence. | A display headline or decorative panel dominates the buying task. |
| Brand coherence and reference fit | 20 | Typography, surfaces, images and controls follow one recognizable identity. | Different pages feel like unrelated templates; colors have no stable role. |
| Typography and spacing | 15 | Roles are distinguishable, alignments intentional, Spanish text wraps naturally. | Competing weights, repeated oversized gaps, cramped labels or ornamental microtext. |
| Product imagery and art direction | 15 | Images agree in lighting, object scale and brand treatment; crops preserve useful detail. | Inconsistent packaging, filler imagery, poor crops or irrelevant video. |
| Component and state refinement | 15 | Default, selected, unavailable and error states feel equally intentional. | Generic controls, inconsistent corners, unexplained disabled state or layout shifts. |
| Mobile composition | 10 | The buying sequence is deliberately recomposed for touch. | Desktop shrunk into a narrow column or large imagery that obscures the decision path. |

Score each criterion 1–5 with screenshot evidence. Start with an internal target of 85/100 and no criterion below 3/5; adjust after comparing strong and weak examples. Neither a high average nor model agreement overrides the user's rejection or a serious functional defect.

Calibration comes before using that number as a gate. Show the two initial candidates alongside one reference at matching desktop/mobile states, obtain a meaningful user preference when available, and save the reasons as an anchor. Otherwise label acceptance provisional and use independent comparison against the user's explicit feedback. Report surface counts, radii, font weights, repeated text and purchase-button position as diagnostics; they are not universal taste laws. A sparse monochrome design must not win merely because it has fewer colors.

Hard checks remain separate: correct product/variant/pricing/stock/cart behavior; no broken required assets or links; keyboard access and clear focus; no clipped purchase controls; valid language and truthful content; no unexpected payment actions; no runtime errors. Test 1280, 768, 390 and 320 px plus long content and browser zoom. Use 44 px touch targets as our design target; WCAG 2.2's minimum target-size criterion is different and includes exceptions. Text contrast should meet the applicable [WCAG contrast requirement](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html); see the separate [target-size requirement](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

For images and fonts, record layout shift and loading behavior rather than claiming performance from a screenshot. Use local lab measurements for regression detection and field measurements later if the store receives real traffic.

Evidence capture itself needs a gate. Record actual viewport dimensions, source digest, product/selection state, image readiness and font readiness before taking the screenshot. A timed-out asset is a capture failure to investigate, not automatic evidence of a permanently broken storefront. This audit's first homepage capture was premature: Claude reported a missing hero, but subsequent DOM checks showed the hero loaded at its 1400-pixel natural width and the corrected screenshot showed the image and icons. That finding is corrected in the review record. Never evaluate mobile quality from a file labelled “mobile” without verifying its actual viewport.

**10. Milestones, dependencies and effort**

These are planning estimates for focused engineering/design time, not promises that the result requires artificial waiting. Following Claude's challenge to the original estimate, split the work into a 9–12-day narrow pilot and a conditional 10–15-day automation/evaluation follow-up: approximately 19–27 working days, or 4–6 weeks. A first product-page comparison should arrive around day 2–3. Model latency, asset readiness, review availability and hosted-route complexity can alter calendar time.

| Milestone | Effort | Deliverable | Exit condition |
|---|---:|---|---|
| M0: evidence and baseline | 0.5–1 day | Annotated references; current route/capability map; verified screenshot readiness; prioritized shared-runtime defects. | The major defects and desired changes are specific enough to implement. Today's audit supplies much of this input. |
| M1: establish the visual standard | 2–3 days | Shared defect corrections, coordinated Savia photos, two product-page candidates and independent critique. | The selected candidate resolves the agreed defects in default/selected desktop and mobile states, with a recorded calibration comparison. |
| M2: extract the reusable system | 1.5–2 days | Resolved tokens, canonical CSS and real runtime component specimens. | The same primitives serve bottle, granola and juice without recurring one-off patches; legacy behavior remains readable. |
| M3: preserve design across real routes | 3–4 days | Preview/export/hosted parity for supported variants; cart and checkout integration. | The same revision retains its identity and selected data on the actual customer route. Unsupported extras retain a working path. |
| M4: minimum useful generator improvement | 2 days | Product-first brief, one evidence-selected direction by default, targeted edits and a small 3-merchant × 2-run trial. | New generations use the standard without hand-authored Savia exceptions. This closes the 9–12-day pilot. |
| M5a: durable review stages | 4–6 days | Checkpoints, revision-bound screenshots, cancellation, per-stage receipts and job leases. | Resume/cancel/concurrency behavior is verified without duplicated paid work. Begin only after the pilot proves visual value. |
| M5b: rendered critique and bounded repair | 3–4 days | Independent finding records, selective paid review and repair with before/after evidence. | Failed repairs cannot replace the stronger result or exceed the total budget; aesthetic uncertainty remains visible. |
| M6: full benchmark and limited rollout | 3–5 days | The 36-run comparison, held-out categories, edit trials and a regression report. | Repeatable visual gains, no critical commerce defects and accepted-route parity. Reserve a separate half-day of reviewer attention within this stage; calendar availability may extend it. |

M1 deliberately precedes the larger infrastructure changes. If the team cannot produce one convincing working product page with deliberate human/model review, building an automated judge first will only automate the wrong standard.

Shared defects discovered in M1 belong to the runtime workstream, with scoped compatibility tests. Brand-specific choices belong to Savia's resolved tokens and authored composition. This avoids turning the visual baseline into another pile of example-only overrides.

The first three working days: day 1 stabilizes evidence capture, inventories capabilities and starts shared-default fixes; day 2 produces coordinated assets and two familiar gallery/purchase compositions; day 3 compares them independently, records the taste decision and applies the selected system to juice. Hosted-route investigation starts alongside this work, so a compatibility surprise is discovered before the broader rollout.

**11. Implementation map**

| Area | Existing entry points | Planned changes |
|---|---|---|
| Reference evidence | `source-website-reference.ts`, `source-asset-library.ts` | Add a structured visual reference brief and screenshot provenance; keep content media distinct. |
| Brand and tokens | `brand-profile.ts`, `source-visual-system.ts` | Extend resolved project choices, version the schema and preserve confirmed brand rules. |
| Design planning | `source-design-planner.ts`, `source-design.ts` | Product-specific hierarchy, candidate evaluation and recorded selection rationale. |
| Generation | `source-generation.service.ts`, `source-request-budget.ts`, `source-progress.ts` | Stage separation, budget-aware review/repair, checkpoints, cancellation and lease handling. |
| Runtime presentation | `source-kit/commerce.js`, `commerce-pages.css`, `source-commerce-design.ts` | Canonical supported selectors, tokens, useful information grouping and consistent state styles. |
| Hosted product route | checkout `main.ts`, `product-options.ts`, `source-storefront.ts` | Remove visual discontinuity through a tested presentation bridge while preserving authoritative commerce logic. |
| Studio evidence | `source-checks.ts`, `source-shopping-probe.ts`, `source-studio.ts` | Separate functional results from aesthetic findings; bind findings to exact revisions and prepare focused repairs. |
| Benchmarking | `scripts/benchmark-source.ts` and its existing comparison artifacts | Add fixed evidence sets, paired comparisons, review calibration, per-stage usage and preservation trials. |

Prefer adapting these existing paths over creating a parallel generation service. Introduce a feature flag and retain the established path while the new process is evaluated. No silent migration or redesign of existing merchant stores.

**12. Proving consistent quality**

Begin with three calibration fixtures: Savia, a restrained technical product and a colorful apparel product. Establish examples of unacceptable, acceptable and strong output; use explicit reasons to calibrate both reviewers.

Then use six held-out merchant briefs, with three independent generations per brief for both the current and candidate workflows: 36 total generation runs. Include different catalog sizes and imagery conditions. Keep assets, data, requested options and budgets comparable; preserve failures in the results. Blind the A/B order during visual comparison where feasible.

Cover food packs, apparel colors/sizes, beauty volume choices, technical specifications, home materials/finishes and a sparse single-product catalog. Include long Spanish titles, missing images, one option, many options, unavailable combinations and dynamic price differences. Add edit trials to the accepted outputs: update copy, add a variant, replace one image and adjust a price. Each should preserve unrelated visual identity.

Provisional release conditions: at least 80% of candidate outputs meet the calibrated visual target; candidate preferred in at least 75% of paired comparisons; no unresolved critical functional failures; all accepted outputs pass route parity; no meaningful regression in any category; edit trials preserve unrelated design. These are operational targets for the pilot, not statistically established quality claims. Report the sample size and disagreement rate. Expand testing if results depend on one lucky seed or one category.

Use the existing cost telemetry. Record provider, model, duration, tokens, repair count and estimated cost for every stage, including failed calls. The previous Savia generation cost estimate of about $0.34 is one observed run, not a forecast for a multi-review workflow. A premium pilot should have per-run and total-batch ceilings set before execution. Stop and report if the budget is exhausted; retain completed checkpoints rather than restarting paid work.

A proposed initial validation ceiling is $3 per generation/review/repair run and $90 for the 36-run comparison. The batch ceiling is deliberately lower than 36 times the per-run ceiling, so not every run can consume its maximum. This is a spending guardrail, not a prediction or spend committed by this plan. Begin with a small calibration batch, measure costs, and resize the experiment if needed. New image production has a separately stated budget; failed provider requests still count toward actual provider-cost accounting.

**13. Longer work should mean deeper review, not uncontrolled loops**

Introduce durable stages such as evidence, direction, implementation, functional checks, visual review, repair and ready-for-review. Save an immutable input digest, source revision, asset inventory and stage receipts. Resume a completed stage without charging for it again. A cancellation should release its lease and preserve the best valid draft.

The current four-minute generation timeout and ten-minute stale-run assumption need to be revisited together with job leasing. Simply increasing a timeout risks overlapping runs, ambiguous progress and wasted retries. Keep each provider request bounded while the overall job can take longer through explicit stages.

The user-facing bot should say what it has achieved and what remains uncertain: for example, “The product configuration works; I’m refining the image scale and option spacing.” It should distinguish completed code, verified shopping behavior and visual acceptance. It must stop claiming completion merely because a build or test suite passed.

Before changing hosted routing, document exactly why each fallback exists. Do not simply delete `needsOptionsForm`: preserve behavior for modifiers, sparse combinations, stock limits and authoritative totals before switching a supported product to the unified presentation. Unsupported cases must retain a working route. This compatibility work is part of the release condition, not an optional visual cleanup.

**14. First work to execute after this plan**

1. Establish one genuinely polished product-page direction using Savia's existing products, with two visual candidates and an independent critique.
2. Extract the successful decisions into the current token and runtime contract; resolve the hosted configurable-product design mismatch.
3. Replace random final selection with evidence-based selection, then add bounded screenshot review and prove the improvement on held-out merchants.

Do not start by generating more whole stores, adding more decorative colors, introducing animation libraries, replacing the application framework, building dozens of templates or copying Amboras's claims. Spend the first effort on the exact product surface the user is judging, and make that quality reproducible.

**15. Claude review record and final decisions**

Two read-only Claude Code reviews completed successfully. The primary model reported by the CLI was `claude-opus-5`; the CLI also reported small auxiliary Haiku usage. The [first critique](research/premium-design-2026-09-13/claude-critique.md) examined the reference montage, Savia screenshots and the existing design instructions. The [second review](research/premium-design-2026-09-13/claude-plan-review.md) challenged this plan using corrected image evidence, full-size references and relevant runtime source. Prompts and raw receipts are preserved for reproducibility.

Accepted from Claude: put ownership on shared runtime defects, assign photography its own workstream, make candidate exploration conditional after calibration, define capabilities explicitly, calibrate acceptance early and separate the narrow pilot from the larger orchestration project.

Corrected through Codex verification: the hero photograph is loaded; the first capture was premature. Thumbnails, selected-value labels and variant image support already exist. The product eyebrow/tab color mismatch is a confirmed token fallback. Aesthetic counts should remain contextual diagnostics. A disabled state needs a clear, readable design, but inactive controls are not covered by WCAG's normal text-contrast requirement. Color-photo updates must be unambiguous for the partially selected configuration, not blindly tied to a color name.

Not adopted: a universal two-surface/two-weight limit, mandatory sticky panels, approval interruptions for every model disagreement, or a broad data-model migration before proving the visual standard. The user's target is the arbiter of taste; the plan uses independent critique and measurements to make that target easier to achieve and reproduce.


**16. Execution update · 13 September 2026**

Implemented the narrow pilot: coordinated Savia photography and two reviewed candidates; selected A; shared semantic commerce styling and versioned authored-token records; brief-based direction selection with rationale; product-aware captures; portable variant imagery; supported authored product routing; and six fresh production GPT generations with two evidence-based repairs. The local Savia customer route is published in test mode. See [implementation evidence](../examples/savia/review/implementation-report.md) and [pilot results](../examples/savia/pilot/README.md).

The six-run experiment passed its final opening-layout checks after preserving and repairing two initial failures. It is not the full paired benchmark or a calibrated visual acceptance rate. User preference remains provisional while the user is away. M5 durable orchestration and M6's 36-run controlled comparison remain the conditional follow-up described above; this execution does not claim those production capabilities are deployed.

## Autonomous continuation — September 13, 2026, evening

M5's opt-in durable orchestration is now implemented with persisted jobs, fenced leases, spend reservations, private repair candidates, temporary screenshot hydration, masked comparison, purchase probes and atomic source apply. Studio supports start/status/cancel/resume and reload recovery. Claude reviewed architecture and final code; the concrete retry, queue, snapshot and polling findings were addressed. It is enabled locally and defaults off elsewhere.

M6 was attempted with the planned 36-output matrix. Twenty stores completed before OpenAI reported exhausted balance; three generations failed, two were interrupted and eleven were not started. Original purchase evidence is 78/80 checks across 20 stores. The one mobile checkout defect was diagnosed, fixed in the shared runtime and verified separately, preserving the original failure. Ten review jobs produced three unchanged outcomes and seven failures; no live durable repair was automatically applied in this cohort. The missing candidate-status migration encountered during testing is fixed.

The implementation has 411 passing source tests, 17 PostgreSQL job tests, 208 checkout tests and five relevant Studio browser tests. These are engineering evidence, not a completed aesthetic acceptance gate. Full paired visual comparison, live post-fix acceptance, paid edit trials and preference calibration remain blocked/incomplete. See [the detailed outcome and limitations](research/premium-automation-2026-09-13/results.md) and the [local gallery](http://localhost:4328/). This update supersedes the earlier statement that durable orchestration was only a proposed follow-up.
