# YAPI Composition and Band Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let YAPI compose a page instead of filling a form — give each block a real width and hand the model the layout controls the renderer already supports, so two stores stop sharing one skeleton.

**Architecture:** Two stages. The existing sketch call gains four flat per-block fields (`width`, `flip`, `align`, `swap`) and a `style` object whose `'auto'` values defer to the randomly drawn direction. A new, small second call then receives the generated sketch plus the *real* freeable node paths and returns a composition layer (`free`, `extras`, `order`, group `layout`) that the existing repair functions clamp and validate. A failed second call ships the first stage's sketch unchanged.

**Tech Stack:** TypeScript, NestJS (`apps/api`), Jest, a shared-types workspace package (`@pagosya/shared-types`), and Playwright-in-Jest via `withVisualSandbox` for real-browser CSS tests.

**Spec:** `docs/superpowers/specs/2026-10-04-yapi-composition-and-width-design.md`

## Global Constraints

- Repair is **total**: any input must yield a usable sketch plus notes. No code path in this plan may throw on bad model output.
- The merchant never sees an error from composition. A failed stage 2 records a `FAILED` attempt row plus an `autoRepairs` note and ships the stage-1 sketch.
- Old sketches must render **byte-identically** to today. `width` defaults to `'bleed'`, which emits no attribute.
- `free` positions are percentages of the part's positioning box; `sketchFreePos` clamps `x`/`y` to `0..100`, `w` to `5..100`, `r` to `-180..180`.
- Caps are `SKETCH_FREE_MAX = 30` freed parts and `SKETCH_EXTRA_MAX = 12` inserted elements per block.
- `FREE_CSS` lifts freed parts only inside `@media (min-width: 900px)`. No rule added by this plan may position anything absolutely below 900px.
- The `account` page is out of scope everywhere: `SketchAccount` carries no `size`/`width`, builds its own `<section>` rather than using `open()`, and `freeShape` already refuses every path on a block of type `account`.
- Spanish for all merchant-facing copy and prompt text; code comments in English, matching the files being edited.
- **Do not** add a collision nudge for overlapping freed parts. Deliberate overlap is the feature (spec, "Overlap: the accepted residual risk").

## Review Focus

Five conditions the spec implies that the happy-path tests would miss. Each has a test placed in the task that owns the code.

1. **An existing sketch with no `width` and no `style` must re-repair and render exactly as today** — every live store re-renders through this code, so a changed default silently restyles all of them. (Tasks 1 and 2.)
2. **`w: 0` from stage 2 must mean automatic width, not a 5%-wide sliver** — `sketchFreePos` clamps any finite `w` to `[5, 100]`, so the sentinel must be deleted before repair or freed parts shrink instead of failing loudly. (Task 5.)
3. **A composition entry naming a block id that is not in the sketch must be ignored** — the model sees ids as strings and will eventually invent one; it must not crash the merge or create a block. (Task 5.)
4. **Composition aimed at `sticker`, `photo`, an `extras/*` path, or an `account` block must be refused** — `NEVER_FREE` and `freeShape` already encode this, and the merge must route through them rather than assigning `free` directly. (Task 5.)
5. **A chat edit after stage 2 must keep the composition, and a `style` left on `'auto'` must keep the current design rather than resetting to `DEFAULT_SKETCH_STYLE`** — otherwise the merchant's first chat message flattens the page YAPI just composed. (Tasks 4 and 6.)

---

### Task 1: `width` in the sketch type and repair

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (type at :19, repair in the shared layout controls at :378-398)
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export type SketchWidth = 'bleed' | 'wide' | 'narrow' | 'offset-left' | 'offset-right'`; `export const SKETCH_WIDTHS: readonly SketchWidth[]`; `SketchLayout` gains `width?: SketchWidth`. A repaired block carries `width` only when it is not `'bleed'`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`:

```ts
describe('band width', () => {
  it('keeps a valid width and drops bleed, the default', () => {
    const { sketch } = repairSketch({ blocks: [
      { id: 'a', type: 'story', title: 'Hola', width: 'narrow' },
      { id: 'b', type: 'story', title: 'Chau', width: 'bleed' },
    ] }, ctx);
    expect(sketch.blocks.find(b => b.id === 'a')).toMatchObject({ width: 'narrow' });
    expect(sketch.blocks.find(b => b.id === 'b')).not.toHaveProperty('width');
  });
  it('drops an invented width instead of failing', () => {
    const { sketch } = repairSketch({ blocks: [{ id: 'a', type: 'story', title: 'Hola', width: 'ultra-wide' }] }, ctx);
    expect(sketch.blocks.find(b => b.id === 'a')).not.toHaveProperty('width');
  });
  // Review Focus 1: every live store re-renders through repair, so a sketch that predates width must come out untouched.
  it('leaves a sketch that predates width exactly as it was', () => {
    const before = repairSketch({ blocks: [{ id: 'a', type: 'hero', headline: 'Hola' }] }, ctx).sketch;
    expect(before.blocks.every(block => !('width' in block))).toBe(true);
    expect(repairSketch(JSON.parse(JSON.stringify(before)), ctx).sketch).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts -t "band width"`
Expected: FAIL — the first two cases report a missing `width` property, because repair drops the unknown field today.

- [ ] **Step 3: Add the type and the constant**

In `sketch-schema.ts`, directly above `export type SketchLayout`:

```ts
/** A band's horizontal shape. `bleed` is the historical behaviour (edge to edge) and stays the default, so
 * sketches that predate this field render unchanged; the others contain the section's content without ever
 * narrowing its background. */
export type SketchWidth = 'bleed' | 'wide' | 'narrow' | 'offset-left' | 'offset-right';
export const SKETCH_WIDTHS: readonly SketchWidth[] = ['bleed', 'wide', 'narrow', 'offset-left', 'offset-right'];
```

Then add `width` to `SketchLayout`:

```ts
export type SketchLayout = { align?: SketchAlign; flip?: boolean; swap?: boolean; width?: SketchWidth; order?: string[]; layout?: Record<string, SketchGroupLayout>; free?: Record<string, SketchFreePos>; extras?: SketchExtra[] };
```

- [ ] **Step 4: Repair the field**

In `repairSketch`, inside the `if (kept) {` block that starts with the `Shared layout controls` comment, immediately after the two `swap` / `flip` lines:

```ts
      // Band width: `bleed` is the default, so it is stored as absence and old sketches stay byte-identical.
      const blockWidth = block.width as SketchWidth;
      if (SKETCH_WIDTHS.includes(blockWidth) && blockWidth !== 'bleed') kept.width = blockWidth; else delete kept.width;
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts`
Expected: PASS, the whole file — the pre-existing cases prove nothing else moved.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts
git commit -m "feat(sketch): blocks carry a band width, with bleed as the unchanged default"
```

---

### Task 2: Render `width`

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-blocks.ts` (the `open()` helper at :23-31, the `.skb` rules at :496-500)
- Test: `apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts`

