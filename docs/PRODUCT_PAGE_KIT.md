# Product page kit: two platform-owned styles

Status: design approved 2026-09-15, not implemented. Part 1 of two; Part 2 (product highlight icons) gets its own spec.

## 1. Why

Generated product pages do not look finished. Compared with the owner's references (Haus Auston, Lunaris Living, House of Feels, Mill & Motion) and the photo-led benchmark captures in `examples/premium-benchmark-photos/*/product-capture-0.jpg`, every store shows the same faults: the photo is a contained packshot in a grey tile, the purchase button sits below the fold at 1280×844, titles are 54–60px bold and wrap to three lines, priced choices render as crowded boxed rows ("40 × 40 cmBs 110,00"), a floating counter pill covers the photo, and extra rules and panels break alignment (Pliegue's offset pink panel).

The cause is structural. The product page is rendered by `apps/api/src/stores/source-kit/commerce.js`, whose injected product CSS has grown in successive passes that restyle the same parts two or three times. YAPI then authors further `[data-pagosya-product] .product-detail__*` rules per store (`SOURCE_PRODUCT_PRESENTATION_DIRECTION` in `source-design.ts` tells it to). The layers conflict, and repair design jobs spend credits patching the result.

## 2. Decisions

- The product page layout becomes platform-owned. The kit renders one of two approved styles; a store's authored CSS supplies only its tokens (colors, fonts, radius). This deliberately narrows the "no page compositions" rule in `source-visual-system.ts` for the product page only; homepage, cart and checkout remain authored.
- Two styles, both approved from the mockups:
  - **Editorial** (home, apparel, beauty, art): light display title, small regular price, pills, few rules.
  - **Dense** (electronics, tools, appliances, vehicles): compact bold title, largest number is the price, spec chips, labeled swatches, priced radio cards, price on the button.
- Existing stores change on deploy, because `currentSourceRuntime` already serves the current kit in place of each snapshot's `commerce.js`.
- Everything shown remains real catalog or store data, as today.

## 3. Shared layout (both styles)

Desktop (≥ 900px):
- The mount spans the page width. Two columns, gallery 1.12fr and purchase 1fr. The gallery bleeds to the viewport's left edge and fills the column (`object-fit: cover`, focal point from the existing `imagePositions`), height `min(100dvh - 60px, 760px)`, sticky while the purchase column scrolls.
- Photo order stays as the merchant saved it.
- The purchase column holds, in order: breadcrumb, eyebrow (category), title, rating (verified reviews only), pricing, description, style-specific block (§4), choices, quantity + buy on one row, status, assurances, then specifications/tabs. Content max width 560px, vertically centered when shorter than the photo.
- Required at 1280×844: the buy button is fully visible without scrolling for a product with a description of up to 160 characters and up to two option groups.

Mobile (< 900px):
- Full-width 4:5 gallery with horizontal scroll-snap and dots; no thumbnails, no counter pill.
- Purchase content stacks below. The existing sticky add bar after scroll is unchanged.

Quick view (homepage `dialog`): same markup and style, compact spacing, no breadcrumb, related products or reviews (as today).

Gallery controls:
- Editorial: dots over the photo's bottom center.
- Dense: thumbnails overlaid bottom-left on a translucent plate, plus a plain "1 / N" counter with two circular outline buttons bottom-right. No pill background or shadow in either style.

## 4. Style tokens and differences

Both styles read `--store-background`, `--store-foreground`, `--store-accent`, `--store-accent-foreground`, `--store-surface`, `--store-border`, `--store-radius`, `--store-body-font`, `--store-heading-font`. Derived lines and muted text use `color-mix` from foreground and background. Radius is clamped to 0–6px on controls in the product page.

