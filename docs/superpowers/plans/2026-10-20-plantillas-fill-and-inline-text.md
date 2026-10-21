# Plantillas filled like Esencial + double-click text editing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchants can pick a ready-made template (curated set) when creating a store or later from «Plantillas», YAPI fills it with their business in one call, and any text in the Studio preview can be edited in place with a double-click.

**Architecture:** A developer-run converter moves every visible literal text of each template into flat `copy` slots in `components/store-data.tsx` and lists them in `template.json` (`copy` schema). A new `applyPlantillaFilled` (beside, never inside, `applyMaster`) asks the model once for every slot. Direct edit learns to read `copy` strings in `store-data`, and a new preview module turns a double-click into an in-place edit that the Studio saves through the existing `PATCH visual-edit`.

**Tech Stack:** TypeScript (NestJS API, Vite Studio), plain JS (dashboard `.mjs`, preview runtime fragments), TypeScript compiler API, Playwright sandbox (`withVisualSandbox`), jest (api), vitest (studio, preview), node:test (dashboard, templates).

**Spec:** `docs/superpowers/specs/2026-10-20-plantillas-fill-and-inline-text-design.md`

## Global Constraints

- Today's generations stay exactly as they are: no edits to `applyMaster`, `fillMaster`, `MASTER_FILL_PROMPT`, the dice, or the `MASTER_TEMPLATE_ID` routing in `source-chat.service.ts`.
- Esencial (`templates/esencial`) is never converted; it already has its own `copy`.
- Flags: API `app.yapiPlantillasFill` (env `YAPI_PLANTILLAS_FILL`), dashboard/Studio `VITE_PLANTILLAS_PICK`; both default off, turned on in dev `.env` for the owner's review.
- Only templates with `curated: true` and a `copy` schema show in the gallery and the new card.
- A merchant store never shows the template's demo business text or demo photos after a fill.
- Verification deviates from the spec's pixel diff on purpose: the converter changes only where text comes from, so the rendered `document.body.innerHTML` must be byte-identical before/after (stronger and deterministic).
- Never run the full API jest suite with default workers; use `--maxWorkers=2` and path patterns.
- Saving `apps/api` files restarts nest and kills a running YAPI job: check RUNNING jobs before API edits.
- Studio embeds the kit: rebuild with `pnpm --filter @pagosya/merchant-dashboard run build:studio` after preview/kit edits.

## Review Focus

- A template text that mixes literal words and a variable (`` `Desde ${store.city}` ``) stays literal — the converter's leftover report lists them per template.
- Two slots with the same text (two «Comprar» buttons): a double-click edits the first matching field only; test pins "first match wins, nothing else changes".
- Double-click on a product name/price inside a card opens the product editor, never an inline edit.
- A fill answer missing keys or over `max`: missing keys take the neutral fallback for their role, long values are clipped.
- Escape or clicking away without changes sends nothing and creates no revision.

---

### Task 1: Template slot schema and `copy` in store-data

**Files:** `packages/store-templates/index.d.ts`; `apps/api/src/storefront-source/source-templates.ts`; test `apps/api/src/storefront-source/source-templates-plantilla-copy.spec.ts`

**Interfaces (produces):**
- `type TemplateCopyRole = 'headline'|'title'|'lead'|'body'|'cta'|'label'|'item'|'question'|'answer'|'quote'|'name'|'alt'`
- `type TemplateCopySlot = { key: string; role: TemplateCopyRole; default: string; max: number }`; `TemplateManifest.copy?: readonly TemplateCopySlot[]`; `TemplateManifest.curated?: boolean`.
- `templateStoreDataFile(store, photos, master?, plantillaCopy?: Record<string,string>)` → adds `export const copy: Record<string, string> = {...};` when `plantillaCopy` is given.
- `readPlantillaCopy(files): Record<string,string>`; `plantillaDefaults(manifest): Record<string,string>`.

- [ ] Failing spec → implement → PASS → commit.

### Task 2: The slot converter

**Files:** create `packages/store-templates/tools/slotify.mjs` (`slotifyFiles(files) → { files, slots, leftovers }` + CLI `node tools/slotify.mjs <id>…`); test `packages/store-templates/test/slotify.test.mjs`

**Rules:** files `components/{home,Shell,product}.tsx`; extract JSX text (React whitespace rules, entities decoded), strings in JSX attributes `alt|title|label|placeholder`, string children of JSX expressions, string-valued object properties, string array elements, `||`/`??`/conditional branches — when ≥ 2 letters and not structural. Structural: attrs/props `className|href|src|srcSet|id|key|type|fill|stroke|transform|d|viewBox|style|role|rel|target|loading|sizes|htmlFor|tone|scale|slot|icon|color|kind|variant|image|photo|position|aria-*|data-*`; strings matching `^[#./]|^https?:|\.html|^[a-z0-9_-]+$`; anything under `<template data-pagosya-product-template>` or `data-product-field`; imports. Keys `home_n|shell_n|product_n`; roles from tag/prop; `max = clamp(round(len×1.6),12,420)`. Rewrite JSX text → `{copy.k}`, attribute → `={copy.k}`, other → `copy.k`; add `copy` to the `./store-data` import. `leftovers` = template literals with letters.

- [ ] Failing fixture test (headline, `||` fallback, FAQ q/a, cta, alt; product template + href/className untouched; import updated) → implement → PASS → commit.

### Task 3: Convert, prove identical, curated set

