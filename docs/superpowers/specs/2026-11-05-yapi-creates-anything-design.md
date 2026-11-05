# YAPI creates anything inside the store — part 1: items and new pages (design)

Date: 2026-11-05 · Branch: oct24-clean · Owner: «i want yapi to be able to create anything inside the store». Owner chose «1 + 2 now,
3 next» (this spec: items inside sections + new pages; products, categories and codes from chat get their own spec next) and «page +
link, YAPI places it». Design approved in chat.

## Goal

On a template store (every new store), YAPI creates, removes and reorders the items inside a section, and creates, renames and removes
whole pages with their menu link, through the quick template edit (seconds, cents), never the code generator.

Success (live, NOA test stores): «agrega un paso aquí sobre la entrega» (pointing at the steps section) adds a fourth step there;
«quita el tercer paso» removes it; «crea una página Novias» builds `novias.html` from the template's sections with the bridal dresses
and a link in the menu; «ponla dentro de Colecciones» moves the link into that dropdown; «agrega una pregunta en Novias» works there;
«quita la página Novias» removes the page and its link.

## Today

- Quick edit (`templateLayoutEdit`, `LAYOUT_EDIT_PROMPT`, `layoutEditSchema`, `applyLayoutOps` in `source-layout-edit.ts`) has ops
  `text | remove | move | add | photo` over sections of the home, the product page (`page: 'product'`) and the four menu pages
  (`pageLayouts.about|contact|faq|shipping`, spec 2026-11-05 menu pages). `text`/`photo` with `item ≥ 0` change an existing item; no op
  adds, removes or moves an item.
- Each library section type declares `needs.items: [min, max]` (`LIBRARY_CATALOG`, `source-section-library.ts`).
- Any `components/pages/<slug>.tsx` becomes `<slug>.html` (`storefrontPageRoute`, shared-types).
- The store menu lives in `config.js` `header.menu` (`StoreMenu`: style + groups of links/tiles, `STORE_MENU_LIMITS`), read and written by
  `source-store-menu.ts`; the template header draws it.
- Point-at (spec 2026-11-05) addresses sections by `page` ∈ home|product|about|contact|faq|shipping and `at`.

## Design

### 1. Items inside a section

- New ops in «ops» (same shape, all fields always present):
  - `item-add`: `at` = the section, `item` = the position to insert at (−1 = at the end), `value` = the new item's title. Its text and
    photo follow as ordinary `text` / `photo` ops with `item` = the new item's number (the position it lands at).
  - `item-remove`: `at`, `item`.
  - `item-move`: `at`, `item`, `to` = its new position.
  - All take `page` like the other ops (home, product, a menu page, an extra page).
- `applyLayoutOps` applies them in order before text/photo ops, so the numbers in later ops are the ones after the add/remove/move.
- Limits from the section type's `needs.items`: an add past `max` or a remove below `min` is refused with a sentence that names the
  section and the limit («Los pasos de «De la primera cita…» ya son 4, el máximo de esa sección: quita uno o cambia uno de los que
  hay.»). A type without `needs.items` (no items) refuses `item-add` («Esa sección no tiene puntos para agregar.»).
- Never invented: the prompt says an item is added only with the merchant's words or facts in «tienda»; otherwise «ask» asks for them
  («¿Qué dice el nuevo paso?»), and the reply is joined to the request as for FAQ answers (`metadata.storeAsk`, live 2026-11-05).
- The reply (`layoutEditReply`) says what changed: «agregué el paso «Entrega en el atelier» a «De la primera cita…»», «quité…»,
  «moví…».
- Point-at: «agrega un paso aquí» on a clicked or circled section adds it there (`foco.secciones`).

### 2. New pages

- **Data.** store-data gains `extraPages: Array<{ slug: string; name: string; layout: LayoutBlock[] }>` (always exported, `[]` by
  default), read by `readMasterState`, written by every refill, its photos bundled like `pageLayouts`. At most 6 pages; at most 8 sections
  each (the menu-page cap).
