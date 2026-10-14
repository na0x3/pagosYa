# One look per store: the kit pages carry the store's own look

Status: draft for owner review, 2026-10-14.
Related: `2026-10-10-conversion-product-page-design.md` and `2026-10-09-long-product-page-design.md` (the product page this restyles), `2026-09-29-themed-product-card-program.md` (guarded CSS, sub-project 4), `2026-10-10-design-draw-round-2-design.md` (the photo treatment draw), `2026-10-09-yapi-signature-look-design.md` (the concept signature), `2026-10-12-faster-generation-design.md` (the Sep-5 self-review stage this hooks into).

## Why

The owner wants each store's kit pages to (1) match that store's own home page and (2) look unlike other stores' kit pages, and wants (3) the store's photo look to reach product photos. Four surfaces are in scope: the product page, the catalog and category pages (`productos.html`, `coleccion.html`), the cart drawer, and the kit's product cards inside YAPI's home page.

A code and data read on 2026-10-14 found:

1. **The kit decides most of the look itself.** The product page reads colours and fonts from `--store-*` → `--brand-*` → legacy tokens (`packages/storefront-kit/kit/commerce.js:518`), so those already reach it. But the corner radius is capped at 6px (`--pd-radius`), the title is weight 380 at a fixed size (kit:597), dense switches the title to the body font (kit:599), the gallery controls are white chips "never tinted by the store palette" (kit:544–549), the badge is always a 999px pill (kit:541), and the gallery always sits on a tint (kit:537). The same choices apply to every store.
2. **The photo treatment never reaches product photos.** The round-2 draw has 7 treatments (`design-engine/frame-draw.ts:296–304`), but each is only a line in the author's prompt. It is never stored, so the kit cannot apply it, and the round-2 spec explicitly left product photos out.
3. **The guarded CSS that exists is timid and written blind.** `dna.productCss` is a real guarded channel: a sanitizer with part, property and value allowlists (`product-theme-css.ts`), plus a browser check that keeps price, options, quantity and buy usable (`product-theme-check.ts`). 21 of the 23 stores on dev carry some. But the planner writes it inside a design concept, capped at 1,200 characters, before the home page exists. The result is near-identical across stores: a 1px border on the gallery, a tinted stage, square thumbnails, slightly tighter letter-spacing. It only covers the product page.
4. **The Sep-5 author never thinks about the kit pages.** Its prompt does not mention them. Product settings come from the planner concept, or from seeded defaults when the planner does not run.

Kit CSS reaches published stores at once: `commerce.js` is replaced with the current kit on every serve (`source-runtime.ts:46–50`, `source-publishing.service.ts:125–126, 235–240`). `config.js`, `product.html` and `brand.css` are saved copies, which change only on the store's next save.

## Decisions (owner, 2026-10-14)

