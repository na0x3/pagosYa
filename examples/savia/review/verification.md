# Savia premium redesign — verification log

The approved direction is A, selected by Codex after Claude independently reviewed matching desktop/mobile screenshots. Claude preferred its larger image and horizontal mobile thumbnails. The final pass aligned the product to the header, lightened delivery presentation and placed subtotal near quantity. Skip-link offscreen state was checked in computed styles; its hiding was hardened against full-page screenshot stitching.

## Completed interactive evidence

- Actual Chrome viewport 390 × 844, no horizontal overflow.
- Selecting Marfil immediately shows its individual bottle photo while purchase remains disabled until capacity is selected.
- Marfil / 750 ml resolves Bs 109; quantity two resolves Bs 218.
- Cart preserves that exact configuration, quantity and total.
- Checkout preserves Bs 218 and uses the same computed action color, rgb(41, 77, 59).
- Mobile checkout now presents the order before the payment action, in DOM and visual order.
- No-charge demo handoff and completion work; success explicitly states that no order or charge was created.

## Scope of evidence

Savia is a fictional local demo, with a saved source revision and real catalog/variant records. No real payment was submitted. Claude reviews are advisory, based on the files or screenshots named in their saved prompts. The six-run pilot tests fresh generation on three catalogs; it is not the proposed 36-run controlled benchmark, and does not establish a production pass rate.
