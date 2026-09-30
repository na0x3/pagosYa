import { SubscriptionsService } from "./subscriptions.service";

function makePrisma() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", contactEmail: "tienda@mail.com" }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    subscriptionPlan: { findFirst: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentLink: { findFirst: jest.fn() },
    paymentIntent: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    storeOrder: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrderStatusEvent: { create: jest.fn() },
    deliveryAssignment: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ paymentIntentId: null, orderId: null }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma;
}
const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
const productSubscription = {
  id: "cm1sub0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "p1", variantId: null, extraIds: [],
  itemName: "Café 500 g", quantity: 2, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: { method: "delivery", zoneId: "zone_1", zoneName: "Centro", fee: 1500, address: "Calle 1" }, customerName: "Ana", customerEmail: "ana@mail.com",
  customerPhone: "70000000", status: "ACTIVE", missedCount: 0, amountOverride: null, nextAmountOverride: null,
  nextBillingAt: new Date(Date.now() + 48 * 3_600_000),
};

describe("product subscription renewals", () => {
  let prisma: any, paymentIntents: any, email: any, service: SubscriptionsService;
  beforeEach(() => {
    prisma = makePrisma();
    paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_r1", clientSecret: "pi_r1_secret" }) };
    email = { send: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(prisma, email, paymentIntents, config as never);
    prisma.customerSubscription.findMany.mockResolvedValue([productSubscription]);
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", status: "ACTIVE", fulfillmentType: "PHYSICAL", stock: null, variants: [] });
    prisma.subscriptionInvoice.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: productSubscription.nextBillingAt, dueAt: productSubscription.nextBillingAt, amount: 15900, currency: "BOB" });
    prisma.storeOrder.create.mockResolvedValue({ id: "order_r1" });
  });

  it("creates the renewal order, its intent with metadata.cart, and emails the pay and manage links 72 h ahead", async () => {
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 15900, customerEmail: "ana@mail.com",
      metadata: expect.objectContaining({
        cart: [expect.objectContaining({ paymentLinkId: "p1", quantity: 2, unitAmount: 7200 })],
        shipping: expect.objectContaining({ id: "zone_1", amount: 1500 }),
        subscription: expect.objectContaining({ subscriptionId: productSubscription.id, invoiceId: "inv_1" }),
      }),
    }));
    expect(prisma.storeOrder.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ paymentIntentId: "pi_r1", status: "AWAITING_PAYMENT", amount: 15900, fulfillmentMethod: "delivery" }) }));
    expect(prisma.deliveryAssignment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ orderId: "order_r1", zoneId: "zone_1", fee: 1500 }) }));
    expect(prisma.subscriptionInvoice.update).toHaveBeenCalledWith({ where: { id: "inv_1" }, data: { orderId: "order_r1" } });
    const sent = email.send.mock.calls[0][0];
    expect(sent.subject).toContain("Tu pedido de Café 500 g está listo");
    expect(sent.body).toContain("/suscripcion/");
    expect(sent.body).toContain("No se cobra nada automáticamente.");
  });

  it("waits until 72 h before the renewal date", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, nextBillingAt: new Date(Date.now() + 80 * 3_600_000) }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("reuses the renewal order on a second run", async () => {
    prisma.subscriptionInvoice.findUnique.mockResolvedValue({ id: "inv_1", periodStart: productSubscription.nextBillingAt, dueAt: productSubscription.nextBillingAt, amount: 15900, currency: "BOB", paymentIntentId: "pi_r1", orderId: "order_r1" });
    prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "pi_r1_secret" });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.storeOrder.create).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it("skips the period and tells the buyer when the product is out of stock", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", status: "ACTIVE", fulfillmentType: "PHYSICAL", stock: 1, variants: [] });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: "SKIPPED" }) }));
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { nextBillingAt: expect.any(Date) } }));
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("no está disponible") }));
  });

  it("cancels the subscription when the product was archived", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: productSubscription.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) }));
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("expires unpaid renewals at D+7 and cancels intent and order", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 1 });
    const result = await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: "DUE", orderId: { not: null } }) }));
    expect(prisma.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_r1", status: { in: ["REQUIRES_PAYMENT_METHOD", "FAILED"] } }, data: { status: "CANCELED" } });
    expect(prisma.storeOrder.updateMany).toHaveBeenCalledWith({ where: { id: "order_r1", status: "AWAITING_PAYMENT" }, data: { status: "CANCELED" } });
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "DUE" }, data: { status: "MISSED" } });
    expect(result).toEqual({ missed: 1, paused: 0 });
  });

  it("pauses after two consecutive misses and tells buyer and merchant", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_2", subscriptionId: productSubscription.id, orderId: "order_r2", paymentIntentId: "pi_r2", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 2 });
    const result = await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: productSubscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: expect.any(Date) } });
    expect(result.paused).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(2);
  });

  it("sends the last reminder three days after the renewal date, only for product renewals", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", reminderCount: 1, dueAt: new Date(Date.now() - 4 * 86_400_000), amount: 15900, currency: "BOB" }]);
    prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "x" });
    await service.sendDueSubscriptionReminders("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.findMany.mock.calls[0][0].where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ orderId: { not: null }, reminderCount: 1 })]));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("Último recordatorio") }));
  });
});
