---
target: "Generated storefront design: two cafe benchmark outputs"
total_score: 17
max_score: 32
na_heuristics: 5,9
p0_count: 0
p1_count: 1
timestamp: 2026-09-09T05-25-47Z
slug: apps-api-src-stores-source-generation-service-ts
---
# Generated storefront design gap — September 9, 2026

Provenance: two isolated assessments. A completed before B findings entered synthesis. Both inspected saved source/screenshots and fresh local Chrome renders; temporary tabs and servers were cleaned up. No paid generation, source modifications or merchant changes. B found no deterministic markup issues; no visual overlay was injected because browser evaluation is read-only.

## Main finding

The current system can generate functional stores, but lacks a strong pre-generation art direction stage and a rendered visual acceptance stage. Changing providers improved cost/polish but did not supply merchant-specific imagery, page storytelling or consistent design intent. The two benchmark sites used an identical short image-free café brief, so matching palettes are expected and this is not a statistical cross-store diversity test.

## Comparison with public competitor evidence

Shopify offers predesigned theme families and configurable sections/blocks; Prestige lists five presets and 30+ configurable sections. Sources: https://themes.shopify.com/themes/prestige/presets/prestige and https://help.shopify.com/en/manual/online-store/themes/theme-structure/sections-and-blocks . This supplies design choices and implementation ahead of a merchant's customization.

Amboras' public examples pair specific category and visual directions with imagery. Its watchmaker example combines close-up product imagery, an elaborate wordmark, restrained rules and a reservation-oriented presentation. Sources: https://www.amboras.com/examples and https://www.amboras.com/landing/examples/v2/duchen-maison.webp . These are public showcase assets; no private generation pipeline or routine output quality has been verified.

## Source evidence and recommended order

1. source-generation.service.ts:176 mandates a familiar homepage content checklist; lines180–184 give the catalog one repeated runtime markup structure. The layout can be restyled, but the generator lacks a library of tested alternate merchandising compositions.
2. The prompt repeatedly emphasizes compactness and local preservation. These are useful for repairs and ordinary edits; initial creation and explicit redesign need a positive, specific design plan with a page narrative and visual hierarchy before code.
3. Add a small set of genuinely different concept previews using merchant assets. Choose a direction, then generate the complete source once. Examples for QUEMADO: an oversized pastry close-up with a concise order flow; a graphic layout built around its packaging; an editorial story about product texture and craft using verified facts. Preserve the requested beige/blue identity and commerce behavior.
4. Provide curated local font pairs, explicit photo roles/crops, and reliable catalog layout contracts. Existing uploaded font support is useful, but there is no automatic art direction just from storing brand colors.
5. Add rendered visual review to functional checks. It should identify nonexistent layout classes, empty sections, repeated section treatments, lost mobile imagery and generic filler. DeepSeek's .catalog-grid mismatch demonstrates why passing checkout is insufficient.

The highest-value next implementation is the design direction + preview selection stage, followed by visual acceptance. Extra animation should support an already distinctive composition.

# Assessment A — design specificity

Independent reviewer: /root/design_specificity_review. No detector output seen. Sources: both generated café create/index.html and create/styles.css, saved recheck-create desktop/mobile screenshots, fresh read-only Chrome tab inspection of both rechecked/create pages. Temporary tab closed and localhost static server PID 48701 stopped. No API calls or merchant changes.

## Verdict

Both designs are category-interchangeable. Terra has noticeably better composition, typography and pacing; Flash is an ordinary document styled as a shop. Neither communicates a distinctive café people would remember. The short, image-free synthetic brief limits what this sample proves about full merchant generations.

## Priority issues

