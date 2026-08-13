import { FinancesService } from "./finances.service";

function makeFakePrisma() {
  return {
    paymentIntent: { aggregate: jest.fn(), groupBy: jest.fn() },
    paymentLink: { findMany: jest.fn() },
    store: { aggregate: jest.fn(), findFirst: jest.fn() },
    storeProductStat: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ amount: 0n, count: 0n }]),
  };
}

describe("FinancesService.summary", () => {
  it("sums revenue, inventory value, and store views, and ranks products by quantity sold", async () => {
    const prisma = makeFakePrisma();
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: 50000 }, _count: { _all: 3 } });
    prisma.paymentLink.findMany.mockResolvedValue([
      { amount: 9000, stock: 3 }, // 27000
      { amount: 4500, stock: 2 }, // 9000
    ]);
    prisma.store.aggregate.mockResolvedValue({ _sum: { viewCount: 42 } });
    prisma.paymentIntent.groupBy.mockResolvedValue([
      { paymentMethodType: "QR", _sum: { amount: 10000 }, _count: { _all: 1 } },
      { paymentMethodType: "CARD", _sum: { amount: 45000 }, _count: { _all: 1 } },
      { paymentMethodType: null, _sum: { amount: 5000 }, _count: { _all: 1 } },
    ]);
    prisma.storeProductStat.findMany.mockResolvedValue([
      { paymentLinkId: "link_b", productName: "Tinte", quantity: 5, revenue: 45000 },
      { paymentLinkId: "link_a", productName: "Corte", quantity: 3, revenue: 15000 },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ amount: 5000n, count: 1n }]);

    const service = new FinancesService(prisma as any);
    const result = await service.summary("m_1");

    expect(result.totalRevenue).toBe(50000);
    expect(result.paymentCount).toBe(3);
    expect(result.unattributedRevenue).toBe(5000);
    expect(result.unattributedPaymentCount).toBe(1);
    expect(result.inventoryValue).toBe(36000);
    expect(result.totalStoreViews).toBe(42);
    expect(result.revenueByPaymentMethod).toEqual([
      { paymentMethodType: "CARD", amount: 45000, paymentCount: 1 },
      { paymentMethodType: "QR", amount: 10000, paymentCount: 1 },
      { paymentMethodType: "UNSPECIFIED", amount: 5000, paymentCount: 1 },
    ]);
    expect(result.topProducts).toEqual([
      { paymentLinkId: "link_b", name: "Tinte", quantity: 5, revenue: 45000 },
      { paymentLinkId: "link_a", name: "Corte", quantity: 3, revenue: 15000 },
    ]);
  });

  it("returns zeroed-out values instead of throwing when a merchant has no activity yet", async () => {
    const prisma = makeFakePrisma();
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    prisma.paymentLink.findMany.mockResolvedValue([]);
    prisma.store.aggregate.mockResolvedValue({ _sum: { viewCount: null } });
    prisma.paymentIntent.groupBy.mockResolvedValue([]);

    const service = new FinancesService(prisma as any);
    const result = await service.summary("m_new");

    expect(result).toEqual({
      totalRevenue: 0,
      paymentCount: 0,
      unattributedRevenue: 0,
      unattributedPaymentCount: 0,
      inventoryValue: 0,
      totalStoreViews: 0,
      revenueByPaymentMethod: [],
      topProducts: [],
      scope: { type: "MERCHANT" },
      currency: "BOB",
    });
  });

  it("scopes revenue, inventory, views, and products to an owned store", async () => {
    const prisma = makeFakePrisma();
    prisma.store.findFirst.mockResolvedValue({ id: "store_1", name: "Tienda Centro", viewCount: 12 });
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: 18000 }, _count: { _all: 1 } });
    prisma.paymentLink.findMany.mockResolvedValue([{ amount: 4000, stock: 2, variants: [] }]);
    prisma.paymentIntent.groupBy.mockResolvedValue([
      { paymentMethodType: "QR", _sum: { amount: 18000 }, _count: { _all: 1 } },
    ]);
    prisma.storeProductStat.findMany.mockResolvedValue([
      { paymentLinkId: "link_1", productName: "Producto", quantity: 2, revenue: 18000 },
    ]);

    const result = await new FinancesService(prisma as any).summary("m_1", "store_1");

    expect(prisma.paymentIntent.aggregate).toHaveBeenCalledWith({
      where: {
        merchantId: "m_1",
        status: "SUCCEEDED",
        metadata: { path: ["storeId"], equals: "store_1" },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    expect(prisma.paymentLink.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { store: { merchantId: "m_1" }, storeId: "store_1", status: "ACTIVE" },
    }));
    expect(result).toMatchObject({
      totalRevenue: 18000,
      paymentCount: 1,
      unattributedRevenue: 0,
      inventoryValue: 8000,
      totalStoreViews: 12,
      scope: { type: "STORE", storeId: "store_1", storeName: "Tienda Centro" },
    });
  });

  it("values finite option inventory at each option price", async () => {
    const prisma = makeFakePrisma();
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    prisma.paymentLink.findMany.mockResolvedValue([
      {
        amount: 3500,
        stock: 10,
        variants: [
          { id: "small", name: "Pequeña", amount: 3500, stock: 7 },
          { id: "large", name: "Grande", amount: 5500, stock: 3 },
        ],
      },
      {
        amount: 2000,
        stock: null,
        variants: [
          { id: "finite", name: "Caja", amount: 2000, stock: 2 },
          { id: "unlimited", name: "Digital", amount: 3000, stock: null },
        ],
      },
    ]);
    prisma.store.aggregate.mockResolvedValue({ _sum: { viewCount: 0 } });
    prisma.paymentIntent.groupBy.mockResolvedValue([]);

    const result = await new FinancesService(prisma as any).summary("m_1");

    expect(result.inventoryValue).toBe(45000); // 7×35 + 3×55 + 2×20 BOB
  });
});
