---
target: apps/merchant-dashboard/index.html
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-09-01T00-14-38Z
slug: apps-merchant-dashboard-index-html
---
Method: dual-agent (A: /root/design_assessment · B: /root/detector_assessment)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Strong generation progress and save states, but saved/applied/published are blurred. |
| 2 | Match System / Real World | 3 | Spanish merchant language is strong; design terms such as direction, recipe, and structure assume design literacy. |
| 3 | User Control and Freedom | 3 | Undo, versions, locks, preview, and rollback are strong; apply and publish are not separated clearly enough. |
| 4 | Consistency and Standards | 3 | Coherent visual system, but three separate AI entry points create competing mental models. |
| 5 | Error Prevention | 3 | Safe structured proposals and confirmations are robust; “Usar y editar” understates that it applies a proposal. |
| 6 | Recognition Rather Than Recall | 2 | Users must remember how stores, products, appearance, structure, AI state, and KYC fit together. |
| 7 | Flexibility and Efficiency | 3 | Manual controls and shortcuts are broad; a persistent conversational refinement loop is missing. |
| 8 | Aesthetic and Minimalist Design | 2 | Distinctive and crafted, but the editor is control-dense. |
| 9 | Error Recovery | 3 | Versions and explicit errors are strong; some errors appear far from the failed proposal. |
| 10 | Help and Documentation | 2 | Extensive onboarding, but little task-specific guidance for creative decisions. |
| **Total** | | **27/40** | **Acceptable; substantial simplification needed.** |

## Design Specificity Verdict

The visual output is merchant-specific and unusually authored, but the product frame remains a broad Shopify-like administration suite. AI storefront creation is one feature inside Appearance instead of the product's organizing intelligence.

The deterministic scan reported seven findings in `apps/merchant-dashboard/index.html`: three `side-tab`, one `broken-image`, one `codex-grid-background`, one `dark-glow`, and one `marquee`. Source review classified all seven as false positives: structural dividers, a QR image populated before display, a literal parchment surface, and an accessible indeterminate progress bar. Browser inspection of the logged-out surface found no horizontal overflow or console errors. The authenticated dashboard could not be inspected without using stored credentials, and mutable script injection was unavailable, so no reliable overlay was shown.

## Overall Impression

The product already contains the right technical thesis: a protected commerce shell plus an AI-authored, reversible creative canvas. The largest opportunity is to make that thesis the entire merchant experience instead of exposing a large admin and page builder first.

## What's Working

- The commerce-shell/creative-canvas boundary keeps AI expressive without letting it alter prices, inventory, payments, or legal behavior.
- Generated storefronts have genuine merchant-specific visual character.
- Preview-first proposals, section locks, undo, versions, and rollback establish rare and valuable trust.

## Priority Issues

1. **[P1] The differentiated workflow is subordinate to generic admin IA.** The sidebar exposes roughly twelve destinations plus a separate AI setup CTA. Make the default home an agent-led launch and growth workspace; reveal operational tools from real tasks and alerts.
2. **[P1] This is a one-shot generator, not yet an agent-led creator.** Add a scoped refinement thread tied to the current proposal and selected section, with visible change explanations and automatic locking of preserved areas.
3. **[P1] Apply, edit, save, live, and publish are semantically blurred.** Use a lifecycle such as Private Preview → Applied Draft → Published, rename “Usar y editar” to “Usar como borrador,” and require a separate publish action with a change summary.
4. **[P1] The manual editor overwhelms the creative peak.** Keep the canvas primary, expose only two to four contextual controls, and move typography, motion, announcement, and exact layout controls into Advanced.
5. **[P2] Generation rules contradict each other across architecture, design documentation, and UI copy.** Establish one authoritative contract for palette, fonts, and which existing media enters generation.

## Persona Red Flags

- **First-time merchant:** three AI entrances and terms such as Appearance, Direction, Structure, and Recipe do not form one obvious path.
- **Power user:** can regenerate or use granular controls but cannot ask for a targeted natural-language revision.
- **Distracted mobile merchant:** long forms separate preview, edit context, and save state, creating a working-memory bridge.

## Minor Observations

- Custom domains interrupt the creation narrative before the main studio.
- Proposal cards contain too many tags; comparison should prioritize the preview, rationale, and one meaningful tradeoff.
- Some stored QA screenshots contain blank canvases or corrupted text, so they are weak evidence for the end-to-end workflow.
- The first store form asks only for a name, which is the natural place to begin agent-led intake.

## Questions to Consider

- Is pagosYa payment infrastructure with a website builder, or the fastest way for a Bolivian merchant to launch a site and get paid correctly?
- If AI can choose structure, type, and motion, why ask beginners to choose among six design-school labels first?
- Which permanent navigation destinations are genuinely weekly merchant tasks?
- Should the agent state its trust boundary explicitly: it can design and organize, but never change prices, inventory, or money movement without approval?
