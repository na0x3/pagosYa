# Merman cart + checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (owner convention: inline) to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every store's cart drawer and checkout page take The Merman's layout and details (free-shipping bar, savings, per-line
subscription, suggestions, guarantee; photo band, two columns with a dark summary, trust lines, a real review), in the store's own brand.
**Architecture:** two new public data fields from the API; the kit's existing cart (`commerce-src/cart/`) and calm checkout shell
(`commerce-src/checkout/shell.js` + `checkout-shell/shell.css`) are restyled and extended — same steps, same payment methods, same data.
**Tech Stack:** NestJS/Prisma (public store data), kit vanilla JS built by `tools/build-commerce.mjs` into `kit/commerce.js`, Playwright
browser specs through `withVisualSandbox` + `kitDefaultSnapshot` (apps/api/src/storefront-source/source-commerce-*.spec.ts).
**Spec:** `docs/superpowers/specs/2026-11-09-merman-cart-checkout-design.md` (owner approved 2026-11-09).

## Global Constraints
- In place on `oct24-clean`, **no commits**; ledger `.superpowers/sdd/2026-11-09-merman-cart-checkout/progress.md`.
- Before saving ANY file under `apps/api/src`: no `StoreSourceChatJob` RUNNING/QUEUED; Edit tool only (never `sed -i`).
- Light checks: one named spec file per jest run, `--maxWorkers=2`; browser specs one at a time.
- Kit: edit `commerce-src/` or `checkout-shell/`, then `node packages/storefront-kit/tools/build-commerce.mjs`, then
  `pnpm --filter @pagosya/merchant-dashboard run build:studio`.
- The Merman's brand is never copied: the store's own logo, banner photo, colours and fonts. Payment methods stay pagosYa's.
- Copy is Spanish; nothing under 12px; no migration.

## Review Focus
1. A store with no delivery zones (or none with `freeAbove`) → no free-shipping bar at all, never «Te faltan Bs 0» (Task 2 test).
2. A product without subscriptions, or a store with Subscribe & Save off → no cadence select on that line (Task 2 test).
3. A cart holding every product → «Te puede gustar» row and «Completa tu compra» left out, never empty frames (Tasks 3, 5 tests).
4. A store whose darkest colour is light → the summary column still reads (contrast ≥ 4.5 with its text) (Task 4 test).
5. No approved review ≥ 4 stars with ≥ 40 characters → no review card, never an invented quote (Tasks 1, 5 tests).

---

### Task 1: Public data — `freeShippingFrom`, `checkoutReview`
**Files:** `apps/api/src/stores/public-stores.service.ts` (next to `policies:` ~l.337); Test: its existing spec (`public-stores.service.spec.ts`).
**Produces:** public store data `freeShippingFrom?: number` (cents: lowest `DeliveryZone.freeAbove` among the store's active zones; absent
when none) and `checkoutReview?: { name: string; rating: number; body: string; productName: string }` (newest `StoreReview` with
status APPROVED, rating ≥ 4, body ≥ 40 characters; name = `displayName`; productName from its product; absent when none).
- [ ] Tests RED→GREEN: zones 100000/50000/none-free → 50000; no zones → absent; inactive zone ignored; reviews: 3★ and short ones
  skipped, newest qualifying chosen, none → absent; PENDING never shown.

### Task 2: Cart top and lines — free-shipping bar, savings, per-line subscription
**Files:** `packages/storefront-kit/commerce-src/cart/render.js`, `cart/lines.js`, cart CSS where `.order-item` is styled
(`commerce-src/look/dna-css.js` / `checkout/overlay.js` cart rules); Test: new `source-commerce-merman-cart.spec.ts` (browser).
**Consumes:** `store.freeShippingFrom`; existing `subscriptionRecurringPrice`, `CADENCE_TEXT`, line cadence state.
**Produces:** `freeShippingBar(total, currency)` → markup or '' ; line markup with `data-part="cart-line-save"` «(Ahorras Bs 9)» in the
accent; `<select data-cart-cadence="{lineId}">` (Una vez · Cada … (ahorra X %)) only for lines whose product allows subscriptions on a
store with them on — changing it moves the line to that cadence in place (price updates).
- [ ] Tests RED→GREEN at 390 and 1280: bar under / at / over the amount («Te faltan Bs 40 para envío gratis» → «¡Tienes envío gratis!»,
  track width, truck icon), **no bar without freeShippingFrom**; saving line; cadence select changes price and the line's cadence;
  **no select for a product without subscriptions**; text ≥ 12px.

