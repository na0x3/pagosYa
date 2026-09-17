import { BadRequestException } from "@nestjs/common";
import { PaymentIntentStatus, PaymentLinkStatus } from "@prisma/client";
import { PaymentIntentsService } from "./payment-intents.service";

function noopConfig() {
  return { get: jest.fn().mockReturnValue({ bobPerUsd: 0, intlFeeBps: 590, costBps: 0 }) } as any;
}

function makeService() {
  return new PaymentIntentsService({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());
}

describe("PaymentIntentsService cart option inventory", () => {
  it("locks the payment row before canceling and releasing a branch reservation", async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{
        status: "REQUIRES_ACTION",
        metadata: {
          locationStockReserved: true,
          fulfillment: { locationId: "centro" },
          cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 1 }],
        },
      }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      paymentIntent: { update: jest.fn().mockResolvedValue({ id: "pi_1", status: "CANCELED" }) },
      storeOrder: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      appointment: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());

    await service.cancelById("pi_1");

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.paymentIntent.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pi_1" },
      data: expect.objectContaining({ status: "CANCELED", metadata: expect.objectContaining({ locationStockReserved: false }) }),
    }));
  });

  it("fails loudly instead of silently skipping a depleted base product", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { updateMany: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(0),
    };

    await expect((service as any).decrementStockForCart(tx, {
      storeId: "store_1",
      cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 1 }],
    })).rejects.toThrow("Uno de los productos ya no tiene suficiente stock");
  });

  it("decrements one shared extra pool across every product that uses it", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { updateMany: jest.fn() },
      $executeRaw: jest.fn()
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3),
    };

    await (service as any).decrementStockForCart(tx, {
      storeId: "store_1",
      cart: [
        { paymentLinkId: "burger_1", name: "Burger clásica", quantity: 1, extras: [{ id: "ext_1", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 8 }] },
        { paymentLinkId: "burger_2", name: "Burger doble", quantity: 2, extras: [{ id: "ext_2", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 8 }] },
      ],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it("atomically decrements each selected option", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    await (service as any).decrementStockForCart(tx, {
      cart: [
        { paymentLinkId: "link_1", variantId: "var_small", name: "Hamburguesa", quantity: 1 },
        { paymentLinkId: "link_1", variantId: "var_large", name: "Hamburguesa", quantity: 2 },
      ],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(tx.paymentLink.updateMany).not.toHaveBeenCalled();
  });

  it("decrements the selected branch before the global product stock", async () => {
    const service = makeService();
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1), paymentLink: { updateMany: jest.fn() } };

    await (service as any).decrementStockForCart(tx, {
      storeId: "store_1",
      fulfillment: { locationId: "centro", locationName: "Sucursal Centro", method: "delivery" },
      cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 2 }],
    });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("reserves branch stock atomically before authorization and does not decrement it twice", async () => {
    const service = makeService();
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1), paymentLink: { updateMany: jest.fn() } };
    const metadata = {
      storeId: "store_1",
      fulfillment: { locationId: "centro", locationName: "Sucursal Centro", method: "delivery" },
      cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 2 }],
    };

    await expect((service as any).reserveLocationStockForCart(tx, metadata)).resolves.toBe(true);
    await (service as any).decrementStockForCart(tx, { ...metadata, locationStockReserved: true });

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects authorization when the atomic branch reservation loses a stock race", async () => {
    const service = makeService();
    const tx = { $executeRaw: jest.fn().mockResolvedValue(0) };

    await expect((service as any).reserveLocationStockForCart(tx, {
      fulfillment: { locationId: "centro" },
      cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 1 }],
    })).rejects.toThrow("La ubicación elegida ya no tiene suficiente stock");
  });

  it("blocks confirmation when a selected option was removed after cart creation", async () => {
    const service = makeService();
    const tx = {
      paymentLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "link_1",
            name: "Hamburguesa",
            status: PaymentLinkStatus.ACTIVE,
            stock: 5,
            variants: [{ id: "var_small", name: "Pequeña", amount: 5000 }],
          },
        ]),
      },
    };

    await expect(
      (service as any).assertCartStillAvailable(tx, {
        cart: [{ paymentLinkId: "link_1", variantId: "var_removed", name: "Hamburguesa", quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("blocks confirmation when the selected option lacks stock", async () => {
    const service = makeService();
    const tx = {
      paymentLink: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "link_1",
            name: "Hamburguesa",
            status: PaymentLinkStatus.ACTIVE,
            stock: 4,
            variants: [
              { id: "var_small", name: "Pequeña", amount: 5000, stock: 0 },
              { id: "var_large", name: "Grande", amount: 8000, stock: 4 },
            ],
          },
        ]),
      },
    };

    await expect(
      (service as any).assertCartStillAvailable(tx, {
        cart: [{ paymentLinkId: "link_1", variantId: "var_small", variantName: "Pequeña", name: "Hamburguesa", quantity: 1 }],
      }),
    ).rejects.toThrow('Solo quedan 0 unidades de "Hamburguesa (Pequeña)"');
  });

  it("blocks confirmation when the selected branch no longer has enough stock", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { findMany: jest.fn().mockResolvedValue([{
        id: "link_1", name: "Hamburguesa", status: PaymentLinkStatus.ACTIVE, stock: 4,
        locationStocks: { centro: 0, sur: 4 }, variants: [], extras: [],
      }]) },
    };

    await expect((service as any).assertCartStillAvailable(tx, {
      fulfillment: { locationId: "centro", locationName: "Sucursal Centro", method: "pickup" },
      cart: [{ paymentLinkId: "link_1", name: "Hamburguesa", quantity: 1 }],
    })).rejects.toThrow('Sucursal Centro ya no tiene suficiente stock de "Hamburguesa"');
  });

  it("blocks confirmation when a shared extra pool no longer has enough units", async () => {
    const service = makeService();
    const tx = {
      paymentLink: { findMany: jest.fn().mockResolvedValue([{
        id: "burger_1", name: "Burger", status: PaymentLinkStatus.ACTIVE, stock: null, variants: [],
        extras: [{ id: "ext_1", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 1 }],
      }]) },
    };

    await expect((service as any).assertCartStillAvailable(tx, {
      storeId: "store_1",
      cart: [{ paymentLinkId: "burger_1", name: "Burger", quantity: 2, extras: [{ id: "ext_1", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 3 }] }],
    })).rejects.toThrow('Ya no hay suficiente stock de "Queso cottage"');
  });

  it("aggregates option lines into one persisted product total", async () => {
    const service = makeService();
    const tx = { storeProductStat: { upsert: jest.fn().mockResolvedValue({}) } };

    await (service as any).recordProductStats(tx, "merchant_1", {
      storeId: "store_1",
      cart: [
        { paymentLinkId: "link_1", variantId: "small", name: "Hamburguesa", quantity: 2, unitAmount: 5000 },
        { paymentLinkId: "link_1", variantId: "large", name: "Hamburguesa", quantity: 1, unitAmount: 8000 },
      ],
    });

    expect(tx.storeProductStat.upsert).toHaveBeenCalledWith({
      where: { storeId_paymentLinkId: { storeId: "store_1", paymentLinkId: "link_1" } },
      create: { merchantId: "merchant_1", storeId: "store_1", paymentLinkId: "link_1", productName: "Hamburguesa", quantity: 3, revenue: 18000 },
      update: { productName: "Hamburguesa", quantity: { increment: 3 }, revenue: { increment: 18000 } },
    });
  });
});

