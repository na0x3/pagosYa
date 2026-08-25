# pagosYa Node.js SDK

Official server-side SDK for the pagosYa payments API. Requires Node.js 20 or newer.

```bash
npm install @pagosya/sdk-node
```

```ts
import { PagosYa } from "@pagosya/sdk-node";

const pagosYa = new PagosYa(process.env.PAGOSYA_SECRET_KEY!);
const payment = await pagosYa.paymentIntents.create(
  { amount: 1000, currency: "BOB", description: "Order #1234" },
  { idempotencyKey: crypto.randomUUID() },
);

// Send only payment.clientSecret to the hosted checkout/widget.
console.log(payment.id, payment.clientSecret);
```

Refunds require an explicit stable idempotency key for the logical refund:

```ts
await pagosYa.refunds.create(
  { paymentIntentId: payment.id, amount: 500 },
  { idempotencyKey: `order-1234-refund-1` },
);
```

Secret keys (`sk_test_...` and `sk_live_...`) belong only on your server. Never include one in browser code, a mobile binary, logs, or source control.

## Verify webhooks

Pass the exact raw request body to `constructWebhookEvent`; do not parse and re-serialize it first.

```ts
import express from "express";
import { constructWebhookEvent } from "@pagosya/sdk-node";

const app = express();
app.post("/webhooks/pagosya", express.raw({ type: "application/json" }), (req, res) => {
  const event = constructWebhookEvent(
    req.body,
    String(req.headers["pagosya-signature"] ?? ""),
    process.env.PAGOSYA_WEBHOOK_SECRET!,
  );

  // Deduplicate durable work with event.id before processing event.data.
  res.sendStatus(204);
});
```

The endpoint creation response includes its `whsec_...` secret once. Subsequent list calls omit it.
