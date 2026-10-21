# Designer gallery — design

2026-10-21 · approved in chat 2026-10-21 (owner: «pictures one after another when scrolling down, but the buy button part
does not scroll down until that ends»).

## What the shopper gets

- **Desktop / tablet (≥ 900 px):** every photo of the product stacked down the photo half, full width, in order, with a
  small gap; the info and buy column is `position: sticky` under the header and stays beside the photos until the last
  one passes, then scrolls away with the page (reviews and «También te puede gustar» follow below both columns).
- **Phones:** the photos become a horizontal swipe row (scroll-snap) with dots and a «2 / 5» counter; the buy column follows
  below. No long vertical stack on a phone.
- A click on any photo opens the part-1 photo viewer on that photo; the hover magnifier works on each stacked photo.
- A product with one photo keeps the single large photo; a colour choice (colour photos spec) swaps the whole stack.

## Who gets it

- **Every fashion product page** (`productPageStyle: 'fashion'`): the stack replaces the single photo + arrows.
- **Any other store, by the dice:** Esencial's existing `pdp: 'split-scroll'` becomes this gallery (today it only makes
  the info sticky); it is already in the dice, so stores roll it as before. YAPI-coded stores reach it through the kit DNA
  `gallery: 'stack'` (existing value) combined with a sticky copy column.

## Where it lives

Kit: `product/page.js` `galleryMarkup` (stack mode for fashion and for `data-dna-gallery=stack`; phone swipe row with
dots), `product/photo-viewer.js` (stacked photos already carry `data-photo-zoom="N"`; magnifier extended from the stage
photo to stacked photos), `product/dialog-style.js` (sticky copy column for `[data-style=fashion]` and for stacked
galleries). Esencial `globals.css` `split-scroll` rules aligned with the kit. The sticky `top` uses the header height
(`--store-header-height`, measured by the kit when missing).

## Rules

- The sticky column never exceeds the viewport: when the info is taller than the screen it scrolls normally (no trapped
  buy button).
- Photos are lazy-loaded except the first two.
- `prefers-reduced-motion`: no scroll-snap smoothing.
- The product dialog (non-full page) keeps today's single photo + arrows (a stack inside a modal is not the design).

## Testing

- Kit jsdom: fashion page renders N stacked photos with `data-photo-zoom` indexes; one-photo product keeps the stage;
  stack + colour switch swaps all photos; phone markup has dots and counter.
- Browser: NOA VARGAS (fashion) and an Esencial `split-scroll` store at 1440 (sticky holds until the last photo, then
  releases) and 390 (swipe row).

## Out of scope

Video in the stack, zoom-on-scroll effects, a thumbnail rail beside the stack.
