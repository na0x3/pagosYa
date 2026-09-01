import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MerchantStatus, PromoDiscountType, StoreStatus } from "@prisma/client";
import { StoresService } from "./stores.service";

function makeFakePrisma() {
  const prisma = {
    store: { create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), delete: jest.fn(), update: jest.fn() },
    merchant: { findUniqueOrThrow: jest.fn() },
    paymentLink: { findMany: jest.fn(), groupBy: jest.fn().mockResolvedValue([]), update: jest.fn() },
    storeLead: { create: jest.fn().mockResolvedValue({ id: "lead_1" }) },
    storeNewsletterSubscriber: { upsert: jest.fn().mockResolvedValue({ id: "subscriber_1" }) },
    storeOrder: { create: jest.fn().mockResolvedValue({ id: "order_1" }) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeLink: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    storeProductStat: { findMany: jest.fn().mockResolvedValue([]) },
    appointmentServiceOffering: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
    mediaAsset: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  // Batch transactions resolve their prepared operations; interactive ones
  // receive the same delegate mocks as the root client.
  prisma.$transaction.mockImplementation((ops: Promise<unknown>[] | ((tx: any) => unknown)) =>
    typeof ops === "function" ? ops(prisma) : Promise.all(ops));
  return prisma;
}

function makeFakePaymentIntents() {
  const create = jest.fn().mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret_x" });
  return { create, createInTransaction: jest.fn((_tx, ...args) => create(...args)) };
}

function makeFakeUploads() {
  return { deleteFiles: jest.fn().mockResolvedValue(undefined) };
}

const store = { id: "store_1", merchantId: "m_1", slug: "abc123", status: StoreStatus.ACTIVE };
const merchant = { id: "m_1", status: MerchantStatus.ACTIVE };

describe("StoresService.create", () => {
  it("starts a new store with an editable opening animation and contact/location at the end", async () => {
    const prisma = makeFakePrisma();
    prisma.store.create.mockImplementation(({ data }) => Promise.resolve({ id: "store_new", ...data }));
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await service.create("m_1", { name: "Tienda nueva" } as any);

    expect(prisma.store.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        animations: [expect.objectContaining({ id: "welcome", type: "clarity-marquee", media: [] })],
        contentOrder: ["animation-welcome", "hero", "about", "products", "gallery", "links", "contact", "location"],
      }),
    }));
  });
});

describe("StoresService.createQuickQrPayment", () => {
  it("creates and starts a store-scoped QR payment from a dashboard session", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({ ...store, name: "Burgeria", merchant });
    const paymentIntents = {
      create: jest.fn().mockResolvedValue({ id: "pi_quick", clientSecret: "pi_quick_secret_x" }),
      confirm: jest.fn().mockResolvedValue({
        paymentIntent: {
          id: "pi_quick",
          clientSecret: "pi_quick_secret_x",
          status: "REQUIRES_ACTION",
          amount: 4550,
          currency: "BOB",
        },
        railResult: {
          status: "requires_action",
          actionRequired: { type: "qr_display", data: { qrPayload: "000201pagosya" } },
        },
      }),
    };
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    const result = await service.createQuickQrPayment("m_1", "store_1", { amount: 4550, description: "Mesa 4" });

    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({
      amount: 4550,
      currency: "BOB",
      description: "Mesa 4",
      metadata: { storeId: "store_1", quickPayment: { source: "dashboard", storeName: "Burgeria" } },
    }));
    expect(paymentIntents.confirm).toHaveBeenCalledWith("pi_quick", {
      paymentMethod: { type: "QR", token: "tok_qr_demo" },
    });
    expect(result.qrImageDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("blocks cashier QR creation for an inactive merchant", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({
      ...store,
      name: "Burgeria",
      merchant: { status: MerchantStatus.PENDING },
    });
    const paymentIntents = { create: jest.fn(), confirm: jest.fn() };
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await expect(service.createQuickQrPayment("m_1", "store_1", { amount: 4550 })).rejects.toBeInstanceOf(BadRequestException);
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });
});

describe("StoresService.listPublishedStores", () => {
  it("returns only directory-safe store summaries with pagination", async () => {
    const prisma = makeFakePrisma();
    prisma.store.count.mockResolvedValue(1);
    prisma.store.findMany.mockResolvedValue([{
      id: "store_1",
      slug: "abc123",
      name: "Estudio Norte",
      tagline: "Diseño hecho en Bolivia",
      logoUrl: "/v1/uploads/logo.webp",
      bannerUrl: null,
      accentColor: "#c58b3c",
      backgroundColor: "#111111",
      checkoutMode: "payment",
      createdAt: new Date("2026-08-01T12:00:00Z"),
      categories: [{ name: "Hogar" }],
      paymentLinks: [{ name: "Lámpara", amount: 12500, currency: "BOB", imageUrls: ["/v1/uploads/lamp.webp"] }],
      _count: { paymentLinks: 4 },
    }]);
    prisma.paymentLink.groupBy.mockResolvedValue([{ storeId: "store_1", _min: { amount: 9900 } }]);

    const result = await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any)
      .listPublishedStores("lámpara", "1", "24");

    expect(result.stores[0]).toMatchObject({
      name: "Estudio Norte",
      slug: "abc123",
      coverUrl: "/v1/uploads/lamp.webp",
      productCount: 4,
      minimumAmount: 9900,
      categories: ["Hogar"],
    });
    expect(result.pagination).toEqual({ page: 1, pageSize: 24, total: 1, totalPages: 1, hasMore: false });
    expect(prisma.store.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        merchant: { status: "ACTIVE" },
        paymentLinks: { some: { status: "ACTIVE" } },
        OR: expect.any(Array),
      }),
    }));
  });
});

describe("StoresService.subscribeNewsletter", () => {
  it("normalizes the email and reactivates an existing subscriber without duplicates", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.subscribeNewsletter("abc123", "  Cliente@Example.COM ")).resolves.toEqual({ subscribed: true });

    expect(prisma.storeNewsletterSubscriber.upsert).toHaveBeenCalledWith({
      where: { storeId_email: { storeId: "store_1", email: "cliente@example.com" } },
      create: { storeId: "store_1", email: "cliente@example.com" },
      update: { isActive: true },
    });
  });
});

