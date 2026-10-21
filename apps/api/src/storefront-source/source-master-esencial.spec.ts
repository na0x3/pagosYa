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
  it('fashion variants: the kit draws the cards, the product page has the category line and the size guide link', async () => {
    const variants = { ...Object.fromEntries(Object.entries(manifest.master!.variants!).map(([part, ids]) => [part, (ids as string[])[0]])), cards: 'fashion', pdp: 'fashion', sections: ['sizes'] };
    const demo = templateDemoPublicStore();
    const assembled = await assemble(demo, { variants, fill: { sections: [{ id: 'sizes', title: 'Guía de tallas', items: [{ title: 'S', text: '36' }, { title: 'M', text: '38' }] }] } });
    const config = assembled.files.find((f: any) => f.path === 'config.js')!.content;
    expect(config).toContain('"productPageStyle":"fashion"');
    expect(config).toContain('"cards":"fashion"');
    const snapshot = await prepare(assembled);
    // Pages are drawn in the browser from the compiled bundles: read them rendered, home first, then a product in the same page.
    // probe: the sandbox serves product.html?id= documents only to probes.
    const reads = await withVisualSandbox(snapshot, '', undefined, true, async context => {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1280, height: 900 });
      const found = () => page.evaluate(() => ({
        template: Boolean(document.querySelector('template[data-pagosya-product-template]')),
        fashionCards: document.querySelectorAll('.menu-item[data-anatomy=fashion]').length,
        category: document.querySelector('[data-product-slot=category] .product-detail__eyebrow')?.textContent ?? null,
        guide: Boolean(document.querySelector('a.es-pdp__guide[href="index.html#sizes"]')),
      }));
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
      await page.waitForTimeout(400);
      const home = await found();
      await page.goto(`https://preview.invalid/product.html?id=${encodeURIComponent(demo.items[0].id)}`, { waitUntil: 'load', timeout: 12000 });
      await page.locator('#pagosya-product-title').waitFor({ timeout: 8000 });
      const productPage = await found();
      await page.close();
      return { home, productPage };
    });
    expect(reads.home.template).toBe(false);
    expect(reads.home.fashionCards).toBeGreaterThan(0);
    expect(reads.productPage.category).not.toBeNull();
    expect(reads.productPage.guide).toBe(true);
    // Other product pages keep their page as before: no category line under the title (review 2026-10-21).
    const plainVariants = { ...variants, cards: 'compact', pdp: 'gallery-left' };
    const plain = await prepare(await assemble(demo, { variants: plainVariants }));
    const plainCategory = await withVisualSandbox(plain, '', undefined, true, async context => {
      const page = await context.newPage();
      await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
      await page.goto(`https://preview.invalid/product.html?id=${encodeURIComponent(demo.items[0].id)}`, { waitUntil: 'load', timeout: 12000 });
      await page.locator('#pagosya-product-title').waitFor({ timeout: 8000 });
      const found = await page.evaluate(() => Boolean(document.querySelector('[data-product-slot=category]')));
      await page.close();
      return found;
    });
    expect(plainCategory).toBe(false);
  });

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

  it('stores merchant upload paths as full API URLs, so a published store on its own domain still shows them (live check fix)', async () => {
    const assembled = await assemble(templateDemoPublicStore(), { demoPhotos: false, fill: { heroPhoto: '/v1/uploads/a.jpg', storyPhoto: '/v1/uploads/b.jpg' } });
    const data = assembled.files.find(f => f.path === 'components/store-data.tsx')!.content;
    expect(data).toContain('"hero":"https://api.pagosya.test/v1/uploads/a.jpg"');
    expect(data).toContain('"story":"https://api.pagosya.test/v1/uploads/b.jpg"');
  });

  it('carries the chosen pair into the theme block and the kit DNA', async () => {
    const assembled = await templateDemoRevision(manifest, templateSourceFiles('esencial'), { look: { palette: 'sage', fonts: 'literary' } });
    const snapshot = await prepare(assembled);
    expect(assembled.files.find(f => f.path === 'styles/globals.css')!.content).toContain('assets/newsreader.ttf');
    expect(assembled.files.find(f => f.path === 'config.js')!.content).toContain('"display":"newsreader"');
    expect(snapshot.files.some((f: { path: string }) => f.path === 'assets/hanken-grotesk.ttf')).toBe(true);
  });
});
