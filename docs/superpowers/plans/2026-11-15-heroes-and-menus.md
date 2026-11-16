# Heroes and Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every V2 store gets its own hero (one of 8 briefs taken from amboras.com, never the same as the merchant's other stores) and its own menu (one of 16 kit models), with photos that carry words never cropped.

**Architecture:** Menus live in the kit's existing store menu (`config.header.menu`), which gains a `model` and one markup/CSS variant per model; the V2 direction picks a model and its groups and the assembly writes them into `config.js`. Heroes stay written by YAPI: the direction picks a hero idea from the ideas this merchant has not used yet, and the writer of the first half gets that idea's brief and its real reference frames. Photos with words are found once per photo (cached), marked on the page, and a page rule blocks any build that crops them.

**Tech Stack:** NestJS API (TypeScript, jest + ts-jest, Playwright for page rules), the storefront kit (plain JS runtime parts concatenated by `tools/build-commerce.mjs`, React `ui.tsx`), jsdom specs for the kit runtime.

**Spec:** `docs/superpowers/specs/2026-11-15-store-menu-models-design.md` (menus) + this plan's Task 6 (hero briefs; owner decisions 2026-11-15: heroes from amboras.com, 9 kept then Atelier cut — the clothing rail needs matching front/back/side cut-outs our merchants don't have; mockups https://claude.ai/artifact/5x3tPVE5NhxNsccFy5bAbu and https://claude.ai/artifact/HxKW6dXKnYMQNmyP9c9sdK).

## Global Constraints

- Light checks only: run the one spec file a task touches (`npx jest <file>` from `apps/api`); no whole-project `tsc`, no folder-wide jest.
- Before EVERY save under `apps/api` (specs included) or `packages/storefront-kit/index.*`: no YAPI job or V2 run may be RUNNING (saving restarts `nest --watch` and kills it). Check `GET …/v2-prototype` state and the `StoreSourceChatJob` table first.
- Never `sed -i` an `apps/api/src` file (the watcher stops compiling it); use Edit/Write or Python in place. After a save, confirm the API restarted: `ps -o lstart= -p $(lsof -t -iTCP:3001 -sTCP:LISTEN)`.
- `packages/storefront-kit/kit/commerce.js` is never edited by hand: edit `commerce-src/…`, then run `node packages/storefront-kit/tools/build-commerce.mjs`.
- Commerce runtime cap is 1.25 MB (`MAX_COMMERCE_RUNTIME`); measure `wc -c packages/storefront-kit/kit/commerce.js` after each kit task. Above 1.10 MB, model CSS moves to load-on-demand (Task 3, step 6).
- Copy shown to shoppers is Spanish, short, true; no invented offers, ratings, counts or editions. «Lo más buscado» is never used (no search data): the label is «Populares».
- Every motion respects `prefers-reduced-motion: reduce` (no animation, final state shown).
- Tap areas ≥ 44 px; menus open/close ≤ 200 ms.
- Live runs use the owner's stack (`pnpm dev:chatgpt`), never paid API credits.

## Review Focus

- A store whose menu config names a model the runtime does not know (old store, typo, future model) → it must fall back to `tabs`, never render nothing.
- A merchant with only one store, or who has used all 8 hero ideas → the picker must still return a non-empty allowed list, never an empty enum.
- A photo marked «with words» that the writer shows with `object-fit: contain` inside a box of another shape → not a crop, must not block.
- `thumb`/`dock` bars on a phone over the cart drawer, checkout and the floating WhatsApp/contact button → those controls stay tappable above the bar.
- A store with no badges, no offer, no subscription → `bestsellers`/`offer`/`search` still render with honest labels («Destacados», best-seller tile), never empty boxes.

Each line has its test in the owning task (Tasks 1, 6, 7, 3, 3).

---

## File structure

| File | Responsibility |
|---|---|
| `packages/storefront-kit/commerce-src/header/store-menu.js` | Modify: `model` field, model routing, markup variants, phone forms, selling data (best sellers, offer, populares, counts, «desde» prices). |
| `packages/storefront-kit/commerce-src/header/store-menu-models.css.js` | Create: `STORE_MENU_MODEL_CSS`, one block per model, concatenated before `store-menu.js` (added to `PARTS` in `tools/build-commerce.mjs`). |
| `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts` | Modify: jsdom tests per model. |
| `apps/api/src/storefront-source/v2/v2-menus.ts` | Create: model list for the prompt, schema piece, `menuProblems()`, `withStoreMenu()`, `allowedMenus()`. |
| `apps/api/src/storefront-source/v2/v2-heroes.ts` | Create: the 8 hero ideas, `allowedHeroIdeas()`, `heroMarker()`/`readHeroMarker()`. |
| `apps/api/src/storefront-source/v2/v2-words.ts` | Create: `cropShare()`, `markWordPhotos()`, the words look prompt/schema. |
| `apps/api/src/storefront-source/v2/v2-prompts.ts` | Modify: direction schema (`hero.idea` enum, `menu`), direction/writer inputs, contract wires `menuProblems`, `v2Repairs` marks word photos and keeps the hero marker. |
| `apps/api/src/storefront-source/v2/v2-prototype.service.ts` | Modify: merchant history, hero frames to half `a`, words look call, `header.menu` assembly, retention in settings. |
| `apps/api/src/storefront-source/v2/v2-context.ts` | Modify: `V2Photo.words?`, `V2Context.heroesAllowed?/menusAllowed?/heroIdea?`, `withStoreSettings` gains `retention`. |
| `apps/api/src/storefront-source/source-template-qa-rules.ts` | Modify: `weak-hero` wording, new `cropped-words` rule. |
| `apps/api/src/storefront-source/v2/v2-run.ts` | Modify: `cropped-words` in `FREE_BLOCKERS`. |
| `apps/api/src/storefront-source/v2/v2.spec.ts` | Modify: tests for heroes, menus, words, settings. |
| `examples/v2-proto/references/_heroes/` | Exists: frames + README (saved 2026-11-15). |

---

### Task 1: Menu `model` field and safe routing (kit)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/header/store-menu.js:62-65,181-195`
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Produces: `storeMenuModel(menu)` → one of the 16 ids; panel `data-model`, host `data-store-menu-model`; `config.header.menu.model` accepted alongside `style`.

