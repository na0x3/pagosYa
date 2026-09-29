# Themed product card — program overview (2026-09-29)

Status: direction agreed in brainstorming; no sub-project has a spec yet.

## Why
Every store's product page shares one skeleton, so a chair shop and a jewellery shop end up with cards that feel alike. Owners also need per-colour photo sets ("red chosen → red chair photos") and extra product media (e.g. how far a chair reclines) inside the product page, in the store's own theme.

## What already exists
- `packages/storefront-kit/kit/commerce.js`: options as pills / swatch circles / radio rows; one photo per variant (choosing a colour swaps to that photo when every matching combination agrees); catalog card previews (`swatch-swap`, `second-photo`, `zoom`, `tilt`); four product-page styles (`editorial`, `dense`, `image-led`, `story-led`) plus root tokens.
- The runtime owns the product page (`data-pagosya-product-page`); designs may not style `.product-detail__*` and never author shopper inputs or trust seals.

## Decisions
1. **Direction: curated skins for structure + guarded CSS for personality.** Skins alone make cards alike again; free CSS reopens price/buy/seal risks.
2. **Guarded CSS** means: style only named runtime parts (`gallery`, `thumb`, `swatch`, `title`, `spec-block`, `frame`); property allowlist (colour, background, border, radius, shadow, font, spacing, transform, transition, keyframes, clip-path); no `@import`, external `url()`, `content:`, `position:fixed`, hiding (`display:none`, `visibility`, `opacity:0`, `font-size:0`), or covering the buy area; decoration only in `aria-hidden`, `pointer-events:none` slots with sanitized SVG.
3. **Protected controls** (price, stock state, option pickers, buy button, pagosYa seal) can be restyled but must stay visible, readable and reachable; a real-browser check enforces it and falls back to the plain skin on failure.
4. **Content is data, not CSS.** Merchants upload the real photos and diagrams; YAPI picks the block type and frames it. No generated illustrations for now (a wrong angle would be a false claim). Generated diagrams from merchant-entered numbers can come later.

## Sub-projects (each: spec → plan → build)
1. **Per-colour photo sets.** A variant holds several photos; choosing a colour swaps the whole gallery. Data model + merchant upload UI. Standalone; fixes the red-chair case.
2. **Typed content blocks.** Merchant-uploaded blocks (media, spec table, angle / before-after view) rendered by the runtime inside the product page; dashboard editor for them. Standalone.
3. **Product-page parts and skins.** Expose named parts; build 6–8 curated skins (swatch shape, gallery treatment, spec-block frames, motion).
4. **Guarded CSS.** Allowlist, sanitizer, real-browser visibility/contrast/overlap check, skin fallback, merchant preview and revert. Depends on 3 (built together).
5. **YAPI integration.** YAPI picks a skin, writes guarded CSS, arranges blocks; prompt rules updated; eval that two different stores come out visibly different.
6. **Visual selection editor (Wix-style).** Click an element in the sandboxed preview; hover highlight with a label; a chip ("Header ×") attached to the YAPI chat message so "make this bigger" targets it; section toolbar (reorder, duplicate, hide, ask YAPI). Builds on `source-direct-editor.ts`. Not in scope: free drag/resize (breaks responsive layouts) and editing runtime-owned parts (cart, checkout, product page). Direct edits for text/colour/image/order, YAPI for structural changes.

Build order (plans written 2026-09-29, all in docs/superpowers/plans/):
1. `2026-09-29-photo-sets-and-content-blocks.md` (sub-projects 1 and 2)
2. `2026-09-29-product-card-theme-and-guarded-css.md` (3 and 4; extends the existing Design DNA with a `productCard` group)
3. `2026-09-29-yapi-product-card-theming.md` (5; needs 1 and 2 done)
4. `2026-09-29-visual-selection-editor.md` (6; independent, can run any time)
