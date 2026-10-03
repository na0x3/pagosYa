# Boceto structured selection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Boceto editor select and move Figma-style nested groups (block → column → row → element) with outlines, a layer tree and per-group layout controls, while the sketch stays a typed, responsive block list.

**Architecture:** One shared module (`packages/shared-types/src/sketch-structure.ts`) declares every block's fixed group tree, reorder rules and layout fields; the API renderer stamps `data-skb-group` / `data-skb-node` attributes from it, the repair keeps `order`/`layout` valid against it, the sandboxed preview script derives paths from those attributes, and the Studio panel uses the same module for its tree, inspector and moves. Selection lives in the Studio (`selected` + `selectedPath`) and is mirrored into the preview through the existing `pagosya:boceto-apply` channel.

**Tech Stack:** TypeScript, NestJS API (jest), Vite Studio (vitest + jsdom), plain-JS preview runtime (vitest + jsdom), Next-source sketch assembly.

**Spec:** `docs/superpowers/specs/2026-10-03-boceto-structure-and-icons-design.md` — this plan implements **Sub-project 1** only. Sub-project 2 (icons) gets its own plan.

## Global Constraints

- No free x/y placement: moves only reorder siblings; stickers keep their existing free % drag.
- Built-in groups only — no merchant-created groups.
- Old sketches (no `layout`, no new `order`) must render exactly as today.
- The sketch loop never surfaces an error: repair drops unknown keys/values silently.
- Phones: two-column blocks always stack and horizontal rows wrap, whatever the settings.
- **Spec adjustment (found while planning):** the chat-on-sketch model reply uses a strict schema without any editor-only fields, and `source-generation.service.ts` carries `align/flip/swap/order/stickerPos` over by block id. This plan adds `layout` to that carry-over so chat edits never wipe it. Letting YAPI *set* `layout` moves to Sub-project 2, which changes the prompts and schema anyway.
- `account.layout` already means the account page composition (`'split' | 'center'`); the account page gets selection, tree and perk moves, but **no** group layout settings.
- After Studio changes, rebuild the embedded Studio: `cd apps/merchant-dashboard && pnpm run build:studio` (the owner's dashboard serves a pre-built copy).
- The API resolves `@pagosya/shared-types` from `dist`: run `pnpm --filter @pagosya/shared-types build` before API tests whenever the shared module changes. The Studio resolves it from `src` (vite alias).

## Review Focus

1. **Clicking a block's padding (no group under the cursor)** must select the block, never throw — chain is just `[section]`. Test in Task 4.
2. **A stale selection after a structural reload** (the selected list item was deleted or the block removed) must fall back to the nearest existing ancestor instead of an empty overlay. Test in Task 6 (`remoteSelect` with a missing path) and Task 4 (`nodeAt` returns null → no boxes).
3. **Hostile messages from the sandboxed preview** (path with `..`, 500-char keys, non-permutation array orders like `['0','0']`) must be ignored. Tests in Task 1 (`sketchApplyMove` rejects non-permutations) and Task 6 (routing validation, `remoteNodeMove` refusals).
4. **Layout on a group that the block does not render** (e.g. `layout.media` on a hero without photo) must be harmless: kept by repair only for known keys, ignored by CSS. Test in Task 2.
5. **Keyboard while editing text in the canvas** (Delete/Backspace inside a contenteditable) must edit text, not delete the node. Test in Task 5 (`boceto-key` not posted while editing).

---

## File map

| File | Responsibility |
|---|---|
| `packages/shared-types/src/sketch-structure.ts` (create) | Group trees, copy orders, labels, layout fields, repair of `layout`, node tree from block data, move/remove rules |
| `packages/shared-types/src/index.ts` (modify) | Export the module |
| `apps/api/src/storefront-source/sketch/sketch-structure.spec.ts` (create) | Unit tests of the shared module (jest, via the built package) |
| `apps/api/src/storefront-source/sketch/sketch-schema.ts` (modify) | Types (`order`, `layout` on every block), generalised order + layout repair, `carryEditorFields` |
| `apps/api/src/storefront-source/source-generation.service.ts` (modify) | Use `carryEditorFields` (adds `layout`) |
| `apps/api/src/storefront-source/sketch/sketch-blocks.ts` (modify) | Stamp group/node attributes, ordered copy for story/newsletter/banner, layout data attributes + CSS |
| `packages/storefront-preview/src/source-preview-boceto-mode.js` (modify) | Paths, click drill-down, Esc/Enter, overlay, selection mirror, node drag, live layout, key forwarding |
| `apps/merchant-studio/src/source-boceto.ts` (modify) | `selectedPath`, selection sync, remote handlers, keyboard, inspector per group, Capas tree |
| `apps/merchant-studio/src/source-boceto.css` (modify) | Tree styles |
| `apps/merchant-studio/src/source-studio.ts` (modify) | Route new preview messages, resync selection on frame load |

---

### Task 1: Shared structure module

**Files:**
- Create: `packages/shared-types/src/sketch-structure.ts`
- Modify: `packages/shared-types/src/index.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-structure.spec.ts`

**Interfaces:**
- Produces (exact exports, used by Tasks 2, 3, 6, 7, 8):
  - `type SketchGroupKind = 'column' | 'row' | 'head' | 'items' | 'media'`
  - `type SketchReorder = { kind: 'order' } | { kind: 'array'; field: string } | { kind: 'flip' } | { kind: 'swap' } | { kind: 'fields'; a: string; b: string } | { kind: 'none' }`
  - `type SketchGroup = { key: string; parent: string; kind: SketchGroupKind; reorder: SketchReorder }`
  - `type SketchGroupLayout = { gap?: 's' | 'm' | 'l'; dir?: 'row' | 'column'; align?: 'start' | 'center' | 'end'; valign?: 'start' | 'center' | 'end' }`
  - `type SketchNode = { path: string; key: string; label: string; children: SketchNode[] }`
  - `const SKETCH_COPY_ORDER: Record<string, readonly string[]>`
  - `const SKETCH_TWO_COLUMN: readonly string[]`
  - `function sketchGroups(type: string): SketchGroup[]`
  - `function sketchGroup(type: string, key: string): SketchGroup | undefined`
  - `function sketchReorder(block: { type: string }, parentPath: string): SketchReorder`
  - `function repairSketchLayout(type: string, raw: unknown): Record<string, SketchGroupLayout> | undefined`
  - `function sketchNodeTree(block: any): SketchNode[]`
  - `function sketchFindNode(nodes: SketchNode[], path: string): SketchNode | undefined`
  - `function sketchCanMove(block: any, path: string): boolean`
  - `function sketchApplyMove(block: any, parentPath: string, order: string[]): 'live' | 'reload' | null`
  - `function sketchCanRemove(block: any, path: string): boolean`
  - `function sketchRemoveNode(block: any, path: string): boolean`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/storefront-source/sketch/sketch-structure.spec.ts`:

```ts
import { repairSketchLayout, sketchApplyMove, sketchCanMove, sketchCanRemove, sketchFindNode, sketchNodeTree, sketchRemoveNode, sketchReorder, SKETCH_COPY_ORDER } from '@pagosya/shared-types';

const hero = () => ({ id: 'h', type: 'hero', variant: 'photo-right', headline: 'Hola', sub: 'sub', cta: 'Ver', cta2: 'Caja', trust: '★ 4.8', badge: '', note: '', sticker: 'Fresco', caption: 'pie', photo: 'assets/a.jpg', bg: 'paper', size: 'l' }) as any;

describe('sketch structure', () => {
  it('builds the hero tree in render order, skipping empty optional elements', () => {
    const tree = sketchNodeTree(hero());
    expect(tree.map(node => node.path)).toEqual(['copy', 'media']);
    expect(tree[0].children.map(node => node.key)).toEqual(['headline', 'sub', 'actions', 'trust']);
    expect(sketchFindNode(tree, 'copy/actions')!.children.map(node => node.path)).toEqual(['copy/actions/cta', 'copy/actions/cta2']);
    expect(tree[1].children.map(node => node.key)).toEqual(['photo', 'caption', 'sticker']);
    expect(sketchFindNode(tree, 'copy/actions')!.label).toBe('Botones');
  });
  it('follows a saved order and a swap', () => {
    const block = { ...hero(), order: ['actions', 'headline', 'sub', 'badge', 'trust', 'note'], swap: true };
    const copy = sketchNodeTree(block)[0];
    expect(copy.children.map(node => node.key)).toEqual(['actions', 'headline', 'sub', 'trust']);
    expect(copy.children[0].children.map(node => node.key)).toEqual(['cta2', 'cta']);
  });
  it('lists head + items for grid blocks, numbered labels for items', () => {
    const steps = { id: 's', type: 'steps', kicker: 'K', title: 'T', note: '', items: [{ icon: 'a', title: '1', text: '' }, { icon: 'b', title: '2', text: '' }], bg: 'paper', size: 'm' };
    const tree = sketchNodeTree(steps);
    expect(tree.map(node => node.key)).toEqual(['head', 'items']);
    expect(tree[0].children.map(node => node.key)).toEqual(['kicker', 'title']);
    expect(tree[1].children.map(node => node.label)).toEqual(['Paso 1', 'Paso 2']);
  });
  it('marquee and footer have no inner nodes; a hero without photo keeps its sticker at block level', () => {
    expect(sketchNodeTree({ type: 'marquee' })).toEqual([]);
    expect(sketchNodeTree({ type: 'footer', tagline: 'x' })).toEqual([]);
    expect(sketchNodeTree({ ...hero(), photo: undefined }).map(node => node.key)).toEqual(['copy', 'sticker']);
  });
  it('reorder rules per container', () => {
    expect(sketchReorder({ type: 'hero' }, '')).toEqual({ kind: 'flip' });
    expect(sketchReorder({ type: 'steps' }, '')).toEqual({ kind: 'none' });
    expect(sketchReorder({ type: 'hero' }, 'copy')).toEqual({ kind: 'order' });
    expect(sketchReorder({ type: 'hero' }, 'copy/actions')).toEqual({ kind: 'swap' });
    expect(sketchReorder({ type: 'reviews' }, 'items')).toEqual({ kind: 'array', field: 'quotes' });
    expect(sketchReorder({ type: 'announce' }, 'row')).toEqual({ kind: 'fields', a: 'left', b: 'right' });
  });
  it('can move only what the rules allow', () => {
    const block = hero();
    expect(sketchCanMove(block, '')).toBe(false);
    expect(sketchCanMove(block, 'copy')).toBe(true);
    expect(sketchCanMove({ ...block, photo: undefined }, 'copy')).toBe(false);
    expect(sketchCanMove(block, 'copy/headline')).toBe(true);
    expect(sketchCanMove(block, 'copy/actions/cta')).toBe(true);
    expect(sketchCanMove({ ...block, cta2: '' }, 'copy/actions/cta')).toBe(false);
    expect(sketchCanMove(block, 'media/photo')).toBe(false);
    expect(sketchCanMove({ type: 'newsletter', variant: 'center', photo: 'assets/a.jpg' }, 'copy')).toBe(false);
  });
  it('applies moves: order is live, arrays reload, bad permutations are rejected', () => {
    const block = hero();
    // Visible order first, hidden (empty) elements appended — the same rule the editor already used.
    expect(sketchApplyMove(block, 'copy', ['sub', 'headline', 'actions', 'trust'])).toBe('live');
    expect(block.order).toEqual(['sub', 'headline', 'actions', 'trust', 'badge', 'note']);
    expect(sketchApplyMove(block, 'copy', [...SKETCH_COPY_ORDER.hero])).toBe('live');
    expect(block.order).toBeUndefined();
    expect(sketchApplyMove(block, '', ['media', 'copy'])).toBe('live');
    expect(block.flip).toBe(true);
    expect(sketchApplyMove(block, 'copy/actions', ['cta2', 'cta'])).toBe('live');
    expect(block.swap).toBe(true);
    const split = { type: 'split', pills: ['a', 'b', 'c'] } as any;
    expect(sketchApplyMove(split, 'copy/pills', ['2', '0', '1'])).toBe('reload');
    expect(split.pills).toEqual(['c', 'a', 'b']);
    expect(sketchApplyMove(split, 'copy/pills', ['0', '0', '1'])).toBeNull();
    expect(sketchApplyMove(split, 'copy/pills', ['0', '1'])).toBeNull();
    expect(split.pills).toEqual(['c', 'a', 'b']);
    const announce = { type: 'announce', left: 'L', right: 'R' } as any;
    expect(sketchApplyMove(announce, 'row', ['right', 'left'])).toBe('reload');
    expect([announce.left, announce.right]).toEqual(['R', 'L']);
    expect(sketchApplyMove(block, 'media', ['caption', 'photo'])).toBeNull();
  });
  it('removes optional leaves and list items only', () => {
    const block = { ...hero(), stickerPos: { x: 1, y: 2 } };
    expect(sketchCanRemove(block, 'copy/headline')).toBe(false);
    expect(sketchCanRemove(block, 'copy/actions/cta2')).toBe(true);
    expect(sketchRemoveNode(block, 'copy/actions/cta2')).toBe(true);
    expect(block.cta2).toBe('');
    expect(sketchRemoveNode(block, 'media/sticker')).toBe(true);
    expect(block.sticker).toBe('');
    expect(block.stickerPos).toBeUndefined();
    const faq = { type: 'faq', items: [{ q: 'a' }, { q: 'b' }] } as any;
    expect(sketchRemoveNode(faq, 'items/0')).toBe(true);
    expect(faq.items).toEqual([{ q: 'b' }]);
    expect(sketchRemoveNode(faq, 'items/7')).toBe(false);
  });
  it('repairs layout: known groups and values only', () => {
    expect(repairSketchLayout('hero', { copy: { gap: 'l', valign: 'end', dir: 'row' }, actions: { dir: 'column', align: 'center', gap: 'xx' }, bogus: { gap: 's' } }))
      .toEqual({ copy: { gap: 'l', valign: 'end' }, actions: { dir: 'column', align: 'center' } });
    expect(repairSketchLayout('hero', { media: { gap: 's' } })).toBeUndefined();
    expect(repairSketchLayout('steps', { items: { gap: 's' }, head: { align: 'center' } })).toEqual({ items: { gap: 's' } });
    expect(repairSketchLayout('hero', 'nope')).toBeUndefined();
    expect(repairSketchLayout('marquee', { copy: { gap: 's' } })).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-structure.spec.ts`
Expected: FAIL — `sketchNodeTree` (and the other imports) are not exported from `@pagosya/shared-types`.

- [ ] **Step 3: Write the module**

Create `packages/shared-types/src/sketch-structure.ts`:

```ts
/** The fixed group tree of every Boceto block (spec 2026-10-03-boceto-structure-and-icons-design). One source for the
 * API renderer and repair and the Studio editor, so the canvas, the saved sketch and the inspector cannot drift.
 * A path names a node inside a block: '' is the block, 'copy', 'copy/actions', 'copy/actions/cta', 'items/2'. */

export type SketchGroupKind = 'column' | 'row' | 'head' | 'items' | 'media';
/** How a container's children are reordered: the copy column's `order`, an array field, the copy/media `flip`,
 * the two-button `swap`, the announce left/right text `fields`, or not at all. */
export type SketchReorder = { kind: 'order' } | { kind: 'array'; field: string } | { kind: 'flip' } | { kind: 'swap' } | { kind: 'fields'; a: string; b: string } | { kind: 'none' };
export type SketchGroup = { key: string; parent: string; kind: SketchGroupKind; reorder: SketchReorder };
export type SketchGroupLayout = { gap?: 's' | 'm' | 'l'; dir?: 'row' | 'column'; align?: 'start' | 'center' | 'end'; valign?: 'start' | 'center' | 'end' };
export type SketchNode = { path: string; key: string; label: string; children: SketchNode[] };

/** Copy-column elements that reorder, in default order (hero/split keep the keys saved before this module). */
export const SKETCH_COPY_ORDER: Record<string, readonly string[]> = {
  hero: ['badge', 'headline', 'sub', 'actions', 'trust', 'note'],
  split: ['headline', 'body', 'pills', 'stats', 'boxes', 'actions'],
  story: ['title', 'paragraphs'],
  newsletter: ['title', 'note', 'form'],
  banner: ['headline', 'cta'],
};
/** Blocks whose copy column sits beside a photo; their two top groups swap sides through `flip`. */
export const SKETCH_TWO_COLUMN: readonly string[] = ['hero', 'split', 'story', 'newsletter'];

const none = { kind: 'none' } as const;
const order = { kind: 'order' } as const;
const array = (field: string) => ({ kind: 'array', field }) as const;
const g = (key: string, parent: string, kind: SketchGroupKind, reorder: SketchReorder): SketchGroup => ({ key, parent, kind, reorder });
const headAndItems = (field: string | null): SketchGroup[] => [g('head', '', 'head', none), g('items', '', 'items', field ? array(field) : none)];

const GROUPS: Record<string, SketchGroup[]> = {
  hero: [g('copy', '', 'column', order), g('media', '', 'media', none), g('actions', 'copy', 'row', { kind: 'swap' })],
  split: [g('copy', '', 'column', order), g('media', '', 'media', none), g('actions', 'copy', 'row', { kind: 'swap' }), g('pills', 'copy', 'row', array('pills')), g('stats', 'copy', 'row', array('stats')), g('boxes', 'copy', 'row', array('boxes'))],
  story: [g('copy', '', 'column', order), g('media', '', 'media', none), g('paragraphs', 'copy', 'items', array('paragraphs'))],
  newsletter: [g('copy', '', 'column', order), g('media', '', 'media', none)],
  banner: [g('copy', '', 'column', order)],
  steps: headAndItems('items'),
  collections: headAndItems('items'),
  reviews: headAndItems('quotes'),
  gallery: headAndItems('photos'),
  faq: headAndItems('items'),
  catalog: headAndItems(null),
  announce: [g('row', '', 'row', { kind: 'fields', a: 'left', b: 'right' })],
  account: [g('intro', '', 'column', none), g('perks', 'intro', 'row', array('perks'))],
};

export const sketchGroups = (type: string): SketchGroup[] => GROUPS[type] ?? [];
export const sketchGroup = (type: string, key: string): SketchGroup | undefined => sketchGroups(type).find(group => group.key === key);

/** The rule for reordering the children of the container at `parentPath` ('' = the block itself). */
export function sketchReorder(block: { type: string }, parentPath: string): SketchReorder {
  if (!parentPath) return SKETCH_TWO_COLUMN.includes(block.type) ? { kind: 'flip' } : none;
  const key = parentPath.split('/').pop()!;
  return sketchGroup(block.type, key)?.reorder ?? none;
}

/** Layout fields each group kind accepts. Column alignment and head alignment stay the block's own `align`. */
const LAYOUT_FIELDS: Record<SketchGroupKind, ReadonlyArray<keyof SketchGroupLayout>> = { column: ['gap', 'valign'], row: ['gap', 'dir', 'align'], head: [], items: ['gap'], media: [] };
const LAYOUT_VALUES: Record<keyof SketchGroupLayout, readonly string[]> = { gap: ['s', 'm', 'l'], dir: ['row', 'column'], align: ['start', 'center', 'end'], valign: ['start', 'center', 'end'] };

/** Keeps known groups and allowed values; anything else is dropped silently. Undefined when nothing survives. */
export function repairSketchLayout(type: string, raw: unknown): Record<string, SketchGroupLayout> | undefined {
  if (type === 'account' || typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const out: Record<string, SketchGroupLayout> = {};
  for (const group of sketchGroups(type)) {
    const entry = (raw as Record<string, unknown>)[group.key];
    if (typeof entry !== 'object' || entry === null) continue;
    const kept: Record<string, string> = {};
    for (const field of LAYOUT_FIELDS[group.kind]) {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === 'string' && LAYOUT_VALUES[field].includes(value)) kept[field] = value;
    }
    if (Object.keys(kept).length) out[group.key] = kept as SketchGroupLayout;
  }
  return Object.keys(out).length ? out : undefined;
}

const LABELS: Record<string, string> = {
  copy: 'Columna de texto', media: 'Foto', actions: 'Botones', pills: 'Etiquetas', stats: 'Cifras', boxes: 'Cajitas', paragraphs: 'Párrafos',
  head: 'Encabezado', row: 'Avisos', intro: 'Presentación', perks: 'Beneficios',
  badge: 'Etiqueta superior', headline: 'Título', title: 'Título', sub: 'Bajada', body: 'Texto', trust: 'Confianza', note: 'Nota', kicker: 'Antetítulo',
  cta: 'Botón principal', cta2: 'Botón secundario', form: 'Formulario', photo: 'Foto', caption: 'Pie de foto', tag: 'Etiqueta de foto', sticker: 'Sticker',
  left: 'Aviso izquierdo', right: 'Aviso derecho', seeAll: 'Ver todo', rating: 'Calificación', lead: 'Bajada',
};
const ITEMS_LABEL: Record<string, string> = { steps: 'Pasos', collections: 'Categorías', reviews: 'Reseñas', gallery: 'Fotos', faq: 'Preguntas', catalog: 'Productos' };
const ITEM_LABEL: Record<string, string> = { pills: 'Etiqueta', stats: 'Cifra', boxes: 'Cajita', paragraphs: 'Párrafo', perks: 'Beneficio', steps: 'Paso', collections: 'Categoría', reviews: 'Reseña', gallery: 'Foto', faq: 'Pregunta' };

function label(type: string, key: string, parentPath: string): string {
  if (/^\d+$/.test(key)) {
    const container = parentPath.split('/').pop() ?? '';
    return `${ITEM_LABEL[container === 'items' ? type : container] ?? 'Elemento'} ${Number(key) + 1}`;
  }
  if (key === 'items') return ITEMS_LABEL[type] ?? 'Elementos';
  return LABELS[key] ?? key;
}

const filled = (value: unknown) => (typeof value === 'string' ? value.trim() !== '' : Array.isArray(value) ? value.length > 0 : value != null && value !== false);

/** The block's nodes as the canvas renders them (Task 3 stamps the same keys), skipping empty optional parts. */
export function sketchNodeTree(block: any): SketchNode[] {
  const type = String(block?.type ?? '');
  const make = (parent: string, key: string, children: (path: string) => SketchNode[] = () => []): SketchNode => {
    const path = parent ? `${parent}/${key}` : key;
    return { path, key, label: label(type, key, parent), children: children(path) };
  };
  const indices = (parent: string, field: string) => (Array.isArray(block[field]) ? block[field] : []).map((_: unknown, i: number) => make(parent, String(i)));
  const leaves = (parent: string, keys: string[]) => keys.filter(key => filled(block[key])).map(key => make(parent, key));
  const copyChild = (key: string) => ['headline', 'title', 'form'].includes(key) || (key === 'actions' ? filled(block.cta) : filled(block[key]));
  const copy = () => make('', 'copy', path => {
    const saved: string[] = Array.isArray(block.order) ? block.order : [...(SKETCH_COPY_ORDER[type] ?? [])];
    return [...leaves(path, ['kicker']), ...saved.filter(copyChild).map(key => make(path, key, sub =>
      key === 'actions' ? leaves(sub, block.swap ? ['cta2', 'cta'] : ['cta', 'cta2'])
        : ['pills', 'stats', 'boxes', 'paragraphs'].includes(key) ? indices(sub, key) : []))];
  });
  const media = (extras: string[]) => make('', 'media', path => [make(path, 'photo'), ...leaves(path, [...extras, 'sticker'])]);
  const head = (extras: string[]) => make('', 'head', path => [...leaves(path, ['kicker']), make(path, 'title'), ...leaves(path, extras)]);
  switch (type) {
    case 'hero': case 'split':
      return [copy(), ...(block.photo ? [media([type === 'hero' ? 'caption' : 'tag'])] : leaves('', ['sticker']))];
    case 'story': return [copy(), ...(block.photo ? [media([])] : [])];
    case 'newsletter': return [copy(), ...(block.variant === 'split' && block.photo ? [media([])] : [])];
    case 'banner': return [copy(), ...leaves('', ['sticker'])];
    case 'steps': case 'collections': return [head(['note']), make('', 'items', path => indices(path, 'items'))];
    case 'reviews': return [make('', 'head', path => [...leaves(path, ['kicker']), make(path, 'title'), ...(filled(block.ratingValue) ? [make(path, 'rating')] : [])]), make('', 'items', path => indices(path, 'quotes'))];
    case 'gallery': return [head([]), make('', 'items', path => indices(path, 'photos'))];
    case 'faq': return [head([]), make('', 'items', path => indices(path, 'items'))];
    case 'catalog': return [head(['seeAll']), make('', 'items')];
    case 'announce': return [make('', 'row', path => [make(path, 'left'), make(path, 'right')])];
    case 'account': return [make('', 'intro', path => [...leaves(path, ['kicker']), make(path, 'title'), make(path, 'lead'), ...(filled(block.perks) ? [make(path, 'perks', sub => indices(sub, 'perks'))] : [])])];
    default: return [];
  }
}

export function sketchFindNode(nodes: SketchNode[], path: string): SketchNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (path.startsWith(`${node.path}/`)) return sketchFindNode(node.children, path);
  }
  return undefined;
}

const split = (path: string) => { const parts = path.split('/'); const key = parts.pop() ?? ''; return { key, parent: parts.join('/') }; };

export function sketchCanMove(block: any, path: string): boolean {
  if (!path) return false;
  const { key, parent } = split(path);
  const rule = sketchReorder(block, parent);
  switch (rule.kind) {
    case 'order': return (SKETCH_COPY_ORDER[block.type] ?? []).includes(key);
    case 'array': return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && block[rule.field].length > 1;
    case 'flip': return (key === 'copy' || key === 'media') && Boolean(block.photo) && (block.type !== 'newsletter' || block.variant === 'split');
    case 'swap': return (key === 'cta' || key === 'cta2') && filled(block.cta2);
    case 'fields': return key === rule.a || key === rule.b;
    default: return false;
  }
}

/** Applies a sibling order (keys as the canvas shows them after a drop) to the block data. 'live' when the canvas DOM
 * already matches the data, 'reload' when field indices changed and the preview must re-render, null when refused. */
export function sketchApplyMove(block: any, parentPath: string, nextOrder: string[]): 'live' | 'reload' | null {
  const rule = sketchReorder(block, parentPath);
  switch (rule.kind) {
    case 'order': {
      const allowed = SKETCH_COPY_ORDER[block.type] ?? [];
      const kept = [...new Set(nextOrder.filter(key => allowed.includes(key)))];
      const full = [...kept, ...allowed.filter(key => !kept.includes(key))];
      if (full.every((key, index) => key === allowed[index])) delete block.order; else block.order = full;
      return 'live';
    }
    case 'array': {
      const list = Array.isArray(block[rule.field]) ? block[rule.field] : [];
      const picks = nextOrder.map(Number);
      const permutation = picks.length === list.length && picks.every(n => Number.isInteger(n) && n >= 0 && n < list.length) && new Set(picks).size === picks.length;
      if (!permutation) return null;
      block[rule.field] = picks.map(n => list[n]);
      return 'reload';
    }
    case 'flip': if (nextOrder[0] === 'media') block.flip = true; else delete block.flip; return 'live';
    case 'swap': if (nextOrder[0] === 'cta2') block.swap = true; else delete block.swap; return 'live';
    case 'fields': {
      if (nextOrder[0] !== rule.b) return 'live';
      [block[rule.a], block[rule.b]] = [block[rule.b], block[rule.a]];
      return 'reload';
    }
    default: return null;
  }
}

/** Optional single elements a merchant may remove (they become empty and disappear from the canvas). */
const OPTIONAL = ['badge', 'sub', 'trust', 'note', 'kicker', 'cta2', 'caption', 'tag', 'sticker', 'seeAll', 'body'];

export function sketchCanRemove(block: any, path: string): boolean {
  if (!path) return false;
  const { key, parent } = split(path);
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') return /^\d+$/.test(key) && Array.isArray(block[rule.field]) && Number(key) < block[rule.field].length;
  return OPTIONAL.includes(key) && filled(block[key]);
}

export function sketchRemoveNode(block: any, path: string): boolean {
  if (!sketchCanRemove(block, path)) return false;
  const { key, parent } = split(path);
  const rule = sketchReorder(block, parent);
  if (rule.kind === 'array') { block[rule.field].splice(Number(key), 1); return true; }
  block[key] = '';
  if (key === 'sticker') delete block.stickerPos;
  return true;
}
```

Append to `packages/shared-types/src/index.ts`:

```ts
export * from './sketch-structure';
```

- [ ] **Step 4: Build the package and run the test**

Run: `pnpm --filter @pagosya/shared-types build && cd apps/api && npx jest src/storefront-source/sketch/sketch-structure.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared-types/src/sketch-structure.ts packages/shared-types/src/index.ts apps/api/src/storefront-source/sketch/sketch-structure.spec.ts
git commit -m "feat(boceto): shared group structure for blocks (trees, moves, layout repair)"
```

---

### Task 2: Schema — generalised order, layout repair, chat carry-over

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-schema.ts` (types at lines 10–31, `SKETCH_EL_ORDER` at 51–56, shared layout controls at ~276–285)
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:808-816`
- Test: `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`

**Interfaces:**
- Consumes: `SKETCH_COPY_ORDER`, `repairSketchLayout`, `SketchGroupLayout` from Task 1.
- Produces: `SketchLayout` now `{ align?; flip?; swap?; order?: string[]; layout?: Record<string, SketchGroupLayout> }`; `export const SKETCH_EL_ORDER = SKETCH_COPY_ORDER` (kept for existing imports); `export function carryEditorFields(current: StoreSketch, edited: StoreSketch): StoreSketch['blocks']`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/storefront-source/sketch/sketch-schema.spec.ts`:

```ts
import { carryEditorFields } from './sketch-schema';

describe('structured selection fields', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const blockOf = (raw: object) => repairSketch({ blocks: [raw] }, ctx).sketch.blocks[0] as any;
  it('keeps a valid copy order for story, newsletter and banner, omitting the default', () => {
    expect(blockOf({ id: 's', type: 'story', title: 'T', paragraphs: ['a'], order: ['paragraphs', 'title'] }).order).toEqual(['paragraphs', 'title']);
    expect(blockOf({ id: 's', type: 'story', title: 'T', paragraphs: ['a'], order: ['title', 'paragraphs'] }).order).toBeUndefined();
    expect(blockOf({ id: 'n', type: 'newsletter', title: 'T', order: ['form', 'bogus'] }).order).toEqual(['form', 'title', 'note']);
    expect(blockOf({ id: 'b', type: 'banner', headline: 'H', order: ['cta'] }).order).toEqual(['cta', 'headline']);
  });
  it('repairs layout against the block structure and drops it from blocks without groups', () => {
    expect(blockOf({ id: 'h', type: 'hero', headline: 'H', layout: { copy: { gap: 'l' }, actions: { dir: 'column' }, nope: { gap: 's' } } }).layout).toEqual({ copy: { gap: 'l' }, actions: { dir: 'column' } });
    expect(blockOf({ id: 'h', type: 'hero', headline: 'H', layout: { media: { gap: 's' } } }).layout).toBeUndefined();
    expect(blockOf({ id: 'm', type: 'marquee', text: 'x', layout: { copy: { gap: 's' } } }).layout).toBeUndefined();
  });
  it('repair is idempotent with order and layout', () => {
    const once = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', order: ['actions'], layout: { copy: { valign: 'end' } } }] }, ctx).sketch;
    expect(repairSketch(once, ctx).sketch).toEqual(once);
  });
  it('chat edits keep editor-only fields, layout included, by block id', () => {
    const current = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'H', align: 'center', layout: { copy: { gap: 'l' } } }] }, ctx).sketch;
    const edited = repairSketch({ blocks: [{ id: 'h', type: 'hero', headline: 'Nuevo' }] }, ctx).sketch;
    const blocks = carryEditorFields(current, edited) as any[];
    expect(blocks[0]).toMatchObject({ headline: 'Nuevo', align: 'center', layout: { copy: { gap: 'l' } } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-schema.spec.ts -t "structured selection"`
Expected: FAIL — `carryEditorFields` is not exported; story `order` is `undefined`.

- [ ] **Step 3: Implement**

In `sketch-schema.ts`:

1. Add the import at the top:
```ts
import { repairSketchLayout, SKETCH_COPY_ORDER, type SketchGroupLayout } from '@pagosya/shared-types';
```
2. Replace line 14:
```ts
export type SketchLayout = { align?: SketchAlign; flip?: boolean; swap?: boolean; order?: string[]; layout?: Record<string, SketchGroupLayout> };
```
3. Replace the `SKETCH_EL_ORDER` declaration (lines 51–56) with:
```ts
/** The reorderable copy-column elements per block, in default order — now owned by the shared structure module. */
export const SKETCH_EL_ORDER: Partial<Record<SketchBlock['type'], readonly string[]>> = SKETCH_COPY_ORDER;
```
4. In the "Shared layout controls" block (inside `if (kept) { … }`, after the `swap` line) add:
```ts
      // Copy order for the blocks added by structured selection (hero and split repair theirs above) and group layout.
      const copyOrder = SKETCH_COPY_ORDER[kept.type];
      if (copyOrder && kept.type !== 'hero' && kept.type !== 'split') {
        const repairedOrder = order(block.order, copyOrder);
        if (repairedOrder) kept.order = repairedOrder; else delete kept.order;
      }
      const layout = repairSketchLayout(kept.type, block.layout);
      if (layout) kept.layout = layout; else delete kept.layout;
```
5. Add after `repairSketch` (end of the file):
```ts
/** Editor-only block fields are absent from the model schema, so a chat edit reply resets them; carry them over by id. */
export const SKETCH_EDITOR_ONLY = ['align', 'flip', 'swap', 'order', 'stickerPos', 'layout'] as const;
export function carryEditorFields(current: StoreSketch, edited: StoreSketch): StoreSketch['blocks'] {
  return edited.blocks.map(block => {
    const before = current.blocks.find(item => item.id === block.id) as Record<string, unknown> | undefined;
    if (!before) return block;
    const carried = Object.fromEntries(SKETCH_EDITOR_ONLY.filter(key => before[key] !== undefined && (block as Record<string, unknown>)[key] === undefined).map(key => [key, before[key]]));
    return { ...block, ...carried } as typeof block;
  });
}
```

In `source-generation.service.ts`, replace lines 811–816 (the `EDITOR_ONLY` constant and the `edited.sketch.blocks = …map(…)` statement) with:
```ts
        edited.sketch.blocks = carryEditorFields(currentSketch, edited.sketch);
```
and add `carryEditorFields` to the existing import from `./sketch` on line 42 (check `apps/api/src/storefront-source/sketch/index.ts` re-exports `sketch-schema` with `export *`; if it lists names, add `carryEditorFields` there).

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest src/storefront-source/sketch src/storefront-source/source-generation.service.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/sketch/index.ts
git commit -m "feat(boceto): copy order for story/newsletter/banner, group layout repair, chat edits keep layout"
```

---

### Task 3: Renderer — group/node attributes and layout CSS

**Files:**
- Modify: `apps/api/src/storefront-source/sketch/sketch-blocks.ts`
- Test: `apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts`, `apps/api/src/storefront-source/sketch/sketch-golden.spec.ts`

**Interfaces:**
- Consumes: `sketchNodeTree`, `SKETCH_COPY_ORDER` (Task 1); `block.layout`, `block.order` (Task 2).
- Produces (DOM contract read by Tasks 4–5): every group element carries `data-skb-group="<key>"` (plus `data-skb-gap|dir|galign|valign` when set); every selectable leaf carries `data-skb-node="<key>"` or the existing `data-skb-el="<key>"`; list items carry `data-skb-node="<index>"`. The segment of an element is `data-skb-group || data-skb-node || data-skb-el`.

- [ ] **Step 1: Write the failing tests**

Append to `sketch-blocks.spec.ts`:

```ts
import { sketchNodeTree } from '@pagosya/shared-types';

describe('structured selection markers', () => {
  const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
  const sketchWith = (blocks: object[]) => repairSketch({ blocks }, ctx).sketch;
  const segments = (markup: string) => new Set([...markup.matchAll(/data-skb-(?:group|node|el)=\{"([^"]+)"\}|data-skb-(?:group|node|el)="([^"]+)"/g)].map(m => m[1] ?? m[2]));
  const all = (nodes: ReturnType<typeof sketchNodeTree>): string[] => nodes.flatMap(node => [node.key, ...all(node.children)]);
  it('every node of the shared tree is stamped in the rendered block', () => {
    const sketch = sketchWith([
      { id: 'h', type: 'hero', headline: 'H', sub: 's', cta: 'a', cta2: 'b', trust: 't', caption: 'c', sticker: 'x', photo: 'assets/a.jpg' },
      { id: 'sp', type: 'split', kicker: 'k', headline: 'H', body: 'b', cta: 'a', pills: ['1', '2'], stats: [{ value: '1', label: 'l' }], boxes: [{ title: 't', text: '' }], tag: 'tg', photo: 'assets/a.jpg' },
      { id: 'st', type: 'story', kicker: 'k', title: 'T', paragraphs: ['a', 'b'], photo: 'assets/a.jpg' },
      { id: 'n', type: 'newsletter', variant: 'split', kicker: 'k', title: 'T', note: 'n', photo: 'assets/a.jpg' },
      { id: 'b', type: 'banner', kicker: 'k', headline: 'H', cta: 'c', sticker: 's' },
      { id: 'se', type: 'steps', kicker: 'k', title: 'T', note: 'n', items: [{ icon: 'gift', title: 'a', text: '' }] },
      { id: 'r', type: 'reviews', title: 'T', ratingValue: '4.9', quotes: [{ text: 'a', name: 'b' }] },
      { id: 'f', type: 'faq', title: 'T', items: [{ q: 'q', a: 'a' }] },
      { id: 'g', type: 'gallery', title: 'T', photos: ['assets/a.jpg'] },
      { id: 'a', type: 'announce', left: 'l', right: 'r' },
    ]);
    for (const block of sketch.blocks) {
      const found = segments(renderBlock(block, sketch, ctx));
      for (const key of all(sketchNodeTree(block))) expect([block.type, key, found.has(key)]).toEqual([block.type, key, true]);
    }
  });
  it('emits saved group layout as data attributes and story copy in saved order', () => {
    const sketch = sketchWith([{ id: 'st', type: 'story', title: 'T', paragraphs: ['a'], order: ['paragraphs', 'title'], layout: { copy: { gap: 'l', valign: 'end' }, paragraphs: { gap: 's' } } }]);
    const html = renderBlock(sketch.blocks[0], sketch, ctx);
    expect(html).toMatch(/data-skb-group=\{"copy"\} data-skb-gap=\{"l"\} data-skb-valign=\{"end"\}/);
    expect(html.indexOf('data-skb-el="paragraphs"')).toBeLessThan(html.indexOf('data-skb-el="title"'));
  });
  it('base css styles every layout attribute and keeps rows wrapping on phones', () => {
    for (const rule of ['[data-skb-gap="s"]', '[data-skb-dir="column"]', '[data-skb-galign="center"]', '[data-skb-valign="end"]']) expect(SKETCH_BASE_CSS).toContain(rule);
  });
});
```

(Check the imports at the top of the spec already include `repairSketch`, `renderBlock` and `SKETCH_BASE_CSS`; add whichever is missing from `./sketch-schema` / `./sketch-blocks`. If the layout CSS ends up in a different exported string than `SKETCH_BASE_CSS`, assert against that export instead.)

Extend `sketch-golden.spec.ts` `fullSketch()` so the golden compile/screenshot covers layout and new orders — add to the hero entry `layout: { copy: { gap: 'l', valign: 'start' }, actions: { dir: 'column', align: 'center' } }`, to the story entry `order: ['paragraphs', 'title']`, and to the faq entry `layout: { items: { gap: 's' } }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/storefront-source/sketch/sketch-blocks.spec.ts -t "structured selection"`
Expected: FAIL — `copy` / `media` / `head` keys not found in rendered markup.

- [ ] **Step 3: Implement the attributes**

In `sketch-blocks.ts`:

1. Imports: replace `SKETCH_EL_ORDER` with `SKETCH_COPY_ORDER` from `@pagosya/shared-types`:
```ts
import { SKETCH_COPY_ORDER } from '@pagosya/shared-types';
import { bestInkFor, resolveBg } from './sketch-schema';
```
2. Add helpers after `editable`:
```ts
/** A selectable leaf for the Boceto canvas (Figma-style drill-down); keys match sketchNodeTree. */
const node = (key: string) => `data-skb-node=${expr(key)}`;
/** A group wrapper: its key plus any saved layout as data attributes the base CSS reads. */
const group = (block: SketchBlock, key: string) => {
  const layout = block.layout?.[key] ?? {};
  return `data-skb-group=${expr(key)}` + (layout.gap ? ` data-skb-gap=${expr(layout.gap)}` : '') + (layout.dir ? ` data-skb-dir=${expr(layout.dir)}` : '')
    + (layout.align ? ` data-skb-galign=${expr(layout.align)}` : '') + (layout.valign ? ` data-skb-valign=${expr(layout.valign)}` : '');
};
```
3. `img`: add an optional `nodeKey` parameter emitting `node(nodeKey)`:
```ts
const img = (path: string, alt: string, className: string, slot?: string, nodeKey?: string) => `<img className=${expr(className)} src=${expr(path)} alt=${expr(alt)}${slot ? ` data-skb-photo=${expr(slot)}` : ''}${nodeKey ? ` ${node(nodeKey)}` : ''} />`;
```
4. `actionsRow` takes the block for its group attributes and marks both buttons:
```ts
const actionsRow = (block: SketchBlock, href: string, cta: string, cta2: string, swap?: boolean) => {
  const primary = `<a className="skb-btn" href=${expr(href)} ${node('cta')} ${editable('cta')}>${expr(cta)}</a>`;
  const ghost = cta2 ? `<a className="skb-btn skb-btn--ghost" href=${expr(href)} ${node('cta2')} ${editable('cta2')}>${expr(cta2)}</a>` : '';
  return `<div className="skb-actions" data-skb-el="actions" ${group(block, 'actions')}>${swap ? ghost + primary : primary + ghost}</div>`;
};
```
5. `kicker`, `photoTag`, `head`:
```ts
const kicker = (text: string) => text ? `<p className="skb-kicker" ${node('kicker')} ${editable('kicker')}>${expr(text)}</p>` : '';
const photoTag = (text: string, field: string) => text ? `<p className="skb-photo-tag" ${node(field)} ${editable(field)}>${expr(text)}</p>` : '';
const head = (block: SketchBlock & { kicker?: string; title: string }, note: string | undefined, heading: string) =>
  `<div className="skb-head" ${group(block, 'head')}>
      <div>
        ${kicker(block.kicker ?? '')}
        <${heading} className="skb-title" ${node('title')} ${editable('title')}>${expr(block.title)}</${heading}>
      </div>
      ${note ? `<p className="skb-head__note" ${node('note')} ${editable('note')}>${expr(note)}</p>` : ''}
    </div>`;
```
6. Generators — apply these exact changes:
   - **hero:** `actions: actionsRow(b, anchor, b.cta, b.cta2, b.swap)`; copy wrapper `<div className="skb-hero__copy" ${group(b, 'copy')}>`; `${ordered(parts, b.order, SKETCH_COPY_ORDER.hero)}`; media wrapper `<div className=${expr(`skb-hero__media skb-hero__media--${b.variant}`)} ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-hero__img', 'photo', 'photo')}…`.
   - **split:** pills `<div className="skb-pills" data-skb-el="pills" ${group(b, 'pills')}>${b.pills.map((pill, i) => `<span className="skb-pill" ${node(String(i))} ${editable(`pills.${i}`)}>…`; stats wrapper `${group(b, 'stats')}`, each `<div className="skb-stat" ${node(String(i))}>`; boxes wrapper `${group(b, 'boxes')}`, each `<div className="skb-box" ${node(String(i))}>`; `actions: actionsRow(b, b.href, b.cta, b.cta2, b.swap)`; copy wrapper `<div className="skb-split__copy" ${group(b, 'copy')}>`; `ordered(parts, b.order, SKETCH_COPY_ORDER.split)`; media `<div className="skb-split__media" ${group(b, 'media')}>${img(b.photo, …, 'skb-split__img', 'photo', 'photo')}…`.
   - **story:**
```ts
  story: (b, s, ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      title: `<${heading} className="skb-title" data-skb-el="title" ${editable('title')}>${expr(b.title)}</${heading}>`,
      paragraphs: b.paragraphs.length ? `<div className="skb-story__paragraphs" data-skb-el="paragraphs" ${group(b, 'paragraphs')}>${b.paragraphs.map((p, i) => `<p className="skb-lead" ${node(String(i))} ${editable(`paragraphs.${i}`)}>${expr(p)}</p>`).join('')}</div>` : '',
    };
    return open(b, s) + `
    <div className="skb-story__copy" ${group(b, 'copy')}>
      ${kicker(b.kicker)}
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.story)}
    </div>
    ${b.photo ? `<div className="skb-story__media" ${group(b, 'media')}>${img(b.photo, `Foto de ${ctx.storeName}`, 'skb-story__img', 'photo', 'photo')}</div>` : ''}
  </section>`;
  },
```
   - **newsletter:** build `parts` with `title` (`data-skb-el="title"`), `note` (`data-skb-el="note"`, only when `b.note`) and `form` (the existing `skb-subscribe-wrap` div with `data-skb-el="form"` added); `copy = kicker(b.kicker) + ordered(parts, b.order, SKETCH_COPY_ORDER.newsletter)`; keep `<p role="status" className="skb-subscribe__status" />` after the copy wrapper, still inside the section. Split variant: `<div className="skb-newsletter__copy" ${group(b, 'copy')}>${copy}</div>` and `<div className="skb-newsletter__media" ${group(b, 'media')}>${img(b.photo, …, 'skb-newsletter__img', 'photo', 'photo')}</div>`. Center variant: `<div className="skb-newsletter__stack" ${group(b, 'copy')}>${copy}</div>`.
   - **banner:**
```ts
  banner: (b, s, _ctx, options) => {
    const heading = options.h1 ? 'h1' : 'h2';
    const parts: Record<string, string> = {
      headline: `<${heading} className="skb-display skb-banner__headline" data-skb-el="headline" ${editable('headline')}>${expr(b.headline)}</${heading}>`,
      cta: `<a className="skb-btn" href=${expr(b.href)} data-skb-el="cta" ${editable('cta')}>${expr(b.cta)}</a>`,
    };
    return open(b, s) + `
    <div className="skb-banner__copy" ${group(b, 'copy')}>
      ${kicker(b.kicker)}
      ${ordered(parts, b.order, SKETCH_COPY_ORDER.banner)}
    </div>
    ${sticker(b.sticker, b.stickerPos)}
  </section>`;
  },
```
   - **steps:** `${head(b, b.note, …)}`; grid `<div className="skb-steps__grid" ${group(b, 'items')}>`; each `<article className="skb-step" ${node(String(i))}>`.
   - **collections:** grid `${group(b, 'items')}`; each `<a className="skb-collection" ${node(String(i))} href=…>`.
   - **catalog:** head div `<div className="skb-head" id="skb-catalogo" ${group(b, 'head')}>`; kicker via `kicker(b.kicker)`; title gets `${node('title')}`; seeAll gets `${node('seeAll')}`; list `<div className="skb-list" data-pagosya-catalog ${group(b, 'items')} />`.
   - **reviews:** head div `${group(b, 'head')}`; title `${node('title')}`; rating div `<div className="skb-rating" ${node('rating')}>`; grid `${group(b, 'items')}`; each `<figure className="skb-review" ${node(String(i))}>`.
   - **faq:** `${head(b, undefined, options.h1 ? 'h1' : 'h2')}` then `<div className="skb-faq__list" ${group(b, 'items')}>${b.items.map((item, i) => `<details className="skb-faq__item" ${node(String(i))}>…`).join('')}</div>`.
   - **gallery:** `${head(b, undefined, …)}`; grid `${group(b, 'items')}`; images `img(p, …, 'skb-gallery__img', `photos.${i}`, String(i))`.
   - **announce:** `<div className="skb-announce__row" ${group(b, 'row')}><span ${node('left')} ${editable('left')}>…</span><span ${node('right')} ${editable('right')}>…</span></div>`.
   - **renderAccount:** `<div className="skb-acct__copy" data-skb-group="intro">`; title `${node('title')}`; lead `${node('lead')}`; perks `<ul className="skb-acct__perks" data-skb-group="perks">` and each `<li ${node(String(i))}>`. (No layout attributes: `account.layout` is the page composition.)

- [ ] **Step 4: Add the layout CSS**

Append inside the template string of the base CSS that holds the `.skb[data-skb-align=…]` rules (the one ending with `@media (prefers-reduced-motion: reduce)`), and add `.skb-banner__copy, .skb-newsletter__stack` to the two `justify-items` align selectors:

```css
.skb-banner__copy { display: grid; gap: 1.6rem; justify-items: center; }
.skb-newsletter__stack { display: grid; gap: 1rem; justify-items: center; width: 100%; }
[data-skb-group][data-skb-gap="s"] { gap: 0.5rem; }
[data-skb-group][data-skb-gap="m"] { gap: 1.1rem; }
[data-skb-group][data-skb-gap="l"] { gap: 2rem; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"] { flex-direction: column; align-items: flex-start; }
.skb-boxes[data-skb-dir="column"] { grid-template-columns: 1fr; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="center"] { justify-content: center; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-galign="end"] { justify-content: flex-end; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"][data-skb-galign="center"] { align-items: center; }
:is(.skb-actions, .skb-pills, .skb-stats, .skb-announce__row)[data-skb-dir="column"][data-skb-galign="end"] { align-items: flex-end; }
.skb-boxes[data-skb-galign="center"] { margin-inline: auto; }
.skb-boxes[data-skb-galign="end"] { margin-left: auto; }
[data-skb-group][data-skb-valign="start"] { align-self: start; align-content: start; }
[data-skb-group][data-skb-valign="center"] { align-self: center; align-content: center; }
[data-skb-group][data-skb-valign="end"] { align-self: end; align-content: end; }
@media (max-width: 899px) { [data-skb-group][data-skb-valign] { align-self: auto; } }
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @pagosya/shared-types build && cd apps/api && npx jest src/storefront-source/sketch`
Expected: all PASS, including the golden compile and the 1280/390 screenshots with no page errors (allow ~2 min).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/sketch/sketch-blocks.ts apps/api/src/storefront-source/sketch/sketch-blocks.spec.ts apps/api/src/storefront-source/sketch/sketch-golden.spec.ts
git commit -m "feat(boceto): stamp group/node markers and group layout on every block"
```

---

### Task 4: Preview — paths, drill-down selection, overlay, live layout

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js`
- Test: `packages/storefront-preview/src/source-preview-boceto.test.ts`

**Interfaces:**
- Consumes: DOM contract from Task 3.
- Produces (messages, read by Task 6):
  - posts `{ type: 'pagosya:boceto-select', id: string, path: string }` (id `''` clears);
  - accepts inside `pagosya:boceto-apply`: `selection: { id: string; path: string; label: string; movable: boolean; movableChildren: string[] }` and `blocks[id].layout: Record<string, { gap?, dir?, align?, valign? }>`;
  - overlay elements `[data-boceto-box="selected"|"child"|"hover"]`.

- [ ] **Step 1: Write the failing tests**

In `source-preview-boceto.test.ts`, replace the `page` fixture with one that carries groups, and replace the first test; add new tests:

```ts
const page = `<!doctype html><html><body><main id="contenido">
  <section data-skb="h" id="skb-h"><div class="copy" data-skb-group="copy"><h1 data-skb-el="headline" data-skb-field="headline">Algo dulce</h1><p data-skb-el="sub" data-skb-field="sub">sub</p><div data-skb-el="actions" data-skb-group="actions"><a data-skb-node="cta" href="#">cta</a><a data-skb-node="cta2" href="#">cta2</a></div></div><div class="media" data-skb-group="media"><img data-skb-node="photo" data-skb-photo="photo" src="x.png"><p data-skb-el="sticker" data-skb-field="sticker">Fresco</p></div></section>
  <section data-skb="c" id="skb-c"><div data-skb-group="head"><h2 data-skb-node="title" data-skb-field="title">Productos</h2></div></section>
</main></body></html>`;

const clickOn = (w: any, selector: string) => w.document.querySelector(selector).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const selects = (posted: any[]) => posted.filter(message => message.type === 'pagosya:boceto-select').map(message => [message.id, message.path]);

it('stays inert until activated, then clicks drill down block → group → element', async () => {
  const { w, posted, send } = load();
  clickOn(w, '[data-skb-node="cta"]'); await tick();
  expect(posted).toHaveLength(0);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  for (let i = 0; i < 4; i++) { clickOn(w, '[data-skb-node="cta"]'); await tick(); }
  expect(selects(posted)).toEqual([['h', ''], ['h', 'copy'], ['h', 'copy/actions'], ['h', 'copy/actions/cta']]);
});

it('a click elsewhere in the same block selects the child of the common ancestor', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/actions/cta', label: 'Botón principal', movable: true, movableChildren: [] } }); await tick();
  clickOn(w, '[data-skb-el="sub"]'); await tick();
  clickOn(w, '[data-skb="c"] h2'); await tick();
  expect(selects(posted)).toEqual([['h', 'copy/sub'], ['c', '']]);
});

it('clicking block padding selects the block; Esc goes up, Enter goes into the first child', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  clickOn(w, '[data-skb="h"]'); await tick();
  const key = (k: string) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  key('Enter'); await tick();
  key('Escape'); await tick();
  key('Escape'); await tick();
  expect(selects(posted)).toEqual([['h', ''], ['h', 'copy'], ['h', ''], ['', '']]);
});

it('draws the selected box with its tag and dotted boxes for its children; nothing for a stale path', async () => {
  const { w, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: 'Columna de texto', movable: true, movableChildren: ['headline', 'sub', 'actions'] } }); await tick();
  const selected = w.document.querySelectorAll('[data-boceto-box="selected"]');
  expect(selected).toHaveLength(1);
  expect(selected[0].textContent).toBe('Columna de texto');
  expect(w.document.querySelectorAll('[data-boceto-box="child"]')).toHaveLength(3);
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/gone', label: 'x', movable: false, movableChildren: [] } }); await tick();
  expect(w.document.querySelectorAll('[data-boceto-box]')).toHaveLength(0);
});

it('live layout sets and clears group data attributes', async () => {
  const { w, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', blocks: { h: { layout: { actions: { dir: 'column', gap: 'l', align: 'center' }, copy: { valign: 'end', gap: 'zz' } } } } }); await tick();
  const actions = w.document.querySelector('[data-skb-group="actions"]');
  expect([actions.getAttribute('data-skb-dir'), actions.getAttribute('data-skb-gap'), actions.getAttribute('data-skb-galign')]).toEqual(['column', 'l', 'center']);
  const copy = w.document.querySelector('[data-skb-group="copy"]');
  expect([copy.getAttribute('data-skb-valign'), copy.hasAttribute('data-skb-gap')]).toEqual(['end', false]);
  send({ type: 'pagosya:boceto-apply', blocks: { h: { layout: {} } } }); await tick();
  expect(actions.hasAttribute('data-skb-dir')).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts`
Expected: FAIL — select messages have no `path`; no `[data-boceto-box]`.

- [ ] **Step 3: Implement**

In `source-preview-boceto-mode.js`:

1. Update the header comment's bullet for clicks to: `clicking drills down block → group → element (Figma) and posts pagosya:boceto-select { id, path }; Esc selects the parent, Enter the first child`.
2. Add state next to the existing `var` line:
```js
  var selection = { id: '', path: '', label: '', movable: false, movableChildren: [] }, boxes = [], hoverBox = null;
```
3. Add the path helpers after `sectionOf`:
```js
  function selectable(node) { return !!(node && node.nodeType === 1 && (node.hasAttribute('data-skb-group') || node.hasAttribute('data-skb-node') || node.hasAttribute('data-skb-el'))); }
  function segmentOf(node) { return node.getAttribute('data-skb-group') || node.getAttribute('data-skb-node') || node.getAttribute('data-skb-el'); }
  /** The nearest selectable ancestor, or the section itself. */
  function containerOf(node) { var p = node.parentElement; while (p && !selectable(p) && !p.hasAttribute('data-skb')) p = p.parentElement; return p; }
  function pathOf(node) { var parts = []; for (var n = node; n && !n.hasAttribute('data-skb'); n = n.parentElement) if (selectable(n)) parts.unshift(segmentOf(n)); return parts.join('/'); }
  function childrenOf(node) { return Array.prototype.slice.call(node.querySelectorAll('[data-skb-group],[data-skb-node],[data-skb-el]')).filter(function (child) { return containerOf(child) === node; }); }
  function nodeAt(section, path) {
    var node = section;
    if (!path) return node;
    var parts = path.split('/');
    for (var i = 0; i < parts.length && node; i++) node = childrenOf(node).filter(function (child) { return segmentOf(child) === parts[i]; })[0] || null;
    return node;
  }
  function sectionById(id) { return /^[a-z0-9-]{1,40}$/.test(id) ? document.querySelector('[data-skb="' + id + '"]') : null; }
  /** Figma drill-down: the next deeper node toward the target, or the child of the deepest common ancestor. */
  function nextSelection(target) {
    var section = sectionOf(target);
    if (!section) return null;
    var id = section.getAttribute('data-skb');
    var chain = [];
    for (var n = target; n && n !== section; n = n.parentElement) if (selectable(n)) chain.unshift(n);
    var paths = [''].concat(chain.map(pathOf));
    if (selection.id !== id) return { id: id, path: '' };
    var k = 0;
    for (var i = 1; i < paths.length; i++) if (selection.path === paths[i] || selection.path.indexOf(paths[i] + '/') === 0) k = i;
    return { id: id, path: paths[Math.min(k + 1, paths.length - 1)] };
  }
  function select(id, path) {
    selection = { id: id, path: path, label: '', movable: false, movableChildren: [] };
    drawOverlay();
    parent.postMessage({ type: 'pagosya:boceto-select', id: id, path: path }, '*');
  }
```
4. Add the overlay after `select`:
```js
  function clearBoxes() { boxes.splice(0).forEach(function (box) { box.remove(); }); }
  function makeBox(node, kind, label) {
    var rect = node.getBoundingClientRect();
    var box = document.createElement('div');
    box.setAttribute('data-boceto-box', kind);
    box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;box-sizing:border-box;left:' + rect.left + 'px;top:' + rect.top + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px;border:' +
      (kind === 'selected' ? '2px solid #1f6feb' : kind === 'hover' ? '1px solid #1f6feb' : '1px dashed rgba(31,111,235,.75)');
    if (label) {
      var tag = document.createElement('span');
      tag.textContent = label;
      tag.style.cssText = 'position:absolute;left:-2px;top:-21px;font:600 11px/1 system-ui;padding:4px 7px;border-radius:4px;background:#1f6feb;color:#fff;white-space:nowrap';
      box.append(tag);
    }
    document.body.append(box);
    return box;
  }
  function drawOverlay() {
    clearBoxes();
    if (!on || !selection.id || dragging || elDragging) return;
    var section = sectionById(selection.id);
    var node = section && nodeAt(section, selection.path);
    if (!node) return;
    boxes.push(makeBox(node, 'selected', selection.label));
    childrenOf(node).forEach(function (child) { boxes.push(makeBox(child, 'child')); });
  }
  function placeHoverBox(target) {
    if (hoverBox) { hoverBox.remove(); hoverBox = null; }
    if (!on || !target || dragging || elDragging || editing) return;
    var next = nextSelection(target);
    var node = next && nodeAt(sectionById(next.id), next.path);
    if (!node || (next.id === selection.id && next.path === selection.path)) return;
    hoverBox = makeBox(node, 'hover');
  }
```
5. In `ensure()`, change the injected style's first rule from the outline to nothing visible (keep the attribute for the handle): replace `'[data-boceto-hover]{outline:2px solid #1f6feb!important;outline-offset:-2px!important}' +` with `'' +`.
6. In the `pointerover` listener, after `setHovered(sectionOf(event.target));` add `placeHoverBox(event.target);`.
7. Replace the body of the `click` listener after `if (!section) return;` with:
```js
    event.preventDefault(); event.stopImmediatePropagation();
    var next = nextSelection(event.target);
    if (next) select(next.id, next.path);
```
8. Add a second keydown listener after the existing one:
```js
  document.addEventListener('keydown', function (event) {
    if (!on || editing || !selection.id) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!selection.path) select('', '');
      else select(selection.id, selection.path.split('/').slice(0, -1).join('/'));
    } else if (event.key === 'Enter') {
      var section = sectionById(selection.id), node = section && nodeAt(section, selection.path);
      var kids = node ? childrenOf(node) : [];
      if (kids.length) { event.preventDefault(); select(selection.id, pathOf(kids[0])); }
    }
  }, true);
```
9. In the `pagosya:boceto-apply` handler, before `var blocks = event.data.blocks || {};` add:
```js
      var sel = event.data.selection;
      if (sel && typeof sel === 'object' && typeof sel.id === 'string' && typeof sel.path === 'string' && sel.path.length <= 120) {
        selection = { id: sel.id, path: sel.path, label: typeof sel.label === 'string' ? sel.label.slice(0, 60) : '', movable: sel.movable === true,
          movableChildren: Array.isArray(sel.movableChildren) ? sel.movableChildren.filter(function (key) { return typeof key === 'string' && key.length <= 20; }) : [] };
      }
```
   inside the per-block loop (after the `cardAdd` line) add:
```js
        if (spec.layout && typeof spec.layout === 'object') {
          var setOrClear = function (node, name, value, pattern) { if (typeof value === 'string' && pattern.test(value)) node.setAttribute(name, value); else node.removeAttribute(name); };
          Array.prototype.slice.call(section.querySelectorAll('[data-skb-group]')).forEach(function (groupNode) {
            if (sectionOf(groupNode) !== section) return;
            var entry = spec.layout[groupNode.getAttribute('data-skb-group')] || {};
            setOrClear(groupNode, 'data-skb-gap', entry.gap, /^(s|m|l)$/);
            setOrClear(groupNode, 'data-skb-dir', entry.dir, /^(row|column)$/);
            setOrClear(groupNode, 'data-skb-galign', entry.align, /^(start|center|end)$/);
            setOrClear(groupNode, 'data-skb-valign', entry.valign, /^(start|center|end)$/);
          });
        }
```
   and replace the handler's final `return;` with `drawOverlay(); return;`.
10. In the `scroll` listener add `drawOverlay();`. In the mode handler's `if (!on) { … }` branch add `clearBoxes(); placeHoverBox(null);`, and after `if (on) ensure();` add `drawOverlay();`. Add `window.addEventListener('resize', drawOverlay);` next to the scroll listener.

- [ ] **Step 4: Run tests**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts`
Expected: the five new tests PASS. The old "dragging a copy element…" test now FAILS (rewritten in Task 5) — leave it for Task 5; all other existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
git commit -m "feat(boceto): Figma-style drill-down selection, overlay boxes and live group layout in the canvas"
```

---

### Task 5: Preview — moving selected nodes and forwarding keys

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js` (`startButtonDrag`, `startElementDrag`, the `pointerdown` arm, keydown)
- Test: `packages/storefront-preview/src/source-preview-boceto.test.ts`

**Interfaces:**
- Consumes: `selection`, `select`, `nodeAt`, `childrenOf`, `containerOf`, `pathOf`, `segmentOf`, `drawOverlay`, `clearBoxes` (Task 4).
- Produces (read by Task 6): posts `{ type: 'pagosya:boceto-node-move', id: string, path: string, order: string[] }` (path = moved node's path *before* the move; order = sibling keys in the new DOM order, stickers excluded) and `{ type: 'pagosya:boceto-key', key: 'up' | 'down' | 'delete' }`. The messages `pagosya:boceto-el-reorder` and `pagosya:boceto-swap` are no longer posted.

- [ ] **Step 1: Write the failing tests**

Replace the old "dragging a copy element reorders it…" test with:

```ts
const pointer = (w: any, type: string, target: any, x: number, y: number) =>
  target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));

it('dragging a movable child of the selection reorders it and posts node-move with the new sibling order', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: 'Columna de texto', movable: false, movableChildren: ['headline', 'sub', 'actions'] } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40); await tick();
  pointer(w, 'pointermove', w.document, 10, 60);
  pointer(w, 'pointerup', w.document, 10, 60); await tick();
  const move = posted.find(message => message.type === 'pagosya:boceto-node-move');
  expect(move).toEqual({ type: 'pagosya:boceto-node-move', id: 'h', path: 'copy/headline', order: ['sub', 'actions', 'headline'] });
  expect(posted.some(message => message.type === 'pagosya:boceto-el-reorder')).toBe(false);
});

it('a child that is not movable drags the whole section instead', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy', label: '', movable: false, movableChildren: [] } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 10, 10);
  pointer(w, 'pointermove', w.document, 10, 40);
  pointer(w, 'pointerup', w.document, 10, 900); await tick();
  expect(posted.some(message => message.type === 'pagosya:boceto-node-move')).toBe(false);
});

it('forwards ⌥↑ / ⌥↓ / Supr to the Studio, but never while editing text', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '', movable: true, movableChildren: [] } }); await tick();
  const key = (k: string, alt = false) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, altKey: alt, bubbles: true, cancelable: true }));
  key('ArrowUp', true); key('ArrowDown', true); key('Delete'); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key').map(m => m.key)).toEqual(['up', 'down', 'delete']);
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  key('Backspace'); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key')).toHaveLength(3);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts`
Expected: FAIL — no `pagosya:boceto-node-move`, no `pagosya:boceto-key`.

- [ ] **Step 3: Implement**

1. Delete `startButtonDrag` and `startElementDrag` entirely; update the header comment bullets: replace the `el-reorder` bullet with `dragging the selected node (or a movable child of it) reorders it among its siblings and posts pagosya:boceto-node-move { id, path, order }`; add `⌥↑/⌥↓/Supr are forwarded as pagosya:boceto-key`.
2. Add `startNodeDrag` and `dragCandidate` where `startElementDrag` was:
```js
  /** The node a drag should move: the selection itself when movable, or a movable child of it under the pointer. */
  function dragCandidate(target) {
    var section = sectionOf(target);
    if (!section || selection.id !== section.getAttribute('data-skb')) return null;
    var node = nodeAt(section, selection.path);
    if (!node) return null;
    if (selection.path && selection.movable && node.contains(target)) return node;
    return childrenOf(node).filter(function (child) { return child.contains(target) && selection.movableChildren.indexOf(segmentOf(child)) !== -1; })[0] || null;
  }
  /** Reorder a node among its siblings (Figma auto layout): rows move along x, columns along y. */
  function startNodeDrag(node) {
    var section = sectionOf(node), container = containerOf(node);
    if (!section || !container) return;
    var fromPath = pathOf(node);
    elDragging = node;
    node.setAttribute('data-boceto-dragging', '');
    clearBoxes();
    var style = window.getComputedStyle(container);
    var horizontal = container === section ? window.innerWidth >= 900 : (String(style.display).indexOf('flex') !== -1 && String(style.flexDirection).indexOf('column') === -1);
    var siblings = function () { return childrenOf(container).filter(function (child) { return child !== node && segmentOf(child) !== 'sticker'; }); };
    var target = null;
    var move = function (ev) {
      target = null;
      var list = siblings();
      for (var i = 0; i < list.length; i++) {
        var rect = list[i].getBoundingClientRect();
        var before = horizontal ? ev.clientX < rect.left + rect.width / 2 : ev.clientY < rect.top + rect.height / 2;
        if (before) { target = { node: list[i], before: true }; break; }
        target = { node: list[i], before: false };
      }
      if (!target) { indicator.style.display = 'none'; return; }
      var box = target.node.getBoundingClientRect();
      indicator.style.display = 'block';
      indicator.style.right = 'auto';
      if (horizontal) { indicator.style.top = box.top + 'px'; indicator.style.height = box.height + 'px'; indicator.style.width = '4px'; indicator.style.left = (target.before ? box.left : box.right) - 2 + 'px'; }
      else { indicator.style.left = box.left + 'px'; indicator.style.width = box.width + 'px'; indicator.style.height = '4px'; indicator.style.top = (target.before ? box.top : box.bottom) - 2 + 'px'; }
    };
    var finish = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      indicator.style.display = 'none';
      indicator.style.left = '12px'; indicator.style.right = '12px'; indicator.style.width = 'auto'; indicator.style.height = '4px';
      node.removeAttribute('data-boceto-dragging');
      elDragging = null;
      if (target) {
        if (target.before) target.node.before(node); else target.node.after(node);
        var order = childrenOf(container).map(segmentOf).filter(function (key) { return key !== 'sticker'; });
        parent.postMessage({ type: 'pagosya:boceto-node-move', id: section.getAttribute('data-skb'), path: fromPath, order: order }, '*');
      }
      drawOverlay();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
  }
```
3. In the `pointerdown` listener: delete the `element` and `rowButton` variables and replace the body of `arm` after `placePhotoChip(null);` with:
```js
      var sticker = event.target instanceof Element ? event.target.closest('[data-skb-el="sticker"]') : null;
      if (sticker && sectionOf(sticker) === section) { startStickerDrag(sticker, ev); return; }
      var drag = dragCandidate(event.target);
      if (drag) {
        if (pathOf(drag) !== selection.path) select(section.getAttribute('data-skb'), pathOf(drag));
        startNodeDrag(drag);
        return;
      }
      hovered = section;
      startDrag(ev);
```
4. In the keydown listener added in Task 4, before the `Escape` branch add:
```js
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: event.key === 'ArrowUp' ? 'up' : 'down' }, '*'); return; }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.metaKey && !event.ctrlKey) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: 'delete' }, '*'); return; }
```
   (The listener already returns early while `editing`, which keeps Backspace inside text editing.)

- [ ] **Step 4: Run tests**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
git commit -m "feat(boceto): drag selected groups and elements among siblings, forward move/delete keys"
```

---

### Task 6: Studio — path selection, sync, moves and keyboard

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (state at 98, `ApplyPayload` at 13, keydown at 526–544, returned API at 546–618, `EL_ORDER` at 34–38)
- Modify: `apps/merchant-studio/src/source-studio.ts:189` and `:208-216`, frame `load` at `:239`
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `sketchNodeTree`, `sketchFindNode`, `sketchCanMove`, `sketchApplyMove`, `sketchRemoveNode` (Task 1); preview messages from Tasks 4–5.
- Produces: panel methods `remoteSelect(id: string, path?: string)`, `remoteNodeMove(id: string, path: string, order: string[])`, `remoteKey(key: 'up' | 'down' | 'delete')`, `resync()`; `ApplyPayload.selection`; internal `selectedPath`, `selectedBlock()`, `focusNode(id, path)`, `moveSelection(delta)`, `removeSelection()`. Removed: `remoteElReorder`, `remoteSwap`.

- [ ] **Step 1: Write the failing tests**

Append to `source-boceto.test.ts` (the fixture hero has `cta: 'Ver'` and no `cta2`; tests add what they need):

```ts
const lastSelection = () => [...applied].reverse().find(payload => payload.selection)?.selection;

it('canvas selection paths are mirrored back to the preview with label and movable flags', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy');
  expect(lastSelection()).toEqual({ id: 'intro', path: 'copy', label: 'Columna de texto', movable: false, movableChildren: ['headline', 'sub', 'actions'] });
  panel.remoteSelect('intro', 'copy/missing');
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy' });
  panel.remoteSelect('nope', 'copy');
  expect(lastSelection()).toMatchObject({ id: '', path: '' });
});

it('a node move from the canvas updates order live; ⌥↓ moves the selected element and reloads', async () => {
  const reload = vi.fn();
  const panel = createBocetoPanel(new MerchantStudioApi());
  panel.mount(host, { storeId: 's1', version: version(), locked: false, saved: vi.fn().mockResolvedValue(undefined), apply: payload => applied.push(payload), reload });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  panel.remoteNodeMove('intro', 'copy/headline', ['sub', 'headline', 'actions']);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].order).toEqual(['sub', 'headline', 'actions', 'badge', 'trust', 'note']);
  expect(reload).not.toHaveBeenCalled();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteKey('down');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].order).toEqual(['headline', 'sub', 'actions', 'badge', 'trust', 'note']);
  await vi.waitFor(() => expect(reload).toHaveBeenCalled());
});

