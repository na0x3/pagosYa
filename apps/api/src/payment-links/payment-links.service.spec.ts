import { BadRequestException } from "@nestjs/common";
import { PaymentLinksService } from "./payment-links.service";

function makeService() {
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
    category: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }) => ({ id: `cat_${data.name.toLowerCase()}`, ...data })),
    },
    paymentLink: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({
        id: "link_1",
        storeId: "store_1",
        stock: 12,
        imageUrls: ["/v1/uploads/first.webp", "/v1/uploads/second.webp"],
        imagePositions: ["25% 30%", "75% 80%"],
        variants: [
          { id: "small", name: "Pequeña", amount: 3500 },
          { id: "large", name: "Grande", amount: 5500 },
        ],
      }),
      update: jest.fn().mockImplementation(({ data }) => ({ id: "link_1", ...data })),
      create: jest.fn().mockImplementation(({ data }) => ({ id: `link_${data.name.toLowerCase()}`, ...data })),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  Object.assign(prisma, {
    $transaction: jest.fn().mockImplementation((callback) => callback(prisma)),
  });
  const uploads = { deleteFiles: jest.fn() };
  const siatCatalogs = { assertProductClassification: jest.fn() };
  return { service: new PaymentLinksService(prisma as any, uploads as any, siatCatalogs as any), prisma, siatCatalogs };
}

