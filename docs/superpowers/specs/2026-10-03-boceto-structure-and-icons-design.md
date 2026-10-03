# Boceto: Figma-style structured selection + icons everywhere (2026-10-03)

Status: design approved by the owner in conversation 2026-10-03 ("yes"); this spec awaits the owner's review.
Builds on `2026-10-02-sketch-first-yapi-program.md` (sketch.json → deterministic assembler) and the benchmark
tag `benchmark/boceto-2026-10-03`.

## Why

The owner compared the Boceto editor with Figma on The Bake Lab file:

- **Selection has two levels only.** Clicking selects a whole block (e.g. Portada) and double-click edits one text.
  Figma selects meaningful nested groups — the copy column, the button row, one button — each outlined, with the
  children of the selection shown as dotted boxes. In the Boceto there is no way to grab "the copy column" and
  move everything in it together.
- **Icons are scarce.** Icons exist only in `steps` items, `split` boxes and account perks. YAPI is shown 24 example
  names; merchants can pick from 2,121 Lucide icons but only in those three places. Icons render as `<img>`, so
  they are always black, even on dark backgrounds.

## Decisions (made with the owner)

1. **Structured move, not free placement.** Dragging a group reorders it among its siblings and everything reflows
   (Figma auto layout). No free x/y canvas, as already decided in the sketch-first program: it does not survive
   phone widths. Stickers keep their existing free drag (they are decorative, positioned in %).
2. **Built-in groups only.** Every block type declares a fixed group tree. Merchants cannot create, ungroup or
   nest new groups (no ⌘G). The sketch stays a list of typed blocks that YAPI understands.
