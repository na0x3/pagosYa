# Visual assets and screenshot review

YAPI now exposes **Recursos visuales** and **Revisar diseño** beside the revision/page controls. These extend the existing editor and preserve its visual identity.

## Studio interaction and design contract

This is an **Operate** extension of the existing merchant Studio. The panels inherit Studio's fonts, monochrome surfaces, amber accents and existing color/border tokens. Keep this contract local to the visual tools; it does not establish a new product-wide visual system.

- Toolbar buttons expose the active panel with `aria-expanded` and an inverted surface/text treatment. One panel is open at a time, with a visible heading and **Cerrar** action.
- Panels use a bounded, scrollable surface beside the existing editor controls. Below 600px they use narrower margins and smaller image previews; screenshot comparisons stack into one column. Buttons, inputs and selects have a minimum height of 44px, and keyboard focus has a visible outline.
- Opening a panel focuses its heading; closing returns focus to its toolbar button. Internal redraws restore the focused control when it remains enabled, otherwise focus moves to the panel heading. Loading and review summaries use status announcements; errors use alerts.
- Image roles and descriptions remain explicit merchant choices. Selecting **No usar** immediately disables **Usar en indicación**, before saving. Asset/icon insertion and correction preparation preserve the existing composer text and leave submission to the merchant.
- The review panel states the paid action and capture limitations before the merchant runs it. Opening it can load saved findings, but only the explicit review button starts screenshot analysis. Preparing corrections never submits a generation request.

Implementation: `apps/merchant-studio/src/source-visual-tools.ts` and `source-visual-tools.css`, integrated through `source-studio.ts`.

## Assets

The resource panel displays images already bundled in the selected revision. A merchant can mark their use as product, logo, business, background, team, reference-only, unused or unknown, and add a description. Saving creates a revision without an AI call and preserves the source and image bytes. Historical revisions are read-only. Stale writes and paths outside the owned snapshot are rejected.

`visual-assets.json` stores these choices with the portable project. Conversation, concept planning and both static/React generators receive the inventory. Newly attached images retain their interpreted roles; later text-only edits preserve the saved roles. Vision-capable generation also receives up to six supplied/retained photo inputs, prioritizing explicit paths in the current request. Text-only DeepSeek models retain their existing provider behavior.

Twenty-four authentic Lucide 1.31.0 icons are vendored in `source-kit/icons` with the upstream ISC/MIT notices. The generator receives exact paths and uses local images or CSS masks. Only referenced icons are bundled with the license. SVG works in static and React previews and exported servers. The panel's icon choices prepare a chat instruction; they do not silently edit the site.

## Visual review

The merchant opens the review panel for a saved page and explicitly clicks **Capturar y revisar con IA**. The selected model is used; Auto resolves to Terra. Text-only providers are rejected before capture rather than silently switched. The UI caps a review at ten credits (or the merchant's lower limit), with provider usage recorded under `visual-review`. No automatic paid review or regeneration is triggered by opening the panel or saving a revision.

An ephemeral Playwright Chromium browser renders the owned snapshot at 1280×844 and 390×844. Each viewport captures the start, middle and end (duplicates removed). Screenshots remain readable viewport-sized samples. Long-page gaps, static/reduced-motion behavior and omitted interactions limit the review: it does not certify the whole page, animation, checkout, numerical contrast or performance.

The browser uses a fresh context, Chromium sandbox, blocked service workers/websockets/downloads, intercepted local snapshot resources and a restrictive CSP. External network requests are blocked. Owned upload images referenced by source are hydrated through storage ownership checks, not by fetching arbitrary URLs. No merchant browser credentials are passed to the renderer. Maximum capture lifetime is 45 seconds; the single provider attempt also has a 45-second timeout. Only one capture/review runs per API process at a time.

The provider receives screenshots with their viewport/scroll positions and the brief/asset roles. Structured findings identify viewport, impact, category, visible location, observation and a local correction. Output is validated. Findings are persisted on the source thread under `source-visual-review`, scoped to revision and page; screenshots are returned for the current review session but are not persisted. Saving a newer revision during analysis rejects the stale result. The panel reloads saved findings and can prepare a repair message without submitting it. Visual findings do not replace the existing functional publishing checks.

## Runtime setup

The API depends on pinned Playwright 1.62.1. Install its matching browser in the API runtime image/environment:

```sh
pnpm --filter @pagosya/api exec playwright install --with-deps chromium
```

Run as a non-root user with Chromium sandbox support and browser cache access. A missing or unavailable browser produces an actionable capture failure before any model request. The standard Nest build copies `source-kit/icons`; when adding assets while a watcher is already running, run the API build once. Build the embedded editor with:

```sh
pnpm --filter @pagosya/api run build
pnpm --filter @pagosya/merchant-studio exec vite build --mode embedded
```

Chromium request isolation uses Playwright's documented [request routing and service-worker controls](https://playwright.dev/docs/api/class-browsercontext#browser-context-route).

## Validation

- Backend tests cover icon/license bundling, role persistence, stale revisions, invalid asset paths, real screenshot payload wiring, malformed review output, provider capability checks and failed usage accounting.
- Desktop/mobile editor tests cover role editing, icon selection, explicit review requests and preparing corrections while preserving composer text.
- `node apps/api/scripts/check-visual-capture.cjs` checks six actual Chromium screenshots with local CSS/SVG, using synthetic data and no AI call.
- Live editor inspection verifies that BURGUERIA's existing photos are visible. No customer revision was regenerated or published as part of implementation.
- The scoped Impeccable finish review approved the Studio extension with no remaining material findings. Its interaction contract includes focus restoration/fallback, immediate **No usar** insertion disabling, responsive panel layout and explicit review/correction actions.

## MP4 uploads

The source editor accepts PNG/JPG/WebP and MP4 from its attachment picker. MP4 files retain their bytes and use native video previews with controls and inline playback; they are never resized as photos or sent to a model as image inputs. A browser with an empty MIME type can still attach an `.mp4` after its header is checked. The upload service also validates the declared format against the file header and merchant ownership is checked before generation.

There are at most 24 attachments per request. Images retain their 6 MiB combined generation budget; MP4 files have a separate 20,000,000-byte combined budget across the saved project. The snapshot preserves its existing 8 MiB non-video budget. MP4 is bundled as a portable asset, preserved across revisions and ZIP exports, and included by the static export build with `video/mp4` serving. Both static and compiled-component previews resolve local video paths inside the existing isolated iframe. Posters resolve to local image assets.

**Recursos visuales** lists saved videos, their confirmed role and description, and lets the merchant prepare an instruction using their exact path. YAPI can place the supplied video based on that instruction; it does not claim to have inspected its frames or audio. No automatic transcription or video generation is introduced.

Validation includes an actual synthetic H.264 MP4 fixture playing in desktop/mobile Studio previews and the compiled-component/hosted preview route, multipart submission, role reuse, backend byte preservation, export build copying, ownership checks and size-limit failures. Provider outputs in the integration tests are mocked.