describe("StoresService.submitLead", () => {
  it("emails the merchant's configured contact with customer and cart details", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      name: "Estudio Norte",
      checkoutMode: "external",
      contactEmail: "ventas@estudionorte.bo",
    });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ ...merchant, email: "cuenta@estudionorte.bo" });
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1",
      name: "Asesoría de interiores",
      amount: 15000,
      currency: "BOB",
      variants: [],
      extras: [],
    }]);
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any, email as any);

    await expect(service.submitLead("abc123", {
      name: "María Pérez",
      email: "maria@gmail.com",
      phone: "+591 71234567",
      message: "¿Atienden en Cochabamba?",
      items: [{ paymentLinkId: "link_1", quantity: 1 }],
    })).resolves.toEqual({ submitted: true, leadId: "lead_1" });

    expect(email.send).toHaveBeenCalledWith({
      to: "ventas@estudionorte.bo",
      subject: "Nuevo interesado en Estudio Norte: María Pérez",
      body: expect.stringContaining("Correo: maria@gmail.com"),
      replyTo: "maria@gmail.com",
      failLoudly: true,
    });
    expect(email.send.mock.calls[0][0].body).toContain("Asesoría de interiores × 1");
    expect(email.send.mock.calls[0][0].body).toContain("Total de referencia: 150.00 BOB");
    expect(prisma.storeLead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        storeId: "store_1",
        customerName: "María Pérez",
        customerEmail: "maria@gmail.com",
        customerPhone: "+591 71234567",
        amount: 15000,
      }),
    }));
  });

  it("rejects contact-form submissions for a paid cart in a payment store", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, name: "Tienda", checkoutMode: "payment", contactEmail: null });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ ...merchant, email: "merchant@example.com" });
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Producto", amount: 100, currency: "BOB", variants: [], extras: [],
    }]);
    const email = { send: jest.fn() };
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any, email as any);

    await expect(service.submitLead("abc123", {
      name: "María Pérez",
      email: "maria@gmail.com",
      phone: "+591 71234567",
      items: [{ paymentLinkId: "link_1", quantity: 1 }],
    })).rejects.toThrow("solo recibe formularios para pedidos con total cero");
    expect(email.send).not.toHaveBeenCalled();
  });

  it("emails a zero-total order from a payment store without opening a payment intent", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, name: "Tienda", checkoutMode: "payment", contactEmail: null });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ ...merchant, email: "merchant@example.com" });
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "free_1", name: "Muestra gratis", amount: 0, currency: "BOB", variants: [], extras: [],
    }]);
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any, email as any);

    await expect(service.submitLead("abc123", {
      name: "María Pérez", email: "maria@gmail.com", phone: "+591 71234567",
      items: [{ paymentLinkId: "free_1", quantity: 1 }],
    })).resolves.toEqual({ submitted: true, leadId: "lead_1" });

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: "merchant@example.com" }));
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });

  it("accepts an email-only checkout lead for an external store", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, name: "Estudio Norte", checkoutMode: "external", contactEmail: null });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ ...merchant, email: "owner@gmail.com" });
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Asesoría", amount: 15000, currency: "BOB", variants: [], extras: [],
    }]);
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any, email as any);

    await expect(service.submitLead("abc123", {
      email: "maria@gmail.com",
      items: [{ paymentLinkId: "link_1", quantity: 1 }],
    })).resolves.toEqual({ submitted: true, leadId: "lead_1" });

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@gmail.com",
      subject: "Nuevo interesado en Estudio Norte: maria@gmail.com",
    }));
    expect(prisma.storeLead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ customerName: "Cliente interesado", customerPhone: "" }),
    }));
  });

  it("routes an enabled storefront contact form to its private owner email", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      name: "Estudio Norte",
      checkoutMode: "whatsapp",
      contactFormEnabled: true,
      contactFormEmail: "owner@gmail.com",
      contactEmail: "public@estudionorte.bo",
    });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue({ ...merchant, email: "account@estudionorte.bo" });
    prisma.paymentLink.findMany.mockResolvedValue([]);
    const email = { send: jest.fn().mockResolvedValue(undefined) };
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any, email as any);

    await expect(service.submitLead("abc123", {
      name: "Ana",
      email: "ana@gmail.com",
      message: "¿Abren los sábados?",
      items: [],
    })).resolves.toEqual({ submitted: true, leadId: "lead_1" });

    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({
      to: "owner@gmail.com",
      subject: "Nuevo mensaje para Estudio Norte: Ana",
      body: expect.stringContaining("¿Abren los sábados?"),
      replyTo: "ana@gmail.com",
    }));
  });
});

