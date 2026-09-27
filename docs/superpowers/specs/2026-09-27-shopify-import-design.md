# Shopify import — design

Date: 2026-09-27. Status: approved by the owner in conversation, section by section ("haz lo de traer de shopify a
pagosYa"; flow, data mapping, YAPI and errors/security each answered "si" / "bien así"). Waiting for review of this
written spec.

## 0. Why

Bolivian merchants on Shopify pay the plan (US$39/month on Basic) **plus a 2% third-party transaction fee on every
sale**, because Shopify Payments is not available in Bolivia, plus their gateway's fee, plus any design app (Clyro and
the like). pagosYa already is the store, the AI designer (YAPI) and the payment gateway. This feature makes the move
take minutes: paste the Shopify address, review, import, pick a look. It complements (does not replace) a future
Shopify payments app, which serves merchants who stay on Shopify.

Success: a merchant with a typical public Shopify store (tens of products, a few collections and pages) ends with a
draft pagosYa store holding every product, variant, price, photo, collection, page and redirect, and a designed site,
without spending credits and without us duplicating anything if they import again.

## 1. Merchant flow

Entry: **"Traer mi tienda de Shopify"** in *Mis tiendas* next to *Crear tienda*, and as an option inside store
creation. **An import always creates a new pagosYa store** (named after the Shopify store); a re-import of the
same Shopify host updates that store. pagosYa has no draft state for stores or products (`ACTIVE`/`ARCHIVED` only),
so importing into an already-live store would show half-reviewed products to its buyers at once; a fresh store is
not linked from anywhere until the merchant publishes its design or connects a domain.

1. **Paste the address** (`mitienda.com` or `mitienda.myshopify.com`). We confirm it is Shopify by reading its
   public catalog. Not Shopify → "Esa dirección no es una tienda Shopify". Password-protected or catalog hidden →
   "Tu tienda está protegida. Exporta tus productos desde Shopify (Productos → Exportar) y sube el CSV aquí", with
   a help link. The CSV path is always available as a fallback and to supply exact stock.
