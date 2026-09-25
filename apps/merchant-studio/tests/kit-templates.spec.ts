import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const SHOTS = '../../tmp/kit-templates-shots';
mkdirSync(SHOTS, { recursive: true });
const TEMPLATES = `
<template data-pagosya-cart-template><div class="canasta"><header class="canasta__head"><h2>Tu canasta 🐾</h2><button data-cart-close aria-label="Cerrar">×</button></header><div data-cart-slot="lines"></div><div data-cart-slot="savings"></div><div data-cart-slot="total"></div><div data-cart-slot="note"></div><div data-cart-slot="action"></div><div data-cart-slot="empty"><p>Tu canasta está vacía.</p></div><button data-cart-close class="canasta__seguir">Seguir mirando</button></div></template>
<template data-pagosya-cart-line-template><li class="linea"><img data-cart-field="photo" alt=""><div><h3 data-cart-field="name"></h3><p data-cart-field="unit"></p><div data-cart-field="quantity"></div></div><strong data-cart-field="line-total"></strong><button data-cart-field="remove">Quitar</button></li></template>
<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver canasta</button></div></template>
<template data-pagosya-review-template><div class="revision"><section><h2>Tu canasta</h2><div data-review-slot="summary"></div></section><section data-review-slot="fields"></section></div></template>
<template data-pagosya-product-page-template><article class="ficha"><div data-product-slot="gallery"></div><div><p data-product-slot="category"></p><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></div></article></template>`;
// .linea's photo is hidden when a product has no image (as the fixture product does): a plain
// 3-track "64px 1fr auto" grid lets auto-placement fill the freed 64px track, squeezing the name
// block into it and overlapping the price. Explicit grid-column per child keeps every field in its
// own track whether or not the photo participates.
const CSS = `body{margin:0;font:16px/1.5 Georgia,serif;background:#fbf6ee;color:#2a1d12}.canasta{padding:28px;display:grid;gap:16px}.canasta__head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px dashed #c9853a}.linea{display:grid;grid-template-columns:64px 1fr auto auto;gap:12px;align-items:center}.linea img{grid-column:1;width:64px;height:64px;object-fit:cover;border-radius:50%}.linea>div{grid-column:2;min-width:0}.linea strong{grid-column:3;white-space:nowrap}.linea button{grid-column:4}.ficha{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:32px}@media(max-width:700px){.ficha{grid-template-columns:1fr;padding:16px}}.revision{display:grid;grid-template-columns:1fr 1fr;gap:24px}@media(max-width:700px){.revision{grid-template-columns:1fr}}`;
const CONFIG = 'window.PAGOSYA_CONFIG=' + JSON.stringify({ slug: 'huellitas', data: { storeName: 'Huellitas', locations: [], categories: [], items: [{ id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], description: 'Horneadas sin conservantes' }] } }) + ';';
const page = (templates: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${CSS}</style><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><header><button type="button" data-cart-open>Mi canasta <b data-cart-count>0</b></button></header><main><h1>Huellitas</h1><section data-pagosya-catalog></section></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p>${templates}</body></html>`;

async function mount(browserPage: any, templates: string) {
  await browserPage.goto('/?demo=1');
  await browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { sourcePreviewDocument } = await import('/src/storefront-preview.ts');
    const snapshot = { schemaVersion: 1, brief: {}, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] };
    document.body.innerHTML = ''; document.body.style.margin = '0';
    const frame = document.createElement('iframe'); frame.title = 'Tienda'; frame.sandbox.add('allow-scripts'); frame.style.cssText = 'width:100%;height:100vh;border:0';
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { cart: [{ id: 'galleta', quantity: 2 }] }); document.body.append(frame);
  }, { commerce, html: page(templates), config: CONFIG });
  return browserPage.frameLocator('iframe');
}

for (const width of [1280, 390]) test(`a fully templated store shops end to end at ${width}px`, async ({ page: browserPage }) => {
  await browserPage.setViewportSize({ width, height: 900 });
  const shop = await mount(browserPage, TEMPLATES);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await expect(shop.getByRole('heading', { name: 'Tu canasta 🐾' })).toBeVisible();
  await expect(shop.locator('.linea [data-cart-field="name"]')).toHaveText('Galletas de pollo');
  await expect(shop.locator('[data-cart-slot="total"] .order-total')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/cart-${width}.png` });
  await shop.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(shop.locator('.revision [data-review-slot="summary"] .order-total')).toBeVisible();
  await expect(shop.locator('.revision [data-review-slot="fields"] .checkout-button')).toBeVisible();
  await browserPage.screenshot({ path: `${SHOTS}/review-${width}.png` });
  expect(await shop.locator('html').evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function checkBroken(browserPage: any, broken: string) {
  return browserPage.evaluate(async ({ commerce, html, config }: any) => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    return checkSourceWebsite({ schemaVersion: 1, brief: { sitePurpose: 'shop' }, files: [{ path: 'index.html', content: html }, { path: 'config.js', content: config }, { path: 'commerce.js', content: commerce }] } as any);
  }, { commerce, html: page(broken), config: CONFIG });
}

test('a broken cart template falls back to the kit cart and the checks fail publishing', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<div data-cart-slot="total"></div>', '');
  const shop = await mount(browserPage, broken);
  await shop.getByRole('button', { name: /Mi canasta/ }).first().click();
  await expect(shop.locator('.cart-drawer .order-total')).toBeVisible();
  const results = await checkBroken(browserPage, broken);
  // checkSourceWebsite prefixes every row's label with "<viewport> · <file>", so match by
  // substring rather than an exact label (see source-checks.ts, and existing
  // `row.label.includes(...)` assertions in tests/source-checks.spec.ts).
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Plantillas de compra'), status: 'failed', detail: expect.stringContaining('carrito') })]));
});

// Fix round 1: added/review/product-page templates were only validated lazily, when their surface
// happened to render during the probe's own simulated buy → added-notice → checkout journey. A
// simple product's page is never opened by that simulation at all, so a broken product-page
// template never failed publishing. Each of these proves its surface's own broken template fails
// 'Plantillas de compra' via the real checkSourceWebsite run (four viewports), independent of
// whether the probe's simulation happens to reach that surface.
test('a broken added-notice template fails the checks and names the notice', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<button data-cart-open>Ver canasta</button>', '');
  await mount(browserPage, broken);
  const results = await checkBroken(browserPage, broken);
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Plantillas de compra'), status: 'failed', detail: expect.stringContaining('aviso') })]));
});

test('a broken review template fails the checks and names the review', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<section data-review-slot="fields"></section>', '<section></section>');
  await mount(browserPage, broken);
  const results = await checkBroken(browserPage, broken);
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Plantillas de compra'), status: 'failed', detail: expect.stringContaining('revisión') })]));
});

test('a broken product-page template fails the checks and names the product page', async ({ page: browserPage }) => {
  const broken = TEMPLATES.replace('<div data-product-slot="buy"></div>', '<div></div>');
  await mount(browserPage, broken);
  const results = await checkBroken(browserPage, broken);
  expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ label: expect.stringContaining('Plantillas de compra'), status: 'failed', detail: expect.stringContaining('página de producto') })]));
});
