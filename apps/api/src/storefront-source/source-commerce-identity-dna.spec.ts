jest.setTimeout(180_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { contrastRatio } from './source-scorecard';
import { fixturePack } from './fixtures/motif-pack';

/** Identity libraries T2b: the new button forms and frames in a real browser (jsdom drops @layer sheets). */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] as string[] };
const BASE = { version: 1, hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PRODUCT = '<main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p>';
const FORMS = ['sticker', 'ticket', 'bubbly', 'brutal'];
const PALETTES: Record<string, string> = {
  light: ':root{--store-background:#fffaf0;--store-foreground:#1d1b18;--store-accent:#b4441f;--store-accent-foreground:#ffffff}body{background:#fffaf0;color:#1d1b18}',
  dark: ':root{--store-background:#141311;--store-foreground:#f3eee6;--store-accent:#f3c77a;--store-accent-foreground:#1a1308}body{background:#141311;color:#f3eee6}',
  // A pair that does not read (white on mid grey): the runtime guard must lift the text.
  failing: ':root{--store-background:#ffffff;--store-foreground:#222222;--store-accent:#8f8f8f;--store-accent-foreground:#ffffff}body{background:#fff;color:#222}',
};
let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; body?: string; query?: string; cart?: unknown[]; items?: unknown[]; kit?: string; pack?: unknown; width?: number }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 } });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: options.items ?? [ITEM] },
    ...(options.dna ? { dna: options.dna } : {}), ...(options.pack ? { motifPack: options.pack } : {}) };
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY=${JSON.stringify(options.query ?? '')};${options.cart ? `window.PAGOSYA_PREVIEW_CART=${JSON.stringify(options.cart)};` : ''}window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: options.kit ?? commerce });
  return page;
}
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
const height = (page: Page, selector: string) => page.$eval(selector, el => el.getBoundingClientRect().height);
async function tabTo(page: Page, selector: string) {
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); if (await page.evaluate(sel => document.activeElement?.matches(sel) ?? false, selector)) return; }
  throw new Error(`Tab never reached ${selector}`);
}

