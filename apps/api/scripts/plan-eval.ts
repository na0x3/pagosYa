import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SourceStorePlanService } from '../src/storefront-source/source-store-plan.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { otherFingerprints } from '../src/storefront-source/plan/store-plan-data';
import { fingerprintOf, planDistance } from '../src/storefront-source/plan/store-plan-fingerprint';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const prisma = app.get(PrismaService), plans = app.get(SourceStorePlanService);
  for (const storeId of process.argv.slice(2)) {
    const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId }, select: { name: true, merchantId: true } });
    const out = await plans.draft(store.merchantId, storeId, { revision: 0, request: 'Hazme una tienda', what: '', photos: [] });
    if (!out) { console.log(`${store.name}: plan call failed`); continue; }
    const mine = fingerprintOf({ variants: out.applied.variants, sections: out.applied.sections, palette: out.applied.palette, fonts: out.applied.fonts, accent: out.applied.accent });
    const nearest = Math.min(1, ...(await otherFingerprints(prisma, storeId)).map(other => planDistance(mine, other)));
    console.log(`\n${store.name}\n${out.plan.card.map(line => `  • ${line}`).join('\n')}\n  nearest distance ${nearest.toFixed(2)} exhausted=${out.exhausted}\n  ${JSON.stringify(out.applied)}`);
  }
  await app.close();
}
main().catch(error => { console.error(error); process.exit(1); });
