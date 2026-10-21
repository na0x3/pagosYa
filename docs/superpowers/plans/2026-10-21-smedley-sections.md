# John Smedley Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esencial stores get, by the dice, up to two of five new home sections (`duo`, `explore`, `capsule`, `origin`, `palette`) and four new looks (`grid: side-title`, `header: boxed`, `button: dashed`, `footer: column`), all from the store's own photos, categories and colours.

**Architecture:**
- A pure API module (`source-master-features.ts`) decides which sections a store can have, rolls up to two, and builds each section's data: photos, links, category and colour lists, words. The data is written to store-data as `export const features`, and `variants.feature` holds the rolled ids.
- The Esencial template draws them from a new `components/features.tsx` (`FeatureSlot({ at })`), placed by four slot lines in `home.tsx`. Older stores whose home still has the anchor lines get the slots, the component and the CSS at their next refill.
- The `explore` rail is a kit catalogue mount with `data-category` / `data-color`. The kit gains a colour filter on such mounts and redraws when those attributes change.
- The four new looks are new variant ids drawn in `Shell.tsx` and CSS.

**Tech Stack:** NestJS API (Jest `-w 2`), Esencial template (React TSX + CSS), kit runtime parts.

**Spec:** `docs/superpowers/specs/2026-10-21-smedley-sections-design.md`

## Global Constraints

- `feature` picks 0, 1 or 2 ids, seeded by the store, only from ids whose needs the store meets:
  - `duo`: 2 distinct lifestyle photos, hero excluded
  - `explore`: 2+ categories with products and 1 photo
  - `capsule`: 1 lifestyle photo and 2+ products
  - `origin`: 1 photo
  - `palette`: fashion stores only, with 6+ distinct colour values that map to a hex
- Fashion stores are weighted toward `duo` / `explore` / `palette` (tried first, in random order). Other stores never roll `palette`.
- The fill's exclusions (`feature:origin`) are honoured for at most half of the eligible ids.
- Placement:
  - `duo` goes after the catalogue.
  - `explore` / `capsule` go after the story.
  - `origin` goes before the values.
  - `palette` goes before the closing.
  - Two rolled sections never sit next to each other, so the pairs explore+capsule, explore+origin and capsule+origin are never rolled together.
