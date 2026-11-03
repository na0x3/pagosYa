import { listTemplates, templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { resolvePresetTemplate, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

jest.setTimeout(120_000);
async function unicoHome(mood?: 'colourful' | 'calm') {
  const manifest = listTemplates().find(entry => entry.id === 'unico')!;
  const resolved = resolvePresetTemplate(manifest, templateManifest);
  const preset = mood ? { ...resolved.preset, variants: { ...(resolved.preset as any).variants, mood } } : resolved.preset;
  const assembled = await templateDemoRevision(resolved.manifest, templateSourceFiles(resolved.manifest.id), preset as never);
  // The demo's hero names no product (a real store's fill always sets it): give it the demo catalogue's first product.
  const config = assembled.files.find(file => file.path === 'config.js')!.content;
  const first = JSON.parse(config.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/)![1]).data.items[0].id as string;
  const files = assembled.files.map(file => file.path === 'components/store-data.tsx' ? { ...file, content: file.content.replace('"type":"product-hero",', `"type":"product-hero","product":${JSON.stringify(first)},`) } : file);
  const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled, files });
  // The page as a shopper gets it: rendered offline in the sandbox YAPI's own checks use.
  return withVisualSandbox(snapshot, '', undefined, false, async context => {
    const page = await context.newPage();
    await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
    await page.waitForSelector('.es');
    const html = await page.content();
    await page.close();
    return html;
  });
}

describe('Único lively home (spec 2026-11-03)', () => {
  it('is lively, calm by default, with pills, hotspots and the chip band', async () => {
    const html = await unicoHome();
    expect(html).toContain('data-pya-lively=""');
    expect(html).toContain('data-es-mood="calm"');
    expect(html).toMatch(/data-product-pills="\[&quot;/);
    expect(html.match(/class="lb-hotspots__pin"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/class="lb-chips__row"[^>]*data-pya-motion="marquee"/g)).toHaveLength(2);
    expect(html).not.toContain('es-logo__letters');
  });
  it('spells the name in letters in the colourful mood', async () => {
    const html = await unicoHome('colourful');
    expect(html).toContain('data-es-mood="colourful"');
    expect(html).toContain('es-logo__letters');
  });
});
