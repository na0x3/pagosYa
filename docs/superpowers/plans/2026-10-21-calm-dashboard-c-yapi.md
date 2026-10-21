# Calm dashboard — Part C: YAPI immersive — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Writing to YAPI feels like stepping into the design room: a glass dock, a slow move into Tienda › Diseño, and a glass window over the live preview that writes — word by word — what YAPI will do, what it is doing and what it did.

**Architecture:** Three pieces. (1) API: `plan_task` adds one «Voy a: …» progress detail per requirement, so the plan reaches the Studio as text. (2) Studio: a pure narration model (`source-narration.ts`: progress + reply → sentences) and a narrator window (`source-narrator.ts` + css) mounted on `document.body` so Studio re-renders never touch it; the build lifecycle feeds it (submit → request line, progress polls → plan/step sentences, complete → summary, interrupt → plain stop). (3) Dashboard: the dock becomes a glass pill; sending (dock, «Pídele a YAPI», Crecimiento) plays an immersive move — a glass card carrying the typed text flies to where the narrator opens while the page dissolves into Diseño (View Transitions where available, a fade otherwise, nothing under reduced motion).

**Tech Stack:** NestJS agent tools (jest spec), Studio TypeScript (vitest), dashboard ES modules (`node:test` + jsdom), CSS.

**Spec:** `docs/superpowers/specs/2026-10-21-calm-dashboard-yapi-immersive-design.md` — Part C (C1–C4).

## Global Constraints

- No new model calls: the narrator only re-voices text YAPI already produces (step labels, «Voy a: …» plan details, the reply message).
- Glass = `backdrop-filter` with a near-opaque fallback; yellow = YAPI.
- Typing ~28 characters/second, word by word with a soft fade; a click finishes the sentence; `prefers-reduced-motion` shows whole sentences at once. Screen readers get each finished sentence once (`aria-live="polite"` region separate from the animated text).
- Saving `apps/api` restarts the API and kills running YAPI jobs: count RUNNING `StoreSourceChatJob` rows right before the API edit; wait if any.
- The dashboard serves a pre-built Studio: run `pnpm --filter @pagosya/merchant-dashboard run build:studio` after Studio edits before any live check.
- API jest: run only the agent-tools spec, with `--runInBand`.

## Review Focus

1. A request that fails or is interrupted — the window says so plainly and stops typing; no endless «trabajando».
2. Two requests in a row — the second resets the window (no mixed plans).
3. A reply with no build (YAPI only answers a question) — the window shows the answer as the summary.
4. Reduced motion — no flying card, no typing, no page dissolve.
5. Browsers without View Transitions — a plain fade; the dock's text still reaches YAPI.

---

### Task 1: The plan reaches the Studio (API)

**Files:** `apps/api/src/storefront-source/agent/agent-tools.ts` (~line 299); test `apps/api/src/storefront-source/agent/agent-tools.spec.ts`.

- [ ] Test: after a valid `plan_task` call, `toolbox.steps` contains `{ kind: 'plan_task', label: 'Planificó 2 requisitos' }` followed by `{ kind: 'plan_task', label: 'Voy a: <description>' }` for each requirement, in order.
- [ ] Count RUNNING chat jobs (read-only Prisma `groupBy`); proceed only at zero.
- [ ] Implement right after the existing `step('plan_task', …)`:

```ts
        // The Studio's narrator writes the plan to the merchant (spec 2026-10-21 C4): one detail per requirement.
        for (const requirement of this.requirements) step('plan_task', `Voy a: ${requirement.description}`);
```

- [ ] Run `npx jest src/storefront-source/agent/agent-tools.spec.ts --runInBand` → PASS. Commit.

### Task 2: Narration model (Studio, pure)

**Files:** Create `apps/merchant-studio/src/source-narration.ts`, `source-narration.test.ts`.

**Produces:** `type Narration = { phase: 'plan' | 'work' | 'done' | 'stopped'; lines: string[] }`; `narrationFromProgress(progress: BuildProgress | null): Narration`; `narrationFromReply(text: string): Narration`; `stoppedNarration(): Narration`; `typingPlan(text: string, cps?: number): Array<{ word: string; at: number }>`.

