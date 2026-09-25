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

async function open(options: { dna?: Record<string, unknown>; css?: string; kit?: string; body?: string; query?: string; cart?: unknown[]; items?: unknown[]; init?: string }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: options.items ?? [ITEM] }, ...(options.dna ? { dna: options.dna } : {}) };
  const served = options.kit === undefined ? '' : validateStoreKitCss(options.kit).css;
  const link = served ? `<link rel="stylesheet" href="data:text/css;base64,${Buffer.from(served).toString('base64')}" data-pagosya-kit="store">` : '';
  await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style>${link}</head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};${options.init ?? ''}` });
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

  it('holds the product page buy button and the card button as soon as they render, before any timer', async () => {
    const page = await open({ css: '.menu-add{background:#797979;color:#fff}', kit: '.product-detail__buy{background:#797979;color:#fff}', body: PRODUCT + '<section data-pagosya-catalog></section>', query: '?id=taza' });
    try {
      await page.waitForSelector('[data-pagosya-product][data-style] .product-detail__layout');
      expect(await contrastOf(page, '[data-pagosya-product] .product-detail__buy span')).toBeGreaterThanOrEqual(4.5);
      await page.waitForSelector('.menu-add');
      expect(await contrastOf(page, '.menu-add')).toBeGreaterThanOrEqual(4.5);
    } finally { await page.close(); }
  });

  it.each(['underline-grow', 'shine'])('sees through the DNA %s hover decoration, which paints no background at rest', async hover => {
    const page = await open({ dna: { ...DNA, hover }, kit: '.product-detail__buy{background-color:#797979;color:#fff}', body: PRODUCT, query: '?id=taza' });
    try {
      await page.waitForSelector('[data-pagosya-product][data-style] .product-detail__layout');
      expect(await computed(page, '[data-pagosya-product] .product-detail__buy', ['background-image'])).not.toEqual({ 'background-image': 'none' });
      expect(await contrastOf(page, '[data-pagosya-product] .product-detail__buy')).toBeGreaterThanOrEqual(4.5);
    } finally { await page.close(); }
  });

  it('leaves text over a real gradient alone: its background is unknown', async () => {
    const page = await open({ css: '.menu-add{background:linear-gradient(#000,#222);color:#fff}' });
    try {
      await page.waitForSelector('.menu-add');
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => document.querySelectorAll('.menu-add[data-pagosya-contrast-guard]').length)).toBe(0);
    } finally { await page.close(); }
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

const IMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#123"/></svg>');
const idle = async (page: Page) => { await page.waitForSelector('.menu-add'); await page.evaluate(() => window.dispatchEvent(new Event('load'))); await page.waitForTimeout(500); };
const guardOf = (page: Page, selector: string) => page.evaluate(sel => document.querySelector(sel)?.getAttribute('data-pagosya-contrast-guard') ?? null, selector);

describe('runtime contrast guard: backgrounds it cannot see, and interactive states', () => {
  it.each([
    ['a ::before background', '.x .checkout-button{position:relative;z-index:0;color:#fff}.x .checkout-button::before{content:"";position:absolute;inset:0;background:#000;z-index:-1}', '<div class="x" style="background:#fff"><a class="checkout-button" href="#">Pagar</a></div>'],
    ['a backdrop filter', '.x .checkout-button{backdrop-filter:blur(6px) brightness(.3);color:#fff}', '<div class="x" style="background:#fff"><a class="checkout-button" href="#">Pagar</a></div>'],
    ['a photo it sits over', '.x{position:relative;background:#fff}.x img{display:block}.x .checkout-button{position:absolute;left:8px;bottom:8px;color:#fff}', `<div class="x"><img src="${IMAGE}" width="200" height="200" alt=""><a class="checkout-button" href="#">Pagar</a></div>`],
  ])('leaves a label over %s alone: its real background is unknown', async (_label, css, markup) => {
    const page = await open({ css, body: CATALOG + markup });
    try {
      await idle(page);
      expect(await guardOf(page, '.x .checkout-button')).toBeNull();
      expect(await computed(page, '.x .checkout-button', ['color'])).toEqual({ color: 'rgb(255, 255, 255)' });
    } finally { await page.close(); }
  });

  it('measures against a dark canvas under color-scheme: dark, not white', async () => {
    const page = await open({ css: ':root{color-scheme:dark}.x .checkout-button{color:#eee}', body: CATALOG + '<div class="x"><a class="checkout-button" href="#">Pagar</a></div>' });
    try {
      await idle(page);
      expect(await guardOf(page, '.x .checkout-button')).toBeNull();
      expect(await computed(page, '.x .checkout-button', ['color'])).toEqual({ color: 'rgb(238, 238, 238)' });
    } finally { await page.close(); }
  });

  it('fixes the resting label but lets the store\'s hover and focus colours through', async () => {
    const page = await open({ css: '.menu-add{background:#797979;color:#fff}.menu-add:hover,.menu-add:focus-visible{background:#000;color:#fff}' });
    try {
      await page.waitForSelector('.menu-add');
      await guarded(page, '.menu-add');
      expect(await contrastOf(page, '.menu-add')).toBeGreaterThanOrEqual(4.5);
      await page.hover('.menu-add');
      expect(await computed(page, '.menu-add', ['color', 'background-color'])).toEqual({ color: 'rgb(255, 255, 255)', 'background-color': 'rgb(0, 0, 0)' });
      await page.mouse.move(1, 1);
      await page.focus('.menu-add');
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.matches('.menu-add:focus-visible'))).toBe(true);
      expect(await computed(page, '.menu-add', ['color'])).toEqual({ color: 'rgb(255, 255, 255)' });
      await page.evaluate(() => (document.activeElement as HTMLElement).blur());
      expect(await contrastOf(page, '.menu-add')).toBeGreaterThanOrEqual(4.5);
    } finally { await page.close(); }
  });

  it('does not measure a hovered control: its hover colours are never pinned onto its resting state', async () => {
    const page = await open({ css: '.menu-add{background:#111;color:#fff}.menu-add:hover{background:#ddd;color:#ccc}' });
    try {
      await page.waitForSelector('.menu-add');
      await page.hover('.menu-add');
      await page.evaluate(() => window.dispatchEvent(new Event('load')));
      await page.waitForTimeout(400);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      expect(await guardOf(page, '.menu-add')).toBeNull();
      expect(await computed(page, '.menu-add', ['color'])).toEqual({ color: 'rgb(255, 255, 255)' });
    } finally { await page.close(); }
  });
});

describe('the contrast passes go idle', () => {
  it('an idle catalog of 200 cards is not measured again and again (the text probe no longer re-triggers the observer)', async () => {
    // Counts the passes: each one reads the commerce slots once (queueReadableText) and the guarded controls once.
    const init = `window.__passes=0;const q=Document.prototype.querySelectorAll;Document.prototype.querySelectorAll=function(s){if(String(s).startsWith('[data-pagosya-catalog],'))window.__passes++;return q.call(this,s)};`;
    const items = Array.from({ length: 200 }, (_, i) => ({ ...ITEM, id: 'p' + i, name: 'Taza ' + i }));
    for (const css of ['', '.menu-add{background:#c2452e;color:#fff}.menu-item p{color:#eee}']) {
      const page = await open({ css, items, init });
      try {
        await page.waitForSelector('.menu-add');
        await page.waitForTimeout(800);
        const before = await page.evaluate(() => (window as unknown as { __passes: number }).__passes);
        await page.waitForTimeout(2000);
        const after = await page.evaluate(() => (window as unknown as { __passes: number }).__passes);
        expect(after - before).toBeLessThanOrEqual(2);
      } finally { await page.close(); }
    }
  });
});