describe("PaymentIntentsService merchant transaction list", () => {
  it("filters transactions by the selected store when requested", async () => {
    const prisma = { paymentIntent: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());

    await service.listForMerchant("merchant_1", "store_1");

    expect(prisma.paymentIntent.findMany).toHaveBeenCalledWith({
      where: {
        merchantId: "merchant_1",
        metadata: { path: ["storeId"], equals: "store_1" },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });
});

describe("PaymentIntentsService directed charge recipients", () => {
  it("persists a merchant-supplied recipient when creating a direct charge", async () => {
    const prisma = { paymentIntent: { create: jest.fn().mockImplementation(({ data }) => data) } };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());

    await service.createInTransaction(prisma as any, "merchant_1", false, {
      amount: 3500,
      description: "Cuota semanal",
      customerName: " María López ",
      customerEmail: " MARIA@GMAIL.COM ",
      customerPhone: " +59170000000 ",
    });

    expect(prisma.paymentIntent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerName: "María López",
        customerEmail: "maria@gmail.com",
        customerPhone: "+59170000000",
      }),
    });
  });

  it("resolves the recipient for an already-issued subscription checkout", async () => {
    const prisma = {
      customerSubscription: {
        findUnique: jest.fn().mockResolvedValue({
          customerName: "María López",
          customerEmail: "maria@gmail.com",
          customerPhone: "+59170000000",
        }),
      },
    };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());

    await expect(service.checkoutRecipient({
      customerName: null,
      customerDocument: null,
      customerEmail: null,
      customerPhone: null,
      metadata: { subscription: { subscriptionId: "subscription_1" } },
    })).resolves.toEqual({
      name: "María López",
      document: null,
      email: "maria@gmail.com",
      phone: "+59170000000",
    });
  });
});

