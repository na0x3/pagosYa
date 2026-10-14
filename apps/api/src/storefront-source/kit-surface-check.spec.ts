jest.setTimeout(180_000);
import { readFile } from 'node:fs/promises';
import { kitPath } from '@pagosya/storefront-kit';
import { checkKitSurfacesOnSnapshot } from './kit-surface-check';
import { kitDefaultSnapshot } from './source-scorecard-capture';
import { sanitizeKitSurfaceCss } from './product-theme-css';
import { patchConfigFile } from './store-look';

/** Real-browser check of YAPI's touches on cards, catalog and cart. Raw cases bypass the sanitizer on purpose: they prove
 * the check catches what individually allowed declarations could still add up to. */
async function themed(dna: Record<string, string>) {
  const kit = await kitDefaultSnapshot();
  const productos = { path: 'productos.html', content: await readFile(kitPath('productos.html'), 'utf8'), encoding: 'utf8' as const };
  return { ...kit, files: patchConfigFile([...kit.files, productos], config => ({ ...config, dna: { version: 1, ...dna } })) };
}

describe('checkKitSurfacesOnSnapshot', () => {
  it('passes the plain kit and benign touches', async () => {
    expect(await checkKitSurfacesOnSnapshot(await themed({}))).toEqual({ catalog: [], card: [], cart: [] });
    const benign = {
      cardCss: sanitizeKitSurfaceCss('card', '[data-part="card-media"]{transform:rotate(-2deg);box-shadow:4px 4px 0 #111}').css,
      cartCss: sanitizeKitSurfaceCss('cart', '[data-part="cart-head"]{border-bottom:3px solid #111}').css,
      catalogCss: sanitizeKitSurfaceCss('catalog', '[data-part="page-title"]{letter-spacing:.2em}').css,
    };
    expect(await checkKitSurfacesOnSnapshot(await themed(benign))).toEqual({ catalog: [], card: [], cart: [] });
  });

  it('reports an add-to-cart button made nearly transparent', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: '[data-pagosya-catalog] .menu-item .menu-add{opacity:.2}' }));
    expect(failures.card.some(f => f.control === 'add' && /transparent/.test(f.reason))).toBe(true);
  });

  it('reports a hidden checkout button in the cart drawer', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cartCss: '.cart-drawer .checkout-button{visibility:hidden}' }));
    expect(failures.cart.some(f => f.control === 'checkout' && /hidden/.test(f.reason))).toBe(true);
  });

  it('records a card touch that breaks only the full catalog grid as a card failure', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: 'body:has([data-catalog-full]) [data-pagosya-catalog] .menu-item .menu-add{visibility:hidden}' }));
    expect(failures.card.some(f => f.control === 'add' && /hidden/.test(f.reason))).toBe(true);
    expect(failures.catalog).toEqual([]);
  });

  it('gives the probe product a photo, so card-media and cart-line-media touches reach the check', async () => {
    // Raw CSS that bites only where the media parts exist: the plain kit's probe card and cart line used to have none.
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: '[data-pagosya-catalog] .menu-item:has([data-part="card-media"]) .menu-add{opacity:.2}', cartCss: '.cart-drawer:has([data-part="cart-line-media"]) .checkout-button{opacity:.2}' }));
    expect(failures.card.some(f => f.control === 'add' && /transparent/.test(f.reason))).toBe(true);
    expect(failures.cart.some(f => f.control === 'checkout' && /transparent/.test(f.reason))).toBe(true);
  });

  it('reports a card that makes the page scroll sideways', async () => {
    const failures = await checkKitSurfacesOnSnapshot(await themed({ cardCss: '[data-pagosya-catalog] [data-part="card"]{min-width:3000px}' }));
    expect(failures.card.some(f => f.control === 'page' && /overflow/.test(f.reason))).toBe(true);
  });
});
