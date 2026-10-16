# Free Commerce Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On every new store and redesign (and on a chat request naming a part), YAPI designs the catalog card, product page, cart, cart line, added-to-cart notice and checkout page as kit templates; each part is checked by a real purchase in the browser and falls back alone when it fails.

**Architecture:** A new `commerce-surfaces/` module in `apps/api/src/storefront-source`: part contracts and a templates file (`commerce-templates.html`), injection of that file into every served page at the end of `withSourceRuntime()`, a browser purchase check, one structured model call, and a stage that designs → validates → checks → repairs (≤2 rounds) → drops failing parts. The generation service runs the stage right before the save, like the store controls request path. The runtime gains a checkout page template (in its `commerce-src/` parts, rebuilt into `kit/commerce.js`).

**Tech Stack:** NestJS + TypeScript (`apps/api`), Jest (+ Playwright `chromium` inside Jest specs, as `store-controls-guard.spec.ts` does), parse5, the vanilla JS runtime built from `packages/storefront-kit/commerce-src/` by `packages/storefront-kit/tools/build-commerce.mjs`, Playwright tests in `apps/merchant-studio/tests`.

**Spec:** `docs/superpowers/specs/2026-10-15-free-commerce-surfaces-design.md` (parent: `docs/superpowers/specs/2026-09-25-kit-templates-design.md`).

## Global Constraints

- Branch `feature/store-page-architecture`. Commit only your own paths: `git add <paths>` then `git commit`. Never `git add -A`, stash, reset, rebase or push (the controller pushes).
- **The owner's `pnpm dev` runs `nest start --watch`: every saved file under `apps/api` restarts the API and kills a running YAPI request.** Before the first API edit of each task run the "Running jobs check" below; if a job is RUNNING or QUEUED, wait for it to finish.
- Never run `prisma migrate`, `db push`, `db reset` or `prisma diff` (the dev DB was wiped by an agent on 2026-09-25). No schema change is needed by this plan.
- Run API Jest with `--maxWorkers=3` or on named files only; never the full suite with default workers.
- Tests never call a real model: the stage takes an injected `call`.
- `kit/commerce.js` is generated: edit `packages/storefront-kit/commerce-src/**` and run `node packages/storefront-kit/tools/build-commerce.mjs`; `node packages/storefront-kit/tools/build-commerce.mjs --check` must exit 0 before committing. Commit the parts and the rebuilt `kit/commerce.js` together.
- The runtime fills slots with `textContent` and kit-built nodes only; never insert template- or merchant-supplied HTML strings (T1 constraint).
- A template can place a price or total; it never produces one. A missing or invalid template never blocks a purchase: the kit's default renders instead.
- Stores without `commerce-templates.html` render byte-for-byte as before. Pre-existing failures on the branch, not to be fixed or added to: 14 in `source-commerce-conversion.spec.ts` + `source-commerce-product-card.spec.ts`; 7 in `source-dna.spec.ts` + `source-product-card-presets.spec.ts` + `source-design-planner.spec.ts`; `apps/merchant-studio/src/source-focus-debug.test.ts` (order-dependent).
- Flag `YAPI_COMMERCE_SURFACES`: `'1'` turns the stage on; anything else is off and builds behave exactly as today.
- Merchant-facing copy is Spanish (Bolivia, "tú"), exactly the strings in the spec.
- Parts never contain `<script>`, `on*=` attributes, `javascript:` URLs, typed currency amounts, `@import` or external `url()`.

### Running jobs check

```bash
cd /Users/saramia/pagosYa/apps/api && node -e "
const { PrismaClient } = require(process.cwd() + '/node_modules/@prisma/client'); const p = new PrismaClient();
p.storeSourceChatJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }).then(n => { console.log('active YAPI jobs:', n); return p.\$disconnect(); });"
```
Expected: `active YAPI jobs: 0` before editing anything under `apps/api`.

## Review Focus

1. **A store with no products** (empty catalog): the purchase check has nothing to add. Expected: purchase checks are skipped (`skipped: 'empty catalog'`), parts are kept, the save never fails. Test in Task 4.
2. **A product that needs an option** (variants or a required choice): the card's add button opens the product instead of adding. Expected: the check follows the product page and adds from there; it does not fail the card. Test in Task 4.
3. **A chat request about the header's cart button** («haz el ícono del carrito más grande»): must stay a controls request, not a surfaces request. Expected: `requestedSurfaceParts` returns `[]`. Test in Task 7.
4. **Re-serving a store whose pages already contain an injected block** (every save after the first): injection must replace, never duplicate. Expected: exactly one block per page after any number of passes. Test in Task 2.
5. **A redesign of a store that had templates**: the old file must not leak into the new design when the stage fails entirely. Expected: a fresh build whose stage fails saves *without* the file (today's look), not with the previous store's parts. Test in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/storefront-kit/commerce-src/templates/kit-templates.js` (modify) | `checkoutTemplate()` + `applyCheckoutTemplate()` |
| `packages/storefront-kit/commerce-src/checkout/overlay.js` (modify) | `showCheckout` applies the checkout template |
| `packages/storefront-kit/commerce-src/catalog/render.js` (modify) | the template validation pass includes the checkout template |
| `packages/storefront-kit/kit/commerce.js` (rebuilt) | generated by `tools/build-commerce.mjs` |
| `apps/merchant-studio/tests/kit-templates.spec.ts` (modify) | runtime e2e for the checkout template and per-part fallback |
| `apps/api/src/storefront-source/commerce-surfaces/surface-parts.ts` (create) | part ids, slot contracts, static validation, compose/read `commerce-templates.html` |
| `apps/api/src/storefront-source/commerce-surfaces/surface-inject.ts` (create) | `withCommerceTemplates(files)`: one idempotent block per served HTML page |
| `apps/api/src/storefront-source/source-runtime.ts` (modify) | call `withCommerceTemplates` at the end of `withSourceRuntime` |
| `apps/api/src/storefront-source/commerce-surfaces/surface-checks.ts` (create) | browser purchase check |
| `apps/api/src/storefront-source/commerce-surfaces/surface-design.ts` (create) | schema, prompt, answer parsing |
| `apps/api/src/storefront-source/source-sep5-call.ts` (modify) | `surfacesCall` (phase `'surfaces'`) |
| `apps/api/src/storefront-source/source-generation-types.ts` (modify) | `'surfaces'` in the attempt phase union |
| `apps/api/src/storefront-source/commerce-surfaces/surface-stage.ts` (create) | `runCommerceSurfaces`: design → validate → check → repair ≤2 → fallback |
| `apps/api/src/storefront-source/commerce-surfaces/surface-request.ts` (create) | `requestedSurfaceParts`, `surfacesAfterStage` |
| `apps/api/src/config/configuration.ts` (modify) | `yapiCommerceSurfaces` flag |
| `apps/api/src/storefront-source/source-progress.ts` (modify) | `commerce` progress label |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify) | run the stage before the save; receipt notes |
| `apps/api/src/storefront-source/source-sep5-review.ts` (modify) | skip the kit touch on a surfaces request |
| `apps/api/src/storefront-source/source-chat.service.ts` (modify) | chat note + «Reintentar …» buttons |

---

### Task 1: Checkout page template in the runtime

**Files:**
- Modify: `packages/storefront-kit/commerce-src/templates/kit-templates.js` (next to `reviewTemplate`, line ~71)
- Modify: `packages/storefront-kit/commerce-src/checkout/overlay.js` (`showCheckout`, the `checkoutPage.innerHTML = …` line ~117, before `renderCart();` line ~118)
- Modify: `packages/storefront-kit/commerce-src/catalog/render.js` (validation pass, line ~141)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/merchant-studio/tests/kit-templates.spec.ts`

**Interfaces:**
- Produces: `<template data-pagosya-checkout-template>` with slots `data-checkout-slot="heading"` (required), `"review"` (required), `"back"`, `"status"` (optional). Root marked `data-checkout-root`; page marked `data-checkout-template`. Invalid flag dataset key `checkoutTemplateInvalid`.

- [ ] **Step 1: Write the failing tests** — append to `kit-templates.spec.ts` (it already defines `TEMPLATES`, `mount`, `SHOTS`):

```ts
const CHECKOUT = `<template data-pagosya-checkout-template><div class="caja"><nav data-checkout-slot="back"></nav><header class="caja__head" data-checkout-slot="heading"></header><p data-checkout-slot="status"></p><section class="caja__cuerpo" data-checkout-slot="review"></section></div></template>`;

for (const width of [1280, 390]) test(`the checkout page template owns the page and the purchase completes at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  await browserPage.emulateMedia({ reducedMotion: 'reduce' });
  const shop = await mount(browserPage, TEMPLATES + CHECKOUT);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await shop.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  const root = shop.locator('[data-pagosya-checkout] [data-checkout-root]');
  await expect(root).toBeVisible();
  await expect(root.locator('[data-checkout-slot="heading"] h1')).toHaveText('Revisa tu pedido');
  await expect(root.locator('[data-checkout-slot="review"] [data-checkout-review] .order-total')).toBeVisible();
  await expect(root.locator('[data-checkout-slot="status"] [data-pagosya-status]')).toHaveCount(1);
  expect(await shop.locator('html').evaluate(() => document.documentElement.dataset.checkoutTemplateInvalid)).toBeUndefined();
  await root.locator('.checkout-button').click();
  await expect(shop.getByRole('heading', { name: 'Pago de prueba' })).toBeVisible();
  await expect(shop.locator('[data-checkout-root] [data-checkout-slot="heading"] h1')).toHaveText('Pago de prueba');
  await shop.locator('[data-checkout-root] .checkout-button').click();
  await expect(shop.locator('[data-pagosya-status]').filter({ hasText: 'Prueba completada' }).first()).toBeVisible();
  expect(await shop.locator('html').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await browserPage.screenshot({ path: `${SHOTS}/checkout-template-${width}.png` });
});

test('a checkout template without its review slot falls back to the kit checkout and raises its flag', async ({ page: browserPage }) => {
  const shop = await mount(browserPage, TEMPLATES + CHECKOUT.replace('<section class="caja__cuerpo" data-checkout-slot="review"></section>', ''));
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await shop.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(shop.locator('[data-pagosya-checkout] .checkout-page__summary .order-total')).toBeVisible();
  await expect(shop.locator('[data-checkout-root]')).toHaveCount(0);
  expect(await shop.locator('html').evaluate(() => document.documentElement.dataset.checkoutTemplateInvalid)).toBe('true');
});

