# Visual selection editor (Wix-style) — Design and Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Program:** sub-project 6 of `docs/superpowers/specs/2026-09-29-themed-product-card-program.md`. It is independent of the other five and can be built at any time.

**Goal:** In the Studio, the merchant clicks a section of the store preview, sees it highlighted with its name, and the YAPI chat shows a chip ("Sección: Hero ×"). The next request they send is applied to **that section only**, with no guessing from the text of the request.

**Architecture:** The server already has section scoping: `sourceSectionScope(files, instruction)` in `apps/api/src/storefront-source/source-edit-scope.ts` finds the literal `<section id="…">` children of `<main>` in `components/home.tsx` (`sourceHomeRegions`) and *guesses* which one the instruction means from its words (failing with "No pude identificar una única sección. Indica su título."). We add an **explicit** `selection.sectionId` that bypasses the guess. The preview page already runs an injected script inside an opaque-origin sandboxed iframe (`packages/storefront-preview/src/source-preview.ts`) that talks to the Studio through `postMessage` (`pagosya:source-navigate`, validated by `receivePreviewNavigation`). We add one more validated message, `pagosya:source-select`, plus hover outlines drawn inside the iframe, and a chip in the Studio chat.

**Tech Stack:** TypeScript; `packages/storefront-preview` (vitest), `apps/merchant-studio` (vitest + jsdom), `apps/api` (jest).

## Design

### D1. Scope of v1 (what is and is not built)
Built: hover outline + label per section, click to select, chip in chat, explicit scoping on the server, quick actions that pre-fill the chat with a precise instruction, an "Editar texto" shortcut into the existing direct editor when the clicked text matches an editable field. **Not built (by decision):** free drag/resize, deterministic reorder/duplicate/hide (these go through YAPI with the selection so the request is exact), editing platform-owned mounts (cart, checkout, product page, catalog, contact, subscribe): clicking them selects them with the label "Lo administra pagosYa" and no chip is created.

### D2. Sections and labels
A *section* is what `sourceHomeRegions` returns: a direct child of `<main>` with a literal `id`. In the rendered page these are the elements `main > [id]`. Label = the section's first heading text (≤ 40 chars) or, without a heading, the id with dashes replaced by spaces and capitalised. A *platform mount* is any element matching `[data-pagosya-catalog],[data-pagosya-cart],[data-pagosya-product-page],[data-pagosya-checkout-page],[data-pagosya-contact],[data-pagosya-subscribe-block]` (or a descendant of one); it is reported as `kind: 'platform'`.

### D3. Protocol (iframe → Studio)
Message posted by the injected script on click (only while "edit mode" is on):

```ts
type SelectMessage = {
  type: 'pagosya:source-select';
  kind: 'section' | 'platform';
  sectionId: string;        // ^[a-z][a-z0-9-]{0,47}$ for kind 'section'; '' for 'platform'
  label: string;            // ≤ 60 chars, plain text
  text?: string;            // the clicked element's own visible text, ≤ 200 chars, for the "Editar texto" match
};
```

The Studio accepts it only from the preview frame (`event.source === frame.contentWindow`, `event.origin === 'null'`), validates every field (type, regex, lengths) in a new `receivePreviewSelection(event, frame): PreviewSelection | null` exported from `packages/storefront-preview/src/source-preview.ts` next to `receivePreviewNavigation`, and treats content as untrusted data (never HTML). The Studio → iframe direction: `{ type: 'pagosya:source-edit-mode', on: boolean, selectedId?: string }` so the iframe can draw the persistent outline of the selected section. The page's own scripts can forge these messages, and that is acceptable: the worst case is a chip naming a section the merchant didn't click; the server re-validates the id against the real source.

