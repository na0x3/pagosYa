import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
const second = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

for (const width of [1024, 390]) for (const stock of [false, true]) test(`product photos fill their column in a short ${stock ? 'stock' : 'React'} page at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 550 });
  const config = { demo: true, slug: 'gallery', data: { storeName: 'Tienda', items: [{ id: 'p1', name: 'Producto', amount: 3500, currency: 'BOB', stock: 3, imageUrls: [photo, second] }] } };
  await page.route('https://gallery.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}body{margin:0;font:16px system-ui}img{max-width:100%;height:auto}</style></head><body ${stock ? 'class="commerce-document"' : ''}><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify(config)}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto('https://gallery.test/product.html?id=p1');
  const image = page.locator('.product-detail__photo');
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS('object-fit', 'contain');
  const media = (await image.boundingBox())!;
  const layout = (await page.locator('.product-detail__layout').boundingBox())!;
  const copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(media.width / layout.width).toBeGreaterThan(width > 640 ? 0.45 : 0.98);
  // The square photo gets a square frame at full column width, not a viewport-height cap (viewport is 550px).
  expect(media.height).toBeGreaterThan(width > 640 ? 440 : 330);
  expect(media.height / media.width).toBeCloseTo(1, 1);
  if (width > 640) expect(copy.x).toBeGreaterThan(media.x + media.width);
  else expect(copy.y).toBeGreaterThan(media.y + media.height);
  await page.getByRole('button', { name: 'Ver foto 2', exact: true }).click();
  await expect(image).toHaveAttribute('src', second);
  await expect(page.getByRole('button', { name: 'Ver foto 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await image.boundingBox())!.height).toBeCloseTo(media.height, 0);
  await page.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await expect(page.locator('[data-pagosya-cart]')).toContainText('Producto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
