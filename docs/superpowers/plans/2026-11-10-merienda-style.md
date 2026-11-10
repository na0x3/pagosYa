# Merienda style — plan

Spec: docs/superpowers/specs/2026-11-10-merienda-style-design.md. Inline execution, one spec file per check (owner: light checks).

1. **Per-store draw** — `drawPresetChoices(preset, seed)` in apps/api/src/storefront-source/source-templates.ts (FNV hash of the
   seed per list, pure); `choices` on the preset type (packages/store-templates/index.d.ts); applied in
   SourceTemplatesService.assemble right after `withPreset` (fonts → fill.look.fonts, variants → variants, looks → each layout block
   of that type). Test first in source-templates spec: same seed same pick, different seeds spread, a preset without choices
   unchanged.
2. **Esencial lists** — template.json master: theme `merienda`; photos `+sticker,+blend`; titles `+slant`; five starterOnly font
   pairs `merienda-archivo|bowlby|titan|rubik|unbounded` (bodies from the kit's fonts).
3. **Sections** — library.tsx: CoverMega, ProductsRows, NamesList, StatementSticker (+ SECTIONS map), CSS between `/* lb:<id> */`
   markers in globals.css; LIBRARY_CATALOG entries (templateOnly, needs, looks). products-rows: needs products [2,5], each row = huge
   name + items[i].text + the store's product card (`data-pagosya-catalog data-products=<name>`). names-list: items = product names
   (exact) with their photos. statement-sticker: needs photos 2. cover-mega: photo 1, items = ribbon words, eyebrow = sticker.
4. **Theme** — `/* theme:merienda */` block: pill header links, round icon buttons, chunky caps, tints from brand colours
   (color-mix), sticker/blend/round photo rules keyed on data-es-photos, slant keyed on data-es-titles.
5. **Template** — templates/merienda/template.json (+ demo photos copied from food templates), preset with layout, productLayout,
   choices; category comida.
6. **Render check** — template-shot.ts on the Merienda demo at 1280 and 390 for several seeds; fix what breaks.
7. **Six test stores** — YAPI first build naming «Usa la plantilla Merienda» for Miga, Oh Belly, DooBoo, BAEK, Antojo, Canasta;
   phone + desktop captures; one artifact page side by side. Merienda stays out of YAPI_TEMPLATE_POOL until the owner approves.
