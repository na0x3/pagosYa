# Boceto selection box, group actions and right-click menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the Boceto board, dragging from empty space draws a selection box that can pick several parts or blocks; the
selection moves, deletes, restyles, copies, pastes and duplicates together; right-click opens the Studio's own menu.

**Architecture:** The canvas script (injected into the sandboxed preview) draws the box, the multi-selection outlines
and the group drag, and reports picks / context clicks / drops by `postMessage`. The Studio panel owns the selection
(`selected`/`selectedPath` as the primary plus `others`), the menu, the clipboard and every data change, so each group
action is one `schedule()` (one save, one Ctrl+Z step). New Studio logic lives in three small modules
(`boceto-selection.ts`, `boceto-menu.ts`, `boceto-clipboard.ts`) wired into `source-boceto.ts`.

**Tech Stack:** TypeScript (Studio, Vite, vitest + jsdom), plain ES5 JS for the injected canvas script (vitest + jsdom
via the checkout app's jsdom), Jest + Playwright Chromium for the real-browser layout test in `apps/api`.

**Spec:** `docs/superpowers/specs/2026-10-03-boceto-selection-and-context-menu-design.md`

## Global Constraints

- Paths from the canvas match `/^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/` (or `''` for a whole block); block ids
  match `/^[a-z0-9-]{1,40}$/`. At most 40 picks in a selection or message.
- Every group action calls `schedule()` / `scheduleStructural()` exactly once.
- While `opts.locked` (YAPI working): no data change; the menu enables only Copiar and Seleccionar bloque.
- The canvas script is ES5 (`var`, `function`), no build step; it never touches data, only DOM and `postMessage`.
- Merchant-facing copy is Spanish, as in the spec: Copiar, Pegar aquí, Duplicar, Eliminar, Subir, Bajar, Seleccionar
  bloque, Volver a su lugar, Giro, Insertar, Deshacer, Rehacer, "N elementos", "N no caben aquí",
  "N partes no se pueden eliminar".
- Free spots only exist ≥ 900px (`canFree` in the canvas already checks `window.innerWidth >= 900`).
- Never run `pnpm` in `/Users/saramia/pagosYaWeb`; never run prisma commands. Commit only the files a task names
  (`git add <new files>` then `git commit -- <paths>`); `apps/api/src/storefront-source/source-publishing.service*.ts`
  are the owner's uncommitted work and are never staged.
- `packages/shared-types` is consumed from `dist`; this plan does not change it.

## Review Focus

1. A box drawn over two paragraphs also fully covers their paragraphs group → must pick the two paragraphs, not the
   group (pinned in Task 3's canvas test and the real-browser test).
2. Group delete of two items of the same list (e.g. `items/0` and `items/2`) → both go, the right ones, free spots of
   the survivors stay on their items (pinned in Task 5).
3. Right-click on a part that is already in a multi-selection → keeps the whole selection (pinned in Task 4).
4. A group drag mixing parts still in their column → all move by the same distance, one save, one undo step (pinned in
   Task 7).
5. Paste when the target list or the extras are full, or a block paste on a 20-block page → nothing half-applied, the
   status says how many did not fit (pinned in Task 8 and Task 9).

---

### Task 0: Land the pending review fixes and Ctrl+Z

The working tree holds the five review fixes and the Ctrl+Z history (already tested). Later tasks edit the same files,
so commit them first.

- [ ] **Step 1: Two commits plus the docs**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts docs/superpowers/plans/2026-10-03-boceto-selection-and-context-menu.md
git commit -m "fix(boceto): refused drops snap back, list spots follow their item, marquee/footer show extras, real-browser canvas test" -- \
  apps/api/src/storefront-source/sketch/sketch-blocks.ts apps/api/src/storefront-source/sketch/sketch-free.ts \
  apps/api/src/storefront-source/sketch/sketch-schema.ts apps/api/src/storefront-source/sketch/sketch-schema.spec.ts \
  apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts packages/shared-types/src/sketch-structure.ts
git commit -m "feat(boceto): Ctrl/⌘+Z undo and redo; a refused drop and an emptied extra stay in place" -- \
  apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts \
  packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
git commit -m "docs(boceto): selection and context menu plan; spec details" -- \
  docs/superpowers/specs/2026-10-03-boceto-selection-and-context-menu-design.md docs/superpowers/plans/2026-10-03-boceto-selection-and-context-menu.md
git status --short   # only source-publishing.service*.ts, the screen recordings and fixit/ remain
```

---

## Stage 1 — selection model, selection box, right-click menu

### Task 1: Pure selection helpers

**Files:**
- Create: `apps/merchant-studio/src/boceto-selection.ts`
- Test: `apps/merchant-studio/src/boceto-selection.test.ts`

**Interfaces:**
- Produces: `type BocetoPick = { id: string; path: string }`, `PICK_MAX = 40`,
  `samePick(a, b): boolean`, `normalizePicks(picks: BocetoPick[]): BocetoPick[]`,
  `togglePick(picks: BocetoPick[], pick: BocetoPick): BocetoPick[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest';
import { normalizePicks, togglePick, PICK_MAX } from './boceto-selection';

it('later picks win: a pick drops earlier picks inside it and replaces an earlier pick around it', () => {
  expect(normalizePicks([{ id: 'h', path: 'copy/headline' }, { id: 'h', path: 'copy' }])).toEqual([{ id: 'h', path: 'copy' }]);
  expect(normalizePicks([{ id: 'h', path: '' }, { id: 'h', path: 'copy/sub' }])).toEqual([{ id: 'h', path: 'copy/sub' }]);
  expect(normalizePicks([{ id: 'h', path: 'copy/sub' }, { id: 's', path: '' }, { id: 'h', path: 'copy/sub' }])).toEqual([{ id: 's', path: '' }, { id: 'h', path: 'copy/sub' }]);
  // 'copy/subx' is not inside 'copy/sub'
  expect(normalizePicks([{ id: 'h', path: 'copy/sub' }, { id: 'h', path: 'copy/subx' }])).toHaveLength(2);
});

it('keeps at most 40, the latest', () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ id: `b${i}`, path: '' }));
  expect(normalizePicks(many)).toEqual(many.slice(-PICK_MAX));
});

it('toggle adds a pick or removes it when already picked', () => {
  const a = { id: 'h', path: 'copy/sub' }, b = { id: 'h', path: 'copy/headline' };
  expect(togglePick([a], b)).toEqual([a, b]);
  expect(togglePick([a, b], a)).toEqual([b]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd apps/merchant-studio && npx vitest run src/boceto-selection.test.ts`
Expected: FAIL — cannot resolve `./boceto-selection`.

- [ ] **Step 3: Implement**

```ts
/** A Boceto multi-selection: picks are a block (`path: ''`) or a part inside it. Shared by the panel, Capas and the menu. */
export type BocetoPick = { id: string; path: string };
export const PICK_MAX = 40;

export const samePick = (a: BocetoPick, b: BocetoPick) => a.id === b.id && a.path === b.path;
const inside = (inner: BocetoPick, outer: BocetoPick) => inner.id === outer.id && inner.path !== outer.path && (outer.path === '' || inner.path.startsWith(`${outer.path}/`));

/** Later picks win: a pick drops earlier picks inside it, replaces an earlier pick around it, and repeats move last. */
export function normalizePicks(picks: BocetoPick[]): BocetoPick[] {
  const out: BocetoPick[] = [];
  for (const pick of picks) {
    for (let i = out.length - 1; i >= 0; i--) if (samePick(out[i], pick) || inside(out[i], pick) || inside(pick, out[i])) out.splice(i, 1);
    out.push(pick);
  }
  return out.slice(-PICK_MAX);
}

export function togglePick(picks: BocetoPick[], pick: BocetoPick): BocetoPick[] {
  return picks.some(other => samePick(other, pick)) ? picks.filter(other => !samePick(other, pick)) : normalizePicks([...picks, pick]);
}
```

- [ ] **Step 4: Run it to see it pass** — same command, expected PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/boceto-selection.ts apps/merchant-studio/src/boceto-selection.test.ts
git commit -m "feat(boceto): multi-selection picks" -- apps/merchant-studio/src/boceto-selection.ts apps/merchant-studio/src/boceto-selection.test.ts
```

### Task 2: The Studio keeps a multi-selection (Capas, Shift+click, Esc, payload)

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (types at top; state near `let selected`; `selectionPayload`,
  `draw`, `nodeList`, `pickBlock`, keydown handler, returned API `remoteSelect`)
- Test: `apps/merchant-studio/src/source-boceto.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 `BocetoPick`, `normalizePicks`, `togglePick`.
- Produces (panel internals used by later tasks): `picks(): BocetoPick[]` (others first, primary last),
  `setPicks(list: BocetoPick[]): void`, `blockOf(id: string): any`, `isPicked(id, path): boolean`,
  `pickExists(pick): boolean`, `others: BocetoPick[]`, `groupProps(list)` (placeholder, filled in Task 6).
  Public API: `remoteSelect(id: string, path?: string, add?: boolean)`, `remoteSelectMany(items: BocetoPick[], add: boolean)`.
  `SelectionPayload` gains `others?: BocetoPick[]`.

- [ ] **Step 1: Write the failing tests** (append to `source-boceto.test.ts`)

```ts
it('multi: Shift+click on the canvas adds and removes picks; the canvas gets them all; a plain pick replaces them', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteSelect('intro', 'copy/headline', true);
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/headline', others: [{ id: 'intro', path: 'copy/sub' }] });
  expect(host.querySelector('.bct-section__title')?.textContent).toBe('2 elementos');
  panel.remoteSelect('intro', 'copy/sub', true);
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/headline', others: [] });
  panel.remoteSelect('intro', 'copy/sub', true);
  panel.remoteSelect('cat', '');
  expect(lastSelection()).toMatchObject({ id: 'cat', path: '', others: [] });
});

it('multi: a box pick selects many; with add it extends; Esc clears; Capas marks and Shift+clicks them', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'intro', path: '' }, { id: 'cat', path: '' }, { id: 'nope', path: '' }], false);
  expect(lastSelection()).toMatchObject({ id: 'cat', path: '', others: [{ id: 'intro', path: '' }] });
  expect(host.querySelectorAll('.bct-block.is-selected')).toHaveLength(2);
  (host.querySelector('[data-boceto-block="fin"]') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  expect(lastSelection().others).toHaveLength(2);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(lastSelection()).toMatchObject({ id: '', path: '' });
});

