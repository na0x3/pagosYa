jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { validateStoreKitCss } from './source-kit-css';
import { contrastRatio } from './source-scorecard';

/** Sub-project 7: the store kit CSS in a real browser (jsdom drops @layer sheets). The served file is linked the way
 * the platform links it: after the store's stylesheet, marked data-pagosya-kit="store". */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] };
const DNA = { version: 1, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; kit?: string; body?: string; query?: string; cart?: unknown[] }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: [ITEM] }, ...(options.dna ? { dna: options.dna } : {}) };
  const served = options.kit === undefined ? '' : validateStoreKitCss(options.kit).css;
  const link = served ? `<link rel="stylesheet" href="data:text/css;base64,${Buffer.from(served).toString('base64')}" data-pagosya-kit="store">` : '';
  await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style>${link}</head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  return page;
}
const computed = (page: Page, selector: string, properties: string[]) => page.evaluate(([selector, properties]) => {
  const el = document.querySelector(selector as string);
  if (!el) return null;
  const style = getComputedStyle(el);
  return Object.fromEntries((properties as string[]).map(name => [name, style.getPropertyValue(name)]));
}, [selector, properties] as const);

describe('cascade: kit defaults < DNA < store kit CSS < the store\'s own unlayered CSS', () => {
  it('store kit CSS outranks the kit defaults (shoppingStyle) and every DNA cart placement', async () => {
    for (const dna of [undefined, { ...DNA, cart: 'drawer' }, { ...DNA, cart: 'sheet' }]) {
      const page = await open({ dna, kit: '.cart-drawer{background:rgb(9, 8, 7)}html[data-dna-cart=sheet] .cart-drawer{border-top-left-radius:3px}' });
      try {
        await page.waitForSelector('.menu-add');
        expect(await computed(page, '.cart-drawer', ['background-color'])).toEqual({ 'background-color': 'rgb(9, 8, 7)' });
        if (dna?.cart === 'sheet') expect(await computed(page, '.cart-drawer', ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '3px' });
      } finally { await page.close(); }
    }
  });

  it('restyles the product page over the DNA form, while the store\'s own rule on the same hook is still released', async () => {
    const page = await open({ dna: { ...DNA, button: 'pill' }, css: '.product-detail__buy{border-radius:0;letter-spacing:9px}', kit: '.product-detail__buy{border-radius:3px}@media (min-width:600px){.product-detail__price{font-size:31px}}', body: PRODUCT, query: '?id=taza' });
    try {
      await page.waitForSelector('.product-detail__buy');
      expect(await computed(page, '.product-detail__buy', ['border-top-left-radius', 'letter-spacing'])).toEqual({ 'border-top-left-radius': '3px', 'letter-spacing': 'normal' });
      expect(await computed(page, '.product-detail__price', ['font-size'])).toEqual({ 'font-size': '31px' });
      await page.evaluate(() => window.dispatchEvent(new Event('load')));
      expect(await computed(page, '.product-detail__buy', ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '3px' });
    } finally { await page.close(); }
  });

  it('yields to the store\'s own unlayered CSS on the same surface', async () => {
    const page = await open({ dna: DNA, css: '.cart-drawer{background:rgb(1, 2, 3)}', kit: '.cart-drawer{background:rgb(9, 8, 7);border-left-width:7px}' });
    try {
      await page.waitForSelector('.menu-add');
      expect(await computed(page, '.cart-drawer', ['background-color', 'border-left-width'])).toEqual({ 'background-color': 'rgb(1, 2, 3)', 'border-left-width': '7px' });
    } finally { await page.close(); }
  });

  it('a store without kit CSS keeps the kit drawer', async () => {
    const page = await open({});
    try {
      await page.waitForSelector('.menu-add');
      expect(await computed(page, '.cart-drawer', ['right', 'position'])).toEqual({ right: '0px', position: 'fixed' });
    } finally { await page.close(); }
  });
});

