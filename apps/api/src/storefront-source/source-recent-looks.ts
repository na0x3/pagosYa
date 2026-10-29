import type { PrismaService } from '../prisma/prisma.service';

/** Spec 2026-10-28 §3 (PEPPA and DooBoo came out on the same #faf5f5 and the same Fredoka): what the last stores look like —
 *  their paper colour and heading font — so a new store's first redesign never repeats them. Read only; no model. */
type File = { path: string; content: string };
export type StoreLook = { paper?: string; heading?: string };

const last = (text: string, pattern: RegExp) => { let found: string | undefined; for (const match of text.matchAll(pattern)) found = match[1]; return found; };

/** A free design names its look in --store-*, an Esencial store in --es-*; the last declaration is the one the page uses. */
export function lookOf(files: File[]): StoreLook {
  const css = files.filter(file => /\.(css|tsx)$/.test(file.path)).map(file => file.content).join('\n');
  const paper = last(css, /--(?:store-background|es-paper)\s*:\s*(#[0-9a-f]{6})\b/gi)?.toLowerCase();
  // `var(--es-heading)` only points at the real font; it is skipped so the named one wins.
  const heading = last(css, /--(?:store-heading-font|es-heading)\s*:\s*["']?((?!var\()[^"',;}]+)/gi)?.trim();
  return { ...(paper ? { paper } : {}), ...(heading ? { heading } : {}) };
}

/** The newest saved look of each of the last `take` stores, newest first, never the store being built. */
export async function recentLooks(prisma: PrismaService, excludeStoreId: string, take = 10): Promise<StoreLook[]> {
  const versions = await prisma.storeSourceVersion.findMany({ where: { storeId: { not: excludeStoreId } }, orderBy: { createdAt: 'desc' }, take: take * 4, select: { storeId: true, snapshot: true } });
  const seen = new Set<string>(), looks: StoreLook[] = [];
  for (const version of versions) {
    if (seen.has(version.storeId) || looks.length >= take) continue;
    seen.add(version.storeId);
    const look = lookOf(((version.snapshot as { files?: File[] } | null)?.files ?? []).filter(file => file.path.startsWith('styles/') || file.path === 'components/store-data.tsx'));
    if (look.paper || look.heading) looks.push(look);
  }
  return looks;
}
