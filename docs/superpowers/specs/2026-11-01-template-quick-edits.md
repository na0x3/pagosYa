# Template quick edits — spec (2026-11-01)

Owner: «what can we do with the known gap» → «do it» (fixes 1, 2 and 5 of the goodProtein #12 findings,
`.superpowers/sdd/2026-11-01-goodprotein-random/findings.md`). Fixes 3 (add a section from the library), 4 (shipping to the
delivery-zone settings) and 6 (switch carries earlier asks; raw markdown) come later.

## Problem
On a template store (Esencial with a non-empty `layout`; the 34 themed templates and section-library homes), `components/home.tsx`
draws `layout` only. The quick edit path (`masterContentEdit` → `fillMaster` → `refill`) writes `copy.*`, `look.palette` and
`sections`, which that home never reads. YAPI replies «Listo» anyway. 5 of 8 goodProtein requests were silent no-ops.

## 1. Quick edits write the layout
- New pure module `source-layout-edit.ts`:
  - `layoutDigest(layout)`: the home's sections numbered (`at`), each with its type, a short plain name from the catalogue and its
    current words (eyebrow, title, text, cta, cta2, item titles/texts). Photos are not sent (no photo swaps in this round).
  - One structured call (`dialogue.editLayout`, terra, low effort, text only) answers `ops` + `rest`:
    - `text` — set a block's eyebrow/title/text/cta/cta2, or an item's title/text (`item` ≥ 0);
    - `remove` — take a section off;
    - `move` — put a section at another place;
    - `rest` — the part of the request the ops cannot do (colour, font, menu, a new section, settings, photos), '' when none.
  - `applyLayoutOps(layout, ops)` (pure): words capped like the library; a cta without a link gets `products`; the main grid
    (products-grid / products-tabs) is never removed and the cover stays first and keeps its title; out-of-range ops are
    ignored. Returns the new layout plus what changed (for the reply) and what it refused (said honestly).
- Routing (`send`): a content or design edit (not a redesign, rework, personal touch or selection) on an Esencial store whose
  `layout` is non-empty runs the layout edit first.
  - ops changed something and `rest` is empty → save the layout (`refill({ layout })`, label «Portada actualizada»), reply with
    what changed.
  - `rest` not empty → the existing path runs with `rest` as the request; a layout change rides along in the same save
    (masterContentEdit) or is saved first (design edit).
  - ops changed nothing and `rest` is empty → the existing path runs with the whole request (unchanged behaviour).

## 2. Colour changes show on templates
- Template themes paint with fixed hexes, and a template store's `look.colors` carries the preset's five colours, which override
  any palette. A palette change therefore changes nothing.
- On a template store (`variants.theme` ≠ none) a look change keeps the template's colours except the accent: the asked accent
  (`colors.accent`) or, when only the palette changed, that palette's accent. Paper, ink, muted and deep stay the template's.
- `bindThemeAccent(css, accent)` (pure, idempotent): inside the store's own `/* theme:id */` block, the preset accent hex (any
  case, 3- or 6-digit) becomes `var(--es-accent)`; in a rule that paints the accent as background, or that styles an accent band
  (`band="accent"`), a fixed text colour becomes `var(--es-on-accent)`. Run on every refill of a template store. The first refill
  looks the same as before (the var equals the preset hex; on-accent is the readable ink for it).

## 5. Check before «Listo»
- New pure module `source-visible-change.ts`: `visibleChanges(before, after)` lists what a shopper would see change between two
  snapshots' files: home layout, product-page layout, menu (`config.header.menu`), theme colours/fonts that the theme block
  actually uses, variants, the classic home fields (copy/sections/features) only when `layout` is empty, and component files that
  changed and are mounted (a new component nothing imports does not count).
- `masterContentEdit` on a template store: when the change shows nothing, it is not saved; the reply says it could not do that on
  this template and names what it can (texts, removing or moving sections, the accent colour, the menu).
- A design edit on a template store (`masterDesign` with a layout): when the saved revision shows nothing, it is restored and the
  reply says so honestly instead of «Listo».

## Tests
- `source-layout-edit.spec.ts`: digest, each op, protections, caps, refusals, idempotent no-op.
- `source-master` theme binding: accent hex bound in the theme block only, text on accent bound, idempotent, other themes' and
  non-theme CSS untouched; template look keeps preset colours but the asked accent.
- `source-visible-change.spec.ts`: layout change visible; copy change invisible with a layout, visible without; colour change
  visible only when the theme uses the var; unmounted new component invisible; menu change visible.
- Live: replay goodProtein #12 requests 4, 5 and 6 (`send.cjs` / `seq.cjs` in the findings folder) on a template store — needs
  ChatGPT-plan quota.

## Fixes 3, 4 and 6 (2026-11-02, owner: «fix those 3 next»)
- **3 — add a section from the library.** The layout edit gains `add` (type = a library section that is not a cover, a main grid,
  decoration or the menu note; `to` = the section it goes before, -1 = before the closing; `value` = what it should show). At most
  two per request; one the home already has is refused («pídeme cambiar sus textos»). `librarySectionBlocker` says what the store
  lacks before any call (reviews, address, code, Instagram…). Each add is filled by one `composeLibrary` call in template mode with
  just that block, validated like the template fill, given photos the other new section did not take, and inserted by
  `applyLayoutOps(layout, ops, added)`. Facts now carry `notes`: delivery zones (price, free-from, time), policies and the
  assistant's notes, so questions and steps answer with the merchant's real data. The section-library facts moved into
  `libraryFacts()`.
- **4 — shipping is a setting.** `source-shipping-ask.ts` reads «envío gratis desde Bs 300», «el envío cuesta Bs 15», both, or free
  always; questions and page words («una franja que diga…») are left alone. `shippingEdit` sets every active delivery zone (or creates
  «Envío a domicilio» when a fee is given and there is none), switches shipping on, and replies with what changed; free without an
  amount is asked back. The rest of the message follows as its own request (`shippingRest`).
- **6 — a switch keeps what was asked; plain replies.** `switchTemplate` passes `earlierAsks` (the merchant's earlier requests:
  no questions, switches or YAPI follow-ups; newest 3000 characters) to the fill's words, and `carry`: the old home's sections the
  new template lacks that were added after the old template (or its questions), words only — the fill gives them photos.
  `plainReply` strips markdown from conversational and design-edit replies.
- **Pick:** each pickable template carries its section count; a merchant asking for a complete store gets one of 10 or more.

Live 2026-11-02 (full stores, `examples/full-stores-2026-11-02`): adds on all four stores (Miga FAQ + visit, Lienzo steps + FAQ,
Hoja FAQ + visit, Bruma FAQ + routine) — FAQ answers carry real fees, pickup address, returns, club; Miga «envío gratis desde Bs 120»
set the zone (freeAbove 12000) and its headline rest ran after; Lienzo Muro → Symmetry carried steps + FAQ (13 sections); Bruma's
catalogue question came back without markdown; miga-2 picked Gumdrop «sus 11 secciones cubren una tienda completa».
Open: blog articles are not in the notes (Lienzo's hanging steps stayed generic); the brief check marks asks done from other pages
(Hoja's FAQ ✓ before it was on the home).
