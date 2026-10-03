# Bake-Lab-level abundance for YAPI sketches — plan

Date: 2026-10-02. Reference: the owner's Figma file
`figma.com/design/6fPLVCyucRm2nUWyQFJV8d` ("The Bake Lab storefront", frame
1440×6702, base fill `#F7EBD8`). Goal: YAPI sketch stores reach that level of
visual abundance — colors, boxes, marquees, combined elements — and the Boceto
editor gains element-level dragging (text, buttons, stickers) on top of the
section dragging that already works.

## 1. What the reference actually does (patterns extracted)

Studied section by section in Figma (hero, best sellers, build-a-box,
collections, story/stats, steps, newsletter, footer, testimonials, gifting):

1. **One brand family, ~8 surfaces.** Five hues (cream `#F7EBD8`, terracotta
   `≈#E35336`, dark brown, sage green, butter yellow) stretched into 8+
   surfaces via *tints*: a lighter cream card band `#FFF8ED`, and pastel card
   fills (dusty pink / sage / butter) that are ~15-20% of accent/deep/pop mixed
   into paper. The "abundance" is mostly tint variety, not more hues.
2. **A repeating section header ritual:** tiny eyebrow with a glyph
   (`✦ MOST WANTED`), big serif display headline, and a right-aligned meta
   element (link `SHOP ALL 12 FLAVORS →` or two lines of microcopy).
3. **Boxes everywhere, each dressed differently:** product cards with corner
   badge pills (`NEW OBSESSION`, `LAB CLASSIC`), per-card tinted photo
   backdrops, price at the right of the name row, full-width dark
   `ADD TO BOX +` button; collection cards on pastel fills with a corner arrow
   chip; numbered step cards (`01/02/03`) with icon-in-circle; quote cards
   with star rows and verified chips.
4. **Split color bands:** flat color panel (terracotta, dark brown) + full-bleed
   photo, with price pills, rotated circular stickers (`Save 15%`), stat rows
   (`5.5 oz | 24 hr | 0%`) with hairline dividers, light pill CTA.
5. **Thin strips as rhythm:** announce bar top (two microcopy ends), repeated
   wordmark/marquee strips between heavy bands, a microcopy strip under the
   product grid ("Each cookie is 5.5 oz…" / "Order by Sunday 6pm…").
6. **Social proof as a section:** `2,400+ happy cookie monsters` + `4.9 / 5`
   rating block, three quote cards, then a photo strip where one tile is a
   brand-color card with the IG handle.
7. **Newsletter as a split band** (green panel + photo) with inline email field
   + red pill submit + consent microline. Footer: columns, social circles,
   payment chips, legal row.

## 2. What YAPI already has (do not rebuild)

- `sketch-schema.ts`: 13 block types — announce, hero (badge/note/sticker,
  3 variants), split (pills), **marquee (animated, reduced-motion safe)**,
  catalog, steps (Lucide icons + numbers), story, reviews, faq, banner,
  gallery, newsletter, footer (giant wordmark). 5-role palette
  (paper/ink/accent/deep/pop) with WCAG ink repair (`bestInkFor`).
- `sketch-assembler.ts`: deterministic — the same render feeds the Boceto
  preview and the final build. Header nav derived from sections.
- Boceto editor (`source-preview-boceto-mode.js` + `source-boceto.ts`):
  **section drag-reorder already works** (grab anywhere, ghost follows cursor,
  drop indicator, auto-scroll), click-select, double-click in-place text edit,
  Figma-style canvas zoom/pan, inspector, live apply of bg/ink/size/variant/
  photo without reload.
- Default palette is already in the Bake Lab family (`#f6ecd9` paper,
  `#e35336` accent, `#f2c94c` pop).

The gap is: tinted surfaces, richer card anatomy, dual CTAs + trust rows,
stats, collections, social-proof dressing, band-sequencing rules, and
element-level drag.

## 3. Sub-projects

### SP1 — Tinted surface system (colors)

The single highest-leverage change. Derive tints instead of asking the model
for more hexes (keeps the contrast-repair guarantees):

- Extend `SketchBg` with `'tint-accent' | 'tint-deep' | 'tint-pop'`. Resolved
  at render time as `color-mix(in srgb, <role> 16%, <paper>)` (computed in TS
  so `bestInkFor` keeps working on a concrete hex; no runtime color-mix needed
  for the section bg itself).
- Card surfaces inside catalog/collections/reviews cycle the three tints
  (deterministic by index), so grids stop being monochrome.
- Prompt: tell the model the tint backgrounds exist and when to use them
  (soft bands between saturated ones).
- Repair: tint bgs are always-legal; invalid values fall back to paper.

