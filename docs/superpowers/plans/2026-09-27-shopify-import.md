# Shopify Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant pastes a Shopify address (or uploads Shopify's product CSV), reviews what will come over, and gets a new pagosYa store with its products, variants, photos, collections, pages, policies and old-link redirects, plus one free YAPI build ("igual que mi Shopify" or "rediseño con mi marca").

**Architecture:** A new Nest module `apps/api/src/store-import/` split into pure units (safe public fetcher, Shopify reader, CSV parser, mapping, photo copier, database writer) behind a service, a controller and an `@Interval` worker that claims queued imports and queued design builds. The storefront server (`apps/checkout/storefront-seo.mjs`) gains a lookup so Shopify-style paths on a custom domain 301 to their pagosYa equivalents. The dashboard gets a "Traer mi tienda de Shopify" dialog driven by pure helpers in `apps/merchant-dashboard/src/store-import.mjs`.

**Tech Stack:** NestJS 10 + Prisma 5 (Postgres), Jest (API), node:test (dashboard, storefront server), plain browser JS dashboard.

**Spec:** `docs/superpowers/specs/2026-09-27-shopify-import-design.md`

## Global Constraints

- Every external request goes through the safe fetcher: public HTTPS only, DNS-pinned, private ranges blocked (`publicBrandUrl` / `publicBrandAddresses` from `apps/api/src/brand/brand-import.ts`), at most 3 redirect hops each re-validated, per-request size and time limits.
- Photos only from `cdn.shopify.com` or the store's own host; only JPEG/PNG/WebP/GIF validated by content (`UploadsService.saveBuffer` already checks magic bytes); at most 10 MB each.
- Shopify HTML is never stored or rendered as HTML: descriptions and pages become plain text.
- v1 limits: 1,000 products, 3,000 photos per import; redirects respect the existing 500-per-store cap.
- An import always creates a new store; re-importing the same Shopify host updates that store (idempotent through `StoreImportLink`).
- Pages and policies are imported unpublished (`publishedAt: null`).
- Free build: one per merchant (`Merchant.importBuildUsedAt`), one extra retry after a failure, model `gpt-5.6-terra`, internal cap 150 credits, generation marked `sponsor: 'shopify-import'`.
- Rate limit: 5 import previews per merchant per hour.
- Merchant-facing text is Spanish and concrete; code, comments and commits in English.
- **Never run `prisma migrate dev`, `migrate reset` or `migrate diff` against the dev database** (it was wiped on 2026-09-25). Migrations are generated from two schema files with no database and applied with `prisma migrate deploy` by the main session only; subagents do not touch the dev database.

## Review Focus

- A Shopify store on its custom domain that redirects `mitienda.com` → `www.mitienda.com` → must be followed (≤3 hops) and still read; tested in Task 2 and Task 3.
- A password-protected store (products endpoint redirects to `/password`) → the merchant is told to upload the CSV, not "not Shopify"; tested in Task 3.
- A product whose variants fail pagosYa's variant rules (duplicate option names, more than 256 combinations) → that product is skipped with a named warning and the rest import; tested in Task 5.
- Re-importing the same store after changing prices → prices and photos update, nothing duplicates, variant ids are kept by name so open carts keep working; tested in Task 7.
- A store priced in EUR/USD confirmed without an exchange rate → rejected before anything is written; tested in Task 8.

---

### Task 1: Schema, migration and spec touch-up

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `Merchant` ~240, `Store` ~660, `StoreSourceGeneration` 1238; new models at the end of the file)
- Create: `apps/api/prisma/migrations/20260927120000_store_import/migration.sql` (generated)
- Modify: `docs/superpowers/specs/2026-09-27-shopify-import-design.md` §2

**Interfaces:**
- Produces: Prisma models `StoreImport`, `StoreImportLink`; fields `Merchant.importBuildUsedAt`, `StoreSourceGeneration.sponsor`.

- [ ] **Step 1: Save the current schema for diffing**

```bash
cd apps/api && git show HEAD:apps/api/prisma/schema.prisma > /tmp/schema-before-import.prisma
```

- [ ] **Step 2: Add the models**

Append to `apps/api/prisma/schema.prisma`:

```prisma
// Shopify → pagosYa import (spec 2026-09-27). One row per preview; confirming queues it for the worker.
model StoreImport {
  id                String    @id @default(cuid())
  merchantId        String
  merchant          Merchant  @relation(fields: [merchantId], references: [id], onDelete: Cascade)
  storeId           String?
  store             Store?    @relation(fields: [storeId], references: [id], onDelete: SetNull)
  source            String // SHOPIFY_URL | SHOPIFY_CSV
  sourceHost        String
  status            String    @default("REVIEW") // REVIEW | QUEUED | RUNNING | COMPLETED | FAILED
  data              Json // ShopifyStoreData exactly as read at preview time
  preview           Json // ImportPreview shown to the merchant
  exchangeRateMilli Int? // Bs per 1 unit of the Shopify currency × 1000; required unless BOB
  excluded          String[]  @default([])
  photos            Json      @default("{}") // source URL → /v1/uploads/... (checkpoint for retries)
  progress          Json      @default("{}")
  summary           Json?
  error             String?
  attempts          Int       @default(0)
  leaseToken        String?
  leaseUntil        DateTime?
  designOption      String? // same | redesign
  designStatus      String? // QUEUED | RUNNING | COMPLETED | FAILED
  designTries       Int       @default(0)
  designRevision    Int?
  designError       String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  completedAt       DateTime?

  @@index([merchantId, createdAt])
  @@index([status, updatedAt])
  @@index([designStatus, updatedAt])
}

// Which pagosYa row came from which Shopify item: makes re-import and retry idempotent.
model StoreImportLink {
  storeId    String
  store      Store    @relation(fields: [storeId], references: [id], onDelete: Cascade)
  sourceHost String
  kind       String // PRODUCT | COLLECTION | ARTICLE
  externalId String // Shopify handle (products, collections) or page:/policy:<handle>
  localId    String
  skus       String[] @default([])
  updatedAt  DateTime @updatedAt

  @@id([storeId, sourceHost, kind, externalId])
}
```

Add to `model Merchant`: `importBuildUsedAt DateTime?` and `storeImports StoreImport[]`.
Add to `model Store`: `imports StoreImport[]` and `importLinks StoreImportLink[]`.
Add to `model StoreSourceGeneration`: `sponsor String?` (e.g. `shopify-import`; null = paid by the merchant).

- [ ] **Step 3: Generate the migration SQL without any database**

```bash
cd apps/api && mkdir -p prisma/migrations/20260927120000_store_import && npx prisma migrate diff --from-schema-datamodel /tmp/schema-before-import.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20260927120000_store_import/migration.sql && cat prisma/migrations/20260927120000_store_import/migration.sql
```

Expected: `CREATE TABLE "StoreImport"`, `CREATE TABLE "StoreImportLink"`, `ALTER TABLE "Merchant" ADD COLUMN "importBuildUsedAt"`, `ALTER TABLE "StoreSourceGeneration" ADD COLUMN "sponsor"`, foreign keys and indexes. Nothing else (no DROP). If anything else appears, stop: the schema drifted. (Diffing two schema files touches no database.)

- [ ] **Step 4: Generate the client and apply (main session only)**

```bash
cd apps/api && npx prisma generate && npx prisma migrate deploy
```

Expected: `1 migration applied` (only `20260927120000_store_import`). `migrate deploy` applies pending migrations and never resets.

- [ ] **Step 5: Update the spec to what verification found**

In §2 of the spec replace the Sources paragraph and the redirect row:

```markdown
Sources (verified 2026-09-27 against peakclyro.myshopify.com and allbirds.com; all through the safe fetcher, §4):
`/meta.json` (name, currency, `myshopify_domain` proves it is Shopify), `/products.json?limit=250&page=N`,
`/collections.json?limit=250`, `/collections/<handle>/products.json?limit=250&page=N`, `/pages.json?limit=250`
(title + `body_html`), `/policies/<refund-policy|shipping-policy|privacy-policy|terms-of-service>.json`
(`{ policy: { title, body, handle } }`, empty body = not set). A password-protected store answers the products
endpoint with a redirect to `/password`.
```

```markdown
| `/products/<h>`, `/collections/<h>`, `/collections/<c>/products/<h>` | `StoreRedirect` to `/p/<id>` and `/c/<slug>` | Today `StoreRedirect` only serves article paths; the storefront server gains a lookup for these Shopify paths on custom domains (plan Task 9). Written up to the existing 500-per-store cap, collections first; the rest is a warning. Pages/policies keep no redirect in v1 (they import unpublished). |
```

In the Images row, replace "Variant images are not mapped in v1." with "Variant images map to the variant's `imageUrl` (pagosYa variants carry one)." and drop "variant images" from "Out of scope".

Also in §3, replace the "Before YAPI: the brand profile … is filled" paragraph and the "notified in the dashboard" clause, and extend "Out of scope for v1":

```markdown
Before YAPI: v1 gives YAPI the store name, the product and collection names and the captures of the Shopify store;
it does not run the separate brand-profile analysis (another paid AI call) — out of scope for v1.
```

```markdown
Out of scope for v1: continuous sync with Shopify, customers and orders via OAuth, automatic brand-profile analysis,
a dashboard notification when the free build finishes (the import dialog shows it when reopened), the Shopify
payments app (separate project once Shopify approves the payment method).
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260927120000_store_import docs/superpowers/specs/2026-09-27-shopify-import-design.md
git commit -m "feat(store-import): schema for Shopify imports — StoreImport, StoreImportLink, the merchant's free import build and sponsored generations"
```

---

### Task 2: Safe public fetcher with redirects

**Files:**
- Create: `apps/api/src/store-import/public-fetch.ts`
- Test: `apps/api/src/store-import/public-fetch.spec.ts`

**Interfaces:**
- Consumes: `publicBrandUrl(raw: string): URL`, `publicBrandAddresses(url: URL): Promise<{ address: string }[]>` from `../brand/brand-import`.
- Produces:
  - `type PublicResponse = { status: number; url: URL; contentType: string; body: Buffer }`
  - `type PublicTransport = (url: URL, address: string, limits: { accept: string; maxBytes: number; timeoutMs: number }) => Promise<{ status: number; contentType: string; location?: string; body: Buffer }>`
  - `fetchPublic(raw: string | URL, options: { accept: string; maxBytes: number; timeoutMs?: number; maxRedirects?: number }, deps?: { resolve?: typeof publicBrandAddresses; transport?: PublicTransport }): Promise<PublicResponse>`
  - `class PublicFetchError extends Error { code: 'blocked' | 'too_large' | 'unreachable' | 'too_many_redirects' }`

- [ ] **Step 1: Write the failing tests**

```ts
import { fetchPublic, PublicFetchError, type PublicTransport } from './public-fetch';

const resolve = jest.fn(async () => [{ address: '23.227.38.65', family: 4 }]) as any;
const reply = (status: number, extra: Partial<{ contentType: string; location: string; body: string }> = {}) =>
  ({ status, contentType: extra.contentType ?? 'application/json', location: extra.location, body: Buffer.from(extra.body ?? '{}') });

describe('fetchPublic', () => {
  beforeEach(() => resolve.mockClear());

  it('follows up to three redirects, re-validating each hop, and returns the final URL', async () => {
    const transport: PublicTransport = jest.fn()
      .mockResolvedValueOnce(reply(301, { location: 'https://www.shop.example/meta.json' }))
      .mockResolvedValueOnce(reply(302, { location: '/meta.json?x=1' }))
      .mockResolvedValueOnce(reply(200, { body: '{"ok":true}' }));
    const response = await fetchPublic('https://shop.example/meta.json', { accept: 'application/json', maxBytes: 1000 }, { resolve, transport });
    expect(response.url.href).toBe('https://www.shop.example/meta.json?x=1');
    expect(JSON.parse(response.body.toString())).toEqual({ ok: true });
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('refuses a fourth redirect and any redirect to http or a private address', async () => {
    const loop: PublicTransport = jest.fn(async () => reply(302, { location: 'https://shop.example/again' }));
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: loop })).rejects.toMatchObject({ code: 'too_many_redirects' });
    const toHttp: PublicTransport = jest.fn(async () => reply(301, { location: 'http://shop.example/' }));
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: toHttp })).rejects.toMatchObject({ code: 'blocked' });
    const privateResolve = jest.fn(async () => { throw new Error('private'); }) as any;
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve: privateResolve, transport: loop })).rejects.toMatchObject({ code: 'blocked' });
  });

  it('turns a transport failure into unreachable', async () => {
    const broken: PublicTransport = jest.fn(async () => { throw new Error('ECONNRESET'); });
    await expect(fetchPublic('https://shop.example/', { accept: '*/*', maxBytes: 10 }, { resolve, transport: broken })).rejects.toBeInstanceOf(PublicFetchError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/public-fetch.spec.ts`
Expected: FAIL — `Cannot find module './public-fetch'`.

- [ ] **Step 3: Implement**

```ts
import { request } from 'node:https';
import { publicBrandAddresses, publicBrandUrl } from '../brand/brand-import';

export type PublicResponse = { status: number; url: URL; contentType: string; body: Buffer };
export type PublicTransport = (url: URL, address: string, limits: { accept: string; maxBytes: number; timeoutMs: number }) => Promise<{ status: number; contentType: string; location?: string; body: Buffer }>;
export class PublicFetchError extends Error {
  constructor(readonly code: 'blocked' | 'too_large' | 'unreachable' | 'too_many_redirects', message: string) { super(message); }
}

/** IPv4-only HTTPS GET pinned to an address that was already checked; no cookies, no automatic redirects. */
export const httpsTransport: PublicTransport = (url, address, limits) => new Promise((resolve, reject) => {
  const req = request(url, { method: 'GET', family: 4, headers: { 'User-Agent': 'PagosYa-StoreImport/1.0', Accept: limits.accept, 'Accept-Encoding': 'identity' },
    lookup: ((_host: string, _options: unknown, callback: any) => callback(null, address, 4)) as any,
  }, res => {
    const status = res.statusCode ?? 0;
    const location = typeof res.headers.location === 'string' ? res.headers.location : undefined;
    const parts: Buffer[] = []; let size = 0;
    res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limits.maxBytes) req.destroy(new PublicFetchError('too_large', 'Response too large')); else parts.push(chunk); });
    res.on('end', () => resolve({ status, contentType: String(res.headers['content-type'] || ''), location, body: Buffer.concat(parts) }));
    res.on('error', reject);
  });
  const timer = setTimeout(() => req.destroy(new PublicFetchError('unreachable', 'Timed out')), limits.timeoutMs);
  req.on('close', () => clearTimeout(timer)); req.on('error', reject); req.end();
});

export async function fetchPublic(raw: string | URL, options: { accept: string; maxBytes: number; timeoutMs?: number; maxRedirects?: number },
  deps: { resolve?: typeof publicBrandAddresses; transport?: PublicTransport } = {}): Promise<PublicResponse> {
  const resolve = deps.resolve ?? publicBrandAddresses, transport = deps.transport ?? httpsTransport;
  const maxRedirects = options.maxRedirects ?? 3;
  let current = String(raw);
  for (let hop = 0; ; hop++) {
    let url: URL; let addresses: { address: string }[];
    try { url = publicBrandUrl(current); addresses = await resolve(url); }
    catch { throw new PublicFetchError('blocked', 'Not a public HTTPS address'); }
    let response: Awaited<ReturnType<PublicTransport>>;
    try { response = await transport(url, addresses[0].address, { accept: options.accept, maxBytes: options.maxBytes, timeoutMs: options.timeoutMs ?? 10_000 }); }
    catch (error) { throw error instanceof PublicFetchError ? error : new PublicFetchError('unreachable', 'Could not reach the site'); }
    if ([301, 302, 303, 307, 308].includes(response.status) && response.location) {
      if (hop >= maxRedirects) throw new PublicFetchError('too_many_redirects', 'Too many redirects');
      current = new URL(response.location, url).href;
      continue;
    }
    return { status: response.status, url, contentType: response.contentType, body: response.body };
  }
}
```