- Goal: kit pages must both match their own home page and differ from other stores, and photos are in scope.
- Surfaces: product page, catalog and category pages, cart drawer, kit cards on the home page.
- Approach: the most unique and coherent. Layer A (measure the home page, the kit follows) **and** layer B (YAPI's own guarded touches), both in this spec, built in that order.
- Colour-changing photo treatments apply to cards, thumbnails and cart lines, with **true colour on hover and focus**. The product page's main gallery is **always true colour**.
- Existing stores get the look on their **next save only**. No backfill.
- Layer B is written in **every new-store build and redesign**, as part of the build.

## Design

### 1. Shape

- **Layer A, the measured look (coherence).** After a save, the platform renders the store's home page headlessly and records what it actually did as `config.look`. The kit maps it onto its existing token layers on all four surfaces. No model call.
- **Layer B, YAPI's touches (uniqueness).** The existing guarded CSS channel is widened to all four surfaces and written by a step that sees the finished home page, so one-off devices (stamps, torn edges, tilted frames, offset shadows) carry over.
- **The kit keeps the structure.** Layouts, cart logic, variants, the checkout path and the ASFI trust items stay kit-owned and are never selectable by either layer.
- **Precedence:** kit defaults → existing DNA (`frame`, `button`, `card`, `cart`, `productCard`) → `look` → layer B CSS.
- **Kill switches:** `YAPI_LOOK_MEASURE=off` (no measurement; stores keep whatever `look` they have) and `YAPI_KIT_TOUCH=off` (no touch step; stores keep layer A and the planner's `productCss`).

### 2. Layer A: measuring the home page

**When.** At the end of every YAPI save of a source store: a new store, a redesign, a chat edit, a style-pick build, and the Sep-5 self-review save. It runs on the assembled files just before the revision is written (the assembly that writes `config.js`, `source-generation.service.ts:1487–1525`, or the review stage's save for N+1), so it always sees the final home page. The plan lists every save path that writes a new revision of a source store and routes each through one helper, `withMeasuredLook(snapshot)`.

**How.** One render of `index.html` at 1280×800 in `withVisualSandbox` (`source-visual-capture.ts:11`), with reduced motion so entrance animations do not skew the reading, then one `page.evaluate` that reads computed styles. Target time 3–6 s, hard deadline 15 s. On failure or timeout the store keeps its previous `look` (or none). A measurement failure never fails or delays the save beyond the deadline.

**Declared beats measured.** Values YAPI chose on purpose are used as given: the drawn photo treatment (stored from now on, see below), the drawn button, and the concept's heading font. Measurement fills in everything else, and covers stores with no draw (boceto, older stores, chat-built stores).

**Fields**, all optional (a field is left out when its reading is ambiguous: too few elements, or elements that disagree):

| Field | Read from | Stored as |
|---|---|---|
| `type.heading` | The h1, else the largest visible heading | `family` (only a family the store loads: an `@font-face` in its CSS or a catalogue font), `weight` 300–900, `case` none or upper, `tracking` −0.05…0.3 (em), `italic` boolean |
| `type.label` | The most common small uppercase run (eyebrows, kickers): ≤14px, ≥3 occurrences | `case`, `tracking`, `weight` |
| `shape.photo` | The 3+ largest content images (≥120px both sides, not the logo) | median corner radius 0–48 (px), or `pill`, or `arch` (top corners fully round) |
| `shape.card` | Repeated sibling blocks that each hold an image and text | same as above |
| `shape.button` | Primary buttons and links styled as buttons | same as above |
| `edge` | Borders and shadows on the measured photos and cards | `none`, `hairline` (≤1px), `outline` (≥2px), `offset` (shadow with blur 0), `soft` |
| `photo.treatment` | The draw first; else computed `filter`, `mix-blend-mode`, overlay pseudo-elements, padding plus a light backing | `natural`, `mono`, `duotone`, `sepia`, `grain`, `polaroid`, `tight` |
| `photo.aspect` | Median aspect ratio of content photos | `square`, `portrait`, `landscape`, `free` |
| `photo.tilt` | Rotation on photos | 0–4 (degrees, absolute value; sign alternates in the kit) |
| `surface` | Section backgrounds down the page | `flat`, `tinted` (alternating), `banded` (at least one dark band) |

Mapping from the round-2 treatments: `natural`→`natural`, `black-white`→`mono`, `duotone`→`duotone`, `film-grain`→`grain`, `framed-polaroid`→`polaroid`, `tight-crops`→`tight`, `one-per-screen`→`natural` (a page-layout choice, not a photo look). The draw's treatment is written to `frame-draw.json` beside the other drawn parts so later saves can read it.

**Colours are not measured.** They keep coming from the store's `--store-*` tokens, so the existing contrast rules stay where they are.

**Clamped on the way in.** `sanitizeLook()` clamps every field to the lists and ranges above and drops unknown keys. The font family is the only free string, and it must match a loaded family.

**Stored** as `config.look = { version: 1, ... }` in `config.js`, next to `dna`. `look` joins the carried fields so a save that cannot measure keeps the previous one.

### 3. How the kit uses the look

**One translation point.** At start-up `commerce.js` reads `config.look` and sets `data-look-*` attributes and `--look-*` variables on `:root`. One CSS block maps them onto the existing token layers: `--pd-*` for the product page and `--kit-*` for cards and the cart (kit:3597–3618). With no `look`, every rule in that block is inert, so untouched stores render exactly as today.

| Look field | Product page | Catalog and category | Kit cards (home and catalog) | Cart drawer |
|---|---|---|---|---|
| `type.heading` | title: family, weight, case, tracking, italic. Dense keeps the heading font when a heading was measured | page heading | card name | drawer heading |
| `type.label` | eyebrow, option labels, tab row, badge text | filter labels | card meta | line meta |
| `shape.*` | `--pd-radius` uses `shape.card` with no 6px cap. Gallery uses `shape.photo`. Option chips and the badge use `shape.button` | filter chips use `shape.button` | `--kit-photo-radius` uses `shape.photo`, card radius uses `shape.card` | line photo uses `shape.photo` |
| `edge` | gallery, dense buying box, option chips | grid cards | card | lines, drawer edge |
| `photo.*` | see the photo table below | | | |
| `surface` | `banded`: related products in a dark band (inverse ink/paper pair). `tinted`: details and related alternate | footer band | none | none |

**Photos per surface:**

| Surface | Shape, frame, grain, aspect | Tilt | Colour treatment (`mono`, `duotone`, `sepia`) |
|---|---|---|---|
| Kit cards | yes | yes | yes, true colour on hover and `:focus-within` |
| Product page main gallery | shape, frame, grain (aspect stays the page style's) | no | **never** |
| Product page thumbnails and related products | yes | no | yes, true colour on hover and focus |
| Cart lines | shape, frame | no | yes |

`polaroid` and `arch` reuse the existing `data-dna-frame` values of the same name. When a measured `look` and the DNA's drawn frame disagree, the look wins, because it is what the home page shows. `grain` is a kit-shipped overlay (a small inline noise texture in the kit, not a store `url()`). `duotone` uses the store's ink and paper.

**Fixed kit values become look-aware defaults:**
- The gallery arrows and counter take `shape.button` and the store's paper/ink pair, falling back to today's white chip when contrast on the photo needs it.
- The badge follows `shape.button`.
- Dense's tinted square frame becomes `photo.aspect` on a flat background when the home's photos have no backing.

**Protected parts are untouched by the look.** The price's colour and size, the buy button's fill and contrast, quantity, the selected-option state, the seal and the trust row read only the existing tokens. The look may change a button's shape and type, never its colours.

### 4. Layer B: YAPI's touch step

**When.** In every build that goes through the Sep-5 author: new stores, redesigns and style-pick builds. It runs **at the end of the Sep-5 self-review stage** (`startSep5Review`, `source-generation.service.ts:1580` onward), after the review's edits and the measurement, so it sees the final home page. That stage already runs in the background after revision N is shown and saves N+1 «Revisión de YAPI». The touch's CSS goes into the same N+1 save, so the merchant waits no longer for the first result than today. When the review makes no edits, the stage still saves N+1 if the touch produced anything. When the review stage does not run, the touch step runs on its own in that slot.

**The call.** One model call on the run's model, through the same client as the review (the ChatGPT bridge in the owner's setup). Deadline 60 s, plus one retry only for the bridge's transient refusals (`SourceProviderRefusedException`, as elsewhere). Credits are charged on the review row only when the answer is used, as for the review.

**Input:**
- A 1280px screenshot of the home page, first two screens (the review's own capture is reused when it exists).
- The measured `look`.
- The concept's `signature` (idea, device, vocabulary) when there is one.
- The home page's distinctive CSS: the authored rules on elements that carry a transform, a shadow, a `clip-path`, a filter, a pseudo-element or a keyframe animation, trimmed to about 4 KB.
- Per surface: its named parts, what each may change, and the protected list.

The instruction: carry the home page's own devices onto the kit pages, never invent a new style. Leave a surface empty when the look already carries it.

**Output** (strict JSON schema): `{ product, catalog, card, cart }`, each a guarded CSS string (may be empty), plus `notes` with one line per surface for the build log.

**Guards.** The sanitizer is already profile-based (`ThemeCssProfile`, with product and account profiles today). Three profiles are added:

| Surface | Scope | Named parts | Protected (not selectable) |
|---|---|---|---|
| product | `[data-pagosya-product][data-style]` (today's) | today's 16 (`COSMETIC_PARTS`), unchanged | price, options, quantity, buy, seal, trust row |
| catalog | `[data-pagosya-catalog][data-catalog-full]` | `heading`, `intro`, `filters`, `grid`, `decor-a`, `decor-b` | filter and sort controls' text and selected state |
| card | `[data-pagosya-catalog] .menu-item` | `card`, `card-media`, `card-name`, `card-meta`, `card-badge` | price, `.menu-add` (add to cart), the details link's focus ring |
| cart | `.cart-drawer` | `drawer`, `head`, `line`, `line-media`, `decor-a` | quantities, totals, remove, checkout button |

- Same property and value allowlist as the product profile: bounded filters, `clip-path` (not on interactive parts), transforms, shadows, borders, `aspect-ratio`, keyframes under reduced motion. Still no `url()`.
- Per surface: 3,000 characters and 40 rules.
- The kit gets `data-part` hooks for the new parts. The product page's hooks do not change.
- **Browser check:** `product-theme-check.ts` is extended to all four surfaces at 390 and 1280. Every protected control must be visible, not covered, large enough and in contrast, and no page may scroll sideways. A surface that fails loses **only its own** CSS and keeps layer A. The build is never failed or retried for it.

**Storage.** `config.dna.productCss` (as today) plus new `dna.catalogCss`, `dna.cardCss` and `dna.cartCss`. All four are added to `KEPT_DNA` (`source-generation.service.ts:1504`) and injected by the kit after its own styles, the same way `productCss` is today (kit:3774–3781).

**The planner's `productCss`** stays as the fallback when the touch step is off or fails. When the touch step returns product CSS that passes its check, it replaces the planner's.

**Later changes in chat.** A chat request about these surfaces ("make the product photos tilted", "put a stamp on the cart") re-runs only the touch step, with the merchant's words added, then saves. Other chat edits keep the touch as it is (the fields are in `KEPT_DNA`). The agent path's `set_product_card_theme` tool gains optional `catalogCss`, `cardCss` and `cartCss`, through the same guards.

### 5. Errors and fallbacks

| Failure | Result |
|---|---|
| Measurement fails or times out | Previous `look` kept (or none); save proceeds |
| A look field is ambiguous | That field is left out; the kit default applies for it |
| Touch call fails, times out or returns invalid JSON | No touch CSS; planner `productCss` stays; layer A applies |
| A surface's CSS fails sanitizing or the browser check | That surface's CSS dropped; the other surfaces keep theirs |
| Either kill switch is off | That layer is skipped; existing stored values are left as they are |

Every outcome is logged as one JSON event (`look_measured`, `look_kept`, `kit_touch_saved`, `kit_touch_dropped` with the surface and reason).

## Testing

All test-first per task.

- **Measurement:** fixture home pages (calm serif café, bold uppercase stamp store, polaroid bakery, a store with no photos, a store with conflicting radii). Each yields the expected `look`; ambiguous fields are left out; a timeout keeps the previous look.
- **Kit:** browser specs beside `apps/merchant-studio/tests/product-page-polish.spec.ts`. For each look field, each surface picks it up. The main gallery stays true colour; cards, thumbnails and related products return to colour on hover and focus.
- **No look, no change:** with no `config.look` and no touch CSS, today's five product-page styles, the catalog and the cart render identically to the current kit (screenshot comparison with the 2026-10-14 harness).
- **Sanitizer:** each new profile gets the existing attack cases (scope escape, protected selectors, `url()`, oversized values, keyframe abuse) and its own parts.
- **Browser check:** a deliberately bad CSS per surface (hidden checkout button, covered price, sideways scroll) drops only that surface's CSS.
- **Touch step:** runs on a recorded YAPI reply (the dev-hygiene record/replay), so tests spend no credits. Deadline, refusal and invalid-reply paths fall back as in section 5.

**Live check** on the owner's ChatGPT plan, only after asking:
- Three new stores from different briefs: a calm café, a bold playful shop, a services firm. Screenshots of home, product page, catalog and cart at 1440 and 390, side by side.
- One existing store saved through a small chat edit, to confirm layer A arrives on save and nothing else moves.

## Success criteria

1. **Coherence:** on each live store, the kit pages' heading family, weight and case, corner shapes, edge style and photo treatment equal the home page's measured values. Checked by script.
2. **Uniqueness:** no two of the three live stores share the same type, shape, edge and photo combination on the product page, and each has at least one touch device that also appears on its home page.
3. **Protection:** the browser check passes on all four surfaces for all three stores.
4. **Untouched stores unchanged:** per the screenshot comparison.
5. **Build time:** measurement plus touch add at most about 45 s to a build, nearly all of it in the background review stage.

## Build order

Each step ships working on its own:

1. `sanitizeLook`, measurement and `withMeasuredLook` on every save path; the drawn photo treatment stored in `frame-draw.json`.
2. Kit reads `look` on the product page.
3. Kit reads `look` on cards, catalog and cart.
4. New `data-part` hooks, the three sanitizer profiles and the extended browser check.
5. The touch step in the Sep-5 review stage.
6. The chat re-run and the `set_product_card_theme` fields.
7. Live check.

## Not in this project

- YAPI writing its own product, catalog or cart HTML (ruled out: the cart, variants, checkout path and ASFI trust items live in that markup).
- Backfilling existing stores.
- Colours from measurement.
- The checkout page (it already has its own per-store draw).
- Store-hosted images in guarded CSS (`url()`).

## Notes for implementation

- Editing `apps/api` while a YAPI job is RUNNING restarts `nest --watch` and interrupts the job. Check for running chat jobs first.
- Kit changes reach published stores immediately, so steps 2–4 must keep the "no look, no change" test green before they merge.
- Rebuild the pre-built Studio (`vite build --mode embedded`) to see Studio-side changes at :4323.
- `SOURCE_PRODUCT_PRESENTATION_DIRECTION` (`source-design.ts:13`) lists four product-page styles; `conversion` is the fifth. Fix the text while touching it.
