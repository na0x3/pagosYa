# BURGUERIA: browser diagnosis and repair

Inspected the merchant's actual localhost dashboard and conversation, revisions 1 and 2. The merchant asked for four uneven photos to become a long slider. Revision 2 added the slider and preserved all the original CSS.

## Findings

- Original photo heights at the 1023px preview width: 422, 345, 301 and 347px. Only the gallery, not its images, had a fixed height.
- Revision 2's four portrait photos used `object-fit:cover` in a 2.35:1 frame, producing severe cropping. Next/previous navigation worked.
- The manifesto used horizontal flex on paragraphs containing `br` and `em`, inside intrinsically sized grid columns. Both revisions had 1236px document width in a 1023px viewport.
- Six of the seven reported errors were repeated checks blocked by an empty catalog. The photographs were decorative assets, not catalog products with prices.
- No browser console errors were observed during diagnosis.

## Saved changes

Revision 3 corrects `styles.css`: shrinkable manifesto columns, normal paragraph flow, contained carousel photographs, and 44px arrow/dot targets. The original slider behavior and brand palette remain. Revision 4 opens heading tracking from -0.045em to -0.04em after the new browser review identified cramped type. Neither revision invokes generation or publishes the store.

The platform changes distinguish missing catalog setup from code failures, show browser results directly in the chat, wait for checks when completing a generated revision, attach current findings to subsequent requests, and explain overflow with actual measurements. See [generation contract](source-design-generation.md) for scope and limitations.

## Verification

The refreshed merchant dashboard reported 97 passing checks, zero failures, zero visual warnings, and one blocking catalog setup step for revision 4. All six pages fit at 1280, 768, 390 and 320px. The actual preview's desktop manifesto and desktop/mobile slider were inspected, and next/previous controls were exercised. The 390px preview measured exactly 390px of document width.

Regression coverage: 17 browser diagnostic tests, 12 Studio browser tests, and 62 API tests passed; API and Studio builds passed. Two older Studio tests needed to open the existing Pedido drawer before continuing checkout, matching the current runtime interaction. No paid generation, product creation, publication, or real payment was performed for this repair. The merchant must still supply catalog names and prices before purchase testing can complete.
