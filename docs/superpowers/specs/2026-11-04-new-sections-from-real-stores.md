# New sections copied from real stores (2026-11-04)

Owner 2026-11-03 («hazlo tú»): after the frame variety work, add new section types copied from real stores so homes stop
sharing the same few parts. References captured 2026-11-04 in `.superpowers/sdd/2026-11-04-new-sections/homes/<store>/`
(Kotn, Olipop, Summer Fridays, Lovevery, Tonies, Our Place, Merit, Parachute) with `capture-home.cjs` + `sheet.cjs`.

## The five sections

| id | Copied from | What it draws | Needs (real data only) |
|---|---|---|---|
| `cover-duo` | Kotn hero | Two photos side by side to the edges, the headline across them, one white button at the foot of each photo (e.g. «Mujer» / «Hombre»). | 2 photos, a title; buttons link to a category, a product or the catalogue. |
| `promo-lines` | Olipop «Shop by fiber line» | Two large rounded photo cards, a round sticker on each photo, a title, a line and a button under each. | 2 items with photo; sticker (`value`) only with words/numbers the merchant wrote. |
| `story-sunburst` | Olipop «Made with real ingredients» | A tinted band: words and a button on one side, the photo in a circle ringed by slowly turning accent rays (calm stores: thin rings, no rays). | 1 photo. |
| `perks-rows` | Summer Fridays «Beauty you look forward to» | A photo framed on a striped panel; beside it 2–4 rows: a perk's name, one line, a small pill, an arrow. | 1 photo, 2–4 items; pill numbers must be the merchant's. |
| `before-after` | Common on beauty / cleaning / restoration stores | Two photos stacked in one frame with a handle the shopper drags to compare «Antes» / «Después». | 2 photos, and the merchant's own words mention «antes» and «después»; free compose and «agrega una sección» only (no template demo). |

Rules kept: no text-only section (each has a photo), at most two photos per section (no photo groups), one accent colour
(rays, stickers, pills use `--es-accent`), the product cards stay on a light ground. CSS sits in `/* lb:<id> */` blocks so a
store only carries the CSS of the sections it shows.

## Where they show

Not template-only: YAPI may use them when it composes or adds a section. Templates (each replacing a section that repeats):

- `cover-duo` — Amigos (was cover-stage), Calma (was cover-full).
- `promo-lines` — Estreno, Hoja, Cuero (was promo-pair).
- `story-sunburst` — Sorbo, Pancita (was story-split), Mordisco (was story-overlay).
- `perks-rows` — Grano, Zancada, Pecas (was icon-columns).

Existing stores are not migrated (they get the sections only through a redesign or «agrega una sección»).
