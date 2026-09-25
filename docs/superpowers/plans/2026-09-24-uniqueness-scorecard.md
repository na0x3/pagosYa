# Uniqueness and Quality Scorecard — Implementation Plan (sub-project 8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free, repeatable measurement that says, surface by surface (buttons, cart, added-to-cart confirmation, product page, checkout review, product cards, type, page), how different a set of stores is from each other and from the kit default, and whether each store still works.

**Architecture:** Three layers. (1) A pure core, `source-scorecard.ts`: distances between surface samples, pairwise and against the kit default, quality failures, WCAG contrast, and the Markdown report. (2) A browser collector, `source-scorecard-capture.ts`: renders a snapshot through `currentSourceRuntime` inside the existing `withVisualSandbox` (now exported), walks home → add → added confirmation → cart → product page → checkout review at 1280 and 390, and returns one `StoreSample` plus screenshots. It also builds the kit-default fixture store. (3) A runner, `scripts/uniqueness-scorecard.ts`: reads the latest revision per store from the local database (read-only) or exported `site/` folders, runs the collector, writes `scorecard.json`, `SCORECARD.md` and screenshots.

**Tech Stack:** NestJS API code (plain functions, no DI), Playwright chromium (`playwright`, as `source-visual-capture.ts` imports it), Prisma client (read-only queries), Jest (ts-jest, `rootDir: src`).

**Spec:** `docs/superpowers/specs/2026-09-24-uniqueness-scorecard-design.md` (binding); parent `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` §3.1, §5; DNA runtime names from `apps/api/src/storefront-source/source-dna.ts` (`SOURCE_DNA_RUNTIME_ENUMS`).

## Global Constraints

- No model calls, ever. No database writes: the runner only uses `findMany`/`findFirst`/`$queryRaw` SELECTs and refuses a non-local `DATABASE_URL`.
- Reuse the sandbox: `withVisualSandbox` gets `export` and nothing else changes in `source-visual-capture.ts`. `probeSourceShopping` is called as-is for the commerce check.
- Each `withVisualSandbox` call has a hard 45 s deadline; the collector opens one sandbox per viewport so one slow store loses one viewport, not the run. Every surface step is guarded: a failure records the surface as missing and an error line, never throws out of `collectStoreSample`.
- The sandbox forces `reducedMotion: 'reduce'`; motion is counted statically from authored files only (kit runtime files and `_compiled/` excluded).
- Thresholds are exported constants and printed in the report: `MIN_PAIR_DISTANCE = 0.25`, `MIN_DEFAULT_DISTANCE = 0.25`, `MIN_BUY_CONTRAST = 4.5`.
- Do not edit `source-dna.ts`, `source-design*.ts`, `source-publishing.service.ts`, `source-projects.controller.ts`, `source-design-job.worker.ts` or `commerce.js` (another agent owns them). When `withSeededDna` exists, the runner applies it so renders match the public site.
- Outputs (json, screenshots) go under `tmp/` (gitignored). Only `SCORECARD.md` is committed, as `docs/research/scorecard-baseline-2026-09-24.md`.
- Jest paths are relative to `apps/api/src`: `cd apps/api && npx jest storefront-source/<file>`. Browser specs use `jest.setTimeout(60_000)` like `source-next.spec.ts`.

## Review Focus

