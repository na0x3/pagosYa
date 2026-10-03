# Boceto selection box, group actions and right-click menu — design (2026-10-03)

Status: approved by the owner in conversation 2026-10-03, after a Figma screenshot (a frame selected, Figma's own
right-click menu). Builds on the free layer (`2026-10-03-boceto-free-layer-design.md`) and the Ctrl+Z history.

## Intent

What the owner said: "every time I try to drag with the mouse and select like 2 paragraphs or a block it just tries to
drag between pages, and [it] should [show the] app's own options when right click."

Decisions made with the owner:
1. **Dragging from empty space draws a selection box** (Figma marquee). It no longer reorders sections; sections move
   with the hover handle "⠿ Mover", ⌥↑/⌥↓ or Capas. Pressing on a part and dragging still moves that part.
2. **A selection can hold several things**, and all four group actions are wanted: move together, delete at once,
   duplicate / copy-paste, change style together.
3. **Copying a block's own fixed part** (title, subtitle, main button, photo…) pastes it as an inserted element with the
   same words (or photo), free to move in that block or another.
4. **The right-click menu is the Studio's**, drawn by the Studio over the board, never the browser's.

Success: on the board, dragging across two paragraphs selects both (two blue boxes, both highlighted in Capas); dragging
one moves both; Supr removes both; ⌘C/⌘V pastes copies; right-clicking anything opens the Studio menu with the actions
that apply and the rest greyed out; every group action is one Ctrl+Z step.

## Selection model

- The Studio keeps the primary selection (`selected`, `selectedPath`, as today) plus `others: Array<{ id, path }>` (the
  rest of a multi-selection, in pick order, at most 40). `path: ''` is a whole block. The primary is the last item
  picked; the inspector and the chat chip follow it as today.
- `SelectionPayload` gains `others?: Array<{ id: string; path: string }>`; the canvas draws a selected box for each.
- Clicking (drill-down as today) replaces the selection. **Shift+click** adds the clicked node (the same drill-down
  target) or removes it if already selected. **Esc** with several selected clears to nothing.
- Capas marks every selected node (`is-selected`) and Shift+click on a Capas row toggles it too.
- Nested picks are normalised: selecting a node drops any selected node inside it, and selecting a node inside a selected
  one replaces the outer one.
- Any structural change that removes a selected node drops it from the selection (the same rule as today's
  `selectedPath` reset after undo).

## Selection box (canvas script)

- A press on a section where `dragCandidate` finds nothing to move (empty space, a column background, padding) arms a
  box after 6px of travel (the same threshold as today). The box is a fixed, light-blue rectangle drawn by the canvas.
- On release:
  - **Box inside one section:** pick the *maximal* selectable nodes fully inside the box (a node is skipped when its
    container is fully inside too, so a whole column picks the column). Covering the whole section picks the block.
    Nothing fully inside → nothing selected.
  - **Box touching two or more sections:** pick every section it touches (whole blocks).
  - Shift held at release adds to the current selection instead of replacing it.
- The canvas posts `pagosya:boceto-select-many { items: Array<{ id, path }>, add: boolean }` (paths validated with the
  existing `PATH` pattern, at most 40). The Studio normalises (above) and draws.
- The section-reorder drag now starts only from the hover handle. Auto-scroll while boxing near the viewport edges, as
  the section drag does today.

## Right-click menu (Studio)

