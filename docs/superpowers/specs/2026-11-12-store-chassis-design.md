# Store chassis — every store designs its own header, footer, cards, product page and cart

Owner 2026-11-12, after reading Amboras's own store code («do a … then B»).

## Why

Every template store shares the same header, footer, product card, product page and cart: they come pre-designed in the kit, so
stores look alike whatever the home does (owner: «the footer is the same always … everything is the same»). Amboras removed
exactly that: its chassis ships those parts as unstyled skeletons — «a reference implementation every store copies … is the
sameness problem this chassis exists to avoid» — and its design run (GPT-5.6 Terra, ~5 min) designs them per store from a
design plan committed first. Its build check only advises («warn-only, never a build failure»).

## What changes

**Designed per store (the writer writes them):**
- header and menu — `components/header.tsx`
- footer — `components/footer.tsx` (already possible in the studio since fc2c696d)
- product card — `components/card.tsx` (the `data-pagosya-product-template` the kit clones)
- product page — `components/product.tsx` (layout around the kit's `KitSlot`s)
- cart drawer — `components/cart.tsx` (`CartTemplate` / `CartLineTemplate` markup)
- catalogue page header — `components/page-productos.tsx`

**Stays fixed (the chassis):** checkout, account, login, policy pages, the commerce runtime (`commerce.js`), every
`data-pagosya-*` hook and `KitSlot` name, `store-data`. The templates stay as the *starting point* and the home's section
library; their header/footer/card/product page/cart become one reference the writer may take wiring from, never copy.

**Skeleton notes:** each part above gets a short comment, like Amboras's, that says what is wiring (must keep), what is
shopper convention (keep unless the plan says otherwise: cart enters from the right, the logo goes home, price near the
button) and what was the sameness (the same widths, rows, uppercase buttons, four-column footer).

## The design plan (written before any code)

A small structured file the writer commits first (`design-plan.json`), chosen against the last stores so neighbours differ:
`navbar` (bar · centered logo · drawer-first · split), `card` (frame · bare photo · tinted · list), `pdp` (gallery left ·
stacked · sticky buy · editorial), `cart` (drawer · sheet · full page), `footer` (columns · big name · photo · one line),
`type` (pair from the font catalogue), `palette` roles. The check compares the live pages to the plan and **advises**.

## Checks

- **Block (the shop breaks):** a `data-pagosya-*` hook or `KitSlot` missing, the cart template without its line list,
  subtotal or checkout button, a card without image/name/price/add, the footer without its platform hooks, a build error.
- **Advise (design):** plan mismatch, contrast, colours by hand, title sizes, stacked sections, photo sharpness — the
  studio checks as of 6014b366.

## Run

Flag `YAPI_CHASSIS=1` (dev only), first build of a pooled template store, the writer's limits raised for the extra files
(target ≤ 15 min, one sol run). Product page sections and «Nosotros» stay the library's (`ownPages`).

## Test

One store (Oh Belly), then three (NOA, Pawby, BOXY) in the viewer beside their template version. Owner decides from those.

## Open for the owner

1. Which parts first if we split it: header + footer + card (most visible), or all five at once?
2. Do the templates stay as the pool the writer starts from, or does the chassis replace template choice for new stores?
