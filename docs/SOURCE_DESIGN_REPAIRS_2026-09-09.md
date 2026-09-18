# Correcting generated storefront visual defects

The reviewed defects are fixed in separate source copies, and Studio now checks the underlying layout problems. [Compare originals and repairs](../tmp/source-design-repaired-20260909/index.html). The original generation results remain unchanged.

## Concrete repairs

| Defect | Cause | Repair |
|---|---|---|
| Ceramic artwork overlaps mobile names | A 190px drawing participates in intrinsic grid sizing despite a CSS scale transform | Size the drawing for its actual column, constrain its decorative wrapper, and place price/actions on a full row |
| Purchase controls clip or escape their product | Columns and nonwrapping action groups require more width than is available | Use shrinkable tracks, `min-width:0`, wrapping actions and 44px buttons; shorten the tablet header's fixed track layout |
| Featured breakfast price appears below the image, away from its name | Three children auto-place into a two-column grid | Assign explicit photo/copy/order areas; keep name, price and add controls together beside the photo, stacked on mobile |
| Plate marks cross prices; display letters crowd | Absolute decoration shares the reading area; aggressive negative tracking | Reserve a grid area for ornaments, open tracking and line height, preserve the colorful staggered composition |
| A shop freezes after adding | Its MutationObserver writes into the subtree it observes | Use the runtime's existing `pagosya:ready` event and avoid redundant text writes |
| Catalog-first shop starts too late | Introductory heading and surrounding spacing exceed the selected opening allowance | Compact the heading/context while retaining its shelf motif and visible basket |

These are refinements of the selected identities. The photos, colors, products, page narratives and different product arrangements remain recognizable. Long narrative openings were not converted into catalog-first pages when the chosen concept intentionally used an introduction.

## Prevention in generation and Studio

The generation contract now explicitly describes featured-product placement, intrinsic sizing, wrapping actions, separate decoration and narrow-screen purchase targets. It still permits different page structures and product compositions.

Studio checks **1280, 768, 390 and 320px**. It reports:

- Decorative element bounds intersecting product text, with the affected product names.
- Prices displaced far below their names into a different column.
- Tight product headings as well as page headings.
- Purchase controls clipped by an ancestor or outside the viewport, even when `overflow:hidden` conceals document overflow.

Overlap, grouping and typography findings are advisory: transparent artwork, unusual compositions and pseudo-elements require visual judgment. Clipped purchase controls are functional failures. Scrollable horizontal containers are treated separately. The repair-message flow now includes blocking failures as well as warnings, with failures first. Preparing corrections fills the composer without submitting a generation; no automatic paid retry was added.

This creates a repeatable workflow: render the chosen concept, identify the specific failed relationship, repair the affected layout/CSS, and confirm the same viewports and shopping actions. The current implementation does not promise that unseen generations will always pass.

## Verification

- All nine saved sample copies complete the shopping-flow replay; all 27 rendered detail links reach their products. The previously frozen shop now passes.
- Four repaired homepages were inspected at desktop, tablet and both mobile widths. A first confirmation exposed tablet header/action overflow; targeted corrections were confirmed. Mobile pottery no longer crosses names, the featured breakfast purchase group sits beside its image, and plate marks have their own space.
- The production Studio checks reproduced the original three visual-defect samples and cleared the targeted overlap/grouping/clipping findings on all four repaired samples. Seven saved-sample checks passed; the final shop correction also received a targeted confirmation.
- **18 Studio browser tests**, including three new defect-and-repair regressions and both repair-message paths, passed. Five API design tests passed. API and Studio production builds and `git diff --check` passed. The layout detector returned no findings; it does not replace the rendered checks.

No model calls, merchant updates or deployments were made for these repairs. Passing replays of manually corrected samples must not be reported as a higher first-pass generation success rate.

The [exact source patches and input digests](research/source-design-layout-repairs-20260909.json) are retained in the repository. Repaired files, screenshots, browser measurements and replay records are under `tmp/source-design-repaired-20260909/`; those local artifacts are ignored by Git. The previous [generation-quality report](SOURCE_DESIGN_VALIDATION_2026-09-09.md) remains the historical benchmark.
