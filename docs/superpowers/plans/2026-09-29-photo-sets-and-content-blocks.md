# Per-colour photo sets and product content blocks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A variant can hold up to 8 photos and choosing a colour shows that colour's whole set; a product can hold up to 6 merchant-supplied content blocks (`media`, `compare`) rendered inside the product page.

**Architecture:** Both features extend JSON that already lives on `PaymentLink` (`variants`, plus a new `contentBlocks` column modelled on `highlights`). The API normalizes and exposes them; the storefront kit runtime (`packages/storefront-kit/kit/commerce.js`) renders them; the merchant studio (`@pagosya/variant-editor` and `source-create-product.ts`) edits them. Block images are always photos already uploaded to the product's photo pool, so no new upload path exists.

**Tech Stack:** NestJS + Prisma (jest), plain-JS storefront kit tested through jsdom in jest, merchant-studio (TypeScript + vitest/jsdom), `@pagosya/variant-editor` (plain JS).

**Spec:** `docs/superpowers/specs/2026-09-29-product-photo-sets-and-content-blocks-design.md` (read it first, then the deviations below). Program context: `docs/superpowers/specs/2026-09-29-themed-product-card-program.md`.

## Deviations from the spec (authoritative over the spec)

1. **No `specs` block type.** Products already have `specifications` rows (`[{ label, value }]`, `PaymentLink.specifications`, rendered by `specRows(p)` in `commerce.js`). Content blocks are only `media` and `compare`.
2. **`compare` uses a native `<input type="range">`** (keyboard and screen-reader support for free), not a hand-rolled `role="slider"`.
3. **Block and set photos come from the product's existing photo pool** (max 10 photos per product, uploaded through the existing product form). A block/set stores the same `/v1/uploads/<uuid>.<ext>` paths as `imageUrls`.
4. **Scope is the kit runtime** (source storefronts, the ones YAPI themes). The older built-in storefront in `apps/checkout/src/storefront/product-page.ts` keeps working on `imageUrl` and is not changed; only its TypeScript type gains the optional field.

## Global Constraints

- Photo set cap: **8** per variant. Content blocks cap: **6** per product.
- Block types: exactly `media` and `compare`.
- Uploaded-file URLs only, validated with `UPLOADED_FILE_URL_PATTERN` and `MAX_UPLOADED_FILE_URL_LENGTH` (import them from wherever `apps/api/src/payment-links/dto/create-payment-link.dto.ts` imports them).
- Text fields use `@IsSafeText()`; all merchant text is HTML-escaped at render; the runtime drops any image URL that `safeUrl()` rejects.
- Blocks contain no links and no shopper data fields. The only form control the runtime adds is the `compare` range input.
- Stable part hooks (used later by the theming work): `data-part="blocks"`, `data-part="block"` (+ `data-part-type="media|compare"`), `data-part="block-media"`, `data-part="block-compare"`.
- **NEVER** run `prisma migrate *`, `prisma db push`, or anything that touches a database. The migration SQL is written by hand and applied by the owner. `prisma generate` is fine.
- Run only the test files named in each task, one at a time. Do not run the full `apps/api` storefront-source suite (≈45 min, times out under load).
- Repo uses `pnpm`. Never run `pnpm` or commit in `/Users/saramia/pagosYaWeb`.
- To see Studio changes in a browser: `pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded`.
- Stage only files you changed. Commit after each Part (and inside a Part where a task is a clean unit). Do not push or merge.

## Review Focus

Failure modes the spec implies but a straight implementation would miss (each has a test in the owning task):

1. **Legacy variants.** A variant with only `imageUrl` (every store published before this work) still normalizes, still round-trips, and still swaps the gallery to its one photo. (Task 1, Task 3)
2. **Stale set after a legacy edit.** A client that sends only a new `imageUrl` must not leave an old `imageUrls` set behind that contradicts it; `imageUrl: null` clears both. (Task 1)
3. **Colour with no photos while others have sets.** Choosing it must show the full product gallery, never an empty one. (Task 3)
4. **Hostile content.** Caption/title/alt containing `<img onerror>` render as text; a `javascript:` image URL drops the block/photo instead of rendering. (Task 3, Task 5)
5. **No regression for products with neither feature.** Markup for a product without sets or blocks is unchanged (no empty `.product-detail__blocks` element). (Task 3, Task 5)
6. **Photo removed from the pool.** Removing a product photo that a variant set or a block still references must block saving with a clear Spanish error, like the existing single-photo check. (Task 4, Task 6)

---

## PART 1 — Per-colour photo sets

### Task 1: API — `imageUrls` on variants

**Files:**
- Modify: `apps/api/src/payment-links/product-variants.ts` (type `ProductVariant`, function `normalizeProductVariants`, lines ~6-50)
- Modify: `apps/api/src/payment-links/dto/create-payment-link.dto.ts` (class `ProductVariantDto`, right after the `imageUrl` field, ~line 61)
- Modify: `apps/api/src/storefront-source/source-product-options.ts` (the `properties` object: add `imageUrls`, and wherever that file builds a variant DTO from `imageUrl`, pass `imageUrls` through)
- Modify: `apps/checkout/src/api.ts:88` (public variant type: add `imageUrls?: string[]`)
- Test: `apps/api/src/payment-links/product-variants.spec.ts` (append) and create `apps/api/src/stores/product-variants-public.spec.ts`

