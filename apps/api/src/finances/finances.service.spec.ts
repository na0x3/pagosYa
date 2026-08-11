import { FinancesService } from "./finances.service";

function makeFakePrisma() {
  return {
    paymentIntent: { aggregate: jest.fn(), findMany: jest.fn() },
    paymentLink: { findMany: jest.fn() },
    store: { aggregate: jest.fn() },
  };
}

describe("FinancesService.summary", () => {
  it("sums revenue, inventory value, and store views, and ranks products by quantity sold", async () => {
    const prisma = makeFakePrisma();
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: 50000 } });
    prisma.paymentLink.findMany.mockResolvedValue([
      { amount: 9000, stock: 3 }, // 27000
      { amount: 4500, stock: 2 }, // 9000
    ]);
    prisma.store.aggregate.mockResolvedValue({ _sum: { viewCount: 42 } });
    prisma.paymentIntent.findMany.mockResolvedValue([
      { amount: 10000, paymentMethodType: "QR", metadata: { cart: [{ paymentLinkId: "link_a", name: "Corte", quantity: 2, unitAmount: 5000 }] } },
      {
        amount: 45000,
        paymentMethodType: "CARD",
        metadata: {
          cart: [
            { paymentLinkId: "link_a", name: "Corte", quantity: 1, unitAmount: 5000 },
            { paymentLinkId: "link_b", name: "Tinte", quantity: 5, unitAmount: 9000 },
          ],
        },
      },
      { amount: 5000, paymentMethodType: null, metadata: null }, // direct API-created intent, no cart — counts in chart, not products
    ]);

    const service = new FinancesService(prisma as any);
    const result = await service.summary("m_1");

    expect(result.totalRevenue).toBe(50000);
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
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: null } });
    prisma.paymentLink.findMany.mockResolvedValue([]);
    prisma.store.aggregate.mockResolvedValue({ _sum: { viewCount: null } });
    prisma.paymentIntent.findMany.mockResolvedValue([]);

    const service = new FinancesService(prisma as any);
    const result = await service.summary("m_new");

    expect(result).toEqual({
      totalRevenue: 0,
      inventoryValue: 0,
      totalStoreViews: 0,
      revenueByPaymentMethod: [],
      topProducts: [],
      currency: "BOB",
    });
  });

  it("values finite option inventory at each option price", async () => {
    const prisma = makeFakePrisma();
    prisma.paymentIntent.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
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
    prisma.paymentIntent.findMany.mockResolvedValue([]);

    const result = await new FinancesService(prisma as any).summary("m_1");

    expect(result.inventoryValue).toBe(45000); // 7×35 + 3×55 + 2×20 BOB
  });
});
