// Popups 2.0 part 1 (spec 2026-11-18 §8): YAPI writes the popup for the stores named here, one at a time; each goes LIVE or is
// saved FAILED (the store keeps its popup). Costs model calls — run on stores the owner names.
// Usage: cd apps/api && npx ts-node --transpile-only scripts/design-popups.ts <storeId|slug> [more…]   (take pnpm dev:doctor --backup first)
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PopupDesignService } from '../src/store-popups/popup-design.service';

async function main() {
  const ids = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  // --full: full-page popups (owner 2026-11-18 «some full pages ones»).
  const layout = process.argv.includes('--full') ? 'full' as const : undefined;
  if (!ids.length) throw new Error('usage: design-popups.ts <storeId|slug> [more…]');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const timers = app.get(SchedulerRegistry);
  for (const name of timers.getIntervals()) timers.deleteInterval(name);
  for (const name of timers.getTimeouts()) timers.deleteTimeout(name);
  for (const [name] of timers.getCronJobs()) timers.deleteCronJob(name);
  const prisma = app.get(PrismaService), popups = app.get(PopupDesignService);
  let live = 0;
  try {
    for (const id of ids) {
      const store = await prisma.store.findFirst({ where: { OR: [{ id }, { slug: id }] }, select: { id: true, slug: true, merchantId: true } });
      if (!store) { console.log(`${id}: no existe`); continue; }
      const started = Date.now();
      const result = await popups.design(store.merchantId, store.id, { createdBy: 'batch', layout }).catch(error => ({ design: { status: 'ERROR' }, problems: [String(error).slice(0, 200)] }));
      if (result.design.status === 'LIVE') live++;
      console.log(`${store.slug}: ${result.design.status} in ${Math.round((Date.now() - started) / 1000)} s${'composition' in result.design ? ` — ${result.design.composition}` : ''}${result.problems.length ? ` — ${result.problems.slice(0, 3).join(' | ')}` : ''}`);
    }
    console.log(`${live} of ${ids.length} stores have a YAPI popup live`);
  } finally { await app.close(); }
}
void main();
