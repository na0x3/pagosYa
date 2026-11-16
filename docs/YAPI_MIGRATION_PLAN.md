# YAPI migration plan — section fill now, hybrid engine later

From [YAPI_CURRENT_ARCHITECTURE.md](YAPI_CURRENT_ARCHITECTURE.md) to [YAPI_GENERATION_V2.md](YAPI_GENERATION_V2.md).

**Standing decision (owner, 2026-11-13):** section fill is the only engine for two weeks (to 2026-11-27). No parallel V2 engine,
no new generation mechanism beside it. Every change is measured on the seven brands (NOA, Oh Belly, BOXY, Pawby, rhode, Remolino,
Cuadrízate). V2 interfaces are introduced *inside* section fill when a short-term change needs them, never ahead of need.

## 1. Guardrails for short-term work

Every change in the two weeks must pass these, or it does not ship:

1. **No new CSS layer.** No new theme block, no new `!important`, no rule scoped to one theme or template. A visual fix is a
   token value, a look a section already declares, or a data op on the layout.
2. **No template-specific branch in code.** No `if (theme === '…')`. What a template allows comes from data
   (`section-fit.json`, the preset's own `layout` and `choices.looks`).
3. **Data in, data out.** Corrections change the layout (`LayoutBlock[]`), never the stylesheet or component source.
4. **Reuse before adding.** The render sandbox, page rules, vision review and change applier already exist; extend them.
5. **Flag-gated, off = today.** A new stage sits behind a flag; with the flag off the build is exactly today's.
6. **Measured.** A change lands with its numbers on the seven brands (§4).

## 2. The vertical slice: «fill review» (render → inspect → repair on section fill)

### What it does

After section fill has built a template home (after the last `with*` pass in `sectionLibrary`) and saved it, one bounded loop runs:

1. **Render** the layout in the existing offline sandbox (`refillDraft` → `withVisualSandbox`) at 1280 px and 390 px.
2. **Inspect**
   - deterministic page rules (`evaluateTemplateRules`) at both widths. **Changed:** each finding returns
     `{ rule, at, viewport, severity, note }` — `at` is the section index read from `data-lb-at` on the nearest section root —
     instead of a bare text line. One rule is added: **horizontal overflow on the phone** (`h-overflow`: an element wider than the
     viewport, reported on its section).
   - vision review (`reviewHome`, the composer's reviewer, closed problem list) on screenshots from the same render, with the rule
     findings passed in as text so it does not re-report them.
3. **Repair** — findings become typed ops on the layout:
   - rule findings with a safe default fix need no model: text-only band → `remove` (or `band: paper` for a dark band), repeated
     photo → `photo` with an unused one, an unfinished section → `remove`;
   - the reviewer's ops (`look`, `photo`, `band`, `move`, `remove`) go through `applyComposerChanges`. `swap` stays off in this
     slice (it needs a rewrite call and could bring back sections the clean home removed);
   - guards from the applier: the cover never moves, the main grid is never removed, signature sections stay, a look must be one
     that section declares for this template.
4. **Re-check** — render again and run the rules. The round is **kept only if no rule fires more often than before, at either
   width** (counted per rule and width, so a removed section shifting the numbers below it is not a new finding); otherwise the
   previous layout is kept. A reviewer change can therefore land when the rules found nothing, but never at the price of a rule.
   (Vision findings steer the changes; the keep/discard decision is deterministic — `noWorse` in `source-fill-review.ts`.)
5. At most **2 rounds** and a cost cap (`YAPI_FILL_REVIEW_MAX_USD`, default 1). A failed capture or review keeps the layout as it
   was (a spent quota or a cancel still stops the build, as today).

### How it is saved

The fill result is saved first, as today («Portada de YAPI»). If the review changed anything, the reviewed layout is saved as the
next revision, **«Portada revisada por YAPI»**, with the applied ops and finding counts in the reply metadata. That gives
rollback for free (the revision before) and a paired before/after on the *same* fill — the clean measurement the benchmark needs,
because the model's variance between two builds is larger than the effect being measured.

### Where it goes in code

| File | Change |
|---|---|
| `source-template-qa-rules.ts` | Rules return structured findings (`rule`, `at`, `severity`, `note`); `h-overflow` rule added. The log keeps its text lines (formatted on the Node side). |
| `source-template-qa.ts` | `templateQaFindings` returns the structured findings, plus screenshots from the same render when asked (one render per width). |
| `source-fill-review.ts` (new) | `runFillReview(deps)` — the loop above, every side effect injected (same shape as `runComposer`); `ruleRepairs(findings, layout)` — default ops for rule findings; `fillReviewTemplate(...)` — what may change, from `section-fit.json` via `composerTemplate` + `fillableTemplate`, falling back to the home's own types and looks. |
| `source-chat.service.ts` | `sectionLibrary`: when `YAPI_FILL_REVIEW=1`, after the first `refill`, run the review and save the second revision. |
| `config/configuration.ts` | `yapiFillReview`, `yapiFillReviewMaxUsd`. |
| `source-composer.ts` | Nothing removed. `applyComposerChanges` and the review schema are reused as they are. |

No CSS, template or kit file changes.

### Tests (one spec file per run)

- `source-fill-review.spec.ts`: the loop keeps the last good layout when a round adds findings; stops at 2 rounds and at the cost
  cap; a failed capture/review keeps the input; rule findings map to the right default ops; cover/grid/signature guards hold;
  ops reference only indexes that exist.
- Rules behaviour: run the rules in Playwright on two tiny fixture pages (a text-only band at index 2; a phone overflow at index 1)
  and assert `{rule, at, viewport}`.
- Commerce stays correct: the reviewed layout still passes `validateLibraryLayout` and keeps the catalogue grid and cover.

### Acceptance for the slice

On the seven brands, with the review on, compared to the same fills before the review:

- blocking rule findings (desktop + phone) go down on at least 5 of 7 stores, and up on none;
- no store loses its catalogue, cart button or cover; all pass the publish contract;
- added time ≤ 3 min per store (median), added cost ≤ $1 per store;
- the owner's scorecard for the reviewed revision is not lower than the unreviewed one on any brand.

If those do not hold, the flag stays off and the result goes into the two-week evaluation as evidence.

## 3. Benchmark harness (part of the slice)

The rebuild drivers used until 2026-11-13 lived only in session scratchpads. They are now in the repo as
`apps/api/scripts/brand-bench/*.cjs` (plain JS: the API watcher compiles every `.ts` under `apps/api`), with the brands' first
messages in `examples/brand-bench/brands.json`. A round: `session.cjs` (a 10 h dev session, token kept outside the repo in
`~/pagosya-benchmarks/live.json`) → `prepare.cjs <round>` → `drive.cjs <round> <keys…>` in waves of 4 + 3 → `measure.cjs <round>`:

- `prepare` — clone the seven demo catalogues (`examples/cmp-*/demo.json`) into fresh stores for a round;
- `drive` — run the first build through the chat API, in two waves (4 + 3), recording store id, revisions and minutes;
- `measure` — for each store's revisions: rule findings at 1280/390, `h-overflow`, screenshots (desktop + phone),
  `scoreStores` surface distances between the seven, home section sequences, cost from metering;
- one JSON per round under `examples/brand-bench/<round>/`, loaded into the scorecard artifact
  (`https://claude.ai/artifact/MvdtDX1Em7wYYeH4de6uzF`) next to the owner's 1–5 scores, with a phone column added.

The drivers read the API URL and login from the environment, never from a file in the repo.

## 4. Two-week evaluation (2026-11-27)

Rounds run in waves on the same seven brands. Baselines: the Nov 10 set (owner-preferred) and today's round-1 / clean1 builds.

| # | Question | Measured by | Source |
|---|---|---|---|
| 1 | Visual quality improved across the seven? | owner scorecard mean (unique / professional / brand / works) per round, per brand | scorecard artifact |
| 2 | Mobile quality | blocking findings at 390 px, `h-overflow` count, owner phone score | `measure`, scorecard |
| 3 | Reliability and time | builds finished / started, failed calls («sigue» needed), median minutes, $ per store | `drive` log, product log, metering |
| 4 | Remaining similarity | `scoreStores` pair distances (closest pair, mean), share of identical section sequences between stores on the same template, owner «looks unique» score | `measure`, scorecard |
| 5 | Has section fill reached its ceiling? | the decision rule below | all of the above + the owner's last complaints |

### Decision rule

Section fill has reached its practical ceiling when, over the last two rounds, **all three** hold:

1. the owner's mean score rose by less than 0.3 (on 1–5) per round;
2. in at least 4 of 7 brands the owner's remaining complaints are about **composition** the catalogue cannot express (a layout,
   not a colour, photo, word or bug) — each complaint is tagged when it is recorded;
3. the closest pair of stores on the same template is still under `MIN_PAIR_DISTANCE` (0.25), or they share the same section
   sequence.

If they hold → recommend starting V2 Phase 2. If not → another two weeks of section fill, then the evaluation again.

## 5. Phases after the decision

Each phase is behind a flag, keeps existing stores rendering, and is benchmarked on the seven brands before the next begins.

| Phase | What | Depends on | Exit check |
|---|---|---|---|
| 1 (now) | Audit + docs; fill review; brand-bench harness | — | slice acceptance (§2) |
| 2 | `PageSpec` v1 adapter (`fromLayout`/`toLayout`); `PatchOp` = `applyComposerChanges` renamed `applyPatch`; chat layout edits use the same ops; `MerchantContext` v1 with ids | decision gate | every existing store round-trips losslessly; edit specs pass |
| 3 | Parametric nodes: catalogue entries declare props; validator; the planner (`DesignPlan` v1) picks them; first scoped section styles | 2 | two brands in one industry with different compositions on the same template |
| 4 | Build sandbox worker (no secrets, no network, limits, import allowlist, tsc, lint) + `CommerceView` mounts | 2 | sandbox isolation tests (no env, no fetch, no fs escape, timeout) pass |
| 5 | Custom nodes, presentation only, mixed with library/param nodes; the repair loop covers them | 3, 4 | the V2 brief's acceptance criteria 1–10 on the seven brands |
| 6 | Hardening: per-stage events, resumable stages, artifact GC, monitoring | 5 | |

## 6. Tracks that run alongside

- **Track A — retire parallel paths.** When a phase replaces a dormant path (composer → fill review + plan; chassis / studio writer
  → custom nodes), its flag and code are removed, not kept as one more option.
- **Track B — ids instead of names.** Product names / photo indexes in layouts → ids, behind the adapter.
- **Track C — CSS.** Move library sections' styles out of the 485 KB `globals.css` into scoped per-section files, one section at a
  time, checked by screenshot comparison on the seven brands; theme-scoped selectors become token values or declared looks.

## 7. Risks

- **Model variance hides small effects** → paired before/after revisions on the same fill (§2).
- **Live builds take 5–25 min and the plan quota runs out** → waves of 4 + 3, check the quota before a round, resume with «sigue».
- **Saving `apps/api` files restarts the API and kills running jobs** → no API edits while a round runs; check for RUNNING jobs
  before each save.
- **Store stylesheet near its cap** (`MAX_STORE_SHEET` 400 000) → the slice adds no CSS.
