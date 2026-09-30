import { createSubscriptionManageToken } from "./subscription-manage-token";
import { SubscribersService } from "./subscribers.service";

const productSubscription = {
  id: "cm1sub0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "p1", variantId: null, extraIds: [],
  itemName: "Café 500 g", quantity: 1, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: null, customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: "70000000", status: "ACTIVE", missedCount: 0,
  nextBillingAt: new Date(Date.now() + 10 * 86_400_000), sourceOrderId: "order_1", amountOverride: null, nextAmountOverride: null,
};

function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", subscriptionsEnabled: true }), findUnique: jest.fn().mockResolvedValue({ name: "Café Norte" }), update: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(productSubscription), findUnique: jest.fn().mockResolvedValue(productSubscription), findUniqueOrThrow: jest.fn().mockResolvedValue(productSubscription), update: jest.fn().mockResolvedValue(productSubscription), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    subscriptionPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    subscriptionInvoice: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ cadence: "MONTHLY", discountPercent: 10 }]) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "p1", amount: 8000, variants: [], extras: [], status: "ACTIVE" }) },
    paymentIntent: { findUnique: jest.fn() },
    storeOrder: { findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const subscriptions: any = {
    cancelOpenRenewal: jest.fn().mockResolvedValue(false),
    sendSubscriptionNotice: jest.fn().mockImplementation((to: string, subject: string, body: string) => email.send({ to, subject, body }).then(() => true)),
    manageUrl: jest.fn().mockReturnValue("https://pagar.test/suscripcion/x"),
    remindSubscriptionInvoice: jest.fn(),
  };
  const config = { get: (key: string) => (key === "app.orderTrackingSecret" ? "s" : "http://localhost:5174") };
  return { prisma, email, subscriptions, service: new SubscribersService(prisma, subscriptions, config as never) };
}
const token = createSubscriptionManageToken(productSubscription.id, "s");

describe("SubscribersService", () => {
  it("skips the next renewal by moving the date when nothing is open", async () => {
    const { prisma, service } = setup();
    await service.act("merchant_1", "store_1", productSubscription.id, "skip");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: productSubscription.id, status: "ACTIVE", nextBillingAt: productSubscription.nextBillingAt }, data: { nextBillingAt: expect.any(Date) } });
  });

  it("skips an open renewal by canceling it", async () => {
    const { prisma, subscriptions, service } = setup();
    subscriptions.cancelOpenRenewal.mockResolvedValue(true);
    await service.act("merchant_1", "store_1", productSubscription.id, "skip");
    expect(prisma.customerSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 instead of moving the date when the open renewal's payment is in flight", async () => {
    const { prisma, service } = setup();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status: "DUE", paymentIntentId: "pi_1" });
    await expect(service.act("merchant_1", "store_1", productSubscription.id, "skip")).rejects.toThrow("Tu pago está en proceso; espera a que termine");
    expect(prisma.customerSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 to a buyer skipping while their payment is in flight", async () => {
    const { prisma, service } = setup();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status: "DUE", paymentIntentId: "pi_1" });
    await expect(service.publicAct(token, { action: "skip" })).rejects.toThrow("Tu pago está en proceso");
    expect(prisma.customerSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("answers 409 when a renewal was generated at the same moment", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.act("merchant_1", "store_1", productSubscription.id, "skip")).rejects.toThrow("Tu renovación ya se generó; puedes pagarla o saltarla");
  });

  it("cancel cancels the open renewal and frees the active key", async () => {
    const { prisma, subscriptions, service } = setup();
    await service.act("merchant_1", "store_1", productSubscription.id, "cancel");
    expect(subscriptions.cancelOpenRenewal).toHaveBeenCalledWith(prisma, productSubscription.id);
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED", activeKey: null }) }));
  });

  it("resume after a pause moves the next date past the notice window and resets misses", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status: "PAUSED", missedCount: 2, nextBillingAt: new Date("2026-01-01T00:00:00Z") });
    await service.act("merchant_1", "store_1", productSubscription.id, "resume");
    const data = prisma.customerSubscription.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "ACTIVE", missedCount: 0, pausedAt: null });
    expect(data.nextBillingAt.getTime()).toBeGreaterThan(Date.now() + 72 * 3_600_000);
  });

  it("rejects a removed cadence", async () => {
    const { service } = setup();
    await expect(service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" })).rejects.toThrow("Esa frecuencia ya no está disponible.");
  });

  it("changes cadence and locks the new discount's price", async () => {
    const { prisma, service } = setup();
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }]);
    await service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cadence: "WEEKLY", discountPercent: 5, unitAmount: 7600 }) }));
  });

  it("returns 404 for a bad token", async () => {
    const { service } = setup();
    await expect(service.publicView("nope")).rejects.toThrow("Suscripción no encontrada");
  });

  it("reprices a product's subscribers from a date seven days out and emails each", async () => {
    const { prisma, email, service } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", amount: 9000, variants: [], extras: [], status: "ACTIVE" });
    prisma.customerSubscription.findMany.mockResolvedValue([productSubscription]);
    const result = await service.reprice("merchant_1", "store_1", "p1");
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: productSubscription.id }, data: { pendingUnitAmount: 8100, pendingFrom: expect.any(Date) } });
    expect(new Date(result.effectiveFrom).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    expect(result.affected).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it("summarises live subscriptions normalised to 30 days", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findMany.mockResolvedValue([
      { ...productSubscription, id: "a", cadence: "WEEKLY", unitAmount: 1000 },
      { ...productSubscription, id: "b", cadence: "MONTHLY", unitAmount: 3000 },
    ]);
    const summary = await service.summary("merchant_1", "store_1");
    expect(summary.active).toBe(2);
    expect(summary.monthlyRecurring).toBe(Math.round(1000 * 30 / 7) + 3000);
    expect(summary.enabled).toBe(true);
  });

  it("turns the switch off and reports who keeps renewing", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.count.mockResolvedValue(4);
    await expect(service.setEnabled("merchant_1", "store_1", false)).resolves.toEqual({ enabled: false, activeSubscribers: 4 });
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { subscriptionsEnabled: false } });
  });
});
