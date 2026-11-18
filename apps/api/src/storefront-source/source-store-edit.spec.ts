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

  it('turns the floating WhatsApp button on and off, asking for a number first (owner 2026-11-08)', () => {
    expect(storeDigest(state({ whatsappButton: true }), []).contacto).toMatchObject({ botonWhatsapp: true });
    expect(storeDigest(state({ contactPhone: '', whatsappButton: true }), []).contacto).toMatchObject({ botonWhatsapp: false });
    const off = applyStoreOps(state({ whatsappButton: true }), [op('contact', 'whatsapp', 'off')]);
    expect(off.change.whatsappButton).toBe(false);
    expect(off.done[0]).toContain('quité el botón de WhatsApp');
    expect(storeChangeEmpty(off.change)).toBe(false);
    expect(applyStoreOps(state({ whatsappButton: true }), [op('contact', 'whatsapp', 'on')]).change.whatsappButton).toBeUndefined();
    const noNumber = applyStoreOps(state({ contactPhone: '', whatsappButton: false }), [op('contact', 'whatsapp', 'on')]);
    expect(noNumber.change.whatsappButton).toBeUndefined();
    expect(noNumber.refused[0]).toContain('necesito tu número');
    // A number given in the same message is enough.
    const withNumber = applyStoreOps(state({ contactPhone: '', whatsappButton: false }), [op('contact', 'phone', '+591 71234567'), op('contact', 'whatsapp', 'on')]);
    expect(withNumber.change).toMatchObject({ store: { contactPhone: '+591 71234567' }, whatsappButton: true });
    expect(readStoreOps([op('contact', 'whatsapp', 'on')])).toHaveLength(1);
    // Already on but no number until now: the reply says the button now shows (live 2026-11-08 NOA only mentioned the phone).
    const firstNumber = applyStoreOps(state({ contactPhone: '', whatsappButton: true }), [op('contact', 'phone', '+591 71234567'), op('contact', 'whatsapp', 'on')]);
    expect(firstNumber.change.whatsappButton).toBeUndefined();
    expect(firstNumber.done).toContain('agregué el botón de WhatsApp');
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
  it('sets all game prizes by chat, with or without their chances (owner 2026-11-09)', () => {
    const all = applyStoreOps(state(), [op('popup', 'prizes', '10, 15, 20, 30')]);
    expect(all.change.popupGame).toEqual({ prizes: [{ percent: 10 }, { percent: 15 }, { percent: 20 }, { percent: 30 }] });
    expect(all.done).toEqual(['tu juego ahora da 10 %, 15 %, 20 % y 30 % de descuento (los premios grandes salen menos)']);
    const odds = applyStoreOps(state(), [op('popup', 'prizes', '10:60, 30:40')]);
    expect(odds.change.popupGame).toEqual({ prizes: [{ percent: 10, chance: 60 }, { percent: 30, chance: 40 }] });
    expect(odds.done).toEqual(['tu juego ahora da 10 % (60 % de las veces) y 30 % (40 % de las veces) de descuento']);
    for (const bad of ['10', '5,10,15,20,25,30,35', '10, 60', '10, 10', '10:50, 30:20', '10:50, 30'])
      expect(applyStoreOps(state(), [op('popup', 'prizes', bad)]).refused).toEqual(['Los premios van de 2 a 6, cada uno de 1 % a 50 %, sin repetir; si das las probabilidades, deben sumar 100.']);
    expect(readStoreOps([op('popup', 'prizes', '10, 20')])).toHaveLength(1);
  });
  it('changes the card shape, the contact asked for and the interests (spec 2026-11-10 rasca y elige)', () => {
    expect(applyStoreOps(state(), [op('popup', 'shape', 'lata')]).change.popupGame).toEqual({ shape: 'can' });
    expect(applyStoreOps(state(), [op('popup', 'shape', 'galleta')]).done).toEqual(['la tarjeta para rascar ahora tiene forma de galleta']);
    expect(applyStoreOps(state(), [op('popup', 'shape', 'sin forma')]).change.popupGame).toEqual({ shape: null });
    expect(applyStoreOps(state(), [op('popup', 'shape', 'cohete')]).refused).toEqual(['Las formas son: galleta, lata, botella, taza, flor, prenda, caja y bolsa.']);
    expect(applyStoreOps(state(), [op('popup', 'contact', 'correo')]).change.popupGame).toEqual({ contact: 'email' });
    expect(applyStoreOps(state(), [op('popup', 'contact', 'WhatsApp')]).done).toEqual(['tu juego ahora pide el WhatsApp para guardar el premio']);
    expect(applyStoreOps(state(), [op('popup', 'contact', 'paloma')]).refused).toEqual(['El juego puede pedir WhatsApp o correo.']);
    expect(applyStoreOps(state(), [op('popup', 'interests', '¿Qué buscas?|Para mí|Para regalar|Para la oficina')]).change.popupGame).toEqual({ interests: { text: '¿Qué buscas?', answers: [{ label: 'Para mí', icon: '' }, { label: 'Para regalar', icon: '' }, { label: 'Para la oficina', icon: '' }] } });
    expect(applyStoreOps(state(), [op('popup', 'interests', 'sin intereses')]).change.popupGame).toEqual({ interests: null });
    expect(applyStoreOps(state(), [op('popup', 'interests', '¿Qué?|una')]).refused).toEqual(['Escribe la pregunta y 2 a 6 respuestas cortas.']);
    expect(applyStoreOps(state(), [op('popup', 'question', '¿Para quién?|Para mí|Para regalar')]).change.popupGame).toEqual({ question: { text: '¿Para quién?', answers: ['Para mí', 'Para regalar'] }, interests: { text: '¿Para quién?', answers: [{ label: 'Para mí', icon: '' }, { label: 'Para regalar', icon: '' }] } });
  });
  it('turns the popup into a game, moves the top prize, sets or drops the question (spec 2026-11-09)', () => {
    expect(applyStoreOps(state(), [op('popup', 'game', 'scratch')]).change.popupGame).toEqual({ game: 'scratch' });
    expect(applyStoreOps(state(), [op('popup', 'game', 'scratch')]).change.popup).toEqual({ signupEnabled: true });
    expect(applyStoreOps(state(), [op('popup', 'game', 'wheel')]).done).toEqual(['tu ventana de suscripción ahora es una ruleta con premios de 5 %, 10 %, 15 % y 20 % de descuento']);
    expect(applyStoreOps(state(), [op('popup', 'game', 'off')]).change.popupGame).toEqual({ game: 'off' });
    expect(applyStoreOps(state(), [op('popup', 'game', 'tragamonedas')]).refused).toEqual(['Los juegos son rasca y gana y ruleta.']);
    expect(applyStoreOps(state(), [op('popup', 'prize', '25 %')]).change.popupGame).toEqual({ topPrize: 25 });
    expect(applyStoreOps(state(), [op('popup', 'prize', '80')]).refused).toEqual(['El premio mayor va de 5 % a 50 %.']);
    expect(applyStoreOps(state(), [op('popup', 'question', 'sin pregunta')]).change.popupGame).toEqual({ question: null, interests: null });
    expect(applyStoreOps(state(), [op('popup', 'question', '¿Cuál es tu sabor favorito?|Chocolate|Vainilla|Frutilla')]).change.popupGame).toMatchObject({ question: { text: '¿Cuál es tu sabor favorito?', answers: ['Chocolate', 'Vainilla', 'Frutilla'] } });
    expect(applyStoreOps(state(), [op('popup', 'question', 'solo texto')]).refused).toEqual(['Escribe la pregunta y 2 a 4 respuestas.']);
    expect(storeChangeEmpty(applyStoreOps(state(), [op('popup', 'game', 'wheel')]).change)).toBe(false);
    expect(applyStoreOps(state(), [op('popup', 'game', 'wheel'), op('popup', 'prize', '30 %')]).change.popupGame).toEqual({ game: 'wheel', topPrize: 30 });
    expect(readStoreOps([op('popup', 'game', 'wheel'), op('popup', 'prize', '20'), op('popup', 'question', 'x|a|b')])).toHaveLength(3);
  });
  it('switches the popup look: next, by name, photo and back (spec 2026-11-09)', () => {
    const photos = [{ url: '/v1/uploads/a1b2.jpg', from: 'mensaje' as const }];
    const styled = state({ popup: { on: true, title: 'Únete', text: '', button: 'Quiero', discount: 0, look: 'postal', previous: true } });
    const next = applyStoreOps(styled, [op('popup', 'redesign')]);
    expect(next.change.popupLook).toEqual({ action: 'look', look: 'revista' });
    expect(next.done).toEqual(['tu ventana de suscripción ahora tiene el estilo Revista']);
    expect(applyStoreOps(styled, [op('popup', 'style', 'Clásica')]).change.popupLook).toEqual({ action: 'look', look: 'clasica' });
    expect(applyStoreOps(styled, [op('popup', 'style', 'postal')]).done).toEqual(['tu ventana de suscripción ya tiene el estilo Postal']);
    expect(applyStoreOps(styled, [op('popup', 'style', 'ruleta')]).refused).toEqual(['Los estilos de la ventana son: Clásica, Portada, Cartel, Postal, Revista y Etiqueta.']);
    expect(applyStoreOps(styled, [op('popup', 'photo', 'f0')], photos).change.popupLook).toEqual({ action: 'photo', photo: '/v1/uploads/a1b2.jpg' });
    expect(applyStoreOps(styled, [op('popup', 'undo')]).change.popupLook).toEqual({ action: 'undo' });
    expect(applyStoreOps(state(), [op('popup', 'undo')]).refused).toEqual(['Tu ventana de suscripción no tiene un estilo anterior al que volver.']);
    expect(storeChangeEmpty(next.change)).toBe(false);
    expect(readStoreOps([op('popup', 'redesign'), op('popup', 'undo'), op('popup', 'style', 'postal'), op('popup', 'photo', 'f0')])).toHaveLength(4);
  });

  it('changes a product name, price, description and photo; refuses a price on a product with options', () => {
    const photos = [{ url: '/v1/uploads/nueva.jpg', from: 'mensaje' as const }];
    const { change, refused } = applyStoreOps(state(), [op('product', 'price', '25', { at: 0 }), op('product', 'name', 'Brownie vegano', { at: 0 }), op('product', 'photo', 'f0', { at: 0 }),
      op('product', 'price', '100', { at: 1 }), op('product', 'photo', 'f3', { at: 0 }), op('product', 'name', 'x', { at: 9 })], photos);
    expect(change.products).toEqual([{ id: 'p1', amount: 2500, name: 'Brownie vegano', imageUrls: ['/v1/uploads/nueva.jpg', '/v1/uploads/a.jpg'] }]);
    expect(refused).toHaveLength(2);
  });

  // Browse catalogue (spec 2026-11-06): «ponlo como Nike» changes the catalogue's style in the quick edit, never the slow edit.
  it('changes the catalogue style, saying when it already is that one', () => {
    const { change, done, refused } = applyStoreOps(state({ filterStyle: 'bar' }), [op('catalog', 'filters', 'browse')]);
    expect(change.filterStyle).toBe('browse');
    expect(done[0]).toContain('filtros a la izquierda');
    expect(refused).toEqual([]);
    expect(storeChangeEmpty(change)).toBe(false);
    expect(applyStoreOps(state({ filterStyle: 'browse' }), [op('catalog', 'filters', 'browse')]).done[0]).toContain('ya');
    expect(applyStoreOps(state(), [op('catalog', 'filters', 'raro')]).change.filterStyle).toBeUndefined();
    expect(storeDigest(state({ filterStyle: 'chips' }), [])).toHaveProperty('filtros', 'chips');
  });

  // Miga Dorada 2026-11-07: «que el footer sea rosado» changed the whole store's accent and the footer stayed black.
  it('colours the header, the bar or the footer on their own, never the store accent', () => {
    const { change, done, refused } = applyStoreOps(state({ announcement: 'Envío gratis' }), [op('footer', 'color', '#F4C2CC', { title: 'rosado' }),
      op('header', 'color', '#1d3b2a', { title: 'verde oscuro' }), op('announcement', 'color', '#ffd400', { title: '' })]);
    expect(change.parts).toEqual({ footer: '#f4c2cc', header: '#1d3b2a', announce: '#ffd400' });
    expect(done).toEqual(['el pie de página ahora es rosado', 'el encabezado ahora es verde oscuro', 'la cinta de arriba ahora es del color que pediste']);
    expect(refused).toEqual([]);
    expect(storeChangeEmpty(change)).toBe(false);
    // Already that colour, back to the template's, a bad colour, a bar the store does not show.
    expect(applyStoreOps(state({ parts: { footer: '#f4c2cc' } }), [op('footer', 'color', '#f4c2cc', { title: 'rosado' })]).done[0]).toContain('ya es rosado');
    expect(applyStoreOps(state({ parts: { footer: '#f4c2cc' } }), [op('footer', 'color', '')]).change.parts).toEqual({ footer: '' });
    expect(applyStoreOps(state(), [op('footer', 'color', 'rosado')]).refused[0]).toContain('No entendí el color');
    expect(applyStoreOps(state(), [op('announcement', 'color', '#ffd400')]).refused[0]).toContain('no tiene cinta');
    expect(applyStoreOps(state(), [op('footer', 'color', '#abc')]).change.parts).toEqual({ footer: '#aabbcc' });
    expect(storeDigest(state({ parts: { footer: '#f4c2cc' } }), []).colores).toEqual({ encabezado: 'el de la plantilla', cinta: 'el de la plantilla', pie: '#f4c2cc' });
  });

  it('changes how the footer looks to one the template offers', () => {
    const offered = { footerStyle: 'ticker', footerStyles: ['columns', 'bigname', 'ticker', 'wordmark'] };
    const { change, done } = applyStoreOps(state(offered), [op('footer', 'style', 'bigname')]);
    expect(change.footerStyle).toBe('bigname');
    expect(done[0]).toContain('nombre de tu tienda bien grande');
    expect(storeChangeEmpty(change)).toBe(false);
    expect(applyStoreOps(state(offered), [op('footer', 'style', 'mega')]).change.footerStyle).toBeUndefined();
    expect(applyStoreOps(state(offered), [op('footer', 'style', 'ticker')]).change.footerStyle).toBeUndefined();
    expect(applyStoreOps(state(), [op('footer', 'style', 'bigname')]).change.footerStyle).toBeUndefined();
    expect(storeDigest(state(offered), []).pie_estilo).toEqual({ actual: 'ticker', otros: expect.arrayContaining([expect.objectContaining({ id: 'bigname' })]) });
    expect(storeDigest(state(), [])).not.toHaveProperty('pie_estilo');
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
