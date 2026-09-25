# Diversity memory and a wider vocabulary — sub-project 4 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3 row 4).
Depends on: Design DNA (`source-dna.ts`: `FontId`, `defaultDna`, `dnaFingerprint`, `normalizeDna`).
Status: written under the owner's instruction "build everything from 2-8".

## 1. Why

- Fonts: 5 bundled families (`packages/storefront-kit/kit/fonts`: bricolage, fraunces, instrument,
  instrument-serif, oswald). They are listed as prose in `SOURCE_FONT_CHOICES` (`source-fonts.ts:5`) and
  hard-coded in `withSourceFonts` (`source-fonts.ts:11`). Almost every store uses them.
- Stock patterns: `story.eyebrow` is required by the design schema (`source-design.ts:19,39-40,96,114`),
  and `SOURCE_STORY_MOTION_CONTRACT` asks for "an opening eyebrow of roughly 2–5 words". Type roles,
  accent slots and composition examples all push eyebrows. 40 of 42 stores have one.
- Compositions: 4 families (`source-composition-registry.ts`), chosen by keyword score plus a
  per-store hash. There is no cross-store memory in the YAPI source path.

## 2. Decisions

1. **Font catalogue.** Add about 25 more open-licence (OFL) families to `packages/storefront-kit/kit/fonts`
   (variable TTF where available), fetched from the official Google Fonts GitHub repository
   (`github.com/google/fonts`, `ofl/<family>/`). Each gets its OFL file, and `provenance.json` records
   the source URL and sha256 the same way it does for the existing five. A new module
   `source-font-catalog.ts` holds `{ id, family, file, role: display|text|both, personality: string[],
   weights }` for every font. `SOURCE_FONT_CHOICES`, `withSourceFonts` and the DNA `FontId` enum are
   generated from it, so there is a single list. The mix covers serif, grotesk, humanist, geometric,
   condensed, slab, mono, rounded, script-adjacent display and wide display, so pairings can express
   very different personalities. Size budget: at most about 12 MB added to the repo, and a store only
   bundles the fonts its CSS references (unchanged behaviour).
2. **No stock patterns by default.**
   - `story.eyebrow` becomes optional: an empty string is allowed.
   - The prompt stops requesting an eyebrow and instead lists stock patterns to avoid unless the
     concept argues for them: an uppercase eyebrow above every heading; a centred hero with two
     buttons; three icon-and-text columns; a generic "Why choose us" block; a testimonial carousel
     without real reviews.
   - `Eyebrow` stays available in the kit.
   - A soft validator counts eyebrow-like labels (uppercase, small, tracked, above a heading). When
     more than 2 sections use one, it adds a repair note to the build prompt's guidance. It does not
     fail the generation.
3. **More compositions.** Add at least 3 composition families beyond the current 4, aligned with the
   DNA layout grammars that have none today: `poster`, `magazine`, `collage`, `brutalist`, `index`. Each
   family has 3–4 directions with the same fields as the existing ones, so `sourceUiCompositions` can
   pick them. The DNA `layout.grammar` of the chosen concept is passed in, to prefer matching
   families.
4. **Cross-store memory.**
   - A new nullable column `StoreSourceVersion.designFingerprint` (indexed), filled with
     `dnaFingerprint(dna)` when a revision with a design is saved.
   - Before planning, the generator reads the fingerprints of the most recent 40 revisions from
     other stores (last 60 days): a cheap indexed query that never loads snapshots. They go into the
     planner context as `avoidRecent`: "these combinations of button form, cart surface, added style
     and type pairing are taken".
   - After planning, if the chosen concept's fingerprint still equals one of them, a deterministic,
     seeded mutation changes 2 fingerprint fields to the nearest unused values. The change is recorded
     in `autoRepairs`. There is no second paid call.
   - Existing rows stay null. Nothing is backfilled from snapshots, since that is a data migration on
     live data and not needed: the memory fills as stores are generated.
   - The migration is additive only (a nullable column plus an index).

## 3. Tests

- The font catalogue matches the files on disk (every entry has a TTF and an OFL, every TTF has an
  entry). `withSourceFonts` bundles a newly catalogued font when the CSS references it. The DNA `FontId`
  enum equals the catalogue ids.
- The design schema accepts an empty eyebrow. The soft eyebrow validator counts correctly and never throws.
- The new composition families are pickable, and grammar preference changes the ranking.
- Memory: a fingerprint is saved with a revision; `avoidRecent` excludes the store's own revisions and
  anything older than 60 days; a colliding chosen fingerprint is mutated deterministically, and the
  result no longer collides.
- Existing suites stay green (`npx jest storefront-source --runInBand`).

## 4. Out of scope

Kit surface variants (5), motion (6), motifs (3) and free CSS (7).
