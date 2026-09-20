# Webild browser analysis and YAPI smooth-site plan

Research date: September 20, 2026. Browser-reviewed public templates: [Coffee Shop](https://webild-components-version-4.vercel.app/components/templates/coffee-shop), [Product Showcase](https://webild-components-version-4.vercel.app/components/templates/product-showcase), and [Luxury Real Estate](https://webild-components-version-4.vercel.app/components/templates/luxury-real-estate). User references: `Screenshot 2026-09-20 at 12.02.04 PM.png` and `Screenshot 2026-09-20 at 12.06.07 PM.png`.

This document distinguishes observed behavior, evidence in the public production bundles, and recommendations for YAPI. It does not claim access to Webild's generator, prompts, training data, private component source, or typical generation success rate.

**Implementation status:** Milestones A–D below are now implemented locally. YAPI has one guarded Lenis root, saved story/choreography plans, the scene vocabulary, Studio scroll-feel controls, and matching preview/export behavior. Milestone E remains a paid, two-arm generation and human-review release gate; see [the implementation record](yapi-webild-motion-implementation-2026-09-20.md).

## YAPI's lens

YAPI is an AI website builder inside pagosYa for merchants creating shops, service sites, portfolios, and editorial sites. Its target user is a business owner who cannot be expected to direct typography, narrative structure, animation, and commerce implementation independently. Its differentiator should be expressive art direction combined with working local commerce, truthful business data, simple editing, and safe publishing. The central product tension is therefore **visual memorability × operational reliability**.

Webild is an aspirational visual and interaction reference. It is not the right functional template to copy wholesale: its public coffee example has no visible prices or purchase controls, while YAPI must preserve real catalog, cart, product, variant, and checkout behavior.

## What creates the smooth feeling

The smoothness is a stack of coordinated systems, not a single parallax effect.

| Layer | Observed behavior | Public bundle evidence | YAPI today |
| --- | --- | --- | --- |
| Input smoothing | Wheel gestures continue with a soft, damped tail instead of stopping on the browser's raw wheel delta. | Each inspected template imports `lenis-react` and mounts a root Lenis wrapper. It uses the library defaults; Lenis documents `smoothWheel: true` and `lerp: 0.1` as defaults. | One dynamically loaded Lenis root now supplies `soft` and `cinematic` desktop-wheel presets; native, reduced-motion, mobile/touch, cart, dialog, product and checkout paths bypass it. |
| Continuous scroll progress | Media and text respond every frame to the visitor's position. | The templates import Motion `useScroll` and `useTransform`. | Present in `ProductShowcase`, `FloatingMedia`, `ScrollScale`, and `Parallax`. |
| Sticky scenes | A section stays fixed while its media changes, creating a directed sequence rather than a list of blocks. | Luxury Real Estate uses a `300vh` wrapper with a `sticky top-0` hero. Product Showcase uses full-screen media with linked scale and vertical movement. | `ProductShowcase` and `ScrollScrubHero` expose bounded sticky scenes with static mobile and reduced-motion fallbacks. |
| Smoothed scrub | The animation playhead catches up gradually with scroll, avoiding jerky one-to-one jumps. | Coffee imports GSAP and ScrollTrigger. GSAP documents numeric `scrub` as a catch-up duration for the animation. | Motion values are mapped directly. There is no shared spring/scrub policy. |
| One-time entrances | Labels, titles, supporting copy, buttons, and cards arrive as one short sequence. | Motion components plus Webild `ScrollReveal` and `TextAnimation` chunks. | `EntranceGroup`, `Reveal`, letter, curtain and signature-stroke entrances are selected through saved choreography. |
| Narrative continuity | Each transition reveals the next idea at the moment the visitor is ready for it. | Visible in all three templates and in their heading hierarchy. | The planner now commits the promise, opening copy, primary action, ordered section beats, media roles and up to two scenes before JSX generation. |

Webild's public code confirms the important distinction:

- **Lenis smooths the document movement.** Its root wrapper is the persistent “glide” the user feels.
- **Motion maps progress into transforms.** In Product Showcase, overlapping about images travel in opposite directions (`120px → -120px` and `-60px → 60px`) while a background image scales (`1 → 1.15`). The hero media moves `0px → 150px` and scales `1 → 1.1`.
- **GSAP handles special timelines.** Coffee uses DrawSVG for the large organic opening stroke and ScrollTrigger for its desktop cursor-image trail.
- **Sticky duration creates cinematic storytelling.** Luxury Real Estate pins a full-screen hero inside a `300vh` wrapper (three viewport heights) and maps progress to a canvas frame sequence.

YAPI should reproduce these capabilities with its own visual language and merchant assets. It does not need to reproduce Webild's exact code or add three overlapping animation systems.

## Why the text and structure feel coherent

The screenshots are effective before animation is considered. The coffee opening has one memorable wordmark-like headline, a 22–28 word positioning paragraph, two actions, and one strong media reveal. Its full-screen menu contains only two oversized destinations. It does not ask the visitor to interpret a dense navigation hierarchy.

Across the three templates, sections consistently use this grammar:

1. **Context label:** two to five words such as “About,” “Collection,” or “Properties.”
2. **Single thought:** a short headline with one visual emphasis, often a serif/sans or roman/italic contrast.
3. **Evidence sentence:** one concise paragraph that explains the section's value.
4. **One primary action:** occasionally one quieter secondary link.
5. **Media proof:** imagery depicts the exact idea stated in the copy.

The page order also follows a deliberate argument:

- Coffee: identity → atmosphere → playful interaction → menu → services/events → contact.
- Product: product promise → cultural/product story → collection → social proof → questions.
- Real estate: aspiration → positioning statement → properties → inquiry.

YAPI's Bruma example already has a strong opening, but the current generator contract describes components and effects more precisely than it describes the page's argument. A model can therefore select individually attractive sections without building a coherent sequence.

## Patterns worth adopting

### 1. Smooth document scroll

Add one trusted `SmoothScroll` root to the React storefront kit. Use the already resolved `lenis` package as an explicit dependency rather than a CDN script. The first preset should stay close to the observed production behavior: desktop wheel smoothing with `lerp` around `0.1–0.14`, normal vertical orientation, no infinite scrolling, and no synthetic touch inertia.

Expose a design token rather than a component the generator can scatter through the tree:

```ts
scrollFeel: 'native' | 'soft' | 'cinematic'
```

- `native`: browser behavior; mandatory for motion off and reduced motion.
- `soft`: light desktop wheel interpolation for most expressive stores.
- `cinematic`: slightly longer catch-up for one carefully selected portfolio or image-led site.

Native touch, keyboard, Page Up/Down, Home/End, browser history restoration, and focus navigation remain authoritative. Cart, product, checkout, dialogs, form controls, carousels, and any nested scroller use a prevention attribute so the root smoother never consumes their wheel or touch input. Stop the smoother while a modal owns the viewport. Anchor links must account for the sticky header and move focus to their destination.

### 2. A saved story architecture before JSX

Extend the design exploration result with a persistent `story` object, selected before layout code is generated:

```ts
story: {
  promise: string;
  audienceNeed: string;
  proofOrder: Array<'experience' | 'catalog' | 'process' | 'results' | 'trust'>;
  primaryAction: string;
  sections: Array<{
    id: string;
    role: 'opening' | 'proof' | 'offer' | 'difference' | 'trust' | 'action';
    eyebrow?: string;
    headline: string;
    support?: string;
    imageRole?: string;
    action?: string;
  }>;
}
```

Generation rules:

- Eyebrow: 2–5 words.
- Display headline: normally 3–9 words and one idea.
- Support: normally one sentence, at most two, with a readable line length.
- One primary action per section; the opening may include one quieter secondary action.
- Adjacent sections cannot repeat the same claim or heading structure.
- Every media-led section names the approved image/video role that proves its copy.
- A catalog is an offer/proof section, not a substitute for the opening promise.
- Commerce controls and factual product data stay platform-owned.

Validate these relationships before calling the code-generation model. This is more reliable than asking the final model to invent strategy, copy hierarchy, layout, and animation simultaneously.

### 3. A small scene vocabulary

Add composable, tested scenes to `@pagosya/ui`:

| Scene | Purpose | Motion contract |
| --- | --- | --- |
| `ScrollScrubHero` | Cinematic opening for an approved video or frame sequence. | Sticky 180–260vh wrapper; text stays readable; media progress follows scroll; poster/static fallback. |
| `ParallaxStack` | Two or three related images that establish context. | Stable outer measurement; layers move in opposite bounded ranges; optional scale up to 1.12; static on small screens by default. |
| `TextFillStatement` | One positioning sentence between major chapters. | Words/color fill with scroll progress; no opacity below a readable floor; plain text fallback. |
| `SectionSequence` | Label, headline, support, action, and media enter as one unit. | 40–80ms stagger, under 900ms total, runs once. |
| `SignatureStrokeEntrance` | Brand-specific coffee/creative opening. | One supplied or generated-safe SVG path draws/sweeps away in under 1.2s; never a fake loader. |
| `ProductRail` | Product discovery when a horizontal rhythm fits. | Native horizontal overflow and controls; vertical page scroll is never captured; live prices/actions remain visible. |
| `FullscreenMenu` | A small set of large destinations. | Existing native-dialog menu; at most 3–5 primary destinations; immediate keyboard response. |

Continue using Motion for transforms and progress mapping. Use a small local canvas helper for frame scrubbing. GSAP is unnecessary for the first implementation: SVG stroke drawing can use `stroke-dasharray`/WAAPI, and Motion already supplies scroll values. Add GSAP only if a measured scene cannot be expressed reliably without it.

### 4. A persistent choreography manifest

Replace the current prose-only motion suggestion with saved, typed decisions:

```ts
motion: {
  mode: 'off' | 'subtle' | 'expressive';
  scrollFeel: 'native' | 'soft' | 'cinematic';
  entrance?: { kind: 'stroke' | 'letter' | 'curtain'; mark?: string };
  scenes: Array<{
    sectionId: string;
    kind: 'sequence' | 'parallax-stack' | 'text-fill' | 'scrub-media';
    intensity: 1 | 2 | 3;
    desktopOnly?: boolean;
  }>;
}
```

The planner chooses this once from the brand, story, assets, and site purpose. The generator implements the manifest instead of independently adding attractive effects. A normal text, product, or image edit preserves it byte-for-byte. An explicit motion request may update it. A redesign may replace it.

Composition rules:

- One dominant scroll-linked scene per page.
- At most one secondary parallax/text-fill scene.
- Entrances and hover effects do not count as another story scene, but must remain brief.
- Do not combine smoothing, pinning, parallax, scale, blur, and text fill on the same element.
- Checkout, cart, product variants, inputs, navigation, and price controls never receive scroll-linked transforms.

### 5. Asset and performance strategy

Do not copy the Luxury Real Estate implementation literally. Its public bundle loads a hidden video, seeks every frame at 24fps, converts the frames to `ImageBitmap`s, and keeps them in memory before removing a full-screen loading overlay. It looks smooth after loading but can be expensive on memory, decoding time, and mobile devices.

For YAPI:

- Default to native poster/video parallax, not a frame sequence.
- Permit scrubbed video only with an approved local asset and a generated poster.
- Preprocess selected frame sequences during generation/export; do not extract an entire video in the shopper's browser.
- Cap sequence dimensions, frame count, and encoded bytes; load it only near the viewport.
- Keep the opening HTML and primary image paintable immediately.
- Suspend frame and pointer work while hidden; release bitmaps/listeners on teardown.
- Cursor trails are optional expressive desktop decoration, capped to a small pool and disabled for touch, reduced motion, save-data, and lower-end devices.

Initial release budgets under the existing 390px/1.6Mbps/4× CPU lab profile:

- LCP ≤ 3.0s and no regression above 15% from the matched no-smoothing build.
- CLS < 0.05.
- No long task over 200ms caused by motion initialization.
- Added smooth-scroll runtime ≤ 15KB gzip.
- At least 55 animation frames per second in the sampled desktop scene after assets are ready.
- No missing images, horizontal document overflow, stuck overlay, or intercepted commerce scroll.

### 6. Generator integration

Change the generation pipeline in this order:

1. `source-design-planner.ts`: produce story architecture, asset roles, and motion intent for each concept.
2. `source-composition-registry.ts`: attach compatible story arcs and scene requirements to each family.
3. `source-generation.service.ts`: pass only the selected story and choreography to implementation. Keep both out of unrelated local edits.
4. `source-ui.ts`: document the typed scene APIs, limits, and responsive fallbacks.
5. `packages/storefront-kit/kit/`: add the single root smoother and scene components shared by preview and export.
6. Studio: show `Desplazamiento: Normal / Suave / Cinemático` beside the existing motion mode, plus replay and reduced-motion explanation. Saving the choice must not invoke AI.

Do not allow the final generator to choose arbitrary numeric motion. It selects a recipe and may author visual details inside tested limits.

## Delivery sequence

### Milestone A — Smooth foundation

Implement `SmoothScroll`, modal/nested-scroll exclusions, focus and anchor handling, reduced-motion switching, and real-browser instrumentation. Apply `soft` to the café example only.

**Exit:** wheel motion has a controlled tail; touch/keyboard remain native; cart, product modal, checkout, anchors, refresh restoration, and browser back work at 1440/768/390/320px.

### Milestone B — Story-first planning

Add the typed story plan and validation. Rewrite the three owned examples through the same grammar without changing their verified facts.

**Exit:** reviewers can state each page's promise, proof sequence, and main action from the plan; no adjacent sections repeat claims; long Spanish business names still fit.

### Milestone C — Three flagship scenes

Build `ParallaxStack`, `TextFillStatement`, and `ScrollScrubHero`, then integrate one per matching example. Add `SignatureStrokeEntrance` only to the café family.

**Exit:** each family has a different silhouette and scroll behavior; turning motion off produces a complete static site with the same content order.

### Milestone D — Generator and editor

Persist choreography, expose the APIs to generation, add the Studio scroll-feel control, and preserve plans across local edits and undo.

**Exit:** a title edit changes only the title; a product edit leaves motion untouched; an explicit “make scrolling calmer” request changes the manifest without rebuilding the page.

### Milestone E — Evidence before rollout

Run the existing six-brief × three-repeat × two-arm comparison: current pipeline versus story/choreography pipeline, using identical assets and generation budgets. Capture desktop and mobile opening, one mid-page transition, catalog/service proof, and final action. Record failed generations, costs, latency, functional checks, performance, and anonymized human preference.

**Release gate:** at least 80% of candidates are approved within budget; all accepted sites pass their relevant commercial/contact flow; story coherence and motion smoothness each win a majority of matched human comparisons; no performance or accessibility gate regresses.

## Test matrix

- Chrome, Safari, and Firefox desktop: trackpad and wheel.
- iOS Safari and Android Chrome: native touch, no synthetic inertia by default.
- Keyboard: Tab, Shift+Tab, Page Up/Down, Home/End, Space, anchors, Escape.
- Preferences: motion off, reduced motion changed while scrolling, save-data, background tab, restored scroll position.
- Surfaces: full-screen menu, product dialog, cart drawer, product page, checkout, range slider, horizontal rail, text input, nested policy/modal scroll.
- Failure states: video unavailable, slow image, font fallback, JavaScript disabled, hydration delay, route change during inertia.

The motion harness should dispatch real wheel input and sample `scrollY`, target transforms, frame intervals, and section bounds on every animation frame. Screenshots alone cannot verify smoothness.

## Recommendation

Milestones A–D are complete in the local implementation. Keep the current limits—one dominant scroll scene, one secondary scene, native functional controls—and resist adding more animation systems until generation evidence shows a specific missing capability.

The next decision is Milestone E: compare the previous and story/choreography pipelines with identical briefs, assets and budgets, then review the anonymized results. Ship broadly only if coherence and smoothness win without losing commerce reliability, accessibility, or the performance budget.

## Sources

- Public Webild template pages linked at the top; inspected in Chrome at desktop width.
- Public production bundle loaded by those pages on `webild-components-version-4.vercel.app`, including `lenis-react`, Motion scroll/transform chunks, GSAP/ScrollTrigger, and the three template chunks. Bundle names and implementation details can change and do not describe Webild's private generator.
- [Lenis project documentation](https://github.com/propagande-studio/lenis) for default smooth-wheel and interpolation options.
- [Motion useScroll documentation](https://motion.dev/docs/react-use-scroll) for scroll progress, offsets, and GPU-friendly linked transforms.
- [GSAP ScrollTrigger documentation](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) for pinning and smoothed scrub behavior.
