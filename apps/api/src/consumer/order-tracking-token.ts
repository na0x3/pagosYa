import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_CONTEXT = "pagosya-order-tracking-v1";

function signature(orderId: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${orderId}`).digest();
}

export function createOrderTrackingToken(orderId: string, secret: string): string {
  const encodedOrderId = Buffer.from(orderId, "utf8").toString("base64url");
  return `${encodedOrderId}.${signature(orderId, secret).toString("base64url")}`;
}

export function readOrderTrackingToken(token: string, secret: string): string | null {
  const [encodedOrderId, encodedSignature, ...rest] = token.split(".");
  if (!encodedOrderId || !encodedSignature || rest.length) return null;
  try {
    const orderId = Buffer.from(encodedOrderId, "base64url").toString("utf8");
    if (!/^c[a-z0-9]{20,40}$/i.test(orderId)) return null;
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(orderId, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    return orderId;
  } catch {
    return null;
  }
}
