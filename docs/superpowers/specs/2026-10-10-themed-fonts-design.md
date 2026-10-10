# Part B: themed fonts that every store actually uses

Status: draft for owner review, 2026-10-10.
Programme: `2026-10-10-choose-your-style-design.md` (part B of four). Part A (logo and favicon) is built.

## Why

Boosterpack sites each use a font picked for the business's story: typewriter for a cabaret, stencil for a barbershop, workwear condensed for an overalls brand, a script for a pizzeria. pagosYa stores look alike partly because of type, for two reasons measured on 2026-10-10:

1. **Stores written by the Sep-5 author load no fonts at all.** DEFS and Pulso Pilates both ship `--serif: Georgia, 'Times New Roman', serif` and `--sans: Arial, Helvetica, sans-serif`, with no `@font-face` and no `.ttf` in the project. The planner chose Bodoni Moda for DEFS and Newsreader for Pulso, and neither was ever loaded. The author prompt bans external fonts and never mentions the self-hosted catalogue, so it falls back to system fonts. Every new store is written by this author today (`YAPI_SEP5_AUTHOR=1`).
2. **The catalogue is 30 "tasteful modern" families.** It has no typewriter, stencil, techno, script or chunky display face, so even stores that do load fonts land on the same few serifs and grotesks.

The mechanism to fix both already exists: `withSourceFonts` bundles `assets/<id>.ttf` and its licence for any font a store's CSS references, and the Sep-5 save path runs through it.

## Goals

1. Every authored store loads the display and text fonts its concept chose.
2. The catalogue gains about 20 characterful families, so a concept can pick type that belongs to the business.
3. Nothing changes for stores already saved: their CSS keeps its fonts until a redesign.

Non-goals: merchant-uploaded fonts (already handled by the brand path), web-font CDNs, and changing how the planner picks concepts (done separately on 2026-10-10).

## Design

### 1. The author uses the concept's fonts

`sep5AuthorPrompt` gains an optional `fonts` paragraph, appended like the signature and the bold default (absent: the prompt stays byte-identical to September 5):

> TYPE: The selected concept sets display type in {display family} and text in {text family}. Load them with `@font-face { font-family: …; src: url("assets/{id}.ttf") format("truetype"); font-display: swap; }` and use them for headings and body. Other self-hosted families you may use: {catalogue line}. Never load fonts from another site.

The service fills it from the selected concept's `dna.type.display` and `dna.type.text`, and the catalogue line reuses `SOURCE_FONT_CHOICES`. The self-review prompt carries it too, so a review never strips the fonts.

### 2. About 20 new families

Candidates, every one under the SIL Open Font License in `google/fonts/ofl`. Each is verified before it's added, and dropped if a check fails.

| Personality | Families |
|---|---|
| Typewriter | Courier Prime |
| Stencil | Big Shoulders Stencil Display, Black Ops One, Stardos Stencil |
| Workwear and sports condensed | Staatliches, Teko, Barlow Condensed |
| Techno and retro-future | Orbitron, Audiowide, Michroma |
| Script and hand | Pacifico, Caveat, Kaushan Script, Lobster |
| Chunky and playful display | Bungee, Titan One, Bowlby One, Fredoka |
| Neon and retro | Monoton, Righteous |
| Fashion serif | Cormorant Garamond, Abril Fatface |
| Brutal grotesk | Archivo Black, Dela Gothic One |

Each entry follows the existing pattern in `source-font-catalog.ts`: id, family, role (display, text or both), personality tags and weights. The files go in `packages/storefront-kit/kit/fonts` with `<id>.ttf`, `<id>-OFL.txt`, and a `provenance.json` record of the raw GitHub URL, git blob and SHA-256.

Checks per font (automated in the catalogue spec):
- covers the Spanish characters á é í ó ú ü ñ Á É Í Ó Ú Ü Ñ ¿ ¡, measured with fontkit;
- licence file present and OFL;
- `.ttf` under 600 KB, so one store's two fonts stay light.

### 3. Picking type

`SOURCE_FONT_CHOICES` already tells the planner to "select by the concept, not the fonts every store uses". The new personality tags (typewriter, stencil, script, techno…) make themed picks possible. No per-category rule is added; the planner reads the business and its signature.

The drawn logo and favicon (part A) read `dna.type.display`, so they pick up the new families automatically.

## Error handling

- A concept naming a font missing from the catalogue: the paragraph names only catalogue fonts; anything else falls back to the default pair (Bricolage Grotesque and Instrument Sans).
- A store's CSS referencing a font file that isn't bundled: the existing preflight reports it, and the near-miss repair from 2026-10-10 fixes one-character slips.

## Testing

- Author prompt: the fonts paragraph appears when given, sits before the motion plan, carries into the self-review, and is absent otherwise (September 5 byte-identical).
- Service helper: concept DNA in, the two catalogue fonts out; unknown ids fall back.
- Catalogue: every new entry has its file, licence, provenance with matching SHA-256, Spanish coverage and size limit; the existing "spans very different personalities" test is extended to the new tags.
- Live: one new store built, and its CSS loads its concept's two fonts.

## Decisions for the owner

1. Approve the list above (add or remove families).
2. Approve downloading the font files from `raw.githubusercontent.com/google/fonts` (the source every existing catalogue font came from), checked against their SHA-256 before they're committed.
