import { normalizeProductVariants, totalVariantStock } from './product-variants';
const option = (color: string, size: string, stock: number) => ({ name: '', amount: 12000, stock, options: [{ name: 'Color', value: color }, { name: 'Talla', value: size }] });
const A = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg';
const B = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';
const C = '/v1/uploads/33333333-3333-3333-3333-333333333333.jpg';

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

it('stores a deduped photo set per variant and mirrors the first photo in imageUrl', () => {
  const [v] = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B, A] }, option('Azul', 'S', 1)]);
  expect(v.imageUrls).toEqual([A, B]);
  expect(v.imageUrl).toBe(A);
});

it('rejects more than 8 photos in one set', () => {
  const nine = Array.from({ length: 9 }, (_, i) => `/v1/uploads/${String(i).repeat(8)}-1111-1111-1111-111111111111.jpg`);
  expect(() => normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: nine }, option('Azul', 'S', 1)])).toThrow('8');
});

it('keeps a legacy single-photo variant as it is', () => {
  const [v] = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrl: A }, option('Azul', 'S', 1)]);
  expect(v.imageUrl).toBe(A);
  expect(v.imageUrls).toBeUndefined();
});

it('preserves the saved set when an edit omits both photo fields, and clears it on empty/null', () => {
  const saved = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B] }, option('Azul', 'S', 1)]);
  const keep = normalizeProductVariants(saved.map(v => ({ id: v.id, name: v.name, amount: v.amount })), saved);
  expect(keep[0].imageUrls).toEqual([A, B]);
  const cleared = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrls: [] } : {}) })), saved);
  expect(cleared[0].imageUrls).toBeUndefined();
  expect(cleared[0].imageUrl).toBeUndefined();
});

it('lets a legacy imageUrl edit win over a stale set, and imageUrl:null clears both', () => {
  const saved = normalizeProductVariants([{ ...option('Rojo', 'S', 1), imageUrls: [A, B] }, option('Azul', 'S', 1)]);
  const swapped = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: C } : {}) })), saved);
  expect(swapped[0].imageUrl).toBe(C);
  expect(swapped[0].imageUrls).toBeUndefined();
  const same = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: A } : {}) })), saved);
  expect(same[0].imageUrls).toEqual([A, B]);
  const gone = normalizeProductVariants(saved.map((v, i) => ({ id: v.id, name: v.name, amount: v.amount, ...(i === 0 ? { imageUrl: null } : {}) })), saved);
  expect(gone[0].imageUrl).toBeUndefined();
  expect(gone[0].imageUrls).toBeUndefined();
});
