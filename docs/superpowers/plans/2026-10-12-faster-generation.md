# Faster Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merchant sees a working store about 3–4 minutes sooner. They can pick a style card as soon as both cards are planned, and the Sep-5 store is saved and shown before YAPI's self-review. The review lands later as a second version only if nothing changed in the meantime.

**Architecture:**
- **Choosable cards.** `proposeStyles` marks the proposal `pickable` once both cards are planned. It then calls a new `execution.onPickable` callback, and the chat replies at that moment. This frees the store's only chat-job slot: `StoreSourceChatJob.activeStoreId` is unique and the worker runs one job at a time, so the pick is a new job that could not start before.
- **The style run after that.** The style run keeps drawing heroes in the background, inside the same `generate()` call and lease. It polls its own row every 1 s and stops once the chat writes `PICKED` (or `SUPERSEDED`) into the proposal.
  - All of its writes after that point are guarded by `proposal.status = 'RUNNING'`, so a slow lane can never undo a pick.
  - On a pick, it aborts the other lane and gives the picked hero up to 15 s. It then writes the final proposal (`PICKED`, with the heroes it has) and releases the row (`AWAITING_STYLE`, `activeStoreId: null`). The 15 s hero wait therefore sits inside the build's ≤ 20 s release wait.
  - The build re-reads the proposal after the release. A hero is kept only when its `source` is `'model'`. Otherwise the author gets a new `sep5CardLook` paragraph (fonts, palette, header and hero draw, the concept's words) instead of `SEP5_KEEP_HERO`.
- **Draft first, review after.** The Sep-5 draft that passes `acceptCandidate()` gets standard pages and is saved as revision N right away. `generate()` then hands `startSep5Review` a closure built inside `generate()`. The closure reuses `acceptCandidate`, the standard-pages step and the save assembly, now extracted as `assembleSave()`.
- **Where the review lives.** The review runs on its own `StoreSourceGeneration` row with `status: 'REVIEWING'`. `status` is a plain `String`, so **no schema migration is needed**. The row holds no `activeStoreId`, so it never blocks a new request, and it has a 15 s heartbeat. It runs outside the chat request's `AsyncLocalStorage` context, so the finished job's lease fence and progress reporter are never touched.
- **Saving N+1.** N+1 «Revisión de YAPI» is saved through `projects.save`. Its fence flips the row from `REVIEWING` to `COMPLETED` in the same transaction, and `append()`'s existing optimistic revision check stays in place. The API itself writes the chat line «Pulí tu tienda: …».
- **Cancelling a review.** Two paths cancel a review: an in-process `AbortController` registry keyed by `storeId`, plus flipping the store's `REVIEWING` rows to `CANCELLED`, which also stops a review running in another API process.
  - Every non-candidate `generate()` cancels the store's review right after its revision check.
  - Studio cancels it (`POST source-project/review/cancel`) when the merchant starts editing.
- **What Studio reads.** `reviewPending` is true when a `REVIEWING` row exists on the current revision with a heartbeat at most 5 minutes old. The state endpoint returns it, and Studio polls every 4 s while it is true.

**Tech Stack:** NestJS 11 + Prisma 5 (apps/api, Jest + ts-jest), vanilla TypeScript Studio (apps/merchant-studio, Vitest 4 + jsdom).

**Spec:** `docs/superpowers/specs/2026-10-12-faster-generation-design.md`

## Global Constraints

- Branch: stay on `feature/store-page-architecture`. Never switch branches; the owner's dev servers read this working tree.
- Database: never run `prisma migrate`, `prisma migrate diff`, `prisma migrate reset`, `prisma db push` or anything else that writes to the dev DB. This plan needs no migration: the new row states (`REVIEWING`, `DISCARDED`, `CANCELLED`) live in the existing `StoreSourceGeneration.status` `String` column.
- Tests: run only the targeted spec files named in each step, always with `--maxWorkers=2`. Never run a whole folder or `pnpm test`.
- API test command shape: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/<file>.spec.ts --maxWorkers=2`.
- Studio test command shape: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/<file>.test.ts --maxWorkers=2`.
- Never touch `/Users/saramia/pagosYaWeb`.
- Copy, verbatim: «Usar este estilo», «YAPI está puliendo tu tienda…», «Pulí tu tienda: …», «Revisión de YAPI», «Ese estilo ya no está disponible. Pide un nuevo diseño.», «Primero elige un estilo; después lo ajustamos juntos.»
- Numbers: pickable once ≥ 2 cards are planned (proposal row status stays `RUNNING`). Build waits ≤ 20 s for the release. Picked hero wait ≤ 15 s. Studio polls state every 4 s. A `reviewPending` heartbeat older than 5 min counts as false.
- Log event names: `style_hero_skipped`, with the elapsed time as `waitedMs`.
- Unchanged: two cards (one calm, one bold); opening and bold-font dedup; the one-card and no-card fallbacks; edits (they have no self-review); review metering (`source-generation` records, phase `review`).
- Credits:
  - The style run counts only completed calls, so an aborted hero call is not charged.
  - The review is charged on its row when it finishes and its answer is used: N+1 saved, or "nothing to change".
  - A discarded, failed or cancelled review is charged 0.
- Studio: the owner's dashboard serves a pre-built Studio. After Tasks 8–9, tell the owner that the Studio must be rebuilt to see the change. Do not rebuild it unless asked.

## Review Focus

1. **A pick that lands as the style run finishes.** If the chat's claim hits the moment the run writes `AWAITING_STYLE`, the pick must still build, not answer «Ese estilo ya no está disponible…». Test: Task 4, "honours a pick that lands in the instant the style run finishes".
2. **A chat message while cards are choosable but heroes still draw.** The message must get «Primero elige un estilo; después lo ajustamos juntos.» with no model call, not «Ya hay una generación en curso». Test: Task 4, "answers without a model call while choosable cards still draw their heroes".
3. **A review whose edits all fail to apply, or that finds nothing.** No empty «Revisión de YAPI» version may appear, and revision N stays the store. Test: Task 6, "saves no second version when no review edit applies".
4. **The merchant starts editing in Studio while YAPI polishes.** The review must be cancelled, and Studio must never reload the preview over unsaved work. Test: Task 9, `reviewPollAction` "cancels while editing and never reloads over unsaved work".
5. **An API restart mid-review leaves a `REVIEWING` row behind.** The note must disappear once the heartbeat is older than 5 minutes, and the next request must retire the row. Test: Task 5, "treats a review whose heartbeat stopped more than 5 minutes ago as not pending, and retires such rows on cancel".

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `apps/api/src/storefront-source/source-style-proposal.ts` | Modify | `pickable` on `StyleProposal` and its view; `styleDecision()` reads a pick/supersede from a saved proposal |
| `apps/api/src/storefront-source/source-style-proposal.spec.ts` | Modify | Tests for the above |
| `apps/api/src/storefront-source/source-generation.service.ts` | Modify | Style run: pickable + `onPickable`, guarded writes, decision watcher, picked-hero wait, release. Build: model-only hero, card look. Sep-5: draft saved first, `assembleSave()`, background review runner, `cancelReview`, `reviewPending` |
| `apps/api/src/storefront-source/source-generation-style.spec.ts` | Modify | Style-run and pick-build tests |
| `apps/api/src/storefront-source/design-engine/sep5-author.ts` | Modify | `sep5CardLook()` and the `card` author input |
| `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts` | Modify | Card-look prompt tests |
| `apps/api/src/storefront-source/source-chat.service.ts` | Modify | Early reply on pickable; `buildFromStyle` accepts a pickable `RUNNING` proposal, claims it and waits for the release; open-proposal handling of a drawing proposal |
| `apps/api/src/storefront-source/source-chat-style.spec.ts` | Modify | Chat style tests (the existing home of the style chat tests; the spec's "source-chat.service.spec.ts" tests go here) |
| `apps/api/src/storefront-source/source-background-review.ts` | Create | Review constants, `reviewPendingWhere`, `reviewMessage`, error types, `SourceReviewRegistry` |
| `apps/api/src/storefront-source/source-background-review.spec.ts` | Create | Registry/helper tests, `reviewPending`/`cancelReview`, controller wiring |
| `apps/api/src/storefront-source/source-projects.controller.ts` | Modify | `reviewPending` on `GET source-project`; `POST source-project/review/cancel` |
| `apps/api/src/storefront-source/source-generation-review.spec.ts` | Create | Draft-first and background review tests, cancellation tests |
| `apps/merchant-studio/src/source-style-pick.ts` | Modify | Picker enabled on `pickable`; `keepStylePolling()` |
| `apps/merchant-studio/src/source-style-pick.test.ts` | Modify | Picker tests |
| `apps/merchant-studio/src/source-review-note.ts` | Create | `REVIEW_POLL_MS`, note markup, `reviewPollAction()` |
| `apps/merchant-studio/src/source-review-note.test.ts` | Create | Tests for the above |
| `apps/merchant-studio/src/api.ts` | Modify | `SourceState.reviewPending`, `cancelSourceReview()` |
| `apps/merchant-studio/src/source-studio.ts` | Modify | Style poll that outlives the request; review note, 4 s state poll, reload, cancel on editing |
| `apps/merchant-studio/src/source-studio.test.ts` | Modify | Note → reload integration test |
| `apps/merchant-studio/src/source-studio.css` | Modify | `.source-review-note` |

---

### Task 1: `pickable` on the proposal and the merchant's decision

**Files:**
- Modify: `apps/api/src/storefront-source/source-style-proposal.ts:9-14,30-47`
- Test: `apps/api/src/storefront-source/source-style-proposal.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `StyleProposal.pickable?: boolean`.
  - `styleProposalView()` adds `pickable: true` only while `status === 'RUNNING' && pickable === true`.
  - `export type StyleDecision = { status: 'PICKED'; picked: number } | { status: 'SUPERSEDED' }`.
  - `export function styleDecision(value: unknown): StyleDecision | null`.

- [ ] **Step 1: Write the failing tests** — append to `source-style-proposal.spec.ts` and add `styleDecision` to its import line (`import { cardHtmlForPreview, styleDecision, styleProposalFrom, styleProposalView, type StyleProposal } from './source-style-proposal';`):

```ts
// Spec 2026-10-12 faster generation: cards are choosable while their heroes are still being drawn.
it('marks a running proposal choosable once its cards are planned, and never a finished one', () => {
  const running: StyleProposal = { ...proposal(), status: 'RUNNING', pickable: true };
  expect(styleProposalView('gen1', running).pickable).toBe(true);
  expect('pickable' in styleProposalView('gen1', { ...running, pickable: undefined })).toBe(false);
  expect('pickable' in styleProposalView('gen1', { ...proposal(), pickable: true })).toBe(false);
});

it('reads the merchant decision on a running proposal: a pick with its card, or a new request', () => {
  expect(styleDecision({ ...proposal(), status: 'PICKED', picked: 1 })).toEqual({ status: 'PICKED', picked: 1 });
  expect(styleDecision({ ...proposal(), status: 'SUPERSEDED' })).toEqual({ status: 'SUPERSEDED' });
  expect(styleDecision({ ...proposal(), status: 'RUNNING' })).toBeNull();
  expect(styleDecision({ ...proposal(), status: 'PICKED' })).toBeNull();
  expect(styleDecision(null)).toBeNull();
  expect(styleDecision({ version: 2 })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-style-proposal.spec.ts --maxWorkers=2`
Expected: FAIL. ts-jest reports `Module '"./source-style-proposal"' has no exported member 'styleDecision'` and `'pickable' does not exist in type 'StyleProposal'`.

- [ ] **Step 3: Write minimal implementation** in `source-style-proposal.ts`:

Replace the `heroPending` member at the end of the `StyleProposal` type:

```ts
  /** By concept index, like heroes: true while that card shows its template hero and the model hero is still being written. */
  heroPending?: boolean[] };
```

with:

```ts
  /** By concept index, like heroes: true while that card shows its template hero and the model hero is still being written. */
  heroPending?: boolean[];
  /** Spec 2026-10-12 faster generation: both cards are planned, so the merchant may pick while heroes are still drawn. */
  pickable?: boolean };
/** What the merchant decided on a running proposal: the chat wrote PICKED with the card, or a new request SUPERSEDED it. */
export type StyleDecision = { status: 'PICKED'; picked: number } | { status: 'SUPERSEDED' };
```

In `styleProposalView`, replace its `return` line:

```ts
  return { generationId, status: proposal.status, recommended: proposal.design?.selected ?? 0, ...(proposal.status === 'PICKED' && proposal.picked !== undefined ? { picked: proposal.picked } : {}), cards };
```

with:

```ts
  return { generationId, status: proposal.status, recommended: proposal.design?.selected ?? 0, ...(proposal.status === 'PICKED' && proposal.picked !== undefined ? { picked: proposal.picked } : {}),
    ...(proposal.status === 'RUNNING' && proposal.pickable === true ? { pickable: true } : {}), cards };
```

Append at the end of the file:

```ts
/** The style run polls its own row for this (spec 2026-10-12): a pick names its card; anything else running is no decision. */
export function styleDecision(value: unknown): StyleDecision | null {
  const proposal = styleProposalFrom(value);
  if (proposal?.status === 'PICKED' && Number.isInteger(proposal.picked)) return { status: 'PICKED', picked: proposal.picked! };
  if (proposal?.status === 'SUPERSEDED') return { status: 'SUPERSEDED' };
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-style-proposal.spec.ts --maxWorkers=2`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-style-proposal.ts apps/api/src/storefront-source/source-style-proposal.spec.ts
git commit -m "feat(style): a running proposal can be marked choosable and carry the merchant's decision"
```

---

### Task 2: The style run offers its cards early and honours a pick while heroes draw

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (imports ~75; `StyleProposalResult` area ~147; class fields ~229; `generate` execution type ~361; the `proposeStyles` call ~791; `proposeStyles` ~1679–1787)
- Test: `apps/api/src/storefront-source/source-generation-style.spec.ts`

**Interfaces:**
- Consumes (Task 1): `styleDecision(value: unknown): StyleDecision | null`, `StyleProposal.pickable`.
- Produces:
  - `generate(..., execution?: { ...; onPickable?: (result: StyleProposalResult) => void })`. It is called at most once, right after the pickable proposal is saved.
  - `export function completedCredits(attempts: ReadonlyArray<{ status: string; usage: ReturnType<typeof sourceUsage> }>, maxCredits: number, free: boolean): number`, exported from `source-generation.service.ts`.
  - `protected stylePickPollMs = 1_000` and `protected pickHeroWaitMs = 15_000` on `SourceGenerationService`. Tests override them.
  - The row the run releases after a pick has `status: 'AWAITING_STYLE'`, `activeStoreId: null`, and `proposal: { ...proposal, status: 'PICKED', picked, heroes: [...] }`.
  - After a supersede, the release writes no `proposal` key.

- [ ] **Step 1: Write the failing tests** — in `source-generation-style.spec.ts`:

Add this helper below the existing `until` helper (line ~57):

```ts
/** Waits on real time, for waits measured in milliseconds (the decision poll, the hero wait). */
const eventually = async (check: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5)); expect(check()).toBe(true); };
```

Replace the expectation in the existing test `'throws and leaves no proposal awaiting when the run lost its row before the proposal finished'`:

```ts
    expect(awaiting[0].where).toEqual({ id: 'run-1', status: 'RUNNING', activeStoreId: 's1' });
```

with:

```ts
    expect(awaiting[0].where).toEqual({ id: 'run-1', status: 'RUNNING', activeStoreId: 's1', proposal: { path: ['status'], equals: 'RUNNING' } });
```

Add these tests inside `describe('style proposal mode', …)`, before the `'builds the picked card: …'` test:

```ts
  // Spec 2026-10-12 faster generation, part 1: pick a style as soon as the cards appear.
  /** A hero that lands when its deferred resolves, or rejects when its lane is aborted. */
  const heldHeroes = () => {
    const heroes = [0, 1].map(() => deferred<{ html: string; source: 'model' }>());
    writeStyleHero.mockImplementation((args: any) => new Promise((ok, fail) => { heroes[args.concept.card.slot].promise.then(ok); args.signal.addEventListener('abort', () => fail(args.signal.reason)); }));
    return heroes;
  };
  const heroSignal = (slot: number): AbortSignal => writeStyleHero.mock.calls.find(c => c[0].concept.card.slot === slot)![0].signal;

  it('offers the cards as soon as both are planned, before their heroes finish, and tells the caller', async () => {
    lanes();
    const heroes = heldHeroes();
    const onPickable = jest.fn();
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true, onPickable });
    await eventually(() => onPickable.mock.calls.length === 1);
    expect(onPickable).toHaveBeenCalledWith({ styleProposal: { generationId: 'run-1', cards: 2 } });
    const offered = proposals().at(-1)!;
    expect(offered).toMatchObject({ status: 'RUNNING', pickable: true, heroPending: [true, true] });
    heroes.forEach((hero, slot) => hero.resolve({ html: `<header data-store-name>modelo ${slot}</header>`, source: 'model' }));
    expect(await run).toEqual({ styleProposal: { generationId: 'run-1', cards: 2 } });
    expect(finalWrite().data.proposal).toMatchObject({ status: 'AWAITING_STYLE', pickable: true, heroPending: [false, false] });
    expect(onPickable).toHaveBeenCalledTimes(1);
  });

  it('never lets a lane overwrite a pick: every write from the offer on requires a running proposal', async () => {
    lanes();
    await service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true, onPickable: jest.fn() });
    const writes = prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => 'proposal' in c.data);
    const offeredAt = writes.findIndex((c: any) => c.data.proposal.pickable === true);
    expect(offeredAt).toBeGreaterThan(-1);
    expect(writes.slice(0, offeredAt).every((c: any) => !('proposal' in c.where))).toBe(true);
    expect(writes.slice(offeredAt).every((c: any) => JSON.stringify(c.where.proposal) === JSON.stringify({ path: ['status'], equals: 'RUNNING' }))).toBe(true);
  });

  it('a pick while heroes draw stops the other card at once, keeps the picked hero that lands within the wait, and releases the run as picked', async () => {
    (service as any).stylePickPollMs = 2; (service as any).pickHeroWaitMs = 2_000;
    lanes();
    const heroes = heldHeroes();
    const onPickable = jest.fn();
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true, onPickable });
    await eventually(() => onPickable.mock.calls.length === 1);
    const offered = proposals().at(-1)!;
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({ proposal: { ...offered, status: 'PICKED', picked: 1 } });
    await eventually(() => heroSignal(0).aborted);
    expect(heroSignal(1).aborted).toBe(false);
    heroes[1].resolve({ html: '<header data-store-name>modelo 1</header>', source: 'model' });
    expect(await run).toEqual({ styleProposal: { generationId: 'run-1', cards: 2 } });
    const release = finalWrite();
    expect(release.where).toEqual({ id: 'run-1', status: 'RUNNING', activeStoreId: 's1' });
    expect(release.data).toMatchObject({ status: 'AWAITING_STYLE', activeStoreId: null, proposal: { status: 'PICKED', picked: 1, heroPending: [false, false] } });
    expect(release.data.proposal.heroes[1]).toEqual({ html: '<header data-store-name>modelo 1</header>', source: 'model' });
  });

  it('gives up on a picked hero still drawing after the wait: the run releases with its template hero and logs style_hero_skipped', async () => {
    (service as any).stylePickPollMs = 2; (service as any).pickHeroWaitMs = 30;
    lanes();
    heldHeroes();
    const onPickable = jest.fn();
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true, onPickable });
    await eventually(() => onPickable.mock.calls.length === 1);
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({ proposal: { ...proposals().at(-1)!, status: 'PICKED', picked: 1 } });
    await run;
    expect(heroSignal(1).aborted).toBe(true);
    const release = finalWrite();
    expect(release.data.proposal).toMatchObject({ status: 'PICKED', picked: 1, heroPending: [false, false] });
    expect(release.data.proposal.heroes[1].source).toBe('template');
    const skipped = (Logger.prototype.warn as jest.Mock).mock.calls.map(c => String(c[0])).find(line => line.includes('"event":"style_hero_skipped"'));
    expect(JSON.parse(skipped!)).toMatchObject({ generationId: 'run-1', slot: 1 });
    expect(JSON.parse(skipped!).waitedMs).toBeGreaterThanOrEqual(25);
  });

  it('stops both lanes when a new request supersedes the cards, and releases the run without touching the proposal', async () => {
    (service as any).stylePickPollMs = 2;
    lanes();
    heldHeroes();
    const onPickable = jest.fn();
    const run = service.generate('m1', 's1', dto, budget, [], progress, { styleProposal: true, onPickable });
    await eventually(() => onPickable.mock.calls.length === 1);
    prisma.storeSourceGeneration.findFirst.mockResolvedValue({ proposal: { ...proposals().at(-1)!, status: 'SUPERSEDED' } });
    await run;
    expect([heroSignal(0).aborted, heroSignal(1).aborted]).toEqual([true, true]);
    const release = finalWrite();
    expect(release.data).toMatchObject({ status: 'AWAITING_STYLE', activeStoreId: null });
    expect('proposal' in release.data).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: FAIL. ts-jest reports `Object literal may only specify known properties, and 'onPickable' does not exist`.

- [ ] **Step 3: Write minimal implementation** in `source-generation.service.ts`:

3a. Imports. Keep the line `import type { StyleProposal, StyleProposalStatus } from './source-style-proposal';` and add below it:

```ts
import { styleDecision, type StyleDecision } from './source-style-proposal';
```

3b. Below `export type StyleProposalResult = …;` (line ~147) add:

```ts
/** Credits for the calls that completed: unknown provider usage is never invented or billed, and a free run costs nothing. */
export function completedCredits(attempts: ReadonlyArray<{ status: string; usage: ReturnType<typeof sourceUsage> }>, maxCredits: number, free: boolean): number {
  const successful = attempts.filter(attempt => attempt.status === 'COMPLETED');
  return free ? 0 : successful.every(attempt => attempt.usage) ? Math.min(maxCredits, Math.ceil(successful.reduce((sum, attempt) => sum + attempt.usage!.providerMicroUsd, 0) / CREDIT_MICRO_USD)) : 0;
}
```

3c. Class fields. Below `private readonly logger = new Logger(SourceGenerationService.name);` add:

```ts
  /** Spec 2026-10-12 faster generation: how often a style run with choosable cards reads its row for the merchant's pick. */
  protected stylePickPollMs = 1_000;
  /** How long a picked card's model hero may still land before the build goes on without it. */
  protected pickHeroWaitMs = 15_000;
```

3d. In `generate`'s `execution` parameter type, after `styleProposal?: boolean;`, add:

```ts
 /** Elige tu estilo: called once both cards are planned and choosable, before their heroes finish (spec 2026-10-12). */ onPickable?: (result: StyleProposalResult) => void;
```

3e. In the `this.proposeStyles({ … })` call (~791), add `onPickable: execution?.onPickable,` after `maxCredits,`. In the `proposeStyles` parameter type, add `onPickable?: (result: StyleProposalResult) => void;` after `maxCredits: number;`.

3f. In `proposeStyles`, below `const slotPending: boolean[] = [];` add:

```ts
    // Both cards planned: choosable while their heroes are still being drawn (spec 2026-10-12 faster generation).
    let pickable = false;
```

In the `proposal` builder, replace:

```ts
        assetMap: input.assetLegend, request: { dto: input.dto, imageUses: input.imageUses, redesign: input.redesign }, createdAt };
```

with:

```ts
        assetMap: input.assetLegend, request: { dto: input.dto, imageUses: input.imageUses, redesign: input.redesign }, createdAt, ...(pickable ? { pickable: true } : {}) };
```

Replace the `save` function:

```ts
    const save = (status: StyleProposalStatus = 'RUNNING', data: Record<string, unknown> = {}) => {
      const write = queue.catch(() => undefined).then(() => closed && status === 'RUNNING' ? { count: 0 }
        : this.prisma.storeSourceGeneration.updateMany({ where: { id: input.runId, status: 'RUNNING', activeStoreId: input.storeId }, data: { proposal: proposal(status) as unknown as Prisma.InputJsonValue, ...data } }));
      queue = write;
      return write;
    };
```

with:

```ts
    // From the offer on, a pick may land on the row (the chat writes PICKED into the proposal), so every later write needs
    // the proposal still running: a slow lane never turns a pick back into a running proposal.
    const save = (status: StyleProposalStatus = 'RUNNING', data: Record<string, unknown> = {}) => {
      const guard = pickable ? { proposal: { path: ['status'], equals: 'RUNNING' } } : {};
      const write = queue.catch(() => undefined).then(() => closed && status === 'RUNNING' ? { count: 0 }
        : this.prisma.storeSourceGeneration.updateMany({ where: { id: input.runId, status: 'RUNNING', activeStoreId: input.storeId, ...guard }, data: { proposal: proposal(status) as unknown as Prisma.InputJsonValue, ...data } }));
      queue = write;
      return write;
    };
```

3g. Replace the tail of `proposeStyles`, from `    await save();` (the line after the `if (order.length < 2) { … }` block) through the method's closing `return { styleProposal: … };`:

```ts
    await save();
    await Promise.all(lanes);
    input.signal.throwIfAborted();
    closed = true;
    const successful = input.attempts.filter(attempt => attempt.status === 'COMPLETED');
    const credits = input.freeRun ? 0 : successful.every(attempt => attempt.usage) ? Math.min(input.maxCredits, Math.ceil(successful.reduce((sum, attempt) => sum + attempt.usage!.providerMicroUsd, 0) / CREDIT_MICRO_USD)) : 0;
    const completed = await save('AWAITING_STYLE', { status: 'AWAITING_STYLE', activeStoreId: null, credits, attempts: input.attempts as unknown as Prisma.InputJsonValue, durationMs: Date.now() - input.started, completedAt: new Date() }) as { count: number };
    if (completed.count !== 1) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
    return { styleProposal: { generationId: input.runId, cards: live().length } };
```

with:

```ts
    // Both cards are planned: choosable now, while their heroes are still being drawn (spec 2026-10-12). The caller answers
    // the merchant at once; this run keeps the store until the heroes land, the merchant picks, or a new request retires them.
    pickable = true;
    const offered = await save() as { count: number };
    if (offered.count === 1) input.onPickable?.({ styleProposal: { generationId: input.runId, cards: live().length } });
    const watch = new AbortController();
    let decision = await Promise.race([Promise.all(lanes).then(() => null), this.watchStyleDecision(input.runId, watch.signal)]);
    watch.abort();
    input.signal.throwIfAborted();
    const finished = () => ({ status: 'AWAITING_STYLE', activeStoreId: null, credits: completedCredits(input.attempts, input.maxCredits, input.freeRun), attempts: input.attempts as unknown as Prisma.InputJsonValue, durationMs: Date.now() - input.started, completedAt: new Date() });
    if (!decision) {
      closed = true;
      const completed = await save('AWAITING_STYLE', finished()) as { count: number };
      if (completed.count === 1) return { styleProposal: { generationId: input.runId, cards: live().length } };
      // The guarded write matched nothing: a pick or a new request reached the row between the last hero and this write.
      decision = styleDecision((await this.prisma.storeSourceGeneration.findFirst({ where: { id: input.runId }, select: { proposal: true } }).catch(() => null))?.proposal);
      if (!decision) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
    }
    const pickedSlot = decision.status === 'PICKED' ? live()[decision.picked]?.slot : undefined;
    for (const [slot, controller] of laneControllers) if (slot !== pickedSlot) controller.abort();
    if (pickedSlot !== undefined && slotPending[pickedSlot]) {
      // The picked card's model hero may still land; past pickHeroWaitMs the build goes on with the card's design instead.
      const waitStarted = Date.now();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([lanes[input.styleSlots.findIndex(slot => slot.slot === pickedSlot)], new Promise(resolve => { timer = setTimeout(resolve, this.pickHeroWaitMs); })]);
      clearTimeout(timer);
      if (slotPending[pickedSlot]) {
        laneControllers.get(pickedSlot)!.abort();
        slotPending[pickedSlot] = false;
        this.logger.warn(JSON.stringify({ event: 'style_hero_skipped', generationId: input.runId, slot: pickedSlot, waitedMs: Date.now() - waitStarted }));
      }
    }
    closed = true;
    // The pick's build waits for this release, then reads the heroes written here.
    const released = await this.prisma.storeSourceGeneration.updateMany({ where: { id: input.runId, status: 'RUNNING', activeStoreId: input.storeId }, data: {
      ...(decision.status === 'PICKED' ? { proposal: { ...proposal('PICKED'), picked: decision.picked } as unknown as Prisma.InputJsonValue } : {}), ...finished() } });
    if (released.count !== 1) throw new ConflictException('La generación expiró. Tu revisión anterior sigue guardada.');
    return { styleProposal: { generationId: input.runId, cards: live().length } };
  }

  /** Reads the run's own row every stylePickPollMs for the merchant's decision on choosable cards, until `stop` aborts. */
  private async watchStyleDecision(runId: string, stop: AbortSignal): Promise<StyleDecision | null> {
    while (!stop.aborted) {
      await new Promise<void>(resolve => {
        const done = () => { clearTimeout(timer); stop.removeEventListener('abort', done); resolve(); };
        const timer = setTimeout(done, this.stylePickPollMs);
        stop.addEventListener('abort', done);
      });
      if (stop.aborted) return null;
      const row = await this.prisma.storeSourceGeneration.findFirst({ where: { id: runId }, select: { proposal: true } }).catch(() => null);
      const decision = styleDecision(row?.proposal);
      if (decision) return decision;
    }
    return null;
```

The final `}` of the class that followed the old tail stays where it is. The code above ends inside `watchStyleDecision`, so the existing closing `  }` and `}` close that method and the class.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS, including every pre-existing test in the file. `'guards every proposal write on a running row'` still counts 6 writes.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-style.spec.ts
git commit -m "feat(style): offer the cards once both are planned and honour a pick while heroes draw"
```

