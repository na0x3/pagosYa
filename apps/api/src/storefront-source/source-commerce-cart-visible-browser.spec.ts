/// <reference lib="dom" />
jest.setTimeout(120_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';

/** florart 3mst1q0y 2026-10-18: YAPI authored its own cart panel and styled `.cart-drawer` hidden and off-screen until its
 * own script set `body.cart-open`. The kit's runtime dialog wears that class too, so the cart opened as an invisible modal
 * and the whole page stopped answering («when I add something to cart the page totally freezes»). Whatever the store's CSS
 * says about `.cart-drawer`, the open kit cart is on screen, and closed it never covers the page. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const FLORART = `.cart-drawer { position: fixed; z-index: 80; top: 0; right: 0; display: flex; flex-direction: column; width: min(460px, 100%); height: 100dvh; padding: 22px; overflow-y: auto; visibility: hidden; transform: translateX(100%); background: #f6efe4; transition: transform .28s ease, visibility .28s ease; }
body.cart-open .cart-drawer { visibility: visible; transform: translateX(0); }`;
// Other ways a design hides its own drawer until a class arrives.
const HIDERS = [
  FLORART,
  '.cart-drawer{position:fixed;top:0;right:-100%;width:420px;height:100vh;opacity:0;pointer-events:none}.cart-drawer.is-open{right:0;opacity:1;pointer-events:auto}',
  '.cart-drawer{display:none}.cart-drawer.open{display:block}',
  '.cart-drawer{clip-path:inset(0 0 0 100%);height:0;overflow:hidden}',
];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(css: string, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  await page.setContent(`<!doctype html><html lang="es"><head><style>${css}body{margin:0}main{min-height:3000px}</style></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><main><section data-pagosya-catalog></section></main><aside class="cart-drawer" data-cart-drawer aria-hidden="true"><div data-pagosya-cart></div></aside><p data-pagosya-status></p></body></html>`);
  const data = { storeName: 'Marca', checkoutMode: 'payment', items: [{ id: 'ramo', name: 'Ramo', amount: 10000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] }] };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data })};` });
  await page.addScriptTag({ content: commerce });
  await page.waitForSelector('.menu-add');
  return page;
}
const drawerState = (page: Page) => page.evaluate(() => {
  const drawer = document.querySelector('dialog.cart-drawer') as HTMLDialogElement;
  const rect = drawer.getBoundingClientRect();
  const style = getComputedStyle(drawer);
  const hit = document.elementFromPoint(innerWidth - 40, innerHeight / 2);
  return {
    open: drawer.open,
    visible: drawer.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && style.clipPath === 'none',
    onScreen: rect.left >= 0 && rect.right <= innerWidth + 1 && rect.height >= innerHeight - 1,
    width: Math.round(rect.width),
    hitsDrawer: Boolean(hit && drawer.contains(hit)),
  };
});

describe('the kit cart against a store that styles .cart-drawer as its own hidden panel', () => {
  it.each(HIDERS.map((css, index) => [index, css]))('design %i: the cart opens on screen at desktop and phone width, and closes back to a usable page', async (_index, css) => {
    for (const width of [1440, 390]) {
      const page = await open(css as string, width);
      await page.click('.menu-add');
      await page.click('[data-cart-open]');
      await page.waitForTimeout(450);
      const opened = await drawerState(page);
      expect(opened).toMatchObject({ open: true, visible: true, onScreen: true, hitsDrawer: true });
      // Half the screen on desktop (owner 2026-10-17), the whole width on a phone.
      expect(opened.width).toBe(width === 390 ? 390 : 720);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(450);
      const closed = await drawerState(page);
      expect(closed).toMatchObject({ open: false, hitsDrawer: false });
      await page.mouse.wheel(0, 600); await page.waitForTimeout(200);
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
      await page.close();
    }
  });
});
