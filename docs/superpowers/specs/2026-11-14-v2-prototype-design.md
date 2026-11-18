# V2 prototype — AI-written React home + product page for one store

Owner, 2026-11-14: prove that AI-generated React presentation produces more distinctive, premium storefronts than the template
system. One benchmark merchant (Oh Belly), home + product page, sandboxed build, desktop + phone screenshots, side by side with the
template version and a premium reference (Mirror Water). Section fill stays the production generator; nothing is migrated.
Targets [YAPI_GENERATION_V2.md](../../YAPI_GENERATION_V2.md) §4 (custom nodes), §7 (build sandbox), §8 (commerce interface), §12.

## What already exists and is reused

| Need | Existing piece |
|---|---|
| Commerce interface for generated code | `@pagosya/ui`: `ProductPageTemplate` + `KitSlot kind="product" name=…` (gallery, title, pricing, buy, description…), `data-pagosya-catalog` (cards drawn by the kit), `CartButton`/`data-cart-open`, `CartParts`; the kit fills them from runtime data |
| Platform pages inside any design | checkout, account, auth, catalogue and policy pages import only `Shell` (default) / `Header` / `Footer` from `components/Shell.tsx` |
| Compile model-written TSX | `prepare` → `compileNextPreview` (esbuild, Tailwind, vendor React), `validateNextSources` (import allowlist, no eval / script / fetch) |
| Verified bytes | `preparedSourceArtifact` / `assertPreparedSource`: the checked snapshot is the saved snapshot |
| Render + checks | `withVisualSandbox` (offline, CSP), template rules at 1280/390 (`templateQaFindings`), `probeSourceShopping` (add to cart), `assertSourceCommerceContract` |
| Fonts | 64 bundled faces: `@font-face { src: url(assets/<id>.ttf) }`, copied in by `withSourceFonts` |

## The prototype pipeline (`apps/api/src/storefront-source/v2/`)

1. **Context** (`v2-context.ts`): from the base revision's own files — store name, products (id, name, category, photo) from
   `config.js` data, photo assets, checkout mode. Prices and stock are never given to the model as words to write.
2. **Direction** (one vision call): brand facts + up to 6 store photos + a reference screenshot → `V2Direction`
   (idea, type pair from the bundled catalogue, palette with jobs, grid/composition grammar, hero composition, section sequence with
   reasons, one signature move, photo treatment, phone plan). The reference teaches the craft level, never the layout to copy.
3. **Write** (one call, strict JSON): `components/Shell.tsx` (default `Shell`, `Header`, `Footer`), `components/home.tsx`,
   `components/product.tsx`, `styles/globals.css`. Rules: the chassis contract above, no template files, kit mounts for every
   commerce part, no price/stock text, scoped CSS on the design's own classes, no `!important`.
4. **Build in a sandbox** (`v2-sandbox.ts` + `v2-sandbox-child.cjs`): a child `node` under macOS `sandbox-exec` — no network, no
   writes outside its temp dir, no reads of `.env` files or `~/pagosya-benchmarks`, an empty environment (no secrets), 768 MB heap,
   120 s wall clock. It runs the platform's own `prepare` and returns the prepared snapshot or structured errors. Build errors go
   back to the writer once or twice (bounded).
5. **Check**: `assertSourceCommerceContract`, template rules at 1280/390, shopping probe (add to cart), and a **layout signature**
   of the rendered home (per top-level section: columns, media side, bleed, height band) for structural originality.
6. **Save** as a draft revision «Diseño V2 (prototipo)» through `preparedSourceArtifact` (the sandbox's bytes), never published.

Entry: `POST /v1/stores/:storeId/source-project/v2-prototype` (merchant auth), only when `YAPI_V2_PROTO=1`; runs in the background,
progress in the product log. Section fill and the chat are untouched.

## Measures (one store, three columns: template rev / V2 / Mirror Water)

Structural originality (layout-signature distance from the template home and from the other benchmark homes), design quality
(owner's eye + my labelled scores), phone (rules at 390, horizontal overflow), functional correctness (contract, add-to-cart probe),
generation time, reliability (build attempts, failures).

## Out of scope

Chat wiring, other pages' redesign (checkout/account keep the kit inside the new Shell), linux sandbox (nsjail/container) — the macOS
`sandbox-exec` profile is the prototype's isolation; production needs a container worker (V2 §7).
