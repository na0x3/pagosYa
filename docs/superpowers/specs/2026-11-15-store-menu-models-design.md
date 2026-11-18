# Store menu models — design

Date: 2026-11-15 · Owner decisions: «A» (kit models, YAPI picks), «put all of them» (all 16 models), «i want everything to convert».
Mockups the owner approved: https://claude.ai/artifact/HxKW6dXKnYMQNmyP9c9sdK

## Goal

Every V2 store gets a menu that looks like that store and helps it sell. Today every V2 header opens the same menu: a flat row of
links on a computer and one side panel on a phone. After this, YAPI picks one of 16 menu models per store, fills it with the store's
real groups, products and photos, and dresses it in the store's type and colours. The menu keeps working the same way everywhere
(keyboard, Escape, scroll lock, phone) because the kit draws it.

## What already exists (and is reused)

- `packages/storefront-kit/commerce-src/header/store-menu.js`: `config.header.menu = { style: 'panel' | 'dropdowns', groups }`.
  Groups hold links by target (`category:`, `collection:`, `page:`, `extra:`, `section:`, `new`, `all`) resolved against the live
  store, so a deleted category never leaves a dead link; photo tiles per group, «Ver todo» footer, open/close, focus, Escape.
  The merchant edits groups and links in the dashboard.
- `NavShell` (kit `ui.tsx`) holds the mounts `[data-pagosya-store-menu="toggle"|"links"]` and hides its own links when the store
  menu is on (`data-store-menu-replaces`).
- The V2 direction already picks per-store platform looks (cart `{look, photo}`); the same mechanism carries the menu.

## The models

`config.header.menu.model` names one. `style` stays for old stores: `panel` reads as `tabs`, `dropdowns` as `dropdown`.

Looks:

| model | computer | phone |
|---|---|---|
| `tabs` | today's panel: tabs per group, 2 link columns, 3 photo tiles, «Ver todo» bar | unchanged |
| `mega` | full-width panel under the bar: links column + up to 3 photo tiles, title over the photo | groups stacked, tiles in a sideways row |
| `overlay` | full screen in the brand colour, links in very large type, the photo swaps with the link under the pointer | same full screen, photo under the links |
| `dropdown` | small panel under its top link: short list + one photo card | accordion, one group open, its photo beside the list |
| `drawer` | side panel over a dimmed page: links in the display face, two photo cards at the bottom | drawer fills the screen |
| `split` | full screen in halves: one large store photo, links in two columns | photo on top, links below |
| `index` | numbered list, one line per category with a short note and its live product count, no photos | same list, counts on the right |
| `dock` | floating pill at the bottom; a section opens a sheet upward with photo tiles | pill at the thumb, sheet above it |
| `stickers` | brand colour, each section a tilted sticker with a round photo | stickers stacked, each tilted |
| `circles` | no menu to open: round category photos under the bar on every page (except checkout) + ☰ for pages | circles scroll sideways |
| `rail` | menu always open in a 200 px left column (≥1280 px only; narrower screens use `drawer`) | chips row under the logo |

Selling patterns:

| model | what it adds | phone |
|---|---|---|
| `bestsellers` | mega with the section's 3 best sellers: photo, price, «Agregar» (adds to the cart in place) | best sellers first in a sideways row, then the list |
| `need` | groups named by what the shopper wants («Dormir mejor»), each with a photo and «desde Bs N» (live minimum price of its links) | one need per row |
| `offer` | a photo tile with the store's real offer; «Nuevo» and «Lo más vendido» first in the list | offer tile opens the menu |
| `search` | the menu opens on a large search field, «Populares» chips and the top 3 products with price and «Agregar» | keyboard opens on the field |
| `thumb` | computer: the plain bar with «Nuevo» in the accent; phone: four fixed buttons (Inicio, Categorías, Buscar, Bolsa + count) and category chips | the point of the model |

Where the data comes from, so nothing is invented:

- **Best sellers / top products:** products the merchant badged («Más vendido», «Nuevo») first, then the catalogue order. The label
  says «Destacados» unless the store has the badge. (Real sales counts are a later step, not in this work.)
- **Offer:** only the store's data: a free-shipping threshold, an active public promo code, or a pack's saving against its
  products. None → the tile shows the first best seller instead.
