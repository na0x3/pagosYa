# YAPI: a generated page grammar, copy grounded in the real catalogue, and per-block variants

**Date:** 2026-10-04
**Status:** approved design, ready for an implementation plan
**Sub-projects:** 2 (variants per block type) and 4 (page structure) of the "YAPI superbot at design" program
**Supersedes:** `2026-10-04-yapi-archetypes-and-variants-design.md` (deleted — it proposed six fixed
archetypes, which the owner rejected; see "Why not archetypes")
**Predecessor:** `2026-10-04-yapi-composition-and-width-design.md` (composition freedom + band width), shipped

## The problem

Every generated store looks alike — "different colours, same page underneath". Three distinct causes, found
by measurement, not supposition.

**1. The spine is identical across stores.** The store generated 2026-10-04 15:29:

```
announce → hero → catalog → collections → split → steps → story → reviews → marquee → faq → banner → newsletter → footer
```

Structure guidance already exists and is ignored: `sketch-direction.ts:36` holds `STRUCTURES`, six named
page grammars, one drawn per generation and handed to the model as prose. The spine above matches **none**
of them — it is a 13-block superset of grammars describing 7–10. The direction even says
`PROHIBIDO el boceto genérico ... ni el mismo orden de siempre`, and the model still produces its modal answer.

**2. The copy is generic, because the model is not told what the store sells.** `sketchPrompt`
(`sketch-request.ts:69`) receives `catalogNames: string[]` and nothing else about the catalogue — no
descriptions, no prices, no categories — built by throwing away every other field:
`data.items.map(item => item.name).slice(0, 30)` (`source-generation.service.ts:738`). The prompt then frames
even those names as belonging to one block: *"Productos reales del catálogo (el bloque catalog los muestra
solo)"*. So the hero headline, the story, the faq and the reviews are written from the brief alone. They come
out as virtue copy about nothing — the 15:29 store's story band reads *"Estamos dando forma a una selección
pensada como una revista: capas, tonos y objetos que conversan entre sí."*

**3. Per-block shape barely varies.** Of 14 page block types, only `hero` (3) and `newsletter` (2) have more
than one shape. The other twelve render exactly one way.

Causes 1 and 2 compound: that store had **zero products**, and the generator still drew thirteen bands. A page
with more slots than the store has things to say can only be filled with filler.

The lesson, learned in this subsystem hours earlier when the composition pass freed 42 parts across 10 of 13
blocks: **a prompt cannot hold an invariant.** Generated structure, real inputs, and repair can.

## Why not archetypes

The obvious fix for cause 1 — promote those six structures from prose to data and enforce them — was
specified and rejected: *"i dont want fixed archetypes"*. The objection is right. Six enforced skeletons
replaces "every store is the same page" with "every store is one of six pages", and widening it means
hand-writing a seventh.

The model for this work is a parametric generator: knobs and constraints, where outcomes are combinatorial
and widening the space means adding a parameter.

## Mechanism 1 — the page grammar

### Where it sits

A new module `sketch/sketch-structure-draw.ts`, beside `sketch-direction.ts`, drawn where the palette, type,
energy and scale moods already are. `drawSketchDirection` keeps its other moods; its `STRUCTURES` array is
deleted, because its job moves here.

```ts
export type PageSlot = { id: string; type: SketchBlock['type']; size: SketchSize; width: SketchWidth; media: boolean };
export type PageStructure = { slots: PageSlot[]; params: PageParams };
export function drawPageStructure(ctx: SketchContext, substance: StoreSubstance, random?: () => number): PageStructure;
```

### The parameters

| parameter | range | what it does |
|---|---|---|
| `length` | 6–14, **capped by `substance`** | how many bands the page has |
| `opening` | any editorial or accent type | which type opens. `hero` is one option among several, not the default |
| `catalogAt` | 0.15–0.85 | where the catalog falls as a fraction of the page |
| `accentEvery` | 3, 4, 5 or `null` | an accent band every *n* slots, or none |
| `rhythm` | `crescendo` \| `alternating` \| `plateau-spikes` \| `calm` | the s/m/l/xl curve across the page |
| `widthSeq` | a walk over the 5 widths | band widths, never repeating a neighbour |
| `mediaBudget` | 1 … min(photos, 5) | how many bands carry a photo, and which |

