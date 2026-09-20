# YAPI composition references

Three deliberately different stores using the exact `@pagosya/ui` source shipped by the preview compiler and portable export:

- `cafe-expressive`: oversized Bricolage type, brick red, an asymmetric breakfast composition, sweeping brand initial, full-screen menu and photo parallax.
- `beauty-editorial`: Instrument Serif, dark violet on pale lilac, a grouped text entrance, generous editorial image, an honest studio/setting comparison, and the image-led product presentation.
- `product-cinematic`: Ink and white, a curtain entrance, full-bleed textile photograph, a growing product story, focused two-column collection, and the story-led product presentation.

These are fictional demonstration stores with local sample products and prices, explicitly marked as previews. Cart, product pages, quantity changes and checkout use the real shared commerce runtime in `demo` mode. They never create a real order or charge. No efficacy claims, invented testimonials, videos, or third-party site assets are added.

## Run

From this directory, run `node build.mjs`, then `node server.mjs`. Open http://127.0.0.1:4328. `node verify.mjs` builds and checks 1440/768/390/320px overflow, loaded imagery, comparison keyboard/touch input, product/cart/demo checkout, and reduced-motion behavior with the repository's Playwright installation. It starts its own temporary local server.

Builds use esbuild/React/Motion already installed in `apps/api`; no new dependencies or generation calls. Output is in ignored `dist/`. Each store has `index.html`, `product.html`, and `checkout.html`. The gallery has links to every home and product page.

## Asset provenance

All images are built from existing repository example fixtures, with exact source paths recorded in `build.mjs`. Sharp preserves their composition and emits WebP at quality 80, up to 1280px wide without enlarging originals. Café uses `examples/independent-cafe/assets/breakfast.webp` plus Savia's original granola/juice images. Beauty uses existing Bruma fixture and scene images. Home uses existing home-textile fixture and scene images. This is an internal composition reference; those source fixtures are not a grant to redistribute unrelated external photography. Fonts and license files come from `packages/storefront-kit/kit/fonts`.

First-screen media and the two fonts used by each store are preloaded. Below-fold images remain lazy. The local server delivers HTML, JavaScript, CSS and fonts with Brotli when the client supports it, using Node's built-in compression. `node profile.mjs` measures a cold 390px navigation at 1.6Mbps, 150ms latency and 4× CPU slowdown. The initial uncompressed report is preserved in `dist/performance-baseline.json`; improvements include transport as well as asset/loading changes and are lab observations rather than field measurements.

No video fixture exists for these brands, so the cinematic family deliberately exercises `VideoHero`'s poster-only fallback. Supply approved decorative footage to its optional `src` for video playback. Motion obeys the store setting and reduced-motion; on data-saving connections video starts only after a visitor chooses play.

`node verify-motion.mjs` samples actual animation frames, checks once-only reveals and stable parallax, exercises menu keyboard/Escape/focus, replay and input interruption, changes reduced motion during playback, and renders the kit on the server for a no-JavaScript browser check. It tests 1440/390/320px. Use **Repetir entrada** in the example banner or Studio to replay without reloading.