### Task 3: Cart suggestions and footer
**Files:** `cart/render.js`, `cart/drawer.js`; Test: `source-commerce-merman-cart.spec.ts`.
**Produces:** «Te puede gustar» row (`data-part="cart-suggestions"`, up to 6 products not in the cart: same category first, then
`store.topSellerId`, then catalogue order; photo, stars + count when the product has reviews, price, option select when it has options,
«Agregar» adds it); footer: «Descuentos −Bs X» when a discount applies, one wide button «Pagar • Bs 199» (`data-cart-pay`, spinner while
going to checkout), shield line with the store's returns policy (first sentence of `store.policies.returns`) else «Compra segura ·
Pagos protegidos por pagosYa».
- [ ] Tests RED→GREEN: suggestions exclude cart items and **disappear when every product is in the cart**; «Agregar» adds and the row
  updates; the button shows the total; the shield line uses the returns policy, else the fallback.

### Task 4: Checkout page — band and two columns
**Files:** `commerce-src/checkout/shell.js`, `checkout-shell/shell.css`; Test: `source-commerce-checkout-layout.spec.ts` (extend).
**Produces:** header band (`data-part="checkout-band"`: `store.bannerUrl` photo else the accent, ~120px, logo centred, cart icon right);
≥ 900px two columns — form on the store background, summary column (`data-part="checkout-summary"`) in the store's darkest brand colour
with its contrast text (reuse `contrastRatio`; fall back to near-black when the darkest is light); < 900px a collapsible «Ver resumen ·
Bs 199» bar above the form; the yellow note «Escribe tu dirección para ver los envíos» while no address; payment methods as tiles.
- [ ] Tests RED→GREEN: two columns at 1280 (summary right, dark, contrast ≥ 4.5 — **also for a store whose colours are all light**);
  summary bar at 390 opens/closes; band shows the banner or the accent; pay button visible; nothing under 12px.

### Task 5: Checkout page — trust lines, suggestion, review card
**Files:** `checkout/shell.js` (`trustStrip`, `shapeShellReview`), `checkout-shell/shell.css`; Test: `source-commerce-checkout-layout.spec.ts`.
**Consumes:** Task 1 `checkoutReview`, Task 3 suggestion picker, the store's delivery time (`store.policies.delivery`).
**Produces:** three trust lines with icons (guarantee as in the cart; «Pagos seguros · Tus datos viajan cifrados»; «Envío · {delivery
time, else «Coordinamos la entrega contigo»}»); «Completa tu compra» (one suggestion with «Agregar», left out when none); quantity badge
on line photos; «Lo que dicen nuestros clientes» card (quote, name, «Compra verificada», stars) from `checkoutReview` only.
- [ ] Tests RED→GREEN: trust lines present with the store's words; **no review card without checkoutReview**, card with it; suggestion
  adds to the order and updates totals; quantity badge shows the count.

### Task 6: Build + live check
- [ ] `node packages/storefront-kit/tools/build-commerce.mjs`; the kit's fast checks (`node --test tools/build-commerce.test.mjs`,
  `node kit/check-runtimes.mjs`); build:studio.
- [ ] Live on a test store with a delivery zone with `freeAbove`, a subscription product and an approved review (Remolino kkp8aeog has
  subscriptions; add a review/zone with test rows and remove them after): add to cart, change cadence, add a suggestion, open checkout,
  pay with the test method; screenshots at 1280 and 390 beside the Merman recording frames (~/Desktop 2026-11-09 1.07/1.12 AM).
