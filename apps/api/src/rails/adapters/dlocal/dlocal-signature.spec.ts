import { createHmac } from "node:crypto";
import { signDlocal, verifyDlocalSignature } from "./dlocal-signature";

describe("dLocal signature", () => {
  const secret = "secret_fixture";
  const login = "login_fixture";
  const xDate = "2026-09-17T12:00:00.000Z";
  const body = '{"amount":100.58}';
  const expected = createHmac("sha256", secret).update(login + xDate + body).digest("hex");

  it("signs login + date + body with HMAC-SHA256 hex", () => {
    expect(signDlocal(secret, login, xDate, body)).toBe(expected);
  });

  it("accepts the V2 authorization header it would produce", () => {
    expect(verifyDlocalSignature(secret, login, xDate, body, `V2-HMAC-SHA256, Signature: ${expected}`)).toBe(true);
  });

  it("rejects a tampered body, a missing header, and a wrong-length signature", () => {
    expect(verifyDlocalSignature(secret, login, xDate, body + " ", `V2-HMAC-SHA256, Signature: ${expected}`)).toBe(false);
    expect(verifyDlocalSignature(secret, login, xDate, body, undefined)).toBe(false);
    expect(verifyDlocalSignature(secret, login, xDate, body, "V2-HMAC-SHA256, Signature: abc")).toBe(false);
  });
});
