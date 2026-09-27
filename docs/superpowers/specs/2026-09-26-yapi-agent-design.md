# YAPI agent — design

Date: 2026-09-26. Status: architecture approved by the owner in conversation ("si vamos", "si haz todo"); this spec
is for review before the implementation plan.

## Why

The owner recorded Amboras (`admin.amboras.com`) building a store from "build me a store": it read the catalog and
the storefront, took a screenshot, asked **one** question ("Choose the direction for My Store's homepage" → Retro
Americana), then worked alone for ~4 minutes — reading and searching files, running commands, taking screenshots of
its own progress, editing files — and finished with "Built and verified the new Retro Americana homepage", a bullet
list of what it built (visual system, announcement bar, offer-led hero with price, story, product spotlight,
comparison, trust row, stats, FAQ, final conversion band, footer, responsive checked on desktop/tablet/phone). The
design was bold: giant two-tone uppercase headlines, chips, pill CTAs with price, mustard and rust bands, a product
block with quantity stepper and "Add to bag — $12.99", a stats band, a final CTA band, a rich dark footer.

YAPI today makes **one** model call that must return every file as JSON, plus one repair. In the development
database 9 of 22 attempts failed (41%): whole-file rewrites, output cut short, a removed photo, a wrong import. Each
failure is a paid attempt the merchant loses. YAPI never looks at what it built.

## Goals and success criteria

- A merchant asks YAPI for a store (or a redesign) and gets a complete, verified store in one go: no "Tu revisión
  anterior sigue guardada" failures for problems YAPI could have fixed itself.
- YAPI looks at its own work (desktop, tablet, phone screenshots) and fixes what it sees before saving.
- The chat shows what YAPI actually did, with screenshot thumbnails, and ends with the list of sections it built.
- Designs are bold and complete, at the level of the recording.
- Mode chosen by the owner: **A** — 2 to 5 minutes and more credits per store, complete and verified.

Measured by: build success rate (target ≥ 90% of agent runs save a store with no merchant-visible error), median
build time (≤ 5 min), cost per store (reported, not capped beyond the merchant's credit limit).

## Decomposition (owner: "todo", in this order)

1. **YAPI agent with tools** — this spec, in full detail below. The foundation for 3 and 5 and the end of wasted
   attempts.
2. **Direction choice** — one question with three named directions, each with a mini preview (palette, type pair,
   hero sample); the merchant taps one. Spec after 1 ships.
3. **The store appears little by little** — the agent's draft is compiled and pushed to the Studio preview after
   each batch of edits. Builds on 1's workspace and capture.
4. **Bold design system** — section recipes (offer hero with price, story, spotlight, comparison, trust, stats, FAQ,
   final band, rich footer) and a large type scale in `@pagosya/ui`/prompts. Can run alongside 1.
5. **Transparent chat** — real steps with screenshot thumbnails, collapsible "Editó archivos", final summary with
   sections. Consumes 1's step records.
6. **"Hazme una tienda" from any tab** — the dashboard YAPI dock routes to Diseñar sitio and starts the agent.

## Sub-project 1: YAPI agent

### Architecture

New folder `apps/api/src/storefront-source/agent/`, one purpose per module:

| Module | Responsibility |
|---|---|
| `agent-workspace.ts` | In-memory draft of the store's authored source (`components/**/*.tsx`, `styles/globals.css`; legacy HTML stores keep today's single-call engine). Tracks every change; nothing is saved until the run ends. |
| `agent-tools.ts` | Tool schemas and executors over the workspace: `list_files`, `read_file`, `edit_file` (exact search/replace, unique match), `write_file` (new files, or whole replacement when the run is an authorized redesign or the file keeps ≥ half its lines — same rule as `applySourceEdits`), `screenshot`, `verify`, `finish`. |
| `agent-verify.ts` | Runs today's validators as one function that returns a **list of findings** instead of throwing: `validateNextSources`/TypeScript, auto-repairs (`repairNextSharedComponentReferences`, `repairNextMisdirectedImports`, `repairNextCommerceMounts`, `repairNextAuthoredMarkup`), commerce contract, `validateSourceEditScope`, `validateSourceArtwork`, preflight. |
| `agent-capture.ts` | Compiles the workspace with the existing preview pipeline (`compileNextPreview` + kit + config, as `templateDemoRevision`/save do) and captures it with `withVisualSandbox` at 1280, 820 or 390 wide. Returns a JPEG for the model (input image) and a small thumbnail for the chat. |
| `agent-loop.ts` | The loop: calls the model with the tools (OpenAI Responses function calling through the existing provider/metering path, `SourceRequestBudget` for credits), executes tool calls, returns results, repeats until `finish` or a limit. Emits step records. |

