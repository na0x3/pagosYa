import { countSubstance, substanceCaps } from './sketch-substance';
import { drawPageStructure } from './sketch-structure-draw';

it('counts what the store actually has', () => {
  const s = countSubstance({ products: [{ name: 'Pan', categoryId: 'c1' }, { name: 'Torta', categoryId: 'c2' }], categories: [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Dulces' }], photos: ['a.jpg'], brief: { businessType: 'Panadería de barrio', audience: 'Vecinos' }, reviews: 3 });
  expect(s).toEqual({ products: 2, photos: 1, categories: 2, briefWords: expect.any(Number), reviews: 3 });
  expect(s.briefWords).toBeGreaterThan(3);
});

// Review Focus 2: the 2026-10-04 store had zero products and still drew thirteen bands.
it('caps an empty store to a short page with no commerce bands', () => {
  const caps = substanceCaps({ products: 0, photos: 0, categories: 0, briefWords: 4, reviews: 0 });
  expect(caps.maxLength).toBeLessThanOrEqual(8);
  expect(caps.forbid).toEqual(expect.arrayContaining(['collections', 'gallery']));
  expect(caps.forbid).not.toContain('catalog');
  expect(caps.maxMedia).toBe(0);
});

it('lets a full store have the whole page', () => {
  const caps = substanceCaps({ products: 40, photos: 6, categories: 5, briefWords: 60, reviews: 4 });
  expect(caps.maxLength).toBe(14);
  expect(caps.forbid).toEqual([]);
  expect(caps.maxMedia).toBe(5);
});

it('forbids a gallery to a store with a single photo', () => {
  expect(substanceCaps({ products: 10, photos: 1, categories: 1, briefWords: 40, reviews: 4 }).forbid).toContain('gallery');
});

it('keeps a thin brief to a shorter page', () => {
  expect(substanceCaps({ products: 10, photos: 3, categories: 2, briefWords: 5, reviews: 4 }).maxLength).toBeLessThanOrEqual(9);
});

it('forbids collections when categories < 2 but allows catalog', () => {
  const caps = substanceCaps({ products: 10, photos: 3, categories: 1, briefWords: 40, reviews: 4 });
  expect(caps.forbid).toContain('collections');
  expect(caps.forbid).not.toContain('catalog');
});

it('stacks caps: zero products, one photo, and thin brief caps at 8', () => {
  const caps = substanceCaps({ products: 0, photos: 1, categories: 0, briefWords: 5, reviews: 4 });
  expect(caps.maxLength).toBe(8);
});

// The real shape: data.items rows carry categoryId only, resolved against data.categories. A fixture that used a
// `category` name here is what let this count read zero for every real store.
it('counts categories by resolving categoryId, ignoring duplicates, blanks, unknown ids and non-strings', () => {
  const s = countSubstance({
    products: [{ categoryId: 'c1' }, { categoryId: 'c1' }, { categoryId: '' }, { categoryId: 'gone' }, { categoryId: null }, { category: 'Panadería' }, {}],
    categories: [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Vacía' }, null, { name: 'sin id' }],
  });
  expect(s.categories).toBe(1);
});

it('a store with categorised products can draw collections', () => {
  const substance = countSubstance({
    products: [{ name: 'Pan', categoryId: 'c1' }, { name: 'Torta', categoryId: 'c2' }, { name: 'Café', categoryId: 'c2' }],
    categories: [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Dulces' }],
    photos: ['a.jpg', 'b.jpg'], brief: { x: 'una panadería de barrio con pan fresco cada mañana' }, reviews: 2,
  });
  expect(substance.categories).toBe(2);
  expect(substanceCaps(substance).forbid).not.toContain('collections');
  const drawn = Array.from({ length: 60 }, (_, seed) => drawPageStructure(substance, () => ((seed * 7919 + 13) % 1000) / 1000));
  expect(drawn.some(structure => structure.slots.some(slot => slot.type === 'collections'))).toBe(true);
});

it('forbids reviews to a store with no published reviews, and allows them otherwise', () => {
  expect(substanceCaps({ products: 10, photos: 3, categories: 2, briefWords: 40, reviews: 0 }).forbid).toContain('reviews');
  expect(substanceCaps({ products: 10, photos: 3, categories: 2, briefWords: 40, reviews: 2 }).forbid).not.toContain('reviews');
  expect(countSubstance({ products: [{ name: 'Pan' }], photos: [] }).reviews).toBe(0);
});

it('is total and never throws: undefined input', () => {
  expect(countSubstance(undefined)).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0, reviews: 0 });
});

it('is total and never throws: null input', () => {
  expect(countSubstance(null)).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0, reviews: 0 });
});

it('is total and never throws: non-array products field', () => {
  expect(countSubstance({ products: 'x' })).toEqual({ products: 0, photos: 0, categories: 0, briefWords: 0, reviews: 0 });
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
