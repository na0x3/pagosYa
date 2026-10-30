# Home Writer Variety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each writer run starts from one of six page directions, picked per store and never one the last 3 stores used. Bold
brands usually get an animated home.

**Architecture:**
- **`home-directions.ts`:** a pure module holding the six briefs, the motion brief, a seeded picker and a motion counter.
- **Brand mood:** the first build saves the brand's tone as `variants.mood` in `components/store-data.tsx`.
- **The writer stage:**
  - reads the store's mood and fashion card, the recent stores' `home-direction.json`, and the recent fonts and paper;
  - picks (or reuses) the direction and adds its brief to the task;
  - saves `home-direction.json` with the revision.
- **The toolbox:** lists the kit's motion parts only for animated stores, and adds one advice line when they use fewer than 3.

**Tech Stack:** NestJS API, TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-10-30-home-writer-variety-design.md`

## Global Constraints

- Directions: `editorial`, `producto`, `lookbook`, `bandas`, `manifiesto`, `historia`.
- Pick:
  - never one used by the last 3 stores that have one;
  - fashion stores count `lookbook` and `editorial` twice;
  - same seed and same recent list give the same pick.
- Animated: `bold` 3 in 4, `calm` 1 in 5; unknown mood counts as calm.
- Saved file: `home-direction.json`, holding `{ "direction": string, "animated": boolean }`. A re-run on a store that has one
  reuses it.
- Motion advice, never blocking: an animated home using fewer than 3 distinct motion parts.
- No change to the writer's limits, blocking checks, fallback or switch.
- Edits to `apps/api/src` restart the API: check that no YAPI job is QUEUED or RUNNING first. Use
  `npx tsc --noEmit --incremental false`. Run named specs with `--runInBand`.

## Review Focus

1. **A store whose previous revision has no `variants.mood`** (every store built before this): counts as calm, never throws.
   Test in Task 1.
2. **All six directions used by recent stores**, e.g. a shop that rebuilt many times: the pick still returns a direction (the
   least recent). Test in Task 1.
3. **A malformed `home-direction.json`** on the store or on a recent store: ignored, a fresh pick is made. Test in Task 3.
4. **Fewer than 3 recent stores:** any direction not yet used is fine. Test in Task 1.
5. **The motion list leaking into a still store's brief:** it must not. Test in Task 3.

---

### Task 1: The directions module

**Files:**
- Create: `apps/api/src/storefront-source/home-directions.ts`
- Test: `apps/api/src/storefront-source/home-directions.spec.ts`

**Interfaces:**
- Produces:
  - `HOME_DIRECTIONS: Record<HomeDirectionId, string>`, holding the six Spanish briefs
  - `HomeDirectionId`
  - `HOME_MOTION_BRIEF: string`
  - `pickHomeDirection(input: { seed: string; recent: HomeDirectionId[]; fashion: boolean; mood?: 'bold' | 'calm' }): { direction: HomeDirectionId; animated: boolean }`
  - `parseHomeDirection(content: string | undefined): { direction: HomeDirectionId; animated: boolean } | null`
  - `motionPartsUsed(home: string): string[]`

- [ ] **Step 1: Failing tests:**
  - the same input gives the same output;
  - over 200 seeds, never one of `recent.slice(0, 3)`;
  - with all six recent, it returns the one used longest ago (the last item);
  - fashion with an empty recent list picks lookbook or editorial clearly more often than 2 in 6 (over 600 seeds, more than 40%);
  - over 2,000 seeds, the animated share is within 0.65–0.85 for bold and 0.12–0.28 for calm, and an undefined mood behaves
    like calm;
  - `parseHomeDirection` accepts the saved shape and returns null for junk, an unknown id or a non-boolean;
  - `motionPartsUsed` finds the distinct parts in JSX (`<ScrollScale`, `<ParallaxStack`, `<Statement`, `<Marquee`,
    `<EntranceGroup`, `<ProductShowcase`, `scrollGrow`) and ignores comments;
  - every brief names its cover.
- [ ] **Step 2: Run, watch it fail** (module missing).
- [ ] **Step 3: Implement.**
  - **Seed:** an FNV-1a hash of `seed` into [0, 1), using a separate salt for each draw (direction, animated).
  - **Pool:** the directions not in `recent.slice(0, 3)`; when that's empty, the last of `recent`. Fashion doubles lookbook and
    editorial in the pool.
  - **Animated:** `rand < (mood === 'bold' ? 0.75 : 0.2)`.
  - **Briefs:** follow the spec's table (cover, rhythm, type, photos, what to avoid), each 4–6 lines in Spanish.
  - **`HOME_MOTION_BRIEF`:** lists each motion part with one usage line and its import from `@pagosya/ui`, and asks for at least
    three different ones.
- [ ] **Step 4: Run, pass.**
- [ ] **Step 5: Commit** `feat(yapi): six home page directions, picked per store; the animated look by brand mood`.

### Task 2: The first build saves the brand mood

**Files:**
- Modify: `apps/api/src/storefront-source/source-templates.service.ts` (`applyMaster`, after `variants` is settled for the
  plan, dice and preset paths)
- Test: `apps/api/src/storefront-source/source-templates.service.spec.ts`

- [ ] **Step 1: Failing tests:**
  - a fill with `character.tone: 'bold'` saves `variants.mood === 'bold'`, under a plan and under the dice;
  - no character saves `calm`.
- [ ] **Step 2: Run, watch it fail.**
- [ ] **Step 3: Implement:** `variants = { ...variants, mood: fill?.character?.tone === 'bold' ? 'bold' : 'calm' }`, where
  `variants` is defined. Leave the starter path alone if its variants are built elsewhere; note it in the ledger.
- [ ] **Step 4: Run the templates spec plus `source-master` specs, pass.**
- [ ] **Step 5: Commit** `feat(esencial): the first build saves the brand mood with the store's variants`.