**Interfaces:**
- Produces: `ProductVariant = { id; name; amount; stock?; options?; imageUrl?: string; imageUrls?: string[] }`. Invariant after normalize: if `imageUrls` is present it is non-empty, deduped, max 8, and `imageUrl === imageUrls[0]`.
- Produces: `ProductVariantDto.imageUrls?: string[] | null`.

Photo rules in `normalizeProductVariants` (`previous` = the existing variant with the same id):

| DTO sends | Result |
|---|---|
| `imageUrls: [a,b,c]` (non-empty) | set = deduped `[a,b,c]`, `imageUrl = a` (an explicit `imageUrl` in the same request is ignored) |
| `imageUrls: []` or `null` | set cleared, `imageUrl` cleared |
| `imageUrl: x`, no `imageUrls` | `imageUrl = x`; keep `previous.imageUrls` only if `previous.imageUrls[0] === x`, otherwise drop the set |
| `imageUrl: null`, no `imageUrls` | both cleared |
| neither | keep `previous.imageUrl` and `previous.imageUrls` |

- [ ] **Step 1: Write the failing tests** (append to `product-variants.spec.ts`; reuse its `option()` helper)

```ts
const A = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg';
const B = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';
const C = '/v1/uploads/33333333-3333-3333-3333-333333333333.jpg';

it('stores a deduped photo set per variant and mirrors the first photo in imageUrl', () => {
  const [v] = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B, A] }, option('Azul', 'S', 1)]);
  expect(v.imageUrls).toEqual([A, B]);
  expect(v.imageUrl).toBe(A);
});

it('rejects more than 8 photos in one set', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `/v1/uploads/${String(i).repeat(8)}-1111-1111-1111-111111111111.jpg`);
  expect(() => normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: nine }, option('Azul', 'S', 1)])).toThrow('8');
});

it('keeps a legacy single-photo variant as it is', () => {
  const [v] = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrl: A }, option('Azul', 'S', 1)]);
  expect(v.imageUrl).toBe(A);
  expect(v.imageUrls).toBeUndefined();
});

it('preserves the saved set when an edit omits both photo fields, and clears it on empty/null', () => {
  const saved = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B] }, option('Azul', 'S', 1)]);
  const keep = normalizeProductVariants(saved.map(v => ({ id: v.id, name: v.name, amount: v.amount })), saved);
  expect(keep[0].imageUrls).toEqual([A, B]);
  const cleared = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrls: [] } : {}) })), saved);
  expect(cleared[0].imageUrls).toBeUndefined();
  expect(cleared[0].imageUrl).toBeUndefined();
});

it('lets a legacy imageUrl edit win over a stale set, and imageUrl:null clears both', () => {
  const saved = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B] }, option('Azul', 'S', 1)]);
  const swapped = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: C } : {}) })), saved);
  expect(swapped[0].imageUrl).toBe(C);
  expect(swapped[0].imageUrls).toBeUndefined();
  const same = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: A } : {}) })), saved);
  expect(same[0].imageUrls).toEqual([A, B]);
  const gone = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: null } : {}) })), saved);
  expect(gone[0].imageUrl).toBeUndefined();
  expect(gone[0].imageUrls).toBeUndefined();
});
```

`apps/api/src/stores/product-variants-public.spec.ts` (public read keeps the set):

```ts
import { readProductVariants } from './product-pricing';

it('passes a variant photo set through to the public catalog and drops nothing else', () => {
  const rows = readProductVariants([{ id: 'v1', name: 'Rojo', amount: 100, imageUrl: '/v1/uploads/a.jpg', imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'] }] as never);
  expect(rows[0]).toMatchObject({ imageUrls: ['/v1/uploads/a.jpg', '/v1/uploads/b.jpg'] });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @pagosya/api exec jest src/payment-links/product-variants.spec.ts src/stores/product-variants-public.spec.ts`
Expected: FAIL (`imageUrls` undefined / TypeScript error on unknown field).

- [ ] **Step 3: Implement**

`ProductVariantDto` (after `imageUrl`):

```ts
  @IsOptional() @IsArray() @ArrayMaxSize(8) @Matches(UPLOADED_FILE_URL_PATTERN, { each: true }) @MaxLength(MAX_UPLOADED_FILE_URL_LENGTH, { each: true })
  imageUrls?: string[] | null;
```

In `normalizeProductVariants`, replace the single `const imageUrl = ...` block with the table above, for example:

