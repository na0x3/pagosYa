import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const kit = (name: string) => readFileSync(kitPath(`${name}`), 'utf8');
const photo = 'data:image/webp;base64,' + readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url)).toString('base64');
const second = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
// Demo catalog only. Nothing is written to a merchant store.
const lamp = { id: 'lamp', name: 'Lámpara de escritorio USB-C', description: 'Brazo ajustable y acabado mate. No incluye adaptador de pared.', amount: 22000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  specifications: [{ label: 'Conector', value: 'USB-C' }, { label: 'Brazo', value: 'Ajustable' }, { label: 'Acabado', value: 'Mate' }, { label: 'Garantía', value: 'Un año con la tienda, sin costo adicional' }],
  variants: [{ id: 'black', name: 'Negro', amount: 22000, stock: 10, options: [{ name: 'Color', value: 'Negro' }] }, { id: 'ivory', name: 'Marfil', amount: 22700, stock: 10, options: [{ name: 'Color', value: 'Marfil' }] }] };
const cushion = { id: 'cushion', name: 'Funda de cojín', description: 'Funda de lino, cierre oculto. No incluye relleno.', amount: 11000, currency: 'BOB', stock: 20, imageUrls: [photo, second],
  variants: [{ id: 'small', name: '40 × 40 cm', amount: 11000, stock: 10, options: [{ name: 'Tamaño', value: '40 × 40 cm' }] }, { id: 'large', name: '50 × 50 cm', amount: 11700, stock: 10, options: [{ name: 'Tamaño', value: '50 × 50 cm' }] }] };
const shirt = { id: 'shirt', name: 'Camisa de algodón de manga larga con bolsillo', amount: 14000, currency: 'BOB', stock: 5, imageUrls: [photo] };

async function open(page: Page, id: string, config: Record<string, unknown>, options: { items?: unknown[]; css?: string; wrap?: 'only' | 'shared' | 'authored'; tokens?: boolean; preview?: boolean; missing?: boolean } = {}) {
  const data = { storeName: 'Prueba', shippingPickupEnabled: true, items: options.items || [lamp, cushion, shirt] };
  const mount = '<main data-pagosya-product-page></main>';
  const body = options.wrap === 'only' ? `<div class="product-main">${mount}</div>` : options.wrap === 'shared' ? `<div class="product-main"><p>Nota de la tienda</p>${mount}</div>` : options.wrap === 'authored' ? `<div class="product-main"><a class="back-link" href="index.html#catalogo">Volver al catálogo</a>${mount}</div>` : mount;
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}${options.tokens === false ? '' : ':root{--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff}'}body{margin:0;font-family:Arial,sans-serif}${options.css || ''}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Prueba</a><nav aria-label="Tienda"><button data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header>${body}<div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'kit', ...config, data })}${options.preview ? ';window.PAGOSYA_PREVIEW=true' : ''}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto(`https://kit.test/product.html${id ? `?id=${id}` : ''}`);
  if (!options.missing) await expect(page.locator('#pagosya-product-title')).toBeVisible();
}

test('uses the stored style and infers one for stores without it', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'dense' });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {}, { items: [lamp, cushion] });
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'dense');
  await open(page, 'cushion', {});
  await expect(page.locator('[data-pagosya-product]')).toHaveAttribute('data-style', 'editorial');
});

test('the Studio preview without an id shows the first product; outside the preview the page keeps its error', async ({ page }) => {
  // The Boceto's Producto tab and the page picker open product.html with no ?id=; the merchant
  // with a catalog should see a real ficha, not "Producto no disponible".
  await open(page, '', { productPageStyle: 'editorial' }, { preview: true });
  await expect(page.locator('#pagosya-product-title')).toHaveText(lamp.name);
  await open(page, '', { productPageStyle: 'editorial' }, { missing: true });
  await expect(page.locator('[data-pagosya-product-page]')).toContainText('Producto no disponible');
});

test('dna.media=right mirrors the desktop ficha; mobile keeps the photo first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'lamp', { productPageStyle: 'editorial', dna: { media: 'right' } });
  let gallery = (await page.locator('.product-detail__gallery').boundingBox())!, copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(copy.x).toBeLessThan(gallery.x);
  await open(page, 'lamp', { productPageStyle: 'editorial', dna: { media: 'left' } });
  gallery = (await page.locator('.product-detail__gallery').boundingBox())!; copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(gallery.x).toBeLessThan(copy.x);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'lamp', { productPageStyle: 'editorial', dna: { media: 'right' } });
  gallery = (await page.locator('.product-detail__gallery').boundingBox())!; copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(gallery.y).toBeLessThan(copy.y);
});

