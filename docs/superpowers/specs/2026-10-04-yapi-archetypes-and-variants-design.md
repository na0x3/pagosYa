# YAPI: binding page archetypes and per-block variants

**Date:** 2026-10-04
**Status:** approved design, ready for an implementation plan
**Sub-projects:** 2 (variants per block type) and 4 (page archetypes) of the "YAPI superbot at design" program
**Predecessor:** `2026-10-04-yapi-composition-and-width-design.md` (composition freedom + band width), shipped

## The problem, stated precisely

The owner's complaint is that every generated store looks alike — "different colours, same page
underneath". The composition work that shipped before this did not move it, and could not: composition
decorates blocks that already exist and never changes which blocks appear or in what order.

Two measurements define the problem.

**The page spine is identical across stores.** The store generated 2026-10-04 15:29 came out as:

```
announce → hero → catalog → collections → split → steps → story → reviews → marquee → faq → banner → newsletter → footer
```

**Six page archetypes already exist and are ignored.** `sketch-direction.ts:36` holds `STRUCTURES`: six
named page grammars (revista, póster, mercado, editorial pausado, showroom, feria), each with an explicit
block sequence, one drawn at random for every generation and passed to the model as prose. The spine above
matches **none** of them. It is a superset: 13 blocks where the archetypes specify 7–10. The model takes the
union of its repertoire instead of committing to the archetype it was handed — even though the direction
also says, in prose, `PROHIBIDO el boceto genérico ... ni el mismo orden de siempre`.

**Per-block shape barely varies.** Of 14 page block types, only `hero` (photo-right, full-bleed, stacked)
and `newsletter` (center, split) have more than one shape. The other twelve render exactly one way, so even
a different block order produces familiar-looking bands.

The lesson is the one the dosage defect taught a few hours earlier in the same subsystem: **a prompt cannot
hold an invariant. Only the schema and repair can.** The archetypes are not missing; their enforcement is.

## What this changes

1. The archetype becomes **binding** — chosen by the model, then enforced mechanically.
2. Each block type gains a **variant** that changes its shape without changing its fields.
3. Both choices are steered away from what recent stores used, so "the model chooses" cannot collapse into
   "the model always chooses the same thing".

Non-goals: no new block types (sub-project 3), no new content fields, no change to palette, fonts or the
product theme, and no change to how chat edits behave.

## Mechanism 1 — the archetype becomes binding

### The data

The six archetypes move out of prose into data, in a new module `sketch/sketch-archetypes.ts` beside
`sketch-direction.ts`:

```ts
// `SketchBlock['type']` is the existing union; `SKETCH_BLOCK_TYPES` (sketch-schema.ts:65) is its value list
// of the 14 page block types. There is no `SketchBlockType` alias today — do not invent one for this.
export type SketchArchetype = {
  id: 'revista' | 'poster' | 'mercado' | 'editorial' | 'showroom' | 'feria';
  name: string;
  /** The prose the model still reads, so it understands the intent and not only the constraint. */
  line: string;
  /** The canonical order. A type may appear more than once (feria's three marquees); the count of a type
   *  here is also the maximum number of that type the page may hold. */
  slots: { type: SketchBlock['type']; required?: true }[];
  /** Types this archetype is defined by NOT having. Enforced even though `slots` already omits them,
   *  because the absence is the identity: a showroom without a hero is the point. */
  forbid: SketchBlock['type'][];
};
```

The six, derived from the existing `STRUCTURES` prose so nothing the owner already approved is lost:

| id | slots (in order) | forbid |
|---|---|---|
| `revista` | announce, hero, marquee, catalog\*, split, story, reviews, banner, newsletter, footer\* | — |
| `poster` | hero\*, banner, catalog\*, marquee, faq, newsletter, footer\* | announce |
| `mercado` | announce, hero, catalog\*, collections, steps, reviews, footer\* | — |
| `editorial` | hero\*, story, gallery, catalog\*, faq, newsletter, footer\* | marquee |
| `showroom` | split\*, collections, catalog\*, marquee, reviews, banner, footer\* | hero |
| `feria` | marquee, hero, marquee, catalog\*, marquee, banner, footer\* | — |

`*` marks `required`. `catalog` and `footer` are required everywhere, matching today's prompt rule
("un catálogo y un footer al final").

### The schema change

`SKETCH_JSON_SCHEMA` gains a top-level `archetype` property, a string enum of the six ids, added to
`required` (strict mode has no optional properties). The model names its pick; it does not receive a
pre-drawn one.

### The enforcement

A new total function in `sketch-archetypes.ts`:

```ts
export function applyArchetype(blocks: SketchBlock[], archetype: SketchArchetype): {
  blocks: SketchBlock[];
  notes: string[];
};
```

In order:

1. Drop every block whose type is in `forbid`.
2. Drop every block whose type does not appear in `slots`.
3. For each type, keep at most as many blocks as `slots` holds of that type, keeping the model's first.
4. For each `required` slot with no surviving block, insert a default block of that type.
5. Reorder to the `slots` sequence, stable within a repeated type.
6. `footer` is last unconditionally.

Every drop and insert appends a note, surfaced through `autoRepairs` exactly as composition's notes are, so
a merchant and the eval script can both see what the archetype did.

`applyArchetype` is called from `repairSketch` when, and only when, the sketch carries an `archetype`. It
runs **before** `ensureBandRhythm`, so the rhythm pass sees the final block list.

### What it does not touch

Enforcement applies to new generations and full redesigns only. A **chat edit must never be reshaped** — a
merchant asking to change a headline must not have blocks dropped out from under them. `carryEditorFields`
already distinguishes these paths; the edit path passes no archetype, so `applyArchetype` does not run.
Sketches saved before this change carry no `archetype` and are likewise left exactly as they are.

