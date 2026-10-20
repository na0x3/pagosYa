# Plantillas back, filled like Esencial, and double-click text editing

Date: 2026-10-20 · Branch: `feature/store-page-architecture` · Status: awaiting owner review

## 1. What the owner asked

- Merchants can again **pick one of the ready-made templates** if they want, next to building with YAPI.
- YAPI **adapts the picked template to their business**: their words, photos and products.
- **Double-click any text in the preview and change it**, instead of asking YAPI.
- Chosen approach (2026-10-20): **C** — a one-time converter turns every template's text into slots, then every
  template is filled and edited the way Esencial already is.
- **Owner rule (2026-10-20): today's generations stay exactly as they are.** «Paso a paso» (Esencial) and «Hablar
  con YAPI» (free design) keep their code, prompts and routing untouched. Templates are an extra choice a merchant
  may take, nothing more. Every change in this spec is additive and only reached from the new «Elegir una
  plantilla» card or a store whose `brief.templateId` is a slotted Plantilla.

## 2. Where things stand

- 62 templates in `packages/store-templates/templates` (61 Plantillas + Esencial). Each has `template.json`
  (`dna`, `photos` slots with roles) and `components/{home,product,checkout,Shell}.tsx`.
- **Esencial** keeps all its text in data: `components/store-data.tsx` exports `copy` (MasterCopy), written by the
  platform (`source-templates.ts`). `applyMaster` fills it in one model call; `refill` edits it instantly.
- **The 61 Plantillas** import only `store` and `photos` from `store-data`; every headline, lead, step and FAQ is
  literal JSX (e.g. `tostado/components/home.tsx`: «Café que vale la pena despertarse»). Adapting one means a YAPI
  agent run that rewrites components (`execution.keepTemplate`), slow and uneven (2026-10-08 QA).
- The Plantillas section was hidden on 2026-10-19 (spec `2026-10-19-master-template-design.md` §5.1); the gallery,
  the apply route (`POST …/templates/:id/apply`) and the MCP tools are still in the code.
- **Direct edit** exists: a Studio mode where a click selects a text and a side panel edits it
  (`GET visual-fields`, `PATCH visual-edit`, `source-visual-edit.ts`, which parses JSX text and JS strings).

## 3. Part A — the slot converter (one time, per template)

A script, `packages/store-templates/tools/slotify.mjs`, run by a developer, never at request time:

1. Parses each template's `home.tsx`, `Shell.tsx` and `product.tsx` (TypeScript compiler API, as
   `source-visual-edit.ts` does).
2. Finds every **visible literal text**: JSX text nodes, string props named in `TEXT_PROPS`, and literal arrays of
   objects used for repeated items (steps, FAQs, values).
3. Skips: anything inside `<template data-pagosya-product-template>` (the runtime fills product cards), commerce
   markers (`data-pagosya-*`), `className`/`href`/`id`, the store name and photos already in `store-data`.
4. Moves each text into `copy` in the template's demo `store-data` and replaces it with `copy.<key>`; repeated
   items become `copy.<key>: Array<{…}>`. Keys are readable and stable (`heroHeadline`, `stepsTitle`, `steps`,
   `faq`), chosen by the script from the nearest heading or `id` and fixed by hand where unclear.
5. Writes the slot list to `template.json` → `copy`: per slot `key`, `role` (`headline | lead | eyebrow | cta |
   title | body | item-title | item-body | question | answer | label`), `default` (the demo text) and `max`
   (default length × 1.6, clamped 12–420), plus `min`/`max` item counts for lists.
6. Wraps each slot's text in its existing element with `data-pagosya-slot="<key>"` (lists:
   `data-pagosya-slot="steps.0.title"`), used by Part D.

**Verification, per template, before it ships:** the demo store renders pixel-identical at 1280 and 390 before and
after (screenshot diff, threshold 0.1 %), `validateNextSources` and `compileNextPreview` pass, and a test asserts no
visible literal text is left outside slots. A template that fails stays hidden (`hidden: true`) until fixed by hand.

## 4. Part B — one fill for every template

- A new, separate `applyPlantillaFilled(templateId)` next to `applyMaster`; **`applyMaster`, the master fill prompt,
  the dice and Esencial's routing are not edited** (shared pure helpers such as photo bundling are called, not
  changed). For a Plantilla, **the look stays the template's own** (its DNA, colours, fonts): that is why a merchant
  picked it.