describe("PaymentIntentsService callback admission", () => {
  function callbackHarness(intent: Record<string, unknown>) {
    const prisma = { paymentIntent: { findUnique: jest.fn().mockResolvedValue(intent) } };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());
    const applyRailResult = jest.spyOn(service as any, "applyRailResult").mockResolvedValue({ paymentIntent: intent });
    return { service, applyRailResult };
  }

  it.each([
    [{ amount: 4_999 }, "amount"],
    [{ currency: "USD" }, "currency"],
    [{ railId: "mock_qr" }, "rail"],
  ])("rejects a callback with a mismatched %s binding before any ledger mutation", async (expectations, label) => {
    const test = callbackHarness({
      id: "pi_callback",
      merchantId: "merchant_1",
      railId: "mock_bank_transfer",
      amount: 5_000,
      currency: "BOB",
      status: PaymentIntentStatus.REQUIRES_ACTION,
    });

    await expect(test.service.applyCallbackResult("pi_callback", {
      status: "succeeded",
      railReference: "provider_ref_1",
      raw: {},
    }, expectations)).rejects.toThrow(new RegExp(label as string, "i"));
    expect(test.applyRailResult).not.toHaveBeenCalled();
  });

  it("acknowledges a replay of the same terminal callback without another transaction", async () => {
    const intent = {
      id: "pi_callback",
      merchantId: "merchant_1",
      railId: "mock_bank_transfer",
      amount: 5_000,
      currency: "BOB",
      status: PaymentIntentStatus.SUCCEEDED,
    };
    const test = callbackHarness(intent);

    await expect(test.service.applyCallbackResult("pi_callback", {
      status: "succeeded",
      railReference: "provider_ref_1",
      raw: {},
    }, { railId: "mock_bank_transfer", amount: 5_000, currency: "BOB" })).resolves.toEqual({
      paymentIntent: intent,
      railResult: expect.objectContaining({ status: "succeeded" }),
    });
    expect(test.applyRailResult).not.toHaveBeenCalled();
  });
});