### Substance caps the page

`StoreSubstance` is counted from what the store actually has — products, photos, and whether the brief says
anything specific. It sets the ceiling on `length` and forbids slot types the store cannot fill:

- no products → no `catalog`, no `collections`; `length` capped at 8
- fewer than 2 photos → no `gallery`; `mediaBudget` capped at the real count
- no reviews data and a new store → no `reviews`
- a thin brief → `length` capped at 9

This is the fix for a thirteen-band page about nothing. **A store with little to say gets a short page**,
which is also what a good designer would do.

### The grammar

Constraints are rules, not approved outputs. The draw retries a slot that would violate one and falls back to
the nearest legal choice after a bounded number of attempts, so the function is total:

- exactly one `catalog` when the store has products; exactly one `footer`, always last
- at most one each of `announce`, `newsletter`, `faq`, `collections`
- `announce`, if drawn, is slot 0
- no two accent bands (`announce`, `marquee`, `banner`) adjacent
- no two neighbouring slots share a `width`
- no three consecutive slots carry media
- `mediaBudget` never exceeds the store's real photo count

### The model's side

The schema stops accepting a free-form `blocks` array. Each response block carries the `id` of the slot it
fills. In `repairSketch`:

- a block whose id matches no slot is **dropped** — this is what stops the model appending its modal spine
- a slot no block filled is a **veto**: the slot is dropped and the page closes up
- a vetoed `catalog` or `footer` is refused and filled with a default
- vetoes are capped at `floor(length / 3)`; past that the remaining slots are filled with defaults
- after vetoes the adjacency rules are re-checked, since dropping a slot can leave two accent bands touching

Every drop and refusal appends a Spanish note, surfaced through `autoRepairs` as composition's notes are.

### What it does not touch

Generation and full redesigns only. **A chat edit is never restructured** — a merchant changing a headline
must not have bands removed underneath them. Enforcement is opt-in at the call site
(`repairSketch(..., { enforceStructure: true })`), never triggered by a field's presence. Sketches saved
before this change have no structure and are untouched.

## Mechanism 2 — copy grounded in the real catalogue

A page is only as specific as what the writer knows. Today the writer knows up to thirty product names.

### Give it the real catalogue

Replace `catalogNames: string[]` with a product digest built from the fields `data.items` already carries —
at minimum name, price, and whatever short description, category and option/variant labels exist on the
item. The exact column list is the plan's job; the requirement is that the digest carries **what a copywriter
would need**: what the thing is, what it costs, what distinguishes one from another.

Budgeted, not dumped: a sample of up to 20 items with their fields, plus aggregate facts the whole page can
use — item count, price range, the categories present, the most common materials or options. Aggregates are
what let a hero headline be true about a catalogue too long to list.

### Tell it the catalogue is for the whole page

Delete *"el bloque catalog los muestra solo"*. The catalogue is the subject of the page, not the contents of
one band. The prompt instructs: every band carrying prose must say something only this store could say — name
a product, a category, a price point, a material, an option — and the bands have specific jobs against it
(the story is about how *these* things are made or chosen; the faq answers questions about *these* items'
sizes, shipping, materials; the banner names a real reason to act).

### Name the failure explicitly

Generic virtue copy is the failure mode, and it is worth naming in the prompt rather than describing: no
*"calidad que se nota"*, *"hecho con amor"*, *"una selección pensada"*, *"objetos que conversan entre sí"* —
sentences that would be true of any store. Where the store genuinely has nothing to describe, the page says
less; it does not fill the gap with mood.

### When the catalogue is empty

The honest page for a store with no products is short (Mechanism 1 caps it), says plainly that the shop is
opening, and does not pretend to a curated selection. This is a real state, not a defect to write around.

### Measuring it

A "specificity" check usable in the eval script and in tests: for a store with a catalogue, the prose bands
must between them mention at least *n* distinct real nouns drawn from the digest. This is a measurement and a
test signal, not a repair — rewriting a model's prose mechanically produces worse prose. A page that fails it
is reported, not patched.

## Mechanism 3 — per-block variants

A variant changes a block's markup and CSS for the **same fields**. No variant introduces a content field, so
the schema stays small, old sketches keep rendering, and the Boceto's node paths stay stable — a freed part's
path must not change because a variant changed.

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