- [ ] **Step 1: Write the failing test** (append to the spec's `describe`)

```ts
it('reads the menu model and falls back to tabs for an unknown one (spec 2026-11-15 menu models)', async () => {
  const w = await open({ menu: { model: 'overlay', groups: [] } });
  expect(w.document.querySelector('.pym-panel')!.getAttribute('data-model')).toBe('overlay');
  expect(w.document.querySelector('header')!.getAttribute('data-store-menu-model')).toBe('overlay');
  const legacy = await open({ menu: { style: 'dropdowns' } });
  expect(legacy.document.querySelector('.pym-panel')!.getAttribute('data-model')).toBe('dropdown');
  const odd = await open({ menu: { model: 'hologram' } });
  expect(odd.document.querySelector('.pym-panel')!.getAttribute('data-model')).toBe('tabs');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts -t "menu model"`
Expected: FAIL (`data-model` is null).

- [ ] **Step 3: Implement**

```js
  const STORE_MENU_MODELS = ['tabs', 'mega', 'overlay', 'dropdown', 'drawer', 'split', 'index', 'dock', 'stickers', 'circles', 'rail', 'bestsellers', 'need', 'offer', 'search', 'thumb'];
  // Models that open from top links on a computer (the old «dropdowns» style); the rest open from ☰ or never close.
  const STORE_MENU_TOP_LINKS = new Set(['dropdown', 'mega', 'bestsellers', 'need', 'offer']);
  function storeMenuModel(menu) {
    if (STORE_MENU_MODELS.includes(menu.model)) return menu.model;
    return menu.style === 'dropdowns' ? 'dropdown' : 'tabs';
  }
  function storeMenuConfig() {
    const menu = config.header && config.header.menu;
    return menu && (menu.style === 'panel' || menu.style === 'dropdowns' || typeof menu.model === 'string') ? menu : null;
  }
```

In `renderStoreMenu`:

```js
    const model = storeMenuModel(menu);
    const linksMount = STORE_MENU_TOP_LINKS.has(model) ? host.querySelector('[data-pagosya-store-menu="links"]') : null;
    …
    host.setAttribute('data-store-menu', STORE_MENU_TOP_LINKS.has(model) ? 'dropdowns' : 'panel');
    host.setAttribute('data-store-menu-model', model);
    …
    panel.setAttribute('data-model', model);
```

(`data-store-menu` keeps its old `dropdowns|panel` values so existing CSS and NavShell rules keep working.)

- [ ] **Step 4: Build and run**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/commerce-src/header/store-menu.js packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): store menu model field with legacy style mapping and a tabs fallback"
```

### Task 2: Look models — mega, overlay, dropdown, drawer, split, index (kit)

**Files:**
- Create: `packages/storefront-kit/commerce-src/header/store-menu-models.css.js`
- Modify: `packages/storefront-kit/tools/build-commerce.mjs:65` (add `'header/store-menu-models.css.js',` before `'header/store-menu.js',`), `packages/storefront-kit/commerce-src/header/store-menu.js`
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Consumes: `storeMenuModel`, `data-model` (Task 1).
- Produces: `STORE_MENU_MODEL_CSS`; hooks `.pym-tile-title`, `.pym-hero-photo` (+ `a[data-photo-for]`), `.pym-count`, `.pym-note`, `.pym-link-label`; resolved links carry `note` (≤ 60 chars) and `image`.

- [ ] **Step 1: Write the failing tests**

```ts
it('draws each look model with its own parts (mega, overlay, index)', async () => {
  const groups = [{ label: 'Tienda', links: [{ to: 'category:C1' }, { to: 'category:c2', note: 'Hechas a mano' }], tiles: [{ to: 'category:C1', image: 'https://api.test/a.jpg', title: 'Vestidos' }] }];
  const mega = await open({ menu: { model: 'mega', groups } });
  expect(mega.document.querySelector('.pym-tile-title')!.textContent).toBe('Vestidos');
  const overlay = await open({ menu: { model: 'overlay', groups } });
  expect(overlay.document.querySelector('.pym-hero-photo')).not.toBeNull();
  expect(overlay.document.querySelector('.pym-links a[data-photo-for]')).not.toBeNull();
  const index = await open({ menu: { model: 'index', groups } });
  expect([...index.document.querySelectorAll('.pym-count')].map(el => el.textContent)).toEqual(['1 producto', '1 producto']);
  expect(index.document.querySelector('.pym-note')!.textContent).toBe('Hechas a mano');
  expect(index.document.querySelector('.pym-tiles')).toBeNull();
});
it('every look model closes on Escape and returns focus to ☰', async () => {
  for (const model of ['mega', 'overlay', 'dropdown', 'drawer', 'split', 'index']) {
    const w = await open({ menu: { model } });
    const toggle = w.document.querySelector('[data-store-menu-toggle]') as HTMLButtonElement;
    toggle.click();
    expect((w.document.querySelector('.pym-panel') as HTMLElement).hidden).toBe(false);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    expect((w.document.querySelector('.pym-panel') as HTMLElement).hidden).toBe(true);
    expect(w.document.activeElement).toBe(toggle);
  }
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts -t "look model"`
Expected: FAIL.

- [ ] **Step 3: Markup hooks in `renderStoreMenu`**

```js
    const countOf = href => { const id = new URL(href, location.href).searchParams.get('f_categoria'); const n = id ? products().filter(item => filterFold(item.categoryId) === id).length : 0; return n ? `${n} ${n === 1 ? 'producto' : 'productos'}` : ''; };
    const linkHtml = link => {
      const note = link.note ? `<span class="pym-note">${escape(link.note)}</span>` : '';
      const count = model === 'index' ? `<span class="pym-count">${escape(countOf(link.href))}</span>` : '';
      const photo = (model === 'overlay' || model === 'split') && link.image ? ` data-photo-for="${escape(link.image)}"` : '';
      return `<li><a href="${escape(link.href)}"${photo}><span class="pym-link-label">${escape(link.label)}</span>${note}${count}</a></li>`;
    };
    const tileHtml = tile => `<li><a href="${escape(tile.href)}"><img src="${escape(tile.image)}" alt="" loading="lazy">${model === 'mega' ? `<span class="pym-tile-title">${escape(tile.title)}</span>` : `<span>${escape(tile.title)}</span>`}${tile.price ? `<span class="pym-price">${escape(tile.price)}</span>` : ''}</a></li>`;
    const heroPhoto = (model === 'overlay' || model === 'split') ? `<div class="pym-hero-photo"><img src="${escape((groups[0].tiles[0] || {}).image || '')}" alt="" loading="lazy"></div>` : '';
```

Use `linkHtml`/`tileHtml` in the group template, drop the tiles block for `index`, prepend `heroPhoto` to the panel. `resolveStoreMenuGroups` keeps `note: String(link.note || '').slice(0, 60)` and `image: storeMenuLinkPhoto(link.to)` on each link. Overlay: `pointerenter`/`focus` on `a[data-photo-for]` sets `.pym-hero-photo img` `src`. Overlay/split/drawer open in `panel` mode (scroll lock + focus trap already apply).

- [ ] **Step 4: Look CSS (`store-menu-models.css.js`)**

```js
  // One look per model (spec 2026-11-15 store menu models). Read after STORE_MENU_CSS; everything keyed on [data-model].
  const STORE_MENU_MODEL_CSS = `
    .pym-panel[data-model=mega]{padding:28px max(24px,calc((100% - 1280px)/2)) 36px}
    .pym-panel[data-model=mega] .pym-group{display:grid;grid-template-columns:minmax(180px,240px) repeat(3,minmax(0,1fr));gap:16px}
    .pym-panel[data-model=mega] .pym-links{grid-template-columns:1fr;font-size:12px;letter-spacing:.14em;text-transform:uppercase}
    .pym-panel[data-model=mega] .pym-tiles,.pym-panel[data-model=mega] .pym-tiles ul{display:contents}
    .pym-panel[data-model=mega] .pym-tiles a{position:relative;display:block;aspect-ratio:1}
    .pym-panel[data-model=mega] .pym-tiles img{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;object-fit:cover}
    .pym-panel[data-model=mega] .pym-tile-title{position:absolute;inset:auto 12px 14px;color:#fff;font-family:var(--store-heading-font,inherit);font-size:18px;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 2px 12px #0008}
    .pym-panel[data-model=overlay],.pym-panel[data-model=split]{position:fixed;inset:0;max-height:none;z-index:1000;border:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:40px;align-items:center;padding:clamp(24px,5vw,72px)}
    .pym-panel[data-model=overlay]{background:var(--store-accent,#111);color:var(--store-on-accent,#fff)}
    .pym-panel[data-model=overlay] .pym-links{grid-template-columns:1fr;gap:4px}
    .pym-panel[data-model=overlay] .pym-links a{font-family:var(--store-heading-font,inherit);font-size:clamp(36px,5vw,64px);line-height:1.05;opacity:.55;transition:opacity .2s}
    .pym-panel[data-model=overlay] .pym-links a:is(:hover,:focus-visible){opacity:1;text-decoration:none}
    .pym-hero-photo{border-radius:var(--kit-radius-panel,18px);overflow:hidden;aspect-ratio:4/5;max-height:70dvh}
    .pym-hero-photo img{width:100%;height:100%;object-fit:cover}
    .pym-panel[data-model=split]{padding:0;gap:0}.pym-panel[data-model=split] .pym-hero-photo{order:-1;height:100dvh;max-height:none;aspect-ratio:auto;border-radius:0}
    .pym-panel[data-model=split] .pym-group{padding:clamp(24px,5vw,64px)}
    .pym-panel[data-model=drawer]{position:fixed;inset:0 auto 0 0;width:min(440px,88vw);max-height:none;z-index:1000;padding:24px 28px;display:grid;grid-template-rows:auto 1fr auto;background:var(--store-foreground,#111);color:var(--store-background,#fff)}
    .pym-panel[data-model=drawer] .pym-links{grid-template-columns:1fr}.pym-panel[data-model=drawer] .pym-links a{font-family:var(--store-heading-font,inherit);font-size:28px;font-style:italic}
    .pym-panel[data-model=drawer] .pym-tiles ul{grid-template-columns:1fr 1fr}
    .pym-panel[data-model=dropdown]{left:auto;right:auto;width:min(560px,92vw);border-radius:0 0 16px 16px;box-shadow:0 22px 40px -22px #0006}
    .pym-panel[data-model=dropdown] .pym-group{grid-template-columns:minmax(0,1fr) 190px}.pym-panel[data-model=dropdown] .pym-tiles ul{grid-template-columns:1fr}
    .pym-panel[data-model=dropdown] .pym-tiles li:nth-child(n+2){display:none}
    .pym-panel[data-model=index] .pym-links{grid-template-columns:1fr;counter-reset:pymi}
    .pym-panel[data-model=index] .pym-links a{display:grid;grid-template-columns:48px minmax(0,1fr) minmax(0,1fr) 110px;align-items:baseline;border-bottom:1px solid color-mix(in srgb,currentColor 14%,transparent);padding:10px 0}
    .pym-panel[data-model=index] .pym-links a::before{counter-increment:pymi;content:counter(pymi,decimal-leading-zero);font-size:12px;opacity:.6}
    .pym-panel[data-model=index] .pym-link-label{font-family:var(--store-heading-font,inherit);font-size:22px}
    .pym-panel[data-model=index] .pym-count{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;opacity:.75}
    .pym-note{font-size:13px;opacity:.7}
    @media (max-width:860px){
      .pym-panel[data-model=mega] .pym-group{grid-template-columns:1fr}.pym-panel[data-model=mega] .pym-tiles ul{display:flex;overflow-x:auto;gap:8px}
      .pym-panel[data-model=mega] .pym-tiles a{flex:0 0 140px}
      .pym-panel[data-model=overlay],.pym-panel[data-model=split]{grid-template-columns:1fr;align-content:start;overflow:auto}
      .pym-panel[data-model=split] .pym-hero-photo{height:34dvh}
      .pym-panel[data-model=drawer]{width:100vw}
      .pym-panel[data-model=index] .pym-links a{grid-template-columns:minmax(0,1fr) auto}.pym-panel[data-model=index] .pym-links a::before,.pym-panel[data-model=index] .pym-note{display:none}
    }
    @media (prefers-reduced-motion:reduce){.pym-panel[data-model] *{transition:none!important;animation:none!important}}`;
```

`ensureStoreMenuStyle`: `style.textContent = STORE_MENU_CSS + STORE_MENU_MODEL_CSS;`.

- [ ] **Step 5: Build, test, measure**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && wc -c packages/storefront-kit/kit/commerce.js && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts`
Expected: PASS; note the size.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/commerce-src/header/ packages/storefront-kit/tools/build-commerce.mjs packages/storefront-kit/kit/commerce.js apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): menu looks mega, overlay, dropdown, drawer, split and index with their phone forms"
```

### Task 3: Selling models — bestsellers, need, offer, search, thumb (kit)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/header/store-menu.js`, `packages/storefront-kit/commerce-src/header/store-menu-models.css.js`
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Produces: `storeMenuBest(ids?)` (≤ 3 items, badged «Más vendido»/«Nuevo» first), `storeMenuOffer()` → `{kind:'shipping'|'code'|'pack', title, detail?, href}` or `null`, `storeMenuFrom(links)` → `'desde Bs N'|''`; markup `.pym-best` (+ `.pym-best-title`, `[data-add-to-cart]`), `.pym-need-from`, `.pym-offer[data-kind]`, `.pym-search input[type=search]`, `.pym-popular`, `.pym-thumbbar` (+ `[data-cart-count]`), CSS var `--pym-bottom-bar`.

- [ ] **Step 1: Write the failing tests**

```ts
it('bestsellers show three real products with price and Agregar; with no badge the title says Destacados', async () => {
  const w = await open({ menu: { model: 'bestsellers', groups: [{ label: 'Tienda', links: [{ to: 'category:C1' }] }] } });
  expect(w.document.querySelectorAll('.pym-best [data-add-to-cart]').length).toBe(3);
  expect(w.document.querySelector('.pym-best-title')!.textContent).toBe('Destacados');
});
it('offer shows only a real offer; with none the tile is the first best seller', async () => {
  const none = await open({ menu: { model: 'offer' } });
  expect(none.document.querySelector('.pym-offer')!.getAttribute('data-kind')).toBe('product');
  const real = await open({ menu: { model: 'offer' }, data: { ...DATA, freeShippingFrom: 250 } });
  expect(real.document.querySelector('.pym-offer')!.textContent).toMatch(/Envío gratis desde Bs 250/);
});
it('search opens on a search field with Populares chips, never «Lo más buscado»', async () => {
  const w = await open({ menu: { model: 'search' } });
  expect(w.document.querySelector('.pym-search input[type=search]')).not.toBeNull();
  expect(w.document.body.textContent).toMatch(/Populares/);
  expect(w.document.body.textContent).not.toMatch(/más buscado/i);
});
it('need groups show their live starting price', async () => {
  const w = await open({ menu: { model: 'need', groups: [{ label: 'Dormir mejor', note: 'Tés para la noche', links: [{ to: 'category:C1' }] }] } });
  expect(w.document.querySelector('.pym-need-from')!.textContent).toBe('desde Bs 10');
});
it('the thumb bar keeps the cart drawer and the contact button above it on a phone', async () => {
  const w = await open({ menu: { model: 'thumb' } });
  expect(w.document.querySelector('.pym-thumbbar [data-cart-count]')).not.toBeNull();
  expect(w.document.documentElement.style.getPropertyValue('--pym-bottom-bar')).toBe('64px');
});
```

(DATA's items cost `amount: 1000` cents → «Bs 10». Before writing Step 3, confirm the runtime's add attribute: `grep -n "data-add-to-cart\|data-add=" packages/storefront-kit/commerce-src -r | head`, and use the attribute the catalogue buttons already use.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts -t "bestsellers|offer|search|need|thumb"`
Expected: FAIL.

- [ ] **Step 3: Data helpers in `store-menu.js`**

```js
  const STORE_MENU_BADGES = /más vendido|nuevo/i;
  const badgeOf = item => String(item.highlight || item.badge || '');
  function storeMenuBest(ids) {
    const pool = products().filter(item => (!ids || ids.has(item.id)) && storeMenuPhoto((item.imageUrls || [])[0]));
    return [...pool.filter(item => STORE_MENU_BADGES.test(badgeOf(item))), ...pool.filter(item => !STORE_MENU_BADGES.test(badgeOf(item)))].slice(0, 3);
  }
  function storeMenuOffer() {
    if (Number(store.freeShippingFrom) > 0) return { kind: 'shipping', title: `Envío gratis desde ${money(Number(store.freeShippingFrom) * 100, 'BOB')}`, href: pageHref('productos.html') };
    if (store.popupCode) return { kind: 'code', title: `Código ${String(store.popupCode).slice(0, 20)}`, href: pageHref('productos.html') };
    const pack = (Array.isArray(store.bundles) ? store.bundles : []).find(b => b && b.saving > 0);
    if (pack) return { kind: 'pack', title: String(pack.name).slice(0, 40), detail: `Ahorras ${money(pack.saving, 'BOB')}`, href: pageHref('productos.html') };
    return null;
  }
  const storeMenuFrom = links => {
    const prices = links.flatMap(link => { const id = new URL(link.href, location.href).searchParams.get('f_categoria'); return id ? products().filter(item => filterFold(item.categoryId) === id).map(price) : []; });
    return prices.length ? `desde ${money(Math.min(...prices), 'BOB')}` : '';
  };
```

Markup:
- `bestsellers`: after the links, `<div class="pym-best"><p class="pym-best-title">${best.some(i => STORE_MENU_BADGES.test(badgeOf(i))) ? 'Lo más vendido' : 'Destacados'}</p><ul>${best.map(item => `<li><a href="${pageHref(config.productPage || 'product.html', '?id=' + encodeURIComponent(item.id))}"><img src="${escape(item.imageUrls[0])}" alt="" loading="lazy"><span>${escape(item.name)}</span><b>${money(price(item), item.currency || 'BOB')}</b></a><button type="button" class="pym-add" data-add-to-cart="${escape(item.id)}">Agregar</button></li>`).join('')}</ul></div>`.
- `need`: each group = card with round photo (`group.tiles[0]` or link photo), `label`, `note`, `<span class="pym-need-from">${storeMenuFrom(group.links)}</span>`.
- `offer`: panel starts with `<a class="pym-offer" data-kind="${offer ? offer.kind : 'product'}" href="…">` showing the offer or, when `null`, the first `storeMenuBest()` item; links `new` and `all` first in group 0 when the store has them.
- `search`: panel starts with `<form class="pym-search" action="buscar.html"><input type="search" name="q" placeholder="Busca productos" aria-label="Buscar"></form><p class="pym-tiles-title">Populares</p><div class="pym-popular">…</div>` (≤ 6 chips: category names, then product names), then `storeMenuBest()` rows; focus goes to the input on open.
- `thumb`: `<nav class="pym-thumbbar" aria-label="Accesos">` with Inicio (`index.html`), Categorías (opens the panel), Buscar (`buscar.html`), Bolsa (`[data-cart-open]` + `<span data-cart-count>`) appended to `document.body`; `document.documentElement.style.setProperty('--pym-bottom-bar', '64px')`.

- [ ] **Step 4: Selling CSS (append to `STORE_MENU_MODEL_CSS`)**

```css
    .pym-best ul{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;list-style:none;margin:0;padding:0}
    .pym-best li{display:grid;gap:6px}.pym-best img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--kit-radius,8px)}
    .pym-add{min-height:44px;border-radius:999px;border:0;background:var(--store-accent,#111);color:var(--store-on-accent,#fff);font:inherit;font-weight:600;cursor:pointer}
    .pym-panel[data-model=bestsellers] .pym-group{display:grid;grid-template-columns:170px 170px minmax(0,1fr);gap:28px}
    .pym-panel[data-model=need] .pym-group{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:center;padding:12px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:14px}
    .pym-need-from{font-size:12px;opacity:.75}
    .pym-offer{position:relative;display:grid;align-content:end;min-height:200px;padding:18px;border-radius:14px;overflow:hidden;color:#fff;text-decoration:none;isolation:isolate}
    .pym-offer img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;filter:brightness(.7)}
    .pym-search input{width:100%;height:52px;border:2px solid currentColor;border-radius:999px;padding:0 20px;font:inherit;font-size:16px;background:transparent;color:inherit}
    .pym-popular{display:flex;flex-wrap:wrap;gap:8px}.pym-popular a{padding:8px 14px;border-radius:999px;background:color-mix(in srgb,currentColor 8%,transparent);font-size:13px;color:inherit;text-decoration:none}
    .pym-thumbbar{display:none}
    @media (max-width:860px){
      .pym-thumbbar{position:fixed;left:0;right:0;bottom:0;z-index:900;display:grid;grid-template-columns:repeat(4,1fr);height:64px;padding-bottom:env(safe-area-inset-bottom,0px);background:var(--store-background,#fff);border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)}
      .pym-thumbbar a,.pym-thumbbar button{display:grid;place-items:center;gap:2px;min-height:44px;border:0;background:none;color:inherit;font:inherit;font-size:11px}
      body{padding-bottom:var(--pym-bottom-bar,0px)}
      [data-pagosya-contact],.pagosya-whatsapp{bottom:calc(var(--pym-bottom-bar,0px) + 16px)!important}
      .pym-panel[data-model=bestsellers] .pym-group{grid-template-columns:1fr}.pym-best ul{display:flex;overflow-x:auto}.pym-best li{flex:0 0 140px}
    }
```

(The cart drawer is a full-height panel above `z-index:900`, so it covers the bar while open; the rule above lifts the floating contact/WhatsApp buttons.)

- [ ] **Step 5: Build, test, measure**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && wc -c packages/storefront-kit/kit/commerce.js && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts`
Expected: PASS.

- [ ] **Step 6: Only if the runtime passed 1,100,000 bytes — model CSS on demand**

Keep `STORE_MENU_CSS` inline; move `STORE_MENU_MODEL_CSS` to `packages/storefront-kit/kit/store-menu-models.css`, add `'store-menu-models.css'` to `RUNTIME_PATHS` in `apps/api/src/storefront-source/source-runtime.ts:17`, and have `ensureStoreMenuStyle` add `<link rel="stylesheet" href="store-menu-models.css">`. Re-run the spec.

- [ ] **Step 7: Commit**

```bash
git add packages/storefront-kit/ apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): selling menus — best sellers with Agregar, shop by need, real offer tile, search first, phone thumb bar"
```

### Task 4: Always-visible models — circles, rail (kit)

**Files:**
- Modify: `packages/storefront-kit/commerce-src/header/store-menu.js`, `packages/storefront-kit/commerce-src/header/store-menu-models.css.js`
- Test: `apps/api/src/storefront-source/source-commerce-store-menu.spec.ts`

**Interfaces:**
- Produces: `.pym-circles` row inserted after the host header (never on the checkout page); `.pym-rail` aside (≥ 1280 px), with the panel rendered as `drawer` for narrower screens.

- [ ] **Step 1: Write the failing tests**

```ts
it('circles put one round photo per category under the header and never on checkout', async () => {
  const w = await open({ menu: { model: 'circles' } });
  expect(w.document.querySelectorAll('header + .pym-circles a img').length).toBe(4);
  const checkout = await open({ menu: { model: 'circles' }, extra: { checkoutPage: true } });
  expect(checkout.document.querySelector('.pym-circles')).toBeNull();
});
it('rail is a left column on wide screens and a drawer below 1280 px', async () => {
  const w = await open({ menu: { model: 'rail' } });
  expect(w.document.querySelector('.pym-rail')).not.toBeNull();
  expect(w.document.querySelector('.pym-panel')!.getAttribute('data-model')).toBe('drawer');
});
```

(If the spec's `open` helper has no `extra.checkoutPage` branch, add one that sets `window.PAGOSYA_PREVIEW_PAGE = 'checkout.html'` before the runtime loads.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts -t "circles|rail"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `renderStoreMenu` after the panel: for `circles` (skip when `fullCheckoutPage`), build `<nav class="pym-circles" aria-label="Categorías">` from `storeMenuCategories()` with `storeMenuLinkPhoto('category:' + id)` (skip categories without a photo) and `host.after(row)`. For `rail`: set the panel's `data-model` to `drawer`, and `document.body.prepend(aside)` where `aside = <aside class="pym-rail">` holds a clone of `[data-nav-logo]`, group 0's links and the info pages. CSS:

```css
    .pym-circles{display:flex;justify-content:center;gap:26px;padding:10px 24px 22px;overflow-x:auto}
    .pym-circles a{display:grid;justify-items:center;gap:8px;color:inherit;text-decoration:none;font-size:14px}
    .pym-circles img{width:88px;height:88px;border-radius:50%;object-fit:cover;outline:2px solid transparent;outline-offset:4px}
    .pym-circles a:is(:hover,:focus-visible) img{outline-color:var(--store-accent,currentColor)}
    .pym-rail{display:none}
    @media (min-width:1280px){
      .pym-rail{position:fixed;inset:0 auto 0 0;width:200px;display:grid;grid-template-rows:auto 1fr auto;gap:24px;padding:24px 22px;border-right:1px solid color-mix(in srgb,currentColor 12%,transparent);background:var(--store-background,#fff);z-index:40}
      body:has(.pym-rail){padding-left:200px}
      [data-store-menu-model=rail] [data-pagosya-store-menu="toggle"]{display:none}
    }
    @media (max-width:860px){.pym-circles{justify-content:flex-start;gap:14px}.pym-circles img{width:64px;height:64px}}
```

- [ ] **Step 4: Build, test, measure**

Run: `node packages/storefront-kit/tools/build-commerce.mjs && wc -c packages/storefront-kit/kit/commerce.js && cd apps/api && npx jest src/storefront-source/source-commerce-store-menu.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-kit/ apps/api/src/storefront-source/source-commerce-store-menu.spec.ts
git commit -m "feat(kit): always-visible menus — category circles under the header and a left rail on wide screens"
```

### Task 5: V2 picks and writes the menu

**Files:**
- Create: `apps/api/src/storefront-source/v2/v2-menus.ts`
- Modify: `apps/api/src/storefront-source/v2/v2-context.ts` (`menusAllowed?: string[]` on `V2Context`), `apps/api/src/storefront-source/v2/v2-prompts.ts`, `apps/api/src/storefront-source/v2/v2-prototype.service.ts`
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Produces: `V2Menu`, `V2_MENU_MODELS`, `allowedMenus(used)`, `v2MenuSchema(allowed)`, `menuProblems(menu, context)`, `withStoreMenu(files, menu)` (signatures in the code below).
- Consumes: Tasks 1–4 runtime fields (`model`, `note`, `tiles`).

- [ ] **Step 1: Write the failing tests**

```ts
describe('v2 menus', () => {
  it('checks the selling rules: 7 top links, plain names, real photos once', () => {
    const photos = [{ path: 'assets/a.jpg', width: 800, height: 800, shape: 'square' as const }];
    const ok = { model: 'mega', groups: [{ label: 'Tienda', links: [{ to: 'all' }], tiles: [{ to: 'all', image: 'assets/a.jpg' }] }] };
    expect(menuProblems(ok, { photos })).toEqual([]);
    const bad = { model: 'mega', groups: Array.from({ length: 8 }, (_, i) => ({ label: i ? `Grupo ${i}` : 'Una categoría con un nombre demasiado largo', links: [{ to: 'all' }], tiles: [{ to: 'all', image: 'assets/zz.jpg' }] })) };
    const lines = menuProblems(bad, { photos }).join(' | ');
    expect(lines).toMatch(/como mucho 7/); expect(lines).toMatch(/28 letras/); expect(lines).toMatch(/assets\/zz\.jpg/);
  });
  it('writes the chosen menu into config.js and keeps the rest of the config', () => {
    const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"ob","header":{"x":1},"data":{"name":"Oh Belly"}};' }];
    const out = withStoreMenu(files, { model: 'overlay', groups: [{ label: 'Sabores', links: [{ to: 'all' }] }] });
    expect(readConfigData(out)).toMatchObject({ header: { x: 1, menu: { model: 'overlay', groups: [{ label: 'Sabores' }] } }, data: { name: 'Oh Belly' } });
  });
  it('limits the direction to unused models, all of them when every one is used', () => {
    expect((v2MenuSchema(['overlay', 'drawer']) as any).properties.model.enum).toEqual(['overlay', 'drawer']);
    expect(allowedMenus(V2_MENU_MODELS.map(m => m.id))).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "v2 menus"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `v2-menus.ts`**

```ts
import { readConfigData, type V2Context } from './v2-context';

export type V2Menu = { model: string; groups: Array<{ label: string; note?: string; links: Array<{ to: string; note?: string }>; tiles?: Array<{ to: string; image: string }> }> };

/** The 16 kit menu models (spec 2026-11-15 store menu models), one line each on the stores they suit. */
export const V2_MENU_MODELS: readonly { id: string; fits: string }[] = [
  { id: 'tabs', fits: 'pestañas por grupo con fotos; tiendas con muchas categorías' },
  { id: 'mega', fits: 'enlaces + 3 fotos con el título encima; moda, artesanía, historias' },
  { id: 'overlay', fits: 'pantalla entera del color de la marca, letras enormes, la foto cambia; marcas divertidas con pocas páginas' },
  { id: 'dropdown', fits: 'panel chico bajo su enlace con una foto; catálogos cortos (café, panadería, helado)' },
  { id: 'drawer', fits: 'panel lateral oscuro con dos fotos; tiendas tranquilas y editoriales' },
  { id: 'split', fits: 'mitad foto grande de la tienda, mitad enlaces; muebles, hogar, restaurantes' },
  { id: 'index', fits: 'lista numerada con cuántos productos tiene cada categoría; libros, discos, papelería' },
  { id: 'dock', fits: 'barra flotante abajo con fotos; marcas deportivas o tipo app' },
  { id: 'stickers', fits: 'cada sección un sticker inclinado; dulces, juguetes, niños' },
  { id: 'circles', fits: 'fotos redondas por categoría bajo el logo; flores, tortas, mascotas, cosmética' },
  { id: 'rail', fits: 'menú siempre abierto a la izquierda en pantallas anchas; joyería, arte, cerámica' },
  { id: 'bestsellers', fits: 'los 3 más vendidos con precio y Agregar dentro del menú; ropa, deporte' },
  { id: 'need', fits: 'grupos por lo que el cliente busca («Dormir mejor») con precio desde; bienestar, tés, suplementos' },
  { id: 'offer', fits: 'la oferta real de la tienda como foto en el menú; cosmética, regalos' },
  { id: 'search', fits: 'abre en un buscador grande con populares; tiendas con muchos productos' },
  { id: 'thumb', fits: 'cuatro botones fijos abajo en el celular; ropa y tiendas que se compran desde el teléfono' },
];

export const allowedMenus = (used: readonly string[]): string[] => {
  const all = V2_MENU_MODELS.map(m => m.id);
  const free = all.filter(id => !used.includes(id));
  return free.length ? free : all;
};

export function v2MenuSchema(allowed: readonly string[]): object {
  const link = { type: 'object', additionalProperties: false, required: ['to', 'note'], properties: { to: { type: 'string' }, note: { type: 'string' } } };
  const tile = { type: 'object', additionalProperties: false, required: ['to', 'image'], properties: { to: { type: 'string' }, image: { type: 'string' } } };
  return { type: 'object', additionalProperties: false, required: ['model', 'groups'], properties: {
    model: { type: 'string', enum: [...allowed] },
    groups: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', additionalProperties: false, required: ['label', 'note', 'links', 'tiles'],
      properties: { label: { type: 'string' }, note: { type: 'string' }, links: { type: 'array', minItems: 1, maxItems: 8, items: link }, tiles: { type: 'array', maxItems: 3, items: tile } } } } } };
}

export function menuProblems(menu: V2Menu, context: Pick<V2Context, 'photos'>): string[] {
  const out: string[] = [];
  if (menu.groups.length > 7) out.push(`El menú tiene ${menu.groups.length} grupos arriba: deja como mucho 7 enlaces arriba y pon el resto dentro de los grupos.`);
  for (const group of menu.groups) if (group.label.length > 28) out.push(`El grupo «${group.label.slice(0, 40)}» pasa de 28 letras: usa un nombre corto y claro.`);
  const known = new Set(context.photos.map(p => p.path)), seen = new Set<string>();
  for (const tile of menu.groups.flatMap(g => g.tiles ?? [])) {
    if (!known.has(tile.image)) out.push(`La foto ${tile.image} del menú no es de la tienda: usa solo las rutas de las fotos que te dan.`);
    else if (seen.has(tile.image)) out.push(`La foto ${tile.image} sale dos veces en el menú: cada foto una sola vez.`);
    seen.add(tile.image);
  }
  if (menu.groups.some(g => g.links.some(l => l.to.split('/').length > 2))) out.push('El menú tiene más de dos niveles: grupo → enlace, nada más.');
  return [...new Set(out)];
}

export function withStoreMenu<T extends { path: string; content: string }>(files: T[], menu: V2Menu): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = readConfigData([file as never]);
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, header: { ...(config.header ?? {}), menu: { model: menu.model, groups: menu.groups } } })};` };
  });
}
```