describe("PaymentIntentsService sale records", () => {
  it("records one ORDER movement per sold product or combination and sends mapped SKUs", async () => {
    const service = makeService() as any;
    service.webhooks = { enqueueEvent: jest.fn() };
    const tx = {
      paymentLink: { findMany: jest.fn().mockResolvedValue([
        { id: "lamp", stock: 21, variants: [{ id: "negro", name: "Negro", amount: 100, stock: 9 }, { id: "marfil", name: "Marfil", amount: 100, stock: 12 }] },
        { id: "mug", stock: 4, variants: [] },
      ]) },
      integrationProductMapping: { findMany: jest.fn().mockResolvedValue([{ paymentLinkId: "lamp", variantId: "negro", externalSku: "LAMP-NEGRO", connectionId: "conn_1" }]) },
      inventoryMovement: { create: jest.fn() },
    };
    await service.recordCartSales(tx, "merchant_1", "pi_1", { storeId: "store_1", cart: [
      { paymentLinkId: "lamp", variantId: "negro", variantName: "Negro", name: "Lámpara", quantity: 2, unitAmount: 100 },
      { paymentLinkId: "lamp", variantId: "negro", variantName: "Negro", name: "Lámpara", quantity: 1, unitAmount: 100 },
      { paymentLinkId: "mug", name: "Taza", quantity: 1, unitAmount: 50 },
    ] });
    expect(tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ paymentLinkId: "lamp", variantId: "negro", quantityDelta: -3, stockAfter: 9, sourceType: "ORDER", sourceId: "pi_1" }) });
    expect(service.webhooks.enqueueEvent).toHaveBeenCalledWith(tx, "merchant_1", "inventory.sold", { paymentIntentId: "pi_1", storeId: "store_1", items: [
      expect.objectContaining({ productId: "lamp", variantId: "negro", quantity: 3, stockAfter: 9, skus: [{ connectionId: "conn_1", externalSku: "LAMP-NEGRO" }] }),
      expect.objectContaining({ productId: "mug", variantId: null, quantity: 1, stockAfter: 4, skus: [] }),
    ] });
  });
});

