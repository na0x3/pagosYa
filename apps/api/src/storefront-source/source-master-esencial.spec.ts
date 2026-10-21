import { templateManifest, templateSourceFiles } from '@pagosya/store-templates';
import { assembleTemplateRevision, refillMasterFiles, templateDemoPublicStore, templateDemoRevision } from './source-templates';
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

  it('the menu variant writes config.js header.menu with the fill groups checked, and the Shell carries the mounts (dropdown menu 2026-10-21)', async () => {
    const variants = { ...Object.fromEntries(Object.entries(manifest.master!.variants!).map(([part, ids]) => [part, (ids as string[])[0]])), menu: 'dropdowns', sections: [] };
    const demo = { ...templateDemoPublicStore(), categories: [{ id: 'k1', name: 'Velas' }, { id: 'k2', name: 'Jabones' }] } as any;
    demo.items = demo.items.map((item: any, index: number) => ({ ...item, categoryId: index % 2 ? 'k2' : 'k1' }));
    const assembled = await assemble(demo, { variants, fill: { menu: { style: 'dropdowns', groups: [{ label: 'Casa', links: [{ to: 'category:k1' }, { to: 'category:inventada' }] }] } } });
    const config = JSON.parse(assembled.files.find((f: any) => f.path === 'config.js')!.content.match(/= ([\s\S]*);\n$/)![1]);
    expect(config.header.menu).toEqual({ style: 'dropdowns', groups: [{ label: 'Casa', links: [{ label: 'Velas', to: 'category:k1' }] }] });
    const none = await assemble(templateDemoPublicStore(), { variants: { ...variants, menu: 'none' } });
    expect(JSON.parse(none.files.find((f: any) => f.path === 'config.js')!.content.match(/= ([\s\S]*);\n$/)![1]).header).toBeUndefined();
    expect(templateSourceFiles('esencial').find(f => f.path === 'components/Shell.tsx')!.content).toContain('data-pagosya-store-menu="toggle"');
  });

  it('the catalogue and collection pages are the store\'s own, with its header, menu, footer and fonts (spec 2026-10-21 amendment)', async () => {
    const assembled = await assemble(templateDemoPublicStore());
    const page = (path: string) => assembled.files.find((f: any) => f.path === path)?.content ?? '';
    expect(page('productos.html')).not.toContain('commerce-header');
    expect(page('coleccion.html')).not.toContain('commerce-header');
    const snapshot = await prepare(assembled);
    const read = (path: string) => withVisualSandbox(snapshot, '', undefined, false, async context => {
      const tab = await context.newPage();
      await tab.goto(`https://preview.invalid/${path}`, { waitUntil: 'load', timeout: 12000 });
      const found = await tab.evaluate(() => ({ header: Boolean(document.querySelector('.es-header [data-pagosya-store-menu="toggle"]')), footer: Boolean(document.querySelector('.es-footer')),
        catalog: Boolean(document.querySelector('[data-pagosya-catalog][data-catalog-full]')), collection: Boolean(document.querySelector('[data-collection-page]')), title: document.querySelector('h1')?.textContent ?? '' }));
      await tab.close();
      return found;
    });
    expect(await read('productos.html')).toMatchObject({ header: true, footer: true, catalog: true, collection: false, title: 'Todos los productos' });
    expect(await read('coleccion.html')).toMatchObject({ header: true, footer: true, catalog: true, collection: true });
  });

  it('an older store whose snapshot still has the kit catalogue page gets the store\'s own at its next refill — Review Focus 4', async () => {
    const assembled = await assemble(templateDemoPublicStore());
    const kitPage = '<!doctype html><html><body class="commerce-document"><header class="commerce-header"></header><main data-pagosya-catalog data-catalog-full></main></body></html>';
    const older = assembled.files.filter((f: any) => !/^components\/page-(productos|coleccion)\.tsx$/.test(f.path)).map((f: any) => f.path === 'productos.html' || f.path === 'coleccion.html' ? { ...f, content: kitPage } : f);
    const refilled = refillMasterFiles(older, manifest, { copy: { headline: 'Otra' } });
    expect(refilled.some((f: any) => f.path === 'components/page-productos.tsx')).toBe(true);
    const snapshot = await prepare({ ...assembled, files: refilled });
    expect(snapshot.files.find((f: any) => f.path === 'productos.html')!.content).not.toContain('commerce-header');
    const again = refillMasterFiles(refilled, manifest, { copy: { headline: 'Otra más' } });
    expect(again.filter((f: any) => f.path.startsWith('components/page-')).map((f: any) => f.content)).toEqual(refilled.filter((f: any) => f.path.startsWith('components/page-')).map((f: any) => f.content));
    const own = refilled.map((f: any) => f.path === 'components/page-productos.tsx' ? { ...f, content: f.content.replace('Todos los productos', 'Nuestra colección') } : f);
    expect(refillMasterFiles(own, manifest, {}).find((f: any) => f.path === 'components/page-productos.tsx')!.content).toContain('Nuestra colección');
  });

  it('a build writes the rolled John Smedley sections and their data to store-data (spec 2026-10-21)', async () => {
    const variants = { ...Object.fromEntries(Object.entries(manifest.master!.variants!).filter(([part]) => part !== 'feature').map(([part, ids]) => [part, (ids as string[])[0]])), sections: [] };
    const demo = { ...templateDemoPublicStore(), categories: [{ id: 'k1', name: 'Velas' }, { id: 'k2', name: 'Jabones' }] } as any;
    demo.items = demo.items.map((item: any, index: number) => ({ ...item, categoryId: index % 2 ? 'k2' : 'k1' }));
    const assembled = await assemble(demo, { variants: { ...variants, feature: 'explore' } });
    const data = assembled.files.find((f: any) => f.path === 'components/store-data.tsx')!.content;
    expect(data).toMatch(/"feature":"explore"/);
    expect(JSON.parse(data.match(/^export const features: Record<string, any> = (.*);$/m)![1]).explore.categories).toEqual([{ id: 'k1', name: 'Velas' }, { id: 'k2', name: 'Jabones' }]);
    const rolled = await assemble(templateDemoPublicStore(), { variants });
    expect(rolled.files.find((f: any) => f.path === 'components/store-data.tsx')!.content).toMatch(/"feature":"[a-z,]*"/);
  });

  it('the John Smedley sections render with real text, the explore chip switches the rail, and phones do not overflow (spec 2026-10-21)', async () => {
    const variants = { ...Object.fromEntries(Object.entries(manifest.master!.variants!).filter(([part]) => part !== 'feature').map(([part, ids]) => [part, (ids as string[])[0]])), sections: [] };
    const demo = { ...templateDemoPublicStore(), categories: [{ id: 'k1', name: 'Velas' }, { id: 'k2', name: 'Jabones' }] } as any;
    demo.items = demo.items.map((item: any, index: number) => ({ ...item, categoryId: index % 2 ? 'k2' : 'k1' }));
    const read = async (feature: string, width: number, act = false) => {
      const assembled = await assemble(demo, { variants: { ...variants, feature, header: 'boxed', button: 'dashed', footer: 'column', grid: 'side-title' } });
      const snapshot = await prepare(assembled);
      return withVisualSandbox(snapshot, '', undefined, false, async context => {
        const tab = await context.newPage();
        await tab.setViewportSize({ width, height: 900 });
        await tab.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12000 });
        await tab.waitForTimeout(300);
        if (act) { await tab.click('.es-explore__chips button:nth-child(2)'); await tab.waitForTimeout(200); }
        const out = await tab.evaluate(() => {
          const texts = (selector: string) => Array.from(document.querySelectorAll(selector)).map(el => (el.textContent || '').trim());
          return { duo: texts('.es-duo__title'), duoCtas: texts('.es-duo__cta'), duoLinks: Array.from(document.querySelectorAll('.es-duo__half')).map(a => a.getAttribute('href')),
            exploreTitle: texts('#es-explore-title')[0], rail: document.querySelector('[data-explore-rail]')?.getAttribute('data-category'), colours: Boolean(document.querySelector('.es-explore__colours')),
            capsule: texts('.es-capsule__text')[0], origin: texts('.es-origin__caption')[0], originLink: texts('.es-origin__link')[0],
            emptyButtons: Array.from(document.querySelectorAll('main a.es-btn, main button')).filter(el => !(el.textContent || '').trim() && !el.getAttribute('aria-label')).length,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        await tab.close();
        return out;
      });
    };
    const desktop = await read('duo,explore', 1440, true);
    expect(desktop.duo).toEqual(['Velas', 'Jabones']);
    expect(desktop.duoCtas).toEqual(['Ver ahora', 'Ver colección']);
    expect(desktop.duoLinks).toEqual(['productos.html?f_categoria=k1', 'productos.html?f_categoria=k2']);
    expect(desktop.exploreTitle).toBe('Jabones');
    expect(desktop.rail).toBe('k2');
    expect(desktop.colours).toBe(false);
    expect(desktop.emptyButtons).toBe(0);
    const phone = await read('capsule,origin', 390);
    expect(phone.capsule).toBeTruthy();
    expect(phone.origin).toBeTruthy();
    expect(phone.originLink).toBe('Nuestra historia');
    expect(phone.overflow).toBeLessThanOrEqual(1);
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