test('each part falls back alone: a broken cart line keeps the templated cart panel', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<strong data-cart-field="line-total"></strong>', '');
  const shop = await mount(browserPage, broken + CHECKOUT);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await expect(shop.getByRole('heading', { name: 'Tu canasta 🐾' })).toBeVisible();
  await expect(shop.locator('.linea')).toHaveCount(0);
  await expect(shop.locator('[data-cart-slot="lines"] .order-item')).toHaveCount(1);
  expect(await shop.locator('html').evaluate(() => document.documentElement.dataset.cartLineTemplateInvalid)).toBe('true');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-studio && npx playwright test tests/kit-templates.spec.ts -g "checkout|falls back alone"`
Expected: the two checkout tests FAIL (`[data-checkout-root]` not found / flag undefined). The "falls back alone" test may already pass (it pins existing behaviour) — that is fine.

- [ ] **Step 3: Implement**

In `commerce-src/templates/kit-templates.js`, right after `reviewTemplate`:

```js
  // Spec 2026-10-15 free commerce surfaces: the whole checkout page. The kit still builds every piece (back, heading, status,
  // the review with the payment box) and only moves them into the template's slots.
  const checkoutTemplate = () => kitTemplate('checkout', 'checkoutTemplateInvalid', root =>
    root.querySelector('[data-checkout-slot="heading"]') && root.querySelector('[data-checkout-slot="review"]'));
  function applyCheckoutTemplate() {
    const layout = checkoutTemplate();
    const inner = checkoutPage.querySelector(':scope > .checkout-page__inner');
    if (!layout || !inner) return;
    const root = layout.make();
    const slot = name => root.querySelector(`[data-checkout-slot="${name}"]`);
    root.querySelectorAll('[data-checkout-slot]').forEach(node => node.replaceChildren());
    const back = inner.querySelector(':scope > .checkout-page__back');
    const intro = inner.querySelector(':scope > div:not(.checkout-page__summary)');
    const status = intro?.querySelector('[data-pagosya-status]');
    const review = inner.querySelector(':scope > .checkout-page__summary > [data-pagosya-cart]');
    if (status) (slot('status') || slot('heading')).append(status);
    if (intro) slot('heading').prepend(...intro.childNodes);
    if (back) (slot('back') || slot('heading')).prepend(back);
    slot('review').append(review);
    root.setAttribute('data-checkout-root', '');
    inner.replaceChildren(root);
    checkoutPage.setAttribute('data-checkout-template', '');
  }
```

In `commerce-src/checkout/overlay.js` `showCheckout`, between the `checkoutPage.innerHTML = \`<div class="checkout-page__inner">…\`;` line and `renderCart();`:

```js
    checkoutPage.removeAttribute('data-checkout-template');
    applyCheckoutTemplate();
```

In `commerce-src/catalog/render.js` line ~141:

```js
    cartLineTemplate(); cartTemplate(); addedTemplate(); reviewTemplate(); productPageTemplate(); checkoutTemplate();
```

The payment box keeps its markup: it is built by the kit inside the review and moves into the `review` slot whole. Its colours and fonts already come from `--store-*` / `--brand-*` in the kit's checkout styles (`commerce-src/checkout/overlay.js` style block) — no change; Task 8 confirms it visually.

All parts share one IIFE scope; `applyCheckoutTemplate` is a function declaration and both templates are only called after load (same as `reviewTemplate`), so part order does not matter.

Rebuild: `node packages/storefront-kit/tools/build-commerce.mjs && node packages/storefront-kit/tools/build-commerce.mjs --check` — Expected: exit 0.

- [ ] **Step 4: Run to verify they pass, and nothing else changed**

Run: `cd apps/merchant-studio && npx playwright test tests/kit-templates.spec.ts` — Expected: all PASS.
Run: `cd packages/storefront-kit && npm test` (or `pnpm test` if the package uses pnpm scripts; read `package.json`) — Expected: PASS.
Run: `cd apps/api && npx jest --maxWorkers=3 src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce-long-page.spec.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src/templates/kit-templates.js packages/storefront-kit/commerce-src/checkout/overlay.js packages/storefront-kit/commerce-src/catalog/render.js packages/storefront-kit/kit/commerce.js apps/merchant-studio/tests/kit-templates.spec.ts
git commit -m "feat(kit): a checkout page template — the kit moves back, heading, status and the review into its slots"
```

---

### Task 2: Part contracts, templates file and injection into every page

**Files:**
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-parts.ts`
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-inject.ts`
- Modify: `apps/api/src/storefront-source/source-runtime.ts` (last line of `withSourceRuntime`)
- Test: `apps/api/src/storefront-source/commerce-surfaces/surface-parts.spec.ts`, `surface-inject.spec.ts`

**Interfaces:**
- Produces:
  - `SURFACE_PARTS: readonly ['card','productPage','cart','cartLine','added','checkout']`, `type SurfacePart`
  - `SURFACE_CONTRACT: Record<SurfacePart, { attr: string; slotAttr: string; required: string[]; optional: string[]; controls: Array<{ tag: string; attr: string }> }>`
  - `SURFACE_LABELS: Record<SurfacePart, string>` (Spanish)
  - `type SurfaceTemplate = { part: SurfacePart; html: string; css: string }`
  - `validateSurfaceTemplate(t: SurfaceTemplate): string[]` (empty = valid; Spanish reasons)
  - `COMMERCE_TEMPLATES_FILE = 'commerce-templates.html'`
  - `composeTemplatesFile(templates: SurfaceTemplate[]): string`, `readTemplatesFile(content: string): SurfaceTemplate[]`
  - `withCommerceTemplates<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[]`

- [ ] **Step 1: Running jobs check.** Expected `0`.

- [ ] **Step 2: Write the failing tests** — `surface-parts.spec.ts`:

```ts
import { SURFACE_PARTS, composeTemplatesFile, readTemplatesFile, validateSurfaceTemplate, type SurfaceTemplate } from './surface-parts';

const CART: SurfaceTemplate = { part: 'cart', css: '.canasta{display:grid;gap:12px}', html: '<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>' };
const CARD: SurfaceTemplate = { part: 'card', css: '', html: '<template data-pagosya-product-template><article><img data-product-field="image" alt=""><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>' };

describe('surface parts (spec 2026-10-15)', () => {
  it('accepts a template with its required slots and controls', () => {
    expect(validateSurfaceTemplate(CART)).toEqual([]);
    expect(validateSurfaceTemplate(CARD)).toEqual([]);
  });
  it('names every missing required slot or control', () => {
    expect(validateSurfaceTemplate({ ...CART, html: CART.html.replace('<div data-cart-slot="total"></div>', '').replace('<button data-cart-close>×</button>', '') }))
      .toEqual(['Falta el espacio «total» en carrito.', 'Falta el control button[data-cart-close] en carrito.']);
  });
  it('rejects scripts, handlers, javascript: links, typed prices, two roots and unsafe css', () => {
    const bad = (html: string, css = '') => validateSurfaceTemplate({ part: 'card', html, css });
    expect(bad(CARD.html.replace('</article>', '<script>x()</script></article>'))).toContain('Las plantillas no llevan scripts.');
    expect(bad(CARD.html.replace('<article>', '<article onclick="x()">'))).toContain('Las plantillas no llevan atributos on*.');
    expect(bad(CARD.html.replace('href="#"', 'href="javascript:x()"'))).toContain('Las plantillas no llevan enlaces javascript:.');
    expect(bad(CARD.html.replace('<p data-product-field="price"></p>', '<p data-product-field="price"></p><span>Bs 45</span>'))).toContain('Las plantillas no escriben precios: «Bs 45».');
    expect(bad(CARD.html.replace('</article>', '</article><div></div>'))).toContain('La plantilla de tarjetas de producto necesita un solo elemento raíz.');
    expect(bad(CARD.html, '@import url(x.css);')).toContain('El CSS no puede importar hojas ni cargar URLs externas.');
    expect(bad(CARD.html, '.a{background:url(https://x.test/a.png)}')).toContain('El CSS no puede importar hojas ni cargar URLs externas.');
  });
  it('composes and reads back the templates file per part', () => {
    expect(readTemplatesFile(composeTemplatesFile([CART, CARD]))).toEqual([CART, CARD]);
    expect(SURFACE_PARTS).toHaveLength(6);
  });
});
```

`surface-inject.spec.ts`:

```ts
import { composeTemplatesFile } from './surface-parts';
import { withCommerceTemplates } from './surface-inject';

const FILE = composeTemplatesFile([{ part: 'added', css: '.aviso{padding:8px}', html: '<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>' }]);
const page = (path: string) => ({ path, content: `<!doctype html><html><body><main>${path}</main></body></html>` });

describe('withCommerceTemplates', () => {
  it('puts one block before </body> of every page, the platform pages included', () => {
    const out = withCommerceTemplates([page('index.html'), page('product.html'), page('checkout.html'), { path: 'commerce-templates.html', content: FILE }, { path: 'config.js', content: 'x' }]);
    for (const path of ['index.html', 'product.html', 'checkout.html']) {
      const html = out.find(f => f.path === path)!.content;
      expect(html.match(/<!--pagosya:commerce-templates-->/g)).toHaveLength(1);
      expect(html.indexOf('data-pagosya-added-template')).toBeLessThan(html.indexOf('</body>'));
    }
    expect(out.find(f => f.path === 'commerce-templates.html')!.content).toBe(FILE);
  });
  it('replaces, never duplicates, on every later pass (Review Focus 4)', () => {
    let files = [page('index.html'), { path: 'commerce-templates.html', content: FILE }];
    for (let i = 0; i < 3; i++) files = withCommerceTemplates(files);
    expect(files[0].content.match(/<!--pagosya:commerce-templates-->/g)).toHaveLength(1);
  });
  it('removes an old block when the file is gone, and leaves stores without it byte-identical', () => {
    const injected = withCommerceTemplates([page('index.html'), { path: 'commerce-templates.html', content: FILE }])[0];
    expect(withCommerceTemplates([injected])[0].content).toBe(page('index.html').content);
    const plain = [page('index.html')];
    expect(withCommerceTemplates(plain)).toEqual(plain);
  });
});
```

- [ ] **Step 3: Run to verify they fail** — `cd apps/api && npx jest src/storefront-source/commerce-surfaces` — Expected: FAIL (modules not found).

- [ ] **Step 4: Implement `surface-parts.ts`**

```ts
import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';

/** Spec 2026-10-15 free commerce surfaces: the six parts YAPI designs, each a kit template (T1 + the checkout template). */
export const SURFACE_PARTS = ['card', 'productPage', 'cart', 'cartLine', 'added', 'checkout'] as const;
export type SurfacePart = typeof SURFACE_PARTS[number];
export type SurfaceTemplate = { part: SurfacePart; html: string; css: string };
export const COMMERCE_TEMPLATES_FILE = 'commerce-templates.html';

export const SURFACE_CONTRACT: Record<SurfacePart, { attr: string; slotAttr: string; required: string[]; optional: string[]; controls: Array<{ tag: string; attr: string }> }> = {
  card: { attr: 'data-pagosya-product-template', slotAttr: 'data-product-field', required: ['name', 'price'], optional: ['image', 'description', 'options', 'badge'], controls: [{ tag: 'a', attr: 'data-product-link' }, { tag: 'button', attr: 'data-product-add' }] },
  productPage: { attr: 'data-pagosya-product-page-template', slotAttr: 'data-product-slot', required: ['gallery', 'title', 'pricing', 'buy'], optional: ['category', 'description', 'highlights', 'info', 'delivery', 'rating', 'reviews', 'bundles', 'related', 'breadcrumb'], controls: [] },
  cart: { attr: 'data-pagosya-cart-template', slotAttr: 'data-cart-slot', required: ['lines', 'total', 'action'], optional: ['suggestions', 'savings', 'note', 'policies', 'empty'], controls: [{ tag: 'button', attr: 'data-cart-close' }] },
  cartLine: { attr: 'data-pagosya-cart-line-template', slotAttr: 'data-cart-field', required: ['name', 'line-total', 'quantity'], optional: ['photo', 'option', 'unit', 'stock', 'remove'], controls: [] },
  added: { attr: 'data-pagosya-added-template', slotAttr: 'data-added-field', required: ['message'], optional: ['name', 'photo'], controls: [{ tag: 'button', attr: 'data-cart-open' }] },
  checkout: { attr: 'data-pagosya-checkout-template', slotAttr: 'data-checkout-slot', required: ['heading', 'review'], optional: ['back', 'status'], controls: [] },
};
export const SURFACE_LABELS: Record<SurfacePart, string> = { card: 'tarjetas de producto', productPage: 'página de producto', cart: 'carrito', cartLine: 'líneas del carrito', added: 'aviso al agregar', checkout: 'pago' };

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
type Template = DefaultTreeAdapterMap['template'];
const isElement = (node: Node): node is Element => 'tagName' in node;
function walk(node: Node, visit: (el: Element) => void) {
  if (isElement(node)) visit(node);
  for (const child of ('childNodes' in node ? node.childNodes : [])) walk(child, visit);
  if (isElement(node) && node.tagName === 'template') walk((node as Template).content as unknown as Node, visit);
}
function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  const own = 'childNodes' in node ? node.childNodes.map(textOf).join(' ') : '';
  return isElement(node) && node.tagName === 'template' ? own + textOf((node as Template).content as unknown as Node) : own;
}
const PRICE = /(?:\bBs\.?|\bBOB|\$)\s?\d[\d.,]*|\d[\d.,]*\s?(?:Bs|BOB)\b/i;

export function validateSurfaceTemplate(t: SurfaceTemplate): string[] {
  const contract = SURFACE_CONTRACT[t.part];
  const label = SURFACE_LABELS[t.part];
  const roots = parseFragment(t.html).childNodes.filter(isElement);
  const template = roots.length === 1 && roots[0].tagName === 'template' && roots[0].attrs.some(a => a.name === contract.attr) ? roots[0] as Template : undefined;
  if (!template) return [`La plantilla de ${label} debe ser un solo <template ${contract.attr}>.`];
  const reasons: string[] = [];
  if (template.content.childNodes.filter(n => isElement(n as Node)).length !== 1) reasons.push(`La plantilla de ${label} necesita un solo elemento raíz.`);
  const slots = new Set<string>(); const seen: Array<{ tag: string; attrs: string[] }> = [];
  let script = false, handler = false, jsLink = false;
  walk(template.content as unknown as Node, el => {
    if (el.tagName === 'script') script = true;
    for (const attr of el.attrs) {
      if (/^on/i.test(attr.name)) handler = true;
      if (/^\s*javascript:/i.test(attr.value)) jsLink = true;
      if (attr.name === contract.slotAttr) slots.add(attr.value);
    }
    seen.push({ tag: el.tagName, attrs: el.attrs.map(a => a.name) });
  });
  for (const slot of contract.required) if (!slots.has(slot)) reasons.push(`Falta el espacio «${slot}» en ${label}.`);
  for (const control of contract.controls) if (!seen.some(c => c.tag === control.tag && c.attrs.includes(control.attr))) reasons.push(`Falta el control ${control.tag}[${control.attr}] en ${label}.`);
  if (script) reasons.push('Las plantillas no llevan scripts.');
  if (handler) reasons.push('Las plantillas no llevan atributos on*.');
  if (jsLink) reasons.push('Las plantillas no llevan enlaces javascript:.');
  const typed = textOf(template as unknown as Node).match(PRICE);
  if (typed) reasons.push(`Las plantillas no escriben precios: «${typed[0].trim()}».`);
  if (/@import|url\(\s*['"]?\s*(?:https?:)?\/\//i.test(t.css) || /expression\s*\(/i.test(t.css)) reasons.push('El CSS no puede importar hojas ni cargar URLs externas.');
  return reasons;
}

const block = (t: SurfaceTemplate) => `<!--part:${t.part}--><style data-commerce-part="${t.part}">${t.css.replace(/<\/style/gi, '')}</style>${t.html}<!--/part:${t.part}-->`;
export function composeTemplatesFile(templates: SurfaceTemplate[]): string {
  return templates.map(block).join('\n');
}
export function readTemplatesFile(content: string): SurfaceTemplate[] {
  const out: SurfaceTemplate[] = [];
  for (const match of content.matchAll(/<!--part:([a-zA-Z]+)--><style data-commerce-part="\1">([\s\S]*?)<\/style>([\s\S]*?)<!--\/part:\1-->/g)) {
    if ((SURFACE_PARTS as readonly string[]).includes(match[1])) out.push({ part: match[1] as SurfacePart, css: match[2], html: match[3] });
  }
  return out;
}
```

- [ ] **Step 5: Implement `surface-inject.ts`**

```ts
import { COMMERCE_TEMPLATES_FILE } from './surface-parts';

const START = '<!--pagosya:commerce-templates-->', END = '<!--/pagosya:commerce-templates-->';
const BLOCK = /<!--pagosya:commerce-templates-->[\s\S]*?<!--\/pagosya:commerce-templates-->/g;

/** Spec 2026-10-15: the runtime finds templates in the current document only, and product.html / the catalog pages are
 *  platform pages re-copied from the kit on every serve (withSourceRuntime), so every served page carries the store's
 *  templates. Idempotent; without the file, pages are untouched. */
export function withCommerceTemplates<F extends { path: string; content: string; encoding?: string }>(files: F[]): F[] {
  const source = files.find(file => file.path === COMMERCE_TEMPLATES_FILE)?.content.trim() ?? '';
  return files.map(file => {
    if (!file.path.endsWith('.html') || file.path === COMMERCE_TEMPLATES_FILE || file.encoding === 'base64' || file.encoding === 'url') return file;
    const clean = file.content.includes(START) ? file.content.replace(BLOCK, '') : file.content;
    if (!source) return clean === file.content ? file : { ...file, content: clean };
    const injected = `${START}${source}${END}`;
    const at = clean.lastIndexOf('</body>');
    return { ...file, content: at === -1 ? clean + injected : clean.slice(0, at) + injected + clean.slice(at) };
  });
}
```

- [ ] **Step 6: Wire into `withSourceRuntime`** — in `source-runtime.ts`, the last line of `withSourceRuntime` becomes:

```ts
  return withSourceSeo({ ...snapshot, files: withCommerceTemplates(files.map(f => ({ ...f, encoding: f.encoding || 'utf8' }))) });
```
and add `import { withCommerceTemplates } from './commerce-surfaces/surface-inject';`. (`SourceProjectsService.prepare()` calls `currentSourceRuntime`, so saved snapshots, the agent's sandbox, the Studio preview and the public store all get the block from this one place.)

- [ ] **Step 7: Run tests**

Run: `cd apps/api && npx jest src/storefront-source/commerce-surfaces src/storefront-source/source-runtime` — Expected: PASS.
Run: `npx jest --maxWorkers=3 src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-projects.service.spec.ts` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/storefront-source/commerce-surfaces/surface-parts.ts apps/api/src/storefront-source/commerce-surfaces/surface-parts.spec.ts apps/api/src/storefront-source/commerce-surfaces/surface-inject.ts apps/api/src/storefront-source/commerce-surfaces/surface-inject.spec.ts apps/api/src/storefront-source/source-runtime.ts
git commit -m "feat(yapi): commerce-templates.html — six part contracts, static validation and one injected block per served page"
```

---

### Task 3: Configuration flag and progress step

**Files:**
- Modify: `apps/api/src/config/configuration.ts` (type near line 105, values near line 449)
- Modify: `apps/api/src/storefront-source/source-progress.ts`
- Modify: `apps/api/.env` (owner's dev, git-ignored; one line)
- Test: `apps/api/src/storefront-source/source-progress.spec.ts`

**Interfaces:**
- Produces: `app.yapiCommerceSurfaces: boolean`; progress stage `'commerce'` labelled `'Diseñando carrito, productos y pago'`.

- [ ] **Step 1: Running jobs check.**
- [ ] **Step 2: Failing test** — append to `source-progress.spec.ts` (import `SOURCE_PROGRESS_LABELS` from `./source-progress` if not imported):

```ts
it('labels the commerce surfaces stage (spec 2026-10-15)', () => {
  expect(SOURCE_PROGRESS_LABELS.commerce).toBe('Diseñando carrito, productos y pago');
});
```

- [ ] **Step 3: Run** `cd apps/api && npx jest src/storefront-source/source-progress.spec.ts` — Expected: FAIL.
- [ ] **Step 4: Implement** — in `SOURCE_PROGRESS_LABELS`, between `repairing` and `saving`: `commerce: 'Diseñando carrito, productos y pago',`. In `configuration.ts`: type `yapiCommerceSurfaces: boolean;`, value `yapiCommerceSurfaces: process.env.YAPI_COMMERCE_SURFACES === '1',`. Append `YAPI_COMMERCE_SURFACES=1` to `apps/api/.env` (read on the owner's next `pnpm dev` restart — tell the owner).
- [ ] **Step 5: Run** the spec and `cd apps/api && npx tsc --noEmit -p tsconfig.json` — Expected: PASS, no errors.
- [ ] **Step 6: Commit** (check `git check-ignore apps/api/.env` prints the path; never commit `.env`):

```bash
git add apps/api/src/config/configuration.ts apps/api/src/storefront-source/source-progress.ts apps/api/src/storefront-source/source-progress.spec.ts
git commit -m "feat(yapi): YAPI_COMMERCE_SURFACES flag and the «Diseñando carrito, productos y pago» step"
```

---

### Task 4: Browser purchase check

**Files:**
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-checks.ts`
- Test: `apps/api/src/storefront-source/commerce-surfaces/surface-checks.spec.ts`

**Interfaces:**
- Consumes: `SurfacePart` (Task 2); `withVisualSandbox` (`../source-visual-capture`), `sourceVisualState(snapshot, page, productId?, allowEmptyCatalog?)` (`../source-visual-state`), `currentSourceRuntime` (`../source-runtime`, which injects the templates since Task 2).
- Produces:
  - `type SurfaceFailure = { part: SurfacePart; check: string; detail: string }`
  - `type SurfaceCheckResult = { failures: SurfaceFailure[]; skipped?: 'empty catalog' }`
  - `inspectShopPage(page: Page, width: number): Promise<SurfaceCheckResult>`
  - `inspectProductPage(page: Page, width: number): Promise<SurfaceFailure[]>`
  - `checkSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<SurfaceCheckResult>`

- [ ] **Step 1: Running jobs check.**

- [ ] **Step 2: Write the failing test** — `surface-checks.spec.ts` (real chromium, like `store-controls-guard.spec.ts`):

```ts
/// <reference lib="dom" />
jest.setTimeout(180_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { inspectProductPage, inspectShopPage } from './surface-checks';

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const productHtml = readFileSync(kitPath('product.html'), 'utf8');
const ITEM = { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], description: 'Horneadas sin conservantes' };
const config = (items: unknown[]) => `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'huellitas', demo: true, sitePurpose: 'shop', data: { storeName: 'Huellitas', locations: [], categories: [], items } })};`;
const GOOD = `
<template data-pagosya-product-template><article class="t"><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>
<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver canasta</button></div></template>
<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>
<template data-pagosya-cart-line-template><li class="linea"><h3 data-cart-field="name"></h3><div data-cart-field="quantity"></div><strong data-cart-field="line-total"></strong></li></template>
<template data-pagosya-checkout-template><div class="caja"><header data-checkout-slot="heading"></header><section data-checkout-slot="review"></section></div></template>`;
const shop = (templates: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header><button type="button" data-cart-open>Mi canasta <b data-cart-count>0</b></button></header><main><section data-pagosya-catalog></section></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p>${templates}</body></html>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
async function onShop(templates: string, width: number, items: unknown[] = [ITEM]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
  try {
    await page.setContent(shop(templates));
    await page.addScriptTag({ content: config(items) });
    await page.addScriptTag({ content: commerce });
    await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 5000 }).catch(() => {});
    return await inspectShopPage(page, width);
  } finally { await page.close(); }
}

describe('surface purchase check (spec 2026-10-15)', () => {
  it('passes a fully templated store at both widths', async () => {
    for (const width of [1280, 390]) expect(await onShop(GOOD, width)).toEqual({ failures: [] });
  });
  it('names the part whose template the runtime rejected', async () => {
    const result = await onShop(GOOD.replace('<strong data-cart-field="line-total"></strong>', ''), 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'cartLine', check: 'template' })]));
    expect(result.failures.some(f => f.part === 'cart')).toBe(false);
  });
  it('fails the cart when its checkout action is hidden', async () => {
    const result = await onShop(GOOD.replace('<div data-cart-slot="action"></div>', '<div data-cart-slot="action" style="display:none"></div>'), 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'cart', check: 'checkout-action' })]));
  });
  it('fails a part that scrolls the page sideways on a phone', async () => {
    const result = await onShop(GOOD.replace('<div class="caja">', '<div class="caja" style="width:900px">'), 390);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'checkout', check: 'overflow' })]));
  });
  it('skips the purchase on an empty catalog and keeps the parts (Review Focus 1)', async () => {
    expect(await onShop(GOOD, 1280, [])).toEqual({ failures: [], skipped: 'empty catalog' });
  });
  it('follows a product that needs an option to its page instead of failing the card (Review Focus 2)', async () => {
    const withOptions = { ...ITEM, id: 'collar', name: 'Collar', options: [{ name: 'Talla', values: ['S', 'M'] }], variants: [{ id: 'v1', options: { Talla: 'S' }, amount: 3590, stock: 3 }, { id: 'v2', options: { Talla: 'M' }, amount: 3990, stock: 3 }] };
    const result = await onShop(GOOD, 1280, [withOptions]);
    expect(result.failures.some(f => f.part === 'card')).toBe(false);
  });
  it('checks the product page template: title, price and buy in the first screen, buy adds', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    try {
      const template = '<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></article></template>';
      await page.setContent(productHtml.replace('</body>', `${template}</body>`));
      await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW_QUERY='?id=galleta';${config([ITEM])}` });
      await page.addScriptTag({ content: commerce });
      expect(await inspectProductPage(page, 1280)).toEqual([]);
    } finally { await page.close(); }
  });
});
```

Implementer note: if the item/variant shape above does not match what `commerce.js` reads (check `optionGroups(p)` in `commerce-src/catalog/`), use the shape a passing `source-commerce-*.spec.ts` fixture uses for a product with variants. If the kit `product.html` does not render from `PAGOSYA_PREVIEW_QUERY` under `setContent`, mount it the way `source-commerce-templates.spec.ts` mounts the product page. Change fixtures, never the assertions.

- [ ] **Step 3: Run** `cd apps/api && npx jest src/storefront-source/commerce-surfaces/surface-checks.spec.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `surface-checks.ts`**

