import { BadRequestException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";

function makeService() {
  const prisma = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: "store_1" }) },
    category: {
      findMany: jest.fn(),
      update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id, ...data })),
    },
    $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
  };
  return { service: new CategoriesService(prisma as any), prisma };
}

describe("CategoriesService.reorder", () => {
  it("persists the complete storefront category order", async () => {
    const { service, prisma } = makeService();
    prisma.category.findMany
      .mockResolvedValueOnce([{ id: "food" }, { id: "drinks" }, { id: "dessert" }])
      .mockResolvedValueOnce([
        { id: "food", name: "Comida", sortOrder: 0 },
        { id: "drinks", name: "Bebidas", sortOrder: 1 },
        { id: "dessert", name: "Postres", sortOrder: 2 },
      ]);

    const result = await service.reorder("merchant_1", "store_1", ["food", "drinks", "dessert"]);

    expect(prisma.category.update.mock.calls.map(([call]) => call)).toEqual([
      { where: { id: "food" }, data: { sortOrder: 0 } },
      { where: { id: "drinks" }, data: { sortOrder: 1 } },
      { where: { id: "dessert" }, data: { sortOrder: 2 } },
    ]);
    expect(result[0].name).toBe("Comida");
  });

  it("rejects partial or foreign category lists", async () => {
    const { service, prisma } = makeService();
    prisma.category.findMany.mockResolvedValueOnce([{ id: "food" }, { id: "drinks" }]);

    await expect(service.reorder("merchant_1", "store_1", ["food", "other"])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
