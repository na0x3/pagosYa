import { CATALOG_EDIT_PROMPT, applyCatalogOps, catalogChangeEmpty, catalogOpSchema, discountValue, readCatalogOps, stockValue, type CatalogOp } from './source-catalog-edit';
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
    expect(refused).toEqual(['No creé el código GRATIS: dime el descuento, por ejemplo «20 %» o «Bs 30».', 'No creé el código MITAD: dime el descuento, por ejemplo «20 %» o «Bs 30».',
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
