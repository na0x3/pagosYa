# Storefront design level-up: reaching the reference quality bar

Status: specification, 2026-09-16. Not implemented. Research notes and evidence: `.superpowers/sdd/design-levelup-notes.md`.

This document raises the visual quality of generated storefronts to the bar set by the owner's reference (`amboras.com` and its published example-store screenshots). It specifies **principles, systems and numeric constraints**, never their compositions, copy or assets. A generated pagosYa store must continue to look like its own merchant's brand. Anyone implementing this does not need to have seen the reference.

## 1. Why

Four committed benchmark stores at 1280×844 (`examples/premium-benchmark-photos/*/capture-0.jpg` and `kit-product-capture-0.jpg`) show the same faults, and none of them is "the design is ugly":

- **Photography is not a set.** Every packshot sits on a cool grey backdrop (~#e9e9e9) while the page paper is warm cream (~#f2eee7). In `home-photo-1` the two products on one row are 4:5 and ~4:3. `productScenePrompt()` in `product-scenes.service.ts` generates each photo independently and its strongest instruction is *"a clean seamless studio backdrop in a color that suits the brand"*. The store gets a bag of stock photos rather than a shoot.
- **Two type registers where a premium store runs five.** `apparel-photo-1`'s product page uses one family at weights 400 and 600 for every role on the page. No italic appears in any of the four stores except one word in `home-photo-1`. Body line-height is 1.5 everywhere (`commerce-pages.css`).
- **The accent colour is used once and is unrelated to the product.** Trama's saturated blue appears on the buy button and nowhere else, and matches nothing in the photograph.
- **Uniform vertical rhythm.** Every gap in the Trama purchase column is 14–22px. Nothing compresses inside a semantic group or expands between groups, so the page has no bands.
- **No catalogue card contract.** `home-photo-1` renders two structurally different cards on one row, one with a ~200px dead gap, because the kit's card defaults live in `@layer pagosya-commerce` — the lowest precedence layer — and authored CSS always wins.
- **The masthead is a bare wordmark.** No lockup second line, no announcement bar, ≤2 nav links, no locale/search/account cluster. Three of the four stores have a header that could belong to any business.
- **No hairline, radius or shadow discipline.** The product page renders an option pill at radius 999px next to a buy button at radius ≤6px next to a quantity box at the same clamp. The kit defines no shadow at all.

The causes split three ways, and the phases below follow that split: things the generator could already do and is simply not told to do (§3, §4); things the kit's CSS or markup prevent (§6, §7); and things that need a new capability (§5, §8).

## 2. Decisions

- **The quality bar is a set of numeric constraints, not adjectives.** Every rule in §3–§8 states values. A design review that cannot be settled by measuring the render is out of scope for this document.
- **Per-merchant identity stays free.** This spec fixes *role counts, ratios, budgets and consistency*, never a palette, a family, a composition or a section order. Two stores that both satisfy every rule here must still be unmistakable for each other.
- **Photography becomes a per-store contract, not a per-photo request.** A store resolves one backdrop colour, one light direction, one camera elevation, one product-fill fraction and one aspect ratio, persists them, and every subsequent scene generation reuses them. This is the single highest-impact change and it touches no published storefront.
- **`commerce.js` changes are additive or layer-safe.** Anything that would alter an existing published store's appearance on deploy is either inside `@layer pagosya-commerce` (where authored CSS still wins), or gated behind a `config.js` key that is absent on existing stores, or a bounded value change listed explicitly in §7 with its blast radius.
- **No new dependency, no build step.** Everything in the kit stays vanilla browser CSS and JS.
- **All shopper-facing strings are Spanish.** Literal strings appear in this document in the form they must ship.

## 3. The type system (generator direction, no code)

The generator must commit to **five type roles** per store and use no more than two families. Fewer than five roles is the current failure; more than five is noise.

| Role | Purpose | Constraint |
|---|---|---|
| `display` | Page and product titles | 2.6–3.2× the body size. Weight 350–500, never ≥600 unless the family has no lighter cut. `line-height` 1.02–1.12. `letter-spacing` −0.01em to −0.03em, never below −0.04em (already enforced by `validateSourcePresentation`). |
| `subhead` | One line under a display title | Same family or the serif partner, **italic**, 1.05–1.25× body, weight 400, colour at 70% ink. |
| `body` | Paragraphs | 15–17px desktop, 15px mobile. `line-height` **1.7–1.8**, not 1.5. `max-width` 46–62ch. |
| `label` | Eyebrows, option legends, breadcrumbs, announcement bar | 10.5–12px, `text-transform: uppercase`, `letter-spacing` 0.10–0.20em, weight 500–600. |
| `numeric` | Prices, counters, quantities, spec values | `font-variant-numeric: tabular-nums`. Price at 1.0–1.3× body in editorial concepts, 1.8–2.2× body in dense ones. |

Rules:

- The display:body ratio must land in **2.6–3.2×**. Below 2.6 the page reads flat; above 3.2 the title wraps past two lines in Spanish. Verify with the real merchant name and the longest real product name, not a placeholder.
- Contrast is bought with **size, measure and colour**, not weight. A store may use at most two weights per family.
- At least one role must be italic. `assets/fraunces.ttf` (100–900) and `assets/instrument-serif.ttf` both provide true italics; `source-fonts.ts` already bundles them on reference.
- Every paragraph gets an explicit `max-width` in `ch`. Unconstrained measure at 1280px is the most common cause of a page looking like a document.
- The ink colour appears at a fixed **opacity ladder** and never as a second hue: `100% / 85% / 70% / 55% / 40%`. Express it with `color-mix(in srgb, var(--store-foreground) N%, var(--store-background))`. Muted text is one rung, not an arbitrary grey.

Where this goes: extend `SOURCE_CREATIVE_DIRECTION` in `apps/api/src/stores/source-design.ts` with the five roles and the ratio band, and extend `SOURCE_STYLE_TOKEN_CONTRACT` in `source-style-tokens.ts` to require the store to declare its scale once in `:root`.

## 4. Rhythm, measure and the accent budget (generator direction, no code)

**Spacing scale.** One scale per store, eight steps, each step ≥1.4× the previous: `4 / 8 / 12 / 20 / 32 / 48 / 72 / 112`. A store may scale the whole set by a single factor in 0.85–1.25. No value outside the scale appears in authored CSS.

**Group compression.** Within one semantic group (a title and its subhead; a price and its qualifier; a legend and its values) use steps 1–3 (4–12px). Between groups use steps 5–7 (32–72px). Between page sections use step 7–8 (72–112px). The measurable promise: **the largest gap on the page is at least 6× the smallest**. A page where every gap is 14–22px fails.

**Measure.** Body copy 46–62ch. A display title is capped so it wraps to at most two lines at 1280px and three at 390px — set `max-width` in `ch` on the title, do not rely on the viewport. Add `text-wrap: balance` to display titles; it degrades harmlessly where unsupported.

**Accent budget.** A store has exactly **one** accent. It appears in at most **five** places on any page, drawn from this list and no other: announcement bar fill, rating marks, eyebrow text, selected-state ring or fill, primary action fill. It never becomes a large background field except the announcement bar. Everything else is paper, ink at a ladder rung, and the surface token.

**Accent derivation.** When `--brand-accent` is not confirmed, the accent is sampled from the merchant's own product photography — a colour that is physically present in the goods or their setting — and never from a generic palette. State which photo and which element it came from in the concept's `premise`. A saturated blue on a cream apparel store, as in `apparel-photo-1`, is the failure this rule exists to stop.

**Hairlines.** One hairline treatment per store: `1px solid color-mix(in srgb, var(--store-foreground) 14%, var(--store-background))`. Hairlines terminate at the content measure, not at the container edge, unless they are a full-bleed section divider. At most **three** hairlines per screenful.

Where this goes: `SOURCE_CREATIVE_DIRECTION` and `SOURCE_DESIGN_CONTRACT` in `source-design.ts`.

## 5. The photographic scene contract (new capability)

This is Phase 1 and it touches no published storefront.

**Problem.** `productScenePrompt()` (`apps/api/src/stores/product-scenes.service.ts:25`) is called once per product with a `setting` from `PRODUCT_SCENE_SETTINGS`. Nothing is shared between calls. `SETTING_DIRECTION.studio` says only *"A clean seamless studio backdrop in a color that suits the brand, soft directional light and a natural contact shadow."* The model resolves "a color that suits the brand" to neutral grey, every time, for every store.

**Decision.** A store resolves a scene contract once and persists it. Every scene generation for that store passes the same contract.

```
SceneContract = {
  backdropHex: string      // resolved from the store's --store-background or --store-surface
  backdropMode: 'paper' | 'field'
  lightDirection: 'left-45' | 'right-45' | 'top-soft' | 'window-left'
  cameraElevation: 'eye-level' | 'three-quarter' | 'overhead'
  fillFraction: 0.62 .. 0.72   // product height ÷ frame height
  aspect: ProductSceneAspect   // one value for the whole store
  shadow: 'soft-contact' | 'long-directional' | 'none'
}
```

Rules:

- `backdropMode: 'paper'` sets `backdropHex` to the store's resolved `--store-background`, so packshots dissolve into the page. `'field'` allows one deliberate contrasting colour, which must be sampled from the products themselves (see §4). Nothing else is permitted. Neutral grey is only valid if it *is* the store's paper.
- `aspect` is fixed per store. Two products in one catalogue row must never differ in aspect ratio.
- `fillFraction` is fixed per store. Two products at different scales in one row is the same failure as two aspect ratios.
- The contract is resolved when the store's design tokens are first resolved, stored alongside them, and re-resolved only on an authorised redesign.
- `productScenePrompt()` gains a `contract: SceneContract` parameter and emits, verbatim in the prompt:
  `Seamless backdrop in exactly ${backdropHex}. Key light ${lightDirection}. Camera ${cameraElevation}. The product occupies ${Math.round(fillFraction*100)}% of the frame height, centred, with even margin. ${shadow} shadow. Every photograph for this store uses these same values so the catalogue reads as one shoot.`
- The existing product-preservation clauses in `productScenePrompt()` are unchanged and keep precedence.
- `SETTING_DIRECTION` entries are rewritten to describe *staging* only. They must not mention backdrop colour, light or framing any more; the contract owns those.

**Merchant-supplied photos.** When the merchant uploads their own photos, no contract is imposed on them. Instead the *page* adapts: the generator reads the dominant backdrop colour of the supplied set and uses it, or a near neighbour, as `--store-surface`, so the gallery bed matches the photos rather than fighting them. This is the inverse of the generated case and resolves the grey-on-cream fault for existing catalogues without regenerating anything.

## 6. Catalogue card contract (kit)

**Problem.** The kit's card defaults sit in `@layer pagosya-commerce` in `commerce.js`, the lowest-precedence layer, so a freshly generated store's own CSS always wins and there is no floor. `home-photo-1` proves it: two cards, two structures, one row, one ~200px dead gap.

**Decision.** The kit keeps its defaults in the low layer — authored CSS must stay able to win on *appearance* — but adds a small set of **structural** rules that authored CSS cannot reasonably want to break, in an unlayered block so they take precedence:

- `[data-pagosya-catalog] .menu-item:not([data-custom-product]) { display: flex; flex-direction: column; }` and `.menu-item__copy { margin-top: auto; }` so a stretched grid row pushes the copy block to the bottom instead of opening a void in the middle.
- `[data-pagosya-catalog] .menu-item__image { aspect-ratio: inherit; }` with the catalogue element carrying `--pagosya-card-aspect` and the kit setting `aspect-ratio: var(--pagosya-card-aspect, 4/5)` on the image. The generator sets the custom property once on the catalogue; every card then shares one ratio by construction.
- `[data-pagosya-catalog] .menu-add { align-self: start; }` — already present, promoted out of the low layer.

**Generator direction** (complementary, in `SOURCE_DESIGN_CONTRACT`): a store declares **one** card contract and every card obeys it — same aspect ratio, same order of name/price/action, same action treatment, same image treatment. A featured or hero card may differ, but it must differ *deliberately and completely* (a different span and a different composition), never by one card accidentally having its button on a different row.

## 7. Geometry, shadow and hairline tokens (kit)

The kit currently defines `--pd-radius` and no shadow. Add to the `[data-pagosya-product]` token block in `commerce.js`:

```
--pd-radius-control: min(var(--store-radius, 0px), 8px);
--pd-radius-media:   min(calc(var(--store-radius, 0px) * 1.5), 14px);
--pd-radius-pill:    999px;
--pd-hairline:       1px solid color-mix(in srgb, var(--pd-ink) 14%, var(--pd-paper));
--pd-shadow-raised:  0 1px 2px color-mix(in srgb, var(--pd-ink) 12%, transparent);
--pd-shadow-lifted:  0 10px 30px -14px color-mix(in srgb, var(--pd-ink) 28%, transparent);
--pd-ease:           cubic-bezier(0.22, 1, 0.36, 1);
```

Changes to existing rules, with blast radius stated because `commerce.js` is live:

| Rule | Today | Becomes | Blast radius |
|---|---|---|---|
| `[data-product-option]` | `border-radius: 999px` hardcoded, `var(--pd-radius)` in dense | `var(--pd-radius-pill)` when the store's `--store-radius` ≥ 12px, else `var(--pd-radius-control)` | Option pills on every published store lose their pill shape when the store's own radius is square. This is the intended correction: the page stops showing three radii at once. |
| `.product-detail__buy` | `border-radius: var(--pd-radius)` (≤6px) | `var(--pd-radius-control)` (≤8px) | ≤2px on stores with a large authored radius. Imperceptible. |
| `.product-detail__thumbnails button` | `var(--pd-radius)` | `var(--pd-radius-control)` | Same, ≤2px. |
| `[data-product-option][aria-pressed=true]` | `box-shadow: inset 0 0 0 1px` | unchanged, plus `transition: border-color .18s var(--pd-ease), box-shadow .18s var(--pd-ease)` | Adds an 180ms transition to selection. No static change. |
| `.product-detail__buy` | `transition: filter .15s` | `transition: filter .2s var(--pd-ease), box-shadow .3s var(--pd-ease)`; add `box-shadow: var(--pd-shadow-raised)` and `:hover { box-shadow: var(--pd-shadow-lifted) }` | Adds a 1px shadow under the primary action on every store. Verify against all four benchmark captures before shipping. |
| `body.commerce-document` in `commerce-pages.css` | `line-height: 1.5` | `line-height: 1.7` | **Reflows checkout and order pages on every published store.** Ship this one alone, in its own deploy, with fresh captures of `checkout.html` at 1280×844 and 390×844 for all four benchmark stores. If any purchase control moves below the fold, revert to 1.6. |

Radius rule for the generator: a store declares **two** radii, one for controls and one for media, and the media radius is 1.2–2.0× the control radius. Zero for both is a valid and often better answer.

## 8. Chrome that makes a page read as a shop (new capability)

Three additions. All are opt-in so no published store changes on deploy.

**8.1 Announcement bar.** A platform component, because the content is store data the generator cannot invent. Rendered by `commerce.js` into an existing `[data-pagosya-announcement]` mount when `config.js` carries `announcement: { items: string[] }` with 2–4 entries. Absent key means absent bar, which is every store today.

- Markup: `<div class="commerce-announce" role="complementary" aria-label="Anuncios de la tienda">` containing the items joined by a ` · ` separator span marked `aria-hidden="true"`.
- Style: full bleed, `background: var(--store-accent)`, `color: var(--store-accent-foreground)`, `min-height: 38px`, items at 11px / `letter-spacing: .12em` / uppercase / weight 600, centred.
- Overflow: at ≤640px, if the joined text exceeds the width, it scrolls as a marquee at a fixed 40s linear loop with `animation-play-state: paused` under `prefers-reduced-motion: reduce` and a visible pause control. Do not truncate.
- Content is real store facts only — delivery zones, opening hours, real promotions, real origin. The existing prohibition on fabricated claims in `SOURCE_CREATIVE_DIRECTION` applies unchanged. Spanish literals, e.g. `ENVÍO A TODO SANTA CRUZ`, `HECHO EN BOLIVIA`, `RETIRO EN TIENDA`.

**8.2 Header lockup direction** (generator, no code). The masthead carries the wordmark **plus one second line** at `label` role — the merchant's real city, founding year, materials or method, from confirmed merchant data only. Four to six navigation entries where the catalogue supports them. A right-hand action cluster of icon-only controls with accessible names and a cart count badge — the existing direction in `SOURCE_PRODUCT_PRESENTATION_DIRECTION` already asks for this on the product page; extend it to the homepage header.

**8.3 Trust triad.** Replace the boxed 2-up `.product-detail__assurances` treatment with a 3-up borderless row when three items are available:

- Items come from real store configuration only — `store.locations` (retiro en tienda), `store.shippingEnabled` plus real zones (envíos), payment (pago seguro procesado por pagosYa), and real `specifications` rows such as origin or warranty. Never a fabricated guarantee.
- Style: `grid-template-columns: repeat(3, minmax(0,1fr))`, no border, no background, 20px icon, `strong` at 12.5px/600, detail at 12px at the 55% ink rung, `gap: 32px`. At <720px it becomes a 1-up stack.
- Two items keep the current boxed treatment. Fewer than two renders nothing and occupies no space.

**8.4 Rating band.** `.product-detail__rating` is `hidden` unless verified reviews exist, so it never renders for a new merchant. Keep that — inventing social proof is not on the table. Instead, when there are no reviews, the band's vertical slot is reclaimed by the eyebrow rather than left as dead space; confirm no residual margin at 1280×844.

## 9. Motion

The kit's `motion.js` currently does one thing: a 220ms (subtle) or 280ms (expressive) opacity+6/10px translate on up to 24 `h2`/`figure` nodes, plus a 1.02/1.035 image scale on `.menu-item__image` hover. Add, in `subtle` and `expressive` only, never in `auto` or `off`:

| What | Value |
|---|---|
| Standard easing token | `--pagosya-ease: cubic-bezier(0.22, 1, 0.36, 1)` on `:root`, used by every kit transition |
| Card hover | `transition: box-shadow 500ms var(--pagosya-ease), transform 500ms var(--pagosya-ease)`; `transform: translateY(-2px)`; shadow `--pd-shadow-raised` → `--pd-shadow-lifted`. Gated on `(hover:hover) and (pointer:fine)`. |
| Gallery photo swap | 220ms opacity crossfade, no translate, no scale |
| Selected option | 180ms on `border-color` and `box-shadow` (§7) |
| Entrance | unchanged, still capped at 24 nodes, still cancelled on first keydown |

Nothing animates layout. Nothing animates on first paint. `prefers-reduced-motion: reduce` and `motion: off` continue to disable everything, as they do today.

## 10. Phases

Ordered cheapest-highest-impact first. Each phase is independently shippable and independently verifiable.

| Phase | Contents | Files | Touches live stores? |
|---|---|---|---|
| **0** | §3 type roles, §4 rhythm/measure/accent budget, §6 generator half, §8.2 header direction | `source-design.ts`, `source-style-tokens.ts` | No — generation only |
| **1** | §5 scene contract | `product-scenes.service.ts`, store token persistence | No |
| **2** | §7 tokens and the ≤2px radius/transition rows | `source-kit/commerce.js` | Yes, imperceptibly |
| **3** | §6 kit half — structural card rules | `source-kit/commerce.js` | Yes, only where a store had the auto-placement void |
| **4** | §8.1 announcement bar, §8.3 trust triad, §8.4 rating slot | `source-kit/commerce.js` | Bar: no (opt-in). Triad: yes, on stores with ≥3 real items |
| **5** | §9 motion, and the `line-height` 1.5 → 1.7 change from §7 **shipped alone** | `motion.js`, `commerce-pages.css` | Yes — the largest reflow in this document |

Phase 0 is the whole of the type, rhythm and colour correction and costs no code. Do it first and re-run the benchmark before deciding whether phases 2–5 are still worth their risk.

## 11. What this does not change

- **No platform palette, family, spacing scale or page composition.** `history/STOREFRONT_THEME_DIRECTIONS.md` retired presets and this document does not reintroduce them. Every rule here constrains ratios, counts and consistency, never values.
- **Product-page layout.** `PRODUCT_PAGE_KIT.md` owns it. §7 adjusts tokens inside that layout; the two styles, the grid, the choice rendering and the buybox split are unchanged.
- **Cart, checkout, payment, stock and fulfilment behaviour.** Untouched, except the `commerce-pages.css` line-height in §7, which is a typographic change with no behavioural component.
- **All existing runtime hooks.** `data-product-option`, `data-option-value`, `data-variant-add`, `data-add`, `data-product-quantity`, `data-product-total`, `data-product-image`, `data-product-prev/next`, `data-product-count`, `data-product-sticky`, `data-product-delivery`, `data-pagosya-catalog`, `data-pagosya-cart` all keep their contracts.
- **The three-concept exploration.** `source-design-planner.ts` and the `layout.sections` contract are unchanged. This document constrains how a concept is *rendered*, not how many are explored or how one is chosen.
- **Honesty rules.** No fabricated reviews, certifications, delivery promises, origin claims or product photographs. §8's announcement bar and trust triad consume real store configuration only, and render nothing when it is absent.
- **The generator's freedom to be still, sparse or loud.** A deliberately quiet store that satisfies §3 and §4 passes.

## 12. Testing

**API (jest)**

- `productScenePrompt()` emits the backdrop hex, light direction, camera elevation and fill percentage verbatim when a contract is supplied, and is byte-identical to today when one is not.
- The scene contract is resolved once, persisted, and returned unchanged on a second product in the same store; an authorised redesign re-resolves it and a local edit does not.
- `SETTING_DIRECTION` strings no longer mention backdrop colour, light direction or framing.
- `config.js` round-trips an `announcement` key through generation, motion changes and revision save, like `motion` and `productPageStyle` already do.
- Announcement rendering: absent key renders nothing and adds no node; 1 item renders nothing; 2–4 items render; 5+ is rejected at validation.
- Trust triad: 3 real items render the 3-up, 2 render the existing box, 0–1 render nothing and occupy no space.
- The `@layer`-free structural card rules do not appear inside `@layer pagosya-commerce` in the emitted `commerce.js`.

**Browser (merchant-studio Playwright, `tests/source-catalog.spec.ts`)**

- At 1280×844 and 390×844 on all four benchmark fixtures: no horizontal overflow, the buy button's bottom edge is inside the first viewport, the product title renders ≤2 lines desktop and ≤3 mobile. These are the existing `designCaptureFailures` checks and must still pass.
- Every card inside one `[data-pagosya-catalog]` has the same rendered image aspect ratio to within 2%.
- No `.menu-item` contains an internal vertical gap greater than 64px between its copy block and its action.
- Announcement marquee: pauses under `prefers-reduced-motion: reduce`, exposes a working pause control, and never truncates text.
- Selecting an option and adding to cart still produces the correct variant and total, with the new transitions in place.
- `checkout.html` at both viewports after the line-height change: every control reachable, nothing clipped.

**Measurable design assertions** — add to `captureSourceVisuals`, as hard failures where noted:

| Assertion | Threshold | Hard failure |
|---|---|---|
| Display:body computed font-size ratio on the homepage | 2.4–3.4 | Yes |
| Distinct computed `font-weight` values across the page | ≤ 4 | Yes |
| Body `line-height` on authored paragraphs | ≥ 1.6 | Warn |
| Largest ÷ smallest vertical gap between sibling blocks in `main` | ≥ 5 | Warn |
| Distinct non-zero `border-radius` values on the product page | ≤ 2 | Yes |
| Elements painting `--store-accent` as `background-color` above 2% of viewport area | ≤ 1 | Warn |
| Distinct computed `border-color` values used on 1px borders | ≤ 2 | Warn |
| Paragraph rendered width at 1280px | ≤ 68ch | Warn |

**Visual** — regenerate all four `examples/premium-benchmark-photos` stores after each phase and commit before/after captures beside the existing ones, as `PRODUCT_PAGE_KIT.md` §9 already requires. A phase that does not visibly improve the captures does not ship.

## 13. Open questions for the owner

1. **Announcement bar default.** Opt-in per store (nothing changes for anyone until a merchant or a redesign adds it), or on by default for newly generated stores only? Recommendation: opt-in, then default-on for new stores after one week of captures.
2. **Re-photographing existing catalogues.** The scene contract only improves photos generated *after* it ships. Existing stores keep their mismatched grey packshots unless their photos are regenerated, which costs credits. Should the platform offer merchants a one-click "unificar las fotos de la tienda" action, and who absorbs that cost?
3. **The `line-height` 1.5 → 1.7 change** reflows checkout on every published store. Worth it for the typographic gain, or leave the kit at 1.5 and apply 1.7 only to generated storefront CSS?
4. **Card aspect ratio as a merchant choice.** §6 fixes one ratio per store. Should merchants be able to override it in Studio, or is it a generator decision only?
5. **Reference scope.** This document treats the reference's *product detail pages* as the quality bar, because that is what they publish. Their homepages are not observable — `/examples` links only to static screenshots and there is no live demo store. If the owner has seen a live reference storefront homepage, that evidence would change §6 and §8 materially and should be supplied.
6. **Italic dependency.** §3 requires one italic role. Only `fraunces.ttf` and `instrument-serif.ttf` in `source-kit/fonts/` ship true italics. Is adding one italic-bearing sans to the bundled set acceptable, or should sans-led concepts satisfy the role with a letterspaced label instead?
