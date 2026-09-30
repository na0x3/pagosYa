# Store catalog pages (sub-project 3 of Complete store pages)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Builds on the page
architecture and content pages (`InfoPage`, `renderInfoPages` in `commerce.js`, `// @pagosya-page` files). The owner
asked for sub-projects 3 to 6 without further questions on 2026-09-30, so the decisions below were taken by the
implementer; each states why.

## Goal

Two more standard pages in every template store: a list of the store's collections (`colecciones.html`) and a product
search (`buscar.html`), drawn by the runtime from the live `store`, in the template's own design.

## What exists (verified 2026-09-30)

- `store.collections` is `[{ name, slug, productIds }]`; `store.items` are the products; `collectionHref(slug)` links
  `coleccion.html?c=<slug>` and `productos.html` lists every product (both kit-owned static pages).
- Helpers usable before the catalog code runs (declared earlier in `commerce.js`): `money`, `products`, `productHref`,
  `pageHref`, `escape`. `collections()` and `collectionHref` are declared later (line ~2552), so the info-page code must
  not call them (a `const` used before its declaration throws at startup).

## Design

| Page (file, URL) | Content | Has content when |
|---|---|---|
| `catalog/collections` → `colecciones.html` | one link per collection that holds at least one product, with its product count, plus "Ver todos los productos" | at least one such collection |
| `catalog/search` → `buscar.html` | a search form (GET, field `q`) and, when `q` is present, the matching products as cards | the store has at least one product |

Both use the existing `InfoPage` with two new kinds, `collections` and `search`, so they get the same unavailable state,
the same `noindex` handling and the footer nav (`Colecciones`, `Buscar`, listed first).

**Search rules** (decision: local filtering, because the runtime already holds the whole catalog and the API has no
search endpoint): lower-case and strip diacritics; every word of `q` must appear in the product name, description,
tags or category name; at most 48 results; `q` is cut to 80 characters; it is escaped wherever it is printed. No
stored history, no cookies, no analytics event. A query with no match says so and keeps the form.

**Safety:** `q`, names, descriptions and image URLs are escaped; an image is used only when its URL is `http(s)` or
root-relative; cards link through `productHref`.

**SEO** (lesson from the review of sub-project 2): `buscar.html` is baked `noindex` and left out of the sitemap and
`llms.txt`, like `404.html` and `checkout.html`; search results pages must never enter an index.

**Files:** `CONTENT_PAGE_FILES` gains `components/catalog/collections.tsx` and `components/catalog/search.tsx`
(eleven information and catalog pages per template store). Same rules as sub-project 2: only on template apply and only
for templates with a `Shell`.

## Testing

JSDOM tests beside `source-commerce-info-pages.spec.ts`: collections with and without products, search with a match,
with diacritics, with several words, with no match, with hostile `q`, over the 48 cap, with no `q`; nav lists both only
when they have content; SEO exclusion; the eleven files route to `colecciones.html` and `buscar.html`.

## Out of scope

Server-side search, suggestions, filters by price, the existing `productos.html` and `coleccion.html` pages.
