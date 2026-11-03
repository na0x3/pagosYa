# Único Premium Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Único stores open like nubecorp (split hero, word band, colour cards, buy box, benefits, hotspots, chips, comparison,
calm FAQ, closing photo) with Expanse's finish (shop header, type scale, even spacing, fixed photo ratios); and the `cover-full`
`right` hero in other templates puts its words in a solid left-aligned card.

**Architecture:** Two new library sections (`hero-split` in React; `variant-cards` as a React host that a new kit part fills from the
product's variants), one new header variant (`shop`), one new FAQ look (`lines`), Único theme CSS for the finish, and Único's
`template.json` layout rebuilt. The section library learns the new entries so YAPI fills them with the same rules as today.

**Tech Stack:** Esencial React TSX + globals.css; storefront kit IIFE parts (`tools/build-commerce.mjs`); NestJS + Jest; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-03-unico-premium-landing-design.md`

## Global Constraints

- Only the Único theme gets the new page and finish; other templates change only in the `cover-full` look `right` hero.
- Words never sit over a photo in `hero-split`; one alignment (left) in its panel.
- Colour cards: ≥ 2 colour values with their own photo, else nothing (and the hero's «Ver colores» hides). «desde Bs …» only when
  the price is above 0.
- Type `clamp(36px, 5.2vw, 72px)` display / line height 1.02; section padding `clamp(56px, 8vw, 120px)`; content width 1200 px;
  photo radius 22 px; buttons 48 px (laptop) / 52 px (phone); hero photo 4:5, cards 4:5, detail 4:3, closing 21:9.
- No dark text-only bands; facts only; numbers backed (existing rules).
- Stores already built keep their files — only new builds and template switches get any of this.
- Before saving anything under `apps/api/src` (spec files too): no `StoreSourceChatJob` RUNNING/QUEUED.
- Jest: name spec files, always `--maxWorkers=2`; never pass a folder. Contract suite needs `NODE_OPTIONS=--max-old-space-size=6144`.
- Kit: edit `commerce-src/`, then `node packages/storefront-kit/tools/build-commerce.mjs`; rebuild the Studio after kit edits
  (`pnpm --filter @pagosya/merchant-dashboard run build:studio`).
- Commits name their paths; files with other uncommitted work are staged as HEAD + exact replacements (not -U0 hunks) and checked
  (TS/JS parse; CSS: rules inside their `/* lb:… */` or `/* theme:… */` block).

## Review Focus

1. A product with no colours (or colours without photos): no colour cards and no «Ver colores» button — pinned in Task 3.
2. Price still to confirm (amount 0): no «desde Bs 0» on the cards — pinned in Task 3.
3. Two colours sharing one photo: one card per distinct photo, not two identical cards — pinned in Task 3.
4. A long headline (≈ 70 characters) at 390 px: hero panel wraps, no sideways scroll, words still clear of the photo — pinned in Task 6.
5. `cover-full` `right` on a phone: the card sits under the photo, never over it — pinned in Task 1.

---

### Task 1: `cover-full` `right` — words in a solid left-aligned card

**Files:**
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (the `.lb-cover-full[data-lb-look="right"]` rules ~line 2010)
- Test: `apps/api/src/storefront-source/source-cover-panel.spec.ts` (create)

**Interfaces:** Produces only CSS; no names consumed elsewhere.

- [ ] **Step 1: Write the failing test** — render Crocante's demo (its first block is `cover-full` look `right`) in the sandbox:

```ts
// apps/api/src/storefront-source/source-cover-panel.spec.ts
import { listTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';
jest.setTimeout(180_000);

async function cover(width: number) {
  const manifest = listTemplates().find(entry => entry.id === 'crocante')!;
  const resolved = resolvePresetTemplate(manifest, templateManifest);
  const assembled = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), resolved.preset as never);
  const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 844 });
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    return page.evaluate(() => {
      const section = document.querySelector('.lb-cover-full[data-lb-look="right"]')!, copy = section.querySelector('.lb-cover-full__copy') as HTMLElement;
      const photo = section.querySelector('.lb-cover-full__photo')!.getBoundingClientRect(), card = copy.getBoundingClientRect();
      const third = { left: photo.left + photo.width / 3, right: photo.right - photo.width / 3, top: photo.top, bottom: photo.bottom };
      const overCentre = card.left < third.right && card.right > third.left && card.top < third.bottom && card.bottom > third.top;
      const aligns = [...copy.querySelectorAll('h1,h2,p,.lb-actions')].map(el => getComputedStyle(el).textAlign);
      const bg = getComputedStyle(copy).backgroundColor;
      return { overCentre, aligns: [...new Set(aligns)], solid: bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent', below: card.top >= photo.bottom - 40 };
    });
  });
}

