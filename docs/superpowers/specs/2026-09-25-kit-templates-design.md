# Kit templates — sub-project T1 design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-store-themes-design.md` (approved by the owner,
"do it like that"). Status: awaiting the owner's review.

Goal: a store (a theme, or a site YAPI designs) can own the markup of the product page, the cart, the cart
lines, the "added" notice and the checkout review, the way it already owns product cards. The kit keeps every
price, total, stock limit, option, delivery field and checkout handoff.

## 1. What exists (packages/storefront-kit/kit/commerce.js, 2026-09-25)

- **Card template, the pattern to follow.** `customProductCard` clones `template[data-pagosya-product-template]`
  (one root), requires `[data-product-field=name]`, `[data-product-field=price]`, `a[data-product-link]` and
  `button[data-product-add]`, fills fields with `textContent`, and on any missing piece falls back to the kit card
  and sets `data-product-template-invalid` on `<html>`. It already copes with React putting `<template>` children
  on the element instead of its content fragment.
- **Product page.** `detail.innerHTML = …` builds gallery, title, pricing, options, quantity and buy, highlights,
  delivery, product information tabs, rating, reviews, bundles and related products. It runs as a dialog, or as a
  full page when the store has `[data-pagosya-product-page]`. Authored CSS that targets the product page hooks
  (`productHook`) is stripped, so a store cannot restyle it today.
- **Cart.** `renderCart` writes the lines (photo, name, option, unit price, savings, low stock, quantity controls,
  remove), suggestions, savings, total, the checkout action and, in the review, the delivery method, branch,
  shipping zone and destination, address and store-credit fields. The drawer shell (`.cart-drawer`: header, title,
  close, body, "Seguir comprando", policies) is created once by the kit.
- **"Added" notice.** `.cart-added`, a status line plus a "Ver pedido" button with `data-cart-open`.
- **Guards.** The contrast guard (`CONTRAST_GUARDED`), motif protection (`MOTIF_PROTECTED`) and the Studio's
  browser checks (buy control visible, totals readable, no overflow) apply to whatever the kit renders.

## 2. Principle

The template owns structure, order, framing, typography and decoration. The kit renders each money-bearing or
interactive piece into a named slot inside the template. A template can place and frame a price; it can never
produce one. Filling uses `textContent` and kit-built nodes only, never template-supplied HTML strings.

## 3. Templates

All templates are optional and have exactly one root element. Slots are elements carrying the attribute shown;
the kit empties a slot before filling it.

### 3.1 Product page — `template[data-pagosya-product-page-template]`

Slots (`data-product-slot`):

| Slot | Required | Kit renders |
|---|---|---|
| `gallery` | yes | The photo stage, navigation and thumbnails (or the "Sin fotos" state). |
| `title` | yes | The product name as the page's `h1` (full page) or `h2` (dialog), with `id="pagosya-product-title"`. |
| `pricing` | yes | Price, list price and discount badge. |
| `buy` | yes | Options, box picker, quantity and the add button, and the status line. |
| `category` | no | The category name. |
| `description` | no | The description paragraph. |
| `highlights` | no | Highlights and spec chips. |
| `info` | no | Product information tabs (specifications, care, delivery). |
| `delivery` | no | Delivery and pickup summary. |
| `rating`, `reviews` | no | Rating line and reviews section (full page only). |
| `bundles`, `related` | no | Bundle offers and related products (full page only). |
| `breadcrumb` | no | Breadcrumb (full page only). |

`info` and `delivery` carry purchase terms: when the template omits them, the kit appends them right after the
`buy` slot, so they are never lost. Other omitted optional slots are not shown. The close button of the dialog
and the sticky mobile buy bar stay kit-owned and outside the template.

### 3.2 Cart panel — `template[data-pagosya-cart-template]`

Replaces the inside of the cart drawer (header, body and footer). The dialog element, its open and close
behaviour, focus handling and scroll lock stay kit-owned, and the DNA cart variant (drawer, sheet, page, overlay)
still decides where the panel sits.

