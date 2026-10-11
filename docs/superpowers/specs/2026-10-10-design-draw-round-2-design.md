# Design draw, round 2 — colour world, story angle, page structure, photo treatment and buttons per store

Date: 2026-10-10 · Branch: `feature/store-page-architecture` · Status: approved in conversation, awaiting spec review
Builds on: `docs/superpowers/specs/2026-10-10-frame-hero-draw-design.md` (round 1, built and live-verified,
commits bc4d3bc..bffd73a7).

## Why

Round 1 made the frame differ: three stores from one coffee brief got three headers and three heroes. The owner
looked and said: "the stores are still equal, they vary by a little bit but if two coffee shops do it with us they
will still look the same but with different pictures". Then, about a circle badge with "YUNGAS · LA PAZ ·" drawn
straight across an emoji: "that is not good at all also, buttons are always the same rectangular old things".

Measured 2026-10-10 on the three round-1 stores (same brief, same 3 photos):

| | store 1 | store 2 | store 3 |
|---|---|---|---|
| palette | `#28201b` brown, `#f5eddd` cream, `#b76032` rust, `#a83523` red | `#292018`, `#f3eadb`, `#bb5835`, `#982d24` | `#21120d`, `#efddbd`, `#b83e22` (+ lime) |
| headline | "Una pausa con pulso." | "Una pausa, con origen." | "Una pausa con altura." |
| planner signature | "pausa urbana en La Paz" | "pausa entre los Yungas y Sagárnaga" | "menú urbano entre Yungas y La Paz" |
| body | hero → ticker → statement → products → pause scene → pickup | hero → bar → origin → products → pause scene → pickup → contact | hero → band → manifesto → products → pause scene → pickup → closing |
| fonts | Bodoni Moda + Figtree | Fraunces + Instrument Sans | Big Shoulders Display + Chivo |

Fonts already vary (the planner chooses them). Palette, story angle and body converge: the palette comes from the
photos plus the coffee cliché, the angle from the brief, the body from the model's habit. Store 2 also shipped a
fake circular-text badge (`<div class="roundel"><span>YUNGAS · LA PAZ ·</span><strong>☕</strong></div>`), which
HTML cannot curve.

## Owner decisions (2026-10-10)

- Roll five more parts per store: colour world, story angle, page structure, photo treatment, buttons/controls.
- Weight repeats against stores in the same kind of business twice as heavily.
- The fonts stay with the planner (they already vary).
- Merchant words still win over any rolled part.
- Quality floor: no emoji as decoration, circular text only via SVG `<textPath>`, no overlapping text.
- Live proof with three new coffee stores from the same brief, compared with round 1.

## Design

### 1. Five new catalogues — extend `apps/api/src/storefront-source/design-engine/frame-draw.ts`

Same entry shape as round 1 (`{ id, bold, desktop, phone, needs? }`) unless stated.

- **palette (14)** — `{ id, name, ink, paper, accent, accent2, dark: boolean }`, exact hex values, about a third
  dark, a third light, a third saturated. Ids: `cobalt-bone`, `black-acid`, `pink-olive`, `tomato-cream`,
  `forest-lilac`, `grey-hot-orange`, `navy-butter`, `sage-rust`, `ink-blueprint`, `plum-mint`, `mustard-black`,
  `sky-red`, `charcoal-coral`, `teal-sand`. None is a brown-on-cream pair. Every `ink`/`paper` pair passes 4.5:1.
- **angle (10)** — the idea the copy is built on: `origin-place`, `process-numbers`, `ritual-time`, `the-maker`,
  `product-hero`, `humour`, `manifesto`, `field-guide`, `senses`, `neighbourhood`. Each `desktop` string tells
  the planner and author what the headline and sections say; `phone` is unused (empty) for angles.
- **structure (8)** — the body after the hero, as an ordered section list with the device each uses:
  `catalog-first`, `story-scroll`, `lookbook` (`needs: photos3`), `menu-board`, `guide-compare`, `magazine-issue`,
  `single-focus` (`needs: product`), `index-list`.
