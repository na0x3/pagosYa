# Studio Boceto Mode — Implementation Plan (sub-project 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner chose native execution for this program).

**Goal:** A merchant opens a sketch-born store and edits it by hand — text, photos, colours, fonts, sizes, order, add/duplicate/delete blocks — with the preview refreshing in ≤2 s per edit, no credits, no possible errors.

**Architecture:** The sketch is the saved revision's `sketch.json`. A new API pair (`sketch-studio.controller.ts` + `sketch-studio.service.ts`, new files beside `storefront-source`'s controllers) exposes: `GET /stores/:id/source-project/sketch` (the current revision's sketch, or `{ sketch: null }` when the store wasn't sketch-born) and `PUT /stores/:id/source-project/sketch` (body `{ revision, sketch }` → `repairSketch` → `assembleSketch` → save a new revision through `SourceProjectsService` exactly as generation does, with the updated `sketch.json` included — deterministic, model-free). The Studio gains a Boceto panel: when the loaded version contains `sketch.json`, a block list renders; clicking a block opens a side panel of its fields; every change PUTs the whole sketch (debounced) and reloads the preview on the returned revision. Add-block gallery inserts a default block of the chosen type. Total: a PUT that fails server-side keeps the previous revision untouched.

**Tech Stack:** NestJS controller/service (follow `source-assets.controller.ts` idiom + guards), `repairSketch`/`assembleSketch` from `./sketch`, `SourceProjectsService` save path as generation uses it, Studio TS (`source-studio.ts` + new `source-boceto.ts` + CSS; reuse `source-selection.ts` chip pattern and `source-direct-editor.ts` panel idiom).

**Spec:** `docs/superpowers/specs/2026-10-02-sketch-first-yapi-program.md` (sub-project 3; edit-depth decision #3).

## Global Constraints
- No merchant-visible errors in the Boceto loop: invalid input repairs; a failed save keeps the old revision and the panel says at most "se conservó la versión anterior".
- Hand edits never call a model and never charge credits.
- `data-skb` ids are the only selection contract between preview and panel (stable per sub-1's F2 fix).
- Stores without `sketch.json` see no Boceto UI anywhere (today's flows untouched).

## Review Focus
- Concurrent edits: PUT with a stale `revision` must 409 and the panel reload, not overwrite newer work.
- Deleting the catalog/footer block: repair reinserts; the panel must reflect what repair actually kept (render from the response, not the optimistic state).
- Photo swap must offer only the revision's real asset paths.
- XSS: the panel renders block text via textContent/value, never innerHTML.
- Garbage sketch in a PUT body still saves a repaired sketch (totality holds at the HTTP edge).

### Task 1: API — read and write the sketch (new files)
Files: create `apps/api/src/storefront-source/sketch-studio.controller.ts`, `sketch-studio.service.ts`, `sketch-studio.service.spec.ts`; register both in the module that declares `SourceAssetsController` (grep its module file first).
Produces: `GET …/source-project/sketch` → `{ revision, sketch: StoreSketch | null, photos: string[] }` (photos = image asset paths in the revision, for the swap picker); `PUT …/source-project/sketch` body `{ revision: number, sketch: unknown }` → repair, assemble, save via the same prepared-save pipeline generation uses, return `{ revision, sketch }` (the repaired one). Stale revision → 409 ConflictException('El boceto cambió. Recarga.').
Steps: failing service spec (round-trip save bumps revision and persists repaired sketch + skb files; stale revision 409s; garbage sketch body still saves a repaired sketch; non-sketch store GET → sketch null) → RED → implement → GREEN → tsc → commit.

### Task 2: Studio — Boceto panel + instant loop
Files: create `apps/merchant-studio/src/source-boceto.ts`, `source-boceto.css`, `source-boceto.test.ts`; modify `source-studio.ts` (mount when the loaded version's files include `sketch.json`), `api.ts` (two endpoints).
Behavior: block list from the sketch with a per-block panel — text inputs per field, photo `<select>` from `photos`, bg role picker (5 swatches), size S/M/L/XL, sketch-level font pickers (display/text from the catalog ids present in the API response), move ↑/↓, duplicar, eliminar, «+ Añadir bloque» gallery (one default block per type). Debounced PUT (400 ms) → on response, re-render the panel from the returned sketch and reload the preview at the new revision. Vitest: mounts only with sketch.json; an edit PUTs the whole sketch and re-renders from the response; add/move/delete compose the expected sketch; block text lands via textContent/value (assert the panel HTML does not contain raw block text markup).
Steps: RED → implement → GREEN → Studio tsc + vitest → rebuild embedded Studio (`pnpm run build:studio`) → commit.

### Task 3: ship
Program spec status line; run the affected suites; commit; push to main.
