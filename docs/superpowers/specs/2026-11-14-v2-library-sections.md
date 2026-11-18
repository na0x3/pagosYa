# V2: reuse the section library (2026-11-14)

Owner: «cant it just copy and reuse sections we already have» → «do it like that then» (after round 3 of the 7 V2 stores).

## Goal
A V2 home mixes **library sections** (the 92 tested sections of `source-section-library.ts` / Esencial `library.tsx`, filled with
the store's real data) and **custom sections** the writer designs. The writer writes code only where a library section does not
fit, so builds get faster and break less, and the store still gets its own look (the library sections take the store's tokens).

## Shape
1. **Catalog in the pages call.** The writer's pages prompt lists the library (id · role · `use` · needs), and the store facts
   the library needs (`buildLibraryFacts`, as section fill does).
2. **Answer.** The pages call's schema gains `library: [{ slot, block }]` — `block` is the section fill's raw block (type, texts,
   photos, items, products). In `home.tsx` the writer places `<LibrarySlot name="s1" />` (from `./v2-library`) where each goes.
3. **Validation.** `validateLibraryLayout({ blocks }, facts)` checks every block (real photos, real products, text caps, needs);
   a block it drops leaves its slot empty and becomes a writer problem for the fix loop («la sección s2 no pasó: …»). Unknown
   slots / slots without a block are contract problems.
4. **Assembly.** `assembleV2Files` writes `components/v2-library.tsx`: the validated blocks by slot and `LibrarySlot`, which renders
   one block with `LibraryBlockView` + mounts `LibraryScript` once (both newly exported from `library.tsx`; `LibraryHome`
   unchanged). `library.tsx`, `icons.tsx` and `store-data.tsx` are kept because a written file imports them.
5. **Styles.** From the base snapshot's `styles/globals.css`, the section library part (`.lb-*` rules and keyframes, from the
   «Section library» marker to the end, plus the earlier `.lb-*` helpers) is appended after the design's sheet, with the card
   rules stripped (the platform card stays) and a token bridge in `:root`: `--es-paper/ink/muted/accent/on-accent/radius/deep/
   on-deep` and their `--es-base-*` twins from the design's `--kit-*`, `--es-heading`/`--es-body` from new `--kit-display`/
   `--kit-text` the writer sets.
6. **Not in scope:** header/footer stay written by the writer (NavShell); the product page stays as is; no template theme CSS.

## Measure
Rerun the 7 brands (round 4) and compare with round 3: rule findings, build attempts, minutes, and the owner's look.