```ts
    const dedupe = (urls: string[]) => [...new Set(urls)];
    let imageUrl: string | undefined, imageUrls: string[] | undefined;
    if (Array.isArray(variant.imageUrls) && variant.imageUrls.length) {
      imageUrls = dedupe(variant.imageUrls);
      if (imageUrls.length > 8) throw new BadRequestException('Usa hasta 8 fotos por opción.');
      imageUrl = imageUrls[0];
    } else if (variant.imageUrls !== undefined) {
      // [] or null: the merchant cleared this option's photos.
    } else if (variant.imageUrl !== undefined) {
      imageUrl = variant.imageUrl ?? undefined;
      const kept = previous?.imageUrls;
      if (imageUrl && kept?.length && kept[0] === imageUrl) imageUrls = kept;
    } else {
      imageUrl = previous?.imageUrl; imageUrls = previous?.imageUrls;
    }
```

and in the `result` object add `...(imageUrls ? { imageUrls } : {})` next to `...(imageUrl ? { imageUrl } : {})`. Add `imageUrls?: string[]` to `ProductVariant`. In `source-product-options.ts` add `imageUrls: nullable({ type: 'array', maxItems: 8, items: { type: 'string' }, description: 'Original uploaded product-photo URLs for this option; null preserves.' })` to `properties`, and follow every place that reads `imageUrl` from that schema's output so `imageUrls` travels the same way. In `apps/checkout/src/api.ts:88` add `imageUrls?: string[]` to the variant type.

- [ ] **Step 4: Run tests to verify pass**

Run: same command as Step 2, plus `pnpm --filter @pagosya/api exec jest src/storefront-source/source-product-options.spec.ts` and `pnpm --filter @pagosya/api exec tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors. Fix any existing test that asserted the exact variant JSON shape.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payment-links apps/api/src/stores/product-variants-public.spec.ts apps/api/src/storefront-source/source-product-options.ts apps/checkout/src/api.ts
git commit -m "feat(catalog): variants can hold a photo set (imageUrls, max 8), imageUrl stays the first photo"
```

### Task 2: Preview hydration of variant photo sets

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-media.ts:66-70` (the `item.variants` loop)
- Test: the existing spec that covers `source-preview-media` (find with `git ls-files | grep -i preview-media`; if none exists, create `packages/storefront-preview/src/source-preview-media.test.ts` following the neighbouring test style)

**Interfaces:** Consumes `variant.imageUrls?: string[]` from Task 1. Produces: after hydration every entry of `variant.imageUrls` is replaced by the same hydrated URL the single `imageUrl` would get (so a set and the gallery never disagree inside the sandboxed frame).

- [ ] **Step 1: Failing test** — hydrate a config whose variant has `imageUrl: A, imageUrls: [A, B]` with a fake `image()` that maps `x → 'data:' + x`; expect both fields hydrated and `imageUrls[0] === imageUrl`.
- [ ] **Step 2:** Run the spec file with the package's runner (`pnpm --filter @pagosya/storefront-preview exec vitest run <file>`); expect FAIL.
- [ ] **Step 3: Implement** — inside the existing `for (const variant of item.variants)` add:

```ts
        if (variant && Array.isArray(variant.imageUrls)) variant.imageUrls.forEach((value: unknown, index: number) => tasks.push(async () => { variant.imageUrls[index] = await image(value); }));
```

- [ ] **Step 4:** Run; expect PASS. Also run `pnpm --filter @pagosya/storefront-preview exec tsc --noEmit`.
- [ ] **Step 5:** `git commit -m "feat(preview): hydrate variant photo sets like single variant photos"`

### Task 3: Runtime — choosing a colour shows its whole set

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` — `galleryImages` (~line 379), `showImage` (~1053), the gallery markup inside `openProduct` (~1075-1083), the option-click handler (~3280-3287, the block that computes `candidateImages`), and `cardSwatches` (~2009) / `cardPreview` (only to keep using the first photo of a set)
- Test: append to `apps/api/src/storefront-source/source-commerce-pages.spec.ts` inside the `describe('Inline storefront product options'` block, reusing its `shop`, `product`, `variant` helpers (defined at lines ~62-76)

**Interfaces:**
- Consumes: variant `imageUrls?: string[]` (Task 1).
- Produces (inside the kit closure): `variantPhotos(v)` → `string[]` (safe URLs; `imageUrls` if non-empty else `[imageUrl]` else `[]`); `let activeGallery = null` (`string[] | null`); `currentGallery()` → `activeGallery || galleryImages(selectedProduct)`; `drawGallery(images)` → re-renders `.product-detail__gallery` inner markup (stage, counter, prev/next, thumbnails) and resets `selectedImage = 0`.

Behaviour:
- `galleryImages(p)` (the full gallery, used by cards and the initial state) now also includes every variant photo in `v.imageUrls`.
- On every option change, compute `matches` (variants compatible with the current partial selection — the existing code at ~3283 already does this). Let `sets = matches.map(v => variantPhotos(v))`. If `matches.length && sets.every(s => s.length && s.join('|') === sets[0].join('|'))` then `activeGallery = sets[0]`, else `activeGallery = null` (this covers mixed sets AND any match without photos). If `activeGallery` changed, `drawGallery(currentGallery())`; otherwise leave the DOM alone.
- `showImage`, prev/next and thumbnail clicks must use `currentGallery()` instead of `galleryImages(selectedProduct)`.
- `openProduct` resets `activeGallery = null`.
- The old "jump to the variant's photo inside the union" logic at ~3283-3287 is replaced by the above for variants that have a set; for a legacy single-photo variant `variantPhotos(v)` is `[imageUrl]`, so a legacy store whose variants each have one photo would now show a **one-photo gallery** on a full colour choice. To keep legacy behaviour exactly, apply the set logic only when the agreed set has **more than one photo**; when the agreed set has exactly one photo keep the old behaviour (`showImage(indexOf in the full gallery)`), and leave `activeGallery = null`.
- Add near the top of the file, beside the existing `pagosya-product-options:v1` marker comment: `// pagosya-product-content:v1 — per-colour photo sets and product content blocks.`

