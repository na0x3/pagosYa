import {
  advanceBillingDate, cadenceInterval, cadenceLabel, isCadence, monthlyFactor, productSubscriptionKey,
  subscriptionConsentText, subscriptionPrices, subscriptionTerms,
} from "./subscription-pricing";

describe("subscription pricing", () => {
  it("discounts the base price and keeps extras at full price", () => {
    expect(subscriptionPrices({ baseAmount: 8000, oneTimeAmount: 8000, extrasAmount: 500, discountPercent: 10 }))
      .toEqual({ firstUnitAmount: 7700, lockedUnitAmount: 7700 });
  });
  it("uses a lower sale price for the first order but locks the subscription price", () => {
    expect(subscriptionPrices({ baseAmount: 8000, oneTimeAmount: 6000, extrasAmount: 0, discountPercent: 10 }))
      .toEqual({ firstUnitAmount: 6000, lockedUnitAmount: 7200 });
  });
  it("rounds to the nearest minor unit", () => {
    expect(subscriptionPrices({ baseAmount: 999, oneTimeAmount: 999, extrasAmount: 0, discountPercent: 15 }).lockedUnitAmount).toBe(849);
  });
  it("labels and maps cadences", () => {
    expect(isCadence("BIWEEKLY")).toBe(true);
    expect(isCadence("DAILY")).toBe(false);
    expect(cadenceLabel("BIWEEKLY")).toBe("cada dos semanas");
    expect(cadenceInterval("BIWEEKLY")).toEqual({ interval: "WEEKLY", count: 2 });
    expect(cadenceInterval("MONTHLY")).toEqual({ interval: "MONTHLY", count: 1 });
  });
  it("advances weekly, monthly and yearly in UTC", () => {
    const start = new Date("2026-01-15T12:00:00Z");
    expect(advanceBillingDate(start, "WEEKLY", 2).toISOString()).toBe("2026-01-29T12:00:00.000Z");
    expect(advanceBillingDate(start, "MONTHLY", 1).toISOString()).toBe("2026-02-15T12:00:00.000Z");
    expect(advanceBillingDate(start, "YEARLY", 1).toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });
  it("normalises to 30 days", () => {
    expect(monthlyFactor("WEEKLY", 1)).toBeCloseTo(30 / 7);
    expect(monthlyFactor("WEEKLY", 2)).toBeCloseTo(30 / 14);
    expect(monthlyFactor("MONTHLY", 1)).toBe(1);
    expect(monthlyFactor("YEARLY", 1)).toBeCloseTo(1 / 12);
  });
  it("writes the exact consent text", () => {
    expect(subscriptionConsentText("MONTHLY")).toBe("Acepto que este pedido se repita cada mes. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.");
  });
  it("keys a product subscription by line and email regardless of extras order or email case", () => {
    const a = productSubscriptionKey("s1", { paymentLinkId: "p1", variantId: "v1", extraIds: ["b", "a"] }, "Ana@Mail.com");
    const b = productSubscriptionKey("s1", { paymentLinkId: "p1", variantId: "v1", extraIds: ["a", "b"] }, "ana@mail.com");
    expect(a).toBe(b);
    expect(productSubscriptionKey("s1", { paymentLinkId: "p1" }, "ana@mail.com")).not.toBe(a);
  });
});

describe("subscriptionTerms", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  it("reads a plan subscription from its plan", () => {
    expect(subscriptionTerms({ planId: "plan_1", paymentLinkId: null, amountOverride: null, nextAmountOverride: 1200 },
      { id: "plan_1", name: "Café mensual", amount: 1000, currency: "BOB", interval: "MONTHLY", intervalCount: 1, reminderHoursBefore: 24 }, now))
      .toEqual({ name: "Café mensual", interval: "MONTHLY", count: 1, amount: 1200, currency: "BOB", noticeHours: 24, product: false });
  });
  it("reads a product subscription from its locked price, quantity and delivery fee", () => {
    expect(subscriptionTerms({ planId: null, paymentLinkId: "p1", itemName: "Café 500 g", cadence: "BIWEEKLY", unitAmount: 7200, quantity: 2, currency: "BOB",
      pendingUnitAmount: null, pendingFrom: null, fulfillment: { fee: 1500 } }, null, now))
      .toEqual({ name: "Café 500 g", interval: "WEEKLY", count: 2, amount: 15900, currency: "BOB", noticeHours: 72, product: true });
  });
  it("applies a pending price only once it is effective", () => {
    const sub = { planId: null, paymentLinkId: "p1", itemName: "Café", cadence: "MONTHLY", unitAmount: 7200, quantity: 1, currency: "BOB",
      pendingUnitAmount: 8000, pendingFrom: new Date("2026-10-05T00:00:00Z"), fulfillment: null };
    expect(subscriptionTerms(sub, null, now)!.amount).toBe(7200);
    expect(subscriptionTerms(sub, null, new Date("2026-10-06T00:00:00Z"))!.amount).toBe(8000);
  });
  it("returns null for a plan subscription without its plan or a broken product subscription", () => {
    expect(subscriptionTerms({ planId: "plan_1", paymentLinkId: null }, null, now)).toBeNull();
    expect(subscriptionTerms({ planId: null, paymentLinkId: "p1", cadence: null, unitAmount: null }, null, now)).toBeNull();
  });
});
