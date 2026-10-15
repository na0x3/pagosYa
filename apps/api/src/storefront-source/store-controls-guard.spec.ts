/// <reference lib="dom" />
jest.setTimeout(180_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { renderSourceHeader } from './source-header';
import type { StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';
import { inspectControlsPage, judgeControls, type ControlFailure } from './store-controls-guard';

/** The controls guard (spec 2026-10-14, part 5) on the real header, stylesheet and kit runtime. */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LIGHT = '--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff';
const DARK = '--store-background:#16120f;--store-foreground:#f4ede4;--store-accent:#e0b070;--store-accent-foreground:#16120f';
const BASE: StoreControls = libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup');

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function inspect(controls: StoreControls, width: number, options: { tokens?: string; body?: string } = {}): Promise<ControlFailure[]> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  try {
    const header = renderSourceHeader({ shape: 'shrinking', purpose: 'shop', storeName: 'Tostadero', links: [{ href: '#a', label: 'Inicio' }], search: true, controls });
    await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{${options.tokens ?? LIGHT}}body{margin:0;background:var(--store-background);color:var(--store-foreground)}section{min-height:900px}</style></head><body>${header}<main><section id="a" data-nav-label="Inicio"></section></main>${options.body ?? ''}<p data-pagosya-status></p></body></html>`);
    await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 't', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: 'shop', controls, data: { storeName: 'Tostadero', items: [] } })};` });
    await page.addScriptTag({ content: commerce });
    return await inspectControlsPage(page, width);
  } finally { await page.close(); }
}

describe('the store controls guard (spec 2026-10-14, part 5)', () => {
  it.each([1440, 390])('passes a library language on a light store and an ink language on a dark store at %ipx', async width => {
    expect(await inspect(BASE, width)).toEqual([]);
    expect(await inspect({ ...BASE, shape: { ...BASE.shape, colour: 'ink', fill: 'ghost' } }, width, { tokens: DARK })).toEqual([]);
  });

  it('drops a paper outline on a paper header: its word and icon cannot be read', async () => {
    const failures = await inspect({ ...BASE, shape: { ...BASE.shape, fill: 'outline', colour: 'paper', border: 'solid' } }, 390);
    expect(failures.some(failure => failure.slot === 'cart' && failure.check === 'contrast')).toBe(true);
    expect(judgeControls(failures).drop).toBe(true);
  });

  it('fails only the icon of a cart drawn as a 2px dot (valid path data, too small to read)', async () => {
    const failures = await inspect({ ...BASE, icons: { ...BASE.icons, cart: 'M11 11h2v2h-2z' } }, 1440);
    expect(failures).toEqual([expect.objectContaining({ slot: 'cart', check: 'icon' })]);
    expect(judgeControls(failures)).toMatchObject({ drop: false, iconSlots: ['cart'] });
  });

  it('drops a record whose controls something else covers', async () => {
    const failures = await inspect(BASE, 390, { body: '<div style="position:fixed;inset:0 0 auto 0;height:120px;z-index:2147483646;background:rgb(0 0 0 / .01)"></div>' });
    expect(failures.some(failure => failure.check === 'covered')).toBe(true);
    expect(judgeControls(failures).drop).toBe(true);
  });
});

describe('judgeControls', () => {
  it('keeps the record for icon failures only and names each failing slot once', () => {
    expect(judgeControls([{ width: 390, slot: 'cart', check: 'icon', detail: 'x' }, { width: 1440, slot: 'cart', check: 'icon', detail: 'x' }, { width: 390, slot: 'menu', check: 'icon', detail: 'x' }]))
      .toEqual({ drop: false, iconSlots: ['cart', 'menu'], reasons: ['390px cart: icon (x)', '1440px cart: icon (x)', '390px menu: icon (x)'] });
    expect(judgeControls([{ width: 390, slot: 'cart', check: 'size', detail: '40x40px, needs 44x44' }]).drop).toBe(true);
    expect(judgeControls([])).toEqual({ drop: false, iconSlots: [], reasons: [] });
  });
});
