# Review of Codex's premium storefront plan (after my critique)

## 1. Corrections I accept, and where I disagree

**1. Hero capture: accepted.** The loaded screenshot shows the hero photo, the product bottles and the cart icon. I was wrong to say the hero was absent; that came from a capture taken before the page loaded. The plan should make "capture only when ready" a written rule, not just a lesson learned. The loaded screenshot still shows two smaller issues:
- The cart label reads "Mi pedido ( 0 )", with spaces inside the parentheses.
- The orange "Jugo naranja + jengibre" tag still floats in the bottom-right corner.

**2. Existing runtime features: mostly accepted.** In `commerce.js` I confirmed:
- `galleryImages()` (lines 122–129) combines product and variant images, and thumbnails appear when there is more than one image (line 321).
- Choosing an option updates the selected-value text and the price (lines 298–299).
- Variant images are looked up when an option is clicked (lines 973–974).

I did not read `updateQuantity`, so I haven't confirmed the quantity or subtotal behavior. But several defects I blamed on generated code actually come from this shared runtime, and the plan never assigns them to anyone:
- **"1 / 1" counter:** the `data-product-count` counter is rendered even when there is only one image (line 321).
- **Duplicated description:** it appears once as `product-detail__intro` and again in the Descripción tab (lines 321, 337).
- **"Elige una opción":** the runtime puts this text in every group's legend by default (lines 270, 299).
- **Disabled buy button:** the purchase button starts disabled and nothing is pre-selected (lines 295, 321).
- **Color photo only after every choice:** clicking an option clears all later choices (line 970), and `selectedVariant()` returns null until every group has a value. So choosing a color alone shows photo 0 instead of that color's photo. This is from reading the code; I haven't reproduced it.
- **Plain option buttons:** they show only the value and a swatch, with no description or price difference (line 272). The buy button text never changes from "Añadir al pedido".
- **Delivery links:** the delivery buttons carry a "↗" and just switch tabs (line 267).

So Codex is right that not every gap comes from missing markup. It is also true that about half of the product-page problems I listed are defaults in this shared runtime file.

**3. A working slice before a schema migration: accepted.** Some things that make the references look dense need no new data. Per-option price differences ("+Bs 20") and the total in the button can be calculated from existing variants. Only a facts row and option descriptions need new fields.

**4. No universal hard limits: accepted.** The Grove & Glass image disproves my own rule. It uses a green top bar, a red badge, white option cards on cream and dark green for the selected option, and it still looks premium. On contrast, WCAG 1.4.3 does exempt inactive controls, so the plan should not call a disabled button an AA violation. The real problem is that the first thing a shopper sees is a disabled primary button, and that is a design decision.

I would still keep those counts as **reported measurements**, not pass/fail gates: number of surfaces, set of corner radii, number of font weights, duplicate text blocks, and where the button sits at 1280×844. Giving the critic numbers is cheap and reduces misreadings.

**5. Two candidates within a familiar layout: accepted.** However, step 3 of section 6 still says "Create two visual directions" as if that runs every time. It should say this happens during calibration, or when the brief is genuinely ambiguous.

**6. Roles: accepted, with one condition.** When Codex wrote the candidates, it should not also settle aesthetic disagreements about them on its own. A blind pairwise comparison, or the user's calibrated choices, should break those ties.

## 2. The most consequential remaining weaknesses

**A. The plan blames generated CSS but not the shared runtime.** Section 3 has the dead-selector finding but none of the runtime defaults listed above. The risk is that M1 polishes Savia with another stylesheet in `examples/savia`, which is exactly the patch-layer pattern the plan criticizes.

Add a rule: any M1 fix for a defect that every store would have goes into `commerce.js` or `commerce-pages.css`, never into Savia's own CSS. This is also the cheapest win across all merchants, because it needs no generator work.

**B. Photography has no owner, budget or milestone.** The only thing I can see in all three images that clearly separates the references from Savia is a set of 4 consistent photos per product. Examples: Grove & Glass shows the bottle alone, the bottle with oranges, a label close-up and a group shot; Tideform shows different angles of the kayak. Savia has one composite photo per product.

Section 4 describes a shot list, but no milestone produces the photos, checks that they match each other, or links them to variants. If the two M1 candidates use the current single photos, they will mostly be comparing typography around the same weak gallery.

