# Bringing Webild-like design possibilities to YAPI

Research date: 2026-09-20. Target: https://www.webild.io/. Repository inspected: `feature/yapi-differentiation`. This document preserves the research and original proposal. See the [implementation and verification report](yapi-webild-upgrade-2026-09-20.md) for subsequent work. Neither document establishes measured parity.

## Recommendation

Expand the existing YAPI design system around complete, art-directed compositions, rendered reference evidence, and reliable visual editing. The current system already has React generation, a component library, animation tools, visual tokens, consistent product imagery, and a bounded visual-improvement workflow. Build on those investments.

Treat Webild as a design and authoring benchmark for pagosYa's merchant websites. Broader site types such as service businesses and blogs are a second scope because YAPI currently assumes a selling catalog. Matching their design possibilities does not require changing pagosYa's payment infrastructure.

## What the public evidence establishes

| Evidence | Finding | Confidence / limitation |
| --- | --- | --- |
| [Webild homepage](https://www.webild.io/) | Advertises prompt-based generation, visual/chat editing, section changes, image/logo creation, hosting, domains, analytics, forms and blogs. | Vendor claims; the authenticated generation/edit/publish workflow was not tested. |
| [Template gallery](https://www.webild.io/templates) | The inspected gallery listed 23 named designs across commerce, hospitality, services, software and portfolios. | Observed public UI; gallery breadth is not a generation success rate. |
| [Coffee Shop preview](https://www.webild.io/templates#coffee-shop) | Distinctive display lettering, warm colors, a video asset, drink imagery and category controls. Description advertises floating cards and a cursor trail. | Rendered preview and DOM inspected; not a complete interaction audit. |
| [Luxury Real Estate preview](https://www.webild.io/templates#luxury-real-estate) | Large architectural imagery, restrained typography, property listings and a contact section. Description advertises scroll video, text-fill and parallax. | Rendered preview inspected, including the full-size linked page. |
| [Product Showcase preview](https://www.webild.io/templates#product-showcase) | Image-led opening with mixed sans/italic display type, supporting product imagery and a priced product rail. Description advertises overlay parallax and variant cards. | Rendered preview and DOM inspected; checkout correctness unverified. |
| [Company LinkedIn](https://www.linkedin.com/company/webildio) | Describes Bob, an assistant for design, conversion and SEO suggestions. | Vendor description, not measured effectiveness. |
| [Privacy policy](https://www.webild.io/privacy) | Names infrastructure services including Vercel and DNSimple and describes commerce via Stripe Connect. | Documents services, not generation architecture or model choice. |

The official gallery embeds previews hosted under `webild-components-version-4.vercel.app/components/templates/...`, with example media under `storage.googleapis.com/webild/default/templates/...`. This is direct evidence of packaged public examples and organized assets. It does **not** prove that every generated site is assembled from a closed component registry.

**Working inference:** their visible output benefits from carefully coordinated layouts, media, typography and interactions, with AI customization layered onto the experience. Their model, system prompts, model training, retrieval system, internal representation and repair strategy remain unknown. Public examples alone cannot establish typical output quality. No account was created and no paid generation was run.

## Current YAPI baseline, checked in source

| Area | Existing implementation | Opportunity |
| --- | --- | --- |
| Planning | `source-design-planner.ts` develops three concepts and chooses based on brief fit. | Give concepts actual visual references and independently chosen compositions. |
| Composition | `source-ui.ts` samples a header/hero/catalog/card/effect/signature combination and suggests retaining it unless the brief warrants changing it. | Choose compatible combinations by brand, imagery, catalog and intended journey; preserve variety after fit. |
| Components | `packages/storefront-kit/kit/ui.tsx` includes four hero variants, five catalog layouts, five card styles, galleries, marquees, stacking stories, product zoom scenes and other primitives. | Author and validate complete visual families; fill specific missing interaction patterns. |
| Motion | `source-creative.ts` bundles Motion, Lottie and helpers; CSS, SVG, Canvas and WAAPI are available. | Improve scene choreography and authoring controls; a new general animation engine is not the first dependency. |
| References | `source-website-reference.ts` explicitly supplies HTML/CSS evidence, without screenshots, computed styles or motion verification. | Add isolated browser capture and visual interpretation. |
| Images | `source-scene-contract.ts` persists shared backdrop, lighting, framing and aspect choices. | Extend beyond consistent packshots to a coordinated hero, detail and supporting-media plan. |
| Product pages | `source-design.ts` exposes `editorial` and `dense`, with platform-owned product rendering. | Add controlled presentation layouts around the existing product/variant/purchase behavior. |
| Editing | Source revisions, scoped AI edits and asset controls exist. No direct text/section canvas editor was found in the inspected Studio paths. | Add deterministic text/image/token changes and section swaps, plus selected-element AI edits. |
| Review | Durable design jobs, captures, repair candidates and comparison exist. | Complete live evaluation and calibrate quality decisions before wider rollout. |

The older `docs/source-design-generation.md` description of server-selected concepts and React-only imports is behind current source: the planner now chooses for fit, and creative/UI imports are bundled. Use source as the implementation baseline.

The September 13 [experiment report](premium-automation-2026-09-13/results.md) records an incomplete comparison interrupted by provider quota, with no live durable candidates applied in that cohort. This is historical evidence, not a check of today's balance or proof that current visual improvement cannot work.

## Implementation sequence

### 1. Establish a visual benchmark and three excellent reference builds

Start with three owned example stores: an expressive cafe, an editorial beauty brand, and a cinematic furniture/product brand. Use real or clearly synthetic fixture catalogs with owned/licensed assets. Review the whole customer journey, not only the first screen.

Capture desktop and mobile openings, mid-page sections, product detail, cart and checkout. Record what each composition depends on: image cutouts, video, short headings, catalog size and desktop-only effects. Build examples from pagosYa code and media; use Webild for visual characteristics, not copied assets or business content.

**Acceptance:** all three look deliberately different in silhouette, typography, image treatment and motion; all sampled purchase flows pass at 1280, 768, 390 and 320 CSS pixels. These become visible examples in a future “Start with a design” picker.

### 2. Replace arbitrary starting combinations with informed selection

Extend `source-ui.ts`, `source-design-planner.ts` and the design manifest with a small registry of compatible composition families. Store family purpose, asset requirements, available sections, type roles, density, responsive behavior and optional signature scenes.

Retrieve a few relevant examples from merchant facts and references, then develop the existing three concepts independently. Select for brief fit. Allow authored custom sections and an open composition path; family metadata must not force every cafe or beauty store into the same design.

Separate fixed invariants (readable content, working purchasing, truthful data) from aesthetic preferences (rounding, palettes, hero type, accent usage). Audit prompt rules for conflicts with a deliberate merchant request. Preserve the chosen composition and tokens through later edits.

**Acceptance:** repeat generation across six different briefs; chosen structures fit available assets, and concepts differ beyond color changes. A local copy edit retains unrelated composition and media.

### 3. Expand section and product presentation choices

Build the missing patterns identified by the examples, first in `packages/storefront-kit`: video hero with poster, floating media composition, before/after comparison, vertical showcase/marquee, and richer product-story sections. Reuse existing parallax, stacking cards, text reveal and scroll-scale where they already fit.

Give each pattern explicit input data, theme tokens, touch/keyboard behavior, reduced-motion/static fallback and preview/export parity. Add product layouts through platform-owned rendering: image-led, specification-led and story-led presentations using the same authoritative price, stock and variant controls.

Plan hero, supporting media and product photos together. Add a small licensed font selection that covers expressive, editorial, geometric and utilitarian roles. Load only used assets. Consider a bounded 3D viewer later only if the benchmark demonstrates a need; Webild's actual 3D support was not established here.

**Acceptance:** scenes remain usable with missing optional media, disabled motion, long Spanish names, slow image loading and touch input. Product choices and checkout remain correct.

### 4. Make visual references and visual editing first-class

Add browser-rendered reference capture beside the current HTML/CSS fetcher. Isolate public-site execution from credentials and private networks, enforce redirect/resource limits, and capture fixed viewport and scroll states. Produce a compact design brief describing observed layout, type, palette, media and motion; label anything inferred or unavailable.

Introduce stable section/element IDs and a mapping to authored component props or safe source edits. Start with text replacement, image/focal-point replacement, palette/type controls and compatible section swaps. Support section reorder only when the page contract permits it. Save changes as revisions and support undo; do not regenerate the whole site for a text change.

Selected-element AI requests should include the element, current props, surrounding layout and preservation scope. Shared headers should clearly edit across pages. Keep shopper data collection and verification surfaces platform-owned.

**Acceptance:** a merchant can change a heading, replace a hero image, swap an opening and undo each action; untouched sections and commerce state survive. Custom authored sections remain accessible through scoped AI/source editing.

### 5. Validate improvements before broad rollout

Reuse `source-design-jobs.service.ts`, the worker and evaluator. Extend their evidence for the new scene states rather than creating another repair loop. Validate functional gates first, then evaluate composition, imagery, typography, brand fit and mobile quality. Keep the baseline when the result is uncertain or regresses.

Run a new versioned comparison: six held-out commerce briefs × three repetitions × two arms = 36 initial outputs. Both arms get identical input assets and comparable budgets; one uses the current pipeline, the other the proposed changes. Record every failed generation, cost, latency and repair. Human reviewers compare anonymized pairs. Test local editing separately.

Measure loading, layout shifts, media bytes and scrolling on a fixed mobile device/network profile. Set release budgets from the baseline before running the comparison, and reject scenes that meet the visual goal only by making the site unusably heavy.

**Proposed release gates:** at least 80% of candidate attempts produce a human-approved design within the stated allowance; all accepted stores pass required functional checks; every edit-preservation case passes; preference and cost/latency results are reported with their small-sample limits. This is an initial rollout gate, not proof of universal Webild parity. A true head-to-head generation comparison needs equivalent Webild account access and inputs.

### 6. Extend into general websites if full product parity is the objective

Add explicit site purposes: shop, service, portfolio and editorial. Make catalog/product/checkout requirements conditional on purpose. Add service listings, lead capture, case studies and blog/CMS models, then verify the relevant flow for each purpose. Booking screens require a real availability/reservation backend or an explicit supported integration.

Audit existing publishing, domains, SEO and analytics before adding missing user workflows. This is a separate release track; a storefront design upgrade does not establish parity in blogs, scheduling, domains or analytics.

## First implementation slice

Deliver the three owned reference builds, their screenshots and interaction evidence, the initial composition registry, and planner integration. Then run a small held-out comparison before expanding the registry or committing to a full canvas editor.

This slice answers the most important uncertainty: can the current YAPI runtime reliably produce the desired visual quality when given stronger compositions and assets? It also provides reviewable output early and makes the next engineering priorities measurable.
