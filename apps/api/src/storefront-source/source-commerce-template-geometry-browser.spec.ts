/// <reference lib="dom" />
jest.setTimeout(120_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';

/** Pokeate dfzr6vxn 2026-10-18 («the animation when something is added to cart is cut off», the cart and pre-checkout
 * «very empty» and «cramped»): YAPI's own templates positioned themselves, and the kit's carriers moved them.
 * - added: a fixed bottom-right card inside the ribbon DNA notice, whose transform re-anchored it 164px above the screen;
 * - cart: the store's fixed 440px mount plus a fixed 50vw template panel inside the kit dialog, two overlapping columns. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const ADDED = `<style>.pk-added{position:fixed;right:24px;bottom:24px;width:min(440px,calc(100vw - 40px));background:#f4e8cf;color:#10241f;animation:pk-in 420ms both}@keyframes pk-in{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}</style>
<template data-pagosya-added-template><section class="pk-added"><img data-added-field="photo"><p data-added-field="message"></p><p data-added-field="name"></p><button data-cart-open>ver tu mesa</button></section></template>`;
const CART = `<style>.cart-runtime:not([hidden]){position:fixed;z-index:50;right:0;top:0;width:min(100%,440px);height:100dvh;overflow:auto;background:#f4e8cf;padding:22px}
.pk-cart{position:fixed;top:0;right:0;display:flex;flex-direction:column;width:min(50vw,760px);min-width:420px;height:100dvh;padding:28px 48px;background:#145846;color:#f4e8cf}.pk-cart__foot{margin-top:auto}</style>
<template data-pagosya-cart-template><aside class="pk-cart"><header><h2>tu mesa</h2><button data-cart-close aria-label="Cerrar">×</button></header><div data-cart-slot="empty"></div><div data-cart-slot="lines"></div><footer class="pk-cart__foot"><div data-cart-slot="total"></div><div data-cart-slot="action"></div></footer></aside></template>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(templates: string, dna: Record<string, string> = {}, width = 1440): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.setContent(`<!doctype html><html lang="es"><head><style>body{margin:0}main{min-height:3000px}</style></head><body><header><button data-cart-open>Pedido <span data-cart-count></span></button></header><main><section data-pagosya-catalog></section></main><aside data-pagosya-cart class="cart-runtime" hidden aria-label="Tu pedido"></aside><p data-pagosya-status></p>${templates}</body></html>`);
  const data = { storeName: 'Marca', checkoutMode: 'payment', items: [{ id: 'pano', name: 'Paño de mesa profesional', amount: 32000, currency: 'BOB', stock: null, imageUrls: [], variants: [], extras: [] }] };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, dna: { version: 1, ...dna }, data })};` });
  await page.addScriptTag({ content: commerce });
  await page.waitForSelector('[data-pagosya-catalog] [data-add]');
  return page;
}
const box = (page: Page, selector: string) => page.evaluate(s => { const r = document.querySelector(s)!.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width) }; }, selector);

describe('a store template the kit carries keeps its place on screen', () => {
  for (const added of ['ribbon', 'bubble', 'stamp', 'toast']) {
    it(`shows a fixed added template whole under the ${added} notice`, async () => {
      const page = await open(ADDED, { added });
      await page.locator('[data-pagosya-catalog] [data-add]').first().click();
      await page.waitForTimeout(600);
      const card = await box(page, '.pk-added');
      // Its own place: 24px from the bottom right corner of the screen, not of the ribbon.
      expect([card.right, card.bottom]).toEqual([1416, 876]);
      // The carrier paints nothing of its own around it and lets the page take clicks.
      const carrier = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('.cart-added')!); return { background: s.backgroundColor, pointer: s.pointerEvents }; });
      expect(carrier).toEqual({ background: 'rgba(0, 0, 0, 0)', pointer: 'none' });
      await page.close();
    });
  }

  it('keeps a template in the flow inside the DNA notice, which still paints and places it', async () => {
    const page = await open('<template data-pagosya-added-template><div class="aviso"><span data-added-field="message"></span><button data-cart-open>Ver</button></div></template>', { added: 'ribbon' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.cart-added')!).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    expect((await box(page, '.aviso')).top).toBeGreaterThanOrEqual(0);
    await page.close();
  });

  it('lets the button of a fixed added template open the cart', async () => {
    const page = await open(ADDED, { added: 'ribbon' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('.pk-added [data-cart-open]').click({ timeout: 2000 });
    expect(await page.evaluate(() => (document.querySelector('dialog.cart-drawer') as HTMLDialogElement).open)).toBe(true);
    await page.close();
  });

  it('draws a fixed cart template inside a fixed authored mount as the one panel filling the drawer', async () => {
    const page = await open(CART, { cart: 'drawer' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('header [data-cart-open]').click();
    await page.waitForTimeout(500);
    const drawer = await box(page, 'dialog.cart-drawer');
    const panel = await box(page, '.pk-cart');
    expect(drawer.width).toBe(720);
    // Inside the drawer's own left border, flush with its right edge and top.
    expect(panel.left - drawer.left).toBeLessThanOrEqual(3);
    expect({ right: panel.right, top: panel.top }).toEqual({ right: drawer.right, top: 0 });
    // The mount around the template gives up its own cream panel.
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('dialog [data-pagosya-cart]')!).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    // The template's footer still sits at the bottom of the screen.
    expect((await box(page, '.pk-cart__foot')).bottom).toBeGreaterThan(850);
    await page.close();
  });

  // Pokeate's checkout ticket left the review 652px: the ticket DNA split it 320 + 260px and the summary broke
  // «Paño de mesa profesional» mid-word, with the price under the quantity buttons.
  it('lays the review out in one column when the checkout template gives it a narrow slot', async () => {
    const page = await open(`<style>.pk-ticket{max-width:652px;margin:0 auto}</style><template data-pagosya-checkout-template><main class="pk-checkout"><div data-checkout-slot="heading"></div><section class="pk-ticket"><div data-checkout-slot="review"></div></section></main></template>`, { review: 'ticket' });
    await page.locator('[data-pagosya-catalog] [data-add]').first().click();
    await page.locator('header [data-cart-open]').click();
    await page.locator('dialog [data-checkout]').first().click();
    await page.waitForSelector('[data-pagosya-checkout]:not([hidden]) .checkout-review__summary');
    const summary = await box(page, '[data-pagosya-checkout] .checkout-review__summary');
    const fields = await box(page, '[data-pagosya-checkout] .checkout-review__fields');
    expect(summary.width).toBeGreaterThan(600);
    expect(fields.left).toBe(summary.left);
    await page.close();
  });
});
