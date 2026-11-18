// Spec 2026-11-09 popup looks: one look for every store whose popup settings have none (owner: «Yes, all stores now»).
// Usage: cd apps/api && npx ts-node --transpile-only scripts/popup-looks-backfill.ts [--apply]   (take pnpm dev:doctor --backup first)
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { pickPopupLook, readPopupLook } from '../src/store-popups/popup-looks';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  const rows = await prisma.storeRetention.findMany({ select: { storeId: true, settings: true, store: { select: { slug: true } } } });
  const counts: Record<string, number> = {};
  let changed = 0;
  for (const row of rows) {
    const settings = (row.settings ?? {}) as Record<string, unknown>;
    if (readPopupLook(settings.popupLook)) continue;
    const look = pickPopupLook(row.store.slug);
    counts[look] = (counts[look] ?? 0) + 1; changed++;
    if (apply) await prisma.storeRetention.update({ where: { storeId: row.storeId }, data: { settings: { ...settings, popupLook: look } as never } });
  }
  console.log(`${apply ? 'Wrote' : 'Would write'} a look for ${changed} of ${rows.length} stores`, counts);
  await prisma.$disconnect();
}
void main();
