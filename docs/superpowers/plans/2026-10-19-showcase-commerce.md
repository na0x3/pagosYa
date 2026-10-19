# Showcase Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Offer squares (one-time, packs, subscription) on the product page and quick-look, richer product cards in three designs, products placed anywhere (chosen set, product + text, product + video), and sort & filter on the shop page — drawn by the store kit for every store.

**Architecture:** All shopper-facing parts live in the storefront kit (`packages/storefront-kit/commerce-src`, concatenated into `kit/commerce.js` by `tools/build-commerce.mjs`) and read the store's public config data; templates and YAPI only choose *where* and *which style* (`config.showcase = { cards, offers }`, `data-products`, `data-pagosya-spotlight`). Esencial gets the two new style parts in its dice and fills the new card fields. Three small DB fields (pack/subscription labels, card eyebrow) come last, behind the owner applying a migration.

**Tech Stack:** Plain JS kit (single IIFE, jsdom tests in `apps/api/src/storefront-source/source-commerce-*.spec.ts`), NestJS + Prisma API (Jest), Next/TSX Esencial template (`packages/store-templates`, node:test), Studio (Vite/TS, Vitest), dashboard (`.mjs`, node:test).

**Spec:** `docs/superpowers/specs/2026-10-19-showcase-commerce-design.md`

## Global Constraints

- Only true numbers: every price/saving uses the server's math — sale `price(p)`, pack `floor(eligible × % / 100)` (`apps/api/src/stores/bundle-pricing.ts`), subscription `subscriptionPrice()`.
- No invented social proof: automatic label is only «Mejor precio» (strictly lower price per unit than 1 unidad); anything else is the merchant's label (≤ 24 chars).
- Kit owns prices and buttons; YAPI never authors a price or an add button for these blocks.
- Never run `prisma migrate`/`db push`/`reset` on the dev DB; the owner applies `20261020090000_showcase_labels`.
- Saving `apps/api` restarts the dev API (nest --watch): check no `StoreSourceChatJob` is RUNNING/QUEUED first.
- API jest: one file at a time or a list with `--maxWorkers=2`; never the full suite with default workers.
- After any `commerce-src` change: `node packages/storefront-kit/tools/build-commerce.mjs` before kit tests; commit `kit/commerce.js` with the part.
- Copy is Spanish, neutral, short; layouts must not overflow at 390 px.

## Review Focus

1. **Variant product with packs** — the pack total uses the *selected variant's* price, and a pack larger than that variant's remaining stock is hidden (Task 1 test `pack squares follow the selected variant`).
2. **Sale + packs** — per-unit figures use the sale price; «Mejor precio» only when a pack's per-unit is strictly lower than the sale unit price (Task 1 test `sale price feeds the pack math`).
3. **Option names in other forms** («Colour», «TALLA», «Size») — filters group option names case- and accent-insensitively and colour dots appear only for recognised colour groups (Task 4 test `option names group regardless of case and accents`).
4. **A placed product later deleted** — a chosen set skips it; a spotlight whose product is gone hides itself, no error (Task 3 test `a deleted product disappears from blocks`).
5. **390 px with a 24-character label** — squares wrap text inside the square, no horizontal overflow (Task 1 test `long labels never widen the square` checks the CSS rule `overflow-wrap:anywhere` and `min-width:0` on squares).

---

### Task 1: Offer squares (kit)

**Files:**
- Create: `packages/storefront-kit/commerce-src/product/offer-squares.js` (insert in `PARTS` right after `'product/setup.js'`)
- Modify: `packages/storefront-kit/tools/build-commerce.mjs` (PARTS)
- Modify: `packages/storefront-kit/commerce-src/product/setup.js` (`updateQuantity` total; render squares in the buy box)
- Modify: `packages/storefront-kit/commerce-src/product/page.js` (buy box assembly: include `.product-detail__offers`)
- Modify: `packages/storefront-kit/commerce-src/product/bundles-related.js` (skip packs shown as squares)
- Modify: `packages/storefront-kit/commerce-src/shared/click-actions.js` (square clicks)
- Modify: `packages/storefront-kit/commerce-src/product/dialog-style.js` (CSS)
- Test: `apps/api/src/storefront-source/source-commerce-offer-squares.spec.ts`

**Interfaces:**
- Produces (kit scope, used by Tasks 2–3): `packOffers(p)` → `Array<{ id, quantity, percent, label? }>` (≤ 3, sorted); `packDiscount(p, unitAmount, quantity)` → integer cents; `offerOptions(p, variant)` → `Array<{ key, kind: 'once'|'pack'|'sub', quantity, cadence?, total, regular, perUnit, saving, label? , best: boolean }>`; `offerLayout(options)` → `'steps'|'grid'|'rows'`; `bestDealLine(p)` → string (`''` when none).
- Consumes: kit helpers `price`, `money`, `escape`, `products`, `remaining`, `optionGroups`, `selectedVariant`, `subscriptionsAvailable`, `subscriptionPrice`, `CADENCE_TEXT`, `isMembership`, `boxGroup`, `store`, `config`.

- [ ] **Step 1: Write the failing tests** (`source-commerce-offer-squares.spec.ts`, same jsdom harness as `source-commerce-card-sale.spec.ts`; open a product page with `<main data-pagosya-product-page></main>` and `location.search=?id=coffee` via `PAGOSYA_PREVIEW_QUERY`)

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const coffee = (extra: Record<string, unknown> = {}) => ({ id: 'coffee', name: 'Café', amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], subscriptionOptions: [], ...extra });
const pack = (quantity: number, percent: number, extra: Record<string, unknown> = {}) => ({ id: `p${quantity}`, name: `Lleva ${quantity}`, kind: 'FIXED', items: [{ productId: 'coffee', quantity }], minimumQuantity: 2, discountPercent: percent, ...extra });
const windows: any[] = []; const errors: Error[] = [];
async function open(items: any[], data: Record<string, unknown> = {}, showcase?: Record<string, string>) {
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle/.test(e.message)) errors.push(e); });
  const dom = new JSDOM('<html><head></head><body><main data-pagosya-product-page></main><section data-pagosya-cart></section></body></html>', { runScripts: 'outside-only', url: 'https://store.test/product.html?id=coffee', virtualConsole: vc });
  const w = dom.window; windows.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {}; w.matchMedia = () => ({ matches: true });
  const store = { storeName: 'Marca', checkoutMode: 'payment', items, bundlesEnabled: true, bundles: [], subscriptionsEnabled: true, ...data };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data: store, ...(showcase ? { showcase } : {}) };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => store }));
  w.eval(commerce); await new Promise(r => setImmediate(r));
  return { w, q: (s: string) => w.document.querySelector(s), qa: (s: string) => [...w.document.querySelectorAll(s)] as any[] };
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