it('multi: picks whose part is gone drop out on the next draw', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'intro', path: 'copy/sub' }, { id: 'intro', path: 'copy/headline' }], false);
  panel.remoteText('intro', 'sub', '');
  expect(lastSelection().others ?? []).toEqual([]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd apps/merchant-studio && npx vitest run src/source-boceto.test.ts -t "multi:"`
Expected: FAIL — `others` undefined / `remoteSelectMany` is not a function.

- [ ] **Step 3: Implement** in `source-boceto.ts`

Imports and types:

```ts
import { normalizePicks, togglePick, type BocetoPick } from './boceto-selection';
// …
type SelectionPayload = { id: string; path: string; label: string; reveal?: true; others?: BocetoPick[] };
```

State, right after `let selected = '', selectedPath = '', …`:

```ts
  /** The rest of a multi-selection (the primary, `selected`/`selectedPath`, is the last pick). Kept only while the
   * primary is the one `setPicks` chose: any code that points the selection elsewhere drops them on the next draw. */
  let others: BocetoPick[] = [], groupKey = '';
```

Helpers, after `allBlocks`:

```ts
  const blockOf = (id: string): any => allBlocks().find(block => block.id === id);
  const picks = (): BocetoPick[] => [...others, ...(selected ? [{ id: selected, path: selectedPath }] : [])];
  function setPicks(list: BocetoPick[]) {
    const all = normalizePicks(list);
    const primary = all.pop();
    selected = primary?.id ?? ''; selectedPath = primary?.path ?? ''; others = all;
    groupKey = `${selected}|${selectedPath}`; picker = null; forgottenBlock = null;
    if (selected) expanded.add(selected);
  }
  const isPicked = (id: string, path: string) => picks().some(pick => pick.id === id && pick.path === path);
  const pickExists = (pick: BocetoPick) => { const block = blockOf(pick.id); return Boolean(block) && (!pick.path || Boolean(sketchFindNode(sketchNodeTree(block), pick.path))); };
```

`selectionPayload()` returns `others` (both returns):

```ts
    if (!block) return { id: '', path: '', label: '', others: [] };
    const node = selectedPath ? sketchFindNode(sketchNodeTree(block), selectedPath) : undefined;
    return { id: block.id, path: node ? selectedPath : '', label: node?.label ?? (TYPE_LABEL[block.type] || block.type), others };
```

At the top of `draw()`, right after `if (selected) focusNode(selected, selectedPath, false);`:

```ts
    if (others.length && `${selected}|${selectedPath}` !== groupKey) others = [];
    others = others.filter(pickExists);
```

Capas marks: in `nodeList` replace the `className` test `selected === block.id && selectedPath === node.path` with
`isPicked(block.id, node.path)`; in the block row and the account row replace `selected === block.id && !selectedPath`
(and `selected === 'account' && !selectedPath`) with `isPicked(block.id, '')` / `isPicked('account', '')`.

Capas Shift+click — `nodeList` item click:

```ts
      item.addEventListener('click', event => {
        event.stopPropagation();
        if (event.shiftKey) { setPicks(togglePick(picks(), { id: block.id, path: node.path })); draw(); return; }
        forgottenBlock = null; selected = block.id; selectedPath = node.path; picker = null; revealNext = true; draw();
      });
```

`pickBlock` takes the event's shift:

```ts
  const pickBlock = (id: string, add = false) => {
    if (add) { setPicks(togglePick(picks(), { id, path: '' })); draw(); return; }
    forgottenBlock = null; const same = selected === id && !selectedPath && !others.length; selected = same ? '' : id; selectedPath = ''; if (!same) expanded.add(id); picker = null; draw();
  };
```

and both row listeners call `pickBlock(block.id, (event as MouseEvent).shiftKey)` /
`pickBlock('account', (event as MouseEvent).shiftKey)`.

Inspector with several picks — in `draw()`, before `} else if (current) {` add a branch:

```ts
    } else if (current && others.length) {
      root.append(el('div', { className: 'bct-props' }, [groupProps(picks())]));
```

and a first version of `groupProps` next to `nodeProps` (Task 6 replaces its body):

```ts
  /** Inspector for several picks: what they can share. */
  function groupProps(list: BocetoPick[]) {
    return section(`${list.length} elementos`, [el('p', { className: 'bct-hint', text: 'Arrástralos juntos en el lienzo; Supr los elimina.' })]);
  }
```

Keydown (Studio document): after the typing guard and the undo line, before `if (!selected) return;`:

```ts
    if (event.key === 'Escape' && others.length) { event.preventDefault(); setPicks([]); draw(); return; }
```

Public API — replace `remoteSelect` and add `remoteSelectMany`:

```ts
    remoteSelect(id: string, path = '', add = false) {
      if (!sketch) return;
      if (add && id) { if (pickExists({ id, path })) setPicks(togglePick(picks(), { id, path })); draw(); return; }
      forgottenBlock = null;
      const before = `${selected}|${selectedPath}`;
      focusNode(id, path);
      if (`${selected}|${selectedPath}` !== before) picker = null;
      draw();
      if (!/^[a-z0-9-]{1,40}$/.test(selected)) return;
      host?.querySelector(`[data-boceto-block="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' });
    },
    /** A selection box on the canvas: its picks replace the selection, or join it with Shift. */
    remoteSelectMany(items: BocetoPick[], add: boolean) {
      if (!sketch) return;
      const valid = items.slice(0, 40).filter(pickExists);
      setPicks(add ? [...picks(), ...valid] : valid);
      draw();
    },
```

`focusNode` stays the single-selection setter: it changes the primary, so `others` drop on the next draw.

- [ ] **Step 4: Run the tests** — `npx vitest run src/source-boceto.test.ts` → all PASS (existing + 3 new).
  If "2 elementos" is not the first `.bct-section__title`, check the `others.length` branch comes before `current`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(boceto): the Studio keeps a multi-selection (Shift+click, Capas, Esc)" -- apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts
```

### Task 3: Canvas — outlines for every pick, Shift+click, the selection box, section drag only from the handle

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js` (header comment; `selection`; `select`;
  `drawOverlay`; pointerdown handler; click handler; Esc; apply message parsing; new `touches`, `within`, `boxPicks`,
  `startBox`)
- Modify: `apps/merchant-studio/src/source-studio.ts` (route `add` and `boceto-select-many`)
- Test: `packages/storefront-preview/src/source-preview-boceto.test.ts` (append; an older test that expects a section
  drag from the body of a section must now start on `[data-boceto-handle]`)
- Test: `apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts` (append the two-paragraph box)

**Interfaces:**
- Consumes: Task 2 `remoteSelect(id, path, add)`, `remoteSelectMany(items, add)`.
- Produces (canvas → Studio): `pagosya:boceto-select { id, path, add?: true }`,
  `pagosya:boceto-select-many { items: Array<{ id, path }>, add: boolean }`.
  (Studio → canvas): `boceto-apply.selection.others: Array<{ id, path }>`; canvas state `selection.others`.
  Studio router constant `PICK_PATH = /^([a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4})?$/` (reused in Task 4).

- [ ] **Step 1: Write the failing canvas tests** (append)

```ts
const pointerAt = (w: any, type: string, target: any, x: number, y: number, init: object = {}) =>
  target.dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init }));
const layoutStory = (w: any) => {
  const section = w.document.createElement('section');
  section.setAttribute('data-skb', 's');
  section.innerHTML = '<div data-skb-group="copy"><h2 data-skb-node="title">T</h2><div data-skb-group="paragraphs"><p data-skb-node="0">a</p><p data-skb-node="1">b</p><p data-skb-node="2">c</p></div></div>';
  w.document.querySelector('main').append(section);
  section.getBoundingClientRect = () => rect(0, 700, 1000, 500);
  section.querySelector('[data-skb-group="copy"]').getBoundingClientRect = () => rect(100, 750, 500, 400);
  section.querySelector('[data-skb-node="title"]').getBoundingClientRect = () => rect(100, 750, 400, 60);
  section.querySelector('[data-skb-group="paragraphs"]').getBoundingClientRect = () => rect(100, 830, 400, 260);
  ['0', '1', '2'].forEach((key, i) => { section.querySelector(`[data-skb-node="${key}"]`).getBoundingClientRect = () => rect(100, 830 + i * 100, 400, 60); });
  w.document.querySelector('[data-skb="h"]').getBoundingClientRect = () => rect(0, 0, 1000, 600);
  w.document.querySelector('[data-skb="c"]').getBoundingClientRect = () => rect(0, 600, 1000, 100);
  return section;
};

it('box: dragging from empty space selects the parts fully inside, never the section drag', async () => {
  const { w, posted, send } = load();
  const story = layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', story, 50, 820);
  pointerAt(w, 'pointermove', w.document, 60, 830);
  pointerAt(w, 'pointermove', w.document, 520, 1000);
  pointerAt(w, 'pointerup', w.document, 520, 1000); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-reorder')).toEqual([]);
  // the box covers paragraphs 0 and 1 (not 2); the paragraphs group is not fully inside
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many')).toEqual({ type: 'pagosya:boceto-select-many', items: [{ id: 's', path: 'copy/paragraphs/0' }, { id: 's', path: 'copy/paragraphs/1' }], add: false });
});

it('box: a box around every paragraph picks the paragraphs, not their group; Shift adds', async () => {
  const { w, posted, send } = load();
  const story = layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', story, 50, 820);
  pointerAt(w, 'pointermove', w.document, 60, 830);
  pointerAt(w, 'pointermove', w.document, 520, 1100);
  pointerAt(w, 'pointerup', w.document, 520, 1100, { shiftKey: true }); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many')).toEqual({ type: 'pagosya:boceto-select-many', items: ['0', '1', '2'].map(key => ({ id: 's', path: `copy/paragraphs/${key}` })), add: true });
});

it('box: a box across two sections picks both blocks', async () => {
  const { w, posted, send } = load();
  layoutStory(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  pointerAt(w, 'pointerdown', w.document.querySelector('[data-skb="c"]'), 900, 650);
  pointerAt(w, 'pointermove', w.document, 905, 660);
  pointerAt(w, 'pointermove', w.document, 950, 760);
  pointerAt(w, 'pointerup', w.document, 950, 760); await tick();
  expect(posted.find(m => m.type === 'pagosya:boceto-select-many').items).toEqual([{ id: 'c', path: '' }, { id: 's', path: '' }]);
});

it('Shift+click adds the clicked part; every pick from the Studio gets a selected box', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/headline', label: '', others: [{ id: 'h', path: 'copy/sub' }, { id: 'bad id', path: 'x' }] } }); await tick();
  expect(w.document.querySelectorAll('[data-boceto-box="selected"]')).toHaveLength(2);
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })); await tick();
  expect(posted.at(-1)).toEqual({ type: 'pagosya:boceto-select', id: 'h', path: 'copy/sub', add: true });
});
```

(`layoutStory` stubs `[data-skb="c"]` because `load()`'s page has a second section; jsdom returns zero rects otherwise.
`rect` is the helper already defined in this file.)

- [ ] **Step 2: Run them to see them fail**

Run: `cd packages/storefront-preview && npx vitest run src/source-preview-boceto.test.ts -t "box:|Shift\+click"`
Expected: FAIL — no `boceto-select-many` (a section drag starts instead).

- [ ] **Step 3: Implement the canvas changes**

State — `var selection = { id: '', path: '', label: '', others: [] }` and `select()` keeps others empty:

```js
  function select(id, path) {
    selection = { id: id, path: path, label: '', others: [] };
    drawOverlay();
    parent.postMessage({ type: 'pagosya:boceto-select', id: id, path: path }, '*');
  }
```

`drawOverlay()`, after the primary's boxes:

```js
    (selection.others || []).forEach(function (pick) {
      var otherSection = sectionById(pick.id), other = otherSection && nodeAt(otherSection, pick.path);
      if (other) boxes.push(makeBox(other, 'selected'));
    });
```

Apply message — where `selection = { id: sel.id, … }` is set, parse `others`:

```js
        var picks = Array.isArray(sel.others) ? sel.others : [];
        selection = { id: sel.id, path: sel.path, label: typeof sel.label === 'string' ? sel.label.slice(0, 60) : '', others: picks.filter(function (pick) { return pick && /^[a-z0-9-]{1,40}$/.test(pick.id) && typeof pick.path === 'string' && (pick.path === '' || PATH.test(pick.path)); }).slice(0, 40).map(function (pick) { return { id: pick.id, path: pick.path }; }) };
```

Box helpers (new, after `dropTarget`):

```js
  function touches(r, box) { return r.width > 0 && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top; }
  function within(r, box) { return r.width > 0 && r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom; }
  /** What a selection box picks: blocks when it touches several sections; inside one, the largest parts fully inside,
   * opening a lone group into its parts (two paragraphs, not "Párrafos"); the whole section when it covers it. */
  function boxPicks(box) {
    var hit = sections().filter(function (section) { return touches(section.getBoundingClientRect(), box); });
    if (hit.length > 1) return hit.slice(0, 40).map(function (section) { return { id: section.getAttribute('data-skb'), path: '' }; });
    if (!hit.length) return [];
    var section = hit[0], id = section.getAttribute('data-skb');
    if (within(section.getBoundingClientRect(), box)) return [{ id: id, path: '' }];
    var inside = Array.prototype.slice.call(section.querySelectorAll('[data-skb-group],[data-skb-node],[data-skb-el]')).filter(function (node) { return sectionOf(node) === section && within(node.getBoundingClientRect(), box); });
    var picked = inside.filter(function (node) { var up = containerOf(node); return !(up && up !== section && inside.indexOf(up) !== -1); });
    while (picked.length === 1 && childrenOf(picked[0]).some(function (child) { return inside.indexOf(child) !== -1; })) {
      var group = picked[0];
      picked = childrenOf(group).filter(function (child) { return inside.indexOf(child) !== -1; });
    }
    return picked.slice(0, 40).map(function (node) { return { id: id, path: pathOf(node) }; });
  }
  /** Figma marquee: a press on empty space draws a box; the release picks what it covers (Shift adds). */
  function startBox(down, now) {
    var marquee = document.createElement('div');
    marquee.setAttribute('data-boceto-marquee', '');
    marquee.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;box-sizing:border-box;border:1px solid #1f6feb;background:rgba(31,111,235,.08)';
    document.body.append(marquee);
    elDragging = marquee;
    clearBoxes(); placeHoverBox(null);
    var x0 = down.clientX + (window.scrollX || 0), y0 = down.clientY + (window.scrollY || 0), x1 = x0, y1 = y0;
    var clientBox = function () {
      var sx = window.scrollX || 0, sy = window.scrollY || 0;
      return { left: Math.min(x0, x1) - sx, top: Math.min(y0, y1) - sy, right: Math.max(x0, x1) - sx, bottom: Math.max(y0, y1) - sy };
    };
    var move = function (ev) {
      if (ev.clientY < 70) window.scrollBy(0, -22); else if (ev.clientY > window.innerHeight - 70) window.scrollBy(0, 22);
      x1 = ev.clientX + (window.scrollX || 0); y1 = ev.clientY + (window.scrollY || 0);
      var r = clientBox();
      marquee.style.left = r.left + 'px'; marquee.style.top = r.top + 'px'; marquee.style.width = (r.right - r.left) + 'px'; marquee.style.height = (r.bottom - r.top) + 'px';
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', stop, true);
      marquee.remove(); elDragging = null; drawOverlay();
    };
    var finish = function (ev) {
      x1 = ev.clientX + (window.scrollX || 0); y1 = ev.clientY + (window.scrollY || 0);
      var r = clientBox();
      stop();
      parent.postMessage({ type: 'pagosya:boceto-select-many', items: boxPicks(r), add: ev.shiftKey === true }, '*');
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', stop, true);
    if (now) move(now);
  }
```

Note: jsdom's `window.scrollBy` exists (no-op); the auto-scroll only triggers near the viewport edges.

Pointerdown handler — a box may start anywhere on the page (header, margins), and the section drag no longer starts
from the body of a section. Replace the handler body after `if (event.target === handle) return;`:

```js
    if (event.target === photoChip || (event.target instanceof Element && event.target.closest('[data-boceto-resize]'))) return;
    var section = sectionOf(event.target);
    var startX = event.clientX, startY = event.clientY;
    var arm = function (ev) {
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 6) return;
      cleanup();
      placePhotoChip(null);
      if (section) {
        var sticker = event.target instanceof Element ? event.target.closest('[data-skb-el="sticker"]') : null;
        if (sticker && sectionOf(sticker) === section) { startStickerDrag(sticker, ev); return; }
        var drag = dragCandidate(event.target);
        if (drag) {
          if (selection.id !== section.getAttribute('data-skb') || pathOf(drag) !== selection.path) select(section.getAttribute('data-skb'), pathOf(drag));
          startNodeDrag(drag, event, ev);
          return;
        }
      }
      // Sections move from their "⠿ Mover" handle; empty space draws a selection box.
      startBox(event, ev);
    };
```

(keep `cleanup` and the three listener registrations as they are).

Click handler — Shift adds:

```js
    var next = nextSelection(event.target);
    if (!next) return;
    if (event.shiftKey) parent.postMessage({ type: 'pagosya:boceto-select', id: next.id, path: next.path, add: true }, '*');
    else select(next.id, next.path);
```

Esc — with others, clear everything:

```js
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!selection.path || (selection.others && selection.others.length)) select('', '');
      else select(selection.id, selection.path.split('/').slice(0, -1).join('/'));
    }
```

Header comment: change the section line to "dragging the handle reorders sections live and posts pagosya:boceto-reorder
{ id, index }; dragging from empty space draws a selection box and posts pagosya:boceto-select-many { items, add };
Shift+click posts pagosya:boceto-select with add".

- [ ] **Step 4: Route the messages in the Studio** — in `source-studio.ts`, inside the `pagosya:boceto-` block, define
  the constant once at its top and replace the `boceto-select` line:

```ts
      const PICK_PATH = /^([a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4})?$/;
      if (event.data.type === 'pagosya:boceto-select' && typeof event.data.id === 'string' && event.data.id.length <= 40) bocetoPanel.remoteSelect(event.data.id, typeof event.data.path === 'string' && PICK_PATH.test(event.data.path) ? event.data.path : '', event.data.add === true);
      if (event.data.type === 'pagosya:boceto-select-many' && Array.isArray(event.data.items) && event.data.items.length <= 40) bocetoPanel.remoteSelectMany(event.data.items.filter((item: any) => item && typeof item.id === 'string' && /^[a-z0-9-]{1,40}$/.test(item.id) && typeof item.path === 'string' && PICK_PATH.test(item.path)).map((item: any) => ({ id: item.id, path: item.path })), event.data.add === true);
```

- [ ] **Step 5: Real-browser check** — append to `sketch-canvas-layout.spec.ts`:

```ts
it('a box drawn over two story paragraphs picks exactly those two', async () => {
  const result = await openPage([
    { id: 's', type: 'story', title: 'El proceso', paragraphs: ['Preparación lenta de la masa.', 'Horneado al momento.', 'Empaque a mano.'], bg: 'paper', size: 'm' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-select-many') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const box = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const section = r('[data-skb="s"]'), first = r('[data-skb="s"] [data-skb-group="paragraphs"] > :nth-child(1)'), second = r('[data-skb="s"] [data-skb-group="paragraphs"] > :nth-child(2)');
      return { x0: section.left + 6, y0: first.top - 4, x1: Math.max(first.right, second.right) + 6, y1: second.bottom + 4 };
    });
    await page.mouse.move(box.x0, box.y0); await page.mouse.down();
    for (let step = 1; step <= 8; step++) await page.mouse.move(box.x0 + ((box.x1 - box.x0) * step) / 8, box.y0 + ((box.y1 - box.y0) * step) / 8);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    return page.evaluate(() => (window as any).posted);
  });
  expect(result).toEqual([{ type: 'pagosya:boceto-select-many', items: [{ id: 's', path: 'copy/paragraphs/0' }, { id: 's', path: 'copy/paragraphs/1' }], add: false }]);
});
```

The press starts in the section's side padding (empty space, what a merchant grabs).

- [ ] **Step 6: Run everything touched**

```bash
cd /Users/saramia/pagosYa/packages/storefront-preview && npx vitest run
cd ../../apps/merchant-studio && npx vitest run src/source-boceto.test.ts && npx tsc --noEmit -p tsconfig.json
cd ../api && npx jest src/storefront-source/sketch/sketch-canvas-layout
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(boceto): selection box, Shift+click and outlines for every pick; sections move from their handle" -- packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts apps/merchant-studio/src/source-studio.ts apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts
```

### Task 4: The right-click menu

**Files:**
- Create: `apps/merchant-studio/src/boceto-menu.ts`, `apps/merchant-studio/src/boceto-menu.test.ts`
- Modify: `apps/merchant-studio/src/source-boceto.css` (menu styles)
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`insertExtra` takes a spot; `spotsOf`, `turnPicks`,
  `unfreePicks`, `canRemovePick`, `canMovePicks`, `menuItems`, `openMenuOn`, Capas `contextmenu`, `remoteContext`)
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js` (`contextmenu` listener)
- Modify: `apps/merchant-studio/src/source-studio.ts` (route `boceto-context`, close the menu on board wheel)
- Test: `source-boceto.test.ts`, `source-preview-boceto.test.ts` (append)

**Interfaces:**
- Consumes: Task 2 `picks()`, `setPicks()`, `blockOf()`, `isPicked()`, `pickExists()`; Task 3 `PICK_PATH`.
- Produces: `type MenuItem = { label: string; shortcut?: string; disabled?: boolean; run?: () => void; items?: MenuItem[] } | 'separator'`,
  `openBocetoMenu(doc: Document, x: number, y: number, items: MenuItem[]): HTMLElement`, `closeBocetoMenu(): void`.
  Canvas → Studio: `pagosya:boceto-context { id, path, x, y, fx, fy }` (x/y board-page px; fx/fy % of the section or null).
  Panel API: `remoteContext(at: { id: string; path: string; x: number; y: number; fx?: number; fy?: number })` (x/y are
  Studio-window client px). Panel internals for later tasks: `type MenuAt = { block?: string; fx?: number; fy?: number }`,
  `menuItems(at: MenuAt): MenuItem[]`, `spotsOf(list)`, `turnPicks(r: number)`, `unfreePicks()`,
  `canRemovePick(pick)`, `canMovePicks()`, `insertExtra(block, kind, x?, y?)`.

- [ ] **Step 1: Menu module test** (`boceto-menu.test.ts`)

```ts
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { closeBocetoMenu, openBocetoMenu } from './boceto-menu';

afterEach(() => closeBocetoMenu());

it('draws items with shortcuts, greys disabled ones, runs and closes on click', () => {
  const run = vi.fn(), never = vi.fn();
  const menu = openBocetoMenu(document, 20, 30, [{ label: 'Copiar', shortcut: '⌘C', run }, 'separator', { label: 'Pegar aquí', disabled: true, run: never }]);
  const items = [...menu.querySelectorAll('.bct-menu__item')] as HTMLElement[];
  expect(items.map(item => item.textContent)).toEqual(['Copiar⌘C', 'Pegar aquí']);
  expect(menu.querySelectorAll('.bct-menu__sep')).toHaveLength(1);
  items[1].click(); expect(never).not.toHaveBeenCalled();
  items[0].click(); expect(run).toHaveBeenCalledOnce();
  expect(document.querySelector('.bct-menu')).toBeNull();
});

it('opens submenus, closes on Esc and outside press, and a second menu replaces the first', () => {
  const pick = vi.fn();
  const menu = openBocetoMenu(document, 0, 0, [{ label: 'Giro', items: [{ label: '8°', run: pick }] }]);
  (menu.querySelector('.bct-menu--sub .bct-menu__item') as HTMLElement).click();
  expect(pick).toHaveBeenCalledOnce();
  openBocetoMenu(document, 0, 0, [{ label: 'A' }]);
  openBocetoMenu(document, 0, 0, [{ label: 'B' }]);
  expect(document.querySelectorAll('.bct-menu:not(.bct-menu--sub)')).toHaveLength(1);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector('.bct-menu')).toBeNull();
  openBocetoMenu(document, 0, 0, [{ label: 'C' }]);
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(document.querySelector('.bct-menu')).toBeNull();
});
```

- [ ] **Step 2: Run to see it fail** — `npx vitest run src/boceto-menu.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `boceto-menu.ts`**

```ts
/** The Boceto's own right-click menu (Figma-style): drawn by the Studio over the board, never the browser's. */
export type MenuItem = { label: string; shortcut?: string; disabled?: boolean; run?: () => void; items?: MenuItem[] } | 'separator';

let current: (() => void) | null = null;

export function closeBocetoMenu() { current?.(); }

function build(doc: Document, items: MenuItem[], sub = false): HTMLElement {
  const menu = doc.createElement('div');
  menu.className = sub ? 'bct-menu bct-menu--sub' : 'bct-menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item === 'separator') { const line = doc.createElement('div'); line.className = 'bct-menu__sep'; menu.append(line); continue; }
    // Items are divs: a submenu nests inside its item, and buttons cannot nest.
    const row = doc.createElement('div');
    row.className = `bct-menu__item${item.disabled ? ' is-disabled' : ''}${item.items ? ' has-sub' : ''}`;
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-disabled', String(Boolean(item.disabled)));
    row.tabIndex = -1;
    const label = doc.createElement('span'); label.textContent = item.label;
    row.append(label);
    const tail = item.items ? '›' : item.shortcut;
    if (tail) { const key = doc.createElement('span'); key.className = 'bct-menu__key'; key.textContent = tail; row.append(key); }
    if (item.items && !item.disabled) row.append(build(doc, item.items, true));
    row.addEventListener('click', event => {
      event.stopPropagation();
      if (item.disabled || item.items) return;
      closeBocetoMenu();
      item.run?.();
    });
    menu.append(row);
  }
  return menu;
}

export function openBocetoMenu(doc: Document, x: number, y: number, items: MenuItem[]): HTMLElement {
  closeBocetoMenu();
  const root = build(doc, items);
  doc.body.append(root);
  const view = doc.defaultView;
  const width = root.offsetWidth || 220, height = root.offsetHeight || 0;
  root.style.left = `${Math.max(8, Math.min(x, (view?.innerWidth ?? 1280) - width - 8))}px`;
  root.style.top = `${Math.max(8, Math.min(y, (view?.innerHeight ?? 800) - height - 8))}px`;
  const onDown = (event: Event) => { if (!(event.target instanceof Node) || !root.contains(event.target)) close(); };
  const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } };
  const close = () => {
    root.remove();
    doc.removeEventListener('pointerdown', onDown, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('wheel', close, true);
    view?.removeEventListener('blur', close);
    if (current === close) current = null;
  };
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('wheel', close, true);
  // A press on the board goes to its frame, which blurs this window.
  view?.addEventListener('blur', close);
  current = close;
  return root;
}
```

CSS (append to `source-boceto.css`):

```css
.bct-menu { position: fixed; z-index: 2147483000; min-width: 220px; padding: 6px; background: #1f1f1f; color: #f4f4f4; border: 1px solid #333; border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,.45); font: 500 13px/1 system-ui, sans-serif; }
.bct-menu__item { position: relative; display: flex; justify-content: space-between; gap: 24px; padding: 8px 10px; border-radius: 6px; cursor: default; white-space: nowrap; }
.bct-menu__item:hover:not(.is-disabled), .bct-menu__item:focus-within:not(.is-disabled) { background: #1f6feb; }
.bct-menu__item.is-disabled { color: #777; }
.bct-menu__key { color: #9a9a9a; }
.bct-menu__item:hover:not(.is-disabled) .bct-menu__key { color: #fff; }
.bct-menu__sep { height: 1px; margin: 5px 4px; background: #333; }
.bct-menu--sub { position: absolute; display: none; left: 100%; top: -6px; }
.bct-menu__item.has-sub:hover > .bct-menu--sub, .bct-menu__item.has-sub:focus-within > .bct-menu--sub { display: block; }
```

- [ ] **Step 4: Run the menu tests** → PASS.

- [ ] **Step 5: Panel tests** (append to `source-boceto.test.ts`)

```ts
const menuLabels = () => [...document.querySelectorAll('.bct-menu:not(.bct-menu--sub) > .bct-menu__item')].map(item => [item.firstChild!.textContent, item.classList.contains('is-disabled')]);
const menuItem = (label: string) => [...document.querySelectorAll('.bct-menu__item')].find(item => item.firstChild!.textContent === label) as HTMLElement;

it('menu: right-click selects the part and lists what applies to it', async () => {
  const panel = await mount();
  panel.remoteContext({ id: 'intro', path: 'copy/sub', x: 100, y: 100, fx: 20, fy: 30 });
  expect(lastSelection()).toMatchObject({ id: 'intro', path: 'copy/sub' });
  expect(menuLabels()).toEqual([
    ['Copiar', true], ['Pegar aquí', true], ['Duplicar', true], ['Eliminar', false],
    ['Subir', false], ['Bajar', false], ['Seleccionar bloque', false],
    ['Volver a su lugar', true], ['Giro', true], ['Insertar', false],
    ['Deshacer', true], ['Rehacer', true],
  ]);
  menuItem('Seleccionar bloque').click();
  expect(lastSelection()).toMatchObject({ id: 'intro', path: '' });
});

it('menu: right-click inside a multi-selection keeps it; Insertar drops the element where the menu opened', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'intro', path: 'copy/sub' }, { id: 'intro', path: 'copy/headline' }], false);
  panel.remoteContext({ id: 'intro', path: 'copy/sub', x: 100, y: 100, fx: 12.34, fy: 56 });
  expect(lastSelection().others).toHaveLength(1);
  (menuItem('Insertar').querySelector('.bct-menu__item') as HTMLElement).click(); // Emoji
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].extras[0]).toMatchObject({ kind: 'emoji', x: 12.3, y: 56 });
});

it('menu: Giro acts on free parts; Capas rows open the menu too; locked keeps only Seleccionar bloque', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/sub', 10, 10);
  panel.remoteContext({ id: 'intro', path: 'copy/sub', x: 5, y: 5 });
  (menuItem('Giro').querySelectorAll('.bct-menu__item')[2] as HTMLElement).click(); // 8°
  expect(lastLook().blocks.intro.free['copy/sub']).toEqual({ x: 10, y: 10, r: 8 });
  (host.querySelector('[data-boceto-block="cat"]') as HTMLElement).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  expect(lastSelection()).toMatchObject({ id: 'cat', path: '' });
  expect(menuLabels().find(([label]) => label === 'Eliminar')).toEqual(['Eliminar', false]);
  const locked = createBocetoPanel(new MerchantStudioApi());
  locked.mount(host, { storeId: 's1', version: version(), locked: true, saved: vi.fn(), apply: payload => applied.push(payload) });
  await vi.waitFor(() => { if (!host.querySelector('[data-boceto-block]')) throw new Error('not ready'); });
  locked.remoteContext({ id: 'intro', path: 'copy/sub', x: 5, y: 5 });
  expect(menuLabels().filter(([, disabled]) => !disabled).map(([label]) => label)).toEqual(['Seleccionar bloque']);
});
```

(Copiar and Duplicar are disabled until Task 9 wires the clipboard; Task 9 updates these expectations.)

- [ ] **Step 6: Implement in the panel** (`source-boceto.ts`)

Import: `import { openBocetoMenu, type MenuItem } from './boceto-menu';`

`insertExtra` takes an optional spot (replace its `x: 45, y: 40` part):

```ts
  function insertExtra(block: any, kind: string, x = 45, y = 40) {
    // …existing id / value / width code unchanged…
    const spot = sketchFreePos({ x, y }) ?? { x: 45, y: 40 };
    extras.push({ id, kind, value: value[kind], x: spot.x, y: spot.y, ...(width[kind] ? { w: width[kind] } : {}), ...(kind === 'button' ? { href: 'checkout.html' } : {}) });
```

Group helpers (near `removeSelection`):

```ts
  /** Free spots and inserted elements among the picks, with the object that holds each spot. */
  const spotsOf = (list: BocetoPick[]) => list.flatMap(pick => {
    const block = blockOf(pick.id);
    const extra = pick.path.startsWith('extras/');
    const spot = extra ? (block?.extras || []).find((item: any) => `extras/${item.id}` === pick.path) : block?.free?.[pick.path];
    return spot ? [{ pick, block, spot, extra }] : [];
  });
  function turnPicks(r: number) {
    const spots = spotsOf(picks());
    if (!spots.length || opts?.locked) return;
    for (const { spot } of spots) { if (r) spot.r = r; else delete spot.r; }
    schedule(); draw();
  }
  function unfreePicks() {
    const spots = spotsOf(picks()).filter(entry => !entry.extra);
    if (!spots.length || opts?.locked) return;
    for (const { block, pick } of spots) sketchUnfree(block, pick.path);
    schedule(); draw();
  }
  const canRemovePick = (pick: BocetoPick) => { const block = blockOf(pick.id); return Boolean(block) && (pick.path ? sketchCanRemove(block, pick.path) : block.type !== 'account'); };
  function canMovePicks(): boolean {
    const list = picks();
    if (list.length !== 1 || !sketch) return false;
    const [pick] = list, block = blockOf(pick.id);
    return pick.path ? Boolean(block) && sketchCanMove(block, pick.path) : sketch.blocks.some(item => item.id === pick.id);
  }
```

Menu:

```ts
  type MenuAt = { block?: string; fx?: number; fy?: number };
  function menuItems(at: MenuAt): MenuItem[] {
    const list = picks(), locked = Boolean(opts?.locked);
    const single = list.length === 1 ? list[0] : null;
    const spots = spotsOf(list);
    const target = blockOf(at.block || list.at(-1)?.id || '');
    const canInsert = !locked && Boolean(target) && target.type !== 'account' && (target.extras?.length ?? 0) < SKETCH_EXTRA_MAX;
    const turns: Array<[string, string]> = [['0', '0°'], ['-8', '−8°'], ['8', '8°'], ['15', '15°']];
    return [
      { label: 'Copiar', shortcut: '⌘C', disabled: true },
      { label: 'Pegar aquí', shortcut: '⌘V', disabled: true },
      { label: 'Duplicar', shortcut: '⌘D', disabled: true },
      { label: 'Eliminar', shortcut: '⌫', disabled: locked || !list.some(canRemovePick), run: () => removeSelection() },
      'separator',
      { label: 'Subir', shortcut: '⌥↑', disabled: locked || !canMovePicks(), run: () => moveSelection(-1) },
      { label: 'Bajar', shortcut: '⌥↓', disabled: locked || !canMovePicks(), run: () => moveSelection(1) },
      { label: 'Seleccionar bloque', disabled: !single?.path, run: () => { setPicks([{ id: single!.id, path: '' }]); draw(); } },
      'separator',
      { label: 'Volver a su lugar', disabled: locked || !spots.some(entry => !entry.extra), run: () => unfreePicks() },
      { label: 'Giro', disabled: locked || !spots.length, items: turns.map(([value, label]) => ({ label, run: () => turnPicks(Number(value)) })) },
      { label: 'Insertar', disabled: !canInsert, items: EXTRA_KINDS.map(({ kind, label }) => ({ label, disabled: kind === 'photo' && !photos.length, run: () => insertExtra(target, kind, at.fx, at.fy) })) },
      'separator',
      { label: 'Deshacer', shortcut: '⌘Z', disabled: locked || !undoSteps.length, run: () => stepBack() },
      { label: 'Rehacer', shortcut: '⇧⌘Z', disabled: locked || !redoSteps.length, run: () => stepBack(true) },
    ];
  }
  /** Figma: a right-click outside the selection selects what was clicked first; on the page background, nothing. */
  function openMenuOn(pick: BocetoPick | null, x: number, y: number, at: MenuAt) {
    if (!pick) setPicks([]);
    else if (!isPicked(pick.id, pick.path)) setPicks([pick]);
    draw();
    openBocetoMenu(host?.ownerDocument ?? document, x, y, menuItems(at));
  }
```

Capas: in `nodeList` add to each node item

```ts
      item.addEventListener('contextmenu', event => { event.preventDefault(); event.stopPropagation(); openMenuOn({ id: block.id, path: node.path }, event.clientX, event.clientY, { block: block.id }); });
```

and to each block row (`item`; the account `entry` with `'account'`):

```ts
      item.addEventListener('contextmenu', event => { event.preventDefault(); openMenuOn({ id: block.id, path: '' }, (event as MouseEvent).clientX, (event as MouseEvent).clientY, { block: block.id }); });
```

Public API:

```ts
    /** A right-click on the board (Studio-window coordinates); `fx`/`fy` are the spot inside that block's section, in %. */
    remoteContext(at: { id: string; path: string; x: number; y: number; fx?: number; fy?: number }) {
      if (!sketch) return;
      const pick = at.id && blockOf(at.id) ? (pickExists({ id: at.id, path: at.path }) ? { id: at.id, path: at.path } : { id: at.id, path: '' }) : null;
      openMenuOn(pick, at.x, at.y, { block: pick?.id, fx: at.fx, fy: at.fy });
    },
```

- [ ] **Step 7: Canvas `contextmenu`** — test first (append to `source-preview-boceto.test.ts`):

```ts
it('right-click never shows the browser menu: it posts where it happened and what is under it', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  const event = new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 150 });
  w.document.querySelector('[data-skb-el="sub"]').dispatchEvent(event); await tick();
  expect(event.defaultPrevented).toBe(true);
  expect(posted.at(-1)).toEqual({ type: 'pagosya:boceto-context', id: 'h', path: '', x: 100, y: 150, fx: 10, fy: 25 });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/sub', label: '', others: [{ id: 'h', path: 'copy/headline' }] } }); await tick();
  w.document.querySelector('[data-skb-el="headline"]').dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 40 })); await tick();
  expect(posted.at(-1)).toMatchObject({ type: 'pagosya:boceto-context', id: 'h', path: 'copy/headline' });
});
```

(Nothing is selected for the first right-click, so the drill-down target is the block, `path: ''`; the section rect is
1000×600, so (100,150) is 10% / 25%.)

Implement (after the `dblclick` listener):

```js
  /** Right-click: the Studio draws its own menu. The target is a picked node under the pointer (so a multi-selection
   * stays), else the drill-down target, else nothing (page background). */
  document.addEventListener('contextmenu', function (event) {
    if (!on) return;
    event.preventDefault(); event.stopPropagation();
    if (editing) return;
    var section = sectionOf(event.target), pick = { id: '', path: '' };
    if (section) {
      var picked = [selection].concat(selection.others || []).filter(function (item) {
        if (!item.id) return false;
        var itemSection = sectionById(item.id), node = itemSection && nodeAt(itemSection, item.path);
        return node && node !== itemSection && node.contains(event.target);
      })[0];
      pick = picked ? { id: picked.id, path: picked.path } : (nextSelection(event.target) || pick);
    }
    var r = section ? section.getBoundingClientRect() : null;
    parent.postMessage({ type: 'pagosya:boceto-context', id: pick.id, path: pick.path,
      x: event.clientX + (window.scrollX || 0), y: event.clientY + (window.scrollY || 0),
      fx: r && r.width ? clampPct(((event.clientX - r.left) / r.width) * 100, 0) : null,
      fy: r && r.height ? clampPct(((event.clientY - r.top) / r.height) * 100, 0) : null }, '*');
  }, true);
```

- [ ] **Step 8: Studio routing** — `source-studio.ts`, inside the `pagosya:boceto-` block (after `PICK_PATH`):

```ts
      if (event.data.type === 'pagosya:boceto-context' && typeof event.data.id === 'string' && event.data.id.length <= 40 && typeof event.data.path === 'string' && PICK_PATH.test(event.data.path) && Number.isFinite(event.data.x) && Number.isFinite(event.data.y)) {
        const rect = canvasBoard()?.getBoundingClientRect();
        // The frame shows the whole page unscrolled: board px = translate + page px × zoom.
        const pct = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
        if (rect) bocetoPanel.remoteContext({ id: event.data.id, path: event.data.path, x: rect.left + canvasX + event.data.x * canvasZoom, y: rect.top + canvasY + event.data.y * canvasZoom, fx: pct(event.data.fx), fy: pct(event.data.fy) });
      }
```

and at the start of the `pagosya:boceto-wheel` branch: `closeBocetoMenu();` (`import { closeBocetoMenu } from './boceto-menu';`).

- [ ] **Step 9: Run** — `cd apps/merchant-studio && npx vitest run && npx tsc --noEmit -p tsconfig.json`;
  `cd ../../packages/storefront-preview && npx vitest run`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/merchant-studio/src/boceto-menu.ts apps/merchant-studio/src/boceto-menu.test.ts
git commit -m "feat(boceto): the Studio's own right-click menu on the board and in Capas" -- apps/merchant-studio/src/boceto-menu.ts apps/merchant-studio/src/boceto-menu.test.ts apps/merchant-studio/src/source-boceto.css apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
```

---

## Stage 2 — group move, delete and style

### Task 5: Group delete and group Subir/Bajar

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`removeSelection`, `moveSelection`, `canMovePicks`)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `picks()`, `setPicks()`, `blockOf()`, `others` (Task 2).
- Produces: `removeSelection()` and `moveSelection(delta)` act on all picks; `canMovePicks()` true for a single movable
  pick or for several whole page blocks.

- [ ] **Step 1: Failing tests**

```ts
const stepsSketch = () => ({ ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'T', note: '', kicker: '', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }, { icon: 'c', title: 'Tres', text: '' }, { icon: 'd', title: 'Cuatro', text: '' }], free: { 'items/3': { x: 5, y: 5 } }, bg: 'paper', size: 'm' }, ...sketch().blocks] });

