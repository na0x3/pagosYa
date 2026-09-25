# Illustrated Motion — Implementation Plan (sub-project 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store whose DNA carries motifs (a lamp that switches on, a cup that steams) gets small hand-drawn SVGs that the platform places and animates next to the product title, on matching cards, in the cart header and on the order confirmation. A store without motifs renders exactly as today.

**Architecture:** Motifs are data, drawn once by YAPI and rendered by the platform. (1) A pure allow-list sanitiser (`source-svg-sanitize.ts`, parse5) turns any model SVG into a safe, size-capped drawing or drops it. (2) A motif model (`source-motifs.ts`) names each DNA motif's file (`motifs/<slug>.svg`), writes the prompt section, extracts and sanitises the model's motif files, and builds `config.motifs` (enums, target and the sanitised markup; no prose). (3) The generation pipeline, the save path (`prepare`) and publishing carry the files; the art gate allows only declared `motifs/*.svg`. (4) `commerce.js` inlines each motif into its slot and animates labelled parts with kit-owned keyframes on the `--motion-*` tokens, gated by reduced motion and `motion:'off'`. (5) The public store data carries the confirmation motif to the checkout's success panel.

**Tech Stack:** NestJS API (TypeScript, Jest/ts-jest, jsdom from apps/checkout, Playwright Chromium), plain browser JS kit (`packages/storefront-kit/kit/commerce.js`, ES2021 floor), checkout app (Vite, Vitest/jsdom).

**Spec:** `docs/superpowers/specs/2026-09-24-illustrated-motion-design.md` (binding); parent §5 gate 5 ("Illustrations are safe: SVG sanitized (no scripts, no external references), size-capped").

## Global Constraints

