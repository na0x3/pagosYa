# Store quality: menus, missed defects, photo library, speed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New V2 stores pick from five good menus, the seven defects that slipped through on 2026-11-16 are caught before a design is
saved, every store gets enough photos from a curated library, and build time and cost are measured per stage before any cut.

**Architecture:** Menus: one list change in `v2-menus.ts`. Defects: new in-page rules in `evaluateTemplateRules`
(`source-template-qa-rules.ts`), made blocking for V2 free runs in `v2-run.ts` and mirrored as look checklist lines in `v2-look.ts`.
Photos: a manifest-driven library under `apps/api/assets/photo-library/<sector>/`, a pure module `v2-photo-library.ts` (read,
match, plan) and one service step that copies library photos into the store's uploads before `storePhotos`. Speed: the run state
records which rules sent each attempt back; a benchmark script rebuilds five stores and prints one table.

**Tech Stack:** NestJS + Prisma (apps/api), Playwright (in-page rules and their specs), jest, sharp, Node scripts.

**Spec:** `docs/superpowers/specs/2026-11-16-store-quality-six-design.md`

## Global Constraints

- Allowed menu models for new builds: exactly `mega`, `drawer`, `circles`, `overlay`, `dropdown`; the kit keeps drawing all 16.
- Library: 15 sectors, ~15 photos each, CC0 only, no museum art, no visible brands, ≥ 1000 px on the long side; each sector approved by the owner on a contact sheet before it ships.
- Top-up: only when the store has fewer than 12 usable uploads (images ≥ 400 px); add `max(6, 14 − usable)` photos; once per store; never a guessed sector (no match → nothing).
- Merchant message: «Agregué N fotos de ambiente de nuestra biblioteca; puedes cambiarlas o quitarlas en Tienda › Medios.»
- Speed target: median ≤ 20 min and ≤ $2 per store on the five-store benchmark, with no more defects than before.
- Light checks (owner 2026-11-06): one spec file per run, no full `tsc`, no multi-suite jest; never `tsc --noEmit` on the API (breaks the watcher's buildinfo) — the jest run of the touched spec is the type check.
- API edits restart the API watcher and kill running YAPI builds: never edit `apps/api/src` while a benchmark or a build runs; never use `sed -i`/`mv` on watched files (use the Edit tool).
- Copy shown to merchants and rule lines are Spanish; code comments English, in the repo's style (owner quote + date when a rule comes from the owner).

## Review Focus

- A row of product cards or a scrolling product rail must never trip the new tile rules — they are the platform's (`productish`); covered by negative cases in Task 3 and Task 8.
- A hero whose only call to action is a real button plus one secondary text link must pass `hero-actions`; negative case in Task 4.
- A store whose words match two sectors equally (e.g. «café y pastelería») must get one deterministic sector or none, never a random one; tie case in Task 10.
- A store that already received library photos and whose merchant deleted some must not be topped up again; case in Task 10 (`planLibraryTopUp` with `already: true`) and Task 11.
- A long headline in a wide column (a 3-line hero headline) must not count as `squeezed-title`; negative case in Task 6.

---

### Task 1: Five menus for new stores

**Files:**
- Modify: `apps/api/src/storefront-source/v2/v2-menus.ts:28-35` (`V2_MENU_UNCHECKED`, `allowedMenus`)
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts:713-718` and `:880-884`

**Interfaces:**
- Produces: `V2_MENU_OFFERED: readonly string[]` = `['mega', 'drawer', 'circles', 'overlay', 'dropdown']`; `allowedMenus(used)` returns only offered ids, in `V2_MENU_MODELS` order.

- [ ] **Step 1: Update the failing tests**

Replace the two tests in `v2.spec.ts`:

```ts
  it('limits the direction to unused models, all of them when every one is used', () => {
    expect((v2MenuSchema(['overlay', 'drawer']) as any).properties.model.enum).toEqual(['overlay', 'drawer']);
    // Spec 2026-11-16 store quality: new stores pick from five menus only.
    expect(allowedMenus(V2_MENU_MODELS.map(m => m.id))).toEqual(['mega', 'overlay', 'dropdown', 'drawer', 'circles']);
    expect(allowedMenus(['mega'])).toEqual(['overlay', 'dropdown', 'drawer', 'circles']);
    expect(allowedMenus(['stickers', 'tabs'])).toEqual(['mega', 'overlay', 'dropdown', 'drawer', 'circles']);
  });
```

```ts
  it('spec 2026-11-16: YAPI never picks the retired menus', () => {
    for (const retired of ['rail', 'stickers', 'index', 'need', 'thumb', 'tabs', 'split', 'dock', 'bestsellers', 'offer', 'search'])
      expect(allowedMenus([])).not.toContain(retired);
    expect(allowedMenus([])).toContain('mega');
  });
```

(Saved designs keep their model because the kit draws all 16 — nothing in `v2-menus` rewrites a saved `config.js`; the kit's own
`store-menu` spec already covers drawing `stickers`.)

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "menu" 2>&1 | tail -20`
Expected: FAIL — `allowedMenus` still returns 15 models.

- [ ] **Step 3: Implement**

In `v2-menus.ts` replace `V2_MENU_UNCHECKED` and `allowedMenus`:

```ts
/** Spec 2026-11-16 store quality (owner «Keep 5»): new stores pick from the five menus that looked right on every store; the kit
 *  still draws all 16, so a design saved with another model keeps it. */
export const V2_MENU_OFFERED: readonly string[] = ['mega', 'drawer', 'circles', 'overlay', 'dropdown'];

/** The offered models this merchant's other stores have not used; all five once every one is used. */
export const allowedMenus = (used: readonly string[]): string[] => {
  const all = V2_MENU_MODELS.map(m => m.id).filter(id => V2_MENU_OFFERED.includes(id));
  const free = all.filter(id => !used.includes(id));
  return free.length ? free : all;
};
```

Remove `V2_MENU_UNCHECKED` (`grep -rn V2_MENU_UNCHECKED apps/api/src` must print nothing afterwards).

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts 2>&1 | tail -6`
Expected: all v2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/v2-menus.ts apps/api/src/storefront-source/v2/v2.spec.ts
git commit -m "feat(yapi): new stores pick from five menus (mega, drawer, circles, overlay, dropdown); saved designs keep theirs"
```

---

### Task 2: `covered-text` sees a cut-out over part of a headline

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts:208` (the `hits` sampling inside the `for (const { owner, node } of big)` loop)
- Create: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts` (shared harness for Tasks 2–8)

**Interfaces:**
- Consumes: `evaluateTemplateRules()` (runs in the page; no imports or closures in it).
- Produces: the spec file with `page(body)`, `picture`, `cutout`, `cover`, `rules(width, body)` helpers used by Tasks 3–8.

- [ ] **Step 1: Write the harness and the failing test**

```ts
jest.setTimeout(90_000);

import { chromium, type Browser } from 'playwright';
import { evaluateTemplateRules, type TemplateRuleFinding } from './source-template-qa-rules';

/** Spec 2026-11-16 store quality: the defects that reached saved designs (Bake Lab r2/r3, NOA r2), one page each. */
describe('template rules: store quality 2026-11-16', () => {
  let browser: Browser;
  beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
  afterAll(async () => { await browser.close(); });
  const picture = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#c96"/></svg>');
  const cutout = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><circle cx="100" cy="200" r="100" fill="#642"/></svg>');
  const page = (body: string) => `<!doctype html><html><head><style>body{margin:0;font:16px/1.4 sans-serif;background:#fff;color:#111} section{padding:40px 16px;min-height:120px}</style></head>
    <body><main>${body}</main></body></html>`;
  const rules = async (width: 1280 | 390, body: string): Promise<TemplateRuleFinding[]> => {
    const tab = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await tab.setContent(page(body));
    const found = await tab.evaluate(evaluateTemplateRules);
    await tab.close();
    return found;
  };
  const cover = `<section data-lb-at="0"><h1 style="font-size:80px">Tienda</h1><a href="#" style="display:inline-block;padding:12px 20px;background:#111;color:#fff">Comprar</a><img src="${picture}" width="600" height="400" alt=""></section>`;

  it('covered-text: a product cut-out over the middle of a big headline (Bake Lab r3 «RELLENAS HASTA EL CENTRO»)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1" style="position:relative;text-align:center">
        <h2 style="font-size:120px;margin:0;line-height:1">HASTA EL CENTRO</h2>
        <img src="${cutout}" alt="" style="position:absolute;left:50%;top:0;width:220px;height:240px;transform:translateX(-50%)">
      </section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'covered-text', part: 1 })]));
  });
});
```

(Tasks 3–8 add their `it(...)` blocks and small helpers inside this same `describe`.)

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -20`
Expected: FAIL — no `covered-text` (only the centre sample of five hits the cut-out).

- [ ] **Step 3: Implement**

In `source-template-qa-rules.ts`, in the `for (const { owner, node } of big)` loop, replace the line that builds `hits`:

```ts
      // Spec 2026-11-16 (Bake Lab r3: a 220 px cookie tower over the middle of a 900 px headline met one of five samples): nine
      // samples across the line, two hits still mean covered.
      const hits = [.1, .2, .3, .4, .5, .6, .7, .8, .9].map(f => document.elementFromPoint(r.left + r.width * f, y)).filter((hit): hit is Element => Boolean(hit));
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "fix(checks): a cut-out over the middle of a big headline counts as covered text (nine samples, Bake Lab r3)"
```

---

### Task 3: `photo-less-tile`

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (new block just before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'photo-less-tile', severity: 'advice' }` (line starts `CONSEJO:`).

- [ ] **Step 1: Write the failing tests** (inside the describe of Task 2)

```ts
  const tile = (inner: string, paint = 'background:#6b7a4a') => `<div style="height:220px;${paint}">${inner}</div>`;
  it('photo-less-tile: painted tiles without a photo beside tiles with one (Bake Lab r3 «Combos», «Cajas»)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px">
        ${tile(`<img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b>Galletas</b>`)}
        ${tile(`<img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b>Pastelería</b>`)}
        ${tile('<b>Combos</b>')}${tile('<b>Cajas</b>')}
      </div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'photo-less-tile', part: 1, severity: 'advice' })]));
  });
  it('photo-less-tile: not for a row where no tile has a photo, nor for product cards', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${tile('<b>Uno</b>')}${tile('<b>Dos</b>')}${tile('<b>Tres</b>')}</div></section>
      <section data-lb-at="2"><div data-pagosya-catalog style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        <article class="menu-item" style="height:240px"><img src="${picture}" style="width:100%" alt=""></article>
        <article class="menu-item" style="height:240px;background:#eee">Sin foto</article>
        <article class="menu-item" style="height:240px"><img src="${picture}" style="width:100%" alt=""></article>
      </div></section>`);
    expect(found.find(f => f.rule === 'photo-less-tile')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t photo-less 2>&1 | tail -20`
Expected: first test FAIL (no such rule), second PASS.

- [ ] **Step 3: Implement** (insert before `return out;`)

```ts
  // Spec 2026-11-16 store quality (Bake Lab r3 «Combos», «Cajas»): in a row of three or more tiles, a painted tile without a photo
  // while its neighbours have one looks unfinished.
  {
    const media = (el: Element) => Boolean(el.querySelector('img,picture,video')) || [el, ...Array.from(el.querySelectorAll('*'))].some(node => /url\(/.test(getComputedStyle(node).backgroundImage));
    const painted = (el: Element) => { const s = getComputedStyle(el), c = rgb(s.backgroundColor); return (c.length >= 3 && (c[3] === undefined || c[3] > .5)) || parseFloat(s.borderTopWidth) >= 1; };
    let lone: Element | null = null;
    for (const row of Array.from(main.querySelectorAll('div,ul,section'))) {
      if (lone) break;
      if (row.closest(productish) || row.closest('header,footer')) continue;
      const tiles = Array.from(row.children).filter(child => { const r = child.getBoundingClientRect(); return visible(child) && r.width >= 120 && r.height >= 120; });
      if (tiles.length < 3) continue;
      const heights = tiles.map(t => t.getBoundingClientRect().height);
      if (Math.max(...heights) > 2.2 * Math.min(...heights)) continue;
      const bare = tiles.filter(t => !media(t) && painted(t));
      if (bare.length && tiles.some(media)) lone = bare[0];
    }
    if (lone) push('photo-less-tile', lone, `CONSEJO: La tarjeta ${quote(lone)} es un bloque de color sin foto junto a otras con foto: dale una foto de la tienda que aún no uses, igual que a sus vecinas.`);
  }
```

- [ ] **Step 4: Run to see both pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): photo-less-tile — a painted tile without a photo beside tiles with one (Bake Lab r3)"
```

---

### Task 4: `hero-actions`

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'hero-actions', severity: 'advice' }`.

- [ ] **Step 1: Write the failing tests**

```ts
  it('hero-actions: the cover\'s calls to action are words with a line under them (NOA r2 «Ver novias | Reservar cita»)', async () => {
    const found = await rules(1280, `<section data-lb-at="0"><h1 style="font-size:80px">NOA VARGAS</h1>
        <a href="#" style="font-size:12px;letter-spacing:.1em;text-decoration:none;border-bottom:1px solid #111">VER NOVIAS</a>
        <a href="#" style="font-size:12px;letter-spacing:.1em;text-decoration:none">RESERVAR CITA</a>
        <img src="${picture}" width="600" height="400" alt=""></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'hero-actions', part: 0 })]));
  });
  it('hero-actions: a real button with one secondary text link passes', async () => {
    const found = await rules(1280, `<section data-lb-at="0"><h1 style="font-size:80px">Tienda</h1>
        <a href="#" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;border-radius:999px">Comprar</a>
        <a href="#">Ver cómo se hace</a><img src="${picture}" width="600" height="400" alt=""></section>`);
    expect(found.find(f => f.rule === 'hero-actions')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t hero-actions 2>&1 | tail -20`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement** (before `return out;`)

```ts
  // Spec 2026-11-16 store quality (NOA r2 «Ver novias | Reservar cita»): the cover's calls to action are buttons — a filled or
  // outlined box — not words with a line under them.
  {
    const first = Array.from(main.children).find(visible);
    const actions = first ? Array.from(first.querySelectorAll('a[href],button')).filter(el => {
      const r = el.getBoundingClientRect(), words = (el.textContent || '').trim();
      return r.width > 0 && r.height > 0 && words.length > 0 && words.length <= 40 && !el.closest('nav,header') && !el.closest(productish);
    }) : [];
    const boxed = (el: Element) => {
      const s = getComputedStyle(el), bg = rgb(s.backgroundColor), r = el.getBoundingClientRect();
      const filled = bg.length >= 3 && (bg[3] === undefined || bg[3] > .3);
      const outlined = ['top', 'right', 'bottom', 'left'].every(side => parseFloat(s.getPropertyValue(`border-${side}-width`)) >= 1);
      return (filled || outlined) && r.height >= 32;
    };
    if (actions.length && !actions.some(boxed)) push('hero-actions', actions[0], `CONSEJO: En la portada ${quote(actions[0])} es una palabra con raya, no un botón: dale forma de botón (fondo o borde, minHeight 44 px, padding 0 22px) y deja como texto solo una acción secundaria.`);
  }
```

- [ ] **Step 4: Run to see both pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): hero-actions — the cover's calls to action must be buttons (NOA r2)"
```

---

### Task 5: `hollow-tiles` (the spec's «empty-section tuned» for item bands)

The existing `empty-section` measures whole sections; the misses were tall tiles with words at the top and the bottom and nothing
between (NOA r2 01/02/03, Bake Lab r2 «Para llevar a la mesa»). A separate rule keeps `empty-section`'s calibration intact.

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'hollow-tiles', severity: 'advice' }`.

- [ ] **Step 1: Write the failing tests**

```ts
  const stepTile = (n: string, title: string) => `<div style="height:420px;display:flex;flex-direction:column;justify-content:space-between;background:#8a2533;color:#fff;padding:24px"><b style="font-size:64px">${n}</b><span style="font-size:24px">${title}</span></div>`;
  it('hollow-tiles: tall tiles with the number on top, the title at the bottom and nothing between (NOA r2)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0">${stepTile('01', 'Conversación')}${stepTile('02', 'Construcción')}${stepTile('03', 'Pruebas')}</div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'hollow-tiles', part: 1 })]));
  });
  it('hollow-tiles: photo tiles and short tiles pass', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${[1, 2, 3].map(() => `<div style="height:420px;position:relative"><img src="${picture}" style="width:100%;height:100%;object-fit:cover" alt=""><b style="position:absolute;bottom:12px;left:12px">Uno</b></div>`).join('')}
      </div></section>
      <section data-lb-at="2"><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${[1, 2, 3].map(n => `<div style="height:160px;background:#eee;padding:16px"><b>${n}</b><p>Texto corto</p></div>`).join('')}</div></section>`);
    expect(found.find(f => f.rule === 'hollow-tiles')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t hollow 2>&1 | tail -20`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement** (before `return out;`)

```ts
  // Spec 2026-11-16 store quality (NOA r2 «01 Conversación», Bake Lab r2 «Para llevar a la mesa»): tall tiles whose words sit at
  // the top and the bottom with a big empty gap between — at least 140 px and 45% of the tile — in half the row or more.
  {
    const marks = (tile: Element) => {
      const rects: DOMRect[] = [];
      const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node.textContent || '').trim()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        rects.push(...Array.from(range.getClientRects()));
      }
      for (const el of Array.from(tile.querySelectorAll('img,video,svg,picture,input,textarea,select,button'))) rects.push(el.getBoundingClientRect());
      return rects.filter(r => r.width > 0 && r.height > 0).sort((a, b) => a.top - b.top);
    };
    const gap = (tile: Element) => {
      const box = tile.getBoundingClientRect();
      if (/url\(/.test(getComputedStyle(tile).backgroundImage)) return 0;
      let edge = box.top, widest = 0;
      for (const m of marks(tile)) { widest = Math.max(widest, m.top - edge); edge = Math.max(edge, m.bottom); }
      return Math.max(widest, box.bottom - edge);
    };
    let hollow: Element | null = null;
    for (const row of Array.from(main.querySelectorAll('div,ul,section'))) {
      if (hollow) break;
      if (row.closest(productish) || row.closest('header,footer')) continue;
      const tiles = Array.from(row.children).filter(child => { const r = child.getBoundingClientRect(); return visible(child) && r.width >= 120 && r.height >= 220; });
      if (tiles.length < 3) continue;
      const empty = tiles.filter(t => { const g = gap(t), h = t.getBoundingClientRect().height; return g >= 140 && g >= .45 * h; });
      if (empty.length >= Math.ceil(tiles.length / 2)) hollow = empty[0];
    }
    if (hollow) push('hollow-tiles', hollow, `CONSEJO: Tarjetas altas casi vacías (${quote(hollow)}): las palabras quedan arriba y abajo con un hueco grande en medio. Hazlas más bajas, junta el texto o pon una foto en el hueco.`);
  }
```

- [ ] **Step 4: Run to see both pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): hollow-tiles — tall tiles with words at top and bottom and an empty middle (NOA r2)"
```

---

### Task 6: `squeezed-title` on desktop

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'squeezed-title', severity: 'advice' }` (desktop only; the phone already has `phone-squeezed-title`).

- [ ] **Step 1: Write the failing tests**

```ts
  it('squeezed-title: a section title broken into a word per line in a narrow column (Bake Lab r3 «Cinco maneras de empezar»)', async () => {
    const found = await rules(1280, `${cover}
      <section data-lb-at="1" style="display:grid;grid-template-columns:220px 1fr;gap:24px"><h2 style="font-size:52px;line-height:1">Cinco maneras de empezar</h2>
        <div style="height:300px;background:#eee"></div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'squeezed-title', part: 1 })]));
  });
  it('squeezed-title: a three-line headline in a wide column passes', async () => {
    const found = await rules(1280, `<section data-lb-at="0"><h1 style="font-size:96px;line-height:1;max-width:760px">Deja que el aceite haga lo suyo</h1>
        <a href="#" style="display:inline-block;padding:12px 20px;background:#111;color:#fff">Comprar</a><img src="${picture}" width="600" height="400" alt=""></section>`);
    expect(found.find(f => f.rule === 'squeezed-title')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t squeezed 2>&1 | tail -20`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement** (before `return out;`)

```ts
  // Spec 2026-11-16 store quality (Bake Lab r3 «Cinco / maneras / de / empezar» in a 200 px column): on a computer a title of 28 px or
  // more never stands one word per line, nor four lines in a column under a third of the page.
  if (window.innerWidth >= 1000) {
    const pageWidth = main.getBoundingClientRect().width;
    const squeezedTitle = Array.from(main.querySelectorAll('h1,h2')).find(h => {
      if (h.closest(productish) || !visible(h)) return false;
      const s = getComputedStyle(h), size = parseFloat(s.fontSize);
      if (size < 28) return false;
      const lh = parseFloat(s.lineHeight) || size * 1.2, r = h.getBoundingClientRect();
      const lines = Math.round(r.height / lh), words = (h.textContent || '').trim().split(/\s+/).length;
      return (lines >= 4 && r.width < .32 * pageWidth) || (lines >= 3 && words / lines <= 1.2);
    });
    if (squeezedTitle) push('squeezed-title', squeezedTitle, `CONSEJO: El título ${quote(squeezedTitle)} queda apretado (una palabra por línea): dale una columna más ancha o un tamaño menor para que entre en dos o tres líneas.`);
  }
```

- [ ] **Step 4: Run to see both pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): squeezed-title on desktop — no title one word per line (Bake Lab r3)"
```

---

### Task 7: `repeated-facts`

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'repeated-facts', severity: 'advice' }`. The footer does not count (it is expected to repeat the address once); the header's announcement bar does.

- [ ] **Step 1: Write the failing tests**

```ts
  it('repeated-facts: the same address in the top bar and two sections (Bake Lab r2)', async () => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await tab.setContent(`<!doctype html><html><body style="margin:0"><header><p>Horneado cada mañana · Retiro en Belisario Salinas 410</p></header><main>
      ${cover}
      <section data-lb-at="1"><p>Ven al horno: Calle Belisario Salinas 410, Sopocachi.</p><img src="${picture}" width="600" height="400" alt=""></section>
      <section data-lb-at="2"><p>Recoge en Belisario Salinas 410.</p><img src="${picture}" width="600" height="400" alt=""></section>
      </main><footer><p>Calle Belisario Salinas 410</p></footer></body></html>`);
    const found = await tab.evaluate(evaluateTemplateRules);
    await tab.close();
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'repeated-facts' })]));
  });
  it('repeated-facts: twice on the page plus the footer passes', async () => {
    const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await tab.setContent(`<!doctype html><html><body style="margin:0"><main>${cover}
      <section data-lb-at="1"><p>Ven al horno: Calle Belisario Salinas 410.</p><img src="${picture}" width="600" height="400" alt=""></section>
      </main><footer><p>Calle Belisario Salinas 410</p></footer></body></html>`);
    const found = await tab.evaluate(evaluateTemplateRules);
    await tab.close();
    expect(found.find(f => f.rule === 'repeated-facts')).toBeUndefined();
  });
```

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t repeated-facts 2>&1 | tail -20`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement** (before `return out;`)

```ts
  // Spec 2026-11-16 store quality (Bake Lab r2: «Belisario Salinas 410» and «horneado cada mañana» in the top bar and two sections):
  // the same address, phone or sentence in three or more places of the page (the header counts, the footer does not).
  {
    const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const places = new Map<string, { where: Set<string>; el: Element }>();
    const note = (key: string, where: string, el: Element) => { const entry = places.get(key) ?? { where: new Set<string>(), el }; entry.where.add(where); places.set(key, entry); };
    const roots = [document.querySelector('header'), main].filter((root): root is Element => Boolean(root));
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement;
        if (!el || el.closest('footer') || el.closest(productish)) continue;
        const where = root === main ? `s${partOf(el)}` : 'header';
        const text = norm(node.textContent || '');
        for (const piece of (node.textContent || '').split(/[·•|\n.!?—–:]/).map(norm).filter(p => p.length >= 16)) note(piece, where, el);
        for (const address of text.match(/[a-z]{3,} [a-z]{3,} \d{2,5}/g) ?? []) note(address, where, el);
        for (const phone of text.match(/\d{7,}/g) ?? []) note(phone, where, el);
      }
    }
    const repeated = [...places.entries()].find(([, entry]) => entry.where.size >= 3);
    if (repeated) push('repeated-facts', repeated[1].el, `CONSEJO: «${repeated[0].slice(0, 40)}» aparece en ${repeated[1].where.size} lugares de la portada: déjalo en un solo lugar (la sección de la tienda o el pie) y usa el espacio para algo nuevo.`);
  }
```

- [ ] **Step 4: Run to see both pass**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): repeated-facts — the same address, phone or sentence in three places (Bake Lab r2)"
```

---

### Task 8: `phone-cut-tiles`

`h-overflow` misses tiles that run off the phone screen when the page itself does not scroll sideways (a parent clips them).

**Files:**
- Modify: `apps/api/src/storefront-source/source-template-qa-rules.ts` (before `return out;`)
- Test: `apps/api/src/storefront-source/source-template-qa-quality.spec.ts`

**Interfaces:**
- Produces: finding `{ rule: 'phone-cut-tiles', severity: 'block' }` (line starts `BLOQUEA:`).

- [ ] **Step 1: Write the failing tests**

```ts
  it('phone-cut-tiles: category tiles cut at the screen edge inside a clipped row (Bake Lab r3 phone)', async () => {
    const found = await rules(390, `${cover}
      <section data-lb-at="1" style="overflow:hidden"><div style="display:grid;grid-template-columns:repeat(4,220px);gap:12px">
        ${['Galletas', 'Pastelería', 'Combos', 'Cajas'].map(name => `<div style="height:200px;background:#6b7a4a;color:#fff">${name}</div>`).join('')}
      </div></section>`);
    expect(found).toEqual(expect.arrayContaining([expect.objectContaining({ rule: 'phone-cut-tiles', part: 1, severity: 'block' })]));
  });
  it('phone-cut-tiles: a row that scrolls sideways, a marquee and product rails pass', async () => {
    const found = await rules(390, `${cover}
      <section data-lb-at="1"><div style="display:flex;gap:12px;overflow-x:auto">${[1, 2, 3, 4].map(n => `<div style="flex:0 0 220px;height:200px;background:#ddd">Uno ${n}</div>`).join('')}</div></section>
      <section data-lb-at="2" style="overflow:hidden"><div data-pya-motion="marquee" style="display:flex;width:2000px">${[1, 2, 3].map(n => `<div style="flex:0 0 300px;height:120px">Texto ${n}</div>`).join('')}</div></section>
      <section data-lb-at="3" style="overflow:hidden"><div data-pagosya-catalog style="display:flex;width:1200px">${[1, 2, 3].map(n => `<article class="menu-item" style="flex:0 0 300px;height:200px">P ${n}</article>`).join('')}</div></section>`);
    expect(found.find(f => f.rule === 'phone-cut-tiles')).toBeUndefined();
  });
```

(The `cover` fixture's 600 px image overflows a 390 px phone; if the cover itself trips the new rule, give the fixture's image
`style="width:100%;height:auto"` in these two tests — the rule must not depend on the cover.)

- [ ] **Step 2: Run to see the first fail**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts -t phone-cut 2>&1 | tail -20`
Expected: first FAIL, second PASS.

- [ ] **Step 3: Implement** (before `return out;`)

```ts
  // Spec 2026-11-16 store quality (Bake Lab r3 phone: «after Pastelería a cut green column, the rest off screen»): on the phone a tile
  // that starts on screen and ends past its edge, inside a row that neither scrolls nor moves, is cut — even when the page does not
  // scroll sideways (a parent clips it, so h-overflow says nothing).
  if (window.innerWidth < 600) {
    const scrolls = (el: Element) => { for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) if (/auto|scroll/.test(getComputedStyle(node).overflowX)) return true; return false; };
    const moving = '[data-pya-motion="marquee"],.es-marquee,.ui-marquee,[data-carousel],.es-carousel';
    const cutTile = Array.from(main.querySelectorAll('*')).find(el => {
      const r = el.getBoundingClientRect();
      return r.width >= 100 && r.width < window.innerWidth * .95 && r.height >= 80 && r.left < window.innerWidth - 10 && r.right > window.innerWidth + 20
        && !scrolls(el) && !el.closest(moving) && !el.closest(productish) && !el.closest('header,footer');
    });
    if (cutTile) push('phone-cut-tiles', cutTile, `BLOQUEA: En el celular ${quote(cutTile)} queda cortada en el borde de la pantalla: apila las tarjetas (gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 10rem), 1fr))') o haz una fila que se desliza (overflowX: 'auto').`);
  }
```

- [ ] **Step 4: Run to see both pass, and the older rule spec still passes**

Run: `cd apps/api && npx jest src/storefront-source/source-template-qa-quality.spec.ts 2>&1 | tail -8` → PASS.
Then, as its own run: `cd apps/api && npx jest src/storefront-source/source-fill-review.spec.ts 2>&1 | tail -6` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-template-qa-rules.ts apps/api/src/storefront-source/source-template-qa-quality.spec.ts
git commit -m "feat(checks): phone-cut-tiles — tiles cut at the phone's edge inside a row that does not scroll (Bake Lab r3)"
```

---

### Task 9: V2 runs act on the new rules; the look checks the same list

**Files:**
- Modify: `apps/api/src/storefront-source/v2/v2-run.ts:20-23` (`FREE_BLOCKERS`, `FREE_ADVICE_BLOCKERS`)
- Modify: `apps/api/src/storefront-source/v2/v2-look.ts:142-150` (`v2LookPrompt` checklist)
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Consumes: rule ids from Tasks 2–8.
- Produces: `freeBlocking(findings)` returns lines for `photo-less-tile`, `hero-actions`, `hollow-tiles`, `squeezed-title`, `repeated-facts` (advice) and `phone-cut-tiles` (block).

- [ ] **Step 1: Write the failing tests** (new describe at the end of `v2.spec.ts`)

```ts
describe('spec 2026-11-16 store quality: the new checks reach a V2 run and its look', () => {
  it('turns the new findings into fix lines with their section', () => {
    const findings = ['photo-less-tile', 'hero-actions', 'hollow-tiles', 'squeezed-title', 'repeated-facts']
      .map((rule, part) => ({ rule, severity: 'advice', part, line: `CONSEJO: ${rule}` }))
      .concat([{ rule: 'phone-cut-tiles', severity: 'block', part: 6, line: 'BLOQUEA: phone-cut-tiles' }]);
    expect(freeBlocking(findings)).toEqual(['[sección 0] photo-less-tile', '[sección 1] hero-actions', '[sección 2] hollow-tiles', '[sección 3] squeezed-title', '[sección 4] repeated-facts', '[sección 6] phone-cut-tiles']);
  });
  it('asks the look for the same defects', () => {
    const prompt = v2LookPrompt();
    expect(prompt).toMatch(/foto de producto encima de las letras/);
    expect(prompt).toMatch(/tarjetas de color sin foto/);
    expect(prompt).toMatch(/botones de la portada/);
    expect(prompt).toMatch(/una palabra por línea/);
    expect(prompt).toMatch(/cortadas en el borde/);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "store quality" 2>&1 | tail -20`
Expected: FAIL (lines missing; prompt lacks the phrases).

- [ ] **Step 3: Implement**

`v2-run.ts`: add `'phone-cut-tiles'` to `FREE_BLOCKERS` and `'photo-less-tile', 'hero-actions', 'hollow-tiles', 'squeezed-title', 'repeated-facts'`
to `FREE_ADVICE_BLOCKERS`, with the comment line `// Spec 2026-11-16 store quality: the defects that reached saved designs (Bake Lab, NOA).`
above each set.

`v2-look.ts`, inside `v2LookPrompt`'s list, after the line that starts `- algo roto o sin terminar`, add:

```
- una foto de producto encima de las letras de un título (aunque sea un recorte sin fondo); tarjetas de color sin foto al lado de
  otras con foto; los botones de la portada dibujados como palabras con raya en vez de botones; tarjetas altas con un hueco vacío
  entre el número y el título; un título apretado con una palabra por línea; la misma dirección o frase en tres lugares;
- en el celular: tarjetas cortadas en el borde de la pantalla;
```

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts 2>&1 | tail -6`
Expected: all v2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/v2-run.ts apps/api/src/storefront-source/v2/v2-look.ts apps/api/src/storefront-source/v2/v2.spec.ts
git commit -m "feat(yapi): V2 runs fix the new findings and the look checks the same list"
```

---

### Task 10: Photo library module

**Files:**
- Create: `apps/api/src/storefront-source/v2/v2-photo-library.ts`
- Create: `apps/api/assets/photo-library/README.md`
- Test: `apps/api/src/storefront-source/v2/v2-photo-library.spec.ts`

**Interfaces:**
- Consumes: `apiRoot()` from `./v2-sandbox`.
- Produces:
  - `type LibraryPhoto = { file: string; subject: string; shape: 'wide' | 'tall' | 'square'; source: string; license: 'CC0' }`
  - `type LibrarySector = { sector: string; label: string; keywords: string[]; photos: LibraryPhoto[]; dir: string }`
  - `photoLibraryDir(): string`
  - `readPhotoLibrary(dir?: string): Promise<LibrarySector[]>`
  - `matchSector(words: string, sectors: readonly LibrarySector[]): LibrarySector | null`
  - `planLibraryTopUp(input: { usable: number; already: boolean }): number`

- [ ] **Step 1: Write the failing tests**

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { matchSector, planLibraryTopUp, readPhotoLibrary, type LibrarySector } from './v2-photo-library';

const sector = (id: string, keywords: string[]): LibrarySector => ({ sector: id, label: id, keywords, photos: [], dir: `/x/${id}` });
const bakery = sector('panaderia', ['panaderia', 'pan', 'cookies', 'galletas', 'rolls', 'pasteleria', 'horno']);
const cafe = sector('cafe', ['cafe', 'espresso', 'latte', 'barista', 'tostado']);
const bridal = sector('novias', ['novia', 'novias', 'alta costura', 'vestido de novia', 'atelier']);

describe('v2 photo library (spec 2026-11-16 store quality, Part 1)', () => {
  it('matches the bakery from the store\'s own words, accents and case aside', () => {
    expect(matchSector('Panadería de autor: rolls rellenos, cookies gourmet y cajas', [bakery, cafe, bridal])?.sector).toBe('panaderia');
    expect(matchSector('Atelier de ALTA COSTURA: vestidos de novia', [bakery, cafe, bridal])?.sector).toBe('novias');
  });
  it('needs two keywords, so one stray word never picks a sector', () => {
    expect(matchSector('Licuadoras portátiles; una con café', [bakery, cafe, bridal])).toBeNull();
  });
  it('a tie between two sectors picks none', () => {
    expect(matchSector('pan y latte, galletas y espresso', [bakery, cafe])).toBeNull();
  });
  it('tops up only stores under 12 usable photos, at least 6, never twice', () => {
    expect(planLibraryTopUp({ usable: 8, already: false })).toBe(6);
    expect(planLibraryTopUp({ usable: 0, already: false })).toBe(14);
    expect(planLibraryTopUp({ usable: 5, already: false })).toBe(9);
    expect(planLibraryTopUp({ usable: 12, already: false })).toBe(0);
    expect(planLibraryTopUp({ usable: 2, already: true })).toBe(0);
  });
  it('reads every sector manifest and skips a folder without one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lib-'));
    await mkdir(join(dir, 'panaderia')); await mkdir(join(dir, 'vacio'));
    await writeFile(join(dir, 'panaderia', 'manifest.json'), JSON.stringify({ sector: 'panaderia', label: 'Panadería', keywords: ['pan'], photos: [{ file: 'a.jpg', subject: 'manos amasando', shape: 'wide', source: 'https://example.org/a', license: 'CC0' }] }));
    const read = await readPhotoLibrary(dir);
    expect(read.map(s => s.sector)).toEqual(['panaderia']);
    expect(read[0].dir).toBe(join(dir, 'panaderia'));
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2-photo-library.spec.ts 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `v2-photo-library.ts`

```ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { apiRoot } from './v2-sandbox';

/** Spec 2026-11-16 store quality, Part 1 (owner «Curated library»): hand-picked CC0 photos per kind of business, so a store with few
 *  photos of its own still gets a page full of pictures. One folder per sector with its photos and a manifest.json. */
export type LibraryPhoto = { file: string; subject: string; shape: 'wide' | 'tall' | 'square'; source: string; license: 'CC0' };
export type LibrarySector = { sector: string; label: string; keywords: string[]; photos: LibraryPhoto[]; dir: string };

export const photoLibraryDir = () => join(apiRoot(), 'assets', 'photo-library');

export async function readPhotoLibrary(dir = photoLibraryDir()): Promise<LibrarySector[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const sectors: LibrarySector[] = [];
  for (const entry of entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const raw = await readFile(join(dir, entry.name, 'manifest.json'), 'utf8').catch(() => null);
    if (!raw) continue;
    const manifest = JSON.parse(raw) as Omit<LibrarySector, 'dir'>;
    sectors.push({ ...manifest, dir: join(dir, entry.name) });
  }
  return sectors;
}

const plain = (text: string) => ` ${text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The sector the store's own words name most — at least two keywords, never a tie (a wrong sector is worse than none). */
export function matchSector(words: string, sectors: readonly LibrarySector[]): LibrarySector | null {
  const text = plain(words);
  const scored = sectors.map(sector => ({ sector, hits: sector.keywords.filter(keyword => text.includes(plain(keyword))).length }))
    .filter(entry => entry.hits >= 2).sort((a, b) => b.hits - a.hits);
  if (!scored.length || (scored[1] && scored[1].hits === scored[0].hits)) return null;
  return scored[0].sector;
}

/** How many library photos a store gets: none with 12 usable photos of its own or after its one top-up; otherwise enough to reach
 *  14, at least 6. */
export function planLibraryTopUp(input: { usable: number; already: boolean }): number {
  if (input.already || input.usable >= 12) return 0;
  return Math.max(6, 14 - input.usable);
}
```

Create `apps/api/assets/photo-library/README.md`:

```md
# Photo library (spec 2026-11-16 store quality, Part 1)

One folder per kind of business, with its photos and a `manifest.json`:
`{ "sector", "label", "keywords": [], "photos": [{ "file", "subject", "shape": "wide|tall|square", "source", "license": "CC0" }] }`.
Only CC0 photos, picked by hand (no museum art, no visible brands, ≥ 1000 px on the long side). Each sector is approved by the
owner on a contact sheet before it is added here. A V2 build copies photos from the store's sector into the store's uploads when
the store has fewer than 12 photos of its own (v2-photo-library.ts; `topUpLibraryPhotos` in v2-prototype.service.ts).
```

- [ ] **Step 4: Run to see them pass**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2-photo-library.spec.ts 2>&1 | tail -10`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/v2-photo-library.ts apps/api/src/storefront-source/v2/v2-photo-library.spec.ts apps/api/assets/photo-library/README.md
git commit -m "feat(yapi): photo library module — sector manifests, matching from the store's own words, top-up plan"
```

---

### Task 11: A V2 build tops the store up from the library and tells the merchant

**Files:**
- Modify: `apps/api/src/storefront-source/v2/v2-prototype.service.ts` — new private `topUpLibraryPhotos` next to `storePhotos`; called in `run()` right before `const own = await this.storePhotos(...)`; one chat line after `postLookDone` in `run()`.
- Test: `apps/api/src/storefront-source/v2/v2-photo-library.spec.ts`

**Interfaces:**
- Consumes: `readPhotoLibrary`, `matchSector`, `planLibraryTopUp`, `photoLibraryDir` (Task 10); `readConfigData(files)` (v2-context); `this.uploads.getBuffer(filename)`, `this.uploads.saveBuffer(buffer, mime)` → `{ url, filename, mimeType, byteSize }`; `this.postChat(storeId, content, metadata)`.
- Produces: `topUpLibraryPhotos(merchantId, storeId, files, dir?) → Promise<{ added: number; sector: string | null }>`; `Store.onboarding.libraryPhotos = { sector, count, at }` marks the one top-up.

- [ ] **Step 1: Write the failing test** (append to `v2-photo-library.spec.ts`)

```ts
import sharp from 'sharp';
import { SourceV2PrototypeService } from './v2-prototype.service';

describe('v2 build: library top-up', () => {
  const jpeg = (w: number) => sharp({ create: { width: w, height: Math.round(w * .66), channels: 3, background: '#cc9966' } }).jpeg().toBuffer();
  const library = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lib-'));
    await mkdir(join(dir, 'panaderia'));
    const photos = [];
    for (let i = 0; i < 10; i++) { await writeFile(join(dir, 'panaderia', `p${i}.jpg`), await jpeg(1200)); photos.push({ file: `p${i}.jpg`, subject: `foto ${i}`, shape: 'wide', source: 'https://example.org', license: 'CC0' }); }
    await writeFile(join(dir, 'panaderia', 'manifest.json'), JSON.stringify({ sector: 'panaderia', label: 'Panadería', keywords: ['panaderia', 'cookies', 'rolls'], photos }));
    return dir;
  };
  const service = async (uploadsCount: number, onboarding: Record<string, unknown> = {}) => {
    const own = await jpeg(900);
    const created: unknown[] = [], updates: unknown[] = []; let saved = 0;
    const prisma = {
      store: { findUnique: async () => ({ onboarding: { what: 'Panadería de autor: rolls y cookies', ...onboarding } }), update: async (args: unknown) => { updates.push(args); return {}; } },
      mediaAsset: { findMany: async () => Array.from({ length: uploadsCount }, (_, i) => ({ url: `/v1/uploads/own-${i}.jpg` })), create: async (args: unknown) => { created.push(args); return {}; } },
    };
    const uploads = { getBuffer: async () => own, saveBuffer: async (_b: Buffer, mimeType: string) => ({ url: `/v1/uploads/new-${++saved}.jpg`, filename: `new-${saved}.jpg`, mimeType, byteSize: 10 }) };
    const svc = Object.assign(Object.create(SourceV2PrototypeService.prototype), { prisma, uploads });
    return { svc, created, updates };
  };
  const files = [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"storeName":"Miga","categories":[{"id":"c1","name":"Galletas"}],"items":[{"id":"p1","name":"Galletas chocochip"}]}};' }];

  it('adds library photos to a store with 8 of its own and marks the store', async () => {
    const dir = await library(); const { svc, created, updates } = await service(8);
    expect(await svc.topUpLibraryPhotos('m1', 's1', files, dir)).toEqual({ added: 6, sector: 'panaderia' });
    expect(created).toHaveLength(6);
    expect(JSON.stringify(updates[0])).toMatch(/libraryPhotos/);
  });
  it('adds nothing after the store\'s one top-up, nor to a store with 12 photos', async () => {
    const dir = await library();
    expect((await (await service(3, { libraryPhotos: { sector: 'panaderia', count: 11 } })).svc.topUpLibraryPhotos('m1', 's1', files, dir)).added).toBe(0);
    expect((await (await service(12)).svc.topUpLibraryPhotos('m1', 's1', files, dir)).added).toBe(0);
  });
});
```

(If `readConfigData` needs another `config.js` shape, copy the shape used by `v2.spec.ts`'s config fixtures.)

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2-photo-library.spec.ts 2>&1 | tail -10`
Expected: FAIL — `svc.topUpLibraryPhotos is not a function`.

- [ ] **Step 3: Implement** in `v2-prototype.service.ts`

Import: `import { matchSector, photoLibraryDir, planLibraryTopUp, readPhotoLibrary } from './v2-photo-library';`
(`readFile`, `join`, `sharp`, `readConfigData` are already imported in this file.)

Add next to `storePhotos`:

```ts
  /** Spec 2026-11-16 store quality, Part 1 (owner «Curated library»): a store with fewer than 12 usable photos of its own gets
   *  photos of its kind of business from the library, once — copied into its uploads like any photo the merchant adds, so
   *  storePhotos, the section library and the merchant's Medios tab all see them. No sector match, no photos. */
  private async topUpLibraryPhotos(merchantId: string, storeId: string, files: readonly { path: string; content: string }[], dir = photoLibraryDir()) {
    if (!this.uploads) return { added: 0, sector: null as string | null };
    const store = await this.prisma.store.findUnique({ where: { id: storeId }, select: { onboarding: true } });
    const onboarding = (store?.onboarding ?? {}) as Record<string, unknown> & { what?: string; libraryPhotos?: unknown };
    const assets = await this.prisma.mediaAsset.findMany({ where: { merchantId, storeId, mimeType: { in: ['image/jpeg', 'image/png', 'image/webp'] } }, select: { url: true }, take: 80 });
    let usable = 0;
    for (const asset of assets) {
      const filename = /([\w-]+\.(?:png|jpe?g|webp))$/i.exec(asset.url)?.[1];
      const bytes = filename ? await this.uploads.getBuffer(filename).catch(() => null) : null;
      const meta = bytes ? await sharp(bytes).metadata().catch(() => null) : null;
      if (meta?.width && meta.height && Math.max(meta.width, meta.height) >= 400) usable++;
    }
    const want = planLibraryTopUp({ usable, already: Boolean(onboarding.libraryPhotos) });
    if (!want) return { added: 0, sector: null as string | null };
    const data = (readConfigData(files as never).data ?? {}) as { categories?: Array<{ name?: string }>; items?: Array<{ name?: string }> };
    const words = [onboarding.what ?? '', ...(data.categories ?? []).map(c => c.name ?? ''), ...(data.items ?? []).map(i => i.name ?? '')].join(' · ');
    const sector = matchSector(words, await readPhotoLibrary(dir));
    if (!sector) return { added: 0, sector: null as string | null };
    let added = 0;
    for (const photo of sector.photos.slice(0, want)) {
      const bytes = await readFile(join(sector.dir, photo.file)).catch(() => null);
      if (!bytes) continue;
      const mime = /\.png$/i.test(photo.file) ? 'image/png' : /\.webp$/i.test(photo.file) ? 'image/webp' : 'image/jpeg';
      const asset = await this.uploads.saveBuffer(bytes, mime);
      await this.prisma.mediaAsset.create({ data: { merchantId, storeId, url: asset.url, storageKey: asset.filename, mimeType: asset.mimeType, byteSize: asset.byteSize } });
      added++;
    }
    await this.prisma.store.update({ where: { id: storeId }, data: { onboarding: { ...onboarding, libraryPhotos: { sector: sector.sector, count: added, at: new Date().toISOString() } } as never } });
    return { added, sector: sector.sector };
  }
```

In `run()`, right before `const own = await this.storePhotos(merchantId, storeId, files);`:

```ts
    const library = await this.topUpLibraryPhotos(merchantId, storeId, files).catch(error => {
      this.log.warn(JSON.stringify({ event: 'v2_library_photos_failed', storeId, error: String((error as Error)?.message ?? error) }));
      return { added: 0, sector: null as string | null };
    });
```

In `run()`, right after `await this.postLookDone(storeId, state, saved.revision);`:

```ts
    if (library.added) await this.postChat(storeId, `Agregué ${library.added} fotos de ambiente de nuestra biblioteca; puedes cambiarlas o quitarlas en Tienda › Medios.`, { libraryPhotos: library });
```

- [ ] **Step 4: Run to see it pass, then the v2 spec**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2-photo-library.spec.ts 2>&1 | tail -8` → PASS.
Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts 2>&1 | tail -6` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/v2-prototype.service.ts apps/api/src/storefront-source/v2/v2-photo-library.spec.ts
git commit -m "feat(yapi): a V2 build tops a store with few photos up from the photo library, once, and tells the merchant"
```

---

### Task 12: Curate the library — three sectors first, then the other twelve (owner approval each)

**Files:**
- Create: `apps/api/scripts/photo-library/candidates.sh`
- Create: `apps/api/scripts/photo-library/sheet.py`
- Create: `apps/api/assets/photo-library/<sector>/manifest.json` + photos, per approved sector

**Interfaces:**
- Produces: sector folders read by Tasks 10–11. Sector ids: `panaderia`, `novias`, `cafe`, then `comida`, `bebidas`, `moda`, `joyeria`, `belleza`, `mascotas`, `hogar`, `flores`, `libros`, `bienestar`, `tecnologia`, `ninos`.

- [ ] **Step 1: Add the two helper scripts**

`candidates.sh`:

```bash
#!/usr/bin/env bash
# Spec 2026-11-16 photo library: CC0 candidates from rawpixel via Openverse (stocksnap refuses direct downloads; Unsplash needs a key).
# Usage: candidates.sh <out-dir> "<query 1>" "<query 2>" …   — downloads into <out-dir>/NNN.jpg and writes <out-dir>/index.tsv.
set -euo pipefail
out="$1"; shift; mkdir -p "$out"; : > "$out/urls.txt"
for q in "$@"; do
  curl -s -A "pagosya-library/1.0" "https://api.openverse.org/v1/images/?q=$(printf %s "$q" | sed 's/ /%20/g')&page_size=20&source=rawpixel&license=cc0" \
    | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{for(const r of JSON.parse(s).results)console.log(r.url+'\t'+r.foreign_landing_url)}catch{}})" >> "$out/urls.txt"
