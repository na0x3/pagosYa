<!-- After sub-project 5 (unique kit surfaces), re-run after the code review fixes. Produced by: cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --stores <the 12 baseline store ids> --out ../../tmp/scorecard/after-kit-surfaces-review (branch feature/yapi-unique-stores at e5e8a67). Screenshots and scorecard.json stay in tmp/ (gitignored). The earlier version of this file (b527537) used the unquantized metric and the pre-review kit. -->

## Read this first

- **Same 12 stores as the baseline** (`docs/research/scorecard-baseline-2026-09-24.md`), pinned with `--stores`. Every store carries its seeded DNA (none has a planner-chosen DNA yet), exactly as the public site serves it.
- **The metric now counts only visible differences.** Tracking under 0.03em, padding under 4px, lightness under 3 L* (0–100), radius under 2px and border under 0.5px count as the same; tracking, padding and lightness score on an absolute range instead of relative to tiny values (before, 0px against 1px of tracking scored 1.0). Tracking is recorded in em and background deltas in ΔL*.
- **The kit changed too.** The store's own CSS now wins over the DNA (cascade layers), primary pay and checkout buttons keep their size and fill in every form, and the second photo loads on demand. Where a store styled its own buttons, cart or notice, the DNA no longer overrides it, so those facts follow the store, not the DNA.
- **Headline: the ≥ 0.25 target is not met.** With the quantized metric the closest pair is 0.22 (button), 0.20 (cart), 0.26 (added), 0.16 (review) and 0.23 (card). Only the added-to-cart confirmation clears 0.25. No store is too close to the kit default on any of the five (baseline: 12 of 12 on cart, 10 of 10 on added and review, 9 of 10 on card).

| Surface | Closest pair: baseline → after (quantized) | Mean: baseline → after | Stores too close to another store | Too close to the default: baseline → after |
|---|---|---|---|---|
| button | 0.05 → 0.22 (Trama r2 ↔ Pliegue qhxug) | 0.44 → 0.49 | 4 | 0 → 0 |
| cart | 0.00 → 0.20 (The red ↔ cuadraa) | 0.00 → 0.51 | 2 | 12 of 12 → 0 |
| added | 0.00 → 0.26 (cuadraa ↔ BookShelf) | 0.03 → 0.50 | 0 | 10 of 10 → 0 |
| review | 0.00 → 0.16 (The red ↔ cuadraa) | 0.00 → 0.44 | 4 | 10 of 10 → 0 |
| card | 0.01 → 0.23 (cuadraa ↔ Punto r2) | 0.21 → 0.47 | 2 | 9 of 10 → 0 |

  Baseline figures are the baseline's own samples scored with the quantized metric (they were 0.07 / 0.00 / 0.01 / 0.00 / 0.01 closest under the old one).

- **Kit-DNA-only distance** (only the DNA-driven kit variants: button form, cart placement, added style, review layout, card mode, image frame; the share of the six two stores do not have in common): closest pair **0.33** (The red ↔ cuadraa), mean **0.78**. Of the 66 store pairs, these still share a kit variant: cart placement 25, review layout 23, added style 13, frame 11, card mode 9, button form 8. With 4 cart and 4 review values across 12 stores, shared placements are unavoidable; what separates those pairs is form, colour and type.
- **Why the previous version said 0.26–0.29.** Scoring this run's samples with the old metric gives 0.27 / 0.25 / 0.26 / 0.21 / 0.29: part of the drop is the review fixes (the store's own button and panel styling now wins, and pay buttons no longer take the form's padding), the rest is the quantization, which stops counting imperceptible tracking, padding and tint differences. The previous run scored with the quantized metric (its tracking still in px) gives 0.29 / 0.21 / 0.26 / 0.24 / 0.34.
- **The closest pairs share most of their DNA.** The red and cuadraa both have a ghost button, round radius, no border, polaroid frame, bottom-sheet cart and stacked dense review; their cart and review differ only in typeface, title case, button radius and accent. Trama r2 and Pliegue qhxug share the bold border, bleed frame, sheet cart, inline notice and zoom card. The kit draws the same DNA the same way; keeping DNAs apart is sub-project 4's diversity memory, and these are seeded DNAs, not planner choices.
- **Quality: 1 of 12 fails.** The red's buy button is 4.41:1, the same as the baseline. The previous after-run showed it fixed only because the DNA overrode the store's own button; the store's CSS now wins, so its own contrast shows again. The two missing-image flags a first re-run showed came from the deferred second photo (no src until the shopper reaches the card); the collector no longer counts an image without a source as missing.
- **Not targets here:** product (0.00: same page style and buy form), type and page are unchanged by this sub-project; motion runs statically (reduced-motion sandbox), so tilt and transitions are not measured. The Bake Lab and GROUND UP have no product card on the home, so button, added, review and card are not measured for them.

