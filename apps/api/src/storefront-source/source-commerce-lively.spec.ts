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

describe('buy bar footer (live check 2026-11-03)', () => {
  it('watches the page footer, not a footer inside a fixed card', async () => {
    const card = '<aside style="position:fixed;left:0;top:0"><footer>tarjeta</footer></aside>';
    const page = await open({ body: card + PAGE() });
    try {
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForSelector('[data-product-sticky]:not([hidden])', { timeout: 5000 });
    } finally { await page.close(); }
  });
});

describe('colour cards (spec 2026-11-03 premium landing)', () => {
  // Distinct valid base64 GIFs: the kit's safeUrl refuses a data URL with anything after the base64.
  const GIFS = ['R0lGODlhAQABAAAAACw=', 'R0lGODlhAQABAIAAAP///wAAACw=', 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='].map(data => `data:image/gif;base64,${data}`);
  const colours = (photos: Array<string | undefined>, amount = 300000) => ({ ...ITEM, amount, variants: photos.map((photo, at) => ({ id: `v${at}`, name: `C${at}`, amount, stock: 3, options: [{ name: 'Color', value: `C${at}` }], ...(photo ? { imageUrls: [photo] } : {}) })) });
  const CARDS = (id = 'sofa') => PAGE().replace('<div style="height:2400px"></div>', `<section id="colores" data-lb="variant-cards"><div data-pagosya-variant-cards data-product-id="${id}"></div></section><a href="#colores" data-needs-colour-cards>Ver colores</a><div style="height:2400px"></div>`);
  it('draws one card per photographed colour and picks it in the buy box', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([GIFS[0], GIFS[1], GIFS[2]])] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card').count()).toBe(3);
      await page.locator('.pya-colour-card').nth(1).click();
      await page.waitForFunction(() => document.querySelector('[data-product-option="0"][data-option-value="1"]')?.getAttribute('aria-pressed') === 'true');
      expect(await page.locator('.pya-colour-card').first().textContent()).toMatch(/desde/i);
    } finally { await page.close(); }
  });
  it('hides itself and «Ver colores» with fewer than two photographed colours (Review Focus 1)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([GIFS[0], undefined])] } });
    try {
      await page.waitForFunction(() => (document.querySelector('#colores') as HTMLElement).hidden && (document.querySelector('[data-needs-colour-cards]') as HTMLElement).hidden);
    } finally { await page.close(); }
  });
  it('shows no «desde» while the price is still to confirm (Review Focus 2)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([GIFS[0], GIFS[1]], 0)] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card', { hasText: /desde/i }).count()).toBe(0);
    } finally { await page.close(); }
  });
  it('makes one card per distinct photo (Review Focus 3)', async () => {
    const page = await open({ body: CARDS(), data: { items: [colours([GIFS[0], GIFS[0], GIFS[1]])] } });
    try {
      await page.waitForSelector('.pya-colour-card');
      expect(await page.locator('.pya-colour-card').count()).toBe(2);
    } finally { await page.close(); }
  });
  it('hides itself and «Ver colores» when its product is not in the catalogue (review 2026-11-03)', async () => {
    const page = await open({ body: CARDS('gone'), data: { items: [colours([GIFS[0], GIFS[1]])] } });
    try {
      await page.waitForFunction(() => (document.querySelector('#colores') as HTMLElement).hidden && (document.querySelector('[data-needs-colour-cards]') as HTMLElement).hidden, undefined, { timeout: 5000 });
    } finally { await page.close(); }
  });
});