2. **Review before anything is created**: counts ("48 productos · 112 variantes · 6 colecciones · 3 páginas ·
   4 políticas · 210 fotos"), a product list (photo, name, price) where products can be unchecked, and concrete
   warnings ("2 productos sin precio", "El stock no es público en Shopify: súbelo con el CSV o queda en 'sin
   límite'", truncation notices). A USD store shows "1 USD = __ Bs" (required; prices are converted and rounded to
   centavos). What is never imported is stated: customers, orders, discounts, Shopify apps, exact stock without CSV.
3. **Import** with real progress: copying photos (the slow part), creating products, collections, pages, redirects.
4. **Choose the look** (three cards): *Igual que mi Shopify*, *Rediseño con mi marca* (both "Gratis la primera
   vez"), *Elegir plantilla* (opens Plantillas; no AI, instant).
5. **Done**: preview of the new store and a checklist — connect your domain (guide to repoint DNS away from
   Shopify, using the existing domains module), review stock, set up shipping, and "No canceles Shopify hasta que tu
   dominio apunte aquí".

Rules: nothing is published automatically — the generated design waits for the existing "Publicar este diseño"
step, and the domain is only moved by the merchant. Importing the same Shopify store again never duplicates: known
items are offered as "actualizar precios y fotos".

## 2. Data mapping

Sources (all through the safe fetcher, §4): `/products.json?limit=250&page=N`, `/collections.json`,
`/collections/<handle>/products.json`, the shop's public metadata for name and currency (falling back to the
currency the storefront HTML declares), `sitemap.xml` (pages sitemap) plus each page's HTML for pages, and the
public policy pages (`/policies/*`). The exact public endpoints and response shapes are verified against a live
store during implementation and recorded as test fixtures.

| Shopify | pagosYa | Rule |
|---|---|---|
| Product title, description, tags | `PaymentLink` name, description, tags | `body_html` → clean text with paragraphs; no HTML stored. |
| `product_type` | `Category` | Reuse a same-named category if present. |
| Variants (up to 3 options) | `variants` JSON `[{ id, name, amount, stock }]` | Name = option values joined with " / ". Single default variant → no variants, product amount. |
| `price` / `compare_at_price` | `amount` / `discountPercent` | compare_at > price → discount percent (rounded, 1–99). Amounts in centavos. |
| `available` | `stock` | Unavailable → 0; available → null (unlimited). CSV supplies exact quantities. |
| `grams` | `shippingWeightGrams` | First variant's weight. |
| Images | `imageUrls` (copied to our uploads) | Order kept. Never hotlinked: Shopify's CDN disappears when the account closes. Variant images are not mapped in v1. |
| Collection | `Collection` + `CollectionProduct` | `slug` = Shopify `handle` (deduplicated), products in Shopify order. |
| Pages, policies | `StoreArticle` | **Unpublished drafts** (`publishedAt` null); policies are legal text the merchant must review. |
| `/products/<h>`, `/collections/<h>`, `/pages/<h>`, `/policies/<h>` | `StoreRedirect` to the pagosYa equivalent | Created through the same validation `StorePagesService` applies (loop checks). Effective once the domain points to pagosYa. |
| SKU | `StoreImportLink.sku` | Kept for future inventory sync; not written to `codigoProducto` (that is the SIN tax code). |

New models:

- `StoreImport` — `{ id, storeId?, merchantId, source: 'SHOPIFY_URL' | 'SHOPIFY_CSV', sourceHost, status
  (REVIEW, QUEUED, RUNNING, COMPLETED, FAILED), exchangeRate?, selection Json (excluded external ids), preview Json,
  progress Json, summary Json (counts + warnings), error?, attempts, createdAt, updatedAt, completedAt? }`.
  The preview is stored so confirming imports exactly what was reviewed; `storeId` is set when confirming creates
  (or re-import finds) the store.
- `StoreImportLink` — `{ storeId, sourceHost, kind (PRODUCT, COLLECTION, ARTICLE), externalId, localId, sku?,
  updatedAt }`, unique `(storeId, sourceHost, kind, externalId)`. This makes re-import and retry idempotent.

v1 limits: 1,000 products and 3,000 photos per import, 10 MB per photo. Larger stores import the first 1,000
products and say so. Redirects are unbounded in storage; the existing redirects list shows the first 500.

## 3. YAPI and the free build

Before YAPI: the brand profile (logo, colors, fonts, tone) is filled from the Shopify storefront with the existing
`brand/` import, so every option starts from the merchant's real identity.

- **Igual que mi Shopify** — `captureSourceReference` takes 2–4 captures (home desktop + mobile, one product page)
  and passes them as `referenceCaptures`; the instruction asks YAPI to recreate the structure, style and home copy
  in our code using the already-copied photos.
- **Rediseño con mi marca** — a new design from the brand profile and catalog (`redesign: true`); the captures are
  context about the business, not something to copy.
- **Elegir plantilla** — the existing Plantillas flow; no AI.

Free build rules:

- **One free build per merchant**, not per import: `Merchant.importBuildUsedAt DateTime?`, set when a sponsored
  build is saved.
  Re-importing or importing more stores does not grant more.
- A failed sponsored build does not count; **one more free retry**. After a second failure, offer Plantillas.
- **Internal cap 150 credits (US$1.50) on Terra** (`gpt-5.6-terra`, half of Sol). Reaching the cap with a clean
  draft keeps the draft (existing agent behavior).
- The merchant spends nothing (`execution.free`, which already records 0 credits). The run is marked
  **sponsored by import** in its generation record so the owner can report acquisition cost per Shopify merchant.
- Later YAPI requests use normal credits.
- Progress shows the same YAPI steps as *Diseñar sitio*; the merchant may leave the page and is notified in the
  dashboard when it finishes.

## 4. Architecture, errors, security, testing

Module `apps/api/src/store-import/`:

- `shopify-reader.ts` — reads and validates Shopify's public data (pagination, sitemap, policies) into a neutral
  `ShopifyStoreData` shape. No database access.
- `shopify-csv.ts` — parses Shopify's product export CSV into the same shape (stock included).
- `shopify-mapping.ts` — pure functions from `ShopifyStoreData` (+ exchange rate, selection) to pagosYa records per
  §2. Most of the tests live here.
- `store-import.service.ts` — preview, confirm, retry, re-import; ownership checks.
- `store-import.worker.ts` — background runner following `SourceDesignJobWorker` (`@Interval` + claim one job).
- Controller routes under the store: create preview (URL or CSV), get import, confirm (exchange rate, selection),
  retry, start design (option).
- Photos are stored with `UploadsService.saveBuffer`.

Order of work in a run: copy every photo first (per-photo failures become warnings), then create products,
collections, articles and redirects **in one transaction**, recording `StoreImportLink`s. A failure leaves the
import FAILED with "Reintentar"; retry skips what the links say already exists. Never a half-created store.

Merchant-facing errors (Spanish, concrete): not a Shopify store; protected store → CSV; Shopify did not respond, try
again in a few minutes; N photos could not be copied (warning, products created without them); store larger than the
limit (truncation notice).

Security:

- Every external request goes through the existing safe fetcher (`brand/brand-import.ts`): public HTTPS only,
  DNS-pinned, private ranges blocked, size and time limits per request. Redirects (`mitienda.com` →
  `www.mitienda.com` or `*.myshopify.com`) are followed manually, at most 3 hops, each hop re-validated through
  the same fetcher and kept on HTTPS.
- Photos only from `cdn.shopify.com` or the store's own host, only JPEG/PNG/WebP/GIF, validated by content
  (magic bytes), not extension.
- Descriptions and pages are converted to text; Shopify HTML is never stored or rendered as HTML.
- Rate limit: 5 imports per merchant per hour.
- Only the owning merchant can see, confirm or re-import an import. Shopify ownership is not verified (the data is
  public); the result is a new unpublished-design store, and the domain needs the existing DNS verification.

Testing:

- Mapping: unit tests over recorded real Shopify JSON fixtures (variants, discounts, sold out, odd HTML, USD).
- Reader and CSV: mocked responses (password page, pagination, non-Shopify site, huge or foreign-host photo);
  no network in tests.
- Service + worker: integration test against a temporary database. **Never** `prisma migrate reset/diff` on the dev
  database (it was wiped on 2026-09-25); schema changes go through a new migration only.
- One live run against a public Shopify store before showing the owner.

Out of scope for v1: continuous sync with Shopify, customers and orders via OAuth, variant images, the Shopify
payments app (separate project once Shopify approves the payment method).
