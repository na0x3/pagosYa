# Phase 0 rendered: what it fixed, what it cannot reach

Date: 2026-09-16. Companion to `STOREFRONT_DESIGN_LEVEL_UP.md`, which specified Phase 0.
Evidence: `tmp/design-audit-2026-09-16/` (before/after captures, `metrics-before.json`,
`metrics-after.json`, and the two Pliegue cushion photographs referenced in §3).

Phase 0 landed as generator-prompt work and had never been rendered. All four benchmark
stores were regenerated from the same fixtures, the same cached packshots and the same
briefs, so the only variable is the prompt. Cost: 142 credits, ~20 minutes.

## 1. The measured result

Measured on the real homepage at 1280×844. Bands are from `STOREFRONT_DESIGN_LEVEL_UP.md`
§3, §4 and §12.

| Metric | Band | apparel | beauty | home | technical |
|---|---|---|---|---|---|
| display:body | 2.6–3.2 | 3.36 → **3.00** | 4.82 → 7.00 | 5.91 → 4.50 | 3.20 → **2.82** |
| body px | 15–17 | 16 → **16** | 17 → **16** | 13 → **16** | 16 → **17** |
| line-height | ≥1.6 | 1.50 → **1.75** | 1.55 → 1.25 | 1.40 → **1.75** | 1.50 → 1.20 |
| gap contrast | ≥6 | 46.1 → **9.0** | 10.7 → **9.0** | 19.9 → **32.9** | 29.3 → **12.0** |
| card aspect spread | ≤2% | 31.3% → **0%** | 20% → **0%** | 40% → **0%** | 0% → **0%** |
| paragraph measure | ≤68ch | 114 → 69 | 196 → **66** | 53 → 78 | 111 → 212 |

**Card aspect consistency went from broken in three of four stores to perfect in all four.**
That was the most visible fault — two structurally different cards in one row, one with a
~200px void — and it is gone. Body size landed in band everywhere. Two of four now sit
inside the display:body band.

Still failing: line-height in two stores, paragraph measure in three. The measure failures
are real; `technical` regressed to 212ch. `beauty`'s display:body of 7.0 is a giant wordmark
used deliberately as the opening, which the band does not distinguish from a runaway title.

## 2. What Phase 0 visibly fixed

- One card contract per store. Same aspect, same order of name/price/action, no voids.
- A masthead that reads as a shop: lockup second line from real merchant data, four to six
  nav entries, cart badge. Every store, where before three of four were a bare wordmark.
- Pliegue's full-bleed dusty-pink band is gone; the page is one paper colour with the
  terracotta accent in roughly four slots, and the terracotta is the cushion's own colour.
- Punto gained a real specification comparison table and is now the strongest of the four.
- Trama gained an announcement bar.

## 3. The fault Phase 0 could not reach, and why

**Every one of the four stores puts a flat packshot on the card the customer buys from,
while a better photograph of the same product sits lower down the page as decoration.**

Pliegue is the clearest case. The store holds both:

- `image-bfa86d664066.jpg` — the cushion cut out on flat grey
- `image-e58bfe385a7a.jpg` — the same cushion on a sofa, window light, linen, olive branch

After regeneration the scene correctly leads the **hero**. The **catalog card** still shows
the grey cut-out. Trama and Bruma do the same thing. Bruma even captions its own gallery
`CREMA DE MANOS · ENVASE` beside `CREMA DE MANOS · ESCENA`, so the model can tell the two
apart when it looks at them — it just has nothing durable to act on.

The cause is that `visual-assets.json` records one flat role and a boilerplate string. This
is the complete manifest for Pliegue, all four entries identical but for the path:

```json
{ "path": "assets/image-bfa86d664066.jpg", "role": "product",
  "description": "Supplied product photography. Preserve packaging and factual product identity." }
```

It does not record that one photo is a packshot and another is a scene, that both depict the
same cushion, what colours are in them, or what their backdrop is. No prompt can fix a
selection the generator has no data to make, which is why this survived Phase 0 intact.

