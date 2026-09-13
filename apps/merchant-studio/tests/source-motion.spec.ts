import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../../api/src/stores/source-kit/motion.js', import.meta.url), 'utf8');
async function fixture(page: Page, mode = 'subtle') {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setContent(`<style>body{margin:0}header{height:900px}section{min-height:400px}.decoration{height:20px}#authored{animation:pulse 8s infinite}@keyframes pulse{to{opacity:.5}}</style>
    <header><h1>Immediately readable</h1><span id="authored">Authored motion</span></header>
    <main><section><h2 id="reveal">Editorial heading</h2><div id="float" class="decoration" data-motion="float" aria-hidden="true">✦</div><div class="decoration" data-motion="float" aria-hidden="true">✦</div><div id="excess" class="decoration" data-motion="float" aria-hidden="true">✦</div>
    <form data-motion="reveal"><label>Name<input></label><button>Send</button></form>
    <div data-pagosya-checkout><h2 data-motion="reveal">Checkout</h2><button>Pay</button></div></section><section><h2>More content</h2></section></main>`);
  await page.evaluate(mode => {
    (window as any).PAGOSYA_CONFIG = { motion: mode };
    const original = Element.prototype.animate;
    (window as any).motionCalls = [];
    Element.prototype.animate = function (frames, options) {
      (window as any).motionCalls.push({ id: this.id, tag: this.tagName, options });
      return original.call(this, frames, options);
    };
  }, mode);
  await page.addScriptTag({ content: runtime });
}

test('subtle reveals once, leaves initial content visible and keeps forms and checkout still', async ({ page }) => {
  const requests: string[] = []; page.on('request', r => requests.push(r.url()));
  await fixture(page);
  await expect(page.locator('h1')).toHaveCSS('opacity', '1');
  await expect(page.locator('#reveal')).toHaveCSS('opacity', '1');
  await page.locator('#reveal').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).motionCalls.length)).toBe(1);
  expect(await page.evaluate(() => (window as any).motionCalls)).toEqual([{ id: 'reveal', tag: 'H2', options: {duration:220, iterations:1, easing:'cubic-bezier(.23,1,.32,1)'} }]);
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('#reveal').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => (window as any).motionCalls.length)).toBe(1);
  expect(requests).toEqual([]);
});

test('auto retains authored motion without adding platform reveals or floats', async ({ page }) => {
  await fixture(page, 'auto');
  await page.locator('#reveal').scrollIntoViewIfNeeded();
  await expect(page.locator('#authored')).toHaveCSS('animation-name', 'pulse');
  expect(await page.evaluate(() => (window as any).motionCalls)).toEqual([]);
});

for (const mode of ['off', 'reduced', 'keyboard']) {
  test(`${mode} keeps content readable without section animations`, async ({ page }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    await fixture(page, mode === 'off' ? 'off' : 'subtle');
    if (mode === 'keyboard') await page.keyboard.press('Tab');
    await page.locator('#reveal').scrollIntoViewIfNeeded();
    await expect(page.locator('#reveal')).toBeInViewport();
    await expect(page.locator('#reveal')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => (window as any).motionCalls)).toEqual([]);
    if (mode !== 'keyboard') await expect(page.locator('#authored')).toHaveCSS('animation-name', 'none');
  });
}

test('expressive limits decoration to two finite animations and cancels when reduced motion is enabled', async ({ page }) => {
  await fixture(page, 'expressive');
  await page.locator('#reveal').scrollIntoViewIfNeeded();
  await expect.poll(() => page.evaluate(() => (window as any).motionCalls.length)).toBe(3);
  const calls = await page.evaluate(() => (window as any).motionCalls);
  expect(calls.filter((call: any) => call.options.iterations === 2)).toHaveLength(2);
  expect(calls.some((call: any) => call.id === 'excess')).toBe(false);
  expect(calls.find((call: any) => call.id === 'float').options.duration).toBe(2400);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
});
