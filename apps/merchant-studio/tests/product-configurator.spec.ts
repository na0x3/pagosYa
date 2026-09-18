import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
const checkoutRoot = new URL('../../checkout/', import.meta.url).pathname;
const index = readFileSync(new URL('../../checkout/index.html', import.meta.url), 'utf8').replaceAll('/src/', '/@fs' + checkoutRoot + 'src/');
const product = { id: 'p1', name: 'Honey Cardamom', description: 'Mantequilla artesanal de frutos secos con miel, cardamomo y coco tostado.', categoryId: 'c1', amount: 8500, currency: 'BOB', stock: 20, imageUrls: [photo], tags: ['Artesanal'], recommendedProductIds: [], color: null, variants: [
  { id: 'small', name: 'Original / 340 g', amount: 8500, stock: 5, options: [{ name: 'Sabor', value: 'Original' }, { name: 'Tamaño', value: '340 g' }] },
  { id: 'large', name: 'Original / 500 g', amount: 11000, stock: 5, options: [{ name: 'Sabor', value: 'Original' }, { name: 'Tamaño', value: '500 g' }] },
  { id: 'cocoa', name: 'Cacao / 340 g', amount: 9500, stock: 0, options: [{ name: 'Sabor', value: 'Cacao' }, { name: 'Tamaño', value: '340 g' }] },
], extras: [
  { id: 'gift', name: 'Caja de regalo', amount: 1500, required: false, available: true, groupName: 'Para regalar' },
  { id: 'card', name: 'Tarjeta', amount: 0, required: false, available: true, groupName: 'Para regalar' },
] };
const store = { storeId: 'options-demo', storeName: 'Ground Up', publishedSourceRevision: null, backgroundColor: '#fffdf6', backgroundMode: 'solid', accentColor: '#236452', fontStyle: 'modern', buttonStyle: 'rounded', buttonVariant: 'solid', buttonMotion: 'none', checkoutMode: 'payment', categories: [{ id: 'c1', name: 'Mantequillas de frutos secos' }], items: [product], links: [], heroSlides: [], animations: [], motionExperiences: [], editorialGallery: [], locations: [], showLowStockToCustomers: false, cartRecommendationsEnabled: false, contactFormEnabled: false, announcement: null };

for (const width of [1280, 390, 320]) test(`product configurator keeps real options and purchase together at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/v1/**', route => route.fulfill({ json: route.request().url().includes('/stores/public/options-demo/store') ? store : {} }));
  await page.route('http://127.0.0.1:4312/s/options-demo/p/p1', route => route.fulfill({ contentType: 'text/html', body: index }));
  await page.goto('http://127.0.0.1:4312/s/options-demo/p/p1');
  await expect(page.locator('.product-detail-content h1')).toHaveText(product.name);
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.getByRole('button', { name: '500 g', exact: true }).click();
  await page.getByRole('checkbox', { name: /Caja de regalo/ }).check();
  await expect(page.locator('.product-detail-price')).toContainText('125');
  await expect(page.locator('.product-detail-selection-summary')).toContainText('500 g');
  await page.evaluate(() => scrollTo(0, 0));
  const nav = (await page.locator('.store-site-nav').boundingBox())!;
  const back = (await page.locator('.product-back-link').boundingBox())!;
  expect(nav.y + nav.height).toBeLessThanOrEqual(back.y + 1);
  await page.screenshot({ path: `.test-artifacts/product-configurator-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Agregar al carrito', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pagosya_cart_options-demo') || '{}'))).toEqual({ 'p1::large~~gift': 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