- [ ] Tests:
  - plan details («Voy a: Cambiar el título», «Voy a: Poner fotos») → `phase: 'plan'`, lines `['Esto es lo que voy a hacer:', 'Cambiar el título.', 'Poner fotos.']` (a missing final period is added).
  - a running step after the plan → `phase: 'work'`, last line `«Ahora: <label en minúscula inicial>…»`, plan lines kept above it.
  - failed progress → `phase: 'stopped'`, line `'Me detuve antes de terminar. Tu tienda sigue como estaba.'`.
  - `narrationFromReply('Listo, cambié X.\n\nDetalle técnico…')` → `phase: 'done'`, lines `['Listo.', 'Cambié X.']` — a leading «Listo,»/«Listo.» is stripped and re-added as the first line; only the first paragraph, max 320 chars.
  - `typingPlan('Hola mundo', 28)` → two words, the second at ≥ 5/28 s.
- [ ] Implement, run `npx vitest run src/source-narration.test.ts` → PASS. Commit.

### Task 3: Narrator window (Studio)

**Files:** Create `apps/merchant-studio/src/source-narrator.ts`, `source-narrator.css`, `source-narrator.test.ts` (jsdom via `// @vitest-environment jsdom`).

**Produces:** `mountNarrator(doc: Document, opts?: { reducedMotion?: () => boolean }): { open(request: string): void; show(n: Narration): void; close(): void; element: HTMLElement }`.

- [ ] Tests (fake timers): `open('Hazme…')` shows the window with the request as a quoted first line; `show(plan)` types words over time and the `[data-narrator-live]` region receives each whole sentence once; a click on the text finishes the current sentence; `show(done)` collapses to a pill «YAPI · Resumen» after the text finishes, the pill reopens it; Escape closes; with `reducedMotion: () => true` the text appears at once.
- [ ] CSS: fixed bottom-right (24px), width min(380px, calc(100vw - 32px)), glass (`rgb(255 255 255 / .66)`, `blur(24px) saturate(1.6)`), 24px radius, YAPI star, serif first line, words fade in (`opacity` + 4px rise, 260ms), pill state 44px tall. Reduced motion: no transitions.
- [ ] Run → PASS. Commit.

### Task 4: Wire the narrator into the build (Studio)

**Files:** `apps/merchant-studio/src/source-studio.ts` (submit ~662, `updateBuildProgress` ~518, completion ~490/683, interrupt ~408/733); bridge in `source-narrator.ts`.

- [ ] Test the bridge: `bridge.submitted(text)` → `open(text)`; `bridge.progress(p)` → `show(narrationFromProgress(p))` only when the narration changed; `bridge.completed(reply)` → `show(narrationFromReply(reply))`; `bridge.interrupted()` → `show(stoppedNarration())`.
- [ ] Call the bridge at the four lifecycle points; the reply is the newest assistant message after `load()`.
- [ ] Studio vitest suite green. `build:studio`. Commit.

### Task 5: Glass dock and the immersive move (Dashboard)

**Files:** Create `apps/merchant-dashboard/src/immersive.mjs`, `src/immersive.test.mjs`; modify `src/dashboard.js` (`composeInYapi`, dock submit), `src/premium.css` (dock + ghost card), `server.mjs` allowlist.

**Produces:** `flightFrames(from, to): Keyframe[]`; `narratorTarget({ width, height }): { left, top, width, height }` (bottom-right 24px, width min(380, vw-32), height 120); `playImmersiveMove({ doc, from, text, go, reducedMotion }): Promise<void>` — runs `go()` (the view switch) inside `document.startViewTransition` when present, flies a `.yapi-ghost` card with `text` from `from` to the target over 700ms, then removes it.

- [ ] Tests: `flightFrames` starts at the dock rect and ends at the target with opacity 0; `narratorTarget({width: 390, height: 844})` stays inside the viewport; `playImmersiveMove` with `reducedMotion: true` calls `go()` once and adds no ghost; without View Transitions it still calls `go()` once.
- [ ] Wire: the dock submit and `composeInYapi` call `playImmersiveMove` with the dock's rect (or the clicked line's rect) and the text; `go` = the existing view switch + `deliverStudioAction()`.
- [ ] premium.css: the dock is a glass pill (`border-radius: 999px`, glass, star, 56px tall, max-width 680px); the ghost card mirrors the narrator's glass.
- [ ] Unit + e2e suites green. Commit.

### Task 6: Live run

- [ ] `build:studio`; reload; on a test store (pilts) send a small real request from the dock on the ChatGPT plan: see the move, the window type the plan, the steps, the summary, the pill. Check reduced motion and a phone width. Fix what the run shows (each with a test).
- [ ] Final review of Part C (fresh reviewer), fix Critical/Important, report.
