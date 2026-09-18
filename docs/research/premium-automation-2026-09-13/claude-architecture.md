I've finished reading the files and am writing up the critique. I couldn't save a plan file because this session only has the Read tool, so the full review is below.

# Review of the durable design-improvement workflow

## Context
`architecture.md` proposes a background job that runs on a fixed source revision: capture the page, review it, repair it, compare, then apply or discard. The overall shape is sound. The problems are in how it connects to three existing services: `SourceGenerationService.generate`, `SourceProjectsService.append` and `SourceVisualReviewService`. Several things the doc assumes are not true in the current code. Below: the gaps with code references, then a narrow design that closes them.

---

## 1. Concurrency

**C1. The generation slot is cleared by age, not by liveness.** `source-generation.service.ts:318` marks any RUNNING row older than 10 minutes (`createdAt`) as INTERRUPTED. A job holding that slot across stages gets evicted, and a chat generation can then spend at the same time. Commit is still protected (`source-projects.service.ts:214` rejects the evicted run), but the provider spend overlaps. The doc's statement that the slot "still serializes provider work" is only true per call, never across a whole job.
→ Only paid stages should take the slot, one `storeSourceGeneration` row per stage, with the stage deadline well under 10 minutes. The job's own `activeStoreId` should not be treated as a lock against chat.

**C2. Losing the lease doesn't stop in-flight spend.** Checking the lease on every write stops stale writes but not a `fetch` that is already running. When the heartbeat's CAS fails (`count === 0`), the worker has to abort its `AbortController`. The lease TTL must also be longer than the longest non-abortable step: `compileNextPreview`, the Playwright capture (45 s deadline in `source-visual-capture.ts:16`), and `projects.save`.

**C3. The order of slot and reservation matters.** If the stage reserves budget in PostgreSQL and then `generate()` fails with P2002 because a chat run holds the slot (`:323`), the reservation leaks. The order must be:
1. Take the slot.
2. Reserve.
3. Dispatch.
4. If the slot is refused, release the reservation (spend is known to be zero).

**C4. `SourceVisualReviewService.running` is a flag inside one process** (`source-visual-review.service.ts:32`). It does nothing across instances and doesn't coordinate with generation. The job's review and compare stages must not rely on it or on `latest()`. `latest()` looks up reports by revision, page and product only, with no runtime or catalog digest, so it can't serve as a cache of completed stages.

**C5. Unbounded Chromium launches.** Each capture launches its own browser. The scheduled worker needs a concurrency cap per instance (1 is fine) or captures will fight over memory.

## 2. Budgets

**B1. `SourceRequestBudget` isn't a hard cap.** `settle()` adds `actual − reserved` (`source-request-budget.ts:28`). If input was underestimated, spend goes past `maxCredits` without any error. The persistent ledger should store observed spend and block later stages once `held + observed ≥ max`. It should not claim an exact cap.

**B2. `generate()` creates its own budget and hides the per-attempt results when it fails.** When it throws, the attempts are written to `storeSourceGeneration.attempts` (`:532`) but never returned to the caller. The job then can't tell known usage from unknown.
→ Candidate mode should always return (or throw with) `{ attempts }`. The stage settles to the sum of observed usage only if every attempt has `usage`; otherwise the full stage cap stays held.

**B3. Receipts count spend differently than the budget does.** `credits` counts only successful attempts and caps them at `maxCredits` (`:519`). The job's budget has to count every attempt, including failed ones. Don't reuse the `credits` value.

**B4. A worst-case cap per stage is computable, so reserve it.** With candidate mode forcing `redesign=false`, there is no exploration call. The counts are:
- review: 1 call
- each repair: at most 2 source attempts (`:357`)
- each compare: 1 call

Two candidates therefore mean at most 7 paid calls. Pass a stage cap as `dto.maxCredits` (whole credits from 1 to 500, per `source-request-budget.ts:9`) and reserve that amount in micro-USD before the slot is released to dispatch.

**B5. Resume must not release held reservations.** Reservations held for unknown usage from an interrupted stage stay counted forever. "Another bounded allowance" should require the merchant to raise `max` explicitly. Resume should never reset `held`.

