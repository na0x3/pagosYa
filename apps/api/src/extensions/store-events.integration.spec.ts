import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import type { ExtensionManifest } from './extension';
import { emitStoreEvent } from './store-events';

const listener: ExtensionManifest = { id: 'listener', name: 'L', category: 'messaging', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], onEvent: async () => {} };
const scriptOnly: ExtensionManifest = { id: 'script-only', name: 'S', category: 'analytics', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], storefrontLoader: 'function(){}' };

const harness = integrationDatabase('store_events');
harness.describeDb('emitStoreEvent (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient; let storeId: string;
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'C', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'T', slug: `t-${harness.databaseName}` } })).id;
    await db.storeExtension.createMany({ data: [{ storeId, extensionId: 'listener' }, { storeId, extensionId: 'script-only' }, { storeId, extensionId: 'paused', enabled: false }] });
  });
  afterAll(async () => { await harness.drop(); });

  it('queues one delivery per enabled installation that listens to events', async () => {
    await db.$transaction(tx => emitStoreEvent(tx, storeId, 'order.paid', { orderId: 'o1' }, [listener, scriptOnly, { ...listener, id: 'paused' }]));
    const deliveries = await db.extensionDelivery.findMany({ where: { storeId } });
    expect(deliveries.map(item => [item.extensionId, item.status])).toEqual([['listener', 'PENDING']]);
    expect((await db.storeEvent.findUniqueOrThrow({ where: { id: deliveries[0].eventId } })).payload).toEqual({ orderId: 'o1' });
  });

  it('writes nothing, and never builds the payload, when no installation listens', async () => {
    const before = await db.storeEvent.count();
    const build = jest.fn(async () => ({ orderId: 'o2' }));
    await db.$transaction(tx => emitStoreEvent(tx, storeId, 'order.paid', build, [scriptOnly]));
    expect(await db.storeEvent.count()).toBe(before);
    expect(build).not.toHaveBeenCalled();
  });

  it('leaves no event behind when the change that caused it rolls back', async () => {
    const before = await db.storeEvent.count();
    await expect(db.$transaction(async tx => { await emitStoreEvent(tx, storeId, 'order.paid', { orderId: 'o3' }, [listener]); throw new Error('payment failed after all'); })).rejects.toThrow('payment failed');
    expect(await db.storeEvent.count()).toBe(before);
  });
});
