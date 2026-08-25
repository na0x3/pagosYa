import { createHmac, timingSafeEqual } from "node:crypto";

export interface PagosYaWebhookEvent<T = unknown> {
  id: string;
  type: string;
  createdAt: string;
  data: T;
}

export class PagosYaWebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PagosYaWebhookSignatureError";
  }
}

/** Verify a webhook against the exact, unparsed request body before using its contents. */
export function constructWebhookEvent<T = unknown>(
  rawBody: string | Buffer,
  signatureHeader: string,
  secret: string,
  toleranceSeconds = 300,
): PagosYaWebhookEvent<T> {
  const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  const parts = signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestampText = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  const timestamp = Number(timestampText);
  if (!timestampText || !Number.isFinite(timestamp) || signatures.length === 0) {
    throw new PagosYaWebhookSignatureError("Malformed pagosya-signature header");
  }

  const ageMs = Math.abs(Date.now() - timestamp);
  if (ageMs > toleranceSeconds * 1000) {
    throw new PagosYaWebhookSignatureError("Webhook signature timestamp is outside the allowed tolerance");
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const matches = signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    const received = Buffer.from(candidate, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
  if (!matches) throw new PagosYaWebhookSignatureError("Invalid webhook signature");

  try {
    return JSON.parse(body) as PagosYaWebhookEvent<T>;
  } catch {
    throw new PagosYaWebhookSignatureError("Webhook body is not valid JSON");
  }
}