it('group: Supr removes every picked item of a list (highest first), keeps fixed parts and says so', async () => {
  getSketch.mockResolvedValueOnce({ revision: 3, sketch: stepsSketch(), photos: [], fonts: ['anton'] } as any);
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'st', path: 'items/0' }, { id: 'st', path: 'items/2' }, { id: 'st', path: 'head/title' }], false);
  panel.remoteKey('delete');
  expect(host.querySelector('.bct-status')?.textContent).toContain('1 parte no se puede eliminar');
  expect(lastSelection()).toMatchObject({ id: '', others: [] });
  await vi.advanceTimersByTimeAsync(1300);
  const block = putSketch.mock.calls.at(-1)![1].sketch.blocks[0];
  expect(block.items.map((item: any) => item.title)).toEqual(['Dos', 'Cuatro']);
  expect(block.free).toEqual({ 'items/1': { x: 5, y: 5 } });
  expect(block.title).toBe('T');
  expect(putSketch).toHaveBeenCalledTimes(1);
});

it('group: several blocks move up/down as a group and delete together, one step each', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'cat', path: '' }, { id: 'fin', path: '' }], false);
  panel.remoteKey('up');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['cat', 'fin', 'intro']);
  panel.remoteKey('undo');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['intro', 'cat', 'fin']);
  panel.remoteSelectMany([{ id: 'intro', path: '' }, { id: 'cat', path: '' }], false);
  panel.remoteKey('delete');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['fin']);
});
```

- [ ] **Step 2: Run** `npx vitest run src/source-boceto.test.ts -t "group:"` → FAIL.

- [ ] **Step 3: Implement**

```ts
  function removeSelection() {
    const list = picks();
    if (!list.length || !sketch) return;
    if (list.length === 1) {
      if (!selectedPath) { deleteBlock(selected); return; }
      const block = selectedBlock();
      if (!block || !sketchRemoveNode(block, selectedPath)) return;
      focusNode(selected, selectedPath.split('/').slice(0, -1).join('/'));
      scheduleStructural(); draw(); return;
    }
    const gone = new Set(list.filter(pick => !pick.path && pick.id !== 'account').map(pick => pick.id));
    // Items of one list go from the highest index down, so the indices still to remove stay right.
    const parts = list.filter(pick => pick.path && !gone.has(pick.id)).sort((a, b) => b.path.localeCompare(a.path, undefined, { numeric: true }));
    let kept = 0;
    for (const pick of parts) { const block = blockOf(pick.id); if (!block || !sketchRemoveNode(block, pick.path)) kept++; }
    if (gone.size) sketch.blocks = sketch.blocks.filter(block => !gone.has(block.id));
    setPicks([]);
    note = kept ? `${kept} ${kept === 1 ? 'parte no se puede eliminar' : 'partes no se pueden eliminar'}.` : '';
    scheduleStructural(); draw();
  }
