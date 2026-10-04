# YAPI Page Grammar, Real Copy and Component Vocabulary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every generated store being the same page — by generating the skeleton instead of asking for it, writing copy from the real catalogue instead of from a brief, and giving both YAPI and the merchant a far wider vocabulary of buttons, icons and components.

**Architecture:** Three independent mechanisms that share one pipeline. (1) `drawPageStructure()` generates an ordered skeleton from drawn parameters under a grammar, before the model is called; the model fills slots by id and may veto, never add or reorder. (2) The prompt receives a real product digest and aggregate catalogue facts instead of a list of names, and the "catalog block only" framing is deleted. (3) `SketchStyle` grows from 5 keys to 12, every one rendered in CSS, drawn by the direction, and exposed to the merchant in the Boceto's look panel.

**Tech Stack:** TypeScript, NestJS, Prisma, Jest, Playwright (browser tests via the existing `withVisualSandbox`), vanilla DOM for the merchant Studio.

**Spec:** `docs/superpowers/specs/2026-10-04-yapi-page-grammar-and-real-copy-design.md`

## Global Constraints

- Everything in the repair path is **total**: any response, including none, yields a usable sketch. Never throw.
- Structure enforcement runs on new generations and full redesigns ONLY — never on a chat edit, which must not have bands removed under the merchant. It is opt-in at the call site, never triggered by a field's presence.
- A sketch saved before this change must render byte-identically to today.
- Every drop, veto and refusal appends a Spanish note surfaced through `autoRepairs`, matching the existing style in `repairSketch` (e.g. `'catálogo repetido; se conservó el primero'`).
- A new `SketchStyle` key must be added in FOUR places or it is half-built: the `SketchStyle` type (`sketch-schema.ts:45`), `SKETCH_STYLE_OPTIONS` (:46), `DEFAULT_SKETCH_STYLE` (:53), and `STYLE_CONTROLS` (`apps/merchant-studio/src/source-boceto.ts:29`). The Studio keeps its own `DEFAULT_STYLE` copy at :36 — update both.
- Merchant-facing copy is Spanish (rioplatense, voseo), matching the existing labels: `Esquinas`, `Botones`, `Tarjetas`, `Cabecera`, `Pie`.
- Icons come from Lucide at `assets/icons/NAME.svg`; any of the 2000+ names works, and `SOURCE_ICON_NAMES` (`source-asset-library.ts:14`) is the curated 24. Never a CDN or an import.
- Test command that works here: `sh -c 'cd apps/api && npx jest <paths>'`. Do NOT use `--rootDir apps/api` from the repo root — it sweeps `apps/api/dist` and breaks `@pagosya/shared-types` resolution. Studio tests: `sh -c 'cd apps/merchant-studio && npx vitest run <paths>'` (check the package's actual runner first and use it).
- Never run two jest processes at once on this machine; a stale run produces phantom failures that cost an hour last time.
- `pagosYaWeb` is a separate working copy: never commit there, never run `pnpm` there.

## Review Focus

1. **A chat edit on a sketch that carries a structure** — the merchant's bands must survive untouched; enforcement is gated on the call site, not the field. (Task 5)
2. **A store with zero products and zero photos** — the draw must still produce a legal, short, honest page rather than an empty one or a thirteen-band page about nothing. (Tasks 1, 3)
3. **A catalogue of 500 items** — the digest must stay bounded and the prompt must not blow the token budget. (Task 8)
4. **A model response that fills no slots at all, or only invented ids** — the page must still come out with a catalog and a footer. (Task 5)
5. **A sketch saved before any of this exists** — no structure, no new style keys — must render exactly as today, and the merchant's look panel must not show undefined values. (Tasks 5, 11)

---

### Task 1: Count what a store actually has

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-substance.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-substance.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type StoreSubstance = { products: number; photos: number; categories: number; briefWords: number }`, `countSubstance(input): StoreSubstance`, and `substanceCaps(s: StoreSubstance): { maxLength: number; forbid: SketchBlock['type'][]; maxMedia: number }`. Tasks 2 and 3 consume both.

- [ ] **Step 1: Write the failing test**

```ts
import { countSubstance, substanceCaps } from './sketch-substance';

it('counts what the store actually has', () => {
  const s = countSubstance({ products: [{ name: 'Pan', category: 'Panadería' }, { name: 'Torta', category: 'Dulces' }], photos: ['a.jpg'], brief: { businessType: 'Panadería de barrio', audience: 'Vecinos' } });
  expect(s).toEqual({ products: 2, photos: 1, categories: 2, briefWords: expect.any(Number) });
  expect(s.briefWords).toBeGreaterThan(3);
});

// Review Focus 2: the 2026-10-04 store had zero products and still drew thirteen bands.
it('caps an empty store to a short page with no commerce bands', () => {
  const caps = substanceCaps({ products: 0, photos: 0, categories: 0, briefWords: 4 });
  expect(caps.maxLength).toBeLessThanOrEqual(8);
  expect(caps.forbid).toEqual(expect.arrayContaining(['catalog', 'collections', 'gallery']));
  expect(caps.maxMedia).toBe(0);
});

it('lets a full store have the whole page', () => {
  const caps = substanceCaps({ products: 40, photos: 6, categories: 5, briefWords: 60 });
  expect(caps.maxLength).toBe(14);
  expect(caps.forbid).toEqual([]);
  expect(caps.maxMedia).toBe(5);
});

it('forbids a gallery to a store with a single photo', () => {
  expect(substanceCaps({ products: 10, photos: 1, categories: 1, briefWords: 40 }).forbid).toContain('gallery');
});

it('keeps a thin brief to a shorter page', () => {
  expect(substanceCaps({ products: 10, photos: 3, categories: 2, briefWords: 5 }).maxLength).toBeLessThanOrEqual(9);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-substance.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the module**

```ts
import type { SketchBlock } from './sketch-schema';

/** What a store actually has to say. The page length is derived from this rather than from an energy
 * adjective, because the store generated 2026-10-04 15:29 had ZERO products and still drew thirteen bands —
 * which can only be filled with copy about nothing. A store with little to say gets a short page. */
export type StoreSubstance = { products: number; photos: number; categories: number; briefWords: number };

export function countSubstance(input: { products?: Array<{ name?: string; category?: string }>; photos?: unknown[]; brief?: unknown }): StoreSubstance {
  const products = input.products ?? [];
  const categories = new Set(products.map(item => item?.category).filter((value): value is string => typeof value === 'string' && value.trim() !== ''));
  const briefWords = JSON.stringify(input.brief ?? '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').split(/\s+/).filter(Boolean).length;
  return { products: products.length, photos: (input.photos ?? []).length, categories: categories.size, briefWords };
}

export function substanceCaps(s: StoreSubstance): { maxLength: number; forbid: SketchBlock['type'][]; maxMedia: number } {
  const forbid: SketchBlock['type'][] = [];
  if (!s.products) forbid.push('catalog', 'collections');
  else if (s.categories < 2) forbid.push('collections');
  if (s.photos < 2) forbid.push('gallery');
  // Each of these is a reason the page has less to carry; they stack.
  let maxLength = 14;
  if (!s.products) maxLength = Math.min(maxLength, 8);
  if (s.briefWords < 12) maxLength = Math.min(maxLength, 9);
  if (s.photos < 2) maxLength = Math.min(maxLength, 11);
  return { maxLength: Math.max(6, maxLength), forbid, maxMedia: Math.min(5, s.photos) };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-substance.spec.ts'`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-substance.ts apps/api/src/storefront-source/sketch/sketch-substance.spec.ts
git commit -m "feat(yapi): a store's page length comes from what it actually has to say"
```

---

### Task 2: Draw a page skeleton

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-structure-draw.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts`

**Interfaces:**
- Consumes: `StoreSubstance`, `substanceCaps` from Task 1; `SketchSize`, `SketchWidth`, `SketchBlock` from `./sketch-schema`.
- Produces: `type PageSlot = { id: string; type: SketchBlock['type']; size: SketchSize; width: SketchWidth; media: boolean }`, `type PageStructure = { slots: PageSlot[]; params: PageParams }`, `drawPageStructure(substance, random?)`. Tasks 3, 4, 5 and 6 all consume these.

- [ ] **Step 1: Write the failing test**

```ts
import { drawPageStructure } from './sketch-structure-draw';
import { substanceCaps } from './sketch-substance';

/** A seeded generator, so a draw is reproducible and a failure is debuggable. */
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };

it('is deterministic for a seed, and different across seeds', () => {
  const a = drawPageStructure(full, seeded(1));
  const b = drawPageStructure(full, seeded(1));
  const c = drawPageStructure(full, seeded(2));
  expect(a.slots).toEqual(b.slots);
  expect(c.slots).not.toEqual(a.slots);
});

it('gives every slot an id, a size and a width', () => {
  const { slots } = drawPageStructure(full, seeded(3));
  expect(slots.length).toBeGreaterThanOrEqual(6);
  for (const slot of slots) {
    expect(slot.id).toMatch(/^s\d+$/);
    expect(['s', 'm', 'l', 'xl']).toContain(slot.size);
    expect(['bleed', 'wide', 'narrow', 'offset-left', 'offset-right']).toContain(slot.width);
  }
  expect(new Set(slots.map(slot => slot.id)).size).toBe(slots.length);
});

it('always ends on a footer and never opens on one', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));
    expect(slots[slots.length - 1].type).toBe('footer');
    expect(slots.filter(slot => slot.type === 'footer')).toHaveLength(1);
  }
});

// Review Focus 2: nothing to sell, nothing to show.
it('draws a short page with no commerce bands for an empty store', () => {
  const empty = { products: 0, photos: 0, categories: 0, briefWords: 4 };
  for (let seed = 1; seed <= 15; seed++) {
    const { slots } = drawPageStructure(empty, seeded(seed));
    expect(slots.length).toBeLessThanOrEqual(substanceCaps(empty).maxLength);
    expect(slots.map(s => s.type)).not.toContain('catalog');
    expect(slots.map(s => s.type)).not.toContain('collections');
    expect(slots.filter(s => s.media)).toHaveLength(0);
  }
});

it('carries exactly one catalog when the store has products', () => {
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(full, seeded(seed)).slots.filter(s => s.type === 'catalog')).toHaveLength(1);
  }
});

it('never gives more media slots than the store has photos', () => {
  const thin = { products: 10, photos: 2, categories: 2, briefWords: 40 };
  for (let seed = 1; seed <= 25; seed++) {
    expect(drawPageStructure(thin, seeded(seed)).slots.filter(s => s.media).length).toBeLessThanOrEqual(2);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-draw.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the draw**

```ts
import { substanceCaps, type StoreSubstance } from './sketch-substance';
import type { SketchBlock, SketchSize, SketchWidth } from './sketch-schema';

export type PageSlot = { id: string; type: SketchBlock['type']; size: SketchSize; width: SketchWidth; media: boolean };
export type PageRhythm = 'crescendo' | 'alternating' | 'plateau-spikes' | 'calm';
export type PageParams = { length: number; opening: SketchBlock['type']; catalogAt: number; accentEvery: number | null; rhythm: PageRhythm; mediaBudget: number };
export type PageStructure = { slots: PageSlot[]; params: PageParams };

/** The page skeleton, generated before the model is called (spec 2026-10-04-page-grammar-and-real-copy).
 * It replaces a prose "structure" line the model demonstrably ignored: handed one of six grammars it produced
 * its own 13-block modal spine every time. There is nothing here for it to ignore — it receives slots and
 * fills them. Widening the variety means adding a parameter, not writing a seventh archetype. */

/** Bands that carry a page's argument. */
const EDITORIAL: SketchBlock['type'][] = ['hero', 'split', 'story', 'gallery'];
/** Thin coloured strips. Two of these touching reads as a mistake, so the grammar keeps them apart. */
export const ACCENT: SketchBlock['type'][] = ['announce', 'marquee', 'banner'];
const SUPPORT: SketchBlock['type'][] = ['steps', 'reviews', 'faq'];
const COMMERCE: SketchBlock['type'][] = ['catalog', 'collections'];
/** Types a page may hold at most once. `catalog` and `footer` are handled separately: exactly one. */
export const ONCE_ONLY: SketchBlock['type'][] = ['announce', 'newsletter', 'faq', 'collections', 'hero', 'story', 'gallery', 'steps', 'reviews'];
const SIZES: SketchSize[] = ['s', 'm', 'l', 'xl'];
const WIDTHS: SketchWidth[] = ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'];
/** Types that can carry a photo; `media` marks the slot so the prompt can spend the photo budget. */
const MEDIA_CAPABLE: SketchBlock['type'][] = ['hero', 'split', 'story', 'gallery', 'newsletter', 'collections'];

const RHYTHMS: PageRhythm[] = ['crescendo', 'alternating', 'plateau-spikes', 'calm'];

function sizeFor(rhythm: PageRhythm, index: number, length: number): SketchSize {
  const position = length > 1 ? index / (length - 1) : 0;
  switch (rhythm) {
    case 'crescendo': return SIZES[Math.min(3, Math.floor(position * 4))];
    case 'alternating': return index % 2 ? 'm' : 'l';
    case 'plateau-spikes': return index % 4 === 1 ? 'xl' : 'm';
    default: return position < 0.2 ? 'l' : 'm';
  }
}

export function drawPageStructure(substance: StoreSubstance, random: () => number = Math.random): PageStructure {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const caps = substanceCaps(substance);
  const allowed = (type: SketchBlock['type']) => !caps.forbid.includes(type);

  const length = Math.max(6, Math.min(caps.maxLength, 6 + Math.floor(random() * 9)));
  const opening = pick([...EDITORIAL, ...ACCENT].filter(allowed));
  const params: PageParams = {
    length, opening,
    catalogAt: 0.15 + random() * 0.7,
    accentEvery: pick([3, 4, 5, null]),
    rhythm: pick(RHYTHMS),
    mediaBudget: Math.min(caps.maxMedia, 1 + Math.floor(random() * 5)),
  };

  // Body types, in order: the opening, then a pool that respects the once-only rule and the substance caps.
  const pool = [...EDITORIAL, ...SUPPORT, ...COMMERCE, 'newsletter' as const].filter(allowed);
  const used = new Map<SketchBlock['type'], number>();
  const take = (type: SketchBlock['type']) => used.set(type, (used.get(type) ?? 0) + 1);
  const spent = (type: SketchBlock['type']) => ONCE_ONLY.includes(type) && (used.get(type) ?? 0) >= 1;

  const body: SketchBlock['type'][] = [];
  if (allowed(opening)) { body.push(opening); take(opening); }
  const bodyTarget = length - 1; // the footer takes the last slot
  while (body.length < bodyTarget) {
    const accentDue = params.accentEvery !== null && body.length > 0 && body.length % params.accentEvery === 0;
    const wantAccent = accentDue && !ACCENT.includes(body[body.length - 1]);
    const choices = (wantAccent ? ACCENT : pool).filter(type => allowed(type) && !spent(type) && !(ACCENT.includes(type) && ACCENT.includes(body[body.length - 1])));
    if (!choices.length) break;
    const type = pick(choices);
    body.push(type); take(type);
  }

  // Exactly one catalog, placed at catalogAt, when the store has something to sell.
  if (allowed('catalog')) {
    const existing = body.indexOf('catalog');
    if (existing !== -1) body.splice(existing, 1);
    body.splice(Math.max(0, Math.min(body.length, Math.round(params.catalogAt * body.length))), 0, 'catalog');
  }
  // `announce` is a strip above the page or it is nothing.
  const announceAt = body.indexOf('announce');
  if (announceAt > 0) { body.splice(announceAt, 1); body.unshift('announce'); }

  const types = [...body.slice(0, Math.max(0, length - 1)), 'footer' as const];
  let lastWidth: SketchWidth | null = null;
  let media = 0;
  const slots = types.map((type, index) => {
    const width = pick(WIDTHS.filter(candidate => candidate !== lastWidth));
    lastWidth = width;
    const canCarry = MEDIA_CAPABLE.includes(type) && media < params.mediaBudget;
    if (canCarry) media++;
    return { id: `s${index + 1}`, type, size: type === 'footer' ? 'm' : sizeFor(params.rhythm, index, types.length), width, media: canCarry } as PageSlot;
  });
  return { slots, params };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-draw.spec.ts'`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-structure-draw.ts apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts
git commit -m "feat(yapi): the page skeleton is drawn from parameters instead of asked for in prose"
```

---

### Task 3: The grammar, proved over many draws

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-structure-draw.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `violations(structure: PageStructure, substance: StoreSubstance): string[]` — the grammar as a checkable predicate, exported so the tests and the plan's later distribution test share one definition of "legal".

- [ ] **Step 1: Write the failing property test**

```ts
import { drawPageStructure, violations } from './sketch-structure-draw';

const STORES = [
  { name: 'full', s: { products: 40, photos: 6, categories: 5, briefWords: 60 } },
  { name: 'empty', s: { products: 0, photos: 0, categories: 0, briefWords: 4 } },
  { name: 'one-photo', s: { products: 12, photos: 1, categories: 1, briefWords: 30 } },
  { name: 'service', s: { products: 0, photos: 3, categories: 0, briefWords: 40 } },
];

it.each(STORES)('draws a legal page every time for a $name store', ({ s }) => {
  const broken: string[] = [];
  for (let seed = 1; seed <= 200; seed++) {
    const structure = drawPageStructure(s, seeded(seed));
    for (const problem of violations(structure, s)) broken.push(`seed ${seed}: ${problem}`);
  }
  expect(broken).toEqual([]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-draw.spec.ts'`
Expected: FAIL — `violations` is not exported. It may also fail afterwards on real rule breaches; that is the point of the test.

- [ ] **Step 3: Write the predicate**

Append to `sketch-structure-draw.ts`:

```ts
/** The grammar, as a predicate. Rules, not a list of approved pages — this is what makes the space
 * combinatorial. Exported so the draw's tests and the distribution test agree on what "legal" means. */
export function violations(structure: PageStructure, substance: StoreSubstance): string[] {
  const problems: string[] = [];
  const { slots } = structure;
  const caps = substanceCaps(substance);
  const types = slots.map(slot => slot.type);

  if (slots.length < 6 || slots.length > caps.maxLength) problems.push(`length ${slots.length} outside 6..${caps.maxLength}`);
  if (types[types.length - 1] !== 'footer') problems.push('last slot is not a footer');
  if (types.filter(type => type === 'footer').length !== 1) problems.push('not exactly one footer');
  if (substance.products > 0 && types.filter(type => type === 'catalog').length !== 1) problems.push('not exactly one catalog');
  for (const banned of caps.forbid) if (types.includes(banned)) problems.push(`forbidden type present: ${banned}`);
  for (const type of ONCE_ONLY) if (types.filter(candidate => candidate === type).length > 1) problems.push(`repeated once-only type: ${type}`);
  if (types.includes('announce') && types.indexOf('announce') !== 0) problems.push('announce is not the first slot');
  if (new Set(slots.map(slot => slot.id)).size !== slots.length) problems.push('duplicate slot ids');
  if (slots.filter(slot => slot.media).length > caps.maxMedia) problems.push('media slots exceed the photo count');

  for (let i = 1; i < slots.length; i++) {
    if (ACCENT.includes(types[i]) && ACCENT.includes(types[i - 1])) problems.push(`accent bands adjacent at ${i}`);
    if (slots[i].width === slots[i - 1].width) problems.push(`repeated width at ${i}`);
  }
  for (let i = 2; i < slots.length; i++) {
    if (slots[i].media && slots[i - 1].media && slots[i - 2].media) problems.push(`three media slots in a row at ${i}`);
  }
  return problems;
}
```

- [ ] **Step 4: Run it, and fix the draw until it is clean**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-draw.spec.ts'`
Expected: PASS. If a rule fails, fix `drawPageStructure` — not the predicate, and never the test. The likely offenders and their fixes:
- *repeated width*: the `WIDTHS.filter(candidate => candidate !== lastWidth)` guard is already there; check the footer slot, which is drawn through the same path.
- *three media in a row*: add a check against the two previous slots when setting `canCarry`.
- *accent bands adjacent*: the catalog insertion in Task 2 can drop a catalog between two accents or move one next to another — re-check adjacency after the splice and swap the offending slot with its neighbour.
- *length below 6 after the pool runs dry*: when `choices` is empty before `bodyTarget`, top up from the types still allowed and not spent, and if none remain, accept the shorter page and relax the floor to `max(4, …)` in both the draw and the predicate.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-structure-draw.ts apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts
git commit -m "feat(yapi): the page grammar holds across two hundred draws for four kinds of store"
```

---

### Task 4: Prove one habitual spine becomes many pages

**Files:**
- Test: `apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts`

**Interfaces:**
- Consumes: `drawPageStructure`, `violations`. Produces no API — this is the evidence the defect is gone.

- [ ] **Step 1: Write the distribution test**

```ts
// This is the test that would have caught the original defect: it fails if the generator has a favourite.
it('draws fifty structures and nearly all of them differ', () => {
  const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
  const spines = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) spines.add(drawPageStructure(full, seeded(seed)).slots.map(slot => slot.type).join('>'));
  expect(spines.size).toBeGreaterThanOrEqual(45);
});

// The exact spine the model produced for every store before this work, verbatim from the 2026-10-04 15:29 store.
const MODAL_SPINE = 'announce>hero>catalog>collections>split>steps>story>reviews>marquee>faq>banner>newsletter>footer';

it('does not keep landing on the spine the model used to produce', () => {
  const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
  let hits = 0;
  for (let seed = 1; seed <= 200; seed++) if (drawPageStructure(full, seeded(seed)).slots.map(s => s.type).join('>') === MODAL_SPINE) hits++;
  expect(hits).toBeLessThanOrEqual(1);
});

it('varies the shape of the page, not only its block list', () => {
  const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
  const shapes = new Set<string>();
  for (let seed = 1; seed <= 50; seed++) {
    const { slots } = drawPageStructure(full, seeded(seed));
    shapes.add(slots.map(slot => `${slot.size}/${slot.width}`).join(' '));
  }
  expect(shapes.size).toBeGreaterThanOrEqual(45);
});
```

- [ ] **Step 2: Run it**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-draw.spec.ts'`
Expected: PASS. If distinctness is below the threshold the parameter ranges are too narrow — widen `length`, `rhythm` or the opening pool. Do not lower the threshold.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-structure-draw.spec.ts
git commit -m "test(yapi): fifty draws make at least forty-five different pages"
```

---

### Task 5: Fill, veto and enforce in repairSketch

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-structure-fill.ts`
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (`StoreSketch` at :62, `repairSketch` at :265, and its structural tail — the block beginning `// Size: a page has at most 20 blocks`)
- Modify: `apps/api/src/storefront-source/sketch/index.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-structure-fill.spec.ts`

**Interfaces:**
- Consumes: `PageSlot`, `PageStructure`, `ACCENT` from Task 2; `SketchBlock`, `SketchContext` from `./sketch-schema`.
- Produces: `fillStructure(blocks: SketchBlock[], structure: PageStructure, ctx: SketchContext): { blocks: SketchBlock[]; notes: string[] }`, and `repairSketch(input, ctx, defaults?: { style?: SketchStyle; structure?: PageStructure })`. `StoreSketch` gains `structure?: PageStructure`. Task 6 passes the structure in.

- [ ] **Step 1: Write the failing test**

```ts
import { fillStructure } from './sketch-structure-fill';
import { drawPageStructure } from './sketch-structure-draw';
import type { SketchBlock } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['a.jpg'] };
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const full = { products: 40, photos: 6, categories: 5, briefWords: 60 };
const structure = () => drawPageStructure(full, seeded(7));
/** A response block: it names the slot it fills. */
const filled = (id: string, type: SketchBlock['type']) => ({ id, type } as SketchBlock);

it('keeps a block that fills a real slot, in the slot order', () => {
  const s = structure();
  const response = [...s.slots].reverse().map(slot => filled(slot.id, slot.type));
  const { blocks } = fillStructure(response, s, ctx);
  expect(blocks.map(block => block.id)).toEqual(s.slots.map(slot => slot.id));
});

// This is what stops the model appending its habitual spine.
it('drops a block whose id matches no slot', () => {
  const s = structure();
  const response = [...s.slots.map(slot => filled(slot.id, slot.type)), filled('invented', 'marquee'), filled('also-invented', 'faq')];
  const { blocks, notes } = fillStructure(response, s, ctx);
  expect(blocks).toHaveLength(s.slots.length);
  expect(notes.join(' ')).toMatch(/no estaba en la estructura|se descartó/);
});

it('treats a slot nobody filled as a veto and closes the page up', () => {
  const s = structure();
  const skipped = s.slots.find(slot => !['catalog', 'footer'].includes(slot.type))!;
  const response = s.slots.filter(slot => slot.id !== skipped.id).map(slot => filled(slot.id, slot.type));
  const { blocks } = fillStructure(response, s, ctx);
  expect(blocks.map(block => block.id)).not.toContain(skipped.id);
  expect(blocks).toHaveLength(s.slots.length - 1);
});

it('refuses to let the catalog or the footer be vetoed', () => {
  const s = structure();
  const response = s.slots.filter(slot => !['catalog', 'footer'].includes(slot.type)).map(slot => filled(slot.id, slot.type));
  const { blocks } = fillStructure(response, s, ctx);
  expect(blocks.map(block => block.type)).toContain('catalog');
  expect(blocks[blocks.length - 1].type).toBe('footer');
});

it('stops the model vetoing its way back to a short habitual page', () => {
  const s = structure();
  const { blocks, notes } = fillStructure([], s, ctx);
  // At most a third may be dropped; the rest are filled with defaults.
  expect(blocks.length).toBeGreaterThanOrEqual(s.slots.length - Math.floor(s.slots.length / 3));
  expect(notes.join(' ')).toMatch(/demasiad/i);
});

// Review Focus 4: nothing usable came back at all.
it('still produces a catalog and a footer from an empty response', () => {
  const s = structure();
  const { blocks } = fillStructure([], s, ctx);
  expect(blocks.map(block => block.type)).toContain('catalog');
  expect(blocks[blocks.length - 1].type).toBe('footer');
});

it('repairs an adjacency that a veto created', () => {
  // Build a structure by hand so two accents end up adjacent once the slot between them is vetoed.
  const s = { params: {} as any, slots: [
    { id: 's1', type: 'marquee' as const, size: 'm' as const, width: 'bleed' as const, media: false },
    { id: 's2', type: 'story' as const, size: 'l' as const, width: 'narrow' as const, media: false },
    { id: 's3', type: 'banner' as const, size: 'm' as const, width: 'wide' as const, media: false },
    { id: 's4', type: 'catalog' as const, size: 'm' as const, width: 'bleed' as const, media: false },
    { id: 's5', type: 'footer' as const, size: 'm' as const, width: 'bleed' as const, media: false },
  ] };
  const { blocks } = fillStructure([filled('s1', 'marquee'), filled('s3', 'banner'), filled('s4', 'catalog'), filled('s5', 'footer')], s, ctx);
  const types = blocks.map(block => block.type);
  for (let i = 1; i < types.length; i++) expect(['announce', 'marquee', 'banner'].includes(types[i]) && ['announce', 'marquee', 'banner'].includes(types[i - 1])).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-fill.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the fill**

Create `sketch-structure-fill.ts`:

```ts
import { ACCENT, type PageSlot, type PageStructure } from './sketch-structure-draw';
import type { SketchBlock, SketchContext } from './sketch-schema';

/** A plain block of a given type, for a slot the model declined to fill but that the page cannot do without.
 * Deliberately bare: an inserted block is a repair, not a design. */
function defaultBlock(slot: PageSlot, ctx: SketchContext): SketchBlock {
  const base = { id: slot.id, bg: 'paper' as const, size: slot.size };
  switch (slot.type) {
    case 'catalog': return { ...base, type: 'catalog', kicker: '', title: 'Nuestros productos', seeAll: '', badges: [], stripLeft: '', stripRight: '', cardRatio: '4-3', cardDesc: true, cardAdd: true };
    case 'footer': return { ...base, type: 'footer', tagline: '', wordmark: 'giant', bg: 'deep' };
    case 'split': return { ...base, type: 'split', kicker: '', headline: ctx.storeName, body: '', cta: 'Ver productos', cta2: '', href: '', pills: [], stats: [], boxes: [], sticker: '', tag: '' };
    case 'marquee': return { ...base, type: 'marquee', items: [ctx.storeName] };
    case 'banner': return { ...base, type: 'banner', kicker: '', headline: ctx.storeName, cta: 'Ver productos', href: '' };
    default: return { ...base, type: 'hero', variant: 'photo-right', headline: ctx.storeName, sub: '', cta: 'Ver productos', cta2: '', trust: '', badge: '', note: '', sticker: '', caption: '' };
  }
}

/** The slots the page cannot lose, whatever the model says. */
const UNVETOABLE: SketchBlock['type'][] = ['catalog', 'footer'];

/** Puts the model's blocks into the drawn skeleton. The model fills slots by id: anything it invents is
 * dropped, which is what stops it appending its habitual spine, and a slot it leaves empty is a veto. The
 * veto is capped, because a model that vetoes freely talks its way back to the short page it always wrote. */
export function fillStructure(blocks: SketchBlock[], structure: PageStructure, ctx: SketchContext): { blocks: SketchBlock[]; notes: string[] } {
  const notes: string[] = [];
  const bySlot = new Map<string, SketchBlock>();
  let invented = 0;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    const slot = structure.slots.find(candidate => candidate.id === block?.id);
    if (!slot) { invented++; continue; }
    if (!bySlot.has(slot.id)) bySlot.set(slot.id, block);
  }
  if (invented) notes.push(`${invented} bloque(s) no estaban en la estructura de la página; se descartaron`);

  const vetoed = structure.slots.filter(slot => !bySlot.has(slot.id) && !UNVETOABLE.includes(slot.type));
  const allowance = Math.floor(structure.slots.length / 3);
  const honoured = new Set(vetoed.slice(0, allowance).map(slot => slot.id));
  if (vetoed.length > allowance) notes.push(`se dejaron demasiadas bandas vacías (${vetoed.length}); se completaron ${vetoed.length - allowance} con contenido base`);
  if (honoured.size) notes.push(`${honoured.size} banda(s) quedaron sin contenido y se quitaron`);

  const out: SketchBlock[] = [];
  for (const slot of structure.slots) {
    if (honoured.has(slot.id)) continue;
    const given = bySlot.get(slot.id);
    // The slot owns the shape; the model owns the content. A block that came back with the wrong type for
    // its slot keeps its content but is rendered as the slot's type is not possible, so it is replaced.
    out.push(given && given.type === slot.type ? given : defaultBlock(slot, ctx));
  }

  // A veto can leave two accent strips touching, which the grammar forbids by construction.
  for (let i = 1; i < out.length; i++) {
    if (!ACCENT.includes(out[i].type) || !ACCENT.includes(out[i - 1].type)) continue;
    out.splice(i, 1);
    notes.push('dos bandas de acento quedaron pegadas al vaciarse una banda; se quitó una');
    i--;
  }
  return { blocks: out, notes };
}
```

- [ ] **Step 4: Run the fill tests**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-structure-fill.spec.ts'`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the repairSketch integration test**

Append to `sketch-schema.spec.ts`:

```ts
import { drawPageStructure } from './sketch-structure-draw';

const seeded2 = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const structCtx = { storeName: 'salv', purpose: 'shop' as const, photos: ['a.jpg'] };
const aStructure = () => drawPageStructure({ products: 40, photos: 6, categories: 5, briefWords: 60 }, seeded2(11));

it('holds a new sketch to the structure it was drawn', () => {
  const structure = aStructure();
  const { sketch } = repairSketch({ blocks: [{ id: 'invented', type: 'marquee', items: ['x'] }] }, structCtx, { structure });
  expect(sketch.blocks.map(b => b.id)).not.toContain('invented');
  expect(sketch.structure).toBeDefined();
});

// Review Focus 1: a chat edit passes no structure, and its blocks must survive whole.
it('leaves an edited sketch alone when no structure is passed', () => {
  const { sketch } = repairSketch({ blocks: [
    { id: 'h', type: 'hero', headline: 'Hola' },
    { id: 'm', type: 'marquee', items: ['x'] },
  ] }, structCtx);
  expect(sketch.blocks.map(b => b.id)).toEqual(['h', 'm']);
  expect(sketch.structure).toBeUndefined();
});

// Review Focus 5: a sketch saved before any of this existed.
it('repairs a pre-structure sketch exactly as it did before', () => {
  const input = { blocks: [{ id: 'h', type: 'hero', headline: 'Hola' }, { id: 'm', type: 'marquee', items: ['a'] }] };
  expect(repairSketch(input, structCtx).sketch).toEqual(repairSketch(input, structCtx).sketch);
  expect(repairSketch(input, structCtx).sketch.structure).toBeUndefined();
});
```

- [ ] **Step 6: Wire it into repairSketch**

In `sketch-schema.ts`, import the two modules and widen the type and signature:

```ts
import { fillStructure } from './sketch-structure-fill';
import type { PageStructure } from './sketch-structure-draw';
```

```ts
export type StoreSketch = { palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; style: SketchStyle; product: SketchProduct; account: SketchAccount; structure?: PageStructure; blocks: SketchBlock[] };
```

```ts
export function repairSketch(input: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle; structure?: PageStructure }): { sketch: StoreSketch; notes: string[] } {
```

Immediately BEFORE the existing `// Size: a page has at most 20 blocks` comment in the structural tail, insert:

```ts
  // The drawn skeleton (spec 2026-10-04-page-grammar-and-real-copy). Enforced only when the caller passes a
  // structure: a chat edit passes none, so a merchant's bands are never taken from under them.
  if (defaults?.structure) {
    const applied = fillStructure(blocks, defaults.structure, ctx);
    blocks.length = 0;
    blocks.push(...applied.blocks);
    notes.push(...applied.notes);
  }
```

Then add the field where the function builds its returned sketch:

```ts
    ...(defaults?.structure ? { structure: defaults.structure } : {}),
```

- [ ] **Step 7: Re-export**

Add to `apps/api/src/storefront-source/sketch/index.ts`:

```ts
export * from './sketch-substance';
export * from './sketch-structure-draw';
export * from './sketch-structure-fill';
```

- [ ] **Step 8: Run the whole sketch suite**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'`
Expected: PASS, including every pre-existing test. A pre-existing failure here means the back-compat guarantee broke — fix it before moving on.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-structure-fill.ts apps/api/src/storefront-source/sketch/sketch-structure-fill.spec.ts apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts apps/api/src/storefront-source/sketch/index.ts
git commit -m "feat(yapi): the model fills the drawn skeleton by slot, and an edit is never restructured"
```

---

### Task 6: Hand the skeleton to the model, and delete the prose it ignored

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts` (`SKETCH_JSON_SCHEMA` at :27, `sketchPrompt` at :69)
- Modify: `apps/api/src/storefront-source/sketch/sketch-direction.ts` (delete `STRUCTURES` at :36 and its use at :57 and in `name`/`lines`)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (around :737-760)
- Test: `apps/api/src/storefront-source/sketch/sketch-request.spec.ts`

**Interfaces:**
- Consumes: `PageStructure` from Task 2, the `structure` default from Task 5.
- Produces: `sketchPrompt` accepts `structure: PageStructure`; `sketchFromResponse(body, ctx, defaults)` forwards `structure`.

- [ ] **Step 1: Write the failing test**

```ts
it('gives the model the slots it must fill, by id', () => {
  const structure = aStructure();
  const prompt = sketchPrompt({ ...promptInput(), structure } as any);
  for (const slot of structure.slots) expect(prompt).toContain(slot.id);
  expect(prompt).toMatch(/no inventes bandas|sólo estas bandas|solo estas bandas/i);
});

it('no longer carries a prose structure line', () => {
  const prompt = sketchPrompt({ ...promptInput(), structure: aStructure() } as any);
  expect(prompt).not.toContain('Estructura revista');
  expect(prompt).not.toContain('Estructura póster');
});
```

> If `sketch-request.spec.ts` has no `promptInput()` helper, build the argument the way that file's existing prompt tests do and keep the assertions unchanged.

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-request.spec.ts'`
Expected: FAIL — the slot ids are not in the prompt.

- [ ] **Step 3: Put the skeleton in the prompt**

In `sketchPrompt`, add `structure: PageStructure` to the input type and replace the free "Tipos de bloque" line with the slot list:

```ts
    `LA PÁGINA YA TIENE SU FORMA. Estas son sus bandas, en orden. Llená cada una con contenido real usando su id. NO inventes bandas: cualquier bloque con un id que no esté en esta lista se descarta. Si una banda no tenés con qué llenarla honestamente, omitila y la página se cierra sola.`,
    ...input.structure.slots.map(slot => `- ${slot.id}: ${slot.type} · tamaño ${slot.size} · ancho ${slot.width}${slot.media ? ' · lleva foto' : ''}`),
```

Keep the colour rule from the old line (`COLOR DE VERDAD: mínimo 3 bloques con fondo accent…`) as its own entry — it is about background, not structure, and is still wanted.

- [ ] **Step 4: Require the slot id in the schema**

In `sketch-request.ts`, the `block()` helper already requires `id`. Add to the prompt-facing description nothing further, but tighten the array so a page cannot exceed the skeleton:

```ts
    blocks: { type: 'array', maxItems: 20, items: { anyOf: [ /* unchanged */ ] } },
```

- [ ] **Step 5: Delete the prose structures**

In `sketch-direction.ts`, delete the `STRUCTURES` array, the `const structure = pick(STRUCTURES);` line, `structure.line` from `lines`, and `${structure.name} · ` from `name`. Run the direction's own spec and update any assertion that named a structure.

- [ ] **Step 6: Draw and pass the structure**

In `source-generation.service.ts`, in the new-store branch before the prompt is built:

```ts
const substance = countSubstance({ products: data.items, photos: sketchPhotos, brief: dto.brief });
const structure = drawPageStructure(substance);
```

Pass `structure` into `sketchPrompt(...)`, and into the repair via `sketchFromResponse(body, sketchCtx, { style: direction.style, structure })`. Widen `sketchFromResponse`'s `defaults` to carry it through to `repairSketch` unchanged. **Leave the chat-edit call site at :821 alone** — that is the Review Focus 1 guarantee.

- [ ] **Step 7: Run the sketch suite, then the agent spec**

On separate lines, never together:

```
sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'
sh -c 'cd apps/api && npx jest src/storefront-source/source-generation-agent.spec.ts'
```

Expected: PASS. The agent spec takes about 5 minutes. Its sketch-first cases assert on generated blocks and will need their fixtures updated to fill slot ids — update the fixtures, not the assertions' intent.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-request.ts apps/api/src/storefront-source/sketch/sketch-request.spec.ts apps/api/src/storefront-source/sketch/sketch-direction.ts apps/api/src/storefront-source/sketch/sketch-direction.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-agent.spec.ts
git commit -m "feat(yapi): the model is handed the page's bands and fills them, instead of choosing them"
```

---

### Task 7: Prove the pages stand up in a browser

**Files:**
- Test: `apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts`

**Interfaces:**
- Consumes: Tasks 2-6. Produces no API.

- [ ] **Step 1: Write the browser test**

Append, using that file's existing `openSketch` helper:

```ts
const seededB = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const fullStore = { products: 40, photos: 6, categories: 5, briefWords: 60 };

it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('renders drawn structure %i with every band standing', async seed => {
  const structure = drawPageStructure(fullStore, seededB(seed));
  const response = { blocks: structure.slots.map(slot => ({ id: slot.id, type: slot.type, headline: 'Pan de verdad', title: 'Pan de verdad', items: ['uno', 'dos'], paragraphs: ['Uno'] })) };
  const { sketch } = repairSketch(response, ctx, { structure });
  await openSketch(sketch, async page => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const collapsed = await page.evaluate(() => Array.from(document.querySelectorAll('section[data-skb]')).filter(section => {
        const inflow = Array.from(section.children).filter(child => !child.classList.contains('skb-extras') && getComputedStyle(child).position !== 'absolute');
        return inflow.reduce((tallest, child) => Math.max(tallest, child.getBoundingClientRect().height), 0) === 0;
      }).length);
      expect(collapsed).toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-canvas-layout.spec.ts'`
Expected: PASS, 10 new cases. A collapsed band means a block type renders nothing when its fields are empty — fix that block's generator to render a minimum, not the test.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts
git commit -m "test(sketch): ten drawn pages stand up on a desktop and a phone"
```

---

### Task 8: Give the writer the real catalogue

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-catalogue-digest.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:738`
- Test: `apps/api/src/storefront-source/sketch/sketch-catalogue-digest.spec.ts`

**Interfaces:**
- Consumes: the raw `data.items` the service already holds.
- Produces: `type CatalogueDigest = { items: Array<{ name: string; price?: string; description?: string; category?: string; options?: string[] }>; totals: { count: number; priceLow?: string; priceHigh?: string; categories: string[] } }` and `catalogueDigest(items: unknown[], limit?: number): CatalogueDigest`. Task 9 renders it into the prompt.

- [ ] **Step 1: Read the real item shape FIRST**

Before writing the test, run this and use the field names it prints — do not guess them:

```
sh -c "cd apps/api && grep -rn 'items' src/storefront-source/source-generation.service.ts | head -20"
```

Then find the type or query that builds `data`, and read which columns each item carries (name, price, description, category, options/variants). The digest must use the real names. If a field does not exist, leave it out of the digest rather than inventing it.

- [ ] **Step 2: Write the failing test**

```ts
import { catalogueDigest } from './sketch-catalogue-digest';

// Field names here MUST match what Step 1 found. Adjust the fixtures, not the assertions' intent.
const items = [
  { name: 'Pan de masa madre', price: 4500, description: 'Fermentado 24 h', category: 'Panadería' },
  { name: 'Focaccia romero', price: 6200, description: 'Con romero fresco', category: 'Panadería' },
  { name: 'Torta de naranja', price: 12000, description: 'Naranja y almendra', category: 'Dulces' },
];

it('carries what a copywriter needs, not just names', () => {
  const digest = catalogueDigest(items);
  expect(digest.items[0].name).toBe('Pan de masa madre');
  expect(digest.items[0].description).toContain('24 h');
  expect(digest.items[0].category).toBe('Panadería');
  expect(digest.items[0].price).toBeTruthy();
});

it('summarises the whole catalogue, so a headline can be true about one too long to list', () => {
  const digest = catalogueDigest(items);
  expect(digest.totals.count).toBe(3);
  expect(digest.totals.categories).toEqual(expect.arrayContaining(['Panadería', 'Dulces']));
  expect(digest.totals.priceLow).toBeTruthy();
  expect(digest.totals.priceHigh).toBeTruthy();
});

// Review Focus 3: a big catalogue must not blow the prompt.
it('samples a long catalogue but still counts all of it', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ name: `Producto ${i}`, price: 1000 + i, category: `Cat ${i % 7}` }));
  const digest = catalogueDigest(many);
  expect(digest.items.length).toBeLessThanOrEqual(20);
  expect(digest.totals.count).toBe(500);
  expect(digest.totals.categories.length).toBeLessThanOrEqual(12);
});

it('survives a catalogue of junk without throwing', () => {
  for (const bad of [[], [null], [{}], [{ name: 42 }], undefined as any]) expect(() => catalogueDigest(bad ?? [])).not.toThrow();
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-catalogue-digest.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Write the digest**

```ts
/** What the page's writer is allowed to know. Before this, the prompt carried
 * `data.items.map(item => item.name).slice(0, 30)` and nothing else — so every band that was not the catalog
 * was written from the brief alone, and came out as virtue copy about nothing. A digest is a sample with
 * enough detail to write a sentence about, plus aggregates that stay true for a catalogue too long to list. */
export type DigestItem = { name: string; price?: string; description?: string; category?: string; options?: string[] };
export type CatalogueDigest = { items: DigestItem[]; totals: { count: number; priceLow?: string; priceHigh?: string; categories: string[] } };

const text = (value: unknown, max: number): string | undefined => {
  const out = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return out ? out.slice(0, max) : undefined;
};
const money = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export function catalogueDigest(raw: unknown[], limit = 20): CatalogueDigest {
  const items = (Array.isArray(raw) ? raw : []).filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  const prices = items.map(item => money(item.price)).filter((n): n is number => n !== undefined);
  const categories = [...new Set(items.map(item => text(item.category, 40)).filter((c): c is string => !!c))].slice(0, 12);
  // Spread the sample across categories so a 500-item catalogue does not show twenty of one thing.
  const sample: Record<string, unknown>[] = [];
  const perCategory = Math.max(1, Math.ceil(limit / Math.max(1, categories.length)));
  for (const category of categories.length ? categories : [undefined]) {
    for (const item of items) {
      if (sample.length >= limit) break;
      if (category !== undefined && text(item.category, 40) !== category) continue;
      if (sample.filter(chosen => text(chosen.category, 40) === category).length >= perCategory) break;
      if (!sample.includes(item)) sample.push(item);
    }
  }
  for (const item of items) { if (sample.length >= limit) break; if (!sample.includes(item)) sample.push(item); }

  return {
    items: sample.map(item => ({
      name: text(item.name, 80) ?? 'Producto',
      price: money(item.price) !== undefined ? String(money(item.price)) : undefined,
      description: text(item.description, 160),
      category: text(item.category, 40),
      options: Array.isArray(item.options) ? item.options.map(option => text(option, 30)).filter((o): o is string => !!o).slice(0, 6) : undefined,
    })),
    totals: {
      count: items.length,
      priceLow: prices.length ? String(Math.min(...prices)) : undefined,
      priceHigh: prices.length ? String(Math.max(...prices)) : undefined,
      categories,
    },
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-catalogue-digest.spec.ts'`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-catalogue-digest.ts apps/api/src/storefront-source/sketch/sketch-catalogue-digest.spec.ts
git commit -m "feat(yapi): the page's writer gets the real catalogue instead of a list of names"
```

---

### Task 9: Make the whole page about the products

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts` (`sketchPrompt`, the `catalogNames` line at :75)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:738`
- Test: `apps/api/src/storefront-source/sketch/sketch-request.spec.ts`

**Interfaces:**
- Consumes: `CatalogueDigest` from Task 8.
- Produces: `sketchPrompt` takes `catalogue: CatalogueDigest` in place of `catalogNames: string[]`.

- [ ] **Step 1: Write the failing test**

```ts
const digest = catalogueDigest([
  { name: 'Pan de masa madre', price: 4500, description: 'Fermentado 24 h', category: 'Panadería' },
  { name: 'Torta de naranja', price: 12000, description: 'Naranja y almendra', category: 'Dulces' },
]);

it('puts real products, prices and categories in the prompt', () => {
  const prompt = sketchPrompt({ ...promptInput(), catalogue: digest } as any);
  expect(prompt).toContain('Pan de masa madre');
  expect(prompt).toContain('Fermentado 24 h');
  expect(prompt).toContain('Panadería');
  expect(prompt).toContain('4500');
});

// The framing that caused the generic copy: the catalogue was declared to be one block's business.
it('no longer tells the model the catalogue belongs to one block', () => {
  const prompt = sketchPrompt({ ...promptInput(), catalogue: digest } as any);
  expect(prompt).not.toContain('el bloque catalog los muestra solo');
});

it('asks every prose band to say something only this store could say', () => {
  const prompt = sketchPrompt({ ...promptInput(), catalogue: digest } as any);
  expect(prompt).toMatch(/sólo esta tienda|solo esta tienda|únicamente esta tienda/i);
  // The failure mode is named, not described.
  expect(prompt).toMatch(/calidad que se nota|hecho con amor/i);
});

it('tells an empty store to say less rather than invent a selection', () => {
  const prompt = sketchPrompt({ ...promptInput(), catalogue: catalogueDigest([]) } as any);
  expect(prompt).toMatch(/todavía no hay productos|aún no hay productos/i);
  expect(prompt).toMatch(/no inventes|no finjas/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-request.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Replace the catalogue lines in the prompt**

In `sketchPrompt`, swap `catalogNames: string[]` for `catalogue: CatalogueDigest` and replace the `input.catalogNames.length ? ... : 'Catálogo aún vacío.'` line with:

```ts
    input.catalogue.totals.count
      ? [
          `LO QUE ESTA TIENDA VENDE (${input.catalogue.totals.count} productos${input.catalogue.totals.priceLow ? `, de ${input.catalogue.totals.priceLow} a ${input.catalogue.totals.priceHigh}` : ''}${input.catalogue.totals.categories.length ? `; categorías: ${input.catalogue.totals.categories.join(', ')}` : ''}):`,
          ...input.catalogue.items.map(item => `- ${item.name}${item.price ? ` · ${item.price}` : ''}${item.category ? ` · ${item.category}` : ''}${item.description ? ` · ${item.description}` : ''}${item.options?.length ? ` · opciones: ${item.options.join('/')}` : ''}`),
          'ESTO ES EL TEMA DE TODA LA PÁGINA, no sólo del bloque catalog. Cada banda con texto tiene que decir algo que sólo esta tienda podría decir: nombrá un producto, una categoría, un precio, un material, una opción. El story cuenta cómo se hacen o se eligen ESTAS cosas; el faq responde sobre ESTOS productos (talles, envíos, materiales); el banner da una razón real para comprar hoy.',
          'PROHIBIDO el relleno de virtud, que sería verdad en cualquier tienda: nada de "calidad que se nota", "hecho con amor", "una selección pensada", "objetos que conversan entre sí". Si no sabés algo concreto sobre un producto, escribí menos, no escribas humo.',
        ].join('\n')
      : 'Todavía no hay productos cargados. Escribí una página corta y honesta: la tienda está por abrir. NO inventes una selección, ni un catálogo curado, ni reseñas de clientes que no existen. Decir poco con verdad es mejor que llenar bandas con humo.',
```

- [ ] **Step 4: Pass the digest from the service**

In `source-generation.service.ts:738`, replace `catalogNames: data.items.map(...).slice(0, 30)` with `catalogue: catalogueDigest(data.items)`. Do the same for `sketchEditPrompt` at :821 if it takes the digest; if you leave the edit prompt on `catalogNames`, say so in the commit message rather than leaving it unexplained.

- [ ] **Step 5: Run the sketch suite**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-request.ts apps/api/src/storefront-source/sketch/sketch-request.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): the catalogue becomes the subject of the whole page, not one block's contents"
```

---

### Task 10: Measure whether the copy is actually specific

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-specificity.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-specificity.spec.ts`

**Interfaces:**
- Consumes: `CatalogueDigest` from Task 8, `StoreSketch` from `./sketch-schema`.
- Produces: `specificityReport(sketch: StoreSketch, catalogue: CatalogueDigest): { hits: number; bands: number; groundedBands: number; filler: string[] }`. Reporting only — never a repair.

- [ ] **Step 1: Write the failing test**

```ts
import { specificityReport } from './sketch-specificity';

it('counts bands that mention something real from the catalogue', () => {
  const sketch = { blocks: [
    { id: 'a', type: 'story', title: 'Masa madre', paragraphs: ['Fermentamos el pan de masa madre 24 horas.'] },
    { id: 'b', type: 'banner', headline: 'Llevate una focaccia romero' },
  ] } as any;
  const report = specificityReport(sketch, digest);
  expect(report.groundedBands).toBe(2);
  expect(report.hits).toBeGreaterThanOrEqual(2);
});

it('names the filler it found', () => {
  const sketch = { blocks: [{ id: 'a', type: 'story', title: 'Nuestra historia', paragraphs: ['Una selección pensada con calidad que se nota.'] }] } as any;
  const report = specificityReport(sketch, digest);
  expect(report.groundedBands).toBe(0);
  expect(report.filler.join(' ')).toMatch(/calidad que se nota|una selección pensada/i);
});

// It reports; it never rewrites. Mechanical prose edits make prose worse.
it('returns a report and nothing else', () => {
  const sketch = { blocks: [{ id: 'a', type: 'story', title: 'x', paragraphs: ['y'] }] } as any;
  const before = JSON.stringify(sketch);
  specificityReport(sketch, digest);
  expect(JSON.stringify(sketch)).toBe(before);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-specificity.spec.ts'`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the report**

```ts
import type { CatalogueDigest } from './sketch-catalogue-digest';
import type { StoreSketch } from './sketch-schema';

/** Phrases that would be true of any store on the platform. Named rather than described, because the model
 * reproduces them verbatim: every one of these came out of a real generation. */
const FILLER = ['calidad que se nota', 'hecho con amor', 'una selección pensada', 'objetos que conversan', 'pensada como una revista', 'para mirar de cerca', 'lo mejor para vos'];

const prose = (block: Record<string, unknown>): string => ['title', 'headline', 'sub', 'body', 'lead', 'note', 'tagline', 'kicker']
  .map(key => (typeof block[key] === 'string' ? block[key] as string : ''))
  .concat(Array.isArray(block.paragraphs) ? block.paragraphs.filter((p): p is string => typeof p === 'string') : [])
  .join(' ').toLowerCase();

/** Does the page say anything only this store could say? A measurement for the eval script and the tests —
 * never a repair. Rewriting a model's prose mechanically produces worse prose than leaving it alone. */
export function specificityReport(sketch: StoreSketch, catalogue: CatalogueDigest): { hits: number; bands: number; groundedBands: number; filler: string[] } {
  const nouns = [...new Set([
    ...catalogue.items.flatMap(item => [item.name, item.category].filter((v): v is string => !!v)),
    ...catalogue.totals.categories,
  ])].map(noun => noun.toLowerCase()).filter(noun => noun.length > 3);

  let hits = 0, bands = 0, groundedBands = 0;
  const filler: string[] = [];
  for (const block of sketch.blocks ?? []) {
    const text = prose(block as unknown as Record<string, unknown>);
    if (text.trim().length < 12) continue;
    bands++;
    const found = nouns.filter(noun => text.includes(noun)).length;
    hits += found;
    if (found) groundedBands++;
    for (const phrase of FILLER) if (text.includes(phrase)) filler.push(phrase);
  }
  return { hits, bands, groundedBands, filler: [...new Set(filler)] };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-specificity.spec.ts'`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-specificity.ts apps/api/src/storefront-source/sketch/sketch-specificity.spec.ts
git commit -m "feat(yapi): a measurement of whether the page says anything only this store could say"
```

---

### Task 11: Seven new component choices in the style vocabulary

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (`SketchStyle` :45, `SKETCH_STYLE_OPTIONS` :46, `DEFAULT_SKETCH_STYLE` :53, and the style repair that reads them)
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts` (the `style` object in `SKETCH_JSON_SCHEMA` at :35-41)
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SketchStyle` gains `buttonIcon`, `icons`, `dividers`, `badges`, `fields`, `links`, and `buttons` grows from 3 values to 6. Tasks 12, 13 and 14 render, draw and expose these.

**Why these:** the page-wide vocabulary is where a store's character lives between generations, and today it is five knobs with three values each. These seven are all cheap to render, all visible at a glance, and all things a merchant has an opinion about.

- [ ] **Step 1: Write the failing test**

```ts
import { SKETCH_STYLE_OPTIONS, DEFAULT_SKETCH_STYLE, repairSketch } from './sketch-schema';

it('offers a wider button vocabulary', () => {
  expect(SKETCH_STYLE_OPTIONS.buttons).toEqual(['pill', 'square', 'outline', 'ghost', 'underline', 'hard-shadow']);
});

it('offers the new component choices, each with a default', () => {
  for (const key of ['buttonIcon', 'icons', 'dividers', 'badges', 'fields', 'links'] as const) {
    expect(SKETCH_STYLE_OPTIONS[key].length).toBeGreaterThanOrEqual(3);
    expect(SKETCH_STYLE_OPTIONS[key]).toContain(DEFAULT_SKETCH_STYLE[key]);
  }
});

it('repairs an unknown value for a new key back to its default', () => {
  const { sketch } = repairSketch({ style: { buttons: 'neon', icons: 'nope', dividers: 'zigzag' }, blocks: [] }, { storeName: 's', purpose: 'shop', photos: [] });
  expect(sketch.style.buttons).toBe(DEFAULT_SKETCH_STYLE.buttons);
  expect(sketch.style.icons).toBe(DEFAULT_SKETCH_STYLE.icons);
  expect(sketch.style.dividers).toBe('zigzag');
});

// Review Focus 5: a sketch saved before these keys existed.
it('fills the new keys with defaults for a sketch that predates them', () => {
  const { sketch } = repairSketch({ style: { radius: 'soft', buttons: 'pill', cards: 'inset', header: 'left', footer: 'center' }, blocks: [] }, { storeName: 's', purpose: 'shop', photos: [] });
  expect(sketch.style.icons).toBe(DEFAULT_SKETCH_STYLE.icons);
  expect(sketch.style.fields).toBe(DEFAULT_SKETCH_STYLE.fields);
  expect(sketch.style.radius).toBe('soft');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts'`
Expected: FAIL — `buttons` has three values and the new keys do not exist.

- [ ] **Step 3: Widen the type and the options**

In `sketch-schema.ts`:

```ts
export type SketchStyle = {
  radius: 'soft' | 'round' | 'square';
  buttons: 'pill' | 'square' | 'outline' | 'ghost' | 'underline' | 'hard-shadow';
  cards: 'bleed' | 'inset' | 'outline';
  header: 'left' | 'center';
  footer: 'columns' | 'center';
  /** Whether the primary call to action carries an icon, and which. */
  buttonIcon: 'none' | 'arrow' | 'bag' | 'plus';
  /** How an icon is framed wherever one appears (steps, boxes, assurances). */
  icons: 'bare' | 'circle' | 'square' | 'tinted';
  /** What sits between two bands. */
  dividers: 'none' | 'hairline' | 'rule' | 'notch';
  /** Catalogue badges ("NUEVO", "FAVORITO"). */
  badges: 'pill' | 'square' | 'tag';
  /** Newsletter and contact inputs. */
  fields: 'underline' | 'box' | 'pill';
  /** Inline text links. */
  links: 'plain' | 'underline' | 'arrow';
};

export const SKETCH_STYLE_OPTIONS: { [K in keyof SketchStyle]: readonly SketchStyle[K][] } = {
  radius: ['soft', 'round', 'square'],
  buttons: ['pill', 'square', 'outline', 'ghost', 'underline', 'hard-shadow'],
  cards: ['bleed', 'inset', 'outline'],
  header: ['left', 'center'],
  footer: ['columns', 'center'],
  buttonIcon: ['none', 'arrow', 'bag', 'plus'],
  icons: ['bare', 'circle', 'square', 'tinted'],
  dividers: ['none', 'hairline', 'rule', 'notch'],
  badges: ['pill', 'square', 'tag'],
  fields: ['underline', 'box', 'pill'],
  links: ['plain', 'underline', 'arrow'],
};

export const DEFAULT_SKETCH_STYLE: SketchStyle = {
  radius: 'round', buttons: 'pill', cards: 'bleed', header: 'left', footer: 'columns',
  buttonIcon: 'none', icons: 'bare', dividers: 'none', badges: 'pill', fields: 'underline', links: 'plain',
};
```

The existing style repair already walks `SKETCH_STYLE_OPTIONS` key by key and falls back to `DEFAULT_SKETCH_STYLE`; confirm it does, and if it hard-codes the five old keys, change it to iterate `Object.keys(SKETCH_STYLE_OPTIONS)` so a future key needs no further edit.

- [ ] **Step 4: Offer them to the model**

In `sketch-request.ts`, extend the `style` object in `SKETCH_JSON_SCHEMA` so every key is present with its enum plus `'auto'`, and every key is in that object's `required` array. Build it from the shared constant rather than by hand, so the two cannot drift:

```ts
    style: { type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Object.entries(SKETCH_STYLE_OPTIONS).map(([key, values]) => [key, { type: 'string', enum: [...values, 'auto'] }])),
      required: Object.keys(SKETCH_STYLE_OPTIONS) },
```

- [ ] **Step 5: Run the tests**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'`
Expected: PASS. Any pre-existing test asserting the five-key style object needs its fixture widened — widen the fixture, keep the assertion's intent.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts apps/api/src/storefront-source/sketch/sketch-request.ts
git commit -m "feat(yapi): seven more component choices, and six button shapes instead of three"
```

---

### Task 12: Render the new component choices

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-blocks.ts` (the base CSS, around :497-550, and the `skb-btn`, `skb-photo-tag` and form generators)
- Test: `apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts`

**Interfaces:**
- Consumes: `SketchStyle` from Task 11.
- Produces: no new exports. The page root carries `data-skb-style-*` attributes the CSS reads.

- [ ] **Step 1: Write the failing test**

```ts
it('stamps every style choice onto the page root, so CSS can read them', () => {
  const sketch = repairSketch({ style: { buttons: 'hard-shadow', icons: 'circle', dividers: 'rule', badges: 'tag', fields: 'pill', links: 'arrow', buttonIcon: 'bag' }, blocks: [
    { id: 'h', type: 'hero', headline: 'Hola', cta: 'Comprar' },
  ] }, ctx).sketch;
  const page = assembleSketch(sketch, ctx).find(file => file.path === 'components/home.tsx')!.content;
  expect(page).toContain('data-skb-buttons="hard-shadow"');
  expect(page).toContain('data-skb-icons="circle"');
  expect(page).toContain('data-skb-dividers="rule"');
});

it('carries CSS for every value of every new choice', () => {
  const css = SKETCH_BASE_CSS;
  for (const value of ['ghost', 'underline', 'hard-shadow']) expect(css).toContain(`[data-skb-buttons="${value}"]`);
  for (const value of ['circle', 'square', 'tinted']) expect(css).toContain(`[data-skb-icons="${value}"]`);
  for (const value of ['hairline', 'rule', 'notch']) expect(css).toContain(`[data-skb-dividers="${value}"]`);
  for (const value of ['box', 'pill']) expect(css).toContain(`[data-skb-fields="${value}"]`);
  for (const value of ['square', 'tag']) expect(css).toContain(`[data-skb-badges="${value}"]`);
  for (const value of ['underline', 'arrow']) expect(css).toContain(`[data-skb-links="${value}"]`);
});

it('puts an icon on the primary button only when one was chosen', () => {
  const withIcon = repairSketch({ style: { buttonIcon: 'arrow' }, blocks: [{ id: 'h', type: 'hero', headline: 'Hola', cta: 'Comprar' }] }, ctx).sketch;
  const without = repairSketch({ style: { buttonIcon: 'none' }, blocks: [{ id: 'h', type: 'hero', headline: 'Hola', cta: 'Comprar' }] }, ctx).sketch;
  const render = (s: typeof withIcon) => assembleSketch(s, ctx).find(f => f.path === 'components/home.tsx')!.content;
  expect(render(withIcon)).toContain('assets/icons/arrow-right.svg');
  expect(render(without)).not.toContain('assets/icons/arrow-right.svg');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-blocks.spec.ts'`
Expected: FAIL.

- [ ] **Step 3: Stamp the choices onto the page root**

Wherever `assembleSketch` writes the page's outermost element, add an attribute per style key:

```tsx
<div className="skb-page" data-skb-buttons={"..."} data-skb-icons={"..."} data-skb-dividers={"..."} data-skb-badges={"..."} data-skb-fields={"..."} data-skb-links={"..."}>
```

Generate them from the style object rather than by hand so a new key needs no further edit here.

- [ ] **Step 4: Write the CSS**

Append to the base CSS in `sketch-blocks.ts`. **Watch for backticks**: this string is a JS template literal, and a backtick anywhere in it — including in a comment — terminates it and produces TS1005. A previous task in this subsystem lost time to exactly that.

```css
/* Buttons. The three original shapes are unchanged; these three are new. */
[data-skb-buttons="ghost"] .skb-btn { background: transparent; color: inherit; border: 1.5px solid currentColor; }
[data-skb-buttons="underline"] .skb-btn { background: transparent; color: inherit; border: 0; border-bottom: 2px solid currentColor; border-radius: 0; padding: 0.4em 0.1em; }
[data-skb-buttons="hard-shadow"] .skb-btn { border: 2px solid var(--skb-page-ink); box-shadow: 4px 4px 0 var(--skb-page-ink); }
[data-skb-buttons="hard-shadow"] .skb-btn:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0 var(--skb-page-ink); }
/* The CTA's icon rides inside the button and inherits its colour through a mask. */
.skb-btn__icon { display: inline-block; width: 1em; height: 1em; vertical-align: -0.1em; margin-left: 0.5em; background: currentColor; -webkit-mask: var(--skb-btn-icon) center/contain no-repeat; mask: var(--skb-btn-icon) center/contain no-repeat; }
/* Icon framing wherever an icon appears. */
[data-skb-icons="circle"] .skb-icon, [data-skb-icons="square"] .skb-icon { padding: 0.55em; background: color-mix(in srgb, currentColor 12%, transparent); }
[data-skb-icons="circle"] .skb-icon { border-radius: 50%; }
[data-skb-icons="square"] .skb-icon { border-radius: var(--skb-r-sm); }
[data-skb-icons="tinted"] .skb-icon { color: var(--skb-accent); }
/* What sits between two bands. */
[data-skb-dividers="hairline"] .skb + .skb { border-top: 1px solid color-mix(in srgb, currentColor 18%, transparent); }
[data-skb-dividers="rule"] .skb + .skb { border-top: 3px solid var(--skb-page-ink); }
[data-skb-dividers="notch"] .skb + .skb::before { content: ""; position: absolute; top: 0; left: 50%; width: 2.5rem; height: 2.5rem; translate: -50% -50%; rotate: 45deg; background: var(--skb-bg); }
/* Catalogue badges. */
[data-skb-badges="square"] .skb-badge { border-radius: 0; }
[data-skb-badges="tag"] .skb-badge { border-radius: 0 999px 999px 0; padding-left: 0.9em; }
/* Form fields. */
[data-skb-fields="box"] .skb-field { border: 1.5px solid currentColor; border-radius: var(--skb-r-sm); padding: 0.85em 1em; background: transparent; }
[data-skb-fields="pill"] .skb-field { border: 1.5px solid currentColor; border-radius: 999px; padding: 0.85em 1.2em; background: transparent; }
/* Inline links. */
[data-skb-links="underline"] .skb-link { text-decoration: underline; text-underline-offset: 0.25em; }
[data-skb-links="arrow"] .skb-link::after { content: " \2192"; }
```

Give the existing icon, badge and input elements the `skb-icon`, `skb-badge`, `skb-field` and `skb-link` classes they do not already carry, and set `--skb-btn-icon` on the button when `buttonIcon` is not `none`, mapping `arrow → arrow-right`, `bag → shopping-bag`, `plus → plus` against `assets/icons/NAME.svg`.

Note: `[data-skb-dividers="notch"]` needs `.skb` to be `position: relative`, which it already is (`sketch-blocks.ts:497`).

- [ ] **Step 5: Run the block tests**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-blocks.spec.ts'`
Expected: PASS.

- [ ] **Step 6: Add a browser test for the loudest combination**

Append to `sketch-canvas-layout.spec.ts`:

```ts
it('renders the loudest component combination without breaking a band', async () => {
  const sketch = repairSketch({ style: { buttons: 'hard-shadow', icons: 'circle', dividers: 'notch', badges: 'tag', fields: 'pill', links: 'arrow', buttonIcon: 'bag' }, blocks: [
    { id: 'h', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', cta: 'Comprar', photo: 'assets/a.jpg' },
    { id: 'n', type: 'newsletter', title: 'Novedades', cta: 'Quiero enterarme' },
    { id: 'f', type: 'footer', tagline: '' },
  ] }, ctx).sketch;
  await openSketch(sketch, async page => {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const bad = await page.evaluate(() => {
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        const buttons = Array.from(document.querySelectorAll('.skb-btn')).filter(b => b.getBoundingClientRect().height < 20).length;
        return { overflow, buttons };
      });
      expect(bad.overflow).toBe(false);
      expect(bad.buttons).toBe(0);
    }
  });
});
```

- [ ] **Step 7: Run it**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-canvas-layout.spec.ts'`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-blocks.ts apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts
git commit -m "feat(yapi): buttons, icons, dividers, badges, fields and links render their new shapes"
```

---

### Task 13: Let the merchant choose them

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`STYLE_CONTROLS` at :29, `DEFAULT_STYLE` at :36)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: the `SketchStyle` keys from Task 11.
- Produces: no new exports. The look panel gains seven controls.

**This is the half that makes the vocabulary the merchant's, not only YAPI's.** The panel is declarative: a row per entry in `STYLE_CONTROLS`, so the work is the array and the Spanish labels.

- [ ] **Step 1: Write the failing test**

Follow the style of the existing test at `source-boceto.test.ts:119`, which already asserts a style change round-trips to `putSketch`:

```ts
it('offers the new component choices in the look panel', () => {
  const keys = STYLE_CONTROLS.map(control => control.key);
  for (const key of ['buttons', 'buttonIcon', 'icons', 'dividers', 'badges', 'fields', 'links']) expect(keys).toContain(key);
});

it('offers six button shapes, each with a Spanish name', () => {
  const buttons = STYLE_CONTROLS.find(control => control.key === 'buttons')!;
  expect(buttons.values).toHaveLength(6);
  expect(buttons.names).toHaveLength(6);
  expect(buttons.names.every(name => name.trim().length > 0)).toBe(true);
});

it('saves a chosen icon framing back to the sketch', () => {
  // Mirror the existing radius test at :119: choose a value, expect it on the look and in the PUT body.
  chooseStyle('icons', 'circle');
  expect(lastLook().style.icons).toBe('circle');
  expect(putSketch.mock.calls.at(-1)[1].sketch.style.icons).toBe('circle');
});

// Review Focus 5: a sketch saved before these keys existed must not render blank controls.
it('shows the default for a key the saved sketch does not carry', () => {
  loadSketch({ style: { radius: 'soft', buttons: 'pill', cards: 'inset', header: 'left', footer: 'center' } });
  expect(lastLook().style.icons).toBe(DEFAULT_STYLE.icons);
});
```

> `chooseStyle` / `loadSketch` stand for whatever the existing test file uses to drive the panel — reuse its helpers rather than adding new ones.

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts'`
(Check the package's actual test runner first and use that command if it differs.)
Expected: FAIL — the controls do not exist.

- [ ] **Step 3: Extend the controls**

In `source-boceto.ts`:

```ts
const STYLE_CONTROLS: Array<{ key: keyof SketchStyle; label: string; values: string[]; names: string[] }> = [
  { key: 'radius', label: 'Esquinas', values: ['round', 'soft', 'square'], names: ['Redondas', 'Suaves', 'Rectas'] },
  { key: 'buttons', label: 'Botones', values: ['pill', 'square', 'outline', 'ghost', 'underline', 'hard-shadow'], names: ['Píldora', 'Rectos', 'Contorno', 'Fantasma', 'Subrayado', 'Sombra dura'] },
  { key: 'buttonIcon', label: 'Ícono del botón', values: ['none', 'arrow', 'bag', 'plus'], names: ['Sin ícono', 'Flecha', 'Bolsa', 'Más'] },
  { key: 'icons', label: 'Íconos', values: ['bare', 'circle', 'square', 'tinted'], names: ['Sueltos', 'En círculo', 'En cuadrado', 'Con color'] },
  { key: 'cards', label: 'Tarjetas', values: ['bleed', 'inset', 'outline'], names: ['Foto llena', 'Con margen', 'Contorno'] },
  { key: 'badges', label: 'Etiquetas', values: ['pill', 'square', 'tag'], names: ['Píldora', 'Rectas', 'Colgante'] },
  { key: 'dividers', label: 'Separadores', values: ['none', 'hairline', 'rule', 'notch'], names: ['Ninguno', 'Línea fina', 'Línea gruesa', 'Muesca'] },
  { key: 'fields', label: 'Campos', values: ['underline', 'box', 'pill'], names: ['Subrayado', 'Caja', 'Píldora'] },
  { key: 'links', label: 'Enlaces', values: ['plain', 'underline', 'arrow'], names: ['Simples', 'Subrayados', 'Con flecha'] },
  { key: 'header', label: 'Cabecera', values: ['left', 'center'], names: ['Logo izq.', 'Logo centro'] },
  { key: 'footer', label: 'Pie', values: ['columns', 'center'], names: ['Columnas', 'Centrado'] },
];
const DEFAULT_STYLE: SketchStyle = { radius: 'round', buttons: 'pill', cards: 'bleed', header: 'left', footer: 'columns', buttonIcon: 'none', icons: 'bare', dividers: 'none', badges: 'pill', fields: 'underline', links: 'plain' };
```

If the panel's markup assumes a fixed number of controls or a single row, make it wrap — eleven controls will not fit where five did. Check `source-boceto.css` for a hard-coded column count.

- [ ] **Step 4: Run the Studio tests**

Run: `sh -c 'cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts'`
Expected: PASS.

- [ ] **Step 5: See it in the real app**

The owner's dev servers read this working tree, and the dashboard serves a **pre-built** Studio — a source change is not visible until it is rebuilt. Rebuild the Studio, open the Boceto on a dev store, and confirm the eleven controls render, wrap sensibly, and change the preview. Do not skip this: the unit test proves the array, not the panel.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-boceto.css
git commit -m "feat(studio): the look panel offers eleven component choices instead of five"
```

---

### Task 14: Let the direction draw them, so two stores differ without anyone choosing

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-direction.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-direction.spec.ts`

**Interfaces:**
- Consumes: `SKETCH_STYLE_OPTIONS` from Task 11.
- Produces: `drawSketchDirection()` returns a `style` covering all eleven keys.

- [ ] **Step 1: Write the failing test**

```ts
it('draws a value for every style key, so none silently defaults', () => {
  const style = drawSketchDirection(seeded(5)).style;
  for (const key of Object.keys(SKETCH_STYLE_OPTIONS) as (keyof typeof SKETCH_STYLE_OPTIONS)[]) {
    expect(SKETCH_STYLE_OPTIONS[key]).toContain(style[key]);
  }
});

it('does not land on the same component set every time', () => {
  const sets = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) sets.add(JSON.stringify(drawSketchDirection(seeded(seed)).style));
  expect(sets.size).toBeGreaterThanOrEqual(35);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-direction.spec.ts'`
Expected: FAIL if the draw hard-codes the five old keys. It already builds `style` by walking `SKETCH_STYLE_OPTIONS` (`sketch-direction.ts:60`), so this may pass immediately — which is the point of running it.

- [ ] **Step 3: Fix only if it fails**

If `drawSketchDirection` enumerates keys by hand, change it to walk `Object.keys(SKETCH_STYLE_OPTIONS)` so the eleventh key needs no edit here and the twelfth will not either.

- [ ] **Step 4: Run it**

Run: `sh -c 'cd apps/api && npx jest src/storefront-source/sketch/sketch-direction.spec.ts'`
Expected: PASS.

- [ ] **Step 5: Full verification, on separate lines**

```
sh -c 'cd apps/api && npx jest src/storefront-source/sketch/'
sh -c 'cd apps/api && npx jest src/storefront-source/source-generation-agent.spec.ts'
sh -c 'cd apps/api && npx tsc --noEmit'
```

Expected: PASS, PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-direction.ts apps/api/src/storefront-source/sketch/sketch-direction.spec.ts
git commit -m "feat(yapi): every component choice is drawn, so two stores differ before anyone chooses"
```

---

## After the plan

- `npx tsc --noEmit` from `apps/api` must exit 0, and the full `src/storefront-source/` suite must be no worse than its pre-existing baseline. One failure is known and unrelated: `source-generation.service.spec.ts:174` ("steers planning away from recent fingerprints") was failing before this work began.
- **The real proof is a live generation**, which spends the owner's ChatGPT plan and needs port 3001 free — **ask the owner before running it**. Generate the same brief three times and compare: the spines should differ by construction, and `specificityReport` should show grounded bands rather than filler.
- Check `StoreSourceVersion.snapshot` → `sketch.json` → `structure.params` across recent rows: if one `rhythm` or `opening` dominates, the draw's weights are wrong.
- Watch the veto rate. If responses routinely hit the `floor(length / 3)` cap, the grammar is drawing bands stores cannot fill, and the fix is in `substanceCaps`, not in the cap.
- The Studio is served pre-built by the dashboard: a `source-boceto.ts` change needs a rebuild before the owner sees it.
- Never run `prisma migrate`, `diff` or `reset` against the dev DB from a subagent — a past one wiped it.
- Still open after this plan: per-block variants (`catalog: grid|list|rail|mosaic` and the rest), which is the spec's second plan.
