# Conversion Product Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product pages that sell like the Blume reference: a truthful photo badge on every style, plus a fifth product page style `conversion` with icon tiles beside the photo, check-marked benefits and the price inside the buy button.

**Architecture:** One new nullable column (`PaymentLink.badge`) and one computed store field (`topSellerId`) travel in the public store payload; the shared storefront runtime (`packages/storefront-kit/kit/commerce.js`) resolves the badge and draws the `conversion` layout from the existing `highlights` data. Adding `'conversion'` to `SOURCE_PRODUCT_PAGE_STYLES` lets YAPI, the boceto and the store config choose it with almost no new plumbing.

**Tech Stack:** NestJS + Prisma (apps/api, jest), plain-JS storefront runtime tested through jsdom from apps/api jest, merchant Studio (apps/merchant-studio, vitest + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-10-conversion-product-page-design.md`

## Global Constraints

- Badge states: `null` = Automática, `''` = Ninguna, other text = merchant's own, trimmed, 1–20 characters, no line breaks.
- Automatic badge order: "Más vendido" → "−N%" (active discount) → "Nuevo" (created < 30 days) → none.
- "Más vendido": top product by units in paid orders over the last 90 days, only when the store has ≥5 paid orders in that window; a tie → no badge.
- Tiles: first 3 highlights, only when the product has ≥3 highlights AND at least one photo; otherwise every highlight is a check.
- In `conversion` the buy button always shows the price.
- Nothing invented: no ratings, sales counts or numbers that are not in the product's facts.
- All shopper-facing copy in Spanish; store colours/fonts via the kit's `--pd-*` tokens, never hard-coded Blume colours.
- **Never run `prisma migrate dev|reset|diff` or any migrate command from a subagent.** The migration in Task 1 is written by the implementer and APPLIED only by the main session in Task 8 (`prisma migrate deploy`).
- Run API tests from `apps/api` with `npx jest <path>`; Studio unit tests from `apps/merchant-studio` with `npx vitest run <path>`.

## Review Focus

1. A 20-character merchant badge on a narrow catalog card (≈160 px) must ellipsize, not overflow the card → CSS in Task 3, 320 px browser check in Task 8.
2. Choosing a colour whose variant has its own photo redraws the gallery (`drawGallery`) — the tiles must survive the redraw → test in Task 4.
3. A sold-out product in `conversion` keeps "Agotado" and still shows its checks → test in Task 4.
4. A store template without a `checks` slot must place the checks right after the price, never drop them → test in Task 4.
5. Order lines without a `quantity` count as 1 unit, and unpaid orders are never counted → tests in Task 2.

## Spec deviations decided while planning (also written into the spec)

- The badge and the tile column render **inside the gallery part** (`.product-detail__stage` / `.product-detail__gallery`), so every template with a gallery slot keeps them; only `checks` needs a new `PRODUCT_PARTS` entry.
- `topSellerId` travels in the **public store payload** (`getStorePublic`), not `publicContent`: catalog cards need it and the content endpoint is only loaded on product pages.
- "Paid" uses the Store Brain's rule: `StoreOrder.status in PAID_STATUSES` (`apps/api/src/store-knowledge/store-knowledge.ts`).
- Studio preview reads the same payload, so it shows the real badge; there is no sample "Más vendido".

---

### Task 1: Badge column, validation and public payload

**Files:**
- Create: `apps/api/src/payment-links/product-badge.ts`
- Create: `apps/api/src/payment-links/product-badge.spec.ts`
- Create: `apps/api/prisma/migrations/20261010150000_product_badge/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (model `PaymentLink`, next to `highlights`)
- Modify: `apps/api/src/payment-links/dto/create-payment-link.dto.ts` (after `highlights`, ~line 298)
- Modify: `apps/api/src/payment-links/payment-links.service.ts` (create ~line 481, update ~line 958)
- Modify: `apps/api/src/stores/public-stores.service.ts` (`items.map`, ~line 337)
- Test: `apps/api/src/stores/public-stores.service.spec.ts`

**Interfaces:**
- Produces: `normalizeProductBadge(value: unknown): string | null` (throws `BadRequestException`); public items carry `badge: string | null` and `createdAt: string | null` (ISO).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/payment-links/product-badge.spec.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { normalizeProductBadge } from './product-badge';

describe('product photo badge', () => {
  it('keeps the three states: automatic, none and the merchant text', () => {
    expect(normalizeProductBadge(null)).toBeNull();
    expect(normalizeProductBadge(undefined)).toBeNull();
    expect(normalizeProductBadge('')).toBe('');
    expect(normalizeProductBadge('   ')).toBe('');
    expect(normalizeProductBadge('  Edición limitada ')).toBe('Edición limitada');
  });
  it('rejects text longer than 20 characters, line breaks and non-strings in Spanish', () => {
    expect(() => normalizeProductBadge('Una insignia demasiado larga')).toThrow(BadRequestException);
    expect(() => normalizeProductBadge('Más\nvendido')).toThrow(/insignia/i);
    expect(() => normalizeProductBadge(42)).toThrow(BadRequestException);
  });
});
```

Append to `apps/api/src/stores/public-stores.service.spec.ts` (reuses the file's `setup`, `productRow`, `storeRow`):
```ts
describe('photo badge data', () => {
  it('publishes the merchant badge and the creation date the kit needs for "Nuevo"', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-10-01T12:00:00.000Z');
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: 'p1', badge: 'Edición limitada', createdAt },
      { ...productRow, id: 'p2', badge: null, createdAt },
      { ...productRow, id: 'p3', badge: '', createdAt },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.items.map((item: any) => [item.id, item.badge, item.createdAt])).toEqual([
      ['p1', 'Edición limitada', createdAt.toISOString()], ['p2', null, createdAt.toISOString()], ['p3', '', createdAt.toISOString()],
    ]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/payment-links/product-badge.spec.ts src/stores/public-stores.service.spec.ts`
Expected: FAIL — `Cannot find module './product-badge'`; `badge` undefined in items.

- [ ] **Step 3: Implement**

`apps/api/src/payment-links/product-badge.ts`:
```ts
import { BadRequestException } from '@nestjs/common';

export const PRODUCT_BADGE_MAX = 20;

/** null = Automática (the kit shows only what is true), '' = Ninguna, text = the merchant's own badge (spec 2026-10-10). */
export function normalizeProductBadge(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequestException('La insignia debe ser un texto.');
  const text = value.trim();
  if (/[\r\n]/.test(text)) throw new BadRequestException('La insignia va en una sola línea.');
  if (text.length > PRODUCT_BADGE_MAX) throw new BadRequestException(`La insignia tiene hasta ${PRODUCT_BADGE_MAX} caracteres.`);
  return text;
}
```

`schema.prisma`, in `model PaymentLink` right after `highlights`:
```prisma
  // null = automatic badge, '' = none, text = merchant's own (spec 2026-10-10-conversion-product-page).
  badge                 String?
```

`apps/api/prisma/migrations/20261010150000_product_badge/migration.sql`:
```sql
-- Product photo badge (spec 2026-10-10 conversion product page). NULL keeps every existing product on "Automática".
ALTER TABLE "PaymentLink" ADD COLUMN "badge" TEXT;
```
Regenerate the client only (touches no database): `cd apps/api && npx prisma generate`.

DTO, after `highlights?: ProductHighlightDto[];`:
```ts
  @ApiPropertyOptional({ description: "Photo badge: null = automatic, '' = none, or up to 20 characters.", nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  badge?: string | null;
```
(`normalizeProductBadge` enforces the real 20-character rule after trimming. Add `IsString`/`MaxLength` to the `class-validator` import if missing.)

`payment-links.service.ts` create data (next to `highlights:`):
```ts
        badge: normalizeProductBadge(dto.badge),
```
update data (next to the `dto.highlights !== undefined` line):
```ts
        ...(dto.badge !== undefined && { badge: normalizeProductBadge(dto.badge) }),
```
Import `normalizeProductBadge` from `./product-badge`.

`public-stores.service.ts` `items.map`, after `highlights:`:
```ts
        badge: typeof item.badge === 'string' ? item.badge : null,
        createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : null,
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/payment-links src/stores/public-stores.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payment-links/product-badge.ts apps/api/src/payment-links/product-badge.spec.ts apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261010150000_product_badge apps/api/src/payment-links/dto/create-payment-link.dto.ts apps/api/src/payment-links/payment-links.service.ts apps/api/src/stores/public-stores.service.ts apps/api/src/stores/public-stores.service.spec.ts
git commit -m "feat(products): photo badge column — automatic, none or the merchant's own 20 characters; public payload carries it with the creation date"
```

---

### Task 2: "Más vendido" from real paid orders

**Files:**
- Create: `apps/api/src/stores/top-seller.ts`
- Create: `apps/api/src/stores/top-seller.spec.ts`
- Modify: `apps/api/src/store-knowledge/store-knowledge.ts:150` (export `PAID_STATUSES`)
- Modify: `apps/api/src/stores/public-stores.service.ts` (`getStorePublic` `Promise.all` ~line 185, return object)
- Test: `apps/api/src/stores/public-stores.service.spec.ts`

**Interfaces:**
- Consumes: `PAID_STATUSES` from `store-knowledge.ts`.
- Produces: `topSellerId(orders: Array<{ items: unknown }>): string | null`; public store payload field `topSellerId: string | null`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/stores/top-seller.spec.ts`:
```ts
import { topSellerId, TOP_SELLER_MIN_ORDERS } from './top-seller';

const order = (...lines: Array<[string, number?]>) => ({ items: lines.map(([paymentLinkId, quantity]) => ({ paymentLinkId, ...(quantity === undefined ? {} : { quantity }) })) });

describe('top seller', () => {
  it('needs at least five paid orders', () => {
    expect(TOP_SELLER_MIN_ORDERS).toBe(5);
    expect(topSellerId([order(['a', 9]), order(['a']), order(['b']), order(['a'])])).toBeNull();
  });
  it('picks the product with the most units, counting a line without quantity as one', () => {
    expect(topSellerId([order(['a', 1]), order(['b', 3]), order(['a']), order(['a']), order(['c'], ['a'])])).toBe('a');
    expect(topSellerId([order(['a', 1]), order(['b', 6]), order(['a']), order(['a']), order(['c'])])).toBe('b');
  });
  it('gives no badge on a tie and ignores malformed lines', () => {
    expect(topSellerId([order(['a', 2]), order(['b', 2]), order(['c']), order(), { items: null }])).toBeNull();
    expect(topSellerId([order(['a', 2]), order(['b', 1]), order(), { items: [null, { quantity: 5 }] }, { items: 'x' }])).toBe('a');
  });
});
```

In `public-stores.service.spec.ts`, add `storeOrder: { findMany: jest.fn().mockResolvedValue([]) },` to the `prisma` object in `setup()` (every existing test needs the mock now), then append:
```ts
describe('top seller badge', () => {
  it('asks only for paid orders of the last 90 days and publishes the winner', async () => {
    const { service, prisma } = setup();
    const lines = (id: string) => ({ items: [{ paymentLinkId: id, quantity: 1 }] });
    prisma.storeOrder.findMany.mockResolvedValue([lines('p1'), lines('p1'), lines('p2'), lines('p1'), lines('p3')]);
    const before = Date.now();
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.topSellerId).toBe('p1');
    const where = prisma.storeOrder.findMany.mock.calls[0][0].where;
    expect(where.storeId).toBe(storeRow.id);
    expect(where.status.in).toEqual(expect.arrayContaining(['PAID', 'DELIVERED']));
    expect(where.status.in).not.toContain('PENDING');
    expect(before - where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(90 * 86_400_000 - 1000);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/stores/top-seller.spec.ts src/stores/public-stores.service.spec.ts`
Expected: FAIL — module not found; `topSellerId` undefined.

- [ ] **Step 3: Implement**

`store-knowledge.ts:150`: `const PAID_STATUSES` → `export const PAID_STATUSES`.

`apps/api/src/stores/top-seller.ts`:
```ts
export const TOP_SELLER_MIN_ORDERS = 5;
export const TOP_SELLER_WINDOW_DAYS = 90;

/** The store's single best seller by units across paid orders, or null with too few orders or a tie (spec 2026-10-10). */
export function topSellerId(orders: Array<{ items: unknown }>): string | null {
  if (orders.length < TOP_SELLER_MIN_ORDERS) return null;
  const units = new Map<string, number>();
  for (const order of orders) {
    for (const line of Array.isArray(order.items) ? order.items as any[] : []) {
      const id = typeof line?.paymentLinkId === 'string' ? line.paymentLinkId : null;
      if (id) units.set(id, (units.get(id) || 0) + (Number.isFinite(line.quantity) && line.quantity > 0 ? Number(line.quantity) : 1));
    }
  }
  const ranked = [...units].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || (ranked[1] && ranked[1][1] === ranked[0][1])) return null;
  return ranked[0][0];
}
```

`public-stores.service.ts`: add to the `Promise.all` array, with a matching `paidOrders` name in the destructuring:
```ts
      this.prisma.storeOrder.findMany({
        where: { storeId: store.id, status: { in: [...PAID_STATUSES] }, createdAt: { gte: new Date(Date.now() - TOP_SELLER_WINDOW_DAYS * 86_400_000) } },
        select: { items: true }, take: 5000,
      }),
```
In the returned object, next to `bundles,`:
```ts
      topSellerId: topSellerId(paidOrders),
```
Imports: `PAID_STATUSES` from `../store-knowledge/store-knowledge`; `topSellerId, TOP_SELLER_WINDOW_DAYS` from `./top-seller`.

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/stores src/store-knowledge`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/stores/top-seller.ts apps/api/src/stores/top-seller.spec.ts apps/api/src/store-knowledge/store-knowledge.ts apps/api/src/stores/public-stores.service.ts apps/api/src/stores/public-stores.service.spec.ts
git commit -m "feat(stores): the public store names its real best seller — most units in paid orders over 90 days, five orders minimum, no badge on a tie"
```

---

### Task 3: Badge on the product page and catalog cards (kit)

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` — helpers after `priceMarkup` (~line 947); `plainGalleryMarkup` (~line 1596); default card (~line 2764); custom card fill (~lines 2680–2700); CSS (card ~line 461, product page ~line 508)
- Create: `apps/api/src/storefront-source/source-commerce-conversion.spec.ts`

**Interfaces:**
- Consumes: item fields `badge`, `createdAt`; store field `topSellerId` (Tasks 1–2).
- Produces (kit-internal, used by Task 4): `productBadge(p) → string`, `badgeMarkup(p, className) → string`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/source-commerce-conversion.spec.ts`:
```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

// Same jsdom the other kit specs borrow from the checkout app.
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const DAY = 86_400_000;
const product = (over: Record<string, unknown> = {}) => ({
  id: 'cafe', name: 'Café helado proteico', amount: 3799, currency: 'BOB', stock: null,
  imageUrls: ['https://shop.test/cafe.jpg'], variants: [], extras: [], highlights: [],
  badge: null, createdAt: new Date(Date.now() - 90 * DAY).toISOString(), ...over,
});
const rows = (n: number) => ([['cup', 'Café de altura'], ['bolt', 'Energía natural'], ['leaf', 'Enfoque limpio'], ['check', 'Fácil de digerir'], ['heart', 'Sin azúcar'], ['star', 'Hecho en Bolivia']] as const)
  .slice(0, n).map(([icon, label]) => ({ icon, label }));

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function page({ items = [product()] as any[], style, settings = {}, fullPage = true, template = '' }: { items?: any[]; style?: string; settings?: Record<string, unknown>; fullPage?: boolean; template?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
    { url: `https://shop.test/product.html?id=${items[0]?.id ?? 'cafe'}`, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Blume', items, ...settings };
  w.PAGOSYA_CONFIG = { slug: 'blume', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...(style ? { productPageStyle: style } : {}) };
  const quote = { subtotal: 3799, discountAmount: 0, amount: 3799, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector);
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  return { w, q, all };
}

describe('photo badge', () => {
  it('shows the merchant text on the photo and on the card, and nothing for "Ninguna"', async () => {
    const own = await page({ items: [product({ badge: 'Edición limitada' })] });
    expect(own.q('.product-detail__stage .product-detail__badge')?.textContent).toBe('Edición limitada');
    expect(own.q('[data-pagosya-catalog] .menu-item__badge')?.textContent).toBe('Edición limitada');
    const none = await page({ items: [product({ badge: '', createdAt: new Date().toISOString() })], settings: { topSellerId: 'cafe' } });
    expect(none.q('.product-detail__badge')).toBeNull();
    expect(none.q('.menu-item__badge')).toBeNull();
  });

  it('automatic: best seller, then an active discount, then new, else nothing', async () => {
    const recent = new Date(Date.now() - 3 * DAY).toISOString();
    const top = await page({ items: [product({ discountPercent: 20, createdAt: recent })], settings: { topSellerId: 'cafe' } });
    expect(top.q('.product-detail__badge')?.textContent).toBe('Más vendido');
    const sale = await page({ items: [product({ discountPercent: 20, createdAt: recent })], settings: { topSellerId: 'other' } });
    expect(sale.q('.product-detail__badge')?.textContent).toBe('−20%');
    const fresh = await page({ items: [product({ createdAt: recent })] });
    expect(fresh.q('.product-detail__badge')?.textContent).toBe('Nuevo');
    const old = await page();
    expect(old.q('.product-detail__badge')).toBeNull();
  });

  it('never shows a discount badge for an expired discount', async () => {
    const ended = await page({ items: [product({ discountPercent: 20, discountEndsAt: new Date(Date.now() - DAY).toISOString() })] });
    expect(ended.q('.product-detail__badge')).toBeNull();
  });

  it('fills an authored badge field on a custom card, or places the badge after the photo', async () => {
    const card = (badgeField: string) => `<template data-pagosya-product-template><article><div data-product-media><a data-product-link><img data-product-field="image"></a>${badgeField}</div><h3 data-product-field="name"></h3><span data-product-field="price"></span><button data-product-add>Añadir</button></article></template>`;
    const authored = await page({ fullPage: false, template: card('<span data-product-field="badge"></span>'), items: [product({ badge: 'Favorito' })] });
    const field = authored.q('[data-custom-product] [data-product-field="badge"]');
    expect(field.textContent).toBe('Favorito');
    expect(field.hidden).toBe(false);
    const placed = await page({ fullPage: false, template: card(''), items: [product({ badge: 'Favorito' })] });
    expect(placed.q('[data-custom-product] .menu-item__image + .menu-item__badge')?.textContent).toBe('Favorito');
    const empty = await page({ fullPage: false, template: card('<span data-product-field="badge"></span>') });
    expect(empty.q('[data-custom-product] [data-product-field="badge"]').hidden).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-conversion.spec.ts`
Expected: FAIL — `.product-detail__badge` is null.

- [ ] **Step 3: Implement in `commerce.js`**

Right after `priceMarkup` (~line 947):
```js
  const BADGE_NEW_MS = 30 * 86400000;
  /** The photo badge (spec 2026-10-10): the merchant's own words, '' for none, else only what is true right now. */
  function productBadge(p) {
    if (typeof p.badge === 'string') return p.badge.trim().slice(0, 20);
    if (store.topSellerId && store.topSellerId === p.id) return 'Más vendido';
    if (!isMembership(p) && p.discountPercent && price(p) < p.amount) return `−${p.discountPercent}%`;
    const created = Date.parse(p.createdAt);
    return Number.isFinite(created) && Date.now() - created < BADGE_NEW_MS ? 'Nuevo' : '';
  }
  const badgeMarkup = (p, className) => { const text = productBadge(p); return text ? `<span class="${className}">${escape(text)}</span>` : ''; };
```
(`store` is the live store payload `openProduct` already reads for `store.categories`; confirm before relying on it.)

`plainGalleryMarkup`: make the badge the stage's first child:
```js
`<div class="product-detail__stage" data-part="stage">${badgeMarkup(p, 'product-detail__badge')}<img class="product-detail__photo" …`
```

Default card (~line 2764), only when there is an image:
```js
${image ? `<img class="menu-item__image" … />${badgeMarkup(p, 'menu-item__badge')}` : ""}
```

Custom card fill, right after the `if (photo) { … }` block:
```js
    const badgeText = productBadge(p), badgeField = field('badge');
    if (badgeField) { badgeField.textContent = badgeText; badgeField.hidden = !badgeText; }
    else if (photo && image && badgeText) {
      photo.insertAdjacentHTML('afterend', badgeMarkup(p, 'menu-item__badge'));
      const holder = photo.parentElement;
      if (holder && getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
    }
```

CSS, next to `.product-detail__stage{position:relative…}` (~line 508):
```css
    [data-pagosya-product] .product-detail__badge{position:absolute;top:14px;left:14px;z-index:2;max-width:calc(100% - 28px);padding:6px 12px;border-radius:999px;background:var(--pd-accent,#111);color:var(--pd-on-accent,#fff);font-size:13px;font-weight:600;line-height:1.2;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
```
Next to `.menu-item{position:relative}` (~line 461):
```css
    .menu-item__badge{position:absolute;top:10px;left:10px;z-index:2;max-width:calc(100% - 20px);padding:4px 10px;border-radius:999px;background:var(--store-accent,var(--brand-accent,var(--accent,#111)));color:var(--store-on-accent,var(--brand-on-accent,#fff));font-size:12px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
```
(If the `.menu-add` rules use different accent/on-accent variable names, reuse those.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-conversion.spec.ts
git commit -m "feat(storefront-kit): photo badge on product pages and cards — merchant text, or best seller, live discount or new only when true"
```

---

### Task 4: The `conversion` layout (kit)

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` — `highlightsMarkup` (~line 1708), `galleryMarkup` (~line 1587), `openProduct` template (~line 1623), `productPageStyle` (~line 1777), `PRODUCT_PARTS` / `PRODUCT_DROPPABLE` / `applyProductPageTemplate` (~line 3154), icon-motion observer (~line 1125), CSS (buy-total ~line 641, mobile block ~line 711)
- Test: `apps/api/src/storefront-source/source-commerce-conversion.spec.ts`

**Interfaces:**
- Consumes: `badgeMarkup` (Task 3), the `highlightIcons` map.
- Produces: kit helpers `highlightRows(p)`, `conversionHighlights(p) → { tiles, checks }`, `iconSvg(icon)`, `tilesMarkup(rows)`, `checksMarkup(rows)`; DOM `.product-detail__tiles` (child of `.product-detail__gallery`) and `.product-detail__checks`; template slot name `checks`.

- [ ] **Step 1: Write the failing tests** (append to `source-commerce-conversion.spec.ts`)

```ts
describe('conversion product page style', () => {
  it('puts three tiles beside the photo and the rest as checks between price and button', async () => {
    const { q, all } = await page({ style: 'conversion', items: [product({ highlights: rows(6) })] });
    expect(q('[data-pagosya-product-page]').dataset.style).toBe('conversion');
    expect(all('.product-detail__gallery > .product-detail__tiles li').map(li => li.textContent)).toEqual(['Café de altura', 'Energía natural', 'Enfoque limpio']);
    expect(all('.product-detail__checks li').map(li => li.textContent)).toEqual(['Fácil de digerir', 'Sin azúcar', 'Hecho en Bolivia']);
    expect(q('.product-detail__highlights')).toBeNull();
    const pricing = q('.product-detail__pricing'), checks = q('.product-detail__checks'), buy = q('.product-detail__buy');
    expect(pricing.compareDocumentPosition(checks) & 4).toBeTruthy(); // checks follow the price
    expect(checks.compareDocumentPosition(buy) & 4).toBeTruthy(); // the button follows the checks
  });

  it('has no tile column with fewer than three highlights or without a photo, and no empty containers', async () => {
    const two = await page({ style: 'conversion', items: [product({ highlights: rows(2) })] });
    expect(two.q('.product-detail__tiles')).toBeNull();
    expect(two.all('.product-detail__checks li')).toHaveLength(2);
    const noPhoto = await page({ style: 'conversion', items: [product({ imageUrls: [], highlights: rows(3) })] });
    expect(noPhoto.q('.product-detail__tiles')).toBeNull();
    expect(noPhoto.all('.product-detail__checks li')).toHaveLength(3);
    const none = await page({ style: 'conversion' });
    expect(none.q('.product-detail__tiles, .product-detail__checks')).toBeNull();
  });

  it('puts the real rating above the title and keeps the price inside the buy button', async () => {
    const { q } = await page({ style: 'conversion', items: [product({ highlights: rows(3) })] });
    const rating = q('[data-product-rating]'), title = q('#pagosya-product-title');
    expect(rating.compareDocumentPosition(title) & 4).toBeTruthy(); // the title follows the rating
    expect(q('.product-detail__buy [data-product-total]')).not.toBeNull();
  });

  it('keeps the tiles when a variant photo redraws the gallery', async () => {
    const withColours = product({ highlights: rows(4), variants: [
      { id: 'v1', name: 'Rojo', amount: 3799, stock: null, options: [{ name: 'Color', value: 'Rojo' }] },
      { id: 'v2', name: 'Azul', amount: 3799, stock: null, options: [{ name: 'Color', value: 'Azul' }], imageUrl: 'https://shop.test/azul.jpg' },
    ] });
    const { all } = await page({ style: 'conversion', items: [withColours] });
    all('[data-product-option="0"]').find(button => button.textContent === 'Azul').click();
    await new Promise(resolve => setImmediate(resolve));
    expect(all('.product-detail__gallery > .product-detail__tiles li')).toHaveLength(3);
  });

  it('keeps a sold-out product honest and still lists its benefits', async () => {
    const { q, all } = await page({ style: 'conversion', items: [product({ stock: 0, highlights: rows(4) })] });
    expect(q('.product-detail__copy').textContent).toContain('Agotado');
    expect(all('.product-detail__checks li')).toHaveLength(1);
  });

  it('places checks after the price in a template without a checks slot, and in its own slot when there is one', async () => {
    const tpl = (extra: string) => `<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div>${extra}<div data-product-slot="buy"></div></article></template>`;
    const without = await page({ style: 'conversion', template: tpl(''), items: [product({ highlights: rows(5) })] });
    expect(without.q('[data-product-slot="pricing"]').nextElementSibling.matches('.product-detail__checks')).toBe(true);
    const own = await page({ style: 'conversion', template: tpl('<div data-product-slot="checks"></div>'), items: [product({ highlights: rows(5) })] });
    expect(own.q('[data-product-slot="checks"] > .product-detail__checks')).not.toBeNull();
  });

  it('no longer drops highlights in a template without a highlights slot', async () => {
    const tpl = '<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></article></template>';
    const { q } = await page({ style: 'editorial', template: tpl, items: [product({ highlights: rows(2) })] });
    expect(q('.product-detail__highlights')).not.toBeNull();
  });
});
```
Before relying on the two template tests, read `productPageTemplate()` in commerce.js and confirm the template's attribute (`data-pagosya-product-page-template`, per `source-generation.service.ts:551`) and whether it must sit inside `<template>`; adjust only the `tpl` markup if needed.

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-conversion.spec.ts -t conversion`
Expected: FAIL — `dataset.style` is `editorial` (the kit doesn't know `conversion`).

- [ ] **Step 3: Implement in `commerce.js`**

`productPageStyle()`:
```js
    if (['editorial', 'dense', 'image-led', 'story-led', 'conversion'].includes(config.productPageStyle)) return config.productPageStyle;
```

Replace `highlightsMarkup` with the split below (same list markup as today, now built from shared helpers):
```js
  function highlightRows(p) {
    return (Array.isArray(p?.highlights) ? p.highlights : [])
      .filter(row => row && highlightIcons[row.icon] && typeof row.label === 'string' && row.label.trim())
      .slice(0, 6);
  }
  const iconSvg = icon => `<svg class="pd-icon pd-${escape(icon.motion)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths}</svg>`;
  function highlightsMarkup(p) {
    const rows = highlightRows(p);
    if (!rows.length) return '';
    return `<ul class="product-detail__highlights" data-part="highlights" aria-label="Destacados del producto">${rows.map(row => {
      const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
      return `<li>${iconSvg(highlightIcons[row.icon])}<div><strong>${escape(row.label.trim())}</strong>${detail ? `<span>${escape(detail)}</span>` : ''}</div></li>`;
    }).join('')}</ul>`;
  }
  /** conversion (spec 2026-10-10): three tiles beside the photo when there are three and a photo; every other highlight a check. */
  function conversionHighlights(p) {
    const rows = highlightRows(p);
    return rows.length >= 3 && galleryImages(p).length ? { tiles: rows.slice(0, 3), checks: rows.slice(3) } : { tiles: [], checks: rows };
  }
  function tilesMarkup(rows) {
    return rows.length ? `<ul class="product-detail__tiles" aria-label="Lo esencial">${rows.map(row => `<li>${iconSvg(highlightIcons[row.icon])}<span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
  }
  function checksMarkup(rows) {
    return rows.length ? `<ul class="product-detail__checks" aria-label="Beneficios">${rows.map(row => `<li><svg class="product-detail__check" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m7.5 12.5 3 3 6-6.5"/></svg><span>${escape(row.label.trim())}</span></li>`).join('')}</ul>` : '';
  }
```

`galleryMarkup(images, p)`: append the tiles before the decor span so `drawGallery` redraws them with the photos:
```js
    const tiles = productPageStyle() === 'conversion' && images.length ? tilesMarkup(conversionHighlights(p).tiles) : '';
    return html + tiles + '<span class="product-detail__decor" data-part="decor-a" aria-hidden="true"></span>';
```

`openProduct` — three edits to the template string:
1. Before the template: `const rating = fullProductPage ? '<p class="product-detail__rating" data-product-rating hidden></p>' : '';`. Emit `${style === 'conversion' ? rating : ''}` immediately before `<${fullProductPage ? "h1" : "h2"} id="pagosya-product-title"…`, and replace today's `${fullProductPage ? '<p class="product-detail__rating" …></p>' : ''}` after the title with `${style !== 'conversion' ? rating : ''}`.
2. Right after the pricing `</div>`: `${style === 'conversion' ? checksMarkup(conversionHighlights(p).checks) : ''}`.
3. `${style !== 'dense' ? highlightsMarkup(p) : ''}` → `${style !== 'dense' && style !== 'conversion' ? highlightsMarkup(p) : ''}`.

Template parts:
```js
  const PRODUCT_PARTS = [
    …existing entries up to 'reviews'…,
    ['checks', '.product-detail__checks'],
    ['buy', '.product-detail__options,.product-detail__box,.product-detail__purchase,.product-detail__buy,.product-detail__status,p'],
  ];
  const PRODUCT_DROPPABLE = new Set(['breadcrumb', 'category', 'rating', 'description', 'bundles', 'related', 'reviews']);
```
In `applyProductPageTemplate`'s loop, after the `rating` branch and before the droppable branch:
```js
      else if (name === 'checks' && slot('pricing')) slot('pricing').after(piece);
```

Motion: find the IntersectionObserver near line 1125 that observes `.product-detail__highlights` icons and add `.product-detail__tiles` to its selector so tile icons animate and pause the same way.

CSS — after the buy-total rules (~line 646):
```css
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total{display:inline}
    [data-pagosya-product][data-style=conversion] .product-detail__buy-total:not(:empty)::before{content:"·";margin:0 10px}
    [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:12px;align-items:start;background:none}
    [data-pagosya-product] .product-detail__tiles{display:grid;gap:12px;margin:0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__tiles li{display:grid;justify-items:center;align-content:center;gap:8px;aspect-ratio:1;min-width:0;padding:10px 6px;border-radius:var(--pd-radius,14px);background:var(--pd-tint);color:var(--pd-ink);text-align:center;font-size:13px;line-height:1.2;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__tiles .pd-icon{width:34px;height:34px;color:var(--pd-accent)}
    [data-pagosya-product] .product-detail__checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:14px 0;padding:0;list-style:none}
    [data-pagosya-product] .product-detail__checks li{display:flex;align-items:center;gap:8px;min-width:0;padding:10px 12px;border-radius:var(--pd-radius,10px);background:var(--pd-tint);color:var(--pd-ink);font-size:14px;line-height:1.25;overflow-wrap:anywhere}
    [data-pagosya-product] .product-detail__checks li:last-child:nth-child(odd){grid-column:1/-1}
    [data-pagosya-product] .product-detail__check{flex:0 0 20px;width:20px;height:20px}
    [data-pagosya-product] .product-detail__check circle{fill:var(--pd-accent)}
    [data-pagosya-product] .product-detail__check path{fill:none;stroke:var(--pd-on-accent,#fff);stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
```
Inside the existing `@media(max-width:899px){…}` block:
```css
      [data-pagosya-product][data-style=conversion] .product-detail__gallery:has(>.product-detail__tiles){grid-template-columns:minmax(0,1fr) 28%;gap:8px}
      [data-pagosya-product] .product-detail__tiles{gap:8px}
      [data-pagosya-product] .product-detail__tiles li{gap:6px;padding:8px 4px;font-size:11px}
      [data-pagosya-product] .product-detail__tiles .pd-icon{width:26px;height:26px}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce && node ../../packages/storefront-kit/kit/check-runtimes.mjs`
Expected: PASS for every kit spec. If an existing test in `source-commerce-templates.spec.ts` asserted that highlights are dropped, update it to the new rule and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-conversion.spec.ts apps/api/src/storefront-source/source-commerce-templates.spec.ts
git commit -m "feat(storefront-kit): conversion product page — three icon tiles beside the photo, check-marked benefits before the button, price always in the button; templates keep highlights and checks"
```

---

### Task 5: Make `conversion` choosable (YAPI, boceto, Studio)

**Files:**
- Modify: `apps/api/src/storefront-source/source-dna.ts:7`
- Modify: `apps/api/src/storefront-source/source-design.ts:87` (error text)
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts:45` (schema enum) and `:137` (prompt sentence)
- Modify: `apps/api/src/storefront-source/sketch/sketch-assembler.ts:82-109` (skb-pdp slots)
- Modify: `apps/api/src/storefront-source/source-product-card-presets.ts:51` (`productCardDirection`)
- Modify: `apps/api/src/storefront-source/source-next.ts:63` (authored-store contract)
- Modify: `apps/merchant-studio/src/source-boceto.ts:58-59` (export `PRODUCT_CONTROLS`, add the option)
- Test: `apps/api/src/storefront-source/sketch/sketch-request.spec.ts`, `apps/api/src/storefront-source/sketch/sketch-assembler.spec.ts`, `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: kit support for `conversion` (Task 4).
- Produces: `SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense', 'image-led', 'story-led', 'conversion']`; exported `PRODUCT_CONTROLS` from `source-boceto.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `sketch-request.spec.ts` (the file already imports `SKETCH_JSON_SCHEMA`, `sketchPrompt`, `catalogueDigest` and defines `structure`):
```ts
it('offers the conversion product page to the boceto model and says when to use it', () => {
  expect(JSON.stringify(SKETCH_JSON_SCHEMA)).toContain('"conversion"');
  const prompt = sketchPrompt({ storeName: 'salv', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogue: catalogueDigest([]), structure });
  expect(prompt).toMatch(/conversion \(comida y bebida, suplementos, belleza/);
});
```
Append to `sketch-assembler.spec.ts` (uses the file's `full` and `ctx`):
```ts
it('gives sketch stores a slot for highlights and checks between price and button', () => {
  const product = assembleSketch(full, ctx).find(f => f.path === 'components/product.tsx')!.content;
  expect(product).toContain('name="highlights"');
  expect(product.indexOf('name="pricing"')).toBeLessThan(product.indexOf('name="checks"'));
  expect(product.indexOf('name="checks"')).toBeLessThan(product.indexOf('name="buy"'));
});
```
Append to `source-boceto.test.ts` (add `PRODUCT_CONTROLS` to the existing `./source-boceto` import):
```ts
it('offers Conversión as a fifth product page composition', () => {
  const layout = PRODUCT_CONTROLS.find(control => control.key === 'layout')!;
  expect(layout.values).toEqual(['editorial', 'dense', 'image-led', 'story-led', 'conversion']);
  expect(layout.names[layout.values.indexOf('conversion')]).toBe('Conversión');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-request.spec.ts src/storefront-source/sketch/sketch-assembler.spec.ts` and `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: FAIL — `conversion` missing; `PRODUCT_CONTROLS` not exported.

- [ ] **Step 3: Implement**

`source-dna.ts:7`:
```ts
export const SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense', 'image-led', 'story-led', 'conversion'] as const;
```
`sketch-request.ts:45`: `layout: { type: 'string', enum: [...SOURCE_PRODUCT_PAGE_STYLES] },` (import from `../source-dna`).
`sketch-request.ts:137`, extend the layout list right after `story-led (texto e historia DEBAJO de la foto)`:
```
, conversion (comida y bebida, suplementos, belleza y cuidado personal, gadgets: la foto con una columna de 3 íconos de beneficios al lado, beneficios con ✓ antes del botón y el precio dentro del botón; úsala por defecto en esos rubros)
```
`source-design.ts:87`: build the list in the failure message from the constant: `` `…usa ${SOURCE_PRODUCT_PAGE_STYLES.join(', ')}…` `` (keep the rest of the message).
`source-product-card-presets.ts:51`: replace `image-led for fashion/art, dense for specification-led furniture/electronics, story-led for craft, editorial for quick food ordering.` with `image-led for fashion/art, dense for specification-led furniture/electronics, story-led for craft, conversion for food & drink, supplements, beauty/personal care and gadgets (icon tiles beside the photo, check-marked benefits, price in the button), editorial for a restrained balanced page.`
`source-next.ts:63`: after `editorial for a restrained balanced presentation.` add `conversion for food, supplements, beauty and gadgets: the runtime draws icon tiles beside the photo, check-marked benefits between price and button and the price inside the button, so give the gallery a wide column.`
`sketch-assembler.ts` skb-pdp: after the `pricing` slot add `<KitSlot kind="product" name="checks" className="skb-pdp__checks" />`; after the `description` slot add `<KitSlot kind="product" name="highlights" className="skb-pdp__highlights" />`.
`source-boceto.ts`: `const PRODUCT_CONTROLS` → `export const PRODUCT_CONTROLS`, and the layout row:
```ts
  { key: 'layout', label: 'Composición', values: ['editorial', 'dense', 'image-led', 'story-led', 'conversion'], names: ['Editorial', 'Detallada', 'Foto grande', 'Historia', 'Conversión'] },
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source` and `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: PASS. If a golden/snapshot or prompt-length test fails only because the prompt grew, update that expectation and mention it in the commit.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts
git commit -m "feat(yapi): conversion is a fifth product page composition — chosen for food, supplements, beauty and gadgets; sketch stores get highlights and checks slots"
```

---

### Task 6: Honest highlight suggestions and 15 new icons

**Files:**
- Modify: `apps/api/src/product-content/product-highlights.service.ts` (`suggest`, ~line 91)
- Modify: `apps/api/src/payment-links/product-highlights.ts:2-19`
- Modify: `packages/storefront-kit/kit/commerce.js` (`highlightIcons` map ~line 1666)
- Modify: `apps/merchant-studio/src/product-highlight-icons.ts`
- Test: `apps/api/src/product-content/product-highlights.service.spec.ts`, `apps/api/src/storefront-source/source-commerce-conversion.spec.ts`, `apps/merchant-studio/src/product-highlight-icons.test.ts` (already enforces API ↔ Studio order)

**Interfaces:**
- Consumes: `factNumbers`, `factClaims`, `keepsToFacts` (already exported from `product-page-writer.ts`).

- [ ] **Step 1: Write the failing tests**

In `product-highlights.service.spec.ts`:
1. The first test expects `{ icon: 'gear', label: '20 litros' }` to survive although "20" is not in `product`. It is about the ChatGPT bridge, not numbers: change its reply to `{ icon: 'gear', label: 'Brazo ajustable', detail: null }` and its expectation to `{ highlights: [{ icon: 'gear', label: 'Brazo ajustable' }] }`.
2. Add:
```ts
  it('drops a suggestion whose number or promise is not in the product facts', async () => {
    const { service } = make({ highlights: [
      { icon: 'plug', label: 'USB-C', detail: 'Carga en 2 horas' },
      { icon: 'shield', label: 'Garantía total', detail: null },
      { icon: 'gear', label: 'Brazo ajustable', detail: null },
    ] });
    await expect(service.suggest('m1', 's1', product)).resolves.toEqual({ highlights: [{ icon: 'gear', label: 'Brazo ajustable' }] });
  });
  it('keeps a number the product itself states', async () => {
    const { service } = make({ highlights: [{ icon: 'scoop', label: '20 g de proteína', detail: null }] });
    await expect(service.suggest('m1', 's1', { name: 'Café proteico', description: 'Cada porción trae 20 g de proteína.' }))
      .resolves.toEqual({ highlights: [{ icon: 'scoop', label: '20 g de proteína' }] });
  });
```
Append to `source-commerce-conversion.spec.ts`:
```ts
it('draws every icon the API accepts', () => {
  const source = readFileSync(join(__dirname, '../payment-links/product-highlights.ts'), 'utf8');
  const list = source.slice(source.indexOf('PRODUCT_HIGHLIGHT_ICONS = ['), source.indexOf('] as const'));
  const names = [...list.matchAll(/'([a-z-]+)'/g)].map(match => match[1]);
  expect(names).toHaveLength(55);
  for (const name of names) expect(commerce).toContain(`${name.includes('-') ? `'${name}'` : name}: { motion:`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/api && npx jest src/product-content/product-highlights.service.spec.ts src/storefront-source/source-commerce-conversion.spec.ts -t "facts|states|icon"`
Expected: FAIL — invented suggestions survive; 40 icons, not 55.

- [ ] **Step 3: Implement**

`product-highlights.service.ts`, inside `suggest`'s `try`, replace the return:
```ts
      const facts = { name: input.name, description: input.description, specifications: input.specifications, tags: input.tags };
      const numbers = factNumbers(facts), claims = factClaims(facts);
      // Same honesty rule as the long-page writer: a number or promise must already be in the product's own words.
      return { highlights: normalizeProductHighlights(parsed.highlights).filter(row => keepsToFacts(`${row.label} ${row.detail ?? ''}`, numbers, claims)) };
```
Import `factNumbers, factClaims, keepsToFacts` from `./product-page-writer`.

`product-highlights.ts`, a new group just before `// General`:
```ts
  // Wellness, beauty and gadgets (conversion pages, spec 2026-10-10)
  'scoop', 'brain', 'moon', 'dumbbell', 'bean', 'bowl', 'pill', 'sprout', 'lotion', 'mirror', 'eye', 'headphones', 'camera', 'timer', 'glass',
```

`commerce.js` `highlightIcons`, just before `shield:`:
```js
    scoop: { motion: 'tilt', paths: '<path d="M3 11h11a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M14 12h7"/><path d="M6 8c1-1.5 3-1.5 4 0"/>' },
    brain: { motion: 'pulse', paths: '<path d="M12 5a3 3 0 0 0-5.6-1.5A3 3 0 0 0 4 8a3 3 0 0 0 0 6 3 3 0 0 0 3 5 3 3 0 0 0 5-1z"/><path d="M12 5a3 3 0 0 1 5.6-1.5A3 3 0 0 1 20 8a3 3 0 0 1 0 6 3 3 0 0 1-3 5 3 3 0 0 1-5-1z"/><path d="M12 5v13"/>' },
    moon: { motion: 'sway', paths: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
    dumbbell: { motion: 'nudge', paths: '<path d="M6 7v10"/><path d="M18 7v10"/><path d="M3 9.5v5"/><path d="M21 9.5v5"/><path d="M6 12h12"/>' },
    bean: { motion: 'settle', paths: '<ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(35 12 12)"/><path d="M9 17c1-3 5-7 6-10"/>' },
    bowl: { motion: 'wave', paths: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 21h8"/><path d="M9 7.5c0-1.5 1-2 1-3.5"/><path d="M14 7.5c0-1.5 1-2 1-3.5"/>' },
    pill: { motion: 'tilt', paths: '<g transform="rotate(-35 12 12)"><rect x="3" y="8.5" width="18" height="7" rx="3.5"/><path d="M12 8.5v7"/></g>' },
    sprout: { motion: 'sway', paths: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z"/><path d="M12 10c0-3 2.5-5 6-5 0 3.5-2.5 5-6 5z"/>' },
    lotion: { motion: 'bob', paths: '<path d="M9.5 2h5v3h-5z"/><path d="M10.5 5h3v3h-3z"/><rect x="7" y="8" width="10" height="13" rx="2"/><path d="M10 13h4"/>' },
    mirror: { motion: 'glow', paths: '<ellipse cx="12" cy="9" rx="6" ry="7"/><path d="M12 16v5"/><path d="M9 21h6"/><path d="m9.5 7.5 2-2"/>' },
    eye: { motion: 'twinkle', paths: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    headphones: { motion: 'beat', paths: '<path d="M4 18v-6a8 8 0 0 1 16 0v6"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>' },
    camera: { motion: 'pulse', paths: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>' },
    timer: { motion: 'nudge', paths: '<circle cx="12" cy="14" r="8"/><path d="M12 14v-4"/><path d="M10 2h4"/><path d="M12 2v4"/>' },
    glass: { motion: 'wave', paths: '<path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M6.5 9h11"/>' },
```
(Every motion used — tilt, pulse, sway, nudge, settle, wave, bob, glow, twinkle, beat — is in the kit's `pd-*` list near line 849.)

`product-highlight-icons.ts`, a new row just before `['shield', 'Garantía']`, in the same order as the API:
```ts
  ['scoop', 'Proteína'], ['brain', 'Mente'], ['moon', 'Descanso'], ['dumbbell', 'Ejercicio'], ['bean', 'Grano'], ['bowl', 'Plato'], ['pill', 'Suplemento'],
  ['sprout', 'Natural'], ['lotion', 'Cuidado'], ['mirror', 'Belleza'], ['eye', 'Vista'], ['headphones', 'Sonido'], ['camera', 'Cámara'], ['timer', 'Rapidez'], ['glass', 'Bebida'],
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/product-content src/payment-links src/storefront-source/source-commerce-conversion.spec.ts && node ../../packages/storefront-kit/kit/check-runtimes.mjs` and `cd apps/merchant-studio && npx vitest run src/product-highlight-icons.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/product-content apps/api/src/payment-links/product-highlights.ts packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-conversion.spec.ts apps/merchant-studio/src/product-highlight-icons.ts
git commit -m "feat(products): highlight suggestions keep only numbers and promises the product states; 15 icons for wellness, beauty and gadgets"
```

---

### Task 7: "Insignia en la foto" in the Studio product guide

**Files:**
- Modify: `apps/merchant-studio/src/source-create-product.ts` (type line 15, step 4 markup ~line 63, prefill ~line 222, save ~line 462)
- Modify: `apps/merchant-studio/src/api.ts:309` (`createProduct` input type)
- Test: `apps/merchant-studio/src/source-create-product.test.ts`

**Interfaces:**
- Consumes: API `badge` field (Task 1).
- Produces: `ProductGuideRecord.badge?: string | null`.

- [ ] **Step 1: Write the failing tests** (append to `source-create-product.test.ts`)

```ts
describe('photo badge', () => {
  const editWith = (badge: string | null) => {
    const api = { updateProduct: vi.fn().mockResolvedValue({ id: 'p1' }), createProduct: vi.fn(), upload: vi.fn(), suggestProductHighlights: vi.fn().mockResolvedValue({ highlights: [] }) }, saved = vi.fn();
    const guide = createProductForm(api as unknown as MerchantStudioApi, 'store-b', saved, () => {}, { id: 'p1', name: 'Café', amount: 3799, stock: null, imageUrls: [], badge });
    document.body.append(guide.element);
    const save = async () => {
      for (let i = 0; i < 8; i++) guide.element.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
      return api.updateProduct.mock.calls[0][2];
    };
    const mode = (value: string) => { const radio = guide.element.querySelector<HTMLInputElement>(`[name="badgeMode"][value="${value}"]`)!; radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); };
    const checked = () => guide.element.querySelector<HTMLInputElement>('[name="badgeMode"]:checked')!.value;
    const text = guide.element.querySelector<HTMLInputElement>('[name="badgeText"]')!;
    return { guide, save, mode, checked, text };
  };

  it('prefills the three states from the saved product', () => {
    expect(editWith(null).checked()).toBe('auto');
    expect(editWith('').checked()).toBe('none');
    const own = editWith('Favorito');
    expect(own.checked()).toBe('custom');
    expect(own.text.value).toBe('Favorito');
    expect(own.text.closest('[hidden]')).toBeNull();
  });

  it('saves automatic as null, none as an empty string and custom as trimmed text', async () => {
    expect(await editWith('Favorito').save()).toMatchObject({ badge: 'Favorito' });
    document.body.replaceChildren();
    const none = editWith(null); none.mode('none');
    expect(await none.save()).toMatchObject({ badge: '' });
    document.body.replaceChildren();
    const auto = editWith('Favorito'); auto.mode('auto');
    expect(await auto.save()).toMatchObject({ badge: null });
  });

  it('caps the text at 20 characters and counts them', () => {
    const own = editWith(null); own.mode('custom');
    expect(own.text.maxLength).toBe(20);
    own.text.value = 'Edición limitada'; own.text.dispatchEvent(new Event('input', { bubbles: true }));
    expect(own.guide.element.querySelector('[data-badge-count]')!.textContent).toBe('16/20');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-create-product.test.ts -t "photo badge"`
Expected: FAIL — no `badgeMode` inputs.

- [ ] **Step 3: Implement**

`ProductGuideRecord` (line 15): add `badge?: string | null;`. `api.ts` `createProduct` input object type: add `badge?: string | null;`.

Step 4 markup, after `<p data-highlight-status aria-live="polite"></p>` and before `</section>`:
```html
<fieldset class="product-badge" data-product-badge><legend>Insignia en la foto</legend>
  <label><input type="radio" name="badgeMode" value="auto" checked> Automática</label>
  <label><input type="radio" name="badgeMode" value="none"> Ninguna</label>
  <label><input type="radio" name="badgeMode" value="custom"> Personalizada</label>
  <label data-badge-text hidden>Texto de la insignia<input name="badgeText" maxlength="20" autocomplete="off" placeholder="Ej. Edición limitada"><small data-badge-count aria-live="polite">0/20</small></label>
  <p class="product-step-help">Automática muestra «Más vendido», el descuento o «Nuevo» solo cuando es verdad.</p>
</fieldset>
```

Wiring, next to the other step-4 setup (after `form` exists):
```ts
  const badgeText = form.querySelector<HTMLInputElement>('[name="badgeText"]')!;
  const badgeBox = form.querySelector<HTMLElement>('[data-badge-text]')!;
  const badgeCount = form.querySelector<HTMLElement>('[data-badge-count]')!;
  const badgeMode = () => (form.querySelector<HTMLInputElement>('[name="badgeMode"]:checked')?.value ?? 'auto') as 'auto' | 'none' | 'custom';
  const syncBadge = () => { const custom = badgeMode() === 'custom'; badgeBox.hidden = !custom; badgeText.required = custom; badgeCount.textContent = `${badgeText.value.length}/20`; };
  form.addEventListener('change', event => { if ((event.target as HTMLInputElement).name === 'badgeMode') syncBadge(); });
  badgeText.addEventListener('input', syncBadge);
```
Prefill, inside the `if (initial)` block near line 222:
```ts
    const prefill = initial.badge == null ? 'auto' : initial.badge === '' ? 'none' : 'custom';
    form.querySelector<HTMLInputElement>(`[name="badgeMode"][value="${prefill}"]`)!.checked = true;
    if (prefill === 'custom') badgeText.value = initial.badge!;
```
Call `syncBadge()` once after that block (it runs for new products too). Since `required` is set only while the field is visible, the existing per-step `reportValidity` loop (line ~329) blocks an empty custom badge.

Save, next to the `approved` highlights line (~462):
```ts
    const mode = badgeMode();
    Object.assign(input, { badge: mode === 'auto' ? null : mode === 'none' ? '' : badgeText.value.trim() });
```
If `pageSnapshot` (line ~237) feeds `hasChanges`, include `badgeMode()` and `badgeText.value` in it so a badge-only edit counts as a change.

- [ ] **Step 4: Run the tests**

Run: `cd apps/merchant-studio && npx vitest run src/source-create-product.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-create-product.ts apps/merchant-studio/src/source-create-product.test.ts apps/merchant-studio/src/api.ts
git commit -m "feat(studio): Insignia en la foto in the product guide — Automática, Ninguna or the merchant's own 20 characters"
```

---

### Task 8: Apply, rebuild and check in a real browser (main session only)

**Files:** none (verification); memory update.

- [ ] **Step 1: Wider tests and type checks**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json && npx jest src/stores src/payment-links src/product-content src/storefront-source src/store-knowledge
cd ../merchant-studio && npx vitest run src && npx tsc --noEmit -p .
node ../../packages/storefront-kit/kit/check-runtimes.mjs
```
Expected: PASS, apart from failures already known before this work (the old "recent fingerprints" test). Report any other failure with its output.

- [ ] **Step 2: Apply the migration to the dev DB (main session, never a subagent)**

Look first: `cd apps/api && npx prisma migrate status`. If the only pending migration is `20261010150000_product_badge`, run `npx prisma migrate deploy`. If anything else is pending (for example the store-emails migration left unapplied on 2026-10-07), stop and ask the owner before applying. Never `migrate dev`, `reset` or `diff`.

- [ ] **Step 3: Rebuild the Studio and restart the API**

The dashboard serves a pre-built Studio: `cd apps/merchant-studio && npx vite build --mode embedded`. Restart the API dev server so the new Prisma client and payload fields load (check that no orphaned API holds :3001).

- [ ] **Step 4: Browser check (ask the owner before using their signed-in tab)**

On one dev store: switch the product page to Conversión (boceto Diseño → Composición, or YAPI chat), give one product ≥4 highlights and a custom badge, and another product a live discount. Capture at 390 px and 1440 px:
- tiles beside the photo, checks between price and button, "Añadir al pedido · Bs …";
- the badge on the product photo and on the catalog card; a 20-character badge ellipsizes on a card;
- at 320 px: `document.documentElement.scrollWidth <= innerWidth`;
- a store on editorial looks as before apart from the badge.

- [ ] **Step 5: Record and hand off**

Write `project_conversion_product_page.md` in memory (what was built, commit range, what was and wasn't live-verified) and point the "Next queued" line of `project_choose_your_style.md` at the gifts-row spec.