- [ ] **Step 4: Wire it in**

- `v2DirectionSchema(context)`: add `'menu'` to `required`; `menu: v2MenuSchema(context.menusAllowed ?? V2_MENU_MODELS.map(m => m.id))`.
- `v2DirectionInput`: append

```ts
`MENÚ: elige UNO de estos modelos, el que mejor venda en ESTA tienda: ${V2_MENU_MODELS.filter(m => (context.menusAllowed ?? V2_MENU_MODELS.map(x => x.id)).includes(m.id)).map(m => `${m.id}: ${m.fits}`).join(' · ')}.
Grupos con nombres cortos y claros (máx. 28 letras), como mucho 7 arriba; enlaces con to: all, new, category:<id>, collection:<slug>, page:about|contact|shipping|faq, section:<id>; fotos solo de la tienda, cada una una vez. Tu CSS puede vestir .pym-panel[data-model=…] y sus partes .pym-*.`
```

- `v2ContractProblems(files, context, direction?)`: when `direction?.menu`, append `...menuProblems(direction.menu, context)`; `loopChecks` passes `state.direction`.
- Service, where the build input files are assembled: `files = withStoreMenu(files, mapMenuPhotos(direction.menu, files))`, with private `mapMenuPhotos(menu, files)` replacing each `tile.image` (`assets/x.jpg`) by the upload URL in `config.js` data that ends in the same file name (`items[].imageUrls`, `storePhotos`/`heroImages`), dropping tiles it cannot map.

