import { BadRequestException, NotFoundException } from "@nestjs/common";
import { MerchantStatus, StoreStatus } from "@prisma/client";
import { StoresService } from "./stores.service";

function makeFakePrisma() {
  return {
    store: { findUnique: jest.fn(), findFirst: jest.fn(), delete: jest.fn(), update: jest.fn() },
    merchant: { findUniqueOrThrow: jest.fn() },
    paymentLink: { findMany: jest.fn() },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeLink: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    paymentIntent: { findMany: jest.fn().mockResolvedValue([]) },
    // The service builds the queries and hands them to $transaction — resolving
    // them is enough here, the batch itself is Postgres's job.
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}

function makeFakePaymentIntents() {
  return { create: jest.fn().mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret_x" }) };
}

function makeFakeUploads() {
  return { deleteFiles: jest.fn().mockResolvedValue(undefined) };
}

const store = { id: "store_1", merchantId: "m_1", slug: "abc123", status: StoreStatus.ACTIVE };
const merchant = { id: "m_1", status: MerchantStatus.ACTIVE };

describe("StoresService.createCartCheckout — stock enforcement", () => {
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
  it("does not inflate store views when the merchant loads an editor preview", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([]);

    const service = new StoresService(prisma as any, makeFakePaymentIntents() as any, makeFakeUploads() as any);
    await service.getStorePublic("abc123", { trackView: false });

    expect(prisma.store.update).not.toHaveBeenCalled();
  });

  it("attaches per-product units sold from this store's succeeded cart checkouts", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findUnique.mockResolvedValue(store);
    prisma.store.update.mockResolvedValue(store);
    prisma.paymentLink.findMany.mockResolvedValue([
      { id: "link_1", name: "Corte", imageUrls: [], tags: [], stock: null, color: null, amount: 5000, currency: "BOB", categoryId: null, description: null },
      { id: "link_2", name: "Tinte", imageUrls: [], tags: [], stock: null, color: null, amount: 8000, currency: "BOB", categoryId: null, description: null },
    ]);
    prisma.paymentIntent.findMany.mockResolvedValue([
      { metadata: { storeId: "store_1", cart: [{ paymentLinkId: "link_1", quantity: 2 }] } },
      { metadata: { storeId: "store_1", cart: [{ paymentLinkId: "link_1", quantity: 3 }, { paymentLinkId: "link_2", quantity: 1 }] } },
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