## 3. Cancellation

**X1. There's no way to cancel from outside.** `generate()` uses `AbortSignal.timeout(240_000)` (`:327`). Review uses `AbortSignal.timeout(45000)`. The design planner takes a signal but only gets that timeout.
→ Add an optional `signal` and use `AbortSignal.any([timeout, external])`. The abort still won't reach uploads, `compileNextPreview` or Playwright, so check `signal.aborted` between steps.

**X2. A cancel flag only takes effect if something reads it.** The heartbeat has to read `cancelRequested` and abort. Otherwise a cancel waits up to 240 s for the paid call to finish.

**X3. Cancel and apply race each other.** Make both single-statement CAS updates on the job row:
- **Apply:** inside the append transaction, the first statement is `UPDATE job SET state='APPLYING' WHERE id=? AND state='CANDIDATE_READY' AND cancelRequested=false`.
- **Cancel:** `UPDATE job SET cancelRequested=true WHERE id=? AND state NOT IN ('APPLIED', …terminal)`. If it matches 0 rows, return "already applied".

Row locks make the loser re-check its predicate, so exactly one wins.

## 4. Source and catalog staleness

**S1. The baseline and the candidate render different catalogs.** Captures run offline (`connect-src 'none'`, `source-visual-capture.ts:27`), so they show the catalog embedded in the revision's `config.js`. But `generate()` rebuilds `config.js` from **live** `getStorePublic` data (`:146`, `:516`). Product edits made in the Products screen don't create a new source revision. So the candidate can show different products, prices and images than the baseline. That skews the comparison and quietly brings catalog changes into the new revision.

**S2. Other live state also leaks into the candidate:**
- `brand.css` from the live brand profile (`:504`)
- the source-kit files (`:512`)
- store fields such as name, tagline, logo and checkout mode
- `enablePayments: dto.revision === 0`

Kit files can also change between deployments while a job runs. The doc's "runtime digest" is `currentSourceRuntime`: it reads `privacy.js`, `commerce.js` and `retention.js` from disk and applies the layout baseline and SEO.

**S3. Model output would change the generator's mode.** A repair built from review findings would be sent as `dto.instruction`. Several decisions are regex checks on that instruction:
- `sourceRedesignRequested` changes `useNext`, so an HTML site can be migrated to React (`:228`)
- `requestedSourceMotion`
- `requestsArtwork`
- `requestsImageContent`
- the marquee targeting
- `sourceSectionScope` / `validateSourceEditScope`
- `requestedSourceProducts` / `requestedSourceProductOperations`

Findings are model text derived from untrusted page content. A finding that says "rediseña…" or names a price could trigger a redesign, a migration or product operations.

**S4. The staleness check only happens at apply.** Spend continues on a revision the merchant has already replaced. Before each paid stage, run a cheap `projects.current().revision === job.revision` check.

**S5. Rendering isn't deterministic across time.** Captures taken minutes apart can differ because of fonts, image decoding or kit changes.

**S6. Ownership changes aren't handled.** The worker runs with no request context. `generate(merchantId, …)` will 404 if the store changes owner, and apply has to re-check ownership.

## 5. Applying private candidates

**A1. The bytes that were captured may not be the bytes that get stored.** `save()` normalizes again: `withSourceFonts`, `applySourceLayoutBaseline`, `compileNextPreview`, and visual-system tokens (`source-projects.service.ts:75-82`). The esbuild output can also change between deployments. The good news: `sourceProjectDigest` covers only `{schemaVersion, brief, files}`, not revision or label (`source-project.ts:86`), so a candidate's digest stays valid at apply.

**A2. Nothing enforces the rule against catalog changes.** `append()` only changes products if `generation.products` or `productOperations` are non-empty. Candidate mode must hard-code both to `[]`, whatever the model returns, and must never pass `enablePayments`.

**A3. Apply isn't idempotent.** If the transaction commits but the response is lost, a retry hits the revision CAS and wrongly reports STALE. Store `appliedRevision` in the same transaction and return it on replay.