```ts
/// <reference lib="dom" />
import type { Page } from 'playwright';
import type { SourceProjectSnapshot } from '../source-project';
import { withVisualSandbox } from '../source-visual-capture';
import { sourceVisualState } from '../source-visual-state';
import { currentSourceRuntime } from '../source-runtime';
import type { SurfacePart } from './surface-parts';

export type SurfaceFailure = { part: SurfacePart; check: string; detail: string };
export type SurfaceCheckResult = { failures: SurfaceFailure[]; skipped?: 'empty catalog' };

const FLAGS: Record<string, SurfacePart> = { productTemplateInvalid: 'card', productPageTemplateInvalid: 'productPage', cartTemplateInvalid: 'cart', cartLineTemplateInvalid: 'cartLine', addedTemplateInvalid: 'added', checkoutTemplateInvalid: 'checkout' };
const ROOTS: Record<SurfacePart, string> = { card: '[data-custom-product]', productPage: '[data-product-page-root]', cart: '[data-cart-panel]', cartLine: '[data-cart-line]', added: '[data-added-field="message"]', checkout: '[data-checkout-root]' };

/** One part's layout in the page: sideways scroll, text over text, unreadable text. Runs in the browser. */
function readPart(selector: string) {
  const roots = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length);
  const overflow = document.documentElement.scrollWidth > innerWidth + 2;
  const texts: Array<{ el: HTMLElement; r: DOMRect }> = [];
  const low: string[] = [];
  const lum = (c: string) => { const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]; const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return { l: 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]), a: m[3] ?? 1 }; };
  const background = (el: HTMLElement | null): string => { for (let n = el; n; n = n.parentElement) { const bg = getComputedStyle(n).backgroundColor; if (lum(bg).a > 0.5) return bg; } return 'rgb(255, 255, 255)'; };
  for (const root of roots) for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const own = Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim());
    if (!own || !el.getClientRects().length) continue;
    const r = el.getBoundingClientRect(); texts.push({ el, r });
    const fg = lum(getComputedStyle(el).color).l, bg = lum(background(el)).l;
    if ((Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05) < 3) low.push((el.textContent || '').trim().slice(0, 40));
  }
  let overlaps = 0;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (w > 4 && h > 4 && w * h > 0.3 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) overlaps++;
  }
  return { present: roots.length > 0, overflow, low: low.slice(0, 3), overlaps };
}
async function layout(page: Page, part: SurfacePart, failures: SurfaceFailure[]) {
  const read = await page.evaluate(readPart, ROOTS[part]);
  if (!read.present) return;
  if (read.overflow) failures.push({ part, check: 'overflow', detail: 'La página se desplaza hacia el costado.' });
  if (read.overlaps) failures.push({ part, check: 'overlap', detail: `${read.overlaps} textos se superponen.` });
  if (read.low.length) failures.push({ part, check: 'contrast', detail: `Texto difícil de leer: «${read.low.join('», «')}».` });
}
const flagFailures = (flags: Record<string, string | undefined>): SurfaceFailure[] =>
  Object.entries(FLAGS).filter(([key]) => flags[key] === 'true').map(([, part]) => ({ part, check: 'template', detail: 'El runtime rechazó la plantilla (faltan espacios obligatorios).' }));
const visible = (page: Page, selector: string, timeout = 2500) => page.locator(selector).first().waitFor({ state: 'visible', timeout }).then(() => true, () => false);
const cartCount = (page: Page) => page.locator('[data-cart-count]').first().innerText().then(t => Number(t.replace(/\D/g, '')) || 0, () => 0);
const openCart = '[data-cart-panel], [data-pagosya-cart]:not([hidden]) .order-items';

export async function inspectShopPage(page: Page, width: number): Promise<SurfaceCheckResult> {
  const failures: SurfaceFailure[] = [...flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset })))];
  if (!await page.locator('[data-pagosya-catalog] .menu-item').count()) return failures.length ? { failures } : { failures, skipped: 'empty catalog' };
  const custom = await page.locator(ROOTS.card).count();
  if (custom) {
    const name = await page.locator(`${ROOTS.card} [data-product-field="name"]`).first().innerText().catch(() => '');
    const price = await page.locator(`${ROOTS.card} [data-product-field="price"]`).first().innerText().catch(() => '');
    if (!name.trim() || !/\d/.test(price)) failures.push({ part: 'card', check: 'data', detail: 'La tarjeta no muestra el nombre o el precio del catálogo.' });
    await layout(page, 'card', failures);
  }
  // Add from the card; a product that needs an option opens its page, which adds from there (Review Focus 2).
  const before = await cartCount(page);
  await page.locator(`${custom ? `${ROOTS.card} [data-product-add]` : '[data-pagosya-catalog] [data-add]'}:not([disabled])`).first().click({ timeout: 3000 }).catch(() => {});
  if (await cartCount(page) === before) {
    for (const select of await page.locator('.product-detail select').all()) await select.selectOption({ index: 1 }).catch(() => {});
    await page.locator('.product-detail [role=radiogroup] button, .product-detail [data-option-value]').first().click({ timeout: 1000 }).catch(() => {});
    await page.locator('.product-detail__buy, [data-product-page-root] [data-add], .product-detail [data-add]').first().click({ timeout: 3000 }).catch(() => {});
  }
  if (await cartCount(page) === before) { failures.push({ part: 'card', check: 'add', detail: 'Agregar al pedido no funcionó desde la tarjeta.' }); return { failures }; }
  // The added notice appears and its button opens the cart.
  const added = await visible(page, ROOTS.added);
  if (added) {
    await layout(page, 'added', failures);
    const notice = page.locator(`${ROOTS.added}`).first().locator('xpath=ancestor-or-self::*[.//button[@data-cart-open]][1]');
    await notice.locator('button[data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
    if (!await visible(page, openCart, 2000)) failures.push({ part: 'added', check: 'open', detail: 'El botón del aviso no abrió el carrito.' });
  }
  if (!await visible(page, openCart, 500)) await page.locator('header [data-cart-open]').first().click({ timeout: 2000 }).catch(() => {});
  if (!await visible(page, openCart)) { failures.push({ part: 'cart', check: 'open', detail: 'El carrito no se abrió.' }); return { failures }; }
  await layout(page, 'cart', failures); await layout(page, 'cartLine', failures);
  // The line shows its name; + changes the total.
  const total = () => page.locator('[data-cart-panel] .order-total, [data-pagosya-cart]:not([hidden]) .order-total').first().innerText().catch(() => '');
  const first = await total();
  await page.locator('[data-cart-panel] .quantity button[data-add], [data-pagosya-cart]:not([hidden]) .quantity button[data-add]').first().click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(150);
  if (await total() === first) failures.push({ part: 'cartLine', check: 'quantity', detail: 'El botón + no cambió el total.' });
  // The cart's action reaches checkout.
  const cartTotal = (await total()).replace(/\s+/g, ' ').trim();
  const action = page.locator('[data-cart-panel] [data-checkout], [data-pagosya-cart]:not([hidden]) [data-checkout]').first();
  if (!await action.isVisible().catch(() => false)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }); return { failures }; }
  await action.click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-checkout]:not([hidden])', 3000)) { failures.push({ part: 'cart', check: 'checkout-action', detail: 'El botón del carrito no llevó al pago.' }); return { failures }; }
  // Checkout: totals match, the payment button is there, the preview payment completes.
  await layout(page, 'checkout', failures);
  const reviewTotal = (await page.locator('[data-pagosya-checkout] .order-total').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  if (reviewTotal !== cartTotal) failures.push({ part: 'checkout', check: 'total', detail: `El total del pago (${reviewTotal}) no coincide con el del carrito (${cartTotal}).` });
  const pay = page.locator('[data-pagosya-checkout] [data-pay]').first();
  if (!await pay.isVisible().catch(() => false)) { failures.push({ part: 'checkout', check: 'pay', detail: 'No se ve el botón de pago.' }); return { failures }; }
  await pay.click({ timeout: 3000 }).catch(() => {});
  await page.locator('[data-pagosya-checkout] [data-finish-demo]').first().click({ timeout: 3000 }).catch(() => {});
  if (!await visible(page, '[data-pagosya-status]:has-text("Prueba completada")', 4000)) failures.push({ part: 'checkout', check: 'complete', detail: 'El pago de prueba no se completó.' });
  return { failures };
}

export async function inspectProductPage(page: Page, width: number): Promise<SurfaceFailure[]> {
  await page.locator('#pagosya-product-title').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
  const failures = flagFailures(await page.evaluate(() => ({ ...document.documentElement.dataset }))).filter(f => f.part === 'productPage');
  if (!await page.locator(ROOTS.productPage).count()) return failures;
  await layout(page, 'productPage', failures);
  if (width >= 1024) {
    const fold = await page.evaluate(() => ['#pagosya-product-title', '.product-detail__pricing', '.product-detail__buy, [data-product-page-root] [data-add]'].every(s => { const el = document.querySelector(s); return !!el && el.getBoundingClientRect().top < innerHeight; }));
    if (!fold) failures.push({ part: 'productPage', check: 'fold', detail: 'Título, precio o botón de compra no están en la primera pantalla.' });
  }
  const before = await cartCount(page);
  await page.locator('.product-detail__buy, [data-product-page-root] [data-add]').first().click({ timeout: 3000 }).catch(() => {});
  if (await cartCount(page) === before) failures.push({ part: 'productPage', check: 'buy', detail: 'El botón de compra no agregó el producto.' });
  return failures;
}

/** The home and product pages at 1280 and 390 in the offline sandbox, templates injected as the store will serve them. */
export async function checkSurfacesOnSnapshot(snapshot: SourceProjectSnapshot, signal: AbortSignal): Promise<SurfaceCheckResult> {
  const runtime = await currentSourceRuntime(snapshot);
  const all: SurfaceFailure[] = []; let skipped: SurfaceCheckResult['skipped'];
  const product = sourceVisualState(runtime, 'product.html', undefined, true);
  for (const width of [1280, 390] as const) {
    signal.throwIfAborted();
    await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, signal, false, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
      const result = await inspectShopPage(page, width);
      all.push(...result.failures); skipped = skipped ?? result.skipped;
      await page.close();
    }, 'reduce');
    if (product.productId && runtime.files.some(f => f.path === 'product.html')) await withVisualSandbox(runtime, product.query, signal, true, async context => {
      const page = await context.newPage();
      page.setDefaultTimeout(7000);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`https://preview.invalid/product.html?id=${encodeURIComponent(product.productId!)}`, { waitUntil: 'load', timeout: 12_000 });
      all.push(...await inspectProductPage(page, width));
      await page.close();
    }, 'reduce');
  }
  const seen = new Set<string>();
  const failures = all.filter(f => { const key = `${f.part}:${f.check}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return skipped && !failures.length ? { failures, skipped } : { failures };
}
```

Implementer notes: confirm `withVisualSandbox(snapshot, query, signal, probe, visit, reducedMotion)` in `source-visual-capture.ts` (4th = `probe`, which lets the product document carry `?id=`; 6th = reduced motion) and adjust argument order if it differs. Confirm the import path of `SourceProjectSnapshot` (grep how `store-controls-guard.ts` imports it). Keep every wait ≤ 4 s.

- [ ] **Step 5: Run** `cd apps/api && npx jest src/storefront-source/commerce-surfaces/surface-checks.spec.ts` — Expected: PASS (7 tests).
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/commerce-surfaces/surface-checks.ts apps/api/src/storefront-source/commerce-surfaces/surface-checks.spec.ts
git commit -m "feat(yapi): a real purchase checks each commerce part — template flags, add, added notice, cart, checkout, product page, layout"
```

---

### Task 5: The model call

**Files:**
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-design.ts`
- Modify: `apps/api/src/storefront-source/source-sep5-call.ts`, `apps/api/src/storefront-source/source-generation-types.ts`
- Test: `apps/api/src/storefront-source/commerce-surfaces/surface-design.spec.ts`

**Interfaces:**
- Consumes: `SURFACE_CONTRACT`, `SURFACE_LABELS`, `SURFACE_PARTS`, `SurfacePart`, `SurfaceTemplate` (Task 2); `SurfaceFailure` (Task 4); `sourceResponseJson` (`../source-response`); `SourceInputImage` (`../source-generation-types`).
- Produces:
  - `SURFACES_SCHEMA`, `SURFACES_TIMEOUT_MS = 150_000`, `SURFACES_MAX_OUTPUT_TOKENS = 16_000`
  - `type SurfacesPromptInput = { storeName: string; kind: string; cartWord?: string; tokens: string; dna: Record<string, unknown>; parts: SurfacePart[]; keep?: SurfaceTemplate[]; repair?: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] }; instruction?: string }`
  - `surfacesPrompt(input: SurfacesPromptInput): string`
  - `type SurfacesCall = (text: string, images: SourceInputImage[]) => Promise<{ body: unknown; used: () => void }>`
  - `parseSurfacesAnswer(body: unknown, parts: SurfacePart[]): SurfaceTemplate[] | null`
  - `sep5Caller(...).surfacesCall(run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }): SurfacesCall`

- [ ] **Step 1: Running jobs check.**
- [ ] **Step 2: Failing test** — `surface-design.spec.ts`. First read `store-controls-design.spec.ts` and copy its fake response-body helper as `reply(obj)`; the test below assumes `reply(obj)` returns a body `sourceResponseJson` turns back into `obj`.

```ts
import { SURFACES_SCHEMA, parseSurfacesAnswer, surfacesPrompt } from './surface-design';
// reply(obj): copied from store-controls-design.spec.ts

const cart = { part: 'cart', html: '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>', css: '.x{}' };

describe('surfaces call (spec 2026-10-15)', () => {
  it('asks only for the requested parts, with their slot contracts and the store language', () => {
    const text = surfacesPrompt({ storeName: 'Raíz Viva', kind: 'general', cartWord: 'Tu pedido', tokens: '--store-accent:#b5462a', dna: { button: 'pill' }, parts: ['cart', 'cartLine'] });
    expect(text).toContain('data-pagosya-cart-template');
    expect(text).toContain('data-cart-field');
    expect(text).not.toContain('data-pagosya-checkout-template');
    expect(text).toContain('«Tu pedido»');
    expect(text).toContain('--store-accent:#b5462a');
    expect(text).toContain('never type a price');
  });
  it('gives a repair the failed checks and the previous template, and lists frozen parts as context only', () => {
    const text = surfacesPrompt({ storeName: 'x', kind: 'general', tokens: '', dna: {}, parts: ['cart'], keep: [{ part: 'card', html: '<template data-pagosya-product-template><i></i></template>', css: '' }], repair: { previous: [cart as any], failures: [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }] } });
    expect(text).toContain('No se ve el botón para continuar al pago.');
    expect(text).toContain('data-cart-slot="lines"');
    expect(text).toContain('Already approved (do not return): card');
  });
  it('parses only requested parts and rejects an unreadable answer', () => {
    expect(parseSurfacesAnswer(reply({ parts: [cart], note: 'ok' }), ['cart'])).toEqual([cart]);
    expect(parseSurfacesAnswer(reply({ parts: [cart], note: 'ok' }), ['checkout'])).toEqual([]);
    expect(parseSurfacesAnswer({ output: [] }, ['cart'])).toBeNull();
    expect(SURFACES_SCHEMA.properties.parts.items.properties.part.enum).toEqual(['card', 'productPage', 'cart', 'cartLine', 'added', 'checkout']);
  });
});
```

- [ ] **Step 3: Run** `cd apps/api && npx jest src/storefront-source/commerce-surfaces/surface-design.spec.ts` — Expected: FAIL.
- [ ] **Step 4: Implement `surface-design.ts`**

```ts
import { sourceResponseJson } from '../source-response';
import type { SourceInputImage } from '../source-generation-types';
import { SURFACE_CONTRACT, SURFACE_LABELS, SURFACE_PARTS, type SurfacePart, type SurfaceTemplate } from './surface-parts';
import type { SurfaceFailure } from './surface-checks';

export const SURFACES_TIMEOUT_MS = 150_000;
export const SURFACES_MAX_OUTPUT_TOKENS = 16_000;
export const SURFACES_SCHEMA = { type: 'object', additionalProperties: false, required: ['parts', 'note'], properties: {
  note: { type: 'string' },
  parts: { type: 'array', maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['part', 'html', 'css'], properties: {
    part: { type: 'string', enum: [...SURFACE_PARTS] }, html: { type: 'string' }, css: { type: 'string' } } } },
} } as const;
export type SurfacesCall = (text: string, images: SourceInputImage[]) => Promise<{ body: unknown; used: () => void }>;
export type SurfacesPromptInput = { storeName: string; kind: string; cartWord?: string; tokens: string; dna: Record<string, unknown>; parts: SurfacePart[]; keep?: SurfaceTemplate[]; repair?: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] }; instruction?: string };

const contract = (part: SurfacePart) => {
  const c = SURFACE_CONTRACT[part];
  return `- ${part} (${SURFACE_LABELS[part]}): one <template ${c.attr}> with ONE root element. Required ${c.slotAttr}: ${c.required.map(s => `"${s}"`).join(', ')}; optional: ${c.optional.map(s => `"${s}"`).join(', ') || 'none'}${c.controls.length ? `; required controls: ${c.controls.map(x => `<${x.tag} ${x.attr}>`).join(', ')}` : ''}.`;
};
const asSource = (templates: SurfaceTemplate[]) => templates.map(t => `${t.html}\n<style>${t.css}</style>`).join('\n');

export function surfacesPrompt(input: SurfacesPromptInput): string {
  return [
    `You design the shopping parts of the store «${input.storeName}» (kind: ${input.kind}) as kit templates, in the store's own visual language: the colours, fonts, button shape and motion of its home page in the screenshots. Make them distinctive, never a generic e-commerce look.`,
    'Rules: the platform fills every slot (names, prices, totals, stock, options, quantity steppers, buy and pay buttons, the payment box). Leave every slot element EMPTY. You own layout, typography and decoration around the slots. You never type a price, total, discount, stock count, review or guarantee; no <script>, no on* attributes, no javascript: links, no @import or external url() in CSS. Use var(--store-*) and var(--brand-*) tokens. Scope CSS to your own class names. Nothing may scroll sideways at 390px; text never overlaps text; keep contrast readable.',
    input.cartWord ? `The cart is called «${input.cartWord}»: use that word in headings and the added notice.` : '',
    `Store tokens: ${input.tokens || 'none'}`,
    `Store DNA (keep consistent): ${JSON.stringify(input.dna).slice(0, 1500)}`,
    'Parts to design now:', ...input.parts.map(contract),
    input.keep?.length ? `Already approved (do not return): ${input.keep.map(t => t.part).join(', ')}. Match their look:\n${asSource(input.keep).slice(0, 12_000)}` : '',
    input.repair ? `Repair: these checks failed in a real browser purchase. Fix exactly these and keep the rest of each design:\n${input.repair.failures.map(f => `- ${f.part} · ${f.check}: ${f.detail}`).join('\n')}\nPrevious versions:\n${asSource(input.repair.previous).slice(0, 16_000)}` : '',
    input.instruction ? `The merchant asked: «${input.instruction.slice(0, 600)}»` : '',
    'Answer JSON: parts (one entry per part to design now: part, html with the single <template>, css) and note (one short Spanish sentence for the merchant).',
  ].filter(Boolean).join('\n\n');
}

