# Diversity Memory and a Wider Vocabulary — Implementation Plan (sub-project 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stores stop sharing the same five fonts, the same eyebrow-above-every-heading pattern, the same four composition families and, across stores, the same DNA fingerprint.

**Architecture:** Four independent changes. (1) A font catalogue module (`source-font-catalog.ts`) is the single list of about 30 bundled OFL families; the prompt prose, the bundler and the DNA `FontId` enum are generated from it, and `commerce.js`'s `DNA_VALUES` font lists are widened to match (a test already compares them). (2) The eyebrow becomes optional in the design schema, the prompts stop asking for one and list stock patterns to avoid, and a soft, regex-based counter adds guidance (never a failure) when more than two sections carry an eyebrow-like label. (3) Five composition families aligned with DNA layout grammars (`poster`, `magazine`, `collage`, `brutalist`, `index`) join the registry; every family declares the grammars it serves, and `sourceUiCompositions` accepts the chosen concept's `grammar` to prefer matching families. (4) Cross-store memory: `StoreSourceVersion.designFingerprint` (nullable, indexed) is written on save; before planning the generator reads the last 40 fingerprints of other stores (60 days) into the planner context as `avoidRecent`; after planning a seeded, deterministic mutation moves a colliding chosen fingerprint to the nearest unused values and records it in `autoRepairs`.

**Tech Stack:** NestJS API, Prisma (Postgres), Jest (ts-jest, `rootDir: src`), jsdom kit test via `node:vm`.

**Spec:** `docs/superpowers/specs/2026-09-24-design-vocabulary-memory-design.md` (binding). Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` §3 row 4. DNA: `docs/superpowers/specs/2026-09-24-design-dna-design.md`.

## Global Constraints

- Fonts are downloaded only from `https://raw.githubusercontent.com/google/fonts/main/ofl/<family>/`; each family's `METADATA.pb` must say `license: "OFL"`. `provenance.json` records `file`, `source`, `gitBlob` (`git hash-object`) and `sha256` exactly like the existing entries. Added bytes ≤ ~12 MB.
- The five existing font ids keep their names and files (`bricolage`, `fraunces`, `instrument`, `instrument-serif`, `oswald`), so every saved store keeps working.
- `commerce.js` is co-owned: only the two font lists inside `DNA_VALUES` change here.
- The eyebrow validator never throws and never fails a generation.
- The fingerprint lookup is best-effort: a failed query yields `[]`, never a failed generation. It selects only `designFingerprint`, never `snapshot`.
- The collision mutation is deterministic for a seed, changes exactly two fingerprint fields, and never touches the type pairing (the concept's `typography` prose names its fonts, so changing them would contradict the committed concept).
- The migration is additive only: one nullable column plus one index. No backfill.
- No paid AI calls. Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`.

## Review Focus

1. Every catalogue entry has a TTF and an OFL on disk, every TTF on disk has an entry, and the DNA enum equals the catalogue ids → Task 2 test.
2. `commerce.js` `DNA_VALUES.display/text` must equal the widened enum exactly (existing `source-commerce-dna.spec` allow-list test) → Task 2.
3. `defaultDna(seed)` keeps consuming one random number per field, so only `type.display`/`type.text` of seeded (DNA-less) stores change once → Task 2 ledger ruling.
4. An empty eyebrow must pass both the JSON schema (`minLength: 0`) and `validateSourceDesign`; a missing eyebrow key still fails (strict schema requires the key) → Task 3 test.
5. The eyebrow counter must survive malformed HTML/TSX and CSS without throwing → Task 3 test.
6. Existing composition tests (brief fit, Café photo-free fallback, seeded reproducibility, reference examples list) stay green with nine families → Task 4.
7. `avoidRecent` excludes the store's own revisions and rows older than 60 days, and never selects `snapshot` → Task 5 test on the Prisma query arguments.
8. A colliding fingerprint is mutated deterministically and the result collides with nothing in the taken list; a non-colliding DNA is returned unchanged → Task 6 test.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/storefront-kit/kit/fonts/*` (add) | 25 new `<id>.ttf` + `<id>-OFL.txt`; `provenance.json` entries. |
| `apps/api/src/storefront-source/source-font-catalog.ts` (create) | `SOURCE_FONT_CATALOG`, `SourceFontId`, `SOURCE_FONT_IDS`. |
| `apps/api/src/storefront-source/source-font-catalog.spec.ts` (create) | Catalogue ↔ disk ↔ provenance ↔ DNA enum. |
| `apps/api/src/storefront-source/source-fonts.ts` (modify) | Prose and bundler generated from the catalogue. |
| `apps/api/src/storefront-source/source-dna.ts` (modify) | `SOURCE_DNA_FONTS` from the catalogue; `avoidTakenFingerprint`; avoidRecent sentence in `SOURCE_DNA_DIRECTION`. |
| `packages/storefront-kit/kit/commerce.js` (modify, `DNA_VALUES` font lists only) | Runtime allow-list. |
| `apps/api/src/storefront-source/source-design.ts` (modify) | Optional eyebrow; stock-pattern list; eyebrow counter and note. |
| `apps/api/src/storefront-source/source-composition-registry.ts` (modify) | Five families, `grammars`, grammar preference; recipes without eyebrow props. |
| `apps/api/prisma/schema.prisma` + new migration | `designFingerprint String?` + index. |
| `apps/api/src/storefront-source/source-projects.service.ts` (modify) | Writes the fingerprint; `recentDesignFingerprints(storeId)`. |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify) | avoidRecent context, collision mutation, grammar-aware recipe, eyebrow guidance. |

