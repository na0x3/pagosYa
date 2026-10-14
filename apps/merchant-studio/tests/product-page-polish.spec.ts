import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

// Buying-box polish: the photo is never letterboxed, the badge sits on the photo, gallery controls read on any photo,
// the dense radio is a normal radio, a lone leftover check is a plain line, and the trust row is unboxed.
const kit = (name: string) => readFileSync(kitPath(name), 'utf8');
const photo = readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url));
const STYLES = ['editorial', 'dense', 'image-led', 'story-led', 'conversion'] as const;
// Demo catalog only. Nothing is written to a merchant store.
const coffee = { id: 'cafe', name: 'Café de altura Caranavi', description: 'Tostado medio, notas de cacao y panela.', amount: 8500, currency: 'BOB', stock: 30, badge: 'Más vendido',
  imageUrls: ['https://img.test/1.webp', 'https://img.test/2.webp', 'https://img.test/3.webp'],
  highlights: [{ icon: 'bean', label: 'Grano arábica' }, { icon: 'flame', label: 'Tostado medio' }, { icon: 'cup', label: 'Notas de cacao' }, { icon: 'leaf', label: 'Cosecha 2026' }],
  variants: [{ id: 'g250', name: '250 g', amount: 8500, stock: 10, options: [{ name: 'Peso', value: '250 g' }] }, { id: 'g500', name: '500 g', amount: 15500, stock: 10, options: [{ name: 'Peso', value: '500 g' }] }] };

async function open(page: Page, style: string) {
  const data = { storeName: 'Tostadero Yungas', shippingPickupEnabled: true, items: [coffee] };
  await page.route('https://img.test/**', route => route.fulfill({ contentType: 'image/webp', body: photo }));
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}:root{--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Tostadero Yungas</a></header><main data-pagosya-product-page></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'kit', productPageStyle: style, data })}</script><script>${kit('commerce.js')}</script></body></html>` }));
  await page.goto('https://kit.test/product.html?id=cafe');
  await expect(page.locator('#pagosya-product-title')).toBeVisible();
  await page.locator('.product-detail__photo').evaluate((img: HTMLImageElement) => img.decode());
}
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const alpha = (color: string) => { const m = color.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const parts = m[1].split(/[ ,/]+/).filter(Boolean); return parts.length > 3 ? Number(parts[3]) : 1; };

for (const style of STYLES) test(`${style}: the photo is not letterboxed and the badge sits on it at 1440×900`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, style);
  const shape = await page.locator('.product-detail__photo').evaluate((img: HTMLImageElement) => {
    const fit = getComputedStyle(img).objectFit;
    return { fit, drawn: img.clientWidth / img.clientHeight, natural: img.naturalWidth / img.naturalHeight };
  });
  // A cropped photo (cover) fills its box; an uncropped one (contain) must be drawn at its own shape, with no band.
  if (shape.fit !== 'cover') expect(Math.abs(shape.drawn - shape.natural) / shape.natural).toBeLessThan(0.02);
  const [photoBox, badgeBox] = [await box(page, '.product-detail__photo'), await box(page, '.product-detail__badge')];
  expect(badgeBox.x).toBeGreaterThanOrEqual(photoBox.x);
  expect(badgeBox.y).toBeGreaterThanOrEqual(photoBox.y);
  expect(badgeBox.x + badgeBox.width).toBeLessThanOrEqual(photoBox.x + photoBox.width);
});

for (const style of STYLES) test(`${style}: gallery controls read on any photo and nothing scrolls sideways at 390`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, style);
  const thumbs = page.locator('.product-detail__thumbnails');
  if (await thumbs.isVisible()) expect(alpha(await thumbs.evaluate(el => getComputedStyle(el).backgroundColor))).toBe(0);
  const nav = page.locator('.product-detail__navigation');
  if (await nav.isVisible()) {
    for (const button of await nav.locator('button').all()) expect(alpha(await button.evaluate(el => getComputedStyle(el).backgroundColor))).toBe(1);
    const counter = nav.locator('span');
    if (await counter.count()) expect(alpha(await counter.evaluate(el => getComputedStyle(el).backgroundColor))).toBe(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Phones swap overlay thumbnails for dots; a dot carries no thumbnail frame.
  const dots = page.locator('.product-detail__thumbnails button');
  if (await dots.first().isVisible() && await dots.first().evaluate(el => getComputedStyle(el.querySelector('img')!).display === 'none'))
    expect(await dots.first().evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
});

test('editorial: the desktop thumbnail rail keeps the page gutter', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'editorial');
  const first = await box(page, '.product-detail__thumbnails button');
  expect(first.x).toBeGreaterThanOrEqual(16);
});

test('dense: the chosen priced option shows a normal radio with a dot', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'dense');
  const ring = await page.locator('[data-priced] [data-product-option][aria-pressed=true]').first().evaluate(el => {
    const style = getComputedStyle(el, '::before');
    return { border: parseFloat(style.borderTopWidth), dot: style.backgroundImage };
  });
  expect(ring.border).toBeLessThanOrEqual(2);
  expect(ring.dot).toContain('gradient');
});

test('conversion: a single leftover highlight is a plain check line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, 'conversion');
  const rows = page.locator('.product-detail__checks li');
  await expect(rows).toHaveCount(1);
  expect(alpha(await rows.first().evaluate(el => getComputedStyle(el).backgroundColor))).toBe(0);
});

for (const style of STYLES) test(`${style}: the trust row is unboxed, at most three to a row`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, style);
  const row = page.locator('.product-detail__assurances');
  await expect(row).toBeVisible();
  const sides = await row.evaluate(el => { const s = getComputedStyle(el); return [s.borderLeftWidth, s.borderRightWidth, s.borderBottomWidth]; });
  expect(sides).toEqual(['0px', '0px', '0px']);
  // Every true line stays (merchant lines plus pickup and payment can be five); they wrap three to a row at most.
  expect(await row.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBeLessThanOrEqual(3);
});