describe('offer squares', () => {
  it('show 1 unidad first and selected, then each one-product pack with the server math', async () => {
    const { qa } = await open([coffee()], { bundles: [pack(3, 15), pack(2, 10)] });
    const squares = qa('[data-offer-square]');
    expect(squares.map(s => s.dataset.offerSquare)).toEqual(['once:1', 'pack:2', 'pack:3']);
    expect(squares[0].getAttribute('aria-checked')).toBe('true');
    // 3 × 75 = 225; floor(225 × 15 / 100) = 33 → 192 (cents: 22500 − 3375 = 19125 → Bs 191,25)
    expect(squares[2].textContent).toContain('191,25');
    expect(squares[2].textContent).toContain('Ahorras Bs 33,75');
    expect(squares[2].textContent).toContain('63,75 c/u');
  });
  it('marks «Mejor precio» only on the strictly cheapest per unit, never on 1 unidad', async () => {
    const { qa } = await open([coffee()], { bundles: [pack(2, 10), pack(3, 15)] });
    expect(qa('[data-offer-square] .offer-square__tag').map(t => t.closest('[data-offer-square]').dataset.offerSquare)).toEqual(['pack:3']);
  });
  it('the merchant label replaces «Mejor precio» on its square only', async () => {
    const { qa } = await open([coffee()], { bundles: [pack(2, 10, { label: 'Recomendado' }), pack(3, 15)] });
    const tags = Object.fromEntries(qa('[data-offer-square]').map(s => [s.dataset.offerSquare, s.querySelector('.offer-square__tag')?.textContent ?? null]));
    expect(tags).toEqual({ 'once:1': null, 'pack:2': 'Recomendado', 'pack:3': 'Mejor precio' });
  });
  it('ignores mixed and multi-product bundles, and keeps at most 3 packs', async () => {
    const other = { id: 'mug', name: 'Taza', amount: 3000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
    const { qa } = await open([coffee(), other], { bundles: [pack(2, 5), pack(3, 10), pack(4, 15), pack(6, 20), { ...pack(2, 30), items: [{ productId: 'coffee', quantity: 1 }, { productId: 'mug', quantity: 1 }] }, { ...pack(2, 30), kind: 'MIX_MATCH' }] });
    expect(qa('[data-offer-square]').map(s => s.dataset.offerSquare)).toEqual(['once:1', 'pack:2', 'pack:3', 'pack:4']);
  });
  it('picking a pack sets the quantity and the add button total', async () => {
    const { q, w } = await open([coffee()], { bundles: [pack(3, 15)] });
    q('[data-offer-square="pack:3"]').click(); await new Promise(r => setImmediate(r));
    expect(q('[data-product-quantity-value]').textContent).toBe('3');
    expect(q('[data-product-total]').textContent).toContain('191,25');
    expect(w.document.querySelector('[data-offer-square="pack:3"]').getAttribute('aria-checked')).toBe('true');
  });
  it('subscription squares choose the cadence and the existing consent text stays', async () => {
    const { q } = await open([coffee({ subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] })]);
    q('[data-offer-square="sub:MONTHLY"]').click(); await new Promise(r => setImmediate(r));
    expect((q('[name=purchaseMode]:checked') as any).value).toBe('subscribe');
    expect(q('[data-subscription-choice]').textContent).toContain('No se cobra automáticamente');
  });
  it('pack squares follow the selected variant (price and stock) — Review Focus 1', async () => {
    const variants = [{ id: 'v250', name: '250 g', amount: 7500, stock: 5, options: [{ name: 'Tamaño', value: '250 g' }] }, { id: 'v1k', name: '1 kg', amount: 20000, stock: 2, options: [{ name: 'Tamaño', value: '1 kg' }] }];
    const { q, qa, w } = await open([coffee({ variants })], { bundles: [pack(3, 15)] });
    (w.document.querySelector('[data-option-value="1 kg"]') as any)?.click(); await new Promise(r => setImmediate(r));
    expect(qa('[data-offer-square]').map(s => s.dataset.offerSquare)).toEqual(['once:1']);
    (w.document.querySelector('[data-option-value="250 g"]') as any)?.click(); await new Promise(r => setImmediate(r));
    expect(q('[data-offer-square="pack:3"]').textContent).toContain('191,25');
  });
  it('sale price feeds the pack math — Review Focus 2', async () => {
    const { q, qa } = await open([coffee({ discountPercent: 20 })], { bundles: [pack(2, 5)] });
    // unit 60; 2 × 60 = 120; floor(120 × 5 / 100) = 6 → 114 → 57 c/u, strictly lower → Mejor precio
    expect(q('[data-offer-square="pack:2"]').textContent).toContain('57,00 c/u');
    expect(qa('.offer-square__tag').length).toBe(1);
  });
  it('the quick-look dialog shows the same squares (spec §1, owner option 3)', async () => {
    // open a home page instead: body '<section data-pagosya-catalog></section>' and click the card's «Ver opciones»/details button
    const { q, w } = await open([coffee({ variants: [{ id: 'a', name: '250 g', amount: 7500, options: [{ name: 'Tamaño', value: '250 g' }] }] })], { bundles: [pack(2, 10)] });
    (w.document.querySelector('[data-product="coffee"]') as any)?.click(); await new Promise(r => setImmediate(r));
    expect(q('[data-pagosya-product] [data-offer-square="pack:2"]')).not.toBeNull();
  });
  it('no squares for memberships, boxes, or a product with neither packs nor subscription', async () => {
    const { qa } = await open([coffee()]);
    expect(qa('[data-offer-square]')).toEqual([]);
  });
  it('a pack shown as a square is not repeated in «Llévalo en paquete»', async () => {
    const { q } = await open([coffee()], { bundles: [pack(2, 10)] });
    expect(q('.product-detail__bundles')).toBeNull();
  });
  it('chooses the layout: grid ≤ 4 of one kind, steps with packs and subscription, rows above 4', async () => {
    const both = await open([coffee({ subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] })], { bundles: [pack(2, 10)] }, { offers: 'grid' });
    expect(both.q('[data-offer-layout]')?.getAttribute('data-offer-layout')).toBe('steps');
    const many = await open([coffee({ subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 5 }, { cadence: 'MONTHLY', discountPercent: 10 }] })], { bundles: [pack(2, 5), pack(3, 10), pack(4, 15)] }, { offers: 'grid' });
    expect(many.q('[data-offer-layout]')?.getAttribute('data-offer-layout')).toBe('rows');
    const packs = await open([coffee()], { bundles: [pack(2, 10)] }, { offers: 'grid' });
    expect(packs.q('[data-offer-layout]')?.getAttribute('data-offer-layout')).toBe('grid');
  });
  it('long labels never widen the square — Review Focus 5', async () => {
    const { w } = await open([coffee()], { bundles: [pack(2, 10, { label: 'El favorito de la casa!' })] });
    const css = [...w.document.querySelectorAll('style')].map((s: any) => s.textContent).join('');
    expect(css).toMatch(/\.offer-square\{[^}]*min-width:0/);
    expect(css).toMatch(/\.offer-square\{[^}]*overflow-wrap:anywhere/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-offer-squares.spec.ts`
Expected: FAIL — no `[data-offer-square]` elements.

- [ ] **Step 3: Implement `product/offer-squares.js`**

```js
  /* Offer squares (spec 2026-10-19 showcase commerce §1): 1 unidad, one-product packs and subscription cadences, with the
   * server's own math (bundle-pricing.ts: best single FIXED offer, floor(eligible × % / 100)). Never a figure checkout won't charge. */
  function packOffers(p) {
    if (!store.bundlesEnabled || !Array.isArray(store.bundles) || isMembership(p) || boxGroup(p) || p.fulfillmentType === 'DIGITAL') return [];
    return store.bundles
      .filter(b => b.kind === 'FIXED' && Array.isArray(b.items) && b.items.length === 1 && b.items[0]?.productId === p.id && Number(b.items[0].quantity) >= 2)
      .map(b => ({ id: b.id, quantity: Number(b.items[0].quantity), percent: Math.max(0, Math.min(99, Number(b.discountPercent) || 0)), ...(typeof b.label === 'string' && b.label.trim() ? { label: b.label.trim().slice(0, 24) } : {}) }))
      .sort((a, b) => a.quantity - b.quantity).slice(0, 3);
  }
  function packDiscount(p, unitAmount, quantity) {
    let best = 0;
    for (const offer of packOffers(p)) {
      const cycles = Math.floor(quantity / offer.quantity);
      if (cycles > 0) best = Math.max(best, Math.floor(cycles * offer.quantity * unitAmount * offer.percent / 100));
    }
    return Math.min(best, Math.max(0, unitAmount * quantity - 1));
  }
  function offerOptions(p, variant) {
    if (isMembership(p) || boxGroup(p)) return [];
    const unit = price(variant ? { ...p, amount: variant.amount } : p);
    const left = remaining(p, variant || undefined);
    const packs = packOffers(p).filter(offer => left === Infinity || left >= offer.quantity);
    const subs = subscriptionsAvailable() && p.fulfillmentType !== 'DIGITAL' && !p.extras?.length ? (p.subscriptionOptions || []) : [];
    if (!packs.length && !subs.length) return [];
    const rows = [{ key: 'once:1', kind: 'once', quantity: 1, total: unit, regular: unit, perUnit: unit, saving: 0 }];
    for (const offer of packs) {
      const regular = unit * offer.quantity, saving = packDiscount(p, unit, offer.quantity);
      rows.push({ key: `pack:${offer.quantity}`, kind: 'pack', quantity: offer.quantity, total: regular - saving, regular, perUnit: Math.round((regular - saving) / offer.quantity), saving, ...(offer.label ? { label: offer.label } : {}) });
    }
    for (const option of subs) {
      const total = subscriptionPrice(p, variant || undefined, option.cadence);
      rows.push({ key: `sub:${option.cadence}`, kind: 'sub', quantity: 1, cadence: option.cadence, total, regular: unit, perUnit: total, saving: unit - total, ...(typeof option.label === 'string' && option.label.trim() ? { label: option.label.trim().slice(0, 24) } : {}) });
    }
    const cheapest = Math.min(...rows.map(row => row.perUnit));
    return rows.map(row => ({ ...row, best: row.kind !== 'once' && row.perUnit === cheapest && cheapest < unit && rows.filter(r => r.perUnit === cheapest).length === 1 }));
  }
  function offerLayout(options) {
    const wanted = ['steps', 'grid', 'rows'].includes(config.showcase?.offers) ? config.showcase.offers : 'grid';
    const kinds = new Set(options.filter(o => o.kind !== 'once').map(o => o.kind));
    if (options.length > 4 + (kinds.size > 1 ? 1 : 0)) return 'rows';
    if (kinds.size > 1) return wanted === 'rows' ? 'rows' : 'steps';
    return wanted === 'steps' ? 'grid' : wanted;
  }
  function offerSquareMarkup(p, option, selected) {
    const tag = option.label || (option.best ? 'Mejor precio' : '');
    const title = option.kind === 'once' ? '1 unidad' : option.kind === 'pack' ? `Pack x${option.quantity}` : CADENCE_TEXT[option.cadence] || 'Suscripción';
    const lines = option.kind === 'pack' ? `${money(option.perUnit, p.currency)} c/u` : option.kind === 'sub' ? 'Suscripción · cancela cuando quieras' : '';
    return `<button type="button" role="radio" class="offer-square" data-offer-square="${escape(option.key)}" aria-checked="${selected}">`
      + (tag ? `<span class="offer-square__tag">${escape(tag)}</span>` : '')
      + `<span class="offer-square__title">${escape(title)}</span><span class="offer-square__total">${money(option.total, p.currency)}</span>`
      + (option.saving > 0 && option.kind === 'pack' ? `<del class="offer-square__regular" aria-label="Precio sin pack">${money(option.regular, p.currency)}</del>` : '')
      + (lines ? `<span class="offer-square__line">${escape(lines)}</span>` : '')
      + (option.saving > 0 ? `<span class="offer-square__save">Ahorras ${money(option.saving * (option.kind === 'sub' ? 1 : 1), p.currency)}</span>` : '')
      + '</button>';
  }
  /** The squares of the selected product/variant; '' when there is nothing to choose. */
  function offerSquaresMarkup(p, variant, selectedKey = 'once:1') {
    const options = offerOptions(p, variant);
    if (options.length < 2) return '';
    const layout = offerLayout(options);
    const once = options.filter(o => o.kind !== 'sub'), subs = options.filter(o => o.kind === 'sub');
    const group = (rows, label) => `<div class="offer-squares__group" role="radiogroup" aria-label="${escape(label)}">${rows.map(o => offerSquareMarkup(p, o, o.key === selectedKey)).join('')}</div>`;
    const body = layout === 'steps' && subs.length && once.length > 1
      ? group(once, '¿Cuántos?') + group(subs, 'Suscríbete')
      : group(options, 'Elige tu opción');
    return `<div class="product-detail__offers offer-squares" data-offer-layout="${layout}"><p class="offer-squares__label">${layout === 'rows' ? 'Elige tu opción' : '¿Cuántos?'}</p>${body}</div>`;
  }
  /** One short best-deal line for cards (Task 2): «Desde Bs X c/u» and/or «Suscríbete −N%». */
  function bestDealLine(p) {
    const options = offerOptions(p, undefined);
    const pack = options.filter(o => o.kind === 'pack').sort((a, b) => a.perUnit - b.perUnit)[0];
    const sub = (p.subscriptionOptions || []).reduce((best, o) => Math.max(best, Number(o.discountPercent) || 0), 0);
    return [pack ? `Desde ${money(pack.perUnit, p.currency)} c/u` : '', options.some(o => o.kind === 'sub') && sub ? `Suscríbete −${sub}%` : ''].filter(Boolean).join(' · ');
  }
```

- [ ] **Step 4: Wire it into the buy box**

In `product/setup.js` `updateQuantity()`, replace the `total` line's amount with the pack-aware total:

```js
    const unitTotal = amount * selectedQuantity;
    const packSaving = pending || cadence || boxLine ? 0 : packDiscount(selectedProduct, amount, selectedQuantity);
    const total = pending ? startingAt.length ? `desde ${money(Math.min(...startingAt), selectedProduct.currency)}` : '' : available ? money(unitTotal - packSaving, selectedProduct.currency) : '';
```

and at the end of `updateQuantity()` (before `updateStickyBar()`):

```js
    const offers = detail.querySelector('.product-detail__offers'), key = cadence ? `sub:${cadence}` : `${packOffers(selectedProduct).some(o => o.quantity === selectedQuantity) ? 'pack' : 'once'}:${selectedQuantity}`;
    const fresh = offerSquaresMarkup(selectedProduct, variant || undefined, key);
    if (offers && fresh) offers.outerHTML = fresh; else if (offers && !fresh) offers.remove();
```

In `product/page.js`, where the buy box HTML is built (the line that places `subscriptionChoice(p)` and `quantityMarkup(...)`), insert `offerSquaresMarkup(p, undefined)` immediately before `subscriptionChoice(p)`, and add `.product-detail__offers` to the selector list that moves children into the `buybox` (the `child.matches('.product-detail__pricing,…')` list). When squares render, hide the plain subscription fieldset visually but keep it for state: add `if (detail.querySelector('.product-detail__offers')) detail.querySelector('[data-subscription-choice]')?.setAttribute('data-offer-driven', '')`.

In `shared/click-actions.js`, add before the quantity branch:

```js
    if (button.hasAttribute('data-offer-square') && selectedProduct) {
      const [kind, value] = button.dataset.offerSquare.split(':');
      const choice = detail.querySelector('[data-subscription-choice]');
      if (choice) {
        const mode = choice.querySelector(`[name=purchaseMode][value="${kind === 'sub' ? 'subscribe' : 'once'}"]`); if (mode) mode.checked = true;
        const cadence = choice.querySelector('[name=subscriptionCadence]'); if (kind === 'sub' && cadence) cadence.value = value;
      }
      selectedQuantity = kind === 'pack' ? Number(value) : 1;
      updateQuantity();
      return;
    }
```

In `product/bundles-related.js` `bundleOffersMarkup`, skip packs that are squares: at the top of the `flatMap` callback add `if (packOffers(p).some(offer => offer.id === bundle.id)) return [];`.

In `product/dialog-style.js` append to the CSS string:

```css
    [data-pagosya-product] .offer-squares{display:grid;gap:8px;margin:4px 0 8px}
    [data-pagosya-product] .offer-squares__label{margin:0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--pd-muted)}
    [data-pagosya-product] .offer-squares__group{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,104px),1fr));gap:8px}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-squares__group{grid-template-columns:1fr}
    [data-pagosya-product] .offer-square{position:relative;display:grid;gap:2px;justify-items:center;min-width:0;overflow-wrap:anywhere;padding:14px 8px 10px;border:1.5px solid var(--pd-line);border-radius:var(--pd-radius,12px);background:var(--pd-surface);color:var(--pd-ink);font:inherit;text-align:center;cursor:pointer}
    [data-pagosya-product] .offer-squares[data-offer-layout=rows] .offer-square{grid-template-columns:1fr auto;justify-items:start;text-align:left;padding:12px 14px}
    [data-pagosya-product] .offer-square[aria-checked=true]{border-color:var(--pd-accent);box-shadow:inset 0 0 0 1.5px var(--pd-accent)}
    [data-pagosya-product] .offer-squares[data-offer-layout=grid] .offer-square[aria-checked=true]{background:var(--pd-accent);color:var(--pd-on-accent)}
    [data-pagosya-product] .offer-square__title{font-weight:700}
    [data-pagosya-product] .offer-square__total{font-size:1.15em;font-weight:800}
    [data-pagosya-product] .offer-square__regular,[data-pagosya-product] .offer-square__line{font-size:12px;opacity:.75}
    [data-pagosya-product] .offer-square__save{font-size:11px;font-weight:700;color:var(--pd-accent)}
    [data-pagosya-product] .offer-square[aria-checked=true] .offer-square__save{color:inherit}
    [data-pagosya-product] .offer-square__tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);max-width:calc(100% - 8px);padding:2px 8px;border-radius:99px;background:var(--pd-accent);color:var(--pd-on-accent);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    [data-pagosya-product] [data-subscription-choice][data-offer-driven]>:is(legend,label,select){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
```

Add `'product/offer-squares.js'` to `PARTS` after `'product/setup.js'`.

- [ ] **Step 5: Run the tests**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-offer-squares.spec.ts src/storefront-source/source-commerce-subscription*.spec.ts src/storefront-source/source-commerce-bundle*.spec.ts --maxWorkers=2`
Expected: PASS (new file) and the existing subscription/bundle kit specs still PASS. If a selector in Step 4 differs from the real `page.js` buy-box line, adapt the insertion point to where `subscriptionChoice(p)` is concatenated — that string is the anchor.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit apps/api/src/storefront-source/source-commerce-offer-squares.spec.ts
git commit -m "feat(kit): offer squares for one-time, packs and subscription in the buy box"
```

---

### Task 2: Richer product cards (kit)

**Files:**
- Create: `packages/storefront-kit/commerce-src/catalog/card-insides.js` (PARTS: after `'catalog/offers.js'`)
- Modify: `packages/storefront-kit/commerce-src/catalog/cards.js` (`productCard` default card; `customProductCard` new fields)
- Modify: `packages/storefront-kit/commerce-src/catalog/render.js` (mark best value per grid; showcase fallback)
- Modify: `packages/storefront-kit/commerce-src/look/dna-css.js` (card CSS, appended to the kit stylesheet it already injects)
- Test: `apps/api/src/storefront-source/source-commerce-card-insides.spec.ts`

**Interfaces:**
- Consumes: `bestDealLine(p)`, `offerOptions(p, variant)` (Task 1); `optionGroups(p)`, `swatchColor(group, value)`, `price`, `money`, `store.categories`.
- Produces: `cardDesign(count)` → `'showcase'|'compact'|'split'`; `cardInsides(p)` → `{ eyebrow, points: string[], chips: Array<{ text, color? }>, deal, save }`; `bestValueId(items)` → product id or `''`. Authored-template fields `data-product-field="eyebrow|points|chips|deal|save"`, attribute `data-card-best` on the best card's root.

- [ ] **Step 1: Write the failing tests** (`source-commerce-card-insides.spec.ts`, same harness as `source-commerce-card-sale.spec.ts`, home page with `<section data-pagosya-catalog data-catalog-full>`)

```ts
// harness identical to source-commerce-card-sale.spec.ts `open(items, body)`, extended with an optional config.showcase
describe('card insides', () => {
  const base = { amount: 7500, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] };
  it('fills eyebrow, points, chips, deal and save on the default card', async () => {
    const q = await open([{ ...base, id: 'c', name: 'Café', cardEyebrow: 'Elige tu tueste', discountPercent: 10, highlights: [{ label: 'De los Yungas' }, { label: 'Tostado semanal' }, { label: 'Molido o grano' }, { label: 'Extra' }], variants: [{ id: 'a', name: '250 g', amount: 7500, options: [{ name: 'Tamaño', value: '250 g' }] }, { id: 'b', name: '500 g', amount: 14000, options: [{ name: 'Tamaño', value: '500 g' }] }] }], '', { cards: 'showcase' });
    expect(q('.menu-item__eyebrow')?.textContent).toBe('Elige tu tueste');
    expect([...q('.menu-item__points')!.querySelectorAll('li')].map((li: any) => li.textContent)).toEqual(['De los Yungas', 'Tostado semanal', 'Molido o grano']);
    expect([...q('.menu-item__chips')!.querySelectorAll('span')].map((s: any) => s.textContent)).toEqual(['250 g', '500 g']);
    expect(q('.menu-item__save')?.textContent).toContain('Ahorras');
  });
  it('falls back to the category name for the eyebrow, and shows nothing when both are missing', async () => {
    const q = await open([{ ...base, id: 'c', name: 'Café', categoryId: 'k' }, { ...base, id: 'd', name: 'Taza' }], '', { cards: 'showcase' }, { categories: [{ id: 'k', name: 'Café de altura' }] });
    expect(q('[data-product-id="c"] .menu-item__eyebrow, .menu-item:first-child .menu-item__eyebrow')?.textContent).toBe('Café de altura');
    expect(q('.menu-item:nth-child(2) .menu-item__eyebrow')).toBeNull();
  });
  it('best value goes only to a real saving, once per grid', async () => {
    const q = await open([{ ...base, id: 'a', name: 'A' }, { ...base, id: 'b', name: 'B', discountPercent: 30 }, { ...base, id: 'c', name: 'C', discountPercent: 10 }], '', { cards: 'showcase' });
    const best = [...(q as any).all('[data-card-best]')];
    expect(best.length).toBe(1);
    expect(best[0].textContent).toContain('B');
    const none = await open([{ ...base, id: 'a', name: 'A' }], '', { cards: 'showcase' });
    expect(none('[data-card-best]')).toBeNull();
  });
  it('colour variants become dots, other options text chips, max 4 then «+N»', async () => {
    const colours = ['Rojo', 'Azul', 'Negro', 'Blanco', 'Verde', 'Rosa'].map((value, i) => ({ id: String(i), name: value, amount: 6000, options: [{ name: 'Color', value }] }));
    const q = await open([{ ...base, id: 'm', name: 'Taza', variants: colours }], '', { cards: 'compact' });
    expect(q('.menu-item__chips')!.querySelectorAll('[data-swatch]').length).toBe(4);
    expect(q('.menu-item__chips')!.textContent).toContain('+2');
  });
  it('showcase with more than 8 products falls back to compact', async () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ ...base, id: `p${i}`, name: `P${i}` }));
    const q = await open(items, '', { cards: 'showcase' });
    expect(q('[data-pagosya-catalog]')?.getAttribute('data-card-design')).toBe('compact');
  });
  it('an authored template gets the new optional fields filled and keeps working without them', async () => {
    const TEMPLATE = '<template data-pagosya-product-template><article><a data-product-link href="#"><img data-product-field="image" alt=""></a><p data-product-field="eyebrow"></p><h3 data-product-field="name"></h3><ul data-product-field="points"></ul><p data-product-field="deal"></p><p data-product-field="price"></p><button data-product-add></button></article></template>';
    const q = await open([{ ...base, id: 'c', name: 'Café', cardEyebrow: 'Tueste medio', highlights: [{ label: 'Yungas' }] }], TEMPLATE);
    expect(q('[data-custom-product] [data-product-field="eyebrow"]')?.textContent).toBe('Tueste medio');
    expect(q('[data-custom-product] [data-product-field="points"] li')?.textContent).toBe('Yungas');
    expect((q('[data-custom-product] [data-product-field="deal"]') as any)?.hidden).toBe(true);
  });
  it('a simple product adds, a product with options opens «Ver opciones»', async () => {
    const q = await open([{ ...base, id: 's', name: 'Simple' }, { ...base, id: 'v', name: 'Con talla', variants: [{ id: 'x', name: 'M', amount: 7500, options: [{ name: 'Talla', value: 'M' }] }] }], '', { cards: 'showcase' });
    expect(q('.menu-item:first-child .menu-add')?.textContent).toContain('Agregar');
    expect(q('.menu-item:nth-child(2) .menu-add')?.textContent).toContain('Ver opciones');
  });
});
```

(Extend the harness `open(items, body, showcase?, data?)` to set `PAGOSYA_CONFIG.showcase` and merge `data` into the store; expose `q.all = selector => w.document.querySelectorAll(selector)`.)

- [ ] **Step 2: Run to verify they fail**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-card-insides.spec.ts`
Expected: FAIL — no `.menu-item__eyebrow`.