**Files:** create `apps/api/scripts/plantillas-slot-check.ts` (demo `index.html`/`product.html` at 1280 before/after, compare `body.innerHTML`); templates `components/*.tsx` + `template.json` (`copy`, `curated`); `source-templates.ts` (`templateDemoRevision`/`assembleTemplateRevision` write `plantillaDefaults` when the manifest has `copy` and no fill); test `packages/store-templates/test/plantillas-slots.test.mjs`.

- [ ] Failing test (no JSX letters left in converted components; every `copy.k` in `template.json.copy`; `curated` ⇒ `copy`) → wire defaults → convert all 61 → slot check → revert any template whose DOM differs → mark 20 curated across categories → PASS → commit.

### Task 4: One fill call

**Files:** create `apps/api/src/storefront-source/source-plantilla-fill.ts` (`PLANTILLA_FILL_PROMPT`, `plantillaFillSchema`, `plantillaFillFromRead`, `plantillaFallback`); modify `source-conversation.service.ts` (`fillPlantilla`, same transport as `fillMaster`, which stays untouched); test `source-plantilla-fill.spec.ts`.

**Interfaces:** `fillPlantilla(merchantId, { storeId, storeName, about, products, photos, slots, current?, request? }): Promise<Record<string,string>|null>`; `plantillaFillFromRead(read, slots)` clips and drops unknown keys and keeps missing ones out; `plantillaFallback(slots, { storeName, tagline, products })` never returns a slot default.

- [ ] Failing spec (schema shape, clipping, fallback never demo) → implement → PASS → commit.

### Task 5: `applyPlantillaFilled` + route + flag

**Files:** `source-templates.service.ts` (`applyPlantillaFilled(merchantId, storeId, templateId, revision, filler)`); `source-templates.controller.ts` (`POST …/templates/:templateId/apply-filled` `{ revision, about?, assetUrls? }`, 404 unless `app.yapiPlantillasFill`); `source-chat.service.ts` (`applyPlantilla(...)` wiring `dialogue.fillPlantilla`); config flag; test `source-templates-plantilla-apply.spec.ts`.

- [ ] Failing spec (filled copy saved; templateId kept; no demo photo files; null filler → fallback) → implement → PASS → commit.

### Task 6: Content edits on a Plantilla store

**Files:** `source-chat.service.ts` (new branch beside the master one, only for stores whose template has `copy` and is not Esencial); `source-templates.ts` (`refillPlantillaFiles(files, change)` replaces only the `copy` line); test in `source-templates-plantilla-apply.spec.ts`.

- [ ] Failing test for `refillPlantillaFiles` → implement + branch → PASS (master/chat specs unchanged) → commit.

### Task 7: Direct edit reads `copy`

**Files:** `source-visual-edit.ts` (`components/store-data.tsx`: string properties inside `export const copy` → `text` fields, `js-string`); test `source-visual-edit.spec.ts`.

- [ ] Failing test (field listed; edit rewrites the JSON string; `readPlantillaCopy` still parses) → implement → PASS → commit.

### Task 8: Preview double-click module

**Files:** create `packages/storefront-preview/src/source-preview-inline-text.js`; modify `source-preview.ts` (`inlineText?: boolean`, injected only when true and not hosted); test `source-preview-inline-text.test.ts` (jsdom).

**Behaviour:** dblclick on a text-only element (`h1–h6,p,span,strong,em,small,a,button,li,label,figcaption,blockquote,dt,dd`): product name/price (`[data-product-field]`, `.menu-item` name/price, product page title/price) → `pagosya:inline-product {productId, field}`; inside forms/cart/checkout → nothing; else `contenteditable="plaintext-only"`, select all. Enter/blur commit, Escape restore; a changed commit posts `pagosya:inline-text {before, after}`; `pagosya:inline-text-revert` restores.

- [ ] Failing jsdom tests → implement → PASS → commit.

### Task 9: Studio saves the double-click

**Files:** create `apps/merchant-studio/src/source-inline-text.ts` (`matchInlineField(fields, before)`); modify `source-studio.ts` (preview gets `inlineText` when `VITE_PLANTILLAS_PICK`; message handlers → `visualFields` → `visualEdit` → reload + toast; no match → revert + toast; product → open product editor); test `source-inline-text.test.ts`.

- [ ] Failing test (exact normalized match, first wins, only `text`) → implement + wire → PASS → Studio build → commit.

### Task 10: Dashboard + gallery

**Files:** `onboarding-walkthrough.mjs` (third card «Elegir una plantilla» when templates are on; `onTemplates`); `index.html` + `dashboard.js` (menu «Plantillas» back with the flag); `apps/merchant-studio/src/source-templates.ts` (curated only; «Cuéntanos de tu negocio» before `applyTemplateFilled`); `source-studio.ts` («Plantillas» button with the flag); `api.ts` (`applyTemplateFilled`); hidden tests updated to "hidden when flag off, shown when on"; walkthrough test.

- [ ] Failing tests → implement → PASS → Studio build → commit.

### Task 11: Regression guard and live check

- [ ] Master/chat/templates/agent specs (`--maxWorkers=2`), Studio vitest, dashboard node:test, preview vitest, templates node:test — green, no edited master/chat expectations.
- [ ] Flags on in dev `.env`; rebuild Studio; live: create via «Elegir una plantilla», double-click a headline, double-click a product name, apply a template from «Plantillas» on an existing store; screenshots.
