<!-- After sub-project 5 (unique kit surfaces). Produced by: cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --stores <the 12 baseline store ids> --out ../../tmp/scorecard/after-kit-surfaces (branch feature/yapi-unique-stores at f8bd955). Screenshots and scorecard.json stay in tmp/ (gitignored). -->

## Read this first

- **Same stores as the baseline** (`docs/research/scorecard-baseline-2026-09-24.md`): the run pins the baseline's 12 store ids with `--stores`, because "the 12 most recently updated" had changed since. Every store carries its seeded DNA (none has a planner-chosen DNA yet), exactly as the public site serves it.
- **Headline:** on cart, added-to-cart, checkout review, product card and buttons, the closest pair is now 0.26 to 0.29 (target ≥ 0.25) and no store is too close to the kit default (target 0). Quality: 0 of 12 stores fail (the baseline's one contrast failure, The red at 4.41, is gone because its buttons now take the store's accent pair).

| Surface | Closest pair, before → after | Mean, before → after | Too close to the default, before → after |
|---|---|---|---|
| button | 0.07 → 0.28 | 0.43 → 0.52 | 0 → 0 |
| cart | 0.00 → 0.26 | 0.00 → 0.60 | 12 of 12 → 0 |
| added | 0.01 → 0.26 | 0.09 → 0.50 | 10 of 10 → 0 |
| review | 0.00 → 0.27 | 0.00 → 0.52 | 10 of 10 → 0 |
| card | 0.01 → 0.29 | 0.21 → 0.52 | 9 of 10 → 0 |

- **Caveat: the collector measures more facts now.** Sub-project 5 extended it so each surface records what the DNA variants change: borders, photo and stepper radius, the form of the button inside the surface, press, hover preview, swatches, summary paint and edge, padding, and the typeface, case and tracking of the surface's title. The typeface is not DNA-driven for authored fonts, but a cart in another typeface is visibly a different design. Measured on the **baseline's fact set only**, the after-run gives closest pair / mean / too close to the default: button 0.12 / 0.45 / 0, cart 0.02 / 0.44 / 0, added 0.03 / 0.40 / 0, review 0.00 / 0.22 / 3, card 0.03 / 0.36 / 1. The baseline facts are mostly placement, and with 4–6 variants per surface over 12 stores, some stores always share a variant. Those pairs are identical on placement and differ only in form.
- **Closest remaining pairs share most of their DNA.** For example, The red and cuadraa both drew a ghost button, round radius, no border, a polaroid frame, a bottom-sheet cart and a stacked, dense review. The kit renders the same DNA the same way. Keeping DNAs apart is sub-project 4's diversity memory.
- **Not targets here:** product (0.00, same page style and buy form), type and page are unchanged by this sub-project; motion runs statically (reduced-motion sandbox), so tilt and transitions are not measured.

# Uniqueness and quality scorecard — 2026-09-25

Created 2026-09-25 from the local database (latest revision of the chosen stores; seeded DNA applied as the public site serves it). 12 stores. No model calls.

Thresholds: MIN_PAIR_DISTANCE = 0.25, MIN_DEFAULT_DISTANCE = 0.25, MIN_BUY_CONTRAST = 4.5.
Distance is 0 (identical) to 1 (nothing shared), the mean over the facts measured on that surface at 1280 and 390.

## Uniqueness by surface

| Surface | Measured | Closest pair | Distance | Mean | Too close to another store | Too close to the kit default | Missing |
|---|---|---|---|---|---|---|---|
| button | 10 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.28 | 0.52 | 0: — | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| cart | 12 | cuadraa · r8 · 7381t ↔ Pliegue · r1 · qhxug | 0.26 | 0.60 | 0: — | 0: — | — |
| added | 10 | Pliegue · r1 · uixh5 ↔ Trama · r1 · c8jv6 | 0.26 | 0.50 | 0: — | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| product | 10 | Pliegue · r1 · uixh5 ↔ Trama · r1 · c8jv6 | 0.00 | 0.41 | 8: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Pliegue · r1 · qhxug | 1: Trama · r2 · 0v7g7 | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| review | 10 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.27 | 0.52 | 0: — | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| card | 10 | The red · r1 · qs7ph ↔ Punto · r1 · z555j | 0.29 | 0.52 | 0: — | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| type | 12 | Punto · r1 · z555j ↔ Trama · r1 · c8jv6 | 0.00 | 0.41 | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, The Bake Lab · r4 · 3jv51, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | 0: — | — |
| page | 12 | Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug | 0.53 | 0.74 | 0: — | 9: The Bake Lab · r4 · 3jv51, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | — |

## Quality

0 of 12 stores have at least one quality failure.

| Store | Shopping | Failures |
|---|---|---|
| The red · r1 · qs7ph | passed | — |
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
| The red · r1 · qs7ph | product, type | — |
| cuadraa · r8 · 7381t | product, type | — |
| BookShelf · r10 · 7s0hz | product | — |
| The Bake Lab · r4 · 3jv51 | type | page |
| Pliegue · r1 · uixh5 | product | page |
| Punto · r1 · z555j | type | page |
| Bruma · r1 · mw1wz | product, type | page |
| Trama · r1 · c8jv6 | product, type | page |
| Punto · r2 · tf6s4 | product, type | page |
| Trama · r2 · 0v7g7 | type | product, page |
| GROUND UP · r1 · 3f6gi | type | page |
| Pliegue · r1 · qhxug | product, type | page |