it('Supr removes an optional element but never the headline; at block level it still deletes the block', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteKey('delete');
  panel.remoteSelect('intro', 'copy/headline');
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  const saved = putSketch.mock.calls.at(-1)![1].sketch.blocks[0];
  expect([saved.sub, saved.headline]).toEqual(['', 'Algo dulce']);
  panel.remoteSelect('cat', '');
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((b: any) => b.id)).toEqual(['intro', 'fin']);
});

it('refuses hostile node moves', async () => {
  const panel = await mount();
  panel.remoteNodeMove('intro', 'copy/headline', Array.from({ length: 50 }, (_, i) => `k${i}`));
  panel.remoteNodeMove('intro', 'copy', ['media', 'copy']);
  await vi.advanceTimersByTimeAsync(1300);
  const saved = putSketch.mock.calls.at(-1)?.[1].sketch.blocks[0];
  expect(saved?.order).toBeUndefined();
  expect(saved?.flip).toBeUndefined();
});
```

(The fixture hero has no photo, so `copy` cannot flip — `remoteNodeMove('intro', 'copy', …)` must be refused.)

Because every `draw()` now also sends a selection-only payload through `apply`, existing tests that read `applied.at(-1)` (lines ~57, 98, 116, 126, 152, 189–190) must read the last *look* payload instead. Add near the top of the file:

```ts
const lastLook = () => [...applied].reverse().find(payload => payload.vars || payload.blocks || payload.style);
```

and replace each `applied.at(-1)` with `lastLook()` (keep `applied.length` checks as they are).

Update the existing test "element drags from the canvas persist order and sticker position, defaults stay clean": replace each `panel.remoteElReorder(id, order)` call with `panel.remoteNodeMove(id, 'copy/<a key present in order>', order)` (same expected `order` values). Plain `remoteSelect(id)` calls in older tests keep working because `path` defaults to `''`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: FAIL — `remoteNodeMove`, `remoteKey` are not functions; no `selection` in applied payloads.

- [ ] **Step 3: Implement in `source-boceto.ts`**

1. Imports: add
```ts
import { sketchApplyMove, sketchCanMove, sketchFindNode, sketchNodeTree, sketchRemoveNode } from '@pagosya/shared-types';
```
   and delete the `EL_ORDER` constant (lines 34–38) and its comment.
2. Types: add to `ApplyPayload`:
```ts
type SelectionPayload = { id: string; path: string; label: string; movable: boolean; movableChildren: string[] };
type ApplyPayload = { vars?: Record<string, string>; style?: Partial<SketchStyle>; blocks?: Record<string, BlockApply>; selection?: SelectionPayload };
```
   and add `layout?: Record<string, Record<string, string>>` to `BlockApply`.
3. State (line 98): `let selected = '', selectedPath = '', timer: …` and below it `const expanded = new Set<string>();`.
4. In `applyLive`, add `...(block.type === 'account' ? {} : { layout: block.layout || {} })` to each `blocks[block.id]` entry.
5. Add after `applyLive`:
```ts
  const selectedBlock = (): any => (selected ? allBlocks().find(block => block.id === selected) : undefined);
  function selectionPayload(): SelectionPayload {
    const block = selectedBlock();
    if (!block) return { id: '', path: '', label: '', movable: false, movableChildren: [] };
    const tree = sketchNodeTree(block);
    const node = selectedPath ? sketchFindNode(tree, selectedPath) : undefined;
    const children = node ? node.children : selectedPath ? [] : tree;
    return { id: block.id, path: node ? selectedPath : '', label: node?.label ?? (TYPE_LABEL[block.type] || block.type),
      movable: node ? sketchCanMove(block, selectedPath) : false, movableChildren: children.filter(child => sketchCanMove(block, child.path)).map(child => child.key) };
  }
  const syncSelection = () => { try { opts?.apply?.({ selection: selectionPayload() }); } catch { /* frame gone */ } };
  /** Point the selection at a path inside a block, falling back to the nearest node that still exists. */
  function focusNode(id: string, path: string) {
    const block = allBlocks().find(item => item.id === id);
    if (!block) { selected = ''; selectedPath = ''; return; }
    const tree = sketchNodeTree(block);
    let next = path;
    while (next && !sketchFindNode(tree, next)) next = next.split('/').slice(0, -1).join('/');
    selected = id; selectedPath = next; expanded.add(id);
  }
  function moveSelection(delta: -1 | 1) {
    if (!sketch || !selected) return;
    if (!selectedPath) {
      const index = sketch.blocks.findIndex(block => block.id === selected);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= sketch.blocks.length) return;
      sketch.blocks.splice(target, 0, sketch.blocks.splice(index, 1)[0]);
      scheduleStructural(); draw(); return;
    }
    const block = selectedBlock();
    if (!block || !sketchCanMove(block, selectedPath)) return;
    const parts = selectedPath.split('/'); const key = parts.pop()!; const parentPath = parts.join('/');
    const tree = sketchNodeTree(block);
    const siblings = (parentPath ? sketchFindNode(tree, parentPath)?.children ?? [] : tree).filter(node => sketchCanMove(block, node.path)).map(node => node.key);
    const index = siblings.indexOf(key), target = index + delta;
    if (index === -1 || target < 0 || target >= siblings.length) return;
    const order = [...siblings]; order.splice(target, 0, order.splice(index, 1)[0]);
    if (!sketchApplyMove(block, parentPath, order)) return;
    if (/^\d+$/.test(key)) selectedPath = [...parts, String(target)].join('/');
    scheduleStructural(); draw();
  }
  function removeSelection() {
    if (!selected) return;
    if (!selectedPath) { deleteBlock(selected); return; }
    const block = selectedBlock();
    if (!block || !sketchRemoveNode(block, selectedPath)) return;
    focusNode(selected, selectedPath.split('/').slice(0, -1).join('/'));
    scheduleStructural(); draw();
  }
