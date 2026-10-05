import { SKETCH_COMPONENT_REGISTRY } from '@pagosya/shared-types';
import { validateNextSources } from '../src/storefront-source/source-next';
import { sketchKitDna } from '../src/storefront-source/sketch/sketch-schema';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';
import { DESIGN_FIXTURES, AFTER_HOURS_FIXTURES, generateDesignFixture } from '../src/storefront-source/design-engine/design-fixtures';
import { assembleSketch } from '../src/storefront-source/sketch';
import { withSourceFonts } from '../src/storefront-source/source-fonts';
import { withSourceIcons } from '../src/storefront-source/source-asset-library';
import { agentPreviewSnapshot } from '../src/storefront-source/agent/agent-capture';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import type { SourceProjectFileDto } from '../src/storefront-source/dto/save-source-project.dto';

export const DEMO_OUTPUT = resolve(__dirname, '../../../examples/yapi-design-engine/dist');
export async function buildDesignDemos(capture = false, afterHours = false, variants = false) {
  const root = resolve(__dirname, '../../..');
  const evidence: Array<{ fixture: string; width: number; scrollWidth: number; viewport: number; headings: number; cards: number; missingImages: number; errors: string[]; mobileMenu: boolean; commerce: boolean; silhouette: string }> = [];
  const fixtures = variants ? SKETCH_COMPONENT_REGISTRY.filter(entry => entry.renderer !== 'legacy').map(entry => {
    const base = AFTER_HOURS_FIXTURES[0];
    return { ...base, id: `${entry.type}-${entry.variant}`, plan: { ...base.plan, sections: base.plan.sections.map(section => section.type === entry.type ? { ...section, composition: entry.variant } : section) } };
  }) : afterHours ? AFTER_HOURS_FIXTURES : DESIGN_FIXTURES;
  const output = variants ? resolve(DEMO_OUTPUT, 'variants') : DEMO_OUTPUT;
  for (const fixture of fixtures) {
    const sketch = generateDesignFixture(fixture.input, fixture.plan);
    if (variants && !sketch.blocks.some(block => `${block.type}-${block.composition}` === fixture.id))
      throw new Error(`Variant benchmark fell back instead of rendering ${fixture.id}`);
    const context = { storeName: fixture.input.store.name, purpose: fixture.input.purpose, photos: fixture.input.assets.map(a => a.path) };
    validateNextSources(assembleSketch(sketch, context).filter(file => file.path !== 'sketch.json' && file.path !== 'website-design.json'));
    const authored = await withSourceFonts(await withSourceIcons(assembleSketch(sketch, context)));
    const media: SourceProjectFileDto[] = await Promise.all(Object.entries(fixture.sources).map(async ([name, path]) => ({ path: `assets/${name}.webp`, encoding: 'base64', content: (await sharp(resolve(root, path)).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()).toString('base64') })));
    const commerce = await readFile(resolve(root, 'packages/storefront-kit/kit/commerce.js'), 'utf8');
    const config = { dna: sketchKitDna(sketch), demo: true, slug: `design-demo-${fixture.id}`, sitePurpose: 'shop', productPage: 'product.html', checkoutPage: 'checkout.html', data: { storeName: fixture.input.store.name, aboutText: fixture.input.store.description, checkoutMode: 'payment', catalogLayout: 'all', newsletterEnabled: fixture.input.newsletterEnabled, categories: fixture.input.categories, items: fixture.input.products, locations: [] } };
    const snapshot = await agentPreviewSnapshot({ brief: { businessType: fixture.input.store.category || 'Shop', audience: 'Demo audience', primaryAction: 'Shop', visualDirection: fixture.input.prompt, sitePurpose: 'shop' }, files: [...media, { path: 'commerce.js', content: commerce }, { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(config)};` }] }, authored);
    const folder = resolve(output, fixture.id);
    for (const file of snapshot.files) {
      const target = resolve(folder, file.path); await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8'));
    }
    await writeFile(resolve(folder, 'sketch.json'), JSON.stringify(sketch, null, 2));
    if (capture) await withVisualSandbox(snapshot, '', undefined, false, async browser => {
      for (const width of [1440, 820, 390]) {
        const page = await browser.newPage();
        const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
        await page.setViewportSize({ width, height: 1000 });
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load' });
        await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(image => { image.loading = 'eager'; return image.decode().catch(() => {}); })); });
        let mobileMenu = true;
        if (width < 900) {
          const summary = page.locator('.skb-menu summary');
          await summary.focus(); await summary.press('Enter');
          mobileMenu = await page.locator('.skb-menu').evaluate(element => element.hasAttribute('open'));
          await summary.press('Enter');
        }
        const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, headings: document.querySelectorAll('h1').length,
          cards: document.querySelectorAll('[data-pagosya-catalog] .menu-item').length, missingImages: Array.from(document.images).filter(i => i.getBoundingClientRect().width && !i.naturalWidth).length }));
        await page.screenshot({ path: resolve(folder, `${width}.png`), fullPage: true, animations: 'disabled' });
        // The exact shared runtime must populate the authored card template and own purchasing.
        const first = page.locator('[data-pagosya-catalog] .menu-item').first();
        const realName = await first.locator('[data-product-field="name"]').textContent();
        const realPrice = await first.locator('[data-product-field="price"]').textContent();
        // The current inspector updates these attributes live; no new product template is required.
        const catalogSection = page.locator('[data-skb-renderer^="catalog-"]').first();
        let inspector = true;
        if (await catalogSection.count()) {
          await catalogSection.evaluate(section => { section.setAttribute('data-skb-card-desc', 'off'); section.setAttribute('data-skb-card-add', 'off'); });
          inspector = !await first.locator('[data-product-add]').isVisible() && !await first.locator('[data-product-field="description"]').isVisible();
          await catalogSection.evaluate(section => { section.setAttribute('data-skb-card-desc', 'on'); section.setAttribute('data-skb-card-add', 'on'); section.style.setProperty('--skb-card-ratio', '1 / 1'); });
          inspector = inspector && await first.locator('[data-product-add]').isVisible() && await first.locator('[data-product-field="description"]').isVisible();
          const ratio = await first.locator('[data-product-media]').evaluate(media => getComputedStyle(media).aspectRatio);
          inspector = inspector && ratio === '1 / 1';
          await catalogSection.evaluate(section => { section.style.removeProperty('--skb-card-ratio'); });
        }
        await first.locator('[data-product-add]').click();
        await page.locator('.skb-header [data-cart-open]').click();
        const cart = page.locator('.cart-drawer[open]');
        await cart.waitFor({ state: 'visible' });
        const cartText = await cart.textContent();
        let commerce = inspector && !!realName && !!realPrice && !!cartText?.includes(realName) && !!cartText?.includes(realPrice) && await page.locator('[data-cart-count]').first().textContent() === '1';
        await cart.locator('[data-add]').first().click();
        commerce = commerce && await page.locator('[data-cart-count]').first().textContent() === '2';
        await cart.locator('[data-remove]').first().click();
        commerce = commerce && await page.locator('[data-cart-count]').first().textContent() === '1';
        await cart.locator('[data-cart-close]').first().click();
        const silhouette = await page.evaluate(() => JSON.stringify(Array.from(document.querySelectorAll('main > [data-skb]')).map(section => ({
          height: Math.round(section.getBoundingClientRect().height / 10),
          media: Array.from(section.querySelectorAll('img')).filter(image => image.getBoundingClientRect().width).map(image => [Math.round(image.getBoundingClientRect().x / 10), Math.round((image.getBoundingClientRect().y - section.getBoundingClientRect().y) / 10), Math.round(image.getBoundingClientRect().width / 10), Math.round(image.getBoundingClientRect().height / 10)])
        }))));
        evidence.push({ fixture: fixture.id, width, ...metrics, errors, mobileMenu, commerce, silhouette });
        await page.close();
      }
    });
    console.log(`Built ${fixture.id}: ${sketch.design?.artDirection.style} · ${sketch.blocks.map(b => `${b.type}/${b.composition}`).join(', ')}`);
  }
  await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yapi design engine demos</title><style>body{font:20px system-ui;background:#eeeae0;color:#1f211e;padding:5vw}a{display:block;padding:2rem;border-bottom:1px solid;color:inherit}p{max-width:60ch}</style><h1>${afterHours ? 'AFTER HOURS: one brand, three compositions.' : 'Three brands. One structured engine.'}</h1><p>Synthetic merchant fixtures rendered by the production boceto assembler. Product content and photos are demo data.</p>${fixtures.map(f => `<a href="${f.id}/index.html">${f.input.store.name} — ${f.id}</a>`).join('')}</html>`);
  await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  const failed = evidence.filter(entry => entry.scrollWidth > entry.viewport + 2 || entry.missingImages || entry.headings !== 1 || entry.cards !== 3 || entry.errors.length || !entry.mobileMenu || !entry.commerce);
  if (afterHours && !variants && capture && new Set(evidence.filter(e => e.width === 1440).map(e => e.silhouette)).size !== 3) throw new Error('AFTER HOURS silhouettes converged');
  if (failed.length) throw new Error(`Visual demo checks failed: ${JSON.stringify(failed)}`);
}
if (require.main === module) buildDesignDemos(process.argv.includes('--capture'), process.argv.includes('--after-hours'), process.argv.includes('--variants')).catch(error => { console.error(error); process.exitCode = 1; });
