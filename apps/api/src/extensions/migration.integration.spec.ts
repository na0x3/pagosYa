import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { integrationDatabase } from '../common/testing/integration-database';

const sql = readFileSync(join(__dirname, '../../prisma/migrations/20260928120000_store_extensions/migration.sql'), 'utf8');
const copyAnalytics = sql.slice(sql.indexOf('-- copy-analytics:begin'), sql.indexOf('-- copy-analytics:end'));

const harness = integrationDatabase('store_extensions_migration');
harness.describeDb('store_extensions migration (real Postgres)', () => {
  if (!harness.available) { harness.failIfUnavailable(); return; }
  let db: PrismaClient;
  beforeAll(async () => { db = await harness.create(); });
  afterAll(async () => { await harness.drop(); });

  it('turns the stored measurement IDs into installed extensions, once', async () => {
    const merchant = await db.merchant.create({ data: { name: 'Comercio', email: `m-${harness.databaseName}@test.test` } });
    const store = await db.store.create({ data: { merchantId: merchant.id, name: 'Tienda', slug: `t-${harness.databaseName}`, analyticsGa4Id: 'G-ABC1234567', analyticsMetaPixelId: ' 123456789012345 ', analyticsGtmId: '' } });
    await db.$executeRawUnsafe(copyAnalytics);
    await db.$executeRawUnsafe(copyAnalytics);
    const rows = await db.storeExtension.findMany({ where: { storeId: store.id }, orderBy: { extensionId: 'asc' } });
    expect(rows.map(row => [row.extensionId, row.settings])).toEqual([['google-analytics', { id: 'G-ABC1234567' }], ['meta-pixel', { id: '123456789012345' }]]);
    expect(rows.every(row => row.enabled && row.secrets === null)).toBe(true);
  });
});