- The canvas swallows `contextmenu` on the board and posts `pagosya:boceto-context { id, path, x, y }`: the drill-down
  target under the pointer (or `''` on a section's empty space) and the pointer in board-page coordinates. The Studio
  converts to screen coordinates with the board's zoom and pan (the same maths as `bocetoRevealY`).
- If the right-clicked node is not in the selection, it becomes the whole selection first (Figma).
- The Studio draws the menu (`.bct-menu`, fixed, kept inside the window, closes on Esc, outside click, scroll or
  wheel). Items, with shortcuts on the right; an item that cannot apply to the current selection is greyed:
  - **Copiar** ⌘C · **Pegar aquí** ⌘V · **Duplicar** ⌘D · **Eliminar** ⌫
  - **Subir** ⌥↑ · **Bajar** ⌥↓ · **Seleccionar bloque** (single part selected)
  - **Volver a su lugar** (any selected free part) · **Giro ▸** 0° / −8° / 8° / 15° (free parts and inserted elements)
  - **Insertar ▸** Emoji · Texto · Botón · Foto · Ícono — the new element lands where the menu was opened (in
    percentages of that block's section, clamped like a drop), not centred
  - **Deshacer** ⌘Z · **Rehacer** ⇧⌘Z
- The menu also opens on the Capas rows (right-click a row), without "Pegar aquí" coordinates (pastes as for ⌘V).
- Locked (YAPI working): only Copiar and Seleccionar bloque stay enabled.

## Group actions (Studio; one `schedule` each, so one Ctrl+Z step and one save)

- **Move together.** Grabbing any selected item when several are selected starts a group drag on the canvas:
  - parts in the same or other sections all follow the pointer by the same pixel distance; each converts that distance to
    percentages of its own positioning box. In-flow freeable parts detach first (all at once, then the boxes are
    measured, exactly as the single detach does); non-freeable parts (columns, the main photo) stay put; extras and
    already-free parts move from their spot.
  - the drop posts one `pagosya:boceto-free-many { moves: Array<{ id, path, x, y, w? }> }`; the Studio applies each with
    the `remoteFree` rules, re-applies live if any is refused, and saves once.
  - whole blocks in the selection: dragging the hover handle of one selected block moves all selected blocks together,
    keeping their relative order, to the drop spot (`pagosya:boceto-reorder-many { ids, index }`).
- **Delete.** Supr / Eliminar removes every removable selected node (`sketchRemoveNode`, blocks with the existing block
  delete). Removals inside one list run from the highest index down so indices stay valid. Fixed parts that cannot be
  removed stay; the status says "N partes no se pueden eliminar" when any stayed. The selection clears.
- **Change style together** (inspector when several are selected, titled "N elementos"):
  - all whole blocks → **Fondo**, **Tamaño**, **Alineación** controls showing the shared value (none highlighted when
    they differ); a change applies to each block.
  - all free parts / inserted elements → **Giro**, **Volver a su lugar** (free parts), **Eliminar**.
  - mixed → **Eliminar** and **Duplicar** only, plus a hint.
- **Subir / Bajar** with several selected: whole blocks move as a group one place; parts are not group-moved (greyed).

## Copy, paste, duplicate

- The clipboard is the Studio's own (`clip: Array<ClipItem>` in memory for the session, not the system clipboard).
  `ClipItem` is one of:
  - `{ kind: 'block', block }` — a deep copy;
  - `{ kind: 'item', type, field, item }` — a list item (a step, review, paragraph, pill, photo…), with its block type
    and list field;
  - `{ kind: 'extra', extra }` — an inserted element;
  - fixed parts convert at copy time to `{ kind: 'extra', extra }`: text parts (headline, title, sub, body, badge, note,
    trust, kicker, caption, tag, left/right, lead, seeAll, rating) → a `text` extra with their words (≤ 120);
    `cta`/`cta2` → a `button` extra with the label and the block's `href` (or `checkout.html`); the main photo or a
    gallery/collection photo → a `photo` extra. A part with nothing copyable (a column, the form) is skipped.
- **Paste** (⌘V or "Pegar aquí") into the *target block*: the right-clicked block, else the primary selection's block,
  else after the last block. In order:
  - blocks → inserted after the target block with fresh ids (`<id>-copia`, as the ⧉ button does), never after the
    footer; the account page never receives blocks;
  - items → appended after the selected item (or at the end) of the target block's same list when the block type
    matches and the list has room (the list limits of repair); otherwise skipped;
  - extras → added to the target block with fresh ids at their copied spot offset by +3/+3 (or at the "Pegar aquí"
    point, keeping the group's relative offsets), stopping at `SKETCH_EXTRA_MAX`.
  - The pasted things become the selection. Skipped items are reported in the status ("2 no caben aquí").
- **Duplicate** (⌘D / Duplicar) = copy the selection and paste into each item's own block, in place (+3/+3 for free
  things); does not touch the clipboard.
- Keyboard: ⌘/Ctrl+C, V, D in the Studio document and forwarded from the board as `pagosya:boceto-key`
  (`copy` | `paste` | `duplicate`), never while typing or editing text in place.

## Error handling

Everything still goes through repair on save; a refused move re-applies live; a paste that does not fit is reported,
never half-applied silently. Unknown or invalid paths from the canvas are ignored. No browser menu appears on the board.

## Testing

- Canvas (jsdom): empty-space press-drag posts `boceto-select-many` with maximal contained nodes; a box across sections
  picks blocks; Shift adds; the section drag starts only from the handle; `contextmenu` is prevented and posts
  `boceto-context`; Shift+click toggles; group drag posts one `boceto-free-many`; keys forward copy/paste/duplicate.
- Real browser (`sketch-canvas-layout.spec.ts`): a box drawn over two story paragraphs selects exactly those two; a
  group drag of a title and a button keeps their relative offset after both detach.
- Studio (vitest): selection normalisation; Capas Shift+click; the menu's enabled/greyed items per selection and its
  actions; group delete (list indices, kept fixed parts and the status); group style for blocks; free-many saves once and
  undoes in one step; copy → paste for each clip kind, fixed-part conversion, list limits, extras limit, block ids,
  duplicate; locked state.

## Build order

1. Selection model, selection box, section drag only from the handle, right-click menu with single-selection actions.
2. Group move, group delete, group style.
3. Copy, paste, duplicate.

## Out of scope

Bring to front / send to back (needs a layering field); the system clipboard (pasting into other apps or between
browser tabs); moving parts into another block; grouping several parts into one.
