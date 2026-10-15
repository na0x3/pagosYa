import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { kitPath } from '@pagosya/storefront-kit';
import { CONTROL_BADGES, CONTROL_BORDERS, CONTROL_COLOURS, CONTROL_FILLS, CONTROL_OUTLINES, type StoreControls } from './store-controls';
import { CONTROL_LANGUAGES, libraryRecord, SHARED_ICONS } from './store-controls-library';

/** Store controls in the kit runtime (spec 2026-10-14, part 3): attributes, decorated markup, the badge and the cart word. jsdom has
 * no layout; store-controls-browser.spec.ts measures. Harness from source-commerce-surfaces-draw.spec.ts. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const RECORD: StoreControls = { ...libraryRecord(CONTROL_LANGUAGES.find(language => language.id === 'ticket-stub')!, 'cafe-food', 'cup'), words: { cart: 'Tu taza', account: 'Mi cuenta' } };
const ITEMS = [{ id: 'taza', name: 'Taza', description: 'Cerámica.', amount: 6000, currency: 'BOB', stock: 12, imageUrls: [] }];
const HEADER = '<header data-pagosya-header><button type="button" class="pyh-cart" data-cart-open data-ctl="cart"><span class="ctl-face"></span><span class="ctl-sr">Tu taza, </span><span class="pyh-cart-count ctl-badge" data-cart-count data-empty>0</span><span class="ctl-sr" data-ctl-unit> productos</span></button></header>';
const CUSTOM = '<div class="menu-item" data-custom-product><button type="button" class="menu-add" data-add="taza">Agregar</button></div>';

const opened: any[] = [];
const settle = () => new Promise(resolve => setTimeout(resolve, 60));
// The kit's async load keeps running after a test's last assertion; let it finish before the window closes under it.
afterEach(async () => { await settle(); while (opened.length) opened.pop()!.close(); });
function boot(settings: Record<string, unknown>, options: { cart?: unknown[]; body?: string } = {}) {
  const body = options.body ?? `${HEADER}<section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p>`;
  const dom = new JSDOM(`<html><head></head><body>${body}</body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  opened.push(w);
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.show = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  w.PAGOSYA_PREVIEW = true;
  if (options.cart) w.PAGOSYA_PREVIEW_CART = options.cart;
  const data = { storeName: 'Tostadero', items: ITEMS };
  w.PAGOSYA_CONFIG = { slug: 'tostadero', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, ...settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  return w.document;
}

describe('store controls in the kit runtime (spec 2026-10-14)', () => {
  it('pins the runtime enums to the API', () => {
    const enums = runInNewContext(`(${commerce.match(/const CONTROL_ENUMS = (\{[\s\S]*?\n {2}\});/)![1]})`);
    expect(enums).toEqual({ outline: [...CONTROL_OUTLINES], border: [...CONTROL_BORDERS], fill: [...CONTROL_FILLS], colour: [...CONTROL_COLOURS], badge: [...CONTROL_BADGES] });
  });

  it('sets the record on :root as data-controls-* attributes and --ctl-* numbers', () => {
    const doc = boot({ controls: RECORD });
    const root = doc.documentElement;
    expect(['outline', 'border', 'fill', 'colour', 'badge'].map(name => root.getAttribute(`data-controls-${name}`))).toEqual(['ticket', 'none', 'solid', 'accent', 'stamp']);
    expect([root.style.getPropertyValue('--ctl-corner'), root.style.getPropertyValue('--ctl-notch'), root.style.getPropertyValue('--ctl-tilt'), root.style.getPropertyValue('--ctl-weight')]).toEqual(['4px', '5px', '0deg', '2px']);
  });

  it('draws the card "+", the drawer close and the cart word from the record, and leaves a store-authored card alone', async () => {
    const doc = boot({ controls: RECORD, cartWord: 'Tu pedido' }, { body: `${HEADER}<section data-pagosya-catalog></section>${CUSTOM}<section data-pagosya-cart></section><p data-pagosya-status></p>` });
    await settle();
    const add = doc.querySelector('[data-pagosya-catalog] .menu-add[data-add]');
    expect(add.getAttribute('data-ctl')).toBe('plus');
    expect(add.querySelector('.ctl-face path').getAttribute('d')).toBe(RECORD.icons.plus);
    expect(add.getAttribute('aria-label')).toBe('Añadir Taza');
    const close = doc.querySelector('.cart-drawer__header [data-cart-close]');
    expect(close.getAttribute('data-ctl')).toBe('close');
    expect(close.querySelector('path').getAttribute('d')).toBe(RECORD.icons.close);
    expect(close.getAttribute('aria-label')).toBe('Cerrar pedido');
    expect(doc.querySelector('.cart-drawer__continue').hasAttribute('data-ctl')).toBe(false);
    expect(doc.querySelector('#cart-drawer-title').textContent).toBe('Tu taza');
    const custom = doc.querySelector('[data-custom-product] .menu-add');
    expect(custom.hasAttribute('data-ctl')).toBe(false);
    expect(custom.textContent).toBe('Agregar');
  });

  it('draws every runtime icon with the even-odd rule the sanitizer and the library assume', async () => {
    const doc = boot({ controls: RECORD }, { cart: [{ id: 'taza', quantity: 1 }] });
    await settle();
    const icons = [...doc.querySelectorAll('[data-ctl] svg.ctl-icon')];
    expect(icons.length).toBeGreaterThan(2);
    for (const icon of icons as any[]) {
      expect(icon.getAttribute('clip-rule')).toBe('evenodd');
      expect(icon.querySelector('path').getAttribute('fill')).toBe('currentColor');
      expect(icon.querySelector('path').getAttribute('fill-rule')).toBe('evenodd');
    }
  });

  it('draws the steppers and keeps the badge state and the plain label in step with the count', async () => {
    const doc = boot({ controls: RECORD }, { cart: [{ id: 'taza', quantity: 1 }] });
    await settle();
    const count = doc.querySelector('header [data-cart-count]');
    expect([count.textContent, count.hasAttribute('data-empty'), doc.querySelector('header [data-ctl-unit]').textContent]).toEqual(['1', false, ' producto']);
    // Label in Name: the word-led name survives every count change («Tu taza, 1 producto»; the unit alone is rewritten).
    const cartName = () => doc.querySelector('header [data-ctl=cart]').textContent.replace(/\s+/g, ' ').trim();
    expect(cartName()).toBe('Tu taza, 1 producto');
    doc.querySelector('.quantity > button[data-add]').click();
    await settle();
    expect(cartName()).toBe('Tu taza, 2 productos');
    expect([...doc.querySelectorAll('.quantity > button')].map((button: any) => [button.getAttribute('data-ctl'), button.querySelector('.ctl-face path')?.getAttribute('d')]))
      .toEqual([['minus', RECORD.icons.minus], ['plus', RECORD.icons.plus]]);
    expect(RECORD.icons.minus).toBe(SHARED_ICONS.minus.solid);
  });

  it.each([
    ['no record', {}],
    ['an unknown outline', { controls: { ...RECORD, shape: { ...RECORD.shape, outline: 'hexagon' } } }],
    ['a tilt out of range', { controls: { ...RECORD, shape: { ...RECORD.shape, tilt: 40 } } }],
  ])('%s: nothing is set and the kit draws its own controls', async (_name, settings) => {
    const doc = boot(settings);
    await settle();
    expect(doc.documentElement.hasAttribute('data-controls-outline')).toBe(false);
    expect([...doc.querySelectorAll('[data-ctl]')].filter((el: any) => !el.closest('[data-pagosya-header]'))).toHaveLength(0);
    expect(doc.querySelector('.cart-drawer__header [data-cart-close]').textContent).toBe('×');
    expect(doc.querySelector('.menu-add[data-add] path').getAttribute('d')).toBe('M12 5v14M5 12h14');
  });
});
