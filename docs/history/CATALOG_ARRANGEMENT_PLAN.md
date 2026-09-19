# Catalog Arrangement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store owner picks how their products are laid out — one grid, sections per collection, a separate products page, or a tab per collection — and groups products into playlist-like collections, from a Studio panel or by asking YAPI.

**Architecture:** Collections follow the `Category` pattern: two new Prisma models plus a `apps/api/src/collections/` module, exposed through the public catalog `getStorePublic` already returns. `Store.catalogLayout` travels beside it. The kit (`source-kit/commerce.js`) owns all four arrangements inside the existing `data-pagosya-catalog` mount, and two new kit-owned pages (`productos.html`, `coleccion.html`) join `product.html` and `checkout.html`. Hosted routing in `apps/checkout` gains `/s/<slug>/productos` and `/s/<slug>/c/<slug>`, mirroring how `/s/<slug>/p/<id>` already maps onto a kit page.

**Tech Stack:** NestJS + Prisma + Jest (`apps/api`), vanilla browser JS/CSS (`source-kit`), TypeScript + Vitest (`apps/checkout`), TypeScript + Playwright (`apps/merchant-studio`).

**Spec:** `docs/CATALOG_ARRANGEMENT.md`

## Global Constraints

- Shopper-facing copy in Spanish; code comments in English.
- Layout values are exactly `all` | `sections` | `page` | `tabs`, default `all`. A store whose owner never opens the panel keeps today's single grid — `all` must render the same markup that ships today.
- Limits: 12 collections per store, 200 products per collection. A product may sit in several collections.
- A collection `slug` is generated from the name, unique per store, and never changes when the name changes.
- Products in no collection appear in a final "Más productos" group; nothing becomes unreachable.
- Categories are untouched: they stay the single-choice filter field and keep the `/c/<id>` route. `/c/<x>` resolves a collection slug first, then falls back to a category id.
- The cart, checkout, payments, the product page and its two styles do not change.
- Out of scope: the Next.js storefront variant (`apps/api/src/stores/source-next.ts`, whose pages are home/product/checkout). It keeps today's single grid; the spec covers the kit storefront only.
- No new dependencies. Commit subjects in plain imperative English with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line.

---

### Task 1: Collections in the database and API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260916120000_store_collections/migration.sql`
- Create: `apps/api/src/collections/collection-slug.ts`, `collections.service.ts`, `collections.controller.ts`, `collections.module.ts`, `dto/create-collection.dto.ts`, `dto/update-collection.dto.ts`, `dto/reorder-collections.dto.ts`, `dto/set-collection-products.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `CollectionsModule` beside `CategoriesModule`)
- Test: `apps/api/src/collections/collections.service.spec.ts`, `apps/api/src/collections/collection-slug.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `collectionSlug(name: string, taken: Set<string>): string`; `CollectionsService` with `create(merchantId, storeId, dto)`, `listForStore(merchantId, storeId)`, `update(merchantId, storeId, id, dto)`, `reorder(merchantId, storeId, collectionIds: string[])`, `remove(merchantId, storeId, id)`, `setProducts(merchantId, storeId, id, paymentLinkIds: string[])`; routes under `v1/stores/:storeId/collections`. Prisma models `Collection` and `CollectionProduct`.

- [ ] **Step 1: Write the failing slug test** — `apps/api/src/collections/collection-slug.spec.ts`:

```ts
import { collectionSlug } from './collection-slug';

describe('collectionSlug', () => {
  it('slugifies Spanish names', () => {
    expect(collectionSlug('Verano', new Set())).toBe('verano');
    expect(collectionSlug('Más vendidos', new Set())).toBe('mas-vendidos');
    expect(collectionSlug('  Ropa   de Niño ', new Set())).toBe('ropa-de-nino');
  });

  it('suffixes when the slug is taken', () => {
    expect(collectionSlug('Verano', new Set(['verano']))).toBe('verano-2');
    expect(collectionSlug('Verano', new Set(['verano', 'verano-2']))).toBe('verano-3');
  });

  it('falls back when the name has no slug characters', () => {
    expect(collectionSlug('!!!', new Set())).toBe('coleccion');
    expect(collectionSlug('!!!', new Set(['coleccion']))).toBe('coleccion-2');
  });

  it('bounds the slug length', () => {
    expect(collectionSlug('a'.repeat(120), new Set())).toHaveLength(60);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/collections/collection-slug.spec.ts`
Expected: FAIL — "Cannot find module './collection-slug'".

- [ ] **Step 3: Write `collection-slug.ts`**

