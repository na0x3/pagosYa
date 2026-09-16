# How products are arranged in a store

Status: approved by the owner 2026-09-15 (including §7), not implemented. Plan: `docs/CATALOG_ARRANGEMENT_PLAN.md`. Follows `docs/PRODUCT_PAGE_KIT.md` (Part 1) and `docs/PRODUCT_HIGHLIGHTS.md` (Part 2).

## 1. What the owner chooses

Today every generated store shows one catalog block on the home page, and YAPI decides how it looks. Owners want to decide how their products are laid out. They pick one of four arrangements:

| Arrangement | What a shopper sees |
|---|---|
| **Todo en la portada** (default today) | One grid with every product on the home page. |
| **Por secciones** | The home page repeats the grid once per collection, each under its own heading, in the owner's order. |
| **Página de productos aparte** | The home page keeps its story and shows a few products with a link; the whole catalog lives on `/s/<tienda>/productos`. |
| **Una pestaña por colección** | A row of tabs; each tab is its own page, `/s/<tienda>/c/<colección>`, showing that collection's products. |

Products not in any collection appear in a final "Más productos" group, so nothing becomes unreachable.

## 2. Collections

Collections work like playlists, as the owner asked: a product can sit in several.

- New `Collection` (id, storeId, name, slug, sortOrder, timestamps) and `CollectionProduct` (collectionId, paymentLinkId, sortOrder) with a unique pair.
- A store may have up to 12 collections, each holding up to 200 products.
- `slug` is generated from the name (`verano`, `mas-vendidos`), unique per store, and stays put when the name changes, so shared links keep working.
- Existing categories stay as they are. They remain the single-choice field used for filtering and the `/c/<id>` category route; collections are the owner's own groupings. Where both exist, the arrangement uses collections.

## 3. Where the owner does it

- **Studio panel "Cómo se ven tus productos":** pick the arrangement, create and rename collections, drag products in and out, reorder collections and the products inside them. Same panel style as the retention and shipping panels.
- **YAPI in chat:** "ponlo en secciones", "crea una colección de verano con estos tres productos", "quiero una pestaña por colección" are interpreted as requests to change the arrangement or the collections, and applied as a saved change the owner can undo, never as a paid redesign.

## 4. How the storefront renders it

The kit owns the arrangement, as it owns the product page:

- `store.catalogLayout` (`all` | `sections` | `page` | `tabs`, default `all`) and `store.collections` (name, slug, product ids) travel in the public catalog the kit already reads.
- **Todo en la portada:** unchanged behavior.
- **Por secciones:** the kit renders one titled group per collection inside the existing `data-pagosya-catalog` mount, reusing the store's own card styling.
- **Página de productos aparte:** the kit shows the first 4 products plus "Ver todos los productos" in the home mount, and the full catalog on the products page.
- **Una pestaña por colección:** a tab row of real links; the current tab's products fill the mount. On the home page the tab row sits above the first 4 products and the same "Ver todos los productos" link (§7).
- **New pages:** `productos.html` and `coleccion.html` join `product.html` and `checkout.html` as kit-owned pages, taking the store's header, footer and styles the same way. Hosted routes: `/s/<tienda>/productos` and `/s/<tienda>/c/<colección>`, plus the same paths on custom domains. The storefront's existing `/c/<id>` route resolves a collection slug first, then falls back to a category id, so older links keep working.
- Each collection page carries its own title, description and canonical link for search engines and sharing.

## 5. What this does not change

- The product page and its two styles.
- Categories, their filter buttons and their existing route.
- The cart, checkout and payments.
- A store whose owner never opens the panel keeps today's single grid.

## 6. Testing

- **API:** collection create/rename/reorder/delete, product membership, slug generation and uniqueness, the 12/200 limits, `catalogLayout` validation, and the public catalog payload.
- **Kit (Playwright):** each of the four arrangements renders from the same catalog; uncollected products appear in "Más productos"; a collection page shows only its products; an unknown collection slug shows the whole catalog rather than an error; the tab row is keyboard reachable and marks the current tab.
- **Studio:** the panel creates a collection, moves products, reorders and switches arrangement, and YAPI's chat request produces the same saved change.
- **Hosted (checkout):** `/s/<tienda>/productos` and `/s/<tienda>/c/<colección>` load, share correctly and keep the cart.

## 7. What the home page shows when the catalog moves

Decided by the owner, 2026-09-15: when the arrangement is "página aparte" or "pestañas", the home mount shows the **first four products followed by a "Ver todos los productos" link**, not the link alone.

"First four" means the first four of the same list the home page would otherwise have shown, in catalog order and after the same category filter — so a store with fewer than four products shows what it has, and a store with none shows only the link. The cards are the store's own product cards, identical to the ones the full grid renders. The link points at `/s/<tienda>/productos` under "página aparte", and at the first collection's page under "pestañas", where the tab row is shown above the four cards.
