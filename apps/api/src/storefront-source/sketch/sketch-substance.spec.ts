import { countSubstance, substanceCaps } from './sketch-substance';

it('counts what the store actually has', () => {
  const s = countSubstance({ products: [{ name: 'Pan', category: 'Panadería' }, { name: 'Torta', category: 'Dulces' }], photos: ['a.jpg'], brief: { businessType: 'Panadería de barrio', audience: 'Vecinos' } });
  expect(s).toEqual({ products: 2, photos: 1, categories: 2, briefWords: expect.any(Number) });
  expect(s.briefWords).toBeGreaterThan(3);
});

// Review Focus 2: the 2026-10-04 store had zero products and still drew thirteen bands.
it('caps an empty store to a short page with no commerce bands', () => {
  const caps = substanceCaps({ products: 0, photos: 0, categories: 0, briefWords: 4 });
  expect(caps.maxLength).toBeLessThanOrEqual(8);
  expect(caps.forbid).toEqual(expect.arrayContaining(['catalog', 'collections', 'gallery']));
  expect(caps.maxMedia).toBe(0);
});

it('lets a full store have the whole page', () => {
  const caps = substanceCaps({ products: 40, photos: 6, categories: 5, briefWords: 60 });
  expect(caps.maxLength).toBe(14);
  expect(caps.forbid).toEqual([]);
  expect(caps.maxMedia).toBe(5);
});

it('forbids a gallery to a store with a single photo', () => {
  expect(substanceCaps({ products: 10, photos: 1, categories: 1, briefWords: 40 }).forbid).toContain('gallery');
});

it('keeps a thin brief to a shorter page', () => {
  expect(substanceCaps({ products: 10, photos: 3, categories: 2, briefWords: 5 }).maxLength).toBeLessThanOrEqual(9);
});

it('forbids collections when categories < 2 but allows catalog', () => {
  const caps = substanceCaps({ products: 10, photos: 3, categories: 1, briefWords: 40 });
  expect(caps.forbid).toContain('collections');
  expect(caps.forbid).not.toContain('catalog');
});

it('stacks caps: zero products, one photo, and thin brief caps at 8', () => {
  const caps = substanceCaps({ products: 0, photos: 1, categories: 0, briefWords: 5 });
  expect(caps.maxLength).toBe(8);
});

it('counts categories with duplicates, blanks, and non-strings', () => {
  const s = countSubstance({
    products: [
      { category: 'Panadería' },
      { category: 'Panadería' },
      { category: '' },
      { category: '   ' },
      { category: null },
      {}
    ]
  });
  expect(s.categories).toBe(1);
});

it('is total and never throws: undefined input', () => {
  expect(countSubstance(undefined)).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0 });
});

it('is total and never throws: null input', () => {
  expect(countSubstance(null)).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0 });
});

it('is total and never throws: non-array products field', () => {
  expect(countSubstance({ products: 'x' })).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0 });
});

it('is total and never throws: array with non-object items', () => {
  const s = countSubstance({ products: [null, 5, {}] });
  expect(s.products).toBe(3);
  expect(s.categories).toBe(0);
});

it('is total and never throws: non-array photos field', () => {
  expect(countSubstance({ photos: {} }).photos).toBe(0);
});

it('is total and never throws: circular brief', () => {
  const obj: Record<string, unknown> = { brief: {} };
  obj.brief = obj;
  expect(() => countSubstance(obj)).not.toThrow();
});

it('counts words in string values only, not keys', () => {
  const s = countSubstance({
    brief: { businessType: 'Panadería de barrio', audience: 'Vecinos' }
  });
  expect(s.briefWords).toBe(4);
});
