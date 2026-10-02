# YAPI Generates Sketches — Implementation Plan (sub-project 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (owner chose native execution for this program).

**Goal:** A brand-new store build becomes one cheap structured-output call → `repairSketch` → `assembleSketch` → saved revision, with `sketch.json` persisted — fast, zero merchant-visible errors, no agent loop.

**Architecture:** New `sketch/sketch-request.ts` owns the strict JSON schema, the prompt and the total response→sketch conversion (any failure yields the repaired default sketch). `source-generation.service.ts` gains a third branch ahead of the agent engine: when the store is new (`!previous`), the engine is `agent`, it is not an evaluation candidate, and `app.yapiSketchFirst` is on (default), it issues one provider call (json_schema, strict, low reasoning, 60 s timeout), converts totally, assembles, appends `sketch.json` to the generated files and accepts through the existing `acceptCandidate` in lenient mode (design-taste validators skipped; compile/commerce/preflight kept). Attempts get phase `'sketch'`.

**Tech Stack:** existing `sourceProviderBody` / `sourceResponseJson` (pattern: `source-composition-review.ts:46-55`), `repairSketch`/`assembleSketch` from `./sketch`, config parsing mirroring `yapiEngine` (`configuration.ts:368`).

**Spec:** `docs/superpowers/specs/2026-10-02-sketch-first-yapi-program.md` (sub-project 2).

## Global Constraints
- The sketch path never throws to the merchant: provider error, timeout, budget-reserve failure or garbage JSON all fall back to the repaired default sketch and still save.
- Redesigns/edits of existing stores and `execution.candidate` runs are untouched; `YAPI_SKETCH_FIRST=off` restores the old path entirely.
- `sketch.json` rides in `generated.files` (not a next-source path, so authored validation ignores it) and lands in the saved revision.

## Review Focus
- Provider returns truncated/garbage JSON → default sketch saved, run COMPLETED (Task 2 test b).
- Existing store (previous revision) must not enter the sketch path (Task 2 test c).
- Budget reserve throwing must not fail the run (total `sketchFromResponse` + try/catch around the call; asserted by test b's no-throw).
- Photos offered to the model are only bundled asset paths; hallucinated ones die in `repairSketch` (sub-project 1 tests already pin).

### Task 1: `sketch-request.ts` (schema + prompt + total conversion)
Files: create `apps/api/src/storefront-source/sketch/sketch-request.ts`, test `sketch-request.spec.ts`.
Produces: `SKETCH_JSON_SCHEMA` (strict object schema; blocks as `anyOf` of 10 per-type objects, `additionalProperties:false` everywhere); `sketchPrompt(input: { storeName: string; purpose: 'shop'|'service'; instruction: string; brief: unknown; photos: Array<{ path: string; description?: string }>; catalogNames: string[] })` → string naming every photo path, catalog names, font ids from `SOURCE_FONT_IDS`, the five palette roles and the block types; `sketchFromResponse(body: unknown, ctx: SketchContext): { sketch: StoreSketch; notes: string[] }` = `repairSketch(tryJson(body))` where tryJson uses `sourceResponseJson` and returns undefined on any throw.
Steps: failing spec (prompt contains photo paths/instruction/a font id; `sketchFromResponse(null, ctx)` and a non-JSON `output_text` both yield the catalog+footer default; a valid response round-trips its headline) → RED → implement → GREEN → tsc → commit.

### Task 2: config flag + generation wiring + behavior tests
Files: modify `apps/api/src/config/configuration.ts` (type `yapiSketchFirst: boolean`; parse `process.env.YAPI_SKETCH_FIRST !== 'off'`), `apps/api/src/storefront-source/source-generation.service.ts` (three-way branch; attempts `phase` union + `'sketch'`), tests in `source-generation-agent.spec.ts`.
Wiring (inside `generate()`, replacing `if (agentEngine) {`):
```ts
if (agentEngine && !previous && !execution?.candidate && this.config.get<boolean>('app.yapiSketchFirst') !== false) {
  await progress?.('building');
  const sketchCtx: SketchContext = { storeName: data.storeName || owner.slug, purpose: sitePurpose === 'shop' ? 'shop' : 'service', photos: assets.filter(a => /\.(png|jpe?g|webp|avif)$/i.test(a.path)).map(a => a.path) };
  const prompt = sketchPrompt({ storeName: sketchCtx.storeName, purpose: sketchCtx.purpose, instruction: dto.instruction, brief: dto.brief, photos: sketchCtx.photos.map(path => ({ path, description: imageUses.find(use => use.url === assetLegend.find(a => a.path === path)?.original)?.description })), catalogNames: data.items.map((item: { name: string }) => item.name).slice(0, 30) });
  const attempt = { model: plan.model, phase: 'sketch' as const, durationMs: 0, status: 'FAILED', usage: null } as (typeof attempts)[number];
  attempts.push(attempt);
  let body: any = null;
  const started = Date.now();
  try {
    const allocation = budget.reserve(plan.model, Math.ceil(prompt.length / 3) + 2000, 6000, 500);
    try {
      const response = await fetch(provider.endpoint, { method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(sourceProviderBody({ model: plan.model, store: false, instructions: 'Diseña el boceto de la tienda como JSON estricto según el esquema. Usa solo las fotos y fuentes listadas.', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }] }], max_output_tokens: allocation.outputTokens, reasoning: { effort: 'low' }, text: { format: { type: 'json_schema', name: 'store_sketch', strict: true, schema: SKETCH_JSON_SCHEMA } } })) });
      body = await response.json().catch(() => null);
    } finally { allocation.settle(body?.usage); }
  } catch { /* total: any failure falls through to the default sketch */ }
  signal.throwIfAborted();
  attempt.durationMs = Date.now() - started; attempt.usage = sourceUsage(plan.model, body?.usage); attempt.status = 'COMPLETED';
  const { sketch } = sketchFromResponse(body, sketchCtx);
  generated = { label: `Boceto de ${sketchCtx.storeName}`.slice(0, 120), files: [...assembleSketch(sketch, sketchCtx), { path: 'sketch.json', content: JSON.stringify(sketch, null, 2) + '\n' }] };
  lenient = true;
  try { await acceptCandidate(); } finally { lenient = false; }
} else if (agentEngine) { /* existing agent code unchanged */ } else { /* existing single engine unchanged */ }
```
Tests (`source-generation-agent.spec.ts`, existing `setup()`/`input()` helpers; make the store "new" the way the file's conventions allow — mock `projects.current` to `{ revision: 0, slug: 'pausa' }` and `projects.version` to a revision-0 empty snapshot, following the nearest existing pattern):
- (a) new store + fetch returning one `output_text` with a valid sketch JSON → `projects.save` called; saved files include a `components/home.tsx` containing `skb-` and a `sketch.json`; `fetch` called exactly once.
- (b) new store + fetch rejecting → still saves (default sketch: `data-pagosya-catalog` and footer present).
- (c) `input(brief)` as today (previous revision exists) + agent-style mocks → sketch path not taken (the first fetch body contains `tools`, i.e. the agent loop ran).
Steps: RED (tests) → implement → GREEN → full `source-generation-agent.spec.ts` + tsc → commit.

### Task 3: status + ship
Update the program spec status line (sub-project 2 built, commits), run the sketch + generation-agent suites, commit, push to main.