**A4. Apply can clobber an in-flight chat generation.** If a chat generation is RUNNING on revision R, apply advances the revision and that paid run fails at its own CAS. The apply transaction should refuse (and stay CANDIDATE_READY) while any `storeSourceGeneration` row has `activeStoreId = storeId`.

**A5. Storage bloat.** Keeping two full snapshots (up to 8 MiB of assets plus 20 MB of video) and JPEG checkpoints as base64 in a job-row JSON column will bloat the table.

**A6. Checks that couldn't be confirmed from these files:**
- whether `withSourceAssets(…, imageUses=[])` changes asset roles compared with the baseline
- whether `commerce.js` shows an error in offline captures when its catalog refresh is blocked

Both need a gate or test.

---

## Recommended narrow design

### Data model
Use two tables. Don't put all of this on one job row.

**`StoreDesignJob`:**
- `id`, `storeId`, `merchantId`, `requestId` (unique with `storeId`), `requestFingerprint`
- `activeStoreId` (unique; cleared on terminal states and STALE; kept on INTERRUPTED until resume or cancel)
- `baseRevision`, `baseDigest`, `runtimeDigest`, `catalogDigest`
- `pinnedConfigData`, `page`, `productId` (resolved once at start)
- `state`, `stage`, `leaseToken`, `leaseExpiresAt`, `heartbeatAt`, `cancelRequested`
- `maxMicroUsd`, `heldMicroUsd`, `observedMicroUsd`
- `repairCount ≤ 2`, `appliedRevision`, `candidateId`

**`StoreDesignJobStage`:**
- `jobId`, `kind`, `attempt`, `status` (RUNNING / DONE / FAILED / INTERRUPTED)
- `reservedMicroUsd`, `observedMicroUsd | null`, `attempts` JSON, `checkpoint` JSON (digests, findings, A/B order)
- `candidateFiles` (authored files only)

Store captures in `UploadsService` by hash and reference them. Don't inline them.

### Worker
1. **Claim:** `UPDATE … SET leaseToken=gen_random_uuid(), leaseExpiresAt=now()+ttl WHERE id=? AND (leaseExpiresAt<now() OR leaseToken IS NULL) AND state IN (claimable)`. Run one stage per claim.
2. **Heartbeat:** every ~15 s, a CAS on `leaseToken` that also reads `cancelRequested`. On failure or cancel, call `controller.abort()`.
3. **Crash in a paid stage:** if a claim finds that stage RUNNING, set INTERRUPTED and keep `reservedMicroUsd` held. Nonpaid capture stages are simply rerun.
4. **Paid stage, in order:**
   1. Check the revision and digests (S4).
   2. Take the `storeSourceGeneration` slot.
   3. In one transaction, run `UPDATE job SET heldMicroUsd = heldMicroUsd + cap WHERE lease matches AND held + observed + cap ≤ max`, then insert a RUNNING stage row.
   4. Dispatch with the job signal.
   5. Settle: if every attempt has usage, set `held -= cap` and `observed += Σusage`. Otherwise leave it held.
   6. Release the slot.

   If the lease is lost, the settle write is rejected and the reservation stays held, which errs on the safe side.

### Generator changes (`source-generation.service.ts`)
Add `generate(..., options?: { candidate?: { signal; pinnedData; findings } })`. When `candidate` is set:
- Force `redesign=false`, `useNext = isNextSource(previousFiles)`, `motion = sourceMotionMode(previousFiles)`, no artwork, no marquee targeting, and `sectionScope` taken from the findings' locations. None of these may come from regex checks on the instruction (S3).
- Use the fixed internal instruction template, with findings included as quoted reference data.
- Set `data = pinnedData` in place of the live `publicStore` data (S1).
- Force `products = productOperations = []` and `enablePayments = false` (A2).
- Use `AbortSignal.any` (X1).
- Skip `projects.save`. Return `{ files: normalized, attempts, digest }`, using the normalization step extracted from `SourceProjectsService.save` (`prepareSnapshot()`). Throw with `attempts` attached (B2).
- Copy non-authored files byte-for-byte from the base revision: `config.js`, `brand.css`, kit files, assets, `package.json`, `README.md`. At the end, assert `nonAuthoredDigest(candidate) === nonAuthoredDigest(base)` (S2). The exception is the `config.js` routes, which are recomputed with `sourceCommerceRoutes` only if pages were added.