Slots (`data-cart-slot`): `lines` (required; the cart line list), `total` (required), `action` (required; the
checkout button), `suggestions`, `savings`, `note` (the "total se confirma en el checkout" line), `policies`,
`empty` (optional authored content shown only while the cart is empty, instead of the kit's empty text).
The template must also contain one `button[data-cart-close]`; "Seguir comprando" becomes whatever the template
authors with `data-cart-close`.

### 3.3 Cart line — `template[data-pagosya-cart-line-template]`

One root, cloned per line. Fields (`data-cart-field`): `name` (required), `line-total` (required),
`quantity` (required; the kit renders the −, count and + controls), `photo` (an `img`), `option`, `unit`,
`stock`, and `remove` (a `button`; the kit binds it to the line). Used in the cart panel and in the checkout
review.

### 3.4 "Added" notice — `template[data-pagosya-added-template]`

Fields (`data-added-field`): `message` (required), `photo` (an `img`), `name`. It must contain one
`button[data-cart-open]`. Position, timing and motion stay kit-owned (they follow the DNA and the store's
motion personality).

### 3.5 Checkout review — `template[data-pagosya-review-template]`

Slots (`data-review-slot`): `summary` (required; lines, savings and total), `fields` (required; delivery method,
branch, shipping, address, store credit, status and the pay action), `title`, `back`. The template decides the
layout (columns, order, framing). The secure-fields rule for hosted stores still applies inside `fields`.

## 4. Validation and fallback

- A template that is missing a required slot or field, has more than one root, or puts an `img` field on a
  non-`img` element is not used. The kit renders its default markup for that surface and sets
  `data-<surface>-template-invalid="true"` on `<html>` (`product-page`, `cart`, `cart-line`, `added`,
  `review`). A broken template never blocks a purchase.
- The Studio's browser checks read those flags and report a failed check in plain Spanish, for example
  "La plantilla del carrito no tiene el total", so a YAPI repair can fix it and publishing stays blocked until
  it does.
- The existing checks keep running inside templates: buy control visible and usable, prices and totals readable,
  contrast, no horizontal overflow at 1280, 768, 390 and 320px.

## 5. Styling

- When a store supplies the product page template, its authored CSS may style the template's own classes and
  slots. Rules aimed at the kit's internal hooks (`.product-detail__*` and the rest of `productHook`) are still
  stripped, so a store frames the kit's pieces but cannot break them.
- The contrast guard and motif protection apply unchanged to kit pieces rendered inside templates.

## 6. Component (React) mode and YAPI

- `lib/ui.tsx` gains `ProductPageTemplate`, `CartTemplate`, `CartLineTemplate`, `AddedTemplate` and
  `ReviewTemplate`, plus a `Slot` helper, that render the `<template>` elements above, so themes and YAPI write
  JSX instead of raw attributes.
- The generation prompt documents the templates as optional, with the required slots listed, and the Next.js
  validator (`validateNextSources`) accepts them. Teaching YAPI to use them by default is left to the themes
  program; T1 only makes them available and safe.

## 7. Tests

- API (Jest, JSDOM, like `source-commerce-*.spec.ts`): each template fills its slots and fields; required
  pieces missing → default markup and the right invalid flag; quantity, remove, add, close and checkout actions
  work through template markup; prices and totals come only from the kit (a template that pre-fills a price is
  overwritten); the product page appends `info` and `delivery` when omitted; stores without templates render
  exactly as before (the existing suites are the regression net).
- Studio (Playwright, real browser): a store with all five templates passes the browser checks at 1280 and 390
  and completes the preview checkout; a store with a broken cart template reports the plain-Spanish failure.
- Screenshots of a sample templated store at 1280 and 390 under `tmp/kit-templates-shots/`, reviewed before
  merging.

## 8. Out of scope

Identity libraries and motif placements (T2), the eight themes (T3), the identity engine (T4), the Studio
gallery (T5), and changing YAPI's default output.
