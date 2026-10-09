import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
const photo = 'https://shop.test/zona.jpg';
const page = [
  { id: 'blk_aaaaaaaaaaa1', type: 'features', title: 'Lo que lo hace especial', items: [{ icon: 'snowflake', label: 'Frío', detail: 'Hasta 12 horas' }, { icon: 'laptop', label: 'Laptop', detail: '15.6"' }, { icon: 'drop', label: 'Impermeable', detail: 'Exterior repelente' }] },
  { id: 'blk_aaaaaaaaaaa2', type: 'story', problem: 'Llevas tres bolsas.', tried: 'La lonchera se derrama.', solution: 'Un solo bolso.' },
  { id: 'blk_aaaaaaaaaaa3', type: 'details', items: [{ imageUrl: photo, title: 'Zona fría', text: 'Abajo.', alt: 'Zona fría abierta' }] },
  { id: 'blk_aaaaaaaaaaa4', type: 'versus', ours: 'Este bolso', theirs: 'Lo de siempre', rows: [{ label: 'Zona fría', ours: true, theirs: false }, { label: 'Funda laptop', ours: true, theirs: false }] },
  { id: 'blk_aaaaaaaaaaa5', type: 'faq', items: [{ q: '¿Cabe mi laptop?', a: '<img src=x onerror=alert(1)>Sí' }, { q: '¿Se lava?', a: 'Con un paño.' }] },
];
const bag = (blocks: unknown[]) => ({ id: 'bag', name: 'Bolso', amount: 9000, currency: 'BOB', stock: null, imageUrls: ['https://shop.test/bag.jpg'], contentBlocks: blocks });
const windows: any[] = [];
async function open(blocks: unknown[] = page, extra: Record<string, unknown> = {}, body = '<main data-pagosya-product-page></main>') {
  const dom = new JSDOM(`<html><head></head><body>${body}<section data-pagosya-cart></section></body></html>`, { runScripts: 'outside-only', virtualConsole: new VirtualConsole() });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLElement.prototype.scrollIntoView = jest.fn();
  w.matchMedia = () => ({ matches: false });
  w.PAGOSYA_PREVIEW = true; w.PAGOSYA_PREVIEW_QUERY = '?id=bag';
  const data = { storeName: 'Marca', shippingEnabled: true, policies: {}, items: [bag(blocks)], ...extra };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', productPage: 'product.html', data };
  w.fetch = jest.fn(async () => ({ ok: true, json: async () => data }));
  w.eval(commerce);
  await new Promise(resolve => setImmediate(resolve));
  return { w, q: (s: string) => w.document.querySelector(s), all: (s: string) => [...w.document.querySelectorAll(s)] };
}
afterEach(() => windows.splice(0).forEach(w => w.close()));

describe('long product page in the kit', () => {
  it('draws every section in order around the reviews, with parts and escaped text', async () => {
    const { q, all } = await open();
    const order = all('[data-part="features"],[data-part="story"],[data-part="details"],[data-part="versus"],#product-reviews,[data-part="faq"]').map((el: any) => el.dataset.part || el.id);
    expect(order).toEqual(['features', 'story', 'details', 'versus', 'product-reviews', 'faq']);
    expect(all('[data-part="feature"] svg')).toHaveLength(3);
    expect(q('[data-part="faq"]').innerHTML).toContain('&lt;img');
    expect(q('[data-part="faq"] img')).toBeNull();
    expect(all('[data-buy-again]')).toHaveLength(2);
  });
  it('the repeated buy button goes to the purchase box and only promises what the store set', async () => {
    const plain = await open();
    expect(plain.q('[data-part="buy-again"]').textContent).not.toMatch(/devoluci/i);
    plain.q('[data-buy-again]').click();
    expect(plain.w.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    const withPolicy = await open(page, { policies: { returns: 'Cambios en 7 días.' } });
    expect(withPolicy.q('[data-part="buy-again"]').textContent).toMatch(/devoluciones/i);
  });
  it('a product without page blocks looks as before', async () => {
    const { q, all } = await open([]);
    expect(q('[data-part="long-page"]')).toBeNull();
    expect(all('[data-buy-again]')).toHaveLength(0);
  });
  it('a YAPI-authored product template keeps the long page full width, outside the buy column', async () => {
    const template = '<template data-pagosya-product-page-template><div class="mine"><div data-product-slot="gallery"></div><div data-product-slot="title"></div><div data-product-slot="pricing"></div><div class="col" data-product-slot="buy"></div></div></template>';
    const { q } = await open(page, {}, `${template}<main data-pagosya-product-page></main>`);
    expect(q('[data-part="long-page"]')).not.toBeNull();
    expect(q('.col [data-part="long-page"]')).toBeNull();
  });
});