---

### Task 3: A pick without a finished hero builds from the card's design

**Files:**
- Modify: `apps/api/src/storefront-source/design-engine/sep5-author.ts:57-104`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (sep5-author import line 8; `pickedHero` ~598; `authorInput` ~973)
- Test: `apps/api/src/storefront-source/design-engine/sep5-author.spec.ts`, `apps/api/src/storefront-source/source-generation-style.spec.ts`

**Interfaces:**
- Consumes: `StyleProposal.heroes[i].source`, `StyleProposal.heroPalettes`, `StyleSlot.draw.header/hero`, `SourceDesignConcept.story`.
- Produces:
  - `export function sep5CardLook(card: { name: string; fonts: { display: string; text: string }; palette?: { paper: string; ink: string; accent: string; accent2: string }; header?: string; hero?: string; eyebrow?: string; headline: string; support?: string; action?: string }): string`.
  - `sep5AuthorPrompt` input `card?: string`. The prompt stays byte-identical when it is absent or blank.

- [ ] **Step 1: Write the failing tests**

Append to `design-engine/sep5-author.spec.ts`, and add `sep5CardLook` to its import list from `./sep5-author`:

```ts
// Spec 2026-10-12 faster generation: a pick whose model hero was still being drawn builds from the card's design.
it('describes the picked card when its hero was not finished, and stays byte-identical without one', () => {
  const base = { brief: {}, instruction: 'x', data: {}, assetLegend: [] };
  expect(sep5AuthorPrompt({ ...base, card: '' })).toBe(sep5AuthorPrompt(base));
  const card = sep5CardLook({ name: 'Barra de barrio', fonts: { display: 'fraunces', text: 'instrument' }, palette: { paper: '#fff8ee', ink: '#1a1a1a', accent: '#d2462b', accent2: '#f3e3cf' }, header: 'wordmark-band', hero: 'poster', eyebrow: 'Hecho en Sopocachi', headline: 'Café para compartir', support: 'Tostado cada mañana.', action: 'Ver menú' });
  expect(card).toContain('PICKED STYLE: The merchant chose the style card «Barra de barrio»');
  expect(card).toContain('display type Fraunces, text Instrument Sans');
  expect(card).toContain('background #fff8ee, text #1a1a1a, accent #d2462b, panels #f3e3cf');
  expect(card).toContain('header "wordmark-band" and hero "poster"');
  expect(card).toContain('eyebrow "Hecho en Sopocachi", headline "Café para compartir", line "Tostado cada mañana.", action "Ver menú"');
  const prompt = sep5AuthorPrompt({ ...base, card });
  expect(prompt).toContain(card);
  expect(prompt).not.toContain('PICKED HEADER AND HERO');
  expect(sep5CardLook({ name: 'Solo texto', fonts: { display: 'fraunces', text: 'instrument' }, headline: 'Hola' })).not.toContain('colours');
});
```

