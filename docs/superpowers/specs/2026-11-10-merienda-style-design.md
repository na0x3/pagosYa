# Merienda — the Bake Me style, different for every store

Owner 2026-11-10, looking at bakeme.pages.dev: «why cant yapi never create a store like that one» → agreed: turn Bake Me into a
template style YAPI can use, «but we would then need more of them to not be repetitive» → agreed: one style with built-in variety
(type, photo treatment, 2–3 versions of each section, sections by business), proven on 6 test stores side by side before YAPI gets it.

## What Bake Me is made of (reference: ~/Bake Me, served at :8788)

Pill header; a solid brand band hero with huge black italic capitals and a product stack with a sticker; a curved moving ribbon of
words; «Elegí tu sabor» chips; each flavour as a tinted row (huge name, description, its sizes with prices, quantity + Agregar, big
photo), alternating sides; a giant list of flavour names that light up as you scroll; a big statement with cut-out cookies; category
blocks in tints; how-to-bake card; storage cards; a sticker + scroll-lit sentence; an outline/solid marquee of names; FAQ beside a
photo; «Así de fácil» ordering steps. Most of its character is type, tints, product photos and words about the product.

## The template

`merienda` (extends `esencial`, theme `merienda`, category `comida`, tags snacks/dulces/galletas/bebidas/helados/panadería
divertida). Brand colours kept (presets keep them); tints are light mixes of the brand's own colours (owner rule: colour comes from
the brand, ground stays light). Theme CSS between `/* theme:merienda */` markers in Esencial globals.css (pruned per store like the
other themes): pill header links and round icon buttons, chunky caps titles with an optional slant, tinted bands, sticker frames.

Home (fixed order; a section the store cannot back is dropped by the fill as today):
1. `cover-mega` (new) — huge caps title (2–6 words), one line, button, the product photo with its treatment, an optional round
   sticker (1–3 words), the curved ribbon of 2–4 words. Looks: `side` (photo right), `stack` (title over, photo centred below),
   `tilt` (photo left, tilted, title right).
2. `products-rows` (new) — 2–5 named products, each a tinted row: big name, the kit's buy card (`data-pagosya-spotlight`: options,
   price, Agregar) and the product's photo. Looks: `alternate` (photo left/right in turns), `cards` (two tinted cards per row),
   `stack` (photo over words, centred).
3. `names-list` (new) — the products' names (or flavours) huge, one per line, lit one by one as you scroll, each a link, with the
   product photo floating beside the lit name (never text-only). Looks: `light` (grey → ink), `outline` (outline → filled).
4. `statement-sticker` (new) — a big sentence about the product (title), one line of text, two product photos as stickers.
   Looks: `left`, `center`.
5. `categories-tiles` (existing; tinted bento under the theme).
6. `steps-howto` (existing; «cómo se usa / cómo pedir»).
7. `strip-marquee` (existing, look `outline` under the theme: outline and solid words alternate).
8. `faq-split` (existing).
9. `closing-wordmark` (existing).

Product page: `steps-howto` + `faq-split`, like the other templates.

## Variety: drawn per store, in code

A preset may declare `choices`; `drawPresetChoices(preset, seed)` (seed = store id) picks one value of each list, deterministic per
store, applied where the preset is laid over a store (`assemble`), before the model fills words:
- `fonts`: five font pairs — Archivo Black, Bowlby One, Titan One, Rubik (black), Unbounded — each with a quiet body font.
- `variants.slant`: `on` | `off` (titles leaned like Bake Me's italic, or upright).
- `variants.photoFx`: `blend` (white-background product photos melt into the tint), `sticker` (white edge, small tilt, shadow),
  `round` (rounded frame).
- `looks`: per section type, one of its looks.
5 fonts × 2 slants × 3 photo treatments × 3·3·2·2 section looks ≈ 1,000 combinations, each part built and checked once. The model
never designs; the fill prompt already leaves look/band/card to the template.

## Not in this round

Background removal for real cut-outs (next, owner's step 2); Bake Me's bake-time slider; adding Merienda to YAPI's pool (only after
the owner approves the comparison page; the test names the template in the first message, which always wins).

## Test

Six stores built by YAPI on Merienda from their existing scripts (Miga Dorada, Oh Belly, DooBoo, BAEK, Antojo Café, Canasta Viva),
phone + computer captures side by side on one artifact page, for the owner to judge «different enough».

## Round 2 (owner 2026-11-10: «its good but all of them are the same»)

Burbuja, Neón and Mimo had their own fonts and colours but Merienda's page (mega cover with ribbon, product rows, names list,
sticker sentence). Owner chose «I pick real sites»: each style is rebuilt from one admired real store's own structure, the way
Merienda came from Bake Me; Merienda keeps Bake Me's. New sections (templateOnly):
- Burbuja ← rhode (rhodeskin.com): `products-words` (a slider of tall product cards, each under one giant lowercase word that says
  what the product is for — items.value), `values-portrait` (a statement and 2–4 values that open, beside a black-and-white portrait);
  quiet full photo cover (cover-full), inset rounded story cards on grey (story-split under the theme), a photo row, a huge
  lowercase wordmark. Lowercase grotesk type, grey ground, outline pills.
- Neón ← Kith (kith.com): `campaign-strip` (a full-bleed campaign photo, title bottom-left, two buttons bottom-right, then four
  products of that collection), repeated per category; new-arrivals slider; condensed capitals.
- Mimo ← Wild One (wildone.com): `block-split` (a tinted colour panel with words beside a photo, sides alternate), `letters-split`
  (a word in colourful letter tiles, one tile a photo, beside words), product sliders per category (products-slider with a
  category link), a photo row.
Each style's own sections carry the per-store looks; none of the three uses Merienda's sections any more.
