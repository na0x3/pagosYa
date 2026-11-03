jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';

/** Lively one-product stores (spec 2026-11-03): kit behaviour under [data-pya-lively], read in Chromium. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'sofa', name: 'Sofá cama plegable', amount: 300000, currency: 'BOB', stock: 5, imageUrls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='] };
const PAGE = (extra = '') => `<div class="es" data-pya-lively><div data-pagosya-product-page data-product-id="sofa"${extra}></div><div style="height:2400px"></div><footer>pie</footer></div><section data-pagosya-cart></section>`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { body?: string; data?: Record<string, unknown>; config?: Record<string, unknown>; width?: number; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 }, reducedMotion: options.reducedMotion ?? 'no-preference' });
  const config = { slug: 'sofa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Sofá Nube', items: [ITEM], ...options.data }, ...options.config };
  await page.setContent(`<!doctype html><html lang="es"><head></head><body>${options.body ?? PAGE()}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  await page.waitForSelector('.product-detail__buy');
  return page;
}

describe('lively runtime', () => {
  it('marks the page, pulses the product add button until it is scrolled past', async () => {
    const page = await open();
    try {
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pya-lively'))).toBe(true);
      expect(await page.locator('.product-detail__buy[data-pya-pulse]').count()).toBe(1);
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForFunction(() => !document.querySelector('.product-detail__buy[data-pya-pulse]'));
    } finally { await page.close(); }
  });

  it('shows a WhatsApp bubble for a WhatsApp store with no assistant, never next to the assistant', async () => {
    const page = await open({ data: { checkoutMode: 'whatsapp', contactPhone: '+591 700 12345' } });
    try {
      await page.waitForSelector('a.pya-wa');
      expect(await page.getAttribute('a.pya-wa', 'href')).toBe('https://wa.me/59170012345');
      await page.evaluate(() => { const box = document.createElement('div'); box.setAttribute('data-pagosya-assistant', ''); document.body.append(box); });
      await page.waitForFunction(() => !document.querySelector('a.pya-wa'));
    } finally { await page.close(); }
  });

  it('stands still with reduced motion', async () => {
    const page = await open({ reducedMotion: 'reduce' });
    try {
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.product-detail__buy')!).animationName)).toBe('none');
    } finally { await page.close(); }
  });

  it('lifts the WhatsApp bubble above a visible buy bar', async () => {
    const page = await open({ width: 390, data: { checkoutMode: 'whatsapp', contactPhone: '70012345' } });
    try {
      await page.waitForSelector('a.pya-wa');
      await page.evaluate(() => { const bar = document.querySelector('[data-product-sticky]') as HTMLElement; bar.hidden = false; });
      await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--pya-lift').trim() !== '0px');
    } finally { await page.close(); }
  });

  it('does nothing without [data-pya-lively]', async () => {
    const page = await open({ body: PAGE().replace(' data-pya-lively', ''), data: { checkoutMode: 'whatsapp', contactPhone: '70012345' } });
    try {
      expect(await page.locator('.product-detail__buy[data-pya-pulse], a.pya-wa').count()).toBe(0);
    } finally { await page.close(); }
  });
});

describe('buy bar', () => {
  it('slides up on a laptop once the add button is passed, with photo and price, and hides near the footer', async () => {
    const page = await open();
    try {
      expect(await page.isVisible('[data-product-sticky]')).toBe(false);
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForSelector('[data-product-sticky]:not([hidden])');
      expect(await page.locator('[data-product-sticky] [data-product-sticky-photo]').count()).toBe(1);
      expect(await page.textContent('[data-product-sticky-price]')).toMatch(/3[.,]000/);
      await page.evaluate(() => document.querySelector('footer')!.scrollIntoView());
      await page.waitForSelector('[data-product-sticky][hidden]', { state: 'attached' });
    } finally { await page.close(); }
  });

  // The kit preselects every option except a fashion page's size, so an open size is how a choice is still pending.
  it('asks to choose options first while a size is still open (Review Focus 1)', async () => {
    const sized = { ...ITEM, variants: [{ id: 'v1', name: 'Gris S', amount: 300000, stock: 3, options: [{ name: 'Color', value: 'Gris' }, { name: 'Talla', value: 'S' }] }, { id: 'v2', name: 'Gris M', amount: 300000, stock: 3, options: [{ name: 'Color', value: 'Gris' }, { name: 'Talla', value: 'M' }] }] };
    const page = await open({ data: { items: [sized] }, config: { productPageStyle: 'fashion' } });
    try {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForSelector('[data-product-sticky]:not([hidden])');
      expect((await page.textContent('[data-product-jump]'))!.trim()).toBe('Elegir opciones');
    } finally { await page.close(); }
  });

  it('stays phone-only on a store that is not lively', async () => {
    const page = await open({ body: PAGE().replace(' data-pya-lively', '') });
    try {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(300);
      expect(await page.isHidden('[data-product-sticky]')).toBe(true);
    } finally { await page.close(); }
  });
});

describe('hero pills', () => {
  it('draws up to three pills over the product photo from data-product-pills', async () => {
    const page = await open({ body: PAGE(` data-product-pills='["Entrega en Santa Cruz","Llega en caja","Pago seguro","Cuarta de más"]'`) });
    try {
      expect(await page.locator('.product-detail__gallery .product-detail__pills li').allTextContents()).toEqual(['Entrega en Santa Cruz', 'Llega en caja', 'Pago seguro']);
    } finally { await page.close(); }
  });
  it('draws none with a broken attribute', async () => {
    const page = await open({ body: PAGE(` data-product-pills='not json'`) });
    try { expect(await page.locator('.product-detail__pills').count()).toBe(0); } finally { await page.close(); }
  });
});

// Live check 2026-11-03 (Studio preview): React draws the page after the kit runs, so [data-pya-lively] arrives late.
describe('late page', () => {
  it('turns lively when the flagged page is drawn after the kit has started', async () => {
    const page = await open({ body: PAGE().replace(' data-pya-lively', '') });
    try {
      expect(await page.evaluate(() => document.documentElement.hasAttribute('data-pya-lively'))).toBe(false);
      await page.evaluate(() => { const flag = document.createElement('div'); flag.setAttribute('data-pya-lively', ''); document.body.prepend(flag); });
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-pya-lively') && !!document.querySelector('.product-detail__buy[data-pya-pulse]'));
    } finally { await page.close(); }
  });
});

describe('pills never cover the badge or the photo dots (review 2026-11-03)', () => {
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  it('sits below the product badge on a laptop', async () => {
    const page = await open({ body: PAGE(` data-product-pills='["Llega en caja","Pago seguro"]'`), data: { items: [{ ...ITEM, badge: 'Más vendido' }] } });
    try {
      const badge = await page.locator('.product-detail__badge').first().boundingBox();
      const pills = await page.locator('.product-detail__pills').boundingBox();
      expect(badge).not.toBeNull();
      expect(overlap(badge!, pills!)).toBe(false);
    } finally { await page.close(); }
  });
  it('stays clear of the photo dots on a phone', async () => {
    const two = { ...ITEM, imageUrls: [ITEM.imageUrls[0], 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACw='] };
    const page = await open({ width: 390, body: PAGE(` data-product-pills='["Entrega en Santa Cruz","Llega comprimido en caja"]'`), data: { items: [two] } });
    try {
      const dots = await page.locator('.product-detail__thumbnails').first().boundingBox();
      const pills = await page.locator('.product-detail__pills').boundingBox();
      expect(dots).not.toBeNull();
      expect(overlap(dots!, pills!)).toBe(false);
    } finally { await page.close(); }
  });
});
