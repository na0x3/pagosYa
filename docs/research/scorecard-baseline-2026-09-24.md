<!-- Baseline for sub-projects 4–7. Produced by: cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --limit 12 --out ../../tmp/scorecard/baseline-2026-09-24 (branch feature/yapi-unique-stores at 491932d). Screenshots and scorecard.json stay in tmp/ (gitignored). -->

## Read this first

- **Store set:** the 12 most recently updated local stores with a source project. Several are pilot stores generated from the same brief (two Punto, two Trama, two Pliegue), which is why some twins sit at distance 0.
- **Headline:** the cart (12/12) and checkout review (10/10) are identical in every store and identical to the kit default. The added-to-cart confirmation is effectively identical too (closest pair 0.01, mean 0.09, all 10 measured stores flagged against the default). Product cards are close as well (mean 0.21, 9 of 10 near the default). Buttons, type and the product page do vary (means 0.43, 0.41 and 0.39), but 6 to 10 stores still have a twin on those surfaces.
- **Quality:** simulated shopping passes wherever there is something to sell. There is no overflow at 1280 or 390, fonts load and no images are missing. One store's buy button (The red) is below AA contrast (4.41).
- **Caveats:** (1) The Bake Lab and GROUND UP have no products in their saved config.js, so their button, card, added, product and review surfaces cannot be measured. (2) The page surface compares seeded DNA (the same DNA the public site serves). No DNA-driven CSS exists yet, so those differences are not visible. Against the kit default, page only compares motion hooks. (3) Motion is counted statically, because the sandbox runs with reduced motion. (4) Contrast is measured against solid colours only; gradients and photos behind a button are ignored.

# Uniqueness and quality scorecard — 2026-09-24

Created 2026-09-24 from the local database (latest revision of the 12 most recently updated stores; seeded DNA applied as the public site serves it). 12 stores. No model calls.

Thresholds: MIN_PAIR_DISTANCE = 0.25, MIN_DEFAULT_DISTANCE = 0.25, MIN_BUY_CONTRAST = 4.5.
Distance is 0 (identical) to 1 (nothing shared), the mean over the facts measured on that surface at 1280 and 390.

## Uniqueness by surface

| Surface | Measured | Closest pair | Distance | Mean | Too close to another store | Too close to the kit default | Missing |
|---|---|---|---|---|---|---|---|
| button | 10 | Trama · r2 · 0v7g7 ↔ Pliegue · r1 · qhxug | 0.07 | 0.43 | 6: cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | 0: — | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| cart | 12 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.00 | 0.00 | 12: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, The Bake Lab · r4 · 3jv51, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | 12: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, The Bake Lab · r4 · 3jv51, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | — |
| added | 10 | cuadraa · r8 · 7381t ↔ Bruma · r1 · mw1wz | 0.01 | 0.09 | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| product | 10 | Pliegue · r1 · uixh5 ↔ Bruma · r1 · mw1wz | 0.00 | 0.39 | 6: BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Pliegue · r1 · qhxug | 1: Trama · r2 · 0v7g7 | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| review | 10 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.00 | 0.00 | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, BookShelf · r10 · 7s0hz, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| card | 10 | cuadraa · r8 · 7381t ↔ Trama · r1 · c8jv6 | 0.01 | 0.21 | 9: The red · r1 · qs7ph, cuadraa · r8 · 7381t, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | 9: The red · r1 · qs7ph, cuadraa · r8 · 7381t, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, Pliegue · r1 · qhxug | The Bake Lab · r4 · 3jv51, GROUND UP · r1 · 3f6gi |
| type | 12 | Punto · r1 · z555j ↔ Trama · r1 · c8jv6 | 0.00 | 0.41 | 10: The red · r1 · qs7ph, cuadraa · r8 · 7381t, The Bake Lab · r4 · 3jv51, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | 0: — | — |
| page | 12 | The red · r1 · qs7ph ↔ cuadraa · r8 · 7381t | 0.51 | 0.72 | 0: — | 9: The Bake Lab · r4 · 3jv51, Pliegue · r1 · uixh5, Punto · r1 · z555j, Bruma · r1 · mw1wz, Trama · r1 · c8jv6, Punto · r2 · tf6s4, Trama · r2 · 0v7g7, GROUND UP · r1 · 3f6gi, Pliegue · r1 · qhxug | — |

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
| The red · r1 · qs7ph | cart, added, review, card, type | cart, added, review, card |
| cuadraa · r8 · 7381t | button, cart, added, review, card, type | cart, added, review, card |
| BookShelf · r10 · 7s0hz | button, cart, added, product, review | cart, added, review |
| The Bake Lab · r4 · 3jv51 | cart, type | cart, page |
| Pliegue · r1 · uixh5 | button, cart, added, product, review, card | cart, added, review, card, page |
| Punto · r1 · z555j | cart, added, review, card, type | cart, added, review, card, page |
| Bruma · r1 · mw1wz | cart, added, product, review, card, type | cart, added, review, card, page |
| Trama · r1 · c8jv6 | cart, added, product, review, card, type | cart, added, review, card, page |
| Punto · r2 · tf6s4 | button, cart, added, product, review, card, type | cart, added, review, card, page |
| Trama · r2 · 0v7g7 | button, cart, added, review, card, type | cart, added, product, review, card, page |
| GROUND UP · r1 · 3f6gi | cart, type | cart, page |
| Pliegue · r1 · qhxug | button, cart, added, product, review, card, type | cart, added, review, card, page |
