# Design DNA — sub-project 2 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§4 DNA contract).
Status: written under the owner's instruction "build everything from 2-8"; open for review at any time.

## 1. What exists (from the code, 2026-09-24)

- The design step (`apps/api/src/storefront-source/source-design-planner.ts`) returns exactly 3
  concepts. Each has prose fields (name, premise, opening, flow, typography, imagery, mobile) and
  structured `layout`, `story` and `motion`. It asks for 4,200 output tokens (minimum 1,000) at low
  reasoning. The chosen concept is saved as `design-direction.json` inside the revision snapshot
  (`source-generation.service.ts:699`) and read back with `savedSourceDesign`.
- The only design value that reaches the commerce runtime through `config.js` is `productPageStyle`
  (`source-generation.service.ts:690`). Everything else reaches the kit as CSS custom properties
  (`--store-*`, then `--brand-*`, then legacy variables).
- The kit's cart, added-to-cart popup, checkout review, contact button and privacy dialog have no
  variants. They read colours, font and radius tokens only, and some values are hard-coded
  (the 72px photo with a 10px radius, 50% quantity buttons, the contact launcher at 14px).
- There is no cross-store memory in the YAPI source path.

## 2. Decisions

1. **DNA is a structured field of each design concept**, `concept.dna`, chosen by the planner with
   the concept. It is saved inside `design-direction.json`, so it versions with the revision for free.
   It holds enums plus up to 3 short motifs. Prose stays in the existing fields.
2. **Colours are not duplicated in the DNA.** The store's colour tokens (`--store-*` from its CSS,
   confirmed `--brand-*`) remain the colour source. The DNA carries form, behaviour and placement,
   not hex values.
3. **The runtime receives the DNA through `config.js`** as `window.PAGOSYA_CONFIG.dna` (enums only,
   no motifs prose). At start-up `commerce.js` writes each enum to the root element as a
   `data-dna-*` attribute, e.g. `<html data-dna-button="stamp" data-dna-cart="sheet" …>`. Sub-projects
   5 and 6 key their variant CSS and motion on those attributes. This sub-project only sets them and
   proves they arrive.
4. **Every store gets a DNA, including existing ones.** If a revision has no `dna` (old designs,
   static stores, edits), `defaultDna(seed)` derives one deterministically from the store id. It is
   seeded, so it stays stable across reloads, and it differs between stores. Existing stores
   therefore start differing as soon as sub-project 5 ships, with no regeneration and no cost.
5. **Validation rejects anything outside the enums** and repairs rather than failing: an unknown
   value is replaced with the seeded default for that field and recorded in `autoRepairs`. A bad
   DNA never costs a paid repair.
6. **Planner budget:** the DNA adds about 150 output tokens per concept. The planner's requested
   output goes from 4,200 to 4,800 tokens.
7. **Cross-store avoidance is sub-project 4's.** This sub-project exposes
   `dnaFingerprint(dna): string` (button form, cart surface, added style, type pairing), which
   sub-project 4 compares across stores.

## 3. The DNA shape (v1)

