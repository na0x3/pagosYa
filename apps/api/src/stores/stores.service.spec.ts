import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MerchantStatus, StoreStatus } from "@prisma/client";
import { StoresService } from "./stores.service";

function makeFakePrisma() {
  const prisma = {
    store: { findUnique: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), update: jest.fn() },
    merchant: { findUniqueOrThrow: jest.fn() },
    paymentLink: { findMany: jest.fn() },
    storeLead: { create: jest.fn().mockResolvedValue({ id: "lead_1" }) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeLink: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    storeProductStat: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  // Batch transactions resolve their prepared operations; interactive ones
  // receive the same delegate mocks as the root client.
  prisma.$transaction.mockImplementation((ops: Promise<unknown>[] | ((tx: any) => unknown)) =>
    typeof ops === "function" ? ops(prisma) : Promise.all(ops));
  return prisma;
}

function makeFakePaymentIntents() {
  return { create: jest.fn().mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret_x" }) };
}

function makeFakeUploads() {
  return { deleteFiles: jest.fn().mockResolvedValue(undefined) };
}

const store = { id: "store_1", merchantId: "m_1", slug: "abc123", status: StoreStatus.ACTIVE };
const merchant = { id: "m_1", status: MerchantStatus.ACTIVE };

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

  it("returns validated editorial card colors and drops unsafe legacy values", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      editorialGallery: [
        { imageUrl: "/v1/uploads/workshop.png", caption: "Nuestro taller", boxColor: "#f4ead7" },
        { imageUrl: "/v1/uploads/team.png", caption: "El equipo", boxColor: "not-a-color" },
      ],
    });
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    const result = await service.getStorePublic("abc123", { trackView: false });

    expect(result.editorialGallery).toEqual([
      { imageUrl: "/v1/uploads/workshop.png", caption: "Nuestro taller", boxColor: "#f4ead7" },
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
      "/v1/uploads/product-a-1.png",
      "/v1/uploads/product-a-2.png",
      "/v1/uploads/product-b-1.png",
    ]);
    expect(result).toEqual({ success: true });
  });
});
