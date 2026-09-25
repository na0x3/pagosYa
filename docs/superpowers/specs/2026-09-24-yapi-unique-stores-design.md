# YAPI unique stores — umbrella design

Date: 2026-09-24. Status: approved by the owner ("do all of it"), 2026-09-24.
This is the roadmap and the shared contracts. Each sub-project below gets its own
spec → plan → build cycle when it starts.

Related documents:
- `docs/SOURCE_DESIGN_DIVERSITY_REVIEW.md` (2026-09-09) reached the same finding
  on three café sites: product presentation varies, page story and typographic
  language do not.
- `docs/STOREFRONT_VISUAL_DIVERSITY_PLAN.md` (2026-08-31) targets the older
  `siteDocument` path; its 24–30 merchant "diversity bank" is reused in
  sub-project 8.
- `docs/YAPI_STORES_DIFFERENTIATION_PLAN.md` (2026-09-19) is about market
  differentiation (safety, speed, legal completeness, the assistant), not visual
  uniqueness. Its speed goal is served by sub-project 0.

## 1. The problem, measured

The owner's complaint: stores look alike, every button and every checkout is the
same, designs were better before, and generation fails too often to show merchants.

Evidence gathered on 2026-09-24 from the 42 locally generated stores and the
hosted storefront:

| Finding | Evidence |
|---|---|
| New stores lost their motion | `apps/api/.env` has `SOURCE_FRAMEWORK=static`, so every new store is plain HTML (`source-generation.service.ts:335`). Only the 4 component-mode stores (GROUND UP, ÓRBITA, The Bake Lab, BookShelf) use the motion library; they have 378–797 motion hooks each, the other 38 have 0–11. One store has parallax. |
| Cart, product page, pre-checkout and buttons are identical everywhere | They are rendered by the shared kit (`packages/storefront-kit/kit/commerce.js`), which reads only colors, one radius and one heading font (`--pd-*`, `--store-*`). No layout, button-form or motion variables exist. |
| Narrow vocabulary | Almost every store uses the same 5 bundled fonts (Instrument, Instrument Sans, Fraunces, Bricolage, Oswald). 40 of 42 stores use the same "eyebrow" label pattern; the kit exports an `Eyebrow` component. |
| Hosted stores load extremely slowly | `sourcePreviewDocument` inlines every bundled file as a `data:` URL (`packages/storefront-preview/src/source-preview.ts:39`, `:64`). `hostedImageUrls` only rewrites catalog photos. cuadraa's hosted document is 5.7 MB and painted nothing for >10 s. |
| Generation fails often | 17 of 80 recorded runs failed and 49 needed a second attempt (Sep 13–20). Failure reasons: missing required hooks, a letter-spacing rule, TypeScript syntax slips, prices missing from the brief, missing assets. |

The motion library itself is already rich: `packages/storefront-kit/kit/ui.tsx`
(982 lines) exports 44 components including `Parallax`, `ParallaxStack`,
`ScrollScrubHero`, `ScrollScale`, `Marquee`, `StoryChapters`, `TextFillStatement`
and five entrance animations.

## 2. Goal

Every store is unmistakably its own, down to its buttons, cart, product page,
pre-checkout and confirmation. Product meaning shapes the design: a lamp store can
show a hand-drawn lamp that switches on and glows inside the product page. No two
stores share buttons, checkout or overall look. Commerce never breaks, and a
generation rarely fails.

Owner decisions recorded in the conversation:
- Component mode (with the motion library) returns as the default for new stores.
- Cart and pre-checkout get a **designed skin on a safe core**: the platform keeps
  cart logic, prices, stock and the payment step; each store gets its own layout,
  buttons, typography, motion and transitions.
- Direction **A + free-CSS layer**: a per-store Design DNA drives every surface,
  plus a validated free-CSS layer for surprises.
- "Little drawn animations" are animated SVG line illustrations authored per
  product/theme, not literal emoji (which render inconsistently and cannot be
  animated reliably).

## 3. Sub-projects, in order

| # | Sub-project | Outcome |
|---|---|---|
| 0 | Fast hosted stores | Photos, fonts and scripts served as files, not inlined; first view paints within budget on a mid-range phone. |
| 1 | Component mode back, made reliable | `SOURCE_FRAMEWORK` defaults to component mode; pre-compile check, automatic fixes for mechanical TypeScript slips, one targeted repair. |
| 2 | Design DNA | One structured identity per store, including product motifs (§4), generated in the design step and saved with each revision. |
| 3 | Illustrated motion | YAPI draws small animated SVG illustrations tied to products and themes, placeable in pages, product page, cart and confirmation, with triggers (appear, scroll, hover, add-to-cart, purchase). |
| 4 | Diversity memory and a wider vocabulary | ~30 curated fonts, more layout directions, no stock patterns, avoidance of recently used DNA. |
| 5 | Every kit surface unique per store | Every surface in §3.1 reads the DNA and motifs: buttons (form, fill, hover, press), cart (drawer, page, sheet, overlay), the added-to-cart confirmation, product page, sticky buy bar, pre-checkout, checkout overlay, confirmation and the contact button. |
| 6 | Motion personalities | Calm, snappy, playful and cinematic presets for timing, easing, parallax depth and scroll scenes, applied to pages and kit. |
| 7 | Free-CSS layer | YAPI may add CSS per surface, validated against §5. |
| 8 | Uniqueness and quality scorecard | Fails a store too similar to another store or to kit defaults; checks commerce, speed and accessibility. Run as a before/after benchmark for every sub-project, on a 24–30 merchant diversity bank. |

