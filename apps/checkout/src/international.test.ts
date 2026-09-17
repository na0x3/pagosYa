import { describe, expect, it } from "vitest";
import { INTERNATIONAL_COUNTRIES, formatDualAmount, formatUsd, isNavigableRedirect, parseReturnParams, recallReturn, rememberReturn, tokenForMethod } from "./international";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => void data.set(k, v),
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("isNavigableRedirect", () => {
  it("only lets the checkout navigate to https payment pages", () => {
    expect(isNavigableRedirect("https://sandbox.dlocal.com/pay/abc", false)).toBe(true);
    expect(isNavigableRedirect("http://sandbox.dlocal.com/pay/abc", false)).toBe(false);
    expect(isNavigableRedirect("javascript:alert(1)", false)).toBe(false);
    expect(isNavigableRedirect("data:text/html,<script>alert(1)</script>", false)).toBe(false);
    expect(isNavigableRedirect("/relative/path", false)).toBe(false);
    expect(isNavigableRedirect("", false)).toBe(false);
  });

  it("allows http only in development (the fixture redirect points at the local checkout)", () => {
    expect(isNavigableRedirect("http://localhost:5173/?intl_return=1&pi=pi_1", true)).toBe(true);
    expect(isNavigableRedirect("javascript:alert(1)", true)).toBe(false);
  });
});

describe("international checkout helpers", () => {
  it("never offers Bolivia as a foreign country and lists countries alphabetically", () => {
    expect(INTERNATIONAL_COUNTRIES.some((c) => c.code === "BO")).toBe(false);
    const names = INTERNATIONAL_COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "es")));
  });

  it("formats both amounts", () => {
    expect(formatDualAmount(70000, "BOB", 10058)).toBe("Bs 700,00 ≈ USD 100,58");
  });

  it("formats a plain USD amount", () => {
    expect(formatUsd(10058)).toBe("USD 100,58");
  });

  it("keeps the client secret in storage, not the URL, and forgets it after reading", () => {
    const storage = memoryStorage();
    rememberReturn(storage, "pi_1", "cs_secret");
    expect(recallReturn(storage, "pi_1")).toBe("cs_secret");
    expect(recallReturn(storage, "pi_1")).toBeNull();
  });

  it("parses the dLocal return URL", () => {
    expect(parseReturnParams("?intl_return=1&pi=pi_1")).toEqual({ paymentIntentId: "pi_1" });
    expect(parseReturnParams("?pi=pi_1")).toBeNull();
    expect(parseReturnParams("?intl_return=1")).toBeNull();
  });

  it("builds confirm payment methods for cards and local methods", () => {
    expect(tokenForMethod({ id: "CARD", kind: "CARD" })).toEqual({ type: "CARD", token: "dlocal:CARD", metadata: { dlocalPaymentMethodId: "CARD" } });
    expect(tokenForMethod({ id: "PX", kind: "LOCAL_METHOD" })).toEqual({ type: "LOCAL_METHOD", token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } });
  });
});
