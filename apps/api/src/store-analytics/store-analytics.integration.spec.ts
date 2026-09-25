import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import { StoreAnalyticsService } from './store-analytics.service';

/**
 * The rollup and retention are SQL (Bolivia day buckets, COUNT DISTINCT, an advisory lock, batched deletes), so they
 * are exercised against real Postgres with the real migrations. Run: `npx jest --config jest.integration.config.js store-analytics`.
 * The local server runs with TimeZone=America/La_Paz, which is exactly the setting that would expose a
 * timestamp/timestamptz mix-up.
 */
const harness = integrationDatabase('analytics');

harness.describeDb('store analytics rollup and retention (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient;
  let service: StoreAnalyticsService;
  jest.setTimeout(120_000);
  beforeAll(async () => { db = await harness.create(); service = new StoreAnalyticsService(db as never); });
  afterAll(() => harness.drop());

  const event = (storeId: string, session: string, type: string, at: string, extra: Record<string, string> = {}) =>
    ({ storeId, sessionHash: session, type, createdAt: new Date(at), device: 'desktop', ...extra });
  const rows = async () => (await db.storeAnalyticsDaily.findMany({ orderBy: [{ storeId: 'asc' }, { day: 'asc' }, { type: 'asc' }, { productId: 'asc' }, { target: 'asc' }] }))
    .map(row => `${row.storeId} ${row.day.toISOString().slice(0, 10)} ${row.type} ${row.productId || '-'} ${row.target || '-'} ${row.count}/${row.uniqueSessions}`);

  describe('rollup', () => {
    beforeAll(async () => {
      await db.storeAnalyticsEvent.createMany({ data: [
        // 03:30 UTC on the 1st is still the 31st in Bolivia (UTC−4).
        event('s1', 'A', 'page_view', '2026-09-01T03:30:00Z', { device: 'mobile', referrerHost: 'instagram.com', path: 'index.html' }),
        event('s1', 'A', 'cta_click', '2026-09-01T03:31:00Z', { target: 'hero-cta', device: 'mobile' }),
        event('s1', 'A', 'page_view', '2026-09-01T12:00:00Z', { device: 'mobile' }),
        event('s1', 'A', 'product_view', '2026-09-01T12:01:00Z', { productId: 'lamp', device: 'mobile' }),
        event('s1', 'B', 'page_view', '2026-09-01T13:00:00Z'),
        event('s1', 'B', 'product_view', '2026-09-01T13:01:00Z', { productId: 'lamp' }),
        event('s1', 'B', 'add_to_cart', '2026-09-01T13:02:00Z', { productId: 'lamp' }),
        event('s1', 'B', 'product_view', '2026-09-01T13:03:00Z', { productId: 'lamp' }),
        event('s2', 'C', 'page_view', '2026-09-01T14:00:00Z', { referrerHost: 'google.com' }),
        // One shopper, three products: one product_view session for the day, not three.
        ...['p1', 'p2', 'p3'].map(productId => event('s3', 'D', 'product_view', '2026-09-01T15:00:00Z', { productId })),
        // Outside the window: never re-rolled, and its old rollup survives.
        event('s1', 'Z', 'page_view', '2026-08-30T10:00:00Z'),
      ] });
      await db.storeAnalyticsDaily.createMany({ data: [
        { storeId: 's1', day: new Date('2026-08-30'), type: 'page_view', count: 1, uniqueSessions: 1 },
        { storeId: 's1', day: new Date('2026-09-01'), type: 'search', count: 9, uniqueSessions: 9 },
      ] });
    });

    const expected = [
      's1 2026-08-30 page_view - - 1/1',
      's1 2026-08-31 _device - mobile 1/1',
      's1 2026-08-31 _referrer - instagram.com 1/1',
      's1 2026-08-31 cta_click - hero-cta 1/1',
      's1 2026-08-31 cta_click * * 1/1',
      's1 2026-08-31 page_view - - 1/1',
      's1 2026-08-31 page_view * * 1/1',
      's1 2026-09-01 _device - desktop 1/1',
      's1 2026-09-01 _device - mobile 1/1',
      's1 2026-09-01 _referrer - direct 2/2',
      's1 2026-09-01 add_to_cart * * 1/1',
      's1 2026-09-01 add_to_cart lamp - 1/1',
      's1 2026-09-01 page_view - - 2/2',
      's1 2026-09-01 page_view * * 2/2',
      's1 2026-09-01 product_view * * 3/2',
      's1 2026-09-01 product_view lamp - 3/2',
      's2 2026-09-01 _device - desktop 1/1',
      's2 2026-09-01 _referrer - google.com 1/1',
      's2 2026-09-01 page_view - - 1/1',
      's2 2026-09-01 page_view * * 1/1',
      's3 2026-09-01 product_view * * 3/1',
      's3 2026-09-01 product_view p1 - 1/1',
      's3 2026-09-01 product_view p2 - 1/1',
      's3 2026-09-01 product_view p3 - 1/1',
    ];

    it('buckets by Bolivia day, counts sessions once (also per type and day), derives device and referrer rows, and replaces stale rows', async () => {
      await expect(service.rollup({ now: new Date('2026-09-01T20:00:00Z'), days: 2 })).resolves.toEqual({ rolled: true, rows: 23 });
      expect(await rows()).toEqual(expected);
    });

    it('gives the same rows when run again', async () => {
      await service.rollup({ now: new Date('2026-09-01T20:00:00Z'), days: 2 });
      expect(await rows()).toEqual(expected);
    });

    it('serves the owner a report read from those rollups', async () => {
      const merchant = await db.merchant.create({ data: { name: 'Comercio', email: `m-${harness.databaseName}@test.test` } });
      await db.store.create({ data: { id: 's1', merchantId: merchant.id, name: 'Tienda', slug: `tienda-${harness.databaseName}` } });
      const report = await service.report(merchant.id, 's1', { from: '2026-08-31', to: '2026-09-01' });
      expect(report.totals.page_view).toEqual({ count: 3, sessions: 3 });
      expect(report.series.product_view).toEqual([{ day: '2026-08-31', count: 0, sessions: 0 }, { day: '2026-09-01', count: 3, sessions: 2 }]);
      expect(report.topProducts).toEqual([{ productId: 'lamp', name: 'Producto eliminado', impressions: 0, cardClicks: 0, views: 3, adds: 1, addRate: 50 }]);
      expect(report.devices).toEqual([{ device: 'mobile', pageViews: 2, sessions: 2 }, { device: 'desktop', pageViews: 1, sessions: 1 }]);
      expect(report.referrers).toEqual([{ host: 'direct', sessions: 2 }, { host: 'instagram.com', sessions: 1 }]);
      await expect(service.report('someone-else', 's1')).rejects.toThrow('Tienda no encontrada');
      await db.store.create({ data: { id: 's3', merchantId: merchant.id, name: 'Otra', slug: `otra-${harness.databaseName}` } });
      expect((await service.report(merchant.id, 's3', { from: '2026-09-01', to: '2026-09-01' })).totals.product_view).toEqual({ count: 3, sessions: 1 });
    });
  });

  describe('retention', () => {
    it('deletes raw events older than 13 months and keeps the rest and every rollup', async () => {
      const now = new Date('2027-10-15T12:00:00Z');
      await db.storeAnalyticsEvent.createMany({ data: [
        event('s9', 'old', 'page_view', '2026-09-14T12:00:00Z'),
        event('s9', 'edge', 'page_view', '2026-09-15T12:00:01Z'),
        event('s9', 'new', 'page_view', '2026-10-15T12:00:00Z'),
      ] });
      const before = await db.storeAnalyticsDaily.count();
      const removed = await service.prune(now);
      const left = await db.storeAnalyticsEvent.findMany({ where: { storeId: 's9' }, select: { sessionHash: true }, orderBy: { createdAt: 'asc' } });
      expect(left.map(row => row.sessionHash)).toEqual(['edge', 'new']);
      // The earlier fixtures (2026-08/09) are older than 13 months at this `now` as well.
      expect(removed).toBe(14);
      expect(await db.storeAnalyticsDaily.count()).toBe(before);
    });
  });
});