In `source-generation-style.spec.ts`, add after `'builds a calm pick without the bold paragraph'`:

```ts
  it('builds a pick whose hero is still a placeholder from the card design, never forcing the template hero on the store', async () => {
    const proposal = savedProposal();
    proposal.heroes[1] = { html: '<header data-store-name>plantilla</header>', source: 'template' };
    await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 1 } });
    const prompt = authorPrompt()!;
    expect(prompt).not.toContain('PICKED HEADER AND HERO');
    expect(prompt).not.toContain('plantilla</header>');
    const concept = proposal.design!.concepts[1];
    expect(prompt).toContain(`PICKED STYLE: The merchant chose the style card «${concept.card!.name}»`);
    expect(prompt).toContain(`headline "${concept.story!.headline}"`);
    expect(prompt).toContain(proposal.slots[1].palette!.paper);
    expect(prompt).toContain(proposal.slots[1].paragraph);
  });

  it('builds a pick whose lane lost its hero from the card design too', async () => {
    const proposal = savedProposal();
    proposal.heroes[0] = null;
    await service.generate('m1', 's1', proposal.request.dto, budget, [], progress, { style: { proposal, index: 0 } });
    expect(authorPrompt()).toContain('PICKED STYLE: The merchant chose the style card');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected:
- `sep5-author.spec.ts` FAILS: `Module '"./sep5-author"' has no exported member 'sep5CardLook'`.
- The new style test FAILS: the prompt contains `PICKED HEADER AND HERO`, and the null-hero test finds no `PICKED STYLE`.

- [ ] **Step 3: Write minimal implementation**

In `design-engine/sep5-author.ts`, add below `SEP5_KEEP_HERO`:

```ts
/** The picked style card when its model hero was not finished (spec 2026-10-12 faster generation): the author draws the
 *  header and first screen itself in the card's look. The template hero the card showed is a placeholder, never a design. */
export function sep5CardLook(card: { name: string; fonts: { display: string; text: string }; palette?: { paper: string; ink: string; accent: string; accent2: string }; header?: string; hero?: string; eyebrow?: string; headline: string; support?: string; action?: string }): string {
  const family = (id: string) => SOURCE_FONT_CATALOG.find(font => font.id === id)?.family ?? id;
  const words = [card.eyebrow ? `eyebrow "${card.eyebrow}"` : '', `headline "${card.headline}"`, card.support ? `line "${card.support}"` : '', card.action ? `action "${card.action}"` : ''].filter(Boolean).join(', ');
  return [
    `PICKED STYLE: The merchant chose the style card «${card.name}». Draw the header and first screen yourself in that card's look: display type ${family(card.fonts.display)}, text ${family(card.fonts.text)}`,
    card.palette ? `, colours background ${card.palette.paper}, text ${card.palette.ink}, accent ${card.palette.accent}, panels ${card.palette.accent2}` : '',
    card.header || card.hero ? `, header "${card.header ?? ''}" and hero "${card.hero ?? ''}" as the frame above describes them` : '',
    `. Open with the card's own words: ${words}. Build the rest of the store in the same fonts, colours and language.`,
  ].join('');
}
```

In `sep5AuthorPrompt`'s input type, after the `hero?: string;` member, add:

```ts
  /** The picked card's design when its model hero was not finished (sep5CardLook). Absent or blank, the prompt stays byte-identical. */
  card?: string;
```

In the returned array, after `...(input.hero?.trim() ? [SEP5_KEEP_HERO(input.hero.trim())] : []),` add:

```ts
    ...(input.card?.trim() ? [input.card.trim()] : []),
```

In `source-generation.service.ts`:
- Add `sep5CardLook` to the import list from `'./design-engine/sep5-author'` (line 8).
- Replace:

```ts
    const pickedHero = picked ? picked.proposal.heroes[picked.index]?.html ?? '' : '';
```

with:

```ts
    // Only a hero the model finished is kept (spec 2026-10-12): a template hero is a placeholder, so a pick whose hero was still
    // being drawn, or whose lane failed, builds from the card's design instead.
    const pickedEntry = picked ? picked.proposal.heroes[picked.index] : null;
    const pickedHero = pickedEntry?.source === 'model' ? pickedEntry.html : '';
    const pickedCard = picked && !pickedHero && pickedConcept?.card && pickedSlot ? sep5CardLook({
      name: pickedConcept.card.name, fonts: { display: pickedConcept.dna?.type?.display ?? 'bricolage', text: pickedConcept.dna?.type?.text ?? 'instrument' },
      palette: pickedSlot.palette ?? picked.proposal.heroPalettes?.[picked.index] ?? undefined, header: pickedSlot.draw.header, hero: pickedSlot.draw.hero,
      eyebrow: pickedConcept.story?.eyebrow || undefined, headline: pickedConcept.story?.headline || pickedConcept.name, support: pickedConcept.story?.support || undefined, action: pickedConcept.story?.primaryAction || undefined,
    }) : '';
```

- In `authorInput` (~973), replace `frame: frame.paragraph, hero: pickedHero };` with `frame: frame.paragraph, hero: pickedHero, card: pickedCard };`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/design-engine/sep5-author.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS for both files, including `'builds the picked card: …'`, which still sees `PICKED HEADER AND HERO` for a model hero.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/design-engine/sep5-author.ts apps/api/src/storefront-source/design-engine/sep5-author.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-style.spec.ts
git commit -m "feat(style): a pick without a finished hero builds the store from the card's design"
```

---

### Task 4: The chat answers when the cards are choosable and builds a pick from a running proposal

**Files:**
- Modify: `apps/api/src/storefront-source/source-chat.service.ts` (class fields; `send` open-proposal block ~316–327; the style `generate` call ~457–468; `buildFromStyle` ~501–540)
- Test: `apps/api/src/storefront-source/source-chat-style.spec.ts`

**Interfaces:**
- Consumes:
  - Task 1: `StyleProposal.pickable`.
  - Task 2: `execution.onPickable(result: StyleProposalResult)`.
  - The run's release, which leaves the row `AWAITING_STYLE` with the `PICKED` proposal and heroes.
- Produces:
  - `protected styleReleaseWaitMs = 20_000` and `protected styleReleasePollMs = 500` on `SourceChatService`.
  - `private awaitStyleRelease(generationId: string, storeId: string): Promise<StyleProposal | null>`.

- [ ] **Step 1: Write the failing tests** — append to `source-chat-style.spec.ts`:

```ts
// Spec 2026-10-12 faster generation, part 1: the cards are choosable while their heroes are still being drawn.
const drawingProposal = (): StyleProposal => ({ ...awaitingProposal(), status: 'RUNNING', pickable: true });

it('replies as soon as the cards are choosable, while the style run keeps drawing heroes', async () => {
  generate.mockImplementationOnce((...args: any[]) => { args[6].onPickable({ styleProposal: { generationId: 'g1', cards: 2 } }); return new Promise(() => undefined); });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería en Sopocachi', setupAction: 'generate', requestId: uuid() });
  expect(out.assistantMessage.content).toBe('Te preparo 2 estilos para Café Buna: uno tranquilo y uno atrevido. Elige uno para construir tu tienda.');
  expect(out.assistantMessage.metadata).toMatchObject({ styleProposal: { generationId: 'g1' } });
});

it('never fails the reply when the style run breaks after the cards were offered', async () => {
  generate.mockImplementationOnce(async (...args: any[]) => { args[6].onPickable({ styleProposal: { generationId: 'g1', cards: 2 } }); await new Promise(resolve => setImmediate(resolve)); throw new Error('hero lane broke'); });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: 'Una cafetería en Sopocachi', setupAction: 'generate', requestId: uuid() });
  await new Promise(resolve => setImmediate(resolve));
  expect(out.assistantMessage.metadata).toMatchObject({ styleProposal: { generationId: 'g1' } });
  expect(prisma.storeAgentMessage.create.mock.calls.some((c: any[]) => c[0].data.metadata?.failed)).toBe(false);
});

it('builds from a card picked while heroes still draw: claims it, waits for the style run to let go, and builds with the heroes it saved', async () => {
  (chat as any).styleReleasePollMs = 1;
  const released = { ...drawingProposal(), status: 'PICKED' as const, picked: 1, heroes: [null, { html: '<header data-store-name>Buna</header>', source: 'model' as const }, null, null] };
  prisma.storeSourceGeneration.findFirst
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: drawingProposal() })
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: { ...drawingProposal(), status: 'PICKED', picked: 1 } })
    .mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: released });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 1 }, requestId: uuid() });
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { id: 'g1', status: 'RUNNING', AND: [{ proposal: { path: ['status'], equals: 'RUNNING' } }, { proposal: { path: ['pickable'], equals: true } }] }, data: { proposal: expect.objectContaining({ status: 'PICKED', picked: 1 }) } });
  expect(generate.mock.calls[0][6].style).toEqual({ proposal: released, index: 1 });
});

it('goes on after 20 s with the proposal it claimed when the style run never lets go', async () => {
  (chat as any).styleReleasePollMs = 1; (chat as any).styleReleaseWaitMs = 5;
  prisma.storeSourceGeneration.findFirst
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: drawingProposal() })
    .mockResolvedValue({ id: 'g1', status: 'RUNNING', proposal: { ...drawingProposal(), status: 'PICKED', picked: 0 } });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 0 }, requestId: uuid() });
  expect(generate.mock.calls[0][6].style.proposal).toMatchObject({ status: 'PICKED', picked: 0 });
});

it('honours a pick that lands in the instant the style run finishes', async () => {
  prisma.storeSourceGeneration.findFirst
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: drawingProposal() })
    .mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...awaitingProposal(), pickable: true } });
  prisma.storeSourceGeneration.updateMany.mockResolvedValueOnce({ count: 0 });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 1 }, requestId: uuid() });
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenLastCalledWith({ where: { id: 'g1' }, data: { proposal: expect.objectContaining({ status: 'PICKED', picked: 1 }) } });
  expect(generate.mock.calls[0][6].style).toEqual({ proposal: { ...awaitingProposal(), pickable: true }, index: 1 });
});

it('refuses a pick on cards still being planned', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: { ...awaitingProposal(), status: 'RUNNING' } });
  await expect(chat.send('m1', 's1', { revision: 0, instruction: 'Usar este estilo', stylePick: { generationId: 'g1', index: 0 }, requestId: uuid() })).rejects.toThrow('Ese estilo ya no está disponible. Pide un nuevo diseño.');
  expect(generate).not.toHaveBeenCalled();
});

it('answers without a model call while choosable cards still draw their heroes', async () => {
  prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: drawingProposal() });
  const out: any = await chat.send('m1', 's1', { revision: 0, instruction: '¿y en azul?', requestId: uuid() });
  expect(out.assistantMessage.content).toBe('Primero elige un estilo; después lo ajustamos juntos.');
  expect(conversationDecide).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

it('a redesign request retires cards still drawing and waits for their run to let go before building', async () => {
  (chat as any).styleReleasePollMs = 1;
  prisma.storeSourceGeneration.findFirst
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: drawingProposal() })
    .mockResolvedValueOnce({ id: 'g1', status: 'RUNNING', proposal: { ...drawingProposal(), status: 'SUPERSEDED' } })
    .mockResolvedValueOnce({ id: 'g1', status: 'AWAITING_STYLE', proposal: { ...drawingProposal(), status: 'SUPERSEDED' } });
  await chat.send('m1', 's1', { revision: 0, instruction: 'Rediseña mi tienda desde cero', requestId: uuid() });
  expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { proposal: expect.objectContaining({ status: 'SUPERSEDED' }) } });
  expect(prisma.storeSourceGeneration.findFirst).toHaveBeenCalledTimes(3);
  expect(prisma.storeSourceGeneration.findFirst.mock.invocationCallOrder[2]).toBeLessThan(generate.mock.invocationCallOrder[0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-chat-style.spec.ts --maxWorkers=2`
