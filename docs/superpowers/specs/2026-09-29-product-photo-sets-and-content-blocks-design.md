# Per-colour photo sets and product content blocks — design (2026-09-29)

Sub-projects 1 and 2 of [the themed product card program](2026-09-29-themed-product-card-program.md). Both are data + runtime + merchant UI, with no theming.

## Goal
A chair shop owner picks a colour and the product page shows that colour's photos; the owner can also add extra blocks (e.g. a recline-angle image, a dimensions table) to a product. Everything shown is merchant-supplied; nothing is generated.

## Part 1 — Per-colour photo sets

**Data.** Variants are JSON on `PaymentLink.variants` (`{ id, name, amount, stock?, options?, imageUrl? }`, `apps/api/src/payment-links/product-variants.ts`). Add `imageUrls?: string[]` (max 8, each an uploaded-file path, same pattern as product `imageUrls`). `imageUrl` stays as the first photo for backward compatibility: on write, `imageUrl = imageUrls[0]`; on read, a variant with only `imageUrl` behaves as a one-photo set. No SQL migration (JSON column).

**API.** `ProductVariantDto` and `normalizeProductVariants` accept `imageUrls`, validate uploaded-file URLs, dedupe, cap at 8, and preserve the previous set when omitted (same rule as `imageUrl`). Exposed on public store data and the storefront config the runtime reads. YAPI's variant schema (`source-product-options.ts`) gains `imageUrls` (null preserves).

**Runtime** (`packages/storefront-kit/kit/commerce.js`). `galleryImages(p)` is unchanged for the product-level gallery. When a shopper's selection narrows to variants that share the same photo set, the gallery shows that set (main image plus thumbnails); with mixed sets it keeps the product gallery, as today's single-photo rule does. Deselecting restores the product gallery. Card `swatch-swap` keeps using the set's first photo.

**Merchant UI.** In the variant editor, "Fotos de esta opción": add/remove/reorder up to 8 photos per option, reusing the existing product uploader. The dashboard file that renders the variant image field is to be located at plan time (a grep of `apps/merchant-dashboard/src` found no direct match).

**Tests.** Unit: normalize (cap, dedupe, back-compat, preserve). Runtime: choose red → gallery shows the red set, thumbnails match; mixed selection → product gallery; single-photo legacy variant unchanged. API e2e: create/update variants with `imageUrls`.

## Part 2 — Typed content blocks

**Data.** `PaymentLink.contentBlocks Json @default("[]")`, an ordered array, max 6 per product. Types:
- `media` — `{ type, id, imageUrl, caption?, alt }`
- `specs` — `{ type, id, title, rows: [{ label, value }] }` (max 12 rows)
- `compare` — `{ type, id, title, beforeUrl, afterUrl, beforeLabel, afterLabel, alt }` (for the recline / open-closed views)

All text is plain text, length-capped and HTML-escaped at render; images are uploaded-file paths only. This needs a Prisma migration; the SQL file is written by hand and **applied by the owner**, never by an agent (dev DB guard).

**API.** DTO + validation on create/update payment link; returned on public product data and the storefront config. Included in the store export/import and MCP product tools only where they already carry `imageUrls` (otherwise deferred).

**Runtime.** The product page renders blocks in order below the details (image-led / dense) or after the story (story-led/editorial), inside `[data-pagosya-product]` with stable part names (`data-part="block"`, `"block-media"`, `"block-specs"`, `"block-compare"`) so sub-projects 3–4 can style them. `compare` is a keyboard-operable slider (arrow keys, `role="slider"`). Blocks never contain shopper inputs or links.

**Merchant UI.** "Contenido del producto" section in the product editor: add a block, pick type, fill fields, reorder, delete.

**Tests.** DTO validation (caps, URL pattern, escaping), render of each type, slider keyboard behaviour, block order, product with no blocks unchanged.

## Out of scope
Theming and skins (3–5), the selection editor (6), generated illustrations, block types beyond the three above.

## Decisions to confirm
1. Cap of 8 photos per option and 6 blocks per product.
2. Block types limited to media, specs, compare for now.
3. A hand-written migration for `contentBlocks`, applied by the owner.
