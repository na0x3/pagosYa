# Boceto phase — design (2026-10-03)

Status: approved by the owner in conversation 2026-10-03. Builds on the sketch-first program
(`2026-10-02-sketch-first-yapi-program.md`, sub-project 4 "Construir mi sitio") and the Boceto editor
(`2026-10-03-boceto-structure-and-icons-design.md`).

## Intent

What the owner said: while a store is a boceto, the merchant sees **only the Boceto**: no Vista previa, Código or
Seleccionar. An **"Abrir YAPI"** right there takes change requests without switching tabs. When the merchant is
happy, **"Generar sitio"** turns the boceto into the website; from then on they see the code and everything else.

Decisions made with the owner:
1. **Generating is final.** After "Generar sitio" the store never returns to block editing (a redesign request
   creates a fresh boceto, as today). No risk of a later boceto save overwriting hand or YAPI code edits.
2. **YAPI opens in the right panel**, as a tab next to Diseño. Capas and the canvas stay put.
3. **"Generar sitio" is instant and identical to the boceto**: no AI polish pass, no credits, cannot fail. Polish
   is something the merchant can ask YAPI for afterwards, like any edit on a built site.

Success: a sketch-born store opens straight into the Boceto with no way to wander into code; a chat request edits
the boceto in place (with the selected block as context); "Generar sitio" asks once, then the normal Studio opens
on a site that looks exactly like the approved boceto; the Boceto is gone for that store from then on.

## The phase

**A store is in the boceto phase exactly when its current revision contains `sketch.json`.** No new field: the
file already travels only with saves that derive the page from it, and restoring an older boceto revision
naturally brings the boceto back. (Rejected alternative: a separate `phase` field, which duplicates
`sketch.json` and can drift from it.)

## API

### `POST /v1/stores/:storeId/source-project/sketch/build` `{ revision }`
- `SketchStudioService.build`: loads the current revision; 409 `El boceto cambió. Recarga.` when `revision`
  is not current; 400 when the revision has no `sketch.json` (already a site).
- Re-repairs the stored sketch and re-assembles it with the current renderer (same as a Boceto save), so the built
  site is the boceto as the merchant last saw it, then saves a revision labelled **"Sitio generado desde el
  boceto"** with every file of the snapshot (assets, config, commerce runtime, icons) plus the assembled
  components, **without `sketch.json`**. Returns `{ revision }`.
- Pure and deterministic: no model, no credits, no compile step beyond the normal save pipeline.

### `sketch.json` keep rule (fixes a live bug)
Today `SourceProjectsService.save` drops `sketch.json` from every save not labelled `Boceto editado`, so
**"Subir foto" inside the Boceto (`Foto añadida al boceto`) and asset-role saves (`Usos de los recursos
visuales`) silently end the boceto**. New rule: `sketch.json` is kept when the save is a Boceto edit, **or when
the save's page components (`nextSourceFile` paths) are byte-identical to the current revision's**: the sketch
still describes the page. Any save that changes components without coming from the sketch (code edits, visual
edits, motion, standard pages, YAPI code edits) still drops it, exactly as today. The build endpoint removes it
itself.

### Chat on a boceto
Unchanged: the existing `sketchEdit` branch in `source-generation.service.ts` edits the sketch in one small call
and honours `selection.sectionId` (`skb-<blockId>`) as the target block; redesign requests regenerate a fresh
sketch.

## Studio

### Boceto phase (current revision has `sketch.json`, not a historical or live-draft view)
- Opens directly in the Boceto board; `bocetoOpen` follows the phase instead of a toggle.
- Toolbar: only the Boceto badge, the page tabs (Inicio / Producto / Pedido / Cuenta) and **Generar sitio**.
  Hidden: Vista previa / Código / Seleccionar / Boceto toggle, the page picker, "Ver en navegador", the width
  toggle and the publish controls. The inspector's ✕ is removed (there is nothing to exit to).
- **Right panel tabs `[Diseño | YAPI]`.** YAPI shows the existing agent panel (stream, progress, credits,
  composer) docked on the right at the inspector's width, so there is one chat implementation, not two. The
  ‹/› tuck arrow keeps working for the whole right panel.
- **Block as context.** While the YAPI tab is open, the block selected on the canvas or in Capas is the chat
  selection (`sectionId: skb-<blockId>`, label = block type name), shown as the existing selection chip; clearing
  the chip or selecting nothing sends a page-wide request. Parts inside a block target their block.
- While YAPI works, the Boceto is locked (as for any busy Studio) and the status reads "YAPI está cambiando tu
  boceto…". When the new revision lands, the panel reloads the sketch and the preview, as for any new revision.
- **Generar sitio** opens a confirmation: *"Tu boceto se convertirá en sitio web. Después ya no podrás editarlo
  por bloques; podrás pedirle cambios a YAPI y ver el código."* [Cancelar] [Generar sitio]. On confirm: flush any
  pending Boceto save, call `build`, load, show the normal Studio on Vista previa with the toast "Sitio generado
  desde tu boceto. Revísalo y publícalo cuando quieras." A 409 reloads the boceto and says the boceto changed.

### Site phase
Today's Studio, minus the Boceto toggle (a store without `sketch.json` never shows it).

## Error handling
- Build is deterministic; the only failure modes are 409 (stale revision → reload the boceto, keep the merchant in
  it) and network errors (button returns to its idle state with "No se pudo generar. Inténtalo de nuevo.").
- A YAPI edit that fails keeps the previous revision (existing `sketchEdit` behaviour) and surfaces in the chat
  stream like any failed request.

## Testing
- API: `build` saves the assembled files without `sketch.json`, refuses stale revisions and non-boceto stores;
  the keep rule keeps `sketch.json` on photo/asset-role saves and still drops it on component edits.
- Studio: boceto phase hides the other modes and the ✕; the YAPI tab shows the agent panel and turns the canvas
  selection into the chat chip; Generar sitio asks first, calls `build`, and lands on the normal Studio with
  no Boceto toggle; site phase never shows the Boceto.
- Live check in the owner's dev app on a sketch store (BATS or The Bake Lab), after asking before generating a
  site there, since generating is final.

## Out of scope
- The AI polish pass on build (deferred, as in the program spec).
- Returning from site to boceto.