```

In `moveSelection`, right after `if (!sketch || !selected) return;`:

```ts
    if (others.length) {
      // Several whole blocks move as one run of blocks, one place up or down; parts do not group-move.
      const list = picks(), ids = new Set(list.map(pick => pick.id));
      if (list.some(pick => pick.path || !sketch!.blocks.some(block => block.id === pick.id))) return;
      const first = sketch.blocks.findIndex(block => ids.has(block.id));
      const moving = sketch.blocks.filter(block => ids.has(block.id)), rest = sketch.blocks.filter(block => !ids.has(block.id));
      const at = sketch.blocks.slice(0, first).filter(block => !ids.has(block.id)).length + delta;
      if (at < 0 || at > rest.length) return;
      rest.splice(at, 0, ...moving);
      sketch.blocks = rest;
      scheduleStructural(); draw(); return;
    }
```

`canMovePicks()` — replace its first two lines:

```ts
    const list = picks();
    if (!sketch || !list.length) return false;
    if (list.length > 1) return list.every(pick => !pick.path && sketch!.blocks.some(block => block.id === pick.id));
```

- [ ] **Step 4: Run** → PASS (whole file).
- [ ] **Step 5: Commit** `git commit -m "feat(boceto): delete and move several picks at once" -- apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts`

### Task 6: Change style together ("N elementos" inspector)

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`groupProps` body)
- Test: `apps/merchant-studio/src/source-boceto.test.ts`

**Interfaces:**
- Consumes: `spotsOf`, `turnPicks`, `unfreePicks`, `canRemovePick`, `removeSelection`, `bgSwatches`, `segment`, `row`,
  `section`.
- Produces: `groupProps(list: BocetoPick[]): HTMLElement`; its Eliminar button has `data-boceto-group-remove`.

- [ ] **Step 1: Failing tests**

```ts
it('group style: several blocks share Fondo, Tamaño and Alineación; a change applies to each', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'intro', path: '' }, { id: 'cat', path: '' }], false);
  expect(host.querySelector('.bct-swatch.is-on')).toBeNull(); // paper and pop: no shared fill
  (host.querySelectorAll('.bct-swatch')[2] as HTMLElement).click(); // accent
  ([...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === 'XL') as HTMLElement).click();
  ([...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === 'Centro') as HTMLElement).click();
  await vi.advanceTimersByTimeAsync(1300);
  const [intro, cat] = putSketch.mock.calls.at(-1)![1].sketch.blocks;
  expect([intro.bg, cat.bg, intro.size, cat.size, intro.align, cat.align]).toEqual(['accent', 'accent', 'xl', 'xl', 'center', 'center']);
});

