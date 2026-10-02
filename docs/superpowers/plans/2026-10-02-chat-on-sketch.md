# Chat-on-Sketch — Implementation Plan (sub-project 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, owner's standing choice).

**Goal:** On a sketch-born store, a chat request edits the **sketch** — one small structured call, repair, deterministic assembly, saved revision — instead of the agent loop. Fast (~10-20 s), cheap, and the store stays 100% hand-editable because `sketch.json` never goes stale.

**Architecture:** In `generate()`, ahead of the agent branch: when `editExisting`, the current revision contains `sketch.json`, the engine is `agent` and `app.yapiSketchFirst` is on, run the **sketch-edit path**: build the context exactly like the Boceto service (photos from revision files, storeName, purpose), prompt = current sketch JSON + merchant instruction (+ `dto.selection.sectionId` mapped to its `data-skb` block id as "edita SOLO este bloque"), schema = `SKETCH_JSON_SCHEMA`, one call on the companion-aware `model`. `parsed` → repair → assemble → carry forward non-source files + new `sketch.json` → `acceptCandidate` in lenient mode → save. **Not parsed → the run fails with the existing conversational failure path ("tu diseño sigue igual")** — an edit must never replace the store with a default sketch. A redesign request (`sourceRedesignRequested`) skips this path and takes the existing new-store sketch generation (fresh sketch, same photos).

**Tech Stack:** everything already exists — `sketchPrompt`-style builder (new `sketchEditPrompt` in `sketch-request.ts`), `SKETCH_JSON_SCHEMA`, `sketchFromResponse`, `assembleSketch`, attempts phase `'sketch'`, metering, the F1–F4 bookkeeping idioms from the sub-2 review pass.

**Spec:** `docs/superpowers/specs/2026-10-02-sketch-first-yapi-program.md` (sub-project 4). The optional AI polish pass is **deferred** — the owner's priority is modifiability and speed; polish re-enters later via the agent engine which already soft-fails safely.

## Global Constraints
- An edit failure never loses work: the previous revision stays; the merchant gets the existing retryable chat failure message.
- Non-sketch stores and redesign requests keep today's paths untouched; `YAPI_SKETCH_FIRST=off` disables the edit path too.
- `sketch.json` is carried in every sketch-edit save (closes the staleness gap).
- The selection chip (`dto.selection.sectionId`) maps to a block id and is passed as a hard instruction; the model still returns the whole sketch.

## Review Focus
- The agent path on a sketch-born store should no longer run for ordinary edits — pinned by test (a).
- Garbage model reply → conversational retryable error, previous revision untouched, attempt FAILED + metered — test (b).
- Redesign wording on a sketch-born store regenerates a fresh sketch instead of editing — test (c).
- A store without `sketch.json` keeps the agent loop — existing test already pins it.

### Task 1: `sketchEditPrompt` (sketch-request.ts)
`sketchEditPrompt(input: { sketch: StoreSketch; instruction: string; targetBlockId?: string; photos: Array<{ path: string; description?: string }>; catalogNames: string[] })` → prompt containing the serialized current sketch, the instruction, the photo allowlist and, when targeted, "Edita únicamente el bloque <id>; conserva los demás sin cambios". RED spec: contains sketch JSON, instruction, target sentence; omits target sentence when absent.

### Task 2: generation wiring + tests
Modify `source-generation.service.ts`: extract the sub-2 sketch-call idiom into a local helper if duplication would exceed ~20 lines; branch `else if (agentEngine && editExisting && previousFiles.some(f => f.path === 'sketch.json') && !sourceRedesignRequested(dto.instruction) && flag)`. On `!parsed`: throw the closest existing retryable conversational exception (grep how `source-chat` marks retryable failures). Tests in `source-generation-agent.spec.ts` (new describe with its own `afterEach(restoreAllMocks)`): (a) sketch-born store + edit instruction → one fetch, no `tools` in body, save contains updated `sketch.json`; (b) garbage reply → rejects, `projects.save` not called, attempt FAILED; (c) "rediseña toda la tienda desde cero" → fresh-sketch path (fetch body contains the creation-prompt marker 'Diseña el boceto' without the current sketch).

### Task 3: ship
Status line, suites, commit, push; update memory note.
