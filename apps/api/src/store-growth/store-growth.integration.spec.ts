import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import { StoreGrowthService } from './store-growth.service';

/**
 * The device split is raw SQL (COUNT DISTINCT with FILTER, UTC bounds under a La_Paz server TimeZone) and the insight
 * state relies on the (storeId, insightId) unique key, so both run against real Postgres with the real migrations.
 * Run: `npx jest --config jest.integration.config.js store-growth`.
 */
const harness = integrationDatabase('growth');

harness.describeDb('store growth (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient;
  let service: StoreGrowthService;
  jest.setTimeout(120_000);
  beforeAll(async () => { db = await harness.create(); service = new StoreGrowthService(db as never, {} as never); });
  afterAll(() => harness.drop());

  const event = (session: string, type: string, at: string, device = 'mobile', storeId = 's1') => ({ storeId, sessionHash: session, type, createdAt: new Date(at), device });

  it('counts distinct visit and add-to-cart sessions per device inside the period only', async () => {
    await db.storeAnalyticsEvent.createMany({ data: [
      event('A', 'page_view', '2026-09-20T12:00:00Z'), event('A', 'page_view', '2026-09-20T12:05:00Z'), event('A', 'add_to_cart', '2026-09-20T12:06:00Z'),
      event('B', 'page_view', '2026-09-21T12:00:00Z'),
      event('C', 'page_view', '2026-09-21T13:00:00Z', 'desktop'), event('C', 'add_to_cart', '2026-09-21T13:01:00Z', 'desktop'), event('C', 'add_to_cart', '2026-09-21T13:02:00Z', 'desktop'),
      // Before the period (03:59 UTC on the 19th is still the 18th in Bolivia), and another store.
      event('D', 'page_view', '2026-09-19T03:59:00Z'), event('E', 'page_view', '2026-09-20T12:00:00Z', 'mobile', 's2'),
    ] });
    const rows = await (service as unknown as { deviceConversion(s: string, a: Date, b: Date): Promise<{ device: string; sessions: number; addSessions: number }[]> })
      .deviceConversion('s1', new Date('2026-09-19T04:00:00Z'), new Date('2026-09-26T04:00:00Z'));
    expect(rows.sort((a, b) => a.device.localeCompare(b.device))).toEqual([
      { device: 'desktop', sessions: 1, addSessions: 1 },
      { device: 'mobile', sessions: 2, addSessions: 1 },
    ]);
  });

  it('keeps one state per store and insight: dismiss, then snooze, then restore', async () => {
    const owned = { store: { findFirst: async () => ({ id: 's1', slug: 's1', contactFormEnabled: true }) } };
    const scoped = new StoreGrowthService(new Proxy(db, { get: (target, key) => key === 'store' ? owned.store : (target as never)[key] }) as never, {} as never);
    const now = new Date('2026-09-25T16:00:00Z');
    await scoped.setInsightState('m1', 's1', 'views-no-adds:p1', 'dismiss', now);
    await scoped.setInsightState('m1', 's1', 'views-no-adds:p1', 'snooze', now);
    await scoped.setInsightState('m1', 's1', 'weak-photos', 'dismiss', now);
    const states = await db.storeGrowthInsightState.findMany({ where: { storeId: 's1' }, orderBy: { insightId: 'asc' } });
    expect(states.map(state => [state.insightId, state.status, state.until?.toISOString() ?? null])).toEqual([
      ['views-no-adds:p1', 'snoozed', '2026-10-02T16:00:00.000Z'], ['weak-photos', 'dismissed', null],
    ]);
    await scoped.setInsightState('m1', 's1', 'weak-photos', 'restore', now);
    expect(await db.storeGrowthInsightState.count({ where: { storeId: 's1' } })).toBe(1);
    await expect(scoped.restoreInsights('m1', 's1')).resolves.toEqual({ restored: 1 });
  });
});