```ts
/** Slugs are generated once, at create time, and never follow a rename —
 * shared links must keep working after the owner renames a collection. */
export function collectionSlug(name: string, taken: Set<string>): string {
  const base = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'coleccion';
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 56)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('No free collection slug');
}
```

- [ ] **Step 4: Run the slug test again**

Run: `cd apps/api && npx jest src/collections/collection-slug.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the Prisma models.** In `schema.prisma`, beside `model Category`:

```prisma
// An owner-made grouping of products, like a playlist: a product may sit in
// several. Categories remain the single-choice filter field.
model Collection {
  id        String              @id @default(cuid())
  storeId   String
  store     Store               @relation(fields: [storeId], references: [id], onDelete: Cascade)
  name      String
  // Generated from the name at creation and kept stable across renames so
  // shared /c/<slug> links keep resolving.
  slug      String
  sortOrder Int                 @default(0)
  createdAt DateTime            @default(now())
  updatedAt DateTime            @updatedAt
  products  CollectionProduct[]

  @@unique([storeId, slug])
  @@index([storeId, sortOrder])
}

model CollectionProduct {
  collectionId  String
  collection    Collection  @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  paymentLinkId String
  paymentLink   PaymentLink @relation(fields: [paymentLinkId], references: [id], onDelete: Cascade)
  sortOrder     Int         @default(0)

  @@id([collectionId, paymentLinkId])
  @@index([collectionId, sortOrder])
}
```

Add the back-relations: `collections Collection[]` on `model Store`, and `collectionProducts CollectionProduct[]` on `model PaymentLink`.

- [ ] **Step 6: Write the migration** — `apps/api/prisma/migrations/20260916120000_store_collections/migration.sql`:

```sql
CREATE TABLE "Collection" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CollectionProduct" (
  "collectionId" TEXT NOT NULL,
  "paymentLinkId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("collectionId","paymentLinkId")
);
CREATE UNIQUE INDEX "Collection_storeId_slug_key" ON "Collection"("storeId", "slug");
CREATE INDEX "Collection_storeId_sortOrder_idx" ON "Collection"("storeId", "sortOrder");
CREATE INDEX "CollectionProduct_collectionId_sortOrder_idx" ON "CollectionProduct"("collectionId", "sortOrder");
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionProduct" ADD CONSTRAINT "CollectionProduct_paymentLinkId_fkey" FOREIGN KEY ("paymentLinkId") REFERENCES "PaymentLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Then run `cd apps/api && npx prisma generate`.

- [ ] **Step 7: Write the failing service test** — `apps/api/src/collections/collections.service.spec.ts`. Mirror the arrangement of `apps/api/src/categories/categories.service.spec.ts` (same fake-Prisma style, same `NotFoundException`/`BadRequestException` expectations). Cover:
  - `create` slugifies the name, defaults `sortOrder` to the current count (a new collection goes last, never first), and rejects a 13th collection with "Puedes tener hasta 12 colecciones";
  - `create` on a store the merchant does not own throws `NotFoundException`;
  - `update` changes the name but leaves `slug` untouched;
  - `setProducts` rejects ids that are not `PaymentLink` rows of that store, stores `sortOrder` by array position, replaces the previous membership, and rejects 201 ids with "Una colección puede tener hasta 200 productos";
  - `reorder` requires the exact set of the store's collection ids once each (copy the message style of `CategoriesService.reorder`);
  - `remove` deletes the collection and its memberships, and leaves the products themselves alone.

- [ ] **Step 8: Run it to verify it fails**

