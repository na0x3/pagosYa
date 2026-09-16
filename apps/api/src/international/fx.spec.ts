import { FxRateUnavailableError, invoiceAmountFor, pricingForRail, resolveChargeAmount } from "./fx";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("resolveChargeAmount", () => {
  it("converts BOB cents to USD cents, rounding up, and snapshots the rate", () => {
    expect(resolveChargeAmount({ amount: 70000, currency: "BOB", metadata: {} }, true, 6.96, now)).toEqual({
      amount: 10058, currency: "USD",
      fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "2026-09-17T12:00:00.000Z" },
    });
  });

  it("re-converts from the original BOB amount on a retry, never from the already-converted USD", () => {
    const retried = { amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "x" } } };
    expect(resolveChargeAmount(retried, true, 7, now)).toMatchObject({ amount: 10000, currency: "USD", fx: { originalAmount: 70000, rate: 7 } });
  });

  it("restores the BOB amount when a converted intent is retried domestically", () => {
    const retried = { amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "x" } } };
    expect(resolveChargeAmount(retried, false, 6.96, now)).toEqual({ amount: 70000, currency: "BOB", fx: null });
  });

  it("leaves USD intents unconverted and domestic intents untouched", () => {
    expect(resolveChargeAmount({ amount: 500, currency: "USD", metadata: null }, true, 6.96, now)).toEqual({ amount: 500, currency: "USD", fx: null });
    expect(resolveChargeAmount({ amount: 500, currency: "BOB", metadata: null }, false, 0, now)).toEqual({ amount: 500, currency: "BOB", fx: null });
  });

  it("refuses to convert without a rate", () => {
    expect(() => resolveChargeAmount({ amount: 500, currency: "BOB", metadata: null }, true, 0, now)).toThrow(FxRateUnavailableError);
  });
});

describe("pricingForRail / invoiceAmountFor", () => {
  it("uses international pricing only for dlocal", () => {
    expect(pricingForRail("dlocal", { intlFeeBps: 590, costBps: 420 })).toEqual({ feeBps: 590, railCostBps: 420 });
    expect(pricingForRail("mock_card", { intlFeeBps: 590, costBps: 420 })).toEqual({ feeBps: 250, railCostBps: 0 });
  });

  it("invoices converted intents in the original BOB amount", () => {
    expect(invoiceAmountFor({ amount: 10058, currency: "USD", metadata: { fx: { originalAmount: 70000, originalCurrency: "BOB" } } })).toEqual({ amount: 70000, currency: "BOB" });
    expect(invoiceAmountFor({ amount: 500, currency: "BOB", metadata: {} })).toEqual({ amount: 500, currency: "BOB" });
  });
});
