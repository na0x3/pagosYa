import { admissionCode, digestEventToken, enrollmentCode, secureToken, tokenSecret } from "./event-security";

describe("event security tokens", () => {
  const originalEnvironment = process.env.NODE_ENV;
  const originalSecret = process.env.EVENT_TOKEN_SECRET;

  afterEach(() => {
    process.env.NODE_ENV = originalEnvironment;
    if (originalSecret === undefined) delete process.env.EVENT_TOKEN_SECRET;
    else process.env.EVENT_TOKEN_SECRET = originalSecret;
  });

  it("creates high-entropy, non-sequential bearer tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => secureToken()));
    expect(tokens.size).toBe(100);
    expect([...tokens].every((token) => token.length >= 43)).toBe(true);
  });

  it("stores deterministic token digests without retaining the bearer token", () => {
    process.env.EVENT_TOKEN_SECRET = "unit-test-secret-with-at-least-32-characters";
    const token = secureToken();
    expect(digestEventToken(token)).toBe(digestEventToken(token));
    expect(digestEventToken(token)).not.toContain(token);
  });

  it("creates six-digit enrollment codes and opaque admission codes", () => {
    expect(enrollmentCode()).toMatch(/^\d{6}$/);
    expect(admissionCode()).toMatch(/^ADM-[A-Z0-9_-]{8}$/);
  });

  it("fails closed when the production token secret is weak", () => {
    process.env.NODE_ENV = "production";
    process.env.EVENT_TOKEN_SECRET = "short";
    expect(() => tokenSecret()).toThrow("at least 32 characters");
  });
});
