# pagosYa Developer API

This is the launch contract for merchant integrations. Interactive OpenAPI is available at `/docs` in development; production deployments keep it disabled unless `EXPOSE_API_DOCS=true` is explicitly set behind suitable access controls.

## Credentials

| Credential | Where it may be used | Purpose |
| --- | --- | --- |
| `sk_test_...` | Merchant backend only | Sandbox API operations |
| `sk_live_...` | Merchant backend only | Live API operations after KYC approval |
| `pk_test_...` / `pk_live_...` | Browser widget | Verifies merchant and test/live scope for embedded checkout |
| PaymentIntent `clientSecret` | Hosted checkout/widget | Scoped access to one payment |
| `whsec_...` | Webhook receiver backend only | Verifies webhook signatures |

Never expose an `sk_...` or `whsec_...` value in browser code, a mobile binary, logs, screenshots, or source control. Newly issued API keys and webhook secrets are returned once; later list operations return only safe metadata.

## Sandbox quickstart

Create a sandbox merchant with `POST /v1/merchants`, or obtain test keys from the merchant dashboard. Store the secret key in an environment variable.

```bash
export PAGOSYA_SECRET_KEY=sk_test_REPLACE_ME

curl https://api.pagosya.bo/v1/payment_intents \
  -X POST \
  -H "Authorization: Bearer $PAGOSYA_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-1234-create" \
  -d '{"amount":1000,"currency":"BOB","description":"Order #1234"}'
```

Amounts use minor units: `1000` means BOB 10.00. Send the returned `clientSecret`—never the secret API key—to checkout.

```ts
import PagosYa from "@pagosya/widget-js";

PagosYa("pk_test_REPLACE_ME").mount("#checkout", {
  clientSecret: paymentIntent.clientSecret,
  onSuccess: ({ paymentIntentId }) => console.log(paymentIntentId),
});
```

Treat a verified `payment_intent.succeeded` webhook as authoritative. A browser success callback alone is not proof of payment.

## API-key lifecycle

- `GET /v1/api_keys` lists labels, modes, types, masked values, and revocation state. It never returns a credential.
- `POST /v1/api_keys` issues a new key and returns `fullKey` once.
- `POST /v1/api_keys/:id/rotate` returns a replacement once and revokes the selected key.
- `DELETE /v1/api_keys/:id` revokes a key.

Creation, rotation, and revocation require a secret API key. A dashboard session may list masked metadata but cannot mint long-lived credentials. Live keys require approved KYC.

## Webhooks

Create a public HTTPS endpoint with `POST /v1/webhook_endpoints`. Private, loopback, link-local, reserved, credential-bearing, and redirect-based destinations are rejected. Store the returned `whsec_...` value immediately; `GET /v1/webhook_endpoints` deliberately omits it.

Each delivery body has this shape:

```json
{
  "id": "evt_...",
  "type": "payment_intent.succeeded",
  "createdAt": "2026-08-18T12:00:00.000Z",
  "data": { "id": "pi_..." }
}
```

The `pagosya-signature` header is `t=<milliseconds>,v1=<hex hmac>`. The HMAC-SHA256 input is the exact UTF-8 string `${t}.${rawBody}`. Verify the raw body before JSON parsing, enforce a timestamp tolerance, compare signatures in constant time, and deduplicate durable processing with `event.id`. The Node SDK provides `constructWebhookEvent` for this.

Return a 2xx response quickly. pagosYa retries failed deliveries with exponential backoff up to eight attempts; duplicate delivery must therefore be safe.

## pagosYa terms

pagosYa publishes its own versioned texts at `GET /v1/legal/merchant-terms`, `GET /v1/legal/buyer-terms` and `GET /v1/legal/privacy-policy` (a past version: `GET /v1/legal/:kind/:version`). Each response carries `version`, `title`, `body` (markdown), `sha256` and `effectiveAt`; a 404 means nothing is in force yet.

- **Merchant signup.** `POST /v1/merchants` accepts an optional `termsVersion`. Send the `version` your signup screen showed with a required "I accept" checkbox; an unknown or superseded version is rejected with 400 before the merchant is created. Once merchant terms are in force, KYC submission and payouts wait until the merchant has accepted them (the dashboard asks).
- **Custom checkouts.** Hosted checkout and the widget already do this. If you build your own payment form, show "Al pagar aceptas los Términos y la Política de privacidad de pagosYa" beside the pay button, linking to `https://pagosya.bo/terminos/compradores` and `https://pagosya.bo/privacidad`, and send the displayed versions as `buyerTermsVersion` and `buyerPrivacyVersion` on `POST /v1/payment_intents/:id/confirm`. A stale or unknown version is rejected with 400; omit both fields when no buyer terms are published.

## Límites por nivel

Every merchant has a verification level (Sin verificar / Persona / Negocio / Empresa) with a monthly payment-volume limit and a per-payment limit, both in BOB. Levels and limits are visible to the merchant in the dashboard alongside their current usage for the month.

- **`POST /v1/payment_intents`**, called by the merchant with their own secret key, refuses to create a live PaymentIntent above the merchant's per-payment limit: `403` with `{ "code": "per_payment_limit_exceeded", "message": "Este cobro supera el máximo por pago de tu nivel." }`. A merchant at level 0 (Sin verificar), or whose limits aren't configured for their level, gets this same `per_payment_limit_exceeded` response for any live charge — live charges need level 1 or above.
- Buyer-facing flows that create a PaymentIntent on the merchant's behalf (store cart checkout, payment links, debt-collection links, appointment deposits, etc.) never reveal the merchant's limit to the buyer. A charge over the merchant's per-payment limit gets `403` with `{ "code": "per_payment_limit_exceeded", "message": "Este comercio no puede recibir pagos en este momento." }`; a merchant at level 0 or with limits not configured gets `403` with `{ "code": "limit_exceeded", "message": "Este comercio no puede recibir pagos en este momento." }` instead — same neutral message either way, never an amount or a limit.
- **`POST /v1/payment_intents/:id/confirm`** refuses confirmation with `403` and the neutral `{ "code": "limit_exceeded", "message": "Este comercio no puede recibir pagos en este momento." }` when: the month's volume would exceed the merchant's monthly limit; the payment now exceeds the merchant's per-payment limit because the merchant's level or limits changed after the PaymentIntent was created; or the PaymentIntent's currency is neither BOB nor USD.
- A USD-priced PaymentIntent counts toward the limit at the exchange rate ops has configured (`usdToBobRate`), converted up to the nearest centavo. An international (dLocal) charge — priced and settled in another currency but originally quoted in BOB — counts at that original BOB amount, not the settlement currency amount.
- These checks only apply in **live mode**; `sk_test_...`/`pk_test_...` traffic is never limited, reserved, or counted toward a limit.
- Refunds do not free up room against the monthly limit.
- Merchants see their level, per-payment limit, and current month's usage in the merchant dashboard.

## Production checklist

- Complete KYC and use matching `pk_live_...` and `sk_live_...` credentials.
- If you run your own payment form, show pagosYa's buyer terms notice and send `buyerTermsVersion` on confirm.
- Keep API credentials in a secrets manager and rotate them periodically.
- Use a unique `Idempotency-Key` for every logical mutating operation.
- Refunds require an `Idempotency-Key` and reject any amount above the remaining unrefunded balance, including refunds currently in flight.
- Serve checkout and webhook endpoints over HTTPS.
- Verify every webhook before processing it and persist processed event IDs.
- Confirm order amounts and inventory on the merchant backend, not from browser input.
- Log pagosYa resource IDs but redact credentials and `clientSecret` values.
