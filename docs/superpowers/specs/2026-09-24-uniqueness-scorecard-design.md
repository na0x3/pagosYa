# Uniqueness and quality scorecard — sub-project 8 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3 row 8, §3.1, §5).
Status: written under the owner's instruction "build everything from 2-8".

## 1. Purpose

A repeatable, **free** (no model calls) measurement that answers two questions for a set of stores:
1. Are they different from each other and from the kit defaults, surface by surface, including
   buttons, cart, added-to-cart confirmation, product page, checkout review and product cards?
2. Do they still work: commerce flow, no overflow, fonts load, buy button readable?

It runs before and after every sub-project, on the same stores, so each change is judged by numbers.

## 2. What exists

- `apps/api/src/storefront-source/source-visual-capture.ts`: a Playwright sandbox (`withVisualSandbox`),
  `captureSourceVisuals` (screenshots at 1280 and 390, with readiness data) and `probeSourceShopping`
  (adds to cart, runs the simulated checkout, checks overflow). The sandbox forces
  `reducedMotion: 'reduce'`, so it cannot observe motion.
- `apps/api/scripts/benchmark-source.ts`: paid generation plus checks, with a `--recheck` mode
  that re-renders saved output without model calls.
- The visual-studio engine has Jaccard structural similarity (`storefront-engine.ts:834-858`), but it
  works on site documents, not on rendered source stores.

## 3. Design

**Core (pure, unit-tested):** `apps/api/src/storefront-source/source-scorecard.ts`
- `SurfaceSample = Record<string, string | number>`, one per surface per store. It holds computed-style
  facts gathered in the browser (see the collector below).
- `surfaceDistance(a, b): number` in 0..1: the mean over shared keys, where numbers are compared as
  relative difference (capped at 1) and strings by equality.
- `scoreStores(stores: StoreSample[], kitDefault: StoreSample): Scorecard`, where each StoreSample
  has id, name, `surfaces: Record<SurfaceName, SurfaceSample>` and quality facts. For each surface it
  computes pairwise distances, the minimum pair distance (the "closest twins"), the mean, and each
  store's distance from the **kit default sample**. For quality it counts failures.
- `SurfaceName = 'button' | 'cart' | 'added' | 'product' | 'review' | 'card' | 'type' | 'page'`.
- Thresholds (constants, recorded in the report): `MIN_PAIR_DISTANCE = 0.25` per surface, and
  `MIN_DEFAULT_DISTANCE = 0.25`. A store closer than that to another store or to the default fails
  on that surface.

**Collector (browser):** `apps/api/src/storefront-source/source-scorecard-capture.ts`
Using `withVisualSandbox` and `currentSourceRuntime(snapshot)`, it opens the store at 1280 and at 390
and records:
- `button`: the primary add-to-cart control's computed border-radius, border-width, background
  luminance, text-transform, letter-spacing, font-family, height, and padding ratio.
- `card`: the first product card's aspect ratio, image radius, text alignment, and the number of
  images available to the card (for preview features).
- `cart`: after clicking the first `[data-cart-open]`, the cart container's position (left, right,
  bottom or centered), width as a share of the viewport, radius, and background vs page background.
- `added`: after adding a product, the confirmation's position, size, radius and background.
- `product`: `data-style` of `[data-pagosya-product]` on `product.html`, gallery position, and buy
  button radius.
- `review`: after opening checkout, `.checkout-review` grid columns and summary position.
- `type`: display and body font families, h1 size to body size ratio, and heading case.
- `page`: DNA attributes on `<html>` (`data-dna-*`) when present, plus the count of motion
  components or hooks found statically in the source (`Parallax`, `Reveal`, `Marquee`, `animate(`,
  `IntersectionObserver`, `@keyframes`), since the sandbox cannot see motion running.
- Quality: `probeSourceShopping` result, overflow at both widths, fonts loaded, missing images, and
  the WCAG contrast of the buy button (text vs background, at least 4.5 for normal text).
- Kit default sample: the same collection run on a minimal fixture store (no authored styling).

**Runner:** `apps/api/scripts/uniqueness-scorecard.ts`
- Default: reads the latest revision of every store from the local database (read-only), limited by
  `--limit` (default 12), with `--stores id1,id2` to pick. `--from-dir <path>` reads exported
  `site/` folders instead (for the benchmark outputs).
- Writes `scorecard.json` and `SCORECARD.md` (per-surface table: closest pair, mean distance, stores
  too close to the default, and quality failures) plus one desktop and one mobile screenshot of the
  cart and the added confirmation per store.
- It never writes to the database or calls a model.

## 4. Tests

- `source-scorecard.spec.ts` (pure): distance of identical samples is 0; fully different samples
  give 1; numeric relative difference is capped; `scoreStores` flags the closest pair and stores too
  close to the default; missing surfaces are reported, not crashed on.
- `source-scorecard-capture.spec.ts` (browser, uses a fixture store): collects every surface key for
  a real render and records the kit default sample. Use the same timeout convention as
  `source-next.spec.ts` (60 s).

## 5. Baseline

After building, run the scorecard on the local stores and commit `SCORECARD.md` as
`docs/research/scorecard-baseline-2026-09-24.md`, the "before" for sub-projects 4–7.