- [ ] **Step 5: Run the spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts`
Expected: PASS (existing tests too).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/v2/
git commit -m "feat(yapi): V2 picks a menu model and its groups per store and writes it into config.js; selling rules in the contract"
```

### Task 6: Hero briefs, never repeated across the merchant's stores

**Files:**
- Create: `apps/api/src/storefront-source/v2/v2-heroes.ts`
- Modify: `apps/api/src/storefront-source/v2/v2-context.ts` (`heroesAllowed?: string[]`, `heroIdea?: string`), `apps/api/src/storefront-source/v2/v2-prompts.ts`, `apps/api/src/storefront-source/v2/v2-prototype.service.ts`
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Produces: `V2HeroIdea`, `V2_HERO_IDEAS` (8), `allowedHeroIdeas(used, context)`, `heroMarker(id)`, `readHeroMarker(home)`; service-private `merchantHistory(merchantId, storeId): Promise<{ heroes: string[]; menus: string[] }>`.
- Consumes: `V2Context.cutouts`, `allowedMenus` (Task 5), `referencesDir()`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('v2 hero briefs', () => {
  it('offers the ideas this merchant has not used, filtered by what the store can show', () => {
    const ctx = { cutouts: [{ path: 'assets/image-aaaaaaaaaaaa.webp' }], products: [] } as any;
    const allowed = allowedHeroIdeas(['laps', 'zippa'], ctx);
    expect(allowed).not.toContain('laps'); expect(allowed).not.toContain('zippa'); expect(allowed).toContain('lift');
    expect(allowedHeroIdeas(V2_HERO_IDEAS.map(h => h.id), ctx).length).toBeGreaterThan(0);
    expect(allowedHeroIdeas([], { cutouts: [], products: [] } as any)).not.toContain('laps');   // Laps needs a cut-out
    expect(V2_HERO_IDEAS.map(h => h.id)).not.toContain('atelier');                                // cut by the owner 2026-11-15
  });
  it('marks and reads the hero idea on the saved home', () => {
    expect(readHeroMarker(`${heroMarker('hearthen')}\nexport default function Home(){}`)).toBe('hearthen');
    expect(readHeroMarker('export default function Home(){}')).toBeNull();
  });
  it('every idea has a Spanish brief and real reference frames on disk', () => {
    for (const idea of V2_HERO_IDEAS) {
      expect(idea.brief.length).toBeGreaterThan(200);
      for (const frame of idea.frames) expect(existsSync(join(__dirname, '../../../../../examples/v2-proto/references/_heroes', frame))).toBe(true);
    }
  });
});
```

(Import `existsSync` from `node:fs` and `join` from `node:path` at the top of the spec if not present.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "hero briefs"`
Expected: FAIL.