## Mechanism 2 — per-block variants

### Shape, not content

A variant changes a block's markup and CSS for the **same fields**. No variant introduces a new content
field. This is what keeps the schema from exploding, keeps every existing sketch renderable, and keeps the
Boceto's node paths stable — a freed part's path must not change because a variant changed.

### The vocabulary

| type | variants | default |
|---|---|---|
| `hero` | photo-right, full-bleed, stacked | photo-right *(exists)* |
| `newsletter` | center, split | center *(exists)* |
| `catalog` | grid, list, rail, mosaic | grid |
| `collections` | tiles, stack, overlap | tiles |
| `story` | column, pull-quote, timeline | column |
| `reviews` | cards, marquee, single-big | cards |
| `steps` | row, numbered-column, zigzag | row |
| `faq` | list, two-column | list |
| `gallery` | strip, grid, masonry | strip |
| `banner` | center, split-rule, stacked | center |

`announce`, `marquee`, `split` and `footer` get no variant in this spec. `footer` and the page header are
already shaped by `style.footer` / `style.header`, and duplicating that would give two controls one job.
The other two are thin bands whose shape is already carried by `width` and `align`.

### The schema change

The `block()` helper in `sketch-request.ts` gains a `variant` property whose enum is the type's own list
plus `'auto'`, and `'variant'` joins its `required` array. `'auto'` is how the model declines, matching the
convention `style` already uses — repair turns `'auto'` or any unknown value into the type's default.

### Rendering

Each variant is a branch in that block's generator in `sketch-blocks.ts`, selected by a `data-skb-variant`
attribute plus CSS, following how `skb-hero__media--${b.variant}` already works. Variants that only change
layout should be CSS-only on a shared markup tree wherever possible, so the node tree — and therefore every
freed path — stays identical across variants of a type.

## Mechanism 3 — anti-convergence

The owner chose to let the model pick both the archetype and the variants. The evidence in this document is
that the model converges: handed a random archetype in prose, it produced its own modal spine every time.
Left unaddressed, "the model chooses" becomes "every store is revista + grid" and this work delivers nothing.

The codebase already has the machinery. `source-projects.service.ts:57` returns *"fingerprints other stores
used recently, newest first and distinct"*, and the planner already steers away from them.

This spec extends that: the recent-use query also returns the `archetype` id and the variant choices recent
stores made, and the sketch prompt carries a line naming them as taken:

```
Estas estructuras ya las usaron tiendas recientes: revista, mercado. Elegí una distinta.
Variantes ya muy usadas: catalog grid, story column. Preferí otras salvo que el contenido pida lo contrario.
```

The archetype line is a hard instruction; the variant line is a preference, because a variant can be wrong
for the content (a `rail` catalog for 40 products) in a way an archetype rarely is.

This is advisory, and by this document's own argument advisory guidance is unreliable. It is acceptable here
because the failure is benign and visible: a repeated archetype produces a coherent page that merely
resembles another store, rather than a broken one. The distribution test below is what tells us whether it
is working, and if it is not, the fallback is to draw the archetype mechanically from the un-used set.

## Testing

**Unit — enforcement (`sketch-archetypes.spec.ts`)**
- a block the archetype forbids is dropped, with a note (showroom + hero)
- a block absent from `slots` is dropped (mercado + marquee)
- a missing required block is inserted (any archetype with no catalog)
- a repeated type is capped at the archetype's count (feria holds three marquees, not five)
- blocks are reordered into the archetype's sequence, footer last
- a sketch with no archetype passes through untouched — the back-compat and chat-edit guarantee

**Unit — variants**
- an unknown or `'auto'` variant falls back to the type's default
- a sketch saved without `variant` renders exactly as it does today
- every variant in the vocabulary renders without throwing, for every type

**Distribution**
- stubbing the model to name each of the six archetypes in turn yields six distinct block sequences. This
  guards the enforcement, not the model's taste, and is the test that would have caught today's defect.

**Browser (`sketch-canvas-layout.spec.ts`)**
- each of the six archetypes renders at 1440px and at 390px with no collapsed section — reusing the
  measurement written for the dosage fix (a section whose tallest in-flow child is 0 is collapsed)
- a representative variant of each type renders without overlapping in-flow text

## Build order

Enforcement before variants, in three stages that each leave the system shippable:

1. **Archetype data + `applyArchetype` + schema field + enforcement in `repairSketch`.** At the end of this
   stage stores already stop sharing a spine — the measurable win.
2. **Variant vocabulary, schema, repair fallback and rendering**, type by type, each with its own tests.
3. **Anti-convergence**, last, because it needs both choices to exist before it has anything to track.

Variants built before enforcement would only add noise to one shared skeleton.

## Risks

- **The model picks one archetype forever.** Mitigated by mechanism 3 and detected by reading the archetype
  distribution across recent `StoreSourceVersion` rows. Fallback: draw mechanically from the un-used set.
- **An archetype suits a store badly** — `mercado` makes the catalog the protagonist, and a store with an
  empty catalog has nothing to show. The owner chose model-selection partly for this reason: the model reads
  the brief. If it proves unreliable, filter the enum offered to the model by what the store actually has.
- **Enforcement deletes work the merchant wanted.** Contained by scope: enforcement never runs on a chat
  edit, and every drop is reported in `autoRepairs`.
- **A variant changes node paths** and silently breaks a freed part's position. Prevented by the CSS-first
  rule above, and caught by the browser tests.
