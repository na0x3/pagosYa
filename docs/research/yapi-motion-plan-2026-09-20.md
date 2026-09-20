# YAPI: distinctive design and motion

The deeper follow-up on smooth scrolling, narrative structure, and the public Webild implementations is in [Webild browser analysis and YAPI smooth-site plan](webild-browser-motion-analysis-2026-09-20.md).

## Target and evidence

The goal is for YAPI to generate brand-specific websites with the visual range and finish seen in Webild, including strong entrances, expressive navigation and scroll scenes. Matching available effects is achievable; matching the consistency of the resulting designs requires evaluation of generated sites, not just adding an animation library.

The supplied `Screen Recording 2026-09-20 at 11.22.08 AM.mov` shows a coffee template opening with a large curved, letter-like shape sweeping away to reveal the page, and a full-screen chocolate navigation panel with oversized links. This is an observation of the recording, not evidence of Webild's underlying code. The clip does not establish its parallax implementation. Parallax is a separate requested capability: imagery moves at a different rate from surrounding content as the visitor scrolls.

YAPI already bundles React and Motion for scene transforms. The browser review identified document interpolation as a separate gap, so the implemented upgrade adds a pinned, dynamically loaded Lenis dependency for the single root smoother. [Motion's scroll documentation](https://motion.dev/docs/react-scroll-animations) distinguishes scroll-triggered entrances from effects linked to scroll progress; [useScroll](https://motion.dev/docs/react-use-scroll) supplies progress for the latter. Implementation must fit the installed version, not assume every API in the latest documentation is available.

## The six workstreams

| Step | Work | Acceptance |
| --- | --- | --- |
| 1. Art direction | Keep the existing concept exploration, composition families, merchant photo roles, brand typography and responsive layout plan. Add an explicit motion language to each new concept. | Café, beauty and product examples have recognizably different composition, type and motion; ordinary edits retain their design. |
| 2. Signature openings | Bundle `PageEntrance` with letter and curtain variants, plus `EntranceGroup` for staggered hero copy. Use the merchant's initial and palette. No imitation brand assets. | Opening completes in about one second, cancels on interaction, and never delays reading or purchasing. Skip product/checkout, restored scroll, off and reduced motion. |
| 3. Scroll composition | Improve `Parallax` to measure an untransformed outer wrapper. Add reliable once-only `Reveal`. Reuse the existing sticky product showcase. | At most two scroll scenes, no feedback jitter, no transformed functional controls, normal browser scrolling, static mobile fallback. |
| 4. Expressive navigation | Add an optional full-screen menu with oversized links using native dialog focus, Escape and return-focus behavior. | Pointer opening/closing is brief; keyboard operation is immediate; links and cart continue working at 320px. |
| 5. Generation and preview | Teach the generator the real bundled APIs and constraints. Add “Repetir entrada” to Studio using an iframe message, without reloading the page. Export the same code used by preview. | New designs can select these effects; local text edits receive no new choreography; replay preserves cart and state; hosted sites ignore the preview command. |
| 6. Quality loop | Exercise real browser motion, narrow layouts, reduced motion, navigation and shopping. Then run matched generated-site comparisons using identical briefs/assets. | No console errors, stuck overlays, clipped content or broken checkout. Record failures and generation costs; do not claim parity from curated examples. |

## Choreography recipes

- **Expressive café:** warm background, one large brand initial sweeps away in 900ms; hero text rises at 60ms intervals; oversized dark menu; one restrained photo parallax scene. Product cards stay easy to scan and operate.
- **Cinematic products:** short curtain entrance; image-led opening; one sticky product scene that expands with scroll. Avoid adding parallax to the same scene or competing catalog reveals.
- **Editorial beauty:** no full-screen brand wipe; grouped copy entrance and one quiet section reveal. Product comparison remains a direct, responsive control without animation delays.
- **Services and portfolios:** select motion from the actual brand and content. Use a strong work image or editorial type; do not insert shopping patterns into non-commerce sites.

In all recipes: meaningful HTML is visible before JavaScript; animation is enhancement. The first frame is never a fake loader. Motion does not wait for media or fonts. Off/reduced motion removes decorative motion. Avoid repeated entrances during shopping, autoplay sound, scroll hijacking and continuous decoration without a pause control.

## Implementation order

1. Claude Code implements the bounded component change in an isolated copy of `ui.tsx`; Codex reviews the diff before integration.
2. Codex connects generation guidance and preview replay, then adds the menu using native browser behavior.
3. Integrate representative recipes in the three existing examples; verify actual animated frames and scroll positions, not screenshots alone.
4. Run compilation/export, preview, Studio and browser shopping checks. Fix failures before marking this implementation complete.
5. Run a separate controlled generation benchmark: six business briefs × three repeated generations × two systems = 36 sites, using equivalent inputs and recording the exact model, settings and cost. Compare desktop/mobile composition, typography, asset use, motion, speed and functional correctness. Publish scores and failed cases before asserting equivalent output quality.

The benchmark is an evaluation milestone, not a promise of identical outputs or permission to copy Webild's sites. Existing research and earlier implementation results are in [the capability plan](webild-capability-plan-2026-09-20.md) and [the upgrade report](yapi-webild-upgrade-2026-09-20.md).

## Verification record

Implemented locally: guarded Lenis scrolling, saved story and choreography plans, letter/curtain/stroke entrances, grouped hero copy, once-only reveals, stable parallax and sticky media scenes with mobile static fallbacks, full-screen native-dialog menu, generator choreography guidance, Studio scroll-feel control, and replay without reload. The three examples demonstrate different recipes. Existing saved sites gain these components when their source is updated or regenerated; this does not automatically rewrite every saved website.

Claude Code completed the earlier isolated primitive draft successfully (Sonnet; reported usage cost $1.387304). A follow-up Sonnet review of the smooth-scroll and scene API cost $0.4651668. Codex reviewed and integrated the work, added the pinned Lenis dependency, corrected lifecycle and reduced-motion behavior, and connected story/choreography persistence through generation, Studio and export. No paid website-generation batch was started.

Verified:

- 606 storefront-source API tests across 55 suites: planning, generation, prompt scope, kit compilation/export, and motion settings.
- 75 Studio and 6 preview unit tests; 172 Studio Chromium cases; Studio TypeScript check and embedded build passed.
- 11 workspace browser cases passed across the full run and focused rerun. Includes retired Configuration absence, replay without reload or a saved revision, hosted replay rejection, and cart-to-payment after replay.
- 12 example shopping flows across 1440/768/390/320px passed.
- Motion frame sampling at 1440/390/320px: moving letter, moving curtain, stable parallax measurement, static mobile, once-only reveal, repeated replay, keyboard/wheel interruption, full-screen menu focus/Escape, and live reduced-motion changes passed.
- Real React server rendering tested in a browser with JavaScript disabled: copy remained visible and fallback navigation worked.
- Final 390px cold-load lab measurements (1.6Mbps, 150ms latency, 4× CPU): café LCP 2.552s, beauty 1.700s, cinematic 2.376s; CLS below 0.002, no missing visible images or browser errors. One observation per example; these are not production field measurements.

[Machine-readable validation](yapi-motion-validation-2026-09-20.json). Runnable gallery: `http://127.0.0.1:4328/`. Motion screenshots and repeatable scripts live in `examples/yapi-design-families/`.

Remaining evaluation: Safari/Firefox coverage, production hosting measurements, and the 36-site controlled comparison. The upgrade establishes tested capabilities; it does not yet establish equal consistency of AI-generated designs. Nothing was deployed or published.