### 3.1 Surfaces that must never look the same between stores

Owner requirement (2026-09-24): "no equal checkout, or pre-checkout, or cart, nor
when product added there's a little button that appears right bottom that is always
the same too". Every one of these is rendered by the shared kit today and is
identical across stores. Each gets store-specific form, placement, typography,
motion and, where it fits, a motif from the DNA:

| Surface | Today (`packages/storefront-kit/kit/commerce.js`) |
|---|---|
| Added-to-cart confirmation | `.cart-added`, fixed 24px from the bottom-right corner (`:1241`) |
| Cart | `.cart-drawer`, fixed right-side drawer (`:1192`) |
| Pre-checkout review | rendered inside the cart / checkout review |
| Checkout overlay | `[data-pagosya-checkout]`, full-screen fixed layer (`:1064`) |
| Product page and quick view | `[data-pagosya-product][data-style]`, four styles (`:271` onward) |
| Mobile sticky buy bar | `.product-detail__sticky` (`:448`) |
| Contact button | `[data-pagosya-contact]`, fixed bottom-right (`:1728`) |
| Buttons everywhere | add, quantity, remove, checkout, pay |
| Product cards before opening | one static photo today. Owner requirement (2026-09-24): YAPI chooses per store how a card previews the product, e.g. a second photo on hover, a quick-look, variant swatches that swap the photo, a motif reacting. Touch devices get an equivalent (tap or swipe), never a hover-only feature. |
| Order confirmation | payment result and Comeback card (`apps/checkout/src/checkout/payment-result.ts`) |
| Privacy and cookie dialog | platform-owned legal control in the platform's monospace style on every store; keeps its behavior and choices, takes the store's type, color and shape |

The uniqueness scorecard (sub-project 8) measures each of these surfaces
separately, not just the homepage.

0 is a contained bug fix and goes first. 8's measurement half is useful from the
start and may be built alongside 1–2.

## 4. Contract: Design DNA

Extends the existing `design-direction.json` (`SourceDesign` in
`apps/api/src/storefront-source/source-design.ts`: concepts with layout, story and
motion choreography) rather than replacing it. Saved with each store revision.

```
dna: {
  type:     { display, text, accent? fonts; scale ratio; case/tracking style }
  color:    { paper, ink, accent, support[]; contrast-checked }
  shape:    { radius scale; border weight; image framing }
  buttons:  { form: pill|block|underline|tag|stamp|outline|ghost|split…,
              fill, hover behavior, press behavior, icon usage }
  motion:   { personality: calm|snappy|playful|cinematic;
              easing + duration scale; parallax depth; scroll scenes[] }
  layout:   { grammar (editorial, grid, collage, index, poster…); density }
  surfaces: { cart: drawer|page|sheet|overlay;
              product: editorial|dense|image-led|story-led|stage…;
              review/pre-checkout and confirmation style }
  motifs:   [ { for: product|category|store, meaning,
                illustration brief, behavior (glow|draw|sway|steam|grow…),
                trigger (appear|scroll|hover|add-to-cart|purchase),
                placement (hero|card|product page|cart|confirmation) } ]
  signature: one memorable moment for the store
}
```

Rules:
- Generated once per store in the design step, alongside the concept. Surfaces
  read it; they do not re-decide it.
- Validated like code: unknown values are rejected; contrast is checked for text on
  accent and buttons on paper.
- Uniqueness is checked against other stores' DNA before any paid page
  generation. A DNA matching a recent store on button form, type pairing and cart
  style together is regenerated at design-step cost only.
- Editable later through YAPI chat ("rounder buttons", "calmer motion"): only the
  DNA changes and every surface follows.

Exact enumerations, field limits and storage are decided in sub-project 2's spec.

## 5. Contract: safety and quality gates

**The platform always owns the behavior of:** prices, stock, cart totals, discounts,
shipping and taxes; the payment step (QR, card), terms acceptance, legal notices
and privacy controls; the verification seal and the store's contact and complaint
channel (ASFI). YAPI may restyle these, never change what they do.

**Every generated store passes, before it is saved:**
1. Commerce works: add to cart, open cart, change quantity, pre-checkout, reach
   payment, on desktop and phone (extends the existing browser harness).
2. Nothing important is hidden or unreadable: prices, buy buttons, totals and legal
   text stay visible, at readable size and contrast.
3. Motion is safe: reduced-motion stops it, nothing flashes more than 3 times a
   second, animations stay within a CPU budget and never block scrolling or tapping.
4. Fast: first view paints within a budget on a mid-range phone (needs 0).
5. Illustrations are safe: SVG sanitized (no scripts, no external references),
   size-capped.
6. Unique: the scorecard compares with recent stores and kit defaults, buttons and
   checkout included; too similar means regenerate before showing.

**Failure handling, cheapest first:** automatic code fix, then one targeted repair,
then a merchant-facing message.

**Evidence:** each sub-project ends with a before/after benchmark on the same set
of briefs (screenshots plus scorecard), reviewed in a browser before it is done.

## 6. Out of scope for this program

- Changing the payment rails or checkout legal flow.
- Merchant-facing pricing of generations.
- Reusing designs across stores (it works against the goal).

## 7. Known environment note

The API process running locally on 2026-09-24 was started with
`CHECKOUT_ORIGIN=http://localhost:5175` and `PORT=3001`, while `apps/api/.env`
says port 3000 and `apps/checkout` defaults to 5174. A storefront on the wrong port
shows "Failed to fetch" (CORS). This is configuration, not a store bug.
