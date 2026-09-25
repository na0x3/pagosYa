# Motion personalities — sub-project 6 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3 row 6, §5 gate 3).
Depends on: DNA (`dna.motion` ∈ calm | snappy | playful | cinematic, set on `<html data-dna-motion>`) and
sub-project 5 (kit surfaces with transitions).
Status: written under the owner's instruction "build everything from 2-8".

## 1. What exists

- Two separate ease systems: `--ui-ease: cubic-bezier(.22,1,.36,1)` in `packages/storefront-kit/kit/ui.tsx:74`, and
  `--ease-out` / `--ease-drawer` in `commerce.js` and `motion.js`, which are referenced but never defined
  (only their fallbacks apply).
- There are no duration tokens. Every duration is a literal: EntranceGroup 320ms, Reveal 500ms,
  PageEntrance 900ms, header 220/240ms, Marquee 12–90s, drawer, the add pulse at 200ms, reveals of
  220/280ms in `motion.js`.
- Parallax strength, stagger and reveal distance are literals too (ui.tsx:445-480, 700-860).
- Reduced motion and `motion:'off'` are handled correctly and must stay that way.
- The capture sandbox forces reduced motion, so it cannot observe motion running.

## 2. Design

One set of **motion tokens**, defined per personality on `:root` and keyed on `html[data-dna-motion]`, plus
a JS mirror for WAAPI and Motion code:

| Token | calm | snappy | playful | cinematic |
|---|---|---|---|---|
| `--motion-ease` | (.25,.1,.25,1) | (.2,.9,.2,1) | (.34,1.56,.64,1) (overshoot) | (.16,1,.3,1) |
| `--motion-ease-exit` | (.4,0,1,1) | (.4,0,.6,1) | (.36,0,.66,-.56) | (.7,0,.84,0) |
| `--motion-fast` | 180ms | 120ms | 200ms | 260ms |
| `--motion-base` | 320ms | 200ms | 360ms | 520ms |
| `--motion-slow` | 560ms | 320ms | 600ms | 900ms |
| `--motion-distance` | 12px | 8px | 18px | 28px |
| `--motion-stagger` | 70ms | 35ms | 60ms | 110ms |
| `--motion-parallax` | 0.5× | 0.3× | 0.8× | 1.3× (multiplier on today's strength) |
| `--motion-press-scale` | .98 | .96 | .92 | .98 |

- **Store without DNA:** the tokens default to today's values exactly, so nothing changes.
- **`ui.tsx`:** components read the tokens through a helper, `motionToken(name, fallback)`, which reads
  the computed style once per mount. Durations, delays, distances, stagger and parallax strength come
  from the tokens, clamped to the existing safe ranges. The opening still finishes under 1000ms
  (`source-motion-plan.ts`), even for cinematic.
- **`commerce.js` and `motion.js`:** drawer, sheet, added-to-cart, card hover, the add pulse and reveals use
  the tokens. `--ease-out` and `--ease-drawer` become aliases of the motion tokens, so the undefined
  variables are finally defined.
- **Generation prompt:** a short line tells YAPI which personality the store has and to use the
  `--motion-*` tokens in authored CSS/JS instead of literals. It is prompt guidance, not a validator.
- **Safety, unchanged:** reduced motion and `motion:'off'` disable everything; nothing flashes more
  than 3 times per second; the playful overshoot is transform-only, never on layout properties.

## 3. Tests

- A pure test that the token table has all 4 personalities plus a default equal to today's literals.
- jsdom: `html[data-dna-motion=snappy]` resolves `--motion-base` to 200ms through the kit CSS, and the
  JS helper returns the same.
- `ui.tsx`: Reveal and EntranceGroup take their duration from the helper. Durations stay within the
  clamps for every personality, and the opening stays under 1000ms.
- Reduced motion: with `prefers-reduced-motion`, no animation runs for any personality (existing
  behaviour, now asserted for all 4).
- The scorecard's `page` surface records `data-dna-motion`. A static count of authored `--motion-*` usage
  is informational.
