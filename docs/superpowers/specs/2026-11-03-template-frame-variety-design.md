# Template frame variety — spec (2026-11-03)

Owner 2026-11-03: «¿por qué siento que los templates están muy repetitivos si son 34?» → measured → «hagamos eso» → «la verdad
que ahora está muy bueno pero solo eso, quisiera más variedad». So: **keep today's quality and look rules; add variety only.**
Nothing that works today is redesigned; each template gets its own parts where it now shares the common ones.

## What the measurement found (35 visible themed templates, `preset.layout`)
The homes are not the problem: two templates share on average 20 % of their section types. The **frame** and a handful of
filler sections are:
- footer: `columns` on 27 of 35 (also `bigname` 5, `minimal` 3; `twotone` and `column` exist but no template uses them);
- product card: `classic` on ~24 (18 set + 6 unset → classic); `soft` 5, `framed` 4, `arch` 1, `ribbon` 1;
- product page: `gallery-left` on 20, `sticky-thumbs` 7, `gallery-right` 5, `split-scroll` 2, `editorial` 1 (`stacked`, `fashion`
  unused);
- header: `centered` 14, `links` 7, `split` 5, `search` 5 — acceptable spread;
- the same five filler sections sit on more than half the homes: `story-split` 21, `categories-tiles` 21, `newsletter-split` 20,
  `press-quotes` 20, `products-slider` 20;
- covers: 27 of 35 open on one of three (`cover-stage` 10, `cover-full` 9, `cover-split` 8).
Cart, checkout, account, menus and icons are one shared kit for all (by design; out of scope).

## Goal
Every template looks like its own theme at the places a shopper sees most: the footer, the product card, the product page and the
top of the home. Each theme's parts come from its own reference (`.superpowers/sdd/2026-10-31-34-templates/refs/<theme>-desk.png`,
`-phone.png`; product pages captured where missing), never invented. Owner rules stay: calm colours, normal-size cards, no dark
text-only bands, no text-only sections, no photo groups of 3+ unless asked.

## Targets (a test enforces them: `template-variety.spec.ts`)
- footer: no variant on more than **4** templates;
- product card: no style on more than **4** templates (an unset card counts as `classic`);
- product page: no variant on more than **6** templates;
- no two templates share the same (header, footer, card, product page) four;
- each of the five filler sections on at most **10** homes; no cover on more than **6** homes;
- average home overlap stays ≤ 0.20 (today 0.20).
The measurement script that produced the numbers above becomes the test's helper.

## 1. Footers (Shell `Footer`, `data-es-footer`, CSS in the esencial theme)
New variants, each copied from the themes that have it (names are ours): `mega` (4–5 link columns + contact + socials),
`centered` (logo centred, links in one row, socials, legal), `band` (accent band with the tagline big, links under), `signup`
(a large email signup leading the footer), `wordmark` (store name huge across the bottom, links above), `card` (footer as an
inset rounded card), `split-contact` (left: address/hours/WhatsApp large; right: links), `marquee` (the store name scrolling,
links below; still under reduced motion). Plus the two unused ones (`twotone`, `column`). All keep the information-pages nav
(`data-pagosya-pages`, which also draws the store's social links), the signup slot when the home has none, the legal line,
logo/name. 1280 and 390, no sideways scroll.

## 2. Product cards (library `CardTemplate`, `LIBRARY_CARDS`)
New styles: `overlay` (name and price over the photo), `line` (no box: photo, then name — price on one line), `portrait` (3:4,
add button on hover; always visible on touch), `swatch` (colour dots when the product has colours), `badge` (corner badge from
real data only: new/sale), `polaroid` (white frame), `round-add` (round + button on the photo corner), `list` (horizontal row,
for small catalogues). Every card keeps the kit's slots (photo, second photo, name, price, add, sold out, ribbons).

## 3. Product pages (`variants.pdp`)
Use `stacked` and `fashion`, and add `centered` (one big photo centred, info below in a narrow column), `grid-2` (photos in a
two-column grid, sticky info beside), `carousel` (full-width photo slider, info below). Assign so no variant passes 6.

## 4. Homes
- Each template keeps its sections, but the five fillers are cut to ≤ 10 homes each: where the theme's reference shows a section
  of its own in that place, use it (19 section types today are used by one template only; new ones only when the reference has
  something the library lacks).
- Covers: move templates to the cover their reference actually has (`cover-ribbon`, `cover-shoppable`, `statement-reveal`,
  promo covers…) until no cover passes 6.

## 5. Reaching stores
- New stores and template switches («otra plantilla», «cámbiala a Tacón») get the new frame (the template's Shell, library and
  CSS are assembled fresh).
- Existing stores keep their files (their Shell is a copy): not migrated automatically. Owner decides after the build whether to
  refresh existing stores' frames.

## Order
1. Ledger: for each template, from its reference — footer, card, product page, cover — with the variant each will use (within
   the caps): `.superpowers/sdd/2026-11-03-template-frame-variety/ledger.md`.
2. The variety test (fails today).
3. Footers → cards → product pages → homes/covers, batches of ~6 templates; each new part rendered at 1280/390 next to its
   reference, checked, then the templates switched to it.
4. Variety test green; template contract + motion suites green for every template; live: one new store on 3 different templates
   through the chat, screenshots side by side for the owner.

## Out of scope
Cart, checkout, account pages, menus and header icons (shared kit); migrating existing stores (§5); new templates.