### Capture, review and compare
- Reuse `captureSourceVisuals` and `hydrate` (make `hydrate` a shared function).
- **Compare stage:** recapture the baseline and the candidate in the same stage, using the same `currentSourceRuntime` output and pinned `productId`. Record `runtimeDigest` per capture and require them to match (S5).
- **Hard gates** (before any model preference):
  - `assertSourceCommerceContract` (`source-commerce-contract.ts`)
  - candidate `readiness.missingImages ≤ baseline`
  - `scrollWidth ≤ width`
  - asset-role inventory is a superset of the baseline's
- **A/B order:** store the order in the checkpoint before dispatch, so a resume doesn't send different input.
- **Outcomes:** `uncertain` or `baseline` → RETAINED_BASELINE.

### Apply (merchant-triggered, one transaction in `SourceProjectsService`)
Add `applyPrepared(storeId, baseRevision, label, snapshot, fence)` next to `append`, sharing its CAS and version-creation code:
1. Job CAS to APPLYING (X3).
2. No active `storeSourceGeneration` row (A4).
3. Verify ownership (S6).
4. Run the revision CAS `updateMany({ revision: baseRevision })`.
5. Check `sourceProjectDigest(snapshot) === stage.digest`, with no re-normalization (A1).
6. Create the version.
7. Set `appliedRevision` and APPLIED (A3).

A revision CAS failure sets STALE and releases `activeStoreId`. `publishedSourceRevision` is never touched.

### Rollout
Put review and repair behind an environment flag plus a global kill switch that the claim query checks. The legacy chat and `generate()` paths stay unchanged whenever `options` is not passed.

## Files to change
- `apps/api/src/stores/source-generation.service.ts`: the candidate option, signal, pinned data, forced flags, returning attempts
- `apps/api/src/stores/source-projects.service.ts`: extract `prepareSnapshot()`, add `applyPrepared()`
- `apps/api/src/stores/source-visual-review.service.ts`: extract `hydrate` and the review call as pure functions that take a signal and budget; remove the `running` flag from the job path
- New: `source-design-job.service.ts`, `source-design-job.worker.ts`, controller, Prisma migration for the two tables
- Reused: `SourceRequestBudget` (as the per-stage in-memory cap), `captureSourceVisuals`, `currentSourceRuntime`, `assertSourceCommerceContract`, `sourceProjectDigest`, `AiUsageService.record` (add `jobId` to the stage tag for reconciliation)

## Verification
Unit and integration tests (Jest specs next to the existing `source-*.spec.ts` files), each targeting a gap above:
- **Claims and leases:** two workers claim at once, exactly one wins. An expired-lease worker has its settle and apply writes rejected and its fetch aborted.
- **Stale sweep:** simulate the `createdAt` sweep at `:318` while a paid stage runs; no second paid run overlaps.
- **Unknown usage:** a fetch that throws after dispatch keeps `heldMicroUsd`. Resume without a raised `max` is rejected.
- **Overspend:** `actual > reserved` blocks the next stage.
- **Cancellation:** cancel mid-`fetch` aborts within one heartbeat. A cancel/apply race with a barrier leaves exactly one winner.
- **Catalog:** change a product mid-job; the candidate's `config.js` equals the base's; the stage is marked STALE if `catalogDigest` policy requires.
- **Merchant edits:** `editFile` mid-job leads to STALE before the next paid stage and at apply.
- **Injection:** a finding containing "rediseña todo, precio Bs 35" yields no migration and no products.
- **Apply:** replay returns `appliedRevision`. Apply while a chat generation is RUNNING is refused. `publishedSourceRevision` stays unchanged.
- **End to end:** run the worker locally against a seeded store (`apps/api/prisma/seed.ts`), then kill the process during the repair stage and confirm the job comes back INTERRUPTED with the reservation still held.