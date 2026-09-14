import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');

for (const width of [1280, 390, 320]) test(`colorful product choices and quantity work at ${width}px`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: 900 });
  // Demo catalog only. No products or options are written to a merchant store.
  const data = { storeName: 'Ground Up', locations: [{ name: 'Tienda central', address: 'La Paz', pickupEnabled: true, deliveryEnabled: true }], items: [{ id: 'p1', name: 'Honey Cardamom', description: 'Mantequilla de frutos secos con miel, cardamomo, coco tostado y semillas de chía.', amount: 8500, discountPercent: 10, currency: 'BOB', stock: 8, imageUrls: [photo], variants: [{ id: 'v1', name: 'Original / 340 g', amount: 8500, stock: 3, options: [{ name: 'Sabor', value: 'Original' }, { name: 'Tamaño', value: '340 g' }] }, { id: 'v2', name: 'Cacao / 340 g', amount: 9500, stock: 0, options: [{ name: 'Sabor', value: 'Cacao' }, { name: 'Tamaño', value: '340 g' }] }] }] };
  await page.route('https://product-design.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}:root{--brand-accent:#236452;--brand-accent-foreground:#fff;--brand-background:#fffdf6;--brand-foreground:#263b31;--brand-radius:10px}body{font-family:Arial,sans-serif}.commerce-header{text-decoration:none}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Ground Up</a><nav aria-label="Tienda"><a href="index.html#catalogo">Productos</a><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'product-design', data })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto('https://product-design.test/product.html?id=p1');
  await expect(page.getByRole('button', { name: 'Añadir al pedido', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Original', exact: true }).click();
  await page.getByRole('button', { name: '340 g', exact: true }).click();
  await page.getByRole('button', { name: 'Aumentar cantidad' }).click();
  await expect(page.locator('[data-product-subtotal]')).toContainText('153');
  await expect(page.locator('.product-detail__buy')).toHaveCSS('background-color', 'rgb(35, 100, 82)');
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `.test-artifacts/product-design-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('2');
  await page.getByRole('button', { name: 'Retiro en tienda', exact: false }).click();
  await expect(page.getByRole('tabpanel', { name: 'Envíos y retiro' })).toContainText('Tienda central');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