export function parseSurfacesAnswer(body: unknown, parts: SurfacePart[]): SurfaceTemplate[] | null {
  let raw: any;
  try { raw = sourceResponseJson(body); } catch { return null; }
  if (!raw || !Array.isArray(raw.parts)) return null;
  return raw.parts.filter((p: any) => p && parts.includes(p.part) && typeof p.html === 'string' && typeof p.css === 'string')
    .map((p: any) => ({ part: p.part as SurfacePart, html: p.html.slice(0, 20_000), css: p.css.slice(0, 12_000) }));
}
```

In `source-generation-types.ts` add `'surfaces'` to the attempt `phase` union. In `source-sep5-call.ts`: add `'surfaces'` to `sep5Call`'s `phase` parameter union; import `SURFACES_MAX_OUTPUT_TOKENS, SURFACES_SCHEMA, SURFACES_TIMEOUT_MS` from `./commerce-surfaces/surface-design`; after `controlsCall` add:

```ts
  /** The commerce surfaces call (spec 2026-10-15): the same metered client; charged only when at least one part is kept (`used`). */
  const surfacesCall = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => async (text: string, attached: SourceInputImage[]) => {
    const { attempt, body } = await sep5Call('surfaces', text, attached, 'storefront_commerce_surfaces', SURFACES_SCHEMA, sideCallDeadlineMs(SURFACES_TIMEOUT_MS, context.chatgptPlan), { signal: run.signal, attempts: run.attempts, maxOutputTokens: SURFACES_MAX_OUTPUT_TOKENS, effort: 'medium' });
    return { body, used: () => { attempt.status = 'COMPLETED'; } };
  };
