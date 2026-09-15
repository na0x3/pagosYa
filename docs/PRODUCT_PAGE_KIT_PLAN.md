# Product Page Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every generated store's product page (full page and quick view) renders in one of two platform-owned styles, editorial or dense, taking only colors, fonts and radius from the store.

**Architecture:** The shared browser runtime `apps/api/src/stores/source-kit/commerce.js` already renders the product page for every store (hosted, editor, Studio preview). It gains a style resolver, releases store-authored CSS rules that target product-page hooks, renders a few markup additions, and replaces its layered product CSS with one unlayered stylesheet keyed on `data-style`. YAPI's design concept records the style (`layout.productPage`), which generation writes into `config.js` as `productPageStyle`; stores without one get a style inferred from their catalog. Capture evidence gains three product-page hard checks.

**Tech Stack:** Vanilla browser JS and CSS in the kit, NestJS + Jest in `apps/api`, Playwright in `apps/merchant-studio`.

**Spec:** `docs/PRODUCT_PAGE_KIT.md`

## Global Constraints

- Shopper-facing copy stays Spanish; code comments stay English and short.
- Show only real catalog and store data. No invented badges, claims, reviews or shipping promises.
- Keep every existing runtime hook and accessible name: `data-product-option`, `data-option-value`, `aria-pressed`, `data-variant-add`, `data-add`, `data-product-quantity`, `data-product-quantity-value`, `data-product-subtotal`, `data-product-total`, `data-product-image`, `data-product-prev`, `data-product-next`, `data-product-count`, `data-product-pricing`, `data-product-selection`, `data-product-rating`, `data-product-reviews`, `data-product-sticky`, `data-product-sticky-space`, `data-product-sticky-price`, `data-product-jump`, `data-product-delivery`, `data-product-tab`, `data-product-close`; button names "Añadir al pedido", "Ver foto N", "Foto anterior", "Foto siguiente", "Cerrar detalle del producto".
- Token fallbacks keep the existing chain: `--store-*`, then `--brand-*`, then legacy (`--ink`, `--paper`, `--accent`, `--line`).
- No new dependencies.
- The kit must not throw where CSSOM is partial (the JSDOM spec `apps/api/src/stores/source-commerce-pages.spec.ts` runs it).
- Commit subjects follow repo history: plain English, imperative, no prefix. End each message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

Commands:
- API tests: `cd apps/api && npx jest src/stores/<file>.spec.ts`
- API types: `cd apps/api && npx tsc --noEmit`
- Browser tests: `cd apps/merchant-studio && npx playwright test tests/<file>.spec.ts`

---

### Task 1: Record the product page style with the design concept

**Files:**
- Modify: `apps/api/src/stores/source-design.ts` (layout type, schema, validation, `SOURCE_DESIGN_CONTRACT`, `SOURCE_PRODUCT_PRESENTATION_DIRECTION`)
- Modify: `apps/api/src/stores/source-visual-system.ts` (type, `buildSourceVisualSystem`, new `sourceProductPageStyle`)
- Modify: `apps/api/src/stores/source-generation.service.ts:527-530` (config)
- Modify: `docs/PRODUCT_PAGE_KIT.md` (record implementation decisions)
- Test: `apps/api/src/stores/source-design.spec.ts`, `apps/api/src/stores/source-visual-system.spec.ts`