---

### Task 1: Download and record 25 OFL families

**Files:** `packages/storefront-kit/kit/fonts/` (add files), `provenance.json`.

Families (id ← google/fonts `ofl/<dir>`, upright file): syne, unbounded, space-grotesk, dm-serif-display, playfair-display, epilogue, sora, manrope, newsreader, young-serif, rubik, space-mono, big-shoulders-display, bebas-neue, anton, chivo, lora, libre-caslon-text, outfit, figtree, familjen-grotesk, bitter, nunito, shrikhand, bodoni-moda.

- [ ] **Step 1:** For each family, fetch `METADATA.pb`, assert `license: "OFL"`, download the upright variable TTF (or `-Regular.ttf` for static families) to `<id>.ttf` and `OFL.txt` to `<id>-OFL.txt`; verify each TTF starts with `0x00010000`.
- [ ] **Step 2:** Append `{ file, source, gitBlob, sha256 }` per file to `provenance.json`; total added size ≤ 12 MB.
- [ ] **Step 3:** Commit `chore(kit): bundle 25 more OFL font families with provenance`. (The catalogue test in Task 2 is the test for these files.)

### Task 2: One font catalogue drives prose, bundler, DNA and runtime

**Files:** create `source-font-catalog.ts` + spec; modify `source-fonts.ts`, `source-fonts.spec.ts`, `source-dna.ts`, `commerce.js` (`DNA_VALUES` fonts).

**Interfaces:**
- `SOURCE_FONT_CATALOG: readonly { id; family; file; role: 'display'|'text'|'both'; personality: readonly string[]; weights: string }[]`
- `type SourceFontId`, `SOURCE_FONT_IDS: readonly SourceFontId[]`
- `SOURCE_DNA_FONTS = SOURCE_FONT_IDS`

- [ ] **Step 1: Failing tests.** `source-font-catalog.spec.ts`: every entry's `file` and `<id>-OFL.txt` exist and the TTF has a TrueType header; every `*.ttf` on disk has an entry; every file has a `provenance.json` entry whose sha256 matches the bytes; at least 30 entries covering serif, grotesk, humanist, geometric, condensed, slab, mono, rounded, script-adjacent and wide display personalities; `SOURCE_DNA_ENUMS.type.display` equals the ids; `SOURCE_FONT_CHOICES` names every `assets/<id>.ttf`. `source-fonts.spec.ts`: `withSourceFonts` bundles `assets/syne.ttf` + `assets/syne-OFL.txt` when CSS references it.
- [ ] **Step 2:** Run `npx jest storefront-source/source-font-catalog storefront-source/source-fonts` → FAIL (module missing).
- [ ] **Step 3: Implement.** Catalogue module; `SOURCE_FONT_CHOICES` lists each entry as `assets/<id>.ttf (<family>, <personality>, weight(s) <weights>)` followed by the unchanged guidance; `withSourceFonts` iterates `SOURCE_FONT_CATALOG`; `SOURCE_DNA_FONTS = SOURCE_FONT_IDS`; widen `DNA_VALUES.display/text` in `commerce.js`.
- [ ] **Step 4:** Run the two specs plus `source-commerce-dna.spec`, `source-dna.spec`, `source-design-planner.spec` → PASS.
- [ ] **Step 5:** Commit `feat(yapi): one OFL font catalogue drives prompt, bundler and DNA fonts`.

### Task 3: No stock patterns by default

**Files:** `source-design.ts`, `source-design.spec.ts`, `source-composition-registry.ts`, `source-generation.service.ts` (+ spec).

**Interfaces:**
- `SOURCE_STOCK_PATTERNS` (prompt text), included in `SOURCE_STORY_MOTION_CONTRACT`.
- `sourceEyebrowSections(files): number` — sections (HTML `<section>`/TSX blocks) whose content before the first heading carries an eyebrow-like label: `<Eyebrow`, an `eyebrow=` prop, a class named `*eyebrow*|*kicker*|*overline*`, or a class whose CSS rule is uppercase + positively tracked (+ small when a size is set).
- `sourceEyebrowNote(files): string | null` — a guidance line when the count is > 2.