```
6. In `deleteBlock`, replace `if (selected === id) { selected = ''; picker = null; }` with `if (selected === id) { selected = ''; selectedPath = ''; picker = null; }`.
7. At the end of `draw()` (after `host.replaceChildren(wrap);`) add `syncSelection();`.
8. Replace the keydown listener (lines 526–544) with:
```ts
  // ⌥↑ / ⌥↓ move the selection (block or node); Supr/Backspace removes it (Figma-style), unless typing.
  document.addEventListener('keydown', event => {
    if (!sketch || !selected || !opts || opts.locked || !host?.isConnected) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.metaKey && !event.ctrlKey) { event.preventDefault(); removeSelection(); return; }
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveSelection(event.key === 'ArrowUp' ? -1 : 1);
  });
```
9. In the returned object: delete `remoteSwap` and `remoteElReorder`; replace `remoteSelect` and add the new methods:
```ts
    remoteSelect(id: string, path = '') {
      if (!sketch) return;
      const before = `${selected}|${selectedPath}`;
      focusNode(id, path);
      if (`${selected}|${selectedPath}` !== before) picker = null;
      draw();
      if (!/^[a-z0-9-]{1,40}$/.test(selected)) return;
      host?.querySelector(`[data-boceto-block="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' });
    },
    /** A node dragged among its siblings on the canvas; `order` is the siblings' keys as the canvas now shows them. */
    remoteNodeMove(id: string, path: string, order: string[]) {
      if (!sketch || opts?.locked || !path || order.length > 12) return;
      const block = allBlocks().find(item => item.id === id);
      if (!block || !sketchCanMove(block, path)) return;
      const parts = path.split('/'); const key = parts.pop()!;
      const result = sketchApplyMove(block, parts.join('/'), order);
      if (!result) return;
      focusNode(id, /^\d+$/.test(key) ? [...parts, String(order.indexOf(key))].join('/') : path);
      if (result === 'reload') scheduleStructural(); else schedule();
      draw();
    },
    remoteKey(key: 'up' | 'down' | 'delete') {
      if (!sketch || !selected || opts?.locked) return;
      if (key === 'delete') removeSelection(); else moveSelection(key === 'up' ? -1 : 1);
    },
    /** After the preview reloads: push the live look and the selection again. */
    resync() { applyLive(); syncSelection(); },
```

- [ ] **Step 4: Route the messages in `source-studio.ts`**

Replace line 209 (`boceto-select`) with:
```ts
      if (event.data.type === 'pagosya:boceto-select' && typeof event.data.id === 'string' && event.data.id.length <= 40) bocetoPanel.remoteSelect(event.data.id, typeof event.data.path === 'string' && /^([a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4})?$/.test(event.data.path) ? event.data.path : '');
```
Delete the `pagosya:boceto-el-reorder` and `pagosya:boceto-swap` lines and add:
```ts
      if (event.data.type === 'pagosya:boceto-node-move' && typeof event.data.id === 'string' && typeof event.data.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(event.data.path) && Array.isArray(event.data.order) && event.data.order.length <= 12 && event.data.order.every((key: unknown) => typeof key === 'string' && /^[a-zA-Z0-9]{1,20}$/.test(key))) bocetoPanel.remoteNodeMove(event.data.id, event.data.path, event.data.order);
      if (event.data.type === 'pagosya:boceto-key' && ['up', 'down', 'delete'].includes(event.data.key)) bocetoPanel.remoteKey(event.data.key);
```
On line 189 (`boceto-ready`) change the body to `{ syncBocetoMode(previewFrame as HTMLIFrameElement); bocetoPanel.resync(); return; }`, and in the frame `load` listener on line 239 add `bocetoPanel.resync();` after `syncBocetoMode(frame);`.

- [ ] **Step 5: Run tests and types**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts
git commit -m "feat(boceto): Studio selects paths inside blocks, mirrors them to the canvas, moves and removes nodes"
```

---

### Task 7: Studio — inspector per group kind and leaf

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`blockProps` at 224–273, the selected-block branch of `draw()` at 489–497)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `selectedPath`, `removeSelection` (Task 6); `sketchGroup`, `sketchCanRemove`, `sketchCanMove`, `sketchFindNode`, `sketchNodeTree`, `SKETCH_TWO_COLUMN` (Task 1).
- Produces: `nodeProps(block, path): HTMLElement`; inspector rows labelled `Espacio`, `Dirección`, `Alineación`, `Vertical`; `data-boceto-remove-node` button.

- [ ] **Step 1: Write the failing tests**

```ts
const clickSegment = (rowLabel: string, option: string) => {
  const row = [...host.querySelectorAll('.bct-row')].find(node => node.querySelector('.bct-row__label')?.textContent === rowLabel)!;
  ([...row.querySelectorAll('.bct-segment__option')].find(node => node.textContent === option) as HTMLElement).click();
};

it('a selected row group shows direction, spacing and alignment, applied live and saved as layout', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: { ...sketch(), blocks: [{ ...sketch().blocks[0], cta2: 'Caja' }, ...sketch().blocks.slice(1)] }, photos: [], fonts: [] } as any);
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/actions');
  expect(host.querySelector('.bct-props .bct-section__title')?.textContent).toBe('Botones');
  clickSegment('Dirección', 'Vertical');
  clickSegment('Espacio', 'L');
  clickSegment('Alineación', 'Centro');
  const live = [...applied].reverse().find(payload => payload.blocks)!.blocks.intro.layout;
  expect(live).toEqual({ actions: { dir: 'column', gap: 'l', align: 'center' } });
  clickSegment('Espacio', 'Auto');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].layout).toEqual({ actions: { dir: 'column', align: 'center' } });
});

