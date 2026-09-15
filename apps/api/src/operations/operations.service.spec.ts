import { OperationsService } from "./operations.service";
import * as argon2 from "argon2";

function makePrisma() {
  const empty = () => jest.fn().mockResolvedValue([]);
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Estudio Norte", status: "ACTIVE" }) },
    merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: "ACTIVE" }) },
    businessCustomer: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: empty(), create: jest.fn(), update: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    appointment: { findMany: empty(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    appointmentServiceOffering: { findMany: empty(), findFirst: jest.fn(), create: jest.fn() },
    purchaseOrder: { findMany: empty(), findFirst: jest.fn(), update: jest.fn() },
    purchaseOrderItem: { findMany: empty(), update: jest.fn() },
    supplier: { findMany: empty() },
    paymentLink: { findMany: empty(), findFirst: jest.fn(), update: jest.fn() },
    deliveryAssignment: { findMany: empty() },
    customerSubscription: { findMany: empty(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    subscriptionInvoice: { findMany: empty(), findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    subscriptionPlan: { findMany: empty(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    customerReturnRequest: { findMany: empty() },
    integrationConnection: { findMany: empty(), findFirst: jest.fn(), update: jest.fn() },
    integrationSyncRun: { findMany: empty(), create: jest.fn(), update: jest.fn() },
    integrationSubscriptionPlanMapping: { findMany: empty() },
    integrationCustomerMapping: { findMany: empty(), findUnique: jest.fn(), upsert: jest.fn() },
    integrationSubscriptionMapping: { findMany: empty(), findUnique: jest.fn(), upsert: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    paymentIntent: { findMany: empty(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    storeOrder: { findMany: empty() },
    inventoryMovement: { create: jest.fn() },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

function makeService(
  prisma: ReturnType<typeof makePrisma>,
  paymentIntents = { createInTransaction: jest.fn() },
  email = { send: jest.fn() },
) {
  return new OperationsService(
    prisma as any,
    { createEvent: jest.fn(), updateEvent: jest.fn(), deleteEvent: jest.fn(), freeBusy: jest.fn().mockResolvedValue({ connected: false, busy: [] }) } as any,
    email as any,
    paymentIntents as any,
    { get: jest.fn().mockReturnValue("http://localhost:5174") } as any,
  );
}

describe("OperationsService operational calendar", () => {
  it("lists only active stock connections for the owned store", async () => {
    const prisma = makePrisma();
    prisma.integrationConnection.findMany.mockResolvedValue([{ id: "integration_1", name: "Caja Café", status: "ACTIVE" }]);
    (prisma as any).integrationProductMapping = { count: jest.fn().mockResolvedValue(4) };
    (prisma as any).integrationSyncRun.findFirst = jest.fn().mockResolvedValue({ status: "SUCCEEDED", itemCount: 3, details: { skipped: [{ externalSku: "X", reason: "SKU sin vincular a un producto en pagosYa" }] } });
    const service = makeService(prisma);

    // Each connection carries how many SKUs are linked and the last sync report.
    await expect(service.listIntegrations("merchant_1", "store_1")).resolves.toEqual([
      { id: "integration_1", name: "Caja Café", status: "ACTIVE", mappingCount: 4, lastRun: expect.objectContaining({ itemCount: 3 }) },
    ]);
    expect(prisma.integrationConnection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { merchantId: "merchant_1", storeId: "store_1", status: "ACTIVE" },
    }));
  });

  it("derives actionable restock and promotion dates from their source records", async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findMany.mockResolvedValue([{
      id: "po_1", merchantId: "merchant_1", storeId: "store_1", supplierId: "supplier_1",
      status: "ORDERED", currency: "BOB", expectedAt: new Date("2099-08-10T14:00:00Z"),
      receivedAt: null, totalAmount: 5000, notes: null, createdAt: new Date(), updatedAt: new Date(),
    }]);
    prisma.supplier.findMany.mockResolvedValue([{ id: "supplier_1", name: "Laboratorio Norte" }]);
    prisma.purchaseOrderItem.findMany.mockResolvedValue([{
      id: "poi_1", purchaseOrderId: "po_1", paymentLinkId: "product_1", sku: "KIT-01",
      name: "Kit facial", quantity: 12, unitCost: 5000, receivedQuantity: 0, createdAt: new Date(),
    }]);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "product_1", name: "Kit facial", discountPercent: 20,
      discountStartsAt: new Date("2099-08-11T14:00:00Z"), discountEndsAt: new Date("2099-08-18T14:00:00Z"),
    }]);
    const service = makeService(prisma);

    const result = await service.calendarEvents(
      "merchant_1",
      "store_1",
      new Date("2099-08-01T00:00:00Z"),
      new Date("2099-09-01T00:00:00Z"),
    );

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "RESTOCK", title: "Reposición · Laboratorio Norte", action: { kind: "RECEIVE_PURCHASE_ORDER", label: "Recibir stock" } }),
      expect.objectContaining({ type: "PROMOTION_START", title: "Inicia oferta · Kit facial" }),
      expect.objectContaining({ type: "PROMOTION_END", title: "Termina oferta · Kit facial" }),
    ]));
  });

  it("receives a purchase order and records the product stock movement atomically", async () => {
    const prisma = makePrisma();
    prisma.purchaseOrder.findFirst.mockResolvedValue({ id: "po_1", merchantId: "merchant_1", storeId: "store_1", status: "ORDERED" });
    prisma.purchaseOrderItem.findMany.mockResolvedValue([{
      id: "poi_1", purchaseOrderId: "po_1", paymentLinkId: "product_1", quantity: 12, receivedQuantity: 2,
    }]);
    prisma.paymentLink.findFirst.mockResolvedValue({ id: "product_1", storeId: "store_1", stock: 3 });
    prisma.paymentLink.update.mockResolvedValue({ id: "product_1", stock: 13 });
    prisma.purchaseOrder.update.mockResolvedValue({ id: "po_1", status: "RECEIVED" });
    const service = makeService(prisma);

    await expect(service.receivePurchaseOrder("merchant_1", "store_1", "po_1")).resolves.toMatchObject({
      id: "po_1", status: "RECEIVED", receivedItems: 1, updatedProducts: 1,
    });
    expect(prisma.paymentLink.update).toHaveBeenCalledWith({ where: { id: "product_1" }, data: { stock: 13 } });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentLinkId: "product_1", quantityDelta: 10, stockAfter: 13, sourceType: "PURCHASE_ORDER" }),
    }));
    expect(prisma.purchaseOrderItem.update).toHaveBeenCalledWith({ where: { id: "poi_1" }, data: { receivedQuantity: 12 } });
  });
});

