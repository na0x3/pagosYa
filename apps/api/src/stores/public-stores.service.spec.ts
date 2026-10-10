import { PublicStoresService } from './public-stores.service';

const storeRow: any = {
  id: 'store-1', slug: 'cafe', name: 'Café', status: 'ACTIVE', publicVisibility: true, sourcePublicationPaused: false,
  publishedSourceRevision: null, bundlesEnabled: false, subscriptionsEnabled: false,
};

const productRow: any = {
  id: 'p0', categoryId: null, fulfillmentType: 'PHYSICAL', name: 'Producto', description: null,
  imageUrls: [], imagePositions: null, tags: [], specifications: null, highlights: null,
  recommendedProductIds: [], stock: null, color: null, variants: null, extras: null,
  amount: 1000, currency: 'BOB', discountPercent: null, discountStartsAt: null, discountEndsAt: null,
  subscriptionOptions: [],
};

function setup() {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue(storeRow), findFirst: jest.fn().mockResolvedValue(storeRow) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([]) },
    category: { findMany: jest.fn().mockResolvedValue([]) },
    storeLink: { findMany: jest.fn().mockResolvedValue([]) },
    storeProductStat: { findMany: jest.fn().mockResolvedValue([]) },
    appointmentServiceOffering: { findMany: jest.fn().mockResolvedValue([]) },
    collection: { findMany: jest.fn().mockResolvedValue([]) },
    storeBundle: { findMany: jest.fn().mockResolvedValue([]) },
    storeOrder: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { prisma, service: new PublicStoresService(prisma) };
}

describe('subscription offers', () => {
  it('exposes valid product content blocks and defaults older products to an empty list', async () => {
    const { service, prisma } = setup();
    const block = { id: 'blk_abcdefghijkl', type: 'media', imageUrl: '/v1/uploads/photo.jpg', alt: 'Reclinada' };
    prisma.paymentLink.findMany.mockResolvedValue([{ ...productRow, contentBlocks: [block] }, { ...productRow, id: 'old' }]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.items[0]).toMatchObject({ contentBlocks: [block] });
    expect(result.items[1]).toMatchObject({ contentBlocks: [] });
  });
  it('publishes offers only when the store switch is on and never for digital items', async () => {
    const { service, prisma } = setup();
    prisma.store.findUnique.mockResolvedValue({ ...storeRow, subscriptionsEnabled: true });
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: 'p1', subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] },
      { ...productRow, id: 'p2', fulfillmentType: 'DIGITAL', subscriptionOptions: [{ cadence: 'WEEKLY', discountPercent: 5 }] },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(true);
    expect(result.items.find((item: { id: string }) => item.id === 'p1')!.subscriptionOptions).toEqual([{ cadence: 'MONTHLY', discountPercent: 10 }]);
    expect(result.items.find((item: { id: string }) => item.id === 'p2')!.subscriptionOptions).toEqual([]);
  });

  it("publishes a membership's active periods and never subscription options for it", async () => {
    const { service, prisma } = setup();
    prisma.store.findUnique.mockResolvedValue({ ...storeRow, subscriptionsEnabled: true });
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: 'club', fulfillmentType: 'MEMBERSHIP', membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }], subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 5 }] },
      { ...productRow, id: 'p1' },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    const club: any = result.items.find((item: { id: string }) => item.id === 'club');
    expect(club.membershipPeriods).toEqual([{ id: 'm1', months: 1, amount: 5000 }]);
    expect(club.subscriptionOptions).toEqual([]);
    expect((result.items.find((item: { id: string }) => item.id === 'p1') as any).membershipPeriods).toEqual([]);
  });

  it('hides every offer while the switch is off', async () => {
    const { service, prisma } = setup();
    prisma.store.findUnique.mockResolvedValue({ ...storeRow, subscriptionsEnabled: false });
    prisma.paymentLink.findMany.mockResolvedValue([{ ...productRow, id: 'p1', subscriptionOptions: [{ cadence: 'MONTHLY', discountPercent: 10 }] }]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.subscriptionsEnabled).toBe(false);
    expect(result.items[0].subscriptionOptions).toEqual([]);
  });
});