describe('cover-full right: words in a solid card (spec 2026-11-03 §3)', () => {
  it('on a laptop the card is solid, left-aligned and clear of the photo centre', async () => {
    const seen = await cover(1280);
    expect(seen.solid).toBe(true);
    expect(seen.aligns).toEqual(['left']);
    expect(seen.overCentre).toBe(false);
  });
  it('on a phone the card sits under the photo (Review Focus 5)', async () => {
    const seen = await cover(390);
    expect(seen.below).toBe(true);
    expect(seen.aligns).toEqual(['left']);
  });
});
```

(`below` allows the card's 32 px overlap of the photo's bottom edge on phones. Crocante's theme already moves the photo above on
phones (`theme:crocante` @media 760px) — if `below` already passes, the phone case still pins it.)

- [ ] **Step 2: Run** `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-cover-panel.spec.ts --maxWorkers=2` — Expected: laptop case FAIL (no solid background, right/centre alignment).

- [ ] **Step 3: Implement** — replace the four `.lb-cover-full[data-lb-look="right"]` copy rules (keep the min-height rule; drop the
radial glow) with:

```css
.lb-cover-full[data-lb-look="right"]::after{display:none}
.lb-cover-full[data-lb-look="right"] .lb-cover-full__copy{display:grid;justify-items:start;text-align:left;width:min(440px,calc(100% - 48px));margin-left:auto;margin-right:clamp(24px,5vw,72px);padding:clamp(24px,3vw,40px);border-radius:22px;background:var(--es-paper);color:var(--es-ink);box-shadow:0 30px 60px -36px #0006}
.lb-cover-full[data-lb-look="right"] :is(.lb-title,.lb-cover__sub,h1,.es-eyebrow){color:var(--es-ink);text-shadow:none;text-align:left;margin-left:0;max-width:none}
.lb-cover-full[data-lb-look="right"] .lb-actions{justify-content:flex-start}
@media (max-width:760px){.lb-cover-full[data-lb-look="right"]{display:block;min-height:0}.lb-cover-full[data-lb-look="right"] .lb-cover-full__photo{position:relative;inset:auto;display:block;width:100%;aspect-ratio:4/5;object-fit:cover}.lb-cover-full[data-lb-look="right"] .lb-cover-full__copy{width:auto;margin:-32px 16px 0;position:relative}}
```

- [ ] **Step 4: Run the test** — Expected: PASS (both). Then `NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-templates-contract.spec.ts -t "plantilla crocante " --maxWorkers=2` — PASS (5).

- [ ] **Step 5: Commit** (globals.css as HEAD + this replacement; check the rules stay outside every `/* lb:… */` block they were not in)

```bash
git commit -m "fix(templates): the full-photo right hero puts its words in a solid left-aligned card, under the photo on phones" -- packages/store-templates/templates/esencial/styles/globals.css apps/api/src/storefront-source/source-cover-panel.spec.ts
```

---

### Task 2: Library section `hero-split` + catalogue entry

**Files:**
- Modify: `packages/store-templates/templates/esencial/components/library.tsx` (new `HeroSplit` near `CoverSplit` ~line 217; registry
  ~line 1287; `ProductHero` Band gets `id="comprar"`)
- Modify: `packages/store-templates/templates/esencial/styles/globals.css` (new `/* lb:hero-split */` block)
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (catalogue entry; `liveCap` includes `hero-split`)
- Test: `apps/api/src/storefront-source/source-section-library-lively.spec.ts` (extend)

**Interfaces:**
- Produces: block type `hero-split` (role `cover`, needs `{ photos: 1, items: [0, 3] }`, templateOnly): title, text, eyebrow, cta,
  cta2, photo, items (pills ≤ 3, ≤ 32 chars, backed numbers). Markup: `section[data-lb="hero-split"]` with
  `.lb-hero-split__photo` (img), `.lb-hero-split__panel`, buttons `a[href="#comprar"]` and `a[href="#colores"][data-needs-colour-cards]`;
  the buy box Band is `#comprar`.

- [ ] **Step 1: Failing test** (append to the lively library spec):

```ts
describe('hero-split (spec 2026-11-03 premium landing)', () => {
  it('keeps a titled hero with its photo and up to three backed pills', () => {
    const [hero] = fill(raw('hero-split', { title: 'El sofá que llega en una caja', text: 'Lo abres y toma su forma.', eyebrow: 'Santa Cruz', cta: 'Ver el producto', cta2: 'Ver colores', photo: 0, items: [item('Llega en caja'), item('Entrega 24–48 h')] }));
    expect(hero).toMatchObject({ type: 'hero-split', title: 'El sofá que llega en una caja', photo: '/v1/uploads/a.jpg' });
    expect(hero.items?.map(entry => entry.title)).toEqual(['Llega en caja']);
  });
  it('drops a hero without a title', () => {
    expect(fill(raw('hero-split', { photo: 0 }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `cd apps/api && npx jest src/storefront-source/source-section-library-lively.spec.ts --maxWorkers=2` — Expected: FAIL (unknown type).

- [ ] **Step 3: Implement**

Catalogue (after `cover-split`):

```ts
  { id: 'hero-split', role: 'cover', use: 'Portada de tienda de un producto: la mejor foto de ambiente a un lado, al otro eyebrow (ciudad o categoría), titular grande, una o dos líneas y dos botones (cta «Ver el producto», cta2 «Ver colores»). items = hasta 3 etiquetas cortas sobre la foto (≤ 32 letras, solo hechos dados).', needs: { photos: 1, items: [0, 3] }, templateOnly: true },
```

`liveCap`: `section.id === 'product-hero' || section.id === 'hero-split' ? 32 : …`.

React (library.tsx):

```tsx
/** Premium landing (spec 2026-11-03): nubecorp's opening with Expanse's finish — the photo on one side, the words in their own panel
 *  (never over the photo), one alignment; pills float on the photo. «Ver colores» hides when the colour cards do not draw. */
function HeroSplit({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.photo || !block.title) return null;
  const pills = (block.items ?? []).map(item => item.title).filter(Boolean).slice(0, 3);
  return <section id="inicio" className="lb lb-hero-split" data-lb="hero-split" aria-labelledby={`lb-${index}-title`}>
    <div className="lb-hero-split__media">
      <Photo src={block.photo} className="lb-hero-split__photo" eager />
      {pills.length ? <ul className="lb-hero-split__pills" aria-label="Destacados">{pills.map((pill, at) => <li key={at} style={{ ['--i' as string]: at } as CSSProperties}><span aria-hidden="true" />{pill}</li>)}</ul> : null}
    </div>
    <div className="lb-hero-split__panel">
      {block.eyebrow ? <p className="es-eyebrow lb-hero-split__eyebrow"><span aria-hidden="true" />{block.eyebrow}</p> : null}
      <h1 id={`lb-${index}-title`} className="es-display lb-title"><Marked text={block.title} /></h1>
      {block.text ? <p className="lb-lede">{block.text}</p> : null}
      <div className="es-actions lb-actions">
        <a className="es-btn es-btn--solid" href="#comprar">{block.cta || 'Ver el producto'}</a>
        {block.cta2 ? <a className="es-btn es-btn--ghost" href="#colores" data-needs-colour-cards="">{block.cta2}</a> : null}
      </div>
    </div>
  </section>;
}
```

(Reuse the class names `function Button` in library.tsx gives its solid and ghost buttons instead of the two above if they differ.)
Registry: `'hero-split': HeroSplit,`. ProductHero: `<Band block={block} index={index} id="comprar">`.

CSS `/* lb:hero-split */`:

```css
.lb-hero-split{display:grid;gap:clamp(24px,4vw,64px);align-items:center;width:min(1200px,calc(100% - 32px));margin:clamp(16px,3vw,32px) auto 0}
@media (min-width:861px){.lb-hero-split{grid-template-columns:1.05fr 1fr}}
.lb-hero-split__media{position:relative}
.lb-hero-split__photo{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:22px}
@media (min-width:861px){.lb-hero-split__photo{aspect-ratio:1/1}}
.lb-hero-split__pills{position:absolute;left:16px;bottom:16px;display:grid;gap:8px;margin:0;padding:0;list-style:none}
.lb-hero-split__pills li{display:inline-flex;align-items:center;gap:8px;justify-self:start;padding:8px 14px;border-radius:999px;background:color-mix(in srgb,var(--es-paper) 92%,transparent);font-size:13px;font-weight:600;box-shadow:0 8px 22px -12px #0000004d}
.lb-hero-split__pills li span,.lb-hero-split__eyebrow span{width:8px;height:8px;border-radius:50%;background:#2fbf71;display:inline-block}
.lb-hero-split__panel{display:grid;justify-items:start;gap:18px;text-align:left}
.lb-hero-split__eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0}
.lb-hero-split .lb-title{margin:0;font-size:clamp(36px,5.2vw,72px);line-height:1.02;letter-spacing:-.02em;max-width:14ch}
.lb-hero-split .lb-lede{margin:0;max-width:44ch;font-size:clamp(16px,1.3vw,18px)}
@media (prefers-reduced-motion:no-preference){.lb-hero-split__pills li{animation:pya-float 5s ease-in-out infinite;animation-delay:calc(var(--i) * -1.4s)}.lb-hero-split__pills li span,.lb-hero-split__eyebrow span{animation:lb-ping 2s ease-out infinite}}
@keyframes lb-ping{0%{box-shadow:0 0 0 0 #2fbf7180}100%{box-shadow:0 0 0 8px #2fbf7100}}
/* /lb:hero-split */
```

- [ ] **Step 4: Run** the spec — Expected: PASS. Typecheck: `cd apps/api && npx tsc -p tsconfig.json --noEmit --incremental false | grep -c "error TS"` → 0.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(unico): hero-split — photo on one side, words in their own panel, pills on the photo" -- packages/store-templates/templates/esencial/components/library.tsx packages/store-templates/templates/esencial/styles/globals.css apps/api/src/storefront-source/source-section-library.ts apps/api/src/storefront-source/source-section-library-lively.spec.ts
```

---

### Task 3: Colour cards — kit part `product/variant-cards.js` + library host `variant-cards`

**Files:**
- Create: `packages/storefront-kit/commerce-src/product/variant-cards.js`; add to PARTS after `'look/lively.js'`
- Modify: `packages/store-templates/templates/esencial/components/library.tsx` (host `VariantCards`), `globals.css` (`/* lb:variant-cards */`)
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (catalogue entry; product id like product-hero)
- Test: `apps/api/src/storefront-source/source-commerce-lively.spec.ts` (extend), `source-section-library-lively.spec.ts` (extend)

**Interfaces:**
- Consumes: kit shared scope `store` (items), `optionGroups(p)`, `variantPhotos(v)`, `money(amount, currency)`; buy box buttons
  `[data-pagosya-product-page] [data-product-option="<group>"][data-option-value="<value index>"]`; hero buttons `[data-needs-colour-cards]`.
- Produces: host markup `<div data-pagosya-variant-cards data-product-id="<id>">` inside `section#colores[data-lb="variant-cards"]`;
  kit fills it with `button.pya-colour-card` (img, name, optional «desde …»), or hides the section and every `[data-needs-colour-cards]`.

- [ ] **Step 1: Failing tests**

Kit (append to source-commerce-lively.spec.ts; `ITEM`, `PAGE`, `open` exist there):

```ts
describe('colour cards (spec 2026-11-03 premium landing)', () => {
  const img = (n: number) => `data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACw=#${n}`;
  const colours = (photos: Array<string | undefined>, amount = 300000) => ({ ...ITEM, amount, variants: photos.map((photo, at) => ({ id: `v${at}`, name: `C${at}`, amount, stock: 3, options: [{ name: 'Color', value: `C${at}` }], ...(photo ? { imageUrls: [photo] } : {}) })) });
  const CARDS = (extra = '') => PAGE(extra).replace('<div style="height:2400px"></div>', '<section id="colores" data-lb="variant-cards"><div data-pagosya-variant-cards data-product-id="sofa"></div></section><a href="#colores" data-needs-colour-cards>Ver colores</a><div style="height:2400px"></div>');
  it('draws one card per photographed colour and picks it in the buy box', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([img(1), img(2), img(3)])] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card').count()).toBe(3);
      await page.locator('.pya-colour-card').nth(1).click();
      await page.waitForFunction(() => document.querySelector('[data-product-option="0"][data-option-value="1"]')?.getAttribute('aria-pressed') === 'true');
      expect(await page.locator('.pya-colour-card').first().textContent()).toMatch(/desde/i);
    } finally { await page.close(); }
  });
  it('hides itself and «Ver colores» with fewer than two photographed colours (Review Focus 1)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([img(1), undefined])] } });
    try {
      await page.waitForFunction(() => (document.querySelector('#colores') as HTMLElement).hidden && (document.querySelector('[data-needs-colour-cards]') as HTMLElement).hidden);
    } finally { await page.close(); }
  });
  it('shows no «desde» while the price is still to confirm (Review Focus 2)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([img(1), img(2)], 0)] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card', { hasText: /desde/i }).count()).toBe(0);
    } finally { await page.close(); }
  });
  it('makes one card per distinct photo (Review Focus 3)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([img(1), img(1), img(2)])] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card').count()).toBe(2);
    } finally { await page.close(); }
  });
});
```

(The helper `open()` waits for `.product-detail__buy`; with an amount of 0 the buy box still renders. If two image data URLs that differ
only by `#n` are treated as the same photo by the kit's `safeUrl`, use two different base64 GIFs as in the pills test.)

