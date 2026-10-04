import { catalogueDigest } from './sketch-catalogue-digest';

// Shaped like `data.items` and `data.categories` from sourceStoreConfigData: amount is an integer in minor
// units, a product points at its category by id, and its options live inside `variants`.
const categories = [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Dulces' }];
const items = [
  { id: 'p1', categoryId: 'c1', name: 'Pan de masa madre', description: 'Fermentado 24 h', amount: 4500, currency: 'BOB', tags: ['Nuevo'], stock: null, discountPercent: null, variants: [], specifications: [{ label: 'Peso', value: '800 g' }], highlights: [{ icon: 'leaf', label: 'Sin aditivos' }] },
  { id: 'p2', categoryId: 'c1', name: 'Focaccia romero', description: 'Con romero fresco', amount: 6200, currency: 'BOB', tags: [], stock: 0, discountPercent: 10, variants: [{ id: 'v1', name: 'Chica', amount: 6200, options: [{ name: 'Tamaño', value: 'Chica' }] }, { id: 'v2', name: 'Grande', amount: 9000, options: [{ name: 'Tamaño', value: 'Grande' }] }] },
  { id: 'p3', categoryId: 'c2', name: 'Torta de naranja', description: 'Naranja y almendra', amount: 12000, currency: 'BOB' },
];

it('carries what a copywriter needs, not just names', () => {
  // The sample interleaves categories, so look products up by name rather than by position.
  const sample = catalogueDigest(items, categories).items;
  const bread = sample.find(item => item.name === 'Pan de masa madre')!, focaccia = sample.find(item => item.name === 'Focaccia romero')!;
  expect(bread).toMatchObject({ name: 'Pan de masa madre', category: 'Panadería', price: '45.00 BOB', tags: ['Nuevo'] });
  expect(bread.description).toContain('24 h');
  expect(bread.facts).toEqual(expect.arrayContaining(['Peso: 800 g', 'Sin aditivos']));
  expect(focaccia.options).toEqual(['Tamaño: Chica, Grande']);
  expect(focaccia).toMatchObject({ soldOut: true, discountPercent: 10 });
});

it('summarises the whole catalogue, so a headline can be true about one too long to list', () => {
  const { totals } = catalogueDigest(items, categories);
  expect(totals).toMatchObject({ count: 3, priceLow: '45.00 BOB', priceHigh: '120.00 BOB' });
  expect(totals.categories).toEqual(['Panadería', 'Dulces']);
});

it('samples a long catalogue across its categories but still counts all of it', () => {
  const cats = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: `Cat ${i}` }));
  // Sorted by category, so a head-slice would show only the first category.
  const many = Array.from({ length: 500 }, (_, i) => ({ name: `Producto ${i}`, amount: 1000 + i, currency: 'BOB', categoryId: `c${Math.floor(i / 72) % 7}` }));
  const digest = catalogueDigest(many, cats);
  expect(digest.items.length).toBeLessThanOrEqual(20);
  expect(digest.totals.count).toBe(500);
  expect(new Set(digest.items.map(item => item.category)).size).toBe(7);
  expect(digest.totals.categories.length).toBeLessThanOrEqual(12);
});

it('does not compare prices across currencies', () => {
  const { totals } = catalogueDigest([{ name: 'a', amount: 100, currency: 'BOB' }, { name: 'b', amount: 300, currency: 'BOB' }, { name: 'c', amount: 99999, currency: 'USD' }], []);
  expect(totals.priceHigh).toBe('3.00 BOB');
});

it('bounds every text field a merchant can make long', () => {
  const [item] = catalogueDigest([{ name: 'x'.repeat(500), description: 'y'.repeat(2000), tags: Array(40).fill('t'), variants: Array(300).fill({ options: [{ name: 'a', value: 'b' }] }) }], []).items;
  expect(JSON.stringify(item).length).toBeLessThan(900);
});

it('survives junk without throwing', () => {
  const junk: unknown[] = [[], [null], [{}], [{ name: 42 }], [{ name: 'a', amount: 'abc', variants: 'x', tags: 5, specifications: [null, 3], highlights: {}, categoryId: {} }], [[], 'str', 7], undefined, null, 'nope', { length: 3 }];
  for (const bad of junk) {
    expect(() => catalogueDigest(bad as any, bad as any)).not.toThrow();
    expect(() => catalogueDigest(bad as any)).not.toThrow();
  }
  expect(catalogueDigest(undefined as any).totals.count).toBe(0);
});

// The digest is documented as total and sits on the generation path with merchant-controlled input.
it('survives a catalogue too large to spread into Math.min and a long single category without quadratic copying', () => {
  const rows = Array.from({ length: 150_000 }, (_, i) => ({ name: `P${i}`, amount: 100 + (i % 500), currency: 'BOB', categoryId: 'c1' }));
  const started = Date.now();
  const digest = catalogueDigest(rows, [{ id: 'c1', name: 'Todo' }]);
  expect(digest.totals.count).toBe(150_000);
  expect(digest.totals.priceLow).toBe('1.00 BOB');
  expect(digest.totals.priceHigh).toBe('5.99 BOB');
  expect(Date.now() - started).toBeLessThan(5000);
});
