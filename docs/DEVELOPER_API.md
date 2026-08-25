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

## Production checklist

- Complete KYC and use matching `pk_live_...` and `sk_live_...` credentials.
- Keep API credentials in a secrets manager and rotate them periodically.
- Use a unique `Idempotency-Key` for every logical mutating operation.
- Refunds require an `Idempotency-Key` and reject any amount above the remaining unrefunded balance, including refunds currently in flight.
- Serve checkout and webhook endpoints over HTTPS.
- Verify every webhook before processing it and persist processed event IDs.
- Confirm order amounts and inventory on the merchant backend, not from browser input.
- Log pagosYa resource IDs but redact credentials and `clientSecret` values.