Integration: `SourceGenerationService.generate()` gets an engine (`agent` | `single`). With `agent`, the loop
replaces the attempt loop (today's `for (index < sourceAttemptLimit)` block); it returns the authored files plus
`summary` and `sections`. Context building before it and the save pipeline after it (assets, kit files, config,
fonts, motion, visual system, brand, `projects.save`) stay as they are, so chat, credits, history and publishing do
not change. `app.yapiEngine` (`agent` default in development, `single` available everywhere) switches engines.

Security: no shell, no network, no arbitrary paths. Tools only touch allowed authored paths in the draft; the same
guards run before saving.

### The run

1. **Opening context** (one model input, cached prefix as today): the existing contracts (`SOURCE_NEXT_INSTRUCTIONS`,
   UI tools, commerce, motion, fonts…), the agent protocol, the merchant request and agreed conversation summary,
   public business data, the file list, and `components/home.tsx`, the shared shell and `styles/globals.css` inline
   so the first steps are not spent reading them.
2. **Protocol** given to the model: understand → screenshot the current store (skipped for a new store) → plan the
   sections → edit → `verify` → `screenshot` desktop and phone → fix what it sees → `verify` again → `finish` with a
   merchant-facing summary and the section list.
3. **Server rules**:
   - `finish` is accepted only when the latest `verify` came back clean and was run after the last edit; otherwise
     it returns the outstanding findings as the tool result and the loop continues.
   - Findings are data for the model, never a failed attempt.
   - Each tool call becomes a step record: `{ kind, label, at, thumbnail? }` with labels such as "Leyó
     components/home.tsx", "Tomó una captura (celular)", "Editó 3 archivos", "Verificó: 2 problemas", "Verificó: todo
     en orden". Labels carry paths and counts, never source code or model reasoning (the progress channel keeps its
     rule).
4. **Limits**: 40 tool calls, 6 minutes wall clock, 8 screenshots, and the merchant's credit limit through
   `SourceRequestBudget`. At a limit: if the latest `verify` is clean, save what is there; otherwise fail without
   saving (never a half-built store), keep the step record, and charge actual usage as today.
5. **Output**: authored files → existing save pipeline; `summary` and `sections` go on the assistant message
   metadata for sub-project 5; the generation record keeps per-step usage in `attempts` (one entry per model call,
   `phase: 'agent'`).

### Errors

- Provider error or timeout on one call: retry that call once, then fail the run without saving.
- `edit_file` search missing or ambiguous: the tool result says which and shows the current file excerpt (today's
  `SourceEditConflict` diagnostic), the model retries in-loop.
- Screenshot failure (compile error): returned as a finding with the compiler message.
- Merchant cancels: the run's `AbortSignal` stops the loop; nothing is saved.

### Testing

- Unit: workspace (edits, uniqueness, allowed paths, redesign replacement rule), each tool executor, `verify`
  mapping validators to findings, capture (compiles a template workspace and returns an image).
- Loop with a scripted fake model: tool sequences, `finish` gating on a clean verify, limits (steps, time, credits),
  cancellation, provider retry.
- `generate()` with `engine: 'agent'` and mocked fetch: files reach the save pipeline; summary and sections reach
  metadata; `single` engine unchanged (existing suite).
- Evaluation script (manual, spends real credits): N builds on demo stores (new store, template rework, local edit)
  reporting success rate, time and cost against the single-call engine.

### Rollout

Development first with `app.yapiEngine=agent`; the owner compares with the evaluation script; production switch is
a config change. The single-call engine stays until the agent's success rate holds.
