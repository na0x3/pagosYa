# «browse» catalogue style — Nike-like shop page (design)

Date: 2026-11-06 · Branch: oct24-clean · Owner: «i like also sections like these» (nike.com Zoom Vomero listing); chose «Que YAPI lo
elija» (one more catalogue style, picked per store or asked for) and «Recoger hoy» = stock + an active pickup location.

## What the shopper sees (filterStyle `browse`)

- Desktop: the filter column (the `sidebar` groups) is always beside the grid, whatever the number of products; under 900 px the
  drawer as today.
- A head row: the product count on the left; on the right «Ocultar filtros» / «Mostrar filtros» (hides the column, the grid takes
  the width; remembered for the tab) and «Ordenar por: …» (the existing sort listbox).
- «Recoger hoy»: a switch at the top of the column, only when the store has a location with pickup on; on, it shows the products
  that are not sold out (stock > 0 or no limit, any combination left).
- Cards: each card shows the photos of its colours (one per variant photo, up to 6, «+N» after) as a strip of square thumbnails
  under the main photo; pointing or tapping one swaps the card photo and opens the product in that colour (the existing
  `swatch-swap` card preview, bigger and longer). A card without per-colour photos is unchanged.

## How a store gets it

- Kit: `catalog/filters.js` FILTER_STYLES gains `browse`; `cards.js` uses the `swatch-swap` preview on catalogue cards of a
  `browse` store; CSS for the head row, the hidden column and the strip.
- API: `FILTER_STYLES` (`source-filter-style.ts`) and `masterFilterStyle` accept `browse`; the merchant's words «como Nike»,
  «filtros a la izquierda con fotos por color», «catálogo como tienda grande» ask for it; YAPI picks it at the first build for a
  store whose products carry per-colour photos (fashion, shoes); the Esencial `filters` variant list gains it.
- The Studio preview bundles the kit at build time: rebuild it (vite build --mode embedded) after the kit change.

## Tests

New kit spec (own jsdom per test, errors per window — the old source-commerce-filters.spec.ts is 44/44 red on HEAD: stale
expectations plus timers of closed windows leaking errors into the next test): browse layout and head row, hide/show column,
«Recoger hoy» only with a pickup location and its filtering, card strip (≥2 colour photos, cap 6 + «+N», swap). API: style parsing,
words, first-build pick. Live: a store set to browse in the Studio preview.
