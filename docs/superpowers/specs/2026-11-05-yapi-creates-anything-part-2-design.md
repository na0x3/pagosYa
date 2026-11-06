# YAPI creates anything inside the store — part 2: products, categories and discount codes from chat (design)

Date: 2026-11-05 · Branch: oct24-clean · Follows part 1 (`2026-11-05-yapi-creates-anything-design.md`, items + new pages). Owner
chose: «create + change + remove» for all three; removing a product **archives** it, no question asked; a new product gets a short
description from the merchant's words + options from chat, a photo only when sent; approach A (same quick edit). Design approved in chat.

## Goal

On a template store, YAPI creates, changes and removes products, categories and discount codes through the quick template edit
(one call, one revision, seconds), mixed freely with section and page edits — never the code generator.

Success (live): «crea la categoría Novias y agrega Vestido Aurora a Bs 2.400 con talla S, M y L» → the category, the product in it with
3 options, visible in the store, in Productos and in the menu; «quedan 2 del Vestido Aurora» sets stock; «quita el Vestido Aurora»
archives it and «vuélvelo a poner» restores it; «crea un código NOVIA10 de 10 %» works at checkout and «apaga NOVIA10» stops it;
«renombra Novias a Bridal» keeps every link working; «borra la categoría Bridal» leaves its products uncategorised and removes its links.

## Today

- Quick edit store ops (`source-store-edit.ts`, `StoreOp {part, field, at, title, value}`, `storeDigest`, `applyStoreOps`) already
  change an existing product's name, price, description and photo (part `product`, digest `productos` ≤ 40, numbered `at`). A product
  with options refuses a price change («cambia sus precios en Productos…»). `writeStoreChange` (`source-chat.service.ts`) writes them in
  one transaction; the popup creates/turns on `BIENVENIDA<n>` codes.
- Creating or deleting a product goes to `rest` → the full build (`products` ≤ 6 / `productOperations`, `source-projects.service.ts`
  `append`), slow and not meant for template stores. Its delete is a hard delete (photos removed).
- No chat path creates/renames/removes categories, sets stock, assigns a category, edits options, or creates/toggles codes.
- Models: `PaymentLink` (`status` ACTIVE|ARCHIVED, `stock` Int? = null unlimited, `categoryId`, `variants` Json
  `[{id,name,amount,stock}]`), `Category` (`name`, `sortOrder`; delete sets products' `categoryId` null), `PromoCode` (`code` unique per
  store, `discountType` PERCENT|FIXED, `discountValue` % or cents, `isActive`, `showInEmails`, `showInAssistant`; no delete in
  `PromoCodesService`, only `setFlags`).
- Links to a category: the menu uses `category:<id>` (`source-store-menu.ts`); library sections use `category:<name>`
  (`source-section-library.ts`, categories-list / categories-tiles items, «Ver todo» buttons).
- Helpers to reuse: `priceCents`, `STORE_CAPS`, `photoRef` (`source-store-edit.ts`); `normalizeProductVariants`, `totalVariantStock`
  (`payment-links/product-variants.ts`); `applyVariantOperations` (`source-product-options.ts`); `templates.refill(…, { refreshData })`.

## Design

### 1. What YAPI does

**Products**
- **Create** (≤ 6 per request). Name and price required; missing either → `ask` («¿A cuánto vendes la Torta de chocolate?»), no product.
  YAPI writes a 1–2 line description in the store's voice using only the merchant's words (no invented ingredients, sizes or claims).
  Options from chat («chica Bs 80, grande Bs 120») become `variants`; the product's `amount` is the cheapest option. A photo only when
  attached to the message (`photoRef`). A named category: existing, or created in the same request. Currency: the one the store's
  products already use (BOB when none). `priceToConfirm` false.
