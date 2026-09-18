You are Claude reviewing Codex's implementation plan after an independent art-direction critique. Read only the files explicitly listed below; do not edit, use credentials, browse, execute commands or delegate. Return a focused Markdown review of 800–1300 words. The user wants Codex to own heavy engineering and Claude to contribute critical thinking.

Read:
- /Users/saramia/pagosYa/docs/premium-storefront-design-plan.md
- /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/claude-critique.md
- /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/savia-home-loaded.jpg
- /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/amboras-grove-glass.webp
- /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/amboras-tideform.webp
- /Users/saramia/pagosYa/apps/api/src/stores/source-kit/commerce.js (relevant functions around lines 120–130, 270–345, 960–980; avoid reading the whole large file if unnecessary)

Codex's evidence corrections and disagreements with your earlier critique:
1. The first homepage screenshot was captured before the hero loaded. Read-only DOM verification now shows complete=true, naturalWidth=1400 for the hero and valid loaded icons; the corrected screenshot shows them. This was an audit capture defect, not demonstrated broken production imagery. The plan should enforce capture readiness and not claim the live hero is absent.
2. The runtime ALREADY supports thumbnails when multiple images exist, selected-value echoes, variant-specific images, dynamic prices, quantity and subtotal. The demo only supplied one composite photo per product. Do not require rebuilding existing capabilities or blame every visual gap on missing markup.
3. I accept a stronger runtime contract, but propose proving the premium ceiling with a small working slice before committing to a 5–10 day schema migration. Add facts/option descriptions only where needed; first inventory existing metadata and rendering paths.
4. I disagree with universal hard limits of 2 surfaces, 2 font weights or 3 accents, forced sticky panels, and requiring human permission on every critic/check disagreement. These are project-specific heuristics; color count and unequal column height do not inherently mean a bad design. Accessibility/commercial correctness are hard gates; aesthetic hints remain contextual. Also, WCAG text-contrast requirements exempt inactive controls; disabled states should still be readable, but don't falsely call them AA violations.
5. Product pages should use familiar, reliable components. My two initial visual candidates compare typography, photo scale, spacing and density within a familiar gallery/purchase arrangement; they do not invent new buying behavior or generate three entire storefronts every run. Once calibrated, use one direction unless uncertainty warrants another.
6. Both models should advise; Codex owns implementation and resolves factual disputes by reproducing them. The user should only need to steer consequential unresolved aesthetic choices, not approve every refinement.

Please state which corrections you accept; identify the 3–5 most consequential remaining weaknesses in the draft plan; assess the proposed sequence/effort (12–20 focused working days) with a realistic narrow scope vs broader follow-up split; recommend exact changes that will make the plan more practical and premium-focused. Do not agree just to be polite. Distinguish observed evidence from inference. Finish with a concise revised first-3-days work sequence. No need to restate your full earlier critique.