Run: `cd apps/api && npx jest src/collections/collections.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 9: Write `collections.service.ts`.** Copy the shape of `apps/api/src/categories/categories.service.ts`: constructor takes `PrismaService`, a private `ownedStoreOrThrow(merchantId, storeId)` guards every method. `create` reads existing slugs (`findMany({ where: { storeId }, select: { slug: true } })`) into a `Set` for `collectionSlug`. `setProducts` runs in `this.prisma.$transaction([deleteMany, createMany])`. Enforce `MAX_COLLECTIONS = 12` and `MAX_COLLECTION_PRODUCTS = 200` as exported consts.

- [ ] **Step 10: Write the DTOs and controller.** DTOs mirror `apps/api/src/categories/dto/`: `name` `@IsString() @Length(1, 60)`, `sortOrder` optional `@IsInt()`, `paymentLinkIds` `@IsArray() @ArrayMaxSize(200) @IsString({ each: true })`, `collectionIds` `@IsArray() @IsString({ each: true })`. The controller mirrors `categories.controller.ts` exactly — same guard and `@Param('storeId')` shape — with routes `POST/GET v1/stores/:storeId/collections`, `PATCH/DELETE v1/stores/:storeId/collections/:id`, `PUT v1/stores/:storeId/collections/:id/products`, `PUT v1/stores/:storeId/collections/order`. Register `CollectionsModule` in `app.module.ts`.

- [ ] **Step 11: Run the tests and the type check**

Run: `cd apps/api && npx jest src/collections src/categories && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma apps/api/src/collections apps/api/src/app.module.ts
git commit -m "$(cat <<'EOF'
Group products into collections owners can reorder

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The arrangement travels in the public catalog

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Store.catalogLayout`); create `apps/api/prisma/migrations/20260916130000_store_catalog_layout/migration.sql`
- Create: `apps/api/src/stores/catalog-layout.ts`
- Modify: `apps/api/src/stores/stores.service.ts:1445` (the `getStorePublic` `Promise.all`) and `:1560` (the returned object), `apps/api/src/stores/dto/update-store.dto.ts`
- Test: `apps/api/src/stores/catalog-layout.spec.ts`, and new cases in `apps/api/src/stores/stores.service.spec.ts`

**Interfaces:**
- Consumes: `Collection`, `CollectionProduct` from Task 1.
- Produces: `CATALOG_LAYOUTS = ['all', 'sections', 'page', 'tabs'] as const`, `type CatalogLayout`, `readCatalogLayout(value: unknown): CatalogLayout`; `getStorePublic` gains `catalogLayout: CatalogLayout` and `collections: { id: string; name: string; slug: string; productIds: string[] }[]`.

- [ ] **Step 1: Write the failing test** — `apps/api/src/stores/catalog-layout.spec.ts`:

```ts
import { readCatalogLayout, CATALOG_LAYOUTS } from './catalog-layout';

