# YAPI composition and band width — design (2026-10-04)

Status: approved by the owner in conversation 2026-10-04. First sub-project of the "YAPI superbot at design" program
(decomposition below). Builds on the sketch-first program (`2026-10-02-sketch-first-yapi-program.md`) and the Boceto free
layer (`2026-10-03-boceto-free-layer-design.md`), whose controls this spec hands to YAPI.

## Intent

What the owner said: "i feel like the websites are too simple now, i want to make yapi a superbot in design". Asked
which gap they meant, they chose **"every store looks alike — different colours, same page underneath"**, and asked for
**total freedom** on the grid.

The investigation found a concrete cause rather than a prompting problem. `drawSketchDirection`
(`sketch-direction.ts`) already draws ~5,000 creative directions (12 palettes × 6 typographies × 6 structures ×
3 energies × 4 scales) and explicitly forbids the generic boceto. But every direction is poured into the same skeleton:

1. **YAPI is locked out of the composition controls that already exist.** `SketchLayout` in `sketch-schema.ts` gives
   every block `align`, `flip`, `swap`, `order`, per-group `layout`, `free` and `extras`; `sketch-blocks.ts` renders all
   of them and the Boceto exposes them by hand. `SKETCH_JSON_SCHEMA` (`sketch-request.ts:22`) declares
   `additionalProperties: false` and lists none of them, so the model cannot emit a single layout decision.
2. **Every section is a full-width band.** `.skb` sets `padding-inline` and no `max-width` at all; `skb--s/m/l/xl` set
   `padding-block` only. So `size` is vertical air, nothing more, and a block's only other freedom is `bg`. Two degrees
   of freedom per band.
3. **The shape language is dice.** `source-generation.service.ts:761` overwrites whatever the model produced with
   `style: direction.style`, so `radius`/`buttons`/`cards`/`header`/`footer` are random — a brutalist butcher shop gets
   soft pill buttons half the time.

Counting arrangements: hero has 3 variants, newsletter 2, the other twelve block types one each. Across every store
pagosYa will ever generate there are ~17 distinct section shapes, all full width, all stacked vertically.

Success: two stores generated from the same brief and the same block list look like different sites — different band
widths, mirrored and reordered sections, parts that escape their box, and a shape language that matches the brand. No
generation ever shows the merchant an error, and the phone view is never broken.

## Why total freedom is safe to grant

The owner chose total freedom, which appears to collide with their standing rule that users never see errors
(`yapi-reliability-freedom`). It does not, because repair already guarantees the floor:

- `sketchFreePos` clamps `x`/`y` into the section box (0–100), `w` to 5–100 and `r` to ±180.
- `repairSketchFree` validates every path against the **real rendered node tree** (`sketchCanFree` →
  `sketchFindNode(sketchNodeTree(block), path)`), drops unknown paths, caps at `SKETCH_FREE_MAX` (30), forbids nesting,
  and refuses `NEVER_FREE` (`sticker`, `photo`).
- `repairSketchLayout` keeps only the group-layout fields that group kind allows (`LAYOUT_FIELDS`).
- Extras cap at `SKETCH_EXTRA_MAX` (12) from the fixed `SKETCH_EXTRA_KINDS` allowlist.
- `FREE_CSS` lifts freed parts only inside `@media (min-width: 900px)`. Below that they sit back in their column and
  extras become a centred row, so **the phone view cannot break**.

Total freedom therefore risks only the desktop view, and only aesthetically — two parts covering each other — never
structurally.

## The constraint that decides the architecture

`free` is keyed by internal node paths (`copy/actions`, `items/0/title`) derived from the renderer's `data-skb-el` /
`data-skb-group` / `data-skb-node` attributes, and which paths exist depends on which fields that particular sketch
populated. The model has never seen them and cannot guess them, and `repairSketchFree` drops invalid paths **silently**.

So widening the one-shot schema would make YAPI emit `free` spots with invented paths, every one of which repair throws
away: a bigger prompt, a higher failure rate on a call that failed 41% of attempts before the agent loop existed, and no
visible change. Freedom has to be granted by a call that knows the real paths.

Approaches weighed: (A) widen the one-shot schema — hits the path trap; (C) named composition intents the server
translates into spots — reliable and always tasteful, but its ceiling is however many intents we write, which is not
total freedom. Chosen: **(B) two stages**, with (C)'s intents demoted from limits to examples inside stage 2.