```
and return it: `return { sep5Call, touchCall, controlsCall, surfacesCall };`.

- [ ] **Step 5: Run** the spec, `npx jest src/storefront-source/source-sep5-call` if a spec exists, and `npx tsc --noEmit -p apps/api/tsconfig.json` — Expected: PASS, no type errors.
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/commerce-surfaces/surface-design.ts apps/api/src/storefront-source/commerce-surfaces/surface-design.spec.ts apps/api/src/storefront-source/source-sep5-call.ts apps/api/src/storefront-source/source-generation-types.ts
git commit -m "feat(yapi): the commerce surfaces call — part contracts, store language, repair context and a strict schema"
```

---

### Task 6: The stage — design, validate, check, repair, fall back

**Files:**
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-stage.ts`
- Test: `apps/api/src/storefront-source/commerce-surfaces/surface-stage.spec.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5; `storeTokens(files)` from `../store-controls-design`; `readConfigFile` (import it from the same module `store-controls-design.ts` imports it from).
- Produces:
  - `type SurfacePartResult = { part: SurfacePart; status: 'passed' | 'repaired' | 'fallback'; failed?: string }`
  - `type SurfacesOutcome = { file?: string; report: SurfacePartResult[]; note: string; retry: Array<{ label: string; value: string }>; failed?: string }`
  - `runCommerceSurfaces(deps: { files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: string; cartWord?: string; parts: SurfacePart[]; keep?: SurfaceTemplate[]; instruction?: string; signal: AbortSignal; call: SurfacesCall; check: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SurfaceCheckResult>; capture: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SourceInputImage[]> }): Promise<SurfacesOutcome>`
  - `SURFACES_ALL_NOTE`, `SURFACES_FAILED_NOTE`, `surfacesFallbackNote(parts)`, `SURFACE_RETRY_LABEL(part)`, `SURFACE_RETRY_INSTRUCTION(part)`

