# Source generation: routing, usage and benchmarking

The source editor starts in **Auto · OpenAI** unless a previous model choice is saved in this browser. First-site chat gathers context through two discovery replies. The standalone benchmark calls the generator directly. DeepSeek setup and the current comparison commands are documented in [DEEPSEEK_COMPARISON.md](DEEPSEEK_COMPARISON.md). Source generation composes authored HTML/CSS/JS around the existing catalog, product-detail, cart and checkout runtime; it does not publish a store or initiate a real payment.

## Routing

| Request | Auto route | Reasoning | Output token ceiling |
|---|---|---|---:|
| First site | GPT-5.6 Terra | medium | 12,000 |
| Short, explicit copy/color/font/spacing adjustment | GPT-5.6 Luna | low | 4,000 |
| Existing-site checkout, navigation, redesign or bug request | GPT-5.6 Sol | medium | 10,000 |
| Other edits | GPT-5.6 Terra | medium | 10,000 |

Routing is a deterministic heuristic over the current instruction, excluding prior conversation. It is an initial policy, not a learned quality guarantee. A manual choice stays fixed, including during repair. Existing authored files use exact local patches, preserving unrelated source. New files are allowed for requested functionality.

One repair is attempted when completed provider output fails parsing, source validation or exact-patch application. Auto uses Sol for repair; manual requests use the chosen model. Incomplete output and transient provider failures can also use the one repair allowance; exhausted provider balance and terminal client errors stop without repair. Both attempts share a 240-second timeout. The platform supplies commerce behavior; backend validation checks the source contract and JavaScript syntax, not browser rendering.

## Usage credits

This release implements **usage measurement and request caps**, not prepaid balances, credit purchases or merchant payment billing. One usage credit represents USD 0.01 of modeled standard API usage, rounded up per successful generation. This is a reference unit, not a retail selling price or profit margin.

Rates in `source-generation-policy.ts` were checked on 2026-09-06:

| Model | Input / million tokens | Cached input | Output |
|---|---:|---:|---:|
| Luna | $0.20 | $0.02 | $1.20 |
| Terra | $2.00 | $0.20 | $12.00 |
| Sol | $4.00 | $0.40 | $20.00 |

Official sources: [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol). Recheck before changing the policy or selling credits; Sol pricing is promotional. The request uses standard service tier, no hosted paid tools, and no generated images.

The default cap is 50 credits; accepted limits are integers from 1 through 500. Estimates use source length and image count, so they are approximate. The server reduces the output ceiling to fit the estimated budget and rejects requests with insufficient remaining output capacity. Recorded user credits can never exceed the accepted cap, even if actual provider usage exceeds the estimate. **This is a cap on user usage credits, not a hard guarantee on the provider invoice.** The platform absorbs failed attempts and any excess above the cap. Missing provider usage is recorded as unknown and assigned zero user credits, never fabricated. Provider usage, cached input and output are retained per attempt; reasoning output is already included in total output tokens. OpenAI long-context multipliers are applied above 272,000 input tokens; DeepSeek uses its own rates without these multipliers.

`StoreSourceGeneration` stores content-free usage history. Its unique nullable `activeStoreId` prevents simultaneous provider calls for a store across tabs/processes. Ownership and revision are checked before paid work and revision is checked again after acquiring the slot. Revision persistence and successful credit settlement share one database transaction. Failures keep the previous revision and release the slot with zero credits. Runs older than ten minutes are marked interrupted when another request starts, recovering from process crashes; unknown usage from an interrupted process cannot be reconstructed.

Apply `20260906120000_source_generation_usage` and regenerate Prisma before deploying the API. It has been applied to the local development database. The source route is separate from the older visual-proposal generation path; these credit controls cover source projects only.

## API

All routes require merchant authentication and store ownership:

- `POST /v1/stores/:storeId/source-project/estimate`: `{ revision, instruction, model?, maxCredits?, assetUrls? }`; returns selected model, reason, estimated credits and output ceiling. No provider call or credit consumption.
- `POST .../messages`: accepts the same model/cap fields; legacy quick/build requests still require first-site discovery.
- `POST .../generate`: existing source-generation body plus `model?` and `maxCredits?`; returns the revision and generation receipt.
- `GET .../usage`: available models and the latest 30 generation records, including failed attempts.

## Repeatable benchmark

Use two test loops. The first is cheap and should run on every change; it exercises request interpretation without calling a model or spending credits:

