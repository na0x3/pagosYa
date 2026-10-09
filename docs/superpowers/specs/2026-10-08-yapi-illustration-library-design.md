# YAPI illustration library

Date: 2026-10-08. Status: design approved in chat by the owner; spec awaiting review.
Related: `2026-09-25-identity-libraries-design.md` (motif packs T2a; this spec builds the missing "T4 chooses a pack" step for YAPI).

## 1. Why

YAPI draws pictures (an ice-cream cone, a spoon, a smiley) by typing raw SVG path coordinates with no reference and no
way to see the result while drawing. The output reads as clip-art. The kit already ships 16 Fluent illustrations and
30 hand-drawn motif packs, but YAPI cannot search the first (thumbnails are injected only when the message literally asks
for artwork, `requestsArtwork`) and nothing ever chooses the second (`loadMotifPack` has no caller).

Goal: when YAPI wants a picture it finds a professionally drawn one, sees it, and places it; it still has full freedom
over layout and shapes.

## 2. Decisions (owner, 2026-10-08)

- **Both looks, YAPI chooses per store:** full-colour illustrations and store-colour line art. Never both families on
  one page.
- **Library first, hand-drawing as last resort** — for pictures only.
- **Pictures vs shapes.** A *picture* depicts something: object, food, drink, animal, person, face, plant, or a symbol
  sticker (heart, star, sparkle). A *shape* is geometry that frames or decorates the layout: borders and outlines,
  offset colour shadows, rounded or arched frames, colour blocks and panels, blobs, wavy lines, stripes, dots,
  dividers. The library rule applies to pictures only. Shapes stay YAPI's own work, CSS first, in the store palette.
- **Motif packs:** YAPI may place any pack drawing in its pages, and may switch a pack on for the whole store (buttons,
  dividers, pattern, empty states). Off unless YAPI chooses it.
- **Approach A:** a search tool with a visual contact sheet, placement by path, auto-bundling. Not a catalogue pasted
  into the prompt; not server-side auto-picking.

## 3. The library

All sources are MIT or in-house, so storefronts need no visible attribution (the licence file travels with the
bundle, as `LICENSE-fluent.txt` does today). OpenMoji is excluded (CC BY-SA: attribution and share-alike).

| Family | Look | Source | Count |
|---|---|---|---|
| `fluent-flat` | colour, flat | Fluent Emoji "Flat" SVG | ~400 subjects |
| `fluent-color` | colour, soft gradients | Fluent Emoji "Color" SVG | same subjects |
| `fluent-mono` | store colour | Fluent Emoji "High Contrast" SVG, rewritten to paint only in `currentColor` | same subjects |
| `motif-<pack>` | store colour | the 30 in-house motif packs, every drawing (~150) | all |
| `fluent-3d` | 3D render, PNG | Fluent Emoji "3D" | ~60 subjects (PNG weight) |

- **Pinned source:** Fluent Emoji at the commit already used in `catalog.json` (`1ffb34c7…`). People use the
  default skin tone.
- **Curation:** a committed include-list `packages/storefront-kit/kit/creative-assets/selection.json` names the
  subjects (food and drink, fashion, beauty, pets and animals, plants and flowers, home, tech, sport, celebration,
  people and faces, symbols). It is grown by editing this list and re-running the import script.
- **Import script:** the existing `scripts/sync-creative-assets.mjs` is extended (dev-time only, network allowed, never
  run by the app): it lists the pinned asset tree, downloads the chosen files, optimises SVGs (svgo, viewBox kept;
  internal ids stay because soft-colour gradients reference them, and `<img>`/mask rendering isolates each file),
  converts High Contrast to `currentColor`, and writes `catalog.json`. 3D PNGs are already 256 px. The 16 subjects
  already shipped keep their current paths (`coffee`, `dog`, `heart`, `confetti`, …). The kit stays offline at run time.
- **Keywords in Spanish and English:** Fluent's own English keywords plus Spanish names and keywords from Unicode CLDR
  annotations (`cldr-annotations-full`, dev dependency of the script only), plus the existing synonym list. "helado",
  "cuchara", "carita feliz" all find results.
- **Catalogue entry** keeps today's shape and adds `subject` (shared id across families, e.g. `soft-ice-cream`),
  `tone` (`colour` | `store`) and `keywords.es` / `keywords.en`. Motif pack drawings are listed as entries of family
  `motif-<pack>` that point at the pack's existing file; nothing is copied.
- **Budget:** the whole `creative-assets` folder ≤ 15 MiB; one SVG ≤ 60 KiB (the importer skips a style that is larger after optimisation); one PNG ≤ 120 KiB. A spec
  enforces it.

## 4. YAPI's tools

### 4.1 `search_illustrations`

`search_illustrations({ query: string, tone: 'colour' | 'store' | null })`

