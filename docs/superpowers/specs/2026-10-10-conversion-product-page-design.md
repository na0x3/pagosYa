# Conversion product page (Blume reference) — design

Date: 2026-10-10 · Branch: feature/store-page-architecture · Status: approved in chat, awaiting written-spec review

## Why

The owner shared a before/after of the Blume protein-coffee product page (TikTok, "Increase your conversions with this
redesign"). The "after" adds a "Best Seller" badge on the photo, icon tiles beside the photo, check-marked benefits,
the price inside the add-to-cart button and a free-gifts row. The owner wants pagosYa product pages that sell like that,
without breaking the honesty rules (no invented numbers, ratings or sales counts).

## Decisions (owner, 2026-10-10)

1. **Gifts row is a separate project**, specced right after this one. Not here.
2. **Badge = merchant + automatic.** Merchant may set one; otherwise automatic badges appear only when true.
3. **The Blume layout is a new fifth product page style, `conversion`**, next to editorial / dense / image-led /
   story-led. YAPI picks it where it fits; calm stores keep theirs. The badge appears on every style.
4. Pills under the title ("More Focus*") are dropped — they repeat the checks.

## What already exists (and is reused)

- **Price in the buy button** — every buy button already carries `<span class="product-detail__buy-total">` with the
  live total (`packages/storefront-kit/kit/commerce.js`, `openProduct`, filled by `updateQuantity`). Hidden today for
  `editorial` and for `dense` ≤480 px.
- **Struck-through price + saving pill** — `priceMarkup` renders `<del>` and "N% de descuento", driven only by a real
  `discountPercent` window. No free-form compare-at price (keeps it honest).
- **Rating line** — `decorateProductReviews` shows "4,5 de 5 · N reseñas verificadas" only from PUBLISHED reviews of
  paid orders (`commerce-content.service.ts` `publicContent().reviewSummary`).
- **Highlights** — `PaymentLink.highlights` `{icon, label≤24, detail≤40, origin?}`, max 6, 40-icon closed enum
  (`apps/api/src/payment-links/product-highlights.ts`), drawn as inline SVG by the kit's `highlightIcons` map.
  Written by YAPI (`ProductHighlightsService.suggest`, `ProductPageWriterService`).

## Design

### 1. Photo badge (all styles; product page and catalog cards)

**Data.** New nullable column `PaymentLink.badge String?` with three states:
- `null` → *Automática* (default for every existing and new product);
- `''` (empty string) → *Ninguna* (no badge, automatic ones suppressed);
- any other text → the merchant's own badge, trimmed, 1–20 characters, no line breaks.

One Prisma migration. It is run by the main session on the dev DB, never by a subagent.

**Automatic badge.** When `badge` is `null`, the kit shows the first that is true:
1. **"Más vendido"** — the store's single top product by units sold in paid orders (`paymentIntent.status =
   SUCCEEDED`) in the last 90 days, only when the store has ≥5 paid orders in that window. Ties → no badge.
2. **"−N%"** — a discount is active right now (same rule `price()` already uses).
3. **"Nuevo"** — the product was created less than 30 days ago.

**Server.** `CommerceContentService.publicContent` adds `topSellerId: string | null` computed with the rule above
(one aggregate query over the store's orders in the window). The public product payload must carry `badge` and
`createdAt`; add them where the storefront product list is serialized if missing.

**Kit.** A `productBadge(p)` helper resolves the text (merchant → top seller → discount → new → none). The badge renders:
- on the product page as `<span class="product-detail__badge">` absolutely positioned top-left inside
  `.product-detail__stage` (already `position:relative`);
- on catalog cards as `<span class="menu-item__badge">` top-left over the card image.
It takes the store's accent and fonts (CSS custom properties already used by the kit). It is plain text, not a link,
and sits before the product name in reading order. It is a new `PRODUCT_PARTS` entry that follows the gallery, so
template and sketch stores keep it.

**Editor.** The product editor in Studio (`apps/merchant-studio`, `source-create-product.ts` and the product edit
form) gets an "Insignia" control: Automática / Ninguna / Personalizada (text field, 20 chars, live counter). The API
DTOs for create/update accept and validate `badge`.

### 2. The `conversion` product page style

`SOURCE_PRODUCT_PAGE_STYLES` (`apps/api/src/storefront-source/source-dna.ts`) gains `'conversion'`. Because the enum
feeds the sketch schema, `set_product_card_theme`, the visual system and `config.productPageStyle`, the value reaches
YAPI, the boceto and the kit without new plumbing. `PRODUCT_COMMERCE_RECIPES` gets no new preset; `conversion` is a
layout, not a skin.

**Layout (kit, `openProduct` when `productPageStyle() === 'conversion'`):**
- **Tile column.** When the product has ≥3 highlights and at least one photo, the first 3 render as square tiles
  (icon + label, no detail) in a column to the right of the main photo, on phones as well as desktop (Blume). The
  photo narrows to make room; the column is ~28% of the gallery width on phones, a fixed ~120 px on desktop. With fewer
  than 3 highlights, or no photo, there is no column and all highlights go to the checks.
- **Copy column order:** rating (only when real) → title → price with struck original + saving pill → checks →
  buy button → assurance row → YAPI's long-page blocks.
- **Checks.** Highlights 4–6 (or all of them when there is no tile column) render as a 2-column grid of chips, each a
  ✓ glyph plus the label. An odd count leaves the last chip full width.
- **Buy button.** The price span is always visible in this style ("Añadir al pedido · Bs 120"), at every width.
- **Mobile.** Single column below 899 px except the photo+tiles row; no horizontal scroll at 320 px (labels wrap,
  tiles shrink, icons scale down).
- Colours, radii and fonts come from the store's tokens; nothing is Blume-coloured.

**Template and sketch stores.**
- New `PRODUCT_PARTS` entries `tiles` and `checks`. `tiles` follows the gallery and `checks` follows the price, so a
  template without the slots still shows them in a sensible place.
- The boceto's `skb-pdp` template gets a highlights slot, and `highlights` leaves `PRODUCT_DROPPABLE`, so sketch-built
  stores stop dropping highlights on every style.

**Choosing the style.**
- The sketch schema and the visual-system planner describe `conversion` as the default for food & drink,
  supplements, beauty/personal care and gadgets/small electronics; other sectors keep their current defaults.
- The Studio's product page style picker (boceto Diseño panel "Composición" row and anywhere else the four styles are
  offered) shows the fifth option, labelled "Conversión".
- `source-next.ts`'s authored-store contract gains one sentence describing `conversion` (photo with a tile column,
  checks between price and button, price in the button).

### 3. Highlights: honesty and icons

- **Number check.** `ProductHighlightsService.suggest` runs the same `keepsToFacts` check the long-page writer uses
  (`product-page-writer.ts`): a suggestion whose label or detail contains a number or claim stem not present in the
  product's facts is dropped. Export the check rather than copy it.
- **Icons.** 15 new names in `PRODUCT_HIGHLIGHT_ICONS`, each with an inline SVG and motion class in the kit's
  `highlightIcons` map and in the Studio icon picker, covering what the current 40 miss for the `conversion` sectors:
  scoop (protein), brain, moon, dumbbell, bean, bowl, pill, sprout, lotion, mirror, eye, headphones, camera, timer,
  glass (drinks). The plan may swap a name if a drawing reads badly at 24 px, keeping the count.

## Out of scope

- The gifts row ("you unlocked N free gifts") — next spec.
- Pills under the title.
- Any rating, sales count or "Loved by N customers" not backed by real reviews/orders.
- Merchant-editable "Más vendido" thresholds.

## Error handling and edge cases

- Badge text that fails validation → 400 with a Spanish message; the editor prevents it client-side.
- Studio preview with no orders: the automatic badge shows "Nuevo" or the discount when true; no sample "Más vendido"
  (preview samples stay limited to the existing labelled review sample).
- A highlight icon name the kit doesn't know (older cached kit) → the existing fallback icon.
- `conversion` chosen for a store whose products have no highlights → the page degrades to price → button; no empty
  tiles or checks containers in the DOM.

## Testing

- API: `badge` validation (null / '' / text / too long); `topSellerId` (≥5 orders rule, 90-day window, ties,
  unpaid orders ignored); `suggest` drops an invented number.
- Kit: badge resolution order; `conversion` markup with 0, 2, 3 and 6 highlights and with no photo; price span
  visible in `conversion`; parts placed in templates with and without slots; a sketch store keeps highlights.
- Real browser, one dev store switched to `conversion`: 390 px and 1440 px screenshots — tiles beside the photo,
  checks, price in the button, badge on page and cards, no horizontal scroll at 320 px.
