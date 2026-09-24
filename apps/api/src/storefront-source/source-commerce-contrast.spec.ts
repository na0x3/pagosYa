import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

async function shop(css: string, template = '') {
  const virtualConsole = new VirtualConsole();
  const dom = new JSDOM(`<html><head><style>${css}</style></head><body>${template}<button data-cart-open>Pedido <span data-cart-count></span></button><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p><p class="authored">Texto del diseño</p></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items: [{ id: 'p1', name: 'Café', description: 'Tostado medio', amount: 2000, currency: 'BOB', stock: null, imageUrls: [] }] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 250));
  return w;
}

describe('commerce.js contrast guard', () => {
  it('lifts unreadable runtime text to AA and leaves authored text alone', async () => {
    const w = await shop('body{background:#ffffff;color:#dddddd} .authored{color:#eeeeee}');
    const name = [...w.document.querySelectorAll('[data-pagosya-catalog] *')].find((el: any) => el.childNodes[0]?.nodeType === 3 && el.textContent.trim() === 'Café') as any;
    expect(name).toBeDefined();
    expect(name.dataset.pagosyaContrast).toBe('corrected');
    expect(w.getComputedStyle(name).color).toBe('rgb(17, 17, 17)');
    expect((w.document.querySelector('.authored') as any).dataset.pagosyaContrast).toBeUndefined();
    w.close();
  });
  it('keeps text that already reads, and skips text over photographs', async () => {
    const readable = await shop('body{background:#ffffff;color:#222222}');
    expect(readable.document.querySelectorAll('[data-pagosya-contrast="corrected"]')).toHaveLength(0);
    readable.close();
    const photo = await shop('body{background:#ffffff;color:#dddddd} [data-pagosya-catalog]{background-image:url(x.jpg)}');
    expect(photo.document.querySelectorAll('[data-pagosya-catalog] [data-pagosya-contrast="corrected"]')).toHaveLength(0);
    photo.close();
  });
});
