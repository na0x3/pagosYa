# Fashion Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clothing and designer-wear stores automatically get John Smedley-style product cards and product pages (NOA VARGAS Atelier first); every other store keeps today's dice.

**Architecture:** The Esencial fill read gains `kind` (fashion | other), backed by a tested word check. Fashion stores get the new Esencial variants `cards: 'fashion'` and `pdp: 'fashion'`, which the dice never give anyone else. Both looks are drawn by the kit — a fashion card anatomy (chosen by `config.showcase.cards = 'fashion'`) and a fashion product-page style (`config.productPageStyle = 'fashion'`) — so the home grid, «Ver todo» page and product page match and the kit keeps owning purchase logic. YAPI's existing product-page writer gets a fashion hint for the card label. A script switches NOA VARGAS as the live check.

**Tech Stack:** NestJS API (TypeScript, Jest), kit runtime parts (`packages/storefront-kit/commerce-src`, built into `kit/commerce.js`), Esencial template (React TSX + CSS, `packages/store-templates/templates/esencial`).

**Spec:** `docs/superpowers/specs/2026-10-21-fashion-look-design.md`

## Global Constraints

- Fashion = clothing, fashion, designer wear, couture, knitwear, shoes, bags, accessories worn. Non-fashion stores never roll `cards: 'fashion'` or `pdp: 'fashion'`.
- Fashion stores: the dice skip `cards` and `pdp` (set to `fashion`); every other part still rolls.
- Card label = the product's `cardEyebrow` only, never the category; no label → nothing shown. YAPI writes it only where it is empty, at most 3 words, no invented claims; merchant text is never overwritten.
- Colour option = group named Color / Colour / Colores / Tono (case and accents ignored). Size = Talla / Tallas / Size / Medida.
- Card: tinted 4:5 panel, label top-left, name left + price right on one row, then «N colores» (2+), the colour name (1) or nothing; colour bars on hover (desktop only); no «Agregar» button; the part-1 zoom button stays.
- Product page: info left / photos right on desktop, photos first on phones; «Categoría • label»; description cut to 4 lines with «Leer más»; «Guía de tallas» only when the store has a size guide; sizes as round pills, sold-out crossed and disabled; button «Elige una talla» until a size is chosen, then «Agregar al pedido»; «N colores:» with colour bars; related heading «También te puede gustar».
- Never edit `kit/commerce.js` by hand: edit `commerce-src`, run `node packages/storefront-kit/tools/build-commerce.mjs`.
- Saving any file under `apps/api/src` restarts the API and kills a running YAPI job: check no `StoreSourceChatJob`/`StoreSourceDesignJob` is RUNNING/QUEUED/PENDING first; batch API edits.
- Never run the whole API jest suite with default workers; run named spec files with `-w 2`.
- After kit or Esencial changes: `npm run build:studio` in `apps/merchant-dashboard`.

## Review Focus

- A fashion product with no size group (an accessory) must still say «Agregar al pedido» and be buyable — never stuck on «Elige una talla» → Task 4 test «a product without sizes keeps the normal button».
- Colour names the kit has no swatch for («Marfil», «Champán») must still give «3 colores» on the card, just without bars → Task 3 test «unknown colour names: count, no bars».
- No non-fashion store may ever roll the fashion card or page, whatever the seed or exclusions → Task 2 test over 40 seeds.
- A merchant's own card label longer than 3 words stays as written (the 3-word limit applies only to what YAPI writes) → Task 6 service test.
- A bakery or café whose words include «tejido», «punto» or «boutique» is not fashion → Task 1 test.

---

### Task 1: Fashion detection

**Files:**
- Create: `apps/api/src/storefront-source/source-master-fashion.ts`
- Create: `apps/api/src/storefront-source/source-master-fashion.spec.ts`
- Modify: `apps/api/src/storefront-source/source-master.ts` (`MasterRead`, `MasterCharacter`, `masterFillFromRead`)
- Modify: `apps/api/src/storefront-source/source-conversation.service.ts` (`masterFillSchema` + `MASTER_FILL_PROMPT`)
- Test: `apps/api/src/storefront-source/source-master.spec.ts`

**Interfaces:**
- Produces: `isFashionStore(input: { kind?: 'fashion' | 'other'; storeName?: string; what?: string; categories?: string[]; products?: string[] }): boolean`; `MasterCharacter.kind?: 'fashion' | 'other'`; `MasterRead.kind?: 'fashion' | 'other'`.

- [ ] **Step 1: Write the failing tests**

`source-master-fashion.spec.ts`:

```ts
import { isFashionStore } from './source-master-fashion';

describe('isFashionStore', () => {
  it('trusts the read when it says fashion', () => expect(isFashionStore({ kind: 'fashion', storeName: 'Lumen' })).toBe(true));
  it('finds clothing in the store words when the read says other or is missing', () => {
    expect(isFashionStore({ kind: 'other', storeName: 'NOA VARGAS Atelier', products: ['Vestido Cala', 'Corsé Anturio'] })).toBe(true);
    expect(isFashionStore({ categories: ['Polos', 'Pantalones'] })).toBe(true);
    expect(isFashionStore({ what: 'Ropa de diseño para mujer' })).toBe(true);
    expect(isFashionStore({ products: ['Zapatos de cuero', 'Bolso tote'] })).toBe(true);
  });
  it('ignores accents and case', () => expect(isFashionStore({ products: ['SASTRERÍA A MEDIDA'] })).toBe(true));
  it('a bakery or café with «tejido», «punto» or «boutique» is not fashion', () => {
    expect(isFashionStore({ storeName: 'Boutique del Pan', products: ['Pan de punto', 'Torta'] })).toBe(false);
    expect(isFashionStore({ what: 'Café de especialidad, tejido social del barrio' })).toBe(false);
  });
  it('two weak words together are fashion', () => expect(isFashionStore({ storeName: 'Boutique Punto Fino', what: 'tejidos de alpaca' })).toBe(true));
  it('nothing to go on is not fashion', () => expect(isFashionStore({})).toBe(false));
});
```