**Interfaces:**
- Consumes: `SketchWidth`, `SKETCH_WIDTHS` and `block.width` from Task 1.
- Produces: a `data-skb-width="<value>"` attribute on the `<section>` for any non-`bleed` width, and matching rules inside the exported `SKETCH_BASE_CSS`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts`:

```ts
describe('band width rendering', () => {
  const render = (width?: string) => {
    const { sketch: s } = repairSketch({ blocks: [{ id: 'w1', type: 'story', title: 'Hola', paragraphs: ['Uno'], ...(width ? { width } : {}) }] }, ctx);
    return renderBlock(s.blocks.find(b => b.id === 'w1')!, s, ctx);
  };
  it('emits the attribute for a contained band', () => {
    expect(render('narrow')).toContain('data-skb-width={"narrow"}');
  });
  // Review Focus 1: bleed is absence, so an old sketch's markup cannot change.
  it('emits nothing for bleed or for a sketch without the field', () => {
    expect(render('bleed')).not.toContain('data-skb-width');
    expect(render()).not.toContain('data-skb-width');
  });
  it('contains the content without narrowing the background, and never touches the extras layer', () => {
    // The rules target the section's children, so --skb-bg still paints the full band.
    expect(SKETCH_BASE_CSS).toContain('.skb[data-skb-width="narrow"] > :not(.skb-extras)');
    expect(SKETCH_BASE_CSS).not.toMatch(/\.skb\[data-skb-width="[a-z-]+"\]\s*\{/);
    // Offsets must collapse to centred on phones, so a narrow screen never gets a column beside dead space.
    expect(SKETCH_BASE_CSS).toContain('@media (max-width: 899px)');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-blocks.spec.ts -t "band width rendering"`
Expected: FAIL — `data-skb-width` is never emitted and the CSS strings are absent.

- [ ] **Step 3: Emit the attribute**

In `sketch-blocks.ts`, inside `open()`, after the `flip` line:

```ts
  const width = block.width && block.width !== 'bleed' ? ` data-skb-width=${expr(block.width)}` : '';
```

and add `width` to the returned concatenation, right after `flip`:

```ts
    (label ? ` aria-label=${expr(label)}` : '') + align + flip + width + (extra ? ` ${extra}` : '') +
```

- [ ] **Step 4: Add the CSS**

In `sketch-blocks.ts`, immediately after the `.skb--xl { … }` line:

```css
/* Band width. The rules contain the section's CONTENT, never .skb itself, so the background still paints the full
   band and `position: relative` keeps anchoring freed parts to the whole section — which is how a freed part escapes
   a narrow column. .skb-extras is excluded because it needs inset: 0 to position inserted elements. */
.skb[data-skb-width="wide"] > :not(.skb-extras) { max-width: 76rem; margin-inline: auto; }
.skb[data-skb-width="narrow"] > :not(.skb-extras) { max-width: 44rem; margin-inline: auto; }
.skb[data-skb-width="offset-left"] > :not(.skb-extras) { max-width: 60rem; margin-inline-end: auto; }
.skb[data-skb-width="offset-right"] > :not(.skb-extras) { max-width: 60rem; margin-inline-start: auto; }
/* On phones an offset would leave a cramped column beside dead space, so both offsets centre. The max-widths above
   are no-ops at phone width, so wide and narrow need no override. */
@media (max-width: 899px) {
  .skb[data-skb-width="offset-left"] > :not(.skb-extras),
  .skb[data-skb-width="offset-right"] > :not(.skb-extras) { margin-inline: auto; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-blocks.spec.ts`
Expected: PASS, the whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-blocks.ts apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts
git commit -m "feat(sketch): band width contains a section's content, leaving its colour full width"
```

---

### Task 3: Offer `width`, `flip`, `align` and `swap` to the model

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts` (`SKETCH_JSON_SCHEMA` at :22, the `block()` helper at :16, `sketchPrompt` at :55)
- Test: `apps/api/src/storefront-source/sketch/sketch-request.spec.ts`

**Interfaces:**
- Consumes: `SKETCH_WIDTHS` from Task 1.
- Produces: every entry in the schema's `blocks` array accepts `width`, `flip`, `align` and `swap`, all required (strict mode) with `'bleed'` / `false` / `'start'` / `false` as the inert values.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/sketch/sketch-request.spec.ts`:

```ts
describe('layout controls reach the model', () => {
  const blockSchemas = () => (SKETCH_JSON_SCHEMA.properties.blocks as any).items.anyOf as any[];
  it('offers width, flip, align and swap on every block type, all required for strict mode', () => {
    for (const schema of blockSchemas()) {
      for (const field of ['width', 'flip', 'align', 'swap']) {
        expect(schema.properties).toHaveProperty(field);
        expect(schema.required).toContain(field);
      }
      expect(schema.properties.width.enum).toEqual(['bleed', 'wide', 'narrow', 'offset-left', 'offset-right']);
      expect(schema.additionalProperties).toBe(false);
    }
  });
  it('keeps the composition layer out, so a chat edit can never invent a node path', () => {
    for (const schema of blockSchemas()) {
      for (const field of ['free', 'extras', 'order', 'layout']) expect(schema.properties).not.toHaveProperty(field);
    }
  });
  it('tells the model what the controls are for', () => {
    const prompt = sketchPrompt({ storeName: 'Pan', purpose: 'shop', instruction: 'x', brief: {}, photos: [], catalogNames: [] });
    expect(prompt).toContain('narrow');
    expect(prompt).toContain('offset-left');
  });
});
```

Add `SKETCH_JSON_SCHEMA` to the file's existing import from `./sketch-request` if it is not already there.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-request.spec.ts -t "layout controls reach the model"`
Expected: FAIL on the first case — `width` is absent from every block schema.

- [ ] **Step 3: Add the fields to the shared block helper**

In `sketch-request.ts`, above the `block` helper, add the shared property definitions:

```ts
const width = { type: 'string', enum: [...SKETCH_WIDTHS] } as const;
const alignment = { type: 'string', enum: ['start', 'center', 'end'] } as const;
const bool = { type: 'boolean' } as const;
```

and give every block the four controls by extending the helper itself, so no block type can be forgotten:

```ts
const block = (type: string, props: Record<string, unknown>) => ({
  type: 'object', additionalProperties: false,
  // Layout controls every block accepts. Strict mode requires every property in `required`, so the inert values
  // ('bleed', 'start', false) are how the model says "leave this alone" — repair drops them.
  properties: { id: string, type: { type: 'string', enum: [type] }, bg, size, width, align: alignment, flip: bool, swap: bool, ...props },
  required: ['id', 'type', 'bg', 'size', 'width', 'align', 'flip', 'swap', ...Object.keys(props)],
});
```

Add `SKETCH_WIDTHS` to the existing `./sketch-schema` import at the top of the file.

- [ ] **Step 4: Teach the prompt**

In `sketchPrompt`, immediately after the existing `Tipos de bloque: …` line, insert:

```ts
    `FORMA DE CADA BANDA (esto es lo que hace que dos tiendas no se parezcan): width elige el ancho del contenido — bleed (de borde a borde, como siempre), wide (contenido centrado y ancho), narrow (columna editorial angosta, ideal para story y faq), offset-left / offset-right (contenido a un lado y aire al otro). VARÍA el ancho entre bandas vecinas: un muro de bleed es exactamente el boceto genérico que no queremos. align mueve el texto (start, center, end). flip espeja la foto en hero, split, story y newsletter. swap pone el botón fantasma primero en hero y split. Si no querés tocar algo: width "bleed", align "start", flip false, swap false.`,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-request.spec.ts`
Expected: PASS, the whole file.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-request.ts apps/api/src/storefront-source/sketch/sketch-request.spec.ts
git commit -m "feat(yapi): the sketch call may choose a band's width, alignment, mirror and button order"
```

---

### Task 4: `style` the model may choose, with `'auto'` deferring to the draw

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (`repairSketch` signature at :217, the style block at :245-249)
- Modify: `apps/api/src/storefront-source/sketch/sketch-request.ts` (`SKETCH_JSON_SCHEMA` top-level properties, `sketchPrompt`, `sketchFromResponse` at :92)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (:757-761 fresh path, :800-810 edit path)
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `repairSketch(input, ctx, defaults?: { style?: SketchStyle })` and `sketchFromResponse(body, ctx, defaults?: { style?: SketchStyle })`. A style value that is `'auto'`, invalid or missing falls back to `defaults.style[key]`, else `DEFAULT_SKETCH_STYLE[key]`. No special-casing of the literal `'auto'` is needed, because it is simply not a member of `SKETCH_STYLE_OPTIONS`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`:

```ts
describe('style the model may choose', () => {
  const drawn = { radius: 'square', buttons: 'outline', cards: 'inset', header: 'center', footer: 'center' } as const;
  it('takes a valid choice from the model', () => {
    const { sketch } = repairSketch({ style: { radius: 'soft', buttons: 'auto', cards: 'auto', header: 'auto', footer: 'auto' }, blocks: [] }, ctx, { style: drawn });
    expect(sketch.style.radius).toBe('soft');
  });
  // Review Focus 5: 'auto' must mean "keep what we had", never "reset to the global default".
  it('falls back to the given defaults for auto, invalid and missing values', () => {
    const { sketch } = repairSketch({ style: { radius: 'auto', buttons: 'banana' }, blocks: [] }, ctx, { style: drawn });
    expect(sketch.style).toEqual(drawn);
  });
  it('still falls back to the base style when no defaults are given', () => {
    const { sketch } = repairSketch({ style: { radius: 'auto' }, blocks: [] }, ctx);
    expect(sketch.style).toEqual(DEFAULT_SKETCH_STYLE);
  });
});
```

Add `DEFAULT_SKETCH_STYLE` to the file's existing import from `./sketch-schema`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts -t "style the model may choose"`
Expected: FAIL — `repairSketch` takes two arguments, so the drawn defaults are ignored and every value falls to `DEFAULT_SKETCH_STYLE`.

- [ ] **Step 3: Thread the defaults through repair**

Change the `repairSketch` signature:

```ts
export function repairSketch(input: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle }): { sketch: StoreSketch; notes: string[] } {
```

and replace the style block (the three lines starting `const style = Object.fromEntries(`) with:

```ts
  // Each dimension the model left on 'auto' (or got wrong) comes from the caller's defaults: the drawn direction on a
  // fresh generation, the current sketch on an edit. 'auto' needs no special case — it is not a member of the options.
  const styleBase = defaults?.style ?? DEFAULT_SKETCH_STYLE;
  const style = Object.fromEntries((Object.keys(SKETCH_STYLE_OPTIONS) as (keyof SketchStyle)[]).map(key => {
    const value = rawStyle[key] as string;
    return [key, (SKETCH_STYLE_OPTIONS[key] as readonly string[]).includes(value) ? value : styleBase[key]];
  })) as SketchStyle;
```

- [ ] **Step 4: Pass the defaults through `sketchFromResponse`**

In `sketch-request.ts`:

```ts
export function sketchFromResponse(body: unknown, ctx: SketchContext, defaults?: { style?: SketchStyle }): { sketch: StoreSketch; notes: string[]; parsed: boolean } {
  let value: unknown;
  try { value = sourceResponseJson(body); } catch { value = undefined; }
  const parsed = typeof value === 'object' && value !== null;
  return { ...repairSketch(parsed ? value : undefined, ctx, defaults), parsed };
}
```

Add `SketchStyle` to the existing type import from `./sketch-schema`.

- [ ] **Step 5: Offer `style` in the schema and the prompt**

In `SKETCH_JSON_SCHEMA`, add to `properties` (and add `'style'` to the top-level `required` array):

```ts
    style: { type: 'object', additionalProperties: false, properties: {
      radius: { type: 'string', enum: ['soft', 'round', 'square', 'auto'] },
      buttons: { type: 'string', enum: ['pill', 'square', 'outline', 'auto'] },
      cards: { type: 'string', enum: ['bleed', 'inset', 'outline', 'auto'] },
      header: { type: 'string', enum: ['left', 'center', 'auto'] },
      footer: { type: 'string', enum: ['columns', 'center', 'auto'] },
    }, required: ['radius', 'buttons', 'cards', 'header', 'footer'] },
```

and in `sketchPrompt`, after the new band-shape line from Task 3:

```ts
    `style es el LENGUAJE DE FORMAS de toda la página: radius (soft/round/square), buttons (pill/square/outline), cards (bleed/inset/outline), header (left/center), footer (columns/center). Elegilo para que acompañe al rubro y a la dirección creativa — una carnicería brutalista no lleva botones pill redondeados. Poné "auto" en las dimensiones que no te importen y el diseño las elige.`,
```

- [ ] **Step 6: Use it in both service paths**

In `source-generation.service.ts`, in the `sketchFirst` branch, pass the drawn style as the defaults and stop overwriting the result:

```ts
        const { sketch: drawn, notes, parsed } = sketchFromResponse(body, sketchCtx, { style: direction.style });
        // Fresh generations get the band-rhythm pass (no two adjacent same-bg sections). Boceto hand
        // edits and chat edits never pass through it, so deliberate layouts survive.
        const placed = ensureBandRhythm(ensureAllPhotosUsed(drawn, sketchCtx));
        // `style` now comes from repair (the model's choice, or the drawn direction wherever it said "auto").
        const sketch = { ...placed, blocks: placed.blocks.map(block => (block.type === 'newsletter' ? { ...block, form: direction.newsletterForm } : block)) };
```

In the `sketchEdit` branch, pass the current sketch as the defaults:

```ts
        const edited = sketchFromResponse(body, sketchCtx, { style: currentSketch.style });
```

and replace the `edited.sketch.style = currentSketch.style;` line with a comment, keeping the `carryEditorFields` line that follows it:

```ts
        // Per-block layout (order, group layout, free spots, inserted elements) is absent from the model schema, so the
        // edit reply would reset it; carry it over by block id. `style` is handled by repair's defaults above, so an
        // edit may now change it deliberately while "auto" keeps the current design.
        edited.sketch.blocks = carryEditorFields(currentSketch, edited.sketch);
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/ src/storefront-source/source-generation-agent.spec.ts src/storefront-source/source-generation.service.spec.ts`
Expected: PASS everywhere, with one exception: `source-generation.service.spec.ts:174`, `steers planning away from recent fingerprints`, already fails on this branch before any of your changes (verified 2026-10-04; it asserts a DNA fingerprint differs from a recent one). Confirm it fails the same way as before and leave it alone.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-request.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi): the model picks the page's shape language, and auto defers to the drawn direction"
```

---

### Task 5: The composition module

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (extract two closures as exported helpers)
- Create: `apps/api/src/storefront-source/sketch/sketch-composition.ts`
- Create: `apps/api/src/storefront-source/sketch/sketch-composition.spec.ts`
- Modify: `apps/api/src/storefront-source/sketch/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of 1-4).
- Produces:
  - `export function repairSketchExtras(value: unknown, ctx: SketchContext): SketchExtra[]` — the former local `extras` closure, unchanged in behaviour.
  - `export function repairSketchOrder(value: unknown, allowed: readonly string[] | undefined): string[] | undefined` — the former local `order` closure, unchanged in behaviour.
  - `export const SKETCH_COMPOSITION_SCHEMA` — the stage-2 JSON schema.
  - `export function compositionPrompt(input: { sketch: StoreSketch; energy: string }): string`
  - `export function applySketchComposition(sketch: StoreSketch, raw: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[]; touched: number }`

- [ ] **Step 1: Extract the two closures, with no behaviour change**

Two closures inside `repairSketch` need to become reusable. This is a pure move: no behaviour changes.

**`order`** is `sketch-schema.ts:277-282`. Delete it from inside `repairSketch` and add at module scope, verbatim apart from the signature:

```ts
/** A copy column's element order: known keys only, no repeats, and `undefined` when the result is just the default
 * order (so a block that was never reordered stores nothing). */
export function repairSketchOrder(value: unknown, allowed: readonly string[] | undefined): string[] | undefined {
  if (!allowed || !Array.isArray(value)) return undefined;
  const kept = [...new Set(value.filter((item): item is string => typeof item === 'string' && allowed.includes(item)))];
  const full = [...kept, ...allowed.filter(key => !kept.includes(key))];
  return full.every((key, index) => key === allowed[index]) ? undefined : full;
}
```

**`extras`** is `sketch-schema.ts:291-320` (the arrow function assigned to `const extras`, ending at the `};` on :320). Move those lines to module scope unchanged, as:

```ts
/** Inserted elements (free layer): known kinds with a valid value and position, unique ids, at most 12. */
export function repairSketchExtras(value: unknown, ctx: SketchContext): SketchExtra[] {
  // lines 292-319 of the current closure body, moved verbatim — it already reads `ctx.photos` for the photo kind,
  // which now resolves to the parameter instead of repairSketch's closed-over argument.
}
```

Its body already references `ctx.photos` and `BLOCK_HREF`, both of which remain in scope at module level, so nothing inside it changes. Inside `repairSketch`, the two existing call sites become `repairSketchOrder(...)` as before and `repairSketchExtras(block.extras, ctx)` — the latter gaining the explicit `ctx` argument.

- [ ] **Step 2: Run the existing tests to prove the extraction changed nothing**

Run: `cd apps/api && npx jest src/storefront-source/sketch/`
Expected: PASS, exactly as before the extraction. A single failure here means the move was not faithful — fix it before continuing.

- [ ] **Step 3: Commit the refactor on its own**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts
git commit -m "refactor(sketch): extras and copy-order repair become reusable module functions"
```

- [ ] **Step 4: Write the failing tests for the composition module**

Create `apps/api/src/storefront-source/sketch/sketch-composition.spec.ts`:

```ts
import { applySketchComposition, compositionPrompt, SKETCH_COMPOSITION_SCHEMA } from './sketch-composition';
import { repairSketch } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const base = () => repairSketch({ blocks: [
  { id: 'h1', type: 'hero', headline: 'Pan de verdad', sub: 'Todos los días', photo: 'assets/a.jpg' },
  { id: 's1', type: 'story', title: 'Quiénes somos', paragraphs: ['Uno', 'Dos'] },
] }, ctx).sketch;
const entry = (over: Record<string, unknown>) => ({ id: 'h1', free: [], extras: [], order: [], layout: [], ...over });

it('schema is strict and every property is required, as json_schema demands', () => {
  const item = (SKETCH_COMPOSITION_SCHEMA.properties.blocks as any).items;
  expect(item.additionalProperties).toBe(false);
  expect(item.required).toEqual(['id', 'free', 'extras', 'order', 'layout']);
  expect(item.properties.free.items.required).toEqual(['path', 'x', 'y', 'w', 'r']);
});

it('places a freed part at a real path and clamps it into the band', () => {
  const { sketch, touched } = applySketchComposition(base(), { blocks: [entry({ free: [{ path: 'copy/headline', x: 140, y: -20, w: 40, r: 0 }] })] }, ctx);
  expect(touched).toBe(1);
  expect(sketch.blocks.find(b => b.id === 'h1')!.free).toEqual({ 'copy/headline': { x: 100, y: 0, w: 40 } });
});

// Review Focus 2: sketchFreePos clamps any finite w to [5,100], so a raw 0 would render a 5%-wide sliver.
it('treats w: 0 as automatic width rather than a 5% sliver', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ free: [{ path: 'copy/headline', x: 10, y: 10, w: 0, r: 0 }] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 'h1')!.free!['copy/headline']).toEqual({ x: 10, y: 10 });
});

// Review Focus 3: the model sees ids as strings and will eventually invent one.
it('ignores an entry for a block that does not exist', () => {
  const before = base();
  const { sketch, touched, notes } = applySketchComposition(before, { blocks: [entry({ id: 'nope' })] }, ctx);
  expect(touched).toBe(0);
  expect(sketch).toEqual(before);
  expect(notes.length).toBeGreaterThan(0);
});

// Review Focus 4: NEVER_FREE and freeShape already encode this; the merge must route through them.
it('refuses a spot on a protected part or an invented path', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ free: [
    { path: 'media/photo', x: 10, y: 10, w: 0, r: 0 },
    { path: 'media/sticker', x: 20, y: 20, w: 0, r: 0 },
    { path: 'copy/invented', x: 30, y: 30, w: 0, r: 0 },
  ] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 'h1')).not.toHaveProperty('free');
});