- **Populares (search):** category names and product names, never called «Lo más buscado» (we have no search counts).
- **Counts (index), «desde» prices (need):** computed live from the catalogue.
- The `need` quiz shown in the mockup is left out of this work (no quiz exists to link to).

## How YAPI picks and fills

- The V2 direction schema gains `menu: { model, groups }`. `groups` is the existing shape (label, links by target, tiles by
  target + photo path, footer); `need` groups add a short `note`, `index` groups a one-line `note` per link.
- The direction prompt lists the 16 models with one line on the stores each suits (from the mockups) and the 8 selling rules. YAPI
  picks by the brand: catalogue size, number of categories, store photos available, playful or quiet.
- Variety: like the lead reference, the prompt is told which models the merchant's last stores used, so neighbours differ.
- Tile photos: the store's own photos first, then product photos; each photo once in the menu (the same once-rule the home uses).
- The assembled `config.js` gets `header.menu` from the direction; a merchant's later menu edits in the dashboard keep the model.
- The writer is told the stable classes (`.pym-m-<model>` on the panel, `.pym-*` parts) so a design's own CSS can push the look,
  as it styles NavShell today. Default looks read the store's kit tokens (accent, paper, ink, heading font, radius).

## The selling rules (checked, whatever the look)

1. At most 7 top links; the rest goes inside groups.
2. Plain names (≤ 28 characters, already enforced).
3. «Ver todo» in every group (the runtime adds it when missing).
4. Search and the cart count always visible, on the phone too; the header stays on screen.
5. Real photos, each once; prices on products.
6. Two levels at most: group → link.
7. «Nuevo» and offers first when the store has them; never an invented offer.
8. ≥ 44 px tap areas; opening and closing within 200 ms; reduced motion respected.

Rules 1, 2, 5 and 6 are checked in the V2 contract (a direction that breaks them goes back with the reason); 3, 4, 7 and 8 are
guaranteed by the runtime.

## Shared behaviour

Escape, a click outside and picking a link close the menu; focus stays inside while open and returns to the button; the page does
not scroll behind it; dead targets are dropped (existing resolver). `circles` and `rail` never open or close on a computer; their
phone forms do.

## YAPI looks at the menu

The screenshot look (`v2-look.ts`) adds two shots: the menu open on a computer and on a phone, so the look can report a clipped or
empty menu like any section.

## Settings a V2 build must not lose

Today's fix `withStoreSettings` (contact form) is extended to the popup and game settings (`retention`, the public shape from
`publicRetentionSettings`), so «Rasca y elige», popups and A/B tests switched on after the template revision show on V2 stores.
Checked live on one V2 store with the game on.

## Risks

- **Runtime size:** the commerce runtime cap is 1.25 MB (it was 902 kB on 2026-11-10). The models' CSS and JS are measured after
  each phase; if a phase would pass ~1.1 MB the model CSS is loaded only for the store's own model.
- **`rail`** narrows every page by 200 px on wide screens; V2 sections are written for full width. It is limited to ≥ 1280 px and
  checked with the screenshot look on two stores before YAPI may pick it.
- **`dock` and `thumb`** sit over the bottom of the page: the checkout, the cart drawer and the WhatsApp/contact buttons must move
  above them (checked on the phone shots).

## Build order

1. Runtime: `model` field, old `style` mapping, `mega`, `overlay`, `dropdown`, `drawer`, `split`, `index` (+ phone forms).
2. Selling models: `bestsellers`, `need`, `offer`, `search`, `thumb`.
3. Always-visible models: `circles`, `rail`.
4. V2: direction `menu`, prompt list + rules, contract checks, assembly into `config.js`, writer classes, look shots.
5. Settings: retention in `withStoreSettings`, live check of the scratch game on a V2 store.

## Testing

- Kit: the existing store-menu specs extended per model (rendered markup, dead targets dropped, «Ver todo», 7-link cap, focus and
  Escape), one spec file per run (owner rule: light checks).
- V2 spec: direction `menu` read, contract lines for rules 1/2/5/6, assembly writes `header.menu`.
- Live: rebuild Oh Belly, DooBoo, NOA and Gramiyaa; screenshot each menu open on a computer and a phone; compare against the
  mockups page.

## Out of scope

Real sales counts for best sellers, a product-finder quiz, search analytics, A/B tests of menus (possible later with the existing
A/B tests), template (non-V2) stores beyond reading the new `model` field.
