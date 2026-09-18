# Savia vs. Amboras: art-direction review and generator plan

## 1. Visual diagnosis

### What the screenshots show

**Reference (Amboras examples, 6 tiles).** Every tile uses the same product-page layout: a large photo on the left (about 55%), a strip of 4–5 thumbnails under it, and a dense buying panel on the right. What makes it look finished:

- **Color comes from the photos, not from boxes.** The page and the panel share one pale paper background. The strong color is inside the photography: the salmon backdrop behind Howl & Honey, the orange fruit in Grove & Glass, the brown leather in Ironjaw. The interface adds **one** accent (red, dark green or olive). That accent appears only on the selected option, the buy button and small badges.
- **The panel has many layers of small text on a tight grid.** Top to bottom: title, a one-line tagline, the price plus a unit explanation ("/1.5kg bag · about 30 meals"), attribute chips, small caps option labels, and option rows with a sub-line and a right-aligned price. Then a full-width button with the total in its label ("START FOR $33.60 — FIRST BAG"), a line of small print, and a row of three icon facts. Type sizes are mostly small. Hierarchy comes from weight, case and position, not from size jumps.
- **Controls are built for the product.** Icon tiles for dog weight and protein, rectangular color swatches plus a specs table on Tideform, delivery-day segments on Grove & Glass. Controls in a group share one width, and the button spans exactly the option column.
- **One line and corner style per store.** Hairline 1px borders in ink or accent. Corners are either square or one small radius, applied everywhere.
- **Photos look like a set.** Same lighting, backdrop matched to the brand, product fills 60–70% of the frame, and thumbnails show detail, scale and use.
- **Typefaces are not always serif.** Ironjaw uses a slab/condensed face and Tideform a technical mono feel. Paper Owl and Grove & Glass use serifs. Polish does not depend on the typeface.

**Savia home (before).**
- The hero photo is **not rendered**. The right 55% of the first screen is empty cream.
- A floating cream panel with a soft shadow (the only shadow anywhere) sits over nothing.
- The orange "Jugo naranja + jengibre" label is stranded at the bottom right, labelling an image that isn't there.
- The cart button shows no icon and reads "Mi pedido ( 0 )" with spaces inside the parentheses. On the product page the icon does show.

**Savia product (before).**
- **At least six unrelated surface colors:** cream page, sage gallery block, coral panel, white option chips, pink stepper buttons, and a brown disabled button with pink text. A plum color also appears on the "Savia" label and the active tab, and plum isn't in the palette.
- **The photo is framed twice.** The photo has its own yellow-green backdrop, which clashes with the sage frame around it. The coral panel competes with the coral bottle, which is the product.
- **Columns end at different heights.** The gallery stops around y≈875 and the panel around y≈1230, leaving about 350px of dead space under the photo.
- **Duplicated or meaningless content:**
  - "Volver a productos" appears next to a breadcrumb that does the same job.
  - A "1 / 1" counter shows for a single image.
  - The description appears in full, then again word for word under the "Descripción" tab.
  - "Elige una opción" sits next to every group label.
  - "Elige tus opciones" floats alone at the right.
- **The spacing has no rhythm.** There is a big gap between title and price. The helper text is jammed directly under the button. The "Retiro en tienda" box looks like a text input with an arrow.
- **Mixed corner styles:** rounded gallery, square panel, 8px chips and button, square cart button.
- **The weights jump from very light to very heavy:** a Light 300 display font next to an extra-bold price.
- **The first thing a shopper sees is a button that looks broken** (the brown/pink disabled state).

### Likely causes (from reading the code, not certain)

1. **The runtime product markup limits the design, not the model's taste.** The platform renders the product configurator (`product-detail__*`), and the generator can only restyle it (`source-design.ts:12`). The reference's density depends on structures this markup likely doesn't have: sub-lines and prices on options, the chosen value echoed in the label, a thumbnail strip, a total inside the button, a facts row, and accordions. No stylesheet can create those. **This is the most important point in this review.**
2. **Colors have no assigned jobs.** The brief listed five colors and asked for "superficies de color cálidas" (`PROMPT.md:3`). The concept format is free prose capped at 500 characters with no token schema. The model did what it was told: it made every color a surface. The brief misread the reference, whose warmth lives in the photos.
3. **Planning rewards difference, not quality.** The planner requires three "genuinely different silhouettes" (`source-design-planner.ts:22`), and the server then picks one at random. The concept picked was the riskiest one: a full-bleed overlay hero with a panel colored per product.
4. **The stylesheet is layered patches.** It has a base system with `--radius:3px`, dead CSS for `.product-detail__option`, which the contract says doesn't exist (`styles.css:54`), and a "Savia browser refinement" override layer with 8px corners (`styles.css:61`). That creates two competing design systems.
5. **Checks look at structure, not appearance.** A missing hero image passed. The plum color is probably a runtime default that was never themed (inferred).
6. **The planning output is sloppy:** a stray "只是" token in concept 0's imagery field (`design-direction.json:9`). Planning also runs at `reasoning: low`.

