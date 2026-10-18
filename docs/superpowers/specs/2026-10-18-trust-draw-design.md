# Trust, drawn per store — design (2026-10-18)

Owner, 2026-10-18 (florart 3mst1q0y, six-photo «La mesa se llena de flores» grid):
«i did not like pictures cramped up like this, i preferred editorials with emojis … trust is the main factor … a carousel
or something with pictures, or things that build up trust … custom reseñas». On a fixed design: «i dont want anything
defined … i dont want any websites looking the same … diverse yapi choices for that for every site». Reviews: both
sources (merchant-entered and verified purchases).

## What changes

The trust block built the night before (source-photo-groups.ts → kit `[data-pagosya-trust]`, one «Compra con
tranquilidad» card row for every store) stops being the default. Trust becomes a drawn design part, like the header
and hero, so stores differ.

### 1. Trust device draw (`frame-draw.ts`)

- New design parts **`trust`** (every fresh build) and **`reviews`** (only when the store has ≥ 2 published reviews).
- Least-used over recent stores (same-category stores weigh double), like palette/angle/structure.
- Calm builds (playbook, not bold) draw only calm entries.
- `trust` catalogue: photo carousel (needs 3+ photos), emoji editorial, how we make it, promises band, note from the
  owner, doubts answered, real facts ledger (needs facts), occasions.
- `reviews` catalogue: reviews carousel, one big rotating quote, stacked review cards, a review beside a photo.
- Each line tells YAPI what to build; styling is the store's own. Only facts in the data, never invented numbers or
  testimonials.
- `FrameAvailable.reviews` = published reviews (generation already counts them).
- Old saved draws without these keys stay valid; edits keep what was drawn.

### 2. Carousel: kit behaviour, store look

- `<div data-pagosya-carousel>` with one child per slide: the kit adds scroll-snap, previous/next buttons, dots,
  keyboard, and pauses under reduced motion. The store's CSS styles everything.
- Photos inside a carousel are not a photo group in the save repair (`source-photo-groups.ts`) or the browser
  check (`source-media-design.ts`). The browser check still flags a carousel showing 3+ photos at once.
- Safety net: a photo wall that still reaches the save becomes a carousel of the same photos inside the same
  section (heading, text, id and classes kept), not the fixed trust block.
- `SEP5_NO_PHOTO_GROUPS` and the agent media prompt drop the «place `data-pagosya-trust`» instruction and point at
  the drawn trust device. The kit trust block stays available as live data for a «promises band», never required.

### 3. Reseñas from both sources

- New table `StoreTestimonial` (name, stars, text, `sourceNote` e.g. «por WhatsApp», status PUBLISHED | HIDDEN),
  migration `20261018120000_store_testimonials`, applied by the owner. A new table rather than new `StoreReview`
  columns, so no existing review query changes before it is applied; until then the API reads it as empty.
- Studio «Contenido y ofertas»: «Añadir reseña de un cliente» (name, stars, text, where it came from), published at
  once, with the merchant confirming it is a real customer's words. Moderation (hide/delete) as today.
- Public content returns `source`/`sourceNote`. Kit `[data-pagosya-reviews]` labels each review «Compra verificada»
  or «Reseña de cliente · por WhatsApp». On pages other than the product page, an empty slot hides itself and its
  `[data-pagosya-reviews-section]`.
- YAPI never writes a review.

### 4. Florart

After 1–3, a redesign of florart (owner-gated live run) replaces the gallery.

## Out of scope

Importing reviews from Google/Instagram; review photos; star summaries in cards (exists via reviewSummary).