Note: `publicBrandUrl` throws a Nest `BadRequestException` for non-HTTPS/IP/credential URLs and `publicBrandAddresses` throws when any resolved address is private; both become `blocked` here.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-import/public-fetch.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/store-import/public-fetch.ts apps/api/src/store-import/public-fetch.spec.ts
git commit -m "feat(store-import): a safe public fetcher that follows up to three HTTPS redirects, re-checking every hop"
```

---

### Task 3: Shopify reader

**Files:**
- Create: `apps/api/src/store-import/shopify-types.ts`
- Create: `apps/api/src/store-import/shopify-reader.ts`
- Create fixtures: `apps/api/src/store-import/fixtures/{meta,products-page-1,collections,collection-products,pages,refund-policy}.json`
- Test: `apps/api/src/store-import/shopify-reader.spec.ts`

**Interfaces:**
- Consumes: `fetchPublic`, `PublicFetchError` (Task 2).
- Produces (in `shopify-types.ts`):

```ts
export type ShopifyVariant = { id: string; options: string[]; sku: string | null; price: string; compareAtPrice: string | null; available: boolean; grams: number; inventoryQuantity?: number; imageSrc?: string };
export type ShopifyProduct = { handle: string; title: string; bodyHtml: string; productType: string; tags: string[]; optionNames: string[]; variants: ShopifyVariant[]; images: string[] };
export type ShopifyCollection = { handle: string; title: string; description: string; productHandles: string[] };
export type ShopifyArticle = { kind: 'page' | 'policy'; handle: string; title: string; bodyHtml: string };
export type ShopifyStoreData = { host: string; origin: string; name: string; currency: string; products: ShopifyProduct[]; collections: ShopifyCollection[]; articles: ShopifyArticle[]; truncated: boolean; stockKnown: boolean; warnings: string[] };
```

- `class ShopifyReadError extends Error { code: 'not_shopify' | 'protected' | 'unreachable' }` with Spanish merchant messages.
- `type JsonGet = (path: string) => Promise<{ status: number; finalPath: string; json: any }>`
- `readShopifyStore(raw: string, get?: JsonGet): Promise<ShopifyStoreData>` (default `get` built on `fetchPublic` with `maxBytes: 8_000_000`).
- `shopifyOrigin(raw: string): URL` — adds `https://` when missing, strips path/query.
- `MAX_PRODUCTS = 1000`.

- [ ] **Step 1: Record the fixtures from a live store**

```bash
cd apps/api/src/store-import && mkdir -p fixtures && H=https://peakclyro.myshopify.com
curl -s $H/meta.json > fixtures/meta.json
curl -s "$H/products.json?limit=250&page=1" > fixtures/products-page-1.json
curl -s "$H/collections.json?limit=250" > fixtures/collections.json
curl -s "$H/collections/frontpage/products.json?limit=250&page=1" > fixtures/collection-products.json
curl -s "$H/pages.json?limit=250" > fixtures/pages.json
curl -s -A "Mozilla/5.0" https://www.allbirds.com/policies/refund-policy.json | python3 -c "import json,sys;d=json.load(sys.stdin);d['policy']['body']='<p>Aceptamos devoluciones en 30 días.</p>';print(json.dumps(d))" > fixtures/refund-policy.json
```

The refund body is replaced with a short Spanish paragraph so the fixture carries no third-party legal text.

- [ ] **Step 2: Write the failing tests**

```ts
import { readShopifyStore, shopifyOrigin, ShopifyReadError, type JsonGet } from './shopify-reader';
import meta from './fixtures/meta.json';
import productsPage from './fixtures/products-page-1.json';
import collections from './fixtures/collections.json';
import collectionProducts from './fixtures/collection-products.json';
import pages from './fixtures/pages.json';
import refund from './fixtures/refund-policy.json';

const routes = (overrides: Record<string, any> = {}): JsonGet => async path => {
  const table: Record<string, any> = {
    '/meta.json': meta, '/products.json?limit=250&page=1': productsPage, '/products.json?limit=250&page=2': { products: [] },
    '/collections.json?limit=250': { collections: [...collections.collections, { handle: 'perros', title: 'Perros', description: '<p>Todo</p>', products_count: 2 }] },
    '/collections/perros/products.json?limit=250&page=1': collectionProducts, '/collections/perros/products.json?limit=250&page=2': { products: [] },
    '/pages.json?limit=250': pages, '/policies/refund-policy.json': refund, ...overrides,
  };
  return table[path] !== undefined ? { status: 200, finalPath: path.split('?')[0], json: table[path] } : { status: 404, finalPath: path.split('?')[0], json: null };
};

describe('readShopifyStore', () => {
  it('normalizes the address', () => {
    expect(shopifyOrigin('mitienda.com/collections/x?y=1').href).toBe('https://mitienda.com/');
  });

  it('reads products, variants, images, collections, pages and set policies', async () => {
    const data = await readShopifyStore('peakclyro.myshopify.com', routes());
    expect(data.name).toBe('Peak'); expect(data.currency).toBe('EUR');
    expect(data.products.length).toBe(productsPage.products.length);
    expect(data.products[0]).toMatchObject({ handle: 'peak-choco-bites', title: 'PEAK Choco-Bites', optionNames: ['Title'] });
    expect(data.products[0].variants[0]).toMatchObject({ options: ['Default Title'], price: '1.99', available: true });
    expect(data.products[0].images[0]).toMatch(/^https:\/\/cdn\.shopify\.com\//);
    // Shopify's automatic "frontpage" collection is not a merchant collection.
    expect(data.collections.map(c => c.handle)).toEqual(['perros']);
    expect(data.collections[0].productHandles.length).toBe(collectionProducts.products.length);
    expect(data.articles.map(a => `${a.kind}:${a.handle}`)).toEqual(['page:contact', 'policy:refund-policy']);
    expect(data.stockKnown).toBe(false); expect(data.truncated).toBe(false);
  });

  it('says a protected store is protected and a non-Shopify site is not Shopify', async () => {
    await expect(readShopifyStore('x.com', async () => ({ status: 200, finalPath: '/password', json: null }))).rejects.toMatchObject({ code: 'protected' });
    await expect(readShopifyStore('x.com', async () => ({ status: 404, finalPath: '/meta.json', json: null }))).rejects.toMatchObject({ code: 'not_shopify' });
    await expect(readShopifyStore('x.com', routes({ '/meta.json': { name: 'Wix' } }))).rejects.toBeInstanceOf(ShopifyReadError);
  });

  it('stops at 1,000 products and says so', async () => {
    const product = productsPage.products[0];
    const full = { products: Array.from({ length: 250 }, (_, i) => ({ ...product, id: i, handle: `p-${i}` })) };
    const get = routes({ '/products.json?limit=250&page=1': full, '/products.json?limit=250&page=2': full, '/products.json?limit=250&page=3': full, '/products.json?limit=250&page=4': full, '/products.json?limit=250&page=5': full });
    const data = await readShopifyStore('x.com', get);
    expect(data.products.length).toBe(1000); expect(data.truncated).toBe(true);
  });

  it('keeps going with a warning when collections or pages fail', async () => {
    const data = await readShopifyStore('x.com', routes({ '/collections.json?limit=250': null, '/pages.json?limit=250': null }));
    expect(data.products.length).toBeGreaterThan(0);
    expect(data.warnings.join(' ')).toMatch(/colecciones/);
  });
});
```

Check `grep resolveJsonModule apps/api/tsconfig.json`; if absent, add `"resolveJsonModule": true` and `"esModuleInterop": true` (if missing) to `compilerOptions`.

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/shopify-reader.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `shopify-types.ts` (the Produces block above, verbatim) and `shopify-reader.ts`**

```ts
import { fetchPublic, PublicFetchError } from './public-fetch';
import type { ShopifyArticle, ShopifyCollection, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export const MAX_PRODUCTS = 1000;
const MAX_COLLECTIONS = 50;
const POLICIES = ['refund-policy', 'shipping-policy', 'privacy-policy', 'terms-of-service'];
const IGNORED_COLLECTIONS = new Set(['frontpage', 'all']);
const PROTECTED = 'Tu tienda está protegida con contraseña. Exporta tus productos desde Shopify (Productos → Exportar) y sube el CSV aquí.';

export class ShopifyReadError extends Error {
  constructor(readonly code: 'not_shopify' | 'protected' | 'unreachable', message: string) { super(message); }
}
export type JsonGet = (path: string) => Promise<{ status: number; finalPath: string; json: any }>;

export function shopifyOrigin(raw: string): URL {
  const trimmed = raw.trim();
  let url: URL;
  try { url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed.replace(/^http:/i, 'https:') : `https://${trimmed}`); }
  catch { throw new ShopifyReadError('not_shopify', 'Escribe la dirección de tu tienda, por ejemplo mitienda.com.'); }
  return new URL(url.origin + '/');
}

function publicGet(origin: URL): JsonGet {
  return async path => {
    try {
      const response = await fetchPublic(new URL(path, origin), { accept: 'application/json', maxBytes: 8_000_000, timeoutMs: 15_000 });
      let json: any = null;
      if (/json/i.test(response.contentType)) { try { json = JSON.parse(response.body.toString('utf8')); } catch { json = null; } }
      return { status: response.status, finalPath: response.url.pathname, json };
    } catch (error) {
      if (error instanceof PublicFetchError && error.code !== 'unreachable') throw new ShopifyReadError('not_shopify', 'No pudimos leer esa dirección como una tienda pública.');
      throw new ShopifyReadError('unreachable', 'Shopify no respondió. Intenta de nuevo en unos minutos.');
    }
  };
}

const text = (value: unknown) => typeof value === 'string' ? value : '';

function product(raw: any): ShopifyProduct {
  return {
    handle: text(raw.handle), title: text(raw.title).trim(), bodyHtml: text(raw.body_html), productType: text(raw.product_type).trim(),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : text(raw.tags).split(',').map(tag => tag.trim()).filter(Boolean),
    optionNames: Array.isArray(raw.options) ? raw.options.map((option: any) => text(option?.name)).filter(Boolean) : [],
    variants: (raw.variants || []).map((variant: any) => ({
      id: String(variant.id), options: [variant.option1, variant.option2, variant.option3].filter((value: unknown) => typeof value === 'string'),
      sku: variant.sku ? String(variant.sku) : null, price: String(variant.price ?? ''), compareAtPrice: variant.compare_at_price ? String(variant.compare_at_price) : null,
      available: variant.available !== false, grams: Number(variant.grams) || 0,
      ...(variant.featured_image?.src ? { imageSrc: String(variant.featured_image.src) } : {}),
    })),
    images: (raw.images || []).map((image: any) => text(image?.src)).filter(Boolean),
  };
}

