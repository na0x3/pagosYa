/** Starter dice check (spec 2026-10-24-starter-dice §1): every option of each starter's dice, one at a time, desktop and phone,
 *  over the demo store, into examples/starter-dice/<starter>/<part>-<id>.png. A tool, not a test.
 *   CAPTURE_STARTER_DICE=1 npx jest source-starter-dice.tool --maxWorkers=1   (optionally STARTER_IDS=calle) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listTemplates, templateManifest, templateSourceFiles, type TemplateManifest } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

const run = process.env.CAPTURE_STARTER_DICE === '1' ? it : it.skip;
const OUT = join(__dirname, '../../../../examples/starter-dice');
jest.setTimeout(1_800_000);

run('captures every starter dice option', async () => {
  const wanted = process.env.STARTER_IDS?.split(',').filter(Boolean);
  for (const manifest of listTemplates().filter(m => m.starter?.dice && (!wanted || wanted.includes(m.id)))) {
    const { palettes = [], fonts = [], ...parts } = manifest.starter!.dice!;
    type Option = { name: string; variants: Record<string, string>; palette?: string; fonts?: string };
    const options: Option[] = [
      ...Object.entries(parts).flatMap(([part, ids]) => (ids ?? []).map(id => ({ name: `${part}-${id}`, variants: { [part]: id } }))),
      ...palettes.map(id => ({ name: `palette-${id}`, variants: {}, palette: id })),
      ...fonts.map(id => ({ name: `fonts-${id}`, variants: {}, fonts: id })),
    ];
    mkdirSync(join(OUT, manifest.id), { recursive: true });
    for (const option of options) {
      const forced = { ...manifest, preset: { ...manifest.preset!, variants: { ...manifest.preset!.variants, ...option.variants },
        ...(option.palette ? { palette: option.palette } : {}), ...(option.fonts ? { fonts: option.fonts } : {}) } } as TemplateManifest;
      const resolved = resolvePresetTemplate(forced, templateManifest);
      const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...(await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.sourceId), resolved.preset)) });
      await withVisualSandbox(snapshot, '', undefined, false, async context => {
        for (const [suffix, width, height] of [['', 1280, 1400], ['-phone', 390, 1600]] as const) {
          const page = await context.newPage();
          await page.setViewportSize({ width, height: 900 });
          await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
          await page.evaluate(async () => { await document.fonts.ready; for (const img of Array.from(document.images)) img.loading = 'eager'; });
          await page.waitForTimeout(1200);
          writeFileSync(join(OUT, manifest.id, `${option.name}${suffix}.png`), await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width, height }, animations: 'disabled' }));
          await page.close();
        }
      });
    }
  }
});