describe("StoresService.createCartCheckout — stock enforcement", () => {
  it("rejects PaymentIntent creation for a lead-only external store", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, checkoutMode: "external", leadCaptureUrl: "https://example.com/contacto" });
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 1 }] })).rejects.toThrow(
      "Esta tienda no tiene habilitados los pagos integrados",
    );
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects a cart that asks for more than the tracked stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Tinte de cabello", amount: 8000, currency: "BOB", stock: 2 },
    ]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 3 }] })).rejects.toThrow(
      BadRequestException,
    );
  });

  it("requires one branch that can fulfill the whole cart and snapshots its fulfillment", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-24T16:00:00.000Z"));
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      name: "Cocina Norte",
      checkoutMode: "payment",
      locations: [
        { id: "centro", name: "Sucursal Centro", pickupEnabled: true, deliveryEnabled: true, openingHours: [{ day: 1, open: "09:00", close: "11:00", closed: false }, { day: 2, open: "09:00", close: "18:00", closed: false }] },
        { id: "sur", name: "Sucursal Sur", pickupEnabled: true, deliveryEnabled: false, openingHours: [] },
      ],
    });
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Almuerzo", amount: 5000, currency: "BOB", stock: 3, locationStocks: { centro: 3, sur: 0 }, variants: [], extras: [] },
    ]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", {
      items: [{ paymentLinkId: "link_1", quantity: 1 }],
      locationId: "sur",
      fulfillmentMethod: "pickup",
    })).rejects.toThrow("Sucursal Sur no tiene suficiente stock");

    await service.createCartCheckout("abc123", {
      items: [{ paymentLinkId: "link_1", quantity: 1 }],
      locationId: "centro",
      fulfillmentMethod: "delivery",
    });

    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({
      metadata: expect.objectContaining({
        fulfillment: expect.objectContaining({ locationId: "centro", locationName: "Sucursal Centro", method: "delivery", readyAt: "2026-08-25T13:00:00.000Z" }),
      }),
    }));
    expect(prisma.storeOrder.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fulfillmentLocationId: "centro",
        fulfillmentLocationName: "Sucursal Centro",
        fulfillmentMethod: "delivery",
        fulfillmentReadyAt: new Date("2026-08-25T13:00:00.000Z"),
      }),
    }));
    jest.useRealTimers();
  });

  it("allows a cart that exactly matches the remaining stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Tinte de cabello", amount: 8000, currency: "BOB", stock: 2 },
    ]);
    const paymentIntents = makeFakePaymentIntents();

    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);
    await service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 2 }] });

    expect(paymentIntents.create).toHaveBeenCalled();
  });

  it("never blocks a cart against a product with untracked (null) stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Corte de cabello", amount: 5000, currency: "BOB", stock: null },
    ]);
    const paymentIntents = makeFakePaymentIntents();

    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);
    await service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 999 }] });

    expect(paymentIntents.create).toHaveBeenCalled();
  });

  it("prices each selected option separately while sharing the product stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        id: "link_1",
        name: "Hamburguesa",
        amount: 5000,
        currency: "BOB",
        stock: 3,
        variants: [
          { id: "var_small", name: "Pequeña", amount: 5000 },
          { id: "var_large", name: "Grande", amount: 8000 },
        ],
      },
    ]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await service.createCartCheckout("abc123", {
      items: [
        { paymentLinkId: "link_1", variantId: "var_small", quantity: 1 },
        { paymentLinkId: "link_1", variantId: "var_large", quantity: 2 },
      ],
    });

    expect(paymentIntents.create).toHaveBeenCalledWith(
      "m_1",
      true,
      expect.objectContaining({
        amount: 21000,
        description: "Hamburguesa (Pequeña) x1, Hamburguesa (Grande) x2",
        metadata: {
          storeId: "store_1",
          cart: [
            { paymentLinkId: "link_1", variantId: "var_small", variantName: "Pequeña", name: "Hamburguesa", quantity: 1, unitAmount: 5000 },
            { paymentLinkId: "link_1", variantId: "var_large", variantName: "Grande", name: "Hamburguesa", quantity: 2, unitAmount: 8000 },
          ],
        },
      }),
    );
  });

  it("charges the active scheduled discount using the server clock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_sale",
      name: "Café Geisha",
      amount: 10000,
      currency: "BOB",
      stock: null,
      variants: [],
      extras: [],
      discountPercent: 25,
      discountStartsAt: new Date("2000-01-01T00:00:00.000Z"),
      discountEndsAt: new Date("2100-01-01T00:00:00.000Z"),
    }]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_sale", quantity: 2 }] });

    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({
      amount: 15000,
      metadata: { storeId: "store_1", cart: [{ paymentLinkId: "link_sale", name: "Café Geisha", quantity: 2, unitAmount: 7500 }] },
    }));
  });

  it("applies an active promo code to the server-owned cart total", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Mochila", amount: 10000, currency: "BOB", stock: null,
      variants: [], extras: [], discountPercent: null, discountStartsAt: null, discountEndsAt: null,
    }]);
    const paymentIntents = makeFakePaymentIntents();
    const promoCodes = {
      resolveActiveForStore: jest.fn().mockResolvedValue({ code: "VIAJE20", discountType: PromoDiscountType.PERCENT, discountValue: 20 }),
      discountAmount: jest.fn().mockReturnValue(4000),
    };
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any, undefined, promoCodes as any);

    await service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 2 }], promoCode: "VIAJE20" });

    expect(promoCodes.resolveActiveForStore).toHaveBeenCalledWith("store_1", "VIAJE20");
    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({
      amount: 16000,
      metadata: expect.objectContaining({ promoCode: "VIAJE20", promoDiscountAmount: 4000, subtotal: 20000 }),
    }));
  });

  it("rejects mixed options when their combined quantity exceeds shared stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        id: "link_1",
        name: "Hamburguesa",
        amount: 5000,
        currency: "BOB",
        stock: 2,
        variants: [
          { id: "var_small", name: "Pequeña", amount: 5000 },
          { id: "var_large", name: "Grande", amount: 8000 },
        ],
      },
    ]);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(
      service.createCartCheckout("abc123", {
        items: [
          { paymentLinkId: "link_1", variantId: "var_small", quantity: 1 },
          { paymentLinkId: "link_1", variantId: "var_large", quantity: 2 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("requires a valid option when the product defines options", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        id: "link_1",
        name: "Hamburguesa",
        amount: 5000,
        currency: "BOB",
        stock: null,
        variants: [
          { id: "var_small", name: "Pequeña", amount: 5000 },
          { id: "var_large", name: "Grande", amount: 8000 },
        ],
      },
    ]);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 1 }] })).rejects.toThrow(
      'Elige una opción para "Hamburguesa"',
    );
  });

  it("requires mandatory extras and rejects stale extra ids", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Pizza", amount: 8000, currency: "BOB", stock: null,
      extras: [{ id: "cheese", name: "Queso", amount: 500, required: true }],
    }]);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", quantity: 1 }] }))
      .rejects.toThrow('Elige "Queso" para "Pizza"');
    await expect(service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", extraIds: ["removed"], quantity: 1 }] }))
      .rejects.toThrow('Un extra de "Pizza" ya no está disponible');
  });

  it("adds selected extra costs on the server and snapshots them in payment metadata", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Pizza", amount: 8000, currency: "BOB", stock: null,
      extras: [
        { id: "cheese", name: "Queso", amount: 500, required: true },
        { id: "gift", name: "Caja regalo", amount: 300, required: false },
      ],
    }]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await service.createCartCheckout("abc123", { items: [{ paymentLinkId: "link_1", extraIds: ["gift", "cheese"], quantity: 2 }] });

    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({
      amount: 17600,
      description: "Pizza + Queso + Caja regalo x2",
      metadata: { storeId: "store_1", cart: [{
        paymentLinkId: "link_1", extraIds: ["cheese", "gift"],
        extras: [
          { id: "cheese", name: "Queso", amount: 500, required: true },
          { id: "gift", name: "Caja regalo", amount: 300, required: false },
        ],
        name: "Pizza", quantity: 2, unitAmount: 8800,
      }] },
    }));
  });

  it("includes two grouped sides and charges the third selection", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "lunch_1", name: "Almuerzo", amount: 3000, currency: "BOB", stock: null,
      extras: [
        { id: "rice", name: "Arroz", amount: 500, required: false, groupName: "Guarniciones", freeAllowance: 2 },
        { id: "salad", name: "Ensalada", amount: 600, required: false, groupName: "Guarniciones", freeAllowance: 2 },
        { id: "fries", name: "Papas", amount: 700, required: false, groupName: "Guarniciones", freeAllowance: 2 },
      ],
    }]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await service.createCartCheckout("abc123", {
      items: [{ paymentLinkId: "lunch_1", extraIds: ["rice", "salad", "fries"], quantity: 2 }],
    });

    expect(paymentIntents.create).toHaveBeenCalledWith("m_1", true, expect.objectContaining({ amount: 7400 }));
  });

  it("rejects a cart whose combined products exceed one shared extra pool", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        id: "burger_1", name: "Burger clásica", amount: 5000, currency: "BOB", stock: null,
        extras: [{ id: "cottage_1", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 1 }],
      },
      {
        id: "burger_2", name: "Burger doble", amount: 7000, currency: "BOB", stock: null,
        extras: [{ id: "cottage_2", name: "Cottage", amount: 600, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 1 }],
      },
    ]);
    const paymentIntents = makeFakePaymentIntents();
    const service = new StoresService(prisma as any, paymentIntents as any, makeFakeUploads() as any);

    await expect(service.createCartCheckout("abc123", { items: [
      { paymentLinkId: "burger_1", extraIds: ["cottage_1"], quantity: 1 },
      { paymentLinkId: "burger_2", extraIds: ["cottage_2"], quantity: 1 },
    ] })).rejects.toThrow('Ya no hay suficiente stock de "Queso cottage"');
    expect(paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects a cart above the selected option's own stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.merchant.findUniqueOrThrow.mockResolvedValue(merchant);
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        id: "link_1",
        name: "Hamburguesa",
        amount: 5000,
        currency: "BOB",
        stock: 5,
        variants: [
          { id: "var_small", name: "Pequeña", amount: 5000, stock: 1 },
          { id: "var_large", name: "Grande", amount: 8000, stock: 4 },
        ],
      },
    ]);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(
      service.createCartCheckout("abc123", {
        items: [{ paymentLinkId: "link_1", variantId: "var_small", quantity: 2 }],
      }),
    ).rejects.toThrow('Solo quedan 1 unidades de "Hamburguesa (Pequeña)"');
  });
});

