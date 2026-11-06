import { applyStoreOps, priceCents, readCatalogTitle, readStoreOps, socialUrl, storeChangeEmpty, storeDigest, withCatalogTitle, type StoreEditState, type StoreOp } from './source-store-edit';

const state = (over: Partial<StoreEditState> = {}): StoreEditState => ({
  tagline: 'Helado de tofu', aboutText: '', contactPhone: '+591 70000000', contactEmail: '', policies: { returns: 'Cambios en 7 días.' }, faq: [{ q: '¿Tienen sin azúcar?', a: 'Sí.' }],
  announcement: '', footer: '', links: [{ label: 'Menú', url: 'https://menu.test' }], popup: { on: false, title: 'Únete', text: '', button: 'Quiero', discount: 0 },
  catalogTitle: 'Todos los productos',
  products: [{ id: 'p1', name: 'Brownie', amount: 2000, description: 'Rico.', imageUrls: ['/v1/uploads/a.jpg'], options: false },
    { id: 'p2', name: 'Polera', amount: 9000, description: '', imageUrls: [], options: true }], ...over });
const op = (part: StoreOp['part'], field: string, value = '', extra: Partial<StoreOp> = {}): StoreOp => ({ part, field, at: -1, title: '', value, ...extra });

describe('store edit (YAPI edits everything, spec 2026-11-03)', () => {
  it('draws a digest of every part, numbering products and photos', () => {
    const digest = storeDigest(state(), [{ url: '/v1/uploads/n.jpg', from: 'mensaje' }]);
    expect(digest.productos.map(product => [product.at, product.precio])).toEqual([[0, 'Bs 20'], [1, 'Bs 90']]);
    expect(storeDigest(state({ products: [{ id: 'p', name: 'Vestido', amount: 890050, description: '', imageUrls: [], options: false }] }), []).productos[0].precio).toBe('Bs 8.900,50');
    expect(digest.productos[1]).toMatchObject({ opciones: true });
    expect(digest.fotos).toEqual([{ ref: 'f0', de: 'mensaje' }]);
    expect(digest.preguntas[0]).toMatchObject({ at: 0, pregunta: '¿Tienen sin azúcar?' });
    expect(digest).toHaveProperty('catalogo', 'Todos los productos');
    expect(storeDigest(state({ catalogTitle: null }), [])).not.toHaveProperty('catalogo');
  });

  it('reads only known parts and fields', () => {
    expect(readStoreOps([{ part: 'about', field: 'text', at: 0, title: '', value: 'x' }, { part: 'hack', field: 'text' }, { part: 'about', field: 'nope' }, null])).toHaveLength(1);
  });

  it('writes the about page, tagline and contact, refusing a bad phone or email', () => {
    const { change, done, refused } = applyStoreOps(state(), [op('about', 'text', 'Empezamos en 2019.\n\n\n\nEn La Paz.'), op('about', 'tagline', ''), op('contact', 'email', 'hola@dooboo.bo'),
      op('contact', 'phone', 'llámame')]);
    expect(change.store).toEqual({ aboutText: 'Empezamos en 2019.\n\nEn La Paz.', tagline: null, contactEmail: 'hola@dooboo.bo' });
    expect(done).toHaveLength(3);
    expect(refused[0]).toContain('no parece un número');
  });

  it('writes policies and the merchant FAQ in one policies JSON, keeping what was there', () => {
    const { change, done, refused } = applyStoreOps(state(), [op('policy', 'delivery', 'Entregamos en 24 h en La Paz.'), op('faq', 'add', 'Con 3 días de anticipación.', { title: '¿Hacen tortas?' }),
      op('faq', 'add', 'x', { title: '¿tienen SIN azúcar?' }), op('faq', 'set', 'Sí, todos.', { at: 0 }), op('faq', 'add', '', { title: 'Sin respuesta' })]);
    expect(change.policies).toEqual({ returns: 'Cambios en 7 días.', delivery: 'Entregamos en 24 h en La Paz.', faq: [{ q: '¿Tienen sin azúcar?', a: 'Sí, todos.' }, { q: '¿Hacen tortas?', a: 'Con 3 días de anticipación.' }] });
    expect(done).toHaveLength(3);
    expect(refused).toHaveLength(2);
  });

  it('removes a policy and the last question', () => {
    const { change } = applyStoreOps(state(), [op('policy', 'returns', ''), op('faq', 'remove', '', { at: 0 })]);
    expect(change.policies).toEqual({});
  });

  it('caps the FAQ at 12 questions', () => {
    const faq = Array.from({ length: 12 }, (_, n) => ({ q: `P${n}`, a: 'R' }));
    expect(applyStoreOps(state({ faq }), [op('faq', 'add', 'R', { title: 'Nueva' })]).refused[0]).toContain('12');
  });

  it('sets the announcement and the footer line as store-data words', () => {
    const { change, done } = applyStoreOps(state(), [op('announcement', 'text', '  Envío gratis   desde Bs 200 '), op('footer', 'tagline', 'Hecho en La Paz')]);
    expect(change.copy).toEqual({ announcement: 'Envío gratis desde Bs 200', tagline: 'Hecho en La Paz' });
    expect(done[0]).toContain('cinta');
  });

  it('turns social handles into links, replaces the same network and keeps the other links', () => {
    const { change, refused } = applyStoreOps(state({ links: [{ label: 'Menú', url: 'https://menu.test' }, { label: 'instagram', url: 'https://instagram.com/viejo' }] }),
      [op('social', 'instagram', '@dooboo.gelato'), op('social', 'tiktok', 'https://www.tiktok.com/@dooboo'), op('social', 'facebook', 'https://evil.test/x')]);
    expect(change.links).toEqual([{ label: 'Menú', url: 'https://menu.test' }, { label: 'Instagram', url: 'https://instagram.com/dooboo.gelato' }, { label: 'TikTok', url: 'https://www.tiktok.com/@dooboo' }]);
    expect(refused[0]).toContain('Facebook');
    expect(applyStoreOps(state({ links: [{ label: 'TikTok', url: 'https://tiktok.com/@a' }] }), [op('social', 'tiktok', '')]).change.links).toEqual([]);
  });

  it('parses prices and social urls', () => {
    expect([priceCents('25'), priceCents('Bs 25,50'), priceCents('25.5'), priceCents('0'), priceCents('veinte')]).toEqual([2500, 2550, 2550, null, null]);
    expect([priceCents('Bs 1.950'), priceCents('1,950'), priceCents('12.500,50'), priceCents('1.950.000')]).toEqual([195000, 195000, 1250050, null]);
    expect(socialUrl('instagram', 'instagram.com/marca/')).toBe('https://instagram.com/marca');
    expect(socialUrl('x', 'https://twitter.com/marca')).toBe('https://twitter.com/marca');
    expect(socialUrl('instagram', 'javascript:alert(1)')).toBeNull();
  });

  it('switches the popup on with its words and a welcome discount', () => {
    const { change, refused } = applyStoreOps(state(), [op('popup', 'title', 'Sé parte de DooBoo'), op('popup', 'discount', '10 %'), op('popup', 'discount', '90')]);
    expect(change.popup).toEqual({ signupTitle: 'Sé parte de DooBoo', discount: 10, signupEnabled: true });
    expect(refused[0]).toContain('5 % a 50 %');
    expect(applyStoreOps(state(), [op('popup', 'off')]).change.popup).toBeUndefined();
    const already = applyStoreOps(state({ popup: { on: true, title: 'Únete', text: '', button: 'Quiero', discount: 10 } }), [op('popup', 'discount', '10'), op('popup', 'on')]);
    expect(already.change.popup).toBeUndefined();
    expect(already.done).toEqual(['tu ventana de suscripción ya regala un 10 % de descuento', 'tu ventana de suscripción ya estaba encendida']);
  });

  it('changes a product name, price, description and photo; refuses a price on a product with options', () => {
    const photos = [{ url: '/v1/uploads/nueva.jpg', from: 'mensaje' as const }];
    const { change, refused } = applyStoreOps(state(), [op('product', 'price', '25', { at: 0 }), op('product', 'name', 'Brownie vegano', { at: 0 }), op('product', 'photo', 'f0', { at: 0 }),
      op('product', 'price', '100', { at: 1 }), op('product', 'photo', 'f3', { at: 0 }), op('product', 'name', 'x', { at: 9 })], photos);
    expect(change.products).toEqual([{ id: 'p1', amount: 2500, name: 'Brownie vegano', imageUrls: ['/v1/uploads/nueva.jpg', '/v1/uploads/a.jpg'] }]);
    expect(refused).toHaveLength(2);
  });

  it('changes the catalogue title in its file only', () => {
    const files = [{ path: 'components/page-productos.tsx', content: '<main>\n      <h1 className="es-catalog-page__title">Todos los productos</h1>\n</main>' }];
    expect(readCatalogTitle(files)).toBe('Todos los productos');
    const { change } = applyStoreOps(state(), [op('catalog', 'title', 'Nuestros {helados}')]);
    expect(change.catalogTitle).toBe('Nuestros helados');
    expect(readCatalogTitle(withCatalogTitle(files, change.catalogTitle!))).toBe('Nuestros helados');
    expect(applyStoreOps(state({ catalogTitle: null }), [op('catalog', 'title', 'X')]).refused).toHaveLength(1);
    expect(readCatalogTitle([])).toBeNull();
  });

  it('an unchanged value writes nothing', () => {
    const { change, done } = applyStoreOps(state(), [op('about', 'tagline', 'Helado de tofu'), op('policy', 'returns', 'Cambios en 7 días.'), op('product', 'price', '20', { at: 0 })]);
    expect(storeChangeEmpty(change)).toBe(true);
    expect(done).toEqual([]);
  });
});

