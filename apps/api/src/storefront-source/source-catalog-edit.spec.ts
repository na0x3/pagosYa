import { CATALOG_EDIT_PROMPT, catalogOpSchema, discountValue, readCatalogOps, stockValue } from './source-catalog-edit';

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
