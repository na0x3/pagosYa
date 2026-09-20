import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildGallery, families, dist } from './build.mjs';
import { createGalleryServer } from './server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(root, 'apps/api/package.json'));
const { chromium } = require('playwright');
const { build } = require('esbuild');
await buildGallery();
const server = createGalleryServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const viewport of [{ width: 1440, height: 960 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const family of families) {
      await page.goto(`${origin}/${family}/`);
      await page.locator('[data-product-add]').first().waitFor();
      await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
      assert.equal(await page.locator('h1').count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${family} overflow at ${viewport.width}`);
      assert(await page.locator('.ui-hero__media img,.ui-floating__stage img,.ui-video-hero__media img,.ui-scroll-hero__media img').evaluateAll(images => images.length > 0 && images.every(image => image.naturalWidth > 0)), `${family} unloaded hero image`);
      await page.screenshot({ path: join(dist, `${family}-${viewport.width}.png`), fullPage: false });
      if (family === 'beauty-editorial') {
        const range = page.getByRole('slider');
        await range.focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await range.inputValue(), '51');
        await page.keyboard.press('Home'); assert.equal(await range.inputValue(), '0');
        await page.keyboard.press('End'); assert.equal(await range.inputValue(), '100');
        await range.fill('37');
        assert.equal(await range.getAttribute('aria-valuetext'), '37% Estudio, 63% Ambiente');
        const box = await range.boundingBox();
        await page.mouse.click(box.x + box.width * .25, box.y + box.height / 2);
        assert(Number(await range.inputValue()) < 35, 'comparison pointer input did not update');
      }
      const first = page.locator('.ui-card__name [data-product-link]').first();
      await first.click();
      await page.locator('.product-detail__photo').waitFor();
      assert(await page.locator('.product-detail__photo').evaluate(image => image.naturalWidth > 0 || !image.complete));
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1); }).slice(0, 12).map(element => ({ tag: element.tagName, className: element.className, width: element.getBoundingClientRect().width, right: element.getBoundingClientRect().right })));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${family} product overflow at ${viewport.width}: ${JSON.stringify(overflow)}`);
      await page.screenshot({ path: join(dist, `${family}-product-${viewport.width}.png`), fullPage: false });
      if (family !== 'cafe-expressive') {
        assert.equal(await page.locator('.product-detail__photo').evaluate(image => getComputedStyle(image).objectFit), 'contain');
        await page.locator('[data-product-image="1"]').click();
        assert.equal(await page.locator('[data-product-image="1"]').getAttribute('aria-pressed'), 'true');
        const selectedThumb = await page.locator('[data-product-image="1"]').boundingBox();
        assert(selectedThumb.width >= 44 && selectedThumb.height >= 44, 'selected photo target must remain usable');
      }
      await page.locator('[data-product-quantity="1"]').click();
      assert.equal(await page.locator('[data-product-quantity-value]').textContent(), '2');
      await page.locator('.product-detail__buy[data-add]').click();
      await page.locator('[data-cart-open]').first().click();
      await page.locator('[data-checkout]').click();
      await page.locator('[data-pay]').click();
      await page.locator('[data-finish-demo]').click();
      await page.getByText('Prueba completada', { exact: false }).first().waitFor();
      report.push({ family, width: viewport.width, commerce: 'passed', screenshots: `${family}-${viewport.width}.png` });
    }
    assert.deepEqual(errors, [], 'browser errors');
    await context.close();
  }

  // Test the actual kit component with a deliberately missing video: no autoload under reduced motion,
  // native play controls remain available, and a load failure preserves the poster without a broken player.
  await mkdir(join(dist, 'media-test'), { recursive: true });
  await build({ stdin: { contents: `import { createRoot } from 'react-dom/client'; import { VideoHero, FloatingMedia, StoreTheme } from '@pagosya/ui'; createRoot(document.getElementById('app')).render(<StoreTheme tokens={{paper:'#fff',ink:'#111',accent:'#145534'}}><main id="contenido"><VideoHero src="/missing-video.mp4" poster={{src:'/product-cinematic/assets/scene-manta.webp',alt:'Poster'}} title="Video test"/><FloatingMedia title="Floating test" images={[{src:'/cafe-expressive/assets/breakfast.webp',alt:'Breakfast'}]}/></main></StoreTheme>);`, loader: 'tsx', resolveDir: root }, bundle: true, outfile: join(dist, 'media-test/app.js'), format: 'iife', platform: 'browser', jsx: 'automatic', nodePaths: [join(root, 'apps/api/node_modules')], alias: { '@pagosya/ui': join(root, 'packages/storefront-kit/kit/ui.tsx') }, define: { 'process.env.NODE_ENV': '"production"' } });
  await writeFile(join(dist, 'media-test/index.html'), '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="app"></div><script src="app.js"></script></body></html>');
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 960 } });
  const page = await reduced.newPage();
  const videoRequests = [];
  page.on('request', request => { if (request.url().includes('missing-video')) videoRequests.push(request.url()); });
  await page.goto(`${origin}/media-test/`);
  await page.getByRole('button', { name: 'Reproducir video' }).waitFor();
  assert.equal(await page.locator('video').count(), 0, 'reduced motion must render poster without video');
  assert.equal(videoRequests.length, 0, 'reduced motion must avoid a video request');
  assert.equal(await page.locator('.ui-floating__item').evaluate(element => getComputedStyle(element).transform), 'none');
  await page.getByRole('button', { name: 'Reproducir video' }).click();
  await page.waitForFunction(() => !document.querySelector('.ui-video-hero__control'));
  assert.equal(await page.getByAltText('Poster').evaluate(image => image.naturalWidth > 0), true);
  assert.equal(await page.locator('video').count(), 0, 'failed video must leave a usable poster');
  await reduced.close();
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const touchPage = await touch.newPage();
  await touchPage.goto(`${origin}/beauty-editorial/`);
  const range = touchPage.getByRole('slider');
  await range.scrollIntoViewIfNeeded();
  const box = await range.boundingBox();
  await touchPage.touchscreen.tap(box.x + box.width * .75, box.y + box.height / 2);
  assert(Number(await range.inputValue()) > 65, 'native comparison must support touch');
  await touch.close();
  console.log(JSON.stringify({ stores: report, mediaFallback: 'passed', reducedMotion: 'passed', comparisonKeyboardPointerTouch: 'passed' }, null, 2));
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
}