Append to `source-master.spec.ts` (build the read from the same fields the file's existing `masterFillFromRead` tests use; only `kind` matters here):

```ts
it('the read\'s kind reaches the character', () => {
  const read = { headline: 'x', palette: 'mono', fonts: 'classic', colors: {}, heroPhoto: -1, storyPhoto: -1, changed: [], values: [], tone: 'calm', temperature: 'warm', lead: 'photo', exclude: [], kind: 'fashion' } as any;
  expect(masterFillFromRead(read, [], false).character?.kind).toBe('fashion');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-fashion.spec.ts src/storefront-source/source-master.spec.ts -t "fashion|kind"`
Expected: FAIL — cannot find module `./source-master-fashion`; `character.kind` undefined.

- [ ] **Step 3: Implement**

`source-master-fashion.ts`:

```ts
/** Fashion look spec 2026-10-21: clothing, designer wear, couture, knitwear, shoes, bags and worn accessories get the fashion
 *  card and product page. The fill read says so (`kind`); the store's own words back it up when the read is missing or says
 *  other. A weak word («tejido», «punto», «boutique») counts only next to a second fashion word: bakeries say «punto» too. */
const STRONG = /\b(ropa|moda|prendas?|atelier|couture|alta costura|disenador(a|as|es)?|vestidos?|blusas?|camisas?|camisetas?|poleras?|pantalon(es)?|faldas?|chaquetas?|abrigos?|sastreria|lenceria|calzados?|zapatos?|zapatillas?|botas?|carteras?|bolsos?|jerseys?|sueteres?|sweaters?|corses?|knitwear|denim|jeans?|polos?)\b/;
const WEAK = /\b(tejidos?|punto|boutique|novias?|accesorios)\b/g;
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function isFashionStore(input: { kind?: 'fashion' | 'other'; storeName?: string; what?: string; categories?: string[]; products?: string[] }): boolean {
  if (input.kind === 'fashion') return true;
  const words = plain([input.storeName, input.what, ...(input.categories ?? []), ...(input.products ?? [])].filter(Boolean).join(' · '));
  if (STRONG.test(words)) return true;
  return new Set((words.match(WEAK) ?? []).map(word => word.replace(/s$/, ''))).size >= 2;
}
```

In `source-master.ts`: add `kind?: 'fashion' | 'other';` to `MasterRead` (beside `tone?`); replace `MasterCharacter` with

```ts
export type MasterCharacter = { tone: 'calm' | 'bold'; temperature: 'warm' | 'cool' | 'neutral'; lead: 'photo' | 'text'; exclude: string[]; kind?: 'fashion' | 'other' };
```

and in `masterFillFromRead` change the character line to

```ts
    ...(read.tone ? { character: { tone: read.tone, temperature: read.temperature ?? 'neutral', lead: read.lead ?? 'photo', exclude: Array.isArray(read.exclude) ? read.exclude : [], ...(read.kind ? { kind: read.kind } : {}) } } : {}),
```

In `source-conversation.service.ts` `masterFillSchema`: add `'kind'` to `required` and `kind: { type: 'string', enum: ['fashion', 'other'] },` to `properties` next to `tone`. Append this sentence at the end of `MASTER_FILL_PROMPT` (inside the string):

```
 kind: "fashion" when the business sells clothing, designer wear, couture, knitwear, shoes, bags or worn accessories; otherwise "other".
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-fashion.spec.ts src/storefront-source/source-master.spec.ts src/storefront-source/source-chat-master.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-master-fashion.ts apps/api/src/storefront-source/source-master-fashion.spec.ts apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-master.spec.ts apps/api/src/storefront-source/source-conversation.service.ts
git commit -m "feat(api,yapi): the fill read says whether a store sells fashion, backed by a word check"
```

---

### Task 2: Fashion variants in the dice and the store config

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (`master.variants.cards`, `master.variants.pdp`: append `"fashion"`)
- Modify: `apps/api/src/storefront-source/source-master-dice.ts` (`rollVariants`)
- Modify: `apps/api/src/storefront-source/source-master.ts` (`masterShowcase`, new `masterProductStyle`)
- Modify: `apps/api/src/storefront-source/source-templates.ts` (assemble config ~line 205; `refillMasterFiles` config ~line 134)
- Modify: `apps/api/src/storefront-source/source-dna.ts` (`SOURCE_PRODUCT_PAGE_STYLES` append `'fashion'`)
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (`useMasterTemplate` filler sets `character.kind`)
- Modify: `packages/storefront-kit/commerce-src/shared/config-dna.js` (`product:` enum append `'fashion'`)
- Test: `source-master-dice.spec.ts`, `source-master.spec.ts`, `source-master-refill.spec.ts` (all in `apps/api/src/storefront-source/`)

**Interfaces:**
- Consumes: `isFashionStore` (Task 1), `MasterCharacter.kind`.
- Produces: `masterProductStyle(variants): { productPageStyle?: 'fashion' }`; `masterShowcase` keeps `cards: 'fashion'`; rolled `cards`/`pdp` = `'fashion'` exactly when `character.kind === 'fashion'`. Config the kit reads: `config.showcase.cards === 'fashion'`, `config.productPageStyle === 'fashion'`.

- [ ] **Step 1: Write the failing tests**

Append to `source-master-dice.spec.ts`:

```ts
it('a fashion store always gets the fashion card and product page; every other part still rolls', () => {
  const fashion = { ...calm, kind: 'fashion' as const };
  const heroes = new Set<string>();
  for (const seed of 'abcdefghij') {
    const rolled = roll(seed, { character: fashion });
    expect([rolled.variants.cards, rolled.variants.pdp]).toEqual(['fashion', 'fashion']);
    heroes.add(rolled.variants.hero);
  }
  expect(heroes.size).toBeGreaterThan(1);
});

it('no other store ever rolls the fashion card or page, whatever the seed or exclusions', () => {
  for (let i = 0; i < 40; i++) {
    const rolled = roll(`seed-${i}`, { character: { ...calm, exclude: ['cards:showcase', 'cards:compact', 'cards:split', 'pdp:gallery-left'] } });
    expect(rolled.variants.cards).not.toBe('fashion');
    expect(rolled.variants.pdp).not.toBe('fashion');
  }
});
```

Append to `source-master.spec.ts`:

```ts
it('the fashion variants reach the kit config: card design and product-page style', () => {
  expect(masterShowcase({ cards: 'fashion' } as any)).toEqual({ cards: 'fashion' });
  expect(masterProductStyle({ pdp: 'fashion' } as any)).toEqual({ productPageStyle: 'fashion' });
  expect(masterProductStyle({ pdp: 'gallery-left' } as any)).toEqual({});
});
```

Append to `source-master-refill.spec.ts`, using that file's assembled master store and its way of reading `config.js` (read the file's first test to find them):

```ts
it('a refill to the fashion variants writes the card design and product-page style into config.js, and back', async () => {
  const fashion = refillMasterFiles(files, manifest, { variants: { cards: 'fashion', pdp: 'fashion' } as any }, apiUrl);
  const config = JSON.parse(fashion.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);
  expect(config.showcase.cards).toBe('fashion');
  expect(config.productPageStyle).toBe('fashion');
  const back = refillMasterFiles(fashion, manifest, { variants: { cards: 'compact', pdp: 'gallery-left' } as any }, apiUrl);
  expect(JSON.parse(back.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]).productPageStyle).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-dice.spec.ts src/storefront-source/source-master.spec.ts src/storefront-source/source-master-refill.spec.ts -t "fashion"`
Expected: FAIL — cards/pdp not `fashion`; `masterProductStyle` not exported.

- [ ] **Step 3: Implement**

`template.json`: `"cards": ["showcase", "compact", "split", "fashion"]`; `"pdp": ["gallery-left", "gallery-right", "stacked", "sticky-thumbs", "editorial", "split-scroll", "fashion"]`.

`source-master-dice.ts`:

```ts
/** Fashion look spec 2026-10-21: the fashion card and product page belong to fashion stores only, and fashion stores always get them. */
const FASHION_PARTS = ['cards', 'pdp'] as const;
```

In `allowed(part)`: first line `const fits = catalogue[part].filter(id => id !== 'fashion' && (PHOTO_NEEDS[id] ?? 0) <= input.photoCount);` and last line `return list.length ? list : [catalogue[part].find(id => id !== 'fashion') ?? catalogue[part][0]];`. Inside the attempt loop, right after `const variants = Object.fromEntries(...) as Record<string, string>;`:

