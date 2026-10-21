/** Fashion look (spec 2026-10-21): switches one existing Esencial store to the fashion card and product page as a new
 *  revision. Local database only.
 *   npx ts-node --transpile-only scripts/fashion-look-apply.ts <storeId>
 *  The app context's timers (job runners, retention emails, sweeps) are stopped before their first tick: the owner's
 *  running API already runs them, and a second copy must not send emails or claim jobs. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SourceProjectsService } from '../src/storefront-source/source-projects.service';
import { SourceTemplatesService } from '../src/storefront-source/source-templates.service';

async function main() {
  const storeId = process.argv[2];
  if (!storeId) throw new Error('usage: fashion-look-apply.ts <storeId>');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  try {
    const config = app.get(ConfigService);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.getOrThrow<string>('app.databaseUrl')).hostname)) throw new Error('fashion-look-apply requires a local database');
    const store = await app.get(PrismaService).store.findUniqueOrThrow({ where: { id: storeId }, select: { merchantId: true, name: true } });
    const current = await app.get(SourceProjectsService).current(store.merchantId, storeId);
    const saved = await app.get(SourceTemplatesService).refill(store.merchantId, storeId, current.revision, { variants: { cards: 'fashion', pdp: 'fashion' } as never }, 'Estilo moda');
    console.log(`${store.name}: revision ${current.revision} → ${saved.revision}`);
  } finally { await app.close(); }
}
main().catch(error => { console.error(error); process.exit(1); });
