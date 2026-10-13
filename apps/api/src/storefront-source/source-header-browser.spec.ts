/// <reference lib="dom" />
jest.setTimeout(180_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { HEADER_SHAPES, renderSourceHeader, type HeaderShape } from './source-header';
import { measureHeaderCovers } from './design-engine/header-clickable';

/** Spec 2026-10-13, part B testing: every shape × shop/showcase in a real browser at the widths part 1 probes (1440, 390). */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LONG = 'Estudio de Arquitectura y Diseño Interior Montenegro Hermanos';
const links = [{ href: '#servicios', label: 'Servicios' }, { href: '#proyectos', label: 'Proyectos' }, { href: '#nosotros', label: 'Nosotros' }, { href: '#equipo', label: 'Equipo' }];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(shape: HeaderShape, purpose: 'shop' | 'service', width: number, storeName = 'Marca'): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape, purpose, storeName, links, action: { kind: 'whatsapp', value: '59170000000' }, fact: 'Atendemos de lunes a viernes, de 9:00 a 18:00.', search: true });
  const css = ':root{--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff}body{margin:0;font-family:Georgia,serif}section{min-height:620px;padding:40px}';
  const body = `${header}<main><section id="servicios" data-nav-label="Servicios"><h1>Hola</h1></section><section id="proyectos" data-nav-label="Proyectos"></section><section id="nosotros" data-nav-label="Nosotros"></section></main><p data-pagosya-status></p>`;
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`);
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: purpose, data: { storeName, items: [] } };
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify(config)};` });
  await page.addScriptTag({ content: commerce });
  return page;
}
const menuState = (page: Page) => page.evaluate(() => {
  const menu = document.querySelector('[data-pagosya-header-menu]') as HTMLElement;
  return { open: !menu.hidden, focusInside: Boolean(document.activeElement?.closest('[data-pagosya-header-menu]')), focusOnToggle: Boolean(document.activeElement?.matches('[data-pagosya-header-toggle]')), overflow: document.documentElement.style.overflow };
});

describe.each([...HEADER_SHAPES])('the «%s» platform header in a browser', shape => {
  it.each(['shop', 'service'] as const)('%s: every control can be clicked, nothing is wider than the screen, the cart or main action stays on the phone bar, and the menu gives the page back on Escape', async purpose => {
    for (const width of [1440, 390]) {
      const page = await open(shape, purpose, width);
      try {
        expect(await measureHeaderCovers(page, { maxPositions: 3 })).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(await page.locator('header [data-cart-open], header .pyh-action').first().isVisible()).toBe(true);
        const toggle = page.locator('[data-pagosya-header-toggle]');
        if (await toggle.isVisible()) {
          await toggle.click();
          expect(await menuState(page)).toMatchObject({ open: true, focusInside: true, overflow: 'hidden' });
          await page.keyboard.press('Escape');
          expect(await menuState(page)).toEqual({ open: false, focusInside: false, focusOnToggle: true, overflow: '' });
        } else {
          // Only a desktop bar may keep its menu button out of sight; every phone layout opens through it.
          expect(width).toBe(1440);
        }
      } finally { await page.close(); }
    }
  });
});

it('a long store name never makes the page wider than a 390px phone', async () => {
  for (const shape of HEADER_SHAPES) for (const purpose of ['shop', 'service'] as const) {
    const page = await open(shape, purpose, 390, LONG);
    try {
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > 390);
      expect({ shape, purpose, wide }).toEqual({ shape, purpose, wide: false });
    } finally { await page.close(); }
  }
});