it('keeps a valid inserted element and drops a kind it does not know', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ extras: [
    { id: 'e1a', kind: 'emoji', value: '🥐', href: '', x: 80, y: 10, w: 8, r: 12 },
    { id: 'e2a', kind: 'hologram', value: 'x', href: '', x: 10, y: 10, w: 8, r: 0 },
  ] })] }, ctx);
  const extras = sketch.blocks.find(b => b.id === 'h1')!.extras!;
  expect(extras).toHaveLength(1);
  expect(extras[0]).toMatchObject({ kind: 'emoji', value: '🥐', r: 12 });
});

it('folds the layout array back into the record repair expects, dropping unknown groups', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ id: 's1', layout: [
    { group: 'copy', gap: 'l', dir: '', align: '', valign: 'center' },
    { group: 'nope', gap: 'l', dir: '', align: '', valign: '' },
  ] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 's1')!.layout).toEqual({ copy: { gap: 'l', valign: 'center' } });
});

it('reorders a copy column', () => {
  const { sketch } = applySketchComposition(base(), { blocks: [entry({ id: 's1', order: ['paragraphs', 'title'] })] }, ctx);
  expect(sketch.blocks.find(b => b.id === 's1')!.order).toEqual(['paragraphs', 'title']);
});

it('survives garbage without throwing', () => {
  for (const bad of [undefined, null, 'x', 42, { blocks: 'nope' }, { blocks: [null, 7] }]) {
    expect(() => applySketchComposition(base(), bad, ctx)).not.toThrow();
  }
});

