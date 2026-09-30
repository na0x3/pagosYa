# Studio and YAPI for store pages (sub-project 6 of Complete store pages)

Parent: [2026-09-30-complete-store-pages-program.md](2026-09-30-complete-store-pages-program.md). Built without further
questions, as the owner asked; each decision states why.

## Goal

A merchant whose store was built before the standard pages existed can add them in one click, sees every page of the store in
one list, and can ask YAPI to change a specific page; YAPI knows which file draws which address and never writes policy text.

## What was built

- **API** `POST v1/stores/:storeId/source-project/standard-pages` `{ revision }` → `SourceProjectsService.addStandardPages`.
  Adds the eleven page files (`contentPagesFor`) and the footer nav slot `data-pagosya-pages` in `components/Shell.tsx`, through
  the pure `withStandardPages(files)`. It saves a **new revision that is not published**: the merchant reviews it like any change.
  - Idempotent: answers 409 when there is nothing to add; 400 without a revision or on a non-React site; 404 on a store that is
    not the merchant's. Pages the store already has are kept untouched (a merchant-edited page is never overwritten).
  - The slot is inserted only when the Shell has exactly one `</footer>` after `export function Footer`; otherwise the pages are
    still added (reachable by address and by the sitemap) and the Shell is left alone. Decision: never guess at a layout.
  - Saves the **stored** snapshot, not the runtime-refreshed one (the refreshed `commerce.js` is over the size a saved file may
    have; the platform swaps the current runtime in whenever a page renders). Same as `editFiles`.
  - Tight throttle (6/min) and the compile budget, like the other whole-project recompiles.
- **Studio** `Mi tienda → Páginas de mi tienda` (`source-pages.ts`): lists commerce, standard and hand-made pages with their
  address; "Pedir un cambio a YAPI" fills the composer with `En la página X (archivo): `; "Agregar páginas estándar" appears only
  when something is missing, then reloads the studio on the new revision.
- **YAPI**: `agentOpening` adds "Pages of this store (file -> address)"; the instructions add a STANDARD PAGES rule: those
  pages are filled at run time from the merchant's settings and catalog, so YAPI styles them but never writes or invents policy,
  shipping, refund, privacy or terms text and keeps the `// @pagosya-page` marker and `InfoPage`.

## Known limits

- The compressed runtime (`commerce.js` composed with `privacy.js` and `retention.js`) is about 420 000 characters against a
  400 000 limit on saved files; it is only valid because the platform injects it at render time. Adding code to the kit needs a
  look at that limit first.
- The picker reads pages from the stored snapshot; it does not preview a page.
