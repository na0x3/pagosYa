# YAPI agent cost: cacheable transcript, terra steps, continue instead of restart

Date: 2026-10-29 · Status: approved by the owner 2026-10-29; cache numbers corrected the same day after measuring 850 turns · Branch: `oct24-clean`

## Why

Owner review 2026-10-29: the overnight stores cost $2.7–4.9 each, and Andes (y6rhsb5q) and Atelier (3dsebvvh) also
looked bad. The owner chose to fix cost first: "run the build steps on a cheaper model and keep sol only for planning
and the final review. When a run hits the step limit, continue from where it stopped instead of starting over."

Measured on the two stores (read-only from `StoreSourceGeneration.attempts`):

| Store | Run | Agent turns | Input | Cached | Output |
|---|---|---|---|---|---|
| Atelier | FAILED (15-step cap) | 15 sol | 829k | 426k (51%) | 8.6k |
| Atelier | COMPLETED | 24 sol | 1,431k | 962k (67%) | 5.4k |
| Andes | FAILED (15-step cap) | 15 sol | 763k | 328k (43%) | 6.8k |
| Andes | COMPLETED | 20 sol | 1,072k | 518k (48%) | 3.5k |

Prices (`source-generation-policy.ts`): sol $4 / $0.40 cached / $20 out per M; terra $2 / $0.20 / $12.

Three findings:

1. **Input is the cost; output is noise.** Each turn resends 40–65k tokens and writes ~300.
2. **Most turns miss the cache.** Across ~850 agent turns since 2026-10-26, the uncached input came from: turns with
   nothing cached 65%, turns with only the instructions cached (~12k) 17%, partial hits 15%, full hits 3%. Only the
   partial hits are explained by the code: `compactAgentTranscript` (`agent/agent-loop.ts`) rewrites an old item almost
   every turn (a `read_file` output once it falls 12 items behind the end, the previous screenshot whenever a new one
   arrives), which breaks the cached prefix at that point. The full misses are not explained: the cache key
   (`sourcePromptCacheKey`) is stable per store and the ChatGPT-plan bridge forwards it (`scripts/chatgpt-plan/transport.mjs`
   strips `prompt_cache_retention` but not `prompt_cache_key`). They look like provider-side routing or expiry.
3. **Both retries started over.** The second run on each store opened with `plan_task → screenshot → read_file` and
   rebuilt the store from scratch; the failed run's 15 steps (~$2.2 per store) were thrown away. Resume already
   exists (`source-generation.service.ts`, `priorRun`/`resumable`), but a first design's instruction is a brief
   written by AI on every attempt (`source-chat.service.ts`, the `followUp` with `firstDesign: true`), so the retry's
   `checkpointKey` and `requestKey` never match the failed run's checkpoint.

Estimated cost per first design (assumes ~25 turns at ~55k input):

| Change | Per store |
|---|---|
| Today (failed run + full retry) | ~$4.6 |
| Resume instead of restart | ~$3.0 |
| + terra for build steps | ~$1.5 |
| + cacheable transcript (fixes the partial-hit 15% only) | ~$1.3 |

Getting under ~$1 needs the full misses explained; Part 1 adds a probe that measures them (below), and any fix it
points to is a follow-up, not part of this spec.

## Scope

In: the agent loop's transcript compaction, the model the agent loop calls, first-design resume matching, and one
in-run continuation at the step limit.

Out: luna for build steps (later, behind the eval set); automatic hand-off to sol when terra stalls; the fashion
quality items (home catalogue cap, repeated-photo / empty-slider / clipped-column checks, asking for logo and photos);
fixing Andes and Atelier themselves.

## Part 1: cacheable transcript

`compactAgentTranscript` becomes append-stable: between two compactions, the transcript sent on turn N+1 begins
with exactly the transcript sent on turn N.

- An item, once compacted, stays compacted with the same replacement text. Compaction never un-compacts or
  re-compacts an item differently.
- Compaction runs in batches, not every turn. A batch is triggered when the uncompacted evictable content behind the
  recent window (old `read_file` outputs over 1,200 chars, screenshots other than the latest) passes a threshold of
  about 20k estimated tokens. When it fires, everything evictable behind the window is compacted at once.
- Between batches, screenshots stay in the transcript. The image count is still bounded by `AGENT_LIMITS.screenshots`
  (8), and a batch drops all but the latest.
- The state (which items are compacted) lives in the loop, not recomputed from scratch, so the output is a pure
  function of the transcript plus the set of compacted indexes.
- Never compacted, as today: instructions, the opening task, function calls, edit history, `verify` output.

Tests (`agent/agent-loop.spec.ts`):
- Prefix stability: drive `runAgent` with a fake model through ~25 turns that mix `read_file`, screenshots and edits,
  record each `transcript` the model receives, and assert that for every pair of consecutive turns with no batch
  between them, turn N's transcript is a strict prefix of turn N+1's.
- Cacheable share: across the same run, the sum over turns of the longest common prefix with the previous turn
  (in estimated tokens) is at least 85% of total input.
- The existing compaction guarantees still hold: the latest screenshot is always present, edit history and
  instructions are never evicted, and an evicted read says the file can be read again.

Cache probe: each agent attempt already records `inputTokens` and `cachedInputTokens`. Add one diagnostic per agent
turn to `attempts[]`: the estimated tokens of the longest prefix shared with the previous turn's request
(`prefixTokens`). In the live check, a turn whose `prefixTokens` is close to its input but whose `cachedInputTokens` is
near 0 is a provider-side miss, not ours. That settles whether the remaining misses are ours to fix.