## 2. Design direction for Savia

**Color jobs** (roles are fixed, exact values are adjustable):
- `ground` `#FBF7EF`: page and panel, the same surface.
- `ink` forest `#1F3A2E`: text, primary button, selected-state border.
- `accent` orange `#E4832E`: only for small signals such as a price change, a badge or the focus ring. No more than about 3 accented elements per screen.
- `line`: ink at 14%.
- `muted`: ink at 62%.
- Sage and coral appear **only** in photos, color swatches and at most one full-width band on the home page (the video section).
- No colored panel sits behind the buy column.

**Shape and spacing:**
- One corner radius for controls (6px). Photos are square-cornered.
- 1px hairline dividers. No shadows.
- Spacing scale: 4/8/12/16/24/32/48/72.

**Product page at 1280px:**
- Content width 1240px on a 12-column grid: gallery in 7 columns, panel in 5, 56px gap.
- The gallery photo fills its column at 4:5 with no frame. A thumbnail strip shows only when there are two or more images, and there is no counter.
- The panel stays sticky, so the empty space under the gallery disappears.

**Panel order:**
1. Breadcrumb only (remove the back link).
2. Category eyebrow: 12px caps, muted.
3. Title: 600 weight, 40/44, tracking −0.02em.
4. One factual sub-line: "Acero inoxidable · tapa roscada".
5. Price row: 24px, 600 weight, tabular numbers, "desde" in small muted type.
6. Divider.
7. Option groups. The label echoes the choice ("Color — Salvia"). Colors are 36px swatches with captions. Capacity uses equal-width segments with a price sub-line ("750 ml · Bs 109").
8. Quantity and button on one row. The button label carries the live total: "Añadir al pedido — Bs 89,00".
9. One line of factual small print with an icon ("Retiro en tienda disponible").
10. A row of three icon facts taken only from catalog data.
11. Accordions for details and shipping. Never repeat the description.

**Before options are chosen:** don't show a disabled brown button. Either pre-select the default in-stock variant, if the platform allows it, or keep the button full-strength with the label "Elige color y capacidad".

**Type:** Bricolage can stay, since premium doesn't require a serif. Limit it to weights 400/600 and a scale of 12/14/16/20/24/40/64. Drop the Light 300 display weight.

**Photography:**
- Each product gets a backdrop from the palette: juice on warm orange, granola on cream, bottles on sage. The current lime-green bottle backdrop is off-palette.
- Same light direction and camera height across products.
- 3–4 real shots per product: hero, detail, in hand, in use. These should be clearly labelled as generated for the fictional brand. This is producing assets, not inventing claims.

**Useful density:** product cards on the home page show a real option summary ("3 colores · 2 capacidades"), price and a quick link. The home page opens with the photo, and the catalog starts within the first screen and a half.

**Remove:**
- the floating orange label and the shadowed overlay panel
- the colored product panels and sage frames
- the "1 / 1" counter
- duplicated navigation and duplicated description
- per-group "Elige una opción" hints
- the plum color
- the white-box "Retiro" row

**Don't mistake for premium:** an all-cream monochrome page, large empty margins, serif headings or scroll animation.

## 3. Critique of the proposed pipeline