1. **P1 — No sensory product evidence.** Neither has product photography or a real place/person/material detail. Flash has no hero visual; Terra substitutes a geometrically awkward CSS cup and removes it on mobile. For food, nothing makes the item desirable. Ask for/use real product and place photography, map images to explicit editorial roles and crop/focal-point rules; if unavailable, deliberately choose a compact menu design rather than simulated photo-led luxury.
2. **P2 — Predictable page story.** Both follow hero → generic catalog → about → how/delivery → contact. Flash repeats the same underlined heading and empty space. Terra varies colors/grids but fills two large lower sections with instructions on clicking products and checking a cart. Choose sections around the actual buying decision: signature drink, pastry pairing, verified origin, visit/order information. Do not manufacture facts or reviews.
3. **P2 — Identity is mostly color plus default serif.** Both use Georgia, cream, forest green and earthy accent. Flash's emoji cup and Terra's decorative star could be replaced without changing the idea. A specific brand premise should govern type, scale, image language, grid and copy; select among meaningfully different compositions before coding.
4. **P2 — Missing-data states are visually unfinished.** Flash shows an empty Contacto section and duplicates the store name in the footer. Product description repeats its title in both. Terra renders a single Todo filter for three unclassified items. Omit unavailable sections/redundant controls and present sparse catalogs intentionally.
5. **P2 — Desktop-first choices weaken mobile buying.** Flash stacks three oversized desktop cards; its .catalog-grid rule misses the live catalog container. Terra hides its hero illustration and primary cart in the mobile menu, retaining a cart at the distant footer. Keep one memorable visual and a discoverable order action on mobile; verify the real runtime DOM instead of styling guessed classes.

## Strengths

- Both have a clear route to the catalog, readable product names and prices, and accessible names on live add buttons.
- Terra creates a coherent editorial hierarchy with different type scales, an asymmetric hero, a three-column desktop catalog and a contrasting green section.
- Flash keeps order access visible in its mobile header; both have restrained color palettes and reduce-motion CSS.

## Cognitive load / emotional journey

Flash has five equal-weight desktop navigation choices plus order, although only three products exist. Terra has four top-level choices including cart. The larger issue is attention spent scrolling through generic text without gaining useful purchase evidence. Both start calm; Terra has a stronger headline peak, but neither adds appetite, credibility or discovery after it. Flash ends in an empty Contacto heading; Terra ends with procedural reassurance without concrete fulfillment details.

## Bounded heuristic scores

Scores concern inspected storefront presentation, not a fresh checkout audit. Status 3/4 (named cart/count/status hooks); real-world match 2/4 (recognizable menu but repetitive copy); control 3/4 (catalog/cart navigation and return controls visible in source); consistency 2/4 (Flash missed grid, menu aria state inversion in source); prevention n/a (transaction edge cases not re-exercised); recognition 2/4 (generic plus glyphs and Terra mobile hidden cart); efficiency 2/4 (small catalog yet long journey); aesthetic 2/4 (Terra coherent, both interchangeable); error recovery n/a (not exercised); help 1/4 (generic order prose, Flash empty contact). Total 17/32, acceptable with significant improvements needed. These are a combined bounded sample assessment, not independent product-wide scores.

## Persona flags / next design question

Casey, mobile shopper: no tempting image on either phone layout, Terra cart concealed in top menu. Jordan, first-time buyer: Flash Contacto promises a destination that contains no information; product name repeated as description gives no decision help. Riley, deliberate shopper: delivery information is deferred; no visible place-specific details distinguish a real merchant.

Provocation: if the name were removed, could anyone identify this café? Which real product, place detail or buying ritual should dictate the homepage composition?


# Assessment B — isolated detector and browser evidence

Scope: saved Café del Patio create outputs only; no API calls or application source edits. Reviewed authored index.html, linked styles.css, saved desktop/mobile screenshots, and live local render in a fresh isolated Chrome tab. Browser tab closed and temporary localhost:8796 server (PID 48707, exec session 97979) stopped afterward.

## Deterministic scan

Executed bundled `/Users/saramia/.ai-skills/impeccable/scripts/detect.mjs --json` separately against:

