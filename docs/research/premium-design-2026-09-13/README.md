**Premium design investigation, September 13, 2026**

The final synthesized plan is [premium-storefront-design-plan.md](../../premium-storefront-design-plan.md). This investigation produced a plan and review artifacts; it did not implement the proposed redesign or change production design behavior.

**Claude collaboration**

The user requested Codex for heavy work and Claude for thinking. Codex inspected the implementation and browser evidence, wrote the plan, reproduced factual claims and integrated two independent Claude critiques. Claude ran through the installed, authenticated Claude Code CLI with Read as its only available tool, safe mode, no MCP servers and no write permission. Both runs completed with no permission denials. No API keys or customer records were included in the review packet.

| Review | Primary model reported | Duration | CLI cost estimate |
|---|---|---:|---:|
| Independent art-direction critique | claude-opus-5 | 230 seconds | $0.8899405 |
| Critical review of Codex's plan | claude-opus-5 | 115 seconds | $0.6140290 |

The CLI also reported small auxiliary Haiku usage. Total reported list-price cost estimate: $1.5039695. These are CLI telemetry estimates, not a confirmed charge against the user's Claude subscription.

Inputs and results:

- `claude-critique-prompt.md`, `claude-critique.md`, `claude-critique.raw.json`.
- `claude-plan-review-prompt.md`, `claude-plan-review.md`, `claude-plan-review.raw.json`.

The raw first critique is intentionally retained. Its missing-hero claim was corrected: `savia-home-before.jpg` was captured prematurely. A subsequent DOM check confirmed `complete=true`, `naturalWidth=1400` for the hero and loaded navigation icons. `savia-home-loaded.jpg` contains the corrected evidence. Claude accepted this correction in its second review. Do not cite the premature capture as a demonstrated production-image failure.

`savia-product-before.jpg` is the full rendered bottle page supplied for the initial critique. `savia-product-loaded.jpg` is a later full-page capture; the actual measured viewport was 1440 CSS pixels wide. Neither file is a mobile reference. The original store's 390/320 checks occurred during the previous implementation turn; this investigation's new images are desktop evidence.

**Reference provenance**

The user's original reference is `examples/savia/assets/reference.jpg`, derived from the supplied September 13 screenshot. Full-size public reference images were found by inspecting the visible images in the [Amboras examples gallery](https://www.amboras.com/examples):

- [Grain & Glass](https://www.amboras.com/landing/examples/v2/grain-glass.webp) → `amboras-grain-glass.webp`.
- [Grove & Glass](https://www.amboras.com/landing/examples/v2/grove-glass.webp) → `amboras-grove-glass.webp`.
- [Tideform](https://www.amboras.com/landing/examples/v2/tideform.webp) → `amboras-tideform.webp`.

These are research references, not licensed Savia storefront assets. They support observations about the depicted composition; they do not establish the examples' live functionality, viewport sizes, generation process or conversion rates. No reference logo, commercial claim or product has been adopted into the proposed store.

**Key synthesis**

The plan's highest-priority technical findings are random final concept selection, a missing semantic-token bridge, recurring runtime presentation defaults, and the configurable-product renderer change on the hosted route. Its highest-priority visual findings are competing surfaces, weak hierarchy, redundant content and an insufficiently coordinated set of product images. A small calibrated product-page improvement comes before building extensive automated review infrastructure.
