# Section library — Shopify-theme quality without AI-written layout (2026-10-31)

Owner 2026-10-31: «lets build 30 … pick shrine-pro-demo, shrine-pro-demo-2, shrine performance, gumdrop, azimuth … select the rest,
work overnight … polish them as much as you can, find errors fix them and make them perfect … real pretty and ecommerce like sellers».
Decision (owner, same night): the home writer's free layout keeps making new errors and stricter checks made it game them; a theme's
quality comes from sections designed and tested once. YAPI does the merchant's part only: pick sections, order them, fill them.

References (screenshots in .superpowers/sdd/2026-10-31-section-library/refs): Shrine Pro (PHERO, CHUG), Gumdrop (SharkBites),
Azimuth, and my picks for range — Prestige «Couture» (luxury), Be Yours «Sheen» (fashion/beauty), Shapes «Fizz» (playful drinks),
Local «Caffeine» (food/coffee). shrine.io/pages/performance would not load (timeout); the two Shrine demos carry its look.

## Shape

- **Sections are template code.** `components/library.tsx` in Esencial (+ a `/* section library */` block in styles/globals.css).
  Each section is tested at 1280 and 390, with short and long words, with each band tone, and with the store's own fonts and colours.
- **`layout` in store-data.** `export const layout: LibraryBlock[]` — an ordered list of `{ type, look?, band?, eyebrow?, title?, text?,
  cta?, link?, photo?, photo2?, items?, products?, product?, category? }`. Empty → the home renders exactly as before (old stores).
- **The composer** (one structured call, after the data-only polish, behind `YAPI_SECTION_LIBRARY=1`): reads the store's facts
  (products with ids/categories/prices, categories, photos as indexes with their visual-assets roles, promo codes, delivery and
  pickup, locations, subscriptions, the merchant's words) and the catalogue below, and answers the layout. **Code validates every
  block** (needs met, photo indexes real, product names/ids real, words capped) and drops what fails; it then guarantees the frame:
  first a cover, a main product grid with filters, last a closing. Photos are bundled like the hero (preview cannot load /v1/uploads).
- **Owner rules kept in the sections, not checked afterwards**: each photo once per page (the composer is told the photos already
  used; code drops repeats), never 3+ photos side by side outside product cards, no dark band of words alone (every dark section
  carries a photo or products), calm colours (one accent; tints of the palette, no rainbow), no invented facts (claims only from the
  merchant's words/products; reviews only real — the runtime mount hides when there are none).

## The 34 sections (role → ids)

| Role | id | From | Needs |
|---|---|---|---|
| cover | cover-split | CHUG, Caffeine | 1 photo |
| cover | cover-full | Azimuth, Prestige | 1 wide photo |
| cover | cover-poster | Shapes «SLAM» | 1 photo, bold brand |
| cover | cover-half | Be Yours | 1 photo |
| cover | cover-centered | Prestige/luxury | 1 photo |
| cover | cover-ribbon | Gumdrop | 1 photo, playful |
| strip | strip-marquee | Gumdrop, Shapes | 3+ words |
| strip | strip-services | Gumdrop, Prestige | delivery/pickup/returns facts |
| strip | strip-badges | Shapes | 3+ product qualities in the merchant's words |
| products | products-grid | Azimuth | — (main grid, filters) |
| products | products-tabs | Prestige, Gumdrop | 2+ categories (main grid) |
| products | products-spotlight | Gumdrop «Today's best», Shapes «Flavour of the month» | 1 product |
| products | products-cards | CHUG | 3–4 products |
| products | products-lookbook | Azimuth «Base layer to boot» | 1 photo + 2–3 products |
| products | categories-tiles | Shrine, Be Yours | 2+ categories with photos |
| story | story-split | Azimuth, Prestige | 1 photo |
| story | story-checker | Caffeine, Gumdrop | 2 photos |
| story | story-overlay | Azimuth «Designed for motion» | 1 wide photo, 3 points |
| story | story-list | Azimuth «Performance by design» | 1 photo, 3–4 points |
| story | statement-inline | trend (words with photo chips) | 2 photos |
| benefits | benefits-orbit | Shrine «Unique scents», Shapes «In the can» | 1 photo, 4 points |
| benefits | benefits-bento | Shapes cards, Gumdrop tiles | 1 photo, 3 points |
| benefits | compare-table | Shrine, Gumdrop, Shapes | 3+ true claims |
| benefits | steps-howto | — | 3 steps, 1 photo |
| benefits | usecases | CHUG «Fuel your day» | 2 photos |
| proof | reviews-wall | Shrine | real reviews (runtime) |
| proof | reviews-cards | Gumdrop, Be Yours | real reviews (runtime) |
| promo | promo-code | Be Yours sale strip | an active promo code |
| promo | promo-pair | Caffeine, Be Yours | 2 photos |
| promo | promo-banner | Be Yours «Babaton» | 1 wide photo |
| info | faq-split | — | 3+ questions from real facts |
| info | visit-store | Prestige boutique | a pickup location |
| info | newsletter-photo | Shapes | 1 photo |
| closing | closing-photo | — | 1 photo |
| closing | closing-wordmark | Shapes footer word | 1 photo |

## Testing

`gallery.ts` (ledger folder) renders a real store's Esencial project with any layout through the same preview the Studio uses,
screenshots each section at 1280/390, and runs the page rules from the reverted 2026-10-31 checks as a QA tool (overlap, cut words,
loose stickers, odd fonts, boxes, photo repeats) — they guide my fixes, they never block YAPI. Then live stores from ~/Downloads
folders through the real chat-jobs flow.
