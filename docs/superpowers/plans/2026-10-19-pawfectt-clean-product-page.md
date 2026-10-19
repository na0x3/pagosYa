# Clean product pages, Pawfectt level — plan

Date: 2026-10-19 · Branch: feature/store-page-architecture · Owner ask: «watch this video, make the plan, for clean websites,
those amazing product cards, animations … work on it yourself» (screen recording of pawfectt.com, an Amboras store; it adds to
the 2026-10-18 Amboras programme).

## What the video shows (pawfectt.com product page)

1. **Story steps.** A sticky product frame on the left (a 3D model, «Rotate by hand», a thin progress line under it and a
   caption «BLACK WI-FI FEEDER / 3D») and, on the right, numbered pills 01 · 02 · 03. Scrolling moves through the steps: the
   active pill fills with the accent, the frame turns to a new angle, and the copy swaps: an accent eyebrow in tracked caps, a
   two-line heading, a paragraph, one large accent figure with a small label («On time with automatic meal scheduling»), a
   footnote.
2. **Calm sections.** Hairlines, one accent colour (amber on warm dark brown), generous space, no boxes on boxes.
3. **Split feature cards.** A photo filling half the card, with «01 / SCREEN FEEDER», a heading, a paragraph, a ✓ list
   on hairlines and an accent text link.
4. **Compare table.** Two models side by side.
5. **Reviews.** On the left, a large average, the stars, «based on N reviews» and a star histogram; on the right, a list
   (title, text, name, city, «Verified buyer»).
6. **Footer.** Light, in columns, with the payment marks.

## What Pulso Studio (first store with the atelier page, 2026-10-19) still gets wrong

- The YAPI card and checkout fell back to the platform design: the surfaces model wrote `var(--foreground)` because
  `storeTokens` stripped `--store-`. **Fixed** (dbca0853).
- The long page draws «Comprar ahora» twice, back to back (top ends with it, bottom starts with it).
- The details block is a row of four small photos, which breaks the owner's no-photo-groups rule; this is exactly the
  material for Pawfectt's story steps.
- The features render as three boxed cards; the FAQ uses the browser's ▶ markers.
- An empty band between the reviews and the long page.
- The header has six heavy links with duplicates (Productos, Catálogo, Inicio), and the store controls are stamp-shaped.

## Work, in order (kit first: every store gets it without a YAPI run)

1. **Single repeated buy.** The top block only adds «Comprar ahora» when a compare table follows it.
2. **Story steps** (atelier page, ≥ 2 details with photos). Sticky frame with crossfading photos, caption and progress
   line; numbered pills; steps with an eyebrow «0n», the heading and the text. IntersectionObserver drives the active step,
   pills are buttons, the motion is 0.5 s opacity/scale with the standard ease and is off under reduced motion. On a phone,
   each step shows its own photo above its text, one photo at a time, never a grid.
3. **Features as a hairline list.** Icon, label and detail in columns divided by 1px rules, no boxes (atelier).
4. **FAQ.** Hairline rows with a drawn +/− that turns, the question in the heading font, and the answer at reading width.
5. **Reviews.** On the left a summary column (average, stars, count, histogram when the data has per-star counts), on the
   right the list (atelier).
6. **Empty band.** Find the element and stop drawing it when empty.
7. **Header and controls.** The platform header dedupes synonyms (Productos/Catálogo/Tienda, and Inicio when the logo
   already goes home) and keeps four links at most; the controls prompt prefers thin line icons and plain shapes unless the
   brief asks for a novelty.
8. **The writer gives each detail a short eyebrow** (later, needs a YAPI run to check): an optional `kicker` ≤ 24 chars, from
   facts only.

Not now: 3D models (needs a GLB per product: an image-to-3D service with balance), a compare table between two products
(needs two products), payment marks in the footer (only methods the store really has).

## Checks

Kit specs in apps/api (jsdom harness like source-commerce-atelier.spec.ts) for each kit change; rebuild commerce.js and
the Studio; look at Pulso Studio's product page in the browser at desktop and phone width.

## Progress (overnight 2026-10-19)

Done and committed: the surfaces' token names (dbca0853); story steps with a sticky stage (046d6f9f, 8be97b0f); first builds
get atelier on the style card path too (654bf95a); the touch keeps the premium bar (38e24cb5); the header keeps at most
four links (2c2e57d9, af36c8c2); plain controls (b155696f); atelier reviews and empty template slots (f25edd05); the atelier
catalog card (d1fbd115); the one-time reveal (10fe53fb); the commerce.js cap raised to 900 000 characters with a headroom
test (226390d5): every new store's first save was failing.

Seen while testing and still open: the bold style card's drawn hero squeezes its copy into a narrow column before the
polish lands; on Lana Andina the YAPI product page failed «overlap» and the cart failed «open», so they fell back to the
platform design.