describe("PaymentIntentsService.confirm via dLocal", () => {
  const dlocalCfg = { bobPerUsd: 6.96, intlFeeBps: 590, costBps: 420 };

  function setup(merchant: Record<string, unknown>, intent: Record<string, unknown> = {}, env: { environment?: string; enabled?: boolean } = {}) {
    const row = { id: "pi_1", status: "REQUIRES_PAYMENT_METHOD", confirmationAttempts: 0, merchantId: "m_1", consumerUserId: null, metadata: {}, amount: 70000, currency: "BOB", ...intent };
    const update = jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...row, ...data, id: "pi_1", merchantId: "m_1" }));
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([row]),
      paymentIntent: { update },
      merchant: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "m_1", settlementMode: "AGGREGATOR", internationalPaymentsStatus: "ENABLED", ...merchant }) },
      consumerUser: { findFirst: jest.fn().mockResolvedValue(null) },
      storeOrder: { updateMany: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((cb) => cb(tx)) };
    const dlocal = { railId: "dlocal", supportedMethodTypes: ["CARD", "LOCAL_METHOD"], authorize: jest.fn().mockResolvedValue({ status: "requires_action", railReference: "D-1", raw: {} }) };
    const domestic = { railId: "mock_qr", supportedMethodTypes: ["QR"], authorize: jest.fn().mockResolvedValue({ status: "requires_action", railReference: "Q-1", raw: {} }) };
    const railRegistry = {
      get: jest.fn((id: string) => (id === "dlocal" ? dlocal : domestic)),
      getForMethodType: jest.fn().mockReturnValue(domestic),
    };
    const paymentMethods = { findOrCreate: jest.fn().mockResolvedValue({ id: "pm_1", type: "LOCAL_METHOD" }) };
    const config = { get: jest.fn((key: string) => (key === "app.environment" ? env.environment ?? "development" : { ...dlocalCfg, enabled: env.enabled ?? false })) };
    // Reorder to the real constructor signature; config is always last.
    const service = new PaymentIntentsService(prisma as any, railRegistry as any, paymentMethods as any, {} as any, {} as any, {} as any, {} as any, config as any);
    jest.spyOn(service as any, "assertCartStillAvailable").mockResolvedValue(undefined);
    jest.spyOn(service as any, "reserveLocationStockForCart").mockResolvedValue(false);
    jest.spyOn(service as any, "applyRailResult").mockResolvedValue({ paymentIntent: {}, railResult: {} });
    return { service, update, dlocal, domestic, railRegistry, paymentMethods };
  }

  const dto = {
    rail: "dlocal" as const, country: "BR", customerName: "Ana", customerEmail: "ana@example.com", customerDocument: "12345678909",
    paymentMethod: { type: "LOCAL_METHOD" as any, token: "dlocal:PX", metadata: { dlocalPaymentMethodId: "PX" } },
  };

  it("converts to USD, stores the FX snapshot, and authorizes on the dlocal rail with country and payer", async () => {
    const { service, update, dlocal, railRegistry } = setup({});
    await service.confirm("pi_1", dto as any);

    expect(railRegistry.getForMethodType).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        amount: 10058, currency: "USD", railId: "dlocal",
        metadata: expect.objectContaining({ fx: expect.objectContaining({ originalAmount: 70000, rate: 6.96 }) }),
      }),
    }));
    expect(dlocal.authorize).toHaveBeenCalledWith(expect.objectContaining({
      amount: 10058, currency: "USD", country: "BR", payer: { name: "Ana", email: "ana@example.com", document: "12345678909" },
    }));
  });

  it("rejects merchants that are not enabled, or not AGGREGATOR", async () => {
    await expect(setup({ internationalPaymentsStatus: "REQUESTED" }).service.confirm("pi_1", dto as any)).rejects.toThrow("pagos internacionales");
    await expect(setup({ settlementMode: "FACILITATOR" }).service.confirm("pi_1", dto as any)).rejects.toThrow("pagos internacionales");
  });

  it("refuses dLocal charges in production while dLocal runs on fixtures, before calling the rail", async () => {
    const fixtureProd = setup({}, {}, { environment: "production", enabled: false });
    await expect(fixtureProd.service.confirm("pi_1", dto as any)).rejects.toThrow("internacionales");
    expect(fixtureProd.dlocal.authorize).not.toHaveBeenCalled();
    expect(fixtureProd.update).not.toHaveBeenCalled();

    const liveProd = setup({}, {}, { environment: "production", enabled: true });
    await liveProd.service.confirm("pi_1", dto as any);
    expect(liveProd.dlocal.authorize).toHaveBeenCalled();
  });

  it("rejects a payment method type dLocal does not support, before calling the rail", async () => {
    const test = setup({});
    test.paymentMethods.findOrCreate.mockResolvedValue({ id: "pm_qr", type: "QR" });
    await expect(test.service.confirm("pi_1", { ...dto, paymentMethod: { type: "QR", token: "qr" } } as any)).rejects.toThrow("método de pago");
    await expect(setup({}).service.confirm("pi_1", { ...dto, paymentMethod: { type: "QR", token: "qr" } } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(test.dlocal.authorize).not.toHaveBeenCalled();
    expect(test.update).not.toHaveBeenCalled();
  });

  it("writes the FX snapshot only for international charges and drops a stale one on a domestic retry", async () => {
    const fx = { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "2026-09-16T00:00:00.000Z" };

    const domesticRetry = setup({}, { amount: 10058, currency: "USD", status: "FAILED", metadata: { fx, storeId: "store_1" } });
    domesticRetry.paymentMethods.findOrCreate.mockResolvedValue({ id: "pm_qr", type: "QR" });
    await domesticRetry.service.confirm("pi_1", { paymentMethod: { type: "QR", token: "qr" } } as any);
    const retried = domesticRetry.update.mock.calls[0][0].data;
    expect(retried).toMatchObject({ amount: 70000, currency: "BOB" });
    expect(retried.metadata).not.toHaveProperty("fx");
    expect(retried.metadata).toMatchObject({ storeId: "store_1" });

    const domesticFirst = setup({});
    domesticFirst.paymentMethods.findOrCreate.mockResolvedValue({ id: "pm_qr", type: "QR" });
    await domesticFirst.service.confirm("pi_1", { paymentMethod: { type: "QR", token: "qr" } } as any);
    expect(domesticFirst.update.mock.calls[0][0].data.metadata).not.toHaveProperty("fx");

    const international = setup({});
    await international.service.confirm("pi_1", dto as any);
    expect(international.update.mock.calls[0][0].data.metadata.fx).toMatchObject({ originalAmount: 70000, rate: 6.96 });
  });

  it("requires a country and a shopper email", async () => {
    await expect(setup({}).service.confirm("pi_1", { ...dto, country: undefined } as any)).rejects.toThrow("país");
    await expect(setup({}).service.confirm("pi_1", { ...dto, customerEmail: undefined } as any)).rejects.toThrow("correo");
  });
});

