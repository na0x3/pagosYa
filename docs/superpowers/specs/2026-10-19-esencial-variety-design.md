# Esencial variety, brand and personal touch — design (Spec A)

Date: 2026-10-19. Status: designed with the owner in conversation, section by section. Builds on
`2026-10-19-master-template-design.md` (Esencial, built and live-checked ..dfcf0cfb). Spec B (popup + suggestions) follows.

## 0. Why

Owner, after the live check: "now every store is the same… I want every store different and personalized for each
business". Measured: three stores from three businesses got the same font pair and two the same palette, and every
store has the same sections in the same order. Owner decisions:

- Both: **variants chosen at creation** (data only, instant, cannot break) **and an automatic personal touch** in the
  background (agent design edits).
- **As many variants as possible, most randomness**, and the **merchant's brand carried into the site**.
- The randomness is the platform's dice among Esencial's finished variants (not the old free-design draws, which stay off).
- Walkthrough stores skip the conversation step (faster creation).

## 1. Faster creation

A new shop whose request comes from the walkthrough (`setupAction: 'generate'`, revision 0, the store has an
`onboarding` record) skips `SourceConversationService.decide` and goes straight to the master path: the onboarding
record already holds what the decide call would extract. Chat-only new stores keep the decide call. Target: under
25 s from the walkthrough's last step to the saved store on the ChatGPT plan (fill call + assembly).

## 2. Variants

Every part of Esencial gets finished, tested variants, chosen by data in `store-data` (`variants` object), rendered by
the same components (a `switch` on the variant id), styled by `data-es-*` attributes. No variant adds code at creation.

| Part | Variants (ids) |
|---|---|
| Header | `classic` (☰ + name), `centered` (logo centred, icons right), `links` (links visible on desktop), `split` (links both sides of a centred logo), `minimal` (name + cart only) |
| Announcement | `plain`, `ticker` (slow scroll, pauses on hover/focus, still under reduced motion), `chip` |
| Hero | `full`, `split-left`, `split-right`, `framed`, `collage` (3 photos), `type` (giant headline on colour), `strip` (3-photo strip under the headline), `poster` (centred, logo above), `arch` (arched photo), `stack` (headline over a photo card) |
| Product grid | `grid4`, `grid3`, `feature` (first product large), `strip` (horizontal scroll), `list`, `masonry` |
| Product card | `plain`, `framed`, `overlay` (name over photo), `hover2` (second photo on hover), `bar` (quick-add bar under the photo) |
| Product page | 6 layouts × 3 below-the-fold orders (§2b) |
| Story | `split`, `quote`, `overlay`, `pair` (two photos), `timeline` (3 steps), `note` (founder note with signature line) |
| Values | `numbered`, `icons` (Lucide), `cards`, `line` (one big sentence), `checklist` |
| Closing | `dark`, `accent`, `photo`, `newsletter` (email field, wired to the subscriber list in Spec B; until then a link to contact) |
| Footer | `columns`, `bigname`, `minimal`, `twotone` |
| Business sections (0–2) | `process` (3 steps), `pick` (one product + reason), `sizes` (table), `gallery` (2–4 photos), `faq` (3–4), `visit` (city, hours, WhatsApp), `materials`, `howto` (how to order), `team`, `quotes` (only press/quotes the merchant gave) |
| Look details | button `pill`/`soft`/`square`/`underline`; corners `round`/`soft`/`sharp`; density `airy`/`regular`/`compact`; texture `none`/`paper`/`grain`/`lines`; photos `natural`/`rounded`/`framed`/`duotone` |
| Palettes | 16 (the 8 of Esencial + 8 new: two bold, one pastel, one earthy, one monochrome warm, two dark, one bright) |
| Font pairs | 14 (the 8 + 6 new pairs using the existing OFL catalogue plus up to 4 new OFL families under the 600 KB cap) |

Business-section content comes from the fill call (Spanish, merchant facts only); a section with no honest content is
not chosen. `quotes` and `team` require merchant-given facts.

## 2b. Product pages differ by store and by product (owner, 2026-10-19)

Owner: "the product page is always the same for all of the products". Two fixes:

1. **Product-page variants in the dice** (per store): layout `gallery-left` (today), `gallery-right`, `stacked`
   (full-width gallery, info below), `sticky-thumbs` (vertical thumbnails), `editorial` (big title band above the
   gallery), `split-scroll` (gallery scrolls, info stays). Plus below-the-fold order: `story-first`, `details-first`,
   `reviews-first`. Same KitSlot names in every variant; only the arrangement and Esencial's CSS change.