## Stage 1 — the band stops being a stripe

`SKETCH_JSON_SCHEMA` gains four flat per-block fields. They are enums and booleans, so there is no path problem, strict
mode stays satisfied and the prompt barely grows.

- **`width`**: `'bleed' | 'wide' | 'narrow' | 'offset-left' | 'offset-right'`. New. `bleed` is today's behaviour and the
  default, so old sketches render unchanged.
- **`flip`**, **`align`**, **`swap`**: already rendered and tested (`sketch-blocks.ts:27`, `actionsRow(…, b.swap)`,
  `data-skb-align` rules); unlocked, not built.

All four are properties of the `blocks` array, so the `account` page is untouched: `SketchAccount` carries no `size` or
`width`, keeps its fixed `skb--l`, and stays outside stage 2 as well — `freeShape` already refuses every path on a block
of type `account`.

These live in the shared schema, so the chat edit path gets them too: "ponela en espejo", "angostá esa sección" and
"alineá eso al centro" start working as sketch edits.

`style` also joins the schema, each dimension as its enum plus the sentinel `'auto'`:
`{ radius, buttons, cards, header, footer }`. `'auto'` means "let the design choose", so
`source-generation.service.ts:761` becomes a merge — the drawn `direction.style` supplies every dimension the model left
on `'auto'`, and the model's explicit choice wins otherwise. Random variety survives where the model has no opinion;
coherence arrives where it does. (Strict json_schema requires every property in `required`, which is why deferral is a
sentinel value rather than an omitted field; `''` would match the `photo` convention but `'auto'` reads better in the
prompt.)

### Rendering `width`

The section keeps its full-width background, so width constrains the section's **content**, never `.skb` itself:

```
.skb[data-skb-width="wide"]   > :not(.skb-extras) { max-width: 76rem; margin-inline: auto; }
.skb[data-skb-width="narrow"] > :not(.skb-extras) { max-width: 44rem; margin-inline: auto; }
.skb[data-skb-width="offset-left"]  > :not(.skb-extras) { max-width: 60rem; margin-inline-end: auto; }
.skb[data-skb-width="offset-right"] > :not(.skb-extras) { max-width: 60rem; margin-inline-start: auto; }
```

Three details make this safe:

- **`.skb-extras` must stay excluded.** It needs `inset: 0` for free positioning; constraining it would move every
  inserted element.
- **`position: relative` stays on `.skb`.** Freed parts are absolute against the whole band, so they escape a narrowed
  column — which is exactly the editorial overlap the program wants. Width and freedom compose instead of fighting.
- **Offsets collapse to centred below 900px**, so a phone never gets a cramped column beside dead space. The `max-width`
  values are no-ops at phone width, so `wide`/`narrow` need no media query.

Targeting the section's direct children rather than introducing a wrapper keeps node paths identical. (A plain wrapper
would in fact be path-safe, since `segmentOf` reads only the three `data-skb-*` attributes, but touching nothing is
cheaper than proving that.)

## Stage 2 — the composition call

A second, small model call, after `ensureBandRhythm(ensureAllPhotosUsed(…))` on line 760 and only on fresh generations
(`sketchFirst`). It follows the stage-1 call's shape exactly: its own `attempts` row with `phase: 'composition'`,
`budget.reserve`, `AbortSignal` timeout, and `this.metering.record`.

Its prompt carries:

- the stage-1 sketch, compactly;
- **the real freeable paths per block**, from `sketchFreeablePaths(block)` — the fix for the path trap;
- the group-layout fields available per block, from `sketchGroups` / `LAYOUT_FIELDS`;
- the drawn direction's energy line, so `maximalista` composes hard and `minimal` barely touches anything;
- a handful of worked composition examples (a headline overlapping its photo, a badge riding the photo's corner, an
  emoji anchored off a card's corner), offered as vocabulary and explicitly not as a menu — the model may place anything
  anywhere.

It returns a compact object under its own schema, as an array of per-block entries:
`[{ id, free: Array<{ path, x, y, w, r }>, extras: SketchExtra[], order: string[], layout: Array<{ group, gap, dir, align, valign }> }]`.
Results pass through `repairSketchFree` and `repairSketchLayout` per block before merging.

Two shape notes, both forced by strict json_schema requiring every property in `required` and forbidding open maps
(`additionalProperties` must be `false`, so `Record<path, …>` cannot be expressed):

- **Maps become arrays with the key as a field.** `free` is a list of entries carrying their own `path`; `layout` is a
  list carrying its own `group`. The service folds each back into the `Record` shape the repair functions expect.
- **Nothing is optional; empty means absent.** A block with no composition returns empty arrays, and `0` is the sentinel
  for both unset numbers. `r: 0` needs no handling — `sketchFreePos` already drops a zero rotation. `w: 0` **does** need
  handling: `sketchFreePos` clamps any finite `w` to `[5, 100]`, so a raw `0` would render a 5%-wide element rather than
  an automatic one. The service must therefore delete a `w` of `0` from each entry before calling repair. A dedicated
  test covers this, because getting it wrong shrinks freed parts instead of failing loudly.

**Failure is absorbed, exactly as the stage-1 fallback is today:** the attempt row records `FAILED` with its reason, an
`autoRepairs` note is pushed, and the stage-1 sketch ships unchanged. A composition failure costs the merchant a plainer
page, never an error.

Cost: one extra small call per new store. Stage 2 sends a sketch plus a path list and returns a small object, so it is
cheap next to stage 1.

### Why composition fields stay out of the shared schema

Only stage 2 emits `free` / `extras` / `order` / `layout`. Keeping them out of `SKETCH_JSON_SCHEMA` means the chat edit
path can never invent bad paths, and `carryEditorFields` (`sketch-schema.ts:472`) already carries all four through an
edit — remapping free spots through `sketchRemapFree` when list items are added, removed or reordered. So composition
survives the merchant's later chat edits instead of being flattened by the first one. Its guard that only carries a field
when the edited block left it `undefined` keeps working precisely because the edit schema cannot set them.

## Overlap: the accepted residual risk

Repair clamps every part into its band but does not stop two parts covering each other. A collision nudge was considered
and **rejected for this version**: deliberate overlap is the aesthetic being bought, so a nudge would fight the feature,
and the real rate is unknown until live generations exist. The Boceto already lets the owner drag a bad spot in seconds.
Revisit only if real generations come out messy.

## Testing

- **Schema and repair** (`sketch-schema.spec.ts`, shared-types): `width` and `style` round-trip and default correctly;
  old sketches without them still repair; invented `free` paths are dropped; clamps and both caps hold; `'auto'` style
  dimensions fall back to the drawn direction.
- **Renderer** (`sketch-blocks.spec.ts`): each `width` value emits its attribute and rule; `.skb-extras` is never
  constrained; the background stays full width.
- **Golden** (`sketch-golden.spec.ts`): a stage-1 sketch plus a canned stage-2 response assembles to markup carrying the
  expected free stamps and ordering.
- **Real browser** (`sketch-canvas-layout.spec.ts` pattern, `withVisualSandbox` + Chromium): width and freed parts
  together at ≥900px, freed parts escaping a `narrow` column, and the phone fallback below 900px with offsets centred.
- **Service** (`source-generation.service.spec.ts`): stage 2 merges and repairs; a failed stage 2 ships the stage-1
  sketch unchanged with a FAILED attempt row and an `autoRepairs` note; stage 2 does not run on chat edits.

## Out of scope

Later sub-projects of the program, deliberately excluded here: new block types (overlap feature, big-number stats, quote
spotlight, product spotlight, logo row, lookbook); variants per existing block type; page archetypes that differ in
grammar rather than band sequence; rich headlines with coloured words and mixed scale; and running stage 2 on chat edits,
which `carryEditorFields` already makes unnecessary.

## Program decomposition (agreed 2026-10-04)

1. **Composition freedom and band width** — this spec (sub-projects 1 and 2 of the original split, folded together).
2. **Variants per block type** — take the ~17 arrangements past 50: split gets overlap / stacked-offset / boxes-beside,
   catalog gets grid / editorial list / masonry, story gets narrow-centred / two-column / pull-quote.
3. **New editorial blocks** — mine the 21 retired plantillas and the Bake Lab reference.
4. **Page archetypes** — replace the six band-sequence structures with grammars that differ in kind.
5. **Rich headlines and the colour push** — coloured words and mixed scale (the owner's 2026-10-02 work order).