- [ ] **Step 3: Implement `v2-heroes.ts`**

```ts
import type { V2Context } from './v2-context';

export type V2HeroIdea = { id: 'laps' | 'lift' | 'hearthen' | 'zahra' | 'zippa' | 'buyfirst' | 'halflife' | 'specsheet'; name: string; needs: 'cutout' | 'person' | 'atmosphere' | 'action' | 'any'; brief: string; frames: string[] };

/** The 8 hero ideas the owner kept (2026-11-15, from amboras.com; Atelier's clothing rail cut — it needs matching front/back/side
 *  cut-outs). A brief is a starting point: the writer designs it in the store's own style; motion always has a still final state. */
export const V2_HERO_IDEAS: readonly V2HeroIdea[] = [
  { id: 'laps', name: 'Producto que cruza una palabra gigante', needs: 'cutout', frames: ['laps-1.jpg', 'laps-3.jpg'],
    brief: 'Escena a todo el ancho (foto de la tienda o el color de la marca) con UNA palabra gigante de la marca detrás; el recorte del producto la cruza, con parte de las letras por delante (una copia de la palabra recortada encima). Abajo a la izquierda el nombre del producto grande; abajo a la derecha el precio real y un botón «Comprar». Puntos o rayas para pasar al siguiente producto si hay más de uno con recorte. Movimiento: el producto flota despacio (4–5 s, sube 10–14 px y gira 2–3°).' },
  { id: 'lift', name: 'Producto entre dos palabras', needs: 'cutout', frames: ['lift-1.jpg', 'lift-3.jpg'],
    brief: 'Fondo del color oscuro o fuerte de la marca; el recorte del producto flota entre dos palabras gigantes, una arriba y otra abajo; pedacitos de sus ingredientes reales (formas simples en sus colores) flotan alrededor; abajo al centro 2–3 datos reales en pastillas; «01 / 03» a la izquierda si hay varios sabores; a la derecha un botón «Agregar · precio». Movimiento: el producto sube y baja; los ingredientes derivan lento.' },
  { id: 'hearthen', name: 'Foto cálida y sello que gira', needs: 'atmosphere', frames: ['hearthen-1.jpg', 'hearthen-3.jpg'],
    brief: 'Foto de ambiente oscura y cálida a todo el ancho (nunca recortar sus letras); a la izquierda un titular fino en serif de dos líneas, una línea corta y un botón con borde. Junto al producto un sello redondo de texto (lo que la marca promete, real) que gira despacio (18 s por vuelta). Luz suave que respira detrás del producto.' },
  { id: 'zahra', name: 'Persona delante de letras gigantes', needs: 'person', frames: ['zahra-1.jpg', 'zahra-3.jpg'],
    brief: 'Foto de una persona usando el producto (también la prenda puesta), delante del nombre de la marca en letras gigantes (la persona tapa parte de las letras); 3 etiquetas pequeñas apuntan a beneficios REALES; arriba a la izquierda las reseñas reales si las hay; a la derecha una promesa corta, un botón y una mini tarjeta del producto con precio y «+». Movimiento: las etiquetas aparecen una tras otra.' },
  { id: 'zippa', name: 'Foto de acción y cinta de beneficios', needs: 'action', frames: ['zippa-1.jpg', 'zippa-3.jpg'],
    brief: 'Foto de acción a todo el ancho (servir, salpicar, usar); titular centrado y fuerte con de dónde viene; una línea con los datos reales; un botón. Abajo una cinta que corre con los beneficios reales separados por iconos pequeños. Movimiento: la cinta corre siempre; la foto hace un acercamiento muy lento.' },
  { id: 'buyfirst', name: 'Compra primero', needs: 'any', frames: ['examples/harvest-and-root.webp', 'examples/howl-honey.webp'],
    brief: 'La primera pantalla ya vende el producto estrella: a la izquierda titular claro, estrellas y reseñas solo si son reales, precio, opciones reales (una vez / suscripción solo si la tienda tiene suscripción) y «Agregar»; a la derecha una foto grande del producto en manos o en uso que llega al borde. Movimiento: la foto se acerca muy lento.' },
  { id: 'halflife', name: 'Mitad en uso', needs: 'any', frames: ['examples/haus-auston.webp', 'examples/field-and-north.webp'],
    brief: 'Mitad tranquila: el nombre del producto grande en serif fina, precio, una línea, tres datos reales con iconos pequeños, cantidad y «Agregar»; la otra mitad, a toda la altura, la foto del producto en uso (muñeca, cuerpo, mesa). Nunca recortar letras de la foto. Para ropa: la prenda puesta.' },
  { id: 'specsheet', name: 'Ficha técnica', needs: 'cutout', frames: ['examples/tideform.webp', 'examples/mill-motion.webp'],
    brief: 'Fondo claro; el recorte del producto grande a la izquierda; a la derecha un nombre técnico, una fila con 4–5 datos reales (medidas, peso, capacidad…), muestras de color reales y «Agregar · precio». Para equipos, herramientas, electrodomésticos. Movimiento: el producto flota apenas.' },
];

export function allowedHeroIdeas(used: readonly string[], context: Pick<V2Context, 'cutouts' | 'products'>): string[] {
  const fit = V2_HERO_IDEAS.filter(idea => idea.needs !== 'cutout' || (context.cutouts ?? []).length > 0);
  const fresh = fit.filter(idea => !used.includes(idea.id));
  return (fresh.length ? fresh : fit).map(idea => idea.id);
}
export const heroMarker = (id: string) => `// @pagosya-hero ${id}`;
export function readHeroMarker(home: string): string | null {
  return home.match(/^\/\/ @pagosya-hero ([a-z]+)\s*$/m)?.[1] ?? null;
}
```

(Only `cutout` is a hard filter; `person`, `atmosphere`, `action` are judged by the direction model from the photos it sees: «elige la idea solo si la tienda tiene esa foto».)

- [ ] **Step 4: Wire it in**

- `v2DirectionSchema`: in `hero.properties` add `idea: { type: 'string', enum: context.heroesAllowed ?? V2_HERO_IDEAS.map(h => h.id) }`, add `'idea'` to `hero.required`.
- `v2DirectionInput`: append `PORTADA: elige UNA idea de esta lista, la que la tienda puede mostrar con sus fotos de verdad (nunca otra): ${V2_HERO_IDEAS.filter(h => (context.heroesAllowed ?? []).includes(h.id)).map(h => `${h.id} — ${h.name}`).join(' · ')}.`
- `v2HalfInput(context, direction, 'a', …)`: prepend `IDEA DE PORTADA «${idea.name}»: ${idea.brief} Diséñala con el estilo de esta tienda (su letra, sus colores, su voz); de las referencias aprende la composición, nunca sus colores ni textos.` (`idea = V2_HERO_IDEAS.find(h => h.id === direction.hero.idea)`). In the service's half `a` call, right after that text, attach the idea's frames read from `join(referencesDir(), '_heroes', frame)` as `{ type: 'input_image', image_url: data URL, detail: 'low' }` (same reading code as `motionShots`, lines 236–237; `.webp` frames get `data:image/webp;base64,`).
- Service `run()`, before the direction call: `const history = await this.merchantHistory(merchantId, storeId); context.heroesAllowed = allowedHeroIdeas(history.heroes, context); context.menusAllowed = allowedMenus(history.menus);`. `merchantHistory`: `prisma.store.findMany({ where: { merchantId, id: { not: storeId } }, select: { id: true } })`; per store the latest `storeSourceVersion` with `label: { startsWith: V2_LABEL }`; read `readHeroMarker(home.tsx)` and `readConfigData(files).header?.menu?.model`; return both lists (deduplicated, nulls dropped).
- After the direction: `context.heroIdea = direction.hero.idea`. In `v2Repairs`, for `components/home.tsx`, when `header.heroIdea` is set and `readHeroMarker(content) !== heroIdea`, put `heroMarker(heroIdea)` as the first line (replacing any other marker) — so every round's home carries it.

- [ ] **Step 5: Run the spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/v2/
git commit -m "feat(yapi): eight hero briefs from amboras.com — the direction picks one this merchant has not used, the hero writer sees its brief and real frames"
```

