import { createHmac, randomBytes, randomInt } from "node:crypto";

const developmentSecret = "pagosya-events-development-token-secret-change-me";

export function tokenSecret(): string {
  const configured = process.env.EVENT_TOKEN_SECRET;
  if (process.env.NODE_ENV === "production" && (!configured || configured.length < 32)) {
    throw new Error("EVENT_TOKEN_SECRET must contain at least 32 characters in production");
  }
  return configured || developmentSecret;
}

export function digestEventToken(token: string): string {
  return createHmac("sha256", tokenSecret()).update(token, "utf8").digest("hex");
}

export function secureToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function admissionCode(): string {
  return `ADM-${randomBytes(6).toString("base64url").toUpperCase()}`;
}

export function enrollmentCode(): string {
  return String(randomInt(100000, 1_000_000));
}