1. A surface missing on one store (e.g. no product page) is listed under `missing` and excluded from pairs; it must not crash `scoreStores` or count as distance 0 → Task 1 test.
2. Numeric distance is relative and capped: `0` vs `10` is 1, `-4` vs `4` is 1 (not 2), `0` vs `0` is 0 → Task 1 test.
3. A pair closer than `MIN_PAIR_DISTANCE` flags both stores; a store closer than `MIN_DEFAULT_DISTANCE` to the kit default is listed on that surface → Task 1 test.
4. The collector must not leave the 45 s sandbox deadline: one sandbox per viewport, short waits (≤ 3 s per surface) → Task 2 test runtime.
5. The runner is read-only and local-only → Task 3 code review (no `create`/`update`/`delete`/`upsert`/`$executeRaw`).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/storefront-source/source-scorecard.ts` (create) | Types, thresholds, `surfaceDistance`, `scoreStores`, `qualityFailures`, `relativeLuminance`, `contrastRatio`, `scorecardMarkdown`. Pure. |
| `apps/api/src/storefront-source/source-scorecard.spec.ts` (create) | Pure tests. |
| `apps/api/src/storefront-source/source-visual-capture.ts` (modify) | `export` on `withVisualSandbox`. |
| `apps/api/src/storefront-source/source-scorecard-capture.ts` (create) | `collectStoreSample`, `kitDefaultSnapshot`, `staticMotionHooks`, `snapshotFromDirectory`. |
| `apps/api/src/storefront-source/source-scorecard-capture.spec.ts` (create) | Browser test on the kit fixture; static-motion and directory tests. |
| `apps/api/scripts/uniqueness-scorecard.ts` (create) | Runner: DB or `--from-dir`, writes json, md, screenshots. |
| `docs/research/scorecard-baseline-2026-09-24.md` (create) | Committed baseline report. |

---

### Task 1: Pure scorecard core

**Files:**
- Create: `apps/api/src/storefront-source/source-scorecard.ts`
- Test: `apps/api/src/storefront-source/source-scorecard.spec.ts`

**Interfaces:**
- Produces:
  - `SURFACE_NAMES = ['button','cart','added','product','review','card','type','page']`, `SurfaceName`, `SurfaceSample = Record<string, string | number>`.
  - `QualityFacts = { shopping: 'passed' | 'failed' | 'unsupported'; shoppingError?: string; overflow: { desktop: boolean | null; mobile: boolean | null }; fontsLoaded: boolean | null; missingImages: number | null; buyContrast: number | null }`.
  - `StoreSample = { id: string; name: string; surfaces: Partial<Record<SurfaceName, SurfaceSample>>; quality: QualityFacts; errors: string[] }`.
  - `surfaceDistance(a, b): number` (0..1; mean over shared keys; no shared keys → 1).
  - `scoreStores(stores, kitDefault): Scorecard` where `Scorecard = { thresholds; surfaces: Record<SurfaceName, SurfaceScore>; stores: Array<{ id; name; failures: string[]; tooCloseToStore: SurfaceName[]; tooCloseToDefault: SurfaceName[] }>; qualityFailures: number }` and `SurfaceScore = { measured: number; closest: Pair | null; mean: number | null; pairs: Pair[]; fromDefault: Record<string, number>; tooCloseToStore: string[]; tooCloseToDefault: string[]; missing: string[] }`, `Pair = { a: string; b: string; distance: number }`.
  - `qualityFailures(q: QualityFacts): string[]`, `relativeLuminance([r,g,b])`, `contrastRatio(fg, bg)`.
  - `scorecardMarkdown(card, meta: { title: string; source: string; createdAt: string }): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { contrastRatio, MIN_DEFAULT_DISTANCE, MIN_PAIR_DISTANCE, qualityFailures, relativeLuminance, scorecardMarkdown, scoreStores, surfaceDistance, type QualityFacts, type StoreSample } from './source-scorecard';

const clean: QualityFacts = { shopping: 'passed', overflow: { desktop: false, mobile: false }, fontsLoaded: true, missingImages: 0, buyContrast: 7 };
const store = (id: string, surfaces: StoreSample['surfaces'], quality: Partial<QualityFacts> = {}): StoreSample => ({ id, name: id.toUpperCase(), surfaces, quality: { ...clean, ...quality }, errors: [] });

describe('surfaceDistance', () => {
  it('is 0 for identical samples', () => expect(surfaceDistance({ radius: 8, case: 'upper' }, { radius: 8, case: 'upper' })).toBe(0));
  it('is 1 for fully different samples', () => expect(surfaceDistance({ radius: 0, case: 'upper' }, { radius: 10, case: 'none' })).toBe(1));
  it('uses relative numeric difference, capped at 1, over shared keys only', () => {
    expect(surfaceDistance({ h: 40 }, { h: 50 })).toBeCloseTo(0.2);
    expect(surfaceDistance({ x: -4 }, { x: 4 })).toBe(1);
    expect(surfaceDistance({ x: 0, only: 'a' }, { x: 0, other: 'b' })).toBe(0);
    expect(surfaceDistance({ a: 1 }, { b: 1 })).toBe(1);
  });
});