- Delivery: `config.js` carries the sanitised markup (`motifs[].svg`). The storefront sandbox CSP has `connect-src 'none'`, so commerce.js cannot fetch `motifs/*.svg`; inlining ≤ 3 × 6 KB into config.js is synchronous and works in the Studio preview, the hosted store and the export alike. The `motifs/*.svg` files stay in the snapshot (utf8 text, like CSS) for the hero `<img>` and for later edits, and the public site includes them (they are inlined as `data:` URLs by the preview document, which already maps `.svg`). `PUBLIC_ASSET` (binary route) is unchanged.
- Sanitising happens at every entry: generation (model output), `prepare` (every save, the merchant's own `editFile` of `config.js` or a motif file included), and `publishedStoreDna` (what the checkout receives). commerce.js and the checkout additionally verify the markup against the same allow-list before inserting it (DOMParser, never `innerHTML` of unverified text) and skip a motif that fails.
- Budget: ≤ 3 motifs (the DNA's own cap), ≤ 6 KB each after sanitising; CSS animation only, finite (ends at rest ≤ 5 s), no JS per frame.
- Motifs are decorative: `aria-hidden="true"`, `pointer-events:none`, ≤ 64px in kit slots (a layered `!important` max size), never inside or over a product photo, price, buy button or total. commerce.js removes a placed motif whose box intersects one of those.
- A store without motifs: no motif style element, no attribute, no DOM change (asserted).
- commerce.js stays within the browser floor (no ES2022+ built-ins; `source-kit-browser-floor.spec.ts`).
- Do not touch `apps/api/src/business-documents/**` (another agent). Jest paths are relative to `apps/api/src`.

## Review Focus

1. A hostile SVG (`<script>`, `<foreignObject>`, `on*`, `href="javascript:"`, external `<image href>`, `<use href>`, `<style>`, `style=""`, `url(http…)` in `fill`, entity/CDATA tricks, `</script>` in a title) comes out clean or dropped → Task 1 table.
2. A motif file the DNA did not declare, or an inline `<svg>` added to a page, is still rejected/dropped; only declared `motifs/<slug>.svg` passes the art gate → Task 3 tests.
3. The merchant's own save of a hand-edited `config.js` with a hostile `motifs[].svg` is re-sanitised → Task 3 prepare test.
4. Reduced motion and `motion:'off'` never start an animation; the slot never exceeds 64px; a store without motifs is byte-identical → Task 4 jsdom + Chromium tests.
5. A motif never overlaps price/buy/total, including on a custom template card → Task 4 Chromium test.
6. The checkout success panel renders the confirmation motif only from verified markup and only when present → Task 5 tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-svg-sanitize.ts` (create) | `sanitizeMotifSvg(raw) → { svg?: string; removed: string[]; dropped?: string }`; allow-lists exported for the kit parity test. |
| `apps/api/src/storefront-source/source-svg-sanitize.spec.ts` (create) | Hostile-input table, lamp passes unchanged, size/drawable drops. |
| `apps/api/src/storefront-source/source-motifs.ts` (create) | `motifSlug`, `sourceMotifPaths(motifs)`, `sourceMotifPrompt(motifs)`, `extractSourceMotifs(files, motifs)`, `sourceMotifConfig(motifs, files)`, `withSanitizedMotifs(files)`, `isSourceMotifFile(path)`. |
| `apps/api/src/storefront-source/source-motifs.spec.ts` (create) | Slugs, extraction, config (no prose, unknown enums dropped, trigger normalisation), prepare re-sanitising. |
| `source-generation.service.ts`, `source-edit-scope.ts`, `source-next.ts`, `source-projects.service.ts`, `source-publishing.service.ts` (modify) | Wiring (Task 3). |
| `packages/storefront-kit/kit/commerce.js` (modify) | Motif slots, triggers, keyframes, guards (Task 4). |
| `apps/api/src/storefront-source/source-commerce-motifs.spec.ts` (create) | jsdom + Chromium runtime tests. |
| `apps/api/src/stores/store-dna.ts`, `public-stores.service.ts` (modify) | `publishedStoreLook` → `{ dna, confirmationMotif }`. |
| `apps/checkout/src/checkout-motif.ts` (create), `checkout/payment-result.ts`, `main.ts`, `api.ts`, `checkout-branding.css` (modify) | Confirmation motif. |

---

### Task 1: The SVG sanitiser

**Files:** create `source-svg-sanitize.ts` and its spec.

**Interfaces:**
- Produces: `sanitizeMotifSvg(raw: string): { svg?: string; removed: string[]; dropped?: string }`, `MOTIF_SVG_ELEMENTS`, `MOTIF_SVG_ATTRIBUTES`, `MOTIF_SVG_MAX_BYTES = 6144`.

- [ ] **Step 1: failing tests.** A table of hostile inputs, each asserting the output contains none of `script|foreignObject|on\w+=|href|style|javascript:|http` and records a removal (or is dropped): `<script>`, `<foreignObject><div>`, `onload=`, `<a href="javascript:…">`, `<image href="https://…">`, `<use href="#x">`, `<style>`, `style="…"`, `fill="url(https://x/y.svg#a)"`, `<![CDATA[…]]>` and comments, a `<title>` holding `</script><script>`, `<svg><set attributeName="onload">`, `xlink:href`, a 10 KB path (dropped: over 6 KB), an SVG with only `<defs>` (dropped: nothing to draw), a non-SVG root (dropped), a missing viewBox with numeric width/height (derived) and without (dropped). A legitimate lamp SVG with `data-part="light"` passes byte-for-byte unchanged, and `fill="url(#glow)"` local references survive.
- [ ] **Step 2: RED** — `npx jest storefront-source/source-svg-sanitize` fails: module missing.
- [ ] **Step 3: implement** — parse5 `parseFragment`, take the first `svg` element, walk: allowed elements are kept with allowed attributes (value checks: no `<>"\``, no `javascript:|vbscript:|data:`, `url()` only `url(#id)`, `data-part` only `[a-z][a-z-]{0,23}`), anything else is removed with its subtree and reported; text is kept only as escaped text; serialise with `xmlns` on the root. Then the viewBox, drawable-content and 6 KB checks.
- [ ] **Step 4: GREEN**, commit `feat(motifs): allow-list SVG sanitiser`.

### Task 2: The motif model

**Files:** create `source-motifs.ts` and its spec.

**Interfaces:**
- `motifSlug(target, index, taken)`: accent-free lowercase kebab, ≤ 24 chars, `motif-N` fallback, deduplicated.
- `sourceMotifPaths(motifs: SourceDnaMotif[]): string[]` — `motifs/<slug>.svg` in DNA order.
- `sourceMotifPrompt(motifs): string` — empty for none; else the file list with each motif's meaning/behaviour and drawing rules (viewBox, line art, `currentColor`, ≤ 2 KB target / 6 KB cap, `data-part="light"`/`"steam"`, no script/style/text/href), and the hero rule (`<img src="motifs/<slug>.svg" alt="" aria-hidden="true">`, no inline copy).
- `extractSourceMotifs(files, motifs) → { files; motifs: File[]; repairs }` — removes every `motifs/*` path from the authored files; keeps only declared paths, sanitised; notes each removal/drop.
- `sourceMotifConfig(motifs, files) → Array<{ file, for, target, behavior, trigger, placement, svg }>` — non-hero motifs whose file exists; unknown behaviour/trigger/placement dropped; `trigger: 'purchase'` off the confirmation becomes `appear`, the confirmation always plays on `purchase`.
- `withSanitizedMotifs(files) → { files; repairs }` — re-sanitises `motifs/*.svg` files and `config.js` `motifs[].svg`, dropping entries that fail; untouched bytes when there is nothing to change.

- [ ] Steps: failing spec (RED: module missing) → implement → GREEN → commit `feat(motifs): motif files, prompt and runtime config`.

### Task 3: Pipeline wiring

**Files:** `source-generation.service.ts`, `source-edit-scope.ts` (`validateSourceArtwork(previous, next, instruction, motifPaths?)`), `source-next.ts` (`validateNextSources` accepts `motifs/*.svg`), `validateGeneratedSource` (accepts declared motif paths), `source-projects.service.ts` (`prepare` runs `withSanitizedMotifs`), `source-publishing.service.ts` (public files include `motifs/*.svg`).

- [ ] **Tests first:** art gate — a page `<img src="motifs/lamp.svg">` passes when `motifs/lamp.svg` is declared, fails when it is not; an added inline `<svg>` still fails. Generation — a static and a component generation whose committed concept has a lamp motif and whose model output includes `motifs/lamp.svg` (with a `<script>`) saves the sanitised file, writes `config.motifs` with the markup and no `meaning`, records the removal in `autoRepairs`, and includes the prompt section; an undeclared `motifs/extra.svg` is dropped; an edit carries the previous motif files forward. Prepare — a hostile `config.js` `motifs[].svg` is cleaned. Publishing — the public site JSON contains `motifs/lamp.svg`. RED for each for the right reason.
- [ ] Implement; GREEN (`npx jest storefront-source --runInBand`); commit `feat(motifs): generation, save and publishing carry sanitised motifs`.

### Task 4: The kit renders and animates motifs

**Files:** `commerce.js`; create `source-commerce-motifs.spec.ts`.

- [ ] **Tests first (jsdom):** no motifs → no `style[data-pagosya-kit=motifs]`, no `.pagosya-motif`; a `product` motif targeting "lámpara" appears before `#pagosya-product-title` on the Lámpara page only, `aria-hidden`, and not on another product; a `card` motif marks only matching cards; a `cart` motif sits in `.cart-drawer__header`; `add-to-cart` sets `data-motif-play` after an add of that product; reduced motion and `motion:'off'` never set it; unverified markup (a `<script>` inside) is skipped; the allow-lists equal the API's. **Chromium:** the product slot measures ≤ 64px; hovering plays the glow (a running animation on `[data-part=light]`); with `reducedMotion: 'reduce'` no animation runs; a card motif that would cover the price is removed.
- [ ] Implement: `MOTIF_ELEMENTS/ATTRIBUTES` verifier (DOMParser `image/svg+xml`, `importNode`), `motifMatches(motif, product)`, slots (`product` before the title, `card` top corner, `cart` after the header title), triggers (appear once via IntersectionObserver, scroll on each entry, hover/focus on the card or product layout with an appear fallback on touch, add-to-cart from the add handler), keyframes glow/draw/sway/steam/grow/bounce/spin/float keyed on `data-motif-behavior` + `data-part`, durations from `motionValue` (clamped), a layered `!important` 64px cap and reduced-motion `animation:none!important`, the overlap guard.
- [ ] GREEN with the commerce/kit suites and the browser-floor guard; commit `feat(kit): motifs in product, card and cart slots with kit-owned motion`.

### Task 5: The confirmation motif

**Files:** `store-dna.ts` (+spec), `public-stores.service.ts`, checkout `api.ts`, `main.ts`, `checkout-motif.ts` (+test), `payment-result.ts`, `checkout-branding.css`.

- [ ] **Tests first:** `publishedStoreLook` returns the sanitised confirmation motif from the published config (none without one, hostile markup cleaned, cached with the DNA); the checkout success panel shows `.payment-success-motif` with the SVG when remembered, nothing otherwise, and nothing for unverified markup; reduced motion gets no play attribute.
- [ ] Implement, GREEN (`npx jest stores`, checkout `vitest run`), commit `feat(checkout): the order confirmation shows the store's confirmation motif`.

### Task 6: Real-browser probe and verification

- [ ] `/tmp/motif-probe`: a fixture store with a lamp motif (glow on `[data-part=light]`, trigger hover, placement product); screenshot the product page hovered, with and without reduced motion; record in the ledger.
- [ ] Full verification (jest storefront-source, stores; checkout vitest; storefront-preview; storefront-kit check; Studio Playwright cross-sell-kit + checkout-layout; tsc; eslint on touched TS).