describe("OperationsService external subscriptions", () => {
  afterEach(() => jest.useRealTimers());

  it("verifies an active integration without exposing or storing its secret", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const secret = "sync_test_secret";
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: "integration_1",
      name: "ERP central",
      kind: "CUSTOM_DATABASE",
      status: "ACTIVE",
      secretHash: await argon2.hash(secret),
    });

    await expect(service.verifyIntegrationInbound("integration_1", secret)).resolves.toMatchObject({
      connected: true,
      connectionId: "integration_1",
      name: "ERP central",
      capabilities: ["stock", "subscriptions"],
    });
    await expect(service.verifyIntegrationInbound("integration_1", "sync_wrong_secret")).rejects.toThrow("Invalid integration secret");
  });

  it("upserts an external customer and subscription, then starts billing", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const secret = "sync_test_secret";
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: "integration_1", merchantId: "merchant_1", storeId: "store_1", status: "ACTIVE",
      secretHash: await argon2.hash(secret),
    });
    prisma.integrationSubscriptionPlanMapping.findMany.mockResolvedValue([{
      connectionId: "integration_1", externalPlanCode: "CAFE-MENSUAL", subscriptionPlanId: "plan_1",
    }]);
    prisma.integrationSyncRun.create.mockResolvedValue({ id: "run_1" });
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: "plan_1", storeId: "store_1", isActive: true });
    prisma.integrationCustomerMapping.findUnique.mockResolvedValue(null);
    prisma.businessCustomer.findUnique.mockResolvedValue(null);
    prisma.businessCustomer.create.mockResolvedValue({ id: "customer_1", name: "María López", email: "maria@example.com", phone: null });
    prisma.integrationSubscriptionMapping.findUnique.mockResolvedValue(null);
    prisma.customerSubscription.create.mockResolvedValue({ id: "subscription_1" });
    jest.spyOn(service, "generateSubscriptionInvoices").mockResolvedValue({ created: 1, paymentLinksCreated: 1, emailsSent: 1, charges: [] });

    const result = await service.syncSubscriptionsInbound("integration_1", secret, {
      items: [{
        externalSubscriptionId: "SUB-1001",
        externalCustomerId: "CLI-001",
        externalPlanCode: "CAFE-MENSUAL",
        customerName: "María López",
        customerEmail: "maria@example.com",
        status: "ACTIVE",
        nextBillingAt: "2026-08-22T12:00:00.000Z",
      }],
    });

    expect(result).toMatchObject({ received: 1, created: 1, updated: 0, skipped: [], billing: { paymentLinksCreated: 1 } });
    expect(prisma.integrationCustomerMapping.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ externalCustomerId: "CLI-001", businessCustomerId: "customer_1" }),
    }));
    expect(prisma.integrationSubscriptionMapping.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ externalSubscriptionId: "SUB-1001", customerSubscriptionId: "subscription_1" }),
    }));
    expect(prisma.integrationSyncRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", itemCount: 1 }) }));
  });

  it("blocks a duplicate active subscription for the same customer and plan", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: "plan_1", isActive: true });
    prisma.businessCustomer.findFirst.mockResolvedValue({ id: "customer_1", name: "María López", email: "maria@example.com", phone: null });
    prisma.customerSubscription.findUnique.mockResolvedValue({ id: "subscription_existing" });

    await expect(service.createSubscription("merchant_1", "store_1", {
      planId: "plan_1",
      customerId: "customer_1",
      customerName: "María López",
      nextBillingAt: "2099-09-01T12:00:00.000Z",
    })).rejects.toThrow("ya tiene una suscripción activa o pausada");
    expect(prisma.customerSubscription.create).not.toHaveBeenCalled();
  });

  it("applies a one-time amount without changing future plan pricing", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: "plan_1", amount: 15000, isActive: true });
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 12 });

    await expect(service.updateSubscriptionPlan("merchant_1", "store_1", "plan_1", { scope: "NEXT_ONLY", amount: 17500 })).resolves.toMatchObject({
      scope: "NEXT_ONLY",
      affectedSubscriptions: 12,
      nextAmount: 17500,
    });
    expect(prisma.customerSubscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { nextAmountOverride: 17500 } }));
    expect(prisma.subscriptionPlan.update).not.toHaveBeenCalled();
  });

  it("pauses one customer without releasing duplicate protection", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    prisma.customerSubscription.findFirst
      .mockResolvedValueOnce({ id: "subscription_1", merchantId: "merchant_1", storeId: "store_1", planId: "plan_1", customerId: "customer_1", customerName: "María López", customerEmail: "maria@example.com", customerPhone: null, status: "ACTIVE" })
      .mockResolvedValueOnce(null);
    prisma.customerSubscription.update.mockResolvedValue({ id: "subscription_1", status: "PAUSED" });

    await expect(service.updateSubscriptionStatus("merchant_1", "store_1", "subscription_1", { status: "PAUSED" })).resolves.toMatchObject({ status: "PAUSED" });
    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PAUSED", activeKey: expect.any(String) }) }));
  });

  it("offers only slots that are free in both pagosYa and Google Calendar", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const prisma = makePrisma();
    const calendar = {
      createEvent: jest.fn(), updateEvent: jest.fn(), deleteEvent: jest.fn(),
      freeBusy: jest.fn().mockResolvedValue({ connected: true, busy: [{ start: "2026-09-01T14:00:00.000Z", end: "2026-09-01T15:00:00.000Z" }] }),
    };
    const service = new OperationsService(prisma as any, calendar as any, { send: jest.fn() } as any, { createInTransaction: jest.fn() } as any, { get: jest.fn() } as any);
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Barbería Norte", status: "ACTIVE" });
    prisma.appointmentServiceOffering.findFirst.mockResolvedValue({ id: "cut_1", storeId: "store_1", name: "Corte", durationMinutes: 30, bufferMinutes: 0, price: 5000, currency: "BOB", isActive: true });
    prisma.appointment.findMany.mockResolvedValue([{ startsAt: new Date("2026-09-01T16:00:00.000Z"), endsAt: new Date("2026-09-01T16:30:00.000Z") }]);

    const result = await service.publicAppointmentAvailability("barberia", "cut_1", "2026-09-01");

    expect(result.connectedToGoogleCalendar).toBe(true);
    expect(result.slots.some((slot) => slot.startsAt === "2026-09-01T14:00:00.000Z")).toBe(false);
    expect(result.slots.some((slot) => slot.startsAt === "2026-09-01T16:00:00.000Z")).toBe(false);
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it("locks a public appointment slot and creates its directed payment", async () => {
    const prisma = makePrisma();
    const paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_appointment", clientSecret: "pi_appointment_secret" }), cancelById: jest.fn() };
    const calendar = { createEvent: jest.fn().mockResolvedValue("google_event_1"), updateEvent: jest.fn(), deleteEvent: jest.fn(), freeBusy: jest.fn() };
    const service = new OperationsService(prisma as any, calendar as any, { send: jest.fn() } as any, paymentIntents as any, { get: jest.fn().mockReturnValue("http://localhost:5174") } as any);
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", merchantId: "merchant_1", name: "Barbería Norte", status: "ACTIVE", checkoutMode: "payment" });
    prisma.appointmentServiceOffering.findFirst.mockResolvedValue({ id: "cut_1", storeId: "store_1", name: "Corte clásico", durationMinutes: 45, bufferMinutes: 15, price: 5000, currency: "BOB", isActive: true });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.create.mockResolvedValue({ id: "appointment_1", storeId: "store_1", customerName: "Juan Pérez", customerEmail: "juan@example.com", customerPhone: null, startsAt: new Date("2026-09-01T14:00:00.000Z"), endsAt: new Date("2026-09-01T15:00:00.000Z"), status: "PENDING", notes: null, googleEventId: null });
    prisma.appointment.update.mockResolvedValue({ id: "appointment_1" });
    jest.spyOn(service, "publicAppointmentAvailability").mockResolvedValue({
      date: "2026-09-01", connectedToGoogleCalendar: true,
      offering: { id: "cut_1", name: "Corte clásico", durationMinutes: 45, bufferMinutes: 15, price: 5000, currency: "BOB" },
      slots: [{ startsAt: "2026-09-01T14:00:00.000Z", endsAt: "2026-09-01T15:00:00.000Z", label: "10:00" }],
    });

    const result = await service.createPublicAppointmentPayment("barberia", {
      offeringId: "cut_1", customerName: "Juan Pérez", customerEmail: "juan@example.com", startsAt: "2026-09-01T14:00:00.000Z",
    });

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 5000,
      customerName: "Juan Pérez",
      metadata: expect.objectContaining({ appointment: expect.objectContaining({ appointmentId: "appointment_1", offeringId: "cut_1" }) }),
    }));
    expect(calendar.createEvent).toHaveBeenCalled();
    expect(result).toMatchObject({ appointmentId: "appointment_1", clientSecret: "pi_appointment_secret", status: "AWAITING_PAYMENT" });
  });

  it("creates one invoice and one hosted checkout link for a due subscription", async () => {
    const prisma = makePrisma();
    const paymentIntents = { createInTransaction: jest.fn().mockResolvedValue({ id: "pi_subscription", clientSecret: "pi_subscription_secret", amount: 15000, currency: "BOB" }) };
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const service = makeService(prisma, paymentIntents, email);
    const periodStart = new Date("2026-08-22T12:00:00.000Z");
    const subscription = { id: "subscription_1", merchantId: "merchant_1", storeId: "store_1", planId: "plan_1", customerName: "María López", customerEmail: "maria@example.com", customerPhone: null, amountOverride: null, status: "ACTIVE", nextBillingAt: periodStart };
    const invoice = { id: "invoice_1", subscriptionId: subscription.id, merchantId: "merchant_1", storeId: "store_1", periodStart, amount: 15000, currency: "BOB", status: "DUE", paymentIntentId: null, dueAt: periodStart };
    prisma.customerSubscription.findMany.mockResolvedValue([subscription]);
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: "plan_1", name: "Club Café mensual", amount: 15000, currency: "BOB", interval: "MONTHLY", intervalCount: 1 });
    prisma.subscriptionInvoice.findUnique.mockResolvedValue(null);
    prisma.subscriptionInvoice.upsert.mockResolvedValue(invoice);
    prisma.$queryRaw.mockResolvedValue([{ paymentIntentId: null }]);
    prisma.customerSubscription.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.generateSubscriptionInvoices("merchant_1", "store_1");

    expect(result).toMatchObject({ created: 1, paymentLinksCreated: 1, emailsSent: 1 });
    expect(result.charges[0]).toMatchObject({ invoiceId: "invoice_1", paymentIntentId: "pi_subscription", checkoutUrl: "http://localhost:5174/#client_secret=pi_subscription_secret" });
    expect(paymentIntents.createInTransaction).toHaveBeenCalledWith(expect.anything(), "merchant_1", true, expect.objectContaining({
      amount: 15000,
      metadata: expect.objectContaining({
        storeId: "store_1",
        subscription: expect.objectContaining({ invoiceId: "invoice_1", customerName: "María López", customerEmail: "maria@example.com" }),
      }),
    }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "maria@example.com" }));
  });

  it("does not rewind the next billing date when an external database retries stale data", async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);
    const secret = "sync_test_secret";
    const currentNextBillingAt = new Date("2026-09-22T12:00:00.000Z");
    prisma.integrationConnection.findFirst.mockResolvedValue({
      id: "integration_1", merchantId: "merchant_1", storeId: "store_1", status: "ACTIVE",
      secretHash: await argon2.hash(secret),
    });
    prisma.integrationSubscriptionPlanMapping.findMany.mockResolvedValue([{ externalPlanCode: "CAFE-MENSUAL", subscriptionPlanId: "plan_1" }]);
    prisma.integrationSyncRun.create.mockResolvedValue({ id: "run_1" });
    prisma.subscriptionPlan.findFirst.mockResolvedValue({ id: "plan_1", isActive: true });
    prisma.integrationCustomerMapping.findUnique.mockResolvedValue({ businessCustomerId: "customer_1" });
    prisma.businessCustomer.findFirst.mockResolvedValue({ id: "customer_1" });
    prisma.businessCustomer.update.mockResolvedValue({ id: "customer_1" });
    prisma.integrationSubscriptionMapping.findUnique.mockResolvedValue({ customerSubscriptionId: "subscription_1" });
    prisma.customerSubscription.findFirst.mockResolvedValue({ id: "subscription_1", nextBillingAt: currentNextBillingAt });
    prisma.customerSubscription.update.mockResolvedValue({ id: "subscription_1", nextBillingAt: currentNextBillingAt });
    jest.spyOn(service, "generateSubscriptionInvoices").mockResolvedValue({ created: 0, paymentLinksCreated: 0, emailsSent: 0, charges: [] });

    await service.syncSubscriptionsInbound("integration_1", secret, {
      items: [{
        externalSubscriptionId: "SUB-1001", externalCustomerId: "CLI-001", externalPlanCode: "CAFE-MENSUAL",
        customerName: "María López", status: "ACTIVE", nextBillingAt: "2026-08-22T12:00:00.000Z",
      }],
    });

    expect(prisma.customerSubscription.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ nextBillingAt: currentNextBillingAt }),
    }));
  });
});

