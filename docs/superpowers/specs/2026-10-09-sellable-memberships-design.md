# Sellable memberships — design

Date: 2026-10-09 · Status: approved in conversation, spec awaiting owner review
Program: Memberships (1 of 3). #2 member perks (store-wide discount, members-only products) and #3 members-only content build on this and get their own specs.

## Goal

A store owner can sell a membership the way they sell a product: name, photos, description, and one or more renewal periods, each with its own price. A buyer joins from the store with "Hacerme miembro", signs in to their store account, pays once, and stays a member while they pay each period's link. Members appear in the owner's Suscriptores area and in the buyer's Mi cuenta.

## Decisions (from the owner)

- Several periods per membership, each with its own price (e.g. Mensual Bs 50, Trimestral Bs 135, Anual Bs 480).
- Buying requires a store account (sign in or create one at checkout); the membership is tied to that account.
- Missed payment: a grace period (store setting, default 7 days), then the membership lapses ("Vencida").
- A membership checks out on its own; it never enters the cart.
- One active membership per account per membership product; the member can switch period, effective at the next renewal.
- Approach A: a membership is a product type, reusing the catalogue, store pages, checkout and the renewal engine.

Nothing is ever charged automatically. No copy, email or YAPI prompt may claim automatic charging (Bolivian rails need buyer approval for every payment).

## 1. Owner side and data

### Product type
The new/edit product form offers **Físico · Digital · Membresía**. A membership keeps name, photos, description, highlights, category and the YAPI-written long page. It hides variants, extras, stock, shipping dimensions/weight and Subscribe & Save options.

### Periods
A membership has 1–4 periods. Each period has a length in months (1, 3, 6 or 12; unique within the membership) and a price greater than zero. `PaymentLink.amount` is kept equal to the cheapest active period, so cards and sorting can show "desde Bs 50 / mes".

- Changing a period's price affects new members only; existing members keep their locked price.
- Removing a period that has members archives it (`archivedAt`): those members keep renewing on it, nobody new can choose it. A period with no members is deleted.

### Grace days
Store setting under Suscripciones: "Días de gracia para renovar", integer 0–30, default 7.

### Data model changes
- `PaymentLink.fulfillmentType` accepts `"MEMBERSHIP"` (alongside `PHYSICAL`, `DIGITAL`).
- New table `MembershipPeriod`: `id`, `paymentLinkId` (FK, cascade), `months` (Int), `amount` (Int, minor units), `position` (Int), `archivedAt` (DateTime?), timestamps. Unique `(paymentLinkId, months)`.
- `Store.membershipGraceDays Int @default(7)`.
- `CustomerSubscription` gains:
  - `membershipPeriodId String?` — non-null marks a membership row (the row also carries `paymentLinkId`).
  - `storeCustomerId String?` — the buyer's store account.
  - `accessUntil DateTime?` — "activa hasta"; the member has access while `now < accessUntil + graceDays` and status is not `LAPSED`.
  - `pendingPeriodId String?` — period switch to apply at the next renewal.
  - Status value `LAPSED` ("Vencida") joins `ACTIVE`, `PAUSED`, `CANCELED`.
- `activeKey` for memberships: `membership:<storeId>:<paymentLinkId>:<storeCustomerId>` while `ACTIVE`, cleared on cancel and lapse. Enrollment locks the buyer's `StoreCustomer` row, so two payments for the same account are serialized and the second becomes a recorded duplicate instead of a unique-key error.

The migration is written by the implementer and applied by the owner; no agent runs `prisma migrate`/`diff`/`reset` against the dev DB.

## 2. Buyer flow

### Store pages
Membership products appear on cards and on their own page like any product, with a "Miembro" badge and "desde Bs X / mes" (the cheapest period; shown with its own length when the cheapest is not monthly). The product page lists the active periods as choices and shows one button, **"Hacerme miembro"**. There is no "Agregar al carrito".

### Membership checkout (checkout app)
"Hacerme miembro" opens a dedicated membership checkout in the checkout app (where store accounts live, next to `/cuenta/<slug>`), carrying the product id and chosen period.

1. **Sign in or create account** — reuses the store-account login/registration and returns to the checkout.
2. **Already a member?** If the account holds an `ACTIVE` membership for this product, or a `CANCELED` one still before `accessUntil`, show "Ya eres miembro hasta <fecha>" with a link to Mi cuenta instead of the payment step. A `LAPSED` or ended `CANCELED` membership goes on to step 3 as a reactivation.
3. **Review** — membership, period (changeable), price, and the consent line: *"Cada período te enviaremos un enlace para pagar; no se cobra nada automáticamente."*
4. **Pay** — QR or card as today. No delivery step.

