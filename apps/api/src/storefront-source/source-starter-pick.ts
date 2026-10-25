import { Prisma } from '@prisma/client';
import { listStarters, templateManifest, type TemplateManifest } from '@pagosya/store-templates';
import type { PrismaService } from '../prisma/prisma.service';
import { MASTER_TEMPLATE_ID } from './source-master';
/** Spec 2026-10-24 §2: the starter closest to the business, chosen in code before the fill so the right fill path (master or
 *  copy slots) runs. Deterministic: the same words always give the same starter. */
export type StarterChoice = { id: string; fits: readonly string[]; fashion?: boolean; order: number };

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => new RegExp(`(?<!\\p{L})${escapeRe(plain(word))}(?!\\p{L})`, 'u').test(text);
const CALM = /(?<!\p{L})(minimalista|minimal|lujo|elegante)(?!\p{L})/u;
const PLAYFUL = /(?<!\p{L})(divertid\p{L}*|alegre|colorid\p{L}*|juguet\p{L}*)(?!\p{L})/u;

export function rankStarters(input: { text: string; fashion: boolean; starters: readonly StarterChoice[]; recent: readonly string[] }): string[] {
  const text = plain(input.text);
  const fashionOnes = input.starters.filter(starter => starter.fashion), otherOnes = input.starters.filter(starter => !starter.fashion);
  // A fashion catalogue needs the fashion card and page (Review Focus 3); the other way round, a fashion starter's card, page and
  // size guide are made for clothes (live check 2026-10-24: a café was offered Calle).
  const eligible = input.fashion ? (fashionOnes.length ? fashionOnes : [...input.starters]) : otherOnes.length ? otherOnes : [...input.starters];
  const base = new Map(eligible.map(starter => {
    let score = starter.fits.filter(word => has(text, word)).length;
    if (CALM.test(text) && starter.fits.some(word => word === 'minimal' || word === 'lujo')) score += 2;
    if (PLAYFUL.test(text) && starter.fits.includes('alegre')) score += 2;
    return [starter.id, score] as const;
  }));
  const byOrder = (a: StarterChoice, b: StarterChoice) => a.order - b.order || a.id.localeCompare(b.id);
  const positives = eligible.filter(starter => base.get(starter.id)! > 0);
  if (!positives.length) return [...eligible].sort((a, b) => (a.id === 'esencial' ? -1 : b.id === 'esencial' ? 1 : byOrder(a, b))).map(starter => starter.id);
  // The merchant's last stores give way when another starter also fits.
  const score = (starter: StarterChoice) => base.get(starter.id)! - (input.recent.includes(starter.id) && positives.length > 1 ? 3 : 0);
  return [...eligible].sort((a, b) => score(b) - score(a) || byOrder(a, b)).map(starter => starter.id);
}

export const pickStarter = (input: Parameters<typeof rankStarters>[0]): string => rankStarters(input)[0] ?? 'esencial';

/** How a starter is filled: «master» starters extend Esencial and take the master fill; «slots» starters fill copy slots. */
export type StarterKind = 'master' | 'slots';
export type StarterEntry = StarterChoice & { kind: StarterKind };

/** The starters a build can use (spec 2026-10-24 §1): Esencial and its extensions are master-kind, a copy-slots starter is
 *  slots-kind; anything else (a master's preset, a starter with neither) is left out. */
export function starterEntries(manifests: readonly TemplateManifest[]): StarterEntry[] {
  return manifests.flatMap(manifest => {
    if (!manifest.starter) return [];
    const kind: StarterKind | undefined = manifest.id === MASTER_TEMPLATE_ID || manifest.extends === MASTER_TEMPLATE_ID ? 'master' : manifest.copy?.length && !manifest.master ? 'slots' : undefined;
    return kind ? [{ id: manifest.id, fits: manifest.starter.fits, ...(manifest.starter.fashion ? { fashion: true } : {}), order: manifest.starter.order, kind }] : [];
  });
}

/** Every starter a new store can start from. Esencial is hidden from the gallery, so `listStarters` leaves it out; it is
 *  added here because it is the fallback when nothing else fits. */
export const buildStarters = (): StarterEntry[] => {
  const listed = listStarters();
  const esencial = listed.some(manifest => manifest.id === MASTER_TEMPLATE_ID) ? undefined : templateManifest(MASTER_TEMPLATE_ID);
  return starterEntries(esencial ? [...listed, esencial] : listed);
};

/** The starters of the merchant's last two other new stores (revision 1), Esencial for a store built before starters. */
export async function recentStarters(prisma: Pick<PrismaService, '$queryRaw'>, merchantId: string, storeId: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ starter: string }>>(Prisma.sql`
    SELECT COALESCE(v.snapshot->'brief'->>'starterId', ${MASTER_TEMPLATE_ID}) AS starter
    FROM "StoreSourceVersion" v JOIN "Store" s ON s.id = v."storeId"
    WHERE s."merchantId" = ${merchantId} AND s.id <> ${storeId} AND v.revision = 1
    ORDER BY v."createdAt" DESC LIMIT 2`).catch(() => []);
  return (rows ?? []).map(row => row.starter);
}