3. **Icons: all four directions, details delegated by the owner ("in the way you want"):**
   an icon on any text element, a new "Íconos" feature-row element, store-wide icon style, and a real catalog
   for YAPI. Icon style is done with **Lucide line weights + frames**, not a second icon library (two catalogs
   with different names make YAPI's choices unreliable). Filled/duotone icons are deferred.
4. **Build order: sub-project 1 (structure + selection) → sub-project 2 (icons).** Adding an icon to one button
   needs element-level selection first.

---

## Sub-project 1 — Structured selection

### Group trees

Each block renders its groups with `data-skb-group="<key>"` and its leaf elements with the existing
`data-skb-field` / `data-skb-el` / `data-skb-photo` attributes. A **path** names a node: `copy`, `copy/actions`,
`copy/actions/cta`. The trees (★ = can be reordered within its parent; ⇄ = the two top groups can swap sides):

| Block | Level 1 | Level 2 (inside the group) |
|---|---|---|
| hero | `copy` ⇄ `media` | copy: badge★, headline★, sub★, actions★ (cta, cta2 — swap), features★ (SP2), trust★, note★ · media: photo, caption, sticker |
| split | `copy` ⇄ `media` | copy: kicker, headline★, body★, pills★ (items★), stats★ (items★), boxes★ (items★), features★, actions★ · media: photo, tag, sticker |
| story | `copy` ⇄ `media` | copy: kicker, title★, paragraphs★ (each★), features★ |
| newsletter (split) | `copy` ⇄ `media` | copy: kicker, title★, note★, features★, form★ |
| newsletter (center) | `copy` | same as above |
| banner | `copy` | kicker, headline★, cta★ · sticker stays free |
| steps / collections / reviews / gallery / faq / catalog | `head`, `items` | head: kicker, title, note/seeAll/rating · items: each item★ (array order) |
| announce | `row` | left★, right★ |
| marquee, footer | — | block-level only (footer tagline still double-click editable) |
| account page | `intro` | kicker, title, lead, perks (items★) |

The trees are declared once in a shared module (`sketch-structure.ts`, API side, mirrored for the Studio like
`EL_ORDER` today) and used by the renderer, the repair rules and the editor, so the three cannot drift.
`SKETCH_EL_ORDER` is generalised into this structure (hero/split keep their current keys and saved orders).

### Selection behaviour (canvas)

- **Click** on an unselected block selects the block. **Click again inside the selection** selects the child
  group under the cursor; clicking again goes one level deeper, down to a leaf element. Clicking outside the
  current selection's block starts over at that block.
- **Esc** selects the parent; at block level it clears the selection. **Double-click** on text still edits it
  in place (unchanged). **Enter** on a group selects its first child.
- **Outlines** are drawn by an overlay layer in the preview (absolute boxes, never CSS on the element, so layout
  never shifts): selection = solid accent border + name tag ("Columna de texto", "Botones", "Foto"); the
  selection's direct children = dotted boxes; hover = thin outline.
- The preview posts `pagosya:boceto-select { id, path }`. The Studio keeps `selected = { blockId, path }`
  (today a bare block id).

### Moving

- **Drag a selected node** (any level): a blue insertion line shows valid drop spots among its siblings only.
  Dropping posts `pagosya:boceto-node-move { id, path, index }`; the DOM moves live (as section drag does today)
  and the Studio saves.
- **⇄ swap:** dragging `copy` onto `media` (or vice versa) toggles the existing `flip`.
- **Keyboard:** ⌥↑/⌥↓ moves the selected node among its siblings (today: blocks only). Supr deletes the
  selected leaf when it is optional (e.g. cta2, a pill, a feature row), the block when the block is selected.
- Items in lists (pills, stats, boxes, steps items, FAQ items, gallery photos, quotes, paragraphs, perks) are
  reordered by reordering their arrays; copy-column children by the generalised `order`.

### Group settings (inspector)

Selecting a group shows its own controls instead of the block's:

| Group kind | Controls |
|---|---|
| column (`copy`, `intro`) | gap S/M/L, horizontal align (start/center/end — existing `align` moves here), vertical position (top/middle/bottom, two-column blocks only) |
| row (`actions`, `pills`, `stats`, `boxes`, `features`, `row`) | direction horizontal/vertical, gap S/M/L, align start/center/end |
| `head` | align start/center |
| `items` | gap S/M/L |
| `media` | photo side (= flip), existing photo controls |

Stored per block as `layout?: { [groupKey]: { gap?: 's'|'m'|'l'; align?: 'start'|'center'|'end'; dir?: 'row'|'column'; valign?: 'start'|'center'|'end' } }`.
The renderer emits `data-skb-gap`, `data-skb-dir`, `data-skb-galign`, `data-skb-valign` on the group element;
CSS maps them to flex/grid properties. **Phones:** two-column blocks always stack and horizontal rows wrap,
whatever the settings.

### Layers panel

Capas becomes a tree: block rows get a disclosure arrow; expanded, they list the block's groups and leaves with
the same names as the canvas tags. Clicking a row selects that path; the canvas scrolls it into view. Drag in
the tree reorders blocks only (unchanged); node moves happen on the canvas or with ⌥↑/⌥↓.

### Data, repair and YAPI

- Schema: `order` generalised to every block with a copy column; new optional `layout`. Repair keeps only
  known group keys and allowed values per group kind and drops the rest silently (program error policy: the
  sketch loop never surfaces an error).
- Old sketches without `layout` render exactly as today (golden tests prove it).
- The chat-on-sketch prompt documents `layout` and `order`, so "centra los botones" or "pon la foto a la
  izquierda" edit the sketch, not code.

### Testing

- Repair: unknown group keys/values dropped; old sketches unchanged; idempotent.
- Golden: every block type with and without `layout` compiles (`compileNextPreview`) and screenshots at 1280/390.
- Preview script (`source-preview-boceto-mode.js`): click drill-down, Esc, drag-reorder posts the right
  messages (jsdom tests next to the existing boceto tests).
- Studio (`source-boceto.ts`): path selection, inspector per group kind, ⌥↑/⌥↓ on nodes, tree rendering.

---

## Sub-project 2 — Icons everywhere

### 1. An icon on any text element

- New optional per-block map `icons?: Record<fieldPath, iconName>` keyed by the same field paths the canvas
  already uses (`cta`, `cta2`, `kicker`, `trust`, `pills.0`, `stats.1.value`, `left`, `tagline`…). At most 24
  entries per block. Repair drops keys that are not editable fields of that block and names that are not in
  the catalog (after the nearest-name fix below).
- Inspector: selecting a leaf text element shows "Ícono: [ninguno ▾]", which opens the existing picker.
- Rendering: when a field has an icon, the element renders `<span class="skb-icon" …/>` followed by the text in
  an inner `<span data-skb-field>` (only then), so in-place text editing never deletes the icon.

### 2. "Íconos" feature row

- New copy-column element `features: Array<{ icon: string; text: string }>` (2–4 items, text ≤ 40 chars) in
  hero, split, story and newsletter; it is a ★ row group, so it can be reordered and laid out like any row.
- Added from the inspector of the copy column ("+ Íconos"), removed with Supr.

### 3. Store-wide icon style

- `style.iconWeight: 'thin' | 'regular' | 'bold'` (Lucide stroke-width 1.25 / 2 / 2.75) and
  `style.iconFrame: 'none' | 'circle' | 'square'` (frame filled with the block's accent tint). Drawn at random
  per generation like the rest of `style`, editable on the Página panel.
- **Icons take the text colour:** `.skb-icon` is a CSS mask (`mask-image: var(--skb-icon-url)`,
  `background: currentColor`), replacing the black `<img>` icons in steps, boxes and perks too.
- The assembler emits the referenced `assets/icons/<name>.svg` files with the store's stroke-width applied, so
  the preview and the built site match. The plan must confirm how this interacts with the existing bundler in
  `source-asset-library.ts`, which already adds every referenced Lucide icon.

### 4. YAPI gets a real catalog

- A curated, themed list of ~300 Lucide names (food & drink, beauty, fashion, home, kids, pets, wellness,
  shipping & delivery, payments & trust, time, contact, nature/eco, celebration) lives next to
  `SOURCE_ICON_NAMES` and is sent in the sketch prompts instead of 24 examples. All 2,121 names stay valid.
- Repair maps an unknown name to the nearest real one (exact → known alias, e.g. `delivery` → `truck` → edit
  distance within the catalog), falling back to `sparkles` only when nothing is close.
- The generation prompt asks for icons where they help (feature rows, trust lines, pills, buttons with
  arrows), never on headlines; chat-on-sketch can add or change them.
- Picker: theme tabs from the same curated list, a "Recientes" row (last 12 used in this store, kept in the
  Studio session), and search over all 2,121.

### Testing

- Repair: icons on unknown fields dropped; unknown names fixed to nearest; feature rows clamped to 2–4.
- Golden: blocks with icons, feature rows, each weight × frame compile and screenshot; icons on dark
  backgrounds inherit the ink colour.
- Text editing on an element with an icon keeps the icon (preview script test).
- Prompt test: the themed catalog is in the prompt and stays under a fixed token budget.

## Out of scope

Merchant-created groups (⌘G), free x/y placement, a second icon library or filled icons, animated icons,
icons inside product cards (runtime-owned).

## Success criteria

- In the Boceto, the owner can click into Portada → copy column → button row → one button, see Figma-style
  outlines at each level, and drag the button row above the headline; the built site matches at 1280 and 390.
- Any text element can carry an icon; a feature row can be added to any copy column; icons follow the text
  colour on every background.
- A new store generated by YAPI uses icons from the themed catalog in at least feature rows or trust lines,
  with zero invalid icon names after repair.
