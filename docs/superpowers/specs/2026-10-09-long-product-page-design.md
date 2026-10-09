# Long product page, written by YAPI — design

Date: 2026-10-09. Status: design approved in chat by the owner; spec awaiting review.
Reference: the owner inspected https://luhxe.com/products/luhxe-tote-bag-new (a long single-product sales page) and
wants every pagosYa product page to work like it, filled by YAPI automatically.
Builds on: `2026-09-29-product-photo-sets-and-content-blocks-design.md` (content blocks, highlights).

## 1. Decisions (owner, 2026-10-09)

- **Every product's detail page** becomes a long sales page (not a special homepage).
- **Automatic, editable after:** YAPI fills a product when it is created, and when YAPI builds or redesigns the store
  (for products still empty). It shows at once; the merchant edits or deletes anything in Studio. YAPI never
  overwrites what the merchant edited.
- **Sections:** feature icons; story + comparison; FAQ + real reviews; photo details + repeated buy button.
- **Approach A:** the long page is product data (stored per product) that the store runtime draws in the store's
  theme — not text baked into the shared product template, not a page per product.

## 2. Non-negotiable content rules

- Reviews, star ratings, review counts, units sold and press mentions are **never written by YAPI**. The review wall
  shows only real `StoreReview` rows for the product and is hidden while there are none.
- Claims and numbers ("frío 12 h", "laptop 15.6\"") come **only** from the product's name, description,
  specifications, tags, or the merchant's own message. A missing fact means the claim is left out, never guessed.
- No invented scarcity ("pocas unidades"), deadlines, awards, guarantees or competitor names. The repeated buy button
  shows the guarantee line only when the store has a returns policy in Ajustes, and shipping lines only from the
  store's real shipping settings.

## 3. Data (no migration)

`PaymentLink.highlights` and `PaymentLink.contentBlocks` are JSON columns already.

- **Highlights:** cap raised from 4 to 6 (`MAX_HIGHLIGHTS` in `apps/api/src/payment-links/product-highlights.ts`);
  label ≤ 24, detail ≤ 40 as today. Icon set gains `thermometer`, `laptop`, `backpack`, `umbrella` (added to the API
  list, the Studio labels in `product-highlight-icons.ts` and the kit drawing set, kept in step by the existing test).
- **Content blocks:** cap raised from 6 to 12 (`MAX_CONTENT_BLOCKS` in `product-content-blocks.ts`); existing
  `media` and `compare` (before/after) unchanged. New types, all plain text, capped and escaped at render:
  - `story` — `{ type, id, problem (≤ 220), tried (≤ 220), solution (≤ 260), title? (≤ 60) }`
  - `versus` — `{ type, id, title? (≤ 60), ours (≤ 24), theirs (≤ 24), rows: [{ label (≤ 48), ours: bool, theirs: bool }] (2–8) }`
  - `faq` — `{ type, id, title? (≤ 60), items: [{ q (≤ 120), a (≤ 400) }] (2–8) }`
  - `details` — `{ type, id, items: [{ imageUrl (uploaded product photo), title (≤ 40), text (≤ 160), alt (≤ 160) }] (1–4) }`
  - `features` — `{ type, id, title? (≤ 60), items: [{ icon, label (≤ 24), detail (≤ 60) }] (3–6) }` (the large grid)
- **Authorship:** every highlight row and block carries `origin: 'yapi' | 'merchant'` (default `merchant` for rows
  written before this change). Studio sets `merchant` on any edit.

## 4. The writer

`ProductPageWriterService` (new, `apps/api/src/product-content/`), alongside the existing highlight suggester.

- Input: name, description, specifications, tags, category, store name, up to 4 product photo URLs (as images, for
  `details` captions and photo choice).
- Output: one structured-JSON response (strict schema: icon enum, caps, counts) with highlights and the block set.
  The prompt repeats §2; a post-check drops any highlight or block row containing a number that does not appear in
  the input facts.
- Provider: the same route the highlight suggester uses (ChatGPT plan when enabled, else the configured provider),
  with usage recorded like it.
- **Fill rule:** writes only what is empty or `origin: 'yapi'`; never replaces `merchant` content. The automatic
  triggers (1, 2) skip any product that already has highlights or page blocks of either origin; only the explicit
  Studio button (3) rewrites existing `yapi` rows.
- **Triggers:**
  1. After a product is created (`PaymentLinksService.create`), in the background — the request never waits or fails
     on it.
  2. After YAPI saves a new store or a redesign (`SourceGenerationService`), in the background, for each product with
     no page content (bounded: at most 20 products per run, one at a time).
  3. Studio "Regenerar con YAPI" on a product: refills only `yapi` rows.
- Failure: logged; product unchanged; Studio shows "No se pudo generar; reintentar" on that product.

## 5. Rendering (`packages/storefront-kit/kit/commerce.js`)

On the full product page, below the existing product area, in this order (each skipped when absent):
1. `features` grid ("Lo que lo hace especial").
2. `story` (problem → tried → solution).
3. `details` photo cards.
4. Repeated buy (a).
5. `versus` table.
6. Review wall — real reviews for the product (existing review data), newest first, up to 6, with the existing
   rating summary; hidden with zero reviews.
7. Repeated buy (b).
8. `faq` (accessible disclosure buttons).
9. Existing `media`/`compare` blocks keep their current place.

- The highlight row near the buy box shows up to 6.
- **Repeated buy:** a button with the product's buy label that scrolls to and focuses the purchase box (never adds to
  cart directly, so required options are never skipped), plus real lines: shipping/pickup from store settings, and
  the returns line only if `policies.returns` exists.
- **Styling:** each section and item has a `data-part` (`story`, `versus`, `faq`, `faq-item`, `features`,
  `feature`, `details`, `detail`, `review-wall`, `buy-again`) styled by the store tokens and the product page theme;
  YAPI's guarded product CSS may style them like other cosmetic parts. Reduced motion respected.
- The quick-view dialog (non-full product page) does not show the long sections.

## 6. Studio

The "Contenido del producto" panel in the create/edit product flow lists all blocks with editors for the new types
(text fields with live character counts, icon picker reusing `PRODUCT_HIGHLIGHT_ICON_LABELS`, photo picker from the
product pool for `details`). Any edit sets `origin: 'merchant'`. A "Regenerar con YAPI" button (disabled while
running) calls the writer for that product. YAPI-written rows show a small "Escrito por YAPI" tag.

## 7. Testing

- Writer: schema caps and icon enum; numbers absent from facts are dropped; `merchant` rows untouched; idempotent
  skip; failure leaves the product unchanged.
- Normalizers: each new block type (caps, counts, escaping, uploaded-photo URLs only); highlight cap 6; `origin`
  default and preservation.
- Runtime: each section renders with its `data-part`; empty product unchanged; review wall hidden with no reviews and
  never shows non-review text; repeated buy scrolls/focuses the purchase box and shows the returns line only with a
  returns policy; quick view unchanged.
- Studio: edit flips origin; regenerate disabled while running; new icon names in step with the API list.
- Triggers: product create returns before the writer finishes; a writer failure never fails create or a YAPI save.
- Live check on a store the owner picks (ChatGPT plan, ask first).

## 8. Out of scope

Bundle selector redesign (existing bundles slot stays); single-product homepage mode; video sections; announcement
bars; any generated or imported reviews.
