import { boliviaTime, codeMatches, generateSigningCode, hashSigningCode, maskEmail, sessionRef, signatureImage } from "./contract-signing";

// A 1x1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("signing codes", () => {
  it("are six digits, zero-padded", () => {
    expect(generateSigningCode(() => 42)).toBe("000042");
    expect(generateSigningCode()).toMatch(/^\d{6}$/);
  });

  it("are stored only as an HMAC bound to the document and a nonce, and compared in constant time", () => {
    const hash = hashSigningCode("secret", "doc1", "nonce1", "123456");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("123456");
    expect(hashSigningCode("secret", "doc1", "nonce2", "123456")).not.toBe(hash);
    expect(hashSigningCode("secret", "doc2", "nonce1", "123456")).not.toBe(hash);
    expect(codeMatches("secret", "doc1", "nonce1", " 123 456 ", hash)).toBe(true);
    expect(codeMatches("secret", "doc1", "nonce1", "123457", hash)).toBe(false);
    expect(codeMatches("secret", "doc1", "nonce1", "abc", hash)).toBe(false);
  });
});

describe("maskEmail", () => {
  it("shows only enough to recognise the address", () => {
    expect(maskEmail("ana.quispe@gmail.com")).toBe("a***@gmail.com");
    expect(maskEmail("x@y.bo")).toBe("x***@y.bo");
  });
});

describe("signatureImage", () => {
  it("accepts a real PNG data URL under the cap", () => {
    expect(signatureImage(PNG)).toBe(PNG);
    expect(signatureImage(undefined)).toBeNull();
    expect(signatureImage("")).toBeNull();
  });

  it("refuses anything else", () => {
    expect(() => signatureImage("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toThrow(/imagen/);
    expect(() => signatureImage("data:image/png;base64,SGVsbG8gd29ybGQ=")).toThrow(/imagen/);
    expect(() => signatureImage("javascript:alert(1)")).toThrow(/imagen/);
    expect(() => signatureImage(`data:image/png;base64,iVBORw0KGgo${"A".repeat(60_000)}`)).toThrow(/grande/);
  });
});

describe("boliviaTime and sessionRef", () => {
  it("formats in La Paz time (UTC-4)", () => {
    expect(boliviaTime(new Date("2026-09-25T18:03:07Z"))).toBe("25/09/2026 14:03:07 (hora de Bolivia, UTC−4)");
  });

  it("references a session without keeping its token", () => {
    expect(sessionRef("dash_abc")).toMatch(/^[0-9a-f]{16}$/);
    expect(sessionRef(undefined)).toBeNull();
  });
});
