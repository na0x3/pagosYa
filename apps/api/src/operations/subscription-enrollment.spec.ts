import { Logger } from "@nestjs/common";
import { createSubscriptionsFromOrder } from "./subscription-enrollment";
import { productSubscriptionKey } from "./subscription-pricing";

function makeTx() {
  return {
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: "p1", fulfillmentType: "PHYSICAL", variants: [], name: "Café 500 g" }]) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: "p1", cadence: "MONTHLY", discountPercent: 10 }]) },
    customerSubscription: {
      findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValue([{ id: "cm1sub0000000000000000001", activeKey: productSubscriptionKey("store_1", { paymentLinkId: "p1", variantId: null, extraIds: [] }, "ana@mail.com") }]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}
const order = { id: "order_1", storeId: "store_1", merchantId: "m1", fulfillmentMethod: "pickup", fulfillmentLocationId: "loc_1", fulfillmentLocationName: "Centro" };
const manage = { checkoutOrigin: "https://pagar.test", secret: "s" };
const subscriptionLine = { paymentLinkId: "p1", name: "Café 500 g", quantity: 2, unitAmount: 7200, subscription: { cadence: "MONTHLY", discountPercent: 10, lockedUnitAmount: 7200 } };
const oneTimeLine = { paymentLinkId: "p1", name: "Café 500 g", quantity: 1, unitAmount: 8000 };
const intent = (metadata: object) => ({ id: "pi_1", livemode: true, currency: "BOB", customerName: "Ana", customerEmail: "Ana@Mail.com", customerPhone: "70000000", consumerUserId: null, metadata });
const now = new Date("2026-10-01T15:00:00Z");

describe("createSubscriptionsFromOrder", () => {
  beforeEach(() => { jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());

  it("creates one subscription per subscription line with the locked price, consent and first renewal date", async () => {
    const tx = makeTx();
    const result = await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine, oneTimeLine], subscriptionConsent: { text: "Acepto…", at: now.toISOString() } }), order, manage, now });
    expect(tx.customerSubscription.createMany).toHaveBeenCalledWith({ skipDuplicates: true, data: [expect.objectContaining({
      storeId: "store_1", merchantId: "m1", paymentLinkId: "p1", quantity: 2, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200,
      currency: "BOB", customerEmail: "ana@mail.com", sourceOrderId: "order_1", consentText: "Acepto…",
      nextBillingAt: new Date("2026-11-01T15:00:00Z"), fulfillment: expect.objectContaining({ method: "pickup", locationId: "loc_1", fee: 0 }),
    })] });
    expect(result.created).toBe(1);
    expect(result.emailBlock).toContain("Suscripción: Café 500 g · cada mes");
    expect(result.emailBlock).toContain("https://pagar.test/suscripcion/");
    expect(result.emailBlock).toContain("no se cobra nada automáticamente");
  });

  it("does nothing for a renewal intent or a cart without subscription lines", async () => {
    const tx = makeTx();
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine], subscription: { invoiceId: "inv_1" } }), order, manage, now })).resolves.toEqual({ created: 0, duplicates: [], emailBlock: "" });
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [oneTimeLine] }), order, manage, now })).resolves.toEqual({ created: 0, duplicates: [], emailBlock: "" });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
  });

  it("skips lines whose product changed between checkout and payment, without throwing", async () => {
    const tx = makeTx();
    tx.paymentLink.findMany.mockResolvedValue([]);
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now })).resolves.toMatchObject({ created: 0 });
    tx.paymentLink.findMany.mockResolvedValue([{ id: "p1", fulfillmentType: "PHYSICAL", variants: [], name: "Café 500 g" }]);
    tx.productSubscriptionOption.findMany.mockResolvedValue([]);
    await expect(createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now })).resolves.toMatchObject({ created: 0 });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
  });

  it("reports a subscription the buyer already has instead of creating a second one", async () => {
    const tx = makeTx();
    tx.customerSubscription.findMany.mockReset().mockResolvedValue([{ activeKey: productSubscriptionKey("store_1", { paymentLinkId: "p1", variantId: null, extraIds: [] }, "ana@mail.com") }]);
    const result = await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine] }), order, manage, now });
    expect(tx.customerSubscription.createMany).not.toHaveBeenCalled();
    expect(result.duplicates).toEqual(["Café 500 g"]);
    expect(result.emailBlock).toContain("Ya tenías una suscripción a Café 500 g");
  });

  it("skips everything without an email", async () => {
    const tx = makeTx();
    await expect(createSubscriptionsFromOrder(tx as never, { intent: { ...intent({ cart: [subscriptionLine] }), customerEmail: null }, order, manage, now })).resolves.toMatchObject({ created: 0 });
  });

  it("stores BOB when the first payment was converted to USD by dLocal", async () => {
    const tx = makeTx();
    const fx = { originalAmount: 14400, originalCurrency: "BOB", rate: 6.96, convertedAt: now.toISOString() };
    const result = await createSubscriptionsFromOrder(tx as never, { intent: { ...intent({ cart: [subscriptionLine], fx }), currency: "USD" }, order, manage, now });
    expect(tx.customerSubscription.createMany.mock.calls[0][0].data[0].currency).toBe("BOB");
    expect(result.emailBlock).toContain("144.00 BOB");
    expect(result.emailBlock).not.toContain("USD");
  });

  it("snapshots zone delivery with its fee", async () => {
    const tx = makeTx();
    await createSubscriptionsFromOrder(tx as never, { intent: intent({ cart: [subscriptionLine], shipping: { id: "zone_1", name: "Centro", amount: 1500, address: "Calle 1" } }), order: { ...order, fulfillmentMethod: "delivery", fulfillmentLocationId: null, fulfillmentLocationName: null }, manage, now });
    expect(tx.customerSubscription.createMany.mock.calls[0][0].data[0].fulfillment).toEqual(expect.objectContaining({ method: "delivery", zoneId: "zone_1", fee: 1500, address: "Calle 1" }));
  });
});