it('alignment lives on the copy column now; a leaf shows its name and a remove button when optional', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', '');
  expect([...host.querySelectorAll('.bct-row__label')].map(node => node.textContent)).not.toContain('Alineación');
  panel.remoteSelect('intro', 'copy');
  clickSegment('Alineación', 'Centro');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].align).toBe('center');
  panel.remoteSelect('intro', 'copy/sub');
  expect(host.querySelector('.bct-props .bct-section__title')?.textContent).toBe('Bajada');
  (host.querySelector('[data-boceto-remove-node]') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].sub).toBe('');
  panel.remoteSelect('intro', 'copy/headline');
  expect(host.querySelector('[data-boceto-remove-node]')).toBeNull();
});

it('the back button climbs one level at a time', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  (host.querySelector('.bct-back') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ path: 'copy' });
  (host.querySelector('.bct-back') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ path: '' });
});
```

Update the existing "symmetry: alignment right and photo on the left apply live" test: before clicking the alignment option, call `panel.remoteSelect('intro', 'copy')` (alignment moved to the copy column); the photo-side assertion stays on the block level.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts`
Expected: FAIL — no "Dirección" row; title is the block type.

- [ ] **Step 3: Implement**

1. Extend the shared import with `sketchCanRemove, sketchGroup, SKETCH_TWO_COLUMN`.
2. In `blockProps`, replace the `ALIGNABLE` alignment line with the footer-only version (footer has no groups):
```ts
    if (block.type === 'footer') children.push(row('Alineación', segment(block.align === 'center' || block.align === 'end' ? block.align : 'start', ['start', 'center', 'end'], ['Izq.', 'Centro', 'Der.'], next => { if (next === 'start') delete block.align; else block.align = next; schedule(); draw(); })));
```
   and change the block hint text to `'Haz clic otra vez dentro del bloque para elegir una parte (columna, botones, foto…). Toca dos veces un texto para editarlo. Supr elimina lo seleccionado.'`. Delete the now-unused `ALIGNABLE` constant.