it('prompt carries the real freeable paths and the energy line', () => {
  const prompt = compositionPrompt({ sketch: base(), energy: 'Energía maximalista: stickers en hero.' });
  expect(prompt).toContain('copy/headline');
  expect(prompt).toContain('maximalista');
  // A path the tree does not contain must never be advertised.
  expect(prompt).not.toContain('copy/invented');
});
```

If `copy/headline` or `media/photo` is not what `sketchFreeablePaths` actually returns for a repaired hero, print the real paths once (`console.log(sketchFreeablePaths(base().blocks[0]))`) and use those exact strings — the paths are the renderer's, not ours to choose.

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-composition.spec.ts`
Expected: FAIL — `Cannot find module './sketch-composition'`.

- [ ] **Step 6: Write the composition module**

Create `apps/api/src/storefront-source/sketch/sketch-composition.ts`:

```ts
import { repairSketchFree, repairSketchLayout, sketchFreeablePaths, sketchGroups, SKETCH_COPY_ORDER, SKETCH_EXTRA_KINDS } from '@pagosya/shared-types';
import { repairSketchExtras, repairSketchOrder } from './sketch-schema';
import type { SketchBlock, SketchContext, StoreSketch } from './sketch-schema';

/** Stage 2 of sketch generation (spec 2026-10-04-yapi-composition-and-width-design.md). The first call draws the page;
 * this one composes it. It exists as its own call because `free` is keyed by internal node paths the model cannot
 * guess, and `repairSketchFree` drops an invalid path silently — so freedom has to be granted by a call that is handed
 * the real paths. Everything here is total: any response, including none, leaves the sketch usable. */

const str = { type: 'string' } as const;
const num = { type: 'number' } as const;
/** '' is how the model declines a layout field; strict json_schema has no optional properties. */
const opt = (values: readonly string[]) => ({ type: 'string', enum: [...values, ''] });

export const SKETCH_COMPOSITION_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    blocks: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        id: str,
        // Maps become arrays carrying their own key: strict mode forbids open-ended `additionalProperties`.
        free: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { path: str, x: num, y: num, w: num, r: num }, required: ['path', 'x', 'y', 'w', 'r'] } },
        extras: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { id: str, kind: { type: 'string', enum: [...SKETCH_EXTRA_KINDS] }, value: str, href: str, x: num, y: num, w: num, r: num }, required: ['id', 'kind', 'value', 'href', 'x', 'y', 'w', 'r'] } },
        order: { type: 'array', items: str },
        layout: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { group: str, gap: opt(['s', 'm', 'l']), dir: opt(['row', 'column']), align: opt(['start', 'center', 'end']), valign: opt(['start', 'center', 'end']) }, required: ['group', 'gap', 'dir', 'align', 'valign'] } },
      },
      required: ['id', 'free', 'extras', 'order', 'layout'],
    } },
  },
  required: ['blocks'],
} as { type: 'object'; additionalProperties: false; properties: Record<string, any>; required: string[] };

/** `w: 0` and `r: 0` are the sentinels for "unset". `r: 0` needs no help — sketchFreePos already drops a zero
 * rotation — but a finite `w` is clamped to [5,100], so a raw 0 would render a 5%-wide sliver instead of an
 * automatic width. It must be deleted before repair ever sees it. */
const position = (raw: { x: number; y: number; w: number; r: number }) => ({ x: raw.x, y: raw.y, ...(raw.w ? { w: raw.w } : {}), r: raw.r });

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});

export function compositionPrompt(input: { sketch: StoreSketch; energy: string }): string {
  const lines = input.sketch.blocks.map(block => {
    const paths = sketchFreeablePaths(block);
    const groups = sketchGroups(block.type).map(group => group.key);
    const copyOrder = SKETCH_COPY_ORDER[block.type];
    return `- ${block.id} (${block.type}): partes que podés soltar = ${paths.length ? paths.join(', ') : 'ninguna'}${groups.length ? ` | grupos = ${groups.join(', ')}` : ''}${copyOrder ? ` | orden de la columna = ${copyOrder.join(', ')}` : ''}`;
  });
  return [
    'Ya existe el boceto de esta tienda. Tu trabajo ahora es COMPONERLO: sacar partes de su caja y colocarlas donde quieras, insertar elementos sueltos, reordenar columnas y ajustar los grupos. Devolvé JSON estricto según el esquema.',
    `Boceto actual: ${JSON.stringify(input.sketch)}`,
    `Dirección de esta tienda: ${input.energy}`,
    'PARTES REALES DE CADA BLOQUE (usá EXACTAMENTE estas rutas; una ruta inventada se descarta y tu idea se pierde):',
    ...lines,
    'x e y son porcentajes de la banda (0 = izquierda/arriba, 100 = derecha/abajo). w es el ancho en porcentaje; poné 0 para que sea automático. r son grados de giro; 0 es sin girar.',
    'Ideas de composición, como vocabulario y NO como menú — podés hacer cualquier otra cosa: un titular que monta sobre su foto (x alto, y medio, r pequeño), un badge montado en la esquina de la foto, un emoji grande asomando fuera de una tarjeta, una cifra enorme girada en el margen, dos pastillas desarmadas a distinto alto.',
    'Componé con intención: lo que no aporta, dejalo en su lugar. Un bloque que no querés tocar simplemente no aparece en tu respuesta. En energía minimal casi no toques nada; en maximalista animate.',
    'No tapes un texto con otro texto: si dos cosas caen en el mismo punto, movelas.',
  ].join('\n');
}

/** Merges a composition response into the sketch. Every field goes through the same repair the Boceto's own saves
 * use, so an invented path, an unknown group or a protected part is dropped rather than rendered. */
export function applySketchComposition(sketch: StoreSketch, raw: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[]; touched: number } {
  const notes: string[] = [];
  const entries = asArray(asRecord(raw).blocks).map(asRecord).filter(entry => typeof entry.id === 'string');
  const byId = new Map(entries.map(entry => [entry.id as string, entry]));
  let touched = 0;
  const blocks = sketch.blocks.map(block => {
    const entry = byId.get(block.id);
    if (!entry) return block;
    byId.delete(block.id);
    const next = { ...block } as SketchBlock & Record<string, unknown>;

    const inserted = repairSketchExtras(asArray(entry.extras).map(item => {
      const extra = asRecord(item);
      return { ...extra, ...position({ x: Number(extra.x), y: Number(extra.y), w: Number(extra.w), r: Number(extra.r) }) };
    }), ctx);
    if (inserted.length) next.extras = inserted; else delete next.extras;

    const reordered = repairSketchOrder(entry.order, SKETCH_COPY_ORDER[block.type]);
    if (reordered) next.order = reordered; else delete next.order;

    const layout = repairSketchLayout(block.type, Object.fromEntries(asArray(entry.layout).map(asRecord)
      .filter(item => typeof item.group === 'string')
      .map(item => [item.group as string, Object.fromEntries(Object.entries(item).filter(([key, value]) => key !== 'group' && value !== ''))])));
    if (layout) next.layout = layout; else delete next.layout;

    // Freed parts are named against the block as it now stands, so a spot on an element the composition just
    // reordered or inserted still resolves.
    const free = repairSketchFree(next, Object.fromEntries(asArray(entry.free).map(asRecord)
      .filter(item => typeof item.path === 'string')
      .map(item => [item.path as string, position({ x: Number(item.x), y: Number(item.y), w: Number(item.w), r: Number(item.r) })])));
    if (free) next.free = free; else delete next.free;

    const changed = (['extras', 'order', 'layout', 'free'] as const).some(key => JSON.stringify(next[key]) !== JSON.stringify((block as Record<string, unknown>)[key]));
    if (changed) touched++;
    return next as SketchBlock;
  });
  for (const id of byId.keys()) notes.push(`la composición nombró un bloque que no existe (${id.slice(0, 40)}); se ignoró`);
  return { sketch: { ...sketch, blocks }, notes, touched };
}
```

