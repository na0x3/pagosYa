import { CATALOG_EDIT_PROMPT, applyCatalogOps, catalogChangeEmpty, catalogOpSchema, discountValue, readCatalogOps, relinkCategories, stockValue, withCategoryMenuRenames, withoutCategoryMenuLinks, type CatalogOp } from './source-catalog-edit';
import type { LayoutBlock } from './source-section-library';
import type { StoreMenu } from './source-store-menu';
import type { StoreEditState } from './source-store-edit';

describe('catalog ops (spec 2026-11-05 creates anything part 2)', () => {
  it('reads only known kinds, every field a string', () => {
    expect(readCatalogOps([{ kind: 'product-add', at: -1, name: 'Torta', price: '120' }, { kind: 'product-delete', at: 0 }, null, 'x'])).toEqual([
      { kind: 'product-add', at: -1, name: 'Torta', price: '120', stock: '', text: '', category: '', photo: '', option: '', value: '' }]);
    expect(readCatalogOps({})).toEqual([]);
  });

  it('the schema is strict and requires every field', () => {
    const schema = catalogOpSchema();
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['kind', 'at', 'name', 'price', 'stock', 'text', 'category', 'photo', 'option', 'value']);
    expect(schema.properties.kind.enum).toContain('code-show');
  });

  it('reads stock words', () => {
    expect(stockValue('')).toBeUndefined();
    expect(stockValue('5')).toBe(5);
    expect(stockValue('12 unidades')).toBe(12);
    expect(stockValue('sin límite')).toBeNull();
    expect(stockValue('Agotado')).toBe(0);
    expect(stockValue('muchos')).toBeNaN();
  });

  it('reads a discount as a percent (1–99) or a Bs amount, never a bare number', () => {
    expect(discountValue('20 %')).toEqual({ type: 'PERCENT', value: 20 });
    expect(discountValue('15%')).toEqual({ type: 'PERCENT', value: 15 });
    expect(discountValue('Bs 30')).toEqual({ type: 'FIXED', value: 3000 });
    expect(discountValue('100 %')).toBeNull();
    expect(discountValue('20')).toBeNull();
  });

  it('the prompt never lets YAPI invent a price or a discount, and archives on «quita»', () => {
    expect(CATALOG_EDIT_PROMPT).toContain('Nunca inventes un precio');
    expect(CATALOG_EDIT_PROMPT).toContain('Nunca inventes el descuento');
    expect(CATALOG_EDIT_PROMPT).toContain('product-archive (quitar');
  });
});

const state = (over: Partial<StoreEditState> = {}): StoreEditState => ({ tagline: '', aboutText: '', contactPhone: '', contactEmail: '', policies: {}, faq: [],
  announcement: '', footer: '', links: [], popup: { on: false, title: '', text: '', button: '', discount: 0 }, catalogTitle: null,
  products: [
    { id: 'p1', name: 'Torta de chocolate', amount: 12000, description: '', imageUrls: [], options: false, stock: null, categoryId: 'c1', currency: 'BOB', variants: [] },
    { id: 'p2', name: 'Polera', amount: 9000, description: '', imageUrls: [], options: true, stock: 3, categoryId: null, currency: 'BOB',
      variants: [{ id: 'v1', name: 'S', amount: 9000, stock: 1 }, { id: 'v2', name: 'M', amount: 9500, stock: 2 }] }],
  archived: [{ id: 'p9', name: 'Torta de limón' }],
  categories: [{ id: 'c1', name: 'Tortas', count: 1 }, { id: 'c2', name: 'Postres', count: 0 }],
  codes: [{ id: 'k1', code: 'VERANO20', type: 'PERCENT', value: 20, active: true, emails: false, assistant: false },
    { id: 'k2', code: 'NAVIDAD', type: 'PERCENT', value: 10, active: false, emails: false, assistant: false }],
  ...over });
const op = (kind: CatalogOp['kind'], fields: Partial<CatalogOp> = {}): CatalogOp => ({ kind, at: -1, name: '', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '', ...fields });

