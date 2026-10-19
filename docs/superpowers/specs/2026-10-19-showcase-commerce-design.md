# Showcase commerce — offer squares, richer cards, products anywhere, sort & filter (design)

Date: 2026-10-19. Status: designed with the owner in conversation (visual companion), awaiting review of this file.
Branch: feature/store-page-architecture. Supersedes the draft `2026-10-16-quantity-tiers-design.md` (folded in as §1).

## 0. Why

Live test 2026-10-19: YAPI copied craverly.co's look well, but its product cards and product page fell short —
our cards are a photo, a name and a price, and the buy box has no offer squares. Owner: "make better product cards by
the inside, like the bundles options, or like subscriptions, i want the squares to be good looking", plus "some
products on x page, some on y page, a product with text to the side, a product with a video to the side", plus
"sorter options … size, price, quantity, color". One spec, four parts (owner's choice).

## Principles (apply to every part)

- **The store kit draws it** (`packages/storefront-kit/commerce-src`), from the store's real data, so Esencial,
  copied and YAPI-designed stores all get it. Templates and YAPI only say *where* and *which style*.
- **Only true numbers.** Every price, saving and per-unit figure uses the server's own math (sale price, bundle
  `floor(eligible × % / 100)`, subscription discount) — the page never promises a figure the checkout won't charge.
- **No invented social proof.** No «POPULAR» / «Más vendido» without data. Automatic labels are facts only
  («Mejor precio»); anything else is the merchant's own words.
- **Variety like the rest of Esencial:** each layout choice below is a store variant the dice rolls (variety spec
  2026-10-19) and YAPI switches on request; the kit falls back automatically when a layout doesn't fit the data.

## 1. Offer squares (product page + quick-look)

### What is offered
- **1 unidad** — regular price (sale included); always present, selected by default.
- **Packs** — every active `FIXED` `StoreBundle` whose `items` is exactly one entry for this product with
  `quantity ≥ 2`, shown when `store.bundlesEnabled`. Sorted by quantity, at most 3. (Pricing already exists:
  `apps/api/src/stores/bundle-pricing.ts`.)
- **Subscription** — the product's `subscriptionOptions` (Subscribe & Save), one square per frequency.

### Each square
Total; old total struck through when lower; per-unit price for packs («Bs 63,75 c/u»); «Ahorras Bs X» pill;
subscription squares say the frequency and «cancela cuando quieras» (existing consent text unchanged).
- **«Mejor precio»** — automatic on the option with the lowest price per unit when it is strictly lower than
  1 unidad. Never on «1 unidad».
- **Merchant label** — optional free text (≤ 24 chars) on one pack or one subscription option («Recomendado»,
  «El favorito de la casa»). When present it replaces «Mejor precio» on that square only.

### Layouts (store variant `offers`: `steps` | `grid` | `rows`)
- `steps` — «Compra única / Suscríbete» first, then quantity squares (subscribe shows frequency squares).
- `grid` — every option a square side by side (2 across on phones, up to 4 on desktop).
- `rows` — full-width rows, price on the right.
- Fallbacks: > 4 options → `rows`; packs **and** subscription → `steps` or `rows` (never `grid`); no packs and no
  subscription → today's quantity stepper, no squares.

### Behaviour
- Picking a square sets the quantity / purchase mode; the add button and sticky bar follow
  («Añadir 3 — Bs 191»). Changing the stepper selects the matching pack or none.
- Hidden: a pack larger than the selected variant's remaining stock; squares for memberships, boxes, digital goods.
- A pack shown as a square is removed from «Llévalo en paquete» so the offer never shows twice.
- Lives in the kit's `buy` slot, so authored product pages (`data-pagosya-product-page-template`) get it with no
  contract change; the surface checks (clip/cover) must pass with it present.