- [ ] **Step 1: Running jobs check.**
- [ ] **Step 2: Failing test** — `surface-stage.spec.ts` (use the same `reply(obj)` helper as Task 5):

```ts
import { readTemplatesFile } from './surface-parts';
import { runCommerceSurfaces, SURFACES_ALL_NOTE, SURFACES_FAILED_NOTE } from './surface-stage';
// reply(obj): copied from store-controls-design.spec.ts

const T = {
  cart: '<template data-pagosya-cart-template><div><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>',
  added: '<template data-pagosya-added-template><div><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>',
};
const answer = (parts: Array<{ part: string; html: string }>) => reply({ parts: parts.map(p => ({ css: '', ...p })), note: 'Diseñé tu carrito.' });
const base = { files: [{ path: 'index.html', content: '<html><body></body></html>' }], brief: {}, storeName: 'Raíz Viva', kind: 'general', signal: new AbortController().signal, capture: async () => [] };

describe('runCommerceSurfaces (spec 2026-10-15)', () => {
  it('keeps every part that passes first time and bills the call', async () => {
    const used = jest.fn();
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'], call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used }), check: async () => ({ failures: [] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'passed' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['cart', 'added']);
    expect(out.note).toBe(SURFACES_ALL_NOTE);
    expect(used).toHaveBeenCalled();
  });
  it('repairs only the failing part and freezes the one that passed', async () => {
    const calls: string[] = []; let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async text => { calls.push(text); round++; return { body: answer(round === 1 ? [{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }] : [{ part: 'cart', html: T.cart.replace('<div>', '<div class="b">') }]), used: () => {} }; },
      check: async files => ({ failures: files.find(f => f.path === 'commerce-templates.html')!.content.includes('class="b"') ? [] : [{ part: 'cart', check: 'checkout-action', detail: 'No se ve el botón para continuar al pago.' }] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }, { part: 'added', status: 'passed' }]);
    expect(calls[1]).toContain('No se ve el botón para continuar al pago.');
    expect(calls[1]).toContain('Already approved (do not return): added');
  });
  it('drops a part that still fails after two repairs, keeps the rest and offers to retry it', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart', 'added'],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }, { part: 'added', html: T.added }]), used: () => {} }),
      check: async () => ({ failures: [{ part: 'cart', check: 'checkout-action', detail: 'x' }] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'fallback', failed: 'checkout-action' }, { part: 'added', status: 'passed' }]);
    expect(readTemplatesFile(out.file!).map(t => t.part)).toEqual(['added']);
    expect(out.note).toBe('El carrito no pasó la prueba de compra, así que usa el diseño estándar por ahora.');
    expect(out.retry).toEqual([{ label: 'Reintentar el carrito', value: 'Rediseña el carrito de mi tienda.' }]);
  });
  it('treats a statically invalid part like any failure and repairs it', async () => {
    let round = 0;
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'],
      call: async () => ({ body: answer([{ part: 'cart', html: round++ ? T.cart : T.cart.replace('<div data-cart-slot="total"></div>', '') }]), used: () => {} }),
      check: async () => ({ failures: [] }) });
    expect(out.report).toEqual([{ part: 'cart', status: 'repaired' }]);
  });
  it('fails whole without a file when the call throws', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], call: async () => { throw new Error('timeout'); }, check: async () => ({ failures: [] }) });
    expect(out).toEqual({ report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: 'timeout' });
  });
  it('keeps the store’s approved parts when only one part is requested', async () => {
    const out = await runCommerceSurfaces({ ...base, parts: ['cart'], keep: [{ part: 'added', html: T.added, css: '' }],
      call: async () => ({ body: answer([{ part: 'cart', html: T.cart }]), used: () => {} }), check: async () => ({ failures: [] }) });
    expect(readTemplatesFile(out.file!).map(t => t.part).sort()).toEqual(['added', 'cart']);
  });
});
```

- [ ] **Step 3: Run** `cd apps/api && npx jest src/storefront-source/commerce-surfaces/surface-stage.spec.ts` — Expected: FAIL.
- [ ] **Step 4: Implement `surface-stage.ts`**