3. Add `nodeProps` after `blockProps`:
```ts
  /** Inspector for a group or element inside a block, Figma-style: the controls of what is selected. */
  function nodeProps(block: any, path: string) {
    const node = sketchFindNode(sketchNodeTree(block), path);
    const key = path.split('/').pop()!;
    const kind = /^\d+$/.test(key) ? undefined : sketchGroup(block.type, key)?.kind;
    const children: HTMLElement[] = [];
    const current = (field: string): string => block.layout?.[key]?.[field] ?? '';
    const setLayout = (field: string, value: string) => {
      const all = { ...(block.layout || {}) }; const entry = { ...(all[key] || {}) };
      if (value) entry[field] = value; else delete entry[field];
      if (Object.keys(entry).length) all[key] = entry; else delete all[key];
      if (Object.keys(all).length) block.layout = all; else delete block.layout;
      schedule(); draw();
    };
    const gapRow = () => row('Espacio', segment(current('gap'), ['', 's', 'm', 'l'], ['Auto', 'S', 'M', 'L'], next => setLayout('gap', next)));
    const blockAlign = (values: string[], names: string[]) => row('Alineación', segment(block.align === 'center' || block.align === 'end' ? block.align : 'start', values, names, next => { if (next === 'start') delete block.align; else block.align = next; schedule(); draw(); }));
    const layoutAllowed = block.type !== 'account';
    if (kind === 'column') {
      if (key === 'copy') children.push(blockAlign(['start', 'center', 'end'], ['Izq.', 'Centro', 'Der.']));
      if (layoutAllowed) children.push(gapRow());
      if (layoutAllowed && key === 'copy' && SKETCH_TWO_COLUMN.includes(block.type)) children.push(row('Vertical', segment(current('valign'), ['', 'start', 'center', 'end'], ['Auto', 'Arriba', 'Centro', 'Abajo'], next => setLayout('valign', next))));
    } else if (kind === 'row' && layoutAllowed) {
      children.push(row('Dirección', segment(current('dir'), ['', 'column'], ['Horizontal', 'Vertical'], next => setLayout('dir', next))));
      children.push(gapRow());
      children.push(row('Alineación', segment(current('align'), ['', 'center', 'end'], ['Inicio', 'Centro', 'Final'], next => setLayout('align', next))));
    } else if (kind === 'head') {
      children.push(blockAlign(['start', 'center'], ['Izq.', 'Centro']));
    } else if (kind === 'items' && layoutAllowed) {
      children.push(gapRow());
    } else if (kind === 'media') {
      children.push(row('Foto al lado', segment(block.flip ? 'left' : 'right', ['left', 'right'], ['Izquierdo', 'Derecho'], next => { if (next === 'left') block.flip = true; else delete block.flip; schedule(); draw(); })));
      children.push(row('Foto', photoButton(block, 'photo')));
    } else if (!kind) {
      children.push(el('p', { className: 'bct-hint', text: 'Toca dos veces este texto en el lienzo para editarlo.' }));
    }
    if (sketchCanRemove(block, path)) {
      const remove = el('button', { type: 'button', className: 'bct-remove', text: `Quitar ${String(node?.label ?? '').toLowerCase()}` });
      remove.dataset.bocetoRemoveNode = '';
      remove.addEventListener('click', () => removeSelection());
      children.push(remove);
    }
    if (sketchCanMove(block, path)) children.push(el('p', { className: 'bct-hint', text: 'Arrástralo en el lienzo o usa ⌥↑ / ⌥↓ para moverlo.' }));
    return section(node?.label ?? key, children);
  }
```
4. In `draw()`, rename the local `const selectedBlock = …` (line 489) to `const current = selectedBlock();` (and `openPicker` to use `current`), then replace the `else if (selectedBlock) { … }` branch with:
```ts
    } else if (current) {
      // Selection-driven, like Figma: the inspector shows what is selected on the canvas, one level up at a time.
      const upPath = selectedPath.split('/').slice(0, -1).join('/');
      const upNode = upPath ? sketchFindNode(sketchNodeTree(current), upPath) : undefined;
      const back = el('button', { type: 'button', className: 'bct-back', text: selectedPath ? `← ${upNode?.label ?? (TYPE_LABEL[current.type] || current.type)}` : '← Página' });
      back.addEventListener('click', () => { if (selectedPath) selectedPath = upPath; else selected = ''; picker = null; draw(); });
      root.append(el('div', { className: 'bct-props' }, [back, selectedPath ? nodeProps(current, selectedPath) : blockProps(current)]));
    } else {
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts
git commit -m "feat(boceto): Figma-style inspector for columns, rows, headers, grids, photos and elements"
```

