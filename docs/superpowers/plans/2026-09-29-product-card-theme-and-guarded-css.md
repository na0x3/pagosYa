# Product card theme: DNA dimensions, presets and guarded CSS — Design and Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Program:** sub-projects 3 and 4 of `docs/superpowers/specs/2026-09-29-themed-product-card-program.md`. **Prerequisite:** `docs/superpowers/plans/2026-09-29-photo-sets-and-content-blocks.md` is done and committed (this plan styles the `data-part` hooks and blocks that plan creates). Sub-project 5 (YAPI uses all of this) is `2026-09-29-yapi-product-card-theming.md`.

**Goal:** Every store's product page can carry its own identity: a set of curated **DNA dimensions** (swatch shape, gallery layout, block frame, divider, entrance) plus named **presets**, and an optional layer of **guarded CSS** that can only restyle cosmetic parts. Price, stock, options state, buy button and the pagosYa seal stay protected and are verified in a real browser.

**Architecture:** The kit already has "Design DNA" (`apps/api/src/storefront-source/source-dna.ts`, mirrored by `DNA_VALUES` in `packages/storefront-kit/kit/commerce.js`, written to `<html data-dna-*>` attributes). We extend DNA with a new `productCard` group instead of inventing a second mechanism. Guarded CSS is a DNA string field, sanitized on the server with `postcss` (already an `apps/api` dependency), scoped by construction, re-checked coarsely by the runtime, and verified by a Playwright check (the same infrastructure as `source-scorecard-capture.ts`).

**Tech Stack:** NestJS (jest), postcss 8, Playwright 1.62 (already installed), plain-JS kit runtime tested in jsdom.

## Design

