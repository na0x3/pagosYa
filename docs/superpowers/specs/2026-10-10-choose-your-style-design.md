# Choose your style, and why Boosterpack sites feel better

Status: draft proposal, 2026-10-10. Decisions at the end are the owner's.

The owner recorded Boosterpack's builder (`boosterpack.xyz/create`, step 6 of 6, "Choose your style") and asked two things: why their sites feel much better and less repetitive than YAPI's, and how to give pagosYa the same step, where YAPI proposes designs that fit the business and the merchant picks one before the whole store is built.

## 1. What their style step does

- Four options, each a **real rendered homepage hero** using the merchant's own name, copy and logo, not a template thumbnail.
- Each option has a **name** ("Titular de Liquidez", "¡Ya! Energía", "Libro Mayor", "Taller de Barrio") and its **font pair** (Bricolage Grotesque / IBM Plex Sans, Unbounded / Figtree, Newsreader / Source Sans 3, Young Serif / Hanken Grotesk).
- **Preview** opens the full page beside a panel:
  - **Vibe**: one paragraph ("an editorial, cover-of-a-novel confidence… oversized headlines in deep ink blue on warm off-white paper, numbers treated as the hero").
  - **Inspiration**: concrete moves taken from the business ("invoice amounts and 30/60/90-day terms set as giant display numerals", "one ink blue used only when an offer appears", "thin rule lines borrowed from invoice layouts as section dividers", "the exclamation mark in PagosYa! enlarged as a mark").
  - **Typography**.
- Only after the pick does it build the site. The inputs it collected earlier (step list collapsed as "Your inputs") include the **logo**.

## 2. Why theirs feel better: what we measured