describe('scoreStores', () => {
  const kit = store('kit', { button: { radius: 0, case: 'none' }, cart: { position: 'right', width: 0.3 } });
  it('finds the closest pair and flags stores too close to each other and to the default', () => {
    const card = scoreStores([
      store('a', { button: { radius: 20, case: 'upper' }, cart: { position: 'right', width: 0.3 } }),
      store('b', { button: { radius: 20, case: 'upper' }, cart: { position: 'bottom', width: 1 } }),
      store('c', { button: { radius: 0, case: 'none' }, cart: { position: 'left', width: 0.5 } }),
    ], kit);
    expect(card.surfaces.button.closest).toEqual({ a: 'a', b: 'b', distance: 0 });
    expect(card.surfaces.button.tooCloseToStore).toEqual(['a', 'b']);
    expect(card.surfaces.button.tooCloseToDefault).toEqual(['c']);
    expect(card.surfaces.cart.tooCloseToDefault).toEqual(['a']);
    expect(card.surfaces.cart.fromDefault.a).toBe(0);
    expect(card.stores.find(s => s.id === 'a')).toEqual(expect.objectContaining({ tooCloseToStore: ['button'], tooCloseToDefault: ['cart'] }));
    expect(card.thresholds).toEqual({ minPairDistance: MIN_PAIR_DISTANCE, minDefaultDistance: MIN_DEFAULT_DISTANCE, minBuyContrast: 4.5 });
  });
  it('reports missing surfaces instead of crashing or scoring them', () => {
    const card = scoreStores([store('a', { button: { radius: 20 } }), store('b', { button: { radius: 4 }, cart: {} })], store('kit', {}));
    expect(card.surfaces.cart).toEqual(expect.objectContaining({ measured: 0, closest: null, mean: null, missing: ['a', 'b'], tooCloseToDefault: [] }));
    expect(card.surfaces.button.fromDefault).toEqual({});
    expect(card.surfaces.review.missing).toEqual(['a', 'b']);
  });
  it('counts quality failures per store', () => {
    const card = scoreStores([store('a', {}, { overflow: { desktop: false, mobile: true }, buyContrast: 3.1 }), store('b', {})], store('kit', {}));
    expect(card.stores[0].failures).toEqual(['overflow at 390', 'buy button contrast 3.10 < 4.5']);
    expect(card.qualityFailures).toBe(1);
  });
});

describe('quality', () => {
  it('lists every failure and ignores unsupported shopping', () => {
    expect(qualityFailures({ shopping: 'failed', shoppingError: 'no cart', overflow: { desktop: true, mobile: null }, fontsLoaded: false, missingImages: 2, buyContrast: null }))
      .toEqual(['shopping failed: no cart', 'overflow at 1280', 'fonts not loaded', '2 missing images', 'buy button not measured']);
    expect(qualityFailures({ ...clean, shopping: 'unsupported' })).toEqual([]);
  });
  it('does not ask for a buy button in a store with nothing to sell', () => {
    expect(qualityFailures({ ...clean, shopping: 'unsupported', buyContrast: null })).toEqual([]);
  });
  it('computes WCAG contrast', () => {
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([118, 118, 118], [255, 255, 255])).toBeCloseTo(4.54, 1);
  });
});