describe('categories', () => {
  it('creates a category once, reusing a name the store has (accents and capitals aside)', () => {
    const { change, done } = applyCatalogOps(state(), [op('category-add', { name: 'Bebidas' }), op('category-add', { name: 'bebidas' }), op('category-add', { name: 'TORTAS' })]);
    expect(change.categories.create).toEqual([{ ref: 'new:0', name: 'Bebidas' }]);
    expect(done).toEqual(['creé la categoría «Bebidas»']);
  });

  it('renames, moves and removes, and the section links follow', () => {
    const { change, done } = applyCatalogOps(state(), [op('category-rename', { at: 0, name: 'Pasteles' }), op('category-move', { at: 1, value: '0' }), op('category-remove', { at: 1 })]);
    expect(change.categories.rename).toEqual([{ id: 'c1', name: 'Pasteles' }]);
    expect(change.categories.order).toEqual(['c2', 'c1']);
    expect(change.categories.remove).toEqual([{ id: 'c2', name: 'Postres' }]);
    expect(change.links).toEqual({ rename: [{ from: 'Tortas', to: 'Pasteles' }], remove: [{ id: 'c2', name: 'Postres' }] });
    expect(done).toEqual(['la categoría «Tortas» ahora se llama «Pasteles»', '«Postres» va primera en las categorías', 'quité la categoría «Postres»']);
  });

  it('refuses a rename onto another category\'s name, and the sixth new category', () => {
    const many = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6'].map(name => op('category-add', { name }));
    const { change, refused } = applyCatalogOps(state(), [op('category-rename', { at: 0, name: 'postres' }), ...many]);
    expect(change.categories.rename).toEqual([]);
    expect(change.categories.create).toHaveLength(5);
    expect(refused).toEqual(['Ya tienes una categoría «postres».', 'No creé la categoría «F6»: como mucho 5 categorías nuevas por pedido.']);
  });

  it('a number that is not on the list does nothing', () => {
    expect(catalogChangeEmpty(applyCatalogOps(state(), [op('category-remove', { at: 7 }), op('category-rename', { at: -1, name: 'X' })]).change)).toBe(true);
  });
});

describe('discount codes', () => {
  it('creates private codes with the merchant\'s discount, upper-cased and without spaces', () => {
    const { change, done } = applyCatalogOps(state(), [op('code-add', { name: 'novia10', value: '10 %' }), op('code-add', { name: '', value: 'Bs 30' }), op('code-add', { name: 'verano 15', value: '15 %' })]);
    expect(change.codes.create).toEqual([{ code: 'NOVIA10', type: 'PERCENT', value: 10 }, { code: 'DESCUENTO30', type: 'FIXED', value: 3000 }, { code: 'VERANO15', type: 'PERCENT', value: 15 }]);
    expect(done).toEqual(['el código NOVIA10 da 10 % de descuento y ya funciona en el pago', 'el código DESCUENTO30 da Bs 30 de descuento y ya funciona en el pago',
      'el código VERANO15 da 15 % de descuento y ya funciona en el pago']);
  });

  it('never invents a discount, and refuses a code it cannot save', () => {
    const { change, refused } = applyCatalogOps(state(), [op('code-add', { name: 'GRATIS', value: '' }), op('code-add', { name: 'MITAD', value: '120 %' }), op('code-add', { name: 'año10', value: '10 %' })]);
    expect(change.codes.create).toEqual([]);
    expect(refused).toEqual(['No creé el código GRATIS: dime el descuento, por ejemplo «20 %» o «Bs 30».', 'No creé el código MITAD: el descuento de un código va de 1 % a 99 % (con 120 % el pedido saldría gratis).',
      'No creé el código «año10»: usa de 3 a 32 letras, números, guion o guion bajo.']);
  });

  it('a taken code is refused, an off one with the same discount comes back on', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('code-add', { name: 'VERANO20', value: '20 %' }), op('code-add', { name: 'NAVIDAD', value: '10 %' })]);
    expect(change.codes.create).toEqual([]);
    expect(change.codes.flags).toEqual([{ id: 'k2', isActive: true }]);
    expect(refused).toEqual(['El código VERANO20 ya existe con 20 % de descuento: elige otro nombre.']);
    expect(done).toEqual(['volví a activar el código NAVIDAD (10 % de descuento)']);
  });

  it('turns codes off and on and shows them in the assistant', () => {
    const { change, done } = applyCatalogOps(state(), [op('code-off', { at: 0 }), op('code-on', { at: 1 }), op('code-show', { at: 1, option: 'asistente', value: 'sí' }), op('code-off', { at: 6 })]);
    expect(change.codes.flags).toEqual([{ id: 'k1', isActive: false }, { id: 'k2', isActive: true }, { id: 'k2', showInAssistant: true }]);
    expect(done).toEqual(['apagué el código VERANO20: ya no da descuento', 'volví a activar el código NAVIDAD', 'el asistente ahora ofrece el código NAVIDAD']);
  });

  it('the fourth new code is refused', () => {
    const { change, refused } = applyCatalogOps(state(), ['AAA1', 'BBB2', 'CCC3', 'DDD4'].map(name => op('code-add', { name, value: '5 %' })));
    expect(change.codes.create).toHaveLength(3);
    expect(refused).toEqual(['No creé el código DDD4: como mucho 3 códigos nuevos por pedido.']);
  });

  it('answering YAPI\'s question, a code the first request already made is skipped quietly', () => {
    expect(applyCatalogOps(state(), [op('code-add', { name: 'VERANO20', value: '20 %' })], [], { answering: true }).refused).toEqual([]);
  });
});

