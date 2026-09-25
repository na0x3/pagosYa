# Kit templates (T1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A store can supply its own markup for the product page, the cart panel, each cart line, the "added" notice and the checkout review; the kit fills its money-bearing and interactive pieces into named slots.

**Architecture:** The kit keeps rendering exactly what it renders today, then — only when a valid template exists — moves its own rendered pieces into the template's slots by class (the pattern `renderCart` already uses for the checkout review and `openProduct` for the buy box). Money, stock, options, delivery fields and checkout handoff code is untouched. An invalid template is ignored, the default markup stays, and an `<html>` flag lets the Studio checks fail publishing with a plain-Spanish reason.

**Tech Stack:** Vanilla JS runtime (`packages/storefront-kit/kit/commerce.js`), React helpers (`packages/storefront-kit/kit/ui.tsx`), Jest + JSDOM specs in `apps/api`, Playwright in `apps/merchant-studio`.

**Spec:** `docs/superpowers/specs/2026-09-25-kit-templates-design.md` (parent: `docs/superpowers/specs/2026-09-25-store-themes-design.md`).

## Global Constraints

- Branch `feature/yapi-unique-stores`. Commit only your own paths with `git commit -m "…" -- <paths>`. Never push, merge, reset, stash or `git add -A`.
- Do not touch any database (no prisma migrate/db push/reset, no psql). No paid AI calls; tests mock AI.
- Filling uses `textContent` and kit-built nodes only; never insert template- or merchant-supplied HTML strings.
- A template can place a price or total; it never produces one. Every slot is emptied before the kit fills it.
- A missing or invalid template never blocks a purchase: the kit's default markup renders instead.
- Stores without templates must render exactly as before (the existing `source-commerce-*.spec.ts` suites are the regression net and must stay green).
- Invalid flags on `<html>`: `data-product-page-template-invalid`, `data-cart-template-invalid`, `data-cart-line-template-invalid`, `data-added-template-invalid`, `data-review-template-invalid` (dataset keys `productPageTemplateInvalid`, `cartTemplateInvalid`, `cartLineTemplateInvalid`, `addedTemplateInvalid`, `reviewTemplateInvalid`).
- Merchant-facing copy is Spanish (Bolivia, "tú").
- **Spec refinement (recorded here, owner to note):** the review template owns the review's layout through `summary` and `fields` slots only. The checkout page's title and back button stay kit-rendered, because they live outside the element the kit re-renders on every cart change.

## Review Focus