export async function readShopifyStore(raw: string, get?: JsonGet): Promise<ShopifyStoreData> {
  const origin = shopifyOrigin(raw);
  const fetchJson = get ?? publicGet(origin);
  const warnings: string[] = [];
  const meta = await fetchJson('/meta.json');
  if (meta.finalPath === '/password') throw new ShopifyReadError('protected', PROTECTED);
  if (meta.status !== 200 || !/\.myshopify\.com$/.test(text(meta.json?.myshopify_domain))) throw new ShopifyReadError('not_shopify', 'Esa dirección no es una tienda Shopify.');

  const products: ShopifyProduct[] = [];
  let truncated = false;
  for (let page = 1; ; page++) {
    const response = await fetchJson(`/products.json?limit=250&page=${page}`);
    if (response.finalPath === '/password') throw new ShopifyReadError('protected', PROTECTED);
    const items: any[] = Array.isArray(response.json?.products) ? response.json.products : [];
    if (!items.length) break;
    if (products.length >= MAX_PRODUCTS) { truncated = true; break; }
    products.push(...items.slice(0, MAX_PRODUCTS - products.length).map(product));
    if (items.length < 250) break;
  }

  const collections: ShopifyCollection[] = [];
  try {
    const listed = await fetchJson('/collections.json?limit=250');
    if (!Array.isArray(listed.json?.collections)) throw new Error('no collections');
    for (const raw of listed.json.collections.filter((c: any) => !IGNORED_COLLECTIONS.has(c.handle) && c.products_count !== 0).slice(0, MAX_COLLECTIONS)) {
      const productHandles: string[] = [];
      for (let page = 1; page <= 4; page++) {
        const items: any[] = (await fetchJson(`/collections/${encodeURIComponent(raw.handle)}/products.json?limit=250&page=${page}`)).json?.products || [];
        productHandles.push(...items.map(item => text(item.handle)).filter(Boolean));
        if (items.length < 250) break;
      }
      collections.push({ handle: text(raw.handle), title: text(raw.title).trim(), description: text(raw.description), productHandles });
    }
  } catch { warnings.push('No pudimos leer tus colecciones; los productos se importan igual.'); }

  const articles: ShopifyArticle[] = [];
  try {
    const listed = await fetchJson('/pages.json?limit=250');
    if (!Array.isArray(listed.json?.pages)) throw new Error('no pages');
    for (const page of listed.json.pages) articles.push({ kind: 'page', handle: text(page.handle), title: text(page.title).trim(), bodyHtml: text(page.body_html) });
  } catch { warnings.push('No pudimos leer tus páginas.'); }
  for (const handle of POLICIES) {
    const policy = (await fetchJson(`/policies/${handle}.json`).catch(() => null))?.json?.policy;
    if (policy && text(policy.body).trim()) articles.push({ kind: 'policy', handle, title: text(policy.title).trim(), bodyHtml: text(policy.body) });
  }

  return { host: origin.hostname, origin: origin.href, name: text(meta.json.name).trim() || origin.hostname, currency: text(meta.json.currency).toUpperCase() || 'BOB',
    products, collections, articles, truncated, stockKnown: false, warnings };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-import/shopify-reader.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/store-import/shopify-types.ts apps/api/src/store-import/shopify-reader.ts apps/api/src/store-import/shopify-reader.spec.ts apps/api/src/store-import/fixtures apps/api/tsconfig.json
git commit -m "feat(store-import): read a public Shopify store — products, variants, photos, collections, pages and policies, with protected and non-Shopify stores named"
```

---

### Task 4: Shopify product CSV parser

**Files:**
- Create: `apps/api/src/store-import/shopify-csv.ts`
- Test: `apps/api/src/store-import/shopify-csv.spec.ts`

**Interfaces:**
- Consumes: `ShopifyStoreData`, `ShopifyProduct` (Task 3); `MAX_PRODUCTS`, `ShopifyReadError` (Task 3).
- Produces:
  - `parseCsv(text: string): string[][]` (RFC 4180: quotes, doubled quotes, newlines inside quotes, CRLF)
  - `readShopifyCsv(csv: string, name: string, host: string): ShopifyStoreData` — groups rows by `Handle`, sets `stockKnown: true`, `currency: 'BOB'` (the CSV carries no currency; the review warns), skips `draft`/`archived` products, throws `ShopifyReadError('not_shopify', 'Ese archivo no es una exportación de productos de Shopify.')` when `Handle`/`Title`/`Variant Price` headers are missing.

- [ ] **Step 1: Write the failing tests**

```ts
import { parseCsv, readShopifyCsv } from './shopify-csv';

const CSV = [
  'Handle,Title,Body (HTML),Type,Tags,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Variant SKU,Variant Grams,Variant Inventory Qty,Variant Price,Variant Compare At Price,Image Src,Image Position,Variant Image,Status',
  'croquetas,Croquetas Premium,"<p>Para perros, ""felices""</p>",Alimento,"perros, premium",Tamaño,1 kg,Sabor,Pollo,CR-1,1000,12,50.00,60.00,https://cdn.shopify.com/a.jpg,1,,active',
  'croquetas,,,,,,3 kg,,Pollo,CR-3,3000,0,120.00,,https://cdn.shopify.com/b.jpg,2,https://cdn.shopify.com/b.jpg,',
  'borrador,Borrador,,,,Title,Default Title,,,,0,5,10.00,,,,,draft',
].join('\r\n');

describe('Shopify CSV', () => {
  it('parses quotes, doubled quotes and CRLF', () => {
    expect(parseCsv('a,"b,""c""",d\r\n1,2,3')).toEqual([['a', 'b,"c"', 'd'], ['1', '2', '3']]);
  });

  it('groups rows by handle into products with exact stock and skips drafts', () => {
    const data = readShopifyCsv(CSV, 'Mi tienda', 'mitienda.com');
    expect(data.stockKnown).toBe(true);
    expect(data.products).toHaveLength(1);
    const [product] = data.products;
    expect(product).toMatchObject({ handle: 'croquetas', title: 'Croquetas Premium', productType: 'Alimento', tags: ['perros', 'premium'], optionNames: ['Tamaño', 'Sabor'] });
    expect(product.bodyHtml).toBe('<p>Para perros, "felices"</p>');
    expect(product.variants).toEqual([
      expect.objectContaining({ options: ['1 kg', 'Pollo'], sku: 'CR-1', price: '50.00', compareAtPrice: '60.00', inventoryQuantity: 12, available: true, grams: 1000 }),
      expect.objectContaining({ options: ['3 kg', 'Pollo'], inventoryQuantity: 0, available: false, imageSrc: 'https://cdn.shopify.com/b.jpg' }),
    ]);
    expect(product.images).toEqual(['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg']);
  });

  it('rejects a file that is not a Shopify product export', () => {
    expect(() => readShopifyCsv('nombre,precio\nA,1', 'x', 'x.com')).toThrow('no es una exportación de productos de Shopify');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/shopify-csv.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { MAX_PRODUCTS, ShopifyReadError } from './shopify-reader';
import type { ShopifyProduct, ShopifyStoreData } from './shopify-types';

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell.trim()));
}

export function readShopifyCsv(csv: string, name: string, host: string): ShopifyStoreData {
  const [header, ...rows] = parseCsv(csv.replace(/^﻿/, ''));
  const col = (label: string) => header?.indexOf(label) ?? -1;
  if (!header || col('Handle') < 0 || col('Title') < 0 || col('Variant Price') < 0) throw new ShopifyReadError('not_shopify', 'Ese archivo no es una exportación de productos de Shopify.');
  const get = (row: string[], label: string) => { const index = col(label); return index < 0 ? '' : (row[index] ?? '').trim(); };
  const products = new Map<string, ShopifyProduct & { draft: boolean }>();
  for (const row of rows) {
    const handle = get(row, 'Handle'); if (!handle) continue;
    let product = products.get(handle);
    if (!product) {
      product = { handle, title: get(row, 'Title'), bodyHtml: row[col('Body (HTML)')] ?? '', productType: get(row, 'Type'),
        tags: get(row, 'Tags').split(',').map(tag => tag.trim()).filter(Boolean),
        optionNames: [1, 2, 3].map(n => get(row, `Option${n} Name`)).filter(Boolean), variants: [], images: [],
        draft: ['draft', 'archived'].includes(get(row, 'Status').toLowerCase()) };
      products.set(handle, product);
    }
    const image = get(row, 'Image Src');
    if (image && !product.images.includes(image)) product.images.push(image);
    const price = get(row, 'Variant Price');
    if (price) {
      const quantity = get(row, 'Variant Inventory Qty');
      const inventoryQuantity = quantity === '' ? undefined : Math.max(0, Math.trunc(Number(quantity)) || 0);
      const variantImage = get(row, 'Variant Image');
      product.variants.push({ id: `${handle}#${product.variants.length + 1}`, options: [1, 2, 3].map(n => get(row, `Option${n} Value`)).filter(Boolean),
        sku: get(row, 'Variant SKU') || null, price, compareAtPrice: get(row, 'Variant Compare At Price') || null,
        available: inventoryQuantity === undefined ? true : inventoryQuantity > 0, grams: Number(get(row, 'Variant Grams')) || 0,
        ...(inventoryQuantity === undefined ? {} : { inventoryQuantity }), ...(variantImage ? { imageSrc: variantImage } : {}) });
    }
  }
  const active = [...products.values()].filter(product => !product.draft).map(({ draft: _draft, ...product }) => product);
  return { host, origin: `https://${host}/`, name, currency: 'BOB', products: active.slice(0, MAX_PRODUCTS), collections: [], articles: [],
    truncated: active.length > MAX_PRODUCTS, stockKnown: true, warnings: ['El CSV de Shopify no dice la moneda: revisa que tus precios estén en bolivianos.'] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-import/shopify-csv.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/store-import/shopify-csv.ts apps/api/src/store-import/shopify-csv.spec.ts
git commit -m "feat(store-import): read Shopify's product export CSV — exact stock, variant images, drafts left out"
```

---

### Task 5: Mapping and the review preview

**Files:**
- Create: `apps/api/src/store-import/shopify-mapping.ts`
- Test: `apps/api/src/store-import/shopify-mapping.spec.ts`

**Interfaces:**
- Consumes: `ShopifyStoreData`, `ShopifyProduct`, `ShopifyArticle` (Task 3); `normalizeProductVariants` from `../payment-links/product-variants`; `ProductVariantDto` from `../payment-links/dto/create-payment-link.dto`.
- Produces:

```ts
export type ImportVariant = { name: string; amount: number; stock: number | null; options?: Array<{ name: string; value: string }>; imageSource?: string };
export type ImportProduct = { externalId: string; name: string; description: string; tags: string[]; categoryName: string | null; amount: number; discountPercent: number | null; stock: number | null; shippingWeightGrams: number | null; variants: ImportVariant[]; imageSources: string[]; skus: string[] };
export type ImportArticle = { externalId: string; slug: string; title: string; excerpt: string; body: string };
export type ImportPreview = { name: string; currency: string; needsExchangeRate: boolean; counts: { products: number; variants: number; collections: number; pages: number; policies: number; photos: number }; products: Array<{ externalId: string; name: string; price: string; image: string | null; problem: string | null }>; warnings: string[] };
export function htmlToText(html: string): string;
export function toCentavos(price: string, rateMilli: number | null): number | null;
export function mapProduct(product: ShopifyProduct, rateMilli: number | null, stockKnown: boolean): { product: ImportProduct } | { problem: string };
export function mapArticle(article: ShopifyArticle): ImportArticle;
export function buildPreview(data: ShopifyStoreData): ImportPreview;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { buildPreview, htmlToText, mapArticle, mapProduct, toCentavos } from './shopify-mapping';
import type { ShopifyProduct, ShopifyStoreData } from './shopify-types';

const base: ShopifyProduct = { handle: 'croquetas', title: 'Croquetas', bodyHtml: '<p>Hola &amp; <b>chau</b></p><script>alert(1)</script><p>Dos<br>líneas</p>', productType: 'Alimento', tags: ['perros'],
  optionNames: ['Title'], variants: [{ id: '1', options: ['Default Title'], sku: 'CR', price: '50.00', compareAtPrice: '62.50', available: true, grams: 1000 }], images: ['https://cdn.shopify.com/a.jpg'] };

describe('Shopify → pagosYa mapping', () => {
  it('turns HTML into clean text with paragraphs and no scripts', () => {
    expect(htmlToText(base.bodyHtml)).toBe('Hola & chau\n\nDos\nlíneas');
    expect(htmlToText('<p>&#39;x&#39; &nbsp;y</p>')).toBe("'x' y");
  });

  it('converts prices to centavos, applying the exchange rate when the store is not in bolivianos', () => {
    expect(toCentavos('50.00', null)).toBe(5000);
    expect(toCentavos('10', 6960)).toBe(6960);
    expect(toCentavos('abc', null)).toBeNull();
  });

  it('maps a single-variant product with its discount, weight, stock and photos', () => {
    expect(mapProduct(base, null, false)).toEqual({ product: { externalId: 'croquetas', name: 'Croquetas', description: 'Hola & chau\n\nDos\nlíneas', tags: ['perros'], categoryName: 'Alimento',
      amount: 5000, discountPercent: 20, stock: null, shippingWeightGrams: 1000, variants: [], imageSources: ['https://cdn.shopify.com/a.jpg'], skus: ['CR'] } });
  });

  it('maps option combinations into structured variants; sold out becomes zero stock', () => {
    const product = { ...base, optionNames: ['Tamaño', 'Sabor'], variants: [
      { ...base.variants[0], id: '1', options: ['1 kg', 'Pollo'], price: '50', compareAtPrice: null },
      { ...base.variants[0], id: '2', options: ['3 kg', 'Pollo'], price: '120', compareAtPrice: null, available: false, imageSrc: 'https://cdn.shopify.com/b.jpg' },
    ] };
    const mapped = mapProduct(product, null, false) as any;
    expect(mapped.product.amount).toBe(5000);
    expect(mapped.product.variants).toEqual([
      { name: '1 kg / Pollo', amount: 5000, stock: null, options: [{ name: 'Tamaño', value: '1 kg' }, { name: 'Sabor', value: 'Pollo' }] },
      { name: '3 kg / Pollo', amount: 12000, stock: 0, options: [{ name: 'Tamaño', value: '3 kg' }, { name: 'Sabor', value: 'Pollo' }], imageSource: 'https://cdn.shopify.com/b.jpg' },
    ]);
  });

  it('uses exact CSV stock when known', () => {
    const product = { ...base, variants: [{ ...base.variants[0], inventoryQuantity: 7 }] };
    expect((mapProduct(product, null, true) as any).product.stock).toBe(7);
  });

  it('names the problem instead of failing the whole import', () => {
    expect(mapProduct({ ...base, variants: [{ ...base.variants[0], price: '' }] }, null, false)).toEqual({ problem: 'Croquetas: no tiene precio.' });
    const duplicated = { ...base, optionNames: ['Talla'], variants: [{ ...base.variants[0], id: '1', options: ['M'] }, { ...base.variants[0], id: '2', options: ['m'] }] };
    expect((mapProduct(duplicated, null, false) as any).problem).toMatch(/^Croquetas: /);
  });

  it('maps pages and policies to unpublished article content with Spanish policy slugs', () => {
    expect(mapArticle({ kind: 'policy', handle: 'refund-policy', title: 'Refund policy', bodyHtml: '<p>30 días.</p>' }))
      .toEqual({ externalId: 'policy:refund-policy', slug: 'politica-de-devoluciones', title: 'Política de devoluciones', excerpt: '30 días.', body: '30 días.' });
    expect(mapArticle({ kind: 'page', handle: 'nosotros', title: 'Nosotros', bodyHtml: '<p>Somos</p>' }).slug).toBe('nosotros');
  });

  it('builds the review: counts, problems, the exchange-rate question and the stock warning', () => {
    const data: ShopifyStoreData = { host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'USD', products: [base, { ...base, handle: 'sin-precio', title: 'Sin precio', variants: [{ ...base.variants[0], price: '' }] }],
      collections: [{ handle: 'c', title: 'C', description: '', productHandles: ['croquetas'] }], articles: [{ kind: 'page', handle: 'p', title: 'P', bodyHtml: '' }], truncated: true, stockKnown: false, warnings: ['w'] };
    const preview = buildPreview(data);
    expect(preview.needsExchangeRate).toBe(true);
    expect(preview.counts).toEqual({ products: 2, variants: 2, collections: 1, pages: 1, policies: 0, photos: 1 });
    expect(preview.products[1]).toMatchObject({ externalId: 'sin-precio', problem: 'Sin precio: no tiene precio.' });
    expect(preview.warnings).toEqual(expect.arrayContaining(['w', expect.stringMatching(/stock no es público/), expect.stringMatching(/primeros 1\.000/)]));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/shopify-mapping.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { normalizeProductVariants } from '../payment-links/product-variants';
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import type { ShopifyArticle, ShopifyProduct, ShopifyStoreData } from './shopify-types';

export type ImportVariant = { name: string; amount: number; stock: number | null; options?: Array<{ name: string; value: string }>; imageSource?: string };
export type ImportProduct = { externalId: string; name: string; description: string; tags: string[]; categoryName: string | null; amount: number; discountPercent: number | null; stock: number | null; shippingWeightGrams: number | null; variants: ImportVariant[]; imageSources: string[]; skus: string[] };
export type ImportArticle = { externalId: string; slug: string; title: string; excerpt: string; body: string };
export type ImportPreview = { name: string; currency: string; needsExchangeRate: boolean; counts: { products: number; variants: number; collections: number; pages: number; policies: number; photos: number }; products: Array<{ externalId: string; name: string; price: string; image: string | null; problem: string | null }>; warnings: string[] };

const POLICY_TITLES: Record<string, [string, string]> = {
  'refund-policy': ['politica-de-devoluciones', 'Política de devoluciones'], 'shipping-policy': ['politica-de-envios', 'Política de envíos'],
  'privacy-policy': ['politica-de-privacidad', 'Política de privacidad'], 'terms-of-service': ['terminos-del-servicio', 'Términos del servicio'],
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|ul|ol|section|article|blockquote|tr)>/gi, '\n\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => entity[0] === '#'
      ? String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)))
      : ENTITIES[entity.toLowerCase()] ?? match)
    .split('\n').map(line => line.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 20_000);
}

export function toCentavos(price: string, rateMilli: number | null): number | null {
  if (!/^\d+(\.\d+)?$/.test(price.trim())) return null;
  const value = Number(price) * (rateMilli ? rateMilli / 1000 : 1);
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function mapProduct(product: ShopifyProduct, rateMilli: number | null, stockKnown: boolean): { product: ImportProduct } | { problem: string } {
  const name = product.title.slice(0, 200) || product.handle;
  if (!product.variants.length) return { problem: `${name}: no tiene variantes con precio.` };
  const stockOf = (variant: ShopifyProduct['variants'][number]) => stockKnown && variant.inventoryQuantity !== undefined ? variant.inventoryQuantity : variant.available ? null : 0;
  const priced = product.variants.map(variant => ({ variant, amount: toCentavos(variant.price, rateMilli) }));
  if (priced.some(item => item.amount === null)) return { problem: `${name}: no tiene precio.` };
  const cheapest = priced.reduce((min, item) => item.amount! < min.amount! ? item : min);
  const compare = cheapest.variant.compareAtPrice ? toCentavos(cheapest.variant.compareAtPrice, rateMilli) : null;
  const discountPercent = compare && compare > cheapest.amount! ? Math.min(99, Math.max(1, Math.round((1 - cheapest.amount! / compare) * 100))) : null;
  const single = product.variants.length === 1 && (product.optionNames[0] ?? 'Title') === 'Title';
  const variants: ImportVariant[] = single ? [] : priced.map(({ variant, amount }) => ({
    name: variant.options.join(' / '), amount: amount!, stock: stockOf(variant),
    options: product.optionNames.map((optionName, index) => ({ name: optionName, value: variant.options[index] })).filter(option => option.value),
    ...(variant.imageSrc ? { imageSource: variant.imageSrc } : {}),
  }));
  try { normalizeProductVariants(variants as unknown as ProductVariantDto[]); }
  catch (error) { return { problem: `${name}: ${(error as Error).message}` }; }
  return { product: {
    externalId: product.handle, name, description: htmlToText(product.bodyHtml), tags: product.tags.slice(0, 20).map(tag => tag.slice(0, 40)),
    categoryName: product.productType ? product.productType.slice(0, 80) : null,
    amount: cheapest.amount!, discountPercent, stock: single ? stockOf(product.variants[0]) : null,
    shippingWeightGrams: product.variants[0].grams > 0 ? Math.round(product.variants[0].grams) : null,
    variants, imageSources: product.images.slice(0, 10), skus: product.variants.map(variant => variant.sku).filter((sku): sku is string => Boolean(sku)),
  } };
}

export function mapArticle(article: ShopifyArticle): ImportArticle {
  const policy = article.kind === 'policy' ? POLICY_TITLES[article.handle] : undefined;
  const body = htmlToText(article.bodyHtml);
  const slug = policy?.[0] ?? (article.handle.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'pagina');
  return { externalId: `${article.kind}:${article.handle}`, slug, title: (policy?.[1] ?? article.title).slice(0, 200), excerpt: body.split('\n')[0].slice(0, 200), body };
}

export function buildPreview(data: ShopifyStoreData): ImportPreview {
  const products = data.products.map(product => {
    // The rate does not change whether a product maps; 1:1 here only checks for problems.
    const mapped = mapProduct(product, null, data.stockKnown);
    return { externalId: product.handle, name: product.title, price: product.variants[0]?.price ?? '', image: product.images[0] ?? null, problem: 'problem' in mapped ? mapped.problem : null };
  });
  const warnings = [...data.warnings];
  if (!data.stockKnown) warnings.push("El stock no es público en Shopify: súbelo con el CSV o queda en 'sin límite' (los agotados quedan en 0).");
  if (data.truncated) warnings.push('Tu tienda tiene más de 1.000 productos; importaremos los primeros 1.000.');
  const problems = products.filter(product => product.problem).length;
  if (problems) warnings.push(`${problems} ${problems === 1 ? 'producto tiene un problema y no se importará' : 'productos tienen problemas y no se importarán'}.`);
  return { name: data.name, currency: data.currency, needsExchangeRate: data.currency !== 'BOB', warnings, products,
    counts: { products: data.products.length, variants: data.products.reduce((sum, product) => sum + product.variants.length, 0), collections: data.collections.length,
      pages: data.articles.filter(article => article.kind === 'page').length, policies: data.articles.filter(article => article.kind === 'policy').length,
      photos: new Set(data.products.flatMap(product => product.images)).size } };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-import/shopify-mapping.spec.ts`
Expected: PASS (8 tests). `normalizeProductVariants` compares option values case- and accent-insensitively, so `M`/`m` must collide; if it does not, investigate rather than weakening the assertion.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/store-import/shopify-mapping.ts apps/api/src/store-import/shopify-mapping.spec.ts
git commit -m "feat(store-import): map Shopify products, variants, discounts, stock, pages and policies to pagosYa, and build the review"
```

---

### Task 6: Photo copier

**Files:**
- Create: `apps/api/src/store-import/photo-copier.ts`
- Test: `apps/api/src/store-import/photo-copier.spec.ts`

**Interfaces:**
- Consumes: `fetchPublic` (Task 2); `detectedMediaMime(buffer: Buffer): string | null` exported from `../uploads/uploads.service`.
- Produces: `copyPhotos(sources: string[], input: { storeHost: string; done: Record<string, string>; save: (buffer: Buffer, mimeType: string) => Promise<{ url: string }>; fetch?: typeof fetchPublic; onProgress?: (copied: number, total: number) => Promise<void> | void; concurrency?: number }): Promise<{ urls: Record<string, string>; failed: string[] }>` — `urls` includes reused `done` entries; allowed hosts `cdn.shopify.com` and `storeHost`; Shopify CDN requests carry `width=1600`; only JPEG/PNG/WebP/GIF; `MAX_PHOTO_BYTES = 10 MB`, `MAX_PHOTOS = 3000`.

- [ ] **Step 1: Write the failing tests**

```ts
import { copyPhotos } from './photo-copier';

// A real 1×1 PNG, so content detection sees a valid image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const ok = (body = PNG) => ({ status: 200, url: new URL('https://cdn.shopify.com/x'), contentType: 'image/png', body });

describe('copyPhotos', () => {
  it('copies allowed photos once, resizes Shopify CDN requests and reuses earlier copies', async () => {
    const fetch = jest.fn(async () => ok()) as any;
    const save = jest.fn(async () => ({ url: '/v1/uploads/new.png' }));
    const result = await copyPhotos(['https://cdn.shopify.com/a.png?v=1', 'https://cdn.shopify.com/a.png?v=1', 'https://cdn.shopify.com/old.png'],
      { storeHost: 'mitienda.com', done: { 'https://cdn.shopify.com/old.png': '/v1/uploads/old.png' }, save, fetch });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://cdn.shopify.com/a.png?v=1&width=1600');
    expect(save).toHaveBeenCalledWith(PNG, 'image/png');
    expect(result.urls).toEqual({ 'https://cdn.shopify.com/a.png?v=1': '/v1/uploads/new.png', 'https://cdn.shopify.com/old.png': '/v1/uploads/old.png' });
    expect(result.failed).toEqual([]);
  });

  it('refuses other hosts and non-images, and keeps going when one photo fails', async () => {
    const fetch = jest.fn(async (url: URL) => String(url).includes('bad') ? { ...ok(), body: Buffer.from('<html>') } : ok()) as any;
    const result = await copyPhotos(['https://evil.example/a.png', 'https://cdn.shopify.com/bad.png', 'https://mitienda.com/good.png'],
      { storeHost: 'mitienda.com', done: {}, save: async () => ({ url: '/v1/uploads/g.png' }), fetch });
    expect(result.failed).toEqual(['https://evil.example/a.png', 'https://cdn.shopify.com/bad.png']);
    expect(Object.keys(result.urls)).toEqual(['https://mitienda.com/good.png']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/photo-copier.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { detectedMediaMime } from '../uploads/uploads.service';
import { fetchPublic } from './public-fetch';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 3000;

export async function copyPhotos(sources: string[], input: { storeHost: string; done: Record<string, string>; save: (buffer: Buffer, mimeType: string) => Promise<{ url: string }>; fetch?: typeof fetchPublic; onProgress?: (copied: number, total: number) => Promise<void> | void; concurrency?: number }) {
  const fetch = input.fetch ?? fetchPublic;
  const urls: Record<string, string> = {};
  const failed: string[] = [];
  const unique = [...new Set(sources)].slice(0, MAX_PHOTOS);
  for (const source of unique) if (input.done[source]) urls[source] = input.done[source];
  const pending = unique.filter(source => !urls[source]);
  let next = 0, copied = unique.length - pending.length;
  const worker = async () => {
    while (next < pending.length) {
      const source = pending[next++];
      try {
        const url = new URL(source);
        if (url.protocol !== 'https:' || (url.hostname !== 'cdn.shopify.com' && url.hostname !== input.storeHost)) throw new Error('host');
        if (url.hostname === 'cdn.shopify.com') url.searchParams.set('width', '1600');
        const response = await fetch(url, { accept: 'image/*', maxBytes: MAX_PHOTO_BYTES, timeoutMs: 20_000 });
        const mime = detectedMediaMime(response.body);
        if (response.status !== 200 || !mime || !IMAGE_TYPES.has(mime)) throw new Error('not an image');
        urls[source] = (await input.save(response.body, mime)).url;
      } catch { failed.push(source); }
      copied++;
      await input.onProgress?.(copied, unique.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(input.concurrency ?? 4, pending.length) }, worker));
  failed.sort((a, b) => sources.indexOf(a) - sources.indexOf(b));
  return { urls, failed };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/store-import/photo-copier.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/store-import/photo-copier.ts apps/api/src/store-import/photo-copier.spec.ts
git commit -m "feat(store-import): copy Shopify photos into our uploads — Shopify CDN or the store's own host only, images verified by content"
```

---

### Task 7: Database writer (one transaction, idempotent)

**Files:**
- Create: `apps/api/src/store-import/import-writer.ts`
- Test: `apps/api/src/store-import/import-writer.integration.spec.ts`

**Interfaces:**
- Consumes: `ImportProduct`, `ImportArticle` (Task 5); `collectionSlug(name, taken)` from `../collections/collection-slug`; `normalizeProductVariants`, `totalVariantStock`, `ProductVariant` from `../payment-links/product-variants`.
- Produces:
  - `type ImportCollection = { externalId: string; title: string; productExternalIds: string[] }`
  - `type ImportSummary = { products: { created: number; updated: number }; collections: number; articles: number; redirects: number; skippedRedirects: number }`
  - `writeImport(tx: Prisma.TransactionClient, input: { storeId: string; sourceHost: string; authorName: string; products: Array<ImportProduct & { imageUrls: string[]; variantImageUrls: Array<string | undefined> }>; collections: ImportCollection[]; articles: ImportArticle[] }): Promise<ImportSummary>`

Behavior: categories reused by case-insensitive name, else created; products created or (when linked) updated — name, description, tags, category, prices, discount, stock, weight, images, variants (existing variant ids kept by name); collections created or updated with `CollectionProduct` rows replaced in Shopify order; articles created unpublished (slug suffixed `-2`, `-3` on conflict) or updated if linked; redirects `/products/<h>` → `/p/<id>` and `/collections/<h>` → `/c/<slug>` upserted, collections first, never exceeding 500 rows per store; every item recorded in `StoreImportLink`.

- [ ] **Step 1: Write the failing integration test**

```ts
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import { writeImport } from './import-writer';

const harness = integrationDatabase('store_import');
harness.describeDb('writeImport (real Postgres, real migrations)', () => {
  harness.failIfUnavailable();
  let db: PrismaClient; let storeId: string;
  const product = (externalId: string, amount: number) => ({ externalId, name: `Producto ${externalId}`, description: 'Texto', tags: ['a'], categoryName: 'Alimento', amount, discountPercent: null, stock: null,
    shippingWeightGrams: 500, imageSources: ['https://cdn.shopify.com/a.jpg'], imageUrls: ['/v1/uploads/a.jpg'], skus: ['SKU'],
    variants: [{ name: 'S', amount, stock: null, options: [{ name: 'Talla', value: 'S' }] }, { name: 'M', amount: amount + 100, stock: null, options: [{ name: 'Talla', value: 'M' }] }], variantImageUrls: [undefined, undefined] });
  const input = (amount: number) => ({ storeId, sourceHost: 'mitienda.com', authorName: 'Mi tienda', products: [product('croquetas', amount), product('collar', 3000)],
    collections: [{ externalId: 'perros', title: 'Perros', productExternalIds: ['collar', 'croquetas'] }],
    articles: [{ externalId: 'policy:refund-policy', slug: 'politica-de-devoluciones', title: 'Política de devoluciones', excerpt: '30 días', body: '30 días' }] });

  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'Comercio', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'Tienda', slug: `t-${harness.databaseName}` } })).id;
  });
  afterAll(async () => { await harness.drop(); });

  it('creates everything once, unpublished pages, and Shopify redirects', async () => {
    const summary = await db.$transaction(tx => writeImport(tx, input(5000)));
    expect(summary).toEqual({ products: { created: 2, updated: 0 }, collections: 1, articles: 1, redirects: 3, skippedRedirects: 0 });
    const croquetas = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto croquetas' } });
    expect(croquetas).toMatchObject({ amount: 5000, currency: 'BOB', imageUrls: ['/v1/uploads/a.jpg'], shippingWeightGrams: 500 });
    expect((croquetas.variants as any[]).map(v => v.name)).toEqual(['S', 'M']);
    const collection = await db.collection.findFirstOrThrow({ where: { storeId }, include: { products: { orderBy: { sortOrder: 'asc' } } } });
    expect(collection.slug).toBe('perros');
    const collar = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto collar' } });
    expect(collection.products.map(p => p.paymentLinkId)).toEqual([collar.id, croquetas.id]);
    expect((await db.storeArticle.findFirstOrThrow({ where: { storeId } })).publishedAt).toBeNull();
    expect(await db.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: '/products/croquetas' } } })).toMatchObject({ toPath: `/p/${croquetas.id}` });
    expect(await db.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId, fromPath: '/collections/perros' } } })).toMatchObject({ toPath: '/c/perros' });
  });

  it('re-import updates prices without duplicating, and keeps variant ids by name', async () => {
    const before = await db.paymentLink.findFirstOrThrow({ where: { storeId, name: 'Producto croquetas' } });
    const summary = await db.$transaction(tx => writeImport(tx, input(5500)));
    expect(summary.products).toEqual({ created: 0, updated: 2 });
    expect(await db.paymentLink.count({ where: { storeId } })).toBe(2);
    expect(await db.collection.count({ where: { storeId } })).toBe(1);
    expect(await db.storeArticle.count({ where: { storeId } })).toBe(1);
    const after = await db.paymentLink.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.amount).toBe(5500);
    expect((after.variants as any[]).map(v => v.id)).toEqual((before.variants as any[]).map(v => v.id));
  });

  it('never goes past 500 redirects per store', async () => {
    await db.storeRedirect.createMany({ data: Array.from({ length: 497 }, (_, i) => ({ storeId, fromPath: `/es/viejo-${i}`, toPath: '/es/nuevo' })) });
    // 3 imported redirects already exist; the new product's would be the 501st.
    const summary = await db.$transaction(tx => writeImport(tx, { ...input(5500), products: [...input(5500).products, product('nuevo', 100)] }));
    expect(await db.storeRedirect.count({ where: { storeId } })).toBe(500);
    expect(summary.skippedRedirects).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest --config jest.integration.config.js src/store-import/import-writer.integration.spec.ts`
Expected: FAIL — module not found. If the suite SKIPS because no Postgres answers, start it (`node scripts/dev-db.mjs start` from the repo root) and rerun; the test creates and drops its own database and never touches the dev data.

- [ ] **Step 3: Implement**

```ts
import { Prisma } from '@prisma/client';
import { collectionSlug } from '../collections/collection-slug';
import { normalizeProductVariants, totalVariantStock, type ProductVariant } from '../payment-links/product-variants';
import type { ProductVariantDto } from '../payment-links/dto/create-payment-link.dto';
import type { ImportArticle, ImportProduct } from './shopify-mapping';

export type ImportCollection = { externalId: string; title: string; productExternalIds: string[] };
export type ImportSummary = { products: { created: number; updated: number }; collections: number; articles: number; redirects: number; skippedRedirects: number };
type WritableProduct = ImportProduct & { imageUrls: string[]; variantImageUrls: Array<string | undefined> };
const REDIRECT_CAP = 500;
const SHOPIFY_PATH = /^\/(?:products|collections)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export async function writeImport(tx: Prisma.TransactionClient, input: { storeId: string; sourceHost: string; authorName: string; products: WritableProduct[]; collections: ImportCollection[]; articles: ImportArticle[] }): Promise<ImportSummary> {
  const { storeId, sourceHost } = input;
  await tx.$queryRaw`SELECT id FROM "Store" WHERE id = ${storeId} FOR UPDATE`;
  const links = await tx.storeImportLink.findMany({ where: { storeId, sourceHost } });
  const linked = (kind: string, externalId: string) => links.find(link => link.kind === kind && link.externalId === externalId)?.localId;
  const link = (kind: string, externalId: string, localId: string, skus: string[] = []) => tx.storeImportLink.upsert({
    where: { storeId_sourceHost_kind_externalId: { storeId, sourceHost, kind, externalId } }, create: { storeId, sourceHost, kind, externalId, localId, skus }, update: { localId, skus } });

  const categories = await tx.category.findMany({ where: { storeId } });
  const categoryId = async (name: string | null) => {
    if (!name) return null;
    const found = categories.find(category => category.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    if (found) return found.id;
    const created = await tx.category.create({ data: { storeId, name, sortOrder: categories.length } });
    categories.push(created);
    return created.id;
  };

  const summary: ImportSummary = { products: { created: 0, updated: 0 }, collections: 0, articles: 0, redirects: 0, skippedRedirects: 0 };
  const productIds = new Map<string, string>();
  for (const product of input.products) {
    const existingId = linked('PRODUCT', product.externalId);
    const existing = existingId ? await tx.paymentLink.findFirst({ where: { id: existingId, storeId } }) : null;
    const previous = (existing?.variants as unknown as ProductVariant[] | undefined) ?? [];
    const variants = normalizeProductVariants(product.variants.map((variant, index) => {
      const kept = previous.find(item => item.name === variant.name);
      return { ...(kept ? { id: kept.id } : {}), name: variant.name, amount: variant.amount, stock: variant.stock, options: variant.options, imageUrl: product.variantImageUrls[index] ?? null };
    }) as unknown as ProductVariantDto[], existing ? previous : null);
    const data = {
      name: product.name, description: product.description || null, tags: product.tags, categoryId: await categoryId(product.categoryName),
      imageUrls: product.imageUrls, imagePositions: product.imageUrls.map(() => '50% 50%'), shippingWeightGrams: product.shippingWeightGrams,
      variants: variants as unknown as Prisma.InputJsonValue,
      amount: variants.length ? Math.min(...variants.map(variant => variant.amount)) : product.amount,
      stock: variants.length ? totalVariantStock(variants) : product.stock,
      discountPercent: product.discountPercent, discountStartsAt: null, discountEndsAt: null,
    };
    const saved = existing ? await tx.paymentLink.update({ where: { id: existing.id }, data }) : await tx.paymentLink.create({ data: { storeId, currency: 'BOB', ...data } });
    if (existing) summary.products.updated++; else summary.products.created++;
    productIds.set(product.externalId, saved.id);
    await link('PRODUCT', product.externalId, saved.id, product.skus);
  }

  const collectionSlugs = new Map<string, string>();
  const taken = new Set((await tx.collection.findMany({ where: { storeId }, select: { slug: true } })).map(row => row.slug));
  for (const [index, collection] of input.collections.entries()) {
    const existingId = linked('COLLECTION', collection.externalId);
    const existing = existingId ? await tx.collection.findFirst({ where: { id: existingId, storeId } }) : null;
    const saved = existing
      ? await tx.collection.update({ where: { id: existing.id }, data: { name: collection.title } })
      : await tx.collection.create({ data: { storeId, name: collection.title, slug: collectionSlug(collection.externalId, taken), sortOrder: index } });
    taken.add(saved.slug);
    await tx.collectionProduct.deleteMany({ where: { collectionId: saved.id } });
    const members = [...new Set(collection.productExternalIds.map(id => productIds.get(id)).filter((id): id is string => Boolean(id)))];
    await tx.collectionProduct.createMany({ data: members.map((paymentLinkId, sortOrder) => ({ collectionId: saved.id, paymentLinkId, sortOrder })) });
    collectionSlugs.set(collection.externalId, saved.slug);
    summary.collections++;
    await link('COLLECTION', collection.externalId, saved.id);
  }

  for (const article of input.articles) {
    const existingId = linked('ARTICLE', article.externalId);
    const existing = existingId ? await tx.storeArticle.findFirst({ where: { id: existingId, storeId } }) : null;
    let saved;
    if (existing) saved = await tx.storeArticle.update({ where: { id: existing.id }, data: { title: article.title, excerpt: article.excerpt, body: article.body, revision: { increment: 1 } } });
    else {
      let slug = article.slug;
      for (let suffix = 2; await tx.storeArticle.findUnique({ where: { storeId_locale_slug: { storeId, locale: 'es', slug } } }); suffix++) slug = `${article.slug.slice(0, 76)}-${suffix}`;
      saved = await tx.storeArticle.create({ data: { storeId, locale: 'es', slug, title: article.title, excerpt: article.excerpt, body: article.body, author: input.authorName, publishedAt: null } });
    }
    summary.articles++;
    await link('ARTICLE', article.externalId, saved.id);
  }

  // Collections first: fewer, and they carry more links from outside.
  const wanted = [
    ...[...collectionSlugs].map(([handle, slug]) => ({ fromPath: `/collections/${handle}`, toPath: `/c/${slug}` })),
    ...[...productIds].map(([handle, id]) => ({ fromPath: `/products/${handle}`, toPath: `/p/${id}` })),
  ].filter(redirect => SHOPIFY_PATH.test(redirect.fromPath) && redirect.fromPath.length <= 200);
  const existingPaths = new Set((await tx.storeRedirect.findMany({ where: { storeId }, select: { fromPath: true } })).map(row => row.fromPath));
  let room = REDIRECT_CAP - existingPaths.size;
  for (const redirect of wanted) {
    if (!existingPaths.has(redirect.fromPath)) { if (room <= 0) { summary.skippedRedirects++; continue; } room--; }
    await tx.storeRedirect.upsert({ where: { storeId_fromPath: { storeId, fromPath: redirect.fromPath } }, create: { storeId, ...redirect }, update: { toPath: redirect.toPath } });
    summary.redirects++;
  }
  return summary;
}
```

Redirects are written directly (not through `StorePagesService.saveRedirect`): the targets are generated `/p/<id>` and `/c/<slug>` paths, they cannot form cycles (no `fromPath` starts with `/p/` or `/c/`), and the 500 cap is enforced above under the same `Store` row lock that `saveRedirect` takes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest --config jest.integration.config.js src/store-import/import-writer.integration.spec.ts`
Expected: PASS (3 tests, not skipped).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/store-import/import-writer.ts apps/api/src/store-import/import-writer.integration.spec.ts
git commit -m "feat(store-import): write an import in one transaction — products, variants, categories, collections, unpublished pages and Shopify redirects, idempotent on re-import"
```

---

### Task 8: Service, controller, worker and module

**Files:**
- Create: `apps/api/src/store-import/store-import.service.ts`
- Create: `apps/api/src/store-import/store-import.controller.ts`
- Create: `apps/api/src/store-import/store-import.worker.ts`
- Create: `apps/api/src/store-import/store-import.module.ts`
- Create: `apps/api/src/store-import/dto.ts`
- Modify: `apps/api/src/app.module.ts` (imports array)
- Test: `apps/api/src/store-import/store-import.service.spec.ts`

**Interfaces:**
- Consumes: `readShopifyStore`, `ShopifyReadError` (Task 3); `readShopifyCsv` (Task 4); `buildPreview`, `mapProduct`, `mapArticle`, `ImportProduct` (Task 5); `copyPhotos` (Task 6); `writeImport` (Task 7); `StoresService.create(merchantId, { name })`; `UploadsService.saveBuffer(buffer, mime)`; `PrismaService`.
- Produces (routes, all under `MerchantAuthGuard, MerchantThrottlerGuard`):
  - `POST /v1/store-imports/shopify` `{ url }` → `ImportView` (`@Throttle({ default: { limit: 5, ttl: 3_600_000 } })`)
  - `POST /v1/store-imports/shopify-csv` `{ csv, name, host? }` → `ImportView` (same throttle; `csv` ≤ 5,000,000 chars)
  - `GET /v1/store-imports/:id` → `ImportView`
  - `POST /v1/store-imports/:id/confirm` `{ exchangeRate?: number, excluded?: string[] }` → `ImportView`
  - `POST /v1/store-imports/:id/retry` → `ImportView`
  - `ImportView` = the `StoreImport` row without `data`, `photos`, `leaseToken`, `leaseUntil`, `exchangeRateMilli`, `excluded`, plus `freeBuildAvailable: boolean`
  - `StoreImportService.claim(): Promise<StoreImport | null>`, `StoreImportService.run(row: StoreImport): Promise<void>`, `MAX_FREE_BUILD_TRIES = 2`

- [ ] **Step 1: Write the failing service tests (Prisma mocked; the database behavior is covered by Task 7)**

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreImportService } from './store-import.service';

const row = (over: any = {}) => ({ id: 'imp', merchantId: 'm', storeId: null, source: 'SHOPIFY_URL', sourceHost: 'x.com', status: 'REVIEW', exchangeRateMilli: null, excluded: [], photos: {}, progress: {}, summary: null, error: null, attempts: 0, designOption: null, designStatus: null, designTries: 0, designRevision: null, designError: null,
  data: { host: 'x.com', origin: 'https://x.com/', name: 'X', currency: 'USD', products: [], collections: [], articles: [], truncated: false, stockKnown: false, warnings: [] },
  preview: { needsExchangeRate: true, products: [{ externalId: 'a' }] }, ...over });

function setup(found: any = row()) {
  const prisma: any = {
    storeImport: { findFirst: jest.fn(async () => found), create: jest.fn(async ({ data }) => ({ ...row(), ...data })), updateMany: jest.fn(async () => ({ count: 1 })) },
    merchant: { findUnique: jest.fn(async () => ({ importBuildUsedAt: null })) },
  };
  const service = new StoreImportService(prisma, { create: jest.fn() } as any, { saveBuffer: jest.fn() } as any);
  return { service, prisma };
}

describe('StoreImportService', () => {
  it('only shows an import to its merchant', async () => {
    const { service, prisma } = setup(null);
    await expect(service.get('other', 'imp')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.storeImport.findFirst).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'other' } });
  });

  it('never exposes the raw data, photo map or lease in the view', async () => {
    const view = await setup().service.get('m', 'imp');
    expect(view).not.toHaveProperty('data'); expect(view).not.toHaveProperty('photos'); expect(view).not.toHaveProperty('leaseToken');
    expect(view.freeBuildAvailable).toBe(true);
  });

  it('refuses to confirm a foreign-currency store without an exchange rate', async () => {
    await expect(setup().service.confirm('m', 'imp', {})).rejects.toThrow('tipo de cambio');
  });

  it('queues a confirmed import with the rate in thousandths and only known unchecked products', async () => {
    const { service, prisma } = setup();
    await service.confirm('m', 'imp', { exchangeRate: 6.96, excluded: ['a', 'zzz'] });
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'm', status: 'REVIEW' }, data: { status: 'QUEUED', exchangeRateMilli: 6960, excluded: ['a'] } });
  });

  it('only retries a failed import', async () => {
    await expect(setup(row({ status: 'COMPLETED' })).service.retry('m', 'imp')).rejects.toBeInstanceOf(BadRequestException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/store-import.service.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `dto.ts`**

```ts
import { ArrayMaxSize, IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
export class ShopifyUrlDto { @IsString() @MaxLength(300) url!: string; }
export class ShopifyCsvDto { @IsString() @MaxLength(5_000_000) csv!: string; @IsString() @MaxLength(120) name!: string; @IsOptional() @IsString() @MaxLength(253) host?: string; }
export class ConfirmImportDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 3 }) @Min(0.001) @Max(100000) exchangeRate?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(1000) @IsString({ each: true }) @MaxLength(255, { each: true }) excluded?: string[];
}
```

- [ ] **Step 4: Implement `store-import.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StoreImport } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StoresService } from '../stores/stores.service';
import { UploadsService } from '../uploads/uploads.service';
import { writeImport } from './import-writer';
import { copyPhotos } from './photo-copier';
import { readShopifyCsv } from './shopify-csv';
import { buildPreview, mapArticle, mapProduct, type ImportProduct } from './shopify-mapping';
import { readShopifyStore, ShopifyReadError } from './shopify-reader';
import type { ShopifyStoreData } from './shopify-types';

const LEASE_MS = 5 * 60_000;
export const MAX_FREE_BUILD_TRIES = 2;

@Injectable()
export class StoreImportService {
  constructor(private readonly prisma: PrismaService, private readonly stores: StoresService, private readonly uploads: UploadsService) {}

  private async view(row: StoreImport) {
    const merchant = await this.prisma.merchant.findUnique({ where: { id: row.merchantId }, select: { importBuildUsedAt: true } });
    const { data: _data, photos: _photos, leaseToken: _lease, leaseUntil: _until, exchangeRateMilli: _rate, excluded: _excluded, ...rest } = row;
    return { ...rest, freeBuildAvailable: !merchant?.importBuildUsedAt && row.designTries < MAX_FREE_BUILD_TRIES };
  }

  private async owned(merchantId: string, id: string) {
    const row = await this.prisma.storeImport.findFirst({ where: { id, merchantId } });
    if (!row) throw new NotFoundException('No encontramos esa importación.');
    return row;
  }

  async get(merchantId: string, id: string) { return this.view(await this.owned(merchantId, id)); }

  async previewUrl(merchantId: string, url: string) {
    let data: ShopifyStoreData;
    try { data = await readShopifyStore(url); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_URL', data);
  }

  async previewCsv(merchantId: string, csv: string, name: string, host?: string) {
    let data: ShopifyStoreData;
    try { data = readShopifyCsv(csv, name.trim() || 'Mi tienda', (host || 'csv.shopify').toLowerCase()); }
    catch (error) { if (error instanceof ShopifyReadError) throw new BadRequestException({ message: error.message, code: error.code }); throw error; }
    return this.create(merchantId, 'SHOPIFY_CSV', data);
  }

  private async create(merchantId: string, source: string, data: ShopifyStoreData) {
    // A re-import of a store this merchant already brought over goes back into the same pagosYa store.
    const previous = await this.prisma.storeImport.findFirst({ where: { merchantId, sourceHost: data.host, storeId: { not: null } }, orderBy: { createdAt: 'desc' } });
    const row = await this.prisma.storeImport.create({ data: { merchantId, source, sourceHost: data.host, storeId: previous?.storeId ?? null,
      data: data as unknown as Prisma.InputJsonValue, preview: buildPreview(data) as unknown as Prisma.InputJsonValue } });
    return this.view(row);
  }

  async confirm(merchantId: string, id: string, input: { exchangeRate?: number; excluded?: string[] }) {
    const row = await this.owned(merchantId, id);
    const preview = row.preview as { needsExchangeRate: boolean; products: Array<{ externalId: string }> };
    if (preview.needsExchangeRate && !input.exchangeRate) throw new BadRequestException('Indica el tipo de cambio a bolivianos para convertir tus precios.');
    const known = new Set(preview.products.map(product => product.externalId));
    const changed = await this.prisma.storeImport.updateMany({ where: { id, merchantId, status: 'REVIEW' },
      data: { status: 'QUEUED', exchangeRateMilli: input.exchangeRate ? Math.round(input.exchangeRate * 1000) : null, excluded: (input.excluded ?? []).filter(item => known.has(item)) } });
    if (!changed.count) throw new BadRequestException('Esta importación ya se confirmó.');
    return this.get(merchantId, id);
  }

  async retry(merchantId: string, id: string) {
    const row = await this.owned(merchantId, id);
    if (row.status !== 'FAILED') throw new BadRequestException('Solo se puede reintentar una importación que falló.');
    await this.prisma.storeImport.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'QUEUED', error: null } });
    return this.get(merchantId, id);
  }

  async claim() {
    const row = await this.prisma.storeImport.findFirst({ where: { OR: [{ status: 'QUEUED' }, { status: 'RUNNING', leaseUntil: { lt: new Date() } }] }, orderBy: { updatedAt: 'asc' } });
    if (!row) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, status: row.status, leaseToken: row.leaseToken }, data: { status: 'RUNNING', leaseToken, leaseUntil: new Date(Date.now() + LEASE_MS), attempts: { increment: 1 } } });
    return changed.count ? this.prisma.storeImport.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  private checkpoint(row: StoreImport, data: Prisma.StoreImportUncheckedUpdateManyInput) {
    return this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { ...data, leaseUntil: new Date(Date.now() + LEASE_MS) } });
  }

  async run(row: StoreImport) {
    try {
      const data = row.data as unknown as ShopifyStoreData;
      let storeId = row.storeId;
      if (!storeId) {
        storeId = (await this.stores.create(row.merchantId, { name: data.name.slice(0, 120) } as never)).id;
        await this.checkpoint(row, { storeId });
      }
      const excluded = new Set(row.excluded);
      const warnings: string[] = [];
      const products: ImportProduct[] = [];
      for (const product of data.products.filter(product => !excluded.has(product.handle))) {
        const mapped = mapProduct(product, data.currency === 'BOB' ? null : row.exchangeRateMilli, data.stockKnown);
        if ('problem' in mapped) warnings.push(mapped.problem); else products.push(mapped.product);
      }
      const sources = products.flatMap(product => [...product.imageSources, ...product.variants.map(variant => variant.imageSource).filter((src): src is string => Boolean(src))]);
      await this.checkpoint(row, { progress: { stage: 'photos', done: 0, total: new Set(sources).size } });
      const copied = await copyPhotos(sources, { storeHost: data.host, done: row.photos as Record<string, string>, save: (buffer, mime) => this.uploads.saveBuffer(buffer, mime),
        onProgress: async (done, total) => { if (done % 10 === 0 || done === total) await this.checkpoint(row, { progress: { stage: 'photos', done, total } }); } });
      await this.checkpoint(row, { photos: copied.urls, progress: { stage: 'catalog' } });
      if (copied.failed.length) warnings.push(`${copied.failed.length} ${copied.failed.length === 1 ? 'foto no se pudo copiar' : 'fotos no se pudieron copiar'}; los productos se crearon sin ellas.`);
      const summary = await this.prisma.$transaction(tx => writeImport(tx, {
        storeId: storeId!, sourceHost: data.host, authorName: data.name,
        products: products.map(product => ({ ...product, imageUrls: product.imageSources.map(src => copied.urls[src]).filter(Boolean), variantImageUrls: product.variants.map(variant => variant.imageSource ? copied.urls[variant.imageSource] : undefined) })),
        collections: data.collections.map(collection => ({ externalId: collection.handle, title: collection.title, productExternalIds: collection.productHandles.filter(handle => !excluded.has(handle)) })),
        articles: data.articles.map(mapArticle),
      }), { timeout: 120_000 });
      if (summary.skippedRedirects) warnings.push(`${summary.skippedRedirects} enlaces viejos no se redirigieron: se alcanzó el límite de 500 redirecciones.`);
      await this.checkpoint(row, { status: 'COMPLETED', summary: { ...summary, warnings } as unknown as Prisma.InputJsonValue, progress: { stage: 'done' }, completedAt: new Date(), leaseToken: null });
    } catch (error) {
      const message = error instanceof BadRequestException || error instanceof ShopifyReadError ? (error as Error).message : 'No pudimos terminar la importación. Si reintentas, nada se duplicará.';
      await this.prisma.storeImport.updateMany({ where: { id: row.id, leaseToken: row.leaseToken }, data: { status: 'FAILED', error: message, leaseToken: null } });
    }
  }
}
```

- [ ] **Step 5: Implement the controller, worker and module**

```ts
// store-import.controller.ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentMerchant } from '../auth/decorators/current-merchant.decorator';
import { MerchantAuthGuard } from '../dashboard/guards/merchant-auth.guard';
import { MerchantThrottlerGuard } from '../storefront-source/source-compile-budget';
import { ConfirmImportDto, ShopifyCsvDto, ShopifyUrlDto } from './dto';
import { StoreImportService } from './store-import.service';

@Controller('v1/store-imports') @UseGuards(MerchantAuthGuard, MerchantThrottlerGuard)
export class StoreImportController {
  constructor(private readonly imports: StoreImportService) {}
  @Post('shopify') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  shopify(@CurrentMerchant() m: { id: string }, @Body() dto: ShopifyUrlDto) { return this.imports.previewUrl(m.id, dto.url); }
  @Post('shopify-csv') @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  csv(@CurrentMerchant() m: { id: string }, @Body() dto: ShopifyCsvDto) { return this.imports.previewCsv(m.id, dto.csv, dto.name, dto.host); }
  @Get(':id') get(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.imports.get(m.id, id); }
  @Post(':id/confirm') confirm(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: ConfirmImportDto) { return this.imports.confirm(m.id, id, dto); }
  @Post(':id/retry') retry(@CurrentMerchant() m: { id: string }, @Param('id') id: string) { return this.imports.retry(m.id, id); }
}
```

```ts
// store-import.worker.ts
import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { StoreImportService } from './store-import.service';

/** One import at a time per API process; a crashed run is picked up again when its lease expires. */
@Injectable()
export class StoreImportWorker {
  private busy = false;
  constructor(private readonly imports: StoreImportService) {}
  @Interval(3000)
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try { const row = await this.imports.claim(); if (row) await this.imports.run(row); }
    catch { /* The next tick retries; failures inside run() are recorded on the row. */ }
    finally { this.busy = false; }
  }
}
```

```ts
// store-import.module.ts
import { Module } from '@nestjs/common';
import { StoresModule } from '../stores/stores.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StoreImportController } from './store-import.controller';
import { StoreImportService } from './store-import.service';
import { StoreImportWorker } from './store-import.worker';

@Module({ imports: [StoresModule, UploadsModule], controllers: [StoreImportController], providers: [StoreImportService, StoreImportWorker] })
export class StoreImportModule {}
```

Add `StoreImportModule` to the `imports` array in `apps/api/src/app.module.ts` next to `CollectionsModule`. Check that `StoresModule` exports `StoresService` and `UploadsModule` exports `UploadsService` (`grep -n exports apps/api/src/stores/stores.module.ts apps/api/src/uploads/uploads.module.ts`); add the export where missing. Check the JSON body limit accepts a 5 MB CSV (`grep -n "limit" apps/api/src/main.ts`); if the global limit is below 6 MB, register `app.use('/v1/store-imports/shopify-csv', json({ limit: '6mb' }))` (from `express`) before the global body parser.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/store-import && npx tsc --noEmit -p tsconfig.json`
Expected: all store-import unit suites PASS; tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/store-import apps/api/src/app.module.ts apps/api/src/stores/stores.module.ts apps/api/src/uploads/uploads.module.ts apps/api/src/main.ts
git commit -m "feat(store-import): preview, confirm and retry Shopify imports; a background worker copies photos and writes the catalog into a new store"
```

---

### Task 9: Old Shopify links redirect on the merchant's domain

**Files:**
- Modify: `apps/api/src/commerce-platform/store-pages.service.ts` (add `publicRedirect`)
- Modify: `apps/api/src/commerce-platform/store-pages.controller.ts` (`StorePagesController`: `GET redirect`)
- Modify: `apps/checkout/storefront-seo.mjs` (custom-host branch)
- Test: `apps/api/src/commerce-platform/store-pages.redirect.spec.ts`, `apps/checkout/server-test/seo.test.mjs` (new test)

**Interfaces:**
- Produces: `GET /v1/stores/public/:slug/redirect?path=/products/x` → `{ location: '/p/<id>' }` or 404. `StorePagesService.publicRedirect(slug: string, path: string): Promise<{ location: string }>`; `/collections/<c>/products/<h>` resolves through `/products/<h>`.

- [ ] **Step 1: Write the failing API test**

```ts
import { NotFoundException } from '@nestjs/common';
import { StorePagesService } from './store-pages.service';

const table: Record<string, { toPath: string }> = { '/products/croquetas': { toPath: '/p/abc' }, '/collections/perros': { toPath: '/c/perros' } };
const prisma: any = {
  store: { findFirst: jest.fn(async () => ({ id: 's1', brandProfile: null })) },
  storeRedirect: { findUnique: jest.fn(async ({ where }) => table[where.storeId_fromPath.fromPath] ?? null) },
};
const service = new StorePagesService(prisma, { get: () => undefined } as any);

describe('public Shopify-path redirects', () => {
  it('resolves products, collections and nested collection product links', async () => {
    await expect(service.publicRedirect('tienda', '/products/croquetas')).resolves.toEqual({ location: '/p/abc' });
    await expect(service.publicRedirect('tienda', '/collections/perros')).resolves.toEqual({ location: '/c/perros' });
    await expect(service.publicRedirect('tienda', '/collections/perros/products/croquetas')).resolves.toEqual({ location: '/p/abc' });
  });
  it('404s unknown and non-Shopify paths', async () => {
    await expect(service.publicRedirect('tienda', '/products/nada')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.publicRedirect('tienda', '/admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/commerce-platform/store-pages.redirect.spec.ts`
Expected: FAIL — `service.publicRedirect is not a function`.

- [ ] **Step 3: Implement the API side**

In `StorePagesService`:

```ts
  /** Old Shopify links on a custom domain (spec 2026-09-27 §2): /products/<h>, /collections/<h>, /collections/<c>/products/<h>. */
  async publicRedirect(slug: string, path: string) {
    const match = /^\/(?:collections\/([a-z0-9-]{1,120})\/)?(products|collections)\/([a-z0-9-]{1,120})\/?$/.exec(path);
    if (!match) throw new NotFoundException();
    const store = await this.store(slug);
    const fromPath = `/${match[2]}/${match[3]}`;
    const redirect = await this.prisma.storeRedirect.findUnique({ where: { storeId_fromPath: { storeId: store.id, fromPath } } });
    if (!redirect || !/^\/(?:p|c)\/[\w-]+$/.test(redirect.toPath)) throw new NotFoundException();
    return { location: redirect.toPath };
  }
```

In `StorePagesController` add (and `Query` is already imported):

```ts
  @Get('redirect') @Header('Cache-Control', 'no-cache')
  redirect(@Param('slug') s: string, @Query('path') path?: string) { return this.pages.publicRedirect(s, String(path ?? '')); }
```

- [ ] **Step 4: Run the API test to verify it passes**

Run: `cd apps/api && npx jest src/commerce-platform/store-pages.redirect.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing storefront test**

Append to `apps/checkout/server-test/seo.test.mjs`:

```js
test('old Shopify links on a custom domain 301 to the imported product and collection', async () => {
  const backend = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/stores/public/domain')) return res.end(JSON.stringify({ slug: 'cafe' }));
    if (req.url === '/stores/public/cafe/redirect?path=%2Fproducts%2Fgrano') return res.end(JSON.stringify({ location: '/p/abc' }));
    res.writeHead(404).end();
  }); backend.listen(0, '127.0.0.1'); await once(backend, 'listening');
  const middleware = createStorefrontSeo({ apiBase: `http://127.0.0.1:${backend.address().port}`, checkoutOrigin: 'https://shop.example', template: async () => '<head></head>' });
  const frontend = createServer((req, res) => middleware(req, res, () => res.writeHead(404).end('next'))); frontend.listen(0, '127.0.0.1'); await once(frontend, 'listening');
  const port = frontend.address().port;
  const moved = await new Promise((resolve, reject) => { const req = httpRequest({ host: '127.0.0.1', port, path: '/products/grano', headers: { Host: 'micafe.com' } }, res => { res.resume(); resolve({ status: res.statusCode, location: res.headers.location }); }); req.on('error', reject); req.end(); });
  assert.deepEqual(moved, { status: 301, location: '/p/abc' });
  const missing = await fetchAsHost(port, '/products/otro', 'micafe.com');
  assert.equal(missing.status, 404);
  backend.close(); frontend.close();
});
```

Run: `cd apps/checkout && node --test server-test/seo.test.mjs`
Expected: the new test FAILS (404 from `next`, no redirect).

- [ ] **Step 6: Implement the storefront side**

In the handler returned by `createStorefrontSeo` in `apps/checkout/storefront-seo.mjs`, right after `customHost` is computed and before `if (!route && !rootAsset && !customHostRoute) return next();`, add:

```js
    // Links from a store imported from Shopify (spec 2026-09-27): /products/<h>, /collections/<h>, /collections/<c>/products/<h>.
    if (customHost && /^\/(?:collections\/[a-z0-9-]+\/)?(?:products|collections)\/[a-z0-9-]+\/?$/.test(url.pathname)) {
      try {
        const domain = await get(`/stores/public/domain?hostname=${encodeURIComponent(url.hostname)}`, 'json', 300_000);
        const shopifyPath = url.pathname.replace(/\/$/, '').replace(/^\/collections\/[a-z0-9-]+(?=\/products\/)/, '');
        const target = await get(`/stores/public/${encodeURIComponent(domain.slug)}/redirect?path=${encodeURIComponent(shopifyPath)}`, 'json', 60_000);
        if (typeof target?.location === 'string' && /^\/(?:p|c)\/[\w-]+$/.test(target.location)) {
          response.writeHead(301, { Location: target.location + url.search, 'Cache-Control': 'public, max-age=3600' });
          return response.end();
        }
      } catch { /* Unknown path or store: the normal 404 below. */ }
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return response.end('Not found');
    }
```

- [ ] **Step 7: Run both suites**

Run: `cd apps/checkout && node --test server-test/seo.test.mjs && cd ../api && npx jest src/commerce-platform`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/commerce-platform/store-pages.service.ts apps/api/src/commerce-platform/store-pages.controller.ts apps/api/src/commerce-platform/store-pages.redirect.spec.ts apps/checkout/storefront-seo.mjs apps/checkout/server-test/seo.test.mjs
git commit -m "feat(storefront): old Shopify links on a merchant's domain 301 to the imported product or collection"
```

---

### Task 10: The free YAPI build

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:240` (execution option `sponsor`) and `:477` (write it on the run)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (new `importBuild`)
- Modify: `apps/api/src/store-import/store-import.service.ts` (`requestDesign`, `claimDesign`, `runDesign`; constructor gains `SourceChatService`)
- Modify: `apps/api/src/store-import/store-import.controller.ts` (`POST :id/design`)
- Modify: `apps/api/src/store-import/store-import.worker.ts` (second claim)
- Modify: `apps/api/src/store-import/store-import.module.ts` (import the storefront-source module that exports `SourceChatService`)
- Modify: `apps/api/src/store-import/store-import.service.spec.ts` (fourth constructor argument)
- Test: `apps/api/src/store-import/store-import.design.spec.ts`

**Interfaces:**
- Consumes: `SourceChatService`; `captureSourceReference(url)` from `./source-reference-capture`; `sourceWebsiteReferenceCaptures(references)` from `./source-website-reference`; `SourceRequestBudget`; `SourceGenerationService.generate(..., execution)`; `createSourceProgress`; `sourceRequestExecutionPrompt`.
- Produces:
  - `SourceChatService.importBuild(merchantId: string, storeId: string, input: { importId: string; option: 'same' | 'redesign'; origin: string; productHandle?: string; summary: string }): Promise<{ revision: number }>`
  - `StoreImportService.requestDesign(merchantId: string, id: string, option: 'same' | 'redesign')`, `claimDesign()`, `runDesign(row)`
  - `POST /v1/store-imports/:id/design` `{ option: 'same' | 'redesign' }` → `ImportView`
  - constants `IMPORT_BUILD_MODEL = 'gpt-5.6-terra'`, `IMPORT_BUILD_MAX_CREDITS = 150` (exported from `source-chat.service.ts`)

- [ ] **Step 1: Write the failing tests**

```ts
import { ConflictException } from '@nestjs/common';
import { StoreImportService } from './store-import.service';

const completed = (over: any = {}) => ({ id: 'imp', merchantId: 'm', storeId: 's', status: 'COMPLETED', designTries: 0, designStatus: null, designOption: null, sourceHost: 'x.com', leaseToken: null,
  data: { origin: 'https://x.com/', name: 'X', products: [{ handle: 'croquetas', title: 'Croquetas' }], collections: [], articles: [] }, preview: {}, ...over });

function setup(row: any, usedAt: Date | null = null, chat: any = { importBuild: jest.fn(async () => ({ revision: 3 })) }) {
  const prisma: any = {
    storeImport: { findFirst: jest.fn(async () => row), findUniqueOrThrow: jest.fn(async () => row), updateMany: jest.fn(async () => ({ count: 1 })) },
    merchant: { findUnique: jest.fn(async () => ({ importBuildUsedAt: usedAt })), update: jest.fn() },
  };
  return { service: new StoreImportService(prisma, {} as any, {} as any, chat), prisma, chat };
}

describe('free import build', () => {
  it('queues the first build for a completed import', async () => {
    const { service, prisma } = setup(completed());
    await service.requestDesign('m', 'imp', 'same');
    expect(prisma.storeImport.updateMany).toHaveBeenCalledWith({ where: { id: 'imp', merchantId: 'm', status: 'COMPLETED', OR: [{ designStatus: null }, { designStatus: 'FAILED' }] }, data: { designStatus: 'QUEUED', designOption: 'same', designError: null } });
  });

  it('refuses once the merchant used the free build or after two failed tries', async () => {
    await expect(setup(completed(), new Date()).service.requestDesign('m', 'imp', 'same')).rejects.toBeInstanceOf(ConflictException);
    await expect(setup(completed({ designTries: 2, designStatus: 'FAILED' })).service.requestDesign('m', 'imp', 'redesign')).rejects.toBeInstanceOf(ConflictException);
  });

  it('a successful build marks the merchant; a failed one counts a try', async () => {
    const running = completed({ designStatus: 'RUNNING', designOption: 'same' });
    const ok = setup(running);
    await ok.service.runDesign(running as any);
    expect(ok.chat.importBuild).toHaveBeenCalledWith('m', 's', expect.objectContaining({ importId: 'imp', option: 'same', origin: 'https://x.com/', productHandle: 'croquetas' }));
    expect(ok.prisma.merchant.update).toHaveBeenCalledWith({ where: { id: 'm' }, data: { importBuildUsedAt: expect.any(Date) } });
    const bad = setup(running, null, { importBuild: jest.fn(async () => { throw new Error('boom'); }) });
    await bad.service.runDesign(running as any);
    expect(bad.prisma.storeImport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ designStatus: 'FAILED', designTries: { increment: 1 } }) }));
    expect(bad.prisma.merchant.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/store-import/store-import.design.spec.ts`
Expected: FAIL — `service.requestDesign is not a function`.

- [ ] **Step 3: Record the sponsor on generation runs**

In `source-generation.service.ts`, add `sponsor?: 'shopify-import';` to the `execution` parameter type of `generate` (line 240), and change the run creation (line 477) to:

```ts
      run = await this.prisma.storeSourceGeneration.create({ data: { storeId, activeStoreId: storeId, baseRevision: dto.revision, requestedModel: plan.requestedModel, model: plan.model, maxCredits, ...(execution?.sponsor ? { sponsor: execution.sponsor } : {}) } });
```

- [ ] **Step 4: Add `importBuild` to `SourceChatService`**

Top-level in `source-chat.service.ts` (add imports for `captureSourceReference` from `./source-reference-capture` and `sourceWebsiteReferenceCaptures`, `type SourceWebsiteReference` from `./source-website-reference` if missing):

```ts
export const IMPORT_BUILD_MODEL = 'gpt-5.6-terra';
export const IMPORT_BUILD_MAX_CREDITS = 150;
const IMPORT_BUILD_REQUEST = {
  same: 'Recrea esta tienda en pagosYa con el mismo estilo de su tienda Shopify actual: estructura, orden de secciones, colores, tipografías y textos de portada, usando sus fotos ya importadas. Las capturas adjuntas son su tienda actual.',
  redesign: 'Diseña una tienda nueva y moderna para este negocio con su marca: logo, colores y fotos ya importadas. Las capturas adjuntas muestran su tienda anterior solo como contexto del negocio; no la copies.',
} as const;
```

Method, next to `applyTemplate`:

```ts
  /** Spec 2026-09-27 §3: the free first build after a Shopify import. Progress is saved on the user message under requestId = importId. */
  async importBuild(merchantId: string, storeId: string, input: { importId: string; option: 'same' | 'redesign'; origin: string; productHandle?: string; summary: string }) {
    const current = await this.projects.current(merchantId, storeId);
    const thread = await this.prisma.storeAgentThread.upsert({ where: { storeId }, create: { storeId }, update: { updatedAt: new Date() } });
    const request = IMPORT_BUILD_REQUEST[input.option];
    const metadata = { assetUrls: [], revision: current.revision, requestId: input.importId };
    const userMessage = await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'USER', content: input.option === 'same' ? 'Recrear mi tienda de Shopify' : 'Rediseñar mi tienda con mi marca', metadata } });
    const workflow = createSourceProgress(progress => this.prisma.storeAgentMessage.update({ where: { id: userMessage.id }, data: { metadata: { ...metadata, progress } } }));
    await workflow.report('interpreting');
    const urls = [input.origin, ...(input.productHandle ? [new URL(`/products/${input.productHandle}`, input.origin).href] : [])];
    const references: SourceWebsiteReference[] = await Promise.all(urls.map(async url => ({ url, status: 'inspected' as const, evidence: '', rendered: await captureSourceReference(url).catch(() => undefined) })));
    try {
      const revision = await this.generation.generate(merchantId, storeId, {
        revision: current.revision, model: IMPORT_BUILD_MODEL, maxCredits: IMPORT_BUILD_MAX_CREDITS,
        brief: { sitePurpose: 'shop', businessInformation: input.summary, businessType: 'Tienda en línea', audience: 'Clientes de la tienda', primaryAction: 'Comprar', visualDirection: input.option === 'same' ? 'El estilo de su tienda Shopify actual' : 'Diseño nuevo con su marca' },
        instruction: `${sourceRequestExecutionPrompt(request, current.revision > 0)}\n\nContexto del negocio:\n${input.summary}\n\nPedido actual del comercio:\n${request}`,
      }, new SourceRequestBudget(IMPORT_BUILD_MAX_CREDITS), [], workflow.report, { free: true, sponsor: 'shopify-import', referenceCaptures: sourceWebsiteReferenceCaptures(references), ...(input.option === 'redesign' && current.revision ? { redesign: true } : {}) });
      await workflow.finish('completed');
      await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT',
        content: input.option === 'same' ? 'Recreé tu tienda de Shopify con tus productos y fotos. Revisa la vista previa y publícala cuando quieras.' : 'Diseñé una tienda nueva con tu marca, tus productos y tus fotos. Revisa la vista previa y publícala cuando quieras.',
        metadata: { progress: workflow.value, sourceRevision: revision.revision, label: revision.label } } });
      return { revision: revision.revision };
    } catch (error) {
      await workflow.finish('failed');
      throw error;
    }
  }
