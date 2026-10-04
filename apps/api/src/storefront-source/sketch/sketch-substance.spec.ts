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