it('renders a Markdown report with thresholds, one row per surface and the quality table', () => {
  const card = scoreStores([store('a', { button: { radius: 20 } }), store('b', { button: { radius: 4 } }, { fontsLoaded: false })], store('kit', { button: { radius: 0 } }));
  const md = scorecardMarkdown(card, { title: 'Baseline', source: 'local database', createdAt: '2026-09-24' });
  expect(md).toContain('MIN_PAIR_DISTANCE = 0.25');
  expect(md).toMatch(/\| button \| 2 \| A ↔ B \| 0\.80 \|/);
  expect(md).toMatch(/\| B \| passed \| fonts not loaded \|/);
  for (const surface of ['cart', 'added', 'product', 'review', 'card', 'type', 'page']) expect(md).toContain(`| ${surface} |`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-scorecard.spec.ts`
Expected: FAIL, `Cannot find module './source-scorecard'`.

- [ ] **Step 3: Implement** `source-scorecard.ts` per the interfaces. Numbers: `a === b ? 0 : min(1, |a-b| / max(|a|,|b|))`; string vs string: equality; mixed types: 1. A surface sample with no keys counts as missing. Pairs are in store order; `closest` is the smallest distance (first wins on ties); `mean` is the mean of pair distances. `fromDefault` only when the kit sample has that surface. Report numbers with two decimals.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-scorecard.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-scorecard.ts apps/api/src/storefront-source/source-scorecard.spec.ts
git commit -m "feat(yapi): pure uniqueness scorecard: surface distances, closest pairs, kit-default distance and quality failures"
```

---

### Task 2: Browser collector and kit-default fixture

**Files:**
- Modify: `apps/api/src/storefront-source/source-visual-capture.ts` (`async function withVisualSandbox` → `export async function withVisualSandbox`)
- Create: `apps/api/src/storefront-source/source-scorecard-capture.ts`
- Test: `apps/api/src/storefront-source/source-scorecard-capture.spec.ts`

**Interfaces:**
- Consumes: `withVisualSandbox`, `probeSourceShopping` (source-visual-capture), `currentSourceRuntime` (source-runtime), `kitPath` (@pagosya/storefront-kit), Task 1 types and `contrastRatio`/`relativeLuminance`.
- Produces:
  - `collectStoreSample(input: { id: string; name: string; snapshot: SourceProjectSnapshot }, options?: { screenshots?: boolean; signal?: AbortSignal }): Promise<{ sample: StoreSample; screenshots: Array<{ name: string; image: Buffer }> }>`
  - `kitDefaultSnapshot(): Promise<SourceProjectSnapshot>` — minimal store: kit `commerce.js`, `commerce-pages.css`, kit `product.html`/`checkout.html`, a bare `index.html` with `[data-cart-open]`, `[data-pagosya-grid]`, `[data-pagosya-cart]`, three simple products with SVG images.
  - `staticMotionHooks(files): number` — occurrences of `Parallax`, `Reveal`, `Marquee`, `animate(`, `IntersectionObserver`, `@keyframes` in authored utf8 files.
  - `snapshotFromDirectory(dir): Promise<SourceProjectSnapshot>` — reads a `site/` folder (binary extensions as base64).
- Sample keys, each recorded at 1280 and 390 as `<key>` and `m.<key>`:
  - `button`: `radius, border, bgLum, transform, tracking, font, height, padRatio` (first visible `.menu-add` on the home, else `.product-detail__buy`; `from` records which).
  - `card`: `aspect, imageRadius, align, images`.
  - `cart`: `position` (`left|right|bottom|top|centered|full`), `width` (share of viewport), `radius`, `bgDelta` (luminance difference vs page).
  - `added`: `position` (3×3 grid, e.g. `bottom-right`), `width`, `height`, `radius`, `bgLum`.
  - `product`: `style` (`data-style`), `gallery` (`left|right|top|none`), `buyRadius`.
  - `review`: `columns`, `summary` (`right|left|below|above`).
  - `type`: `display`, `body`, `ratio` (h1 px / body px), `headingCase`.
  - `page`: `dna.<name>` for every `data-dna-*` on `<html>`, `motionHooks`.
  - Quality: shopping from `probeSourceShopping` (any failed → failed; any passed → passed; else unsupported), overflow per viewport, fonts loaded, missing images on the home, buy contrast (product page buy button text vs its effective background; min over viewports).

- [ ] **Step 1: Write the failing tests**

```ts
jest.setTimeout(60_000);
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectStoreSample, kitDefaultSnapshot, snapshotFromDirectory, staticMotionHooks } from './source-scorecard-capture';
import { SURFACE_NAMES, surfaceDistance } from './source-scorecard';

it('collects every surface for the kit default store, with clean quality', async () => {
  const { sample, screenshots } = await collectStoreSample({ id: 'kit', name: 'Kit default', snapshot: await kitDefaultSnapshot() }, { screenshots: true });
  expect(sample.errors).toEqual([]);
  for (const surface of SURFACE_NAMES) expect(Object.keys(sample.surfaces[surface] ?? {}).length).toBeGreaterThan(0);
  expect(sample.surfaces.button).toEqual(expect.objectContaining({ radius: expect.any(Number), height: expect.any(Number), font: expect.any(String), 'm.height': expect.any(Number) }));
  expect(sample.surfaces.cart).toEqual(expect.objectContaining({ position: 'right', 'm.width': 1 }));
  expect(sample.surfaces.added).toEqual(expect.objectContaining({ position: 'bottom-right' }));
  expect(sample.surfaces.product).toEqual(expect.objectContaining({ style: expect.any(String), gallery: expect.any(String) }));
  expect(sample.surfaces.review).toEqual(expect.objectContaining({ columns: 2, summary: expect.any(String), 'm.columns': 1 }));
  expect(sample.surfaces.page).toEqual({ motionHooks: 0 });
  expect(sample.quality).toEqual(expect.objectContaining({ shopping: 'passed', overflow: { desktop: false, mobile: false }, fontsLoaded: true, missingImages: 0 }));
  expect(sample.quality.buyContrast).toBeGreaterThan(4.5);
  expect(screenshots.map(s => s.name)).toEqual(['added-desktop', 'cart-desktop', 'added-mobile', 'cart-mobile']);
});

it('sees a restyled button and the store DNA', async () => {
  const kit = await kitDefaultSnapshot();
  const styled = { ...kit, files: kit.files.map(f => f.path === 'index.html' ? { ...f, content: f.content.replace('</head>', '<style>.menu-item .menu-add[data-add]{border-radius:999px!important;text-transform:uppercase;letter-spacing:.2em;height:56px!important;border:3px solid #000!important}</style></head>') }
    : f.path === 'config.js' ? { ...f, content: f.content.replace('"demo":true', '"demo":true,"dna":{"version":1,"button":"pill","cart":"sheet"}') } : f) };
  const [base, restyled] = await Promise.all([kit, styled].map((snapshot, i) => collectStoreSample({ id: String(i), name: String(i), snapshot })));
  expect(surfaceDistance(base.sample.surfaces.button!, restyled.sample.surfaces.button!)).toBeGreaterThan(0.25);
  expect(restyled.sample.surfaces.page).toEqual(expect.objectContaining({ 'dna.button': 'pill', 'dna.cart': 'sheet' }));
});

it('counts motion hooks in authored files only', () => {
  expect(staticMotionHooks([
    { path: 'index.html', content: '<style>@keyframes a{} @keyframes b{}</style><script>new IntersectionObserver(()=>{});el.animate([])</script>', encoding: 'utf8' },
    { path: 'components/home.tsx', content: '<Parallax><Reveal/></Parallax><Marquee/>', encoding: 'utf8' },
    { path: 'motion.js', content: 'IntersectionObserver animate(', encoding: 'utf8' },
    { path: '_compiled/home.js', content: 'Parallax Reveal', encoding: 'utf8' },
  ])).toBe(7);
});

it('reads an exported site folder, binaries as base64', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'scorecard-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<h1>x</h1>');
  await writeFile(join(dir, 'assets', 'a.png'), Buffer.from([137, 80, 78, 71]));
  const snapshot = await snapshotFromDirectory(dir);
  expect(snapshot.files).toEqual(expect.arrayContaining([
    { path: 'index.html', content: '<h1>x</h1>', encoding: 'utf8' },
    { path: 'assets/a.png', content: Buffer.from([137, 80, 78, 71]).toString('base64'), encoding: 'base64' },
  ]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest storefront-source/source-scorecard-capture.spec.ts`
Expected: FAIL, `Cannot find module './source-scorecard-capture'`.

- [ ] **Step 3: Implement.** Export `withVisualSandbox`. In the collector: parse `config.js` as `probeSourceShopping` does, render `currentSourceRuntime(snapshot)`, set `demo: true`, open one sandbox per viewport (probe mode, so `?id=` product URLs load). Per viewport: home (type, card, button, page DNA, overflow, fonts, missing images) → click the first enabled `[data-add]` outside the cart → wait for `.cart-added[data-visible=true]` (≤ 3 s), measure + screenshot → open the cart by clicking the first `[data-cart-open]` in page script (hidden mobile triggers included) → wait `dialog.cart-drawer[open]`, measure + screenshot, close → product page for the first product (select first option in each group; add there if the home had no add button) → checkout page, wait `.checkout-review`, measure. Colors are read in the page through a 1×1 canvas (handles `color-mix`, `oklch`, etc.) and composited over ancestors to an opaque effective background. Every step in its own `try`, errors pushed as `<viewport> <surface>: <message>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest storefront-source/source-scorecard-capture.spec.ts storefront-source/source-visual-capture.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/source-visual-capture.ts apps/api/src/storefront-source/source-scorecard-capture.ts apps/api/src/storefront-source/source-scorecard-capture.spec.ts
git commit -m "feat(yapi): scorecard collector samples every commerce surface at 1280 and 390 inside the visual sandbox"
```

---

### Task 3: Runner

**Files:**
- Create: `apps/api/scripts/uniqueness-scorecard.ts`

**Interfaces:**
- Consumes: Task 1 (`scoreStores`, `scorecardMarkdown`), Task 2 (`collectStoreSample`, `kitDefaultSnapshot`, `snapshotFromDirectory`), `PrismaClient` (read-only), `withSeededDna` when it exists.
- CLI: `cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts [--limit 12] [--stores id1,id2] [--from-dir <path>] [--out ../../tmp/scorecard/<date>]`.

- [ ] **Step 1: Write the runner.** Load `.env` with `process.loadEnvFile`, refuse a non-localhost `DATABASE_URL`, select the latest `StoreSourceVersion` per `StoreSourceProject` (ordered by `updatedAt desc`, `--limit`, or `--stores`), inline `/v1/uploads/*` images the merchant owns from the uploads folder (read-only, same idea as `SourceVisualReviewService.hydrate`), collect the kit default first, then every store sequentially (one failure is recorded, the run continues), write `scorecard.json` (samples + score), `SCORECARD.md` and `screenshots/<store>-<name>.jpg`.

- [ ] **Step 2: Smoke it on two stores**

Run: `cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --limit 2 --out ../../tmp/scorecard/smoke`
Expected: prints one JSON line per store and `wrote …/SCORECARD.md`; the file has 8 surface rows.

- [ ] **Step 3: Typecheck and lint**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json` → no output. `npx eslint apps/api/scripts/uniqueness-scorecard.ts apps/api/src/storefront-source/source-scorecard*.ts` (repo root) → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/scripts/uniqueness-scorecard.ts
git commit -m "feat(yapi): uniqueness scorecard runner over local stores or exported sites, read-only"
```

---

### Task 4: Verify and record the baseline

- [ ] **Step 1:** `cd apps/api && npx jest storefront-source --runInBand` → all suites pass. `npx tsc --noEmit -p tsconfig.json` → clean.
- [ ] **Step 2:** `cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts --limit 12 --out ../../tmp/scorecard/baseline-2026-09-24` → `SCORECARD.md` written.
- [ ] **Step 3:** Copy it to `docs/research/scorecard-baseline-2026-09-24.md` with a short header (store set, date, commit), then:

```bash
git add docs/research/scorecard-baseline-2026-09-24.md
git commit -m "docs(research): uniqueness scorecard baseline before sub-projects 4-7"
```
