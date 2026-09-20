# YAPI website creation upgrade — 2026-09-20

The editor changes and capability upgrades are implemented locally in pagosYa. They expand YAPI's design range; they do not establish generation-quality parity with Webild. The [public research and original plan](webild-capability-plan-2026-09-20.md) separates observed behavior from inference about Webild's private implementation.

## Requested editor changes

- Persistent icon navigation sits against the left edge: 64px on desktop and 48px on mobile. Icons have accessible names and hover titles; the active destination stays visible.
- The retired standalone Configuración page and its navigation entry are removed; store tools remain inside the current editor.
- The uncreated-site canvas uses the supplied mountain photograph and two attributed nature images. Five layered photo/site cards travel through the canvas, following the supplied recording's movement. It includes pause/resume and a static reduced-motion state.
- The conversation, drafts, product management and store switching keep their existing behavior. The nature scene remains explicitly labeled as inspiration rather than a generated merchant site.

## Work across the six areas

| Area | Implemented |
| --- | --- |
| Owned reference designs | Café, beauty and home/textile stores, each using the real shared catalog, product, cart and demo checkout. Runnable gallery and review screenshots in `examples/yapi-design-families`. |
| Better composition planning | Four compatible families; selection considers brief, catalog size and usable image roles. Three distinct candidates, concise JSX recipes for fresh generation, and composition preservation for local edits. Typography and color restrictions are defaults that deliberate directions can override. |
| Richer sections and product pages | Video hero with poster and playback controls, floating imagery, before/after comparison, plus existing showcase/story primitives. New image-led and story-led product layouts reuse platform price, variant, stock and purchase controls. Existing bundled licensed fonts provide expressive, editorial and utilitarian choices. |
| Visual references and editing | Isolated desktop/mobile reference screenshots now reach planning/generation with explicit observation limits. The canvas editor changes literal text, approved existing images, nine focal positions, colors, five bundled typefaces, compatible component variants and section order through revisions; undo protects against overwriting later changes. Custom elements can be passed to scoped AI editing. |
| Quality evidence | Benchmark receipts include failures, cost estimates, generator digests and screenshots. Resume avoids replaying dispatched work; quota/auth errors halt the batch. Reference examples have functional browser checks and a reproducible throttled mobile performance profile. |
| General site purposes | Shop, service, portfolio and editorial choices propagate through conversation, compilation, content pages, export, preview checks and publishing. Noncommerce sites no longer require products or checkout. Existing contact leads and article feed are reused; booking uses supplied integrations. |

## Verification and limits

The merchant workspace's 11 browser tests pass, including compact navigation, animation pause/reduced motion, retained drafts/store switching, purpose forwarding, direct text edit/save/undo and motion replay without a generation. Studio's 75 unit tests, all 172 Studio browser cases and the preview package's six tests pass. The three reference stores pass 12 complete demo purchase journeys across 1440, 768, 390 and 320px. The complete storefront-source API suite passes: **606 tests across 55 suites**, covering composition/story selection, saved choreography, smooth-scroll settings, purpose contracts, compilation/export, visual editing, media fallbacks and reference capture.

The [live generation report](webild-capability-smoke-2026-09-20.md) records actual outcomes separately from authored examples. A functioning example store is not counted as a successful AI generation. The planned controlled 36-output comparison and calibrated human preference review are still outstanding; automatic improvement rollout remains subject to the existing feature flag and evaluation gates.

A [two-case image-rich follow-up](webild-capability-media-smoke-2026-09-20.md) produced stronger visual compositions and exposed a hidden-cart bug plus duplicate, incorrect narrative product prices. The cart runtime fix passes the original saved design at four widths; the price validator catches the original incorrect story. All eight live attempts cost an estimated **$1.06** including failed phases. The reports retain the failures and distinguish later fixes from original generated successes.

The [example performance profile](../../examples/yapi-design-families/PERFORMANCE.md) records cold mobile loading before and after image/loading/transport improvements. Measured LCP changed from 4.13/4.65/6.57 seconds to 2.53/1.59/2.29 seconds for café/beauty/home respectively. These single-run lab results include Brotli delivery in the example server and are not deployed production guarantees.

Reference capture observes fixed screenshots, not verified animation behavior. Complex authenticated or blocked websites can produce incomplete evidence. Direct editing covers safe literal source values; dynamically computed content still needs an AI/source change. Cinematic example media uses a poster fallback because no approved video fixture was supplied. Booking availability/reservation infrastructure was not added.

## Review locally

- pagosYa: http://localhost:4323/
- Build reference gallery: `node examples/yapi-design-families/build.mjs`
- Serve gallery: `node examples/yapi-design-families/server.mjs` → http://127.0.0.1:4328/
- Check example journeys: `node examples/yapi-design-families/verify.mjs`
- Profile cold mobile loading: `node examples/yapi-design-families/profile.mjs`

No merchant website was published, and the example/benchmark purchase flows did not create live charges.