- [ ] **Step 7: Export the module**

In `apps/api/src/storefront-source/sketch/index.ts`, add:

```ts
export { SKETCH_COMPOSITION_SCHEMA, compositionPrompt, applySketchComposition } from './sketch-composition';
```

and add `repairSketchExtras, repairSketchOrder` to the existing `./sketch-schema` export list.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/`
Expected: PASS, including the whole pre-existing sketch suite.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-composition.ts apps/api/src/storefront-source/sketch/sketch-composition.spec.ts apps/api/src/storefront-source/sketch/index.ts
git commit -m "feat(yapi): a composition pass that places freed parts and extras against the real node paths"
```

---

### Task 6: Wire stage 2 into generation

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (the `sketchFirst` branch, after the `ensureBandRhythm` line)
- Test: `apps/api/src/storefront-source/source-generation-agent.spec.ts` — the `describe('sketch-first new stores')` block at :327. **Not** `source-generation.service.spec.ts`; that file has no sketch harness.

**Interfaces:**
- Consumes: `compositionPrompt`, `SKETCH_COMPOSITION_SCHEMA`, `applySketchComposition` (Task 5); `direction.lines` from `drawSketchDirection`; the `style` defaults wiring from Task 4.
- Produces: a second `attempts` row with `phase: 'composition'`. No new exported API.

