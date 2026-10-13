# Abandoned carts — design

**Date:** 2026-10-13 · **Branch:** feature/store-page-architecture · **Status:** approved in conversation, awaiting spec review

## Goal

Help merchants recover sales from shoppers who left. A merchant sees who left, with what, and how to reach them; shoppers can ask for one reminder from the payment form; and one definition of each checkout step feeds the insights and this page.

Three parts, one spec:
1. **Carritos abandonados page** (merchant list with WhatsApp / email follow-up).
2. **"Avísame" checkbox** in the payment form.
3. **One funnel**: analytics events become the only source of checkout steps.

## Background (2026-10-13)

- Store pages record steps twice, with the same session hash: `StoreFunnelVisit` (one row per session, first time of each step; `store-funnel.service.ts`) and the G1 store analytics (`StoreAnalyticsEvent`, raw events kept 13 months plus daily rollups; `store-analytics.constants.ts`).
- `StoreFunnelVisit.token` is carried into checkout and links a paid order to its session (`store-checkout.service.ts:65`, `:289`). Nothing else does this.
- The shopper's name, email and phone reach the payment only on confirm, when they press Pagar (`payment-intents.service.ts:445-460`).
- Cart reminders exist today only through the opt-in "¿Prefieres terminar después?" box (`StoreSavedCart`, `RetentionService.saveCart`, worker `scheduleCarts`). The one-reminder-a-week cap was fixed on 2026-10-13: it counts from `sentAt`, an open cart from another session gets the latest items, and a refused save returns `{ saved: false }`.

## Decisions (owner, 2026-10-13)

- The list lives in a new **Crecer › Carritos abandonados** item.
- Rows: shoppers who pressed Pagar but never paid, and shoppers who saved their cart. Anonymous sessions appear only as a count.
- The payment-form checkbox takes effect **when the shopper presses Pagar**.
- **Analytics events are the only source of steps**; `StoreFunnelVisit` stays as a thin session record for the order link and stops recording steps.

## 1. Carritos abandonados page

### Layout

- Sidebar: Crecer › **Carritos abandonados**, after Correos y marketing. Dashboard view `abandoned-carts`, route `#dashboard-abandoned-carts`.
- Top: a 7 / 30-day period picker (as in Crecimiento) and one line: "N visitas dejaron su carrito sin dejar contacto".
- List, newest first, one row per person:
  - Name, else email, else phone.
  - Items with quantities, total, relative time ("hace 3 h").
  - Source label: **"Generó el QR / pulsó Pagar"** (kind 1) or **"Guardó su carrito"** (kind 2). Kind 2 rows, and kind 1 rows with a reminder, show the reminder state: "Recordatorio programado", "Recordatorio enviado" or "Sin recordatorio".
  - **Escribir por WhatsApp** when a phone is known: `https://wa.me/<digits>?text=<message>`. A Bolivian number without a country code gets `591`. Message: "Hola {nombre}, vimos que dejaste {producto ×n, …} en {tienda}. ¿Te ayudamos a terminar tu compra? {enlace}". The link is the saved cart's restore link (`?recover=<token>`) when there is one, else the store's public URL. The merchant edits it in WhatsApp before sending.
  - **Escribir por correo** when an email is known: `mailto:` with the same subject and message.
- Empty state: "Todavía no hay carritos abandonados con contacto."

### Who is listed