- [ ] **Step 1: Write the failing tests**

```ts
  it('shows a colour\'s whole photo set and returns to the full gallery when the choice is mixed', async () => {
    const red = ['https://shop.test/red-1.jpg', 'https://shop.test/red-2.jpg', 'https://shop.test/red-3.jpg'];
    const blue = ['https://shop.test/blue-1.jpg', 'https://shop.test/blue-2.jpg'];
    const p = { ...product(), imageUrls: ['https://shop.test/base.jpg'], variants: [
      { ...variant('red-s', 'Rojo', 'S'), imageUrls: red, imageUrl: red[0] },
      { ...variant('red-m', 'Rojo', 'M', 3000, 1), imageUrls: red, imageUrl: red[0] },
      { ...variant('blue-m', 'Azul', 'M', 4000, 1), imageUrls: blue, imageUrl: blue[0] },
    ] };
    const { w, query, click, choose } = await shop({ items: [p] });
    click('.menu-add');
    const thumbs = () => [...w.document.querySelectorAll('[data-product-image] img')].map((i: any) => i.getAttribute('src'));
    expect(thumbs()).toHaveLength(6); // base + 3 red + 2 blue
    choose(0, 'Rojo');
    expect(thumbs()).toEqual(red);
    expect(query('.product-detail__photo').getAttribute('src')).toBe(red[0]);
    expect(query('[data-product-count]').textContent).toBe('1 / 3');
    choose(0, 'Azul');
    expect(thumbs()).toEqual(blue);
    expect(query('[data-product-count]').textContent).toBe('1 / 2');
  });

  it('keeps the full gallery when the matching variants disagree or a colour has no photos', async () => {
    const p = { ...product(), variants: [
      { ...variant('red-s', 'Rojo', 'S'), imageUrls: ['https://shop.test/r1.jpg', 'https://shop.test/r2.jpg'], imageUrl: 'https://shop.test/r1.jpg' },
      { ...variant('blue-s', 'Azul', 'S', 4000, 1) },
      { ...variant('red-m', 'Rojo', 'M', 3000, 1), imageUrls: ['https://shop.test/r1.jpg', 'https://shop.test/r2.jpg'], imageUrl: 'https://shop.test/r1.jpg' },
    ] };
    const { w, click, choose } = await shop({ items: [p] });
    click('.menu-add');
    const count = () => w.document.querySelectorAll('[data-product-image]').length;
    const full = count();
    choose(0, 'Azul'); // no photos at all → never an empty gallery
    expect(count()).toBe(full);
    choose(1, 'S');    // Rojo/S and Azul/S disagree
    expect(count()).toBe(full);
  });

  it('keeps a legacy single-photo colour on the old behaviour (full gallery, jumps to its photo)', async () => {
    const { w, query, click, choose } = await shop({ items: [product()] }); // blue variant has imageUrl only
    click('.menu-add');
    const before = w.document.querySelectorAll('[data-product-image]').length;
    choose(0, 'Azul');
    expect(w.document.querySelectorAll('[data-product-image]').length).toBe(before);
    expect(query('.product-detail__photo').getAttribute('src')).toBe('https://shop.test/blue.jpg');
  });

  it('renders no gallery change for a product without photo sets (markup identical)', async () => {
    const { query, click } = await shop({ items: [product()] });
    click('.menu-add');
    expect(query('.product-detail__thumbnails')).not.toBeNull();
    expect(query('[data-part="blocks"]')).toBeNull();
  });
```

(Adjust `choose()`/counts to how the harness numbers option groups; group 0 is Color and group 1 is Talla in `variant()`. If a step re-renders the option buttons, re-query before clicking again. The `1 / 3` counter assertion depends on `showImage` being re-run by `drawGallery`.)

- [ ] **Step 2:** Run `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts -t "photo set|legacy single-photo|without photo sets"`; expect FAIL.
- [ ] **Step 3: Implement** the behaviour above. Extract the stage+thumbnail markup that `openProduct` builds at ~1083 (`<div class="product-detail__stage">…` and `<div class="product-detail__thumbnails">…`) into `galleryMarkup(images, p)` used by both `openProduct` and `drawGallery` so the initial render is byte-identical to today.
- [ ] **Step 4:** Run the three test names above, then the whole file once: `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts`. Also run `src/storefront-source/source-commerce-surfaces.spec.ts` and `source-commerce-design.spec.ts` (card previews and product CSS text). All PASS.
- [ ] **Step 5:** `git add packages/storefront-kit apps/api/src/storefront-source/source-commerce-pages.spec.ts && git commit -m "feat(kit): choosing a colour shows that colour's whole photo set"`

