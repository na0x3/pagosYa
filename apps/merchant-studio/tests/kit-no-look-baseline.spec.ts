import { expect, test } from '@playwright/test';
import { openCart, openKitPage } from './kit-look-harness';

// One look per store (spec 2026-10-14): a store without config.look and without touch CSS renders exactly as before.
// The screenshots were recorded on the kit BEFORE the look layer existed; every later kit change must keep them.
const STYLES = ['editorial', 'dense', 'image-led', 'story-led', 'conversion'];
const SHOT = { maxDiffPixelRatio: 0.002, animations: 'disabled' as const };

for (const style of STYLES) test(`no look: ${style} product page is unchanged`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKitPage(page, { style });
  await expect(page).toHaveScreenshot(`no-look-${style}.png`, { ...SHOT, fullPage: true });
});

test('no look: catalog page and cart drawer are unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKitPage(page, { path: 'productos.html', cart: true });
  await expect(page).toHaveScreenshot('no-look-catalog.png', SHOT);
  await openCart(page);
  await expect(page).toHaveScreenshot('no-look-cart.png', SHOT);
});

test('no look: the kit sets no look attribute and no look stylesheet', async ({ page }) => {
  await openKitPage(page, { style: 'dense' });
  expect(await page.evaluate(() => [...document.documentElement.attributes].map(a => a.name).filter(n => n.startsWith('data-look')))).toEqual([]);
  await expect(page.locator('style[data-pagosya-kit="look"]')).toHaveCount(0);
});
