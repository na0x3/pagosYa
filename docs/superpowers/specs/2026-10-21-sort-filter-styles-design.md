# Sort & filter styles — design

2026-10-21 · approved in chat 2026-10-21 (owner: «a much better sorting ui, that page looks like plain html»).

## Why

The catalogue page (`productos.html`, kit `catalog/filters.js`) works — sort, category / option / price groups, toggles,
removable active chips, a phone sheet — but it is drawn as bare form controls (screenshot 2026-10-21, NOA VARGAS: «Orden ar»
wrapping, raw checkboxes, number inputs). Every store gets it, and it reads as plain HTML next to a designed store.

## What changes

Three finished styles of the same filters, chosen per store. The filtering logic, URL state and counts stay exactly as
they are (`filterGroups`, `applyFilters`, `sortItems`, `readFilterState`/`writeFilterState`); only markup and CSS change.

1. **`bar` — top bar + filter drawer.** One slim row above the grid: «12 productos» left; «Ordenar ▾» (a styled menu, not
   a raw select) and «Filtrar (2)» right. «Filtrar» opens a side drawer (right on desktop, bottom sheet on phones) with each
   group as a section: categories and sizes as pill chips, colours as round swatches with names, price as a two-handle
   slider with the two numbers, toggles as switches; «Ver 12 productos» and «Borrar todo» at the bottom.
2. **`chips` — chip rows (the John Smedley explorer).** Row 1: category chips («Todo · Vestidos · Faldas · Accesorios»),
   the chosen one underlined. Row 2 (only when the catalogue has colours or sizes): colour swatch chips, then size chips.
   Sort is a quiet «Ordenar: Destacados ▾» on the right of row 1. Price and toggles move into a «Más filtros» drawer
   (the `bar` drawer). Rows scroll sideways on phones.
3. **`sidebar` — refined sidebar.** Today's left column redone: sticky under the header; each group collapsible with a
   chevron and the number chosen («Talla · 2»); pill chips and swatches instead of checkboxes; the price slider; a
   «Borrar filtros» link. Above the grid: count, active filters as removable chips, sort menu. Under 900 px it becomes the
   `bar` drawer.

All three: the store's fonts and colours (`--store-*` tokens), 44 px touch targets, keyboard and screen-reader labels
(chips are `button[aria-pressed]`, the sort menu a `listbox`), «Sin resultados — Borrar filtros» empty state, the
existing «Ver N productos» live count. No raw `<select>`/`<input type=number>`/checkbox is visible in any style.

## Who gets which

- Config `filterStyle: 'bar' | 'chips' | 'sidebar'` (kit reads `config.filterStyle`; missing → today's automatic choice
  mapped to `bar` for small catalogues and `sidebar` for large ones).
- Esencial: a new dice part `filters: [bar, chips, sidebar]`; fashion stores lean `chips` (picked first when the catalogue
  has 2+ categories), others random. Written to `config.js` like `showcase`.
- YAPI-coded stores: the design / sketch models may choose `filterStyle` (new enum field, same three values); a chat
  request («filtros como chips», «barra de filtros arriba») sets it.

## Where it lives

`packages/storefront-kit/commerce-src/catalog/filters.js` (markup per style, drawer + slider + sort menu behaviour),
the catalogue CSS (in the part that styles `.catalog-filters` today), `config-dna.js` if a DNA field is used;
Esencial `template.json` (`variants.filters`) + `source-master.ts` (config writer) + `source-master-dice.ts` (fashion
lean); `source-design.ts` / `sketch-request.ts` (model enum).

## Testing

- Kit jsdom: each style renders every group kind; chip/swatch/slider changes produce the same state and URL as today's
  controls (one parametrised test across the three styles); drawer open/close/Esc/focus; empty state; no visible raw
  form controls.
- API: dice part and fashion lean; config write; model enum.
- Browser: NOA VARGAS (chips) and one non-fashion store (bar, sidebar) at 1440 and 390.

## Out of scope

New filter kinds (material, fit), saved filters, search inside the filters, infinite scroll.