done
sort -u "$out/urls.txt" | awk -F'\t' '{printf "%03d\t%s\t%s\n", NR, $1, $2}' > "$out/index.tsv"
cut -f1,2 "$out/index.tsv" | xargs -P 12 -n 2 sh -c 'curl -s -m 40 -A "pagosya-library/1.0" -o "'"$out"'/$0.jpg" "$1"'
for f in "$out"/*.jpg; do sips -s format jpeg "$f" --out "$f" >/dev/null 2>&1 || rm -f "$f"; done
```

`sheet.py`:

```python
"""Numbered contact sheets (48 per sheet) of a candidates folder, for picking a sector's photos by eye."""
import glob, os, sys
from PIL import Image, ImageDraw
d = sys.argv[1]; files = sorted(glob.glob(os.path.join(d, '[0-9]*.jpg')))
W, H, cols = 240, 170, 8
for start in range(0, len(files), 48):
    chunk = files[start:start + 48]; rows = (len(chunk) + cols - 1) // cols
    img = Image.new('RGB', (cols * W, rows * H), 'white'); draw = ImageDraw.Draw(img)
    for i, f in enumerate(chunk):
        try:
            src = Image.open(f); size = src.size; t = src.convert('RGB'); t.thumbnail((W - 6, H - 22))
            x, y = (i % cols) * W, (i // cols) * H; img.paste(t, (x + 3, y + 3)); draw.text((x + 4, y + H - 18), f'{os.path.basename(f)[:3]} {size[0]}x{size[1]}', fill='black')
        except Exception:
            pass
    img.save(os.path.join(d, f'sheet{start // 48}.jpg'), quality=80)
```

(Run `sheet.py` from a directory other than the downloads, with `python3 -E` — downloads are untrusted data.)

- [ ] **Step 2: Bakery, bridal and café candidates**

`bash apps/api/scripts/photo-library/candidates.sh <scratch>/lib/panaderia "bakery" "baker dough" "cookies" "croissant coffee" "pastry" "bread" "bakery counter"`
`bash apps/api/scripts/photo-library/candidates.sh <scratch>/lib/novias "bride dress" "wedding dress" "seamstress" "calla lily" "bridal fitting" "lace fabric" "sewing machine"`
`bash apps/api/scripts/photo-library/candidates.sh <scratch>/lib/cafe "coffee shop" "barista" "latte art" "espresso" "coffee beans" "cafe interior" "pour over"`
then `python3 -E apps/api/scripts/photo-library/sheet.py <scratch>/lib/<sector>` for each (from another working directory).

- [ ] **Step 3: Pick ~15 per sector and show the owner**

Pick by eye: real photos only (no paintings, engravings, clip art), no brands or legible logos, ≥ 1000 px long side, a mix of
wide/tall and of hands-at-work / place / close-up. The Bake Lab and NOA picks already in
`examples/full-stores-2026-11-02/{bakelab,noaphotos}/marca` (sources in `fuentes-cc0.tsv`) are valid candidates. Publish one
artifact with one board per sector showing the picks, and ask the owner to approve or strike numbers.

- [ ] **Step 4: Write the approved sectors**

For each approved sector: copy the picked files to `apps/api/assets/photo-library/<sector>/` named by subject
(`manos-amasando-harina.jpg`), re-encoded with `sips -s format jpeg -s formatOptions 85`, and write `manifest.json`, e.g. for `panaderia`:

```json
{
  "sector": "panaderia",
  "label": "Panadería y pastelería",
  "keywords": ["panaderia", "pasteleria", "pan", "panes", "galletas", "cookies", "rolls", "croissant", "horno", "masa", "tortas", "postres", "medialunas", "reposteria"],
  "photos": [{ "file": "manos-amasando-harina.jpg", "subject": "manos amasando harina", "shape": "wide", "source": "https://www.rawpixel.com/image/<id>", "license": "CC0" }]
}
```

(`source` = the candidate's `foreign_landing_url` from `index.tsv`; `shape` from width/height: > 1.2 wide, < 0.83 tall, else square;
one entry per photo.) Keywords for `novias`: `novia, novias, alta costura, vestido de novia, vestidos, atelier, boda, bodas, velo,
encaje, costura`; for `cafe`: `cafe, cafeteria, espresso, latte, capuchino, barista, tostado, grano, granos, cold brew, molido`.

- [ ] **Step 5: Verify the matching on the three test stores and commit**

Run: `cd apps/api && npx ts-node --transpile-only -e "import('./src/storefront-source/v2/v2-photo-library').then(async m => { const s = await m.readPhotoLibrary(); for (const w of ['Panadería de autor: rolls rellenos, cookies gourmet', 'Atelier de alta costura: vestidos de novia', 'Café de especialidad tostado en casa, espresso y latte']) console.log(w, '→', m.matchSector(w, s)?.sector); })"`
Expected: `panaderia`, `novias`, `cafe`.

```bash
git add apps/api/scripts/photo-library apps/api/assets/photo-library
git commit -m "feat(yapi): photo library — panadería, novias and café, owner-approved CC0 photos"
```

- [ ] **Step 6: The other twelve sectors**

Repeat Steps 2–5 for `comida`, `bebidas`, `moda`, `joyeria`, `belleza`, `mascotas`, `hogar`, `flores`, `libros`, `bienestar`,
`tecnologia`, `ninos` — candidates for all twelve, one artifact with twelve boards for the owner, then one commit
`feat(yapi): photo library — twelve more sectors, owner-approved`. Before committing, check keyword overlaps: run `matchSector` on
the onboarding «what» of every demo store in `apps/api/scripts/create-full-store-demo.ts` and confirm none lands in a wrong sector.

---

### Task 13: Record which rules sent each attempt back

**Files:**
- Modify: `apps/api/src/storefront-source/v2/v2-run.ts` (new export after `freeBlocking`)
- Modify: `apps/api/src/storefront-source/v2/v2-prototype.service.ts:71-76` (`V2RunState`) and the `inspect` dep (~line 492)
- Test: `apps/api/src/storefront-source/v2/v2.spec.ts`

**Interfaces:**
- Consumes: `FREE_BLOCKERS`, `FREE_ADVICE_BLOCKERS` (v2-run).
- Produces: `inspectionRules(widths, free): string[]` (entries like `'desktop:hero-actions'`, `'phone:phone-cut-tiles'`); `V2RunState.inspections?: Array<{ at: string; rules: string[] }>`.

- [ ] **Step 1: Write the failing test** (in the store-quality describe of Task 9; add `inspectionRules` to the `./v2-run` import)

```ts
  it('names the rules behind each attempt, by width (benchmark, Part 4)', () => {
    const widths = [
      { width: 1280, findings: [{ rule: 'hero-actions', severity: 'advice' }, { rule: 'small-headline', severity: 'advice' }] },
      { width: 390, findings: [{ rule: 'phone-cut-tiles', severity: 'block' }] },
    ];
    expect(inspectionRules(widths, true)).toEqual(['desktop:hero-actions', 'phone:phone-cut-tiles']);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts -t "names the rules" 2>&1 | tail -10`
Expected: FAIL — `inspectionRules` is not exported.

- [ ] **Step 3: Implement**

`v2-run.ts`, after `freeBlocking`:

```ts
/** Spec 2026-11-16 store quality, Part 4: the rules that sent an attempt back, «desktop:rule» / «phone:rule», for the benchmark. */
export const inspectionRules = (widths: readonly { width: number; findings: readonly { rule: string; severity: string }[] }[], free: boolean) =>
  widths.flatMap(({ width, findings }) => findings
    .filter(f => free ? (f.severity === 'block' && FREE_BLOCKERS.has(f.rule)) || FREE_ADVICE_BLOCKERS.has(f.rule) : f.severity === 'block')
    .map(f => `${width === 390 ? 'phone' : 'desktop'}:${f.rule}`));