describe("PaymentLinksService legacy option stock", () => {
  it("normalizes additive extras and preserves their required flag", async () => {
    const { service, prisma } = makeService();

    await service.create("merchant_1", "store_1", {
      name: "Pizza",
      amount: 8000,
      extras: [
        { name: "Queso", amount: 500, required: true },
        { name: "Caja regalo", amount: 300 },
      ],
    });

    expect(prisma.paymentLink.create.mock.calls[0][0].data.extras).toEqual([
      expect.objectContaining({ id: expect.any(String), name: "Queso", amount: 500, required: true }),
      expect.objectContaining({ id: expect.any(String), name: "Caja regalo", amount: 300, required: false }),
    ]);
  });

  it("accepts zero prices and persists a consistent free-extra allowance", async () => {
    const { service, prisma } = makeService();

    await service.create("merchant_1", "store_1", {
      name: "Menú infantil",
      amount: 0,
      variants: [
        { name: "Promoción", amount: 0 },
        { name: "Regular", amount: 2500 },
      ],
      extras: [
        { name: "Papas", amount: 700, groupName: "Guarniciones", freeAllowance: 2 },
        { name: "Ensalada", amount: 600, groupName: "Guarniciones", freeAllowance: 2 },
      ],
    });

    expect(prisma.paymentLink.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      amount: 0,
      variants: expect.arrayContaining([expect.objectContaining({ name: "Promoción", amount: 0 })]),
      extras: expect.arrayContaining([expect.objectContaining({ name: "Papas", groupName: "Guarniciones", freeAllowance: 2 })]),
    }));
  });

  it("rejects different allowances inside the same extra group", async () => {
    const { service } = makeService();
    await expect(service.create("merchant_1", "store_1", {
      name: "Almuerzo",
      amount: 3000,
      extras: [
        { name: "Papas", amount: 700, groupName: "Guarniciones", freeAllowance: 2 },
        { name: "Arroz", amount: 500, groupName: "Guarniciones", freeAllowance: 1 },
      ],
    })).rejects.toThrow("misma cantidad gratis");
  });

  it("replenishes the same shared extra inventory across other products", async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findMany.mockResolvedValue([{
      id: "burger_2",
      storeId: "store_1",
      extras: [{
        id: "ext_existing", name: "Añadir cottage", amount: 600, required: false,
        inventoryKey: "queso cottage", inventoryName: "Queso cottage", stock: 2,
      }],
    }]);

    await service.create("merchant_1", "store_1", {
      name: "Burger clásica",
      amount: 5000,
      extras: [{ name: "Queso cottage", amount: 500, inventoryName: "Queso cottage", stock: 24 }],
    });

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$executeRaw.mock.calls[0].slice(1)).toEqual([
      "queso cottage",
      "Queso cottage",
      24,
      "store_1",
      "queso cottage",
    ]);
  });

  it("rejects shared stock without a store-wide inventory name", async () => {
    const { service, prisma } = makeService();

    await expect(service.create("merchant_1", "store_1", {
      name: "Burger clásica",
      amount: 5000,
      extras: [{ name: "Queso cottage", amount: 500, stock: 24 }],
    })).rejects.toThrow("necesita un nombre de inventario");
    expect(prisma.paymentLink.create).not.toHaveBeenCalled();
  });

  it("preserves shared stock markers when an old product is edited", async () => {
    const { service, prisma } = makeService();

    await service.update("merchant_1", "store_1", "link_1", {
      variants: [
        { id: "small", name: "Pequeña clásica", amount: 3500 },
        { id: "large", name: "Grande", amount: 5500 },
      ],
    });

    const data = prisma.paymentLink.update.mock.calls[0][0].data;
    expect(data.stock).toBeUndefined();
    expect(data.variants).toEqual([
      { id: "small", name: "Pequeña clásica", amount: 3500 },
      { id: "large", name: "Grande", amount: 5500 },
    ]);
  });

  it("requires every legacy option to be allocated before switching stock modes", async () => {
    const { service } = makeService();

    await expect(
      service.update("merchant_1", "store_1", "link_1", {
        variants: [
          { id: "small", name: "Pequeña", amount: 3500, stock: 6 },
          { id: "large", name: "Grande", amount: 5500 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("inherits finite option allocations when an API edit omits unchanged stock", async () => {
    const { service, prisma } = makeService();
    prisma.paymentLink.findFirst.mockResolvedValue({
      id: "link_1",
      storeId: "store_1",
      stock: 10,
      variants: [
        { id: "small", name: "Pequeña", amount: 3500, stock: 7 },
        { id: "large", name: "Grande", amount: 5500, stock: 3 },
      ],
    });

    await service.update("merchant_1", "store_1", "link_1", {
      variants: [
        { id: "small", name: "Pequeña clásica", amount: 3500 },
        { id: "large", name: "Grande clásica", amount: 5500 },
      ],
    });

    const data = prisma.paymentLink.update.mock.calls[0][0].data;
    expect(data.stock).toBe(10);
    expect(data.variants).toEqual([
      { id: "small", name: "Pequeña clásica", amount: 3500, stock: 7 },
      { id: "large", name: "Grande clásica", amount: 5500, stock: 3 },
    ]);
  });
});

describe("PaymentLinksService SIAT classification", () => {
  it("keeps merchant codigoProducto separate and validates the synchronized SIN mapping", async () => {
    const { service, prisma, siatCatalogs } = makeService();

    await service.create("merchant_1", "store_1", {
      name: "Nike Air Max 90",
      amount: 85000,
      codigoProducto: "NIKE-AM90",
      actividadEconomica: "477210",
      codigoProductoSin: "123456",
      unidadMedida: 58,
    });

    expect(siatCatalogs.assertProductClassification).toHaveBeenCalledWith("merchant_1", {
      actividadEconomica: "477210",
      codigoProductoSin: "123456",
      unidadMedida: 58,
    });
    expect(prisma.paymentLink.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      codigoProducto: "NIKE-AM90",
      codigoProductoSin: "123456",
    }));
  });

  it("rejects incomplete fiscal mappings before persistence", async () => {
    const { service, prisma } = makeService();

    await expect(service.create("merchant_1", "store_1", {
      name: "Incomplete",
      amount: 1000,
      codigoProducto: "SKU-1",
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.paymentLink.create).not.toHaveBeenCalled();
  });
});

describe("PaymentLinksService inventory import", () => {
  it("creates missing categories once and imports priced size variants atomically", async () => {
    const { service, prisma } = makeService();
    prisma.category.findMany.mockResolvedValue([{ id: "cat_food", name: "Comida", sortOrder: 0 }]);

    const result = await service.importInventory("merchant_1", "store_1", {
      products: [
        { name: "Silpancho", amount: 4500, categoryName: "comida", stock: 5 },
        {
          name: "Mocochinchi",
          amount: 1200,
          categoryName: "Bebidas",
          imageUrls: ["/v1/uploads/00000000-0000-4000-8000-000000000000.webp"],
          imagePositions: ["50% 24%"],
          variants: [
            { name: "Vaso", amount: 1200, stock: 8 },
            { name: "Jarra", amount: 3000, stock: 3 },
          ],
        },
      ],
    });

    expect(prisma.category.create).toHaveBeenCalledTimes(1);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { storeId: "store_1", name: "Bebidas", sortOrder: 1 },
    });
    expect(prisma.paymentLink.create).toHaveBeenCalledTimes(2);
    const drinkData = prisma.paymentLink.create.mock.calls[1][0].data;
    expect(drinkData.categoryId).toBe("cat_bebidas");
    expect(drinkData.amount).toBe(1200);
    expect(drinkData.stock).toBe(11);
    expect(drinkData.imageUrls).toEqual(["/v1/uploads/00000000-0000-4000-8000-000000000000.webp"]);
    expect(drinkData.imagePositions).toEqual(["50% 24%"]);
    expect(drinkData.variants).toEqual([
      expect.objectContaining({ name: "Vaso", amount: 1200, stock: 8 }),
      expect.objectContaining({ name: "Jarra", amount: 3000, stock: 3 }),
    ]);
    expect(result.products).toHaveLength(2);
    expect(result.categoriesCreated).toHaveLength(1);
  });
});

describe("PaymentLinksService product image framing", () => {
  it("realigns focus points when an API edit replaces the gallery without sending positions", async () => {
    const { service, prisma } = makeService();

    await service.update("merchant_1", "store_1", "link_1", {
      imageUrls: ["/v1/uploads/replacement.webp"],
    });

    expect(prisma.paymentLink.update.mock.calls[0][0].data).toEqual(expect.objectContaining({
      imageUrls: ["/v1/uploads/replacement.webp"],
      imagePositions: ["25% 30%"],
    }));
  });

  it("pads missing focus points and drops entries beyond the gallery length", async () => {
    const { service, prisma } = makeService();

    await service.update("merchant_1", "store_1", "link_1", {
      imagePositions: ["10% 20%"],
    });

    expect(prisma.paymentLink.update.mock.calls[0][0].data.imagePositions).toEqual(["10% 20%", "50% 50%"]);
  });
});