### Task 7: Photos with words are never cropped

**Files:**
- Create: `apps/api/src/storefront-source/v2/v2-words.ts`
- Modify: `apps/api/src/storefront-source/v2/v2-context.ts` (`V2Photo.words?: boolean`), `apps/api/src/storefront-source/v2/v2-prototype.service.ts`, `apps/api/src/storefront-source/v2/v2-prompts.ts`, `apps/api/src/storefront-source/source-template-qa-rules.ts`, `apps/api/src/storefront-source/v2/v2-run.ts`
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Produces: `cropShare(natural, box, fit): number`, `markWordPhotos(content, words): string`, `wordsLookPrompt`, `wordsLookSchema(count)`, rule id `cropped-words`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('v2 photos with words', () => {
  it('measures how much of a photo a box cuts; contain never cuts', () => {
    expect(cropShare({ w: 800, h: 1000 }, { w: 400, h: 500 }, 'cover')).toBe(0);
    expect(cropShare({ w: 800, h: 1000 }, { w: 500, h: 400 }, 'contain')).toBe(0);
    expect(cropShare({ w: 800, h: 1000 }, { w: 500, h: 400 }, 'cover')).toBeCloseTo(0.488, 2);
  });
  it('marks the images that show a photo with words', () => {
    expect(markWordPhotos('<img src="assets/a.jpg" alt="x" /><img src="assets/b.jpg" alt="y" />', new Set(['assets/a.jpg'])))
      .toBe('<img src="assets/a.jpg" data-pagosya-words alt="x" /><img src="assets/b.jpg" alt="y" />');
  });
  it('a cropped photo with words blocks a free-mode build', () => {
    expect(FREE_BLOCKERS.has('cropped-words')).toBe(true);
  });
});
```

(Export `FREE_BLOCKERS` from `v2-run.ts` if it is not exported yet.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "photos with words"`
Expected: FAIL.

