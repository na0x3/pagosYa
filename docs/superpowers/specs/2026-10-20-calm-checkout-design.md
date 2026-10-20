# One calm checkout — design

Date: 2026-10-20 · Branch: feature/store-page-architecture · Sub-project 1 of 3 (2 = option product cards, 3 = PEPPA please animated demo store from `~/Downloads/hut`).

## What the owner asked for

- The pre-checkout (order review) and the payment page look like ayvilabs.com/checkout: a calm, Shopify-style two-column page.
- The pre-checkout shows a picture of the business, the order information, and the payment.
- **One calm checkout everywhere** — the same shell in every store — with payment logos (Visa etc.).

## Reference: ayvilabs.com/checkout (seen 2026-10-20)

- No store header or decoration. White left column with the form; light-grey right column (`~#fafafa`) that runs the full page height.
- Left: section titles in ~17px semibold (Contact, Delivery, Shipping method, Payment); boxed inputs ~56px tall, 1px `#d9d9d9` border, 6px radius, placeholder as label; two-up rows (city · postal code); empty-state boxes in light grey with centred grey text; a full-width "Pay now · 129,00 €" button, grey while disabled.
- Right: line with a 56px thumbnail, a dark circular quantity badge on its top-right corner, name, price on the right; discount input + "Apply" button; Subtotal / Shipping rows; "Total" with a small currency code before a large bold amount.

## The shell (same everywhere)

```
┌──────────────────────────────────────┬─────────────────────────────┐
│ [logo] Store name           🔒 Seguro│  ░░░ business photo ░░░░░░░ │
│ Carrito › Entrega › Pago             │  [img¹] Product        Bs 144│
│                                      │         variant              │
│ Entrega                              │  [Código de descuento][Aplicar]
│ (●) Envío a domicilio      Bs 15     │  Subtotal           Bs 144,00│
│ ( ) Recoger en tienda      Gratis    │  Envío              Bs 15,00 │
│ [Ciudad      ] [Zona            ]    │  Total      BOB  Bs 159,00   │
│ [Calle y número                 ]    │                              │
│ Pago                                 │                              │
│ (●) Tarjeta       [VISA][MC][AMEX]   │                              │
│ ( ) QR            [QR]               │                              │
│ ( ) Tigo Money    [logo]             │                              │
│ ( ) Transferencia [bank]             │                              │
│ [  Pagar ahora · Bs 159,00        ]  │                              │
│  VISA MC AMEX QR TIGO · 🔒 pagosYa   │                              │
└──────────────────────────────────────┴─────────────────────────────┘
```

- **Palette and type are fixed**: white `#fff` left, `#f7f7f7` right with a 1px `#ececec` divider, ink `#1a1a1a`, muted `#6b6b6b`, borders `#d9d9d9`, system UI font stack. Works the same on dark-themed stores (the checkout does not follow the store into dark).
- **Store branding is limited to**: logo + name in the top bar, the business photo at the top of the summary, and the store accent on the primary button and the selected radio. The accent is used only if its contrast with its foreground is ≥ 4.5:1; otherwise the button is `#1a1a1a` on white.
- **Business photo**: `Store.bannerUrl`; fallback to the first cart line's photo; with neither, the summary starts at the lines (no empty box). 16:9, 12px radius, `object-fit: cover`.
- **Payment method rows**: a bordered radio list (Shopify accordion). Each row: radio, method name, logos right-aligned. The selected row gets the accent border and opens a light-grey body with that method's content (card fields / QR note / Tigo note / transfer note). Logos are small inline SVG badges (~38×24, 4px radius, 1px border), drawn as simple, recognisable acceptance marks: Visa, Mastercard, American Express, QR (Bolivian QR simple), Tigo Money, bank transfer. One shared SVG set. Only methods the store actually offers are listed.
- **Trust strip** under the Pay button: the same logos in a row, plus "🔒 Pago seguro procesado por pagosYa".
- **Steps line**: `Carrito › Entrega › Pago` — current step in ink, done steps as links, later steps muted.
- **Phone (≤ 760px)**: one column. The summary collapses into a top bar `Ver resumen del pedido ▾ · Bs 159,00` that opens it in place (photo, lines, code, totals). Inputs 16px font (no iOS zoom), 48px+ targets.
- **Motion**: only the summary disclosure (height/opacity 200ms ease-out) and the selected payment row opening; `prefers-reduced-motion` removes both.

## Where it applies

