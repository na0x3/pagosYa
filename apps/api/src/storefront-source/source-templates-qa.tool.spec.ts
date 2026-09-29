/**
 * Offline QA of the Plantillas: every template applied to three store shapes (demo store, one product, one product with
 * a very long name / large price / tall portrait photo), opened at 1280 and 390 wide: home, first product page, then the
 * cart (empty and with the product). Same offline sandbox as the publish checks. A tool, not a test: skipped unless asked.
 *   QA_TEMPLATES=1 npx jest source-templates-qa.tool   (optionally TEMPLATE_IDS=bolso,brote)
 * Screenshots go to QA_OUT (default: the OS temp dir), never into the repo.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import type { Page } from 'playwright';
import { listTemplates, templateSourceFiles } from '@pagosya/store-templates';
import { templateDemoRevision } from './source-templates';
import { SourceProjectsService } from './source-projects.service';
import { withVisualSandbox } from './source-visual-capture';

const run = process.env.QA_TEMPLATES === '1' ? it : it.skip;
const OUT = process.env.QA_OUT || join(tmpdir(), 'pagosya-template-qa');
jest.setTimeout(1_800_000);

const LONG_NAME = 'Mochila de cuero artesanal con bolsillo interior para laptop de 15 pulgadas';
const PORTRAIT = 'assets/qa-portrait.jpg';
type Variant = 'demo' | 'single' | 'long';
const VARIANTS: Variant[] = ['demo', 'single', 'long'];

/** Edit config.js's catalog the way templateDemoRevision does. */
function withCatalog(files: { path: string; content: string; encoding?: string }[], variant: Variant, portrait: Buffer) {
  const out = files.map(file => {
    if (file.path !== 'config.js') return file;
    const config = JSON.parse(file.content.match(/^window\.PAGOSYA_CONFIG = ([\s\S]*);\n$/)![1]);
    config.demo = true; // simulated checkout, and add-to-cart without a backend
    if (variant !== 'demo') config.data.items = config.data.items.slice(0, 1);
    if (variant === 'long') config.data.items[0] = { ...config.data.items[0], name: LONG_NAME, amount: 1_250_000, imageUrls: [PORTRAIT] };
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};\n` };
  });
  if (variant === 'long') out.push({ path: PORTRAIT, content: portrait.toString('base64'), encoding: 'base64' });
  return out;
}

const settle = async (page: Page) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (const img of Array.from(document.images)) img.loading = 'eager';
    await Promise.all(Array.from(document.images).map(img => img.complete ? (img.naturalWidth ? img.decode().catch(() => {}) : undefined) : new Promise(done => { img.addEventListener('load', done, { once: true }); img.addEventListener('error', done, { once: true }); setTimeout(done, 4000); })));
  });
  await page.waitForTimeout(500);
};

const measure = (page: Page) => page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
  missingImages: Array.from(document.images).filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!i.complete || !i.naturalWidth); }).map(i => i.getAttribute('src') || '').slice(0, 5),
  invalid: Object.keys(document.documentElement.dataset).filter(key => /invalid/i.test(key)),
}));

run('QA of the Plantillas at 390 and 1280', async () => {
  const wanted = process.env.TEMPLATE_IDS?.split(',').filter(Boolean);
  const failures: string[] = [];
  const log: string[] = [];
  for (const manifest of listTemplates().filter(t => !wanted || wanted.includes(t.id))) {
    const source = templateSourceFiles(manifest.id);
    const demo = await templateDemoRevision(manifest, source);
    const product = demo.files.find(f => f.path === `assets/template-${manifest.id}-p1.jpg`);
    if (!product) throw new Error(`${manifest.id}: no p1 demo photo`);
    const portrait = await sharp(Buffer.from(product.content, 'base64')).resize(600, 1200, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
    for (const variant of VARIANTS) {
      const snapshot = await new SourceProjectsService({} as any).prepare({ revision: 0, ...demo, files: withCatalog(demo.files, variant, portrait) as any });
      const dir = join(OUT);
      mkdirSync(dir, { recursive: true });
      await withVisualSandbox(snapshot, '', undefined, true, async context => {
        for (const width of [1280, 390]) {
          const tag = `${manifest.id}-${variant}-${width}`;
          const problems: string[] = [];
          const page = await context.newPage();
          page.on('dialog', d => { void d.dismiss(); });
          const errors: string[] = [];
          page.on('pageerror', e => errors.push(e.message));
          page.setDefaultTimeout(6000);
          await page.setViewportSize({ width, height: 900 });
          const check = async (where: string) => {
            const m = await measure(page);
            if (m.scrollWidth !== width) problems.push(`${where}: scrollWidth ${m.scrollWidth} != ${width}`);
            if (m.missingImages.length) problems.push(`${where}: missing images ${m.missingImages.join(', ')}`);
            if (m.invalid.length) problems.push(`${where}: invalid flags ${m.invalid.join(', ')}`);
          };
          const shot = (name: string, fullPage: boolean) => page.screenshot({ path: join(dir, `${name}.png`), fullPage, animations: 'disabled' });
          try {
            // Home
            await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
            await settle(page);
            await check('index');
            await shot(tag, true);
            // Empty cart
            const openCart = async () => {
              const trigger = page.locator('[data-cart-open]:visible').first();
              if (await trigger.count()) await trigger.click(); else await page.evaluate(() => (document.querySelector('[data-cart-open]') as HTMLElement | null)?.click());
              await page.locator('dialog.cart-drawer[open]').waitFor();
              await page.waitForTimeout(500);
            };
            const cartState = () => page.evaluate(() => {
              const drawer = document.querySelector('dialog.cart-drawer');
              const panel = drawer?.querySelector('[data-cart-panel]');
              const visibleText = (root: Element) => Array.from(root.querySelectorAll('*')).filter(el => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !el.children.length && (el.textContent || '').trim().length > 6; }).map(el => (el.textContent || '').trim().replace(/\s+/g, ' '));
              const texts = panel ? visibleText(panel) : [];
              const all = (panel?.textContent || '').replace(/\s+/g, ' ').trim();
              return { templated: Boolean(panel), kitDefault: Boolean(drawer?.querySelector('.cart-drawer__header') && !panel), texts, dup: texts.filter((t, i) => texts.indexOf(t) !== i), all, invalid: Object.keys(document.documentElement.dataset).filter(k => /invalid/i.test(k)) };
            });
            await openCart();
            let state = await cartState();
            if (!state.templated) problems.push('empty cart: the kit default cart opened, not the template panel');
            if (state.dup.length) problems.push(`empty cart: duplicated text ${JSON.stringify(state.dup)}`);
            if (state.invalid.length) problems.push(`empty cart: invalid flags ${state.invalid.join(', ')}`);
            log.push(`${tag} empty-cart text: ${state.all}`);
            await check('empty cart');
            await shot(`${tag}-cart-empty`, false);
            await page.keyboard.press('Escape');
            // Product page
            await page.goto('https://preview.invalid/product.html?id=demo-1', { waitUntil: 'load' });
            await page.locator('#pagosya-product-title').waitFor();
            await settle(page);
            await check('product');
            await shot(`${tag}-product`, true);
            await page.locator('.product-detail__buy[data-add]').first().scrollIntoViewIfNeeded();
            await page.locator('.product-detail__buy[data-add]').first().click();
            await page.waitForTimeout(600);
            await check('product after add');
            await shot(`${tag}-added`, false);
            await openCart();
            state = await cartState();
            if (!state.templated) problems.push('cart with item: the kit default cart opened, not the template panel');
            if (state.invalid.length) problems.push(`cart with item: invalid flags ${state.invalid.join(', ')}`);
            await check('cart');
            await shot(`${tag}-cart`, false);
          } catch (error) { problems.push(`error: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
          if (errors.length) problems.push(`page errors: ${errors.join(' | ')}`);
          await page.close();
          log.push(`${problems.length ? 'FAIL' : 'PASS'} ${tag}${problems.length ? ' — ' + problems.join('; ') : ''}`);
          for (const problem of problems) failures.push(`${tag}: ${problem}`);
        }
      });
    }
  }
  // eslint-disable-next-line no-console
  console.log(`QA screenshots: ${OUT}\n${log.join('\n')}`);
  expect(failures).toEqual([]);
});