```

`v2-prototype.service.ts`: add `inspections?: Array<{ at: string; rules: string[] }>;` to `V2RunState`, import `inspectionRules` from
`./v2-run`, and replace the `inspect` dep:

```ts
      inspect: async snapshot => {
        const widths = await templateQaFindings(snapshot);
        (state.inspections ??= []).push({ at: new Date().toISOString(), rules: inspectionRules(widths, Boolean(context.free)) });
        return widths.flatMap(({ width, blocking, findings }) => (context.free ? freeBlocking(findings) : blocking)
          .map(line => `${width === 390 ? 'Celular' : 'Escritorio'}: ${v2Hint(line).slice(0, 280)}`));
      },
```

- [ ] **Step 4: Run to see it pass**

Run: `cd apps/api && npx jest src/storefront-source/v2/v2.spec.ts 2>&1 | tail -6`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/v2/v2-run.ts apps/api/src/storefront-source/v2/v2-prototype.service.ts apps/api/src/storefront-source/v2/v2.spec.ts
git commit -m "feat(yapi): a V2 run records which rules sent each attempt back (benchmark)"
```

---

### Task 14: Re-check the saved designs (Part 2 acceptance) and run the five-store benchmark (Part 4 measure)

**Files:**
- Create: `apps/api/scripts/brand-bench/recheck-rules.ts`
- Create: `apps/api/scripts/brand-bench/quality-bench.cjs`

