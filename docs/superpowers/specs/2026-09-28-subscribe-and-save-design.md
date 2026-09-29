# Subscribe & Save — design

Date: 2026-09-28. Status: approach and architecture approved by the owner in conversation ("3", "yes do that");
this spec is for review before the implementation plan.

## Why

The owner saw Amboras (`admin.amboras.com`) answer "can this bot create subscriptions in the website?" with:
Subscribe & Save is enabled for the store in Settings → Subscriptions, the merchant chooses eligible products,
delivery frequencies and optional subscriber discounts, customers pick a recurring delivery on the product page, and
renewals are charged automatically — which needs a provider with saved payment methods (Stripe).

pagosYa cannot charge automatically today. Baneco (local QR / bank) needs the buyer to approve each payment; the
dLocal adapter takes a one-time Smart Fields card token (`dlocal.adapter.ts`) and saves nothing. Most Bolivian buyers
pay by QR. So renewals are **one-tap pay links**; saved-card charging is a later sub-project that plugs into one
place (§5.3).

## Goals and success criteria

- A merchant turns on subscriptions, picks products, frequencies and discounts, and gets paying subscribers with no
  API use.
- A buyer chooses "Suscríbete y ahorra" on the product page, pays the first order in the normal checkout, and before
  each renewal gets a message with a pay link; paying it puts a normal order in the merchant's Pedidos.
- The buyer can skip, pause, change frequency or cancel without contacting the merchant.
- No page, email or YAPI answer promises an automatic charge.

Measured by: subscriptions created, renewal pay rate (renewal orders paid ÷ renewal orders created), cancellations.

## Decomposition

| # | Sub-project | When |
|---|---|---|
| A | Subscribe & Save with one-tap pay-link renewals — **this spec** | now |
| B | Saved-card automatic charging on renewals | once dLocal (or Baneco) supports saved payment methods for the account |
| C | YAPI help centre: `docs/help/*.md` articles and a `search_help` agent tool | after A; A writes the first article |

## 1. What exists (from the code, 2026-09-28)

- **Per-product offers:** `ProductSubscriptionOption` (`paymentLinkId`, `cadence` WEEKLY | BIWEEKLY | MONTHLY,
  `discountPercent` 0–99, one per cadence). Merchant endpoints in `payment-links.service.ts` (upsert/remove),
  YAPI can set them (`source-product-options.ts`), and a public read exists (`listPublicSubscriptions(slug, id)`).
  Nothing renders them, enrolls anyone or bills them.
- **Plan subscriptions:** `SubscriptionPlan`, `CustomerSubscription` (`planId` required, `activeKey` unique,
  `status` ACTIVE | PAUSED | CANCELED, `nextBillingAt`, `nextAmountOverride`), `SubscriptionInvoice`
  (`@@unique([subscriptionId, periodStart])`, `status` DUE | PAID | CANCELED, `paymentIntentId`, `initialNoticeAt`,
  `lastReminderAt`). Endpoints under `operations.controller.ts` (create/update plan and subscription, generate,
  remind); no GET list beyond the operations overview.
- **Engine** (`subscriptions.service.ts`, run every 15 min by `operations.worker.ts`):
  `generateSubscriptionInvoices` creates the period's invoice `reminderHoursBefore` ahead, locks it
  (`FOR UPDATE`), reuses or creates the payment intent (`ensureSubscriptionPaymentIntent`, metadata
  `{ storeId, subscription: {...} }`), advances `nextBillingAt` with a conditional `updateMany`, and emails the pay
  link. `sendDueSubscriptionReminders` sends one reminder after the due date.
- **Paid / failed hooks** (`payment-intents.service.ts applyRailResult`): success marks `SubscriptionInvoice` PAID;
  a `StoreOrder` linked to the intent moves to PAID, stock is decremented atomically and `order.paid` is emitted.
  Failure queues `SUBSCRIPTION_FAILED` email.
- **Checkout** (`store-checkout.service.ts createCartCheckout`): builds `cartLines` keyed
  `paymentLinkId:variantId:extraIds`, prices with `discountedProductAmount`, applies bundles/promos/credit, creates
  the intent and a `StoreOrder` (1:1 by `paymentIntentId`) with fulfillment from store locations, delivery zones
  (`DeliveryAssignment`) or carriers (`Shipment`).
- **Storefront:** every template links to the shared kit product page (`storefront-kit/kit/product.html`,
  cart in `commerce.js`, `checkout.html`).
- **Public checkout paths** outside a store (`/track/:token`, `/d/:token`) are routed in `apps/checkout/src/main.ts`
  and whitelisted as noindex in the production `server.mjs`.