## Part 2: terra for the build steps

- New config `app.yapiAgentStepModel`, env `YAPI_AGENT_STEP_MODEL`, default `gpt-5.6-terra`. Must be a known
  `SourceModel`; anything else falls back to the default.
- `runAgentStage` builds the agent model with the step model instead of `plan.model` when the request is `auto`
  (`plan.requestedModel === 'auto'`). An explicit model choice (the merchant's, or `YAPI_REDESIGN_MODEL` set to a
  concrete model) is used unchanged, as today.
- Unchanged and still on sol: design planning (`design` phase), the composition review (`visual` phase,
  `live.model`), the single-call repair paths, the chat touch (`YAPI_TOUCH_MODEL`).
- Accounting follows the model actually called: `onTurn` records `attempts[].model` and `sourceUsage(...)` with the
  step model, `metering.record` gets the step model, and `budget.reserve` prices with it (already does, via
  `input.model`). The Anthropic agent path keeps its own model and is not affected.
- Reasoning effort is unchanged (`low` for a lean first design, the plan's effort otherwise).
- `YAPI_AGENT_STEP_MODEL=gpt-5.6-sol` restores today's behaviour.

Tests: the agent model is built with terra for an `auto` first design and for an `auto` redesign; with sol when the
request names sol; attempts and metering carry the step model; the composition review still uses `live.model`.

## Part 3: continue instead of starting over

### 3a. First-design resume matching

A first design (`execution.firstDesign === true`) resumes a prior checkpoint when all of these hold:
- the prior run is on the same store and base revision, was itself a first design, ended FAILED / PARTIAL / BLOCKED /
  INTERRUPTED within 24h, and has a checkpoint (the existing `priorRun` query);
- the asset set matches (`matchingAssets`, as today).

The AI-written brief is not part of the match. To make "was itself a first design" checkable, `saveCheckpoint` adds
`firstDesign: true` to the checkpoint JSON for first-design runs. Every other request keeps today's matching
(`checkpointKey`, `requestKey`, `resumeDraft`).

When it resumes, the run keeps the checkpoint's design, requirements and files exactly as the existing resume path
does, so the restored requirements still bind the new run.

Tests (`source-generation` spec): a FAILED first design with a checkpoint, then a second first design on the same
base revision with a different brief and the same photos, resumes (restores the checkpoint's files and
requirements, skips planning). With different photos, or when the prior run was not a first design, it does not
resume.

### 3b. One continuation in the same run

When `runAgent` returns `{ status: 'limit' }` because the tool-call cap was reached (not wall time, not credits, not
`loop`, not `soft`), and the draft is not accepted, `runAgentStage` runs one continuation before falling through to
today's `acceptIfBuildable` / failure handling:

- Up to 12 more tool calls (`YAPI_AGENT_CONTINUE_CALLS`, default 12; 0 turns it off), inside the same run's wall
  clock (`agentWallWithin`), skipped when less than ~3 minutes remain.
- A fresh, short transcript: the same instructions; an opening built from the original task prompt, the toolbox's
  current requirements, the current workspace file list (as `agentOpening` builds it), the latest screenshot if any,
  and the last `verify` output, with one line saying this continues an unfinished draft and must not reduce the
  requirements.
- The same toolbox, workspace, pending themes and policies; checkpoints keep saving on each edit step.
- The continuation's turns are recorded as ordinary agent attempts (same phase, the step model).
- If the continuation ends without finishing, today's handling applies unchanged: a buildable draft is accepted as
  unchecked, otherwise the run fails and its checkpoint stays private for «sigue» (now resumable for first designs by 3a).

The continuation leg is a `runAgent` call with smaller limits and a different opening, not a second loop
implementation. `runAgent` must report which limit stopped it (`reason: 'steps'` for the tool-call cap) so the stage
can tell a step-cap stop from a wall-time stop.

Tests: a fake model that uses all its tool calls without finishing triggers exactly one continuation with the short
opening (the earlier turns are absent); a run that stops on wall time, credits, `loop` or `soft` does not continue;
`YAPI_AGENT_CONTINUE_CALLS=0` turns it off; a continuation that finishes is accepted through the normal gate.

## Live check

On the ChatGPT plan stack (`pnpm dev:chatgpt`), one first design of a test store with real photos (from
`~/Downloads`, see the test-store photos reference). Read its `attempts` afterwards:

- agent turns on terra, design and visual on sol;
- partial-hit breaks gone (every turn's `prefixTokens` covers the previous request except at compaction batches);
- the share of provider-side misses (high `prefixTokens`, ~0 cached) measured and reported;
- recorded cost under ~$1.5;
- if the run reached the cap, a continuation ran instead of a failed run plus a retry.

The owner judges the store against the sol-built ones. Before editing files under `apps/api`, check that no YAPI job
is RUNNING (saving restarts `nest --watch`).

## Risks

- Terra may write weaker CSS or fail checks more often. Mitigation: `YAPI_AGENT_STEP_MODEL` reverts in one line; the
  live check compares against a sol build.
- Batch compaction lets more screenshots stay in the transcript between batches, so some turns are larger. The
  cached rate on them makes this cheaper than today's uncached smaller turns; the cacheable-share test guards it.
- Resuming by store + revision + first-design + photos could resume a draft for a brief the owner meant to change.
  First-design briefs are written from the same onboarding answers, so this is the intended behaviour; a different
  set of photos does not resume.
