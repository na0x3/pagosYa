# Store themes and per-store identity — umbrella design

Date: 2026-09-25. Status: design approved by the owner in conversation (2026-09-25); this written spec awaits
the owner's review. Each sub-project below gets its own spec → plan → build cycle when it starts.

Owner's request: "look at their websites they are totally customizable, also lets make many themes user can
choose on, but look every website is way different than the other, inside of the products, etc everything
depends on the thematic of the store" and "if its a dog treat store, the button has like a little paw emoji,
with paw drawings on the background … each website should be totally different, not just photo collections,
but different sections, different fonts, buttons, layouts".

Reference: Clyro (clyro.com, "Build a Shopify store in 2 minutes"). Its showcase (Pawland, Peak, Axiom,
Bokendo, Aurelian Vance, Pal, Aura, Mogged; screen recording 2026-09-25) shows eight stores that read as
eight different design studios: own typography, strong color identity, product as hero, and navigation that
changes per store (Bokendo uses an app-style bottom tab bar). Its pricing lets a merchant connect their own AI
so edits cost no credits; that model is noted here and is out of scope.

Related:
- `docs/history/STOREFRONT_THEME_DIRECTIONS.md`: the earlier "Temas" feature was retired because its presets
  fixed colors, fonts and spacing, so stores built from one theme looked alike. This design does not bring
  presets back: a theme here fixes structure and personality only, and every store gets its own identity on top
  (section 3).
- `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` and its sub-projects (design DNA, unique kit
  surfaces, illustrated motion, uniqueness scorecard). This program builds on them.

## 1. What exists (from the code, 2026-09-25)

| Area | Today | Gap for this program |
|---|---|---|
| Product cards | A store may author its own card: `template[data-pagosya-product-template]` with `data-product-field` markers; the kit (`packages/storefront-kit/kit/commerce.js`) fills it. | Works; reused as the pattern. |
| Product page, cart, "added" notice, checkout review | Drawn by the kit's own markup. Design DNA picks among a few fixed variants (drawer, sheet, page, overlay). | A theme cannot own them, so the inside of every store feels the same. |
| Motifs | DNA motifs: at most 3 SVGs, 6 KB each, 64px, in product, card, cart header and confirmation slots. | No buttons, backgrounds, dividers, stickers or empty states; no reusable packs. |
| Fonts | 30 OFL fonts bundled in the kit. | Generation mostly uses the same 5. |
| Uniqueness | `designFingerprint` on revisions; a scorecard measures visible differences. | Nothing rerolls a store that comes out too close to others. |
| Themes | None (retired). | New. |

## 2. Owner decisions (2026-09-25)

1. **A theme is a full store starter.** A gallery of complete, very different stores (home, product page, cart,
   checkout, menus). The merchant picks one and it becomes their store; everything stays editable.
2. **Applying is instant and free.** The theme fills with the merchant's real products, prices, photos, logo and
   store name. An optional "Adaptar con YAPI" rewrites the texts for their business for a few credits.
3. **First set: 8 themes, 2 per kind of business:** Comida y bebidas; Moda y belleza; Hogar, arte y artesanía;
   Tecnología y servicios.
4. **Approach A:** themes own every surface through kit templates; the kit keeps the logic that must never break.
5. **Two layers:** the theme is the skeleton; each store's identity is generated on top so two stores on the same
   theme never look the same.

## 3. The two layers

**Layer 1: theme (skeleton).** Structure and personality: how the header, navigation, product page, cart and
checkout are built, the section styles, the motion personality and the mood (pop, editorial, luxury,
app-style…). A theme declares the ranges its identity may use (allowed font pairings, button styles, card and
frame styles); it never fixes one value.

**Layer 2: store identity (per store).** Chosen from the store's business, products, logo, photos and a random
seed:

1. **Motif pack.** Illustrations tied to what the store sells (paws and bones for dog treats, beans and steam
   for coffee, leaves for plants, a lamp glow for lighting). Placements: `button` (an icon inside calls to
   action and the add button), `pattern` (a low-contrast background tile in chosen sections), `divider`
   (section separators), `sticker` (badges such as "¡Nuevo!"), `empty` (the empty cart), plus today's
   `product`, `card`, `cart` and `confirmation`. Packs come from a drawn library; YAPI draws a new pack only when
   no pack matches, through the existing SVG sanitiser and art gate.
2. **Sections for the business.** A library of about 40 section types, many specific to a kind of business
   (ingredientes, tamaño según tu perro, horneado hoy, lookbook, comparación de especificaciones, muro de
   galería, historia del taller, reseñas, preguntas frecuentes, packs). The theme sets their style; the business
   decides which appear and in what order.
3. **Typography.** A pairing from the theme's allowed list, picked by the seed and weighted away from pairings
   recent stores used.
4. **Buttons and shapes.** About 10 button styles (pill, sharp, sticker with offset shadow, ticket with notches,
   underlined, bubbly with icon, outlined, among others), plus card and photo-frame styles.
5. **Colors** derived from the logo and product photos, held to the existing contrast rules.
6. **Uniqueness.** The identity is fingerprinted and compared with other stores; anything too close is rerolled.

