/// <reference lib="dom" />
jest.setTimeout(180_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { checkSurfacesOnSnapshot, inspectProductPage, inspectShopPage } from './surface-checks';
import { COMMERCE_TEMPLATES_FILE, composeTemplatesFile, type SurfacePart } from './surface-parts';

const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const productHtml = readFileSync(kitPath('product.html'), 'utf8');
const ITEM = { id: 'galleta', name: 'Galletas de pollo', amount: 3590, currency: 'BOB', stock: 9, imageUrls: [], description: 'Horneadas sin conservantes' };
const config = (items: unknown[]) => `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'huellitas', demo: true, sitePurpose: 'shop', data: { storeName: 'Huellitas', locations: [], categories: [], items } })};`;
const GOOD = `
<template data-pagosya-product-template><article class="t"><h3 data-product-field="name"></h3><p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button></article></template>
<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver canasta</button></div></template>
<template data-pagosya-cart-template><div class="canasta"><button data-cart-close>×</button><div data-cart-slot="lines"></div><div data-cart-slot="total"></div><div data-cart-slot="action"></div></div></template>
<template data-pagosya-cart-line-template><li class="linea"><h3 data-cart-field="name"></h3><div data-cart-field="quantity"></div><strong data-cart-field="line-total"></strong></li></template>
<template data-pagosya-checkout-template><div class="caja"><header data-checkout-slot="heading"></header><section data-checkout-slot="review"></section></div></template>`;
const shop = (templates: string) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header><button type="button" data-cart-open>Mi canasta <b data-cart-count>0</b></button></header><main><section data-pagosya-catalog></section></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p>${templates}</body></html>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });
async function onShop(templates: string, width: number, items: unknown[] = [ITEM]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
  try {
    await page.setContent(shop(templates));
    await page.addScriptTag({ content: config(items) });
    await page.addScriptTag({ content: commerce });
    await page.waitForSelector('[data-pagosya-catalog] .menu-item', { timeout: 5000 }).catch(() => {});
    const result = await inspectShopPage(page, width);
    seen = { card: await page.locator('[data-custom-product]').count(), checkout: await page.locator('[data-checkout-root]').count(), done: await page.locator('[data-pagosya-status]:has-text("Prueba completada")').count() };
    return result;
  } finally { await page.close(); }
}
let seen = { card: 0, checkout: 0, done: 0 };

