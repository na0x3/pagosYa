# Frame and hero draw — every store gets its own header, cart, footer and first screen

Date: 2026-10-10 · Branch: `feature/store-page-architecture` · Status: approved in conversation, awaiting spec review

## Why

The owner: "i want everything randomized, i want sites to not look ai, or repetitive", pointing at the detfs header
(wordmark with a dot left, links right, divider, "Selección" pill with a count) and at boosterpack.xyz.

Measured 2026-10-10 over every dev store with an authored `<header>` (7):

| | stores | logo first | "Buscar" text link | "Mi cuenta" text link | cart counter | centered |
|---|---|---|---|---|---|---|
| since 10-09 | 5 (detfs, hutz, DEFS, Pulso Pilates, Huerta Viva) | 5 | 5 | 5 | 5 | 0 |
| before | 2 (Cafece, pilts) | 2 | 0 | 0 | 2 | 0 |

Two causes:

1. `SEP5_STORE_SHELL` (`apps/api/src/storefront-source/design-engine/sep5-author.ts:115`) lists the header in one
   order — store name, primary navigation, `Buscar`, `Mi cuenta`, cart with `[data-cart-count]` — and the model
   reproduces the list literally. Every store since that paragraph landed has the same header.
2. The model cannot be random. Prose asking for distinctive work is already in the prompt (Sep-5 authorship
   language, `SEP5_BOLD_DEFAULT`, signature), and the recent stores still converge.

## Owner decisions (2026-10-10)

- Variety comes from the platform rolling dice, not from the model (option "Platform rolls dice").
- First round covers the frame and the hero: header layout, cart/account presentation, footer, first screen.
  Body sections, marquee/eyebrow habits and photo treatment are a second round.
- Catalogue is mixed, bold welcome: about half familiar store patterns, half bold ones, all usable on a phone.
- Approach A: a drawn brief YAPI must build in its own style. Not platform-built headers (B), not inspiration
  only (C).
- Consistent with the standing rule "add capability, never a grammar": the catalogue widens what YAPI is told
  to build; it never constrains styling.

## Design

### 1. Catalogue and draw — `apps/api/src/storefront-source/design-engine/frame-draw.ts`

Four lists. Every entry is `{ id, bold: boolean, desktop: string, phone: string }`, the two strings being one
plain instruction each (English, like the rest of the author prompt).

- **header (10)** — familiar: `centered-split` (logo centred, menu split either side), `menu-button` (logo left,
  a single menu button opens the navigation), `info-bar` (one-line info bar above a simple row), `stacked`
  (logo above a centred menu row), `shrinking` (compact sticky bar that tightens on scroll); bold:
  `wordmark-band` (the store name as a giant full-width band, menu and cart on a thin line below), `side-rail`
  (vertical rail on the left edge with name, menu and cart), `bottom-pill` (floating pill of menu, shop and
  cart at the bottom of the screen), `overlay` (name and a menu button; the menu opens full-screen),
  `reveal` (header hidden until the shopper scrolls up).
- **cart (6)** — `word-count` ("Carrito (2)"), `icon-dot` (icon with a dot when not empty), `accent-tag`
  (a tag in the store's accent colour), `own-word` (the store's own noun, e.g. "Tu canasta"), `underline-link`
  (text link that underlines), `round-icon` (round icon button). Account follows the same treatment.
- **footer (6)** — `wordmark-signoff`, `directory` (multi-column), `quiet-line`, `contact-card`,
  `statement-band`, `photo-echo` (repeats the hero photo).
- **hero (8)** — `full-bleed` (photo with type over it), `split`, `type-only` (no photo), `collage`,
  `single-product`, `statement-strip` (statement plus a photo strip), `offset-frame` (framed photo, offset
  text), `slow-slideshow`.

`drawFrame(random: () => number, recent: FrameDraw[], available): FrameDraw` returns one id per list.
- Header and hero skip ids used by any draw in `recent`; when every id is taken it picks the least-used.
  Cart and footer are drawn uniformly without the repeat rule: their lists are short and a repeated cart
  style is not what makes stores look alike.
- Entries that need material declare it and are skipped when the store lacks it:
  `{ needs?: 'photos2' | 'photos3' | 'product' | 'facts' }`. `collage` and `statement-strip` need 3 photos,
  `slow-slideshow` and `photo-echo` need 2, `single-product` needs a product with a photo, `info-bar` needs a
  real fact from the brief (delivery area, opening hours, pickup). `drawFrame` receives these counts as
  `available: { photos: number; products: number; facts: boolean }`.