### Task 4: Studio — pick several photos per option

**Files:**
- Modify: `packages/variant-editor/variant-editor.js` (the photo `<select>` cell inside `drawRows`, ~lines 94-98; the change handler, ~lines 138-146; `values()` output, line ~45), `packages/variant-editor/index.d.ts` (`VariantDraft`, `VariantInput`: add `imageUrls?: string[]` / `imageUrls?: string[] | null`), `packages/variant-editor/variant-editor.css` (small styles for the photo picker)
- Modify: `apps/merchant-studio/src/source-create-product.ts` (lines ~186-189 initial rows; ~358 the "photo was removed" check; ~385 URL mapping), `apps/merchant-studio/src/api.ts:301` (`createProduct` input `variants` element type: add `imageUrls?: string[] | null`) and the matching update method
- Test: create `apps/merchant-studio/src/variant-photo-sets.test.ts` (vitest, `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `config.photos()` → `Array<{ preview: string }>` (the product's photo pool, as today).
- Produces: each draft row has `imageUrls: string[]` (preview URLs) alongside `imageUrl`; `values()` emits, for a row with `imageDirty`, `imageUrls: string[] | null` (`null` when empty) and `imageUrl` = first or `null`.

UI: replace the "Foto" `<select>` with a "Fotos" `<details>` per row containing one checkbox per photo in the pool (thumbnail + "Foto N"), in pool order; the summary reads "Sin fotos" / "1 foto" / "3 fotos". Checkbox order = pool order (the set order is the pool order; the first checked photo is the option's main photo). Existing rows with only `imageUrl` load as a one-photo set.

- [ ] **Step 1: Failing test** — mount `PagosYaProductOptions` (see how `source-create-product.test.ts` mounts it and what `photos` returns) with two colours and a pool of three photos; tick photos 1 and 3 on the first row; expect `editor.values()[0]` to have `imageUrls: [photo1, photo3]`, `imageUrl: photo1`; untick all → `imageUrls: null`, `imageUrl: null`; a row loaded with only `imageUrl` shows exactly one checkbox ticked and, untouched, emits neither photo field.
- [ ] **Step 2:** `pnpm --filter @pagosya/merchant-studio exec vitest run src/variant-photo-sets.test.ts` → FAIL.
- [ ] **Step 3: Implement.** In `source-create-product.ts`: initial rows keep `imageUrls` (fall back to `[imageUrl]`); at save (~385) map each entry of `variant.imageUrls` from `preview` to the uploaded `url` with the same lookup used for `imageUrl`; the removed-photo guard at ~358 must also reject any `imageUrls` entry missing from the pool with the existing Spanish message ("Una foto de combinación fue retirada. Elige otra foto para esa combinación.") — add a test line for it in `source-create-product.test.ts` following its style.
- [ ] **Step 4:** Run the new test, `src/source-create-product.test.ts`, `src/source-templates-page.test.ts`, and `pnpm --filter @pagosya/merchant-studio exec tsc -p tsconfig.json --noEmit`. PASS. Rebuild Studio (`vite build --mode embedded`) and confirm it exits 0.
- [ ] **Step 5:** `git add packages/variant-editor apps/merchant-studio && git commit -m "feat(studio): pick several photos per product option"`

**Part 1 done → the commit above is the Part 1 checkpoint. Do not start Part 2 before Tasks 1-4 pass.**

---

## PART 2 — Typed content blocks

### Task 5: API — `contentBlocks` column, normalizer, DTO, public exposure

**Files:**
- Create: `apps/api/prisma/migrations/20260929120000_product_content_blocks/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (model `PaymentLink`, add after `highlights`)
- Create: `apps/api/src/payment-links/product-content-blocks.ts`
- Create: `apps/api/src/payment-links/product-content-blocks.spec.ts`
- Modify: `apps/api/src/payment-links/dto/create-payment-link.dto.ts` (add `ContentBlockDto` and a `contentBlocks` field next to `highlights`, ~line 216); the update DTO if it is a separate class
- Modify: `apps/api/src/payment-links/payment-links.service.ts` (create ~line 476 and update ~line 927, next to the two `highlights:` lines; also the bulk-import path ~825 only if it already sets `highlights` — otherwise leave it)
- Modify: `apps/api/src/stores/public-stores.service.ts:333` (add `contentBlocks: readContentBlocks(item.contentBlocks)`)

**Interfaces:**
- Produces (in `product-content-blocks.ts`):

```ts
export const MAX_CONTENT_BLOCKS = 6;
export type MediaBlock = { id: string; type: 'media'; imageUrl: string; alt: string; caption?: string };
export type CompareBlock = { id: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string };
export type ContentBlock = MediaBlock | CompareBlock;
export function normalizeContentBlocks(rows: unknown, existing?: ContentBlock[]): ContentBlock[]; // strict: throws BadRequestException (Spanish messages)
export function readContentBlocks(value: unknown): ContentBlock[];                                  // lenient: drops invalid rows, never throws (public read)
```

Rules: `rows` undefined/null → `[]`; more than 6 → throw `'Usa hasta 6 bloques por producto.'`; `type` must be `media` or `compare`; strings trimmed; `alt` 1–160, `caption` ≤ 140 (omitted when empty), `title` 1–60, labels 1–24; every image URL must match `UPLOADED_FILE_URL_PATTERN` and be ≤ `MAX_UPLOADED_FILE_URL_LENGTH`; `id`: keep a supplied id matching `/^blk_[a-z0-9]{12}$/` that exists in `existing` (or any well-formed one), otherwise generate `blk_` + 12 chars with `customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12)` (same as variant ids); duplicate ids → regenerate the later one.

- [ ] **Step 1: Failing tests** (`product-content-blocks.spec.ts`)

```ts
import { normalizeContentBlocks, readContentBlocks } from './product-content-blocks';
const A = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg';
const B = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';

it('accepts a media block and a compare block and gives each a stable id', () => {
  const rows = normalizeContentBlocks([
    { type: 'media', imageUrl: A, alt: ' Respaldo reclinado ', caption: ' 35° ' },
    { type: 'compare', title: 'Reclinación', beforeUrl: A, afterUrl: B, beforeLabel: 'Recta', afterLabel: '35°', alt: 'Silla recta y reclinada' },
  ]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ type: 'media', alt: 'Respaldo reclinado', caption: '35°' });
  expect(rows[0].id).toMatch(/^blk_[a-z0-9]{12}$/);
  const again = normalizeContentBlocks(rows, rows);
  expect(again.map(b => b.id)).toEqual(rows.map(b => b.id));
});

it('rejects a seventh block, an unknown type, a non-upload URL and an empty alt', () => {
  const media = { type: 'media', imageUrl: A, alt: 'x' };
  expect(() => normalizeContentBlocks(Array.from({ length: 7 }, () => media))).toThrow('6');
  expect(() => normalizeContentBlocks([{ ...media, type: 'video' }])).toThrow();
  expect(() => normalizeContentBlocks([{ ...media, imageUrl: 'https://evil.test/a.jpg' }])).toThrow();
  expect(() => normalizeContentBlocks([{ ...media, alt: '  ' }])).toThrow();
});

it('the public read drops invalid rows instead of throwing and returns [] for junk', () => {
  expect(readContentBlocks('nope')).toEqual([]);
  expect(readContentBlocks([{ type: 'media', imageUrl: 'javascript:alert(1)', alt: 'x' }, { id: 'blk_abcdefghijkl', type: 'media', imageUrl: A, alt: 'ok' }]))
    .toEqual([{ id: 'blk_abcdefghijkl', type: 'media', imageUrl: A, alt: 'ok' }]);
});
```

- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/payment-links/product-content-blocks.spec.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the module, the migration and schema line:

```sql
-- apps/api/prisma/migrations/20260929120000_product_content_blocks/migration.sql
ALTER TABLE "PaymentLink" ADD COLUMN "contentBlocks" JSONB NOT NULL DEFAULT '[]';
```

```prisma
  // Ordered merchant-supplied blocks shown inside the product page (media / compare), max 6.
  contentBlocks         Json                        @default("[]")
```

DTO: `ContentBlockDto` with `@IsIn(['media','compare']) type`, optional `@IsString() @IsSafeText()` text fields and `@Matches(UPLOADED_FILE_URL_PATTERN)` URL fields (the normalizer is the real gate); `@IsOptional() @IsArray() @ArrayMaxSize(6) @ValidateNested({ each: true }) @Type(() => ContentBlockDto) contentBlocks?: ContentBlockDto[]`. Service: create → `contentBlocks: normalizeContentBlocks(dto.contentBlocks) as unknown as Prisma.InputJsonValue`; update → `...(dto.contentBlocks !== undefined && { contentBlocks: normalizeContentBlocks(dto.contentBlocks, readContentBlocks(link.contentBlocks)) as unknown as Prisma.InputJsonValue })`. Run `pnpm --filter @pagosya/api exec prisma generate` (allowed) so the client type has the field. Do **not** apply the migration.
- [ ] **Step 4:** Run the new spec, `src/payment-links/product-variants.spec.ts`, `src/stores/public-stores.service.spec.ts` (add one assertion that a product with `contentBlocks` JSON exposes them and one without exposes `[]`), and `tsc --noEmit`. PASS.
- [ ] **Step 5:** `git commit -m "feat(catalog): products can hold up to 6 content blocks (media, compare); migration written, not applied"`

### Task 6: Runtime — render the blocks

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (new `contentBlocksMarkup(p)` beside `highlightsMarkup`/`specRows` ~line 1160; call it from `openProduct`; CSS in the kit's product stylesheet string next to the other `[data-pagosya-product][data-style] …` rules; a small delegated `input` listener for the range)
- Modify: `packages/storefront-preview/src/source-preview-media.ts` (hydrate block image URLs like variant photos) + its test
- Test: append to `apps/api/src/storefront-source/source-commerce-pages.spec.ts`

**Interfaces:** Consumes `p.contentBlocks: ContentBlock[]` (Task 5 shape). Produces: markup

```html
<section class="product-detail__blocks" data-part="blocks" aria-label="Más sobre este producto">
  <figure class="product-detail__block" data-part="block" data-part-type="media"><img data-part="block-media" src alt loading="lazy"><figcaption>…</figcaption></figure>
  <div class="product-detail__block" data-part="block" data-part-type="compare" data-part-compare>
    <h3>title</h3>
    <div class="product-detail__compare" data-part="block-compare" style="--pd-compare:50%">
      <img class="pd-compare__before" src alt> <img class="pd-compare__after" src alt="">
      <span class="pd-compare__label pd-compare__label--before">beforeLabel</span><span class="pd-compare__label pd-compare__label--after">afterLabel</span>
    </div>
    <input class="pd-compare__range" type="range" min="0" max="100" value="50" aria-label="Comparar: {beforeLabel} y {afterLabel}">
  </div>
</section>
```

The `after` image is clipped with `clip-path: inset(0 0 0 var(--pd-compare))`; the range's `input` event sets `--pd-compare` on `.product-detail__compare` to `${value}%`. Place the section after `.product-detail__layout` (below the gallery + copy). Rules: return `''` when the product has no valid blocks (no empty wrapper); each URL goes through `safeUrl()` and a block whose image URL is rejected is dropped; all text through `escape()`; at most 6 blocks rendered; CSS uses only the existing `--pd-*` tokens and adds no `position: fixed`.

- [ ] **Step 1: Failing tests**

```ts
  it('renders media and compare blocks in order inside the product page, escaped', async () => {
    const p = { ...product(), contentBlocks: [
      { id: 'blk_aaaaaaaaaaaa', type: 'media', imageUrl: 'https://shop.test/angle.jpg', alt: 'Respaldo reclinado', caption: '<img src=x onerror=alert(1)>35°' },
      { id: 'blk_bbbbbbbbbbbb', type: 'compare', title: 'Reclinación', beforeUrl: 'https://shop.test/a.jpg', afterUrl: 'https://shop.test/b.jpg', beforeLabel: 'Recta', afterLabel: '35°', alt: 'Silla recta y reclinada' },
    ] };
    const { w, query, click } = await shop({ items: [p] });
    click('.menu-add');
    const blocks = [...w.document.querySelectorAll('.product-detail__blocks [data-part="block"]')];
    expect(blocks.map((b: any) => b.dataset.partType)).toEqual(['media', 'compare']);
    expect(query('[data-part="block-media"]').getAttribute('alt')).toBe('Respaldo reclinado');
    expect(query('figcaption').textContent).toBe('<img src=x onerror=alert(1)>35°');
    expect(query('figcaption img')).toBeNull();
    const range = query('.pd-compare__range');
    range.value = '30'; range.dispatchEvent(new w.Event('input', { bubbles: true }));
    expect(query('.product-detail__compare').style.getPropertyValue('--pd-compare')).toBe('30%');
    expect(range.getAttribute('aria-label')).toBe('Comparar: Recta y 35°');
  });

  it('drops a block whose image URL is unsafe and renders no wrapper when nothing is left', async () => {
    const p = { ...product(), contentBlocks: [{ id: 'blk_cccccccccccc', type: 'media', imageUrl: 'javascript:alert(1)', alt: 'x' }] };
    const { query, click } = await shop({ items: [p] });
    click('.menu-add');
    expect(query('[data-part="blocks"]')).toBeNull();
  });

  it('caps rendering at six blocks and the runtime carries the content marker', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `blk_${String(i).repeat(12)}`, type: 'media', imageUrl: `https://shop.test/${i}.jpg`, alt: `f${i}` }));
    const { w, click } = await shop({ items: [{ ...product(), contentBlocks: many }] });
    click('.menu-add');
    expect(w.document.querySelectorAll('[data-part="block"]')).toHaveLength(6);
    expect(readFileSync(kitPath('commerce.js'), 'utf8')).toContain('pagosya-product-content:v1');
  });