describe("PaymentIntentsService.latestAuthorization", () => {
  it("returns the newest authorization attempt's reference and status, or null for an unknown intent", async () => {
    const findUnique = jest.fn()
      .mockResolvedValueOnce({ merchantId: "m_1", transactions: [{ railReference: "D-2", status: "PENDING" }] })
      .mockResolvedValueOnce({ merchantId: "m_1", transactions: [] })
      .mockResolvedValueOnce(null);
    const service = new PaymentIntentsService({ paymentIntent: { findUnique } } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, noopConfig());

    await expect(service.latestAuthorization("pi_1")).resolves.toEqual({ merchantId: "m_1", railReference: "D-2", status: "PENDING" });
    await expect(service.latestAuthorization("pi_1")).resolves.toEqual({ merchantId: "m_1", railReference: null, status: null });
    await expect(service.latestAuthorization("pi_x")).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pi_1" },
      select: expect.objectContaining({ transactions: expect.objectContaining({ where: { type: "AUTHORIZATION" }, orderBy: { createdAt: "desc" }, take: 1 }) }),
    }));
  });
});

describe("PaymentIntentsService receipts", () => {
  it("labels a converted intent's cart lines in BOB and appends the original BOB total next to the charged USD total", async () => {
    const prisma = { storeOrder: { findUnique: jest.fn().mockResolvedValue(null) } };
    const email = { send: jest.fn() };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, email as any, noopConfig());

    await (service as any).sendReceiptEmail(
      {
        id: "pi_1",
        amount: 10058,
        currency: "USD",
        customerEmail: "ana@example.com",
        customerName: "Ana",
        metadata: {
          fx: { originalAmount: 70000, originalCurrency: "BOB", rate: 6.96, convertedAt: "2026-09-17T12:00:00.000Z" },
          cart: [{ paymentLinkId: "link_1", name: "Zapatos", quantity: 1, unitAmount: 70000 }],
        },
      },
      "Tienda Ejemplo",
    );

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "ana@example.com",
      body: expect.stringContaining("700.00 BOB"),
    }));
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining("100.58 USD (700.00 BOB)"),
    }));
  });

  it("leaves a domestic receipt byte-identical (no original-total suffix, line currency unchanged)", async () => {
    const prisma = { storeOrder: { findUnique: jest.fn().mockResolvedValue(null) } };
    const email = { send: jest.fn() };
    const service = new PaymentIntentsService(prisma as any, {} as any, {} as any, {} as any, {} as any, {} as any, email as any, noopConfig());

    await (service as any).sendReceiptEmail(
      {
        id: "pi_2",
        amount: 5000,
        currency: "BOB",
        customerEmail: "ana@example.com",
        customerName: "Ana",
        metadata: { cart: [{ paymentLinkId: "link_1", name: "Zapatos", quantity: 1, unitAmount: 5000 }] },
      },
      "Tienda Ejemplo",
    );

    const body = email.send.mock.calls[0][0].body as string;
    expect(body).toContain("50.00 BOB");
    expect(body).not.toMatch(/\(\d/);
  });
});
