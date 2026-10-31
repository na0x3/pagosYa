# 34 complete store templates (2026-10-31)

Owner 2026-10-31, after the section library shipped (d1d1fc92): «i wanted 34 whole new templates … things like these» (Palo Alto's
sale countdown and «Shop by Category»); asked to choose, they picked **34 complete templates** — whole themes, each with its own
header, footer, product card, product page, type, colours and home — not one Esencial with interchangeable sections.

## Shape

Each template is a real Shopify theme copied faithfully, built as an Esencial preset (`extends: "esencial"`), so it inherits the
cart, checkout, account, filters, menus and fill engine:

- `template.json` → `preset`: palette (or exact colours), font pair, and the variants that carry the theme's frame — header,
  announce, footer, pdp, button, corners, density, titles, filters, menu.
- `template.json` → `library`: the theme's **fixed home** as a section-library layout (its sections, in its order, with its looks and
  bands, demo words and demo photo slots) and its **product card**.
- New engine parts wherever a theme has something the engine lacks: header/footer variants, cards, and sections (e.g. Palo Alto's
  countdown, collection list with counts, a promo tile inside the grid). Each new part is library code, tested once at 1280/390.

A store built from a template keeps the template's layout (types, order, looks, bands, card); YAPI's composer runs in **fill mode**:
it rewrites words and picks the store's photos per block, and code drops a block the store cannot back (no reviews, no code, no
location) — never adds, reorders or swaps sections. YAPI picks the template for a new store from the business (like a merchant
picking a theme); the merchant can switch templates later.

## The 34 (theme → industry fit)

Captured already (refs/): 1 Shrine Pro (fragrance/beauty) · 2 Shrine Pro 2 / CHUG (drinks/supplements) · 3 Gumdrop / SharkBites
(snacks, kids) · 4 Azimuth (outdoor/sport) · 5 Prestige Couture (luxury fashion) · 6 Be Yours (fashion/beauty) · 7 Shapes Fizz
(soda/playful) · 8 Local Caffeine (coffee/food).
To capture: 9 Palo Alto · 10 Impulse · 11 Motion · 12 Focal · 13 Symmetry · 14 Broadcast · 15 Expanse · 16 Stiletto · 17 Release ·
18 Enterprise · 19 Warehouse · 20 Empire · 21 Pipeline · 22 Taste · 23 Craft · 24 Studio · 25 Refresh · 26 Sense · 27 Colorblock ·
28 Crave · 29 Ride · 30 Origin · 31 Spotlight · 32 Dawn · 33 Publisher · 34 Kidu (final list may swap a theme whose demo will not
load for another of the same industry).

## Build order

Batches of ~6, each: capture refs → list what the theme needs that the engine lacks → build those parts → write the template
(preset + layout + card + demo words) → render with gallery at 1280/390 next to the reference → fix. Then the fill-mode composer and
template choice, then live stores through the real chat flow. Ledger: .superpowers/sdd/2026-10-31-34-templates/progress.md.