Library (append):

```ts
it('variant-cards takes the store product and keeps only its title', () => {
  const [cards] = fill(raw('variant-cards', { title: 'Elige tu color' }));
  expect(cards).toMatchObject({ type: 'variant-cards', product: 'p1', title: 'Elige tu color' });
});
```

- [ ] **Step 2: Run both specs** — Expected: FAIL.

- [ ] **Step 3: Implement**

Kit part (`product/variant-cards.js`, PARTS after `'look/lively.js'`):

```js
  // Premium landing (spec 2026-11-03): one card per colour that has its own photo, from the product's variants; a tap picks that colour
  // in the buy box and scrolls there. Fewer than two photographed colours: the section and «Ver colores» hide.
  (function variantCards() {
    const style = document.createElement('style');
    style.setAttribute('data-pagosya-colour-cards', '');
    style.textContent = `.pya-colour-cards{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(200px,1fr);gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:8px}
      .pya-colour-card{all:unset;cursor:pointer;scroll-snap-align:start;display:grid;gap:6px}
      .pya-colour-card img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:22px;transition:transform .3s}
      @media (hover:hover){.pya-colour-card:hover img{transform:scale(1.02)}}
      .pya-colour-card:focus-visible{outline:2px solid currentColor;outline-offset:4px;border-radius:22px}
      .pya-colour-card strong{font-size:15px}.pya-colour-card span{font-size:13px;opacity:.7}`;
    document.head.append(style);
    const draw = () => document.querySelectorAll('[data-pagosya-variant-cards][data-product-id]').forEach(host => {
      if (host.dataset.drawn) return;
      const product = (store.items || []).find(item => String(item.id) === host.getAttribute('data-product-id'));
      if (!product) return;
      host.dataset.drawn = '1';
      const groups = optionGroups(product) || [];
      const colourAt = groups.findIndex(group => /^colou?r(es)?$/i.test(String(group.name || '').trim()));
      const seen = new Set(), cards = [];
      if (colourAt >= 0) groups[colourAt].values.forEach((value, valueAt) => {
        const variant = (product.variants || []).find(v => variantValues(v)[colourAt] === value && variantPhotos(v)[0]);
        const photo = variant && variantPhotos(variant)[0];
        if (!photo || seen.has(photo)) return;
        seen.add(photo);
        const amount = Number(variant.amount ?? product.amount) || 0;
        cards.push(`<button type="button" class="pya-colour-card" data-colour-group="${colourAt}" data-colour-value="${valueAt}"><img src="${escape(photo)}" alt="" loading="lazy"><strong>${escape(value)}</strong>${amount > 0 ? `<span>desde ${escape(money(amount, product.currency))}</span>` : ''}</button>`);
      });
      const section = host.closest('section') || host;
      if (cards.length < 2) { section.hidden = true; document.querySelectorAll('[data-needs-colour-cards]').forEach(el => { el.hidden = true; }); return; }
      host.innerHTML = `<div class="pya-colour-cards">${cards.join('')}</div>`;
      host.addEventListener('click', event => {
        const card = event.target.closest('.pya-colour-card'); if (!card) return;
        const option = document.querySelector(`[data-pagosya-product-page] [data-product-option="${card.dataset.colourGroup}"][data-option-value="${card.dataset.colourValue}"]`);
        option?.click();
        (option?.closest('[data-pagosya-product-page]') || document.querySelector('#comprar'))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      });
    });
    draw();
    new MutationObserver(draw).observe(document.body || document.documentElement, { childList: true, subtree: true });
  })();
```

