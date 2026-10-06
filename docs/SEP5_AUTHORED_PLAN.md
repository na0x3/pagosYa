# Sep-5 authors, the design engine renders

Decision of 2026-10-06. The nine-store benchmark (Sep-5 9/9, engine 8/9) showed
Sep-5 winning on voice and colour while the engine won on execution: real web
fonts, correct layout, five pages with a product page and checkout. The owner
chose to keep Sep-5 as the author and the current design engine as the renderer.

## What the benchmark actually showed

Measured over nine stores, both engines on the same catalogue, photos and briefs:

| | Sep-5 | engine |
|---|---|---|
| stores generated | 9/9 | 8/9 (pilates failed twice) |
| non-neutral colours | 7.1 | 3.4 |
| body copy | 1,923 chars | 1,228 |
| wall-clock | 250s | 660s |

Read by eye across all nine pairs, the split is consistent: Sep-5 writes a line
of dialogue (`Que no te gane el fondo de la bolsa`), the engine restates the
tagline (`Libros escogidos uno por uno`). The one pair the engine clearly wins
is rhode, where Sep-5 ships a headline clipped off the left edge of the viewport.

Two defects found while reading, both worth fixing independently of this work:

- Sep-5 pages throw a `Failed to fetch` toast on load (seen on pet, rhode,
  cuadrizate). They render, so generation counts as a pass, but something at
  runtime does not.
- The engine leaked a hallucination-guard instruction into customer-facing copy
  on shampoo: `La información no confirmada queda pendiente de detalle`.

## The schema was not the colour bottleneck

The 2026-10-05 note blamed the schema for flattening every store. Measuring the
Sep-5 output against `creativePlanSchema` does not support that for colour.

The engine's palette has exactly five slots — `paper, ink, accent, deep, pop`.
Sep-5's pet store uses `#fff8ee` paper, `#172b2d` ink, `#087f98` teal,
`#00566b` deep teal, `#ed5a2a` orange. That is the same five slots, filled with
committed hues. Across the nine stores Sep-5 emits 10–16 distinct hex values
and 14–16 CSS custom properties — a token system of the same shape as ours.

The gap is not capacity. It is that the engine's creative stage chooses
near-neutral values for three of its five slots. Transferring Sep-5's palette
into those same slots should carry most of the colour advantage with no schema
change at all.

Section structure fits too. Sep-5 emits 5–6 semantically named sections per
store, all of which land inside the registry's 14 families:

| Sep-5 section | engine family |
|---|---|
| `hero` | hero |
| `shop-section`, `catalog-section` | catalog |
| `buying-rhythm`, `route-guide`, `plan-guide` | steps |
| `costal-note`, `origin-story`, `week-rhythm`, `advice` | story |
| `last-call`, `office-callout` | banner |
| `questions` | faq |

What genuinely does not survive is bespoke *visual treatment* — the chalkboard
texture behind coffee's `¿QUÉ VAS A TOMAR?` menu is CSS the registry has no
variant for. The copy and the structure survive; the texture does not.

## The seam

`source-generation.service.ts:804` is where the creative plan is produced:

```ts
const creativePlan = aiBrand ? await designStage('creative', ART_DIRECTION_PROMPT, {…}) : undefined;
const enginePlan = compatibleCreativePlan(creativePlan || fallbackCreative(designInput, brandDirection), designInput);
```

Line 805 normalizes whatever it receives. A Sep-5-authored plan becomes a third
source at exactly that point. The renderer, the registry and the five-page build
are untouched.

## Build order

1. **Extractor** (`sep5-extract.ts`) — parse a Sep-5 file set into palette,
   copy, section order and art-direction signals. Pure, no network. Tested
   against the nine Sep-5 outputs already on disk at
   `~/pagosYa-sep5-output/bench2/sep5/`.
2. **Translator** (`sep5-plan.ts`) — assemble the extraction into a
   `CreativePlan`, `creativePlanSchema.parse` it, and emit a **loss report**
   naming every Sep-5 decision with no slot. The losses are reported, never
   silent.
3. **Author stage** — run the Sep-5 generator (prompt and model verbatim, as in
   `apps/api/sep5-run.mjs`) as a plan source behind a flag.