it('group style: free parts share Giro and Volver a su lugar; mixed picks only offer Eliminar', async () => {
  const panel = await mount();
  panel.remoteFree('intro', 'copy/sub', 10, 10);
  panel.remoteFree('intro', 'copy/headline', 20, 20);
  panel.remoteSelectMany([{ id: 'intro', path: 'copy/sub' }, { id: 'intro', path: 'copy/headline' }], false);
  ([...host.querySelectorAll('.bct-segment__option')].find(button => button.textContent === '15°') as HTMLElement).click();
  expect(lastLook().blocks.intro.free).toEqual({ 'copy/sub': { x: 10, y: 10, r: 15 }, 'copy/headline': { x: 20, y: 20, r: 15 } });
  (host.querySelector('[data-boceto-unfree]') as HTMLElement).click();
  expect(lastLook().blocks.intro.free).toEqual({});
  panel.remoteSelectMany([{ id: 'intro', path: 'copy/sub' }, { id: 'cat', path: '' }], false);
  expect(host.querySelector('.bct-swatch')).toBeNull();
  expect(host.querySelector('[data-boceto-group-remove]')).not.toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** (replace the Task 2 placeholder body)

```ts
  /** Inspector for several picks, Figma-style: only what they can share. */
  function groupProps(list: BocetoPick[]) {
    const children: HTMLElement[] = [];
    const shared = (values: string[]) => (values.every(value => value === values[0]) ? values[0] : '');
    const blocks = list.every(pick => !pick.path) ? list.map(pick => blockOf(pick.id)).filter(Boolean) : [];
    const spots = spotsOf(list);
    if (blocks.length && blocks.length === list.length) {
      const each = (apply: (block: any) => void) => { blocks.forEach(apply); schedule(); draw(); };
      children.push(row('Fondo', bgSwatches(shared(blocks.map(block => block.bg)), next => each(block => { block.bg = next; }))));
      if (blocks.every(block => block.type !== 'account')) children.push(row('Tamaño', segment(shared(blocks.map(block => block.size)), SIZES, ['S', 'M', 'L', 'XL'], next => each(block => { block.size = next; }))));
      children.push(row('Alineación', segment(shared(blocks.map(block => (block.align === 'center' || block.align === 'end' ? block.align : 'start'))), ['start', 'center', 'end'], ['Izq.', 'Centro', 'Der.'], next => each(block => { if (next === 'start') delete block.align; else block.align = next; }))));
    } else if (spots.length === list.length) {
      children.push(row('Giro', segment(shared(spots.map(entry => String(entry.spot.r ?? 0))), ['0', '-8', '8', '15'], ['0°', '−8°', '8°', '15°'], next => turnPicks(Number(next)))));
      if (spots.some(entry => !entry.extra)) {
        const back = el('button', { type: 'button', className: 'bct-chip', text: 'Volver a su lugar' });
        back.dataset.bocetoUnfree = '';
        back.addEventListener('click', () => unfreePicks());
        children.push(row('Sueltos', back));
      }
    } else {
      children.push(el('p', { className: 'bct-hint', text: 'Son partes distintas: puedes moverlas juntas en el lienzo o eliminarlas.' }));
    }
    const remove = el('button', { type: 'button', className: 'bct-remove', text: 'Eliminar', disabled: !list.some(canRemovePick) });
    remove.dataset.bocetoGroupRemove = '';
    remove.addEventListener('click', () => removeSelection());
    children.push(remove);
    children.push(el('p', { className: 'bct-hint', text: 'Shift + clic suma o quita una parte. Esc deselecciona.' }));
    return section(`${list.length} elementos`, children);
  }
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(boceto): change the look of several picks at once" -- apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts`

### Task 7: Move several picks together

**Files:**
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js` (`groupAt`, `startGroupDrag`, pointerdown arm,
  `startDrag` / `dropTarget` for selected blocks)
- Modify: `apps/merchant-studio/src/source-boceto.ts` (`placeFree`, `FULL_NOTE`, `remoteFree` uses them,
  `remoteFreeMany`, `remoteReorderMany`)
- Modify: `apps/merchant-studio/src/source-studio.ts` (route `boceto-free-many`, `boceto-reorder-many`)
- Test: `source-preview-boceto.test.ts`, `source-boceto.test.ts`, `sketch-canvas-layout.spec.ts`

**Interfaces:**
- Canvas → Studio: `pagosya:boceto-free-many { moves: Array<{ id, path, x, y, w? }> }`,
  `pagosya:boceto-reorder-many { ids: string[], index: number }` (index = how many unmoved blocks sit before the run).
- Panel API: `remoteFreeMany(moves: Array<{ id: string; path: string; x: number; y: number; w?: number }>)`,
  `remoteReorderMany(ids: string[], index: number)`.
- Panel internal: `placeFree(block: any, path: string, x: number, y: number, w?: number): 'ok' | 'full' | 'no'`.

- [ ] **Step 1: Failing canvas test**

```ts
it('group drag: grabbing one of several picks moves them all by the same distance and posts one free-many', async () => {
  const { w, posted, send } = load();
  layoutBoard(w);
  send({ type: 'pagosya:boceto-mode', on: true });
  send({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/headline', label: '', others: [{ id: 'h', path: 'copy/sub' }] }, blocks: { h: { movable: ['copy/headline', 'copy/sub'], freeable: ['copy/headline', 'copy/sub'], free: {} } } }); await tick();
  const headline = w.document.querySelector('[data-skb-el="headline"]');
  pointer(w, 'pointerdown', headline, 30, 40);
  pointer(w, 'pointermove', w.document, 40, 40); await tick();
  pointer(w, 'pointermove', w.document, 130, 100);
  pointer(w, 'pointerup', w.document, 130, 100); await tick();
  const message = posted.find(m => m.type === 'pagosya:boceto-free-many');
  // section 1000×600: +100px = +10%, +60px = +10%; headline from (20,30) → 2%,5%; sub from (20,100) → 2%,16.7%
  expect(message.moves).toEqual([{ id: 'h', path: 'copy/headline', x: 12, y: 15, w: 20 }, { id: 'h', path: 'copy/sub', x: 12, y: 26.7, w: 10 }]);
  expect(posted.some(m => m.type === 'pagosya:boceto-free' || m.type === 'pagosya:boceto-node-move')).toBe(false);
});
```

(jsdom has no layout, so `offsetParent` is null and the holder is the section, the same fallback the single drag uses.)

- [ ] **Step 2: Failing Studio tests**

```ts
it('group move: free-many places every pick, saves once, keeps the selection and undoes in one step', async () => {
  const panel = await mount();
  panel.remoteSelectMany([{ id: 'intro', path: 'copy/sub' }, { id: 'intro', path: 'copy/headline' }], false);
  panel.remoteFreeMany([{ id: 'intro', path: 'copy/sub', x: 10, y: 10 }, { id: 'intro', path: 'copy/headline', x: 30, y: 40, w: 25 }]);
  expect(lastSelection().others).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch).toHaveBeenCalledTimes(1);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[0].free).toEqual({ 'copy/sub': { x: 10, y: 10 }, 'copy/headline': { x: 30, y: 40, w: 25 } });
  panel.remoteKey('undo');
  expect(lastLook().blocks.intro.free).toEqual({});
});

it('group move: selected blocks dragged by the handle move together', async () => {
  const panel = await mount();
  panel.remoteReorderMany(['intro', 'cat'], 1);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['fin', 'intro', 'cat']);
});
```

- [ ] **Step 3: Run both test files** → FAIL.

- [ ] **Step 4: Canvas implementation**

```js
  /** The picked parts (not whole blocks), when a press lands on one of them and there are several picks. */
  function groupAt(target) {
    if (!selection.others || !selection.others.length) return null;
    var nodes = [selection].concat(selection.others).map(function (pick) {
      var pickSection = sectionById(pick.id);
      return pickSection && pick.path ? nodeAt(pickSection, pick.path) : null;
    }).filter(Boolean);
    return nodes.length > 1 && nodes.some(function (node) { return node.contains(target); }) ? nodes : null;
  }
  /** Several picks follow the pointer together: parts still in their column come out first (all of them, then the boxes
   * are measured, as a single detach does); each spot is a percentage of its own box. One message on drop. */
  function startGroupDrag(nodes, down, now) {
    var parts = nodes.filter(function (node) { return canFree(sectionOf(node), node); });
    if (!parts.length) return;
    var rects = parts.map(function (node) { return node.getBoundingClientRect(); });
    var detached = parts.map(function (node) { return !isFree(node); });
    parts.forEach(function (node, i) { if (detached[i]) node.setAttribute('data-skb-free', 'on'); });
    var pct = function (value, size) { return size ? (value / size) * 100 : 0; };
    var items = parts.map(function (node, i) {
      var box = (node.offsetParent || sectionOf(node)).getBoundingClientRect();
      var item = { node: node, box: box, detached: detached[i],
        fromX: detached[i] ? pct(rects[i].left - box.left, box.width) : (freeVar(node, '--skb-fx') || 0),
        fromY: detached[i] ? pct(rects[i].top - box.top, box.height) : (freeVar(node, '--skb-fy') || 0),
        width: detached[i] ? clampPct(pct(rects[i].width, box.width), 5) : freeVar(node, '--skb-fw') };
      if (detached[i]) node.style.setProperty('--skb-fw', String(item.width));
      item.x = item.fromX; item.y = item.fromY;
      return item;
    });
    elDragging = parts[0];
    clearBoxes();
    var move = function (ev) {
      items.forEach(function (item) {
        item.x = clampPct(item.fromX + pct(ev.clientX - down.clientX, item.box.width), 0);
        item.y = clampPct(item.fromY + pct(ev.clientY - down.clientY, item.box.height), 0);
        item.node.style.setProperty('--skb-fx', String(item.x));
        item.node.style.setProperty('--skb-fy', String(item.y));
      });
    };
    var stop = function () {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', cancel, true);
      elDragging = null;
    };
    var finish = function () {
      stop();
      parent.postMessage({ type: 'pagosya:boceto-free-many', moves: items.map(function (item) {
        var spot = { id: sectionOf(item.node).getAttribute('data-skb'), path: pathOf(item.node), x: item.x, y: item.y };
        if (item.width !== null) spot.w = item.width;
        return spot;
      }) }, '*');
      drawOverlay();
    };
    var cancel = function () {
      stop();
      items.forEach(function (item) {
        if (item.detached) { item.node.removeAttribute('data-skb-free'); FREE_VARS.forEach(function (name) { item.node.style.removeProperty(name); }); }
        else { item.node.style.setProperty('--skb-fx', String(item.fromX)); item.node.style.setProperty('--skb-fy', String(item.fromY)); }
      });
      drawOverlay();
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', cancel, true);
    if (now) move(now);
  }
```

In the pointerdown `arm`, inside `if (section) {`, before the sticker check:

```js
        var group = groupAt(event.target);
        if (group) { startGroupDrag(group, event, ev); return; }
```

Selected blocks by the handle. Declare `var draggingGroup = null;` next to `dragging`. In `startDrag`, after
`dragging = section;`:

```js
    var picked = [selection].concat(selection.others || []).filter(function (pick) { return pick.id && !pick.path; }).map(function (pick) { return sectionById(pick.id); }).filter(Boolean);
    draggingGroup = picked.length > 1 && picked.indexOf(section) !== -1 ? sections().filter(function (s) { return picked.indexOf(s) !== -1; }) : null;
```

In `dropTarget`, the filter becomes
`section !== dragging && !(draggingGroup && draggingGroup.indexOf(section) !== -1)`. In `finish`, replace the
`if (target && target.section !== section) { … }` block:

```js
      if (target && target.section !== section) {
        if (draggingGroup) {
          var run = draggingGroup;
          if (target.before) run.forEach(function (s) { target.section.before(s); });
          else run.slice().reverse().forEach(function (s) { target.section.after(s); });
          var all = sections(), rest = all.filter(function (s) { return run.indexOf(s) === -1; });
          parent.postMessage({ type: 'pagosya:boceto-reorder-many', ids: run.map(function (s) { return s.getAttribute('data-skb'); }), index: rest.indexOf(all[all.indexOf(run[0]) - 1]) + 1 }, '*');
        } else {
          if (target.before) target.section.before(section); else target.section.after(section);
          parent.postMessage({ type: 'pagosya:boceto-reorder', id: section.getAttribute('data-skb'), index: sections().indexOf(section) }, '*');
        }
        if (section.scrollIntoView) section.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      draggingGroup = null;
```

(`rest.indexOf(undefined)` is −1 when the run is first, giving index 0.)

- [ ] **Step 5: Studio implementation**

```ts
  const FULL_NOTE = `Este bloque ya tiene ${SKETCH_FREE_MAX} partes sueltas. Devuelve una a su lugar para soltar otra.`;
  /** One free spot from the canvas, with the API repair's rules. 'full' when the block already has 30 spots. */
  function placeFree(block: any, path: string, x: number, y: number, w?: number): 'ok' | 'full' | 'no' {
    const pos = sketchFreePos({ x, y, ...(w !== undefined ? { w } : {}) });
    if (!block || !pos) return 'no';
    if (path.startsWith('extras/')) {
      const extra = (block.extras || []).find((item: any) => `extras/${item.id}` === path);
      if (!extra) return 'no';
      Object.assign(extra, { x: pos.x, y: pos.y }, pos.w !== undefined ? { w: pos.w } : {});
      return 'ok';
    }
    const before = block.free?.[path];
    const next = { ...pos, ...(pos.w === undefined && before?.w !== undefined ? { w: before.w } : {}), ...(before?.r ? { r: before.r } : {}) };
    if (sketchSetFree(block, path, next)) return 'ok';
    return !before && Object.keys(block.free || {}).length >= SKETCH_FREE_MAX ? 'full' : 'no';
  }
```

`remoteFree` and the two new methods:

```ts
    remoteFree(id: string, path: string, x: number, y: number, w?: number) {
      if (!sketch) return;
      // The canvas already moved the part: a drop that cannot be kept puts it back where the saved boceto has it.
      const refuse = (why = '') => { if (why) { note = why; draw(); } applyLive(); };
      if (opts?.locked) return refuse();
      const result = placeFree(blockOf(id), path, x, y, w);
      if (result !== 'ok') return refuse(result === 'full' ? FULL_NOTE : '');
      forgottenBlock = null; focusNode(id, path); picker = null;
      schedule(); draw();
    },
    /** Several picks dropped together: one save, one undo step; the selection stays. */
    remoteFreeMany(moves: Array<{ id: string; path: string; x: number; y: number; w?: number }>) {
      if (!sketch) return;
      if (opts?.locked) { applyLive(); return; }
      const results = moves.slice(0, 40).map(move => placeFree(blockOf(move.id), move.path, move.x, move.y, move.w));
      if (results.includes('full')) note = FULL_NOTE;
      if (results.some(result => result !== 'ok')) applyLive();
      if (results.includes('ok')) schedule();
      draw();
    },
    remoteReorderMany(ids: string[], index: number) {
      if (!sketch || opts?.locked) return;
      const set = new Set(ids);
      const moving = sketch.blocks.filter(block => set.has(block.id));
      if (moving.length < 2 || moving.length !== set.size) return;
      const rest = sketch.blocks.filter(block => !set.has(block.id));
      rest.splice(Math.max(0, Math.min(index, rest.length)), 0, ...moving);
      sketch.blocks = rest;
      // The canvas already moved them: no reload.
      schedule(); draw();
    },
```

Routing in `source-studio.ts`:

```ts
      if (event.data.type === 'pagosya:boceto-free-many' && Array.isArray(event.data.moves) && event.data.moves.length <= 40) bocetoPanel.remoteFreeMany(event.data.moves.filter((move: any) => move && typeof move.id === 'string' && move.id.length <= 40 && typeof move.path === 'string' && /^[a-zA-Z0-9]{1,20}(\/[a-zA-Z0-9]{1,20}){0,4}$/.test(move.path) && Number.isFinite(move.x) && Number.isFinite(move.y) && (move.w === undefined || Number.isFinite(move.w))).map((move: any) => ({ id: move.id, path: move.path, x: move.x, y: move.y, ...(move.w !== undefined ? { w: move.w } : {}) })));
      if (event.data.type === 'pagosya:boceto-reorder-many' && Array.isArray(event.data.ids) && event.data.ids.length <= 20 && event.data.ids.every((id: unknown) => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id)) && Number.isInteger(event.data.index)) bocetoPanel.remoteReorderMany(event.data.ids, event.data.index);
```

- [ ] **Step 6: Real-browser group drag** — append to `sketch-canvas-layout.spec.ts`:

```ts
it('a title and a button dragged together keep their distance after both come out', async () => {
  const result = await openPage([
    { id: 'h', type: 'hero', headline: 'Algo dulce para mirar despacio', sub: 'Repostería de verdad', cta: 'Ver productos', bg: 'paper', size: 'l' },
  ], async page => {
    await page.addScriptTag({ content: bocetoScript });
    await page.evaluate(() => {
      (window as any).posted = [];
      window.addEventListener('message', event => { if (event.data?.type === 'pagosya:boceto-free-many') (window as any).posted.push(event.data); });
      window.postMessage({ type: 'pagosya:boceto-mode', on: true }, '*');
      window.postMessage({ type: 'pagosya:boceto-apply', selection: { id: 'h', path: 'copy/headline', label: '', others: [{ id: 'h', path: 'copy/actions/cta' }] }, blocks: { h: { movable: [], freeable: ['copy/headline', 'copy/actions/cta'], free: {} } } }, '*');
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-boceto-on'));
    const measure = () => page.evaluate(() => ['[data-skb-el="headline"]', '[data-skb-node="cta"]'].map(selector => { const r = document.querySelector(`[data-skb="h"] ${selector}`)!.getBoundingClientRect(); return { left: r.left, top: r.top }; }));
    const before = await measure();
    const press = { x: before[0].left + 30, y: before[0].top + 10 };
    await page.mouse.move(press.x, press.y); await page.mouse.down();
    for (let step = 1; step <= 10; step++) await page.mouse.move(press.x + 30 * step, press.y + 4 * step);
    await page.mouse.up();
    await page.waitForFunction(() => (window as any).posted.length > 0, undefined, { timeout: 3000 }).catch(() => undefined);
    return { before, after: await measure(), posted: await page.evaluate(() => (window as any).posted) };
  });
  expect(result.posted).toHaveLength(1);
  expect(result.posted[0].moves.map((move: any) => move.path)).toEqual(['copy/headline', 'copy/actions/cta']);
  for (const i of [0, 1]) {
    expect(Math.abs(result.after[i].left - result.before[i].left - 300)).toBeLessThan(3);
    expect(Math.abs(result.after[i].top - result.before[i].top - 40)).toBeLessThan(3);
  }
});
```

If the hero stamps its main button under another node key, read `assembleSketch(...)` output for the element at
`copy/actions/cta` and use its `data-skb-node`.

- [ ] **Step 7: Run all three suites** (commands as Task 3 Step 6, plus `npx vitest run` in merchant-studio) → PASS.
- [ ] **Step 8: Commit**

```bash
git commit -m "feat(boceto): several picks drag together; selected blocks move as a run" -- packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts apps/api/src/storefront-source/sketch/sketch-canvas-layout.spec.ts
```

---

## Stage 3 — copy, paste, duplicate

### Task 8: Pure clipboard

**Files:**
- Create: `apps/merchant-studio/src/boceto-clipboard.ts`, `apps/merchant-studio/src/boceto-clipboard.test.ts`

**Interfaces:**
- Consumes: Task 1 `BocetoPick`; shared `sketchListPath`, `sketchFreePos`, `SKETCH_EXTRA_MAX`, `SketchExtra`.
- Produces: `type ClipItem`, `copyPicks(blocks: any[], picks: BocetoPick[]): ClipItem[]`,
  `pasteClip(sketch: { blocks: any[]; account?: any }, clip: ClipItem[], target: { blockId?: string; at?: { x: number; y: number } }): { picks: BocetoPick[]; skipped: number }`,
  `duplicatePicks(sketch, picks: BocetoPick[]): { picks: BocetoPick[]; skipped: number }`. `pasteClip` and
  `duplicatePicks` mutate `sketch`.

- [ ] **Step 1: Failing tests**

```ts
import { expect, it } from 'vitest';
import { copyPicks, duplicatePicks, pasteClip } from './boceto-clipboard';

const page = () => ({
  blocks: [
    { id: 'h', type: 'hero', headline: 'Algo dulce', sub: '', cta: 'Ver', href: 'index.html#skb-catalogo', photo: 'assets/a.jpg', free: { 'copy/headline': { x: 10, y: 20 } }, extras: [{ id: 'eab1', kind: 'emoji', value: '🍪', x: 50, y: 50, w: 8 }] },
    { id: 'st', type: 'steps', title: 'T', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }] },
    { id: 'st2', type: 'steps', title: 'U', items: [{ icon: 'c', title: 'Tres', text: '' }, { icon: 'd', title: 'Cuatro', text: '' }, { icon: 'e', title: 'Cinco', text: '' }, { icon: 'f', title: 'Seis', text: '' }] },
    { id: 'fin', type: 'footer', tagline: 'x' },
  ] as any[],
});

it('copies blocks, list items and extras as they are, and fixed parts as inserted elements', () => {
  const sketch = page();
  const clip = copyPicks(sketch.blocks, [{ id: 'st', path: '' }, { id: 'st', path: 'items/1' }, { id: 'h', path: 'extras/eab1' }, { id: 'h', path: 'copy/headline' }, { id: 'h', path: 'copy/actions/cta' }, { id: 'h', path: 'media/photo' }, { id: 'h', path: 'copy/sub' }, { id: 'h', path: 'copy' }]);
  expect(clip.map(item => item.kind)).toEqual(['block', 'item', 'extra', 'extra', 'extra', 'extra']);
  expect(clip[1]).toEqual({ kind: 'item', type: 'steps', field: 'items', item: { icon: 'b', title: 'Dos', text: '' } });
  expect(clip.slice(3).map(item => item.kind === 'extra' && [item.extra.kind, item.extra.value, item.extra.x, item.extra.y, item.extra.href])).toEqual([
    ['text', 'Algo dulce', 10, 20, undefined], ['button', 'Ver', 45, 40, 'index.html#skb-catalogo'], ['photo', 'assets/a.jpg', 45, 40, undefined],
  ]);
  sketch.blocks[1].items[1].title = 'cambiado';
  expect((clip[1] as any).item.title).toBe('Dos'); // deep copies
});

it('pastes into the target block: blocks after it (never after the footer), items into the same list, extras offset', () => {
  const sketch = page();
  const clip = copyPicks(sketch.blocks, [{ id: 'st', path: '' }, { id: 'st', path: 'items/0' }, { id: 'h', path: 'extras/eab1' }]);
  const result = pasteClip(sketch, clip, { blockId: 'st' });
  expect(sketch.blocks.map(block => block.id)).toEqual(['h', 'st', 'st-copia', 'st2', 'fin']);
  expect(sketch.blocks[1].items.map((item: any) => item.title)).toEqual(['Uno', 'Dos', 'Uno']);
  expect(sketch.blocks[1].extras).toEqual([{ id: 'ec001', kind: 'emoji', value: '🍪', x: 53, y: 53, w: 8 }]);
  expect(result).toEqual({ picks: [{ id: 'st-copia', path: '' }, { id: 'st', path: 'items/2' }, { id: 'st', path: 'extras/ec001' }], skipped: 0 });
  pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: '' }]), { blockId: 'fin' });
  expect(sketch.blocks.at(-1)!.id).toBe('fin');
  expect(sketch.blocks.map(block => block.id)).toContain('st-copia-2');
});