```

Check the exact shapes before relying on them: `this.projects.current(merchantId, storeId)` returns `{ revision }` (used in `applyTemplate`), `this.generation.generate` returns `{ revision, label }` (used in `useTemplate`), and `SourceWebsiteReference.status` accepts `'inspected'`.

- [ ] **Step 5: Add design request, claim and run to `StoreImportService`**

Constructor: `constructor(private readonly prisma: PrismaService, private readonly stores: StoresService, private readonly uploads: UploadsService, private readonly chat: SourceChatService) {}` (import `SourceChatService` from `../storefront-source/source-chat.service`; `ConflictException`, `HttpException` from `@nestjs/common`). Add:

```ts
  async requestDesign(merchantId: string, id: string, option: 'same' | 'redesign') {
    const row = await this.owned(merchantId, id);
    if (row.status !== 'COMPLETED' || !row.storeId) throw new BadRequestException('Primero termina de importar tu tienda.');
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { importBuildUsedAt: true } });
    if (merchant?.importBuildUsedAt || row.designTries >= MAX_FREE_BUILD_TRIES) throw new ConflictException('Ya usaste tu diseño gratis. Elige una plantilla o pídele cambios a YAPI con tus créditos.');
    const changed = await this.prisma.storeImport.updateMany({ where: { id, merchantId, status: 'COMPLETED', OR: [{ designStatus: null }, { designStatus: 'FAILED' }] }, data: { designStatus: 'QUEUED', designOption: option, designError: null } });
    if (!changed.count) throw new ConflictException('YAPI ya está diseñando esta tienda.');
    return this.get(merchantId, id);
  }

  async claimDesign() {
    const row = await this.prisma.storeImport.findFirst({ where: { designStatus: 'QUEUED' }, orderBy: { updatedAt: 'asc' } });
    if (!row) return null;
    const changed = await this.prisma.storeImport.updateMany({ where: { id: row.id, designStatus: 'QUEUED' }, data: { designStatus: 'RUNNING' } });
    return changed.count ? this.prisma.storeImport.findUniqueOrThrow({ where: { id: row.id } }) : null;
  }

  async runDesign(row: StoreImport) {
    const data = row.data as unknown as ShopifyStoreData;
    const summary = [`Tienda: ${data.name}`, `Productos: ${data.products.slice(0, 30).map(product => product.title).join(', ')}`,
      data.collections.length ? `Colecciones: ${data.collections.map(collection => collection.title).join(', ')}` : ''].filter(Boolean).join('\n');
    try {
      const result = await this.chat.importBuild(row.merchantId, row.storeId!, { importId: row.id, option: row.designOption as 'same' | 'redesign', origin: data.origin, productHandle: data.products[0]?.handle, summary });
      await this.prisma.storeImport.updateMany({ where: { id: row.id }, data: { designStatus: 'COMPLETED', designRevision: result.revision } });
      await this.prisma.merchant.update({ where: { id: row.merchantId }, data: { importBuildUsedAt: new Date() } });
    } catch (error) {
      const message = error instanceof HttpException && error.getStatus() < 500 ? (error as Error).message : 'YAPI no pudo terminar el diseño. Puedes intentarlo una vez más gratis o elegir una plantilla.';
      await this.prisma.storeImport.updateMany({ where: { id: row.id }, data: { designStatus: 'FAILED', designTries: { increment: 1 }, designError: message } });
    }
  }
