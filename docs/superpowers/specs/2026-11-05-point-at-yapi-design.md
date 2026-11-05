# Point YAPI at a part of the page — design

Date: 2026-11-05 · Branch: oct24-clean · Owner request: «can we make yapi know which section is user viewing or like the thing is
user to be able to draw a circle or something and tell yapi to edit that part». Owner chose A + B + C, with a picture of the circled
area («Yes, add the picture»).

## Goal

The merchant shows YAPI *which part* they mean, and YAPI changes that part and nothing else, on template stores (every new store
today: random template from the pool, writer off, quick edits only).

- **A. Click a section** (exists, fixed for templates): «Seleccionar» → click → the request is about that section.
- **B. Draw a circle**: inside «Seleccionar», drag a loop around anything — a title, a photo, two sections, the menu bar. YAPI gets
  the sections it touches, the words and photos inside it, and a picture of the circled area with the loop drawn on it.
- **C. What you're looking at**: with no selection, each message says which section was in the middle of the preview. YAPI uses it
  only when the merchant says «esta sección», «aquí», «esto», «acá».

Success: on a template store, «hazla más corta» on a clicked section, «cambia esta foto» on a circled photo and «agrega una
pregunta aquí» while looking at the FAQ each change only that part, through the quick template edit (seconds, cents), never the
code generator.

## What exists today (and why it fails on templates)

- `packages/storefront-preview/src/source-preview-edit-mode.js`: injected into the preview; while on, outlines the direct child of
  `<main>` under the pointer and posts `pagosya:source-select` `{ kind, sectionId, label, text }`. Mounts (`[data-pagosya-catalog]`
  …) are `platform` («Lo administra pagosYa»).
- Studio `source-studio.ts`: «Seleccionar» toggle in the floating toolbar, selection state (`source-selection.ts`), quick actions,
  the pill chip «Sobre: …», `selection: { sectionId }` sent with the message and the estimate.
- API: `selection` scopes the code generator (`sourceSectionScope`), and `source-chat.service.ts` ~1973 **excludes** a selection from
  the template quick edit (`!input.selection`), so on a template store a selected request goes to the slow, costly code path.

Three breaks: (1) the routing above; (2) the main product grid section of a template home holds `[data-pagosya-catalog]`, so a click
on a product card says «Lo administra pagosYa» instead of selecting the section; (3) menu-page sections (spec 2026-11-05) are inside
`<div data-lb-home>` in InfoPage's `<main>`, not direct children of `<main>`, so they never select.

## Design

### 1. The preview script (`source-preview-edit-mode.js`)

- **Template sections**: a section is any element with `data-lb` whose parent carries `data-lb-home` (home `<main>`, menu-page div,
  product page container). Its address is `{ page, at }`: `page` = `home` | `product` | `about` | `contact` | `faq` | `shipping` (from
  `data-lb-page`, the product page marker, else `home`), `at` = its position among the `[data-lb]` children — the same numbers the
  quick edit's `layoutDigest` uses. A mount inside a template section selects the section, not «pagosYa».
- Non-template stores keep today's rule (direct child of `<main>` with a literal id).
- **Click** (pointer travels < 12 px): as today, now with `at`/`page` for template sections.
- **Circle** (pointer travels ≥ 12 px while held): an SVG overlay draws the loop as the pointer moves; on release, if the loop's box is
  at least 24 × 24 px it becomes an area selection, otherwise it is ignored. The script reads, in page coordinates
  (`rect + scroll`):
  - `points`: the loop, simplified to ≤ 64 points;
  - `rect`: its bounding box;
  - `sections`: template sections the loop overlaps, by overlap area, at most 3 (`{ page, at, label }`);
  - `texts`: leaf elements with text whose box centre lies inside the loop, in reading order, ≤ 12 × 200 chars;
  - `photos`: `<img>` `currentSrc` / CSS `background-image` URLs whose box centre lies inside the loop, ≤ 6;
  - `parts`: `header`, `announcement`, `footer`, `menu` when the loop crosses the Shell's header/announcement bar/footer;
  - `width`: the preview's viewport width; `pageQuery`: the page path + query.
  It posts `pagosya:source-select` `{ kind: 'area', area, label }`, `label` = the first section's label or the first text.
  The loop stays drawn (thin, dark, white halo) until the selection is cleared.
- **Viewing**: always on (not only in edit mode), throttled to one post per 400 ms on scroll/resize: the template section (or
  `<main>` child) under the viewport's centre → `pagosya:source-viewing` `{ page, at, sectionId, label }`.
- Escape clears, as today. Links/buttons stay inert while selecting, as today.

### 2. Studio (`source-studio.ts`, `source-selection.ts`, `storefront-preview` receiver)

