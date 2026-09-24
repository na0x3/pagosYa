# Supplemental media smoke — 2026-09-20

Two new initial requests tested the updated composition recipe, flexible typography/colour guidance and consolidated image-alt repair diagnostics. Each had a 50-credit cap ($1 combined allowance); no further paid runs followed. Both used the automatic model choice and the existing bounded single repair.

The beauty fixture supplied two local synthetic product scenes (soap and cream). The former furniture case became an explicitly named home-textiles brief with two matching synthetic scenes (blanket and terracotta cushion); this avoids assigning blanket imagery to tables. **This changed asset/content cohort is not a controlled before/after comparison.** Original six-case receipts remain unchanged.

Estimated provider spend, including failed attempts: **$0.334799** (18 reported billed credits). Cumulative across eight initial requests: **$1.056268** (62 billed credits). Both new generations saved after one decorative-icon alt repair. Their source receipts show the repair and its cost rather than counting only successful phases.

## Findings

| Case | Image/layout inspection | Functional checks | Acceptance |
|---|---|---|---|
| Beauty | Coherent image-led editorial design, purposeful type and plum colour field; mobile stacks cleanly | Named visible cart opens by keyboard; generated permanent display:none hides its contents after runtime moves it into the drawer | Not accepted: checkout content inaccessible |
| Home textiles | Deliberate image-led product story and mobile ordering; all supplied scenes used | Detail links, cart keyboard activation and simulated checkout pass | Not accepted: narrative prices show Bs 2.000 / Bs 3.000 while live catalog correctly shows Bs 20,00 / Bs 30,00 |

The beauty run initially hit a benchmark selector error: it chose a hidden navigation cart before the visible icon button. The free recheck now selects a visible cart, confirms its accessible label, opens by keyboard and checks the actual drawer. That revealed a real generated CSS problem: `.runtime-cart-slot{display:none}` also hides the mount inside the drawer.

The home-textiles source hardcodes wrong prices in `components/home.tsx`; automated shopping totals stay correct, but that does not make the conflicting public product claims acceptable. The screenshot inspection therefore overrides the broad automated “usable” classification for release approval. No source artifact was silently repaired and relabelled as a generated success.

Neither result establishes parity with Webild or a completed human approval gate. These richer outputs demonstrate improved visual possibilities and also expose remaining reliability gaps. Any following runtime/validation fix needs separate provider-free verification and must preserve these original artifacts.

## Evidence

- [Paid receipts](../../tmp/webild-capability-media-smoke-2026-09-20/results.json)
- [Free browser recheck](../../tmp/webild-capability-media-smoke-2026-09-20/verification.json)
- [Screenshots](../../tmp/webild-capability-media-smoke-2026-09-20/verification.html)
- [Original six-case report](webild-capability-smoke-2026-09-20.md)

Recheck only, with no provider calls:

```sh
pnpm --filter @pagosya/api exec node --env-file=.env -r ts-node/register scripts/benchmark-source.ts --models auto --cases beauty,furniture --repeats 1 --max-credits 50 --create-only --bounded-smoke --with-media --recheck --out ../../tmp/webild-capability-media-smoke-2026-09-20
```

## Post-smoke price validation

For shop sites, the production source validator now rejects literal currency/numeric prices and direct raw `.amount` interpolation in explicitly named `price`/`precio` slots. Runtime `data-product-field="price"` placeholders and formatted expressions remain allowed; unrelated dates, addresses and dimensions are untouched. Noncommerce service pricing remains valid. This narrow structural guard catches the observed story-price failure; it is not a general proof of all arbitrary JavaScript price logic. The final generation/publishing/purpose regressions pass: 80 tests across four suites.

The original saved furniture source was rejected by this guard without modification. A separate in-memory check removing only the two duplicate narrative prices and linking to the real catalog passed. [Verification receipt](../../tmp/webild-capability-media-smoke-2026-09-20/price-guard-verification.json). No paid request was repeated, and the original candidate remains rejected for source-claim accuracy.

## Post-smoke cart runtime verification

The shared commerce runtime now forces the moved cart mount visible while the drawer owns it, then restores its previous display value, priority and hidden state on close. The original saved beauty files reproduce the invisible checkout with their original runtime. Serving the same files with the updated runtime completes cart opening, closing, reopening and simulated checkout at 1440/768/390/320px without browser errors. [Regression receipt](../../tmp/yapi-cart-drawer-regression.json). The corresponding 43 commerce/contrast tests pass. This verifies the runtime fix without relabeling the original AI output as a successful generation.
