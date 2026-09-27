import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
import type { ExtensionManifest } from './extension';
import { ExtensionDeliveryService, MAX_ATTEMPTS } from './extension-delivery.service';
import { openSecrets, sealSecrets } from './secret-box';

const KEY = 'k'.repeat(32);
const calls: string[] = [];
const ok: ExtensionManifest = { id: 'ok', name: 'Ok', category: 'messaging', tier: 'free', logo: null, summary: 's', description: 'd', settings: [], secrets: [{ key: 'token', label: 'Token' }], onEvent: async (event, context) => { calls.push(`${event.id}:${context.secrets.token}`); } };
const broken: ExtensionManifest = { ...ok, id: 'broken', onEvent: async () => { throw new Error('Meta rechazó tu token'); } };

const harness = integrationDatabase('extension_delivery');
harness.describeDb('ExtensionDeliveryService (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient; let storeId: string; let service: ExtensionDeliveryService;
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'C', email: `m-${harness.databaseName}@test.test` } });
    storeId = (await db.store.create({ data: { merchantId: merchant.id, name: 'T', slug: `t-${harness.databaseName}` } })).id;
    await db.storeExtension.createMany({ data: [{ storeId, extensionId: 'ok', secrets: sealSecrets(KEY, { token: 'tk' }) }, { storeId, extensionId: 'broken' }] });
    service = new ExtensionDeliveryService(db as any, { open: (value: string) => openSecrets(KEY, value) } as any, [ok, broken]);
  });
  afterAll(async () => { await harness.drop(); });

  const event = async () => {
    const created = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: { orderId: 'o' } } });
    await db.extensionDelivery.createMany({ data: [{ eventId: created.id, storeId, extensionId: 'ok' }, { eventId: created.id, storeId, extensionId: 'broken' }] });
    return created;
  };

  // Review focus 3: one failing extension never holds back the others, and gives up with a readable error.
  it('delivers with decrypted secrets, retries a failure with back-off, then gives up and tells the merchant', async () => {
    const created = await event();
    let now = new Date('2026-10-01T12:00:00Z');
    await service.runOnce(now);
    expect(calls).toEqual([`${created.id}:tk`]);
    expect(await db.extensionDelivery.findFirstOrThrow({ where: { eventId: created.id, extensionId: 'ok' } })).toMatchObject({ status: 'DONE', attempts: 1 });
    let failed = await db.extensionDelivery.findFirstOrThrow({ where: { eventId: created.id, extensionId: 'broken' } });
    expect(failed).toMatchObject({ status: 'PENDING', attempts: 1, lastError: 'Meta rechazó tu token' });
    expect(failed.nextAttemptAt.getTime() - now.getTime()).toBe(60_000);
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      now = new Date(failed.nextAttemptAt.getTime() + 1);
      await service.runOnce(now);
      failed = await db.extensionDelivery.findFirstOrThrow({ where: { id: failed.id } });
    }
    expect(failed).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
    expect(await db.storeExtension.findFirstOrThrow({ where: { storeId, extensionId: 'broken' } })).toMatchObject({ lastError: 'Meta rechazó tu token' });
    expect(calls).toHaveLength(1);
  });

  it('closes deliveries of a paused or uninstalled extension without calling it', async () => {
    const created = await event();
    await db.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId: 'ok' } }, data: { enabled: false } });
    await db.storeExtension.delete({ where: { storeId_extensionId: { storeId, extensionId: 'broken' } } });
    await service.runOnce(new Date('2026-10-02T00:00:00Z'));
    expect((await db.extensionDelivery.findMany({ where: { eventId: created.id } })).every(row => row.status === 'DONE')).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it('takes over a delivery whose lease expired, and never runs one another worker holds', async () => {
    const created = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {} } });
    await db.storeExtension.update({ where: { storeId_extensionId: { storeId, extensionId: 'ok' } }, data: { enabled: true } });
    const held = await db.extensionDelivery.create({ data: { eventId: created.id, storeId, extensionId: 'ok', status: 'RUNNING', leaseToken: 'other', leaseUntil: new Date('2026-10-03T00:05:00Z'), attempts: 1 } });
    await service.runOnce(new Date('2026-10-03T00:00:00Z'));
    expect((await db.extensionDelivery.findUniqueOrThrow({ where: { id: held.id } })).status).toBe('RUNNING');
    await service.runOnce(new Date('2026-10-03T00:06:00Z'));
    expect(await db.extensionDelivery.findUniqueOrThrow({ where: { id: held.id } })).toMatchObject({ status: 'DONE', attempts: 2 });
  });

  it('deletes finished events older than 30 days, keeps anything still pending', async () => {
    const old = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {}, createdAt: new Date('2026-01-01T00:00:00Z') } });
    await db.extensionDelivery.create({ data: { eventId: old.id, storeId, extensionId: 'ok', status: 'DONE' } });
    const pending = await db.storeEvent.create({ data: { storeId, type: 'order.paid', payload: {}, createdAt: new Date('2026-01-01T00:00:00Z') } });
    await db.extensionDelivery.create({ data: { eventId: pending.id, storeId, extensionId: 'ok', status: 'PENDING', nextAttemptAt: new Date('2027-01-01T00:00:00Z') } });
    await service.cleanup(new Date('2026-10-05T00:00:00Z'));
    expect(await db.storeEvent.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await db.storeEvent.findUnique({ where: { id: pending.id } })).not.toBeNull();
  });
});
