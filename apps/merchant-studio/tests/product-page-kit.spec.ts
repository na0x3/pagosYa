import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
const second = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// Demo catalog only. Nothing is written to a merchant store.
const lamp = { id: 'lamp', name: 'Lámpara de escritorio USB-C', description: 'Brazo ajustable y acabado mate. No incluye adaptador de pared.', amount: 22000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  specifications: [{ label: 'Conector', value: 'USB-C' }, { label: 'Brazo', value: 'Ajustable' }, { label: 'Acabado', value: 'Mate' }, { label: 'Garantía', value: 'Un año con la tienda, sin costo adicional' }],
  variants: [{ id: 'black', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }, { id: 'ivory', name: 'Marfil', amount: 22700, stock: 10, options: [{ name: 'Color', value: 'Marfil' }] }] };
const cushion = { id: 'cushion', name: 'Funda de cojín', description: 'Funda de lino, cierre oculto. No incluye relleno.', amount: 11000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  variants: [{ id: 'small', name: '40 × 40 cm', amount: 11000, stock: 10, options: [{ name: 'Tamaño', value: '40 × 40 cm' }] }, { id: 'large', name: '50 × 50 cm', amount: 11700, stock: 10, options: [{ name: 'Tamaño', value: '50 × 50 cm' }] }] };
const shirt = { id: 'shirt', name: 'Camisa de algodón de manga larga con bolsillo', amount: 14000, currency: 'BOB', stock: 5, imageUrls: [photo] };

async function open(page: Page, id: string, config: Record<string, unknown>, options: { items?: unknown[]; css?: string } = {}) {
  const data = { storeName: 'Prueba', shippingPickupEnabled: true, items: options.items || [lamp, cushion, shirt] };
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}:root{--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff}body{margin:0;font-family:Arial,sans-serif}${options.css || ''}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a><nav aria-label="Tienda"><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'kit', ...config, data })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`https://kit.test/product.html?id=${id}`);
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
}

test('uses the stored style and infers one for stores without it', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'dense' });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {}, { items: [lamp, cushion] });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {});
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'editorial');
});

test('dense pages show short specifications as chips; editorial pages do not', async ({ page }) => {
  await open(page, 'lamp', { productPageStyle: 'dense' });
  await expect(page.locator('.product-detail__chips li')).toHaveText(['Conector: USB-C', 'Brazo: Ajustable', 'Acabado: Mate']);
  await open(page, 'lamp', { productPageStyle: 'editorial' });
  await expect(page.locator('.product-detail__chips')).toHaveCount(0);
});

test('the breadcrumb opens the purchase column and long names are marked', async ({ page }) => {
  await open(page, 'shirt', { productPageStyle: 'editorial' });
  await expect(page.locator('.product-detail__copy > .product-detail__breadcrumb')).toBeVisible();
  await expect(page.locator('#pagosya-product-title')).toHaveAttribute('data-length', 'long');
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  await expect(page.locator('#pagosya-product-title')).not.toHaveAttribute('data-length');
});

test('choices expose their kind, price and the difference for dearer values', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  const small = page.getByRole('button', { name: '40 × 40 cm', exact: true }), large = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(small).toHaveAttribute('data-option-price', /110,00/);
  await expect(small).not.toHaveAttribute('data-option-delta');
  await expect(large).toHaveAttribute('data-option-delta', /^\+ .*7,00$/);
  await expect(small.locator('.product-detail__option-label')).toHaveText('40 × 40 cm');
  await open(page, 'lamp', { productPageStyle: 'dense' });
  await expect(page.locator('.product-detail__values').first()).toHaveAttribute('data-kind', 'swatch');
});

test('store CSS aimed at the product page is released while the rest of each rule survives', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { css: '[data-pagosya-product] .product-detail__layout{display:block}.product-detail__buy,.brand-button{letter-spacing:9px}@media (min-width:1px){.product-detail__copy{display:none}}' });
  await expect(page.locator('.product-detail__layout')).toHaveCSS('display', 'grid');
  await expect(page.locator('.product-detail__copy')).toBeVisible();
  const kept = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).map(rule => rule.cssText).find(text => text.includes('brand-button')));
  expect(kept).toContain('.brand-button');
  expect(kept).not.toContain('product-detail__buy');
});

for (const style of ['editorial', 'dense'] as const) test(`${style} page keeps photo and purchase side by side above the fold at 1280×844`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, style === 'dense' ? 'lamp' : 'cushion', { productPageStyle: style });
  const buy = (await page.locator('.product-detail__buy').boundingBox())!;
  expect(buy.y + buy.height).toBeLessThanOrEqual(844);
  const lines = await page.locator('#pagosya-product-title').evaluate(el => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
  expect(lines).toBeLessThanOrEqual(2);
  const photo = (await page.locator('.product-detail__photo').boundingBox())!, copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(photo.width).toBeGreaterThan(600);
  expect(copy.x).toBeGreaterThanOrEqual(photo.x + photo.width - 1);
  await expect(page.locator('.product-detail__photo')).toHaveCSS('object-fit', 'cover');
  expect(await page.locator('[data-product-option]').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).length)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.test-artifacts/product-page-kit-${style}-1280.png` });
});

test('dense priced choices are radio rows with the price; editorial keeps pills with the difference', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'cushion', { productPageStyle: 'dense' });
  const denseLarge = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(denseLarge).toHaveCSS('display', 'grid');
  expect(await denseLarge.evaluate(el => getComputedStyle(el, '::after').content)).toMatch(/117,00/);
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  const pill = page.getByRole('button', { name: '50 × 50 cm', exact: true });
  await expect(pill).toHaveCSS('border-radius', '999px');
  expect(await pill.evaluate(el => getComputedStyle(el, '::after').content)).toMatch(/\+ .*7,00/);
  await expect(page.locator('.product-detail__navigation')).toBeHidden();
  await expect(page.locator('.product-detail__thumbnails img').first()).toBeHidden();
});

test('mobile shows a full-width photo with dots, then the purchase panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'lamp', { productPageStyle: 'dense' });
  const photo = (await page.locator('.product-detail__photo').boundingBox())!;
  expect(photo.width).toBeGreaterThanOrEqual(389);
  await expect(page.locator('.product-detail__navigation')).toBeHidden();
  await page.getByRole('button', { name: 'Ver foto 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver foto 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(copy.y).toBeGreaterThanOrEqual(photo.y + photo.height - 1);
  await page.getByRole('button', { name: 'Marfil', exact: true }).click();
  expect((await page.locator('.product-detail__buy').boundingBox())!.height).toBeLessThanOrEqual(56);
  await page.getByRole('button', { name: 'Añadir al pedido', exact: true }).click();
  await expect(page.locator('[data-cart-count]')).toHaveText('1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/product-page-kit-dense-390.png', fullPage: true });
});
