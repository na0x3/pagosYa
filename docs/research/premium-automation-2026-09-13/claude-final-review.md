I found 9 correctness issues that still need fixing. I only read code and edited nothing. I didn't look at the spec files, so I can't say whether the mocked-inference tests are labeled.

### 1. The published revision contains the screenshot-only copy of the site
- **Where:** `source-design-job.worker.ts:59-71`, `:87`; `source-generation.service.ts:216`, `:549`; `source-visual-review.service.ts:46-61`
- **Problem:** `hydrate()` copies upload images into `assets/review-*` files and rewrites every text file to point at them, including `config.js`. That copy is saved as the `baseline`, and the repair uses it as the previous snapshot. The candidate's non-editable files, including `config.js`, come from it, and `applyPrepared` publishes it. So the new revision ships up to 8 MB of review images, a catalog frozen to review paths, and the `catalog()` data shape. That shape keeps relative `/v1/uploads` links, unlike the full URLs a normal save writes. The review images also count toward the 6 MB image limit and fill vision slots during the repair (`source-generation.service.ts:220-233`).
- **Fix:** Build and store an unhydrated baseline and candidate, with `config.js` made the same way a normal save makes it. Hydrate only a temporary copy inside capture and probe. Compute `candidateDigest` from the unhydrated candidate.

### 2. A failed repair can't be retried, or silently uses up the next repair
- **Where:** `source-design-jobs.service.ts:149-157`, `:45`; worker `:91`, `:94`
- **Problem:** `reserve()` saves the higher `repairs` count before the model is even called. If REPAIR then fails or is interrupted, `resumeAvailable` checks `job.repairs < maxRepairs`, which is `1 < 1`, so the job is dead with its reservation kept. With `maxRepairs=2`, resuming skips to repair 2.
- **Fix:** Store the repair index only on the receipt when reserving. Increment `repairs` only in the `next(job,'CAPTURE_CANDIDATE', …)` update. Build the artifact key from that saved value.

### 3. The shopping check rejects healthy stores, after credits are already spent
- **Where:** worker `:111-112`
- **Problem:** `status !== 'passed'` treats `unsupported` and `unavailable` as failures. A store is always rejected after paying for review and repair if any of its first 3 products has extras or no stock, or if it has no product or checkout route.
- **Fix:** Reject only on `failed`, and require at least one `passed`. Also probe the baseline in an unpaid stage before REVIEW_BASELINE, so stores that can't pass are rejected before any money is spent.

### 4. Temporary conflicts end the job for good as STALE
- **Where:** worker `:51-55`, `:128-142`; `source-generation.service.ts:333`; `source-projects.service.ts:235-240`
- **Problem:** Three temporary conflicts all become `ConflictException`, which the worker marks STALE. STALE can't be resumed.
  - A chat generation can start between the worker's slot check and `storeSourceGeneration.create` (duplicate-key error).
  - The Serializable APPLY transaction can fail (`P2034`) because of the worker's own heartbeat updating the job row, or a stock update on a product the transaction locked.
- **Fix:** Throw a distinct retryable error for these cases, re-queue the same stage, and settle the receipt at 0. For APPLY, stop the heartbeat first or retry on `P2034`.

### 5. Failures before any model call are recorded as unknown cost
- **Where:** worker `:17`, `:87`; `source-generation.service.ts:352`, `:387-392`, `:559`
- **Problem:** If `generate` throws inside its `try` before the first request is sent, `onAttempts([])` runs. `knownDesignSpend([])` then returns `null`. This happens on a revision re-check or a budget reservation error. The receipt becomes `unknown`, keeps its reservation, and uses up a retry slot even though nothing was sent.
- **Fix:** Return `0` when there are no attempts, or track a `dispatched` flag set by `onDispatch`.

### 6. The freshness check misses data the catalog embeds
- **Where:** `source-design-jobs.service.ts:29-37` compared with `source-generation.service.ts:111-119`
- **Problem:** `catalog()` embeds `storeRetention.settings` and `locations`, plus anything else `getStorePublic` reads from other tables. `contextDigest` doesn't cover them, so an out-of-date `config.js` can pass APPLY.
- **Fix:** Add those tables to `contextDigest`, using `updatedAt` or a digest of their rows, and check them again inside the APPLY transaction.

### 7. One waiting job blocks all other stores' jobs
- **Where:** worker `:51-53`, `:128`; service `:116`
- **Problem:** A job waiting on a chat generation is re-queued with no delay. `claim()` always takes the oldest queued job, so every instance re-claims that same job every 3 s and other stores' jobs never run.
- **Fix:** Add an `availableAt` column, set a delay when waiting, and have claim filter and order by it.

### 8. Some capture failures offer a retry that can never work
- **Where:** worker `:69`; `hydrate` caps at `source-visual-review.service.ts:48-56`
- **Problem:** `hydrate` only inlines up to 48 image URLs and 8 MB, and only images that have a matching upload record. Pages with other visible images always fail CAPTURE_BASELINE, yet `resumeAvailable` stays true.
- **Fix:** Mark these as a non-resumable status, or hydrate only the images on the page being captured.

### 9. UI polling (`merchant-studio/src/source-design-jobs.ts`)
- **`:45-52`:** Nothing guards the order of poll responses, and `execute` starts a poll while one may already be running. An older response can overwrite newer state and stop polling. **Fix:** add a request counter and ignore stale responses.
- **`:47-49`:** `error` is never cleared after a successful poll. **Fix:** clear it on success.
- **`:50`:** The reload check compares against the revision being viewed and ignores `options.historical`. After a page refresh, viewing an older revision forces `saved()`. `notified` is also set before `saved()` runs, so if it throws it never retries. **Fix:** skip when `historical`, compare against the current project revision, and set `notified` only after `saved()` succeeds.