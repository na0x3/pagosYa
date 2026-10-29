# Menu to catalogue — design

**Date:** 2026-10-29 · **Status:** approved in chat (owner), awaiting spec review

## Goal

A restaurant, café or bakery uploads photos of its menu (carta) and photos of its dishes; pagosYa reads them and, after the
merchant checks a review screen, creates the store's catalogue: categories, products with prices and descriptions, sizes as
variants, extras, and the matching dish photo on each product.

## Owner decisions (2026-10-29)

- **Photos:** the merchant uploads the menu photo(s) **plus separate dish photos**; the AI matches each dish photo to its
  product. No photos are cut from the menu and none are generated.
- **Where:** both — in store creation («¿Tienes tu carta? Súbela y armamos tu catálogo») and in Productos («Importar desde tu
  carta», next to Shopify / CSV).
- **Sizes and extras:** sizes become **variants** of one product (each with its price); add-ons become **extras**
  («Extra queso +Bs 5»). The merchant checks them before anything is created.
- **Approach:** a new source in the existing store-import pipeline (`apps/api/src/store-import`), reusing its review →
  confirm → write steps. Not a YAPI chat feature, not a separate wizard.

## Success

1. A clear printed menu of 20–40 dishes becomes a reviewable list in under 2 minutes.
2. No invented data: a price, size or name the reader could not read clearly is marked «revisar», never guessed.
3. Nothing is written to the catalogue until the merchant presses **Crear catálogo**.
4. Re-importing the same menu updates the products it created instead of duplicating them.
5. Every dish photo either sits on one product or is listed as «sin plato»; a match the reader is unsure of is marked.

## Flow

### 1. Upload

- Up to 6 menu photos (pages, a board, a printed or handwritten menu) and up to 40 dish photos, uploaded through the existing
  uploads endpoint (`/v1/uploads`), so the files belong to the merchant like any other upload.
- `POST /v1/store-imports/menu` with `{ storeId?, menuUrls[], dishUrls[] }` (merchant auth, same throttle as the Shopify
  routes). It creates a `StoreImport` row with `source = 'MENU_PHOTO'`, `status = 'READING'`, and returns it at once.

### 2. Reading (background, same worker)

- `StoreImport.status` gains **`READING`** before `REVIEW`. The import worker claims READING rows the way it claims QUEUED
  ones (lease, attempts, retry).
- **Menu read:** one vision call per menu photo, at high detail, asking for a strict JSON list of
  `{ section, name, description, price | null, sizes: [{ name, price }], extras: [{ name, price, required }], unsure: [] }`.
  Prices in bolivianos as written; a missing or unreadable price is `null` and the line is marked «revisar». Sections become
  category names. Lines from all pages are merged; the same dish on two pages is kept once.
- **Photo match:** one call with the dish photos at **low detail** and the list of dish names, asking for
  `{ photoIndex → dishName | null, confidence }`. A low-confidence match is kept but marked «revisar»; an unmatched photo is
  listed as «sin plato».
- The result is mapped into the import's existing data shape (`ShopifyStoreData`-style products with variants) plus the new
  `extras` field, and stored in `data` / `preview`; status becomes `REVIEW`.
- **Model:** configurable (`YAPI_MENU_MODEL`); the default is whichever of gpt-5.6-luna / gpt-5.6-sol reads the fixture menus
  correctly at the lower cost (decided by the eval in Testing). On the ChatGPT plan a spent quota sends the row back to
  READING and the worker waits, as the first-design job does; it never fails the merchant's upload outright until its
  attempts run out.

### 3. Review (merchant)

- The existing import review panel (`apps/merchant-dashboard/src/stores-panel.mjs` / `inventory-import-panel.mjs`) shows a
  MENU_PHOTO import as an **editable table grouped by category**: name, description, price, sizes (name + price), extras
  (name + price + required), photo (swap from the uploaded dish photos, or remove), and a delete-line control.
- Warnings at the top: «N precios para revisar», «N fotos sin plato», «N coincidencias de foto para revisar».
- **Crear catálogo** is disabled while any line has no price.
- `POST /v1/store-imports/:id/confirm` accepts, for MENU_PHOTO only, the edited product list (validated server-side: names,
  amounts > 0, sizes and extras shapes, photo URLs must be among the import's uploaded dish photos).

### 4. Writing

- The existing worker run + `import-writer.ts` create categories and products. `ImportProduct` gains
  `extras: Array<{ name: string; amount: number; required: boolean }>`, written to `PaymentLink.extras`.
- Dish photos are already merchant uploads: they are **copied per product** (the 2026-10-24 rule — no two records share one
  file), not fetched like Shopify URLs.
- Re-import: products are matched by the import's `externalId` (a stable key from section + dish name), so a second run of
  the same menu updates them.

### 5. Entry points

- **Productos:** «Importar desde tu carta» beside the Shopify / CSV options.
- **Store creation (Studio walkthrough):** the products step offers «Subir mi carta». The review opens in the same panel;
  after **Crear catálogo** the walkthrough continues with the catalogue in place, so the first build already uses it.

## Not in scope

- Cutting dish photos out of the menu image, and generating dish photos.
- Reading menus from a URL or PDF (photos only; a PDF can come later through the same reader).
- Translating the menu.

## Error handling

- An unreadable photo (blurred, not a menu) → the import stays in REVIEW with zero lines and the message «No pudimos leer tu
  carta. Prueba con una foto más nítida y de frente.»
- A partial read (one page fails) → the lines that were read are shown, with «No pudimos leer la página N».
- Every failure keeps the uploaded files; nothing is deleted.

## Testing

- **Fixtures:** at least three real-looking menus — a pizzeria with sizes, a café with extras, a handwritten board — and a set
  of dish photos for one of them. A small eval script (like `scripts/plan-eval.ts`) runs the reader on them with luna and sol
  and reports names / prices / sizes / extras correct, to pick the default model.
- **API:** the READING → REVIEW → QUEUED → COMPLETED path with the model mocked; confirm validation (no price, foreign photo
  URL, bad extras rejected); writer creates variants and extras; re-import updates instead of duplicating.
- **Dashboard:** the review table edits, warnings and the disabled **Crear catálogo** state.
- **Live check:** one real menu end to end on the ChatGPT plan, from Productos and from store creation.