describe('products', () => {
  const photos = [{ url: '/v1/uploads/torta.jpg', from: 'mensaje' as const }];

  it('creates a product in a category made in the same request, with its options, and asks for the photo it was not sent', () => {
    const { change, done, notes } = applyCatalogOps(state(), [op('category-add', { name: 'Bebidas' }),
      op('product-add', { name: 'Limonada', text: 'Limonada de la casa.', category: 'bebidas', value: 'Chica | 15 |\nGrande | 25 | 4' })]);
    expect(change.products.create).toEqual([{ name: 'Limonada', description: 'Limonada de la casa.', amount: 1500, currency: 'BOB', imageUrls: [], stock: null, categoryRef: 'new:0',
      variants: [expect.objectContaining({ name: 'Chica', amount: 1500, stock: null }), expect.objectContaining({ name: 'Grande', amount: 2500, stock: 4 })] }]);
    expect(done).toEqual(['creé la categoría «Bebidas»', 'creé «Limonada» en Bebidas, con 2 opciones (Chica Bs 15, Grande Bs 25)']);
    expect(notes).toEqual(['Mándame la foto de «Limonada» cuando la tengas.']);
  });

  it('a single-price product takes its stock and the photo of the message', () => {
    const { change, notes } = applyCatalogOps(state(), [op('product-add', { name: 'Brownie', price: '25', stock: '10', photo: 'f0', category: 'Tortas' })], photos);
    expect(change.products.create[0]).toMatchObject({ name: 'Brownie', amount: 2500, stock: 10, imageUrls: ['/v1/uploads/torta.jpg'], variants: [], categoryRef: 'c1' });
    expect(notes).toEqual([]);
  });

  it('never creates a product without a price, twice, with one option, or past six', () => {
    const seven = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(name => op('product-add', { name: `Galleta ${name}`, price: '5' }));
    const { change, refused } = applyCatalogOps(state(), [op('product-add', { name: 'Flan' }), op('product-add', { name: 'torta de chocolate', price: '90' }),
      op('product-add', { name: 'Queque', price: 'barato' }), op('product-add', { name: 'Combo', value: 'Solo | 30 |' }), ...seven]);
    expect(change.products.create.map(product => product.name)).toEqual(['Galleta A', 'Galleta B', 'Galleta C', 'Galleta D', 'Galleta E', 'Galleta F']);
    expect(refused).toEqual(['No creé «Flan»: dime su precio.', 'Ya tienes «torta de chocolate» en la tienda.', 'No creé «Queque»: «barato» no es un precio.',
      expect.stringMatching(/^No creé «Combo»: Agrega por lo menos 2 opciones/), 'No creé «Galleta G»: como mucho 6 productos nuevos por pedido.']);
  });

  it('answering YAPI\'s question, a product the first request already made is skipped quietly', () => {
    const { change, refused } = applyCatalogOps(state(), [op('product-add', { name: 'Torta de chocolate', price: '120' }), op('product-add', { name: 'Flan', price: '40' })], [], { answering: true });
    expect(change.products.create.map(product => product.name)).toEqual(['Flan']);
    expect(refused).toEqual([]);
  });

  it('archives, restores and files a product', () => {
    const { change, done } = applyCatalogOps(state(), [op('product-archive', { at: 0 }), op('product-restore', { at: 0 }), op('product-category', { at: 1, category: 'Postres' }),
      op('product-category', { at: 0, category: 'tortas' })]);
    expect(change.products.update).toEqual([{ id: 'p1', status: 'ARCHIVED' }, { id: 'p9', status: 'ACTIVE' }, { id: 'p2', categoryRef: 'c2' }]);
    expect(done).toEqual(['archivé «Torta de chocolate»: ya no aparece en la tienda y puedes volver a activarlo en Productos', '«Torta de limón» vuelve a estar en la tienda', '«Polera» está en Postres']);
  });

  it('stock: a number, «sin límite» or «agotado»; a product with options is asked per option', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('product-stock', { at: 0, stock: 'agotado' }), op('product-stock', { at: 1, stock: '5' })]);
    expect(change.products.update).toEqual([{ id: 'p1', stock: 0 }]);
    expect(done).toEqual(['«Torta de chocolate» está agotado']);
    expect(refused).toEqual(['«Polera» tiene opciones: dime el stock de cada opción.']);
  });

  it('options: add, price, stock and remove by name, checked together', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('option-add', { at: 1, option: 'L', price: '100', stock: '3' }), op('option-price', { at: 1, option: 's', price: '85' }),
      op('option-stock', { at: 1, option: 'M', stock: 'sin límite' }), op('option-remove', { at: 1, option: 'S' }), op('option-price', { at: 0, option: 'Grande', price: '150' })]);
    expect(change.products.update).toEqual([{ id: 'p2', variantOps: [{ action: 'add', changes: { name: 'L', amount: 10000, stock: 3 } }, { action: 'update', variantId: 'v1', changes: { amount: 8500 } },
      { action: 'update', variantId: 'v2', changes: { stock: null } }, { action: 'delete', variantId: 'v1' }] }]);
    expect(done).toEqual(['«Polera» tiene la opción «L» a Bs 100', '«S» de «Polera» ahora cuesta Bs 85', '«M» de «Polera» ya no tiene límite de stock', 'quité la opción «S» de «Polera»']);
    expect(refused).toEqual(['«Torta de chocolate» no tiene opciones.']);
  });

  it('option changes that would leave fewer than two are refused as a whole', () => {
    const { change, done, refused } = applyCatalogOps(state(), [op('option-remove', { at: 1, option: 'S' })]);
    expect(change.products.update).toEqual([]);
    expect(done).toEqual([]);
    expect(refused[0]).toMatch(/^No cambié las opciones de «Polera»: /);
  });

  it('never files a product into a category this request removes', () => {
    const { change, refused } = applyCatalogOps(state(), [op('category-remove', { at: 1 }), op('product-category', { at: 0, category: 'Postres' })]);
    expect(change.products.update).toEqual([]);
    expect(refused).toEqual(['La categoría «Postres» se quita en este mismo pedido.']);
  });
});