(`variantValues`, `variantPhotos`, `optionGroups`, `money`, `escape`, `store` are in the IIFE's shared scope — confirm each exists by
name in commerce-src before relying on it. Check `money()`'s unit against how the product page prints `priceMarkup(p)`: if amounts are
in cents and `money` expects units, divide the same way the product page does. If store items load later from the API, the
MutationObserver redraw is not enough — also call `draw` where the kit re-renders after loading data (read `shared/start.js`).)

Library host (library.tsx) + registry `'variant-cards': VariantCards,`:

```tsx
/** Premium landing (spec 2026-11-03): the colour cards; the kit draws them from the product's variants (hidden with fewer than two). */
function VariantCards({ block, index }: { block: LibraryBlock; index: number }) {
  if (!block.product) return null;
  return <Band block={block} index={index} id="colores">
    <Head block={{ ...block, title: block.title || 'Elige tu color' }} index={index} />
    <div data-pagosya-variant-cards="" data-product-id={block.product} />
  </Band>;
}
```

Catalogue:

```ts
  { id: 'variant-cards', role: 'products', use: 'Tarjetas de colores del producto (las dibuja la tienda desde sus variantes con foto). Solo title (corto, p. ej. «Elige tu color»).', needs: { product: true }, templateOnly: true },
```

