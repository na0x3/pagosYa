/** Publish only this fictional demo on the local development installation. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SourcePublishingService } from '../src/stores/source-publishing.service';
async function main() {
  const path = resolve(__dirname, '../../../examples/savia/demo.json');
  const record = JSON.parse(await readFile(path, 'utf8'));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const database = new URL(app.get(ConfigService).getOrThrow<string>('app.databaseUrl'));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) throw new Error('This script is restricted to the local database');
    const prisma = app.get(PrismaService);
    const store = await prisma.store.findFirstOrThrow({ where: { id: record.storeId, slug: 'xlixm44n', merchantId: record.merchantId, merchant: { email: { startsWith: 'savia-demo-', endsWith: '@local.invalid' } } }, include: { merchant: true } });
    if (store.merchant.status === 'ACTIVE') throw new Error('This demo must remain in test payment mode');
    const state = await app.get(SourcePublishingService).publish(record.merchantId, store.id, record.revision, store.sourcePublicationVersion);
    record.localPublication = { revision: state.revision, payments: state.payments, url: 'http://localhost:5175/s/' + store.slug };
    await writeFile(path, JSON.stringify(record, null, 2));
    console.log(JSON.stringify(record.localPublication));
  } finally { await app.close(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Local demo publication failed'); process.exitCode = 1; });
