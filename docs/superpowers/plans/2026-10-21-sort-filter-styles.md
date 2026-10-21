# Sort & Filter Styles + Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The catalogue page stops looking like plain HTML. It gets three finished filter styles (`bar`, `chips`, `sidebar`), a search bar at the top, and, on Esencial stores, the store's own header, ☰ menu, footer and fonts.

**Architecture:** The filter *state* (URL `f_*`, `orden`, `precio`, toggles) and its logic (`filterGroups`, `applyFilters`, `sortItems`) stay as they are. Two changes on top:
- **Search:** the state gains `q`, matched by one shared helper that `buscar.html` uses too.
- **Controls:** `filtersMarkup` is rewritten to draw styled controls per `config.filterStyle`: chip buttons, swatches, a sort listbox, a price range pair, switches and a drawer. They are driven by click and input delegation that edits the state directly (read → change → write → render) instead of reading form controls back.

On Esencial:
- New `components/page-productos.tsx` and `components/page-coleccion.tsx` wrap the kit's catalogue mount in the store's `Shell`.
- The theme block also sets `--store-heading-font` / `--store-body-font`.
- A dice part `filters` writes `config.filterStyle`.
- Older stores get both pages at their next refill.

**Tech Stack:** Kit runtime parts (`packages/storefront-kit/commerce-src`, built by `tools/build-commerce.mjs`), jsdom specs in `apps/api`, NestJS API (Jest `-w 2`), Esencial template (React TSX).

**Spec:** `docs/superpowers/specs/2026-10-21-sort-filter-styles-design.md`

## Global Constraints

- Styles: `filterStyle: 'bar' | 'chips' | 'sidebar'`. A missing value keeps today's automatic choice: `sidebar` when there are 9+ products or 3+ groups, else `bar`.
- Filters and search show on full catalogue pages with 6 or more products, as today.
- No raw `<select>`, `<input type=number>` or checkbox is visible in any style. The search field is the one text input, and price uses two styled `input[type=range]`.
- Chips are `button[aria-pressed]`, the sort menu is a `listbox`, toggles are `button[role=switch]`, and touch targets are 44 px.
- Search: debounce ~150 ms; matches name, description, tags and category name; every word must match; case and accents ignored; max 80 characters; `?q=` in the URL; shows as a chip «"seda" ✕»; Esc and ✕ clear it; «Borrar todo» clears it too; no results → «Sin resultados para "…"» + «Borrar búsqueda».
- Esencial fashion stores lean `chips` when the catalogue has 2+ categories; other stores roll at random.
- Copy is Spanish, no emojis. Never run `prisma migrate/diff/reset`. Always `npx jest -w 2 <files>`. Never `pkill server.mjs`. Rebuild the Studio after kit edits (`cd apps/merchant-dashboard && npm run build:studio`).

## Rulings in this plan (owner to see in the final report)

- YAPI-coded (static) stores do not have a model choose `filterStyle`. They get a store-seeded style, kept across saves, plus chat words («filtros como chips», «barra de filtros», «filtros a la izquierda»). That avoids touching the design models' schemas and prompts. Cost: a static store's filter style is random, not matched to its brand.
- Search shows only where filters show (6+ products). A shorter catalogue needs neither.

## Review Focus

1. **Typing in the search field:** a re-render must not steal the focus or move the caret (kit test in Task 1).
2. **A search with no results while filters are on:** both «Borrar búsqueda» and «Borrar filtros» are offered, and each clears only its own part (Task 1).
3. **An old shared link with `?f_categoria=…&q=…`:** restores the same products and chips in every style (Task 2, parametrised).
4. **An older Esencial store whose kit `productos.html` sits in its snapshot:** after the refill, the store's own page wins and is not shadowed by the kit file (Task 4).
5. **Phone width:** the drawer opens as a bottom sheet, Esc closes it, focus returns to «Filtrar», and the scroll lock is given back (Task 2).

---

### Task 1: Search on the catalogue (kit)

**Files:** Modify `packages/storefront-kit/commerce-src/catalog/filters.js` and `pages/standard.js` (`searchBody` uses the shared helper), `catalog/render.js` (keep focus while typing), and `shared/click-actions.js` (the search chip). Build `kit/commerce.js`. Test: `apps/api/src/storefront-source/source-commerce-filters.spec.ts`.

**Produces:**
- `function searchWords(text): string[]` (folded words, max 80 chars)
- `function matchesSearch(item, words): boolean`
- `readFilterState()` returns `q: string`; `writeFilterState(state)` writes `q`
- `applyFilters` applies `q`
- markup `.catalog-search` holds `input[type=search][name=q]` plus `button[data-search-clear]`
- `[data-filter-remove="q:"]` is the search chip

