import type { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';
const harness = integrationDatabase('yapi_outcomes');
harness.describeDb('Yapi persisted incomplete outcomes', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient, storeId: string;
  jest.setTimeout(120_000);
  beforeAll(async () => {
    db = await harness.create();
    const merchant = await db.merchant.create({ data: { name: 'Test', email: 'yapi@example.test' } });
    const store = await db.store.create({ data: { merchantId: merchant.id, name: 'Test', slug: 'yapi-outcomes' } });
    storeId = store.id;
  });
  afterAll(() => harness.drop());
  it.each(['PARTIAL', 'BLOCKED'])('persists %s with a private checkpoint and frees the next run', async status => {
    const run = await db.storeSourceGeneration.create({ data: { storeId, activeStoreId: storeId, baseRevision: 1, requestedModel: 'auto', model: 'test', maxCredits: 50 } });
    const saved = await db.storeSourceGeneration.update({ where: { id: run.id }, data: { status, activeStoreId: null, checkpoint: { key: 'private-test', files: [], requirements: [] } } });
    expect(saved.status).toBe(status);
    expect(saved.checkpoint).toMatchObject({ key: 'private-test' });
    const next = await db.storeSourceGeneration.create({ data: { storeId, activeStoreId: storeId, baseRevision: 1, requestedModel: 'auto', model: 'test', maxCredits: 50 } });
    await db.storeSourceGeneration.delete({ where: { id: next.id } });
  });
});