### Task 3: The writer uses the direction

**Files:**
- Modify: `apps/api/src/storefront-source/source-home-writer-stage.ts`
- Modify: `apps/api/src/storefront-source/agent/home-writer-tools.ts` (ctx `animated`; `read_chassis` motion list; advice line)
- Test: `source-home-writer-stage.spec.ts`, `agent/home-writer-tools.spec.ts`

**Interfaces:**
- Produces:
  - `homeWriterTask(input: { instruction; storeName; direction; animated; avoid: { fonts: string[]; papers: string[] } }): string`
  - `HomeWriterToolbox` ctx gains `animated?: boolean`
- `runHomeWriterStage`:
  1. reads `previousFiles`: `readMasterState(...).variants?.mood`, fashion (`variants.cards === 'fashion'`), and an existing
     `home-direction.json`;
  2. reads recent directions with a SQL query like `recentMasterRolls`: the `home-direction.json` content of the latest
     revision of up to 6 other stores, newest first, parsed with `parseHomeDirection`;
  3. reads `recentLooks(prisma, storeId, 6)` for fonts and paper;
  4. picks, unless reusing;
  5. passes `animated` to the toolbox and the task to the loop;
  6. in `gate`, appends `{ path: 'home-direction.json', content: JSON.stringify(choice) }` to `live.generated.files`.

- [ ] **Step 1: Failing tests:**
  - `homeWriterTask` contains the direction brief, the avoid list (fonts and papers), and `MOVIMIENTO` only when animated;
  - `read_chassis` lists `ScrollScale` only for an animated toolbox;
  - `check` on an animated toolbox whose home uses fewer than 3 motion parts gives the advice line and nothing blocking for it;
  - a malformed saved `home-direction.json` is ignored (`parseHomeDirection` returns null, so a fresh pick is made).
- [ ] **Step 2: Run, watch it fail.**
- [ ] **Step 3: Implement as above.** `home-direction.json` is not a source file, so `SourceChatService.homeWriter`'s stray guard
  already allows it. Confirm that with one chat-master test where the writer's revision adds the file and is kept.
- [ ] **Step 4: Run the writer, stage, chat-master and generation specs, plus tsc. Pass.**
- [ ] **Step 5: Commit** `feat(yapi): the home writer starts from the store's page direction, animated for most bold brands`.

### Task 4: Live check (6 stores)

- [ ] **Clone and build:** clone 6 catalogs (NOA from pomxzpd5, which has photos; Gramiyaa; PEPPA; DooBoo; and two with photos
  from `~/Downloads`, e.g. `oh belly` and `boxy`). Build them through the chat-jobs API, with a session row written straight to
  the database and helper scripts in the ledger folder, never under `apps/api`.
- [ ] **Record each store:** direction, animated, minutes, calls, tokens, and whether its home was kept.
- [ ] **Expect:** at least 4 different directions and at least 2 animated stores. Revoke the session afterwards.
- [ ] **Write it up:** a findings list in the ledger. The owner judges variety in the Studio.
