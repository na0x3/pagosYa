import { BadRequestException } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";

function makePrisma() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", contactEmail: "tienda@mail.com" }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    subscriptionPlan: { findFirst: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    subscriptionInvoice: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    paymentLink: { findFirst: jest.fn() },
    paymentIntent: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    storeOrder: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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
  nextBillingAt: new Date(Date.now() + 48 * 3_600_000), sourceOrderId: "order_1",
};

describe("product subscription renewals", () => {
  let prisma: any, paymentIntents: any, email: any, service: SubscriptionsService;
  beforeEach(() => {
    prisma = makePrisma();
    paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_r1", clientSecret: "pi_r1_secret" }), resolveStaleBanecoQr: jest.fn().mockResolvedValue("unpaid") };
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

  describe("renewal whose payment is in flight", () => {
    const dueInvoice = { id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) };
    beforeEach(() => {
      prisma.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "PROCESSING" });
    });
    it("expire leaves invoice, order and missedCount untouched", async () => {
      prisma.subscriptionInvoice.findMany.mockResolvedValue([dueInvoice]);
      const result = await service.expireMissedRenewals("merchant_1", "store_1");
      expect(result).toEqual({ missed: 0, paused: 0 });
      expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
      expect(prisma.storeOrder.updateMany).not.toHaveBeenCalled();
      expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
    });
    it("expire still counts the miss when the intent was already canceled", async () => {
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "CANCELED" });
      prisma.subscriptionInvoice.findMany.mockResolvedValue([dueInvoice]);
      prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 1 });
      expect(await service.expireMissedRenewals("merchant_1", "store_1")).toEqual({ missed: 1, paused: 0 });
    });
    it("cancelOpenRenewal declines and changes nothing", async () => {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
      expect(await service.cancelOpenRenewal(prisma, productSubscription.id)).toBe(false);
      expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
      expect(prisma.storeOrder.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("abandoned QR renewals (I1)", () => {
    const hours = (n: number) => new Date(Date.now() - n * 3_600_000);
    const dueInvoice = { id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", periodStart: new Date(), dueAt: new Date(Date.now() - 8 * 86_400_000), amount: 15900, currency: "BOB", reminderCount: 0 };

    it("cancelOpenRenewal cancels a non-Baneco REQUIRES_ACTION intent idle for more than 25 hours", async () => {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
      prisma.paymentIntent.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_ACTION", railId: "mock_qr", livemode: true, updatedAt: hours(26) });
      expect(await service.cancelOpenRenewal(prisma, productSubscription.id)).toBe(true);
      const second = prisma.paymentIntent.updateMany.mock.calls[1][0];
      expect(second.where).toMatchObject({ id: "pi_r1", status: "REQUIRES_ACTION" });
      expect(second.where.updatedAt.lt.getTime()).toBeLessThan(hours(24.9).getTime());
      expect(second.where.updatedAt.lt.getTime()).toBeGreaterThan(hours(25.1).getTime());
      expect(second.data).toEqual({ status: "CANCELED" });
      expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
      expect(prisma.subscriptionInvoice.updateMany).toHaveBeenCalledWith({ where: { id: "inv_1", status: "DUE" }, data: { status: "SKIPPED" } });
    });

    describe("Baneco QR (N1)", () => {
      const banecoIntent = (age: number, extra = {}) => ({ id: "pi_r1", status: "REQUIRES_ACTION", railId: "baneco_qr", livemode: true, updatedAt: hours(age), ...extra });
      const setupCancel = (age: number, extra = {}) => {
        prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
        prisma.paymentIntent.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
        prisma.paymentIntent.findUnique.mockResolvedValue(banecoIntent(age, extra));
      };
      const pre = (outcome: string) => ({ invoiceId: "inv_1", outcome }) as never;
      const txOrder: string[] = [];
      beforeEach(() => {
        txOrder.length = 0;
        prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => { txOrder.push("tx-open"); return callback(prisma); });
        paymentIntents.resolveStaleBanecoQr.mockImplementation(async () => { txOrder.push("bank"); return "unpaid"; });
      });
      it("uses a 49 hour cutoff: a 30 hour old QR is left alone and the bank is not asked", async () => {
        setupCancel(30);
        expect(await service.cancelOpenRenewal(prisma, productSubscription.id, pre("not-applicable"))).toBe(false);
        expect(await service.staleQrOutcome("pi_r1")).toBe("not-applicable");
        expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
        expect(prisma.paymentIntent.updateMany).toHaveBeenCalledTimes(1);
      });
      it("cancels a 50 hour old QR the pre-check found unpaid, with the 49 hour cutoff in the guard, and never calls the bank inside", async () => {
        setupCancel(50);
        expect(await service.cancelOpenRenewal(prisma, productSubscription.id, pre("unpaid"))).toBe(true);
        expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
        const guard = prisma.paymentIntent.updateMany.mock.calls[1][0];
        expect(guard.where.updatedAt.lt.getTime()).toBeLessThan(hours(48.9).getTime());
        expect(guard.where.updatedAt.lt.getTime()).toBeGreaterThan(hours(49.1).getTime());
      });
      it("does not cancel when the pre-check says paid, unknown, or was not run", async () => {
        for (const precheck of [pre("paid"), pre("unknown"), undefined]) {
          prisma.paymentIntent.updateMany.mockClear();
          setupCancel(50);
          expect(await service.cancelOpenRenewal(prisma, productSubscription.id, precheck)).toBe(false);
          expect(prisma.paymentIntent.updateMany).toHaveBeenCalledTimes(1);
        }
        expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
        expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
      });
      it("skips the bank for a test-mode intent", async () => {
        setupCancel(50, { livemode: false });
        expect(await service.staleQrOutcome("pi_r1")).toBe("not-applicable");
        expect(await service.cancelOpenRenewal(prisma, productSubscription.id, pre("not-applicable"))).toBe(true);
        expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
      });
      it("staleQrOutcome returns the bank verdict and turns a thrown error into unknown", async () => {
        prisma.paymentIntent.findUnique.mockResolvedValue(banecoIntent(50));
        paymentIntents.resolveStaleBanecoQr.mockResolvedValue("paid");
        expect(await service.staleQrOutcome("pi_r1")).toBe("paid");
        paymentIntents.resolveStaleBanecoQr.mockRejectedValue(new Error("aborted"));
        expect(await service.staleQrOutcome("pi_r1")).toBe("unknown");
      });
      it("expire asks the bank BEFORE the transaction opens and cancels + marks missed when unpaid", async () => {
        prisma.subscriptionInvoice.findMany.mockResolvedValue([dueInvoice]);
        prisma.paymentIntent.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValue({ count: 1 });
        prisma.paymentIntent.findUnique.mockResolvedValue(banecoIntent(60));
        prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 1 });
        expect(await service.expireMissedRenewals("merchant_1", "store_1")).toEqual({ missed: 1, paused: 0 });
        expect(txOrder).toEqual(["bank", "tx-open"]);
        expect(paymentIntents.resolveStaleBanecoQr).toHaveBeenCalledTimes(1);
      });
      it.each(["paid", "unknown"])("expire does nothing for the invoice when the bank says %s (no transaction, no miss)", async (verdict) => {
        prisma.subscriptionInvoice.findMany.mockResolvedValue([dueInvoice]);
        prisma.paymentIntent.findUnique.mockResolvedValue(banecoIntent(60));
        paymentIntents.resolveStaleBanecoQr.mockResolvedValue(verdict);
        expect(await service.expireMissedRenewals("merchant_1", "store_1")).toEqual({ missed: 0, paused: 0 });
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
      });
      it("a throwing invoice does not stop the others in expiry", async () => {
        const second = { ...dueInvoice, id: "inv_2", paymentIntentId: "pi_r2", orderId: "order_r2" };
        prisma.subscriptionInvoice.findMany.mockResolvedValue([dueInvoice, second]);
        prisma.paymentIntent.findUnique.mockImplementation(async ({ where }: any) => { if (where.id === "pi_r1") throw new Error("db down"); return { id: "pi_r2", status: "REQUIRES_PAYMENT_METHOD" }; });
        prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 1 });
        const logger = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);
        expect(await service.expireMissedRenewals("merchant_1", "store_1")).toEqual({ missed: 1, paused: 0 });
        expect(logger).toHaveBeenCalledWith(expect.stringContaining("inv_1"));
        expect(logger).toHaveBeenCalledWith(expect.stringContaining("db down"));
      });
      describe("reminders", () => {
        beforeEach(() => {
          prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
          prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
          prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
          prisma.subscriptionInvoice.findMany.mockResolvedValue([{ ...dueInvoice, dueAt: new Date(Date.now() - 1000) }]);
        });
        it("a manual reminder keeps a 30 hour old Baneco QR (still payable)", async () => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(30), clientSecret: "old" });
          expect((await service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false)).regenerated).toBe(false);
          expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
        });
        it.each(["paid", "unknown"])("a manual reminder on a 50 hour QR the bank reports %s sends no email, no link, cancels and creates nothing, and opens no transaction", async (verdict) => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(50), clientSecret: "old" });
          paymentIntents.resolveStaleBanecoQr.mockResolvedValue(verdict);
          const result = await service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false);
          expect(result).toMatchObject({ regenerated: false, sent: false, checkoutUrl: null });
          expect(email.send).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.paymentIntent.updateMany).not.toHaveBeenCalled();
          expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
          expect(prisma.subscriptionInvoice.update).not.toHaveBeenCalled();
        });
        it("a manual reminder on a 50 hour QR the bank reports unpaid regenerates the link, asking the bank before the transaction", async () => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(50), clientSecret: "old" });
          const result = await service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false);
          expect(txOrder).toEqual(["bank", "tx-open"]);
          expect(paymentIntents.resolveStaleBanecoQr).toHaveBeenCalledTimes(1);
          expect(prisma.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_r1", status: "REQUIRES_ACTION" }, data: { status: "CANCELED" } });
          expect(result).toMatchObject({ regenerated: true, sent: true });
          expect(result.checkoutUrl).toContain("pi_r1_secret");
        });
        it("the scheduled reminder leaves a 30 hour Baneco QR alone (49 h rail cutoff) and sends the existing link", async () => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(30), clientSecret: "old" });
          await service.sendDueSubscriptionReminders("merchant_1", "store_1");
          expect(paymentIntents.resolveStaleBanecoQr).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(email.send.mock.calls[0][0].body).toContain("old");
        });
        it.each(["paid", "unknown"])("the scheduled reminder sends nothing for a 50 hour QR the bank reports %s", async (verdict) => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(50), clientSecret: "old" });
          paymentIntents.resolveStaleBanecoQr.mockResolvedValue(verdict);
          expect(await service.sendDueSubscriptionReminders("merchant_1", "store_1")).toEqual({ delivered: 0, skipped: 1 });
          expect(email.send).not.toHaveBeenCalled();
          expect(prisma.$transaction).not.toHaveBeenCalled();
          expect(prisma.paymentIntent.updateMany).not.toHaveBeenCalled();
        });
        it("the scheduled reminder replaces a 50 hour unpaid QR (bank before transaction) and mails the new link", async () => {
          prisma.paymentIntent.findUnique.mockResolvedValue({ ...banecoIntent(50), clientSecret: "old" });
          await service.sendDueSubscriptionReminders("merchant_1", "store_1");
          expect(txOrder).toEqual(["bank", "tx-open"]);
          expect(email.send.mock.calls[0][0].body).toContain("pi_r1_secret");
        });
        it("a throwing invoice does not stop the others in reminders", async () => {
          const bad = { ...dueInvoice, id: "inv_bad", dueAt: new Date(Date.now() - 1000) };
          const good = { ...dueInvoice, id: "inv_good", dueAt: new Date(Date.now() - 1000) };
          prisma.subscriptionInvoice.findMany.mockResolvedValue([bad, good]);
          prisma.customerSubscription.findFirst.mockRejectedValueOnce(new Error("db down")).mockResolvedValue(productSubscription);
          prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "x" });
          const logger = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);
          expect(await service.sendDueSubscriptionReminders("merchant_1", "store_1")).toEqual({ delivered: 1, skipped: 1 });
          expect(logger).toHaveBeenCalledWith(expect.stringContaining("inv_bad"));
          expect(logger).toHaveBeenCalledWith(expect.stringContaining("db down"));
        });
      });
    });

    it("leaves a fresh REQUIRES_ACTION intent alone", async () => {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
      prisma.paymentIntent.updateMany.mockResolvedValue({ count: 0 });
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_ACTION" });
      expect(await service.cancelOpenRenewal(prisma, productSubscription.id)).toBe(false);
      expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
    });

    it("expire takes the oldest misses first", async () => {
      await service.expireMissedRenewals("merchant_1", "store_1");
      expect(prisma.subscriptionInvoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { dueAt: "asc" } }));
    });

    it("manual reminder regenerates the link when the previous QR went stale", async () => {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_ACTION", updatedAt: hours(30), clientSecret: "old" });
      const result = await service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false);
      expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
      expect(prisma.paymentIntent.updateMany).toHaveBeenCalledWith({ where: { id: "pi_r1", status: "REQUIRES_ACTION" }, data: { status: "CANCELED" } });
      expect(result.regenerated).toBe(true);
      expect(result.checkoutUrl).toContain("pi_r1_secret");
    });

    it("manual reminder keeps a fresh QR", async () => {
      prisma.subscriptionInvoice.findFirst.mockResolvedValue(dueInvoice);
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_ACTION", updatedAt: hours(2), clientSecret: "old" });
      const result = await service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false);
      expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
      expect(result.regenerated).toBe(false);
    });

    it("the scheduled reminder sends a fresh link instead of a dead QR", async () => {
      prisma.subscriptionInvoice.findMany.mockResolvedValue([{ ...dueInvoice, dueAt: new Date(Date.now() - 1000) }]);
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: "pi_r1", orderId: "order_r1" }]);
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_ACTION", updatedAt: hours(30), clientSecret: "old" });
      await service.sendDueSubscriptionReminders("merchant_1", "store_1");
      expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
      expect(email.send.mock.calls[0][0].body).toContain("pi_r1_secret");
    });
  });

  describe("livemode follows the subscription's origin (I3)", () => {
    it("does not bill a test-origin subscription under a store that is now live", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
      expect(prisma.subscriptionInvoice.upsert).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(result.created).toBe(0);
    });
    it("does not bill a live-origin subscription under a store that is no longer live", async () => {
      prisma.merchant.findUniqueOrThrow.mockResolvedValue({ status: "SUSPENDED" });
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(result.created).toBe(0);
    });
    it("bills a test-origin subscription in a test store, with livemode false", async () => {
      prisma.merchant.findUniqueOrThrow.mockResolvedValue({ status: "SUSPENDED" });
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", false, expect.anything());
    });
    it("expireMissedRenewals leaves a cross-mode subscription's invoice alone", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
      prisma.customerSubscription.findMany.mockResolvedValue([productSubscription]);
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      expect(await service.expireMissedRenewals("merchant_1", "store_1")).toEqual({ missed: 0, paused: 0 });
      expect(prisma.subscriptionInvoice.updateMany).not.toHaveBeenCalled();
      expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
    });
    it("warns once per call when a product subscription's source order is missing", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([]);
      const warn = jest.spyOn((service as any).logger, "warn").mockImplementation(() => undefined);
      prisma.customerSubscription.findMany.mockResolvedValue([productSubscription, { ...productSubscription, id: "cm1sub0000000000000000002" }]);
      await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain("order_1");
    });
    it("refuses a manual reminder across modes", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status: "DUE" });
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      await expect(service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false)).rejects.toThrow(/modo/);
      expect(email.send).not.toHaveBeenCalled();
    });
    it("scheduled reminders skip a cross-mode subscription", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", reminderCount: 0, dueAt: new Date(Date.now() - 1000), amount: 15900, currency: "BOB" }]);
      prisma.customerSubscription.findFirst.mockResolvedValue(productSubscription);
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "x" });
      await service.sendDueSubscriptionReminders("merchant_1", "store_1");
      expect(email.send).not.toHaveBeenCalled();
    });
  });

  describe("a long-overdue subscription (N2)", () => {
    it("rolls a 5-week-overdue weekly subscription forward without a burst of invoices", async () => {
      const overdue = new Date(Date.now() - 35 * 86_400_000);
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, cadence: "WEEKLY", nextBillingAt: overdue }]);
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(result.created).toBe(0);
      expect(prisma.subscriptionInvoice.upsert).not.toHaveBeenCalled();
      expect(paymentIntents.createInTransaction).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      const roll = prisma.customerSubscription.updateMany.mock.calls.find(([arg]: any[]) => arg.where.nextBillingAt?.getTime() === overdue.getTime())![0];
      expect(roll.where).toEqual({ id: productSubscription.id, status: "ACTIVE", nextBillingAt: overdue });
      const next: Date = roll.data.nextBillingAt;
      expect((next.getTime() - overdue.getTime()) % (7 * 86_400_000)).toBe(0);
      expect(next.getTime()).toBeGreaterThan(Date.now() + 72 * 3_600_000);
      expect(next.getTime() - 7 * 86_400_000).toBeLessThanOrEqual(Date.now() + 72 * 3_600_000);
    });
    it("then bills exactly one invoice for the next upcoming period", async () => {
      const overdue = new Date(Date.now() - 35 * 86_400_000);
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, cadence: "WEEKLY", nextBillingAt: overdue }]);
      await service.generateSubscriptionInvoices("merchant_1", "store_1");
      const rolled: Date = prisma.customerSubscription.updateMany.mock.calls[0][0].data.nextBillingAt;
      prisma.customerSubscription.updateMany.mockClear();
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, cadence: "WEEKLY", nextBillingAt: new Date(Date.now() + 48 * 3_600_000) }]);
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(result.created).toBe(1);
      expect(rolled.getTime()).toBeGreaterThan(Date.now());
      expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
    });
    it("bills normally when only slightly overdue (less than one period)", async () => {
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, cadence: "WEEKLY", nextBillingAt: new Date(Date.now() - 2 * 86_400_000) }]);
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(result.created).toBe(1);
    });
    it("does not roll a cross-mode subscription", async () => {
      prisma.storeOrder.findMany.mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: false } }]);
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, cadence: "WEEKLY", nextBillingAt: new Date(Date.now() - 35 * 86_400_000) }]);
      await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(prisma.customerSubscription.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("pausing and reminders (I4)", () => {
    it("auto-pause also cancels the next open renewal", async () => {
      prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_2", subscriptionId: productSubscription.id, orderId: "order_r2", paymentIntentId: "pi_r2", status: "DUE", dueAt: new Date(Date.now() - 8 * 86_400_000) }]);
      prisma.customerSubscription.update.mockResolvedValue({ ...productSubscription, missedCount: 2 });
      const cancel = jest.spyOn(service, "cancelOpenRenewal").mockResolvedValue(true);
      await service.expireMissedRenewals("merchant_1", "store_1");
      expect(cancel).toHaveBeenCalledWith(prisma, productSubscription.id, { invoiceId: null, outcome: "not-applicable" });
    });
    it("does not remind a paused subscription", async () => {
      prisma.subscriptionInvoice.findMany.mockResolvedValue([{ id: "inv_1", subscriptionId: productSubscription.id, orderId: "order_r1", paymentIntentId: "pi_r1", status: "DUE", reminderCount: 0, dueAt: new Date(Date.now() - 1000), amount: 15900, currency: "BOB" }]);
      prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status: "PAUSED" });
      prisma.paymentIntent.findUnique.mockResolvedValue({ id: "pi_r1", status: "REQUIRES_PAYMENT_METHOD", clientSecret: "x" });
      const result = await service.sendDueSubscriptionReminders("merchant_1", "store_1");
      expect(email.send).not.toHaveBeenCalled();
      expect(result.skipped).toBe(1);
    });
  });

  describe("one failing subscription (I5)", () => {
    it("logs it and still bills the others", async () => {
      const second = { ...productSubscription, id: "cm1sub0000000000000000002", customerEmail: "bea@mail.com" };
      prisma.customerSubscription.findMany.mockResolvedValue([productSubscription, second]);
      prisma.paymentLink.findFirst.mockRejectedValueOnce(new Error("boom"));
      const warn = jest.spyOn((service as any).logger, "error").mockImplementation(() => undefined);
      const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(productSubscription.id));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("boom"));
      expect(paymentIntents.createInTransaction).toHaveBeenCalledTimes(1);
      expect(result.created).toBe(1);
    });
  });

  describe("legacy and manual guards (M2-M4)", () => {
    it("M2: the legacy status route refuses product subscriptions", async () => {
      prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, paymentLinkId: "p1" });
      await expect(service.updateSubscriptionStatus("merchant_1", "store_1", productSubscription.id, { status: "PAUSED" } as never)).rejects.toThrow("Gestiona esta suscripción desde Suscripciones");
    });
    it("M3: refuses to remind a missed or skipped invoice", async () => {
      for (const status of ["MISSED", "SKIPPED"]) {
        prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status });
        await expect(service.remindSubscriptionInvoice("merchant_1", "store_1", "inv_1", false)).rejects.toThrow(BadRequestException);
      }
    });
  });
});
