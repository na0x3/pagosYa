import { createHmac } from "node:crypto";

/** Stripe-style signature header: `t=<timestamp>,v1=<hmac>` over `${timestamp}.${rawBody}`. */
export function signWebhookBody(secret: string, rawBody: string, timestamp = Date.now()): string {
  const signedPayload = `${timestamp}.${rawBody}`;
  const hmac = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}
