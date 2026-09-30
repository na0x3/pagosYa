import { createHmac, timingSafeEqual } from "crypto";

/** Public "manage my subscription" link: same scheme as order tracking, its own context. */
const TOKEN_CONTEXT = "pagosya-subscription-manage-v1";

function signature(subscriptionId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${subscriptionId}`).digest();
}

export function createSubscriptionManageToken(subscriptionId: string, secret: string): string {
  return `${Buffer.from(subscriptionId, "utf8").toString("base64url")}.${signature(subscriptionId, secret).toString("base64url")}`;
}

export function readSubscriptionManageToken(token: string, secret: string): string | null {
  const [encodedId, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !encodedSignature || rest.length) return null;
  try {
    const subscriptionId = Buffer.from(encodedId, "base64url").toString("utf8");
    if (!/^c[a-z0-9]{20,40}$/i.test(subscriptionId)) return null;
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(subscriptionId, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    return subscriptionId;
  } catch {
    return null;
  }
}

export function subscriptionManageUrl(checkoutOrigin: string, subscriptionId: string, secret: string): string {
  return `${checkoutOrigin.replace(/\/$/, "")}/suscripcion/${createSubscriptionManageToken(subscriptionId, secret)}`;
}