describe('category links', () => {
  const blocks: LayoutBlock[] = [{ type: 'cover-split', title: 'Hola', cta: 'Ver tortas', link: 'category:Tortas' },
    { type: 'categories-tiles', items: [{ title: 'Tortas', link: 'category:Tortas' }, { title: 'Postres', link: 'category:Postres' }, { title: 'Bebidas', link: 'category:Bebidas' }] },
    { type: 'products-cards', cta2: 'Ver todo', link2: 'category:postres' }];

  it('a rename follows into links and tiles; a removal sends links to all products and drops its tile', () => {
    const next = relinkCategories(blocks, { rename: [{ from: 'Tortas', to: 'Pasteles' }], remove: [{ id: 'c2', name: 'Postres' }] });
    expect(next[0].link).toBe('category:Pasteles');
    expect(next[1].items).toEqual([{ title: 'Pasteles', link: 'category:Pasteles' }, { title: 'Bebidas', link: 'category:Bebidas' }]);
    expect(next[2].link2).toBe('products');
    expect(blocks[0].link).toBe('category:Tortas');
  });

  it('nothing to follow leaves the blocks as they are', () => {
    expect(relinkCategories(blocks, { rename: [], remove: [] })).toBe(blocks);
  });

  it('a removed category leaves the menu; a dropdown left empty goes', () => {
    const menu: StoreMenu = { style: 'dropdowns', groups: [
      { label: 'Tienda', links: [{ to: 'category:c2' }, { to: 'all' }], tiles: [{ title: 'Postres', image: 'https://x.test/p.jpg', to: 'category:c2' }] },
      { label: 'Postres', links: [{ to: 'category:c2' }] }] };
    expect(withoutCategoryMenuLinks(menu, ['c2'])).toEqual({ style: 'dropdowns', groups: [{ label: 'Tienda', links: [{ to: 'all' }], tiles: [] }] });
    expect(withoutCategoryMenuLinks(menu, [])).toBe(menu);
    expect(withoutCategoryMenuLinks(undefined, ['c2'])).toBeUndefined();
  });
});

