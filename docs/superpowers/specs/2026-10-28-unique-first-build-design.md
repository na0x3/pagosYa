# Unique first build: the brand designs the store (2026-10-28)

## Why

Owner, 2026-10-28: «quiero que el website sea la marca: use logo, colores, logo en el footer, secciones depende de la marca…
no quiero tiendas iguales… antes salían únicas pero caras, ahora las quiero únicas nada más».
Reference stores the owner likes: Oh Belly `nykzd29i` rev 3, Remolino (Oct 21–22), the original PEPPA, Dulce Horno · Claude `yjgzhsk6` rev 2.

Measured the same day:

- PEPPA `z9euoqdi` and DooBoo `i73zb4pd` (template path, redesign off): paper `#faf5f5` vs `#faf5f6`, deep `#3b1616` vs `#3b1621`,
  both Fredoka + DM Sans, both family «pop», same section order. Andes Studio also `#faf5f5`.
- Causes in the template path: `source-templates.service.ts:177` forces the `alegre` font on every animated store (over the
  family's per-store pick at :171); paper and ink are only tinted by the brand hue; `deepFromAccent` (`source-palette.ts`)
  turns red and maroon into the same near-black; families are picked from a 2-item list by seed.
- Every store the owner liked was Esencial **plus a free redesign on gpt-5.6-sol** (`redesign: true, motion: 'expressive'`).
  That path still exists (`YAPI_PEPPA_REDESIGN`); it was switched off.
- Re-test with the redesign on sol (PEPPA `4hkfxhw9`, Remolino `jkdcjgqi`): rev 1 (template) identical — same `#faf5f5`,
  `#d62828`, `#3b1616`; rev 2 (redesign) clearly different stores (lilac + yellow poster vs cream + red). But the redesign:
  - dropped the header's dropdown menu, the search icon and the account link (it rewrote the header);
  - did not place the logo properly: the store name as text in the header, no logo in the footer;
  - went chunky: heavy poster type, square boxes with thick black borders and offset shadows. Owner: «la verdad mejor antes»;
  - left empty parts (Remolino «Diario» with no articles, large empty gaps near the FAQ) and an overlap in PEPPA («01» over a title);
  - showed the template (rev 1) to the merchant for 5–17 minutes before the redesign landed.
- Redesign runs since 2026-10-20: 27 jobs, 17 completed. Failures: our own all-or-nothing checks discarded two near-finished
  designs (ZARA «Se retiró una foto o video existente», `source-edit-scope.ts:131`; Oh Belly «la acción principal no entra»),
  ChatGPT plan quota / provider ×2, credit or exploration limits ×2, my own test misconfiguration ×3, one manual cancel.
  `YAPI_REDESIGN_TOOL_CALLS` is in `.env` but no code reads it.

## Goal

Every new store comes out as its brand on the first build: its logo, its colours across the whole page, its own sections,
type that fits it — and two stores never look alike. The merchant only ever sees the finished design. Cost is secondary
(owner: «únicas nada más»); the limit is the ChatGPT plan quota.

Success, checked on a fixed set (PEPPA, DooBoo, Remolino, Andes Studio, Oh Belly, Dulce Horno):
1. No two stores share paper colour, heading font or hero composition.
2. Each shows its real logo image in the header and the footer.
3. The header keeps the dropdown/collections menu, search, account and cart; search, a collection page and add-to-cart work.
4. No empty section, no overlapping text.
5. The default look is calm: no thick black borders, offset shadows, square «brutalist» boxes or poster type unless the
   merchant asked for it («atrevida», «póster», «brutal», «chunky»).
6. The merchant never sees rev 1.

## Design

### 1. The first build is template → redesign, shown as one step
- The template build still runs first (it wires catalog, collections, filters, search page, cart, checkout, account).
- The redesign on sol runs right after, automatically (`YAPI_PEPPA_REDESIGN=on`, `YAPI_REDESIGN_MODEL=gpt-5.6-sol`, polish off).
- The Studio does not show rev 1 while the first build's redesign is queued or running: it shows «YAPI está diseñando tu tienda»
  with the real progress steps (already reported in the job's `progress`), and opens the store at the redesign's revision.
- If the redesign cannot start or is cut by quota, the screen stays on «YAPI sigue diseñando, termina en un rato» and the job
  resumes on its own when the quota returns. Only if it finally cannot finish does rev 1 show, with a note saying why.

### 2. Platform-owned parts the redesign styles but never rebuilds
- Header: logo image, menu (dropdowns/collections as the kit's default menu builds them), search, account, cart. The redesign
  may change colours, fonts, spacing and placement through the header's own variables and classes, not replace its markup.
- Footer: logo image (the store's logo; the name only when there is no logo), columns, newsletter.
- Enforcement: the agent workspace protects these files during a first-build redesign, like other platform-owned files. A capture
  check after the redesign flags a header without search, account, cart or the collections menu, and a missing logo image in
  header or footer. A flag goes to the repair round (§4), never straight to discard.

### 3. What the redesign brief asks for (REDESIGN_BRIEF_PROMPT, source-conversation.service.ts)
- Colours from the brand across the page: paper, ink, accent and a second colour from the logo (or from named colours, then the
  brand photos). Not only an accent.
- Sections from the business itself (what it sells, how it is made, how it is used, the place, the people), each with content
  that exists now — no section that needs content the store does not have (a blog with no posts, reviews with none).
- Type from a calm, readable set chosen for the brand; heavy poster or rounded display type only when the merchant asked for it.
- Shapes: soft corners and thin borders by default; no thick black outlines, offset shadows or square stamp boxes unless asked.
- Uniqueness: the brief receives the paper colour, heading font and hero layout of the last 10 stores and must not repeat them.

### 4. Never discard a near-finished design
- Final checks split into **broken** (checkout, cart, search, account or a page does not work; protected header/footer parts
  missing) and **finish** (a button below the fold, a moved photo, a small overlap, an empty section).
- Finish items get one targeted repair round and the result is saved. Broken items get the repair round too; only if they are
  still broken is the redesign dropped (rev 1 stays, the Studio says why).
- The photo rule at `source-edit-scope.ts:131` does not apply to a first-build redesign: photos may move or go, as long as the
  merchant's brand photos still appear somewhere in the store.
- The first-build redesign gets the budget a whole store needs (credits and agent calls sized from the Oh Belly run), not the
  edit budget. The unread `YAPI_REDESIGN_TOOL_CALLS` is either wired to that budget or removed.
- Before starting, the quota is probed; when it is out the job waits (§1) instead of failing.

### 5. The cover photo is chosen before the redesign
- Pixel filter, no model: drop small or soft photos, plain product cut-outs and logos (`source-photo-fit.ts` already reads shape,
  size, plain/scene and focus).
- One cheap vision call ranks the rest: a real scene (people, place, product in use) over a lone product, a clear subject, room
  for the headline, no collage, no text on the photo, not the first product card's photo.
- The redesign receives that photo as the fixed cover.

### 6. Template-path fixes kept regardless
- Remove the forced `alegre` font (`source-templates.service.ts:177`) so the family's per-store font stands.
- Paper from the brand's own light colour (DooBoo cream, PEPPA pink) instead of a near-white tint; `deepFromAccent` keeps more
  of the hue. These matter when the redesign does not run, and they stop rev 1 stores being clones.

## Testing
- Unit: protected header/footer check, broken vs finish split, photo rule off for a first-build redesign, cover-photo filter.
- Live: rebuild the fixed set on the ChatGPT plan, one store at a time (never save `apps/api/src` while a job runs). Screenshot
  desktop and phone side by side and check the six success points. Report minutes and notional cost per store.

## Out of scope
- Template families, skeletons, the guarded touch and the brief checklist stay as they are.
- Paid models (Claude): ChatGPT plan only.
