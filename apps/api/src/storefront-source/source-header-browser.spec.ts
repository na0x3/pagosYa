/// <reference lib="dom" />
jest.setTimeout(180_000);

import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { kitPath } from '@pagosya/storefront-kit';
import { HEADER_SHAPES, renderSourceHeader, type HeaderShape } from './source-header';
import { measureHeaderCovers } from './design-engine/header-clickable';
import { CONTROL_OUTLINES, type StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord } from './store-controls-library';

/** Spec 2026-10-13, part B testing: every shape × shop/showcase in a real browser at the widths part 1 probes (1440, 390). */
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const LONG = 'Estudio de Arquitectura y Diseño Interior Montenegro Hermanos';
const links = [{ href: '#servicios', label: 'Servicios' }, { href: '#proyectos', label: 'Proyectos' }, { href: '#nosotros', label: 'Nosotros' }, { href: '#equipo', label: 'Equipo' }];

let browser: Browser;
beforeAll(async () => { browser = await chromium.launch({ headless: true }); });
afterAll(async () => { await browser?.close(); });

async function open(shape: HeaderShape, purpose: 'shop' | 'service', width: number, storeName = 'Marca', controls?: StoreControls): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const header = renderSourceHeader({ shape, purpose, storeName, links, action: { kind: 'whatsapp', value: '59170000000' }, fact: 'Atendemos de lunes a viernes, de 9:00 a 18:00.', search: true, ...(controls ? { controls } : {}) });
  const css = ':root{--store-background:#f4efe6;--store-foreground:#1d1b18;--store-accent:#b5462a;--store-accent-foreground:#ffffff}body{margin:0;font-family:Georgia,serif}section{min-height:620px;padding:40px}';
  const body = `${header}<main><section id="servicios" data-nav-label="Servicios"><h1>Hola</h1></section><section id="proyectos" data-nav-label="Proyectos"></section><section id="nosotros" data-nav-label="Nosotros"></section></main><p data-pagosya-status></p>`;
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`);
  const config = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: purpose, ...(controls ? { controls } : {}), data: { storeName, items: [] } };
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

// Final review, 2026-10-13: a wide wordmark logo next to the longest main button, and the shrinking shape held still.
const WIDE_LOGO = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#b5462a"/></svg>')}`;
async function openWith(shape: HeaderShape, width: number, extra: Partial<Parameters<typeof renderSourceHeader>[0]>, height = 900): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height } });
  const header = renderSourceHeader({ shape, purpose: 'service', storeName: 'Estudio Montenegro', links, action: { kind: 'form' }, ...extra });
  await page.setContent(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}section{min-height:900px}</style></head><body>${header}<main><section id="servicios"></section><section></section><section></section></main><p data-pagosya-status></p></body></html>`);
  await page.addScriptTag({ content: `window.PAGOSYA_PREVIEW=true;window.PAGOSYA_CONFIG=${JSON.stringify({ slug: 'm', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', demo: true, sitePurpose: 'service', data: { storeName: 'Estudio Montenegro', items: [] } })};` });
  await page.addScriptTag({ content: commerce });
  await page.waitForFunction(() => Array.from(document.images).every(image => image.complete));
  return page;
}

it('a wide logo never covers the main button on a 390px phone', async () => {
  for (const shape of HEADER_SHAPES) {
    const page = await openWith(shape, 390, { logoPath: WIDE_LOGO }, 844);
    try {
      const overlap = await page.evaluate(() => {
        const boxes = Array.from(document.querySelectorAll('header .pyh-brand, header .pyh-brand *')).map(node => node.getBoundingClientRect()).filter(box => box.width > 0);
        const brand = { left: Math.min(...boxes.map(box => box.left)), right: Math.max(...boxes.map(box => box.right)), top: Math.min(...boxes.map(box => box.top)), bottom: Math.max(...boxes.map(box => box.bottom)) };
        const action = document.querySelector('header .pyh-action')!.getBoundingClientRect();
        return brand.right > action.left + 1 && brand.left < action.right && brand.bottom > action.top && brand.top < action.bottom;
      });
      expect({ shape, overlap }).toEqual({ shape, overlap: false });
    } finally { await page.close(); }
  }
});

it('the shrinking header stays put while the page is held still near where it shrinks', async () => {
  for (const start of [45, 60, 90]) {
    const page = await openWith('shrinking', 1440, {});
    try {
      await page.evaluate(y => window.scrollTo(0, y), start);
      const toggles = await page.evaluate(() => new Promise<number>(resolve => {
        const header = document.querySelector('header[data-pagosya-header]')!;
        let count = 0;
        new MutationObserver(() => { count += 1; }).observe(header, { attributes: true, attributeFilter: ['data-scrolled'] });
        setTimeout(() => resolve(count), 1000);
      }));
      expect({ start, steady: toggles <= 1 }).toEqual({ start, steady: true });
    } finally { await page.close(); }
  }
});

describe('store controls in the platform header (spec 2026-10-14, part 3)', () => {
  it.each([...CONTROL_OUTLINES])('«%s»: upright 44px targets, the tilt on the face, nothing covered or wider than the screen, the menu gives the page back', async outline => {
    const base = libraryRecord(CONTROL_LANGUAGES[0], 'crafts-home', 'frame');
    const controls: StoreControls = { ...base, shape: { ...base.shape, outline, tilt: -3, notch: 6 }, words: { cart: 'Tu portafolios', account: 'Mi cuenta' } };
    for (const shape of ['menu-button', 'side-rail', 'bottom-pill', 'centered-split'] as const) for (const width of [1440, 390]) {
      const page = await open(shape, 'shop', width, 'Marca', controls);
      try {
        const facts = await page.evaluate(() => Array.from(document.querySelectorAll('header [data-ctl]')).filter(el => (el as any).checkVisibility()).map(el => {
          const box = el.getBoundingClientRect(), face = el.querySelector('.ctl-face')!;
          return { slot: el.getAttribute('data-ctl'), width: box.width, height: box.height, box: getComputedStyle(el).transform, face: getComputedStyle(face).transform };
        }));
        const label = `${outline} ${shape} ${width}`;
        expect({ label, cart: facts.some(fact => fact.slot === 'cart') }).toEqual({ label, cart: true });
        for (const fact of facts) {
          expect({ label, slot: fact.slot, target: fact.width >= 44 && fact.height >= 44, upright: fact.box === 'none', tilted: fact.face !== 'none' })
            .toEqual({ label, slot: fact.slot, target: true, upright: true, tilted: true });
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        expect(await measureHeaderCovers(page, { maxPositions: 2 })).toEqual([]);
        const toggle = page.locator('[data-pagosya-header-toggle]');
        if (await toggle.isVisible()) {
          await toggle.click();
          expect(await menuState(page)).toMatchObject({ open: true, focusInside: true });
          await page.keyboard.press('Escape');
          expect(await menuState(page)).toEqual({ open: false, focusInside: false, focusOnToggle: true, overflow: '' });
        }
      } finally { await page.close(); }
    }
  });
});