test('authored assurance lines lead the row; the platform payment line stays', async ({ page }) => {
  await open(page, 'lamp', { productPageStyle: 'editorial', productAssurances: [
    { icon: 'coffee', title: 'Horneado del día', detail: 'Salimos del horno a las 7am' },
    { icon: 'nope', title: '<b>x</b> & y', detail: '' },
  ] });
  const titles = page.locator('.product-detail__assurances strong');
  await expect(titles.first()).toHaveText('Horneado del día');
  await expect(titles.nth(1)).toHaveText('<b>x</b> & y');
  await expect(page.locator('.product-detail__assurances b')).toHaveCount(0);
  await expect(titles.last()).toHaveText('Pago seguro');
  await expect(page.locator('.product-detail__assurances')).toContainText('Procesado por pagosYa');
});

test('the Studio preview samples reviews and related products, labeled ejemplo; demo pages stay honest', async ({ page }) => {
  await open(page, 'lamp', { productPageStyle: 'editorial' }, { preview: true });
  await expect(page.locator('#product-reviews-title')).toHaveText('Reseñas verificadas · ejemplo');
  await expect(page.locator('.product-detail__review-list article')).toHaveCount(2);
  await expect(page.locator('#product-related-title')).toHaveText('Combínalo con · ejemplo');
  await expect(page.locator('.product-detail__related li')).toHaveCount(2);
  await open(page, 'lamp', { productPageStyle: 'editorial' });
  await expect(page.locator('#product-reviews-title')).toHaveCount(0);
  await expect(page.locator('.product-detail__related')).toHaveCount(0);
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

test('catalog hooks that only share the prefix keep their authored rules', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { css: '[data-pagosya-product-template]{color:red}[data-pagosya-products] .card{color:blue}[data-pagosya-product-page]{color:green}' });
  const rules = await page.evaluate(() => [...document.styleSheets].flatMap(sheet => [...sheet.cssRules]).map(rule => rule.cssText).join('\n'));
  expect(rules).toContain('[data-pagosya-product-template]');
  expect(rules).toContain('[data-pagosya-products] .card');
  expect(rules).not.toContain('color: green');
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
  // Desktop editorial pages show real thumbnails, so a second photo (often the styled scene) is seen without guessing.
  await expect(page.locator('.product-detail__thumbnails img').first()).toBeVisible();
  await page.locator('[data-product-image="1"]').click();
  await expect(page.locator('.product-detail__photo')).toHaveAttribute('src', second);
  await expect(page.locator('[data-product-image="1"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a store that authored its own way back gets no second breadcrumb', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { wrap: 'only' });
  await expect(page.locator('.product-detail__breadcrumb')).toBeVisible();
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { wrap: 'authored' });
  await expect(page.locator('.product-detail__breadcrumb')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Volver al catálogo' })).toBeVisible();
});

test('the purchase column starts level with the photo on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, 'cushion', { productPageStyle: 'editorial' });
  const photo = (await page.locator('.product-detail__photo').boundingBox())!, copy = (await page.locator('.product-detail__copy').boundingBox())!;
  expect(Math.abs(copy.y - photo.y)).toBeLessThanOrEqual(2);
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

test('a wrapper holding only the product page stops painting panels beside it', async ({ page }) => {
  const css = '.product-main{padding:40px;background:linear-gradient(90deg,#fff 0 59%,#f0c 59%)}';
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { wrap: 'only', css });
  await expect(page.locator('.product-main')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.product-main')).toHaveCSS('padding-top', '40px');
  await open(page, 'cushion', { productPageStyle: 'editorial' }, { wrap: 'shared', css });
  await expect(page.locator('.product-main')).not.toHaveCSS('background-image', 'none');
});

test('stores without accent tokens keep the color of their authored action button', async ({ page }) => {
  await open(page, 'cushion', { productPageStyle: 'dense' }, { tokens: false, css: '.checkout-button{background:#0750a4;color:#ffffff}' });
  await expect(page.locator('.product-detail__buy')).toHaveCSS('background-color', 'rgb(7, 80, 164)');
  await expect(page.locator('.product-detail__buy')).toHaveCSS('color', 'rgb(255, 255, 255)');
});