```ts
import type { SourceProjectFileDto } from '../dto/save-source-project.dto';
import type { SourceInputImage } from '../source-generation-types';
import { storeTokens } from '../store-controls-design';
// readConfigFile: same import as store-controls-design.ts uses
import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile, validateSurfaceTemplate, type SurfacePart, type SurfaceTemplate } from './surface-parts';
import type { SurfaceCheckResult, SurfaceFailure } from './surface-checks';
import { parseSurfacesAnswer, surfacesPrompt, type SurfacesCall } from './surface-design';

export type SurfacePartResult = { part: SurfacePart; status: 'passed' | 'repaired' | 'fallback'; failed?: string };
export type SurfacesOutcome = { file?: string; report: SurfacePartResult[]; note: string; retry: Array<{ label: string; value: string }>; failed?: string };
export const SURFACES_ALL_NOTE = 'Diseñé también tu carrito, tarjetas de producto, página de producto y pago.';
export const SURFACES_FAILED_NOTE = 'Tu tienda está guardada. No pude terminar el diseño de carrito y pago; puedes pedírmelo de nuevo.';
const SUBJECT: Record<SurfacePart, [string, string]> = { card: ['Las tarjetas de producto no pasaron', 'usan'], productPage: ['La página de producto no pasó', 'usa'], cart: ['El carrito no pasó', 'usa'], cartLine: ['Las líneas del carrito no pasaron', 'usan'], added: ['El aviso al agregar no pasó', 'usa'], checkout: ['El pago no pasó', 'usa'] };
const THE: Record<SurfacePart, string> = { card: 'las tarjetas de producto', productPage: 'la página de producto', cart: 'el carrito', cartLine: 'las líneas del carrito', added: 'el aviso al agregar', checkout: 'el pago' };
export function surfacesFallbackNote(parts: SurfacePart[]): string {
  if (parts.length === 1) return `${SUBJECT[parts[0]][0]} la prueba de compra, así que ${SUBJECT[parts[0]][1]} el diseño estándar por ahora.`;
  const names = parts.map(p => THE[p]);
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)} no pasaron la prueba de compra, así que usan el diseño estándar por ahora.`.replace(/^./, c => c.toUpperCase());
}
export const SURFACE_RETRY_LABEL = (part: SurfacePart) => `Reintentar ${THE[part]}`;
export const SURFACE_RETRY_INSTRUCTION = (part: SurfacePart) => `Rediseña ${THE[part]} de mi tienda.`;
const REPAIR_ROUNDS = 2;

export async function runCommerceSurfaces(deps: {
  files: SourceProjectFileDto[]; brief: unknown; storeName: string; kind: string; cartWord?: string; parts: SurfacePart[]; keep?: SurfaceTemplate[]; instruction?: string; signal: AbortSignal;
  call: SurfacesCall; check: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SurfaceCheckResult>; capture: (files: SourceProjectFileDto[], signal: AbortSignal) => Promise<SourceInputImage[]>;
}): Promise<SurfacesOutcome> {
  const keep = (deps.keep ?? []).filter(t => !deps.parts.includes(t.part));
  const passed = new Map<SurfacePart, { t: SurfaceTemplate; repaired: boolean }>();
  const lastFailure = new Map<SurfacePart, string>();
  const billed: Array<() => void> = [];
  let pending: SurfacePart[] = [...deps.parts];
  let repair: { previous: SurfaceTemplate[]; failures: SurfaceFailure[] } | undefined;
  try {
    const images = await deps.capture(deps.files, deps.signal);
    const dna = (readConfigFile(deps.files).dna as Record<string, unknown> | undefined) ?? {};
    for (let round = 0; round <= REPAIR_ROUNDS && pending.length; round++) {
      deps.signal.throwIfAborted();
      const approved = [...keep, ...[...passed.values()].map(p => p.t)];
      const text = surfacesPrompt({ storeName: deps.storeName, kind: deps.kind, cartWord: deps.cartWord, tokens: storeTokens(deps.files), dna, parts: pending, keep: approved, ...(repair ? { repair } : {}), ...(deps.instruction ? { instruction: deps.instruction } : {}) });
      const { body, used } = await deps.call(text, images);
      billed.push(used);
      const answered = parseSurfacesAnswer(body, pending) ?? [];
      const failures: SurfaceFailure[] = pending.filter(p => !answered.some(t => t.part === p)).map(part => ({ part, check: 'missing', detail: 'No llegó la plantilla.' }));
      const candidates = answered.filter(t => {
        const reasons = validateSurfaceTemplate(t);
        if (reasons.length) failures.push({ part: t.part, check: 'static', detail: reasons.join(' ') });
        return !reasons.length;
      });
      if (candidates.length) {
        const file = composeTemplatesFile([...approved, ...candidates]);
        const result = await deps.check([...deps.files.filter(f => f.path !== COMMERCE_TEMPLATES_FILE), { path: COMMERCE_TEMPLATES_FILE, content: file }], deps.signal);
        failures.push(...result.failures.filter(f => candidates.some(t => t.part === f.part)));
        for (const t of candidates) if (!failures.some(f => f.part === t.part)) passed.set(t.part, { t, repaired: round > 0 });
      }
      for (const f of failures) lastFailure.set(f.part, f.check);
      pending = pending.filter(p => !passed.has(p));
      repair = { previous: answered.filter(t => pending.includes(t.part)), failures: failures.filter(f => pending.includes(f.part)) };
    }
  } catch (error) {
    deps.signal.throwIfAborted();
    return { report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: ((error as Error)?.message || 'error').slice(0, 300) };
  }
  if (passed.size) for (const used of billed) used();
  const report: SurfacePartResult[] = deps.parts.map(part => passed.has(part)
    ? { part, status: passed.get(part)!.repaired ? 'repaired' : 'passed' }
    : { part, status: 'fallback', failed: lastFailure.get(part) ?? 'missing' });
  const fallback = report.filter(r => r.status === 'fallback').map(r => r.part);
  const kept = [...keep, ...deps.parts.filter(p => passed.has(p)).map(p => passed.get(p)!.t)];
  return {
    ...(kept.length ? { file: composeTemplatesFile(kept) } : {}),
    report,
    note: fallback.length ? surfacesFallbackNote(fallback) : SURFACES_ALL_NOTE,
    retry: fallback.map(part => ({ label: SURFACE_RETRY_LABEL(part), value: SURFACE_RETRY_INSTRUCTION(part) })),
  };
}
```

Note: the `deps.signal.throwIfAborted()` in `catch` re-throws a cancelled run (the merchant pressed «Cancelar pedido»), as the controls stage does; only non-abort errors become the "stage failed" outcome.

- [ ] **Step 5: Run** the spec — Expected: PASS (6 tests).
- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/commerce-surfaces/surface-stage.ts apps/api/src/storefront-source/commerce-surfaces/surface-stage.spec.ts
git commit -m "feat(yapi): the commerce surfaces stage — validate, buy in the browser, repair twice, fall back per part"
```

---

### Task 7: Wire the stage into builds and chat requests

**Files:**
- Create: `apps/api/src/storefront-source/commerce-surfaces/surface-request.ts` (+ `surface-request.spec.ts`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (flags near line 500; save near lines 1376–1404)
- Modify: `apps/api/src/storefront-source/source-sep5-review.ts` (`runChatKitTouch`, line ~172)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (reply near line 540)
- Test: `surface-request.spec.ts`, `apps/api/src/storefront-source/source-chat.service.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–6; `sep5Caller(...).surfacesCall` (Task 5); `captureControlsShots(snapshot, signal)` from `./store-controls-guard`.
- Produces:
  - `requestedSurfaceParts(instruction: string): SurfacePart[]`
  - `surfacesAfterStage(input: { previousFiles: Array<{ path: string; content: string }>; outcome: SurfacesOutcome | null; fresh: boolean }): { file?: string }`
  - receipt fields `surfacesNote?: string`, `surfacesRetry?: Array<{ label: string; value: string }>`

- [ ] **Step 1: Running jobs check.**
- [ ] **Step 2: Failing tests** — `surface-request.spec.ts`:

```ts
import { requestedSurfaceParts, surfacesAfterStage } from './surface-request';

describe('requestedSurfaceParts', () => {
  it('reads the part the merchant named', () => {
    expect(requestedSurfaceParts('haz el carrito más bonito')).toEqual(['cart', 'cartLine']);
    expect(requestedSurfaceParts('cambia las tarjetas de producto')).toEqual(['card']);
    expect(requestedSurfaceParts('mejora la página de producto')).toEqual(['productPage']);
    expect(requestedSurfaceParts('quiero un checkout más elegante')).toEqual(['checkout']);
    expect(requestedSurfaceParts('el aviso al agregar es feo')).toEqual(['added']);
    expect(requestedSurfaceParts('Rediseña el carrito de mi tienda.')).toEqual(['cart', 'cartLine']);
  });
  it('leaves the header cart control and unrelated requests alone (Review Focus 3)', () => {
    expect(requestedSurfaceParts('haz el ícono del carrito más grande')).toEqual([]);
    expect(requestedSurfaceParts('el botón del carrito en el encabezado')).toEqual([]);
    expect(requestedSurfaceParts('cambia el título de la portada')).toEqual([]);
  });
});

const OLD = [{ path: 'commerce-templates.html', content: '<!--part:cart-->old<!--/part:cart-->' }];
describe('surfacesAfterStage (Review Focus 5)', () => {
  it('a fresh build carries only what this stage kept, never the previous store’s parts', () => {
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { report: [], note: 'x', retry: [], failed: 'timeout' }, fresh: true })).toEqual({});
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { file: 'new', report: [], note: '', retry: [] }, fresh: true })).toEqual({ file: 'new' });
  });
  it('an edit keeps the store’s file unless a part request kept a new one', () => {
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: null, fresh: false })).toEqual({ file: OLD[0].content });
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { report: [], note: 'x', retry: [], failed: 'timeout' }, fresh: false })).toEqual({ file: OLD[0].content });
    expect(surfacesAfterStage({ previousFiles: OLD, outcome: { file: 'new', report: [], note: '', retry: [] }, fresh: false })).toEqual({ file: 'new' });
  });
});
```

- [ ] **Step 3: Run** `cd apps/api && npx jest src/storefront-source/commerce-surfaces/surface-request.spec.ts` — Expected: FAIL.

- [ ] **Step 4: Implement `surface-request.ts`**

```ts
import { COMMERCE_TEMPLATES_FILE, type SurfacePart } from './surface-parts';
import type { SurfacesOutcome } from './surface-stage';