- [ ] **Step 1: Failing tests.** Schema `story.eyebrow.minLength === 0`; `validateSourceDesign` accepts `eyebrow: ''` and keeps it `''`; the contract no longer contains "opening eyebrow" and lists the five stock patterns; `SOURCE_ACCENT_SLOTS` no longer names eyebrows; the counter returns 3 for three eyebrowed sections (one via `<Eyebrow>`, one via `eyebrow=`, one via an uppercase tracked CSS class), 0 for labels after a heading, and does not throw on malformed input; `sourceEyebrowNote` is null at 2 and a string at 3; recipes contain no `eyebrow=`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement.** Generation: on a redesign, append the note computed from the previous files to the task prompt; on a failed-validation repair, append the note computed from the candidate to the repair guidance.
- [ ] **Step 4:** Run `source-design`, `source-composition-registry`, `source-generation.service` specs → PASS.
- [ ] **Step 5:** Commit `feat(yapi): optional eyebrow, stock patterns to avoid and a soft eyebrow counter`.

### Task 4: Five grammar-aligned composition families

**Files:** `source-composition-registry.ts` + spec; `source-generation.service.ts` + spec.

**Interfaces:** `SourceCompositionFamily.grammars: readonly SourceLayoutGrammar[]`; `SourceCompositionInput.grammar?: string`. A family whose first grammar matches scores +25, a secondary match +12.

- [ ] **Step 1: Failing tests.** At least 9 families; each new family (`poster-loud`, `magazine-spread`, `collage-cutout`, `brutalist-raw`, `index-archive`) has 3–4 directions with every field; each DNA grammar in `SOURCE_DNA_ENUMS.layout.grammar` is served by some family; a neutral brief with `grammar: 'brutalist'` ranks `brutalist-raw` first while the same brief without grammar does not; a brief for records ranks `poster-loud` first; every new direction's typography names catalogue families only. Generation: after planning, `composeUi` is called again with the chosen concept's `dna.layout.grammar`, and the build prompt carries that recipe.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run registry + generation specs → PASS.
- [ ] **Step 5:** Commit `feat(yapi): five grammar-aligned composition families and grammar preference`.

### Task 5: Save a design fingerprint with each revision; read recent ones

**Files:** `apps/api/prisma/schema.prisma`, new migration `store_source_version_design_fingerprint`, `source-projects.service.ts` + spec.

- [ ] **Step 1: Failing tests.** Saving a snapshot with a `design-direction.json` whose chosen concept has a DNA passes `designFingerprint: dnaFingerprint(dna)` to `storeSourceVersion.create`; without a design it passes `null`. `recentDesignFingerprints('s1', now)` queries `{ storeId: { not: 's1' }, designFingerprint: { not: null }, createdAt: { gte: now − 60 days } }`, orders by `createdAt desc`, takes 40, selects only `designFingerprint`, and returns distinct values.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add `designFingerprint String?` and `@@index([createdAt, designFingerprint])`; `npx prisma migrate dev --create-only --name store_source_version_design_fingerprint`; inspect the SQL is additive; `npx prisma generate`; `npx prisma migrate deploy` (local 54329). Implement the service changes.
- [ ] **Step 4:** Run `source-projects.service` spec → PASS.
- [ ] **Step 5:** Commit `feat(yapi): store each revision's design fingerprint and read recent ones`.

### Task 6: avoidRecent in planning; deterministic collision repair

**Files:** `source-dna.ts` + spec, `source-generation.service.ts` + spec.

**Interfaces:** `avoidTakenFingerprint(dna, taken: readonly string[], seed: string): { dna: SourceDesignDna; repair?: string }`.

- [ ] **Step 1: Failing tests.** Non-colliding DNA is returned as the same object with no repair. A colliding DNA changes exactly two of `buttons.form`, `surfaces.cart`, `surfaces.added`, leaves type fonts unchanged, no longer collides, is identical for the same seed and moves each changed field to the nearest (smallest enum-distance) unused value. When the planner's chosen DNA collides with a recent fingerprint, the saved `design-direction.json` and `config.js` carry the mutated DNA and `autoRepairs` names the change; the planner context includes `avoidRecent`; a throwing lookup does not fail the generation.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `source-dna`, `source-generation.service` specs → PASS.
- [ ] **Step 5:** Commit `feat(yapi): avoid recently used DNA fingerprints across stores`.

### Task 7: Verify

- [ ] `cd apps/api && npx jest storefront-source --runInBand` green.
- [ ] `cd apps/api && npx tsc --noEmit -p tsconfig.json` clean.
- [ ] `npx eslint` on every touched TS file: 0 errors.
- [ ] `pnpm --filter @pagosya/checkout run test` green.
- [ ] Record results and rulings in `.superpowers/sdd/2026-09-24-design-vocabulary-memory/progress.md`.