```

(`readFileSync`/`kitPath` are already imported at the top of that spec; if not, import them.)

- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/source-commerce-pages.spec.ts -t "content blocks|unsafe|six blocks"` → FAIL.
- [ ] **Step 3: Implement** markup, CSS and the delegated `input` listener (attach it where the runtime already delegates `click` for the detail dialog; the range lives inside the dialog, so listen on `detail`). Add a hydration test + change for block URLs in `source-preview-media.ts` (`item.contentBlocks[*].imageUrl/beforeUrl/afterUrl`).
- [ ] **Step 4:** Run the three test names, then the whole `source-commerce-pages.spec.ts`, `source-commerce-surfaces.spec.ts`, `source-commerce-design.spec.ts`, `source-commerce-contrast.spec.ts` and the preview-media spec, each on its own. PASS.
- [ ] **Step 5:** `git commit -m "feat(kit): render product content blocks (media, compare) inside the product page"`

### Task 7: Studio — "Contenido del producto" editor

**Files:**
- Create: `apps/merchant-studio/src/product-content-blocks-editor.ts` and `apps/merchant-studio/src/product-content-blocks-editor.css`
- Modify: `apps/merchant-studio/src/source-create-product.ts` (mount the editor in the photos step area, read `values()` at save, map photo previews to uploaded URLs exactly like variant photos, extend the removed-photo guard), `apps/merchant-studio/src/api.ts` (`createProduct` and the update method: `contentBlocks?: ContentBlockInput[]`)
- Test: create `apps/merchant-studio/src/product-content-blocks-editor.test.ts` (vitest + jsdom); extend `source-create-product.test.ts` for the save mapping

