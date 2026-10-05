# YAPI: the modern feel — motion, surface, and an image-led vocabulary

**Date:** 2026-10-04
**Status:** agreed direction, not yet specced to task level
**Owner's words:** *"i want sites like that… ALL OF THE SITES NOW ARE THE SAME, ABSOLUTE SAME… now titles
are everywhere… yapi now builds like very basic html css, i want that modern feel"*
**Hard constraint from the owner:** *"i dont want no set rules for yapi for design."* Everything below adds
CAPABILITY, never a grammar. The model still chooses; it simply gains things it cannot currently say.

## Why this exists

The page-grammar work that shipped today (see `2026-10-04-yapi-page-grammar-and-real-copy-design.md`) fixed
the page SPINE — which bands appear, in what order, at what width. It is measurably working: skeletons are
drawn before the model is called, 50 draws give ≥45 distinct spines, and the old modal 13-band spine appears
at most once in 200.

**The owner still says every store looks the same, and the newest one looks worse.** They are right, and the
spine was never the cause. Two things are:

1. **Texture, not sequence.** Every YAPI block renders the same furniture — kicker → title → body → cta.
   Reorder those bands however you like and the page still reads as a stack of titled announcements. In the
   store generated 2026-10-05T00:24Z, **5 of 8 bands were kicker + title**. That is "titles are everywhere",
   and it is visible in the data, not a matter of taste.
2. **The pages are static and flat.** Measured across all generated CSS: **1 `@keyframes` and 2 `animation`
   rules — the marquee, and nothing else.** Zero scroll triggers, zero IntersectionObserver, zero sticky,
   zero entrance transitions. For surface: 6 `box-shadow`, 1 `filter`, 1 `clip-path`, and **zero** gradients,
   grain, `mix-blend-mode` or `backdrop-filter`.

## Evidence: the three sites the owner wants to match

Measured in a real browser on 2026-10-04, at 1440px.

| | dhoopmag.com | bouquetinfusions.com | littleampscoffee.com | YAPI's store |
|---|---|---|---|---|
| page height | 12,882px | 7,157px | 6,581px | 8 bands |
| **headings (h1–h3)** | **0** | **5** | ~30 | ~10 across 8 bands |
| images | 43 | 33 | ~120 | 0 (store was empty) |
| words | 745 | 1,478 | ~4,000 | every slot filled |
| max type / body | 62 / 12 ≈ 5:1 | 48 | 58 / 16 ≈ 3.6:1 | ~83 / 17 ≈ 5:1 |

**dhoopmag has ZERO `h1`/`h2`/`h3` and ZERO `<section>` elements** on a 12,882px page — one `div`, 43 images,
745 words. It is not a page of titled bands at all.

**bouquetinfusions' opening screen** is a flat saturated orange field, one rotated photo with an offset
double frame, a wordmark, and four letterspaced mono words (`FLAVOR ARRANGEMENT ATELIER`). No heading, no
paragraph, no button. An entire viewport doing ONE thing. YAPI's hero has seven text slots (headline, sub,
cta, cta2, trust, badge, caption) and cannot express that screen.

**NOT the problem — do not "fix" it:** YAPI's type scale is already ~5:1, matching dhoopmag and exceeding
littleamps. Band widths, palettes and font pairing are fine. The gap is motion, surface and vocabulary.

## Diagnosis

YAPI's unit of composition is **a band with named text slots the model fills**. The slots exist, so the model
fills them, so every band announces itself. The reference sites' unit is **an image and some type on a
field**, where most elements are simply absent.

This is a vocabulary problem, not a rules problem. Permuting seven-slot titled bands yields a different
arrangement of seven-slot titled bands.

## The four steps, in order of feel-per-unit-of-work

### 1. Motion on scroll — biggest signal, smallest change. DO THIS FIRST.
Currently zero. One `IntersectionObserver` plus a few CSS classes: bands rise and fade as they enter, images
settle from a slight scale (≈1.06 → 1), type arrives a beat after its image. Must honour
`prefers-reduced-motion` (the base CSS already has a reduced-motion block to extend). Applies to every
existing block, so it lifts every page without touching the generator.

### 2. Surface and depth.
Grain/noise overlay on colour fields; offset/stacked frames on photos (bouquet's double frame); hard shadows;
`mix-blend-mode` for type over imagery. Today's `hard-shadow` button is the same instinct — extend it to
photos and fields. Also texture-level: no generator change.

### 3. Image-led primitives + genuinely optional slots. NEEDS THE SLOT WORK FIRST.
- **Make every text slot optional.** A block offering `kicker`, `title`, `sub`, `note`, `cta`, `cta2`,
  `trust` gets them all filled because they exist. An empty slot must be normal, not a repair to be
  corrected. This alone kills "titles everywhere" WITHOUT any rule about where titles go.
- **Add primitives with no text furniture**: full-bleed photo with one line over it; a rotated photo on a
  flat saturated field; an image pair and nothing else. New materials, not a grammar.
- **Let a band be one thing.** Four words on a screen must be expressible.
- **Measure words-per-image** as a reading, not a rule: dhoop ≈17:1, bouquet ≈45:1. It says a page is
  over-written without dictating what goes where.

### 4. Sticky / pinned moments.
One section that holds while its content moves past. Once per page reads as craft; twice reads as a template.
Composition-level and the easiest to overuse — last, and sparingly.

## Recommended sequencing

**Steps 1 and 2 as a single piece of work, then LOOK at a generated store before specifying step 3.** If
motion and surface close most of the gap, the vocabulary work becomes much easier to specify, because the
owner will be judging composition rather than a static flat page.

## Testing notes carried from today's work

- The browser harness exists: `sketch-canvas-layout.spec.ts` has `openSketch(sketch, visit)` which builds,
  serves and opens a sketch in Chromium, with computed-style assertions already in use.
- A "no band is visually empty" assertion exists and FOUND a real production defect — keep that pattern.
- `SKETCH_BASE_CSS` in `sketch-blocks.ts` is a **JS template literal**: a backtick anywhere inside it,
  including in a comment, breaks compilation (TS1005). This has bitten twice.
- Motion cannot be judged by "the string appears in the stylesheet" — a CSS specificity loss is invisible to
  that. Two real bugs shipped past such tests today. Assert computed styles in the browser.
- Test command: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'`. Never `--rootDir` from the
  repo root. Never two jest processes at once.

## Open decisions for the owner

- Whether motion should be drawn per store (a "motion mood", like the palette moods) or kept uniform. Drawn
  risks the same convergence problem; uniform risks sameness of a different kind.
- Whether `gallery`/`catalog` should gain a no-header variant, or whether optional slots cover it.
- Fonts: the catalog is 32 families. dhoopmag uses a characterful display face ("Fluxisch Else"). Whether to
  widen the catalog is a separate question from motion and surface.
