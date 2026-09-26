# Plantillas engine (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merchants pick a complete, designer-made store in a Studio gallery and it becomes their next revision, filled with their name, products and photos.

**Architecture:** A new workspace package `@pagosya/store-templates` holds each template as the exact React source format YAPI produces plus a manifest and demo photos. The API's `SourceTemplatesService` writes a per-store `components/store-data.tsx`, then assembles the revision with the same helpers a YAPI generation uses (kit files, `config.js`, fonts, assets, compile) and saves it through `SourceProjectsService.save`. The Studio lists templates and applies one.

**Tech Stack:** NestJS + Prisma (API, Jest), esbuild via `compileNextPreview`, Vite + TS (Studio, Vitest, Playwright), plain CommonJS package like `@pagosya/storefront-kit`.

**Spec:** `docs/superpowers/specs/2026-09-25-plantillas-design.md`

## Global Constraints

- Template source must pass `validateNextSources` unchanged: only `components/**/*.tsx` and `styles/globals.css`, max 24 files, imports only React / `@pagosya/ui` / `@pagosya/creative` / motion / local files.
- `store-data.tsx` is platform-written; every value JSON-encoded. Templates never interpolate merchant text any other way.
- Demo photos ≤ 600 KB each; bundled as `assets/template-<id>-<slot>.<ext>`.
- Merchant-facing copy in Spanish (Bolivia), same voice as the Studio.
- No full-screen openings (retired 2026-09-25).
- Never run prisma migrate/diff/reset against the dev DB (memory: dev DB wiped 2026-09-25). No schema change is needed.

## Review Focus

1. Store with zero products or no photos: apply must succeed, every slot falls back to the demo photo, catalog shows its empty state.
2. Store name with quotes, `<`, `{`, emoji or 120 characters: compiled page shows it literally, layout does not overflow at 390.
3. Stale revision (another tab saved): apply returns 409 and leaves the project untouched.
4. Unknown or path-traversal template id (`../x`): 404, no filesystem read outside the package.
5. Applying a template over a legacy static-HTML store: produces a React store (like a redesign), previous revision restorable.

---

### Task 1: `@pagosya/store-templates` package — registry and manifest validation

**Files:**
- Create: `packages/store-templates/package.json`, `index.js`, `index.d.ts`, `test/registry.test.mjs`
- Create: `packages/store-templates/templates/aurora/template.json` (seed manifest; its source arrives in Task 5)
- Modify: `apps/api/package.json`, `apps/merchant-studio/package.json` (workspace dependency)

**Interfaces — Produces:**
- `listTemplates(): TemplateManifest[]` sorted by `order`, then `id`
- `templateManifest(id: string): TemplateManifest | undefined` (id must match `/^[a-z0-9-]{2,40}$/`)
- `templateSourceFiles(id): Array<{ path: string; content: string }>` — every `components/**/*.tsx` + `styles/globals.css`
- `templateDemoPhoto(id, slot): { ext: string; bytes: Buffer } | undefined`
- `TEMPLATE_CATEGORIES`, `PHOTO_ROLES` constants; `TemplateManifest = { id, name, category, description, tags, sitePurpose: 'shop', order, photos: Array<{ slot, role, demo?: string }> }`
- Manifest validation throws `TypeError` naming the template and field; demo file must exist and be ≤ 600 KB.

- [ ] Step 1: write `test/registry.test.mjs` (node:test): lists at least the seed; rejects `../aurora`; a manifest with an unknown category throws naming it; `templateSourceFiles('aurora')` contains `components/home.tsx`.
- [ ] Step 2: run `node --test packages/store-templates/test` → FAIL (module missing).
- [ ] Step 3: implement `index.js` (sync fs reads, validated once, memoized) + `index.d.ts`.
- [ ] Step 4: tests pass; `pnpm install` links the workspace dependency.
- [ ] Step 5: commit.

### Task 2: `store-data.tsx` builder and photo-slot filling (API)

**Files:**
- Create: `apps/api/src/storefront-source/source-templates.ts`, `source-templates.spec.ts`

**Interfaces — Produces:**
- `fillTemplatePhotos(manifest, items: Array<{ imageUrls: string[] }>): { photos: Record<string, string>; demoSlots: string[] }` — hero/product slots take each product's first photo in catalog order; lifestyle/detail take remaining photos; else `assets/template-<id>-<slot>.<ext>`.
- `templateStoreDataFile(store: { name: string; tagline?: string; city?: string }, photos: Record<string,string>): SourceProjectFileDto` — path `components/store-data.tsx`, JSON-encoded values.
- `templateDemoAssets(manifest, demoSlots): SourceProjectFileDto[]` (base64).

