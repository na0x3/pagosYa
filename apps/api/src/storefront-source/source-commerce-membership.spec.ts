import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const CART_KEY = 'pagosya:cart:marca';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const club = { id: 'club', name: 'Club del café', amount: 5000, currency: 'BOB', stock: null, imageUrls: [], fulfillmentType: 'MEMBERSHIP', variants: [], extras: [],
  membershipPeriods: [{ id: 'm1', months: 1, amount: 5000 }, { id: 'm12', months: 12, amount: 48000 }] };
const windows: any[] = [];
const errors: Error[] = [];
async function open(items: any[] = [club], seed?: (w: any) => void) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error: Error) => { if (!error.message.includes('Could not parse CSS stylesheet')) errors.push(error); });
  const dom = new JSDOM('<html><head></head><body><button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  seed?.(w);
  const data = { storeName: 'Marca', checkoutMode: 'payment', items };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return { w, query: (s: string) => w.document.querySelector(s) };
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); expect(errors.splice(0)).toEqual([]); });

describe('memberships in the kit', () => {
  it('shows "Hacerme miembro" and a "desde" price on the card instead of an add button', async () => {
    const { query } = await open();
    const button = query('.menu-add');
    expect(button.textContent).toContain('Hacerme miembro');
    expect(button.hasAttribute('data-add')).toBe(false);
    expect(query('.menu-item__price').textContent).toContain('/ mes');
  });

  it('lists the periods and links the join button to the account checkout with the chosen period', async () => {
    const { query, w } = await open();
    query('.menu-add').click();
    const radios = w.document.querySelectorAll('[name=membershipPeriod]');
    expect(radios).toHaveLength(2);
    expect(query('[data-membership-join]').getAttribute('href')).toBe('https://pay.test/cuenta/marca/unirme?producto=club&periodo=m1');
    radios[1].checked = true; radios[1].dispatchEvent(new w.Event('change', { bubbles: true }));
    expect(query('[data-membership-join]').getAttribute('href')).toBe('https://pay.test/cuenta/marca/unirme?producto=club&periodo=m12');
    expect(query('[data-pagosya-product]').textContent).toContain('no se cobra nada automáticamente');
    expect(query('[data-pagosya-product] [data-add]')).toBeNull();
  });

  it('drops a membership from a restored cart', async () => {
    const { query } = await open([club], w => w.localStorage.setItem(CART_KEY, JSON.stringify([{ id: 'club', quantity: 1 }])));
    expect(query('[data-cart-count]').textContent.trim()).toMatch(/^0?$/);
  });
});
