YAPI design coherence, first-pass quality, and generation cost

Research and implementation options • 2 October 2026

**Recommendation.** Improve the existing generator into a constrained composition system with a bounded visual review. First close the gallery loophole and make verification coverage honest. Then give the existing planner an enforceable page blueprint, reusable composition families, structural diversity checks, and store-specific design direction. Reserve open-ended custom generation for requests that need it.

This is research and a proposal. No application code was changed and no paid site generations were run for this investigation. Evidence combines the supplied screenshot, the current Studio conversation/activity record, repository code, and official competitor documentation. Competitor descriptions establish public capabilities; they do not establish internal architecture, typical first-pass quality, or comparative token efficiency.

**What happened in this exact example.**

The [supplied screenshot](</Users/saramia/Desktop/Screenshot 2026-10-02 at 12.19.24 AM.png>) shows the desktop Galeria page of salv. Its visible composition has three large photographs beside one another followed by another two-photo row. The images vary in dimensions, but collectively dominate the page without a clear buying task in that visible area. The page does have an introductory heading above the screenshot's scroll position; it would be inaccurate to say it has no heading at all.

The visible merchant request asked YAPI to use its imagination, create a store from the photos, and avoid further questions. It did not expressly request a separate gallery. The activity record shows a 417-second Terra run: plan seven requirements, set a product theme, edit files, create galeria.html, then verification reports of 2, 8, and 4 problems before “todo en orden.” Explicit screenshot events include home desktop/mobile and gallery mobile. There is no gallery desktop screenshot event in that visible record. Browser verification can run captures internally, so this alone does not prove desktop was never technically checked; it does show why screenshot coverage and visual approval must be separate recorded evidence.

The earlier product-detail changes affected another surface. They did not resolve site-wide photographic composition. A passing purchase-flow test cannot establish that this gallery is a good design.

**Why the existing system allows the result.**

| Finding | Evidence | Consequence |
| --- | --- | --- |
| The homepage image rule offers a gallery escape route. | [source-media-design.ts:17](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-media-design.ts:17) permits putting remaining images on a separately linked gallery. [agent-capture.ts:98](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-capture.ts:98) only applies media validation to index.html. | Moving images onto another page satisfies the homepage limit while preserving the unwanted image wall. |
| The overlap check does not recognize adjacent competing images. | [source-media-design.ts:55](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-media-design.ts:55) compares rectangle overlap. It does not evaluate equal-weight rows or focal hierarchy. It observes main img elements, not all background-image treatments. | A three-column photo wall can pass without overlapping a single pixel. |
| Completion requires clean technical checks. | [agent-tools.ts:212](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-tools.ts:212) checks baseline pages plus declared requirements. [Line 232](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-tools.ts:232) returns errors or “Todo en orden.” [Line 261](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-tools.ts:261) gates finish on that clean result. | Extra-page coverage depends partly on the model's plan, and a clean finish does not require an independent visual composition verdict. |
| Uniqueness largely measures cosmetic/interaction choices. | [source-dna.ts:164](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-dna.ts:164) fingerprints button form, cart, added-to-cart feedback, and fonts. Duplicate avoidance changes button/cart/feedback choices. | Sites with the same hero and photo arrangement can still count as different. |
| Planning already exists. | [source-design-planner.ts:35](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-design-planner.ts:35) produces three concepts; the call reserves up to 5,600 output tokens. | Another generic planning call adds cost. The existing schema needs stronger composition commitments. |
| Loop limits detect only some repetition. | [agent-loop.ts:7](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-loop.ts:7) sets 40 tool calls and eight screenshots; [line 86](/Users/saramia/pagosYa/apps/api/src/storefront-source/agent/agent-loop.ts:86) catches recurring verification output. | Invisible design failures never trigger these protections, and changes to diagnostic text can make one underlying problem appear new. |
| Visual assessment is available separately. | [source-visual-review.service.ts:66](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-visual-review.service.ts:66), [source-design-job.worker.ts:81](/Users/saramia/pagosYa/apps/api/src/storefront-source/source-design-job.worker.ts:81). | Reuse that machinery in a carefully budgeted generation gate; avoid building another independent reviewer. |

