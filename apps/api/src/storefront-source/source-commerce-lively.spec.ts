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

async function open(options: { body?: string; data?: Record<string, unknown>; width?: number; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 1280, height: 800 }, reducedMotion: options.reducedMotion ?? 'no-preference' });
  const config = { slug: 'sofa', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Sofá Nube', items: [ITEM], ...options.data } };
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