- **Change**: today's name/price/description/photo stay as store ops; new: stock («quedan 5» → 5, «sin límite» → null), category (into
  one, or out of any), options (add with price [+stock], remove, price, stock of one option — replaces today's options refusal).
- **Remove** = archive (`status: ARCHIVED`, photos and orders kept). «Vuelve a poner X» restores (`ACTIVE`); the digest shows ≤ 20
  archived products for that.

**Categories**: create, rename, remove (products stay, uncategorised), move in the order. A name already used (accent- and
case-insensitive) is reused, never duplicated.

**Discount codes**: create with a percent (1–99) or a Bs amount. Unnamed → YAPI names it from the merchant's words (e.g. VERANO15),
else `DESCUENTO<n>`, and says the name. Turn off / on («quita/borra el código» = off, as in the dashboard). Shown in emails or offered by
the store assistant only when asked; a new code is private (both flags false). A taken name → refused «ya existe», except an inactive
code with the same discount, which is turned back on.

**Reply**: one line per change in the usual reply (`layoutEditReply`): «Creé «Torta de chocolate» en Tortas, con 2 opciones (chica Bs
80, grande Bs 120). Mándame su foto cuando la tengas.», «Archivé «Torta de limón»: ya no aparece en la tienda; puedes volver a
activarla en Productos.», «El código VERANO20 da 20 % de descuento y ya funciona en el pago.»

### 2. Reading

`storeEditState` / `storeDigest` add:
- `productos` entries gain `stock` (number or «sin límite»), `categoria` and `opciones: [{n, nombre, precio, stock}]` (instead of `true`).
- `archivados`: ≤ 20 archived products `{at, nombre}` (own numbering).
- `categorias`: `{at, nombre, productos: <count>}` in `sortOrder`.
- `codigos`: `{at, codigo, descuento («20 %» / «Bs 30»), activo, correos, asistente}`, active first, ≤ 20.

### 3. Answering

The quick-edit answer (`layoutEditSchema`) gains a third array `catalogo` beside `ops` and `store`, strict, every field present:
`{ kind, at, name, price, stock, text, category, photo, option, value }` (unused: `at` -1, strings "").

| kind | uses |
|---|---|
| `product-add` | name, price (or "" when options carry prices), stock, text (description), category (name, may be new), photo (f0…), value = options, one per line «nombre \| precio \| stock» |
| `product-archive`, `product-restore` | at (`productos` / `archivados`) |
| `product-stock` | at, stock («5» / «sin límite» / «agotado») |
| `product-category` | at, category (name; "" = none) |
| `option-add` | at, option (name), price, stock ("" = sin límite) |
| `option-remove` | at, option |
| `option-price` / `option-stock` | at, option, price / stock |
| `category-add` | name |
| `category-rename` | at, name |
| `category-remove` | at |
| `category-move` | at, value = the position (0 = first) |
| `code-add` | name (code or ""), value («20 %» / «Bs 30») |
| `code-off`, `code-on` | at |
| `code-show` | at, option = `correos` \| `asistente`, value = `si` \| `no` |

`LAYOUT_EDIT_PROMPT` gains a short «Catálogo» block with §1's rules: never invent a price or a discount; describe only from the
merchant's words; ask with `ask` when a price or discount is missing; «quita/borra» a product = `product-archive`, a code = `code-off`;
numbers are the ones shown; the existing `product` store ops keep name/price/description/photo of a single-price product.
The `rest` rule no longer lists products; codes and categories are never `rest`.

### 4. Checking — `source-catalog-edit.ts` (new, pure)

`readCatalogOps(raw)` drops malformed entries. `applyCatalogOps(state, ops, photos)` returns `{ change: CatalogChange, done, refused }`,
the contract of `applyStoreOps`:
- Limits per request: 6 new products, 5 new categories, 3 new codes; extras refused by name.
- Names: product ≤ `STORE_CAPS.productName`, description ≤ `productDescription`, safe text; category ≤ 60, folded-name dedupe against
  existing and same-request names; code upper-cased, `^[A-Z0-9][A-Z0-9_-]{2,31}$`.
- Prices `priceCents`; percent 1–99; fixed > 0. Options through `normalizeProductVariants` (new) / `applyVariantOperations`
  (existing), stock total via `totalVariantStock`; an option name matched fold-insensitive.
- Same-request references: `product-add` / `product-category` may name a category from `category-add` in the same answer.
- No-ops (already archived, same stock, same name) are skipped silently; impossible ops are one `refused` line each.

`CatalogChange`: `categories {create[], rename[], remove[], order?}`, `products {create[], update[{id, status?, stock?, categoryRef?,
variants?}]}`, `codes {create[], flags[{id, isActive?, showInEmails?, showInAssistant?}]}`, `categoryLinks {rename[{from,to}],
remove[name]}`.

### 5. Writing

`writeStoreChange` writes the `CatalogChange` in its existing transaction, in order: categories create → rename → order → products
create → products update (row `FOR UPDATE` before an option-stock change, as in `append`) → codes → categories remove (last, so a
product moved out first keeps its new category). New category ids resolve `categoryRef` names. Then the usual
`templates.refill(…, 'Cambios de YAPI', { refreshData: true, files })` puts the live catalog and categories into `config.js`; `files`
also applies `categoryLinks`:
- rename: every section link and categories-list/tiles item `category:<old>` on the home, product page, menu pages and extra pages →
  `category:<new>` (menu `category:<id>` links keep working on their own);
- remove: those links → `products`, the category's tiles/items dropped, and its `category:<id>` menu link removed.

A catalog-only request saves one revision (no layout change) so the preview refreshes.

### 6. Errors

The transaction writes the whole catalog change or nothing; a database error replies «No pude guardar los cambios del catálogo» and
saves no revision. A refill failure after the write keeps the data and says «Guardé los cambios, pero la vista previa no se actualizó»
(as store-data edits do today). Missing information is an `ask`, never a refusal.

### 7. Testing

- `source-catalog-edit.spec.ts` (pure): every kind; limits; dedupe; same-request category references; option rules; code rules
  (format, 1–99 %, taken/inactive); reply lines.
- `source-layout-edit.spec.ts` / `source-store-edit.spec.ts`: schema has `catalogo`; `readLayoutEdit` reads it; digest shows
  stock/category/options, archived, categories, codes.
- Chat service spec (Prisma test helpers): one mixed request (category + product in it + code + a section text) → one revision,
  rows (ARCHIVED not deleted, code private), `config.js` catalog; category rename rewrites section links; remove drops links.
- Full dashboard jest suite and the API storefront-source suite stay green.
- Live (on `pnpm dev:chatgpt`, NOA nvkv5rvk or a fresh test store): the seven Success steps, plus checkout with the new code.

## Out of scope

Classic (non-template) stores; collections (playlists), bundles, gift cards, memberships and digital files from chat; category
banners/highlights; code expiry, minimum order or usage limits (the model has none); hard deletes; products beyond the 40 shown.
