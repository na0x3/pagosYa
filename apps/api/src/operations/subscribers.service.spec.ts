import { createSubscriptionManageToken } from "./subscription-manage-token";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { SubscribersService } from "./subscribers.service";

const productSubscription = {
  id: "cm1sub0000000000000000001", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "p1", variantId: null, extraIds: [],
  itemName: "Café 500 g", quantity: 1, cadence: "MONTHLY", discountPercent: 10, unitAmount: 7200, currency: "BOB", pendingUnitAmount: null, pendingFrom: null,
  fulfillment: null, customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: "70000000", status: "ACTIVE", missedCount: 0,
  nextBillingAt: new Date(Date.now() + 10 * 86_400_000), sourceOrderId: "order_1", amountOverride: null, nextAmountOverride: null,
};

function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Café Norte", status: "ACTIVE", subscriptionsEnabled: true, membershipGraceDays: 7 }), findUnique: jest.fn().mockResolvedValue({ name: "Café Norte" }), findUniqueOrThrow: jest.fn().mockResolvedValue({ membershipGraceDays: 7 }), update: jest.fn() },
    customerSubscription: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(productSubscription), findUnique: jest.fn().mockResolvedValue(productSubscription), findUniqueOrThrow: jest.fn().mockResolvedValue(productSubscription), update: jest.fn().mockResolvedValue(productSubscription), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(0) },
    subscriptionPlan: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    subscriptionInvoice: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    productSubscriptionOption: { findMany: jest.fn().mockResolvedValue([{ cadence: "MONTHLY", discountPercent: 10 }]) },
    paymentLink: { findFirst: jest.fn().mockResolvedValue({ id: "p1", amount: 8000, variants: [], extras: [], status: "ACTIVE" }) },
    paymentIntent: { findUnique: jest.fn() },
    storeOrder: { findMany: jest.fn().mockResolvedValue([{ id: "order_1", paymentIntent: { livemode: true } }]) },
    membershipPeriod: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
  const email = { send: jest.fn().mockResolvedValue(undefined) };
  const subscriptions: any = {
    cancelOpenRenewal: jest.fn().mockResolvedValue(false),
    precheckOpenRenewal: jest.fn().mockResolvedValue({ invoiceId: null, outcome: "not-applicable" }),
    sendSubscriptionNotice: jest.fn().mockImplementation((to: string, subject: string, body: string) => email.send({ to, subject, body }).then(() => true)),
    manageUrl: jest.fn().mockReturnValue("https://pagar.test/suscripcion/x"),
    remindSubscriptionInvoice: jest.fn(),
    membershipPeriodsFor: jest.fn().mockImplementation(async (rows: any[]) => new Map((await prisma.membershipPeriod.findMany({ rows })).map((row: any) => [row.id, { months: row.months, amount: row.amount }]))),
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
    expect(subscriptions.cancelOpenRenewal).toHaveBeenCalledWith(prisma, productSubscription.id, { invoiceId: null, outcome: "not-applicable" });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED", activeKey: null }) }));
  });

  it("resume after a pause moves the next date past the notice window and resets misses", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status: "PAUSED", missedCount: 2, nextBillingAt: new Date("2026-01-01T00:00:00Z") });
    await service.act("merchant_1", "store_1", productSubscription.id, "resume");
    const call = prisma.customerSubscription.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: productSubscription.id, status: "PAUSED" });
    const data = call.data;
    expect(data).toMatchObject({ status: "ACTIVE", missedCount: 0, pausedAt: null });
    expect(data.nextBillingAt.getTime()).toBeGreaterThan(Date.now() + 72 * 3_600_000);
  });

  it("pause is status-guarded and answers 409 when the state already changed", async () => {
    const { prisma, service } = setup();
    await service.act("merchant_1", "store_1", productSubscription.id, "pause");
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith({ where: { id: productSubscription.id, status: "ACTIVE" }, data: { status: "PAUSED", pausedAt: expect.any(Date) } });
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.act("merchant_1", "store_1", productSubscription.id, "pause")).rejects.toThrow(/cambió/);
  });

  it("resume answers 409 when the subscription is no longer paused", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status: "PAUSED" });
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.act("merchant_1", "store_1", productSubscription.id, "resume")).rejects.toThrow(/cambió/);
  });

  it("resend refuses a canceled or paused subscription", async () => {
    for (const status of ["CANCELED", "PAUSED"]) {
      const { prisma, subscriptions, service } = setup();
      prisma.customerSubscription.findFirst.mockResolvedValue({ ...productSubscription, status });
      await expect(service.resend("merchant_1", "store_1", productSubscription.id)).rejects.toThrow(BadRequestException);
      expect(subscriptions.remindSubscriptionInvoice).not.toHaveBeenCalled();
    }
  });

  it("resend answers 409 with the reason when the reminder is blocked, never a null link", async () => {
    const cases = [["paid", "El pago ya se recibió en el banco; actualiza la lista en unos minutos."], ["unknown", "No pudimos confirmar el estado del QR con el banco; intenta de nuevo más tarde."]] as const;
    for (const [blocked, message] of cases) {
      const { prisma, subscriptions, service } = setup();
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status: "DUE" });
      subscriptions.remindSubscriptionInvoice.mockResolvedValue({ checkoutUrl: null, regenerated: false, sent: false, recipient: "ana@mail.com", blocked });
      const failure = await service.resend("merchant_1", "store_1", productSubscription.id).catch((error) => error);
      expect(failure).toBeInstanceOf(ConflictException);
      expect(failure.message).toBe(message);
    }
  });

  it("resend of a normal reminder is unchanged", async () => {
    const { prisma, subscriptions, service } = setup();
    prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", subscriptionId: productSubscription.id, status: "DUE" });
    subscriptions.remindSubscriptionInvoice.mockResolvedValue({ checkoutUrl: "https://pagar.test/pay/x", regenerated: false, sent: true, recipient: "ana@mail.com" });
    const result = await service.resend("merchant_1", "store_1", productSubscription.id);
    expect(result).toEqual({ checkoutUrl: "https://pagar.test/pay/x", sent: true, whatsappText: "Hola Ana, tu pedido de Café 500 g está listo. Págalo con un toque: https://pagar.test/pay/x" });
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

  it("rejects a change to the cadence the subscription already has, without re-pricing", async () => {
    const { prisma, service } = setup();
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "MONTHLY", discountPercent: 20 }]);
    await expect(service.publicAct(token, { action: "change_cadence", cadence: "MONTHLY" })).rejects.toThrow("Ya tienes esa frecuencia.");
    expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
  });

  it("rewrites the consent text and date for the new cadence", async () => {
    const { prisma, service } = setup();
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }]);
    await service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" });
    const data = prisma.customerSubscription.update.mock.calls[0][0].data;
    expect(data.consentText).toBe("Acepto que este pedido se repita cada semana. Antes de cada entrega recibiré un enlace para pagar; no se cobra nada automáticamente. Puedo saltar, pausar o cancelar cuando quiera.");
    expect(data.consentAt).toBeInstanceOf(Date);
  });

  it("applies a higher price immediately when the buyer changes cadence", async () => {
    const { prisma, service } = setup();
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 0 }, { cadence: "MONTHLY", discountPercent: 10 }]);
    await service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" });
    expect(prisma.customerSubscription.update.mock.calls[0][0].data).toMatchObject({ cadence: "WEEKLY", unitAmount: 8000 });
  });

  it("shows the per-delivery amount of each cadence option, delivery fee included", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findUnique.mockResolvedValue({ ...productSubscription, quantity: 2, fulfillment: { fee: 1500 } });
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }]);
    const view: any = await service.publicView(token);
    expect(view.cadenceOptions).toEqual([
      expect.objectContaining({ cadence: "WEEKLY", amount: 7600 * 2 + 1500 }),
      expect.objectContaining({ cadence: "MONTHLY", amount: 7200 * 2 + 1500 }),
    ]);
  });

  it("shows the subscription's actual current amount for its own cadence, even when today's offer would price it differently", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findUnique.mockResolvedValue({ ...productSubscription, quantity: 2, fulfillment: { fee: 1500 }, cadence: "MONTHLY", discountPercent: 10, unitAmount: 6500 });
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }, { cadence: "MONTHLY", discountPercent: 10 }]);
    const view: any = await service.publicView(token);
    expect(view.amount).toBe(6500 * 2 + 1500);
    expect(view.cadenceOptions.find((o: any) => o.cadence === "MONTHLY").amount).toBe(view.amount);
    expect(view.cadenceOptions.find((o: any) => o.cadence === "WEEKLY").amount).toBe(7600 * 2 + 1500);
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

  it("repeat apply is a no-op: keeps the pending date and sends no email", async () => {
    const { prisma, email, service } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", amount: 9000, variants: [], extras: [], status: "ACTIVE" });
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, pendingUnitAmount: 8100, pendingFrom: new Date(Date.now() + 3 * 86_400_000) }]);
    const result = await service.reprice("merchant_1", "store_1", "p1");
    expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(result.affected).toBe(0);
  });

  it("reverting the price clears a stale pending price without emailing", async () => {
    const { prisma, email, service } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", amount: 8000, variants: [], extras: [], status: "ACTIVE" });
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, pendingUnitAmount: 8100, pendingFrom: new Date(Date.now() + 3 * 86_400_000) }]);
    await service.reprice("merchant_1", "store_1", "p1");
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith({ where: { id: productSubscription.id }, data: { pendingUnitAmount: null, pendingFrom: null } });
    expect(email.send).not.toHaveBeenCalled();
  });

  it("skips a subscriber whose variant no longer exists when repricing", async () => {
    const { prisma, email, service } = setup();
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "p1", amount: 9000, variants: [], extras: [], status: "ACTIVE" });
    prisma.customerSubscription.findMany.mockResolvedValue([{ ...productSubscription, variantId: "gone" }]);
    const result = await service.reprice("merchant_1", "store_1", "p1");
    expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
    expect(result.affected).toBe(0);
  });

  it("answers 400 to a cadence change when the subscribed variant no longer exists", async () => {
    const { prisma, service } = setup();
    prisma.customerSubscription.findUnique.mockResolvedValue({ ...productSubscription, variantId: "gone" });
    prisma.productSubscriptionOption.findMany.mockResolvedValue([{ cadence: "WEEKLY", discountPercent: 5 }]);
    await expect(service.publicAct(token, { action: "change_cadence", cadence: "WEEKLY" })).rejects.toThrow("La presentación que elegiste ya no está disponible.");
    expect(prisma.customerSubscription.update).not.toHaveBeenCalled();
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
    await expect(service.setEnabled("merchant_1", "store_1", false)).resolves.toEqual({ enabled: false, activeSubscribers: 4, membershipGraceDays: 7 });
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { subscriptionsEnabled: false } });
  });

  describe("members", () => {
    const member = { id: "sub_m", merchantId: "merchant_1", storeId: "store_1", planId: null, paymentLinkId: "club", membershipPeriodId: "m12", pendingPeriodId: null, unitAmount: 48000, quantity: 1, currency: "BOB", itemName: "Club del café", status: "ACTIVE", accessUntil: new Date(Date.now() + 40 * 86400000), nextBillingAt: new Date(Date.now() + 40 * 86400000), customerName: "Ana", customerEmail: "ana@mail.com", customerPhone: null, cadence: null, sourceOrderId: "order_1" };

    it("lists only memberships with kind=membership, and only subscriptions otherwise", async () => {
      const { prisma, service } = setup();
      prisma.customerSubscription.findMany.mockResolvedValue([]);
      await service.list("merchant_1", "store_1", { kind: "membership" } as never);
      expect(prisma.customerSubscription.findMany.mock.calls.at(-1)[0].where).toEqual(expect.objectContaining({ membershipPeriodId: { not: null } }));
      await service.list("merchant_1", "store_1", {} as never);
      expect(prisma.customerSubscription.findMany.mock.calls.at(-1)[0].where).toEqual(expect.objectContaining({ membershipPeriodId: null }));
    });

    it("shows the period, activa hasta and state for a member row", async () => {
      const { prisma, service } = setup();
      prisma.customerSubscription.findMany.mockResolvedValue([member]);
      prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m12", months: 12, amount: 48000 }]);
      const { items } = await service.list("merchant_1", "store_1", { kind: "membership" } as never);
      expect(items[0]).toEqual(expect.objectContaining({ kind: "membership", periodLabel: "Anual", membershipState: "ACTIVE", membershipStateLabel: "Activa", amount: 48000 }));
    });

    it("counts members and their monthly-equivalent revenue apart from subscriptions", async () => {
      const { prisma, service } = setup();
      prisma.customerSubscription.findMany.mockImplementation(async ({ where }: any) => (where.membershipPeriodId ? [member] : []));
      prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m12", months: 12, amount: 48000 }]);
      const summary = await service.summary("merchant_1", "store_1");
      expect(summary.members).toEqual({ active: 1, monthlyRecurring: 4000, currency: "BOB" });
      expect(summary.membershipGraceDays).toBe(7);
    });

    it("lets the owner only cancel a membership", async () => {
      const { prisma, service } = setup();
      prisma.customerSubscription.findFirst.mockResolvedValue(member);
      await expect(service.act("merchant_1", "store_1", "sub_m", "pause")).rejects.toThrow("Las membresías solo se pueden cancelar desde aquí.");
    });

    it("falls back to consentAt for a member's last payment", async () => {
      const { prisma, service } = setup();
      const consentAt = new Date("2026-09-01T10:00:00Z");
      prisma.customerSubscription.findMany.mockResolvedValue([{ ...member, consentAt }]);
      prisma.membershipPeriod.findMany.mockResolvedValue([{ id: "m12", months: 12, amount: 48000 }]);
      const { items } = await service.list("merchant_1", "store_1", { kind: "membership" } as never);
      expect(items[0].lastPaidAt).toBe(consentAt.toISOString());
    });

    it("resends a member renewal link with membership copy", async () => {
      const { prisma, subscriptions, service } = setup();
      prisma.customerSubscription.findFirst.mockResolvedValue(member);
      prisma.subscriptionInvoice.findFirst.mockResolvedValue({ id: "inv_1", status: "DUE" });
      subscriptions.remindSubscriptionInvoice.mockResolvedValue({ checkoutUrl: "https://pay/x", sent: true });
      const result = await service.resend("merchant_1", "store_1", "sub_m");
      expect(result.whatsappText).toBe("Hola Ana, renueva tu membresía Club del café con un toque: https://pay/x");
    });

    it("uses membership errors when resending", async () => {
      const { prisma, service } = setup();
      prisma.customerSubscription.findFirst.mockResolvedValue(member);
      await expect(service.resend("merchant_1", "store_1", "sub_m")).rejects.toThrow("No hay una renovación pendiente de pago");
      prisma.customerSubscription.findFirst.mockResolvedValue({ ...member, status: "CANCELED" });
      await expect(service.resend("merchant_1", "store_1", "sub_m")).rejects.toThrow("Esta membresía ya no se renueva; el miembro puede reactivarla desde su cuenta.");
    });

    it("saves the grace days", async () => {
      const { prisma, service } = setup();
      await service.setEnabled("merchant_1", "store_1", true, 10);
      expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { subscriptionsEnabled: true, membershipGraceDays: 10 } });
    });
  });
});