Example, two dog-treat stores on the same pop theme:

| | Huellitas | Canela Pet |
|---|---|---|
| Illustrations | Cartoon paws and bones, stickers | Line-drawn dog faces, dotted paw trail |
| Typography | Shrikhand + Nunito | Anton + Figtree |
| Buttons | Bubbly with a paw icon | Ticket with notched edges and a bone icon |
| Sections | Ingredientes → Tamaño según tu perro → Reseñas | Historia del horno → Packs mensuales → Preguntas frecuentes |
| Colors | From the orange logo | From the teal packaging |

## 4. Sub-projects

| # | Sub-project | Delivers | Depends on |
|---|---|---|---|
| T1 | Kit templates | Optional authored templates for the product page, cart panel, cart line, "added" notice and checkout review, filled by the kit like product cards. Stores without templates render exactly as today. | — |
| T2 | Identity libraries | Motif packs (about 30 topics) and the new placements; about 40 section types; about 10 button styles; card and frame styles; font pairings grouped by personality; palette extraction from logo and photos. | — |
| T3 | 8 themes | 2 per kind of business, each a complete store in the component (React) format YAPI produces, built on T1 and T2. | T1, T2 |
| T4 | Identity engine and uniqueness | A deterministic function from (business, products, logo, photos, seed) to identity choices, plus the reroll when a store is too close to others. No AI. | T2 |
| T5 | "Temas" in the Studio | Gallery, live previews with the merchant's own data, "Otra variación", instant free apply as a new revision, "Adaptar con YAPI". | T3, T4 |

Order: T1 and T2 in parallel, then T3 and T4, then T5. After T1 and T2, stores YAPI designs from scratch also
gain their own product page and cart, motifs everywhere, and the wider font and button range.

## 5. Shared contracts

These are the interfaces the sub-projects agree on; each sub-project spec may refine names, not intent.

- **Templates (T1).** `template[data-pagosya-product-page-template]`, `template[data-pagosya-cart-template]`,
  `template[data-pagosya-cart-line-template]`, `template[data-pagosya-added-template]`,
  `template[data-pagosya-review-template]`. Data enters through `data-product-field` / `data-cart-field`
  markers; actions through `data-cart-action` (`increment`, `decrement`, `remove`, `checkout`, `close`) and the
  existing `data-add` / `data-cart-open`. The kit alone sets prices, totals, stock limits and the checkout
  handoff; a template can place them but never compute them. The automatic checks keep enforcing a visible buy
  button, readable prices and totals, and contrast.
- **Identity (T4 → config).** `config.js` gains `identity: { seed, fonts, button, card, frame, palette,
  motifPack, sections }` with ids only, no prose. The kit and themes read it; the Studio's "Otra variación"
  changes only `seed` and recomputes.
- **Motif packs (T2).** A pack is a folder of at most 8 SVGs of at most 6 KB each, one per placement it
  supports, tagged by topic words. Motifs stay decorative (`aria-hidden="true"`), never cover a price, a buy
  control or a total, and animate with CSS only; reduced motion and motion off stop them.
- **Themes (T3).** A theme is a source-project snapshot plus a manifest: id, name, kind of business, the
  identity ranges it allows, and the section types it can style.
- **Applying (T5).** Server-side: copy the theme's files into a new revision of the store, write the identity,
  run the same checks YAPI revisions go through. Never publishes, never charges credits. The previous revision
  stays restorable.

## 6. The Studio experience (T5)

- A "Temas" button next to "Rediseñar sitio", and "Elige un tema" as the first choice when creating a store
  (next to "Descríbele tu idea a YAPI").
- Gallery filtered by kind of business. Every card is a live, scrollable preview rendered with the merchant's
  own products, logo and name, with their identity applied.
- Opening a card shows the home, a product page and the cart open, at desktop and phone width. "Otra variación"
  rerolls the identity for free.
- "Usar este tema" creates an unpublished revision; the previous design stays in the history.
- "Adaptar con YAPI" shows the credit estimate before running and rewrites only texts and section contents (a targeted edit, not a full
  generation).
- If a theme fails the checks with the merchant's data (for example, a product without a photo), the preview
  says what is missing in plain Spanish and still allows applying. Applying never charges credits; a failure
  saves nothing.

## 7. Quality bar and tests

- Every theme passes the existing store checks at 1280, 768, 390 and 320px: buy button visible, prices readable,
  contrast, no horizontal overflow, working cart and checkout.
- Uniqueness: 20 generated identities on one theme and one kind of business must differ pairwise in typography,
  button style, motif pack and section order; the scorecard also measures the 8 themes against each other.
- Screenshots of every theme at desktop and phone are reviewed before anything ships; the owner approves the 8
  themes before T5 starts.
- Before T3, Clyro's example stores are studied in the browser to set each theme's target.
- AI responses are mocked in tests; no paid calls.

## 8. Out of scope

A theme marketplace, third-party theme authors, paid premium themes, more than 8 themes in this program,
and "connect your own AI" editing (noted from Clyro for a later decision).