and extend the product-hero default line to
`if ((section.id === 'product-hero' || section.id === 'variant-cards') && !block.product && facts.products[0]) block.product = facts.products[0].id;`.

- [ ] **Step 4: Run** both specs + `cd packages/storefront-kit && npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(unico): colour cards — one card per photographed colour, a tap picks it in the buy box" -- packages/storefront-kit/commerce-src/product/variant-cards.js packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js packages/store-templates/templates/esencial/components/library.tsx apps/api/src/storefront-source/source-section-library.ts apps/api/src/storefront-source/source-commerce-lively.spec.ts apps/api/src/storefront-source/source-section-library-lively.spec.ts
```

---

### Task 4: Header variant `shop` and FAQ look `lines`

**Files:**
- Modify: `packages/store-templates/templates/esencial/template.json` (master.variants.header += `"shop"`)
- Modify: `packages/store-templates/templates/esencial/components/Shell.tsx` (inside `.es-header__end`, ~line 92: a «Comprar» link in `shop`)
- Modify: `globals.css` (`[data-es-header="shop"]` rules; `[data-lb="faq-split"][data-lb-look="lines"]` rules inside `/* lb:faq-split */`)
- Modify: `apps/api/src/storefront-source/source-section-library.ts` (faq-split `looks` gains `'lines'`)
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (extend)