it('"Pegar aquí" puts extras at the clicked spot, keeping their distances; what does not fit is skipped and counted', () => {
  const sketch = page();
  const two = [...copyPicks(sketch.blocks, [{ id: 'h', path: 'extras/eab1' }]), ...copyPicks(sketch.blocks, [{ id: 'h', path: 'copy/headline' }])];
  pasteClip(sketch, two, { blockId: 'st', at: { x: 80, y: 10 } });
  expect(sketch.blocks[1].extras.map((extra: any) => [extra.x, extra.y])).toEqual([[80, 10], [40, 0]]);
  // the second steps list is full (4): another steps item goes nowhere
  expect(pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: 'items/0' }]), { blockId: 'st2' })).toEqual({ picks: [], skipped: 1 });
  // a list item never lands in another kind of block
  expect(pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: 'items/0' }]), { blockId: 'h' }).skipped).toBe(1);
  const full = page(); full.blocks[0].extras = Array.from({ length: 12 }, (_, i) => ({ id: `ex${String(i).padStart(2, '0')}`, kind: 'emoji', value: '✨', x: 1, y: 1 }));
  expect(pasteClip(full, two, { blockId: 'h' })).toEqual({ picks: [], skipped: 2 });
  const crowded = { blocks: Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, type: 'faq', title: 'Q', items: [] })) as any[] };
  expect(pasteClip(crowded, copyPicks(crowded.blocks, [{ id: 'b0', path: '' }]), { blockId: 'b0' }).skipped).toBe(1);
});

