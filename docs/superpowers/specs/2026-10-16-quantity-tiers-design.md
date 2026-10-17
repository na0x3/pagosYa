# Quantity tiers in the buy box — design

**Date:** 2026-10-16 · **Status:** draft, awaiting owner review · **Branch:** feature/store-page-architecture

## Why

Single-product Shopify themes (reference: Shrine demo, 2026-10-16) put "Buy 1 / Buy 2 / Buy 4" choices right
in the buy box, each with its per-unit price and saving. It is the strongest conversion lever for stores that
sell one hero product (Raíz Viva-style shops). Our product page shows the same offer only as a text card in
«Llévalo en paquete», below the fold, and only simple products get an «Añadir paquete» button.

## What already exists (no schema, no migration, no pricing change)

- `StoreBundle` with `kind: 'FIXED'` and a single item `{ productId, quantity: N }` already means
  "buy N of this product, save X%". `apps/api/src/stores/bundle-pricing.ts` repeats it per group of N
  (`cycles`), counts every variant line of the product together (lines match on `paymentLinkId`), and the best
  single offer wins. So a 2-pack at 15% plus a 4-pack at 25% on one product already price correctly: 4 units take
  25%, 5 units take 25% on four and full price on the fifth.
- `BundleDto` accepts one item (`@ArrayMinSize(1)`); Studio's «Paquete» form can save one product with a quantity.
- Subscription lines are excluded from bundle pricing (`store-checkout.service.ts:218`).

## Design

### 1. Product page — tier picker (storefront kit)

A **tier** is an active `FIXED` bundle whose `items` is exactly one entry for this product with `quantity ≥ 2`,
shown only when `store.bundlesEnabled`.

- Render inside the buy slot, above the quantity stepper, as a radio group «Elige cuántos»:
  `1 unidad · Bs 59` (the regular price, always first) then each tier sorted by quantity, at most 3 tiers.
- Each tier row: `N unidades`, the per-unit price after the tier, the tier total with the regular total struck
  through, and `Ahorras Bs X`. The numbers use the server's math (`floor(eligible × % / 100)` on the current
  unit price, sale included), so the page never promises a figure the checkout will not charge.
- **Default selection is «1 unidad».** No tier is preselected and no «Más elegido» label (we have no
  popularity data, and the ecommerce-ux rules forbid fake social proof).
- Picking a tier sets `selectedQuantity`; changing the stepper selects the matching tier or, between tiers, none.
  The add button, subtotal and sticky bar follow `selectedQuantity` as they do today.
- Hide a tier whose quantity exceeds the remaining stock of the selected variant; hide the whole picker while
  «Suscríbete» is chosen (subscriptions get no bundle discount) and for memberships, boxes and digital goods.
- Variants: the tier applies to the selected variant's quantity. Mixing colours also earns it server-side;
  the copy may say so later, not in v1.
- A tier is removed from the «Llévalo en paquete» section so the same offer never shows twice.
- Authored product pages (`data-pagosya-product-page-template`): the picker lives in the required `buy` slot,
  so YAPI templates get it without a contract change. The surface checks (clip/cover) must pass with it present.

### 2. Cart

The cart quote already returns the bundle discount. Check that its line reads as the tier name
(e.g. «2 unidades · ahorra 15%») and that dropping below N removes it on the next quote. No new code expected.

### 3. Studio — «Descuento por cantidad»

Add a fourth choice to «Tipo de oferta» in `apps/merchant-studio/src/commerce-content.ts`:
«Descuento por cantidad» = one product, one or more rows of `cantidad → % de descuento`. Saving writes one
`FIXED` bundle per row (name auto-filled: «Lleva 2 · Taza»). The list shows them grouped under the product.
Existing one-product «Paquete» offers already count as tiers; nothing to migrate.

### 4. YAPI

The author prompt mentions the picker only as a runtime-owned part of the buy slot (never authored, no typed prices),
in the same place it describes bundles today.

## Out of scope

Free-shipping-per-tier labels (Shrine's «Free Shipping» chip) need a real shipping rule first. «Más elegido»
needs real order data. Desktop sticky bar.

## Tests

- Kit (jsdom, `source-commerce-*.spec.ts` harness): tiers render only for one-product FIXED bundles of this
  product; «1 unidad» is selected by default; picking a tier sets the quantity and the add payload; the shown
  saving equals `bestBundleDiscount` for that quantity; stock and subscription hide rules; the tier is not
  repeated in «Llévalo en paquete»; authored template keeps it in the `buy` slot.
- API: `bundle-pricing.spec` cases for 2-pack + 4-pack on one product with 2, 4, 5 and mixed-variant units.
- Studio: the new offer type saves one FIXED bundle per row.
- Live: one demo store with a 2- and 4-pack, mobile and desktop, through to the cart quote.

## Open questions for the owner

1. Show the regular-price «1 unidad» row, or only the tiers next to the normal stepper?
2. Should Studio let the merchant mark one tier as «Recomendado» (their own words, not a popularity claim)?
