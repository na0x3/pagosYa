# International merchants with Mercado Pago — design

Date: 2026-11-18 · Status: written, awaiting owner review · Piece 1 of 2 (piece 2: language versions, own spec)

Owner requests (2026-11-17/18): «lets work on connections for other currencies like the plugin base in amboras» → «i want merchants
from other countries to be able to receive funds also» → «i suppose we also need versions for each language».

Decisions taken in chat (2026-11-18):

| Question | Owner's answer |
|---|---|
| Whose account receives a foreign merchant's sales? | The merchant's own account (plugin model, like Amboras/Shopify). pagosYa never holds the money. |
| First payment connection | Mercado Pago |
| Launch countries | All Mercado Pago countries: Argentina, Brazil, Chile, Colombia, Mexico, Peru, Uruguay |
| How pagosYa earns from them | Free while we launch |
| Languages | Portuguese for Brazil, everywhere — a separate spec (piece 2) |
| Checkout approach | Mercado Pago's own checkout page (Checkout Pro), behind a small payment-connection layer |

## 1. Goal

A seller in any of the seven countries can sign up, connect their Mercado Pago account, publish a store priced in their own
currency, and receive a real payment from a shopper straight into that Mercado Pago account.

Success: a Mexican test merchant sells by card, an Argentine test merchant sells by a cash method that confirms later, and a refund
from the dashboard reaches the shopper — all in Mercado Pago's test mode, then once in live mode with a real small payment.

Non-goals (this piece): translations (piece 2); Mercado Pago's form inside pagosYa's own checkout (later upgrade); Stripe, PayPal or
other providers (the layer allows them later); any pricing or commission for foreign merchants; Bolivian merchants using Mercado Pago;
currency conversion of any kind.

## 2. Today (what this builds on)

- pagosYa is a Bolivian aggregator: shoppers pay through pagosYa's rails (`src/rails`: Baneco, a dLocal adapter for collecting, mock
  card/QR/Tigo/bank), the money lands in pagosYa's ledger (`src/ledger`), and `src/payouts` disburses each merchant's balance to a
  Bolivian bank account (only a mock disbursement adapter exists). ASFI verification levels (`Merchant.level`, `MerchantKycSubmission`)
  gate live payments; SIAT invoicing is Bolivian.
- Every money field defaults to `"BOB"`; the store kit formats every amount as `es-BO` (`commerce-src/shared/state.js` `money()`).
- Extensions (`src/extensions`) are first-party modules with a `payments` category already declared but unused; secrets are kept with
  `secret-box.ts`.
- Checkout lives in `apps/checkout` (the published store and its calm checkout); orders fire `order.paid` / `refund.succeeded` store
  events that emails, stock and extensions already follow.

## 3. Design

### 3.1 Country, currency and what a foreign store is

- `Merchant.country` (ISO 3166-1 alpha-2, default `BO`). Chosen at signup from: Bolivia (default), Argentina, Brazil, Chile, Colombia,
  Mexico, Peru, Uruguay. Every existing merchant is `BO`.
- One table `COUNTRIES` (shared types) gives per country: currency (`BOB, ARS, BRL, CLP, COP, MXN, PEN, UYU`), the currency's minor
  digits (CLP and COP have none in Mercado Pago), the number locale (`es-BO, es-AR, pt-BR, es-CL, es-CO, es-MX, es-PE, es-UY`), the
  phone prefix, and the store language (Spanish everywhere; Portuguese for Brazil once piece 2 ships).
- A store's currency is its merchant's country's currency. New products, carts, orders, coupons, shipping rates and emails use it.
  Nothing is converted.
- The country cannot change after the merchant's first order (ops can change it before that).
- «Foreign merchant» = `country !== 'BO'`. One helper (`isForeignMerchant`) decides everything Bolivia-only (§3.5).

### 3.2 Money shown the local way

- The kit's `money(amount, currency)` takes the store's locale from config (`config.locale`, written on save from the country table)
  instead of the fixed `es-BO`. Same for the dashboard and Studio money formatting, emails and receipts.
- Amounts stay in minor units everywhere (as today). For a zero-decimal currency (CLP, COP) the minor unit is the whole unit; the
  country table's `minorDigits` decides, and every conversion to Mercado Pago goes through one function with tests.
- Shopify import: a foreign merchant's import keeps the source currency when it equals the store's currency; the «tipo de cambio a
  bolivianos» step only shows for Bolivian stores. A different source currency is refused with a clear message (no conversion).

### 3.3 The payment-connection layer and Mercado Pago

A small contract in `src/payment-connections` (separate from the Bolivian rails):

```ts
interface PaymentConnectionProvider {
  id: 'mercadopago';                                   // later: 'stripe', 'paypal'
  countries: string[];                                 // where a merchant may connect it
  connectUrl(merchantId, state): string;               // the provider's consent page
  finishConnect(code): Promise<ConnectedAccount>;      // tokens + the provider's account id
  createCheckout(account, order): Promise<{ url: string; reference: string }>;
  readPayment(account, providerPaymentId): Promise<ProviderPayment>;   // status, amount, currency, reference
  refund(account, providerPaymentId, amount?): Promise<ProviderRefund>;
}
```

Model `PaymentConnection`: merchantId, provider, providerAccountId, encrypted access and refresh tokens (`secret-box`), expiresAt,
liveMode, status (`active | expired | revoked`), connectedAt. One active connection per merchant per provider.

