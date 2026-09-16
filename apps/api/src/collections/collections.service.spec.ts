import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CollectionsService } from "./collections.service";

function makeService() {
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
    collection: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "col_new", ...data })),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
      delete: jest.fn(),
    },
    collectionProduct: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    paymentLink: { count: jest.fn() },
    $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
  };
  return { service: new CollectionsService(prisma as any), prisma };
}

describe("CollectionsService.create", () => {
  it("slugifies the name and defaults sortOrder to the end of the list", async () => {
    const { service, prisma } = makeService();
    prisma.collection.count.mockResolvedValue(2);
    prisma.collection.findMany.mockResolvedValue([{ slug: "verano" }]);

    await service.create("merchant_1", "store_1", { name: "Más vendidos" } as any);

    expect(prisma.collection.create).toHaveBeenCalledWith({
      data: { storeId: "store_1", name: "Más vendidos", slug: "mas-vendidos", sortOrder: 2 },
    });
  });

  it("rejects a 13th collection", async () => {
    const { service, prisma } = makeService();
    prisma.collection.count.mockResolvedValue(12);

    await expect(service.create("merchant_1", "store_1", { name: "Otoño" } as any)).rejects.toThrow(
      "Puedes tener hasta 12 colecciones",
    );
    expect(prisma.collection.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundException for a store the merchant does not own", async () => {
    const { service, prisma } = makeService();
    prisma.store.findFirst.mockResolvedValue(null);

    await expect(service.create("merchant_1", "store_1", { name: "Verano" } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.collection.create).not.toHaveBeenCalled();
  });
});

describe("CollectionsService.update", () => {
  it("changes the name but leaves the slug untouched", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue({ id: "col_1", storeId: "store_1", name: "Verano", slug: "verano" });

    await service.update("merchant_1", "store_1", "col_1", { name: "Rebajas de verano" } as any);

    expect(prisma.collection.update).toHaveBeenCalledWith({
      where: { id: "col_1" },
      data: { name: "Rebajas de verano" },
    });
  });

  it("throws NotFoundException for a collection outside the store", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue(null);

    await expect(
      service.update("merchant_1", "store_1", "col_1", { name: "Rebajas" } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("CollectionsService.setProducts", () => {
  it("replaces membership and stores sortOrder by array position", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue({ id: "col_1", storeId: "store_1" });
    prisma.paymentLink.count.mockResolvedValue(3);

    await service.setProducts("merchant_1", "store_1", "col_1", ["p1", "p2", "p3"]);

    expect(prisma.paymentLink.count).toHaveBeenCalledWith({
      where: { storeId: "store_1", id: { in: ["p1", "p2", "p3"] } },
    });
    expect(prisma.collectionProduct.deleteMany).toHaveBeenCalledWith({ where: { collectionId: "col_1" } });
    expect(prisma.collectionProduct.createMany).toHaveBeenCalledWith({
      data: [
        { collectionId: "col_1", paymentLinkId: "p1", sortOrder: 0 },
        { collectionId: "col_1", paymentLinkId: "p2", sortOrder: 1 },
        { collectionId: "col_1", paymentLinkId: "p3", sortOrder: 2 },
      ],
    });
  });

  it("rejects ids that are not PaymentLink rows of that store", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue({ id: "col_1", storeId: "store_1" });
    prisma.paymentLink.count.mockResolvedValue(1);

    await expect(service.setProducts("merchant_1", "store_1", "col_1", ["p1", "p2"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.collectionProduct.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects 201 products", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue({ id: "col_1", storeId: "store_1" });

    const ids = Array.from({ length: 201 }, (_, i) => `p${i}`);
    await expect(service.setProducts("merchant_1", "store_1", "col_1", ids)).rejects.toThrow(
      "Una colección puede tener hasta 200 productos",
    );
    expect(prisma.paymentLink.count).not.toHaveBeenCalled();
  });
});

describe("CollectionsService.reorder", () => {
  it("persists the complete collection order", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findMany
      .mockResolvedValueOnce([{ id: "summer" }, { id: "winter" }])
      .mockResolvedValueOnce([
        { id: "summer", name: "Verano", sortOrder: 0 },
        { id: "winter", name: "Invierno", sortOrder: 1 },
      ]);

    const result = await service.reorder("merchant_1", "store_1", ["summer", "winter"]);

    expect(prisma.collection.update.mock.calls.map(([call]) => call)).toEqual([
      { where: { id: "summer" }, data: { sortOrder: 0 } },
      { where: { id: "winter" }, data: { sortOrder: 1 } },
    ]);
    expect(result[0].name).toBe("Verano");
  });

  it("rejects partial or foreign collection lists", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findMany.mockResolvedValueOnce([{ id: "summer" }, { id: "winter" }]);

    await expect(service.reorder("merchant_1", "store_1", ["summer", "other"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a duplicated id standing in for an omitted one", async () => {
    const { service, prisma } = makeService();
    // Store has {summer, winter}; payload repeats "summer" instead of naming
    // "winter" — same length and every id is technically valid, so a naive
    // length+membership check would let this through and leave "winter" with
    // a stale sortOrder.
    prisma.collection.findMany.mockResolvedValueOnce([{ id: "summer" }, { id: "winter" }]);

    await expect(service.reorder("merchant_1", "store_1", ["summer", "summer"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("CollectionsService.remove", () => {
  it("deletes the collection and leaves the products themselves alone", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue({ id: "col_1", storeId: "store_1" });

    const result = await service.remove("merchant_1", "store_1", "col_1");

    expect(prisma.collection.delete).toHaveBeenCalledWith({ where: { id: "col_1" } });
    expect(prisma.collectionProduct.deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("throws NotFoundException for a collection outside the store", async () => {
    const { service, prisma } = makeService();
    prisma.collection.findFirst.mockResolvedValue(null);

    await expect(service.remove("merchant_1", "store_1", "col_1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
