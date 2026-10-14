import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

/** One look per store (spec 2026-10-14): the kit's product page, catalog and cart on a demo catalog, with an optional
 * config.look and DNA. Demo data only; nothing is written to a merchant store. */
const kit = (name: string) => readFileSync(kitPath(name), 'utf8');
const photo = readFileSync(new URL('./fixtures/retention-product.webp', import.meta.url));
const anton = readFileSync(kitPath('fonts/anton.ttf'));
export const ITEMS = [
  { id: 'cafe', name: 'Café de altura Caranavi', description: 'Tostado medio, notas de cacao y panela.', amount: 8500, currency: 'BOB', stock: 30, badge: 'Más vendido', recommendedProductIds: ['taza', 'molinillo'],
    imageUrls: ['https://img.test/1.webp', 'https://img.test/2.webp', 'https://img.test/3.webp'],
    variants: [{ id: 'g250', name: '250 g', amount: 8500, stock: 10, options: [{ name: 'Peso', value: '250 g' }] }, { id: 'g500', name: '500 g', amount: 15500, stock: 10, options: [{ name: 'Peso', value: '500 g' }] }] },
  { id: 'taza', name: 'Taza esmaltada', description: 'Cerámica de Cochabamba.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: ['https://img.test/4.webp'] },
  { id: 'molinillo', name: 'Molinillo manual', description: 'Muelas cerámicas.', amount: 22000, currency: 'BOB', stock: 4, imageUrls: ['https://img.test/5.webp'] },
];
export const LIGHT = '--store-background:#f5efe6;--store-foreground:#2b211d;--store-accent:#5a4032;--store-accent-foreground:#ffffff';
export const DARK = '--store-background:#16120f;--store-foreground:#f4ede4;--store-accent:#e0b070;--store-accent-foreground:#16120f';
export type KitPageOptions = { path?: 'product.html' | 'productos.html'; style?: string; look?: unknown; dna?: Record<string, unknown>; tokens?: string; cart?: boolean };

export async function openKitPage(page: Page, options: KitPageOptions = {}) {
  const path = options.path ?? 'product.html';
  const config = { demo: true, slug: 'kit', productPage: 'product.html', ...(options.style ? { productPageStyle: options.style } : {}), dna: { version: 1, ...(options.dna ?? {}) }, ...(options.look ? { look: options.look } : {}), data: { storeName: 'Tostadero Yungas', shippingPickupEnabled: true, items: ITEMS } };
  const main = path === 'product.html' ? '<main data-pagosya-product-page></main>' : '<h1 class="commerce-page-title">Productos</h1><main data-pagosya-catalog data-catalog-full></main>';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${kit('commerce-pages.css')}@font-face{font-family:Anton;src:url(https://kit.test/fonts/anton.ttf)}:root{${options.tokens ?? LIGHT}}body{margin:0;font-family:Arial,sans-serif}</style></head><body class="commerce-document"><header class="commerce-header"><a href="index.html" data-store-name>Tostadero Yungas</a><nav aria-label="Tienda"><button type="button" data-cart-open>Mi pedido (<span data-cart-count>0</span>)</button></nav></header>${main}<div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify(config)}</script><script>${kit('commerce.js')}</script></body></html>`;
  await page.route('https://kit.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('https://kit.test/fonts/anton.ttf', route => route.fulfill({ contentType: 'font/ttf', body: anton }));
  await page.route('https://img.test/**', route => route.fulfill({ contentType: 'image/webp', body: photo }));
  if (options.cart) await page.addInitScript(() => sessionStorage.setItem('pagosya:cart:kit', JSON.stringify([{ id: 'taza', quantity: 1 }])));
  await page.goto(`https://kit.test/${path}${path === 'product.html' ? '?id=cafe' : ''}`);
  if (path === 'product.html') {
    await expect(page.locator('#pagosya-product-title')).toBeVisible();
    await page.locator('.product-detail__photo').first().evaluate((img: HTMLImageElement) => img.decode());
  } else await expect(page.locator('[data-pagosya-catalog] .menu-item').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Opens the cart drawer (the page must have been opened with `cart: true`). */
export async function openCart(page: Page) {
  await page.locator('header [data-cart-open]').click();
  await expect(page.locator('.cart-drawer[open]')).toBeVisible();
  await page.waitForTimeout(400);
}

export const style = (page: Page, selector: string, property: string) => page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el).getPropertyValue(prop), property);