### D4. Injected script behaviour
In `source-preview.ts` extend the injected script (the template string that already installs the navigation/hosted handlers) with `installSelection()` that does nothing until it receives `pagosya:source-edit-mode` with `on: true`. In edit mode: (1) a single overlay `<div data-pagosya-edit-overlay>` with `pointer-events:none; position:fixed; z-index:2147483647` draws a 2px outline and a small label tab around the hovered section/platform mount (recomputed on `mousemove`, scroll and resize with `requestAnimationFrame`); (2) `click` on the page (capture phase) calls `preventDefault()` + `stopPropagation()` so links, buttons and the cart do not fire while editing, finds the nearest section/platform ancestor, posts the `SelectMessage`, and keeps the outline on it; (3) `keydown` Escape posts `{ type: 'pagosya:source-select', kind: 'section', sectionId: '', label: '' }` meaning "clear selection"; (4) the overlay is removed and all listeners detached when edit mode turns off. Edit mode is off by default, so published/preview behaviour is unchanged. The overlay must never be included in the published site (it lives only in the preview document built by `sourcePreviewDocument`; add a test that the hosted/published build path does not contain `data-pagosya-edit-overlay`).

### D5. Studio behaviour
- A toggle button "Seleccionar" in the preview toolbar (find the preview toolbar in `apps/merchant-studio/src/source-studio.ts`; the preview iframe is created there or in a helper it calls). On → posts `source-edit-mode` on to the frame; off → posts off and clears the selection. The toggle has `aria-pressed`.
- State `selection: { sectionId: string; label: string } | null` (module-local like the neighbouring `instruction`, `assets` variables). Set by `receivePreviewSelection`; cleared on: toggle off, Escape, a new revision arriving (`state.revision` changes), navigation to another page, sending a message successfully.
- Chip: rendered inside the chat form near the instruction textarea (the template around `source-studio.ts:516`): `<span class="selection-chip" data-selection-chip>Sección: {label} <button type="button" aria-label="Quitar selección">×</button></span>`. Escaped text only. A platform selection renders a non-chip hint "Esa parte la administra pagosYa" and does not set `selection`.
- Quick actions under the chip when a section is selected: "Cambiar el texto", "Hacer más grande", "Mover arriba", "Mover abajo", "Duplicar", "Ocultar". Each pre-fills the instruction (does not send) with a precise sentence, e.g. `Mueve esta sección una posición hacia arriba.`; the merchant can edit before sending. Labels and sentences in Spanish.
- "Editar texto" shortcut: if `text` from the message equals (after trim/collapse whitespace) the `value` of exactly one `VisualField` of kind `text` (see `apps/merchant-studio/src/source-visual-fields.ts` and how `source-direct-editor.ts` selects a field), open the direct editor on that field; otherwise show nothing extra.
- When sending, pass `selection: { sectionId }` to the API (see D6). The API client methods that carry an instruction (`sendSourceMessage`, `estimateSource`, `generateSource`, `sourceAlternative` in `apps/merchant-studio/src/api.ts`) gain an optional `selection?: { sectionId: string }` that is included in the JSON body only when set.

### D6. Server behaviour
- DTOs: `send-source-message.dto.ts` and `generate-source-project.dto.ts` (and the estimate/alternative DTOs if they share the instruction) gain `@IsOptional() @ValidateNested() @Type(() => SourceSelectionDto) selection?: SourceSelectionDto` with `sectionId: string` matching `/^[a-z][a-z0-9-]{0,47}$/`.
- `sourceSectionScope(files, instruction, selectedSectionId?)`: when `selectedSectionId` is given and the request is not a redesign (`sourceRedesignRequested`), return `{ add: false, targets: [selectedSectionId], original, selected: selectedSectionId }` **if** the id is among `sourceHomeRegions(files)` ids; if it is not, throw `SourceScopeConflict('La sección seleccionada ya no existe. Vuelve a seleccionarla.')`. An "add a section" instruction (the existing `add` regexp) with a selection keeps `add: true, targets: []`. The existing text-guessing path is untouched when no selection is sent.
- `sourceSectionScopePrompt` output is unchanged except that when the scope came from an explicit selection it appends: `The merchant explicitly selected section "<id>": the request refers to this section and to nothing else.` (`selected?: string` on `SectionScope` is optional so existing callers compile).
- The selection flows from the controller/service that receives the message down to the `sourceSectionScope` call at `source-generation.service.ts:356` (and any other call site: `git grep -n "sourceSectionScope(" -- apps/api/src`). Trace it from `source-chat.service.ts` (the `messages` endpoint) and thread the value through the existing parameters/DTO objects the same way `instruction` travels.

