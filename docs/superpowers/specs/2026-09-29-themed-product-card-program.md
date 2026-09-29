# Themed product card — program overview (2026-09-29)

Status: sub-projects 1 and 2 built (photo sets: `64508ec`, `6e1d6d4`, `a120d7a`, `0e3d27d`; content blocks: `1366faa`, `e11b17f`, `7adfeea`; photo-set integration fixes: `a85953c`). Content-block migration is written and awaits the owner. Sub-projects 3–6 remain planned.

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
1. **Per-colour photo sets — built.** A variant holds up to eight photos; choosing a colour swaps the gallery. Studio checkbox picker reuses product uploads; legacy single photos keep their navigation behavior.
2. **Typed content blocks — built.** Up to six media or before/after blocks rendered inside the runtime product page, with a Studio editor. Existing specifications supply spec tables. The owner applies the hand-written migration before database use.
3. **Product-page parts and skins.** Expose named parts; build 6–8 curated skins (swatch shape, gallery treatment, spec-block frames, motion).
4. **Guarded CSS.** Allowlist, sanitizer, real-browser visibility/contrast/overlap check, skin fallback, merchant preview and revert. Depends on 3 (built together).
5. **YAPI integration.** YAPI picks a skin, writes guarded CSS, arranges blocks; prompt rules updated; eval that two different stores come out visibly different.
6. **Visual selection editor (Wix-style).** Click an element in the sandboxed preview; hover highlight with a label; a chip ("Header ×") attached to the YAPI chat message so "make this bigger" targets it; section toolbar (reorder, duplicate, hide, ask YAPI). Builds on `source-direct-editor.ts`. Not in scope: free drag/resize (breaks responsive layouts) and editing runtime-owned parts (cart, checkout, product page). Direct edits for text/colour/image/order, YAPI for structural changes.

Status 2026-09-29: sub-projects 1 and 2 built by Codex (64508ec..5cd4fe7). Sub-projects 3 and 4 built (00bb42c, 847b565, 3dfc653, 063c050, 13ce264, 64529e1): the theme extends the existing Design DNA with a `productCard` group (swatch, gallery, blocks, divider, enter; fixed defaults so old stores never restyle), eight presets, a scoped and allowlisted CSS sanitizer (`product-theme-css.ts`), a runtime that injects the sanitized CSS behind a coarse guard, a real-browser check of the protected controls (`product-theme-check.ts`) and one entry point (`product-theme.ts`). Sub-project 5 built (843206f, ead97e6, 4507ffa, 1afe5f4, 1f00b14c): the design model chooses `dna.productCard`/`productCss` (sanitized in `normalizeDna`, which the sanitizer survives because it is idempotent), the agent has a `set_product_card_theme` tool, `verify` checks the theme in a real browser and removes CSS that breaks a protected control, and the accepted theme is saved into the design and the store's `config.dna`. Not built: YAPI reordering content blocks (the agent engine has no product-operations path). To evaluate: run `apps/api/scripts/evaluate-yapi-agent.ts --theme-out` for a chair shop and a jewellery shop (spends model credits), then `scripts/compare-product-themes.ts a.json b.json` (distance must be at least 3). Sub-project 6 built (v1; 51ada490, ed2883ac, b90874b5, 605358b8, 9acc1abd): the sandboxed preview has an edit mode with a hover outline and name per section and a validated `pagosya:source-select` message (51ada490, ed2883ac); an explicit `selection.sectionId` scopes the API edit to that section instead of guessing from the text (b90874b5); the Studio has a "Seleccionar" toggle and a chat chip ("Sección: Hero ×") that travels with the next request (605358b8, 9acc1abd). Not built (by decision, D1): free drag/resize; deterministic reorder/duplicate/hide (these go through YAPI with the selection); editing platform-owned mounts (cart, checkout, product page, catalog, contact, subscribe), which select as "Lo administra pagosYa" with no chip. Not verified: the manual browser check (no Studio dev server was running).

Build order (plans written 2026-09-29, all in docs/superpowers/plans/):
1. `2026-09-29-photo-sets-and-content-blocks.md` (sub-projects 1 and 2)
2. `2026-09-29-product-card-theme-and-guarded-css.md` (3 and 4; extends the existing Design DNA with a `productCard` group)
3. `2026-09-29-yapi-product-card-theming.md` (5; needs 1 and 2 done)
4. `2026-09-29-visual-selection-editor.md` (6; independent, can run any time)