- [ ] **Step 3: Implement `catalog/card-insides.js`**

```js
  /* Card insides (spec 2026-10-19 showcase commerce §2): eyebrow, ✓ points, chips, best-deal line and save pill — all from
   * real data; an empty field is absent. The store's design: config.showcase.cards (showcase | compact | split). */
  function cardDesign(count) {
    const wanted = ['showcase', 'compact', 'split'].includes(config.showcase?.cards) ? config.showcase.cards : 'compact';
    return wanted === 'showcase' && count > 8 ? 'compact' : wanted;
  }
  function cardInsides(p) {
    const category = (store.categories || []).find(c => c.id === p.categoryId)?.name || '';
    const eyebrow = (typeof p.cardEyebrow === 'string' && p.cardEyebrow.trim() ? p.cardEyebrow.trim() : category).slice(0, 28);
    const points = (Array.isArray(p.highlights) ? p.highlights : []).map(h => typeof h === 'string' ? h : h?.label).filter(text => typeof text === 'string' && text.trim()).slice(0, 3);
    const chips = [];
    for (const group of optionGroups(p) || []) {
      for (const value of group.values) { const color = swatchColor(group.name, value); chips.push(color ? { text: value, color } : { text: value }); }
    }
    const sale = !isMembership(p) && price(p) < p.amount ? p.amount - price(p) : 0;
    return { eyebrow, points, chips: chips.slice(0, 4), more: Math.max(0, chips.length - 4), deal: isMembership(p) ? '' : bestDealLine(p), save: sale ? `Ahorras ${money(sale, p.currency)}` : '' };
  }
  /** The product with the largest real saving per unit in this grid (sale, pack or subscription); '' when nothing saves. */
  function bestValueId(items) {
    let best = { id: '', saving: 0 };
    for (const p of items) {
      if (isMembership(p)) continue;
      const options = offerOptions(p, undefined);
      const unit = price(p);
      const perUnit = Math.min(unit, ...options.map(o => o.perUnit));
      const saving = p.amount - perUnit;
      if (saving > best.saving) best = { id: p.id, saving };
    }
    return best.id;
  }
  function cardInsidesMarkup(p) {
    const parts = cardInsides(p);
    const chips = parts.chips.map(c => c.color ? `<span data-swatch style="--swatch:${escape(c.color)}" aria-label="${escape(c.text)}" title="${escape(c.text)}"></span>` : `<span>${escape(c.text)}</span>`).join('') + (parts.more ? `<span>+${parts.more}</span>` : '');
    return {
      eyebrow: parts.eyebrow ? `<p class="menu-item__eyebrow">${escape(parts.eyebrow)}</p>` : '',
      points: parts.points.length ? `<ul class="menu-item__points">${parts.points.map(t => `<li>${escape(t)}</li>`).join('')}</ul>` : '',
      chips: chips ? `<p class="menu-item__chips">${chips}</p>` : '',
      deal: parts.deal ? `<p class="menu-item__deal">${escape(parts.deal)}</p>` : '',
      save: parts.save ? `<span class="menu-item__save">${escape(parts.save)}</span>` : '',
    };
  }
```

