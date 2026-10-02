# Sketch Schema + Block Library + Assembler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, failure-proof pipeline `unknown JSON → repaired StoreSketch → real Next-source store files` that compiles and screenshots cleanly — the foundation of sketch-first YAPI.

**Architecture:** Three small modules in `apps/api/src/storefront-source/sketch/`: `sketch-schema.ts` (types + `repairSketch`, which never throws), `sketch-blocks.ts` (one TSX/CSS generator per block type, 10 types), `sketch-assembler.ts` (`assembleSketch` → `components/*.tsx` + `styles/globals.css` in the existing Next-source contract). Merchant text is embedded via `JSON.stringify` expressions so no input can break JSX. Commerce mounts (`data-pagosya-catalog`, product template, cart/status/pages) are owned by the catalog/footer/Shell generators, so every assembled store passes `validateNextSources` and `compileNextPreview`.

**Tech Stack:** TypeScript (NestJS repo, jest colocated `.spec.ts`), existing `compileNextPreview` / `validateNextSources` (confirm import paths from `agent/agent-verify.ts` before Task 1), `captureAgentDraft` for the visual golden test, font ids from `../source-font-catalog`.

**Spec:** `docs/superpowers/specs/2026-10-02-sketch-first-yapi-program.md` (sub-project 1).

## Global Constraints

- `repairSketch` and `assembleSketch` are pure and total: no I/O, no model calls, **never throw** on any input (spec: "the sketch loop may never surface an error").
- Fonts only from `SOURCE_FONT_CATALOG` ids; photos only from the `ctx.photos` allowlist; colors normalized to `#rrggbb`.
- Output paths must satisfy `nextSourceFile()` (`components/**/*.tsx`, `styles/globals.css`).
- Shop stores always contain the catalog mounts and the Shell cart/status mounts; no authored shopper `<input>` anywhere (newsletter block renders a link, not a form).
- All classNames prefixed `skb-`; every block `<section>` carries `data-skb={id}` for later Studio selection.
- From `apps/api`: run tests with `npx jest src/storefront-source/sketch --runInBand`.

## Review Focus

- Hostile/odd merchant text (`"</section><script>"`, backticks, `${}`, emoji, 500-char headlines) must render as literal text — pinned in Task 2 (escaping test) and Task 4 (compile test with hostile sketch).
- Photo paths not in the store (model hallucinates `assets/foo.jpg`) must be dropped/replaced, never emitted — pinned in Task 1 (repair) and Task 3 (assembler references test).
- A shop sketch with no catalog block, or no footer, must still produce a working store — repair inserts them — pinned in Task 1.
- `blocks: []`, `null`, `"garbage"`, deeply wrong shapes must yield a usable default sketch — pinned in Task 1 (`repairSketch(undefined)` test).
- Duplicate block ids would break Studio selection and React keys — repair dedupes — pinned in Task 1.
- Unreadable palette (ink ≈ bg luminance) — repair swaps ink to black/white per bg — pinned in Task 1.

---

### Task 1: Sketch types + `repairSketch`

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-schema.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Produces (used by Tasks 2–4):

```ts
export type SketchPalette = { paper: string; ink: string; accent: string; deep: string; pop: string };
export type SketchSize = 's' | 'm' | 'l' | 'xl';
export type SketchBg = keyof SketchPalette;
export type SketchBlock =
  | { id: string; type: 'hero'; variant: 'photo-right' | 'full-bleed' | 'stacked'; headline: string; sub: string; cta: string; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'marquee'; text: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'catalog'; kicker: string; title: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'story'; title: string; paragraphs: string[]; photo?: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'reviews'; title: string; quotes: Array<{ text: string; name: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'faq'; title: string; items: Array<{ q: string; a: string }>; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'banner'; headline: string; cta: string; href: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'gallery'; title: string; photos: string[]; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'newsletter'; title: string; note: string; cta: string; bg: SketchBg; size: SketchSize }
  | { id: string; type: 'footer'; tagline: string; wordmark: 'giant' | 'plain'; bg: SketchBg; size: SketchSize };
export type StoreSketch = { palette: SketchPalette; fonts: { display: string; text: string }; scale: SketchSize; blocks: SketchBlock[] };
export type SketchContext = { storeName: string; purpose: 'shop' | 'services'; photos: string[] };
export const SKETCH_BLOCK_TYPES: ReadonlyArray<SketchBlock['type']>;
export function repairSketch(input: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[] };
```

