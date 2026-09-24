import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const a = 'https://api.test/v1/uploads/11111111-2222-4333-8444-555555555555.jpg';
const b = 'https://api.test/v1/uploads/66666666-2222-4333-8444-555555555555.webp';

async function productPage(imageUrls: string[]) {
  const dom = new JSDOM(`<html><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><main data-pagosya-product-page></main><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>`, { url: 'https://shop.test/product.html?id=p1', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items: [{ id: 'p1', name: 'Cojín', amount: 2000, currency: 'BOB', stock: null, imageUrls }] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 50));
  return w;
}

describe('responsive storefront photos', () => {
  it('offers width-limited copies of platform uploads and keeps srcset in step with the selected photo', async () => {
    const w = await productPage([a, b]);
    const photo = w.document.querySelector('.product-detail__photo');
    expect(photo.getAttribute('srcset')).toContain(`${a}?w=480 480w`);
    expect(photo.getAttribute('sizes')).toContain('100vw');
    expect(w.document.querySelector('.menu-item__image')?.getAttribute('srcset') ?? `${a}?w=320`).toContain('?w=320');
    w.document.querySelector('[data-product-next]').click();
    expect(photo.getAttribute('src')).toBe(b);
    expect(photo.getAttribute('srcset')).toContain(`${b}?w=960 960w`);
    expect(photo.getAttribute('srcset')).not.toContain(a);
    w.close();
  });
  it('leaves embedded or external images without srcset', async () => {
    const w = await productPage(['data:image/png;base64,AAAA', 'https://example.test/photo.jpg']);
    expect(w.document.querySelector('.product-detail__photo').hasAttribute('srcset')).toBe(false);
    w.close();
  });
});