- [ ] **Step 1: Fix the existing assertion that stage 2 breaks**

`source-generation-agent.spec.ts:347` currently asserts the sketch path makes exactly one provider call:

```ts
    expect(fetchMock).toHaveBeenCalledTimes(1);
```

A brand-new store now makes two. Change it to `2` and add a line naming why, so the next reader does not "fix" it back:

```ts
    // One call draws the sketch, a second composes it (spec 2026-10-04).
    expect(fetchMock).toHaveBeenCalledTimes(2);
```

That existing test stubs `fetch` with `mockImplementation(async () => sketchResponse())`, so stage 2 receives the sketch JSON. `applySketchComposition` matches its block ids, finds no `free`/`extras`/`order`/`layout`, and changes nothing — so the rest of that test's expectations still hold.

- [ ] **Step 2: Write the failing tests**

Add inside the existing `describe('sketch-first new stores')` block, beside its `sketchResponse` helper:

```ts
  const compositionResponse = (payload: unknown) => new Response(JSON.stringify({ status: 'completed', usage: { input_tokens: 500, output_tokens: 120 }, output: [{ content: [{ type: 'output_text', text: JSON.stringify(payload) }] }] }));
  // The paths belong to the renderer, not to this test, so ask for a real one instead of hardcoding a guess.
  const heroPath = () => {
    const { sketch } = repairSketch(JSON.parse(sketchJson), { storeName: 'pausa', purpose: 'shop', photos: [] });
    return sketchFreeablePaths(sketch.blocks.find(block => block.id === 'h')!)[0];
  };

  it('composes a fresh sketch with a second call and saves the result', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    const path = heroPath();
    const fetchMock = jest.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => sketchResponse())
      .mockImplementationOnce(async () => compositionResponse({ blocks: [{ id: 'h', free: [{ path, x: 55, y: 30, w: 46, r: -3 }], extras: [], order: [], layout: [] }] }));
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second call must carry the composition schema, not the sketch schema.
    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string).text.format.name).toBe('sketch_composition');
    const saved = projects.save.mock.calls[0][2];
    const sketch = JSON.parse(saved.files.find((f: any) => f.path === 'sketch.json').content);
    expect(sketch.blocks.find((b: any) => b.id === 'h').free).toEqual({ [path]: { x: 55, y: 30, w: 46, r: -3 } });
    // The composed spot reaches the rendered page, not only sketch.json.
    expect(saved.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('data-skb-free="on"');
  });

  // The spec's central promise: a composition failure costs a plainer page, never an error.
  it('ships the drawn sketch unchanged when the composition call fails', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    jest.spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => sketchResponse())
      .mockImplementationOnce(async () => { throw new Error('network down'); });
    const result = await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    const saved = projects.save.mock.calls[0][2];
    const sketch = JSON.parse(saved.files.find((f: any) => f.path === 'sketch.json').content);
    expect(sketch.blocks.every((b: any) => !b.free && !b.extras)).toBe(true);
    expect(saved.files.find((f: any) => f.path === 'components/home.tsx').content).toContain('skb-hero');
    expect(result.generation.autoRepairs.some((note: string) => note.startsWith('Composición'))).toBe(true);
  });

  it('asks only for the blocks the sketch actually has, with their real paths', async () => {
    const { service, projects, brief } = await setup();
    newStore(projects);
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await service.generate('m', 's', { ...input(brief), revision: 0 }, new SourceRequestBudget(50));
    const prompt = JSON.parse(fetchMock.mock.calls[1][1]!.body as string).input[0].content[0].text;
    expect(prompt).toContain(heroPath());
    expect(prompt).toContain('(hero)');
  });
```

