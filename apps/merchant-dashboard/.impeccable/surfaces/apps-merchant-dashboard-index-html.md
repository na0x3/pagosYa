---
version: 1
slug: "apps-merchant-dashboard-index-html"
primary_target: "apps/merchant-dashboard/index.html"
related_targets: []
---

# Agent-first merchant workspace

## Scope and mode

- Target: `apps/merchant-dashboard/index.html`
- Mode: Operate
- Scope: replace the default merchant overview with an agent-led creation and growth workspace while preserving the existing pagosYa visual world and every existing operational destination.

## Audience and job

- Primary audience: an independent Bolivian merchant who wants to launch or improve a transaction-ready storefront without learning a page builder.
- Primary job: describe an outcome, see Yapi's safe sequence of actions, review the resulting storefront, and approve a draft or publish deliberately.
- Frequent return job: understand the next useful action for catalog, storefront, payments, or compliance.

## Chosen composition

- Approved comp: `.impeccable/mocks/agent-timeline-split.png`
- Structure: slim grouped tool rail; agent prompt and chronological action timeline on the left; live storefront preview on the right; one approval seam between them.
- Lifecycle adopted from the preview-first alternative: `Vista privada → Borrador aplicado → Publicado`.
- Memorable moment: one merchant request becomes an auditable sequence of real product actions while the storefront changes beside it.

## Trust and interaction constraints

- Yapi may organize and design, but must never imply that prices, inventory, money movement, KYC, bank information, or publishing changed without explicit approval.
- Timeline rows derive from real store/catalog/compliance state; no fake completion or progress percentages.
- The existing Appearance editor remains the advanced escape hatch.
- The storefront preview is the existing renderer, never a decorative duplicate.
- Existing Spanish product language, keyboard behavior, focus rings, reduced motion, and responsive handling remain binding.

## Implementation inventory

| Visible ingredient | Commitment | Medium |
|---|---|---|
| Grouped tool rail | Crear, Vender, Cobrar, Cumplir; active state uses current bento language | Semantic HTML/CSS + existing SVG vocabulary |
| Prompt composer | Largest control in the agent column, real label, suggestion shortcuts, send state | Semantic form controls |
| Action timeline | Four stateful rows: understood, preparing, approval, result; expandable evidence | Semantic ordered list + buttons + live regions |
| Approval seam | One Signal Amber action, enabled only when a real reviewable draft exists | Existing button system |
| Lifecycle switch | Vista privada, Borrador aplicado, Publicado with current state text authoritative | Buttons/status semantics |
| Storefront canvas | Existing iframe preview and desktop/mobile controls | Existing preview implementation |
| Advanced tools | Existing dashboard destinations and appearance editor, secondary but fully reachable | Existing navigation behavior |
| Mobile structure | Prompt → timeline → lifecycle → preview; grouped tools become a horizontal rail | CSS breakpoint, no hidden hamburger |

## Component grammar

- 3px graphite keylines, near-square 1–2px corners, 6–8px hard shadows.
- 0xProto Mono across pagosYa controls; the storefront keeps the merchant's chosen type.
- Restrained paper/graphite ground; violet, blue, green, and yellow indicate workflow; amber is reserved for the primary approval or publish action.
- State transitions only, 150–220ms, removed under reduced motion.

## Unresolved after this slice

- Persistent server-backed conversational threads and typed agent-tool execution.
- A dedicated publish endpoint/state if current store persistence does not distinguish applied draft from public publication.
- Natural-language targeted revisions mapped to selected storefront sections.
