// apps/api/scripts/store-controls-check.ts
/**
 * Store controls (spec 2026-10-14), live-check criteria 1–4 on saved stores. READ-ONLY on the database: it reads each store's
 * revisions and generation rows and renders the latest revision offline in the visual sandbox to run the controls guard. It never
 * writes to the database and never calls a model. With --shots <dir> it also saves header, card and cart screenshots at 1440 and
 * 390 into that directory, which must be outside the repository.
 *   npx ts-node --transpile-only scripts/store-controls-check.ts [--shots /tmp/controls-shots] <storeSlug> [<storeSlug> ...]
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { SOURCE_REVIEW_LABEL } from '../src/storefront-source/source-background-review';
import { currentSourceRuntime } from '../src/storefront-source/source-runtime';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import { readControls } from '../src/storefront-source/store-controls';
import { cartIconName, controlsUniqueness } from '../src/storefront-source/store-controls-library';
import { guardControlsOnSnapshot, judgeControls } from '../src/storefront-source/store-controls-guard';
import { patchConfigFile } from '../src/storefront-source/store-look';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

type Attempt = { phase?: string; status?: string; durationMs?: number };
const origin = 'https://preview.invalid';
const repository = resolve(__dirname, '..', '..', '..');

/** Header, cards and the open cart at both widths, from the store's own saved revision in demo mode (nothing is ordered). */
async function shots(dir: string, slug: string, snapshot: SourceProjectSnapshot) {
  const runtime = await currentSourceRuntime(snapshot);
  const demo = { ...runtime, files: patchConfigFile(runtime.files, config => ({ ...config, demo: true })) };
  await withVisualSandbox(demo, '', undefined, true, async context => {
    for (const width of [1440, 390]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      await page.screenshot({ path: join(dir, `${slug}-${width}-header.png`) });
      const card = page.locator('[data-pagosya-catalog] .menu-item').first();
      if (await card.count()) {
        await card.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(dir, `${slug}-${width}-cards.png`) });
        await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click().catch(() => undefined);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('header [data-cart-open]').first().click().catch(() => undefined);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(dir, `${slug}-${width}-cart.png`) });
      await page.close();
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const shotsAt = args[0] === '--shots' ? resolve(args[1] ?? '') : undefined;
  const slugs = shotsAt ? args.slice(2) : args;
  if (!slugs.length) throw new Error('usage: store-controls-check.ts [--shots <dir outside the repo>] <storeSlug> [...]');
  if (shotsAt) {
    if (shotsAt.startsWith(repository)) throw new Error('--shots must point outside the repository');
    mkdirSync(shotsAt, { recursive: true });
  }
  const prisma = new PrismaClient();
  const rows: Array<Record<string, unknown>> = [];
  const list: Array<{ slug: string; controls?: unknown }> = [];
  try {
    for (const slug of slugs) {
      const store = await prisma.store.findFirst({ where: { slug }, select: { id: true } });
      if (!store) { rows.push({ slug, error: 'no store' }); continue; }
      const versions = await prisma.storeSourceVersion.findMany({ where: { storeId: store.id }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
      const latest = await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
      const runs = await prisma.storeSourceGeneration.findMany({ where: { storeId: store.id }, orderBy: { createdAt: 'asc' }, select: { status: true, baseRevision: true, revision: true, attempts: true, durationMs: true } });
      // A background review row: its attempts are only review, touch and controls calls.
      const phasesOf = (attempts: unknown) => ((attempts ?? []) as Attempt[]).map(attempt => attempt.phase);
      const reviews = runs.filter(run => { const phases = phasesOf(run.attempts); return phases.length > 0 && phases.every(phase => phase === 'review' || phase === 'touch' || phase === 'controls'); });
      const lastReview = reviews.at(-1);
      const callMs = (phase: string) => ((lastReview?.attempts ?? []) as Attempt[]).filter(attempt => attempt.phase === phase).reduce((sum, attempt) => sum + (attempt.durationMs ?? 0), 0);
      const snapshot = latest?.snapshot as unknown as SourceProjectSnapshot | undefined;
      const controls = snapshot ? readControls(snapshot.files) : undefined;
      const verdict = snapshot && controls ? judgeControls(await guardControlsOnSnapshot(snapshot)) : undefined;
      rows.push({
        slug, revision: latest?.revision ?? null,
        reviewSaved: versions.some(version => version.label === SOURCE_REVIEW_LABEL),
        reviewRow: lastReview ? `${lastReview.status} ${lastReview.baseRevision}->${lastReview.revision ?? '-'}` : 'none',
        stageMs: lastReview?.durationMs ?? null, reviewCallMs: callMs('review'), touchCallMs: callMs('touch'), controlsCallMs: callMs('controls'),
        source: controls?.source ?? 'none', outline: controls?.shape.outline ?? '-', cartIcon: cartIconName(controls?.icons.cart),
        guard: !verdict ? '-' : verdict.drop ? `DROP ${verdict.reasons.slice(0, 2).join('; ')}` : verdict.iconSlots.length ? `icon fallback: ${verdict.iconSlots.join(',')}` : 'pass',
      });
      list.push({ slug, controls });
      if (shotsAt && snapshot) await shots(shotsAt, slug, snapshot);
    }
  } finally { await prisma.$disconnect(); }
  console.table(rows);
  const { unique, duplicates, without } = controlsUniqueness(list);
  for (const [slug, first] of duplicates) console.log(`NOT UNIQUE: ${slug} has the same outline and cart icon as ${first}`);
  if (without.length) console.log(`No controls record (left out of the uniqueness verdict): ${without.join(', ')}`);
  console.log(unique ? `Uniqueness: every store with controls has its own outline and cart icon (${list.length - without.length} compared).` : 'Uniqueness: FAILED (see above).');
  if (shotsAt) console.log(`Screenshots: ${shotsAt}`);
}

main().catch(error => { console.error(error); process.exit(1); });