The existing system contains substantial useful work: tokens, UI components, concept planning, editing scope, browser checks, checkpoints, and visual review. The problem is the contract between these parts and what they consider success.

**What the competitors document, and what it suggests for YAPI.**

| Builder | Documented behavior | Applicable lesson; our engineering inference |
| --- | --- | --- |
| Amboras | Its changelog describes curated starter themes, multiple theme-preview screenshots, reference images, storefront screenshot context, and static checks between edits. Its FAQ describes proposing a redesign in a draft for preview. | Use a reviewed starting composition, preserve drafts, and show actual visual evidence. These are public features, not proof of an error-free first generation. [Changelog](https://www.amboras.com/changelog), [FAQ](https://www.amboras.com/faq). |
| Shopify | Horizon uses design presets and composable Theme Blocks. AI-generated blocks integrate through defined section schemas and a platform wrapper. Its theme workflow can generate up to three candidate themes and keep the selected one as a draft. | Let AI choose and configure reliable pieces. Keep the brand and layout rules consistent while allowing meaningful structural choice. [Horizon](https://www.shopify.com/news/summer-25-edition-design), [block architecture](https://shopify.dev/docs/storefronts/themes/architecture/blocks/ai-generated-theme-blocks), [theme workflow](https://help.shopify.com/en/manual/online-store/themes/adding-themes). |
| Wix | Harmony generates from an editable site description. The Brand panel centralizes colors, text styles, and branded elements; updates propagate across the site. Aria supports targeting an element for edits. | Persist a site-wide design specification and edit the selected section with its dependencies. Wix documents automatic responsiveness, but current Aria documentation also says its edits apply to desktop; mobile still needs checking. [Creation](https://support.wix.com/en/article/wix-harmony-editor-creating-a-site-with-ai), [Brand](https://support.wix.com/en/article/wix-harmony-editor-about-your-sites-brand), [Aria](https://support.wix.com/en/article/wix-harmony-editor-working-with-aria). |
| Webild | Its docs ask for purpose, audience, important sections, and optional design direction; generation covers layout, copy, and images. Its template collection offers different content structures. Customize Mode scopes a request to a selected element or section. | Make the design brief explicit and preserve edit scope. Public documentation does not demonstrate free revisions or zero repeated mistakes. [Generation](https://www.webild.io/docs/generate/generate-website), [templates](https://www.webild.io/templates), [Customize Mode](https://www.webild.io/docs/customize/visual-editing). |

Amboras's showcase prompts connect art direction to a shopping decision: a kayak configurator, art-print format choices, or subscription choices for meals. That is useful differentiation. The showcase is curated marketing evidence, not a controlled first-attempt benchmark. [Amboras examples](https://www.amboras.com/examples).

Webild's generation and customization documentation was inspected in the browser because plain web extraction returned an empty page. Its own advice favors focused, local refinements; it does not publish the internal generation or visual-scoring mechanism. [Prompt guidance](https://www.webild.io/docs/introduction/prompting-best-practices), [chat editing](https://www.webild.io/docs/customize/ai-chat-editing).

**Three implementation options.**

| Option | Scope | Relative effort and generation cost | Tradeoff |
| --- | --- | --- | --- |
| A. Contain the repeated failures | All-page media rules, explicit gallery intent, required page coverage, stable failure IDs, truthful verification labels. | Smallest engineering scope; mostly deterministic checks. | Stops known failures quickly. Free-form first drafts can still have weak composition. |
| B. Composed generation, recommended | A plus enforceable page blueprints, tested composition families, shared brand rules, structural uniqueness, one bounded visual review and local repair. | Medium engineering scope. Designed to reduce code generation and repeated repair; savings must be measured. | Requires developing and maintaining a good composition library. Offers the strongest balance for ordinary stores. |
| C. Bespoke design agent | A plus much freer art direction/code generation and richer visual critique. | Largest variability in latency and token consumption. | Useful for unusual requests once guardrails work. A stronger model alone does not close the current validation loopholes. |

Implement A first, then evolve into B. Keep C as an optional mode with an explicit budget. Recreating every feature of four competing platforms is unnecessary for solving this design problem.

**Proposed implementation sequence.**

1. **Capture the failure and close the loopholes.** Save an isolated fixture representing the three-plus-two gallery and the related minimal brief. Give every authored route a declared purpose and media policy. Creating a gallery should require explicit intent or a justified user-facing need, never leftover upload count. Classify catalog cards separately from editorial photographs. Apply composition checks to new and changed pages, including independent galleries. Collect actual registered routes for coverage rather than trusting only model-written requirements. Show separate statuses for technical checks, visual review, and remaining design findings.

   Initial defaults for this user's sites: no unrequested photo walls; one dominant editorial image per scene; no consecutive photo-only grids; unused images may remain unused. Intentional product grids remain available for browsing. A later explicit gallery request can override the default for that page. Do not silently delete or remap uploaded files.

   Likely touchpoints: source-media-design.ts, agent-capture.ts, agent-task.ts, agent-tools.ts, page registry and Studio outcome copy.

2. **Make composition a small validated data structure before generating code.** Extend the existing selected concept with each page's purpose, primary customer action, section sequence, composition family, media roles, image IDs, intended prominence, and mobile reading order. Include a reason for each section. Allocate one shared typography/spacing/color/control system to all pages. Separate brand rules from the layouts of individual pages.

   Asset analysis should distinguish product, supporting lifestyle, logo, and visual reference where evidence permits. Cache dimensions, subject/crop information, and duplicate clusters by asset hash. Never assume every uploaded reference is sellable inventory. Preserve unknowns rather than inventing product facts.

   Reject a blueprint that routes unused images into an unsolicited gallery before any large code response. If the merchant says “you choose,” choose automatically. Optional small previews of the existing concepts can support merchants who want choice; do not reintroduce mandatory discovery questions or render three complete sites.

   Reuse source-design.ts, source-design-planner.ts, source-dna.ts, source-photo-facts.ts, and source-asset-library.ts.

3. **Build genuine composition families using existing UI primitives.** Start with a small reviewed set and expand when benchmarks justify it. Families should differ in the buyer journey and page silhouette: menu-led ordering; a single-product feature; a fashion campaign; a specification-led catalog; a text-rich book collection; a craft story. Each family needs more than one valid composition, so every bakery or clothing store does not become identical.

   The AI can choose the family, arrange compatible sections, write truthful copy, select assets, and apply brand rules. The renderer should own common spacing, image sizing, responsive behavior, and commerce controls. Allow custom sections within a bounded contract. Reuse packages/storefront-kit/kit/ui.tsx and source-ui.ts rather than replacing the stack.

   Different pages inside one site should share brand rules. Different stores should vary in structure. Do not force every section inside a page to use a different visual language merely to achieve a diversity score.

4. **Measure structural diversity and preserve explicit preferences.** Extend the current fingerprint with hero composition, section sequence, media rhythm, navigation arrangement, catalog presentation, and product-detail hierarchy. Compare the selected composition with recent relevant designs and with alternatives for the same brief. Test both different categories and several stores in the same category. Use interpretable features before considering more expensive embedding-based comparisons.

   User correction: do not record a personal no-grid preference or fixed photo limit. Choose composition from the products, theme, assets and buying task; purposeful product/category grids and lookbooks remain valid. Reuse successful prior choices without treating every previous model output as a preference. Evaluate silhouette separately from color/font differences. Similarity should inform a fresh design, not randomly restyle an already approved site.

5. **Add a bounded visual quality gate and localized repair.** Run deterministic checks first. Then feed a readable overview of every new/changed page at desktop and mobile widths to the existing reviewer, with larger section crops only where needed. Check focal hierarchy, repeated image patterns, cross-page brand consistency, useful section purpose, legibility, and the primary customer action. Require findings to identify page, section, evidence, severity, and proposed correction. A numerical score by itself is insufficient.

   Proposed default: one independent review and at most one focused visual repair. Re-evaluate the repaired scope; preserve the better checkpoint if quality regresses. Stop with an honest unresolved finding when the same issue persists. Use stable finding IDs such as editorial-photo-wall rather than exact diagnostic text. Separate provider retries from design retries. Neither another font change nor a new section name should reset the same underlying failure.

   Connect source-visual-review.service.ts and source-design-job.worker.ts to agent completion carefully. Ensure a finish verdict is tied to the current source/assets/data version so old screenshots cannot certify changed code.

6. **Control spend and verify the improvement before rollout.** Track tokens/requests and elapsed time per stage: asset analysis, concept planning, implementation, technical repair, visual review, and visual repair. “0 YAPI credits” in ChatGPT mode should remain distinct from consumed ChatGPT allowance. Show reported token usage where available and mark missing usage honestly.

   Cache asset/reference analysis and compilation/captures by relevant inputs, including source, brand rules, product data, route, viewport, and runtime version. Patch the affected section instead of regenerating unrelated files. Skip an expensive full visual review for a tiny copy change when deterministic layout checks suffice; expand coverage when shared CSS or components change. Keep limits for both normal API and ChatGPT-plan mode.

   First replay saved failures offline. Then run a small explicitly capped generation benchmark only after approval for its actual usage. Expand the sample once the smallest comparison shows progress. Do not spend tokens rebuilding the same failing store without a changed hypothesis and a specific measurement.

**Proposed evaluation contract.** These are acceptance targets for the work, not current performance claims.

| Case/measurement | Desired outcome |
| --- | --- |
| Exact salv gallery fixture | Detected by desktop composition checks even when there is no overflow or overlap. |
| Many uploads, no gallery request | Select a coherent subset; no automatically added gallery just to use the files. |
| Explicit gallery/lookbook | Allow its intended purpose while checking deliberate hierarchy and mobile behavior. |
| Product catalog | Preserve useful product grids and all real purchase data. |
| Missing/low-resolution photos | Choose an appropriate text-led or compact presentation; do not invent filler photography. |
| Shared brand across pages | Consistent typography roles, controls, spacing and photo treatment, with purpose-specific layouts. |
| Different stores | Blind comparison can distinguish structural differences beyond colors and fonts. Include same-category comparisons. |
| Local edit | Approved unrelated sections stay stable. |
| Repeated visual failure | Same finding ID cannot consume an unbounded sequence of redesigns. |
| First-pass quality | Measure the initial draft before repair separately from the final accepted draft. |
| Cost efficiency | Compare total reported tokens across successes and failures per accepted draft, plus repair count and elapsed time. |
| Completion claim | Every required new/changed page has evidence for its current version; technical success and visual judgment are labeled separately. |

Use a fixed rubric and blind human comparison alongside automated checks. A deterministic image-count rule cannot establish aesthetic quality, and an AI reviewer can also make mistakes. Release when the failures that motivated this change are caught and blinded comparisons improve without exceeding the agreed usage budget. Set numerical rate targets after measuring a baseline; a small showcase sample cannot establish production reliability.

**How salv could be composed under the recommended approach.** A concise opening with one chosen bakery photograph and a clear shopping action; a live catalog when products exist; one short supporting brand/detail section if there is real content to support it; and a useful footer. Other uploads remain in the library. If a gallery is explicitly requested, use a considered sequence with one focal image at a time or an intentional hierarchy, instead of treating all photos as equally important decoration. This is an example direction, not a requirement that all food stores share that layout.

**Scope and confidence.** Confidence is high in the repository findings and the visible run record. Official competitor documentation supports the workflow comparison; marketing examples are selective. The proposed pipeline is our design, not a claim to have reverse-engineered any competitor. No comparative first-pass benchmark, token-saving percentage, or delivery-time promise has been established by this research.