describe('surface purchase check (spec 2026-10-15)', () => {
  it('passes a fully templated store at both widths', async () => {
    for (const width of [1280, 390]) {
      expect(await onShop(GOOD, width)).toEqual({ failures: [], reached: ['card', 'added', 'cart', 'cartLine', 'checkout'] });
      // Not vacuous: the templated card was there and the templated checkout completed the preview payment.
      expect(seen.card).toBeGreaterThan(0);
      expect(seen.done).toBeGreaterThan(0);
    }
  });
  it('names the part whose template the runtime rejected', async () => {
    const result = await onShop(GOOD.replace('<strong data-cart-field="line-total"></strong>', ''), 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'cartLine', check: 'template' })]));
    expect(result.failures.some(f => f.part === 'cart')).toBe(false);
  });
  it('fails the cart when its checkout action is hidden', async () => {
    const result = await onShop(GOOD.replace('<div data-cart-slot="action"></div>', '<div data-cart-slot="action" style="display:none"></div>'), 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'cart', check: 'checkout-action' })]));
  });
  it('fails a part that scrolls the page sideways on a phone', async () => {
    const result = await onShop(GOOD.replace('<div class="caja">', '<div class="caja" style="width:900px">'), 390);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'checkout', check: 'overflow' })]));
  });
  it('skips the purchase on an empty catalog and keeps the parts (Review Focus 1)', async () => {
    expect(await onShop(GOOD, 1280, [])).toEqual({ failures: [], reached: [], skipped: 'empty catalog' });
  });
  it('follows a product that needs an option to its page instead of failing the card (Review Focus 2)', async () => {
    const withOptions = { ...ITEM, id: 'collar', name: 'Collar', variants: [{ id: 'v1', amount: 3590, stock: 3, options: [{ name: 'Talla', value: 'S' }] }, { id: 'v2', amount: 3990, stock: 3, options: [{ name: 'Talla', value: 'M' }] }] };
    const result = await onShop(GOOD, 1280, [withOptions]);
    expect(result.failures.filter(f => f.part === 'card')).toEqual([]);
  });
  it('checks the product page template: title, price and buy in the first screen, buy adds', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    try {
      const template = '<template data-pagosya-product-page-template><article><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></article></template>';
      await page.setContent(productHtml.replace('</body>', `${template}</body>`));
      await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW_QUERY='?id=galleta';${config([ITEM])}` });
      await page.addScriptTag({ content: commerce });
      expect(await inspectProductPage(page, 1280)).toEqual([]);
      expect(await page.locator('[data-product-page-root]').count()).toBe(1);
    } finally { await page.close(); }
  });
  it('runs the whole check on a stored snapshot in the sandbox, templates injected from commerce-templates.json', async () => {
    const PAGE = '<template data-pagosya-product-page-template><article class="ficha"><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div data-product-slot="buy"></div></article></template>';
    const parts = [...(GOOD + PAGE).matchAll(/<template (data-pagosya-[a-z-]+-template)>[\s\S]*?<\/template>/g)].map(m => ({
      part: ({ 'data-pagosya-product-template': 'card', 'data-pagosya-added-template': 'added', 'data-pagosya-cart-template': 'cart', 'data-pagosya-cart-line-template': 'cartLine', 'data-pagosya-checkout-template': 'checkout', 'data-pagosya-product-page-template': 'productPage' } as Record<string, SurfacePart>)[m[1]], html: m[0], css: '' }));
    const index = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="config.js" defer></script><script src="commerce.js" defer></script></head><body><header><button type="button" data-cart-open>Mi canasta <b data-cart-count>0</b></button></header><main><section data-pagosya-catalog></section></main><div data-pagosya-cart hidden></div><p data-pagosya-status></p></body></html>`;
    const snapshot = { brief: { sitePurpose: 'shop' }, files: [
      { path: 'index.html', content: index },
      { path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify({ slug: 'huellitas', demo: true, sitePurpose: 'shop', data: { storeName: 'Huellitas', locations: [], categories: [], items: [ITEM] } })};` },
      { path: 'commerce.js', content: '' },
      { path: 'product.html', content: productHtml },
      { path: COMMERCE_TEMPLATES_FILE, content: composeTemplatesFile(parts) },
    ] } as any;
    // The product page is reached through the preview query (a probe document is not in preview: its buy stays disabled).
    expect(await checkSurfacesOnSnapshot(snapshot, new AbortController().signal)).toEqual({ failures: [], reached: ['card', 'added', 'cart', 'cartLine', 'checkout', 'productPage'] });
  });
  it('reports only the parts it reached when an earlier step breaks (review I4)', async () => {
    const result = await onShop(GOOD.replace('<button data-product-add>Agregar</button>', '<button data-product-add style="pointer-events:none">Agregar</button>'), 1280);
    expect(result.failures).toEqual([expect.objectContaining({ part: 'card', check: 'add' })]);
    expect(result.reached).toEqual(['card']);
  });
  it('fails a templated added notice that never shows (review I4)', async () => {
    const result = await onShop(GOOD.replace('<div class="aviso">', '<div class="aviso" style="display:none">'), 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'added', check: 'not-shown' })]));
  });
  it('checks that − brings the total back and the checkout total matches the cart (review I12)', async () => {
    const result = await onShop(GOOD, 390);
    expect(result.failures).toEqual([]);
  });
  // Live 2026-10-15 (Estudio Arco Pilates): the card's price box was narrower than «Bs 60,00» and cut it to «Bs 60,0».
  it('fails a part whose text is cut off by its own box', async () => {
    const cut = GOOD.replace('<p data-product-field="price"></p>', '<p data-product-field="price" style="width:40px;overflow:hidden;white-space:nowrap"></p>');
    const result = await onShop(cut, 1280);
    expect(result.failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'card', check: 'cut-off' })]));
    // A name shortened on purpose with an ellipsis is a design choice, not a cut.
    const ellipsis = GOOD.replace('<h3 data-product-field="name"></h3>', '<h3 data-product-field="name" style="width:60px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis"></h3>');
    expect((await onShop(ellipsis, 1280)).failures.filter(f => f.check === 'cut-off')).toEqual([]);
  });
  // The same store's real case: the price text spilled out of its narrow box and the add button's pill was painted over it.
  it('fails a card whose button is painted over its price text', async () => {
    const covered = GOOD.replace('<p data-product-field="price"></p><a data-product-link href="#">Ver</a><button data-product-add>Agregar</button>',
      '<div style="display:flex;align-items:center;gap:4px"><p data-product-field="price" style="width:40px;margin:0;flex:none;white-space:nowrap"></p><button data-product-add style="padding:8px 12px;background:#123;color:#fff;border:0;position:relative">Agregar</button></div><a data-product-link href="#">Ver</a>');
    expect((await onShop(covered, 1280)).failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'card', check: 'overlap' })]));
    const roomy = covered.replace('width:40px;', '');
    expect((await onShop(roomy, 1280)).failures.filter(f => f.check === 'overlap' || f.check === 'cut-off')).toEqual([]);
  });
  // Live check of the same store: a screen-reader-only «5 de 5» (1px box) was reported as cut.
  it('never reports visually hidden text as cut', async () => {
    const hidden = GOOD.replace('<h3 data-product-field="name"></h3>', '<h3 data-product-field="name"></h3><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">5 de 5 estrellas</span>');
    expect((await onShop(hidden, 1280)).failures.filter(f => f.check === 'cut-off' || f.check === 'overlap')).toEqual([]);
  });
  // Live 2026-10-15 (Estudio Arco Pilates, card redesign): YAPI left the card's link and add button empty — two blank pills.
  it('fails a part whose button or link shows nothing', async () => {
    const blank = GOOD.replace('<a data-product-link href="#">Ver</a><button data-product-add>Agregar</button>', '<a data-product-link href="#"></a><button data-product-add style="min-width:120px;min-height:40px"></button>');
    expect((await onShop(blank, 1280)).failures).toEqual(expect.arrayContaining([expect.objectContaining({ part: 'card', check: 'empty-control' })]));
    // An icon button (an svg inside, or a drawn ::before symbol) shows something.
    const icon = GOOD.replace('<button data-product-add>Agregar</button>', '<button data-product-add aria-label="Agregar"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 2v12M2 8h12" stroke="currentColor"/></svg></button>');
    expect((await onShop(icon, 1280)).failures.filter(f => f.check === 'empty-control')).toEqual([]);
  });
  it('never judges contrast over a gradient or image background it cannot measure (live run 2)', async () => {
    const result = await onShop(GOOD.replace('<div class="caja">', '<div class="caja" style="background:linear-gradient(#1d1b18,#2a2420);color:#f4ede4">'), 1280);
    expect(result.failures.filter(f => f.check === 'contrast')).toEqual([]);
  });
});
