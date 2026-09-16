import { createHmac, timingSafeEqual } from "node:crypto";

export function signDlocal(secretKey: string, login: string, xDate: string, body: string): string {
  return createHmac("sha256", secretKey).update(login + xDate + body).digest("hex");
}

export function verifyDlocalSignature(
  secretKey: string,
  login: string,
  xDate: string,
  body: string,
  authorization: string | undefined,
): boolean {
  const presented = authorization?.match(/Signature:\s*([0-9a-f]+)\s*$/i)?.[1];
  if (!secretKey || !presented) return false;
  const expected = Buffer.from(signDlocal(secretKey, login, xDate, body), "utf8");
  const given = Buffer.from(presented.toLowerCase(), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
