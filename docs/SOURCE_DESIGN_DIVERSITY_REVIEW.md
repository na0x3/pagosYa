# Generated-site diversity review — September 9, 2026

Method: dual-agent (A: /root/design_review · B: /root/design_evidence). Design judgment completed before detector findings entered synthesis. Parent independently inspected saved desktop/mobile screenshots and current generation code.

## Verdict

**More freedom is visible, but the saved designs do not vary enough to demonstrate distinct visual identities.** Product presentation changes materially; the overall page story and typographic language remain closely related. The strongest actionable finding is a mismatch between the chosen concept and the generated page.

This review uses four existing generation attempts, producing three saved café sites. All used one model, the same short synthetic café brief, three products, no photography, and unrestricted visual direction. All three saved directions selected index `1`. This is evidence about these outputs, not a statistical measure of the generator or a comparison of all three concept positions. No new generation was requested during this review.

## Compared outputs

| Saved site | What varies | What remains familiar | Concept fidelity |
|---|---|---|---|
| Earlier 1 — Patio a media mañana | Terracotta opening, yellow disc, three colored product panels | Large serif hero → catalog → neighborhood band → footer | Partial: proposed broad menu rows became cards |
| Earlier 2 — Pizarra de patio | Cream poster, cropped sun, order sidebar, full-width rows and rust purchase bars | Same page sequence, serif/sans pairing and pause messaging | Partial: promised catalog in the opening and vertical brand strip are absent |
| Latest 1 — La pizarra del patio | Dark green opening, circular CTA, textured menu rows and lime closing | Same page sequence and editorial café language | Selected “Sin hero independiente” conflicts with a substantial `.chalk-intro` section |

Desktop evidence: [earlier 1](../tmp/source-design-diversity-20260909/cafe-gpt-5.6-terra-1/recheck-create-desktop.png), [earlier 2](../tmp/source-design-diversity-20260909/cafe-gpt-5.6-terra-2/recheck-create-desktop.png), [latest](../tmp/source-design-final-20260909/cafe-gpt-5.6-terra-1/create-desktop.png).

Mobile evidence: [earlier 1](../tmp/source-design-diversity-20260909/cafe-gpt-5.6-terra-1/recheck-create-mobile.png), [earlier 2](../tmp/source-design-diversity-20260909/cafe-gpt-5.6-terra-2/recheck-create-mobile.png), [latest](../tmp/source-design-final-20260909/cafe-gpt-5.6-terra-1/create-mobile.png).

The latest source was saved after the current exploration prompt's modification time. Earlier samples precede that tightening. Timestamps support this chronology; the benchmark does not preserve an exact prompt hash for each run.

Fresh browser measurements at 390 × 844 place the live catalog at y=905, y=1028 and y=692 respectively. The latest therefore brings the first purchasable product into the mobile opening viewport. That is real improvement, even though it still contradicts the separate promise to dispense with a standalone hero. At desktop 1440 × 756, the corresponding catalog positions are y=1159, y=1231 and y=820. All three use computed Georgia/Arial families and fit the measured mobile width.

## What works

- Custom commerce templates produce genuinely different product arrangements: colored panels versus compact menu rows.
- The latest green, cream and lime treatment is coherent, with readable names, prices and add controls on mobile.
- The pages have shorter, more purposeful section sequences than the old five-section café baseline. Missing photographs are not replaced with fabricated product imagery on the homepage.

## Priority findings