| Step | Verdict |
|---|---|
| Evidence analysis | Keep. It must produce a **structured breakdown**: panel parts in order, surface count, accent uses, control types, photo rules. Otherwise the model repeats "warm color surfaces", which is exactly the misreading that happened. Calibrate by hand once per reference, then reuse it. |
| Semantic brand tokens | Keep, but **tokens alone are not enough**. Enforce the roles on the server: at most 2 UI surfaces, a limited number of accent uses, one radius family, at most 2 weights per family, and no raw hex values outside tokens (lint). |
| 2–3 product-page concepts | **I disagree.** Product pages should converge; buyers depend on the familiar pattern. Brand differences belong in tokens, type, photos and the home page. Replace free concepts with **2–3 layout templates chosen by rules from product data**: gallery + panel, spec-sheet for many attributes, single column for products without photos. |
| Rank instead of random | Ranking prose before rendering is guessing, and if the author model ranks its own work it will favor itself. The random pick was built to stop the planner from tailoring its favorite concept to the chosen index. Either render cheap home-page variants and rank the screenshots, or drop to one concept plus the rule-based template. |
| One fully working product slice | Highest value, **but only after the runtime markup is extended**. Test it on three option shapes: color+size, flavor+weight, no options. |
| Cross-page rollout | Fine. Checkout should be quieter: tokens only, no brand flourishes. |
| Screenshots | Capture 1280 and 390 wide, both first screen and full page, taken only after images have loaded. |
| Independent critique | Findings must cite a rubric ID and an element or region. Cap at 5 findings and treat them as advisory. |
| Bounded repair | One round, then take new screenshots and re-run the functional checks. Repairs must never touch platform-owned hooks. |
| Human-calibrated acceptance | This is the only real gate. Everything else is instrumentation. |

**Simplification:** put **automated visual lint** ahead of the AI critic. It is cheap and objective, and it would have caught most of Savia's defects:
- a first-screen image with `naturalWidth===0`
- the count of distinct computed background colors in the product area
- corner-radius variance
- the number of font weights
- a column-bottom mismatch of more than 200px
- duplicate text blocks
- button contrast in every state
- the button's vertical position at 1280×844

**Failure modes to plan for:**
- The critic misreads small or compressed screenshots.
- The critic's taste drifts toward sparse monochrome minimalism.
- Repairs churn: fixing one finding breaks another.
- The system gets tuned to Savia only.
- The critic score gets treated as truth.
- Cost grows without anyone noticing.
- Full-page 1280 screenshots hide mobile defects.
- The reference's density comes partly from reviews and subscriptions we must not fake. If you chase that density without real data, the pressure pushes toward fabrication.

## 4. Division of labor

**Codex owns:** the runtime and catalog schema, token compiler and lint, generator prompts and validation, screenshot capture, tests, the final summary of findings, and all code.

**Claude supplies:** reference breakdowns, token and photo direction per calibration merchant, critiques at milestone gates, and blind scoring alongside the human.

**Codex → Claude handoff packet:**
- 4 screenshots: 1280 and 390, first screen and full page
- the token JSON and selected template ID
- the product data shape: options, facts available, image count
- the rubric version
- the previous findings and a diff of what changed
- an explicit list of what is out of scope (platform-owned hooks)

**Claude → Codex:**
- findings with rubric ID, severity, element/region evidence, and a target in values ("panel background = ground token")
- a "keep" list, so repairs don't erase what works
- a pass/fail recommendation that states its confidence

**When disagreement stops an iteration:**
- **Stop and ask the user** if Claude marks a gate item as failed while the automated checks pass, or the reverse. Show both screenshots side by side.
- **Stop and treat it as a system problem, not a styling problem,** if the same finding comes back after one repair, or if two iterations in a row don't raise the human score.
- Claude never approves an implementation of its own direction alone. The user or a blind human scorer decides.

## 5. Weighted rubric (100 points plus gates)

**Gates** (any failure means the page fails):
- above-the-fold images render
- add to cart → checkout works with the chosen options
- buttons meet WCAG AA contrast in every state
- no clipped controls at 320px
- no invented reviews, claims or shipping promises

