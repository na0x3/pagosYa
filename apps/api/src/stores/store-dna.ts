import type { PrismaClient } from '@prisma/client';
import { SOURCE_DNA_RUNTIME_ENUMS, sourceRuntimeDna, type SourceRuntimeDna } from '../storefront-source/source-dna';
import { sanitizeRuntimeMotifs } from '../storefront-source/source-motifs';
import { SOURCE_MOTION_MODES, type SourceMotionMode } from '../storefront-source/source-motion';

/** The order confirmation's DNA motif (sub-project 3): its behaviour, sanitised markup and the store's motion mode
 * (config.motion; the checkout never plays it when that is 'off'), nothing else. */
export type StoreConfirmationMotif = { behavior: string; svg: string; motion: SourceMotionMode };
export type StoreLook = { dna: SourceRuntimeDna; confirmationMotif: StoreConfirmationMotif | null };

const CONFIG_PATTERN = /^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/;
/** A published revision never changes, so its DNA is read once per process: a bounded LRU keyed by
 * store and revision spares the public store request the snapshot scan. Failed reads are not cached. */
const CACHE_LIMIT = 500;
const cache = new Map<string, StoreLook>();
export function clearStoreDnaCache() { cache.clear(); }

/** What a published store's confirmation takes from its published config.js (sub-projects 5 and 3): the runtime DNA,
 * so the hosted checkout's order confirmation matches the storefront, and the confirmation motif, re-sanitised here
 * because the checkout inlines it. A store with no published source revision (a classic store) has neither: null, and
 * its checkout renders as before. A missing or unreadable config → the seeded default DNA (`defaultDna(storeId)`, what
 * withSeededDna serves) and no motif. Reads only config.js out of the snapshot, in the database, and never fails the
 * public store request. */
export async function publishedStoreLook(prisma: Pick<PrismaClient, '$queryRaw'>, storeId: string, revision: number | null | undefined): Promise<StoreLook | null> {
  if (!Number.isInteger(revision)) return null;
  const key = `${storeId}:${revision}`;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
  const seeded: StoreLook = { dna: sourceRuntimeDna(undefined, storeId), confirmationMotif: null };
  const remember = (look: StoreLook) => {
    cache.set(key, look);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
    return look;
  };
  try {
    const rows = await prisma.$queryRaw<Array<{ content: string | null }>>`SELECT f->>'content' AS content FROM "StoreSourceVersion" v, jsonb_array_elements(v.snapshot->'files') f WHERE v."storeId" = ${storeId} AND v.revision = ${revision} AND f->>'path' = 'config.js' LIMIT 1`;
    const config = JSON.parse(rows[0]?.content?.match(CONFIG_PATTERN)?.[1] ?? 'null');
    const motif = sanitizeRuntimeMotifs(config?.motifs).find(entry => entry.placement === 'confirmation');
    const motion: SourceMotionMode = SOURCE_MOTION_MODES.includes(config?.motion) ? config.motion : 'subtle'; // what sourceMotionMode reads for a missing value
    const confirmationMotif = motif ? { behavior: motif.behavior, svg: motif.svg, motion } : null;
    const dna = config?.dna;
    if (!dna || typeof dna !== 'object') return remember({ ...seeded, confirmationMotif });
    const known = Object.entries(SOURCE_DNA_RUNTIME_ENUMS).filter(([name, values]) => values.includes(dna[name])).map(([name]) => [name, dna[name] as string]);
    return remember({ dna: { ...seeded.dna, ...Object.fromEntries(known), version: 1 }, confirmationMotif });
  } catch { return seeded; }
}

/** The runtime DNA alone (see publishedStoreLook; same read, same cache). */
export async function publishedStoreDna(prisma: Pick<PrismaClient, '$queryRaw'>, storeId: string, revision: number | null | undefined): Promise<SourceRuntimeDna | null> {
  return (await publishedStoreLook(prisma, storeId, revision))?.dna ?? null;
}