- **Address.** `slug` from the name: lower case, accents removed, non-letters → `-`, `^[a-z][a-z0-9-]{0,39}$`; never one of the store's
  existing page files (every `STOREFRONT_PAGES` url, `index`, `producto`, `productos`, `coleccion`, `checkout`, the menu pages, any
  other `components/**` page) — a clash gets `-2`, `-3`.
- **File.** Each extra page is `components/pages/<slug>.tsx`, marked `// @pagosya-extra-page`, drawing `extraPages` entry `<slug>`
  with the template's `LibraryHome` inside the Shell: `<Shell><main id="contenido" data-lb-home data-lb-page="<slug>">…</main></Shell>`
  plus a page title (`<h1>` = name) when its first section is not a cover. Written by refill when `extraPages` changes; a removed
  page's file is deleted. A file without the marker is never touched.
- **Building a page** (quick edit). New ops:
  - `page-add`: `value` = the page name, `type` = "" , `field` = where the link goes: "" (menu bar) or the label of an existing dropdown
    group. The page starts empty; `add` ops with `page` = "nueva" fill it in the same reply (a cover first, then up to 5 more library
    sections, as for an empty «Nosotros»), each written by `composeLibrary` with the store's words and photos and the titles already
    on the page.
  - `page-rename`: `page` = its slug, `value` = the new name (the link label follows; the address stays).
  - `page-remove`: `page` = its slug (page, file and link go).
  - `page-link`: `page` = its slug, `field` = "" or a dropdown label (moves the link).
  - Ops on an existing extra page use `page` = its slug (the schema's `page` enum gains the store's slugs and "nueva").
- **Category pages.** When the name matches a category (accent- and case-insensitive), the request text passed to `composeLibrary`
  says so and the product sections that take products (`products-cards`, `products-lookbook`, `products-spotlight`…) get that
  category's products; a button «Ver todo» links `category:<name>`. The store-wide grid (`products-grid`) is never added to a page.
- **Menu link.** Written in `header.menu` through the existing menu writer: a link `{ label: name, to: '<slug>.html' }` in the bar, or
  appended to the named group's links. A store with no `header.menu` gets the template's default menu plus the link. Limits:
  `STORE_MENU_LIMITS` (a full menu refuses with a sentence).
- **Quick edit input.** «paginas» lists the extra pages (`{ slug, nombre, secciones }`) with the menu pages; `nuevas_paginas` (library
  sections addable to a page) is offered when the request names a page, asks for a new one, or one is open (`menuPagesFor` extended to
  extra pages and to «página nueva / crea una página / agrega una pestaña»).
- **Point-at.** A section on an extra page is addressed `page = <slug>`: the preview script reads `data-lb-page`; the Studio, the DTO
  (`POINT_PAGES` → home|product|about|contact|faq|shipping or `^[a-z][a-z0-9-]{0,39}$`) and `pointFocus` accept a slug.
- **Template switch.** `keptMenuPages` keeps extra pages (sections, photos, files, menu links) on the new template.
- **Visible change.** `visibleChanges` reports a changed `extraPages` as `pages`.

## Not changing

Classic (non-template) stores; the code generator; products, categories and codes from chat (part 2, next spec); the dashboard menu
editor; published pages until the merchant publishes.

## Testing

- `source-layout-edit.spec.ts`: item-add/remove/move order and numbering, limits from `needs.items`, refusals, replies; page-add with
  «nueva» adds, slug rules and clashes, page-rename/remove/link, schema enum with slugs.
- `source-content-pages.spec.ts` (or a new `source-extra-pages.spec.ts`): the page file, its removal, the marker guard, `keptMenuPages`
  with extra pages.
- `source-store-menu.spec.ts`: link added to the bar / a named group / refused when full; renamed; removed.
- `source-chat-store-edit.spec.ts`: one request «crea una página Novias» → one revision with `extraPages`, the file, the menu link;
  category products; «ask» for an item without words.
- Preview + Studio + DTO: a slug page address.
- Live (ChatGPT plan, NOA nvkv5rvk / qg4wudkg): the six success requests above, each only touching its part, seconds, 
  `template_layout_edit` in the log.
