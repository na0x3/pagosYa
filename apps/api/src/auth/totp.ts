import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import * as QRCode from "qrcode";

/**
 * Time-based one-time codes (RFC 6238: HMAC-SHA1, 6 digits, 30 s), the codes Google Authenticator, Microsoft
 * Authenticator, 1Password and Authy show. Used for the second factor of ops staff (ISO A-01) and merchants (M-09).
 * The secret is stored encrypted (src/prisma/field-encryption.ts); a code is accepted once (the step it matched is kept).
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const WINDOW = 1; // the step before and after, for a phone clock a little off
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = () => base32Encode(randomBytes(20));

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const totpStep = (at: Date = new Date()) => Math.floor(at.getTime() / 1000 / STEP_SECONDS);

/**
 * The step a code matches, or null. A step at or before `lastStep` is refused, so a code seen over a shoulder or in a
 * log cannot be used a second time.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null | undefined, at: Date = new Date()): number | null {
  const presented = String(code ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(presented)) return null;
  const now = totpStep(at);
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (lastStep != null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(presented))) return step;
  }
  return null;
}

/** What an authenticator app scans: the otpauth:// link and the same as a QR image (data: URL). */
export async function totpEnrollment(secret: string, account: string, issuer = "pagosYa") {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}