### D7. Accessibility and safety
- Edit mode is opt-in and reversible with Escape and the toggle. The chip and quick actions are real buttons with text.
- The injected overlay never intercepts events except the captured click in edit mode; it never reads form fields or storage.
- No new database column, no new endpoint.

## Global Constraints
- With edit mode off, the preview page's DOM and behaviour are identical to today (test).
- Never accept a selection message from anything other than the preview frame; never render `label`/`text` as HTML.
- Old clients (no `selection`) behave exactly as before on the server (test).
- **NEVER** run prisma migrate/db push or touch a database. Do not run the full `apps/api` storefront-source suite; run named specs alone.
- pnpm at this repo root; never pnpm/commit in `/Users/saramia/pagosYaWeb`. Rebuild Studio (`pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded`) to see UI changes at :4323. Commit after each task; no push/merge; stage only your own files.

## Review Focus
1. **Edit mode off** leaves the page untouched and never leaks into the published build (Task 1).
2. **Forged or malformed messages** (wrong origin, wrong source window, huge strings, bad id regex, non-string `text`) are rejected without throwing (Task 1, Task 3).
3. **Stale selection**: a selected section that no longer exists on the server gives the "ya no existe" error, not a silent whole-page edit (Task 2).
4. **Selection + redesign or add-section instructions** keep their existing meaning (Task 2).
5. **Clicking links/buttons in edit mode** does not navigate or add to the cart (Task 1).
6. **Chip lifecycle**: cleared on revision change, page navigation, send, Escape (Task 3).

---

### Task 1: Preview protocol and injected selection script
**Files:** Modify `packages/storefront-preview/src/source-preview.ts` (export `PreviewSelection`, `receivePreviewSelection`, and add `installSelection()` to the injected script). Test: the existing preview spec (`git ls-files | grep source-preview` for a `.test.ts`; create `packages/storefront-preview/src/source-preview-selection.test.ts` if none fits; use `// @vitest-environment jsdom`).
**Interfaces:** Produces `type PreviewSelection = { kind: 'section' | 'platform'; sectionId: string; label: string; text?: string }`, `receivePreviewSelection(event: MessageEvent, frame: HTMLIFrameElement | null): PreviewSelection | null`, and the frame-bound message `{ type: 'pagosya:source-edit-mode', on: boolean, selectedId?: string }`.
- [ ] **Step 1 (failing tests):** (a) `receivePreviewSelection` returns the parsed selection for a well-formed message from `frame.contentWindow` with `origin === 'null'`; returns `null` for: another source window, another origin, unknown `type`, `kind` other than the two, `sectionId` failing the regex for `section`, non-empty `sectionId` for `platform`, `label` longer than 60 or non-string (reject, do not truncate), `text` non-string (ignore the field) and `text` longer than 200 (truncate to 200); (b) build a document with `sourcePreviewDocument` for a snapshot whose page HTML has `<main><section id="hero"><h1>Hola</h1><a href="/x.html">x</a></section><section id="menu"></section></main>`, load the resulting `srcdoc` into a jsdom window (`runScripts: 'dangerously'`; follow any existing preview test for the harness), post `{type:'pagosya:source-edit-mode', on:true}` to it, dispatch a `click` on the `<h1>` and expect the parent-bound `postMessage` call `{ type:'pagosya:source-select', kind:'section', sectionId:'hero', label:'Hola', text:'Hola' }`, and that a click on the `<a>` had its default prevented and produced no `pagosya:source-navigate` message; (c) with edit mode never turned on, a click posts no selection message and the document contains no `[data-pagosya-edit-overlay]`; (d) Escape in edit mode posts the clear message; turning edit mode off removes the overlay and detaches listeners (a later click posts nothing); (e) a click inside `[data-pagosya-catalog]` posts `kind:'platform'` with `sectionId:''`.
- [ ] **Step 2:** `pnpm --filter @pagosya/storefront-preview exec vitest run <the test file>` → FAIL.
- [ ] **Step 3:** Implement per D3/D4. Keep the injected code inside the existing template-string style of that file (a string of JS; keep it small, plain ES2019, no external deps).
- [ ] **Step 4:** PASS; run the package's whole vitest once (`pnpm --filter @pagosya/storefront-preview exec vitest run`) and `tsc --noEmit`; assert (in the same test file) that a published/hosted document build path used by the API contains no `data-pagosya-edit-overlay` (find that path with `git grep -n "sourcePreviewDocument" -- packages apps/api/src`; if the hosted build does not use this script at all, note it in the test name and assert the marker is absent from its output).
- [ ] **Step 5:** `git commit -m "feat(preview): edit mode with section hover outline and a validated select message"`