1. **React-rendered templates.** React's client renderer puts `<template>` children on the element, not in `.content`, so those nodes sit in the document: the kit must still read them, and cart-trigger lookups must ignore buttons inside any `<template>`. (Tests in Task 1 and Task 3.)
2. **A template that pre-fills a price, total or quantity** ("Bs 10", "Total: 0") must show the kit's real values, never the authored text. (Tests in Task 1, Task 2, Task 4 and Task 5.)
3. **Empty cart,** with and without an authored `empty` slot: no empty total or disabled checkout floating in a themed panel. (Test in Task 2.)
4. **Stock limit inside a templated line:** the "+" stays disabled at the limit because the kit's own controls are moved, not rebuilt. (Test in Task 1.)
5. **Product page edge cases:** a full page with no photos (the kit's summary/buybox split must not run on a templated page), and an omitted `info`/`delivery` slot (purchase terms still shown after the buy slot). (Tests in Task 5.)

---

## File Structure

- Modify `packages/storefront-kit/kit/commerce.js`: `kitTemplate()` helper; line, cart, added, review and product-page application functions; the `data-remove-line` action; drawer chrome rules.
- Create `apps/api/src/storefront-source/source-commerce-templates.spec.ts`: JSDOM specs for every template.
- Modify `apps/merchant-studio/src/source-shopping-probe.ts`: failed checks for the five invalid flags.
- Create `apps/merchant-studio/tests/kit-templates.spec.ts`: real-browser flow at 1280 and 390, broken-template check, screenshots.
- Modify `packages/storefront-kit/kit/ui.tsx`: `ProductPageTemplate`, `CartTemplate`, `CartLineTemplate`, `AddedTemplate`, `ReviewTemplate`, `KitSlot`.
- Modify `apps/api/src/storefront-source/source-generation.service.ts`: prompt lines documenting the optional templates.
- Modify `apps/api/src/storefront-source/source-next.spec.ts`: a templated React store validates and compiles.

Shared JSDOM boot for the new spec (Task 1 creates it; later tasks add tests to the same file):

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** T1: store-authored templates for the product page, cart, cart lines, added notice and checkout review. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEMS = [
  { id: 'lamp', name: 'Lámpara Luna', amount: 42000, currency: 'BOB', stock: 2, imageUrls: ['https://cdn.test/lamp.jpg'], description: 'Luz cálida' },
  { id: 'desk', name: 'Mesa de roble', amount: 90000, currency: 'BOB', stock: 5, imageUrls: [] },
];
const HEADER = '<header><button data-cart-open>Pedido (<span data-cart-count>0</span>)</button></header><section data-pagosya-catalog></section>';
const SLOTS = '<section data-pagosya-cart hidden></section><p data-pagosya-status></p>';
const opened: any[] = [];
afterEach(() => { while (opened.length) opened.pop().close(); });

function boot(templates: string, options: { cart?: Array<{ id: string; quantity: number }>; items?: unknown[]; body?: string } = {}) {
  const errors: Error[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM(`<html><head></head><body>${options.body ?? HEADER + SLOTS}${templates}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Luz', items: options.items ?? ITEMS, categories: [] };
  w.PAGOSYA_CONFIG = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const $ = (selector: string) => w.document.querySelector(selector);
  const $$ = (selector: string) => [...w.document.querySelectorAll(selector)];
  const flag = (name: string) => w.document.documentElement.dataset[name];
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  return { w, $, $$, flag, tick, errors };
}
```

---

### Task 1: `kitTemplate()` and the cart line template

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (helper above `function renderCart()`; the row loop and the `el.innerHTML = \`<ul class="order-items">…` line inside `renderCart`; the global click handler line `if (button.hasAttribute("data-remove"))`)
- Create: `apps/api/src/storefront-source/source-commerce-templates.spec.ts`

**Interfaces:**
- Produces: `kitTemplate(name: string, flag: string, isValid: (root: Element) => boolean): { make(): Element } | null` — reads `template[data-pagosya-<name>-template]` at call time (React-safe), sets `document.documentElement.dataset[flag] = 'true'` when present but invalid, returns `null` when absent or invalid.
- Produces: `imgField(root, selector)` — true when the selector is absent or matches an `IMG`.
- Produces: the `data-remove-line="<cart id>"` action (removes the whole line).

- [ ] **Step 1: Write the failing tests**

Create the spec file with the shared boot above, then:

```ts
const LINE = `<template data-pagosya-cart-line-template><li class="mi-linea"><img data-cart-field="photo" alt=""><h4 data-cart-field="name">Nombre falso</h4><p data-cart-field="option"></p><p data-cart-field="unit"></p><p data-cart-field="stock"></p><strong data-cart-field="line-total">Bs 1,00</strong><div data-cart-field="quantity">9</div><button data-cart-field="remove">Quitar</button></li></template>`;

describe('cart line template', () => {
  it('fills each line from the kit: name, real line total, photo, stock, the kit quantity controls', async () => {
    const shop = boot(LINE, { cart: [{ id: 'lamp', quantity: 2 }] });
    await shop.tick();
    const line = shop.$('[data-pagosya-cart] .mi-linea')!;
    expect(line.querySelector('[data-cart-field="name"]').textContent).toBe('Lámpara Luna');
    expect(line.querySelector('[data-cart-field="line-total"]').textContent).toMatch(/840/);
    expect(line.querySelector('[data-cart-field="line-total"]').textContent).not.toContain('1,00');
    expect(line.querySelector('[data-cart-field="photo"]').getAttribute('src')).toBe('https://cdn.test/lamp.jpg');
    expect(line.querySelector('[data-cart-field="stock"]').textContent).toBe('Últimas 2 unidades');
    expect(line.querySelector('[data-cart-field="option"]').hidden).toBe(true);
    const quantity = line.querySelector('[data-cart-field="quantity"]');
    expect(quantity.textContent).not.toContain('9');
    expect(quantity.querySelector('output').textContent).toBe('2');
    // Stock is 2 and the line already holds 2: the kit's own "+" stays disabled inside the template.
    expect(quantity.querySelector('[data-add="lamp"]').disabled).toBe(true);
    expect(shop.flag('cartLineTemplateInvalid')).toBeUndefined();
  });

  it('removes the whole line with the template remove button, and − still removes one unit', async () => {
    const shop = boot(LINE, { cart: [{ id: 'lamp', quantity: 2 }, { id: 'desk', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-pagosya-cart] [data-remove="lamp"]').click();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="lamp"] output').textContent).toBe('1');
    shop.$('[data-pagosya-cart] [data-remove-line="lamp"]').click();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="lamp"]')).toBeNull();
    expect(shop.$('[data-pagosya-cart] [data-cart-line="desk"]')).not.toBeNull();
    expect(shop.$('[data-cart-count]').textContent).toBe('1');
  });

  it('is ignored when a required field is missing: default lines render and the invalid flag is set', async () => {
    const shop = boot('<template data-pagosya-cart-line-template><li><h4 data-cart-field="name"></h4></li></template>', { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    expect(shop.$('[data-pagosya-cart] li.order-item .order-item__head strong').textContent).toBe('Lámpara Luna');
    expect(shop.flag('cartLineTemplateInvalid')).toBe('true');
  });

  it('reads a React-rendered template whose children sit on the element instead of its content', async () => {
    const shop = boot('', { cart: [{ id: 'lamp', quantity: 1 }], body: HEADER + SLOTS + '<template data-pagosya-cart-line-template></template>' });
    const tpl = shop.$('template[data-pagosya-cart-line-template]')!;
    const li = shop.w.document.createElement('li');
    li.className = 'mi-linea';
    li.innerHTML = '<span data-cart-field="name"></span><b data-cart-field="line-total"></b><div data-cart-field="quantity"></div>';
    tpl.appendChild(li);
    shop.$('[data-cart-open]').click();
    await shop.tick();
    expect(shop.$('.cart-drawer .mi-linea [data-cart-field="name"]').textContent).toBe('Lámpara Luna');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts`
Expected: FAIL — `.mi-linea` is not found (the kit ignores the template today).

- [ ] **Step 3: Implement**

In `commerce.js`, directly above `  function renderCart() {`, add:

```js
  /* T1 templates: a store may author the markup of a kit surface. Read at use time (React may render the
   * <template> after this script, and puts its children on the element instead of .content). */
  function kitTemplate(name, flag, isValid) {
    const template = document.querySelector(`template[data-pagosya-${name}-template]`);
    if (!template) return null;
    const source = template.content && template.content.children.length ? template.content : template;
    const root = source.firstElementChild;
    if (source.children.length !== 1 || !root || !isValid(root)) { document.documentElement.dataset[flag] = 'true'; return null; }
    delete document.documentElement.dataset[flag];
    return { make: () => root.cloneNode(true) };
  }
  const imgField = (root, selector) => { const node = root.querySelector(selector); return !node || node.tagName === 'IMG'; };
  const cartLineTemplate = () => kitTemplate('cart-line', 'cartLineTemplateInvalid', root =>
    ['name', 'line-total', 'quantity'].every(field => root.querySelector(`[data-cart-field="${field}"]`)) && imgField(root, '[data-cart-field="photo"]'));
  function applyLineTemplate(el, views, template) {
    [...el.querySelectorAll('.order-items > li.order-item')].forEach((li, index) => {
      const view = views[index];
      if (!view) return;
      const root = template.make();
      const field = name => root.querySelector(`[data-cart-field="${name}"]`);
      const text = (name, value) => { const node = field(name); if (!node) return; node.textContent = value; node.hidden = !value; };
      root.classList.add('order-item');
      root.dataset.cartLine = view.id;
      text('name', view.p.name);
      text('line-total', money(view.amount * view.quantity, view.p.currency));
      text('option', view.option);
      text('unit', view.unit);
      text('stock', view.stock);
      const photo = field('photo');
      if (photo) {
        photo.hidden = !view.image;
        if (view.image) { photo.src = view.image; photo.alt = ''; photo.loading = 'lazy'; } else photo.removeAttribute('src');
      }
      field('quantity').replaceChildren(li.querySelector('.quantity'));
      const remove = field('remove');
      if (remove) { remove.setAttribute('type', 'button'); remove.setAttribute('data-remove-line', view.id); remove.setAttribute('aria-label', `Quitar ${view.name} del pedido`); }
      li.replaceWith(root);
    });
  }
```

Inside `renderCart`, next to `const rows = [];` add `const lineViews = [];`. Right after the existing `rows.push(\`<li class="order-item"…\`);` line add:

```js
      lineViews.push({ id, p, name, amount, quantity, image, option,
        unit: quantity > 1 || saved ? `${money(amount, p.currency)} c/u${saved ? ` · antes ${money(listUnit, p.currency)}` : ''}` : '',
        stock: Number.isInteger(p.stock) && p.stock > 0 && p.stock <= 5 ? (p.stock === 1 ? 'Última unidad' : `Últimas ${p.stock} unidades`) : '' });
```

Directly after the line that starts `      el.innerHTML = \`<ul class="order-items">` add:

```js
      const lineTemplate = cartLineTemplate();
      if (lineTemplate) applyLineTemplate(el, lineViews, lineTemplate);
```

In the global click handler, directly above `if (button.hasAttribute("data-remove")) {`, add:

```js
    if (button.hasAttribute("data-remove-line")) { cart.delete(button.dataset.removeLine); renderCart(); message("Pedido actualizado."); return; }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce`
Expected: PASS (new tests and every existing `source-commerce-*` suite).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-commerce-templates.spec.ts
git commit -m "feat(kit): stores can author the cart line (template[data-pagosya-cart-line-template]); the kit fills name, real totals, photo, stock and its own quantity controls, and removes whole lines" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-templates.spec.ts
```

---

### Task 2: Cart panel template

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (`renderCart` right after the Task 1 lines; `openCart`; the kit style string next to the `.cart-drawer>.cart-drawer__continue{…}` rule)
- Test: `apps/api/src/storefront-source/source-commerce-templates.spec.ts`

**Interfaces:**
- Consumes: `kitTemplate`, `applyLineTemplate` (Task 1).
- Produces: `applyCartTemplate(el, empty, template)`; `cartDrawer` gets `data-template` while a valid cart template is in use; the rendered template root carries `data-cart-panel`.

- [ ] **Step 1: Write the failing tests**

```ts
const CART = `<template data-pagosya-cart-template><div class="mi-carrito"><header><h2>Tu canasta</h2><button data-cart-close>Cerrar</button></header><div data-cart-slot="lines"></div><div data-cart-slot="savings"></div><div data-cart-slot="total">Total: Bs 0</div><div data-cart-slot="note"></div><div data-cart-slot="action"></div><div data-cart-slot="empty" class="vacio">Tu canasta está esperando 🐾</div><div data-cart-slot="policies"></div><button data-cart-close class="seguir">Seguir mirando</button></div></template>`;

describe('cart panel template', () => {
  it('lays the kit cart into the authored panel and hides the kit drawer chrome', async () => {
    const shop = boot(CART, { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-cart-open]').click();
    const panel = shop.$('.cart-drawer [data-cart-panel]')!;
    expect(panel.classList.contains('mi-carrito')).toBe(true);
    expect(panel.querySelector('[data-cart-slot="lines"] .order-items li')).not.toBeNull();
    expect(panel.querySelector('[data-cart-slot="total"]').textContent).not.toContain('Bs 0');
    expect(panel.querySelector('[data-cart-slot="total"] .order-total')).not.toBeNull();
    expect(panel.querySelector('[data-cart-slot="action"] [data-checkout]')).not.toBeNull();
    expect(panel.querySelector('[data-cart-slot="empty"]').hidden).toBe(true);
    expect(shop.$('.cart-drawer').hasAttribute('data-template')).toBe(true);
    expect(shop.w.document.activeElement.closest('[data-cart-panel]')).not.toBeNull();
    panel.querySelector('.seguir').click();
    expect(shop.$('.cart-drawer').hasAttribute('open')).toBe(false);
  });

  it('shows only the authored empty slot while the cart is empty', async () => {
    const shop = boot(CART);
    await shop.tick();
    shop.$('[data-cart-open]').click();
    const panel = shop.$('.cart-drawer [data-cart-panel]')!;
    expect(panel.querySelector('[data-cart-slot="empty"]').hidden).toBe(false);
    for (const slot of ['lines', 'total', 'action', 'savings', 'note']) expect(panel.querySelector(`[data-cart-slot="${slot}"]`).hidden).toBe(true);
  });

  it('keeps the kit empty text in the lines slot when the template has no empty slot', async () => {
    const shop = boot(CART.replace('<div data-cart-slot="empty" class="vacio">Tu canasta está esperando 🐾</div>', ''));
    await shop.tick();
    shop.$('[data-cart-open]').click();
    expect(shop.$('.cart-drawer [data-cart-slot="lines"] .order-empty')).not.toBeNull();
  });

  it('is ignored without a total slot or a close button', async () => {
    const shop = boot(CART.replace('<div data-cart-slot="total">Total: Bs 0</div>', ''), { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    shop.$('[data-cart-open]').click();
    expect(shop.$('.cart-drawer [data-cart-panel]')).toBeNull();
    expect(shop.$('.cart-drawer .order-total')).not.toBeNull();
    expect(shop.flag('cartTemplateInvalid')).toBe('true');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts -t "cart panel template"`
Expected: FAIL — `[data-cart-panel]` not found.

- [ ] **Step 3: Implement**

Add below `applyLineTemplate`:

```js
  const cartTemplate = () => kitTemplate('cart', 'cartTemplateInvalid', root =>
    ['lines', 'total', 'action'].every(slot => root.querySelector(`[data-cart-slot="${slot}"]`)) && root.querySelector('button[data-cart-close]'));
  const CART_PARTS = { lines: '.order-items', suggestions: '.order-recommendations', savings: '.order-savings', total: '.order-total', action: '[data-checkout]', note: '.order-note' };
  function applyCartTemplate(el, empty, template) {
    const root = template.make();
    root.setAttribute('data-cart-panel', '');
    const slot = name => root.querySelector(`[data-cart-slot="${name}"]`);
    root.querySelectorAll('[data-cart-slot]').forEach(node => { if (node.dataset.cartSlot !== 'empty') node.replaceChildren(); });
    let anchor = slot('action');
    for (const part of [...el.children]) {
      const name = Object.keys(CART_PARTS).find(key => part.matches(CART_PARTS[key]));
      const target = name && slot(name);
      if (target) target.append(part);
      else { anchor.after(part); anchor = part; }
    }
    const policies = slot('policies');
    if (policies) policies.innerHTML = policyLinks(['returns', 'delivery', 'terms', 'privacy']);
    const emptySlot = slot('empty');
    if (emptySlot) {
      emptySlot.hidden = !empty;
      for (const name of ['lines', 'total', 'action', 'savings', 'suggestions', 'note']) { const node = slot(name); if (node) node.hidden = empty; }
    }
    el.replaceChildren(root);
  }
```

In `renderCart`, directly after the Task 1 lines, add:

```js
      const panelTemplate = review ? null : cartTemplate();
      if (panelTemplate) applyCartTemplate(el, !count, panelTemplate);
```

In `openCart(trigger, keyboard)`, directly after `cartDrawer.querySelector('.cart-drawer__body').append(drawerSlot);` add:

```js
    const templated = Boolean(drawerSlot.querySelector('[data-cart-panel]'));
    cartDrawer.toggleAttribute('data-template', templated);
    if (templated) { cartDrawer.removeAttribute('aria-labelledby'); cartDrawer.setAttribute('aria-label', 'Tu pedido'); }
    else { cartDrawer.removeAttribute('aria-label'); cartDrawer.setAttribute('aria-labelledby', 'cart-drawer-title'); }
```

`renderCart()` runs later in `openCart` and re-applies the template, so the check above only sees a panel when an earlier render already applied it. To make the first open correct, move the new block to directly after the existing `cartDrawer.showModal(); renderCart();` line instead, keeping its content unchanged.

Replace the last line of `openCart`, `cartDrawer.querySelector('[data-cart-close]').focus();`, with:

```js
    (cartDrawer.querySelector('[data-cart-panel] [data-cart-close]') || cartDrawer.querySelector('[data-cart-close]')).focus();
```

In the kit style string, right after the `.cart-drawer>.cart-drawer__continue{…}` rule, add:

```css
.cart-drawer[data-template]>:is(.cart-drawer__header,.cart-drawer__continue,.pagosya-policies){display:none!important}.cart-drawer[data-template] .cart-drawer__body{padding:0}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): stores can author the cart panel (template[data-pagosya-cart-template]); the kit places lines, total, checkout, savings, note and policies into its slots and shows an authored empty state" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-templates.spec.ts
```

---

### Task 3: "Added" notice template

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (`cartTriggers`; `addedFeedback`)
- Test: `apps/api/src/storefront-source/source-commerce-templates.spec.ts`

**Interfaces:**
- Consumes: `kitTemplate`, `imgField` (Task 1).
- Produces: `addedTemplate()`; `cartTriggers()` ignores elements inside a `<template>`; a templated notice carries `data-template`.

- [ ] **Step 1: Write the failing tests**

```ts
const ADDED = `<template data-pagosya-added-template><div class="mi-aviso"><img data-added-field="photo" alt=""><p><b data-added-field="name"></b> <span data-added-field="message"></span></p><button data-cart-open>Ver mi canasta</button></div></template>`;

describe('added notice template', () => {
  it('fills the authored notice with the product added', async () => {
    const shop = boot(ADDED);
    await shop.tick();
    shop.$('[data-pagosya-catalog] [data-add="lamp"]').click();
    const notice = shop.$('.cart-added')!;
    expect(notice.querySelector('.mi-aviso')).not.toBeNull();
    expect(notice.querySelector('[data-added-field="name"]').textContent).toBe('Lámpara Luna');
    expect(notice.querySelector('[data-added-field="message"]').textContent).toBe('Lámpara Luna añadido a tu pedido.');
    expect(notice.querySelector('[data-added-field="photo"]').getAttribute('src')).toBe('https://cdn.test/lamp.jpg');
    expect(notice.dataset.visible).toBe('true');
    notice.querySelector('[data-cart-open]').click();
    expect(shop.$('.cart-drawer').hasAttribute('open')).toBe(true);
  });

  it('keeps the kit notice when the template has no cart button', async () => {
    const shop = boot(ADDED.replace('<button data-cart-open>Ver mi canasta</button>', ''));
    await shop.tick();
    shop.$('[data-pagosya-catalog] [data-add="lamp"]').click();
    expect(shop.$('.cart-added span').textContent).toBe('Lámpara Luna añadido a tu pedido.');
    expect(shop.flag('addedTemplateInvalid')).toBe('true');
  });

  it('reads a React-rendered notice template and never counts its button as a live cart trigger', async () => {
    const shop = boot('', { body: HEADER + SLOTS + '<template data-pagosya-added-template></template>' });
    const tpl = shop.$('template[data-pagosya-added-template]')!;
    const div = shop.w.document.createElement('div');
    div.innerHTML = '<span data-added-field="message"></span><button data-cart-open>Ver</button>';
    tpl.appendChild(div);
    await shop.tick();
    shop.$('[data-pagosya-catalog] [data-add="lamp"]').click();
    expect(shop.$('.cart-added [data-added-field="message"]').textContent).toBe('Lámpara Luna añadido a tu pedido.');
    // The live notice holds a copy; the button left inside the <template> must not be treated as a trigger.
    const live = shop.$$('[data-cart-open]').filter((el: any) => !el.closest('template'));
    expect(live.length).toBe(2); // the header button and the notice copy
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts -t "added notice template"`
Expected: FAIL — `.mi-aviso` not found.

- [ ] **Step 3: Implement**

Change `cartTriggers` to skip template contents:

```js
  const cartTriggers = () => [...new Set([...document.querySelectorAll(CART_TRIGGERS), ...[...document.querySelectorAll('[data-cart-count]')].map(count => count.closest('a,button')).filter(Boolean)])].filter(el => !el.closest('template'));
```

Add next to the other template readers:

```js
  const addedTemplate = () => kitTemplate('added', 'addedTemplateInvalid', root =>
    root.querySelector('[data-added-field="message"]') && root.querySelector('button[data-cart-open]') && imgField(root, '[data-added-field="photo"]'));
```

In `addedFeedback(product, button, keyboard)`, replace the line
`addedNotice.querySelector('span').textContent = \`${product.name} añadido a tu pedido.\`;` with:

```js
    const template = addedTemplate();
    if (template && !addedNotice.hasAttribute('data-template')) { addedNotice.replaceChildren(template.make()); addedNotice.setAttribute('data-template', ''); }
    const text = `${product.name} añadido a tu pedido.`;
    if (addedNotice.hasAttribute('data-template')) {
      addedNotice.querySelector('[data-added-field="message"]').textContent = text;
      const name = addedNotice.querySelector('[data-added-field="name"]');
      if (name) name.textContent = product.name;
      const photo = addedNotice.querySelector('[data-added-field="photo"]'), image = galleryImages(product)[0];
      if (photo) { photo.hidden = !image; if (image) { photo.src = image; photo.alt = ''; } else photo.removeAttribute('src'); }
    } else addedNotice.querySelector('span').textContent = text;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): stores can author the added notice (template[data-pagosya-added-template]); cart buttons inside a template are never live triggers" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-templates.spec.ts
```

---

### Task 4: Checkout review template

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (the `if (review) { const summary = document.createElement('aside') …` block in `renderCart`)
- Test: `apps/api/src/storefront-source/source-commerce-templates.spec.ts`

**Interfaces:**
- Consumes: `kitTemplate` (Task 1).
- Produces: `reviewTemplate()`; a templated review element carries `data-review-template`.

- [ ] **Step 1: Write the failing tests**

```ts
const REVIEW = `<template data-pagosya-review-template><div class="mi-revision"><div class="columna"><h2>Tu canasta</h2><div data-review-slot="summary">Total: Bs 0</div></div><div data-review-slot="fields"></div></div></template>`;

async function openReview(shop: ReturnType<typeof boot>) {
  shop.w.location.hash = 'checkout';
  shop.w.dispatchEvent(new shop.w.HashChangeEvent('hashchange'));
  await shop.tick();
}

describe('checkout review template', () => {
  it('puts lines and totals in the summary slot and every field plus the pay action in the fields slot', async () => {
    const shop = boot(REVIEW, { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    await openReview(shop);
    const review = shop.$('[data-checkout-review]')!;
    const summary = review.querySelector('[data-review-slot="summary"]');
    const fields = review.querySelector('[data-review-slot="fields"]');
    expect(review.querySelector('.mi-revision')).not.toBeNull();
    expect(summary.textContent).not.toContain('Bs 0');
    expect(summary.querySelector('.order-items li')).not.toBeNull();
    expect(summary.querySelector('.order-total')).not.toBeNull();
    expect(fields.querySelector('[data-pay],[data-finish-demo]')).not.toBeNull();
    expect(fields.querySelector('[data-pagosya-checkout-status]')).not.toBeNull();
    // The pay button still finds its panel: fields stay inside [data-pagosya-cart].
    expect(fields.querySelector('.checkout-button').closest('[data-pagosya-cart]')).toBe(review);
    expect(review.querySelector('.checkout-review__summary')).toBeNull();
  });

  it('falls back to the kit review without a fields slot', async () => {
    const shop = boot(REVIEW.replace('<div data-review-slot="fields"></div>', ''), { cart: [{ id: 'lamp', quantity: 1 }] });
    await shop.tick();
    await openReview(shop);
    expect(shop.$('[data-checkout-review] .checkout-review__summary')).not.toBeNull();
    expect(shop.flag('reviewTemplateInvalid')).toBe('true');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts -t "checkout review template"`
Expected: FAIL — `.mi-revision` not found. If `[data-checkout-review]` itself is missing, the hash route did not open the review: open it the way `source-commerce-pages.spec.ts` or `source-commerce-surfaces.spec.ts` reaches the review (search them for `checkout-review`) and keep the same assertions.

- [ ] **Step 3: Implement**

Add next to the other template readers:

```js
  const reviewTemplate = () => kitTemplate('review', 'reviewTemplateInvalid', root =>
    root.querySelector('[data-review-slot="summary"]') && root.querySelector('[data-review-slot="fields"]'));
```

In `renderCart`, the block currently reads:

```js
      if (review) {
        const summary = document.createElement('aside'); summary.className = 'checkout-review__summary';
        …
        el.classList.add('checkout-review');
      }
```

Replace its first line `if (review) {` with:

```js
      const reviewLayout = review ? reviewTemplate() : null;
      if (reviewLayout) {
        const root = reviewLayout.make();
        const summary = root.querySelector('[data-review-slot="summary"]'), fields = root.querySelector('[data-review-slot="fields"]');
        summary.replaceChildren(); fields.replaceChildren();
        for (const child of [...el.children]) (child.matches('.order-items,.order-recommendations,.order-savings,.order-total,.order-note') ? summary : fields).append(child);
        const feedback = document.createElement('p');
        feedback.setAttribute('data-pagosya-checkout-status', ''); feedback.hidden = true;
        fields.append(feedback);
        el.replaceChildren(root);
        el.classList.add('checkout-review'); el.setAttribute('data-review-template', '');
      } else if (review) {
```

(The rest of the original block stays as the `else if` body.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): stores can author the checkout review layout (template[data-pagosya-review-template]); summary and fields stay inside the cart panel the pay action reads" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-templates.spec.ts
```

---

### Task 5: Product page template

**Files:**
- Modify: `packages/storefront-kit/kit/commerce.js` (`openProduct`: right after the `detail.innerHTML = …` assignment; the `if (fullProductPage && !images.length) {` split)
- Test: `apps/api/src/storefront-source/source-commerce-templates.spec.ts`

**Interfaces:**
- Consumes: `kitTemplate` (Task 1).
- Produces: `applyProductPageTemplate()`; a templated product view carries `data-page-template` on `detail`.

- [ ] **Step 1: Write the failing tests**

```ts
const PAGE = `<template data-pagosya-product-page-template><article class="mi-ficha"><div class="foto" data-product-slot="gallery"></div><div class="texto"><p data-product-slot="category"></p><div data-product-slot="title">Título falso</div><div data-product-slot="pricing">Bs 1</div><div data-product-slot="description"></div><div data-product-slot="buy"></div></div></article></template>`;

async function openLamp(shop: ReturnType<typeof boot>) {
  (shop.$('[data-pagosya-catalog] [data-product="lamp"]') || shop.$('[data-pagosya-catalog] .menu-item__details')).click();
  await shop.tick();
}

describe('product page template', () => {
  it('places the kit pieces in the authored layout; purchase terms still show when info and delivery are omitted', async () => {
    const shop = boot(PAGE);
    await shop.tick();
    await openLamp(shop);
    const page = shop.$('[data-pagosya-product] .mi-ficha')!;
    expect(page.querySelector('[data-product-slot="gallery"] .product-detail__gallery')).not.toBeNull();
    expect(page.querySelector('[data-product-slot="title"] #pagosya-product-title').textContent).toBe('Lámpara Luna');
    expect(page.querySelector('[data-product-slot="pricing"]').textContent).not.toContain('Bs 1');
    expect(page.querySelector('[data-product-slot="pricing"] .product-detail__pricing')).not.toBeNull();
    expect(page.querySelector('[data-product-slot="description"]').textContent).toContain('Luz cálida');
    expect(page.querySelector('[data-product-slot="buy"] [data-add="lamp"]')).not.toBeNull();
    const followers = [];
    for (let next = page.querySelector('[data-product-slot="buy"]').nextElementSibling; next; next = next.nextElementSibling) followers.push(next);
    expect(followers.some((node: any) => node.matches('.product-detail__assurances,.product-tabs,[role=tabpanel],.product-detail__facts,.product-delivery-list'))).toBe(true);
    expect(shop.$('[data-pagosya-product] .product-detail__layout')).toBeNull();
    expect(shop.$('[data-pagosya-product] [data-product-close]')).not.toBeNull();
  });

  it('adds to the cart from the templated buy slot', async () => {
    const shop = boot(PAGE);
    await shop.tick();
    await openLamp(shop);
    shop.$('[data-pagosya-product] [data-product-slot="buy"] [data-add="lamp"]').click();
    expect(shop.$('[data-cart-count]').textContent).toBe('1');
  });

  it('keeps the kit page without a buy slot and flags it', async () => {
    const shop = boot(PAGE.replace('<div data-product-slot="buy"></div>', ''));
    await shop.tick();
    await openLamp(shop);
    expect(shop.$('[data-pagosya-product] .product-detail__layout')).not.toBeNull();
    expect(shop.flag('productPageTemplateInvalid')).toBe('true');
  });
});
```

Add one more test for the full page without photos, modelled on how `apps/api/src/storefront-source/source-commerce-pages.spec.ts` boots a full product page (it sets up `product.html?id=…` and a `[data-pagosya-product-page]` mount — reuse its boot options verbatim). Boot it with `PAGE` and product `desk` (no `imageUrls`) and assert:

```ts
    expect(shop.$('[data-pagosya-product] .mi-ficha')).not.toBeNull();
    expect(shop.$('[data-pagosya-product] [data-split]')).toBeNull();
    expect(shop.$('[data-pagosya-product] [data-product-slot="title"] h1')).not.toBeNull();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts -t "product page template"`
Expected: FAIL — `.mi-ficha` not found.

- [ ] **Step 3: Implement**

Add next to the other template readers:

```js
  const productPageTemplate = () => kitTemplate('product-page', 'productPageTemplateInvalid', root =>
    ['gallery', 'title', 'pricing', 'buy'].every(slot => root.querySelector(`[data-product-slot="${slot}"]`)));
  // A piece goes to the first slot whose selector it matches; "buy" is last because its "p" catches the sold-out note.
  const PRODUCT_PARTS = [
    ['gallery', '.product-detail__gallery'], ['breadcrumb', '.product-detail__breadcrumb'], ['category', '.product-detail__eyebrow'],
    ['title', '#pagosya-product-title'], ['rating', '.product-detail__rating'], ['pricing', '.product-detail__pricing'],
    ['description', '.product-detail__intro'], ['highlights', '.product-detail__highlights,.product-detail__chips'],
    ['delivery', '.product-detail__assurances'], ['info', '.product-tabs,[role=tabpanel],.product-detail__facts,.product-delivery-list'],
    ['bundles', '.product-detail__bundles,.product-detail__bundle-links'], ['related', '.product-detail__related'], ['reviews', '.product-detail__reviews'],
    ['buy', '.product-detail__options,.product-detail__box,.product-detail__purchase,.product-detail__buy,.product-detail__status,p'],
  ];
  // Purchase terms and anything unrecognised are never lost: they follow the buy slot when the template has no place for them.
  const PRODUCT_DROPPABLE = new Set(['breadcrumb', 'category', 'rating', 'description', 'highlights', 'bundles', 'related', 'reviews']);
  function applyProductPageTemplate() {
    const template = productPageTemplate();
    const layout = detail.querySelector(':scope > .product-detail__layout');
    if (!template || !layout) return;
    const copy = layout.querySelector(':scope > .product-detail__copy');
    const pieces = [...[...layout.children].filter(child => child !== copy), ...(copy ? [...copy.children] : []),
      ...[...detail.children].filter(child => child.matches('.product-detail__bundles,.product-detail__bundle-links,.product-detail__related,.product-detail__reviews'))];
    const root = template.make();
    const slot = name => root.querySelector(`[data-product-slot="${name}"]`);
    root.querySelectorAll('[data-product-slot]').forEach(node => node.replaceChildren());
    const followers = [];
    for (const piece of pieces) {
      const name = PRODUCT_PARTS.find(([, selector]) => piece.matches(selector))?.[0];
      const target = name && slot(name);
      if (target) target.append(piece);
      else if (name && PRODUCT_DROPPABLE.has(name)) piece.remove();
      else followers.push(piece);
    }
    if (followers.length) slot('buy').after(...followers);
    layout.replaceWith(root);
    detail.setAttribute('data-page-template', '');
  }
```

In `openProduct`, directly after the statement that assigns `detail.innerHTML = \`${fullProductPage ? '' : '<button type="button" class="product-detail__close"…` add:

```js
    detail.removeAttribute('data-page-template');
    applyProductPageTemplate();
```

Change the split condition `if (fullProductPage && !images.length) {` to:

```js
    if (fullProductPage && !images.length && !detail.hasAttribute('data-page-template')) {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-templates.spec.ts src/storefront-source/source-commerce`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(kit): stores can author the product page (template[data-pagosya-product-page-template]); the kit places gallery, title, price and buy controls into its slots and keeps purchase terms after the buy slot" -- packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-templates.spec.ts
```

---

### Task 6: Studio checks fail on invalid templates; real-browser proof

**Files:**
- Modify: `apps/merchant-studio/src/source-shopping-probe.ts` (next to the `productTemplateInvalid` warning, ~line 151)
- Create: `apps/merchant-studio/tests/kit-templates.spec.ts`

**Interfaces:**
- Consumes: the five invalid flags (Tasks 1–5).
- Produces: a failed check labelled `Plantillas de compra` with a plain-Spanish detail per flag.

- [ ] **Step 1: Write the failing tests**

Create `apps/merchant-studio/tests/kit-templates.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const SHOTS = '../../tmp/kit-templates-shots';
mkdirSync(SHOTS, { recursive: true });
const TEMPLATES = `
<template data-pagosya-cart-template><div class="canasta"><header class="canasta__head"><h2>Tu canasta 🐾</h2><button data-cart-close aria-label="Cerrar">×</button></header><div data-cart-slot="lines"></div><div data-cart-slot="savings"></div><div data-cart-slot="total"></div><div data-cart-slot="note"></div><div data-cart-slot="action"></div><div data-cart-slot="empty"><p>Tu canasta está vacía.</p></div><button data-cart-close class="canasta__seguir">Seguir mirando</button></div></template>
<template data-pagosya-cart-line-template><li class="linea"><img data-cart-field="photo" alt=""><div><h3 data-cart-field="name"></h3><p data-cart-field="unit"></p><div data-cart-field="quantity"></div></div><strong data-cart-field="line-total"></strong><button data-cart-field="remove">Quitar</button></li></template>
<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver canasta</button></div></template>
<template data-pagosya-review-template><div class="revision"><section><h2>Tu canasta</h2><div data-review-slot="summary"></div></section><section data-review-slot="fields"></section></div></template>
<template data-pagosya-product-page-template><article class="ficha"><div data-product-slot="gallery"></div><div><p data-product-slot="category"></p><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></div></article></template>`;
const CSS = `body{margin:0;font:16px/1.5 Georgia,serif;background:#fbf6ee;color:#2a1d12}.canasta{padding:28px;display:grid;gap:16px}.canasta__head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px dashed #c9853a}.linea{display:grid;grid-template-columns:64px 1fr auto;gap:12px;align-items:center}.linea img{width:64px;height:64px;object-fit:cover;border-radius:50%}.ficha{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:32px}@media(max-width:700px){.ficha{grid-template-columns:1fr;padding:16px}}.revision{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:700px){.revision{grid-template-columns:1fr}}`;
const CONFIG = 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'huellitas', data: { storeName: 'Huellitas', locations: [], categories: [], items: [{ id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], description: 'Horneadas sin conservantes' }] } }) + ';';
const page = (templates: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><header><button type="button" data-cart-open>Mi canasta <b data-cart-count>0</b></button></header><main><h1>Huellitas</h1><section data-pagosya-catalog></section></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p>${templates}</body></html>`;

async function mount(browserPage: any, templates: string) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart: [{ id: 'galleta', quantity: 2 }] }); document.body.append(frame);
  }, { commerce, html: page(templates), config: CONFIG });
  return browserPage.frameLocator('iframe');
}

for (const width of [1280, 390]) test(`a fully templated store shops end to end at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  const shop = await mount(browserPage, TEMPLATES);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await expect(shop.getByRole('heading', { name: 'Tu canasta 🐾' })).toBeVisible();
  await expect(shop.locator('.linea [data-cart-field="name"]')).toHaveText('Galletas de pollo');
  await expect(shop.locator('[data-cart-slot="total"] .order-total')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/cart-${width}.png` });
  await shop.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(shop.locator('.revision [data-review-slot="summary"] .order-total')).toBeVisible();
  await expect(shop.locator('.revision [data-review-slot="fields"] .checkout-button')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/review-${width}.png` });
  expect(await shop.locator('html').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a broken cart template falls back to the kit cart and the checks fail publishing', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<div data-cart-slot="total"></div>', '');
  const shop = await mount(browserPage, broken);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await expect(shop.locator('.cart-drawer .order-total')).toBeVisible();
  const results = await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    return checkSourceWebsite({ schemaVersion: 1, brief: { sitePurpose: 'shop' }, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] } as any);
  }, { commerce, html: page(broken), config: CONFIG });
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ label: 'Plantillas de compra', status: 'failed', detail: expect.stringContaining('carrito') })]));
});
```

- [ ] **Step 2: Run the tests to verify the check test fails**

Run: `cd apps/merchant-studio && pnpm exec playwright test tests/kit-templates.spec.ts --workers=2`
Expected: the two end-to-end tests PASS (Tasks 1–5 are in); the broken-template test FAILS — no `Plantillas de compra` row.

- [ ] **Step 3: Implement**

In `apps/merchant-studio/src/source-shopping-probe.ts`, directly after the line with `if (document.documentElement.dataset.productTemplateInvalid === 'true') warn('Composición de productos', …);`, add (`add` is the `(label, ok, detail)` helper defined at the top of the probe):

```ts
      const TEMPLATE_FAILURES: Array<[string, string]> = [
        ['productPageTemplateInvalid', 'La plantilla de la página de producto no tiene galería, título, precio o compra; se mostró la página básica.'],
        ['cartTemplateInvalid', 'La plantilla del carrito no tiene las líneas, el total, el botón para continuar o el botón para cerrar; se mostró el carrito básico.'],
        ['cartLineTemplateInvalid', 'La plantilla de las líneas del carrito no tiene nombre, total o cantidad; se mostraron las líneas básicas.'],
        ['addedTemplateInvalid', 'El aviso de producto añadido no tiene mensaje o botón para ver el pedido; se mostró el aviso básico.'],
        ['reviewTemplateInvalid', 'La plantilla de revisión del pedido no tiene resumen o campos; se mostró la revisión básica.'],
      ];
      for (const [flag, detail] of TEMPLATE_FAILURES) if (document.documentElement.dataset[flag] === 'true') add('Plantillas de compra', false, detail);
```

If `add` is not in scope at that line, declare the same helper there: `const add = (label: string, ok: boolean, detail?: string) => results.push({ label, status: ok ? 'passed' : 'failed', ...(detail ? { detail } : {}) });`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/merchant-studio && pnpm exec playwright test tests/kit-templates.spec.ts tests/source-checks.spec.ts tests/checkout-layout.spec.ts --workers=2`
Expected: PASS. Open `tmp/kit-templates-shots/*.png` and look at them; fix anything that overlaps or overflows before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/tests/kit-templates.spec.ts
git commit -m "feat(studio): an invalid kit template fails the checks as 'Plantillas de compra' in plain Spanish; a fully templated store shops end to end at 1280 and 390" -- apps/merchant-studio/src/source-shopping-probe.ts apps/merchant-studio/tests/kit-templates.spec.ts
```

---

### Task 7: React helpers, prompt and validator

**Files:**
- Modify: `packages/storefront-kit/kit/ui.tsx` (after `CommerceSlots`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (the prompt line that begins `'You may author <template data-pagosya-product-template>`)
- Modify: `apps/api/src/storefront-source/source-next.spec.ts`

**Interfaces:**
- Produces (React, from `@pagosya/ui` / `lib/ui.tsx`):
  - `ProductPageTemplate({ children }: { children: ReactNode })`, `CartTemplate`, `CartLineTemplate`, `AddedTemplate`, `ReviewTemplate` — each renders the matching `<template data-pagosya-…-template>`.
  - `KitSlot({ kind, name, as, className, children }: { kind: 'product' | 'cart' | 'line' | 'added' | 'review'; name: string; as?: keyof JSX.IntrinsicElements; className?: string; children?: ReactNode })` — renders `<as data-product-slot|data-cart-slot|data-cart-field|data-added-field|data-review-slot={name}>`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/storefront-source/source-next.spec.ts` (`nextStoreFiles`, `validateNextSources` and `compileNextPreview` are already imported there):

```ts
describe('kit templates in React', () => {
  it('a store using every kit template helper validates and compiles', async () => {
    const files = nextStoreFiles();
    const home = files.find(f => f.path === 'components/home.tsx')!;
    home.content = "import { CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate, ProductPageTemplate, KitSlot } from '@pagosya/ui';\n"
      + home.content.replace('<div data-pagosya-catalog />', `<div data-pagosya-catalog />
<CartTemplate><div className="canasta"><h2>Tu canasta</h2><button data-cart-close>Cerrar</button><KitSlot kind="cart" name="lines" /><KitSlot kind="cart" name="total" /><KitSlot kind="cart" name="action" /></div></CartTemplate>
<CartLineTemplate><li><KitSlot kind="line" name="name" as="h3" /><KitSlot kind="line" name="line-total" as="strong" /><KitSlot kind="line" name="quantity" /></li></CartLineTemplate>
<AddedTemplate><div><KitSlot kind="added" name="message" as="span" /><button data-cart-open>Ver</button></div></AddedTemplate>
<ReviewTemplate><div><KitSlot kind="review" name="summary" /><KitSlot kind="review" name="fields" /></div></ReviewTemplate>
<ProductPageTemplate><article><KitSlot kind="product" name="gallery" /><KitSlot kind="product" name="title" /><KitSlot kind="product" name="pricing" /><KitSlot kind="product" name="buy" /></article></ProductPageTemplate>`);
    expect(() => validateNextSources(files)).not.toThrow();
    const compiled = await compileNextPreview(files);
    const compiledHome = compiled.find(f => f.path === '_compiled/home.js')!;
    expect(compiledHome.content).toContain('data-pagosya-cart-template');
    expect(compiledHome.content).toContain('data-cart-slot');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-next.spec.ts -t "kit templates in React"`
Expected: FAIL — `CartTemplate` is not exported by `@pagosya/ui`.

- [ ] **Step 3: Implement**

In `packages/storefront-kit/kit/ui.tsx`, after `export function CommerceSlots() {…}`, add:

```tsx
/* T1 kit templates: author the markup of a kit surface; the commerce runtime fills the slots. Prices, totals,
 * stock, options and checkout stay platform-owned. Each template needs one root element and its required slots:
 * product page gallery/title/pricing/buy; cart lines/total/action plus a button[data-cart-close]; cart line
 * name/line-total/quantity; added notice message plus a button[data-cart-open]; review summary/fields. */
export function ProductPageTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-product-page-template>{children}</template>; }
export function CartTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-cart-template>{children}</template>; }
export function CartLineTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-cart-line-template>{children}</template>; }
export function AddedTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-added-template>{children}</template>; }
export function ReviewTemplate({ children }: { children: ReactNode }) { return <template data-pagosya-review-template>{children}</template>; }
const KIT_SLOT_ATTRIBUTE = { product: 'data-product-slot', cart: 'data-cart-slot', line: 'data-cart-field', added: 'data-added-field', review: 'data-review-slot' } as const;
export function KitSlot({ kind, name, as = 'div', className, children }: { kind: keyof typeof KIT_SLOT_ATTRIBUTE; name: string; as?: keyof JSX.IntrinsicElements; className?: string; children?: ReactNode }) {
  const Tag = as as any;
  return <Tag className={className} {...{ [KIT_SLOT_ATTRIBUTE[kind]]: name }}>{children}</Tag>;
}
```

In `source-generation.service.ts`, directly after the prompt string that begins `'You may author <template data-pagosya-product-template>`, add a sibling string in the same array:

```ts
      'Optionally author the inside of the shop too, with ONE root element each: <template data-pagosya-product-page-template> (slots data-product-slot="gallery", "title", "pricing", "buy" required; "category", "description", "highlights", "info", "delivery", "rating", "reviews", "bundles", "related", "breadcrumb" optional), <template data-pagosya-cart-template> (data-cart-slot="lines", "total", "action" required plus one <button data-cart-close>; "suggestions", "savings", "note", "policies", "empty" optional), <template data-pagosya-cart-line-template> (data-cart-field="name", "line-total", "quantity" required; "photo" on an <img>, "option", "unit", "stock", "remove" on a <button> optional), <template data-pagosya-added-template> (data-added-field="message" plus one <button data-cart-open>; "name", "photo" optional) and <template data-pagosya-review-template> (data-review-slot="summary", "fields"). In React use ProductPageTemplate, CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate and KitSlot from @pagosya/ui. Leave every slot empty: the platform fills prices, totals, stock, options, delivery and checkout; you own layout, typography and decoration around them.',
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-next.spec.ts src/storefront-source/source-generation.service.spec.ts && npx tsc --noEmit -p tsconfig.json && npx eslint src/storefront-source/source-generation.service.ts`
Expected: PASS, no type errors, 0 lint errors. If a prompt snapshot in `source-generation.service.spec.ts` pins the exact prompt, update that expectation to include the new line.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ui): ProductPageTemplate, CartTemplate, CartLineTemplate, AddedTemplate, ReviewTemplate and KitSlot; the generation prompt documents the optional kit templates" -- packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-next.spec.ts
```

---

## Final verification (after Task 7)

- `cd apps/api && npx jest src/storefront-source` — all green (a suite that times out under parallel load is re-run alone with `--runInBand` before being called a failure).
- `cd apps/api && npx tsc --noEmit -p tsconfig.json`.
- `cd apps/merchant-studio && pnpm exec playwright test --workers=2` — green except the two known pre-existing failures: `source-publication.spec.ts:96` (unmocked `/events`) and the flaky `failed chat generation preserves the request and permits retry` (passes alone).
- `cd apps/merchant-dashboard && pnpm run build:studio` so the dashboard serves the new Studio. The API reads the kit from disk per preview (no restart for kit changes), but the Task 7 prompt change needs `cd apps/api && pnpm run build` and a restart of the port-3001 process (`PORT=3001 CHECKOUT_ORIGIN=http://localhost:5175 node --enable-source-maps dist/src/main`), only when no generation is running.
- Look at every screenshot in `tmp/kit-templates-shots/`.