### SP2 — Block upgrades (boxes, stickers, stats, proof)

Schema + JSON request schema + prompt + renderer + CSS + repair defaults +
golden specs for each:

- **hero**: optional `cta2` (outline pill) and `trust` (star/metric row under
  the CTAs).
- **split**: optional `stats: [{value,label}]` (hairline-divided row), optional
  `sticker` (rotated circle, reuse hero's), optional `cta2`.
- **catalog**: optional `badges: string[]` (corner pills cycled across cards),
  optional `strip: {left,right}` microcopy band under the grid (reuse announce
  styling), optional `seeAll` link in the section head (eyebrow/meta ritual),
  card layout v2 — name+price row, full-width ink add-button.
- **new `collections`**: `title` + `items: [{title,text,photo?}]` → 2-4 cards
  on cycled tints with corner arrow chip, linking to `#skb-catalogo`.
- **reviews**: optional `rating: {value,source}` (big `4.9 / 5` + source
  microcopy), star row + "compra verificada" chip per quote, optional
  `photos: string[]` strip where one tile is an accent card with the store
  name/handle.
- **newsletter**: `variant: 'center' | 'split'` — split renders panel + photo
  with the existing subscribe button restyled as inline field + pill submit,
  plus consent microline.
- **footer**: link columns (reuse nav derivation + pagosya info pages), social
  circles, payment chips row. Giant wordmark stays.
- **marquee**: `variant: 'scroll' | 'wordmark'` and a separator glyph option
  (`·`, `✦`); speed scales with `size`.
- **banner**: optional `sticker`.

### SP3 — Combination recipes (the "abundance" rhythm)

- Assembler/repair rule: no two adjacent blocks with the same bg; when the
  model produces a flat run, repair rotates in tints (never destroys content).
- Prompt upgrade with 2-3 named band recipes (e.g. announce → hero paper →
  marquee ink → catalog tint → split accent → steps tint-deep → reviews
  tint-accent → newsletter deep → footer ink) and the eyebrow/display/meta
  header ritual for every section.
- Raise block count guidance 7-10 → 9-12 and require at least one strip
  (marquee/announce) *between* content bands, not just at the top.

### SP4 — Element drag in Boceto (text, buttons, stickers)

What's genuinely new. Two motions, both persisted as sketch revisions (same
path as `pagosya:boceto-text`):

- **Reorder within a block.** Copy-column children (badge, headline, sub,
  pills, cta, cta2, note) get `data-skb-el`. Dragging one shows a slot
  indicator (same pattern as section drag) and posts
  `pagosya:boceto-el-reorder {blockId, order}`; schema gains optional
  `order: string[]` per block; renderer emits children in that order; repair
  drops unknown/duplicate entries.
- **Free-floating elements.** Stickers and badges can be dragged anywhere
  inside their section: posts `pagosya:boceto-el-move {blockId, el, x, y}`
  with percentage offsets; schema gains optional
  `float: { [el]: {x,y} }`, clamped 0-100; renderer sets
  `position:absolute; left/top %`; inspector gets a "reset position" action.
- CTA buttons additionally get an alignment toggle (start/center) in the
  inspector — drag sideways snaps between them.
- Out of scope v1: dragging an element into a *different* section.

### SP5 — Boceto polish on top of existing section drag

Section drag *exists*; round it out: Alt+↑/↓ keyboard reorder, duplicate and
delete block in the inspector, and an add-block drawer (thumbnail per block
type, click or drag into the canvas inserts a repaired default block — this is
how a merchant adds "a marquee" or "a collections trio" after generation).

## 4. Order and size

| # | Sub-project | Size | Depends on |
|---|-------------|------|------------|
| 1 | SP1 tints | S (1 session) | — |
| 2 | SP2 block upgrades | L (2-3 sessions; catalog+collections first, proof+newsletter+footer second) | SP1 |
| 3 | SP3 recipes | S | SP1 |
| 4 | SP4 element drag | M (1-2 sessions) | — (parallel to SP1-3) |
| 5 | SP5 drawer + polish | M | SP4 |

## 5. Verification

- Golden specs per new field/block (`sketch-golden.spec.ts` pattern), repair
  idempotence specs, contrast specs for tint surfaces.
- Boceto browser tests for el-reorder/el-move message round-trips
  (`source-preview-boceto.test.ts` pattern).
- One YAPI eval run after SP2+SP3 against the Bake Lab brief (bakery, warm
  palette, photos) and two contrast briefs (dark-canvas brand, service store)
  — judge: tint variety present, no adjacent same-bg bands, marquee between
  bands, cards carry badges.