### Task 2: Server — explicit selection scope
**Files:** Modify `apps/api/src/storefront-source/source-edit-scope.ts` (`SectionScope` gets `selected?: string`; `sourceSectionScope` gets the 3rd parameter; `sourceSectionScopePrompt` line), `apps/api/src/storefront-source/dto/send-source-message.dto.ts` and `generate-source-project.dto.ts` (new `SourceSelectionDto` in a small new file `dto/source-selection.dto.ts`), `source-generation.service.ts:356` and the other call sites, `source-chat.service.ts` (thread the value). Test: `apps/api/src/storefront-source/source-edit-scope.spec.ts` (find with `git ls-files | grep source-edit-scope`; create if absent) and a DTO validation spec `dto/source-selection.dto.spec.ts`.
**Interfaces:** Produces `sourceSectionScope(files: File[], instruction: string, selectedSectionId?: string): SectionScope | undefined`, `SectionScope = { add: boolean; targets: string[]; original: Region[]; selected?: string }`, `SourceSelectionDto = { sectionId: string }`.
- [ ] **Step 1 (failing tests):** with files whose `components/home.tsx` has `<main><section id="hero">…</section><section id="menu">…</section></main>`: (a) `sourceSectionScope(files, 'hazlo más grande', 'menu')` → `{ add:false, targets:['menu'], selected:'menu', … }` (this instruction alone has no section words and today returns `undefined`); (b) unknown id `'ghost'` → throws `SourceScopeConflict` with message `La sección seleccionada ya no existe. Vuelve a seleccionarla.`; (c) a redesign instruction (`sourceRedesignRequested` true; use one the existing tests use) with a selection → `undefined` (whole-site redesign wins); (d) an add-section instruction with a selection → `add:true, targets:[]`; (e) no selection → identical to today's results for the existing spec cases (existing tests keep passing untouched); (f) the prompt string contains `explicitly selected section "menu"` only in the selected case; (g) DTO: `{ sectionId: 'Hero!' }` and a 49-char id fail validation, `{ sectionId: 'hero' }` passes, and a body without `selection` passes.
- [ ] **Step 2:** `pnpm --filter @pagosya/api exec jest src/storefront-source/source-edit-scope.spec.ts src/storefront-source/dto/source-selection.dto.spec.ts` → FAIL.
- [ ] **Step 3:** Implement; thread `selection?.sectionId` from the message DTO down to every `sourceSectionScope(` call.
- [ ] **Step 4:** PASS; run the existing specs that cover the message/generate flow, alone (`git ls-files | grep -E "source-chat.*spec|source-generation.*spec"`), and `pnpm --filter @pagosya/api exec tsc --noEmit -p tsconfig.json`.
- [ ] **Step 5:** `git commit -m "feat(yapi): an explicit section selection scopes a request without guessing from its text"`

