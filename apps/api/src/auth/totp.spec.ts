import { base32Decode, base32Encode, generateTotpSecret, totpCode, totpEnrollment, verifyTotp } from "./totp";

// RFC 6238 appendix B, SHA-1 key "12345678901234567890" (the 6 low digits of its 8-digit codes).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpCode(RFC_SECRET, Math.floor(2000000000 / 30))).toBe("279037");
  });

  it("round-trips base32 and makes 160-bit secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("accepts the step before and after, refuses a reused or older step and bad input", () => {
    const at = new Date(1111111109 * 1000);
    const step = Math.floor(1111111109 / 30);
    expect(verifyTotp(RFC_SECRET, "081804", null, at)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), null, at)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 2), null, at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "081804", step, at)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "08 18 04", null, at)).toBe(step);
    for (const bad of ["", "12345", "abcdef", "1234567"]) expect(verifyTotp(RFC_SECRET, bad, null, at)).toBeNull();
  });

  it("gives an authenticator link and a QR image", async () => {
    const enrollment = await totpEnrollment(RFC_SECRET, "ana@pagosya.bo");
    expect(enrollment.uri).toBe(`otpauth://totp/pagosYa%3Aana%40pagosya.bo?secret=${RFC_SECRET}&issuer=pagosYa&algorithm=SHA1&digits=6&period=30`);
    expect(enrollment.qrDataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