**C. M1's exit condition cannot be tested.** "Visibly resolves the current failures" doesn't say who judges or against what. The 85/100 target has no scored examples to anchor it before M1. Fix this with one short user session: show both candidates next to one reference image, at 1280 and 390 px, first screen plus the selected state. The user picks, and that choice becomes the first scoring anchor. That is the one consequential taste decision the user should make.

**D. The capability boundary is still vague.** The references look rich largely because of reviews, subscriber counts, subscriptions, delivery-day choices and bundle discounts. The plan forbids faking these, but it doesn't say which displays the runtime can truthfully support: option sub-lines, per-option price differences, unit prices, a facts row. Without that list, the generator will either leave these areas empty or hint at features that don't exist.

Keep a small capability list in the component contract, and give each entry one of three statuses: supported, computable from existing data, or needs data.

**E. The effort estimate combines two projects.** Section 3 of this review covers the split.

## 3. Sequence and effort

My read is that 12–20 days does not cover M0–M6:
- **M5** (durable stages, job leases, resuming from checkpoints, critique records) is infrastructure work. Two to three days is tight.
- **M6** is 36 generation runs plus blind pairwise human review, and the estimate leaves out that human time.
- **Hosted parity** means bringing the design into a separate checkout app (`needsOptionsForm`), which could be larger than 2–3 days.

These are judgments, not measurements.

**Narrow scope, about 9–12 days:**
- M0 with the capture-readiness rule.
- Runtime fixes for the defaults in section 1.
- Computed option price differences and the total in the button.
- The Savia photo set.
- M1 and the user calibration session.
- M2 limited to tokens and component examples for bottle, juice and granola.
- M3 hosted parity for supported variants.
- The smallest useful part of M4: a product-first brief, and random selection replaced by one direction plus rules.
- A small held-out trial: 3 merchants × 2 runs.

**Broader follow-up, about 10–15 days:**
- Durable job stages and leases.
- Automated critique and repair.
- The full 36-run benchmark.
- New fields for facts and option descriptions, only where the trial showed gaps.
- Feature-flagged rollout.

A realistic total is 19–27 days. Present the narrow scope as the promised result and the follow-up as conditional on it succeeding.

## 4. Exact changes to the plan

1. **Section 3:** add a "runtime defaults" row listing the line-level defects from section 1, owned by the runtime and not the generator.
2. **Section 4:** add a photography deliverable. Aim for 3–4 matching photos per Savia product, clearly labelled as generated for a fictional brand, with variant links recorded. It is an M1 prerequisite.
3. **Section 6, step 3:** make the two candidates conditional (calibration or ambiguity only).
4. **Section 7:** add a capability list, and a rule that the photo follows the color as soon as a color is chosen, even before other options.
5. **Section 9:**
   - Add a capture protocol: every above-the-fold image has `img.complete && naturalWidth > 0`, `document.fonts.ready` has resolved, the network is idle, and the check result is saved with each screenshot.
   - Rewrite the disabled-state line to require readable disabled states without calling them AA violations.
   - Add the counts from section 1 as reported diagnostics.
6. **Section 10:** split the work into the narrow scope and the follow-up; add human review time to M6.
7. **Section 5:** Codex does not settle aesthetic disputes about its own candidates without a blind comparison.

## 5. Revised first three days

**Day 1**
- Write the capture-readiness script and recapture baselines of the home, bottle and juice pages at 1280 and 390 px, default and selected states.
- List the product fields the runtime renders today and the options each product actually has.
- Write the capability list.
- Fix the runtime defaults:
  - Hide the counter when there is one image.
  - Drop the duplicate description.
  - Use a neutral placeholder in the option legends.
  - Show the color photo after a color is chosen alone.
  - Restyle the delivery row.
  - Clean up the "Mi pedido" label and the stray homepage tag.
  - Leave a clear first state for the buy button.
- Rerun the existing commerce tests.

**Day 2**
- Produce and link the Savia photo set.
- Add the per-option price differences and the live total in the button, both calculated from existing variants.
- Build two bottle-page candidates in shared runtime CSS and tokens, not Savia's stylesheet, using the same data and photos.

**Day 3**
- Claude does a blind critique of both candidates alongside one reference image.
- The user picks one direction.
- Codex applies the top three findings to the juice page, checks that the hosted checkout route keeps the design, and records the chosen direction as the first scoring anchor.