### Task 3: Studio — toggle, selection state, chip
**Files:** Modify `apps/merchant-studio/src/source-studio.ts` (toggle button in the preview toolbar, message listener next to the existing `window.addEventListener('message', …)` at ~line 165, chip in the chat form template near ~line 516, clear-on-events, pass `selection` when sending), `apps/merchant-studio/src/api.ts` (optional `selection` on `sendSourceMessage`, `estimateSource`, `generateSource`, `sourceAlternative`), styles in the file that styles the chat form (find with `git grep -ln "source-retry-message" -- apps/merchant-studio/src`), new small module `apps/merchant-studio/src/source-selection.ts` for the pure pieces (state holder, quick-action sentences, text→field matcher) so they are unit-testable without the whole studio.
**Interfaces:** Produces in `source-selection.ts`: `QUICK_ACTIONS: Array<{ id: string; label: string; instruction: string }>`, `createSelectionState(): { get(): { sectionId: string; label: string } | null; set(v: { sectionId: string; label: string }): void; clear(): void }`, `matchEditableText(text: string | undefined, fields: VisualField[]): VisualField | null` (exactly one `kind:'text'` field whose value equals the whitespace-collapsed text, else `null`).
- [ ] **Step 1 (failing tests):** `apps/merchant-studio/src/source-selection.test.ts`: quick actions include the six labels from D5 and each instruction is non-empty Spanish; `matchEditableText` matches one, returns `null` for zero or two matches and for `undefined`; state set/clear. Then a jsdom test (extend the harness in `source-studio.test.ts` or create `source-selection-ui.test.ts`): dispatching a valid `pagosya:source-select` message from the preview frame's window shows the chip with the label (escaped: a label `<b>x</b>` renders as text), clicking `×` removes it and no `selection` is sent; a message from another window is ignored; a `platform` selection shows the "administra pagosYa" hint and no chip; sending with a chip calls the API method with `selection: { sectionId }` (spy on `MerchantStudioApi.prototype.sendSourceMessage` like the neighbouring tests) and then clears the chip; a revision change clears it; clicking a quick action fills the textarea and does not send.
- [ ] **Step 2:** `pnpm --filter @pagosya/merchant-studio exec vitest run src/source-selection.test.ts src/source-selection-ui.test.ts` → FAIL.
- [ ] **Step 3:** Implement per D5. Keep `source-studio.ts` changes small by putting logic in `source-selection.ts`.
- [ ] **Step 4:** PASS; run `src/source-studio.test.ts`, `src/source-browser.test.ts`, `src/source-templates-page.test.ts`, `pnpm --filter @pagosya/merchant-studio exec tsc -p tsconfig.json --noEmit`, and rebuild Studio (`vite build --mode embedded`, must exit 0).
- [ ] **Step 5:** `git commit -m "feat(studio): select a section in the preview and ask YAPI about it through a chat chip"`

### Task 4: End-to-end check and docs
- [ ] Re-run alone and record every spec named above plus `tsc --noEmit` for `@pagosya/storefront-preview`, `@pagosya/merchant-studio`, `@pagosya/api`.
- [ ] Manual check only if a dev server and DB are already running (do not start or reset one): rebuild Studio, open a store, press "Seleccionar", hover sections (outline + name), click one (chip appears), click a link (no navigation), type "hazlo más grande", send; confirm the resulting revision changed only that section. If you cannot run it, say so explicitly.
- [ ] Update `docs/superpowers/specs/2026-09-29-themed-product-card-program.md`: sub-project 6 "built (v1)" with commit ids and the D1 "not built" list.
- [ ] Final message: commits, every test command with result, what was not verified, and confirmation that no database was touched.
