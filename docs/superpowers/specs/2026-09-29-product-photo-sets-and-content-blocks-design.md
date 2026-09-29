# Per-colour photo sets and product content blocks — design (2026-09-29)

Sub-projects 1 and 2 of [the themed product card program](2026-09-29-themed-product-card-program.md). Built in commits `64508ec` through `7adfeea`. Both are data + runtime + merchant UI, with no theming. Migration SQL is written, not applied.

Implementation decisions: content blocks are only `media` and `compare` (existing `specifications` supplies the specification table); compare uses a native range input; set/block photos reuse the existing product photo pool (10 photos maximum); rendering targets the kit runtime, while the older checkout storefront retains its single-photo behavior and gains only the optional variant type field.

## Goal
A shopper picks a colour and the product page shows that colour's photos; the owner can also add photo/caption and before/after blocks. Existing specification rows provide dimensions tables. This feature adds no generated illustrations.

## Part 1 — Per-colour photo sets

**Data.** Variants are JSON on `PaymentLink.variants` (`{ id, name, amount, stock?, options?, imageUrl? }`, `apps/api/src/payment-links/product-variants.ts`). Add `imageUrls?: string[]` (max 8, each an uploaded-file path, same pattern as product `imageUrls`). `imageUrl` stays as the first photo for backward compatibility: on write, `imageUrl = imageUrls[0]`; on read, a variant with only `imageUrl` behaves as a one-photo set. No SQL migration (JSON column).

**API.** `ProductVariantDto` and `normalizeProductVariants` accept `imageUrls`, validate uploaded-file URLs, dedupe, cap at 8, and preserve the previous set when omitted (same rule as `imageUrl`). Exposed on public store data and the storefront config the runtime reads. YAPI's variant schema (`source-product-options.ts`) gains `imageUrls` (null preserves).

**Runtime** (`packages/storefront-kit/kit/commerce.js`). The full gallery includes product and variant-set photos, deduped. A choice whose compatible variants agree on a multi-photo set replaces the gallery; disagreement or a choice without photos restores the full gallery. A single-photo choice keeps the legacy full gallery and jumps to that photo. The current UI automatically completes a valid option combination; it offers no deselection. Opening a product resets to the full gallery. Card `swatch-swap` uses the first set photo. Preview embeds set images; hosted storefronts rewrite them to absolute platform upload URLs.

**Merchant UI.** `packages/variant-editor` supplies a thumbnail checkbox picker, up to 8 photos per option in photo-pool order. Its shared `photos(): string[]` interface is preserved. Studio (`source-create-product.ts`) maps previews to upload paths at save and rejects photos removed from a referenced set. Untouched saved photo fields are omitted; the API preserves them.

**Tests.** Normalization, DTO/public reads, preview hydration, gallery navigation/reset/unsafe URLs, legacy single photos, Studio selection/save mapping and removed-photo guards. Tests use fixtures and mocks; no real database create/update was performed.

## Part 2 — Typed content blocks

**Data.** `PaymentLink.contentBlocks Json @default("[]")`, an ordered array, max 6 per product. Types:
- `media` — `{ type, id, imageUrl, caption?, alt }`
- `compare` — `{ type, id, title, beforeUrl, afterUrl, beforeLabel, afterLabel, alt }` (for the recline / open-closed views)

All text is plain text, length-capped and HTML-escaped at render; images are uploaded-file paths only. This needs a Prisma migration; the SQL file is written by hand and **applied by the owner**, never by an agent (dev DB guard).

**API.** Nested DTO + strict normalizer on create/update payment link; public reads drop invalid rows. Caps: alt 160, caption 140, title 60, before/after labels 24 characters. Stable block IDs survive edits; duplicate IDs are regenerated. Export/import and MCP block editing are deferred.

**Runtime.** Up to six valid blocks render in order after the gallery/copy layout, inside `[data-pagosya-product]`, with hooks `data-part="blocks"`, `"block"` plus `data-part-type="media|compare"`, `"block-media"`, and `"block-compare"`. Unsafe image URLs drop the block; text is escaped; no valid blocks means no wrapper. Compare uses `<input type="range">` and CSS clipping; native arrow-key behavior is preserved. The range is the only added form control. Blocks contain no links or shopper-data fields.

**Merchant UI.** Collapsed "Contenido del producto (opcional)" in Studio's photo step: add, fill, reorder, delete, with a six-block cap. All photos come from the product pool. Required text or removed photos block saving with Spanish feedback; previews map back to uploaded paths.

**Tests.** DTO validation (caps, URL pattern, escaping), render of each type, slider keyboard behaviour, block order, product with no blocks unchanged.

## Out of scope
Theming and skins (3–5), the selection editor (6), generated illustrations, block types beyond media/compare.

## Deployment
The owner must apply `apps/api/prisma/migrations/20260929120000_product_content_blocks/migration.sql` before using the new API against a real database. Prisma Client generation was verified; no database was accessed or migration applied during implementation.