describe('readCatalogLayout', () => {
  it('keeps the four known values', () => {
    for (const layout of CATALOG_LAYOUTS) expect(readCatalogLayout(layout)).toBe(layout);
  });

  it('falls back to the single grid for anything else', () => {
    for (const value of [undefined, null, '', 'grid', 7, {}]) expect(readCatalogLayout(value)).toBe('all');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/stores/catalog-layout.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `catalog-layout.ts`**

```ts
export const CATALOG_LAYOUTS = ['all', 'sections', 'page', 'tabs'] as const;
export type CatalogLayout = (typeof CATALOG_LAYOUTS)[number];

/** Anything unrecognized renders today's single grid, so an older row or a
 * bad write can never leave a storefront without its catalog. */
export function readCatalogLayout(value: unknown): CatalogLayout {
  return CATALOG_LAYOUTS.includes(value as CatalogLayout) ? (value as CatalogLayout) : 'all';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest src/stores/catalog-layout.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the column.** In `schema.prisma`, on `model Store`, beside `layoutStyle`:

```prisma
  // How the home page arranges products: all | sections | page | tabs.
  // See docs/CATALOG_ARRANGEMENT.md.
  catalogLayout                String                           @default("all")
```

Migration `20260916130000_store_catalog_layout/migration.sql`:

```sql
ALTER TABLE "Store" ADD COLUMN "catalogLayout" TEXT NOT NULL DEFAULT 'all';
```

Then `npx prisma generate`.

- [ ] **Step 6: Accept it on the store DTO.** In `update-store.dto.ts`, beside `layoutStyle`:

```ts
  @IsOptional()
  @IsIn([...CATALOG_LAYOUTS])
  catalogLayout?: CatalogLayout;
```

- [ ] **Step 7: Publish both in the catalog.** In `stores.service.ts`, add to the `Promise.all` at `:1445`:

```ts
      this.prisma.collection.findMany({
        where: { storeId: store.id },
        orderBy: { sortOrder: 'asc' },
        include: { products: { orderBy: { sortOrder: 'asc' }, select: { paymentLinkId: true } } },
      }),
```

adding `collections` to the destructuring on `:1445` (`const [items, categories, links, productStats, appointmentOfferings, collections] = await Promise.all([...])`, appending the new query last so the existing positions do not shift), and to the returned object, next to `categories:` at `:1560`:

```ts
      catalogLayout: readCatalogLayout(store.catalogLayout),
      collections: collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
        slug: collection.slug,
        // Only products the shopper can actually see travel with the collection.
        productIds: collection.products
          .map((row) => row.paymentLinkId)
          .filter((id) => publicProductIds.has(id)),
      })),
```

(`publicProductIds` already exists at `:1471`.)

- [ ] **Step 8: Add the catalog tests.** In `stores.service.spec.ts`, beside the existing `getStorePublic` cases: a store with one collection holding an active and an archived product returns `collections[0].productIds` with only the active id; and `catalogLayout` is `'all'` for a store that never set it.

- [ ] **Step 9: Run the tests and the type check**

Run: `cd apps/api && npx jest src/stores/catalog-layout.spec.ts src/stores/stores.service.spec.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 10: Commit**

```bash
git add apps/api/prisma apps/api/src/stores
git commit -m "$(cat <<'EOF'
Send the chosen arrangement with the public catalog

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The kit renders sections, and the home page keeps four products

**Files:**
- Modify: `apps/api/src/stores/source-kit/commerce.js` (the `render()` catalog block at `:1107`, the card template at `:1114`, the injected stylesheet at `:147`)
- Test: `apps/merchant-studio/tests/catalog-arrangement.spec.ts` (new)

**Interfaces:**
- Consumes: `store.catalogLayout`, `store.collections` from Task 2.
- Produces: in `commerce.js`, `catalogLayout()`, `collections()`, `collectionGroups(selected)` returning `{ name, slug, items }[]`, `productCard(p)` (the existing card markup extracted verbatim from `:1114`), `productsHref()`, `collectionHref(slug)`, `catalogMore()`. The mount carries `data-catalog-layout="<layout>"`; group headings are `h3.catalog-group__title`; the link is `a.catalog-more[data-catalog-more]`.

- [ ] **Step 1: Write the failing browser test** — `apps/merchant-studio/tests/catalog-arrangement.spec.ts`. Follow `tests/catalog-card-defaults.spec.ts` for the fixture shape (`page.route` serving an index page containing `<div data-pagosya-catalog></div>`, with a `PAGOSYA_CONFIG` whose `data` is the catalog). Assert:
  - `catalogLayout: 'all'` renders one flat list — `[data-pagosya-catalog] .menu-item` has every product and there is no `.catalog-group__title`;
  - `'sections'` renders one `.catalog-group__title` per collection in `sortOrder`, each followed by its own products, and a final "Más productos" group holding exactly the products in no collection;
  - `'sections'` with every product collected renders no "Más productos" group;
  - `'page'` renders exactly 4 `.menu-item` and one `[data-catalog-more]` whose text is "Ver todos los productos" and whose `href` ends in `productos.html`;
  - `'page'` in a store with 3 products renders 3 cards and still renders the link;
  - `'page'` in a store with 0 products renders no cards and still renders the link;
  - `'tabs'` renders a tab row of links (one per collection, reachable by keyboard) above 4 cards and the same link;
  - a card rendered under `'sections'` is identical to the card the same product gets under `'all'` (compare `outerHTML` of the matching `.menu-item`).

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-studio && npx playwright test tests/catalog-arrangement.spec.ts`
Expected: FAIL — no groups, no link.

- [ ] **Step 3: Extract the card.** In `commerce.js`, lift the template literal currently returned inside the `[data-pagosya-catalog]` loop at `:1114` into a `function productCard(p)` defined next to `structureCatalog`, and have the loop call it. Change nothing inside the markup — Step 1's last assertion is what proves this.

- [ ] **Step 4: Add the arrangement helpers**, above `render()`:

```js
  const catalogLayout = () => ['all', 'sections', 'page', 'tabs'].includes(store.catalogLayout) ? store.catalogLayout : 'all';
  const collections = () => Array.isArray(store.collections) ? store.collections : [];
  const HOME_PREVIEW = 4;
  // Collected products keep the owner's order inside each group; whatever is
  // left lands in one final group so nothing becomes unreachable.
  function collectionGroups(selected) {
    const byId = new Map(selected.map((p) => [p.id, p]));
    const groups = collections().map((c) => ({
      name: c.name, slug: c.slug,
      items: (c.productIds || []).map((id) => byId.get(id)).filter(Boolean),
    })).filter((group) => group.items.length);
    const grouped = new Set(groups.flatMap((group) => group.items.map((p) => p.id)));
    const rest = selected.filter((p) => !grouped.has(p.id));
    return rest.length ? [...groups, { name: 'Más productos', slug: '', items: rest }] : groups;
  }
  const productsHref = () => pageHref('productos.html');
  const collectionHref = (slug) => pageHref('coleccion.html', '?c=' + encodeURIComponent(slug));
  const catalogMore = () => `<a class="catalog-more" data-catalog-more href="${escape(productsHref())}">Ver todos los productos</a>`;
```

- [ ] **Step 5: Render the four arrangements.** Replace the body of the `[data-pagosya-catalog]` loop at `:1107` with:

```js
    document.querySelectorAll("[data-pagosya-catalog]").forEach((el) => {
      const selected = products().filter((p) => category === "all" || p.categoryId === category);
      const layout = el.hasAttribute('data-catalog-full') ? 'all' : catalogLayout();
      el.dataset.catalogLayout = layout;
      if (layout === 'sections') {
        const groups = collectionGroups(selected);
        el.innerHTML = groups.length
          ? groups.map((group) => `<section class="catalog-group"><h3 class="catalog-group__title">${escape(group.name)}</h3><div class="catalog-group__items">${group.items.map(productCard).join("")}</div></section>`).join("")
          : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      } else if (layout === 'page' || layout === 'tabs') {
        const tabs = layout === 'tabs' && collections().length
          ? `<nav class="catalog-tabs" aria-label="Colecciones">${collections().map((c) => `<a href="${escape(collectionHref(c.slug))}">${escape(c.name)}</a>`).join("")}</nav>`
          : '';
        el.innerHTML = tabs + selected.slice(0, HOME_PREVIEW).map(productCard).join("") + catalogMore();
      } else {
        el.innerHTML = selected.length ? selected.map(productCard).join("") : '<p class="catalog-empty">No hay productos disponibles en esta categoría.</p>';
      }
      structureCatalog(el);
    });
```

(`data-catalog-full` is the opt-out the products and collection pages set in Task 4, so the same mount renders the whole catalog there.)

- [ ] **Step 6: Add the CSS** to the injected stylesheet near `:152`, using the store's own tokens and no new colors: `.catalog-group__items` reuses the existing `[data-pagosya-grid]` grid rule; `.catalog-group__title` takes the store heading font at 1.05rem with `margin:24px 0 12px`; `.catalog-more` is an inline-block link with 12px vertical padding and `text-decoration:underline`; `.catalog-tabs` is a wrapping flex row with 12px gaps whose `[aria-current="page"]` link is not underlined. Keep every rule inside the existing `[data-pagosya-catalog]` scope.

- [ ] **Step 7: Run the browser tests**

Run: `cd apps/merchant-studio && npx playwright test tests/catalog-arrangement.spec.ts tests/catalog-card-defaults.spec.ts tests/source-catalog.spec.ts tests/commerce-parity.spec.ts`
Expected: PASS — the pre-existing catalog tests are what prove `all` did not change.

- [ ] **Step 8: Look at the screenshots** the tests save; fix anything whose spacing or heading weight does not match the surrounding store styling.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/stores/source-kit/commerce.js apps/merchant-studio/tests/catalog-arrangement.spec.ts
git commit -m "$(cat <<'EOF'
Arrange the home catalog in sections or a four-product preview

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Kit-owned products and collection pages

**Files:**
- Create: `apps/api/src/stores/source-kit/productos.html`, `apps/api/src/stores/source-kit/coleccion.html`
- Modify: `apps/api/src/stores/source-kit/commerce.js` (page detection beside `fullProductPage`, metadata block at `:1118`), `apps/api/src/stores/source-generation.service.ts:96,526`, `apps/api/src/stores/source-runtime.ts:17`, `apps/api/src/stores/source-seo.ts:13,23`
- Test: `apps/api/src/stores/source-commerce-pages.spec.ts` (new cases), `apps/merchant-studio/tests/catalog-arrangement.spec.ts` (extend)

**Interfaces:**
- Consumes: `productCard`, `collectionGroups`, `collections`, `collectionHref` from Task 3.
- Produces: pages `productos.html` (mount `<main data-pagosya-catalog data-catalog-full>`) and `coleccion.html` (mount `<main data-pagosya-catalog data-catalog-full data-collection-page>`), both loading `commerce-pages.css`, `styles.css`, `config.js`, `commerce.js`, `site.js` exactly as `product.html` does. In `commerce.js`: `fullCatalogPage`, `collectionPage`, `currentCollection()`.

- [ ] **Step 1: Write the failing API test.** In `source-commerce-pages.spec.ts`, assert `currentSourceRuntime` adds `productos.html` and `coleccion.html` to a snapshot that has `commerce.js` and `config.js` but not those pages, and leaves an existing `productos.html` untouched.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/stores/source-commerce-pages.spec.ts`
Expected: FAIL — pages missing.

- [ ] **Step 3: Write the two pages.** Copy `source-kit/product.html` and change only the `<title>` and the mount element:
  - `productos.html`: `<title>Productos</title>`, `<main data-pagosya-catalog data-catalog-full></main>`;
  - `coleccion.html`: `<title>Colección</title>`, `<main data-pagosya-catalog data-catalog-full data-collection-page></main>`.

Keep the same header, `commerce-skip` link, order aside, status paragraph and footer, so both pages inherit the store's chrome the way the product page does.

- [ ] **Step 4: Ship them to existing stores.** In `source-runtime.ts`, after the `commerce.js` substitution at `:17`, append `productos.html` and `coleccion.html` (read from `source-kit/`) when the snapshot has a `commerce.js` and lacks those paths — existing stores never regenerate, so without this the arrangement's links would 404. In `source-generation.service.ts:526`, add both to the `useCommercePages` kit file list beside `product.html`; leave the `:96` hook check as it is for those two paths (their mount attribute differs from `data-pagosya-product-page`).

- [ ] **Step 5: Render the collection.** In `commerce.js`, beside the existing `fullProductPage` detection, add:

```js
  const fullCatalogPage = Boolean(document.querySelector('[data-catalog-full]'));
  const collectionPage = Boolean(document.querySelector('[data-collection-page]'));
  const currentCollection = () => {
    const slug = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search).get('c');
    return collections().find((c) => c.slug === slug) || null;
  };