- `SectionSelection` gains `at?`, `page?` and `area?` (the shape above). `receivePreviewSelection` validates the new fields (types,
  limits) before the Studio trusts them; anything malformed is dropped.
- Chip: «Sobre: <label>» for a click; «Sobre: zona marcada · <label>» for a circle. Toolbar hint: «Toca una sección o dibuja un círculo
  alrededor de lo que quieres cambiar».
- The last `pagosya:source-viewing` is kept per page (cleared on page change/reload).
- Sending: `selection: { sectionId, at?, page?, area? }` when there is a selection; otherwise `viewing: { page, at?, sectionId? }`.
  Retries and the estimate carry the same. Quick actions keep working (their words now reach the template edit).

### 3. API

- **DTO** (`dto/source-selection.dto.ts`, `send-source-message.dto.ts`): `selection.at` (int 0–40), `selection.page` (enum),
  `selection.area` (points ≤ 64 pairs of finite numbers, rect, width 280–2400, sections ≤ 3, texts ≤ 12 × 200, photos ≤ 6 URLs ≤ 500
  chars, parts ⊂ the four names, pageQuery ≤ 200 chars matching the store's page files); `viewing` `{ page, at?, sectionId? }`.
  Carried through `source-merchant-request.ts`, `source-draft-retry.ts` and the job record like `selection` today.
- **Routing** (`source-chat.service.ts` ~1973): on a template store a selection or a circle no longer skips `templateLayoutEdit`; the
  `!input.selection` guards on the plan card, template pick and quick paths at 1528/1538/1564 stay (a pointed request is never a
  redesign or a template switch). Classic (non-template) stores keep today's `sourceSectionScope` path.
- **Focus for the quick edit** (`dialogue.editLayout`): a new `foco` field in the request body —
  `{ pagina, secciones: [at…], textos, fotos, partes, mirando? }` — and one prompt rule: «foco is what the merchant pointed at in the
  preview. Words like esto, esta, aquí, acá, este título, esta foto mean it. Change only the sections in foco unless the request
  names others. With a picture, the loop drawn on it marks the part.» `mirando` (from `viewing`) is sent only when the request
  contains one of those deictic words and there is no selection.
- **The picture** (circle only): `SourceThumbnailsService.region(merchantId, storeId, revision, { pageQuery, width, rect, points })`
  renders the saved revision exactly like the store thumbnail (live catalogue, uploads served from the uploads store, no network), at
  the merchant's preview width, scrolls to the rect, draws the loop as an SVG overlay, and clips the rect plus 48 px (capped at
  1400 × 1000 CSS px), output JPEG ≤ 1024 px wide, quality 72. It runs in parallel with the store-state read, 20 s budget; on any
  failure the edit goes on without the picture (logged `point_picture_failed`). The picture is sent as one `input_image` in the
  `editLayout` call. Not stored.
- **Menu pages**: `foco.pagina` = a menu page routes the ops to that page, as `page=about` ops do today.
- **Parts only** (the circle covers only the header/announcement/footer): `foco.partes` tells the store edit which part (menu,
  announcement, footer line) — the parts it already edits.
- **Platform parts**: a circle on checkout/cart/product mounts outside a template section answers «Esa parte la administra pagosYa»
  in the Studio, as a click does today; nothing is sent.
- **Reply**: unchanged (`layoutEditReply` names what changed). When `foco` is set and the ops touched a section outside it, the log
  line records `outsideFocus` (no blocking: the merchant may have named another section).

## Not changing

Classic (non-template) stores' selection path; the code generator; the Boceto editor's own block selection; published sites (the
script is preview-only); mobile Studio gestures beyond pointer events (touch drawing works through pointer events; no pinch).

## Testing

- `source-preview-selection.test.ts` (jsdom): template section address on home/menu page/product page; mount inside a section
  selects the section; circle → sections/texts/photos/parts; tiny loop ignored; viewing post throttled.
- `source-selection.test.ts` / Studio receiver tests: validation drops malformed areas; chip labels; payload with `area` / `viewing`.
- API: DTO validation limits; routing — template store + selection goes to `templateLayoutEdit` with `foco`; classic store keeps
  `sourceSectionScope`; `mirando` only with deictic words; region capture builds the clip from rect/width (unit, Playwright mocked)
  and a failing capture still edits.
- Live (ChatGPT plan, NOA VARGAS 9wj1ec11 Gumdrop + one store with a sectioned «Nosotros»): click a section «hazla más corta»;
  circle a photo «cambia esta foto»; circle a title «más corto»; scroll to the FAQ, no selection, «agrega una pregunta aquí sobre
  arreglos»; circle the menu bar «agrega Novias al menú». Each: only that part changes, seconds, `template_layout_edit` in the log.
