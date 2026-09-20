# YAPI story and motion implementation — 2026-09-20

YAPI now has the main public capabilities that create the smooth, coherent feel observed in the three Webild references, while retaining pagosYa-owned design language and commerce behavior. The change is local; no merchant site was published.

## What changed

### One scroll owner

`StoreTheme` owns a single dynamically imported Lenis instance. The saved `scrollFeel` setting has three choices:

- `native`: browser scrolling.
- `soft`: restrained desktop-wheel interpolation for most expressive sites.
- `cinematic`: a longer, slower tail for a deliberately selected image-led composition.

Touch, keyboard navigation, focus movement and programmatic scrolling remain native. The smoother does not run for reduced motion, motion-off mode, product or checkout pages, hidden tabs, open dialogs, cart panels, forms, range controls or nested checkout surfaces. It tears down when those conditions change rather than leaving another animation loop alive. Exported Next.js projects pin the same Lenis dependency used in preview.

### Story before components

Each new design concept must now commit a short promise, eyebrow, headline, support line, primary action and one ordered story beat for every planned section. The catalog section must serve an offer or proof role. The same concept chooses its motion mode, scroll feel, entrance and up to two scenes. Planning validation runs before the implementation model receives the selected concept.

Older saved designs stay readable because the new fields are optional when loading historical revisions. Once present, story beats and scene references are pruned when sections are deleted, and the selected plan is copied into the saved visual system. Ordinary text, product and image edits preserve the plan.

### A bounded scene vocabulary

The shared storefront kit now exposes:

- `ParallaxStack` for two or three approved images moving in opposing bounded ranges.
- `TextFillStatement` with a readable opacity floor.
- `ScrollScrubHero` for one sticky native-video or poster scene, with static mobile and reduced-motion behavior.
- `SectionSequence` for a short ordered reveal.
- `SignatureStrokeEntrance` for an owned SVG stroke entrance under 1.2 seconds.
- `ProductRail` as a live, horizontally scrollable catalog treatment.

Existing `ProductShowcase`, `FloatingMedia`, `Reveal`, `EntranceGroup`, full-screen dialog navigation and commerce components remain part of the same vocabulary. Generator guidance limits a page to two scroll effects and keeps prices, variants, cart, checkout, inputs and navigation out of scroll-linked transforms.

### Studio and generation

Studio shows **Desplazamiento: Nativo / Suave / Cinemático** beside the motion selector. Saving either choice creates a normal source revision through the existing motion endpoint and does not invoke a model. The selector is disabled when motion is off. New generation and retry requests carry the setting, and `config.js` persists it for preview, export, undo and later edits.

The composition registry now proposes compatible story roles, a scene and a scroll feel. The generator receives the selected saved story and choreography along with the exact component APIs; it does not invent arbitrary smoothing values. The café, beauty and cinematic-product examples use different silhouettes and motion recipes.

## Browser and performance evidence

The example motion harness uses real wheel input and samples the scroll tail over animation frames. It also checks teardown while a modal is open, restoration after close, no smoothing on product/checkout pages, reduced-motion and motion-off behavior, mobile static fallbacks, entrance replay, menu focus/Escape, and server-rendered content with JavaScript disabled.

The three reference stores pass complete catalog/cart/checkout flows at 1440, 768, 390 and 320px. Their current throttled mobile lab measurements are:

| Example | LCP | CLS |
| --- | ---: | ---: |
| Café | 2.552s | 0.00129 |
| Beauty | 1.700s | 0.00118 |
| Cinematic product | 2.376s | 0.00112 |

There were no missing visible images, horizontal overflow or browser errors. Lenis adds 8,254 gzip bytes, below the 15KB budget. These are repeatable local lab observations, not production field data.

Automated verification completed with 606 storefront-source API tests across 55 suites, 75 Studio unit tests, 172 Studio Chromium cases, 11 embedded merchant-workspace cases and six preview-package tests. API/Studio/preview TypeScript checks and production builds passed. The reference gallery also passed its 12 responsive purchase journeys and dedicated real-wheel motion harness.

## Evaluation gate

The benchmark now has matched `layout` and `story` arms from the same checkout. A bounded smoke began with six briefs per arm and a $1.50 maximum allowance per arm, then stopped when the user reported that provider credits may have run out. The layout arm recorded 6/6 requests with 1 usable output and $0.738355 estimated provider usage. The story arm recorded two completed failures and $0.286552 estimated usage; a third request had already been dispatched when the run stopped, so its charge is unknown. Known completed usage is $1.024907. No further provider calls were made.

The partial run exposed a repair-order defect rather than evidence for either arm: intrinsic-image `alt` failures masked missing commerce hooks until the one repair allowance was exhausted. Validation now reports both classes of failure in the first diagnostic and the stable prompt makes the intrinsic-image requirement explicit. The interrupted result is not a valid arm comparison. Safe resume uses the existing dispatch marker and will not replay the in-flight beauty request.

The complete comparison still requires six briefs × three repeats in both arms, making 36 outputs, followed by anonymized human review. Authored examples and passing tests are not a substitute for that evidence.

Release should still require at least 80% usable outputs within budget, working relevant commerce/contact flows for every accepted output, majority preference for story coherence and motion smoothness, and no accessibility or performance regression.

## Implementation review

Claude Code Sonnet performed a read-only component/API review in parallel for $0.4651668. Its main finding matched the browser evidence: the largest missing capability was one guarded Lenis root, while many proposed scene names already duplicated YAPI primitives. The implementation therefore consolidated existing components and added only the missing wrappers and scenes. Codex integrated the result, reviewed the lifecycle and generator paths, and ran the final verification.

Related evidence: [browser analysis](webild-browser-motion-analysis-2026-09-20.md), [motion plan](yapi-motion-plan-2026-09-20.md), [earlier capability upgrade](yapi-webild-upgrade-2026-09-20.md), and [machine-readable motion results](yapi-motion-validation-2026-09-20.json).