1. **P1 — The selected concept is not reliably implemented.** The latest saved direction promises no independent hero and an immediately prominent catalog. Its HTML instead places `.chalk-intro` before `.menu-section`; mobile also hides the promised visible Pedido inside Menú. Compare the rendered opening and mobile navigation against the selected direction before accepting design quality. Suggested workflow: `/impeccable shape`, then `/impeccable adapt` for the mobile control.
2. **P2 — Repeated structure survives the new freedom.** All three resemble the same editorial café family after ignoring palette: big serif introduction, separate menu, neighborhood statement. Circles, suns, cream surfaces and generic pause language recur. Review anonymized page silhouettes and product placement; additional colors or ornament alone do not resolve this. Suggested workflow: `/impeccable critique` with explicitly contrasting concepts.
3. **P2 — The evidence set does not cover the claimed exploration space.** Indexes 0 and 2 have no saved implementations here. The fourth attempt failed the source contract, so it supplies no visual evidence. A future bounded benchmark should deliberately cover all three indexes for a repeated brief and include different businesses and a photo-rich brief. Keep production selection separate from deterministic benchmark coverage.
4. **P2 — Polish falls away outside the homepage.** The latest product page devotes substantial mobile space to a missing-photo gallery; an empty dark status rectangle is visible in saved page screenshots. Hide the empty status surface and use a compact text-led product layout when photos are absent. Suggested workflows: `/impeccable distill` and `/impeccable polish`.

## Why the checks do not establish originality

[`source-design.ts`](../apps/api/src/stores/source-design.ts) samples a concept index and validates complete metadata plus unequal normalized opening/flow strings. It does not compare the concept with the resulting HTML or rendered page. Different wording can describe similar compositions.

[`source-shopping-probe.ts`](../apps/merchant-studio/src/source-shopping-probe.ts) has useful advisory checks for empty sections, unmatched catalog selectors and invalid custom templates. Those checks do not measure composition diversity or adherence to a chosen opening. Preserve the functional checks and add concept-fidelity review as a separate assessment; avoid presenting a string comparison or arbitrary originality score as visual proof.

## Bounded usability assessment

Assessment A scored the latest home and companion purchase surfaces **24/40**. This is qualitative, with some judgments based on source inspection; it is not conversion evidence or a full accessibility/payment audit.

| Heuristic | /4 | Main observation |
|---|---:|---|
| System status | 3 | Quantity and add feedback work; empty status surface remains visible |
| Match to real world | 3 | Spanish café terms and BOB prices; incomplete fulfillment fixture |
| User control | 3 | Cart close, quantity and continue-shopping controls |
| Consistency | 2 | Homepage identity weakens on product and checkout pages |
| Error prevention | 3 | Guards exist in source; edge paths not exercised |
| Recognition | 2 | Mobile cart hidden inside Menú |
| Efficiency | 3 | Quick add and direct product links |
| Aesthetic restraint | 2 | Strong hierarchy, excessive opening and missing-photo space |
| Error recovery | 2 | Recovery exists in source; failure scenarios not exercised |
| Help | 1 | Synthetic fixture lacks usable fulfillment information |

Customer implications: returning mobile shoppers must find their basket inside Menú; first-time buyers encounter missing fulfillment information; assistive-technology users hear decorative symbols in product links. Three product choices create little decision load. The main burden is unnecessary scrolling and uncertainty at later purchase steps. Missing delivery configuration belongs to this synthetic fixture and is not evidence that the generator removed real merchant data.

## Verification and limits

Assessment B's bundled detector returned **zero findings on each of the three distinct generated homepages**. Manual/browser inspection still found the empty status surfaces, repeated composition and missing-photo layout. There were no detector false positives. Source-generated sites explicitly permit textures and font pairings; older shared storefront flat-background/single-font guidance was not treated as a binding constraint here. Reintroducing those restrictions would conflict with this task's design freedom.

Browser inspection used fresh tabs, rendered screenshots and read-only DOM/computed-style evidence. The browser API disallows mutation through evaluate, so no detector overlay was injected or claimed. Both reviewers closed their own tabs, restored the viewport override and stopped temporary servers. Detailed evidence: [Assessment B](../tmp/design-diversity-review-evidence.md), [detector output](../tmp/design-diversity-detector-evidence.json), [rendered measurements](../tmp/design-diversity-browser-evidence.json).

Saved benchmark records report all three sites passing simulated checkout after the first site's runtime replay fix. The fourth generation was rejected and saved no revision. These are historical functional results, distinct from this review's fresh visual inspection and local add/open-cart check. No real payments or merchant changes occurred.

The next useful acceptance question is concrete: **does a selected catalog-first concept actually open with purchasable products, and remain recognizably different when its color and headline are removed?** Establish that before claiming the generator now reliably produces distinct sites.