```ts
type SourceDesignDna = {
  version: 1;
  type: { display: FontId; text: FontId; case: 'none' | 'upper' | 'small-caps'; tracking: 'tight' | 'normal' | 'wide' };
  shape: { radius: 'none' | 'soft' | 'round' | 'pill'; border: 'none' | 'hairline' | 'bold'; frame: 'bleed' | 'inset' | 'rounded' | 'arch' | 'polaroid' };
  buttons: { form: 'pill' | 'block' | 'underline' | 'tag' | 'stamp' | 'outline' | 'ghost' | 'split'; hover: 'lift' | 'fill' | 'underline-grow' | 'tilt' | 'shine' | 'invert'; press: 'squash' | 'sink' | 'pop' | 'none' };
  motion: { personality: 'calm' | 'snappy' | 'playful' | 'cinematic' };
  layout: { grammar: 'editorial' | 'grid' | 'collage' | 'index' | 'poster' | 'magazine' | 'brutalist'; density: 'airy' | 'balanced' | 'dense' };
  surfaces: {
    cart: 'drawer' | 'sheet' | 'page' | 'overlay';
    added: 'toast' | 'ribbon' | 'bubble' | 'inline' | 'stamp';
    product: 'editorial' | 'dense' | 'image-led' | 'story-led';
    review: 'split' | 'stacked' | 'ticket' | 'notebook';
    card: 'still' | 'second-photo' | 'swatch-swap' | 'zoom' | 'quick-look' | 'tilt';
  };
  motifs: Array<{ for: 'store' | 'category' | 'product'; target: string; meaning: string; behavior: 'glow' | 'draw' | 'sway' | 'steam' | 'grow' | 'bounce' | 'spin' | 'float'; trigger: 'appear' | 'scroll' | 'hover' | 'add-to-cart' | 'purchase'; placement: 'hero' | 'card' | 'product' | 'cart' | 'confirmation' }>; // ≤ 3
  signature: string; // ≤ 160 chars
};
type FontId = 'bricolage' | 'fraunces' | 'instrument' | 'instrument-serif' | 'oswald'; // widened in sub-project 4
```

`surfaces.product` reuses the existing `SOURCE_PRODUCT_PAGE_STYLES`. When a concept has both
`layout.productPage` and `dna.surfaces.product`, the DNA wins and `layout.productPage` is kept equal
to it, so `productPageStyle` in `config.js` stays the single source the kit already reads.

## 4. Units

| Unit | File | Responsibility |
|---|---|---|
| DNA model | `apps/api/src/storefront-source/source-dna.ts` (new) | Enums, `SourceDesignDna` type, JSON schema fragment, `normalizeDna(raw, seed) → { dna, repairs }`, `defaultDna(seed)`, `dnaFingerprint(dna)`, `dnaRuntimeConfig(dna)` (enums only). |
| Planner | `source-design-planner.ts`, `source-design.ts` | Adds `dna` to the concept schema and the planner prompt (a short DNA brief), raises output to 4,800, validates each concept's DNA through `normalizeDna`. |
| Generation | `source-generation.service.ts` | Writes `dna: dnaRuntimeConfig(...)` into `config.js` for every generation (default DNA when the design has none), and aligns `productPageStyle` with `dna.surfaces.product`. |
| Runtime | `packages/storefront-kit/kit/commerce.js` | At start-up, applies `config.dna` enums as `data-dna-*` attributes on `<html>`, ignoring unknown values. |
| Published stores without DNA | `source-publishing.service.ts` (`publicSite`) and the hosted `config.js` rewrite in `apps/checkout/src/source-storefront.ts` | When `config.js` lacks `dna`, the published site gets `defaultDna(store.id)`, so existing stores carry attributes without regeneration. |

## 5. Tests

- `source-dna.spec.ts`: `normalizeDna` accepts a full valid DNA unchanged; replaces each invalid
  enum with the seeded default and reports it; caps motifs at 3 and signature at 160; `defaultDna` is
  stable for a seed and differs across 50 seeds in at least 40 fingerprints; `dnaRuntimeConfig`
  contains no prose.
- Planner spec: the schema includes `dna`; an invalid DNA from the model is repaired, not retried.
- Generation spec: `config.js` contains `dna` for a static and a component-mode generation, and for
  an edit of a store whose design has no DNA.
- Kit test (jsdom, a new `packages/storefront-kit` test file if the package has vitest, otherwise an
  API spec that evaluates `commerce.js`): `data-dna-*` attributes are set from config, and unknown
  values are ignored.
- Publishing spec: a published revision without `dna` gets a seeded one in the served `config.js`.

## 6. Out of scope here

Visual variants (sub-project 5), motion presets (6), motif drawing (3), the font catalogue (4),
free CSS (7) and scoring (8).
