import { createHash } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StoreAnalyticsService } from './store-analytics.service';

const SESSION = '3b241101-e2bb-4255-8caf-4136c566a962';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
function fakePrisma() {
  return {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: 'lamp' }]) },
    storeAnalyticsEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
}

describe('StoreAnalyticsService.ingest', () => {
  it('accepts only stores the funnel accepts (active, published, not paused)', async () => {
    const prisma = fakePrisma(); prisma.store.findFirst.mockResolvedValue(null);
    await expect(new StoreAnalyticsService(prisma as never).ingest('shop', { sessionId: SESSION, events: [{ type: 'page_view' }] })).rejects.toThrow(NotFoundException);
    expect(prisma.store.findFirst).toHaveBeenCalledWith({ where: { slug: 'shop', status: 'ACTIVE', sourcePublicationPaused: false, publishedSourceRevision: { not: null } }, select: { id: true } });
    expect(prisma.storeAnalyticsEvent.createMany).not.toHaveBeenCalled();
  });

  it('stores the funnel session hash, the device class and the referrer host on page views only', async () => {
    const prisma = fakePrisma();
    const result = await new StoreAnalyticsService(prisma as never).ingest('shop', {
      sessionId: SESSION, referrer: 'https://www.instagram.com/p/abc?igsh=1',
      events: [{ type: 'page_view', path: 'index.html' }, { type: 'cta_click', target: 'hero-cta', path: 'index.html' }],
    }, { userAgent: IPHONE });
    expect(result).toEqual({ accepted: 2 });
    const hash = createHash('sha256').update(SESSION).digest('hex');
    expect(prisma.storeAnalyticsEvent.createMany).toHaveBeenCalledWith({ data: [
      { storeId: 's1', sessionHash: hash, type: 'page_view', productId: null, target: null, path: 'index.html', device: 'mobile', referrerHost: 'instagram.com' },
      { storeId: 's1', sessionHash: hash, type: 'cta_click', productId: null, target: 'hero-cta', path: 'index.html', device: 'mobile', referrerHost: null },
    ] });
  });

  it('drops product events for products of another store and clears an unknown product on a CTA', async () => {
    const prisma = fakePrisma();
    const result = await new StoreAnalyticsService(prisma as never).ingest('shop', {
      sessionId: SESSION,
      events: [{ type: 'product_view', productId: 'lamp' }, { type: 'add_to_cart', productId: 'other-store' }, { type: 'cta_click', target: 'add', productId: 'other-store' }],
    });
    expect(prisma.paymentLink.findMany).toHaveBeenCalledWith({ where: { storeId: 's1', id: { in: ['lamp', 'other-store'] } }, select: { id: true } });
    expect(result).toEqual({ accepted: 2 });
    const rows = prisma.storeAnalyticsEvent.createMany.mock.calls[0][0].data;
    expect(rows.map((row: { type: string; productId: string | null }) => [row.type, row.productId])).toEqual([['product_view', 'lamp'], ['cta_click', null]]);
    expect(rows[0].device).toBe('desktop');
  });

  it('records nothing for a Global Privacy Control request or a batch with no valid event', async () => {
    const prisma = fakePrisma();
    const service = new StoreAnalyticsService(prisma as never);
    await expect(service.ingest('shop', { sessionId: SESSION, events: [{ type: 'page_view' }] }, { gpc: true })).resolves.toEqual({ accepted: 0 });
    await expect(service.ingest('shop', { sessionId: SESSION, events: [{ type: 'payment_completed' }] })).resolves.toEqual({ accepted: 0 });
    expect(prisma.storeAnalyticsEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.paymentLink.findMany).not.toHaveBeenCalled();
  });
});

describe('StoreAnalyticsService.report range checks', () => {
  const service = () => {
    const prisma = { store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) }, storeAnalyticsDaily: { findMany: jest.fn().mockResolvedValue([]) }, paymentLink: { findMany: jest.fn() } };
    return { prisma, service: new StoreAnalyticsService(prisma as never) };
  };

  it.each([
    ['a range of centuries', { from: '0001-01-01', to: '2026-01-01' }],
    ['a far-future end', { to: '9999-12-31' }],
    ['a far-future range', { from: '9999-12-01', to: '9999-12-31' }],
  ])('refuses %s arithmetically, before building any day (400 fast)', async (_name, query) => {
    const { prisma, service: analytics } = service();
    const started = Date.now();
    await expect(analytics.report('m1', 's1', query)).rejects.toThrow(BadRequestException);
    expect(Date.now() - started).toBeLessThan(50);
    expect(prisma.storeAnalyticsDaily.findMany).not.toHaveBeenCalled();
  });

  it('accepts exactly 400 days and refuses 401', async () => {
    const { service: analytics } = service();
    await expect(analytics.report('m1', 's1', { from: '2025-01-01', to: '2026-02-04' })).resolves.toMatchObject({ from: '2025-01-01', to: '2026-02-04' });
    await expect(analytics.report('m1', 's1', { from: '2025-01-01', to: '2026-02-05' })).rejects.toThrow(BadRequestException);
  });
});