- Returns up to 12 matches as JSON: `path`, `subject`, `family`, `tone`, Spanish description. One result per subject
  per family, best match first.
- Also returns one **contact sheet** image (like `inspect_asset` returns an image): the matches on a light grid,
  each numbered, store-tone art drawn in a neutral ink, so YAPI chooses by sight.
- No match: says so plainly and reminds YAPI it may draw the picture by hand following the fallback guide (§5).
- Agent step label: `Buscó ilustraciones: <query>`.

### 4.2 `set_motif_pack`

`set_motif_pack({ id: <pack id enum> | null })`

- Writes `config.motifPack` from `loadMotifPack(id)` (already sanitised; re-sanitised on save by `source-motifs.ts`).
  `null` removes it.
- The enum lists the 30 pack ids with their Spanish names in the description, so YAPI can choose without a search.
- Returns which placements the pack decorates. `verify` / screenshots show the result like any other edit.

### 4.3 Placing art

- **Colour art:** `<img src="/assets/creative/fluent-flat/soft-ice-cream.svg" alt="">` (decorative pictures get
  empty alt and `aria-hidden`; meaningful ones get a short Spanish alt).
- **Store-colour art:** a new kit component `<Illustration src="…" tone="accent" size={96} />` in
  `packages/storefront-kit/kit/ui.tsx`. It renders a `span` with the SVG as a CSS `mask-image` filled with a store
  colour: one of the `StoreTokens` names (`ink`, `accent`, `onAccent`, `paper`, `surface`) or a store CSS variable
  such as `var(--butter)`, so the line art takes each store's palette. Colour art passed
  to it renders as a plain `<img>`.
- **Bundling:** unchanged mechanism — `withCreativeAssets` already copies any referenced `assets/creative/…` path into
  the snapshot (agent preview included). It learns the new families, adds each family's licence file once, and maps
  `assets/creative/motif-<pack>/<file>.svg` to the pack folder.

## 5. Prompt rules (agent prompt, one short section)

ILLUSTRATIONS (written in English like the rest of the agent prompt):
1. Pictures vs shapes as in §2, with the examples.
2. For a picture: call `search_illustrations` first. Pick one family for the whole page; colour or store tone to suit
   the design.
3. Draw a picture by hand only when the search has nothing usable. Fallback guide: one stroke width per page, round
   caps and joins, store palette tokens only, simple geometric construction on a 24- or 48-unit grid, at most ~12
   paths, no text inside the drawing; check it in a screenshot at real size.
4. Switch on a motif pack with `set_motif_pack` only when the store's subject matches a pack and the design is playful
   enough to carry store-wide decoration; never for a serious or minimal identity.

The existing `requestsArtwork` thumbnail injection stays as is (it now draws from the larger catalogue).

## 6. Errors and edge cases

- An invented or misspelt `assets/creative/…` path is not bundled; the browser check already reports it as
  "Imagen no disponible: …" and YAPI fixes it in the same run.
- `set_motif_pack` with an id that fails to load: tool error in plain Spanish, config unchanged.
- Mask-image art needs same-origin files; the bundled path is same-origin in preview, export and live store.
- A mistyped store-tone path would render an invisible span with no error. `<Illustration>` marks itself with
  `data-illustration`, and the browser check reports "Ilustración no disponible: …" for any path missing from the
  draft.
- Reduced motion: pack behaviours already respect `prefers-reduced-motion` in the kit.

## 7. Testing

- **Catalogue spec:** every entry's file exists, family licence present, sizes within budget, `fluent-mono` and motif
  entries paint only in `currentColor`/`none`, no ids, subjects unique per family.
- **Search spec:** Spanish and English queries (`helado`, `cuchara`, `carita feliz`, `ice cream`) return the expected
  subjects; `tone` filters; limit 12; unknown words return nothing.
- **Tool spec:** `search_illustrations` returns JSON plus a contact-sheet image; `set_motif_pack` writes a sanitised
  `motifPack` and `null` removes it.
- **Bundling spec:** a draft referencing a `fluent-flat`, a `fluent-mono` and a `motif-icecream` path gets exactly those
  files plus licences; an unreferenced asset is not bundled.
- **Kit spec:** `<Illustration>` renders a mask for store tone and an `<img>` for colour art.
- **Capture spec:** a page using `<Illustration>` passes the browser check (no "Imagen no disponible").
- **Live check (owner's ChatGPT plan, ask first):** one YAPI run on the Dacho store asking for ice-cream drawings;
  success = it calls `search_illustrations`, places library art, and the section reads as professionally drawn.

## 8. Out of scope

Image-model generation of new art; a Studio gallery for merchants to browse illustrations; retro-fitting art into
existing stores; changing how shapes are drawn.
