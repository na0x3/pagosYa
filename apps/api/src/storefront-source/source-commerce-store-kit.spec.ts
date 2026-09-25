jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { validateStoreKitCss } from './source-kit-css';

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