- [ ] **Step 4: Use it in the cards**

In `catalog/cards.js` `productCard(p)`, for the default card, compute `const inside = cardInsidesMarkup(p)` and insert, inside the article markup: `inside.eyebrow` before the name, `inside.points + inside.chips + inside.deal` after the description, `inside.save` right after the price element. Set the add button text: simple products `Agregar` (keep the icon), complex products `Ver opciones` (existing branch says «Elegir opciones»; change the visible label to «Ver opciones» for all three designs, keep the aria-label pattern).

In `customProductCard`, after the existing `fill('price', …)`:

```js
    const parts = cardInsides(p);
    const set = (name, html, empty) => { const node = field(name); if (!node) return; node.innerHTML = html; node.hidden = empty; };
    set('eyebrow', escape(parts.eyebrow), !parts.eyebrow);
    set('points', parts.points.map(t => `<li>${escape(t)}</li>`).join(''), !parts.points.length);
    set('chips', parts.chips.map(c => c.color ? `<span data-swatch style="--swatch:${escape(c.color)}" aria-label="${escape(c.text)}"></span>` : `<span>${escape(c.text)}</span>`).join('') + (parts.more ? `<span>+${parts.more}</span>` : ''), !parts.chips.length);
    set('deal', escape(parts.deal), !parts.deal);
    set('save', escape(parts.save), !parts.save);
```

In `catalog/render.js`, after each `el.innerHTML = …` for a catalog, add:

```js
      const shown = [...el.querySelectorAll('.menu-item')];
      el.dataset.cardDesign = cardDesign(shown.length);
      const bestId = bestValueId(shown.map(card => products().find(p => p.id === card.dataset.productId)).filter(Boolean));
      shown.forEach(card => card.toggleAttribute('data-card-best', Boolean(bestId) && card.dataset.productId === bestId));
      if (bestId) shown.find(card => card.dataset.productId === bestId)?.querySelector('.menu-item__badge, [data-product-field="badge"]') ?? shown.find(card => card.dataset.productId === bestId)?.insertAdjacentHTML('afterbegin', '<span class="menu-item__best">Mejor precio</span>');
```

Make sure the default card root carries `data-product-id="${escape(p.id)}"` (add it to the `<article class="menu-item"` opening tag).

In `look/dna-css.js`, append to the injected kit stylesheet (outside any DNA condition):

```css
[data-pagosya-catalog] .menu-item__eyebrow{margin:6px 0 0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;opacity:.7}
[data-pagosya-catalog] .menu-item__points{list-style:none;margin:6px 0;padding:0;display:grid;gap:3px;font-size:13px}
[data-pagosya-catalog] .menu-item__points li::before{content:"✓";margin-right:6px;color:var(--store-accent,currentColor)}
[data-pagosya-catalog] .menu-item__chips{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}
[data-pagosya-catalog] .menu-item__chips span{font-size:10px;font-weight:700;letter-spacing:.06em;border:1px solid currentColor;border-radius:99px;padding:3px 8px;opacity:.85}
[data-pagosya-catalog] .menu-item__chips [data-swatch]{width:14px;height:14px;padding:0;border-radius:50%;background:var(--swatch);border-color:rgba(0,0,0,.2)}
[data-pagosya-catalog] .menu-item__deal{margin:4px 0;font-size:12px;font-weight:700;color:#2e7d4f}
[data-pagosya-catalog] .menu-item__save{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;background:var(--store-accent,#c0392b);color:var(--store-on-accent,#fff);font-size:10px;font-weight:800;letter-spacing:.04em;vertical-align:middle}
[data-pagosya-catalog] .menu-item__best{position:absolute;top:10px;right:10px;z-index:2;padding:3px 9px;border-radius:99px;background:var(--store-accent,#c0392b);color:var(--store-on-accent,#fff);font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
[data-pagosya-catalog][data-card-design=showcase]:not([data-custom-cards]){display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:20px}
[data-pagosya-catalog][data-card-design=showcase] .menu-item:not([data-custom-product]){position:relative;padding:16px;border-radius:var(--store-radius,18px);background:var(--store-surface,#fbf6ea)}
[data-pagosya-catalog][data-card-design=showcase] .menu-item[data-card-best]:not([data-custom-product]){background:var(--store-foreground,#1d2b4f);color:var(--store-background,#fff)}
[data-pagosya-catalog][data-card-design=showcase] .menu-item:not([data-custom-product]) .menu-add{width:100%;justify-content:center;border-radius:99px}
[data-pagosya-catalog][data-card-design=split] .menu-item:not([data-custom-product]){display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:14px;align-items:center}
@media(max-width:640px){[data-pagosya-catalog][data-card-design=split] .menu-item:not([data-custom-product]){grid-template-columns:1fr}}
```

Add `'catalog/card-insides.js'` to PARTS after `'catalog/offers.js'`.

- [ ] **Step 5: Run the tests**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-card-insides.spec.ts src/storefront-source/source-commerce-card-sale.spec.ts src/storefront-source/source-commerce-contract.spec.ts --maxWorkers=2`
Expected: PASS. Then run the whole kit family in two batches (`ls src/storefront-source/source-commerce-*.spec.ts`, halves, `--maxWorkers=2`) and fix only what this task broke; a pre-existing failure is recorded, not fixed.

- [ ] **Step 6: Commit** — `git commit -m "feat(kit): richer product cards — eyebrow, points, chips, best deal, best value"`

---

### Task 3: Products anywhere (kit)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/catalog/render.js` (chosen sets; spotlight)
- Modify: `packages/storefront-kit/commerce-src/content/load.js` (lazy video play for spotlights)
- Test: `apps/api/src/storefront-source/source-commerce-placements.spec.ts`

**Interfaces:**
- Consumes: `productCard(p)`, `offerSquaresMarkup(p, variant)` (Task 1), `cardInsidesMarkup(p)` (Task 2).
- Produces: markup contracts — `[data-pagosya-catalog][data-products="id,id"]`, `[data-pagosya-catalog][data-category="<categoryId>"]`, `[data-pagosya-catalog][data-collection="<slug>"]`, `[data-pagosya-spotlight="<productId>"]` (kit fills `.spotlight` with a live buy card), `video[data-spotlight-video]` (kit plays/pauses in view).

- [ ] **Step 1: Write the failing tests**

```ts
describe('products anywhere', () => {
  const p = (id: string, extra = {}) => ({ id, name: id.toUpperCase(), amount: 5000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], ...extra });
  it('a chosen set shows only the named products, in the merchant order', async () => {
    const q = await open([p('a'), p('b'), p('c')], '<section id="regalos" data-pagosya-catalog data-products="c,a"></section>');
    expect([...q.all('#regalos .menu-item')].map((card: any) => card.dataset.productId)).toEqual(['c', 'a']);
  });
  it('a category or collection set shows that group', async () => {
    const q = await open([p('a', { categoryId: 'k' }), p('b')], '<section id="cafe" data-pagosya-catalog data-category="k"></section><section id="col" data-pagosya-catalog data-collection="verano"></section>', undefined, { collections: [{ id: 'x', name: 'Verano', slug: 'verano', productIds: ['b'] }] });
    expect([...q.all('#cafe .menu-item')].map((card: any) => card.dataset.productId)).toEqual(['a']);
    expect([...q.all('#col .menu-item')].map((card: any) => card.dataset.productId)).toEqual(['b']);
  });
  it('a deleted product disappears from blocks — Review Focus 4', async () => {
    const q = await open([p('a')], '<section id="set" data-pagosya-catalog data-products="gone"></section><div id="spot" data-pagosya-spotlight="gone"></div>');
    expect((q('#set') as any).hidden).toBe(true);
    expect((q('#spot') as any).hidden).toBe(true);
  });
  it('a spotlight renders a live buy card with price, offers and an add button', async () => {
    const q = await open([p('latte', { amount: 2800 })], '<div id="spot" data-pagosya-spotlight="latte"></div>', undefined, { bundlesEnabled: true, bundles: [{ id: 'b', name: 'x', kind: 'FIXED', items: [{ productId: 'latte', quantity: 3 }], minimumQuantity: 2, discountPercent: 15 }] });
    expect(q('#spot .spotlight__name')?.textContent).toBe('LATTE');
    expect(q('#spot .spotlight__price')?.textContent).toContain('28');
    expect(q('#spot [data-offer-square="pack:3"]')).not.toBeNull();
    expect(q('#spot button[data-add="latte"]')).not.toBeNull();
  });
  it('spotlight videos are muted, inline and looping', async () => {
    const q = await open([p('latte')], '<div data-pagosya-spotlight="latte"><video data-spotlight-video src="assets/latte.mp4"></video></div>');
    const video: any = q('video[data-spotlight-video]');
    expect([video.muted, video.loop, video.playsInline, video.getAttribute('preload')]).toEqual([true, true, true, 'none']);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx jest src/storefront-source/source-commerce-placements.spec.ts` → FAIL (all products shown).

- [ ] **Step 3: Implement**

In `catalog/render.js`, at the start of the `[data-pagosya-catalog]` loop body, before `selected` is computed:

```js
      const named = (el.getAttribute('data-products') || '').split(',').map(id => id.trim()).filter(Boolean);
      const byCategory = el.getAttribute('data-category'), byCollection = el.getAttribute('data-collection');
      if (named.length || byCategory || byCollection) {
        // Chosen set (showcase commerce §3): only these products, merchant order; a deleted one is skipped, an empty set hides.
        const set = named.length ? named.map(id => products().find(p => p.id === id)).filter(Boolean)
          : byCategory ? products().filter(p => p.categoryId === byCategory)
          : products().filter(p => (collections().find(c => c.slug === byCollection)?.productIds || []).includes(p.id));
        el.hidden = !set.length;
        el.innerHTML = set.map(productCard).join('');
        structureCatalog(el);
        return;
      }
```

After the catalog loop:

```js
    document.querySelectorAll('[data-pagosya-spotlight]').forEach(el => {
      const p = products().find(item => item.id === el.getAttribute('data-pagosya-spotlight'));
      el.hidden = !p;
      if (!p) return;
      const inside = cardInsidesMarkup(p), image = galleryImages(p)[0];
      const card = `<div class="spotlight" data-pagosya-product>${image ? `<img class="spotlight__image" src="${escape(image)}" alt="${escape(p.name)}" loading="lazy">` : ''}${inside.eyebrow}<h3 class="spotlight__name">${escape(p.name)}</h3><p class="spotlight__price">${money(price(p), p.currency)}${inside.save}</p>${inside.points}${offerSquaresMarkup(p, undefined)}<button type="button" class="menu-add spotlight__add" ${p.variants?.length || p.extras?.length ? `data-product="${escape(p.id)}">Ver opciones` : `data-add="${escape(p.id)}">Agregar`}</button></div>`;
      el.querySelector(':scope > .spotlight')?.remove();
      el.insertAdjacentHTML(el.getAttribute('data-side') === 'right' ? 'beforeend' : 'afterbegin', card);
      el.querySelectorAll('video[data-spotlight-video]').forEach(video => { video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('preload', 'none'); });
    });
```

Square clicks inside a spotlight act on that product: in `click-actions.js` the Task 1 branch uses `selectedProduct`; for a spotlight, set `selectedProduct` before handling: `const spot = button.closest('[data-pagosya-spotlight]'); if (spot) { /* a spotlight pack adds its quantity directly */ const [kind, value] = button.dataset.offerSquare.split(':'); spot.querySelectorAll('[data-offer-square]').forEach(s => s.setAttribute('aria-checked', String(s === button))); const add = spot.querySelector('[data-add]'); if (add) add.dataset.quantity = kind === 'pack' ? value : '1'; return; }` and make the existing `[data-add]` handler read `Number(button.dataset.quantity) || 1` as the quantity it adds (check its current signature in `click-actions.js`; it calls `addToCart(id, …)` — pass the quantity there).

In `content/load.js` add a viewport observer: `document.querySelectorAll('video[data-spotlight-video]').forEach(v => { if (typeof IntersectionObserver !== 'function') return; new IntersectionObserver(([e]) => { if (e.isIntersecting) { v.preload = 'auto'; v.play?.().catch(() => {}); } else v.pause?.(); }, { rootMargin: '200px' }).observe(v); v.addEventListener('click', () => { v.muted = !v.muted; }); });`

Spotlight CSS appended to `look/dna-css.js`:

```css
[data-pagosya-spotlight]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px;align-items:center}
[data-pagosya-spotlight] .spotlight{display:grid;gap:8px;padding:16px;border-radius:var(--store-radius,16px);background:var(--store-surface,#fff);border:1px solid rgba(0,0,0,.08)}
[data-pagosya-spotlight] .spotlight__image{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:calc(var(--store-radius,16px) - 4px)}
[data-pagosya-spotlight] .spotlight__name{margin:0;font-family:var(--store-heading-font,inherit)}
[data-pagosya-spotlight] video{width:100%;border-radius:var(--store-radius,16px);background:#111}
@media(max-width:760px){[data-pagosya-spotlight]{grid-template-columns:1fr}}
```

(The `.offer-square` rules from Task 1 are scoped to `[data-pagosya-product]`; the spotlight card carries `data-pagosya-product` so they apply. Verify `--pd-*` variables resolve there — they are declared on `[data-pagosya-product]`.)

- [ ] **Step 4: Run** — `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-placements.spec.ts src/storefront-source/source-commerce-offer-squares.spec.ts src/storefront-source/source-commerce-card-insides.spec.ts --maxWorkers=2` → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(kit): chosen product sets, product spotlights and spotlight videos"`

---

### Task 4: Sort and filter (kit)

**Files:**
- Create: `packages/storefront-kit/commerce-src/catalog/filters.js` (PARTS: before `'catalog/render.js'`)
- Modify: `packages/storefront-kit/commerce-src/catalog/render.js` (apply filters/sort on full catalog pages; render controls)
- Modify: `packages/storefront-kit/commerce-src/shared/click-actions.js` (filter/sort events)
- Modify: `packages/storefront-kit/commerce-src/look/dna-css.js` (CSS)
- Test: `apps/api/src/storefront-source/source-commerce-filters.spec.ts`