`announce`, `marquee`, `split` and `footer` get none: `footer` and the header are already shaped by
`style.footer` / `style.header`, and the other two are thin bands shaped by `width` and `align`.

The `block()` helper in `sketch-request.ts` gains a `variant` property — the type's list plus `'auto'`, added
to `required`, matching the convention `style` uses. Repair turns `'auto'` or an unknown value into the
type's default. Rendering is a branch selected by a `data-skb-variant` attribute, CSS-only on a shared markup
tree wherever possible.

The model picks variants freely, which is safe here in a way it was not for structure: the spine is varied by
construction, so a favourite variant costs richness, not identity. `source-projects.service.ts:57` already
returns *"fingerprints other stores used recently"*; extend it to carry recent variant choices and add one
advisory line naming them as over-used.

## Testing

**The draw (`sketch-structure-draw.spec.ts`)**
- a seeded random is deterministic; different seeds give different structures
- 200 draws all satisfy every grammar rule: one catalog, one footer last, no adjacent accents, no repeated
  neighbouring width, no three media in a row, length in range, caps on single-use types
- `announce`, when present, is slot 0
- a store with no products draws no catalog and no collections, and at most 8 slots
- a store with one photo draws at most one media slot and no gallery
- a `service` store draws no catalog

**Filling and veto**
- a response block whose id matches no slot is dropped
- a slot no block filled is dropped and the page closes up
- a vetoed `catalog` or `footer` is refused and filled with a default
- vetoing past `floor(length / 3)` fills the remainder with defaults
- dropping a slot that leaves two accent bands adjacent repairs the adjacency
- without `enforceStructure` a response is untouched — the chat-edit guarantee
- a sketch with no structure is byte-identical to today

**Copy grounding**
- the prompt contains product names, prices and categories from the digest, and the aggregate facts
- the prompt no longer contains `el bloque catalog los muestra solo`
- a catalogue of 200 items produces a bounded prompt (digest sampled, aggregates present)
- an empty catalogue produces the honest short-page instruction and no invented selection
- the specificity check counts real nouns across prose bands and reports a page that mentions none

**Variants**
- `'auto'` or an unknown variant falls back to the type's default
- a sketch saved without `variant` renders as today
- every variant of every type renders without throwing

**Distribution — the test that would have caught the original defect**
- 50 seeded draws produce at least 45 distinct block sequences
- feeding the modal 13-block spine as the response to 10 drawn structures yields 10 different pages

**Browser (`sketch-canvas-layout.spec.ts`)**
- ten seeded structures render at 1440px and 390px with no collapsed section, reusing the dosage fix's
  measurement (a section whose tallest in-flow child is 0 is collapsed)

## Build order

1. **The draw, its grammar and substance caps**, with unit and distribution tests. Nothing wired up.
2. **Filling, veto and enforcement in `repairSketch`** behind `enforceStructure`. Stores stop sharing a spine.
3. **The schema and prompt**: slot ids in, free-form blocks out; `STRUCTURES` deleted from the direction.
4. **The product digest and the copy instructions**, with the specificity measurement.
5. **Variants**, type by type.
6. **Variant anti-convergence**, last.

Stages 1–4 are one plan: structure and copy are the two halves of the same complaint, and a short honest page
needs both. Stages 5–6 are a second plan — variants are mostly rendering work.

## Risks

- **A drawn skeleton suits a store badly.** Mitigated by the veto, by substance caps, and by `purpose` gating
  the catalog. Frequent vetoes hitting the cap mean the grammar's weights are wrong, and the veto distribution
  says which slot is to blame.
- **The draw produces a legal page that still reads oddly.** The constraints are the defence and are cheap to
  add one at a time; the browser test catches structural breakage, not taste.
- **The digest leaks a large catalogue into every prompt.** Bounded by sampling plus aggregates; a test pins
  the bound at 200 items.
- **Grounded copy becomes a product listing.** The instruction asks for prose only this store could write,
  not for product names in every sentence; the specificity check has a floor, deliberately not a target.
- **A variant changes node paths** and breaks a freed part's position. Prevented by the CSS-first rule,
  caught by the browser tests.