---

### Task 8: Studio — Capas as a tree

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`draw()` layers part, lines 436–470)
- Modify: `apps/merchant-studio/src/source-boceto.css`
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `expanded`, `selected`, `selectedPath` (Task 6); `sketchNodeTree` (Task 1); type `SketchNode` from `@pagosya/shared-types`.
- Produces: DOM `[data-boceto-toggle="<blockId>"]`, `.bct-tree`, `[data-boceto-node="<path>"]` rows with `.is-selected`.

- [ ] **Step 1: Write the failing tests**

```ts
it('Capas is a tree: the arrow expands a block, a node row selects that path and highlights it', async () => {
  await mount();
  expect(host.querySelector('[data-boceto-block="intro"] .bct-tree')).toBeNull();
  (host.querySelector('[data-boceto-toggle="intro"]') as HTMLElement).click();
  const rows = [...host.querySelectorAll('[data-boceto-block="intro"] [data-boceto-node]')].map(node => node.getAttribute('data-boceto-node'));
  expect(rows).toEqual(['copy', 'copy/headline', 'copy/sub', 'copy/actions', 'copy/actions/cta']);
  (host.querySelector('[data-boceto-node="copy/actions"]') as HTMLElement).click();
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/actions' });
  expect(host.querySelector('[data-boceto-node="copy/actions"]')?.classList.contains('is-selected')).toBe(true);
  (host.querySelector('[data-boceto-toggle="intro"]') as HTMLElement).click();
  expect(host.querySelector('[data-boceto-block="intro"] .bct-tree')).toBeNull();
});

it('selecting on the canvas expands that block in Capas', async () => {
  const panel = await mount();
  panel.remoteSelect('cat', 'head');
  expect(host.querySelector('[data-boceto-block="cat"] [data-boceto-node="head"]')?.classList.contains('is-selected')).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts -t "Capas"`