- **Dashboard:** vanilla JS; features live in their own module (`mountX(deps)`) with minimal glue in
  `dashboard.js` / `index.html`; `server.mjs` whitelists each served `/src/*` file. Calm workspace style.

## 2. Decisions

1. **One subscription model.** `CustomerSubscription` gains product fields and `planId` becomes optional, so plan
   subscriptions and product subscriptions share the renewal, reminder and paid-hook engine. A subscription is a
   *product subscription* when `paymentLinkId` is set, a *plan subscription* when `planId` is set; exactly one.
2. **Store switch.** `Store.subscriptionsEnabled Boolean @default(false)`. Off: the product page shows no option and
   checkout rejects subscription lines. Existing subscribers keep renewing until they or the merchant cancel.
3. **Eligibility.** A product is eligible when it has ≥ 1 `ProductSubscriptionOption`, is ACTIVE and is not
   `DIGITAL`. Carrier-shipped checkouts are out of v1: a cart with a subscription line may use pickup, location
   delivery or a delivery zone; carrier quotes expire and re-booking each period is its own design.
4. **Price.** A subscription line's unit price is `min(one-time price now, round(base × (100 − d) / 100))` plus
   extras at full price, where *base* is the variant (or product) price before scheduled discounts. The subscription
   stores `unitAmount = round(base × (100 − d) / 100) + extras` and renewals charge `unitAmount × quantity` plus the
   stored delivery fee. The subscription discount never stacks with bundles (subscription lines are excluded from
   bundle matching); promo codes and store credit apply to the first order only.
5. **Price changes.** Locked price, merchant-driven change: on the Suscripciones page the merchant can apply a
   product's current price to its subscribers. That sets a pending price (`pendingUnitAmount`, `pendingFrom`)
   effective for renewals generated ≥ 7 days later, and emails each subscriber the new amount and the date.
6. **Consent.** A cart with a subscription line needs an email and an unticked-by-default checkbox with the exact
   text *"Acepto que este pedido se repita cada {frecuencia}. Antes de cada entrega recibiré un enlace para pagar;
   no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera."* The text and time are stored on
   the subscription.
7. **Creation on payment.** The subscription is created only when the first order's payment succeeds, inside
   `applyRailResult`'s success branch, by `createSubscriptionsFromOrder(tx, intent)`. It must never throw (it runs in
   the payment's transaction): duplicates are avoided with `createMany … skipDuplicates` on `activeKey`
   (`store + product + variant + extras + customer email`). A skipped duplicate leaves the order as a normal paid
   order and records `subscription_duplicate` so the confirmation email says "ya tenías esta suscripción".
8. **One subscription per line; one renewal order per subscription.** A cart with two subscription lines creates two
   subscriptions; each renews on its own date with its own order. No grouping in v1.
9. **Channels.** Email is the automatic channel (existing `EmailService` / `queueStoreEmail`). WhatsApp is manual: the
   dashboard row action opens `wa.me/<phone>` with the message and pay link prefilled, as cobros do.
10. **Livemode** follows the existing subscription rule: `merchant ACTIVE && store ACTIVE`. A test-mode first order
    creates a test subscription; the dashboard marks it "Prueba".

## 3. Data model

One migration, additive except `CustomerSubscription.planId` becoming nullable.

```prisma
model Store {
  // …
  subscriptionsEnabled Boolean @default(false)
}

model CustomerSubscription {
  // existing fields; planId String -> String?
  paymentLinkId      String?                      // product subscription
  variantId          String?
  extraIds           String[]                     @default([])
  itemName           String?                      // snapshot "Café molido 500 g · Tostado medio"
  quantity           Int?
  cadence            ProductSubscriptionCadence?
  discountPercent    Int?
  unitAmount         Int?                         // locked price incl. extras
  currency           String?
  pendingUnitAmount  Int?                         // decision 5
  pendingFrom        DateTime?
  fulfillment        Json?                        // snapshot: method, location id/name, zone id + fee, address, recipient
  sourceOrderId      String?                      @unique // first order
  consumerUserId     String?
  manageToken        String?                      @unique // source of the HMAC public token
  consentText        String?
  consentAt          DateTime?
  missedCount        Int                          @default(0)
  pausedAt           DateTime?

  @@index([paymentLinkId, status])
}

model SubscriptionInvoice {
  // existing fields; status adds "MISSED" | "SKIPPED"
  orderId String? @unique  // renewal StoreOrder for product subscriptions
}
```