- Photos come only from the store's uploads, each used once where possible. No section shows 3+ photos (owner rule 2026-10-15); `palette` tiles are solid colours.
- Links go to `productos.html?f_categoria=<folded id>` (the kit's real filter parameter), else `productos.html`. A palette tile goes to `productos.html?f_<colour group>=<folded value>`.
- Words: `duo` gets a title (≤28) and button (≤18) per half; `capsule` a paragraph (≤220); `origin` a caption (≤60) and link (≤24); `palette` an intro (≤220).
  - They are Spanish, in the store's voice, with no invented facts.
  - Missing words fall back to category names, «Ver ahora» / «Ver colección», «Hecho en <city>» or the story title, and «Elige por color».
  - A section never renders empty text.
- Never run `prisma migrate/diff/reset`. Always `npx jest -w 2 <files>`. Rebuild the Studio after kit edits.

## Rulings in this plan

- The spec's link form `?categoria=<id>` is written as `?f_categoria=<folded id>`, the parameter the kit's filters actually read.
- The `palette` colour hexes come from the kit's own swatch table (`product/setup.js` `swatchColors`), copied into the API with a test that keeps the two in step. Products carry colour names, not hex values.
- The pair rule above replaces the spec's «two rolled sections never sit next to each other» with fixed slots, so the rule holds even with no business sections between them.

## Review Focus

1. **A store with exactly one lifestyle photo:** `duo` never rolls, and `capsule` / `origin` / `explore` share that photo without breaking (Task 1).
2. **A category deleted after the build:** its `explore` chip shows an empty rail. The kit's chosen-set mount hides itself when empty, and the chip row still works (Task 3).
3. **An older Esencial home edited by YAPI** (NOA VARGAS): the slots are added only when all four anchors exist; otherwise the home is left alone and the build still compiles (`features` always exported) (Task 4).
4. **No words from the fill:** every section shows its fallback text, never an empty heading or button (Task 4).
5. **Colour chips on `explore`** when products have no colours: no colour row is drawn (Task 3/4).

---

### Task 1: Section eligibility, roll and data (API, pure)

**Files:** Create `apps/api/src/storefront-source/source-master-features.ts` and `source-master-features.spec.ts`.

**Produces:**
- `FEATURE_IDS = ['duo','explore','capsule','origin','palette']`
- `type FeatureCopy = { duoTitles: string[]; duoCtas: string[]; capsuleText: string; originCaption: string; originLink: string; paletteIntro: string }`
- `featureFacts(data, photos: Record<string,string>, city: string): FeatureFacts`, where `FeatureFacts = { lifestyle: string[]; categories: Array<{id,name}>; productIds: string[]; colours: Array<{group:string; value:string; name:string; hex:string}>; city: string }`
- `eligibleFeatures(facts, fashion: boolean): string[]`
- `rollFeatures({ seed, eligible, fashion, exclude }): string[]` (0–2, pairs rule)
- `buildFeatures(ids, facts, copy: Partial<FeatureCopy>, fallback: { productsTitle; storyTitle; subcopy }): Record<string, unknown>`
- `FEATURE_SWATCHES` (the kit's table)

- [ ] **Step 1:** Write the failing tests:
  - eligibility for each need, including a single lifestyle photo (Review Focus 1)
  - `palette` only when fashion and 6+ colours
  - the roll is 0–2 ids, deterministic per seed, never a forbidden pair, honours `feature:x` exclusions for at most half, and puts fashion's `duo`/`explore`/`palette` first
  - `buildFeatures`: the duo halves link to two different categories with the fill's words or their fallbacks; explore lists the categories and colours; capsule has 2–3 product ids; origin's caption falls back to «Hecho en <city>», else the story title; palette tiles carry hex and filter links
  - the swatch table equals the kit's (parse `swatchColors` out of `commerce-src/product/setup.js`)
- [ ] **Step 2:** Run and see them fail. **Step 3:** Implement. **Step 4:** Pass. **Step 5:** Commit `feat(api): John Smedley sections — eligibility, roll and data`.

### Task 2: Dice, template ids, store-data, fill words (API)

**Files:**
- `templates/esencial/template.json`: `variants.feature` and the new ids `grid: side-title`, `header: boxed`, `button: dashed`, `footer: column`
- `source-master-dice.ts`: `feature` rolled through `rollFeatures`, not the main map
- `source-master.ts`: `MasterFill.featureCopy`, `MasterRead.featureCopy`, `masterFillFromRead`
- `source-templates.ts`:
  - `templateStoreDataFile` always writes `export const features`
  - `readMasterState.features`
  - assemble builds the features
  - refill keeps them, or rebuilds them when `change.variants.feature` is given (a string id or a list) or when an older store has no `feature` record (rolled from `config.slug`)
- `source-conversation.service.ts`: schema `featureCopy` (strict, all fields, capped) plus a prompt line
- `source-templates.service.ts`: `applyMaster` passes the facts to the dice
- `masterDnaLook`: `dashed` → kit `block`

**Tests:** dice (needs and pairs through `rollVariants` with a facts input; adding the part leaves the other rolls unchanged), refill (keeps; a forced `feature: 'duo'` builds `features.duo`), esencial assemble (`features` written; a store without features still exports `{}`), fill schema.

Steps: failing tests → run → implement → pass → commit `feat(api,esencial): sections rolled by the dice, written to store-data, words from the fill call`.

### Task 3: Kit — colour filter and redraw on chip change

**Files:** `catalog/render.js` (chosen-set mounts honour `data-color`: products with that colour value in a colour group), a new part `catalog/mount-watch.js` (a MutationObserver on `data-category` / `data-color` of `[data-pagosya-catalog]` that redraws once per microtask) added to PARTS after `catalog/render.js`. Test: `apps/api/src/storefront-source/source-commerce-explore.spec.ts`.

- [ ] Failing jsdom tests:
  - a `data-category` mount shows that category
  - changing the attribute redraws with the new category
  - `data-color="rojo"` narrows to products with Rojo
  - an empty set hides the mount (Review Focus 2)
- [ ] Implement, build the kit, pass, commit `feat(kit): catalogue mounts filter by colour and redraw when their category or colour changes`.

### Task 4: Esencial — sections, looks, and the upgrade for older stores

**Files:**
- Create `templates/esencial/components/features.tsx` (`FeatureSlot`)
- Modify `home.tsx`: the import plus four slot lines before `<section id="historia"`, `{sections.map(`, `<section id="valores"` and `<section id="cierre"`
- Modify `Shell.tsx`: boxed header, column footer with the hero photo band
- Modify `globals.css`: sections, side-title grid, boxed header, dashed button, column footer and the section-title rule, in one marked block
- Modify `source-templates.ts`: `withFeatureSlots(files)`, which adds `features.tsx`, the slot lines (only when all four anchors exist and no slot is there yet) and the CSS block, and is called by the refill

**Tests:** in `source-master-esencial.spec.ts`, render the home in the visual sandbox with each feature forced and full data:
- the sections' landmarks are present with real text
- with no words, the fallbacks show and no heading or button is empty (Review Focus 4)
- no colour row when there are no colours (Review Focus 5)
- the explore chip switches the rail
- no horizontal overflow at 390 px

Refill on an older home adds the slots once. An edited home without the anchors stays untouched and the store still compiles (Review Focus 3).

Steps: failing tests → run → implement → pass (plus the contract suite in the background; its 1 pre-existing failure doesn't count) → commit `feat(esencial,api): John Smedley sections and looks on Esencial stores`.

### Task 5: Live check

- [ ] Check for no RUNNING YAPI jobs and rebuild the Studio.
- [ ] Refill NOA VARGAS with `feature: ['duo','explore']`, plus `header: boxed`, `button: dashed` and `footer: column` (extend `scripts/fashion-look-apply.ts` with an optional `--variants` JSON argument).
- [ ] In «Ver en navegador», check the home at 1440 and phone width: the duo halves and their links, the explore chips switching the rail, the boxed header over the hero, the dashed buttons, and the column footer.
- [ ] Render one non-fashion store in the sandbox with `capsule` + `origin` and `grid: side-title`, and screenshot it.
- [ ] Fixes get a test, a rebuild and a recheck.