**Interfaces:**
- Produces: `SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense'] as const`, `type SourceProductPageStyle`, `SourceDesignLayout.productPage?: SourceProductPageStyle`, `SourceVisualSystem.productPage?: { style: SourceProductPageStyle }`, `sourceProductPageStyle(system: SourceVisualSystem, previousConfig?: Record<string, unknown>): SourceProductPageStyle | undefined`, and `config.js` key `productPageStyle` read by Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/stores/source-design.spec.ts`:

```ts
it('keeps the chosen product page style and rejects unknown styles', () => {
  const value = proposal() as any;
  for (const concept of value.concepts) concept.layout = { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true, productPage: 'dense' };
  expect(validateSourceDesign(value, 1, true).concepts[1].layout?.productPage).toBe('dense');
  delete value.concepts[1].layout.productPage;
  expect(validateSourceDesign(value, 1, true).concepts[1].layout).not.toHaveProperty('productPage');
  value.concepts[1].layout.productPage = 'luxury';
  expect(() => validateSourceDesign(value, 1, true)).toThrow('productPage');
  expect(SOURCE_DESIGN_CONTRACT).toContain('layout.productPage');
});
```

In `apps/api/src/stores/source-visual-system.spec.ts`, add `sourceProductPageStyle` to the import from `./source-visual-system`, then add inside the `describe` block:

```ts
  it('carries the product page style from the concept or the previous configuration', () => {
    const dense = { ...design, concepts: [{ ...design.concepts[0], layout: { ...design.concepts[0].layout, productPage: 'dense' } }] };
    expect(buildSourceVisualSystem('subtle', [], dense).productPage).toEqual({ style: 'dense' });
    expect(buildSourceVisualSystem('subtle', [], design)).not.toHaveProperty('productPage');
    expect(sourceProductPageStyle(buildSourceVisualSystem('subtle', [], dense), { productPageStyle: 'editorial' })).toBe('dense');
    expect(sourceProductPageStyle(buildSourceVisualSystem('subtle', [], design), { productPageStyle: 'editorial' })).toBe('editorial');
    expect(sourceProductPageStyle(buildSourceVisualSystem('subtle', [], design), { productPageStyle: 'loud' })).toBeUndefined();
    expect(sourceProductPageStyle(buildSourceVisualSystem('subtle', [], design))).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/stores/source-design.spec.ts src/stores/source-visual-system.spec.ts`
Expected: FAIL. `productPage` is dropped by validation, and `sourceProductPageStyle` is not exported.

- [ ] **Step 3: Implement the design field**

In `apps/api/src/stores/source-design.ts`, replace

```ts
export type SourceDesignLayout = { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean };
```

with

```ts
export const SOURCE_PRODUCT_PAGE_STYLES = ['editorial', 'dense'] as const;
export type SourceProductPageStyle = typeof SOURCE_PRODUCT_PAGE_STYLES[number];
export type SourceDesignLayout = { sections: string[]; catalogSection: string; standaloneIntro: boolean; productsInOpening: boolean; productPage?: SourceProductPageStyle };
```

In `sourceDesignSchema`, replace

```ts
        layout: { type: 'object', additionalProperties: false, required: ['sections', 'catalogSection', 'standaloneIntro', 'productsInOpening'], properties: {
```

with

```ts
        layout: { type: 'object', additionalProperties: false, required: ['sections', 'catalogSection', 'standaloneIntro', 'productsInOpening', 'productPage'], properties: {
          productPage: { type: 'string', enum: [...SOURCE_PRODUCT_PAGE_STYLES] },
```

In `validateSourceDesign`, replace

```ts
      result.layout = { sections: [...layout.sections], catalogSection: layout.catalogSection, standaloneIntro: layout.standaloneIntro, productsInOpening: layout.productsInOpening };
```

with

```ts
      if (layout.productPage !== undefined && !SOURCE_PRODUCT_PAGE_STYLES.includes(layout.productPage)) return fail(`concepts[${index}].layout.productPage: usa editorial o dense.`);
      result.layout = { sections: [...layout.sections], catalogSection: layout.catalogSection, standaloneIntro: layout.standaloneIntro, productsInOpening: layout.productsInOpening, ...(layout.productPage ? { productPage: layout.productPage } : {}) };
```

In `SOURCE_DESIGN_CONTRACT`, replace the opening sentence `For each concept, commit to a layout object BEFORE writing code.` with:

```
For each concept, commit to a layout object BEFORE writing code. layout.productPage chooses the platform product page style: "dense" for products bought on specifications (electronics, tools, appliances, vehicles, technical gear), "editorial" for products bought on look and feel (home, apparel, beauty, art, food, gifts).
```

Replace the entire `SOURCE_PRODUCT_PRESENTATION_DIRECTION` constant (the template literal starting `Treat each product page as a complete shopping experience.` and ending `On local edits apply this guidance only to the requested scope.`) with:

```ts
export const SOURCE_PRODUCT_PRESENTATION_DIRECTION = `The platform renders every product page and quick view inside the empty data-pagosya-product-page mount, in the editorial or dense style chosen by layout.productPage. Do not write CSS for [data-pagosya-product], [data-pagosya-product-page] or any .product-detail__ class; the runtime ignores those rules. The product page takes its identity from the tokens in :root (background, foreground, accent, accent-foreground, surface, border, radius, body-font, heading-font), so choose them with the product page in mind: the accent fills the purchase button and must contrast with accent-foreground, and heading-font sets the product title. Keep the header and footer of product.html consistent with the homepage. Header search and cart actions are icon-only buttons with accessible names, and the cart shows its count in a small badge. Never place a second static product configurator beside the mount, and never pad a product with fabricated reviews, certifications, benefits, shipping guarantees or nutrition claims. On local edits apply this guidance only to the requested scope.`;
```

- [ ] **Step 4: Implement the visual system field and config key**

In `apps/api/src/stores/source-visual-system.ts`, replace `import type { SourceDesign } from './source-design';` with:

```ts
import { SOURCE_PRODUCT_PAGE_STYLES, type SourceDesign, type SourceProductPageStyle } from './source-design';
```

Add to the `SourceVisualSystem` type, after the `layout` line:

```ts
  productPage?: { style: SourceProductPageStyle };
```

In `buildSourceVisualSystem`, after the closing `},` of `layout: { ... }`, add:

```ts
    ...(selected?.layout?.productPage ? { productPage: { style: selected.layout.productPage } } : {}),
```

Append to the file:

```ts
/** The concept's style wins; edits that keep the concept keep the style already written to config.js. */
export function sourceProductPageStyle(system: SourceVisualSystem, previousConfig: Record<string, unknown> = {}): SourceProductPageStyle | undefined {
  const style = system.productPage?.style ?? previousConfig.productPageStyle;
  return SOURCE_PRODUCT_PAGE_STYLES.includes(style as SourceProductPageStyle) ? style as SourceProductPageStyle : undefined;
}
```

In `apps/api/src/stores/source-generation.service.ts`, add `sourceProductPageStyle` to the existing import from `./source-visual-system`. Then replace the start of line 530

```ts
    const config = { ...sourceCommerceRoutes([...generated.files, ...kitFiles], previousConfig),
```

with

```ts
    const productPageStyle = sourceProductPageStyle(visualSystem, previousConfig);
    const config = { ...sourceCommerceRoutes([...generated.files, ...kitFiles], previousConfig), ...(productPageStyle ? { productPageStyle } : {}),
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/stores/source-design.spec.ts src/stores/source-visual-system.spec.ts src/stores/source-design-planner.spec.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Record implementation decisions in the spec**

In `docs/PRODUCT_PAGE_KIT.md`, apply these edits.

§3, replace the first desktop bullet with:

```
- Two columns, gallery 1.12fr and purchase 1fr. The mount is up to 1440px wide with no padding of its own, so the gallery reaches the page edges unless the store's page wrapper adds padding. The photo fills its column (`object-fit: cover`, focal point from `imagePositions`), height `min(100dvh - 64px, 760px)`, and stays in view while the purchase column scrolls.
```

§3, replace the first mobile bullet with:

```
- Full-width 4:5 photo (at most 72dvh) with dots. Swiping uses the existing single-photo swap; no thumbnails, no counter.
```

§5, replace the "Part 2 slot" paragraph with:

```
Part 2 adds the highlights row; Part 1 renders no placeholder for it.
```

§6, replace the second and third bullets with:

```
- Generation writes the style into `config.js` as `productPageStyle`, like `motion`. Every consumer (hosted, editor, Studio preview, design jobs) already preserves `config.js` keys.
- The kit reads `productPageStyle`. When it is missing (existing stores): dense if at least half of the catalog's products have three or more specification rows, otherwise editorial.
```

§7, replace the "Runtime" and "Generation" bullets with:

```
- **Runtime:** at startup and after page load, the kit walks the page's same-origin stylesheets and removes selectors that reference `[data-pagosya-product` or `.product-detail__`; a rule with other selectors keeps them. This covers hosted pages, the editor and the Studio preview. As a second guard, every kit rule is prefixed `[data-pagosya-product][data-style]`, so it outranks the usual `[data-pagosya-product] .product-detail__*` authored rule even where a stylesheet cannot be read.
- **Generation:** `SOURCE_PRODUCT_PAGE_REVIEW` and `SOURCE_PRODUCT_PRESENTATION_DIRECTION` are rewritten: the product page is rendered by the platform; the generator sets tokens and `layout.productPage`, and keeps the empty mount. Preflight does not reject old product rules, so edits to existing stores never fail on them.
```

§8, replace the third bullet with:

```
- inside any choice button, text overflows the button.
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/stores/source-design.ts apps/api/src/stores/source-design.spec.ts apps/api/src/stores/source-visual-system.ts apps/api/src/stores/source-visual-system.spec.ts apps/api/src/stores/source-generation.service.ts docs/PRODUCT_PAGE_KIT.md
git commit -m "Let design concepts choose the product page style

YAPI records editorial or dense in layout.productPage; generation writes it
to config.js as productPageStyle, and product presentation guidance now
tells the generator the platform owns the product page layout.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Kit resolves the style, releases authored product CSS and renders the new markup

**Files:**
- Modify: `apps/api/src/stores/source-kit/commerce.js`
- Create: `apps/merchant-studio/tests/product-page-kit.spec.ts`

**Interfaces:**
- Consumes: `config.productPageStyle` from Task 1.
- Produces, for Task 3's CSS:
  - `[data-pagosya-product]` carries `data-style="editorial|dense"`.
  - `.product-detail__copy` starts with `.product-detail__breadcrumb` on full pages.
  - `#pagosya-product-title[data-length=long]` when the name is longer than 32 characters.
  - `ul.product-detail__chips` (dense only), with `span.product-detail__sr` labels.
  - `.product-detail__values[data-kind=swatch]` when every value has a known color.
  - `span.product-detail__option-label` inside every choice.
  - Priced choices carry `data-option-price="Bs 117,00"` on every value and `data-option-delta="+ Bs 7,00"` on dearer values.
  - The kit's own style element has `data-pagosya-kit`.

- [ ] **Step 1: Write the failing browser tests**

Create `apps/merchant-studio/tests/product-page-kit.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
const second = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// Demo catalog only. Nothing is written to a merchant store.
const lamp = { id: 'lamp', name: 'Lámpara de escritorio USB-C', description: 'Brazo ajustable y acabado mate. No incluye adaptador de pared.', amount: 22000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  specifications: [{ label: 'Conector', value: 'USB-C' }, { label: 'Brazo', value: 'Ajustable' }, { label: 'Acabado', value: 'Mate' }, { label: 'Garantía', value: 'Un año con la tienda, sin costo adicional' }],
  variants: [{ id: 'black', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }, { id: 'ivory', name: 'Marfil', amount: 22700, stock: 10, options: [{ name: 'Color', value: 'Marfil' }] }] };
const cushion = { id: 'cushion', name: 'Funda de cojín', description: 'Funda de lino, cierre oculto. No incluye relleno.', amount: 11000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  variants: [{ id: 'small', name: '40 × 40 cm', amount: 11000, stock: 10, options: [{ name: 'Tamaño', value: '40 × 40 cm' }] }, { id: 'large', name: '50 × 50 cm', amount: 11700, stock: 10, options: [{ name: 'Tamaño', value: '50 × 50 cm' }] }] };
const shirt = { id: 'shirt', name: 'Camisa de algodón de manga larga con bolsillo', amount: 14000, currency: 'BOB', stock: 5, imageUrls: [photo] };

async function open(page: Page, id: string, config: Record<string, unknown>, options: { items?: unknown[]; css?: string } = {}) {
  const data = { storeName: 'Prueba', shippingPickupEnabled: true, items: options.items || [lamp, cushion, shirt] };
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}:root{--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff}body{margin:0;font-family:Arial,sans-serif}${options.css || ''}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a><nav aria-label="Tienda"><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'kit', ...config, data })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`https://kit.test/product.html?id=${id}`);
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
}

test('uses the stored style and infers one for stores without it', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'dense' });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {}, { items: [lamp, cushion] });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {});
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'editorial');
});

test('dense pages show short specifications as chips; editorial pages do not', async ({ page }) => {
  await open(page, 'lamp', { productPageStyle: 'dense' });
  await expect(page.locator('.product-detail__chips li')).toHaveText(['Conector: USB-C', 'Brazo: Ajustable', 'Acabado: Mate']);
  await open(page, 'lamp', { productPageStyle: 'editorial' });
  await expect(page.locator('.product-detail__chips')).toHaveCount(0);
});

test('the breadcrumb opens the purchase column and long names are marked', async ({ page }) => {
  await open(page, 'shirt', { productPageStyle: 'editorial' });
  await expect(page.locator('.product-detail__copy > .product-detail__breadcrumb')).toBeVisible();
  await expect(page.locator('#pagosya-product-title')).toHaveAttribute('data-length', 'long');
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  await expect(page.locator('#pagosya-product-title')).not.toHaveAttribute('data-length');
});

test('choices expose their kind, price and the difference for dearer values', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  const small = page.getByRole('button', { name: '40 × 40 cm', exact: true }), large = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(small).toHaveAttribute('data-option-price', /110,00/);
  await expect(small).not.toHaveAttribute('data-option-delta');
  await expect(large).toHaveAttribute('data-option-delta', /^\+ .*7,00$/);
  await expect(small.locator('.product-detail__option-label')).toHaveText('40 × 40 cm');
  await open(page, 'lamp', { productPageStyle: 'dense' });
  await expect(page.locator('.product-detail__values').first()).toHaveAttribute('data-kind', 'swatch');
});