/** Contrast as the scorecard measures it: text composited over the ancestors' background colours (white below). */
async function contrastOf(page: Page, selector: string) {
  const [text, back] = await page.evaluate(sel => {
    const rgba = (value: string) => { const n = (value.match(/[\d.]+/g) || []).map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; };
    const over = (top: number[], base: number[]) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3]));
    const el = document.querySelector(sel)!;
    const layers: number[][] = [];
    for (let node: Element | null = el; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; }
    const bg = layers.reverse().reduce((base, layer) => over(layer, base), [255, 255, 255]);
    return [over(rgba(getComputedStyle(el).color), bg), bg];
  }, selector);
  return contrastRatio(text, back);
}
const guarded = (page: Page, selector: string) => page.waitForFunction(sel => document.querySelector(sel)?.hasAttribute('data-pagosya-contrast-guard'), selector, { timeout: 3000 });
const CART = [{ id: 'taza', quantity: 1 }];

describe('runtime contrast guard: pay and buy buttons and totals read at 4.5:1', () => {
  it('fixes a mid-tone pay button that no near-black or white reaches, and warns once', async () => {
    const page = await open({ css: '.cart-drawer .checkout-button{background:#797979;color:#fff}', cart: CART });
    const warnings: string[] = [];
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()); });
    try {
      await page.waitForSelector('.menu-add');
      await page.click('[data-cart-open]');
      await page.waitForSelector('dialog.cart-drawer[open] .checkout-button');
      await guarded(page, 'dialog.cart-drawer .checkout-button');
      expect(await contrastOf(page, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(4.5);
      expect(await computed(page, 'dialog.cart-drawer .checkout-button', ['background-color'])).toEqual({ 'background-color': 'rgb(121, 121, 121)' });
      expect(warnings.filter(text => /contraste/i.test(text))).toHaveLength(1);
    } finally { await page.close(); }
  });

  it('neutralises a store kit CSS colour and a store\'s own !important colour on the add button', async () => {
    for (const options of [{ kit: '.menu-add{background:#777;color:#888}' }, { css: '.menu-add{color:#eee!important;background:#fff}' }]) {
      const page = await open(options);
      try {
        await page.waitForSelector('.menu-add');
        await guarded(page, '.menu-add');
        expect(await contrastOf(page, '.menu-add')).toBeGreaterThanOrEqual(4.5);
      } finally { await page.close(); }
    }
  });

  it('leaves a readable button alone', async () => {
    const page = await open({ css: '.menu-add{background:#fff;color:#111}' });
    try {
      await page.waitForSelector('.menu-add');
      await page.waitForTimeout(500);
      expect(await page.evaluate(() => document.querySelectorAll('[data-pagosya-contrast-guard]').length)).toBe(0);
      expect(await computed(page, '.menu-add', ['color'])).toEqual({ color: 'rgb(17, 17, 17)' });
    } finally { await page.close(); }
  });

  it('fixes the total in the open cart (the store\'s !important colour defeats the text fix) and keeps it fixed after a re-render', async () => {
    const page = await open({ css: '.cart-drawer{background:#797979}.cart-drawer .order-total{color:#999!important}', cart: CART });
    try {
      await page.waitForSelector('.menu-add');
      await page.click('[data-cart-open]');
      await page.waitForSelector('dialog.cart-drawer[open] .order-total');
      await guarded(page, 'dialog.cart-drawer .order-total');
      expect(await contrastOf(page, 'dialog.cart-drawer .order-total strong')).toBeGreaterThanOrEqual(4.5);
      await page.click('dialog.cart-drawer [data-add]');
      await page.waitForFunction(() => document.querySelector('dialog.cart-drawer [data-cart-count], [data-cart-count]')?.textContent === '2');
      await guarded(page, 'dialog.cart-drawer .order-total');
      expect(await contrastOf(page, 'dialog.cart-drawer .order-total strong')).toBeGreaterThanOrEqual(4.5);
    } finally { await page.close(); }
  });
});
