import { ConflictException } from "@nestjs/common";
import { MembershipsService } from "./memberships.service";

const store = { id: "store_1", slug: "cafe", name: "Café Norte", merchantId: "merchant_1", status: "ACTIVE", checkoutMode: "payment", membershipGraceDays: 7, sourcePublicationPaused: false, publicVisibility: true };
function setup() {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(store) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "club", name: "Club del café", currency: "BOB", fulfillmentType: "MEMBERSHIP" }) },
    membershipPeriod: { findFirst: jest.fn().mockResolvedValue({ id: "m1", paymentLinkId: "club", months: 1, amount: 5000 }), findMany: jest.fn().mockResolvedValue([]) },
    customerSubscription: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    paymentIntent: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: "order_1" }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const customers = { authenticate: jest.fn().mockResolvedValue({ id: "cust_1", storeId: "store_1", email: "ana@mail.com", name: "Ana", phone: null }) };
  const paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret" }) };
  const config = { get: (key: string) => (key === "app.checkoutOrigin" ? "https://pagar.test" : undefined) };
  const subscriptions = { precheckOpenRenewal: jest.fn().mockResolvedValue({}), cancelOpenRenewal: jest.fn().mockResolvedValue(true) };
  return { prisma, customers, paymentIntents, subscriptions, service: new MembershipsService(prisma, customers as never, paymentIntents as never, config as never, subscriptions as never) };
}

describe("MembershipsService.startJoin", () => {
  it("creates one intent and an order with nothing to ship, priced from the database", async () => {
    const { service, paymentIntents, prisma } = setup();
    const result = await service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true });
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 5000, currency: "BOB", customerEmail: "ana@mail.com",
      metadata: expect.objectContaining({
        cart: [{ paymentLinkId: "club", name: "Club del café · Mensual", quantity: 1, unitAmount: 5000 }],
        membership: expect.objectContaining({ productId: "club", periodId: "m1", storeCustomerId: "cust_1", consentText: expect.stringContaining("no se cobra nada automáticamente") }),
      }),
    }));
    expect(prisma.storeOrder.create.mock.calls[0][0].data).not.toHaveProperty("fulfillmentMethod");
    expect(result).toEqual({ checkoutUrl: "https://pagar.test/#client_secret=pi_1_secret" });
  });

  it("answers 'Ya eres miembro' while the account still has access", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ status: "CANCELED", accessUntil: new Date(Date.now() + 5 * 86400000) });
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets a lapsed member rejoin", async () => {
    const { service, prisma, paymentIntents } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ status: "LAPSED", accessUntil: new Date(Date.now() - 20 * 86400000) });
    await service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true });
    expect(paymentIntents.createInTransaction).toHaveBeenCalled();
  });

  it("refuses a missing consent, an archived period and a store without integrated payments", async () => {
    const { service, prisma } = setup();
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: false as never })).rejects.toThrow("Acepta las condiciones de la membresía para continuar.");
    prisma.membershipPeriod.findFirst.mockResolvedValue(null);
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toThrow("Elige un período disponible.");
    prisma.store.findUnique.mockResolvedValue({ ...store, checkoutMode: "whatsapp" });
    await expect(service.startJoin("cafe", "token", { productId: "club", periodId: "m1", consent: true })).rejects.toThrow("Esta tienda no tiene habilitados los pagos integrados");
  });
});

describe("MembershipsService.list", () => {
  it("shows state, dates, the open renewal link and the periods the member can switch to", async () => {
    const { service, prisma } = setup();
    const accessUntil = new Date(Date.now() + 3 * 86400000);
    prisma.customerSubscription.findMany.mockResolvedValue([{ id: "sub_1", paymentLinkId: "club", itemName: "Club del café", status: "ACTIVE", accessUntil, nextBillingAt: new Date(accessUntil.getTime() + 30 * 86400000), unitAmount: 5000, currency: "BOB", membershipPeriodId: "m1", pendingPeriodId: null }]);
    prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m1", paymentLinkId: "club", months: 1, amount: 5000, archivedAt: null, position: 0 }, { id: "m12", paymentLinkId: "club", months: 12, amount: 48000, archivedAt: null, position: 1 }]);
    prisma.subscriptionInvoice.findMany.mockResolvedValue([{ subscriptionId: "sub_1", paymentIntentId: "pi_r1" }]);
    prisma.paymentIntent.findMany.mockResolvedValue([{ id: "pi_r1", clientSecret: "pi_r1_secret", status: "REQUIRES_PAYMENT_METHOD" }]);
    const [row] = await service.list("cafe", "token");
    expect(row).toEqual(expect.objectContaining({ state: "ACTIVE", stateLabel: "Activa", amount: 5000, renewalUrl: "https://pagar.test/#client_secret=pi_r1_secret" }));
    expect(row.periods.map((p: any) => p.label)).toEqual(["Mensual", "Anual"]);
  });
});

describe("MembershipsService.act", () => {
  const row = (extra: object = {}) => ({ id: "sub_1", storeId: "store_1", storeCustomerId: "cust_1", paymentLinkId: "club", membershipPeriodId: "m1", pendingPeriodId: null, status: "ACTIVE", accessUntil: new Date(Date.now() + 10 * 86400000), nextBillingAt: new Date(Date.now() + 10 * 86400000), unitAmount: 5000, currency: "BOB", itemName: "Club del café", ...extra });

  it("cancels: stops renewals now, keeps access until accessUntil", async () => {
    const { service, prisma, subscriptions } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row());
    await service.act("cafe", "token", "sub_1", "cancel");
    expect(subscriptions.cancelOpenRenewal).toHaveBeenCalled();
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: expect.objectContaining({ status: "CANCELED", activeKey: null }) });
  });

  it("resumes a canceled membership that still has access, reopening a skipped renewal for the same period", async () => {
    const { service, prisma } = setup();
    const accessUntil = new Date(Date.now() + 3 * 86400000);
    prisma.customerSubscription.findFirst.mockResolvedValueOnce(row({ status: "CANCELED", accessUntil })).mockResolvedValueOnce(null);
    await service.act("cafe", "token", "sub_1", "resume");
    expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { subscriptionId: "sub_1", periodStart: accessUntil, status: "SKIPPED" }, data: { status: "DUE", paymentIntentId: null, orderId: null } });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: expect.objectContaining({ status: "ACTIVE", canceledAt: null, nextBillingAt: accessUntil }) });
  });

  it("refuses to resume once access ended (rejoin instead)", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row({ status: "CANCELED", accessUntil: new Date(Date.now() - 86400000) }));
    await expect(service.act("cafe", "token", "sub_1", "resume")).rejects.toThrow("Tu acceso ya terminó; vuelve a hacerte miembro.");
  });

  it("schedules a period switch for the next renewal, and refuses archived periods", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(row());
    prisma.membershipPeriod.findFirst.mockResolvedValueOnce({ id: "m12", paymentLinkId: "club", months: 12, amount: 48000 }).mockResolvedValueOnce(null);
    await service.act("cafe", "token", "sub_1", "period", "m12");
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: "sub_1" }, data: { pendingPeriodId: "m12" } });
    await expect(service.act("cafe", "token", "sub_1", "period", "m6")).rejects.toThrow("Elige un período disponible.");
  });

  it("only touches the signed-in account's memberships", async () => {
    const { service, prisma } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue(null);
    await expect(service.act("cafe", "token", "sub_other", "cancel")).rejects.toThrow("Membresía no encontrada");
    expect(prisma.customerSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeCustomerId: "cust_1", membershipPeriodId: { not: null } }) }));
  });
});
