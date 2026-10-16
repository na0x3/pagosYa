# Free commerce surfaces — design

Date: 2026-10-15 · Branch: `feature/store-page-architecture` · Status: approved in chat, awaiting spec review
Builds on: `2026-09-25-kit-templates-design.md` (T1: the runtime fills merchant templates' slots; plan `2026-09-25-kit-templates.md`).

## Why

The owner: "the catalog, product cards, product page, cart and checkout … look alike from store to store … I want them totally free and customizable."

These surfaces are drawn by the platform runtime (`packages/storefront-kit/kit/commerce.js`). Sub-projects 1 and 2 (commits `82515910`, `cc5ec609`) only spread stores across fixed presets. Since T1 the runtime accepts merchant `<template>`s for five of these parts (`kitTemplate()`, `commerce.js:3344`) and fills only their data slots, but **0 of 27 dev stores have one**: they are mentioned only as "optionally author…" in the older single-shot prompt (`source-generation-prompt.ts:66`); the YAPI agent that builds stores is never told, and the API never checks them.

## Goal

Every new store and redesign gets YAPI-designed catalog cards, product page, cart, cart lines, added-to-cart notice and checkout page in the store's own language, and a merchant can ask for any single part again («haz el carrito más bonito»). Prices, stock, totals, the buy and pay buttons, the payment box and the pagosYa seal stay the platform's. A customer never sees a broken part.

## Decisions (owner, 2026-10-15)

1. YAPI designs all parts on every new store and redesign, and one part on request.
2. Checkout: the whole page is free; the payment-method box (card, QR, Tigo Money, transfer) and the pay button keep the platform's markup but take the store's colours and fonts.
3. A part that still fails after repairs falls back to the drawn default; the rest of YAPI's parts stay.
4. Approach B: a dedicated "commerce surfaces" stage after the main build (not inside the main agent run, not a template library).

## Parts and ownership

| Part | Template | YAPI owns | Platform fills (fixed) |
|---|---|---|---|
| Catalog card | `data-pagosya-product-template` (exists) | layout, image treatment, hover, typography, badges from real data | name, price, stock state, add/choose control, product link |
| Product page | `data-pagosya-product-page-template` (exists) | the whole page layout and section order | gallery, title, pricing, options, quantity, buy, delivery, rating, related |
| Cart | `data-pagosya-cart-template` (exists) | panel layout, header, empty state, copy | lines, total, savings, checkout action, close |
| Cart line | `data-pagosya-cart-line-template` (exists) | line layout | name, line total, quantity stepper, photo, option, unit, stock, remove |
| Added notice | `data-pagosya-added-template` (exists) | look, position, wording (with the store's cart word) | open-cart button, product name/photo |
| Checkout page | **new** `data-pagosya-checkout-template` (today only `review`, whose title and back button stay kit-rendered) | the whole page: layout, order summary, field styling, brand panel, surrounding copy | payment box and pay button (markup fixed, store tokens), summary rows and totals, customer field inputs |

YAPI may never, in any part: type a price, total or stock value; invent offers, reviews, urgency or guarantees; remove a required slot; add JavaScript. The runtime fills slots with `textContent` and kit-built nodes only (T1 constraint, unchanged).

## Architecture

### One source file, every page

The stage writes `commerce-templates.html`: the six `<template>` elements and their scoped CSS. The runtime looks templates up in the current document only, and `product.html` / `checkout.html` are platform pages YAPI does not edit, so the save assembly (`source-save-assembly.ts`) and the editor/preview assembly inject this file's templates and CSS into every store page. Pages without the file behave exactly as today.

### The stage

Runs:
- after the main build passes acceptance and before the save, on new stores and redesigns (flag on);
- alone, for one part, when the merchant's request names a part (cart, cards, product page, checkout, added notice); the rest of the file is kept;
- never on ordinary edits (the file is carried over unchanged).

Input: the store's tokens (colours, fonts), button DNA, motion personality, cart word, the drawn product and commerce surfaces as the starting point, and desktop + phone screenshots of the finished home page. Output: `commerce-templates.html`. Model and provider as the build's (ChatGPT plan: unmetered; metered: charged like other stages), with its own share of the build's 12-minute budget.

### Checks (real browser, 1280 and 390 px)

| Part | Must pass |
|---|---|
| every template | one root, required slots present, runtime `*TemplateInvalid` flag not set |
| catalog card | name and price come from the catalog; add or choose works |
| added notice | appears after adding; its button opens the cart |
| cart + line | line shows name, quantity, total; +/– changes the total; remove works; checkout action reaches checkout |
| product page | title, price and buy in the first desktop screen; options and quantity work; buy adds to cart |
| checkout | summary total equals cart total; fields fillable; payment box present and unaltered; preview payment completes |
| all | no text over text, no horizontal scroll, readable contrast, no currency amounts outside slots |

A failing part goes back to the stage with the failed check and a screenshot, at most 2 repair rounds per part; passed parts are frozen and not rewritten.

### Fallback

- A part still failing is removed from the file whole; the runtime shows the drawn default for it. Never half-applied.
- If the stage fails entirely (timeout, provider error), the store saves without the file (today's look); the main design is never lost.
- Per-part results (passed / repaired / fell back + failed check) are stored with the generation attempts for diagnosis.

### Chat and progress

- Progress: a step «Diseñando carrito, productos y pago» after «Comprobando el código y los recursos», ticking each part.
- All passed: «Diseñé también tu carrito, tarjetas de producto, página de producto y pago.»
- Some fell back: «El carrito no pasó la prueba de compra, así que usa el diseño estándar por ahora.» with «Reintentar el carrito» (runs the stage for that part).
- Stage failed: «Tu tienda está guardada. No pude terminar el diseño de carrito y pago; puedes pedírmelo de nuevo.»

## Runtime work

- New `data-pagosya-checkout-template` in `commerce.js`: slots for the summary, customer fields and the payment box (the platform moves its own payment box and pay button into that slot), plus the page title and back action now inside the template; validation, invalid flag and fallback like `kitTemplate()`.
- Store tokens (`--store-*` / `--brand-*`) applied to the payment box so it matches without changing its markup.

## Rollout

- Flag `YAPI_COMMERCE_SURFACES`: on in the owner's dev `.env`, off by default elsewhere until the live checks pass. Off = today's behaviour.
- Existing stores unchanged until a redesign or a part request.
- Order: (1) checkout template in the runtime, (2) injection into every page, (3) the stage with checks, repairs and fallback, (4) chat messages and progress step, (5) on-request part path, (6) live checks.

## Testing

- API unit: template validation per part, injection into every page (incl. `product.html`, `checkout.html`), clean removal of a failed part, freezing passed parts, part-only runs, chat messages for each outcome.
- Runtime Playwright (extend `apps/merchant-studio/tests/kit-templates.spec.ts`): the checkout template; a fully templated store buys end to end at 1280 and 390 px; each part deliberately broken falls back alone. The existing `source-commerce-*.spec.ts` suites stay the regression net for stores without templates.
- Stage logic with recorded YAPI responses (record/replay from 2026-10-13): pass first time, one repair, two failures → fallback, stage timeout.
- Live on dev in the browser: one new store, one redesign, one «haz el carrito más bonito», each bought through the preview. Check for running YAPI requests before any API edit (an API save restarts the owner's dev server).

## Out of scope

- The bookings form (own spec; it will reuse this stage and its checks).
- A manual visual editor for these parts.
- Changing the payment box's markup or behaviour.
