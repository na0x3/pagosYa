import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { dnaRuntimeConfig, SOURCE_DNA_RUNTIME_ENUMS } from './source-dna';
import { validDna } from './fixtures/dna';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

function boot(dna: unknown, settings: Record<string, unknown> = {}, items: unknown[] = []) {
  const dom = new JSDOM('<html><body><button data-cart-open>Pedido</button><section data-pagosya-catalog></section><section data-pagosya-cart></section><p data-pagosya-status></p></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  const data = { storeName: 'Marca', items };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', data, dna, ...settings };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  const attributes: Record<string, string> = Object.fromEntries([...w.document.documentElement.attributes].filter((a: any) => a.name.startsWith('data-dna-')).map((a: any) => [a.name.slice(9), a.value]));
  // The runtime starts timers; a window left open keeps jest alive.
  w.close();
  return attributes;
}

describe('design DNA in the storefront runtime', () => {
  it('writes each DNA enum onto <html> as a data-dna-* attribute', () => {
    const { version: _version, ...enums } = dnaRuntimeConfig(validDna());
    expect(boot(dnaRuntimeConfig(validDna()), { productPageStyle: enums.product })).toEqual(enums);
  });
  it('allows exactly the runtime enums the API declares, no more and no fewer', () => {
    const literal = commerce.match(/const DNA_VALUES = (\{[\s\S]*?\n  \});/)![1];
    expect(new Function(`return ${literal}`)()).toEqual(SOURCE_DNA_RUNTIME_ENUMS);
  });
  it('accepts every value the API can send', () => {
    const longest = Math.max(...Object.values(SOURCE_DNA_RUNTIME_ENUMS).map(values => values.length));
    for (let i = 0; i < longest; i++) {
      const dna = Object.fromEntries(Object.entries(SOURCE_DNA_RUNTIME_ENUMS).map(([name, values]) => [name, values[i % values.length]]));
      expect(boot(dna, { productPageStyle: dna.product })).toEqual(dna);
    }
  });
  it('takes data-dna-product from the product page the kit renders, not from the DNA', () => {
    expect(boot({ ...dnaRuntimeConfig(validDna()), product: 'story-led' }, { productPageStyle: 'dense' }).product).toBe('dense');
    // No stored style: the kit falls back on the catalog, and a spec-heavy catalog renders the dense page.
    const specs = [1, 2, 3].map(n => ({ label: `L${n}`, value: `V${n}` }));
    expect(boot({ product: 'story-led' }).product).toBe('editorial');
    expect(boot({ product: 'story-led' }, {}, [{ id: 'p', name: 'P', amount: 100, currency: 'BOB', specifications: specs }]).product).toBe('dense');
  });
  it('ignores unknown values, unknown keys and a missing DNA', () => {
    expect(boot({ ...dnaRuntimeConfig(validDna()), button: 'sparkle', cart: '"><script>', evil: 'pill' })).not.toHaveProperty('button');
    expect(boot({ button: 'sparkle', evil: 'pill', cart: 'sheet' })).toEqual({ cart: 'sheet', product: 'editorial' });
    expect(boot(undefined)).toEqual({});
    expect(boot('pill')).toEqual({});
  });
});
