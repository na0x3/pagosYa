# Fashion look (cards + product page) — design

2026-10-21 · part 2 of 3 (photo zoom → fashion look → dropdown menu)

## Why

For the NOA VARGAS Atelier store and clothing / designer brands in general, the owner wants product cards and product
pages that look like John Smedley's (johnsmedley.com/row, screenshots 2026-10-21): more premium than the current Esencial
cards. Clothing stores always get this look; every other store keeps today's dice.

## Who gets it

- The Esencial fill call's read of the business gains `kind: 'fashion' | 'other'` (in `MasterRead` / `MasterCharacter`,
  `source-master.ts`). Fashion = clothing, fashion, designer wear, couture, knitwear, shoes, bags, accessories worn.
- Backup word check when the read is missing or says other: store name, description and category names matching
  ropa, moda, prenda(s), atelier, couture, alta costura, diseñador(a), vestido(s), blusa(s), camisa(s), pantalón/pantalones,
  chaqueta(s), abrigo(s), tejido(s), punto, sastrería, boutique, lencería, calzado, zapatos, carteras, bolsos.
  Ambiguous words («tejido», «punto», «boutique») count only together with a second fashion word; the list lives in one
  tested function.
- Fashion stores: the dice skip `cards` and `pdp`; they are set to the new `fashion` variant. Everything else (hero,
  palette, fonts, header, sections…) still rolls as today.
- NOA VARGAS (store cmvi4x7xb0018rb8uvj9ddgzc) is switched as the live check: refill its master with the fashion variants
  as a new revision, keeping its photos and copy.

## The card (`cards: 'fashion'`, Esencial)

Matches the first and third screenshots:

- A soft tinted photo panel (`--es-muted`), 4:5, the photo `cover`; sharp or soft corners from the store's `corners` roll.
- The label top-left inside the panel, small regular text (e.g. «Unisex Fit», «Seda natural», «Edición limitada») — from
  the product's existing `cardEyebrow` field. No label → nothing shown.
- Below the panel, one line: name on the left, price on the right (wraps under the name on narrow cards). Under it, one
  quiet line: «3 colores» when the product has a colour option with 2+ values, the colour name when it has exactly one,
  otherwise nothing.
- On hover (desktop): colour bars across the bottom of the photo, one per colour value; hovering a bar shows that colour's
  photo when the product has per-colour photos, else the second photo. On touch: no bars, the second photo is not shown.
- No «Agregar» button: clothing needs a size, so the whole card opens the product. The photo-zoom button from part 1
  sits top-right.
- A colour option is the option group named Color / Colour / Colores / Tono (case and accents ignored). Sizes: Talla /
  Tallas / Size / Medida.

## The product page (`pdp: 'fashion'`, Esencial + kit product page)

Matches the second screenshot. Desktop: two equal halves, full viewport height under the header.

- **Left (info):** name in the heading font, large; under it «Categoría • label» (category name, then `cardEyebrow` if
  any); the description cut to 4 lines with «Leer más» to expand; the price; then, pushed to the lower part of the column:
  «Guía de tallas» link (only when the store has a size-guide page or section), the sizes as round pills (sold-out sizes
  crossed through with a diagonal line, disabled, labelled «agotado» for screen readers), a full-width dark button that
  reads «Elige una talla» until a size is chosen, then «Agregar · Bs 7.150»; then «4 colores: Negro» with the colour bars
  (a bar per colour, the chosen one underlined; choosing one switches the photos to that colour).
- **Right (photos):** one photo at a time, full height, ‹ › arrows on the sides, a small thumbnail of the next photos
  bottom-right; click opens the part-1 viewer; hover magnifier from part 1.
- Products without sizes or colours simply skip those rows; a product without photos gets the info column full width.
- **Phone:** photo first (swipe, dots), then the info column; the add button sticks to the bottom once scrolled past.
- **«También te puede gustar»:** the related row uses the fashion card, with the heading on the left like the screenshot
  on desktop and above the row on phones.
- Built as a kit product-page style (`data-style=fashion` in commerce.js, next to `atelier`) so the purchase logic, stock,
  options and checks stay the kit's; Esencial's `pdp: 'fashion'` picks that style. The existing purchase check must pass.

## The label (YAPI writes it)

- For fashion stores, at master fill (new stores) and in the NOA VARGAS refill: one extra small model call writes a label
  of at most 3 words per product from its name, description and options (fit, fabric, «Edición limitada»…), Spanish, no
  invented claims (no «100% algodón» unless the description says it).
- Only empty `cardEyebrow` fields are written; merchant text is never overwritten. The merchant edits it in the product
  editor (the field already exists; check its label reads «Etiqueta en la foto» in the dashboard).
- A failed label call never fails the build; cards just show no label.

## Testing

- API: `kind` read + word check (fashion / food / mixed names), dice keeps `cards`/`pdp` fixed for fashion, label writer
  only fills empty labels and caps at 3 words.
- Kit jsdom: colour count line, colour bars + photo switch, sold-out size pills disabled, button text before/after a size.
- Esencial template spec renders the fashion card and product page.
- Live check on NOA VARGAS, desktop + 390 px, screenshots side by side with the John Smedley screenshots; purchase check on
  a sized product.

## Out of scope

Wishlist / bookmark icon, «Shop by fit» filters on the catalog page, per-colour URLs, fit guides drawn as illustrations.