- [ ] **Step 1: Write the failing tests** (in `source-commerce-filters.spec.ts`): typing filters with case and accents ignored and every word required, while focus and caret are kept; the URL gets `q`; tags and category names match; a reload with `?q=` restores the value and its chip; ✕, Esc and «Borrar todo» clear it (the last keeps `orden`); no results says «Sin resultados para “zzz”» and offers `[data-search-clear]` plus `[data-filters-clear]` when filters are on; the value is cut at 80 characters.
- [ ] **Step 2:** Run `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-filters.spec.ts -t search`. Expected: FAIL (no `.catalog-search`).
- [ ] **Step 3: Implement.**
  - Add `searchWords` and `matchesSearch` to `filters.js` as function declarations, so `standard.js` can call them at run time. The haystack is the item's name, description, tags and category name, folded.
  - `readFilterState` gains `q` (capped at 80 characters), and `writeFilterState` sets `q` when it's non-empty.
  - `applyFilters` checks `matchesSearch` first.
  - `filtersMarkup` draws `.catalog-search` first: a hidden label «Buscar productos», a CSS icon, the input with placeholder «Buscar en la tienda», and ✕ when there's a value.
  - The search chip is `“q” ✕`.
  - Delegation:
    - `input` on the search field debounces 150 ms, then sets `q` and renders.
    - `keydown` Escape on it clears.
    - `click` on `[data-search-clear]` clears.
    - In `click-actions.js`, a `q` key clears `q`.
  - In `render.js`, remember the focused search caret before setting `innerHTML`, then refocus and restore it after.
  - The empty state when `q` is set: «Sin resultados para “…”» plus «Borrar búsqueda», and «Borrar filtros» when filters are on.
  - `standard.js` `searchBody` uses `searchWords` / `matchesSearch`.
- [ ] **Step 4:** Rebuild the kit and run the filters spec plus `source-commerce-pages.spec.ts`. Expected: PASS. The pre-existing failure in `source-commerce-pages` doesn't count: «Inline storefront product options» also fails on the 31d31ed4 kit.
- [ ] **Step 5:** Commit `feat(kit): search bar on the catalogue, one match rule with buscar.html`.

### Task 2: Three filter styles (kit)

**Files:** `catalog/filters.js` (markup per style plus delegation), `shared/click-actions.js` (filter handlers move into `filters.js`), and `look/dna-css.js` (the filter CSS is replaced). Test: `source-commerce-filters.spec.ts`. Update the old select- and checkbox-based tests to the new controls, keeping every result and URL assertion.

**Produces:** DOM:
- `.catalog-filters[data-filter-style=bar|chips|sidebar]`
- `button[data-filter-chip="key:value"][aria-pressed]` (swatches add `data-swatch`)
- `button[data-filter-toggle=key][role=switch][aria-checked]`
- `[data-filter-range] input[type=range][name=precio-min|precio-max]` + `output`
- sort: `button[data-sort-toggle][aria-haspopup=listbox][aria-expanded]` + `ul[role=listbox] li[role=option][data-sort][aria-selected]`
- drawer: `[data-filters-drawer][role=dialog][aria-modal=true][hidden]`, opened by `button[data-filters-open]`, closed by `button[data-filters-close]` and `button[data-filters-done]` («Ver N productos»)
- sidebar groups: `details[data-filter-group]` with summary «Talla · 2»
- chips row 1: `.catalog-filters__row--categories` («Todo» + categories, single-choice)

- [ ] **Step 1: Failing tests,** parametrised over the three styles:
  - no visible select, number or checkbox
  - a chip filters, writes `f_color=rojo` and shows pressed
  - the listbox sorts and its button shows the chosen label
  - the «Con descuento» switch filters (the drawer is opened first for bar and chips)
  - an old link `?f_categoria=c1&f_color=rojo&q=m` restores the same products and chips (Review Focus 3)
  - the price range max narrows the results and writes `precio`

  Plus these, not parametrised:
  - the drawer locks the page, Esc closes it, focus returns to the opener and the lock is given back (Review Focus 5)
  - chips style shows «Todo · Vestidos · Faldas» in row 1 and «Más filtros» opens the drawer
  - no `filterStyle` keeps the automatic bar/sidebar rule
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Shared pieces: chip, switch, range pair, sort menu, active chips (the search one included) and drawer.
  - `bar`: search, then the row (count · sort · «Filtrar (n)»), then active chips, then the drawer with all groups.
  - `chips`: search, then row 1 (categories, with sort on the right), then row 2 (swatches and sizes), then active chips, then the «Más filtros» drawer with price and toggles.
  - `sidebar`: an aside with the search, `details` groups, the range, switches and «Borrar filtros»; above the grid, the count, active chips and sort. Under 900 px, «Filtrar» opens the same groups in the drawer.
  - Behaviour in `filters.js` delegation, all as read → change → write → render:
    - The sort listbox: ↑/↓ move, Enter or a click picks, Esc closes.
    - The drawer: the scroll lock is given back as found, focus goes to its first control, Tab stays inside, Esc / close / done return focus to the opener, and a re-render keeps it open.
  - Remove `filterStateFromControls` and the old `change`/`submit` listeners, and the `click-actions.js` filter branches.
  - CSS in the `pagosya-showcase` layer:
    - store tokens throughout
    - pill chips; pressed chips filled with the foreground colour
    - 28 px swatches with names next to them
    - 40×24 switches
    - a 44 px search field with a CSS magnifier
    - the sort menu as a floating list
    - the drawer on the right at `min(420px,100%)`, and a bottom sheet under 760 px
    - the sidebar sticky
    - chip rows scrolling sideways on phones
    - no transitions under reduced motion
