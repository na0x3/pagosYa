# Chunky colour titles — spec (2026-11-03)

Owner, after the Único premium landing live check (sofa store «Nube Sofá Test»): «something i dont like is the title i would prefer
chunkier multicolor text and etc depending on the product», pointing at Shopify Flux's «Paws» preset (flux-paws.myshopify.com) — «that
one is perfect». Choices: titles **word by word** in several colours (not letter by letter, not two-tone); **hero loud, sections
lighter**; **always chunky, the style varies by product**; approach **A — a fixed set of title styles YAPI picks from, drawn by the
template** (no free CSS).

This is part 1 of 3 agreed the same day (order: titles → every-store pieces → Paws template):
2. every store: signup popup on by default (no discount unless the merchant sets one), a storage/cookie notice, picture menus in every
   template's menu panel — own spec;
3. a new «Paws» template for stores with a few products or more (pastel tiles, wave bands, tabbed product rows, outline marquee…) —
   own spec, reuses these titles.

## 1. Who gets it
New Único builds and stores switched to Único (later the Paws template). The other 33 templates keep their designed fonts. Stores
already built keep their files.

## 2. Title styles (Esencial `titles` variant)
`master.variants.titles` gains four styles beside `normal` / `upper`:

| Style | Font (display) | Colours | Underline | For |
|---|---|---|---|---|
| `burbuja` | Baloo 2 ExtraBold | 3–4 | yes | toys, pets, sweets, snacks, parties, kids |
| `redonda` | Fredoka SemiBold | 2 | yes | home, furniture, bedding, kitchen (the sofa) |
| `firme` | Archivo Black | 2 | no | tech, gadgets, beauty, tools |
| `poster` | Anton | 2–3 | no | sports, drinks, streetwear |

Body text keeps the store's body font. The one new font file (Baloo 2 ExtraBold) is single-weight and bundled with its OFL licence
like `fredoka.ttf`. Line height 1.0–1.05, sentence case, no letter-spacing.

## 3. Colours
- The platform derives 2–4 title colours from the store's photo palette (the colours `paletteFromSamples` already reads): each must reach
  3:1 against the page background; one too light is darkened toward ink until it does; near-duplicates (ΔE < 12) count once.
- `burbuja` uses up to 4, `poster` up to 3, `redonda` / `firme` 2. With fewer readable colours than the style wants, it uses what it has
  (minimum 2: the accent and ink).
- Colours are CSS custom properties on the store (`--es-title-1` … `--es-title-4`), so a palette change re-colours every title.

## 4. Where it shows
- **Hero headline** (the first title on the home: `hero-split`, any cover, `product-hero` when it opens the page): each word takes the
  next title colour, cycling; a word YAPI marked with `*…*` gets the hand-drawn underline (styles with underline only).
- **Section titles**: the chunky font; ink, except the `*marked*` word in title colour 1; the underline on at most every other section
  title, so it stays special.
- Titles over a darkened photo (closing photo, full covers) stay white, words not recoloured.
- Buttons, prices, product names, menus and body text are unchanged.

## 5. Underline
An inline SVG swoosh under the marked word, in the accent, drawn by the template (no image file). It draws itself in when the title
scrolls into view; with reduced motion it is simply there. It never pushes the line height (absolutely placed under the word).

## 6. How YAPI picks
- The section library fill's answer gains `titleStyle` (enum of the four), next to `mood`, chosen from the product and the business.
- Rule over the answer, like `libraryMood`: a playful business (`isPlayfulBusiness`) always gets `burbuja`; otherwise the answer stands,
  defaulting to `redonda`.
- Chat: «títulos más tranquilos» moves one step calmer (`burbuja` → `redonda` → `firme`) and to 2 colours; «títulos más divertidos»
  the other way; «cambia los títulos» picks another style. Same routing as «hazla más tranquila / colorida».

## 7. Edge cases
- One-word hero: one colour plus the underline if marked.
- Very long hero (≈ 70 characters) at 390 px: wraps by word, no sideways scroll, font size clamps down to 32 px.
- A store with no photos: title colours are the accent and ink.
- The colourful mood keeps its coloured logo letters; titles follow this spec in both moods.

## 8. Testing
- Library: `titleStyle` read, playful override, default `redonda`.
- Palette: 2–4 readable title colours, darkening, duplicates merged, minimum 2.
- Render (Único sandbox, as source-unico-lively.spec.ts): hero words show the style's number of distinct colours, each ≥ 3:1 on the
  page; section titles have at most one coloured word; the underline sits under the marked word without changing line height; a
  70-character hero at 390 wraps with no sideways scroll; titles on the closing photo stay white.
- Chat routing for the three asks; template contract for Único.
- Live: rebuild «Nube Sofá Test» (expect `redonda`, 2 colours) and one playful store (expect `burbuja`), screenshots at 1280 and 390
  next to Paws.

## Out of scope
The every-store pieces and the Paws template (own specs); letter-by-letter colouring; cut-out photos; changing other templates' fonts.
