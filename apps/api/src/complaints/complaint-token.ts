import { createHmac, timingSafeEqual } from "node:crypto";

// Signed rather than stored, so a "received" email that failed can be re-sent with its link. Domain-separated from
// order tracking tokens, which sign the bare id with the same secret.
const signature = (complaintId: string, secret: string) => createHmac("sha256", secret).update(`complaint:${complaintId}`).digest();

export function createComplaintToken(complaintId: string, secret: string): string {
  return `${Buffer.from(complaintId, "utf8").toString("base64url")}.${signature(complaintId, secret).toString("base64url")}`;
}

export function readComplaintToken(token: string, secret: string): string | null {
  const [encodedId, encodedSignature, ...rest] = token.split(".");
  if (!encodedId || !encodedSignature || rest.length) return null;
  const complaintId = Buffer.from(encodedId, "base64url").toString("utf8");
  if (!/^c[a-z0-9]{20,40}$/i.test(complaintId)) return null;
  const supplied = Buffer.from(encodedSignature, "base64url");
  const expected = signature(complaintId, secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? complaintId : null;
}