Nine live Boosterpack sites (Yoko, De Salopette, Kasette Koffie, Le Bal Infernal, NORD, Marine Flow, Glamping Tago, Plant A Pizza, Viggo's) were loaded in a browser and their pages inspected. They were compared with YAPI's Estudio Eje builds from the same day (`.yapi-evaluation/signature-2026-10-10/`).

| | Boosterpack (9 sites) | YAPI today |
|---|---|---|
| Favicon | 9 of 9, generated from the logo (`/api/site-favicon/…`) | None. No store has one; nothing in the pipeline makes one |
| Logo in the header | 9 of 9, the merchant's real logo image | 0 of 40 stores in the dev DB have `logoUrl`; YAPI writes the name as text in the body font |
| Fonts | 17 different families across 9 sites, chosen for the theme: Special Elite + Courier Prime (book café), Black Ops One + Teko (barbershop), Chakra Petch + Bai Jamjuree (80s neon café), Staatliches (overalls café), Cormorant Garamond (glamping) | Catalogue of 30 "tasteful modern" families with no typewriter, stencil, techno, script or condensed-display group. Both Eje runs chose Instrument Serif + Instrument Sans |
| Real facts | 8 of 9 show a Google rating with a count ("4.5/5 Google rating (1255 reviews)"), plus founder names, prices, address, even the nearest tram stop | No source of facts; the brief forbids inventing them, so copy stays generic ("Pilates reformer en grupos reducidos") |
| A theme from the story | Committed hard: Kasette's owner had a yellow Walkman at six, so the site is 80s neon chrome; De Salopette means "overalls", so the site has workwear stitching, hard offset shadows and hazard stripes; Le Bal Infernal is typed on a typewriter with library-stamp borders | The signature now finds a real idea ("the old printing press and Carla's dancing"), but the device ended up as thin alignment lines around one photo |
| Photos | The business's own: interior, owners, storefront, products | Estudio Eje and pilts show the same photo set (studio shots, the "Pilates Brunch" poster, the olive top), so two different stores look like the same studio |
| Business data for Google | schema.org type on 6 of 9 (`SportsActivityLocation`, `Restaurant`, `LodgingBusiness`…) | Present (5 JSON-LD blocks in the Eje build) |
| Languages | Language switch on 7 of 9 | Spanish only |

### What they do *not* do better

The repetition you sense is not in the structure. Every Boosterpack site uses the same skeleton: hero, scrolling band, story with a tilted photo and three numbers, three or six cards, menu or prices, reviews, contact. All nine have the marquee and the small labels above headings, the same habits YAPI's habit check tries to remove. They use 1 to 4 animations each. Visitors don't notice the skeleton; they notice the theme layer on top of it.

### So the gap is

1. **Identity assets**: a real logo and a favicon on every store. Without them a store looks unfinished in the first second, in the browser tab and in the header.
2. **Fonts**: theirs come from all of Google Fonts and are picked for the theme; ours come from 30 similar families, so every store ends up in the same two or three.
3. **Facts**: real ratings, people and places make each site read as one specific business.
4. **Commitment to one theme**: the whole site leans into one idea, typography included, rather than adding a small decoration.
5. **Photos**: partly a testing artefact. Our test stores share one photo set.

## 3. Proposal

Ordered by how much each one changes what a merchant sees, with the smallest effort first.

### A. Logo and favicon on every store

- Studio asks for a logo when a store is created (optional, like Boosterpack's input step).
- With a logo: it goes in the header, and the platform makes the favicon from it (square crop on the brand background, PNG and ICO sizes).
- Without a logo: YAPI draws a **typographic logo**, the store name set in the chosen concept's display font and colour, saved as SVG. The favicon is the first letter (or the mark) in that font on the brand colour.
- The platform serves the favicon for every store, YAPI-built or not, so no store ships without one.

### B. A themed font library

- Add about 30 to 40 self-hosted families grouped by mood, so a concept can ask for a mood and get a real choice:
  - typewriter: Special Elite, Courier Prime
  - stencil and military: Black Ops One, Stardos Stencil
  - techno: Chakra Petch, Bai Jamjuree, Orbitron
  - condensed display: Staatliches, Teko, Barlow Condensed
  - elegant serif: Cormorant Garamond, EB Garamond
  - rounded and friendly: Spinnaker, Fredoka
  - script and hand: Caveat, Kalam
  - slab: Zilla Slab, Roboto Slab
  - grotesque: Hanken Grotesk, IBM Plex Sans
- Each family keeps its licence file, as today.
- The planner chooses a font pair per concept, and each of the four options must use a different pair.
- **Why:** it's the single largest visual difference measured above, and it costs no model time.

### C. "Elige tu estilo" in Studio

1. The merchant gives the brief: story, logo, photos.
2. The design planner, which already invents three concepts per store, makes **four** concepts that fit the business and its theme. Each concept carries:
   - a **name** (two or three words in the merchant's language)
   - its **font pair**
   - its **palette**
   - a **vibe** paragraph, from the signature's idea
   - three to five **inspiration** bullets, from the signature's device and vocabulary
3. Each concept is shown as a **rendered hero** with the store's real name, logo, copy and one photo, in its own fonts and colours.
   - Recommended: the model writes the four heroes in parallel, one small call each, so they look like real designs.
   - Cheaper fallback: a fixed hero layout filled from each concept's fonts and colours.
4. **Preview** opens the hero full size with the Vibe / Inspiration / Typography panel beside it.
5. The merchant picks one, or chooses "Elige tú" and YAPI picks. The chosen concept is saved, and YAPI builds the whole store from it.
6. The whole concept (fonts, palette, layout, signature) must reach whichever builder writes the store. With `YAPI_SEP5_AUTHOR=1`, Sep-5 currently receives only the signature (commit 615219e1). It needs the fonts and palette too, or the store won't match the chosen card.

The planner already selects a concept and can resume from a saved design (`retainedDesign` in `source-generation.service.ts`), so step 5 reuses an existing path. The new parts are the four-concept output, the hero renders, and the Studio screen.

### D. Real facts (already queued)

- Ask the founder story in onboarding: who, where, since when, one thing only this place does.
- Read the Google rating, review count, hours and address when the merchant gives a Google Maps or Instagram link. This is the "real business facts" sub-project queued after the signature work.

### E. Testing

Give each test store its own photos. Otherwise any comparison between stores will keep looking repetitive, whatever YAPI does.

## 4. Decisions (owner, 2026-10-10)

1. **Order:** A (logo and favicon), then B (fonts), then C (the style step), then D (real facts). Each part gets its own spec, plan and build.
2. **Hero renders:** model-written, one small call per concept, in parallel.
3. **When the step appears:** new stores and full redesigns. Small edits never show it.
4. **No logo:** YAPI draws a typographic logo (the store name in the chosen display font and colour, as SVG), and the favicon is made from it. The merchant can upload a real logo at any time.