Add `repairSketch` and `sketchFreeablePaths` to the file's imports (`./sketch` and `@pagosya/shared-types` respectively).

- [ ] **Step 3: Add the chat-edit tests**

A chat edit must not pay for a composition call, and must not lose the composition it inherits. Add beside the sketch-edit tests in the same file (or in the `describe` that covers `sketchEdit`, following its existing stubbing):

```ts
  it('a chat edit makes no composition call and keeps the spots it inherited', async () => {
    const path = heroPath();
    const current = (() => {
      const { sketch } = repairSketch(JSON.parse(sketchJson), { storeName: 'pausa', purpose: 'shop', photos: [] });
      const hero = sketch.blocks.find(block => block.id === 'h')! as any;
      hero.free = { [path]: { x: 55, y: 30, w: 46 } };
      return sketch;
    })();
    const { service, projects, brief } = await setup();
    // An existing sketch store: current() returns a revision above 0 plus sketch.json, as the edit tests set up.
    projects.current.mockResolvedValue({ revision: 3, slug: 'pausa', files: [{ path: 'sketch.json', content: JSON.stringify(current) }] });
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => sketchResponse());
    await service.generate('m', 's', { ...input(brief), revision: 3, instruction: 'cambiá el titular' }, new SourceRequestBudget(50));
    // Review Focus 5: one call only, and the inherited composition survives the edit.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(projects.save.mock.calls[0][2].files.find((f: any) => f.path === 'sketch.json').content);
    expect(saved.blocks.find((b: any) => b.id === 'h').free).toEqual({ [path]: { x: 55, y: 30, w: 46 } });
  });
```

If the edit path's `projects.current` shape differs from the guess above, copy it from whichever existing test in this file drives a `sketchEdit` — do not invent a shape.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-agent.spec.ts -t "sketch-first new stores"`
Expected: FAIL — only one provider call is made, so the composition assertions and the `toHaveBeenCalledTimes(2)` from Step 1 both fail.

- [ ] **Step 5: Add the composition call**

In the `sketchFirst` branch, after the `const sketch = { ...placed, … }` line from Task 4 and before `attempt.status = parsed ? …`, insert:

```ts
        // Stage 2 (spec 2026-10-04): the page gets composed. Total by construction — any failure keeps the drawn
        // sketch, so the merchant loses composition, never the store.
        let composed = sketch;
        const composeAttempt: (typeof attempts)[number] = { model, phase: 'composition', durationMs: 0, status: 'FAILED', usage: null };
        attempts.push(composeAttempt);
        const composePrompt = compositionPrompt({ sketch, energy: direction.lines.join(' ') });
        let composeBody: any = null;
        let composeStatus = 0;
        const composeStarted = Date.now();
        try {
          const allocation = budget.reserve(model, Math.ceil(composePrompt.length / 3) + 2000, 8_000, 500);
          try {
            const response = await fetch(provider.endpoint, { method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(chatgptPlan ? 180_000 : 60_000)]), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(sourceProviderBody({ model, store: false, instructions: 'Componé el boceto: soltá partes, insertá elementos y reordená. Usá solo las rutas listadas. JSON estricto según el esquema.', input: [{ role: 'user', content: [{ type: 'input_text', text: composePrompt }] }], max_output_tokens: allocation.outputTokens, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'sketch_composition', strict: true, schema: SKETCH_COMPOSITION_SCHEMA } } })) });
            composeStatus = response.status;
            composeBody = await response.json().catch(() => null);
          } finally { allocation.settle(composeBody?.usage); }
        } catch (error) { composeAttempt.failureReason = ((error as Error)?.message || 'sin respuesta').slice(0, 300); }
        signal.throwIfAborted();
        composeAttempt.durationMs = Date.now() - composeStarted;
        composeAttempt.usage = sourceUsage(model, composeBody?.usage);
        composeAttempt.responseStatus = typeof composeBody?.status === 'string' ? composeBody.status : composeStatus ? `http_${composeStatus}` : undefined;
        if (typeof composeBody?.incomplete_details?.reason === 'string') composeAttempt.incompleteReason = composeBody.incomplete_details.reason;
        let composeParsed: unknown;
        try { composeParsed = sourceResponseJson(composeBody); } catch { composeParsed = undefined; }
        if (typeof composeParsed === 'object' && composeParsed !== null) {
          const applied = applySketchComposition(sketch, composeParsed, sketchCtx);
          composed = applied.sketch;
          composeAttempt.status = 'COMPLETED';
          autoRepairs.push(...applied.notes.slice(0, 5).map(note => `Composición: ${note}`));
        } else {
          if (!composeAttempt.failureReason) composeAttempt.failureReason = (composeBody?.error?.message || 'respuesta inválida; se usó el boceto sin componer').slice(0, 300);
          autoRepairs.push('Composición: el modelo no compuso la página; se usó el boceto tal como salió.');
        }
        await this.metering?.record(storeId, 'source-generation', model, composeBody, composeAttempt.durationMs, composeAttempt.status);
```