test('store CSS aimed at the product page is released while the rest of each rule survives', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { css: '[data-pagosya-product] .product-detail__layout{display:block}.product-detail__buy,.brand-button{letter-spacing:9px}@media (min-width:1px){.product-detail__copy{display:none}}' });
  await expect(page.locator('.product-detail__layout')).toHaveCSS('display', 'grid');
  await expect(page.locator('.product-detail__copy')).toBeVisible();
  const kept = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).map(rule => rule.cssText).find(text => text.includes('brand-button')));
  expect(kept).toContain('.brand-button');
  expect(kept).not.toContain('product-detail__buy');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/merchant-studio && npx playwright test tests/product-page-kit.spec.ts`
Expected: FAIL. There is no `data-style` attribute, no chips, no `data-option-delta`, and the layout reads `display: block`.

- [ ] **Step 3: Mark the kit stylesheet and release authored product rules**

In `commerce.js`, replace

```js
  const detailStyle = document.createElement("style");
```

with

```js
  const detailStyle = document.createElement("style");
  detailStyle.dataset.pagosyaKit = 'product';
```

Replace

```js
  if (!fullProductPage) document.body.append(detail);
```

with

```js
  if (!fullProductPage) document.body.append(detail);
  // The product page is platform-rendered; authored rules aimed at its hooks would fight the kit layout.
  const productHook = /\[data-pagosya-product|\.product-detail__/;
  function splitSelectors(list) {
    const parts = []; let depth = 0, start = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { parts.push(list.slice(start, i)); start = i + 1; }
    }
    parts.push(list.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  }
  function releaseRules(container) {
    const rules = container.cssRules;
    for (let i = rules.length - 1; i >= 0; i--) {
      const rule = rules[i];
      if (rule.cssRules?.length) releaseRules(rule);
      if (typeof rule.selectorText !== 'string' || !productHook.test(rule.selectorText)) continue;
      const kept = splitSelectors(rule.selectorText).filter(selector => !productHook.test(selector));
      if (kept.length) rule.selectorText = kept.join(', '); else container.deleteRule(i);
    }
  }
  function releaseProductPageStyles() {
    for (const sheet of Array.from(document.styleSheets)) {
      if (sheet.ownerNode?.dataset?.pagosyaKit !== undefined) continue;
      try { releaseRules(sheet); } catch { /* Unreadable sheets keep their rules; kit selectors still outrank them. */ }
    }
  }
  releaseProductPageStyles();
  window.addEventListener('load', releaseProductPageStyles);
```

- [ ] **Step 4: Resolve the style and add the spec chip markup**

Insert directly above `function productInformation(p) {`:

```js
  function specRows(p) {
    return (Array.isArray(p?.specifications) ? p.specifications : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string' && row.label.trim() && row.value.trim());
  }
  // A stored choice wins; older stores read their catalog, and spec-heavy catalogs get the dense page.
  function productPageStyle() {
    if (config.productPageStyle === 'editorial' || config.productPageStyle === 'dense') return config.productPageStyle;
    const items = products();
    return items.length && items.filter(p => specRows(p).length >= 3).length * 2 >= items.length ? 'dense' : 'editorial';
  }
  function specChipsMarkup(p) {
    const chips = specRows(p).filter(row => row.value.trim().length <= 24).slice(0, 4);
    return chips.length ? `<ul class="product-detail__chips" aria-label="Características">${chips.map(row => `<li><span class="product-detail__sr">${escape(row.label.trim())}: </span>${escape(row.value.trim())}</li>`).join('')}</ul>` : '';
  }
```

Inside `productInformation`, replace

```js
    const specs = (Array.isArray(p.specifications) ? p.specifications : []).filter(row => row && typeof row.label === 'string' && typeof row.value === 'string' && row.label.trim() && row.value.trim()).slice(0, 8);
```

with

```js
    const specs = specRows(p).slice(0, 8);
```

- [ ] **Step 5: Render breadcrumb, long-title marker and chips in `openProduct`**

Replace

```js
    const images = galleryImages(p), complex = p.variants?.length || p.extras?.length, groups = optionGroups(p);
```

with

```js
    const images = galleryImages(p), complex = p.variants?.length || p.extras?.length, groups = optionGroups(p);
    const style = productPageStyle();
    detail.dataset.style = style;
    const breadcrumb = `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('index.html', '#catalogo'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>`;
```

Then make four exact substring replacements in the `detail.innerHTML = ...` line that follows:

1. Replace ``detail.innerHTML = `${fullProductPage ? `<nav class="product-detail__breadcrumb" aria-label="Ruta del producto"><a href="${escape(pageHref('index.html', '#catalogo'))}">Todos los productos</a><span aria-hidden="true">/</span><span>${escape(p.name)}</span></nav>` : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}`` with ``detail.innerHTML = `${fullProductPage ? '' : '<button type="button" class="product-detail__close" data-product-close aria-label="Cerrar detalle del producto">×</button>'}``
2. Replace `<section class="product-detail__copy"><p class="product-detail__eyebrow">` with `<section class="product-detail__copy">${fullProductPage ? breadcrumb : ''}<p class="product-detail__eyebrow">`
3. Replace `<${fullProductPage ? "h1" : "h2"} id="pagosya-product-title">` with `<${fullProductPage ? "h1" : "h2"} id="pagosya-product-title"${p.name.length > 32 ? ' data-length="long"' : ''}>`
4. Replace ``${p.description ? `<p class="product-detail__intro">${escape(p.description)}</p>` : ''}`` with ``${p.description ? `<p class="product-detail__intro">${escape(p.description)}</p>` : ''}${style === 'dense' ? specChipsMarkup(p) : ''}``

- [ ] **Step 6: Mark swatch groups and wrap choice labels**

Replace the whole `optionsMarkup` function with:

```js
  function optionsMarkup(groups) {
    return `<div class="product-detail__options">${groups.map((group, index) => {
      const colors = group.values.map(value => swatchColor(group.name, value));
      return `<fieldset><legend>${escape(group.name)} <span data-product-selection="${index}"></span></legend><div class="product-detail__values"${colors.every(Boolean) ? ' data-kind="swatch"' : ''}>${group.values.map((value, valueIndex) => `<button type="button" data-product-option="${index}" data-option-value="${valueIndex}" aria-pressed="false">${colors[valueIndex] ? `<span class="product-detail__swatch" style="--swatch:${colors[valueIndex]}" aria-hidden="true"></span>` : ''}<span class="product-detail__option-label">${escape(value)}</span></button>`).join('')}</div></fieldset>`;
    }).join('')}</div>`;
  }
```

- [ ] **Step 7: Expose each choice's price and the difference for dearer values**

In `optionPrices`, replace the return line

```js
      return distinct.size > 1 && prices.every(range => !range || range.low === range.high) ? prices.map(range => range ? money(range.low, p.currency) : '') : null;
```

with

```js
      return distinct.size > 1 && prices.every(range => !range || range.low === range.high) ? prices.map(range => range ? range.low : null) : null;
```

In `updateOptions`, replace

```js
      const optionPrice = prices[index]?.[Number(button.dataset.optionValue)];
      if (optionPrice) button.dataset.optionPrice = optionPrice; else delete button.dataset.optionPrice;
```

with

```js
      const amounts = prices[index], amount = amounts?.[Number(button.dataset.optionValue)];
      if (amount != null) {
        const lowest = Math.min(...amounts.filter(value => value != null));
        button.dataset.optionPrice = money(amount, p.currency);
        if (amount > lowest) button.dataset.optionDelta = `+ ${money(amount - lowest, p.currency)}`; else delete button.dataset.optionDelta;
      } else { delete button.dataset.optionPrice; delete button.dataset.optionDelta; }
```

- [ ] **Step 8: Run the new and existing product tests**

Run: `cd apps/merchant-studio && npx playwright test tests/product-page-kit.spec.ts tests/product-design.spec.ts tests/product-photo-layout.spec.ts tests/source-catalog.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx jest src/stores/source-commerce-pages.spec.ts src/stores/source-commerce-design.spec.ts src/stores/source-visual-capture.spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/stores/source-kit/commerce.js apps/merchant-studio/tests/product-page-kit.spec.ts
git commit -m "Render product pages in the store's chosen style and ignore authored product CSS

The kit reads productPageStyle (or infers it from specifications), drops
store rules aimed at product page hooks, moves the breadcrumb into the
purchase column, adds specification chips for dense pages, and labels
dearer choices with their price difference.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: One product page stylesheet with editorial and dense styles

**Files:**
- Modify: `apps/api/src/stores/source-kit/commerce.js` (product CSS block; remove photo-ratio framing)
- Modify: `apps/api/src/stores/source-kit/commerce-pages.css` (drop product rules)
- Modify: `apps/merchant-studio/tests/product-page-kit.spec.ts` (layout tests)
- Modify: `apps/merchant-studio/tests/product-photo-layout.spec.ts`, `apps/merchant-studio/tests/source-catalog.spec.ts`, `apps/api/src/stores/source-commerce-design.spec.ts`

**Interfaces:**
- Consumes: the markup and attributes produced by Task 2.
- Produces: the visual layout Task 4 measures (`.product-detail__buy` above the fold, `#pagosya-product-title` line count, no overflowing `[data-product-option]`).

- [ ] **Step 1: Write the failing layout tests**

Append to `apps/merchant-studio/tests/product-page-kit.spec.ts`:

```ts
for (const style of ['editorial', 'dense'] as const) test(`${style} page keeps photo and purchase side by side above the fold at 1280×844`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, style === 'dense' ? 'lamp' : 'cushion', { productPageStyle: style });
  const buy = (await page.locator('.product-detail__buy').boundingBox())!;
  expect(buy.y + buy.height).toBeLessThanOrEqual(844);
  const lines = await page.locator('#pagosya-product-title').evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeLessThanOrEqual(2);
  const photo = (await page.locator('.product-detail__photo').boundingBox())!, copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(photo.width).toBeGreaterThan(600);
  expect(copy.x).toBeGreaterThanOrEqual(photo.x + photo.width - 1);
  await expect(page.locator('.product-detail__photo')).toHaveCSS('object-fit', 'cover');
  expect(await page.locator('[data-product-option]').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.test-artifacts/product-page-kit-${style}-1280.png` });
});

