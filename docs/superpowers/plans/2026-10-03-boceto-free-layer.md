# Boceto Free Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Boceto, any part (title, text, button, label, card, cajita, pill, review…) can be pulled out of its box and float anywhere inside its section, and "+ Insertar" drops emojis, texts, buttons, photos and icons onto a block. Desktop keeps the exact spots; phones put everything back in the column.

**Architecture:** Two editor-only block fields, `free` (path → spot) and `extras` (inserted elements), live in `sketch.json`. The shared structure module decides what may be freed and keeps `free` in step when lists change. The API repairs both and the one renderer stamps them onto the generated JSX (freed parts get `data-skb-free` + CSS variables `--skb-fx/fy/fw/fr`; extras render as a layer at the end of the section). Base CSS places `[data-skb-free]` absolutely only from 900px up. The canvas script detaches a part dragged 24px past its box, moves free parts, resizes them from a corner, and applies positions live. The Studio stores what the canvas posts and adds the inspector controls.

**Tech Stack:** TypeScript shared-types (built to `dist`), NestJS + Jest (apps/api), vanilla ES5 preview script + Vitest/jsdom (packages/storefront-preview), vanilla TS + Vitest/jsdom (apps/merchant-studio).

**Spec:** `docs/superpowers/specs/2026-10-03-boceto-free-layer-design.md`

## Global Constraints