Status strings stay strings (as today). No existing column changes meaning.

## 4. Merchant experience (dashboard)

### 4.1 Configuración → Suscripciones (`subscriptions-settings.mjs`)

- Switch "Ofrecer suscripciones en tu tienda" with the one-line rule: *"Tus clientes reciben un enlace de pago antes
  de cada entrega. No se cobra automáticamente."*
- Product table: product, frequencies offered (chips Semanal / Quincenal / Mensual), discount per frequency, active
  subscribers. Row action "Editar" opens a small form over the existing upsert/remove endpoints.
- Digital products are listed disabled with "No disponible para productos digitales".
- Switching off with active subscribers asks: *"{n} suscriptores seguirán recibiendo sus renovaciones. Puedes
  cancelarlas desde Suscripciones."*

### 4.2 Suscripciones page (`subscriptions-panel.mjs`, sidebar under Pedidos)

- Key figures: suscriptores activos, ingreso mensual recurrente (sum of active subscriptions normalised to 30 days),
  renovaciones esta semana, tasa de pago de renovaciones (last 30 days).
- Table: cliente, producto, frecuencia, próxima renovación, último pago, estado (Activa / Pausada / Cancelada /
  Pago pendiente). Filters by estado and producto; search by cliente.
- Row actions: saltar la próxima, pausar / reanudar, cancelar, reenviar enlace (email), enviar por WhatsApp, ver
  pedidos. Product-level action "Aplicar precio actual" (decision 5).
- Empty state: link to Configuración → Suscripciones when the switch is off, otherwise "Aún no tienes suscriptores".
- Plan subscriptions (existing model) appear in the same table with the plan name in the product column; no new plan
  UI in this spec.

### 4.3 API (merchant)

`GET  v1/stores/:storeId/subscriptions?status&productId&q&cursor` · `GET …/subscriptions/summary` ·
`PATCH v1/stores/:storeId/subscriptions/:id` `{ action: "skip" | "pause" | "resume" | "cancel" }` ·
`POST …/subscriptions/:id/resend` · `POST v1/stores/:storeId/products/:id/subscriptions/reprice` ·
`PATCH v1/stores/:storeId/settings` gains `subscriptionsEnabled`.

## 5. Buyer experience

### 5.1 Product page and cart (`storefront-kit/kit/product.html`, `commerce.js`)

- When the store switch is on and `listPublicSubscriptions` returns options (the public endpoint also checks the
  switch), the page shows two choices above the add button: **Compra única — Bs 80** and **Suscríbete y ahorra 10% —
  Bs 72 / cada mes**, with a frequency select when > 1 option. Default: Compra única.
- The cart line carries `subscription: { cadence }`; the cart key includes it, so the same product once and on
  subscription are separate lines. The cart shows "Cada mes · puedes cancelar cuando quieras".
- Templates and YAPI stores get this through the shared product page; nothing template-specific.

### 5.2 Checkout

- `CartItemDto` gains optional `subscriptionCadence`. `createCartCheckout` rejects it when the switch is off, the
  product has no option for that cadence, the product is digital, or the chosen fulfillment is a carrier
  (*"Las suscripciones todavía no se envían por courier. Elige retiro o entrega local."*).
- Subscription lines are priced by decision 4 and carry `{ cadence, discountPercent, lockedUnitAmount }` in the cart
  line metadata. Email and the consent box (decision 6) are required when any line is a subscription; consent text
  and time go into the intent metadata.
- Payment proceeds as today. On success, decision 7 creates the subscriptions with `nextBillingAt = paidAt +
  cadence`, and the order confirmation email adds a block per subscription: frequency, next date, amount, the manage
  link.

### 5.3 Renewals

For product subscriptions the engine keeps its shape; three helpers change:

- `subscriptionTerms(subscription, plan?)` returns `{ name, interval, count, amount, currency, noticeHours }` from the
  plan or the product fields (`noticeHours = 72` for product subscriptions; amount = `(pendingUnitAmount if
  pendingFrom ≤ now else unitAmount) × quantity + delivery fee`). Every place that reads `plan` today reads terms.
- `ensureRenewalCharge(tx, subscription, invoice)` — **the seam for sub-project B.** Today: create or reuse the intent
  (existing `ensureSubscriptionPaymentIntent`) and, for product subscriptions, a `StoreOrder` in `AWAITING_PAYMENT`
  linked to it with the stored items and fulfillment snapshot (and a `DeliveryAssignment` for zone delivery), setting
  `SubscriptionInvoice.orderId`. B later adds "charge the saved method; on failure fall back to the link" here only.
