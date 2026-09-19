import { StoreGrowthService, summarizeGrowth, type GrowthOrder } from './store-growth.service';
const order = (patch: Partial<GrowthOrder> = {}): GrowthOrder => ({ amount: 10000, currency: 'BOB', partnerId: 'partner', partnerCommissionBps: 1000, items: [{ paymentLinkId: 'p1', name: 'Café' }], paymentIntent: { status: 'SUCCEEDED', transactions: [] }, ...patch });
describe('Store growth accounting', () => {
  it('counts only paid orders and subtracts refunds before calculating the snapshotted commission', () => {
    const result = summarizeGrowth([
      order(), order({ paymentIntent: { status: 'SUCCEEDED', transactions: [{ amount: 2500 }] } }),
      order({ paymentIntent: { status: 'SUCCEEDED', transactions: [{ amount: 10000 }] } }),
      order({ paymentIntent: { status: 'PROCESSING', transactions: [] } }),
      order({ paymentIntent: { status: 'FAILED', transactions: [] } }),
    ]);
    expect(result.partnerSales).toEqual([{ partnerId: 'partner', currency: 'BOB', paidOrders: 3, netSales: 17500, commission: 1750 }]);
    expect(result.topProducts).toEqual([{ id: 'p1', name: 'Café', orders: 2 }]);
  });
  it('never mixes currencies or rates and clamps over-refunds to zero', () => {
    const result = summarizeGrowth([order(), order({ currency: 'USD', partnerCommissionBps: 500 }), order({ partnerCommissionBps: 2000 }), order({ paymentIntent: { status: 'SUCCEEDED', transactions: [{ amount: 11000 }] } })]);
    expect(result.partnerSales.map(row => [row.currency, row.netSales, row.commission])).toEqual([['BOB', 20000, 3000], ['USD', 10000, 500]]);
  });
  it('checks ownership before reading customer messages or sales', async () => {
    const prisma = { store: { findFirst: jest.fn().mockResolvedValue(null) }, storeLead: { findMany: jest.fn() }, storeOrder: { findMany: jest.fn() } };
    const service = new StoreGrowthService(prisma as any);
    await expect(service.inbox('other', 's1')).rejects.toThrow('Tienda no encontrada');
    await expect(service.insights('other', 's1')).rejects.toThrow('Tienda no encontrada');
    expect(prisma.storeLead.findMany).not.toHaveBeenCalled(); expect(prisma.storeOrder.findMany).not.toHaveBeenCalled();
  });
});