Repair rules (each one line of logic, each tested): non-object input → default sketch (hero + catalog + footer, warm default palette, `fraunces`/`epilogue`); colors → normalize 3/6-digit hex else role default; fonts → exact catalog id else default; unknown block type → drop + note; missing/duplicate id → assign `b1…bn`; text fields → `String(...).slice(0, limit)` (headline 120, paragraph 600, 6 paragraphs/quotes/items, 12 gallery photos); photo not in `ctx.photos` → drop field (hero/story) or filter (gallery), note; shop without `catalog` → insert after first block; no `footer` → append; `footer` not last → move last; ink/paper contrast: if |luminance(paper) − luminance(ink)| < 0.25 → ink becomes `#111111` or `#ffffff`, whichever is farther from paper.

- [ ] **Step 1: Write the failing spec** — `sketch-schema.spec.ts` with (at minimum):

```ts
import { repairSketch, SKETCH_BLOCK_TYPES } from './sketch-schema';
const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
describe('repairSketch', () => {
  it('builds a usable default from garbage', () => {
    for (const bad of [undefined, null, 'x', 42, { blocks: 'nope' }]) {
      const { sketch } = repairSketch(bad, ctx);
      expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
      expect(sketch.blocks.at(-1)?.type).toBe('footer');
      expect(sketch.palette.paper).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it('clamps fonts and colors to the catalogs', () => {
    const { sketch, notes } = repairSketch({ fonts: { display: 'comic-sans', text: 'epilogue' }, palette: { paper: 'red!!' }, blocks: [] }, ctx);
    expect(sketch.fonts.text).toBe('epilogue');
    expect(sketch.fonts.display).not.toBe('comic-sans');
    expect(notes.length).toBeGreaterThan(0);
  });
  it('drops hallucinated photos and unknown block types, dedupes ids, inserts catalog+footer', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'x', type: 'hero', headline: 'Hola', photo: 'assets/nope.jpg' },
      { id: 'x', type: 'hologram' },
      { id: 'x', type: 'gallery', photos: ['assets/a.jpg', 'assets/nope.jpg'] },
    ] }, ctx);
    const ids = sketch.blocks.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sketch.blocks.find(b => b.type === 'hero')).not.toHaveProperty('photo');
    expect((sketch.blocks.find(b => b.type === 'gallery') as any).photos).toEqual(['assets/a.jpg']);
    expect(sketch.blocks.some(b => b.type === 'catalog')).toBe(true);
    expect(sketch.blocks.at(-1)?.type).toBe('footer');
  });
  it('never throws and fixes unreadable ink', () => {
    const { sketch } = repairSketch({ palette: { paper: '#ffffff', ink: '#fefefe' } }, ctx);
    expect(sketch.palette.ink === '#111111' || sketch.palette.ink === '#000000').toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts --runInBand` → FAIL (module not found).
- [ ] **Step 3: Implement `sketch-schema.ts`** — types above; import `SOURCE_FONT_CATALOG` from `../source-font-catalog` for the font-id set; small pure helpers (`hex`, `luminance`, `clampText`); build `repairSketch` as a sequence of the repair rules, collecting `notes: string[]`. Default palette: `{ paper:'#f6ecd9', ink:'#1f2a24', accent:'#e35336', deep:'#1e3a2f', pop:'#f2c94c' }`.
- [ ] **Step 4: Run to verify pass** — same command → PASS.
- [ ] **Step 5: Typecheck + commit** — `npx tsc --noEmit -p apps/api` clean; `git add apps/api/src/storefront-source/sketch/ && git commit -m "feat(sketch): StoreSketch schema and total repairSketch"`.