test('dense priced choices are radio rows with the price; editorial keeps pills with the difference', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'cushion', { productPageStyle: 'dense' });
  const denseLarge = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(denseLarge).toHaveCSS('display', 'grid');
  expect(await denseLarge.evaluate(el => getComputedStyle(el, '::after').content)).toMatch(/117,00/);
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  const pill = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(pill).toHaveCSS('border-radius', '999px');
  expect(await pill.evaluate(el => getComputedStyle(el, '::after').content)).toMatch(/\+ .*7,00/);
  await expect(page.locator('.product-detail__navigation')).toBeHidden();
  await expect(page.locator('.product-detail__thumbnails img').first()).toBeHidden();
});

test('mobile shows a full-width photo with dots, then the purchase panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'lamp', { productPageStyle: 'dense' });
  const photo = (await page.locator('.product-detail__photo').boundingBox())!;
  expect(photo.width).toBeGreaterThanOrEqual(389);
  await expect(page.locator('.product-detail__navigation')).toBeHidden();
  await page.getByRole('button', { name: 'Ver foto 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver foto 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(copy.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  await page.getByRole('button', { name: 'Marfil', exact: true }).click();
  expect((await page.locator('.product-detail__buy').boundingBox())!.height).toBeLessThanOrEqual(56);
  await page.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/product-page-kit-dense-390.png', fullPage: true });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/merchant-studio && npx playwright test tests/product-page-kit.spec.ts`
Expected: the Task 2 tests pass. The new layout tests fail: `object-fit` is `contain`, there are no radio rows or pills, and the navigation is visible.

- [ ] **Step 3: Replace the product CSS**

In `commerce.js`, delete every line from

```
    [data-pagosya-product] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)!important}
```

through

```
  document.head.append(detailStyle);
```

(currently lines 148–318; the five catalog rules above them stay). Insert in their place:

```js
    /* Product page: platform-owned layout in two styles (editorial, dense). Stores supply tokens only. */
    [data-pagosya-product]{--pd-ink:var(--store-foreground,var(--brand-foreground,var(--ink,#302c2a)));--pd-paper:var(--store-background,var(--brand-background,var(--paper,#fffdfb)));--pd-surface:var(--store-surface,var(--brand-surface,var(--pd-paper)));--pd-accent:var(--store-accent,var(--brand-accent,var(--accent,var(--pd-ink))));--pd-on-accent:var(--store-accent-foreground,var(--brand-accent-foreground,var(--pd-paper)));--pd-muted:color-mix(in srgb,var(--pd-ink) 64%,var(--pd-paper));--pd-line:var(--store-border,var(--brand-border,color-mix(in srgb,var(--pd-ink) 16%,var(--pd-paper))));--pd-tint:color-mix(in srgb,var(--pd-accent) 7%,var(--pd-paper));--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px);--pd-heading:var(--store-heading-font,var(--brand-heading-font,var(--font-heading,inherit)));--pd-body:var(--store-body-font,var(--brand-body-font,var(--font-body,inherit)));box-sizing:border-box;color:var(--pd-ink);background:var(--pd-paper);font-family:var(--pd-body)}
    [data-pagosya-product] *{box-sizing:border-box}
    [data-pagosya-product] [hidden]{display:none!important}
    dialog[data-pagosya-product]{width:min(1040px,calc(100% - 32px));max-width:none;max-height:calc(100dvh - 32px);margin:auto;padding:0;border:1px solid var(--pd-line);border-radius:var(--pd-radius);box-shadow:0 16px 64px #0003;overflow:auto;overscroll-behavior:contain}
    dialog[data-pagosya-product]::backdrop{background:#0009}
    [data-pagosya-product][data-pagosya-product-page]{display:block;width:100%;max-width:1440px;max-height:none;margin:0 auto;padding:0;border:0;border-radius:0;box-shadow:none;overflow:visible}
    [data-pagosya-product][data-style] :is(button,a){font:inherit;cursor:pointer}
    [data-pagosya-product][data-style] button:disabled{opacity:.5;cursor:default}
    [data-pagosya-product][data-style] :is(button,a,[tabindex]):focus-visible{outline:2px solid var(--pd-accent);outline-offset:3px}
    [data-pagosya-product][data-style] .product-detail__close{position:sticky;top:12px;z-index:3;display:grid;place-items:center;width:44px;height:44px;margin:12px 12px -56px auto;padding:0;border:1px solid var(--pd-line);border-radius:50%;background:var(--pd-paper);color:inherit;font-size:26px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,1fr);align-items:start}
    [data-pagosya-product][data-style] .product-detail__layout[data-no-images]{grid-template-columns:minmax(0,1fr)}
    /* Gallery: the photo fills its column; dense pages overlay thumbnails and a plain counter, editorial pages use dots. */
    [data-pagosya-product][data-style] .product-detail__gallery{position:relative;min-width:0;margin:0;padding:0;border-radius:0;background:var(--pd-tint)}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:sticky;top:0}
    [data-pagosya-product][data-style] .product-detail__stage{position:relative;min-width:0}
    [data-pagosya-product][data-style] .product-detail__photo{display:block;width:100%;height:min(calc(100dvh - 64px),760px);min-height:420px;max-height:none;margin:0;object-fit:cover;border:0;border-radius:0;background:var(--pd-tint);touch-action:pan-y}
    dialog[data-pagosya-product][data-style] .product-detail__photo{height:min(calc(100dvh - 34px),640px);min-height:360px}
    [data-pagosya-product][data-style] .product-detail__navigation{position:absolute;right:16px;bottom:22px;display:flex;align-items:center;gap:8px;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;font-size:12px;font-variant-numeric:tabular-nums;color:var(--pd-ink);text-shadow:0 0 8px var(--pd-paper)}
    [data-pagosya-product][data-style] .product-detail__navigation span{order:-1}
    [data-pagosya-product][data-style] .product-detail__navigation button{display:grid;place-items:center;width:36px;height:36px;min-height:0;padding:0;border:1px solid color-mix(in srgb,var(--pd-ink) 35%,transparent);border-radius:50%;background:color-mix(in srgb,var(--pd-paper) 72%,transparent);color:inherit;font-size:15px;line-height:1}
    [data-pagosya-product][data-style] .product-detail__thumbnails{position:absolute;left:16px;bottom:16px;display:flex;gap:6px;max-width:calc(100% - 170px);margin:0;padding:5px;overflow-x:auto;border-radius:calc(var(--pd-radius) + 3px);background:color-mix(in srgb,var(--pd-paper) 84%,transparent)}
    [data-pagosya-product][data-style] .product-detail__thumbnails button{flex:0 0 56px;width:56px;height:56px;padding:0;border:0;border-radius:var(--pd-radius);overflow:hidden;background:var(--pd-tint);outline:1px solid color-mix(in srgb,var(--pd-ink) 12%,transparent);outline-offset:0}
    [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{outline:2px solid var(--pd-ink);outline-offset:1px}
    [data-pagosya-product][data-style] .product-detail__thumbnails img{display:block;width:100%;height:100%;object-fit:cover}
    [data-pagosya-product][data-style=editorial] .product-detail__navigation{display:none}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button,[data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
    [data-pagosya-product][data-style=editorial] .product-detail__thumbnails img{display:none}
    [data-pagosya-product][data-style] .product-detail__empty{display:grid;min-height:220px;place-items:center;color:inherit}
    /* Purchase column */
    [data-pagosya-product][data-style] .product-detail__copy{align-self:center;min-width:0;width:100%;max-width:620px;margin:0;padding:clamp(28px,4vw,56px)}
    dialog[data-pagosya-product][data-style] .product-detail__copy{padding:44px 32px 28px}
    [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{max-width:1200px;margin:0 auto}
    @media(min-width:900px){
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__copy[data-split]{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);grid-template-rows:auto 1fr;column-gap:clamp(40px,6vw,96px);align-items:start}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__summary{grid-column:1;grid-row:1}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__details{grid-column:1;grid-row:2}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__buybox{grid-column:2;grid-row:1 / span 2;position:sticky;top:24px;padding:clamp(20px,2.4vw,32px);border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    }
    [data-pagosya-product][data-style] .product-detail__breadcrumb{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 18px;font-size:12px;line-height:1.4;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__breadcrumb a{display:inline-flex;align-items:center;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__breadcrumb>span:last-child{max-width:28ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__eyebrow{margin:0 0 10px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] #pagosya-product-title{margin:0 0 12px;font-family:var(--pd-heading);font-size:clamp(32px,3.4vw,46px);font-weight:380;line-height:1.04;letter-spacing:-.02em;text-wrap:balance;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=editorial] #pagosya-product-title[data-length=long]{font-size:clamp(28px,2.7vw,38px)}
    [data-pagosya-product][data-style=dense] #pagosya-product-title{margin-bottom:10px;font-family:var(--pd-body);font-size:clamp(24px,2.3vw,30px);font-weight:650;line-height:1.12;letter-spacing:-.025em}
    [data-pagosya-product][data-style=dense] #pagosya-product-title[data-length=long]{font-size:clamp(22px,2vw,26px)}
    [data-pagosya-product][data-style] .product-detail__rating{display:flex;align-items:center;gap:8px;margin:-2px 0 12px;font-size:13px}
    [data-pagosya-product][data-style] .product-detail__rating a{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:inherit;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__stars{--rating:0;display:inline-block;letter-spacing:1px;line-height:1;background:linear-gradient(90deg,var(--pd-accent) calc(var(--rating) * 20%),color-mix(in srgb,var(--pd-ink) 22%,transparent) 0);-webkit-background-clip:text;background-clip:text;color:transparent}
    [data-pagosya-product][data-style] .product-detail__pricing{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;margin:0 0 14px}
    [data-pagosya-product][data-style] .product-detail__price{margin:0;font-size:17px;font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__original{font-size:.9em;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__saving{padding:3px 7px;border-radius:var(--pd-radius);background:var(--pd-tint);color:var(--pd-accent);font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    [data-pagosya-product][data-style=dense] .product-detail__pricing{padding-bottom:14px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__price{font-size:30px;font-weight:700;letter-spacing:-.03em}
    [data-pagosya-product][data-style=dense] .product-detail__original{font-size:16px}
    [data-pagosya-product][data-style] .product-detail__intro{max-width:52ch;margin:0 0 20px;font-size:14.5px;line-height:1.6;color:var(--pd-muted);white-space:pre-line;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__intro{margin:12px 0 14px}
    [data-pagosya-product][data-style] .product-detail__chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 18px;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__chips li{padding:5px 8px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface);font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    [data-pagosya-product][data-style] :is(.product-detail__sr,.product-detail__review-score){position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    /* Choices: pills by default, swatch circles for colors, radio rows for priced dense choices. */
    [data-pagosya-product][data-style] .product-detail__options{display:grid;gap:18px;margin:0 0 20px;padding:18px 0 0;border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style=dense] .product-detail__options{padding-top:4px;border-top:0}
    [data-pagosya-product][data-style] .product-detail__options fieldset{min-width:0;margin:0;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__options legend{display:flex;align-items:baseline;gap:8px;margin:0 0 10px;padding:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;overflow-wrap:anywhere}
    [data-pagosya-product][data-style=dense] .product-detail__options legend{font-size:12.5px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style] [data-product-selection]{font-size:13px;font-weight:400;letter-spacing:0;text-transform:none;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__values{display:flex;flex-wrap:wrap;gap:8px}
    [data-pagosya-product][data-style] [data-product-option]{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:44px;min-height:40px;max-width:100%;padding:8px 16px;border:1px solid var(--pd-line);border-radius:999px;background:transparent;color:inherit;font-size:13.5px;line-height:1.2;overflow-wrap:anywhere;transition:border-color .15s,box-shadow .15s}
    [data-pagosya-product][data-style=dense] [data-product-option]{border-radius:var(--pd-radius)}
    [data-pagosya-product][data-style] [data-product-option]:hover:not(:disabled){border-color:color-mix(in srgb,var(--pd-ink) 55%,var(--pd-paper))}
    [data-pagosya-product][data-style] [data-product-option][aria-pressed=true]{border-color:var(--pd-ink);box-shadow:inset 0 0 0 1px var(--pd-ink)}
    [data-pagosya-product][data-style] [data-product-option]:disabled{opacity:.45;text-decoration:line-through}
    [data-pagosya-product][data-style] [data-product-option][data-option-delta]::after{content:attr(data-option-delta);color:var(--pd-muted);font-size:.85em;white-space:nowrap}
    [data-pagosya-product][data-style] .product-detail__values[data-kind=swatch]{gap:14px}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option],[data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{flex-direction:column;gap:6px;min-width:0;min-height:0;padding:0;border:0;border-radius:0;box-shadow:none;background:none;font-size:11px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] [data-kind=swatch] [data-product-option][aria-pressed=true]{color:var(--pd-ink)}
    [data-pagosya-product][data-style] .product-detail__swatch{display:block;width:22px;height:22px;flex:0 0 auto;border-radius:50%;background:var(--swatch);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--pd-ink) 15%,transparent)}
    [data-pagosya-product][data-style] [data-kind=swatch] .product-detail__swatch{width:34px;height:34px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__swatch{width:28px;height:28px}
    [data-pagosya-product][data-style=editorial] [data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    [data-pagosya-product][data-style] [data-kind=swatch] [aria-pressed=true] .product-detail__swatch{box-shadow:0 0 0 2px var(--pd-paper),0 0 0 3.5px var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__values[data-priced]:not([data-kind=swatch]){display:grid;grid-template-columns:minmax(0,1fr);gap:7px}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]{display:grid;grid-template-columns:16px minmax(0,1fr) auto;justify-content:stretch;gap:12px;width:100%;min-height:48px;padding:10px 14px;background:var(--pd-surface);font-size:14px;text-align:left}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]::before{content:"";width:16px;height:16px;border:1.5px solid color-mix(in srgb,var(--pd-ink) 45%,var(--pd-paper));border-radius:50%}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][aria-pressed=true]::before{border:5px solid var(--pd-ink)}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option][data-option-price]::after{content:attr(data-option-price);font-size:14px;font-weight:600;color:var(--pd-ink);font-variant-numeric:tabular-nums;white-space:nowrap}
    [data-pagosya-product][data-style=dense] [data-priced]:not([data-kind=swatch]) [data-product-option]:disabled::after{text-decoration:line-through}
    /* Quantity and action share one row; the live total rides on the dense action. */
    [data-pagosya-product][data-style] .product-detail__purchase{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:stretch;gap:10px;margin:22px 0 12px}
    [data-pagosya-product][data-style] .product-detail__quantity{display:flex;align-items:center;justify-content:space-between;min-width:118px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);overflow:hidden}
    [data-pagosya-product][data-style] .product-detail__quantity button{width:40px;min-height:46px;padding:0;border:0;background:transparent;color:inherit;font-size:18px}
    [data-pagosya-product][data-style] .product-detail__quantity output{min-width:24px;text-align:center;font-size:14px;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__subtotal{grid-column:1 / -1;grid-row:2;font-size:13px;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__subtotal:empty{display:none}
    [data-pagosya-product][data-style] .product-detail__buy{display:flex;align-items:center;justify-content:center;gap:0;width:100%;min-height:48px;margin:0;padding:12px 20px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;white-space:nowrap;transition:filter .15s}
    [data-pagosya-product][data-style] .product-detail__buy:hover:not(:disabled){filter:brightness(.92)}
    [data-pagosya-product][data-style] .product-detail__buy-total{white-space:nowrap;font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style=editorial] .product-detail__buy-total{display:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy{min-height:50px;font-size:15px;letter-spacing:0;text-transform:none}
    [data-pagosya-product][data-style=dense] .product-detail__buy-total:not(:empty)::before{content:"—";margin:0 8px}
    /* Narrow phones keep the action on one line; the price above already shows the total. */
    @media(max-width:480px){[data-pagosya-product][data-style=dense] .product-detail__buy-total{display:none}}
    [data-pagosya-product][data-style] .product-detail__status{min-height:20px;margin:0;font-size:13px;line-height:1.5;color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__assurances{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px 18px;margin:14px 0 0;padding:12px 14px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);list-style:none}
    [data-pagosya-product][data-style=dense] .product-detail__assurances{grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));margin-top:16px;padding:0;border:0}
    [data-pagosya-product][data-style] .product-detail__assurances li{display:flex;align-items:center;gap:10px;min-width:0;font-size:12px;line-height:1.4}
    [data-pagosya-product][data-style] .product-detail__assurances svg{flex:0 0 20px;color:var(--pd-ink)}
    [data-pagosya-product][data-style=dense] .product-detail__assurances svg{flex-basis:24px;width:24px;height:24px}
    [data-pagosya-product][data-style] .product-detail__assurances strong{display:block;font-size:12.5px;font-weight:600}
    [data-pagosya-product][data-style] .product-detail__assurances span{display:block;color:var(--pd-muted);overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__assurances button{display:flex;align-items:center;gap:10px;min-height:40px;margin:0;padding:0;border:0;background:transparent;color:inherit;font-size:inherit;text-align:left}
    [data-pagosya-product][data-style] .product-detail__assurances button strong{text-decoration:underline;text-decoration-color:var(--pd-line);text-underline-offset:4px}
    /* Details, related products and verified reviews use only published catalog data. */
    [data-pagosya-product][data-style] .product-tabs{display:flex;gap:24px;margin:28px 0 16px;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-tabs button{min-height:44px;margin:0 0 -1px;padding:8px 0;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--pd-muted);font-size:13px}
    [data-pagosya-product][data-style] .product-tabs button[aria-selected=true]{border-bottom-color:var(--pd-ink);color:var(--pd-ink)}
    [data-pagosya-product][data-style] [role=tabpanel]{font-size:14px;line-height:1.6}
    [data-pagosya-product][data-style] .product-delivery-list{margin:0 0 12px;padding-left:18px;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-delivery-list li{margin-bottom:14px}
    [data-pagosya-product][data-style] .product-detail__specs{margin:0 0 16px;padding:0}
    [data-pagosya-product][data-style] .product-detail__specs div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__specs dt{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__specs dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__facts{margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__facts li{padding:10px 0;border-bottom:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] .product-detail__fact{display:flex;justify-content:space-between;gap:16px}
    [data-pagosya-product][data-style] .product-detail__fact span:first-child{color:var(--pd-muted)}
    [data-pagosya-product][data-style] .product-detail__fact span:last-child{text-align:right;font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews):not([hidden]){display:grid;gap:20px;margin:clamp(40px,6vw,72px) clamp(16px,4vw,56px) 0;padding-top:clamp(24px,4vw,40px);border-top:1px solid var(--pd-line)}
    [data-pagosya-product][data-style] :is(.product-detail__related,.product-detail__reviews) h2{margin:0;font-family:var(--pd-heading);font-size:clamp(22px,2.4vw,28px);font-weight:400;line-height:1.2}
    [data-pagosya-product][data-style] .product-detail__related ul{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,160px),1fr));gap:20px 16px;margin:0;padding:0;list-style:none}
    [data-pagosya-product][data-style] .product-detail__related a{display:grid;gap:6px;color:inherit;text-decoration:none}
    [data-pagosya-product][data-style] .product-detail__related img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--pd-radius);background:var(--pd-tint)}
    [data-pagosya-product][data-style] .product-detail__related a:hover .product-detail__related-name{text-decoration:underline;text-underline-offset:4px}
    [data-pagosya-product][data-style] .product-detail__related-name{font-weight:600;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__related-price{font-size:14px;color:var(--pd-muted);font-variant-numeric:tabular-nums}
    [data-pagosya-product][data-style] .product-detail__reviews-summary{display:flex;align-items:center;gap:10px;margin:0}
    [data-pagosya-product][data-style] .product-detail__review-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:16px}
    [data-pagosya-product][data-style] .product-detail__review-list article{padding:18px;border:1px solid var(--pd-line);border-radius:var(--pd-radius);background:var(--pd-surface)}
    [data-pagosya-product][data-style] .product-detail__review-list p{margin:0;line-height:1.55;overflow-wrap:anywhere}
    [data-pagosya-product][data-style] .product-detail__review-list .product-detail__review-meta{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:13px}
    [data-pagosya-product][data-style] :is(.product-detail__sticky,.product-detail__sticky-space){display:none}
    @media(max-width:899px){
      [data-pagosya-product][data-style] .product-detail__layout{grid-template-columns:minmax(0,1fr)}
      [data-pagosya-product][data-style][data-pagosya-product-page] .product-detail__gallery{position:relative}
      [data-pagosya-product][data-style] .product-detail__photo,dialog[data-pagosya-product][data-style] .product-detail__photo{height:auto;min-height:0;max-height:72dvh;aspect-ratio:4/5}
      [data-pagosya-product][data-style] .product-detail__navigation{display:none}
      [data-pagosya-product][data-style] .product-detail__thumbnails{left:50%;bottom:14px;max-width:calc(100% - 32px);gap:0;padding:0;border-radius:0;background:none;transform:translateX(-50%)}
      [data-pagosya-product][data-style] .product-detail__thumbnails button,[data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:50%;background:none;outline:0}
      [data-pagosya-product][data-style] .product-detail__thumbnails button::before{content:"";width:6px;height:6px;border-radius:3px;background:#ffffffa6;box-shadow:0 0 0 1px #00000026;transition:width .2s}
      [data-pagosya-product][data-style] .product-detail__thumbnails button[aria-pressed=true]::before{width:18px;background:#fff}
      [data-pagosya-product][data-style] .product-detail__thumbnails img{display:none}
      [data-pagosya-product][data-style] .product-detail__copy,dialog[data-pagosya-product][data-style] .product-detail__copy{max-width:none;padding:22px 16px 28px}
    }
    @media(max-width:640px){
      [data-pagosya-product][data-style] .product-detail__sticky:not([hidden]){position:fixed;left:0;right:0;bottom:0;z-index:40;display:flex;align-items:center;gap:12px;padding:10px 16px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--pd-line);background:var(--pd-paper);color:var(--pd-ink);box-shadow:0 -6px 24px #0000001a}
      [data-pagosya-product][data-style] .product-detail__sticky>div{flex:1;min-width:0;font-size:13px;line-height:1.3}
      [data-pagosya-product][data-style] .product-detail__sticky strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      [data-pagosya-product][data-style] .product-detail__sticky button{flex:0 0 auto;min-height:44px;padding:10px 18px;border:0;border-radius:var(--pd-radius);background:var(--pd-accent);color:var(--pd-on-accent);font-weight:700}
      [data-pagosya-product][data-style] .product-detail__sticky-space:not([hidden]){display:block;height:72px}
    }
    @media(prefers-reduced-motion:reduce){[data-pagosya-product] *,[data-pagosya-product] *::before{transition:none!important;scroll-behavior:auto!important}}
  `;
  document.head.append(detailStyle);
```

- [ ] **Step 4: Remove the photo-ratio framing**

In `openProduct`, delete these lines (the new CSS gives photos a fixed frame):

```js
    // Frame full-page photos in their own proportion (portrait to 3:2 landscape), not a fixed crop box.
    const firstPhoto = fullProductPage && detail.querySelector('.product-detail__photo');
    if (firstPhoto) {
      const frame = () => { if (firstPhoto.naturalWidth && firstPhoto.naturalHeight) detail.querySelector('.product-detail__gallery').style.setProperty('--product-photo-ratio', String(Math.min(3 / 2, Math.max(4 / 5, firstPhoto.naturalWidth / firstPhoto.naturalHeight)))); };
      if (firstPhoto.complete) frame(); else firstPhoto.addEventListener('load', frame, { once: true });
    }
```

- [ ] **Step 5: Drop the product rules from `commerce-pages.css`**

In `apps/api/src/stores/source-kit/commerce-pages.css`, delete this exact text from line 3:

```
body.commerce-document [data-pagosya-product-page]{display:block;width:100%;max-width:1200px;max-height:none;margin:24px auto;padding:0 24px;border:0;border-radius:0;box-shadow:none;background:inherit;color:inherit;overflow:visible}.commerce-document [data-pagosya-product-page] .product-detail__copy{padding:32px;align-self:start}.commerce-document [data-pagosya-product-page] h1{font-size:clamp(30px,4vw,52px);line-height:1.1;margin:0 0 24px;overflow-wrap:anywhere}.commerce-document [data-pagosya-product-page] .product-detail__photo{height:480px;max-height:65dvh}.product-tabs{display:flex;gap:24px;border-bottom:1px solid var(--line,#d7d2c7);margin:32px 0 20px}.product-tabs button{min-height:48px;border:0;border-bottom:3px solid transparent;background:transparent;color:inherit;padding:8px 0}.product-tabs button[aria-selected=true]{border-bottom-color:currentColor;font-weight:700}.product-delivery-list{padding-left:20px}.product-delivery-list li{margin-bottom:20px}.product-detail__description,.product-delivery-list{overflow-wrap:anywhere}
```

and this exact text from line 4:

```
.commerce-document [data-pagosya-product-page] .product-detail__copy{padding:24px 0}.commerce-document [data-pagosya-product-page] .product-detail__photo{height:320px}
```

- [ ] **Step 6: Update tests that asserted the old layout**

`apps/merchant-studio/tests/product-photo-layout.spec.ts`: replace the lines from `await expect(image).toHaveCSS('object-fit', 'contain');` through `else expect(copy.y).toBeGreaterThan(media.y + media.height);` with:

```ts
  await expect(image).toHaveCSS('object-fit', 'cover');
  const media = (await image.boundingBox())!;
  const layout = (await page.locator('.product-detail__layout').boundingBox())!;
  const copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(media.width / layout.width).toBeGreaterThan(width > 899 ? 0.5 : 0.98);
  // The photo keeps a full frame even in a short viewport (550px): column height on desktop, 4:5 capped at 72dvh on phones.
  expect(media.height).toBeGreaterThan(width > 899 ? 420 : 380);
  if (width > 899) expect(copy.x).toBeGreaterThanOrEqual(media.x + media.width - 1);
  else expect(copy.y).toBeGreaterThanOrEqual(media.y + media.height - 1);
```

`apps/merchant-studio/tests/source-catalog.spec.ts`: the desktop quick-view test clicks "Foto siguiente", which only dense pages show on desktop. In the `config.js` object of `snapshot`, change `{ apiBaseUrl: 'http://localhost:3001/v1', slug: 'test', data:` to `{ apiBaseUrl: 'http://localhost:3001/v1', slug: 'test', productPageStyle: 'dense', data:`.

`apps/api/src/stores/source-commerce-design.spec.ts`: replace the body of `it('styles inline options with merchant tokens and preserves text quick-add targets', ...)` up to (not including) `const textAction =` with:

```ts
  const runtime = kit('commerce.js');
  const options = runtime.match(/\[data-pagosya-product\]\[data-style\] \[data-product-option\]\{([^}]+)\}/)![1];
  expect(options).toContain('min-width:44px');
  expect(options).toContain('border:1px solid var(--pd-line)');
  expect(options).toContain('color:inherit');
  expect(runtime).toContain('--pd-line:var(--store-border,var(--brand-border,');
  expect(runtime).toContain('--pd-radius:min(var(--store-radius,var(--brand-radius,0px)),6px)');
  expect(runtime).toContain(':focus-visible{outline:2px solid var(--pd-accent)');
```

- [ ] **Step 7: Run all product-related tests**

Run: `cd apps/merchant-studio && npx playwright test tests/product-page-kit.spec.ts tests/product-design.spec.ts tests/product-photo-layout.spec.ts tests/source-catalog.spec.ts tests/product-configurator.spec.ts tests/source-shopping-flow.spec.ts tests/commerce-parity.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx jest src/stores/source-commerce-pages.spec.ts src/stores/source-commerce-design.spec.ts src/stores/source-visual-capture.spec.ts`
Expected: PASS.

- [ ] **Step 8: Look at the screenshots**

Open `apps/merchant-studio/.test-artifacts/product-page-kit-editorial-1280.png`, `product-page-kit-dense-1280.png` and `product-page-kit-dense-390.png`. Compare them with the approved mockups: photo filling the left half, title at most two lines, button visible, pills or radio rows aligned, no stray borders. Fix any mismatch in the CSS block and rerun Step 7.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/stores/source-kit/commerce.js apps/api/src/stores/source-kit/commerce-pages.css apps/api/src/stores/source-commerce-design.spec.ts apps/merchant-studio/tests/product-page-kit.spec.ts apps/merchant-studio/tests/product-photo-layout.spec.ts apps/merchant-studio/tests/source-catalog.spec.ts
git commit -m "Replace layered product page CSS with editorial and dense styles

One unlayered stylesheet keyed on data-style: photo filling its column,
purchase above the fold, pills, swatches and priced radio rows, quantity
beside the action, and dots on phones. Store tokens still supply colors,
fonts and radius.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Hard product page checks in capture evidence

**Files:**
- Modify: `apps/api/src/stores/source-visual-capture.ts` (type and top-of-page metrics)
- Modify: `apps/api/src/stores/source-design-evaluator.ts` (`designCaptureFailures`)
- Modify: `apps/api/src/stores/source-visual-review.service.ts:18` (review text)
- Test: `apps/api/src/stores/source-design-evaluator.spec.ts`, `apps/api/src/stores/source-visual-capture.spec.ts`

**Interfaces:**
- Consumes: the rendered page from Task 3.
- Produces: `VisualCapture.product?: { buyBottom: number | null; titleLines: number; overflowingChoices: number }`, present only on `y === 0` captures of product pages, and three new Spanish failure strings from `designCaptureFailures`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('Design evidence and provider accounting', ...)` in `apps/api/src/stores/source-design-evaluator.spec.ts`:

```ts
  it('fails product pages whose purchase is below the fold, whose title wraps too far or whose choices overflow', () => {
    const desktop = capture('desktop', 1280), mobile = capture('mobile', 390);
    const good = { buyBottom: 700, titleLines: 2, overflowingChoices: 0 };
    expect(designCaptureFailures([{ ...desktop, product: good }, { ...mobile, product: { ...good, buyBottom: 1400, titleLines: 3 } }])).toEqual([]);
    expect(designCaptureFailures([{ ...desktop, product: { buyBottom: 900, titleLines: 3, overflowingChoices: 1 } }, mobile])).toEqual([
      'desktop: el botón de compra no se ve sin desplazarse.',
      'desktop: el nombre del producto ocupa demasiadas líneas.',
      'desktop: hay opciones con texto cortado.',
    ]);
    expect(designCaptureFailures([{ ...desktop, product: { ...good, buyBottom: null } }, { ...mobile, product: { ...good, titleLines: 4 } }])).toEqual(['mobile: el nombre del producto ocupa demasiadas líneas.']);
  });
```

In `apps/api/src/stores/source-visual-capture.spec.ts`, change the imports to:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { captureSourceVisuals, probeSourceShopping } from './source-visual-capture';
import { designCaptureFailures } from './source-design-evaluator';
import { sourceProjectSnapshot } from './source-project';
```

and append:

```ts
it('records product page purchase metrics at the top of each viewport', async () => {
  const files = await Promise.all(['commerce.js', 'commerce-pages.css'].map(async path => ({ path, content: await readFile(join(__dirname, 'source-kit', path), 'utf8') })));
  const shell = (mount: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="commerce-pages.css"><style>body{margin:0}</style>${mount}<p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script>`;
  const snapshot = sourceProjectSnapshot({ revision: 1, label: 'Product metrics', brief: { businessType: 'Test', audience: 'Test', primaryAction: 'Comprar', visualDirection: 'Simple' }, files: [...files,
    { path: 'index.html', content: shell('<h1>Tienda</h1>') },
    { path: 'product.html', content: shell('<main data-pagosya-product-page></main>') },
    { path: 'checkout.html', content: shell('<main data-pagosya-checkout-page></main>') },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', apiBaseUrl: 'https://preview.invalid', checkoutOrigin: 'https://preview.invalid', productPage: 'product.html', checkoutPage: 'checkout.html', productPageStyle: 'dense', demo: true, data: { storeName: 'Test', items: [{ id: 'p1', name: 'Lámpara', description: 'Brazo ajustable.', amount: 22000, currency: 'BOB', stock: 10, imageUrls: [], variants: [{ id: 'v1', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }] }] } }) + ';' },
    { path: 'package.json', content: '{"name":"test","scripts":{"build":"node build.mjs"}}' }, { path: 'README.md', content: '# Test' },
  ] });
  const captures = await captureSourceVisuals(snapshot, 'product.html');
  const top = captures.filter(capture => capture.y === 0);
  expect(top.map(capture => capture.viewport)).toEqual(['desktop', 'mobile']);
  for (const capture of top) expect(capture.product).toEqual({ buyBottom: expect.any(Number), titleLines: 1, overflowingChoices: 0 });
  expect(captures.filter(capture => capture.y > 0).every(capture => capture.product === undefined)).toBe(true);
  expect(designCaptureFailures(captures)).toEqual([]);
}, 60000);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/stores/source-design-evaluator.spec.ts src/stores/source-visual-capture.spec.ts`
Expected: FAIL. `product` is not a known property, no failures are produced, and captures carry no metrics.

- [ ] **Step 3: Record the metrics**

In `apps/api/src/stores/source-visual-capture.ts`, change the `VisualCapture` type's `readiness` member to add a sibling:

```ts
export type VisualCapture = { viewport: 'desktop' | 'mobile'; width: number; height: number; y: number; pageHeight: number; productId?: string; state: 'initial'; readiness: { fontsLoaded: boolean; missingImages: number; scrollWidth: number }; product?: { buyBottom: number | null; titleLines: number; overflowingChoices: number }; image: string };
```

In `captureSourceVisuals`, replace

```ts
        captures.push({ viewport, width, height: 844, y, pageHeight, ...(state.productId ? { productId: state.productId } : {}), state: 'initial', readiness, image: `data:image/jpeg;base64,${image.toString('base64')}` });
```

with

```ts
        // Purchase placement is measured once per viewport, at the top where shoppers land.
        const product = y === 0 ? await page.evaluate(() => {
          const detail = document.querySelector('[data-pagosya-product-page]'), title = detail?.querySelector('#pagosya-product-title');
          if (!detail || !title) return undefined;
          const buy = detail.querySelector('.product-detail__buy')?.getBoundingClientRect();
          const style = getComputedStyle(title), lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
          return {
            buyBottom: buy && buy.height ? Math.round(buy.bottom) : null,
            titleLines: Math.round(title.getBoundingClientRect().height / lineHeight),
            overflowingChoices: Array.from(detail.querySelectorAll('[data-product-option]')).filter(el => el.scrollWidth > el.clientWidth + 1).length,
          };
        }) : undefined;
        captures.push({ viewport, width, height: 844, y, pageHeight, ...(state.productId ? { productId: state.productId } : {}), state: 'initial', readiness, ...(product ? { product } : {}), image: `data:image/jpeg;base64,${image.toString('base64')}` });
```

- [ ] **Step 4: Turn the metrics into failures**

In `apps/api/src/stores/source-design-evaluator.ts`, inside the `for (const c of captures)` loop of `designCaptureFailures`, after the `scrollWidth` check, add:

```ts
    if (c.product) {
      if (c.viewport === 'desktop' && c.product.buyBottom !== null && c.product.buyBottom > c.height) errors.push('desktop: el botón de compra no se ve sin desplazarse.');
      if (c.product.titleLines > (c.viewport === 'desktop' ? 2 : 3)) errors.push(`${c.viewport}: el nombre del producto ocupa demasiadas líneas.`);
      if (c.product.overflowingChoices) errors.push(`${c.viewport}: hay opciones con texto cortado.`);
    }
```

In `apps/api/src/stores/source-visual-review.service.ts`, inside `SOURCE_PRODUCT_PAGE_REVIEW`, replace `con miniaturas legibles` with `con miniaturas o puntos para cambiar de foto`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/stores/source-design-evaluator.spec.ts src/stores/source-visual-capture.spec.ts src/stores/source-visual-review.service.spec.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/stores/source-visual-capture.ts apps/api/src/stores/source-design-evaluator.ts apps/api/src/stores/source-visual-review.service.ts apps/api/src/stores/source-design-evaluator.spec.ts apps/api/src/stores/source-visual-capture.spec.ts
git commit -m "Fail product page evidence when the purchase falls below the fold

Captures record the buy button's position, title line count and choices
whose text overflows at the top of each viewport, and design evidence
turns them into hard failures.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Before/after captures of the four photo-led benchmark stores

**Files:**
- Create: `apps/api/scripts/premium-benchmark-kit-captures.ts`
- Create (output): `examples/premium-benchmark-photos/*/kit-product-capture-*.jpg`, `examples/premium-benchmark-photos/*/kit-evidence.json`

**Interfaces:**
- Consumes: `currentSourceRuntime`, `captureSourceVisuals`, `designCaptureFailures` (with Task 4 metrics), `SourceProjectsService.current/version`, `SourceVisualReviewService.hydrate`.
- Produces: kit-rendered product page captures of the existing saved revisions. Nothing is regenerated and no credits are spent.

- [ ] **Step 1: Write the capture script**

Create `apps/api/scripts/premium-benchmark-kit-captures.ts`:

```ts
/** Re-render the saved photo-led benchmark stores with the current product page kit. Local only; never generates or publishes. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { SourceProjectsService } from '../src/stores/source-projects.service';
import { SourceVisualReviewService } from '../src/stores/source-visual-review.service';
import { sourceProjectSnapshot } from '../src/stores/source-project';
import { currentSourceRuntime } from '../src/stores/source-runtime';
import { captureSourceVisuals } from '../src/stores/source-visual-capture';
import { designCaptureFailures } from '../src/stores/source-design-evaluator';

async function main() {
  const root = resolve(__dirname, '../../../examples/premium-benchmark-photos');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const settings = app.get(ConfigService);
    if (!['localhost', '127.0.0.1'].includes(new URL(settings.getOrThrow('app.databaseUrl')).hostname)) throw new Error('Local fixtures only');
    const projects = app.get(SourceProjectsService), review = app.get(SourceVisualReviewService);
    for (const id of ['apparel-photo-1', 'beauty-photo-1', 'home-photo-1', 'technical-photo-1']) {
      const folder = resolve(root, id);
      const record = JSON.parse(await readFile(resolve(folder, 'receipt.json'), 'utf8'));
      const current = await projects.current(record.merchantId, record.storeId);
      const version = await projects.version(record.merchantId, record.storeId, current.revision);
      const snapshot = sourceProjectSnapshot({ ...(version.snapshot as any), revision: version.revision, label: version.label });
      const rendered = await review.hydrate(await currentSourceRuntime(snapshot), record.merchantId);
      const captures = await captureSourceVisuals(rendered, 'product.html');
      const failures = designCaptureFailures(captures);
      const evidence = await Promise.all(captures.map(async ({ image, ...capture }, i) => {
        const path = `kit-product-capture-${i}.jpg`;
        await writeFile(resolve(folder, path), Buffer.from(image.split(',')[1], 'base64'));
        return { ...capture, path };
      }));
      await writeFile(resolve(folder, 'kit-evidence.json'), JSON.stringify({ revision: current.revision, captures: evidence, failures }, null, 2) + '\n');
      console.log(JSON.stringify({ id, revision: current.revision, failures }));
    }
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Kit capture failed'); process.exitCode = 1; });
```

- [ ] **Step 2: Run it against the local database the benchmark stores live in**

Run: `cd apps/api && npx ts-node scripts/premium-benchmark-kit-captures.ts`
Expected: four JSON lines, one per store, each with `"failures":[]`. If a store reports a failure, open its `kit-product-capture-0.jpg` (desktop, top) and `kit-product-capture-*.jpg` with `viewport: 'mobile'` in `kit-evidence.json`, fix the cause in the Task 3 CSS, rerun Task 3 Step 7, then rerun this step.

- [ ] **Step 3: Compare before and after**

For each store, view `product-capture-0.jpg` (before) next to `kit-product-capture-0.jpg` (after), plus the first mobile capture listed in `kit-evidence.json`. Confirm that the stores whose generated CSS used to override the product page (Pliegue's pink panel, Trama's boxed choices) now show the kit layout with their own colors and fonts.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/premium-benchmark-kit-captures.ts examples/premium-benchmark-photos/*/kit-product-capture-*.jpg examples/premium-benchmark-photos/*/kit-evidence.json
git commit -m "Capture the photo-led benchmark product pages with the new kit

Re-renders each saved benchmark revision through the current runtime,
without regenerating, so the before and after product pages sit side by
side.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
