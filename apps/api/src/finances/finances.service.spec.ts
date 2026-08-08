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
      { metadata: { cart: [{ paymentLinkId: "link_a", name: "Corte", quantity: 2, unitAmount: 5000 }] } },
      {
        metadata: {
          cart: [
            { paymentLinkId: "link_a", name: "Corte", quantity: 1, unitAmount: 5000 },
            { paymentLinkId: "link_b", name: "Tinte", quantity: 5, unitAmount: 9000 },
          ],
        },
      },
      { metadata: null }, // direct API-created intent, no cart — must not throw or count
    ]);

    const service = new FinancesService(prisma as any);
    const result = await service.summary("m_1");

    expect(result.totalRevenue).toBe(50000);
    expect(result.inventoryValue).toBe(36000);
    expect(result.totalStoreViews).toBe(42);
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
      topProducts: [],
      currency: "BOB",
    });
  });
});