Expected: FAIL.
- The first test times out, because `send` awaits a generate that never resolves.
- The pick tests reject with `Ese estilo ya no está disponible`.
- The message test calls the model.

- [ ] **Step 3: Write minimal implementation** in `source-chat.service.ts`:

3a. Below the `constructor(…) {}` line add:

```ts
  /** Spec 2026-10-12: how long a pick or a new request waits for a style run that is stopping to let go of the store. */
  protected styleReleaseWaitMs = 20_000;
  protected styleReleasePollMs = 500;
```

3b. In `send`, replace:

```ts
    const openProposal = latestProposal?.status === 'AWAITING_STYLE' ? styleProposalFrom(latestProposal.proposal) : null;
```

with:

```ts
    const latestParsed = latestProposal ? styleProposalFrom(latestProposal.proposal) : null;
    // Cards are choosable while their heroes still draw (spec 2026-10-12): the row is RUNNING and the proposal pickable.
    const drawingProposal = latestProposal?.status === 'RUNNING' && latestParsed?.status === 'RUNNING' && latestParsed.pickable === true;
    const openProposal = latestProposal?.status === 'AWAITING_STYLE' || drawingProposal ? latestParsed : null;
```

Replace `    if (openProposal?.status === 'AWAITING_STYLE' || pickedName) {` with `    if (openProposal?.status === 'AWAITING_STYLE' || drawingProposal || pickedName) {`.

Inside that block, after the existing line `      await this.prisma.storeSourceGeneration.updateMany({ where: { id: latestProposal!.id }, data: { proposal: { ...openProposal, status: 'SUPERSEDED' } as unknown as Prisma.InputJsonValue } });` add:

```ts
      // The retired run still holds the store while it stops its heroes; the new run waits for it to let go.
      if (drawingProposal) await this.awaitStyleRelease(latestProposal!.id, storeId);
```

3c. Replace the start of the style generate call:

```ts
      const revision = await withTemplateProfile(() => this.generation.generate(merchantId, storeId, {
```

with:

```ts
      // The chat answers as soon as the cards are choosable (spec 2026-10-12); the style run then finishes its heroes alone.
      let offerCards!: (result: StyleProposalResult) => void;
      const cardsOffered = new Promise<StyleProposalResult>(resolve => { offerCards = resolve; });
      const run = withTemplateProfile(() => this.generation.generate(merchantId, storeId, {
```

At the end of that call, replace `...(proposeStyle ? { styleProposal: true as const } : {}) }));` with:

```ts
...(proposeStyle ? { styleProposal: true as const, onPickable: offerCards } : {}) }));
      // What the style run does after the cards were offered never fails this reply (the run records its own failure).
      run.catch(() => undefined);
      const revision = proposeStyle ? await Promise.race([run, cardsOffered]) : await run;
```

3d. In `buildFromStyle`, replace from `      const row = await this.prisma.storeSourceGeneration.findFirst({ where: { id: input.stylePick!.generationId, storeId }, select: { id: true, proposal: true, requestJobId: true } });` through `      await this.prisma.storeSourceGeneration.updateMany({ where: { id: row!.id }, data: { proposal: { ...proposal, status: 'PICKED', picked: index } as unknown as Prisma.InputJsonValue } });` with:

```ts
      const row = await this.prisma.storeSourceGeneration.findFirst({ where: { id: input.stylePick!.generationId, storeId }, select: { id: true, status: true, proposal: true, requestJobId: true } });
      const proposal = row ? styleProposalFrom(row.proposal) : null;
      // Choosable while its heroes are still drawing (spec 2026-10-12): the row is still RUNNING and the proposal pickable.
      const drawing = row?.status === 'RUNNING' && proposal?.status === 'RUNNING' && proposal.pickable === true;
      // A pick builds on the revision the styles were made for; an import or template that landed since makes them stale.
      if (!proposal?.design || !(drawing || ['AWAITING_STYLE', 'PICKED'].includes(proposal.status)) || proposal.request.dto.revision !== input.revision) throw new BadRequestException('Ese estilo ya no está disponible. Pide un nuevo diseño.');
      const index = input.stylePick!.auto ? proposal.design.selected : input.stylePick!.index ?? proposal.picked ?? proposal.design.selected;
      if (!proposal.design.concepts[index]) throw new BadRequestException('Elige uno de los estilos de la propuesta.');
      let chosen: StyleProposal = proposal;
      if (drawing) {
        // Claimed only while still running and choosable; the style run sees PICKED, stops the other card, gives the picked
        // hero up to 15 s and lets go of the store, writing the heroes it has.
        const claimed = await this.prisma.storeSourceGeneration.updateMany({ where: { id: row!.id, status: 'RUNNING', AND: [{ proposal: { path: ['status'], equals: 'RUNNING' } }, { proposal: { path: ['pickable'], equals: true } }] }, data: { proposal: { ...proposal, status: 'PICKED', picked: index } as unknown as Prisma.InputJsonValue } });
        if (claimed.count === 1) chosen = (await this.awaitStyleRelease(row!.id, storeId)) ?? { ...proposal, status: 'PICKED', picked: index };
        else {
          // The style run finished between the read and the claim: the cards now wait as before, so the pick goes the usual way.
          const now = await this.prisma.storeSourceGeneration.findFirst({ where: { id: row!.id, storeId }, select: { status: true, proposal: true } });
          const waiting = now?.status === 'AWAITING_STYLE' ? styleProposalFrom(now.proposal) : null;
          if (waiting?.status !== 'AWAITING_STYLE' || !waiting.design?.concepts[index]) throw new BadRequestException('Ese estilo ya no está disponible. Pide un nuevo diseño.');
          await this.prisma.storeSourceGeneration.updateMany({ where: { id: row!.id }, data: { proposal: { ...waiting, status: 'PICKED', picked: index } as unknown as Prisma.InputJsonValue } });
          chosen = waiting;
        }
      } else await this.prisma.storeSourceGeneration.updateMany({ where: { id: row!.id }, data: { proposal: { ...proposal, status: 'PICKED', picked: index } as unknown as Prisma.InputJsonValue } });
```

In the `build` arrow function, replace `style: { proposal, index } });` with `style: { proposal: chosen, index } });`.

3e. Add this method below `buildFromStyle` (before the class's closing `}`):

```ts
  /** Waits up to styleReleaseWaitMs for a style run that is stopping to let go of the store, and returns the proposal it left. */
  private async awaitStyleRelease(generationId: string, storeId: string): Promise<StyleProposal | null> {
    const deadline = Date.now() + this.styleReleaseWaitMs;
    let row: { status: string; proposal: unknown } | null = null;
    for (;;) {
      row = await this.prisma.storeSourceGeneration.findFirst({ where: { id: generationId, storeId }, select: { status: true, proposal: true } });
      if (!row || row.status !== 'RUNNING' || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, this.styleReleasePollMs));
    }
    return row ? styleProposalFrom(row.proposal) : null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-chat-style.spec.ts --maxWorkers=2`
Expected: PASS, every test in the file, old and new.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-chat.service.ts apps/api/src/storefront-source/source-chat-style.spec.ts
git commit -m "feat(chat): answer when the cards are choosable and build a pick made while heroes draw"
```

---

### Task 5: Review bookkeeping: registry, `reviewPending`, cancel route

**Files:**
- Create: `apps/api/src/storefront-source/source-background-review.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (imports; class fields; two public methods after `usage()` ~359)
- Modify: `apps/api/src/storefront-source/source-projects.controller.ts:111-115`
- Test: `apps/api/src/storefront-source/source-background-review.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - Constants from `source-background-review.ts`:
    - `export const SOURCE_REVIEW_STATUS = 'REVIEWING'`
    - `export const SOURCE_REVIEW_LABEL = 'Revisión de YAPI'`
    - `export const SOURCE_REVIEW_STALE_MS = 300_000`
    - `export const SOURCE_REVIEW_HEARTBEAT_MS = 15_000`
  - Functions from `source-background-review.ts`:
    - `export function reviewPendingWhere(storeId: string, revision: number, now?: number)`
    - `export function reviewMessage(notes: string[], label: string): string`
  - Error classes from `source-background-review.ts`:
    - `export class SourceReviewDiscarded extends Error {}`
    - `export class SourceReviewCancelled extends Error {}`
  - `export class SourceReviewRegistry { start(storeId: string, work: (signal: AbortSignal) => Promise<void>): Promise<void>; cancel(storeId: string): boolean; settled(storeId: string): Promise<void> }`.
  - New methods on `SourceGenerationService`:
    - `cancelReview(storeId: string): Promise<boolean>`
    - `reviewPending(storeId: string, revision: number): Promise<boolean>`
    - `reviewSettled(storeId: string): Promise<void>` (for tests)
    - `private readonly reviews: SourceReviewRegistry`
  - Routes:
    - `GET v1/stores/:storeId/source-project` adds `reviewPending: boolean`.
    - `POST v1/stores/:storeId/source-project/review/cancel` returns `{ cancelled: boolean }`.

- [ ] **Step 1: Write the failing tests** — create `source-background-review.spec.ts`:

```ts
// Spec 2026-10-12 faster generation, part 2: the review's bookkeeping (in-process registry, pending flag, cancel route).
import { NotFoundException } from '@nestjs/common';
import { SOURCE_REVIEW_LABEL, SOURCE_REVIEW_STALE_MS, SourceReviewRegistry, reviewMessage, reviewPendingWhere } from './source-background-review';
import { SourceGenerationService } from './source-generation.service';
import { SourceProjectsController } from './source-projects.controller';

describe('SourceReviewRegistry', () => {
  it('runs one review per store: a new one aborts the old, cancel aborts, settled waits for the end', async () => {
    const registry = new SourceReviewRegistry();
    const seen: AbortSignal[] = [];
    const work = (signal: AbortSignal) => { seen.push(signal); return new Promise<void>(resolve => signal.addEventListener('abort', () => resolve())); };
    void registry.start('s1', work);
    void registry.start('s1', work);
    expect(seen[0].aborted).toBe(true);
    expect(seen[1].aborted).toBe(false);
    expect(registry.cancel('s2')).toBe(false);
    expect(registry.cancel('s1')).toBe(true);
    await registry.settled('s1');
    expect(seen[1].aborted).toBe(true);
    expect(registry.cancel('s1')).toBe(false);
  });

  it('never lets a failing review reject its caller', async () => {
    const registry = new SourceReviewRegistry();
    await expect(registry.start('s1', async () => { throw new Error('boom'); })).resolves.toBeUndefined();
  });
});

it('says what YAPI polished, in its own words, or names the version when it has none', () => {
  expect(reviewMessage(['Agrandé el título.', ' ', 'Oscurecí el texto.'], 'Café pulido')).toBe('Pulí tu tienda: Agrandé el título. Oscurecí el texto.');
  expect(reviewMessage([], 'Café pulido')).toBe('Pulí tu tienda: «Café pulido».');
  expect(SOURCE_REVIEW_LABEL).toBe('Revisión de YAPI');
});

describe('review state on the service', () => {
  const setup = () => {
    const prisma: any = { storeSourceGeneration: { findFirst: jest.fn().mockResolvedValue(null), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    return { prisma, service: new SourceGenerationService(prisma, {} as any, {} as any, {} as any, { get: () => undefined } as any) };
  };

  it('treats a review whose heartbeat stopped more than 5 minutes ago as not pending, and retires such rows on cancel', async () => {
    const now = Date.parse('2026-10-12T12:00:00Z');
    expect(reviewPendingWhere('s1', 3, now)).toEqual({ storeId: 's1', status: 'REVIEWING', baseRevision: 3, heartbeatAt: { gt: new Date(now - SOURCE_REVIEW_STALE_MS) } });
    expect(SOURCE_REVIEW_STALE_MS).toBe(5 * 60_000);
    const { prisma, service } = setup();
    expect(await service.reviewPending('s1', 3)).toBe(false);
    const where = prisma.storeSourceGeneration.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ storeId: 's1', status: 'REVIEWING', baseRevision: 3 });
    expect(Math.abs(where.heartbeatAt.gt.getTime() - (Date.now() - SOURCE_REVIEW_STALE_MS))).toBeLessThan(2_000);
    prisma.storeSourceGeneration.findFirst.mockResolvedValueOnce({ id: 'review-1' });
    expect(await service.reviewPending('s1', 3)).toBe(true);
    expect(await service.reviewPending('s1', 0)).toBe(false);
    expect(prisma.storeSourceGeneration.findFirst).toHaveBeenCalledTimes(2);
    // Nothing runs in this process (the review's process restarted): the row is still retired.
    expect(await service.cancelReview('s1')).toBe(false);
    expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { storeId: 's1', status: 'REVIEWING' }, data: { status: 'CANCELLED', completedAt: expect.any(Date) } });
  });

  it('aborts the review running in this process, and never throws when the database is unavailable', async () => {
    const { prisma, service } = setup();
    let signal!: AbortSignal;
    void (service as any).reviews.start('s1', (given: AbortSignal) => { signal = given; return new Promise<void>(resolve => given.addEventListener('abort', () => resolve())); });
    prisma.storeSourceGeneration.updateMany.mockRejectedValueOnce(new Error('db down'));
    expect(await service.cancelReview('s1')).toBe(true);
    await service.reviewSettled('s1');
    expect(signal.aborted).toBe(true);
    prisma.storeSourceGeneration.findFirst.mockRejectedValueOnce(new Error('db down'));
    expect(await service.reviewPending('s1', 3)).toBe(false);
  });
});

