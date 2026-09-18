# pagosYa Merchant Studio

## Scope and mode

- Target: `apps/merchant-studio`
- Mode: Operate
- Scope: a separate merchant-facing AI website operator that reuses pagosYa store documents, checkout, and API boundaries without replacing the current dashboard.

## Audience and job

- Audience: an independent Bolivian merchant who wants a professional storefront without learning a conventional page builder.
- Primary job: describe an outcome, attach up to three references once, inspect YAPI's exact proposed changes, approve sensitive work, and publish deliberately.
- Success: the first selection visibly fills all three image slots and checkout changes cannot publish without review.

## Approved composition

- Hybrid: `.impeccable/mocks/merchant-studio-a-conversation-first.png` + `.impeccable/mocks/merchant-studio-c-review-first.png`.
- Direction A owns the 35/65 conversation-and-canvas topology.
- Direction C owns the structured change set, checkout approval gate, reversibility language, and before/after tray.
- Storefront imagery belongs to the merchant; pagosYa chrome remains quiet and operational.

## Trust constraints

- One input/drop event is one ordered batch; duplicate filenames remain distinct files and every accepted file gets its own slot immediately.
- YAPI may prepare changes, but checkout, prices, inventory, money movement, KYC, bank details, and publishing require explicit merchant control.
- Completion labels must derive from real local or server state, never decorative progress.
- The first frontend slice is a truthful interaction prototype; typed server-backed agent execution remains a later integration.

## Component grammar

- pagosYa-owned chrome uses 0xProto Mono, paper, graphite, precise keylines, near-square geometry, and amber only for the active approval/publish action.
- The storefront preview uses one merchant-owned editorial type and its own soft ecommerce geometry.
- Motion is limited to state transitions under 220ms and removed under reduced-motion preference.
- Desktop keeps agent and preview visible together; narrow screens stack the complete agent workflow before a horizontally inspectable storefront canvas.

## Implementation boundary

- New code lives in `apps/merchant-studio`.
- Canonical document vocabulary comes from `packages/shared-types`.
- Future command execution should extract or import the pure store-editor command layer rather than duplicate the full merchant dashboard.
- Future live preview should mount or embed the existing `apps/checkout` renderer rather than maintain a second production storefront renderer.
