jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';

/** Sub-project 5 review: the cascade order is kit defaults < store DNA < the store's own CSS. jsdom has no
 * cascade layers, so these run in Chromium: the authored rule must win over every DNA form, and the DNA must
 * still restyle the surfaces the store left alone. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const DNA_VALUES: Record<string, string[]> = runInNewContext(`(${commerce.match(/const DNA_VALUES = (\{[\s\S]*?\n {2}\});/)![1]})`);
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] };
const DNA = { version: 1, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; body?: string; cart?: unknown[]; query?: string }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: [ITEM] }, ...(options.dna ? { dna: options.dna } : {}) };
  await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
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

describe('cascade: kit defaults < DNA < authored store CSS', () => {
  const AUTHORED = '.menu-add{border-radius:50%;padding:3px 5px}.cart-drawer{background:rgb(1, 2, 3)}.cart-added{bottom:77px;background:rgb(4, 5, 6)}';
  it.each(DNA_VALUES.button)('the store\'s own .menu-add, cart and notice styles win over the %s form', async button => {
    const page = await open({ dna: { ...DNA, button, cart: 'sheet', added: 'ribbon' }, css: AUTHORED });
    try {
      await page.waitForSelector('.menu-add');
      expect(await computed(page, '.menu-add', ['border-top-left-radius', 'padding-left'])).toEqual({ 'border-top-left-radius': '50%', 'padding-left': '5px' });
      expect(await computed(page, '.cart-drawer', ['background-color'])).toEqual({ 'background-color': 'rgb(1, 2, 3)' });
      expect(await computed(page, '.cart-added', ['bottom', 'background-color'])).toEqual({ bottom: '77px', 'background-color': 'rgb(4, 5, 6)' });
    } finally { await page.close(); }
  });

  it('the DNA still restyles the cart, the added notice, the review and the product page the store left alone', async () => {
    const page = await open({ dna: { ...DNA, cart: 'sheet', added: 'ribbon' } });
    try {
      await page.waitForSelector('.menu-add');
      expect(await computed(page, '.cart-drawer', ['border-top-left-radius', 'bottom'])).toEqual({ 'border-top-left-radius': '22px', bottom: '0px' });
      expect(await computed(page, '.cart-added', ['top'])).toEqual({ top: '0px' });
      expect(await computed(page, '.menu-add', ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '999px' });
    } finally { await page.close(); }
    const review = await open({ dna: { ...DNA, review: 'ticket' }, body: '<main><div data-pagosya-checkout-page></div></main><p data-pagosya-status></p>', cart: [{ id: 'taza', quantity: 1 }] });
    try {
      await review.waitForSelector('.checkout-review__summary');
      expect(await computed(review, '.checkout-review__summary', ['grid-column-start', 'border-top-style'])).toEqual({ 'grid-column-start': '2', 'border-top-style': 'dashed' });
    } finally { await review.close(); }
    // The product page stays platform-owned: authored rules on its hooks are released, and the DNA form applies.
    const product = await open({ dna: { ...DNA, button: 'pill' }, css: '.product-detail__buy{border-radius:0}', body: '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>', query: '?id=taza' });
    try {
      await product.waitForSelector('.product-detail__buy');
      expect(await computed(product, '.product-detail__buy', ['border-top-left-radius'])).toEqual({ 'border-top-left-radius': '999px' });
    } finally { await product.close(); }
  });

  it('a store without DNA keeps the kit defaults where it wrote nothing, and gets no DNA markup', async () => {
    const page = await open({});
    try {
      await page.waitForSelector('.menu-add');
      expect(await computed(page, '.cart-drawer', ['right', 'position'])).toEqual({ right: '0px', position: 'fixed' });
      expect(await computed(page, '.cart-added', ['bottom', 'right', 'position'])).toEqual({ bottom: '24px', right: '24px', position: 'fixed' });
      expect(await page.evaluate(() => [document.querySelector('style[data-pagosya-kit="dna"]'), document.querySelector('.cart-drawer__grip,.menu-item__image-alt,.menu-item__quick-look,.menu-item__swatches'), Array.from(document.documentElement.getAttributeNames()).filter(name => name.startsWith('data-dna-')).length])).toEqual([null, null, 0]);
    } finally { await page.close(); }
  });
});