The same gap blocks two rules already written into the spec:

- §4 "sample the accent from a colour physically present in the merchant's own product
  photography" — nothing records the colours in the photographs.
- §5 "read the dominant backdrop colour of the supplied set and use it as `--store-surface`"
  — nothing records a backdrop.

## 4. Second finding: the scene contract never runs on a new store

`ProductScenesService.sceneContract()` reads the contract from the store's current source
revision. `stores.create()` does not create a `StoreSourceProject`; that row first appears
when a source revision is saved (`source-projects.service.ts:103`). So any scene generated
**before** a store's first site generation resolves no contract.

That is the normal ordering. It is what the benchmark script does — `scenes.create()` runs
in the fixture setup loop, `generator.generate()` afterwards — and it is what a merchant does
when they add products before building their site. Phase 1 was therefore not exercised by
this run at all, and is bypassed for most first-time stores.

`product-scenes.service.spec.ts:105` covers this path, but frames it as graceful degradation
for a store with no design project rather than as the common case.

## 5. Third finding: the contract contradicts two of its own settings

`sceneContractPrompt()` emits `Seamless backdrop in exactly ${backdropHex}` and is appended
**after** `SETTING_DIRECTION`, so it takes precedence. For `natural` ("stone, wood, linen or
plants") and `lifestyle` ("a realistic everyday place") those two instructions cannot both
be satisfied.

`backdropMode: 'field'` exists in the type but `resolveSourceSceneContract()` always returns
`'paper'`, and `sceneContractPrompt()` does not branch on the mode. As written, once the
contract does reach a scene call it will flatten lifestyle and natural staging into a paper
studio — removing exactly the quality that makes Bruma's and Pliegue's photographs good.

## 6. Recommended order from here

1. **Photo intelligence.** Extend the asset manifest beyond `{path, role, description}` with
   `shot` (packshot/scene/detail/in-use), `productKey`, and pixel-sampled `dominant[]`,
   `backdropHex` and `aspect`. Then require the buying surface to lead with the scene where
   one exists, make the §4 accent rule enforceable, and make the §5 surface rule buildable.
   This is the keystone: it unblocks three rules that are currently unimplementable.
2. **Uploads must be used.** `source-generation.service.ts:477` only enforces that confirmed
   uploads appear in the site when `requestsImageContent()` matches a narrow phrase regex.
   Enforce every confirmed role except reference/unused/unknown.
3. **Fix §4 and §5 above** now that the data exists.
4. **Scene worlds**, resolving both findings in §4 and §5 of this document.
5. Single-product archetype, then the YAPI upgrade proposal flow.

## 6a. Status of §6.1 (2026-09-16, later the same day)

**§6.1 photo intelligence is built, not yet rendered.** Nothing below has run through a paid
generation; the four benchmark stores in `examples/` predate it.

- `visual-assets.json` entries now carry an optional `photo`: `shot`, `productKey`, `dominant[]`,
  `backdropHex`, `aspect` (`source-photo-facts.ts`). Every field is derived, never model-written:
  `shot` from `MediaAsset` lineage (`AI_DERIVED` with a parent is a scene) and only otherwise from
  border-ring uniformity (≥0.9 packshot, ≤0.7 scene, silent between); `productKey` from the catalogue,
  following a scene to its parent's product; `aspect` from the container header; colours from
  `source-photo-sampler.ts`, one headless Chromium per generation, fail-soft to "no sample".
- Checked on real bytes: aspect matched `sips` on 60/60 JPEGs plus PNG and GIF (WebP parser has no
  real-file check yet). On Pliegue the sampler separates the grey cut-out (uniformity 1.00, backdrop
  `#d9d5d2`) from the sofa scene (0.33, `#b99e85`) and surfaces the cushion's terracotta `#a3442b`.
- The §4 accent rule and §5 surface rule in `SOURCE_RHYTHM_DIRECTION` now name these fields, plus a
  scene-first rule for authored heroes, features and cards. Roughly 100 prompt tokens.

**The card fault had a second cause outside the generator.** The kit card renders `imageUrls[0]`,
and the live store replaces its baked catalogue with `/stores/public/<slug>/store` on every load
(`commerce.js:1567`), so reordering in generated `config.js` would pass in preview and revert in
production. Studio's "Añadir a las fotos" appended an accepted scene *after* the packshot, and there
was no way to choose a cover. Now an accepted scene becomes the cover, every other photo has "Usar
como portada", and the benchmark script seeds `[scene, packshot]` to match.

**Open, owner's call:** products saved before this change still have the packshot as cover. Merchants
can fix each one in Studio; a one-off backfill (make the scene the cover wherever lineage proves a
packshot→scene pair inside one product) would fix all of them at once, but it changes live stores
without regeneration.

**Next:** rerun the four benchmarks (~142 credits) and check that cards lead with the scene and the
accent comes from `dominant`; then §6.2.

## 6b. No-credit pass on the live kit (2026-09-16)

Rendered all four stores through `currentSourceRuntime` (what hosted stores are served) at
1280×844 and 390×844, before and after, with `tmp/kit-audit/render.ts`. Only `commerce.js` and the
layout baseline reach existing stores at serve time; each snapshot keeps its own `commerce-pages.css`.

Changed in `commerce.js` (product page, every store, no regeneration):
- The purchase column top-aligns with the photo (was `align-self:center`, 60–75px low) and on
  desktop drops its dead right padding, so long titles take two lines instead of three.
- Editorial desktop pages show a real thumbnail strip instead of dots; the second photo is usually
  the styled scene, which was previously invisible without guessing the dots were clickable.
  Phones keep swipe and dots.
- The kit breadcrumb is skipped when the store authored a link just above the mount (all four
  benchmarks do), and otherwise stays on one line instead of orphaning the product name.

Checkout (`commerce.js`, every store): stores author a back link and often a title above the checkout
mount, so the kit stacked a second intro. The kit now skips its back link and title when the store
authored them, drops the review intro sentence, removes the "Continúa al pago" heading when there is
nothing to choose (the button says it), stops focusing the title on a full page (it painted a keyboard
ring for mouse users), says "se confirma al pagar" on the checkout itself, and aligns with the store's
intro instead of adding its own inset. `checkout-layout.spec.ts` updated to match.
Pre-existing, unrelated: `merchant-dashboard` test "saved site previews refresh…" times out at the product
create disclosure (line 167) with the original kit too.

Checked and deliberately not changed: a global line-height/measure floor. Measured per element, no
paragraph exceeds 75ch; only two 17–18px display subheads sit at 1.2–1.25, by design. The 212ch figure
in §1 came from a coarser harness. A zero-specificity floor would override intentional type for no gain.

Previewed, not applied: making each product's existing scene its cover (`SCENE_COVER=1`). Catalog
cards become clearly better, but stores whose generated sections already use those scenes as
decoration then show the same photo twice, one directly under its card, until regenerated.

Decision (owner, 2026-09-16): do not swap existing covers yet. Merchants can use "Usar como portada";
new scenes already become the cover. When stores can be regenerated, run
`cd apps/api && npx ts-node -T scripts/backfill-scene-covers.ts` (dry run), then `--apply`
(optionally `--store <id>`). It only moves a proven pair (`scene-cover-backfill.ts`, tested). Local dry
run: 16 of 46 products with photos.

## 7. How to reproduce

```
pnpm run dev:db                                    # port 54329
cd apps/api && npx prisma migrate deploy
# reset the four fixtures (keep fixtures/, they are the cached packshots)
npx ts-node -T scripts/premium-design-benchmark-photos.ts
```

The measurement harness used for the table in §1 is not committed; it is a Playwright script
that loads each `site/index.html` at 1280×844 and reads computed styles. Folding those
assertions into `captureSourceVisuals` is §12 of the level-up spec and remains unbuilt.