| Element | Editorial | Dense |
|---|---|---|
| Title | heading font, weight 350–400, 40–46px desktop / 32px mobile, max 2 lines | body font, weight 600–650, 28–30px / 24px, max 2 lines |
| Price | 17px regular | 30px bold; compare-at price struck through plus saving badge when `discountPercent` exists |
| Eyebrow, labels | 10.5–11px uppercase, tracking .14em | 10.5px uppercase eyebrow; 12.5px semibold option labels |
| Style block | none (Part 2 highlight row goes here) | up to 4 spec chips from the first `specifications` rows with values ≤ 24 characters |
| Buy button | uppercase tracked label, 48px | sentence case with live total ("Añadir al pedido — Bs 220,00"), 50px |
| Assurances | one bordered box under the button, items side by side | borderless icon grid of up to 3 items under the button |
| Rules | at most two hairlines in the purchase column | one hairline under pricing |

## 5. Choice rendering

Per option group, using existing data only:
1. **Swatches** when `swatchColor(group, value)` resolves for every value: circles (34px dense, 28px editorial) with the value name beneath (dense) or in the legend's selection text (editorial).
2. **Radio cards** when the group's values have different prices and the style is dense: radio mark, label, optional one-line detail, price right-aligned in tabular numerals.
3. **Pills** otherwise. When values differ in price, only the more expensive values show a "+ Bs X" delta.

Unavailable values keep their current disabled treatment. All existing hooks stay: `data-product-option`, `data-option-value`, `aria-pressed`, `data-variant-add`, `data-add`, `data-product-quantity`, `data-product-total`, `data-product-image`, `data-product-prev/next`, `data-product-count`, `data-product-sticky`, `data-product-delivery`. Cart and checkout behavior does not change.

Part 2 slot: the kit renders `.product-detail__highlights` only when a product carries approved highlights. No product does until Part 2 ships.

## 6. Choosing the style

- `visual-system.json` (version 3) gains optional `productPage: { style: 'editorial' | 'dense' }`. The design planner sets it with the selected concept; a merchant request such as "hazlo más técnico" may change it.
- `currentSourceRuntime` adds `productPageStyle` to `PAGOSYA_CONFIG`, alongside the commerce routes it already injects. The kit sets `data-style` on `[data-pagosya-product]`.
- When the manifest has no value (existing stores): dense if at least half of the published products have three or more specification rows, otherwise editorial.

## 7. Containing authored CSS

- **Runtime:** a new step in `currentSourceRuntime` uses `postcss` (already an API dependency) to drop authored rules whose selectors reference `[data-pagosya-product` or `.product-detail__`. It runs on served output only; saved snapshots and history are untouched. Token declarations in `:root` are unaffected.
- **Generation:** `SOURCE_PRODUCT_PRESENTATION_DIRECTION` is rewritten: the product page is rendered by the platform; the generator sets tokens and `productPage.style`, and keeps the empty `data-pagosya-product-page` mount. Preflight rejects authored rules targeting those selectors, so new output does not rely on the runtime strip.
- **Design jobs:** jobs for `product.html` may only change tokens and the style choice.
- **Header:** one added sentence in the direction asks for icon-only search and cart actions with a count badge and accessible names. The header itself stays authored.

## 8. Automated checks

`captureSourceVisuals` records product-page metrics for each product capture, and `designCaptureFailures` turns them into hard failures:
- desktop 1280×844: the buy button's bottom edge is outside the first viewport;
- title renders more than 2 lines on desktop or 3 on mobile;
- inside any choice, label and price boxes overlap or sit less than 8px apart;
- any horizontal overflow (existing check).

## 9. Testing

- **API (jest):** the authored-CSS strip (keeps tokens and unrelated rules, drops product rules, tolerates invalid CSS by leaving the file unchanged); config injection of `productPageStyle`; the fallback heuristic; the preflight rejection; the new capture failures.
- **Browser (merchant-studio Playwright, `tests/source-catalog.spec.ts`):**
  - both styles render, and the buy button is visible at 1280×844;
  - swatch, pill and radio-card selection puts the right variant and total in the cart;
  - quick view works;
  - mobile swipe and dots work;
  - a product with no images shows the empty state;
  - a store with the old authored product CSS still renders the kit layout.
- **Visual:** regenerate the four photo-led benchmark stores and commit before/after captures next to the existing ones.

## 10. Out of scope

- Part 2: highlight icons with looping motion and owner approval in Productos.
- Bundles rendered on the product page (the dense mockup's pack cards).
- Header redesign beyond the one direction sentence.
- Homepage, cart and checkout layouts.