it('duplicate copies each pick into its own block, in place', () => {
  const sketch = page();
  const result = duplicatePicks(sketch, [{ id: 'h', path: 'extras/eab1' }, { id: 'st', path: 'items/1' }, { id: 'st2', path: '' }]);
  expect(sketch.blocks[0].extras.map((extra: any) => [extra.id, extra.x])).toEqual([['eab1', 50], ['ec001', 53]]);
  expect(sketch.blocks[1].items.map((item: any) => item.title)).toEqual(['Uno', 'Dos', 'Dos']);
  expect(sketch.blocks.map(block => block.id)).toEqual(['h', 'st', 'st2', 'st2-copia', 'fin']);
  expect(result.picks).toHaveLength(3);
});
```

- [ ] **Step 2: Run** `npx vitest run src/boceto-clipboard.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import { sketchFreePos, sketchListPath, SKETCH_EXTRA_MAX, type SketchExtra } from '@pagosya/shared-types';
import type { BocetoPick } from './boceto-selection';

/** The Boceto's own clipboard (this session, not the system one). Fixed parts copy as inserted elements, because a
 * block holds one title, one subtitle, one main button. */
export type ClipItem = { kind: 'block'; block: any } | { kind: 'item'; type: string; field: string; item: unknown } | { kind: 'extra'; extra: SketchExtra };

const TEXT_PARTS = ['headline', 'title', 'sub', 'body', 'badge', 'note', 'trust', 'kicker', 'caption', 'tag', 'sticker', 'left', 'right', 'lead', 'seeAll', 'rating'];
/** The list limits repair keeps (and the inspector's "+ Añadir" stops at). */
const LIST_LIMIT: Record<string, number> = { 'steps.items': 4, 'collections.items': 4, 'faq.items': 6, 'reviews.quotes': 6, 'gallery.photos': 6, 'story.paragraphs': 6, 'split.pills': 6, 'split.stats': 4, 'split.boxes': 3 };
const LIST_FIELDS = Object.keys(LIST_LIMIT).map(key => key.split('.') as [string, string]);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function listItem(block: any, path: string): { field: string; index: number } | null {
  for (const [type, field] of LIST_FIELDS) {
    if (type !== block.type) continue;
    const listPath = sketchListPath(type, field);
    const match = listPath ? new RegExp(`^${listPath}/(\\d+)$`).exec(path) : null;
    if (match && Array.isArray(block[field]) && Number(match[1]) < block[field].length) return { field, index: Number(match[1]) };
  }
  return null;
}

function partAsExtra(block: any, path: string): SketchExtra | null {
  const key = path.split('/').pop()!;
  const spot = block.free?.[path];
  const at = { x: spot?.x ?? 45, y: spot?.y ?? 40 };
  if (TEXT_PARTS.includes(key)) {
    const value = String((key === 'rating' ? block.ratingValue : block[key]) ?? '').trim();
    return value ? { id: '', kind: 'text', value: value.slice(0, 120), ...at } : null;
  }
  if (key === 'cta' || key === 'cta2') {
    const value = String(block[key] ?? '').trim();
    return value ? { id: '', kind: 'button', value: value.slice(0, 40), href: typeof block.href === 'string' && block.href ? block.href : 'checkout.html', ...at } : null;
  }
  if (path === 'media/photo' && block.photo) return { id: '', kind: 'photo', value: block.photo, w: 22, ...at };
  return null;
}

export function copyPicks(blocks: any[], picks: BocetoPick[]): ClipItem[] {
  const out: ClipItem[] = [];
  for (const pick of picks) {
    const block = blocks.find(item => item.id === pick.id);
    if (!block) continue;
    if (!pick.path) { if (block.type !== 'account' && block.type !== 'footer') out.push({ kind: 'block', block: clone(block) }); continue; }
    if (pick.path.startsWith('extras/')) {
      const extra = (block.extras || []).find((item: any) => `extras/${item.id}` === pick.path);
      if (extra) out.push({ kind: 'extra', extra: clone(extra) });
      continue;
    }
    const list = listItem(block, pick.path);
    if (list) { out.push({ kind: 'item', type: block.type, field: list.field, item: clone(block[list.field][list.index]) }); continue; }
    const extra = partAsExtra(block, pick.path);
    if (extra) out.push({ kind: 'extra', extra });
  }
  return out;
}

function freshBlockId(blocks: any[], base: string) {
  let id = `${base}-copia`.slice(0, 32), n = 2;
  while (blocks.some(block => block.id === id)) id = `${base}-copia-${n++}`.slice(0, 32);
  return id;
}
function freshExtraId(block: any) {
  let n = 1, id = '';
  do id = `ec${String(n++).padStart(3, '0')}`; while ((block.extras || []).some((extra: any) => extra.id === id));
  return id;
}

