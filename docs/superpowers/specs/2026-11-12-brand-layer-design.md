# Brand layer: every store looks like its brand, not like its template

Date: 2026-11-12. Status: direction approved in chat («yes»), written spec awaiting owner review.
Builds on: the store composer (spec 2026-11-11, on in dev since 2026-11-12 with `YAPI_COMPOSER=1`).
Save point before this work: the commits up to `3c047b60` on `oct24-clean`, env backups in `.superpowers/benchmarks/`.

## Why

The owner, 2026-11-12: «i dont want them to always look like a template i would want more yapi personalization inside of it»,
«different sections each time», «a store that does not have bugs, its pleasing and different from all others».

Today a template store differs from its siblings only in words, photos and, with the composer, which sections it shows. Colours,
fonts, corners, buttons and the photo treatment are the template's own (each of the 15 pooled templates fixes five colours and one
font set), so two stores on Broadcast read as the same store.

## What other AI builders do (research 2026-11-12)

- **Wix Harmony** (2026): the AI writes a Site Profile the user reviews before «Generate»; a Brand panel (palette, fonts, element
  styles) styles every section; the AI picks designer-made components and can also generate new sections that blend with the
  brand; isolated components so one cannot break another; «make it a little different» and per-section Alternative layouts after.
- **Squarespace Blueprint**: a brand personality narrows curated palettes and font pairs; several tested layouts per section.
- **Relume / Framer**: a style guide of tokens first, then layouts built from a component library that follow it.
- **Shopify Horizon**: AI-generated blocks, but only inside what the theme allows.
- Common lesson: uniqueness comes from combinations of tested pieces plus brand tokens; free-written pages drift to generic
  defaults (what failed here on 2026-11-05).

## Rejected, must not come back

- A model writing the whole home or page (2026-11-05 writer on templates).
- Dark text-only bands, text-only sections, loud colours (owner rules 2026-10-22 and 2026-10-29).

## The five parts

Each part has its own plan and ships behind its own switch; the first plan covers parts 1 and 2.

### Part 1: Brand profile («Así veo tu marca»)

After YAPI's intake questions and before the first build, one call to the strong model (the composer's model, sol) reads the
merchant's message, logo, product photos and catalogue, and returns a **brand profile**:

- `personality`: one of `calma`, `juguetona`, `lujo`, `atrevida`, `natural`, `artesanal`, `urbana`, `tecnica`.
- `colors`: `paper`, `ink`, `muted`, `accent`, `deep`. The starting point is `proposeStorePalette` (logo first, then the product
  photos); the model may adjust them to the personality. Code then enforces the existing contrast rules (`source-palette.ts`: ink on
  paper and surface at 4.5:1 or more, text on the accent at 4.5:1) and the calm-colours rule (one accent; paper and muted are light
  unless the personality is `lujo` or `urbana` and the photos are dark).
- `fonts`: one pair from a curated list per personality (4–6 pairs each, taken from Esencial's 105 tested pairs).
- `shape`: `corners` (`square` | `soft` | `round`), `buttons` (`pill` | `box` | `line`), `photos` (`full` | `frame` | `round` | `arch`).
- `idea`: the brand idea already used by the fill prompt («calas», «burbujas»).
- `special`: a one-sentence brief for the brand section (part 4).

The merchant sees it as YAPI's last intake question: a card with the colour swatches, a sample of the fonts and the idea, and
«¿Construyo tu tienda así?». «Sí» builds; any other answer is read as a change to the profile («más oscuro», «sin rosado») and the card
comes back once. A merchant who does not answer within the intake's usual wait gets the profile as proposed. The profile is saved
with the store's brief so later chat edits keep it.

### Part 2: Brand style over the template

The profile replaces the template's look on the first build:

- `look.colors` = the profile's five colours (all of them, not only the accent), `look.fonts` = the profile's pair.
- `shape` becomes three new kit variables (`--es-radius`, `--es-button`, `--es-photo`) that every library and template section
  reads; sections that ignore them today get them added, one section at a time, each checked in the section-fit render.
- What stays the template's own: header and menu layout, product card layout, product page, cart, checkout, the order of the
  template's signature sections.
- Guards after styling: every text-on-colour pair passes contrast in the built page (not only in the palette), and product
  photos keep a light card behind them.

### Part 3: Different sections each time

The composer stays on. Two additions:

- **Different from every recent store, not only its template siblings.** The check that refuses a home too close to another
  (`tooClose`) also looks at the last 20 homes on any template: the same cover type and look, or 60% of the same section order,
  is refused.
- **More tested looks for the most-used sections.** The 8 sections that appear most across the last 100 homes get two new looks
  each (built once, checked in the section-fit render on desktop and phone, then offered to the composer).

### Part 4: One section made for the brand

Behind `YAPI_BRAND_SECTION=1`. From the profile's `special` brief, the strong model writes one section only for this store (for
example Oh Belly's cans dancing across the page, NOA's calla lilies falling across a photo):

- It is isolated: its own component file and a scoped CSS block (`/* bs:<storeId> */`), it reads only the brand's kit variables
  and the store's own photos, no external URLs, no fixed positioning, no inline colours, no scripts beyond the kit's motion classes.
- The composer places it once, never as the cover, never next to the product grid.
- Checks before it is kept: the store builds; the static rules above; a desktop and phone screenshot of the section reviewed by the
  model for broken, unreadable or unfinished parts; up to 2 rewrites. If it still fails, the composer's best library section takes
  its place and nothing of it is saved.

### Part 5: «Otra versión» per section

In the Studio preview, each home section gets «Otra versión»: the next tested look of that section, or another section of the same
role that fits the template, written with one small model call. One click, undoable through the revision history, never touching
other sections.

## Bugs found on the way that this work fixes

- A product without a photo shows an empty card (Oh Belly «Póster Oh Belly», 2026-11-12). The card shows the store's mark on its
  muted colour instead.
- «Usa la plantilla X» in the first message is not always honoured (Pawby asked for Mimo, got Oliva). The named template wins over
  the draw when it is in the pool.

## Budget

The whole first build, profile + composer + brand section, stays under the composer's hard cap of $10 per store. Expected: profile
about $0.30, brand section about $1–2.

## How we know it worked

- The six test stores (Oh Belly, NOA, Pawby, Remolino, BOXY, rhode), each built twice on the same template, look clearly different
  from each other and from their template's gallery picture (owner's call in the local viewer).
- No built home has an empty image, unreadable text, a section wider than the phone, or a text-only band (automated checks on
  desktop 1280 px and phone 390 px).
- The owner says which parts to keep before any part is switched on outside dev.

## Order

1. Parts 1 + 2 (one plan), then a live test on the six stores.
2. Part 3.
3. Part 4.
4. Part 5.

Owner rules carried into every plan: work inline, light checks (one spec file per run, no full tsc), check for running YAPI jobs before
every save under `apps/api` and `packages`, never `sed -i` on API files, never commit `.env`, start the stack with `pnpm dev:chatgpt`.