### Task 2: Block generators (`sketch-blocks.ts`)

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-blocks.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts`

**Interfaces:**
- Consumes: `SketchBlock`, `SketchContext`, `StoreSketch` from Task 1.
- Produces (used by Task 3):

```ts
export const SKETCH_BASE_CSS: string;                        // skb- layout/scale rules incl. size presets s/m/l/xl
export function blockCss(type: SketchBlock['type']): string; // static CSS for that type
export function renderBlock(block: SketchBlock, sketch: StoreSketch, ctx: SketchContext): string; // one JSX <section>…
```

Rules: every string from the sketch is emitted as `{<JSON.stringify(value)>}` (text) or `src={JSON.stringify(value)}`-style attribute expressions — never interpolated raw. Every section opens `<section data-skb={JSON.stringify(id)} className={...} style={{ ['--skb-bg' as string]: palette[bg], ['--skb-ink' as string]: ink }}>`. `catalog` emits the `<template data-pagosya-product-template>` card (clone the pausa card markup with `skb-card` classes) plus `<div className="skb-list" data-pagosya-catalog />`. `footer` emits `<nav data-pagosya-pages …/>` and, for `wordmark:'giant'`, the store name in a `skb-wordmark` h-element sized `clamp(4rem, 18vw, 16rem)`. `newsletter` emits a styled link (`cta` → `href="checkout.html"`), **no input**. `marquee` duplicates its text in a `skb-marquee__track` with a CSS animation plus `@media (prefers-reduced-motion: reduce)` disabling it (lives in `SKETCH_BASE_CSS`).

- [ ] **Step 1: Failing spec:**

```ts
import { renderBlock, blockCss, SKETCH_BASE_CSS } from './sketch-blocks';
import { repairSketch } from './sketch-schema';
const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const { sketch } = repairSketch({ blocks: [{ id: 'h1', type: 'hero', headline: '</section><script>alert(1)</script>`${x}`' }] }, ctx);
it('escapes hostile text via JSON.stringify expressions', () => {
  const out = renderBlock(sketch.blocks[0], sketch, ctx);
  expect(out).toContain(JSON.stringify('</section><script>alert(1)</script>`${x}`'));
  expect(out).not.toContain('<script>alert');
});
it('catalog block carries both commerce mounts', () => {
  const catalog = sketch.blocks.find(b => b.type === 'catalog')!;
  const out = renderBlock(catalog, sketch, ctx);
  expect(out).toContain('data-pagosya-product-template');
  expect(out).toContain('data-pagosya-catalog');
});
it('footer carries pages nav and giant wordmark, newsletter has no input', () => {
  const footer = sketch.blocks.at(-1)!;
  expect(renderBlock(footer, sketch, ctx)).toContain('data-pagosya-pages');
  const news = repairSketch({ blocks: [{ id: 'n', type: 'newsletter', title: 'Únete' }] }, ctx).sketch.blocks.find(b => b.type === 'newsletter')!;
  expect(renderBlock(news, sketch, ctx)).not.toContain('<input');
});
it('every type has css and base css covers sizes and reduced motion', () => {
  for (const b of sketch.blocks) expect(blockCss(b.type).length).toBeGreaterThan(0);
  expect(SKETCH_BASE_CSS).toContain('prefers-reduced-motion');
  for (const s of ['s','m','l','xl']) expect(SKETCH_BASE_CSS).toContain(`skb--${s}`);
});
```

- [ ] **Step 2: Run → FAIL** (module not found).
- [ ] **Step 3: Implement** — one `const hero = (b, sketch, ctx) => ...` per type returning a template-literal of JSX whose dynamic parts are all `JSON.stringify`ed; `blockCss` from a `Record<type, string>`; `SKETCH_BASE_CSS` defines `.skb` section padding per `skb--s/m/l/xl`, display/text font vars, marquee keyframes + reduced-motion guard, `.skb-wordmark` clamp sizing.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(sketch): 10 block generators with escaped content and commerce mounts"`.

### Task 3: Assembler (`sketch-assembler.ts`)

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-assembler.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-assembler.spec.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 2 generators.
- Produces (used by Task 4 and sub-project 2): `export function assembleSketch(sketch: StoreSketch, ctx: SketchContext): SourceProjectFileDto[]` (import `SourceProjectFileDto` from wherever `agent/agent-verify.ts` imports it — confirm by grep before coding).

