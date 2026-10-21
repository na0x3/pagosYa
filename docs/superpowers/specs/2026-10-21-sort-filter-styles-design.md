# Sort & filter styles — design

2026-10-21 · approved in chat 2026-10-21 (owner: «a much better sorting ui, that page looks like plain html»).
Amended 2026-10-21 (owner, NOA VARGAS screenshot: «make this sorting part look better and add like a search bar uptop»;
«that page also does not even have the right font in the title… i cant even see the footer»): a search bar on the catalogue
page, and Esencial's catalogue pages keep the store's own header, menu, footer and fonts.

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

### Search bar (amendment 2026-10-21)

One search field at the top of the catalogue, above the filters, in all three styles: a magnifier icon, the placeholder
«Buscar en la tienda», a clear ✕ once something is typed.

- Filters the grid as the shopper types (short debounce, ~150 ms), matching product name, description, tags and category
  name, every word must match, case and accents ignored — the same matching `buscar.html` uses today (`searchBody`'s
  haystack), moved into one shared helper so both agree.
- Works together with the filters and the sort: the count («3 productos»), the active chips and «Ver N productos» all
  follow the search. The search shows as one more removable chip («"seda" ✕»); «Borrar todo» clears it too.
- Kept in the page address as `?q=` (like the filters), so a shared or reloaded link keeps the search; `buscar.html?q=`
  and the header's «Buscar» keep working and can land on the catalogue with the same `q`.
- Nothing found: «Sin resultados para "…"» with «Borrar búsqueda» (and «Borrar filtros» when filters are also on).
- A real `<input type="search">` with a visible label for screen readers («Buscar productos»), 44 px tall, styled with the
  store's tokens (it is the one form field the page keeps, drawn to match the style, never a bare browser box); Esc clears it.
- At most 80 characters, like `buscar.html`.

### The store's own page on Esencial (amendment 2026-10-21)

Today an Esencial store's `productos.html` and `coleccion.html` are the kit's stand-alone fallback pages: their own plain
header («NOA VARGAS Atelier · Productos · Mi pedido (0)»), their own two-line footer («Volver a la tienda · Pagos con
pagosYa») and no store fonts — they read `--store-heading-font` / `--store-body-font`, which Esencial's theme never sets,
so the title falls back to a system font. The store's ☰ menu, logo styling and footer are missing there.

- Esencial gets its own `productos` and `coleccion` pages: the store's `Shell` (header with the store menu, announcement,
  footer, cart) around the kit's empty catalogue mount (`data-pagosya-catalog data-catalog-full`), with an Esencial page
  title («Todos los productos», or the collection's name) in the store's heading font. The kit keeps drawing the grid,
  filters, search and collection logic exactly as on the stand-alone page.
- Older Esencial stores get the two pages at their next refill (the same upgrade path as the menu mounts), so NOA VARGAS
  is fixed without a rebuild.
- Safety net: Esencial's theme block (`masterThemeCss`) also sets `--store-heading-font` and `--store-body-font` to the
  store's pair, so any kit page an Esencial store still uses (checkout fallback, info pages) shows the store's fonts.

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
lean); `source-design.ts` / `sketch-request.ts` (model enum). Search: the same `filters.js` (field, `?q=` state, chip) and
a shared match helper used by `pages/standard.js` `searchBody`. Esencial pages: `templates/esencial/components/productos.tsx`
and `coleccion.tsx` (new), the refill upgrade in `source-templates.ts`, and `masterThemeCss` in `source-master.ts`.

## Testing

- Kit jsdom: each style renders every group kind; chip/swatch/slider changes produce the same state and URL as today's
  controls (one parametrised test across the three styles); drawer open/close/Esc/focus; empty state; no visible raw
  form controls.
- Kit jsdom, search: typing filters the grid with accents/case ignored and every word required; the count, chips and URL
  `?q=` follow; reload with `?q=` restores it; ✕ / Esc / «Borrar todo» clear it; no-results message; search + a filter
  together; `buscar.html` and the catalogue match the same products for the same words.
- API: dice part and fashion lean; config write; model enum; the theme block sets both store font variables; the refill
  adds the Esencial catalogue pages to an older store once and leaves a store that edited them alone.
- Browser: NOA VARGAS (chips) and one non-fashion store (bar, sidebar) at 1440 and 390 — the catalogue page shows the
  store's header with the ☰ menu, its footer and its heading font; search narrows the grid.

## Out of scope

New filter kinds (material, fit), saved filters, search suggestions / autocomplete, searching inside a filter group's
values, infinite scroll.
