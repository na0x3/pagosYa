import { StoreFunnelService } from './store-funnel.service';
describe('consented storefront funnel', () => {
  const steps = { visitors: 10, productViews: 6, cartAdds: 4, checkoutStarts: 2, deliverySelections: 1, matureCartAdds: 3, cartWithoutCheckout: 2, cartWithoutPay: 1 };
  const mock = () => ({ store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, storeFunnelVisit: { upsert: jest.fn().mockResolvedValue({ id: 'v1', token: 't'.repeat(32), createdAt: new Date() }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), count: jest.fn().mockResolvedValue(3) }, $queryRaw: jest.fn().mockResolvedValue([steps]) });
  it('scopes and hashes the visit session and hands back its order-link token', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    await expect(service.record('shop', 'anonymous-session', 'visit')).resolves.toEqual({ token: 't'.repeat(32) });
    expect(prisma.storeFunnelVisit.upsert.mock.calls[0][0]).toMatchObject({ where: { storeId_sessionHash: { storeId: 's1', sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/) } }, update: {} });
  });
  it('accepts the step events older stores still post and writes nothing for them', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    for (const event of ['product_view', 'add_to_cart', 'checkout_started'] as const) await expect(service.record('shop', 's', event)).resolves.toEqual({});
    await expect(service.record('shop', 's', 'delivery_selected', 'pickup')).resolves.toEqual({});
    expect(prisma.store.findFirst).not.toHaveBeenCalled();
    expect(prisma.storeFunnelVisit.upsert).not.toHaveBeenCalled();
    expect(prisma.storeFunnelVisit.updateMany).not.toHaveBeenCalled();
  });
  it('rejects unpublished stores and client payment-success events', async () => {
    const prisma = mock(); const service = new StoreFunnelService(prisma as any);
    await expect(service.record('shop', 's', 'payment_completed' as any)).rejects.toThrow('Evento no válido');
    await expect(service.record('shop', 's', 'delivery_selected')).rejects.toThrow('Evento no válido');
    prisma.store.findFirst.mockResolvedValue(null as any);
    await expect(service.record('shop', 's', 'visit')).rejects.toThrow('Tienda no publicada');
    expect(prisma.storeFunnelVisit.upsert).not.toHaveBeenCalled();
  });
  it('reads the steps from the analytics events, and paid sessions from trusted live succeeded orders', async () => {
    const prisma = mock(); const since = new Date('2026-09-01'); const now = new Date('2026-09-30T12:00:00Z');
    const summary = await new StoreFunnelService(prisma as any).summary('s1', since, now);
    expect(summary).toMatchObject({ visitors: 10, productViews: 6, cartAdds: 4, checkoutStarts: 2, deliverySelections: 1, paymentCompletions: 3, matureCartAdds: 3, cartWithoutCheckout: 2,
      conversionRates: { productViewFromVisitor: 60, cartAddFromProductView: 66.7, checkoutFromCartAdd: 50, deliverySelectionFromCheckout: 50, paymentFromCheckout: 150 } });
    expect(summary).not.toHaveProperty('checkoutWithoutPayment');
    // The step columns are never read again: one count, the order link.
    expect(prisma.storeFunnelVisit.count).toHaveBeenCalledTimes(1);
    expect(prisma.storeFunnelVisit.count).toHaveBeenCalledWith({ where: { storeId: 's1', createdAt: { gte: since }, orders: { some: { paymentIntent: { status: 'SUCCEEDED', livemode: true } } } } });
    const [sql, ...values] = prisma.$queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('"StoreAnalyticsEvent"');
    expect(values).toEqual(expect.arrayContaining(['s1', since.toISOString(), new Date(now.getTime() - 86_400_000).toISOString()]));
  });
});