const own = (text: string) => (text.split('Pedido actual del comercio:').at(-1) ?? text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** The header's cart control (icon, button, badge, placement) is a controls request (store-controls-design.ts), never a part. */
const HEADER_CART = /\b(?:icono|boton|simbolo|insignia|contador)\s+(?:del?\s+)?carrito\b|\bcarrito\s+(?:del?\s+|de\s+la\s+|en\s+(?:el|la)\s+)?(?:encabezado|header|menu|barra|navegacion|cabecera)\b/g;

/** Spec 2026-10-15: the parts a chat request names; a request for the cart redesigns its panel and its lines together. */
export function requestedSurfaceParts(instruction: string): SurfacePart[] {
  const t = own(instruction).replace(HEADER_CART, ' ');
  const parts: SurfacePart[] = [];
  if (/\btarjetas?\s+de(?:l)?\s+productos?\b|\btarjetas?\s+del\s+catalogo\b|\bproduct\s+cards?\b/.test(t)) parts.push('card');
  if (/\bpagina\s+de(?:l)?\s+productos?\b|\bficha\b|\bproduct\s+page\b/.test(t)) parts.push('productPage');
  if (/\b(?:carrito|canasta|bolsa\s+de\s+compras)\b/.test(t)) parts.push('cart', 'cartLine');
  if (/\baviso\b.{0,30}\bagreg|\bal\s+agregar\b|\bmensaje\s+de\s+(?:agregado|anadido)\b/.test(t)) parts.push('added');
  if (/\bcheckout\b|\bpagina\s+de\s+pago\b|\bpantalla\s+de\s+pago\b|\bel\s+pago\b|\bcaja\s+de\s+pago\b/.test(t)) parts.push('checkout');
  return parts;
}

/** Which commerce-templates.html the save carries (spec 2026-10-15, Review Focus 5). */
export function surfacesAfterStage(input: { previousFiles: Array<{ path: string; content: string }>; outcome: SurfacesOutcome | null; fresh: boolean }): { file?: string } {
  if (input.outcome?.file) return { file: input.outcome.file };
  if (input.fresh) return {};
  const previous = input.previousFiles.find(f => f.path === COMMERCE_TEMPLATES_FILE)?.content;
  return previous ? { file: previous } : {};
}
```

Run `npx jest src/storefront-source/commerce-surfaces/surface-request.spec.ts` — Expected: PASS.

- [ ] **Step 5: Wire the generation service** (`source-generation.service.ts`; read lines 490–505 and 1370–1420 first):

(a) Next to `controlsRequest` (line ~500):
```ts
    // Spec 2026-10-15 free commerce surfaces: YAPI designs the six shopping parts on new stores and redesigns, one part on request.
    const surfacesOn = this.config.get<boolean>('app.yapiCommerceSurfaces') === true && !useNext && sitePurpose === 'shop' && !claude;
    const surfacesRequest = surfacesOn && !creative ? requestedSurfaceParts(dto.instruction) : [];
    const surfacesParts: SurfacePart[] = surfacesOn && creative ? [...SURFACE_PARTS] : surfacesRequest;
```

(b) Make `surfacesCall` available where the save happens: `touchCall` (from `sep5Caller` at line ~702) is used at line ~1376, so add `surfacesCall` to that same destructuring: `const { sep5Call, touchCall, controlsCall, surfacesCall } = sep5Caller({ … });`. If TypeScript reports `surfacesCall` out of scope at the save, read how `touchCall` reaches line 1376 and follow the same path.

(c) Replace `await progress?.('saving');` + `let saveInput = await assembleSave();` (line ~1403) with:
```ts
    await progress?.(surfacesParts.length ? 'commerce' : 'saving');
    let saveInput = await assembleSave();
```

(d) After the controls guard line (`if (controlsFresh && readControls(saveInput.files)) saveInput = …;`) insert:
```ts
    let surfacesOutcome: SurfacesOutcome | null = null;
    if (surfacesParts.length) {
      const remaining = started + runTimeout - Date.now() - 60_000;
      if (remaining >= 60_000) {
        const surfacesSignal = AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
        const keep = creative ? [] : readTemplatesFile(previousFiles.find(f => f.path === COMMERCE_TEMPLATES_FILE)?.content ?? '');
        surfacesOutcome = await runCommerceSurfaces({
          files: saveInput.files, brief: dto.brief, storeName: (data as { storeName?: string }).storeName || owner.slug, kind: kind ?? 'general', cartWord: voiceCartWord(voice.sheet),
          parts: surfacesParts, keep, ...(creative ? {} : { instruction: merchantWords }), signal: surfacesSignal, call: surfacesCall({ signal: surfacesSignal, attempts }),
          check: (files, checkSignal) => checkSurfacesOnSnapshot({ brief: dto.brief, files } as unknown as SourceProjectSnapshot, checkSignal),
          capture: (files, captureSignal) => captureControlsShots({ brief: dto.brief, files } as unknown as SourceProjectSnapshot, captureSignal),
        });
        const surfacesAttempt = attempts.filter(a => a.phase === 'surfaces').at(-1);
        if (surfacesAttempt) (surfacesAttempt.diagnostics ??= []).push({ tool: 'commerce_surfaces', digest: '', durationMs: surfacesAttempt.durationMs, output: JSON.stringify({ report: surfacesOutcome.report, failed: surfacesOutcome.failed }) });
        this.logger.log(JSON.stringify({ event: 'commerce_surfaces', generationId: run.id, parts: surfacesParts, report: surfacesOutcome.report, failed: surfacesOutcome.failed }));
        // The progress step ticks each part (spec: «Diseñando carrito, productos y pago», per-part tick).
        for (const result of surfacesOutcome.report) await progress?.detail?.({ label: `${SURFACE_LABELS[result.part]}: ${result.status === 'fallback' ? 'diseño estándar' : 'listo'}` });
      } else {
        surfacesOutcome = { report: [], note: SURFACES_FAILED_NOTE, retry: [], failed: 'deadline' };
      }
      await progress?.('saving');
    }
    {
      const chosen = surfacesAfterStage({ previousFiles, outcome: surfacesOutcome, fresh: creative });
      const rest = saveInput.files.filter(f => f.path !== COMMERCE_TEMPLATES_FILE);
      saveInput = { ...saveInput, files: chosen.file ? [...rest, { path: COMMERCE_TEMPLATES_FILE, content: chosen.file }] : rest };
    }
    if (surfacesOutcome) { receipt.surfacesNote = surfacesOutcome.note; if (surfacesOutcome.retry.length) receipt.surfacesRetry = surfacesOutcome.retry; }
```
Note: the block `{ const chosen … }` runs on every save (also with the flag off): with no outcome and an edit it carries the store's file unchanged; with the flag off on a fresh build it drops a previous file, which can only exist if the flag was on before — that is the spec's "off = today's behaviour".

(e) Add `surfacesNote?: string; surfacesRetry?: Array<{ label: string; value: string }>` where the receipt's `controlsNote` field is typed (grep `controlsNote` in `source-generation-types.ts` / the receipt type and add beside it). `receipt` is declared before (c) with `const`; its type must allow these optional fields.

(f) Imports in `source-generation.service.ts`:
```ts
import { COMMERCE_TEMPLATES_FILE, SURFACE_LABELS, SURFACE_PARTS, readTemplatesFile, type SurfacePart } from './commerce-surfaces/surface-parts';
import { runCommerceSurfaces, SURFACES_FAILED_NOTE, type SurfacesOutcome } from './commerce-surfaces/surface-stage';
import { requestedSurfaceParts, surfacesAfterStage } from './commerce-surfaces/surface-request';
import { checkSurfacesOnSnapshot } from './commerce-surfaces/surface-checks';
```
plus `captureControlsShots` from `./store-controls-guard` and `SourceProjectSnapshot` if not already imported.

- [ ] **Step 6: Skip the kit touch on a surfaces request.** In `source-sep5-review.ts`: add `skip?: boolean` to the `ChatKitTouchContext` type and `&& !context.skip` to the `if` at line ~172. In the generation service: `await runChatKitTouch({ facts, live, touchCall, assembleSave, skip: surfacesRequest.length > 0 });`.

- [ ] **Step 7: Chat reply.** In `source-chat.service.ts`, next to `controlsReport` (line ~540):
```ts
    // Spec 2026-10-15 free commerce surfaces: what YAPI designed, or which part fell back, with a retry per part.
    const surfacesReport = revision.generation?.surfacesNote ? `${revision.generation.surfacesNote}\n\n` : '';
```
Insert `${surfacesReport}` right after `${controlsReport}` in `content`, and add to `metadata`:
```ts
      ...(revision.generation?.surfacesRetry?.length ? { clarification: { options: revision.generation.surfacesRetry } } : {}),
```
The Studio already renders `metadata.clarification.options` as buttons that send their `value` (`apps/merchant-studio/src/source-studio.ts:768`); no Studio change. In `source-chat.service.spec.ts`, copy the existing `controlsNote` reply test and assert a revision with `generation: { surfacesNote: 'El carrito no pasó la prueba de compra, así que usa el diseño estándar por ahora.', surfacesRetry: [{ label: 'Reintentar el carrito', value: 'Rediseña el carrito de mi tienda.' }] }` puts the note in `content` and the option in `metadata.clarification.options`.

- [ ] **Step 8: Run**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
npx jest --maxWorkers=3 src/storefront-source/commerce-surfaces src/storefront-source/source-chat.service.spec.ts src/storefront-source/source-sep5-review src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-save-assembly
```
Expected: no type errors; PASS except the pre-existing failures named in Global Constraints. If anything else fails, compare with the change removed before deciding it is pre-existing.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/storefront-source/commerce-surfaces/surface-request.ts apps/api/src/storefront-source/commerce-surfaces/surface-request.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-types.ts apps/api/src/storefront-source/source-sep5-review.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat.service.spec.ts
git commit -m "feat(yapi): new stores, redesigns and part requests design the commerce surfaces before the save; the chat says what fell back"
```

---

### Task 8: Live checks on dev (controller, in the browser)

**Files:** none (verification). Requires the owner's `pnpm dev` restarted once after Task 3 (so `YAPI_COMMERCE_SURFACES=1` is read), and `cd apps/merchant-dashboard && pnpm run build:studio` (the Studio is served pre-built) followed by a hard reload (⌘⇧R).

- [ ] **Step 1:** Running jobs check; confirm port 3001's process started after the last API commit: `ps -o lstart= -p $(lsof -t -iTCP:3001 -sTCP:LISTEN)`.
- [ ] **Step 2: New store.** Dashboard (seed demo account) → «Crear otra tienda» → walkthrough with 2 products → «Crear mi tienda»; pick a style card if offered. Expected: the progress shows «Diseñando carrito, productos y pago»; the chat says `SURFACES_ALL_NOTE` or a fallback note with «Reintentar …» buttons. In the preview the catalog card, product page, cart, added notice and checkout differ from the kit defaults; buy through to «Prueba completada» at desktop and 390 px. Read the generation's `attempts` for the `commerce_surfaces` diagnostic.
- [ ] **Step 3: Redesign** Raíz Viva via «Rediseñar sitio». Same expectations.
- [ ] **Step 4: Part request** «haz el carrito más bonito» on the new store. Expected: only the cart and cart line blocks of `commerce-templates.html` change between the two revisions; the other blocks are byte-identical.
- [ ] **Step 5:** Report to the owner with screenshots; record failures as follow-ups rather than patching silently.