- `tmp/deepseek-final-comparison-20260909/cafe-deepseek-v4-flash-1/create/index.html`: exit 0, JSON `[]`, 0 findings.
- `tmp/deepseek-comparison-20260909/cafe-gpt-5.6-terra-1/create/index.html`: exit 0, JSON `[]`, 0 findings.

No rule names/file locations or false positives because no findings were returned. This is a narrow markup scan, not a quality verdict; repetition and underdeveloped brand composition remain visible despite a clean scan. CSS and shared commerce runtime were not detector targets, as requested.

Browser overlay unavailable: documented browser evaluate API is read-only, so mutable script/title preflight is unsupported. Did not bypass this restriction or start the detector live-server. No injection, overlay, or detector browser-console findings claimed. Ordinary static render inspection still completed.

## Concrete visual/source evidence

1. **Same information architecture, different styling.** Both pages use five main sections in the same broad order: hero → catalog → about/story → ordering/delivery instructions → contact/reassurance, then footer. Both finish with generic purchase-process copy rather than distinctive café content. This is only one brief across two providers, so it demonstrates these samples' sameness, not a statistically proven cross-store pattern.
2. **No visual merchandise.** Both live DOMs have zero main-content `img` elements; all three catalog products repeat the name as description and provide price plus a full-width add bar. The brief lacked product photos, so missing images are partly input limitation. Terra fills the hero with a CSS cup illustration; Flash uses a coffee emoji logo and text-only centered hero. Neither lets buyers see the coffee, pastry, or place. Mobile Terra removes the cup illustration, leaving a long text-led page.
3. **Flash repeats one section treatment.** At 1440px viewport, all five sections have transparent backgrounds over the same cream canvas; all four after the hero use `padding:48px 0px`. Every h2 receives the same green type plus brown underline. Section heights: hero381px, catalog903px, about347px, delivery305px, contact222px. Contact contains only its heading because no contact data exists, creating an empty section. This is directly visible in saved `create-desktop.png` and `create-mobile.png`.
4. **Flash catalog layout intent does not reach runtime markup.** Authored CSS defines grid on `.catalog-section .catalog-grid`, but its catalog mount is `[data-pagosya-catalog]` and the observed live catalog computed display is `block`. Products stack as broad, touching white rounded panels even on desktop. A syntactically valid output can therefore pass checkout checks yet miss its own composition intent. Inspecting the public rendered DOM confirms the mismatch without scanning generated runtime code.
5. **Terra has stronger hierarchy and rhythm, still generic content.** It uses a split hero, serif/sans contrast, a three-column desktop catalog, offset story numeral, and a dark green ordering section. At 1440px all four post-hero sections still have `padding:120px 144px`; the section height range is448–731px. There is some real composition variation, so saying both layouts are identical would be inaccurate. Its story and final sections repeat directions to view details/review the order instead of differentiating beans, preparation, ingredients, neighborhood, or hospitality.
6. **The common palette is not evidence of model failure.** Both were asked for the same café concept/palette. Cream and forest green consistency is expected; the stronger criticism is default content sequence, absence of product imagery, uniform spacing logic, and lack of a designed first impression beyond generic café signifiers.

## Implications for parent synthesis

- A better model improves polish in this sample, but provider substitution alone does not supply art direction, imagery, meaningful merchandising, or composition review.
- Product needs a design brief with a differentiated concept and assets, several structurally different candidates, and visual checks of the rendered page—not only responsiveness, checkout, or “no error” checks.
- Shared commerce hooks need a reliable style contract: avoid the generator targeting a nonexistent class and still being marked successful.
- Prefer fewer meaningful sections over filling a minimum page length with generic instructional copy; hide absent contact blocks and avoid unsupported invented business claims.

Evidence limits: no fresh purchase tests, no paid generations, no competitor inspection performed by this assessment, and no assessment of the live QUEMADO merchant site. Conclusions are bounded to the two named saved café outputs.
