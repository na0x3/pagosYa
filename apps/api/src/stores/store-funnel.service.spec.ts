import { StoreFunnelService } from './store-funnel.service';
describe('consented storefront funnel', () => {
  const mock = () => ({ store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, storeFunnelVisit: { upsert: jest.fn().mockResolvedValue({ id: 'v1', token: 't'.repeat(32), createdAt: new Date() }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(3) } });
  it('scopes and hashes sessions, and records only the first occurrence on retries', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    await service.record('shop', 'anonymous-session', 'delivery_selected', 'pickup');
    await service.record('shop', 'anonymous-session', 'delivery_selected', 'delivery');
    expect(prisma.storeFunnelVisit.upsert.mock.calls[0][0]).toMatchObject({ where: { storeId_sessionHash: { storeId: 's1', sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }, update: {} });
    expect(prisma.storeFunnelVisit.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', deliverySelectedAt: null }, data: { deliverySelectedAt: expect.any(Date), fulfillmentMethod: 'pickup' } });
  });
  it('rejects unpublished stores and client payment-success events', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    await expect(service.record('shop', 's', 'payment_completed' as any)).rejects.toThrow('Evento no válido');
    await expect(service.record('shop', 's', 'delivery_selected')).rejects.toThrow('Evento no válido');
    prisma.store.findFirst.mockResolvedValue(null as any);
    await expect(service.record('shop', 's', 'visit')).rejects.toThrow('Tienda no publicada');
    expect(prisma.storeFunnelVisit.upsert).not.toHaveBeenCalled();
  });
  it('derives completed payment sessions from trusted live succeeded orders', async () => {
    const prisma = mock(); const since = new Date('2026-09-01');
    const summary = await new StoreFunnelService(prisma as any).summary('s1', since);
    expect(summary.paymentCompletions).toBe(3);
    expect(prisma.storeFunnelVisit.count).toHaveBeenCalledWith({ where: { storeId: 's1', createdAt: { gte: since }, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } });
  });
});