| ID | Criterion | Wt | Pass example | Fail example |
|---|---|---|---|---|
| C1 | Color roles | 15 | Panel on page background; accent only on selected state and button | Sage frame + coral panel + pink stepper |
| C2 | Panel hierarchy and scan order | 15 | Title → fact line → price → options → button, all visible at 1280×844 for ≤3 option groups | Button below the first screen; oversized price competing with title |
| C3 | Option controls | 15 | Swatches with captions, equal-width segments with prices, choice echoed in label | White boxes on coral; "Elige una opción" on every group |
| C4 | Spacing and alignment | 12 | Every gap on the scale; button spans the option column; columns resolve with sticky panel | 350px dead space under the gallery; helper text touching the button |
| C5 | Photos and gallery | 13 | Frameless 4:5 photo, thumbnails, backdrops from the palette | Double frame, "1/1", off-palette backdrop |
| C6 | Type system | 10 | ≤2 weights per family, a scale with ≤7 steps, tabular prices | Light 300 display next to extra-bold price |
| C7 | Useful density | 10 | Real facts row, unit and option summaries | Description repeated; empty tab content |
| C8 | Cross-page consistency | 5 | Same tokens on home, cart and checkout | Plum only on product page; mixed radii |
| C9 | Mobile | 5 | Photo → title → price → options → sticky add bar | Stacked colored blocks |

**Calibration:**
- Score anchors blind first: 2–3 reference tiles (expect ≥85), Savia before (expect ≤40), and a deliberately sparse monochrome variant. That variant must lose points on C3 and C7, or the rubric rewards emptiness.
- Compare **proportions and counts, not pixels:**
  - gallery-to-panel width ratio between 1.1 and 1.5
  - UI surfaces ≤2
  - accent elements ≤3 per screen
  - button top edge ≤844px at 1280 wide
  - ≥5 distinct information layers in the panel
- Use pairwise blind choice ("which is closer to the reference quality?") between versions rather than absolute scores.
- Trust the AI critic as more than advisory only after it agrees with human pairwise choices at least 80% of the time on 30 or more pairs.

## 6. Milestones

| # | Milestone | Effort | Depends on | Deliverable | Stop condition |
|---|---|---|---|---|---|
| M0 | Calibration set, rubric and automated visual lint; fix the gap that let a missing hero image through | 2–4 days | none | Scored anchors; lint running in Studio checks | Lint can't separate the anchors → rethink metrics before going further |
| M1 | **Extend the runtime product markup:** option descriptions and price changes, chosen value in label, thumbnails, total in button, catalog facts row, accordions, themeable states; add catalog fields for facts and option descriptions; seed Savia honestly | 5–10 days | Data model migration; checkout regression tests | New markup with stable hooks; migration; unchanged commerce tests | Any cart or payment regression → stop |
| M2 | Token schema with role constraints, compiler, no-raw-hex lint | 3–5 days | M0 | Tokens → CSS variables; lint | none |
| M3 | **Golden Savia product page, hand-built** with M1+M2 (Claude directs, Codex builds). This proves the ceiling. | 2–4 days | M1, M2 | Product page scoring ≥80 blind | Hand-built can't reach 75 → the markup or data is still the limit; go back to M1 |
| M4 | Generator: planner outputs tokens, a rule-based template and one home concept; rollout across pages | 5–8 days | M3 | Updated planner and validation | none |
| M5 | Screenshot critique plus one repair round (advisory) | 3–5 days | M0, M4 | Findings in Studio | Repairs lower the score in >25% of runs → disable automatic repair |
| M6 | Proof across merchants: ≥6 unrelated types × 3 runs (below) | 3–5 days plus human scoring | M4, M5 | Scored report with screenshots | See criteria below |

Merchant types for M6:
- coffee: grind + weight
- apparel: size + color
- bookshop: no options
- sporting goods: many specs
- bakery: modifiers
- a catalog with no photos

M6 pass criteria:
- zero gate failures
- median blind score ≥75
- ≥80% of runs ≥70
- no merchant type's median below 60
- the automated surface/accent limits respected in every run

**Total:** roughly 4–7 weeks.

## 7. First actions and things to avoid

**Three most valuable first actions:**
1. **M0:** build the calibration set and the automated lint. Promote the missing-hero-image case to a gate, because right now the most important asset can be absent and still pass.
2. **M1:** extend the runtime product markup and catalog facts. It is the ceiling on everything else.
3. **M3:** hand-build the golden Savia product page before touching prompts, to prove the target is reachable with honest data.

**Avoid:**
- adding another "browser refinement" override layer to generated CSS
- asking the planner for maximum difference between product-page concepts
- letting an AI critic block publication before agreement with humans is measured
- colored panels as brand identity, or faking reviews and subscriptions to copy the reference's density
- pixel-diffing against Amboras or copying its layouts and copy
- tuning on Savia alone
- treating Next.js/React or a higher reasoning effort as quality fixes, since neither changes the visual system
