import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const kit = (name: string) => readFileSync(new URL(`../../api/src/stores/source-kit/${name}`, import.meta.url), 'utf8');

const product = (id: string, name: string) => ({ id, name, amount: 1000, currency: 'BOB', stock: 4 });

async function storefront(page: Page, data: Record<string, unknown>, opts: { mount?: string; path?: string } = {}) {
  await page.setViewportSize({ width: 1000, height: 900 });
  // A themed shell close to a generated store, so screenshots reveal real spacing and heading weight.
  const css = 'body{margin:0;font-family:Arial,sans-serif;background:#fff5df;color:#0b2a80;padding:24px}.menu-item{border:1px solid #0b2a80;background:#fff;padding:12px}';
  await page.route('https://cards.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div data-pagosya-catalog${opts.mount ? ' ' + opts.mount : ''}></div><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'cards', data })}</script><script>${kit('commerce.js')}</script></body></html>`,
  }));
  await page.goto(`https://cards.test/${opts.path || ''}`);
}

test('all renders one flat list with every product and no groups', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres')];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'all', items });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(3);
  await expect(page.locator('.catalog-group__title')).toHaveCount(0);
  await expect(page.locator('[data-pagosya-catalog]')).toHaveAttribute('data-catalog-layout', 'all');
});

test('sections renders one group per collection in order plus a leftover group', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres'), product('p4', 'Cuatro'), product('p5', 'Cinco')];
  const collections = [
    { id: 'c1', name: 'Verano', slug: 'verano', productIds: ['p1', 'p2'] },
    { id: 'c2', name: 'Invierno', slug: 'invierno', productIds: ['p3'] },
  ];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'sections', items, collections });
  const titles = page.locator('.catalog-group__title');
  await expect(titles).toHaveCount(3);
  await expect(titles.nth(0)).toHaveText('Verano');
  await expect(titles.nth(1)).toHaveText('Invierno');
  await expect(titles.nth(2)).toHaveText('Más productos');
  const groups = page.locator('.catalog-group');
  await expect(groups.nth(0).locator('.menu-item')).toHaveCount(2);
  await expect(groups.nth(1).locator('.menu-item')).toHaveCount(1);
  await expect(groups.nth(2).locator('.menu-item')).toHaveCount(2);
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(5);
  // .catalog-group__items gets its grid unconditionally from CSS — it does not depend on the
  // mount's own [data-pagosya-grid] autodetection, which never fires for `sections` (no direct
  // child cards for structureCatalog to measure).
  await expect(groups.first().locator('.catalog-group__items')).toHaveCSS('display', 'grid');
  await page.screenshot({ path: '.test-artifacts/catalog-arrangement-sections.png', fullPage: true });
});

test('sections with every product collected renders no leftover group', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos')];
  const collections = [{ id: 'c1', name: 'Todo', slug: 'todo', productIds: ['p1', 'p2'] }];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'sections', items, collections });
  await expect(page.locator('.catalog-group__title')).toHaveCount(1);
  await expect(page.locator('.catalog-group__title')).toHaveText('Todo');
});

test('page renders a four-product preview and a link to the full catalog', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres'), product('p4', 'Cuatro'), product('p5', 'Cinco'), product('p6', 'Seis')];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'page', items });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(4);
  const more = page.locator('[data-catalog-more]');
  await expect(more).toHaveText('Ver todos los productos');
  await expect(more).toHaveAttribute('href', /productos\.html$/);
  await page.screenshot({ path: '.test-artifacts/catalog-arrangement-page.png', fullPage: true });
});

test('page with 3 products renders 3 cards and still renders the link', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres')];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'page', items });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(3);
  await expect(page.locator('[data-catalog-more]')).toHaveAttribute('href', /productos\.html$/);
});

test('page with 0 products renders no cards and still renders the link', async ({ page }) => {
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'page', items: [] });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(0);
  await expect(page.locator('[data-catalog-more]')).toHaveAttribute('href', /productos\.html$/);
});

test('tabs renders a keyboard-reachable tab row above the four-product preview', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres'), product('p4', 'Cuatro'), product('p5', 'Cinco')];
  const collections = [
    { id: 'c1', name: 'Verano', slug: 'verano', productIds: ['p1', 'p2'] },
    { id: 'c2', name: 'Invierno', slug: 'invierno', productIds: ['p3'] },
  ];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'tabs', items, collections });
  const tabs = page.locator('.catalog-tabs a');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveText('Verano');
  await expect(tabs.nth(1)).toHaveText('Invierno');
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(4);
  // Under `tabs` the catalog already reads as organized by collection, so "Ver todos los
  // productos" points at the first collection's own page (spec §7) rather than the standalone
  // products page — which `page` still uses (see the `page` layout tests above).
  await expect(page.locator('[data-catalog-more]')).toHaveAttribute('href', /coleccion\.html\?c=verano$/);
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe('Verano');
  await page.screenshot({ path: '.test-artifacts/catalog-arrangement-tabs.png', fullPage: true });
});

