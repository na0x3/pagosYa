# Cart + checkout like The Merman — design

Owner 2026-11-09, with a recording of themerman.com's cart and checkout: «lets add like their cart and checkout, i want same checkout
as them like that is good» and «same checkout, i want the payment page to look exactly like theirs». Order of work (owner): popup
looks → popup games → **this** → catalogue toolbar looks.

«Exactly like theirs» = their layout, structure, proportions and details, drawn with each store's own logo, photo, colours and fonts
(The Merman's brand is never copied). Payment methods stay pagosYa's (no Apple Pay / Shop Pay / PayPal in Bolivia).

## What The Merman does (from the recording)

Cart (right side panel): «Your Cart» + ×; free-shipping bar «You're $40.01 away from free shipping!» with a truck at the goal;
each line with photo, name, size, delivery cadence, struck-through price + price + «(Save $4.50)» in the accent, − 1 + stepper,
trash; a «Subscription / Delivery every 45 days (Save 18%)» dropdown per line; «You'll love these» carousel (photo, stars + review
count, price, variant select, Add); «Discounts −$4.50»; one wide button «Checkout • $19.99» (spinner when pressed); a shield line
«30-Day Money-Back Guarantee · Not right for your hair? Get a full refund».

Checkout (one page): a brand-photo band across the top with the logo centred and a cart icon; two columns — left a light form
column (express buttons, «OR», Contact with email + «Email me with news and offers», Delivery, Shipping method note, Payment tiles,
name on card, billing checkbox, three trust lines with icons: money-back guarantee, secure payments, fast shipping; legal line; wide
«Pay now»; «Terms and policies»), right a dark summary column in the brand colour (lines with a quantity badge, «Complete Your
Routine» suggestion with Add, discount code + Apply, Subtotal / Shipping / Total in large type, recurring subtotal, «Trusted by our
Mer-customers» review card with quote, name, «Verified buyer», stars).

## 1. Cart (commerce-src/cart)

- **Free-shipping bar** at the top when the store has a free-shipping amount: «Te faltan Bs 40 para envío gratis» → «¡Tienes envío
  gratis!»; a track in the store accent, a truck icon at the goal. Data: the store's public data gains `freeShippingFrom` (the lowest
  `DeliveryZone.freeAbove` among active zones, in cents; absent when none).
- **Lines**: photo, name, option, old price struck + price + «(Ahorras Bs 9)» in the accent when there is a saving, − n + stepper,
  trash icon (already: stepper, remove, struck price — restyled to this layout).
- **Subscription per line** (stores with Subscribe & Save on, products that allow it): a select «Una vez · Cada 2 semanas (ahorra
  X %) · Cada mes …» changing the line's cadence in place (the cadences and prices already exist).
- **«Te puede gustar»**: a scrollable row of up to 6 products not in the cart (same category first, then best-sellers), each with
  photo, stars + count when the product has reviews, price, option select when it has options, «Agregar».
- **Footer**: «Descuentos −Bs X» when a discount applies; one wide button «Pagar • Bs 199» (spinner while going to checkout); under it
  the store's guarantee line with a shield icon — the store's own returns policy text (Ajustes › Políticas), else «Compra segura ·
  Pagos protegidos por pagosYa».

## 2. Checkout page (commerce-src/checkout)

- **Header band**: the store's banner photo (else its accent colour) ~120px tall with the logo centred, cart icon right.
- **Two columns** (≥ 900px): left the form on the store background; right the summary on a dark column — the store's darkest brand
  colour (foreground/accent), text in its contrast colour. Under 900px: a collapsible «Ver resumen · Bs 199» bar on top, then the form.
- **Left column, same steps as today** restyled: Contact (email + «Quiero recibir novedades y ofertas»), Entrega (today's fields),
  Envío (today's methods; the yellow note «Escribe tu dirección para ver los envíos» while no address), Pago (today's methods as tiles),
  then three **trust lines** with icons: the store's guarantee (as in the cart), «Pagos seguros · Tus datos viajan cifrados», «Envío ·
  {the store's delivery time, else «Coordinamos la entrega contigo»}»; the legal line for subscriptions (today's); wide «Pagar ahora».
- **Right column**: lines with a quantity badge on the photo; **«Completa tu compra»** (one suggestion, as in the cart, with
  «Agregar»); discount code + «Aplicar» (exists); Subtotal / Envío / Total large; recurring subtotal for subscriptions (exists);
  **«Lo que dicen nuestros clientes»**: one approved `StoreReview` (rating ≥ 4, the newest with ≥ 40 characters), quote, name,
  «Compra verificada», stars — only real reviews (they come from real orders); none → the card is left out.
- Type: always the store's own fonts; nothing under 12px.

## 3. Data and API

- Public store data: `freeShippingFrom` (cents) and `checkoutReview` (`{ name, rating, body, productName }` of the chosen review).
- Suggestions use the products already on the page (no new endpoint).
- No migration.

## Testing

- Cart: free-shipping bar maths (under / at / over the amount, no zones); suggestions exclude cart items; subscription select changes
  the cadence and price; button shows the total.
- Checkout render (Playwright, one store dark + one light): two columns at 1280, summary bar at 390, review card only with a real
  review, trust lines present, pay button visible, no text under 12px.
- Live: a test store with free shipping, a subscription product and a review; add to cart, change cadence, add a suggestion, pay with
  the test method; screenshots at 1280 and 390 beside the Merman recording frames.

## Out of scope

Express wallets (Apple Pay, Shop Pay, PayPal), saved accounts («Save my information»), new payment methods, discount logic changes.