# Uniqueness and quality scorecard — 2026-09-25

Created 2026-09-25 from the local database (latest revision of the chosen stores; seeded DNA applied as the public site serves it). 12 stores. No model calls.

Thresholds: MIN_PAIR_DISTANCE = 0.25, MIN_DEFAULT_DISTANCE = 0.25, MIN_BUY_CONTRAST = 4.5.
Distance is 0 (identical) to 1 (nothing shared), the mean over the facts measured on that surface at 1280 and 390.

## Uniqueness by surface

| Surface | Measured | Closest pair | Distance | Mean | Too close to another store | Too close to the kit default | Missing |
|---|---|---|---|---|---|---|---|
| button | 10 | Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug | 0.22 | 0.49 | 4: BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| cart | 12 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.20 | 0.51 | 2: The red · r1 · qs7ph, cuadraa · r8 · 7381t | 0: — | — |
| added | 10 | cuadraa · r8 · 7381t ↔ BookShelf · r10 · 7s0hz | 0.26 | 0.50 | 0: — | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| product | 10 | BookShelf · r10 · 7s0hz ↔ Pliegue · r1 · qhxug | 0.00 | 0.40 | 8: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Pliegue · r1 · qhxug | 1: Trama · r2 · 0v7g7 | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| review | 10 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.16 | 0.44 | 4: The red · r1 · qs7ph, cuadraa · r8 · 7381t, Pliegue · r1 · uixh5, Trama · r1 · c8jv6 | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| card | 10 | cuadraa · r8 · 7381t ↔ Punto · r2 · tf6s4 | 0.23 | 0.47 | 2: cuadraa · r8 · 7381t, Punto · r2 · tf6s4 | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| type | 12 | Punto · r1 · z555j ↔ Trama · r1 · c8jv6 | 0.00 | 0.41 | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, The Bake Lab · r4 · 3jv51, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | 0: — | — |
| page | 12 | Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug | 0.53 | 0.74 | 0: — | 9: The Bake Lab · r4 · 3jv51, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | — |

## Kit DNA only

Distance over the DNA-driven kit variants only (button, cart, added, review, card, frame): the share of them two stores do not have in common. Authored styling, typefaces and measured sizes do not count.

Measured: 12. Closest pair: The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t at 0.33. Mean: 0.78.