- [ ] **Step 3: Implement `v2-words.ts`**

```ts
/** Owner 2026-11-15 (DooBoo r10: «meet DooBoo» cut at the top of the hero): a photo that carries words, a logo or packaging text is
 *  shown whole. cropShare is the share of the photo a box hides with object-fit: cover (0 for contain or a matching shape). */
export function cropShare(natural: { w: number; h: number }, box: { w: number; h: number }, fit: string): number {
  if (fit !== 'cover' || !natural.w || !natural.h || !box.w || !box.h) return 0;
  const scale = Math.max(box.w / natural.w, box.h / natural.h);
  const shown = (box.w * box.h) / (natural.w * scale * natural.h * scale);
  return Math.round((1 - shown) * 1000) / 1000;
}
export function markWordPhotos(content: string, words: ReadonlySet<string>): string {
  return content.replace(/<img\b([^>]*?)\bsrc=(["'])([^"']+)\2/g, (whole, before: string, quote: string, src: string) =>
    words.has(src) && !/data-pagosya-words/.test(whole) ? `<img${before}src=${quote}${src}${quote} data-pagosya-words` : whole);
}
export const wordsLookPrompt = 'Mira cada foto, en orden, y di si tiene letras, un logo o texto de un empaque que se lea. Solo sí o no por foto.';
export function wordsLookSchema(count: number): object {
  return { type: 'object', additionalProperties: false, required: ['words'], properties: { words: { type: 'array', minItems: count, maxItems: count, items: { type: 'boolean' } } } };
}
```

Rule in `source-template-qa-rules.ts` (inside `evaluateTemplateRules`, after `huge-photo`; the arithmetic repeats `cropShare` because rules run inside the page):

