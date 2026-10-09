import { SubscriptionsService } from "./subscriptions.service";

function makePrisma() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", contactEmail: "tienda@mail.com", membershipGraceDays: 7 }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    subscriptionPlan: { findFirst: jest.fn() },
    membershipPeriod: { findMany: jest.fn().mockResolvedValue([{ id: "m1", months: 1, amount: 5500 }, { id: "m12", months: 12, amount: 48000 }]) },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", status: "ACTIVE", fulfillmentType: "MEMBERSHIP" }) },
    paymentIntent: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: "order_r1" }), findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrderStatusEvent: { create: jest.fn() },
    deliveryAssignment: { create: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ paymentIntentId: null, orderId: null }]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  return prisma;
}
const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
const accessUntil = new Date(Date.now() + 96 * 3_600_000); // inside the 120 h notice window
const member = {
  id: "cm1mem0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "club", variantId: null, extraIds: [],
  itemName: "Club del café", quantity: 1, cadence: null, discountPercent: null, unitAmount: 5000, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: null, customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: null, status: "ACTIVE", missedCount: 0, amountOverride: null, nextAmountOverride: null,
  nextBillingAt: accessUntil, accessUntil, membershipPeriodId: "m1", pendingPeriodId: null, storeCustomerId: "cust_1", sourceOrderId: "order_1",
};

describe("membership renewals", () => {
  let prisma: any, paymentIntents: any, email: any, service: SubscriptionsService;
  beforeEach(() => {
    prisma = makePrisma();
    paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_r1", clientSecret: "pi_r1_secret" }), resolveStaleBanecoQr: jest.fn().mockResolvedValue("unpaid") };
    email = { send: jest.fn().mockResolvedValue(undefined) };
    service = new SubscriptionsService(prisma, email, paymentIntents, config as never);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: accessUntil, dueAt: accessUntil, amount: 5000, currency: "BOB" });
  });

  it("bills the locked price 5 days ahead with an order that ships nothing, and emails a membership notice", async () => {
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 5000, metadata: expect.objectContaining({ cart: [expect.objectContaining({ paymentLinkId: "club", quantity: 1, unitAmount: 5000 })] }),
    }));
    expect(prisma.storeOrder.create.mock.calls[0][0].data).not.toHaveProperty("fulfillmentMethod");
    expect(prisma.deliveryAssignment.create).not.toHaveBeenCalled();
    const sent = email.send.mock.calls[0][0];
    expect(sent.subject).toContain("Tu membresía Club del café vence el");
    expect(sent.body).toContain("No se cobra nada automáticamente.");
    expect(sent.body).not.toContain("/suscripcion/");
  });

  it("waits until 5 days before accessUntil", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...member, nextBillingAt: new Date(Date.now() + 130 * 3_600_000) }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("applies a pending period switch when the renewal is created", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...member, pendingPeriodId: "m12" }]);
    prisma.subscriptionInvoice.upsert.mockResolvedValue({ id: "inv_1", periodStart: accessUntil, dueAt: accessUntil, amount: 48000, currency: "BOB" });
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ amount: 48000 }) }));
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ membershipPeriodId: "m12", unitAmount: 48000, pendingPeriodId: null }) }));
  });

  it("ends renewals when the owner archived the membership, keeping paid access", async () => {
    prisma.paymentLink.findFirst.mockResolvedValue(null);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: member.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) });
    expect(email.send.mock.calls[0][0].body).toContain("Tu acceso sigue hasta");
  });

  it("never sends a live renewal link for a membership joined in test mode", async () => {
    prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
  });

  it("lapses a member whose renewal is unpaid after the grace days and closes the link", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: member.id, merchantId: "merchant_1", storeId: "store_1", status: "DUE", paymentIntentId: "pi_r1", orderId: "order_r1", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", railId: null, updatedAt: new Date() });
    const result = await service.expireLapsedMemberships("merchant_1", "store_1");
    expect(result).toEqual({ lapsed: 1 });
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "DUE" }, data: { status: "MISSED" } });
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: member.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "LAPSED", activeKey: null }) });
    expect(email.send.mock.calls[0][0].body).toContain("puedes reactivarla cuando quieras");
  });

  it("leaves memberships out of the product-subscription missed/pause rule", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: member.id, status: "DUE", paymentIntentId: null, orderId: "order_r1", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
    prisma.customerSubscription.findMany.mockResolvedValue([member]);
    await service.expireMissedRenewals("merchant_1", "store_1");
    expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
  });

  it("only looks at membership subscriptions when lapsing, so other stuck invoices cannot starve them", async () => {
    prisma.subscriptionInvoice.findMany.mockResolvedValue([]);
    await service.expireLapsedMemberships("merchant_1", "store_1");
    expect(prisma.customerSubscription.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ membershipPeriodId: { not: null } }));
    expect(prisma.subscriptionInvoice.findMany.mock.calls[0][0].where.subscriptionId).toEqual({ in: [member.id] });
  });

  it("does not query invoices when the store has no members", async () => {
    prisma.customerSubscription.findMany.mockResolvedValue([]);
    expect(await service.expireLapsedMemberships("merchant_1", "store_1")).toEqual({ lapsed: 0 });
    expect(prisma.subscriptionInvoice.findMany).not.toHaveBeenCalled();
  });

  it("ends a membership whose period rows were deleted with its product", async () => {
    prisma.membershipPeriod.findMany.mockResolvedValue([]);
    await service.generateSubscriptionInvoices("merchant_1", "store_1");
    expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: member.id, status: "ACTIVE" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) });
    expect(email.send.mock.calls[0][0].subject).toContain("terminó");
  });
});
