/** Starters (spec 2026-10-24 §1): copies an approved store's latest revision into a starter folder and lists every place that
 *  still names the store or points at its own uploads. Read-only on the database: no create, update, upsert, delete or raw
 *  writes. Exits 1 while findings remain.
 *   npx ts-node --transpile-only scripts/harvest-starter.ts <storeId> <starterId> [--replacements=<json>] [--out=<dir>] */
import { PrismaClient } from '@prisma/client';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

async function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = await readFile(resolve(__dirname, '../.env'), 'utf8');
  return env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
}

async function main() {
  const [storeId, starterId] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  if (!storeId || !/^[a-z0-9-]{2,40}$/.test(starterId ?? '')) throw new Error('usage: harvest-starter.ts <storeId> <starterId> [--replacements=<json>] [--out=<dir>]');
  const option = (name: string) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const prisma = new PrismaClient({ datasources: { db: { url: await databaseUrl() } } });
  try {
    const version = await prisma.storeSourceVersion.findFirst({ where: { storeId }, orderBy: { revision: 'desc' } });
    if (!version) throw new Error(`store ${storeId} has no saved design`);
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, slug: true, contactPhone: true, contactEmail: true, locations: true } });
    const products = await prisma.paymentLink.findMany({ where: { storeId }, select: { name: true } });
    const locations = (Array.isArray(store?.locations) ? store!.locations : []) as Array<{ name?: string; address?: string; city?: string }>;
    // Each word of the name too (vitrina 2026-10-24: «Trío PEPPA» and CSS captions slipped past the full name).
    const nameWords = (store?.name ?? '').split(/\s+/).filter(word => word.replace(/\P{L}/gu, '').length >= 4);
    const brand = [store?.name, ...nameWords, store?.slug, store?.contactPhone, store?.contactEmail, ...products.map(product => product.name), ...locations.flatMap(place => [place.name, place.address, place.city])]
      .filter((word): word is string => typeof word === 'string' && word.trim().length > 0);
    const replacements = option('replacements') ? JSON.parse(await readFile(option('replacements')!, 'utf8')) as Record<string, string> : {};
    const { harvestFiles } = await import('../../../packages/store-templates/tools/harvest-core.mjs') as { harvestFiles: (input: { files: Array<{ path: string; content: string }>; brand: string[]; replacements: Record<string, string> }) => { files: Array<{ path: string; content: string }>; findings: Array<{ path: string; line: number; kind: string; text: string }> } };
    const { files, findings } = harvestFiles({ files: (version.snapshot as unknown as { files: Array<{ path: string; content: string }> }).files, brand, replacements });
    const out = option('out') ?? resolve(__dirname, `../../../packages/store-templates/templates/${starterId}`);
    for (const file of files) { await mkdir(dirname(resolve(out, file.path)), { recursive: true }); await writeFile(resolve(out, file.path), file.content); }
    for (const finding of findings) console.log(`${finding.path}:${finding.line} ${finding.kind} ${finding.text}`);
    console.log(`${files.length} files, ${findings.length} findings, revision ${version.revision} → ${out}`);
    process.exitCode = findings.length ? 1 : 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 2; });