Expected: FAIL — no `[data-boceto-toggle]`.

- [ ] **Step 3: Implement**

1. Add `type SketchNode` to the shared import.
2. Add before `draw()`:
```ts
  /** The block's parts as an indented, clickable list (Figma layers). */
  function nodeList(block: any, nodes: SketchNode[], depth: number): HTMLElement {
    const list = el('div', { className: 'bct-tree' });
    for (const node of nodes) {
      const item = el('button', { type: 'button', className: `bct-node${selected === block.id && selectedPath === node.path ? ' is-selected' : ''}`, text: node.label });
      item.style.paddingLeft = `${10 + depth * 14}px`;
      item.dataset.bocetoNode = node.path;
      item.addEventListener('click', event => { event.stopPropagation(); selected = block.id; selectedPath = node.path; picker = null; draw(); });
      list.append(item);
      if (node.children.length) list.append(nodeList(block, node.children, depth + 1));
    }
    return list;
  }
  function treeToggle(block: any) {
    const toggle = el('button', { type: 'button', className: 'bct-block__toggle', text: expanded.has(block.id) ? '▾' : '▸', title: 'Ver partes' });
    toggle.dataset.bocetoToggle = block.id;
    toggle.disabled = !sketchNodeTree(block).length;
    toggle.addEventListener('click', event => { event.stopPropagation(); if (expanded.has(block.id)) expanded.delete(block.id); else expanded.add(block.id); draw(); });
    return toggle;
  }
```
3. In the `sketch.blocks.forEach` loop: change the item class test to `selected === block.id && !selectedPath`; `head.prepend(treeToggle(block));` right after `const head = el('div', …)`; after `item.append(head);` add `if (expanded.has(block.id)) item.append(nodeList(block, sketchNodeTree(block), 1));`; change the item click handler to:
```ts
      item.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.bct-block__tools, .bct-tree, .bct-block__toggle')) return; const same = selected === block.id && !selectedPath; selected = same ? '' : block.id; selectedPath = ''; if (!same) expanded.add(block.id); picker = null; draw(); });
```
4. For the account entry: build its head as `el('div', { className: 'bct-block__head' }, [treeToggle(sketch.account), swatch, …])`, append `nodeList(sketch.account, sketchNodeTree(sketch.account), 1)` when `expanded.has('account')`, and use the same click handler shape with `'account'`.
5. Append to `source-boceto.css`:
```css
.bct-block__toggle { width: 18px; flex: none; border: 0; background: transparent; color: inherit; opacity: .7; cursor: pointer; font-size: 11px; padding: 0; }
.bct-block__toggle:disabled { visibility: hidden; }
.bct-tree { display: grid; margin: 4px 0 2px; }
.bct-node { display: block; width: 100%; text-align: left; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; font-size: 12px; padding-block: 5px; cursor: pointer; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bct-node:hover { background: rgba(31, 111, 235, .08); opacity: 1; }
.bct-node.is-selected { background: rgba(31, 111, 235, .16); color: #1f6feb; opacity: 1; font-weight: 600; }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.css apps/merchant-studio/src/source-boceto.test.ts
git commit -m "feat(boceto): Capas tree with expandable blocks and selectable parts"
```