- Before creating a renewal order the engine checks the product: archived or variant removed → the subscription is
  canceled and the customer is emailed; out of stock → the period is `SKIPPED`, `nextBillingAt` advances, customer and
  merchant are told.

Timeline for one period (`D` = renewal date):

| When | What |
|---|---|
| D − 72 h | renewal order + intent created; email "Tu pedido de {producto} está listo — págalo con un toque" with amount, date, pay link, manage link |
| D | reminder if unpaid (existing reminder, template adapted) |
| D + 3 days | last reminder if unpaid |
| D + 7 days | unpaid → order CANCELED, intent canceled, invoice `MISSED`, `missedCount + 1` |
| paid any time before | order goes to Pedidos as PAID through the existing hook; `missedCount = 0` |

Two consecutive `MISSED` periods pause the subscription (`PAUSED`, `pausedAt`), and both the customer and merchant are
emailed. `nextBillingAt` advances when the period is generated (existing behaviour), so a missed period never blocks
the next one.

### 5.4 Manage page (`${CHECKOUT_ORIGIN}/s/:token`)

- Token: HMAC of `manageToken`, like order tracking; noindex; throttled.
- Shows product, frequency, amount, next date, the pending renewal's pay button if one is open, and the last 5
  periods.
- Actions: saltar la próxima, cambiar frecuencia (among the product's current options; the new discount applies from
  the next generated renewal), pausar / reanudar, cancelar (one confirm step, no retention flow).
- Public API: `GET v1/subscriptions/public/:token`, `POST v1/subscriptions/public/:token/actions`
  `{ action, cadence? }`.

## 6. Errors and edge cases

- **Paid hook never throws.** Subscription creation uses `createMany … skipDuplicates`; unexpected data (missing
  consent, unknown cadence) is logged and the order stays a normal paid order.
- **Concurrency.** Skip / pause / cancel use conditional `updateMany` on `status` and `nextBillingAt`. If a renewal
  was generated first, the action answers 409 *"Tu renovación ya se generó; puedes pagarla o saltarla"*, and the
  page offers skip, which cancels that open order.
- **Skip with an open renewal** cancels the open order and intent (only while `AWAITING_PAYMENT`) and marks the
  invoice `SKIPPED`.
- **Cancel** cancels any open renewal order the same way; paid orders are never touched.
- **Paid after cancel/miss.** If a renewal intent succeeds after its order was canceled, the existing late-payment
  handling for orders applies, and `payment_after_close` is recorded so the merchant can refund or ship.
- **Store switch off / option removed.** Existing subscribers continue; the manage page's "cambiar frecuencia" lists
  only current options.
- **No email** is impossible for new product subscriptions (required at checkout).
- **Test mode.** Renewal intents follow `livemode`; test subscriptions are labeled and excluded from the key figures.

## 7. Testing

- **Unit:** decision-4 pricing (sale lower, sale higher, extras, rounding); `subscriptionTerms` for plan and
  product; activeKey; renewal timeline (paid, missed, two misses pause, skip, out of stock, archived); consent
  validation.
- **Service (existing spec style with Prisma mocks):** checkout rejects each ineligible case; paid hook creates
  subscriptions once and never throws on duplicates; `generateSubscriptionInvoices` creates the renewal `StoreOrder`
  and reuses it on a second run; skip / cancel cancel only `AWAITING_PAYMENT` orders; concurrency 409.
- **Regression:** every existing `subscriptions.service` and `operations.service` spec passes unchanged for plan
  subscriptions.
- **Dashboard (`node --test` .mjs):** settings module (switch, product rows, digital disabled), panel (figures,
  filters, actions call the right endpoints).
- **Browser QA:** product page choice → checkout with consent → paid in test mode → subscription in the dashboard →
  manage page skip and cancel; phone width.
- **Database:** the migration is generated and reviewed in the main session; no subagent runs `prisma migrate`,
  `diff` or `reset` against the dev database.

## 8. Out of scope

- Automatic charging (sub-project B), carrier-shipped subscriptions, grouping several subscriptions into one order,
  consumer-dashboard listing (the manage link is enough for v1), new plan-subscription UI, retention offers on cancel.

## 9. Follow-ups this spec creates

- The YAPI prompt note in `source-product-options.ts` ("storefront cadence rendering, customer enrollment … are not
  implemented") is updated: rendering and enrollment now exist; renewals are pay links, never automatic charges.
- First help article for sub-project C: `docs/help/suscripciones.md` (what it does, what it doesn't, where to turn it
  on, requirements).
