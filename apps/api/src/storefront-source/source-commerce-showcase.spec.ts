import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const data = { storeName: 'deff', tagline: 'Arquitectura', aboutText: 'Diseñamos casas.', items: [{ id: 'p1', name: 'Asesoría', description: '', amount: 100, currency: 'BOB', stock: 1, imageUrls: [], tags: [] }], collections: [{ name: 'Todo', slug: 'todo', productIds: ['p1'] }], policies: { delivery: 'Envíos a todo el país.', returns: 'Cambios en 7 días.', privacy: 'Cuidamos tus datos.', terms: 'Términos.' } };

async function page(sitePurpose?: string) {
  const dom = new JSDOM('<html><head></head><body><main><div data-pagosya-page="about"></div></main><footer><nav data-pagosya-pages></nav></footer><p data-pagosya-status></p></body></html>', { url: 'https://shop.test/', runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window as any;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.matchMedia = () => ({ matches: true });
  w.PAGOSYA_PREVIEW = true;
  w.PAGOSYA_CONFIG = { slug: 'deff', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', ...(sitePurpose ? { sitePurpose } : {}), data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 60));
  return w;
}
const labels = (w: any) => Array.from(w.document.querySelectorAll('[data-pagosya-pages] a')).map((a: any) => a.textContent);

describe('the footer of a showcase (spec 2026-10-13)', () => {
  it('links the information pages but never search, collections, shipping, refunds or a shopper account', async () => {
    const w = await page('service');
    expect(labels(w)).toEqual(expect.arrayContaining(['Nosotros', 'Privacidad']));
    for (const label of ['Colecciones', 'Buscar', 'Envíos y entregas', 'Cambios y devoluciones', 'Mi cuenta']) expect(labels(w)).not.toContain(label);
    expect(w.document.querySelector('a[data-pagosya-account]')).toBeNull();
    w.close();
  });

  it('keeps every link for a shop, and for a store saved before sitePurpose was written', async () => {
    for (const purpose of ['shop', undefined]) {
      const w = await page(purpose);
      expect(labels(w)).toEqual(expect.arrayContaining(['Colecciones', 'Buscar', 'Envíos y entregas', 'Cambios y devoluciones', 'Mi cuenta']));
      w.close();
    }
  });
});