- **Kind 1**: payments of this store with a cart (`metadata.cart`), `livemode: true`, at least one confirmation (`confirmationAttempts > 0`), not `SUCCEEDED`, a customer email or phone, created within the period and at least 1 hour ago.
- **Kind 2**: `StoreSavedCart` rows of this store created within the period and not closed. A saved cart whose `paymentIntentId` is a listed kind-1 payment merges into that row.
- **One row per person**: rows are keyed by lower-cased email, else phone digits; only the latest attempt is kept.
- **Dropped**: anything older than 30 days; any row whose person paid later in the store (a SUCCEEDED live payment with the same email or phone created after the row, or the row's own payment succeeding). This matches `RetentionService.cartPaid`.

### Anonymous count

Sessions (distinct `sessionHash`) of this store within the period, older than 24 hours, with an `add_to_cart` event, no `pay_click` event, and no paid order linked through `StoreFunnelVisit`.

### API

`GET /stores/:id/abandoned-carts?days=7|30`. Owner-scoped like the other dashboard store routes. Read-only. Response:

```
{ anonymousSessions: number,
  carts: [{ key, source: 'payment' | 'saved', name, email, phone, items: [{ name, variant, quantity }], total, currency,
            leftAt, reminder: 'scheduled' | 'sent' | 'none', recoverUrl, storeUrl }] }
```

No new table. A "Contactado" mark is out of scope; it would need stored state.

## 2. "Avísame" checkbox in the payment form

### Checkout

- Under the email field: "Avísame por correo si no termino la compra", unticked.
- Shown only for store cart payments (not cobros, debts or appointments) and only when the store has `recoveryEnabled` (read from the store data the checkout already loads; the plan confirms which field exposes it). Disabled until the email field has a value.
- `confirmPaymentIntent` (`apps/checkout/src/api.ts:527`) sends `reminderConsent: true` when ticked.

### API

- `ConfirmPaymentIntentDto` gains optional `reminderConsent?: boolean`.
- After a successful confirm, if `reminderConsent`, the store's `recoveryEnabled`, a customer email, and a cart in `metadata.cart`: call a new `RetentionService` method that saves a cart for that email. Its items are `{ paymentLinkId, variantId, extraIds, quantity }` from the cart lines, with `paymentIntentId` set and `dueAt = now + recoveryHours`. It uses the same rules as `saveCart`, including the weekly cap and the subscriber row created inactive.
- It never blocks or fails the payment: errors are logged and skipped, outside the payment transaction.
- The existing worker sends the reminder; `cartPaid` already treats the linked payment's success as paid.

## 3. One funnel

### Reads

Step counts come from `StoreAnalyticsEvent` (distinct `sessionHash`, per store and period, existing `(storeId, createdAt)` index):

| Old step | New source |
|---|---|
| visit | `page_view` |
| product_view | `product_view` |
| add_to_cart | `add_to_cart` |
| checkout_started | `checkout_step` with target `review` |
| delivery_selected | `checkout_step` with target `delivery` |
| paid | unchanged: an order linked to the session through `StoreFunnelVisit`, whose payment is SUCCEEDED and live |

Readers moved to this source:
- `StoreFunnelService.summary` (and through it the cart-to-checkout suggestion, `store-growth.service.ts:106`). The 24-hour "mature" rule is kept.
- `store-knowledge.ts:170-173`.
- The anonymous count on the new page.

### Writes

- The store page sends only `visit` to `/funnel`, to get the order-link token. `add_to_cart`, `checkout_started` and `delivery_selected` are no longer sent there (`apps/checkout/src/store-funnel.ts`, `cart-review-dialog.ts:340`, and the kit's equivalents).
- `/funnel` still accepts the old step events from stores published with an older kit, and writes nothing for them.
- The `StoreFunnelVisit` step columns stay in the database, unwritten. No migration.

## 4. Testing

API:
- Abandoned carts:
  - lists kind 1 and kind 2
  - merges a saved cart into its payment's row
  - shows one row per person
  - drops paid rows (own payment, or a later payment by the same email or phone), test-mode payments and rows over 30 days
  - counts anonymous sessions from analytics events
  - refuses another merchant's store
- Confirm with `reminderConsent`:
  - creates one saved cart linked to the payment
  - follows the weekly cap
  - does nothing when reminders are off, there's no email, or there's no cart
  - a failing save does not fail the payment
- Funnel: `summary` and store knowledge give the expected counts from analytics fixtures; paid sessions still come through the order link; `/funnel` accepts old step events and writes no step columns.

Checkout:
- The checkbox shows only for store carts with reminders on, stays disabled without an email, and sends `reminderConsent` with the confirm.
- The store page no longer posts step events to `/funnel`.

Dashboard:
- The Crecer nav item opens the page.
- Rows, labels and reminder states render.
- The WhatsApp link has `591` added for local numbers and the message filled in; the email link works; the anonymous count and empty state render.
- The page is listed in `dashboard-smoke` and the served-modules allow-list.

## Out of scope

- A "Contactado" mark or notes on rows.
- Restore links for payment attempts without a saved cart.
- Dropping the `StoreFunnelVisit` step columns.
- Automatic WhatsApp sending.

## Rollout

Lands on `feature/store-page-architecture`. The checkout and kit changes reach published stores when their runtime files are next refreshed; until then old stores keep posting steps, which `/funnel` ignores. No dev-database changes; API e2e tests use their own embedded Postgres.

## Corrections found while planning (2026-10-13)

The plan (`docs/superpowers/plans/2026-10-13-abandoned-carts.md`, "Findings") supersedes the spec on these points:
- **Analytics sessions cannot be joined to funnel visits or orders.** `StoreAnalyticsEvent.sessionHash` is an HMAC with the analytics secret on purpose (`store-analytics.service.ts:82-84`); the funnel uses plain sha256. The anonymous count is therefore "added to cart over 24 h ago and no `pay_click` in that analytics session" (a paid session always pressed Pagar). `paymentCompletions` stays a `StoreFunnelVisit` count; `checkoutWithoutPayment` is dropped (no reader).
- **`recoveryEnabled` does not reach the payment form.** The checkout session gains a server-computed `reminderAvailable`.
- **The reminder hook lives in `PaymentIntentsController.confirm`**, after the service returns, outside every transaction; `payment-intents.service.ts` is not edited.
- **"Paid later"** is: a live SUCCEEDED payment by the same email or phone updated at or after the row, or the row's own payment succeeding (stricter than `cartPaid`, which matches email only).
- **Subscription renewals and membership joins** also write `metadata.cart`; they are excluded from the box and the list.
