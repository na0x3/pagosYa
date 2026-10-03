# Boceto free layer — design (2026-10-03)

Status: approved by the owner in conversation 2026-10-03, after showing Figma (a Collection card dragged out of
its grid onto the canvas). Supersedes, for the Boceto only, the program decision "No free x/y canvas"
(`2026-10-02-sketch-first-yapi-program.md`, decision 3), which the owner reversed with the mobile rule below.

## Intent

What the owner said: "I want to move everything — buttons, outside the box if I want; I want to be able to insert
emojis, etc." Decisions made with the owner:
1. **Free inside its section.** A part dragged out of its box floats wherever it is dropped inside its own section
   (over the photo, in a corner…), like stickers today. Not moved to another block.
2. **Insertable:** emoji, free text, button, photo, icon.
3. **Mobile: nothing covers anything.** On phones a freed part returns to its normal place in the column, and
   inserted elements line up in a row at the end of their section. Desktop keeps the exact spots.

Success: grabbing any part (title, text, button, label, card, cajita, pill, review…) and dropping it outside its
box makes it float there, live, and it stays there after saving, reloading, a YAPI chat edit and "Generar sitio";
the section's box closes the gap. "+ Insertar" drops an emoji, text, button, photo or icon into a block, and it
moves, resizes and edits like any free part. On a phone width, nothing floats.

## Data (sketch.json, editor-only fields per block)

- `free?: Record<path, { x: number; y: number; w?: number; r?: number }>`: a freed part, keyed by its node path
  (`copy/actions/cta`, `items/1`, …). `x`/`y`/`w` are percentages of the part's positioning box (its section, or
  the photo column for parts inside it, exactly as stickers work today); `r` is degrees.
- `extras?: Array<SketchExtra>` with `SketchExtra = { id, kind: 'emoji' | 'text' | 'button' | 'photo' | 'icon',
  value: string, href?: string, x, y, w?, r? }`: `value` is the emoji, the text, the button label, the photo path
  or the icon name; `href` only for buttons.
- Both are editor-only: chat edits carry them over by block id (`SKETCH_EDITOR_ONLY`); a block whose type changes
  drops `free` (its paths name the old structure) but keeps `extras`.

### Repair (never rejects)
- `free`: keep at most 30 entries whose path is freeable for the block (`sketchCanFree`, shared); `x`,`y` clamped
  0–100 at 0.1; `w` optional, 5–100; `r` optional integer −180–180.
- `extras`: at most 12; `id` `^e[a-z0-9]{3,10}$`, unique (fresh id otherwise); unknown kind dropped; emoji must
  contain an emoji (`\p{Extended_Pictographic}`) and ≤ 16 chars; text ≤ 120; button label ≤ 40 and `href` in the
  existing block allowlist (`#…`, `index.html`, `productos.html`, `checkout.html`, `galeria.html`) or
  `https://wa.me/<6–15 digits>`; photo must be a store photo; icon `^[a-z0-9-]{2,40}$`. Position as above.
- `sketchCanFree(block, path)`: any node path except the block's top-level groups (copy, media, head, items, row,
  intro) and `sticker` (already free); never on the account page.

## Rendering (one assembler: preview and built site)

- After a block's markup is generated, the part at each `free` path gets `data-skb-free="on"` and inline
  `left/top/width/rotate` (merged into an existing `style` when present). Paths are read from the markup's nesting,
  the same way the canvas reads them.
- Extras render as a layer at the end of the section: `<div className="skb-extras" data-skb-group="extras">`
  with one `data-skb-node={"<id>"}` child per extra, each `data-skb-free="on"` with its position. Emoji and icon
  scale with their width; text and button take the page fonts and button style; text and button labels carry
  `data-skb-field="extras.<i>.value"` so double-click editing works.
- CSS, desktop (≥ 900px): `[data-skb-free]` is `position:absolute` (z-index above the column); the extras layer
  covers the section (`inset:0`, pointer-events only on its children). Phone (< 900px): `[data-skb-free]` is
  `position:static` with no rotate/width, so freed parts sit back in the column; the extras layer is a centred,
  wrapping row after the content.
- The node tree (`sketchNodeTree`) lists the extras under an `extras` group ("Elementos sueltos"), labelled by
  kind (Emoji, Texto, Botón, Foto, Ícono), so Capas, the inspector and the canvas share them.

## Canvas (preview script)

- The Studio sends per block `movable` (as today) and `freeable` paths, plus `free` positions for live apply.
- Grabbing a part: a part that is already free (or an extra) moves freely, posting
  `pagosya:boceto-free { id, path, x, y }` in percentages of its positioning box. A part that is not free reorders
  among its siblings as today; once the pointer leaves its container's box by 24px and the part is freeable, it
  detaches and follows the pointer; dropping posts `pagosya:boceto-free`. Freeable parts that cannot reorder
  only detach.
- A selected free part shows a corner handle; dragging it posts `pagosya:boceto-free { …, w }`.
- Live apply sets or clears `data-skb-free` and the inline position on each path, so "Volver a su lugar" is instant.

## Studio

- `remoteFree(id, path, pos)`: writes `block.free[path]` (or the extra's position for `extras/<id>`) and saves.
- Inspector for a free part: **Giro** (0°, −8°, 8°, 15°) and **Volver a su lugar** (deletes the entry).
- **"+ Insertar"** chips in the block inspector (and in any part's inspector, for its block): Emoji, Texto, Botón,
  Foto, Ícono. A new extra lands centred (x 45, y 40) and is selected; insertion is structural (preview reload).
- Inspector for an extra: Emoji → a grid of 40 common emojis; Texto → the double-click hint; Botón → "Lleva a"
  (Catálogo, Pedido, Inicio, WhatsApp with a number field); Foto → the photo picker; Ícono → the icon picker; plus
  Giro and **Eliminar**.
- Capas shows freed parts with "↗" and the extras group.

## Error handling
Everything goes through repair; a bad position or unknown extra is dropped silently. Live apply ignores paths it
cannot find. No merchant-visible errors.

## Testing
- Shared: `sketchCanFree`, extras in the node tree.
- API: repair of `free`/`extras`; `renderBlock` stamps freed parts and renders the extras layer; carry-over on chat
  edits; base CSS phone rules; the golden fixture includes free parts and every extra kind, compiles, and
  screenshots at 1280/390 with no page errors.
- Canvas: detaching past the box posts `boceto-free`; a free part moves; the corner handle resizes; live apply sets
  and clears.
- Studio: `remoteFree` saves; Volver a su lugar; Insertar adds each kind; extra inspector edits; Capas lists them.
- Live check in the owner's app: free a title and a button, insert an emoji, then restore the store.

## Out of scope
Moving parts to another block; separate phone positions; free vertical resizing; grouping several free parts.