it('adds reviewPending to the store state and cancels a review only for the store owner', async () => {
  const projects: any = { state: jest.fn().mockResolvedValue({ revision: 3, versions: [], nextBefore: null }), current: jest.fn().mockResolvedValue({ revision: 3 }) };
  const generation: any = { reviewPending: jest.fn().mockResolvedValue(true), cancelReview: jest.fn().mockResolvedValue(true) };
  const controller = new SourceProjectsController(projects, generation, {} as any);
  expect(await controller.state({ id: 'm1' }, 's1')).toMatchObject({ revision: 3, reviewPending: true });
  expect(generation.reviewPending).toHaveBeenCalledWith('s1', 3);
  expect(await controller.cancelReview({ id: 'm1' }, 's1')).toEqual({ cancelled: true });
  expect(projects.current).toHaveBeenCalledWith('m1', 's1');
  projects.current.mockRejectedValueOnce(new NotFoundException('Store not found'));
  await expect(controller.cancelReview({ id: 'other' }, 's1')).rejects.toThrow('Store not found');
  expect(generation.cancelReview).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-background-review.spec.ts --maxWorkers=2`
Expected: FAIL with `Cannot find module './source-background-review'`.

- [ ] **Step 3: Write minimal implementation**

Create `source-background-review.ts`:

```ts
/**
 * YAPI's self-review after the store is shown (spec 2026-10-12 faster generation, part 2). The review is a
 * StoreSourceGeneration row of its own: status REVIEWING while it runs (no activeStoreId, so it never blocks a new request),
 * a heartbeat Studio's reviewPending reads, and COMPLETED, DISCARDED, FAILED or CANCELLED once it ends. The status column is
 * a plain string, so none of this needs a migration.
 */
export const SOURCE_REVIEW_STATUS = 'REVIEWING';
export const SOURCE_REVIEW_LABEL = 'Revisión de YAPI';
/** A review whose process stopped beating this long ago (an API restart) is gone: Studio stops waiting for it. */
export const SOURCE_REVIEW_STALE_MS = 5 * 60_000;
export const SOURCE_REVIEW_HEARTBEAT_MS = 15_000;

/** The review result no longer fits revision N (header covers, or it was cancelled while saving): N stays, silently. */
export class SourceReviewDiscarded extends Error {}
/** The review's row left REVIEWING before the save: a new request or another process cancelled it. */
export class SourceReviewCancelled extends Error {}

/** A review still polishing the store's current revision, with a fresh heartbeat. */
export function reviewPendingWhere(storeId: string, revision: number, now = Date.now()) {
  return { storeId, status: SOURCE_REVIEW_STATUS, baseRevision: revision, heartbeatAt: { gt: new Date(now - SOURCE_REVIEW_STALE_MS) } };
}

/** The chat line posted with revision N+1: the review's own notes (short Spanish sentences), else its version name. */
export function reviewMessage(notes: string[], label: string): string {
  const said = notes.map(note => note.trim()).filter(Boolean).slice(0, 6).join(' ');
  return `Pulí tu tienda: ${said || `«${label}».`}`;
}

/** One background review per store in this process; a new one, or cancel, aborts the one before. */
export class SourceReviewRegistry {
  private readonly running = new Map<string, { controller: AbortController; done: Promise<void> }>();

  start(storeId: string, work: (signal: AbortSignal) => Promise<void>): Promise<void> {
    this.running.get(storeId)?.controller.abort();
    const controller = new AbortController();
    // `work` starts synchronously, so a cancel right after start reaches a review that is already listening.
    const done = (async () => { await work(controller.signal); })().catch(() => undefined)
      .finally(() => { if (this.running.get(storeId)?.controller === controller) this.running.delete(storeId); });
    this.running.set(storeId, { controller, done });
    return done;
  }

  cancel(storeId: string): boolean {
    const entry = this.running.get(storeId);
    entry?.controller.abort();
    return Boolean(entry);
  }

  settled(storeId: string): Promise<void> {
    return this.running.get(storeId)?.done ?? Promise.resolve();
  }
}
```

In `source-generation.service.ts`:
- Add an import:

```ts
import { SourceReviewRegistry, SOURCE_REVIEW_STATUS, reviewPendingWhere } from './source-background-review';
```

- Below the `pickHeroWaitMs` field (Task 2), add:

```ts
  /** Background reviews of this process, by store (spec 2026-10-12): a new request aborts its store's review. */
  private readonly reviews = new SourceReviewRegistry();
```

- After the `usage(…) { … }` method, add:

```ts
  /** Stops the store's background review: the one in this process at once, and one in another API process at its next
   *  heartbeat or save, which both need its REVIEWING row. Never blocks or fails the caller. True when one ran here. */
  async cancelReview(storeId: string): Promise<boolean> {
    const here = this.reviews.cancel(storeId);
    await Promise.resolve().then(() => this.prisma.storeSourceGeneration.updateMany({ where: { storeId, status: SOURCE_REVIEW_STATUS }, data: { status: 'CANCELLED', completedAt: new Date() } })).catch(() => undefined);
    return here;
  }

  /** Studio's «YAPI está puliendo tu tienda…»: a review of this revision with a heartbeat at most 5 minutes old. */
  async reviewPending(storeId: string, revision: number): Promise<boolean> {
    if (!revision) return false;
    return Boolean(await Promise.resolve().then(() => this.prisma.storeSourceGeneration.findFirst({ where: reviewPendingWhere(storeId, revision), select: { id: true } })).catch(() => null));
  }

  /** Resolves when the store's background review in this process has ended (tests and tools). */
  reviewSettled(storeId: string): Promise<void> { return this.reviews.settled(storeId); }
```

In `source-projects.controller.ts`, replace:

```ts
  @Get()
  @Header("Cache-Control", "private, no-store")
  state(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query("before", new ParseIntPipe({ optional: true })) before?: number) {
    return this.projects.state(merchant.id, storeId, before);
  }
```

with:

```ts
  @Get()
  @Header("Cache-Control", "private, no-store")
  async state(@CurrentMerchant() merchant: { id: string }, @Param("storeId") storeId: string, @Query("before", new ParseIntPipe({ optional: true })) before?: number) {
    const state = await this.projects.state(merchant.id, storeId, before);
    // Spec 2026-10-12: Studio shows «YAPI está puliendo tu tienda…» and polls this every 4 s while it is true.
    return { ...state, reviewPending: await this.generation.reviewPending(storeId, state.revision) };
  }

  // Studio stops YAPI's background polish when the merchant starts editing, so the polish never lands over their work.
  @Post('review/cancel')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async cancelReview(@CurrentMerchant() merchant: { id: string }, @Param('storeId') storeId: string) {
    await this.projects.current(merchant.id, storeId);
    return { cancelled: await this.generation.cancelReview(storeId) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-background-review.spec.ts --maxWorkers=2`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-background-review.ts apps/api/src/storefront-source/source-background-review.spec.ts apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-projects.controller.ts
git commit -m "feat(review): background review bookkeeping, reviewPending on the store state and a cancel route"
```

---

### Task 6: Save the Sep-5 draft first and run the self-review in the background

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts`. Constant at 57–60; `StyleProposalResult` area ~147; `runTimeout` ~718–722; the `attempts` declaration ~724; around `let lenient = false;` ~834; `acceptCandidate` ~861; `sep5Call` ~976–1001; the review and standard-pages blocks ~1028–1089; the save tail ~1535–1615; after the save ~1655; a new method after `generate`.
- Create: `apps/api/src/storefront-source/source-generation-review.spec.ts`

**Interfaces:**
- Consumes (Task 5):
  - `SourceReviewRegistry` via `this.reviews`.
  - `SOURCE_REVIEW_STATUS`, `SOURCE_REVIEW_LABEL`, `SOURCE_REVIEW_HEARTBEAT_MS`, `reviewMessage`.
  - `SourceReviewDiscarded`, `SourceReviewCancelled`.
  - `reviewSettled(storeId)`.
- Consumes (Task 2): `completedCredits`.
- Produces:
  - `export type SourceGenerationAttempt`: the run's attempt shape, moved to module level.
  - `type Sep5Review = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => Promise<{ saveInput: SaveSourceProjectDto; notes: string[] } | null>`.
  - `protected reviewHeartbeatMs = SOURCE_REVIEW_HEARTBEAT_MS`.
  - `private startSep5Review(input: { merchantId: string; storeId: string; revision: number; brief: SaveSourceProjectDto['brief']; savedFiles: SourceProjectFileDto[]; model: SourceModel; requestedModel: string; maxCredits: number; freeRun: boolean; review: Sep5Review }): Promise<void>`. It resolves once the REVIEWING row exists.
  - Review row writes:
    - Fence on success: `where { id, status: 'REVIEWING' }`, data `{ status: 'COMPLETED', revision: N+1, credits, attempts, durationMs, completedAt }`.
    - Every other ending: `where { id, status: { in: ['REVIEWING', 'CANCELLED'] } }`, data `{ status: 'DISCARDED' | 'FAILED' | 'CANCELLED', credits: 0, … }`.
    - Nothing to change: `where { id, status: 'REVIEWING' }`, data `{ status: 'COMPLETED', credits, … }`.

- [ ] **Step 1: Write the failing tests** — create `source-generation-review.spec.ts`:

```ts
// Spec 2026-10-12 faster generation, part 2: a Sep-5 store is saved before its self-review, which lands later as N+1.
jest.setTimeout(60_000);

import { ConflictException, Logger } from '@nestjs/common';
import { SourceDesignPlanner } from './source-design-planner';
import * as designModule from './source-design';
import { SourceGenerationService } from './source-generation.service';
import { sourceProjectSnapshot } from './source-project';
import { SourceRequestBudget } from './source-request-budget';
import { validDna } from './fixtures/dna';
import { captureHeaderCovers } from './design-engine/header-clickable';

// Pixel sampling launches Chromium; unit tests exercise what the service does with a sample, not the decoder.
jest.mock('./source-photo-sampler', () => ({ samplePhotoColours: jest.fn().mockResolvedValue(new Map()) }));
// The review renders the draft in Chromium; unit tests exercise what the service does with the shots.
jest.mock('./design-engine/sep5-review-capture', () => ({ ...jest.requireActual('./design-engine/sep5-review-capture'), captureSep5Draft: jest.fn().mockResolvedValue({ shots: [{ width: 1280, y: 0, image: 'data:image/png;base64,AAAA' }], facts: [] }) }));
jest.mock('./design-engine/header-clickable', () => ({ ...jest.requireActual('./design-engine/header-clickable'), captureHeaderCovers: jest.fn().mockResolvedValue([]) }));

const concept = (name: string) => ({ name, premise: `${name} premise`, opening: `${name} opening`, flow: `${name} flow`, typography: 'Instrument', imagery: 'No photos', mobile: 'Keep order visible',
  composition: { family: 'menu-led', rationale: 'The cafe needs a clear menu for quick ordering.', pages: [{ page: 'index.html', purpose: 'shopping', rationale: 'Choose from the real menu.', sections: [{ id: 'menu', intent: 'Choose products and order.', layout: 'product-grid', geometry: 'grid', media: [], mobile: 'grid', primaryAction: 'Order' }] }] },
  layout: { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true },
  story: { promise: `${name} promise`, eyebrow: '', headline: `${name} para compartir`, support: 'Una selección breve y clara.', primaryAction: 'Ver menú', beats: [{ section: 'menu', role: 'offer', headline: 'Menú', media: 'product' }] },
  motion: { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] }, dna: validDna() });
const threeConceptDesign = designModule.validateSourceDesign({ concepts: ['Menu', 'Window', 'Counter'].map(concept), selected: 0 }, 0, true, true);
const files = () => [
  { path: 'index.html', content: '<!doctype html><main><section id="menu"><h1>Menú</h1><div data-pagosya-catalog></div></section></main><div data-pagosya-cart></div><p data-pagosya-status></p><script src="config.js" defer></script><script src="commerce.js" defer></script><script src="site.js" defer></script>' },
  { path: 'styles.css', content: 'body { color: #222; }' }, { path: 'site.js', content: 'globalThis.__generatedSourceExecuted = true;' },
];
const dto = { revision: 0, brief: { businessType: 'Cafetería', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Menú primero' }, instruction: 'Crea la tienda de mi cafetería', assetUrls: [] } as any;
const answer = (value: unknown) => new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: typeof value === 'string' ? value : JSON.stringify(value) }] }], usage: { input_tokens: 1000, output_tokens: 1000 } }));
const REVIEW = { label: 'Café pulido', notes: ['Oscurecí el texto para que se lea mejor.'], edits: [{ path: 'styles.css', find: 'color: #222', replace: 'color: #111' }] };
/** The author answers with the draft; the self-review answers with `review`. */
const respond = (review: (init: any) => Promise<Response>) => async (_url: unknown, init: any) => JSON.parse(init.body).text.format.name === 'storefront_self_review' ? review(init) : answer({ label: 'Café', files: files(), products: [] });
const eventually = async (check: () => boolean, ms = 3000) => { const end = Date.now() + ms; while (!check() && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 5)); expect(check()).toBe(true); };