- **photos (7)** — `natural`, `black-white`, `duotone` (in the palette's ink and accent), `film-grain`,
  `framed-polaroid`, `tight-crops`, `one-per-screen` (`needs: photos2`). Applies to the store's own photos, never
  to catalogue photos inside the platform's product page (shoppers see the real product colours).
- **button (12)** — exactly the kit's existing `data-dna-button` forms: `block`, `brutal`, `bubbly`, `ghost`,
  `outline`, `pill`, `split`, `stamp`, `sticker`, `tag`, `ticket`, `underline`. Plus **hover (5)**: `lift`,
  `fill`, `underline-grow`, `tilt`, `shine` (the kit's `data-dna-hover` values). Each button entry's `desktop`
  tells YAPI how to draw its own buttons, chips and links to match.

`drawFrame` grows to `drawDesign(random, recent, available, category)` returning
`{ header, cart, footer, hero, palette, angle, structure, photos, button, hover, category }`.
- Repeat avoidance applies to header, hero, palette, angle, structure and button (cart, footer, photos and hover
  stay uniform). A recent draw whose `category` equals this store's counts twice.
- `category` is the brief's `businessType`, lower-cased and trimmed to 40 characters ('' when absent).
- `needs` filtering as in round 1.

### 2. What receives the draw

- **Planner** (the Sep-5 concept planner, the `design` phase in `source-generation.service.ts` near the
  `recentDesignFingerprints` call, ~line 670): its input gains one sentence with the drawn angle and palette
  ("Build every concept on this story angle: … and this colour world: …"), so the signature and headline come from
  the angle. The planner still chooses fonts.
- **Sep-5 author**: the `FRAME AND HERO` paragraph becomes `DESIGN DRAW` with eight lines (frame parts, hero,
  palette with hexes, angle, structure, photo treatment, button + hover). Same voice: build this, style it in the
  store's own language. `frame` input keeps its name; blank still means byte-identical.
- **Agent builder**: the same paragraph through the existing `frame` parameter.
- **Platform buttons**: the drawn `button` and `hover` are written into the store's runtime DNA (`config.js`
  `dna.button`, `dna.hover`), which the kit renders as `data-dna-button`/`data-dna-hover` on add-to-cart, checkout,
  product page and cart.
- **Platform colours**: the drawn palette becomes the store's `--brand-*` tokens in `brand.css` when the merchant
  has no confirmed brand colours. Confirmed brand colours always win.
- **Merchant words win**: `frameOverrides` grows `palette` (colores, paleta, color de marca, a named colour),
  `photos` (blanco y negro, filtro, fotos naturales…) and `button` (botón/botones + a shape word). The matched part is
  left out of the paragraph and the DNA keeps the planner's choice.
- **Quality floor** in the Sep-5 self-review's measured facts: emoji characters used outside text content
  (decorative spans/strongs/pseudo content) → a fact to fix; an element whose CSS rotates and whose text runs
  along a circle without SVG `textPath` → a fact to fix; text boxes overlapping other text boxes at 1280 or 390 →
  a fact to fix. Advisory, like the other measured facts.

### 3. Saving, repeats, switch

- Same file, `frame-draw.json`, with the new fields; older files without them parse as before.
- `recentFrameDraws` already returns the last 6 other stores' files; it now also returns their `category`.
- Switch: `YAPI_DESIGN_DRAW=off` drops the five new parts (frame stays); `YAPI_FRAME_DRAW=off` drops the frame.
  Both off → prompts and DNA exactly as before round 1.

## Testing

- Catalogue sizes 14/10/8/7/12/5; every palette passes 4.5:1 ink on paper; no palette has a brown ink with a cream
  paper (ink hue 15-40°, low saturation, paper lightness > 90%).
- Seeded draws repeat; same-category recent draws are avoided first.
- A store with no photos never draws `lookbook`, `one-per-screen`; no product → never `single-focus`.
- "verde y blanco, colores de mi marca" drops the palette; "botones redondos" drops the button.
- The planner input contains the drawn angle and palette; blank draw leaves it unchanged.
- The runtime DNA gets the drawn `button`/`hover`; with the switch off it does not.
- `brand.css` gets the palette only without confirmed brand colours.
- The self-review measured facts flag an emoji decoration, a fake circular text and overlapping text.

Live (owner's plan, ~40 min): three coffee stores from the round-1 brief and photos. Pass: three palettes, none
brown on cream; three headlines from three angles; three button forms visible on YAPI's and the platform's
buttons; all usable at 390 px. Show the six coffee stores side by side.

## Not in this round

Fonts (planner already varies them), a Studio re-roll button, and per-section device catalogues beyond the
structure list.