```

A design run interrupted by a process restart stays `RUNNING`; v1 accepts that (the merchant sees "YAPI está diseñando" until an operator resets it). Note it in the Task 12 report rather than building a lease for it now.

Update `store-import.service.spec.ts`'s `setup()` to pass a fourth constructor argument `{} as any`.

- [ ] **Step 6: Controller route, worker and module**

```ts
// store-import.controller.ts — add IsIn import from class-validator
class DesignDto { @IsIn(['same', 'redesign']) option!: 'same' | 'redesign'; }
  @Post(':id/design') design(@CurrentMerchant() m: { id: string }, @Param('id') id: string, @Body() dto: DesignDto) { return this.imports.requestDesign(m.id, id, dto.option); }
```

In `StoreImportWorker.tick`, inside the `try` after the import claim: `const design = await this.imports.claimDesign(); if (design) await this.imports.runDesign(design);`.

In `store-import.module.ts` import the module that provides `SourceChatService` (`grep -ln "SourceChatService" apps/api/src/storefront-source/*.module.ts`) and add `SourceChatService` to that module's `exports` if missing. If importing it creates a circular module dependency, use `forwardRef(() => ThatModule)`.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd apps/api && npx jest src/store-import src/storefront-source/source-chat src/storefront-source/source-generation && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; tsc exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/store-import apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/*.module.ts
git commit -m "feat(store-import): one free YAPI build per merchant after a Shopify import — recreate the Shopify look or redesign with the brand, on Terra with a 150-credit cap, recorded as sponsored"
```

---

### Task 11: Dashboard — "Traer mi tienda de Shopify"

**Files:**
- Create: `apps/merchant-dashboard/src/store-import.mjs` (pure helpers)
- Test: `apps/merchant-dashboard/src/store-import.test.mjs`
- Modify: `apps/merchant-dashboard/index.html` (button next to the one that opens `#createStoreDialog`; new dialog after `#createStoreDialog`)
- Modify: `apps/merchant-dashboard/src/dashboard.js` (wiring, near the `createStoreForm` handler ~1570)
- Modify: the stylesheet that styles `.create-store-dialog` (find with `grep -rln "create-store-dialog" apps/merchant-dashboard/src apps/merchant-dashboard/*.css`)

**Interfaces:**
- Consumes: the Task 8/10 routes and `ImportView`.
- Produces (in `store-import.mjs`):
  - `importStep(view): 'review' | 'importing' | 'failed' | 'design' | 'building' | 'done'`
  - `countsLine(counts): string`
  - `progressLabel(progress): string`
  - `parseExchangeRate(text): number | null` (accepts `6,96` and `6.96`)

- [ ] **Step 1: Write the failing tests**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countsLine, importStep, parseExchangeRate, progressLabel } from './store-import.mjs';

test('the dialog step follows the import and its design build', () => {
  assert.equal(importStep({ status: 'REVIEW' }), 'review');
  assert.equal(importStep({ status: 'QUEUED' }), 'importing');
  assert.equal(importStep({ status: 'RUNNING' }), 'importing');
  assert.equal(importStep({ status: 'FAILED' }), 'failed');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: null }), 'design');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'FAILED' }), 'design');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'RUNNING' }), 'building');
  assert.equal(importStep({ status: 'COMPLETED', designStatus: 'COMPLETED' }), 'done');
});

test('counts read like Bolivian Spanish and skip empty kinds', () => {
  assert.equal(countsLine({ products: 48, variants: 112, collections: 6, pages: 3, policies: 4, photos: 1210 }), '48 productos · 112 variantes · 6 colecciones · 3 páginas · 4 políticas · 1.210 fotos');
  assert.equal(countsLine({ products: 1, variants: 1, collections: 0, pages: 0, policies: 0, photos: 1 }), '1 producto · 1 variante · 1 foto');
});

test('progress and exchange rate', () => {
  assert.equal(progressLabel({ stage: 'photos', done: 30, total: 120 }), 'Copiando fotos: 30 de 120');
  assert.equal(progressLabel({ stage: 'catalog' }), 'Creando productos, colecciones y páginas…');
  assert.equal(progressLabel({}), 'En cola…');
  assert.equal(parseExchangeRate('6,96'), 6.96);
  assert.equal(parseExchangeRate(' 6.96 '), 6.96);
  assert.equal(parseExchangeRate('0'), null);
  assert.equal(parseExchangeRate('abc'), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/merchant-dashboard && node --test src/store-import.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `store-import.mjs`**

```js
const number = (value) => new Intl.NumberFormat('es-BO').format(value);
const plural = (count, one, many) => `${number(count)} ${count === 1 ? one : many}`;

export function importStep(view) {
  if (view.status === 'REVIEW') return 'review';
  if (view.status === 'QUEUED' || view.status === 'RUNNING') return 'importing';
  if (view.status === 'FAILED') return 'failed';
  if (view.designStatus === 'QUEUED' || view.designStatus === 'RUNNING') return 'building';
  if (view.designStatus === 'COMPLETED') return 'done';
  return 'design';
}

export function countsLine(counts) {
  return [
    plural(counts.products, 'producto', 'productos'),
    counts.variants ? plural(counts.variants, 'variante', 'variantes') : '',
    counts.collections ? plural(counts.collections, 'colección', 'colecciones') : '',
    counts.pages ? plural(counts.pages, 'página', 'páginas') : '',
    counts.policies ? plural(counts.policies, 'política', 'políticas') : '',
    counts.photos ? plural(counts.photos, 'foto', 'fotos') : '',
  ].filter(Boolean).join(' · ');
}

export function progressLabel(progress) {
  if (progress?.stage === 'photos') return `Copiando fotos: ${number(progress.done ?? 0)} de ${number(progress.total ?? 0)}`;
  if (progress?.stage === 'catalog') return 'Creando productos, colecciones y páginas…';
  if (progress?.stage === 'done') return 'Listo';
  return 'En cola…';
}

export function parseExchangeRate(text) {
  const value = Number(String(text).trim().replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}
```

If `Intl.NumberFormat('es-BO')` does not group `1210` as `1.210` in this Node version, reuse `formatCount` from `src/growth.mjs` (its test asserts `12.345`) instead of `number`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/merchant-dashboard && node --test src/store-import.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the dialog markup**

After `#createStoreDialog` in `apps/merchant-dashboard/index.html`:

```html
        <dialog id="shopifyImportDialog" class="create-store-dialog shopify-import-dialog" aria-labelledby="shopifyImportTitle">
          <div class="shopify-import" data-step="start">
            <header><h2 id="shopifyImportTitle">Trae tu tienda de Shopify</h2><p>Importamos tus productos, fotos, colecciones y páginas. Nada se publica sin que lo decidas.</p></header>
            <section data-panel="start">
              <form id="shopifyImportUrlForm"><label for="shopifyImportUrl">Dirección de tu tienda</label><input id="shopifyImportUrl" name="url" placeholder="mitienda.com" required maxlength="300" autocomplete="url"><p id="shopifyImportUrlError" role="alert" hidden></p><button class="primary" type="submit">Revisar</button></form>
              <details id="shopifyImportCsv"><summary>¿Tu tienda tiene contraseña? Sube el CSV de Shopify</summary>
                <form id="shopifyImportCsvForm"><p class="faint">En Shopify: Productos → Exportar → "Todos los productos" → CSV para Excel, Numbers u otros.</p>
                  <label for="shopifyImportCsvName">Nombre de tu tienda</label><input id="shopifyImportCsvName" name="name" required maxlength="120">
                  <label for="shopifyImportCsvFile">Archivo CSV</label><input id="shopifyImportCsvFile" name="file" type="file" accept=".csv,text/csv" required>
                  <button class="primary" type="submit">Revisar archivo</button></form></details>
              <footer><button class="ghost" type="button" data-close>Cancelar</button></footer>
            </section>
            <section data-panel="review" hidden>
              <p id="shopifyImportCounts" class="shopify-import-counts"></p>
              <ul id="shopifyImportWarnings" class="shopify-import-warnings"></ul>
              <p class="faint">No se importan clientes, pedidos, cupones ni apps de Shopify.</p>
              <label id="shopifyImportRateRow" hidden>1 <span id="shopifyImportCurrency"></span> = <input id="shopifyImportRate" inputmode="decimal" size="6"> Bs</label>
              <ul id="shopifyImportProducts" class="shopify-import-products"></ul>
              <footer><button class="ghost" type="button" data-close>Cancelar</button><button class="primary" type="button" id="shopifyImportConfirm">Importar</button></footer>
            </section>
            <section data-panel="importing" hidden><p id="shopifyImportProgress" role="status" aria-live="polite"></p><progress id="shopifyImportBar" max="1" value="0"></progress></section>
            <section data-panel="failed" hidden><p id="shopifyImportError" role="alert"></p><button class="primary" type="button" id="shopifyImportRetry">Reintentar</button></section>
            <section data-panel="design" hidden>
              <p>¿Cómo quieres que se vea tu tienda nueva?</p>
              <div class="shopify-import-choices">
                <button type="button" data-design="same"><strong>Igual que mi Shopify</strong><span>YAPI la recrea con tu estilo actual.</span><em data-free>Gratis la primera vez</em></button>
                <button type="button" data-design="redesign"><strong>Rediseño con mi marca</strong><span>Un diseño nuevo con tu logo, colores y fotos.</span><em data-free>Gratis la primera vez</em></button>
                <button type="button" data-design="template"><strong>Elegir plantilla</strong><span>Sin IA, al instante.</span></button>
              </div>
              <p id="shopifyImportDesignError" role="alert" hidden></p>
            </section>
            <section data-panel="building" hidden><p role="status" aria-live="polite">YAPI está diseñando tu tienda. Puedes cerrar esta ventana; te avisaremos cuando termine.</p></section>
            <section data-panel="done" hidden>
              <p><strong>Tu tienda está lista para revisar.</strong></p>
              <ol class="shopify-import-next"><li>Revisa el diseño y publícalo.</li><li>Conecta tu dominio (cambia los DNS que hoy apuntan a Shopify).</li><li>Revisa el stock y configura tus envíos.</li><li>No canceles Shopify hasta que tu dominio apunte aquí.</li></ol>
              <button class="primary" type="button" id="shopifyImportOpen">Ver mi tienda</button>
            </section>
          </div>
        </dialog>
```

Find the button that opens `#createStoreDialog` (`grep -n "createStoreDialog" apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/index.html`) and add next to it `<button class="ghost" type="button" id="openShopifyImport">Traer mi tienda de Shopify</button>` (created in the same place/way as that button). Inside `#createStoreForm`, before its `<footer>`, add `<p class="faint">¿Vienes de Shopify? <button class="link" type="button" data-open-shopify-import>Trae tu tienda</button></p>`.

- [ ] **Step 6: Wire it in `dashboard.js`**

Add `import { countsLine, importStep, parseExchangeRate, progressLabel } from "./store-import.mjs";` to the file's import block. Before writing the handlers, confirm the helper names exist (`grep -n "function api\b\|const esc\|function setButtonBusy\|function canLeaveMerchantStudio\|function selectStore\|async function refresh\|function setDashboardView\|const errorEl" apps/merchant-dashboard/src/dashboard.js`) and how `api()` exposes an error's JSON body (`grep -n "async function api" -A25 apps/merchant-dashboard/src/dashboard.js`); use that field where `err.body` appears below. For "Elegir plantilla", find what the sidebar's *Plantillas* item calls (`grep -n "Plantillas" apps/merchant-dashboard/src/dashboard.js`) and call the same function where marked.

Near the `createStoreForm` handler:

```js
  const shopifyImportDialog = document.getElementById("shopifyImportDialog");
  let shopifyImport = null, shopifyImportTimer = null;

  function showShopifyImportPanel(step) {
    shopifyImportDialog.querySelector(".shopify-import").dataset.step = step;
    shopifyImportDialog.querySelectorAll("[data-panel]").forEach(panel => { panel.hidden = panel.dataset.panel !== step; });
  }

  function renderShopifyImport(view) {
    shopifyImport = view;
    const step = importStep(view);
    showShopifyImportPanel(step);
    if (step === "review") {
      const preview = view.preview;
      document.getElementById("shopifyImportCounts").textContent = countsLine(preview.counts);
      document.getElementById("shopifyImportWarnings").innerHTML = preview.warnings.map(warning => `<li>${esc(warning)}</li>`).join("");
      document.getElementById("shopifyImportRateRow").hidden = !preview.needsExchangeRate;
      document.getElementById("shopifyImportCurrency").textContent = preview.currency;
      document.getElementById("shopifyImportProducts").innerHTML = preview.products.map(product => `<li><label><input type="checkbox" value="${esc(product.externalId)}" ${product.problem ? "disabled" : "checked"}>${product.image ? `<img src="${esc(product.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "<span></span>"}<span>${esc(product.name)}</span><span class="faint">${esc(product.price)} ${esc(preview.currency)}</span>${product.problem ? `<em>${esc(product.problem)}</em>` : ""}</label></li>`).join("");
    }
    if (step === "importing") {
      document.getElementById("shopifyImportProgress").textContent = progressLabel(view.progress);
      document.getElementById("shopifyImportBar").value = view.progress?.total ? view.progress.done / view.progress.total : 0;
    }
    if (step === "failed") document.getElementById("shopifyImportError").textContent = view.error || "La importación falló.";
    if (step === "design") {
      shopifyImportDialog.querySelectorAll("[data-free]").forEach(badge => { badge.hidden = !view.freeBuildAvailable; });
      shopifyImportDialog.querySelectorAll('[data-design="same"], [data-design="redesign"]').forEach(button => {
        button.disabled = !view.freeBuildAvailable || (button.dataset.design === "same" && view.source === "SHOPIFY_CSV");
      });
      const designError = document.getElementById("shopifyImportDesignError");
      designError.hidden = !view.designError; designError.textContent = view.designError || "";
    }
    clearTimeout(shopifyImportTimer);
    if ((step === "importing" || step === "building") && shopifyImportDialog.open) shopifyImportTimer = setTimeout(async () => {
      try { renderShopifyImport(await api(`/store-imports/${view.id}`)); } catch { renderShopifyImport(view); }
    }, 2000);
  }

  function openShopifyImport() {
    if (!canLeaveMerchantStudio()) return;
    document.getElementById("createStoreDialog").close();
    showShopifyImportPanel("start");
    shopifyImportDialog.showModal();
  }
  document.getElementById("openShopifyImport").addEventListener("click", openShopifyImport);
  document.querySelector("[data-open-shopify-import]").addEventListener("click", openShopifyImport);
  shopifyImportDialog.addEventListener("close", () => clearTimeout(shopifyImportTimer));
  shopifyImportDialog.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => shopifyImportDialog.close()));

  document.getElementById("shopifyImportUrlForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    const urlError = document.getElementById("shopifyImportUrlError");
    urlError.hidden = true;
    setButtonBusy(submit, true, "Leyendo tu tienda…");
    try { renderShopifyImport(await api("/store-imports/shopify", { method: "POST", body: JSON.stringify({ url: document.getElementById("shopifyImportUrl").value }) })); }
    catch (err) {
      if (err.body?.code === "protected") document.getElementById("shopifyImportCsv").open = true;
      urlError.textContent = err.message; urlError.hidden = false;
    } finally { setButtonBusy(submit, false, "Revisar"); }
  });

  document.getElementById("shopifyImportCsvForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    const file = document.getElementById("shopifyImportCsvFile").files[0];
    if (!file) return;
    setButtonBusy(submit, true, "Leyendo el archivo…");
    try { renderShopifyImport(await api("/store-imports/shopify-csv", { method: "POST", body: JSON.stringify({ csv: await file.text(), name: document.getElementById("shopifyImportCsvName").value }) })); }
    catch (err) { const urlError = document.getElementById("shopifyImportUrlError"); urlError.textContent = err.message; urlError.hidden = false; }
    finally { setButtonBusy(submit, false, "Revisar archivo"); }
  });

  document.getElementById("shopifyImportConfirm").addEventListener("click", async event => {
    const button = event.currentTarget;
    const excluded = [...document.querySelectorAll("#shopifyImportProducts input:not(:checked):not(:disabled)")].map(input => input.value);
    const rate = shopifyImport.preview.needsExchangeRate ? parseExchangeRate(document.getElementById("shopifyImportRate").value) : null;
    if (shopifyImport.preview.needsExchangeRate && !rate) { document.getElementById("shopifyImportRate").focus(); return; }
    setButtonBusy(button, true, "Importando…");
    try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/confirm`, { method: "POST", body: JSON.stringify({ excluded, ...(rate ? { exchangeRate: rate } : {}) }) })); }
    catch (err) { errorEl.textContent = err.message; }
    finally { setButtonBusy(button, false, "Importar"); }
  });

  document.getElementById("shopifyImportRetry").addEventListener("click", async () => {
    try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/retry`, { method: "POST" })); } catch (err) { document.getElementById("shopifyImportError").textContent = err.message; }
  });

  async function openImportedStore() {
    shopifyImportDialog.close();
    selectStore(shopifyImport.storeId);
    await refresh();
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView("workspace");
  }

  shopifyImportDialog.querySelectorAll("[data-design]").forEach(button => button.addEventListener("click", async () => {
    if (button.dataset.design === "template") {
      await openImportedStore();
      // Call here what the sidebar's "Plantillas" item calls to open the gallery (see the grep above).
      return;
    }
    try { renderShopifyImport(await api(`/store-imports/${shopifyImport.id}/design`, { method: "POST", body: JSON.stringify({ option: button.dataset.design }) })); }
    catch (err) { const box = document.getElementById("shopifyImportDesignError"); box.hidden = false; box.textContent = err.message; }
  }));

  document.getElementById("shopifyImportOpen").addEventListener("click", openImportedStore);
```

- [ ] **Step 7: Styles**

Add to the stylesheet that defines `.create-store-dialog`, using that file's existing color tokens where the fallbacks are written:

```css
.shopify-import-dialog { width: min(640px, calc(100vw - 32px)); }
.shopify-import-counts { font-weight: 600; }
.shopify-import-warnings { margin: 8px 0; padding-left: 18px; }
.shopify-import-products { max-height: 320px; overflow: auto; list-style: none; margin: 12px 0; padding: 0; display: grid; gap: 6px; }
.shopify-import-products label { display: grid; grid-template-columns: auto 40px 1fr auto; align-items: center; gap: 10px; }
.shopify-import-products img { width: 40px; height: 40px; object-fit: cover; border-radius: 8px; }
.shopify-import-products em { grid-column: 3 / -1; color: var(--danger, #b3261e); font-style: normal; font-size: .85em; }
.shopify-import-choices { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.shopify-import-choices button { display: grid; gap: 4px; text-align: left; padding: 14px; border-radius: 14px; }
.shopify-import-choices button:disabled { opacity: .5; cursor: not-allowed; }
.shopify-import progress { width: 100%; }
```

- [ ] **Step 8: Run the dashboard unit tests and build**

Run: `cd apps/merchant-dashboard && npm run test:unit && npx vite build`
Expected: all unit tests PASS; build succeeds. If `unit/served-modules.test.mjs` fails because `src/store-import.mjs` is not in the served list, add it where that test expects.

- [ ] **Step 9: Commit**

```bash
git add apps/merchant-dashboard/index.html apps/merchant-dashboard/src/dashboard.js apps/merchant-dashboard/src/store-import.mjs apps/merchant-dashboard/src/store-import.test.mjs apps/merchant-dashboard/src/*.css apps/merchant-dashboard/unit
git commit -m "feat(dashboard): Traer mi tienda de Shopify — paste the address or the CSV, review, import with progress, then pick the look"
```

---

### Task 12: Live verification

**Files:** none (evidence only; fix-ups go into the task they belong to, with their own test first).

- [ ] **Step 1: Full test run and typecheck**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/store-import src/commerce-platform src/storefront-source/agent && npx jest --config jest.integration.config.js src/store-import && cd ../checkout && node --test server-test/seo.test.mjs && cd ../merchant-dashboard && npm run test:unit`
Expected: tsc 0; all PASS; the integration suite ran (not skipped).

- [ ] **Step 2: Real preview against live stores**

With the dev stack running (`pnpm dev`; rebuild the Studio and make sure no orphan API holds :3001), log into the dashboard and use the dialog with:
- `peakclyro.myshopify.com` — expect 4 products, currency EUR asking for a rate, no collections (frontpage ignored), 1 page.
- `allbirds.com` — expect the 1,000-product truncation warning, collections and policies found.
- `example.com` — expect "Esa dirección no es una tienda Shopify".

- [ ] **Step 3: Full import + free build on the dev database**

Confirm `peakclyro` with rate 7.5; watch the progress; check in *Productos* that prices are converted (1.99 EUR × 7.5 = Bs 14,93), photos load from `/v1/uploads/`, and the unpublished page exists. Then choose *Igual que mi Shopify* (needs `OPENAI_API_KEY` with balance; if there is none, record that the build was not verified and why). Check the generation row: `sponsor = 'shopify-import'`, `credits = 0`; the merchant's `importBuildUsedAt` is set; a second design request answers "Ya usaste tu diseño gratis".

- [ ] **Step 4: Re-import idempotency**

Paste `peakclyro.myshopify.com` again and confirm: the same store is updated (no second store, product count unchanged).

- [ ] **Step 5: Report**

Tell the owner what was verified and what was not (with the reason), including the known v1 gap from Task 10 (a design run interrupted by a restart stays RUNNING), then stop for review.