Then change the two lines that consume the sketch to use `composed`:

```ts
        generated = { label: `Boceto de ${sketchCtx.storeName}`.slice(0, 120), files: assembleSketch(composed, sketchCtx) };
        sketchFile = { path: 'sketch.json', content: JSON.stringify(composed, null, 2) + '\n' };
```

Add `applySketchComposition, compositionPrompt, SKETCH_COMPOSITION_SCHEMA` to the existing `./sketch` import, and `sourceResponseJson` to the existing `./source-response` import.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/source-generation-agent.spec.ts`
Expected: PASS, the whole file — including the four existing `sketch-first new stores` cases.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-agent.spec.ts
git commit -m "feat(yapi): new stores get a composition pass, and a failed one still ships the sketch"
```

---

### Task 7: Prove it in a real browser

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-golden.spec.ts`
- Modify: `apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: no new API. These tests are the evidence that width and the free layer compose in a browser rather than only in strings.

- [ ] **Step 1: Write the failing golden test**

Append to `sketch-golden.spec.ts`, following that file's existing assembly helper and imports:

```ts
it('a composed sketch assembles with its free stamps and its band widths', () => {
  const { sketch } = repairSketch({ blocks: [
    { id: 'h1', type: 'hero', headline: 'Pan de verdad', photo: 'assets/a.jpg', width: 'offset-left' },
    { id: 's1', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'narrow' },
  ] }, ctx);
  const composed = applySketchComposition(sketch, { blocks: [
    { id: 'h1', free: [{ path: 'copy/headline', x: 52, y: 24, w: 48, r: -4 }], extras: [{ id: 'e1a', kind: 'emoji', value: '🥐', href: '', x: 86, y: 8, w: 9, r: 0 }], order: [], layout: [] },
  ] }, ctx).sketch;
  const page = assembleSketch(composed, ctx).find(f => f.path === 'index.html')!.content;
  expect(page).toContain('data-skb-width={"offset-left"}');
  expect(page).toContain('data-skb-width={"narrow"}');
  expect(page).toContain('data-skb-free="on"');
  expect(page).toContain('"--skb-fr"');
  expect(page).toContain('🥐');
});
```

- [ ] **Step 2: Write the failing browser tests**

Append to `sketch-canvas-layout.spec.ts`, reusing that file's `withVisualSandbox` + `page` helpers:

```ts
it('a freed part escapes a narrow column on desktop and rejoins it on a phone', async () => {
  const { sketch } = repairSketch({ blocks: [{ id: 's1', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'narrow' }] }, ctx);
  const composed = applySketchComposition(sketch, { blocks: [
    { id: 's1', free: [{ path: 'copy/title', x: 82, y: 10, w: 0, r: 0 }], extras: [], order: [], layout: [] },
  ] }, ctx).sketch;
  await withVisualSandbox(composed, async page => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktop = await page.evaluate(() => {
      const section = document.querySelector('[data-skb="s1"]')!.getBoundingClientRect();
      const title = document.querySelector('[data-skb="s1"] [data-skb-free]')!.getBoundingClientRect();
      const column = document.querySelector('[data-skb="s1"] > :not(.skb-extras)')!.getBoundingClientRect();
      return { past: title.left > column.right, inside: title.left >= section.left && title.right <= section.right + 1 };
    });
    // The freed part leaves the narrow column but never leaves the band: that is the editorial overlap.
    expect(desktop.past).toBe(true);
    expect(desktop.inside).toBe(true);

    await page.setViewportSize({ width: 390, height: 900 });
    const phone = await page.evaluate(() => getComputedStyle(document.querySelector('[data-skb="s1"] [data-skb-free]')!).position);
    expect(phone).toBe('static');
  });
});

it('an offset band centres on a phone', async () => {
  const { sketch } = repairSketch({ blocks: [{ id: 's2', type: 'story', title: 'Historia', paragraphs: ['Uno'], width: 'offset-right' }] }, ctx);
  await withVisualSandbox(sketch, async page => {
    await page.setViewportSize({ width: 390, height: 900 });
    const gaps = await page.evaluate(() => {
      const section = document.querySelector('[data-skb="s2"]')!.getBoundingClientRect();
      const column = document.querySelector('[data-skb="s2"] > :not(.skb-extras)')!.getBoundingClientRect();
      return { left: column.left - section.left, right: section.right - column.right };
    });
    expect(Math.abs(gaps.left - gaps.right)).toBeLessThan(2);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-golden.spec.ts src/storefront-source/sketch/sketch-canvas-layout.spec.ts`
Expected: on a correct Tasks 1-6 implementation these may pass immediately, which is fine and is the point of running them — they are regression evidence, not a red-green cycle. A failure here means the CSS or the stamping is wrong, not the test.

- [ ] **Step 4: Fix whatever the browser disagrees with**

If `desktop.past` is false, the width rules are being applied to `.skb` rather than to its children. If `phone` is not `static`, a rule added in Task 2 escaped the `@media (min-width: 900px)` guard that `FREE_CSS` owns. Correct the CSS in `sketch-blocks.ts`; do not weaken the assertions.

- [ ] **Step 5: Run the full suite**

Run: `cd apps/api && npx jest src/storefront-source/`
Expected: PASS, except the one pre-existing failure named in Task 4 Step 7 (`source-generation.service.spec.ts:174`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-golden.spec.ts apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts
git commit -m "test(sketch): a real browser proves freed parts escape a narrow band and rejoin it on a phone"
```

---

## After the plan

Once every task is committed, the change is still unproven where it matters: on a real store. The spec's success criterion is that two stores stop sharing a skeleton, which only a live generation shows.

- Run the evaluation script against the dev DB rather than trusting unit tests: `node scripts/dev-db.mjs start`, then `cd apps/api && npx ts-node --transpile-only scripts/evaluate-yapi-agent.ts … --i-accept-costs`. It spends the owner's ChatGPT plan and needs port 3001 free, so **ask the owner before running it**.
- Generate the same brief three times and compare the three pages. If they still rhyme, the next sub-project (variants per block type) is the reason, not this one.
- Read `StoreSourceGeneration.attempts` for the new `composition` row before concluding anything about whether composition ran.
- Never run `prisma migrate`, `diff` or `reset` against the dev DB from a subagent (a past one wiped it).