- [ ] Step 1: failing tests: slot order; zero products → all demo; hostile store name round-trips through `compileNextPreview` of a tiny home that renders `{store.name}` and the compiled output contains no raw `<Alto>` tag; `demoSlots` lists exactly the demo-filled slots.
- [ ] Step 2: run `npx jest src/storefront-source/source-templates.spec.ts` → FAIL.
- [ ] Step 3: implement.
- [ ] Step 4: PASS.
- [ ] Step 5: commit.

### Task 3: `SourceTemplatesService.apply` + endpoints

**Files:**
- Create: `apps/api/src/storefront-source/source-templates.service.ts`, `source-templates.controller.ts`, `dto/apply-template.dto.ts`, `source-templates.service.spec.ts`
- Modify: the storefront-source Nest module (register service + controller)

**Interfaces — Consumes:** Task 1 + Task 2; `SourceProjectsService.current/save/prepare`; `PublicStoresService.getStorePublic`; `sourceRuntimeDna`, `sourceCommerceRoutes`, `nextProjectScaffold`, `nextContentPages`, `withSourceAssets`, `withSourceFonts`, `withSourceMotion`, `withSourceCommerceDesign`, `buildSourceVisualSystem`, `SOURCE_VISUAL_SYSTEM_FILE`, kit files as in `source-generation.service.ts:739-750`.
**Produces:** `GET /v1/store-templates` → `TemplateManifest[]` (no demo paths); `POST /v1/stores/:storeId/source-project/templates/:templateId` body `{ revision }` → the saved revision (same shape as `PUT source-project`).

- [ ] Step 1: failing service spec (real `prepare`, mocked Prisma like `source-projects.service.spec.ts`): apply over revision 0 saves `Plantilla: Aurora` with `components/store-data.tsx`, `config.js` containing `data.items` and `dna`, compiled `_compiled/home.js`; `assertSourceCommerceContract` passes; stale revision → `ConflictException`; unknown id → `NotFoundException`; revision 0 switches checkout mode to payment.
- [ ] Step 2: FAIL. Step 3: implement (the config expression mirrors generation's line 750; a comment points at it). Step 4: PASS. Step 5: commit.

### Task 4: Template contract harness (every template)

**Files:**
- Create: `apps/api/src/storefront-source/source-templates-contract.spec.ts`

For each `listTemplates()` entry: manifest valid; `validateNextSources(files + store-data)`; `compileNextPreview`; the applied snapshot passes `assertSourceCommerceContract`; rendered in real Chromium (the same launcher `source-visual-capture.spec.ts` uses) at 390 and 1280: one `h1`, `.menu-item` count ≥ 1 with the demo catalog, `data-cart-open` click opens the cart, `document.documentElement.scrollWidth <= innerWidth`, no `console.error`.

- [ ] Steps: write → FAIL (no seed source yet is fine: the seed's source lands in Task 5 and this test goes green with it) → commit with Task 5.

### Task 5: Seed template "Aurora" (proves the engine end to end)

**Files:** `packages/store-templates/templates/aurora/{components/Shell.tsx,home.tsx,product.tsx,checkout.tsx,styles/globals.css}` + demo photos (neutral placeholders until the owner's folders arrive).

- [ ] Steps: author → contract test green at 390/1280 → capture preview → look at it → commit.

### Task 6: Preview capture script

**Files:** `packages/store-templates/tools/capture-previews.mjs` → `apps/merchant-studio/public/plantillas/<id>.webp` (1280×1600 top of page, 2× then downscaled) and `<id>-mobile.webp`.

Uses the Studio's `sourcePreviewDocument` exactly like `tests/identity-libraries.spec.ts` `mount()`, with the compiled template + demo catalog. Run: `node packages/store-templates/tools/capture-previews.mjs [id…]`.

### Task 7: Studio gallery

**Files:**
- Create: `apps/merchant-studio/src/source-templates.ts`, `source-templates.css`, `source-templates.test.ts`, `tests/plantillas.spec.ts`
- Modify: `api.ts` (`listTemplates()`, `applyTemplate(storeId, templateId, revision)`), `source-studio.ts` (toolbar "Plantillas" button, empty-state button, mount/unmount), `source-inspiration.ts` (empty-state action)

Behaviour: dialog with category chips (Todas + categories present), grid of cards (preview image, name, category label, description), "Usar esta plantilla" → confirm step in the dialog ("Tu diseño actual queda guardado en el historial") → apply → close, `load(result.revision)`, toast "Plantilla aplicada. Cambia fotos y textos cuando quieras." Busy/locked states mirror YAPI's (`locked`). Errors inline in the dialog.

- [ ] Steps: vitest for rendering/filtering → implement → Playwright: open gallery, filter, apply (mocked API) → commit.

### Task 8: Demo-photo publication warning

**Files:** where publication checks are assembled (`source-publication` / checks service): add a `warning` row when `config.js` / `store-data.tsx` still references `assets/template-`.

- [ ] Steps: failing test → implement → pass → commit.
