# Lively one-product stores — spec (2026-11-03)

Owner, after the sofa screenshot test: «stores like those i would like kind of a personal touch because i want them more animated
with more life» → «i want like animated button, and etc, those characteristics of this page for example https://nubecorp.pages.dev».
Choices: colour → **YAPI decides per product**; which stores → **one-product stores (Único), on the first build**; approach →
**A: the lively parts are built into Único and the kit, YAPI only writes their words** (a part with no real content is left out).

This does not reverse the Oct-29 rule («i like it better without the personal touch»): it applies to Único only. Other templates
and every store already built stay as they are.

## What nubecorp does (reference, layout and motion only — never its words, logo or photos)
Buttons that lift/squash with a coloured glow; a WhatsApp bubble with a ripple; floating pills with a pinging dot over the hero;
a bobbing multicolour lettered logo; blurred colour blobs drifting behind the hero; a countdown bar; a word marquee with a moving
wavy edge; scroll reveals; a sticky bottom buy bar (photo, selection, price, «Pedir»); a close-up photo with pulsing «+» hotspots;
two rows of benefit chips sliding in opposite directions. Already in our kit/library: countdown (`promo-countdown`), marquees,
wave divider, reveals, colour slider, compare table, benefits around a photo.

## 1. What the shopper sees

### Always on (every Único store, no words needed)
- **Button feel** — `.es-btn` and the kit's add buttons lift 2 px on hover, scale to 0.96 on press, carry a soft glow in the accent
  colour. The product hero's add button pulses gently (every ~4 s) until it has been on screen and scrolled past once.
- **Sticky buy bar** — when the product block (`[data-pagosya-product-page]`) leaves the viewport upwards, a slim bar slides up from
  the bottom: thumbnail, current selection (colour/size), price, the add button (same handler as the page's). Hidden while the
  product block is visible, on the cart/checkout pages, and when the footer is in view.
- **Scroll motion** — sections fade/slide in (existing reveal), band dividers drift as a slow wave (existing wave divider).
- **Corner bubble** — the existing assistant launcher gets a soft ripple. When the store has a WhatsApp number (the one WhatsApp
  checkout uses) and the assistant is off, a WhatsApp bubble (same ripple) links to it instead. Never both.

### Only with real content (YAPI writes it; empty → part left out)
- **Hero pills** — up to 3 short labels (≤ 32 chars) floating over the product photo, each with a pinging dot.
- **Detail hotspots** — section `detail-hotspots`: one close-up photo + up to 3 points (x, y in thousandths, a note ≤ 60 chars);
  tap/click or Enter opens the note, Escape/outside tap closes it.
- **Chip band** — section `chips-marquee`: 6–10 phrases (≤ 48 chars) in two rows sliding opposite ways; each chip carries the
  product's thumbnail.
- **Countdown** — existing `promo-countdown`, only when the merchant's words give a real end date.

### Mood (YAPI picks per product)
- `colourful` — lettered logo: each letter takes a palette colour and bobs (only when the store has no logo image); chip and band
  words cycle through palette colours; two blurred blobs drift behind the hero; bands use pastel tints of the palette.
- `calm` — the same movement in the store's own palette with one accent; no blobs, no multicolour letters or words.

## 2. How it is built and filled

### Kit (packages/storefront-kit)
New general parts, self-hoisting their CSS (like Float/Sticker), switched on by markup, so they cost nothing on stores that do not
use them: `buy-bar` (sticky bar), `button-feel` (behaviour + CSS for the press/glow/pulse), `bubble-ping` (ripple + WhatsApp
bubble rule), `hotspots`, `chips-marquee`. Marquees pause when off screen (IntersectionObserver). All honour
`prefers-reduced-motion: reduce` by standing still. Rebuild the kit and the Studio after kit edits.

### Template (packages/store-templates)
- Library sections `detail-hotspots` and `chips-marquee` in `esencial/components/library.tsx`; `ProductHero` draws `block.pills`.
- Único's `template.json` layout: product-hero (+ pills), benefits, `detail-hotspots`, use cases, steps, `chips-marquee`, reviews,
  FAQ — the two new sections with demo content so the template contract test exercises them.
- Único theme CSS (`/* theme:unico */` in `esencial/styles/globals.css`) gains only the mood switch
  (`[data-es-theme="unico"][data-es-mood="colourful"]`: blobs, letter colours, tints) and stays small — the sheet is already over
  the 180 kB file limit (pre-existing), so all motion CSS lives in the kit.
- `data-es-mood` comes from `variants.mood` (`colourful` | `calm`, default `calm`).

### API (apps/api)
- Section library (`source-section-library.ts`): catalogue entries for the two new sections and for product-hero `pills`; the fill
  that already runs after a new template store is built returns, in the same structured answer, `pills`, the hotspot notes, the
  chip phrases and `mood`. Rules in the prompt: only facts from the listing/screenshot read, the merchant's words and the store's
  delivery/pickup settings; no ratings, awards, delivery times or claims that are not given; anything without a fact comes back
  empty. Pure post-processing drops empty parts and caps lengths.
- Mood: chosen by YAPI from the product and the merchant's words (a cloud sofa, a soda → colourful; a drill, a serum → calm);
  `isPlayfulBusiness` true forces `colourful`. Written to `variants.mood` in the same save.
- Hotspot points: one small vision call (`dialogue.readHotspots`, the conversation model, low effort, same shape as `readListing`)
  on the chosen close-up photo, returning ≤ 3 points with notes; the notes must name what is visible. Runs only when the store has a
  photo the fill marked as a close-up/detail; failure or no points → the section is dropped. This is the only new AI call.
- Later edits use the normal chat and the existing layout edit: «quita el contador», «cambia las frases de la banda»; «hazla más
  tranquila / más colorida» sets `variants.mood`.

## 3. Guard-rails
- Reduced motion → everything still; YAPI's visual check renders with reduced motion, so captures are stable.
- Only `transform`/`opacity` animate; nothing reflows. No moving part covers the price, options or add button; on phones the
  corner bubble moves above the visible buy bar.
- Owner rules hold: no text-only sections (chips carry the product photo, hotspots sit on a photo); no dark text-only bands (bands
  are light tints); no invented claims (empty parts dropped); calm mood keeps one accent.
- Only new Único builds; stores keep their copied template files.

## 4. Testing
- Kit: buy bar shows when the product block leaves the viewport and hides on cart/checkout and near the footer; its add button adds
  the current selection; hotspot opens/closes by tap and keyboard; WhatsApp and assistant bubbles never both show; reduced motion
  stops every animation.
- Library: the new fields are filled from facts; empty fields drop their part; `mood` is one of the two values; no facts → no pills,
  chips or hotspots.
- Template contract suite (`NODE_OPTIONS=--max-old-space-size=6144`): Único still fits phone and laptop and a shopper can buy at
  1280 and 390.
- Live, on the ChatGPT plan (`pnpm dev:chatgpt`): two new stores with real photos from the owner — the sofa (expect colourful,
  close to nubecorp) and a calm product (expect the same motion in its own colours). Screenshots of both next to nubecorp for the
  owner.

## Out of scope
Other templates; stores already built; AI-generated photos or video; size/«largo abierto» option chips and a colour-swatch row on the
product block (separate product-page work); the bobbing letters on a store that has a logo image.
