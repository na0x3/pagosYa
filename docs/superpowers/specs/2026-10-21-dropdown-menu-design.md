# Dropdown menu — design

2026-10-21 · part 3 of 3 (photo zoom → fashion look → dropdown menu)

## Why

The owner wants YAPI to give stores dropdown menus like John Smedley's (fourth screenshot, 2026-10-21): «a must for
fashion brands and like other brands». YAPI may not draw its own menu (2026-10-16 header rule, enforced by the header
gate), so the dropdown is a platform header feature that YAPI fills.

## When a store gets one

- **Fashion stores** (the `kind` from part 2): always.
- **Other stores:** rolled by the dice — a new Esencial part `menu: none | panel | dropdowns`, seeded by the store like the
  other parts; stores with fewer than 2 categories roll `none`.
- **Any store whose merchant asks** («quiero un menú desplegable», «agrega Accesorios al menú», «menú con categorías»):
  YAPI builds or edits it in chat, whatever the dice said. Asking to remove it turns it off.

## The two styles

1. **Panel** (the John Smedley one). ☰ opens a panel right under the header, same width as the header bar:
   - tabs across the top (default «Tienda» / «Descubre»), the active tab filled dark;
   - links in two columns;
   - an optional row of 2–3 picture tiles with a title (e.g. «Por estilo»: Vestidos · Sastrería · Seda), each linking to a
     category;
   - a full-width dark bar at the bottom («Ver toda la tienda»).
2. **Dropdowns.** On desktop the header shows top links (max 4, e.g. Mujer · Hombre · Accesorios · Historia); hovering
   (with a short delay) or clicking one drops a panel with its links and tiles. On phones it is always the panel style.

## What is in it

A menu config, the same shape for both styles:

```js
menu: {
  style: 'panel' | 'dropdowns',
  groups: [            // tabs (panel) or top links (dropdowns), max 4
    { label: 'Tienda', links: [{ label, href }], tilesTitle: 'Por estilo', tiles: [{ title, image, href }], footer: { label, href } }
  ]
}
```

- **Default** built by the platform from real data: «Tienda» = Novedades + every category (+ «Todos los productos»),
  tiles = up to 3 categories that have a banner or a product photo; «Descubre» = Nuestra historia + the store's info pages
  (envíos, cambios, guía de tallas, contacto) that exist.
- **YAPI** chooses the style (fashion and calm editorial brands lean panel; brands with 2–4 big departments lean
  dropdowns), renames and regroups (e.g. Mujer / Hombre by category), and picks tiles from the store's own photos.
- **Checks at save** (not prompt-only): every `href` must resolve to a page, category or anchor that exists; tiles without
  a real store photo are dropped; labels ≤ 28 chars; ≤ 4 groups, ≤ 12 links per group, ≤ 3 tiles. Bad entries are
  dropped, never fail the save; a menu left with no links falls back to the default.

## Where it lives

- Config: Esencial → `store-data` (`menu`), written by the master fill/refill; YAPI-coded stores → `config.js`
  `header.menu`, written at save like `header.account` (`withHeaderAccountConfig` pattern in `source-header.ts`).
- Render: Esencial's `Header` (`Shell.tsx`) renders the panel / dropdowns from `menu`, falling back to today's links when
  `menu` is absent; the platform header (`renderSourceHeader`) renders the same markup into its menu, and
  `commerce-src/header/platform-header.js` gains tabs + hover dropdown behaviour. One stylesheet in the kit, the store's
  tokens.
- The header gate keeps working: the menu is platform markup inside `header[data-pagosya-header]`, so it counts as the
  platform header, not a second menu.
- Chat edits: a YAPI tool `set_store_menu` (style, groups) used when the merchant's words ask about the menu; the save
  checks above apply.

## Behaviour

- Keyboard: tabs are buttons with `aria-selected`, ←/→ move between tabs; Esc closes and returns focus to ☰ / the top link;
  Tab stays inside the open panel; the scroll lock is always given back (platform-header rule).
- Hover dropdowns open after ~120 ms and close after ~200 ms out, so a diagonal mouse move does not close them; click and
  Enter open them too; touch never relies on hover.
- `prefers-reduced-motion`: no slide, instant open.

## Testing

- API: default menu from categories/pages, dice `menu` part (and `none` under 2 categories), fashion always gets one,
  href/tile/limit checks, chat words detection, `config.js` write for YAPI-coded stores.
- Kit jsdom: tabs, Esc/focus, hover delays, scroll lock release.
- Browser: header gate passes with the menu on; NOA VARGAS panel menu live, desktop + 390 px; one non-fashion store with
  `dropdowns`.

## Out of scope

Search inside the menu, mega-menu promos/banners beyond tiles, per-page menus, merchant drag-and-drop menu editor in the
dashboard (YAPI chat only for now).