Mercado Pago implementation:
- **Connect:** Mercado Pago's OAuth for platforms. Ajustes › Pagos shows «Conectar Mercado Pago» → `GET /v1/payment-connections/
  mercadopago/start` returns the consent URL with a signed, single-use `state` tied to the merchant → Mercado Pago sends the merchant
  back to `/v1/payment-connections/mercadopago/callback` → tokens exchanged and stored encrypted. Tokens are refreshed before they
  expire by a daily job; a refresh failure marks the connection `expired` and shows «Vuelve a conectar Mercado Pago» in the dashboard.
- **Disconnect:** removes the tokens; a published foreign store then shows its products but checkout says payments are paused.
- **Checkout:** a Checkout Pro preference created with the merchant's token: the order's items (name, quantity, unit price in the
  store currency), `external_reference` = pagosYa order id, `back_urls` to the store's «gracias» / cart, `notification_url` to the
  webhook, `auto_return`.
- **Webhook:** `POST /v1/webhooks/mercadopago` checks Mercado Pago's `x-signature`, then never trusts the body: it reads the payment
  with the merchant's token (`readPayment`) and accepts it only if reference, amount and currency match the order. Idempotent per
  provider payment id.
- **Refund:** from the order in the dashboard, through `refund`; the order follows the provider's refund result.

Env (owner creates the Mercado Pago application): `MERCADOPAGO_CLIENT_ID`, `MERCADOPAGO_CLIENT_SECRET`, `MERCADOPAGO_WEBHOOK_SECRET`,
`MERCADOPAGO_REDIRECT_URI`; test mode uses Mercado Pago's test users.

### 3.4 Checkout and orders

- The cart and checkout steps stay as they are up to «Pagar». For a foreign store, «Pagar» creates the order (waiting for payment, in the
  store's currency, using the order statuses that exist today), asks the provider for the checkout URL, and sends the shopper there in the top window (the store runs in a
  sandboxed frame inside the checkout app, which does the navigation).
- The shopper pays with whatever their country offers (cards, OXXO, Pix, Rapipago, PSE…) and returns to the store's «gracias» page,
  which shows the order's real status (paid, or «esperando tu pago» for cash methods).
- When the webhook confirms the payment, the order becomes paid through the same path Bolivian orders use, so `order.paid`, emails,
  stock, the dashboard and extensions behave as today. Cash methods that expire (Mercado Pago's own expiry) cancel the order and give
  its stock back.
- The money never touches pagosYa's ledger or payouts: a foreign order records the provider and its payment id, not a ledger entry.

### 3.5 Bolivia-only, switched off for foreign merchants

Hidden or refused for `isForeignMerchant`: pagosYa's own payment methods (QR, Tigo Money, Baneco, bank transfer, dLocal collection),
balance and payouts, ASFI verification levels (a foreign store needs an active Mercado Pago connection to publish instead), SIAT
invoicing, paid plans (free while we launch: the Gratis plan's YAPI credits, plus publishing, which Gratis normally keeps for
paid plans). Everything else works
as for a Bolivian merchant: YAPI, Studio, catalog, Shopify import, shipping settings, the store assistant, emails.

### 3.6 Signup

The dashboard's sign-up gains «País» (Bolivia preselected). The phone field uses that country's prefix; the terms shown are pagosYa's
general terms (the Bolivia-specific payment terms only for Bolivia). After signup a foreign merchant's first-run checklist starts with
«Conecta Mercado Pago».

## 4. Errors and edge cases

- Mercado Pago down or the token rejected at «Pagar»: the shopper sees «No pudimos abrir el pago. Inténtalo de nuevo.»; the order stays
  pending and expires like an abandoned cart.
- A webhook for an unknown order, a mismatched amount or currency: logged and ignored (never marks anything paid).
- A shopper paying twice (two tabs): the second payment is refunded automatically and the order stays paid once.
- A merchant who connects a Mercado Pago account from a different country than their pagosYa country: refused at connect («Tu cuenta
  de Mercado Pago es de otro país»).

## 5. Testing

- Unit: country table (currencies, minor digits, locales), money conversion to and from Mercado Pago for every currency (CLP/COP
  without decimals), webhook signature check, amount/currency matching, idempotency, Bolivia-only gates.
- Integration with a fake Mercado Pago (same approach as `dlocal-fixture-transport.ts`): connect → checkout → webhook → paid;
  cash pending → expired; refund.
- Live test mode: a Mexican test store paid by test card, an Argentine one paid by a cash method, one refund. Then one real small
  payment in live mode before announcing.

## 6. Open questions and risks (to settle before or during the plan)

1. **One Mercado Pago application for all seven countries?** Mercado Pago applications belong to a country «site»; an application may
   only authorize sellers of its own country. If so, the owner creates one application per country (seven sets of keys) and the
   provider picks by the merchant's country. To confirm against Mercado Pago's documentation and with a test seller per country.
2. **Legal:** pagosYa offers the platform to foreign sellers but never processes their money; terms and privacy text for non-Bolivian
   merchants need the owner's (and counsel's) review. No ASFI change is expected because the money does not pass through pagosYa.
3. **Taxes and invoices** for foreign merchants are their own (Mercado Pago gives them receipts); pagosYa issues none.
4. **Portuguese:** Brazilian merchants get Spanish until piece 2 ships.

## 7. Piece 2 (separate spec, next)

Language versions: Portuguese (Brazil) for the dashboard, Studio, YAPI's replies, the store's platform texts (cart, checkout, account,
emails) and help pages; the store's language follows its country; Spanish stays the default.
