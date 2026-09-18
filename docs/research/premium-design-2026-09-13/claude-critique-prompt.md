You are Claude acting as an independent senior ecommerce art director. The user explicitly asked Codex to do the heavy engineering and planning, with Claude contributing design thinking. Your task is a critical, evidence-based planning review. Do not edit files, run commands, access credentials, inspect unrelated customer data, or delegate. Use Read only on the specific files below. Return your critique in Markdown in your final response, about 1800–2500 words. No fabricated live-site inspection or claims about Amboras's private implementation.

User feedback: "theirs is way more polish, it has more of a modern design everything makes sense what you built is just boxes with random colors ... give me a plan ... better designs and more consistent, more premium designs ... so it looks like amboras". The task now is an extensive plan, not another build.

Visual evidence you must inspect:
1. /Users/saramia/pagosYa/examples/savia/assets/reference.jpg (user's Amboras examples screenshot, the actual target)
2. /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/savia-home-before.jpg
3. /Users/saramia/pagosYa/docs/research/premium-design-2026-09-13/savia-product-before.jpg

Context you may read:
- /Users/saramia/pagosYa/examples/savia/site/styles.css
- /Users/saramia/pagosYa/examples/savia/site/design-direction.json
- /Users/saramia/pagosYa/examples/savia/PROMPT.md
- /Users/saramia/pagosYa/apps/api/src/stores/source-design.ts
- /Users/saramia/pagosYa/apps/api/src/stores/source-design-planner.ts
- /Users/saramia/pagosYa/docs/source-design-generation.md

Known architecture: three concepts are planned separately, then the server selects a pre-sampled random index. Model implements the selected plan. Static/React structure is validated; browser probes check functional and layout defects separately. There is no rendered-image premium-quality gate. Product/cart/payment behavior is platform-owned and must stay trustworthy. The previous demo has real options and working simulated checkout; functionality passing did not satisfy visual quality. The new plan must improve the generator across merchants, not just manually restyle Savia once.

Please produce:
1. Frank visual diagnosis, separating screenshot observations from inferred causes. Explain precisely why the reference looks polished and Savia does not, beyond vague adjectives.
2. A recommended design direction for Savia in words: hierarchy, spacing, surface/color roles, typography, image art direction, option controls, useful density. Include what to remove; do not equate premium with monochrome, serifs, animation, or expensive-looking empty space.
3. Critique of this proposed pipeline: evidence analysis -> semantic brand tokens -> 2 or 3 visual product-page concepts -> rank rather than random selection -> one fully working product-page slice -> cross-page rollout -> browser screenshots -> independent critique -> bounded targeted repair -> human-calibrated acceptance. Suggest simplifications and failure modes. Avoid treating an AI score as objective truth.
4. An operational division of labor: Codex owns architecture, implementation, tests and synthesis; Claude supplies independent art-direction and occasional review. Propose what context each handoff needs, and when disagreement should stop an iteration.
5. A weighted visual rubric and concrete pass/fail examples; how to calibrate it against the reference without pretending a screenshot comparison is exact layout equality.
6. Prioritized milestones and realistic effort ranges, dependencies, deliverables, stop conditions and how to prove repeated quality across multiple unrelated merchant types.
7. The three most valuable first actions and things we should explicitly avoid.

Be demanding and specific. Disagree with Codex's previous design choices or proposed approach when warranted. Do not produce a flattering generic checklist.
