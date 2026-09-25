/** Uniqueness and quality scorecard (sub-project 8). Local, read-only, no model calls.
 * Usage: cd apps/api && npx ts-node -T scripts/uniqueness-scorecard.ts [--limit 12] [--stores id1,id2] [--from-dir <path>] [--out ../../tmp/scorecard/<date>]
 * Reads the latest revision of each store from the local database (or exported site/ folders with --from-dir), renders it in the
 * visual sandbox and writes scorecard.json, SCORECARD.md and cart / added-to-cart screenshots. Never writes to the database. */
import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { collectStoreSample, kitDefaultSnapshot, snapshotFromDirectory } from '../src/storefront-source/source-scorecard-capture';
import { scoreStores, scorecardMarkdown, type StoreSample } from '../src/storefront-source/source-scorecard';
import { withSeededDna } from '../src/storefront-source/source-dna';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

const args = process.argv.slice(2);
const option = (key: string) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const out = resolve(option('--out') ?? `../../tmp/scorecard/${today}`);
const limit = Number(option('--limit') ?? 12);
const storeIds = option('--stores')?.split(',').filter(Boolean);
const fromDir = option('--from-dir');
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('--limit must be 1–100.');

type Target = { id: string; name: string; load: () => Promise<SourceProjectSnapshot> };
const slug = (text: string) => text.normalize('NFD').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60) || 'store';

/** Same idea as SourceVisualReviewService.hydrate, read-only: inline the merchant's own uploaded images. */
async function hydrateUploads(prisma: PrismaClient, snapshot: SourceProjectSnapshot, merchantId: string): Promise<SourceProjectSnapshot> {
  const text = snapshot.files.filter(f => f.encoding !== 'base64').map(f => f.content).join('\n');
  const candidates = [...new Set(text.match(/(?:https?:\/\/[^\s"'<>]+)?\/v1\/uploads\/[a-f0-9-]+\.(?:png|jpe?g|webp)/gi) || [])].slice(0, 48);
  if (!candidates.length) return snapshot;
  const paths = candidates.map(url => new URL(url, 'https://local.invalid').pathname);
  const owned = await prisma.mediaAsset.findMany({ where: { merchantId, url: { in: paths } }, select: { url: true } });
  const uploads = process.env.UPLOADS_DIR ?? resolve(__dirname, '../uploads');
  const files = snapshot.files.map(f => ({ ...f }));
  for (const asset of owned) {
    const filename = asset.url.split('/').at(-1)!, source = join(uploads, filename);
    if (!/^[a-f0-9-]+\.(png|jpe?g|webp)$/i.test(filename) || !existsSync(source)) continue;
    const path = `assets/review-${filename}`;
    files.push({ path, content: (await readFile(source)).toString('base64'), encoding: 'base64' });
    for (const url of candidates.filter(url => new URL(url, 'https://local.invalid').pathname === asset.url)) for (const file of files) if (file.encoding !== 'base64') file.content = file.content.split(url).join(path);
  }
  return { ...snapshot, files };
}

async function databaseTargets(prisma: PrismaClient): Promise<Target[]> {
  const host = new URL(process.env.DATABASE_URL ?? 'postgresql://missing').hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('The scorecard reads the local database only.');
  const projects = await prisma.storeSourceProject.findMany({
    where: storeIds ? { storeId: { in: storeIds } } : { revision: { gt: 0 } },
    orderBy: { updatedAt: 'desc' }, ...(storeIds ? {} : { take: limit }),
    select: { storeId: true, revision: true, store: { select: { name: true, merchantId: true } } },
  });
  return projects.map(project => ({
    id: project.storeId, name: `${project.store.name} · r${project.revision} · ${project.storeId.slice(-5)}`,
    load: async () => {
      const version = await prisma.storeSourceVersion.findUniqueOrThrow({ where: { storeId_revision: { storeId: project.storeId, revision: project.revision } }, select: { snapshot: true } });
      const raw = version.snapshot as unknown as SourceProjectSnapshot;
      const snapshot = { ...raw, files: raw.files.map(f => ({ ...f, encoding: f.encoding || 'utf8' as const })) };
      const hydrated = await hydrateUploads(prisma, snapshot, project.store.merchantId);
      // What the public site serves: a store saved before DNA existed gets its seeded DNA.
      return { ...hydrated, files: withSeededDna(hydrated.files, project.storeId) };
    },
  }));
}

async function directoryTargets(root: string): Promise<Target[]> {
  const entries = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).slice(0, limit);
  return entries.map(entry => {
    const dir = existsSync(join(root, entry.name, 'site')) ? join(root, entry.name, 'site') : join(root, entry.name);
    return { id: entry.name, name: entry.name, load: async () => { const snapshot = await snapshotFromDirectory(dir); return { ...snapshot, files: withSeededDna(snapshot.files, entry.name) }; } };
  });
}

async function main() {
  try { process.loadEnvFile(resolve(__dirname, '../.env')); } catch { /* the environment may already be set */ }
  const prisma = fromDir ? null : new PrismaClient();
  try {
    const targets = fromDir ? await directoryTargets(resolve(fromDir)) : await databaseTargets(prisma!);
    await mkdir(join(out, 'screenshots'), { recursive: true });
    const kit = (await collectStoreSample({ id: 'kit-default', name: 'Kit default', snapshot: await kitDefaultSnapshot() }, { screenshots: true }));
    for (const shot of kit.screenshots) await writeFile(join(out, 'screenshots', `kit-default-${shot.name}.jpg`), shot.image);
    console.log(JSON.stringify({ id: 'kit-default', errors: kit.sample.errors }));
    const samples: StoreSample[] = [];
    for (const target of targets) {
      const started = Date.now();
      try {
        const { sample, screenshots } = await collectStoreSample({ id: target.id, name: target.name, snapshot: await target.load() }, { screenshots: true });
        for (const shot of screenshots) await writeFile(join(out, 'screenshots', `${slug(target.name)}-${shot.name}.jpg`), shot.image);
        samples.push(sample);
        console.log(JSON.stringify({ id: target.id, name: target.name, ms: Date.now() - started, errors: sample.errors }));
      } catch (error) {
        console.log(JSON.stringify({ id: target.id, name: target.name, skipped: error instanceof Error ? error.message.split('\n')[0] : String(error) }));
      }
    }
    const score = scoreStores(samples, kit.sample);
    const source = fromDir ? `exported sites in ${fromDir}` : `the local database (latest revision of ${storeIds ? 'the chosen stores' : `the ${limit} most recently updated stores`}; seeded DNA applied as the public site serves it)`;
    await writeFile(join(out, 'scorecard.json'), JSON.stringify({ createdAt: new Date().toISOString(), source, kitDefault: kit.sample, samples, score }, null, 2) + '\n');
    await writeFile(join(out, 'SCORECARD.md'), scorecardMarkdown(score, { title: `Uniqueness and quality scorecard — ${today}`, source, createdAt: today }));
    console.log(`wrote ${join(out, 'SCORECARD.md')}`);
  } finally { await prisma?.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Scorecard failed'); process.exitCode = 1; });