| Kit variant | Pairs that share it |
|---|---|
| button | 8: The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t; The red · r1 · qs7ph ↔ Punto · r1 · z555j; cuadraa · r8 · 7381t ↔ Punto · r1 · z555j; BookShelf · r10 · 7s0hz ↔ Punto · r2 · tf6s4; BookShelf · r10 · 7s0hz ↔ Pliegue · r1 · qhxug; Pliegue · r1 · uixh5 ↔ Trama · r1 · c8jv6; Bruma · r1 · mw1wz ↔ GROUND UP · r1 · 3f6gi; Punto · r2 · tf6s4 ↔ Pliegue · r1 · qhxug |
| cart | 25: The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t; The red · r1 · qs7ph ↔ Bruma · r1 · mw1wz; The red · r1 · qs7ph ↔ Punto · r2 · tf6s4; The red · r1 · qs7ph ↔ Trama · r2 · 0v7g7; The red · r1 · qs7ph ↔ Pliegue · r1 · qhxug; cuadraa · r8 · 7381t ↔ Bruma · r1 · mw1wz; cuadraa · r8 · 7381t ↔ Punto · r2 · tf6s4; cuadraa · r8 · 7381t ↔ Trama · r2 · 0v7g7; cuadraa · r8 · 7381t ↔ Pliegue · r1 · qhxug; BookShelf · r10 · 7s0hz ↔ The Bake Lab · r4 · 3jv51; BookShelf · r10 · 7s0hz ↔ Pliegue · r1 · uixh5; BookShelf · r10 · 7s0hz ↔ Punto · r1 · z555j; BookShelf · r10 · 7s0hz ↔ Trama · r1 · c8jv6; The Bake Lab · r4 · 3jv51 ↔ Pliegue · r1 · uixh5; The Bake Lab · r4 · 3jv51 ↔ Punto · r1 · z555j; The Bake Lab · r4 · 3jv51 ↔ Trama · r1 · c8jv6; Pliegue · r1 · uixh5 ↔ Punto · r1 · z555j; Pliegue · r1 · uixh5 ↔ Trama · r1 · c8jv6; Punto · r1 · z555j ↔ Trama · r1 · c8jv6; Bruma · r1 · mw1wz ↔ Punto · r2 · tf6s4; Bruma · r1 · mw1wz ↔ Trama · r2 · 0v7g7; Bruma · r1 · mw1wz ↔ Pliegue · r1 · qhxug; Punto · r2 · tf6s4 ↔ Trama · r2 · 0v7g7; Punto · r2 · tf6s4 ↔ Pliegue · r1 · qhxug; Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug |
| added | 13: The red · r1 · qs7ph ↔ Bruma · r1 · mw1wz; The red · r1 · qs7ph ↔ GROUND UP · r1 · 3f6gi; cuadraa · r8 · 7381t ↔ BookShelf · r10 · 7s0hz; cuadraa · r8 · 7381t ↔ Pliegue · r1 · uixh5; BookShelf · r10 · 7s0hz ↔ Pliegue · r1 · uixh5; The Bake Lab · r4 · 3jv51 ↔ Punto · r2 · tf6s4; Punto · r1 · z555j ↔ Trama · r1 · c8jv6; Punto · r1 · z555j ↔ Trama · r2 · 0v7g7; Punto · r1 · z555j ↔ Pliegue · r1 · qhxug; Bruma · r1 · mw1wz ↔ GROUND UP · r1 · 3f6gi; Trama · r1 · c8jv6 ↔ Trama · r2 · 0v7g7; Trama · r1 · c8jv6 ↔ Pliegue · r1 · qhxug; Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug |
| review | 23: The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t; The red · r1 · qs7ph ↔ Pliegue · r1 · uixh5; The red · r1 · qs7ph ↔ Punto · r1 · z555j; The red · r1 · qs7ph ↔ Trama · r1 · c8jv6; The red · r1 · qs7ph ↔ Trama · r2 · 0v7g7; The red · r1 · qs7ph ↔ GROUND UP · r1 · 3f6gi; cuadraa · r8 · 7381t ↔ Pliegue · r1 · uixh5; cuadraa · r8 · 7381t ↔ Punto · r1 · z555j; cuadraa · r8 · 7381t ↔ Trama · r1 · c8jv6; cuadraa · r8 · 7381t ↔ Trama · r2 · 0v7g7; cuadraa · r8 · 7381t ↔ GROUND UP · r1 · 3f6gi; BookShelf · r10 · 7s0hz ↔ Bruma · r1 · mw1wz; The Bake Lab · r4 · 3jv51 ↔ Punto · r2 · tf6s4; Pliegue · r1 · uixh5 ↔ Punto · r1 · z555j; Pliegue · r1 · uixh5 ↔ Trama · r1 · c8jv6; Pliegue · r1 · uixh5 ↔ Trama · r2 · 0v7g7; Pliegue · r1 · uixh5 ↔ GROUND UP · r1 · 3f6gi; Punto · r1 · z555j ↔ Trama · r1 · c8jv6; Punto · r1 · z555j ↔ Trama · r2 · 0v7g7; Punto · r1 · z555j ↔ GROUND UP · r1 · 3f6gi; Trama · r1 · c8jv6 ↔ Trama · r2 · 0v7g7; Trama · r1 · c8jv6 ↔ GROUND UP · r1 · 3f6gi; Trama · r2 · 0v7g7 ↔ GROUND UP · r1 · 3f6gi |
| card | 9: The red · r1 · qs7ph ↔ Trama · r1 · c8jv6; cuadraa · r8 · 7381t ↔ Punto · r1 · z555j; BookShelf · r10 · 7s0hz ↔ Pliegue · r1 · uixh5; BookShelf · r10 · 7s0hz ↔ Bruma · r1 · mw1wz; BookShelf · r10 · 7s0hz ↔ GROUND UP · r1 · 3f6gi; Pliegue · r1 · uixh5 ↔ Bruma · r1 · mw1wz; Pliegue · r1 · uixh5 ↔ GROUND UP · r1 · 3f6gi; Bruma · r1 · mw1wz ↔ GROUND UP · r1 · 3f6gi; Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug |
| frame | 11: The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t; The red · r1 · qs7ph ↔ Punto · r1 · z555j; The red · r1 · qs7ph ↔ Punto · r2 · tf6s4; cuadraa · r8 · 7381t ↔ Punto · r1 · z555j; cuadraa · r8 · 7381t ↔ Punto · r2 · tf6s4; BookShelf · r10 · 7s0hz ↔ Bruma · r1 · mw1wz; BookShelf · r10 · 7s0hz ↔ Trama · r1 · c8jv6; The Bake Lab · r4 · 3jv51 ↔ GROUND UP · r1 · 3f6gi; Punto · r1 · z555j ↔ Punto · r2 · tf6s4; Bruma · r1 · mw1wz ↔ Trama · r1 · c8jv6; Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug |

## Quality

1 of 12 stores have at least one quality failure.

| Store | Shopping | Failures |
|---|---|---|
| The red · r1 · qs7ph | passed | buy button contrast 4.41 < 4.5 |
| cuadraa · r8 · 7381t | passed | — |
| BookShelf · r10 · 7s0hz | passed | — |
| The Bake Lab · r4 · 3jv51 | unsupported | — |
| Pliegue · r1 · uixh5 | passed | — |
| Punto · r1 · z555j | passed | — |
| Bruma · r1 · mw1wz | passed | — |
| Trama · r1 · c8jv6 | passed | — |
| Punto · r2 · tf6s4 | passed | — |
| Trama · r2 · 0v7g7 | passed | — |
| GROUND UP · r1 · 3f6gi | unsupported | — |
| Pliegue · r1 · qhxug | passed | — |

## Per store

| Store | Too close to another store on | Too close to the kit default on |
|---|---|---|
| The red · r1 · qs7ph | cart, product, review, type | — |
| cuadraa · r8 · 7381t | cart, product, review, card, type | — |
| BookShelf · r10 · 7s0hz | button, product | — |
| The Bake Lab · r4 · 3jv51 | type | page |
| Pliegue · r1 · uixh5 | button, product, review | page |
| Punto · r1 · z555j | type | page |
| Bruma · r1 · mw1wz | product, type | page |
| Trama · r1 · c8jv6 | product, review, type | page |
| Punto · r2 · tf6s4 | product, card, type | page |
| Trama · r2 · 0v7g7 | button, type | product, page |
| GROUND UP · r1 · 3f6gi | type | page |
| Pliegue · r1 · qhxug | button, product, type | page |

## After the free-CSS layer (sub-project 7), 2026-09-25

Re-run on the same 12 store ids (`--stores`, out `tmp/scorecard/after-free-css`, branch feature/yapi-unique-stores at f030662). None of these stores has kit CSS yet. The one runtime change that reaches them is the contrast guard in `commerce.js`: it holds pay and buy buttons and totals at 4.5:1.

- **Quality: 0 of 12 stores fail (was 1 of 12).** The red's buy button goes from 4.41 to 4.76:1. The failing control is the product page's buy button. It is white on a mid-tone accent, and no near-black or white text reaches 4.5 on that accent (`#111` gives about 4.3). The guard switched its label to pure black, the first candidate that reads (after the store's own ink, paper and on-accent). On this store's own CSS, the guard's first version made no change: it ran on a 120ms timer, after the collector had already measured, and it treated the DNA underline-grow hover (a zero-size gradient at rest) as an unknown background. Both are fixed: the guard now runs as the controls render, and it looks through DNA line and shine decorations.
- Every other store's buy contrast is unchanged (5.09–14.15), and so is uniqueness: the closest pairs, means and too-close-to-default counts are the same as the table above, and the kit-DNA-only closest pair is still 0.33 with a mean of 0.78.

### After the sub-project 7 review fixes, 2026-09-25

Re-run on the same 12 ids (`--stores`, out `tmp/scorecard/after-free-css-review`). The guard now sets its colour through a first-layer rule that yields on hover and focus, measures against the page canvas, and skips labels over pseudo-elements, backdrop filters and photos. The contrast passes also go idle.

- **Quality: still 0 of 12 stores fail.** Every buy contrast is unchanged, from The red's 4.76 to 14.15.
- **Uniqueness is unchanged, except one timing artefact.** In this run, Pliegue uixh5's mobile press transform read `none` instead of its 4px press, so the button closest pair became BookShelf ↔ Pliegue uixh5 at 0.20 (it was 0.22). Two single-store re-runs read the 4px press again. The press is sampled mid-transition, so this is measurement noise, not a change.