describe("StoresService.getStorePublic — sold counts", () => {
  it("returns upcoming connected events with live ticket availability", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, name: "Casa Norte" });
    prisma.paymentLink.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([{
      id: "event_1",
      slug: "noche-norte",
      name: "Noche Norte",
      description: "Música en vivo",
      publicityImageUrl: "",
      startsAt: new Date("2026-10-10T00:00:00Z"),
      endsAt: new Date("2026-10-10T04:00:00Z"),
      doorsOpenAt: new Date("2026-10-09T23:00:00Z"),
      timezone: "America/La_Paz",
      venue: { name: "Patio Norte", city: "La Paz" },
      ticketTypes: [{ id: "ticket_1", name: "General", price: 8000, currency: "BOB", inventory: 100, reservedQuantity: 7, soldQuantity: 43 }],
    }]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.events).toEqual([expect.objectContaining({
      id: "event_1",
      ticketTypes: [expect.objectContaining({ id: "ticket_1", available: 50 })],
    })]);
  });

  it("returns the merchant-authored public location block", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      locationMapUrl: "https://www.google.com/maps/embed?pb=trusted-map",
      locationDescription: "Atendemos de lunes a sábado.",
      locationHighlight: "A media cuadra de la plaza",
    });
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result).toMatchObject({
      locationMapUrl: "https://www.google.com/maps/embed?pb=trusted-map",
      locationDescription: "Atendemos de lunes a sábado.",
      locationHighlight: "A media cuadra de la plaza",
    });
  });

  it("expands a legacy animation slot into independently ordered animation sections", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      contentOrder: ["hero", "motion", "about", "products", "gallery", "links"],
      motionDuoEnabled: true,
      motionExperience: "hero-carousel",
      motionExperiences: ["hero-carousel", "frame-sequence"],
    });
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.contentOrder).toEqual([
      "hero",
      "animation-legacy-1-hero-carousel",
      "animation-legacy-2-frame-sequence",
      "about",
      "products",
      "gallery",
      "links",
      "contact",
      "location",
    ]);
  });

  it("returns saved animation instances with their independent media and order", async () => {
    const prisma = makeFakePrisma();
    const animations = [
      {
        id: "apertura",
        name: "Portada de agosto",
        type: "hero-carousel",
        title: "Nueva colección",
        subtitle: "Piezas seleccionadas",
        productId: "product_1",
        buttonLabel: "Ver colección",
        buttonPositionX: 42,
        buttonPositionY: 78,
        textPositionX: 72,
        textPositionY: 28,
        textScale: 143,
        textWidthPercent: 74,
        textAlign: "right",
        textSize: "large",
        textWidth: "wide",
        textColor: "#fff4d6",
        backgroundColor: "#26170d",
        fontStyle: "classic",
        textBlocks: [{ id: "title-1", role: "title", text: "Una segunda historia", textPositionX: 18, textPositionY: 30, textScale: 120, textWidthPercent: 62, textAlign: "left", textColor: "#ffffff", fontStyle: "editorial" }],
        media: [{ imageUrl: "/v1/uploads/open.webp", title: "Lana", fontStyle: "geometric" }],
      },
      {
        id: "cierre",
        name: "Reseñas del final",
        type: "stagger-testimonials",
        media: [{ imageUrl: "/v1/uploads/review.webp", caption: "Ana", body: "Me encantó." }],
      },
    ];
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      animations,
      contentOrder: ["animation-cierre", "hero", "products", "animation-apertura", "links"],
    });
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.animations).toEqual(animations);
    expect(result.contentOrder).toEqual([
      "animation-cierre",
      "hero",
      "products",
      "animation-apertura",
      "about",
      "gallery",
      "links",
      "contact",
      "location",
    ]);
  });

  it("reads legacy Scroll Expansion entries with only their two rendered image roles", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      animations: [{
        id: "expand",
        name: "Expansión",
        type: "scroll-expansion",
        media: Array.from({ length: 8 }, (_, index) => ({ imageUrl: `/v1/uploads/expand-${index + 1}.webp` })),
      }],
      contentOrder: ["hero", "animation-expand", "products", "links"],
    });
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const result = await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any)
      .getStorePublic("abc123", { trackView: false });

    expect(result.animations[0].media.map((entry: any) => entry.imageUrl)).toEqual([
      "/v1/uploads/expand-1.webp",
      "/v1/uploads/expand-2.webp",
    ]);
  });

  it("keeps inventory out of storefront copy while returning cart enforcement limits", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({ ...store, showLowStockToCustomers: false });
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "link_1", name: "Burger", imageUrls: [], imagePositions: [], tags: [], stock: 3, color: null,
      amount: 5000, currency: "BOB", categoryId: null, description: null,
      variants: [{ id: "large", name: "Grande", amount: 6000, stock: 2 }],
      extras: [
        { id: "cottage", name: "Cottage", amount: 500, required: false, inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 0 },
        { id: "bacon", name: "Tocino", amount: 700, required: false, inventoryKey: "tocino", inventoryName: "Tocino", stock: 8 },
      ],
    }]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.items[0].stock).toBeNull();
    expect(result.items[0].purchaseLimit).toBe(3);
    expect(result.items[0].variants[0].stock).toBeNull();
    expect(result.items[0].variants[0].purchaseLimit).toBe(2);
    expect(result.items[0].extras).toEqual([
      { id: "cottage", name: "Cottage", amount: 500, required: false, available: false },
      { id: "bacon", name: "Tocino", amount: 700, required: false, available: true },
    ]);
  });

  it("does not inflate store views when the merchant loads an editor preview", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.getStorePublic("abc123", { trackView: false });

    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("counts an ordinary external storefront load", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.getStorePublic("abc123");
    await service.flushPendingStoreViews();

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: "store_1" },
      data: { viewCount: { increment: 1 } },
    });
  });

  it("coalesces concurrent storefront views into one database increment", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([]);
    prisma.store.update.mockResolvedValue(store);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await Promise.all(Array.from({ length: 25 }, () => service.getStorePublic("abc123")));
    expect(prisma.store.update).not.toHaveBeenCalled();
    await service.flushPendingStoreViews();

    expect(prisma.store.update).toHaveBeenCalledTimes(1);
    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: "store_1" },
      data: { viewCount: { increment: 25 } },
    });
  });

  it("returns validated editorial card colors and drops unsafe legacy values", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      editorialGallery: [
        { imageUrl: "/v1/uploads/workshop.png", productId: "link_1", caption: "Nuestro taller", boxColor: "#f4ead7" },
        { imageUrl: "/v1/uploads/team.png", productId: "missing_product", caption: "El equipo", boxColor: "not-a-color" },
      ],
    });
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Pieza", imageUrls: [], tags: [], stock: null, color: null, amount: 5000, currency: "BOB", categoryId: null, description: null },
    ]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.editorialGallery).toEqual([
      { imageUrl: "/v1/uploads/workshop.png", productId: "link_1", caption: "Nuestro taller", boxColor: "#f4ead7" },
      { imageUrl: "/v1/uploads/team.png", caption: "El equipo" },
    ]);
  });

  it("attaches per-product units sold from this store's succeeded cart checkouts", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Corte", imageUrls: [], tags: [], stock: null, color: null, amount: 5000, currency: "BOB", categoryId: null, description: null },
      { id: "link_2", name: "Tinte", imageUrls: [], tags: [], stock: null, color: null, amount: 8000, currency: "BOB", categoryId: null, description: null },
    ]);
    prisma.storeProductStat.findMany.mockResolvedValue([
      { paymentLinkId: "link_1", quantity: 5 },
      { paymentLinkId: "link_2", quantity: 1 },
    ]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123");

    expect(result.items.map((i: any) => [i.id, i.soldCount])).toEqual([
      ["link_1", 5],
      ["link_2", 1],
    ]);
  });

  it("counts zero for a product that has never been sold", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Corte", imageUrls: [], tags: [], stock: null, color: null, amount: 5000, currency: "BOB", categoryId: null, description: null },
    ]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123");

    expect(result.items[0].soldCount).toBe(0);
  });
});

