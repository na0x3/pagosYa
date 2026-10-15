/// <reference lib="dom" />
jest.setTimeout(300_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader } from './source-header';
import { CONTROL_FILLS, CONTROL_OUTLINES, type StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';

/** Spec 2026-10-14, part 5 testing: every outline × fill × layout at 1440 and 390, on the header controls, the card "+", the
 * steppers, the drawer close and the badge, with the real kit runtime and stylesheet. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const TOKENS = ':root{--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff}body{margin:0;font-family:Georgia,serif}';
const ITEMS = [
  { id: 'taza', name: 'Taza esmaltada de Cochabamba', description: 'Cerámica.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: [] },
  { id: 'cafe', name: 'Café de altura', description: 'Tostado medio.', amount: 8500, currency: 'BOB', stock: 30, imageUrls: [] },
];
const LAYOUTS: Array<StoreControls['layout']> = [{ cart: 'icon+word', account: 'icon' }, { cart: 'icon', account: 'icon+word' }, { cart: 'word', account: 'word' }];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(controls: StoreControls | undefined, width: number): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape: 'shrinking', purpose: 'shop', storeName: 'Tostadero Yungas', links: [{ href: '#tienda', label: 'Tienda' }], search: true, ...(controls ? { controls } : {}) });
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${TOKENS}</style></head><body>${header}<main><section id="tienda" data-nav-label="Tienda" data-pagosya-catalog></section></main><p data-pagosya-status></p></body></html>`);
  const config = { slug: 'tostadero', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: 'shop', cartWord: 'Tu pedido', ...(controls ? { controls } : {}), data: { storeName: 'Tostadero Yungas', items: ITEMS } };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().waitFor();
  return page;
}
async function openCartWithOne(page: Page) {
  await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click();
  await page.locator('header [data-cart-open]').click();
  await page.locator('.cart-drawer[open]').waitFor();
  await page.waitForTimeout(400);
}
type Fact = { slot: string; where: string; width: number; height: number; upright: boolean; face: boolean; icon: number };
const measure = (page: Page) => page.evaluate((): Fact[] => Array.from(document.querySelectorAll('[data-ctl]')).filter(el => (el as any).checkVisibility()).map(el => {
  const box = el.getBoundingClientRect(), face = el.querySelector('.ctl-face'), icon = el.querySelector('.ctl-icon');
  return { slot: el.getAttribute('data-ctl') ?? '', where: el.closest('[data-pagosya-header]') ? 'header' : el.closest('.cart-drawer') ? 'drawer' : 'card', width: box.width, height: box.height,
    upright: getComputedStyle(el).transform === 'none', face: Boolean(face && face.getBoundingClientRect().width > 0), icon: icon ? icon.getBoundingClientRect().width : 0 };
}));
/** Where the layout says a header control shows its icon; the card "+", the steppers and the close button always do. */
const drawsIcon = (fact: Fact, layout: StoreControls['layout']) => fact.where !== 'header' || (fact.slot === 'cart' ? layout.cart !== 'word' : fact.slot === 'account' || fact.slot === 'search' ? layout.account !== 'word' : true);

describe.each(LAYOUTS)('store controls with cart $cart and account $account (spec 2026-10-14)', layout => {
  it.each([1440, 390])('at %ipx every outline and fill keeps 44px upright targets, faces and icons, and the page width', async width => {
    const controls: StoreControls = { ...libraryRecord(CONTROL_LANGUAGES[0], 'cafe-food', 'cup'), layout, words: { cart: 'Tu portafolios', account: 'Mi cuenta' } };
    const page = await open(controls, width);
    try {
      await openCartWithOne(page);
      expect(await page.locator('header [data-cart-count]').textContent()).toBe('1');
      for (const outline of CONTROL_OUTLINES) for (const fill of CONTROL_FILLS) {
        await page.evaluate(([o, f]) => { for (const el of [document.documentElement, document.querySelector('header')!]) { el.setAttribute('data-controls-outline', o); el.setAttribute('data-controls-fill', f); } }, [outline, fill]);
        const label = `${outline}/${fill}@${width}`;
        const facts = await measure(page);
        expect({ label, slots: [...new Set(facts.map(fact => `${fact.where}:${fact.slot}`))] })
          .toEqual({ label, slots: expect.arrayContaining(['card:plus', 'drawer:close', 'drawer:minus', 'drawer:plus', 'header:cart']) });
        for (const fact of facts) {
          expect({ label, at: `${fact.where}:${fact.slot}`, ok: fact.width >= 44 && fact.height >= 44 && fact.upright && fact.face, icon: drawsIcon(fact, layout) ? fact.icon >= 16 : true })
            .toEqual({ label, at: `${fact.where}:${fact.slot}`, ok: true, icon: true });
        }
        expect({ label, wide: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1) }).toEqual({ label, wide: false });
      }
    } finally { await page.close(); }
  });
});

it('the badge hides at zero and the cart reads «Carrito, N productos» to a screen reader', async () => {
  const page = await open(libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'postage-stamp')!, 'cafe-food', 'cup'), 390);
  try {
    const badgeWidth = () => page.locator('header [data-cart-count]').evaluate(el => el.getBoundingClientRect().width);
    expect(await badgeWidth()).toBeLessThanOrEqual(1);
    expect(await page.getByRole('button', { name: 'Carrito, 0 productos', exact: true }).count()).toBe(1);
    await page.locator('[data-pagosya-catalog] .menu-add[data-add]').first().click();
    await page.waitForFunction(() => document.querySelector('header [data-cart-count]')?.textContent === '1');
    expect(await badgeWidth()).toBeGreaterThan(4);
    expect(await page.getByRole('button', { name: 'Carrito, 1 producto', exact: true }).count()).toBe(1);
  } finally { await page.close(); }
});

it("a store without a record keeps today's kit controls", async () => {
  const page = await open(undefined, 390);
  try {
    await openCartWithOne(page);
    expect(await page.locator('[data-ctl]').count()).toBe(0);
    expect(await page.locator('.cart-drawer__header [data-cart-close]').textContent()).toBe('×');
    expect(await page.locator('[data-pagosya-catalog] .menu-add[data-add] path').first().getAttribute('d')).toBe('M12 5v14M5 12h14');
  } finally { await page.close(); }
});
