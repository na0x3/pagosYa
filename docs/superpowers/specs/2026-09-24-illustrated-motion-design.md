# Illustrated motion — sub-project 3 design

Date: 2026-09-24. Parent: `docs/superpowers/specs/2026-09-24-yapi-unique-stores-design.md` (§3 row 3, §5 gate 5).
Depends on: DNA motifs (`dna.motifs`, up to 3: for, target, meaning, behavior, trigger, placement; saved in
`design-direction.json`, not in `config.js`), sub-project 5 (surfaces) and 6 (motion tokens).
Status: written under the owner's instruction "build everything from 2-8". Owner's words: "if one page is
about lamp, inside the product he can put like a light animation, a lamp animation … those little drawed
emojis … freely customize store based on products, themes".

## 1. What exists and blocks this

- `validateSourceArtwork` (`source-edit-scope.ts:17-26`) throws when a generation adds `<svg>`/`<canvas>`,
  unless the merchant's message literally asks for art. `SOURCE_CREATIVE_DIRECTION` and an
  "ART DIRECTION: … Do not invent … CSS/SVG illustrations" line (`source-generation.service.ts:443`) forbid it
  too.
- There is no SVG sanitiser in the component path: nothing stops `foreignObject`, external `href` in
  `<use>`/`<image>`, `javascript:` links or `on*` props inside inline SVG (`source-next.ts:79-86` forbids only a
  few tags).
- Product pages, cart and confirmation are platform-rendered, so YAPI cannot place anything inside them
  today.

## 2. Design

**Motifs as data, drawn once, rendered by the platform.**
1. **Drawing.** In the build step, for each DNA motif, YAPI outputs one small SVG file
   `motifs/<slug>.svg`: line-art, `viewBox` required, at most 6 KB, `currentColor` strokes so it takes
   the store colour, and animation only through CSS classes (see 3). This adds one allowed output path
   and a short prompt section with the motif list. The build prompt carries the DNA motifs already;
   the art-gate exception applies only to files under `motifs/` and to the motif placements below.
2. **Sanitising (new, `source-svg-sanitize.ts`).** It is an allow-list: `svg`, `g`, `path`, `circle`,
   `ellipse`, `line`, `polyline`, `polygon`, `rect`, `defs`, `linearGradient`, `radialGradient`, `stop`,
   `clipPath`, `mask`, `title`, `desc`. Attributes are allow-listed too (geometry, stroke/fill,
   transform, class, `data-part`); no `on*`, `href`, `style` or `<style>` element. It removes
   everything else and records the removal in `autoRepairs`. A file still over 6 KB, or with no
   drawable content, is dropped with an auto-repair note. It never costs a paid repair.
3. **Animation vocabulary (kit CSS, not model CSS).** The kit ships keyframes for each behaviour: glow
   (a filter/opacity pulse on `[data-part=light]`), draw (a stroke-dashoffset draw-on), sway (a small
   rotate around the base), steam (rising, fading paths on `[data-part=steam]`), grow (scale-in from the
   base), bounce, spin (slow) and float. All use the motion tokens from sub-project 6 and are gated by
   reduced motion and `motion:'off'`. The model only labels parts (`data-part`); the kit animates them.
4. **Placement by the platform.**
   - `config.js` gains `motifs: [{ file, behavior, trigger, placement, target }]`, with no prose. The
     file references a bundled `motifs/*.svg`.
   - `commerce.js` inlines each motif's sanitised SVG, fetched from the bundled file, into platform
     slots:
     - `product`: next to the product title on product pages whose product matches `target`
       (product id or name, or a category name);
     - `card`: a corner of matching cards;
     - `cart`: the cart header;
     - `confirmation`: the order-confirmation panel (checkout app, via the public store data
       like `dna`);
     - `hero`: the authored page places it itself with `<img src="motifs/…svg">` or an inline copy.
   - Triggers: `appear` (IntersectionObserver), `scroll` (in view), `hover` (on the card or product),
     `add-to-cart` (after a successful add, on that product) and `purchase` (on the confirmation).
   - Motifs are decorative: `aria-hidden="true"`, never replace a product photo, never overlap price,
     buy or total, and at most 64px in the kit slots.
5. **Budget.** At most 3 motifs per store, at most 6 KB each, and CSS animation only (no JS per frame).

## 3. Tests

- The sanitiser: a table of hostile inputs (`foreignObject`, `script`, `on*`, `href="javascript:"`,
  external `<image href>`, `<style>`, huge path data) comes out clean or dropped, and a legitimate lamp
  SVG passes unchanged.
- The art gate allows only `motifs/*.svg` plus declared placements, and still rejects unrequested art
  elsewhere.
- `config.js` carries motifs without prose; unknown behaviours or triggers are dropped.
- jsdom: a `product` motif appears on the matching product page only; `add-to-cart` fires the class after
  an add; reduced motion adds no animation class; slot size stays at most 64px.
- Confirmation: the checkout success panel renders the confirmation motif when the store data has
  one.