1. **Pre-checkout — in-store order review** (`storefront-kit/commerce-src`: `checkout/overlay.js` `showCheckout`, `cart/render.js` review mode, `checkout/shipping.js`). Left: delivery method radios, the existing delivery fields restyled as boxed inputs, the store-credit code, subscription consent when present, then a **Pago** section that previews the store's payment methods with their logos (not selectable here — payment happens on the hosted page) and the button **"Continuar al pago · {total}"**. Right: the summary. All existing field names, validation and submit behaviour (`checkout/submit.js`) stay as they are; only markup and CSS change.
2. **Hosted payment page** (`apps/checkout/src/checkout/payment-form.ts`, styles in the shared sheet): the same shell. Left: Contacto (name, email, phone + reminder consent), the delivery confirmation row (method + address, read-only, "Cambiar" returns to the store review), then the payment rows replacing today's tab strip, the dev token select inside the open row, "Pagar ahora · {amount}", the legal notice and "Cancelar pago". Right: the summary built from `session.metadata.cart` (lines), `subtotal`/promo/bundle/shipping metadata and `session.amount`. Plain payment links and debt collection (no cart) keep the right column with the photo/logo, the description and the amount only.
3. **Demo test payment** (`#pago-de-prueba` in the kit): the same shell as 2, so demo stores look identical to live ones.
4. **Confirmation** (`apps/checkout/src/checkout/payment-result.ts` and the kit's demo confirmation): same shell — a check mark in the accent, `Pedido {número}`, "¡Gracias por tu compra!" (or the store's existing thank-you line when it has one), the lines + total paid on the right, and the next steps list on the left.

### What stops

- A store's own checkout look stops drawing the checkout: YAPI checkout templates (`templates/kit-templates.js` `applyCheckoutTemplate`) and authored `checkout.html` content around `[data-pagosya-checkout-page]` (Tostadero's photo + «Tu pedido en Tostadero Yungas» aside). The kit renders the shell full-page over those; the authored page is hidden. YAPI's checkout-template generation is left in place but unused for drawing (no API change in this sub-project); a follow-up can stop generating them.
- The hosted page stops taking the store background, fonts, button DNA and radius (`checkout-branding.ts`). It keeps name, logo and accent.
- The cart drawer, the "added to cart" notice and the rest of the store keep their store look.

## Shared code

- One stylesheet, `packages/storefront-kit/kit/checkout-shell.css`, scoped under `.pya-checkout`, plus `packages/storefront-kit/kit/payment-logos.js` (exports the SVG strings). The kit inlines both into `commerce.js` at build (`kit/build.mjs`); `apps/checkout` imports the same two files. Both surfaces use the same class names, so they cannot drift.
- Store CSS cannot reach the shell: in the storefront it lives in a layer and container that outranks authored rules the way `dialog[data-pagosya-drawer]` does today (layered `!important` for layout, colour and type).

## Data

- Business photo: the kit already receives store config; add `bannerUrl` to what it reads if it is not there. `apps/checkout` already has `bannerUrl` on the store payload (`api.ts`); the payment flow needs it on the session's store brand.
- Lines on the hosted page: `metadata.cart` is already written by `store-checkout.service.ts`. Confirm the public session endpoint returns it with name, variant label, quantity, unit amount and photo; add the photo to the line snapshot if missing. No migration.
- Payment methods to list: today `DOMESTIC_METHOD_TYPES` (card, Tigo Money, transfer, QR). The pre-checkout preview shows the same set the hosted page will offer.

## Errors and edge cases

- Empty cart on the review: the existing empty message in the shell's left column, with "Seguir comprando".
- Very long product names wrap; prices never break (`white-space: nowrap`).
- No logo: the store name alone in the top bar. No photo: no photo box.
- WhatsApp/external checkout modes: the review keeps the shell; the button reads as today («Pedir por WhatsApp» etc.) and the payment-methods preview is hidden.
- International payments: their country select + method list render inside a "Pagar desde fuera de Bolivia" row in the same radio list.

## Testing

- Kit unit tests: the review renders inside `.pya-checkout`, keeps every existing field name, shows the photo or omits it, lists payment logos, and a YAPI checkout template no longer replaces the shell.
- `apps/checkout` tests: payment-form renders the radio list with logos, the summary from `metadata.cart`, and the accent fallback when contrast is low.
- Existing checkout/submit tests stay green (behaviour unchanged).
- Live check on dev (desktop 1440 and phone 390): Tostadero Yungas review → demo payment → confirmation, and one live-mode store through the hosted page with the dev token. Studio rebuilt after kit edits.

## Out of scope

- Real card fields (tokenisation) — the open row keeps today's dev token select / production rail.
- Changing which payment methods exist, prices, shipping rules or the API order flow.
- Sub-projects 2 (option cards) and 3 (PEPPA please store).
