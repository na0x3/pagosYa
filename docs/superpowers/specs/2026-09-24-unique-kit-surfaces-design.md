# Every kit surface unique per store — sub-project 5 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3.1 surface list, §5 gates).
Depends on: Design DNA (`docs/superpowers/specs/2026-09-24-design-dna-design.md`). The runtime DNA is flat in
`window.PAGOSYA_CONFIG.dna`, and `commerce.js` writes it to `<html data-dna-*>`; exact names are in
`apps/api/src/storefront-source/source-dna.ts`. `data-dna-product` is set by the kit from its own
`productPageStyle()`.
Status: written under the owner's instruction "build everything from 2-8".

## 1. Baseline (docs/research/scorecard-baseline-2026-09-24.md)

Closest pair distance / stores too close to the kit default: cart 0.00 / 12 of 12; checkout review
0.00 / 10 of 10; added-to-cart confirmation 0.01 / 10 of 10; product card 0.01 / 9 of 10. These surfaces
are identical across stores. The owner's requirement: "no equal checkout, or pre-checkout, or cart, nor
when product added there's a little button that appears right bottom that is always the same too";
"every button is the same"; product cards should preview the product before opening (e.g. another
photo on hover).

## 2. Principle

**Behaviour stays platform-owned, and form becomes per-store.** Every variant is CSS (plus small
JS where layout needs it) in the kit, keyed on `html[data-dna-*]`, so a variant can never break
prices, stock, totals, payment or legal text. No variant hides or shrinks a price, a buy/pay button,
the total or legal text. A store with no DNA attributes renders exactly as today.

## 3. Variants to build

All live in `packages/storefront-kit/kit/commerce.js` (the injected style blocks and the builders) unless noted.

| DNA field | Values | What changes |
|---|---|---|
| `button` (form) | pill, block, underline, tag, stamp, outline, ghost, split | Every commerce button, via a shared token set (`--kit-btn-radius`, `--kit-btn-border`, `--kit-btn-bg`, `--kit-btn-fg`, `--kit-btn-case`, `--kit-btn-tracking`, `--kit-btn-pad`, `--kit-btn-decor`) set per form on `:root`. Surfaces use the tokens instead of restating their own styles. `split` puts the price in a separate cell. `tag` has a notched corner. `stamp` has a double border and a slight rotation on press. |
| `hover` | lift, fill, underline-grow, tilt, shine, invert | Hover and focus-visible behaviour of those buttons (never the only focus indicator). |
| `press` | squash, sink, pop, none | The `:active` transform. |
| `cart` | drawer, sheet, page, overlay | `dialog.cart-drawer` placement: right drawer (today), bottom sheet with a grab handle, full-page panel, or centred card. The entry transition matches the placement. The mobile behaviour of each is defined (sheet and page are full width on phones). |
| `added` | toast, ribbon, bubble, inline, stamp | `.cart-added`: corner toast (today's position, restyled), full-width ribbon from the top, bubble anchored to the cart button, inline confirmation under the pressed add button, or a centred stamp that fades. Always `role=status` and never covers the cart button on phones. |
| `review` | split, stacked, ticket, notebook | `.checkout-review`: two columns (today), one stacked column, a receipt-like "ticket" summary with a perforated edge, or a lined "notebook" list. Field order and validation are unchanged. |
| `card` | still, second-photo, swatch-swap, zoom, quick-look, tilt | Product cards. `second-photo` crossfades to `imageUrls[1]` on hover and on long-press/focus for touch and keyboard. `swatch-swap` shows up to 4 variant dots that swap the photo. `zoom` scales the photo. `quick-look` shows an "open quick view" chip. `tilt` applies a small 3D tilt following the pointer (desktop only). Each falls back to `still` when the data is missing (e.g. only one photo). |
| `radius`, `border`, `frame` (shape) | as in DNA | Token values for kit radii (cart photo, quantity buttons, panels) and image framing (bleed, inset, rounded, arch, polaroid) on card and cart photos. |

**Also restyled** so they stop looking like the platform on every store:
- the contact launcher and panel (`renderContact`, today `--ink`/`--paper` only), which now use the store
  tokens and the DNA shape and button form;
- the privacy dialog (`packages/storefront-kit/kit/privacy.js`, today `--brand-*` only), which now reads
  `--store-*` too and the DNA shape. It stays legally the same: same choices, same wording and the
  same focus order;
- the mobile sticky buy bar (`.product-detail__sticky`), which takes the button form;
- the checkout pay button, which uses the button tokens.

**Order confirmation** (`apps/checkout/src/checkout/payment-result.ts`): the receipt panel and actions take
the store's button form and radius from the DNA. The checkout app receives `dna` with the public
store data (`GET /stores/public/:slug/store`), so the API adds `dna` (runtime form, seeded default when
missing) to that response. The pagosYa printer overlay stays platform-branded on purpose.

## 4. Component mode

`packages/storefront-kit/kit/ui.tsx` maps `--ui-*` to `--store-*`, and its `CartButton` and card
templates have their own CSS. The component-mode button and card styles also read the `--kit-btn-*`
tokens and the `data-dna-card` preview behaviour, so both modes look alike for the same DNA. The
`themeCss` radius cap (10px) does not apply to the DNA button radius tokens.

## 5. Tests and evidence

- jsdom tests (the pattern established by the DNA runtime spec) for each JS-affecting variant: card
  `second-photo` renders a second image only when one exists; `swatch-swap` swaps the photo; the `added`
  placements attach to the right container; `cart=page` still traps focus and closes on Escape.
- A static guard test: no variant CSS sets `display:none`, `visibility:hidden`, `opacity:0` or
  `font-size` under 12px on price, total, buy/pay or legal selectors.
- Browser: extend the scorecard collector if needed so `cart`, `added`, `review` and `card` capture the
  variant-driven properties (position, width share, radius, border, image count). Then re-run the
  scorecard on the same 12 stores. **Target:** closest pair ≥ 0.25 and zero stores too close to the
  default on cart, added, review, card and button. Commit the result as
  `docs/research/scorecard-after-kit-surfaces.md`.
- The existing checkout and Studio browser suites (`cross-sell-kit`, `checkout-layout`, dashboard
  shipment panel) stay green. Where a test asserts today's single look, update it to assert behaviour,
  not the exact look.

## 6. Out of scope

Motion timing per personality (sub-project 6: this sub-project uses one neutral timing), illustrated
motifs (3) and free CSS (7).
