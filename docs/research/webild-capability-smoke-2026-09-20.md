# YAPI capability smoke — 2026-09-20

This is a bounded smoke test of the production generator with synthetic businesses, not a Webild head-to-head comparison or a completed release gate.

## Allowance and method

The dry run specified six initial requests, one per café, beauty, furniture, service, portfolio and editorial brief; automatic model selection; 50 credits per request; a $3 maximum allowance. Actual estimated provider spend, including failed attempts, was **$0.721469**; the service reported **44 billed credits**. No merchant store, order or payment was created. No paid request was repeated.

The benchmark used the real design planner and source generator, public synthetic catalogs, a disposable browser with external requests blocked, desktop/mobile captures, product navigation and simulated checkout. The beauty case received an existing local synthetic image fixture. The other cases deliberately tested photo-free content. Thus this smoke does not establish the quality of photo-rich generation.

The original script's obsolete shipping-tab assertion incorrectly marked two saved sites failed after their checkout succeeded. A **provider-free recheck** made that tab conditional and restored a cart item before capturing checkout. Original paid receipts and screenshots are preserved separately from recheck evidence.

## Results after the free recheck

| Brief | Generation | Functional checks | Design checks | Qualification |
|---|---|---|---|---|
| Café | Saved | Passed detail links and simulated checkout | Passed measured checks | Visually sparse opening; human quality not approved |
| Beauty | Rejected | No saved candidate | Not available | Two missing image alternatives exhausted the single repair |
| Furniture | Saved | Passed detail links and simulated checkout | Failed mobile opening promise | Responsive and readable, but first purchasable product below viewport |
| Service | Saved | Contact slot and responsive presentation passed | Passed measured checks | Real contact form remains opt-in; booking backend not invented |
| Portfolio | Saved | Contact slot and responsive presentation passed | Passed measured checks | Photo-free brief, no invented clients |
| Editorial | Saved | Contact slot and responsive presentation passed | Passed measured checks | Existing article feed, no invented articles |

Four of six attempts passed the smoke's automated criteria. This is below the proposed 80% initial release threshold, and **human approval has not been completed**. Automated pass does not establish premium visual quality.

## Changes prompted by this evidence

The café showed that older prompts capped headline size at 2.6–3.2 times body, limited display weight to 350–500, required italic text, and disallowed large accent fields. These aesthetic rules now act as defaults with merchant/composition overrides. Photo-free openings explicitly require deliberate hierarchy or compact content instead of an empty 100vh panel. A bounded self-contained kit JSX composition recipe now accompanies the best candidate in first-generation source requests; local edits do not receive it.

The beauty failure showed that validation reported only one missing image alternative at a time. The gate now reports all affected files and lines together so the bounded repair can address the entire candidate. It still rejects missing alternative text.

These late prompt/recipe/diagnostic changes passed targeted tests but **were added after this live process loaded its generator**. They are not validated by these outputs. The original and checker generator digests are recorded per result; do not compare this smoke as if it tested all final code.

## Artifacts and next gate

- [Original paid receipts](../../tmp/webild-capability-smoke-2026-09-20/results.json)
- [Provider-free verification](../../tmp/webild-capability-smoke-2026-09-20/verification.json)
- [Screenshot comparison](../../tmp/webild-capability-smoke-2026-09-20/verification.html)
- [Bounded plan](../../tmp/webild-capability-smoke-2026-09-20/plan.json)

The planned 36-output controlled comparison, image-rich cohort, calibrated human review, mobile performance budgets and full edit-preservation comparison remain incomplete. The three authored example families independently demonstrate richer media capabilities; they must not be counted as live generated successes.

## Reproduction

From the repository root, the bounded dry run is:

```sh
pnpm --filter @pagosya/api exec node --env-file=.env -r ts-node/register scripts/benchmark-source.ts --models auto --cases cafe,beauty,furniture,service,portfolio,editorial --repeats 1 --max-credits 50 --create-only --bounded-smoke --dry-run --out ../../tmp/webild-capability-smoke-2026-09-20
```

Use `--recheck` instead of `--dry-run` to inspect saved outputs without provider calls. A new live run needs a new output directory. `--resume --create-only` skips recorded or dispatched requests; a prior quota/auth halt cannot resume paid work. Missing usage stays unknown rather than being reported as free. Do not pass `--recheck` together with `--resume`.
