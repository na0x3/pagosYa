// apps/api/scripts/one-look-check.ts
/**
 * One look per store (spec 2026-10-14), success criteria 1 (coherence) and 2 (uniqueness) on saved stores. READ-ONLY: it
 * reads each store's latest saved revision and renders it offline in the visual sandbox. It never writes, never calls a model.
 *   npx ts-node --transpile-only scripts/one-look-check.ts <storeSlug> [<storeSlug> ...]
 */
import { PrismaClient } from '@prisma/client';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import { currentSourceRuntime } from '../src/storefront-source/source-runtime';
import { readLookInPage } from '../src/storefront-source/store-look-measure';
import { lookFromReading, lookUniqueness, patchConfigFile, readConfigFile, sameLook, sanitizeLook, type StoreLook } from '../src/storefront-source/store-look';
import { parseFrameDraw, FRAME_DRAW_FILE } from '../src/storefront-source/design-engine/frame-draw';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

const origin = 'https://preview.invalid';
const radiusCss = (value: unknown) => value === 'pill' ? '999px' : typeof value === 'number' ? `${value}px` : undefined;

async function main() {
  const slugs = process.argv.slice(2);
  if (!slugs.length) throw new Error('usage: one-look-check.ts <storeSlug> [...]');
  const prisma = new PrismaClient();
  const rows: Array<Record<string, unknown>> = [];
  const looks: Array<{ slug: string; look?: StoreLook }> = [];
  try {
    for (const slug of slugs) {
      const store = await prisma.store.findFirst({ where: { slug }, select: { id: true, name: true } });
      const version = store && await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
      if (!store || !version) { rows.push({ slug, error: 'no saved revision' }); continue; }
      const runtime = await currentSourceRuntime(version.snapshot as unknown as SourceProjectSnapshot);
      const config = readConfigFile(runtime.files);
      const saved = sanitizeLook(config.look);
      const id = config.data?.items?.[0]?.id as string | undefined;
      const demo = { ...runtime, files: patchConfigFile(runtime.files, c => ({ ...c, demo: true })) };
      const facts = await withVisualSandbox(demo, '', undefined, true, async context => {
        const page = await context.newPage();
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`${origin}/index.html`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const home = await page.evaluate(readLookInPage);
        let pdp: Record<string, string> | null = null, card: Record<string, string> | null = null;
        if (id) {
          await page.goto(`${origin}/product.html?id=${encodeURIComponent(id)}`, { waitUntil: 'load' });
          await page.waitForSelector('[data-pagosya-product][data-style] [data-part=title]', { timeout: 8000 }).catch(() => undefined);
          pdp = await page.evaluate(() => { const t = document.querySelector('[data-pagosya-product][data-style] [data-part=title]'); const s = t && getComputedStyle(t); return s ? { family: s.fontFamily, weight: s.fontWeight, transform: s.textTransform, touch: Array.from(document.querySelectorAll('style[data-pagosya-kit$="-theme"]')).map(el => (el as HTMLElement).dataset.pagosyaKit ?? '').join(',') } : null; });
        }
        if (runtime.files.some(f => f.path === 'productos.html')) {
          await page.goto(`${origin}/productos.html`, { waitUntil: 'load' });
          await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 8000 }).catch(() => undefined);
          card = await page.evaluate(() => { const img = document.querySelector('[data-pagosya-catalog] .menu-item:not([data-custom-product]) .menu-item__image'); const s = img && getComputedStyle(img); return s ? { radius: s.borderTopLeftRadius, filter: s.filter, shadow: s.boxShadow } : null; });
        }
        return { home, pdp, card };
      });
      const fresh = lookFromReading(facts.home, { treatment: parseFrameDraw(runtime.files.find(f => f.path === FRAME_DRAW_FILE)?.content).photos });
      const heading = saved?.type?.heading;
      const checks = {
        lookSaved: Boolean(saved),
        lookMatchesHome: sameLook(fresh, saved),
        titleFamily: !heading?.family || Boolean(facts.pdp?.family.includes(heading.family)),
        titleWeight: !heading?.weight || facts.pdp?.weight === String(heading.weight),
        titleCase: !heading?.case || facts.pdp?.transform === (heading.case === 'upper' ? 'uppercase' : 'none'),
        cardRadius: !radiusCss(saved?.shape?.photo) || facts.card?.radius === radiusCss(saved?.shape?.photo),
        cardTreatment: !['mono', 'sepia', 'duotone'].includes(saved?.photo?.treatment ?? '') || facts.card?.filter !== 'none',
      };
      rows.push({ slug, store: store.name, revision: version.revision, ...checks, touched: facts.pdp?.touch ?? '' });
      looks.push({ slug, look: saved });
    }
  } finally { await prisma.$disconnect(); }
  console.table(rows);
  // Stores without a saved look have nothing to compare: they are listed apart, never counted as duplicates.
  const { unique, duplicates, lookless } = lookUniqueness(looks);
  for (const [slug, first] of duplicates) console.log(`NOT UNIQUE: ${slug} has the same type/shape/edge/photo combination as ${first}`);
  if (lookless.length) console.log(`No saved look (left out of the uniqueness verdict): ${lookless.join(', ')}`);
  console.log(unique ? `Uniqueness: every store with a look has its own combination (${looks.length - lookless.length} compared).` : 'Uniqueness: FAILED (see above).');
}

main().catch(error => { console.error(error); process.exit(1); });