describe.each(FORMS)('the %s button form', form => {
  it.each(Object.keys(PALETTES))('keeps pay, buy and add buttons at 4.5:1 and full size (%s palette)', async palette => {
    const shop = await open({ dna: { ...BASE, button: form }, css: PALETTES[palette], cart: [{ id: 'taza', quantity: 1 }] });
    try {
      await shop.waitForSelector('.menu-add');
      await shop.waitForTimeout(300);
      expect(await shop.evaluate(() => document.documentElement.dataset.dnaButton)).toBe(form);
      expect(await contrastOf(shop, '.menu-add')).toBeGreaterThanOrEqual(4.5);
      expect(await height(shop, '.menu-add')).toBeGreaterThanOrEqual(44);
      await shop.click('[data-cart-open]');
      await shop.waitForSelector('dialog.cart-drawer[open] .checkout-button');
      await shop.waitForTimeout(300);
      expect(await contrastOf(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(4.5);
      expect(await height(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(48);
    } finally { await shop.close(); }
    const product = await open({ dna: { ...BASE, button: form }, css: PALETTES[palette], body: PRODUCT, query: '?id=taza' });
    try {
      await product.waitForSelector('[data-pagosya-product][data-style] .product-detail__buy');
      await product.waitForTimeout(300);
      expect(await contrastOf(product, '[data-pagosya-product] .product-detail__buy')).toBeGreaterThanOrEqual(4.5);
      expect(await height(product, '[data-pagosya-product] .product-detail__buy')).toBeGreaterThanOrEqual(48);
    } finally { await product.close(); }
  });
});

describe('form details', () => {
  it('drops the ticket notches while a button has keyboard focus, so the ring is never clipped', async () => {
    const shop = await open({ dna: { ...BASE, button: 'ticket' }, css: PALETTES.light });
    try {
      await shop.waitForSelector('.menu-add');
      expect(await shop.$eval('.menu-add', el => getComputedStyle(el).maskImage)).toContain('radial-gradient');
      await tabTo(shop, '.menu-add');
      expect(await shop.$eval('.menu-add', el => [getComputedStyle(el).maskImage, getComputedStyle(el).outlineStyle])).toEqual(['none', 'solid']);
    } finally { await shop.close(); }
  });

  it('gives sticker an offset ink shadow, brutal a thick ink border, and bubbly a larger pack icon', async () => {
    const facts: Record<string, any> = {};
    for (const form of ['pill', 'sticker', 'brutal', 'bubbly']) {
      const page = await open({ dna: { ...BASE, button: form }, css: PALETTES.light, body: PRODUCT, query: '?id=taza', pack: fixturePack() });
      try {
        await page.waitForSelector('[data-pagosya-product] .product-detail__buy [data-motif-icon="placed"] svg');
        facts[form] = await page.$eval('[data-pagosya-product] .product-detail__buy', buy => {
          const style = getComputedStyle(buy), icon = buy.querySelector('.pagosya-motif')!.getBoundingClientRect();
          return { shadow: style.boxShadow, border: style.borderTopWidth, icon: icon.width / parseFloat(style.fontSize) };
        });
      } finally { await page.close(); }
    }
    expect(facts.sticker.shadow).toMatch(/4px 4px 0px/);
    expect(facts.brutal.border).toBe('3px');
    expect(facts.bubbly.icon).toBeGreaterThan(facts.pill.icon + .1);
  });

  it('an older kit that does not know the new forms keeps its plain buttons, still sells, and holds the pay button at 4.5:1', async () => {
    const older = commerce.replace(/button: \[[^\]]*\]/, "button: ['pill', 'block', 'underline', 'tag', 'stamp', 'outline', 'ghost', 'split']");
    expect(older).not.toBe(commerce);
    for (const palette of ['light', 'failing']) {
      const shop = await open({ kit: older, dna: { ...BASE, button: 'bubbly' }, css: PALETTES[palette], cart: [{ id: 'taza', quantity: 1 }] });
      try {
        await shop.waitForSelector('.menu-add');
        expect(await shop.evaluate(() => [document.documentElement.hasAttribute('data-dna-button'), document.documentElement.dataset.dnaCart])).toEqual([false, 'drawer']);
        await shop.click('[data-cart-open]');
        await shop.waitForSelector('dialog.cart-drawer[open] .checkout-button');
        await shop.waitForTimeout(300);
        expect(await contrastOf(shop, 'dialog.cart-drawer .checkout-button')).toBeGreaterThanOrEqual(4.5);
      } finally { await shop.close(); }
    }
  });
});

describe('identity frames', () => {
  const PHOTO = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50"><rect width="40" height="50" fill="#c96"/><circle cx="20" cy="22" r="10" fill="#734"/></svg>').toString('base64');

  it('frames card and cart photos as a blob, a perforated stamp and taped corners', async () => {
    const facts: Record<string, any> = {};
    for (const frame of ['blob', 'stamp', 'tape']) {
      const page = await open({ dna: { ...BASE, button: 'pill', frame }, css: PALETTES.light, items: [{ ...ITEM, imageUrls: [PHOTO] }], cart: [{ id: 'taza', quantity: 1 }] });
      try {
        await page.waitForSelector('.menu-item .menu-item__image');
        facts[frame] = await page.$eval('.menu-item .menu-item__image', el => { const s = getComputedStyle(el); return { radius: s.borderTopLeftRadius, mask: s.maskImage, image: s.backgroundImage, pad: s.paddingTop }; });
        await page.click('[data-cart-open]');
        await page.waitForSelector('dialog.cart-drawer[open] .order-item__photo');
        facts[`${frame}-cart`] = await page.$eval('dialog.cart-drawer .order-item__photo', el => { const s = getComputedStyle(el); return { mask: s.maskImage, image: s.backgroundImage }; });
      } finally { await page.close(); }
    }
    expect(facts.blob.radius).toMatch(/%/);
    expect(facts.stamp.mask).toContain('radial-gradient');
    expect(facts.stamp.pad).toBe('8px');
    expect(facts['stamp-cart'].mask).toContain('radial-gradient');
    expect(facts.tape.image.match(/linear-gradient/g)).toHaveLength(4);
    expect(facts['tape-cart'].image.match(/linear-gradient/g)).toHaveLength(4);
  });

  it('gives the stamp frame a pad that reads against a light palette (finding 6)', async () => {
    const page = await open({ dna: { ...BASE, button: 'pill', frame: 'stamp' }, css: PALETTES.light, items: [{ ...ITEM, imageUrls: [PHOTO] }] });
    try {
      await page.waitForSelector('.menu-item .menu-item__image');
      const facts = await page.$eval('.menu-item .menu-item__image', el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, shadow: s.boxShadow }; });
      const rgb = (value: string) => (value.match(/[\d.]+/g) || []).map(Number);
      const pad = rgb(facts.bg), page_bg = rgb('rgb(255, 250, 240)');
      const distance = pad.slice(0, 3).reduce((sum, value, i) => sum + Math.abs(value - page_bg[i]), 0);
      expect(distance).toBeGreaterThan(10);
      expect(facts.shadow).not.toBe('none');
    } finally { await page.close(); }
  });
});
