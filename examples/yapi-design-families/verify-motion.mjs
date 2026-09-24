import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildGallery, dist } from './build.mjs';
import { createGalleryServer } from './server.mjs';

const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { chromium } = require('playwright');
const { build } = require('esbuild');
await buildGallery();
const server = createGalleryServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const results = [];
const replay = page => page.evaluate(() => { scrollTo(0, 0); dispatchEvent(new CustomEvent('pagosya:replay-motion')); });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/cafe-expressive/`);
    await page.locator('.ui-overlay-trigger').waitFor();
    await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
    let smoothTail = [];
    if (width > 759) {
      await page.waitForFunction(() => document.documentElement.dataset.pagosyaSmoothScroll === 'on');
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.mouse.wheel(0, 620);
      smoothTail = await page.evaluate(async () => {
        const samples = [];
        for (let index = 0; index < 10; index++) { await new Promise(resolve => requestAnimationFrame(resolve)); samples.push(scrollY); }
        return samples;
      });
      assert(new Set(smoothTail.map(value => Math.round(value))).size >= 3, 'soft scroll must continue across animation frames');
      assert(smoothTail.at(-1) > smoothTail[0], 'soft scroll must advance toward the wheel target');
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForFunction(() => scrollY === 0);
    }
    const row = await page.locator('.ui-header').evaluate(el => ['.ui-overlay-trigger','.ui-brand','.ui-header__tools'].map(selector => { const r = el.querySelector(selector).getBoundingClientRect(); return r.top + r.height / 2; }));
    assert(Math.max(...row) - Math.min(...row) < 2, 'menu, brand and cart share one header row');
    await replay(page);
    await page.locator('.ui-entrance').waitFor();
    const frames = await page.evaluate(async () => {
      const nodes = [...document.querySelectorAll('.ui-entrance__veil,.ui-entrance__mark,.ui-entrance__signature path')];
      const animations = nodes.map(node => node.getAnimations()[0]);
      animations.forEach(animation => animation.pause());
      const frames = [];
      for (const time of [0, 350, 750]) {
        animations.forEach(animation => animation.currentTime = time);
        await new Promise(resolve => requestAnimationFrame(resolve));
        frames.push(nodes.map(node => ({ opacity: getComputedStyle(node).opacity, transform: getComputedStyle(node).transform, strokeDashoffset: getComputedStyle(node).strokeDashoffset })));
      }
      animations.forEach(animation => animation.play());
      return frames;
    });
    assert.notEqual(frames[0][0].opacity, frames[2][0].opacity, 'veil must reveal the page');
    assert.notEqual(frames[0][1].strokeDashoffset, frames[2][1].strokeDashoffset, 'brand signature must draw');
    await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
    await replay(page); await page.locator('.ui-entrance').waitFor();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.ui-entrance').count(), 0, 'keyboard cancels decorative entrance');
    const trigger = page.locator('.ui-overlay-trigger');
    await trigger.focus(); await page.keyboard.press('Enter');
    assert.equal(await page.locator('dialog[open]').count(), 1);
    if (width > 759) await page.waitForFunction(() => !document.documentElement.dataset.pagosyaSmoothScroll);
    assert.equal(await page.locator('.ui-overlay-menu').evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length), 0, 'keyboard menu is immediate');
    for (let n = 0; n < 5; n++) {
      await page.keyboard.press('Tab');
      assert(await page.evaluate(() => document.activeElement === document.body || document.querySelector('.ui-overlay-menu').contains(document.activeElement)), 'native modal prevents focus reaching background controls');
    }
    await page.screenshot({ path: join(dist, `motion-menu-${width}.png`) });
    await page.keyboard.press('Escape');
    assert(await trigger.evaluate(el => el === document.activeElement), 'focus returns to menu trigger');
    if (width > 759) await page.waitForFunction(() => document.documentElement.dataset.pagosyaSmoothScroll === 'on');
    await trigger.click();
    await page.getByRole('link', { name: 'Nuestra mirada' }).click();
    assert.equal(await page.locator('dialog[open]').count(), 0);
    await page.waitForFunction(() => scrollY > 0);
    const parallax = page.locator('[data-ui-parallax]').first();
    const samples = [];
    for (const fraction of [.15, .75]) {
      await parallax.evaluate((el, fraction) => scrollTo(0, el.getBoundingClientRect().top + scrollY - innerHeight * fraction), fraction);
      await page.waitForTimeout(80);
      samples.push(await parallax.evaluate(el => ({ outer: getComputedStyle(el).transform, inner: getComputedStyle(el.firstElementChild).transform })));
    }
    assert(samples.every(sample => sample.outer === 'none'), 'parallax measuring wrapper must stay stable');
    if (width > 759) assert.notEqual(samples[0].inner, samples[1].inner, 'parallax must track scroll');
    else assert(samples.every(sample => sample.inner === 'none'), 'mobile parallax is static');
    const reveal = page.locator('[data-ui-reveal]');
    await reveal.scrollIntoViewIfNeeded(); await page.waitForTimeout(850);
    await page.evaluate(() => scrollTo(0, 0)); await reveal.scrollIntoViewIfNeeded();
    assert.equal(await reveal.evaluate(el => el.getAnimations().filter(a => a.playState === 'running').length), 0, 'reveal does not repeat');
    await replay(page); await page.locator('.ui-entrance').waitFor();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.ui-entrance:visible').count(), 0, 'reduced preference removes running entrance');
    await replay(page);
    assert.equal(await page.locator('.ui-entrance:visible').count(), 0);
    assert.equal(await parallax.evaluate(el => getComputedStyle(el.firstElementChild).transform), 'none', 'reduced preference removes parallax');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto(`${origin}/cafe-expressive/?motion=off`);
    await page.locator('.ui-overlay-trigger').waitFor();
    await replay(page);
    assert.equal(await page.locator('.ui-entrance').count(), 0, 'off never mounts entrance');
    assert.equal(await page.locator('[data-ui-entrance-group]').evaluate(el => el.getAnimations({ subtree: true }).length), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no narrow overflow');
    assert.deepEqual(errors, []);
    results.push({ width, frames, parallax: samples, smoothTail, passed: true });
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}/product-cinematic/`);
  await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
  await page.waitForFunction(() => document.documentElement.dataset.uiScroll === 'cinematic');
  await page.waitForFunction(() => document.documentElement.dataset.pagosyaSmoothScroll === 'on');
  await replay(page); await page.locator('.ui-entrance').waitFor();
  const curtain = await page.locator('.ui-entrance__veil').evaluate(async el => {
    const animation = el.getAnimations()[0]; animation.pause(); animation.currentTime = 400;
    await new Promise(resolve => requestAnimationFrame(resolve));
    const transform = getComputedStyle(el).transform; animation.play(); return transform;
  });
  assert.notEqual(curtain, 'none', 'curtain travels rather than merely fading');
  await page.keyboard.press('Tab');
  await page.goto(`${origin}/cafe-expressive/`);
  await page.locator('.ui-overlay-trigger').waitFor();
  await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
  await replay(page); await page.locator('.ui-entrance').waitFor();
  await page.locator('.ui-entrance').evaluate(async el => {
    el.getAnimations({ subtree: true }).forEach(animation => { animation.pause(); animation.currentTime = 350; });
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.screenshot({ path: join(dist, 'motion-entrance-1440.png') });
  await page.mouse.wheel(0, 300);
  await page.waitForFunction(() => !document.querySelector('.ui-entrance'));
  await page.waitForFunction(() => scrollY > 0);
  await page.evaluate(() => dispatchEvent(new CustomEvent('pagosya:replay-motion')));
  assert.equal(await page.locator('.ui-entrance').count(), 0, 'replay never covers a scrolled page');
  await page.close();

  const commercePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await commercePage.goto(`${origin}/product-cinematic/product.html?id=manta`);
  await commercePage.locator('[data-pagosya-product-page]').waitFor();
  assert.equal(await commercePage.evaluate(() => document.documentElement.dataset.pagosyaSmoothScroll || ''), '', 'product page keeps native scrolling');
  await commercePage.goto(`${origin}/product-cinematic/checkout.html`);
  await commercePage.locator('[data-pagosya-checkout-page]').waitFor();
  assert.equal(await commercePage.evaluate(() => document.documentElement.dataset.pagosyaSmoothScroll || ''), '', 'checkout keeps native scrolling');
  await commercePage.close();

  // Exercise real server rendering and a browser with JavaScript disabled.
  const compiled = await build({
    stdin: { contents: `import {renderToString} from 'react-dom/server'; import {StoreTheme,PageEntrance,EntranceGroup,Parallax,Reveal,SiteHeader} from '@pagosya/ui'; export const html=renderToString(<StoreTheme tokens={{paper:'#fff',ink:'#222',accent:'#b33'}}><PageEntrance/><SiteHeader name="Aroma" menu="overlay" links={[{href:'#story',label:'Historia'}]}/><EntranceGroup><h1>Visible sin JavaScript</h1><p>Contenido real</p></EntranceGroup><Parallax><p>Fotografía estática</p></Parallax><Reveal><p id="story">Una historia</p></Reveal></StoreTheme>);`, loader: 'tsx', resolveDir: new URL('../../apps/api/', import.meta.url).pathname },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom/server', 'react/jsx-runtime', 'motion/react', 'lenis'], alias: { '@pagosya/ui': new URL('../../packages/storefront-kit/kit/ui.tsx', import.meta.url).pathname },
  });
  const exported = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, exported, exported.exports);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await context.newPage();
  await staticPage.setContent(exported.exports.html);
  assert(await staticPage.getByRole('heading', { name: 'Visible sin JavaScript' }).isVisible());
  assert(await staticPage.getByText('Una historia', { exact: true }).isVisible());
  assert.equal(await staticPage.locator('.ui-entrance').count(), 0);
  await staticPage.locator('summary').click();
  assert(await staticPage.getByRole('link', { name: 'Historia', exact: true }).isVisible());
  await context.close();
  results.push({ curtain, serverRenderedNoJavaScript: true, scrolledReplay: 'skipped' });
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(join(dist, 'motion-report.json'), JSON.stringify(results, null, 2) + '\n');
console.log(`Motion, interruption, replay, menu keyboard/focus, parallax, once reveal, off/reduced: passed at 1440, 390, 320px. Curtain, scrolled replay and server-rendered no-JavaScript fallback passed.`);