**Interfaces:** Produces `header[data-es-header="shop"] a.es-header__buy[href="index.html#comprar"]`; FAQ look `lines`.

- [ ] **Step 1: Failing test** (in source-unico-lively.spec.ts, using `onUnico` with a patch that sets the header variant):

```ts
it('the shop header carries search, account, cart and a «Comprar» button', async () => {
  const seen = await onUnico({ width: 1280, patch: data => data.replace('"header":"minimal"', '"header":"shop"') }, page => page.evaluate(() => {
    const header = document.querySelector('header[data-es-header="shop"]');
    return { header: !!header, buy: header?.querySelector('a.es-header__buy')?.getAttribute('href'), cart: !!header?.querySelector('[data-cart-open]'), search: !!header?.querySelector('a[href="buscar.html"]') };
  }));
  expect(seen).toEqual({ header: true, buy: 'index.html#comprar', cart: true, search: true });
});
```

(If the variants live outside store-data, patch where `variants` are serialised — the `onUnico` patch receives store-data's text.)

- [ ] **Step 2: Run** — Expected: FAIL (`shop` not a known variant).

- [ ] **Step 3: Implement** — template.json header list `+ "shop"`; Shell.tsx inside `.es-header__end` after the icons:
`{variant('header', 'classic') === 'shop' ? <a className="es-btn es-header__buy" href="index.html#comprar">Comprar</a> : null}`; CSS:

```css
[data-es-header="shop"]{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--es-paper) 92%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid color-mix(in srgb,var(--es-ink) 10%,transparent)}
[data-es-header="shop"] .es-header__buy{min-height:40px;padding:0 18px;border-radius:999px;background:var(--es-ink);color:var(--es-paper);display:inline-flex;align-items:center;font-weight:700}
@media (max-width:760px){[data-es-header="shop"] .es-header__links,[data-es-header="shop"] [data-pagosya-account]{display:none}}
```

FAQ `lines` (inside `/* lb:faq-split */`):

```css
[data-lb="faq-split"][data-lb-look="lines"] .lb-faq__item{background:none;border:0;border-bottom:1px solid color-mix(in srgb,var(--es-ink) 14%,transparent);border-radius:0;padding:18px 0}
[data-lb="faq-split"][data-lb-look="lines"] .lb-faq__item summary{font-weight:600}
```

Catalogue: faq-split `looks: [...existing, 'lines']`.

- [ ] **Step 4: Run** — Expected: PASS; `plantilla unico` contract 5/5.
- [ ] **Step 5: Commit** — message `feat(esencial): shop header (search, account, cart, «Comprar») and a calm FAQ look`, naming every touched path.

---

### Task 5: Único finish — type, spacing, photos, buttons (theme CSS)

**Files:**
- Modify: `globals.css` inside `/* theme:unico */`
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (extend)

**Interfaces:** CSS only, scoped `[data-es-theme="unico"]`.

- [ ] **Step 1: Failing test**

```ts
it('Único has one section rhythm and one button height', async () => {
  const seen = await onUnico({ width: 1280 }, page => page.evaluate(() => {
    const bands = [...document.querySelectorAll('main section.es-section:not([hidden])')] as HTMLElement[];
    const pads = [...new Set(bands.map(el => Math.round(parseFloat(getComputedStyle(el).paddingTop))))];
    const buttons = [...new Set([...document.querySelectorAll('main a.es-btn')].map(el => Math.round(el.getBoundingClientRect().height)).filter(Boolean))];
    return { pads, buttons };
  }));
  expect(seen.pads.length).toBe(1);
  expect(seen.pads[0]).toBeGreaterThanOrEqual(96);
  expect(seen.buttons).toEqual([48]);
});
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** (inside `/* theme:unico */`):

```css
[data-es-theme="unico"] main section.es-section{padding-block:clamp(56px,8vw,120px)}
[data-es-theme="unico"] main section.es-section>*{width:min(1200px,calc(100% - 32px));margin-inline:auto}
[data-es-theme="unico"] :is(.es-display,h1.lb-title){font-size:clamp(36px,5.2vw,72px);line-height:1.02;letter-spacing:-.02em;text-transform:none}
[data-es-theme="unico"] :is(.es-h2,.lb-head h2){font-size:clamp(28px,3.4vw,48px);line-height:1.06;letter-spacing:-.015em}
[data-es-theme="unico"] main :is(.lb-lede,p){font-size:clamp(16px,1.2vw,17px);max-width:62ch}
[data-es-theme="unico"] main a.es-btn{min-height:48px;height:48px;padding:0 24px;border-radius:999px;display:inline-flex;align-items:center}
@media (max-width:760px){[data-es-theme="unico"] main a.es-btn{min-height:52px;height:52px}}
[data-es-theme="unico"] [data-es-band]{background:color-mix(in srgb,var(--es-accent) 8%,var(--es-paper))}
[data-es-theme="unico"] main :is(.lb-closing img,[data-lb="closing-photo"] img){aspect-ratio:21/9;object-fit:cover;border-radius:22px}
```

(Bleed sections are full-width by design and are not in `section.es-section`. If a section type sets its own padding with higher
specificity, add it to the first rule rather than loosening the test.)
- [ ] **Step 4: Run** — PASS; `plantilla unico` contract 5/5.
- [ ] **Step 5: Commit** — `feat(unico): Expanse finish — one type scale, section rhythm, content width, photo radius and button height`.

---

### Task 6: Único's new page (template.json layout) and its render checks

**Files:**
- Modify: `packages/store-templates/templates/unico/template.json` (preset.variants.header `"shop"`; preset.layout rebuilt)
- Test: `apps/api/src/storefront-source/source-unico-lively.spec.ts` (extend; update the pills test — pills now on the hero)

**Interfaces:** Consumes every section above. Layout order: `promo-countdown`, `hero-split`, `strip-marquee`, `wave-divider`,
`variant-cards`, `product-hero`, `benefits-orbit` (band `muted`), `detail-hotspots`, `chips-marquee`, `compare-table`,
`faq-split` (look `lines`), `closing-photo`.

- [ ] **Step 1: Failing tests**

```ts
it('opens with the split hero whose words never cover its photo, at 1280 and 390 (Review Focus 4)', async () => {
  for (const width of [1280, 390]) {
    const seen = await onUnico({ width, patch: data => data.replace(/"type":"hero-split",("eyebrow":"[^"]*",)?"title":"[^"]*"/, '"type":"hero-split","title":"El sofá cama que llega comprimido en una caja y se infla en tu sala"') }, page => page.evaluate(() => {
      const first = document.querySelector('main [data-lb]')!.getAttribute('data-lb');
      const photo = document.querySelector('.lb-hero-split__photo')!.getBoundingClientRect(), panel = document.querySelector('.lb-hero-split__panel')!.getBoundingClientRect();
      const overlap = panel.left < photo.right && panel.right > photo.left && panel.top < photo.bottom && panel.bottom > photo.top;
      const aligns = [...new Set([...document.querySelectorAll('.lb-hero-split__panel > *')].map(el => getComputedStyle(el).textAlign))];
      return { first, overlap, aligns, scroll: document.documentElement.scrollWidth };
    }));
    expect(seen.first).toBe('hero-split');
    expect(seen.overlap).toBe(false);
    expect(seen.aligns).toEqual(['left']);
    expect(seen.scroll).toBe(width);
  }
});
it('follows the nubecorp order', async () => {
  const order = await onUnico({ width: 1280 }, page => page.evaluate(() => [...document.querySelectorAll('main [data-lb]')].map(el => el.getAttribute('data-lb'))));
  const wanted = ['hero-split', 'strip-marquee', 'variant-cards', 'product-hero', 'benefits-orbit', 'chips-marquee', 'faq-split', 'closing-photo'];
  expect(order.filter(type => wanted.includes(type!))).toEqual(wanted);
});
```

(`promo-countdown` draws nothing without a date, so `hero-split` is the first drawn `[data-lb]`. `variant-cards` keeps its
`data-lb` even when the kit hides it.)

- [ ] **Step 2: Run** — Expected: FAIL (old layout).
- [ ] **Step 3: Implement** — rebuild `preset.layout` with Python (`json.load` / `json.dumps(indent=2, ensure_ascii=False) + '\n'`;
the file round-trips byte-identical): keep `promo-countdown`, `product-hero` (drop its `items` — pills move to the hero),
`detail-hotspots`, `chips-marquee`, `faq-split`; add these blocks, in the Interfaces order:

```json
{ "type": "hero-split", "eyebrow": "Envío a todo el país", "title": "Un producto *pensado* para tu día", "text": "Fácil de usar, hecho para durar y listo desde que lo abres.", "cta": "Ver el producto", "cta2": "Ver colores", "photo": "slot:un-hero", "items": [{ "title": "Envío a todo el país" }, { "title": "Pago seguro" }] },
{ "type": "strip-marquee", "look": "solid", "items": [{ "title": "Fácil de usar" }, { "title": "Hecho para durar" }, { "title": "Listo para usar" }, { "title": "Va contigo" }, { "title": "Pago seguro" }] },
{ "type": "wave-divider" },
{ "type": "variant-cards", "title": "Elige tu *color*" },
{ "type": "benefits-orbit", "band": "muted", "title": "Por qué te va a *encantar*", "photo": "slot:un-story", "items": [{ "title": "Fácil de usar", "text": "Lo sacas de la caja y listo.", "icon": "sparkles" }, { "title": "Hecho para durar", "text": "Materiales que aguantan el día a día.", "icon": "shield" }, { "title": "Va contigo", "text": "Liviano y cómodo de llevar.", "icon": "heart" }, { "title": "Pago seguro", "text": "Pagas con QR o tarjeta.", "icon": "lock" }] },
{ "type": "compare-table", "title": "Este producto vs lo de siempre", "items": [{ "title": "Listo al sacarlo de la caja", "value": "no" }, { "title": "Fácil de guardar", "value": "no" }, { "title": "Pago seguro en línea", "value": "yes" }] },
{ "type": "closing-photo", "title": "Llévalo hoy", "cta": "Comprar", "photo": "slot:un-p2" }
```

set `faq-split.look` to `"lines"`; `preset.variants.header` → `"shop"`. Update the existing test that read `data-product-pills` to
read `.lb-hero-split__pills li` instead. (Icons must be in `LIBRARY_ICON_NAMES`; swap `shield`/`lock` for listed ones if not.)
- [ ] **Step 4: Run** the Único spec + `plantilla unico` contract — PASS.
- [ ] **Step 5: Commit** — `feat(unico): the premium landing page — hero, word band, colour cards, buy box, benefits, hotspots, chips, comparison, calm FAQ, closing`.

---

### Task 7: Full checks and the live store

- [ ] **Step 1:** `node packages/storefront-kit/tools/build-commerce.mjs --check && pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- [ ] **Step 2:** full contract suite — `cd apps/api && NODE_OPTIONS=--max-old-space-size=6144 npx jest src/storefront-source/source-templates-contract.spec.ts --maxWorkers=2` → all pass (the `cover-full` change touches several templates).
- [ ] **Step 3:** live (stack on `pnpm dev:chatgpt`): a new store from the sofa screenshot + the owner's real photos (a fabric close-up,
  one photo per colour if available). At 1280 and 390: hero panel clear of the photo, colour cards pick the colour, buy bar, header
  «Comprar», FAQ lines, no sideways scroll. Switch an existing store to Crocante («cámbiala a la plantilla Crocante») to see the new
  hero card. Screenshots next to nubecorp and Expanse for the owner.
- [ ] **Step 4:** report to the owner with screenshots and anything that does not match the spec.
