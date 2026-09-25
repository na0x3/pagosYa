# Identity libraries — sub-project T2 design

Date: 2026-09-25. Parent: `docs/superpowers/specs/2026-09-25-store-themes-design.md` (approved). Status: owner
asked for it ("o that but also t2"); this written spec awaits the owner's review.

Goal: the building blocks that let two stores on the same theme look like two different brands — illustrations
tied to what the store sells (the owner's example: "if its a dog treat store, the button has like a little paw…
with paw drawings on the background"), sections chosen for the business, typography, buttons, frames and colours.
T2 builds the libraries; T4 (identity engine) chooses from them per store; T3 (themes) is built on them.

## 1. What exists (from the code, 2026-09-25)

- **Design DNA** (`DNA_VALUES` in `packages/storefront-kit/kit/commerce.js`, `apps/api/src/storefront-source/source-dna.ts`):
  30 `display`/`text` fonts; `case`, `tracking`; `radius` (none, soft, round, pill); `border`; `frame` (bleed,
  inset, rounded, arch, polaroid); `button` (pill, block, underline, tag, stamp, outline, ghost, split); `hover`;
  `press`; `motion` (calm, snappy, playful, cinematic); `grammar` (editorial, grid, collage, index, poster,
  magazine, brutalist); `density`; `cart`; `added`; `product`; `review`; `card`.
- **Fonts**: 30 OFL fonts with a catalog (`source-font-catalog.ts`), but generation mostly uses 5.
- **Sections**: about 25 components in `packages/storefront-kit/kit/ui.tsx` (Hero, VideoHero, ParallaxStack,
  BeforeAfter, ProductShowcase, Statement, Marquee, Catalog, ProductRail, FeatureSplit, StoryChapters, Gallery,
  TrustStrip, Faq, Reviews, …) — all generic, none tied to a kind of business.
- **Motifs** (`source-motifs.ts`, kit placement code): at most 3 AI-drawn SVGs per store, 6 KB each, 64px, in the
  `product`, `card`, `cart` and `confirmation` slots, sanitised by an allow-list and animated by kit keyframes.
- **Colour facts**: `source-photo-sampler.ts` measures dominant colours and backdrop of product photos (no model).

## 2. What T2 adds

### 2.1 Motif packs and new placements (T2a)

- A drawn library under `packages/storefront-kit/kit/motif-packs/<topic>/`, about 30 topics to start (paws and
  bones, coffee beans and steam, leaves, flowers, bread and wheat, fruit, drops and bottles, sparkles, lamps and
  glow, shoes, hangers and thread, scissors, brushes and paint, gems, game controllers, circuits, books, music
  notes, balloons, waves, sun, stars, hearts, cups, chili, among others). Each pack is a `pack.json` (id, topic
  words in Spanish and English, the placements it supports) plus at most 8 SVGs of at most 6 KB, drawn once for
  pagosYa, passing the existing motif sanitiser.
- New placements rendered by the kit: `button` (a small icon beside the label of calls to action and the add
  button — never replacing the label, never on the pay button's price), `pattern` (a low-contrast repeating tile
  behind sections that opt in), `divider` (a separator between sections), `sticker` (badges such as "¡Nuevo!"),
  `empty` (the empty-cart illustration, also offered to the T1 cart template's `empty` slot).
- Guards stay: motifs are decorative (`aria-hidden`), never cover a price, a buy control or a total
  (`MOTIF_PROTECTED`), patterns stay under the contrast floor of the text on top, CSS animation only, reduced
  motion stops them. The per-store cap rises from 3 motifs to one pack (at most 8 files).
- AI-drawn motifs remain the fallback when no pack matches (T4 decides).

### 2.2 Buttons, frames and cards (T2b)

- `button` gains `sticker` (offset hard shadow), `ticket` (notched ends), `bubbly` (soft, rounded, with the
  motif icon) and `brutal` (thick border, flat colour): 8 → 12. Every style keeps the existing pay-button contrast
  rule (4.5:1) and minimum hit size.
- `frame` gains `blob`, `stamp` (perforated edge) and `tape` (taped corners): 5 → 8.
- Buttons expose a `data-motif-icon` slot so a pack's `button` motif appears inside any button style.

### 2.3 Font pairings (T2b)

A curated list of about 24 display + text pairings from the 30 bundled fonts, each tagged with personalities
(pop, editorial, luxury, handmade, tech, warm, playful, classic). Themes allow a subset; T4 picks within it and
weights away from pairings recent stores used. Stored as data next to `source-font-catalog.ts`.

### 2.4 Colours from the logo and photos (T2b)

A deterministic palette proposer: logo pixels plus the existing photo sampler → `paper`, `ink`, `accent`,
`surface`, `onAccent`, held to the existing contrast rules (text 4.5:1, pay button 4.5:1). No model calls. When
there is no logo and no photo, it returns nothing and the theme's own defaults apply.

### 2.5 Business sections (T2c)

About 12 new components in `ui.tsx`, each a complete, responsive section driven only by props (no prices except
through the kit's own slots): `Ingredients`, `SizeGuide` (e.g. by dog weight or clothing size), `BakedToday` (a
daily schedule board), `MenuBoard`, `Lookbook`, `SpecCompare`, `GalleryWall`, `WorkshopStory` (handmade process),
`HowToUse`, `CareGuide`, `PackBuilder` (bundles, prices from the kit), `ServiceSteps` (bookings/services). Each
has a small manifest: id, the kinds of business it suits (topic words), the props it needs.

### 2.6 The identity catalog

One machine-readable catalog (`packages/storefront-kit/kit/identity-catalog.json`, generated and validated by a
test) listing every pack, placement, button, frame, font pairing and section with its tags. T3 themes declare
their allowed ranges against it; T4 chooses from it. Nothing is chosen in T2 itself.

## 3. Sub-parts and order

| Part | Delivers |
|---|---|
| T2a | Motif packs (about 30), the five new placements in the kit, the pack sanitiser checks. |
| T2b | 4 button styles, 3 frames, the motif icon slot, the font pairing list, the palette proposer. |
| T2c | About 12 business sections with manifests, and the identity catalog. |

T2a and T2b can be built in parallel; T2c last (its catalog references T2a and T2b).

## 4. Tests and evidence

- Kit (Jest/JSDOM): each placement renders from a pack, stays `aria-hidden`, never lands on a protected element,
  and is removed under reduced motion; stores without packs render exactly as before (existing suites stay green).
- Pack validation: every pack passes the sanitiser, respects the size limits and declares valid placements.
- Buttons and frames: new DNA values are accepted by `source-dna.ts`, carry the contrast guard, and render in the
  scorecard capture.
- Palette: unit tests on fixed images (a logo, a product photo, neither) with contrast asserted.
- Sections: every section renders, validates and compiles in the React pipeline (`source-next.spec.ts`) at 390 and
  1280, with screenshots reviewed.
- Catalog: a test regenerates it and fails when it is stale.

## 5. Out of scope

Choosing the identity per store (T4), the eight themes (T3), the Studio gallery (T5), and paid AI drawing
(packs are drawn once as part of this work; the runtime never calls a model).