- [ ] **Step 4:** Rebuild the kit and run the filters, pages, store-menu, fashion and photo-viewer kit specs. Expected: PASS, apart from the known pre-existing pages failure.
- [ ] **Step 5:** Commit `feat(kit): three finished filter styles — bar, chips, sidebar`.

### Task 3: Who gets which style (API)

**Files:** `templates/esencial/template.json` (`variants.filters`, last key), `source-master-dice.ts`, `source-master.ts` (`masterFilterStyle`), `source-templates.ts` (assemble and refill write `config.filterStyle`), new `source-filter-style.ts` (`FILTER_STYLES`, `seededFilterStyle`, `instructionAsksFilterStyle`, `withFilterStyleConfig`), `source-save-assembly.ts` / `source-generation.service.ts` (static stores). Tests: dice, refill, esencial, a new `source-filter-style.spec.ts`, generation-header.

- [ ] **Step 1: Failing tests.**
  - Dice: fashion with ≥2 categories rolls `chips`; others roll all three across seeds; adding the part leaves every other roll unchanged.
  - Assemble and refill write `filterStyle` and keep it.
  - The words:
    - «filtros como chips» → chips
    - «pon una barra de filtros arriba» → bar
    - «filtros a la izquierda» and «filtros en una columna» → sidebar
    - «cambia el color» → undefined
  - The seeded style is stable for a store id.
  - A static save writes a seeded style; a chat edit «filtros como chips» writes `chips`; a later edit keeps it.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Dice: `filters` is skipped in the main map and rolled with `rng(seed#filters)`. Fashion with ≥2 categories gets `chips`. Add it to `DICE_ONLY`.
  - Assemble and refill config gain `masterFilterStyle(variants)`.
  - Static saves: `withFilterStyleConfig(files, previous, asked, storeId)` keeps `previous.filterStyle`, or uses the asked one, or seeds. It's applied in `assembleSave` next to `withStoreMenu`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(api,esencial): filter style per store — Esencial dice (fashion chips), static seeded + chat words`.

### Task 4: Esencial catalogue pages with the store's header, menu, footer and fonts

**Files:**
- Create `templates/esencial/components/page-productos.tsx` and `page-coleccion.tsx`, plus a `globals.css` block.
- `source-master.ts`: `masterThemeCss` sets both store font variables.
- `source-templates.ts`: `withEsencialCatalogPages`, called by `refillMasterFiles`.
- Tests: esencial, refill, master.

- [ ] **Step 1: Failing tests.**
  - The theme CSS has `--store-heading-font:var(--es-heading)` and `--store-body-font:var(--es-body)`.
  - The assembled store's `productos.html` and `coleccion.html` are compiled Esencial pages, without `commerce-header`. Rendered in the sandbox, they have `.es-header`, `.es-footer` and the catalogue mount, and the collection page has `data-collection-page`.
  - Refill adds the pages to an older store. After `SourceProjectsService.prepare`, its `productos.html` is the compiled one and not the kit's (Review Focus 4).
  - A second refill is a no-op.
  - A store with its own `page-productos.tsx` keeps it.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The pages follow `checkout.tsx`'s pattern: `Header` + `<main id="contenido" className="es-page es-catalog-page">` with `<h1>`, the kit mount, `data-pagosya-cart` + status, and `Footer`.
  - CSS for the page and title.
  - The theme vars.
  - `withEsencialCatalogPages` copies the two components and the CSS block when they're missing, drops the snapshot's kit `productos.html` / `coleccion.html` (identified by `class="commerce-header"`), and is called from the refill.
- [ ] **Step 4:** Run, plus `source-templates-contract.spec.ts` in the background. Its one pre-existing failure, «id=inicio», doesn't count. Expected: PASS.
- [ ] **Step 5:** Commit `feat(esencial,api): catalogue pages keep the store's header, menu, footer and fonts`.

### Task 5: Typecheck, wider suites, live check

- [ ] Run `tsc --noEmit`, `build-commerce --check` and the kit's `npm test`.
- [ ] Check there are no RUNNING YAPI jobs, rebuild the Studio, refill NOA VARGAS (`scripts/fashion-look-apply.ts cmvi4x7xb0018rb8uvj9ddgzc`), and open «Ver en navegador» on `productos.html` at 1440 px and at phone width. Check:
  - NOA's header with ☰ and its footer
  - the heading font
  - the chip rows
  - search narrowing the grid
  - the drawer on phone
- [ ] A failing check gets a reproducing test, a fix, a rebuild and a recheck.
