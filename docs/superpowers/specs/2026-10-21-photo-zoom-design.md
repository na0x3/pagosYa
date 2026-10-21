# Photo zoom — design

2026-10-21 · part 1 of 3 (photo zoom → fashion look → dropdown menu)

## Why

Shoppers cannot look closely at a product photo on any pagosYa store. The only motion is a small scale on hover
(`data-dna-card=zoom`, the atelier card). The owner asked: «let users zoom pictures in product cards». Fashion stores need it
most (fabric, stitching), every store benefits.

## What the shopper gets

1. **Full-screen viewer.** Tapping or clicking a product-page photo opens all of that product's photos full-screen, starting
   at the one tapped.
   - Swipe (touch), the ‹ › buttons or ←/→ move between photos; a counter «2 / 5» and a thumbnail row show where you are.
   - Double-tap / double-click toggles zoom (2.5×) at the point tapped; pinch zooms (1×–4×) on touch; a zoomed photo is
     dragged to look around; mouse wheel / trackpad zooms on desktop.
   - Esc, the × button or a tap on the dark backdrop at 1× closes it; focus returns to the photo that opened it.
2. **Hover magnifier (desktop, product page).** On a fine pointer, the main product-page photo zooms 2× inside its own frame
   and follows the cursor; leaving the photo resets it. Clicking still opens the viewer.
3. **From catalog cards.** Every product card gets a small round magnifier button on its photo corner («Ampliar foto»). It
   opens the same viewer over the list without leaving the page; the rest of the card still opens the product.

## Where it lives

The kit runtime, so it works on every store kind with no YAPI work:

- `packages/storefront-kit/commerce-src/product/photo-viewer.js` (new, built into `kit/commerce.js` by
  `tools/build-commerce.mjs`) — one viewer element created on first use, appended to `body`.
- Product page: the gallery markup (`galleryMarkup` in commerce.js) marks each `.product-detail__photo` as an opener
  (`data-photo-zoom`), and the main stage gets the magnifier behaviour.
- Cards: the runtime adds `<button data-product-zoom aria-label="Ampliar foto">` inside the card's photo holder after it
  fills a card — kit cards (`.menu-item`), Esencial cards (`.es-card__media`) and YAPI commerce-template cards (the
  `img` product slot's parent). A template that already carries `[data-product-zoom]` keeps its own button. Cards with no
  photo get no button.
- Styles in the kit's own layer, using the store's tokens (paper/ink) for the backdrop and controls, so store CSS can
  restyle but defaults look right on dark and light stores.

## Rules

- Photos only. Videos in a gallery are skipped by the viewer; a product with no photos never opens it.
- The viewer uses the full-size photo URL already in the product (no new image service).
- `prefers-reduced-motion`: no open/close/zoom animation, everything still works.
- Accessible: `role="dialog" aria-modal="true" aria-label="Fotos de <producto>"`, focus trapped inside, page scroll locked
  while open and restored after (same rule as the platform header menu: a lock is always given back).
- The Studio preview and the visual-edit mode do not open the viewer on clicks meant for editing (edit mode already
  intercepts clicks; the viewer listens only outside it).
- Does not change any card or product-page layout; the button sits over the photo and is hidden until hover on desktop,
  always visible (small) on touch.

## Testing

- Kit jsdom tests: opener marks on gallery and cards, open at the tapped index, ←/→/Esc, focus return, scroll lock released,
  no button without a photo, template's own button respected, videos skipped.
- Browser check (Playwright) on one Esencial store and one YAPI-coded store, desktop + 390 px: open from card and product
  page, double-click zoom, drag, close.
- After the kit change: `npm run build:studio` in apps/merchant-dashboard so «Ver en navegador» shows it.

## Out of scope

Zoom in the cart/checkout, video full-screen, a zoom setting for merchants (it is always on).