**Interfaces:**
- Consumes: `optionGroups(p)`, `swatchColor`, `price`, `offerOptions` (Task 1), `bestValueId` logic (Task 2) for «Mejor oferta» savings.
- Produces: `filterGroups(items)` → `Array<{ key, label, kind: 'check'|'swatch'|'range'|'toggle', values }>`; `readFilterState()` / `writeFilterState(state)` (URL `?f_<key>=v1,v2&precio=min-max&orden=…`); `applyFilters(items, state)`; `sortItems(items, order)`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('sort and filter', () => {
  const p = (id: string, amount: number, extra = {}) => ({ id, name: id, amount, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [], createdAt: '2026-10-01T00:00:00.000Z', ...extra });
  const shop = '<main data-pagosya-catalog data-catalog-full data-pagosya-filters></main>';
  const six = [p('a', 1000), p('b', 2000, { discountPercent: 10 }), p('c', 3000), p('d', 4000), p('e', 5000), p('f', 6000, { createdAt: '2026-10-18T00:00:00.000Z' })];
  it('no filters under 6 products', async () => {
    const q = await open(six.slice(0, 5), shop);
    expect(q('.catalog-filters')).toBeNull();
  });
  it('shows only filters the data supports and every sort order', async () => {
    const q = await open(six, shop);
    expect([...q.all('.catalog-filters [data-filter-group]')].map((g: any) => g.dataset.filterGroup)).toEqual(['precio', 'descuento']);
    expect([...q.all('.catalog-filters select[name=orden] option')].map((o: any) => o.value)).toEqual(['destacados', 'precio-asc', 'precio-desc', 'novedades', 'mejor-oferta']);
  });
  it('sorts by price and by newest', async () => {
    const asc = await open(six, shop, undefined, undefined, '?orden=precio-desc');
    expect([...asc.all('.menu-item')].map((c: any) => c.dataset.productId)[0]).toBe('f');
    const neu = await open(six, shop, undefined, undefined, '?orden=novedades');
    expect([...neu.all('.menu-item')].map((c: any) => c.dataset.productId)[0]).toBe('f');
  });
  it('filters by colour and size from variants and keeps the state in the URL', async () => {
    const v = (value: string, group = 'Color') => ({ id: value, name: value, amount: 1000, options: [{ name: group, value }] });
    const items = [...six, p('m', 1500, { variants: [v('Rojo'), v('Azul')] }), p('n', 1500, { variants: [v('M', 'Talla')] })];
    const q = await open(items, shop, undefined, undefined, '?f_color=rojo');
    expect([...q.all('.menu-item')].map((c: any) => c.dataset.productId)).toEqual(['m']);
    expect(q('.catalog-filters__active')?.textContent).toContain('Rojo');
  });
  it('option names group regardless of case and accents — Review Focus 3', async () => {
    const v = (name: string, value: string) => ({ id: name + value, name: value, amount: 1000, options: [{ name, value }] });
    const items = [...six, p('x', 1500, { variants: [v('TALLA', 'S')] }), p('y', 1500, { variants: [v('talla', 'M')] }), p('z', 1500, { variants: [v('Colour', 'Red')] })];
    const q = await open(items, shop);
    const groups = [...q.all('.catalog-filters [data-filter-group]')].map((g: any) => g.dataset.filterGroup);
    expect(groups.filter((g: string) => g === 'talla').length).toBe(1);
    expect(q('[data-filter-group="colour"] [data-swatch]')).toBeNull(); // «Red» under «Colour» is a recognised colour group: dots only for known colour values
  });
  it('zero results says so and offers to clear', async () => {
    const q = await open(six, shop, undefined, undefined, '?precio=9000-9500');
    expect(q('.catalog-empty')?.textContent).toContain('No hay productos con estos filtros');
    expect(q('[data-filters-clear]')).not.toBeNull();
  });
});
```

(Extend `open` with a fifth `search` argument used for the JSDOM `url` query.)

- [ ] **Step 2: Run to verify they fail** → FAIL (`.catalog-filters` missing).

- [ ] **Step 3: Implement `catalog/filters.js`**

```js
  /* Sort & filter (showcase commerce §4): only on full catalog pages with ≥ 6 products; a filter appears only when the data
   * has it; state lives in the URL so a filtered page can be shared and the back button works. */
  const fold = text => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const SORTS = [['destacados', 'Destacados'], ['precio-asc', 'Precio ↑'], ['precio-desc', 'Precio ↓'], ['novedades', 'Novedades'], ['mejor-oferta', 'Mejor oferta']];
  function filterGroups(items) {
    const groups = [];
    const cats = (store.categories || []).filter(c => items.some(p => p.categoryId === c.id));
    if (cats.length > 1) groups.push({ key: 'categoria', label: 'Categoría', kind: 'check', values: cats.map(c => ({ value: c.id, text: c.name })) });
    const prices = items.map(p => price(p));
    if (Math.min(...prices) < Math.max(...prices)) groups.push({ key: 'precio', label: 'Precio', kind: 'range', values: [Math.min(...prices), Math.max(...prices)] });
    const options = new Map();
    for (const p of items) for (const g of optionGroups(p) || []) {
      const key = fold(g.name);
      const entry = options.get(key) || { key, label: g.name, values: new Map() };
      for (const value of g.values) entry.values.set(fold(value), { value: fold(value), text: value, color: swatchColor(g.name, value) });
      options.set(key, entry);
    }
    for (const entry of options.values()) groups.push({ key: entry.key, label: entry.label, kind: [...entry.values.values()].some(v => v.color) ? 'swatch' : 'check', values: [...entry.values.values()] });
    if (items.some(p => !isMembership(p) && price(p) < p.amount)) groups.push({ key: 'descuento', label: 'Con descuento', kind: 'toggle', values: [] });
    if (items.some(p => p.stock === 0) && items.some(p => p.stock !== 0)) groups.push({ key: 'disponible', label: 'Disponible', kind: 'toggle', values: [] });
    if (items.some(p => offerOptions(p, undefined).length)) groups.push({ key: 'ofertas', label: 'Packs y suscripción', kind: 'toggle', values: [] });
    return groups;
  }
  function readFilterState() {
    const params = new URLSearchParams(window.PAGOSYA_PREVIEW_QUERY || location.search);
    const state = { orden: SORTS.some(([v]) => v === params.get('orden')) ? params.get('orden') : 'destacados', precio: null, sets: {}, toggles: new Set() };
    const range = /^(\d+)-(\d+)$/.exec(params.get('precio') || '');
    if (range) state.precio = [Number(range[1]) * 100, Number(range[2]) * 100];
    for (const [key, value] of params) if (key.startsWith('f_')) state.sets[key.slice(2)] = value.split(',').map(fold).filter(Boolean);
    for (const key of ['descuento', 'disponible', 'ofertas']) if (params.get(key) === '1') state.toggles.add(key);
    return state;
  }
  function writeFilterState(state) {
    const params = new URLSearchParams(location.search);
    [...params.keys()].filter(k => k.startsWith('f_') || ['orden', 'precio', 'descuento', 'disponible', 'ofertas'].includes(k)).forEach(k => params.delete(k));
    if (state.orden !== 'destacados') params.set('orden', state.orden);
    if (state.precio) params.set('precio', `${Math.floor(state.precio[0] / 100)}-${Math.ceil(state.precio[1] / 100)}`);
    for (const [key, values] of Object.entries(state.sets)) if (values.length) params.set(`f_${key}`, values.join(','));
    for (const key of state.toggles) params.set(key, '1');
    history.replaceState(null, '', `${location.pathname}${params.toString() ? `?${params}` : ''}`);
  }
  function applyFilters(items, state) {
    return items.filter(p => {
      if (state.precio && (price(p) < state.precio[0] || price(p) > state.precio[1])) return false;
      if (state.toggles.has('descuento') && !(price(p) < p.amount)) return false;
      if (state.toggles.has('disponible') && p.stock === 0) return false;
      if (state.toggles.has('ofertas') && !offerOptions(p, undefined).length) return false;
      for (const [key, values] of Object.entries(state.sets)) {
        if (!values.length) continue;
        if (key === 'categoria') { if (!values.includes(fold(p.categoryId))) return false; continue; }
        const group = (optionGroups(p) || []).find(g => fold(g.name) === key);
        if (!group || !group.values.some(v => values.includes(fold(v)))) return false;
      }
      return true;
    });
  }
  function sortItems(items, order) {
    const saving = p => p.amount - Math.min(price(p), ...offerOptions(p, undefined).map(o => o.perUnit));
    const list = [...items];
    if (order === 'precio-asc') list.sort((a, b) => price(a) - price(b));
    if (order === 'precio-desc') list.sort((a, b) => price(b) - price(a));
    if (order === 'novedades') list.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
    if (order === 'mejor-oferta') list.sort((a, b) => saving(b) - saving(a));
    return list;
  }
  function filtersMarkup(all, state, shown) {
    const groups = filterGroups(all);
    const control = g => g.kind === 'range'
      ? `<fieldset data-filter-group="precio"><legend>Precio</legend><label>Desde <input type="number" name="precio-min" min="0" value="${Math.floor((state.precio?.[0] ?? g.values[0]) / 100)}"></label><label>Hasta <input type="number" name="precio-max" min="0" value="${Math.ceil((state.precio?.[1] ?? g.values[1]) / 100)}"></label></fieldset>`
      : g.kind === 'toggle' ? `<label data-filter-group="${g.key}"><input type="checkbox" name="${g.key}" ${state.toggles.has(g.key) ? 'checked' : ''}> ${escape(g.label)}</label>`
      : `<fieldset data-filter-group="${g.key}"><legend>${escape(g.label)}</legend>${g.values.map(v => `<label${v.color ? ' data-swatch-option' : ''}><input type="checkbox" name="f_${g.key}" value="${escape(v.value)}" ${(state.sets[g.key] || []).includes(v.value) ? 'checked' : ''}>${v.color ? `<span data-swatch style="--swatch:${escape(v.color)}"></span>` : ''} ${escape(v.text)}</label>`).join('')}</fieldset>`;
    const active = [...Object.entries(state.sets).flatMap(([key, values]) => values.map(value => [key, value])), ...[...state.toggles].map(key => [key, ''])];
    const layout = all.length >= 9 || groups.length >= 3 ? 'sidebar' : 'bar';
    return `<div class="catalog-filters" data-filters-layout="${layout}"><button type="button" class="catalog-filters__open" data-filters-open aria-expanded="false">Filtrar${active.length ? ` (${active.length})` : ''}</button>`
      + `<label class="catalog-filters__sort">Ordenar <select name="orden">${SORTS.map(([value, text]) => `<option value="${value}" ${state.orden === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`
      + `<form class="catalog-filters__panel" data-filters-form>${groups.map(control).join('')}<button type="submit" class="catalog-filters__apply">Ver ${shown} productos</button></form>`
      + (active.length ? `<p class="catalog-filters__active">${active.map(([key, value]) => `<button type="button" data-filter-remove="${escape(key)}:${escape(value)}">${escape(value || key)} ✕</button>`).join('')}<button type="button" data-filters-clear>Borrar todo</button></p>` : '')
      + `<p class="catalog-filters__count" aria-live="polite">${shown} productos</p></div>`;
  }
```

In `catalog/render.js`, in the full-catalog branch (`layout === 'all'` / the `else` that renders `selected.map(productCard)`), when `el.hasAttribute('data-pagosya-filters') || fullCatalogPage` and `!el.hasAttribute('data-products')` and `selected.length >= 6`:

```js
        const state = readFilterState();
        const shownItems = sortItems(applyFilters(selected, state), state.orden);
        el.innerHTML = filtersMarkup(selected, state, shownItems.length) + (shownItems.length ? shownItems.map(productCard).join('') : '<p class="catalog-empty">No hay productos con estos filtros. <button type="button" data-filters-clear>Borrar filtros</button></p>');
```

In `shared/click-actions.js`, handle: `[data-filters-clear]` → `writeFilterState({ orden: 'destacados', precio: null, sets: {}, toggles: new Set() }); render();`; `[data-filter-remove]` → remove that value from the state, write, render; `[data-filters-open]` → toggle `aria-expanded` and `.catalog-filters[data-open]`. Add a `change` listener on `document` for `.catalog-filters` inputs/selects: build state from the form (`f_*` checkboxes into `sets`, toggles, `precio-min/max` × 100, `orden`), `writeFilterState(state); render();` (desktop applies immediately; the phone sheet's «Ver N productos» submit just closes the sheet — `preventDefault`, remove `data-open`).

CSS in `look/dna-css.js`:

```css
.catalog-filters{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:16px}
.catalog-filters__panel{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:flex-start}
.catalog-filters fieldset{border:1px solid rgba(0,0,0,.12);border-radius:12px;padding:8px 12px;margin:0}
.catalog-filters legend{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
.catalog-filters [data-swatch]{display:inline-block;width:14px;height:14px;border-radius:50%;background:var(--swatch);vertical-align:middle;border:1px solid rgba(0,0,0,.2)}
.catalog-filters__active button{border:0;border-radius:99px;padding:4px 10px;background:var(--store-surface,#f2ece0);font:inherit;font-size:12px;cursor:pointer}
.catalog-filters__open,.catalog-filters__apply{display:none}
.catalog-filters__sort{margin-left:auto}
[data-pagosya-catalog]:has(>.catalog-filters[data-filters-layout=sidebar]){display:grid;grid-template-columns:220px minmax(0,1fr)}
.catalog-filters[data-filters-layout=sidebar] .catalog-filters__panel{flex-direction:column}
@media(max-width:760px){
  .catalog-filters__open{display:inline-flex;border:1px solid currentColor;border-radius:99px;padding:6px 14px;background:none;font:inherit}
  .catalog-filters__panel{display:none;position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:80vh;overflow:auto;flex-direction:column;padding:16px;border-radius:16px 16px 0 0;background:var(--store-background,#fff);box-shadow:0 -10px 30px rgba(0,0,0,.2)}
  .catalog-filters[data-open] .catalog-filters__panel{display:flex}
  .catalog-filters__apply{display:block;width:100%;border:0;border-radius:99px;padding:12px;background:var(--store-foreground,#111);color:var(--store-background,#fff);font-weight:700}
  [data-pagosya-catalog]:has(>.catalog-filters){display:grid;grid-template-columns:1fr}
}
```

- [ ] **Step 4: Run** — `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-filters.spec.ts src/storefront-source/source-commerce-placements.spec.ts --maxWorkers=2` → PASS; then the two halves of `source-commerce-*.spec.ts` as in Task 2.

- [ ] **Step 5: Commit** — `git commit -m "feat(kit): sort and filter on the shop page, from the store's own data"`

---

### Task 5: Esencial — card and offer styles, card fields

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (`master.variants`: `cards`, `offers`)
- Modify: `packages/store-templates/templates/esencial/components/home.tsx` (card template fields; `data-es-cards`)
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (three card designs; `--store-*` mapping)
- Modify: `apps/api/src/storefront-source/source-master.ts` (`masterShowcase`)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (write `config.showcase` in assemble + refill)
- Test: `packages/store-templates/test/esencial.test.mjs`, `apps/api/src/storefront-source/source-master.spec.ts`

**Interfaces:**
- Consumes: kit `config.showcase` (Tasks 1–2), card fields (Task 2).
- Produces: `masterShowcase(variants: Partial<MasterVariants> | undefined): { cards?: string; offers?: string }`.

- [ ] **Step 1: Failing tests**

`esencial.test.mjs`:

```js
test('Esencial rolls card and offer styles, and its card fills the kit fields', () => {
  assert.deepEqual(esencial.master.variants.cards, ['showcase', 'compact', 'split']);
  assert.deepEqual(esencial.master.variants.offers, ['steps', 'grid', 'rows']);
  const home = file('components/home.tsx');
  for (const field of ['eyebrow', 'points', 'chips', 'deal', 'save']) assert.match(home, new RegExp(`data-product-field="${field}"`), field);
  assert.match(home, /data-es-cards=\{/);
  const css = file('styles/globals.css');
  for (const id of esencial.master.variants.cards) assert.match(css, new RegExp(`data-es-cards="${id}"`), id);
  assert.match(css, /--store-foreground:var\(--es-ink\)/);
});
```

`source-master.spec.ts`:

```ts
describe('masterShowcase', () => {
  it('passes the rolled card and offer styles to the kit config', () => {
    expect(masterShowcase({ cards: 'showcase', offers: 'rows', sections: [] } as any)).toEqual({ cards: 'showcase', offers: 'rows' });
    expect(masterShowcase({ cards: 'nope', sections: [] } as any)).toEqual({});
    expect(masterShowcase(undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run** — `cd packages/store-templates && npm test` and `cd apps/api && npx jest src/storefront-source/source-master.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

`template.json` `master.variants`: add `"cards": ["showcase", "compact", "split"]` and `"offers": ["steps", "grid", "rows"]`.

`source-master.ts`:

```ts
/** Showcase commerce: the rolled card design and offer-square layout, read by the kit from config.showcase. */
export function masterShowcase(variants: Partial<MasterVariants> | undefined): { cards?: string; offers?: string } {
  const cards = ['showcase', 'compact', 'split'].includes(String(variants?.cards)) ? String(variants!.cards) : undefined;
  const offers = ['steps', 'grid', 'rows'].includes(String(variants?.offers)) ? String(variants!.offers) : undefined;
  return { ...(cards ? { cards } : {}), ...(offers ? { offers } : {}) };
}
```

`source-templates.ts`: where the config object is built in `assembleTemplateRevision` add `...(settings ? { showcase: masterShowcase(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) } : {})`; in `refillMasterFiles` config.js rewrite add `showcase: { ...(config.showcase ?? {}), ...masterShowcase({ ...(state.variants ?? {}), ...(change.variants ?? {}) }) }`. Import `masterShowcase`.

`home.tsx` card template (inside `<template data-pagosya-product-template>`):

```tsx
          <article className="es-card" data-es-card={card}>
            <a className="es-card__media" data-product-link href="product.html"><img data-product-field="image" alt="Foto del producto" /></a>
            <p className="es-card__eyebrow" data-product-field="eyebrow" />
            <h3 className="es-card__name" data-product-field="name">Producto</h3>
            <ul className="es-card__points" data-product-field="points" />
            <p className="es-card__chips" data-product-field="chips" />
            <p className="es-card__deal" data-product-field="deal" />
            <div className="es-card__row">
              <p className="es-card__price" data-product-field="price" /><span className="es-card__save" data-product-field="save" />
              …existing add button branch unchanged…
            </div>
          </article>
```

and on the grid: `<div className="es-grid" data-es-grid={variant('grid', 'grid4')} data-es-cards={variant('cards', 'compact')} data-pagosya-catalog />`.

`globals.css` — map Esencial's theme onto the kit's store variables (inside `.es{}` root rule, i.e. append `.es{--store-foreground:var(--es-ink);--store-background:var(--es-paper);--store-surface:var(--es-muted);--store-accent:var(--es-accent);--store-on-accent:var(--es-on-accent);--store-radius:var(--es-radius,6px);--store-heading-font:var(--es-heading)}`) and the three designs:

```css
.es-card__eyebrow{margin:0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:color-mix(in srgb,var(--es-ink) 65%,transparent)}
.es-card__points{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:13px}
.es-card__points li::before{content:"✓";margin-right:6px;color:var(--es-accent)}
.es-card__chips{display:flex;flex-wrap:wrap;gap:4px;margin:0}
.es-card__chips span{font-size:10px;font-weight:600;letter-spacing:.06em;border:1px solid currentColor;border-radius:99px;padding:2px 8px}
.es-card__chips [data-swatch]{width:14px;height:14px;padding:0;border-radius:50%;background:var(--swatch)}
.es-card__deal{margin:0;font-size:12px;font-weight:600;color:var(--es-accent)}
.es-card__save{padding:2px 8px;border-radius:99px;background:var(--es-accent);color:var(--es-on-accent);font-size:10px;font-weight:700}
.es-card [hidden]{display:none!important}
.es-grid[data-es-cards="compact"]{}
.es-grid[data-es-cards="compact"] .es-card__points{display:none}
.es-grid[data-es-cards="showcase"]{grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))!important;gap:20px}
.es-grid[data-es-cards="showcase"] .es-card{padding:16px;border-radius:calc(var(--es-radius,6px) * 2);background:var(--es-muted)}
.es-grid[data-es-cards="showcase"] .es-card[data-card-best]{background:var(--es-deep);color:var(--es-on-deep)}
.es-grid[data-es-cards="showcase"] .es-card__name{font:400 24px/1.2 var(--es-heading)}
.es-grid[data-es-cards="split"]{grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr))!important}
.es-grid[data-es-cards="split"] .es-card{grid-template-columns:minmax(0,2fr) minmax(0,3fr);column-gap:16px;align-items:center}
.es-grid[data-es-cards="split"] .es-card__media{grid-row:span 7}
@media (max-width:760px){.es-grid[data-es-cards="split"] .es-card{grid-template-columns:1fr}.es-grid[data-es-cards="split"] .es-card__media{grid-row:auto}}
```

Ruling to ledger: Esencial's earlier `card` part (plain/framed/overlay/hover2/bar) applies under `compact`; `showcase` and `split` carry their own look and the `card` part's overlay/bar rules are scoped by adding `.es-grid[data-es-cards="compact"]` in front of the existing `.es-card[data-es-card="overlay"…]`/`bar` selectors.

- [ ] **Step 4: Run** — package `npm test`; API `npx jest src/storefront-source/source-master.spec.ts src/storefront-source/source-master-esencial.spec.ts src/storefront-source/source-master-refill.spec.ts --maxWorkers=2` → PASS. Screenshot QA: `QA_TEMPLATES=1 TEMPLATE_IDS=esencial MASTER_VARIANT=cards:showcase,compact,split QA_OUT=$CLAUDE_JOB_DIR/tmp/qa-sc npx jest source-templates-qa.tool` and check by eye at 1280 and 390.

- [ ] **Step 5: Commit** — `git commit -m "feat(templates): Esencial card designs and offer layouts from the store dice"`

---

### Task 6: YAPI — place products, never made-up ones

**Files:**
- Create: `apps/api/src/storefront-source/source-product-placements.ts`
- Modify: `apps/api/src/storefront-source/source-commerce-contract.ts` (call the check)
- Modify: `apps/api/src/storefront-source/agent/agent-tools.ts` (`find_products` tool)
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.ts` (how to place products)
- Test: `apps/api/src/storefront-source/source-product-placements.spec.ts`, `apps/api/src/storefront-source/agent/agent-tools.spec.ts`

**Interfaces:**
- Produces: `productPlacementFindings(files: SourceProjectFileDto[], data: { items: Array<{ id: string; name: string }>; categories?: Array<{ id: string }>; collections?: Array<{ slug: string }> }): string[]`; `findProducts(data, query: string): Array<{ id, name, category: string | null, price: string }>`.

- [ ] **Step 1: Failing tests**

```ts
import { findProducts, productPlacementFindings } from './source-product-placements';
const data = { items: [{ id: 'p1', name: 'Caja degustación', categoryId: 'k', amount: 16000, currency: 'BOB' }, { id: 'p2', name: 'Taza Antojo roja', amount: 6000, currency: 'BOB' }], categories: [{ id: 'k', name: 'Café' }], collections: [{ slug: 'verano' }] };
const page = (html: string) => [{ path: 'regalos.html', content: html }];
it('accepts placements of real products, categories and collections', () => {
  expect(productPlacementFindings(page('<div data-pagosya-catalog data-products="p1,p2"></div><div data-pagosya-spotlight="p2"></div><div data-pagosya-catalog data-category="k"></div><div data-pagosya-catalog data-collection="verano"></div>'), data)).toEqual([]);
});
it('refuses an unknown product, category or collection, naming it', () => {
  const findings = productPlacementFindings(page('<div data-pagosya-catalog data-products="p1,fake"></div><div data-pagosya-spotlight="ghost"></div><div data-pagosya-catalog data-category="nope"></div>'), data);
  expect(findings.join(' ')).toMatch(/fake/);
  expect(findings.join(' ')).toMatch(/ghost/);
  expect(findings.join(' ')).toMatch(/nope/);
});
it('also reads placements in TSX sources', () => {
  expect(productPlacementFindings([{ path: 'components/regalos.tsx', content: '<section data-pagosya-catalog data-products="zzz" />' }], data)).toHaveLength(1);
});
it('finds products by a loose name', () => {
  expect(findProducts(data, 'taza roja').map(p => p.id)).toEqual(['p2']);
  expect(findProducts(data, 'café')).toEqual([expect.objectContaining({ id: 'p1', category: 'Café' })]);
});
```

`agent-tools.spec.ts` — add: `find_products` is in `AGENT_TOOLS` names and, called on a toolbox whose workspace `config.js` holds `window.PAGOSYA_CONFIG = {"data":{"items":[{"id":"p1","name":"Caja"}]}}`, returns `[{ id: 'p1', … }]` (follow the file's existing toolbox construction helper).

- [ ] **Step 2: Run** — `npx jest src/storefront-source/source-product-placements.spec.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `source-product-placements.ts`**

```ts
/** Showcase commerce §3: blocks that place products must name the store's real products, categories and collections. */
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

type Catalog = { items: Array<{ id: string; name: string; categoryId?: string | null; amount?: number; currency?: string }>; categories?: Array<{ id: string; name?: string }>; collections?: Array<{ slug: string }> };
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const attr = (source: string, name: string) => [...source.matchAll(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'g'))].map(match => match[1]);

export function productPlacementFindings(files: SourceProjectFileDto[], data: Catalog): string[] {
  const ids = new Set(data.items.map(item => item.id)), categories = new Set((data.categories ?? []).map(c => c.id)), collections = new Set((data.collections ?? []).map(c => c.slug));
  const findings: string[] = [];
  for (const file of files) {
    if (!/\.(html|tsx|jsx)$/.test(file.path)) continue;
    const unknown = [...attr(file.content, 'data-products').flatMap(list => list.split(',').map(id => id.trim()).filter(Boolean)), ...attr(file.content, 'data-pagosya-spotlight')].filter(id => !ids.has(id));
    if (unknown.length) findings.push(`${file.path}: estos productos no existen en la tienda: ${[...new Set(unknown)].join(', ')}. Usa find_products para obtener el id real.`);
    const badCategory = attr(file.content, 'data-category').filter(id => !categories.has(id));
    if (badCategory.length) findings.push(`${file.path}: categoría desconocida: ${badCategory.join(', ')}.`);
    const badCollection = attr(file.content, 'data-collection').filter(slug => !collections.has(slug));
    if (badCollection.length) findings.push(`${file.path}: colección desconocida: ${badCollection.join(', ')}.`);
  }
  return findings;
}

export function findProducts(data: Catalog, query: string) {
  const words = fold(query).split(/\s+/).filter(word => word.length > 1);
  const category = (id?: string | null) => (data.categories ?? []).find(c => c.id === id)?.name ?? null;
  return data.items
    .map(item => ({ item, score: words.filter(word => fold(`${item.name} ${category(item.categoryId) ?? ''}`).includes(word)).length }))
    .filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 10)
    .map(({ item }) => ({ id: item.id, name: item.name, category: category(item.categoryId), price: typeof item.amount === 'number' ? `${item.currency ?? 'BOB'} ${(item.amount / 100).toFixed(2)}` : '' }));
}
```

In `assertSourceCommerceContract`, after `config` is parsed: `const placements = productPlacementFindings(snapshot.files, { items: config.data?.items ?? [], categories: config.data?.categories, collections: config.data?.collections }); if (placements.length) throw new BadRequestException(placements[0]);`

In `agent-tools.ts` add to `AGENT_TOOLS`: `tool('find_products', 'Busca productos reales de la tienda por nombre o categoría y devuelve su id, nombre, categoría y precio. Úsala antes de colocar productos con data-products o data-pagosya-spotlight; nunca inventes ids.', { query: text })`, add `'find_products'` to `AgentToolName`, and in the dispatch: `if (name === 'find_products') { const config = parseConfig(ws.read('config.js')); return findProducts(config?.data ?? { items: [] }, String(args.query)); }` (use the file's existing config parser helper if present; else `JSON.parse(/window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/.exec(source)[1])` guarded by try/catch returning `[]`).

In `agent-prompt.ts`, add to the commerce rules block: «Para mostrar productos elegidos en una página: `<section data-pagosya-catalog data-products="id1,id2">`; una categoría: `data-category="<id>"`; una colección: `data-collection="<slug>"`. Un producto con texto o video al lado: `<div data-pagosya-spotlight="<id>" data-side="left|right">` con tu texto o `<video data-spotlight-video src="assets/…" poster="assets/…">` dentro; la plataforma dibuja la foto, el precio, las ofertas y el botón. Busca los ids con find_products. Si el comercio nombra un video que no subió, pídeselo.»

- [ ] **Step 4: Run** — `npx jest src/storefront-source/source-product-placements.spec.ts src/storefront-source/agent/agent-tools.spec.ts src/storefront-source/source-commerce-contract.spec.ts src/storefront-source/agent/agent-prompt.spec.ts --maxWorkers=2` → PASS (update a pinned prompt snapshot/hash in `agent-prompt.spec.ts` only if the test pins the rules text — ledger it).

- [ ] **Step 5: Commit** — `git commit -m "feat(yapi): place real products anywhere — find_products and a save check for unknown ids"`

---

### Task 7: Labels and card eyebrow (DB) — OWNER GATE

**STOP before Step 1 until the owner has applied the migration** (the dev API reads every column of `PaymentLink`; adding the Prisma field before the column exists breaks the running app). Write the migration file, ask the owner to run `cd apps/api && npx prisma migrate deploy`, wait for confirmation.

**Files:**
- Create: `apps/api/prisma/migrations/20261020090000_showcase_labels/migration.sql`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/product-content/commerce-content.dto.ts` (`BundleDto.label`), `commerce-content.service.ts` (`createBundle`)
- Modify: `apps/api/src/payment-links/dto/update-product-subscriptions.dto.ts` (`label`), `product-subscriptions.ts` (write label)
- Modify: `apps/api/src/payment-links/dto/create-payment-link.dto.ts` (`cardEyebrow`), `payment-links.service.ts` (create/update)
- Modify: `apps/api/src/stores/public-stores.service.ts` (serve `label` on bundles and subscription options, `cardEyebrow` on items)
- Modify: `apps/api/src/product-content/product-page-writer.ts`, `product-page-writer.service.ts` (write eyebrow)
- Test: `commerce-content.service.spec.ts`, `product-subscriptions.spec.ts`, `public-stores.service.spec.ts` (or the existing public-store spec), `product-page-writer.spec.ts`

- [ ] **Step 0: Migration (owner applies)**

```sql
ALTER TABLE "StoreBundle" ADD COLUMN "label" TEXT;
ALTER TABLE "ProductSubscriptionOption" ADD COLUMN "label" TEXT;
ALTER TABLE "PaymentLink" ADD COLUMN "cardEyebrow" TEXT;
```

Schema: `label String?` on `StoreBundle` and `ProductSubscriptionOption`; `cardEyebrow String?` on `PaymentLink` (comment: showcase commerce 2026-10-19 — ≤ 24 / ≤ 28 chars, validated in DTOs). Run `npx prisma generate` (no DB access).

- [ ] **Step 1: Failing tests**

- `commerce-content.service.spec.ts`: `createBundle(…, { name: 'Lleva 2', kind: 'FIXED', items: [{ productId: 'p', quantity: 2 }], minimumQuantity: 2, discountPercent: 10, label: '  Recomendado  ' })` stores `label: 'Recomendado'`; a 25-char label is rejected by `BundleDto` validation (`validateSync`).
- `product-subscriptions.spec.ts`: an upsert with `label: 'La favorita'` writes it; omitting `label` keeps the stored one (update `data` has no `label` key); `label: ''` clears it (`null`).
- public store spec: the mapped item has `cardEyebrow`, its `subscriptionOptions` carry `label`, `bundles[n].label` present.
- `product-page-writer.spec.ts`: `PRODUCT_PAGE_SCHEMA.properties.eyebrow` exists; `writtenPage({ eyebrow: 'Tueste medio', highlights: [] }, facts, [])` returns `eyebrow: 'Tueste medio'`; an eyebrow with a number not in the facts returns `eyebrow: null`.

- [ ] **Step 2: Run** (each file alone) → FAIL.

- [ ] **Step 3: Implement**

- `BundleDto`: `@IsOptional() @IsString() @MaxLength(24) label?: string;` — `createBundle` data: `label: dto.label?.trim() || null`.
- `ProductSubscriptionOptionDto`: `@IsOptional() @IsString() @MaxLength(24) label?: string;` — `ProductSubscriptionOperation` upsert gains `label?: string`; upsert `create: { …, label: option.label?.trim() || null }`, `update: { discountPercent, ...(option.label !== undefined ? { label: option.label.trim() || null } : {}) }`; `validateProductSubscriptions` mapping keeps `label`.
- `CreatePaymentLinkDto`: `@IsOptional() @IsString() @MaxLength(28) cardEyebrow?: string | null;` — service create `cardEyebrow: dto.cardEyebrow?.trim() || null`, update `...(dto.cardEyebrow !== undefined && { cardEyebrow: dto.cardEyebrow?.trim() || null })`.
- public store: bundles map adds `label`; `subscriptionOptions` select adds `label: true`; items add `cardEyebrow: item.cardEyebrow ?? null`.
- writer: schema `eyebrow: { type: ['string', 'null'], maxLength: 28 }`; prompt line «eyebrow: una frase de 2 a 4 palabras para la tarjeta (ej. «Elige tu tueste»), solo con los hechos, o null.»; `WrittenPage.eyebrow: string | null` = `typeof value.eyebrow === 'string' && value.eyebrow.trim() && ok(value.eyebrow) ? value.eyebrow.trim().slice(0, 28) : null`; service select adds `cardEyebrow`, and the `updateMany` data adds `...(product.cardEyebrow == null && written.eyebrow ? { cardEyebrow: written.eyebrow } : {})` (keep `mergeWrittenPage` returning null when nothing changes — treat a new eyebrow as a change).

- [ ] **Step 4: Run** the four spec files (`--maxWorkers=2`) → PASS; `npx tsc -p tsconfig.json --noEmit` clean.

- [ ] **Step 5: Commit** — `git commit -m "feat(api): pack and subscription labels, card eyebrow served to the store"`

---

### Task 8: Studio and dashboard editors

**Files:**
- Modify: `apps/merchant-studio/src/commerce-content.ts` («Descuento por cantidad» + «Etiqueta»)
- Modify: `apps/merchant-studio/src/source-create-product.ts` (eyebrow input in the Destacados step)
- Modify: `apps/merchant-studio/src/api.ts` (types: `label`, `cardEyebrow`)
- Modify: `apps/merchant-dashboard/src/subscriptions-panel.mjs` (label per cadence)
- Test: `apps/merchant-studio/src/commerce-content.test.ts` (new), `apps/merchant-studio/src/source-create-product.test.ts`, `apps/merchant-dashboard/src/subscriptions-panel.test.mjs`

- [ ] **Step 1: Failing tests**

- `commerce-content.test.ts` (Vitest + happy-dom, mock `MerchantStudioApi` with `commerceContent`, `sourceCatalog`, `createBundle`): choosing «Descuento por cantidad», one product, rows `2 → 10` and `3 → 15`, label «Recomendado» on the first, then submit → `createBundle` called twice with `{ kind: 'FIXED', items: [{ productId, quantity: 2 }], discountPercent: 10, minimumQuantity: 2, name: 'Lleva 2 · <producto>', label: 'Recomendado' }` and `{ …quantity: 3…, discountPercent: 15, name: 'Lleva 3 · <producto>' }` (no label).
- `source-create-product.test.ts`: the Destacados step has `input[name=cardEyebrow][maxlength="28"]`; saving with «Elige tu tueste» sends `cardEyebrow: 'Elige tu tueste'`; an edit of a product whose record had none and the field left empty sends no `cardEyebrow` key.
- `subscriptions-panel.test.mjs`: each cadence row has `input[name="label-MONTHLY"][maxlength="24"]`; saving sends `label` for checked rows.

- [ ] **Step 2: Run** — `cd apps/merchant-studio && npx vitest run src/commerce-content.test.ts src/source-create-product.test.ts`; `cd apps/merchant-dashboard && node --test src/subscriptions-panel.test.mjs` → FAIL.

- [ ] **Step 3: Implement**

- `commerce-content.ts`: add `<option value="TIERS">Descuento por cantidad</option>` to «Tipo de oferta»; when `TIERS` is chosen the product list becomes single-choice (radio) and a rows editor appears (`[data-tier-rows]`, each row `cantidad` 2–99 + `% descuento` 1–99 + optional «Etiqueta» maxlength 24, «Añadir fila» up to 3 rows); submit calls `api.createBundle(storeId, { name: \`Lleva ${q} · ${productName(id)}\`, kind: 'FIXED', items: [{ productId: id, quantity: q }], minimumQuantity: 2, discountPercent: d, ...(label ? { label } : {}) })` per row in order; the list shows one-product FIXED bundles grouped under «Descuento por cantidad · <producto>». Other offer types gain an optional «Etiqueta» input sent as `label`.
- `source-create-product.ts`: in the step-4 section, before the badge fieldset: `<label>Frase corta en la tarjeta (opcional)<input name="cardEyebrow" maxlength="28" placeholder="Ej.: Elige tu tueste"></label>`; prefill from `initial.cardEyebrow`; in save: `const eyebrow = (form.elements.namedItem('cardEyebrow') as HTMLInputElement).value.trim(); if (eyebrow || initial?.cardEyebrow) Object.assign(input, { cardEyebrow: eyebrow || null });`. `ProductGuideRecord` gains `cardEyebrow?: string | null`.
- `subscriptions-panel.mjs`: each row adds `<label>Etiqueta <input name="label-${cadence}" maxlength="24" value="${esc(saved?.label || '')}"></label>`; the save mapping adds `label: root.querySelector(\`[name="label-${cadence}"]\`).value.trim()`.

- [ ] **Step 4: Run** the three test files and each app's full suite (`npx vitest run src`, `node --test src/*.test.mjs`) → PASS (record the known flaky `source-focus-debug.test.ts` if it flakes; do not "fix" it). Rebuild the Studio bundle: `cd apps/merchant-dashboard && npm run build:studio`.

- [ ] **Step 5: Commit** — `git commit -m "feat(studio): quantity discounts, offer labels and card phrase"`

---

### Task 9: Screenshot QA and live check

- [ ] **Step 1:** Kit QA store — extend `source-templates-qa.tool.spec.ts` demo data with two packs and a monthly subscription on the first demo product and 6+ products with colour/size variants (behind `QA_SHOWCASE=1` so default QA is unchanged); run `QA_TEMPLATES=1 QA_SHOWCASE=1 TEMPLATE_IDS=esencial MASTER_VARIANT=offers:steps,grid,rows` and `…=cards:showcase,compact,split`; check 1280 and 390 by eye: squares fit, labels don't overflow, filters sheet opens on phone.
- [ ] **Step 2 (needs Task 7 applied):** Live on the ChatGPT plan with `Antojo Café` (`cmvfjmn5q0001n4za72wlym58`): create packs 2 (−10%) and 3 (−15%, label «Recomendado») via Studio API, a monthly subscription −10%, colour/size variants on the mug; add a 3-pack to the cart and confirm the cart quote total equals the square's total; ask YAPI «crea una página Regalos con la caja degustación, la taza y el café 500 g» and «pon el latte helado con un video al lado en el inicio» (upload a short mp4 first); check filters on the shop page at 390.
- [ ] **Step 3:** Ledger findings; fix defects with a failing test first; commit `test: showcase commerce live check fixes` if any.