**Interfaces:**
- Consumes: `evaluateTemplateRules`; the 4330 viewer (`http://r<rev>-<storeId>.localhost:4330/`, serves saved revisions with the live kit); `API` and `live()` from `scripts/brand-bench/common.cjs` (`BENCH_LIVE` session file); `GET /v1/stores/:id/source-project/v2-prototype` (`status`, `revision`, `usd`, `attempts`, `stages`, `inspections`).

- [ ] **Step 1: Re-check script** `recheck-rules.ts`

```ts
/** Spec 2026-11-16 store quality, Part 2 acceptance: the page rules on saved designs, desktop and phone, through the 4330 viewer.
 *  npx ts-node --transpile-only scripts/brand-bench/recheck-rules.ts <url> … */
import { chromium } from 'playwright';
import { evaluateTemplateRules } from '../../src/storefront-source/source-template-qa-rules';

(async () => {
  const browser = await chromium.launch();
  for (const url of process.argv.slice(2)) for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    await page.goto(url, { waitUntil: 'networkidle' });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < height; y += 400) { await page.evaluate((top: number) => window.scrollTo(0, top), y); await page.waitForTimeout(60); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
    const found = await page.evaluate(evaluateTemplateRules);
    console.log(url, width, [...new Set(found.map(f => f.rule))].sort().join(' '));
    await page.close();
  }
  await browser.close();
})();
```