```ts
  const croppedWords = Array.from(document.querySelectorAll('main img[data-pagosya-words]')).map(el => {
    const img = el as HTMLImageElement, r = img.getBoundingClientRect(), fit = getComputedStyle(img).objectFit;
    const scale = Math.max(r.width / (img.naturalWidth || 1), r.height / (img.naturalHeight || 1));
    const share = fit === 'cover' && img.naturalWidth && img.naturalHeight ? 1 - (r.width * r.height) / (img.naturalWidth * scale * img.naturalHeight * scale) : 0;
    return { img, share };
  }).filter(({ share }) => share > 0.06);
  if (croppedWords.length) push('cropped-words', croppedWords[0].img, `BLOQUEA: Una foto con letras quedó cortada (${(croppedWords[0].img.getAttribute('src') || '').split('/').pop()}): muéstrala entera — en su propio formato (aspect-ratio de la foto) o con objectFit: 'contain' sobre un fondo de la paleta.`);
```

- [ ] **Step 4: Wire it in**

- `V2Photo.words?: boolean`.
- Service: after `markProductPhotos`, `await this.markWordPhotos(storeId, model, context, files, state)`: one call with all store photos at `detail: 'low'` (`wordsLookPrompt`, `wordsLookSchema(n)`), cached per photo content hash in `join(cutoutsDir(), `${hash}.words.json`)` (`{ words: boolean }`), sets `photo.words`. `YAPI_V2_WORDS=0` skips. A failed call leaves `words` unset (no blocking).
- `v2DirectionInput` and `v2WriterInput`/`v2HalfInput` photo lines: append ` (tiene letras: muéstrala ENTERA, nunca recortada)` when `photo.words`.
- `v2Repairs`: for `.tsx` files, `content = markWordPhotos(content, new Set((header?.photos ?? []).filter(p => p.words).map(p => p.path)))`.
- `v2-run.ts`: add `'cropped-words'` to `FREE_BLOCKERS`.

- [ ] **Step 5: Run the spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/v2/ apps/api/src/storefront-source/source-template-qa-rules.ts
git commit -m "feat(yapi): photos with words are found once, shown whole, and a build that crops one is sent back"
```

### Task 8: The hero rule stops prescribing a layout

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts:281`
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:** rule id `weak-hero` unchanged (still in `FREE_ADVICE_BLOCKERS`); only its line changes.

- [ ] **Step 1: Write the failing test**

```ts
it('the hero rule names what is wrong, never which layout to use (owner 2026-11-15: every hero became a split)', () => {
  const src = readFileSync(join(__dirname, '../source-template-qa-rules.ts'), 'utf8');
  const at = src.indexOf("push('weak-hero'");
  const line = src.slice(at, at + 420);
  expect(line).not.toMatch(/titular grande a un lado y una foto/);
  expect(line).toMatch(/idea de portada/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "hero rule"`
Expected: FAIL.

- [ ] **Step 3: Change the line**

```ts
    if (weak.length) push('weak-hero', hero ?? null, `CONSEJO: La portada no se arma bien (${weak.join('; ')}). Arréglalo dentro de la idea de portada de esta tienda, sin cambiar de idea: el titular entero y legible en la primera pantalla, la foto o el producto entero, uno o dos botones, nada más compitiendo.`);
```

- [ ] **Step 4: Run the spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/v2/v2.spec.ts
git commit -m "fix(yapi): the hero rule asks to fix the store's hero idea instead of pushing every store into a split"
```

### Task 9: Game and popup settings reach V2 stores

**Files:**
- Modify: `apps/api/src/storefront-source/v2/v2-context.ts` (`withStoreSettings`), `apps/api/src/storefront-source/v2/v2-prototype.service.ts` (`withSettings`)
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Consumes: `publicRetentionSettings(row)` — find it with `git grep -n "export function publicRetentionSettings" apps/api/src` and import from there.
- Produces: `withStoreSettings(files, { contactFormEnabled: boolean; retention?: Record<string, unknown> | null })`.

- [ ] **Step 1: Write the failing test**

```ts
it("the store's current game and popup settings win over an old config.js copy", () => {
  const stale = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"contactFormEnabled":true,"retention":null}};' }];
  const out = withStoreSettings(stale, { contactFormEnabled: true, retention: { popupGame: 'scratch', popupGameSlices: [{ label: '10%' }] } });
  expect(readConfigData(out).data.retention).toEqual({ popupGame: 'scratch', popupGameSlices: [{ label: '10%' }] });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "game and popup"`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
export function withStoreSettings<T extends SourceProjectFileDto>(files: readonly T[], settings: { contactFormEnabled: boolean; retention?: Record<string, unknown> | null }): T[] {
  return files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = readConfigData([file]);
    if (!config.data) return file;
    const data = { ...config.data, contactFormEnabled: settings.contactFormEnabled, ...(settings.retention !== undefined ? { retention: settings.retention } : {}) };
    if (JSON.stringify(data) === JSON.stringify(config.data)) return file;
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ ...config, data })};` };
  });
}
```

Service `withSettings`: also `const row = await this.prisma.storeRetention?.findUnique({ where: { storeId } })` and pass `retention: row ? publicRetentionSettings(row) : null`.

- [ ] **Step 4: Run the spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts`
Expected: PASS (the 2026-11-15 contact-form test still passes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/
git commit -m "fix(yapi): V2 builds carry the store's current game and popup settings, so Rasca y elige shows on V2 stores"
```

### Task 10: Live check on four stores

**Files:**
- Create: scratchpad driver `live-heroes-menus.cjs` (not committed)
- Output: `examples/v2-proto/final/2026-11-16-heroes-menus/` (screenshots + `scorecard.md`)

- [ ] **Step 1: Confirm the API runs the new code and nothing is running**

Run: `ps -o lstart= -p $(lsof -t -iTCP:3001 -sTCP:LISTEN)`; `grep -c "allowedHeroIdeas\|withStoreMenu" apps/api/dist/src/storefront-source/v2/*.js | grep -v ":0"`; `grep -c "cropped-words" apps/api/dist/src/storefront-source/source-template-qa-rules.js`; GET `…/v2-prototype` on each store → not RUNNING.
Expected: start time after the last save; non-zero counts.

- [ ] **Step 2: Rebuild four stores, one after another**

DooBoo (`cmwaz4b5a0001o46dgkv9iew6`), Oh Belly (`cmwfujvxm0001313fycy76zjp`), and two fresh stores built from `~/Downloads` photo folders the merchant has no V2 store for (e.g. `catalogo_bakery_pagosya`, `boxy`), each with `POST …/v2-prototype`. The owner runs the scratchpad `session.cjs` for a token.
Expected: four DONE runs.

- [ ] **Step 3: Check each store**

- Hero idea (`// @pagosya-hero` in `home.tsx`) differs across the four; menu model (`config.js` `header.menu.model`) differs across the four.
- Screenshots: first screen at 1440×900 and 390×844, and the menu open on both.
- No `cropped-words`/`weak-hero` lines left in the last attempt.
- Keyboard: on one store, Tab to ☰, Enter opens, Escape closes and focus returns.

- [ ] **Step 4: Scorecard and report**

`scorecard.md` (store, hero idea, menu model, minutes, $, problems left) + a comparison artifact with the screenshots for the owner.

---

## Self-review notes

- Menus spec: model field T1; 16 models T2–T4; honest selling data T3; contract rules 1/2/5/6 T5, runtime rules 3/4/7/8 T2–T3; merchant edits keep the model (config field) T1; writer told `.pym-*` T5; runtime size T2–T4; rail/dock risks T3/T4; retention T9. The spec's «look shots of the open menu» is covered by T10's manual screenshots instead of the automated look (keeps `v2-look.ts` unchanged; add it later if live menus break).
- Heroes: 8 ideas T6 (Atelier cut, test pins it); never repeated T6; no-crop T7; split-pushing wording T8; live T10.
- Review Focus → tests: unknown model (T1), all ideas used (T6), contain not a crop (T7), thumb bar over controls (T3), no badges/offer (T3).