```

In the catalog loop, when `collectionPage` and `currentCollection()` resolves, render only that collection's products under its name as the heading; when the slug is unknown or missing, render the whole catalog — an unknown collection link must show products, never an error.

The collection page also renders the tab row above its products (spec §4: "a tab row of real links; the current tab's products fill the mount"), with `aria-current="page"` on the current collection's link — this is the only place `aria-current` is ever set, since no tab is current on the home page. Extract the tab row from Task 3's loop into a `catalogTabs(currentSlug)` helper both call, rather than writing the markup twice.

- [ ] **Step 6: Set each page's title and canonical.** Extend the metadata block at `:1118` so `fullCatalogPage` sets `document.title` to `Productos · <store>` (or `<collection> · <store>`) and points `link[rel=canonical]`, `og:url` and `og:title` at `/s/<slug>/productos` or `/s/<slug>/c/<slug>`, reusing the `publicSiteUrl` expression already there. In `source-seo.ts`, treat `productos.html` and `coleccion.html` as ordinary public pages (not like `checkout.html`), so they stay indexable and keep their own canonical.

- [ ] **Step 7: Extend the browser test** with: `productos.html` renders every product and no preview link; `coleccion.html?c=verano` renders only that collection's products under its name; `coleccion.html?c=desconocida` renders the whole catalog; both pages' cards are identical to the home page's.

- [ ] **Step 8: Run both suites**

Run: `cd apps/api && npx jest src/stores/source-commerce-pages.spec.ts src/stores/source-runtime.spec.ts && npx tsc --noEmit` then `cd apps/merchant-studio && npx playwright test tests/catalog-arrangement.spec.ts tests/source-pages.spec.ts`
Expected: PASS, clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/stores apps/merchant-studio/tests/catalog-arrangement.spec.ts
git commit -m "$(cat <<'EOF'
Give every store a products page and a page per collection

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Hosted routes for the new pages

**Files:**
- Modify: `apps/checkout/src/source-storefront.ts:18-20,40-41,60-69,86,137`, `apps/checkout/src/main.ts:560-579` (`storefrontRouteFromPathname`, which already parses `/c/<id>` as a category)
- Test: the checkout Vitest suite — extend the existing `source-storefront` spec, or create `apps/checkout/src/source-storefront.spec.ts` beside its neighbours

**Interfaces:**
- Consumes: the pages from Task 4, and `store.collections` from Task 2.
- Produces: `/s/<slug>/productos` → `productos.html`; `/s/<slug>/c/<collection>` → `coleccion.html?c=<collection>`; the same paths on custom domains as `/productos` and `/c/<collection>`. `StorefrontRoute` gains `collectionSlug: string | null`.

**Route precedence — the one thing to get right here.** `/s/<slug>/c/<x>` is *already* the category route (`main.ts:563`, and `:566` for custom domains), and per the spec `<x>` must resolve as a collection slug **first**, falling back to a category id so older links keep working. Resolution needs the catalog, which the route parser does not have, so the parser keeps returning the raw segment and the caller decides: if `store.collections` contains a matching `slug`, mount `coleccion.html`; otherwise treat it as `categoryId` exactly as today.

- [ ] **Step 1: Write the failing test.** Following the existing `source-storefront` cases: a `location.pathname` of `/s/tienda/productos` mounts `productos.html`; `/s/tienda/c/verano`, where `verano` is a collection slug, mounts `coleccion.html` with `c=verano` in the navigation query; `/s/tienda/c/cat_123`, where that is a category id and no collection has that slug, keeps today's category behavior and does **not** mount `coleccion.html`; a collection slug that also equals a category id resolves as the collection; a custom-domain `/productos` behaves like `/s/tienda/productos` with the `home` prefix `/`; navigating back to `index.html` restores `/s/tienda`; and the URL written by `history.replaceState` for a collection is `/s/tienda/c/verano`, not `?source_page=`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/checkout && npm test -- source-storefront`
Expected: FAIL.

