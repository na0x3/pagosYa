import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

// Owner 2026-10-22: the hand-built goodProtein had floating packs, rising bubbles and a spinning sticker; YAPI had no tested
// pieces to reach for. The kit animates data-pya-motion; reduced motion, the cart and checkout always stay still.
const kit = readFileSync(kitPath('commerce.js'), 'utf8');
const dot = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body>
<img id="float" data-pya-motion="float" src="${dot}" width="40" height="40">
<img id="slow" data-pya-motion="float" data-pya-motion-speed="slow" src="${dot}" width="40" height="40">
<span id="spin" data-pya-motion="spin">sello</span><div id="bubbles" data-pya-motion="bubbles" style="height:200px"></div>
<p id="marquee" data-pya-motion="marquee"><span>PROTEÍNA · </span><span>PROTEÍNA · </span></p>
<nav><img id="innav" data-pya-motion="float" src="${dot}"></nav>
<script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'm', data: { storeName: 'M', items: [] } })}</script><script>${kit}</script></body></html>`;

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`motion pieces ${reducedMotion === 'reduce' ? 'stay still with reduced motion' : 'animate'}`, async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion });
  const page = await context.newPage();
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto('https://kit.test/');
  for (const id of ['float', 'spin', 'marquee']) {
    const name = await page.locator(`#${id}`).evaluate(el => getComputedStyle(el).animationName);
    if (reducedMotion === 'reduce') expect(name, id).toBe('none'); else expect(name, id).not.toBe('none');
  }
  // The cart, checkout, header and nav share one rule; the kit redraws the cart panel, so the nav carries the check.
  expect(await page.locator('#innav').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  expect(await page.locator('#bubbles i').count()).toBe(reducedMotion === 'reduce' ? 0 : 8);
  if (reducedMotion === 'no-preference') expect(await page.locator('#slow').evaluate(el => getComputedStyle(el).animationDuration)).toBe('8s');
  await context.close();
});