2. **Per-product content** (each product page different): the existing `ProductPageWriterService`
   (`apps/api/src/product-content`, spec 2026-10-09) writes each product's highlights (≤6, Lucide-style icons) and
   content blocks (story / versus / faq / details / features), with its rules against invented numbers, guarantees and
   reviews. Today it runs after normal YAPI builds but **not after a master-template build** — the live-check product
   pages were bare. It is triggered in the background after `applyMaster` saves (for every product of the store) and
   for products created later, as for other stores. Esencial's product page renders those blocks in the order the dice
   chose.

Login, account, cart, checkout, search and the information pages come with every store as today (kit pages and the
checkout app), styled from each store's palette, fonts, corners and button shape.

## 3. Randomness (the platform's dice)

1. The fill call returns the **character**: `tone` (calm/bold), `temperature` (warm/cool/neutral), `lead` (photo/text),
   plus `exclude` (variant ids that do not fit, e.g. `type` hero excluded when the photos are strong, `sizes` when nothing
   has sizes) and up to 2 business sections with their content.
2. The platform rolls every part among the allowed variants, palettes and font pairs that match the character,
   **seeded by the store id** (same store → same roll), and **avoids the combination of hero + palette + font pair used
   by the last 6 master stores** created (re-roll up to 20 times; the least-used wins after that). Look details roll
   independently.
3. Flag `YAPI_ESENCIAL_DICE` (default on). Off: the fill call's own picks are used (today's behaviour).
4. A content edit can name a variant ("hero con foto a la izquierda") — the merchant's words beat the dice.

## 4. Brand into the site

Priority, highest first:

1. **Confirmed brand profile** (`BrandProfileService`, confirmed facts only): `background`/`foreground`/`accent`/`surface`
   become custom colours (contrast-checked, ink and muted corrected as today); `headingFontUrl`/`bodyFontUrl` are used
   when present (bundled like other brand fonts); `voice`, `headlineExamples` and `avoid` go into the fill prompt; one
   confirmed brand quote may fill the `quote` story or the closing line.
2. **Logo colours**: when the store has a logo and no confirmed colours, `proposeStorePalette({ logo, photos })`
   derives the palette (custom colours) instead of the dice palette.
3. **Logo placement**: header and footer show the logo when present; `poster` hero shows it above the headline.
4. **Merchant words**: the walkthrough's what/story/answers feed the copy (as today).

## 5. Personal touch (background)

- After a new master store is saved, a background job starts (flag `YAPI_PERSONAL_TOUCH`, default on). The chat shows
  "Le estoy dando un toque personal a tu tienda…".
- The agent makes 2–3 bounded design edits for that business under `MASTER_EDIT_RULES` plus a personal-touch brief:
  one section the variants do not cover, one signature detail, at most one copy pass on a generic section. It may not
  remove sections, change store-data's structure, invent facts/prices/reviews, or touch cart/checkout logic.
- Then the layout check (1280/390) with one repair round. Success saves the next revision with label «Toque personal».
  Failure keeps the first version silently.
- Runs once per new store, never on later edits; budget = one design job; ~2–4 min on the ChatGPT plan.
- Must not collide with a merchant edit: the job takes the store's normal chat-job lock; if the merchant sends a
  message first, the personal touch is skipped.

## 6. Testing and order of work

1. Faster creation — routing test (walkthrough store never calls decide; chat-only does).
2. Variants in four batches (header/announcement/hero → grid/card/story/values/closing/footer → product page →
   business sections and look details). Product writer triggered after a master build: test that every product gets
   its blocks and that a failure leaves the page as it is. Each variant: renders, no horizontal overflow at 1280/768/390, contract passes, Lucide only, no emoji.
   QA screenshots per batch.
3. Dice and brand: same store → same roll; no repeat of the last 6 combinations; character exclusions respected;
   brand colours beat the dice and pass contrast; logo palette when no brand colours.
4. **STOP: screenshots of 6 stores (2 bookshops, 2 coffee, 2 print shops) for the owner's OK.**
5. Personal touch: runs once, saves «Toque personal», first version kept on failure, skipped when the merchant edits first.
6. Live check with the owner's photos (3 stores, timed, screenshots of both versions).

Out of scope here (Spec B): store popup, YAPI suggestions.