```ts
    if (input.character.kind === 'fashion') for (const part of FASHION_PARTS) if (catalogue[part]?.includes('fashion')) variants[part] = 'fashion';
```

`source-master.ts`: in `masterShowcase` the card list becomes `['showcase', 'compact', 'split', 'fashion']`; add

```ts
/** Fashion look spec 2026-10-21: the fashion product page is a kit style, read by the kit from config.productPageStyle. */
export function masterProductStyle(variants: Partial<MasterVariants> | undefined): { productPageStyle?: 'fashion' } {
  return variants?.pdp === 'fashion' ? { productPageStyle: 'fashion' } : {};
}
```

`source-templates.ts`: import `masterProductStyle`. In the assemble `config` object, after the `showcase` line: `...(settings ? masterProductStyle(input.variants ?? (input.fill?.variants as MasterVariants | undefined)) : {}),`. In `refillMasterFiles`, replace the config write with:

```ts
      const config = JSON.parse(match[1]);
      const merged = { ...(state.variants ?? {}), ...(change.variants ?? {}) } as Partial<MasterVariants>;
      const { productPageStyle, ...rest } = config;
      const style = masterProductStyle(merged).productPageStyle ?? (productPageStyle === 'fashion' ? undefined : productPageStyle);
      return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...rest, ...(style ? { productPageStyle: style } : {}), dna: { ...config.dna, ...masterDnaFonts(settings, look), ...masterDnaLook(merged) }, showcase: { ...(config.showcase ?? {}), ...masterShowcase(merged) } })};\n` };
```

(`masterShowcase` of a non-fashion merged card still overwrites `showcase.cards`, so switching back clears `fashion`.)

`source-dna.ts`: append `'fashion'` to `SOURCE_PRODUCT_PAGE_STYLES`; if the `product` runtime DNA field lists its values separately in `FIELDS`, append it there too.

`config-dna.js` (kit): `product: ['editorial', 'dense', 'image-led', 'story-led', 'conversion', 'atelier', 'fashion']`.

`source-chat.service.ts` `useMasterTemplate`: import `isFashionStore`; replace the filler's return with

```ts
      const base: MasterFill = read ? masterFillFromRead(read, photos, false) : { copy: { headline: facts.storeName, subcopy: (onboarding.what ?? '').slice(0, 160) } };
      const fashion = isFashionStore({ kind: read?.kind, storeName: facts.storeName, what: onboarding.what ?? draft.answers?.context ?? '', products: facts.products });
      return { ...base, character: { ...(base.character ?? { tone: 'calm', temperature: 'neutral', lead: 'photo', exclude: [] }), kind: fashion ? 'fashion' : 'other' } };
```

Build the kit: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-dice.spec.ts src/storefront-source/source-master.spec.ts src/storefront-source/source-master-refill.spec.ts src/storefront-source/source-chat-master.spec.ts src/storefront-source/source-templates.service.spec.ts && cd ../.. && node --test packages/storefront-kit/tools/build-commerce.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/templates/esencial/template.json apps/api/src/storefront-source/source-master-dice.ts apps/api/src/storefront-source/source-master.ts apps/api/src/storefront-source/source-templates.ts apps/api/src/storefront-source/source-dna.ts apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-master-dice.spec.ts apps/api/src/storefront-source/source-master.spec.ts apps/api/src/storefront-source/source-master-refill.spec.ts packages/storefront-kit/commerce-src/shared/config-dna.js packages/storefront-kit/kit/commerce.js
git commit -m "feat(api,yapi): fashion stores always get the fashion card and product page; the dice never give them to anyone else"
```

---

### Task 3: The fashion card (kit)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/catalog/cards.js` (fashion helpers, `fashionCardMarkup`, branch in `productCard`, bar hover)
- Modify: `packages/storefront-kit/commerce-src/product/dialog-style.js` (fashion card CSS after the atelier card block)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-fashion.spec.ts` (new)

**Interfaces:**
- Consumes: `config.showcase.cards === 'fashion'` (Task 2); kit scope: `optionGroups`, `variantValues`, `variantPhotos`, `swatchColor`, `galleryImages`, `pageHref`, `money`, `price`, `isMembership`, `membershipPriceText`, `responsiveAttrs`, `escape`; part 1's `decorateZoomButtons` runs in `structureCatalog`.
- Produces: `.menu-item[data-anatomy="fashion"]` with `.menu-item__panel > img.menu-item__image`, `.menu-item__label`, `.menu-item__bars > button[data-card-swatch]`, `.menu-item__row > .menu-item__name + .menu-item__price`, `.menu-item__colors`; `colourGroupIndex(groups): number`, `sizeGroupIndex(groups): number` (used by Task 4).

- [ ] **Step 1: Write the failing tests**

Create `source-commerce-fashion.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { kitPath } from '@pagosya/storefront-kit';

