jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import * as ts from 'typescript';
import { kitPath } from '@pagosya/storefront-kit';

/** Sub-project 3: a DNA motif paints only inside its slot. The markup reaches the page after the API sanitiser, but its
 * geometry is free (a path may reach far outside the viewBox, an inner group may scale it up), so the slot itself clips
 * the paint: a few px of margin for the glow's drop-shadow, never over a price, a buy button or a total. Measured in
 * Chromium from the pixels, for the kit's product slot and for the checkout's order confirmation. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const checkoutMotif = ts.transpileModule(readFileSync(join(__dirname, '../../../checkout/src/checkout-motif.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const checkoutCss = readFileSync(join(__dirname, '../../../checkout/src/checkout-branding.css'), 'utf8');
const MARGIN = 10; // the clip allows 8px for the glow; 2px for antialiasing
const HOSTILE: Record<string, string> = {
  'a path far outside the viewBox': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M-400 -40H900V400H-400z" fill="currentColor"/></svg>',
  'a transform on the root svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" transform="translate(0 120) scale(4)"><path d="M0 0h64v64H0z" fill="currentColor"/></svg>',
  'an inner group scaled up': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(-96 -96) scale(4)"><path d="M0 0h64v64H0z" fill="currentColor"/></g></svg>',
};
/** Everything but the motif is hidden, so every painted (non-white) pixel belongs to the motif. */
const ONLY_MOTIF = (holder: string) => `html,body{background:#fff!important}body *{visibility:hidden!important}${holder},${holder} *{visibility:visible!important}${holder}{color:#f00!important}`;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

/** The holder's box and the bounding box of every painted pixel in the viewport. */
async function paint(page: Page, holder: string) {
  const box = await page.$eval(holder, el => el.getBoundingClientRect().toJSON());
  const png = (await page.screenshot()).toString('base64');
  const painted = await page.evaluate(async (data: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, img.width, img.height);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (px[i] > 245 && px[i + 1] > 245 && px[i + 2] > 245) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1); top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    return { left, top, right, bottom };
  }, png);
  return { box, painted };
}
function expectInside({ box, painted }: Awaited<ReturnType<typeof paint>>) {
  expect(painted.right).toBeGreaterThan(painted.left); // it painted something
  expect(painted.left).toBeGreaterThanOrEqual(box.left - MARGIN);
  expect(painted.top).toBeGreaterThanOrEqual(box.top - MARGIN);
  expect(painted.right).toBeLessThanOrEqual(box.right + MARGIN);
  expect(painted.bottom).toBeLessThanOrEqual(box.bottom + MARGIN);
}

describe('a motif paints only inside its slot', () => {
  const ITEMS = [{ id: 'lamp', name: 'Lámpara Luna', amount: 42000, currency: 'BOB', stock: 5, imageUrls: [], categoryId: 'luz' }];
  // The store's own CSS cannot lift the clip either.
  const STORE_CSS = '.pagosya-motif{clip-path:none!important;overflow:visible!important;display:contents!important;contain:none!important}';
  it.each(Object.entries(HOSTILE))('kit product slot: %s', async (_label, svg) => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 }, reducedMotion: 'reduce' });
    try {
      const motifs = [{ file: 'motifs/lampara.svg', for: 'store', target: 'Lámpara', behavior: 'grow', trigger: 'appear', placement: 'product', svg }];
      const config = { slug: 'luz', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, productPageStyle: 'editorial', data: { storeName: 'Luz', items: ITEMS, categories: [{ id: 'luz', name: 'Iluminación' }] }, dna: { version: 1, motion: 'calm' }, motifs };
      await page.setContent(`<!doctype html><html><head><style>${STORE_CSS}${ONLY_MOTIF('.pagosya-motif')}</style></head><body><main data-pagosya-product-page></main><section data-pagosya-cart></section></body></html>`);
      await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_PREVIEW_QUERY='?id=lamp';window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
      await page.addScriptTag({ content: commerce });
      await page.waitForSelector('.pagosya-motif svg');
      await page.waitForTimeout(100);
      expectInside(await paint(page, '.pagosya-motif'));
    } finally { await page.close(); }
  });
  it.each(Object.entries(HOSTILE))('checkout confirmation: %s', async (_label, svg) => {
    const page = await browser.newPage({ viewport: { width: 800, height: 700 }, reducedMotion: 'reduce' });
    try {
      await page.setContent(`<!doctype html><html><head><style>${checkoutCss}${ONLY_MOTIF('#app .payment-success-motif')}</style></head><body><div id="app"><section class="payment-success-panel" style="padding:24px;text-align:center"><p class="status">Pago confirmado</p><div class="receipt"><strong class="order-total">Total Bs 420</strong></div></section></div></body></html>`);
      await page.addScriptTag({ content: `(function(){var exports={};var module={exports:exports};${checkoutMotif};window.__motif=exports;})();` });
      await page.evaluate((markup: string) => {
        const motif = (window as any).__motif;
        motif.rememberConfirmationMotif({ behavior: 'grow', svg: markup });
        motif.mountConfirmationMotif(document.querySelector('.payment-success-panel'));
      }, svg);
      await page.waitForSelector('#app .payment-success-motif svg');
      await page.waitForTimeout(100);
      expectInside(await paint(page, '#app .payment-success-motif'));
    } finally { await page.close(); }
  });
});