4. **Wire** — third branch at `source-generation.service.ts:804`.
5. **Re-run the benchmark** on the same nine briefs and re-measure colour and
   copy against both baselines.

## Cost, which the owner accepted up front

Two generators stay alive. The authored path pays Sep-5's generation before the
engine's render, so it is slower than either alone — Sep-5 250s plus whatever
the render costs, against the engine's 660s. Worth re-measuring at step 5
rather than assuming.

## Status

**Step 1 (extractor) is built and tested.** `design-engine/sep5-extract.ts`, with
seven unit tests on inline fixtures, plus a check against the nine Sep-5 projects
on disk.

Measured over all nine stores:

- **43 of 43 sections map** onto registry families, up from 29 of 43 before the
  keyword set was widened. No store has an unmapped section.
- **45 palette slots filled, 26 hues dropped** — roughly three per store, which
  is the real and irreducible cost of a five-slot palette against Sep-5's 10–16.
  Each one is named in `losses`.
- **8 of 9 palettes match what the page actually looks like** in the browser.
  ice-cream is the exception: it picks `#c94c67` as accent where the page reads
  yellow over navy.

Three heuristics took most of the work, and each is there for a measured reason:

- **Colour is weighted by painted area, not declaration count.** pet names its
  yellow on four controls and its teal on one hero; counting references picks
  yellow, which is not what the page looks like. Only the last element of a
  compound selector counts, or `.hero__visual figcaption` scores as a hero band.
- **A near-black dominant hue becomes `deep`, not `accent`.** book, shampoo,
  ice-cream and pilates all lead with a dark field colour. Treating it as the
  accent left `deep` as a synthetic near-duplicate and dropped the real accent.
- **Colour is detected by chroma and HSL saturation together.** Absolute chroma
  alone called coffee's `#14392f` forest green neutral and dropped it; HSL
  saturation alone calls `#fff8ee` fully saturated.

**Steps 2–4 are built and tested.** 40 tests across the design-engine suite.

- `design-engine/sep5-plan.ts` — extraction to a schema-valid `CreativePlan`,
  with a loss report. All nine stores produce a valid plan; 30 losses reported.
- `design-engine/sep5-author.ts` — the Sep-5 prompt pinned verbatim as
  `sep5-author/26f889c8`, its response schema, its usability guard, and
  `sep5AuthoredPlan()` as the one-call translation.
- `source-generation.service.ts:804` — the authored plan is now a third source,
  behind `app.sep5Author` (`YAPI_SEP5_AUTHOR=1`), **off by default**. With the
  flag off the expression is `undefined ?? <previous behaviour>`, so nothing
  changes.

### Carrying the voice across

The point of the exercise, visible in the translated section intents:

- pet — *"Que no te gane el fondo de la bolsa."*
- nutrimar — *"Tu semana tiene hambre. Tú tienes agenda."*
- shampoo — *"¿Qué está pidiendo tu cabello hoy?"*

These become section `intent` values the engine renders, instead of the
tagline-restating copy the engine's own creative stage produced.

### A sameness trap worth recording

The first working translator gave all nine stores `style: editorial`,
`navigation: editorial`, `displayScale: 7` and `cornerStyle: square` — because
the only signal it read was serif-versus-sans, and all nine Sep-5 stores use a
serif. That rebuilt the exact uniformity this work exists to remove.

The fix was to read signals that actually vary across the corpus, measured
before choosing the mapping: zero-blur offset shadows (4 of 9), uppercase
declaration density (0–21), corner radii (none, sub-rem, pill) and the h1
maximum in rem (3.7–4.5). The nine stores now resolve to **seven distinct art
directions**, four font pairings and four navigation treatments.

The general lesson: a derived signal that does not vary across the corpus
flattens the output no matter how well the rest of the pipeline works. Check
the spread before trusting the rule.

### Not yet done

Step 5, the re-benchmark, needs a live API key — the benchmark key was revoked
after the first run. Nothing has exercised the author stage end to end against a
real provider yet, so the translation is verified only against the nine Sep-5
projects already on disk.
