# A store from a product link (sub-project A) — design

Date: 2026-10-18 · Branch: feature/store-page-architecture · Owner approval: «its ok build it» (2026-10-18)

## Goal

A merchant opens a new store, pastes a product link (Alibaba, AliExpress, Amazon, Shopify shop, take.app, any shop) or sends
photos or screenshots, and YAPI builds the whole store around that product from the first message: the real catalog product
(name, description, photos, options, price), every page, the product page, policies and FAQ. The merchant only confirms the
price and publishes.

Sub-project B (copy a website's structure and look in the merchant's brand) follows in its own spec.

## What the spike found (2026-10-18, from the owner's Mac on a home connection)

| Site | Plain fetch | Headless browser |
|---|---|---|
| Shopify shop | product (JSON-LD) | product |
| Alibaba | product (JSON-LD, 6 photos) | captcha |
| Amazon | captcha | product (title, price, 14 photos in the DOM) |
| take.app | name + 1 photo | product (JSON-LD) |
| AliExpress | empty shell | 1 of 2 products (JSON-LD), the other a robot check |
| Facebook Marketplace / page, Instagram | error | login wall (title behind it) |
| Temu, Mercado Libre, Cloudflare shops | blocked | blocked |

A data-centre server will be blocked more often than that Mac. Scrapling would not open Temu or Mercado Libre: they challenge
the connection itself, which needs residential proxies (a paid service).

## Decisions

1. **The reader tries cheap first.** (1) The DNS-pinned safe fetcher with a browser user agent, (2) the guarded headless
   browser (every request still goes through the pinned fetcher; GET data requests are allowed so pages that load their product
   by script fill in), (3) a paid scraping service only when `PRODUCT_SOURCE_PROXY_URL` is set (a URL template with `{url}`,
   which fits ScraperAPI, ZenRows and ScrapingBee; off by default), then (4) YAPI asks for screenshots or photos.
2. **Facebook, Instagram and TikTok links are never fetched.** They need a login; YAPI asks for screenshots and photos at once.
3. **Extraction is pure and generic:** JSON-LD Product/ProductGroup first, then Open Graph and product meta tags, plus Amazon's
   DOM (title, price, `hiRes` photos). A page counts as a product only with a name and at least one photo.
4. **When.** Only a store with no saved revision (the first build), only links in the merchant's current message, at most one
   product link. A link with «como / estilo / igual / inspírate» wording and no selling words stays a website reference (B).
5. **Photos** are imported into the merchant's uploads with the brand-source importer (up to 8, at least 400 px), and enter the
   request as product photos.
6. **The server creates the catalog product, not the build model.** The build model may only create products priced in the
   merchant's own words, which is right and stays. The product is created before the build so the build designs around a real
   product. The conversation step, which already sees the photos, writes its catalog name and description in the merchant's
   language (`productCopy`); the listing's title is the fallback.
7. **Price.** A price in the merchant's message («Bs 120», «USD 25») is used and confirmed. Otherwise the listing's price is used
   when it is in BOB or USD, else 0, and the product is marked `priceToConfirm`. Publishing is blocked while any active product
   of the store has a price to confirm. A supplier price never goes live by accident. Any merchant price change (product editor or
   YAPI) clears the mark.
8. **Options** become variants when the listing has one or two option groups and at most 24 combinations, all at the product's
   price.
9. **The build gets a PRODUCT SOURCE block:** sell this one product; build the full store around it (home, product page, policies,
   FAQ); never mention the supplier, marketplace, supplier price, minimum order or shipping from China; never copy the listing's
   text word for word; never invent certifications, reviews, stock or delivery terms.
10. **Failure.** A blocked or login-walled link with no attached photos gets a plain reply naming the site and asking for
    screenshots or photos and the price; no build runs. With photos attached, the build runs from the photos.
11. **Reply.** After the build, YAPI says where the product came from and, when the price must be confirmed, says so.

## Units

- `product-source/product-source-links.ts` — which URL in the message is a product link; social hosts. Pure.
- `product-source/product-source-extract.ts` — HTML → `ProductListing` or null; blocked-page detection. Pure.
- `product-source/product-source-render.ts` — guarded headless render returning the page HTML.
- `product-source/product-source-read.ts` — the tiered reader: `readProductSource(url)` → listing or failure reason.
- `product-source/product-source-catalog.ts` — merchant price from the message, variants from options, the product's data.
  Pure.
- `product-source/product-source-prompt.ts` — the PRODUCT SOURCE block and reply lines. Pure.
- `source-website-fetch.ts` — optional user agent and a `data` resource kind.
- `source-chat.service.ts` — wiring in `send()`.
- `source-conversation.service.ts` — `productSource` context and `productCopy` output.
- `source-publishing.service.ts` — the price gate. `payment-links` update clears the mark.
- Prisma: `PaymentLink.priceToConfirm Boolean @default(false)` (migration).

## Testing

Unit tests for every pure unit (fixtures shaped like the spike's pages), the reader's tier order with injected fetchers, the
chat wiring (product created, block in the instruction, failure reply), the publish gate. A live run on a real Alibaba and a
real Shopify link once the migration is applied.

## Out of scope (later)

Adding a product from a link to an existing store; several products from several links; the paid service's choice and trial;
the Studio badge for «precio por confirmar» beyond the publish message.