/** Fashion look (spec 2026-10-21): the kit's fashion card and fashion product page. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const variant = (id: string, talla: string, color?: string, extra: Record<string, unknown> = {}) => ({ id, name: [talla, color].filter(Boolean).join(' / '), amount: 715000, stock: 3,
  options: [{ name: 'Talla', value: talla }, ...(color ? [{ name: 'Color', value: color }] : [])], ...extra });
const product = (over: Record<string, unknown> = {}) => ({ id: 'carden', name: 'Carden', amount: 715000, currency: 'BOB', stock: null, categoryId: 'k',
  imageUrls: ['https://shop.test/c1.jpg', 'https://shop.test/c2.jpg'], variants: [], extras: [], highlights: [], cardEyebrow: 'Corte holgado', ...over });

const windows: any[] = [];
const errors: Error[] = [];
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

async function open({ items = [product()] as any[], fullPage = false, cards = 'fashion', style = 'fashion' }: { items?: any[]; fullPage?: boolean; cards?: string; style?: string } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!/Could not parse CSS stylesheet|getComputedStyle\(elt, pseudoElt\)/.test(error.message)) errors.push(error); });
  const url = fullPage ? `https://shop.test/product.html?id=${items[0]?.id}` : 'https://shop.test/';
  const dom = new JSDOM(`<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog data-catalog-full></section><section data-pagosya-cart></section>${fullPage ? '<main data-pagosya-product-page></main>' : ''}<p data-pagosya-status></p></body></html>`,
    { url, runScripts: 'outside-only', virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_PREVIEW_CART = [];
  const data = { storeName: 'Noa', items, categories: [{ id: 'k', name: 'Vestidos' }] };
  w.PAGOSYA_CONFIG = { slug: 'noa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data, showcase: { cards }, productPageStyle: style };
  const quote = { subtotal: 0, discountAmount: 0, amount: 0, currency: 'BOB', shippingOptions: [] };
  w.fetch = jest.fn(async (target: string) => ({ ok: true, json: async () => String(target).endsWith('/store') ? data : quote }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  const q = (selector: string) => w.document.querySelector(selector) as any;
  const all = (selector: string) => [...w.document.querySelectorAll(selector)] as any[];
  return { w, q, all };
}

describe('fashion card', () => {
  it('a tinted photo panel with the label, name and price on one row, the colour count, no add button', async () => {
    const variants = [variant('a', 'S', 'Negro'), variant('b', 'M', 'Negro'), variant('c', 'S', 'Gris'), variant('d', 'S', 'Azul')];
    const { q } = await open({ items: [product({ variants })] });
    const card = q('.menu-item[data-product-id="carden"]');
    expect(card.getAttribute('data-anatomy')).toBe('fashion');
    expect(card.querySelector('.menu-item__panel img.menu-item__image')).not.toBeNull();
    expect(card.querySelector('.menu-item__panel .menu-item__label').textContent).toBe('Corte holgado');
    expect(card.querySelector('.menu-item__row .menu-item__name').textContent).toBe('Carden');
    expect(card.querySelector('.menu-item__row .menu-item__price').textContent).toMatch(/7\.150/);
    expect(card.querySelector('.menu-item__colors').textContent).toBe('3 colores');
    expect(card.querySelector('.menu-add,[data-add]')).toBeNull();
    expect(card.querySelector('.menu-item__panel [data-product-zoom]')).not.toBeNull();
  });

  it('no label without a written one (never the category); one colour shows its name; no colours, no line', async () => {
    const { q } = await open({ items: [product({ cardEyebrow: null, variants: [variant('a', 'S', 'Negro'), variant('b', 'M', 'Negro')] }), product({ id: 'liso', cardEyebrow: '' })] });
    expect(q('[data-product-id="carden"] .menu-item__label')).toBeNull();
    expect(q('[data-product-id="carden"] .menu-item__colors').textContent).toBe('Negro');
    expect(q('[data-product-id="liso"] .menu-item__colors')).toBeNull();
  });

  it('a bar per known colour, showing that colour\'s photo on hover, back to the first photo on leave', async () => {
    const variants = [variant('a', 'S', 'Negro', { imageUrls: ['https://shop.test/negro.jpg'] }), variant('b', 'S', 'Gris', { imageUrls: ['https://shop.test/gris.jpg'] })];
    const { w, q, all } = await open({ items: [product({ variants })] });
    const bars = all('[data-product-id="carden"] .menu-item__bars [data-card-swatch]');
    expect(bars.map((bar: any) => bar.getAttribute('aria-label'))).toEqual(['Ver en Negro', 'Ver en Gris']);
    bars[1].dispatchEvent(new w.MouseEvent('pointerover', { bubbles: true }));
    const photo = q('[data-product-id="carden"] .menu-item__image');
    expect(photo.getAttribute('src')).toBe('https://shop.test/gris.jpg');
    q('[data-product-id="carden"]').dispatchEvent(new w.MouseEvent('pointerleave'));
    expect(photo.getAttribute('src')).toBe('https://shop.test/c1.jpg');
  });

  it('unknown colour names: count, no bars', async () => {
    const variants = [variant('a', 'S', 'Marfil'), variant('b', 'S', 'Champán'), variant('c', 'S', 'Hueso')];
    const { q } = await open({ items: [product({ variants })] });
    expect(q('[data-product-id="carden"] .menu-item__colors').textContent).toBe('3 colores');
    expect(q('[data-product-id="carden"] .menu-item__bars')).toBeNull();
  });

  it('other stores keep their card', async () => {
    const { q } = await open({ cards: 'compact', style: 'editorial' });
    expect(q('.menu-item[data-product-id="carden"]').hasAttribute('data-anatomy')).toBe(false);
  });
});
```

(If `variant.imageUrls` is not where the kit's `variantPhotos(v)` reads per-variant photos, read `variantPhotos` in `commerce-src` and use its field name in the fixture.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-fashion.spec.ts`
Expected: FAIL — `data-anatomy` is not `fashion`.

- [ ] **Step 3: Implement**

In `catalog/cards.js`, above `productCard`:

```js
  // ---- Fashion card (spec 2026-10-21 fashion look, the John Smedley card) ----
  // A tinted photo panel with the merchant's label, the name and price on one row, «N colores», colour bars on hover. No add
  // button: clothing needs a size first, so the whole card opens the product.
  const COLOUR_GROUP = /^(colou?r|colores|tono)$/;
  const SIZE_GROUP = /^(tallas?|size|medida)$/;
  const groupKey = name => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const colourGroupIndex = groups => (groups || []).findIndex(group => COLOUR_GROUP.test(groupKey(group.name)));
  const sizeGroupIndex = groups => (groups || []).findIndex(group => SIZE_GROUP.test(groupKey(group.name)));
  const fashionCards = () => config.showcase?.cards === 'fashion';
  function fashionColours(p) {
    const groups = optionGroups(p), index = colourGroupIndex(groups);
    if (index < 0) return [];
    const alt = galleryImages(p)[1] || '';
    return groups[index].values.map(value => {
      const own = (p.variants || []).find(v => variantValues(v)[index] === value && variantPhotos(v)[0]);
      return { value, color: swatchColor(groups[index].name, value), photo: own ? variantPhotos(own)[0] : alt };
    });
  }
  function fashionCardMarkup(p, image) {
    const colours = fashionColours(p), label = typeof p.cardEyebrow === 'string' ? p.cardEyebrow.trim().slice(0, 28) : '';
    const line = colours.length > 1 ? `${colours.length} colores` : colours[0]?.value || '';
    const bars = colours.filter(colour => colour.color && colour.photo);
    const details = config.productPage
      ? `<a class="menu-item__details" href="${escape(pageHref(config.productPage, '?id=' + encodeURIComponent(p.id)))}" aria-label="Ver detalle de ${escape(p.name)}"></a>`
      : `<button class="menu-item__details" type="button" data-product="${escape(p.id)}" aria-label="Ver detalle de ${escape(p.name)}"></button>`;
    const photo = image ? `<img class="menu-item__image" src="${escape(image)}"${responsiveAttrs(image, '(max-width: 820px) 50vw, 33vw')} alt="${escape(p.name)}" loading="lazy" decoding="async" />` : '';
    const barsHtml = bars.length > 1 ? `<div class="menu-item__bars">${bars.map(bar => `<button type="button" data-card-swatch="${escape(bar.photo)}" aria-label="Ver en ${escape(bar.value)}" aria-pressed="false" style="--swatch:${escape(bar.color)}"></button>`).join('')}</div>` : '';
    const priceText = isMembership(p) ? membershipPriceText(p) : money(price(p), p.currency);
    return `<article class="menu-item" data-product-id="${escape(p.id)}" data-anatomy="fashion">${details}<div class="menu-item__panel">${photo}${label ? `<p class="menu-item__label">${escape(label)}</p>` : ''}${barsHtml}</div><div class="menu-item__row"><h3 class="menu-item__name">${escape(p.name)}</h3><p class="menu-item__price">${escape(priceText)}</p></div>${line ? `<p class="menu-item__colors">${escape(line)}</p>` : ''}</article>`;
  }
  // Hovering a bar shows that colour's photo; leaving the card brings the first photo back.
  document.addEventListener('pointerover', event => {
    const bar = event.target.closest?.('[data-anatomy=fashion] [data-card-swatch]');
    const card = bar?.closest('.menu-item'), photo = card?.querySelector('.menu-item__image');
    if (!photo) return;
    if (!photo.dataset.firstSrc) photo.dataset.firstSrc = photo.getAttribute('src') || '';
    photo.removeAttribute('srcset'); photo.src = bar.dataset.cardSwatch;
    if (!card.hasAttribute('data-bars-watched')) {
      card.setAttribute('data-bars-watched', '');
      card.addEventListener('pointerleave', () => { if (photo.dataset.firstSrc) photo.src = photo.dataset.firstSrc; card.removeAttribute('data-bars-watched'); }, { once: true });
    }
  });
```

In `productCard(p)`, right after `const custom = customProductCard(p, image, complex); if (custom) return custom;`:

```js
    if (fashionCards()) return fashionCardMarkup(p, image);
```

In `product/dialog-style.js`, after the atelier card `@layer pagosya-dna { … }` block:

```css
    /* The fashion card (2026-10-21, the John Smedley references). Inside the DNA layer; the store's own CSS still wins. */
    @layer pagosya-dna {
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion]{display:flex;flex-direction:column;gap:0;padding:0;border:0;background:transparent;box-shadow:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel{position:relative;aspect-ratio:4/5;overflow:hidden;border-radius:var(--store-radius,0px);background:color-mix(in srgb,var(--store-foreground,#111) 6%,var(--store-background,#fff))}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__image{width:100%;height:100%;aspect-ratio:auto;object-fit:cover;transition:opacity .3s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__label{position:absolute;top:12px;left:12px;z-index:2;margin:0;font:400 13px/1.3 var(--store-body-font,inherit);color:var(--store-foreground,#111)}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:2px;opacity:0;transition:opacity .2s ease}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars button{flex:1;height:12px;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:var(--swatch);cursor:pointer}
      @media(hover:hover){[data-pagosya-catalog] .menu-item[data-anatomy=fashion]:is(:hover,:focus-within) .menu-item__bars{opacity:1}}
      @media(hover:none){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__bars{display:none}}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__row{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin-top:14px}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__name{margin:0;font:400 17px/1.3 var(--store-heading-font,inherit);letter-spacing:0;text-transform:none}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__price{margin:0;font:400 15px/1.3 var(--store-body-font,inherit)}
      [data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__colors{margin:2px 0 0;font:400 14px/1.3 var(--store-body-font,inherit);opacity:.72}
      @media(prefers-reduced-motion:reduce){[data-pagosya-catalog] .menu-item[data-anatomy=fashion] :is(.menu-item__image,.menu-item__bars){transition:none}}
    }
```

(The part-1 zoom button sits in `.menu-item__panel`, bottom-right; the bars span the bottom edge, so give the bars `right:56px` when the panel holds a `[data-product-zoom]`: `[data-pagosya-catalog] .menu-item[data-anatomy=fashion] .menu-item__panel:has([data-product-zoom]) .menu-item__bars{right:56px}`.)

Build: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-fashion.spec.ts src/storefront-source/source-commerce-photo-viewer.spec.ts src/storefront-source/source-commerce-card-insides.spec.ts src/storefront-source/source-commerce-analytics.spec.ts src/storefront-source/source-commerce-product-card.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-fashion.spec.ts
git commit -m "feat(kit): the fashion card — tinted photo panel, label, name and price row, colour count and hover bars"
```

---

### Task 4: The fashion product page (kit style)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/product/page.js` (`productPageStyle`, `optionsMarkup` legend, open preselection ~line 141, eyebrow, «Leer más», `updateOptions` button label, plain buy text)
- Modify: `packages/storefront-kit/commerce-src/product/bundles-related.js` (`relatedMarkup` heading)
- Modify: `packages/storefront-kit/commerce-src/shared/click-actions.js` (`data-product-more` toggle)
- Modify: `packages/storefront-kit/commerce-src/product/dialog-style.js` (`[data-style=fashion]` block)
- Rebuild: `packages/storefront-kit/kit/commerce.js`
- Test: `apps/api/src/storefront-source/source-commerce-fashion.spec.ts`

**Interfaces:**
- Consumes: `colourGroupIndex`, `sizeGroupIndex` (Task 3); `config.productPageStyle === 'fashion'` (Task 2).
- Produces: `[data-pagosya-product][data-style=fashion]`; buy text «Elige una talla» / «Elige un color» / «Elige <grupo>» / «Agregar al pedido»; `.product-detail__eyebrow` = «Categoría • label»; `button[data-product-more]`.

- [ ] **Step 1: Write the failing tests** (append to `source-commerce-fashion.spec.ts`)

```ts
describe('fashion product page', () => {
  const sized = () => product({ variants: [variant('xs', 'XS', 'Negro'), variant('s', 'S', 'Negro', { stock: 0 }), variant('m', 'M', 'Negro'), variant('g', 'M', 'Gris')] });

  it('no size is chosen for the shopper: the button asks for one, then adds', async () => {
    const { q, all } = await open({ fullPage: true, items: [sized()] });
    expect(q('[data-pagosya-product]').getAttribute('data-style')).toBe('fashion');
    const buy = q('[data-pagosya-product] [data-variant-add]');
    expect(buy.disabled).toBe(true);
    expect(buy.textContent).toMatch(/^Elige una talla/);
    const sizes = all('[data-pagosya-product] .product-detail__values')[0].querySelectorAll('[data-product-option]');
    expect([...sizes].map((b: any) => b.disabled)).toEqual([false, true, false]);
    sizes[0].click();
    expect(q('[data-pagosya-product] [data-variant-add]').textContent).toMatch(/^Agregar al pedido/);
    expect(q('[data-pagosya-product] [data-variant-add]').disabled).toBe(false);
  });

  it('the colour group reads «2 colores:» with the chosen one after it', async () => {
    const { q } = await open({ fullPage: true, items: [sized()] });
    const legends = [...q('[data-pagosya-product]').querySelectorAll('.product-detail__options legend')].map((l: any) => l.textContent.trim());
    expect(legends[1]).toMatch(/^2 colores:/);
  });

  it('a product without sizes keeps the normal button', async () => {
    const { q } = await open({ fullPage: true, items: [product({ id: 'collar', variants: [] })] });
    const buy = q('[data-pagosya-product] .product-detail__buy');
    expect(buy.textContent).toMatch(/^Agregar al pedido/);
    expect(buy.disabled).toBe(false);
  });

  it('category • label under the title, and a long description gets «Leer más»', async () => {
    const description = 'Tejido en Inglaterra con lana merino extrafina y cachemira reciclada. '.repeat(5);
    const { q } = await open({ fullPage: true, items: [product({ description })] });
    expect(q('[data-pagosya-product] .product-detail__eyebrow').textContent).toBe('Vestidos • Corte holgado');
    const more = q('[data-pagosya-product] [data-product-more]');
    expect(more.textContent).toBe('Leer más');
    more.click();
    expect(q('[data-pagosya-product] .product-detail__intro').hasAttribute('data-expanded')).toBe(true);
    expect(more.textContent).toBe('Leer menos');
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });

  it('a short description has no «Leer más»', async () => {
    const { q } = await open({ fullPage: true, items: [product({ description: 'Punto inglés.' })] });
    expect(q('[data-pagosya-product] [data-product-more]')).toBeNull();
  });

  it('the related row says «También te puede gustar»', async () => {
    const { q } = await open({ fullPage: true, items: [product(), product({ id: 'otro', name: 'Moor' })] });
    expect(q('#product-related-title')?.textContent).toMatch(/^También te puede gustar/);
  });

  it('other styles keep «Añadir al pedido» and preselect as before', async () => {
    const { q } = await open({ fullPage: true, items: [sized()], style: 'editorial' });
    expect(q('[data-pagosya-product] [data-variant-add]').textContent).toMatch(/^Añadir al pedido/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-fashion.spec.ts -t "fashion product page"`
Expected: FAIL — `data-style` is not `fashion`.

- [ ] **Step 3: Implement**

`product/page.js`:

1. `productPageStyle()`: add `'fashion'` to the accepted list.
2. `optionsMarkup(groups)`: add `const fashion = productPageStyle() === 'fashion', colourIndex = colourGroupIndex(groups);` and render each legend as
   `<legend>${fashion && index === colourIndex ? `${group.values.length} ${group.values.length === 1 ? 'color' : 'colores'}:` : escape(group.name)} <span data-product-selection="${index}"></span></legend>`.
3. After `selectedOptions = completeSelection(p, []);` (~line 141):

```js
    // Fashion look: the shopper picks the size; the page never picks one for them (the John Smedley «Select a size»).
    if (productPageStyle() === 'fashion') { const size = sizeGroupIndex(optionGroups(p)); if (size >= 0) selectedOptions = selectedOptions.map((value, index) => index === size ? undefined : value); }
```

4. Above the `detail.innerHTML = …` template, add `const eyebrowText = style === 'fashion' ? [(store.categories || []).find(c => c.id === p.categoryId)?.name, typeof p.cardEyebrow === 'string' ? p.cardEyebrow.trim() : ''].filter(Boolean).join(' • ') : ((store.categories || []).find(c => c.id === p.categoryId)?.name || store.storeName || 'Tu tienda');` and use `${escape(eyebrowText)}` inside `product-detail__eyebrow` (the current expression is the non-fashion branch, unchanged).
5. Right after the intro paragraph in the template: `${style === 'fashion' && (p.description || '').length > 220 ? '<button type="button" class="product-detail__more" data-product-more aria-expanded="false">Leer más</button>' : ''}`.
6. The plain buy buttons: each `>Añadir al pedido<span class="product-detail__buy-total"` in the template becomes `>${style === 'fashion' ? 'Agregar al pedido' : 'Añadir al pedido'}<span class="product-detail__buy-total"` (all occurrences in that template).
7. In `updateOptions()`, after `buy.disabled = !ready || checkingOut || !available;`:

```js
    if (productPageStyle() === 'fashion') {
      const missing = groups.findIndex((group, index) => selectedOptions[index] === undefined);
      const text = missing < 0 ? 'Agregar al pedido' : missing === sizeGroupIndex(groups) ? 'Elige una talla' : missing === colourGroupIndex(groups) ? 'Elige un color' : `Elige ${groups[missing].name.toLowerCase()}`;
      const node = [...buy.childNodes].find(child => child.nodeType === 3);
      if (node) node.textContent = text; else buy.prepend(text);
    }
```

(`style` is the local `productPageStyle()` value in the render function; if the render function names it differently, use that name.)

`product/bundles-related.js` `relatedMarkup`: `<h2 id="product-related-title">${productPageStyle() === 'fashion' ? 'También te puede gustar' : 'Combínalo con'}${sample ? ' · ejemplo' : ''}</h2>`.

`shared/click-actions.js` — in the document click handler beside the other `button.hasAttribute(...)` branches:

```js
    if (button.hasAttribute('data-product-more')) {
      const intro = detail.querySelector('.product-detail__intro'), open = !intro?.hasAttribute('data-expanded');
      intro?.toggleAttribute('data-expanded', open);
      button.setAttribute('aria-expanded', String(open)); button.textContent = open ? 'Leer menos' : 'Leer más';
      return;
    }
```

`product/dialog-style.js` — next to the atelier style rules:

```css
    [data-pagosya-product][data-style=fashion] .product-detail__layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch}
    [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:2;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__photo{height:min(calc(100dvh - 64px),880px);object-fit:contain;background:transparent}
    [data-pagosya-product][data-style=fashion] .product-detail__copy{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px) clamp(20px,3vw,48px)}
    [data-pagosya-product][data-style=fashion] [data-part=title]{order:0;margin:0;font:400 clamp(30px,3.2vw,44px)/1.1 var(--pd-heading);letter-spacing:-.01em}
    [data-pagosya-product][data-style=fashion] .product-detail__eyebrow{order:1;margin:-6px 0 0;font:400 15px/1.4 var(--pd-body);letter-spacing:0;text-transform:none;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__copy>:not([data-part=title],.product-detail__eyebrow){order:2}
    [data-pagosya-product][data-style=fashion] .product-detail__intro{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;margin:0;font:400 18px/1.55 var(--pd-heading)}
    [data-pagosya-product][data-style=fashion] .product-detail__intro[data-expanded]{display:block}
    [data-pagosya-product][data-style=fashion] .product-detail__more{align-self:flex-start;padding:0;border:0;background:none;font:inherit;font-size:14px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;color:inherit}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button{position:relative;min-width:56px;min-height:56px;padding:0 14px;border:1px dashed color-mix(in srgb,var(--pd-ink) 55%,transparent);border-radius:999px;background:transparent;color:var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button[aria-pressed=true]{border-style:solid;border-color:var(--pd-ink);background:var(--pd-ink);color:var(--pd-paper)}
    [data-pagosya-product][data-style=fashion] .product-detail__values:not([data-kind=swatch]) button:disabled{opacity:.45;background:linear-gradient(to top right,transparent calc(50% - .5px),currentColor calc(50% - .5px),currentColor calc(50% + .5px),transparent calc(50% + .5px))}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch]{display:flex;gap:4px}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button{position:relative;flex:1;height:22px;min-height:0;padding:0;border:0;border-radius:0;background:none}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__swatch{display:block;width:100%;height:100%;border-radius:0}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] .product-detail__option-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
    [data-pagosya-product][data-style=fashion] .product-detail__values[data-kind=swatch] button[aria-pressed=true]{box-shadow:inset 0 -3px 0 var(--pd-ink)}
    [data-pagosya-product][data-style=fashion] .product-detail__buy{width:100%;min-height:56px;border:0;border-radius:0;background:var(--pd-ink);color:var(--pd-paper);font:500 16px/1 var(--pd-body);letter-spacing:0;text-transform:none}
    /* «También te puede gustar»: the kit's related list, dressed like the fashion card (tinted 4:5 panel, name and price). */
    [data-pagosya-product][data-style=fashion] .product-detail__related img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:0;background:color-mix(in srgb,var(--pd-ink) 6%,var(--pd-paper))}
    [data-pagosya-product][data-style=fashion] .product-detail__related h2{font:400 clamp(26px,2.6vw,36px)/1.15 var(--pd-heading);padding-top:18px;border-top:1px solid var(--pd-ink)}
    @media(max-width:820px){
      [data-pagosya-product][data-style=fashion] .product-detail__layout{grid-template-columns:1fr}
      [data-pagosya-product][data-style=fashion] .product-detail__layout>.product-detail__gallery{order:0}
      [data-pagosya-product][data-style=fashion] .product-detail__photo{height:auto;aspect-ratio:4/5}
    }
```

Build: `node packages/storefront-kit/tools/build-commerce.mjs`.

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-commerce-fashion.spec.ts src/storefront-source/source-commerce-product-card.spec.ts src/storefront-source/source-commerce-atelier.spec.ts src/storefront-source/source-commerce-photo-viewer.spec.ts src/storefront-source/source-commerce-long-page.spec.ts src/storefront-source/source-commerce-conversion.spec.ts`
Expected: PASS (the product-card golden stays byte for byte: other styles are untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-fashion.spec.ts
git commit -m "feat(kit): the fashion product page — pick-a-size button, colour count, category • label, «Leer más», round sizes"
```

---

### Task 5: Esencial uses the fashion card and page

**Files:**
- Modify: `packages/store-templates/templates/esencial/components/home.tsx` (no product template when `cards === 'fashion'`)
- Modify: `packages/store-templates/templates/esencial/components/product.tsx` (category slot + «Guía de tallas»)
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (`.es-pdp[data-es-pdp="fashion"]`, `.es-grid[data-es-cards="fashion"]`)
- Test: `apps/api/src/storefront-source/source-master-esencial.spec.ts`

**Interfaces:**
- Consumes: `variant('cards')`, `variant('pdp')`, `sections` from `store-data`; the kit fashion card/page (Tasks 3–4); config (Task 2).
- Produces: Esencial home without `template[data-pagosya-product-template]` for fashion; product page `KitSlot name="category"` under the title; `a.es-pdp__guide[href="index.html#sizes"]` when a `sizes` section exists.

- [ ] **Step 1: Write the failing test** (append inside `describe('Esencial', …)`)

```ts
  it('fashion variants: the kit draws the cards, the product page has the category line and the size guide link', async () => {
    const variants = { ...Object.fromEntries(Object.entries(manifest.master!.variants!).map(([part, ids]) => [part, (ids as string[])[0]])), cards: 'fashion', pdp: 'fashion', sections: ['sizes'] };
    const assembled = await assemble(templateDemoPublicStore(), { variants, fill: { sections: [{ id: 'sizes', title: 'Guía de tallas', items: [{ title: 'S', text: '36' }, { title: 'M', text: '38' }] }] } });
    const text = (pattern: RegExp) => assembled.files.filter((f: any) => pattern.test(f.path)).map((f: any) => f.content).join('\n');
    expect(text(/(^|\/)index\.html$/)).not.toContain('data-pagosya-product-template');
    expect(text(/(^|\/)product\.html$/)).toContain('data-product-slot="category"');
    expect(text(/(^|\/)product\.html$/)).toContain('href="index.html#sizes"');
    expect(text(/^config\.js$/)).toContain('"productPageStyle":"fashion"');
    expect(text(/^config\.js$/)).toContain('"cards":"fashion"');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-esencial.spec.ts -t "fashion variants"`
Expected: FAIL — the home still carries the product template.

- [ ] **Step 3: Implement**

`home.tsx`: wrap the `<template data-pagosya-product-template>…</template>` element as `{cards === 'fashion' ? null : <template data-pagosya-product-template>…</template>}` and put above it `{/* Fashion look: the kit's fashion card, the same on the home, «Ver todo» and related rows. */}`.

`product.tsx`: import `sections` from `./store-data`; after the title slot add `<KitSlot kind="product" name="category" className="es-pdp__category" />`; before the buy slot add
`{variant('pdp', 'gallery-left') === 'fashion' && sections.some(section => section.id === 'sizes') ? <a className="es-pdp__guide" href="index.html#sizes">Guía de tallas</a> : null}`.
(The kit's `PRODUCT_PARTS` maps `category` to `.product-detail__eyebrow`. If `@pagosya/ui`'s `KitSlot` typing restricts `name`, add `'category'` to its product names.)

`globals.css`, at the end:

```css
/* Fashion look (2026-10-21): the kit's fashion card and page, laid out full width like the John Smedley pages. */
.es-grid[data-es-cards="fashion"]{grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))!important;gap:28px!important}
.es-pdp[data-es-pdp="fashion"] .es-pdp__grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;align-items:stretch}
.es-pdp[data-es-pdp="fashion"] .es-pdp__gallery{order:2;min-height:calc(100dvh - 64px)}
.es-pdp[data-es-pdp="fashion"] .es-pdp__info{display:flex;flex-direction:column;gap:14px;padding:clamp(24px,4vw,56px) clamp(20px,3vw,48px)}
.es-pdp[data-es-pdp="fashion"] .es-pdp__category{margin-top:-8px}
.es-pdp[data-es-pdp="fashion"] .es-pdp__guide{align-self:flex-start;margin-top:auto;font-size:15px;text-decoration:underline dashed;text-underline-offset:6px;color:inherit}
.es-pdp[data-es-pdp="fashion"] .es-pdp__guide+.es-pdp__buy{margin-top:0}
.es-pdp[data-es-pdp="fashion"] .es-pdp__buy{margin-top:auto}
@media (max-width:820px){.es-pdp[data-es-pdp="fashion"] .es-pdp__grid{grid-template-columns:1fr}.es-pdp[data-es-pdp="fashion"] .es-pdp__gallery{order:0;min-height:0}.es-pdp[data-es-pdp="fashion"] :is(.es-pdp__buy,.es-pdp__guide){margin-top:0}}
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/storefront-source/source-master-esencial.spec.ts src/storefront-source/source-master-check.spec.ts src/storefront-source/source-templates.service.spec.ts`
Expected: PASS (the Esencial browser renders still fit 390/768/1280).

- [ ] **Step 5: Commit**

```bash
git add packages/store-templates/templates/esencial apps/api/src/storefront-source/source-master-esencial.spec.ts
git commit -m "feat(esencial): fashion stores use the kit's fashion card and page, with the category line and size guide link"
```

---

### Task 6: YAPI's card label for fashion stores

**Files:**
- Modify: `apps/api/src/product-content/product-page-writer.ts` (`productPagePrompt`, `writtenPage`)
- Modify: `apps/api/src/product-content/product-page-writer.service.ts` (`fill`/`write`/`fillStore` carry `fashion`)
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`applyMaster` → `fillStore(storeId, 20, { fashion })`)
- Test: `apps/api/src/product-content/product-page-writer.spec.ts`, `product-page-writer.service.spec.ts`

**Interfaces:**
- Consumes: `fill.character.kind` (Task 2).
- Produces: `productPagePrompt(facts, storeName, voice?, options?: { fashion?: boolean })`; `writtenPage(raw, facts, photoUrls, options?: { fashion?: boolean })` drops a YAPI eyebrow over 3 words when fashion; `fill(storeId, productId, mode, merchantId?, options?)`; `fillStore(storeId, limit?, options?: { fashion?: boolean })`.

- [ ] **Step 1: Write the failing tests**

Append to `product-page-writer.spec.ts`:

```ts
it('a fashion store asks for a fit, fabric or edition label of at most 3 words', () => {
  const prompt = productPagePrompt({ name: 'Carden', description: 'Jersey de cachemira', specifications: [], tags: [], category: 'Jerseys' } as any, 'Noa', undefined, { fashion: true });
  expect(prompt).toMatch(/máximo 3 palabras/);
  expect(productPagePrompt({ name: 'Café', description: null, specifications: [], tags: [], category: null } as any, 'Luz')).not.toMatch(/máximo 3 palabras/);
});

it('a YAPI label over 3 words is dropped for a fashion store, kept for others', () => {
  const facts = { name: 'Carden', description: 'Jersey', specifications: [], tags: [], category: null } as any;
  expect(writtenPage({ highlights: [], eyebrow: 'Corte holgado inglés clásico' }, facts, [], { fashion: true }).eyebrow).toBeNull();
  expect(writtenPage({ highlights: [], eyebrow: 'Corte holgado' }, facts, [], { fashion: true }).eyebrow).toBe('Corte holgado');
  expect(writtenPage({ highlights: [], eyebrow: 'Corte holgado inglés clásico' }, facts, []).eyebrow).toBe('Corte holgado inglés clásico');
});
```

Append inside `describe('ProductPageWriterService', …)` in `product-page-writer.service.spec.ts` (after the `withEyebrow` helper):

```ts
  it("a fashion store never replaces the merchant's own long label, and asks the model for 3 words", async () => {
    const { service, prisma } = setup(product({ cardEyebrow: 'Hecho a mano en La Paz para novias' }));
    const fetchMock = withEyebrow('Seda');
    await service.fill('s1', 'p1', 'auto', undefined, { fashion: true });
    expect(prisma.paymentLink.updateMany.mock.calls[0][0].data).not.toHaveProperty('cardEyebrow');
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).input[0].content[0].text).toMatch(/máximo 3 palabras/);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest -w 2 src/product-content/product-page-writer.spec.ts src/product-content/product-page-writer.service.spec.ts -t "fashion|3 words"`
Expected: FAIL — no 3-word line; label kept.

- [ ] **Step 3: Implement**

`product-page-writer.ts`: add `options: { fashion?: boolean } = {}` as the 4th parameter of `productPagePrompt` and replace the eyebrow line with

```ts
    options.fashion
      ? 'eyebrow: la etiqueta que va sobre la foto de esta prenda, de máximo 3 palabras: el corte, la tela o la edición (ej. «Corte holgado», «Seda natural», «Edición limitada»), solo con los hechos, o null.'
      : 'eyebrow: una frase de 2 a 4 palabras para la tarjeta del producto (ej. «Elige tu tueste»), solo con los hechos, o null.',
```

`writtenPage(raw, facts, photoUrls, options: { fashion?: boolean } = {})`: after `const eyebrow = …`, add `const label = eyebrow && options.fashion && eyebrow.split(/\s+/).length > 3 ? null : eyebrow;` and return `eyebrow: label`.

`product-page-writer.service.ts`: thread `options: { fashion?: boolean } = {}` through `fill(storeId, productId, mode, merchantId?, options = {})` → `this.write(storeId, productId, mode, merchantId, options)` (both call sites) → `productPagePrompt(facts, product.store.name, voice, options)` and `writtenPage(raw, facts, photoUrls, options)`; `fillStore(storeId, limit = 20, options: { fashion?: boolean } = {})` calls `this.fill(storeId, product.id, 'auto', undefined, options)`. The merchant-label rule (`product.cardEyebrow == null && written.eyebrow`) stays.

`source-templates.service.ts` `applyMaster`: `void Promise.resolve().then(() => this.pageWriter?.fillStore(storeId, 20, { fashion: fill?.character?.kind === 'fashion' })).catch(() => undefined);` (update the `pageWriter` field's type if it declares `fillStore`'s signature).

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest -w 2 src/product-content/product-page-writer.spec.ts src/product-content/product-page-writer.service.spec.ts src/storefront-source/source-templates.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/product-content/product-page-writer.ts apps/api/src/product-content/product-page-writer.service.ts apps/api/src/product-content/product-page-writer.spec.ts apps/api/src/product-content/product-page-writer.service.spec.ts apps/api/src/storefront-source/source-templates.service.ts
git commit -m "feat(api,yapi): fashion stores get a fit, fabric or edition card label of at most 3 words"
```

---

### Task 7: Switch NOA VARGAS and check it live

**Files:**
- Create: `apps/api/scripts/fashion-look-apply.ts`
- Rebuild: Studio bundle

- [ ] **Step 1: Write the script**

```ts
/** Fashion look (spec 2026-10-21): switches one existing Esencial store to the fashion card and product page as a new revision,
 *  then lets YAPI write the empty card labels. Local database only.
 *   npx ts-node --transpile-only scripts/fashion-look-apply.ts <storeId> */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';
import { ProductPageWriterService } from '../src/product-content/product-page-writer.service';

async function main() {
  const storeId = process.argv[2];
  if (!storeId) throw new Error('usage: fashion-look-apply.ts <storeId>');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('fashion-look-apply requires a local database');
    const store = await app.get(PrismaService).store.findUniqueOrThrow({ where: { id: storeId }, select: { merchantId: true, name: true } });
    const current = await app.get(SourceProjectsService).current(store.merchantId, storeId);
    const saved = await app.get(SourceTemplatesService).refill(store.merchantId, storeId, current.revision, { variants: { cards: 'fashion', pdp: 'fashion' } as any }, 'Estilo moda');
    console.log(`${store.name}: revision ${current.revision} → ${saved.revision}`);
    await app.get(ProductPageWriterService).fillStore(storeId, 20, { fashion: true });
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
```

(Use the class names exactly as exported by `source-templates.service.ts`, `source-projects.service.ts` and `product-page-writer.service.ts`.)

- [ ] **Step 2: Run it on NOA VARGAS**

Check no YAPI job is running (Global Constraints), then:
Run: `cd apps/api && npx ts-node --transpile-only scripts/fashion-look-apply.ts cmvi4x7xb0018rb8uvj9ddgzc`
Expected: `NOA VARGAS Atelier: revision N → N+1`.

- [ ] **Step 3: Rebuild the Studio and check live**

Run: `cd apps/merchant-dashboard && npm run build:studio`. Open NOA VARGAS's new revision through Studio «Ver en navegador» (desktop 1440) and the DevTools phone emulation (390):
1. Home grid: tinted panels, label top-left, name + price row, no add buttons, zoom button bottom-right (NOA has sizes only, so no colour bars).
2. «Ver todo»: the same cards.
3. A dress: info left, photo right full height; «Novias • Vestido de novia»; description cut with «Leer más» when long; sizes 34–42 as round dashed pills; button «Elige una talla» → pick 36 → «Agregar al pedido» → add to cart → the cart shows the dress with talla 36.
4. An accessory without sizes (Collar de Calas): «Agregar al pedido» adds it.
5. Phone: photo first, info after.
Screenshot each beside the John Smedley screenshots. A failing step gets a reproducing jsdom test where possible, a fix in the owning part, a rebuild and a recheck.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/fashion-look-apply.ts
git commit -m "chore(api): script to switch an Esencial store to the fashion look (NOA VARGAS live check)"
```
