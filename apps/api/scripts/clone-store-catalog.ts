/** A fresh store with another store's catalog only — categories and products as the merchant entered them (names, prices, stock,
 *  descriptions, photos, specifications), never a design and never YAPI-written product text. For YAPI-only live checks
 *  (owner 2026-10-22: «replicate atelier vargas», test stores are designed by YAPI alone).
 *   npx ts-node --transpile-only scripts/clone-store-catalog.ts --from "NOA VARGAS Atelier" (or a store id) --record noa-yapi-1 [--name "NOA · A"]
 *  Local database only; idempotent through examples/<record>/demo.json. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StoresService } from '../src/stores/stores.service';
import { PaymentLinksService } from '../src/payment-links/payment-links.service';
import { UploadsService } from '../src/uploads/uploads.service';

const arg = (name: string) => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1] : undefined; };

async function main() {
  const from = arg('from'), recordName = arg('record'), name = arg('name');
  if (!from || !recordName) throw new Error('usage: --from "<store name>" --record <folder>');
  const folder = resolve(__dirname, `../../../examples/${recordName}`);
  await mkdir(folder, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('clone-store-catalog requires a local database');
    const prisma = app.get(PrismaService), stores = app.get(StoresService), links = app.get(PaymentLinksService);
    const uploads = app.get(UploadsService);
    // 2026-10-24: a copy used to share the source's photo files, so deleting either store deleted the other's photos (488 dev photos
    // lost). Each copied product now gets its own files; a photo whose file is already gone is left out instead of copied broken.
    // Each copy goes into the merchant's media library too, as an upload would: a build only bundles a hero or story photo the
    // merchant owns there (live check 2026-10-24: unregistered copies left all ten comparison stores without a hero photo).
    const copyPhotos = async (urls: string[], merchantId: string, storeId: string) => (await Promise.all(urls.map(async url => {
      const name = /\/v1\/uploads\/([^/?#]+)$/.exec(url)?.[1];
      if (!name) return url;
      const bytes = await uploads.getBuffer(name).catch(() => null);
      if (!bytes) return null;
      const stored = await uploads.saveBuffer(bytes, uploads.contentTypeFor(name));
      await prisma.mediaAsset.create({ data: { merchantId, storeId, url: stored.url, storageKey: stored.filename, mimeType: stored.mimeType, byteSize: stored.byteSize } });
      return stored.url;
    }))).filter((url): url is string => Boolean(url));
    const source = await prisma.store.findFirstOrThrow({ where: /^c[a-z0-9]{24}$/.test(from) ? { id: from } : { name: from }, orderBy: { createdAt: 'asc' }, select: { id: true, merchantId: true, name: true, tagline: true, policies: true, shippingEnabled: true, shippingPickupEnabled: true, locations: true } });
    let record: any = await readFile(resolve(folder, 'demo.json'), 'utf8').then(JSON.parse).catch(() => null);
    const save = () => writeFile(resolve(folder, 'demo.json'), JSON.stringify(record, null, 2) + '\n');
    if (!record) {
      const store = await stores.create(source.merchantId, { name: name ?? source.name, ...(source.tagline ? { tagline: source.tagline } : {}), animations: [] } as never);
      record = { from: source.id, merchantId: source.merchantId, storeId: store.id, slug: store.slug, categories: {}, products: {} };
      await save();
    }
    const { merchantId, storeId } = record as { merchantId: string; storeId: string };
    for (const category of await prisma.category.findMany({ where: { storeId: source.id }, orderBy: { sortOrder: 'asc' } })) {
      if (record.categories[category.id]) continue;
      record.categories[category.id] = (await prisma.category.create({ data: { storeId, name: category.name, sortOrder: category.sortOrder } })).id; await save();
    }
    for (const product of await prisma.paymentLink.findMany({ where: { storeId: source.id }, orderBy: { createdAt: 'asc' } }) as any[]) {
      if (record.products[product.id]) continue;
      const created: any = await links.create(merchantId, storeId, {
        name: product.name, currency: product.currency, amount: product.amount, description: product.description ?? undefined,
        imageUrls: await copyPhotos(product.imageUrls ?? [], merchantId, storeId), ...(product.stock != null ? { stock: product.stock } : {}), fulfillmentType: product.fulfillmentType,
        ...(product.categoryId ? { categoryId: record.categories[product.categoryId] } : {}),
        ...(Array.isArray(product.specifications) && product.specifications.length ? { specifications: product.specifications } : {}),
      } as never);
      record.products[product.id] = created.id; await save();
    }
    await prisma.store.update({ where: { id: storeId }, data: { policies: source.policies ?? undefined, shippingEnabled: source.shippingEnabled, shippingPickupEnabled: source.shippingPickupEnabled, locations: source.locations ?? undefined } });
    console.log(JSON.stringify({ storeId, slug: record.slug, categories: Object.keys(record.categories).length, products: Object.keys(record.products).length }));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.stack ?? error.message : error); process.exitCode = 1; });