- The info bar and every other entry use only facts from the brief: never an invented "envío gratis",
  discount or deadline.
- Bold and familiar entries are equally likely.
- Every entry's `phone` string keeps the invariants: cart and menu within one tap, store name links home,
  Buscar and Mi cuenta reachable (in the header or its menu).
- Pure and seedable; no I/O.

### 2. What YAPI is told

- `frameDirection(draw)` renders a `FRAME AND HERO:` paragraph from the four entries: build this structure,
  style it in the store's own language, then the phone line of each.
- Sep-5 author: new optional `frame?: string` input on `sep5AuthorPrompt`, placed with signature and fonts.
  Absent or blank keeps the prompt byte-identical (the existing pinning test guards this). `sep5ReviewPrompt`
  inherits it.
- Agent builder: `agentInstructions` (`agent/agent-prompt.ts`) receives the same paragraph for new stores and
  redesigns.
- Store shell: when a frame is given, `SEP5_STORE_SHELL` is replaced by a requirements-only version — "the
  header must contain a link home, the primary navigation, `<a href="buscar.html">Buscar</a>`,
  `<a href="#" data-pagosya-account="login">Mi cuenta</a>` and a cart button containing `[data-cart-count]`;
  where they sit and how they look comes from FRAME AND HERO". The footer `data-pagosya-pages` sentence is
  unchanged. Without a frame the current paragraph is used unchanged.
- Self-review: one added question in the screenshot self-review — does the header and hero match FRAME AND
  HERO; if not, fix it. Advisory, like the signature tells check: never a verify finding, never fails a build.
- Merchant requests win: when the instruction or brief names a header or hero choice (e.g. "logo centrado",
  "sin foto en la portada"), the matching part of the draw is dropped from the paragraph. Detection is a small
  keyword check alongside `sourceAsksForRestraint` (`source-motion.ts:27`); when unsure it keeps the draw.

### 3. When it draws, where it lives

- Draws only for a new store or a full redesign (the same condition that runs the planner / Sep-5 author).
  Edits read the saved draw back and pass the same paragraph, so the frame survives later changes.
- Saved as `frame-draw.json` in the source project files: `{ "header": "wordmark-band", "cart": "own-word",
  "footer": "statement-band", "hero": "type-only" }`. Unknown or missing ids are ignored on read (no paragraph
  for that part).
- Recent draws: the 6 most recent other stores' `frame-draw.json` from the last 30 days, queried like the
  existing recent-design lookup in `source-projects.service.ts` (`jsonb_array_elements` over
  `StoreSourceVersion.snapshot->'files'`). A failed query draws with no history and never blocks a build.
- Kill switch: `YAPI_FRAME_DRAW=off` → `app.yapiFrameDraw` false → no draw, no file, prompts byte-identical to
  today. Default on, like `yapiSignature`.

## Testing

Unit (jest, `apps/api`):
- `drawFrame` returns a valid id from each list; with a seeded random it is repeatable.
- With recent draws covering all but one header, it returns that one; with all covered, the least-used.
- A store with no photos never draws `collage`, `statement-strip`, `slow-slideshow`, `photo-echo` or
  `single-product`; a brief with no facts never draws `info-bar`.
- Every catalogue entry has non-empty `desktop` and `phone`, and every `phone` mentions the cart and menu.
- `sep5AuthorPrompt` with `frame` contains `FRAME AND HERO:` and the requirements-only shell, not the ordered
  shell; without `frame` the prompt is byte-identical (existing pin).
- A merchant instruction "logo centrado" drops the header part of the paragraph; "sin foto en la portada"
  drops the hero part.
- `frame-draw.json` round-trips; garbage content yields no paragraph and no throw.
- `YAPI_FRAME_DRAW=off` produces no draw and no file.

Live (asks the owner first — it spends their ChatGPT plan): generate 3 stores from the same brief. Pass when
the 3 screenshots show 3 different headers and 3 different heroes, and on a 390 px phone each keeps a working
cart, Buscar and Mi cuenta. Re-run the header table above over all stores.

## Not in this round

Body sections and their devices (marquee, eyebrow-above-every-heading, numbered lists), photo treatment, type
pairing, and a Studio "Volver a tirar" button. The second round reuses `drawFrame`'s shape for the body.