### D1. New DNA group `productCard`
Add to `SOURCE_DNA_ENUMS` in `source-dna.ts` (keep the file's structure; the type `SourceDesignDna` derives from it):

```ts
productCard: {
  swatch:  ['pill', 'circle', 'square', 'label', 'photo'],   // shape of colour/option choices; 'photo' shows the variant's first photo
  gallery: ['rail', 'strip', 'stack', 'mosaic'],             // rail = today's layout
  blocks:  ['plain', 'card', 'outline', 'tape', 'ticket'],   // frame around content blocks
  divider: ['none', 'hairline', 'dashed', 'bold'],           // between sections of the product page
  enter:   ['none', 'fade-up', 'slide', 'pop'],              // entrance of the page's cosmetic parts
},
```

Defaults when the group is absent or a value is unknown = today's behaviour (`pill`, `rail`, `plain`, `none`, `none`), so every existing store renders exactly as before. Runtime attribute names are `data-dna-swatch`, `data-dna-gallery`, `data-dna-blocks`, `data-dna-divider`, `data-dna-enter` (add them to `RUNTIME_NAMES`/`DNA_VALUES` the same way `card`, `review` are handled; `swatch` is new, do not clash with the existing `card` value `swatch-swap`). Also add one string field on the DNA object: `productCss` (default `''`, max 3000 chars, sanitized by D3).

### D2. Presets (the "skins")
`apps/api/src/storefront-source/source-product-card-presets.ts` exports `PRODUCT_CARD_PRESETS: Record<PresetId, { label: string; when: string; params: ProductCardParams; css: string }>` with 8 presets. Each is DNA params plus an optional starter guarded-CSS snippet (must pass the sanitizer):

| id | when it fits | swatch | gallery | blocks | divider | enter |
|---|---|---|---|---|---|---|
| `atelier` | fashion, textiles | `label` | `strip` | `plain` | `hairline` | `fade-up` |
| `workshop` | furniture, tools, hardware | `square` | `stack` | `ticket` | `dashed` | `slide` |
| `gallery` | art, photography, decor | `circle` | `mosaic` | `outline` | `none` | `fade-up` |
| `catalogue` | electronics, many specs | `pill` | `rail` | `card` | `hairline` | `none` |
| `boutique` | jewellery, cosmetics | `circle` | `strip` | `plain` | `none` | `fade-up` |
| `playful` | kids, toys, gifts | `photo` | `mosaic` | `tape` | `dashed` | `pop` |
| `craft` | food, ceramics, handmade | `photo` | `rail` | `tape` | `dashed` | `fade-up` |
| `plain` | everything else (== defaults) | `pill` | `rail` | `plain` | `none` | `none` |

`css` for each preset is 3-8 rules using only allowed parts/properties (for example `workshop`: a 2px solid ink border on `[data-part="gallery"]`, square-cornered thumbs, an angular clip-path on `[data-part="block"][data-part-type="compare"]`). Add a `presetFor(id)` helper returning params + css.

### D3. Parts, and what guarded CSS may touch
Runtime markup gets stable `data-part` attributes (the content-block ones already exist from the previous plan). **Cosmetic parts** (selectable in guarded CSS): `gallery`, `stage`, `thumbs`, `thumb`, `swatch`, `title`, `eyebrow`, `intro`, `highlights`, `blocks`, `block`, `block-media`, `block-compare`, `frame`, `decor-a`, `decor-b`. **Protected parts** (never selectable): price, sale/discount, stock note, sold-out text, the option group fieldsets and their state, quantity control, the buy button (`.product-detail__buy`), the checkout/pay buttons, cart, policy/legal text, the pagosYa seal. `decor-a`/`decor-b` are empty `aria-hidden="true"` decorative slots the runtime renders (positioned by the theme through `::before`/background only).

Sanitizer contract, `apps/api/src/storefront-source/product-theme-css.ts`:

```ts
export type ThemeCssReport = { css: string; dropped: Array<{ rule?: string; declaration?: string; reason: string }> };
export function sanitizeProductThemeCss(input: unknown): ThemeCssReport; // never throws
```

Rules (all enforced with `postcss`; anything else is dropped and reported, never silently kept):
1. Input must be a string ≤ 3000 chars, ≤ 40 rules, ≤ 200 declarations. Otherwise return `css: ''` with a reason (fail closed; do not truncate).
2. Allowed at-rules: `@keyframes <name>` (rewritten to `pt-<name>`; every `animation`/`animation-name` reference is rewritten the same way and may only reference a keyframes block defined in the same input), `@media (min-width: Npx)`, `@media (max-width: Npx)` (N 240-2000) and `@media (prefers-reduced-motion: reduce)` / `(prefers-reduced-motion: no-preference)`. Everything else (`@import`, `@font-face`, `@supports`, `@container`, `@layer`, `@charset`, `@namespace`, `@page`, `@property`) is dropped.
3. Selectors: a comma list; each selector is one or more compounds joined by descendant/child combinators (at most 3 compounds), and **every compound must be** `[data-part="<cosmetic part>"]` optionally with attribute `[data-part-type="media|compare"]` and pseudo-classes from `:hover :focus-visible :active :first-child :last-child :nth-child(<int>)` and at most one pseudo-element `::before` or `::after`. Tag, class, id, universal, `:not`, `:is`, `:has`, `:where`, other attribute selectors, and `+`/`~` combinators are dropped. The output scopes every selector by prefixing `[data-pagosya-product][data-style] `.
4. Declaration allowlist (property → value rule): `color`, `background-color`, `border-color`, `outline-color`, `fill`, `stroke` (colours: hex, `rgb()/hsl()` with literals, `transparent`, `currentColor`, or `var(--pd-*|--store-*|--brand-*|--pt-*)`); `background`/`background-image` (only `linear-gradient`, `radial-gradient`, `conic-gradient`, `none`, no `url(`); `border`, `border-*` (style ∈ solid/dashed/dotted/double/none, width 0-8px), `border-radius` (0-999px or %), `box-shadow`/`text-shadow` (literal lengths ≤ 60px), `outline`/`outline-offset`, `opacity` (**0.6-1 only**), `filter` (`grayscale|saturate|contrast|brightness|sepia|hue-rotate` with bounded arguments; no `blur`, no `url()`), `transform` (translate/scale/rotate/skew with bounded literals: translate ≤ 48px, scale 0.8-1.25, rotate ≤ 12deg), `transform-origin`, `transition`, `transition-*`, `animation`, `animation-*` (duration ≤ 1500ms, iteration count ≤ 3, or `infinite` only when it animates `transform`/`opacity` and the rule is inside `@media (prefers-reduced-motion: no-preference)` — otherwise drop), `clip-path` (only `inset() circle() ellipse() polygon()` with ≤ 12 points), `aspect-ratio`, `object-fit`, `object-position`, `padding*` (0-64px), `margin*` (-16px to 64px), `gap`/`row-gap`/`column-gap` (0-64px), `width`/`height`/`min-*`/`max-*` (px 0-1200, %, vw/vh ≤ 100) **only** on `swatch`, `thumb`, `thumbs`, `frame`, `decor-*`, `block*`, `gallery`, `stage`; `letter-spacing` (-0.05em to 0.3em), `text-transform`, `font-style`, `font-weight` (300-800), `font-family` (only `var(--…)`), `font-size` (12px-72px, rem/em equivalents), `line-height` (1-2), `text-decoration*`, `text-underline-offset`, `display` (only `block|flex|grid|inline-block|inline-flex`), `visibility` (only `visible`), `position` (`relative|static`; `absolute` only when the selector has `::before`/`::after` or targets `decor-*`), `top|right|bottom|left|inset` (only in those absolute cases, px/% ≤ 100), `z-index` (0-2), `overflow` (`visible|hidden|clip`), `mix-blend-mode` (`normal|multiply|screen|overlay`).
5. Never allowed anywhere: `url(`, `image-set`, `expression`, `@import`, `!important`, backslash escapes, `content` other than `""`, `pointer-events`, `cursor`, `user-select`, `-webkit-*`/vendor properties, custom-property definitions (`--x:`), `var()` of names outside the four allowed prefixes, `calc()/clamp()/min()/max()` (keep it literal), `env()`, `attr()`.
6. `dropped` lists each removed thing with a short English reason (`"property 'pointer-events' is not allowed"`); the agent uses it to fix its CSS.

### D4. Runtime behaviour
- Reads the five DNA values into `<html data-dna-…>`; CSS for each value is authored in the kit (`commerce.js` CSS string) scoped `[data-pagosya-product][data-style]`, uses `--pd-*` tokens and the motion personality tokens (`--motion-*`, falling back to literals), and `enter` is wrapped in `@media (prefers-reduced-motion: no-preference)`.
- `gallery`: `rail` = current; `strip` = thumbnails in a row under the stage; `stack` = all photos as a vertical stack of full-width images (no thumbnails, counter hidden); `mosaic` = two-column grid with the first photo spanning both. The photo-set logic from the previous plan (`activeGallery`, `drawGallery`) must keep working in every layout: when `activeGallery` changes, re-render in the current layout.
- `swatch`: `pill` = today; `circle`/`square` = a colour dot/tile from the option's colour (existing `swatchColor()`), with the value as visible text under it; `label` = text-only with an underline for the selected one; `photo` = the variant's first photo as a 44×44 thumbnail (falls back to the colour dot, then to the pill, when the variant has no photo). All swatch shapes keep a ≥ 44px target and the same `aria-pressed` semantics and the same `data-product-option`/`data-option-value` attributes (tests and checkout depend on them).
- `blocks`: frames for `.product-detail__block` (`card` shadow + radius, `outline` border, `tape` washi-tape strip via `::before`, `ticket` notched border via radial-gradient masks; `plain` = no frame).
- `divider`: a rule between `.product-detail__layout` and `.product-detail__blocks` and above the recommendations; `none` = today.
- Guarded CSS: if `config.dna.productCss` is a non-empty string the runtime appends `<style data-pagosya-kit="product-theme">` after the kit styles. Defence in depth: before injecting, the runtime rejects (injects nothing) if the string contains `@import`, `url(`, `expression(`, `</style`, `<`, `\`, `position:fixed`, `pointer-events`, or `!important` (case-insensitive, whitespace-insensitive). The runtime does NOT re-implement the sanitizer.

### D5. The protected-controls check
`apps/api/src/storefront-source/product-theme-check.ts` exports

```ts
export type ThemeCheckFailure = { control: string; viewport: 'mobile' | 'desktop'; reason: string };
export async function checkProductTheme(page: import('playwright').Page): Promise<ThemeCheckFailure[]>;
```

It assumes the caller already loaded a product page containing `[data-pagosya-product][data-style]` with the theme applied. For viewports 390×844 and 1280×800 and for each protected control present (`.product-detail__price`, `.product-detail__options` fieldsets, quantity control, `.product-detail__buy`, sold-out/stock text): (a) `display !== 'none'`, `visibility === 'visible'`, computed `opacity ≥ 0.6` up the ancestor chain, non-empty bounding box; (b) buy button ≥ 44px tall and ≥ 120px wide, other option targets ≥ 36px; (c) `document.elementFromPoint` at the element's centre returns the element or a descendant (not covered by a decor pseudo-element or another block); (d) text contrast ≥ 4.5:1 (price, buy label) using the same luminance helper `source-scorecard-capture.ts` uses (`MIN_BUY_CONTRAST` from `source-scorecard.ts`; reuse, do not copy); (e) `document.documentElement.scrollWidth <= innerWidth + 1` (no horizontal overflow); (f) the buy button is not disabled because of the theme (it may only be disabled when the runtime disables it, i.e. no option chosen yet). Returns `[]` when everything passes.

### D6. Failure policy
If the sanitizer drops everything → no CSS. If `checkProductTheme` returns any failure → the store keeps the DNA parameters (they are safe by construction) and loses `productCss` (set to `''`), and the reasons are reported to the caller (YAPI in sub-project 5). The check never blocks publishing a store; it only removes the CSS.

## Global Constraints
- Old stores render identically: absent/unknown DNA values = today's markup and CSS. Add a regression test that a store with no `productCard` DNA produces the same product-page HTML as before (compare against a saved string in the test, with `data-part` attributes stripped).
- Do not write new CSS for `.product-detail__*` selectors intended for authored source; the kit's own CSS may.
- Reuse existing enum-pinning tests: every place that lists `card` values (`SOURCE_DNA_ENUMS`, `DNA_VALUES` in `commerce.js`, eval fixtures, prompt text) must list the new group; the existing specs that pin those lists (`source-commerce-dna.spec.ts`, `source-commerce-identity-dna.spec.ts`, and anything that fails after Task 1) are updated, not deleted.
- **NEVER** run prisma migrate/db push or touch a database. No new column is needed for this plan (DNA is JSON in the store's source config).
- Run only the spec files named per task, one at a time; never the full storefront-source suite. Browser (Playwright) specs run alone.
- pnpm at this repo root; never pnpm/commit in `/Users/saramia/pagosYaWeb`. Rebuild Studio with `pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded` if you touch it (this plan should not need to).
- Commit after each task; do not push or merge; stage only your own files.

## Review Focus
1. **Old stores unchanged** when `productCard` is missing or has an unknown value (Task 1, 2).
2. **Selector escape attempts**: `body`, `*`, `html`, `[data-part="price"]`, `.product-detail__buy`, `:not(...)`, `:is(...)`, comma lists mixing allowed and forbidden selectors — the forbidden half is dropped, the allowed half survives, output is always scope-prefixed (Task 3).
3. **Value tricks**: `url(`, `URL(`, `u\72l(`, `expression`, `!important`, `calc()`, `--x:` custom properties, `opacity:0.3`, `content:"Verificado"`, `position:fixed`, `pointer-events:none` (Task 3).
4. **Animation traps**: `infinite` animation outside a reduced-motion guard, keyframes referencing forbidden properties, `animation` naming an undefined keyframes block (Task 3).
5. **Covering the buy button** with a `::before` overlay, a negative margin, or a huge transform must be caught by the browser check even though each declaration is individually allowed (Task 5).
6. **Photo sets under every gallery layout** (`stack`, `mosaic`) and **swatch `photo` fallback** when a variant has no photo (Task 2).

---

### Task 1: DNA group, defaults, presets (API)
**Files:** Modify `apps/api/src/storefront-source/source-dna.ts` (enums, type, defaults, validation, `RUNTIME_NAMES`, normalization of `productCss` as a string ≤ 3000); Create `apps/api/src/storefront-source/source-product-card-presets.ts` and `.spec.ts`; update the existing DNA specs that pin enum lists.
**Interfaces:** Produces `ProductCardParams = SourceDesignDna['productCard']`, `PRODUCT_CARD_PRESETS`, `presetFor(id: PresetId): { params: ProductCardParams; css: string }`, `PRESET_IDS`.
- [ ] **Step 1 (failing tests):** in the presets spec: `PRESET_IDS` has the 8 ids; every preset's params validate against `SOURCE_DNA_ENUMS.productCard`; `presetFor('plain').params` equals the documented defaults; a placeholder `it.todo('every preset css sanitizes with no drops')` (activated in Task 3); the DNA validator accepts a DNA object with and without `productCard`, and rejects `productCard.swatch: 'hexagon'` with a message naming the field.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/source-product-card-presets.spec.ts` plus the real DNA spec filename (find with `git ls-files | grep source-dna`) → FAIL.
- [ ] **Step 3:** Implement. Follow how `surfaces.card` flows through validation, normalization and prompt rendering; do the same for every new field.
- [ ] **Step 4:** the same specs plus `source-commerce-dna.spec.ts` and `source-commerce-identity-dna.spec.ts` → PASS; `pnpm --filter @pagosya/api exec tsc --noEmit -p tsconfig.json`.
- [ ] **Step 5:** `git commit -m "feat(dna): productCard dimensions, defaults and eight presets"`

### Task 2: Runtime — parts, DNA styles, swatches, galleries, blocks, dividers, entrance
**Files:** Modify `packages/storefront-kit/kit/commerce.js` (`DNA_VALUES` gets the five new lists; the DNA attribute loop at ~line 56 already iterates `DNA_VALUES`; product markup gains `data-part` attributes; CSS). Test: append to `apps/api/src/storefront-source/source-commerce-surfaces.spec.ts` (it already boots the kit with a DNA object via `boot(dna, { items })`) and to `source-commerce-pages.spec.ts` for photo-set interplay.
**Interfaces:** Consumes `config.dna.productCard.{swatch,gallery,blocks,divider,enter}` (Task 1). Produces `data-part` on: `.product-detail__gallery` (`gallery`), `.product-detail__stage` (`stage`), `.product-detail__thumbnails` (`thumbs`), each thumbnail button (`thumb`), each option choice button (`swatch`), the title element (`title`), `.product-detail__eyebrow` (`eyebrow`), `.product-detail__intro` (`intro`), `.product-detail__highlights` (`highlights`), plus two empty `<span class="product-detail__decor" data-part="decor-a|decor-b" aria-hidden="true">` inside `.product-detail__gallery` and `.product-detail__copy`.
- [ ] **Step 1 (failing tests):** (a) with DNA `productCard: { swatch: 'square', gallery: 'stack', blocks: 'ticket', divider: 'dashed', enter: 'fade-up' }` the `<html>` gets the five `data-dna-*` attributes and the kit style contains a rule for each; (b) unknown values are ignored (attribute absent); (c) with no `productCard` the opened product's `innerHTML` with `data-part` attributes stripped equals the previous snapshot (store the string in the test); (d) `swatch: 'photo'` renders an `<img>` inside each option choice when the variant has a photo, and the colour dot when it has none, and every choice keeps `data-product-option`, `data-option-value`, `aria-pressed`; (e) `gallery: 'stack'` renders all photos as full-width images with no thumbnails and hides the counter, and choosing a colour with a photo set (previous plan) re-renders the stack with that set; `mosaic` likewise; (f) `enter` styles are wrapped in `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 2:** run the new tests by name (`-t "productCard"`) in `source-commerce-surfaces.spec.ts` and `source-commerce-pages.spec.ts` → FAIL.
- [ ] **Step 3:** Implement per D4. Keep `galleryMarkup()`/`drawGallery()` (from the previous plan) the single place that builds gallery markup, branching on `document.documentElement.dataset.dnaGallery`.
- [ ] **Step 4:** run both whole files, plus `source-commerce-design.spec.ts` and `source-commerce-contrast.spec.ts`, each alone → PASS.
- [ ] **Step 5:** `git commit -m "feat(kit): product card DNA — swatch, gallery, block frame, divider and entrance"`

### Task 3: Guarded CSS sanitizer
**Files:** Create `apps/api/src/storefront-source/product-theme-css.ts`, `product-theme-css.spec.ts`. Modify `source-product-card-presets.spec.ts` (turn the `it.todo` into the real assertion that every preset's css sanitizes with `dropped: []`).
**Interfaces:** Produces `sanitizeProductThemeCss` and `ThemeCssReport` (D3). Consumes only `postcss`.
- [ ] **Step 1 (failing, table-driven tests):** write `it.each` tables for: an allowed rule per cosmetic part (kept, scope-prefixed exactly as `[data-pagosya-product][data-style] [data-part="gallery"]{…}`); every forbidden selector in Review Focus #2 (dropped with a reason, an allowed sibling in a comma list survives); every forbidden value in #3 including `URL(`, `u\72l(`, uppercase `EXPRESSION(`, `content:"Verificado"` (dropped) vs `content:""` (kept on `::before`); opacity `0.59` dropped and `0.6` kept; `position:absolute` kept only with a pseudo-element or `decor-*`; `animation: spin 1s infinite` dropped outside `@media (prefers-reduced-motion: no-preference)` and kept inside; keyframes renamed to `pt-…` and references rewritten; `@import`, `@font-face`, `@supports` dropped; > 3000 chars → `css: ''`; > 40 rules → `css: ''` with reason `'too many rules'` (fail closed); non-string input → `css: ''`; a CSS parse error → `css: ''`, reason `'invalid CSS'`; sanitizing the same unprefixed input twice yields identical output.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/product-theme-css.spec.ts` → FAIL.
- [ ] **Step 3:** Implement with `postcss.parse` (in try/catch), walk rules/decls per D3, build the output with `postcss.root()` and `toString()`. Keep the property table as data (an object mapping property → validator function) in the same file, with small named validators (`lengthPx(min,max)`, `colour`, `oneOf(...)`), not a chain of if-statements.
- [ ] **Step 4:** run the sanitizer spec and the presets spec → PASS; `tsc --noEmit`.
- [ ] **Step 5:** `git commit -m "feat(theme): guarded product-theme CSS sanitizer (scoped, allowlisted, fail-closed)"`

### Task 4: Runtime injects the guarded CSS
**Files:** Modify `packages/storefront-kit/kit/commerce.js` (injection near the DNA style setup, ~line 56); test in `source-commerce-surfaces.spec.ts`.
- [ ] **Step 1 (failing tests):** (a) `dna.productCss = '[data-pagosya-product][data-style] [data-part="gallery"]{border:2px solid #111}'` → a `<style data-pagosya-kit="product-theme">` exists with that text, placed after the kit's own product styles; (b) each denied token from D4 (`@import`, `url(`, `expression(`, `</style`, `<`, `\`, `position:fixed`, `pointer-events`, `!important`, in mixed case and with inner whitespace like `URL (`) → no style element injected; (c) empty/absent → none.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-surfaces.spec.ts -t "product-theme"` → FAIL.
- [ ] **Step 3:** Implement the coarse deny-check + injection.
- [ ] **Step 4:** whole `source-commerce-surfaces.spec.ts` → PASS.
- [ ] **Step 5:** `git commit -m "feat(kit): inject sanitized product-theme CSS with a coarse runtime guard"`

### Task 5: Protected-controls browser check
**Files:** Create `apps/api/src/storefront-source/product-theme-check.ts` and `product-theme-check.spec.ts`. Study first: `source-scorecard-capture.ts` (how it starts a local origin, opens `product.html?id=…`, waits for `[data-pagosya-product][data-style] .product-detail__layout`, samples contrast) and its spec, and reuse its server/fixture helpers rather than building new ones.
**Interfaces:** Consumes a Playwright `page` on a themed product page. Produces `checkProductTheme(page)` (D5).
- [ ] **Step 1 (failing test, Playwright, run alone):** boot the same kit-default fixture the scorecard uses, then for each theme CSS below run `sanitizeProductThemeCss` → set `config.dna.productCss` → load the product page → `checkProductTheme`: (1) a benign theme (a `gallery` border, `block` frames) → `[]`; (2) `[data-part="title"]::before{content:"";position:absolute;top:0;left:0;width:1200px;height:900px;background:#000;z-index:2}` → must report the buy button as `covered`; (3) a colour setup that makes the buy label < 4.5:1 → reported as contrast; (4) `[data-part="title"]{font-size:72px;letter-spacing:.3em}` causing horizontal overflow at 390px → reported as overflow; (5) `[data-part="swatch"]{width:8px;height:8px}` → swatch target too small.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/product-theme-check.spec.ts` → FAIL (module missing). If Playwright browsers are not installed on this machine, say so in your report and stop this task after writing the code and the spec; do not download browsers silently.
- [ ] **Step 3:** Implement D5 (`page.evaluate` for style/size/`elementFromPoint`, reuse the contrast helper).
- [ ] **Step 4:** run the spec alone → PASS.
- [ ] **Step 5:** `git commit -m "feat(theme): browser check that protected product controls stay visible, reachable and readable"`

### Task 6: One entry point for callers
**Files:** Create `apps/api/src/storefront-source/product-theme.ts` and `.spec.ts`.
**Interfaces:** Consumes Tasks 1, 3, 5. Produces:

```ts
export type ProductThemeInput = { preset?: PresetId; params?: Partial<ProductCardParams>; css?: string };
export type ProductThemeResult = { dna: { productCard: ProductCardParams; productCss: string }; report: { dropped: ThemeCssReport['dropped']; failures: ThemeCheckFailure[]; presetUsed?: PresetId } };
export async function resolveProductTheme(input: ProductThemeInput, options?: { check?: (css: string) => Promise<ThemeCheckFailure[]> }): Promise<ProductThemeResult>;
```

Behaviour: start from the preset (or `plain`), overlay `params`, join preset css and `css` then sanitize; if `options.check` is provided run it on the sanitized css and, on any failure, return `productCss: ''` with the failures in the report. Pure and injectable so YAPI (next plan) and tests can call it without a browser.
- [ ] **Step 1:** failing unit tests: preset only; preset + override param; css with a forbidden declaration → reported and dropped while the rest survives; a `check` stub returning a failure → `productCss === ''` and `failures` populated; unknown preset id → throws `Error('unknown preset')`.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/product-theme.spec.ts` → FAIL. **Step 3:** implement. **Step 4:** PASS + `tsc --noEmit`.
- [ ] **Step 5:** `git commit -m "feat(theme): resolveProductTheme — preset + params + guarded CSS with optional browser check"`

### Task 7: Final verification and docs
- [ ] Re-run alone and record: every spec named above, `source-commerce-pages.spec.ts`, `source-commerce-design.spec.ts`, `source-commerce-contrast.spec.ts`, and `tsc --noEmit` for `@pagosya/api`.
- [ ] Update `docs/superpowers/specs/2026-09-29-themed-product-card-program.md`: sub-projects 3 and 4 "built" with commit ids, and note the DNA-extension decision.
- [ ] Final message: commits, every test command with result, anything not verified (state plainly if Playwright could not run), and confirm no database was touched.
