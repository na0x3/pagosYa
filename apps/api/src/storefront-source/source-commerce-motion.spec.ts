jest.setTimeout(90_000);
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_MOTION_TOKENS } from './source-motion-tokens';

/** Sub-project 6: the store's motion personality (html[data-dna-motion]) drives the kit's timing through --motion-* tokens.
 * jsdom drops any stylesheet with @layer, so the resolved tokens and transitions are read in Chromium. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const ITEM = { id: 'taza', name: 'Taza', amount: 12000, currency: 'BOB', stock: 5, imageUrls: [] };
const DNA = { version: 1, button: 'pill', hover: 'lift', press: 'squash', radius: 'round', border: 'hairline', frame: 'rounded', cart: 'drawer', added: 'toast', review: 'split', card: 'still' };
const CATALOG = '<header><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button></header><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>';
const PERSONALITIES = Object.keys(SOURCE_MOTION_TOKENS) as Array<keyof typeof SOURCE_MOTION_TOKENS>;

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(options: { dna?: Record<string, unknown>; css?: string; body?: string; settings?: Record<string, unknown>; runtime?: string; reducedMotion?: 'reduce' | 'no-preference' } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: options.reducedMotion ?? 'no-preference' });
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, data: { storeName: 'Marca', items: [ITEM] }, ...(options.dna ? { dna: options.dna } : {}), ...options.settings };
  await page.setContent(`<!doctype html><html lang="es"><head><style>${options.css ?? ''}</style></head><body>${options.body ?? CATALOG}</body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: options.runtime ?? commerce });
  return page;
}
const rootTokens = (page: Page, names: string[]) => page.evaluate(names => {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(names.map(name => [name, style.getPropertyValue(name).trim()]));
}, names);

describe('motion tokens resolve through the kit CSS', () => {
  it.each(PERSONALITIES)('html[data-dna-motion=%s] resolves every --motion-* token to the table', async personality => {
    const page = await open({ dna: { ...DNA, motion: personality } });
    try {
      const t = SOURCE_MOTION_TOKENS[personality];
      const tokens = await rootTokens(page, ['--motion-ease', '--motion-ease-settle', '--motion-ease-exit', '--motion-ease-settle-exit', '--motion-fast', '--motion-base', '--motion-slow', '--motion-distance', '--motion-stagger', '--motion-parallax', '--motion-press-scale']);
      expect(tokens).toEqual({
        '--motion-ease': t.ease, '--motion-ease-settle': t.settle, '--motion-ease-exit': t.exit, '--motion-ease-settle-exit': t.settleExit,
        '--motion-fast': `${t.fast}ms`, '--motion-base': `${t.base}ms`, '--motion-slow': `${t.slow}ms`, '--motion-distance': `${t.distance}px`,
        '--motion-stagger': `${t.stagger}ms`, '--motion-parallax': String(t.parallax), '--motion-press-scale': String(t.press),
      });
    } finally { await page.close(); }
  });

  it('snappy resolves --motion-base to 200ms, and --ease-out / --ease-drawer / --kit-ease to its settle curve', async () => {
    const page = await open({ dna: { ...DNA, motion: 'snappy' } });
    try {
      expect(await rootTokens(page, ['--motion-base', '--ease-out', '--ease-drawer', '--kit-ease'])).toEqual({ '--motion-base': '200ms', '--ease-out': 'cubic-bezier(.2,.9,.2,1)', '--ease-drawer': 'cubic-bezier(.2,.9,.2,1)', '--kit-ease': 'cubic-bezier(.2,.9,.2,1)' });
    } finally { await page.close(); }
  });

  it('the store\'s own :root tokens win over the personality', async () => {
    const page = await open({ dna: { ...DNA, motion: 'cinematic' }, css: ':root{--motion-base:777ms;--ease-out:linear}' });
    try {
      expect(await rootTokens(page, ['--motion-base', '--ease-out', '--motion-slow'])).toEqual({ '--motion-base': '777ms', '--ease-out': 'linear', '--motion-slow': '900ms' });
    } finally { await page.close(); }
  });

  it('defines no motion token, and leaves --ease-out undefined, for a store without a personality', async () => {
    for (const dna of [undefined, DNA, { ...DNA, motion: 'wobbly' }]) {
      const page = await open({ dna });
      try {
        expect({ dna: dna ? 'dna' : 'none', tokens: await rootTokens(page, ['--motion-base', '--motion-ease', '--ease-out', '--ease-drawer']) })
          .toEqual({ dna: dna ? 'dna' : 'none', tokens: { '--motion-base': '', '--motion-ease': '', '--ease-out': '', '--ease-drawer': '' } });
      } finally { await page.close(); }
    }
  });
});