describe("StoresService.update — accentColor clearing", () => {
  it("clears accentColor to null when the DTO explicitly sends null (merchant turned off custom color)", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue({ ...store, accentColor: null });

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.update("m_1", "store_1", { accentColor: null } as any);

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: "store_1" },
      data: { accentColor: null },
    });
  });

  it("leaves accentColor untouched when the DTO omits it entirely", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.update("m_1", "store_1", { name: "Renamed" } as any);

    const call = prisma.store.update.mock.calls[0][0];
    expect(call.data).not.toHaveProperty("accentColor");
  });
});

describe("StoresService.update — animation media roles", () => {
  it("stores only the two ordered images that Scroll Expansion can render", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);
    const media = Array.from({ length: 8 }, (_, index) => ({ imageUrl: `/v1/uploads/expand-${index + 1}.webp` }));

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.update("m_1", "store_1", {
      animations: [{ id: "expand", name: "Expansión", type: "scroll-expansion", media }],
    } as any);

    expect(prisma.store.update.mock.calls[0][0].data.animations[0].media).toEqual(media.slice(0, 2));
  });
});

describe("StoresService.update — authored AI site", () => {
  it("persists editable header links and a structured footer inside the site document", async () => {
    const prisma = makeFakePrisma();
    const section = (id: string, kind: string) => ({
      id, kind, layout: "split", width: "wide", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
    });
    const siteDocument = {
      version: 1,
      theme: { pageBackground: "#f5f2ea", accentColor: "#315c49", headingFont: "editorial", bodyFont: "grotesk" },
      navigation: { layout: "centered", sticky: false, transparent: false, logoTreatment: "wordmark" },
      sections: [section("opening", "hero"), section("story", "story"), section("shop", "catalog"), section("information", "contact")],
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument });
    prisma.store.update.mockResolvedValue(store);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      siteNavigationItems: [
        { id: "home", label: "Inicio", target: "home" },
        { id: "story-link", label: "Nuestra historia", target: "section", sectionId: "story" },
      ],
      siteFooter: {
        enabled: true,
        brandDescription: "Hecho en Bolivia.",
        columns: [{ id: "visit", title: "Visítanos", items: [{ id: "address", label: "La Paz", href: "" }] }],
        copyright: "© 2026 Mi tienda",
        badge: "Tienda impulsada por pagosYa",
      },
    } as any);

    const saved = prisma.store.update.mock.calls[0][0].data.siteDocument;
    expect(saved.navigation.items).toEqual([
      { id: "home", label: "Inicio", target: "home" },
      { id: "story-link", label: "Nuestra historia", target: "section", sectionId: "story" },
    ]);
    expect(saved.footer).toEqual(expect.objectContaining({ enabled: true, brandDescription: "Hecho en Bolivia.", copyright: "© 2026 Mi tienda" }));
  });

  it("persists a coherent art direction without replacing brand colors or content", async () => {
    const prisma = makeFakePrisma();
    const section = (id: string, kind: string) => ({
      id, kind, family: "editorial", layout: "split", width: "wide", align: "left", motion: "none",
      title: `${kind} propio`, body: `Texto ${kind}`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: kind === "hero" ? ["/v1/uploads/hero.webp"] : [], items: [],
    });
    const siteDocument = {
      version: 1, direction: "Dirección anterior",
      designGenome: { composition: "editorial-split", rhythm: "balanced", geometry: "soft", colorStrategy: "accent-led", mediaStrategy: "natural", typeScale: "balanced", motionLanguage: "still" },
      theme: { pageBackground: "#f5f2ea", textColor: "#171717", accentColor: "#315c49", secondaryColor: "#c9a86a", surfaceColor: "#ffffff", mutedColor: "#626262", borderColor: "#c9c9c4", headingFont: "editorial", bodyFont: "grotesk", radius: 8, shadow: "soft", productLayout: "editorial", displayScale: "balanced", density: "balanced", imageTreatment: "natural" },
      navigation: { layout: "centered", sticky: false, transparent: false, logoTreatment: "wordmark" },
      motion: { intensity: "restrained" },
      merchandising: { featuredProductIds: ["product_1"], productOrderIds: ["product_1"], spotlightLayout: "collection", showDescriptions: true },
      sections: [section("opening", "hero"), section("shop", "catalog"), section("information", "contact")],
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument });
    prisma.store.update.mockResolvedValue(store);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      siteArtDirection: "cinematic-atelier",
    } as any);

    const saved = prisma.store.update.mock.calls[0][0].data.siteDocument;
    expect(saved.artDirection).toBe("cinematic-atelier");
    expect(saved.designGenome.composition).toBe("gallery-axis");
    expect(saved.theme).toEqual(expect.objectContaining({ pageBackground: "#f5f2ea", accentColor: "#315c49", productLayout: "showcase", displayScale: "monumental" }));
    expect(saved.sections.find((entry: any) => entry.kind === "hero")).toEqual(expect.objectContaining({ title: "hero propio", mediaUrls: ["/v1/uploads/hero.webp"], family: "cinematic", layout: "full-bleed" }));
    expect(saved.merchandising.featuredProductIds).toEqual(["product_1"]);
  });

  it("keeps the bespoke structure while projecting compatible editor changes", async () => {
    const prisma = makeFakePrisma();
    const section = (id: string, kind: string) => ({
      id, kind, layout: "split", width: "wide", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: kind === "hero" ? ["/v1/uploads/hero.webp"] : [], items: [],
    });
    const siteDocument = {
      version: 1,
      theme: { pageBackground: "#f5f2ea", accentColor: "#315c49", headingFont: "editorial", bodyFont: "grotesk" },
      experience: { type: "text-rotate", placement: "after-catalog", title: "Vestidos|Abrigos", body: "Favoritos", mediaUrls: [] },
      sections: [section("opening", "hero"), section("shop", "catalog"), section("story", "story"), section("information", "contact")],
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, bannerUrl: null, aboutImageUrl: null, editorialGallery: [], siteDocument });
    prisma.store.update.mockResolvedValue(store);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      tagline: "Una portada nueva",
      catalogTitle: "Compra la colección",
      contactSubtitle: "Cuéntanos qué necesitas",
      accentColor: "#aa2244",
      sectionBackgrounds: { "site-shop": "#eee8dd" },
      bannerUrl: null,
      animations: [{ id: "ai-signature-experience", name: "IA · Texto", type: "text-rotate", media: [] }],
    } as any);

    const saved = prisma.store.update.mock.calls[0][0].data.siteDocument;
    expect(saved.sections.map((entry: any) => entry.kind)).toEqual(["hero", "catalog", "story", "contact"]);
    expect(saved.sections.find((entry: any) => entry.kind === "hero")).toMatchObject({ title: "Una portada nueva", mediaUrls: ["/v1/uploads/hero.webp"] });
    expect(saved.sections.find((entry: any) => entry.kind === "catalog")).toMatchObject({ title: "Compra la colección", backgroundColor: "#eee8dd" });
    expect(saved.sections.find((entry: any) => entry.kind === "story").backgroundColor).toBe("#f5f2ea");
    expect(saved.sections.find((entry: any) => entry.kind === "contact").body).toBe("Cuéntanos qué necesitas");
    expect(saved.theme.accentColor).toBe("#aa2244");
    expect(saved.experience.type).toBe("none");
  });

  it("persists bounded copy, layout, motion and scene edits for a generated scrolling story", async () => {
    const prisma = makeFakePrisma();
    const section = (id: string, kind: string) => ({
      id, kind, layout: "split", width: "wide", align: "left", motion: "none",
      title: `${kind} title`, body: `${kind} body`, ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
    });
    const story = {
      ...section("brand-story", "story"),
      layout: "stacked",
      width: "full",
      motion: "story-scroll",
      mediaUrls: ["/v1/uploads/one.webp"],
      items: [{ title: "Texto original", body: "Historia original", mediaUrl: "/v1/uploads/one.webp" }],
    };
    const siteDocument = {
      version: 1,
      theme: { pageBackground: "#f5f2ea", accentColor: "#315c49", headingFont: "editorial", bodyFont: "grotesk" },
      sections: [section("opening", "hero"), story, section("shop", "catalog"), section("information", "contact")],
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, bannerUrl: null, aboutImageUrl: null, editorialGallery: [], siteDocument });
    prisma.store.update.mockResolvedValue(store);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      siteSections: [{
        id: "brand-story", title: "Detrás de QUEMADO2", body: "Una historia editable", ctaLabel: "Conoce más",
        family: "cinematic",
        layout: "rail", width: "wide", align: "right", motion: "parallax",
        backgroundColor: "#9b3527", textColor: "#fffaf2",
        mediaUrls: ["/v1/uploads/one.webp"],
        items: [{ title: "Texto con espacios", body: "La segunda animación también se puede editar", mediaUrl: "/v1/uploads/one.webp" }],
        blocks: [{
          id: "chapter-1", kind: "group", slot: "chapters", role: "primary", text: "", mediaUrl: null,
          children: [
            { id: "chapter-1-heading", kind: "heading", slot: "chapters", role: "secondary", text: "Texto con espacios", mediaUrl: null, children: [] },
            { id: "chapter-1-media", kind: "media", slot: "chapters", role: "primary", text: "", mediaUrl: "/v1/uploads/one.webp", children: [] },
          ],
        }],
      }],
    } as any);

    const savedStory = prisma.store.update.mock.calls[0][0].data.siteDocument.sections.find((entry: any) => entry.id === "brand-story");
    expect(savedStory).toMatchObject({
      title: "Detrás de QUEMADO2", body: "Una historia editable", ctaLabel: "Conoce más",
      family: "cinematic",
      layout: "rail", width: "wide", align: "right", motion: "parallax",
      backgroundColor: "#9b3527", textColor: "#fffaf2",
      mediaUrls: ["/v1/uploads/one.webp"],
    });
    expect(savedStory.items[0]).toEqual({ title: "Texto con espacios", body: "La segunda animación también se puede editar", mediaUrl: "/v1/uploads/one.webp" });
    expect(savedStory.blocks).toEqual([{ id: "chapter-1", kind: "group", slot: "chapters", role: "primary", text: "", mediaUrl: null, children: [
      { id: "chapter-1-heading", kind: "heading", slot: "chapters", role: "secondary", text: "Texto con espacios", mediaUrl: null, children: [] },
      { id: "chapter-1-media", kind: "media", slot: "chapters", role: "primary", text: "", mediaUrl: "/v1/uploads/one.webp", children: [] },
    ] }]);
  });

  it("rejects a generated-section image that is not owned by the merchant", async () => {
    const prisma = makeFakePrisma();
    const siteDocument = {
      version: 1,
      theme: {},
      sections: [{
        id: "brand-story", kind: "story", layout: "stacked", width: "full", align: "left", motion: "story-scroll",
        title: "Historia", body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
      }],
    };
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument });

    await expect(new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      siteSections: [{
        id: "brand-story", title: "Historia", body: "", ctaLabel: "", layout: "stacked", width: "full", align: "left", motion: "story-scroll",
        backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: ["/v1/uploads/not-owned.webp"],
        items: [{ title: "Escena", body: "", mediaUrl: "/v1/uploads/not-owned.webp" }],
      }],
    } as any)).rejects.toThrow(BadRequestException);
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("adds a bounded merchant-authored section without changing commerce sections", async () => {
    const prisma = makeFakePrisma();
    const section = (id: string, kind: string) => ({
      id, kind, layout: "split", width: "wide", align: "left", motion: "none",
      title: kind, body: "", ctaLabel: "", backgroundColor: "#f5f2ea", textColor: "#171717", mediaUrls: [], items: [],
    });
    const siteDocument = { version: 1, theme: {}, sections: [section("opening", "hero"), section("shop", "catalog"), section("information", "contact")] };
    prisma.store.findFirst.mockResolvedValue({ ...store, siteDocument });
    prisma.store.update.mockResolvedValue(store);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).update("m_1", "store_1", {
      siteSections: [{
        id: "story-new", kind: "story", title: "Nueva historia", body: "Un relato nuevo", ctaLabel: "",
        layout: "offset", width: "wide", align: "left", motion: "reveal", backgroundColor: "#fffaf2", textColor: "#171717",
        mediaUrls: [], items: [],
      }],
    } as any);

    const saved = prisma.store.update.mock.calls[0][0].data.siteDocument;
    expect(saved.sections.map((entry: any) => entry.kind)).toEqual(["hero", "catalog", "contact", "story"]);
    expect(saved.sections.at(-1)).toEqual(expect.objectContaining({ id: "story-new", title: "Nueva historia", motion: "reveal" }));
  });
});