export function pasteClip(sketch: { blocks: any[]; account?: any }, clip: ClipItem[], target: { blockId?: string; at?: { x: number; y: number } }) {
  const all = [...sketch.blocks, ...(sketch.account ? [sketch.account] : [])];
  const host = all.find(block => block.id === target.blockId) ?? sketch.blocks.filter(block => block.type !== 'footer').at(-1) ?? sketch.blocks[0];
  const picks: BocetoPick[] = [];
  let skipped = 0;
  let after = sketch.blocks.indexOf(host);
  const anchor = clip.find((item): item is Extract<ClipItem, { kind: 'extra' }> => item.kind === 'extra')?.extra;
  for (const item of clip) {
    if (item.kind === 'block') {
      if (sketch.blocks.length >= 20) { skipped++; continue; }
      const footer = sketch.blocks.findIndex(block => block.type === 'footer');
      let at = after === -1 ? sketch.blocks.length : after + 1;
      if (footer !== -1 && at > footer) at = footer;
      const id = freshBlockId(sketch.blocks, item.block.id);
      sketch.blocks.splice(at, 0, { ...clone(item.block), id });
      after = at; picks.push({ id, path: '' });
      continue;
    }
    if (!host) { skipped++; continue; }
    if (item.kind === 'item') {
      const limit = LIST_LIMIT[`${host.type}.${item.field}`];
      const list = host.type === item.type && Array.isArray(host[item.field]) ? host[item.field] : null;
      const listPath = sketchListPath(host.type, item.field);
      if (!list || !limit || !listPath || list.length >= limit) { skipped++; continue; }
      list.push(clone(item.item));
      picks.push({ id: host.id, path: `${listPath}/${list.length - 1}` });
      continue;
    }
    if (host.type === 'account' || (host.extras?.length ?? 0) >= SKETCH_EXTRA_MAX) { skipped++; continue; }
    const base = target.at && anchor ? { x: target.at.x + item.extra.x - anchor.x, y: target.at.y + item.extra.y - anchor.y } : { x: item.extra.x + 3, y: item.extra.y + 3 };
    const spot = sketchFreePos(base) ?? { x: 45, y: 40 };
    const id = freshExtraId(host);
    if (!Array.isArray(host.extras)) host.extras = [];
    host.extras.push({ ...clone(item.extra), id, x: spot.x, y: spot.y });
    picks.push({ id: host.id, path: `extras/${id}` });
  }
  return { picks, skipped };
}

export function duplicatePicks(sketch: { blocks: any[]; account?: any }, picks: BocetoPick[]) {
  const out: BocetoPick[] = [];
  let skipped = 0;
  for (const pick of picks) {
    const clip = copyPicks([...sketch.blocks, ...(sketch.account ? [sketch.account] : [])], [pick]);
    if (!clip.length) { skipped++; continue; }
    const result = pasteClip(sketch, clip, { blockId: pick.id });
    out.push(...result.picks); skipped += result.skipped;
  }
  return { picks: out, skipped };
}
```

Arithmetic the tests rely on: in "Pegar aquí" the headline text (10,20) lands at `80 + 10 − 50 = 40`,
`10 + 20 − 50 = −20 → 0` (`sketchFreePos` clamps). `{ ...clone(item.extra), id, x, y }` keeps `w`.

- [ ] **Step 4: Run** → PASS (4 tests).
- [ ] **Step 5: Commit**

```bash
git add apps/merchant-studio/src/boceto-clipboard.ts apps/merchant-studio/src/boceto-clipboard.test.ts
git commit -m "feat(boceto): copy, paste and duplicate rules for blocks, items, inserted elements and fixed parts" -- apps/merchant-studio/src/boceto-clipboard.ts apps/merchant-studio/src/boceto-clipboard.test.ts
```

### Task 9: Wire ⌘C / ⌘V / ⌘D, the menu and the group inspector

**Files:**
- Modify: `apps/merchant-studio/src/source-boceto.ts` (clip state, `copySelection`, `landPasted`, `pasteClipboard`,
  `duplicateSelection`, keydown, `remoteKey`, `menuItems`, `groupProps`)
- Modify: `packages/storefront-preview/src/source-preview-boceto-mode.js` (forward c/v/d)
- Modify: `apps/merchant-studio/src/source-studio.ts` (whitelist `copy`, `paste`, `duplicate`)
- Test: `source-boceto.test.ts` (update two Task 4 expectations, append), `source-preview-boceto.test.ts` (append)

**Interfaces:**
- Consumes: Task 8 `copyPicks`, `pasteClip`, `duplicatePicks`, `ClipItem`.
- Produces: `remoteKey(key: 'up' | 'down' | 'delete' | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate')`;
  canvas → Studio `pagosya:boceto-key { key: 'copy' | 'paste' | 'duplicate' }`.

- [ ] **Step 1: Failing tests** — in the Task 4 test "menu: right-click selects the part…" change `['Copiar', true]` →
  `['Copiar', false]` and `['Duplicar', true]` → `['Duplicar', false]`; in "menu: Giro acts on free parts…" the locked
  expectation becomes `['Copiar', 'Seleccionar bloque']`. Then append:

```ts
it('clipboard: ⌘C then ⌘V pastes the copy into the selected block and selects it; ⌘D duplicates; one step each', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/headline');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true }));
  panel.remoteSelect('cat', '');
  panel.remoteKey('paste');
  expect(lastSelection().path).toMatch(/^extras\/ec\d{3}$/);
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[1].extras).toEqual([{ id: 'ec001', kind: 'text', value: 'Algo dulce', x: 48, y: 43 }]);
  panel.remoteSelect('intro', '');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['intro', 'intro-copia', 'cat', 'fin']);
  panel.remoteKey('undo');
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks.map((block: any) => block.id)).toEqual(['intro', 'cat', 'fin']);
});

it('clipboard: "Pegar aquí" pastes where the menu opened; what does not fit is reported', async () => {
  const panel = await mount();
  panel.remoteSelect('intro', 'copy/sub');
  panel.remoteKey('copy');
  panel.remoteContext({ id: 'cat', path: '', x: 10, y: 10, fx: 70, fy: 20 });
  menuItem('Pegar aquí').click();
  await vi.advanceTimersByTimeAsync(1300);
  expect(putSketch.mock.calls.at(-1)![1].sketch.blocks[1].extras[0]).toMatchObject({ kind: 'text', value: 'sub', x: 70, y: 20 });
  getSketch.mockResolvedValueOnce({ revision: 9, sketch: { ...sketch(), blocks: [{ id: 'st', type: 'steps', title: 'T', items: [{ icon: 'a', title: 'Uno', text: '' }] }, ...sketch().blocks] }, photos: [], fonts: ['anton'] } as any);
  const other = await mount();
  other.remoteSelect('st', 'items/0'); other.remoteKey('copy');
  other.remoteSelect('intro', ''); other.remoteKey('paste');
  expect(host.querySelector('.bct-status')?.textContent).toContain('1 no cabe aquí');
});
```

Canvas (append):

```ts
it('⌘C, ⌘V and ⌘D on the board go to the Studio, never while typing in place', async () => {
  const { w, posted, send } = load();
  send({ type: 'pagosya:boceto-mode', on: true }); await tick();
  for (const key of ['c', 'v', 'd']) w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true }));
  await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key').map(m => m.key)).toEqual(['copy', 'paste', 'duplicate']);
  w.document.querySelector('[data-skb-field="headline"]').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true })); await tick();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, cancelable: true })); await tick();
  expect(posted.filter(m => m.type === 'pagosya:boceto-key')).toHaveLength(3);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement — panel**

```ts
import { copyPicks, duplicatePicks, pasteClip, type ClipItem } from './boceto-clipboard';
// state, next to `others`:
  let clip: ClipItem[] = [];
// helpers, near removeSelection:
  function copySelection() {
    const items = copyPicks(allBlocks(), picks());
    if (!items.length) return;
    clip = items;
    status(items.length === 1 ? 'Copiado' : `${items.length} copiados`);
  }
  function landPasted(result: { picks: BocetoPick[]; skipped: number }) {
    if (result.picks.length) setPicks(result.picks);
    note = result.skipped ? `${result.skipped} no ${result.skipped === 1 ? 'cabe' : 'caben'} aquí.` : '';
    if (result.picks.length) scheduleStructural();
    draw();
  }
  function pasteClipboard(at: { blockId?: string; x?: number; y?: number } = {}) {
    if (!sketch || opts?.locked || !clip.length) return;
    landPasted(pasteClip(sketch, clip, { blockId: at.blockId ?? selected, ...(at.x !== undefined && at.y !== undefined ? { at: { x: at.x, y: at.y } } : {}) }));
  }
  function duplicateSelection() {
    if (!sketch || opts?.locked || !picks().length) return;
    landPasted(duplicatePicks(sketch, picks()));
  }
```

Menu items (replace the three disabled entries in `menuItems`):

```ts
      { label: 'Copiar', shortcut: '⌘C', disabled: !copyPicks(allBlocks(), list).length, run: () => copySelection() },
      { label: 'Pegar aquí', shortcut: '⌘V', disabled: locked || !clip.length, run: () => pasteClipboard({ blockId: target?.id, x: at.fx, y: at.fy }) },
      { label: 'Duplicar', shortcut: '⌘D', disabled: locked || !copyPicks(allBlocks(), list).length, run: () => duplicateSelection() },
```

Keydown — the top of the Studio document handler becomes (copy works while locked; everything else as before):

```ts
  document.addEventListener('keydown', event => {
    if (!sketch || !opts || !host?.isConnected) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;
    const key = event.key.toLowerCase(), command = (event.metaKey || event.ctrlKey) && !event.altKey;
    // Text the merchant highlighted in the panel copies as text, as usual.
    if (command && !event.shiftKey && key === 'c' && !document.getSelection()?.toString() && picks().length) { event.preventDefault(); copySelection(); return; }
    if (opts.locked) return;
    if (command && (key === 'z' || (key === 'y' && !event.shiftKey))) { event.preventDefault(); stepBack(key === 'y' || event.shiftKey); return; }
    if (command && !event.shiftKey && key === 'v' && clip.length) { event.preventDefault(); pasteClipboard(); return; }
    if (command && !event.shiftKey && key === 'd' && picks().length) { event.preventDefault(); duplicateSelection(); return; }
    if (event.key === 'Escape' && others.length) { event.preventDefault(); setPicks([]); draw(); return; }
    if (!selected) return;
    // …existing Delete / ⌥↑ / ⌥↓ handling unchanged…
```

`remoteKey`:

```ts
    remoteKey(key: 'up' | 'down' | 'delete' | 'undo' | 'redo' | 'copy' | 'paste' | 'duplicate') {
      if (key === 'copy') { copySelection(); return; }
      if (key === 'undo' || key === 'redo') { stepBack(key === 'redo'); return; }
      if (key === 'paste') { pasteClipboard(); return; }
      if (key === 'duplicate') { duplicateSelection(); return; }
      if (!sketch || !selected || opts?.locked) return;
      if (key === 'delete') removeSelection(); else moveSelection(key === 'up' ? -1 : 1);
    },
```

`groupProps` — before the Eliminar button:

```ts
    const dup = el('button', { type: 'button', className: 'bct-chip', text: 'Duplicar', disabled: !copyPicks(allBlocks(), list).length });
    dup.dataset.bocetoGroupDuplicate = '';
    dup.addEventListener('click', () => duplicateSelection());
    children.push(row('Copias', dup));
```

- [ ] **Step 4: Implement — canvas and routing**

Canvas keydown (the block with the Ctrl+Z line), add right after it:

```js
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (key === 'c' || key === 'v' || key === 'd')) { event.preventDefault(); parent.postMessage({ type: 'pagosya:boceto-key', key: key === 'c' ? 'copy' : key === 'v' ? 'paste' : 'duplicate' }, '*'); return; }
```

`source-studio.ts`: `['up', 'down', 'delete', 'undo', 'redo', 'copy', 'paste', 'duplicate'].includes(event.data.key)`.

- [ ] **Step 5: Run everything** (Task 3 Step 6 commands, plus `npx vitest run` in merchant-studio) → PASS.
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(boceto): ⌘C, ⌘V and ⌘D on the board, in the menu and for a group" -- apps/merchant-studio/src/source-boceto.ts apps/merchant-studio/src/source-boceto.test.ts apps/merchant-studio/src/source-studio.ts packages/storefront-preview/src/source-preview-boceto-mode.js packages/storefront-preview/src/source-preview-boceto.test.ts
```

### Task 10: Ship to the owner's app and check it live

- [ ] **Step 1: Full suites**

```bash
cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run && npx tsc --noEmit -p tsconfig.json
cd ../../packages/storefront-preview && npx vitest run
cd ../../apps/api && npx jest src/storefront-source/sketch
```

Expected: all PASS. (Known and unrelated: `source-generation.service.spec` "steers planning away from recent
fingerprints" already fails on the base.)

- [ ] **Step 2: Rebuild the embedded Studio** — `cd apps/merchant-dashboard && pnpm run build:studio`; confirm the API on
  :3001 is the watcher's current child (`lsof -tiTCP:3001 -sTCP:LISTEN | xargs ps -o lstart,command -p`).
- [ ] **Step 3: Live check with the owner** (hard reload ⌘⇧R): box two paragraphs → two outlines and "2 elementos";
  drag one → both move; right-click → the Studio menu (no browser menu); ⌘C/⌘V a title into another block; ⌘D a block;
  Supr on two items; Ctrl+Z after each. Chrome automation clicks do not reach the nested board (see the free-layer
  memory); script a check by loading the preview `srcdoc` into a same-origin iframe if needed.
- [ ] **Step 4: Update memory** — add `project_boceto_selection.md` (what shipped, any gap found live) and its line in
  `MEMORY.md`.