**Interfaces:**
- Produces:

```ts
export type ContentBlockInput =
  | { id?: string; type: 'media'; imageUrl: string; alt: string; caption?: string }
  | { id?: string; type: 'compare'; title: string; beforeUrl: string; afterUrl: string; beforeLabel: string; afterLabel: string; alt: string };
export function mountContentBlocksEditor(host: HTMLElement, options: { initial: ContentBlockInput[]; photos: () => Array<{ preview: string }>; max?: number }):
  { values(): ContentBlockInput[]; refreshPhotos(): void; dispose(): void };
```

`values()` returns image fields as **preview URLs** (the caller maps them to uploaded URLs at save, same as variants). UI: collapsed `<details>` "Contenido del producto (opcional)"; "Agregar bloque" menu with "Foto con texto" and "Antes / después"; each block is a card with its fields (photo chosen from the product's photo pool via a `<select>` or thumbnail radio group, `alt` labelled "Descripción de la foto (para lectores de pantalla)"), up/down and delete buttons, counter "n de 6"; "Agregar bloque" disabled at 6. All labels in Spanish. Empty required text blocks the save with a clear message ("Falta la descripción de la foto en el bloque 2.").

- [ ] **Step 1: Failing tests** — (a) add a media block, pick photo 2, fill alt/caption → `values()` equals `[{ type:'media', imageUrl: photo2.preview, alt, caption }]`; (b) add a compare block, before/after photos, labels → correct object; (c) reorder with the down button reverses order; delete removes; 7th block impossible (button disabled at 6); (d) `initial` blocks render with their values and untouched `values()` returns the same blocks including ids; (e) `refreshPhotos()` after a photo is removed from the pool marks blocks pointing at it as invalid (`values()` throws an `Error` whose message starts with "Una foto de un bloque fue retirada"). In `source-create-product.test.ts`: saving maps every block preview URL to its uploaded `url` and sends `contentBlocks`.
- [ ] **Step 2:** `pnpm --filter @pagosya/merchant-studio exec vitest run src/product-content-blocks-editor.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Follow the DOM/escape/`data-*` conventions of `source-direct-editor.ts` (`escape` from `./studio-ui`, event delegation on the host, no innerHTML with unescaped merchant text).
- [ ] **Step 4:** Run the new test, `src/source-create-product.test.ts`, `src/variant-photo-sets.test.ts`, `src/source-templates-page.test.ts`, `src/source-browser.test.ts`, and `tsc --noEmit`. PASS. Rebuild Studio (`vite build --mode embedded`), exit 0.
- [ ] **Step 5:** `git commit -m "feat(studio): edit product content blocks (photo with text, before/after)"`

### Task 8: Final verification and docs

**Files:** Modify `docs/superpowers/specs/2026-09-29-product-photo-sets-and-content-blocks-design.md` (apply the four deviations at the top so spec and code agree; keep it short), `docs/superpowers/specs/2026-09-29-themed-product-card-program.md` (mark sub-projects 1 and 2 "built" with the commit ids).

- [ ] **Step 1:** Re-run, each on its own, and record the results in your final message: `product-variants.spec.ts`, `product-content-blocks.spec.ts`, `product-variants-public.spec.ts`, `public-stores.service.spec.ts`, `source-product-options.spec.ts`, `source-commerce-pages.spec.ts`, `source-commerce-surfaces.spec.ts`, `source-commerce-design.spec.ts`, `source-commerce-contrast.spec.ts` (api, jest); `source-create-product.test.ts`, `variant-photo-sets.test.ts`, `product-content-blocks-editor.test.ts`, `source-templates-page.test.ts`, `source-browser.test.ts` (merchant-studio, vitest); the preview-media spec; `tsc --noEmit` for `@pagosya/api`, `@pagosya/merchant-studio`, `@pagosya/checkout`.
- [ ] **Step 2:** Manual check (only if a dev server and DB are already running; do not start or reset a database): rebuild Studio, open a product with two colours, give each colour two photos, add a media block and a compare block, open the store preview, confirm the gallery swaps per colour and the blocks show. If you cannot run this, say so explicitly in the final message.
- [ ] **Step 3:** Commit docs: `git commit -m "docs: photo sets and content blocks built; spec matches the code"`.
- [ ] **Step 4: Final message** must list: commits, every test command run with pass/fail, anything not verified, and the migration `apps/api/prisma/migrations/20260929120000_product_content_blocks/migration.sql` the **owner** must apply before `contentBlocks` works against a real database.
