import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
// Demo catalog only. Highlights here stand for rows a store owner approved.
const highlights = [
  { icon: 'car', label: 'Automático', detail: '5 asientos' },
  { icon: 'fuel', label: 'Gasolina', detail: '1.6 L' },
  { icon: 'gauge', label: '14 km/L', detail: 'Ciudad' },
  { icon: 'shield', label: 'Revisado' },
];
const car = { id: 'car', name: 'Sedán 1.6', description: 'Motor 1.6 L, transmisión automática.', amount: 8500000, currency: 'BOB', stock: 1, imageUrls: [photo], highlights };
const plain = { id: 'plain', name: 'Sin destacados', amount: 12000, currency: 'BOB', stock: 3, imageUrls: [photo] };
const odd = { id: 'odd', name: 'Icono inventado', amount: 12000, currency: 'BOB', stock: 3, imageUrls: [photo], highlights: [{ icon: 'rocket', label: 'Inventado' }] };

async function open(page: Page, id: string, style: 'editorial' | 'dense', options: { reducedMotion?: boolean } = {}) {
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('https://highlights.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}:root{--store-background:#f6f5f1;--store-foreground:#141414;--store-accent:#141414;--store-accent-foreground:#ffffff}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'highlights', productPageStyle: style, data: { storeName: 'Motores', shippingPickupEnabled: true, items: [car, plain, odd] } })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`https://highlights.test/product.html?id=${id}`);
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
}

test('editorial pages show approved highlights between the description and the choices', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'car', 'editorial');
  const rows = page.locator('.product-detail__highlights li');
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText('Automático');
  await expect(rows.first()).toContainText('5 asientos');
  const [highlightsTop, introBottom, buyTop] = await page.evaluate(() => [
    document.querySelector('.product-detail__highlights')!.getBoundingClientRect().top,
    document.querySelector('.product-detail__intro')!.getBoundingClientRect().bottom,
    document.querySelector('.product-detail__buy')!.getBoundingClientRect().top,
  ]);
  expect(highlightsTop).toBeGreaterThanOrEqual(introBottom - 1);
  expect(buyTop).toBeGreaterThan(highlightsTop);
  const buy = (await page.locator('.product-detail__buy').boundingBox())!;
  expect(buy.y + buy.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: '.test-artifacts/product-highlights-editorial.png' });
});

test('dense pages show highlights under the action, above the delivery notes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'car', 'dense');
  const [highlightsTop, buyBottom, assurancesTop] = await page.evaluate(() => [
    document.querySelector('.product-detail__highlights')!.getBoundingClientRect().top,
    document.querySelector('.product-detail__buy')!.getBoundingClientRect().bottom,
    document.querySelector('.product-detail__assurances')!.getBoundingClientRect().top,
  ]);
  expect(highlightsTop).toBeGreaterThanOrEqual(buyBottom - 1);
  expect(assurancesTop).toBeGreaterThan(highlightsTop);
  await page.screenshot({ path: '.test-artifacts/product-highlights-dense.png' });
});

test('icons loop gently, pause off screen and stop for reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'car', 'editorial');
  const icon = page.locator('.product-detail__highlights svg > *').first();
  expect(await icon.evaluate(el => getComputedStyle(el).animationName)).not.toBe('none');
  expect(await icon.evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('infinite');
  expect(await icon.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('running');
  // Give the page room to scroll the row out of sight, as a long storefront would.
  await page.evaluate(() => { const filler = document.createElement('div'); filler.style.height = '2400px'; document.body.append(filler); window.scrollTo(0, document.documentElement.scrollHeight); });
  await expect.poll(() => icon.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');

  await open(page, 'car', 'editorial', { reducedMotion: true });
  const still = page.locator('.product-detail__highlights svg > *').first();
  expect(await still.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});

test('products without approved highlights, or with unknown icons, show no row', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'plain', 'dense');
  await expect(page.locator('.product-detail__highlights')).toHaveCount(0);
  await open(page, 'odd', 'dense');
  await expect(page.locator('.product-detail__highlights')).toHaveCount(0);
});
