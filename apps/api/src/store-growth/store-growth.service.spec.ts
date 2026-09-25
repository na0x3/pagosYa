import { buildAnalyticsReport } from '../store-analytics/store-analytics-report';
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
    const service = new StoreGrowthService(prisma as any, {} as any);
    await expect(service.inbox('other', 's1')).rejects.toThrow('Tienda no encontrada');
    await expect(service.insights('other', 's1')).rejects.toThrow('Tienda no encontrada');
    expect(prisma.storeLead.findMany).not.toHaveBeenCalled(); expect(prisma.storeOrder.findMany).not.toHaveBeenCalled();
  });

  describe('overview (G2)', () => {
    const store = { id: 's1', name: 'Casa Luz', checkoutMode: 'payment', status: 'ACTIVE', sourcePublicationPaused: false, publicVisibility: true, publishedSourceRevision: 3, websitePublishedRevision: 0, policies: { returns: 'Cambios en 7 días', delivery: 'Envíos en La Paz' }, merchant: { status: 'ACTIVE' } };
    const emptyReport = (from: string, to: string) => buildAnalyticsReport([], new Map(), from, to, 'payment', { productLimit: 500 });
    function setup(patch: { store?: unknown; states?: unknown[]; products?: unknown[] } = {}) {
      const prisma = {
        store: { findFirst: jest.fn().mockResolvedValue(patch.store === undefined ? store : patch.store) },
        storeOrder: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        paymentLink: { findMany: jest.fn().mockResolvedValue(patch.products || [{ id: 'p1', name: 'Lámpara', description: 'Lámpara', amount: 10000, currency: 'BOB', stock: null, imageUrls: [], createdAt: new Date('2026-01-01T00:00:00Z') }]) },
        storeLead: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null) },
        storeGrowthInsightState: { findMany: jest.fn().mockResolvedValue(patch.states || []), upsert: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
        $queryRaw: jest.fn().mockResolvedValue([{ device: 'mobile', sessions: 3, addSessions: 1 }]),
      };
      const analytics = { report: jest.fn((_m: string, _s: string, q: { from: string; to: string }) => Promise.resolve(emptyReport(q.from, q.to))) };
      return { prisma, analytics, service: new StoreGrowthService(prisma as any, analytics as any) };
    }
    const now = new Date('2026-09-25T16:00:00Z');

    it('refuses a foreign store before reading anything', async () => {
      const { prisma, analytics, service } = setup({ store: null });
      await expect(service.overview('other', 's1', 30, now)).rejects.toThrow('Tienda no encontrada');
      expect(analytics.report).not.toHaveBeenCalled();
      expect(prisma.storeOrder.findMany).not.toHaveBeenCalled();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      await expect(service.setInsightState('other', 's1', 'weak-photos', 'dismiss', now)).rejects.toThrow('Tienda no encontrada');
      await expect(service.restoreInsights('other', 's1')).rejects.toThrow('Tienda no encontrada');
      expect(prisma.storeGrowthInsightState.upsert).not.toHaveBeenCalled();
      expect(prisma.storeGrowthInsightState.deleteMany).not.toHaveBeenCalled();
    });

    it('reads both periods with every product and the orders of both, and answers the whole view', async () => {
      const { prisma, analytics, service } = setup();
      const result = await service.overview('m1', 's1', 7, now);
      expect(analytics.report).toHaveBeenCalledWith('m1', 's1', { from: '2026-09-19', to: '2026-09-25' }, { productLimit: 500 });
      expect(analytics.report).toHaveBeenCalledWith('m1', 's1', { from: '2026-09-12', to: '2026-09-18' }, { productLimit: 500 });
      expect(prisma.storeOrder.findMany.mock.calls[0][0].where).toMatchObject({ merchantId: 'm1', storeId: 's1', createdAt: { gte: new Date('2026-09-12T04:00:00Z'), lt: new Date('2026-09-26T04:00:00Z') }, paymentIntent: { livemode: true } });
      expect(result).toMatchObject({ period: { days: 7, from: '2026-09-19', to: '2026-09-25' }, checkoutMode: 'payment', hasData: false, store: { name: 'Casa Luz', published: true } });
      expect(result.kpis.map((k: { id: string }) => k.id)).toEqual(['visits', 'productViews', 'addToCart', 'checkouts', 'outcome', 'conversion']);
      // A product without a photo and a description equal to its name → Store Brain insights, and no sale yet.
      expect(result.insights.map((i: { id: string }) => i.id)).toEqual(expect.arrayContaining(['weak-photos', 'first-sale']));
      expect(result.devices[0]).toMatchObject({ device: 'mobile', sessions: 3 });
      expect(result).not.toHaveProperty('unitsSold');
    });

    it('hides dismissed and snoozed insights and says how many', async () => {
      const { service } = setup({ states: [{ insightId: 'weak-photos', status: 'dismissed', until: null }] });
      const result = await service.overview('m1', 's1', 30, now);
      expect(result.insights.map((i: { id: string }) => i.id)).not.toContain('weak-photos');
      expect(result.hiddenInsights).toBe(1);
    });

    it('dismisses for good, snoozes for 7 days and restores', async () => {
      const { prisma, service } = setup();
      await service.setInsightState('m1', 's1', 'weak-photos', 'dismiss', now);
      expect(prisma.storeGrowthInsightState.upsert).toHaveBeenLastCalledWith({ where: { storeId_insightId: { storeId: 's1', insightId: 'weak-photos' } }, create: { storeId: 's1', insightId: 'weak-photos', status: 'dismissed', until: null }, update: { status: 'dismissed', until: null } });
      await service.setInsightState('m1', 's1', 'low-stock:p1', 'snooze', now);
      expect(prisma.storeGrowthInsightState.upsert.mock.calls[1][0].update).toEqual({ status: 'snoozed', until: new Date('2026-10-02T16:00:00Z') });
      await service.setInsightState('m1', 's1', 'low-stock:p1', 'restore', now);
      expect(prisma.storeGrowthInsightState.deleteMany).toHaveBeenLastCalledWith({ where: { storeId: 's1', insightId: 'low-stock:p1' } });
      await expect(service.restoreInsights('m1', 's1')).resolves.toEqual({ restored: 2 });
      expect(prisma.storeGrowthInsightState.deleteMany).toHaveBeenLastCalledWith({ where: { storeId: 's1' } });
    });
  });
});