describe("StoresService.update — board texture", () => {
  it("persists an explicitly selected storefront board texture", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue({ ...store, boardTexture: "kraft" });

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.update("m_1", "store_1", { boardTexture: "kraft" } as any);

    expect(prisma.store.update).toHaveBeenCalledWith({
      where: { id: "store_1" },
      data: { boardTexture: "kraft" },
    });
  });
});

describe("StoresService.update — locations", () => {
  it("rejects branches that cannot fulfill an order", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.update("m_1", "store_1", {
      locations: [{ id: "cerrada", name: "Sucursal", pickupEnabled: false, deliveryEnabled: false, openingHours: [] }],
    } as any)).rejects.toThrow("debe permitir retiro, entrega o ambas opciones");
    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("synchronizes branch stock when locations arrive through the generic update route", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "link_1", stock: 8 }]);
    prisma.paymentLink.update.mockResolvedValue({});
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await service.update("m_1", "store_1", {
      locations: [{ id: "centro", name: "Centro", pickupEnabled: true, deliveryEnabled: false, openingHours: [], inventory: [{ paymentLinkId: "link_1", stock: 8 }] }],
    } as any);

    expect(prisma.paymentLink.update).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { locationStocks: { centro: 8 }, stock: 8 },
    });
  });
});

