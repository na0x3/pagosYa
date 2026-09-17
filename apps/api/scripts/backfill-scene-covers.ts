/** Make each product's own YAPI scene its cover where lineage proves the pair.
 * Dry run by default; pass --apply to write. Optional --store <id> limits it to one store.
 * Run it when stores can be regenerated: generated sections that already show a scene as decoration
 * would otherwise repeat it right under its card. */
import { PrismaClient } from '@prisma/client';
import { planSceneCover } from '../src/stores/scene-cover-backfill';

async function main() {
  const apply = process.argv.includes('--apply');
  const storeId = process.argv[process.argv.indexOf('--store') + 1];
  const prisma = new PrismaClient();
  try {
    const products = await prisma.paymentLink.findMany({ where: { ...(process.argv.includes('--store') ? { storeId } : {}), NOT: { imageUrls: { isEmpty: true } } }, select: { id: true, storeId: true, name: true, imageUrls: true, imagePositions: true } });
    const urls = [...new Set(products.flatMap(p => p.imageUrls).map(url => { try { return new URL(url, 'https://local.invalid').pathname; } catch { return url; } }))];
    const assets = await prisma.mediaAsset.findMany({ where: { url: { in: urls } }, select: { url: true, kind: true, parentAsset: { select: { url: true } } } });
    const lineage = new Map(assets.map(a => [a.url, { kind: a.kind as string, parentUrl: a.parentAsset?.url ?? null }]));
    let changed = 0;
    for (const product of products) {
      const plan = planSceneCover(product, lineage);
      if (!plan) continue;
      changed++;
      console.log(`${apply ? 'UPDATE' : 'WOULD UPDATE'} store=${product.storeId} product=${product.id} ${JSON.stringify(product.name)}: ${product.imageUrls[0]} -> ${plan.imageUrls[0]}`);
      if (apply) await prisma.paymentLink.update({ where: { id: product.id }, data: plan });
    }
    console.log(`${changed} of ${products.length} products with photos ${apply ? 'updated' : 'would be updated (dry run; pass --apply to write)'}.`);
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