test('a card under sections is byte-identical to the same card under all', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres')];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'all', items });
  const allCard = await page.locator('[data-pagosya-catalog] .menu-item').first().evaluate(el => el.outerHTML);

  const collections = [{ id: 'c1', name: 'Todo', slug: 'todo', productIds: ['p1'] }];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'sections', items, collections });
  const sectionsCard = await page.locator('[data-pagosya-catalog] .menu-item').first().evaluate(el => el.outerHTML);

  expect(sectionsCard).toBe(allCard);
});

test('sections applies the readable-card contrast fix to cards nested inside a group', async ({ page }) => {
  // Mirrors catalog-card-defaults.spec.ts's contrast setup (light text for a dark section, cream
  // cards) but under `sections`, where cards sit two levels below the mount
  // (.catalog-group > .catalog-group__items > .menu-item) instead of as its direct children.
  const items = [product('p1', 'Uno'), product('p2', 'Dos')];
  const collections = [{ id: 'c1', name: 'Todo', slug: 'todo', productIds: ['p1', 'p2'] }];
  const data = { storeName: 'Tienda', catalogLayout: 'sections', items, collections };
  await page.route('https://cards.test/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--store-background:#fff5df;--store-foreground:#0b2a80}body{margin:0;font-family:Arial,sans-serif}.collection{background:#0b2a80;color:#fff5df;padding:40px}.menu-item{border:3px solid #0b2a80;background:#fff5df;padding:16px}</style></head><body><section class="collection"><h2>Colección</h2><div data-pagosya-catalog></div></section><div data-pagosya-cart hidden></div><p data-pagosya-status></p><script>window.PAGOSYA_CONFIG=${JSON.stringify({ demo: true, slug: 'cards', data })}</script><script>${kit('commerce.js')}</script></body></html>`,
  }));
  await page.goto('https://cards.test/');
  const groupCard = page.locator('.catalog-group .menu-item').first();
  await expect(groupCard).toBeVisible();
  const [text, card] = await groupCard.evaluate(el => [getComputedStyle(el.querySelector('h3')!).color, getComputedStyle(el).backgroundColor]);
  expect(text).not.toBe(card);
  expect(text).toBe('rgb(11, 42, 128)');
});

test('productos.html renders every product and no preview link', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres'), product('p4', 'Cuatro'), product('p5', 'Cinco')];
  // catalogLayout is 'page' here to prove data-catalog-full overrides the owner's chosen preview
  // layout: a store whose owner picked 'page' still gets the full catalog on its products page.
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'page', items }, { mount: 'data-catalog-full', path: 'productos.html' });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(5);
  await expect(page.locator('[data-catalog-more]')).toHaveCount(0);
  await expect(page.locator('.catalog-tabs')).toHaveCount(0);
});

test('coleccion.html?c=verano renders only that collection\'s products under its name, with the tab marked current', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres')];
  const collections = [
    { id: 'c1', name: 'Verano', slug: 'verano', productIds: ['p1', 'p2'] },
    { id: 'c2', name: 'Invierno', slug: 'invierno', productIds: ['p3'] },
  ];
  await storefront(page, { storeName: 'Tienda', items, collections }, { mount: 'data-catalog-full data-collection-page', path: 'coleccion.html?c=verano' });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(2);
  await expect(page.locator('.catalog-group__title')).toHaveText('Verano');
  const tabs = page.locator('.catalog-tabs a');
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.catalog-tabs a[aria-current="page"]')).toHaveText('Verano');
  await expect(page.locator('.catalog-tabs a:not([aria-current])')).toHaveText('Invierno');
});

test('coleccion.html?c=desconocida renders the whole catalog', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos'), product('p3', 'Tres')];
  const collections = [{ id: 'c1', name: 'Verano', slug: 'verano', productIds: ['p1', 'p2'] }];
  await storefront(page, { storeName: 'Tienda', items, collections }, { mount: 'data-catalog-full data-collection-page', path: 'coleccion.html?c=desconocida' });
  await expect(page.locator('[data-pagosya-catalog] .menu-item')).toHaveCount(3);
  await expect(page.locator('.catalog-group__title')).toHaveCount(0);
  // No link ever carries aria-current for a collection that does not exist.
  await expect(page.locator('.catalog-tabs a[aria-current]')).toHaveCount(0);
});

test('productos.html and coleccion.html cards are byte-identical to the home page\'s', async ({ page }) => {
  const items = [product('p1', 'Uno'), product('p2', 'Dos')];
  const collections = [{ id: 'c1', name: 'Verano', slug: 'verano', productIds: ['p1'] }];
  await storefront(page, { storeName: 'Tienda', catalogLayout: 'all', items });
  const homeCard = await page.locator('[data-pagosya-catalog] .menu-item').first().evaluate(el => el.outerHTML);

  await storefront(page, { storeName: 'Tienda', items, collections }, { mount: 'data-catalog-full', path: 'productos.html' });
  const productosCard = await page.locator('[data-pagosya-catalog] .menu-item').first().evaluate(el => el.outerHTML);
  expect(productosCard).toBe(homeCard);

  await storefront(page, { storeName: 'Tienda', items, collections }, { mount: 'data-catalog-full data-collection-page', path: 'coleccion.html?c=verano' });
  const coleccionCard = await page.locator('[data-pagosya-catalog] .menu-item').first().evaluate(el => el.outerHTML);
  expect(coleccionCard).toBe(homeCard);
});
