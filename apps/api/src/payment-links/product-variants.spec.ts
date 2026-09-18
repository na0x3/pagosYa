import { normalizeProductVariants, totalVariantStock } from './product-variants';
const option = (color: string, size: string, stock: number) => ({ name: '', amount: 12000, stock, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }] });

it('keeps independent stock and stable IDs for exact color/size combinations', () => {
  const saved = normalizeProductVariants([option('Azul', 'S', 0), option('Blanco', 'S', 5), option('Azul', 'M', 2)]);
  expect(saved.map(v => v.stock)).toEqual([0, 5, 2]);
  expect(totalVariantStock(saved)).toBe(7);
  const edited = normalizeProductVariants(saved.map(v => ({ id: v.id, name: v.name, amount: 13000 })), saved);
  expect(edited.map(v => [v.id, v.stock, v.options])).toEqual(saved.map(v => [v.id, v.stock, v.options]));
});

it('accepts six custom option dimensions and 256 combinations, rejects values beyond the limits', () => {
  const options = ['Material', 'Acabado', 'Largo', 'Grabado', 'Empaque', 'Modelo'].map(name => ({ name, value: 'A' }));
  const rows = Array.from({ length: 256 }, (_, i) => ({ name: '', amount: 100, stock: 0, options: options.map((o, n) => ({ ...o, value: n === 0 ? String(i) : o.value })) }));
  expect(normalizeProductVariants(rows)).toHaveLength(256);
  expect(() => normalizeProductVariants([...rows, rows[0]])).toThrow('256');
  expect(() => normalizeProductVariants([{ ...rows[0], options: [...options, { name: 'Extra', value: 'A' }] }])).toThrow('grupos');
});

it('rejects duplicate combinations and negative inventory', () => {
  expect(() => normalizeProductVariants([option('Azul', 'S', 1), option(' azúl ', 's', 2)])).toThrow('repetida');
  expect(() => normalizeProductVariants([option('Azul', 'S', -1)])).toThrow('stock');
});

it('clears a variant photo explicitly while retaining stock', () => {
  const saved = normalizeProductVariants([{ ...option('Azul', 'S', 3), imageUrl: '/v1/uploads/photo.webp' }]);
  const updated = normalizeProductVariants([{ id: saved[0].id, name: saved[0].name, amount: 12000, imageUrl: null }], saved);
  expect(updated[0].imageUrl).toBeUndefined();
  expect(updated[0].stock).toBe(3);
});
