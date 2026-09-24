import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

async function shop(policies: Record<string, string>) {
  const dom = new JSDOM(`<html><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><footer><nav data-pagosya-policies></nav></footer><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', policies, items: [{ id: 'p1', name: 'Café', amount: 2000, currency: 'BOB', stock: null, imageUrls: [] }] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 50));
  return w;
}

describe('store policies in the shared storefront runtime', () => {
  it('links only the policies the merchant wrote and shows them escaped in a dialog', async () => {
    const w = await shop({ returns: 'Cambios en 7 días.\n\nSin <script>alert(1)</script> trucos.', terms: '' });
    const footer = w.document.querySelector('[data-pagosya-policies]');
    expect(footer.hidden).toBe(false);
    expect([...footer.querySelectorAll('button')].map((b: any) => b.textContent)).toEqual(['Cambios y devoluciones']);
    expect(w.document.querySelector('.cart-drawer > .pagosya-policies')).not.toBeNull();
    const trigger = footer.querySelector('button');
    trigger.click();
    const dialog = w.document.querySelector('dialog.pagosya-policy-dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.querySelectorAll('div p')).toHaveLength(2);
    expect(dialog.innerHTML).toContain('&lt;script&gt;');
    expect(dialog.querySelector('script')).toBeNull();
    dialog.querySelector('[data-policy-close]').click();
    expect(dialog.open).toBe(false);
    expect(w.document.activeElement).toBe(trigger);
    w.close();
  });
  it('renders nothing when there are no policies', async () => {
    const w = await shop({});
    expect(w.document.querySelector('[data-pagosya-policies]').hidden).toBe(true);
    expect(w.document.querySelector('.pagosya-policies')).toBeNull();
    w.close();
  });
});