function setup() {
  const revision = { current: 0 };
  const prisma: any = {
    storeRetention: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSourceGeneration: { create: jest.fn().mockResolvedValueOnce({ id: 'run-1' }).mockResolvedValue({ id: 'review-1' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    store: { findFirst: jest.fn().mockResolvedValue({ slug: 'cafe' }), findUnique: jest.fn().mockResolvedValue(null) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    storeAgentThread: { findUnique: jest.fn().mockResolvedValue({ id: 't1' }) },
    storeAgentMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1' }), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const stores: any = { getStorePublic: jest.fn().mockResolvedValue({ storeName: 'Café', checkoutMode: 'PAYMENT', items: [], categories: [], locations: [] }) };
  const projects: any = {
    prepare: jest.fn(async value => sourceProjectSnapshot(value)),
    current: jest.fn(async () => ({ revision: revision.current, slug: 'cafe' })),
    version: jest.fn(),
    // Like SourceProjectsService.save: the optimistic revision check, then the fence, in one transaction.
    save: jest.fn(async (_m: string, _s: string, value: any, _generation: unknown, fence?: (tx: unknown) => Promise<void>) => {
      if (value.revision !== revision.current) throw new ConflictException('El proyecto cambió en otra sesión. Recarga la revisión antes de guardar.');
      if (fence) await fence(prisma);
      revision.current += 1;
      return { revision: revision.current, label: value.label, digest: 'd', createdAt: new Date(), restoredFrom: null, createdProducts: [], updatedProducts: [], deletedProducts: [] };
    }),
    recentFrameDraws: jest.fn().mockResolvedValue([]), recentDesignFingerprints: jest.fn().mockResolvedValue([]), recentCompositionFingerprints: jest.fn().mockResolvedValue([]),
  };
  const values = new Map<string, unknown>(Object.entries({ 'app.openAi.apiKey': 'test-server-key', 'app.openAi.enabled': true, 'app.checkoutOrigin': 'http://localhost:5174', 'app.environment': 'test', 'app.sourceFramework': 'static', 'app.sep5Author': true, 'app.sep5SelfReview': true }));
  const config: any = { get: jest.fn((key: string) => values.get(key)), set: (key: string, value: unknown) => values.set(key, value) };
  const uploads: any = { getBuffer: jest.fn(), contentTypeFor: jest.fn().mockReturnValue('image/png') };
  const metering: any = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new SourceGenerationService(prisma, stores, projects, uploads, config, undefined, metering), prisma, stores, projects, config, revision };
}

describe('Sep-5 self-review after the save', () => {
  let service: SourceGenerationService, prisma: any, stores: any, projects: any, config: any, revision: { current: number };
  let fetchMock: jest.SpyInstance;
  const progress = jest.fn(async () => undefined);
  const reviewCalls = () => fetchMock.mock.calls.filter(c => JSON.parse(c[1].body).text.format.name === 'storefront_self_review');
  const reviewWrites = () => prisma.storeSourceGeneration.updateMany.mock.calls.map((c: any[]) => c[0]).filter((c: any) => c.where.id === 'review-1');
  const fenceWrite = () => reviewWrites().find((c: any) => c.where.status === 'REVIEWING' && c.data.status === 'COMPLETED' && c.data.revision);
  const ending = (status: string) => reviewWrites().find((c: any) => c.data.status === status);
  const generateN = () => service.generate('m1', 's1', dto, new SourceRequestBudget(25), [], progress);
  beforeEach(() => {
    ({ service, prisma, stores, projects, config, revision } = setup());
    progress.mockClear();
    jest.spyOn(SourceDesignPlanner.prototype, 'explore').mockResolvedValue(threeConceptDesign);
    jest.spyOn(designModule, 'sourceDesignExploration').mockReturnValue(designModule.sourceDesignExploration(0));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.mocked(captureHeaderCovers).mockReset().mockResolvedValue([]);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(respond(async () => answer(REVIEW)) as any);
  });
  afterEach(() => jest.restoreAllMocks());

  it('saves the draft as revision N before the review runs, then saves the accepted review as N+1 «Revisión de YAPI»', async () => {
    const result: any = await generateN();
    expect(result.revision).toBe(1);
    expect(result.generation.attempts.some((attempt: any) => attempt.phase === 'review')).toBe(false);
    const reviewRow = prisma.storeSourceGeneration.create.mock.calls[1][0].data;
    expect(reviewRow).toEqual({ storeId: 's1', baseRevision: 1, requestedModel: expect.any(String), model: expect.any(String), maxCredits: expect.any(Number), status: 'REVIEWING' });
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(projects.save.mock.invocationCallOrder[0]).toBeLessThan(fetchMock.mock.invocationCallOrder[fetchMock.mock.calls.indexOf(reviewCalls()[0])]);
    const polished = projects.save.mock.calls[1][2];
    expect(polished).toMatchObject({ revision: 1, label: 'Revisión de YAPI' });
    expect(polished.files.find((file: any) => file.path === 'styles.css').content).toContain('color: #111');
    expect(projects.save.mock.calls[0][2].files.find((file: any) => file.path === 'styles.css').content).toContain('color: #222');
    const done = fenceWrite();
    expect(done.data).toMatchObject({ status: 'COMPLETED', revision: 2 });
    expect(done.data.credits).toBeGreaterThan(0);
    expect(prisma.storeAgentMessage.create).toHaveBeenCalledWith({ data: { threadId: 't1', channel: 'source', role: 'ASSISTANT', content: 'Pulí tu tienda: Oscurecí el texto para que se lea mejor.', metadata: { sourceRevision: 2, label: 'Revisión de YAPI', review: true } } });
  });

  it('never reports progress on the chat request the draft already finished', async () => {
    await generateN();
    const reported = progress.mock.calls.length;
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls.length).toBe(reported);
  });

  it('discards the review silently when the merchant saved another revision meanwhile', async () => {
    fetchMock.mockImplementation(respond(async () => { revision.current = 2; return answer(REVIEW); }) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(fenceWrite()).toBeUndefined();
    expect(ending('DISCARDED').data).toMatchObject({ credits: 0 });
    expect(ending('DISCARDED').where).toEqual({ id: 'review-1', status: { in: ['REVIEWING', 'CANCELLED'] } });
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('saves no second version when no review edit applies', async () => {
    fetchMock.mockImplementation(respond(async () => answer({ ...REVIEW, edits: [{ path: 'styles.css', find: 'no existe en el borrador', replace: 'x' }] })) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('COMPLETED').data.revision).toBeUndefined();
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('keeps revision N when the review finds nothing to change', async () => {
    fetchMock.mockImplementation(respond(async () => answer({ label: 'Café', notes: [], edits: [] })) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('COMPLETED').data.credits).toBeGreaterThan(0);
  });

  it('keeps revision N and charges nothing when the review answer is unusable', async () => {
    fetchMock.mockImplementation(respond(async () => answer('esto no es JSON')) as any);
    await generateN();
    await service.reviewSettled('s1');
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('FAILED').data).toMatchObject({ credits: 0 });
  });

  it('discards review edits that bring in a header cover revision N did not have', async () => {
    config.set('app.headerClickGate', true);
    jest.mocked(captureHeaderCovers).mockResolvedValueOnce([]).mockResolvedValueOnce([{ width: 390, control: 'Carrito', cover: 'section.poster', section: 'hero', atTop: true }]);
    await generateN();
    await service.reviewSettled('s1');
    expect(captureHeaderCovers).toHaveBeenCalledTimes(2);
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(ending('DISCARDED').data).toMatchObject({ credits: 0 });
  });

  it('runs no review and opens no review row with the self-review off', async () => {
    config.set('app.sep5SelfReview', false);
    await generateN();
    await service.reviewSettled('s1');
    expect(prisma.storeSourceGeneration.create).toHaveBeenCalledTimes(1);
    expect(reviewCalls()).toHaveLength(0);
    expect(projects.save).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
Expected: FAIL.
- The first test finds `projects.save` called once and `create` called once: the review still runs inside the run, and nothing opens a REVIEWING row.
- `service.reviewSettled` resolves immediately.

- [ ] **Step 3a: Move the attempt type to module level.** Below `export type StyleProposalResult = …;` add:

```ts
/** One provider call of a run (or of its background review), as the row's attempts record it. */
export type SourceGenerationAttempt = { model: SourceModel; phase?: 'design' | 'source' | 'agent' | 'visual' | 'sketch' | 'composition' | 'brand' | 'creative' | 'critic' | 'author' | 'review'; durationMs: number; status: string; usage: ReturnType<typeof sourceUsage>; responseStatus?: string; incompleteReason?: string; reasoningTokens?: number; reasoningEffort?: string; failureReason?: string; tools?: string[]; diagnostics?: Array<{ tool: string; digest: string; durationMs: number; output: string }> };
/** The Sep-5 self-review as generate() hands it to startSep5Review: null when it has nothing to change. */
type Sep5Review = (run: { signal: AbortSignal; attempts: SourceGenerationAttempt[] }) => Promise<{ saveInput: SaveSourceProjectDto; notes: string[] } | null>;
```

Replace the long inline declaration `    const attempts: Array<{ model: SourceModel; phase?: … }> = [];` (~724) with:

```ts
    const attempts: SourceGenerationAttempt[] = [];
```

Imports:
- Change `import type { SourceProjectFileDto } from "./dto/save-source-project.dto";` to `import type { SaveSourceProjectDto, SourceProjectFileDto } from "./dto/save-source-project.dto";`.
- Extend the Task 5 import to `import { SourceReviewCancelled, SourceReviewDiscarded, SourceReviewRegistry, SOURCE_REVIEW_HEARTBEAT_MS, SOURCE_REVIEW_LABEL, SOURCE_REVIEW_STATUS, reviewMessage, reviewPendingWhere } from './source-background-review';`.

Below the `reviews` field, add:

```ts
  protected reviewHeartbeatMs = SOURCE_REVIEW_HEARTBEAT_MS;
```

- [ ] **Step 3b: The run no longer budgets the review.** Delete the `SEP5_REVIEW_MIN_MS` constant and its 2-line comment (lines ~57–60). Replace:

```ts
    // The self-review is a second whole-project write, so it gets a second such budget.
    const runTimeout = sep5Author ? (sep5SelfReview ? 1_500_000 : 900_000) : agentEngine ? agentRunHeadroom(agentLimits(chatgptPlan).wallMs) : 240_000;
```

with:

```ts
    // The self-review runs after the save (spec 2026-10-12), on its own budget, so the run keeps the one Sep-5 allowance.
    const runTimeout = sep5Author ? 900_000 : agentEngine ? agentRunHeadroom(agentLimits(chatgptPlan).wallMs) : 240_000;
```

- [ ] **Step 3c: Silence progress during the background review.** Replace `      let lenient = false;` with:

```ts
      let lenient = false;
      /** Spec 2026-10-12: true while the background review re-runs acceptance after the chat request already finished. */
      let reviewing = false;
      /** The Sep-5 self-review, built below and started after revision N is saved. */
      let sep5Review: Sep5Review | undefined;
```

In `acceptCandidate`, replace `        await progress?.('validating');` with `        if (!reviewing) await progress?.('validating');`.

- [ ] **Step 3d: `sep5Call` takes the review's signal and attempts.** Replace its first lines:

```ts
        const sep5Call = async (phase: 'author' | 'review', text: string, attached: typeof images, schemaName: string, schema: object, timeoutMs: number) => {
          const attempt: (typeof attempts)[number] = { model, phase, durationMs: 0, status: 'FAILED', usage: null };
          attempts.push(attempt);
```

with:

```ts
        const sep5Call = async (phase: 'author' | 'review', text: string, attached: typeof images, schemaName: string, schema: object, timeoutMs: number, options: { signal?: AbortSignal; attempts?: SourceGenerationAttempt[] } = {}) => {
          const callSignal = options.signal ?? signal;
          const attempt: SourceGenerationAttempt = { model, phase, durationMs: 0, status: 'FAILED', usage: null };
          (options.attempts ?? attempts).push(attempt);
```

In its `fetch(…)` call, replace `signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])` with `signal: AbortSignal.any([callSignal, AbortSignal.timeout(timeoutMs)])`. Replace its `          signal.throwIfAborted();` (the line after the `catch (error) { attempt.failureReason = … }`) with `          callSignal.throwIfAborted();`.

- [ ] **Step 3e: Draft first; build the review for later.** Replace everything from the comment line `        // Self-review: the author writes blind, never seeing its own CSS render.` (~1028) through the closing `}` of the `if (pages.added.length || pages.refreshed.length || pages.slotAdded) { … }` block (~1089), that is, the lines just before `      } else if (sketchFirst) {`, with:

```ts
        // The standard pages (Buscar, Nosotros, Contacto, the policies) and the footer slot that links them, on
        // every authored store instead of only when the merchant later asks. Built from the final index.html, so
        // they share its header, footer and stylesheet; a store whose markup declines the surgery keeps without.
        const addSep5StandardPages = async () => {
          const pages = withStaticStandardPages(generated.files);
          if (!pages.added.length && !pages.refreshed.length && !pages.slotAdded) return;
          const before = { generated, repairs: autoRepairs.length, motifs: motifFiles, preview: acceptedPreviewFiles, unused: unusedImagePaths };
          generated = { ...generated, files: pages.files };
          lenient = true;
          try { await acceptCandidate(); }
          catch (error) {
            generated = before.generated; autoRepairs.length = before.repairs; motifFiles = before.motifs; acceptedPreviewFiles = before.preview; unusedImagePaths = before.unused;
            this.logger.warn(JSON.stringify({ event: 'sep5_standard_pages_declined', generationId: run.id, reason: ((error as Error)?.message || '').slice(0, 300) }));
          } finally { lenient = false; }
        };
        // Self-review after the save (spec 2026-10-12 faster generation). The author writes blind, never seeing its own CSS
        // render; the review is shown the draft once, at desktop and phone widths, with what the browser measured. The draft
        // that just passed is saved as revision N and shown first; startSep5Review runs this afterwards and saves the corrected
        // project as N+1 only if it passes the same acceptance and the store is still on N.
        if (sep5SelfReview) {
          const draftFiles = authored.data.files, draftPreview = acceptedPreviewFiles;
          sep5Review = async review => {
            // The same config a new store saves with, so the runtime renders the live catalog into the draft.
            const config = { sitePurpose, scrollFeel, demo: false, slug: owner.slug, apiBaseUrl: apiUrl.href.replace(/\/$/, ''), checkoutOrigin: this.config.get<string>('app.checkoutOrigin'), productPage: 'product.html', checkoutPage: 'checkout.html', data };
            const preview = await currentSourceRuntime({ brief: dto.brief, files: [
              ...draftPreview.filter(file => !['config.js', 'commerce.js'].includes(file.path)),
              { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` },
              { path: 'commerce.js', content: '' },
            ] } as unknown as SourceProjectSnapshot);
            const { shots, facts } = await captureSep5Draft(preview, review.signal);
            // Playbook facts: type sizes against the kind's craft profile, and contract sections missing from the page.
            const playbookFacts = playbookEntry ? facts.flatMap(fact => [...(boldAsked ? [] : craftFacts(playbookEntry.profile, fact.width, fact.h1Size ?? 0, fact.bodySize ?? 0)), ...(fact.width === 1280 && fact.pageText ? contractMisses(playbookEntry, fact.pageText, playbookEvidence).map(label => `Falta en la página: ${label} (solo con datos reales del brief; nunca lo inventes).`) : [])]) : [];
            const measured = [...sep5MeasuredFacts(facts), ...playbookFacts];
            const reviewed = await sep5Call('review', sep5ReviewPrompt({ ...authorInput, draft: draftFiles, measured }), shots.map(shot => ({ type: 'input_image' as const, image_url: shot.image, detail: 'auto' as const })), 'storefront_self_review', SEP5_REVIEW_RESPONSE_SCHEMA, SEP5_CLIENT_TIMEOUT_MS, review);
            const result = sep5ReviewSchema.safeParse(sourceResponseJson(reviewed.body));
            if (!result.success) throw new Error(`la revisión no devolvió un resultado válido (${reviewed.attempt.responseStatus || 'sin estado'}${reviewed.attempt.incompleteReason ? `: ${reviewed.attempt.incompleteReason}` : ''})`);
            this.logger.log(JSON.stringify({ event: 'sep5_self_review', generationId: run.id, measured, changed: result.data.edits.length > 0, edits: result.data.edits.length, notes: result.data.notes.length }));
            // Edits on the draft the review was shown; one that does not apply cleanly is skipped, never fatal.
            const edited = applySep5Edits(draftFiles, result.data.edits);
            // Nothing to change, or no edit applied: revision N stays the store and no empty «Revisión de YAPI» is saved.
            if (edited.files.every((file, index) => file.content === draftFiles[index]?.content)) { reviewed.attempt.status = 'COMPLETED'; return null; }
            if (!sep5ProjectIsUsable(edited.files)) throw new Error('la revisión dejó el proyecto sin catálogo, carrito o estilos');
            const kept = sep5AuthorableFiles(edited.files);
            reviewing = true;
            generated = { label: result.data.label.slice(0, 120) || generated.label, files: kept.files };
            lenient = true;
            try { await acceptCandidate(); } finally { lenient = false; }
            await addSep5StandardPages();
            reviewed.attempt.status = 'COMPLETED';
            return { saveInput: await assembleSave(), notes: result.data.notes };
          };
        }
        await addSep5StandardPages();
```

- [ ] **Step 3f: Extract the save assembly so the review can reuse it.** In the tail after the engine branches:
- Lines ~1535–1593 run from `    const acceptedDesign = applyProductThemeToDesign(…);` through `    const motifPack = chosenMotifPack(agentMotifPack, previousConfig.motifPack);` and its comment. Lines ~1594–1599 are the policy and `config` lines. Lines ~1605–1615 build `saveInput`.
- Move all of them, unchanged, into the closure below. Keep `successfulAttempts`, `credits`, `receipt` and `progress('saving')` outside it.

The tail then reads:

```ts
    const agentPolicyChange = Object.keys(agentPolicies).length > 0;
    /** Everything a save carries besides the model's authored files: kit files, assets, design and visual-system files,
     *  config.js. Built from `generated` as it is when called: once for revision N, and again by the background review. */
    const assembleSave = async () => {
      // ...lines ~1535–1593 unchanged, from `const acceptedDesign = …` through `const motifPack = …`...
      if (agentPolicyChange) data.policies = mergeAgentPolicies((await this.prisma.store.findUnique({ where: { id: storeId }, select: { policies: true } }))?.policies, agentPolicies);
      const config = { ...sourceCommerceRoutes([...generated.files, ...kitFiles], previousConfig), /* …unchanged… */ data };
      return { revision: dto.revision, label: generated.label, brief: dto.brief, files: await withSourceMotion(await withSourceCommerceDesign(await withSourceFonts(await withSourceAssets([
        // ...the file list of lines ~1606–1614 unchanged...
      ], previousFiles, assetLegend, imageUses, photoFacts))), motion) };
    };
    const successfulAttempts = attempts.filter(attempt => attempt.status === 'COMPLETED');
    // Failed attempts are absorbed. Unknown provider usage is never invented or billed.
    const credits = freeRun ? 0 : successfulAttempts.every(attempt => attempt.usage) ? Math.min(maxCredits, Math.ceil(successfulAttempts.reduce((sum, attempt) => sum + attempt.usage!.providerMicroUsd, 0) / CREDIT_MICRO_USD)) : 0;
    const receipt = { /* …line ~1603 unchanged… */ };
    await progress?.('saving');
    const saveInput = await assembleSave();
    signal.throwIfAborted();
```

The comments `// ...unchanged...` above mark where the existing lines go verbatim. They are not code to type. The only edits are:
- `const agentPolicyChange = …` moves above the closure.
- `const saveInput = { … }` becomes the closure's `return { … }`.
- `const saveInput = await assembleSave();` is added.

- [ ] **Step 3g: Start the review after revision N is saved.** After the line `    if (fillsProductPagesAfterSave(!previous, redesign)) void this.pageWriter?.fillStore(storeId).catch(() => undefined);` add:

```ts
    // The Sep-5 self-review runs after the store is shown (spec 2026-10-12 faster generation) and lands as N+1 if still wanted.
    if (sep5Review) await this.startSep5Review({ merchantId, storeId, revision: saved.revision, brief: dto.brief, savedFiles: saveInput.files, model, requestedModel: plan.requestedModel, maxCredits, freeRun, review: sep5Review });
```

- [ ] **Step 3h: The background runner.** Add this method right after `generate()`'s closing `}` and before the `proposeStyles` doc comment:

```ts
  /**
   * YAPI's self-review of a Sep-5 store, after revision N is saved and shown (spec 2026-10-12 faster generation, part 2).
   * It runs in this API process, outside the chat request that saved N, on its own REVIEWING row:
   * - no lease, so a new request cancels it instead of waiting;
   * - a heartbeat, which Studio's reviewPending reads;
   * - the row flips to COMPLETED in the same transaction that saves N+1 «Revisión de YAPI».
   * The save keeps the optimistic revision check, so a merchant change, template or restore since N discards the result
   * silently. Credits are charged on the row only when the review's answer is used. Resolves once the row exists.
   */
  private async startSep5Review(input: { merchantId: string; storeId: string; revision: number; brief: SaveSourceProjectDto['brief']; savedFiles: SourceProjectFileDto[]; model: SourceModel; requestedModel: string; maxCredits: number; freeRun: boolean; review: Sep5Review }): Promise<void> {
    const row = await this.prisma.storeSourceGeneration.create({ data: { storeId: input.storeId, baseRevision: input.revision, requestedModel: input.requestedModel, model: input.model, maxCredits: input.maxCredits, status: SOURCE_REVIEW_STATUS } })
      .catch(error => { this.logger.warn(JSON.stringify({ event: 'sep5_review_not_started', storeId: input.storeId, reason: ((error as Error)?.message || '').slice(0, 300) })); return null; });
    if (!row) return;
    // Outside the request's context: its lease fence and progress reporter belong to a chat job that has finished.
    void this.reviews.start(input.storeId, cancel => sourceRequestContext.exit(async () => {
      const started = Date.now(), attempts: SourceGenerationAttempt[] = [], lost = new AbortController();
      const heartbeat = setInterval(() => {
        void this.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { heartbeatAt: new Date() } }).then(result => { if (!result.count) lost.abort(); }).catch(() => undefined);
      }, this.reviewHeartbeatMs);
      const record = () => ({ attempts: attempts as unknown as Prisma.InputJsonValue, durationMs: Date.now() - started, completedAt: new Date() });
      try {
        const signal = AbortSignal.any([cancel, lost.signal, AbortSignal.timeout(SEP5_CLIENT_TIMEOUT_MS)]);
        const outcome = await input.review({ signal, attempts });
        signal.throwIfAborted();
        const credits = completedCredits(attempts, input.maxCredits, input.freeRun);
        if (!outcome) {
          await this.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { status: 'COMPLETED', credits, ...record() } });
          this.logger.log(JSON.stringify({ event: 'sep5_review_unchanged', generationId: row.id }));
          return;
        }
        // Header controls the review covers, judged against revision N, like an edit: only covers it brings in block.
        if (this.config.get<boolean>('app.headerClickGate') === true) {
          let introduced: HeaderCover[] = [];
          try {
            const covers = async (files: SourceProjectFileDto[]) => captureHeaderCovers(await currentSourceRuntime({ brief: input.brief, files } as unknown as SourceProjectSnapshot), signal);
            const saved = await covers(input.savedFiles);
            introduced = introducedHeaderCovers(await covers(outcome.saveInput.files), saved);
          } catch (error) {
            signal.throwIfAborted();
            this.logger.warn(JSON.stringify({ event: 'header_click_check_failed', generationId: row.id, reason: ((error as Error)?.message || '').slice(0, 300) }));
          }
          if (introduced.length) throw new SourceReviewDiscarded(headerCoverProblems(introduced).join(' '));
        }
        const saved = await this.projects.save(input.merchantId, input.storeId, { ...outcome.saveInput, revision: input.revision, label: SOURCE_REVIEW_LABEL }, undefined, async tx => {
          const held = await tx.storeSourceGeneration.updateMany({ where: { id: row.id, status: SOURCE_REVIEW_STATUS }, data: { status: 'COMPLETED', revision: input.revision + 1, credits, ...record() } });
          if (held.count !== 1) throw new SourceReviewCancelled('la revisión se canceló antes de guardarse');
        });
        const thread = await this.prisma.storeAgentThread.findUnique({ where: { storeId: input.storeId }, select: { id: true } }).catch(() => null);
        if (thread) await this.prisma.storeAgentMessage.create({ data: { threadId: thread.id, channel: 'source', role: 'ASSISTANT', content: reviewMessage(outcome.notes, outcome.saveInput.label), metadata: { sourceRevision: saved.revision, label: SOURCE_REVIEW_LABEL, review: true } } }).catch(() => undefined);
        if (credits) await this.coverWithRewardCredits(input.merchantId, row.id, credits);
        this.logger.log(JSON.stringify({ event: 'sep5_review_saved', generationId: row.id, revision: saved.revision, notes: outcome.notes.length }));
      } catch (error) {
        const status = cancel.aborted || lost.signal.aborted || error instanceof SourceReviewCancelled ? 'CANCELLED'
          : error instanceof ConflictException || error instanceof SourceReviewDiscarded ? 'DISCARDED' : 'FAILED';
        await this.prisma.storeSourceGeneration.updateMany({ where: { id: row.id, status: { in: [SOURCE_REVIEW_STATUS, 'CANCELLED'] } }, data: { status, credits: 0, ...record() } }).catch(() => undefined);
        this.logger.warn(JSON.stringify({ event: 'sep5_review_kept_draft', generationId: row.id, status, reason: ((error as Error)?.message || 'sin respuesta').slice(0, 300) }));
      } finally { clearInterval(heartbeat); }
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass, then check nothing else moved**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
Expected: PASS (8 tests).

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-style.spec.ts src/storefront-source/source-generation.service.spec.ts --maxWorkers=2`
Expected: PASS. Both files test the save path that was wrapped in `assembleSave()`.

Run: `cd /Users/saramia/pagosYa/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(yapi): save the Sep-5 draft first and land the self-review as a later revision"
```

---

### Task 7: A new request cancels the review; a cancelled review costs nothing

**Files:**
- Modify: `apps/api/src/storefront-source/source-generation.service.ts:366-368` (`generate` right after the revision check)
- Test: `apps/api/src/storefront-source/source-generation-review.spec.ts`

**Interfaces:**
- Consumes:
  - Task 5: `cancelReview(storeId)`.
  - Task 6: `startSep5Review`, `reviewHeartbeatMs`, `reviewSettled`.
- Produces: every non-candidate `generate()` awaits `this.cancelReview(storeId)` right after its revision check, before it takes the lease.

- [ ] **Step 1: Write the failing tests** — add inside `describe('Sep-5 self-review after the save', …)` in `source-generation-review.spec.ts`:

```ts
  /** A review call that waits until its signal aborts. */
  const hangingReview = (seen: { signal?: AbortSignal }) => respond(init => { seen.signal = init.signal; return new Promise((_ok, fail) => init.signal.addEventListener('abort', () => fail(init.signal.reason))); });

  it('a new request cancels the running review before it takes the lease; the cancelled review saves nothing and costs nothing', async () => {
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => Boolean(seen.signal));
    const cancel = jest.spyOn(service, 'cancelReview');
    stores.getStorePublic.mockRejectedValueOnce(new Error('tienda no disponible'));
    await expect(service.generate('m1', 's1', { ...dto, revision: 1 }, new SourceRequestBudget(25), [], progress)).rejects.toThrow('tienda no disponible');
    expect(cancel).toHaveBeenCalledWith('s1');
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(stores.getStorePublic.mock.invocationCallOrder.at(-1)!);
    await service.reviewSettled('s1');
    expect(seen.signal!.aborted).toBe(true);
    expect(prisma.storeSourceGeneration.updateMany).toHaveBeenCalledWith({ where: { storeId: 's1', status: 'REVIEWING' }, data: { status: 'CANCELLED', completedAt: expect.any(Date) } });
    expect(ending('CANCELLED').data).toMatchObject({ credits: 0 });
    expect(projects.save).toHaveBeenCalledTimes(1);
    expect(prisma.storeAgentMessage.create).not.toHaveBeenCalled();
  });

  it('leaves the review alone for a private visual-repair candidate', async () => {
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => Boolean(seen.signal));
    const cancel = jest.spyOn(service, 'cancelReview');
    stores.getStorePublic.mockRejectedValueOnce(new Error('tienda no disponible'));
    await expect(service.generate('m1', 's1', { ...dto, revision: 1 }, new SourceRequestBudget(25), [], progress, { candidate: true })).rejects.toThrow('tienda no disponible');
    expect(cancel).not.toHaveBeenCalled();
    expect(seen.signal!.aborted).toBe(false);
    await service.cancelReview('s1');
    await service.reviewSettled('s1');
  });

  it('keeps the review row beating while it runs, and stops the review when another process retired the row', async () => {
    (service as any).reviewHeartbeatMs = 5;
    const seen: { signal?: AbortSignal } = {};
    fetchMock.mockImplementation(hangingReview(seen) as any);
    await generateN();
    await eventually(() => reviewWrites().some((c: any) => 'heartbeatAt' in c.data));
    expect(reviewWrites().find((c: any) => 'heartbeatAt' in c.data)).toEqual({ where: { id: 'review-1', status: 'REVIEWING' }, data: { heartbeatAt: expect.any(Date) } });
    prisma.storeSourceGeneration.updateMany.mockImplementation(async (args: any) => ({ count: 'heartbeatAt' in args.data ? 0 : 1 }));
    await service.reviewSettled('s1');
    expect(seen.signal!.aborted).toBe(true);
    expect(ending('CANCELLED').data).toMatchObject({ credits: 0 });
    expect(projects.save).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-review.spec.ts --maxWorkers=2`
Expected: FAIL. The first new test reports `expect(cancel).toHaveBeenCalledWith('s1')` with 0 calls. The heartbeat test already passes, because it was implemented in Task 6.

- [ ] **Step 3: Write minimal implementation** — in `generate`, replace:

```ts
    if (current.revision !== dto.revision) throw new ConflictException("El proyecto cambió. Recarga antes de generar.");
    const plan = sourceGenerationPlan(dto.model, dto.revision, dto.instruction);
```

with:

```ts
    if (current.revision !== dto.revision) throw new ConflictException("El proyecto cambió. Recarga antes de generar.");
    // A new request stops YAPI's background polish of the last store before it takes the lease (spec 2026-10-12): the polish
    // would only be discarded by this run's save. A private visual-repair candidate saves nothing, so it leaves it running.
    if (!execution?.candidate) await this.cancelReview(storeId);
    const plan = sourceGenerationPlan(dto.model, dto.revision, dto.instruction);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation-review.spec.ts src/storefront-source/source-background-review.spec.ts --maxWorkers=2`
Expected: PASS for both files.

Run: `cd /Users/saramia/pagosYa/apps/api && npx jest src/storefront-source/source-generation.service.spec.ts src/storefront-source/source-generation-style.spec.ts --maxWorkers=2`
Expected: PASS. `cancelReview` never fails a run, even where a mock has no matching `updateMany`.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/api/src/storefront-source/source-generation.service.ts apps/api/src/storefront-source/source-generation-review.spec.ts
git commit -m "feat(yapi): a new request cancels the background review before it takes the lease"
```

---

### Task 8: Studio lets the merchant pick while heroes draw, and keeps the cards fresh

**Files:**
- Modify: `apps/merchant-studio/src/source-style-pick.ts:9-10,46-72`
- Modify: `apps/merchant-studio/src/source-studio.ts:14,84,480-494`
- Test: `apps/merchant-studio/src/source-style-pick.test.ts`

**Interfaces:**
- Consumes (Task 1): `pickable?: true` on the style-proposal view.
- Produces:
  - `StyleProposalView.pickable?: boolean`.
  - `export const STYLE_POLL_MAX_MS = 360_000`.
  - `export function keepStylePolling(view: StyleProposalView | null, pollingFor: number): boolean`.

- [ ] **Step 1: Write the failing tests** — in `source-style-pick.test.ts`, change the import to `import { apiHeroUrls, fitStyleFrames, frameScale, heroSrcdoc, keepStylePolling, renderStylePicker, STYLE_POLL_MAX_MS, type StyleProposalView } from './source-style-pick';` and add inside `describe('style picker', …)`:

```ts
  // Spec 2026-10-12 faster generation: choosable once both cards are planned, while their heroes are still being drawn.
  it('lets the merchant choose a card whose hero is still being drawn, once both cards are planned', () => {
    const choosable: StyleProposalView = { ...view, status: 'RUNNING', pickable: true, cards: [{ ...card(0, 'calm'), source: 'template', pending: true }, card(1, 'bold')] };
    const grid = renderStylePicker(choosable, state);
    expect(grid).toContain('Elige tu estilo');
    expect(grid).not.toContain('Preparando tus estilos…');
    expect(grid).toContain('data-style-auto');
    expect(grid).not.toContain('data-style-placeholder');
    expect(grid).toContain('Mejorando diseño…');
    const preview = renderStylePicker(choosable, { ...state, open: 0 });
    expect(preview).toMatch(/data-style-use="0" >/);
    expect(preview).not.toContain('Podrás elegirlo cuando estén listos todos los estilos.');
    expect(renderStylePicker(choosable, { ...state, open: 0, busy: true })).toMatch(/data-style-use="0" disabled/);
  });
  it('keeps polling a running proposal for at most STYLE_POLL_MAX_MS, and never one that stopped running', () => {
    const running: StyleProposalView = { ...view, status: 'RUNNING' };
    expect(keepStylePolling(running, 0)).toBe(true);
    expect(keepStylePolling(running, STYLE_POLL_MAX_MS - 1)).toBe(true);
    expect(keepStylePolling(running, STYLE_POLL_MAX_MS)).toBe(false);
    expect(keepStylePolling(view, 0)).toBe(false);
    expect(keepStylePolling(null, 0)).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-style-pick.test.ts --maxWorkers=2`
Expected: FAIL. `keepStylePolling` is not exported, and the choosable grid still shows `Preparando tus estilos…`.

- [ ] **Step 3: Write minimal implementation**

In `source-style-pick.ts`, replace the `StyleProposalView` type with:

```ts
/** PICKED: the merchant's pick whose build failed; the cards stay, with that card marked, so it can be retried. */
export type StyleProposalView = { generationId: string; status: 'RUNNING' | 'AWAITING_STYLE' | 'PICKED'; recommended: number; picked?: number;
  /** RUNNING but choosable: both cards are planned and only their heroes are still being drawn (spec 2026-10-12). */
  pickable?: boolean; cards: StyleCard[] };

/** Choosable cards keep drawing heroes after the request ended; this bounds a row a crashed worker left running. */
export const STYLE_POLL_MAX_MS = 360_000;
export function keepStylePolling(view: StyleProposalView | null, pollingFor: number): boolean {
  return view?.status === 'RUNNING' && pollingFor < STYLE_POLL_MAX_MS;
}
```

In `renderStylePicker`, below `  const running = !view || view.status === 'RUNNING';` add:

```ts
  const choosable = Boolean(view) && (!running || view!.pickable === true);
```

Then make these replacements inside `renderStylePicker`:
- `data-style-use="${Number(open.index)}" ${state.busy || running ? 'disabled' : ''}>Usar este estilo</button>${running ? '<small` → `data-style-use="${Number(open.index)}" ${state.busy || !choosable ? 'disabled' : ''}>Usar este estilo</button>${!choosable ? '<small`.
- `const placeholders = running ? Math.max(0, 2 - cards.length) : 0;` → `const placeholders = !choosable ? Math.max(0, 2 - cards.length) : 0;`.
- `const footer = running ? '' : picked` → `const footer = !choosable ? '' : picked`.
- `aria-busy="${running}"` → `aria-busy="${!choosable}"`.
- `<h2>${running ? 'Preparando tus estilos…'` → `<h2>${!choosable ? 'Preparando tus estilos…'`.

In `source-studio.ts`:
- Change the import on line 14 to `import { apiHeroUrls, fitStyleFrames, keepStylePolling, renderStylePicker, type StyleProposalView } from './source-style-pick';`.
- On line 84, append ` let stylePollStarted = 0;` after `let stylePoll: number | undefined;`.
- In `loadStyleProposal`, replace:

```ts
    // A RUNNING row left by a crashed worker must not keep the poll alive once the build is over.
    if (styleView?.status !== 'RUNNING' || !building()) stopStylePoll();
```

with:

```ts
    // Choosable cards keep drawing their heroes after the request ended (spec 2026-10-12), so a running proposal keeps the
    // poll alive; STYLE_POLL_MAX_MS bounds a row a crashed worker left running.
    if (styleView?.status === 'RUNNING' && !stylePoll) watchStyleProposal();
    else if (!keepStylePolling(styleView, Date.now() - stylePollStarted)) stopStylePoll();
```

- In `watchStyleProposal`, insert `    stylePollStarted = Date.now();` right before `    stylePoll = window.setInterval(() => void loadStyleProposal(), 1500); void loadStyleProposal(true);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-style-pick.test.ts src/source-studio.test.ts --maxWorkers=2`
Expected: PASS for both files. The pre-existing `'keeps Usar este estilo disabled in the preview while the proposal is still running'` still passes, because a running proposal without `pickable` is not choosable.

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-studio/src/source-style-pick.ts apps/merchant-studio/src/source-style-pick.test.ts apps/merchant-studio/src/source-studio.ts
git commit -m "feat(studio): choose a style while its hero is still being drawn"
```

---

### Task 9: Studio shows «YAPI está puliendo tu tienda…» and picks up the polished version

**Files:**
- Create: `apps/merchant-studio/src/source-review-note.ts`
- Modify: `apps/merchant-studio/src/api.ts` (`styleProposal` method ~331; `SourceState` ~522)
- Modify: `apps/merchant-studio/src/source-studio.ts` (imports; line 84; `load` ~397; after `stopStylePoll` ~490; the `source-canvas-notice` div ~819)
- Modify: `apps/merchant-studio/src/source-studio.css`
- Test: `apps/merchant-studio/src/source-review-note.test.ts`, `apps/merchant-studio/src/source-studio.test.ts`

**Interfaces:**
- Consumes (Task 5):
  - `reviewPending: boolean` on `GET source-project`.
  - `POST source-project/review/cancel` returns `{ cancelled: boolean }`.
  - The API's chat message `Pulí tu tienda: …`, with `metadata.sourceRevision`.
- Produces:
  - `REVIEW_POLL_MS = 4000` and `REVIEW_NOTE = 'YAPI está puliendo tu tienda…'`.
  - `reviewNoteMarkup(pending: boolean): string`.
  - `reviewPollAction(input: { shownRevision: number; next: { revision: number; reviewPending?: boolean }; editing: boolean }): 'reload' | 'stop' | 'cancel' | 'wait'`.
  - `MerchantStudioApi.cancelSourceReview(storeId: string): Promise<{ cancelled: boolean }>`.
  - `SourceState.reviewPending?: boolean`.

- [ ] **Step 1: Write the failing tests**

Create `source-review-note.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REVIEW_NOTE, REVIEW_POLL_MS, reviewNoteMarkup, reviewPollAction } from './source-review-note';

describe('YAPI polishing note (spec 2026-10-12)', () => {
  it('says YAPI is polishing only while a review is pending, and polls every 4 s', () => {
    expect(REVIEW_POLL_MS).toBe(4000);
    expect(reviewNoteMarkup(true)).toBe(`<p class="source-review-note" role="status" data-review-note>${REVIEW_NOTE}</p>`);
    expect(REVIEW_NOTE).toBe('YAPI está puliendo tu tienda…');
    expect(reviewNoteMarkup(false)).toBe('');
  });
  it('reloads when the polished version lands, and stops quietly when the review ended without one', () => {
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 5, reviewPending: false }, editing: false })).toBe('reload');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: false }, editing: false })).toBe('stop');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: true }, editing: false })).toBe('wait');
  });
  it('cancels while editing and never reloads over unsaved work', () => {
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 4, reviewPending: true }, editing: true })).toBe('cancel');
    expect(reviewPollAction({ shownRevision: 4, next: { revision: 5, reviewPending: false }, editing: true })).toBe('wait');
  });
});
```

Append to `source-studio.test.ts`:

```ts
it('shows the polishing note while YAPI reviews, then loads the polished store and its chat line when it lands', async () => {
  vi.spyOn(MerchantStudioApi.prototype, 'recordSourceChecks').mockResolvedValue({});
  vi.spyOn(MerchantStudioApi.prototype, 'sourceState')
    .mockResolvedValueOnce({ revision: 2, versions: [version], nextBefore: null, reviewPending: true })
    .mockResolvedValue({ revision: 3, versions: [version], nextBefore: null, reviewPending: false });
  vi.spyOn(MerchantStudioApi.prototype, 'sourceConversation')
    .mockResolvedValueOnce({ messages: [] })
    .mockResolvedValue({ messages: [{ id: 'r1', role: 'ASSISTANT', content: 'Pulí tu tienda: Agrandé el título.', metadata: { sourceRevision: 3, label: 'Revisión de YAPI', review: true }, createdAt: '2026-10-12T12:00:00Z' }] } as any);
  vi.spyOn(MerchantStudioApi.prototype, 'sourceVersion').mockImplementation(async (_store: string, revision: number) => ({ ...version, revision }));
  await mountSourceStudio(app);
  expect(app.querySelector('[data-review-note]')?.textContent).toBe('YAPI está puliendo tu tienda…');
  await vi.waitFor(() => expect(app.textContent).toContain('Pulí tu tienda: Agrandé el título.'), { timeout: 9000 });
  expect(app.querySelector('[data-review-note]')).toBeNull();
}, 15000);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-review-note.test.ts src/source-studio.test.ts --maxWorkers=2`
Expected: FAIL.
- `Failed to resolve import "./source-review-note"`.
- In `source-studio.test.ts`, the type error `'reviewPending' does not exist in type 'SourceState'` (if vitest typechecks), or else no `[data-review-note]` element.

- [ ] **Step 3: Write minimal implementation**

Create `source-review-note.ts`:

```ts
/** Spec 2026-10-12 faster generation: YAPI polishes a new store after showing it; Studio says so and picks up the result. */
export const REVIEW_POLL_MS = 4000;
export const REVIEW_NOTE = 'YAPI está puliendo tu tienda…';
export type ReviewPollAction = 'reload' | 'stop' | 'cancel' | 'wait';

export function reviewNoteMarkup(pending: boolean): string {
  return pending ? `<p class="source-review-note" role="status" data-review-note>${REVIEW_NOTE}</p>` : '';
}

/** One poll of the store state while a review is pending. `editing`: the merchant has unsaved work or a request running.
 *  The polished version is never loaded over unsaved work, and a review the merchant is editing past is cancelled. */
export function reviewPollAction(input: { shownRevision: number; next: { revision: number; reviewPending?: boolean }; editing: boolean }): ReviewPollAction {
  if (input.next.revision !== input.shownRevision) return input.editing ? 'wait' : 'reload';
  if (!input.next.reviewPending) return 'stop';
  return input.editing ? 'cancel' : 'wait';
}
```

In `api.ts`:
- Change `export interface SourceState { publication?: SourcePublication; revision: number; versions: SourceRevision[]; nextBefore: number | null }` to `export interface SourceState { publication?: SourcePublication; revision: number; versions: SourceRevision[]; nextBefore: number | null; /** YAPI is polishing this revision in the background (spec 2026-10-12). */ reviewPending?: boolean }`.
- Below the `styleProposal(storeId)` method, add:

```ts
  /** Stops YAPI's background polish (spec 2026-10-12), when the merchant starts editing. */
  cancelSourceReview(storeId: string): Promise<{ cancelled: boolean }> {
    return this.request(`/stores/${encodeURIComponent(storeId)}/source-project/review/cancel`, { method: 'POST', body: '{}' });
  }
```

In `source-studio.ts`:
- Add the import `import { REVIEW_POLL_MS, reviewNoteMarkup, reviewPollAction } from './source-review-note';`.
- On line 84, append ` let reviewTimer: number | undefined;`.
- In `load`, replace:

```ts
    await refreshInterruptedDraft().catch(() => {});
    // A saved design shows at once; the browser checks load every page at four widths and report when done.
```

with:

```ts
    await refreshInterruptedDraft().catch(() => {});
    syncReviewWatch();
    // A saved design shows at once; the browser checks load every page at four widths and report when done.
```

- After the line `  function stopStylePoll() { if (stylePoll) { window.clearInterval(stylePoll); stylePoll = undefined; } }`, add:

```ts
  function stopReviewWatch() { if (reviewTimer) { window.clearInterval(reviewTimer); reviewTimer = undefined; } }
  /** While YAPI polishes the shown revision (spec 2026-10-12): poll the state every 4 s, load the polished version (preview
   *  and chat) when it lands, drop the note when the review ends without one, and cancel it once the merchant edits. */
  function syncReviewWatch() {
    stopReviewWatch();
    if (!state.reviewPending) return;
    const selectedStore = storeId;
    reviewTimer = window.setInterval(() => void (async () => {
      if (storeId !== selectedStore) { stopReviewWatch(); return; }
      const next = await api.sourceState(selectedStore).catch(() => null);
      if (!next || storeId !== selectedStore || !reviewTimer) return;
      const step = reviewPollAction({ shownRevision: state.revision, next, editing: busy || dirty() || visualEditing || bocetoOpen });
      if (step === 'wait') return;
      stopReviewWatch();
      if (step === 'reload') { await load(next.revision); render(); return; }
      if (step === 'cancel') await api.cancelSourceReview(selectedStore).catch(() => undefined);
      state = { ...state, reviewPending: false }; render();
    })(), REVIEW_POLL_MS);
  }
```

- In the `source-canvas-notice` div, replace the unique ending `Ver diseño guardado'}</button></div>` : ''}</div>` with:

```ts
Ver diseño guardado'}</button></div>` : ''}${reviewNoteMarkup(Boolean(state.reviewPending) && !building())}</div>
```

In `source-studio.css`, append:

```css
.source-review-note { margin: 0; padding: 8px 16px; font-size: 13px; line-height: 1.5; color: #4b5563; background: var(--surface); border-bottom: 1px solid #e5e7eb; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx vitest run src/source-review-note.test.ts src/source-studio.test.ts src/source-style-pick.test.ts --maxWorkers=2`
Expected: PASS for all three files.

Run: `cd /Users/saramia/pagosYa/apps/merchant-studio && npx tsc -p tsconfig.json`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
cd /Users/saramia/pagosYa
git add apps/merchant-studio/src/source-review-note.ts apps/merchant-studio/src/source-review-note.test.ts apps/merchant-studio/src/api.ts apps/merchant-studio/src/source-studio.ts apps/merchant-studio/src/source-studio.test.ts apps/merchant-studio/src/source-studio.css
git commit -m "feat(studio): show YAPI polishing the store and load the polished version when it lands"
```

---

## After the tasks (owner-run, not an agent step)

The spec's last test is a live run. One real new-store generation through the ChatGPT-plan bridge, timing each stage against the spec's table:
- request read;
- cards offered (the chat line «Te preparo 2 estilos…»);
- pick;
- revision N visible;
- «Pulí tu tienda: …» landing.

The owner's dashboard serves a pre-built Studio, so the Studio must be rebuilt before that run. Agents do not start the dev servers, rebuild the Studio or hit the real bridge unless the owner asks.