Store sign-in already requires a confirmed email, so a brand-new account confirms its email (existing link) and then returns to the membership checkout. The membership is linked by `storeCustomerId`, not by email match.

### After payment
The membership becomes `ACTIVE` with `accessUntil = paidAt + period`, `nextBillingAt = accessUntil`, locked `unitAmount` = the period's price at that moment. The buyer sees a confirmation page and receives a welcome email with "activa hasta".

### Mi cuenta → Membresías
Lists each membership: name, period, status (Activa / En gracia / Vencida / Cancelada), activa hasta, próximo cobro and amount. Actions:
- **Pagar renovación** — when a renewal link is open.
- **Cambiar período** — sets `pendingPeriodId`; applies from the next renewal.
- **Cancelar** — stops renewals; access stays until `accessUntil`.
- **Reanudar** — for Cancelada while access remains: undoes the cancel (status back to `ACTIVE`, renewals resume).
- **Reactivar** — for Vencida, or Cancelada after access ended; goes to the membership checkout.

## 3. Renewals, grace and lapse

Memberships run on the existing renewal engine (`SubscriptionInvoice` + payment links) with a membership branch:

- **Notice:** 5 days before `accessUntil` the engine creates the renewal invoice and emails the pay link: *"Tu membresía vence el <fecha> · Bs X · Pagar"*. If a switch is pending it is applied here, as the existing price-change mechanism does: the invoice uses the new period's current price and length, and `membershipPeriodId`, `unitAmount` and `pendingPeriodId` are updated in the same transaction.
- **Reminders:** the existing schedule — on the due date (`accessUntil`) and a last one 3 days later; none once the membership has lapsed.
- **Paid:** `accessUntil` advances one period **from the old `accessUntil`**, not from the payment date; `missedCount` resets. The payment is recorded as a paid `StoreOrder` with no fulfillment (like a digital order) so it appears in sales, receipts and finance.
- **Missed:** when `accessUntil + graceDays` passes unpaid, the invoice becomes `MISSED`, its payment intent and order are canceled (the link closes), the membership becomes `LAPSED`, `activeKey` is cleared, and the buyer gets a "Tu membresía venció — puedes reactivarla cuando quieras" email.
- **Reactivation:** a new membership checkout payment reuses the same `CustomerSubscription` row (history stays together): status `ACTIVE`, new `activeKey`, `accessUntil = paidAt + period`.
- **Owner archives the membership product:** no further renewals; members keep access until `accessUntil`, then become `CANCELED`; members get a notice.
- **Cancel** (buyer or owner): renewals stop immediately, any open renewal is skipped, `canceledAt` set; access continues until `accessUntil`. `activeKey` is cleared on cancel (existing behaviour); the "already a member" check reads `status` and `accessUntil`, so no sweep is needed.

The buyer-facing status is derived: `ACTIVE` and `now < accessUntil` → Activa; `ACTIVE` and within grace → En gracia; `LAPSED` → Vencida; `CANCELED` → Cancelada (showing "activa hasta" while `now < accessUntil`).

## 4. Owner view, generated stores, errors, testing

### Suscriptores → Miembros tab
Columns: name, email, membership, period, status, activa hasta, last payment. Filters by membership and status. Actions: resend pay link, cancel. Header: active member count and monthly-equivalent revenue (period price ÷ months).

### Stores written by YAPI
The public store product data includes `fulfillmentType: "MEMBERSHIP"` and the active periods. The shared product card / product-options runtime gains a membership mode (period choices + "Hacerme miembro" linking to the membership checkout; never add-to-cart). YAPI's prompt gets one rule: membership products show their periods and the join button, never a cart button. Existing stores pick this up through the shared runtime without regeneration.

### Guards and errors
- The server re-validates at checkout: the period belongs to the product and is not archived; the price comes from the DB; the store is live; the product is active; the buyer has no active membership for it.
- The cart checkout rejects membership products, even from crafted requests.
- Enrollment runs inside the payment success transaction and never throws (same rule as product-subscription enrollment); unknown or changed data is skipped and logged.
- A duplicate payment by an account that is already an active member is recorded as a paid order flagged "already a member" so the owner can refund; both owner and buyer are told.
- A membership product cannot be converted to or from another type once it has members.

### Testing
- Unit specs: period validation, cheapest-period amount sync, enrollment, `accessUntil` arithmetic (early/late payment, month-end dates), grace → LAPSED, period switch, reactivation, archive, cancel, derived status.
- Checkout tests: sign-in → review → pay, "Ya eres miembro", reactivation.
- Live walk-through on dev: create a membership, join as a buyer, force a renewal, let it lapse, reactivate.

## Out of scope
Member perks (#2), members-only content (#3), free trials, limited seats, automatic card charging, prorated mid-period switches.
