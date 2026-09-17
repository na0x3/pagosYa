# Boxes from real products, and cross-selling

Status: built, uncommitted (2026-09-16). Follows the "choose N" pick groups on product
extras (`pickCount`, `apps/api/src/payment-links/product-extras.ts`).

## Owner decisions (2026-09-16)

1. **Box choices are real catalog products.** The merchant ticks which products
   can go in a box; shoppers see each product's photo and live name.
2. **Recommendations are managed from Studio and shown on YAPI sites** in three
   places: under each product, in the cart/checkout, and as bundle offers on the
   product page.

## What already existed (do not rebuild)

| Piece | Data | Shown | Edited |
|---|---|---|---|
| "Combínalo con" | `PaymentLink.recommendedProductIds` (≤4) | YAPI product page (`relatedMarkup`), hosted checkout | old dashboard only |
| "Súmale algo más" | `Store.cartRecommendationsEnabled` / `cartRecommendationProductIds` (≤12) | hosted checkout cart only | old dashboard only |
| Bundles | `StoreBundle` (FIXED, MIX_MATCH, BOGO) + `bestBundleDiscount` | `[data-pagosya-bundles]` slot, cart discount | Studio "Contenido y ofertas" |

## Design

### 1. Box choices linked to products
- A product extra may carry `productId`. It must be another **active, simple**
  product (no options or extras of its own) in the same store, once per box.
- Public data resolves linked extras live: current product name, first photo
  (`imageUrl`), and `available` = product active and not sold out. A linked
  product that was archived or deleted drops out of the box.
- **Stock:** every pick consumes one unit of the linked product (× line
  quantity), in the cart quote, the lead/WhatsApp path, the payment-time check
  and the stock decrement. The cart snapshot keeps `productId` per pick.
- Studio product editor, options step: "Es una caja: el cliente elige
  productos" → product checklist + "¿Cuántos elige?" + group label.
- The old dashboard keeps `productId` when it re-saves a product (it must not
  silently unlink a box).

### 2. Under each product
- Studio panel **"Recomendaciones"** (business workspace catalog entry *and*
  Studio toolbar button): per product, pick up to 4 "Combínalo con" products.
  Writes `PATCH payment_links/:id { recommendedProductIds }`.

### 3. Cart / checkout
- Same panel: toggle + pick up to 12 products for the cart
  (`PATCH stores/:id { cartRecommendationsEnabled, cartRecommendationProductIds }`).
- YAPI kit cart (`[data-pagosya-cart]`) shows "Súmale algo más": up to 3
  recommended products not already in the cart; simple products add in one tap,
  others link to their product page.

### 4. Bundle offer on the product page
- Public store data carries active bundles (`bundles`) when `bundlesEnabled`.
- YAPI product page lists every active bundle containing the product:
  FIXED "Llévalo con … y ahorra N%" with **Añadir paquete** (adds each item ×
  quantity when all are simple and in stock, otherwise links to choose);
  MIX_MATCH "Combina N o más de … y ahorra N%"; BOGO "Lleva dos, paga el mayor".
  The discount itself is still applied only by the server cart quote.

## Known limits (accepted)
- Box picks consume the linked product's **global** stock only; per-branch
  (`locationStocks`) stock is still counted on the box line, not per pick.
- `commerce.js` now has its own 400 KB budget in `sourceProjectSnapshot`: the kit
  plus the motion runtime passed the 180 KB budget for authored files.
- Cart suggestions ids are not validated against the store on save (already
  true before); storefronts only ever match their own products.
- The old dashboard's Playwright suite cannot open the products form at HEAD,
  so its box field is covered only by the unchanged editor pattern.

## Out of scope
- YAPI chat creating boxes or recommendations (its product tools have no
  extras/recommendation operations).
- Automatic "frequently bought together" suggestions.