describe('final review fixes (2026-11-06)', () => {
  it('a category the request removes is never used, whatever the order of the ops', () => {
    const { change, refused } = applyCatalogOps(state(), [op('product-category', { at: 0, category: 'Postres' }), op('product-add', { name: 'Flan', price: '40', category: 'Postres' }),
      op('category-remove', { at: 1 })]);
    expect(change.products.update).toEqual([]);
    expect(change.products.create).toEqual([]);
    expect(change.categories.remove).toEqual([{ id: 'c2', name: 'Postres' }]);
    expect(refused).toEqual(['La categoría «Postres» se quita en este mismo pedido.', 'La categoría «Postres» se quita en este mismo pedido.']);
  });

  it('answering, a product past the 40 shown is still found and never made twice', () => {
    const many = Array.from({ length: 41 }, (_, n) => ({ id: `q${n}`, name: n === 40 ? 'Brownie' : `Galleta ${n}`, amount: 500, description: '', imageUrls: [], options: false }));
    const { change, refused } = applyCatalogOps(state({ products: many }), [op('product-add', { name: 'Brownie', price: '20' })], [], { answering: true });
    expect(change.products.create).toEqual([]);
    expect(refused).toEqual([]);
  });

  it('categories or codes it could not read are never guessed', () => {
    const noCategories = applyCatalogOps(state({ categories: undefined }), [op('category-add', { name: 'Tortas' }), op('product-add', { name: 'Flan', price: '40', category: 'Tortas' })]);
    expect(catalogChangeEmpty(noCategories.change)).toBe(true);
    expect(noCategories.refused).toEqual(['No pude leer tus categorías: inténtalo de nuevo en un momento.', 'No pude leer tus categorías: inténtalo de nuevo en un momento.']);
    const noCodes = applyCatalogOps(state({ codes: undefined }), [op('code-add', { name: 'VERANO20', value: '20 %' })]);
    expect(noCodes.change.codes.create).toEqual([]);
    expect(noCodes.refused).toEqual(['No pude leer tus códigos de descuento: inténtalo de nuevo en un momento.']);
  });

  it('a new product takes only a photo sent with the message', () => {
    const photos = [{ url: '/v1/uploads/mio.jpg', from: 'mensaje' as const }, { url: '/v1/uploads/otro.jpg', from: 'producto' as const, product: 'Polera' }];
    const { change, notes } = applyCatalogOps(state(), [op('product-add', { name: 'Flan', price: '40', photo: 'f1' }), op('product-add', { name: 'Queque', price: '30', photo: 'f0' })], photos);
    expect(change.products.create.map(product => product.imageUrls)).toEqual([[], ['/v1/uploads/mio.jpg']]);
    expect(notes).toEqual(['Mándame la foto de «Flan» cuando la tengas.']);
  });
});