- [ ] **Step 3: Read the route on mount.** In `source-storefront.ts`, beside the existing `productRoute` regex at `:18`:

```ts
  const catalogRoute = /\/productos\/?$/.test(location.pathname);
  const collectionRoute = /\/c\/([^/]+)\/?$/.exec(location.pathname)?.[1];
```

Resolve `collectionRoute` against the catalog before using it — `const collection = collectionRoute && (store as { collections?: { slug: string }[] }).collections?.some(c => c.slug === decodeURIComponent(collectionRoute)) ? decodeURIComponent(collectionRoute) : null;` — so a `/c/<categoryId>` link falls through to today's category handling untouched. Seed `initialQuery` with `c` only when `collection` is set, and extend the `show(...)` call at `:137` to pick `productos.html` / `coleccion.html` when that file exists in `prepared.files`, before the `requestedPage` fallback.

- [ ] **Step 4: Write the route back.** In the navigation branch at `:60-65`, beside `product`:

```ts
        const collection = next.page === 'coleccion.html' ? params.get('c') : null;
        const catalogPage = next.page === 'productos.html';
```

Set `destination.pathname` to `${home}/productos` or `${home}/c/<collection>` (each `encodeURIComponent`'d), and delete `c` from the search params — these pages get real shareable URLs instead of `?source_page=`.

- [ ] **Step 5: Allow the links to navigate.** In the `pagosya:source-external` handler at `:86`, allow same-origin URLs whose pathname equals `/s/<slug>/productos` or matches `/s/<slug>/c/<segment>`, alongside the existing product check.

- [ ] **Step 6: Run the checkout suite and the type check**

Run: `cd apps/checkout && npm test && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/checkout/src
git commit -m "$(cat <<'EOF'
Serve the products and collection pages at their own links

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The Studio panel "Cómo se ven tus productos"

**Files:**
- Create: `apps/merchant-studio/src/catalog-arrangement.ts`
- Modify: `apps/merchant-studio/src/api.ts`, `apps/merchant-studio/src/source-studio.ts:414,541` (button + handler in the "Configuración" section)
- Test: `apps/merchant-studio/tests/catalog-arrangement-panel.spec.ts` (new)

**Interfaces:**
- Consumes: the Task 1 routes and the Task 2 `catalogLayout` field.
- Produces: `openCatalogArrangement(api: MerchantStudioApi, storeId: string, onSaved?: () => void)`; on `MerchantStudioApi`: `collections(storeId)`, `createCollection(storeId, name)`, `renameCollection(storeId, id, name)`, `deleteCollection(storeId, id)`, `setCollectionProducts(storeId, id, paymentLinkIds)`, `reorderCollections(storeId, ids)`, `saveCatalogLayout(storeId, layout)`.

- [ ] **Step 1: Write the failing test** — `apps/merchant-studio/tests/catalog-arrangement-panel.spec.ts`, following `tests/retention.spec.ts` for how a panel is opened against a stubbed API. Assert: the four arrangements appear as radio options with the saved one checked; choosing one and saving sends `catalogLayout`; creating a collection sends the name and lists it; a product can be added to two collections and the second add does not remove the first; removing a product updates the list; reordering sends the full id array; a save failure shows its message and keeps the form values.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-studio && npx playwright test tests/catalog-arrangement-panel.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the API methods** to `api.ts`, following the existing `shippingSettings` / `saveShippingSettings` pair for the request helper, path shape and error handling.

- [ ] **Step 4: Write the panel.** Copy the structure of `src/shipping-settings.ts`: a `dialog.brand-dialog`, `let state/busy/message`, the `run(task)` wrapper with `preserveDialogForms`, one `render()` that rewrites `dialog.innerHTML` and rebinds handlers. Contents:
  - a `<fieldset>` of four radios with the spec's Spanish names and one explanatory line each ("Todo en la portada", "Por secciones", "Página de productos aparte", "Una pestaña por colección");
  - a collections list with rename, delete and ↑/↓ buttons calling `reorderCollections`;
  - per collection, a checkbox list of the store's products saved with `setCollectionProducts`;
  - a line stating the limits (12 collections, 200 products) and that uncollected products show under "Más productos".

- [ ] **Step 5: Wire it into Studio.** In `source-studio.ts:414`, add `<button id="source-arrangement" ${unavailable}>Cómo se ven tus productos</button>` to the "Configuración" section, and at `:541` the click handler calling `openCatalogArrangement`, copying the `embedded` branch of the neighbouring shipping handler exactly.

- [ ] **Step 6: Run the Studio tests and the type check**

Run: `cd apps/merchant-studio && npx playwright test tests/catalog-arrangement-panel.spec.ts tests/source-studio.spec.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add apps/merchant-studio/src apps/merchant-studio/tests/catalog-arrangement-panel.spec.ts
git commit -m "$(cat <<'EOF'
Let owners arrange products and build collections in Studio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: YAPI applies arrangement requests from chat

**Files:**
- Create: `apps/api/src/stores/catalog-arrangement-intent.ts`
- Modify: `apps/api/src/stores/store-agent.service.ts` (before the redesign and editor-command branches)
- Test: `apps/api/src/stores/catalog-arrangement-intent.spec.ts`, plus a case in `apps/api/src/stores/store-agent.service.spec.ts`

**Interfaces:**
- Consumes: `CATALOG_LAYOUTS` (Task 2) and `requestsStoreRedesign` from `store-agent-intent.ts`.
- Produces: `catalogArrangementIntent(instruction: string): { layout: CatalogLayout } | null`.

- [ ] **Step 1: Write the failing test** — `catalog-arrangement-intent.spec.ts`:

```ts
import { catalogArrangementIntent } from './catalog-arrangement-intent';

describe('catalogArrangementIntent', () => {
  it('recognizes each arrangement', () => {
    expect(catalogArrangementIntent('ponlo en secciones')).toEqual({ layout: 'sections' });
    expect(catalogArrangementIntent('quiero una pestaña por colección')).toEqual({ layout: 'tabs' });
    expect(catalogArrangementIntent('pon los productos en una página aparte')).toEqual({ layout: 'page' });
    expect(catalogArrangementIntent('muestra todo en la portada')).toEqual({ layout: 'all' });
  });

  it('ignores anything else', () => {
    for (const text of ['cambia el color del botón', 'crea una sección de historia', 'rehaz mi tienda']) {
      expect(catalogArrangementIntent(text)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/stores/catalog-arrangement-intent.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the recognizer**, normalizing accents the way `normalizeAgentInstruction` does in `store-agent.service.ts:27`. **Match arrangement-shaped phrases, never a bare noun** — "crea una sección de historia" contains "seccion" and must still return `null`, as its own test case asserts. Require the preposition that makes it an arrangement: `(en|por) seccion(es)` → `sections`; `(una )?pestana( |s)?.{0,12}(por )?coleccion` or `en pestanas` → `tabs`; `pagina (aparte|de productos|separada)` → `page`; `todo en (la )?portada` → `all`. Return `null` when `requestsStoreRedesign(instruction)` is true, so a full-site brief still reaches the compositor.

- [ ] **Step 4: Apply it as a saved change.** In `StoreAgentService`, before the existing redesign and editor-command branches, when `catalogArrangementIntent` matches: write `catalogLayout` on the store and reply in Spanish naming the arrangement and saying it can be undone from "Cómo se ven tus productos". No credits are spent and no design job is created — assert both in the service test.

- [ ] **Step 5: Run the tests and the type check**

Run: `cd apps/api && npx jest src/stores/catalog-arrangement-intent.spec.ts src/stores/store-agent.service.spec.ts && npx tsc --noEmit`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/stores
git commit -m "$(cat <<'EOF'
Let owners rearrange their catalog by asking YAPI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Evidence and documentation

- [ ] **Step 1:** Against the local database, set one benchmark store to each arrangement in turn through the API, and load its storefront at 1280×844 and 390×844. Confirm by eye: the four-product preview and its link, a sections store's headings, a tab row, and a collection page.
- [ ] **Step 2:** Update `docs/CATALOG_ARRANGEMENT.md` — status to implemented, recording anything that changed during the build.
- [ ] **Step 3:** Run the full suites: `cd apps/api && npx jest -w 4`, `cd apps/merchant-studio && npx playwright test`, `cd apps/checkout && npm test`, plus `npx tsc --noEmit` in each.
- [ ] **Step 4:** Commit and push.