describe('catalog in the digest (spec 2026-11-05 part 2)', () => {
  it('shows stock, category and options of each product, the archived ones, the categories and the codes', () => {
    const digest = storeDigest(state({
      products: [{ id: 'p1', name: 'Brownie', amount: 2000, description: '', imageUrls: [], options: false, stock: 5, categoryId: 'c1', currency: 'BOB', variants: [] },
        { id: 'p2', name: 'Polera', amount: 9000, description: '', imageUrls: [], options: true, stock: null, categoryId: null, currency: 'BOB',
          variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 2 }, { id: 'v2', name: 'M', amount: 9500, stock: null }] }],
      archived: [{ id: 'p9', name: 'Torta de limón' }],
      categories: [{ id: 'c1', name: 'Postres', count: 1 }],
      codes: [{ id: 'k1', code: 'VERANO20', type: 'PERCENT', value: 20, active: true, emails: false, assistant: true },
        { id: 'k2', code: 'ENVIO', type: 'FIXED', value: 3000, active: false, emails: false, assistant: false }],
    }), []);
    expect(digest.productos[0]).toMatchObject({ stock: 5, categoria: 'Postres' });
    expect(digest.productos[1]).toMatchObject({ stock: 'sin límite', opciones: [{ nombre: 'S', precio: 'Bs 90', stock: 2 }, { nombre: 'M', precio: 'Bs 95', stock: 'sin límite' }] });
    expect(digest.archivados).toEqual([{ at: 0, nombre: 'Torta de limón' }]);
    expect(digest.categorias).toEqual([{ at: 0, nombre: 'Postres', productos: 1 }]);
    expect(digest.codigos).toEqual([{ at: 0, codigo: 'VERANO20', descuento: '20 %', activo: true, correos: false, asistente: true },
      { at: 1, codigo: 'ENVIO', descuento: 'Bs 30', activo: false, correos: false, asistente: false }]);
  });

  it('leaves the catalog lists out when the store rows could not be read', () => {
    const digest = storeDigest(state(), []);
    expect(digest).not.toHaveProperty('categorias');
    expect(digest).not.toHaveProperty('codigos');
    expect(digest).not.toHaveProperty('archivados');
    expect(digest.productos[0]).not.toHaveProperty('stock');
    expect(digest.productos[1]).toMatchObject({ opciones: true });
  });
});

it('shows a product\'s option groups, so a new colour can join «Color» (owner 2026-11-06)', () => {
  const digest = storeDigest(state({ products: [{ id: 'p3', name: 'Vestido', amount: 24000, description: '', imageUrls: [], options: true, stock: null, categoryId: null, currency: 'BOB',
    variants: [{ id: 'w1', name: 'Rojo / S', amount: 24000, stock: null, options: [{ name: 'Color', value: 'Rojo' }, { name: 'Talla', value: 'S' }] },
      { id: 'w2', name: 'Azul / S', amount: 24000, stock: 1, options: [{ name: 'Color', value: 'Azul' }, { name: 'Talla', value: 'S' }] }] }] }), []);
  expect(digest.productos[0]).toMatchObject({ grupos: ['Color', 'Talla'] });
});