describe("StoresService.setLinks", () => {
  it("replaces the store's whole link list, preserving array order as sortOrder", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.setLinks("m_1", "store_1", {
      links: [
        { label: "Instagram", url: "https://instagram.com/x" },
        { label: "Catálogo", url: "https://mitienda.bo/catalogo.pdf" },
      ],
    });

    expect(prisma.storeLink.deleteMany).toHaveBeenCalledWith({ where: { storeId: "store_1" } });
    expect(prisma.storeLink.createMany).toHaveBeenCalledWith({
      data: [
        { storeId: "store_1", label: "Instagram", url: "https://instagram.com/x", sortOrder: 0 },
        { storeId: "store_1", label: "Catálogo", url: "https://mitienda.bo/catalogo.pdf", sortOrder: 1 },
      ],
    });
  });

  it("refuses to touch links of a store the merchant doesn't own", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(null);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await expect(service.setLinks("other_merchant", "store_1", { links: [] })).rejects.toThrow(NotFoundException);
    expect(prisma.storeLink.deleteMany).not.toHaveBeenCalled();
  });
});

describe("StoresService.saveSettings", () => {
  it("writes appearance and ordered links inside one transaction", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue({ ...store, name: "Renamed" });
    prisma.storeLink.findMany.mockResolvedValue([{ label: "Instagram", url: "https://instagram.com/x", sortOrder: 0 }]);

    await new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any).saveSettings(
      "m_1",
      "store_1",
      { name: "Renamed", links: [{ label: "Instagram", url: "https://instagram.com/x" }] } as any,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: "store_1" }, data: { name: "Renamed" } });
    expect(prisma.storeLink.createMany).toHaveBeenCalledWith({
      data: [{ storeId: "store_1", label: "Instagram", url: "https://instagram.com/x", sortOrder: 0 }],
    });
  });

  it("persists branch allocations and derives the product's total stock", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue({ ...store, locations: [] });
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "link_1", stock: 20 }]);
    prisma.paymentLink.update.mockResolvedValue({});
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await service.saveSettings("m_1", "store_1", {
      links: [],
      locations: [
        { id: "centro", name: "Centro", pickupEnabled: true, deliveryEnabled: true, openingHours: [], inventory: [{ paymentLinkId: "link_1", stock: 6 }] },
        { id: "sur", name: "Sur", pickupEnabled: true, deliveryEnabled: false, openingHours: [], inventory: [{ paymentLinkId: "link_1", stock: 4 }] },
      ],
    } as any);

    expect(prisma.paymentLink.update).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { locationStocks: { centro: 6, sur: 4 }, stock: 10 },
    });
  });

  it("preserves an explicit unlimited branch allocation", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue({ ...store, locations: [] });
    prisma.paymentLink.findMany.mockResolvedValue([{ id: "link_1", stock: 20 }]);
    prisma.paymentLink.update.mockResolvedValue({});
    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);

    await service.saveSettings("m_1", "store_1", {
      links: [],
      locations: [{ id: "centro", name: "Centro", pickupEnabled: true, deliveryEnabled: true, openingHours: [], inventory: [{ paymentLinkId: "link_1", stock: null }] }],
    } as any);

    expect(prisma.paymentLink.update).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { locationStocks: { centro: null }, stock: null },
    });
  });
});