---

### Task 9: Full verification in the real app

**Files:** none changed unless a check fails (fix in the owning task's files, with a test).

- [ ] **Step 1: Run every affected suite**

```bash
pnpm --filter @pagosya/shared-types build
cd apps/api && npx jest src/storefront-source && npx tsc --noEmit -p tsconfig.json && cd ../..
cd packages/storefront-preview && npx vitest run && cd ../..
cd apps/merchant-studio && npx vitest run src && npx tsc --noEmit -p tsconfig.json && cd ../..
```
Expected: all green. Report counts.

- [ ] **Step 2: Rebuild the embedded Studio**

Run: `cd apps/merchant-dashboard && pnpm run build:studio`
Expected: build succeeds. Confirm port 3001 belongs to the current dev watcher (`lsof -tiTCP:3001` start time newer than the last API commit); if not, tell the owner to restart `pnpm dev`.

- [ ] **Step 3: Browser check on the owner's Boceto (localhost:4323 → Diseñar sitio → Boceto)**

Walk through and screenshot each:
1. Click Portada → block outline; click again on a button → "Columna de texto" box with dotted children; click again → "Botones"; again → one button.
2. Esc twice climbs to the block, then clears.
3. With "Columna de texto" selected, drag the button row above the headline → order persists after the autosave reload.
4. Select the copy column, drag it onto the photo → photo switches sides.
5. Select "Botones" → Dirección Vertical, Espacio L, Alineación Centro apply instantly; resize the preview to phone width → rows wrap and columns stack.
6. Capas: expand a Panel doble, click "Etiquetas", select a pill, ⌥↓ moves it; Supr removes an optional element; the headline cannot be removed.
7. A chat edit to YAPI on the same store keeps the chosen layout.

- [ ] **Step 4: Report**

```bash
git status --short
```
Report which branch is checked out (`feature/store-page-architecture`), test counts, screenshots, and anything that failed.
