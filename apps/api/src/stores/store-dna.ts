import type { PrismaClient } from '@prisma/client';
import { SOURCE_DNA_RUNTIME_ENUMS, sourceRuntimeDna, type SourceRuntimeDna } from '../storefront-source/source-dna';

const CONFIG_PATTERN = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;

/** The runtime DNA a published store serves (sub-project 5): the `dna` of its published config.js, so the
 * hosted checkout's order confirmation matches the storefront. A store with no published source revision
 * (a classic store) has no DNA: null, and its checkout renders as before. A missing or unreadable config →
 * the seeded default (`defaultDna(storeId)`, what withSeededDna serves). Reads only config.js out of the
 * snapshot, in the database, and never fails the public store request. */
export async function publishedStoreDna(prisma: Pick<PrismaClient, '$queryRaw'>, storeId: string, revision: number | null | undefined): Promise<SourceRuntimeDna | null> {
  if (!Number.isInteger(revision)) return null;
  const seeded = sourceRuntimeDna(undefined, storeId);
  try {
    const rows = await prisma.$queryRaw<Array<{ content: string | null }>>`SELECT f->>'content' AS content FROM "StoreSourceVersion" v, jsonb_array_elements(v.snapshot->'files') f WHERE v."storeId" = ${storeId} AND v.revision = ${revision} AND f->>'path' = 'config.js' LIMIT 1`;
    const dna = JSON.parse(rows[0]?.content?.match(CONFIG_PATTERN)?.[1] ?? 'null')?.dna;
    if (!dna || typeof dna !== 'object') return seeded;
    const known = Object.entries(SOURCE_DNA_RUNTIME_ENUMS).filter(([name, values]) => values.includes(dna[name])).map(([name]) => [name, dna[name] as string]);
    return { ...seeded, ...Object.fromEntries(known), version: 1 };
  } catch { return seeded; }
}