- **One model call** (same provider, budget and ChatGPT-plan path as the master fill) receives: the store's name,
  the merchant's words and confirmed brand facts, product names, photo descriptions, and the template's slot list
  (role, default, max). It returns a value for every slot, in the merchant's language and voice, about their
  business — never the template's demo business. Values are clipped to `max`; lists keep `min`–`max` items.
- **Photos** fill the template's `photos` slots by role with the merchant's uploads (existing
  `templateDemoPhoto` ordering); a slot with no merchant photo keeps a neutral treatment, never the demo photo
  (closes the 2026-10-08 «demo photos show real brands» gap).
- **If the fill fails** (timeout, bad answer): one retry, then a neutral fallback per role built from the
  merchant's own words (headline = store name, lead = tagline or first product line, CTAs = «Ver productos»,
  demo FAQs and steps dropped). Never the demo business's text.
- **Content edits** on any slotted template use `refill`: a new revision changing `store-data` only, instant,
  no agent run. Design edits still go to the YAPI agent as today.
- Routing: a store whose `brief.templateId` is a slotted Plantilla gets its own content-edit branch, added beside
  the master branch in `source-chat.service.ts`. The existing `MASTER_TEMPLATE_ID` checks are left as they are, so
  Esencial and free-design stores take exactly today's path. Design requests on a Plantilla store go to the YAPI
  agent as today.

## 5. Part C — picking a template when creating a store

- «¿Cómo quieres crear tu tienda?» gets a third card, **«Elegir una plantilla»**: opens the existing gallery
  (`renderTemplateChoices`, live previews), filtered by category, showing only templates that passed Part A.
- Picking one asks for the store name (and optional logo) as today, then «Cuéntanos de tu negocio» (one text box +
  photos), then runs Part B and opens the Studio on the filled store.
- The dashboard menu entry «Plantillas» stays hidden (owner decision 2026-10-19) unless the owner says otherwise
  (open question 1).

## 6. Part D — double-click to edit text

- In the Studio preview (not the published store), **double-click any text** with `data-pagosya-slot` → it becomes
  editable in place (`contenteditable="plaintext-only"`), with a small bar: «Guardar» (Enter), «Cancelar» (Esc).
- Saving sends the slot key and value to a new `PATCH …/source-project/slot` → `refill` with that one slot →
  new revision labelled «Texto: <slot>». Optimistic: the preview keeps the new text; a conflict or validation error
  restores the old text and says why. Length is enforced live (counter near `max`).
- Texts without a slot (stores YAPI designed freely, like PEPPA please or Meathouse): double-click falls back to the
  existing direct-edit field whose value matches the clicked text (`sourceVisualFields`), edited the same in-place
  way and saved through `PATCH visual-edit`. If no field matches (text drawn by the platform: product names,
  prices, policies), a hint points to where it is edited («Edita este producto en Productos»).
- Product names, prices and descriptions are not edited inline in this project (open question 2).
- Single click keeps today's behaviour (navigation, «Seleccionar» for YAPI).

## 7. Rollout and testing

- Flag `YAPI_PLANTILLAS_FILL` (API) and `VITE_PLANTILLAS_PICK` (dashboard/Studio), both off by default.
- Converter in batches: the 10 most-used templates first, live-checked with three businesses each (café,
  clothing, beauty), then the rest.
- Tests: converter unit tests on two templates; pixel-diff test per template (demo data); fill prompt/parse tests
  with recorded answers; `refill` slot test; Studio test for double-click → save → revision; fallback-to-direct-edit
  test on a free store.
- Live check (owner OK, `pnpm dev:chatgpt`): create one store per new card, double-click edit on each, time each fill.

- Regression guard: the existing master, chat and agent test suites must pass unchanged (no edits to their
  expectations), and one live «Paso a paso» and one «Hablar con YAPI» build are compared with today's before merge.

## 8. Out of scope

New template designs; editing product data inline; images by double-click (photos keep their current controls);
the published store (editing only happens in the Studio).

## 9. Open questions for the owner

1. Bring back the «Plantillas» menu entry for existing stores (switch template later), or only offer templates
   when creating a store?
2. Should double-clicking a product name or price open that product's editor?
3. Keep all 61, or ship a curated set first (for example the best 24) and hide the rest?
