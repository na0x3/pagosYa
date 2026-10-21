# John Smedley sections — design

2026-10-21 · part 4 (after photo zoom → fashion look → dropdown menu). Approved in chat 2026-10-21.

## Why

The owner sent the two-photo campaign band from johnsmedley.com/row and asked for «in general for every store randomly
sections like these … learn something from this site». Study of the home page (2026-10-21, top to bottom): full-photo
hero with a small centred serif title and two outline buttons; «New In» with the title in a narrow left column and three
cards right; the two-photo campaign (twice); «Shop by Colour» palette strip; category × colour explorer beside a large
photo; a capsule block (tall photo left, text + staggered cards right); a coloured origin band with one framed photo;
a journal; a footer of full-bleed artwork behind a narrow centred paper column.

What reads as premium: restraint (small type, serif headings, a lot of air), the floating boxed header, dashed outline
buttons, a thin rule above each section title, titles in their own left column, no badges or promos, colour used once.

## What is added (Esencial, every store, by the dice)

### New home sections (part `feature`: 0–2 per store)

| id | Looks like | Needs (checked before it can roll) |
|---|---|---|
| `duo` | Two full-height halves, each a lifestyle photo with a serif title and an outline button low and centred; each half links somewhere different | 2 distinct lifestyle photos (hero excluded) |
| `explore` | Left half: category chips, title «<Categoría>», a product rail (scroll-snap) and «Ver todo»; right half: one large photo. Choosing a chip swaps the rail and the title. When products have colours, colour chips filter the rail too | 2+ categories with products, 1 photo |
| `capsule` | Tall lifestyle photo left (sticky on desktop); right: a paragraph, a button, 2–3 product cards at staggered heights | 1 lifestyle photo, 2+ products |
| `origin` | A solid band (accent or deep) with one centred framed photo, a serif caption and an underlined text link | 1 photo; caption uses a real fact (city, «Hecho a mano en …») — no fact → caption from the story title |
| `palette` | Short intro paragraph and a row of solid colour tiles with names; a tile opens the catalogue filtered by that colour | fashion stores only; 6+ distinct colour values with a hex in the products |

- Links: a half or tile links to a category (`productos.html?categoria=<id>`) when the store has categories, else to
  `productos.html`. `duo` uses two different categories when it can.
- Photos come only from the store's own uploads (hero, story, product photos), each used once on the page where possible.
  No section shows a group of 3+ photos (owner rule, 2026-10-15): `palette` tiles are solid colours, not photos.
- Placement: `duo` after the catalogue, `explore`/`capsule` after the story, `origin` before the values; two rolled
  sections never sit next to each other.

### New variants of existing parts

- `grid: 'side-title'` — the products section title, a thin rule above it and «Ver todo» in a narrow left column (about a
  quarter), three cards on the right; under 900 px the title goes back on top.
- `header: 'boxed'` — the header as a centred white box (about 640 px wide) floating over the top of the hero; on phones a
  full-width bar.
- `button: 'dashed'` — 1px dashed outline buttons with square corners (the John Smedley «Shop Now»).
- `footer: 'column'` — a narrow centred paper column (newsletter line, two link columns, contact) on a full-width band of
  the store's hero photo (darkened) or, without one, its texture/pattern colour.
- Section titles get a thin rule above them under `density: airy` and `grid: side-title` (a small CSS change, no new part).

## Rolling

- `feature` is a new dice part: the roll picks 0, 1 or 2 ids from those whose needs the store meets, seeded by the store
  like every other part (`rollVariants` in `source-master-dice.ts`); `PHOTO_NEEDS` gains `duo: 2`.
- Fashion stores are weighted toward `duo`, `explore` and `palette` (picked first when they fit) but still random;
  other stores never roll `palette`.
- The fill call may exclude a section for the business (`feature:origin`), honoured for at most half, like other parts.

## Words

- The Esencial fill call gains short copy for the rolled sections only: per half of `duo` a title (≤ 28) and a button
  (≤ 18), the `capsule` paragraph (≤ 220), the `origin` caption (≤ 60) and link (≤ 24), the `palette` intro (≤ 220).
  Spanish, the store's voice, no invented facts (no years, awards or places that are not in the merchant's information).
- Missing copy falls back to category names and «Ver ahora» / «Ver colección»; a section never renders empty text.

## Where it lives

- `packages/store-templates/templates/esencial/components/home.tsx` (sections + grid), `Shell.tsx` (header, footer,
  button), `styles/globals.css`, `template.json` (`variants.feature`, new ids under grid/header/button/footer).
- `apps/api/src/storefront-source/source-master-dice.ts` (needs, weighting), `source-master.ts` (copy caps + read),
  the fill prompt where the copy fields are listed.
- The `explore` rail uses the kit catalogue mount with `data-category` (and a colour filter attribute if the kit lacks one
  — added in the kit) and must re-render when the chip changes the attribute.

## Testing

- Dice: needs respected (no `duo` with one photo, no `explore` under 2 categories, no `palette` for non-fashion), 0–2
  picks, deterministic per seed, weighting for fashion.
- Esencial template spec renders each section with full data and with the fallbacks; copy caps enforced.
- Kit jsdom: `explore` chip switches the category and re-renders the rail; colour filter.
- QA screenshots of 6 stores (3 fashion, 3 other) desktop + 390 px, including NOA VARGAS with `duo` forced.

## Out of scope

Journal section (stores have no articles), video heroes, the illustrated artwork footer (needs art the store does not
have), per-section merchant toggles in the dashboard.