- [ ] **Step 2: Run it on the saved designs**

Run: `cd apps/api && npx ts-node --transpile-only scripts/brand-bench/recheck-rules.ts http://r3-cmwj97g480001apwesuwrp1g9.localhost:4330/ http://r2-cmwj97g480001apwesuwrp1g9.localhost:4330/ http://r2-cmwjbz7at0001gtjfqmb2rbun.localhost:4330/`
Expected: Bake Lab r3 desktop includes `covered-text`, `photo-less-tile`, `squeezed-title`; Bake Lab r2 desktop includes `hollow-tiles`;
NOA r2 desktop includes `hero-actions`, `hollow-tiles`. (`repeated-facts` and `phone-cut-tiles` were seen in build attempts, not in
the saved revisions; their unit cases in Tasks 7–8 stand for them.) A rule that does not fire here: add a failing unit case built
from that page's real markup first, then fix the rule — never the expectation.

- [ ] **Step 3: Benchmark script** `quality-bench.cjs`

```js
// node quality-bench.cjs key:storeId … — spec 2026-11-16 store quality, Part 4: rebuild each store one after another and print one
// table: minutes, dollars, attempts, the rules behind the retries, pictures on the desktop home. Dev only.
const { API, live } = require('./common.cjs');
const { chromium } = require('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const rows = [];
  for (const job of process.argv.slice(2)) {
    const [key, id] = job.split(':');
    const url = `${API}/v1/stores/${id}/source-project/v2-prototype`;
    const headers = { authorization: `Bearer ${live().token}`, 'content-type': 'application/json' };
    const started = Date.now();
    const res = await fetch(url, { method: 'POST', headers, body: '{}' });
    if (!res.ok) { rows.push({ key, status: `start ${res.status}` }); continue; }
    let state;
    for (;;) { await sleep(20_000); state = await fetch(url, { headers }).then(r => r.json()).catch(() => null); if (state && state.status !== 'RUNNING') break; }
    const rules = {};
    for (const inspection of state.inspections ?? []) for (const rule of inspection.rules) rules[rule] = (rules[rule] ?? 0) + 1;
    let pictures = null;
    if (state.revision) {
      const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://r${state.revision}-${id}.localhost:4330/`, { waitUntil: 'networkidle' });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 500) { await page.evaluate(t => window.scrollTo(0, t), y); await page.waitForTimeout(80); }
      pictures = await page.evaluate(() => new Set([...document.querySelectorAll('main img')].filter(i => i.naturalWidth > 200).map(i => i.currentSrc)).size);
      await browser.close();
    }
    const row = { key, status: state.status, revision: state.revision, minutes: +((Date.now() - started) / 60000).toFixed(1), usd: +(state.usd ?? 0).toFixed(2),
      attempts: (state.attempts ?? []).map(a => a.outcome).join(','), pictures,
      stages: (state.stages ?? []).map(s => `${s.stage}:${Math.round(s.ms / 1000)}s`).join(' '), rules };
    rows.push(row); console.log(JSON.stringify(row));
  }
  console.table(rows.map(({ rules, stages, ...row }) => row));
})();
```

(Run it from `apps/api` so `require('playwright')` resolves to `apps/api/node_modules/playwright`.)

- [ ] **Step 4: Run the benchmark** (no API edits while it runs; ~2.5–3 h on the ChatGPT plan)

Stores: Bake Lab `cmwj97g480001apwesuwrp1g9`, NOA `cmwjbz7at0001gtjfqmb2rbun`, Miga Dorada `cmwiuu04m0001tr2iegzm6dkr`,
rhode `cmwiutgfk0001a5ktxven1s2d`, goodProtein `cmwiuuig90001143m4ednett7`. Create a fresh 10 h session first:
`cd apps/api && BENCH_LIVE=<scratch>/live.json node scripts/brand-bench/session.cjs`, then
`cd apps/api && BENCH_LIVE=<scratch>/live.json node scripts/brand-bench/quality-bench.cjs bakelab:cmwj97g480001apwesuwrp1g9 noa:cmwjbz7at0001gtjfqmb2rbun miga:cmwiuu04m0001tr2iegzm6dkr rhode:cmwiutgfk0001a5ktxven1s2d goodprotein:cmwiuuig90001143m4ednett7 > <scratch>/quality-bench.log 2>&1` (in the background).
Expected: five rows. Miga ≥ 18 pictures (library top-up; its chat shows «Agregué N fotos de ambiente…»). For each saved design take
desktop + phone screenshots and count by hand the defects from the spec's list.

- [ ] **Step 5: Report to the owner and commit the scripts**

One table (minutes, $, attempts, pictures, top retry rules) per store against today's (32–35 min, ~$3, 6 attempts), with the links.

```bash
git add apps/api/scripts/brand-bench/recheck-rules.ts apps/api/scripts/brand-bench/quality-bench.cjs
git commit -m "chore(bench): re-check saved designs with the page rules; five-store quality benchmark"
```

---

### Task 15: Speed cuts — a follow-up plan from the benchmark numbers

The spec orders the cuts (code repairs instead of model rounds, section-only fixes for look findings, an 11-section first draft)
and keeps each only if the benchmark improves; which ones are worth doing depends on Task 14's table (which rules cost the most
rounds, how long the first draft takes against the fix rounds).

- [ ] **Step 1:** From the Task 14 log, rank rules by rounds caused and stages by minutes; write
  `docs/superpowers/plans/2026-11-17-store-speed-cuts.md` with one task per cut aimed at the top items, each ending in a benchmark
  re-run of the same five stores.
- [ ] **Step 2:** Show the owner the ranking and the cuts plan before executing it (owner 2026-10-29 «one plan, stop churn»).
