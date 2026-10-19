import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { assembleTemplateRevision, templateDemoPublicStore, templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

jest.setTimeout(240_000);
const manifest = templateManifest('esencial')!;
const prepare = (assembled: { files: any[]; brief: any; label: string }) => new SourceProjectsService({} as any).prepare({ revision: 0, ...assembled });
const readAt = (snapshot: any, width: number) => withVisualSandbox(snapshot, '', undefined, false, async context => {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  const read = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, plain: Boolean(document.querySelector('.es-hero--plain')) }));
  await page.close();
  return read;
});
const assemble = (publicStore: any, extra: Record<string, unknown> = {}) => assembleTemplateRevision({ manifest, source: templateSourceFiles('esencial'), storeId: 's1', slug: 's1', publicStore, apiUrl: new URL('https://api.pagosya.test/v1'), firstRevision: true, ...extra });

describe('Esencial', () => {
  it('every font pair uses catalogued OFL fonts', () => {
    for (const pair of manifest.master!.fonts) for (const id of [pair.heading, pair.body]) expect(SOURCE_FONT_CATALOG.some(font => font.id === id)).toBe(true);
  });

  it('renders with no products and no hero photo, without demo photos', async () => {
    const assembled = await assemble({ ...templateDemoPublicStore(), items: [] }, { demoPhotos: false });
    expect(assembled.files.some(file => file.path.startsWith('assets/template-esencial-'))).toBe(false);
    const read = await readAt(await prepare(assembled), 390);
    expect(read.plain).toBe(true);
    expect(read.overflow).toBeLessThanOrEqual(0);
  });

  it('long name and headline fit a phone', async () => {
    const assembled = await assemble({ ...templateDemoPublicStore(), storeName: 'Mochilas y Accesorios de Cuero Artesanal Hechos a Mano en Sucre' },
      { fill: { copy: { headline: 'Mochilas de cuero artesanal hechas a mano para toda la vida en Bolivia' } } });
    const snapshot = await prepare(assembled);
    for (const width of [390, 768, 1280]) expect((await readAt(snapshot, width)).overflow).toBeLessThanOrEqual(0);
  });

  it('carries the chosen pair into the theme block and the kit DNA', async () => {
    const assembled = await templateDemoRevision(manifest, templateSourceFiles('esencial'), { look: { palette: 'sage', fonts: 'literary' } });
    const snapshot = await prepare(assembled);
    expect(assembled.files.find(f => f.path === 'styles/globals.css')!.content).toContain('assets/newsreader.ttf');
    expect(assembled.files.find(f => f.path === 'config.js')!.content).toContain('"display":"newsreader"');
    expect(snapshot.files.some((f: { path: string }) => f.path === 'assets/hanken-grotesk.ttf')).toBe(true);
  });
});