describe('storefront view flush timer', () => {
  afterEach(() => jest.useRealTimers());

  it('never throws into the process when the client cannot write views, and keeps the count for a retry', async () => {
    const { service, prisma } = setup();
    (service as any).queueStoreView('store-1');
    await expect(service.flushPendingStoreViews()).resolves.toBeUndefined(); // prisma.store.update does not exist on this mock
    expect((service as any).pendingStoreViews.get('store-1')).toBe(1);
    prisma.store.update = jest.fn().mockResolvedValue({});
    await service.onModuleDestroy();
    expect(prisma.store.update).toHaveBeenCalledWith({ where: { id: 'store-1' }, data: { viewCount: { increment: 1 } } });
  });

  it('a fired timer with a broken client is swallowed', async () => {
    jest.useFakeTimers();
    const { service } = setup();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    (service as any).queueStoreView('store-1');
    await jest.advanceTimersByTimeAsync(1_100);
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    await service.onModuleDestroy();
  });

  it('is unref-ed, cleared on module destroy, and not re-armed afterwards', async () => {
    const { service, prisma } = setup();
    prisma.store.update = jest.fn().mockResolvedValue({});
    (service as any).queueStoreView('store-1');
    const timer = (service as any).storeViewFlushTimer;
    expect(timer).not.toBeNull();
    expect(timer.hasRef()).toBe(false);
    await service.onModuleDestroy();
    expect((service as any).storeViewFlushTimer).toBeNull();
    expect(prisma.store.update).toHaveBeenCalledTimes(1); // pending views are flushed once on the way out
    (service as any).queueStoreView('store-1');
    expect((service as any).storeViewFlushTimer).toBeNull();
  });
});

describe('photo badge data', () => {
  it('publishes the merchant badge and the creation date the kit needs for "Nuevo"', async () => {
    const { service, prisma } = setup();
    const createdAt = new Date('2026-10-01T12:00:00.000Z');
    prisma.paymentLink.findMany.mockResolvedValue([
      { ...productRow, id: 'p1', badge: 'Edición limitada', createdAt },
      { ...productRow, id: 'p2', badge: null, createdAt },
      { ...productRow, id: 'p3', badge: '', createdAt },
    ]);
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.items.map((item: any) => [item.id, item.badge, item.createdAt])).toEqual([
      ['p1', 'Edición limitada', createdAt.toISOString()], ['p2', null, createdAt.toISOString()], ['p3', '', createdAt.toISOString()],
    ]);
  });
});

describe('top seller badge', () => {
  it('asks only for paid orders of the last 90 days and publishes the winner', async () => {
    const { service, prisma } = setup();
    const lines = (id: string) => ({ items: [{ paymentLinkId: id, quantity: 1 }] });
    prisma.storeOrder.findMany.mockResolvedValue([lines('p1'), lines('p1'), lines('p2'), lines('p1'), lines('p3')]);
    const before = Date.now();
    const result = await service.getStorePublic(storeRow.slug);
    expect(result.topSellerId).toBe('p1');
    const where = prisma.storeOrder.findMany.mock.calls[0][0].where;
    const query = prisma.storeOrder.findMany.mock.calls[0][0];
    expect(query.orderBy).toEqual({ createdAt: 'desc' });
    expect(query.take).toBe(5000);
    expect(where.storeId).toBe(storeRow.id);
    expect(where.status.in).toEqual(expect.arrayContaining(['PAID', 'DELIVERED']));
    expect(where.status.in).not.toContain('PENDING');
    expect(before - where.createdAt.gte.getTime()).toBeGreaterThanOrEqual(90 * 86_400_000 - 1000);
  });
});