- Quick-look popup shows the same squares (owner's choice, option 3).

### Studio
- «Tipo de oferta» gains **«Descuento por cantidad»**: one product, rows of `cantidad → % descuento`; saving writes
  one `FIXED` bundle per row (name auto-filled «Lleva 2 · Taza»), listed grouped under the product.
- Pack and subscription editors gain the optional **«Etiqueta»** field.

## 2. Product cards

### Designs (store variant `cards`: `showcase` | `compact` | `split`)
- `showcase` — big cards, 2 across: eyebrow, name, big price, chips or ✓ points, save pill, full-width button;
  cards alternate the palette's light and dark surfaces; best-value card in the dark one with a badge.
- `compact` — small card (4 across): colour dots, one green best-deal line, sale pill, quick add.
- `split` — photo left, story right: eyebrow, points, price with the best offer as a pill, add button.
- Fallbacks: `showcase` with > 8 products in one grid → `compact`; `split` stacks on phones.

### What fills a card (real data only; an empty field is simply absent)
| Part | Source |
|---|---|
| Eyebrow | new `PaymentLink.cardEyebrow`; else the category name; else nothing |
| ✓ points | first 2–3 of `highlights` |
| Chips | colour variants → dots; other option values (size, flavour) → text chips, max 4 then «+N» |
| Price | sale price + struck regular price + «Ahorras Bs X» pill |
| Best-deal line | «Desde Bs X c/u» (best pack) and/or «Suscríbete −N%» (best subscription) |
| Best value | the product with the largest real saving (sale, pack or subscription) in that grid gets the dark surface and «MEJOR PRECIO»; nothing on sale → no badge |
| Button | simple product → «Agregar» adds to cart; variants or offers → «Ver opciones» opens quick-look with the squares |

### Who writes the eyebrow and points
The product page writer (`ProductPageWriterService`, already runs for each new product) also writes `cardEyebrow`
(≤ 28 chars) and, when `highlights` is empty, up to 3 highlights — from the merchant's facts only, never invented
claims. Both are editable in Studio on the product (eyebrow is a new field next to highlights).

### Authored card templates
Templates with their own card (`template[data-pagosya-product-template]`, e.g. Esencial, copied stores) may add new
optional fields that the kit fills: `data-product-field="eyebrow|points|chips|deal|save"` and a `data-card-best`
attribute set on the best-value card. Esencial's card gets all of them, styled per its `cards` variant. Templates
that don't use them keep working unchanged.

## 3. Products anywhere

Three kit blocks YAPI places on any page the merchant names:
1. **Chosen set** — `data-pagosya-catalog` with `data-products="id,id,…"` (merchant's order), or
   `data-category="id"`, or `data-collection="slug"`. Store's card design. A missing/inactive product is skipped;
   an empty set hides the block.
2. **Product + text** — `data-pagosya-spotlight="<productId>"` renders a live buy card (photo, name, price, offer
   squares, add button); YAPI writes the text beside it. `data-side="left|right"`; stacks on phones.
3. **Product + video** — the same spotlight beside a merchant-uploaded video: muted, loop, `playsinline`, poster
   frame, lazy-loaded near the viewport, tap to unmute. Stacks on phones.

YAPI:
- Resolves product names to ids against the store's real catalogue (a lookup tool for the agent); creates the
  named page if it doesn't exist; inserts the block. On master (Esencial) stores this is a design edit under
  `MASTER_EDIT_RULES`.
- **Hard check on save:** every id in `data-products` / `data-pagosya-spotlight` must be an active product of the
  store, every `data-category`/`data-collection` must exist — otherwise the save is refused and YAPI asks which
  product was meant. A named video that was never uploaded → YAPI asks for it, never an empty frame.

## 4. Sort and filter

- **Where:** the kit's catalog on the shop page and category/collection pages. Not on the homepage's short grid,
  not on chosen-set blocks, not when the store has < 6 active products.
- **Filters (each only when the data has it):** Categoría · Precio (two-handle range, min–max of the store) ·
  Color (dots from colour variants) · Talla/Tamaño and other variant option names · Con descuento · Disponible
  (stock tracked) · Packs/Suscripción (offered).
- **Sort:** Destacados (the store's own order) · Precio ↑ · Precio ↓ · Novedades (`createdAt`) · Mejor oferta
  (largest real saving).
- **Layout (owner: a combination):** desktop → sidebar when ≥ 9 products or ≥ 3 filter groups, else a top bar of
  pill dropdowns; phones → «Filtrar (N)» button opening a bottom sheet with «Ver N productos». Active filters show
  as removable chips with «Borrar todo».
- State in the URL (`?color=rojo&orden=precio-asc`): shareable, back button works. Zero results → «No hay productos
  con estos filtros» + «Borrar filtros». Real buttons/checkboxes; result count announced (`aria-live`).

## 5. Data and migration (owner applies)

- `StoreBundle.label String?` (≤ 24) and `ProductSubscriptionOption.label String?` (≤ 24) — merchant labels.
- `PaymentLink.cardEyebrow String?` (≤ 28).
- Public store config carries `label`, `cardEyebrow`; store variants `offers`, `cards` live in the Esencial
  store-data / config DNA like the other variants (no column).
- Dice: add `offers` and `cards` parts to `esencial/template.json` `master.variants`
  (`offers: steps|grid|rows`, `cards: showcase|compact|split`); merchant-named switches go through the existing
  `variantChoices`.

## 6. Testing and order of work

1. Migration + DTOs + public config fields; Studio «Descuento por cantidad» and «Etiqueta»; API tests for labels,
   eyebrow, and `bundle-pricing` cases (2-pack + 3-pack on one product with 2, 3, 4 and mixed-variant units).
2. Kit offer squares (jsdom harness): only one-product FIXED bundles of this product; «1 unidad» default; picking a
   square sets quantity/mode and the add payload; shown saving equals the server's for that quantity; stock,
   membership and subscription hide rules; «Mejor precio» only on a strictly lower per-unit price; merchant label
   replaces it; not repeated in «Llévalo en paquete»; works in an authored `buy` slot; quick-look shows it.
3. Kit cards: each field fills from data and is absent when empty; best value only on a real saving; button
   behaviour; authored-template fields; fallbacks.
4. Kit blocks: chosen set shows only named products in order, hides when empty; spotlight live card; video
   attributes. API: product lookup tool; the save check refuses unknown ids/categories/collections.
5. Kit sort & filter: filters only when data supports them; each sort order; URL state; zero results; < 6
   products → none; layout choice by size and width.
6. Product writer writes `cardEyebrow` and missing highlights from facts only.
7. Screenshot QA: cards × offers × filter layouts at 1280 and 390, on Esencial and on the copied Antojo Café.
8. Live check (ChatGPT plan): Antojo Café with packs, a subscription, colours and sizes — buy a 3-pack to the cart
   quote; «una página Regalos con la caja, la taza y el café 500 g»; «el latte con mi video al lado»; filters on a
   phone.

## Out of scope

«Más vendido» (needs order data), free-shipping-per-pack labels, search, the store popup and suggestion cards
(`2026-10-19-store-popup-suggestions-design.md`).
