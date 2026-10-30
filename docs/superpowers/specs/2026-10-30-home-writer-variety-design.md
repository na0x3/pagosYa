# Home writer variety: page directions and an animated look — design

Date: 2026-10-30 · Status: approved in brainstorming (approach A), awaiting spec review · Branch: oct24-clean
Builds on: `docs/superpowers/specs/2026-10-29-home-page-writer-design.md` (saved as tag `benchmark/home-writer-2026-10-30`)

## Why

The owner approved the home writer on 2026-10-30 («its really good, i find them a bit repetitive») after four live stores (NOA 3
q8wz17th, Gramiyaa pctccx5r, PEPPA 2 uj7uomti, DooBoo 2 lj25t741).

Every run gets the same instructions, so every home follows one recipe: big serif cover, grid, story, values, FAQ, closing. The
owner also wants «more of an animated look» for some stores. The kit already has motion parts the writer is never told about
(`packages/storefront-kit/kit/ui.tsx`): `Hero scrollGrow`, `ScrollScrubHero`, `ParallaxStack`, `ScrollScale`, `ProductShowcase`,
`Statement`, `Marquee`, `EntranceGroup`, `FloatingMedia`. Today the writer knows only `Reveal` and `Parallax`.

Owner decisions (2026-10-30):
- **Approach A:** the platform picks a page direction per store, not the writer.
- **These six directions.**
- **Animated look by brand character plus chance.**

## 1. Page directions

Each direction is a short Spanish brief, 4–6 lines, added to the writer's task. Each one names:
- the cover,
- the section rhythm,
- how type and photos are used,
- what to avoid.

| id | Direction | Cover | Rhythm |
|---|---|---|---|
| `editorial` | Editorial | Giant serif headline over a framed photo | «01 / 04» labels; photo and text take turns; FAQ near the end |
| `producto` | Producto primero | One hero product: big photo, price, add button (`data-pagosya-catalog data-products="<name>"`) | Grid right after the cover, story below |
| `lookbook` | Lookbook | Full-width photo, words over it | Photo-led, few words, large type over photos |
| `bandas` | Bandas de color | Big type on a brand-tinted band | Brand-coloured bands (one accent, no rainbow, owner 2026-10-22) |
| `manifiesto` | Manifiesto | One huge statement, type-led | Marquee band; few photos, each beside words |
| `historia` | Historia | Maker's photo and a short promise | Long scroll: steps with photos, origin, the maker's note |

- **Pick:** seeded by store id. Never a direction used by the last 3 stores that have one; with fewer than 3 such stores, any
  unused one.
- **Fashion stores:** `lookbook` and `editorial` count twice in the draw.
- **Avoid list:** the brief also names the headline fonts and paper colours of the last 6 stores (`recentLooks`), to avoid.
- **All existing rules still hold:**
  - no text-only sections on the plain page
  - no black text-only bands
  - each photo once
  - no group of 3+ photos
  - the grid keeps sort and colour/size chips
  - words as literal JSX

## 2. Animated look

- **Who gets it:** decided once per store from its saved brand character and a store-seeded draw:
  - `bold` tone: animated 3 times in 4.
  - `calm` tone: animated 1 time in 5.
  - unknown character: calm.
- **Animated stores:** their brief adds a «MOVIMIENTO» block. `read_chassis` lists the kit's motion parts with one usage line
  each: `Hero scrollGrow`/`entrance`, `ParallaxStack`, `ScrollScale`, `ProductShowcase`, `Statement` (text fills on scroll),
  `Marquee`, `EntranceGroup`. The brief asks for at least three different motions on the home.
- **Still stores:** they keep `Reveal` and `Parallax` only.
- **Reduced motion:** the kit already stops motion for visitors who ask for reduced motion; nothing new is needed.
- **Check:** one more advice line (never blocking) for animated stores: «la portada animada usa menos de 3 movimientos».

## 3. Saving and reading

- **Brand character:** the first build saves it with the store's master state (tone, temperature, kind) in
  `components/store-data.tsx`. Stores built before this have none and count as calm.
- **The writer's choice:** saved with its revision as `home-direction.json` (`{ "direction": "lookbook", "animated": true }`).
  - The writer's stray-file guard (`SourceChatService.homeWriter`) allows this file.
  - Later stores read the last stores' directions from it, the way `recentLooks` reads fonts and paper.
  - A later run on the same store (e.g. «sigue» after a quota stop) reuses the saved direction.

## 4. What does not change

- The writer's tools, limits, checks and fallback (template home on failure).
- The default-on switch (`YAPI_HOME_WRITER`, `0` turns it off).
- Cost per run should stay about the same: the brief adds about 300 tokens, and the motion list is sent only to animated stores.

## Testing and live check

- **Unit tests:**
  - The pick is the same for the same store and seed.
  - It never repeats the last 3 stores' directions.
  - Fashion weighting.
  - Animated odds per tone, checked over many seeds.
  - Missing character counts as calm.
  - The brief text per direction.
  - `home-direction.json` is allowed by the guard and read back.
- **Live check:** 6 cloned catalogs (the four from 2026-10-29, plus two with photos from `~/Downloads`). Expect at least 4
  different directions and at least 2 animated stores. Record per store: screenshots, minutes and calls. The owner judges
  variety.

## Out of scope

- The token cut, which is planned separately as the next step.
- New kit motion parts.
- The merchant choosing a direction in chat (later, if wanted).