describe('option groups — colour and size from chat (owner 2026-11-06)', () => {
  const grouped = state({ products: [...state().products,
    { id: 'p3', name: 'Vestido', amount: 24000, description: '', imageUrls: [], options: true, stock: null, categoryId: null, currency: 'BOB',
      variants: [{ id: 'w1', name: 'Rojo', amount: 24000, stock: null, options: [{ name: 'Color', value: 'Rojo' }] },
        { id: 'w2', name: 'Azul', amount: 24000, stock: 1, options: [{ name: 'Color', value: 'Azul' }] }] }] });

  it('a colour group is saved as the store\'s «Color» options, so the page draws its dots', () => {
    const { change } = applyCatalogOps(state(), [op('product-add', { name: 'Polerón', value: 'Color: Rojo | 90 | 3\nColor: Azul | 90 |' })]);
    expect(change.products.create[0].variants).toEqual([expect.objectContaining({ name: 'Rojo', amount: 9000, stock: 3, options: [{ name: 'Color', value: 'Rojo' }] }),
      expect.objectContaining({ name: 'Azul', amount: 9000, stock: null, options: [{ name: 'Color', value: 'Azul' }] })]);
  });

  it('colour and size together are one line per combination, two groups', () => {
    const { change, done } = applyCatalogOps(state(), [op('product-add', { name: 'Polerón', value: 'Color: Rojo / Talla: S | 90 |\nColor: Rojo / Talla: M | 90 |\nColor: Azul / Talla: S | 95 | 2' })]);
    expect(change.products.create[0].variants.map(variant => [variant.name, variant.options])).toEqual([
      ['Rojo / S', [{ name: 'Color', value: 'Rojo' }, { name: 'Talla', value: 'S' }]], ['Rojo / M', [{ name: 'Color', value: 'Rojo' }, { name: 'Talla', value: 'M' }]],
      ['Azul / S', [{ name: 'Color', value: 'Azul' }, { name: 'Talla', value: 'S' }]]]);
    expect(done[0]).toBe('creé «Polerón», con 3 opciones (Rojo / S Bs 90, Rojo / M Bs 90, Azul / S Bs 95)');
  });

  it('lines with different groups, or some with a group and some without, are refused', () => {
    const { change, refused } = applyCatalogOps(state(), [op('product-add', { name: 'Polerón', value: 'Color: Rojo | 90\nTalla: S | 90' }),
      op('product-add', { name: 'Gorra', value: 'Color: Rojo | 50\nAzul | 50' })]);
    expect(change.products.create).toEqual([]);
    expect(refused[0]).toMatch(/^No creé «Polerón»: /);
    expect(refused[1]).toBe('No creé «Gorra»: escribe el grupo en todas las opciones («Color: Rojo») o en ninguna.');
  });

  it('a new colour joins the product\'s colour group; one is found by «Color: Rojo» or «Rojo»', () => {
    const { change } = applyCatalogOps(grouped, [op('option-add', { at: 2, option: 'Verde', price: '250' }), op('option-price', { at: 2, option: 'Color: Rojo', price: '230' }),
      op('option-stock', { at: 2, option: 'azul', stock: '4' })]);
    expect(change.products.update).toEqual([{ id: 'p3', variantOps: [{ action: 'add', changes: { name: 'Verde', amount: 25000, stock: null, options: [{ name: 'Color', value: 'Verde' }] } },
      { action: 'update', variantId: 'w1', changes: { amount: 23000 } }, { action: 'update', variantId: 'w2', changes: { stock: 4 } }] }]);
  });

  it('a group on a product whose options have none is dropped, so the product stays buyable', () => {
    const { change } = applyCatalogOps(state(), [op('option-add', { at: 1, option: 'Talla: L', price: '100' })]);
    expect(change.products.update[0].variantOps).toEqual([{ action: 'add', changes: { name: 'L', amount: 10000, stock: null } }]);
  });

  it('the prompt shows how to write a colour group and a colour × size combination', () => {
    expect(CATALOG_EDIT_PROMPT).toContain('Color: Rojo / Talla: S | 90 | 3');
  });
});

it('a renamed category takes its menu words along, only where they said its old name (live NOA 2026-11-06)', () => {
  const menu: StoreMenu = { style: 'panel', groups: [
    { label: 'Novias', links: [{ label: 'Novias', to: 'category:c1' }], tilesTitle: 'Vestidos de novia', tiles: [{ title: 'Novias', image: 'https://x.test/n.jpg', to: 'category:c1' }, { title: 'Vestidos de novia', image: 'https://x.test/v.jpg', to: 'category:c1' }] },
    { label: 'Info', links: [{ label: 'Novias', to: 'page:about' }] }] };
  expect(withCategoryMenuRenames(menu, [{ id: 'c1', from: 'Novias', to: 'Bridal' }])).toEqual({ style: 'panel', groups: [
    { label: 'Bridal', links: [{ label: 'Bridal', to: 'category:c1' }], tilesTitle: 'Vestidos de novia', tiles: [{ title: 'Bridal', image: 'https://x.test/n.jpg', to: 'category:c1' }, { title: 'Vestidos de novia', image: 'https://x.test/v.jpg', to: 'category:c1' }] },
    { label: 'Info', links: [{ label: 'Novias', to: 'page:about' }] }] });
  expect(withCategoryMenuRenames(menu, [])).toBe(menu);
});

it('a removed category leaves every category section, the mosaic too (live NOA 2026-11-06)', () => {
  const mosaic: LayoutBlock[] = [{ type: 'categories-mosaic', items: [{ title: 'Novias', link: 'category:Novias' }, { title: 'Noche', link: 'category:Noche' }] }];
  expect(relinkCategories(mosaic, { rename: [], remove: [{ id: 'c1', name: 'Novias' }] })[0].items).toEqual([{ title: 'Noche', link: 'category:Noche' }]);
});