Emits exactly: `components/home.tsx` (Shell import + non-footer blocks in `<main id="contenido">` + footer block after main), `components/Shell.tsx` (Header with `data-cart-open` + `data-cart-count`, `data-pagosya-cart`, `data-pagosya-status` — modeled on pausa's Shell, `skb-` classes, store name from `./store-data`), `components/product.tsx` and `components/checkout.tsx` (minimal, copied idiom from pausa with `skb-` classes), `styles/globals.css` (two `@font-face` for `assets/<fonts.display>.ttf` / `assets/<fonts.text>.ttf` with `font-display: swap`, `:root` palette vars, `SKETCH_BASE_CSS`, then `blockCss` for each distinct type used). Pure function; same input → byte-identical output.

- [ ] **Step 1: Failing spec:**

```ts
import { assembleSketch } from './sketch-assembler';
import { repairSketch } from './sketch-schema';
import { nextSourceFile } from '../source-next';
const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const full = repairSketch({ blocks: [
  { id: 'h', type: 'hero', headline: 'Algo dulce', sub: 'sub', cta: 'Ver', photo: 'assets/a.jpg' },
  { id: 'm', type: 'marquee', text: 'Horneado · Fresco' },
  { id: 's', type: 'story', title: 'Proceso', paragraphs: ['uno'] },
  { id: 'r', type: 'reviews', title: 'Clientes', quotes: [{ text: 'rico', name: 'Ana' }] },
  { id: 'f', type: 'faq', items: [{ q: '¿Envíos?', a: 'Sí' }] },
  { id: 'b', type: 'banner', headline: 'Haz espacio', cta: 'Comprar' },
  { id: 'g', type: 'gallery', photos: ['assets/a.jpg'] },
  { id: 'n', type: 'newsletter', title: 'Únete' },
] }, ctx).sketch;
it('emits only next-source paths with all mounts and fonts', () => {
  const files = assembleSketch(full, ctx);
  expect(files.every(f => nextSourceFile(f.path))).toBe(true);
  const all = files.map(f => f.content).join('\n');
  for (const mount of ['data-pagosya-catalog', 'data-pagosya-product-template', 'data-pagosya-cart', 'data-pagosya-status', 'data-cart-open', 'data-pagosya-pages']) expect(all).toContain(mount);
  const css = files.find(f => f.path === 'styles/globals.css')!.content;
  expect(css).toContain(`assets/${full.fonts.display}.ttf`);
  expect(css).toContain('font-display: swap');
});
it('references only allowlisted photos and is deterministic', () => {
  const files = assembleSketch(full, ctx);
  const refs = files.map(f => f.content).join('\n').match(/assets\/[\w.-]+\.(?:jpg|jpeg|png|webp|avif)/g) || [];
  expect(new Set(refs)).toEqual(new Set(['assets/a.jpg']));
  expect(assembleSketch(full, ctx)).toEqual(files);
});
it('passes validateNextSources for a shop', async () => {
  const { validateNextSources } = await import('../source-next-validate'); // fix the path to match agent-verify.ts
  expect(() => validateNextSources(assembleSketch(full, ctx), 'shop')).not.toThrow();
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `assembleSketch`** per the emission list above (Shell/product/checkout as fixed template literals with no merchant-controlled interpolation; home.tsx joins `renderBlock` outputs in block order).
- [ ] **Step 4: Run → PASS** (if `validateNextSources` demands something more — e.g. a product-page mount — add it to the fixed `product.tsx` and record it in the commit message).
- [ ] **Step 5: Typecheck + commit** — `git commit -m "feat(sketch): deterministic assembler to next-source files"`.

### Task 4: Compile + visual golden test

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-golden.spec.ts`

**Interfaces:**
- Consumes: `assembleSketch`, `repairSketch`; `compileNextPreview` (same import `agent/agent-verify.ts` uses), `captureAgentDraft` from `../agent/agent-capture` — copy the snapshot/screenshot harness from `agent/agent-scratch-preview.spec.ts`, which already builds a preview from files and screenshots it.

- [ ] **Step 1: Write the golden spec** — three cases: (a) the full 10-block sketch from Task 3 compiles via `compileNextPreview(files, 'shop')` without throwing; (b) a hostile sketch (headline `'</main>{'` + backticks + 400-char emoji paragraph) compiles too; (c) screenshot `index.html` at 1280 and 390 via `captureAgentDraft` and assert `shot.errors` is empty at both widths. `jest.setTimeout(120_000)`.
- [ ] **Step 2: Run honestly** — `npx jest src/storefront-source/sketch --runInBand`; fix generator CSS/markup until page errors are empty (likely items: `#contenido` skip target, `img` alt attributes — both already specified in the generators).
- [ ] **Step 3: Full sketch suite + typecheck** — all green; `npx tsc --noEmit -p apps/api` clean.
- [ ] **Step 4: Commit** — `git commit -m "test(sketch): golden compile + screenshot for the full block set"`.

### Task 5: Barrel export + program status note

**Files:**
- Create: `apps/api/src/storefront-source/sketch/index.ts` (re-export `repairSketch`, `assembleSketch`, all types, `SKETCH_BLOCK_TYPES`)
- Modify: `docs/superpowers/specs/2026-10-02-sketch-first-yapi-program.md` (status line: sub-project 1 built, with commit hashes)

- [ ] **Step 1: Write the barrel and the status note.**
- [ ] **Step 2: Typecheck, run the sketch suite once more, commit** — `git commit -m "feat(sketch): public sketch module API; mark sub-project 1 built"`.