describe("OperationsService inbound stock merge", () => {
  async function setup(product: any, mappings: any[]) {
    const prisma = makePrisma() as any;
    const secretHash = await argon2.hash("sync_secret");
    prisma.integrationConnection.findFirst.mockResolvedValue({ id: "conn_1", merchantId: "merchant_1", storeId: "store_1", name: "ERP", status: "ACTIVE", secretHash });
    prisma.integrationProductMapping = { findMany: jest.fn().mockResolvedValue(mappings) };
    prisma.integrationSyncRun.create.mockResolvedValue({ id: "run_1" });
    prisma.paymentLink.findFirst.mockResolvedValue(product);
    prisma.inventoryMovement.aggregate = jest.fn().mockResolvedValue({ _sum: { quantityDelta: -2 } });
    return { prisma, service: makeService(prisma) };
  }
  const lamp = { id: "lamp", storeId: "store_1", stock: 24, variants: [{ id: "negro", name: "Negro", amount: 100, stock: 12 }, { id: "marfil", name: "Marfil", amount: 100, stock: 12 }] };

  it("writes a combination's stock, subtracts pagosYa sales after asOf and keeps the product total consistent", async () => {
    const { prisma, service } = await setup(lamp, [{ externalSku: "LAMP-NEGRO", paymentLinkId: "lamp", variantId: "negro" }]);
    const result = await service.syncStockInbound("conn_1", "sync_secret", { items: [{ externalSku: "LAMP-NEGRO", stock: 7, asOf: "2026-09-15T10:00:00.000Z" }] } as any);
    expect(result).toMatchObject({ updated: 1, skipped: 0, results: [{ externalSku: "LAMP-NEGRO", variantId: "negro", stock: 5, soldAfterCount: 2 }] });
    expect(prisma.paymentLink.update).toHaveBeenCalledWith({ where: { id: "lamp" }, data: { variants: [{ ...lamp.variants[0], stock: 5 }, lamp.variants[1]], stock: 17 } });
    expect(prisma.inventoryMovement.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ variantId: "negro", sourceType: "ORDER" }) }));
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ variantId: "negro", quantityDelta: -7, stockAfter: 5 }) });
  });

  it("applies deltas and reports every SKU it could not apply instead of dropping it", async () => {
    const { prisma, service } = await setup(lamp, [
      { externalSku: "LAMP-MARFIL", paymentLinkId: "lamp", variantId: "marfil" },
      { externalSku: "LAMP-WHOLE", paymentLinkId: "lamp", variantId: null },
    ]);
    const result = await service.syncStockInbound("conn_1", "sync_secret", { items: [
      { externalSku: "LAMP-MARFIL", delta: -4 },
      { externalSku: "LAMP-WHOLE", stock: 3 },
      { externalSku: "NOPE", stock: 1 },
      { externalSku: "BOTH", stock: 1, delta: 1 },
    ] } as any);
    expect(result.results).toEqual([expect.objectContaining({ externalSku: "LAMP-MARFIL", stock: 8 })]);
    expect(result.skippedItems).toEqual([
      { externalSku: "LAMP-WHOLE", reason: "El producto tiene combinaciones: vincula este SKU a una combinación" },
      { externalSku: "NOPE", reason: "SKU sin vincular a un producto en pagosYa" },
      { externalSku: "BOTH", reason: "Envía stock o delta (solo uno)" },
    ]);
    expect(prisma.integrationSyncRun.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED", itemCount: 1, details: expect.objectContaining({ skipped: result.skippedItems }) }) }));
  });
});
