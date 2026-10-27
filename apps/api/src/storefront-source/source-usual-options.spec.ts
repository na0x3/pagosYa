import { usualOptionKind, usualVariants, usualOptionsNote } from './source-usual-options';

/** Owner 2026-10-25: «yapi should build all alone… a shirt shop that has sizes, colors… without the user having to ask». */
describe('the usual options a clothing or shoe product gets without being asked', () => {
  it('knows clothing and shoes, and leaves everything else alone', () => {
    expect(usualOptionKind({ name: 'Polera Andina' })).toBe('clothing');
    expect(usualOptionKind({ name: 'Hoodie oversize' })).toBe('clothing');
    expect(usualOptionKind({ name: 'Pantalón de lino' })).toBe('clothing');
    expect(usualOptionKind({ name: 'Zapatillas urbanas' })).toBe('shoes');
    expect(usualOptionKind({ name: 'Botas de cuero' })).toBe('shoes');
    expect(usualOptionKind({ name: 'Vela de soya' })).toBeNull();
    expect(usualOptionKind({ name: 'Aceite de maní 1 L' })).toBeNull();
  });
  it('stays away from sizes it would only guess: kids, one size, accessories, a size already in the name', () => {
    expect(usualOptionKind({ name: 'Polera para bebé' })).toBeNull();
    expect(usualOptionKind({ name: 'Buzo infantil' })).toBeNull();
    expect(usualOptionKind({ name: 'Polera talla única' })).toBeNull();
    expect(usualOptionKind({ name: 'Gorra bordada' })).toBeNull();
    expect(usualOptionKind({ name: 'Bolso de cuero' })).toBeNull();
    expect(usualOptionKind({ name: 'Polera talla M' })).toBeNull();
  });
  it('gives clothing S–XL and shoes 36–43, each at the product price with no stock limit', () => {
    const shirt = usualVariants({ name: 'Polera Andina', amount: 12000 })!;
    expect(shirt.map(v => v.name)).toEqual(['S', 'M', 'L', 'XL']);
    expect(shirt.every(v => v.amount === 12000 && v.stock === null && v.options?.[0].name === 'Talla')).toBe(true);
    expect(usualVariants({ name: 'Zapatillas urbanas', amount: 30000 })!.map(v => v.name)).toEqual(['36', '37', '38', '39', '40', '41', '42', '43']);
    expect(usualVariants({ name: 'Vela de soya', amount: 5000 })).toBeUndefined();
  });
  it('adds colours only when the name lists two or more of them', () => {
    const shirt = usualVariants({ name: 'Polera negra, blanca y gris', amount: 10000 })!;
    expect(shirt).toHaveLength(12);
    expect(shirt[0].options).toEqual([{ name: 'Color', value: 'Negro' }, { name: 'Talla', value: 'S' }]);
    expect(usualVariants({ name: 'Polera negra', amount: 10000 })!.map(v => v.name)).toEqual(['S', 'M', 'L', 'XL']);
  });
  it('tells the merchant what it added and that stock is theirs to set', () => {
    expect(usualOptionsNote(['Polera Andina', 'Buzo Illimani'])).toMatch(/Polera Andina y Buzo Illimani[\s\S]*stock/);
    expect(usualOptionsNote([])).toBe('');
  });
});