describe("StoresService.remove", () => {
  it("deletes the store's own branding photos and every product's photos from disk", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({
      id: "store_1",
      merchantId: "m_1",
      logoUrl: "/v1/uploads/logo.png",
      bannerUrl: "/v1/uploads/banner.png",
      backgroundImageUrl: null,
      aboutImageUrl: "/v1/uploads/story.png",
      heroSlides: [{ imageUrl: "/v1/uploads/hero.png" }],
      editorialGallery: [{ imageUrl: "/v1/uploads/workshop.png", caption: "Nuestro taller" }],
    });
    prisma.paymentLink.findMany.mockResolvedValue([
      { imageUrls: ["/v1/uploads/product-a-1.png", "/v1/uploads/product-a-2.png"] },
      { imageUrls: ["/v1/uploads/product-b-1.png"] },
    ]);
    prisma.category.findMany.mockResolvedValue([
      { bannerUrl: "/v1/uploads/category-a.png" },
      { bannerUrl: null },
    ]);
    const uploads = makeFakeUploads();

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, uploads as any);
    const result = await service.remove("m_1", "store_1");

    expect(prisma.store.delete).toHaveBeenCalledWith({ where: { id: "store_1" } });
    expect(uploads.deleteFiles).toHaveBeenCalledWith([
      "/v1/uploads/logo.png",
      "/v1/uploads/banner.png",
      null,
      "/v1/uploads/story.png",
      "/v1/uploads/hero.png",
      "/v1/uploads/workshop.png",
      "/v1/uploads/category-a.png",
      null,
      "/v1/uploads/product-a-1.png",
      "/v1/uploads/product-a-2.png",
      "/v1/uploads/product-b-1.png",
    ]);
    expect(result).toEqual({ success: true });
  });
});