```sh
pnpm test:source-requests
pnpm --filter @pagosya/api test -- --runInBand src/stores/source-request-profile.spec.ts src/stores/source-context.spec.ts src/stores/source-conversation.service.spec.ts
pnpm --filter @pagosya/api exec tsc --noEmit -p tsconfig.json
git diff --check
```

The request gauntlet currently runs 29 short merchant prompts against both new and existing-site contexts, plus uppercase, accentless, repeated-space and typo variants (192 assertions at the current matrix size). It intentionally includes Spanish and English, accents and typos, vague requests, narrow edits, content changes, complete redesigns and explicit negative instructions. A failure means the request was routed to the wrong scope or visual domain before the AI was called. Add every newly discovered phrasing to `apps/api/scripts/source-request-gauntlet.ts` so regressions become permanent tests.

The second loop is the expensive integration test. It uses the real generation service, disposable Chromium and the platform commerce runtime:

From the repository root, with the selected providers’ keys in `apps/api/.env` (`OPENAI_API_KEY` and `DEEPSEEK_API_KEY` for the default matrix):

```sh
pnpm benchmark:source --cases cafe,shop --out ../../tmp/source-benchmark
# More observations; this incurs additional API usage:
pnpm benchmark:source --cases cafe,shop --repeats 3 --out ../../tmp/source-benchmark-repeat
# Recheck saved sites with the current commerce runtime; no model calls:
pnpm benchmark:source --cases cafe,shop --out ../../tmp/source-benchmark --recheck
```

The current defaults are GPT Terra and DeepSeek Flash on one café brief, with 25 credits per request. Both provider keys are required for this default matrix. `--models auto,gpt-5.6-luna` narrows the matrix. Each trial creates a synthetic site and then asks for a title-only edit. Generation uses the production service with in-memory persistence: it does not create merchant stores, change merchant projects, or call real checkout. Generated code runs only inside disposable Chromium contexts; outbound network requests are blocked. Source files, desktop/mobile screenshots, raw usage and reports are saved under the output directory.

Checks cover catalog availability, adding to cart, supported cart-drawer opening, simulated checkout, the requested title edit, horizontal overflow, price/add-button overlap, and uncaught browser errors. A custom navigation pattern that the harness cannot recognize may require a browser review rather than imply a model failure. A passing result does not certify all links, accessibility, visual taste, real inventory or production payment behavior.

Keep the original `results.json`/`REPORT.md`. Rechecks write separate `verification.json`/`VERIFICATION.md`, rechecked source and screenshots, and do not invent original time-to-usable measurements. Compare provider cost including failures and repair attempts, elapsed generation time, and review the screenshots. Do not infer a reliable ranking from a single trial per brief.


## Initial measurements (2026-09-06)

One café and one ceramics-store brief per choice, each followed by a title edit. These are observed generation durations, **not a claim that the first output was immediately usable**:

| Choice | Café first generation | Ceramics first generation | First-generation credits (café / ceramics) |
|---|---:|---:|---:|
| Auto | 28.6 s | 33.0 s | 5 / 6 |
| Luna | 39.1 s | 36.1 s | 1 / 1 |
| Terra | 28.2 s | 35.7 s | 5 / 6 |
| Sol | 71.4 s | 123.7 s | 18 / 15 |

Estimated standard API cost across all 16 generations and edits: **USD 0.6231**, from returned token usage and the rates above. This excludes local compute and is not a merchant price.

Screenshot inspection exposed a price/add-button overlap: the portable runtime forced relative positioning but retained authored absolute offsets. It now resets `inset` as well. The ceramics run exposed a second integration bug: an authored empty checkout slot received fixed-overlay styles before checkout opened. The runtime now adopts/hides that slot and moves it to the body before use. A reported ceramics Auto failure also came from the original harness skipping the generated cart-drawer button; the harness now opens supported drawers as a user would.

Rechecking the **same saved output** with the corrected runtime and browser flow passes all 16 cases (catalog, simulated checkout, title change, desktop/mobile overflow, price/button overlap and no uncaught JS errors). Rechecks made no provider calls; they are recorded separately so these fixes are not misrepresented as original first-pass performance. Visual preference, full accessibility and real payment behavior remain separate review tasks.

Raw artifacts in this local workspace:

- `tmp/source-benchmark-20260906/REPORT.md`, `results.json`, `VERIFICATION.md`, `verification.json`, and per-model source/screenshots.
- `tmp/source-benchmark-shop-20260906/REPORT.md`, `results.json`, `VERIFICATION.md`, `verification.json`, and per-model source/screenshots.

These early observations support keeping Auto as the provisional default and Luna as the low-cost manual choice. More briefs and repeats are required before claiming a stable speed or quality ranking.