- Desktop breakpoint: `900px` (free spots apply at `min-width: 900px`; the canvas only frees parts when `window.innerWidth >= 900`).
- Detach threshold: the pointer leaves the part's container box by more than `24` px.
- Limits: `free` ≤ 30 entries; `extras` ≤ 12 per block; extra id `^e[a-z0-9]{3,10}$`; emoji ≤ 16 chars and contains `\p{Extended_Pictographic}`; text ≤ 120; button label ≤ 40; icon `^[a-z0-9-]{2,40}$`; `x`,`y` 0–100 at 0.1; `w` 5–100 at 0.1; `r` integer −180–180 (0 omitted).
- Button `href`: `^(#|index\.html|productos\.html|checkout\.html|galeria\.html)` or `^https://wa\.me/\d{6,15}$`, else `checkout.html`.
- Never freeable: top-level nodes (`copy`, `media`, `head`, `items`, `row`, `intro`, a block-level `sticker`), any `sticker`, the column `photo` (`media/photo`), `extras/*` (already free), anything on the account page. (The owner's summary: "Los grupos enteros (la columna de texto, la foto) no se sueltan.")
- Positions never nest: freeing a part rejoins any freed part inside it; a part inside a freed part is not freeable.
- Copy, verbatim: `Volver a su lugar`, `Giro` (`0°`, `−8°`, `8°`, `15°`), `Insertar`, chips `+ Emoji`, `+ Texto`, `+ Botón`, `+ Foto`, `+ Ícono`, `Lleva a` (`Catálogo`, `Pedido`, `Inicio`, `WhatsApp`), `Eliminar`, Capas group `Elementos sueltos`, kind labels `Emoji`, `Texto`, `Botón`, `Foto`, `Ícono`, freed parts in Capas prefixed `↗ `.
- CSS variable names: `--skb-fx`, `--skb-fy`, `--skb-fw` (unitless percentages), `--skb-fr` (unitless degrees). Never reuse `--skb-r` (corner radius).
- Message: `pagosya:boceto-free { id, path, x, y, w? }`.
- The API resolves `@pagosya/shared-types` from `dist`: run `pnpm --filter @pagosya/shared-types build` before API tests whenever the shared module changes. The Studio resolves it from `src`.
- Never run `prisma migrate/diff/reset`; no schema change is needed.
- The owner's dev servers read this working tree; after Studio changes run `pnpm run build:studio` in `apps/merchant-dashboard`.
- Leave the unrelated uncommitted changes in `apps/api/src/storefront-source/source-publishing.service*.ts` alone; stage only this plan's files.

## Review Focus

1. A merchant frees review card 2, then deletes review 1 (or reorders the list) → the same review stays where it was put; the free spot follows its item, or goes with it (pinned in Task 1: `remapFree` via `sketchApplyMove`/`sketchRemoveNode`; Task 5: the list editor's ✕ goes through `sketchRemoveNode`).
2. A merchant frees the button row while a button inside it is already free (or tries to free a button inside a free row) → positions never nest; the inner one rejoins (pinned in Task 1 `sketchSetFree`, Task 2 repair).
3. The board is narrower than 900 px → nothing detaches and free drags do not start, because nothing floats there (pinned in Task 4).
4. A YAPI chat edit removes a freed element (the second button) or turns the block into another type → the stale spot is dropped silently; a type change drops `free` but keeps `extras` (pinned in Task 2).
5. A store name or text containing `data-skb-node="x"`, `<`, `{` or `}` → stamping touches only real attributes of real tags (pinned in Task 3).

---

### Task 1: Shared structure — freeable parts, extras in the tree, free spots follow their items

**Files:**
- Modify: `packages/shared-types/src/sketch-structure.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-structure.spec.ts`

**Interfaces:**
- Produces (all exported from `@pagosya/shared-types`):
  - `type SketchFreePos = { x: number; y: number; w?: number; r?: number }`
  - `type SketchExtraKind = 'emoji' | 'text' | 'button' | 'photo' | 'icon'`
  - `type SketchExtra = SketchFreePos & { id: string; kind: SketchExtraKind; value: string; href?: string }`
  - `SKETCH_EXTRA_KINDS: readonly SketchExtraKind[]`, `SKETCH_EXTRA_MAX = 12`, `SKETCH_FREE_MAX = 30`, `SKETCH_EXTRA_LABEL: Record<SketchExtraKind, string>`
  - `sketchFreePos(raw: unknown): SketchFreePos | undefined` — clamps/rounds per Global Constraints.
  - `sketchCanFree(block, path): boolean`, `sketchFreeablePaths(block): string[]` (freeable paths without a freed ancestor, in tree order).
  - `sketchSetFree(block, path, pos): boolean`, `sketchUnfree(block, path): void`.
  - `repairSketchFree(block, raw): Record<string, SketchFreePos> | undefined`.
  - `sketchListPath(type, field): string | undefined` — the node path of an array field's group (`reviews`/`quotes` → `items`, `split`/`pills` → `copy/pills`).
  - `sketchNodeTree` appends `{ path: 'extras', key: 'extras', label: 'Elementos sueltos', children: [{ path: 'extras/<id>', key: <id>, label: <kind label> }] }` when `block.extras` is non-empty (never on the account page).
  - `sketchCanMove(block, path)` is false for a freed path. `sketchApplyMove` (array) and `sketchRemoveNode` (array, single element, extra) keep `block.free` in step; `sketchCanRemove`/`sketchRemoveNode` accept `extras/<id>`.

- [ ] **Step 1: Write the failing tests** (append to the spec file; extend its import with `repairSketchFree, sketchCanFree, sketchFreeablePaths, sketchFreePos, sketchListPath, sketchSetFree, sketchUnfree`)

```ts
describe('free layer', () => {
  const steps = () => ({ id: 's', type: 'steps', kicker: '', title: 'T', note: '', items: [{ icon: 'a', title: '1', text: '' }, { icon: 'b', title: '2', text: '' }, { icon: 'c', title: '3', text: '' }], bg: 'paper', size: 'm' }) as any;
  it('frees any inner part but never a top-level group, the sticker, the column photo or the account page', () => {
    const block = hero();
    for (const path of ['copy/headline', 'copy/actions', 'copy/actions/cta', 'copy/actions/cta2', 'media/caption']) expect(sketchCanFree(block, path)).toBe(true);
    for (const path of ['', 'copy', 'media', 'media/photo', 'media/sticker', 'copy/missing', 'extras/eab1']) expect(sketchCanFree(block, path)).toBe(false);
    expect(sketchCanFree({ ...hero(), cta2: '' }, 'copy/actions/cta2')).toBe(false);
    expect(sketchCanFree({ ...hero(), photo: undefined }, 'sticker')).toBe(false);
    expect(sketchCanFree(steps(), 'items/1')).toBe(true);
    expect(sketchCanFree({ id: 'account', type: 'account', kicker: 'K', title: 'T', lead: 'L', perks: [{ icon: 'x', text: 'p' }] }, 'intro/title')).toBe(false);
  });
  it('lists extras last as "Elementos sueltos", labelled by kind', () => {
    const tree = sketchNodeTree({ ...hero(), extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }, { id: 'ecd2', kind: 'button', value: 'Pedir', x: 2, y: 2 }] });
    const extras = tree[tree.length - 1];
    expect([extras.path, extras.label]).toEqual(['extras', 'Elementos sueltos']);
    expect(extras.children.map(node => [node.path, node.label])).toEqual([['extras/eab1', 'Emoji'], ['extras/ecd2', 'Botón']]);
    expect(sketchNodeTree(hero()).some(node => node.key === 'extras')).toBe(false);
  });
  it('a freed part no longer reorders, and nothing inside it is freeable', () => {
    const block = { ...steps(), free: { 'items/1': { x: 1, y: 1 } } };
    expect(sketchCanMove(block, 'items/1')).toBe(false);
    expect(sketchCanMove(block, 'items/0')).toBe(true);
    const row = { ...hero(), free: { 'copy/actions': { x: 1, y: 1 } } };
    expect(sketchFreeablePaths(row)).toContain('copy/actions');
    expect(sketchFreeablePaths(row)).not.toContain('copy/actions/cta');
  });
  it('positions never nest: freeing a row rejoins its freed button; a button inside a freed row is refused', () => {
    const block = { ...hero(), free: { 'copy/actions/cta': { x: 1, y: 1 } } };
    expect(sketchSetFree(block, 'copy/actions', { x: 5, y: 6 })).toBe(true);
    expect(block.free).toEqual({ 'copy/actions': { x: 5, y: 6 } });
    expect(sketchSetFree(block, 'copy/actions/cta2', { x: 1, y: 1 })).toBe(false);
    expect(sketchSetFree(block, 'copy', { x: 1, y: 1 })).toBe(false);
    sketchUnfree(block, 'copy/actions');
    expect(block.free).toBeUndefined();
  });
  it('free spots follow their item when a list is reordered or shortened', () => {
    const moved = { ...steps(), free: { 'items/0': { x: 1, y: 1 } } };
    expect(sketchApplyMove(moved, 'items', ['2', '0', '1'])).toBe('reload');
    expect(moved.free).toEqual({ 'items/1': { x: 1, y: 1 } });
    const cut = { ...steps(), free: { 'items/2': { x: 2, y: 2 }, 'items/0': { x: 3, y: 3 } } };
    expect(sketchRemoveNode(cut, 'items/0')).toBe(true);
    expect(cut.free).toEqual({ 'items/1': { x: 2, y: 2 } });
    const single = { ...hero(), free: { 'copy/sub': { x: 1, y: 1 } } };
    expect(sketchRemoveNode(single, 'copy/sub')).toBe(true);
    expect(single.free).toBeUndefined();
  });
  it('an inserted element is removed by id', () => {
    const block = { ...hero(), extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }] };
    expect(sketchCanRemove(block, 'extras/eab1')).toBe(true);
    expect(sketchCanRemove(block, 'extras/zzzz')).toBe(false);
    expect(sketchRemoveNode(block, 'extras/eab1')).toBe(true);
    expect(block.extras).toBeUndefined();
  });
  it('clamps positions and repairs a free map', () => {
    expect(sketchFreePos({ x: 140.04, y: -3, w: 2, r: 8.6 })).toEqual({ x: 100, y: 0, w: 5, r: 9 });
    expect(sketchFreePos({ x: 1, y: 2, r: 0 })).toEqual({ x: 1, y: 2 });
    expect(sketchFreePos({ x: 'a', y: 2 })).toBeUndefined();
    expect(repairSketchFree(hero(), { 'copy/headline': { x: 1, y: 2 }, copy: { x: 1, y: 1 }, 'media/sticker': { x: 1, y: 1 }, 'copy/nope': { x: 1, y: 1 }, 'copy/sub': 'x' })).toEqual({ 'copy/headline': { x: 1, y: 2 } });
    expect(repairSketchFree(hero(), { 'copy/actions/cta': { x: 1, y: 1 }, 'copy/actions': { x: 2, y: 2 } })).toEqual({ 'copy/actions': { x: 2, y: 2 } });
    expect(repairSketchFree(hero(), [])).toBeUndefined();
    expect(sketchListPath('reviews', 'quotes')).toBe('items');
    expect(sketchListPath('split', 'pills')).toBe('copy/pills');
    expect(sketchListPath('hero', 'pills')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @pagosya/shared-types build && cd apps/api && npx jest src/storefront-source/sketch/sketch-structure.spec.ts`
Expected: the new tests FAIL (`sketchCanFree` is not exported).

- [ ] **Step 3: Implement** in `packages/shared-types/src/sketch-structure.ts`.

Add after the `SketchNode` type:

```ts
/** Free layer (spec 2026-10-03-boceto-free-layer-design): a freed part's spot and an inserted element, in percentages
 * of the part's positioning box (its section, or the photo column for parts inside it); `r` is degrees. */
export type SketchFreePos = { x: number; y: number; w?: number; r?: number };
export type SketchExtraKind = 'emoji' | 'text' | 'button' | 'photo' | 'icon';
export type SketchExtra = SketchFreePos & { id: string; kind: SketchExtraKind; value: string; href?: string };
export const SKETCH_EXTRA_KINDS: readonly SketchExtraKind[] = ['emoji', 'text', 'button', 'photo', 'icon'];
export const SKETCH_EXTRA_LABEL: Record<SketchExtraKind, string> = { emoji: 'Emoji', text: 'Texto', button: 'Botón', photo: 'Foto', icon: 'Ícono' };
export const SKETCH_EXTRA_MAX = 12;
export const SKETCH_FREE_MAX = 30;
```

Rename the current `sketchNodeTree` to `function partsTree(block: any): SketchNode[]` (body unchanged) and add:

```ts
/** The block's nodes as the canvas renders them (the renderer stamps the same keys), skipping empty optional parts;
 * inserted elements come last, under "Elementos sueltos". */
export function sketchNodeTree(block: any): SketchNode[] {
  const nodes = partsTree(block);
  const extras = Array.isArray(block?.extras) && block.type !== 'account' ? block.extras.filter((extra: any) => extra && typeof extra.id === 'string') : [];
  if (!extras.length) return nodes;
  return [...nodes, { path: 'extras', key: 'extras', label: 'Elementos sueltos', children: extras.map((extra: any) => ({ path: `extras/${extra.id}`, key: extra.id, label: SKETCH_EXTRA_LABEL[extra.kind as SketchExtraKind] ?? 'Elemento', children: [] })) }];
}
```

Add after `sketchFindNode`:

```ts
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const tenth = (value: number) => Math.round(value * 10) / 10;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function sketchFreePos(raw: unknown): SketchFreePos | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { x, y, w, r } = raw as Record<string, unknown>;
  if (!finite(x) || !finite(y)) return undefined;
  const turn = finite(r) ? clamp(Math.round(r), -180, 180) : 0;
  return { x: clamp(tenth(x), 0, 100), y: clamp(tenth(y), 0, 100), ...(finite(w) ? { w: clamp(tenth(w), 5, 100) } : {}), ...(turn ? { r: turn } : {}) };
}

/** The sticker is already free and the column photo is its column's content; top-level groups stay in the flow. */
const NEVER_FREE = ['sticker', 'photo'];
const freeShape = (block: any, path: string) => Boolean(path) && block?.type !== 'account' && path.includes('/') && !path.startsWith('extras/') && !NEVER_FREE.includes(path.split('/').pop()!);
const freeMap = (block: any): Record<string, SketchFreePos> => (block?.free && typeof block.free === 'object' && !Array.isArray(block.free) ? block.free : {});
const insideFree = (free: Record<string, unknown>, path: string) => Object.keys(free).some(other => path.startsWith(`${other}/`));

export function sketchCanFree(block: any, path: string): boolean {
  return freeShape(block, path) && Boolean(sketchFindNode(sketchNodeTree(block), path));
}

/** What the canvas may pull out of its box: freeable parts with no freed part around them (freed ones included). */
export function sketchFreeablePaths(block: any): string[] {
  const free = freeMap(block);
  const walk = (nodes: SketchNode[]): string[] => nodes.flatMap(node => [...(freeShape(block, node.path) && !insideFree(free, node.path) ? [node.path] : []), ...walk(node.children)]);
  return walk(sketchNodeTree(block));
}

/** Frees a part at a spot (or moves it). Positions never nest: freed parts inside it rejoin it. */
export function sketchSetFree(block: any, path: string, pos: SketchFreePos): boolean {
  const current = freeMap(block);
  if (!sketchCanFree(block, path) || insideFree(current, path)) return false;
  const next: Record<string, SketchFreePos> = Object.fromEntries(Object.entries(current).filter(([other]) => !other.startsWith(`${path}/`)));
  next[path] = pos;
  if (Object.keys(next).length > SKETCH_FREE_MAX) return false;
  block.free = next;
  return true;
}

/** "Volver a su lugar": the part (and anything freed inside it) goes back into its box. */
export function sketchUnfree(block: any, path: string): void {
  const next = Object.fromEntries(Object.entries(freeMap(block)).filter(([other]) => other !== path && !other.startsWith(`${path}/`)));
  if (Object.keys(next).length) block.free = next; else delete block.free;
}

export function repairSketchFree(block: any, raw: unknown): Record<string, SketchFreePos> | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, SketchFreePos> = {};
  for (const [path, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= SKETCH_FREE_MAX) break;
    const pos = sketchFreePos(value);
    if (pos && sketchCanFree(block, path)) out[path] = pos;
  }
  for (const path of Object.keys(out)) if (insideFree(out, path)) delete out[path];
  return Object.keys(out).length ? out : undefined;
}

/** The node path of the group an array field fills (`reviews`/`quotes` → `items`). */
export function sketchListPath(type: string, field: string): string | undefined {
  const group = sketchGroups(type).find(item => item.reorder.kind === 'array' && item.reorder.field === field);
  return group ? (group.parent ? `${group.parent}/${group.key}` : group.key) : undefined;
}

/** Array items are keyed by index: when items move or go, their free spots follow (or go with them). */
function remapFree(block: any, parentPath: string, map: (index: number) => number | null) {
  const prefix = `${parentPath}/`;
  const next: Record<string, SketchFreePos> = {};
  for (const [path, pos] of Object.entries(freeMap(block))) {
    const [head, ...rest] = path.startsWith(prefix) ? path.slice(prefix.length).split('/') : [''];
    if (!/^\d+$/.test(head)) { next[path] = pos; continue; }
    const to = map(Number(head));
    if (to !== null) next[[parentPath, String(to), ...rest].join('/')] = pos;
  }
  if (Object.keys(next).length) block.free = next; else delete block.free;
}
```

Edit `sketchCanMove` — first line becomes:

```ts
  if (!path || Object.prototype.hasOwnProperty.call(freeMap(block), path)) return false;
```

Edit `sketchApplyMove`'s `array` case — before `return 'reload';`:

```ts
      remapFree(block, parentPath, from => picks.indexOf(from));
```

Replace `sketchCanRemove` and `sketchRemoveNode`:

```ts
export function sketchCanRemove(block: any, path: string): boolean {
  if (!path) return false;
  const { key, parent } = split(path);
  if (parent === 'extras') return Array.isArray(block.extras) && block.extras.some((extra: any) => extra?.id === key);
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && Number(key) < block[rule.field].length;
  return OPTIONAL.includes(key) && filled(block[key]);
}

export function sketchRemoveNode(block: any, path: string): boolean {
  if (!sketchCanRemove(block, path)) return false;
  const { key, parent } = split(path);
  if (parent === 'extras') {
    block.extras = block.extras.filter((extra: any) => extra?.id !== key);
    if (!block.extras.length) delete block.extras;
    return true;
  }
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') {
    const gone = Number(key);
    block[rule.field].splice(gone, 1);
    remapFree(block, parent, index => (index === gone ? null : index > gone ? index - 1 : index));
    return true;
  }
  block[key] = '';
  if (key === 'sticker') delete block.stickerPos;
  sketchUnfree(block, path);
  return true;
}
```

Confirm `packages/shared-types/src/index.ts` re-exports `./sketch-structure` with `export *`; add nothing if so.

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @pagosya/shared-types build && cd apps/api && npx jest src/storefront-source/sketch/sketch-structure.spec.ts`
Expected: PASS (all old and new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/sketch-structure.ts apps/api/src/storefront-source/sketch/sketch-structure.spec.ts
git commit -m "feat(boceto): freeable parts and inserted elements in the shared block structure"
```

---

### Task 2: API repair — `free` and `extras` survive saves and chat edits

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Consumes: `repairSketchFree`, `sketchFreePos`, `SKETCH_EXTRA_KINDS`, `SKETCH_EXTRA_MAX`, `SketchExtra`, `SketchExtraKind`, `SketchFreePos` (Task 1).
- Produces: `SketchLayout` gains `free?: Record<string, SketchFreePos>; extras?: SketchExtra[]`; `repairSketch` keeps them per Global Constraints; `SKETCH_EDITOR_ONLY` includes `'free'` and `'extras'`; a type-changing chat edit drops `free`, keeps `extras`.

- [ ] **Step 1: Write the failing tests** (append to `sketch-schema.spec.ts`)

```ts
describe('free layer repair', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const heroOf = (extra: object) => repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', cta: 'Ver', cta2: 'Caja', photo: 'assets/a.jpg', ...extra }] }, ctx).sketch.blocks[0] as any;
  it('keeps freed parts of the block and drops the rest', () => {
    const block = heroOf({ free: { 'copy/headline': { x: 10, y: 140, w: 40, r: 8 }, copy: { x: 1, y: 1 }, 'media/photo': { x: 1, y: 1 }, 'copy/badge': { x: 1, y: 1 }, 'copy/actions/cta2': { x: 'a', y: 1 } } });
    expect(block.free).toEqual({ 'copy/headline': { x: 10, y: 100, w: 40, r: 8 } });
    expect(heroOf({ free: { copy: { x: 1, y: 1 } } }).free).toBeUndefined();
  });
  it('keeps every valid kind of inserted element and repairs or drops the rest', () => {
    const block = heroOf({ extras: [
      { id: 'eab1', kind: 'emoji', value: '🍪', x: 10, y: 10, w: 8 },
      { id: 'eab2', kind: 'text', value: 'x'.repeat(200), x: 10, y: 10 },
      { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 10, y: 10 },
      { id: 'eab4', kind: 'button', value: 'Pedir', href: 'javascript:alert(1)', x: 10, y: 10 },
      { id: 'eab5', kind: 'photo', value: 'assets/a.jpg', x: 10, y: 10, w: 22 },
      { id: 'eab6', kind: 'icon', value: 'gift', x: 10, y: 10, r: -8 },
      { id: 'eab7', kind: 'emoji', value: 'hola', x: 1, y: 1 },
      { id: 'eab8', kind: 'photo', value: 'assets/otra.jpg', x: 1, y: 1 },
      { id: 'eab9', kind: 'icon', value: '../x', x: 1, y: 1 },
      { id: 'ebad', kind: 'video', value: 'x', x: 1, y: 1 },
      { id: 'eab1', kind: 'text', value: 'mismo id', x: 1, y: 1 },
      { id: 'eabz', kind: 'text', value: 'sin posición' },
    ] });
    expect(block.extras.map((e: any) => [e.kind, e.value.length > 20 ? e.value.length : e.value, e.href])).toEqual([
      ['emoji', '🍪', undefined], ['text', 120, undefined], ['button', 'Escríbenos', 'https://wa.me/59170000000'], ['button', 'Pedir', 'checkout.html'],
      ['photo', 'assets/a.jpg', undefined], ['icon', 'gift', undefined], ['text', 'mismo id', undefined],
    ]);
    const ids = block.extras.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id: string) => /^e[a-z0-9]{3,10}$/.test(id))).toBe(true);
    expect(block.extras[5].r).toBe(-8);
  });
  it('keeps at most 12 inserted elements and is idempotent', () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ id: `e00${i.toString(36)}`, kind: 'emoji', value: '✨', x: i, y: i }));
    const block = heroOf({ extras: many, free: { 'copy/sub': { x: 1, y: 1 } } });
    expect(block.extras).toHaveLength(12);
    const once = repairSketch({ blocks: [block] }, ctx).sketch;
    expect(repairSketch(once, ctx).sketch).toEqual(once);
  });
  it('a chat edit keeps free spots and inserted elements by block id; a type change drops the spots only', () => {
    const current = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', free: { 'copy/headline': { x: 5, y: 5 } }, extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }] }] }, ctx).sketch;
    const same = carryEditorFields(current, repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Nuevo' }] }, ctx).sketch)[0] as any;
    expect(same.free).toEqual({ 'copy/headline': { x: 5, y: 5 } });
    expect(same.extras).toHaveLength(1);
    const changed = carryEditorFields(current, repairSketch({ blocks: [{ id: 'h', type: 'banner', headline: 'B' }] }, ctx).sketch)[0] as any;
    expect(changed.free).toBeUndefined();
    expect(changed.extras).toHaveLength(1);
  });
  it('a carried spot whose part the chat edit removed is dropped on the next repair', () => {
    const block = heroOf({ cta2: '', free: { 'copy/actions/cta2': { x: 1, y: 1 }, 'copy/headline': { x: 2, y: 2 } } });
    expect(block.free).toEqual({ 'copy/headline': { x: 2, y: 2 } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts -t "free layer repair"`
Expected: FAIL (`free`/`extras` are dropped).

- [ ] **Step 3: Implement** in `sketch-schema.ts`.

Import line becomes:

```ts
import { repairSketchFree, repairSketchLayout, sketchFreePos, SKETCH_COPY_ORDER, SKETCH_EXTRA_KINDS, SKETCH_EXTRA_MAX, type SketchExtra, type SketchExtraKind, type SketchFreePos, type SketchGroupLayout } from '@pagosya/shared-types';
```

`SketchLayout` becomes:

```ts
export type SketchLayout = { align?: SketchAlign; flip?: boolean; swap?: boolean; order?: string[]; layout?: Record<string, SketchGroupLayout>; free?: Record<string, SketchFreePos>; extras?: SketchExtra[] };
```

Add next to `kickerText`:

```ts
/** Where a block button may lead: in-store pages and anchors only. */
const BLOCK_HREF = /^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/;
```

and use it in the two existing `href:` repairs (split and banner): replace `/^(#|index\.html|productos\.html|checkout\.html|galeria\.html)/.test(block.href)` with `BLOCK_HREF.test(block.href)`.

Inside `repairSketch`, after the `align` helper, add:

```ts
  // Inserted elements (free layer): known kinds with a valid value and position, unique ids, at most 12.
  const extras = (value: unknown): SketchExtra[] => {
    const wanted: Array<{ id: unknown; extra: Omit<SketchExtra, 'id'> }> = [];
    for (const item of Array.isArray(value) ? value : []) {
      if (wanted.length >= SKETCH_EXTRA_MAX) break;
      const raw = (typeof item === 'object' && item !== null ? item : {}) as Record<string, unknown>;
      const pos = sketchFreePos(raw);
      const kind = raw.kind as SketchExtraKind;
      if (!pos || !SKETCH_EXTRA_KINDS.includes(kind)) continue;
      const given = typeof raw.value === 'string' ? raw.value.trim() : '';
      const content = kind === 'emoji' ? (given.length <= 16 && /\p{Extended_Pictographic}/u.test(given) ? given : '')
        : kind === 'text' ? given.slice(0, 120)
        : kind === 'button' ? given.slice(0, 40)
        : kind === 'photo' ? (ctx.photos.includes(given) ? given : '')
        : /^[a-z0-9-]{2,40}$/.test(given) ? given : '';
      if (!content) continue;
      const href = kind === 'button' ? (typeof raw.href === 'string' && (BLOCK_HREF.test(raw.href) || /^https:\/\/wa\.me\/\d{6,15}$/.test(raw.href)) ? raw.href : 'checkout.html') : undefined;
      wanted.push({ id: raw.id, extra: { kind, value: content, ...pos, ...(href ? { href } : {}) } });
    }
    // Valid ids are kept (first come first served); the rest get fresh ones that never collide with a kept id.
    const valid = (id: unknown): id is string => typeof id === 'string' && /^e[a-z0-9]{3,10}$/.test(id);
    const reserved = new Set(wanted.map(entry => entry.id).filter(valid));
    const used = new Set<string>();
    let fresh = 1;
    return wanted.map(({ id, extra }) => {
      let kept = valid(id) && !used.has(id) ? id : '';
      while (!kept) { const candidate = `ex${String(fresh++).padStart(2, '0')}`; if (!reserved.has(candidate) && !used.has(candidate)) kept = candidate; }
      used.add(kept);
      return { id: kept, ...extra };
    });
  };
```

In the shared-controls block (`if (kept) { … }`), after the `layout` lines, add:

```ts
      // Free layer: inserted elements, then freed parts named against the repaired block (never nested).
      const inserted = extras(block.extras);
      if (inserted.length) kept.extras = inserted; else delete kept.extras;
      const free = repairSketchFree(kept, block.free);
      if (free) kept.free = free; else delete kept.free;
```

Replace the editor-only list and the type-change filter:

```ts
export const SKETCH_EDITOR_ONLY = ['align', 'flip', 'swap', 'order', 'stickerPos', 'layout', 'free', 'extras'] as const;
```

```ts
    // Order, group layout and free spots name the parts of one block type; a block the model turned into another type
    // starts fresh there (inserted elements belong to the block, so they stay).
    const keys = before.type === block.type ? SKETCH_EDITOR_ONLY : SKETCH_EDITOR_ONLY.filter(key => key !== 'order' && key !== 'layout' && key !== 'free');
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts src/storefront-source/sketch/sketch-request.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts
git commit -m "feat(boceto): repair and carry free spots and inserted elements"
```

---

### Task 3: API render — stamp freed parts, render the extras layer, desktop-only CSS

**Files:**
- Create: `apps/api/src/storefront-source/sketch/sketch-free.ts`
- Modify: `apps/api/src/storefront-source/sketch/sketch-blocks.ts` (`renderBlock`, `SKETCH_BASE_CSS`)
- Test: `apps/api/src/storefront-source/sketch/sketch-free.spec.ts` (new), `apps/api/src/storefront-source/sketch/sketch-golden.spec.ts`

**Interfaces:**
- Consumes: `SketchFreePos`, `SketchExtra` (Task 1), repaired `block.free` / `block.extras` (Task 2).
- Produces: `stampFree(markup: string, free?: Record<string, SketchFreePos>): string`, `extrasLayer(block, ctx): string`, `withFreeLayer(block, markup, ctx): string`, `FREE_CSS: string`. Markup contract the canvas (Task 4) relies on: a freed part carries `data-skb-free="on"` and inline `--skb-fx/--skb-fy[/--skb-fw][/--skb-fr]`; the layer is `<div className="skb-extras" data-skb-group={"extras"}>` with one `data-skb-node={"<id>"}` child per extra; text/button extras carry `data-skb-field={"extras.<i>.value"}`; photo extras carry `data-skb-photo={"extras.<i>.value"}`.

- [ ] **Step 1: Write the failing tests** — new file `sketch-free.spec.ts`:

```ts
import { renderBlock, SKETCH_BASE_CSS } from './sketch-blocks';
import { stampFree } from './sketch-free';
import { repairSketch } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const render = (raw: object, store = ctx) => {
  const { sketch } = repairSketch({ blocks: [raw] }, store);
  return renderBlock(sketch.blocks[0], sketch, store);
};
const tagOf = (markup: string, marker: string) => markup.slice(markup.lastIndexOf('<', markup.indexOf(marker)), markup.indexOf('>', markup.indexOf(marker)) + 1);

it('stamps each freed part with its spot as CSS variables, and nothing else', () => {
  const out = render({ id: 'h', type: 'hero', headline: 'Hola', sub: 'sub', cta: 'Ver', cta2: 'Caja', free: { 'copy/headline': { x: 10, y: 20, w: 40, r: 8 }, 'copy/actions/cta2': { x: 5, y: 80 } } });
  const headline = tagOf(out, 'data-skb-el="headline"');
  expect(headline).toContain('data-skb-free="on"');
  expect(headline).toContain('["--skb-fx" as string]: "10"');
  expect(headline).toContain('["--skb-fw" as string]: "40"');
  expect(headline).toContain('["--skb-fr" as string]: "8"');
  const ghost = tagOf(out, 'data-skb-node={"cta2"}');
  expect(ghost).toContain('["--skb-fy" as string]: "80"');
  expect(ghost).not.toContain('--skb-fw');
  expect(out.match(/data-skb-free/g)).toHaveLength(2);
});

it('merges into an existing style object and skips braces and angle brackets inside expressions', () => {
  const markup = '<section data-skb={"a"} style={{ ["--skb-bg" as string]: "#fff" }}><p data-skb-node={"k"} style={{ left: "1%" }}>{"a<b{c}"}</p><span data-skb-node={"z"}>{"</p>"}</span></section>';
  const out = stampFree(markup, { k: { x: 1, y: 2 }, z: { x: 3, y: 4 } });
  expect(out).toContain('<p data-skb-node={"k"} style={{ ["--skb-fx" as string]: "1", ["--skb-fy" as string]: "2", left: "1%" }} data-skb-free="on">');
  expect(out).toContain('<span data-skb-node={"z"} data-skb-free="on" style={{ ["--skb-fx" as string]: "3", ["--skb-fy" as string]: "4" }}>');
  expect(out).toContain('style={{ ["--skb-bg" as string]: "#fff" }}>');
});

it('a hostile store name in an attribute never names a part', () => {
  const hostile = { ...ctx, storeName: 'x" data-skb-node="photo' };
  const out = render({ id: 'h', type: 'hero', headline: 'H', caption: 'pie', photo: 'assets/a.jpg', free: { 'media/caption': { x: 1, y: 1 } } }, hostile);
  expect(out.match(/data-skb-free/g)).toHaveLength(1);
  expect(tagOf(out, 'data-skb-node={"caption"}')).toContain('data-skb-free="on"');
});

it('renders every kind of inserted element as a layer at the end of its section', () => {
  const out = render({ id: 'sp', type: 'split', headline: 'H', photo: 'assets/a.jpg', extras: [
    { id: 'eab1', kind: 'emoji', value: '🍪', x: 10, y: 10, w: 8 },
    { id: 'eab2', kind: 'text', value: 'Hecho hoy', x: 20, y: 20 },
    { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 30, y: 30 },
    { id: 'eab4', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 40, w: 22 },
    { id: 'eab5', kind: 'icon', value: 'gift', x: 50, y: 50, r: 15 },
  ] });
  expect(out).toMatch(/<div className="skb-extras" data-skb-group=\{"extras"\}>[\s\S]*<\/div>\s*<\/section>$/);
  expect(tagOf(out, 'data-skb-node={"eab1"}')).toContain('skb-x--emoji');
  expect(tagOf(out, 'data-skb-node={"eab2"}')).toContain('data-skb-field={"extras.1.value"}');
  const button = tagOf(out, 'data-skb-node={"eab3"}');
  expect(button).toContain('href={"https://wa.me/59170000000"}');
  expect(button).toContain('target="_blank"');
  expect(tagOf(out, 'data-skb-node={"eab4"}')).toContain('data-skb-photo={"extras.3.value"}');
  expect(tagOf(out, 'data-skb-node={"eab5"}')).toContain('src={"assets/icons/gift.svg"}');
  expect(out.match(/data-skb-free="on"/g)).toHaveLength(5);
});

it('free spots apply from 900px up only; phones keep everything in the column', () => {
  const split = SKETCH_BASE_CSS.indexOf('@media (min-width: 900px) {\n  .skb [data-skb-free]');
  expect(split).toBeGreaterThan(-1);
  expect(SKETCH_BASE_CSS.slice(split)).toContain('position: absolute');
  const phone = SKETCH_BASE_CSS.slice(0, split);
  expect(phone).not.toMatch(/\[data-skb-free\][^{]*\{[^}]*position: absolute/);
  expect(phone).toContain('.skb-extras { display: flex;');
});
```

In `sketch-golden.spec.ts`: give the fixture freed parts and every extra kind, assert it, and include icon files in the screenshot run.

```ts
// hero: add
free: { 'copy/headline': { x: 4, y: 8, w: 46, r: -8 }, 'copy/actions/cta': { x: 6, y: 78 } },
// split: add
extras: [{ id: 'eab1', kind: 'emoji', value: '🍪', x: 80, y: 6, w: 8 }, { id: 'eab2', kind: 'text', value: 'Hecho hoy', x: 70, y: 40 }, { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 60, y: 80 }, { id: 'eab4', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 60, w: 22, r: 8 }, { id: 'eab5', kind: 'icon', value: 'gift', x: 90, y: 90, w: 6 }],
// reviews: add
free: { 'items/1': { x: 60, y: 10, w: 30, r: 8 } },
```

```ts
it('the screenshot fixture frees parts and inserts every kind of element', () => {
  const sketch = fullSketch();
  expect(Object.keys(sketch.blocks.find(block => block.id === 'h')!.free!)).toEqual(['copy/headline', 'copy/actions/cta']);
  expect(sketch.blocks.find(block => block.id === 'sp')!.extras!.map(extra => extra.kind)).toEqual(['emoji', 'text', 'button', 'photo', 'icon']);
  const markup = assembleSketch(sketch, ctx).map(file => file.content).join('\n');
  expect(markup.match(/data-skb-free="on"/g)).toHaveLength(8);
  expect(markup).toContain('skb-extras');
});
```

and in the screenshot test replace `const files = assembleSketch(sketch, ctx);` with `const files = await withSourceIcons(assembleSketch(sketch, ctx));` (import `withSourceIcons` from `'../source-asset-library'`).

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-free.spec.ts`
Expected: FAIL (module `./sketch-free` not found).

- [ ] **Step 3: Implement** — new file `sketch-free.ts`:

```ts
import type { SketchFreePos } from '@pagosya/shared-types';
import type { SketchBlock, SketchContext } from './sketch-schema';

/** Free layer (spec 2026-10-03-boceto-free-layer-design). Freed parts keep their place in the markup and gain their spot
 * as CSS variables; the base CSS lifts them out only from 900px up, so on phones they sit back in their column. */
const expr = (value: string) => `{${JSON.stringify(value)}}`;

const freeVars = (pos: SketchFreePos) => ([['--skb-fx', pos.x], ['--skb-fy', pos.y], ...(pos.w !== undefined ? [['--skb-fw', pos.w]] : []), ...(pos.r ? [['--skb-fr', pos.r]] : [])] as Array<[string, number]>)
  .map(([name, value]) => `[${JSON.stringify(name)} as string]: ${JSON.stringify(String(value))}`).join(', ');

type Tag = { name: string; end: number; selfClosing: boolean; attrs: Map<string, { start: number; end: number }> };

function skipString(src: string, i: number): number {
  const quote = src[i];
  for (i++; i < src.length && src[i] !== quote; i++) if (src[i] === '\\') i++;
  return i + 1;
}
/** A balanced `{…}` expression; string literals inside are opaque, so merchant text never counts as markup. */
function skipBraces(src: string, i: number): number {
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = skipString(src, i) - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return i;
}
function readTag(src: string, open: number): Tag {
  let i = open + 1;
  const name = /^[A-Za-z][\w.]*/.exec(src.slice(i, i + 40))?.[0] ?? '';
  i += name.length;
  const attrs = new Map<string, { start: number; end: number }>();
  while (i < src.length) {
    while (/\s/.test(src[i])) i++;
    if (src[i] === '>') return { name, end: i, selfClosing: false, attrs };
    if (src[i] === '/' && src[i + 1] === '>') return { name, end: i, selfClosing: true, attrs };
    const attr = /^[^\s=/>]+/.exec(src.slice(i, i + 80))?.[0] ?? '';
    if (!attr) { i++; continue; }
    i += attr.length;
    if (src[i] !== '=') { attrs.set(attr, { start: i, end: i }); continue; }
    const start = ++i;
    i = src[i] === '{' ? skipBraces(src, i) : src[i] === '"' || src[i] === "'" ? skipString(src, i) : i;
    attrs.set(attr, { start, end: i });
  }
  return { name, end: src.length, selfClosing: true, attrs };
}
/** The canvas segment of a tag, with the canvas's precedence: group, then node, then element. */
function segmentOf(src: string, tag: Tag): string | null {
  for (const name of ['data-skb-group', 'data-skb-node', 'data-skb-el']) {
    const at = tag.attrs.get(name);
    if (!at) continue;
    const raw = src.slice(at.start, at.end);
    try { const value = JSON.parse(raw.startsWith('{') ? raw.slice(1, -1) : raw); if (typeof value === 'string') return value; } catch { /* not a literal */ }
  }
  return null;
}

/** Marks the part at each freed path, reading paths from the markup's nesting exactly as the canvas does. */
export function stampFree(markup: string, free?: Record<string, SketchFreePos>): string {
  if (!free || !Object.keys(free).length) return markup;
  const edits: Array<{ at: number; text: string }> = [];
  const stack: Array<{ name: string; segment: string | null }> = [];
  for (let i = 0; i < markup.length;) {
    const c = markup[i];
    if (c === '{') { i = skipBraces(markup, i); continue; }
    if (c !== '<') { i++; continue; }
    if (markup[i + 1] === '/') {
      const close = markup.indexOf('>', i);
      const name = markup.slice(i + 2, close).trim();
      const at = stack.map(entry => entry.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      i = close + 1;
      continue;
    }
    if (!/[A-Za-z]/.test(markup[i + 1] ?? '')) { i++; continue; }
    const tag = readTag(markup, i);
    const segment = segmentOf(markup, tag);
    const pos = segment ? free[[...stack.map(entry => entry.segment).filter(Boolean), segment].join('/')] : undefined;
    if (pos) {
      const style = tag.attrs.get('style');
      if (style && markup.startsWith('{{', style.start)) {
        edits.push({ at: style.start + 2, text: ` ${freeVars(pos)},` }, { at: tag.end, text: ' data-skb-free="on"' });
      } else edits.push({ at: tag.end, text: ` data-skb-free="on" style={{ ${freeVars(pos)} }}` });
    }
    if (!tag.selfClosing) stack.push({ name: tag.name, segment });
    i = tag.end + (tag.selfClosing ? 2 : 1);
  }
  return edits.sort((a, b) => b.at - a.at).reduce((out, edit) => out.slice(0, edit.at) + edit.text + out.slice(edit.at), markup);
}

/** Inserted elements: one layer at the end of the section (absolute on desktop, a centred row on phones). */
export function extrasLayer(block: SketchBlock, ctx: SketchContext): string {
  const extras = block.extras ?? [];
  if (!extras.length) return '';
  const items = extras.map((extra, i) => {
    const attrs = `data-skb-node=${expr(extra.id)} data-skb-free="on" style={{ ${freeVars(extra)} }}`;
    const field = `data-skb-field=${expr(`extras.${i}.value`)}`;
    switch (extra.kind) {
      case 'emoji': return `<span className="skb-x skb-x--emoji" aria-hidden="true" ${attrs}>${expr(extra.value)}</span>`;
      case 'text': return `<p className="skb-x skb-x--text" ${attrs} ${field}>${expr(extra.value)}</p>`;
      case 'button': {
        const href = extra.href ?? 'checkout.html';
        return `<a className="skb-btn skb-x skb-x--button" href=${expr(href)}${href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''} ${attrs} ${field}>${expr(extra.value)}</a>`;
      }
      case 'photo': return `<img className="skb-x skb-x--photo" src=${expr(extra.value)} alt=${expr(`Foto de ${ctx.storeName}`)} data-skb-photo=${expr(`extras.${i}.value`)} ${attrs} />`;
      default: return `<img className="skb-x skb-x--icon" src=${expr(`assets/icons/${extra.value}.svg`)} alt="" aria-hidden="true" ${attrs} />`;
    }
  });
  return `<div className="skb-extras" data-skb-group=${expr('extras')}>${items.join('')}</div>`;
}

export function withFreeLayer(block: SketchBlock, markup: string, ctx: SketchContext): string {
  const stamped = stampFree(markup, block.free);
  const layer = extrasLayer(block, ctx);
  return layer ? stamped.replace(/<\/section>\s*$/, `  ${layer}\n  </section>`) : stamped;
}

/** Desktop keeps the exact spots; below 900px freed parts sit back in their column and inserted elements line up at
 * the end of their section, so nothing covers anything. An unset `--skb-fw` leaves the width automatic. */
export const FREE_CSS = `
.skb-extras { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.8rem; padding-top: 1.2rem; }
.skb-split > .skb-extras { padding: 0 1.2rem 1.5rem; }
.skb-x--emoji { font-size: 2.6rem; line-height: 1; }
.skb-x--icon { width: 2.6rem; height: auto; display: block; }
.skb-x--photo { width: min(45%, 12rem); height: auto; border-radius: var(--skb-r-sm); display: block; object-fit: cover; }
.skb-x--text { margin: 0; font-size: 1.05rem; font-weight: 600; }
@media (min-width: 900px) {
  .skb [data-skb-free] { position: absolute; left: calc(var(--skb-fx, 0) * 1%); top: calc(var(--skb-fy, 0) * 1%); right: auto; bottom: auto; width: calc(var(--skb-fw) * 1%); margin: 0; rotate: calc(var(--skb-fr, 0) * 1deg); z-index: 2; }
  .skb .skb-extras { position: absolute; inset: 0; padding: 0; display: block; pointer-events: none; z-index: 2; container-type: inline-size; }
  .skb-extras > * { pointer-events: auto; }
  .skb .skb-x--emoji { font-size: calc(var(--skb-fw, 8) * 0.8cqi); text-align: center; }
  .skb [data-skb-free].skb-x--icon { width: calc(var(--skb-fw, 6) * 1%); }
  .skb [data-skb-free].skb-x--photo { width: calc(var(--skb-fw, 22) * 1%); }
}`;
```

In `sketch-blocks.ts`: `import { FREE_CSS, withFreeLayer } from './sketch-free';`, then

```ts
export function renderBlock(block: SketchBlock, sketch: StoreSketch, ctx: SketchContext, options: RenderOptions = {}): string {
  return withFreeLayer(block, (generators[block.type] as Render)(block as SketchBlock & { type: never }, sketch, ctx, options), ctx);
}
```

and append `${FREE_CSS}` just before the closing backtick of `SKETCH_BASE_CSS` (after the reduced-motion line).

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/api && npx jest src/storefront-source/sketch`
Expected: PASS, including the golden compile and the 1280/390 screenshots with no page errors. If the compile rejects `target="_blank"` or the `https://` href, drop `target`/`rel` (keep the href) and re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-free.ts apps/api/src/storefront-source/sketch/sketch-free.spec.ts apps/api/src/storefront-source/sketch/sketch-blocks.ts apps/api/src/storefront-source/sketch/sketch-golden.spec.ts
git commit -m "feat(boceto): the assembler stamps freed parts and renders inserted elements, desktop-only spots"
```

---

### Task 4: Canvas — detach past the box, free moves, corner resize, live apply

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js`
- Test: `packages/storefront-preview/src/source-preview-boceto.test.ts`

**Interfaces:**
- Consumes: the markup contract of Task 3; per block in `pagosya:boceto-apply`: `freeable: string[]` and `free: Record<path, { x, y, w?, r? }>` (sent by Task 5).
- Produces: `pagosya:boceto-free { id, path, x, y, w? }` (x/y/w rounded to 0.1, clamped 0–100, w ≥ 5); live photo swaps accept slot `extras.<i>.value`.

- [ ] **Step 1: Write the failing tests** (append to the test file)

```ts
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });
const layoutBoard = (w: any) => {
  w.document.querySelector('[data-skb="h"]').getBoundingClientRect = () => rect(0, 0, 1000, 600);
  w.document.querySelector('[data-skb-group="copy"]').getBoundingClientRect = () => rect(0, 0, 400, 300);
  w.document.querySelector('[data-skb-el="headline"]').getBoundingClientRect = () => rect(20, 30, 200, 50);
  w.document.querySelector('[data-skb-el="sub"]').getBoundingClientRect = () => rect(20, 100, 100, 20);
};

it('free layer: a part dragged 24px past its box comes out and lands where it is dropped', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline', 'copy/sub'] } } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 30, 40);
  pointer(w, 'pointermove', w.document, 30, 50); await tick();
  pointer(w, 'pointermove', w.document, 600, 100);
  pointer(w, 'pointerup', w.document, 600, 100); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/headline', x: 59, y: 15, w: 20 });
  expect(headline.getAttribute('data-skb-free')).toBe('on');
  expect(posted.some(m => m.type === 'pagosya:boceto-node-move')).toBe(false);
});

it('free layer: within 24px of its box a part still reorders instead', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { movable: ['copy/headline', 'copy/sub', 'copy/actions'], freeable: ['copy/headline'] } } }); await tick();
  pointer(w, 'pointerdown', w.document.querySelector('[data-skb-el="headline"]'), 30, 40);
  pointer(w, 'pointermove', w.document, 30, 50); await tick();
  pointer(w, 'pointermove', w.document, 410, 120);
  pointer(w, 'pointerup', w.document, 410, 120); await tick();
  expect(posted.some(m => m.type === 'pagosya:boceto-free')).toBe(false);
});

it('free layer: a free part moves freely; live apply sets and clears its spot', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } } }); await tick();
  const sub = w.document.querySelector('[data-skb-el="sub"]');
  expect([sub.getAttribute('data-skb-free'), sub.style.getPropertyValue('--skb-fx'), sub.style.getPropertyValue('--skb-fy')]).toEqual(['on', '10', '20']);
  pointer(w, 'pointerdown', sub, 50, 50);
  pointer(w, 'pointermove', w.document, 50, 60); await tick();
  pointer(w, 'pointermove', w.document, 150, 110);
  pointer(w, 'pointerup', w.document, 150, 110); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/sub', x: 20, y: 30 });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { free: {} } } }); await tick();
  expect([sub.hasAttribute('data-skb-free'), sub.style.getPropertyValue('--skb-fx')]).toEqual([false, '']);
});

it('free layer: the corner square of a selected free part sets its width', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } }, selection: { id: 'h', path: 'copy/sub', label: 'Bajada' } }); await tick();
  const grip = w.document.querySelector('[data-boceto-resize]');
  expect(grip).not.toBeNull();
  pointer(w, 'pointerdown', grip, 120, 120);
  pointer(w, 'pointermove', w.document, 220, 120);
  pointer(w, 'pointerup', w.document, 220, 120); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-free')).toEqual({ type: 'pagosya:boceto-free', id: 'h', path: 'copy/sub', x: 10, y: 20, w: 20 });
});

it('free layer: on a board narrower than 900px nothing comes out of its box', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  Object.defineProperty(w, 'innerWidth', { value: 600, configurable: true });
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { freeable: ['copy/headline', 'copy/sub'], free: { 'copy/sub': { x: 10, y: 20 } } } } }); await tick();
  for (const selector of ['[data-skb-el="headline"]', '[data-skb-el="sub"]']) {
    pointer(w, 'pointerdown', w.document.querySelector(selector), 30, 40);
    pointer(w, 'pointermove', w.document, 30, 50); await tick();
    pointer(w, 'pointermove', w.document, 600, 100);
    pointer(w, 'pointerup', w.document, 600, 100); await tick();
  }
  expect(posted.some(m => m.type === 'pagosya:boceto-free')).toBe(false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts`
Expected: the five new tests FAIL; the old ones PASS.

- [ ] **Step 3: Implement** in `source-preview-boceto-mode.js` (keep the file's ES5 style: `var`, `function`, no `??`/arrows).

Header comment, add after the `movable` bullet:
`*   - a part the Studio lists as freeable, dragged 24px past its box, comes out and floats (desktop widths only); a free part`
`*     moves freely and its corner square sets its width; both post pagosya:boceto-free { id, path, x, y, w? } in percentages;`

After `movableIn`, add:

```js
  /** Per block, the parts that may float (freed ones and inserted elements included); none while YAPI works. */
  var freeableByBlock = {};
  var PATH = /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/;
  var FREE_VARS = ['--skb-fx', '--skb-fy', '--skb-fw', '--skb-fr'];
  function freeableIn(section, node) { var list = freeableByBlock[section.getAttribute('data-skb')] || []; return list.indexOf(pathOf(node)) !== -1; }
  /** Free spots only exist from 900px up: on a phone-width board everything sits in its column. */
  function canFree(section, node) { return window.innerWidth >= 900 && freeableIn(section, node); }
  function isFree(node) { return node.hasAttribute('data-skb-free'); }
  function freeVar(node, name) { var value = parseFloat(node.style.getPropertyValue(name)); return isFinite(value) ? value : null; }
  function clampPct(value, low) { return Math.round(Math.min(100, Math.max(low, value)) * 10) / 10; }
  function grabbable(section, node) { return movableIn(section, node) || canFree(section, node); }
```

(Use `PATH` in the existing `spec.movable` filter too.)

In `dragCandidate`, replace both `movableIn(section, …)` calls with `grabbable(section, …)`.

In the `pointerdown` handler's `arm`, change `startNodeDrag(drag);` to `startNodeDrag(drag, event, ev);`.

Rework `startNodeDrag` (the existing setup lines and the reorder body inside `move` stay as they are):

```js
  function startNodeDrag(node, down, now) {
    var section = sectionOf(node), container = containerOf(node);
    if (!section || !container) return;
    if (isFree(node)) { if (canFree(section, node)) startFreeDrag(node, down, false, now); return; }
    var reorder = movableIn(section, node), freeable = canFree(section, node);
    // … existing setup lines unchanged (fromPath, elDragging, data-boceto-dragging, clearBoxes, style, display, siblings, horizontal, grid, target, alongX) …
    var move = function (ev) {
      if (freeable) {
        var bounds = container.getBoundingClientRect();
        if (ev.clientX < bounds.left - 24 || ev.clientX > bounds.right + 24 || ev.clientY < bounds.top - 24 || ev.clientY > bounds.bottom + 24) {
          stop(); node.removeAttribute('data-boceto-dragging'); target = null;
          startFreeDrag(node, down, true, ev);
          return;
        }
      }
      if (!reorder) return;
      // … existing reorder body unchanged …
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      indicator.style.display = 'none';
      indicator.style.left = '12px'; indicator.style.right = '12px'; indicator.style.width = 'auto'; indicator.style.height = '4px';
    };
    var finish = function () {
      stop();
      node.removeAttribute('data-boceto-dragging');
      elDragging = null;
      // … existing `if (target) { … }` block unchanged …
      drawOverlay();
    };
    // … existing listener registration unchanged …
  }
```

Add after `startNodeDrag`:

```js
  /** A free part (or one just pulled out of its box) follows the pointer inside its positioning box — its section, or
   * the photo column it sits in — and the drop is posted as percentages of that box. Moves are measured from the press,
   * so a turned part does not drift. */
  function startFreeDrag(node, down, detach, now) {
    var section = sectionOf(node);
    var holder = node.offsetParent || section;
    var box = holder.getBoundingClientRect(), rect = node.getBoundingClientRect();
    var pct = function (value, size) { return size ? (value / size) * 100 : 0; };
    var fromX = detach ? pct(rect.left - box.left, box.width) : (freeVar(node, '--skb-fx') || 0);
    var fromY = detach ? pct(rect.top - box.top, box.height) : (freeVar(node, '--skb-fy') || 0);
    var width = detach ? clampPct(pct(rect.width, box.width), 5) : freeVar(node, '--skb-fw');
    var at = { x: fromX, y: fromY };
    elDragging = node;
    clearBoxes();
    if (detach) { node.setAttribute('data-skb-free', 'on'); node.style.setProperty('--skb-fw', String(width)); }
    var move = function (ev) {
      at.x = clampPct(fromX + pct(ev.clientX - down.clientX, box.width), 0);
      at.y = clampPct(fromY + pct(ev.clientY - down.clientY, box.height), 0);
      node.style.setProperty('--skb-fx', String(at.x));
      node.style.setProperty('--skb-fy', String(at.y));
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', cancel, true);
      elDragging = null;
    };
    var finish = function () {
      stop();
      var message = { type: 'pagosya:boceto-free', id: section.getAttribute('data-skb'), path: pathOf(node), x: clampPct(at.x, 0), y: clampPct(at.y, 0) };
      if (width !== null) message.w = width;
      parent.postMessage(message, '*');
      drawOverlay();
    };
    // The browser took the gesture: a part pulled out just now goes back in; a free part keeps its saved spot.
    var cancel = function () {
      stop();
      if (detach) { node.removeAttribute('data-skb-free'); FREE_VARS.forEach(function (name) { node.style.removeProperty(name); }); }
      else { node.style.setProperty('--skb-fx', String(fromX)); node.style.setProperty('--skb-fy', String(fromY)); }
      drawOverlay();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', cancel, true);
    if (now) move(now);
  }

  /** The corner square on a selected free part: dragging it sets the part's width (percent of its box). */
  function makeResizeHandle(node) {
    var rect = node.getBoundingClientRect();
    var grip = document.createElement('div');
    grip.setAttribute('data-boceto-resize', '');
    grip.style.cssText = 'position:fixed;z-index:2147483647;width:10px;height:10px;box-sizing:border-box;background:#fff;border:2px solid #1f6feb;border-radius:2px;cursor:nwse-resize;touch-action:none;left:' + (rect.right - 5) + 'px;top:' + (rect.bottom - 5) + 'px';
    grip.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      var section = sectionOf(node), holder = node.offsetParent || section;
      var box = holder.getBoundingClientRect();
      var from = freeVar(node, '--skb-fw');
      if (from === null) from = box.width ? (node.getBoundingClientRect().width / box.width) * 100 : 0;
      var width = clampPct(from, 5);
      elDragging = node;
      clearBoxes();
      var move = function (ev) { width = clampPct(from + (box.width ? ((ev.clientX - event.clientX) / box.width) * 100 : 0), 5); node.style.setProperty('--skb-fw', String(width)); };
      var finish = function () {
        document.removeEventListener('pointermove', move, true);
        document.removeEventListener('pointerup', finish, true);
        document.removeEventListener('pointercancel', finish, true);
        elDragging = null;
        parent.postMessage({ type: 'pagosya:boceto-free', id: section.getAttribute('data-skb'), path: pathOf(node), x: freeVar(node, '--skb-fx') || 0, y: freeVar(node, '--skb-fy') || 0, w: width }, '*');
        drawOverlay();
      };
      document.addEventListener('pointermove', move, true);
      document.addEventListener('pointerup', finish, true);
      document.addEventListener('pointercancel', finish, true);
    });
    document.body.append(grip);
    return grip;
  }

  /** Live free spots from the Studio: set each listed path, and put back any part no longer listed. */
  function applyFree(section, map) {
    var kept = [];
    for (var path in map) {
      var pos = map[path];
      if (!PATH.test(path) || !pos || typeof pos.x !== 'number' || typeof pos.y !== 'number' || !isFinite(pos.x) || !isFinite(pos.y)) continue;
      var node = nodeAt(section, path);
      if (!node || node === section) continue;
      kept.push(node);
      node.setAttribute('data-skb-free', 'on');
      node.style.setProperty('--skb-fx', String(clampPct(pos.x, 0)));
      node.style.setProperty('--skb-fy', String(clampPct(pos.y, 0)));
      if (typeof pos.w === 'number' && isFinite(pos.w)) node.style.setProperty('--skb-fw', String(clampPct(pos.w, 5))); else node.style.removeProperty('--skb-fw');
      if (typeof pos.r === 'number' && isFinite(pos.r) && pos.r) node.style.setProperty('--skb-fr', String(Math.round(Math.min(180, Math.max(-180, pos.r))))); else node.style.removeProperty('--skb-fr');
    }
    Array.prototype.slice.call(section.querySelectorAll('[data-skb-free]')).forEach(function (node) {
      if (sectionOf(node) !== section || kept.indexOf(node) !== -1) return;
      node.removeAttribute('data-skb-free');
      FREE_VARS.forEach(function (name) { node.style.removeProperty(name); });
    });
  }
```

In `drawOverlay`, after `boxes.push(makeBox(node, 'selected', selection.label));` add:

```js
    if (isFree(node) && canFree(section, node)) boxes.push(makeResizeHandle(node));
```

In the `pagosya:boceto-apply` handler, after the `spec.movable` line add:

```js
        if (Array.isArray(spec.freeable)) freeableByBlock[id] = spec.freeable.filter(function (path) { return typeof path === 'string' && PATH.test(path); }).slice(0, 160);
        if (spec.free && typeof spec.free === 'object') applyFree(section, spec.free);
```

and widen the photo slot pattern there to `/^(photo|items\.\d+\.photo|photos\.\d+|extras\.\d+\.value)$/`.

- [ ] **Step 4: Run to verify they pass**

Run: `cd packages/storefront-preview && npx vitest run`
Expected: PASS (old and new).

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
git commit -m "feat(boceto): parts come out of their box on the canvas, move freely and resize from a corner"
```

---

### Task 5: Studio — free parts (store the spot, Giro, Volver a su lugar, Capas ↗)

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts`, `apps/merchant-studio/src/source-studio.ts` (message routing)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `pagosya:boceto-free` (Task 4).
- Produces: panel method `remoteFree(id: string, path: string, x: number, y: number, w?: number): void`; live look per block gains `freeable: string[]` (freeable paths plus `extras/<id>`; `[]` while locked) and `free: Record<path, {x,y,w?,r?}>` (freed parts plus `extras/<id>` spots); helper `turnRow(pos)` reused by Task 6.

- [ ] **Step 1: Write the failing tests** (append)

```ts
it('free layer: a part pulled out on the canvas is saved with its spot, stops reordering and shows ↗ in Capas', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/headline', 30, 40, 25);
  const look = lastLook().blocks.intro;
  expect(look.free).toEqual({ 'copy/headline': { x: 30, y: 40, w: 25 } });
  expect(look.freeable).toContain('copy/headline');
  expect(look.movable).not.toContain('copy/headline');
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/headline' });
  expect([...host.querySelectorAll('.bct-node')].map(node => node.textContent)).toContain('↗ Título');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toEqual({ 'copy/headline': { x: 30, y: 40, w: 25 } });
});

it('free layer: the canvas cannot free a whole column or the photo, and nothing while YAPI works', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy', 1, 1);
  panel.remoteFree('intro', 'media/photo', 1, 1);
  expect(lastLook()?.blocks?.intro?.free ?? {}).toEqual({});
  const locked = createBocetoPanel(new MerchantStudioApi());
  locked.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn(), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  locked.resync();
  expect(lastLook().blocks.intro.freeable).toEqual([]);
  locked.remoteFree('intro', 'copy/headline', 1, 1);
  expect(lastLook().blocks.intro.free).toEqual({});
});

it('free layer: Giro turns a free part live and "Volver a su lugar" puts it back', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/sub', 10, 10);
  const turn = [...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === '8°') as HTMLElement;
  turn.click();
  expect(lastLook().blocks.intro.free['copy/sub']).toEqual({ x: 10, y: 10, r: 8 });
  (host.querySelector('[data-boceto-unfree]') as HTMLElement).click();
  expect(lastLook().blocks.intro.free).toEqual({});
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toBeUndefined();
});

it('free layer: removing an item from the inspector list keeps a freed item on the same item', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'T', note: '', kicker: '', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }, { icon: 'c', title: 'Tres', text: '' }], free: { 'items/2': { x: 5, y: 5 } }, bg: 'paper', size: 'm' }, sketch().blocks[2]] }, photos: [], fonts: ['anton'] } as any);
  await mount();
  (host.querySelector('[data-boceto-block="st"] .bct-block__head') as HTMLElement).click();
  (host.querySelector('.bct-list__kill') as HTMLElement).click();
  expect(lastLook().blocks.st.free).toEqual({ 'items/1': { x: 5, y: 5 } });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: the new tests FAIL (`remoteFree` is not a function).

- [ ] **Step 3: Implement** in `source-boceto.ts`.

Import line:

```ts
import { sketchApplyMove, sketchCanFree, sketchCanMove, sketchCanRemove, sketchFindNode, sketchFreeablePaths, sketchFreePos, sketchGroup, sketchListPath, sketchNodeTree, sketchRemoveNode, sketchSetFree, sketchUnfree, SKETCH_TWO_COLUMN, type SketchNode } from '@pagosya/shared-types';
```

`BlockApply` gains `freeable?: string[]; free?: Record<string, { x: number; y: number; w?: number; r?: number }>;`.

After `movablePaths`, add:

```ts
/** Every spot to show live: freed parts plus inserted elements (`extras/<id>`), so the canvas can put back the rest. */
const freeSpots = (block: any): Record<string, { x: number; y: number; w?: number; r?: number }> => ({
  ...(block.free || {}),
  ...Object.fromEntries((block.extras || []).map((extra: any) => [`extras/${extra.id}`, { x: extra.x, y: extra.y, ...(extra.w !== undefined ? { w: extra.w } : {}), ...(extra.r ? { r: extra.r } : {}) }])),
});
```

In `applyLive`, inside the block entry object right after `movable: …,` add:

```ts
freeable: opts.locked ? [] : [...sketchFreeablePaths(block), ...(block.extras || []).map((extra: any) => `extras/${extra.id}`)], free: freeSpots(block),
```

After the `section(…)` helper, add:

```ts
  /** "Giro" for a free part or an inserted element: a few fixed angles; 0° clears it. */
  const turnRow = (pos: { r?: number }) => row('Giro', segment(String(pos.r ?? 0), ['0', '-8', '8', '15'], ['0°', '−8°', '8°', '15°'], next => { const r = Number(next); if (r) pos.r = r; else delete pos.r; schedule(); draw(); }));
```

In `nodeProps`, right before `if (sketchCanRemove(block, path)) {`, add:

```ts
    const spot = block.free?.[path];
    if (spot) {
      children.push(turnRow(spot));
      const back = el('button', { type: 'button', className: 'bct-chip', text: 'Volver a su lugar' });
      back.dataset.bocetoUnfree = '';
      back.addEventListener('click', () => { sketchUnfree(block, path); schedule(); draw(); });
      children.push(row('Suelto', back));
      children.push(el('p', { className: 'bct-hint', text: 'Arrástralo a donde quieras; la esquina azul cambia su tamaño. En el celular vuelve a su lugar en la columna.' }));
    } else if (sketchCanFree(block, path)) children.push(el('p', { className: 'bct-hint', text: 'Arrástralo fuera de su caja para soltarlo donde quieras.' }));
```

In `nodeList`, the item text becomes `` text: block.free?.[node.path] ? `↗ ${node.label}` : node.label ``.

In `listEditor`, the kill handler becomes:

```ts
    kill.addEventListener('click', () => {
      // Through the shared removal, so a freed item further down keeps its spot on the same item.
      const listPath = sketchListPath(block.type, spec.key);
      if (!listPath || !sketchRemoveNode(block, `${listPath}/${index}`)) items.splice(index, 1);
      scheduleStructural(); draw();
    });
```

Add the panel method after `remoteElMove`:

```ts
    /** A part pulled out of its box (or a free part or inserted element moved or resized) on the canvas. */
    remoteFree(id: string, path: string, x: number, y: number, w?: number) {
      if (!sketch || opts?.locked) return;
      const block = allBlocks().find(item => item.id === id);
      const pos = sketchFreePos({ x, y, ...(w !== undefined ? { w } : {}) });
      if (!block || !pos) return;
      if (path.startsWith('extras/')) {
        const extra = (block.extras || []).find((item: any) => `extras/${item.id}` === path);
        if (!extra) return;
        Object.assign(extra, { x: pos.x, y: pos.y }, pos.w !== undefined ? { w: pos.w } : {});
      } else {
        const before = block.free?.[path];
        const next = { ...pos, ...(pos.w === undefined && before?.w !== undefined ? { w: before.w } : {}), ...(before?.r ? { r: before.r } : {}) };
        if (!sketchSetFree(block, path, next)) return;
      }
      forgottenBlock = null; focusNode(id, path); picker = null;
      schedule(); draw();
    },
```

In `source-studio.ts`, next to the `boceto-el-move` routing line add:

```ts
      if (event.data.type === 'pagosya:boceto-free' && typeof event.data.id === 'string' && typeof event.data.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(event.data.path) && typeof event.data.x === 'number' && typeof event.data.y === 'number') bocetoPanel.remoteFree(event.data.id, event.data.path, event.data.x, event.data.y, typeof event.data.w === 'number' ? event.data.w : undefined);
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts
git commit -m "feat(boceto): the Studio keeps freed parts, turns them and puts them back"
```

---

### Task 6: Studio — "+ Insertar" and the inserted element's inspector

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts`, `apps/merchant-studio/src/source-boceto.css`
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `SKETCH_EXTRA_MAX` (Task 1), `turnRow` and `freeSpots` (Task 5).
- Produces: chips `[data-boceto-insert="<kind>"]`, emoji buttons `[data-boceto-emoji]`, WhatsApp number input `[data-boceto-whatsapp]`; photo slot `extras.<i>.value` accepted by `remotePhoto`; text limits for `extras.<i>.value` (text 120, button 40, others 200).

- [ ] **Step 1: Write the failing tests** (append)

```ts
const openBlock = (id: string) => {
  const head = host.querySelector(`[data-boceto-block="${id}"] .bct-block__head`) as HTMLElement;
  head.click();
  if (!host.querySelector('[data-boceto-insert]')) head.click();
};

it('insert: each kind lands centred, selected, and saves; the preview reloads to show it', async () => {
  const reload = vi.fn();
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  for (const kind of ['emoji', 'text', 'button', 'photo', 'icon']) {
    openBlock('intro');
    (host.querySelector(`[data-boceto-insert="${kind}"]`) as HTMLElement).click();
    expect(lastSelection().path).toMatch(/^extras\/e[a-z0-9]{3,10}$/);
  }
  await vi.advanceTimersByTimeAsync(1300);
  const extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => [extra.kind, extra.x, extra.y])).toEqual(['emoji', 'text', 'button', 'photo', 'icon'].map(kind => [kind, 45, 40]));
  expect(extras.find((extra: any) => extra.kind === 'photo').value).toBe('assets/a.jpg');
  expect(extras.find((extra: any) => extra.kind === 'button').href).toBe('checkout.html');
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
  expect([...host.querySelectorAll('.bct-node')].map(node => node.textContent)).toEqual(expect.arrayContaining(['Elementos sueltos', 'Emoji', 'Texto', 'Botón', 'Foto', 'Ícono']));
});

it('insert: the emoji grid, "Lleva a" WhatsApp and Eliminar edit the selected element', async () => {
  await mount();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="emoji"]') as HTMLElement).click();
  expect(host.querySelectorAll('[data-boceto-emoji]')).toHaveLength(40);
  (host.querySelector('[data-boceto-emoji="🍪"]') as HTMLElement).click();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="button"]') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === 'WhatsApp') as HTMLElement).click();
  const phone = host.querySelector('[data-boceto-whatsapp]') as HTMLInputElement;
  phone.value = '+591 7000-0000'; phone.dispatchEvent(new Event('change'));
  await vi.advanceTimersByTimeAsync(1300);
  let extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => (extra.kind === 'emoji' ? extra.value : extra.href))).toEqual(['🍪', 'https://wa.me/59170000000']);
  (host.querySelector('[data-boceto-remove-node]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  extras = putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras;
  expect(extras.map((extra: any) => extra.kind)).toEqual(['emoji']);
});

it('insert: a text element keeps up to 120 characters from a canvas edit; chips stop at 12', async () => {
  const panel = await mount();
  openBlock('intro');
  (host.querySelector('[data-boceto-insert="text"]') as HTMLElement).click();
  panel.remoteText('intro', 'extras.0.value', 'x'.repeat(150));
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras[0].value).toHaveLength(120);
  for (let i = 0; i < 11; i++) { openBlock('intro'); (host.querySelector('[data-boceto-insert="emoji"]') as HTMLElement).click(); }
  openBlock('intro');
  expect((host.querySelector('[data-boceto-insert="emoji"]') as HTMLButtonElement).disabled).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: the three new tests FAIL (no `[data-boceto-insert]`).

- [ ] **Step 3: Implement** in `source-boceto.ts`.

Add `SKETCH_EXTRA_MAX` to the shared import. After `MAXLEN` add:

```ts
/** The emoji grid of an inserted emoji. */
const EMOJIS = ['✨', '🔥', '⭐', '💛', '❤️', '🎉', '🎁', '🍪', '🍰', '🧁', '🍩', '☕', '🍓', '🍋', '🌸', '🌿', '🌈', '☀️', '🌙', '⚡', '💥', '💫', '🛍️', '🏷️', '💌', '📦', '🚚', '👋', '👉', '👀', '😍', '😋', '🥳', '🤩', '👌', '💯', '✅', '🆕', '📍', '🕒'];
const EXTRA_KINDS: Array<{ kind: string; label: string }> = [{ kind: 'emoji', label: 'Emoji' }, { kind: 'text', label: 'Texto' }, { kind: 'button', label: 'Botón' }, { kind: 'photo', label: 'Foto' }, { kind: 'icon', label: 'Ícono' }];
/** Where an inserted button leads (WhatsApp takes a number). */
const LINKS = [{ key: 'catalog', label: 'Catálogo', href: 'index.html#skb-catalogo' }, { key: 'order', label: 'Pedido', href: 'checkout.html' }, { key: 'home', label: 'Inicio', href: 'index.html' }];
```

In `createBocetoPanel`, next to `let picker …`, add `let waPending: string | null = null;` (the button waiting for its WhatsApp number).

Add these functions after `listEditor`:

```ts
  /** "+ Insertar": an emoji, a text, a button, a photo or an icon dropped on the block, centred and selected. */
  function insertRow(block: any) {
    const count = Array.isArray(block.extras) ? block.extras.length : 0;
    const chips = EXTRA_KINDS.map(({ kind, label }) => {
      const chip = el('button', { type: 'button', className: 'bct-chip', text: `+ ${label}`, disabled: count >= SKETCH_EXTRA_MAX || (kind === 'photo' && !photos.length) });
      chip.dataset.bocetoInsert = kind;
      chip.addEventListener('click', () => insertExtra(block, kind));
      return chip;
    });
    return el('div', { className: 'bct-list' }, [el('p', { className: 'bct-list__title', text: 'Insertar' }), el('div', { className: 'bct-chips' }, chips)]);
  }
  function insertExtra(block: any, kind: string) {
    const extras: any[] = Array.isArray(block.extras) ? block.extras : (block.extras = []);
    if (extras.length >= SKETCH_EXTRA_MAX) return;
    let id = '';
    while (!id || extras.some(extra => extra.id === id)) id = `e${Math.random().toString(36).slice(2, 8).padEnd(4, '0')}`;
    const value: Record<string, string> = { emoji: '✨', text: 'Escribe aquí', button: 'Pedir ahora', photo: photos[0] ?? '', icon: 'sparkles' };
    const width: Record<string, number> = { emoji: 8, photo: 22, icon: 6 };
    extras.push({ id, kind, value: value[kind], x: 45, y: 40, ...(width[kind] ? { w: width[kind] } : {}), ...(kind === 'button' ? { href: 'checkout.html' } : {}) });
    forgottenBlock = null; selected = block.id; selectedPath = `extras/${id}`; expanded.add(block.id); picker = null;
    scheduleStructural(); draw();
  }
  /** Inspector for an inserted element: what it shows, where a button leads, its turn, and Eliminar. */
  function extraProps(block: any, path: string, label: string) {
    const index = (block.extras || []).findIndex((extra: any) => `extras/${extra.id}` === path);
    const extra = block.extras?.[index];
    const children: HTMLElement[] = [];
    if (!extra) return section(label, children);
    if (extra.kind === 'emoji') {
      const grid = el('div', { className: 'bct-emojis' });
      for (const emoji of EMOJIS) {
        const button = el('button', { type: 'button', className: `bct-emoji${extra.value === emoji ? ' is-on' : ''}`, text: emoji });
        button.dataset.bocetoEmoji = emoji;
        button.addEventListener('click', () => { extra.value = emoji; scheduleStructural(); draw(); });
        grid.append(button);
      }
      children.push(grid);
    } else if (extra.kind === 'text') {
      children.push(el('p', { className: 'bct-hint', text: 'Toca dos veces este texto en el lienzo para editarlo.' }));
    } else if (extra.kind === 'button') {
      children.push(el('p', { className: 'bct-hint', text: 'Toca dos veces el botón en el lienzo para cambiar su texto.' }));
      const whatsapp = /^https:\/\/wa\.me\//.test(extra.href || '') || waPending === extra.id;
      const current = whatsapp ? 'whatsapp' : LINKS.find(link => link.href === extra.href)?.key ?? 'order';
      children.push(row('Lleva a', segment(current, [...LINKS.map(link => link.key), 'whatsapp'], [...LINKS.map(link => link.label), 'WhatsApp'], next => {
        const link = LINKS.find(item => item.key === next);
        if (link) { extra.href = link.href; waPending = null; scheduleStructural(); } else waPending = extra.id;
        draw();
      })));
      if (whatsapp) {
        const phone = el('input', { type: 'tel', className: 'bct-select', placeholder: 'Con código de país, ej. 59170000000', value: /^https:\/\/wa\.me\//.test(extra.href || '') ? String(extra.href).slice('https://wa.me/'.length) : '' });
        phone.dataset.bocetoWhatsapp = '';
        phone.addEventListener('change', () => {
          const digits = phone.value.replace(/\D/g, '');
          if (digits.length < 6 || digits.length > 15) { note = 'Escribe el número de WhatsApp con código de país.'; draw(); return; }
          extra.href = `https://wa.me/${digits}`; waPending = null; note = '';
          scheduleStructural(); draw();
        });
        children.push(row('Número', phone));
      }
    } else if (extra.kind === 'photo') {
      children.push(row('Foto', photoButton(block, `extras.${index}.value`)));
    } else {
      children.push(row('Ícono', iconButton(block, `extras.${index}.value`, extra.value)));
    }
    children.push(turnRow(extra));
    const remove = el('button', { type: 'button', className: 'bct-remove', text: 'Eliminar' });
    remove.dataset.bocetoRemoveNode = '';
    remove.addEventListener('click', () => removeSelection());
    children.push(remove);
    children.push(el('p', { className: 'bct-hint', text: 'Arrástralo a donde quieras; la esquina azul cambia su tamaño. En el celular se pone en fila al final del bloque.' }));
    return section(label, children);
  }
```

In `nodeProps`, right after `const key = path.split('/').pop()!;`, add:

```ts
    if (path.startsWith('extras/')) return extraProps(block, path, node?.label ?? 'Elemento');
    if (path === 'extras') return section('Elementos sueltos', [insertRow(block), el('p', { className: 'bct-hint', text: 'Lo que insertaste sobre este bloque. Elige uno para cambiarlo.' })]);
```

and just before `return section(node?.label ?? key, children);` add `if (block.type !== 'account') children.push(insertRow(block));`.

In `blockProps`, before the `if (block.type !== 'account') { const remove = …` block, add `if (block.type !== 'account') children.push(insertRow(block));`.

In `setByPath`, replace the last line with:

```ts
    const extraLimit: Record<string, number> = { text: 120, button: 40 };
    const limit = path.startsWith('extras.') ? extraLimit[String(getPath(block, path.replace(/\.value$/, '.kind')))] ?? 200 : MAXLEN[String(leaf)] ?? (path.startsWith('paragraphs') ? 600 : 200);
    node[key] = value.slice(0, limit);
```

In `remotePhoto`, widen the slot pattern to `/^(photo|items\.\d+\.photo|photos\.\d+|extras\.\d+\.value)$/`.

Append to `source-boceto.css`:

```css
.bct-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.bct-emojis { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; margin: 4px 0 8px; }
.bct-emoji { border: 1px solid transparent; background: transparent; border-radius: 6px; font-size: 17px; line-height: 1; padding: 5px 0; cursor: pointer; }
.bct-emoji:hover, .bct-emoji.is-on { border-color: #1f6feb; background: #2c2c2c; }
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-boceto.css
git commit -m "feat(boceto): + Insertar emojis, texts, buttons, photos and icons, with their own inspector"
```

---

### Task 7: Full suites, Studio build, live check in the owner's app

**Files:** none new (fixes only if something fails).

- [ ] **Step 1: Run the affected suites**

```bash
pnpm --filter @pagosya/shared-types build
cd apps/api && npx jest src/storefront-source/sketch src/storefront-source/sketch-studio && npx tsc --noEmit -p tsconfig.json && cd ../..
cd packages/storefront-preview && npx vitest run && cd ../..
cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json && cd ../..
```
Expected: all PASS.

- [ ] **Step 2: Rebuild the Studio the dashboard serves**

Run: `cd apps/merchant-dashboard && pnpm run build:studio`
Expected: vite build succeeds.

- [ ] **Step 3: Live check** (Chrome, the owner's running dev app, a Boceto store): free the hero title and a button (drag them out of the column), insert an emoji, reload: all three are where they were left; at 390px the store page shows them back in the column. Then restore the store: "Volver a su lugar" on both, "Eliminar" on the emoji.

- [ ] **Step 4: Commit any fixes** (one commit per fix, message `fix(boceto): …`).
