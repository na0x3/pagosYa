import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

// The one calm checkout (spec 2026-10-20) keeps its own look whatever the store's stylesheet says.
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LOUD = `h1{font-size:66px;letter-spacing:-.04em;text-transform:uppercase}button{border-radius:999px;background:yellow;color:#000;font-family:Georgia}input,select{background:#111;color:#eee}[data-pagosya-cart] button{border:4px solid hotpink}body{background:#e9d38a}`;
const CONFIG = 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'tostadero', demo: true, data: { storeName: 'Tostadero Yungas', checkoutMode: 'payment', locations: [], categories: [], items: [{ id: 'honey', name: 'Irupana Honey de altura con un nombre muy largo para el teléfono', amount: 14400, currency: 'BOB', stock: 9, imageUrls: [], variants: [], extras: [] }] } }) + ';';
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${LOUD}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><main><h1>Tostadero</h1></main><p data-pagosya-status></p></body></html>`;

async function open(browserPage: any) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart: [{ id: 'honey', quantity: 1 }] }); document.body.append(frame);
  }, { commerce, html, config: CONFIG });
  const shop = browserPage.frameLocator('iframe');
  await expect(shop.locator('main h1')).toBeVisible();
  await shop.locator('body').evaluate(() => { location.hash = 'checkout'; });
  return shop;
}

for (const width of [1440, 390]) test(`the calm checkout ignores a loud store stylesheet at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const shop = await open(page);
  const root = shop.locator('.pya-checkout');
  await expect(root).toBeVisible();
  const h1 = await root.locator('.pya-co__lead h1').evaluate((el: HTMLElement) => ({ size: getComputedStyle(el).fontSize, transform: getComputedStyle(el).textTransform }));
  expect(h1).toEqual({ size: '26px', transform: 'none' });
  const pay = await root.locator('.pya-co__pay').evaluate((el: HTMLElement) => ({ radius: getComputedStyle(el).borderRadius, bg: getComputedStyle(el).backgroundColor }));
  expect(pay).toEqual({ radius: '6px', bg: 'rgb(26, 26, 26)' });
  expect(await root.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  if (width === 390) { await expect(root.locator('.pya-co__summary')).toBeHidden(); await root.locator('[data-shell-summary]').click(); }
  const price = root.locator('.pya-co__line-price').first();
  await expect(price).toBeVisible();
  expect(await price.evaluate((el: HTMLElement) => el.getClientRects().length)).toBe(1);
  expect(await root.evaluate((el: HTMLElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `../../tmp/calm-checkout-${width}.png` });
});
