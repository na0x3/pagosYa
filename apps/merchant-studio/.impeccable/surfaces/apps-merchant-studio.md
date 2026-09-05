---
version: 1
slug: "apps-merchant-studio"
primary_target: "apps/merchant-studio"
related_targets: []
---

# pagosYa Merchant Studio

## Scope and mode

- Target: `apps/merchant-studio`
- Mode: Operate
- Scope: a separate merchant-facing AI website operator that reuses pagosYa store documents, checkout, and API boundaries without replacing the current dashboard.

## Audience and job

- Audience: an independent Bolivian merchant who wants a professional storefront without learning a conventional page builder.
- Primary job: describe an outcome, attach up to three references once, inspect YAPI's exact proposed changes, approve sensitive work, and publish deliberately.
- Success: one three-image selection visibly fills three ordered slots, selecting any prepared change reveals its own evidence, and an active checkout change cannot publish without explicit approval.

## Approved composition

- Hybrid: `.impeccable/mocks/merchant-studio-a-conversation-first.png` + `.impeccable/mocks/merchant-studio-c-review-first.png`.
- Direction A owns the 35/65 conversation-and-canvas topology.
- Direction C owns the structured change set, checkout approval gate, reversibility language, and before/after tray.
- Storefront imagery belongs to the merchant; pagosYa chrome remains quiet and operational.

## Built milestone

- Status: interaction prototype, reviewed PASS against the approved A+C contract.
- Hero, Palette, Products, and Checkout each expose selected-change evidence; Checkout opens the canvas review tray and carries the explicit approval gate.
- Conversation replies, draft mutations, approval, publish state, and undo are local prototype state. No server-backed AI execution, durable publishing, or production checkout rendering is claimed in this milestone.

## Trust constraints

- One input/drop event is one ordered batch; duplicate filenames remain distinct files and every accepted file gets its own slot immediately.
- YAPI may prepare changes, but checkout, prices, inventory, money movement, KYC, bank details, and publishing require explicit merchant control.
- An active Checkout change blocks publish until the merchant reviews and approves that selection; changing its inclusion invalidates approval.
- Reversibility language must name the reversible object. The prototype can restore one prior local image batch and says that the selected Checkout change can be reverted; future durable history must not be implied before it exists.
- Completion labels must derive from real local or server state, never decorative progress.
- The first frontend slice is a truthful interaction prototype; typed server-backed agent execution remains a later integration.

## Component grammar

- pagosYa-owned chrome uses 0xProto Mono, paper, graphite, precise keylines, near-square geometry, and amber for active inclusion plus approval/publish actions.
- The storefront preview uses one merchant-owned editorial type and its own soft ecommerce geometry.
- Motion is limited to state transitions under 220ms and removed under reduced-motion preference.
- Desktop keeps a 35/65 conversation/canvas split. At 900px and narrower, stack the complete agent workflow before a horizontally inspectable storefront canvas; at 600px and narrower, compact secondary toolbar details without removing evidence, approval, review, or publish state.
- Selected Hero, Palette, and Products rows keep their target, before/after comparison, and details directly attached. Selected Checkout keeps its warning/approval evidence in the conversation and its full before/after tray on the canvas.
- Code mode, mobile viewport switching, persistent redo, voice input, and direct document-section controls are future no-ops in this milestone and remain disabled with explanatory labels.

## Implementation boundary

- New code lives in `apps/merchant-studio`.
- Canonical document vocabulary comes from `packages/shared-types`.
- Future command execution should extract or import the pure store-editor command layer rather than duplicate the full merchant dashboard.
- Future live preview should mount or embed the existing `apps/checkout` renderer rather than maintain a second production storefront renderer.
