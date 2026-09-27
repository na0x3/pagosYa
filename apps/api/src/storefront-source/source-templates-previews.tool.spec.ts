/**
 * Gallery previews for the Studio's Plantillas: each template applied to the demo store, rendered in the same offline
 * sandbox as the publish checks, saved as apps/merchant-studio/public/plantillas/<id>.webp (desktop, top of the page)
 * and <id>-mobile.webp. A tool, not a test: skipped unless asked for.
 *   CAPTURE_TEMPLATE_PREVIEWS=1 npx jest source-templates-previews.tool   (optionally TEMPLATE_IDS=aurora,cumbre)
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

const run = process.env.CAPTURE_TEMPLATE_PREVIEWS === '1' ? it : it.skip;
const OUT = join(__dirname, '../../../merchant-studio/public/plantillas');
jest.setTimeout(600_000);

run('captures the Plantillas gallery previews', async () => {
  mkdirSync(OUT, { recursive: true });
  const wanted = process.env.TEMPLATE_IDS?.split(',').filter(Boolean);
  for (const manifest of listTemplates().filter(t => !wanted || wanted.includes(t.id))) {
    const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...(await templateDemoRevision(manifest, templateSourceFiles(manifest.id))) });
    await withVisualSandbox(snapshot, '', undefined, false, async context => {
      for (const [suffix, width, height, out] of [['', 1280, 1700, 960], ['-mobile', 390, 844, 390]] as const) {
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 900 });
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForTimeout(400);
        // Catalog photos load lazily; the capture is taller than the viewport, so load and decode every image first.
        await page.evaluate(async () => {
          for (const img of Array.from(document.images)) img.loading = 'eager';
          await Promise.all(Array.from(document.images).map(img => img.complete && img.naturalWidth ? img.decode().catch(() => {}) : new Promise(done => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); setTimeout(done, 4000); })));
        });
        await page.waitForTimeout(300);
        const png = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width, height }, animations: 'disabled' });
        await sharp(png).resize({ width: out }).webp({ quality: 78 }).toFile(join(OUT, `${manifest.id}${suffix}.webp`));
        await page.close();
      }
    });
  }
});
