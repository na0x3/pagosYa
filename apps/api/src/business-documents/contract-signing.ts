import { BadRequestException } from "@nestjs/common";
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * D3 signing primitives: the 6-digit email code (kept only as an HMAC bound to the document
 * and a per-code nonce), the masked address shown to the signer, the drawn-signature check and
 * the Bolivia timestamps printed on the evidence page.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_COOLDOWN_MS = 60 * 1000;
export const CODES_PER_DAY = 5;
/** A verified code lets the signer finish within this window (same version). */
export const VERIFIED_TTL_MS = 30 * 60 * 1000;
/** A drawn signature: a small PNG data URL. */
export const MAX_SIGNATURE_IMAGE = 60_000;

export function generateSigningCode(random: (max: number) => number = (max) => randomInt(max)): string {
  return String(random(1_000_000)).padStart(6, "0");
}

export function hashSigningCode(secret: string, documentId: string, nonce: string, code: string): string {
  return createHmac("sha256", secret).update(`${documentId}:${nonce}:${code}`).digest("hex");
}

export function codeMatches(secret: string, documentId: string, nonce: string, typed: string, hash: string): boolean {
  const code = String(typed ?? "").replace(/\D/g, "");
  if (code.length !== 6 || !/^[0-9a-f]{64}$/.test(hash)) return false;
  return timingSafeEqual(Buffer.from(hashSigningCode(secret, documentId, nonce, code), "hex"), Buffer.from(hash, "hex"));
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** null when no drawing; the same string when it is a real, small PNG; 400 otherwise. */
export function signatureImage(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new BadRequestException("La firma dibujada debe ser una imagen PNG.");
  if (value.length > MAX_SIGNATURE_IMAGE) throw new BadRequestException("La firma dibujada es demasiado grande. Bórrala y dibújala de nuevo.");
  const head = Buffer.from(match[1].slice(0, 16), "base64");
  if (head.length < 8 || !head.subarray(0, 8).equals(PNG_MAGIC)) throw new BadRequestException("La firma dibujada debe ser una imagen PNG.");
  return value;
}

export function boliviaTime(value: Date | string): string {
  const shifted = new Date(new Date(value).getTime() - 4 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(shifted.getUTCDate())}/${pad(shifted.getUTCMonth() + 1)}/${shifted.getUTCFullYear()} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())} (hora de Bolivia, UTC−4)`;
}

/** Which dashboard session signed, without storing the session token. */
export function sessionRef(token: string | null | undefined): string | null {
  return token ? createHash("sha256").update(token).digest("hex").slice(0, 16) : null;
}
