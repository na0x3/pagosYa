import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { StoreAnalyticsService } from './store-analytics.service';

const SESSION = '3b241101-e2bb-4255-8caf-4136c566a962';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148';
function fakePrisma() {
  return {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
    paymentLink: { findMany: jest.fn().mockResolvedValue([{ id: 'lamp' }]) },
    customDomain: { findFirst: jest.fn().mockResolvedValue(null) },
    storeAnalyticsEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }), count: jest.fn().mockResolvedValue(0) },
  };
}
const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] });

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

describe('StoreAnalyticsService.ingest daily ceiling', () => {
  const pageViews = (n: number) => ({ sessionId: SESSION, events: Array.from({ length: n }, () => ({ type: 'page_view' })) });
  const at = (iso: string) => () => Date.parse(iso);

  it('stores at most the per-store daily cap, counting what the table already holds for the Bolivia day', async () => {
    const prisma = fakePrisma(); prisma.storeAnalyticsEvent.count.mockResolvedValue(7);
    const service = new StoreAnalyticsService(prisma as never, config({ 'app.storeAnalyticsDailyCap': 10 }) as never);
    service.now = at('2026-09-01T15:00:00Z');
    await expect(service.ingest('shop', pageViews(5))).resolves.toEqual({ accepted: 3 });
    expect(prisma.storeAnalyticsEvent.count).toHaveBeenCalledWith({ where: { storeId: 's1', createdAt: { gte: new Date('2026-09-01T04:00:00Z') } } });
    expect(prisma.storeAnalyticsEvent.createMany.mock.calls[0][0].data).toHaveLength(3);
    // Full: nothing more is written, and the in-process counter answers without asking the table again.
    await expect(service.ingest('shop', pageViews(2))).resolves.toEqual({ accepted: 0 });
    expect(prisma.storeAnalyticsEvent.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.storeAnalyticsEvent.count).toHaveBeenCalledTimes(1);
  });

  it('re-reads the table every 5 minutes (other instances write too) and starts over on a new Bolivia day', async () => {
    const prisma = fakePrisma(); prisma.storeAnalyticsEvent.count.mockResolvedValue(0);
    const service = new StoreAnalyticsService(prisma as never, config({ 'app.storeAnalyticsDailyCap': 10 }) as never);
    service.now = at('2026-09-01T15:00:00Z');
    await expect(service.ingest('shop', pageViews(4))).resolves.toEqual({ accepted: 4 });
    prisma.storeAnalyticsEvent.count.mockResolvedValue(9);
    service.now = at('2026-09-01T15:04:00Z');
    await expect(service.ingest('shop', pageViews(4))).resolves.toEqual({ accepted: 4 });
    service.now = at('2026-09-01T15:06:00Z');
    await expect(service.ingest('shop', pageViews(4))).resolves.toEqual({ accepted: 1 });
    prisma.storeAnalyticsEvent.count.mockResolvedValue(0);
    service.now = at('2026-09-02T04:00:00Z');
    await expect(service.ingest('shop', pageViews(4))).resolves.toEqual({ accepted: 4 });
    expect(prisma.storeAnalyticsEvent.count).toHaveBeenLastCalledWith({ where: { storeId: 's1', createdAt: { gte: new Date('2026-09-02T04:00:00Z') } } });
  });

  it('defaults to 50 000 events a store a day', async () => {
    const prisma = fakePrisma(); prisma.storeAnalyticsEvent.count.mockResolvedValue(49_999);
    await expect(new StoreAnalyticsService(prisma as never).ingest('shop', pageViews(3))).resolves.toEqual({ accepted: 1 });
  });
});

describe('StoreAnalyticsService.ingest origin check', () => {
  const batch = { sessionId: SESSION, events: [{ type: 'page_view' }] };
  const make = () => {
    const prisma = fakePrisma();
    return { prisma, service: new StoreAnalyticsService(prisma as never, config({ 'app.corsOrigins': ['https://pay.pagosya.test'] }) as never) };
  };

  it('accepts a request from the checkout origin, or with no Origin at all', async () => {
    const { prisma, service } = make();
    await expect(service.ingest('shop', batch, { origin: 'https://pay.pagosya.test' })).resolves.toEqual({ accepted: 1 });
    await expect(service.ingest('shop', batch, {})).resolves.toEqual({ accepted: 1 });
    expect(prisma.customDomain.findFirst).not.toHaveBeenCalled();
  });

  it('accepts the store\'s own active custom domain', async () => {
    const { prisma, service } = make();
    prisma.customDomain.findFirst.mockResolvedValue({ id: 'd1' });
    await expect(service.ingest('shop', batch, { origin: 'https://tienda.example.bo' })).resolves.toEqual({ accepted: 1 });
    expect(prisma.customDomain.findFirst).toHaveBeenCalledWith({ where: { storeId: 's1', hostname: 'tienda.example.bo', status: 'ACTIVE' }, select: { id: true } });
  });

  it.each([
    ['another site', 'https://evil.example'],
    ['an opaque (sandboxed) origin', 'null'],
    ['a plain-http look-alike of the checkout', 'http://pay.pagosya.test'],
  ])('refuses %s and stores nothing', async (_name, origin) => {
    const { prisma, service } = make();
    await expect(service.ingest('shop', batch, { origin })).rejects.toThrow(ForbiddenException);
    expect(prisma.storeAnalyticsEvent.createMany).not.toHaveBeenCalled();
  });
});
